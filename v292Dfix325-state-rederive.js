// =====================================================================
// Chronicle TRPG - v292Dfix325: キャラ状態(fix77)の自己治癒＝ターンから再導出
//   背景(おしんと2026-06-24・深掘り診断): 取消/やり直し後もキャラ一覧が前の状態を引きずる
//     真因=fix77状態は「各ターンの<state>でフィールドを上書きする前進型アキュムレータ」で
//     差分履歴が無く、ストアだけからは「turn N時点の状態」を復元できない→巻き戻しに外部
//     スナップが必須=fix302。だがfix302のスナップはメモリ保持(リロードで消える)＋ターン数
//     キーで取りこぼし/競合＋スロット非分離。実際リロード後はスナップ空で巻き戻せず、
//     眼球欠損等の状態が残ってプロンプトに注入され続け生成を汚染していた。
//   対比: 同じ取消で longmem は正しく巻き戻る=ターンから再導出するから自己治癒する。
//     全ターンが <state> 生データを dbg.raw に保持しているので、fix77も同様に再導出可能。
//   設計(コア不触・longmem方式に統一・fix302の上位互換):
//     ・状態が物語より先に進んでいたら(maxStoreTurn>turns数 or ターン数の後退を検知)、
//       S.turns の <state> を順にリプレイして fix77ストアを再構築(現スロットのみ読む=
//       スロット安全)。からだ/こころ/本能/目的は上書き、傷/関係/未解決(永続)も同様に
//       最後に書かれた値へ。回復イベントはそのターンの<state>に反映済みなので尊重される。
//     ・取消/やり直しフックで即時、ポーリングでリロード/スロット切替/保険もカバー。
//   OFF: localStorage v292Dfix325Off='1'
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix325) return; window.__v292Dfix325 = true;
  var TAG = '[v292Dfix325:rederive]';
  function off(){ try { return localStorage.getItem('v292Dfix325Off') === '1'; } catch(e){ return false; } }
  function getS(){ try { return window.S || (typeof S !== 'undefined' ? S : null); } catch(e){ return null; } }
  function getStore(){ return window.__v292Dfix77Store; }
  function persist(){ try { localStorage.setItem('v292Dfix77States', JSON.stringify(getStore()||{})); } catch(e){} } // fix246がスロット接尾辞へ

  // <state> 属性パーサ(引用符の揺れに対応: 半角" / 全角” “ / 和文「『)
  function attr(tag, name){
    var m = tag.match(new RegExp(name + '\\s*=\\s*"([^"]*)"'));
    if (m) return m[1].trim();
    m = tag.match(new RegExp(name + "\\s*=\\s*[“”'「『]([^“”\"'」』]*)"));
    return m ? m[1].trim() : '';
  }
  function rawOf(t){
    try { if (t && t.dbg && typeof t.dbg.raw === 'string') return t.dbg.raw; } catch(e){}
    try { if (t && Array.isArray(t.narrative)) return t.narrative.join('\n'); } catch(e){}
    return '';
  }
  // S.turns の <state> を順にリプレイして state を再構築
  function deriveFromTurns(turns){
    var fresh = {};
    var FA = [['からだ','karada'],['こころ','kokoro'],['本能','honno'],['目的','mokuteki'],['傷','kizu'],['関係','kankei'],['未解決','mikaiketsu']];
    for (var i = 0; i < turns.length; i++){
      var raw = rawOf(turns[i]); if (!raw) continue;
      var re = /<state\b[^>]*?\/?>/g, m;
      while ((m = re.exec(raw)) !== null){
        var tag = m[0]; var who = attr(tag, 'who'); if (!who) continue;
        var cur = fresh[who] || {};
        for (var f = 0; f < FA.length; f++){ var v = attr(tag, FA[f][0]); if (v) cur[FA[f][1]] = v; }
        cur.turn = turns.length;
        fresh[who] = cur;
      }
    }
    return fresh;
  }
  function maxStoreTurn(store){ var mx = -1; try { Object.keys(store).forEach(function(k){ var t = store[k] && store[k].turn; if (typeof t === 'number' && t > mx) mx = t; }); } catch(e){} return mx; }

  function rederive(reason){
    if (off()) return false;
    var s = getS(); if (!s || !Array.isArray(s.turns)) return false;
    var store = getStore(); if (!store) return false;
    var fresh = deriveFromTurns(s.turns);
    // 参照を保ったまま中身差し替え(buildStatesBlockが読む実体・fix302と同方式)
    try {
      Object.keys(store).forEach(function(k){ delete store[k]; });
      Object.keys(fresh).forEach(function(k){ store[k] = fresh[k]; });
      persist();
      refreshPanel();
      try { console.log(TAG, 'fix77 state re-derived from', s.turns.length, 'turns (' + (reason||'') + ')'); } catch(_){}
      return true;
    } catch(e){ return false; }
  }
  function refreshPanel(){
    try { if (document.querySelector('.v292Dfix145-modal') && window.__charlist && typeof window.__charlist.open === 'function') window.__charlist.open(); } catch(e){}
  }

  // ---- staleness 検知ポーリング(リロード/スロット切替/保険) ----
  var lastLen = -1;
  try { setInterval(function(){
    if (off()) return;
    var s = getS(); if (!s || !Array.isArray(s.turns)) return;
    var curLen = s.turns.length;
    var store = getStore(); if (!store) { lastLen = curLen; return; }
    // (a) 状態が物語より先に進んでいる(取消/リロードで残った) → 再導出
    if (maxStoreTurn(store) > curLen) { rederive('state ahead of story'); }
    // (b) ターン数が後退(取消/やり直し) → 再導出
    else if (lastLen >= 0 && curLen < lastLen) { rederive('turn regression'); }
    lastLen = curLen;
  }, 1500); } catch(e){}

  // ---- 取消/やり直しフック(即時) ----
  (function w(){ w._n = (w._n||0)+1;
    var g = window.G || (typeof G !== 'undefined' ? G : null);
    if (g){
      if (!g.__v292Dfix325){
        ['undo','retry'].forEach(function(fn){
          if (typeof g[fn] !== 'function') return;
          var orig = g[fn].bind(g);
          g[fn] = function(){ var r = orig.apply(this, arguments); try { setTimeout(function(){ rederive('after ' + fn); }, 50); } catch(e){} return r; };
        });
        g.__v292Dfix325 = true;
        try { console.log(TAG, 'undo/retry hooks wired'); } catch(_){}
      }
      return;
    }
    if (w._n <= 120) setTimeout(w, 500);
  })();

  window.__v292Dfix325api = { rederive: rederive, deriveFromTurns: deriveFromTurns, maxStoreTurn: maxStoreTurn };
  try { console.log(TAG, 'loaded'); } catch(_){}
})();
