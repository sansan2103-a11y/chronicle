// =====================================================================
// Chronicle TRPG - v292Dfix466: 台詞の二重表示を消す（読みにくさの一因・実データで確定）
// ---------------------------------------------------------------------
// 症状(2026-07-13・おしんのslot T6 実測):
//   本文(#story)に
//     [fix438が挿入] 朝比奈ひなた「あ、あんたな、何考えて——！ そんなもんにキスして——」
//     [本文の段落]   「あ、あんたな、何考えて、！ そんなもんにキスして、」
//   と **同じ台詞が2回** 出ていた。
//
// 真因: fix438 は「その台詞が既に本文にあるか」を norm() の文字列一致で判定するが、
//   norm() は **ダッシュ(——)を落とさない**。一方 fix458 が本文側のダッシュを句読点へ
//   置換している（2回目以降のダッシュ→「、」）。
//   → 挿入元(plan.narrative=ダッシュのまま) と 本文(置換後) が一致せず「本文に無い」と誤判定 → 二重挿入。
//
// 修正(表示のみ・データ不触):
//   fix438 が挿入した .v292Dfix438-say のうち、**同じブロックの本文段落に同じ台詞が既にある**
//   ものを消す。比較は **ダッシュ・記号・空白を全部落とした正規化**で行う（fix458の置換に耐える）。
//   fix438 は再描画のたび挿入し直すので、本fixも監視して都度消す（冪等）。
//
// 既定ON。OFF: localStorage v292Dfix466Off='1'
// 検証口: window.__v292Dfix466 = { norm2, isDup, sweep, stats }
// =====================================================================
(function(){
  'use strict';
  if (window.__f466done) return; window.__f466done = 1;
  var TAG = '[v292Dfix466:dup-say]';

  function off(){ try { return localStorage.getItem('v292Dfix466Off') === '1'; } catch(e){ return false; } }
  var stats = { removed: 0, sweeps: 0 };

  // ダッシュ・長音・記号・空白を全部落とす（fix458のダッシュ→句読点 置換に耐える）
  function norm2(s){
    return String(s == null ? '' : s)
      .replace(/[—―ー－─‐–\-〜~]/g, '')
      .replace(/[\s　。、．，！？!?…‥・「」『』（）()［］\[\]｛｝【】〈〉《》"'`]/g, '')
      .trim();
  }

  // 挿入カード(sayEl)の台詞が、同じ親の本文段落に既に出ているか
  function isDup(sayText, proseText){
    var a = norm2(sayText), b = norm2(proseText);
    if (!a || a.length < 3 || !b) return false;   // 3字未満は誤削除防止のため判定しない
    return b.indexOf(a) >= 0;
  }

  // 「朝比奈ひなた「……」」の形から台詞部分だけ取り出す
  function sayBody(el){
    var t = String((el && el.innerText) || '');
    var m = t.match(/[「『]([\s\S]*)[」』]\s*$/);
    return m ? m[1] : t;
  }

  function sweep(){
    if (off()) return 0;
    var els = document.querySelectorAll('.v292Dfix438-say');
    if (!els.length) return 0;
    stats.sweeps++;
    var removed = 0;
    for (var i = 0; i < els.length; i++){
      var el = els[i];
      var parent = el.parentNode;
      if (!parent) continue;
      var body = sayBody(el);
      // 同じ親の中の本文段落(P)だけを集める。挿入カード自身と他の挿入カードは除く。
      var prose = '';
      var kids = parent.children;
      for (var k = 0; k < kids.length; k++){
        var c = kids[k];
        if (c === el) continue;
        if (c.classList && c.classList.contains('v292Dfix438-say')) continue;
        prose += ' ' + String(c.innerText || c.textContent || '');
      }
      if (isDup(body, prose)){
        parent.removeChild(el);
        removed++; stats.removed++;
      }
    }
    if (removed){ try { console.log(TAG, '二重表示の台詞を削除:', removed, '件'); } catch(e){} }
    return removed;
  }

  function start(){
    try { sweep(); } catch(e){}
    try { setInterval(function(){ try { sweep(); } catch(e){} }, 1200); } catch(e){}
    try {
      var story = document.querySelector('#story');
      if (story && window.MutationObserver){
        var mo = new MutationObserver(function(){ try { sweep(); } catch(e){} });
        mo.observe(story, { childList: true, subtree: true });
      }
    } catch(e){}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ setTimeout(start, 1500); });
  else setTimeout(start, 1500);

  window.__v292Dfix466 = { __armed: true, norm2: norm2, isDup: isDup, sweep: sweep, stats: function(){ return stats; }, isOff: off };
  try { console.log(TAG, 'armed'); } catch(e){}
})();
