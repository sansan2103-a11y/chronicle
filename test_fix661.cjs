#!/usr/bin/env node
/* test_fix661.cjs — pull診断の常時表示 / baseRevの正直化 / 容量の自動管理
 *
 * ■背景(2026-08-02 iPhone実測)
 *   home が「☁ 取り込みました(0件)」+ ⚠なし + 白鷺荘10Tのまま。
 *   だがクラウド正本は rev492・白鷺荘96T。0件が「本当に差分なし」なのか
 *   「別人格(ns)を見ている/中身が空」なのかが**画面から判らなかった**。
 *
 * ■このテストが固定する契約
 *   (A) pull完了時に必ず rev/端末/ターン数/ns の1行を出す（0件のときほど出す）
 *   (B) baseRev は「この rev を基点だと名乗ってよい」回だけ採用する（skipped>0・書込失敗・halt は据え置き）
 *   (C1) pre-flight: 不足を推定して平時経路で複数単位を解放 → 書込成功。GREEN枯渇なら fail-closed + ⚠表示
 *   (C2) I11: 収束した回だけ古い丸ごと控えを世代交代（最新1件は常に残す・proof不成立では触らない）
 *   (C3) 起動時 autoGC: 目標KB超過で静かに整理・1起動10単位まで・OFFで不動
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c){ pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

const HOME   = read('home.html');
const SRC_GW = read('v292Dfix660-delete-gateway.js');
const SRC_GC = read('v292Dfix660-backup-gc.js');
const SRC562 = read('v292Dfix562-backup-inventory.js');
const SRC564 = read('v292Dfix564-snapshot.js');
const SRC579 = read('v292Dfix579-tombstone-schema.js');
const SRC587 = read('v292Dfix587-story-lifecycle.js');
const SRC590 = read('v292Dfix590-commit-ledger.js');
const stripBlock = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const CODEHOME = stripBlock(HOME);

const story = n => JSON.stringify({ turns: new Array(n).fill(0).map((_, i) => ({ i })) });
const SLOT = 'shirasagi';
const settle = async (n = 250) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };

/* ---- Storage 相当（named properties を見せる。fix562 の Object.keys が要る） ---- */
function mkLS(seed, opts){
  opts = opts || {};
  const store = Object.assign(Object.create(null), seed || {});
  const removed = [];
  const api = {
    getItem(k){ return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v){
      if (opts.quota && opts.quota(k, String(v), store)){
        const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e;
      }
      store[k] = String(v);
    },
    removeItem(k){ removed.push(k); delete store[k]; },
    key(i){ return Object.keys(store)[i] || null; },
    get length(){ return Object.keys(store).length; },
    __store: store, __removed: removed
  };
  const RES = { getItem:1, setItem:1, removeItem:1, key:1, length:1, clear:1, __store:1, __removed:1 };
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
function mkQuota(cap){
  return (k, v, store) => {
    let used = 0;
    for (const kk in store) used += kk.length + String(store[kk]).length;
    if (Object.prototype.hasOwnProperty.call(store, k)) used -= (k.length + String(store[k]).length);
    return (used + k.length + v.length) > cap;
  };
}
function usageOf(seed){ let u = 0; for (const k in seed) u += k.length + String(seed[k]).length; return u; }

function homeScript(){
  const parts = HOME.match(/<script>[\s\S]*?<\/script>/g) || [];
  const b = parts.map(p => p.replace(/^<script>/, '').replace(/<\/script>$/, ''));
  return b[b.length - 1];
}
const HOME_JS = homeScript();

function mkHome(opts){
  const ls = opts.ls || mkLS(opts.seed || {}, opts);
  const nodes = {}, listeners = {};
  function mkEl(id){
    const e = { id, value: '', textContent: '', innerHTML: '', className: '', style: { cssText: '' }, checked: false,
      children: [], addEventListener(t, f){ (listeners[id] = listeners[id] || {})[t] = f; },
      appendChild(c){ e.children.push(c); return c; }, removeChild(){}, remove(){},
      querySelectorAll: () => [], setAttribute(){}, getAttribute: () => null, removeAttribute(){},
      click(){}, closest: () => null, classList: { add(){}, remove(){}, contains: () => false } };
    nodes[id] = e; return e;
  }
  ['q','sort','listTitle','navs','recent','grid','detail','sync','note','upBtn','downBtn','expBtn','impBtn','impFile','gcBtn','capMeter'].forEach(mkEl);
  const body = mkEl('__body');
  const document = { body, getElementById: id => nodes[id] || null,
    createElement: () => mkEl('__e' + Math.random()), createTextNode: t => ({ nodeValue: String(t) }),
    querySelectorAll: () => [], addEventListener(){} };
  const ops = [];
  const w = {
    localStorage: ls, sessionStorage: { getItem: () => null, setItem(){}, removeItem(){} },
    document, navigator: { userAgent: 'test' },
    location: { href: '', search: opts.search || '', pathname: '/home.html', hash: '', replace(){} },
    history: { replaceState(){} }, alert(){}, confirm(){ return true; },
    setTimeout: () => 0, clearTimeout(){}, console: { log(){}, warn(){}, error(){} },
    URL: { createObjectURL: () => 'blob:', revokeObjectURL(){} }, AbortController: undefined,
    fetch(url, o){
      if (String(url).indexOf('version.txt') >= 0) return Promise.resolve({ ok: true, text: () => Promise.resolve(read('version.txt').trim()) });
      let b = null; try { b = JSON.parse((o && o.body) || '{}'); } catch(e){ b = {}; }
      ops.push(b.op);
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(opts.server(b)) });
    }
  };
  w.window = w; w.self = w;
  const ctx = vm.createContext(w);
  vm.runInContext(SRC579, ctx, { filename: 'f579' });
  vm.runInContext(SRC562, ctx, { filename: 'f562' });
  vm.runInContext(SRC564, ctx, { filename: 'f564' });
  vm.runInContext(SRC_GW, ctx, { filename: 'f660gw' });
  vm.runInContext(SRC_GC, ctx, { filename: 'f660gc' });
  vm.runInContext(SRC587, ctx, { filename: 'f587' });
  vm.runInContext(SRC590, ctx, { filename: 'f590' });
  vm.runInContext(HOME_JS, ctx, { filename: 'home' });
  return { w, ls, nodes, ops, fire: (id, t, ev) => { const f = listeners[id] && listeners[id][t]; return f ? f(ev || {}) : undefined; } };
}
/* 白鷺荘のフィクスチャ。local/remote のターン数と追加在庫を指定できる */
function fx(localT, remoteT, extraSeed, extraRemote){
  const meta = JSON.stringify([{ id: SLOT, name: '白鷺荘', key: 'chr6_slot_' + SLOT, updatedAt: 5 }]);
  const remoteLs = Object.assign({ 'chr6_slots_meta': meta, ['chr6_slot_' + SLOT]: story(remoteT) }, extraRemote || {});
  const seed = Object.assign({ v292ProxyPass: 'pw', 'chr6_slots_meta': meta,
    ['chr6_slot_' + SLOT]: story(localT), 'chr6_active_slot': JSON.stringify(SLOT),
    'v292Dfix402_baseRev': '0' }, extraSeed || {});
  const server = b => b.op === 'meta' ? { ok: true, rev: 492, ns: 'ns1234abcd', meta: { updatedAt: 9, device: 'Windows Chrome 10:52' } }
    : b.op === 'get' ? { ok: true, rev: 492, ns: 'ns1234abcd', data: { ls: remoteLs, updatedAt: 9 } }
    : b.op === 'commitstate' ? { ok: true, rev: 492, packageHash: 'PH', ns: 'ns1234abcd' } : { ok: false };
  return { seed, remoteLs, server };
}
const turnsOf = (ls, k) => { try { return JSON.parse(ls.getItem(k)).turns.length; } catch(e){ return -1; } };

(async () => {

/* =====================================================================
   (A) pull診断の常時表示
   ===================================================================== */
console.log('== (A) pull診断（0件のときほど出す） ==');
{
  ok('★診断関数がある', /function f661Diag/.test(HOME));
  ok('★★notes に必ず1行入れている（条件分岐の外で push）',
     /notes602\.push\('☁ サーバ: rev'/.test(HOME));
  ok('★★rev・端末・ターン数・ns・受信量を出す',
     /rev'\+f661d\.rev/.test(HOME) && /f661d\.device/.test(HOME) &&
     /f661d\.srvTurns/.test(HOME) && /f661d\.localTurns/.test(HOME) && /ns:'\+esc\(f661d\.ns\)/.test(HOME));
  ok('★★console にも受信キー数・bytes・スロット別ターン数を出す',
     /pull診断:/.test(HOME) && /out\.slots = list/.test(HOME));
}
{
  /* 差分0件（＝iPhone で起きた「取り込みました(0件)」）でも診断が出る */
  const F = fx(96, 96);
  const h = mkHome({ seed: F.seed, server: F.server });
  await settle();
  const n = h.nodes.note.innerHTML;
  ok('★★[実走] 0件でも診断行が出る', /☁ サーバ: rev492/.test(n), n);
  ok('★★サーバ側のターン数が出る（96T）', /chr6_slot_shirasagi 96T/.test(n), n);
  ok('★★この端末のターン数が出る（96T）', /この端末: 96T/.test(n), n);
  ok('★★ns が出る（別人格を見ていないかを画面で確かめられる）', /ns:ns1234/.test(n), n);
  ok('★★受信キー数・KBが出る（中身が空でないかを画面で確かめられる）', /受信\d+キー\/\d+KB/.test(n), n);
  ok('★取り込み件数の表示は従来どおり', /取り込みました/.test(h.nodes.sync.textContent), h.nodes.sync.textContent);
}
{
  /* サーバが空（＝別人格に解決されている疑いの再現）でも、それが画面で判る */
  const F = fx(10, 0, null, null);
  F.remoteLs = { 'chr6_slots_meta': '[]' };
  const server = b => b.op === 'meta' ? { ok: true, rev: 3, ns: 'OTHERns', meta: { updatedAt: 1, device: 'unknown' } }
    : b.op === 'get' ? { ok: true, rev: 3, ns: 'OTHERns', data: { ls: F.remoteLs, updatedAt: 1 } } : { ok: false };
  const h = mkHome({ seed: F.seed, server });
  await settle();
  const n = h.nodes.note.innerHTML;
  ok('★★別 ns が出れば「別人格を見ている」と判る', /ns:OTHERn/.test(n), n);
  ok('★★サーバ側にその物語が無いことも判る（—T 表示）', /shirasagi —T/.test(n), n);
  ok('★★この端末の10Tはそのまま（空で上書きしない）', turnsOf(h.ls, 'chr6_slot_' + SLOT) === 10);
}

/* =====================================================================
   (B) baseRev の正直化
   ===================================================================== */
console.log('\n== (B) baseRev は「基点だと名乗ってよい回」だけ採用する ==');
{
  ok('★★採用条件がソースにある（書込失敗0・halt0・skipped0・(書いた or 差分0)）',
     /f661AdoptRev = \(writeFailures\.length === 0 && haltBlocked === 0 && skipped\.length === 0\s*\n?\s*&& \(wrote > 0 \|\| diffCount === 0\)\)/.test(HOME));
  ok('★★据え置いた回は理由を console に残す', /baseRev据え置き:/.test(HOME));
}
{
  const F = fx(10, 96);
  const h = mkHome({ seed: F.seed, server: F.server });
  await settle();
  ok('★★全部取り込めた回は baseRev を採用する', h.ls.getItem('v292Dfix402_baseRev') === '492', h.ls.getItem('v292Dfix402_baseRev'));
  ok('★実際に96Tが入っている', turnsOf(h.ls, 'chr6_slot_' + SLOT) === 96);
}
{
  const F = fx(96, 96);
  const h = mkHome({ seed: F.seed, server: F.server });
  await settle();
  ok('★★差分そのものが0の回も採用する（本当に最新なので）',
     h.ls.getItem('v292Dfix402_baseRev') === '492', h.ls.getItem('v292Dfix402_baseRev'));
}
{
  const F = fx(120, 96);   /* ローカルの方が進んでいる＝skipped>0 */
  const h = mkHome({ seed: F.seed, server: F.server });
  await settle();
  ok('★★skipped>0 の回は据え置く（＝以後も取り込みに来られる）',
     h.ls.getItem('v292Dfix402_baseRev') === '0', h.ls.getItem('v292Dfix402_baseRev'));
  ok('★据え置いたことを画面にも出す', /基点は据え置き/.test(h.nodes.note.innerHTML), h.nodes.note.innerHTML);
  ok('★ローカルは守られたまま', turnsOf(h.ls, 'chr6_slot_' + SLOT) === 120);
}
{
  /* 書込失敗（quota）で解放もできない → 据え置き */
  const F = fx(10, 96);
  const quota = (k, v) => (k.indexOf('chr6_slot_') === 0 && v.length > 400);
  const ls = mkLS(F.seed, { quota });
  const h = mkHome({ ls, quota, server: F.server });
  await settle();
  ok('★★書けなかった回は据え置く（嘘の基点を作らない）',
     ls.getItem('v292Dfix402_baseRev') === '0', ls.getItem('v292Dfix402_baseRev'));
  ok('★★その回は⚠が必ず出る', /保存できませんでした/.test(h.nodes.note.innerHTML), h.nodes.note.innerHTML);
}

/* =====================================================================
   (C1) pre-flight（書込前の計画reclaim・複数単位）
   ===================================================================== */
console.log('\n== (C1) pre-flight: 足りない分を先に空けてから書く ==');
{
  ok('★pre-flight が書込ループの前にある',
     HOME.indexOf('f661pre = f661Preflight(ls, B602.blocked);') > 0 &&
     HOME.indexOf('f661pre = f661Preflight') < HOME.indexOf("if(k==='chr6_active_slot') continue;"));
  ok('★★平時経路(reclaimPlanned)を使う＝複数単位を解放してよい',
     /reclaimPlanned\(\{ needBytes: \(need - headroom\), reason: 'home-pull-preflight', maxUnits: 10 \}\)/.test(HOME));
  ok('★★GREEN候補だけ（BackupGC の plan units は review/protected/unknown を含まない）',
     /intent !== 'reclaim' && u\.intent !== 'retention'/.test(SRC_GC));
  ok('★★緊急経路(1単位制限)は最後の砦として残っている', /reclaimUrgent\(\{/.test(HOME));
}
{
  /* 古い控えを3件置き、1件では足りず複数解放が要る配置 */
  const extra = {};
  for (let i = 1; i <= 4; i++) extra['chr6_bk_saveto_' + SLOT + '_17000000' + (10 + i)] = JSON.stringify({ key: 'chr6_slot_' + SLOT, blob: story(30) });
  extra['chr6_bk_saveto_' + SLOT + '_1800000000'] = JSON.stringify({ key: 'chr6_slot_' + SLOT, blob: story(95) });   /* 最良の控え＝保護 */
  const F0 = fx(10, 96, extra);
  const used = usageOf(F0.seed);
  const big = story(96);
  const oldBig = F0.seed['chr6_slot_' + SLOT].length + ('chr6_slot_' + SLOT).length;
  /* いまのままでは書けないが、古い控えを2〜3件空ければ書ける容量にする */
  const cap = used - oldBig + ('chr6_slot_' + SLOT).length + big.length - 900;
  /* ★この端末は以前 quota を踏んで実効容量を学習済み、という状態から始める
     （初回は学習が無いので pre-flight は空振りし、緊急経路と⚠表示に落ちる＝下の枯渇ケース） */
  const F = fx(10, 96, Object.assign({ 'v292Dfix661_capBytes': String(cap) }, extra));
  const quota = mkQuota(cap);
  const ls = mkLS(F.seed, { quota });
  const h = mkHome({ ls, quota, server: F.server });
  await settle();
  ok('★★[実走] pre-flight で複数単位を解放し、96Tが書けた', turnsOf(ls, 'chr6_slot_' + SLOT) === 96, turnsOf(ls, 'chr6_slot_' + SLOT));
  ok('★★「自動でNKB空けました」を画面に出す', /自動で \d+KB 空けました（古い控え \d+ 件）/.test(h.nodes.note.innerHTML), h.nodes.note.innerHTML);
  ok('★★最良の控えは残っている（保護は絶対）', ls.getItem('chr6_bk_saveto_' + SLOT + '_1800000000') != null);
  ok('★★baseRev も採用される（全部取り込めたので）', ls.getItem('v292Dfix402_baseRev') === '492');
}
{
  /* GREEN が1件も無い → fail-closed。⚠を出し、baseRev も据え置く */
  const F = fx(10, 96);
  const quota = (k, v) => (k.indexOf('chr6_slot_') === 0 && v.length > 400);
  const ls = mkLS(F.seed, { quota });
  const h = mkHome({ ls, quota, server: F.server });
  await settle();
  ok('★★GREEN枯渇なら1バイトも消さない（fail-closed）',
     ls.__removed.filter(k => k.indexOf('chr6_bk_') === 0).length === 0, ls.__removed);
  ok('★★⚠と誘導文を出す',
     /保存できませんでした/.test(h.nodes.note.innerHTML) && /容量を空ける/.test(h.nodes.note.innerHTML), h.nodes.note.innerHTML);
  ok('★★物語データは1件も消えていない', turnsOf(ls, 'chr6_slot_' + SLOT) === 10);
  ok('★★踏んだ quota から実効容量を学習する（次回の pre-flight が効くようになる）',
     +(ls.getItem('v292Dfix661_capBytes') || 0) > 0, ls.getItem('v292Dfix661_capBytes'));
}

/* =====================================================================
   (C2) I11 世代交代（古い丸ごと控え）
   ===================================================================== */
console.log('\n== (C2) 収束した回だけ古い丸ごと控えを世代交代する ==');
function dumps(n){
  const o = {};
  for (let i = 0; i < n; i++){
    o['chr6_bk_cloudsync_' + (1700000000 + i)] = JSON.stringify({ ls: { ['chr6_slot_' + SLOT]: story(20 + i), 'chr6_v292Dfix54_x': '{}' } });
  }
  return o;
}
{
  const F = fx(10, 96, dumps(3));
  const h = mkHome({ seed: F.seed, server: F.server });
  await settle();
  const left = Object.keys(h.ls.__store).filter(k => k.indexOf('chr6_bk_cloudsync_') === 0);
  ok('★★収束した回は古い世代を整理し、最新1件だけ残す',
     left.length === 1 && left[0] === 'chr6_bk_cloudsync_1700000002', left);
  ok('★★整理したことを画面に出す', /古い丸ごと控え 2 件を整理しました/.test(h.nodes.note.innerHTML), h.nodes.note.innerHTML);
  ok('★★削除は DeleteGateway のログに intent:retention で残る', (() => {
    const log = h.w.__v292Dfix660gw.log().filter(e => e.key.indexOf('chr6_bk_cloudsync_') === 0);
    return log.length === 2 && log.every(e => e.intent === 'retention' && e.code === 'deleted');
  })(), h.w.__v292Dfix660gw.log().filter(e => e.key.indexOf('chr6_bk_cloudsync_') === 0).map(e => e.code));
}
{
  /* 収束していない回（skipped>0）では触らない */
  const F = fx(120, 96, dumps(3));
  const h = mkHome({ seed: F.seed, server: F.server });
  await settle();
  const left = Object.keys(h.ls.__store).filter(k => k.indexOf('chr6_bk_cloudsync_') === 0);
  ok('★★収束していない回は丸ごと控えに触らない', left.length === 3, left);
}
{
  /* 1件しか無ければ何もしない（最新1件は常に残す） */
  const F = fx(10, 96, dumps(1));
  const h = mkHome({ seed: F.seed, server: F.server });
  await settle();
  ok('★★丸ごと控えが1件だけなら何もしない',
     Object.keys(h.ls.__store).filter(k => k.indexOf('chr6_bk_cloudsync_') === 0).length === 1);
  ok('★★唯一の丸ごと控えは自動削除できない（ゲートウェイが拒否する）', (() => {
    const r = h.w.__v292Dfix660gc.retireOldFullDumps();
    return r.ok === false && h.ls.getItem('chr6_bk_cloudsync_1700000000') != null;
  })());
}

/* =====================================================================
   (C3) 起動時 autoGC
   ===================================================================== */
console.log('\n== (C3) 起動時の静かな整理 ==');
{
  ok('★起動時に autoGC を呼ぶ', /render\(\); f661AutoGC\(\); renderCapacity\(\);/.test(HOME));
  ok('★★目標KBは LS で変更できる（既定2000KB）',
     /function f661TargetKB\(\)\{ var v = \+\(g\('v292Dfix661TargetKB'\) \|\| 0\); return \(v > 0\) \? v : 2000; \}/.test(HOME));
  ok('★★1起動あたり最大10単位', /reason: 'home-boot-autogc', maxUnits: 10/.test(HOME));
  ok('★★OFF スイッチ v292Dfix661Off で自動系だけ止まる',
     /function f661on\(\)\{ return g\('v292Dfix661Off'\) !== '1'; \}/.test(HOME) &&
     /if\(!f661on\(\)\) return null;/.test(HOME));
  ok('★★手動UI(fix660)は OFF でも残る（非常口）',
     /function openGcPanel/.test(HOME) && !/f661on\(\)[\s\S]{0,80}openGcPanel/.test(HOME));
}
{
  const extra = {};
  for (let i = 1; i <= 6; i++) extra['chr6_bk_saveto_' + SLOT + '_17000000' + (10 + i)] = JSON.stringify({ key: 'chr6_slot_' + SLOT, blob: story(40) });
  extra['chr6_bk_saveto_' + SLOT + '_1800000000'] = JSON.stringify({ key: 'chr6_slot_' + SLOT, blob: story(95) });
  const F = fx(10, 10, Object.assign({ 'v292Dfix661TargetKB': '3' }, extra));   /* 目標3KB＝超過 */
  const h = mkHome({ seed: F.seed, server: F.server });
  await settle();
  const removed = h.ls.__removed.filter(k => k.indexOf('chr6_bk_saveto_') === 0);
  ok('★★目標超過なら起動時に静かに整理する', removed.length >= 1, removed);
  ok('★★最良の控えは残す', h.ls.getItem('chr6_bk_saveto_' + SLOT + '_1800000000') != null);
  ok('★★生きている物語は消さない', turnsOf(h.ls, 'chr6_slot_' + SLOT) === 10);
  ok('★★1起動あたり10単位まで', removed.length <= 10, removed.length);
}
{
  const extra = {};
  for (let i = 1; i <= 6; i++) extra['chr6_bk_saveto_' + SLOT + '_17000000' + (10 + i)] = JSON.stringify({ key: 'chr6_slot_' + SLOT, blob: story(40) });
  const F = fx(10, 10, Object.assign({ 'v292Dfix661TargetKB': '3', 'v292Dfix661Off': '1' }, extra));
  const h = mkHome({ seed: F.seed, server: F.server });
  await settle();
  ok('★★OFF なら1バイトも自動で消さない',
     h.ls.__removed.filter(k => k.indexOf('chr6_bk_') === 0).length === 0, h.ls.__removed);
  ok('★★OFF でも診断行は出る（観測は止めない）', /☁ サーバ: rev/.test(h.nodes.note.innerHTML));
  ok('★★OFF でも手動UIは使える', (() => {
    h.fire('gcBtn', 'click');
    return /容量を空ける/.test(h.nodes.note.innerHTML);
  })(), h.nodes.note.innerHTML.slice(0, 80));
}

/* =====================================================================
   (D) BackupGC の新API と保護原則
   ===================================================================== */
console.log('\n== (D) reclaimPlanned / retireOldFullDumps の契約 ==');
{
  const F = fx(10, 10, dumps(2));
  const h = mkHome({ seed: F.seed, server: F.server });
  await settle();
  const GC = h.w.__v292Dfix660gc;
  ok('★公開APIに reclaimPlanned / retireOldFullDumps がある',
     typeof GC.reclaimPlanned === 'function' && typeof GC.retireOldFullDumps === 'function');
  ok('★★reclaimPlanned は候補が無ければ何もしない（fail-closed）', (() => {
    GC._plan().units = [];
    const r = GC.reclaimPlanned({ needBytes: 999999, reason: 't' });
    return r.ok === false && r.freedBytes === 0;
  })());
  ok('★★reclaimPlanned は再入しない', (() => {
    GC.plan();
    let inner = null;
    const G = h.w.__v292Dfix660gw, orig = G.deleteUnit;
    G.deleteUnit = function(u, o){ if (inner === null) inner = GC.reclaimPlanned({ needBytes: 1 }); return orig.call(G, u, o); };
    GC.reclaimPlanned({ needBytes: 1, maxUnits: 1 });
    G.deleteUnit = orig;
    return inner === null || inner.code === 'reentrant';
  })());
  ok('★★retireOldFullDumps は最新1件を必ず kept として返す', (() => {
    const r = GC.retireOldFullDumps();
    return r.kept != null;
  })());
}

/* =====================================================================
   (E) 出荷の体裁
   ===================================================================== */
console.log('\n== (E) 出荷の体裁 ==');
{
  const ver = read('version.txt').trim();
  ok('★★HOME_BUILT と version.txt が同値', (HOME.match(/var HOME_BUILT = '([^']+)'/) || [])[1] === ver);
  const HTMLU = Buffer.from(fs.readFileSync(path.join(__dirname, 'index.html'), 'latin1'), 'latin1').toString('utf8');
  ok('★★BUILT と version.txt が同値', (HTMLU.match(/var BUILT = '([^']+)'/) || [])[1] === ver);
  ok('★★fix654 の BUILD も同値', (read('v292Dfix654-storage-trap.js').match(/BUILD\s*=\s*'([^']+)'/) || [])[1] === ver);
  ok('★home.html の直接削除は既存3か所のまま（fix661 で増やしていない）',
     (CODEHOME.match(/\.removeItem\s*\(/g) || []).length === 3,
     (CODEHOME.match(/\.removeItem\s*\(/g) || []).length);
  ok('★home.html に NUL / CRLF は無い', (() => {
    const b = fs.readFileSync(path.join(__dirname, 'home.html'));
    return b.filter(x => x === 0).length === 0 && b.indexOf(Buffer.from('\r\n')) < 0;
  })());
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);

})().catch(e => { console.error('FATAL', e); console.log('PASS ' + pass + ' / FAIL ' + (fail + 1)); process.exit(1); });
