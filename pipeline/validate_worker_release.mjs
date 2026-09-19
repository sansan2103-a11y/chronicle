#!/usr/bin/env node
/*
 * Chronicle Release Pipeline V2 - validate_worker_release.mjs
 *
 * Node >= 18, ZERO dependencies.
 *
 * Validates a `kind: 'worker'` release (manifest schemaVersion 3) and, when it
 * passes, renders the wrangler.toml the deploy step will use. It NEVER deploys
 * and never talks to Cloudflare: the workflow runs this, then hands the
 * verified bytes to cloudflare/wrangler-action.
 *
 * WHAT THIS FILE IS DEFENDING AGAINST
 *   `wrangler deploy` uploads a new Worker VERSION, and a version is the
 *   COMPLETE state of the Worker - "its bundled code, static assets, bindings,
 *   and compatibility settings". Anything the configuration does not declare is
 *   not in the new version. For novel-proxy that means a wrangler.toml without
 *   [[d1_databases]] and [[kv_namespaces]] produces a live Worker where env.DB
 *   and env.LEDGER are undefined - every save, every session, every image
 *   ledger write fails - while the deploy itself reports success. See
 *   docs/PIPELINE_V2.md section 3 for the citations.
 *
 *   So: the manifest must carry the full binding set, this validator refuses a
 *   manifest that does not, and the rendered wrangler.toml sets keep_vars=true
 *   so plain-text vars are preserved as well. (Secrets need no protection:
 *   "Secrets are never deleted by a deployment".)
 *
 * Usage:
 *   node pipeline/validate_worker_release.mjs --manifest <file>|- --payload <chunks.json>
 *        [--live-build <string>] [--out-worker <file>] [--out-toml <file>]
 *        [--json <out>] [--quiet]
 *
 * Exit codes (contract - do not renumber):
 *   0  OK
 *   10 schema / contract violation
 *   12 target authority (wrong targetWorker, forbidden payload path)
 *   14 workerSha256 / workerSizeBytes mismatch against the reconstructed bytes
 *   17 limits exceeded
 *   19 integrity: manifestSha256, chunk set, per-chunk sha, payloadSha256
 *   20 live pre-check: the live workerBuild != expectedCurrentBuild
 *   21 env / binding contract: expectedEnvDelta non-empty, or a missing or
 *      malformed binding set
 *   2  internal error / bad invocation
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';

export const EXIT = {
  OK: 0, SCHEMA: 10, TARGET: 12, BYTES: 14, LIMITS: 17,
  INTEGRITY: 19, PRECHECK: 20, ENVDELTA: 21, INTERNAL: 2,
};

/** Hard caps. A manifest may declare lower limits but can never raise these. */
export const HARD = {
  /** A Worker script upload is capped at 10 MB (paid) / 3 MB (free) after
   *  compression; we cap the SOURCE well under that. v42 is ~317 KB. */
  maxWorkerBytes: 2 * 1024 * 1024,
  maxChunkBytes: 512 * 1024,
  maxChunks: 64,
};

export const SCHEMA_VERSION = 3;
export const FIXED_WORKER = 'novel-proxy';
export const PAYLOAD_PATH = 'worker.js';
/** Exactly the bindings novel-proxy uses. Neither more nor fewer. */
export const REQUIRED_BINDINGS = { d1: ['DB'], kv: ['LEDGER'] };

const SHA_RE = /^[0-9a-f]{64}$/;
const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
const RELEASE_ID_RE = /^[0-9]{8}-[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;
const BUILD_RE = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;
const BINDING_NAME_RE = /^[A-Z][A-Z0-9_]{0,63}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEX32_RE = /^[0-9a-f]{32}$/;
const COMPAT_DATE_RE = /^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/;
const D1_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

class GateError extends Error {
  constructor(code, check, detail) { super(`${check}: ${detail}`); this.code = code; this.check = check; this.detail = detail; }
}
const fail = (code, check, detail) => { throw new GateError(code, check, detail); };
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// ---------------------------------------------------------------------------
// canonical manifest JSON - identical rule to Pipeline V1.1
// ---------------------------------------------------------------------------
export function canonicalManifestJson(m) {
  const walk = (v) => {
    if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
    if (Array.isArray(v)) return '[' + v.map(walk).join(',') + ']';
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + walk(v[k])).join(',') + '}';
  };
  const clone = {};
  for (const k of Object.keys(m)) if (k !== 'manifestSha256') clone[k] = m[k];
  return walk(clone);
}
export const manifestDigest = (m) => sha256(Buffer.from(canonicalManifestJson(m), 'utf8'));

function validDateStamp(s) {
  const y = +s.slice(0, 4), mo = +s.slice(4, 6), d = +s.slice(6, 8);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

// ---------------------------------------------------------------------------
// schema
// ---------------------------------------------------------------------------
export function validateWorkerSchema(m) {
  const S = (c, d) => fail(EXIT.SCHEMA, c, d);
  if (!isObj(m)) S('schema.root', 'manifest is not a JSON object');

  const allowedTop = new Set(['schemaVersion', 'releaseId', 'kind', 'targetWorker',
    'expectedCurrentBuild', 'newBuild', 'noop', 'workerSha256', 'workerSizeBytes',
    'expectedEnvDelta', 'rollbackSha256', 'rollbackBuild', 'bindings',
    'compatibilityDate', 'compatibilityFlags', 'payload', 'limits', 'note', 'manifestSha256']);
  /*
   * `expectedEnvDelta` and `bindings` are deliberately NOT in this list: they
   * have dedicated checks that exit 21 (the env/binding contract) with an
   * explanation of what an absent binding set actually does to the live Worker.
   * Reporting them here as a generic schema miss would replace that message
   * with a less useful one.
   */
  for (const k of ['expectedCurrentBuild', 'newBuild', 'workerSha256', 'workerSizeBytes',
                   'rollbackSha256', 'rollbackBuild',
                   'compatibilityDate', 'compatibilityFlags', 'payload', 'limits']) {
    if (!(k in m)) S('schema.required', `'${k}' is required on a worker manifest`);
  }
  for (const k of Object.keys(m)) if (!allowedTop.has(k)) S('schema.additionalProperties', `unknown top-level key '${k}'`);

  if (m.schemaVersion !== SCHEMA_VERSION) S('schema.schemaVersion', `expected ${SCHEMA_VERSION} (worker release), got ${JSON.stringify(m.schemaVersion)}`);
  if (m.kind !== 'worker') S('schema.kind', `this validator only accepts kind='worker', got ${JSON.stringify(m.kind)}`);
  if (typeof m.releaseId !== 'string' || !RELEASE_ID_RE.test(m.releaseId)) S('schema.releaseId', `must match <YYYYMMDD>-<tag>, got ${JSON.stringify(m.releaseId)}`);
  if (!validDateStamp(m.releaseId.slice(0, 8))) S('schema.releaseId', `date part is not a valid calendar date: ${m.releaseId.slice(0, 8)}`);

  // target authority: one Worker, fixed, never taken from the manifest as a free string
  if (m.targetWorker !== FIXED_WORKER) {
    fail(EXIT.TARGET, 'schema.targetWorker', `targetWorker must be '${FIXED_WORKER}', got ${JSON.stringify(m.targetWorker)}; this gate deploys exactly one Worker`);
  }

  for (const k of ['expectedCurrentBuild', 'newBuild', 'rollbackBuild']) {
    if (typeof m[k] !== 'string' || !BUILD_RE.test(m[k])) S(`schema.${k}`, `${k} must be a short build marker string, got ${JSON.stringify(m[k])}`);
  }
  for (const k of ['workerSha256', 'rollbackSha256']) {
    if (typeof m[k] !== 'string' || !SHA_RE.test(m[k])) S(`schema.${k}`, `${k} (64-hex) is required`);
  }
  if (!Number.isInteger(m.workerSizeBytes) || m.workerSizeBytes < 1) S('schema.workerSizeBytes', 'workerSizeBytes must be a positive integer');
  if (typeof m.manifestSha256 !== 'string' || !SHA_RE.test(m.manifestSha256)) S('schema.manifestSha256', 'manifestSha256 (64-hex) is required');
  if ('note' in m && (typeof m.note !== 'string' || m.note.length > 2048)) S('schema.note', 'note must be a string <= 2048 chars');

  /*
   * No-op releases are ALLOWED, but only when they say so. The first worker
   * release is deliberately the bytes that are already live, to prove the
   * transport, the claim, the pre-check, the deploy and the post-deploy poll
   * without changing production behaviour. Because expectedCurrentBuild ==
   * newBuild, the post-deploy poll cannot tell "deployed" from "never
   * deployed" - so the release has to declare that it knows this.
   */
  const equalBuild = m.expectedCurrentBuild === m.newBuild;
  if (equalBuild && m.noop !== true) {
    S('schema.noop', `expectedCurrentBuild == newBuild ('${m.newBuild}'): an equal-build release is a no-op probe and must declare noop:true, so the post-deploy poll is not mistaken for proof that the deploy happened`);
  }
  if (!equalBuild && 'noop' in m && m.noop !== false) {
    S('schema.noop', `noop:true is only valid when expectedCurrentBuild == newBuild (got '${m.expectedCurrentBuild}' -> '${m.newBuild}')`);
  }
  if ('noop' in m && typeof m.noop !== 'boolean') S('schema.noop', 'noop must be a boolean');
  if (equalBuild && m.workerSha256 !== m.rollbackSha256) {
    S('schema.noop', `a no-op release must roll back to the same bytes it ships: workerSha256 ${m.workerSha256.slice(0, 16)} != rollbackSha256 ${m.rollbackSha256.slice(0, 16)}`);
  }
  if (!equalBuild && m.workerSha256 === m.rollbackSha256) {
    S('schema.rollbackSha256', 'a build-changing release must not declare the bytes it ships as its own rollback target');
  }
  if (m.rollbackBuild !== m.expectedCurrentBuild) {
    S('schema.rollbackBuild', `rollbackBuild '${m.rollbackBuild}' must equal expectedCurrentBuild '${m.expectedCurrentBuild}': the state to roll back to IS the state this release expects to replace`);
  }

  // compatibility settings are part of the version; an unpinned date is refused
  if (typeof m.compatibilityDate !== 'string' || !COMPAT_DATE_RE.test(m.compatibilityDate)) {
    S('schema.compatibilityDate', `compatibilityDate must be a pinned yyyy-mm-dd, got ${JSON.stringify(m.compatibilityDate)}. A Worker version carries its compatibility settings; letting wrangler default it would silently move the runtime under a release whose only intent is to change bytes. The Owner confirms this value once - see docs/OWNER_ONE_TIME_SETUP_V2.md.`);
  }
  /*
   * REQUIRED, and allowed to be empty. compatibility_flags is as much a part of
   * the version as compatibility_date: a flag that is live today and absent
   * from the rendered config is silently turned off by the deploy. Making the
   * field required - rather than defaulting it to [] - forces the Owner's
   * answer to be recorded explicitly, so "no flags" is a statement someone
   * made, not a value nobody supplied.
   */
  if (!Array.isArray(m.compatibilityFlags)) {
    S('schema.compatibilityFlags', 'compatibilityFlags is required and must be an array (an EMPTY array is valid and means "this Worker has no compatibility flags"). It is part of the version: a live flag missing from the rendered config is switched off by the deploy.');
  }
  if (m.compatibilityFlags.length > 32) S('schema.compatibilityFlags', 'at most 32 compatibility flags');
  const seenFlags = new Set();
  for (const f of m.compatibilityFlags) {
    if (typeof f !== 'string' || !/^[a-z0-9_]{1,64}$/.test(f)) S('schema.compatibilityFlags', `bad compatibility flag ${JSON.stringify(f)}`);
    if (seenFlags.has(f)) S('schema.compatibilityFlags', `duplicate compatibility flag ${JSON.stringify(f)}`);
    seenFlags.add(f);
  }

  validateEnvDelta(m);
  validateBindings(m);
  validatePayloadDescriptor(m);
  validateLimits(m);
}

/** V2.0 refuses ANY env change. A release that needs one is out of scope. */
function validateEnvDelta(m) {
  const E = (d) => fail(EXIT.ENVDELTA, 'envDelta', d);
  if (!Array.isArray(m.expectedEnvDelta)) E('expectedEnvDelta must be an array (and, in V2.0, an empty one)');
  if (m.expectedEnvDelta.length !== 0) {
    E(`expectedEnvDelta declares ${m.expectedEnvDelta.length} change(s) [${m.expectedEnvDelta.map((e) => JSON.stringify(isObj(e) ? e.name : e)).join(', ')}]; Pipeline V2.0 deploys CODE ONLY. A release that adds, removes or edits a var, secret or binding is refused here and must be done by the Owner in the dashboard, with a separate code release afterwards.`);
  }
}

/**
 * The binding set is mandatory and exact.
 *
 * A wrangler deploy replaces the Worker's bindings with what the configuration
 * declares. Under-declaring silently removes a binding from the live Worker;
 * over-declaring silently adds one. Both are refused: the manifest must name
 * exactly the bindings novel-proxy uses, with their ids, and no secret values.
 */
function validateBindings(m) {
  const B = (d) => fail(EXIT.ENVDELTA, 'bindings', d);
  if (!isObj(m.bindings)) B('bindings is required: a wrangler deploy replaces the live binding set with what the configuration declares, so an absent binding is a REMOVED binding');
  for (const k of Object.keys(m.bindings)) {
    if (!['d1_databases', 'kv_namespaces'].includes(k)) {
      B(`unknown binding group '${k}'. V2.0 supports d1_databases and kv_namespaces only; 'vars' is deliberately absent because the rendered wrangler.toml sets keep_vars = true and never rewrites vars.`);
    }
  }
  const d1 = m.bindings.d1_databases, kv = m.bindings.kv_namespaces;
  if (!Array.isArray(d1) || !Array.isArray(kv)) B('bindings.d1_databases and bindings.kv_namespaces must both be arrays');

  const seen = new Set();
  for (const [i, e] of d1.entries()) {
    if (!isObj(e)) B(`bindings.d1_databases[${i}] is not an object`);
    for (const k of Object.keys(e)) if (!['binding', 'database_name', 'database_id'].includes(k)) B(`bindings.d1_databases[${i}]: unknown key '${k}' (no secret values are ever carried in a manifest)`);
    if (typeof e.binding !== 'string' || !BINDING_NAME_RE.test(e.binding)) B(`bindings.d1_databases[${i}].binding must be an UPPER_SNAKE name`);
    if (typeof e.database_name !== 'string' || !D1_NAME_RE.test(e.database_name)) B(`bindings.d1_databases[${i}].database_name is missing or malformed`);
    if (typeof e.database_id !== 'string' || !UUID_RE.test(e.database_id)) B(`bindings.d1_databases[${i}].database_id must be a uuid`);
    if (seen.has(e.binding)) B(`duplicate binding name '${e.binding}'`);
    seen.add(e.binding);
  }
  for (const [i, e] of kv.entries()) {
    if (!isObj(e)) B(`bindings.kv_namespaces[${i}] is not an object`);
    for (const k of Object.keys(e)) if (!['binding', 'id'].includes(k)) B(`bindings.kv_namespaces[${i}]: unknown key '${k}'`);
    if (typeof e.binding !== 'string' || !BINDING_NAME_RE.test(e.binding)) B(`bindings.kv_namespaces[${i}].binding must be an UPPER_SNAKE name`);
    if (typeof e.id !== 'string' || !HEX32_RE.test(e.id)) B(`bindings.kv_namespaces[${i}].id must be a 32-hex namespace id`);
    if (seen.has(e.binding)) B(`duplicate binding name '${e.binding}'`);
    seen.add(e.binding);
  }

  const gotD1 = d1.map((e) => e.binding).sort().join(',');
  const gotKv = kv.map((e) => e.binding).sort().join(',');
  const wantD1 = [...REQUIRED_BINDINGS.d1].sort().join(',');
  const wantKv = [...REQUIRED_BINDINGS.kv].sort().join(',');
  if (gotD1 !== wantD1) B(`D1 bindings must be exactly [${wantD1}], got [${gotD1 || 'none'}]. Under-declaring REMOVES the binding from the live Worker; over-declaring adds one nobody reviewed.`);
  if (gotKv !== wantKv) B(`KV bindings must be exactly [${wantKv}], got [${gotKv || 'none'}]`);
}

function validatePayloadDescriptor(m) {
  const S = (c, d) => fail(EXIT.SCHEMA, c, d);
  if (!isObj(m.payload)) S('schema.payload', 'payload descriptor is required');
  for (const k of Object.keys(m.payload)) {
    if (!['path', 'encoding', 'payloadSha256', 'chunkCount', 'totalBytes'].includes(k)) S('schema.payload', `payload: unknown key '${k}'`);
  }
  if (m.payload.path !== PAYLOAD_PATH) {
    fail(EXIT.TARGET, 'schema.payload', `payload.path must be '${PAYLOAD_PATH}'; a worker release ships exactly one file and cannot name any other path`);
  }
  if (m.payload.encoding !== 'full-base64') S('schema.payload', "payload.encoding must be 'full-base64'; a Worker script is never patched, it is replaced whole");
  if (typeof m.payload.payloadSha256 !== 'string' || !SHA_RE.test(m.payload.payloadSha256)) S('schema.payload', 'payload.payloadSha256 must be 64-hex');
  if (!Number.isInteger(m.payload.chunkCount) || m.payload.chunkCount < 1) S('schema.payload', 'payload.chunkCount must be >= 1');
  if (!Number.isInteger(m.payload.totalBytes) || m.payload.totalBytes < 1) S('schema.payload', 'payload.totalBytes must be >= 1');
}

function validateLimits(m) {
  const S = (c, d) => fail(EXIT.SCHEMA, c, d);
  if (!isObj(m.limits)) S('schema.limits', 'limits object is required');
  for (const k of Object.keys(m.limits)) if (!['maxWorkerBytes', 'maxChunkBytes'].includes(k)) S('schema.limits', `unknown limits key '${k}'`);
  for (const k of ['maxWorkerBytes', 'maxChunkBytes']) {
    if (!(k in m.limits)) continue;
    const v = m.limits[k];
    if (!Number.isInteger(v) || v < 1) S('schema.limits', `limits.${k} must be a positive integer`);
    if (v > HARD[k]) S('schema.limits', `limits.${k}=${v} exceeds the gate hard cap ${HARD[k]}; a manifest cannot raise limits`);
  }
}

// ---------------------------------------------------------------------------
// payload reconstruction - same chunk contract as Pipeline V1.1
// ---------------------------------------------------------------------------
export function reconstructWorker(m, chunks, eff) {
  const I = (d) => fail(EXIT.INTEGRITY, 'payload.integrity', d);
  if (!Array.isArray(chunks)) I('no payload chunk records were supplied (--payload)');

  const { chunkCount, totalBytes, payloadSha256 } = m.payload;
  if (chunks.length > HARD.maxChunks) fail(EXIT.LIMITS, 'limits.maxChunks', `${chunks.length} chunk rows > ${HARD.maxChunks}`);

  const bySeq = new Map();
  for (const [i, c] of chunks.entries()) {
    if (!isObj(c)) I(`chunk[${i}] is not an object`);
    if (c.path !== PAYLOAD_PATH) I(`chunk[${i}] is for path ${JSON.stringify(c.path)}; a worker release carries only '${PAYLOAD_PATH}'`);
    if (!Number.isInteger(c.seq) || c.seq < 0) I(`chunk[${i}]: seq must be a non-negative integer`);
    if (typeof c.chunk_b64 !== 'string') I(`chunk[${i}] seq ${c.seq}: chunk_b64 must be a string`);
    if (typeof c.chunk_sha256 !== 'string' || !SHA_RE.test(c.chunk_sha256)) I(`chunk[${i}] seq ${c.seq}: chunk_sha256 must be 64-hex`);
    const bytes = Buffer.from(c.chunk_b64, 'utf8');
    if (bytes.length > eff.maxChunkBytes) fail(EXIT.LIMITS, 'limits.maxChunkBytes', `seq ${c.seq}: chunk is ${bytes.length} bytes of base64 text > ${eff.maxChunkBytes}`);
    if (bySeq.has(c.seq)) I(`duplicate chunk for seq ${c.seq}`);
    bySeq.set(c.seq, c);
  }
  if (chunks.length !== chunkCount) I(`manifest declares chunkCount=${chunkCount} but ${chunks.length} chunk row(s) were supplied`);
  for (let s = 0; s < chunkCount; s++) if (!bySeq.has(s)) I(`missing chunk seq ${s} (expected a complete run 0..${chunkCount - 1})`);

  const parts = [];
  for (let s = 0; s < chunkCount; s++) {
    const c = bySeq.get(s);
    const bytes = Buffer.from(c.chunk_b64, 'utf8');
    const got = sha256(bytes);
    if (got !== c.chunk_sha256) I(`seq ${s}: chunk_sha256 mismatch (row says ${c.chunk_sha256}, bytes hash to ${got})`);
    if (!B64_RE.test(c.chunk_b64)) I(`seq ${s}: chunk_b64 is not base64 text`);
    if (s < chunkCount - 1 && c.chunk_b64.length % 4 !== 0) I(`seq ${s}: a non-final chunk must split on a 4-character base64 boundary (length ${c.chunk_b64.length})`);
    parts.push(bytes);
  }

  const encoded = Buffer.concat(parts);
  if (encoded.length !== totalBytes) I(`reconstructed payload is ${encoded.length} bytes of base64 text, manifest declares totalBytes=${totalBytes}`);
  const encSha = sha256(encoded);
  if (encSha !== payloadSha256) I(`reconstructed payloadSha256 ${encSha} != declared ${payloadSha256}`);

  const b64Text = encoded.toString('utf8');
  const raw = Buffer.from(b64Text, 'base64');
  if (raw.length === 0) I('payload decodes to zero bytes');
  // same canonicality rule as V1.1 (see v1.1/docs/V11_REAUDIT.md F4)
  if (raw.toString('base64') !== b64Text) I("payload base64 is not canonical - padding inside a non-final chunk, or characters after '='");
  return raw;
}

// ---------------------------------------------------------------------------
// wrangler.toml renderer
// ---------------------------------------------------------------------------
/**
 * Minimal and complete. Everything that appears here is validated above; no
 * value reaches this function unescaped-and-unchecked, so a manifest cannot
 * inject TOML.
 *
 * keep_vars = true: plain-text vars configured in the dashboard would otherwise
 * be deleted and replaced by whatever [vars] the config declares (which, in
 * V2.0, is nothing). Secrets need no equivalent - they are never deleted by a
 * deployment. See docs/PIPELINE_V2.md section 3.
 */
export function renderWranglerToml(m) {
  const L = [];
  L.push(`# GENERATED AT RUNTIME by pipeline/validate_worker_release.mjs`);
  L.push(`# release ${m.releaseId}  ${m.expectedCurrentBuild} -> ${m.newBuild}${m.noop ? '  (NO-OP PROBE)' : ''}`);
  L.push(`name = "${m.targetWorker}"`);
  L.push(`main = "${PAYLOAD_PATH}"`);
  L.push(`compatibility_date = "${m.compatibilityDate}"`);
  // Rendered ALWAYS, including when empty, so the version states its flag set
  // rather than inheriting whatever the previous one had.
  L.push(`compatibility_flags = [${m.compatibilityFlags.map((f) => `"${f}"`).join(', ')}]`);
  L.push(`# A deploy replaces the version's vars. keep_vars keeps the live ones.`);
  L.push(`keep_vars = true`);
  L.push(`# No [build]: worker.js is deployed exactly as reconstructed, unbundled.`);
  for (const e of m.bindings.d1_databases) {
    L.push('');
    L.push('[[d1_databases]]');
    L.push(`binding = "${e.binding}"`);
    L.push(`database_name = "${e.database_name}"`);
    L.push(`database_id = "${e.database_id}"`);
  }
  for (const e of m.bindings.kv_namespaces) {
    L.push('');
    L.push('[[kv_namespaces]]');
    L.push(`binding = "${e.binding}"`);
    L.push(`id = "${e.id}"`);
  }
  return L.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// core
// ---------------------------------------------------------------------------
/**
 * @param {object} o
 * @param {string} o.manifestText
 * @param {Array}  o.chunks
 * @param {string} [o.liveBuild]  workerBuild read from GET / on the live Worker
 * @returns {{exitCode:number, result:object, worker:Buffer|null, toml:string|null}}
 */
export function runWorkerGate(o) {
  const result = {
    ok: false, exitCode: EXIT.INTERNAL, check: null, detail: null,
    releaseId: null, targetWorker: null, expectedCurrentBuild: null, newBuild: null,
    noop: false, workerSha256: null, workerSizeBytes: 0, chunkCount: 0,
    liveBuild: o.liveBuild ?? null, bindings: null, compatibilityDate: null, compatibilityFlags: null, checks: [],
  };
  const pass = (check, note) => result.checks.push({ check, status: 'PASS', note: note || '' });
  let m = null, worker = null, toml = null;

  try {
    try { m = JSON.parse(o.manifestText); }
    catch (e) { fail(EXIT.SCHEMA, 'schema.json', `manifest is not valid JSON: ${e.message}`); }

    validateWorkerSchema(m);
    Object.assign(result, {
      releaseId: m.releaseId, targetWorker: m.targetWorker,
      expectedCurrentBuild: m.expectedCurrentBuild, newBuild: m.newBuild,
      noop: m.noop === true, workerSha256: m.workerSha256,
      workerSizeBytes: m.workerSizeBytes, chunkCount: m.payload.chunkCount,
      compatibilityDate: m.compatibilityDate,
      bindings: { d1: m.bindings.d1_databases.map((e) => e.binding), kv: m.bindings.kv_namespaces.map((e) => e.binding) },
    });
    pass('schema', `schemaVersion=${SCHEMA_VERSION} releaseId=${m.releaseId} ${m.expectedCurrentBuild} -> ${m.newBuild}${m.noop ? ' (noop)' : ''}`);
    pass('target', `${m.targetWorker} (fixed)`);
    pass('envDelta', 'expectedEnvDelta == [] (V2.0 deploys code only)');
    pass('bindings', `D1 [${result.bindings.d1.join(', ')}] + KV [${result.bindings.kv.join(', ')}] declared; keep_vars=true preserves vars; secrets are never deleted by a deployment`);
    result.compatibilityFlags = m.compatibilityFlags;
    pass('compatibility', `compatibility_date pinned to ${m.compatibilityDate}; compatibility_flags = [${m.compatibilityFlags.join(', ')}]${m.compatibilityFlags.length ? '' : ' (explicitly empty)'}`);

    const md = manifestDigest(m);
    if (md !== m.manifestSha256) fail(EXIT.INTEGRITY, 'manifest.sha256', `manifestSha256 mismatch: canonical manifest hashes to ${md}, manifest declares ${m.manifestSha256}`);
    pass('manifest.sha256', `canonical manifest digest ${md.slice(0, 16)}...`);

    const eff = {
      maxWorkerBytes: Math.min(m.limits.maxWorkerBytes ?? HARD.maxWorkerBytes, HARD.maxWorkerBytes),
      maxChunkBytes: Math.min(m.limits.maxChunkBytes ?? HARD.maxChunkBytes, HARD.maxChunkBytes),
    };
    if (m.workerSizeBytes > eff.maxWorkerBytes) fail(EXIT.LIMITS, 'limits.maxWorkerBytes', `declared workerSizeBytes ${m.workerSizeBytes} > ${eff.maxWorkerBytes}`);
    pass('limits', `workerSizeBytes=${m.workerSizeBytes}/${eff.maxWorkerBytes} chunks=${m.payload.chunkCount}`);

    worker = reconstructWorker(m, o.chunks, eff);
    pass('payload.integrity', `${m.payload.chunkCount} chunk(s) reassembled; per-chunk sha, run completeness, totalBytes, payloadSha256 and base64 canonicality verified`);

    const got = sha256(worker);
    if (got !== m.workerSha256) fail(EXIT.BYTES, 'worker.sha256', `reconstructed worker.js hashes to ${got}, manifest declares workerSha256 ${m.workerSha256}`);
    if (worker.length !== m.workerSizeBytes) fail(EXIT.BYTES, 'worker.size', `reconstructed worker.js is ${worker.length} bytes, manifest declares workerSizeBytes ${m.workerSizeBytes}`);
    pass('worker.bytes', `${worker.length} bytes, sha256 ${got.slice(0, 16)}...`);

    /*
     * Live pre-check. The Worker we are about to replace must be the Worker the
     * release was built against. If the live build is anything else, someone
     * deployed out of band and this release's rollbackSha256 no longer
     * describes what is actually running - deploying would destroy a state
     * nobody has a copy of.
     */
    if (o.liveBuild == null) {
      pass('precheck.liveBuild', 'SKIPPED (no --live-build supplied; the workflow always supplies it)');
    } else if (o.liveBuild !== m.expectedCurrentBuild) {
      fail(EXIT.PRECHECK, 'precheck.liveBuild', `the live Worker reports workerBuild='${o.liveBuild}' but this release expects '${m.expectedCurrentBuild}'; someone deployed out of band. Do NOT deploy: rollbackSha256 no longer describes what is running. Quarantine and rebuild against the live build.`);
    } else {
      pass('precheck.liveBuild', `live workerBuild '${o.liveBuild}' == expectedCurrentBuild`);
    }

    toml = renderWranglerToml(m);
    pass('wrangler.toml', `rendered ${toml.split('\n').length - 1} lines; name=${m.targetWorker} main=${PAYLOAD_PATH}`);

    if (m.noop === true) {
      pass('noop', `NO-OP PROBE: ships the bytes already live ('${m.newBuild}'). The post-deploy poll CANNOT prove the deploy happened - read the Cloudflare deployment id / version id instead.`);
    }

    result.ok = true; result.exitCode = EXIT.OK;
    return { exitCode: EXIT.OK, result, worker, toml };
  } catch (err) {
    if (err instanceof GateError) {
      result.exitCode = err.code; result.check = err.check; result.detail = err.detail;
      result.checks.push({ check: err.check, status: 'FAIL', note: err.detail });
      return { exitCode: err.code, result, worker: null, toml: null };
    }
    result.exitCode = EXIT.INTERNAL; result.check = 'internal';
    result.detail = String((err && err.stack) || err);
    return { exitCode: EXIT.INTERNAL, result, worker: null, toml: null };
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
export function parseCliArgs(argv) {
  const a = { manifest: null, payload: null, liveBuild: null, outWorker: null, outToml: null, json: null, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--manifest' || t === '-f') a.manifest = argv[++i];
    else if (t === '--payload') a.payload = argv[++i];
    else if (t === '--live-build') a.liveBuild = argv[++i];
    else if (t === '--out-worker') a.outWorker = argv[++i];
    else if (t === '--out-toml') a.outToml = argv[++i];
    else if (t === '--json') a.json = argv[++i];
    else if (t === '--quiet') a.quiet = true;
    else if (t === '-') a.manifest = '-';
    else throw new Error(`unknown argument '${t}'`);
  }
  return a;
}

export function cliMain(argv) {
  let a;
  try { a = parseCliArgs(argv); }
  catch (e) { console.error(`validate_worker_release: ${e.message}`); return EXIT.INTERNAL; }

  let manifestText, chunks = null;
  try { manifestText = (!a.manifest || a.manifest === '-') ? fs.readFileSync(0, 'utf8') : fs.readFileSync(a.manifest, 'utf8'); }
  catch { console.error('validate_worker_release: cannot read the manifest'); return EXIT.INTERNAL; }
  if (a.payload) {
    try { chunks = JSON.parse(fs.readFileSync(a.payload, 'utf8')); }
    catch (e) { console.error(`validate_worker_release: cannot read --payload: ${e.message}`); return EXIT.INTERNAL; }
  }

  const { exitCode, result, worker, toml } = runWorkerGate({ manifestText, chunks, liveBuild: a.liveBuild });
  if (exitCode === EXIT.OK) {
    // Only ever written after every check passed, so a failed run cannot leave
    // a half-verified worker.js on disk for the deploy step to pick up.
    if (a.outWorker) fs.writeFileSync(a.outWorker, worker);
    if (a.outToml) fs.writeFileSync(a.outToml, toml, 'utf8');
  }
  const line = JSON.stringify(result);
  if (a.json) { try { fs.writeFileSync(a.json, line + '\n'); } catch { /* best effort */ } }
  if (!a.quiet) {
    process.stdout.write(line + '\n');
    if (exitCode !== EXIT.OK) console.error(`[worker-gate] FAIL exit=${exitCode} ${result.check}: ${result.detail}`);
  }
  return exitCode;
}

const invokedDirectly = process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname);
if (invokedDirectly) process.exit(cliMain(process.argv.slice(2)));
