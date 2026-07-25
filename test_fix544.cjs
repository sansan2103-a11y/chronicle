/* 回帰テスト: クラウド取り込み前の控え(chr6_bk_cloudsync_*)の世代trim
 * 由来: 2026-07-25、実データで **11世代**溜まっているのを発見。
 *   調査結果: 11件すべて **2026-07-06〜07-16** 作成 = fix495(C1・2世代trim)が入った **07-19 より前**。
 *   07-19以降に作られたものは **0件** で、pull が一度も走っていないため trim が実行されていなかっただけ。
 *   → **trim の不具合ではない**。ただし「コードが本当に2世代へ落とすか」は誰も確認していなかったので固定する。 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };

function mk(seedKeys, quota){
  const store = {};
  (seedKeys || []).forEach(o => { store[o.k] = o.v; });
  store['chr6'] = JSON.stringify({ turns: [{}, {}] });
  store['chr6_active_slot'] = JSON.stringify('default');
  let used = 0; Object.keys(store).forEach(k => used += k.length + store[k].length);
  /* quota==='tight' なら「いま使っている分ちょうど」= 新規書込は必ず失敗する */
  const cap = quota == null ? Infinity : (quota === 'tight' ? used : quota);
  const ls = {
    getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: function(k, v){
      const add = String(k).length + String(v).length - (store[k] ? String(store[k]).length : 0);
      if (used + add > cap){ const e = new Error('q'); e.name = 'QuotaExceededError'; throw e; }
      used += add; store[k] = String(v);
    },
    removeItem: function(k){ if (store[k] != null){ used -= k.length + store[k].length; delete store[k]; } },
    key: i => Object.keys(store)[i], get length(){ return Object.keys(store).length; }
  };
  const el = { querySelectorAll: () => [], querySelector: () => null, addEventListener(){}, appendChild(){}, setAttribute(){}, style: {}, remove(){}, classList:{add(){},remove(){},contains:()=>false} };
  const doc = { hidden: false, visibilityState: 'visible', readyState: 'complete', documentElement: el, body: el,
    querySelectorAll: () => [], querySelector: () => null, getElementById: () => null, addEventListener(){},
    createElement: () => ({ style: {}, setAttribute(){}, addEventListener(){}, appendChild(){}, remove(){}, classList:{add(){},remove(){}} }) };
  const w = { localStorage: ls, document: doc, console: { log(){}, warn(){}, error(){} },
    setTimeout: () => 0, setInterval: () => 0, clearTimeout(){}, clearInterval(){},
    fetch: () => Promise.reject(new Error('no-net')),
    indexedDB: { open: () => ({ addEventListener(){}, set onsuccess(v){}, set onerror(v){}, set onupgradeneeded(v){} }) },
    navigator: { userAgent: 'node' }, location: { href: 'https://x/', search: '', origin: 'https://x' },
    addEventListener(){}, removeEventListener(){} };
  w.window = w; w.__store = store;
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'v292Dfix399-cloudsync.js'), 'utf8'),
    vm.createContext(w), { filename: 'fix399' });
  return w;
}
const listBk = (w) => Object.keys(w.__store).filter(k => /^chr6_bk_cloudsync_\d+$/.test(k)).sort();
const PKG = { schema: 1, ls: { 'chr6': null }, idb: {} };

console.log('\n== 世代trim: 5世代 → 2世代 ==');
{
  const seeds = [];
  for (let i = 0; i < 5; i++) seeds.push({ k: 'chr6_bk_cloudsync_' + (1780000000000 + i * 1000), v: 'old' + i });
  const w = mk(seeds);
  ok('前提: 5世代ある', listBk(w).length === 5, listBk(w).length);
  const r = w.__v292Dfix399x.backupBeforeApply(PKG);
  ok('★控えが取れた', r === true, r);
  const after = listBk(w);
  ok('★2世代になる', after.length === 2, after);
  ok('★いちばん新しい既存の1件が残る', after.indexOf('chr6_bk_cloudsync_1780000004000') >= 0, after);
  ok('★古い4件は消える', after.every(k => !/_17800000(0|1|2|3)000$/.test(k)), after);
}

console.log('\n== 世代trim: 0世代からでも壊れない ==');
{
  const w = mk([]);
  ok('★1件書ける', w.__v292Dfix399x.backupBeforeApply(PKG) === true);
  ok('★1世代になる', listBk(w).length === 1, listBk(w));
}
{
  const w = mk([{ k: 'chr6_bk_cloudsync_1780000000000', v: 'old' }]);
  w.__v292Dfix399x.backupBeforeApply(PKG);
  ok('★1世代→2世代(既存を消さない)', listBk(w).length === 2, listBk(w));
}

console.log('\n== 世代trim: 容量不足のとき(fail-closed) ==');
{
  /* 控えがどうしても書けないなら false = 取り込み中止。これは fix495(C1) の裁定 */
  const w = mk([], 'tight');
  const r = w.__v292Dfix399x.backupBeforeApply(PKG);
  ok('★控えが取れなければ false(取り込みを中止させる)', r === false, r);
  ok('★中途半端な控えを残さない', listBk(w).length === 0, listBk(w));
}

console.log('\n== 実データの棚卸し結果を固定する ==');
{
  /* 2026-07-25 の実測: 11件すべて 07-06〜07-16 作成 = fix495(07-19)より前。07-19以降は0件。
     つまり「trimが壊れている」のではなく「pullが走っていないので trim が実行されていない」。
     この結論の前提(trimコードが listBk→shift で古い方から消す形になっていること)を固定する。 */
  const src = fs.readFileSync(path.join(__dirname, 'v292Dfix399-cloudsync.js'), 'utf8');
  const i = src.indexOf('function backupBeforeApply');
  const body = src.slice(i, i + 1800);
  ok('★古い方から消す(sort→shift)形になっている',
     /bks\.sort\(\)/.test(body) && /while \(bks\.length > 1\)[\s\S]{0,80}bks\.shift\(\)/.test(body));
  ok('★quota時は同系統をもう1件消して1回だけ再試行する', /bks2\[0\]/.test(body));
  ok('★それでも書けなければ false', /catch\(e2\)\{ return false; \}/.test(body));
  ok('検証口が出ている(回帰テストできる)', src.indexOf('backupBeforeApply: backupBeforeApply') > 0);
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
