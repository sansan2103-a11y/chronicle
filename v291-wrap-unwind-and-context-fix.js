/*!
 * v291 v3.1: section dedup + wrap unwind + context fix + watchdog
 * ----------------------------------------------------------
 *   - dedupAllSections: collapse repeating 【...】 labelled sections in sys
 *   - v290 verbatim injection (SAY/DO/STORY) preserved
 *   - P0: stop v290 wrap multiplexing (v274e setInterval re-wrap + v290 init poll)
 *   - P1: recent context 200chars -> 1200chars
 *   - P2: frequency_penalty / presence_penalty clamp 0.4 -> 0.12
 *   - P3: scene.loc / hero / npcs as anchor lines at top of sys
 *   - WATCHDOG: re-apply our hook if a later patch overwrites it
 * ----------------------------------------------------------
 */
(function () {
  'use strict';

  if (window.__v291Active) {
    try { console.warn('[v291 v3] already active, skip re-init'); } catch (_) {}
    return;
  }
  window.__v291Active = true;
  window.__v291Version = 'v291-v3.1';

  // Save original setInterval BEFORE wrapping so our watchdog can use it
  window.__origSetIntervalRaw = window.setInterval.bind(window);

  // P0: kill v274e re-wrap setInterval & v290 init poll
  try {
    var __origSetInterval = window.setInterval;
    window.setInterval = function (fn, ms) {
      try {
        var src = (typeof fn === 'function' ? fn.toString() : String(fn || ''));
        if (!/__v291Wrapped/.test(src) && /Planner\s*\.\s*build/.test(src) && /v274e|v290|wrap/i.test(src)) {
          console.warn('[v291 v3] blocked re-wrap setInterval');
          return 0;
        }
      } catch (_) {}
      return __origSetInterval.apply(this, arguments);
    };
  } catch (e) { try { console.warn('[v291 v3] setInterval guard failed', e); } catch (_){} }

  // Section dedup core
  function dedupAllSections(text) {
    if (typeof text !== 'string' || text.length === 0) return text;
    var lines = text.split('\n');
    var seen = new Map();
    var result = [];
    var currentLabel = null;
    var currentSection = [];

    function flushSection() {
      if (currentLabel === null) {
        for (var i = 0; i < currentSection.length; i++) result.push(currentSection[i]);
      } else {
        var content = currentSection.join('\n');
        if (!seen.has(currentLabel)) {
          seen.set(currentLabel, content);
          for (var j = 0; j < currentSection.length; j++) result.push(currentSection[j]);
        }
      }
      currentSection = [];
    }

    var labelRe = /^【.+?】/;
    for (var k = 0; k < lines.length; k++) {
      var line = lines[k];
      var m = line.match(labelRe);
      if (m) {
        flushSection();
        currentLabel = m[0];
        currentSection = [line];
      } else {
        currentSection.push(line);
      }
    }
    flushSection();
    return result.join('\n');
  }
  window.__v291DedupAllSections = dedupAllSections;

  // P3: anchor lines
  function buildAnchorLines() {
    try {
      var anchors = [];
      var state = window.__state || window.state || window.GameState || null;
      var scene = (state && state.scene) || window.scene || null;
      var hero = (state && state.hero) || window.hero || null;
      var npcs = (state && state.npcs) || window.npcs || null;
      if (scene && scene.loc) anchors.push('【現在地】' + String(scene.loc));
      if (hero) {
        var heroName = hero.name || hero.id || 'PC';
        var heroHp = (hero.hp !== undefined ? ('/HP=' + hero.hp) : '');
        anchors.push('【PC】' + heroName + heroHp);
      }
      if (npcs && (Array.isArray(npcs) ? npcs.length : Object.keys(npcs).length)) {
        var list = Array.isArray(npcs) ? npcs : Object.values(npcs);
        var names = list.slice(0, 6).map(function (n) { return n && (n.name || n.id) || ''; }).filter(Boolean);
        if (names.length) anchors.push('【同席NPC】' + names.join('、'));
      }
      return anchors.length ? anchors.join('\n') + '\n' : '';
    } catch (e) { return ''; }
  }

  // P1: recent context expansion
  try {
    if (typeof window.__getRecentContext === 'function') {
      var __origRecent = window.__getRecentContext;
      window.__getRecentContext = function () {
        var s = __origRecent.apply(this, arguments);
        if (typeof s === 'string' && s.length > 1200) return s.slice(-1200);
        return s;
      };
    }
    window.__v291RecentLimit = 1200;
  } catch (_) {}

  // P2: penalty clamp
  function clampPenalty(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    try {
      if (typeof payload.frequency_penalty === 'number' && payload.frequency_penalty > 0.12) payload.frequency_penalty = 0.12;
      if (typeof payload.presence_penalty === 'number' && payload.presence_penalty > 0.12) payload.presence_penalty = 0.12;
    } catch (_) {}
    return payload;
  }
  try {
    var __origFetch = window.fetch;
    window.fetch = function (input, init) {
      try {
        if (init && typeof init.body === 'string' && /(?:openai|chat\/completions|anthropic|messages)/i.test(String(input))) {
          var b = JSON.parse(init.body);
          clampPenalty(b);
          init.body = JSON.stringify(b);
        }
      } catch (_) {}
      return __origFetch.apply(this, arguments);
    };
  } catch (_) {}

  // v290 verbatim injection helpers
  function injectVerbatim(sys, mode, text) {
    if (!sys || typeof sys !== 'string') return sys;
    if (!text) return sys;
    var marker = '';
    if (mode === 'SAY')       marker = '【発話素材】';
    else if (mode === 'DO')   marker = '【行動素材】';
    else if (mode === 'STORY')marker = '【ストーリー素材】';
    else return sys;
    return marker + '\n' + String(text).trim() + '\n' + sys;
  }

  // Build our wrapping function (used by installHook AND watchdog)
  function makeWrap(inner) {
    var wrap = function () {
      var result = inner.apply(this, arguments);
      try {
        if (result && typeof result.sys === 'string') {
          var mode = arguments[0];
          var text = arguments[1];
          var anchor = buildAnchorLines();
          var sys = result.sys;
          if (anchor) sys = anchor + sys;
          sys = injectVerbatim(sys, mode, text);
          sys = dedupAllSections(sys);
          result.sys = sys;
        }
      } catch (_) {}
      return result;
    };
    wrap.__v291Wrapped = true;
    return wrap;
  }

  function installHook() {
    if (window.__v291BuildHookInstalled) return;
    if (!window.Planner || typeof window.Planner.build !== 'function') {
      window.__v291InstallTries = (window.__v291InstallTries || 0) + 1;
      if (window.__v291InstallTries > 150) {
        try { console.warn('[v291 v3] Planner.build not found, giving up'); } catch (_) {}
        return;
      }
      setTimeout(installHook, 200);
      return;
    }
    window.Planner.build = makeWrap(window.Planner.build);
    window.__v291BuildHookInstalled = true;
    try { console.log('[v291 v3] Planner.build hook installed'); } catch (_) {}
  }

  // Watchdog: re-apply hook if dropped
  function startWatchdog() {
    var ticks = 0;
    var maxTicks = 600;
    var origSI = window.__origSetIntervalRaw || setInterval;
    origSI(function () {
      ticks++;
      if (ticks > maxTicks) return;
      try {
        if (!window.Planner || typeof window.Planner.build !== 'function') return;
        if (window.Planner.build.__v291Wrapped) return;
        window.Planner.build = makeWrap(window.Planner.build);
        try { console.log('[v291 v3] watchdog re-applied (tick=' + ticks + ')'); } catch (_) {}
      } catch (_) {}
    }, 1000);
  }

  // Block legacy v290 watchdogs
  try {
    Object.defineProperty(window, '__v290Active', { value: true, writable: false, configurable: false });
  } catch (_) {}

  installHook();
  startWatchdog();

  window.__v291 = {
    version: 'v291-v3.1',
    dedupAllSections: dedupAllSections,
    buildAnchorLines: buildAnchorLines,
    clampPenalty: clampPenalty
  };

  try { console.log('[v291 v3.1] patch loaded'); } catch (_) {}
})();
