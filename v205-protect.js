/* v205-protect: orphan cleanup + gender preservation
   1. Remove dialogue cards without data-turn-idx (orphans from base HTML).
   2. Preserve gender values: prevent localStorage writes that would blank out
      hero/NPC gender. If a write would clear an existing JP gender, keep the
      previous value. */
(function v205(){
  'use strict';
  if (window.__v205Active) return;
  window.__v205Active = true;

  var KEY = 'chr6';

  function read(){
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
    catch(e){ return {}; }
  }

  /* === Gender preservation hook === */
  var origSet = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function(key, value){
    if (key === KEY){
      try {
        var newState = JSON.parse(value);
        var oldState = read();
        var oldCast = oldState.cast || {};
        var newCast = newState.cast || {};
        var changed = false;

        /* Hero gender protection */
        if (oldCast.hero && newCast.hero){
          var oldG = oldCast.hero.gender;
          var newG = newCast.hero.gender;
          if (oldG && (oldG === '女性' || oldG === '男性') && (!newG || (newG !== '女性' && newG !== '男性'))){
            console.log('[v205] hero gender protected:', oldG, '(was about to be cleared)');
            newCast.hero.gender = oldG;
            changed = true;
          }
        }

        /* NPC gender protection (match by name) */
        if (Array.isArray(newCast.npcs) && Array.isArray(oldCast.npcs)){
          newCast.npcs.forEach(function(n){
            if (!n || !n.name) return;
            var newG = n.gender;
            if (newG === '女性' || newG === '男性') return; /* already valid */
            /* Find by name in old */
            for (var i = 0; i < oldCast.npcs.length; i++){
              var o = oldCast.npcs[i];
              if (o && o.name === n.name && (o.gender === '女性' || o.gender === '男性')){
                console.log('[v205] NPC gender protected:', n.name, '→', o.gender);
                n.gender = o.gender;
                changed = true;
                break;
              }
            }
          });
        }

        if (changed){
          newState.cast = newCast;
          value = JSON.stringify(newState);
        }
      } catch(e){}
    }
    return origSet(key, value);
  };

  /* === Orphan cleanup === */
  function cleanOrphans(){
    var stream = document.getElementById('dialogue-stream');
    if (!stream) return;
    var orphans = stream.querySelectorAll('.v101-dlg-card:not([data-turn-idx])');
    if (orphans.length){
      orphans.forEach(function(c){ c.remove(); });
      console.log('[v205] removed', orphans.length, 'orphan cards');
    }
  }

  function init(){
    cleanOrphans();
    setInterval(cleanOrphans, 1500);
    var stream = document.getElementById('dialogue-stream');
    if (stream){
      new MutationObserver(function(){ cleanOrphans(); }).observe(stream, { childList: true });
    }
    console.log('[v205] active: orphan cleanup + gender protection');
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
