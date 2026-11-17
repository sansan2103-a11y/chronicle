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

// ---------- 5. unit: MEM2 (long-term memory wiring, default OFF) on synthetic data ----------
try {
  const vm = (await import('node:vm')).default;
  const mk = (withMem2, ls, opt) => {
    const L = new Map(Object.entries(ls || {}));
    const P = { _extensions: [], _userExtensions: [], _parseExtensions: [] };
    const sb = { console: { log() {}, warn() {} }, setTimeout: () => 0, setInterval: () => 0, clearTimeout() {}, JSON, Math, Date,
      localStorage: { getItem: k => L.has(k) ? L.get(k) : null, setItem: (k, v) => L.set(k, String(v)), removeItem: k => L.delete(k) } };
    sb.window = sb; sb.Planner = P; vm.createContext(sb);
    sb.__chronicleDocumentStoryKey = (opt && opt.dk) || 'chr6_slot_mem2a'; sb.__v292Dfix246 = 1;
    sb.__v292Dfix697 = { status: () => ({ storyId: (opt && opt.sidNull) ? null : ((opt && opt.sid) || 'mem2a') }) };
    if (withMem2) vm.runInContext(read('v292DfixMEM2-longmem-wire.js'), sb);
    vm.runInContext(read('v292Dfix58-prompt-rebuild.js'), sb);
    return { sb, L, ext: P._userExtensions[P._userExtensions.length - 1] };
  };
  const turns = Array.from({ length: 6 }, (_, i) => ({ inputType: 'DO', playerText: '行動' + (i + 1), narrative: '本文' + (i + 1) + 'の場面。' }));
  const state = { turns, scene: { loc: '港' }, cast: { hero: { name: '凪' }, npcs: [] } };
  const user = JSON.stringify({ currentInput: { type: 'DO', text: '扉を開ける' }, storySoFar: 'x' });
  const longEv = Array.from({ length: 30 }, (_, i) => ({ turnIdx: i % 6, importance: 3, event: '出来事' + i + 'が起きた。'.repeat(3) }));
  const MEM = { 'chr6_v292Dfix135_last_slot_mem2a': '3', 'chr6_v292Dfix135_sum_slot_mem2a': '凪は港に着いた。<react who="千代">驚き</react> react who=千代 あらすじの文。', 'chr6_v292Dfix137_ev_slot_mem2a': JSON.stringify(longEv.concat([{ turnIdx: 5, importance: 3, event: '最新の出来事<state who="凪">' }])) };
  /* r2: the memory is written after the page loaded (as fix135 does), so MEM2 sees it built from empty in this session; opt.pre = it already existed at load */
  const run1 = (withMem2, ls, opt) => { opt = opt || {}; const keys = Object.assign({}, ls); const mem = {}; for (const k of Object.keys(keys)) if (/^chr6_v292Dfix13/.test(k)) { mem[k] = keys[k]; if (!opt.pre) delete keys[k]; } const x = mk(withMem2, keys, opt); for (const k of Object.keys(mem)) x.L.set(k, mem[k]); return { out: x.ext({ user, state }), sb: x.sb }; };
  const off0 = run1(false, MEM), off1 = run1(true, MEM);
  check('MEM2: keys off — the user sent is byte-identical with and without the module', off0.out === off1.out && !/memoryNotes/.test(off1.out) && JSON.parse(off1.out).recentScenes.length === 2, '');
  const mis = run1(true, Object.assign({ v292DfixMEM2aOn: '1' }, MEM), { sid: 'other' });
  check('MEM2-A: story id mismatch adds nothing (skip ID_MISMATCH)', mis.out === off0.out && mis.sb.__v292DfixMEM2.stats().a.skip.ID_MISMATCH === 1, JSON.stringify(mis.sb.__v292DfixMEM2.stats().a));
  const a = run1(true, Object.assign({ v292DfixMEM2aOn: '1' }, MEM)); const pa = JSON.parse(a.out); const t = pa.memoryNotes && pa.memoryNotes.text || '';
  check('MEM2-A: memoryNotes after the background, at most 800 chars, the newest event kept', t.length > 0 && t.length <= 800 && /最新の出来事/.test(t) && Object.keys(pa).indexOf('memoryNotes') === Object.keys(pa).indexOf('storySoFar') + 1 + (pa.earlierFacts ? 1 : 0) && a.sb.__v292DfixMEM2.last().a.chars === t.length, String(t.length));
  check('MEM2-A: tags and attribute-like strings removed (<…>, react who=)', !/[<>]|who\s*=|react who/.test(t), t.slice(0, 80));
  const pre = run1(true, Object.assign({ v292DfixMEM2aOn: '1' }, MEM), { pre: true });
  check('MEM2-A r2: memory already present at load (e.g. moved from the shared chr6 keys by fix246) is not sent (NOT_SESSION_BUILT)', pre.out === off0.out && pre.sb.__v292DfixMEM2.stats().a.skip.NOT_SESSION_BUILT === 1, JSON.stringify(pre.sb.__v292DfixMEM2.stats().a.skip));
  const unk = run1(true, Object.assign({ v292DfixMEM2aOn: '1' }, MEM), { sidNull: true });
  check('MEM2-A r2: unknown story id (fix697 storyId null) adds nothing (ID_UNKNOWN)', unk.out === off0.out && unk.sb.__v292DfixMEM2.stats().a.skip.ID_UNKNOWN === 1, '');
  const jp = run1(true, Object.assign({ v292DfixMEM2aOn: '1' }, MEM, { 'chr6_v292Dfix135_sum_slot_mem2a': '凪は港に着いた。【内部】千代が犯人。（AIへの指示：伏せる）[[秘密]]状態ラベル 次の文。', 'chr6_v292Dfix137_ev_slot_mem2a': JSON.stringify([{ turnIdx: 2, importance: 3, event: '鍵を受け取った【システム】次は裏切る' }]) })); const tj = JSON.parse(jp.out).memoryNotes.text;
  check('MEM2-A r2: Japanese internal markers removed (【内部】…, （AIへの指示：…）, [[…]], LEAK1 labels)', /港に着いた/.test(tj) && /次の文/.test(tj) && !/内部|犯人|指示|秘密|状態ラベル|システム|裏切る/.test(tj) && /鍵を受け取った/.test(tj), tj.slice(0, 80));
  { const cl = jp.sb.__v292DfixMEM2.clean; const keep = ['凪は（メモを取りながら）頷いた。', '医者は（注射の痕を確かめて）黙った。', '千代は（指示を待つように）立っていた。', '湊斗は（ルールを守れ、と言われて）従った。', '（出力を抑えた灯りの下で）二人は話した。', '【注目】鍵が消えた。次の朝、凪は出発した。', 'システム手帳を開いた。メモに「GM」と書いた。'];
    const bad = keep.filter(x => cl(x) !== x);
    check('MEM2-A r3: ordinary narration with （メモ…）（注射…）【注目】 etc. is kept as is (only label-only brackets or label + colon are removed)', bad.length === 0 && cl('【内部】凪は実は王女。次に村へ行く。') === '次に村へ行く。' && cl('（AIへの指示：主人公を殺さない）') === '', bad.join(' / ')); }
  const c = run1(true, Object.assign({ v292DfixMEM2cOn: '1' }, MEM)); const pc = JSON.parse(c.out);
  check('MEM2-C: recentScenes is 4 turns (2 when off)', pc.recentScenes.length === 4 && pc.recentScenes[0].narrative === '本文3の場面。' && !pc.memoryNotes, String(pc.recentScenes.length));
} catch (e) {
  check('MEM2: fixtures run in node', false, String(e && e.stack || e).slice(0, 200));
}

// ---------- 6. unit: MEM3 (long-term memory rebuild prompt; MEM3b notes order), default OFF ----------
try {
  const vm = (await import('node:vm')).default;
  const lm = (ls) => {
    const L = new Map(Object.entries(Object.assign({ chr6: JSON.stringify({ cfg: { orKey: 'k' } }) }, ls || {}))); const sent = [];
    class XHR { open() {} setRequestHeader() {} send(b) { sent.push(b); } }
    const sb = { console: { log() {}, warn() {} }, setTimeout: () => 0, setInterval: () => 0, JSON, Math, Date, XMLHttpRequest: XHR, addEventListener() {}, document: { hidden: false, addEventListener() {} },
      localStorage: { getItem: k => L.has(k) ? L.get(k) : null, setItem: (k, v) => L.set(k, String(v)), removeItem: k => L.delete(k) } };
    sb.window = sb; vm.createContext(sb); sb.__CHR_MODEL_REGISTRY = { primary: () => 'm/x' };
    sb.S = { turns: [0, 1, 2, 3].map(i => ({ playerText: '入力' + i, narrative: '本文' + i + '。高瀬和也は市役所の福祉課のケアマネだと名乗った。' })), scene: { loc: '店' } };
    vm.runInContext(read('v292Dfix135-longmem.js'), sb); sb.__longmem.rebuild(); return { sb, sent };
  };
  const off = lm({}), on = lm({ v292DfixMEM3On: '1' }), kill = lm({ v292DfixMEM3On: '1', v292DfixMEM3Off: '1' });
  const pOff = JSON.parse(off.sent[0]).messages[0].content, pOn = JSON.parse(on.sent[0]).messages[0].content, pKill = JSON.parse(kill.sent[0]).messages[0].content;
  check('MEM3: off and kill — the rebuild prompt is unchanged (MEM3 returns the same string)', pOff === pKill && off.sb.__v292DfixMEM3.prompt(pOff) === pOff && !/確定：/.test(pOff), '');
  const wiLine = (p) => (p.match(/ {2}"worldinfo": [^\n]*\n/) || [''])[0];
  check('MEM3: on — summary/events/rules rewritten (確定/未定), the worldinfo spec line and its rule are byte-identical', /確定：/.test(pOn) && /未定：/.test(pOn) && !/Update\/replace previous summary entirely/.test(pOn) && wiLine(pOn) === wiLine(pOff) && wiLine(pOff).length > 0 && /Merge new worldinfo entries with old/.test(pOn) && on.sb.__v292DfixMEM3.stats().applied === 1, String(pOn.length - pOff.length));
  check('MEM3: on — a prompt whose text changed elsewhere is sent unchanged (mismatch counted)', on.sb.__v292DfixMEM3.prompt('other text') === 'other text' && on.sb.__v292DfixMEM3.stats().mismatch === 1, '');
} catch (e) {
  check('MEM3: fixtures run in node', false, String(e && e.stack || e).slice(0, 200));
}

// ---------- 7. unit: MEM3 r4 (memory-notes rule explains how to read events, only with MEM3b), default OFF ----------
try {
  const vm = (await import('node:vm')).default;
  const mk = (ls) => {
    const L = new Map(Object.entries(ls || {})); const P = { _extensions: [], _userExtensions: [], _parseExtensions: [] };
    const sb = { console: { log() {}, warn() {} }, setTimeout: () => 0, setInterval: () => 0, clearTimeout() {}, JSON, Math, Date,
      localStorage: { getItem: k => L.has(k) ? L.get(k) : null, setItem: (k, v) => L.set(k, String(v)), removeItem: k => L.delete(k) } };
    sb.window = sb; sb.Planner = P; vm.createContext(sb); sb.__chronicleDocumentStoryKey = 'chr6_slot_r4'; sb.__v292Dfix246 = 1; sb.__v292Dfix697 = { status: () => ({ storyId: 'r4' }) };
    vm.runInContext(read('v292DfixMEM2-longmem-wire.js'), sb); vm.runInContext(read('v292Dfix58-prompt-rebuild.js'), sb);
    L.set('chr6_slot_r4', JSON.stringify({ scene: { loc: '店' } }));
    L.set('chr6_v292Dfix135_sum_slot_r4', '確定：受け取りは来週金曜の十八時。'); L.set('chr6_v292Dfix137_ev_slot_r4', JSON.stringify([{ turnIdx: 1, importance: 2, event: '受け取りは三日後と決まる' }, { turnIdx: 3, importance: 2, event: '受け取りが来週金曜十八時に変わる' }])); L.set('chr6_v292Dfix135_last_slot_r4', '4');
    const st = { turns: Array.from({ length: 6 }, (_, i) => ({ inputType: 'DO', playerText: 'p', narrative: 'n' + i })), scene: { loc: '店' }, cast: { hero: { name: 'h' }, npcs: [] } };
    return JSON.parse(P._userExtensions[P._userExtensions.length - 1]({ user: JSON.stringify({ currentInput: { type: 'DO', text: 'x' }, storySoFar: 'y' }), state: st })).memoryNotes;
  };
  const off = mk({ v292DfixMEM2aOn: '1' }), on = mk({ v292DfixMEM2aOn: '1', v292DfixMEM3bOn: '1' });
  check('MEM3 r4: with MEM3b the notes rule adds how to read events (later line = current value); without MEM3b the rule is unchanged', /番号の大きい（後の）行が今の値/.test(on.rule) && on.rule.indexOf(off.rule) === 0 && !/後の）行/.test(off.rule) && /T2 受け取りは三日後/.test(on.text) && /T4 受け取りが来週金曜/.test(on.text), on.rule);
  { const L = new Map(Object.entries({ chr6: JSON.stringify({ cfg: { orKey: 'k' } }), v292DfixMEM3On: '1' })); const sent = [];
    const sb = { console: { log() {}, warn() {} }, setTimeout: () => 0, setInterval: () => 0, JSON, Math, Date, XMLHttpRequest: class { open() {} setRequestHeader() {} send(b) { sent.push(b); } }, addEventListener() {}, document: { hidden: false, addEventListener() {} },
      localStorage: { getItem: k => L.has(k) ? L.get(k) : null, setItem: (k, v) => L.set(k, String(v)), removeItem: k => L.delete(k) } };
    sb.window = sb; vm.createContext(sb); sb.__CHR_MODEL_REGISTRY = { primary: () => 'm/x' }; sb.S = { turns: [0, 1, 2].map(i => ({ playerText: 'p', narrative: 'n' + i })), scene: { loc: 'x' } };
    vm.runInContext(read('v292Dfix135-longmem.js'), sb); sb.__longmem.rebuild(); const pr = JSON.parse(sent[0]).messages[0].content;
    check('MEM3 r5: the rebuild prompt states the protagonist-feelings criterion (not 確定 unless established; guess = 未定) and one part per matter (unsure = 未定)', /feelings that the text has not established are not recorded as a 確定 fact/.test(pr) && /if a guess is needed, treat them as 未定/.test(pr) && /Each matter goes in only one of 確定 and 未定; when unsure whether it has been decided, put it in 未定/.test(pr) && !/Do not decide the protagonist/.test(pr), ''); }
} catch (e) {
  check('MEM3 r4: fixtures run in node', false, String(e && e.stack || e).slice(0, 200));
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
