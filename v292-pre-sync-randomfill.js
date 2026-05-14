// v292-pre-sync-randomfill.js
// Purpose:
//   Fix the visible "user input overwritten by random" bug that v291 only patches
//   AFTER 4 seconds. Root cause is upstream of v291: when randomFill is clicked,
//   the inner chain's v108 wrapper calls UI.openSettings() to re-render the
//   settings panel from S (runtime cache). If S.scene.obj (etc.) is stale —
//   which happens whenever the user types but never clicks Save — that re-render
//   overwrites the DOM input with the stale S value. v291 restores it ~4s later,
//   so data isn't permanently lost, but for several seconds the user sees their
//   input replaced. This shatters the §3.1 "seed" invariant from the user's
//   perspective even when it's mathematically restored later.
//
// Strategy:
//   Wrap UI.randomFill at the outermost level (re-wrap monitor like v291).
//   BEFORE delegating to the chain, copy non-blank DOM values into S so that
//   when v108 re-renders from S, the user input is what gets written back —
//   no visible overwrite.
//
// Notes:
//   - Pre-sync only writes non-blank values. Blank fields are left blank in S
//     so the chain can fill them.
//   - Coexists with v291: v291 still snapshots+restores DOM as a safety net
//     in case some other layer writes after pre-sync.
//   - Idempotent guard: window.__v292Active. Re-wrap guard: UI.randomFill.__v292Wrapped.
//
// CLAUDE_RULES §3.1 (おしん 2026-05-13):
//   "プレイヤーの入力を種として表現を広げていく物語"
//   Random must not overwrite a seed. v292 ensures that no layer in the chain
//   even temporarily replaces the seed with stale state.

(function v292(){
  'use strict';
  if (window.__v292Active) return;
  window.__v292Active = true;
  var TAG = '[v292]';

  function $(id){ return document.getElementById(id); }
  function val(id){ var el = $(id); return el ? (el.value || '') : ''; }
  function trimmed(s){ return (s == null ? '' : String(s)).trim(); }

  // DOM id → S.scene path
  var SCENE_MAP = {
    cfgLore: 'lore',
    cfgLoc:  'loc',
    cfgObj:  'obj',
    cfgTone: 'tone'
  };
  // DOM id → S.cast.hero path
  var HERO_MAP = {
    cfgHName: 'name',
    cfgHDesc: 'desc'
  };
  var NPC_FIELDS = ['name','desc','personality','coreDesire','coreFear','wound'];

  function preSync() {
    if (typeof S !== 'object' || !S) return 0;
    var synced = [];

    S.scene = S.scene || {};
    Object.keys(SCENE_MAP).forEach(function(domId){
      var path = SCENE_MAP[domId];
      var v = trimmed(val(domId));
      if (v && S.scene[path] !== v) {
        S.scene[path] = v;
        synced.push('scene.' + path);
      }
    });

    S.cast = S.cast || {};
    S.cast.hero = S.cast.hero || {};
    Object.keys(HERO_MAP).forEach(function(domId){
      var path = HERO_MAP[domId];
      var v = trimmed(val(domId));
      if (v && S.cast.hero[path] !== v) {
        S.cast.hero[path] = v;
        synced.push('hero.' + path);
      }
    });

    var cards = document.querySelectorAll('#npcList .npc-card');
    S.cast.npcs = S.cast.npcs || [];
    for (var i = 0; i < cards.length; i++) {
      S.cast.npcs[i] = S.cast.npcs[i] || {};
      var card = cards[i];
      for (var j = 0; j < NPC_FIELDS.length; j++) {
        var f = NPC_FIELDS[j];
        var el = card.querySelector('[data-f="' + f + '"]');
        if (!el) continue;
        var v = trimmed(el.value);
        if (v && S.cast.npcs[i][f] !== v) {
          S.cast.npcs[i][f] = v;
          synced.push('npc[' + i + '].' + f);
        }
      }
    }
    return synced;
  }

  function tryWrap() {
    if (typeof UI !== 'object' || !UI) return false;
    if (typeof UI.randomFill !== 'function') return false;
    if (UI.randomFill.__v292Wrapped) return true;

    var inner = UI.randomFill.bind(UI);
    UI.randomFill = function() {
      var synced = preSync();
      if (synced.length > 0) {
        console.log(TAG, 'pre-sync DOM->S:', synced.length, 'fields ->', synced.join(', '));
      } else {
        console.log(TAG, 'pre-sync: no diff');
      }
      return inner.apply(this, arguments);
    };
    try { UI.randomFill.__v292Wrapped = true; } catch(e){}
    console.log(TAG, 'UI.randomFill wrapped (pre-sync DOM->S to prevent stale-state overwrite)');
    return true;
  }

  function init() {
    tryWrap();
    if (window.__v292Monitor) return;
    window.__v292Monitor = true;
    var n = 0;
    var id = setInterval(function(){
      try {
        if (typeof UI === 'object' && UI && typeof UI.randomFill === 'function') {
          if (!UI.randomFill.__v292Wrapped) {
            if (tryWrap()) console.log(TAG, 're-wrapped on top');
          }
        }
      } catch(e){}
      // Monitor for ~30s (longer than v291's 18s, longer than v213's setInterval)
      if (++n > 100) clearInterval(id);
    }, 300);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  setTimeout(init, 500);
  setTimeout(init, 2000);
  setTimeout(init, 5000);
  setTimeout(init, 10000);
  setTimeout(init, 20000);

  window.__v292 = { preSync: preSync, version: 'v292-pre-sync-1' };
  console.log(TAG, 'v292 init: pre-sync DOM->S to prevent stale-state overwrite');
})();
