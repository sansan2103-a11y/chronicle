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

  var REBUILD_INTERVAL = 3;          // v292Dfix152-A: 5→3 for fresher char state (death/injury reflected within 3 turns)
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

  // v292Dfix143: stronger scene-relevance scoring for B. Uses last 3 turns' narrative
  // + playerText to extract referenced names, then scores worldinfo by:
  //   +5 if name appears in recent text  +3 if active hero  +2 if active NPC  +1 type=place
  // Returns top N by score (filter score>0 unless caller wants baseline).
  function recentTextForRelevance(){
    try {
      var st = (typeof S !== 'undefined' && S) ? S : window.S;
      if (!st || !st.turns) return '';
      var n = Math.min(3, st.turns.length);
      var slice = st.turns.slice(-n);
      return slice.map(function(t){ return (t.playerText || '') + ' ' + (t.narrative || ''); }).join(' ');
    } catch(e){ return ''; }
  }
  function activeCastNames(){
    var heroName = '', npcNames = [];
    try {
      var st = (typeof S !== 'undefined' && S) ? S : window.S;
      if (st && st.cast){
        if (st.cast.hero && st.cast.hero.name) heroName = st.cast.hero.name;
        if (Array.isArray(st.cast.npcs)) npcNames = st.cast.npcs.map(function(n){ return n && n.name; }).filter(Boolean);
      }
    } catch(e){}
    return { hero: heroName, npcs: npcNames };
  }

  // ---------- public API ----------
  window.__longmem = {
    getSummary: function(){ return loadSummary(); },
    // v292Dfix143: limit defaults to 8; pass smaller for compression mode (A)
    getWorldInfoFor: function(text, limit){
      var wi = loadWorldInfo();
      if (!wi.length) return [];
      limit = (typeof limit === 'number' && limit > 0) ? limit : 8;
      // Build relevance text = explicit `text` + recent 3-turn context
      var relText = (text || '') + ' ' + recentTextForRelevance();
      var cast = activeCastNames();
      var scored = wi.map(function(w){
        var score = 0;
        if (w.name){
          if (relText.indexOf(w.name) >= 0) score += 5;
          if (cast.hero && cast.hero === w.name) score += 3;
          if (cast.npcs.indexOf(w.name) >= 0) score += 2;
        }
        if (w.type === 'character' && score === 0) score += 0.5;  // baseline floor for any char
        return { w: w, score: score };
      });
      scored.sort(function(a, b){ return b.score - a.score; });
      return scored.filter(function(s){ return s.score > 0; }).map(function(s){ return s.w; }).slice(0, limit);
    },
    // v292Dfix143: limit defaults to 6; pass smaller for compression mode (A).
    // Scoring: importance×2 + recency_bonus(closer turn=+) + mention_in_recent_text(+3).
    getKeyEvents: function(limit){
      limit = (typeof limit === 'number' && limit > 0) ? limit : 6;
      var ev = loadEvents().filter(function(e){ return e.importance >= 2; });
      if (!ev.length) return [];
      var relText = recentTextForRelevance();
      var maxTurn = ev.reduce(function(m, e){ return Math.max(m, e.turnIdx || 0); }, 0);
      var scored = ev.map(function(e){
        var score = (e.importance || 0) * 2;
        // v292Dfix152-C: stronger recency weight so "what just happened" is prioritized.
        // 直近2ターン=+5 / 5ターン=+3 / 10ターン=+1 (previously max +3 across 5 turns).
        // これでミホ死亡みたいな最新事象が確実に sys に入る。
        if (typeof e.turnIdx === 'number' && maxTurn > 0){
          var dist = maxTurn - e.turnIdx;
          if (dist <= 2) score += 5;
          else if (dist <= 5) score += 3;
          else if (dist <= 10) score += 1;
        }
        // mention in recent narrative: +3
        if (e.event && relText.indexOf(String(e.event).substring(0, 10)) >= 0) score += 3;
        return { e: e, score: score };
      });
      scored.sort(function(a, b){ return b.score - a.score; });
      return scored.map(function(s){ return s.e; }).slice(0, limit);
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
