/* v147 EMERGENCY: stop v143/v144 gender ping-pong + throttle UI.renderAll + dedupe cleans */
(function v147(){
  'use strict';
  var TAG = '[v147]';
  if (window.__v147Active) return;
  window.__v147Active = true;

  function installRenderAllThrottle(){
    if (typeof UI !== 'object' || !UI || typeof UI.renderAll !== 'function') return false;
    if (UI.__v147throttled) return true;
    var origRenderAll = UI.renderAll.bind(UI);
    var pending = false;
    var lastCall = 0;
    var MIN_INTERVAL = 1500;
    UI.renderAll = function(){
      var now = Date.now();
      if (now - lastCall < MIN_INTERVAL){
        if (pending) return;
        pending = true;
        var wait = MIN_INTERVAL - (now - lastCall);
        setTimeout(function(){ pending = false; lastCall = Date.now(); origRenderAll(); }, wait);
        return;
      }
      lastCall = now;
      origRenderAll();
    };
    UI.__v147throttled = true;
    console.log(TAG, 'UI.renderAll throttled to once per', MIN_INTERVAL, 'ms');
    return true;
  }

  function installCastWriteGuard(){
    var origSetItem = localStorage.setItem.bind(localStorage);
    var lastWriteSig = '';
    var lastWriteAt = 0;
    var DEDUPE_WINDOW = 800;
    localStorage.setItem = function(key, value){
      if (key === 'chr6'){
        try {
          var s = JSON.parse(value);
          var c = s.cast || {};
          var hero = c.hero || {};
          var npcs = c.npcs || [];
          var changed = false;
          if (hero.gender === 'female'){ hero.gender = '\u5973\u6027'; changed = true; }
          else if (hero.gender === 'male'){ hero.gender = '\u7537\u6027'; changed = true; }
          npcs.forEach(function(n){
            if (!n) return;
            if (n.gender === 'female'){ n.gender = '\u5973\u6027'; changed = true; }
            else if (n.gender === 'male'){ n.gender = '\u7537\u6027'; changed = true; }
          });
          if (changed){ c.npcs = npcs; s.cast = c; value = JSON.stringify(s); }
          var sig = value.length + ':' + value.charCodeAt(value.length / 2);
          var now = Date.now();
          if (sig === lastWriteSig && (now - lastWriteAt) < DEDUPE_WINDOW){ return; }
          lastWriteSig = sig;
          lastWriteAt = now;
        } catch(e){}
      }
      return origSetItem(key, value);
    };
    console.log(TAG, 'localStorage.setItem guarded: force JP gender + dedupe');
  }

  function installLogDedupe(){
    var seenLogs = {};
    var origLog = console.log;
    console.log = function(){
      var args = Array.prototype.slice.call(arguments);
      var s = args.map(function(a){ return typeof a === 'string' ? a : ''; }).join(' ');
      if (/\[v128\] cleaned:|\[v133\] cleaned:|\[v143\] NPC gender|\[v144\] NPC .+ gender normalized/.test(s)){
        var now = Date.now();
        if (seenLogs[s] && (now - seenLogs[s]) < 30000){ return; }
        seenLogs[s] = now;
      }
      return origLog.apply(console, args);
    };
    console.log(TAG, 'log dedupe installed for v128/v133/v143/v144');
  }

  function init(){
    setTimeout(installCastWriteGuard, 200);
    setTimeout(installLogDedupe, 300);
    var tryThrottle = function(attempts){
      if (installRenderAllThrottle()) return;
      if (attempts > 0) setTimeout(function(){ tryThrottle(attempts - 1); }, 500);
    };
    setTimeout(function(){ tryThrottle(20); }, 500);
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  console.log(TAG, 'v147 active: stop ping-pong + throttle render + dedupe logs');
})();
