// =====================================================================
// Chronicle TRPG - v292Dfix405: 状態(fix77)の鮮度＝毎ターン確実な再注入＋一覧の即時反映
//   背景(2026-07-10・実機計測): fix77のstateExt(モデルへ<state>出力を促すEMIT+現在状態
//     ブロック)は Planner._extensions に登録されているが、この経路は現行エンジンで【死んで
//     いる】=注入されない。モデルは履歴の見様見真似で<state>を出すため、出さないターンが
//     あり(実測: 17ターン中storeがT13で停止)、キャラ一覧の状態が古くなる。
//   対策(コア不触・keeper相乗り):
//     (a) fix379c keeperレジストリ(window.__f379reg・Planner.build直ラップで毎ターン注入)へ
//         prio1で「EMIT(fix77と同一文言の複製)＋現在状態ブロック」を登録する。これで死に経路の
//         _extensionsに依らず、毎ターン確実に<state>出力指示と現在状態がsysに乗る。
//         ※fix77本体は不触(EMIT文言の複製のみ)。captureState(_parseExtensions)は生きているので
//           モデルが<state>を出せば同ターンでstoreへ反映される。
//     (b) キャラ一覧モーダルは開いている間は再描画されない→turns増加を1200ms間隔で監視し、
//         モーダルが開いていれば __charlist.open() を呼んで即時反映(fix325のrefreshPanelと同手法)。
//   OFF: localStorage v292Dfix405Off='1'(keeperはoffキーを尊重・(b)も停止)。
//   冪等: window.__v292Dfix405。keeperへの登録はmarker重複で二重登録回避。
// =====================================================================
(function v292Dfix405(){
  'use strict';
  if (window.__v292Dfix405) return;
  window.__v292Dfix405 = true;
  var TAG = '[v292Dfix405:state-freshness]';
  function off(){ try { return localStorage.getItem('v292Dfix405Off') === '1'; } catch(e){ return false; } }
  function getS(){ try { return window.S || (0,eval)('typeof S!=="undefined"?S:null'); } catch(e){ return null; } }
  // Phase2 S1b: keeper登録テキスト痩身。<state>出力契約(EMIT405)＋前提1行のみに縮め、
  //   fix192 stateBlock と二重掲載だった「全キャラ現在状態一覧」(statesBlock405)を除去する。
  //   v292Dfix405SlimOff='1' で旧テキスト(一覧つき)へ復帰（statesBlock405は分岐で温存）。
  function slim(){ try { return localStorage.getItem('v292Dfix405SlimOff') !== '1'; } catch(e){ return true; } }
  var SLIM_LINE = '\n・【各キャラの現在の状態】節を反応の前提にする。回復イベント無しに改善・平常化させない。';

  // ---- EMIT405: fix77 の EMIT と同一文言(複製・fix77本体は不触) ----
  var EMIT405 =
    '\n\n【状態の出力（fix77・必須）】\n' +
    '本文の最後に、今ターンで状態が動いたキャラだけ次形式で1行ずつ出力する（変化が無いキャラは省略可）:\n' +
    '<state who="名前" からだ="…" こころ="…" 本能="…"/>\n' +
    '・who は cast の名前。3軸は今この瞬間の状態を簡潔な自由記述で。\n' +
    '・このタグは本文（地の文・セリフ）には絶対に含めない。必ず本文の後に独立して置く。';

  // ---- statesBlock405: fix77 の buildStatesBlock と同一ロジック(store=window.__v292Dfix77Store) ----
  function statesBlock405(){
    try {
      var store = window.__v292Dfix77Store;
      if (!store) return '';
      var names = Object.keys(store);
      if (!names.length) return '';
      var lines = [];
      names.forEach(function(n){
        var s = store[n]; if (!s) return;
        var parts = [];
        if (s.karada) parts.push('からだ:'+s.karada);
        if (s.kokoro) parts.push('こころ:'+s.kokoro);
        if (s.honno)  parts.push('本能:'+s.honno);
        if (parts.length) lines.push(n + '｜' + parts.join('／'));
      });
      if (!lines.length) return '';
      return '\n\n【各キャラの現在の状態（前ターンからの継続・必ず踏まえる）】\n' +
        lines.join('\n') +
        '\n・この状態を反応の前提にする。回復イベント無しに改善・平常化させない。';
    } catch(e){ return ''; }
  }

  // ---- (a) keeperレジストリへ登録(prio1・毎ターン確実に注入) ----
  (function register(){
    try {
      window.__f379reg = window.__f379reg || [];
      var reg = window.__f379reg;
      var MARKER = '【状態の出力';
      for (var i = 0; i < reg.length; i++){ if (reg[i] && reg[i].marker === MARKER) return; } // 二重登録回避
      reg.push({ off: 'v292Dfix405Off', marker: MARKER, prio: 1, text: function(){ return slim() ? (EMIT405 + SLIM_LINE) : (EMIT405 + statesBlock405()); } });
      try { console.log(TAG, 'registered to __f379reg (prio1)'); } catch(_){}
    } catch(e){}
  })();

  // ---- (b) キャラ一覧の即時反映: turns増加でモーダルが開いていれば再描画(fix325のrefreshPanel同手法) ----
  var lastLen405 = -1;
  try { setInterval(function(){
    try {
      if (off()) return;
      var s = getS(); if (!s || !Array.isArray(s.turns)) return;
      var curLen = s.turns.length;
      if (lastLen405 >= 0 && curLen > lastLen405){
        if (document.querySelector('.v292Dfix145-modal') && window.__charlist && typeof window.__charlist.open === 'function'){
          window.__charlist.open();
        }
      }
      lastLen405 = curLen;
    } catch(e){}
  }, 1200); } catch(e){}

  // ---- (c) ロード通知 ----
  try { console.log(TAG, 'loaded (off=' + (off() ? '1' : '0') + ')'); } catch(_){}
})();
