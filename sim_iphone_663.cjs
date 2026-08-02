#!/usr/bin/env node
/* sim_iphone_663.cjs — 「仮想iPhone」で同期チェーンを最後まで通す検証機（出荷物ではない）
 *
 * ■何をするか
 *   2026-08-02 に本番サーバー(op:get)と iPhone の fork(op:getfork)から採取した**実測値**で
 *   localStorage を合成し、**本番の home.html(fix663) と実モジュール**をサンドボックスで走らせて、
 *   「PC で進めた白鷺荘 96T(312,088字) が iPhone に取り込めるか」を最後まで確かめる。
 *
 * ■実測パラメータ（このファイルの数字はすべて実測由来）
 *   iOS の localStorage 上限 = 5MiB(UTF-16) → 文字数上限 ≒ 2,621,440
 *   クラウド正本      : rev500 / 242キー / 1,617,587字 / 白鷺荘 312,088字(96T)
 *   iPhone 同期対象   : 234キー / 1,273,400字 / 白鷺荘 25,654字(10T)
 *   iPhone LS 全体    : 571キー / 2,479,000字（地元キー ≒1.2M字）
 *     └ chr6_bk_cloudsync_<13桁> ≒597,000字 / __gen_chr6_slot_smrg85jwsn6 ≒185,000字
 *       chr6_bk_fix469_chr6_slot_smrXXX ≒71,000字
 *
 * 実行: node sim_iphone_663.cjs        （終了コード 0 = 同期完走）
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

const CAP = 2621440;                       /* iOS 5MiB(UTF-16) の文字数上限 */
const WHITE = 'sms4np33eyg';               /* 白鷺荘 */
const WHITE_KEY = 'chr6_slot_' + WHITE;
const WHITE_CLOUD_CHARS = 312088;          /* 96T */
const WHITE_LOCAL_CHARS = 25654;           /* 10T */
const DUMP_KEY = 'chr6_bk_cloudsync_1784942016123';   /* 実キーは 13桁ts（1784942016xxx） */
const GEN_KEY  = '__gen_chr6_slot_smrg85jwsn6';
const F469_KEY = 'chr6_bk_fix469_chr6_slot_smrg85jwsn6';

let step = 0;
const log = (...a) => console.log(...a);
const head = (t) => log('\n' + '─'.repeat(70) + '\n[' + (++step) + '] ' + t);
let problems = [];
const check = (name, cond, detail) => {
  if (cond) log('   OK   ' + name);
  else { problems.push(name + (detail !== undefined ? ('  >> ' + JSON.stringify(detail)) : '')); log('   NG   ' + name + (detail !== undefined ? ('  >> ' + JSON.stringify(detail)) : '')); }
};

/* =====================================================================
   実測サイズに合わせて中身を作る道具
   ===================================================================== */
function storyOfChars(turns, chars){
  /* {turns:[…]} で、JSON 文字列長がちょうど chars になるように詰める */
  const base = { turns: new Array(turns).fill(0).map((_, i) => ({ i, r: '', t: '' })) };
  let s = JSON.stringify(base);
  const need = chars - s.length;
  if (need <= 0) return s.slice(0, chars);
  base.turns[0].r = 'あ'.repeat(Math.max(0, need));
  s = JSON.stringify(base);
  if (s.length > chars) s = s.slice(0, s.length - (s.length - chars));
  return s;
}
function padTo(str, chars){
  if (str.length >= chars) return str.slice(0, chars);
  return str + 'x'.repeat(chars - str.length);
}
function jsonOfChars(chars){
  const o = { d: '' };
  const base = JSON.stringify(o).length;
  o.d = 'x'.repeat(Math.max(0, chars - base));
  return JSON.stringify(o).slice(0, chars);
}

/* 20エントリ・墓標入りの chr6_slots_meta（実物は 4,774字） */
const SLOT_IDS = [WHITE, 'smri0s9cno3', 'sms5xyl4jjy', 'sms60fhnthz', 'smrrcv21iph', 'smr8p8wfr8b',
                  'smrg85jwsn6', 'smq1a2b3c4d', 'smq2b3c4d5e', 'smq3c4d5e6f', 'smq4d5e6f7g',
                  'smq5e6f7g8h', 'smq6f7g8h9i', 'smq7g8h9i0j', 'smq8h9i0j1k', 'smq9i0j1k2l'];
const TOMB_IDS = ['smd1dead001', 'smd2dead002', 'smd3dead003', 'smd4dead004'];
function buildMeta(){
  const live = SLOT_IDS.map((id, i) => ({ id, name: '物語' + i, key: 'chr6_slot_' + id,
    updatedAt: 1784900000000 + i * 1000, createdAt: '2026-07-0' + ((i % 9) + 1) + 'T00:00:00.000Z',
    lastOpenedAt: '2026-08-01T10:00:00.000Z', favorite: false }));
  const dead = TOMB_IDS.map((id, i) => ({ id, name: '削除済' + i, deleted: true,
    deletedAt: 1784910000000 + i, deleteOpId: 'del_' + id + '_1',
    recoverySnapshotId: 'chr6_snap_' + id, lifecycleVersion: 1, updatedAt: 1784910000000 + i }));
  let s = JSON.stringify(live.concat(dead));
  /* 実物 4,774字に寄せる（足りない分は name を伸ばす） */
  if (s.length < 4774){
    live[0].name = live[0].name + 'あ'.repeat(Math.ceil((4774 - s.length) / 3));
    s = JSON.stringify(live.concat(dead));
  }
  return s;
}
const META = buildMeta();

/* =====================================================================
   クラウド正本（242キー / 1,617,587字）
   ===================================================================== */
function buildCloud(){
  const ls = {};
  ls['chr6_slots_meta'] = META;
  ls['chr6_active_slot'] = JSON.stringify(WHITE);
  ls[WHITE_KEY] = storyOfChars(96, WHITE_CLOUD_CHARS);
  const bigSlots = { 'chr6_slot_smri0s9cno3': 65909, 'chr6_slot_sms5xyl4jjy': 83390,
                     'chr6_slot_sms60fhnthz': 75682, 'chr6_slot_smrrcv21iph': 60362,
                     'chr6_slot_smr8p8wfr8b': 47108 };
  Object.keys(bigSlots).forEach(k => { ls[k] = storyOfChars(30, bigSlots[k]); });
  /* 残りの生きているスロット（小さめ） */
  SLOT_IDS.forEach(id => { const k = 'chr6_slot_' + id; if (!ls[k]) ls[k] = storyOfChars(6, 9000); });
  /* snapd コピー・会話ログ・証拠台帳（実測の大物群） */
  const bulky = [
    ['chr6_snapd_' + WHITE + '_1784900000000_0', 65909],
    ['chr6_snapd_smri0s9cno3_1784900000001_0', 41000],
    ['chr6_snapd_sms5xyl4jjy_1784900000002_0', 33000],
    ['chr6_snapd_' + WHITE + '_1784900000000_1', 6869],
    ['chr6_v292Dfix104_dlg_' + WHITE, 20238],
    ['chr6_v292Dfix104_dlg_smri0s9cno3', 12000],
    ['chr6_v292Dfix104_dlg_sms5xyl4jjy', 6869],
    ['v292Dfix640Evid_slot_' + WHITE, 36007],
    ['v292Dfix640Evid_slot_smri0s9cno3', 18000],
    ['v292Dfix640Evid_slot_sms5xyl4jjy', 6657]
  ];
  bulky.forEach(([k, n]) => { ls[k] = jsonOfChars(n); });
  /* 小物で 242キー / 1,617,587字 へ合わせる */
  const TARGET_KEYS = 242, TARGET_CHARS = 1617587;
  const cur = () => Object.keys(ls).reduce((a, k) => a + k.length + ls[k].length, 0);
  let i = 0;
  while (Object.keys(ls).length < TARGET_KEYS - 1){
    ls['chr6_v292Dfix77States_' + SLOT_IDS[i % SLOT_IDS.length] + '_' + i] = jsonOfChars(1200);
    i++;
  }
  const last = 'chr6_v292Dfix307Roster_' + WHITE;
  const remain = TARGET_CHARS - cur() - last.length;
  ls[last] = jsonOfChars(Math.max(50, remain));
  return ls;
}
const CLOUD_LS = buildCloud();
const CLOUD_KEYS = Object.keys(CLOUD_LS).length;
const CLOUD_CHARS = Object.keys(CLOUD_LS).reduce((a, k) => a + k.length + CLOUD_LS[k].length, 0);

/* =====================================================================
   仮想 iPhone の localStorage（571キー / 2,479,000字）
   ===================================================================== */
function buildPhone(dumpKey){
  const ls = {};
  /* ①同期対象（クラウドと同一。ただし白鷺荘だけ 10T の旧版） */
  Object.keys(CLOUD_LS).forEach(k => { ls[k] = CLOUD_LS[k]; });
  ls[WHITE_KEY] = storyOfChars(10, WHITE_LOCAL_CHARS);
  /* 実測: iPhone 側の同期対象は 234キー（クラウドより8キー少ない） */
  const drop = Object.keys(ls).filter(k => /^chr6_v292Dfix77States_/.test(k)).slice(0, CLOUD_KEYS - 234);
  drop.forEach(k => { delete ls[k]; });

  /* ②地元キー（同期対象外）。実在パターンそのまま */
  ls[dumpKey] = (function(){
    /* 丸ごと控え: {activeSlot, ls:{…}} で、本体+サイドストアを運ぶ＝completeSnapshot */
    const inner = {};
    inner[WHITE_KEY] = storyOfChars(96, 300000);
    inner['chr6_v292Dfix54_genderMap_"' + WHITE + '"'] = jsonOfChars(120000);
    inner['chr6_v292Dfix307Roster_' + WHITE] = jsonOfChars(120000);
    inner['chr6_slots_meta'] = META;
    const o = { activeSlot: WHITE, savedAt: 1784942016123, ls: inner };
    let s = JSON.stringify(o);
    if (s.length < 597000){
      inner['chr6_v292Dfix135_sum_' + WHITE] = jsonOfChars(597000 - s.length - 60);
      s = JSON.stringify(o);
    }
    return s;
  })();
  ls[GEN_KEY]  = storyOfChars(60, 185000);
  ls[F469_KEY] = storyOfChars(40, 71000);

  /* 小物フィラーで 571キー / 2,479,000字 ちょうどへ合わせる */
  const cur = () => Object.keys(ls).reduce((a, k) => a + k.length + ls[k].length, 0);
  const TARGET_KEYS = 571, TARGET_CHARS = 2479000;
  const need = TARGET_KEYS - Object.keys(ls).length;
  const names = [];
  for (let i = 0; i < need; i++) names.push('v292Dfix640Evid_local_' + i);
  const nameChars = names.reduce((a, n) => a + n.length, 0);
  const budget = TARGET_CHARS - cur() - nameChars;
  const per = Math.max(12, Math.floor(budget / Math.max(1, need)));
  names.forEach(n => { ls[n] = jsonOfChars(per); });
  /* 端数は最後の1キーで吸収する */
  const lastK = names[names.length - 1];
  if (lastK){
    const diff = TARGET_CHARS - cur();
    ls[lastK] = jsonOfChars(Math.max(12, ls[lastK].length + diff));
  }
  return ls;
}

/* =====================================================================
   モック localStorage（iOS の文字数上限を再現）
   ===================================================================== */
function mkLS(seed){
  const store = Object.assign(Object.create(null), seed || {});
  const removed = [];
  let quotaHits = 0;
  const total = () => { let u = 0; for (const k in store) u += k.length + store[k].length; return u; };
  const api = {
    getItem(k){ return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v){
      v = String(v);
      let u = total();
      if (Object.prototype.hasOwnProperty.call(store, k)) u -= (k.length + store[k].length);
      if (u + k.length + v.length > CAP){
        quotaHits++;
        const e = new Error('QuotaExceededError: The quota has been exceeded.');
        e.name = 'QuotaExceededError'; throw e;
      }
      store[k] = v;
    },
    removeItem(k){ removed.push(k); delete store[k]; },
    key(i){ return Object.keys(store)[i] || null; },
    get length(){ return Object.keys(store).length; },
    __store: store, __removed: removed, __total: total, __quotaHits: () => quotaHits
  };
  const RES = { getItem:1, setItem:1, removeItem:1, key:1, length:1, clear:1,
                __store:1, __removed:1, __total:1, __quotaHits:1 };
  return new Proxy(api, {
    get(t, p){ if (typeof p === 'symbol' || RES[p] || (p in t)) return t[p];
               return Object.prototype.hasOwnProperty.call(store, p) ? store[p] : undefined; },
    has(t, p){ return RES[p] || (p in t) || Object.prototype.hasOwnProperty.call(store, p); },
    ownKeys(){ return Object.keys(store); },
    getOwnPropertyDescriptor(t, p){
      if (Object.prototype.hasOwnProperty.call(store, p))
        return { value: store[p], enumerable: true, configurable: true, writable: true };
      return undefined; }
  });
}

/* =====================================================================
   home.html(本番) を実ファイルからサンドボックスで走らせる
   ===================================================================== */
const HOME = read('home.html');
const MODULES = ['v292Dfix579-tombstone-schema.js', 'v292Dfix562-backup-inventory.js', 'v292Dfix564-snapshot.js',
                 'v292Dfix660-delete-gateway.js', 'v292Dfix660-backup-gc.js', 'v292Dfix658-lineage-shadow.js',
                 'v292Dfix587-story-lifecycle.js', 'v292Dfix590-commit-ledger.js'];
function homeScript(){
  const parts = HOME.match(/<script>[\s\S]*?<\/script>/g) || [];
  const b = parts.map(p => p.replace(/^<script>/, '').replace(/<\/script>$/, ''));
  return b[b.length - 1];
}
const HOME_JS = homeScript();
const settle = async (n = 600) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };

function bootPhone(opts){
  opts = opts || {};
  const ls = opts.ls;
  const nodes = {}, listeners = {};
  function mkEl(id){
    const e = { id, tagName: 'div', src: '', onload: null, onerror: null,
      value: '', textContent: '', innerHTML: '', className: '', style: { cssText: '', display: '' }, checked: false,
      children: [], addEventListener(t, f){ (listeners[id] = listeners[id] || {})[t] = f; },
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
  const sent = [], logs = [];
  const w = {
    localStorage: ls, sessionStorage: { getItem: () => null, setItem(){}, removeItem(){} },
    document, navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) Safari' },
    location: { href: '', search: opts.search || '', pathname: '/home.html', hash: '', replace(){} },
    history: { replaceState(){} }, alert(){}, confirm(){ return true; },
    setTimeout: () => 0, clearTimeout(){}, setInterval: () => 0, clearInterval(){},
    console: { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push('WARN ' + a.join(' ')), error: (...a) => logs.push('ERR ' + a.join(' ')) },
    URL: { createObjectURL: () => 'blob:', revokeObjectURL(){} }, AbortController: undefined,
    atob: (x) => Buffer.from(String(x), 'base64').toString('binary'), escape: (x) => String(x),
    fetch(url, o){
      if (String(url).indexOf('version.txt') >= 0)
        return Promise.resolve({ ok: true, text: () => Promise.resolve(read('version.txt').trim()) });
      let b = null; try { b = JSON.parse((o && o.body) || '{}'); } catch(e){ b = {}; }
      sent.push({ op: b.op, bytes: (o && o.body) ? o.body.length : 0, baseRev: b.baseRev });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(opts.server(b)) });
    }
  };
  w.window = w; w.self = w;
  const ctx = vm.createContext(w);
  MODULES.forEach(f => vm.runInContext(read(f), ctx, { filename: f }));
  vm.runInContext(HOME_JS, ctx, { filename: 'home.html' });
  return { w, ls, nodes, sent, logs, fire: (id, t, ev) => { const f = listeners[id] && listeners[id][t]; return f ? f(ev || {}) : undefined; } };
}

/* サーバー: rev500 の正本。put は fork:true(=別分岐として保存された) を返す */
function mkServer(){
  return b => {
    if (b.op === 'meta') return { ok: true, rev: 500, ns: 'a1b2c3d4e5f6', meta: { updatedAt: 1785640000000, device: 'Windows Chrome', size: CLOUD_CHARS } };
    if (b.op === 'get')  return { ok: true, rev: 500, ns: 'a1b2c3d4e5f6', data: { schema: 1, updatedAt: 1785640000000, device: 'Windows Chrome', activeSlot: WHITE, full: true, ls: CLOUD_LS } };
    if (b.op === 'put')  return { ok: true, fork: true, rev: 501, server: { rev: 500, device: 'Windows Chrome', updatedAt: 1785640000000 }, requestId: 'rq-sim-1' };
    if (b.op === 'commitstate') return { ok: true, ns: 'a1b2c3d4e5f6', rev: 500, packageHash: 'sha256:cloud', lastCommitOpId: 'op-500', hashAlg: 'sha256-utf8-v1', exists: true };
    return { ok: false, error: 'unknown op' };
  };
}
const kb = n => Math.round(n / 1024) + 'K字';
const turnsOf = (ls, k) => { try { return JSON.parse(ls.getItem(k)).turns.length; } catch(e){ return -1; } };

(async () => {

log('═'.repeat(70));
log('仮想iPhone 同期シミュレーション（本番 home.html = ' + read('version.txt').trim() + '）');
log('═'.repeat(70));

head('フィクスチャの検算（実測値と合っているか）');
{
  const phone = buildPhone(DUMP_KEY);
  const pk = Object.keys(phone).length;
  const pc = Object.keys(phone).reduce((a, k) => a + k.length + phone[k].length, 0);
  log('   クラウド正本 : ' + CLOUD_KEYS + 'キー / ' + CLOUD_CHARS.toLocaleString() + '字（実測 242 / 1,617,587）');
  log('   iPhone LS    : ' + pk + 'キー / ' + pc.toLocaleString() + '字（実測 571 / 2,479,000）');
  log('   白鷺荘 cloud : ' + CLOUD_LS[WHITE_KEY].length.toLocaleString() + '字 / ' + turnsOf({ getItem: () => CLOUD_LS[WHITE_KEY] }, WHITE_KEY) + 'T（実測 312,088 / 96T）');
  log('   白鷺荘 local : ' + phone[WHITE_KEY].length.toLocaleString() + '字（実測 25,654 / 10T）');
  log('   丸ごと控え   : ' + phone[DUMP_KEY].length.toLocaleString() + '字（実測 ≒597,000）');
  log('   __gen        : ' + phone[GEN_KEY].length.toLocaleString() + '字 / fix469控え ' + phone[F469_KEY].length.toLocaleString() + '字');
  log('   CAP          : ' + CAP.toLocaleString() + '字（iOS 5MiB / UTF-16）  余裕 = ' + (CAP - pc).toLocaleString() + '字');
  check('クラウドのキー数が実測どおり', CLOUD_KEYS === 242, CLOUD_KEYS);
  check('クラウドの文字数が実測どおり', Math.abs(CLOUD_CHARS - 1617587) < 200, CLOUD_CHARS);
  check('iPhone のキー数が実測どおり', pk === 571, pk);
  check('iPhone の文字数が実測どおり', Math.abs(pc - 2479000) < 200, pc);
  check('★白鷺荘だけを 96T へ書き換えるには余裕が足りない（=実機と同じ詰まり）',
        (pc - phone[WHITE_KEY].length + CLOUD_LS[WHITE_KEY].length) > CAP,
        pc - phone[WHITE_KEY].length + CLOUD_LS[WHITE_KEY].length);
}

head('分類器(fix562)が実キー名を正しく読めるか【疑い①】');
{
  const ls = mkLS(buildPhone(DUMP_KEY));
  const sb = { localStorage: ls, console: { log(){}, warn(){}, error(){} },
    setTimeout: () => 0, clearTimeout(){}, setInterval: () => 0, clearInterval(){},
    Date, JSON, Math, Object, Array, String, Number, parseInt, isFinite, Promise, RegExp, Error,
    document: { readyState: 'complete', addEventListener(){}, body: {} } };
  sb.window = sb; vm.createContext(sb);
  ['v292Dfix562-backup-inventory.js', 'v292Dfix660-delete-gateway.js', 'v292Dfix660-backup-gc.js']
    .forEach(f => vm.runInContext(read(f), sb, { filename: f }));
  const I = sb.window.__v292Dfix562, GC = sb.window.__v292Dfix660gc;

  const t0 = Date.now();
  const inv = I.inventory();
  const row = inv.filter(r => r.key === DUMP_KEY)[0];
  log('   inventory(): ' + inv.length + '件 / ' + (Date.now() - t0) + 'ms');
  check('丸ごと控えが inventory に載る', !!row, DUMP_KEY);
  check('★kind=fullDump として認識される', row && row.kind === 'fullDump', row && row.kind);
  check('★completeSnapshot=true（サイドストアを運べる）', row && row.completeSnapshot === true, row && row.completeSnapshot);
  check('作成時刻を13桁tsから読めている', row && row.createdAt === 1784942016123, row && row.createdAt);

  const t1 = Date.now();
  const ps = I.protectedSet();
  log('   protectedSet(): ' + Object.keys(ps).length + '件 / ' + (Date.now() - t1) + 'ms');
  check('★(fullDump) 枠で保護されている＝自動では消えない', ps['(fullDump)'] && ps['(fullDump)'].key === DUMP_KEY,
        ps['(fullDump)'] && ps['(fullDump)'].key);

  const t2 = Date.now();
  const u = GC.usage();
  log('   usage(): ' + u.keys + 'キー / ' + u.bytes.toLocaleString() + '字 / ' + (Date.now() - t2) + 'ms');
  check('usage() が LS 実測と一致', Math.abs(u.bytes - ls.__total()) < 5, { u: u.bytes, real: ls.__total() });

  const t3 = Date.now();
  GC.plan();
  const cands = GC.candidates();
  log('   plan(): GREEN候補 ' + cands.length + '件 / 合計 ' + cands.reduce((a, c) => a + c.bytes, 0).toLocaleString() + '字 / ' + (Date.now() - t3) + 'ms');
  cands.slice(0, 5).forEach(c => log('       - ' + c.keys[0] + ' ' + c.bytes.toLocaleString() + '字  ' + c.why));
  check('★GREEN候補だけでは 312,088字を賄えない（＝チェーンが要る状況）',
        cands.reduce((a, c) => a + c.bytes, 0) < WHITE_CLOUD_CHARS, cands.reduce((a, c) => a + c.bytes, 0));
  check('★丸ごと控えは GREEN 候補に入っていない（保護されている）',
        cands.every(c => c.keys.indexOf(DUMP_KEY) < 0));

  const r0 = GC.retireOldFullDumps();
  check('★証明なしでは丸ごと控えを降格しない', r0.ok === false && ls.getItem(DUMP_KEY) != null, r0.code);
  const r1 = GC.retireOldFullDumps({ serverProof: { serverConfirmedAt: Date.now(), rev: 501, fork: true } });
  check('★★サーバー保存証明があれば降格できる【ここが空振りするとチェーンが死ぬ】',
        r1.ok === true && r1.retired.indexOf(DUMP_KEY) >= 0, r1);
  log('   → 解放量: ' + (r1.freedBytes || 0).toLocaleString() + '字');
}

head('(a) 起動フロー（ログイン済み・autopull無し）');
let bootPhoneRes = null;
{
  const seed = buildPhone(DUMP_KEY);
  seed['v292ProxyPass'] = 'himitsu';
  seed['v292Dfix402_baseRev'] = '480';
  const ls = mkLS(seed);
  const t0 = Date.now();
  const h = bootPhone({ ls, server: mkServer() });
  await settle();
  const ms = Date.now() - t0;
  bootPhoneRes = h;
  log('   所要 ' + ms + 'ms / 通信: ' + h.sent.map(s => s.op).join(',') );
  log('   sync : ' + h.nodes.sync.textContent);
  log('   notes: ' + h.nodes.note.innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400));
  log('   白鷺荘: ' + turnsOf(ls, WHITE_KEY) + 'T / ' + (ls.getItem(WHITE_KEY) || '').length.toLocaleString() + '字');
  log('   LS合計: ' + ls.__total().toLocaleString() + '字 / quota発生 ' + ls.__quotaHits() + '回');
  check('起動フローで自動チェーンが発火する（詰まりを検知できている）',
        h.sent.some(s => s.op === 'put'), h.sent.map(s => s.op));
  check('★★起動だけで白鷺荘 96T が入る', turnsOf(ls, WHITE_KEY) === 96, turnsOf(ls, WHITE_KEY));
  check('★LS が CAP を超えていない', ls.__total() <= CAP, ls.__total());
}

head('(b) 「☁ いま取り込む」= pull(true) の完走');
{
  const seed = buildPhone(DUMP_KEY);
  seed['v292ProxyPass'] = 'himitsu';
  seed['v292Dfix402_baseRev'] = '500';          /* 起動時 pull は「最新です」で素通りする状態 */
  const ls = mkLS(seed);
  const before = ls.__total();
  const h = bootPhone({ ls, server: mkServer() });
  await settle();
  log('   [起動後] sync=' + h.nodes.sync.textContent + ' / 白鷺荘=' + turnsOf(ls, WHITE_KEY) + 'T');
  const t0 = Date.now();
  h.fire('downBtn', 'click');
  await settle(1200);
  const ms = Date.now() - t0;

  const ops = h.sent.map(s => s.op).join(',');
  const putReq = h.sent.filter(s => s.op === 'put')[0];
  log('   所要 ' + ms + 'ms / 通信: ' + ops);
  if (putReq) log('   自動put の本文: ' + putReq.bytes.toLocaleString() + '字（baseRev=' + putReq.baseRev + '）');
  log('   解放されたキー: ' + ls.__removed.join(', ').slice(0, 200));
  log('   sync : ' + h.nodes.sync.textContent);
  log('   notes: ' + h.nodes.note.innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600));
  log('   白鷺荘: ' + turnsOf(ls, WHITE_KEY) + 'T / ' + (ls.getItem(WHITE_KEY) || '').length.toLocaleString() + '字');
  log('   LS合計: ' + before.toLocaleString() + '字 → ' + ls.__total().toLocaleString() + '字（CAP ' + CAP.toLocaleString() + '）');
  log('   quota 発生: ' + ls.__quotaHits() + '回');

  check('★①自動 put が1回だけ飛んだ', h.sent.filter(s => s.op === 'put').length === 1, h.sent.filter(s => s.op === 'put').length);
  check('★②旧 fullDump(597K字) が降格された', ls.getItem(DUMP_KEY) == null);
  check('★③白鷺荘が 96T / 312,088字で書けた',
        turnsOf(ls, WHITE_KEY) === 96 && ls.getItem(WHITE_KEY).length === WHITE_CLOUD_CHARS,
        { t: turnsOf(ls, WHITE_KEY), len: (ls.getItem(WHITE_KEY) || '').length });
  check('★④LS が CAP 以下に収まっている', ls.__total() <= CAP, ls.__total());
  check('★⑤各段のメッセージが画面最上部に出ている',
        /サーバーに保存しました/.test(h.nodes.note.innerHTML) && /解放しました/.test(h.nodes.note.innerHTML));
  check('★⑥診断行（rev/ns/ターン数）が出ている', /☁ サーバ: rev500/.test(h.nodes.note.innerHTML));
  check('★⑦baseRev が 500 で採用された', ls.getItem('v292Dfix402_baseRev') === '500', ls.getItem('v292Dfix402_baseRev'));
  check('★⑧書けなかったキーが0（⚠が出ていない）', !/保存できませんでした/.test(h.nodes.note.innerHTML));
  check('★⑨生きている物語を1件も消していない',
        ls.__removed.every(k => !/^chr6_slot_/.test(k)), ls.__removed.filter(k => /^chr6_slot_/.test(k)));
  check('★⑩物語一覧(meta)が残っている（墓標込み）', (() => {
    try { const m = JSON.parse(ls.getItem('chr6_slots_meta')); return Array.isArray(m) && m.length === 20 && m.some(e => e.deleted); }
    catch(e){ return false; }
  })(), (() => { try { return JSON.parse(ls.getItem('chr6_slots_meta')).length; } catch(e){ return null; } })());

  /* fix658 の系譜台帳 */
  const anchor = h.w.__v292Dfix658 && h.w.__v292Dfix658.anchor();
  log('   fix658 anchor: ' + JSON.stringify(anchor));
  check('★⑪fix658 の anchor が更新されている（rev500 を基点にした）',
        anchor && anchor.localBaseRev === 500, anchor);

  /* (d) チェーン後に story 側 put を模擬 */
  const baseAfter = +(ls.getItem('v292Dfix402_baseRev') || 0);
  check('★⑫この後の story 側 push は rev500 を基点に出る（古い基点で正本を潰さない）',
        baseAfter === 500, baseAfter);
}

head('(d) baseRev が古いままの端末は fork へ倒れる（clobber しない）');
{
  const seed = buildPhone(DUMP_KEY);
  seed['v292ProxyPass'] = 'himitsu';
  seed['v292Dfix402_baseRev'] = '480';
  const ls = mkLS(seed);
  /* 取り込みに失敗させる（サーバーが get で壊れた応答を返す）→ baseRev は据え置かれるはず */
  const server = b => {
    if (b.op === 'meta') return { ok: true, rev: 500, ns: 'a1b2c3d4e5f6', meta: { updatedAt: 1, device: 'W' } };
    if (b.op === 'get')  return { ok: false, error: 'boom' };
    return { ok: false };
  };
  const h = bootPhone({ ls, server });
  await settle();
  check('★取り込めなかった回は baseRev を進めない（＝次の push は fork に倒れる）',
        ls.getItem('v292Dfix402_baseRev') === '480', ls.getItem('v292Dfix402_baseRev'));
  check('★その回は1バイトも消していない', ls.__removed.length === 0, ls.__removed);
  log('   sync: ' + h.nodes.sync.textContent);
}

head('保護の最終確認（消してはいけないものが残っているか）');
{
  const seed = buildPhone(DUMP_KEY);
  seed['v292ProxyPass'] = 'himitsu';
  seed['v292Dfix402_baseRev'] = '500';
  const ls = mkLS(seed);
  const h = bootPhone({ ls, server: mkServer() });
  await settle();
  h.fire('downBtn', 'click');
  await settle(1200);
  const gone = ls.__removed;
  log('   解放: ' + gone.length + '件 = ' + gone.join(', ').slice(0, 300));
  check('生きている16物語すべてが残っている',
        SLOT_IDS.every(id => ls.getItem('chr6_slot_' + id) != null),
        SLOT_IDS.filter(id => ls.getItem('chr6_slot_' + id) == null));
  check('物語一覧・現在地が残っている',
        ls.getItem('chr6_slots_meta') != null && ls.getItem('chr6_active_slot') != null);
  check('サイドストア(会話ログ・ロスター等)が残っている',
        ls.getItem('chr6_v292Dfix104_dlg_' + WHITE) != null && ls.getItem('chr6_v292Dfix307Roster_' + WHITE) != null);
  const gw = h.w.__v292Dfix660gw;
  const del = gw.log().filter(e => e.code === 'deleted');
  log('   DeleteGateway ログ: ' + del.map(e => e.intent + ':' + e.key).join(' / ').slice(0, 300));
  check('すべての削除がゲートウェイのログに残っている（無言の削除0）', del.length === gone.length, { log: del.length, removed: gone.length });
  check('降格の intent が retention-after-server-backup',
        del.filter(e => e.key === DUMP_KEY).every(e => e.intent === 'retention-after-server-backup'));
}

head('結論');
if (problems.length === 0){
  log('   ✅ 仮想iPhoneで同期チェーンが最後まで完走した。');
  log('      白鷺荘 96T(312,088字) の取り込みに成功し、保護対象は1件も失われていない。');
} else {
  log('   ❌ ' + problems.length + ' 件の問題:');
  problems.forEach(p => log('      - ' + p));
}
log('');
process.exit(problems.length ? 1 : 0);

})().catch(e => { console.error('FATAL', e && e.stack || e); process.exit(2); });
