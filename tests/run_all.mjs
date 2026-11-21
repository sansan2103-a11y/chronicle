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

// ★MEMTALLY・MEMTRIAL（GPT #127-WF (3)）: 記憶の試験（5〜9）のサンドボックスに、試用の間だけの条件が見る Owner の /auth/me の答え（fix893 serverMe）を置く。
//   fix135 だけを読む試験には、条件の 1 か所（MEM2 の __v292DfixMEMTrial）が無いので、Owner と同じ答えを返す置き換えを置く（MEM2 を読む試験では MEM2 の本物が上書きする）。本物の条件は 10 の項目と t_memtally.cjs で見る。
const __mtOwner = (sb) => { const me = { accountId: 'acc1', entitlement: 'owner', status: 'active' }; if (!sb.__v292Dfix893) sb.__v292Dfix893 = { me: () => me, serverMe: () => me }; if (!sb.__v292DfixMEMTrial) sb.__v292DfixMEMTrial = { ok: () => true }; };
// ---------- 5. unit: MEM2 (long-term memory wiring, default OFF) on synthetic data ----------
try {
  const vm = (await import('node:vm')).default;
  const mk = (withMem2, ls, opt) => {
    const L = new Map(Object.entries(ls || {}));
    const P = { _extensions: [], _userExtensions: [], _parseExtensions: [] };
    const sb = { console: { log() {}, warn() {} }, setTimeout: () => 0, setInterval: () => 0, clearTimeout() {}, JSON, Math, Date,
      localStorage: { getItem: k => L.has(k) ? L.get(k) : null, setItem: (k, v) => L.set(k, String(v)), removeItem: k => L.delete(k) } };
    sb.window = sb; sb.Planner = P; vm.createContext(sb); __mtOwner(sb);
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
    sb.window = sb; vm.createContext(sb); __mtOwner(sb); sb.__CHR_MODEL_REGISTRY = { primary: () => 'm/x' };
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
    sb.window = sb; sb.Planner = P; vm.createContext(sb); __mtOwner(sb); sb.__chronicleDocumentStoryKey = 'chr6_slot_r4'; sb.__v292Dfix246 = 1; sb.__v292Dfix697 = { status: () => ({ storyId: 'r4' }) };
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
    sb.window = sb; vm.createContext(sb); __mtOwner(sb); sb.__CHR_MODEL_REGISTRY = { primary: () => 'm/x' }; sb.S = { turns: [0, 1, 2].map(i => ({ playerText: 'p', narrative: 'n' + i })), scene: { loc: 'x' } };
    vm.runInContext(read('v292Dfix135-longmem.js'), sb); sb.__longmem.rebuild(); const pr = JSON.parse(sent[0]).messages[0].content;
    check('MEM3 r5 (wording r7): the rebuild prompt keeps the protagonist-feelings criterion (not 確定 unless established; a guess goes in 未定) and one part per matter (if unsure, 未定)', /the protagonist\'s feelings the text has not established \(a guess goes in 未定\)/.test(pr) && /Each matter goes in one part only; if unsure, 未定/.test(pr) && !/Do not decide the protagonist/.test(pr), ''); }
} catch (e) {
  check('MEM3 r4: fixtures run in node', false, String(e && e.stack || e).slice(0, 200));
}

// ---------- 8. unit: MEM3 r7 (settings excerpt without GM/secret parts, nothing for Vault stories), default OFF ----------
try {
  const vm = (await import('node:vm')).default;
  const lm7 = (ls, hidden) => { const L = new Map(Object.entries(Object.assign({ chr6: JSON.stringify({ cfg: { orKey: 'k' } }), v292DfixLORE1On: '1' }, ls))); const sent = [];
    const sb = { console: { log() {}, warn() {} }, setTimeout: () => 0, setInterval: () => 0, JSON, Math, Date, XMLHttpRequest: class { open() {} setRequestHeader() {} send(b) { sent.push(b); } }, addEventListener() {}, document: { hidden: false, addEventListener() {}, readyState: 'complete' },
      localStorage: { getItem: k => L.has(k) ? L.get(k) : null, setItem: (k, v) => L.set(k, String(v)), removeItem: k => L.delete(k) } };
    sb.window = sb; vm.createContext(sb); __mtOwner(sb); sb.__CHR_MODEL_REGISTRY = { primary: () => 'm/x' }; sb.__v292Dfix697 = { status: () => ({ storyId: 'r7s' }) }; sb.__v292Dfix889 = { isHidden: () => !!hidden }; sb.__f379reg = [];
    sb.S = { turns: [0, 1, 2].map(i => ({ playerText: 'p', narrative: 'n' + i })), scene: { loc: 'x', lore: '離島の診療所。鍵はよろず屋の千代が預かる。\n【GM専用】千代は昔の院長の娘で、地下室の鍵も持っている。\nただしこの世界の底には、死者は潮とともに戻る——という隠された理がある。' }, cast: { hero: { name: '朔也', desc: '新任の医師' }, npcs: [{ name: '千代', desc: 'よろず屋の店主。\nGM: 実は院長殺しの犯人。' }, { name: '茂', desc: '漁師。実は千代の兄。無口' }] } };
    vm.runInContext(read('v292DfixLORE1-world-lore.js'), sb); vm.runInContext(read('v292Dfix135-longmem.js'), sb); sb.__longmem.rebuild(); return { p: JSON.parse(sent[0]).messages[0].content, sb }; };
  const on = lm7({ v292DfixMEM3On: '1' }), hid = lm7({ v292DfixMEM3On: '1' }, true), off = lm7({});
  check('MEM3 r7 (r9: no cast lines at all): settings excerpt drops GM sections, cast descriptions, 実は… sentences and the omakase hidden-law sentence; nothing for a Vault-hidden story; off has no block', /- 世界: 離島の診療所。鍵はよろず屋の千代が預かる。/.test(on.p) && !/院長の娘|地下室|犯人|潮とともに|隠された理|千代の兄/.test(on.p) && !/- 千代:|- 茂:|よろず屋の店主|漁師。無口/.test(on.p) && !/ESTABLISHED SETTINGS \(the story setup/.test(hid.p) && hid.sb.__v292DfixMEM3.stats().lastSettings === 0 && !/ESTABLISHED SETTINGS/.test(off.p), on.p.slice(on.p.indexOf('ESTABLISHED SETTINGS ('), on.p.indexOf('ESTABLISHED SETTINGS (') + 160));
} catch (e) {
  check('MEM3 r7: fixtures run in node', false, String(e && e.stack || e).slice(0, 200));
}

// ---------- 8b. unit: MEM3 r9 (only the public lore is passed — no cast descriptions; output copying lore text absent from the story is dropped from worldinfo desc and summary 確定 only), default OFF ----------
try {
  const vm = (await import('node:vm')).default;
  const SECRETS = ['裏設定：真犯人は千代。', '【秘密】真犯人は千代。', '【真相】千代は既に死んでいる。', 'プレイヤーには秘密だが、千代は亡霊である。'];
  const NSEC = ['千代は朔也の生みの母。', '表向きは店主、裏では密売人。', '店主で、実は朔也の実母。', '本当は朔也の実母。', '正体は十年前に死んだ娘。', '朔也の実母であることを隠している。', '（秘密）朔也の実母。'];
  const run9 = async () => { const L = new Map(Object.entries({ chr6: JSON.stringify({ cfg: { orKey: 'k' } }), v292DfixMEM3On: '1', v292DfixLORE1On: '1' })); let prompt = '';
    class XHR { open() {} setRequestHeader() {} send(b) { prompt = JSON.parse(b).messages[0].content; const set = (prompt.match(/ESTABLISHED SETTINGS \(the story setup[^\n]*\n((?:- [^\n]*\n)+)/) || [, ''])[1].split('\n').filter(Boolean).map(l => l.slice(l.indexOf(': ') + 2));
      const echo = set;   /* 抽出 AI が、見えた設定の要点をそのまま書き写した場合（最悪の形）を真似る */ const out = { summary: '確定：' + echo.join('') + '朔也は診療所に着いた。', worldinfo: [{ name: '千代', type: 'character', desc: 'よろず屋の店主。' + echo.join('') }], events: echo.map((e, i) => ({ turnIdx: 1, event: e, importance: 2 })).concat([{ turnIdx: 2, event: '朔也が診療所の鍵を受け取った', importance: 2 }]) };
      const self = this; Promise.resolve().then(() => { self.status = 200; self.responseText = JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) } }] }); self.onload(); }); } }
    const sb = { console: { log() {}, warn() {} }, setTimeout: () => 0, setInterval: () => 0, JSON, Math, Date, Promise, XMLHttpRequest: XHR, addEventListener() {}, document: { hidden: false, addEventListener() {}, readyState: 'complete' },
      localStorage: { getItem: k => L.has(k) ? L.get(k) : null, setItem: (k, v) => L.set(k, String(v)), removeItem: k => L.delete(k) } };
    sb.window = sb; vm.createContext(sb); __mtOwner(sb); sb.__CHR_MODEL_REGISTRY = { primary: () => 'm/x' }; sb.__v292Dfix697 = { status: () => ({ storyId: 'r8s' }) }; sb.__v292Dfix889 = { isHidden: () => false }; sb.__f379reg = [];
    sb.S = { turns: [0, 1, 2].map(i => ({ playerText: 'p', narrative: '朔也は診療所に着いた。千代が診療所の鍵を渡した。' })), scene: { loc: 'x', lore: '離島の診療所。地下室の鍵は井戸の底に沈んでいる。' + SECRETS.join('\n') }, cast: { hero: { name: '朔也', desc: '新任の医師' }, npcs: [{ name: '千代', desc: 'よろず屋の店主。' + NSEC.join('') }] } };
    vm.runInContext(read('v292DfixLORE1-world-lore.js'), sb); vm.runInContext(read('v292Dfix135-longmem.js'), sb); sb.__longmem.rebuild(); for (let i = 0; i < 6; i++) await new Promise(r => setTimeout(r, 2));
    return { prompt, L, saved: [L.get('chr6_v292Dfix135_sum'), L.get('chr6_v292Dfix136_wi'), L.get('chr6_v292Dfix137_ev')].join('\n'), st: sb.__v292DfixMEM3.stats() }; };
  const r = await run9();
  const leak9 = /真犯人|既に死んで|亡霊|実母|十年前に死んだ|隠している/, leak = /真犯人|既に死んで|亡霊|実母|十年前に死んだ|隠している|井戸の底/;
  const setPart = r.prompt.slice(r.prompt.indexOf('ESTABLISHED SETTINGS ('), r.prompt.indexOf('NEW TURNS:')); const sum = r.L.get('chr6_v292Dfix135_sum') || '', wi = r.L.get('chr6_v292Dfix136_wi') || '', ev = r.L.get('chr6_v292Dfix137_ev') || '';
  check('MEM3 r9: no cast description is passed (only the public lore); marked secrets are not passed; lore text absent from the story is dropped from worldinfo desc and summary 確定 only (events kept and counted); story facts stay', !leak9.test(setPart) && !/生みの母|密売人|よろず屋|新任の医師|- 千代|- 朔也/.test(setPart) && /- 世界: 離島の診療所。地下室の鍵は井戸の底/.test(setPart) && !/井戸の底/.test(sum) && !/井戸の底/.test(wi) && /"name":"千代"/.test(wi) && /よろず屋の店主/.test(wi) && /朔也は診療所に着いた/.test(sum) && /朔也が診療所の鍵を受け取った/.test(ev) && /井戸の底/.test(ev) && r.st.filtered.events === 0 && r.st.seenKept.events >= 1 && r.st.filtered.worldinfo >= 1 && r.st.filtered.summary >= 1, JSON.stringify([r.st.filtered, r.st.seenKept]));
} catch (e) {
  check('MEM3 r9: fixtures run in node', false, String(e && e.stack || e).slice(0, 200));
}

// ---------- 8c. unit: MEM3 r10 (settings only while LORE1 actually sends the lore; normalization ignores punctuation/brackets/quotes), default OFF ----------
try {
  const vm = (await import('node:vm')).default;
  const run10 = async (ls, lore, narr, out) => { const L = new Map(Object.entries(Object.assign({ chr6: JSON.stringify({ cfg: { orKey: 'k' } }), v292DfixMEM3On: '1' }, ls))); let prompt = '';
    class XHR { open() {} setRequestHeader() {} send(b) { prompt = JSON.parse(b).messages[0].content; const self = this; Promise.resolve().then(() => { self.status = 200; self.responseText = JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) } }] }); self.onload(); }); } }
    const sb = { console: { log() {}, warn() {} }, setTimeout: () => 0, setInterval: () => 0, JSON, Math, Date, Promise, XMLHttpRequest: XHR, addEventListener() {}, document: { hidden: false, addEventListener() {}, readyState: 'complete' },
      localStorage: { getItem: k => L.has(k) ? L.get(k) : null, setItem: (k, v) => L.set(k, String(v)), removeItem: k => L.delete(k) } };
    sb.window = sb; vm.createContext(sb); __mtOwner(sb); sb.__CHR_MODEL_REGISTRY = { primary: () => 'm/x' }; sb.__v292Dfix697 = { status: () => ({ storyId: 'r10s' }) }; sb.__v292Dfix889 = { isHidden: () => false }; sb.__f379reg = [];
    sb.S = { turns: [0, 1, 2].map(i => ({ playerText: 'p', narrative: narr })), scene: { loc: 'x', lore }, cast: { hero: { name: '朔也' }, npcs: [] } };
    vm.runInContext(read('v292DfixLORE1-world-lore.js'), sb); vm.runInContext(read('v292Dfix135-longmem.js'), sb); sb.__longmem.rebuild(); for (let i = 0; i < 6; i++) await new Promise(r => setTimeout(r, 2));
    return { prompt, L, st: sb.__v292DfixMEM3.stats() }; };
  const out = { summary: '確定：図書館は夜九時に閉まる。', worldinfo: [{ name: '図書館', type: 'place', desc: '夜九時に閉まる。' }], events: [] };
  const sh = await run10({}, '図書館は夜九時に閉まる。', '司書が「図書館は夜九時に閉まるよ」と言った。', out);
  const on = await run10({ v292DfixLORE1On: '1' }, '図書館は夜九時に閉まる。', '司書が「図書館は夜九時に閉まるよ」と言った。', out);
  check('MEM3 r10: no settings while LORE1 is in shadow mode (reason LORE1_SHADOW); with LORE1 on, a public fact said as 閉まるよ in the story is kept in 確定 and worldinfo (punctuation-insensitive match)', !/ESTABLISHED SETTINGS \(the story setup/.test(sh.prompt) && sh.st.lastSettingsWhy === 'LORE1_SHADOW' && sh.st.skipWhy.LORE1_SHADOW === 1 && /- 世界: 図書館は夜九時に閉まる。/.test(on.prompt) && /図書館は夜九時に閉まる/.test(on.L.get('chr6_v292Dfix135_sum') || '') && /夜九時に閉まる/.test(on.L.get('chr6_v292Dfix136_wi') || '') && on.st.filtered.summary === 0 && on.st.filtered.worldinfo === 0, JSON.stringify([sh.st.lastSettingsWhy, on.st.filtered]));
} catch (e) {
  check('MEM3 r10: fixtures run in node', false, String(e && e.stack || e).slice(0, 200));
}

// ---------- 9. unit: MEM4 r5 (r5: a stamp that no longer describes the memory is removed with its sequence row while untrusted; r4: r4: the story check also compares the turn count and the last turn; memory provenance stamp, plan A; trust only an observed fix135 rebuild of this story saved as intended; per-device version sequence), default OFF ----------
try {
  const vm = (await import('node:vm')).default;
  const boot = (L, acct) => { const Pl = { _extensions: [], _userExtensions: [], _parseExtensions: [] };
    const sb = { console: { log() {}, warn() {} }, setTimeout: () => 0, setInterval: () => 0, clearTimeout() {}, JSON, Math, Date, Uint8Array, crypto: { getRandomValues: (a) => { for (let i = 0; i < a.length; i++) a[i] = (i * 37 + 11) & 255; return a; } },
      localStorage: { getItem: k => L.has(k) ? L.get(k) : null, setItem: (k, v) => L.set(k, String(v)), removeItem: k => L.delete(k) } };
    const TT = Array.from({ length: 6 }, (_, i) => ({ inputType: 'DO', playerText: 'p', narrative: 'n' + i }));
    sb.window = sb; sb.Planner = Pl; vm.createContext(sb); __mtOwner(sb); sb.S = { turns: TT, scene: { loc: '店' }, cast: { hero: { name: 'h' }, npcs: [] } }; sb.__chronicleDocumentStoryKey = 'chr6_slot_m4s'; sb.__v292Dfix246 = 1; sb.__v292Dfix697 = { status: () => ({ storyId: 'm4s' }) }; sb.__v292Dfix893 = { me: () => (acct ? { accountId: acct, entitlement: 'owner', status: 'active' } : null), serverMe: () => (acct ? { accountId: acct, entitlement: 'owner', status: 'active' } : null) };   /* ★MEMTRIAL: Owner の答え */
    vm.runInContext(read('v292DfixMEM2-longmem-wire.js'), sb); vm.runInContext(read('v292Dfix58-prompt-rebuild.js'), sb);
    const st = sb.S;
    return { sb, send: () => JSON.parse(Pl._userExtensions[Pl._userExtensions.length - 1]({ user: JSON.stringify({ currentInput: { type: 'DO', text: 'x' }, storySoFar: 'y' }), state: st })) }; };
  const MEM = (sum, lb) => ({ 'chr6_v292Dfix135_sum_slot_m4s': sum || '凪は港に着いた。', 'chr6_v292Dfix137_ev_slot_m4s': JSON.stringify([{ turnIdx: 2, importance: 3, event: '鍵を受け取った' }]), 'chr6_v292Dfix135_last_slot_m4s': String(lb || 2) });
  const put = (L, m) => { for (const k of Object.keys(m)) L.set(k, m[k]); };
  const fin = (s, L, m) => { put(L, m); s.sb.__v292DfixMEM4Done({ sfx: '_slot_m4s', loc: '店', lb: +m['chr6_v292Dfix135_last_slot_m4s'], ok: true, r: { summary: m['chr6_v292Dfix135_sum_slot_m4s'], worldinfo: [], events: JSON.parse(m['chr6_v292Dfix137_ev_slot_m4s']) } }); };   /* fix135 が保存の直後に知らせるのと同じ順 */
  const ON = { chr6_slot_m4s: JSON.stringify({ scene: { loc: '店' }, turns: Array.from({ length: 6 }, (_, i) => ({ inputType: 'DO', playerText: 'p', narrative: 'n' + i })) }), v292DfixMEM2aOn: '1', v292DfixMEM4On: '1' };
  const L = new Map(Object.entries(ON)); const s1 = boot(L, 'acc1'); fin(s1, L, MEM()); const o1 = s1.send();
  const s2 = boot(L, 'acc1'); const o2 = s2.send();
  check('MEM4: an observed fix135 rebuild from empty is stamped; after a reload the stamp verifies and the notes are sent', !!o1.memoryNotes && L.has('v292DfixMEM4_slot_m4s') && L.has('v292DfixMEM4Seq') && !!o2.memoryNotes && s2.sb.__v292DfixMEM2.stats().m4.counts.verified === 1, JSON.stringify(s2.sb.__v292DfixMEM2.stats().m4));
  const LA = new Map(Object.entries(ON)); const sa = boot(LA, 'acc1'); sa.send(); put(LA, MEM()); const oa = sa.send();
  check('MEM4 r2 (leak A): memory written after the empty state without a fix135 completion signal (restore / another tab) is not trusted (M4_UNSEEN_WRITER), no stamp', !oa.memoryNotes && sa.sb.__v292DfixMEM2.stats().a.skip.M4_UNSEEN_WRITER === 1 && !LA.has('v292DfixMEM4_slot_m4s'), '');
  const LB = new Map(Object.entries(ON)); const sb1 = boot(LB, 'acc1'); fin(sb1, LB, MEM()); sb1.send(); const snap = new Map([...LB].filter(([k]) => /_slot_m4s$/.test(k) && k !== 'chr6_slot_m4s'));
  fin(sb1, LB, MEM('二回目', 5)); sb1.send(); fin(sb1, LB, MEM('三回目', 8)); sb1.send(); for (const [k, v] of snap) LB.set(k, v); const sb2 = boot(LB, 'acc1'); const ob = sb2.send();
  check('MEM4 r2 (leak B): a snapshot restored to the same slot (old memory + old stamp) after two rebuilds is not trusted after a reload (M4_SEQ_MISMATCH)', !ob.memoryNotes && sb2.sb.__v292DfixMEM2.stats().a.skip.M4_SEQ_MISMATCH === 1, JSON.stringify(sb2.sb.__v292DfixMEM2.stats().a.skip));
  const L3 = new Map(Object.entries(Object.assign({}, ON, MEM()))); const s3 = boot(L3, 'acc1'); const o3 = s3.send();
  check('MEM4: memory already present without a stamp (e.g. moved from the shared chr6 keys by fix246) is not sent (M4_NO_STAMP)', !o3.memoryNotes && s3.sb.__v292DfixMEM2.stats().a.skip.M4_NO_STAMP === 1, '');
  const L4 = new Map(L); L4.set('chr6_v292Dfix135_sum_slot_m4s', '別の中身'); const o4 = boot(L4, 'acc1').send();
  const L5 = new Map(L); const o5 = boot(L5, 'acc2').send();
  const L6 = new Map(L); L6.set('v292DfixMEM4Dev', 'ffffffffffffffffffffffff'); const o6 = boot(L6, 'acc1').send();
  check('MEM4: hash mismatch / another account / another device id are not sent', !o4.memoryNotes && !o5.memoryNotes && !o6.memoryNotes, '');
  const L0 = new Map(Object.entries(Object.assign({}, ON, { v292DfixMEM4On: '0' }))); const s0 = boot(L0, 'acc1'); fin(s0, L0, MEM()); const o0 = s0.send();
  check('MEM4: off — no stamp, device id or sequence key is written even with a completion signal; the notes follow MEM2 r3 (memory built during this page is sent)', !L0.has('v292DfixMEM4_slot_m4s') && !L0.has('v292DfixMEM4Dev') && !L0.has('v292DfixMEM4Seq') && !!o0.memoryNotes && !s0.sb.__v292DfixMEM2.stats().m4, '');
  check('MEM4 r2/r3: fix135 signals completion only after its saves (one line after saveLastBuild, passing the result it tried to save)', /saveLastBuild\(curTurn\);\n      try \{ var m4h = window\.__v292DfixMEM4Done; if \(typeof m4h === 'function'\) m4h\(\{ sfx: startSfx, loc: startLoc, lb: curTurn, ok: _lmCanSave\(\), r: result \}\); \} catch\(_\)\{\}/.test(read('v292Dfix135-longmem.js')), '');
  { const LO = new Map(Object.entries(Object.assign({}, ON, { chr6_slot_m4s: JSON.stringify({ scene: {}, turns: [{ narrative: '別の物語' }] }) }))); const so = boot(LO, 'acc1'); so.send(); fin(so, LO, MEM()); const oo = so.send();
    const LP = new Map(Object.entries(ON)); const sp = boot(LP, 'acc1'); sp.send(); put(LP, MEM()); sp.sb.__v292DfixMEM4Done({ sfx: '_slot_m4s', loc: '店', lb: 2, ok: true, r: { summary: '保存しようとした別の版', worldinfo: [], events: [] } }); const op = sp.send();
    check('MEM4 r3 (#127-VX 2/3): a signal whose story does not match the slot body (first turn differs) or whose result was not saved as intended is not used (M4_NOTIFY_OTHER_STORY / M4_NOTIFY_PARTIAL_SAVE), no stamp', !oo.memoryNotes && so.sb.__v292DfixMEM2.stats().a.skip.M4_NOTIFY_OTHER_STORY === 1 && !LO.has('v292DfixMEM4_slot_m4s') && !op.memoryNotes && sp.sb.__v292DfixMEM2.stats().a.skip.M4_NOTIFY_PARTIAL_SAVE === 1 && !LP.has('v292DfixMEM4_slot_m4s'), ''); }
  { const t7 = Array.from({ length: 5 }, (_, i) => ({ inputType: 'DO', playerText: 'p', narrative: 'n' + i })); const LR = new Map(Object.entries(Object.assign({}, ON, { chr6_slot_m4s: JSON.stringify({ scene: {}, turns: t7 }) }))); const sr = boot(LR, 'acc1'); sr.send(); fin(sr, LR, MEM()); const or = sr.send();
    const t8 = Array.from({ length: 6 }, (_, i) => ({ inputType: 'DO', playerText: 'p', narrative: i === 5 ? '別の最後' : 'n' + i })); const LS = new Map(Object.entries(Object.assign({}, ON, { chr6_slot_m4s: JSON.stringify({ scene: {}, turns: t8 }) }))); const ss = boot(LS, 'acc1'); ss.send(); fin(ss, LS, MEM()); const os = ss.send();
    check('MEM4 r4: same first turn but a different turn count or a different last turn (two stories from the same start) is not used (M4_NOTIFY_OTHER_STORY), no stamp', !or.memoryNotes && sr.sb.__v292DfixMEM2.stats().a.skip.M4_NOTIFY_OTHER_STORY === 1 && !LR.has('v292DfixMEM4_slot_m4s') && !os.memoryNotes && ss.sb.__v292DfixMEM2.stats().a.skip.M4_NOTIFY_OTHER_STORY === 1 && !LS.has('v292DfixMEM4_slot_m4s'), ''); }
  { const LW = new Map(Object.entries(ON)); const sw = boot(LW, 'acc1'); fin(sw, LW, MEM()); sw.send(); const snap = new Map([...LW].filter(([k]) => /_slot_m4s$/.test(k) && k !== 'chr6_slot_m4s'));
    put(LW, MEM('認証されない版', 5)); sw.send(); put(LW, MEM('認証されない次の版', 8)); sw.send(); const gone = !LW.has('v292DfixMEM4_slot_m4s');
    for (const [k, v] of snap) LW.set(k, v); const sw2 = boot(LW, 'acc1'); const ow = sw2.send();
    check('MEM4 r5 (#127-VX 4/5): after unauthenticated rebuilds the stale stamp and its sequence row are removed; restoring the last authenticated snapshot is not trusted (M4_SEQ_UNKNOWN)', gone && !ow.memoryNotes && sw2.sb.__v292DfixMEM2.stats().a.skip.M4_SEQ_UNKNOWN === 1, JSON.stringify(sw2.sb.__v292DfixMEM2.stats().a.skip)); }
} catch (e) {
  check('MEM4: fixtures run in node', false, String(e && e.stack || e).slice(0, 200));
}

// ---------- 10. unit: MEMTALLY (per-day device counts, numbers only) and MEMTRIAL (trial-only owner condition, fail-closed), default OFF ----------
try {
  const vm = (await import('node:vm')).default;
  const boot = (L, me) => { const Pl = { _extensions: [], _userExtensions: [], _parseExtensions: [] };
    const sb = { console: { log() {}, warn() {} }, setTimeout: () => 0, setInterval: () => 0, clearTimeout() {}, JSON, Math, Date, Uint8Array, crypto: { getRandomValues: (a) => a },
      localStorage: { getItem: k => L.has(k) ? L.get(k) : null, setItem: (k, v) => L.set(k, String(v)), removeItem: k => L.delete(k) } };
    sb.window = sb; sb.Planner = Pl; vm.createContext(sb); sb.S = { turns: [0, 1, 2, 3].map(i => ({ inputType: 'DO', playerText: 'p', narrative: 'n' + i })), scene: { loc: '店' }, cast: { hero: { name: 'h' }, npcs: [] } };
    sb.__chronicleDocumentStoryKey = 'chr6_slot_mt'; sb.__v292Dfix246 = 1; sb.__v292Dfix697 = { status: () => ({ storyId: 'mt' }) }; sb.__v292Dfix893 = { me: () => me, serverMe: () => me };
    vm.runInContext(read('v292DfixMEM2-longmem-wire.js'), sb); vm.runInContext(read('v292Dfix58-prompt-rebuild.js'), sb);
    return { sb, send: () => JSON.parse(Pl._userExtensions[Pl._userExtensions.length - 1]({ user: JSON.stringify({ currentInput: { type: 'DO', text: 'x' }, storySoFar: 'y' }), state: sb.S })) }; };
  const MEMK = { chr6_v292Dfix135_sum_slot_mt: '凪は港に着いた。', chr6_v292Dfix137_ev_slot_mt: JSON.stringify([{ turnIdx: 2, importance: 3, event: '鍵を受け取った' }]), chr6_v292Dfix135_last_slot_mt: '2' };
  const ON = { chr6_slot_mt: JSON.stringify({ scene: { loc: '店' }, turns: [0, 1, 2, 3].map(i => ({ inputType: 'DO', playerText: 'p', narrative: 'n' + i })) }), v292DfixMEM2aOn: '1' };
  const OWNER = { accountId: 'acc1', entitlement: 'owner', status: 'active' };
  const L = new Map(Object.entries(ON)); const a = boot(L, OWNER); a.send(); for (const k in MEMK) L.set(k, MEMK[k]); const o = a.send(); const t = L.get('v292DfixMEMTally') || '';
  check('MEMTALLY: the owner device adds per-day numbers at the event (one skip, one injection); no story id, account id or text in the key', !!o.memoryNotes && /"inj":1/.test(t) && /"NOT_BUILT_YET":1/.test(t) && !/mt|acc1|凪/.test(t.replace(/"skip"|"inj"/g, '')), t);
  const LU = new Map(Object.entries(ON)); const u = boot(LU, { accountId: 'acc9', entitlement: 'user', status: 'active' }); u.send(); for (const k in MEMK) LU.set(k, MEMK[k]); const ou = u.send();
  const LN = new Map(Object.entries(ON)); const n = boot(LN, null); n.send(); for (const k in MEMK) LN.set(k, MEMK[k]); const on = n.send();
  check('MEMTRIAL: with the keys ON in the same browser, a non-owner account or an unknown /auth/me answer gets no memory notes and no tally (fail-closed, reason counted)', !ou.memoryNotes && !LU.has('v292DfixMEMTally') && u.sb.__v292DfixMEMTrial.stats().a.NOT_OWNER === 2 && !on.memoryNotes && !LN.has('v292DfixMEMTally') && n.sb.__v292DfixMEMTrial.stats().a.NO_SERVER_ME === 2, '');
  const LK = new Map(Object.entries(Object.assign({}, ON, { v292DfixMEMTallyOff: '1' }))); const k = boot(LK, OWNER); k.send(); for (const kk in MEMK) LK.set(kk, MEMK[kk]); const ok2 = k.send();
  check('MEMTALLY: kill v292DfixMEMTallyOff — notes still work, the tally key is never written', !!ok2.memoryNotes && !LK.has('v292DfixMEMTally'), '');
} catch (e) {
  check('MEMTALLY: fixtures run in node', false, String(e && e.stack || e).slice(0, 200));
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
