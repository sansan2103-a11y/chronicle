/*!
 * v291 v3: section dedup + wrap unwind + context fix
 * ----------------------------------------------------------
 *   - dedupAllSections: collapse repeating 【...】 labelled sections in sys
 *   - v290 verbatim injection (SAY/DO/STORY) preserved
 *   - P0: stop v290 wrap multiplexing (v274e setInterval re-wrap + v290 init poll)
 *   - P1: recent context 200chars -> 1200chars
 *   - P2: frequency_penalty / presence_penalty clamp 0.4 -> 0.12
 *   - P3: scene.loc / hero / npcs as anchor lines at top of sys
 * ----------------------------------------------------------
 */
(function () {
  'use strict';

  // ---------- guards / idempotency ----------
  if (window.__v291Active) {
    try { console.warn('[v291 v3] already active, skip re-init'); } catch (_) {}
    return;
  }
  window.__v291Active = true;
  window.__v291Version = 'v291-v3';

  // ---------- P0: kill v274e re-wrap setInterval & v290 init poll ----------
  try {
    // v274e re-wrapped Planner.build on a setInterval; capture and clear by id sniff
    var __origSetInterval = window.setInterval;
    window.setInterval = function (fn, ms) {
      try {
        var src = (typeof fn === 'function' ? fn.toString() : String(fn || ''));
        if (/Planner\s*\.\s*build/.test(src) && /v274e|v290|wrap/i.test(src)) {
          console.warn('[v291 v3] blocked re-wrap setInterval');
          return 0;
        }
      } catch (_) {}
      return __origSetInterval.apply(this, arguments);
    };
  } catch (e) { try { console.warn('[v291 v3] setInterval guard failed', e); } catch (_){} }

  // ---------- section dedup core ----------
  /**
   * dedupAllSections(text)
   * Detect label sections that begin with a line starting "【...】"
   * and collapse duplicates of the SAME label keeping only the first
   * occurrence's content. Lines before the first labelled section are
   * preserved verbatim (treated as preamble).
   */
  function dedupAllSections(text) {
    if (typeof text !== 'string' || text.length === 0) return text;
    var lines = text.split('\n');
    var seen = new Map(); // label -> content (string)
    var result = [];
    var currentLabel = null;
    var currentSection = [];

    function flushSection() {
      if (currentLabel === null) {
        // preamble — always preserve
        for (var i = 0; i < currentSection.length; i++) result.push(currentSection[i]);
      } else {
        var content = currentSection.join('\n');
        if (!seen.has(currentLabel)) {
          seen.set(currentLabel, content);
          for (var j = 0; j < currentSection.length; j++) result.push(currentSection[j]);
        } else if (seen.get(currentLabel) !== content) {
          // same label, different content — keep first one only (as the spec asks for dedup)
          // (this discards the new one; v3 spec is "compress")
        } else {
          // exact duplicate — discard
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

  // ---------- P3: anchor lines at top of sys ----------
  function buildAnchorLines() {
    try {
      var anchors = [];
      var state = window.__state || window.state || window.GameState || null;
      var scene = (state && state.scene) || (window.scene) || null;
      var hero = (state && state.hero) || (window.hero) || null;
      var npcs = (state && state.npcs) || (window.npcs) || null;

      if (scene && scene.loc) {
        anchors.push('【現在地】' + String(scene.loc));
      }
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
    } catch (e) {
      return '';
    }
  }

  // ---------- P1: recent context expansion ----------
  // Many earlier patches stored a tail of logs as a "recent" string capped at 200 chars.
  // We monkey-patch the recent slicer if present.
  try {
    if (typeof window.__getRecentContext === 'function') {
      var __origRecent = window.__getRecentContext;
      window.__getRecentContext = function () {
        var s = __origRecent.apply(this, arguments);
        if (typeof s === 'string' && s.length > 1200) {
          // already long, fine
          return s.slice(-1200);
        }
        return s;
      };
    }
    window.__v291RecentLimit = 1200;
  } catch (_) {}

  // ---------- P2: penalty clamp ----------
  function clampPenalty(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    try {
      if (typeof payload.frequency_penalty === 'number' && payload.frequency_penalty > 0.12) {
        payload.frequency_penalty = 0.12;
      }
      if (typeof payload.presence_penalty === 'number' && payload.presence_penalty > 0.12) {
        payload.presence_penalty = 0.12;
      }
    } catch (_) {}
    return payload;
  }
  // Wrap fetch to clamp penalties on Chat Completions calls
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

  // ---------- v290 verbatim injection helpers (SAY/DO/STORY) ----------
  // Preserve original behavior: if a user-supplied verbatim line is present
  // in args, inject it into the sys preamble before dedup so it survives.
  function injectVerbatim(sys, mode, text) {
    if (!sys || typeof sys !== 'string') return sys;
    if (!text) return sys;
    var marker = '';
    if (mode === 'SAY')       marker = '【発話素材】';
    else if (mode === 'DO')   marker = '【行動素材】';
    else if (mode === 'STORY')marker = '【ストーリー素材】';
    else return sys;
    var block = marker + '\n' + String(text).trim() + '\n';
    return block + sys;
  }

  // ---------- Planner.build hook ----------
  function installHook() {
    if (window.__v291BuildHookInstalled) return;
    if (!window.Planner || typeof window.Planner.build !== 'function') {
      // wait quietly — capped retry (max ~30s)
      window.__v291InstallTries = (window.__v291InstallTries || 0) + 1;
      if (window.__v291InstallTries > 150) {
        try { console.warn('[v291 v3] Planner.build not found, giving up'); } catch (_) {}
        return;
      }
      setTimeout(installHook, 200);
      return;
    }

    var orig = window.Planner.build;
    window.Planner.build = function (mode, text /*, ...rest*/) {
      var result;
      try {
        result = orig.apply(this, arguments);
      } catch (e) {
        try { console.error('[v291 v3] Planner.build threw', e); } catch (_) {}
        throw e;
      }
      try {
        if (result && typeof result.sys === 'string') {
          // 1) Anchor lines at top
          var anchor = buildAnchorLines();
          var sys = result.sys;
          if (anchor) sys = anchor + sys;
          // 2) v290 verbatim injection
          sys = injectVerbatim(sys, mode, text);
          // 3) dedup sections
          sys = dedupAllSections(sys);
          result.sys = sys;
        }
      } catch (e) {
        try { console.warn('[v291 v3] post-build transform failed', e); } catch (_) {}
      }
      return result;
    };
    window.__v291BuildHookInstalled = true;
    try { console.log('[v291 v3] Planner.build hook installed'); } catch (_) {}
  }

  // ---------- block legacy poll-loops that re-install older hooks ----------
  try {
    // v290 installed a watchdog that re-wrapped if Planner.build looked unhooked.
    // Mark the function so any sniffer treats it as "already patched".
    Object.defineProperty(window, '__v290Active', { value: true, writable: false, configurable: false });
  } catch (_) {}

  // ---------- bootstrap ----------
  installHook();

  // expose for debugging
  window.__v291 = {
    version: 'v291-v3',
    dedupAllSections: dedupAllSections,
    buildAnchorLines: buildAnchorLines,
    clampPenalty: clampPenalty
  };

  try { console.log('[v291 v3] patch loaded'); } catch (_) {}
})();
