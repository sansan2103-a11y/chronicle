// v268-reset-bypass-fix.js
// 目的: v267 の resetGame が v265 (death-persistence) によって reverted される問題を修正
//
// 観測:
//   v267.resetGame() が NPC.state.alive = true に書き戻すと、
//   v265 setItem hook が「死亡 → 蘇生 (キーワード無し)」と判定して revert。
//   結果、リセット後もスピカが死亡状態のまま残る。
//
// 修正方針:
//   v267 の resetGame を上書きして以下に変更:
//     1. localStorage.removeItem('chr6') を先に実行 → v265 の OLD state 読み取りが {} になる
//     2. その後 localStorage.setItem('chr6', cleanState) → v265 が「OLD has no death history」と判定 → revert 発生せず
//   これで完全リセットが可能。
//
// ガード: window.__v268Active

(function v268() {
  'use strict';
  if (window.__v268Active) return;
  window.__v268Active = true;
  console.log('[v268] reset-bypass-fix init');

  function safeReset() {
    try {
      var s;
      try { s = JSON.parse(localStorage.getItem('chr6') || '{}'); } catch (e) { s = {}; }

      var clean = {
        cfg: s.cfg,
        scene: s.scene || {},
        cast: s.cast || {},
        turns: [],
        ephemerals: s.ephemerals || {}
      };
      if (clean.scene) clean.scene.branches = [];

      function freshState() {
        return {
          alive: true, conscious: true, canSpeak: true, canAct: true,
          condition: '健康', hpEstimate: 100,
          bodyParts: {}, restraints: [], injuryLog: [],
          recentEvents: [], trauma: [],
          mentalProfile: { fear: 0, trust: 50, tension: 0, despair: 0 }
        };
      }
      if (clean.cast.hero) clean.cast.hero.state = freshState();
      if (Array.isArray(clean.cast.npcs)) {
        clean.cast.npcs.forEach(function (n) {
          if (!n) return;
          n.state = freshState();
          n.state.mentalProfile.trust = 0;
          n.emotion = '中立';
          if (typeof n.stress === 'number') n.stress = 50;
          if (typeof n.trust === 'number') n.trust = 0;
          if (typeof n.intimacy === 'number') n.intimacy = 0;
          n.keyMoments = [];
        });
      }

      // KEY TRICK: removeItem first so v265 sees no old death history
      window.__v259Writing = true;
      window.__v267Resetting = true;
      try {
        localStorage.removeItem('chr6');
        localStorage.setItem('chr6', JSON.stringify(clean));
      } finally {
        setTimeout(function () {
          window.__v259Writing = false;
          window.__v267Resetting = false;
        }, 500);
      }

      // sync in-memory S
      if (typeof S !== 'undefined') {
        S.turns = [];
        if (S.scene) S.scene.branches = [];
        if (S.cast && clean.cast) {
          if (clean.cast.hero) S.cast.hero = clean.cast.hero;
          if (clean.cast.npcs) S.cast.npcs = clean.cast.npcs;
        }
      }

      // re-render
      try { if (typeof UI !== 'undefined' && UI.renderAll) UI.renderAll(); } catch (e) {}
      try { if (typeof UI !== 'undefined' && UI.renderBranches) UI.renderBranches([]); } catch (e) {}
      try { if (typeof UI !== 'undefined' && UI._showIntro) UI._showIntro(); } catch (e) {}
      var stream = document.getElementById('dialogue-stream');
      if (stream) stream.innerHTML = '';

      console.log('[v268] safe reset complete');
      return true;
    } catch (e) {
      console.warn('[v268] reset err:', e && e.message);
      return false;
    }
  }

  // Override v267's resetGame with the safer version
  function patch() {
    if (window.__v267 && typeof window.__v267.resetGame === 'function') {
      window.__v267.resetGame = safeReset;
      window.__v268.patched = true;
      return true;
    }
    return false;
  }

  window.__v268 = { safeReset: safeReset, patched: false };
  patch();
  var tries = 0;
  var iv = setInterval(function () {
    if (patch() || ++tries > 30) clearInterval(iv);
  }, 500);

  console.log('[v268] init complete');
})();
