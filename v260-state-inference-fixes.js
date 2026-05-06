// v260-state-inference-fixes.js
// v259 hotfixes: lenient JSON parsing + race-vs-v258 reapply post-process.
// Guard: window.__v260Active
(function v260(){
  'use strict';
  if (window.__v260Active) return;
  window.__v260Active = true;
  console.log('[v260] state-inference fixes init');

  function lenientParse(rawText){
    if (!rawText) return [];
    var t = String(rawText).trim();
    t = t.replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/```\s*$/,'');
    var first = t.indexOf('['); var last = t.lastIndexOf(']');
    if (first >= 0 && last > first) t = t.slice(first, last+1);
    t = t.replace(/,\s*([\]\}])/g,'$1');
    try {
      var arr = JSON.parse(t);
      if (!Array.isArray(arr)) return [];
      return arr.filter(function(x){ return x && typeof x === 'object' && typeof x.name === 'string'; });
    } catch(e){
      console.warn('[v260] lenient parse still failed:', e && e.message);
      return [];
    }
  }

  function applyItems(items){
    if (!items || !items.length || !window.__v259) return;
    items.forEach(function(it){
      var c = window.__v259.findCharByName(it.name);
      if (!c) return;
      if (!c.state) c.state = {};
      if (typeof it.alive==='boolean') c.state.alive = it.alive;
      if (typeof it.conscious==='boolean') c.state.conscious = it.conscious;
      if (typeof it.canSpeak==='boolean') c.state.canSpeak = it.canSpeak;
      if (typeof it.canAct==='boolean') c.state.canAct = it.canAct;
      if (typeof it.hpEstimate==='number') c.state.hpEstimate = it.hpEstimate;
      if (typeof it.condition==='string') c.state.condition = it.condition;
      if (typeof it.reason==='string') c.state.lastReason = String(it.reason).slice(0,120);
    });
    if (typeof S !== 'undefined' && S.save){
      window.__v259Writing = true;
      try{ S.save(); } finally { setTimeout(function(){window.__v259Writing=false;},80); }
    }
    try { window.__v259.postProcessAllTurns(); } catch(e){}
    try { window.__v259.decorateCards(); } catch(e){}
  }

  function installFetchHook(){
    if (window.__v260FetchHooked) return;
    var origFetch = window.fetch;
    window.fetch = function(url, opts){
      var p = origFetch.apply(this, arguments);
      try {
        var u = String(url||'');
        var isInfer = u.indexOf('openrouter.ai') !== -1 &&
                      opts && opts.headers && (opts.headers['X-Title'] === 'Chronicle TRPG (v259 state-inference)');
        if (!isInfer) return p;
        return p.then(function(res){
          var clone = res.clone();
          clone.json().then(function(json){
            var text = ((json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || '').trim();
            var items = lenientParse(text);
            console.log('[v260] inference re-parsed items:', items.length);
            applyItems(items);
          }).catch(function(){});
          return res;
        });
      } catch(e){}
      return p;
    };
    window.__v260FetchHooked = true;
  }

  function start(){
    installFetchHook();
    setInterval(function(){
      try { if (window.__v259) window.__v259.postProcessAllTurns(); } catch(e){}
      try { if (window.__v259) window.__v259.decorateCards(); } catch(e){}
    }, 2000);
  }

  if (document.readyState === 'complete') setTimeout(start, 1200);
  else { window.addEventListener('load', function(){ setTimeout(start, 1200); }); setTimeout(start, 4500); }

  console.log('[v260] init complete');
})();
