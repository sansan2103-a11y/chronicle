// Chronicle headless boot smoke (optional; needs Playwright). Public-safe:
// - serves the site tree from 127.0.0.1 only; EVERY request to another host is aborted (no Worker, no AI, no Google, no images)
// - fresh browser profile, no real saves, no keys, no cookies; the story id is a synthetic one that does not exist anywhere
// usage: node tests/smoke_browser.mjs [site_dir] [--browser=chromium|webkit]
// setup (once): npm i -D playwright && npx playwright install chromium webkit
// exit code: 0 = PASS, 1 = FAIL, 3 = Playwright not installed (skipped)
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const site = path.resolve(args.find(a => !a.startsWith('--')) || path.join(here, '..'));
const kind = ((args.find(a => a.startsWith('--browser=')) || '').split('=')[1]) || 'chromium';

let pw;
try { pw = createRequire(import.meta.url)('playwright'); }
catch (e) { console.log('SKIP: playwright is not installed (npm i -D playwright && npx playwright install chromium)'); process.exit(3); }

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(site, p === '/' ? 'home.html' : p);
  if (!f.startsWith(site) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const results = [];
const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail: detail || '' });
const browser = await pw[kind].launch();
const blocked = [];
try {
  for (const pg of [{ url: '/home.html', label: 'home.html' }, { url: '/index.html?story=smoke0000test', label: 'index.html' }]) {
    const ctx = await browser.newContext();
    await ctx.route('**/*', route => {
      const u = new URL(route.request().url());
      if (u.hostname === '127.0.0.1') return route.continue();
      blocked.push(u.hostname); return route.abort();
    });
    const page = await ctx.newPage();
    page.on('dialog', d => d.dismiss().catch(() => {}));
    const errors = [];
    page.on('pageerror', e => errors.push(String(e && e.message || e).slice(0, 120)));
    const resp = await page.goto(base + pg.url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(4000);
    check(`${pg.label}: loads (HTTP ${resp && resp.status()})`, resp && resp.status() === 200);
    const g = await page.evaluate(() => ({
      edit01: !!window.__v292DfixEDIT01,
      state: typeof window.__chronicleGetState === 'function',
      fix77: !!window.__v292Dfix77Active,
      body: document.body ? document.body.innerText.length : 0,
    }));
    check(`${pg.label}: page rendered some text`, g.body > 0, String(g.body));
    if (pg.label === 'index.html') {
      check('index.html: EDIT-01 installed (window.__v292DfixEDIT01)', g.edit01);
      check('index.html: state getter present (window.__chronicleGetState)', g.state);
      check('index.html: fix77 loaded (window.__v292Dfix77Active)', g.fix77);
    }
    // page errors are recorded, not failed: with every external request blocked some modules log failures by design.
    results.push({ name: `${pg.label}: uncaught page errors (recorded only)`, ok: true, detail: `${errors.length}${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`, info: true });
    await ctx.close();
  }
} finally { await browser.close(); server.close(); }

const fail = results.filter(r => !r.ok);
for (const r of results) console.log((r.info ? 'INFO ' : r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.detail && (!r.ok || r.info) ? '  -> ' + r.detail : ''));
console.log(`external requests blocked: ${blocked.length} (${[...new Set(blocked)].slice(0, 6).join(', ')})`);
console.log(`\n${results.length - fail.length} PASS / ${fail.length} FAIL  (${kind})`);
process.exit(fail.length ? 1 : 0);
