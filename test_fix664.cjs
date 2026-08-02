#!/usr/bin/env node
/* test_fix664.cjs — 「片付けの目標」と「この端末の実効容量」を分ける（仮想iPhone検証で発見）
 *
 * ■どうやって見つけたか
 *   sim_iphone_663.cjs（本番実データ＝クラウド242キー/1,617,587字・iPhone 571キー/2,479,000字・
 *   iOS上限2,621,440字）で本番 home.html を実走させたところ、同期チェーン自体は完走したが、
 *   容量判定が `f661TargetKB()`（既定2000KB＝**片付けの目標**）を実効容量として使っていた。
 *
 * ■なぜ危ないか
 *   ①使用量が 2000KB を超えているだけで「容量不足」と誤判定し、本当は普通に書ける場面でも
 *     自動put（1.3MBの送信）＋丸ごと控えの降格まで走ってしまう。
 *   ②逆に利用者が v292Dfix661TargetKB を大きくすると、実効容量より大きい目標になり
 *     pre-flight が永久に発火しなくなる（quota を踏むまで何もしない）。
 *
 * ■修正（fix664）
 *   実効容量 = iOS 5MiB(UTF-16)=2,621,440文字 − 安全余裕65,536。
 *   quota を実際に踏んだら、その実測値と既定の**小さい方**を採る。
 *   v292Dfix661TargetKB は「平時の片付けの目標」専用へ戻す（容量判定には使わない）。
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c){ pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

const HOME = read('home.html');
const MODULES = ['v292Dfix579-tombstone-schema.js', 'v292Dfix562-backup-inventory.js', 'v292Dfix564-snapshot.js',
                 'v292Dfix660-delete-gateway.js', 'v292Dfix660-backup-gc.js', 'v292Dfix658-lineage-shadow.js',
                 'v292Dfix587-story-lifecycle.js', 'v292Dfix590-commit-ledger.js'];

const IOS_CAP = 2621440, SAFETY = 65536, EFFECTIVE = IOS_CAP - SAFETY;
const SLOT = 'sms4np33eyg';
const KEY = 'chr6_slot_' + SLOT;
const DUMP = 'chr6_bk_cloudsync_1784942016123';   /* 実キーの形（13桁ts） */
const settle = async (n = 400) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };

function jsonOfChars(chars){
  const o = { d: '' };
  o.d = 'x'.repeat(Math.max(0, chars - JSON.stringify(o).length));
  return JSON.stringify(o).slice(0, chars);
}
function storyOfChars(turns, chars){
  const base = { turns: new Array(turns).fill(0).map((_, i) => ({ i, r: '' })) };
  let s = JSON.stringify(base);
  if (chars <= s.length) return s.slice(0, chars);
  base.turns[0].r = 'x'.repeat(chars - s.length);
  return JSON.stringify(base).slice(0, chars);
}
function mkLS(seed, cap){
  const store = Object.assign(Object.create(null), seed || {});
  const removed = [];
  const total = () => { let u = 0; for (const k in store) u += k.length + store[k].length; return u; };
  const api = {
    getItem(k){ return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v){
      v = String(v);
      let u = total();
      if (Object.prototype.hasOwnProperty.call(store, k)) u -= (k.length + store[k].length);
      if (cap && (u + k.length + v.length) > cap){ const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      store[k] = v;
    },
    removeItem(k){ removed.push(k); delete store[k]; },
    key(i){ return Object.keys(store)[i] || null; },
    get length(){ return Object.keys(store).length; },
    __store: store, __removed: removed, __total: total
  };
  const RES = { getItem:1, setItem:1, removeItem:1, key:1, length:1, clear:1, __store:1, __removed:1, __total:1 };
  return new Proxy(api, {
    get(t, p){ if (typeof p === 'symbol' || RES[p] || (p in t)) return t[p];
               return Object.prototype.hasOwnProperty.call(store, p) ? store[p] : undefined; },
    has(t, p){ return RES[p] || (p in t) || Object.prototype.hasOwnProperty.call(store, p); },
    ownKeys(){ return Object.keys(store); },
    getOwnPropertyDescriptor(t, p){
      if (Object.prototype.hasOwnProperty.call(store, p)) return { value: store[p], enumerable: true, configurable: true, writable: true };
      return undefined; }
  });
}
function homeScript(){
  const parts = HOME.match(/<script>[\s\S]*?<\/script>/g) || [];
  const b = parts.map(p => p.replace(/^<script>/, '').replace(/<\/script>$/, ''));
  return b[b.length - 1];
}
const HOME_JS = homeScript();
function boot(opts){
  const ls = opts.ls;
  const nodes = {}, listeners = {};
  function mkEl(id){
    const e = { id, src: '', onload: null, onerror: null, value: '', textContent: '', innerHTML: '',
      className: '', style: { cssText: '', display: '' }, checked: false, children: [],
      addEventListener(t, f){ (listeners[id] = listeners[id] || {})[t] = f; },
      appendChild(c){ e.children.push(c); return c; }, removeChild(){}, remove(){},
      querySelectorAll: () => [], setAttribute(){}, getAttribute: () => null, removeAttribute(){},
      click(){}, closest: () => null, classList: { add(){}, remove(){}, contains: () => false } };
    nodes[id] = e; return e;
  }
  ['q','sort','listTitle','navs','recent','grid','detail','sync','note','upBtn','downBtn','expBtn','impBtn','impFile',
   'gcBtn','capMeter','gLoginBtn','loginState','noteMore','noteRest'].forEach(mkEl);
  const body = mkEl('__body'), headEl = mkEl('__head');
  const document = { body, head: headEl, getElementById: id => nodes[id] || null,
    createElement: () => mkEl('__e' + Math.random()), createTextNode: t => ({ nodeValue: String(t) }),
    querySelectorAll: () => [], addEventListener(){} };
  const sent = [];
  const w = {
    localStorage: ls, sessionStorage: { getItem: () => null, setItem(){}, removeItem(){} },
    document, navigator: { userAgent: 'iPhone' },
    location: { href: '', search: '', pathname: '/home.html', hash: '', replace(){} },
    history: { replaceState(){} }, alert(){}, confirm(){ return true; },
    setTimeout: () => 0, clearTimeout(){}, setInterval: () => 0, clearInterval(){},
    console: { log(){}, warn(){}, error(){} },
    URL: { createObjectURL: () => 'blob:', revokeObjectURL(){} }, AbortController: undefined,
    atob: (x) => Buffer.from(String(x), 'base64').toString('binary'), escape: (x) => String(x),
    fetch(url, o){
      if (String(url).indexOf('version.txt') >= 0) return Promise.resolve({ ok: true, text: () => Promise.resolve(read('version.txt').trim()) });
      let b = null; try { b = JSON.parse((o && o.body) || '{}'); } catch(e){ b = {}; }
      sent.push(b.op);
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(opts.server(b)) });
    }
  };
  w.window = w; w.self = w;
  const ctx = vm.createContext(w);
  MODULES.forEach(f => vm.runInContext(read(f), ctx, { filename: f }));
  vm.runInContext(HOME_JS, ctx, { filename: 'home' });
  return { w, ls, nodes, sent, fire: (id, t, ev) => { const f = listeners[id] && listeners[id][t]; return f ? f(ev || {}) : undefined; } };
}
/* 使用量が usedChars ちょうどになる在庫を作る（白鷺荘は localChars） */
function stock(usedChars, localChars, extra){
  const meta = JSON.stringify([{ id: SLOT, name: '白鷺荘', key: KEY, updatedAt: 5 }]);
  const ls = Object.assign({ v292ProxyPass: 'pw', 'chr6_slots_meta': meta,
    'chr6_active_slot': JSON.stringify(SLOT), [KEY]: storyOfChars(10, localChars),
    /* 起動時 pull が「最新です」で素通りしないよう、基点はサーバーより古くしておく */
    'v292Dfix402_baseRev': '480' }, extra || {});
  const cur = () => Object.keys(ls).reduce((a, k) => a + k.length + ls[k].length, 0);
  const pad = 'v292Dfix640Evid_pad';
  ls[pad] = jsonOfChars(Math.max(20, usedChars - cur() - pad.length));
  return ls;
}
const server = (cloudChars) => (b) => {
  const meta = JSON.stringify([{ id: SLOT, name: '白鷺荘', key: KEY, updatedAt: 5 }]);
  const cloudLs = { 'chr6_slots_meta': meta, [KEY]: storyOfChars(96, cloudChars) };
  if (b.op === 'meta') return { ok: true, rev: 500, ns: 'ns1', meta: { updatedAt: 1, device: 'Win' } };
  if (b.op === 'get')  return { ok: true, rev: 500, ns: 'ns1', data: { ls: cloudLs, updatedAt: 1, full: true } };
  if (b.op === 'put')  return { ok: true, fork: true, rev: 501, requestId: 'r1' };
  if (b.op === 'commitstate') return { ok: true, rev: 500, packageHash: 'PH', ns: 'ns1' };
  return { ok: false };
};
const turnsOf = (ls, k) => { try { return JSON.parse(ls.getItem(k)).turns.length; } catch(e){ return -1; } };
function fullDump(chars){
  const inner = {};
  inner[KEY] = storyOfChars(96, Math.floor(chars * 0.5));
  inner['chr6_v292Dfix307Roster_' + SLOT] = jsonOfChars(Math.floor(chars * 0.4));
  const o = { activeSlot: SLOT, savedAt: 1784942016123, ls: inner };
  let s = JSON.stringify(o);
  if (s.length < chars){ inner['chr6_v292Dfix135_sum_' + SLOT] = jsonOfChars(chars - s.length - 40); s = JSON.stringify(o); }
  return s;
}

(async () => {

/* =====================================================================
   (1) 実効容量の出どころ（ソース契約）
   ===================================================================== */
console.log('== (1) 実効容量は iOS の上限から出す（片付けの目標ではない） ==');
{
  ok('★★iOS 5MiB(UTF-16) の文字数上限を定数で持つ',
     /F664_IOS_CAP_CHARS = 2621440/.test(HOME), (HOME.match(/F664_IOS_CAP_CHARS = \d+/) || [])[0]);
  ok('★安全余裕を引く', /F664_SAFETY_CHARS  = 65536/.test(HOME));
  ok('★★f661CapBytes() が TargetKB を見ていない（＝目標と容量を混ぜない）', (() => {
    const i = HOME.indexOf('function f661CapBytes()');
    const body = HOME.slice(i, HOME.indexOf('}', HOME.indexOf('return', i)) + 1);
    return i > 0 && !/f661TargetKB/.test(body) && /F664_IOS_CAP_CHARS - F664_SAFETY_CHARS/.test(body);
  })(), HOME.slice(HOME.indexOf('function f661CapBytes()'), HOME.indexOf('function f661CapBytes()') + 260));
  ok('★★学習値があれば「小さい方」を採る（実測は容量の下限なので安全側）',
     /Math\.min\(known, def\)/.test(HOME));
  ok('★TargetKB は平時の片付け(autoGC)専用として残っている',
     /var target = f661TargetKB\(\) \* 1024;/.test(HOME) && /home-boot-autogc/.test(HOME));
}

/* =====================================================================
   (2) 回帰: 目標超過だけで自動putを走らせない
   ===================================================================== */
console.log('\n== (2) 【回帰】使用量が片付け目標を超えただけでは自動putしない ==');
{
  /* 使用量 2,200,000字（目標2000KB=2,048,000 を超えている）だが、
     実効容量 2,555,904 に対して 55,000字の書込みは余裕で入る */
  const ls = mkLS(stock(2200000, 20000, { [DUMP]: fullDump(300000) }), IOS_CAP);
  const h = boot({ ls, server: server(55000) });
  await settle();
  ok('★★自動 put が飛ばない（本当は普通に書ける場面）', h.sent.indexOf('put') < 0, h.sent);
  ok('★★丸ごと控えを降格していない', ls.getItem(DUMP) != null);
  ok('★★取り込みは普通に成功している', turnsOf(ls, KEY) === 96, turnsOf(ls, KEY));
  ok('★baseRev も採用される', ls.getItem('v292Dfix402_baseRev') === '500');
}
{
  /* ★対照: 旧実装(TargetKB を容量とみなす)なら、この配置で headroom が負になり
     チェーンが走ってしまっていた。その関係を数値で明示しておく。 */
  const used = 2200000, target = 2000 * 1024, need = 55000;
  ok('★★[対照] 旧判定なら不足と誤認する関係になっている（回帰テストの前提）',
     (target - used) < 0 && (EFFECTIVE - used) > need, { oldHeadroom: target - used, newHeadroom: EFFECTIVE - used, need });
}

/* =====================================================================
   (3) 本当に足りないときは今までどおりチェーンが走る
   ===================================================================== */
console.log('\n== (3) 本当に足りないときはチェーンが走る（iPhone実配置） ==');
{
  /* 実機相当: 使用量 2,479,000 / 白鷺荘 25,654 → 312,088 へ差し替える */
  const ls = mkLS(stock(2479000, 25654, { [DUMP]: fullDump(597000) }), IOS_CAP);
  const h = boot({ ls, server: server(312088) });
  await settle();
  ok('★★自動 put が1回飛ぶ', h.sent.filter(o => o === 'put').length === 1, h.sent);
  ok('★★サーバー保存証明つきで丸ごと控えが降格される', ls.getItem(DUMP) == null);
  ok('★★白鷺荘 96T / 312,088字が書けた',
     turnsOf(ls, KEY) === 96 && ls.getItem(KEY).length === 312088, { t: turnsOf(ls, KEY), len: (ls.getItem(KEY) || '').length });
  ok('★★LS が iOS 上限以下に収まっている', ls.__total() <= IOS_CAP, ls.__total());
  ok('★★生きている物語は1件も消えていない', ls.__removed.every(k => k.indexOf('chr6_slot_') !== 0), ls.__removed);
  ok('★降格の intent が retention-after-server-backup', (() => {
    const log = h.w.__v292Dfix660gw.log().filter(e => e.key === DUMP && e.code === 'deleted');
    return log.length === 1 && log[0].intent === 'retention-after-server-backup';
  })(), h.w.__v292Dfix660gw.log().filter(e => e.key === DUMP).map(e => [e.intent, e.code]));
}
{
  /* 利用者が目標KBを大きくしても、実効容量の判定は変わらない（旧実装ではここが死んだ） */
  const ls = mkLS(stock(2479000, 25654, { [DUMP]: fullDump(597000), 'v292Dfix661TargetKB': '5000' }), IOS_CAP);
  const h = boot({ ls, server: server(312088) });
  await settle();
  ok('★★目標KBを大きくしても pre-flight/チェーンは正しく発火する',
     h.sent.filter(o => o === 'put').length === 1 && turnsOf(ls, KEY) === 96, { sent: h.sent, t: turnsOf(ls, KEY) });
}

/* =====================================================================
   (4) 実キー名の族判定（sim で最初に疑った点をテストで固定）
   ===================================================================== */
console.log('\n== (4) 実キー名 chr6_bk_cloudsync_<13桁> を fullDump として扱えるか ==');
{
  const ls = mkLS(stock(600000, 20000, { [DUMP]: fullDump(597000) }), 0);
  const sb = { localStorage: ls, console: { log(){}, warn(){}, error(){} },
    setTimeout: () => 0, clearTimeout(){}, setInterval: () => 0, clearInterval(){},
    Date, JSON, Math, Object, Array, String, Number, parseInt, isFinite, Promise, RegExp, Error,
    document: { readyState: 'complete', addEventListener(){}, body: {} } };
  sb.window = sb; vm.createContext(sb);
  ['v292Dfix562-backup-inventory.js', 'v292Dfix660-delete-gateway.js', 'v292Dfix660-backup-gc.js']
    .forEach(f => vm.runInContext(read(f), sb, { filename: f }));
  const I = sb.window.__v292Dfix562, GC = sb.window.__v292Dfix660gc;
  const row = I.inventory().filter(r => r.key === DUMP)[0];
  ok('★★kind=fullDump として認識される', row && row.kind === 'fullDump', row && row.kind);
  ok('★★completeSnapshot=true（サイドストアを運べる）', row && row.completeSnapshot === true);
  ok('★★13桁tsから作成時刻を読める', row && row.createdAt === 1784942016123, row && row.createdAt);
  ok('★★(fullDump)枠で保護される＝自動GCでは消えない', (() => {
    const ps = I.protectedSet();
    return ps['(fullDump)'] && ps['(fullDump)'].key === DUMP;
  })());
  GC.plan();
  ok('★★GREEN候補に入らない', GC.candidates().every(c => c.keys.indexOf(DUMP) < 0), GC.candidates());
  ok('★★証明なしでは降格しない', GC.retireOldFullDumps().ok === false && ls.getItem(DUMP) != null);
  ok('★★証明ありなら降格できる（ここが空振りするとチェーンが死ぬ）',
     GC.retireOldFullDumps({ serverProof: { serverConfirmedAt: Date.now(), rev: 501, fork: true } }).ok === true &&
     ls.getItem(DUMP) == null);
}

/* =====================================================================
   (5) 出荷の体裁
   ===================================================================== */
console.log('\n== (5) 出荷の体裁 ==');
{
  const ver = read('version.txt').trim();
  const HTMLU = Buffer.from(fs.readFileSync(path.join(__dirname, 'index.html'), 'latin1'), 'latin1').toString('utf8');
  ok('★★BUILT / HOME_BUILT / fix654 BUILD が version.txt と同値',
     (HTMLU.match(/var BUILT = '([^']+)'/) || [])[1] === ver &&
     (HOME.match(/var HOME_BUILT = '([^']+)'/) || [])[1] === ver &&
     (read('v292Dfix654-storage-trap.js').match(/BUILD\s*=\s*'([^']+)'/) || [])[1] === ver, ver);
  ok('★仮想iPhone検証機が同梱されている（出荷物ではないが再現できる）',
     fs.existsSync(path.join(__dirname, 'sim_iphone_663.cjs')));
  ok('★home.html の直接削除は既存3か所のまま', (() => {
    const code = HOME.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
    return (code.match(/\.removeItem\s*\(/g) || []).length === 3;
  })());
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);

})().catch(e => { console.error('FATAL', e && e.stack || e); console.log('PASS ' + pass + ' / FAIL ' + (fail + 1)); process.exit(1); });
