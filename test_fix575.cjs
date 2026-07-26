/* 回帰テスト: v292Dfix575 — fix399(クラウド取り込み前の控え)の**物理削除だけ**を
 * fix569 の exact-delete ゲートへ通す（GPT裁定の最小変更）。
 *
 * 固定する契約:
 *  (1) 候補の選択ロジックは変えない（保護対象 keep は呼び出し元でも触らない）
 *  (2) 容量回復の削除は **必ずゲートを通る**（intent/path/expectedBytes を申告する）
 *  (3) ゲートが protected / stale / policy-unavailable を返したら **削除せず取り込み中止**
 *  (4) **1回の容量回復につき、削除は最大1論理単位・書込み再試行も最大1回**（旧 while の根絶）
 *  (5) ゲートの ok を鵜呑みにせず、呼び出し元でも read-back する
 *  (6) ゲート未搭載 / v292Dfix575Off='1' なら旧経路（ただし再試行は1回だけ）
 *  (7) fix568 の契約（唯一の完全控えを先に消さない）は壊れていない
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };

const SRC = fs.readFileSync(path.join(__dirname, 'v292Dfix399-cloudsync.js'), 'utf8');

/* gate: null=未搭載 / {verdict:'deleted'|'protected'|'stale'|'policy-unavailable'|'delete-failed', lie:bool} */
function mk(seedKeys, quota, gate, opt){
  opt = opt || {};
  const store = {};
  (seedKeys || []).forEach(o => { store[o.k] = o.v; });
  store['chr6'] = JSON.stringify({ turns: [{}, {}] });
  store['chr6_active_slot'] = JSON.stringify('default');
  if (opt.off) store['v292Dfix575Off'] = '1';
  let used = 0; Object.keys(store).forEach(k => used += k.length + store[k].length);
  const cap = quota == null ? Infinity : (quota === 'tight' ? used : used + quota);
  const nativeRemove = function(k){ if (store[k] != null){ used -= k.length + store[k].length; delete store[k]; } };
  const ls = {
    getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: function(k, v){
      const add = String(k).length + String(v).length - (store[k] != null ? String(store[k]).length : 0);
      if (used + add > cap){ const e = new Error('q'); e.name = 'QuotaExceededError'; throw e; }
      used += add; store[k] = String(v);
    },
    /* ★fix246 相当の「キー書換ラッパ」。ゲートはこれを迂回しなければならない。 */
    removeItem: function(k){ wrapped.push(k); nativeRemove(opt.rewrite ? (opt.rewrite(k) || k) : k); },
    key: i => Object.keys(store)[i], get length(){ return Object.keys(store).length; }
  };
  const wrapped = [], gateCalls = [];
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
  if (gate){
    w.__v292Dfix569 = { tryDeleteExact: function(req){
      gateCalls.push(req);
      const v = req.verdict || gate.verdict;
      if (v === 'deleted'){
        if (!gate.lie) nativeRemove(req.key);       /* ★native で消す = 書換ラッパを迂回 */
        return { ok:true, deleted:true, code:'deleted', key:req.key };
      }
      return { ok:false, deleted:false, code:v, key:req.key };
    } };
  }
  w.window = w; w.__store = store; w.__wrapped = wrapped; w.__gateCalls = gateCalls;
  vm.runInContext(SRC, vm.createContext(w), { filename: 'fix399' });
  return w;
}
const listBk = (w) => Object.keys(w.__store).filter(k => /^chr6_bk_cloudsync_\d+$/.test(k)).sort();
const PKG = { schema: 1, ls: { 'chr6': null }, idb: {} };
const FULL = JSON.stringify({ activeSlot: 'default', ls: { 'chr6': '{"turns":[{},{}]}' } });

console.log('\n== (0) 旧 while ループが残っていない ==');
{
  ok('★`while (r === \'quota\')` が消えている', !/while\s*\(\s*r\s*===\s*['"]quota['"]\s*\)/.test(SRC));
  ok('★単発再試行になっている', /if\s*\(\s*r\s*===\s*['"]quota['"]\s*\)/.test(SRC));
  ok('ゲート呼び出しがある', SRC.indexOf('tryDeleteExact') > 0);
  ok('dropOneSpareChecked が定義されている', SRC.indexOf('function dropOneSpareChecked()') > 0);
  ok('★意図(intent)と経路(path)を申告している',
     /intent:\s*'reclaim'/.test(SRC) && /path:\s*'fix399'/.test(SRC));
  ok('★expectedBytes を渡している(stale検出の材料)', /expectedBytes:\s*v\.length/.test(SRC));
  ok('緊急停止スイッチがある', SRC.indexOf('v292Dfix575Off') > 0);
}

console.log('\n== (1) 容量回復の削除は必ずゲートを通る ==');
{
  /* 完全控えは無い(keep=null)。余剰1件。容量は「余剰を消せば書ける」量。 */
  const spare = 'x'.repeat(300);
  const w = mk([{ k: 'chr6_bk_cloudsync_1780000000000', v: spare }], 'tight', { verdict:'deleted' });
  const r = w.__v292Dfix399x.backupBeforeApply(PKG);
  ok('★ゲートが呼ばれた', w.__gateCalls.length >= 1, w.__gateCalls);
  const c = w.__gateCalls[0] || {};
  ok('★exact key を申告している', c.key === 'chr6_bk_cloudsync_1780000000000', c);
  ok('★expectedBytes が実バイト数と一致', c.expectedBytes === spare.length, c);
  ok('★intent=reclaim / path=fix399', c.intent === 'reclaim' && c.path === 'fix399', c);
  ok('★書込み再試行は最大1回(=ゲート呼び出しも1回まで)', w.__gateCalls.length === 1, w.__gateCalls.length);
  ok('控えは書けた', r === true, r);
}

console.log('\n== (2) ゲートが protected を返したら削除しない＝取り込み中止 ==');
{
  const K = 'chr6_bk_cloudsync_1780000000000';
  const w = mk([{ k: K, v: 'x'.repeat(300) }], 'tight', { verdict:'protected' });
  const r = w.__v292Dfix399x.backupBeforeApply(PKG);
  ok('★false(取り込み中止)', r === false, r);
  ok('★★候補は消えていない', w.__store[K] != null, listBk(w));
  ok('★1回だけ問い合わせて諦める(次の候補へ進まない)', w.__gateCalls.length === 1, w.__gateCalls.length);
  const log = w.__v292Dfix399x.bkLog().mem;
  ok('理由が記録されている(無言にしない)',
     log.some(x => x.act === 'dropSpareGated' && x.code === 'protected'), log);
  ok('★★容量が満杯でも理由が残る(メモリ側が正本)',
     w.__v292Dfix399x.bkLog().persistedOk === false && log.length > 0, w.__v292Dfix399x.bkLog());
}

console.log('\n== (3) stale / policy-unavailable / delete-failed も fail-closed ==');
['stale', 'policy-unavailable', 'delete-failed'].forEach(v => {
  const K = 'chr6_bk_cloudsync_1780000000000';
  const w = mk([{ k: K, v: 'x'.repeat(300) }], 'tight', { verdict:v });
  const r = w.__v292Dfix399x.backupBeforeApply(PKG);
  ok('★' + v + ': false を返す', r === false, r);
  ok('★' + v + ': 候補は消えていない', w.__store[K] != null, listBk(w));
});

console.log('\n== (4) ゲートが ok と言っても、実際に消えていなければ信じない ==');
{
  /* lie:true = ok/deleted を返すが実際には消さない。呼び出し元の read-back が働くこと。 */
  const K = 'chr6_bk_cloudsync_1780000000000';
  const w = mk([{ k: K, v: 'x'.repeat(300) }], 'tight', { verdict:'deleted', lie:true });
  const r = w.__v292Dfix399x.backupBeforeApply(PKG);
  ok('★false(取り込み中止)', r === false, r);
  ok('★候補は残ったまま', w.__store[K] != null, listBk(w));
  const log = w.__v292Dfix399x.bkLog().mem;
  ok('★「消えたと言われたが消えていない」を記録する',
     log.some(x => x.act === 'dropSpareUnverified'), log);
}

console.log('\n== (5) ゲートは fix246 相当のキー書換ラッパを迂回する ==');
{
  const K = 'chr6_bk_cloudsync_1780000000000';
  /* removeItem ラッパが別キーへ書き換える環境。ゲートを通れば exact key が消える。 */
  const w = mk([{ k: K, v: 'x'.repeat(300) }], 'tight', { verdict:'deleted' },
               { rewrite: k => (k === K ? 'chr6_bk_cloudsync_9999999999999' : k) });
  w.__v292Dfix399x.backupBeforeApply(PKG);
  ok('★★exact key が実際に消えている(書換先ではない)', w.__store[K] == null, listBk(w));
  ok('★書換ラッパは呼ばれていない', w.__wrapped.indexOf(K) < 0, w.__wrapped);
}

console.log('\n== (6) ゲート未搭載 / 明示OFF ==');
{
  /* ★2026-07-26 fix576(GPT裁定)で契約を反転した。
     ここは元々「ゲートが無ければ旧経路で消して控えを書く」を合格条件にしていたが、
     **中央保護がロードできなかったことを理由に、いちばん危険な旧削除経路へ自動で戻る**のは
     不変条件と矛盾する。未搭載は policy-unavailable として**中止**する。 */
  const K = 'chr6_bk_cloudsync_1780000000000';
  const w = mk([{ k: K, v: 'x'.repeat(300) }], 'tight', null);
  const r = w.__v292Dfix399x.backupBeforeApply(PKG);
  ok('★★ゲート未搭載なら中止する(旧経路へ自動で戻らない)', r === false, r);
  ok('★★候補は消えていない', w.__store[K] != null, listBk(w));
}
{
  const K = 'chr6_bk_cloudsync_1780000000000';
  const w = mk([{ k: K, v: 'x'.repeat(300) }], 'tight', { verdict:'protected' }, { off:true });
  const r = w.__v292Dfix399x.backupBeforeApply(PKG);
  ok('★v292Dfix575Off=1 ならゲートを呼ばない', w.__gateCalls.length === 0, w.__gateCalls);
  ok('★旧経路で控えが書ける(緊急停止として機能する)', r === true, r);
}

console.log('\n== (7) fix568 の契約は壊れていない（唯一の完全控えを先に消さない） ==');
{
  const K = 'chr6_bk_cloudsync_1780000000000';
  const w = mk([{ k: K, v: FULL }], 'tight', { verdict:'deleted' });
  const r = w.__v292Dfix399x.backupBeforeApply(PKG);
  ok('★容量不足なら false(fail-closed)', r === false, r);
  ok('★★唯一の完全控えは残っている', w.__store[K] === FULL, listBk(w));
  ok('★★保護対象はゲートにすら渡さない(呼び出し元で除外)',
     w.__gateCalls.every(c => c.key !== K), w.__gateCalls);
}
{
  /* 余剰があるときは整理して書ける（整理そのものは止めない） */
  const w = mk([{ k: 'chr6_bk_cloudsync_1780000000000', v: 'junk-old' },
                { k: 'chr6_bk_cloudsync_1780000001000', v: FULL }], null, { verdict:'deleted' });
  const r = w.__v292Dfix399x.backupBeforeApply(PKG);
  ok('★余剰があれば控えを書ける', r === true, r);
  ok('★2世代の約束は維持される', listBk(w).length <= 2, listBk(w));
}

console.log('\n== (8) 保護対象しか無いときは削除ゼロで中止する ==');
{
  const K = 'chr6_bk_cloudsync_1780000000000';
  const w = mk([{ k: K, v: FULL }], 'tight', { verdict:'deleted' });
  w.__v292Dfix399x.backupBeforeApply(PKG);
  const log = w.__v292Dfix399x.bkLog().mem;
  ok('★中止理由が no-safe-space として残る',
     log.some(x => x.act === 'abortPull' && /no-safe-space/.test(String(x.why))), log);
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
