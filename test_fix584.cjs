/* 回帰テスト: v292Dfix584 — fix402 も Coordinator の共有revを使う
 *
 * ★実機の実測で判明した問題（2026-07-26）
 *   fix582 で fix399 が共有revを使い始めた結果、同じ端末なのに版番号が2つに割れた。
 *     fix402 が baseRev=415（自前キー）で put → **fork**
 *     fix399 が baseRev=417（共有台帳）で put → 成功（共有revは418へ）
 *     fix402 の自前キーは 415 のまま
 *   GPT受け入れ条件「両経路が同じ Coordinator rev を使用」を満たしていなかった。
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const SRC402 = read('v292Dfix402-invisible-sync.js');
const SRC580 = read('v292Dfix580-meta-sync-coordinator.js');

function mkEnv(seed){
  const store = Object.assign({}, seed || {});
  const ls = {
    getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    key: i => { const a = Object.keys(store); return i < a.length ? a[i] : null; },
    get length(){ return Object.keys(store).length; }
  };
  const w = { localStorage: ls, console: { log(){}, warn(){}, error(){} },
    setTimeout: () => 0, setInterval: () => 0, clearTimeout(){}, clearInterval(){},
    fetch: () => Promise.reject(new Error('no-net')), JSON, Date, Error, Promise,
    navigator: { userAgent: 'node' }, location: { href: 'https://x/', search: '', origin: 'https://x' },
    document: { readyState: 'complete', addEventListener(){}, querySelector: () => null,
                querySelectorAll: () => [], getElementById: () => null, body: null, documentElement: null,
                createElement: () => ({ style:{}, setAttribute(){}, addEventListener(){}, appendChild(){}, remove(){}, classList:{add(){},remove(){}} }) },
    addEventListener(){}, removeEventListener(){}, confirm: () => false, alert(){} };
  w.window = w; w.__store = store;
  const ctx = vm.createContext(w);
  vm.runInContext(SRC580, ctx, { filename: 'v292Dfix580-meta-sync-coordinator.js' });
  return { w, ctx };
}
/* fix402 の baseRev/setBaseRev だけを、実物のソースから切り出して評価する */
function mk402(seed){
  const { w, ctx } = mkEnv(seed);
  const i = SRC402.indexOf('function sharedRev()');
  const j = SRC402.indexOf('\n  var mutationSeq', i) > 0 ? SRC402.indexOf('\n  var mutationSeq', i) : i + 2000;
  const body = SRC402.slice(i, SRC402.indexOf('function setBaseRev(v){', i) + 400);
  vm.runInContext(
    'function getNum(k){ var n = +(localStorage.getItem(k)||0); return n===n?n:0; }' +
    'function setNum(k,v){ localStorage.setItem(k, String(v)); }' +
    body + '; window.__probe402 = { baseRev: baseRev, setBaseRev: setBaseRev };',
    ctx, { filename: 'v292Dfix402-invisible-sync.js' });
  return w;
}

console.log('\n== (1) ソース: 共有台帳を正本にしている ==');
{
  ok('★sharedRev() がある', /function sharedRev\(\)/.test(SRC402));
  ok('★★baseRev() が共有台帳を優先する', /function baseRev\(\)\{[\s\S]{0,200}sharedRev\(\)/.test(SRC402));
  ok('★成功revは共有台帳へも昇格する', /c\.promoteRev\(\+v \|\| 0, 'fix402の同期成功'\)/.test(SRC402));
  ok('★自前キーへの直接setNumは残っていない（setBaseRev経由に統一）',
     (SRC402.match(/setNum\('v292Dfix402_baseRev'/g) || []).length === 1, 
     (SRC402.match(/setNum\('v292Dfix402_baseRev'/g) || []).length);
  ok('★緊急停止 v292Dfix584Off がある', SRC402.indexOf('v292Dfix584Off') > 0);
}

console.log('\n== (2) ★★実機で起きた食い違いが起きない ==');
{
  /* 実機の再現: 自前キー=415、共有台帳=418 */
  const w = mk402({ 'v292Dfix402_baseRev': '415', 'v292Dfix580_rev': '418' });
  ok('★★共有台帳(418)を使う（自前の415ではない）', w.__probe402.baseRev() === 418, w.__probe402.baseRev());
  ok('（実機ではこの食い違いで fork していた）', w.__store['v292Dfix402_baseRev'] === '415');
}

console.log('\n== (3) 成功revは両方へ書かれる ==');
{
  const w = mk402({ 'v292Dfix402_baseRev': '415', 'v292Dfix580_rev': '418' });
  w.__probe402.setBaseRev(420);
  ok('★自前キーも更新される（後方互換）', w.__store['v292Dfix402_baseRev'] === '420', w.__store['v292Dfix402_baseRev']);
  ok('★★共有台帳も更新される', w.__v292Dfix580.rev() === 420, w.__v292Dfix580.rev());
  ok('★両者が一致する', w.__probe402.baseRev() === 420, w.__probe402.baseRev());
}

console.log('\n== (4) 共有台帳は巻き戻さない（古い応答で下げない） ==');
{
  const w = mk402({ 'v292Dfix402_baseRev': '415', 'v292Dfix580_rev': '418' });
  w.__probe402.setBaseRev(400);
  ok('★★共有台帳は418のまま', w.__v292Dfix580.rev() === 418, w.__v292Dfix580.rev());
  ok('baseRev() も418を返す', w.__probe402.baseRev() === 418, w.__probe402.baseRev());
}

console.log('\n== (5) 緊急停止すれば自前キーへ戻る ==');
{
  const w = mk402({ 'v292Dfix402_baseRev': '415', 'v292Dfix580_rev': '418', 'v292Dfix584Off': '1' });
  ok('★自前キー(415)を使う', w.__probe402.baseRev() === 415, w.__probe402.baseRev());
}

console.log('\n== (6) 共有台帳が無い環境でも壊れない ==');
{
  const store = { 'v292Dfix402_baseRev': '415' };
  const w = { localStorage: {
      getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
      setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; },
      key: i => Object.keys(store)[i] || null, get length(){ return Object.keys(store).length; } },
    console: { log(){}, warn(){}, error(){} }, JSON, Date };
  w.window = w;
  const ctx = vm.createContext(w);
  const i = SRC402.indexOf('function sharedRev()');
  const body = SRC402.slice(i, SRC402.indexOf('function setBaseRev(v){', i) + 400);
  vm.runInContext('function getNum(k){ var n = +(localStorage.getItem(k)||0); return n===n?n:0; }' +
    'function setNum(k,v){ localStorage.setItem(k, String(v)); }' + body +
    '; window.__p = { baseRev: baseRev, setBaseRev: setBaseRev };', ctx, { filename: 'v292Dfix402-invisible-sync.js' });
  ok('★共有台帳が無くても自前キーで動く', w.__p.baseRev() === 415, w.__p.baseRev());
  w.__p.setBaseRev(416);
  ok('★書込みも壊れない', store['v292Dfix402_baseRev'] === '416', store);
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
