#!/usr/bin/env node
/*
 * Chronicle Release Pipeline V1.1 - validate_and_apply.mjs
 *
 * Node >= 18, ZERO dependencies.
 *
 * V1.1 changes vs V1:
 *  - manifest schemaVersion 2: files[] no longer embed content. Each file
 *    carries payload {encoding, payloadSha256, chunkCount, totalBytes} and the
 *    bytes arrive as separate chunk records (D1 `release_payload` rows).
 *  - manifest carries manifestSha256 over the canonical manifest JSON.
 *  - NEW exit code 19: integrity (manifest digest, chunk set, payload digest).
 *  - `--allow-pipeline-admin` NO LONGER EXISTS on this CLI. pipeline-admin
 *    releases are applied only through pipeline/admin_apply.mjs, run by hand.
 *
 * Usage:
 *   node pipeline/validate_and_apply.mjs --repo <dir> [--manifest <file>|-]
 *        [--payload <chunks.json>] [--no-commit] [--json <out>] [--quiet]
 *
 * Exit codes (contract - do not renumber):
 *   0  OK
 *   10 schema / contract violation (includes rollback.target: rollbackOf not in
 *      history, or a rollback that skips / smuggles paths)
 *   11 baseCommit != git rev-parse HEAD (also used by the workflow for a rejected push)
 *   12 path denied
 *   13 before-sha mismatch
 *   14 after-sha / size mismatch (includes rollback.bytes: a rollback whose
 *      afterSha256 does not restore the bytes recorded before rollbackOf)
 *   15 unrelated diff
 *   16 Pages contract violation
 *   17 limits exceeded (includes an oversized payload chunk)
 *   18 duplicate releaseId in history
 *   19 integrity: manifestSha256, chunk set completeness, per-chunk sha,
 *      reconstructed size, payloadSha256
 *   2  internal error / bad invocation
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const EXIT = {
  OK: 0, SCHEMA: 10, BASE: 11, PATH: 12, BEFORE: 13, AFTER: 14,
  UNRELATED: 15, PAGES: 16, LIMITS: 17, DUPLICATE: 18, INTEGRITY: 19, INTERNAL: 2,
};

/** Hard caps. A manifest may declare lower limits but can never raise these. */
export const HARD = {
  maxFiles: 32,
  maxTotalBytes: 4 * 1024 * 1024,
  maxFileBytes: 1 * 1024 * 1024,
  /** Max size of ONE base64 chunk, in bytes of base64 text. D1 row-size headroom. */
  maxChunkBytes: 512 * 1024,
};

const FIXED_REPO = 'sansan2103-a11y/chronicle';
const FIXED_BRANCH = 'v292-rebuild';
const AUTHOR_NAME = 'Chronicle Release Gate';
const AUTHOR_EMAIL = 'release-gate@chronicle.invalid';
const SCHEMA_VERSION = 2;

const PAGES_TRIO = ['version.txt', 'index.html', 'home.html'];
const PIPELINE_ALLOW_RE = /^pipeline\/(PROBE\.md|probes\/[A-Za-z0-9][A-Za-z0-9._-]{0,63})$/;
const DENY_BASENAMES = new Set(['.gitattributes', '.gitmodules']);
const RELEASE_ID_RE = /^[0-9]{8}-[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;
const SHA_RE = /^[0-9a-f]{64}$/;
const HEX40_RE = /^[0-9a-f]{40}$/;
const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

/*
 * TEXT SAFETY (L13entry follow-up 1).
 *
 * Nothing in this pipeline ever hands a queue-derived string to a shell as
 * command text - the workflow passes them as `env:` and quotes them, and this
 * validator only ever calls execFileSync with an argv array. These patterns are
 * therefore defence in depth, not the primary control. They exist so that a
 * hostile string is rejected at the boundary instead of travelling onward to
 * whatever future consumer forgets the rule.
 *
 * NUL and C0 controls: a NUL truncates a C string and would split a git
 * -z-delimited record; the rest have no legitimate place in a manifest.
 * Bidi and zero-width marks: they make a reviewed diff render differently from
 * the bytes that are applied, which defeats human review.
 */
const NUL_RE = /\u0000/;
const CTRL_RE = /[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/;   // \t \n \r handled per field
const BIDI_RE = /[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/;
/** Identity trailers this gate does NOT add. Anything claiming one is refused. */
const SMUGGLED_TRAILER_RE = /^\s*(Co-Authored-By|Signed-off-by|Co-authored-by|CC|Acked-by|Reviewed-by)\s*:/i;

class GateError extends Error {
  constructor(code, check, detail) {
    super(`${check}: ${detail}`);
    this.code = code; this.check = check; this.detail = detail;
  }
}
const fail = (code, check, detail) => { throw new GateError(code, check, detail); };
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// ---------------------------------------------------------------------------
// canonical manifest JSON  (the digest input for manifestSha256)
// ---------------------------------------------------------------------------
/**
 * Deterministic serialization: object keys sorted by code unit, no whitespace,
 * arrays in order, `manifestSha256` itself excluded at the top level.
 * The digest is sha256 over the UTF-8 bytes of this string.
 */
export function canonicalManifestJson(m) {
  const walk = (v) => {
    if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
    if (Array.isArray(v)) return '[' + v.map(walk).join(',') + ']';
    const keys = Object.keys(v).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + walk(v[k])).join(',') + '}';
  };
  const clone = {};
  for (const k of Object.keys(m)) if (k !== 'manifestSha256') clone[k] = m[k];
  return walk(clone);
}
export const manifestDigest = (m) => sha256(Buffer.from(canonicalManifestJson(m), 'utf8'));

// ---------------------------------------------------------------------------
// git helpers
// ---------------------------------------------------------------------------
/**
 * V1.1-R fix (REAUDIT F6): byte-exactness is the whole contract, so no git
 * config inherited from the runner may be allowed to rewrite bytes on the way
 * into or out of the object store. autocrlf/eol/safecrlf are pinned off for
 * EVERY git invocation the gate makes, including the `reset --hard` that
 * restores the tree on a dry run or a failure.
 */
const GIT_BYTE_EXACT = [
  '-c', 'core.autocrlf=false',
  '-c', 'core.eol=lf',
  '-c', 'core.safecrlf=false',
];

function makeGit(repo) {
  const base = (args, opts = {}) =>
    execFileSync('git', ['-C', repo, ...GIT_BYTE_EXACT, ...args], { maxBuffer: 256 << 20, stdio: ['pipe', 'pipe', 'pipe'], ...opts });
  return {
    text: (...a) => base(a, { encoding: 'utf8' }).trim(),
    raw: (...a) => base(a),
    buf: (a, input) => base(a, { input }),
    try(...a) {
      try { return { ok: true, out: base(a, { encoding: 'utf8' }) }; }
      catch (e) { return { ok: false, out: String(e.stdout || ''), err: String(e.stderr || e.message || ''), status: e.status }; }
    },
  };
}

function statusPaths(git) {
  const out = git.raw('status', '--porcelain=v1', '-z', '--untracked-files=all').toString('utf8');
  const fields = out.split('\0');
  const paths = new Set();
  for (let i = 0; i < fields.length; i++) {
    const rec = fields[i];
    if (!rec) continue;
    const xy = rec.slice(0, 2);
    const p = rec.slice(3);
    if (p) paths.add(p);
    if (xy[0] === 'R' || xy[0] === 'C' || xy[1] === 'R' || xy[1] === 'C') {
      const orig = fields[++i];
      if (orig) paths.add(orig);
    }
  }
  return paths;
}

// ---------------------------------------------------------------------------
// schema (manifest schemaVersion 2)
// ---------------------------------------------------------------------------
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function validDateStamp(s) {
  const y = +s.slice(0, 4), mo = +s.slice(4, 6), d = +s.slice(6, 8);
  if (y < 2020 || y > 2999 || mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function validateSchema(m) {
  const S = (c, d) => fail(EXIT.SCHEMA, c, d);
  if (!isObj(m)) S('schema.root', 'manifest is not a JSON object');

  const allowedTop = new Set(['schemaVersion', 'releaseId', 'targetRepo', 'targetBranch',
    'baseCommit', 'commitMessage', 'kind', 'rollbackOf', 'files', 'limits',
    'pagesContract', 'note', 'manifestSha256']);
  for (const k of Object.keys(m)) if (!allowedTop.has(k)) S('schema.additionalProperties', `unknown top-level key '${k}'`);

  if (m.schemaVersion !== SCHEMA_VERSION) {
    S('schema.schemaVersion', `expected ${SCHEMA_VERSION} (Pipeline V1.1), got ${JSON.stringify(m.schemaVersion)}`);
  }
  if (typeof m.releaseId !== 'string' || !RELEASE_ID_RE.test(m.releaseId)) {
    S('schema.releaseId', `must match <YYYYMMDD>-<tag>, got ${JSON.stringify(m.releaseId)}`);
  }
  if (!validDateStamp(m.releaseId.slice(0, 8))) S('schema.releaseId', `date part is not a valid calendar date: ${m.releaseId.slice(0, 8)}`);
  if (m.targetRepo !== FIXED_REPO) S('schema.targetRepo', `must be '${FIXED_REPO}'`);
  if (m.targetBranch !== FIXED_BRANCH) S('schema.targetBranch', `must be '${FIXED_BRANCH}'`);
  if (typeof m.baseCommit !== 'string' || !HEX40_RE.test(m.baseCommit)) S('schema.baseCommit', 'must be a 40-hex commit sha');
  if (typeof m.commitMessage !== 'string' || !m.commitMessage.trim() || m.commitMessage.length > 8192) {
    S('schema.commitMessage', 'must be a non-empty string of at most 8192 chars');
  }
  // \n and \t are legitimate in a commit message; nothing else below U+0020 is.
  if (NUL_RE.test(m.commitMessage)) S('schema.commitMessage', 'commitMessage contains a NUL byte');
  if (CTRL_RE.test(m.commitMessage) || /\r/.test(m.commitMessage)) {
    S('schema.commitMessage', 'commitMessage contains a control character (only newline and tab are allowed; CR included)');
  }
  if (BIDI_RE.test(m.commitMessage)) {
    S('schema.commitMessage', 'commitMessage contains a bidi or zero-width control, which would make the reviewed text differ from the applied bytes');
  }
  if (typeof m.manifestSha256 !== 'string' || !SHA_RE.test(m.manifestSha256)) {
    S('schema.manifestSha256', 'manifestSha256 (64-hex) is required in schemaVersion 2');
  }
  if (!['pages', 'pipeline-admin', 'rollback'].includes(m.kind)) S('schema.kind', `must be pages|pipeline-admin|rollback`);
  if (m.kind === 'rollback') {
    if (typeof m.rollbackOf !== 'string' || !RELEASE_ID_RE.test(m.rollbackOf)) S('schema.rollbackOf', 'kind=rollback requires rollbackOf');
    if (m.rollbackOf === m.releaseId) S('schema.rollbackOf', 'rollbackOf must differ from releaseId');
  } else if ('rollbackOf' in m) S('schema.rollbackOf', `rollbackOf is only valid for kind=rollback`);
  if ('note' in m && (typeof m.note !== 'string' || m.note.length > 2048)) S('schema.note', 'note must be a string <= 2048 chars');
  if ('note' in m && (NUL_RE.test(m.note) || CTRL_RE.test(m.note) || /[\r\n]/.test(m.note) || BIDI_RE.test(m.note))) {
    S('schema.note', 'note must be single-line text with no control, CR/LF, NUL, bidi or zero-width characters');
  }

  if (!isObj(m.limits)) S('schema.limits', 'limits object is required');
  for (const k of Object.keys(m.limits)) {
    if (!['maxFiles', 'maxTotalBytes', 'maxFileBytes', 'maxChunkBytes'].includes(k)) S('schema.limits', `unknown limits key '${k}'`);
  }
  for (const k of ['maxFiles', 'maxTotalBytes', 'maxFileBytes']) {
    const v = m.limits[k];
    if (!Number.isInteger(v) || v < 1) S('schema.limits', `limits.${k} must be a positive integer`);
    if (v > HARD[k]) S('schema.limits', `limits.${k}=${v} exceeds the gate hard cap ${HARD[k]}; a manifest cannot raise limits`);
  }
  if ('maxChunkBytes' in m.limits) {
    const v = m.limits.maxChunkBytes;
    if (!Number.isInteger(v) || v < 1 || v > HARD.maxChunkBytes) S('schema.limits', `limits.maxChunkBytes must be 1..${HARD.maxChunkBytes}`);
  }

  const needsPages = m.kind === 'pages' || m.kind === 'rollback';
  if (needsPages) {
    if (!isObj(m.pagesContract)) S('schema.pagesContract', `kind=${m.kind} requires pagesContract`);
    for (const k of Object.keys(m.pagesContract)) if (!['version', 'checkBuiltMarkers'].includes(k)) S('schema.pagesContract', `unknown key '${k}'`);
    if (m.pagesContract.checkBuiltMarkers !== true) S('schema.pagesContract', 'checkBuiltMarkers must be true');
    if (typeof m.pagesContract.version !== 'string') S('schema.pagesContract', 'version must be a string');
  } else if ('pagesContract' in m) S('schema.pagesContract', 'pagesContract is not valid for kind=pipeline-admin');

  if (!Array.isArray(m.files) || m.files.length < 1) S('schema.files', 'files must be a non-empty array');
  const seen = new Set();
  for (const [i, f] of m.files.entries()) {
    const at = `files[${i}]`;
    if (!isObj(f)) S('schema.files', `${at} is not an object`);
    for (const k of Object.keys(f)) {
      if (!['path', 'operation', 'beforeSha256', 'afterSha256', 'size', 'payload'].includes(k)) {
        S('schema.files', `${at}: unknown key '${k}'${k === 'content' ? " - schemaVersion 2 carries bytes as payload chunks, not inline content" : ''}`);
      }
    }
    if (typeof f.path !== 'string' || !f.path.length || f.path.length > 255) S('schema.files', `${at}.path must be 1..255 chars`);
    if (seen.has(f.path)) S('schema.files', `${at}.path duplicated: ${f.path}`);
    seen.add(f.path);
    if (!['new', 'change', 'delete'].includes(f.operation)) S('schema.files', `${at}.operation must be new|change|delete`);
    if (!Number.isInteger(f.size) || f.size < 0) S('schema.files', `${at}.size must be a non-negative integer`);

    const bOk = f.beforeSha256 === null || (typeof f.beforeSha256 === 'string' && SHA_RE.test(f.beforeSha256));
    const aOk = f.afterSha256 === null || (typeof f.afterSha256 === 'string' && SHA_RE.test(f.afterSha256));
    if (!('beforeSha256' in f) || !bOk) S('schema.files', `${at}.beforeSha256 must be 64-hex or null`);
    if (!('afterSha256' in f) || !aOk) S('schema.files', `${at}.afterSha256 must be 64-hex or null`);

    if (f.operation === 'delete') {
      if (typeof f.beforeSha256 !== 'string') S('schema.files', `${at}: delete requires beforeSha256`);
      if (f.afterSha256 !== null) S('schema.files', `${at}: delete requires afterSha256=null`);
      if ('payload' in f) S('schema.files', `${at}: delete must not carry a payload`);
      if (f.size !== 0) S('schema.files', `${at}: delete requires size=0`);
      continue;
    }
    if (f.operation === 'new') {
      if (f.beforeSha256 !== null) S('schema.files', `${at}: new requires beforeSha256=null`);
      if (typeof f.afterSha256 !== 'string') S('schema.files', `${at}: new requires afterSha256`);
    } else {
      if (typeof f.beforeSha256 !== 'string') S('schema.files', `${at}: change requires beforeSha256`);
      if (typeof f.afterSha256 !== 'string') S('schema.files', `${at}: change requires afterSha256`);
      if (f.beforeSha256 === f.afterSha256) S('schema.files', `${at}: change is a no-op (before==after)`);
    }
    if (!isObj(f.payload)) S('schema.files', `${at}: operation=${f.operation} requires a payload descriptor`);
    for (const k of Object.keys(f.payload)) {
      if (!['encoding', 'payloadSha256', 'chunkCount', 'totalBytes'].includes(k)) S('schema.files', `${at}.payload: unknown key '${k}'`);
    }
    const enc = f.payload.encoding;
    if (!['patch-base64', 'full-base64'].includes(enc)) S('schema.files', `${at}.payload.encoding must be patch-base64|full-base64`);
    if (f.operation === 'new' && enc !== 'full-base64') S('schema.files', `${at}: operation=new requires encoding=full-base64`);
    if (typeof f.payload.payloadSha256 !== 'string' || !SHA_RE.test(f.payload.payloadSha256)) S('schema.files', `${at}.payload.payloadSha256 must be 64-hex`);
    if (!Number.isInteger(f.payload.chunkCount) || f.payload.chunkCount < 1) S('schema.files', `${at}.payload.chunkCount must be >= 1`);
    if (!Number.isInteger(f.payload.totalBytes) || f.payload.totalBytes < 1) S('schema.files', `${at}.payload.totalBytes must be >= 1`);
  }
}

// ---------------------------------------------------------------------------
// path rules
// ---------------------------------------------------------------------------
function validatePathSyntax(p, kind, adminAllowed) {
  const D = (d) => fail(EXIT.PATH, 'path.denied', `${p}: ${d}`);
  if (p !== p.trim()) D('leading/trailing whitespace');
  if (p.startsWith('/')) D('absolute path');
  if (p.includes('\\')) D('backslash is not allowed in a repo path');
  if (/[\u0000-\u001f\u007f]/.test(p)) D('control character in path');
  if (NUL_RE.test(p) || BIDI_RE.test(p)) D('NUL, bidi or zero-width character in path');
  for (const s of p.split('/')) {
    if (s === '') D('empty path segment');
    /*
     * L13entry follow-up 1: a segment beginning with '-' is read as an OPTION by
     * every argv consumer that is not given an explicit '--' separator. This gate
     * does pass '--' where it can, but `git apply --include=<path>` has no such
     * separator, and a path like '-rf' or '--exec=...' is never a legitimate
     * Chronicle file. Deny it at the boundary rather than relying on every call
     * site staying careful forever.
     */
    if (s.startsWith('-')) D(`path segment '${s}' begins with '-', which an argv consumer would read as an option`);
    if (s === '.' || s === '..') D(`path traversal segment '${s}'`);
    if (s === '.git') D("'.git' segment is never writable");
    if (s !== s.trim()) D('path segment with leading/trailing whitespace');
  }
  const admin = kind === 'pipeline-admin' && adminAllowed === true;
  if (p === '.github' || p.startsWith('.github/')) {
    if (!admin) D('self-modification of .github/** is hard denied for this release kind');
  }
  if (p === 'pipeline' || p.startsWith('pipeline/')) {
    if (!admin && !PIPELINE_ALLOW_RE.test(p)) {
      D('pipeline/** carries release gate authority; only pipeline/PROBE.md and pipeline/probes/<name> are writable by a normal release');
    }
  }
  const base = p.split('/').pop();
  if (DENY_BASENAMES.has(base) && !admin) D(`'${base}' is hard denied for this release kind`);
  if (kind === 'pipeline-admin' && !adminAllowed) {
    D('kind=pipeline-admin is refused by the release gate; use pipeline/admin_apply.mjs manually');
  }
}

function validateNoSymlink(git, repo, p) {
  const D = (d) => fail(EXIT.PATH, 'path.symlink', `${p}: ${d}`);
  const segs = p.split('/');
  let cur = repo;
  for (let i = 0; i < segs.length; i++) {
    cur = path.join(cur, segs[i]);
    let st;
    try { st = fs.lstatSync(cur); } catch { return; }
    if (st.isSymbolicLink()) D(i === segs.length - 1 ? 'target is a symlink' : `parent '${segs.slice(0, i + 1).join('/')}' is a symlink`);
    if (i < segs.length - 1 && !st.isDirectory()) D(`parent '${segs.slice(0, i + 1).join('/')}' is not a directory`);
  }
  const ls = git.try('ls-files', '-s', '-z', '--', p);
  if (ls.ok && ls.out) {
    for (const rec of ls.out.split('\0')) if (rec && rec.startsWith('120000')) D('path is recorded in the index with symlink mode 120000');
  }
  const repoReal = fs.realpathSync(repo);
  let parentReal;
  try { parentReal = fs.realpathSync(path.dirname(path.join(repo, p))); } catch { return; }
  if (parentReal !== repoReal && !parentReal.startsWith(repoReal + path.sep)) D(`resolves outside the repository root (${parentReal})`);
}

// ---------------------------------------------------------------------------
// payload chunk reconstruction  (exit 19 / 17)
// ---------------------------------------------------------------------------
/**
 * chunks: [{path, seq, chunk_b64, chunk_sha256}] exactly as read from
 * release_payload. Returns Map<path, Buffer> of decoded payload bytes.
 */
function reconstructPayloads(m, chunks, effMaxChunk) {
  const I = (d) => fail(EXIT.INTEGRITY, 'payload.integrity', d);
  if (!Array.isArray(chunks)) I('no payload chunk records were supplied (--payload)');

  const byPath = new Map();
  for (const [i, c] of chunks.entries()) {
    if (!isObj(c)) I(`chunk[${i}] is not an object`);
    if (typeof c.path !== 'string' || !c.path) I(`chunk[${i}].path missing`);
    if (!Number.isInteger(c.seq) || c.seq < 0) I(`chunk[${i}] (${c.path}): seq must be a non-negative integer, got ${JSON.stringify(c.seq)}`);
    if (typeof c.chunk_b64 !== 'string') I(`chunk[${i}] (${c.path} seq ${c.seq}): chunk_b64 must be a string`);
    if (typeof c.chunk_sha256 !== 'string' || !SHA_RE.test(c.chunk_sha256)) I(`chunk[${i}] (${c.path} seq ${c.seq}): chunk_sha256 must be 64-hex`);
    const bytes = Buffer.from(c.chunk_b64, 'utf8');
    if (bytes.length > effMaxChunk) {
      fail(EXIT.LIMITS, 'limits.maxChunkBytes', `${c.path} seq ${c.seq}: chunk is ${bytes.length} bytes of base64 text > ${effMaxChunk}`);
    }
    if (!byPath.has(c.path)) byPath.set(c.path, []);
    byPath.get(c.path).push(c);
  }

  const declared = new Set(m.files.filter((f) => f.operation !== 'delete').map((f) => f.path));
  for (const p of byPath.keys()) {
    if (!declared.has(p)) I(`payload chunks supplied for '${p}', which the manifest does not declare as a new/change file`);
  }

  const out = new Map();
  for (const f of m.files) {
    if (f.operation === 'delete') continue;
    const recs = byPath.get(f.path) || [];
    const { chunkCount, totalBytes, payloadSha256 } = f.payload;

    // no duplicates, complete 0..n-1 run
    const bySeq = new Map();
    for (const c of recs) {
      if (bySeq.has(c.seq)) I(`${f.path}: duplicate chunk for seq ${c.seq}`);
      bySeq.set(c.seq, c);
    }
    if (recs.length !== chunkCount) I(`${f.path}: manifest declares chunkCount=${chunkCount} but ${recs.length} chunk row(s) were supplied`);
    for (let s = 0; s < chunkCount; s++) {
      if (!bySeq.has(s)) I(`${f.path}: missing chunk seq ${s} (expected a complete run 0..${chunkCount - 1}, got [${[...bySeq.keys()].sort((a, b) => a - b).join(',')}])`);
    }

    // per-chunk sha + base64 well-formedness, assembled in seq order
    const parts = [];
    for (let s = 0; s < chunkCount; s++) {
      const c = bySeq.get(s);
      const bytes = Buffer.from(c.chunk_b64, 'utf8');
      const got = sha256(bytes);
      if (got !== c.chunk_sha256) I(`${f.path} seq ${s}: chunk_sha256 mismatch (row says ${c.chunk_sha256}, bytes hash to ${got})`);
      if (!B64_RE.test(c.chunk_b64)) I(`${f.path} seq ${s}: chunk_b64 is not base64 text`);
      if (s < chunkCount - 1 && c.chunk_b64.length % 4 !== 0) {
        I(`${f.path} seq ${s}: a non-final chunk must split on a 4-character base64 boundary (length ${c.chunk_b64.length})`);
      }
      parts.push(bytes);
    }

    const encoded = Buffer.concat(parts);
    if (encoded.length !== totalBytes) I(`${f.path}: reconstructed payload is ${encoded.length} bytes of base64 text, manifest declares totalBytes=${totalBytes}`);
    const encSha = sha256(encoded);
    if (encSha !== payloadSha256) I(`${f.path}: reconstructed payloadSha256 ${encSha} != declared ${payloadSha256}`);

    const b64Text = encoded.toString('utf8');
    const raw = Buffer.from(b64Text, 'base64');
    if (raw.length === 0) I(`${f.path}: payload decodes to zero bytes`);

    /*
     * V1.1-R fix (REAUDIT F4): Buffer.from(_, 'base64') is LENIENT. It stops at
     * the first '=' and silently ignores anything after it, and it ignores
     * characters outside the alphabet. B64_RE is applied per chunk, so a padded
     * non-final chunk ("AA==" is 4 chars and passes the boundary rule) makes the
     * concatenation decode to a PREFIX of what it looks like it contains, while
     * totalBytes and payloadSha256 - which are computed over the base64 TEXT -
     * still match. Nothing downstream was wrong (afterSha256 pins the bytes that
     * actually get written), but the payload was ambiguous: two different texts
     * decoded to the same bytes. Re-encoding and demanding an exact round trip
     * makes the base64 text canonical, so a chunk set has exactly one meaning.
     */
    const reencoded = raw.toString('base64');
    if (reencoded !== b64Text) {
      I(`${f.path}: payload base64 is not canonical - re-encoding the decoded bytes yields ${reencoded.length} chars, the supplied text is ${b64Text.length} chars (padding inside a non-final chunk, or trailing characters after '=')`);
    }
    out.set(f.path, raw);
  }
  return out;
}

// ---------------------------------------------------------------------------
// patch scope
// ---------------------------------------------------------------------------
function assertSingleFilePatch(patchText, declaredPath) {
  const D = (d) => fail(EXIT.PATH, 'patch.scope', `${declaredPath}: ${d}`);
  const minus = [...patchText.matchAll(/^--- (?:a\/)?(\S+)/gm)].map((x) => x[1]);
  const plus = [...patchText.matchAll(/^\+\+\+ (?:b\/)?(\S+)/gm)].map((x) => x[1]);
  if (minus.length !== 1 || plus.length !== 1) D(`a patch must describe exactly one file (found ${minus.length} '---' and ${plus.length} '+++' headers)`);
  const norm = (x) => (x === '/dev/null' ? x : x.replace(/^"|"$/g, ''));
  if (norm(minus[0]) !== declaredPath || norm(plus[0]) !== declaredPath) {
    D(`patch touches '${norm(minus[0])}' -> '${norm(plus[0])}' but the manifest declares '${declaredPath}'`);
  }
  if (/^diff --git /m.test(patchText) && [...patchText.matchAll(/^diff --git /gm)].length !== 1) D('a patch must contain at most one diff --git header');
  if (/^GIT binary patch/m.test(patchText)) D('binary patches are not accepted; use full-base64');
  if (/^(new|deleted) file mode/m.test(patchText)) D('patch may not create or delete files');
  if (/^(old|new) mode /m.test(patchText)) D('patch may not change file modes');
  if (/^rename (from|to) /m.test(patchText)) D('patch may not rename files');
}

// ---------------------------------------------------------------------------
// Pages contract
// ---------------------------------------------------------------------------
function builtMarkers(text, name) {
  const re = name === 'BUILT'
    ? /(?<![A-Za-z0-9_])BUILT\s*=\s*'([^']*)'/g
    : /(?<![A-Za-z0-9_])HOME_BUILT\s*=\s*'([^']*)'/g;
  return [...text.matchAll(re)].map((x) => x[1]);
}

function pagesContractStatic(m) {
  if (m.kind === 'pipeline-admin') return;
  const P = (d) => fail(EXIT.PAGES, 'pages.contract', d);
  if (m.pagesContract.version !== m.releaseId) P(`pagesContract.version '${m.pagesContract.version}' != releaseId '${m.releaseId}'`);
  const byPath = new Map(m.files.map((f) => [f.path, f]));
  const moving = PAGES_TRIO.filter((p) => byPath.has(p));
  if (moving.length === 0) return;
  if (moving.length !== PAGES_TRIO.length) {
    P(`version.txt / index.html BUILT / home.html HOME_BUILT must move together; this release moves only [${moving.join(', ')}], missing [${PAGES_TRIO.filter((p) => !byPath.has(p)).join(', ')}]`);
  }
  for (const p of PAGES_TRIO) if (byPath.get(p).operation === 'delete') P(`${p} may not be deleted by a pages release`);
}

function pagesContractContent(m, repo) {
  if (m.kind === 'pipeline-admin') return [];
  const P = (d) => fail(EXIT.PAGES, 'pages.markers', d);
  const byPath = new Map(m.files.map((f) => [f.path, f]));
  if (!PAGES_TRIO.some((p) => byPath.has(p))) return [];
  const notes = [];
  const vt = fs.readFileSync(path.join(repo, 'version.txt'));
  const expected = Buffer.from(m.releaseId + '\n', 'utf8');
  if (!vt.equals(expected)) P(`version.txt must be exactly "${m.releaseId}\\n" (${expected.length} bytes); got ${vt.length} bytes`);
  notes.push(`version.txt == "${m.releaseId}\\n" (${expected.length} bytes)`);
  for (const [file, marker] of [['index.html', 'BUILT'], ['home.html', 'HOME_BUILT']]) {
    const txt = fs.readFileSync(path.join(repo, file), 'utf8');
    const vals = builtMarkers(txt, marker);
    if (!vals.length) P(`${file}: no ${marker} = '...' assignment found`);
    const bad = vals.filter((v) => v !== m.releaseId);
    if (bad.length) P(`${file}: ${marker} = ${bad.map((v) => `'${v}'`).join(', ')} but releaseId is '${m.releaseId}'`);
    notes.push(`${file} ${marker} == '${m.releaseId}' (${vals.length}x)`);
  }
  return notes;
}

// ---------------------------------------------------------------------------
// commit message
// ---------------------------------------------------------------------------
function normalizeCommitMessage(m) {
  const trailer = `Release-Id: ${m.releaseId}`;
  const body = m.commitMessage.replace(/\s+$/, '');
  const lines = body.split('\n');
  const found = lines.filter((l) => /^Release-Id:/.test(l.trim()));
  if (found.length > 1) fail(EXIT.SCHEMA, 'commit.trailer', 'commitMessage contains more than one Release-Id trailer');
  /*
   * The gate adds exactly one trailer: Release-Id. It never adds an identity
   * trailer, so a manifest carrying one is trying to attribute this commit to
   * somebody who did not write it - and git, GitHub and `git log --format` all
   * treat those lines as structured metadata, not prose.
   */
  const smuggled = lines.filter((l) => SMUGGLED_TRAILER_RE.test(l));
  if (smuggled.length) {
    fail(EXIT.SCHEMA, 'commit.trailer',
      `commitMessage carries ${smuggled.length} identity trailer(s) the gate does not add: ${smuggled.map((l) => JSON.stringify(l.trim().slice(0, 48))).join(', ')}`);
  }
  if (found.length === 1) {
    if (found[0].trim() !== trailer) fail(EXIT.SCHEMA, 'commit.trailer', `commitMessage carries '${found[0].trim()}' but releaseId is '${m.releaseId}'`);
    if (lines[lines.length - 1].trim() !== trailer) fail(EXIT.SCHEMA, 'commit.trailer', 'the Release-Id trailer must be the last line of commitMessage');
    return { message: lines.join('\n') + '\n', added: false, trailer };
  }
  const sep = lines[lines.length - 1].trim() === '' ? '' : '\n';
  return { message: body + sep + '\n' + trailer + '\n', added: true, trailer };
}

function historyHasReleaseId(git, releaseId) {
  const out = git.raw('log', '--no-color', '--max-count=20000', '--format=%H%x1f%B%x1e').toString('utf8');
  const trailer = `Release-Id: ${releaseId}`;
  for (const rec of out.split('\x1e')) {
    if (!rec.trim()) continue;
    const i = rec.indexOf('\x1f');
    if (i < 0) continue;
    for (const line of rec.slice(i + 1).split('\n')) if (line.trim() === trailer) return rec.slice(0, i).trim();
  }
  return null;
}

// ---------------------------------------------------------------------------
// rollback: a rollback must actually restore bytes  (REAUDIT F2)
// ---------------------------------------------------------------------------
/**
 * V1.1 shipped `kind: 'rollback'` with `rollbackOf` as a LABEL only: the
 * validator checked that it was a well-formed releaseId different from
 * releaseId, and nothing else. A manifest could therefore claim to roll back
 * release X while shipping arbitrary new bytes, and every other check would
 * pass, because afterSha256 only proves that the applied bytes equal what the
 * manifest ASKED for - not that they equal what was there before X.
 *
 * This function makes `rollbackOf` load-bearing. The release named by
 * rollbackOf must be findable in this branch's history by its `Release-Id:`
 * trailer; the state to restore is that commit's PARENT tree (rolling back X
 * means undoing X). For every declared file the manifest's afterSha256 must
 * equal the sha256 of the blob at `<commit(X)>^:<path>`, or - when the path did
 * not exist before X - the operation must be `delete`.
 *
 * TWO documented exemptions, both forced by contracts that already exist:
 *
 *  1. The Pages version trio (version.txt / index.html BUILT / home.html
 *     HOME_BUILT). `pagesContractContent()` requires those three to carry the
 *     CURRENT releaseId, i.e. the rollback's own id, so restoring the bytes
 *     that preceded X is impossible for them by construction. They are
 *     exempted from byte-exactness but still required to be part of the set X
 *     moved, and the Pages contract continues to pin their content.
 *  2. Nothing else. Every other declared path is byte-checked, and the set of
 *     non-trio paths in the rollback manifest must equal the set of non-trio
 *     paths X changed - so a rollback can neither skip a file X touched nor
 *     smuggle in an edit X never made.
 */
function validateRollbackRestoresBytes(git, m) {
  const R = (d) => fail(EXIT.SCHEMA, 'rollback.target', d);
  const B = (d) => fail(EXIT.AFTER, 'rollback.bytes', d);

  const target = historyHasReleaseId(git, m.rollbackOf);
  if (!target) {
    R(`rollbackOf=${m.rollbackOf} is not in this branch's history: no commit carries a 'Release-Id: ${m.rollbackOf}' trailer, so there is no recorded state to restore`);
  }
  const parents = git.text('rev-list', '--parents', '-n', '1', target).split(/\s+/);
  if (parents.length !== 2) {
    R(`the commit for ${m.rollbackOf} (${target}) has ${parents.length - 1} parent(s); a rollback target must be a single-parent commit`);
  }
  const before = parents[1];

  const changed = new Set(
    git.raw('diff', '--name-only', '-z', before, target).toString('utf8').split('\0').filter(Boolean)
  );

  const declared = m.files.map((f) => f.path);
  const nonTrioDeclared = new Set(declared.filter((p) => !PAGES_TRIO.includes(p)));
  const nonTrioChanged = new Set([...changed].filter((p) => !PAGES_TRIO.includes(p)));
  const smuggled = [...nonTrioDeclared].filter((p) => !nonTrioChanged.has(p));
  const skipped = [...nonTrioChanged].filter((p) => !nonTrioDeclared.has(p));
  if (smuggled.length) {
    R(`rollback of ${m.rollbackOf} declares path(s) that release never touched: [${smuggled.join(', ')}]; a rollback may only restore what it is rolling back`);
  }
  if (skipped.length) {
    R(`rollback of ${m.rollbackOf} leaves path(s) that release changed unrestored: [${skipped.join(', ')}]; a partial rollback is refused`);
  }
  for (const p of declared) {
    if (PAGES_TRIO.includes(p) && !changed.has(p)) {
      R(`rollback of ${m.rollbackOf} declares ${p}, which that release did not change`);
    }
  }

  const notes = [];
  let exempt = 0;
  for (const f of m.files) {
    if (PAGES_TRIO.includes(f.path)) { exempt++; continue; }
    const got = git.try('cat-file', 'blob', `${before}:${f.path}`);
    if (!got.ok) {
      if (f.operation !== 'delete') {
        B(`${f.path}: did not exist before ${m.rollbackOf} (${before.slice(0, 12)}), so rolling that release back must delete it, not ${f.operation} it`);
      }
      notes.push(`${f.path}: absent before ${m.rollbackOf} -> delete`);
      continue;
    }
    const blob = git.raw('cat-file', 'blob', `${before}:${f.path}`);
    if (f.operation === 'delete') {
      B(`${f.path}: existed before ${m.rollbackOf} (${sha256(blob).slice(0, 16)}...), so rolling that release back must restore it, not delete it`);
    }
    const want = sha256(blob);
    if (f.afterSha256 !== want) {
      B(`${f.path}: afterSha256 ${f.afterSha256} does not restore the bytes recorded before ${m.rollbackOf}; ${before.slice(0, 12)}:${f.path} hashes to ${want}`);
    }
    if (f.size !== blob.length) {
      B(`${f.path}: declared size ${f.size} != ${blob.length} bytes recorded before ${m.rollbackOf}`);
    }
    notes.push(`${f.path}: ${want.slice(0, 16)}... restored`);
  }
  return { target, before, checked: notes.length, exempt, notes };
}

// ---------------------------------------------------------------------------
// core
// ---------------------------------------------------------------------------
/**
 * @param {object} o
 * @param {string} o.repo             checked-out repository directory
 * @param {string} o.manifestText     manifest JSON text
 * @param {Array}  o.chunks           release_payload rows
 * @param {boolean} [o.noCommit]
 * @param {boolean} [o.allowPipelineAdmin]  ONLY pipeline/admin_apply.mjs sets this
 * @returns {{exitCode:number, result:object}}
 */
export function runGate(o) {
  const result = {
    ok: false, exitCode: EXIT.INTERNAL, check: null, detail: null,
    releaseId: null, kind: null, baseCommit: null, commit: null,
    rollbackOf: null, rollbackTarget: null, rollbackRestoresFrom: null,
    filesApplied: 0, totalBytes: 0, chunkCount: 0, trailer: null, trailerAdded: false,
    noCommit: !!o.noCommit, checks: [],
  };
  const pass = (check, note) => result.checks.push({ check, status: 'PASS', note: note || '' });
  let git, m, restoreOnExit = false;

  try {
    const repo = path.resolve(o.repo);
    if (!fs.existsSync(path.join(repo, '.git'))) fail(EXIT.INTERNAL, 'repo', `${repo} is not a git working tree`);
    git = makeGit(repo);

    // 1. schema
    try { m = JSON.parse(o.manifestText); }
    catch (e) { fail(EXIT.SCHEMA, 'schema.json', `manifest is not valid JSON: ${e.message}`); }
    validateSchema(m);
    result.releaseId = m.releaseId; result.kind = m.kind; result.baseCommit = m.baseCommit;
    pass('schema', `schemaVersion=${SCHEMA_VERSION} releaseId=${m.releaseId} kind=${m.kind} files=${m.files.length}`);
    pass('target', `${m.targetRepo}@${m.targetBranch}`);

    // 2. manifest digest
    const md = manifestDigest(m);
    if (md !== m.manifestSha256) {
      fail(EXIT.INTEGRITY, 'manifest.sha256', `manifestSha256 mismatch: canonical manifest hashes to ${md}, manifest declares ${m.manifestSha256}`);
    }
    pass('manifest.sha256', `canonical manifest digest ${md.slice(0, 16)}...`);

    // 3. authority
    if (m.kind === 'pipeline-admin' && !o.allowPipelineAdmin) {
      fail(EXIT.PATH, 'authority', 'kind=pipeline-admin is refused by the release gate; apply it manually with pipeline/admin_apply.mjs');
    }
    pass('authority', m.kind === 'pipeline-admin' ? 'pipeline-admin via admin_apply.mjs' : 'normal release authority');

    // 4. limits
    const eff = {
      maxFiles: Math.min(m.limits.maxFiles, HARD.maxFiles),
      maxTotalBytes: Math.min(m.limits.maxTotalBytes, HARD.maxTotalBytes),
      maxFileBytes: Math.min(m.limits.maxFileBytes, HARD.maxFileBytes),
      maxChunkBytes: Math.min(m.limits.maxChunkBytes ?? HARD.maxChunkBytes, HARD.maxChunkBytes),
    };
    if (m.files.length > eff.maxFiles) fail(EXIT.LIMITS, 'limits.maxFiles', `${m.files.length} files > ${eff.maxFiles}`);
    let total = 0, declaredChunks = 0;
    for (const f of m.files) {
      if (f.size > eff.maxFileBytes) fail(EXIT.LIMITS, 'limits.maxFileBytes', `${f.path}: declared size ${f.size} > ${eff.maxFileBytes}`);
      total += f.size;
      if (f.payload) { total += f.payload.totalBytes; declaredChunks += f.payload.chunkCount; }
    }
    if (total > eff.maxTotalBytes) fail(EXIT.LIMITS, 'limits.maxTotalBytes', `declared size + payload = ${total} bytes > ${eff.maxTotalBytes}`);
    result.totalBytes = total; result.chunkCount = declaredChunks;
    pass('limits', `files=${m.files.length}/${eff.maxFiles} bytes=${total}/${eff.maxTotalBytes} chunks=${declaredChunks}`);

    // 5. paths
    for (const f of m.files) validatePathSyntax(f.path, m.kind, o.allowPipelineAdmin);
    for (const f of m.files) validateNoSymlink(git, repo, f.path);
    pass('paths', `${m.files.length} path(s) cleared the deny list and symlink check`);

    // 6. payload reconstruction
    const needsPayload = m.files.some((f) => f.operation !== 'delete');
    const payloads = needsPayload ? reconstructPayloads(m, o.chunks, eff.maxChunkBytes)
                                  : (Array.isArray(o.chunks) && o.chunks.length
                                      ? fail(EXIT.INTEGRITY, 'payload.integrity', 'payload chunks supplied for a delete-only release')
                                      : new Map());
    pass('payload.integrity', needsPayload
      ? `${declaredChunks} chunk(s) reassembled; per-chunk sha, run completeness, totalBytes and payloadSha256 verified`
      : 'delete-only release, no payload');

    // 7. commit message
    const cm = normalizeCommitMessage(m);
    result.trailer = cm.trailer; result.trailerAdded = cm.added;
    pass('commit.trailer', cm.added ? `trailer appended: ${cm.trailer}` : `trailer verified: ${cm.trailer}`);

    // 8. static pages contract
    pagesContractStatic(m);
    pass('pages.contract.static', m.kind === 'pipeline-admin' ? 'n/a (pipeline-admin)' : 'pagesContract.version == releaseId; trio co-movement ok');

    // 9. base
    const head = git.text('rev-parse', 'HEAD');
    if (head !== m.baseCommit) {
      fail(EXIT.BASE, 'base.headMismatch', `baseCommit ${m.baseCommit} != HEAD ${head}; the branch moved since the build - do not retry, rebuild against ${head} under a new releaseId`);
    }
    pass('base.head', `HEAD == baseCommit ${head}`);

    // 10. clean tree
    const dirty = statusPaths(git);
    if (dirty.size) fail(EXIT.UNRELATED, 'tree.dirtyOnEntry', `working tree is not clean before applying: ${[...dirty].slice(0, 10).join(', ')}`);
    pass('tree.clean', 'working tree clean on entry');

    // 11. duplicate releaseId
    const dup = historyHasReleaseId(git, m.releaseId);
    if (dup) fail(EXIT.DUPLICATE, 'history.duplicateReleaseId', `releaseId ${m.releaseId} was already applied as commit ${dup}; a releaseId is single-use`);
    pass('history.unique', `no Release-Id: ${m.releaseId} trailer in history`);

    // 11b. rollback must restore the bytes that preceded the release it names
    if (m.kind === 'rollback') {
      const rb = validateRollbackRestoresBytes(git, m);
      result.rollbackOf = m.rollbackOf;
      result.rollbackTarget = rb.target;
      result.rollbackRestoresFrom = rb.before;
      pass('rollback.restoresBytes',
        `${m.rollbackOf} = ${rb.target.slice(0, 12)}; ${rb.checked} file(s) byte-checked against ${rb.before.slice(0, 12)}` +
        (rb.exempt ? `; ${rb.exempt} Pages version-trio file(s) exempt (the Pages contract pins them to the rollback's own releaseId)` : ''));
    } else {
      pass('rollback.restoresBytes', 'n/a (not a rollback)');
    }

    // 12. before sha
    for (const f of m.files) {
      const abs = path.join(repo, f.path);
      const exists = fs.existsSync(abs);
      if (f.operation === 'new') {
        if (exists) fail(EXIT.BEFORE, 'before.exists', `${f.path}: operation=new but the file already exists`);
        if (git.try('ls-files', '--error-unmatch', '--', f.path).ok) fail(EXIT.BEFORE, 'before.tracked', `${f.path}: operation=new but the path is tracked`);
      } else {
        if (!exists) fail(EXIT.BEFORE, 'before.missing', `${f.path}: operation=${f.operation} but the file does not exist`);
        if (!fs.lstatSync(abs).isFile()) fail(EXIT.PATH, 'path.notRegularFile', `${f.path}: not a regular file`);
        const got = sha256(fs.readFileSync(abs));
        if (got !== f.beforeSha256) fail(EXIT.BEFORE, 'before.sha256', `${f.path}: expected ${f.beforeSha256}, working tree has ${got}`);
      }
    }
    pass('before.sha256', `${m.files.length} file(s) matched beforeSha256`);

    // 13. apply
    restoreOnExit = true;
    for (const f of m.files) {
      const abs = path.join(repo, f.path);
      if (f.operation === 'delete') { fs.rmSync(abs, { force: true }); continue; }
      const raw = payloads.get(f.path);
      if (f.payload.encoding === 'full-base64') {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, raw, { flag: 'w' });
      } else {
        assertSingleFilePatch(raw.toString('utf8'), f.path);
        try { git.buf(['apply', '--check', '--whitespace=nowarn', '-p1', '--include=' + f.path, '-'], raw); }
        catch (e) { fail(EXIT.BEFORE, 'patch.check', `${f.path}: git apply --check failed: ${String(e.stderr || e.message).trim()}`); }
        try { git.buf(['apply', '--whitespace=nowarn', '-p1', '--include=' + f.path, '-'], raw); }
        catch (e) { fail(EXIT.BEFORE, 'patch.apply', `${f.path}: git apply failed: ${String(e.stderr || e.message).trim()}`); }
      }
    }
    pass('apply', `${m.files.length} operation(s) applied to the working tree`);

    // 14. after sha + size
    for (const f of m.files) {
      const abs = path.join(repo, f.path);
      if (f.operation === 'delete') {
        if (fs.existsSync(abs)) fail(EXIT.AFTER, 'after.notDeleted', `${f.path}: still present after delete`);
        continue;
      }
      if (!fs.existsSync(abs)) fail(EXIT.AFTER, 'after.missing', `${f.path}: missing after apply`);
      if (fs.lstatSync(abs).isSymbolicLink()) fail(EXIT.PATH, 'after.symlink', `${f.path}: became a symlink`);
      const buf = fs.readFileSync(abs);
      const got = sha256(buf);
      if (got !== f.afterSha256) fail(EXIT.AFTER, 'after.sha256', `${f.path}: expected ${f.afterSha256}, applied tree has ${got}`);
      if (buf.length !== f.size) fail(EXIT.AFTER, 'after.size', `${f.path}: declared size ${f.size}, actual ${buf.length}`);
    }
    pass('after.sha256', `${m.files.length} file(s) matched afterSha256 and size`);

    // 15. set equality
    const changed = statusPaths(git);
    const declared = new Set(m.files.map((f) => f.path));
    const extra = [...changed].filter((p) => !declared.has(p));
    const missing = [...declared].filter((p) => !changed.has(p));
    if (extra.length || missing.length) {
      fail(EXIT.UNRELATED, 'tree.setEquality', `changed-file set != manifest set; unrelated=[${extra.join(', ')}] undelivered=[${missing.join(', ')}]`);
    }
    pass('tree.setEquality', `git status set == manifest set (${changed.size} path(s))`);

    // 16. pages contract on applied bytes
    const pg = pagesContractContent(m, repo);
    pass('pages.contract.content', pg.length ? pg.join('; ') : 'release does not move the version trio');
    result.filesApplied = m.files.length;

    // 17. commit (or restore)
    if (o.noCommit) {
      pass('commit', 'skipped (--no-commit); working tree restored');
      git.text('reset', '--hard', 'HEAD');
      git.text('clean', '-fdq');
      restoreOnExit = false;
      const after = statusPaths(git);
      if (after.size) fail(EXIT.INTERNAL, 'dryrun.restore', `dry-run could not restore the tree: ${[...after].join(', ')}`);
      pass('dryrun.restore', `tree restored to ${git.text('rev-parse', 'HEAD')}`);
      result.ok = true; result.exitCode = EXIT.OK;
      return { exitCode: EXIT.OK, result };
    }

    git.raw('add', '-A', '--', ...m.files.map((f) => f.path));
    git.buf(['-c', `user.name=${AUTHOR_NAME}`, '-c', `user.email=${AUTHOR_EMAIL}`, '-c', 'commit.gpgsign=false',
      'commit', '--no-verify', '--quiet', '--file=-'], Buffer.from(cm.message, 'utf8'));
    const newHead = git.text('rev-parse', 'HEAD');
    result.commit = newHead; restoreOnExit = false;
    pass('commit', `${newHead} by ${AUTHOR_NAME}`);

    // 18. post-commit verification
    const parent = git.text('rev-parse', 'HEAD^');
    if (parent !== m.baseCommit) fail(EXIT.BASE, 'commit.parent', `HEAD^ ${parent} != baseCommit ${m.baseCommit}`);
    const parents = git.text('rev-list', '--parents', '-n', '1', 'HEAD').split(/\s+/);
    if (parents.length !== 2) fail(EXIT.BASE, 'commit.parentCount', `commit has ${parents.length - 1} parents, expected exactly 1`);
    pass('commit.parent', `HEAD^ == baseCommit ${parent}`);

    const msg = git.raw('show', '-s', '--format=%B', 'HEAD').toString('utf8');
    if (!msg.split('\n').some((l) => l.trim() === cm.trailer)) fail(EXIT.SCHEMA, 'commit.trailerCommitted', `committed message does not carry '${cm.trailer}'`);
    const author = git.text('show', '-s', '--format=%an <%ae>', 'HEAD');
    if (author !== `${AUTHOR_NAME} <${AUTHOR_EMAIL}>`) fail(EXIT.SCHEMA, 'commit.author', `unexpected author ${author}`);
    pass('commit.identity', `author=${author}; trailer present`);

    for (const f of m.files) {
      if (f.operation === 'delete') {
        if (git.try('cat-file', '-e', `HEAD:${f.path}`).ok) fail(EXIT.AFTER, 'tree.deleteNotCommitted', `${f.path}: still present in the committed tree`);
        continue;
      }
      let blob;
      try { blob = git.raw('cat-file', 'blob', `HEAD:${f.path}`); }
      catch { fail(EXIT.AFTER, 'tree.missingBlob', `${f.path}: not present in the committed tree`); }
      const got = sha256(blob);
      if (got !== f.afterSha256) fail(EXIT.AFTER, 'tree.sha256', `${f.path}: committed blob ${got} != afterSha256 ${f.afterSha256}`);
      const mode = git.text('ls-tree', '-z', 'HEAD', '--', f.path).split(/\s+/)[0];
      if (mode !== '100644' && mode !== '100755') fail(EXIT.PATH, 'tree.mode', `${f.path}: committed with mode ${mode}`);
    }
    pass('tree.recheck', `${m.files.length} committed blob(s) re-hashed against afterSha256`);

    const fin = statusPaths(git);
    if (fin.size) fail(EXIT.UNRELATED, 'tree.dirtyAfterCommit', `working tree not clean after commit: ${[...fin].join(', ')}`);
    pass('tree.cleanAfterCommit', 'working tree clean after commit');

    result.ok = true; result.exitCode = EXIT.OK;
    return { exitCode: EXIT.OK, result };
  } catch (err) {
    if (restoreOnExit && git) {
      try { git.text('reset', '--hard', 'HEAD'); git.text('clean', '-fdq'); } catch { /* best effort */ }
    }
    if (err instanceof GateError) {
      result.exitCode = err.code; result.check = err.check; result.detail = err.detail;
      result.checks.push({ check: err.check, status: 'FAIL', note: err.detail });
      return { exitCode: err.code, result };
    }
    result.exitCode = EXIT.INTERNAL; result.check = 'internal';
    result.detail = String((err && err.stack) || err);
    return { exitCode: EXIT.INTERNAL, result };
  }
}

// ---------------------------------------------------------------------------
// CLI  (NOTE: there is deliberately NO --allow-pipeline-admin flag here)
// ---------------------------------------------------------------------------
export function parseCliArgs(argv) {
  const a = { repo: process.cwd(), manifest: null, payload: null, noCommit: false, json: null, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--repo') a.repo = argv[++i];
    else if (t === '--manifest' || t === '-f') a.manifest = argv[++i];
    else if (t === '--payload') a.payload = argv[++i];
    else if (t === '--no-commit' || t === '--dry-run') a.noCommit = true;
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
  catch (e) { console.error(`validate_and_apply: ${e.message}`); return EXIT.INTERNAL; }

  let manifestText, chunks = null;
  try {
    manifestText = (!a.manifest || a.manifest === '-') ? fs.readFileSync(0, 'utf8') : fs.readFileSync(a.manifest, 'utf8');
  } catch {
    console.error('validate_and_apply: cannot read the manifest');
    return EXIT.INTERNAL;
  }
  if (a.payload) {
    try { chunks = JSON.parse(fs.readFileSync(a.payload, 'utf8')); }
    catch (e) { console.error(`validate_and_apply: cannot read --payload: ${e.message}`); return EXIT.INTERNAL; }
  }

  const { exitCode, result } = runGate({ repo: a.repo, manifestText, chunks, noCommit: a.noCommit, allowPipelineAdmin: false });
  const line = JSON.stringify(result);
  if (a.json) { try { fs.writeFileSync(a.json, line + '\n'); } catch { /* best effort */ } }
  if (!a.quiet) {
    process.stdout.write(line + '\n');
    if (exitCode !== EXIT.OK) console.error(`[gate] FAIL exit=${exitCode} ${result.check}: ${result.detail}`);
  }
  return exitCode;
}

const invokedDirectly = process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname);
if (invokedDirectly) process.exit(cliMain(process.argv.slice(2)));
