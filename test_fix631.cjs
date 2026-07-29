/* 回帰テスト: v292Dfix631 — アイコン在庫の正本参照 / 期待集合のシード / 観測口
 *
 * ■このテストが固定する「約束」
 *   ①在庫は IndexedDB(chr6av/imgs) を数える。生localStorageが0件でも0にならない
 *     ★これが原因B（fix523 の localAvKeys が localStorage.length を見ていて常に0件）の芯
 *   ②生localStorage と IDB の**和集合**であること（fix346 OFF 時の保険を落とさない）
 *   ③v292Dfix399_imgKeys は **union（単調・縮まない）**。既存を消さない＝削除処理を作らない
 *   ④OFF（v292Dfix631Off='1'）で従来挙動（生localStorageのみ・期待集合を書かない）へ戻る
 *   ⑤promptDiff は **1バイトも書かない**（観測専用）
 *   ⑥壊れた入力・IDB無しでも例外を投げない
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };

const SRC = fs.readFileSync(path.join(__dirname, 'v292Dfix631-avatar-inventory.js'), 'utf8');

/* ---- モック localStorage: Object.keys でも見える実体 + length/key(i) ---- */
function mkLS(init){
  const store = Object.assign(Object.create(null), init || {});
  const ls = {
    getItem(k){ return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v){ store[k] = String(v); },
    removeItem(k){ delete store[k]; },
    key(i){ const ks = Object.keys(store); return i < ks.length ? ks[i] : null; },
    get length(){ return Object.keys(store).length; },
    __store: store
  };
  return ls;
}
/* ---- モック IndexedDB: コールバックは microtask で必ず配る ---- */
function mkIDB(data, opts){
  opts = opts || {};
  function step(keys, i, req, keyOnly){
    Promise.resolve().then(() => {
      if (i >= keys.length){ if (req.onsuccess) req.onsuccess({ target: { result: null } }); return; }
      const cur = { key: keys[i], value: keyOnly ? undefined : data[keys[i]],
                    continue(){ step(keys, i + 1, req, keyOnly); } };
      if (req.onsuccess) req.onsuccess({ target: { result: cur } });
    });
  }
  return {
    open(name){
      const req = {};
      Promise.resolve().then(() => {
        if (opts.failOpen){ if (req.onerror) req.onerror(); return; }
        const db = {
          objectStoreNames: { contains: () => true },
          close(){},
          transaction(){ return { objectStore(){ return {
            openKeyCursor(){ const r = {}; step(Object.keys(data), 0, r, true); return r; },
            openCursor(){ const r = {}; step(Object.keys(data), 0, r, false); return r; },
            put(v, k){ data[k] = v; }, delete(k){ delete data[k]; }
          }; } }; }
        };
        req.result = db;
        if (req.onsuccess) req.onsuccess({ target: { result: db } });
      });
      return req;
    }
  };
}
const tick = async (n = 40) => { for (let i = 0; i < n; i++) await Promise.resolve(); };

function load(opts){
  opts = opts || {};
  const ls = mkLS(opts.ls || {});
  const idb = (opts.noIdb ? undefined : mkIDB(opts.idb || {}, opts.idbOpts));
  const W = { localStorage: ls };
  if (opts.f197) W.__v292Dfix197 = opts.f197;
  const ctx = { window: W, localStorage: ls, indexedDB: idb,
    console: { log(){}, warn(){}, error(){} },
    JSON, Math, Object, Array, String, Number, RegExp, Date, Promise,
    setTimeout: (fn) => { Promise.resolve().then(() => { try { fn(); } catch(e){} }); return 1; },
    setInterval: () => 2, clearInterval: () => {}, clearTimeout: () => {} };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'v292Dfix631-avatar-inventory.js' });
  return { W, ls, api: W.__v292Dfix631, inv: W.__v292av };
}

(async () => {

console.log('--- 1. 起動と生存証明 ---');
{
  const { api, inv } = load();
  ok('window.__v292Dfix631 が生える', !!api && api.__armed === true);
  ok('window.__v292av が生える', !!inv && typeof inv.keys === 'function');
  ok('既定ON', api.on() === true);
  ok('status() が例外を投げない', (() => { try { api.status(); return true; } catch(e){ return false; } })());
}

console.log('--- 2. ★原因B: 生localStorage=0件 / IDB=225件 でも在庫が見える ---');
{
  const idb = {};
  for (let i = 0; i < 225; i++) idb['v292av2_pk' + i] = 'data:image/png;base64,AAA' + i;
  const { api, inv, ls } = load({ ls: {}, idb });
  ok('起動直後は生LSしか見えない(=fix523の現状と同じ0件)', inv.keys().length === 0, inv.keys().length);
  await tick(500);   // カーソルは1件1 microtask で進む
  ok('★refresh後にIDBの225件が見える', inv.keys().length === 225, inv.keys().length);
  ok('pkはPREFIX無しで返る', inv.keys().indexOf('pk0') >= 0 && inv.keys().indexOf('v292av2_pk0') < 0);
  ok('生localStorageは1件も増えていない(容量を食わない)', Object.keys(ls.__store).filter(k => k.indexOf('v292av2_') === 0).length === 0);
}

console.log('--- 3. 和集合であること(fix346 OFF時の保険を落とさない) ---');
{
  const { inv } = load({
    ls: { 'v292av2_raw1': 'data:image/png;base64,R', 'v292av2_both': 'data:image/png;base64,B' },
    idb: { 'v292av2_idb1': 'data:image/png;base64,I', 'v292av2_both': 'data:image/png;base64,B' }
  });
  await tick();
  const k = inv.keys().slice().sort();
  ok('生LS ∪ IDB になる', JSON.stringify(k) === JSON.stringify(['both', 'idb1', 'raw1']), k);
  ok('重複しない', k.length === new Set(k).size);
}

console.log('--- 4. ★原因C: 期待集合(v292Dfix399_imgKeys)を実在庫でシード ---');
{
  const idb = { 'v292av2_a': 'data:image/png;base64,A', 'v292av2_b': 'data:image/png;base64,B' };
  const { api, ls } = load({ ls: {}, idb });
  ok('起動直後は期待集合が空(=実測0件の現状)', api.expected().length === 0);
  await tick();
  const exp = api.expected();
  ok('★実在庫でシードされる', exp.length === 2, exp);
  ok('PREFIX付きのIDBキー形式で入る(fix399のidbReadKeysと同じ形)', exp.indexOf('v292av2_a') >= 0, exp);
}
{
  /* 既存の期待集合を**縮めない**(削除処理を作らない・制約6) */
  const { api } = load({
    ls: { 'v292Dfix399_imgKeys': JSON.stringify(['v292av2_gone', 'v292av2_a']) },
    idb: { 'v292av2_a': 'data:image/png;base64,A', 'v292av2_new': 'data:image/png;base64,N' }
  });
  await tick();
  const exp = api.expected();
  ok('★既存キーを消さない(union)', exp.indexOf('v292av2_gone') >= 0, exp);
  ok('新しい在庫を足す', exp.indexOf('v292av2_new') >= 0, exp);
  ok('件数は3(gone/a/new)', exp.length === 3, exp);
  ok('ソート済みで安定', JSON.stringify(exp) === JSON.stringify(exp.slice().sort()), exp);
}
{
  /* 2回呼んでも増えない(冪等) */
  const { api } = load({ ls: {}, idb: { 'v292av2_a': 'data:image/png;base64,A' } });
  await tick();
  const n1 = api.expected().length;
  api.seedExpected(); api.seedExpected();
  ok('seedExpectedは冪等', api.expected().length === n1 && n1 === 1, [n1, api.expected()]);
}

console.log('--- 5. OFF(v292Dfix631Off=1)で従来挙動へ戻る ---');
{
  const { api, inv, ls } = load({
    ls: { 'v292Dfix631Off': '1', 'v292av2_raw': 'data:image/png;base64,R' },
    idb: { 'v292av2_idb1': 'data:image/png;base64,I' }
  });
  await tick();
  ok('OFFなら on()=false', api.on() === false);
  ok('★OFFなら生localStorageのみ(=従来の localAvKeys と同じ)', JSON.stringify(inv.keys()) === JSON.stringify(['raw']), inv.keys());
  ok('OFFなら期待集合を書かない', ls.getItem('v292Dfix399_imgKeys') === null);
  ok('OFFでもseedExpectedはnullを返すだけ', api.seedExpected() === null);
}

console.log('--- 6. get() は fix346 のラッパ(localStorage.getItem)経由で読む ---');
{
  /* fix346 のラッパを模す: getItem が mem(IDB由来)を返す */
  const mem = { 'v292av2_x': 'data:image/png;base64,MEM' };
  const ls = mkLS({});
  const rawGet = ls.getItem.bind(ls);
  ls.getItem = (k) => (k in mem ? mem[k] : rawGet(k));
  const W = { localStorage: ls };
  const ctx = { window: W, localStorage: ls, indexedDB: mkIDB({}),
    console: { log(){}, warn(){}, error(){} }, JSON, Math, Object, Array, String, Number, RegExp, Date, Promise,
    setTimeout: (fn) => { Promise.resolve().then(() => { try { fn(); } catch(e){} }); return 1; }, setInterval: () => 2 };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'v292Dfix631-avatar-inventory.js' });
  ok('★get(pk) が mem の実dataURLを返す(生LSは空)', W.__v292av.get('x') === 'data:image/png;base64,MEM');
  ok('data: 以外は空文字にする', (ls.setItem('v292av2_y', 'https://x/y'), W.__v292av.get('y') === ''));
  ok('未知のpkは空文字', W.__v292av.get('nope') === '');
}

console.log('--- 7. note() で書込直後のキーが即座に在庫へ入る ---');
{
  const { inv } = load({ ls: {}, idb: {} });
  await tick();
  inv.note('v292av2_fresh');
  ok('PREFIX付きで渡してもPREFIX無しで入る', inv.keys().indexOf('fresh') >= 0, inv.keys());
  inv.note('bare');
  ok('PREFIX無しでも入る', inv.keys().indexOf('bare') >= 0, inv.keys());
  inv.note(''); inv.note(null);
  ok('空/nullは無視する', inv.keys().length === 2, inv.keys());
}

console.log('--- 8. 観測口 promptDiff は1バイトも書かない ---');
{
  const wrote = [];
  const f197 = {
    keyFor: (n) => 'pk_' + n,
    buildPrompt412: (n) => 'CURRENT prompt for ' + n
  };
  const ls = mkLS({ 'v292avrec_pk_ミア': JSON.stringify({ p: 'RECIPE prompt', s: 1, m: 'flux' }) });
  const origSet = ls.setItem.bind(ls);
  ls.setItem = (k, v) => { wrote.push(k); return origSet(k, v); };
  const W = { localStorage: ls, __v292Dfix197: f197 };
  const ctx = { window: W, localStorage: ls, indexedDB: undefined,
    console: { log(){}, warn(){}, error(){} }, JSON, Math, Object, Array, String, Number, RegExp, Date, Promise,
    setTimeout: () => 1, setInterval: () => 2 };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'v292Dfix631-avatar-inventory.js' });
  const d = W.__v292Dfix631.promptDiff('ミア');
  ok('レシピを読める', d.hasRecipe === true && d.recipeP === 'RECIPE prompt', d);
  ok('buildPrompt412 の文も読める', d.p412 === 'CURRENT prompt for ミア', d);
  ok('★fix197:299 の実挙動(p412があれば上書き)を used に映す', d.used === 'buildPrompt412', d);
  ok('same=false（＝レシピと違う絵になる根拠）', d.same === false, d);
  ok('★promptDiff は localStorage へ1件も書かない', wrote.length === 0, wrote);
}
{
  /* fix197 が居ない/レシピが壊れていても落ちない */
  const { api } = load({ ls: { 'v292avrec_pk': '{{{broken' } });
  let threw = false;
  let d = null;
  try { d = api.promptDiff('だれか'); } catch(e){ threw = true; }
  ok('fix197不在でも例外を投げない', !threw && !!d, d);
  ok('used=none になる', d && d.used === 'none', d);
  ok('空名でも落ちない', (() => { try { api.promptDiff(''); api.promptDiff(null); return true; } catch(e){ return false; } })());
}

console.log('--- 9. IndexedDB が使えない環境でも壊れない ---');
{
  const { api, inv } = load({ noIdb: true, ls: { 'v292av2_only': 'data:image/png;base64,O' } });
  await tick();
  ok('IDB無しでも生LSだけで動く', JSON.stringify(inv.keys()) === JSON.stringify(['only']), inv.keys());
  ok('期待集合もシードされる', api.expected().indexOf('v292av2_only') >= 0, api.expected());
}
{
  const { inv } = load({ idb: {}, idbOpts: { failOpen: true }, ls: {} });
  await tick();
  ok('IDBのopenが失敗しても例外を投げず0件で返る', inv.keys().length === 0);
}

console.log('--- 10. 冪等ガード ---');
{
  const { W, ls } = load({ ls: {}, idb: {} });
  const before = W.__v292Dfix631;
  const ctx2 = { window: W, localStorage: ls, indexedDB: mkIDB({}),
    console: { log(){}, warn(){}, error(){} }, JSON, Math, Object, Array, String, Number, RegExp, Date, Promise,
    setTimeout: () => 1, setInterval: () => 2 };
  ctx2.globalThis = ctx2;
  vm.createContext(ctx2);
  vm.runInContext(SRC, ctx2, { filename: 'v292Dfix631-avatar-inventory.js' });
  ok('2回読んでも差し替わらない(__armed)', W.__v292Dfix631 === before);
}

console.log('');
console.log('pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);

})();
