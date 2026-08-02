#!/usr/bin/env node
/* test_fix662.cjs — 通知位置の修正と、全自動チェーン「上げて→降格→取り込む」
 *
 * ■背景(2026-08-02 遠隔診断の確定事実)
 *   iPhone は同一ns・16物語中15一致で、白鷺荘(~250KB)の書込だけ quota で失敗し続けていた。
 *   GREEN候補は枯渇し、大物は「唯一の fullDump 597KB(protected)」と unknown 71KB だけ。
 *   つまり**自動で消せるものが1つも無い**。さらに ⚠ も診断行も画面下部に出ていて見えていなかった。
 *
 * ■このテストが固定する契約
 *   (A) 通知は sync ヘッダ直下＝画面最上部。3行以上は折りたたむ
 *   (B) 不足 && GREEN枯渇 → ①put(200 ok=保存証明) ②唯一のfullDumpも降格 ③書込続行
 *   (C) put が失敗したら**1バイトも消さない**（どの段で止まったかを表示）
 *   (D) 証明トークン: 無い / 6分前 → 唯一の復元点は従来どおり拒否
 *   (E) fork:true 応答も保存証明として成立する
 *   (F) hard は証明があっても絶対に消えない
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

const story = n => JSON.stringify({ turns: new Array(n).fill(0).map((_, i) => ({ i })) });
const SLOT = 'shirasagi';
const settle = async (n = 400) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };

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
    const e = { id, value: '', textContent: '', innerHTML: '', className: '', style: { cssText: '', display: '' }, checked: false,
      children: [], addEventListener(t, f){ (listeners[id] = listeners[id] || {})[t] = f; },
      appendChild(c){ e.children.push(c); return c; }, removeChild(){}, remove(){},
      querySelectorAll: () => [], setAttribute(){}, getAttribute: () => null, removeAttribute(){},
      click(){}, closest: () => null, classList: { add(){}, remove(){}, contains: () => false } };
    nodes[id] = e; return e;
  }
  ['q','sort','listTitle','navs','recent','grid','detail','sync','note','upBtn','downBtn','expBtn','impBtn','impFile','gcBtn','capMeter','noteMore','noteRest'].forEach(mkEl);
  const body = mkEl('__body');
  const document = { body, getElementById: id => nodes[id] || null,
    createElement: () => mkEl('__e' + Math.random()), createTextNode: t => ({ nodeValue: String(t) }),
    querySelectorAll: () => [], addEventListener(){} };
  const sent = [];
  const w = {
    localStorage: ls, sessionStorage: { getItem: () => null, setItem(){}, removeItem(){} },
    document, navigator: { userAgent: 'iPhone Safari' },
    location: { href: '', search: opts.search || '', pathname: '/home.html', hash: '', replace(){} },
    history: { replaceState(){} }, alert(){}, confirm(){ return true; },
    setTimeout: () => 0, clearTimeout(){}, console: { log(){}, warn(){}, error(){} },
    URL: { createObjectURL: () => 'blob:', revokeObjectURL(){} }, AbortController: undefined,
    fetch(url, o){
      if (String(url).indexOf('version.txt') >= 0) return Promise.resolve({ ok: true, text: () => Promise.resolve(read('version.txt').trim()) });
      let b = null; try { b = JSON.parse((o && o.body) || '{}'); } catch(e){ b = {}; }
      sent.push(b);
      const r = opts.server(b);
      if (r && r.__reject) return Promise.reject(new Error('network'));
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(r) });
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
  return { w, ls, nodes, sent, fire: (id, t, ev) => { const f = listeners[id] && listeners[id][t]; return f ? f(ev || {}) : undefined; } };
}
const turnsOf = (ls, k) => { try { return JSON.parse(ls.getItem(k)).turns.length; } catch(e){ return -1; } };

/* iPhone 相当の在庫: 唯一の fullDump(大)・GREEN枯渇・白鷺荘だけ小さい */
const DUMP = 'chr6_bk_cloudsync_1784942016';
function iphoneFixture(opts){
  opts = opts || {};
  const meta = JSON.stringify([{ id: SLOT, name: '白鷺荘', key: 'chr6_slot_' + SLOT, updatedAt: 5 }]);
  const seed = {
    v292ProxyPass: 'pw', 'chr6_slots_meta': meta, 'chr6_active_slot': JSON.stringify(SLOT),
    ['chr6_slot_' + SLOT]: story(10), 'v292Dfix402_baseRev': '0',
    /* 唯一の丸ごと控え(サイドストア込み)＝protected。ここしか空けるところが無い */
    [DUMP]: JSON.stringify({ ls: { ['chr6_slot_' + SLOT]: story(120), 'chr6_v292Dfix54_x': '{}' } })
  };
  const remoteLs = { 'chr6_slots_meta': meta, ['chr6_slot_' + SLOT]: story(96) };
  /* この端末では「解放しないと白鷺荘96Tが書けない」容量にする */
  const used = usageOf(seed);
  const bigKey = 'chr6_slot_' + SLOT, big = story(96);
  const cap = used - (bigKey.length + seed[bigKey].length) + bigKey.length + big.length - 200;
  seed['v292Dfix661_capBytes'] = String(cap);     /* 実効容量は学習済み */
  const quota = (k, v, store) => {
    let u = 0; for (const kk in store) u += kk.length + String(store[kk]).length;
    if (Object.prototype.hasOwnProperty.call(store, k)) u -= (k.length + String(store[k]).length);
    return (u + k.length + String(v).length) > cap;
  };
  const putReply = opts.putReply || (() => ({ ok: true, rev: 493, requestId: 'rq1' }));
  const server = b => {
    if (b.op === 'meta') return { ok: true, rev: 492, ns: 'ns1234', meta: { updatedAt: 9, device: 'Windows' } };
    if (b.op === 'get')  return { ok: true, rev: 492, ns: 'ns1234', data: { ls: remoteLs, updatedAt: 9 } };
    if (b.op === 'put')  return putReply(b);
    if (b.op === 'commitstate') return { ok: true, rev: 492, packageHash: 'PH', ns: 'ns1234' };
    return { ok: false };
  };
  return { seed, remoteLs, server, quota, cap };
}

/* GW 単体（証明トークンの検証を直接叩く） */
function mkGw(seed){
  const ls = mkLS(seed);
  const sb = { localStorage: ls, console: { log(){}, warn(){}, error(){} },
    setTimeout: () => 0, clearTimeout(){}, setInterval: () => 0, clearInterval(){},
    Date, JSON, Math, Object, Array, String, Number, parseInt, isFinite, Promise, RegExp, Error,
    document: { readyState: 'complete', addEventListener(){}, body: {} } };
  sb.window = sb; vm.createContext(sb);
  vm.runInContext(SRC562, sb); vm.runInContext(SRC_GW, sb); vm.runInContext(SRC_GC, sb);
  return { sb, ls, GW: sb.window.__v292Dfix660gw, GC: sb.window.__v292Dfix660gc };
}

(async () => {

/* =====================================================================
   (A) 通知の位置
   ===================================================================== */
console.log('== (A) 通知は画面最上部（sync ヘッダ直下） ==');
{
  const iHeader = HOME.indexOf('</header>');
  const iNote = HOME.indexOf('<div id="note"></div>');
  const iMain = HOME.indexOf('<main>');
  ok('★★note 要素は </header> の直後にある', iNote > iHeader && iNote < iMain, { iHeader, iNote, iMain });
  ok('★★一覧(grid)より前にある（スクロール不要で目に入る）',
     iNote < HOME.indexOf('<div class="grid" id="grid">'));
  ok('★★一覧の下にあった旧位置は消えている',
     !/<div class="grid" id="grid"><\/div>\s*<div id="note"><\/div>/.test(HOME));
  ok('★通知帯のスタイルがある', /#note \.note\{/.test(HOME));
  ok('★★3行以上は折りたたむ（先頭2行は必ず見せる）',
     /function showNotes/.test(HOME) && /a\.slice\(0, 2\)/.test(HOME) && /詳しく（あと/.test(HOME));
  ok('★★⚠ の行を先頭へ並べ替える', /notes602\.sort\(function\(a, b\)\{ return \(b\.indexOf\('⚠'\)/.test(HOME));
}

/* =====================================================================
   (B) 全自動チェーン
   ===================================================================== */
console.log('\n== (B) チェーン「上げて→降格→取り込む」 ==');
{
  const F = iphoneFixture();
  const ls = mkLS(F.seed, { quota: F.quota });
  const h = mkHome({ ls, quota: F.quota, server: F.server });
  await settle();
  const puts = h.sent.filter(b => b.op === 'put');
  ok('★★① 自動 put が1回だけ飛ぶ', puts.length === 1, puts.length);
  ok('★★put は home の収集経路(full pkg)を使う', puts[0] && puts[0].pkg && puts[0].pkg.full === true, puts[0] && Object.keys(puts[0].pkg || {}));
  ok('★★② 唯一の fullDump が降格(解放)された', ls.getItem(DUMP) == null);
  ok('★★③ 白鷺荘96Tが書けた', turnsOf(ls, 'chr6_slot_' + SLOT) === 96, turnsOf(ls, 'chr6_slot_' + SLOT));
  const n = h.nodes.note.innerHTML;
  ok('★★チェーンの各段が1行ずつ出る（保存→解放）',
     /現状をサーバーに保存しました/.test(n) && /古い控えを \d+KB 解放しました/.test(n), n);
  ok('★★取り込み結果も出る', /取り込みました/.test(h.nodes.sync.textContent), h.nodes.sync.textContent);
  ok('★★降格は DeleteGateway のログに intent:retention-after-server-backup で残る', (() => {
    const log = h.w.__v292Dfix660gw.log().filter(e => e.key === DUMP);
    return log.length === 1 && log[0].intent === 'retention-after-server-backup' && log[0].code === 'deleted';
  })(), h.w.__v292Dfix660gw.log().filter(e => e.key === DUMP).map(e => [e.intent, e.code]));
  ok('★★生きている物語そのものには触れていない', ls.__removed.every(k => k.indexOf('chr6_slot_') !== 0), ls.__removed);
  ok('★baseRev も採用される（全部取り込めたので）', ls.getItem('v292Dfix402_baseRev') === '492');
}
{
  /* fork:true 応答も保存証明として成立する（Worker v18: fork保存の失敗は503） */
  const F = iphoneFixture({ putReply: () => ({ ok: true, fork: true, server: { rev: 492, device: 'Windows' }, requestId: 'rq2' }) });
  const ls = mkLS(F.seed, { quota: F.quota });
  const h = mkHome({ ls, quota: F.quota, server: F.server });
  await settle();
  ok('★★fork:true でも保存証明として成立し、チェーンが完走する',
     ls.getItem(DUMP) == null && turnsOf(ls, 'chr6_slot_' + SLOT) === 96, turnsOf(ls, 'chr6_slot_' + SLOT));
  ok('★★別分岐として保管された旨を表示する', /別分岐として保管/.test(h.nodes.note.innerHTML), h.nodes.note.innerHTML);
}
{
  /* put が 503 → 1バイトも消さない */
  const F = iphoneFixture({ putReply: () => ({ ok: false, error: 'fork save failed', errorCode: 'unavailable' }) });
  const ls = mkLS(F.seed, { quota: F.quota });
  const h = mkHome({ ls, quota: F.quota, server: F.server });
  await settle();
  ok('★★put が失敗したら1バイトも消さない', ls.getItem(DUMP) != null && ls.__removed.length === 0, ls.__removed);
  ok('★★ローカルの物語も無傷', turnsOf(ls, 'chr6_slot_' + SLOT) === 10);
  ok('★★どの段で止まったかを表示する',
     /サーバーへ保存できなかったので/.test(h.nodes.note.innerHTML), h.nodes.note.innerHTML);
  ok('★★sync も失敗として出す', /容量が足りず取り込めませんでした/.test(h.nodes.sync.textContent), h.nodes.sync.textContent);
}
{
  /* ネットワーク例外でも同じ（1バイトも消さない） */
  const F = iphoneFixture({ putReply: () => ({ __reject: true }) });
  const ls = mkLS(F.seed, { quota: F.quota });
  const h = mkHome({ ls, quota: F.quota, server: F.server });
  await settle();
  ok('★★通信例外でも1バイトも消さない', ls.getItem(DUMP) != null && ls.__removed.length === 0, ls.__removed);
  ok('★★中止したことを表示する', /何も消さずに中止|何も消していません/.test(h.nodes.note.innerHTML), h.nodes.note.innerHTML);
}
{
  /* 未ログインならチェーンに入らない（put しない） */
  const F = iphoneFixture();
  delete F.seed.v292ProxyPass;
  const ls = mkLS(F.seed, { quota: F.quota });
  const h = mkHome({ ls, quota: F.quota, server: F.server });
  await settle();
  ok('★★未ログインでは put しない', h.sent.filter(b => b.op === 'put').length === 0);
  ok('★★その場合も1バイトも消さない', ls.getItem(DUMP) != null);
}
{
  /* 自動系 OFF ならチェーンに入らない */
  const F = iphoneFixture();
  F.seed['v292Dfix661Off'] = '1';
  const ls = mkLS(F.seed, { quota: F.quota });
  const h = mkHome({ ls, quota: F.quota, server: F.server });
  await settle();
  ok('★★v292Dfix661Off で自動チェーンは走らない',
     h.sent.filter(b => b.op === 'put').length === 0 && ls.getItem(DUMP) != null);
  ok('★★それでも ⚠ と診断行は出る（観測は止めない）',
     /保存できませんでした/.test(h.nodes.note.innerHTML) && /☁ サーバ: rev/.test(h.nodes.note.innerHTML),
     h.nodes.note.innerHTML);
}

/* =====================================================================
   (C) 証明トークンの検証
   ===================================================================== */
console.log('\n== (C) サーバー保存証明トークン ==');
function soleSeed(){
  const meta = JSON.stringify([{ id: SLOT, name: 'x', key: 'chr6_slot_' + SLOT, updatedAt: 1 }]);
  return { 'chr6_slots_meta': meta, ['chr6_slot_' + SLOT]: story(5),
           [DUMP]: JSON.stringify({ ls: { ['chr6_slot_' + SLOT]: story(50), 'chr6_v292Dfix54_x': '{}' } }) };
}
{
  const { ls, GW, GC } = mkGw(soleSeed());
  const raw = ls.getItem(DUMP);
  const tok = { key: DUMP, hash: GW._hash(raw), bytes: raw.length, family: 'story-backup',
                intent: 'retention-after-server-backup', policyVersion: 1 };
  ok('★★証明が無ければ拒否（server-proof-required）',
     GW.deleteExact(tok).code === 'server-proof-required' && ls.getItem(DUMP) != null);
  const old = Object.assign({}, tok, { serverProof: { serverConfirmedAt: Date.now() - 6 * 60 * 1000, rev: 1 } });
  ok('★★6分前の証明は無効（拒否）', GW.deleteExact(old).code === 'server-proof-required' && ls.getItem(DUMP) != null);
  const future = Object.assign({}, tok, { serverProof: { serverConfirmedAt: Date.now() + 60000, rev: 1 } });
  ok('★未来の時刻も無効', GW.deleteExact(future).code === 'server-proof-required');
  const noRev = Object.assign({}, tok, { serverProof: { serverConfirmedAt: Date.now() } });
  ok('★rev も fork も無い応答は証明にしない', GW.deleteExact(noRev).code === 'server-proof-required');
  const good = Object.assign({}, tok, { serverProof: { serverConfirmedAt: Date.now(), rev: 493, requestId: 'r' } });
  ok('★★5分以内の証明があれば「唯一の復元点」でも降格できる（I11の引継ぎ）',
     GW.deleteExact(good).ok === true && ls.getItem(DUMP) == null);
  ok('★TTL は5分', GW.SERVER_PROOF_TTL_MS === 5 * 60 * 1000, GW.SERVER_PROOF_TTL_MS);
  void GC;
}
{
  /* hard は証明があっても絶対に消えない */
  const { ls, GW } = mkGw(soleSeed());
  const key = 'chr6_slot_' + SLOT, raw = ls.getItem(key);
  const r = GW.deleteExact({ key, hash: GW._hash(raw), bytes: raw.length, family: 'live-story', slotId: SLOT,
                             intent: 'retention-after-server-backup', policyVersion: 1,
                             serverProof: { serverConfirmedAt: Date.now(), rev: 1 } });
  ok('★★hard(生きている物語)は証明があっても消えない', r.ok === false && ls.getItem(key) != null, r);
  const meta = 'chr6_slots_meta', mraw = ls.getItem(meta);
  const r2 = GW.deleteExact({ key: meta, hash: GW._hash(mraw), bytes: mraw.length, family: 'live-index',
                              intent: 'retention-after-server-backup', policyVersion: 1,
                              serverProof: { serverConfirmedAt: Date.now(), rev: 1 } });
  ok('★★物語一覧(台帳)も消えない', r2.ok === false && ls.getItem(meta) != null, r2);
}
{
  /* retireOldFullDumps: 証明の有無で「唯一の1件」の扱いが変わる */
  const { ls, GC } = mkGw(soleSeed());
  const noProof = GC.retireOldFullDumps();
  ok('★★証明なしなら唯一の1件は残す（従来どおり）',
     noProof.ok === false && noProof.kept === DUMP && ls.getItem(DUMP) != null, noProof);
  const withProof = GC.retireOldFullDumps({ serverProof: { serverConfirmedAt: Date.now(), rev: 9 } });
  ok('★★証明ありなら唯一の1件も降格する', withProof.ok === true && ls.getItem(DUMP) == null, withProof);
}

/* =====================================================================
   (D) 出荷の体裁
   ===================================================================== */
console.log('\n== (D) 出荷の体裁 ==');
{
  const ver = read('version.txt').trim();
  const HTMLU = Buffer.from(fs.readFileSync(path.join(__dirname, 'index.html'), 'latin1'), 'latin1').toString('utf8');
  ok('★★BUILT / HOME_BUILT / fix654 BUILD が version.txt と同値',
     (HTMLU.match(/var BUILT = '([^']+)'/) || [])[1] === ver &&
     (HOME.match(/var HOME_BUILT = '([^']+)'/) || [])[1] === ver &&
     (read('v292Dfix654-storage-trap.js').match(/BUILD\s*=\s*'([^']+)'/) || [])[1] === ver, ver);
  ok('★home.html の直接削除は既存3か所のまま（fix662 で増やしていない）',
     (stripBlockAll(HOME).match(/\.removeItem\s*\(/g) || []).length === 3,
     (stripBlockAll(HOME).match(/\.removeItem\s*\(/g) || []).length);
  ok('★★自動putはこのページで最大1回（フラグで固定）', /f662ChainDone = false/.test(HOME) && /f662ChainDone = true;/.test(HOME));
  ok('★★put の確認前に削除しない順序（put→retire の順に書かれている）',
     HOME.indexOf('f662ServerBackup()') < HOME.indexOf('retireOldFullDumps({ serverProof: proof'));
  ok('★home.html に NUL / CRLF は無い', (() => {
    const b = fs.readFileSync(path.join(__dirname, 'home.html'));
    return b.filter(x => x === 0).length === 0 && b.indexOf(Buffer.from('\r\n')) < 0;
  })());
}
function stripBlockAll(s){ return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' '); }

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);

})().catch(e => { console.error('FATAL', e); console.log('PASS ' + pass + ' / FAIL ' + (fail + 1)); process.exit(1); });
