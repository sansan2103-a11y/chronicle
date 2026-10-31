// Chronicle minimal regression set (public-safe).
// - no network, no secrets, no real saves: only reads the files of a site tree and runs pure functions on synthetic data.
// usage: node tests/run_all.mjs [site_dir]        (default: the repository root = the parent of tests/)
//        node tests/run_all.mjs [site_dir] --json  (machine-readable summary)
// exit code: 0 = all PASS, 1 = at least one FAIL, 2 = bad usage.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const asJson = args.includes('--json');
const site = path.resolve(args.find(a => !a.startsWith('--')) || path.join(here, '..'));
if (!fs.existsSync(path.join(site, 'index.html'))) { console.error('not a Chronicle site tree (index.html missing): ' + site); process.exit(2); }

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail: detail || '' }); };
const read = f => fs.readFileSync(path.join(site, f), 'utf8');

// ---------- 1. script tags (HTML comments excluded; same rule as docs/FIX_INDEX.md appendix A) ----------
function scripts(html) {
  const out = [];
  let i = 0;
  while (i < html.length) {
    if (html.startsWith('<!--', i)) { const j = html.indexOf('-->', i + 4); i = j < 0 ? html.length : j + 3; continue; }
    if (html.startsWith('<script', i) && /[\s>]/.test(html[i + 7] || '')) {
      const gt = html.indexOf('>', i), end = html.indexOf('</script>', gt);
      const tag = html.slice(i, gt + 1), m = tag.match(/\bsrc=["']([^"']+)["']/);
      if (m) { const src = m[1]; out.push({ file: src.split('?')[0], cb: (src.split('cb=')[1] || '') }); }
      i = end < 0 ? html.length : end + 9; continue;
    }
    i++;
  }
  return out;
}
const pages = {};
for (const p of ['index.html', 'home.html']) pages[p] = fs.existsSync(path.join(site, p)) ? scripts(read(p)) : null;
check('home.html exists', pages['home.html'] !== null);

const local = s => !/^https?:\/\//.test(s.file) && !s.file.startsWith('//');
const loaded = new Set();
for (const [p, list] of Object.entries(pages)) {
  if (!list) continue;
  const files = list.filter(local).map(s => s.file);
  files.forEach(f => loaded.add(f));
  const missing = files.filter(f => !fs.existsSync(path.join(site, f)));
  check(`${p}: every <script src> file exists (${files.length})`, missing.length === 0, missing.join(', '));
  const dup = files.filter((f, k) => files.indexOf(f) !== k);
  check(`${p}: no file loaded twice`, dup.length === 0, dup.join(', '));
  const html = files.filter(f => fs.existsSync(path.join(site, f)) && /^\s*<(!doctype|html)/i.test(fs.readFileSync(path.join(site, f), 'utf8').slice(0, 200)));
  check(`${p}: no loaded .js is actually HTML (SPA-fallback copy)`, html.length === 0, html.join(', '));
  check(`${p}: the Vault send gate is the first script`, files[0] === 'v292Dvault2-sendgate.js', files[0]);
}

// ---------- 2. version label consistency (version.txt == BUILT in index.html == home build label) ----------
const ver = fs.existsSync(path.join(site, 'version.txt')) ? read('version.txt').trim() : '';
check('version.txt is present and non-empty', !!ver, ver);
const idx = read('index.html'), home = pages['home.html'] ? read('home.html') : '';
check('index.html contains the version label', !!ver && idx.includes(ver), ver);
check('home.html contains the version label', !!ver && home.includes(ver), ver);

// ---------- 3. syntax of every loaded .js (node --check) ----------
const bad = [];
for (const f of [...loaded].sort()) {
  const r = spawnSync(process.execPath, ['--check', path.join(site, f)], { encoding: 'utf8' });
  if (r.status !== 0) bad.push(f + ': ' + (r.stderr || '').split('\n').find(l => /Error/.test(l)));
}
check(`syntax: node --check over ${loaded.size} loaded .js files`, bad.length === 0, bad.slice(0, 5).join(' | '));

// ---------- 4. unit: EDIT-01 reconcile() on a synthetic turn ----------
try {
  const require = createRequire(import.meta.url);
  const f = path.join(site, 'v292DfixEDIT01-edit-reconcile.js');
  const api = require(f);
  const turn = { inputType: 'DO', _convSays: [{ who: 'A', say: 'こんにちは、旅の人' }, { who: 'B', say: 'ここは危ない' }] };
  const old = 'Aは笑った。「こんにちは、旅の人」\nBが言う。「ここは危ない」';
  const same = api.reconcile(turn, old, { oldNarr: old });
  check('EDIT-01: unchanged text keeps every card', same.changed === false && same.kept === 2 && same.dropped.length === 0, JSON.stringify({ changed: same.changed, kept: same.kept }));
  const cut = api.reconcile(turn, 'Aは笑った。「こんにちは、旅の人」', { oldNarr: old });
  check('EDIT-01: a line removed from the text drops only its card', cut.changed === true && cut.kept === 1 && cut.dropped.length === 1 && cut.says.length === 1 && cut.says[0].who === 'A', JSON.stringify({ kept: cut.kept, dropped: cut.dropped.length }));
} catch (e) {
  check('EDIT-01: module loads in node', false, String(e && e.message || e).slice(0, 160));
}

// ---------- report ----------
const fail = results.filter(r => !r.ok);
const summary = { site, version: ver, loaded_js: loaded.size, pass: results.length - fail.length, fail: fail.length, results };
if (asJson) console.log(JSON.stringify(summary, null, 1));
else {
  for (const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.detail && !r.ok ? '  -> ' + r.detail : ''));
  console.log(`\n${summary.pass} PASS / ${summary.fail} FAIL  (version ${ver}, ${loaded.size} loaded .js)`);
}
process.exit(fail.length ? 1 : 0);
