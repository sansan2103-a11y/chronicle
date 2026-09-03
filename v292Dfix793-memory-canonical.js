/* =====================================================================
 * v292Dfix793-memory-canonical.js
 *   Phase 3B-1 — QA story 限定 Canonical Memory write canary（client 側）
 * ---------------------------------------------------------------------
 * GPT 裁定（2026-09-01 深夜60）:
 *   ・Worker v40 = ACCEPT / 3B-1 QA story 限定 canary = GO。
 *   ・real OWNER story write = HOLD / Planner = HOLD / Retrieve = HOLD。
 *   ・★G1 ADOPT: memoryV1 対応 client は **canary 対象 story について memoryV1 を
 *     save 時に常に送る**（key を省略しない）。
 *   ・★追加 Invariant: memory state を **UNLOADED / LOADED_ABSENT / LOADED_VALUE**
 *     へ論理的に区別する。**UNLOADED から `memoryV1:null` を作って save しない**。
 *     UNLOADED なら server hydrate か materialize が終わるまで **canary save は
 *     fail-closed**。`null` は **明示 clear としてだけ**使う。
 *   ・★retry 禁止: `SCHEMA2_UNKNOWN_FIELD: memoryV1` を受けても
 *     **memoryV1 を payload から削って自動 retry してはいけない**（F-3 の silent drop を
 *     client 自身が起こすため）。memoryV1 incompatibility は **fail-closed**。
 *   ・保存するのは **ACTIVE と PENDING_REF だけ**。**EXCLUDED は保存しない**。
 *   ・保存しない debug: full promotionReason / full excludeReason / me1 dump /
 *     precision labels / shadow verdict dump。
 *   ・deterministic output を維持する。
 * ★fix798（GPT 裁定 3B-2 (b)・2026-09-02 / Rev2 裁定 同日）: canonical memory write の
 *   入口に boot recovery barrier gate を追加（fix745 の barrier() を **読むだけ**）。
 *   barrier が明示的に NOT_REQUIRED / RESOLVED でない限り local key も server も書かない。
 *   Rev2: materialize だけでなく **save payload に memoryV1 が載る経路**（既存 local key 由来の
 *   LOADED_VALUE / 明示 clear）も対象。その場合は memoryV1 を落として残りを保存するのではなく
 *   **save 全体を hold** する（silent loss class の禁止）。793 OFF / canary 外は従来どおり。
 *
 * ★DEPLOY != ENABLE。既定 OFF。load 時に localStorage を読まない・listener 0・timer 0。
 * opt-in : v292Dfix793On === '1'（既定 OFF）
 * kill   : v292Dfix793Off === '1'
 * canary : v292Dfix793Story === '<storyId>'（未設定なら CANARY_DEFAULT のみ）
 * ===================================================================== */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.__v292Dfix793) return;                 /* 二重install防止 */

  var BUILD = '20260902-fix798';
  var MEMORY_VERSION = 'cmem-1.0.0';
  var MEMORY_SCHEMA_VERSION = 1;
  var KEY_PREFIX = 'v292Dmem1_slot_';               /* ★story-scoped。global key を作らない */
  var CANARY_DEFAULT = 'smtg00ynsv1';               /* ★QA story 1本だけ */
  var MAX_BYTES = 262144;                           /* Worker v40 の cap と同じ */

  var STATE = { UNLOADED: 'UNLOADED', LOADED_ABSENT: 'LOADED_ABSENT', LOADED_VALUE: 'LOADED_VALUE' };
  var HOLD = {
    UNLOADED: 'MEMORY_UNLOADED_SAVE_BLOCKED',
    NOT_CANARY: 'NOT_CANARY_STORY',
    DISABLED: 'MEMORY_CANARY_DISABLED',
    TOO_LARGE: 'MEMORY_V1_TOO_LARGE',
    INCOMPATIBLE: 'MEMORY_V1_INCOMPATIBLE_FAIL_CLOSED'
  };

  function lsg(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lss(k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function keyFor(storyId) { return KEY_PREFIX + String(storyId); }
  function optedIn() { return lsg('v292Dfix793On') === '1'; }
  function off() { return lsg('v292Dfix793Off') === '1'; }
  function armed() { return optedIn() && !off(); }
  function canaryStory() { var s = lsg('v292Dfix793Story'); return (s && String(s)) || CANARY_DEFAULT; }
  function isCanary(storyId) { return !!storyId && String(storyId) === canaryStory(); }

  /* ==================================================================
   * memory state（★UNLOADED / LOADED_ABSENT / LOADED_VALUE）
   *   ・in-memory の cache は持つが、**authority は localStorage キー**。
   *   ・「読んでいない」と「読んだが無い」を必ず区別する。
   * ================================================================== */
  var _st = {};        /* storyId -> { state, value, source } */

  function stateOf(storyId) {
    var sid = String(storyId || '');
    if (!sid) return { state: STATE.UNLOADED, value: null, source: null };
    var c = _st[sid];
    return c ? c : { state: STATE.UNLOADED, value: null, source: null };
  }
  function setState(sid, state, value, source) {
    _st[String(sid)] = { state: state, value: (value === undefined ? null : value), source: source || null };
    return _st[String(sid)];
  }
  /* ★load: localStorage を1回だけ読んで UNLOADED を解消する。
     読めなければ **LOADED_ABSENT にしない**（UNLOADED のまま＝fail-closed）。 */
  function load(storyId) {
    var sid = String(storyId || '');
    if (!sid) return stateOf(sid);
    var raw;
    try { raw = window.localStorage.getItem(keyFor(sid)); }
    catch (e) { return setState(sid, STATE.UNLOADED, null, 'storage-throw'); }
    if (raw === null || raw === undefined) return setState(sid, STATE.LOADED_ABSENT, null, 'local-absent');
    var v = null;
    try { v = JSON.parse(raw); } catch (e) { return setState(sid, STATE.UNLOADED, null, 'parse-error'); }
    if (!validShape(v)) return setState(sid, STATE.UNLOADED, null, 'bad-shape');
    return setState(sid, STATE.LOADED_VALUE, v, 'local');
  }
  function validShape(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v)
        && Object.prototype.toString.call(v.records) === '[object Array]'
        && Object.prototype.toString.call(v.edges) === '[object Array]';
  }

  /* ★server hydrate: server record の memoryV1 を canonical source として採用する。
     **shadow DB が無くても server の memoryV1 を保持できる**（GPT 指定 D）。 */
  function hydrateFromServerRecord(storyId, record) {
    var sid = String(storyId || '');
    if (!sid) return { ok: false, reason: 'no-story' };
    var sc = record && record.sidecar;
    if (!sc || !Object.prototype.hasOwnProperty.call(sc, 'memoryV1')) {
      /* server に無い＝「無いことが分かった」→ LOADED_ABSENT（UNLOADED ではない） */
      setState(sid, STATE.LOADED_ABSENT, null, 'server-absent');
      return { ok: true, state: STATE.LOADED_ABSENT, wrote: false };
    }
    var v = sc.memoryV1;
    if (v === null) { setState(sid, STATE.LOADED_ABSENT, null, 'server-null'); return { ok: true, state: STATE.LOADED_ABSENT, wrote: false }; }
    if (!validShape(v)) return { ok: false, reason: 'bad-shape' };
    var wrote = lss(keyFor(sid), JSON.stringify(v));
    setState(sid, STATE.LOADED_VALUE, v, 'server');
    return { ok: true, state: STATE.LOADED_VALUE, wrote: wrote };
  }

  /* ==================================================================
   * ★save gate（fix743 の buildSchema2Record から呼ばれる唯一の入口）
   *   返り値:
   *     { include:false }                     … canary 対象外 / 無効 → memoryV1 を **生やさない**
   *     { include:true, value:<obj|null> }    … 常に送る（G1）。null は明示 clear のときだけ
   *     { hold:'<code>' }                     … ★fail-closed（save させない）
   * ================================================================== */
  function saveGate(storyId) {
    var sid = String(storyId || '');
    if (!armed()) return { include: false, reason: HOLD.DISABLED };
    if (!isCanary(sid)) return { include: false, reason: HOLD.NOT_CANARY };   /* ★他 story には生やさない */
    /* ★fix798 Rev2: 明示 clear が pending の状態は「memoryV1:null が payload に載る」経路。
       clearGate 側が hold で include:false を返しても、ここを素通りさせると
       clear が黙って落ちたまま save が通ってしまうので同じく hold する。 */
    if (_clearPending[sid]) { var _hc = barrierHold(sid, 'clearGate'); if (_hc) return _hc; }
    var s = stateOf(sid);
    if (s.state === STATE.UNLOADED) {
      s = load(sid);                                    /* 1回だけ解消を試みる */
      if (s.state === STATE.UNLOADED) return { hold: HOLD.UNLOADED };  /* ★fail-closed */
    }
    if (s.state === STATE.LOADED_ABSENT) {
      /* ★UNLOADED ではないので「無い」と断定できる。だが **null を作って送らない**。
         明示 clear は clearExplicit() を通した場合だけ。 */
      return { include: false, reason: 'loaded-absent' };
    }
    if (!validShape(s.value)) return { hold: HOLD.UNLOADED };
    var bytes = byteLen(s.value);
    if (bytes > MAX_BYTES) return { hold: HOLD.TOO_LARGE, bytes: bytes };
    /* ★fix798 Rev2: ここから先で memoryV1 が payload に載る（既存 local key 由来の
       LOADED_VALUE も含む）。barrier が開いていなければ **save 全体を hold**。 */
    var _hs = barrierHold(sid, 'saveGate'); if (_hs) return _hs;
    return { include: true, value: s.value, bytes: bytes };
  }

  /* ★明示 clear。null は **ここを通ったときだけ** payload に載る。 */
  function clearExplicit(storyId) {
    var sid = String(storyId || '');
    if (!armed() || !isCanary(sid)) return { ok: false, reason: HOLD.NOT_CANARY };
    setState(sid, STATE.LOADED_ABSENT, null, 'explicit-clear');
    _clearPending[sid] = 1;
    return { ok: true };
  }
  var _clearPending = {};
  /* clear を1回だけ payload に載せるための gate（clear 後の通常 save は include:false へ戻る） */
  function clearGate(storyId) {
    var sid = String(storyId || '');
    if (!_clearPending[sid]) return { include: false };
    /* ★fix798 Rev2: 明示 clear（memoryV1:null）も canonical write。barrier gate 対象。 */
    var _h = barrierHold(sid, 'clearGate'); if (_h) return _h;
    return { include: true, value: null, explicitClear: true };
  }
  function clearConsumed(storyId) { delete _clearPending[String(storyId || '')]; }

  /* ★retry 禁止。unknown-field を受けたときに **必ず** fail-closed を返す。
     この関数は payload を書き換えない（strip する口を持たない）。 */
  function onUnknownFieldError(errorCode, field) {
    return { retry: false, stripped: false, hold: HOLD.INCOMPATIBLE,
             note: 'memoryV1 を payload から削って retry してはいけない（F-3 silent drop を client 自身が起こす）',
             errorCode: errorCode || null, field: field || null };
  }

  function byteLen(v) {
    try { return new TextEncoder().encode(JSON.stringify(v)).length; }
    catch (e) { try { return JSON.stringify(v).length; } catch (e2) { return -1; } }
  }

  /* ==================================================================
   * materializer（3B-0 の canonical_memory_v1.cjs と同じ規則）
   *   ・保存するのは ACTIVE / PENDING_REF だけ。EXCLUDED は **保存しない**。
   *   ・full promotionReason / full excludeReason / me1 dump / precision labels /
   *     shadow verdict dump は **入れない**（pendingReasonCode だけ残す）。
   *   ・deterministic（乱数・時刻を使わない）。
   * ================================================================== */
  var LIFECYCLE = { ACTIVE: 'ACTIVE', PENDING: 'PENDING_REF' };
  var AUTHORITY = 'HISTORY_ONLY';

  function criticalRefsOf(lin, rawById, resByLineage) {
    var refs = [], res = resByLineage[lin.lineageId] || [], i, k;
    function findRes(kind, role) {
      for (var j = 0; j < res.length; j++) if (res[j].slotKind === kind && res[j].role === role) return res[j];
      return null;
    }
    if (lin.lineageClass === 'dialogue_claim') {
      var sp = findRes('speaker', 'speaker');
      /* ★fix795(3B-2 real-data admission gate・GPT裁定 2026-09-02): critical speaker が
         `char_candidate:*`（4C でまだ canonical roster/entity へ昇格していない candidate-tier）
         のときは **canonical resolved と扱わない** → resolutionStatus=UNRESOLVED /
         pendingReasonCode='candidate-entity-not-canonical' → その record は PENDING_REF へ倒れる。
         entityId は provenance として残す。canonical speaker と「未 speaker」の挙動は不変。
         新 schema / Entity Registry / candidate promotion / 4C は一切変更しない。 */
      var _spk0 = lin.speakerEntityId;
      var _spkCand = !!(_spk0 && String(_spk0).indexOf('char_candidate:') === 0);
      refs.push({ role: 'speaker',
        entityId: lin.speakerEntityId || (sp && sp.resolvedEntityId) || null,
        resolutionStatus: (_spk0 && !_spkCand) ? 'RESOLVED_EXISTING' : (_spkCand ? 'UNRESOLVED' : (sp ? sp.status : 'UNRESOLVED')),
        pendingReasonCode: (_spk0 && !_spkCand) ? null : (_spkCand ? 'candidate-entity-not-canonical' : (sp ? sp.reason : 'speaker-not-structured')) });
      if (lin.kind === 'NEGATION_CLAIM') {
        var tp = findRes('claim_topic', 'topic');
        if (tp) refs.push({ role: 'topic', entityId: tp.resolvedEntityId || null,
          resolutionStatus: tp.status, pendingReasonCode: tp.reason || null,
          surfaceForm: tp.surface || null });
      }
      return refs;
    }
    var members = lin.memberEventIds || [], seen = {};
    for (i = 0; i < members.length; i++) {
      var e = rawById[members[i]]; if (!e) continue;
      var ma = e.missingArguments || [];
      for (k = 0; k < ma.length; k++) {
        var role = ma[k].role;
        if (role === 'speaker' || seen[role]) continue;
        seen[role] = 1;
        var r = findRes('argument', role);
        refs.push({ role: role, entityId: r ? r.resolvedEntityId : null,
          resolutionStatus: r ? r.status : 'UNRESOLVED',
          pendingReasonCode: r ? r.reason : (ma[k].reason || 'missing-argument') });
      }
    }
    var anyStructured = false;
    for (i = 0; i < members.length; i++) {
      var e2 = rawById[members[i]];
      if (e2 && (e2.subjectId || e2.objectId)) { anyStructured = true; break; }
    }
    if (!anyStructured && !refs.length) {
      refs.push({ role: 'subject', entityId: null, resolutionStatus: 'UNRESOLVED',
                  pendingReasonCode: 'no-structured-target-in-record' });
    }
    return refs;
  }

  function materializeFrom(input) {
    var lineages = input.lineages || [], events = input.events || [],
        relations = input.relations || [], resolutions = input.resolutions || [],
        storyId = input.storyId || null;
    var rawById = {}, i;
    for (i = 0; i < events.length; i++) rawById[events[i].eventId] = events[i];
    var resByLineage = {};
    for (i = 0; i < resolutions.length; i++) {
      var rr = resolutions[i];
      (resByLineage[rr.lineageId] = resByLineage[rr.lineageId] || []).push(rr);
    }
    var records = [], byMemoryId = {};
    for (i = 0; i < lineages.length; i++) {
      var lin = lineages[i];
      var refs = criticalRefsOf(lin, rawById, resByLineage);
      var unresolved = refs.filter(function (r) {
        return r.resolutionStatus !== 'RESOLVED_EXISTING' || !r.entityId; });
      var members = (lin.memberEventIds || []).map(function (x) { return rawById[x]; })
        .filter(function (x) { return !!x; });
      var first = members[0] || {};
      var knownTo = [];
      for (var m = 0; m < members.length; m++) {
        var e = members[m];
        var k = e.knownTo || (e.payload && e.payload.knownTo) || null;
        if (!k) continue;
        var list = (Object.prototype.toString.call(k) === '[object Array]') ? k : Object.keys(k);
        knownTo.push({ eventId: e.eventId, entries: list.slice() });   /* ★union しない */
      }
      var turns = lin.sourceTurns || [0];
      var rec = {
        schemaVersion: MEMORY_SCHEMA_VERSION,
        materializerVersion: MEMORY_VERSION,
        memoryId: 'cmem:' + lin.lineageId,
        storyId: storyId,
        lineageClass: lin.lineageClass,
        family: lin.family || null,
        type: lin.kind || null,
        epistemic: first.epistemic || null,
        normalizedProposition: lin.normalizedProposition || null,
        refs: refs,
        source: { firstTurn: Math.min.apply(null, turns), lastTurn: Math.max.apply(null, turns),
                  sourceModes: (lin.sourceModes || []).slice(),
                  speakerEntityId: lin.speakerEntityId || null },
        knowledge: { knownTo: knownTo },
        lifecycle: unresolved.length ? LIFECYCLE.PENDING : LIFECYCLE.ACTIVE,
        authority: AUTHORITY,
        provenance: { attestations: lin.attestationCount || members.length,
                      mergeRule: lin.mergeRule || null,
                      extractorVersion: first.extractorVersion || null,
                      dedupeVersion: lin.dedupeVersion || null },
        relationRefs: []
      };
      /* ★full promotionReason / full excludeReason は保存しない。
         PENDING の理由は ref ごとの pendingReasonCode だけで説明できる。 */
      records.push(rec); byMemoryId[rec.memoryId] = rec;
    }
    var edges = [];
    for (i = 0; i < relations.length; i++) {
      var rel = relations[i];
      /* ★fix793-A(3B-1 canary 実測で検出): fix791 が chr6rel へ保存する実レコードの
         endpoint フィールドは **fromLineageId / toLineageId**。`from` / `to` だけを
         読んでいたため live で edges が 0 になっていた（QA 成果物では正規化済みの
         `from`/`to` を渡していたので fixture では露見しなかった）。
         **両方の綴りを受ける**。どちらも無ければその relation は edge にしない。 */
      var relFrom = (rel.fromLineageId != null) ? rel.fromLineageId : rel.from;
      var relTo   = (rel.toLineageId   != null) ? rel.toLineageId   : rel.to;
      if (relFrom == null || relTo == null) continue;
      var fromId = 'cmem:' + relFrom, toId = 'cmem:' + relTo;
      if (!byMemoryId[fromId] || !byMemoryId[toId]) continue;   /* endpoint 不在なら作らない */
      edges.push({ relationId: rel.relationId, kind: rel.kind, from: fromId, to: toId,
                   basis: rel.basis, resolvesTruth: false, winner: null, knownToUnion: false });
      byMemoryId[fromId].relationRefs.push(rel.relationId);
      byMemoryId[toId].relationRefs.push(rel.relationId);
      /* ★relation は ACTIVE 昇格を強制しない（lifecycle に触れない） */
    }
    return { schemaVersion: MEMORY_SCHEMA_VERSION, materializerVersion: MEMORY_VERSION,
             records: records, edges: edges };
  }

  /* ==================================================================
   * ★fix798（GPT 裁定 3B-2 (b)・2026-09-02）: boot recovery barrier gate
   *   観測 bug: fix745 barrier = PENDING（stale MAT journal）で fix748 が
   *   TURN_BUILD を hold している最中に materialize() → local key 書込 →
   *   製品 save（docRev.source = INVALIDATED:sideportA:putcanonical）が成立した。
   *   memory sidecar でも canonical write（rev/hash mutation）なので barrier を通す。
   *   ・fix745 の public API `__v292DfixGWS.barrier()` を **読むだけ**。
   *     fix745 / fix748 は変更しない。新 authority / recovery framework も作らない。
   *   ・ALLOW は fix745 が NOT_REQUIRED / RESOLVED を **明示的に**返したときだけ。
   *     PENDING / DUAL_RECOVERY_CONFLICT_HOLD / API 未 load / throw / 判定不能 は
   *     すべて **fail-closed**（local key も server も書かない）。
   *   ・観測は memory-only ring（localStorage 0・listener 0・timer 0）。
   * ================================================================== */
  var BARRIER_HOLD = 'BOOT_RECOVERY_BARRIER_PENDING';
  var GATE_RING_MAX = 20;
  var _gateRing = [], _gateBlocked = 0;
  function barrierStateNow() {
    var g;
    try { g = window.__v292DfixGWS; } catch (e) { return 'API_UNAVAILABLE'; }
    if (!g || typeof g.barrier !== 'function') return 'API_UNAVAILABLE';
    var s; try { s = g.barrier(); } catch (e) { return 'API_THREW'; }
    return (s == null) ? 'API_UNAVAILABLE' : String(s);
  }
  function barrierWriteAllowed(s) { return s === 'NOT_REQUIRED' || s === 'RESOLVED'; }
  function noteGateBlock(sid, s, where) {
    _gateBlocked++;
    _gateRing.push({ storyId: sid, state: s, reason: BARRIER_HOLD, where: where || '?', n: _gateBlocked });
    if (_gateRing.length > GATE_RING_MAX) _gateRing.shift();
  }
  /* ★fix798 Rev2: barrier が開いていなければ hold object を返す（開いていれば null）。
     **判定はこの 1 関数だけ**。呼び出しは canonical memory write が起きる直前の 4 経路のみ:
       materialize（local key 書込）/ saveGate（payload に value が載る）/
       saveGate の pending clear / clearGate（payload に null が載る）。
     ★hold は fix743 buildSchema2Record の既存 return（BUILD_SCHEMA2_HOLD）に載り、
       **save 全体が止まる**。memoryV1 だけ落として残りを保存する経路は作らない
       （silent loss class の禁止・GPT 裁定 Rev2）。 */
  function barrierHold(sid, where) {
    var s = barrierStateNow();
    if (barrierWriteAllowed(s)) return null;
    noteGateBlock(sid, s, where);
    return { hold: BARRIER_HOLD, barrier: s };
  }

  /* shadow 5層（readonly）から materialize して local key へ書く。 */
  function readAll(dbName, store, slotId) {
    return new Promise(function (res, rej) {
      var q; try { q = window.indexedDB.open(dbName); } catch (e) { return rej(e); }
      q.onupgradeneeded = function () { try { q.transaction.abort(); } catch (e) {} };
      q.onsuccess = function () {
        var db = q.result;
        if (!db.objectStoreNames.contains(store)) { db.close(); return res([]); }
        var g = db.transaction([store], 'readonly').objectStore(store).getAll();
        g.onsuccess = function () {
          var rows = (g.result || []).filter(function (r) { return !slotId || r.slotId === slotId; });
          db.close(); res(rows);
        };
        g.onerror = function () { db.close(); rej(g.error); };
      };
      q.onerror = function () { rej(q.error); };
    });
  }
  function materialize(storyId) {
    var sid = String(storyId || '');
    if (!armed()) return Promise.resolve({ ok: false, reason: HOLD.DISABLED });
    if (!isCanary(sid)) return Promise.resolve({ ok: false, reason: HOLD.NOT_CANARY });
    var me = window.__v292Dfix670;
    if (!me || typeof me.events !== 'function') return Promise.resolve({ ok: false, reason: 'no-extractor' });
    return Promise.all([
      readAll('chr6lin', 'lineages', sid),
      (window.__v292Dfix801 ? window.__v292Dfix801.eventsForStory(sid) : me.events(Infinity)),   /* ★fix801: story-scoped adapter（fallback = fix670 正式契約 events(Infinity)=全件） */
      readAll('chr6rel', 'relations', sid),
      readAll('chr6ref', 'resolutions', sid)
    ]).then(function (a) {
      /* ★fix798: canonical write 入口（この下は local key 書込 → LOADED_VALUE →
         saveGate include:true → 製品 save → server canonical write が繋がる）。
         shadow 5層は readonly なのでここが **書込直前の最終同期点**。
         barrier が明示的に開いていなければ何も書かずに返す（fail-closed）。 */
      var _hm = barrierHold(sid, 'materialize');
      if (_hm) return { ok: false, reason: BARRIER_HOLD, barrier: _hm.barrier, wrote: 0 };
      var v = materializeFrom({ storyId: sid, lineages: a[0], events: a[1],
                                relations: a[2], resolutions: a[3] });
      var bytes = byteLen(v);
      if (bytes > MAX_BYTES) { setState(sid, stateOf(sid).state, stateOf(sid).value, 'too-large');
        return { ok: false, reason: HOLD.TOO_LARGE, bytes: bytes }; }
      var wrote = lss(keyFor(sid), JSON.stringify(v));
      setState(sid, STATE.LOADED_VALUE, v, 'materialize');
      var counts = { records: v.records.length, edges: v.edges.length, ACTIVE: 0, PENDING_REF: 0 };
      for (var i = 0; i < v.records.length; i++) counts[v.records[i].lifecycle]++;
      return { ok: true, wrote: wrote, bytes: bytes, counts: counts };
    });
  }

  window.__v292Dfix793 = {
    __loaded: true, build_: BUILD, WIRED: false, ENABLED_BY_DEFAULT: false,
    memoryVersion: MEMORY_VERSION, keyPrefix: KEY_PREFIX,
    status: function () {
      var sid = canaryStory();
      return { build: BUILD, on: optedIn(), off: off(), active: armed(),
               canaryStory: sid, memoryVersion: MEMORY_VERSION, maxBytes: MAX_BYTES,
               state: stateOf(sid).state, source: stateOf(sid).source,
               barrierGate: { state: barrierStateNow(), blocked: _gateBlocked,
                              where: (function(){ var o={}, i; for (i=0;i<_gateRing.length;i++) o[_gateRing[i].where]=(o[_gateRing[i].where]||0)+1; return o; })() },
               states: [STATE.UNLOADED, STATE.LOADED_ABSENT, STATE.LOADED_VALUE],
               note: 'UNLOADED からは save しない（fail-closed） / null は明示 clear だけ / '
                   + 'unknown-field で strip retry しない / 他 story には memoryV1 を生やさない' };
    },
    STATE: STATE, HOLD: HOLD,
    keyFor: keyFor, isCanary: isCanary, canaryStory: canaryStory,
    stateOf: stateOf, load: load,
    hydrateFromServerRecord: hydrateFromServerRecord,
    saveGate: saveGate, clearExplicit: clearExplicit, clearGate: clearGate, clearConsumed: clearConsumed,
    onUnknownFieldError: onUnknownFieldError,
    materialize: materialize, byteLen: byteLen,
    __test: { materializeFrom: materializeFrom, criticalRefsOf: criticalRefsOf,
              validShape: validShape, setState: setState, LIFECYCLE: LIFECYCLE,
              AUTHORITY: AUTHORITY, MAX_BYTES: MAX_BYTES, CANARY_DEFAULT: CANARY_DEFAULT,
              BARRIER_HOLD: BARRIER_HOLD, barrierStateNow: barrierStateNow,
              barrierWriteAllowed: barrierWriteAllowed, barrierHold: barrierHold,
              gateRing: function () { return _gateRing.slice(); } }
  };
  /* ★自動実行しない。Planner / Retrieve へは 1 本も繋がない。 */
})();
