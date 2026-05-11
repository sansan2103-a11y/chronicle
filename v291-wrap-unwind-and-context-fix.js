/* v291-wrap-unwind-and-context-fix.js
 *
 * Root-cause fix for v290's Planner.build multi-wrap explosion + recent
 * context starvation + over-aggressive penalty + missing scene anchor.
 *
 * Per the v290 root-cause analysis (P0–P3):
 *
 *  P0  v290 has TWO wrap functions on Planner.build (wrapPlannerBuild and
 *      wrapBuildForStash). Each sets ONLY its own flag on the new outer
 *      wrapper, so after both run once the outermost wrapper has at most one
 *      of (__v290Wrapped, __v290StashWrapped) — never both — and the OTHER
 *      wrap re-fires every subsequent init(). v290 schedules init() 4 times
 *      via setTimeout and 30 times via setInterval (every 500ms for ~15s),
 *      so Planner.build accrued ~60+ wrap layers. Each layer prepends/
 *      appends a SAY/DO/STORY directive to result.sys, blowing the system
 *      prompt up to ~57.5KB and reproducing "v290: SAY" ~70 times.
 *
 *      Fix: at v291 load, install our single v291 wrap and LOCK Planner.build
 *      behind a getter/setter. When v290's later init() does
 *      `Planner.build = function(...) {}`, our setter detects v290 in the
 *      stack, silently absorbs the assignment (so the v291 wrapper stays
 *      outermost), and lets v290's follow-up `Planner.build.__v290[Stash]Wrapped
 *      = true` land on our v291 wrapper via the getter. On the next init,
 *      v290's idempotency checks pass and it skips wrapping entirely.
 *
 *  P1  simpleMode in index.html uses recent.slice(-200), starving the model
 *      of context. Post-process result.user to swap the 200-char window for
 *      a 1200-char window rebuilt from S.turns.
 *
 *  P2  OpenRouter requests get presence_penalty / frequency_penalty pushed
 *      to 0.45 / 0.55 by v211 (Hermes branch) and 0.3 by v246. For Japanese
 *      output these penalties suppress natural particle/connective repetition
 *      and induce grammar collapse. We force penalty = 0.12 by intercepting
 *      init.body via a property setter so v211/v246's later mutations get
 *      re-clamped before fetch goes out.
 *
 *  P3  Inject a "【現在の場面・登場人物】" anchor section at the top of
 *      result.sys so location / hero / NPCs are always present even after
 *      context truncation. The lifeline when the model drifts.
 */
(function v291(){
  'use strict';
  var TAG = '[v291]';
  if (window.__v291Active) return;
  window.__v291Active = true;

  // Preempt v290's hook installation if it hasn't run yet
  if (typeof window.__v290BuildHookInstalled === 'undefined') {
    window.__v290BuildHookInstalled = false;
  }

  // -------------------------------------------------------------------------
  // P3  Scene/cast anchor
  // -------------------------------------------------------------------------

  function buildSceneAnchor() {
    var S = window.S;
    if (!S || typeof S !== 'object') return '';
    var scene = S.scene || {};
    var cast  = S.cast  || {};
    var hero  = cast.hero || {};
    var npcs  = Array.isArray(cast.npcs) ? cast.npcs.filter(function(n){ return n && !n.dead; }) : [];
    var loc   = scene.location || scene.loc || '';
    var tone  = scene.tone || '';
    var obj   = scene.obj  || '';

    var lines = ['【現在の場面・登場人物】'];
    if (loc)        lines.push('・場所：' + loc);
    if (hero.name)  lines.push('・主人公：' + hero.name + (hero.desc ? '（' + hero.desc + '）' : ''));
    if (npcs.length) {
      lines.push('・登場NPC：');
      npcs.slice(0, 6).forEach(function(n){
        var seg = '  - ' + (n.name || '');
        if (n.desc) seg += '：' + n.desc;
        var meta = [];
        if (typeof n.stress === 'number') meta.push('stress=' + n.stress);
        if (n.emotion) meta.push('emotion=' + n.emotion);
        if (meta.length) seg += ' (' + meta.join(', ') + ')';
        lines.push(seg);
      });
    }
    if (tone) lines.push('・トーン：' + tone);
    if (obj)  lines.push('・目的：' + obj);
    if (lines.length === 1) return '';
    return lines.join('\n');
  }

  function injectAnchor(sys) {
    if (typeof sys !== 'string') return sys;
    if (sys.indexOf('【現在の場面・登場人物】') >= 0) return sys;
    var anchor = buildSceneAnchor();
    if (!anchor) return sys;
    return anchor + '\n\n' + sys;
  }

  // -------------------------------------------------------------------------
  // P1  Extend recent window 200 → 1200 chars (simpleMode path)
  // -------------------------------------------------------------------------

  function extendRecentSlice(userStr) {
    if (typeof userStr !== 'string') return userStr;
    var headerRe = /【直前の物語（参考。要約・繰返厳禁）】\n/;
    if (!headerRe.test(userStr)) return userStr;

    var S = window.S;
    if (!S || !Array.isArray(S.turns)) return userStr;

    var recent = '';
    var turns = S.turns;
    for (var i = turns.length - 1; i >= Math.max(0, turns.length - 4); i--) {
      var t = turns[i];
      var nar = Array.isArray(t && t.narrative) ? t.narrative.join('\n') : ((t && t.text) || '');
      recent = nar + '\n' + recent;
    }
    recent = recent.trim().slice(-1200);
    if (!recent) return userStr;

    return userStr.replace(
      /(【直前の物語（参考。要約・繰返厳禁）】\n)[\s\S]*?(\n\n)/,
      function(_m, head, tail) { return head + recent + tail; }
    );
  }

  // -------------------------------------------------------------------------
  // v290 transforms + dedup safety
  // -------------------------------------------------------------------------

  function applyV290Transforms(result, inputType, inputText) {
    if (!result || typeof result !== 'object') return result;
    if (inputType !== 'SAY' && inputType !== 'DO' && inputType !== 'STORY') return result;
    if (typeof inputText !== 'string') return result;
    var V = window.__v290;
    if (!V) return result;

    try {
      if (typeof result.sys === 'string' && typeof V.transformSys === 'function') {
        result.sys = V.transformSys(result.sys, inputType, inputText);
      }
    } catch (e) { console.warn(TAG, 'transformSys err', e && e.message); }

    try {
      if (typeof result.user === 'string') {
        if (result.user.indexOf('"recentHistory"') >= 0 && typeof V.transformUserJson === 'function') {
          result.user = V.transformUserJson(result.user, inputType, inputText);
        } else if (typeof V.transformUserPlain === 'function') {
          result.user = V.transformUserPlain(result.user, inputType, inputText);
        }
      }
    } catch (e) { console.warn(TAG, 'transformUser err', e && e.message); }

    return result;
  }

  // Safety net: dedupe repeated v290 directive blocks in result.sys.
  // Keeps the FIRST occurrence of each mode-block (SAY/DO/STORY).
  function dedupV290Directives(sys) {
    if (typeof sys !== 'string') return sys;
    var blockHeader = /【★v290:\s*(SAY|DO|STORY)/;
    var lines = sys.split('\n');
    var totalCount = 0;
    for (var i = 0; i < lines.length; i++) {
      if (blockHeader.test(lines[i])) totalCount++;
    }
    if (totalCount <= 2) return sys;

    var seenByMode = { SAY: 0, DO: 0, STORY: 0 };
    var out = [];
    var skipping = false;
    for (var j = 0; j < lines.length; j++) {
      var ln = lines[j];
      var m = ln.match(blockHeader);
      if (m) {
        var mode = m[1];
        seenByMode[mode] = (seenByMode[mode] || 0) + 1;
        if (seenByMode[mode] === 1) {
          skipping = false;
          out.push(ln);
        } else {
          // Drop duplicate block
          skipping = true;
        }
        continue;
      }
      if (skipping) {
        if (/^【/.test(ln) && !/v290/.test(ln)) {
          skipping = false;
          out.push(ln);
          continue;
        }
        continue;
      }
      out.push(ln);
    }
    return out.join('\n');
  }

  function v291PostProcess(result, inputType, inputText) {
    if (!result || typeof result !== 'object') return result;

    result = applyV290Transforms(result, inputType, inputText);

    if (typeof result.sys === 'string') {
      result.sys = dedupV290Directives(result.sys);
    }

    if (typeof result.user === 'string') {
      try { result.user = extendRecentSlice(result.user); }
      catch (e) { console.warn(TAG, 'extendRecent err', e && e.message); }
    }

    if (typeof result.sys === 'string') {
      try { result.sys = injectAnchor(result.sys); }
      catch (e) { console.warn(TAG, 'anchor err', e && e.message); }
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // Install: lock Planner.build behind v291 absorber
  // -------------------------------------------------------------------------

  function markV290FlagsOn(fn) {
    if (typeof fn !== 'function') return;
    try {
      fn.__v290Wrapped = true;
      fn.__v290StashWrapped = true;
    } catch (e) { /* readonly */ }
  }

  var __v291BuildSlot = null;

  function makeV291Wrapper(origBuild) {
    var wrapped = function v291Build(inputType, inputText) {
      try {
        if ((inputType === 'SAY' || inputType === 'DO' || inputType === 'STORY') &&
            typeof inputText === 'string') {
          window.__v290LastInput = { type: inputType, text: inputText, t: Date.now() };
        }
      } catch (e) { /* noop */ }

      var result;
      try { result = origBuild.call(window.Planner, inputType, inputText); }
      catch (e) {
        console.warn(TAG, 'chain build threw', e && e.message);
        throw e;
      }

      try { result = v291PostProcess(result, inputType, inputText); }
      catch (e) { console.warn(TAG, 'postProcess err', e && e.message); }

      if (!window.__v291LoggedBuildOnce) {
        window.__v291LoggedBuildOnce = true;
        var sysLen = (result && typeof result.sys === 'string') ? result.sys.length : -1;
        var userLen = (result && typeof result.user === 'string') ? result.user.length : -1;
        console.log(TAG, 'first build through v291: type=' + inputType +
          ' sys=' + sysLen + ' user=' + userLen);
      }
      return result;
    };
    wrapped.__v291Wrapped = true;
    wrapped.__v290Wrapped = true;
    wrapped.__v290StashWrapped = true;
    return wrapped;
  }

  function install() {
    if (!window.Planner || typeof window.Planner.build !== 'function') return false;
    if (__v291BuildSlot) {
      markV290FlagsOn(__v291BuildSlot);
      window.__v290BuildHookInstalled = true;
      return true;
    }

    var current = window.Planner.build;
    markV290FlagsOn(current);
    window.__v290BuildHookInstalled = true;

    __v291BuildSlot = makeV291Wrapper(current);

    try {
      Object.defineProperty(window.Planner, 'build', {
        configurable: true,
        get: function () { return __v291BuildSlot; },
        set: function (newFn) {
          if (typeof newFn !== 'function') { __v291BuildSlot = newFn; return; }
          if (newFn.__v291Wrapped) { __v291BuildSlot = newFn; return; }
          var stack = '';
          try { stack = (new Error()).stack || ''; } catch (e) {}
          if (/v290-verbatim-input/.test(stack)) {
            // Absorb v290's wrap. v290's follow-up flag-setting will go
            // through our getter and mark the v291 wrapper; v290's next
            // init sees the flags and skips.
            return;
          }
          // Any other caller: wrap their new fn under v291
          __v291BuildSlot = makeV291Wrapper(newFn);
        }
      });
    } catch (e) {
      // defineProperty failed — fall back to plain assignment
      window.Planner.build = __v291BuildSlot;
    }

    console.log(TAG, 'Planner.build locked behind v291 absorber');
    return true;
  }

  // Run immediately. If Planner isn't ready yet, retry shortly.
  if (!install()) {
    Promise.resolve().then(install);
    setTimeout(install, 0);
    setTimeout(install, 50);
  }

  // Keep re-marking flags on the slot for ~20s in case any patch bypasses our setter
  var attempts = 0;
  var iv = setInterval(function () {
    install();
    if (__v291BuildSlot) markV290FlagsOn(__v291BuildSlot);
    if (++attempts > 80) clearInterval(iv);
  }, 250);

  // -------------------------------------------------------------------------
  // P2  Penalty injection via init.body setter
  // -------------------------------------------------------------------------

  var FREQ_PEN = 0.12;
  var PRES_PEN = 0.12;
  var API_RE = /openrouter\.ai|api\.anthropic\.com|api\.openai\.com/;

  function overridePenaltyInBody(bodyStr) {
    if (typeof bodyStr !== 'string') return bodyStr;
    try {
      var b = JSON.parse(bodyStr);
      if (b && typeof b === 'object') {
        b.frequency_penalty = FREQ_PEN;
        b.presence_penalty  = PRES_PEN;
        return JSON.stringify(b);
      }
    } catch (e) { /* not JSON */ }
    return bodyStr;
  }

  function makeFetchHook(prevFetch) {
    var hooked = function v291Fetch(input, init) {
      try {
        var url = '';
        if (typeof input === 'string') url = input;
        else if (input && typeof input.url === 'string') url = input.url;

        if (API_RE.test(url) && init && typeof init.body === 'string') {
          init.body = overridePenaltyInBody(init.body);
          var stored = init.body;
          try {
            Object.defineProperty(init, 'body', {
              configurable: true,
              get: function () { return stored; },
              set: function (v) {
                if (typeof v === 'string') stored = overridePenaltyInBody(v);
                else stored = v;
              }
            });
          } catch (e) { /* non-configurable on some Request objects */ }

          if (!window.__v291PenaltyLogged) {
            window.__v291PenaltyLogged = true;
            console.log(TAG, 'penalties clamped: freq=' + FREQ_PEN + ' pres=' + PRES_PEN);
          }
        }
      } catch (e) { console.warn(TAG, 'fetch hook err', e && e.message); }
      return prevFetch(input, init);
    };
    hooked.__v291PenaltyHook = true;
    // Defeat fetch re-wrap loops from earlier patches that check their own
    // idempotency flag on window.fetch (v287-hermes4-pin, v288-mind-comma-repair).
    hooked.__v287Wrapped = true;
    hooked.__v288Wrapped = true;
    return hooked;
  }

  function ensureFetchHook() {
    if (typeof window.fetch !== 'function') return;
    if (window.fetch.__v291PenaltyHook) return;
    var prev = window.fetch.bind(window);
    window.fetch = makeFetchHook(prev);
  }

  ensureFetchHook();
  var fetchAttempts = 0;
  var fetchIv = setInterval(function () {
    ensureFetchHook();
    if (++fetchAttempts > 80) clearInterval(fetchIv);
  }, 250);

  // -------------------------------------------------------------------------
  // Diag helpers
  // -------------------------------------------------------------------------
  window.__v291 = {
    install: install,
    buildSceneAnchor: buildSceneAnchor,
    injectAnchor: injectAnchor,
    extendRecentSlice: extendRecentSlice,
    dedupV290Directives: dedupV290Directives,
    overridePenaltyInBody: overridePenaltyInBody,
    ensureFetchHook: ensureFetchHook,
    FREQ_PEN: FREQ_PEN,
    PRES_PEN: PRES_PEN
  };

  console.log(TAG, 'active — wrap absorb + recent 1200 + penalty 0.12 + scene anchor');
})();
