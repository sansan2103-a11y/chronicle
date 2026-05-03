/* v214-pair-strict: aggressive gender-name pair enforcement */
(function v214(){
  'use strict';
  if (window.__v214Active) return;
  window.__v214Active = true;

  function v213(){ return window.__v213; }
  function read(){ try { return JSON.parse(localStorage.getItem('chr6') || '{}'); } catch(e){ return {}; } }

  function aggressiveFix(){
    var v = v213();
    if (!v) return false;
    var s = read();
    if (!s.cast) return false;
    var changed = false;
    var fixedCount = 0;
    function fix(c){
      if (!c || !c.name || !c.gender) return;
      if (!v.validatePair(c.name, c.gender)){
        var newName = v.pickName(c.gender);
        console.log('[v214] FIX:', c.name + '/' + c.gender, '->', newName + '/' + c.gender);
        c.name = newName;
        changed = true;
        fixedCount++;
        if (c.desc){
          c.desc = c.desc.replace(/性別[:：]\s*[男女][性]?。?/, '性別: ' + c.gender + '。');
        }
      }
    }
    if (s.cast.hero) fix(s.cast.hero);
    (s.cast.npcs || []).forEach(fix);
    if (changed){
      try { localStorage.setItem('chr6', JSON.stringify(s)); } catch(e){}
      try { eval('UI.renderAll()'); } catch(e){}
      console.log('[v214] aggressive fix applied to', fixedCount, 'character(s)');
    }
    return changed;
  }

  function bindButton(){
    document.querySelectorAll('button').forEach(function(b){
      if (b.__v214Bound) return;
      var t = (b.textContent || '').trim();
      if (/未入力をランダム生成|完全リセット/.test(t)){
        b.__v214Bound = true;
        b.addEventListener('click', function(){
          setTimeout(aggressiveFix, 100);
          setTimeout(aggressiveFix, 400);
          setTimeout(aggressiveFix, 800);
        }, true);
        console.log('[v214] bound to button:', t);
      }
    });
  }

  function init(){
    setTimeout(function(){ bindButton(); aggressiveFix(); }, 1000);
    setInterval(function(){ bindButton(); aggressiveFix(); }, 3000);
    var mo = new MutationObserver(function(){ bindButton(); });
    mo.observe(document.body, { childList: true, subtree: true });
    console.log('[v214] active: aggressive pair enforcement');
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.__v214 = { aggressiveFix: aggressiveFix };
})();
