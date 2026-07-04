// =====================================================================
// Chronicle TRPG - v292Dfix382: セリフ量のAI自動調整（おしん発案・MVP=1ノブ）
// 「セレクタ多すぎていじるの大変。モデルが意識して最適解にいじれる仕組みは？」
// ---------------------------------------------------------------------
// 方式（追加APIコール無し・fix77流儀のタグ同梱）:
//   1. sysに1行追加（fix379レジストリ経由）: 本文末尾に <dial level="0|1|2"/> を
//      1つ添えさせる（次ターンに適したセリフ量の推奨。0控えめ/1標準/2濃いめ）。
//   2. 新ターン検知(2sポーリング)で narrative からタグを回収して除去（本文を汚さない）。
//   3. ヒステリシス: 2ターン連続で同じ推奨、かつ現在値と異なる時だけ
//      S.cfg.dialogueLevel を変更（毎ターンの振動を防ぐ）。変更はconsoleに記録。
//   4. 人間入力が常に勝つ(fix374パターン): ユーザーがセリフセレクタを触ったら
//      slot別フラグを立てて以後このslotでは自動変更しない。
// 既定: プレビューOFF。localStorage v292Dfix382='1' で有効化（体感→承認後に既定化）。
// OFF: v292Dfix382Off='1'。検証: __v292Dfix382x.status() / .test(サンプル文字列)
// 注意: エンジンが未知タグを事前に食べる可能性あり→その場合タグが拾えず不発
//   （害はゼロ）。1ターン実測で status().lastRec を確認すること。
// =====================================================================
(function(){
  'use strict';
  if (window.__f382done) return; window.__f382done = 1;
  var TAG = '[v292Dfix382:auto-dial]';
  function offAll(){ try { return localStorage.getItem('v292Dfix382Off') === '1'; } catch(e){ return false; } }
  function previewOn(){ try { return localStorage.getItem('v292Dfix382') === '1'; } catch(e){ return false; } }
  function on(){ return previewOn() && !offAll(); }
  function getS(){ try { return window.S || (0,eval)('typeof S!=="undefined" ? S : null'); } catch(e){ return null; } }
  function slotSfx(){ try { if (typeof window.__chr6Key === 'function'){ var k = window.__chr6Key(); return (k && k !== 'chr6') ? k.replace(/^chr6/, '') : ''; } } catch(e){} return ''; }
  function touchedKey(){ return 'v292Dfix382Touched' + slotSfx(); }
  function touched(){ try { return localStorage.getItem(touchedKey()) === '1'; } catch(e){ return false; } }

  var SYSLINE = '\n【調整タグ】本文をすべて書き終えた最後に、次のターンに適したセリフ量の推奨を <dial level="0"/> か <dial level="1"/> か <dial level="2"/> の形でちょうど1つ添える（0=控えめ/1=標準/2=濃いめ。直近の会話の熱・緊張・静けさから判断）。このタグは物語本文ではなく、地の文に混ぜない。';
  window.__f379reg = window.__f379reg || [];
  window.__f379reg.push({ off: 'v292Dfix382Off', marker: '【調整タグ】', text: function(){ return on() ? SYSLINE : ''; } });

  var RE = /\s*<dial[^>]*level\s*=\s*["']?([0-2])["']?[^>]*\/?\s*>\s*/gi;
  function extract(txt){
    var rec = null, m;
    RE.lastIndex = 0;
    while ((m = RE.exec(String(txt||'')))){ rec = +m[1]; }
    return rec;
  }
  function strip(txt){ return String(txt||'').replace(RE, '\n').replace(/\n{3,}/g, '\n\n'); }

  var lastLen = -1, lastRec = null, lastRecTurn = -1, applied = [];
  function tick(){
    if (!on()) return;
    var S = getS(); if (!S || !Array.isArray(S.turns) || !S.turns.length) return;
    var tl = S.turns.length;
    if (tl === lastLen) return;
    lastLen = tl;
    try {
      var t = S.turns[tl-1]; if (!t) return;
      var rec = extract(t.narrative);
      if (rec === null && typeof t.text === 'string') rec = extract(t.text);
      if (rec === null) return;
      // 本文からタグを除去して保存（表示・履歴を汚さない）
      var dirty = false;
      if (typeof t.narrative === 'string' && RE.test(t.narrative + '')){ t.narrative = strip(t.narrative); dirty = true; }
      RE.lastIndex = 0;
      if (typeof t.text === 'string'){ var s2 = strip(t.text); if (s2 !== t.text){ t.text = s2; dirty = true; } }
      if (dirty){ try { if (!document.hidden && S.save) S.save(); } catch(e){} }
      // ヒステリシス適用
      var cur = (S.cfg && S.cfg.dialogueLevel != null) ? +S.cfg.dialogueLevel : 1;
      if (!touched() && lastRec === rec && lastRecTurn === tl - 1 && rec !== cur){
        S.cfg.dialogueLevel = rec;
        try { if (!document.hidden && S.save) S.save(); } catch(e){}
        applied.push({ turn: tl, from: cur, to: rec });
        try { console.log(TAG, 'セリフ量を自動調整: ' + cur + ' → ' + rec + '（2ターン連続推奨・手動時は不動作）'); } catch(e){}
      }
      lastRec = rec; lastRecTurn = tl;
      try { console.log(TAG, 'rec=' + rec + ' cur=' + cur + ' touched=' + touched()); } catch(e){}
    } catch(e){}
  }
  // 手動タッチ検知（人間入力が勝つ・以後このslotは自動変更しない）
  document.addEventListener('change', function(ev){
    try {
      var el = ev.target;
      if (!el || el.tagName !== 'SELECT') return;
      var opts = Array.prototype.map.call(el.options || [], function(o){ return o.textContent; }).join('');
      if (opts.indexOf('控えめ') < 0 || opts.indexOf('濃いめ') < 0) return;
      var box = el.closest ? (el.closest('span,label,div') || el.parentNode) : el.parentNode;
      var around = box ? String(box.textContent || '') : '';
      if (around.indexOf('セリフ') < 0) return;
      localStorage.setItem(touchedKey(), '1');
      try { console.log(TAG, 'セリフセレクタ手動変更を検知→このslotでは以後自動調整しない'); } catch(e){}
    } catch(e){}
  }, true);
  // 表示ガード: タグが一瞬DOMに出たら消す
  try {
    var mo = new MutationObserver(function(){
      try {
        if (!on()) return;
        var els = document.querySelectorAll('.narr, .narrative, [class*="narr"]');
        for (var i = 0; i < els.length; i++){
          var el = els[i];
          if (el.childElementCount === 0 && el.textContent && el.textContent.indexOf('<dial') >= 0){
            el.textContent = strip(el.textContent);
          }
        }
      } catch(e){}
    });
    mo.observe(document.documentElement || document.body, { childList: true, subtree: true, characterData: true });
  } catch(e){}
  setTimeout(function(){ tick(); setInterval(tick, 2000); }, 6000);
  window.__v292Dfix382x = {
    test: function(s){ return { rec: extract(s), stripped: strip(s) }; },
    status: function(){ return { on: on(), touched: touched(), lastRec: lastRec, lastRecTurn: lastRecTurn, applied: applied.slice() }; }
  };
  try { console.log(TAG, 'loaded (preview=' + (previewOn() ? 'ON' : 'OFF') + ')'); } catch(e){}
})();
