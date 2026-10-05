/* v292Dav2-data — Asset v2 client DATA PLANE (C1)  — offline candidate, NOT DEPLOYED
 * GPT 904 = GO_WITH_FIXES (D1 + D2 + D4, C1 before C2, D5 split):
 *   D1  local shape: cast.av2 = { assetSchema:2, sid, bindings, known, retired } (transport sidecar).
 *       canonical shape is unchanged: body.assetSchema / body.bindings / body.cast entries carry ids.
 *       push (local → canonical) and pull (canonical → local) are the two pure functions below; they are
 *       called at exactly 4 save-core boundaries (fix697 projectFrom, fix743 buildSchema2Record,
 *       fix743 buildWritePlan, fix705 schema1 apply). Without cast.av2 / body.assetSchema they return the
 *       input untouched (legacy bytes identical).
 *   D2  registration is closed to ONE path (the registrar here). fix697 calls holdCanonical() before an
 *       ordinary canonical push; schema-2 + an entry without character_id ⇒ that push is held (dirty kept)
 *       and the registrar runs: fresh getstory → one CAS putcanonical → ALWAYS fresh getstory →
 *       server readback is the authority → apply the server ids / bindings → verify → release → flush.
 *       castIdAssignments is diagnostics only.
 *   D4  a story enters schema 2 only through an explicit Owner migration, in TWO stages (Worker av2d, Q10 / lane D #02):
 *       S9a prepare  — migrate(): sidecar mode PREP (cast.av2.assetIdPrep = 1) → push emits body.assetIdPrep = 1 → the
 *                     registrar (same single-write path) gets server-minted ids; the story STAYS schema 1 (legacy portraits,
 *                     docSchema2() false). Ids are protected by the server from then on (also with the flag OFF).
 *       S9b switch   — switchToSchema2(report): only from a server-confirmed PREP story, nothing left to register, the local
 *                     document in sync, and a migration report in which every non-DELETED character's legacy picture is
 *                     secured (canSwitchToSchema2 semantics). One CAS write; local switches only after the fresh readback.
 *   D5  reading / rendering schema-2 stories never depends on the local flag; the flag only opens migration.
 *   F5  (GPT 905) legacy code may splice an NPC out of S.cast.npcs; for a schema-2 story push re-emits that id with
 *       status 'DEPARTED' from the last server snapshot (never DELETED: DELETED is an explicit, irreversible operation).
 *       pull moves DEPARTED and DELETED entries into the sidecar (retired, each keeping its status) so legacy code does not
 *       see them; an id-less entry whose name is BOUND to a DEPARTED id takes that id back (re-appearance).
 *   F-FZ1 (lane D frozen QA → GPT, 2026-10-02): the registrar / S9a write never carries this device's whole local projection.
 *       Base = the FRESH server canonical (its turns and every other field); delta = the new local entries (registration) or
 *       assetIdPrep = 1 (S9a) only. A strict CAS 409 (write provably not applied) allows ONE rebase write on the newest
 *       server body; a second 409 → conflict HOLD. Ambiguous outcomes keep write retry 0 (readback → recovered / pending).
 * Flag (entry points only): localStorage v292Dav2On = '1'.
 * Kill: localStorage v292Dav2Off = '1' stops migration + the registrar (no new registration). The shape map and the
 *   push HOLD stay active on purpose: they are what keeps an existing schema-2 story from being downgraded or mis-hashed.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined' || window.__v292Dav2Map) return;
  var TAG = '[av2]';
  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dav2Off') === '1'; }
  function flagOn(){ return lsg('v292Dav2On') === '1'; }
  function isArr(a){ return Object.prototype.toString.call(a) === '[object Array]'; }
  function isObj(o){ return !!o && typeof o === 'object' && Object.prototype.toString.call(o) !== '[object Array]'; }
  function clone(o){ return JSON.parse(JSON.stringify(o)); }
  var CID_RE = /^ch_[A-Za-z0-9_-]{8,64}$/;
  var LOG = []; function note(o){ try { o.t = Date.now(); LOG.push(o); if (LOG.length > 200) LOG.shift(); } catch(e){} }

  /* ---- sidecar validity: written only by pull / registrar / migrate for THIS story id ---- */
  function av2Of(cast, storyId){
    if (!isObj(cast) || !isObj(cast.av2)) return null;
    var a = cast.av2;
    if (!(a.assetSchema === 2 || a.assetIdPrep === 1) || typeof a.sid !== 'string' || !storyId || a.sid !== String(storyId)) return null;
    return a;
  }
  /* identity mode of a sidecar / canonical body: 'S2' (assetSchema 2) | 'PREP' (S9a prepared schema 1) | null */
  function modeOf(o){ return !isObj(o) ? null : (o.assetSchema === 2 ? 'S2' : (o.assetIdPrep === 1 ? 'PREP' : null)); }
  function isIdentityBody(b){ return modeOf(b) !== null; }
  function sidecarHead(mode, storyId){ return mode === 'PREP' ? { assetIdPrep: 1, sid: String(storyId) } : { assetSchema: 2, sid: String(storyId) }; }
  function entriesOf(cast){
    var out = [];
    if (isObj(cast.hero)) out.push({ path: 'hero', e: cast.hero });
    if (Object.prototype.toString.call(cast.npcs) === '[object Array]')
      cast.npcs.forEach(function(n, i){ if (isObj(n)) out.push({ path: 'npcs[' + i + ']', e: n }); });
    return out;
  }

  /* ---- D1 push: local body → canonical body. Returns the SAME object when nothing applies. ---- */
  function push(body, storyId){
    if (!isObj(body) || !isObj(body.cast) || !Object.prototype.hasOwnProperty.call(body.cast, 'av2')) return body;
    var a = av2Of(body.cast, storyId);
    var cast = {}; for (var k in body.cast) if (k !== 'av2') cast[k] = body.cast[k];
    var out = {}; for (var k2 in body) out[k2] = body[k2];
    out.cast = cast;
    if (!a) return out;                                         // foreign / invalid sidecar: never leaks to the server, story stays legacy
    var npcs = (Object.prototype.toString.call(cast.npcs) === '[object Array]') ? cast.npcs.slice() : [];
    var present = {};
    entriesOf(cast).forEach(function(x){ if (typeof x.e.character_id === 'string') present[x.e.character_id] = 1; });
    var retired = (Object.prototype.toString.call(a.retired) === '[object Array]') ? a.retired : [];
    var retiredById = {}; retired.forEach(function(r){ if (isObj(r) && typeof r.character_id === 'string') retiredById[r.character_id] = r; });
    var binds = isObj(a.bindings) ? a.bindings : {};
    var known = isObj(a.known) ? a.known : {};
    /* DEPARTED candidates = retired DEPARTED entries + known ids that legacy code removed since the last pull
       (those are what push re-emits as DEPARTED below; run1 FAIL: the second set was missed) */
    var departed = function(bid){
      if (!bid || present[bid]) return false;
      var r = retiredById[bid];
      if (r) return r.status === 'DEPARTED';
      return Object.prototype.hasOwnProperty.call(known, bid) && isObj(known[bid]);
    };
    /* F5b (GPT 905): re-appearance — an id-less entry whose exact (NFC/trim) name is BOUND to a DEPARTED retired id takes that id
       back (status leaves DEPARTED). Explicit binding only; DELETED is never revived (server would refuse anyway). */
    npcs = npcs.map(function(n){
      if (!isObj(n) || n.character_id !== undefined || typeof n.name !== 'string') return n;
      var bid = binds[n.name.normalize('NFC').trim()];
      if (!departed(bid)) return n;
      var m = {}; for (var k in n) m[k] = n[k]; m.character_id = bid; present[bid] = 1; return m;
    });
    retired.forEach(function(r){ if (isObj(r) && typeof r.character_id === 'string' && !present[r.character_id]){ npcs.push(r); present[r.character_id] = 1; } });
    Object.keys(known).sort().forEach(function(id){                // F5 (GPT 905): removed by legacy code → DEPARTED (never DELETED, never dropped)
      if (present[id] || !isObj(known[id])) return;
      var snap = clone(known[id]); snap.character_id = id; snap.status = 'DEPARTED';
      npcs.push(snap); present[id] = 1;
    });
    cast.npcs = npcs;
    if (modeOf(a) === 'S2'){ out.assetSchema = 2; delete out.assetIdPrep; } else { out.assetIdPrep = 1; delete out.assetSchema; }   // S9a: prepared stays schema 1
    out.bindings = isObj(a.bindings) ? a.bindings : {};
    return out;
  }
  /* ---- D1 pull: canonical body → local cast (with the sidecar). Returns the SAME cast when not schema 2. ---- */
  function pullCast(body, storyId){
    if (!isObj(body)) return body && body.cast;
    /* re-hydrated from the server (this story's canonical applied locally) = rebased: the registrar's conflict HOLD and a read-only
       preflight block are cleared here and re-evaluated on the next run. This happens for EVERY mode, including a legacy body — candidate 5:
       an S9A_CAST_DIVERGED hold is taken while the server is still legacy, so it must be clearable by the explicit re-hydration too. */
    try { if (storyId && lsg('v292Dav2_cfl_' + storyId) != null) localStorage.removeItem('v292Dav2_cfl_' + storyId); } catch(e){}
    /* F-FZ2 / GPT (AD-MIS): a PREFLIGHT block (a new local name owned / bound elsewhere) is re-evaluated after a re-hydration — the server's
       bindings may have been repaired or added (e.g. 乙 → Z) and the entry then resolves by exact binding (adopt, write 0).
       A server-409 block (by: 'server409') stays until the registration input changes (GPT 907). */
    try { if (storyId){ var bk = JSON.parse(lsg('v292Dav2_blk_' + storyId) || 'null'); if (bk && bk.by === 'preflight') localStorage.removeItem('v292Dav2_blk_' + storyId); } } catch(e){}
    var cast = body.cast;
    var mode = modeOf(body);
    if (!mode || !isObj(cast)) return cast === undefined ? null : cast;
    var c = clone(cast);
    var keep = [], retired = [];
    if (Object.prototype.toString.call(c.npcs) === '[object Array]')
      c.npcs.forEach(function(n){ if (isObj(n) && (n.status === 'DELETED' || n.status === 'DEPARTED')) retired.push(n); else keep.push(n); });   // both kept with their own status
    if (Object.prototype.toString.call(c.npcs) === '[object Array]') c.npcs = keep;
    var known = {};
    entriesOf(c).forEach(function(x){ if (typeof x.e.character_id === 'string') known[x.e.character_id] = (function(){ var s = clone(x.e); delete s.character_id; return s; })(); });
    c.av2 = sidecarHead(mode, storyId); c.av2.bindings = isObj(body.bindings) ? clone(body.bindings) : {}; c.av2.known = known; c.av2.retired = retired;
    return c;
  }
  function isSchema2Local(cast, storyId){ var a = av2Of(cast, storyId); return !!a && modeOf(a) === 'S2'; }   // PREP is NOT schema 2 (legacy portraits stay)
  function isIdentityLocal(cast, storyId){ return !!av2Of(cast, storyId); }
  function idlessPaths(canonBody){
    if (!isIdentityBody(canonBody) || !isObj(canonBody.cast)) return [];
    return entriesOf(canonBody.cast).filter(function(x){ return x.e.character_id === undefined; }).map(function(x){ return x.path; });
  }

  /* ================= D2 registrar (GPT 905: putcanonical at most ONCE per registration; up to 5 readback polls) ================= */
  var reg = { busy: false, held: {}, runs: 0, ok: 0, fail: 0, writes: 0, polls: 0, last: null, next: {} };
  var POLL_MAX = 5, POLL_BACKOFF_MS = 3000;
  var PEND = 'v292Dav2_reg_';
  function lss(k, v){ try { localStorage.setItem(k, v); return true; } catch(e){ return false; } }
  function lsr(k){ try { localStorage.removeItem(k); } catch(e){} }
  function loadPending(id){ try { var o = JSON.parse(lsg(PEND + id) || 'null'); return (o && o.v === 1) ? o : null; } catch(e){ return null; } }
  function savePending(id, o){ return lss(PEND + id, JSON.stringify(o)); }
  function F697(){ return window.__v292Dfix697 || null; }
  function state(){ try { return (typeof window.__chronicleGetState === 'function') ? window.__chronicleGetState('av2') : (window.S || null); } catch(e){ return null; } }
  function curStoryId(){ try { var F = F697(); return F && F.status ? F.status().storyId : null; } catch(e){ return null; } }
  function getAt(cast, path){ var m = /^npcs\[(\d+)\]$/.exec(path); if (path === 'hero') return cast.hero; return m ? (cast.npcs || [])[+m[1]] : undefined; }
  function stripId(e){ var s = clone(e); delete s.character_id; return s; }
  function noAlias(e){ var s = clone(e); delete s.av2_aliases; return s; }
  /* order-insensitive deep equality (server blobs are stable-stringified = sorted keys; local objects keep insertion order) */
  function stable(v){
    if (v === undefined) return 'null';
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Object.prototype.toString.call(v) === '[object Array]') return '[' + v.map(stable).join(',') + ']';
    return '{' + Object.keys(v).sort().filter(function(k){ return v[k] !== undefined; }).map(function(k){ return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
  }
  function same(a, b){ return stable(a) === stable(b); }
  function digest(str){ var h1 = 0xdeadbeef, h2 = 0x41c6ce57; for (var i = 0; i < str.length; i++){ var c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16) + ':' + (h1 >>> 0).toString(16) + ':' + str.length; }
  function nameKey(e){ var n = (e && e.name !== undefined) ? e.name : (e && e.display_name); return (typeof n === 'string') ? n.normalize('NFC').trim() : ''; }
  /* GPT 907: registration input fingerprint = the new entries' registration inputs only (name / display_name / aliases / status) */
  function regFingerprint(b){ try { return digest(stable(idlessPaths(b).map(function(p){ var e = getAt(b.cast, p) || {};
      return [nameKey(e), isArr(e.av2_aliases) ? e.av2_aliases.map(function(v){ return typeof v === 'string' ? v.normalize('NFC').trim() : ''; }) : [], e.status === 'DELETED' ? 'D' : '']; }).sort(function(x, y){ return stable(x) < stable(y) ? -1 : 1; }))); } catch(e){ return ''; } }
  /* blocked = the server (or the read-only preflight) REFUSED this registration input definitively. Persisted; same input → write 0;
     cleared only when the fingerprint changes (never by UI). Distinct from pending (= outcome unknown → readback only). */
  var BLK = 'v292Dav2_blk_';
  function loadBlocked(id){ try { var o = JSON.parse(lsg(BLK + id) || 'null'); return (o && o.v === 1) ? o : null; } catch(e){ return null; } }
  function saveBlocked(id, o){ o.v = 1; o.t = Date.now(); return lss(BLK + id, JSON.stringify(o)); }
  /* GPT 909: conflict = CAS stale / rebase-needed (the write did NOT apply, the server moved). write 0, HOLD; one fresh read only.
     Cleared when the local document is re-hydrated from the server (pull for this story) or nothing is left to register. */
  var CFL = 'v292Dav2_cfl_';
  /* Worker putcanonical strict-CAS refusal codes (fix697 calls this class CANONICAL_WRITE_CONFLICT client-side) */
  var CAS_409 = { 'rev-mismatch': 1, 'hash-mismatch': 1, CANONICAL_WRITE_CONFLICT: 1 };
  function loadConflict(id){ try { var o = JSON.parse(lsg(CFL + id) || 'null'); return (o && o.v === 1) ? o : null; } catch(e){ return null; } }
  function saveConflict(id, o){ o.v = 1; o.t = Date.now(); return lss(CFL + id, JSON.stringify(o)); }
  /* 409 codes that are a definitive contract refusal (the write did not and will not apply for this input) */
  var DEFINITIVE_409 = { BINDING_CONFLICT: 1, BINDING_REBIND: 1, BINDING_REMOVED: 1, BINDING_UNKNOWN_ID: 1, BINDING_TO_DELETED: 1,
    BAD_BINDING_KEY: 1, BAD_ALIASES: 1, BAD_STATUS: 1, CHARACTER_ID_REMOVED: 1, UNKNOWN_CHARACTER_ID: 1, DUPLICATE_CHARACTER_ID: 1,
    CHARACTER_ID_NOT_SERVER_MINTED: 1, ASSET_SCHEMA_DOWNGRADE_FORBIDDEN: 1,
    /* Worker av2d (lane D #01/#02, Q10) */
    BAD_CHARACTER_ID: 1, BAD_CAST: 1, BAD_BINDINGS: 1, DELETED_IS_FINAL: 1, ALIASES_ON_EXISTING_ID: 1, CLONE_ORIGIN_IMMUTABLE: 1,
    AV2_PREPARE_REQUIRED: 1, AV2_PREPARED_ID_REMOVAL_FORBIDDEN: 1, AV2_SWITCH_UNAVAILABLE: 1, PREV_UNREADABLE: 1 };
  function restOf(b){ var o = {}; for (var x in b) if (x !== 'cast' && x !== 'bindings') o[x] = b[x]; return o; }
  /* called by fix697 (canonicalCommit / canonicalCommit2) with the V1 canonical projection */
  /* F5b local write-back: push gives a re-appeared entry its DEPARTED id in the outgoing copy; the same id is written into
     the local entry (exact binding key only) so identity no longer depends on the name (a later rename keeps the id). */
  function adoptReappeared(id){
    try {
      var S = state(); if (!S || !isObj(S.cast) || !isIdentityLocal(S.cast, id) || !isArr(S.cast.npcs)) return 0;
      var b = push({ cast: S.cast }, id); if (!b || !isObj(b.cast) || !isArr(b.cast.npcs)) return 0;
      var n = 0;
      S.cast.npcs.forEach(function(e, i){ var o = b.cast.npcs[i];
        if (isObj(e) && e.character_id === undefined && isObj(o) && typeof o.character_id === 'string' && o.name === e.name){ e.character_id = o.character_id; n++; } });
      if (n){ try { S.save(); } catch(e){} note({ kind: 'AV2_REAPPEARED_ADOPTED', id: id, n: n }); }
      return n;
    } catch(e){ return 0; }
  }
  function holdCanonical(id, content){
    try {
      if (!content || !content.body) return false;
      if (isIdentityBody(content.body)) setTimeout(function(){ adoptReappeared(id); }, 0);
      if (!idlessPaths(content.body).length && !loadPending(id)){ if (loadBlocked(id)) lsr(BLK + id); if (loadConflict(id)) lsr(CFL + id); return false; }   // nothing to register: stale block / conflict dropped
      reg.held[id] = (reg.held[id] || 0) + 1;
      note({ kind: 'AV2_CANONICAL_PUSH_HELD', id: id });
      if (loadConflict(id) && !loadPending(id)) return true;                                       // conflict: held, write 0, no polling until rebased
      var bl = loadBlocked(id);
      if (bl && !loadPending(id)){
        if (bl.fp === regFingerprint(content.body)) return true;                                   // same input: held, write 0, no re-check
        lsr(BLK + id); note({ kind: 'AV2_BLOCK_CLEARED_INPUT_CHANGED', id: id });                    // input changed → new registration
        setTimeout(function(){ run(id, 'input-changed'); }, 0); return true;
      }
      var nx = reg.next[id] || 0;
      if (Date.now() >= nx) setTimeout(function(){ run(id, 'hold'); }, 0);
      return true;                                              // ordinary push held, dirty kept
    } catch(e){ return false; }
  }
  function finish(id, kind, extra){
    reg.busy = false; reg.last = { kind: kind, id: id, extra: extra || null, t: Date.now() };
    if (kind === 'AV2_REGISTERED') reg.ok++; else if (kind !== 'AV2_NOTHING_TO_REGISTER' && kind !== 'AV2_POLL_PENDING') reg.fail++;
    note({ kind: kind + (extra && extra.reason ? ':' + extra.reason : ''), id: id, extra: extra || null });
    if (kind === 'AV2_REGISTERED' || kind === 'AV2_MIGRATION_REFUSED' || kind === 'AV2_NOTHING_TO_REGISTER'){
      delete reg.held[id]; delete reg.next[id]; try { var F = F697(); if (F && F.flush) F.flush(); } catch(e){} }
  }
  function buildRecord(F, id, schema){
    try {
      if (schema === 2){ var C = window.__v292DfixCC2; var b = C && C.buildSchema2Record ? C.buildSchema2Record({ nativeGet: lsg }, id) : null; return (b && !b.hold && b.record) ? b.record : null; }
      var p = F.projection ? F.projection() : null; return (p && String(p.id) === String(id)) ? p : null;
    } catch(e){ return null; }
  }
  var refsMem = {};   // same-session object refs (id → { sentPath: local entry object })
  /* ================= F-FZ1 (lane D frozen QA → GPT: fresh server canonical is the BASE; the registrar sends only its delta) =================
     The PUT body is never this device's whole local projection (that dropped another device's turns the moment this device was
     stale: LU / LUP / LUM). Base = the fresh server body (turns and every other canonical field kept as the server has them);
     delta = (S9a) assetIdPrep = 1, or (new characters) the local id-less entries appended to the server cast. The server mints the
     ids and the initial bindings. Local id-less entries whose exact name is already bound on the server to an id this device does
     not have (the other device registered the same character first) adopt that id locally without a write. */
  /* S9a pre-write identity check (pure): null when the local cast and the server cast are the same set of identities, else a short reason */
  function s9aDivergence(localCast, serverCast){
    try {
      var L = entriesOf(isObj(localCast) ? localCast : {}), R = entriesOf(isObj(serverCast) ? serverCast : {});
      if (L.some(function(x){ return x.e.character_id !== undefined; })) return 'LOCAL_HAS_IDS';          // not a fresh prepare
      var lh = isObj(localCast && localCast.hero), rh = isObj(serverCast && serverCast.hero);
      if (lh !== rh) return 'HERO_PRESENCE';
      if (lh && nameKey(localCast.hero) !== nameKey(serverCast.hero)) return 'HERO_NAME';
      var ln = {}, rn = {}, lc = 0, rc = 0;
      L.forEach(function(x){ if (x.path === 'hero') return; lc++; var k = nameKey(x.e); if (ln[k]) ln[k] = 'DUP'; else ln[k] = 1; });
      R.forEach(function(x){ if (x.path === 'hero') return; rc++; var k = nameKey(x.e); if (rn[k]) rn[k] = 'DUP'; else rn[k] = 1; });
      if (lc !== rc) return 'NPC_COUNT:' + lc + '/' + rc;
      if (ln[''] || rn['']) return 'EMPTY_NAME';                                                       // an npc without a name cannot be bound → ambiguous
      for (var k1 in ln){ if (ln[k1] === 'DUP' || rn[k1] === 'DUP') return 'DUP_NAME'; if (!rn[k1]) return 'LOCAL_ONLY:' + k1; }
      for (var k2 in rn){ if (!ln[k2]) return 'SERVER_ONLY:' + k2; }
      return null;
    } catch(e){ return 'THREW'; }
  }
  function compose(j, b0, rec, S){
    var serverMode = modeOf(b0), localMode = modeOf(rec.body);
    if (!localMode) return { stop: 'AV2_NOTHING_TO_REGISTER' };
    if (localMode === 'S2' && !serverMode) return { stop: 'AV2_REGISTRATION_BLOCKED', extra: { reason: 'SERVER_NOT_PREPARED' } };   // S9b is the only way into S2
    var sent = clone(b0); if (!isObj(sent.cast)) sent.cast = {};
    if (!isArr(sent.cast.npcs)) sent.cast.npcs = [];
    var localPaths = idlessPaths(rec.body);
    var refs = {}, paths = [], adopt = [];
    if (!serverMode){
      /* S9a prepare: the server story is legacy → the marker only. Every server entry gets an id; local entries map by exact name.
         Candidate 5 (lane D #12 → GPT: S9A_CAST_DIVERGED = HOLD / WRITE_0): the cast divergence is decided BEFORE the write, on the fresh
         server record (and again on the fresh read before a strict-409 rebase write, since the rebase recomposes here). The local cast and
         the server cast must be the same set of identities — hero present on both sides or neither with the same exact name, and the same
         exact npc names with no duplicate on either side. Anything else is ambiguous identity → HOLD, write 0, the server stays legacy. */
      var sdiv = s9aDivergence(S.cast, sent.cast);
      if (sdiv) return { stop: 'AV2_REGISTRATION_CONFLICT', conflict: { reason: 'S9A_CAST_DIVERGED', detail: sdiv }, extra: { reason: 'S9A_CAST_DIVERGED', detail: sdiv } };
      sent.assetIdPrep = 1; delete sent.assetSchema; sent.bindings = {};
      var lByName = {};
      localPaths.forEach(function(p){ var e = getAt(S.cast, p); var nk = nameKey(e); if (nk) lByName[nk] = p; });
      entriesOf(sent.cast).forEach(function(x){ paths.push(x.path); var nk = nameKey(x.e);
        if (nk && lByName[nk]){ var m = getAt(S.cast, lByName[nk]); if (isObj(m) && m.character_id === undefined) refs[x.path] = m; }
        else if (x.path === 'hero' && isObj(S.cast.hero) && S.cast.hero.character_id === undefined && nameKey(S.cast.hero) === nk) refs[x.path] = S.cast.hero; });
      return { sent: sent, paths: paths, refs: refs, adopt: adopt, s9a: true };
    }
    /* identity story on the server: keep its mode / bindings / every server entry (server content), append the genuinely new local
       entries. Entry ORDER follows this device's projection so that, when nothing else changed, the result equals what the ordinary
       push would send (local == server afterwards → converged, write 0); server entries this device has not pulled are kept after them. */
    var srvById = {}; var srvBind = isObj(b0.bindings) ? b0.bindings : {};
    entriesOf(b0.cast || {}).forEach(function(x){ if (typeof x.e.character_id === 'string') srvById[x.e.character_id] = x; });
    var localIds = {}; entriesOf(S.cast).forEach(function(x){ if (typeof x.e.character_id === 'string') localIds[x.e.character_id] = 1; });
    var used = {}, npcs = [];
    var newEntry = function(lp){
      var le = getAt(S.cast, lp), re = getAt(rec.body.cast, lp);
      if (!isObj(le) || !same(le, re)) return { stop: 'AV2_LOCAL_NOT_FLUSHED', extra: { path: lp } };
      /* GPT 924 SAME_BINDING_REMOTE_REGISTRATION: adopt the server id only when the EXACT normalized name is a canonical BINDING key
         that resolves to one non-DELETED server entry this device does not hold. An entry's current name is NOT a binding (a
         character renamed on another device must never capture a new local character of that name → preflight blocks instead). */
      var nk = nameKey(le);
      var bid = (nk && Object.prototype.hasOwnProperty.call(srvBind, nk) && typeof srvBind[nk] === 'string') ? srvBind[nk] : null;
      var hit = bid ? srvById[bid] : null;
      if (hit && !localIds[bid] && hit.e.status !== 'DELETED'){ adopt.push({ path: lp, m: le, character_id: bid }); return { adopt: bid }; }   // registered first by another device → same character
      return { e: le };
    };
    var hero = null;
    if (isObj(rec.body.cast.hero)){
      var lh = rec.body.cast.hero;
      if (typeof lh.character_id === 'string'){ var sh = srvById[lh.character_id]; if (sh && sh.path === 'hero'){ hero = clone(sh.e); used['hero'] = 1; } }
      else {
        var nh = newEntry('hero'); if (nh.stop) return nh;
        if (nh.adopt){ var sh2 = srvById[nh.adopt]; if (sh2 && sh2.path === 'hero'){ hero = clone(sh2.e); used['hero'] = 1; } }
        else if (isObj(b0.cast && b0.cast.hero) && typeof b0.cast.hero.character_id === 'string') return { stop: 'AV2_REGISTRATION_BLOCKED', extra: { reason: 'HERO_ID_MISMATCH' } };   // never mint a second hero
        else { hero = clone(nh.e); paths.push('hero'); refs['hero'] = nh.e; }
      }
    }
    if (!hero && isObj(b0.cast && b0.cast.hero)){ hero = clone(b0.cast.hero); used['hero'] = 1; }
    var lnp = isArr(rec.body.cast.npcs) ? rec.body.cast.npcs : [];
    for (var i = 0; i < lnp.length; i++){
      var le2 = lnp[i]; if (!isObj(le2)) continue;
      if (typeof le2.character_id === 'string'){ var se = srvById[le2.character_id]; if (se && se.path !== 'hero' && !used[se.path]){ npcs.push(clone(se.e)); used[se.path] = 1; } continue; }   // unknown to the server: not sent (never minted here)
      var ne = newEntry('npcs[' + i + ']'); if (ne.stop) return ne;
      if (ne.adopt){ var se2 = srvById[ne.adopt]; if (se2 && se2.path !== 'hero' && !used[se2.path]){ npcs.push(clone(se2.e)); used[se2.path] = 1; } continue; }
      npcs.push(clone(ne.e)); var sp = 'npcs[' + (npcs.length - 1) + ']'; paths.push(sp); refs[sp] = ne.e;
    }
    entriesOf(b0.cast || {}).forEach(function(x){ if (x.path !== 'hero' && !used[x.path]){ npcs.push(clone(x.e)); used[x.path] = 1; } });   // server entries this device has not pulled
    var cast = {}; for (var ck in (b0.cast || {})) if (ck !== 'hero' && ck !== 'npcs') cast[ck] = clone(b0.cast[ck]);
    if (hero) cast.hero = hero; cast.npcs = npcs; sent.cast = cast;
    if (!isObj(sent.bindings)) sent.bindings = {};
    return { sent: sent, paths: paths, refs: refs, adopt: adopt, s9a: false };
  }
  function applyAdopt(S, id, adopt){
    if (!adopt.length) return 0;
    adopt.forEach(function(a){ a.m.character_id = a.character_id; delete a.m.av2_aliases; });
    note({ kind: 'AV2_ID_ADOPTED_FROM_SERVER', id: id, n: adopt.length });
    try { S.save(); } catch(e){}
    return adopt.length;
  }
  /* local sidecar from the server body, restricted to the ids this device actually holds (ids it has not pulled yet stay unknown here;
     the Worker's CHARACTER_ID_REMOVED backstop protects them, and the ordinary push is held while the server is ahead anyway) */
  function applySidecar(S, id, b1){
    var c1 = pullCast(b1, id);
    var have = {}; entriesOf(S.cast).forEach(function(x){ if (typeof x.e.character_id === 'string') have[x.e.character_id] = 1; });
    var known = {}; Object.keys(c1.av2.known || {}).forEach(function(k){ if (have[k]) known[k] = c1.av2.known[k]; });
    if (!isObj(S.cast.av2) || S.cast.av2.sid !== String(id) || modeOf(S.cast.av2) !== modeOf(c1.av2)) S.cast.av2 = sidecarHead(modeOf(c1.av2), id);
    S.cast.av2.bindings = c1.av2.bindings; S.cast.av2.known = known; S.cast.av2.retired = c1.av2.retired;
  }
  /* preflight (read-only): a registration key already bound on the server, or the name of another entry of the body to be sent */
  function preflight(sent, paths){
    var sb = isObj(sent.bindings) ? sent.bindings : {};
    var owners = {};
    entriesOf(sent.cast).forEach(function(x){ var nk = nameKey(x.e); if (nk && paths.indexOf(x.path) < 0) owners[nk] = (owners[nk] || 0) + 1; });
    var newKeys = {};
    for (var q = 0; q < paths.length; q++){
      var eq = getAt(sent.cast, paths[q]); if (!isObj(eq) || eq.status === 'DELETED') continue;
      var keys = [nameKey(eq)].concat(isArr(eq.av2_aliases) ? eq.av2_aliases.map(function(v){ return typeof v === 'string' ? v.normalize('NFC').trim() : ''; }) : []);
      for (var kq = 0; kq < keys.length; kq++){ var kk = keys[kq]; if (!kk) continue;
        if (Object.prototype.hasOwnProperty.call(sb, kk) || owners[kk] || newKeys[kk]) return { key: kk, path: paths[q] };
        newKeys[kk] = 1; }
    }
    return null;
  }
  function run(id, why){
    if (reg.busy || off()) return;
    var F = F697(); if (!F || !F.getStoryV2Once || !F.putCanonicalOnce) return note({ kind: 'AV2_NO_PORT' });
    if (curStoryId() !== id) return note({ kind: 'AV2_NOT_DOCUMENT_STORY', id: id });
    reg.busy = true; reg.runs++;
    var pend = loadPending(id);
    if (pend){
      /* readback-only; automatic readbacks stop at POLL_MAX (HOLD + pending stay; C2 shows it; no auto retry) */
      if ((pend.polls || 0) >= POLL_MAX){ reg.busy = false; return null; }
      return readback(F, id, pend);
    }
    F.getStoryV2Once(id, function(g, gerr){
      var j = g && g.j;
      if (gerr || !g || g.status !== 200 || !j || !j.ok || String(j.authority || '') !== 'canonical' || j.deleted)
        return finish(id, 'AV2_PRE_READ_FAIL', { status: g && g.status, err: gerr || null });
      attempt(F, id, j, false);
    });
  }
  /* one registration attempt on the fresh read j: compose the delta on the server body → preflight → ONE CAS write → readback.
     rebased = true marks the single rebase write allowed after a strict CAS 409 (GPT: STRICT_409_REBASE = ALLOWED_MAX_1). */
  function attempt(F, id, j, rebased){
    var schema = (j.recordSchema === 2) ? 2 : 1;
    var rec = buildRecord(F, id, schema);
    if (!rec) return finish(id, 'AV2_NO_LOCAL_RECORD', { schema: schema });
    if (!idlessPaths(rec.body).length) return finish(id, 'AV2_NOTHING_TO_REGISTER');
    var S = state(); if (!S || !isObj(S.cast)) return finish(id, 'AV2_NO_STATE');
    var b0 = (j.record && isObj(j.record.body)) ? j.record.body : {};
    if (loadConflict(id)) return finish(id, 'AV2_REGISTRATION_CONFLICT', { reason: 'REBASE_REQUIRED', same: true });   // held after the second 409 until the document is re-hydrated
    var cmp = compose(j, b0, rec, S);
    if (cmp.stop){
      if (cmp.stop === 'AV2_REGISTRATION_BLOCKED'){ saveBlocked(id, { reason: cmp.extra.reason, by: 'preflight', fp: regFingerprint(rec.body) }); }
      if (cmp.stop === 'AV2_REGISTRATION_CONFLICT' && cmp.conflict){ saveConflict(id, { preRev: +j.rev || 0, seenRev: +j.rev || 0, reason: cmp.conflict.reason, detail: cmp.conflict.detail, rebased: !!rebased }); }   // HOLD, write 0 (cleared by an explicit re-hydration)
      return finish(id, cmp.stop, cmp.extra || null);
    }
    var adopted = applyAdopt(S, id, cmp.adopt);
    if (!cmp.paths.length){
      /* everything id-less here was already registered elsewhere: no write; the sidecar follows the server */
      applySidecar(S, id, b0); try { S.save(); } catch(e){}
      return finish(id, 'AV2_REGISTERED', { ids: 0, adopted: adopted, serverRev: j.rev, write: 0 });
    }
    var pf = cmp.s9a ? null : preflight(cmp.sent, cmp.paths);
    if (pf){
      /* the Worker would refuse the WHOLE save with BINDING_CONFLICT: not sent; the push stays HELD and C2 shows the reason */
      saveBlocked(id, { reason: 'BINDING_CONFLICT', by: 'preflight', key: pf.key, path: pf.path, fp: regFingerprint(rec.body) });
      return finish(id, 'AV2_REGISTRATION_BLOCKED', { reason: 'BINDING_CONFLICT', key: pf.key, path: pf.path });
    }
    var blk0 = loadBlocked(id);
    if (blk0 && blk0.fp === regFingerprint(rec.body)) return finish(id, 'AV2_REGISTRATION_BLOCKED', { reason: blk0.reason, same: true });   // never write the same refused input
    if (blk0) lsr(BLK + id);
    var mid = 'av2reg:' + id + ':' + (+j.rev || 0) + ':' + String(j.serverHash || '').slice(0, 16);
    var p0 = { v: 1, mid: mid, preRev: +j.rev || 0, preHash: String(j.serverHash || ''), schema: schema, paths: cmp.paths, s9a: cmp.s9a, rebased: !!rebased,
               sent: { cast: clone(cmp.sent.cast), bindings: clone(cmp.sent.bindings || {}), rest: digest(stable(restOf(cmp.sent))) },
               polls: 0, t: Date.now() };
    if (!savePending(id, p0)) return finish(id, 'AV2_PENDING_NOT_DURABLE');     // intent must be durable before the one write
    refsMem[id] = cmp.refs;
    reg.writes++;
    /* F-FZ2 (lane D on candidate 3): the record ENVELOPE (title / deleted / sidecar / …) is the fresh server record's too — the local
       envelope carried this device's stale story title over another device's rename. Only id / schema stay this device's (same values). */
    var srvRec = (j.record && isObj(j.record)) ? j.record : {};
    var outRec = {}; for (var k in rec){ outRec[k] = (k === 'id' || k === 'schema') ? rec[k] : (Object.prototype.hasOwnProperty.call(srvRec, k) ? clone(srvRec[k]) : rec[k]); }
    outRec.body = cmp.sent;
    F.putCanonicalOnce({ id: id, expectedRev: p0.preRev, expectedHash: p0.preHash, record: outRec, mid: mid,
                         clientMeta: { device: (navigator.userAgent || '').slice(0, 60), build: 'av2reg' } }, function(w, werr){
      var wj = w && w.j;
      note({ kind: 'AV2_REG_WRITE', id: id, status: w ? w.status : null, err: werr || null, code: wj && wj.errorCode || null, rebased: !!rebased,
             assignments: wj && wj.castIdAssignments ? wj.castIdAssignments.length : 0 });   // diagnostics only
      var code = wj && wj.errorCode;
      if (w && w.status === 409 && !werr && code && DEFINITIVE_409[code]){ p0.definitive = String(code); savePending(id, p0); }   // definitive refusal (still confirmed by a fresh read)
      else if (w && w.status === 409 && !werr && CAS_409[code]){ p0.casConflict = String(code); savePending(id, p0); }   // CAS stale: not applied, server moved
      else if (w && w.status === 200 && !werr && wj && wj.ok === true){ p0.ack200 = true; savePending(id, p0); }   // acknowledged (may be a noop: the server can keep a legacy body unchanged)
      readback(F, id, p0);                                       // ALWAYS reconcile from a fresh read (ambiguous: pending + readback only)
    });
  }
  /* readback-only (except the single rebase write after a strict CAS 409): applies the server identity data only when the readback is provably ours. */
  function readback(F, id, pend){
    pend.polls = (pend.polls || 0) + 1; reg.polls++; savePending(id, pend);
    F.getStoryV2Once(id, function(g2, gerr2){
      var j2 = g2 && g2.j;
      var again = function(kind, reason){
        if (pend.polls >= POLL_MAX){ return finish(id, 'AV2_REGISTRAR_GAVE_UP', { reason: reason }); }   // HOLD + pending stay (C2 shows it)
        reg.next[id] = Date.now() + POLL_BACKOFF_MS * pend.polls;
        return finish(id, 'AV2_POLL_PENDING', { reason: reason });
      };
      if (gerr2 || !g2 || g2.status !== 200 || !j2 || !j2.ok || !j2.record){
        if (pend.casConflict){ lsr(PEND + id); delete refsMem[id]; saveConflict(id, { preRev: pend.preRev, seenRev: null, read: 'FAIL' }); return finish(id, 'AV2_REGISTRATION_CONFLICT', { reason: 'CAS_STALE', read: 'FAIL' }); }
        return again('AV2_POST_READ_FAIL', 'READ_' + (g2 && g2.status));
      }
      var b1 = j2.record.body || {};
      if (pend.casConflict){
        /* strict CAS 409 = that PUT is known NOT to have applied. F-FZ1 / GPT: fresh read → rebuild the same delta on the newest server
           body → ONE new CAS (rebase write, not a blind retry). A second 409 → conflict HOLD (write 0) until the document is re-hydrated. */
        var vC = isIdentityBody(b1) ? verifyOurs(pend.sent, b1, pend.paths) : { ok: false };
        if (!vC.ok){
          lsr(PEND + id); delete refsMem[id];
          if (!pend.rebased && String(j2.authority || '') === 'canonical' && !j2.deleted){ note({ kind: 'AV2_REG_REBASE', id: id, fromRev: pend.preRev, toRev: +j2.rev || 0 }); return attempt(F, id, j2, true); }
          saveConflict(id, { preRev: pend.preRev, seenRev: +j2.rev || 0, seenHash: String(j2.serverHash || '').slice(0, 16), rebased: !!pend.rebased });
          return finish(id, 'AV2_REGISTRATION_CONFLICT', { reason: 'CAS_STALE', seenRev: +j2.rev || 0, rebased: !!pend.rebased }); }
        /* (defensive) readback is provably ours → fall through to the normal apply */
      }
      var S = state();
      /* MIG2 run1: an ACKNOWLEDGED write whose readback is a legacy body = the server accepted it and kept the story legacy
         (prepare / schema 2 not enabled → marker dropped; may be a noop with rev unchanged). Outcome known: refused, not pending. */
      if (pend.ack200 && !isIdentityBody(b1)){ lsr(PEND + id); delete refsMem[id]; return migrationRefused(id, S, 'SERVER_KEPT_LEGACY'); }
      if (+j2.rev === pend.preRev && String(j2.serverHash || '') === pend.preHash){
        if (pend.definitive){
          /* GPT 907: definitive contract 409 + server provably unchanged → outcome known (refused): pending ends, blocked by input fingerprint */
          saveBlocked(id, { reason: pend.definitive, by: 'server409', fp: regFingerprint({ assetSchema: 2, cast: pend.sent.cast }) });   // the refused input itself
          lsr(PEND + id); delete refsMem[id];
          return finish(id, 'AV2_REGISTRATION_BLOCKED', { reason: pend.definitive, by: 'server409' });
        }
        /* server unchanged since the CAS precondition: the single write has not (yet) landed. GPT 905: the registrar
           writes AT MOST ONCE → no re-send here; the pending intent stays, later polls are readback-only. */
        pend.notLanded = true; savePending(id, pend);
        return again('AV2_POLL_PENDING', 'NOT_LANDED');
      }
      if (!isIdentityBody(b1)){ lsr(PEND + id); return migrationRefused(id, S, 'SERVER_NOT_IDENTITY'); }   // server kept it legacy (prepare not enabled)
      var v = verifyOurs(pend.sent, b1, pend.paths);
      if (!v.ok) return again('AV2_RECONCILE_DIVERGED', v.reason);   // never guessed
      if (!S || !isObj(S.cast)) return again('AV2_NO_STATE', 'NO_STATE');
      /* apply the server-minted ids to the local entries: same-session object refs, else a local id-less entry equal to what was sent,
         else (S9a) the local id-less entry with the same exact name. Local turns / other fields are never touched (F-FZ1). */
      var refs = refsMem[id] || {}, local = entriesOf(S.cast), used = {};
      var pick = function(p){
        var m = refs[p];
        if (isObj(m) && m.character_id === undefined && local.some(function(x){ return x.e === m; })){
          if (!pend.s9a || p === 'hero') return m;                                           // hero is unique by position on both sides
          var sidR = (getAt(b1.cast, p) || {}).character_id, bndR = isObj(b1.bindings) ? b1.bindings : {}, nkR = nameKey(m);
          if (nkR && bndR[nkR] === sidR) return m;                                       // S9a hint confirmed by the server binding
        }
        var sentE = getAt(pend.sent.cast, p) || {};
        var cands = local.filter(function(x){ return x.e.character_id === undefined && !used[x.path] && same(noAlias(x.e), noAlias(sentE)); });
        if (cands.length === 1) return cands[0].e;
        if (pend.s9a){ /* S9a: the server bound each primary name to the minted id → a local id-less entry whose exact name is bound to THIS id */
          var sid1 = (getAt(b1.cast, p) || {}).character_id; var bnd = isObj(b1.bindings) ? b1.bindings : {};
          cands = local.filter(function(x){ var nk = nameKey(x.e); return x.e.character_id === undefined && !used[x.path] && nk && bnd[nk] === sid1; }); if (cands.length === 1) return cands[0].e; }
        return null;
      };
      var applied = 0, missing = 0;
      for (var i = 0; i < pend.paths.length; i++){
        var p = pend.paths[i], m2 = pick(p), sid2 = getAt(b1.cast, p).character_id;
        if (!m2){ missing++; continue; }                              // this device has no such entry (S9a on a stale device): the pull brings it
        if (!pend.s9a) { /* new characters must map; otherwise the readback is not ours for this device */ }
        m2.character_id = sid2; delete m2.av2_aliases; applied++;
        local.forEach(function(x){ if (x.e === m2) used[x.path] = 1; });
      }
      if (!pend.s9a && missing) return again('AV2_RECONCILE_DIVERGED', 'LOCAL_MOVED');
      applySidecar(S, id, b1);
      try { S.save(); } catch(e){}
      lsr(PEND + id); delete refsMem[id];
      /* S9a on a device whose cast differs from the server (a local id-less entry no server binding resolves, or a server id this device
         does not hold): ambiguous identity → HOLD (conflict) until the document is re-hydrated from the server; never guess, never
         register the unmapped local entries as new characters (GPT 924: ambiguous → HOLD / conflict side). */
      var s9aDiverged = false;
      if (pend.s9a){
        var haveNow = {}; entriesOf(S.cast).forEach(function(x){ if (typeof x.e.character_id === 'string') haveNow[x.e.character_id] = 1; });
        var unknownSrv = entriesOf(b1.cast).some(function(x){ return typeof x.e.character_id === 'string' && !haveNow[x.e.character_id]; });
        var unmappedLocal = entriesOf(S.cast).some(function(x){ return x.e.character_id === undefined; });
        if (missing || unknownSrv || unmappedLocal){ s9aDiverged = true; saveConflict(id, { preRev: pend.preRev, seenRev: +j2.rev || 0, reason: 'S9A_CAST_DIVERGED' }); }
      }
      /* F-FZ1 (2): the server moved by our delta write only when the base we composed on IS the device's last confirmed rev.
         Then the device's save base advances to the new server rev (fingerprint = the server's hash), so the next ordinary push
         (this device's unsaved turn + the ids) is a normal CAS write instead of a fix910 REMOTE_AHEAD hold (first regression on
         56e749f: C1R2 B4 went DIVERGED on a single device). Composed on a newer rev than the device had confirmed (another device
         wrote in between) → base NOT advanced → the ordinary path holds / diverges exactly as for an ordinary save (LUC). */
      var baseAdv = null;
      try { var G = window.__v292Dfix781; var mk = (G && typeof G.marker === 'function') ? G.marker(id) : null; var lc = mk && mk.lastConfirmed;
            var landedRev = +j2.rev, landedFp = String(j2.serverHash || '');
            if (G && typeof G.confirm === 'function' && lc && typeof lc.serverRev === 'number' && lc.serverRev === pend.preRev && landedRev > pend.preRev && landedFp){
              G.confirm(id, landedRev, landedFp); baseAdv = { from: pend.preRev, to: landedRev }; }
            else baseAdv = { kept: true, lc: lc ? lc.serverRev : null, preRev: pend.preRev }; } catch(e){ baseAdv = { err: String(e).slice(0, 60) }; }
      note({ kind: 'AV2_SAVE_BASE', id: id, base: baseAdv });
      var p2 = buildRecord(F, id, pend.schema);
      if (!p2 || !p2.body) return finish(id, 'AV2_IDENTITY_PARITY_UNREADABLE');
      var srvById = {}; entriesOf(b1.cast).forEach(function(x){ if (typeof x.e.character_id === 'string') srvById[x.e.character_id] = x.e; });
      var okIds = entriesOf(p2.body.cast).every(function(x){ return typeof x.e.character_id !== 'string' || !!srvById[x.e.character_id]; });   // every local id is a server id
      if (!okIds || !same(p2.body.bindings, b1.bindings)) return finish(id, 'AV2_IDENTITY_PARITY_FAIL');
      var contentEqual = same(p2.body, b1);
      finish(id, 'AV2_REGISTERED', { ids: applied, missing: missing, serverRev: j2.rev, contentEqual: contentEqual, polls: pend.polls, rebased: !!pend.rebased, s9a: !!pend.s9a, base: baseAdv, s9aDiverged: s9aDiverged });
    });
  }
  /* the readback is "ours" iff it equals what we sent with ONLY the id-less entries gaining ids and only new
     bindings that point at those new ids (exact comparison; no name inference) */
  function verifyOurs(sent, srvBody, paths){
    try {
      var sentCast = sent.cast !== undefined ? sent.cast : sent.cast;
      var sentE = entriesOf(sentCast), srvE = entriesOf(srvBody.cast);
      if (sentE.length !== srvE.length) return { ok: false, reason: 'ENTRY_COUNT' };
      var newIds = {};
      for (var i = 0; i < sentE.length; i++){
        var a = sentE[i], b = srvE[i];
        if (a.path !== b.path) return { ok: false, reason: 'PATH' };
        if (paths.indexOf(a.path) >= 0){
          if (typeof b.e.character_id !== 'string' || !CID_RE.test(b.e.character_id)) return { ok: false, reason: 'NO_ID:' + a.path };
          if (!same(noAlias(a.e), stripId(b.e))) return { ok: false, reason: 'ENTRY:' + a.path };
          newIds[b.e.character_id] = 1;
        } else if (!same(a.e, b.e)) return { ok: false, reason: 'ENTRY:' + a.path };
      }
      var sb = sent.bindings || {}, rb = srvBody.bindings || {};
      for (var k in sb) if (rb[k] !== sb[k]) return { ok: false, reason: 'BINDING_CHANGED:' + k };
      for (var k2 in rb) if (!Object.prototype.hasOwnProperty.call(sb, k2) && !newIds[rb[k2]]) return { ok: false, reason: 'BINDING_FOREIGN:' + k2 };
      var restSent = (typeof sent.rest === 'string') ? sent.rest : digest(stable(restOf(sent)));
      if (restSent !== digest(stable(restOf(srvBody)))) return { ok: false, reason: 'BODY' };
      return { ok: true };
    } catch(e){ return { ok: false, reason: 'THREW' }; }
  }
  function migrationRefused(id, S, reason){
    /* server kept the story legacy (flag off / not allowlisted): drop the local sidecar so the document returns
       to the plain r3b shape (ids were never assigned, nothing to undo on the server) */
    try { if (S && isObj(S.cast) && S.cast.av2 && !Object.keys(S.cast.av2.known || {}).length){ delete S.cast.av2; S.save(); } } catch(e){}
    finish(id, 'AV2_MIGRATION_REFUSED', { reason: reason });
  }

  /* ================= explicit binding addition (GPT 905: data-plane op; additive only; C2 UI calls it) ================= */
  /* ================= ★cand_sideport_authority (GPT #31-c, fix697 / canonical authority 共通 lane) =================
     SIDEPORT_WRITE_INVALIDATES_FIX697_AUTHORITY_ON_DRIFT の共通修正。addBinding / deleteCharacter / setProfile は全てこの helper を通る。
     契約（GPT #31-c）:
       1. authority 判定は **fresh server canonical と persisted canonical slot**（buildRecord = local keys から組んだ projection）。runtime memory（S）は見ない。
       2. persisted != fresh server → LOCAL_NOT_SYNCED、side-port request 0。
       3. runtime-only drift を side-port の前後で canonical 化しない: pre-write の S.save() / F.flush() を呼ばない。
       4. 成功後の persisted mirror は **server が受理した readback** を authority にする: delta path だけを readback の値で persisted slot へ書く
          （generic S.save() で runtime 全体を書かない）。
       5. memory（S）には対象 delta だけ追従させる。
       6. unrelated field の canonical mutation 0（送る body = persisted projection + delta のみ。post-check: persisted projection == readback）。
       7. 409 = 最大 1 rebase（fresh read → 前提 2 を再確認 → もう 1 回だけ CAS）、それ以上 retry 0。
     op = { kind, id, S, F, schema, mutate(sentBody) → true|{code}, mid(rev), mirror(S, slotObj, readbackBody) → true|{code}, expectBody(readbackBody) → bool } */
  function sidePortCommit(op, cb){
    cb = (typeof cb === 'function') ? cb : function(){};
    var id = op.id, S = op.S, F = op.F;
    var attempt = 0;
    var done = function(o){ note({ kind: 'AV2_SIDEPORT_' + String(op.kind).toUpperCase() + '_' + (o.ok ? 'OK' : o.code), id: id, attempt: attempt }); cb(o); };
    function once(){
      attempt++;
      F.getStoryV2Once(id, function(g, gerr){
        var j = g && g.j;
        if (gerr || !g || g.status !== 200 || !j || !j.ok || !j.record) return done({ ok: false, code: 'READ_FAIL' });
        if (String(j.authority || '') !== 'canonical' || j.deleted) return done({ ok: false, code: 'NOT_CANONICAL_ROW' });   /* ★audit B1: shadow / deleted row → request 0 (same gate as the registrar) */
        var b0 = j.record.body || {};
        /* ★r5 (GPT #31-d): per-op phase. setProfile = PREP + schema2 (the Owner must be able to confirm an appearance before S9b);
           addBinding / deleteCharacter keep the production contract (schema2 only). */
        var srvMode = modeOf(b0);
        if (!(srvMode === 'S2' || (srvMode === 'PREP' && op.allowPrep === true))) return done({ ok: false, code: srvMode === 'PREP' ? 'NOT_SCHEMA2_DOCUMENT' : 'SERVER_NOT_SCHEMA2' });
        var schema = (j.recordSchema === 2) ? 2 : 1;
        if (schema !== 2) return done({ ok: false, code: 'SERVER_NOT_SCHEMA2' });   /* ★audit B4: the full-record hash check exists only for schema 2 → refuse anything else */
        var rec = buildRecord(F, id, schema);                           // persisted canonical slot (NOT runtime memory)
        if (!rec || !isObj(rec.body)) return done({ ok: false, code: 'NO_LOCAL_RECORD' });
        if (!same(rec.body, b0)) return done({ ok: false, code: 'LOCAL_NOT_SYNCED', serverRev: j.rev });   // contract 2: request 0
        if (idlessPaths(rec.body).length) return done({ ok: false, code: 'REGISTRATION_PENDING' });
        /* ★audit D1 (SP r2): the body alone is not the record — title + the 13-field sidecar are PUT and hashed too. Require the
           persisted record's client hash (fix705's CANONICAL_SAME_HASH domain = F.contentHashV2) == serverHash before writing. */
        if (schema === 2 && typeof F.contentHashV2 === 'function'){
          return F.contentHashV2(id, function(h){ if (!h || h !== String(j.serverHash || '')) return done({ ok: false, code: 'LOCAL_NOT_SYNCED', serverRev: j.rev, why: 'RECORD_HASH' }); proceed(); });
        }
        proceed();
        function proceed(){
        var sentBody = clone(rec.body);
        var m; try { m = op.mutate(sentBody, b0); } catch(em){ m = { ok: false, code: 'MUTATE_THREW' }; }   /* ★audit D6 */
        if (m !== true) return done(isObj(m) ? m : { ok: false, code: 'MUTATE_FAILED' });
        if (same(sentBody, b0)) return done({ ok: true, noop: true, serverRev: j.rev });
        rec.body = sentBody;
        F.putCanonicalOnce({ id: id, expectedRev: +j.rev || 0, expectedHash: String(j.serverHash || ''), record: rec, mid: op.mid(+j.rev || 0) }, function(w, werr){
          var wst = w && w.status;
          F.getStoryV2Once(id, function(g2){                            // readback is the authority (never re-send on unknown)
            var j2 = g2 && g2.j; var b2 = j2 && j2.record && j2.record.body;
            if (!b2) return done({ ok: false, code: 'READBACK_FAIL', status: wst || null, err: werr || null });
            if (!same(b2, sentBody)){
              var ec = w && w.j && (w.j.errorCode || w.j.error);
              var moved = (+j2.rev || 0) > (+j.rev || 0);
              if (wst === 409 && attempt < 2 && moved && !SP_NO_REBASE_409[ec]) return once();   // ★R3-2: rebase only on staleness evidence (server rev advanced), never on a row-state refusal; contract 7: exactly one rebase (re-read + re-check + one CAS); never on a definitive refusal (★audit D5)
              if (wst === 200 && entryDeltaLanded(b2, sentBody, b0, op)) return done({ ok: false, code: 'APPLIED_SERVER_MOVED', status: wst, serverRev: j2.rev });   /* ★audit D4: our delta is on the server but another device moved it again — mirror 0, reload re-hydrates */
              return done({ ok: false, code: (wst === 409) ? ((ec && (DEFINITIVE_409[ec] || SP_NO_REBASE_409[ec])) ? String(ec) : 'CONFLICT') : 'NOT_APPLIED', status: wst || null, err: werr || ec || null });   /* ★R3-5 */
            }
            /* contract 4 + 5: persisted slot ← readback (delta path only), memory ← delta only. No S.save(). */
            var mk = (window.__v292DfixCC2 && typeof window.__v292DfixCC2.keysFor === 'function') ? window.__v292DfixCC2.keysFor(String(id)) : null;
            var slotKey = mk && mk.body; if (!slotKey) return done({ ok: true, serverRev: j2.rev, mirror: 'NO_SLOT_KEY' });
            var slotRaw = lsg(slotKey), slot = null; try { slot = JSON.parse(slotRaw || 'null'); } catch(e){}
            if (!isObj(slot)) return done({ ok: true, serverRev: j2.rev, mirror: 'SLOT_UNREADABLE' });
            var mr; try { mr = op.mirror(S, slot, b2); } catch(emr){ mr = { code: 'MIRROR_THREW' }; }   /* ★audit D6 */
            if (mr !== true) return done({ ok: true, serverRev: j2.rev, mirror: 'MIRROR_FAILED:' + (isObj(mr) && mr.code || '?') });
            if (!lss(slotKey, JSON.stringify(slot))) return done({ ok: true, serverRev: j2.rev, mirror: 'SLOT_WRITE_FAILED' });
            var rec2 = buildRecord(F, id, schema); var post = !!(rec2 && isObj(rec2.body) && same(rec2.body, b2));   // contract 6 post-check
            try { if (typeof op.after === 'function') op.after(b2); } catch(e){}
            done({ ok: true, serverRev: j2.rev, mirror: post ? 'PERSISTED_EQUALS_READBACK' : 'PERSISTED_DIVERGED', reloadRequired: true });   /* ★R3-4: fix733 TYPE A → the document must be re-read before the next push */
          });
        });
        }
      });
    }
    once();
  }
  /* ★audit D5 / B2: codes a rebase can never cure. The registrar's DEFINITIVE_409 (above) is the base set; side-port adds the
     canonical-row refusals (★audit B1). Distinct name — never re-declare DEFINITIVE_409 in this scope (hoisting replaced the 23-key map). */
  var SP_NO_REBASE_409 = { 'canonical-deleted': 1, 'not-canonical': 1, 'not-found': 1, DELETED_IS_FINAL: 1, ALIASES_ON_EXISTING_ID: 1, CLONE_ORIGIN_IMMUTABLE: 1, ASSET_SCHEMA_DOWNGRADE_FORBIDDEN: 1, AV2_PREPARE_REQUIRED: 1 };   /* row-state refusals: a rebase can never cure them */
  /* ★audit D4: did OUR delta land even though the readback differs elsewhere? (op.landed = the op's own predicate on the readback) */
  function entryDeltaLanded(b2, sent, b0, op){ try { return typeof op.landed === 'function' ? op.landed(b2) === true : false; } catch(e){ return false; } }
  /* persisted-slot patch helpers: write ONLY the given entry / field from the readback */
  function entryOfBody(body, characterId){ var t = entriesOf((body && body.cast) || {}).filter(function(x){ return x.e.character_id === characterId; })[0]; return t ? t.e : null; }
  function setEntryField(target, path, fieldsFrom){ var e = getAt(target.cast || {}, path); if (!isObj(e)) return false; for (var k in fieldsFrom) if (Object.prototype.hasOwnProperty.call(fieldsFrom, k)){ if (fieldsFrom[k] === undefined) delete e[k]; else e[k] = clone(fieldsFrom[k]); } return true; }

  function addBinding(name, characterId, cb){
    cb = (typeof cb === 'function') ? cb : function(){};
    if (off()) return cb({ ok: false, code: 'AV2_OFF' });
    if (!flagOn()) return cb({ ok: false, code: 'AV2_FLAG_OFF' });
    var id = curStoryId(); var S = state(); var F = F697();
    if (!id || !S || !isSchema2Local(S.cast, id) || !F) return cb({ ok: false, code: 'NOT_SCHEMA2_DOCUMENT' });
    if (reg.busy || loadPending(id)) return cb({ ok: false, code: 'REGISTRATION_IN_PROGRESS' });
    var key = (typeof name === 'string') ? name.normalize('NFC').trim() : '';
    if (!key || key.length > 80 || key === '__proto__' || key === 'constructor' || key === 'prototype') return cb({ ok: false, code: 'BAD_BINDING_KEY' });   /* ★audit B3 */
    if (typeof characterId !== 'string' || !CID_RE.test(characterId)) return cb({ ok: false, code: 'BAD_CHARACTER_ID' });
    reg.busy = true;
    var done = function(o){ reg.busy = false; note({ kind: 'AV2_ADD_BINDING_' + (o.ok ? 'OK' : o.code), id: id }); cb(o); };
    sidePortCommit({ kind: 'bind', id: id, S: S, F: F,
      mutate: function(sent, b0){
        var sb = b0.bindings || {};
        if (Object.prototype.hasOwnProperty.call(sb, key)) return (sb[key] === characterId) ? true : { ok: false, code: 'BINDING_REBIND' };   // same → noop (sent == b0)
        var target = entriesOf(b0.cast || {}).filter(function(x){ return x.e.character_id === characterId; })[0];
        if (!target) return { ok: false, code: 'UNKNOWN_CHARACTER_ID' };
        if (target.e.status === 'DELETED') return { ok: false, code: 'BINDING_TO_DELETED' };
        var nbind = {}; for (var bk in (sent.bindings || {})) nbind[bk] = sent.bindings[bk];
        nbind[key] = characterId; sent.bindings = nbind; return true;                      // + the one additive binding
      },
      mid: function(rev){ return 'av2bind:' + id + ':' + rev + ':' + digest(key + '|' + characterId); },
      landed: function(b2){ return !!(b2.bindings && b2.bindings[key] === characterId); },
      mirror: function(S1, slot, b2){                                                        // delta = bindings only (from the readback)
        if (!isObj(slot.cast) || !isObj(slot.cast.av2)) return { code: 'NO_SIDECAR' };
        slot.cast.av2.bindings = clone(b2.bindings);
        if (isObj(S1.cast) && isObj(S1.cast.av2)) S1.cast.av2.bindings = clone(b2.bindings);
        return true;
      } }, done);   /* contract 3: no F.flush() after a side-port either (it would push runtime drift) */
  }

  /* ================= C2: explicit DELETE (GPT 911: server success + fresh readback FIRST, then local retire) ================= */
  function deleteCharacter(characterId, cb){
    cb = (typeof cb === 'function') ? cb : function(){};
    if (off()) return cb({ ok: false, code: 'AV2_OFF' });
    if (!flagOn()) return cb({ ok: false, code: 'AV2_FLAG_OFF' });
    var id = curStoryId(); var S = state(); var F = F697();
    if (!id || !S || !isSchema2Local(S.cast, id) || !F) return cb({ ok: false, code: 'NOT_SCHEMA2_DOCUMENT' });
    if (typeof characterId !== 'string' || !CID_RE.test(characterId)) return cb({ ok: false, code: 'BAD_CHARACTER_ID' });
    if (reg.busy || loadPending(id)) return cb({ ok: false, code: 'REGISTRATION_IN_PROGRESS' });
    if (loadConflict(id)) return cb({ ok: false, code: 'REBASE_REQUIRED' });
    reg.busy = true;
    var done = function(o){ reg.busy = false; note({ kind: 'AV2_DELETE_' + (o.ok ? 'OK' : o.code), id: id }); cb(o); };
    sidePortCommit({ kind: 'delete', id: id, S: S, F: F,
      mutate: function(sent, b0){
        var tgt = entriesOf(b0.cast || {}).filter(function(x){ return x.e.character_id === characterId; })[0];
        if (!tgt) return { ok: false, code: 'UNKNOWN_CHARACTER_ID' };
        if (tgt.path === 'hero') return { ok: false, code: 'HERO_NOT_DELETABLE' };
        if (tgt.e.status === 'DELETED') return { ok: false, code: 'ALREADY_DELETED' };
        var te = entriesOf(sent.cast).filter(function(x){ return x.e.character_id === characterId; })[0];
        te.e.status = 'DELETED';
        /* canonical form = active entries first, retired after them (unchanged from the previous implementation) */
        var tp = /^npcs\[(\d+)\]$/.exec(te.path);
        if (tp && isArr(sent.cast.npcs)){ var moved = sent.cast.npcs.splice(+tp[1], 1)[0]; sent.cast.npcs.push(moved); }
        return true;
      },
      mid: function(rev){ return 'av2del:' + id + ':' + rev + ':' + digest(characterId); },
      landed: function(b2){ var e = entryOfBody(b2, characterId); return !!(e && e.status === 'DELETED'); },
      mirror: function(S1, slot, b2){                                                        // delta = this entry out of the active cast + sidecar from the readback
        var c2 = pullCast(b2, id);
        var retire = function(cast){
          if (!isObj(cast)) return false;
          if (isArr(cast.npcs)) cast.npcs = cast.npcs.filter(function(n){ return !(isObj(n) && n.character_id === characterId); });
          if (!isObj(cast.av2) || cast.av2.sid !== String(id)) cast.av2 = { assetSchema: 2, sid: String(id) };
          cast.av2.bindings = clone(c2.av2.bindings); cast.av2.known = clone(c2.av2.known); cast.av2.retired = clone(c2.av2.retired);
          return true;
        };
        if (!retire(slot.cast)) return { code: 'NO_SLOT_CAST' };
        retire(S1.cast);
        return true;
      } }, done);   /* contract 3: no F.flush() after a side-port either (it would push runtime drift) */
  }

  /* ================= ensure_first minimal entry (GPT 913 Q3): explicit Owner action only, never automatic =================
     One registered, non-DELETED character of a schema-2 story with NO pointer. Refused while a registration is pending /
     blocked / conflicting. Before the one billable call: a fresh portrait.list (pointer already there → no call). The call is
     sent at most once per invocation; an unknown outcome (network / timeout / 5xx other than 502) is reconciled by ONE more
     portrait.list (read only) — never re-sent. The server side single-flights and refuses when candidates exist. */
  var efBusy = {};
  function ensureFirst(characterId, opts, cb){
    cb = (typeof cb === 'function') ? cb : function(){};
    opts = isObj(opts) ? opts : {};
    if (off()) return cb({ ok: false, code: 'AV2_OFF' });
    if (!flagOn()) return cb({ ok: false, code: 'AV2_FLAG_OFF' });
    var id = curStoryId(); var S = state(); var F = F697();
    if (!id || !S || !isIdentityLocal(S.cast, id) || !F || typeof F.assetV2EnsureFirst !== 'function' || typeof F.assetV2Read !== 'function') return cb({ ok: false, code: 'NOT_SCHEMA2_DOCUMENT' });   // GPT 915: also from the migration UI on a prepared story
    if (typeof characterId !== 'string' || !CID_RE.test(characterId)) return cb({ ok: false, code: 'BAD_CHARACTER_ID' });
    if (reg.busy || loadPending(id)) return cb({ ok: false, code: 'REGISTRATION_IN_PROGRESS' });
    if (loadConflict(id)) return cb({ ok: false, code: 'REBASE_REQUIRED' });
    if (loadBlocked(id)) return cb({ ok: false, code: 'REGISTRATION_BLOCKED' });
    var tgt = entriesOf(S.cast).filter(function(x){ return x.e.character_id === characterId; })[0];
    if (!tgt) return cb({ ok: false, code: 'UNKNOWN_CHARACTER_ID' });                       // retired (DEPARTED / DELETED) are not in the active cast
    if (tgt.e.status === 'DELETED') return cb({ ok: false, code: 'CHARACTER_DELETED' });
    if (efBusy[characterId] || ndBusy[characterId]) return cb({ ok: false, code: 'IN_PROGRESS' });   /* ★audit P2C I2: not while an explicit new draw runs */
    efBusy[characterId] = true;
    var done = function(o){ delete efBusy[characterId]; note({ kind: 'AV2_ENSURE_FIRST_' + (o.ok ? 'OK' : o.code), id: id, cid: characterId }); cb(o); };
    var hasPointer = function(cb2){ F.assetV2Read('portrait.list', { story_id: id }, function(r, err){
      var j = r && r.j; if (err || !r || r.status !== 200 || !j || !isArr(j.portraits)) return cb2(null);
      cb2(j.portraits.some(function(p){ return p && p.character_id === characterId; })); }); };
    hasPointer(function(h0){
      if (h0 === null) return done({ ok: false, code: 'READ_FAIL' });
      if (h0 === true) return done({ ok: true, code: 'EXISTS', calls: 0 });
      /* ★av2f client (GPT #31 / #31-b): owner_confirmed_empty_profile is NEVER sent. 「外見情報が無いことの確認」≠「AI に人物を発明させてよい承認」.
         An empty profile answers UNGROUNDED_REQUIRES_EXPLICIT_NEW_DRAW (av2f) — or, against the older Worker, PROFILE_EMPTY_CONFIRM_REQUIRED —
         and in both cases the client stops here (provider call 0). The Owner either sets the appearance (setProfile) or presses the explicit
         「新しいデザインを生成（候補のみ）」 (newDraw → portrait.regenerate + explicit_new_draw, candidate only, never adopted). */
      F.assetV2EnsureFirst({ story_id: id, character_id: characterId }, function(r, err){
        var j = r && r.j, st = r && r.status;
        if (!err && st === 200 && j && j.ok){
          if (j.status === 'CREATED' || j.status === 'EXISTS') return done({ ok: true, code: j.status, calls: 1 });
          if (j.status === 'PROFILE_EMPTY_CONFIRM_REQUIRED') return done({ ok: false, code: 'UNGROUNDED_REQUIRES_EXPLICIT_NEW_DRAW', calls: 1, legacyStatus: j.status });   // older Worker: same decision, no confirm dialog
          return done({ ok: false, code: String(j.status || 'UNKNOWN_STATUS'), calls: 1 });   // UNGROUNDED_REQUIRES_EXPLICIT_NEW_DRAW / PROFILE_REVIEW_REQUIRED / CANDIDATES_PENDING / IN_FLIGHT / LOST_RACE
        }
        var code = j && (j.errorCode || j.error);
        if (!err && st === 402) return done({ ok: false, code: 'BUDGET', calls: 1 });
        if (!err && st === 429) return done({ ok: false, code: 'RATE_LIMITED', calls: 1 });
        if (!err && st === 502) return done({ ok: false, code: 'GENERATION_FAILED', calls: 1 });
        if (!err && (st === 501 || st === 403 || st === 404)) return done({ ok: false, code: st === 404 ? 'NOT_FOUND' : 'ASSET_V2_UNAVAILABLE', calls: 1 });
        /* outcome unknown: ONE read-only reconcile, no re-send */
        hasPointer(function(h1){
          if (h1 === true) return done({ ok: true, code: 'CREATED_CONFIRMED', calls: 1 });
          done({ ok: false, code: 'OUTCOME_UNKNOWN', calls: 1, status: st || null, err: err || code || null });
        });
      });
    });
  }

  /* ================= ★av2f client follow-up (GPT #31-b, same integration gate as Worker av2f): profile review + explicit new draw =================
     Contract: chrAiAv4 / cast.desc are REVIEW SUGGESTIONS only — never written into profile.appearance by code. profile.appearance is
     written only by setProfile(), i.e. after the Owner has read / edited / confirmed the text. source_appearance_present then means
     「レビュー済み appearance が存在する」. newDraw() is the ONLY path that sends explicit_new_draw === true; it never adopts. */
  var PROFILE_APPEARANCE_MAX = 400;
  function genderOf(v){ return (v === '女性' || v === '男性') ? v : ''; }   /* ★audit P2C D1: strict equality — never an object lookup (inherited keys) */
  function cleanAppearance(v){
    if (typeof v !== 'string') return '';
    var s = v.normalize('NFC').replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}|]+/gu, ' ').replace(/\s+/g, ' ').trim();   /* ★audit P2C D4: same classes as the Worker sanitizer */
    if (s.length > PROFILE_APPEARANCE_MAX) s = s.slice(0, PROFILE_APPEARANCE_MAX); if (/[\ud800-\udbff]$/.test(s)) s = s.slice(0, -1);
    return s.trim();
  }
  /* read-only: what this device can show the Owner as reference text (never sent anywhere by this function) */
  function suggestAppearance(characterId){
    var id = curStoryId(); var S = state();
    if (!id || !S || !isObj(S.cast)) return { ok: false, code: 'NO_DOCUMENT' };
    var tgt = entriesOf(S.cast).filter(function(x){ return x.e.character_id === characterId; })[0];
    if (!tgt) return { ok: false, code: 'UNKNOWN_CHARACTER_ID' };
    var e = tgt.e, name = (typeof e.name === 'string') ? e.name : '';
    var legacy = null;
    try { var pre = 'chrAiAv4:' + name + '::'; for (var i = 0; i < localStorage.length; i++){ var k = localStorage.key(i); if (k && k.indexOf(pre) === 0){ var v = localStorage.getItem(k); if (typeof v === 'string' && v.trim()){ legacy = v.trim().slice(0, 1200); break; } } } } catch(e1){}
    var p = isObj(e.profile) ? e.profile : {};
    return { ok: true, name: name, gender: genderOf(e.gender), desc: (typeof e.desc === 'string') ? e.desc.trim().slice(0, 1200) : '', legacy: legacy,
             current: { gender: genderOf(p.gender), appearance: (typeof p.appearance === 'string') ? p.appearance : '' }, reviewed: e.source_appearance_present === true };
  }
  /* explicit Owner action: fresh read → local == server → one CAS putcanonical carrying ONLY this entry's profile → readback is the authority */
  function setProfile(characterId, input, cb){
    cb = (typeof cb === 'function') ? cb : function(){};
    if (off()) return cb({ ok: false, code: 'AV2_OFF' });
    if (!flagOn()) return cb({ ok: false, code: 'AV2_FLAG_OFF' });
    var id = curStoryId(); var S = state(); var F = F697();
    if (!id || !S || !isIdentityLocal(S.cast, id) || !F || !F.getStoryV2Once || !F.putCanonicalOnce) return cb({ ok: false, code: 'NOT_SCHEMA2_DOCUMENT' });   /* ★r5: PREP or schema2 (identity present) */
    if (typeof characterId !== 'string' || !CID_RE.test(characterId)) return cb({ ok: false, code: 'BAD_CHARACTER_ID' });
    input = isObj(input) ? input : {};
    var appearance = cleanAppearance(input.appearance);
    var gender = genderOf(input.gender);
    if (!appearance) return cb({ ok: false, code: 'EMPTY_APPEARANCE' });
    if (input.ownerConfirmed !== true) return cb({ ok: false, code: 'OWNER_CONFIRM_REQUIRED' });   // the UI passes this only from the explicit 「この外見で確定」 button
    if (reg.busy || loadPending(id)) return cb({ ok: false, code: 'REGISTRATION_IN_PROGRESS' });
    if (loadConflict(id)) return cb({ ok: false, code: 'REBASE_REQUIRED' });
    reg.busy = true;
    var prof = { v: 1, appearance: appearance }; if (gender) prof.gender = gender;
    var done = function(o){ reg.busy = false; note({ kind: 'AV2_SET_PROFILE_' + (o.ok ? 'OK' : o.code), id: id, cid: characterId }); cb(o); };
    /* ★cand_sideport_authority: no S.save() / F.flush() before the write (GPT #31-c contract 3). The persisted slot is compared with the
       fresh server inside sidePortCommit; runtime drift stays in memory and is never canonicalised by this operation. */
    sidePortCommit({ kind: 'profile', id: id, S: S, F: F, allowPrep: true,
      mutate: function(sent, b0){
        var tgt = entriesOf(b0.cast || {}).filter(function(x){ return x.e.character_id === characterId; })[0];
        if (!tgt) return { ok: false, code: 'UNKNOWN_CHARACTER_ID' };
        if (tgt.e.status === 'DELETED') return { ok: false, code: 'CHARACTER_DELETED' };
        var te = entriesOf(sent.cast).filter(function(x){ return x.e.character_id === characterId; })[0];
        te.e.profile = clone(prof); te.e.source_appearance_present = true;              // = a REVIEWED appearance exists (GPT #31)
        return true;
      },
      mid: function(rev){ return 'av2prof:' + id + ':' + rev + ':' + digest(characterId + '|' + stable(prof)); },
      landed: function(b2){ var e = entryOfBody(b2, characterId); return !!(e && same(e.profile, prof) && e.source_appearance_present === true); },
      mirror: function(S1, slot, b2){                                                        // delta = this entry's profile + flag, values from the readback
        var se = entryOfBody(b2, characterId); if (!se) return { code: 'ENTRY_MISSING_IN_READBACK' };
        var fields = { profile: se.profile, source_appearance_present: se.source_appearance_present };
        /* ★audit D2: a DEPARTED character is in the server cast but locally in cast.av2.retired — patch there */
        var patchRetired = function(cast){ var r = (cast && isObj(cast.av2) && isArr(cast.av2.retired)) ? cast.av2.retired.filter(function(x){ return isObj(x) && x.character_id === characterId; })[0] : null; if (!r) return false; for (var k in fields) if (Object.prototype.hasOwnProperty.call(fields, k)){ if (fields[k] === undefined) delete r[k]; else r[k] = clone(fields[k]); } return true; };
        var pt = entriesOf(slot.cast || {}).filter(function(x){ return x.e.character_id === characterId; })[0];
        if (pt) setEntryField(slot, pt.path, fields); else if (!patchRetired(slot.cast)) return { code: 'ENTRY_MISSING_IN_SLOT' };
        var lt = entriesOf(S1.cast || {}).filter(function(x){ return x.e.character_id === characterId; })[0]; if (lt) setEntryField(S1, lt.path, fields); else patchRetired(S1.cast);
        return true;
      } }, function(r){ if (r && r.ok) r.profile = clone(prof); done(r); });   /* contract 3: no F.flush() after a side-port */
  }
  /* explicit Owner action = 「新しいデザインを生成（候補のみ）」: ONE portrait.regenerate with explicit_new_draw === true. The result is a
     CANDIDATE (pointer untouched); adoption stays a separate explicit choice (adoptCandidate). Sent at most once per invocation; an
     unknown outcome is NOT re-sent (the Owner opens the picker to look). */
  var ndBusy = {};
  function newDraw(characterId, opts, cb){
    cb = (typeof cb === 'function') ? cb : function(){};
    opts = isObj(opts) ? opts : {};
    if (off()) return cb({ ok: false, code: 'AV2_OFF' });
    if (!flagOn()) return cb({ ok: false, code: 'AV2_FLAG_OFF' });
    var id = curStoryId(); var S = state(); var F = F697();
    if (!id || !S || !isIdentityLocal(S.cast, id) || !F || typeof F.assetV2Write !== 'function') return cb({ ok: false, code: 'NOT_SCHEMA2_DOCUMENT' });
    if (typeof characterId !== 'string' || !CID_RE.test(characterId)) return cb({ ok: false, code: 'BAD_CHARACTER_ID' });
    if (opts.ownerExplicit !== true) return cb({ ok: false, code: 'OWNER_CONFIRM_REQUIRED' });
    if (reg.busy || loadPending(id)) return cb({ ok: false, code: 'REGISTRATION_IN_PROGRESS' });
    if (loadConflict(id)) return cb({ ok: false, code: 'REBASE_REQUIRED' });
    if (loadBlocked(id)) return cb({ ok: false, code: 'REGISTRATION_BLOCKED' });
    var tgt = entriesOf(S.cast).filter(function(x){ return x.e.character_id === characterId; })[0];
    if (!tgt) return cb({ ok: false, code: 'UNKNOWN_CHARACTER_ID' });
    if (tgt.e.status === 'DELETED') return cb({ ok: false, code: 'CHARACTER_DELETED' });
    if (ndBusy[characterId] || efBusy[characterId]) return cb({ ok: false, code: 'IN_PROGRESS' });
    ndBusy[characterId] = true;
    var done = function(o){ delete ndBusy[characterId]; note({ kind: 'AV2_NEW_DRAW_' + (o.ok ? 'OK' : o.code), id: id, cid: characterId }); cb(o); };
    F.assetV2Write('portrait.regenerate', { story_id: id, character_id: characterId, explicit_new_draw: true }, function(r, err){
      var j = r && r.j, st = r && r.status;
      if (!err && st === 200 && j && j.ok){
        if (j.status === 'CANDIDATE_CREATED' || (j.candidate && typeof j.candidate === 'string')) return done({ ok: true, code: 'CANDIDATE_CREATED', calls: 1, candidate: j.candidate || null, grounded: j.grounded === true });
        return done({ ok: false, code: String(j.status || 'UNKNOWN_STATUS'), calls: 1 });   // IN_FLIGHT / LOST_RACE
      }
      var code = j && (j.errorCode || j.error);
      if (!err && st === 400 && code === 'EXPLICIT_NEW_DRAW_REQUIRED') return done({ ok: false, code: 'EXPLICIT_NEW_DRAW_REQUIRED', calls: 1 });   // should never happen (flag is always sent)
      if (!err && st === 402) return done({ ok: false, code: 'BUDGET', calls: 1 });
      if (!err && st === 429) return done({ ok: false, code: 'RATE_LIMITED', calls: 1 });
      if (!err && st === 502) return done({ ok: false, code: 'GENERATION_FAILED', calls: 1 });
      if (!err && (st === 501 || st === 403 || st === 404)) return done({ ok: false, code: st === 404 ? 'NOT_FOUND' : 'ASSET_V2_UNAVAILABLE', calls: 1 });
      done({ ok: false, code: 'OUTCOME_UNKNOWN', calls: 1, status: st || null, err: err || code || null });
    });
  }

  /* ================= GPT 915: minimal Owner migration UI — data operations (explicit only; never automatic) =================
     Per non-DELETED character of an identity story (PREP, or S2 for a late device copy): what is secured on the server
     (pointer / candidates) and what legacy picture this device has. secureCharacter imports the legacy picture as a CANDIDATE
     (server copy via import_legacy, this device's copy via import_device_copy; the server dedupes identical bytes) — it never
     adopts. adoptCandidate is a separate explicit choice. Per-story record v292Dav2_mig_<id> = what the explicit secure step found. */
  var MIG = 'v292Dav2_mig_';
  function loadMig(id){ try { var o = JSON.parse(lsg(MIG + id) || 'null'); return (o && o.v === 1 && isObj(o.c)) ? o : { v: 1, c: {} }; } catch(e){ return { v: 1, c: {} }; } }
  function saveMig(id, o){ return lss(MIG + id, JSON.stringify(o)); }
  function legacyKeyOf(name){ try { var f = window.__v292Dfix197; var k = (f && typeof f.keyFor === 'function') ? f.keyFor(name) : null; return (typeof k === 'string' && k) ? 'v292av2_' + k : null; } catch(e){ return null; } }
  function deviceCopyOf(lk){ try { var v = lk ? localStorage.getItem(lk) : null; return (typeof v === 'string' && v.indexOf('data:image/') === 0) ? v : null; } catch(e){ return null; } }
  function migGate(needWrite){
    if (off()) return { code: 'AV2_OFF' };
    if (!flagOn()) return { code: 'AV2_FLAG_OFF' };
    var id = curStoryId(); var S = state(); var F = F697();
    if (!id || !S || !isObj(S.cast) || !F || typeof F.assetV2Read !== 'function' || (needWrite && typeof F.assetV2Write !== 'function')) return { code: 'NO_DOCUMENT' };
    if (!isIdentityLocal(S.cast, id)) return { code: 'NOT_PREPARED' };
    if (needWrite){
      if (reg.busy || loadPending(id)) return { code: 'REGISTRATION_IN_PROGRESS' };
      if (loadConflict(id)) return { code: 'REBASE_REQUIRED' };
      if (loadBlocked(id)) return { code: 'REGISTRATION_BLOCKED' };
    }
    return { id: id, S: S, F: F };
  }
  function migChars(S, id){
    var out = [], a = av2Of(S.cast, id) || {};
    entriesOf(S.cast).forEach(function(x){ if (typeof x.e.character_id === 'string' && x.e.status !== 'DELETED') out.push({ id: x.e.character_id, name: x.e.name, hero: x.path === 'hero', status: x.e.status || 'ACTIVE' }); });
    (isArr(a.retired) ? a.retired : []).forEach(function(r){ if (isObj(r) && typeof r.character_id === 'string' && r.status === 'DEPARTED' && !out.some(function(o){ return o.id === r.character_id; })) out.push({ id: r.character_id, name: r.name, hero: false, status: 'DEPARTED' }); });
    return out;
  }
  function migrationStatus(cb){
    cb = (typeof cb === 'function') ? cb : function(){};
    var g = migGate(false); if (g.code) return cb({ ok: false, code: g.code });
    var id = g.id, S = g.S, F = g.F, mode = modeOf(av2Of(S.cast, id));
    var chars = migChars(S, id), rec = loadMig(id);
    F.assetV2Read('portrait.list', { story_id: id }, function(r, err){
      var j = r && r.j;
      if (err || !r || r.status !== 200 || !j || !isArr(j.portraits)) return cb({ ok: false, code: 'READ_FAIL' });
      var ptr = {}; j.portraits.forEach(function(p){ if (p && typeof p.character_id === 'string') ptr[p.character_id] = { asset_id: p.asset_id, rev: p.rev }; });
      var rows = [], i = 0;
      var next = function(){
        if (i >= chars.length){
          var report = rows.filter(function(x){ return x.ready; }).map(function(x){
            if (x.state === 'SECURED') return x.pointer ? { character_id: x.id, outcome: 'ALREADY_MIGRATED' } : { character_id: x.id, outcome: 'CANDIDATES_ONLY', imported: x.candidates.length };
            if (x.state === 'NO_LEGACY_IMAGE') return { character_id: x.id, outcome: 'NO_LEGACY_IMAGE', imported: 0 };
            return { character_id: x.id, outcome: 'OWNER_WAIVED', imported: 0, waived: true };       // GPT 917: not a secured asset
          });
          return cb({ ok: true, mode: mode, rows: rows, allSecured: rows.length > 0 && rows.every(function(x){ return x.secured; }),
                      allReady: rows.length > 0 && rows.every(function(x){ return x.ready; }), report: report });
        }
        var c = chars[i++]; var lk = legacyKeyOf(c.name); var dev = !!deviceCopyOf(lk); var m = rec.c[c.id] || null;
        F.assetV2Read('portrait.candidates', { story_id: id, character_id: c.id }, function(r2, e2){
          var j2 = r2 && r2.j;
          var cands = (!e2 && r2 && r2.status === 200 && j2 && isArr(j2.items)) ? j2.items.filter(function(it){ return it && it.derived !== 'RETIRED'; }).map(function(it){ return { asset_id: it.asset_id, provenance: it.provenance }; }) : null;
          var p = ptr[c.id] || null;
          /* secured: a pointer, or a candidate on the server, or the explicit secure step found NO legacy picture (server: none,
             this device: none). A device copy that was not imported keeps the character unsecured. */
          /* GPT 917 states: SECURED (pointer / candidate on the server; this device's copy imported) | NO_LEGACY_IMAGE (the explicit
             secure step found none on the server and this device has none) | OWNER_WAIVED (a legacy picture exists but cannot be moved
             and the Owner explicitly chose not to carry it over; legacy bytes are never deleted) | UNSECURED. Switch needs every row ready. */
          var nothingToSecure = !!(m && m.server === 'NONE' && !dev);
          var secured = !!p || (cands !== null && cands.length > 0 && (!dev || !!(m && m.device === 'IMPORTED')));
          var unavailable = !!(m && (m.server === 'UNAVAILABLE' || m.device === 'UNAVAILABLE'));
          var state = secured ? 'SECURED' : (nothingToSecure ? 'NO_LEGACY_IMAGE' : ((m && m.waived) ? 'OWNER_WAIVED' : 'UNSECURED'));
          rows.push({ id: c.id, name: c.name, hero: c.hero, status: c.status, pointer: p, candidates: cands || [], candidatesKnown: cands !== null, device: dev, legacyKey: lk, record: m,
                      secured: secured, state: state, ready: state !== 'UNSECURED', unavailable: unavailable, canWaive: state === 'UNSECURED' && unavailable });
          next();
        });
      };
      next();
    });
  }
  function secureCharacter(characterId, cb){
    cb = (typeof cb === 'function') ? cb : function(){};
    var g = migGate(true); if (g.code) return cb({ ok: false, code: g.code });
    var id = g.id, S = g.S, F = g.F;
    var c = migChars(S, id).filter(function(x){ return x.id === characterId; })[0];
    if (!c) return cb({ ok: false, code: 'UNKNOWN_CHARACTER_ID' });
    if (efBusy[characterId]) return cb({ ok: false, code: 'IN_PROGRESS' });
    efBusy[characterId] = true;
    var lk = legacyKeyOf(c.name), dev = deviceCopyOf(lk), out = { server: null, device: dev ? null : 'NONE', candidates: [] };
    var done = function(o){ delete efBusy[characterId]; var rec = loadMig(id); var w0 = rec.c[characterId] && rec.c[characterId].waived; rec.c[characterId] = { server: out.server, device: out.device, t: Date.now() }; if (w0) rec.c[characterId].waived = w0; saveMig(id, rec); note({ kind: 'AV2_SECURE_' + (o.ok ? 'OK' : o.code), id: id, cid: characterId, server: out.server, device: out.device }); cb(o); };
    if (!lk) { out.server = 'NO_KEY'; return done({ ok: false, code: 'NO_LEGACY_KEY' }); }
    F.assetV2Write('portrait.import_legacy', { story_id: id, character_id: characterId, legacy_k: lk }, function(r, err){
      var j = r && r.j;
      if (!err && r && r.status === 200 && j && j.ok && typeof j.candidate === 'string'){ out.server = 'IMPORTED'; out.candidates.push(j.candidate); }
      else if (!err && r && r.status === 404) out.server = 'NONE';                                  // no server copy of this legacy picture
      else if (!err && r && r.status === 403) out.server = 'UNAVAILABLE';                           // LEGACY_IMPORT_UNAVAILABLE (account-wide)
      else out.server = 'UNKNOWN';                                                                 // unknown outcome: not secured, never re-sent here
      if (!dev) return done({ ok: out.server === 'IMPORTED' || out.server === 'NONE', code: out.server === 'IMPORTED' ? 'IMPORTED' : (out.server === 'NONE' ? 'NOTHING_TO_SECURE' : 'SERVER_' + out.server), candidates: out.candidates });
      F.assetV2Write('portrait.import_device_copy', { story_id: id, character_id: characterId, data: dev, legacy_k: lk }, function(r2, err2){
        var j2 = r2 && r2.j;
        if (!err2 && r2 && r2.status === 200 && j2 && j2.ok && typeof j2.candidate === 'string'){ out.device = 'IMPORTED'; out.candidates.push(j2.candidate); }
        else if (!err2 && r2 && r2.status === 403) out.device = 'UNAVAILABLE';
        else out.device = 'UNKNOWN';
        var ok = out.device === 'IMPORTED' && (out.server === 'IMPORTED' || out.server === 'NONE');
        done({ ok: ok, code: ok ? 'IMPORTED' : (out.device !== 'IMPORTED' ? 'DEVICE_' + out.device : 'SERVER_' + out.server), candidates: out.candidates });
      });
    });
  }
  function adoptCandidate(characterId, assetId, cb){
    cb = (typeof cb === 'function') ? cb : function(){};
    var g = migGate(true); if (g.code) return cb({ ok: false, code: g.code });
    var id = g.id, S = g.S, F = g.F;
    if (!migChars(S, id).some(function(x){ return x.id === characterId; })) return cb({ ok: false, code: 'UNKNOWN_CHARACTER_ID' });
    if (typeof assetId !== 'string' || !assetId) return cb({ ok: false, code: 'BAD_ASSET_ID' });
    if (efBusy[characterId]) return cb({ ok: false, code: 'IN_PROGRESS' });
    efBusy[characterId] = true;
    var done = function(o){ delete efBusy[characterId]; note({ kind: 'AV2_ADOPT_' + (o.ok ? 'OK' : o.code), id: id, cid: characterId }); cb(o); };
    F.assetV2Read('portrait.list', { story_id: id }, function(r, err){                            // expected_rev from a fresh list
      var j = r && r.j; if (err || !r || r.status !== 200 || !j || !isArr(j.portraits)) return done({ ok: false, code: 'READ_FAIL' });
      var p = j.portraits.filter(function(x){ return x && x.character_id === characterId; })[0];
      if (p && p.asset_id === assetId) return done({ ok: true, code: 'ALREADY' });
      F.assetV2Write('portrait.adopt', { story_id: id, character_id: characterId, asset_id: assetId, expected_rev: p ? (+p.rev || 0) : 0 }, function(r2, err2){
        var j2 = r2 && r2.j;
        if (!err2 && r2 && r2.status === 200 && j2 && j2.ok){                                      // GPT 917: readback before reporting success
          return F.assetV2Read('portrait.list', { story_id: id }, function(r4){
            var j4 = r4 && r4.j; var p4 = j4 && isArr(j4.portraits) ? j4.portraits.filter(function(x){ return x && x.character_id === characterId; })[0] : null;
            done(p4 && p4.asset_id === assetId ? { ok: true, code: 'ADOPTED' } : { ok: false, code: 'NOT_CONFIRMED' });
          });
        }
        if (!err2 && r2 && r2.status === 409) return done({ ok: false, code: 'CONFLICT' });
        if (!err2 && r2 && r2.status === 404) return done({ ok: false, code: 'NOT_FOUND' });
        F.assetV2Read('portrait.list', { story_id: id }, function(r3){                           // unknown outcome: one read-only reconcile
          var j3 = r3 && r3.j; var p3 = j3 && isArr(j3.portraits) ? j3.portraits.filter(function(x){ return x && x.character_id === characterId; })[0] : null;
          done(p3 && p3.asset_id === assetId ? { ok: true, code: 'ADOPTED_CONFIRMED' } : { ok: false, code: 'OUTCOME_UNKNOWN' });
        });
      });
    });
  }

  /* GPT 917 Q2: explicit per-character Owner waiver — only when a legacy picture exists but the server refuses to import it
     (Vault account: LEGACY_IMPORT_UNAVAILABLE). Local record only (no server write); legacy bytes are never touched. */
  function waiveCharacter(characterId, cb){
    cb = (typeof cb === 'function') ? cb : function(){};
    var g = migGate(true); if (g.code) return cb({ ok: false, code: g.code });
    var id = g.id, S = g.S;
    if (!migChars(S, id).some(function(x){ return x.id === characterId; })) return cb({ ok: false, code: 'UNKNOWN_CHARACTER_ID' });
    var rec = loadMig(id), m = rec.c[characterId];
    if (!m || !(m.server === 'UNAVAILABLE' || m.device === 'UNAVAILABLE')) return cb({ ok: false, code: 'WAIVE_NOT_APPLICABLE' });   // secure first; only an unmovable picture can be waived
    m.waived = { t: Date.now() }; saveMig(id, rec);
    note({ kind: 'AV2_OWNER_WAIVED', id: id, cid: characterId });
    cb({ ok: true, code: 'OWNER_WAIVED' });
  }
  /* GPT 917 Q3: candidate picker (read) — fresh candidates + the current pointer */
  function listCandidates(characterId, cb){
    cb = (typeof cb === 'function') ? cb : function(){};
    var g = migGate(false); if (g.code) return cb({ ok: false, code: g.code });
    var id = g.id, F = g.F;
    if (!migChars(g.S, id).some(function(x){ return x.id === characterId; })) return cb({ ok: false, code: 'UNKNOWN_CHARACTER_ID' });
    F.assetV2Read('portrait.list', { story_id: id }, function(r, err){
      var j = r && r.j; if (err || !r || r.status !== 200 || !j || !isArr(j.portraits)) return cb({ ok: false, code: 'READ_FAIL' });
      var cur = j.portraits.filter(function(x){ return x && x.character_id === characterId; })[0] || null;
      F.assetV2Read('portrait.candidates', { story_id: id, character_id: characterId }, function(r2, e2){
        var j2 = r2 && r2.j; if (e2 || !r2 || r2.status !== 200 || !j2 || !isArr(j2.items)) return cb({ ok: false, code: 'READ_FAIL' });
        cb({ ok: true, current: cur ? { asset_id: cur.asset_id, rev: cur.rev } : null,
             items: j2.items.filter(function(it){ return it && typeof it.asset_id === 'string' && (!cur || it.asset_id !== cur.asset_id); }).map(function(it){ return { asset_id: it.asset_id, provenance: it.provenance, derived: it.derived }; }) });
      });
    });
  }

  /* ================= C2: document-level predicate for legacy portrait guards / v2 read path =================
     true  = the open document is an Asset-v2 (assetSchema 2) story → legacy portrait generation / DOM rewriting must not run
     false = legacy story (or no document)
     null  = not decidable yet (state not ready). Depends ONLY on the canonical-derived sidecar, never on the local flag (D5). */
  function docSchema2(){
    try {
      /* readiness FIRST: before the engine boot barrier ran / while fix705 holds the boot, neither the document id nor S is
         final → undecidable (run6 diag: provider fetches at boot saw story key = none, fix705 'held', boot not ran, and the
         id check answered false before the readiness checks were reached). Same readiness as fix302 booted926. */
      try { var eb = window.__chrEngineBoot; if (typeof eb === 'function' && eb.__ran !== true) return null; } catch(e1){ return null; }
      try { var g = window.__v292Dfix705; var gs = (g && typeof g.status === 'function') ? g.status() : null;
            var ph = gs && gs.state ? gs.state.phase : null;
            if (gs && gs.on && (ph === 'init' || ph === 'held' || ph === 'classifying' || ph === 'applied')) return null; } catch(e0){ return null; }   // fix705 off / released / stopped → decidable.
            /* 'applied' = the canonical was just written to storage and fix705 reloads in 300 ms; the running S is NOT re-read (fix705 F2), so the
               document is undecidable until that reload (frozen-candidate regression c2_d: a fresh device's fix487 warm-up polled in this window,
               saw the pre-apply cast without the sidecar → false → 4 provider GETs). */
      var id = curStoryId() || window.__chronicleDocumentStoryKey || null;
      if (!id || id === 'default' || id === 'chr6') return false;
      var S = state();
      if (!S || !isObj(S.cast)) return null;
      return isSchema2Local(S.cast, id);
    } catch(e){ return null; }
  }

  /* ================= D4 explicit Owner migration, stage 1 = S9a prepare (local flag gates the ENTRY only) =================
     Sets the PREP sidecar. The next canonical push carries body.assetIdPrep = 1 with every entry id-less → the registrar
     (single write + fresh readback) receives the server-minted ids. The server keeps the story legacy when prepare is not
     enabled for this account (→ AV2_MIGRATION_REFUSED, sidecar dropped). The story stays schema 1 (docSchema2() false). */
  function migrate(){
    if (off()) return { ok: false, code: 'AV2_OFF' };
    if (!flagOn()) return { ok: false, code: 'AV2_FLAG_OFF' };
    var id = curStoryId(); var S = state();
    if (!id || !S || !isObj(S.cast)) return { ok: false, code: 'NO_DOCUMENT' };
    var a = av2Of(S.cast, id);
    if (a) return { ok: false, code: modeOf(a) === 'S2' ? 'ALREADY_SCHEMA2' : 'ALREADY_PREPARED' };
    /* candidate 5: a leftover S9A_CAST_DIVERGED hold belongs to a PREVIOUS prepare intent on a local document that has since been replaced
       (explicit re-hydration brings the server's legacy cast, which carries no sidecar — so the hold could only be cleared by an ordinary
       push). A new explicit 「準備」 is a new intent: the hold is dropped here and the gate decides again on a fresh server read (write 0 if
       still diverged). No other conflict kind is touched. */
    try { var c0 = loadConflict(id); if (c0 && c0.reason === 'S9A_CAST_DIVERGED'){ lsr(CFL + id); note({ kind: 'AV2_S9A_HOLD_RESET_BY_NEW_PREPARE', id: id }); } } catch(e){}
    S.cast.av2 = sidecarHead('PREP', id); S.cast.av2.bindings = {}; S.cast.av2.known = {}; S.cast.av2.retired = [];
    try { S.save(); } catch(e){}
    note({ kind: 'AV2_MIGRATION_PREPARE_STARTED', id: id });
    try { var F = F697(); if (F && F.flush) F.flush(); } catch(e){}
    return { ok: true, id: id, stage: 'PREPARE' };
  }
  /* MP5: the migration report says every non-DELETED character's legacy picture is secured (or it had none).
     Same semantics as the lane C candidate's canSwitchToSchema2, applied per server character id (missing id = not secured). */
  function reportSecured(report, cast){
    if (!isArr(report)) return { ok: false, missing: ['NO_REPORT'] };
    var byId = {}; report.forEach(function(x){ if (isObj(x) && typeof x.character_id === 'string') byId[x.character_id] = x; });
    var missing = [];
    entriesOf(cast || {}).forEach(function(x){
      if (x.e.status === 'DELETED' || typeof x.e.character_id !== 'string') return;
      var r = byId[x.e.character_id];
      var okr = !!r && (r.outcome === 'ALREADY_MIGRATED' || (!r.skipped && r.outcome !== 'ADOPT_CONFLICT' && r.imported != null));
      if (!okr) missing.push(x.e.character_id);
    });
    return { ok: missing.length === 0, missing: missing };
  }
  /* ================= stage 2 = S9b switch (explicit; one CAS write; local switches only after the fresh readback) ================= */
  function switchToSchema2(report, cb){
    cb = (typeof cb === 'function') ? cb : function(){};
    if (off()) return cb({ ok: false, code: 'AV2_OFF' });
    if (!flagOn()) return cb({ ok: false, code: 'AV2_FLAG_OFF' });
    var id = curStoryId(); var S = state(); var F = F697();
    if (!id || !S || !isObj(S.cast) || !F) return cb({ ok: false, code: 'NO_DOCUMENT' });
    var a = av2Of(S.cast, id);
    if (!a) return cb({ ok: false, code: 'NOT_PREPARED' });
    if (modeOf(a) === 'S2') return cb({ ok: false, code: 'ALREADY_SCHEMA2' });
    if (reg.busy || loadPending(id)) return cb({ ok: false, code: 'REGISTRATION_IN_PROGRESS' });
    if (loadConflict(id)) return cb({ ok: false, code: 'REBASE_REQUIRED' });
    if (loadBlocked(id)) return cb({ ok: false, code: 'REGISTRATION_BLOCKED' });
    reg.busy = true;
    var done = function(o){ reg.busy = false; note({ kind: 'AV2_SWITCH_' + (o.ok ? 'OK' : o.code), id: id }); cb(o); };
    F.getStoryV2Once(id, function(g, gerr){
      var j = g && g.j;
      if (gerr || !g || g.status !== 200 || !j || !j.ok || !j.record || String(j.authority || '') !== 'canonical' || j.deleted) return done({ ok: false, code: 'READ_FAIL' });
      var b0 = j.record.body || {};
      var m0 = modeOf(b0);
      if (m0 === 'S2') return done({ ok: false, code: 'SERVER_ALREADY_SCHEMA2' });   // another device switched: re-hydrate, never write
      if (m0 !== 'PREP') return done({ ok: false, code: 'SERVER_NOT_PREPARED' });
      if (idlessPaths(b0).length) return done({ ok: false, code: 'REGISTRATION_PENDING' });
      var sec = reportSecured(report, b0.cast);
      if (!sec.ok) return done({ ok: false, code: 'MIGRATION_NOT_SECURED', missing: sec.missing });
      var schema = (j.recordSchema === 2) ? 2 : 1;
      var rec = buildRecord(F, id, schema);
      if (!rec || !isObj(rec.body)) return done({ ok: false, code: 'NO_LOCAL_RECORD' });
      if (idlessPaths(rec.body).length) return done({ ok: false, code: 'REGISTRATION_PENDING' });
      if (!same(rec.body, b0)) return done({ ok: false, code: 'LOCAL_NOT_SYNCED' });       // the switch carries ONLY the marker change
      var sentBody = clone(rec.body); delete sentBody.assetIdPrep; sentBody.assetSchema = 2;
      rec.body = sentBody;
      F.putCanonicalOnce({ id: id, expectedRev: +j.rev || 0, expectedHash: String(j.serverHash || ''), record: rec,
                           mid: 'av2sw:' + id + ':' + (+j.rev || 0) + ':' + String(j.serverHash || '').slice(0, 16) }, function(w, werr){
        var wst = w && w.status; var wcode = w && w.j && w.j.errorCode;
        F.getStoryV2Once(id, function(g2){                                   // readback is the authority (no re-send)
          var j2 = g2 && g2.j; var b2 = j2 && j2.record && j2.record.body;
          if (!b2 || modeOf(b2) !== 'S2' || !same(b2, sentBody))
            return done({ ok: false, code: (wst === 409) ? (wcode && DEFINITIVE_409[wcode] ? wcode : 'CONFLICT') : 'NOT_APPLIED', status: wst || null, err: werr || null });
          try {
            var c2 = pullCast(b2, id);
            S.cast.av2 = c2.av2;                                              // sidecar mode S2 (same ids / bindings / known / retired)
            S.save();
          } catch(e){ return done({ ok: false, code: 'LOCAL_SWITCH_FAILED' }); }
          try { F.flush(); } catch(e){}
          done({ ok: true, serverRev: j2.rev });
        });
      });
    });
  }

  window.__v292Dav2Map = { push: push, pullCast: pullCast, isSchema2Local: isSchema2Local, isIdentityLocal: isIdentityLocal, modeOf: modeOf, idlessPaths: idlessPaths,
                           holdCanonical: holdCanonical, off: off, docSchema2: docSchema2 };
  window.__chronicleAssetV2 = {
    migrate: migrate, prepare: migrate, switchToSchema2: switchToSchema2, ensureFirst: ensureFirst,
    suggestAppearance: suggestAppearance, setProfile: setProfile, newDraw: newDraw,
    migrationStatus: migrationStatus, secureCharacter: secureCharacter, adoptCandidate: adoptCandidate, waiveCharacter: waiveCharacter, listCandidates: listCandidates, reportSecured: reportSecured, addBinding: addBinding, deleteCharacter: deleteCharacter,
    /* readback / reconcile only (never a second write): C2 offers it as 「再照合」 */
    reconcile: function(){ var id = curStoryId(); var F = F697(); var pd = id ? loadPending(id) : null;
      if (!pd || !F || reg.busy || off()) return false; reg.busy = true; reg.manual = (reg.manual || 0) + 1; readback(F, id, pd); return true; },
    pending: function(){ var id = curStoryId(); return id ? loadPending(id) : null; },
    blocked: function(){ var id = curStoryId(); return id ? loadBlocked(id) : null; },
    conflict: function(){ var id = curStoryId(); return id ? loadConflict(id) : null; },
    status: function(){ var id = curStoryId(), S = state();
      return { off: off(), flag: flagOn(), storyId: id, schema2: !!(S && id && isSchema2Local(S.cast, id)), mode: (S && id && isObj(S.cast)) ? modeOf(av2Of(S.cast, id)) : null,
               reg: JSON.parse(JSON.stringify(reg)), log: LOG.slice(-20) }; },
    __verifyOurs: verifyOurs
  };
})();
