/* ============================================================================
 * v292Dvault2-copygate — Vault v2 CopyGate (lane B OFFLINE CANDIDATE, NOT FOR DEPLOY)
 * GPT VAULT_V2_LANEB_20260930_01 Q2 (L0+) / _05 Q25(a):
 *   "既存平文を消すのではなく、hide 後に新しい複製を増やさない" — limited to Chronicle's story-bearing
 *   storage / producers (no global IndexedDB block):
 *     K5 localStorage / sessionStorage : a write that CREATES a new key holding a hidden story's data
 *        (key names the story, or the value is / contains that story's body or id) is dropped.
 *        Overwriting a key whose OLD value already carried that same hidden story passes (no copy is added);
 *        an overwrite that brings a hidden story into a key for the first time is dropped. Removals always pass.
 *        Covers: generation ring, snapshots, backups (guard / hero / repair / meta), side-store forks, drafts in sessionStorage.
 *     K6 IndexedDB (story-bearing records only): put/add whose record or key carries a hidden story id fails
 *        with an error event (recovery drafts, Memory Engine rows, candidates carrying slotId).
 *     K7 exports (device backup HOME / in-game full export / story export): JSON map exports lose every entry
 *        of a hidden story; any other JSON download naming a hidden story is refused. A vault account whose
 *        state is unknown right now cannot export (fail-closed).
 *   Hidden set = this device's stories that the server currently answers as hidden-locked (op vault2visible,
 *   batches of 50, no metadata). Refreshed at load, every 30 s for vault accounts, on focus / visibility, and
 *   immediately when the ExternalSendGate kills a document (event chr:vault2-blocked).
 *   Local writes are synchronous, so K5/K6 use the latest answer (bounded staleness; kill events are immediate).
 *   r2 (_06): kill events add the story synchronously; an overwrite may carry hidden story X only when the old value
 *   under that key already carried X (R-COPY-EXISTING, old-value-aware). Probe failure / timeout = no answer.
 *   r3 (_07 Q32/Q33): authority has a finite TTL (30 s from the last fully answered refresh; refreshed every 15 s,
 *   on focus / visibility and on kill). Past the TTL the state is UNKNOWN: no hidden list is trusted, so NO new
 *   story-bearing copy (any local story), snapshot, story IDB record or export is made; overwrites of values that
 *   already carried the same stories and all removals still pass; nothing is deleted and normal reading is untouched.
 *   A refused storage write throws DOMException SecurityError (callers' fail-closed paths engage; never silent).
 *   r5 (_18 Q74/Q75, OFFLINE ONLY): whenAuthority(storyId, epoch) — one Promise bound to (story, tab epoch). It resolves
 *   only from a fully answered refresh (never from a timeout or a TTL downgrade) with the same verdict the write rules
 *   use ({effective:'novault'|'visible'|'hidden'}); if the open document story (captured at the call) or the tab epoch
 *   changed while waiting it
 *   resolves {effective:'stale', reason:'STALE_AUTHORITY_WAIT'} and the caller must not write. No answer = stays pending.
 *   r5.1 (_19 Q77): epoch is required (null / undefined = BAD_ARGS); storyId must be the open document story
 *   (otherwise BAD_CONTEXT, never a write permission); waiters whose story / epoch changed are released as stale on
 *   every refresh attempt, even while authority never resolves.
 *   r5.2 (2026-10-01, BOOT_UNKNOWN local evidence): a refused IndexedDB put/add ABORTS its transaction synchronously.
 *   Before r5.2 the refusal was a detached fake request: the real transaction still completed, so a caller that commits
 *   progress on tx complete (fix670 Memory Engine) advanced processedCount / chain over writes that never happened
 *   (ME_FALSE_PROGRESS). Now the whole transaction fails as a unit (no partial mutation, no false success); the fake
 *   request still fires its error event. Synchronous because a transaction with no live request auto-commits at the
 *   end of the task. Stricter than native: preventDefault on the fake error cannot keep the transaction alive.
 *   Build mode: V2_CLIENT_MODE 'compat' (PRE_ACTIVATION only: a worker's explicit bad-op = no vault) or 'strict'
 *   (bad-op = no answer). The client that ships with ARM must be strict.
 * r5.3-scope (Session A, GPT VAULT_V2_LANEB_20261001_29 Q112 / D-2 / D-3): thin applicability gate.
 *   strict authority applies only when SUPPORTED_AUTH_HOST (https *.pages.dev with fix893 on) && the server says the
 *   principal is acct (GET /api/auth/me 200 with accountId, or fix893 serverMe()). Other hosts / fix893 off = the gate is
 *   not installed at all (= current behavior). 401 NO_SESSION (no cookie) from /auth/me = OUT_OF_SCOPE (anon: no probe,
 *   effective novault). r5.3b: 401 with any other code (SESSION_INVALID = cookie present but revoked / expired, worker r3a+)
 *   = SESSION_INVALID scope: fail-closed (effective unknown, no probe), never OUT_OF_SCOPE (no silent downgrade on reload).
 *   Transport errors / other statuses = scope PENDING (fail-closed, retried each tick). IN_SCOPE is latched for the page:
 *   a later 401 / revoke never downgrades it. No probe (vault2visible) is sent until IN_SCOPE. localStorage is never used
 *   to decide the principal.
 * r5.3c (GPT COPYGATE_K5_FIX889_MARKER_EXCEPTION = GO / NARROW_ALLOWLIST_ONLY): while authority is UNKNOWN, K5 lets through
 *   exactly fix889's two boot reload markers in sessionStorage — `v889rel:<id>` (value = decimal ms timestamp) and
 *   `v889relN:<id>` (value = {"n":<int>,"at":<ms>}) — where <id> is exactly the story this document is opening. Nothing else:
 *   not localStorage / IndexedDB, not another story id, not lookalike keys, not any other value shape, not a known-hidden story.
 * r5.3d (GPT COPYGATE_K5_F697P_JOURNAL_EXCEPTION = GO / NARROW_ALLOWLIST_ONLY): while authority is UNKNOWN, K5 also lets
 *   through fix697's ambiguous-commit PREPARED_LOCAL journal in localStorage — key exactly `v292Dfix402_f697p_<id>` for
 *   the story this document is opening, value = the exact v3 PREPARED_LOCAL schema (fixed key set, typed fields, hash /
 *   rev / counters only, <= 1024 bytes). No other state, no other key, no other story, not sessionStorage / IDB, not a
 *   known-hidden story. Later in-place updates of an existing journal stay under the unchanged K5 old-value rule.
 * Load position: right after v292Dvault2-sendgate.js (first in <head>).
 * Kill (QA only): localStorage v292Dvault2CopyGateOff='1'.
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__v292Dvault2CopyGate) return;
  var SP = Storage.prototype;
  var nGet = SP.getItem, nSet = SP.setItem, nKey = SP.key;
  var lenDesc = Object.getOwnPropertyDescriptor(SP, 'length');
  var LS = null, SS = null; try { LS = window.localStorage; } catch (e) {} try { SS = window.sessionStorage; } catch (e) {}
  function g(k) { try { return LS ? nGet.call(LS, k) : null; } catch (e) { return null; } }
  if (g('v292Dvault2CopyGateOff') === '1') return;
  /* r5.3-scope: unsupported host (github.io etc.) or fix893 off = Vault v2 OUT_OF_SCOPE: do not install (current behavior) */
  var hostOk = false; try { hostOk = location.protocol === 'https:' && /\.pages\.dev$/.test(location.hostname); } catch (e) {}
  if (!hostOk || g('v292Dfix893Off') === '1') { try { window.__v292Dvault2CopyGateScope = { scope: 'OUT_OF_SCOPE', reason: hostOk ? 'fix893-off' : 'unsupported-host' }; } catch (e) {} return; }

  var V2_CLIENT_MODE = 'strict';   /* build constant: 'compat' (PRE_ACTIVATION_COMPAT_ONLY) | 'strict' */
  var AUTH_TTL = 30000, TICK = 15000, AUTH_KEY = 'v292Dvault2_auth';
  var WORKER = 'https://novel-proxy.sansan2103.workers.dev';
  var nativeFetch = window.fetch.bind(window);
  var st = { state: 'unknown', hidden: [], lastAt: 0, answeredAt: 0, refreshes: 0, unknownDenied: 0, denied: { ls: 0, idb: 0, exportEntries: 0, exportRefused: 0 }, allowedExisting: 0, log: [] };
  function note(k, d) { try { st.log.push([Date.now(), k, d]); if (st.log.length > 200) st.log.shift(); } catch (e) {} }
  var ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
  var waiters = [];   /* r5: authority waits (declared before the first refresh runs) */
  var scope = { s: 'PENDING', why: null, at: 0, checks: 0, inflight: false, last: null };   /* r5.3-scope */

  /* ---- local story ids on this device ---- */
  function localIds() {
    var set = {};
    try { var meta = JSON.parse(g('chr6_slots_meta') || '[]'); if (Array.isArray(meta)) meta.forEach(function (m) { if (m && ID_RE.test(String(m.id))) set[String(m.id)] = 1; }); } catch (e) {}
    try { var n = lenDesc.get.call(LS); for (var i = 0; i < n; i++) { var k = nKey.call(LS, i); var m = /^chr6_slot_([A-Za-z0-9_-]{1,80})$/.exec(k || ''); if (m) set[m[1]] = 1; } } catch (e) {}
    try { if (g('chr6') !== null) set['default'] = 1; } catch (e) {}
    return Object.keys(set);
  }
  function onPagesDev() { try { return location.protocol === 'https:' && /\.pages\.dev$/.test(location.hostname); } catch (e) { return false; } }
  function probeBatch(ids) {
    var url = onPagesDev() ? '/api/save' : WORKER + '/save';
    var headers = { 'Content-Type': 'application/json' }; if (onPagesDev()) headers['x-chronicle-csrf'] = '1';
    var ac = null; try { ac = new AbortController(); setTimeout(function () { try { ac.abort(); } catch (e) {} }, 8000); } catch (e) {}
    return nativeFetch(url, { method: 'POST', credentials: 'same-origin', headers: headers, body: JSON.stringify({ op: 'vault2visible', ids: ids }), signal: ac ? ac.signal : undefined })
      .then(function (r) {
        if (r.status === 400) return r.json().then(function (j) { return (V2_CLIENT_MODE === 'compat' && j && j.errorCode === 'bad-op') ? { ok: true, hasVault: false, visible: ids } : null; }, function () { return null; });
        return r.ok ? r.json().then(function (j) { return (j && j.ok && Array.isArray(j.visible)) ? { ok: true, hasVault: j.hasVault === true, visible: j.visible } : null; }, function () { return null; }) : null;
      }, function () { return null; });
  }
  var refreshing = null;
  function refresh(why) {
    try { sweepStale(); } catch (e) {}
    if (scope.s !== 'IN_SCOPE') { if (scope.s === 'PENDING' || scope.s === 'SESSION_INVALID') scopeCheck(why); return Promise.resolve(); }   /* r5.3-scope: no probe before acct is confirmed */
    if (refreshing) return refreshing;
    st.refreshes++;
    var ids = localIds(); var batches = []; for (var i = 0; i < ids.length; i += 50) batches.push(ids.slice(i, i + 50)); if (!batches.length) batches.push([]);
    refreshing = Promise.all(batches.map(probeBatch)).then(function (res) {
      refreshing = null;
      if (res.some(function (r) { return !r; })) { note('refresh-unanswered', why); return; }   // keep the deny-list; the TTL decides when authority is lost
      var hasVault = res.some(function (r) { return r.hasVault; });
      if (!hasVault) { st.state = 'novault'; setHidden([]); }
      else {
        st.state = 'vault';
        var vis = {}; res.forEach(function (r) { r.visible.forEach(function (x) { vis[x] = 1; }); });
        setHidden(ids.filter(function (x) { return !vis[x]; }).concat(st.hidden.filter(function (x) { return ids.indexOf(x) < 0; })));
      }
      st.lastAt = st.answeredAt = Date.now(); note('refresh', why + ':' + st.state + ':' + st.hidden.length);
      try { nSet.call(LS, AUTH_KEY, JSON.stringify({ state: st.state, hidden: st.hidden, at: st.answeredAt })); } catch (e) {}
      flushWaiters();
    });
    return refreshing;
  }
  /* ---- r5.3-scope: applicability (server-authoritative principal) ---- */
  function setScope(v, why) {
    if (scope.s === v || scope.s === 'IN_SCOPE') return;   /* IN_SCOPE is latched: never downgrade */
    if (scope.s === 'SESSION_INVALID' && v === 'OUT_OF_SCOPE') return;   /* r5.3b: an invalid acct session never becomes anon on this page */
    scope.s = v; scope.why = why; scope.at = Date.now(); note('scope', v + ':' + why);
    if (v === 'IN_SCOPE') refresh('scope-in');
    else if (v === 'OUT_OF_SCOPE') flushWaiters();
  }
  function scopeCheck(why) {
    if ((scope.s !== 'PENDING' && scope.s !== 'SESSION_INVALID') || scope.inflight) return; scope.inflight = true; scope.checks++;
    var ac = null; try { ac = new AbortController(); setTimeout(function () { try { ac.abort(); } catch (e) {} }, 8000); } catch (e) {}
    nativeFetch('/api/auth/me', { method: 'GET', credentials: 'same-origin', headers: { 'x-chronicle-csrf': '1' }, signal: ac ? ac.signal : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { st: r.status, j: j }; }); }, function () { return { st: 'network', j: null }; })
      .then(function (x) {
        scope.inflight = false; scope.last = x.st;
        if (x.st === 200 && x.j && x.j.ok && x.j.accountId) setScope('IN_SCOPE', 'auth-me');
        else if (x.st === 401 && x.j && x.j.errorCode === 'NO_SESSION') setScope('OUT_OF_SCOPE', 'auth-me-401-no-session');
        else if (x.st === 401) setScope('SESSION_INVALID', 'auth-me-401-' + String(x.j && x.j.errorCode || 'unknown').slice(0, 24));
        else note('scope-pending', String(x.st) + ':' + why);
      });
  }
  window.addEventListener('chr:account-me', function () { try { var F = window.__v292Dfix893; var m = F && typeof F.serverMe === 'function' ? F.serverMe() : null; if (m && m.accountId) setScope('IN_SCOPE', 'fix893'); } catch (e) {} });
  var hiddenRe = [];
  function esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function setHidden(list) {
    var u = {}; list.forEach(function (x) { if (ID_RE.test(String(x))) u[x] = 1; });
    st.hidden = Object.keys(u);
    hiddenRe = st.hidden.map(function (h) { return { h: h, re: new RegExp('(^|[^A-Za-z0-9])' + esc(h) + '($|[^A-Za-z0-9])') }; });
  }
  function effState() { if (scope.s === 'OUT_OF_SCOPE') return 'novault'; if (scope.s === 'SESSION_INVALID') return 'unknown'; return (Date.now() - st.answeredAt > AUTH_TTL) ? 'unknown' : st.state; }
  /* UNKNOWN: every story on this device is treated as possibly hidden (no new copies of any of them) */
  var allCache = null, allAt = 0;
  function allLocalRe() {
    if (allCache && Date.now() - allAt < 2000) return allCache;
    allCache = localIds().map(function (h) { return { h: h, re: new RegExp('(^|[^A-Za-z0-9])' + esc(h) + '($|[^A-Za-z0-9])') }; }); allAt = Date.now();
    return allCache;
  }
  function guardSet() { return effState() === 'unknown' ? allLocalRe() : hiddenRe; }
  function addHidden(id) { if (id && ID_RE.test(String(id)) && st.hidden.indexOf(id) < 0) { setHidden(st.hidden.concat([id])); note('hidden+', id); } }

  /* ---- classification ---- */
  function keyHidden(k) {
    if (!hiddenRe.length) return null; k = String(k);
    for (var i = 0; i < hiddenRe.length; i++) { var x = hiddenRe[i]; if (x.h === 'default' ? k === 'chr6' : x.re.test(k)) return x.h; }
    return null;
  }
  function bodyOf(h) { return h === 'default' ? g('chr6') : g('chr6_slot_' + h); }
  function inValue(v, x) {
    if (v == null) return false; v = String(v);
    if (x.h !== 'default' && v.indexOf(x.h) >= 0 && x.re.test(v)) return true;
    if (v.length >= 64) { var b = bodyOf(x.h); if (b && (v === b || (b.length >= 64 && v.indexOf(b) >= 0))) return true; }
    return false;
  }
  function valueHidden(v) {
    if (!hiddenRe.length || v == null) return null;
    for (var i = 0; i < hiddenRe.length; i++) if (inValue(v, hiddenRe[i])) return hiddenRe[i].h;
    return null;
  }
  /* every hidden story a (key, value) pair carries: the key names it, or the value is / contains its body or id */
  function carried(k, v, set) {
    var out = []; set = set || hiddenRe;
    for (var i = 0; i < set.length; i++) { var x = set[i]; if ((x.h === 'default' ? String(k) === 'chr6' : x.re.test(String(k))) || inValue(v, x)) out.push(x); }
    return out;
  }

  /* ---- K5 Storage: no NEW key carrying hidden story data ---- */
  /* r2 (_06 Q27/Q29): old-value-aware. A write may carry hidden story X only if the OLD value under the same key
     already carried X (same key naming X with an existing value, or old value containing X's body / id).
     New keys and overwrites that bring X into a key for the first time are dropped. Removals always pass. */
  /* r5.3c: fix889 boot reload markers (exact key, exact serialization, sessionStorage, current document story, UNKNOWN only) */
  var F889_TS = /^[0-9]{10,16}$/, F889_N = /^\{"n":[0-9]{1,3},"at":[0-9]{10,16}\}$/;
  function fix889Marker(store, k, v, set) {
    try {
      if (store !== SS || set === hiddenRe) return false;
      var cur = curStory(); if (!cur || cur === 'default' || !ID_RE.test(cur)) return false;
      k = String(k); v = String(v);
      if (k === 'v889rel:' + cur) return F889_TS.test(v);
      if (k === 'v889relN:' + cur) return F889_N.test(v);
    } catch (e) {}
    return false;
  }
  /* r5.3d: fix697 PREPARED_LOCAL journal (exact key, exact schema, localStorage, current document story, UNKNOWN only) */
  var F697P_KEYS = ['build', 'commitBinding', 'createdAt', 'holdCount', 'intendedCanonicalHash', 'lastConfirmedHash', 'lastConfirmedRev', 'lastVerdict', 'resumeCount', 'state', 'storyId', 'updatedAt', 'v'].join(',');
  var F697P_CB = ['build', 'epoch', 'generation', 'route', 'schema'].join(',');
  function isInt(n, max) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n && n >= 0 && n <= max; }
  function isMs(n) { return isInt(n, 9999999999999) && n >= 1000000000000; }
  var F697P_BUILD = /^[A-Za-z0-9+._-]{1,40}$/, F697P_FP = /^[A-Za-z0-9:._-]{8,160}$/, F697P_H = /^[0-9a-f]{64}$/, F697P_VERDICT = /^[A-Z_]{1,40}$/;
  function fix697Journal(store, k, v, set) {
    try {
      if (store !== LS || set === hiddenRe) return false;
      var cur = curStory(); if (!cur || cur === 'default' || !ID_RE.test(cur)) return false;
      if (String(k) !== 'v292Dfix402_f697p_' + cur) return false;
      v = String(v); if (v.length > 1024) return false;
      var r = JSON.parse(v); if (!r || typeof r !== 'object' || Object.prototype.toString.call(r) === '[object Array]') return false;
      if (Object.keys(r).sort().join(',') !== F697P_KEYS) return false;
      if (r.v !== 3 || r.state !== 'PREPARED_LOCAL' || r.storyId !== cur) return false;
      if (!isInt(r.lastConfirmedRev, 1e9) || typeof r.lastConfirmedHash !== 'string' || !F697P_FP.test(r.lastConfirmedHash)) return false;
      if (typeof r.intendedCanonicalHash !== 'string' || !F697P_H.test(r.intendedCanonicalHash)) return false;
      var cb = r.commitBinding; if (!cb || typeof cb !== 'object' || Object.prototype.toString.call(cb) === '[object Array]') return false;
      if (Object.keys(cb).sort().join(',') !== F697P_CB || cb.route !== 'canonicalCommit2' || cb.schema !== 2) return false;
      if (!isInt(cb.generation, 1e9) || !isInt(cb.epoch, 1e9) || typeof cb.build !== 'string' || !F697P_BUILD.test(cb.build)) return false;
      if (!isInt(r.resumeCount, 999) || !isInt(r.holdCount, 999)) return false;
      if (!(r.lastVerdict === null || (typeof r.lastVerdict === 'string' && F697P_VERDICT.test(r.lastVerdict)))) return false;
      if (!isMs(r.createdAt) || !isMs(r.updatedAt) || typeof r.build !== 'string' || !F697P_BUILD.test(r.build)) return false;
      return true;
    } catch (e) {}
    return false;
  }
  SP.setItem = function (k, v) {
    var set = (this === LS || this === SS) ? guardSet() : null;
    if (set && set.length && k !== AUTH_KEY && fix697Journal(this, k, v, set)) { st.f697pAllowed = (st.f697pAllowed || 0) + 1; note('unknown-f697p-journal', String(k).slice(0, 60)); return nSet.apply(this, arguments); }
    if (set && set.length && k !== AUTH_KEY && fix889Marker(this, k, v, set)) { st.f889Allowed = (st.f889Allowed || 0) + 1; note('unknown-f889-marker', String(k).slice(0, 60)); return nSet.apply(this, arguments); }
    if (set && set.length && k !== AUTH_KEY) {
      var now = carried(k, v, set);
      if (now.length) {
        var old = null; try { old = nGet.call(this, k); } catch (e) {}
        var fresh = now.filter(function (x) { return old === null || !(((x.h === 'default' ? String(k) === 'chr6' : x.re.test(String(k)))) || inValue(old, x)); });
        if (fresh.length) {
          st.denied.ls++; if (set !== hiddenRe) st.unknownDenied++; note((set !== hiddenRe ? 'unknown-' : '') + (old === null ? 'ls-deny-new' : 'ls-deny-overwrite'), String(k).slice(0, 60) + ':' + fresh[0].h);
          /* r3: refuse LOUDLY. A silent drop defeats callers' fail-closed backups (fix526 treats a successful setItem
             as "backup taken" and then renames). SecurityError (not QuotaExceededError, which triggers backup GC). */
          throw new DOMException('この控えはいま保存できません', 'SecurityError');
        }
        st.allowedExisting++;
      }
    }
    return nSet.apply(this, arguments);
  };

  /* ---- K6 IndexedDB: story-bearing records only ---- */
  var FIELDS = ['storyId', 'slotId', 'sid', 'story', 'storyKey', 'slot'];
  function recHidden(value, key) {
    if (effState() === 'unknown') {        // any story-bearing record is refused while authority is unknown
      try {
        if (value && typeof value === 'object') for (var j = 0; j < FIELDS.length; j++) { var fv = value[FIELDS[j]]; if (typeof fv === 'string' && fv) return 'UNKNOWN:' + fv; }
        var all = allLocalRe(); var ks = [typeof key === 'string' ? key : null, value && typeof value === 'object' && typeof value.id === 'string' ? value.id : null];
        for (var a = 0; a < all.length; a++) for (var b = 0; b < ks.length; b++) if (ks[b] && all[a].re.test(ks[b])) return 'UNKNOWN:' + all[a].h;
      } catch (e) {}
      return null;
    }
    if (!hiddenRe.length) return null;
    try {
      if (value && typeof value === 'object') for (var i = 0; i < FIELDS.length; i++) { var f = value[FIELDS[i]]; if (typeof f === 'string') { var h = keyHidden(f) || (st.hidden.indexOf(f) >= 0 ? f : null); if (h) return h; } }
      if (typeof key === 'string') { var hk = keyHidden(key); if (hk) return hk; }
      if (value && typeof value === 'object' && typeof value.id === 'string') { var hi = keyHidden(value.id); if (hi) return hi; }
    } catch (e) {}
    return null;
  }
  function deniedRequest(store) {
    var req = new EventTarget(); var err = new DOMException('この記録はいま保存できません', 'ConstraintError');
    Object.defineProperties(req, { result: { value: undefined }, error: { value: err }, source: { value: store }, transaction: { value: store && store.transaction }, readyState: { value: 'done' } });
    req.onsuccess = null; req.onerror = null;
    setTimeout(function () { try { var ev = new Event('error', { cancelable: true }); if (typeof req.onerror === 'function') req.onerror.call(req, ev); req.dispatchEvent(ev); } catch (e) {} }, 0);
    return req;
  }
  ['put', 'add'].forEach(function (m) {
    var orig = IDBObjectStore.prototype[m];
    IDBObjectStore.prototype[m] = function (value, key) {
      var h = recHidden(value, key);
      if (h) {
        st.denied.idb++; note('idb-deny', (this.name || '') + ':' + h);
        var dtx = null; try { dtx = this.transaction; } catch (e) {}
        try { if (dtx) { dtx.abort(); st.denied.idbTxAborted = (st.denied.idbTxAborted || 0) + 1; } } catch (e) { note('idb-abort-failed', String(e && e.name)); }
        return deniedRequest(this);
      }
      return orig.apply(this, arguments);
    };
  });

  /* ---- K7 exports: JSON downloads ---- */
  var NBlob = window.Blob;
  function filterExport(text) {
    if (effState() === 'unknown') { st.denied.exportRefused++; note('export-refused', 'unknown'); try { refresh('export'); } catch (e) {} throw new Error('いまは書き出せません。少し待ってからもう一度お試しください'); }
    if (!hiddenRe.length) return text;
    var o; try { o = JSON.parse(text); } catch (e) { return text; }
    var map = o && typeof o === 'object' ? (o.ls && typeof o.ls === 'object' ? 'ls' : (o.data && typeof o.data === 'object' ? 'data' : null)) : null;
    if (map) {
      var m = o[map], removed = 0;
      Object.keys(m).forEach(function (k) {
        if (keyHidden(k)) { delete m[k]; removed++; return; }
        var v = m[k]; if (!valueHidden(v)) return;
        /* list-shaped values (e.g. chr6_slots_meta): drop only the hidden rows, keep the visible ones */
        try { var arr = JSON.parse(v); if (Array.isArray(arr)) { var kept = arr.filter(function (r) { return !(r && typeof r === 'object' && (st.hidden.indexOf(String(r.id)) >= 0 || st.hidden.indexOf(String(r.slotId)) >= 0)); }); var nv = JSON.stringify(kept); if (!valueHidden(nv)) { m[k] = nv; removed += arr.length - kept.length; return; } } } catch (e) {}
        delete m[k]; removed++;
      });
      if (removed) {
        st.denied.exportEntries += removed; note('export-filtered', map + ':' + removed);
        if (typeof o.keys === 'number') o.keys = Object.keys(m).length;
        if (typeof o.count === 'number') o.count = Object.keys(m).length;
        return JSON.stringify(o);
      }
      return text;
    }
    if (valueHidden(text)) { st.denied.exportRefused++; note('export-refused', 'story'); throw new Error('いまは書き出せません'); }
    return text;
  }
  function CBlob(parts, opts) {
    try {
      if (Array.isArray(parts) && parts.length === 1 && typeof parts[0] === 'string' && opts && /json/i.test(String(opts.type || '')) && parts[0].length > 2) parts = [filterExport(parts[0])];
    } catch (e) { if (e && /書き出せません/.test(e.message)) throw e; }
    return Reflect.construct(NBlob, [parts, opts], new.target || CBlob);
  }
  CBlob.prototype = NBlob.prototype;
  try { Object.setPrototypeOf(CBlob, NBlob); } catch (e) {}
  window.Blob = CBlob;

  /* ---- refresh schedule ---- */
  window.addEventListener('chr:vault2-blocked', function (ev) {
    try { var d = ev && ev.detail; if (d && d.storyId) addHidden(d.storyId); } catch (e) {}
    refresh('kill');
  });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') refresh('visible'); });
  window.addEventListener('focus', function () { if (Date.now() - st.lastAt > 5000) refresh('focus'); });
  /* last answer from this device (any tab) is reused only while it is inside the TTL */
  try { var pa = JSON.parse(g(AUTH_KEY) || 'null'); if (pa && (pa.state === 'vault' || pa.state === 'novault') && Date.now() - (+pa.at || 0) <= AUTH_TTL) { st.state = pa.state; st.answeredAt = +pa.at; setHidden(Array.isArray(pa.hidden) ? pa.hidden : []); note('auth-restored', pa.state); } } catch (e) {}
  (function tick() {
    refresh('tick');
    setTimeout(tick, TICK);
  })();

  /* ---- r5: authority wait (story + epoch bound). Consumers: persistent producers that must not write while UNKNOWN ---- */
  function curStory() {
    try {
      var k = window.__chronicleDocumentStoryKey;
      if (typeof k === 'string') { if (k === 'chr6') return 'default'; if (k.indexOf('chr6_slot_') === 0) return k.slice(10); }
      var q = new URL(location.href).searchParams.get('story');
      if (q && ID_RE.test(q)) return q;
    } catch (e) {}
    return null;
  }
  function isStale(w) {
    if (curStory() !== w.doc) return true;   /* the document this wait was made for is no longer open */
    var we = window.__chrEpoch; if (typeof we !== 'number' || we !== w.ep) return true;
    var le = +(g('chr6_epoch') || 0); if (le > w.ep) return true;   /* another tab reset this device's game */
    return false;
  }
  function verdictFor(sid) { var e = effState(); if (e === 'unknown') return null; if (e === 'novault') return 'novault'; return st.hidden.indexOf(sid) >= 0 ? 'hidden' : 'visible'; }
  function settle(w) {
    if (isStale(w)) { note('authority-stale', w.sid); w.resolve({ effective: 'stale', reason: 'STALE_AUTHORITY_WAIT', storyId: w.sid, epoch: w.ep, answeredAt: st.answeredAt }); return; }
    var v = verdictFor(w.sid);
    if (v === null) { waiters.push(w); return; }   /* authority lapsed again before settling: keep waiting */
    note('authority-resolved', w.sid + ':' + v);
    w.resolve({ effective: v, storyId: w.sid, epoch: w.ep, answeredAt: st.answeredAt });
  }
  function sweepStale() {   /* runs on every refresh attempt, answered or not */
    if (!waiters.length) return; var keep = [];
    waiters.forEach(function (w) { if (isStale(w)) { note('authority-stale-swept', w.sid); w.resolve({ effective: 'stale', reason: 'STALE_AUTHORITY_WAIT', storyId: w.sid, epoch: w.ep, answeredAt: st.answeredAt }); } else keep.push(w); });
    waiters = keep;
  }
  function flushWaiters() { if (!waiters.length || effState() === 'unknown') return; var list = waiters; waiters = []; list.forEach(settle); }
  function whenAuthority(storyId, epoch) {
    return new Promise(function (resolve) {
      var w = { sid: String(storyId), doc: curStory(), ep: (typeof epoch === 'number') ? epoch : NaN, resolve: resolve, at: Date.now() };
      if (!ID_RE.test(w.sid) || !isFinite(w.ep)) { resolve({ effective: 'stale', reason: 'BAD_ARGS', storyId: w.sid, epoch: epoch, answeredAt: 0 }); return; }
      if (w.sid !== w.doc) { note('authority-bad-context', w.sid); resolve({ effective: 'stale', reason: 'BAD_CONTEXT', storyId: w.sid, epoch: w.ep, answeredAt: 0 }); return; }
      if (effState() !== 'unknown') { Promise.resolve().then(function () { settle(w); }); return; }
      waiters.push(w); note('authority-wait', w.sid);
    });
  }

  window.__v292Dvault2CopyGate = {
    status: function () { return { mode: V2_CLIENT_MODE, f889Allowed: st.f889Allowed || 0, f697pAllowed: st.f697pAllowed || 0, scope: scope.s, scopeWhy: scope.why, scopeChecks: scope.checks, scopeLast: scope.last, state: st.state, effective: effState(), answeredAt: st.answeredAt, unknownDenied: st.unknownDenied, hidden: st.hidden.slice(), lastAt: st.lastAt, refreshes: st.refreshes, denied: JSON.parse(JSON.stringify(st.denied)), allowedExisting: st.allowedExisting, log: st.log.slice(-40) }; },
    refresh: refresh,
    whenAuthority: whenAuthority,
    pendingAuthorityWaits: function () { return waiters.length; }
  };
})();
