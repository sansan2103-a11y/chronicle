/* =====================================================================
 * v292Dfix802-refresh-orchestrator.js
 *   3C-3B Refresh Orchestrator（telemetry / write-0・default OFF・QA canary only）
 * ---------------------------------------------------------------------
 * 正本: GPT_RULING_3C3B_FINAL_20260903.md（Q1〜Q5）／
 *       FABLE51_3C3B_REFRESH_ORCHESTRATOR_DESIGN_20260903.md §1〜§4 ＋ Rev2。
 * 責務（これ以外を持たない）:
 *   settled evidence（LANDED = fix697 の 3 境界から one-line notify）
 *   ＋ raw readiness（RAW_READY = fix670 reconcile 終端から one-line notify・R1 authority）
 *   → eligibility（two-latch・順序非依存・後に来た方で 1 回だけ）
 *   → boundary guard（story-scoped raw の maxSourceTurnIndex <= landed.turnCount-1）
 *   → 789.adjudicate → 790.build → 791.build → 792.build（slotId 明示・順次 await）
 *   → 5層 READ → 793.__test.materializeFrom（純関数・dry materialize）
 *   → full candidate hash（ACTIVE＋PENDING_REF の records＋edges・deterministic）
 *   → telemetry（status()・in-memory のみ）。
 * ★禁止（実装に無いことを fixture が機械確認する）:
 *   materialize()（localStorage v292Dmem1_slot_* 書込）／chr6_slot_* 書込／localStorage 書込／
 *   fix793 flag の上書き／forcePut・transition・confirm／timer（setTimeout/setInterval）／
 *   retry／PENDING→ACTIVE 操作／新 authority。
 * flags（READ のみ）: v292Dfix802On==='1'（既定 OFF）／v292Dfix802Off==='1'（kill）／
 *   v292Dfix802Story（既定 'smtg00ynsv1'・fix793 と同じ canary 概念）。
 *   OFF のとき onLanded / onRawReady は **即 return（latch も動かない・副作用 0）**。
 * 単位: sourceTurnIndex は 0-based・landed.turnCount は turns の件数。
 *   eligible = maxSourceTurnIndex <= turnCount - 1（異なる単位を直接比較しない）。
 * ===================================================================== */
(function () {
  'use strict';
  var BUILD = '20260903-fix802';
  var CANARY_DEFAULT = 'smtg00ynsv1';
  var RAW_OK_STOPS = { 'ok': 1, 'up-to-date': 1, 'nochange': 1, 'fast-nochange': 1 };
  var ERR_MAX = 50;

  function ls(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function optedIn() { return ls('v292Dfix802On') === '1'; }
  function off() { return ls('v292Dfix802Off') === '1'; }
  function active() { return optedIn() && !off(); }
  function story() { var s = ls('v292Dfix802Story'); return (s && String(s)) || CANARY_DEFAULT; }
  function nowMs() { try { return performance.now(); } catch (e) { return Date.now(); } }

  /* ---------------- state（story ごと・in-memory・永続化しない） ---------------- */
  var latch = {};          /* sid -> { landed, raw, refreshedFor, running } */
  var lastHash = {};       /* sid -> hash16 */
  var T = { fires: 0, skippedNotEligible: 0, skippedDup: 0, futureRawDefer: 0, r2Restores: 0, dependencySkip: 0,
            skipReasons: {}, lastSkip: null, lastDefer: null, lastFire: null, errors: [] };
  function L(sid) {
    return latch[sid] || (latch[sid] = { landed: null, raw: null, refreshedFor: null, running: false });
  }
  function skip(reason) { T.skippedNotEligible++; T.skipReasons[reason] = (T.skipReasons[reason] || 0) + 1; return 'skipped:' + reason; }
  function dup(reason) { T.skippedDup++; T.skipReasons[reason] = (T.skipReasons[reason] || 0) + 1; return 'dup:' + reason; }
  function err(sid, turnCount, stage, e) {
    T.errors.push({ at: Date.now(), storyId: sid, turnCount: turnCount, stage: stage,
                    message: String((e && e.message) || e || '').slice(0, 200) });
    if (T.errors.length > ERR_MAX) T.errors.shift();
  }

  /* ---------------- hash（計測 harness §4 と同じ normalize） ---------------- */
  var DROP = /^(createdAt|updatedAt|materializedAt|generatedAt|at|ts|time|byteLen|lastRun|firstSeenAt|lastSeenAt)$/;
  function norm(v) {
    if (v === null || v === undefined) return v;
    if (Object.prototype.toString.call(v) === '[object Array]') return v.map(norm);
    if (typeof v === 'object') {
      var o = {}, ks = Object.keys(v).filter(function (k) { return !DROP.test(k); }).sort();
      ks.forEach(function (k) { o[k] = norm(v[k]); });
      return o;
    }
    return v;
  }
  function cmpBy(k) { return function (a, b) { return String(a[k]).localeCompare(String(b[k])); }; }
  /* ★full candidate = ACTIVE ＋ PENDING_REF の records ＋ edges 全体（ACTIVE だけにしない） */
  function candCanon(v) {
    var recs = ((v && v.records) || []).slice().sort(cmpBy('memoryId')).map(norm);
    var eds = ((v && v.edges) || []).slice().sort(cmpBy('relationId')).map(norm);
    return JSON.stringify([recs, eds]);
  }
  function sha256hex16(s) {
    var sub = null;
    try { sub = window.crypto && window.crypto.subtle; } catch (e) { sub = null; }
    if (!sub || typeof sub.digest !== 'function') return Promise.reject(new Error('crypto.subtle unavailable'));
    return sub.digest('SHA-256', new TextEncoder().encode(String(s))).then(function (b) {
      return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); })
        .join('').slice(0, 16);
    });
  }

  /* ---------------- shadow 層 READ（fix793 readAll と同型・readonly） ---------------- */
  function readAll(dbName, store, slotId) {
    return new Promise(function (res, rej) {
      var q; try { q = window.indexedDB.open(dbName); } catch (e) { return rej(e); }
      q.onupgradeneeded = function () { try { q.transaction.abort(); } catch (e) {} };
      q.onsuccess = function () {
        var db = q.result;
        if (!db.objectStoreNames.contains(store)) { db.close(); return res([]); }
        var g = db.transaction([store], 'readonly').objectStore(store).getAll();
        g.onsuccess = function () {
          var rows = (g.result || []).filter(function (r) { return r && r.slotId === slotId; });
          db.close(); res(rows);
        };
        g.onerror = function () { db.close(); rej(g.error); };
      };
      q.onerror = function () { rej(q.error); };
    });
  }
  /* ★Rev2（GPT deploy gate）: story-scoped READ は fix801 経由 **のみ**。fix670 `events()`（全 story）へは
     fallback しない（auto refresh が cross-story raw を読む経路を作らない）。 */
  function storyScopedReader() {
    var a = null; try { a = window.__v292Dfix801; } catch (e) { a = null; }
    return (a && typeof a.eventsForStory === 'function') ? a : null;
  }
  function eventsForStory(sid) {
    var a = storyScopedReader();
    if (!a) return Promise.reject(new Error('fix801 missing'));
    return a.eventsForStory(sid);
  }
  function maxSourceTurnIndex(events) {
    var mx = -1;
    for (var i = 0; i < events.length; i++) {
      var t = events[i] && events[i].sourceTurnIndex;
      if (typeof t === 'number' && isFinite(t) && t > mx) mx = t;
    }
    return mx;
  }

  /* ---------------- pipeline（789→790→791→792・slotId 明示・順次） ---------------- */
  function stage(name, fn) {
    var t0 = nowMs();
    var p; try { p = fn(); } catch (e) { return Promise.reject({ stage: name, e: e }); }
    return Promise.resolve(p).then(function (r) { return { name: name, ms: nowMs() - t0, r: r }; },
                                   function (e) { throw { stage: name, e: e }; });
  }
  function api(name, obj, fnName) {
    if (!obj || typeof obj[fnName] !== 'function') throw new Error(name + '.' + fnName + ' missing');
    return function (sid) { return obj[fnName](sid); };
  }

  function fire(sid, l) {
    var landed = l.landed, tc = landed.turnCount, ms = {}, out = {};
    l.running = true;
    var tAll = nowMs();
    /* ★boundary guard: landed boundary より未来の raw があるならこの settle では走らせない */
    return eventsForStory(sid).then(function (evs) {
      var mx = maxSourceTurnIndex(evs);
      if (!(mx <= tc - 1)) {
        T.futureRawDefer++;
        T.lastDefer = { storyId: sid, turnCount: tc, maxSourceTurnIndex: mx, at: Date.now() };
        l.running = false;
        return 'FUTURE_RAW_DEFER';
      }
      var raw0 = evs.filter(function (e) { return (e.sourceTurnIndex | 0) === tc - 1; }).length === 0;
      var run789 = api('fix789', window.__v292Dfix789, 'adjudicate');
      var run790 = api('fix790', window.__v292Dfix790, 'build');
      var run791 = api('fix791', window.__v292Dfix791, 'build');
      var run792 = api('fix792', window.__v292Dfix792, 'build');
      var m793 = window.__v292Dfix793;
      if (!m793 || !m793.__test || typeof m793.__test.materializeFrom !== 'function') throw new Error('fix793.__test.materializeFrom missing');
      return stage('789', function () { return run789(sid); }).then(function (s) { ms[789] = s.ms; out[789] = s.r;
        return stage('790', function () { return run790(sid); }); }).then(function (s) { ms[790] = s.ms; out[790] = s.r;
        return stage('791', function () { return run791(sid); }); }).then(function (s) { ms[791] = s.ms; out[791] = s.r;
        return stage('792', function () { return run792(sid); }); }).then(function (s) { ms[792] = s.ms; out[792] = s.r;
        var tR = nowMs();
        return Promise.all([ readAll('chr6lin', 'lineages', sid), eventsForStory(sid),
                             readAll('chr6rel', 'relations', sid), readAll('chr6ref', 'resolutions', sid) ])
          .then(function (a) {
            ms.read = nowMs() - tR;
            var tM = nowMs();
            /* ★dry materialize（純関数・canonical 書込 0・materialize() は呼ばない） */
            var cand = m793.__test.materializeFrom({ storyId: sid, lineages: a[0], events: a[1], relations: a[2], resolutions: a[3] });
            ms.mat = nowMs() - tM;
            var recs = (cand && cand.records) || [], eds = (cand && cand.edges) || [];
            var active_ = 0, pending = 0;
            for (var i = 0; i < recs.length; i++) { if (recs[i].lifecycle === 'ACTIVE') active_++; else pending++; }
            return sha256hex16(candCanon(cand)).then(function (h16) {
              var prev = lastHash[sid];
              var changed = (prev == null) ? null : (h16 !== prev);   /* 初回 fire は比較対象なし = null */
              lastHash[sid] = h16;
              T.fires++;
              l.refreshedFor = tc;
              T.lastFire = { storyId: sid, turnCount: tc, rev: landed.rev, hash16: landed.hash16,
                             ms: { 789: ms[789], 790: ms[790], 791: ms[791], 792: ms[792], read: ms.read, mat: ms.mat, total: nowMs() - tAll },
                             candHash16: h16, prevHash16: prev || null, changed: changed, raw0: raw0,
                             records: recs.length, active: active_, pending: pending, edges: eds.length,
                             events: a[1].length, maxSourceTurnIndex: mx,
                             pipe: { 789: !!(out[789] && out[789].ok), 790: !!(out[790] && out[790].ok),
                                     791: !!(out[791] && out[791].ok), 792: !!(out[792] && out[792].ok),
                                     reason792: (out[792] && out[792].reason) || null },
                             at: Date.now() };
              l.running = false;
              return 'fired';
            });
          });
      });
    }).catch(function (e) {
      var st = (e && e.stage) ? e.stage : 'pipeline';
      err(sid, tc, st, (e && e.e) || e);
      l.running = false;              /* ★再試行 0・次の LANDED で自然に再評価 */
      return 'error:' + st;
    });
  }

  function tryFire(sid) {
    var l = L(sid);
    if (!l.landed || !l.raw) return skip('latch-incomplete');
    if (typeof l.landed.turnCount !== 'number') return skip('turnCount-null');
    if (!(l.raw.processedCount >= l.landed.turnCount)) return skip('raw-behind');
    if (l.running) return dup('running');
    if (l.refreshedFor === l.landed.turnCount) return dup('same-turnCount');
    /* ★Rev2 dependency fail-closed: fix801 が無ければ何も走らせない（789〜793 call 0・latch そのまま・retry 0） */
    if (!storyScopedReader()) { T.dependencySkip++; T.lastSkip = 'NO_STORY_SCOPED_EVENTS'; return 'skipped:NO_STORY_SCOPED_EVENTS'; }
    return fire(sid, l);
  }

  /* ---------------- notify 入口（OFF なら即 return・副作用 0） ---------------- */
  function onLanded(sid, rev, hash, turnCount) {
    if (!active()) return 'off';
    sid = (sid == null) ? '' : String(sid);
    if (sid !== story()) return skip('other-story');
    if (typeof turnCount !== 'number' || !isFinite(turnCount)) return skip('turnCount-null');
    var l = L(sid);
    l.landed = { rev: (typeof rev === 'number') ? rev : null, hash16: (hash == null) ? null : String(hash).slice(0, 16),
                 turnCount: turnCount, at: Date.now() };
    /* R2（補助・authority は R1）: raw latch が無ければ fix670.status() を 1 回 READ して復元 */
    if (!l.raw) {
      try {
        var m = window.__v292Dfix670, s = (m && typeof m.status === 'function') ? m.status() : null;
        if (s && s.slot && s.slot.id === sid && typeof s.slot.processedCount === 'number'
            && s.slot.processedCount >= turnCount && RAW_OK_STOPS[String(s.lastStop)] === 1) {
          l.raw = { processedCount: s.slot.processedCount, reconciles: s.reconciles, at: Date.now(), restored: true };
          T.r2Restores++;
        }
      } catch (e) {}
    }
    return tryFire(sid);
  }
  function onRawReady(sid, processedCount, reconciles) {
    if (!active()) return 'off';
    sid = (sid == null) ? '' : String(sid);
    if (sid !== story()) return skip('other-story');
    var l = L(sid);
    l.raw = { processedCount: (typeof processedCount === 'number') ? processedCount : -1,
              reconciles: reconciles, at: Date.now(), restored: false };
    return tryFire(sid);
  }

  function status() {
    var lc = {};
    for (var k in latch) if (Object.prototype.hasOwnProperty.call(latch, k)) {
      var l = latch[k];
      lc[k] = { landed: l.landed ? { rev: l.landed.rev, hash16: l.landed.hash16, turnCount: l.landed.turnCount, at: l.landed.at } : null,
                raw: l.raw ? { processedCount: l.raw.processedCount, reconciles: l.raw.reconciles, at: l.raw.at, restored: l.raw.restored } : null,
                refreshedFor: l.refreshedFor, running: l.running };
    }
    return { build: BUILD, on: optedIn(), off: off(), active: active(), story: story(), latch: lc,
             fires: T.fires, skippedNotEligible: T.skippedNotEligible, skippedDup: T.skippedDup,
             futureRawDefer: T.futureRawDefer, r2Restores: T.r2Restores, dependencySkip: T.dependencySkip, lastSkip: T.lastSkip,
             skipReasons: JSON.parse(JSON.stringify(T.skipReasons)),
             lastDefer: T.lastDefer, lastFire: T.lastFire, lastHash: JSON.parse(JSON.stringify(lastHash)),
             errors: T.errors.slice() };
  }
  function reset() {
    latch = {}; lastHash = {};
    T = { fires: 0, skippedNotEligible: 0, skippedDup: 0, futureRawDefer: 0, r2Restores: 0, dependencySkip: 0,
          skipReasons: {}, lastSkip: null, lastDefer: null, lastFire: null, errors: [] };
  }

  window.__v292Dfix802 = {
    BUILD: BUILD, ENABLED_BY_DEFAULT: false, CANARY_DEFAULT: CANARY_DEFAULT,
    onLanded: onLanded, onRawReady: onRawReady, status: status,
    __test: { norm: norm, candCanon: candCanon, sha256hex16: sha256hex16, maxSourceTurnIndex: maxSourceTurnIndex,
              reset: reset, latchOf: function (sid) { return latch[sid] || null; }, RAW_OK_STOPS: RAW_OK_STOPS }
  };
  /* ★自動実行しない。timer 0。notify が来るまで何もしない。 */
})();
