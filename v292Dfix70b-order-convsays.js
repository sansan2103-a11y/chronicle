// =====================================================================
// Chronicle TRPG - v292Dfix70b: dialogue-log order from _convSays
// ---------------------------------------------------------------------
// 真因 (root cause):
//   v292Dfix70-dialogue-order.js は会話ログのカードを「時系列順」に並べ替える
//   が、その順序インデックス(buildOrderIndex)を本文(narrative)からの「」抽出で
//   作っている。ところが v292Dfix169(案B) 以降、会話ログのカードは本文ではなく
//   turn._convSays(専用の2段階生成)から作られる。_convSays の発話文は本文に
//   そのままは載らないため、多くのカードが fix70 の順序インデックスに一致せず
//   「10000+DOM順」バケットに落ち、一部だけ一致して引き抜かれる。結果として
//   最新ターンの発話が先頭に来る等、時系列が崩れる。
//
// 修正方針:
//   会話ログの実ソースである _convSays(+playerText) からターン順に順序インデックスを
//   作り直し、fix70 の(誤った)並べ替えの「後で」正しい順序に再整列する。
//   実装は __v292Dfix66.repair を最外でラップし、内側(fix70 の並べ替え含む)を
//   走らせた直後に正しい順へ再整列する。これで repair が走る毎に同期的に正順へ収束し、
//   チラつきが出ない。万一 repair を経由しない並べ替えが起きても、軽量な
//   インターバル(順序が既に正しければ何もしない=フリッカー無し)で保険をかける。
//
//   ※ fix70 本体(repo)を書き換えず、純追加 hook で上書きする(fix64/66 と同方式)。
// =====================================================================
(function(){
  'use strict';
  var TAG = '[v292Dfix70b:order-convsays]';

  // ---------------------------------------------------------------------
  // v292Dfix64(conversation-log-restore)の停止:
  //   fix64 は会話ログを独自に「復元」し、最新ターンの発話カードを先頭(最上部)に
  //   再追加し続ける旧世代レンダラー。現在は fix66(renderhook-repair)+ genConvLog
  //   が会話ログを完全に賄っており、fix64 の復元は冗長。むしろ fix64 が独立サイクルで
  //   最新カードを先頭へ戻すため、時系列の並べ替えと毎秒競合し「最新が上に来る」状態と
  //   チラつきの原因になっている。fix64 が公開する停止フラグを落として復元を止める
  //   (= 引き算)。fix64 のファイル自体は読み込んだままなので avatar/preprocess 等の
  //   ユーティリティ参照は維持される。
  // ---------------------------------------------------------------------
  function disableFix64(){
    try { if (window.__v292Dfix64Active !== false) window.__v292Dfix64Active = false; } catch(e){}
  }
  disableFix64();

  function norm(s){
    return String(s == null ? '' : s)
      .replace(/<[^>]+>/g, '')
      .replace(/[「」『』（）()\s　…⋯。、！？!?\.,]/g, '');
  }

  function getState(){
    try { if (window.S && window.S.turns) return window.S; } catch(e){}
    try {
      var raw = localStorage.getItem('chr6');
      if (raw){ var p = JSON.parse(raw); if (p && p.turns) return p; }
    } catch(e){}
    return { turns: [] };
  }

  // 会話ログの実ソース(_convSays + playerText)からターン順の順序インデックスを作る。
  function buildOrderIndex(){
    var turns = getState().turns || [];
    var oi = {}, idx = 0;
    turns.forEach(function(t){
      if (t && t.playerText){
        var pn = norm(t.playerText);
        if (pn && !(pn in oi)) oi[pn] = idx++;
      }
      if (t && Array.isArray(t._convSays)){
        t._convSays.forEach(function(cs){
          var n = norm(cs && (cs.say || cs.text));
          if (n && !(n in oi)) oi[n] = idx++;
        });
      }
    });
    return oi;
  }

  // 既に時系列順なら何もしない(=DOM を触らない=フリッカー無し)。
  function reorder(){
    try {
      var stream = document.getElementById('dialogue-stream');
      if (!stream) return 0;
      var oi = buildOrderIndex();
      var cards = Array.prototype.slice.call(stream.querySelectorAll('.v292-dlg-card'));
      if (cards.length < 2) return 0;
      var dec = cards.map(function(c, di){
        var e = c.querySelector('.dlg-text');
        var n = norm(e ? e.textContent : '');
        return { c: c, o: (n in oi) ? oi[n] : (10000 + di), di: di };
      });
      // 並べ替えが要るか判定(昇順に崩れがあるか)。崩れが無ければ DOM を触らない。
      var needs = false;
      for (var i = 1; i < dec.length; i++){
        if (dec[i].o < dec[i - 1].o){ needs = true; break; }
      }
      if (!needs) return 0;
      dec.sort(function(a, b){ return a.o !== b.o ? a.o - b.o : a.di - b.di; });
      dec.forEach(function(d){ stream.appendChild(d.c); });
      return dec.length;
    } catch(e){
      try { console.warn(TAG, 'reorder err:', e && e.message); } catch(_){}
      return 0;
    }
  }

  // __v292Dfix66.repair を最外でラップ。内側(fix70 の並べ替え含む)実行後に正順へ収束。
  function install(){
    try {
      if (!window.__v292Dfix66 || typeof window.__v292Dfix66.repair !== 'function') return false;
      if (window.__v292Dfix66.repair.__fix70b) return true;
      var inner = window.__v292Dfix66.repair;
      var wrapped = function(){
        var r = inner.apply(this, arguments);
        reorder();
        return r;
      };
      wrapped.__fix70b = true;
      window.__v292Dfix66.repair = wrapped;
      try { console.log(TAG, 'wrap installed'); } catch(_){}
      return true;
    } catch(e){ return false; }
  }

  // __v292Dfix66 が出来るまで待ってラップを掛ける。
  (function waitInstall(){
    if (install()) return;
    setTimeout(waitInstall, 300);
  })();

  // 保険: repair を経由しない並べ替えが起きても、順序が崩れていれば直す。
  // 既に正しければ reorder() は DOM を触らない(フリッカー無し)。
  // また repair が別パッチで差し替えられてラップが外れた場合は再装着。
  setInterval(function(){
    disableFix64();
    try {
      if (window.__v292Dfix66 && typeof window.__v292Dfix66.repair === 'function' &&
          !window.__v292Dfix66.repair.__fix70b){
        install();
      }
    } catch(e){}
    reorder();
  }, 1500);

  // 公開(デバッグ/手動再整列用)
  window.__v292Dfix70b = { reorder: reorder, buildOrderIndex: buildOrderIndex };
  try { console.log(TAG, 'loaded'); } catch(_){}
})();
