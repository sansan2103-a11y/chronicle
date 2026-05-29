// =====================================================================
// Chronicle TRPG — v292Dfix135+136+137: Long-term memory
//
//   fix135 Auto-Summary  — keep a rolling "story so far" (~300 chars)
//   fix136 Auto-WorldInfo— auto-extracted cast/place/object DB
//   fix137 Event Timeline— time-stamped key events (death/escape/...)
//
//   All three are produced by ONE LLM call every REBUILD_INTERVAL turns
//   (cost minimization). Results are persisted to localStorage and
//   exposed via window.__longmem.* for features.js's build-wrap to
//   read and inject into sys.
//
//   Designed to match (and arguably surpass) AI Dungeon's World Info /
//   Memory mechanics by being fully AUTOMATIC — no manual user upkeep.
// =====================================================================
(function v292Dfix135(){
  'use strict';
  if (window.__v292Dfix135) return;
  window.__v292Dfix135 = true;

  var TAG = '[v292Dfix135:longmem]';
  var LSP_SUMMARY   = 'chr6_v292Dfix135_sum';
  var LSP_WORLDINFO = 'chr6_v292Dfix136_wi';
  var LSP_EVENTS    = 'chr6_v292Dfix137_ev';
  var LSP_LASTBUILD = 'chr6_v292Dfix135_last';

  var REBUILD_INTERVAL = 5;          // rebuild every N new turns
  var ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

  function getModel(){
    try { var c = JSON.parse(localStorage.getItem('chr6') || '{}').cfg || {}; return c.orModel || 'nousresearch/hermes-4-405b'; } catch(e){ return 'nousresearch/hermes-4-405b'; }
  }
  function getKey(){
    try { var c = JSON.parse(localStorage.getItem('chr6') || '{}').cfg || {}; return c.orKey || ''; } catch(e){ return ''; }
  }
  function getState(){
    try { if (typeof S !== 'undefined' && S) return S; } catch(e){}
    return window.S || null;
  }

  // ---------- storage ----------
  function loadSummary(){ try { return localStorage.getItem(LSP_SUMMARY) || ''; } catch(e){ return ''; } }
  function saveSummary(s){ try { localStorage.setItem(LSP_SUMMARY, String(s || '').slice(0, 800)); } catch(e){} }
  function loadWorldInfo(){ try { return JSON.parse(localStorage.getItem(LSP_WORLDINFO) || '[]') || []; } catch(e){ return []; } }
  function saveWorldInfo(arr){ try { localStorage.setItem(LSP_WORLDINFO, JSON.stringify((arr || []).slice(0, 40))); } catch(e){} }
  function loadEvents(){ try { return JSON.parse(localStorage.getItem(LSP_EVENTS) || '[]') || []; } catch(e){ return []; } }
  function saveEvents(arr){ try { localStorage.setItem(LSP_EVENTS, JSON.stringify((arr || []).slice(0, 20))); } catch(e){} }
  function loadLastBuild(){ try { return parseInt(localStorage.getItem(LSP_LASTBUILD) || '-1', 10); } catch(e){ return -1; } }
  function saveLastBuild(idx){ try { localStorage.setItem(LSP_LASTBUILD, String(idx)); } catch(e){} }

  // ---------- LLM call ----------
  function buildPrompt(prevSummary, prevWorldInfo, prevEvents, newTurns, startIdx){
    var newText = newTurns.map(function(t, i){
      var pt = (t.playerText || '').slice(0, 80);
      var nr = (t.narrative || '').slice(0, 1500);
      return '[Turn ' + (startIdx + i) + '] PLAYER: ' + pt + '\nNARR: ' + nr;
    }).join('\n\n');
    return 'You analyze a Japanese ongoing horror TRPG to maintain long-term memory.\n\n' +
      'PREVIOUS SUMMARY:\n' + (prevSummary || '(none)') + '\n\n' +
      'KNOWN WORLD INFO:\n' + (prevWorldInfo.length ? prevWorldInfo.map(function(w){return '- ' + w.name + ' (' + w.type + '): ' + w.desc;}).join('\n') : '(none)') + '\n\n' +
      'KEY EVENTS:\n' + (prevEvents.length ? prevEvents.map(function(e){return '- T' + e.turnIdx + ' (importance ' + e.importance + '): ' + e.event;}).join('\n') : '(none)') + '\n\n' +
      'NEW TURNS:\n' + newText + '\n\n' +
      'Produce a FRESH analysis as JSON with these fields:\n' +
      '{\n' +
      '  "summary": "Japanese, 300 chars max. The story so far — plot, current situation, character states. Replace the previous summary.",\n' +
      '  "worldinfo": [ { "name": "Japanese name", "type": "character|place|object|concept", "desc": "1 sentence Japanese: who/what" } ],\n' +
      '  "events": [ { "turnIdx": number, "event": "1 line Japanese: a major event (death/escape/encounter/loss/key decision)", "importance": 1-3 (3=critical) } ]\n' +
      '}\n' +
      'Rules: Output ONLY the JSON. Update/replace previous summary entirely. Merge new worldinfo entries with old (no duplicates by name). Keep worldinfo <= 30 (drop least relevant). Keep events <= 15 (drop low-importance old ones). Use turnIdx values from the [Turn N] markers above.';
  }

  function call(prompt, cb){
    var key = getKey();
    if (!key){ cb(null); return; }
    var body;
    try {
      body = JSON.stringify({
        model: getModel(),
        temperature: 0.3,
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      });
    } catch(e){ cb(null); return; }
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', ENDPOINT, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Authorization', 'Bearer ' + key);
      xhr.timeout = 45000;
      xhr.onload = function(){
        if (xhr.status >= 200 && xhr.status < 300){
          try {
            var j = JSON.parse(xhr.responseText);
            var content = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
            cb(parse(content));
          } catch(e){ cb(null); }
        } else { cb(null); }
      };
      xhr.onerror   = function(){ cb(null); };
      xhr.ontimeout = function(){ cb(null); };
      xhr.send(body);
    } catch(e){ cb(null); }
  }

  function parse(text){
    if (!text) return null;
    var s = String(text), i = s.indexOf('{'), j = s.lastIndexOf('}');
    if (i < 0 || j < 0 || j < i) return null;
    try {
      var obj = JSON.parse(s.slice(i, j + 1));
      if (!obj || typeof obj !== 'object') return null;
      return {
        summary: String(obj.summary || '').slice(0, 800),
        worldinfo: Array.isArray(obj.worldinfo) ? obj.worldinfo.filter(function(w){ return w && w.name && w.type && w.desc; }).slice(0, 40) : [],
        events: Array.isArray(obj.events) ? obj.events.filter(function(e){ return e && e.event && typeof e.turnIdx === 'number'; }).slice(0, 20) : []
      };
    } catch(e){ return null; }
  }

  // ---------- rebuild check & trigger ----------
  var BUSY = false;
  function maybeRebuild(){
    if (BUSY) return;
    var st = getState();
    if (!st || !st.turns || !st.turns.length) return;
    var curTurn = st.turns.length - 1;
    var lastBuild = loadLastBuild();
    if (curTurn < 2) return;                                  // need at least 3 turns
    if (lastBuild >= 0 && curTurn - lastBuild < REBUILD_INTERVAL) return;
    BUSY = true;
    var prevSum = loadSummary();
    var prevWI  = loadWorldInfo();
    var prevEv  = loadEvents();
    var startIdx = lastBuild + 1;
    var newTurns = st.turns.slice(startIdx, curTurn + 1);
    var prompt = buildPrompt(prevSum, prevWI, prevEv, newTurns, startIdx);
    call(prompt, function(result){
      BUSY = false;
      if (!result) return;
      if (result.summary) saveSummary(result.summary);
      if (result.worldinfo && result.worldinfo.length) saveWorldInfo(result.worldinfo);
      if (result.events && result.events.length) saveEvents(result.events);
      saveLastBuild(curTurn);
      try { console.log(TAG, 'rebuilt at turn', curTurn, '— summary:', (result.summary||'').length, 'chars, worldinfo:', result.worldinfo.length, ', events:', result.events.length); } catch(_){}
    });
  }

  // ---------- reset (called on story reset) ----------
  function reset(){
    try { localStorage.removeItem(LSP_SUMMARY); } catch(e){}
    try { localStorage.removeItem(LSP_WORLDINFO); } catch(e){}
    try { localStorage.removeItem(LSP_EVENTS); } catch(e){}
    try { localStorage.removeItem(LSP_LASTBUILD); } catch(e){}
  }

  // ---------- public API ----------
  window.__longmem = {
    getSummary: function(){ return loadSummary(); },
    getWorldInfoFor: function(text){
      var wi = loadWorldInfo();
      if (!wi.length) return [];
      if (!text) return wi.slice(0, 5);
      var rel = wi.filter(function(w){ return w.name && String(text).indexOf(w.name) >= 0; });
      // Always also include characters (active cast) since they often matter
      var chars = wi.filter(function(w){ return w.type === 'character' && rel.indexOf(w) < 0; });
      return rel.concat(chars).slice(0, 8);
    },
    getKeyEvents: function(){
      return loadEvents().filter(function(e){ return e.importance >= 2; }).slice(0, 6);
    },
    rebuild: maybeRebuild,
    reset: reset,
    raw: { loadSummary: loadSummary, loadWorldInfo: loadWorldInfo, loadEvents: loadEvents, loadLastBuild: loadLastBuild }
  };

  // ---------- periodic check: poll every 5s for new turn ----------
  var lastTurnCount = -1;
  setInterval(function(){
    var st = getState();
    if (!st || !st.turns) return;
    var tc = st.turns.length;
    if (tc !== lastTurnCount){
      lastTurnCount = tc;
      maybeRebuild();
    }
  }, 5000);

  // Initial check after 3s (handles page reload with existing state)
  setTimeout(function(){
    var st = getState();
    if (st && st.turns) lastTurnCount = st.turns.length;
    maybeRebuild();
  }, 3000);

  // Reset hook: if story turns drop to 0 (new story / reset), clear long-mem
  var prevTC = -1;
  setInterval(function(){
    var st = getState();
    if (!st || !st.turns) return;
    var tc = st.turns.length;
    if (prevTC > 0 && tc === 0){
      reset();
      try { console.log(TAG, 'story reset detected — long-mem cleared'); } catch(_){}
    }
    prevTC = tc;
  }, 4000);

  try { console.log(TAG, 'long-term memory active (fix135+136+137)'); } catch(_){}
})();
