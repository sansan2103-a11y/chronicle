/* 回帰テスト: v292Dfix576 — GPT裁定2件
 *   (A) fix575の修正: 「ゲートが見つからない」を旧削除経路への**自動フォールバックにしない**
 *       → v292Dfix575Off='1' の明示的ロールバック時だけ旧経路。それ以外は policy-unavailable で中止。
 *   (B) A2: fix490Quota にも同じ単発ゲート方式を適用
 *       → protected 等はその場で失敗を返し、**別候補へ進まない**
 *       → 失敗の意味は「新しいguard控えを作れなかった」だけ。**本体セーブは巻き戻さない**
 *       → backupSkipped と理由がメモリログに残る
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };

const SRC399 = fs.readFileSync(path.join(__dirname, 'v292Dfix399-cloudsync.js'), 'utf8');
const SRC490 = fs.readFileSync(path.join(__dirname, 'v292Dfix490-slot-write-guard.js'), 'utf8');

function mkEnv(seed, quota, gate, opt){
  opt = opt || {};
  const store = {};
  Object.keys(seed || {}).forEach(k => { store[k] = seed[k]; });
  let used = 0; Object.keys(store).forEach(k => used += k.length + store[k].length);
  const cap = quota == null ? Infinity : (quota === 'tight' ? used : used + quota);
  const nativeRemove = function(k){ if (store[k] != null){ used -= k.length + store[k].length; delete store[k]; } };
  const legacyRemoved = [];
  const ls = {
    getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: function(k, v){
      const add = String(k).length + String(v).length - (store[k] != null ? String(store[k]).length : 0);
      if (used + add > cap){ const e = new Error('q'); e.name = 'QuotaExceededError'; throw e; }
      used += add; store[k] = String(v);
    },
    removeItem: function(k){ legacyRemoved.push(k); nativeRemove(k); },   /* 旧経路の目印 */
    key: i => Object.keys(store)[i], get length(){ return Object.keys(store).length; }
  };
  const gateCalls = [];
  const el = { querySelectorAll: () => [], querySelector: () => null, addEventListener(){}, appendChild(){}, setAttribute(){}, style: {}, remove(){}, classList:{add(){},remove(){},contains:()=>false} };
  const doc = { hidden:false, visibilityState:'visible', readyState:'complete', documentElement: el, body: el,
    querySelectorAll: () => [], querySelector: () => null, getElementById: () => null, addEventListener(){},
    createElement: () => ({ style:{}, setAttribute(){}, addEventListener(){}, appendChild(){}, remove(){}, classList:{add(){},remove(){}} }) };
  const w = { localStorage: ls, document: doc, console:{ log(){}, warn(){}, error(){} },
    setTimeout: () => 0, setInterval: () => 0, clearTimeout(){}, clearInterval(){},
    fetch: () => Promise.reject(new Error('no-net')),
    indexedDB: { open: () => ({ addEventListener(){}, set onsuccess(v){}, set onerror(v){}, set onupgradeneeded(v){} }) },
    navigator:{ userAgent:'node' }, location:{ href:'https://x/', search:'', origin:'https://x' },
    confirm: () => true, addEventListener(){}, removeEventListener(){} };
  if (gate){
    w.__v292Dfix569 = { tryDeleteExact: function(req){
      gateCalls.push(req);
      const v = gate.verdict;
      if (v === 'deleted'){ if (!gate.lie) nativeRemove(req.key); return { ok:true, deleted:true, code:'deleted', key:req.key }; }
      return { ok:false, deleted:false, code:v, key:req.key };
    } };
  }
  w.window = w; w.__store = store; w.__gateCalls = gateCalls; w.__legacyRemoved = legacyRemoved;
  const ctx = vm.createContext(w);
  (opt.load || []).forEach(function(src, i){ vm.runInContext(src, ctx, { filename: 'm' + i }); });
  return w;
}

const PKG = { schema: 1, ls: { 'chr6': null }, idb: {} };
const BASE = { 'chr6': JSON.stringify({turns:[{},{}]}), 'chr6_active_slot': JSON.stringify('default') };
const listBk = w => Object.keys(w.__store).filter(k => /^chr6_bk_cloudsync_\d+$/.test(k)).sort();

console.log('\n== (A1) ソース: ゲート未搭載の自動フォールバックが無い ==');
{
  ok('★gateOff() と gateway() が分離している',
     /function gateOff\(\)/.test(SRC399) && /function gateway\(\)/.test(SRC399));
  ok('★gateway() の中で Off を見ていない(=未搭載と緊急停止を混同しない)',
     !/if \(gateOff\(\)\) return null;/.test(SRC399));
  ok('★明示ロールバックを記録する', SRC399.indexOf('rollbackModeUsed') > 0);
  ok('★未搭載時は policy-unavailable として中止', /code: 'policy-unavailable'/.test(SRC399));
}

console.log('\n== (A2) 実挙動: ゲート未搭載なら旧経路へ戻らず中止する ==');
{
  const K = 'chr6_bk_cloudsync_1780000000000';
  const seed = Object.assign({}, BASE); seed[K] = 'x'.repeat(300);
  const w = mkEnv(seed, 'tight', null, { load: [SRC399] });
  const r = w.__v292Dfix399x.backupBeforeApply(PKG);
  ok('★false(取り込み中止)', r === false, r);
  ok('★★候補は消えていない', w.__store[K] != null, listBk(w));
  ok('★★旧経路(removeItem)を呼んでいない', w.__legacyRemoved.indexOf(K) < 0, w.__legacyRemoved);
  const log = w.__v292Dfix399x.bkLog().mem;
  ok('理由が policy-unavailable として残る',
     log.some(x => x.code === 'policy-unavailable'), log);
}

console.log('\n== (A3) 明示ロールバック(v292Dfix575Off=1)のときだけ旧経路 ==');
{
  const K = 'chr6_bk_cloudsync_1780000000000';
  const seed = Object.assign({}, BASE); seed[K] = 'x'.repeat(300); seed['v292Dfix575Off'] = '1';
  const w = mkEnv(seed, 'tight', { verdict:'protected' }, { load: [SRC399] });
  const r = w.__v292Dfix399x.backupBeforeApply(PKG);
  ok('★旧経路で控えが書ける(緊急停止として機能する)', r === true, r);
  ok('★ゲートは呼ばない', w.__gateCalls.length === 0, w.__gateCalls);
  ok('★rollbackModeUsed が記録される',
     w.__v292Dfix399x.bkLog().mem.some(x => x.act === 'rollbackModeUsed'), w.__v292Dfix399x.bkLog().mem);
}

console.log('\n== (B1) ソース: fix490Quota も同じ単発ゲート方式 ==');
{
  ok('★tryDeleteExact を通す', SRC490.indexOf('tryDeleteExact') > 0);
  ok('★path=fix490Quota を申告', /path: 'fix490Quota'/.test(SRC490));
  ok('★intent=reclaim を申告', /intent: 'reclaim'/.test(SRC490));
  ok('★expectedBytes を渡す', /expectedBytes: raw\.length/.test(SRC490));
  ok('★呼び出し元でも read-back する', SRC490.indexOf('delete-readback-failed') > 0);
  ok('★backupSkipped を数える', SRC490.indexOf('stats.backupSkipped++') > 0);
  ok('★メモリログ dropLog を出す', SRC490.indexOf('dropLog:') > 0);
  ok('★未搭載時は旧経路へ戻らない', SRC490.indexOf("reason:'gateway-unavailable'") > 0);
  ok('★緊急停止 v292Dfix576Off がある', SRC490.indexOf('v292Dfix576Off') > 0);
}

/* fix490 の quota 経路は本体書込に埋まっているので、モジュールが出している検証口
   _dropOldestGuardBackup（**実物**）を叩く。テスト用のコピーを作ると本物と乖離するため。 */
function mk490(seed, gate, off576){
  const s = Object.assign({}, seed);
  if (off576) s['v292Dfix576Off'] = '1';
  const w = mkEnv(s, null, gate, { load: [SRC490] });
  w.__probeDrop = w.__v292Dfix490._dropOldestGuardBackup;
  return w;
}

console.log('\n== (B2) 実挙動: protected なら削除せず backup-skipped ==');
{
  /* 孤児控え2件（スロットは存在しない=候補になる） */
  const seed = Object.assign({}, BASE, {
    'chr6_bk_guard_gone1_1780000000000': 'aaa',
    'chr6_bk_guard_gone1_1780000001000': 'bbb'
  });
  const w = mk490(seed, { verdict:'protected' });
  const r = w.__probeDrop();
  ok('★false を返す(控えを諦める)', r === false, r);
  ok('★★候補は消えていない', w.__store['chr6_bk_guard_gone1_1780000000000'] != null, Object.keys(w.__store));
  ok('★1回だけ問い合わせて別候補へ進まない', w.__gateCalls.length === 1, w.__gateCalls);
  ok('★旧経路(removeItem)を呼んでいない', w.__legacyRemoved.length === 0, w.__legacyRemoved);
  const dl = w.__v292Dfix490.dropLog();
  ok('★backup-skipped と理由が残る',
     dl.some(x => x.result === 'backup-skipped' && x.reason === 'protected'), dl);
  ok('★backupSkipped が増える', w.__v292Dfix490.stats().backupSkipped >= 1, w.__v292Dfix490.stats());
}

console.log('\n== (B3) 実挙動: 安全候補なら1件だけ消える ==');
{
  const seed = Object.assign({}, BASE, {
    'chr6_bk_guard_gone1_1780000000000': 'aaa',
    'chr6_bk_guard_gone1_1780000001000': 'bbb'
  });
  const w = mk490(seed, { verdict:'deleted' });
  const r = w.__probeDrop();
  ok('★true を返す', r === true, r);
  ok('★★消えたのは1件だけ',
     Object.keys(w.__store).filter(k => /^chr6_bk_guard_/.test(k)).length === 1, Object.keys(w.__store));
  ok('★ゲート呼び出しも1回', w.__gateCalls.length === 1, w.__gateCalls);
  const c0 = w.__gateCalls[0] || {};
  ok('★path/intent/expectedBytes を申告',
     c0.path === 'fix490Quota' && c0.intent === 'reclaim' && c0.expectedBytes === 3, c0);
  ok('★dropped が記録される',
     w.__v292Dfix490.dropLog().some(x => x.result === 'dropped'), w.__v292Dfix490.dropLog());
}

console.log('\n== (B4) 実挙動: ゲート未搭載なら旧経路へ戻らない ==');
{
  const seed = Object.assign({}, BASE, {
    'chr6_bk_guard_gone1_1780000000000': 'aaa',
    'chr6_bk_guard_gone1_1780000001000': 'bbb'
  });
  const w = mk490(seed, null);
  const r = w.__probeDrop();
  ok('★false を返す', r === false, r);
  ok('★★1件も消えていない',
     Object.keys(w.__store).filter(k => /^chr6_bk_guard_/.test(k)).length === 2, Object.keys(w.__store));
  ok('★旧経路を呼んでいない', w.__legacyRemoved.length === 0, w.__legacyRemoved);
  ok('★gateway-unavailable として残る',
     w.__v292Dfix490.dropLog().some(x => x.reason === 'gateway-unavailable'), w.__v292Dfix490.dropLog());
}

console.log('\n== (B5) 実挙動: v292Dfix576Off=1 なら旧経路(緊急停止) ==');
{
  const seed = Object.assign({}, BASE, {
    'chr6_bk_guard_gone1_1780000000000': 'aaa',
    'chr6_bk_guard_gone1_1780000001000': 'bbb'
  });
  const w = mk490(seed, { verdict:'protected' }, true);
  const r = w.__probeDrop();
  ok('★true(旧経路で消える)', r === true, r);
  ok('★ゲートは呼ばない', w.__gateCalls.length === 0, w.__gateCalls);
  ok('★rollbackModeUsed が残る',
     w.__v292Dfix490.dropLog().some(x => x.result === 'rollbackModeUsed'), w.__v292Dfix490.dropLog());
}

console.log('\n== (B6) 「残り1件のスロットの控え」は候補にすらしない(fix565の契約) ==');
{
  /* 生きているスロットが1件だけ控えを持つ → 消せる候補が無い */
  const seed = Object.assign({}, BASE, {
    'chr6_slot_alive': JSON.stringify({turns:[{},{},{}]}),
    'chr6_bk_guard_alive_1780000000000': 'aaa'
  });
  const w = mk490(seed, { verdict:'deleted' });
  const r = w.__probeDrop();
  ok('★false(唯一の控えは守る)', r === false, r);
  ok('★★ゲートにすら渡さない', w.__gateCalls.length === 0, w.__gateCalls);
  ok('★控えは残っている', w.__store['chr6_bk_guard_alive_1780000000000'] != null);
  ok('★no-safe-candidate として残る',
     w.__v292Dfix490.dropLog().some(x => x.reason === 'no-safe-candidate'), w.__v292Dfix490.dropLog());
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
