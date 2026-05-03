/* v208-magnum-option: add Magnum V4 72B (and a few other ADV-friendly models)
   to the model dropdown so they survive saving the settings panel.
   Watches for #cfg-model (or any select whose options reference openrouter model IDs)
   and injects extra <option> elements if they're missing. Also re-syncs the
   selected value from localStorage chr6.cfg.orModel so reopening the panel
   shows the active model instead of blank. */
(function v208(){
  'use strict';
  if (window.__v208Active) return;
  window.__v208Active = true;

  var EXTRA_MODELS = [
    { id: 'anthracite-org/magnum-v4-72b',          label: 'Magnum V4 72B (ADV向け)' },
    { id: 'neversleep/llama-3.1-lumimaid-70b',     label: 'Lumimaid 70B' },
    { id: 'sao10k/l3.3-euryale-70b',               label: 'Euryale 70B v3' }
  ];

  function read(){
    try { return JSON.parse(localStorage.getItem('chr6') || '{}'); }
    catch(e){ return {}; }
  }

  function findModelSelect(){
    /* Try common ids/names first */
    var byId = document.getElementById('cfg-model')
            || document.getElementById('model-select')
            || document.getElementById('orModel');
    if (byId && byId.tagName === 'SELECT') return byId;
    /* Fallback: any <select> whose options include an openrouter model id */
    var selects = document.querySelectorAll('select');
    for (var i = 0; i < selects.length; i++){
      var s = selects[i];
      for (var j = 0; j < s.options.length; j++){
        var v = s.options[j].value || '';
        if (/\//.test(v) && /(hermes|llama|euryale|gemma|mistral|magnum|lumimaid|nemo)/i.test(v)){
          return s;
        }
      }
    }
    return null;
  }

  function patchSelect(sel){
    if (!sel || sel.__v208Patched) return false;
    var existing = {};
    for (var i = 0; i < sel.options.length; i++){
      existing[sel.options[i].value] = true;
    }
    var added = 0;
    EXTRA_MODELS.forEach(function(m){
      if (existing[m.id]) return;
      var opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.label;
      sel.appendChild(opt);
      added++;
    });

    /* Re-sync selected value from localStorage */
    var s = read();
    var current = s.cfg && s.cfg.orModel;
    if (current){
      var has = false;
      for (var k = 0; k < sel.options.length; k++){
        if (sel.options[k].value === current){ has = true; break; }
      }
      if (has) sel.value = current;
    }
    sel.__v208Patched = true;
    if (added > 0){
      console.log('[v208] added', added, 'model option(s); current=', sel.value);
    }
    return true;
  }

  function tryPatch(){
    var sel = findModelSelect();
    if (sel) patchSelect(sel);
  }

  function init(){
    tryPatch();
    /* Settings panel may be lazily mounted — observe DOM for new selects */
    var mo = new MutationObserver(function(){ tryPatch(); });
    mo.observe(document.body, { childList: true, subtree: true });
    /* Also a fallback poll for 30s in case observer misses something */
    var ticks = 0;
    var iv = setInterval(function(){
      tryPatch();
      if (++ticks > 30) clearInterval(iv);
    }, 1000);
    console.log('[v208] active: Magnum V4 72B option injector');
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
