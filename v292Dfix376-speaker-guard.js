// =====================================================================
// Chronicle TRPG - v292Dfix376: 話者帰属の三段重ね強化（キャッチボール規則）
// 背景(2026-07-04 おしん):「会話ログのミス根治難しい？」
//   実例: SAYターンで少女の返答3連が全部アリア名義に。
//   真因: モデルが<say>タグ契約に違反し裸の「」を地の文に書く→タグゼロ判別器の
//   近接推測が直前話者(主人公)に倒れる。
// 三段構え:
//   [1] sys強化: 返答セリフの話者厳守+裸引用時は話者名明示（Planner.buildラップ）
//   [2] キャッチボール補正(本fix核心): SAYターンで
//       ・j>0(先頭=主人公の実発話fix193は不触)
//       ・who=主人公 かつ sayがplayerTextと不一致
//       ・sayが地の文に裸の「」で存在(=フォールバック由来。タグ由来は地の文に残らない契約)
//       ・このターンの他話者がちょうど1人
//       → その相手に振替。fix200bと同流儀でsave+カード再構築。
//   [3] 既存のタグ契約・3層判別器・fix200b後置修正はそのまま(最終保険が本fix)。
//   起動6秒後に全ターン一括修正(過去分も直る)→以後2sポーリングで新ターンを監視。
// OFF: localStorage v292Dfix376Off='1'
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix376) return; window.__v292Dfix376 = true;
  var TAG = '[v292Dfix376:speakerGuard]';
  var MARK = '【話者厳守】';
  function off(){ try{ return localStorage.getItem('v292Dfix376Off')==='1'; }catch(e){ return false; } }
  function getS(){ try{ if (window.S) return window.S; return (0,eval)('S'); }catch(e){ return null; } }
  function norm(s){ return String(s||'').replace(/[「」\s]/g,''); }

  // ---- [1] sys強化 ----
  function hookSys(){
    try {
      var P = (0,eval)('Planner');
      if (!P || typeof P.build !== 'function') return false;
      var ob = P.build;
      P.build = function(){
        var r = ob.apply(this, arguments);
        try {
          if (off()) return r;
          if (!r || typeof r.sys !== 'string') return r;
          if (r.sys.indexOf(MARK) >= 0) return r;
          r.sys += '\n' + MARK + '主人公が話しかけた直後の返答セリフは、返答した本人の<say 名前>タグで書く（主人公のタグに入れない）。万一セリフを地の文の「」で書く場合は、直前の文に必ずその話者の名前を書く。';
        } catch(e) {}
        return r;
      };
      return true;
    } catch(e) { return false; }
  }
  if (!hookSys()) {
    var hv = setInterval(function(){ if (hookSys()) clearInterval(hv); }, 1000);
    setTimeout(function(){ clearInterval(hv); }, 30000);
  }

  // ---- [2] キャッチボール補正 ----
  function fixTurn(t, heroName){
    if (!t || t.inputType !== 'SAY' || !Array.isArray(t._convSays) || !t.narrative) return 0;
    var cs = t._convSays;
    var others = [];
    for (var k = 0; k < cs.length; k++){
      var w = cs[k] && cs[k].who;
      if (w && w !== heroName && others.indexOf(w) < 0) others.push(w);
    }
    if (others.length !== 1) return 0; // 二者場面のみ(安全側)
    var pt = norm(t.playerText);
    var changed = 0;
    for (var j = 1; j < cs.length; j++){ // j=0は主人公の実発話(fix193)
      var c = cs[j];
      if (!c || c.who !== heroName || !c.say) continue;
      var ns = norm(c.say);
      if (!ns || ns === pt || (pt && pt.indexOf(ns) >= 0)) continue; // 本人発話は不触
      if (t.narrative.indexOf('「' + c.say + '」') < 0) continue;    // 裸引用由来のみ
      c.who = others[0]; changed++;
    }
    return changed;
  }
  function pass(dry){
    // fix495(B6): 話者補正はfix469(点数制)に一本化(fix462と同型のcede)。本fixは証拠なしで
    // 全ターンを振替え、469の凍結済みターンも上書きしてしまうため、469稼働時は退譲する。
    // sys注入([1]hookSys)は従来どおり生かす。
    try {
      if (window.__v292Dfix469 && window.__v292Dfix469.__armed && localStorage.getItem('v292Dfix469Off') !== '1') return 0;
    } catch(e){}
    var S = getS();
    if (!S || !S.cast || !S.cast.hero || !S.cast.hero.name || !Array.isArray(S.turns)) return 0;
    var hero = S.cast.hero.name;
    var total = 0;
    for (var i = 0; i < S.turns.length; i++){
      if (dry){
        // dry-run: コピーで数えるだけ
        var t = S.turns[i];
        if (!t) continue;
        var clone = { inputType: t.inputType, playerText: t.playerText, narrative: t.narrative,
                      _convSays: (t._convSays||[]).map(function(c){ return { who: c.who, say: c.say }; }) };
        total += fixTurn(clone, hero);
      } else {
        total += fixTurn(S.turns[i], hero);
      }
    }
    if (!dry && total){
      try { if (typeof S.save === 'function') S.save(); } catch(e){}
      try {
        var stream = document.getElementById('dialogue-stream');
        if (stream){
          var olds = stream.querySelectorAll('.v292-dlg-card');
          for (var k2 = olds.length - 1; k2 >= 0; k2--){ if (olds[k2].parentNode) olds[k2].parentNode.removeChild(olds[k2]); }
        }
        if (window.__v292Dfix66 && typeof window.__v292Dfix66.repair === 'function') window.__v292Dfix66.repair();
      } catch(e){}
      try{ console.log(TAG, 'reassigned ' + total + ' quote(s)'); }catch(_){}
    }
    return total;
  }
  window.__v292Dfix376x = { dryRun: function(){ return pass(true); }, run: function(){ return pass(false); } };

  var lastLen = -1;
  function tick(){
    if (off()) return;
    try {
      var S = getS(); if (!S || !Array.isArray(S.turns)) return;
      if (S.turns.length !== lastLen){ lastLen = S.turns.length; pass(false); }
    } catch(e){}
  }
  setTimeout(function(){ tick(); setInterval(tick, 2000); }, 6000); // boot切替ウィンドウ回避(fix375流)
  try{ console.log(TAG, 'loaded', off()?'OFF':'ON'); }catch(_){}
})();
