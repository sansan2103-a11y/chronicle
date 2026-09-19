#!/usr/bin/env node
/*
 * Chronicle Release Pipeline V1.1 - admin_apply.mjs
 *
 * The ONLY way to apply a `kind: pipeline-admin` release.
 *
 * Why this file exists: `validate_and_apply.mjs` has no --allow-pipeline-admin
 * flag, and the release-gate workflow never references this script. There is
 * therefore no argument the scheduled gate could be made to pass, and no queue
 * row it could be handed, that would let an automated release rewrite
 * `.github/**` or the validator itself. Pipeline changes are applied by a human
 * running this script in a session that already holds push authority.
 *
 * It refuses anything that is NOT pipeline-admin, so it cannot be used as a
 * general-purpose bypass for a normal release either.
 *
 * Usage:
 *   node pipeline/admin_apply.mjs --repo <dir> --manifest <file> --payload <chunks.json>
 *                                 [--no-commit] [--json <out>] [--quiet]
 *                                 --i-am-the-owner-session
 */

import fs from 'node:fs';
import { runGate, parseCliArgs, EXIT } from './validate_and_apply.mjs';

const argv = process.argv.slice(2);
const CONFIRM = '--i-am-the-owner-session';

if (!argv.includes(CONFIRM)) {
  console.error(`admin_apply: refusing to run without ${CONFIRM}.`);
  console.error('This script applies pipeline-admin releases, which may rewrite .github/** and the');
  console.error('validator itself. It is meant to be typed by a human, never invoked by a workflow.');
  process.exit(EXIT.INTERNAL);
}

let a;
try { a = parseCliArgs(argv.filter((t) => t !== CONFIRM)); }
catch (e) { console.error(`admin_apply: ${e.message}`); process.exit(EXIT.INTERNAL); }

let manifestText, chunks = null;
try {
  manifestText = (!a.manifest || a.manifest === '-') ? fs.readFileSync(0, 'utf8') : fs.readFileSync(a.manifest, 'utf8');
} catch { console.error('admin_apply: cannot read the manifest'); process.exit(EXIT.INTERNAL); }

if (a.payload) {
  try { chunks = JSON.parse(fs.readFileSync(a.payload, 'utf8')); }
  catch (e) { console.error(`admin_apply: cannot read --payload: ${e.message}`); process.exit(EXIT.INTERNAL); }
}

// Refuse to be a general bypass: this script is for pipeline-admin only.
let kind = null;
try { kind = JSON.parse(manifestText).kind; } catch { /* runGate reports the schema error */ }
if (kind !== null && kind !== 'pipeline-admin') {
  console.error(`admin_apply: manifest kind is '${kind}', not 'pipeline-admin'.`);
  console.error('Normal releases go through the queue and pipeline/validate_and_apply.mjs.');
  process.exit(EXIT.INTERNAL);
}

console.error('admin_apply: applying a PIPELINE-ADMIN release. .github/** and pipeline/** are writable.');

const { exitCode, result } = runGate({
  repo: a.repo, manifestText, chunks, noCommit: a.noCommit, allowPipelineAdmin: true,
});

const line = JSON.stringify(result);
if (a.json) { try { fs.writeFileSync(a.json, line + '\n'); } catch { /* best effort */ } }
if (!a.quiet) {
  process.stdout.write(line + '\n');
  if (exitCode !== EXIT.OK) console.error(`[admin] FAIL exit=${exitCode} ${result.check}: ${result.detail}`);
}
process.exit(exitCode);
