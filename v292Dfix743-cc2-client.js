/* v292Dfix743 — CLOUD_CANONICAL C1 client (C1-a builder + C1-b hydrator)
 * ★DEPLOY != ENABLE。このファイルは production bundle に「置くだけ」で、
 *   既定では 1 行も実行されない（load 時に localStorage を読まない・listener 0・timer 0）。
 * GPT裁定 CC_V39_DEPLOY_CLOSED_C1_OFF_GO:
 *   C1_CLIENT_DEFAULT_OFF_DEPLOY = GO / hookup・enable・schema2 write は禁止。
 *   OFF 時に 0 であること: schema2 hydration / canonical write / real story mutation /
 *   adoption / C1 journal 新規作成 / default chr6 処理 / Worker canonical mutation /
 *   既存 save・load 挙動変更。
 * 中身は detached 検証済み cc2_client.js の関数群を **byte 同一**で内包する
 *   （C1W-F fixtures 47/47 + C1-a/b/c tests 46/46 PASS。Worker v39 契約と同一 schema2）。
 * 実配線(deps 束ね)は次 unit（2-context fixture PASS 後）。ここでは window 名前空間へ
 *   関数を置くだけで、呼び出し側は 0 本。
 * feature flag : localStorage v292DfixCC2On  = '1'（既定 OFF）
 * kill switch  : localStorage v292DfixCC2Off = '1' / v292Dfix743Off = '1'
 *   ※ flag は isEnabled() を呼んだ時にだけ読む。load 時は触らない。
 */
(function () {
'use strict';
if (typeof window === 'undefined') return;
if (window.__v292DfixCC2) return;            /* 二重install防止 */

/* ---- schema2 field仕様（Worker v39と同一契約。C1W-F fixturesでbyte一致検証） ---- */
const S2_FIELDS = {
  aiInstr:              { kind: 'string_or_null', maxLen: 65536 },
  genderMap:            { kind: 'null_only' },
  relations:            { kind: 'object' },
  charStates:           { kind: 'object' },
  charFlags:            { kind: 'object' },
  pendingDice:          { kind: 'object_or_null' },
  states77:             { kind: 'object' },
  roster307:            { kind: 'array' },
  turnSummaryOverrides: { kind: 'object' },
  chapterTitles:        { kind: 'object' },
  sceneBreaks:          { kind: 'array' },
  sceneSummaries:       { kind: 'object' },
  coverSeed:            { kind: 'string_or_null', maxLen: 64 },
  /* ★fix793(3B-1): Worker v40 の optional sidecar domain と同一契約。
     optional=true なので presence 必須ではない。既存13の契約は 1 つも変えない。 */
  memoryV1:             { kind: 'memory_v1_or_null', optional: true, maxLen: 262144 },
};
const S2_FIELD_NAMES = Object.keys(S2_FIELDS);
const S2_REQUIRED_NAMES = S2_FIELD_NAMES.filter(function (k) { return S2_FIELDS[k].optional !== true; });
const S2_OPTIONAL_NAMES = S2_FIELD_NAMES.filter(function (k) { return S2_FIELDS[k].optional === true; });

/* ---- localキー構成（fix694 STORY_ID 起点・activeSlot不使用・named storyのみ） ----
 * ★DEFAULT story('chr6')はC1対象外（fix246無サフィックス基底キーがfix564 snapshotの
 *   storyId部分一致coverageに入らないため）。storyId==='default' は BUILD/HYDRATE HOLD。 */
function keysFor(storyId){
  return {
    body:                 'chr6_slot_' + storyId,
    relations:            'chr6_relations_' + storyId,
    charStates:           'chr6_char_states_' + storyId,
    charFlags:            'chr6_char_flags_' + storyId,
    pendingDice:          'chr6_pending_dice_' + storyId,
    states77:             'v292Dfix77States_slot_' + storyId,
    roster307:            'v292Dfix307Roster_slot_' + storyId,
    turnSummaryOverrides: 'chr6_turn_summaries_' + storyId,
    chapterTitles:        'chr6_chapter_titles_' + storyId,
    sceneBreaks:          'chr6_scene_breaks_' + storyId,
    sceneSummaries:       'chr6_scene_summaries_' + storyId,
    aiInstr:              'v292aiInstr_slot_' + storyId,
    coverSeed:            'v292cover_seed_' + storyId,
    /* ★fix793(3B-1): optional memoryV1 の story-scoped key。global key は作らない。
       ここに載せることで fix781 の keySet（SyncGuard snapshot / Recovery Draft）へ
       **自動的に**入る（fix781 は keysFor を反復するだけなので改変不要）。 */
    memoryV1:             'v292Dmem1_slot_' + storyId,
  };
}
const JSON_FIELDS = { relations:1, charStates:1, charFlags:1, pendingDice:1, states77:1, roster307:1,
                      turnSummaryOverrides:1, chapterTitles:1, sceneBreaks:1, sceneSummaries:1 };
const STRING_FIELDS = { aiInstr:1, coverSeed:1 };
const EMPTY = { relations:{}, charStates:{}, charFlags:{}, pendingDice:null, states77:{}, roster307:[],
                turnSummaryOverrides:{}, chapterTitles:{}, sceneBreaks:[], sceneSummaries:{},
                aiInstr:null, coverSeed:null, genderMap:null };

function isPlainObject(v){ return v != null && typeof v === 'object' && !Array.isArray(v); }
function typeOk(field, v){
  const k = S2_FIELDS[field].kind;
  if (k === 'memory_v1_or_null'){
    if (v === null) return true;
    return isPlainObject(v)
        && Object.prototype.toString.call(v.records) === '[object Array]'
        && Object.prototype.toString.call(v.edges)   === '[object Array]';
  }
  if (k === 'null_only') return v === null;
  if (k === 'string_or_null') return v === null || (typeof v === 'string' && v.length <= S2_FIELDS[field].maxLen);
  if (k === 'object') return isPlainObject(v);
  if (k === 'object_or_null') return v === null || isPlainObject(v);
  if (k === 'array') return Array.isArray(v);
  return false;
}

/* =====================================================================
 * C1-a: READ_OK 3値 collection + builder（pure・depsのnativeGetのみ使用）
 * ===================================================================== */
function collectField(deps, storyId, field){
  const key = keysFor(storyId)[field];
  let raw;
  try { raw = deps.nativeGet(key); }
  catch (e){ return { state: 'READ_ERROR_OR_AMBIGUOUS', field, key, reason: 'STORAGE_THROW' }; }
  if (raw === null || raw === undefined) return { state: 'READ_OK_ABSENT', field, key, value: EMPTY[field] };
  if (STRING_FIELDS[field]){
    if (typeof raw !== 'string' || raw.length > S2_FIELDS[field].maxLen)
      return { state: 'READ_ERROR_OR_AMBIGUOUS', field, key, reason: 'BAD_STRING' };
    return { state: 'READ_OK_PRESENT', field, key, value: raw };
  }
  let v;
  try { v = JSON.parse(raw); }
  catch (e){ return { state: 'READ_ERROR_OR_AMBIGUOUS', field, key, reason: 'PARSE_ERROR' }; }   /* ★→{}禁止 */
  if (!typeOk(field, v)) return { state: 'READ_ERROR_OR_AMBIGUOUS', field, key, reason: 'TYPE_MISMATCH' };
  return { state: 'READ_OK_PRESENT', field, key, value: v };
}

function buildSchema2Record(deps, storyId){
  if (!storyId || typeof storyId !== 'string') return { hold: { code: 'NO_STORY_AUTHORITY' } };
  if (storyId === 'default' || storyId === 'chr6') return { hold: { code: 'DEFAULT_STORY_UNSUPPORTED_IN_C1' } };
  const K = keysFor(storyId);
  /* body */
  let bodyRaw;
  try { bodyRaw = deps.nativeGet(K.body); } catch (e){ return { hold: { code: 'BODY_READ_ERROR' } }; }
  if (bodyRaw == null) return { hold: { code: 'BODY_ABSENT' } };
  let body;
  try { body = JSON.parse(bodyRaw); } catch (e){ return { hold: { code: 'BODY_PARSE_ERROR' } }; }
  if (!isPlainObject(body)) return { hold: { code: 'BODY_TYPE' } };
  /* title = chr6_slots_meta entry（local正本・読取のみ） */
  let metaRaw, title = null;
  try { metaRaw = deps.nativeGet('chr6_slots_meta'); } catch (e){ return { hold: { code: 'META_READ_ERROR' } }; }
  try {
    const meta = JSON.parse(metaRaw || '[]');
    if (!Array.isArray(meta)) return { hold: { code: 'META_TYPE' } };
    /* ★★fix750(SCHEMA2_RECORD_CONTRACT_PARITY): title の local 正本は **name**。
       fix697/fix707 CANONICAL_TITLE_SOURCE_CONTRACT と同一意味論に揃える:
         SERVER StoryRecord.title  <->  LOCAL chr6_slots_meta[].name
       旧実装は e.title を読んでいたが live entry に title field は存在しない
       （title は fix579 の tombstone 専用 field）。そのため title が常に '' になり、
       schema2 化と同時に server の title を空文字で確定させてしまう。
       ★fix697 L193 の 'default' 特例は移植しない。storyId==='default' は上の
         DEFAULT_STORY_UNSUPPORTED_IN_C1 で hold 済みでここへ到達しないため。 */
    for (const e of meta){ if (e && String(e.id) === storyId){ title = (e.name == null) ? '' : String(e.name); break; } }
  } catch (e){ return { hold: { code: 'META_PARSE_ERROR' } }; }
  if (title === null) return { hold: { code: 'META_ENTRY_ABSENT' } };
  /* sidecar 13 fields（tri-state） */
  const sidecar = { genderMap: null };
  const sources = { genderMap: 'RESERVED_COMPAT' };
  for (const f of S2_REQUIRED_NAMES){
    if (f === 'genderMap') continue;
    const c = collectField(deps, storyId, f);
    if (c.state === 'READ_ERROR_OR_AMBIGUOUS') return { hold: { code: 'BUILD_SCHEMA2_HOLD', field: f, reason: c.reason } };
    sidecar[f] = c.value;
    sources[f] = c.state;
  }
  /* ★fix793(3B-1): optional domain。**fix793 の gate だけが決める**（localStorage を
     ここで直接読まない＝UNLOADED と LOADED_ABSENT の区別を client 側 1 箇所に閉じる）。
       include:false → key を **生やさない**（canary 対象外 story はここ）
       include:true  → 常に送る（G1。null は明示 clear のときだけ）
       hold          → ★fail-closed（UNLOADED から save させない）
     fix793 が無ければ「canary ではない」として何もしない（既存挙動と同一）。 */
  for (const f of S2_OPTIONAL_NAMES){
    let g = null;
    try {
      const M = (typeof window !== 'undefined') ? window.__v292Dfix793 : null;
      if (M && typeof M.saveGate === 'function'){
        const cg = (typeof M.clearGate === 'function') ? M.clearGate(storyId) : null;
        g = (cg && cg.include) ? cg : M.saveGate(storyId);
      }
    } catch (e){ return { hold: { code: 'BUILD_SCHEMA2_HOLD', field: f, reason: 'MEMORY_GATE_THREW' } }; }
    if (!g) { sources[f] = 'OPTIONAL_ABSENT_NO_MODULE'; continue; }
    if (g.hold) return { hold: { code: 'BUILD_SCHEMA2_HOLD', field: f, reason: g.hold } };
    if (!g.include) { sources[f] = 'OPTIONAL_ABSENT:' + (g.reason || 'not-included'); continue; }
    if (g.value !== null && !typeOk(f, g.value)) return { hold: { code: 'BUILD_SCHEMA2_HOLD', field: f, reason: 'BAD_MEMORY_SHAPE' } };
    sidecar[f] = g.value;
    sources[f] = g.explicitClear ? 'OPTIONAL_EXPLICIT_CLEAR' : 'OPTIONAL_PRESENT';
  }
  /* 送信payload最小化: cfgはHY_CFG_ALLOWで絞る（秘密を載せない。hashはWorker側allowlistが正） */
  const HY_CFG_ALLOW = ['authorNote','bannedPhrases','creepyMode','dialogueLevel','dramaLevel','engineMode','genrePresets','outLen','reactionLevel','toneKey'];
  let cfg = null;
  if (isPlainObject(body.cfg)){ cfg = {}; for (const k of HY_CFG_ALLOW){ if (body.cfg[k] !== undefined) cfg[k] = body.cfg[k]; } }
  const record = { schema: 2, title, deleted: false,
    body: { cfg, cast: (body.cast === undefined ? null : body.cast), scene: (body.scene === undefined ? null : body.scene),
            turns: Array.isArray(body.turns) ? body.turns : [], mode: (body.mode === undefined ? null : body.mode) },
    sidecar };
  return { record, sources };
}

/* =====================================================================
 * C1-b: hydrator（server schema2 → local materialization）
 * deps = { nativeGet, nativeSet, nativeRemove,           … fix654 _native 相当（同期）
 *          journalGet, journalSet, journalClear,         … 専用journal 1キー（同期・durable）
 *          fix721JournalActive(),                        … fix721 restore journal検査
 *          snapshotOf(storyId) -> {id, parts:{key:{value}}snapshot} | null,   … fix564相当（同期化した検証用。実装時はfix564）
 *          restoreFromSnapshot(snapshotId, keys) -> bool, … 対象keyのみ復元
 *          localProjectionHash(storyId) -> hex | null,   … 再構築hash（C1-aのbuilder+serializer）
 *          localTitle(storyId) -> string | null }
 * serverRec = getstory(cap2) 応答の record（schema:2）。serverHash / serverRev も渡す。
 * ===================================================================== */
const PHASE = { PREPARED: 'PREPARED', APPLYING: 'APPLYING', RECOVERY: 'RECOVERY_REQUIRED' };

function validateServerRecord(rec){
  if (!isPlainObject(rec) || rec.schema !== 2) return 'BAD_SCHEMA';
  if (!isPlainObject(rec.sidecar)) return 'BAD_SIDECAR';
  for (const k of Object.keys(rec.sidecar)) if (!S2_FIELDS[k]) return 'UNKNOWN_FIELD:' + k;
  for (const f of S2_FIELD_NAMES){
    if (!Object.prototype.hasOwnProperty.call(rec.sidecar, f)){
      if (S2_FIELDS[f].optional === true) continue;      /* ★optional は presence 不要 */
      return 'FIELD_MISSING:' + f;
    }
    if (!typeOk(f, rec.sidecar[f])) return 'BAD_FIELD_TYPE:' + f;
  }
  if (!isPlainObject(rec.body)) return 'BAD_BODY';
  return null;
}

/* 書込計画: [{key, newValue|null(=remove), field}] を固定順で構成 */
function buildWritePlan(storyId, rec, deps){
  const K = keysFor(storyId);
  const plan = [];
  /* body（cfg=hydrateMergedCfg: server権威=allowlist通過分のみ・local非allowlistは保持） */
  const HY_CFG_ALLOW = ['authorNote','bannedPhrases','creepyMode','dialogueLevel','dramaLevel','engineMode','genrePresets','outLen','reactionLevel','toneKey'];
  let locCfg = null;
  try { const lb = JSON.parse(deps.nativeGet(K.body) || 'null'); locCfg = lb && lb.cfg; } catch (e){ locCfg = null; }
  const mergedCfg = {};
  if (isPlainObject(locCfg)) for (const k in locCfg){ if (HY_CFG_ALLOW.indexOf(k) < 0) mergedCfg[k] = locCfg[k]; }
  if (isPlainObject(rec.body.cfg)) for (const k in rec.body.cfg){ if (HY_CFG_ALLOW.indexOf(k) >= 0) mergedCfg[k] = rec.body.cfg[k]; }
  const bodyStr = JSON.stringify({ cfg: mergedCfg, cast: (rec.body.cast === undefined ? null : rec.body.cast),
    scene: (rec.body.scene === undefined ? null : rec.body.scene),
    turns: Array.isArray(rec.body.turns) ? rec.body.turns : [], mode: (rec.body.mode === undefined ? null : rec.body.mode) });
  plan.push({ key: K.body, newValue: bodyStr, field: 'body' });
  for (const f of S2_REQUIRED_NAMES){
    if (f === 'genderMap') continue;
    const v = rec.sidecar[f];
    if (STRING_FIELDS[f]){
      plan.push({ key: K[f], newValue: (v === null ? null : String(v)), field: f });   /* null=remove */
    } else {
      plan.push({ key: K[f], newValue: JSON.stringify(v), field: f });
    }
  }
  /* ★fix793(3B-1): optional domain の hydrate。server に値があれば local key へ materialize
     する（**shadow DB が無くても server の memoryV1 を保持できる**＝fresh context/new device）。
     server に key が無ければ **plan に載せない**（local を消さない＝silent loss を作らない）。
     null は明示 clear なので remove。 */
  for (const f of S2_OPTIONAL_NAMES){
    if (!Object.prototype.hasOwnProperty.call(rec.sidecar, f)) continue;
    const v = rec.sidecar[f];
    plan.push({ key: K[f], newValue: (v === null ? null : JSON.stringify(v)), field: f });
  }
  return plan;
}

function hydrateSchema2(deps, storyId, serverRec, serverRev, serverHash){
  /* ---- gates（書込0で判定） ---- */
  if (deps.killFlag && deps.killFlag()) return { verdict: 'KILLED_BEFORE_START' };
  const jr = deps.journalGet();
  if (jr) return { verdict: 'JOURNAL_ACTIVE', phase: jr.phase };
  if (deps.fix721JournalActive()) return { verdict: 'FIX721_JOURNAL_ACTIVE' };
  if (!storyId || storyId === 'default' || storyId === 'chr6') return { verdict: 'DEFAULT_STORY_UNSUPPORTED_IN_C1' };
  const verr = validateServerRecord(serverRec);
  if (verr) return { verdict: 'VALIDATION_HOLD', reason: verr };
  const locTitle = deps.localTitle(storyId);
  if (locTitle === null) return { verdict: 'TITLE_CONTRACT_UNRESOLVED', reason: 'NO_LOCAL_TITLE' };
  const srvTitle = (serverRec.title == null) ? '' : String(serverRec.title);
  if (srvTitle !== locTitle) return { verdict: 'TITLE_CONTRACT_UNRESOLVED', reason: 'SERVER_LOCAL_TITLE_MISMATCH' };

  /* ---- preimage snapshot ---- */
  const snap = deps.snapshotOf(storyId);
  if (!snap || !snap.id) return { verdict: 'SNAPSHOT_FAILED' };
  const plan = buildWritePlan(storyId, serverRec, deps);
  /* fix564 coverage + absentBeforeKeys */
  const absentBeforeKeys = [];
  for (const p of plan){
    let cur; try { cur = deps.nativeGet(p.key); } catch (e){ return { verdict: 'PRECHECK_READ_ERROR', key: p.key }; }
    const inSnap = snap.parts && Object.prototype.hasOwnProperty.call(snap.parts, p.key);
    if (cur == null){ absentBeforeKeys.push(p.key); }
    else if (!inSnap){ return { verdict: 'SNAPSHOT_COVERAGE_GAP', key: p.key }; }   /* 存在するのにsnapshot外=中止 */
  }

  /* ---- journal PREPARED（durable） ---- */
  const journal = { version: 1, storyId, serverRev, serverHash, phase: PHASE.PREPARED,
                    targetKeys: plan.map(p => p.key), snapshotId: snap.id, absentBeforeKeys };
  deps.journalSet(journal);
  const jchk = deps.journalGet();
  if (!jchk || jchk.phase !== PHASE.PREPARED){ try { deps.journalClear(); } catch (e){} return { verdict: 'JOURNAL_WRITE_FAILED' }; }

  journal.phase = PHASE.APPLYING; deps.journalSet(journal);

  /* ---- 同期critical section（await/yield 0） ---- */
  const written = [];
  let fail = null;
  for (const p of plan){
    try {
      if (p.newValue === null){
        deps.nativeRemove(p.key);
        const rb = deps.nativeGet(p.key);
        if (rb !== null && rb !== undefined){ fail = { key: p.key, stage: 'remove-readback' }; break; }
      } else {
        deps.nativeSet(p.key, p.newValue);
        const rb = deps.nativeGet(p.key);
        if (rb !== p.newValue){ fail = { key: p.key, stage: 'write-readback' }; break; }
      }
      written.push(p);
    } catch (e){ fail = { key: p.key, stage: 'throw', detail: String(e && e.message || e) }; break; }
  }

  /* ---- 収束検証 ---- */
  if (!fail){
    let lh = null;
    try { lh = deps.localProjectionHash(storyId); } catch (e){ lh = null; }
    if (!lh) fail = { stage: 'hash-recompute' };
    else if (lh !== serverHash) fail = { stage: 'hash-mismatch', localHash: lh };
  }

  if (!fail){
    deps.journalClear();
    return { verdict: 'CANONICAL_APPLIED', serverRev, reloadRequired: true };
  }

  /* ---- 同期rollback（新規作成keyをremove → snapshot復元 → readback） ---- */
  let rbFail = null;
  try {
    for (const p of written.concat(fail.key ? [{ key: fail.key }] : [])){
      if (absentBeforeKeys.indexOf(p.key) >= 0){
        deps.nativeRemove(p.key);
        const rb = deps.nativeGet(p.key);
        if (rb !== null && rb !== undefined){ rbFail = { key: p.key, stage: 'rb-remove' }; break; }
      }
    }
    if (!rbFail){
      const restoreKeys = journal.targetKeys.filter(k => absentBeforeKeys.indexOf(k) < 0);
      const ok = deps.restoreFromSnapshot(snap.id, restoreKeys);
      if (!ok) rbFail = { stage: 'rb-restore' };
      else {
        for (const k of restoreKeys){
          const want = snap.parts[k] ? snap.parts[k].value : null;
          const got = deps.nativeGet(k);
          if (got !== want){ rbFail = { key: k, stage: 'rb-readback' }; break; }
        }
      }
    }
  } catch (e){ rbFail = { stage: 'rb-throw', detail: String(e && e.message || e) }; }

  if (!rbFail){
    deps.journalClear();
    return { verdict: 'ADOPTION_ABORTED_ROLLED_BACK', fail };
  }
  journal.phase = PHASE.RECOVERY; deps.journalSet(journal);
  return { verdict: 'ADOPTION_RECOVERY_REQUIRED', fail, rbFail, hardHold: true, reloadRequired: true };
}

/* ---- boot recovery（classificationより前に呼ぶ） ---- */
function bootRecovery(deps){
  const j = deps.journalGet();
  if (!j) return { verdict: 'NO_JOURNAL' };
  /* PREPARED = 書込前 → journalを消すだけで安全 */
  if (j.phase === PHASE.PREPARED){ deps.journalClear(); return { verdict: 'RECOVERED_NOOP' }; }
  /* APPLYING / RECOVERY_REQUIRED → snapshotから復元 */
  try {
    for (const k of j.absentBeforeKeys || []){
      deps.nativeRemove(k);
      const rb = deps.nativeGet(k);
      if (rb !== null && rb !== undefined) return { verdict: 'RECOVERY_FAILED', key: k, hardHold: true };
    }
    const restoreKeys = (j.targetKeys || []).filter(k => (j.absentBeforeKeys || []).indexOf(k) < 0);
    const ok = deps.restoreFromSnapshot(j.snapshotId, restoreKeys);
    if (!ok) return { verdict: 'RECOVERY_FAILED', hardHold: true };
    for (const k of restoreKeys){
      const want = deps.snapshotValue(j.snapshotId, k);
      const got = deps.nativeGet(k);
      if (got !== want) return { verdict: 'RECOVERY_FAILED', key: k, hardHold: true };
    }
  } catch (e){ return { verdict: 'RECOVERY_FAILED', detail: String(e && e.message || e), hardHold: true }; }
  deps.journalClear();
  return { verdict: 'RECOVERED_RESTORED' };
}

/* ---- flag（既定OFF・fail-closed）。load時には呼ばない ---- */
var FLAG_ON = 'v292DfixCC2On', FLAG_KILL = 'v292DfixCC2Off', FLAG_MODULE_OFF = 'v292Dfix743Off';
function lsGet(k){ try { return localStorage.getItem(k); } catch (e){ return null; } }
function isEnabled(){
  if (lsGet(FLAG_MODULE_OFF) === '1') return false;   /* module kill */
  if (lsGet(FLAG_KILL) === '1') return false;         /* CC2 kill */
  return lsGet(FLAG_ON) === '1';                      /* 既定OFF */
}

window.__v292DfixCC2 = {
  BUILD: 'fix743',
  WIRED: false,                     /* 実配線 0（呼び出し側が存在しない） */
  ENABLED_BY_DEFAULT: false,
  FLAG_ON: FLAG_ON, FLAG_KILL: FLAG_KILL, FLAG_MODULE_OFF: FLAG_MODULE_OFF,
  isEnabled: isEnabled,
  S2_FIELDS: S2_FIELDS, S2_FIELD_NAMES: S2_FIELD_NAMES, EMPTY: EMPTY, PHASE: PHASE,
  S2_REQUIRED_NAMES: S2_REQUIRED_NAMES, S2_OPTIONAL_NAMES: S2_OPTIONAL_NAMES,
  keysFor: keysFor, collectField: collectField, buildSchema2Record: buildSchema2Record,
  validateServerRecord: validateServerRecord, buildWritePlan: buildWritePlan,
  hydrateSchema2: hydrateSchema2, bootRecovery: bootRecovery
};
})();
