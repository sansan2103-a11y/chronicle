// =====================================================================
// Chronicle TRPG - v292Dfix454: ダッシュ「——」の多用を抑える（独立ブロック）
// ---------------------------------------------------------------------
// ★2026-07-13 本番20ターンの長期実測:
//   ダッシュ「——」が 8.5回/千字（1ターンあたり6回前後）。3行連続でダッシュ止めになる実例あり。
//   これが「読みにくい・疲れる」の残りの主犯（一文の長さ・メタ漏れは fix439/440/449 で解消済み）。
//   fix452 で fix105 の【読みやすさ】ブロックに1文追記したが、**まったく効かなかった**（8.5→8.4）。
//   → 長い塊の中の1文は埋もれる。**独立した短いブロック**にして明示する（recency + salience）。
//
// keeper(__f379reg) prio2・marker【ダッシュ】・約70字。予算(1,600字)への影響は小。
// OFF: localStorage.v292Dfix454Off = '1'（live評価）
// 検証口: window.__v292Dfix454.text()
// ⚠️ text() は毎ターン評価される。副作用を持たせない（純関数）。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix454) return;
  var TAG = '[v292Dfix454:dash]';
  var MARK = '【ダッシュ】';
  // 肯定形を基調にしつつ、数の上限だけは明示する（DR: 否定形だけだと混乱する／数値は具体的で守られやすい）
  var TEXT = '\n' + MARK + '本文の中でダッシュ「——」を使うのは、1ターンにつき最大1回まで。それ以外の間や余韻は、短い一文・句点・改行で作る。体言止めも連続させない。';

  function off(){ try { return localStorage.getItem('v292Dfix454Off') === '1'; } catch(e){ return false; } }
  function textFn(){ try { return off() ? '' : TEXT; } catch(e){ return ''; } }

  function register(){
    try {
      window.__f379reg = window.__f379reg || [];
      var reg = window.__f379reg, i;
      for (i = 0; i < reg.length; i++){ if (reg[i] && reg[i].marker === MARK) return; }
      reg.push({ off: 'v292Dfix454Off', marker: MARK, prio: 2, text: textFn });
      try { console.log(TAG, 'registered to __f379reg (prio2)'); } catch(e){}
    } catch(e){}
  }
  register();
  var n = 0;
  var iv = setInterval(function(){ register(); if (++n > 40) clearInterval(iv); }, 500);

  window.__v292Dfix454 = { text: textFn, MARK: MARK, isOff: off };
})();
