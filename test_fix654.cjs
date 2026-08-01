/* test_fix654.cjs — v292Dfix654（Storage.prototype アクセサトラップ）の回帰テスト
 *
 * ■何を直したのか（実機で確定）
 *   iOS Safari では `localStorage.getItem = fn` の**インスタンスへのメソッド代入が効かない**
 *   （Storage は WebIDL named-setter オブジェクト。代入は named setter に流れ、own property を
 *   作らない。読み取りは prototype のメソッドが先に解決される）。
 *   その結果、18モジュールの localStorage ラッパが iOS で全滅していた。PC では効く。
 *   fix654 は Storage.prototype の getItem/setItem/removeItem を accessor 化し、
 *   既存モジュールの代入を setter で捕獲して、WeakMap(インスタンス毎)+protoImpl で
 *   **通常のプロパティ意味論を忠実に再実装**する。既存モジュールは1バイトも変えない。
 *
 * ■このテストが固定する契約（値ではなく関係で縛る）
 *   (1) 代入 → setter 捕獲・own property/ゴミアイテム非作成・呼出しがチェーンを通る
 *   (2) 3枚重ね: 代入順=内→外。各ラッパの捕獲 orig は直前の実装
 *   (3) 別インスタンス（sessionStorage 相当）に漏れない
 *   (4) Storage.prototype への代入（v275型）は protoImpl に入る
 *   (5) 代入前 `localStorage.removeItem === Storage.prototype.removeItem`（fix569 判定互換）
 *   (6) kill スイッチで完全不設置 / 冪等（2回 eval）
 *   (7) selfTest の正常系・異常系・厳密復元
 *   (8) garbageScan/cleanup は関数ソース様の 'getItem' 等だけに触る
 *   (9) 設置〜selfTest〜status で storage 書込0
 *  (10) 実モジュール統合（実物の fix346 / fix246 が iOS 相当の受け皿でも効く）
 *  (11) 出荷の体裁（cb / BUILT / HOME_BUILT / version.txt の同値関係）
 *
 * ■「iOS 相当」の受け皿の作り方（ここが本テストの肝）
 *   Proxy で **defineProperty を握り潰す**（＝own property を作れない／代わりに名前付きアイテムとして
 *   保存する）。set/get はトラップしないので **[[Set]]/[[Get]] は spec どおり proto chain を歩く**。
 *   → アクセサが無ければ代入は黙って消える（＝現状の iOS）。アクセサがあれば setter が捕獲する。
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c){ pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

const SRC654 = read('v292Dfix654-storage-trap.js');
const SRC569 = read('v292Dfix569-gc-shadow.js');
const SRC346 = read('v292Dfix346-idb-avatars.js');
const SRC246 = read('v292Dfix246-store-slot-isolation.js');
const HTML   = fs.readFileSync(path.join(__dirname, 'index.html'), 'latin1');
const HTMLU  = Buffer.from(HTML, 'latin1').toString('utf8');
const HOME   = read('home.html');

/* =====================================================================
   Storage 実装（ブラウザ相当）と3種類の受け皿
   ・pc      … 素の JS オブジェクト（own property が作れる＝PC/Chrome 相当）
   ・ios     … defineProperty を握り潰し、名前付きアイテムとして保存する（iOS Safari 相当）
   ・swallow … [[Set]] 自体を握り潰す（setter すら発火しない最悪の個体・§2.5 の保険用）
   ===================================================================== */
function mkStorageClass(opts){
  opts = opts || {};
  const backing = new WeakMap();
  const writes = { setItem: 0, removeItem: 0 };
  function Storage(){}
  const map = self => backing.get(self) || {};
  Storage.prototype.getItem = function nativeGetItem(k){
    const m = map(this), key = String(k);
    return Object.prototype.hasOwnProperty.call(m, key) ? m[key] : null;
  };
  Storage.prototype.setItem = function nativeSetItem(k, v){ writes.setItem++; map(this)[String(k)] = String(v); };
  Storage.prototype.removeItem = function nativeRemoveItem(k){ writes.removeItem++; delete map(this)[String(k)]; };
  Storage.prototype.key = function nativeKey(i){ const a = Object.keys(map(this)); return i < a.length ? a[i] : null; };
  Storage.prototype.clear = function nativeClear(){ const m = map(this); Object.keys(m).forEach(k => delete m[k]); };
  Object.defineProperty(Storage.prototype, 'length', { configurable: true, get(){ return Object.keys(map(this)).length; } });

  const nativeRefs = { getItem: Storage.prototype.getItem, setItem: Storage.prototype.setItem,
                       removeItem: Storage.prototype.removeItem };

  function mkInst(kind, seed){
    const target = Object.create(Storage.prototype);
    const store = Object.assign({}, seed || {});
    let inst;
    if (kind === 'pc'){
      inst = target;
    } else if (kind === 'swallow'){
      inst = new Proxy(target, { set(){ return true; }, defineProperty(){ return true; } });
    } else {
      /* iOS 相当: own property を作れない。代わりに「名前付きアイテム」として保存される
         （実機で 'getItem' キーに関数ソースが入っていた現象の再現） */
      inst = new Proxy(target, {
        defineProperty(t, p, d){ if (d && 'value' in d) store[String(p)] = String(d.value); return true; },
        getOwnPropertyDescriptor(t, p){ return Object.getOwnPropertyDescriptor(t, p); }
      });
    }
    backing.set(inst, store);
    return { inst, store };
  }
  return { Storage, mkInst, native: nativeRefs, writes };
}

function mkCtx(env, kind, seed, extra){
  const ls = env.mkInst(kind, seed);
  const ss = env.mkInst(kind, {});
  const w = {
    Storage: env.Storage, localStorage: ls.inst, sessionStorage: ss.inst,
    console: { log(){}, warn(){}, error(){} },
    setTimeout: fn => { try { if (typeof fn === 'function') fn(); } catch(e){} return 0; },
    clearTimeout(){}, setInterval: () => 0, clearInterval(){},
    document: { readyState: 'complete', addEventListener(){} },
    addEventListener(){}
  };
  Object.assign(w, extra || {});
  w.window = w;
  const ctx = vm.createContext(w);
  return { w, ctx, ls: ls.inst, store: ls.store, ss: ss.inst, ssStore: ss.store, env };
}
function boot654(e){ vm.runInContext(SRC654, e.ctx, { filename: 'v292Dfix654' }); return e.w.__v292Dfix654; }
function F(e){ return e.w.__v292Dfix654; }

/* =====================================================================
   (1) 代入がトラップに捕獲される / 呼出しがチェーンを通る
   ===================================================================== */
console.log('\n== (1) 代入の捕獲と素通りの解消 ==');
{
  /* ★対照実験: トラップ無しの iOS 受け皿では、いまのコードは**素通り**する（＝実機の症状） */
  const env = mkStorageClass();
  const e = mkCtx(env, 'ios');
  const wrapper = function wrapperA(k){ return 'WRAPPED'; };
  e.ls.setItem('k', 'V');
  e.ls.getItem = wrapper;
  ok('★★[対照] トラップ無しの iOS 受け皿では代入が効かない（実機の症状の再現）',
     e.ls.getItem !== wrapper && e.ls.getItem('k') === 'V', String(e.ls.getItem).slice(0, 30));
  ok('★★[対照] 代入は「getItem という名のゴミアイテム」になる（fix569 が実測した現象）',
     typeof e.store.getItem === 'string' && /^function/.test(e.store.getItem), e.store.getItem);
}
{
  const env = mkStorageClass();
  const e = mkCtx(env, 'ios');
  boot654(e);
  ok('★installed=true', F(e).installed === true, F(e).status());
  e.ls.setItem('k', 'V');
  const before = JSON.stringify(e.store);
  const wrapper = function wrapperA(k){ return 'WRAPPED:' + k; };
  e.ls.getItem = wrapper;
  ok('★★iOS 相当でも代入が効く（getter が代入した関数そのものを返す）', e.ls.getItem === wrapper);
  ok('★★呼出しがラッパを通る', e.ls.getItem('k') === 'WRAPPED:k', e.ls.getItem('k'));
  ok('★★ゴミアイテムが増えない（named setter へ到達していない）',
     JSON.stringify(e.store) === before, e.store);
  ok('★prototype 側は native のまま（他インスタンスへ漏れない）',
     e.w.Storage.prototype.getItem === env.native.getItem);
  ok('★代入回数と捕獲したラッパ名が観測できる',
     F(e).status().counts.getItem === 1 && F(e).status().wrappers.getItem[0] === 'wrapperA', F(e).status());
}
{
  /* PC（own property が作れる受け皿）でも、従来と同じ結果になること */
  const env = mkStorageClass();
  const e = mkCtx(env, 'pc');
  boot654(e);
  const wrapper = function wrapperPC(k){ return 'PC'; };
  e.ls.setItem('k', 'V');
  e.ls.getItem = wrapper;
  ok('★★PC 相当でも従来どおり（代入した関数が最外殻）', e.ls.getItem === wrapper && e.ls.getItem('k') === 'PC');
  ok('★★PC でも own property を作らない（Object.keys が汚れない）',
     Object.keys(e.ls).indexOf('getItem') < 0, Object.keys(e.ls));
  ok('★setItem/removeItem も同じ経路で捕獲される', (() => {
    let seen = [];
    const os = e.ls.setItem, orr = e.ls.removeItem;
    e.ls.setItem = function(k, v){ seen.push('set'); return os.call(e.ls, k, v); };
    e.ls.removeItem = function(k){ seen.push('rem'); return orr.call(e.ls, k); };
    e.ls.setItem('a', '1'); e.ls.removeItem('a');
    return seen.join(',') === 'set,rem' && e.store.a === undefined;
  })());
}
{
  /* エキスパンド代入（fix346/569/562 が使う生アクセサチャネル） */
  const env = mkStorageClass();
  const e = mkCtx(env, 'ios');
  boot654(e);
  const raw = function rawGet(k){ return 'RAW'; };
  e.ls.__v346raw = raw;
  ok('★★__v346raw のエキスパンド代入も iOS 相当で効く', e.ls.__v346raw === raw && e.ls.__v346raw('x') === 'RAW');
  ok('★★__v346raw がゴミアイテムにならない（fix569 が実測した29字の文字列が生まれない）',
     e.store.__v346raw === undefined && F(e).garbageScan().length === 0, e.store);
  ok('★expandoTrap=true', F(e).status().expandoTrap === true);
}

/* =====================================================================
   (2) 3枚重ね（重ね順＝代入順・捕獲 orig は直前の実装）
   ===================================================================== */
console.log('\n== (2) 3枚重ねの順序と捕獲 ==');
function threeLayers(e){
  const order = [];
  const caught = [];
  const mk = tag => {
    const orig = e.ls.getItem;                    /* 実モジュールと同じ「読んでから代入」 */
    caught.push(orig);
    const fn = function(k){ order.push(tag); return orig.call(e.ls, k); };
    Object.defineProperty(fn, 'name', { value: 'layer' + tag });
    e.ls.getItem = fn;
    return fn;
  };
  const A = mk('A'), B = mk('B'), C = mk('C');
  return { order, caught, A, B, C };
}
{
  const env = mkStorageClass();
  const e = mkCtx(env, 'ios');
  boot654(e);
  e.ls.setItem('k', 'V');
  const L = threeLayers(e);
  ok('★★最後に代入したものが最外殻', e.ls.getItem === L.C);
  ok('★★A が捕獲した orig は native', L.caught[0] === env.native.getItem);
  ok('★★B が捕獲した orig は A', L.caught[1] === L.A);
  ok('★★C が捕獲した orig は B', L.caught[2] === L.B);
  const v = e.ls.getItem('k');
  ok('★★呼出しは外→内の順に全段を通る', L.order.join(',') === 'C,B,A', L.order);
  ok('★★最終的に native まで届いて値が返る', v === 'V', v);
}
{
  /* bind 型（実物の fix346/fix246 と同じ書き方）でも同じ関係が成り立つ */
  const env = mkStorageClass();
  const e = mkCtx(env, 'ios');
  boot654(e);
  e.ls.setItem('k', 'V');
  const g1 = e.ls.getItem.bind(e.ls);
  e.ls.getItem = function(k){ return 'w1:' + g1(k); };
  const g2 = e.ls.getItem.bind(e.ls);
  e.ls.getItem = function(k){ return 'w2:' + g2(k); };
  ok('★★bind 型の2枚重ねも従来どおり', e.ls.getItem('k') === 'w2:w1:V', e.ls.getItem('k'));
}

/* =====================================================================
   (3) 別インスタンスへ漏れない
   ===================================================================== */
console.log('\n== (3) sessionStorage 相当へ漏れない ==');
{
  const env = mkStorageClass();
  const e = mkCtx(env, 'ios');
  boot654(e);
  const wrapper = function onlyLocal(k){ return 'L'; };
  e.ls.getItem = wrapper;
  e.ss.setItem('k', 'S');
  ok('★★localStorage のラッパは sessionStorage に漏れない',
     e.ss.getItem !== wrapper && e.ss.getItem('k') === 'S', e.ss.getItem('k'));
  ok('★sessionStorage 側にも独立して掛けられる', (() => {
    const w2 = function onlySession(k){ return 'S2'; };
    e.ss.getItem = w2;
    return e.ss.getItem === w2 && e.ls.getItem === wrapper && e.ss.getItem('k') === 'S2';
  })());
}

/* =====================================================================
   (4) Storage.prototype への代入（v275 型）
   ===================================================================== */
console.log('\n== (4) prototype への代入は protoImpl に入る ==');
{
  const env = mkStorageClass();
  const e = mkCtx(env, 'ios');
  boot654(e);
  const protoFn = function protoSet(k, v){ return 'PROTO'; };
  e.w.Storage.prototype.setItem = protoFn;
  ok('★★Storage.prototype への代入は読み戻せる', e.w.Storage.prototype.setItem === protoFn);
  ok('★★インスタンス実装が無い receiver には prototype 実装が効く',
     e.ls.setItem('a', '1') === 'PROTO' && e.ss.setItem('a', '1') === 'PROTO');
  const instFn = function instSet(k, v){ return 'INST'; };
  e.ls.setItem = instFn;
  ok('★★インスタンス実装は prototype 実装を隠す（従来の own property と同じ意味論）',
     e.ls.setItem('a', '1') === 'INST' && e.ss.setItem('a', '1') === 'PROTO');
  ok('★★prototype を後から差し替えても、インスタンス実装は隠したまま', (() => {
    const p2 = function proto2(){ return 'PROTO2'; };
    e.w.Storage.prototype.setItem = p2;
    return e.ls.setItem('a', '1') === 'INST' && e.ss.setItem('a', '1') === 'PROTO2';
  })());
  ok('★関数以外の代入は無視して記録する（そんな代入は本番に存在しない）', (() => {
    const c0 = F(e).status().counts.getItem;
    e.ls.getItem = 'not a function';
    return F(e).status().counts.getItem === c0 &&
           typeof e.ls.getItem === 'function' &&
           F(e).status().anomalies.some(a => a.indexOf('nonfn:getItem') === 0);
  })(), F(e).status().anomalies);
}

/* =====================================================================
   (5) fix569 の判定互換（protoPristineAtLoad）
   ===================================================================== */
console.log('\n== (5) fix569 の protoPristineAtLoad 互換 ==');
{
  const env = mkStorageClass();
  const e = mkCtx(env, 'ios');
  boot654(e);
  ok('★★代入前は localStorage.removeItem === Storage.prototype.removeItem（従来と同値）',
     e.ls.removeItem === e.w.Storage.prototype.removeItem &&
     e.ls.removeItem === env.native.removeItem);
  e.ls.removeItem = function w(k){};
  ok('★代入後は false になる（判定が死んでいない）', e.ls.removeItem !== e.w.Storage.prototype.removeItem);
}
{
  /* ★実物の fix569 を iOS 相当の受け皿で起動する（トラップの有無で inner が効くかが変わる） */
  function bootWith569(kind, withTrap){
    const env = mkStorageClass();
    const e = mkCtx(env, kind);
    if (withTrap) boot654(e);
    vm.runInContext(SRC569, e.ctx, { filename: 'v292Dfix569' });
    return { e, env, f: e.w.__v292Dfix569 };
  }
  {
    const r = bootWith569('ios', true);
    ok('★★fix569 が起動し protoPristineAtLoad=true（トラップが判定を壊していない）',
       r.f.stats().protoPristineAtLoad === true, r.f.stats().protoPristineAtLoad);
    ok('★fix569 が native を捕捉できている', r.f.stats().capturedNative === true);
    ok('★★fix569 の inner ラッパが iOS 相当でも実効化する（現状は素通りしていた）',
       r.e.ls.removeItem !== r.env.native.removeItem, String(r.e.ls.removeItem).slice(0, 40));
    r.e.ls.setItem('chr6_x', '1');
    r.e.ls.removeItem('chr6_x');
    ok('★★削除は従来どおり通る（拒否も改変もしない）', r.e.store.chr6_x === undefined);
    ok('★★fix569 が削除を観測できる（＝影監視が iOS で初めて生きる）',
       r.f.stats().innerCalls >= 1, r.f.stats().innerCalls);
    ok('★fix569 は1バイトも書いていない',
       Object.keys(r.e.store).filter(k => k.indexOf('v292Dfix569') === 0).length === 0, Object.keys(r.e.store));
  }
  {
    const r = bootWith569('ios', false);
    ok('★★[対照] トラップ無しなら fix569 の inner は素通り（実機の症状）',
       r.e.ls.removeItem === r.env.native.removeItem);
    r.e.ls.setItem('chr6_x', '1');
    r.e.ls.removeItem('chr6_x');
    ok('★★[対照] 削除を1件も観測できない', r.f.stats().innerCalls === 0, r.f.stats().innerCalls);
  }
}

/* =====================================================================
   (6) kill スイッチ / 冪等
   ===================================================================== */
console.log('\n== (6) kill スイッチと冪等 ==');
{
  const env = mkStorageClass();
  const e = mkCtx(env, 'ios', { v292Dfix654Off: '1' });
  boot654(e);
  ok('★★OFF なら installed=false', F(e).installed === false && F(e).status().installed === false, F(e).status());
  ok('★★OFF なら off=true と観測できる', F(e).status().off === true);
  ok('★★OFF なら Storage.prototype は素のまま（データプロパティ）', (() => {
    const d = Object.getOwnPropertyDescriptor(e.w.Storage.prototype, 'getItem');
    return !!d && typeof d.value === 'function' && d.value === env.native.getItem && !d.get;
  })(), Object.getOwnPropertyDescriptor(e.w.Storage.prototype, 'getItem'));
  ok('★★OFF なら __v346raw のトラップも掛けない', F(e).status().expandoTrap === false &&
     Object.getOwnPropertyDescriptor(e.w.Storage.prototype, '__v346raw') === undefined);
  ok('★OFF でも1バイトも書かない', JSON.stringify(e.store) === JSON.stringify({ v292Dfix654Off: '1' }), e.store);
  ok('★OFF なら selfTest は installed=false を返す（嘘をつかない）',
     F(e).selfTest().installed === false && F(e).selfTest().assignCaptured === false);
}
{
  const env = mkStorageClass();
  const e = mkCtx(env, 'ios');
  boot654(e);
  const first = F(e);
  e.ls.getItem = function keep(k){ return 'KEEP'; };
  vm.runInContext(SRC654, e.ctx, { filename: 'v292Dfix654#2' });
  ok('★★二重ロードで初期化し直さない（同じ API オブジェクト）', F(e) === first);
  ok('★★二重ロードで捕獲済みのラッパが消えない', e.ls.getItem('k') === 'KEEP');
  ok('★★二重ロードで観測値がリセットされない', F(e).status().counts.getItem === 1, F(e).status().counts);
}

/* =====================================================================
   (7) selfTest（正常系・setter が発火しない個体・厳密復元）
   ===================================================================== */
console.log('\n== (7) selfTest ==');
{
  const env = mkStorageClass();
  const e = mkCtx(env, 'ios');
  boot654(e);
  const st = F(e).selfTest();
  ok('★★正常系は assignCaptured/dispatchOk とも true', st.installed && st.assignCaptured && st.dispatchOk, st);
  ok('★★selfTest 後に「元々無かった」状態へ厳密に戻る（delete で無へ）',
     F(e)._hasInst('getItem') === false && e.ls.getItem === e.w.Storage.prototype.getItem &&
     e.ls.getItem === env.native.getItem, String(e.ls.getItem).slice(0, 30));
  ok('★★selfTest は観測値（代入回数）を汚さない', F(e).status().counts.getItem === 0, F(e).status().counts);
  ok('★★selfTest は storage に1バイトも書かない', Object.keys(e.store).length === 0, e.store);
}
{
  const env = mkStorageClass();
  const e = mkCtx(env, 'ios');
  boot654(e);
  const mine = function mineWrapper(k){ return 'MINE'; };
  e.ls.getItem = mine;
  const st = F(e).selfTest();
  ok('★ラッパがある状態でも正常系', st.assignCaptured && st.dispatchOk, st);
  ok('★★selfTest 後に元のラッパへ厳密に戻る', e.ls.getItem === mine && e.ls.getItem('k') === 'MINE');
  ok('★★selfTest 後も代入回数は1のまま', F(e).status().counts.getItem === 1, F(e).status().counts);
}
{
  /* §2.5 の保険: [[Set]] が chain walk せず setter が発火しない個体 */
  const env = mkStorageClass();
  const e = mkCtx(env, 'swallow');
  boot654(e);
  const st = F(e).selfTest();
  ok('★★setter を握り潰す受け皿では assignCaptured=false を正しく報告する',
     st.installed === true && st.assignCaptured === false, st);
  ok('★★その場合 dispatchOk も false（嘘の合格を出さない）', st.dispatchOk === false, st);
  ok('★★観測口 status() にそのまま出る', F(e).status().selfTest.assignCaptured === false, F(e).status().selfTest);
  ok('★★保険の登録 API wrap() ならその個体でも掛かる', (() => {
    const fn = function viaWrap(k){ return 'W'; };
    const prev = F(e).wrap('getItem', fn);
    return prev === env.native.getItem && e.ls.getItem === fn && e.ls.getItem('k') === 'W';
  })());
  ok('★wrap() は知らないメソッド名・関数以外を拒否する',
     F(e).wrap('clear', function(){}) === null && F(e).wrap('getItem', 'x') === null);
}

/* =====================================================================
   (8) garbageScan / cleanup
   ===================================================================== */
console.log('\n== (8) ゴミアイテムの検査と掃除 ==');
{
  const seed = {
    getItem: 'function (k){ return null; }',
    removeItem: 'function () { [native code] }',
    __v346raw: 'function () { [native code] }',
    setItem: 'ふつうの文字列',                       /* 関数ソース様でない＝触らない */
    length: '42',
    'chr6_slot_smA': '{"turns":[]}',
    'v292Dfix77States': '{}',
    'v292av2_someone': 'data:image/png;base64,AAA'
  };
  const env = mkStorageClass();
  const e = mkCtx(env, 'ios', seed);
  boot654(e);
  const g = F(e).garbageScan().map(x => x.key).sort();
  ok('★★関数ソース様の getItem/removeItem/__v346raw だけを挙げる',
     g.join(',') === '__v346raw,getItem,removeItem', g);
  ok('★garbageScan は読むだけ（1件も消さない）', Object.keys(e.store).length === Object.keys(seed).length);
  const removed = F(e).cleanup().sort();
  ok('★★cleanup はゴミだけを消す', removed.join(',') === '__v346raw,getItem,removeItem', removed);
  ok('★★chr6* / v292* のデータには触れない',
     e.store['chr6_slot_smA'] === seed['chr6_slot_smA'] &&
     e.store['v292Dfix77States'] === '{}' && e.store['v292av2_someone'] === seed['v292av2_someone'], e.store);
  ok('★★関数ソース様でない同名アイテムは残す（誤爆しない）',
     e.store.setItem === 'ふつうの文字列' && e.store.length === '42', e.store);
  ok('★cleanup 後は garbageScan が空', F(e).garbageScan().length === 0);
  ok('★cleanup は明示呼出しのみ（設置だけでは消えない）', (() => {
    const e2 = mkCtx(mkStorageClass(), 'ios', seed);
    boot654(e2);
    F(e2).status();                       /* status() を叩いても消さない */
    return e2.store.getItem === seed.getItem;
  })());
}

/* =====================================================================
   (9) storage への書込0
   ===================================================================== */
console.log('\n== (9) 設置〜観測で1バイトも書かない ==');
{
  const env = mkStorageClass();
  const e = mkCtx(env, 'ios', { 'chr6_slot_smA': 'x' });
  const before = JSON.stringify(e.store);
  boot654(e);
  F(e).selfTest(); F(e).status(); F(e).garbageScan();
  ok('★★native setItem が一度も呼ばれていない', env.writes.setItem === 0, env.writes);
  ok('★★native removeItem が一度も呼ばれていない（cleanup を呼ぶまでは）', env.writes.removeItem === 0, env.writes);
  ok('★★ストアの中身が1バイトも変わっていない', JSON.stringify(e.store) === before, e.store);
  ok('★cleanup() を明示的に呼んだ時だけ removeItem を使う', (() => {
    const env2 = mkStorageClass();
    const e2 = mkCtx(env2, 'ios', { getItem: 'function(){}' });
    boot654(e2);
    e2.w.__v292Dfix654.cleanup();
    return env2.writes.removeItem === 1 && env2.writes.setItem === 0;
  })());
  /* コメント（OFF手順の説明）を落としてから走査する。説明文で落ちないように。 */
  const CODE654 = SRC654.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  ok('★★ソースに書込みの呼出しが無い（静的検査・コメントを除く）',
     !/localStorage\.setItem\s*\(/.test(CODE654) && !/\bsetItem\.call\(/.test(CODE654) &&
     !/\bclear\s*\.call\(/.test(CODE654), CODE654.match(/.{0,30}setItem\.call.{0,20}/));
}

/* =====================================================================
   (10) 実モジュール統合（実物の fix346 / fix246）
   ===================================================================== */
console.log('\n== (10) 実モジュール統合（fix246 → fix346） ==');
function bootModules(withTrap){
  const env = mkStorageClass();
  const pend = [];
  const e = mkCtx(env, 'ios', {}, {
    __chr6Key: () => 'chr6_slot_a',
    indexedDB: { open(){ const r = { result: null }; pend.push(r); return r; } }
  });
  if (withTrap) boot654(e);
  vm.runInContext(SRC246, e.ctx, { filename: 'v292Dfix246' });   /* index.html と同じ順 */
  vm.runInContext(SRC346, e.ctx, { filename: 'v292Dfix346' });
  pend.forEach(r => { try { if (r.onsuccess) r.onsuccess(); } catch(err){} });   /* IDB は null DB＝passthrough */
  return { e, env };
}
{
  const r = bootModules(true);
  const e = r.e;
  ok('★★fix346 のラッパが最外殻に居る（native ではない）',
     e.ls.getItem !== r.env.native.getItem && e.ls.setItem !== r.env.native.setItem);
  ok('★fix346 が起動している', !!e.w.__v292Dfix346 && e.w.__v292Dfix346.ready() === true);
  ok('★fix246 が起動している', e.w.__v292Dfix246 === 1);

  e.ls.setItem('v292av2_kaede', 'data:image/png;base64,ZZZ');
  ok('★★v292av2_* の書きが localStorage へ落ちない（fix346 のリダイレクトが効く＝quota 事故の根治）',
     e.store['v292av2_kaede'] === undefined, e.store);
  ok('★★v292av2_* の読みが mem を経由して返る',
     e.ls.getItem('v292av2_kaede') === 'data:image/png;base64,ZZZ', e.ls.getItem('v292av2_kaede'));
  ok('★fix346 の mem に載っている', e.w.__v292Dfix346.memCount() === 1);

  e.ls.setItem('v292Dfix77States', '{"a":1}');
  ok('★★fix246 のスロット分離リダイレクトが効く（実キーに接尾辞が付く）',
     e.store['v292Dfix77States_slot_a'] === '{"a":1}' && e.store['v292Dfix77States'] === undefined, e.store);
  ok('★★読みも同じ接尾辞キーへ向く', e.ls.getItem('v292Dfix77States') === '{"a":1}');
  e.ls.removeItem('v292Dfix77States');
  ok('★削除も接尾辞キーへ向く', e.store['v292Dfix77States_slot_a'] === undefined);

  ok('★★無関係なキーは素通し（挙動を変えない）', (() => {
    e.ls.setItem('chr6_slot_a', 'SAVE');
    return e.store['chr6_slot_a'] === 'SAVE' && e.ls.getItem('chr6_slot_a') === 'SAVE';
  })(), e.store);
  ok('★★fix346 の __v346raw が生アクセサとして機能する（ゴミアイテムにならない）',
     typeof e.ls.__v346raw === 'function' && e.store['__v346raw'] === undefined &&
     e.ls.__v346raw('chr6_slot_a') === 'SAVE', e.store);
  ok('★★モジュール2枚分の代入がすべて捕獲されている（内→外）',
     F(e).status().counts.getItem === 2 && F(e).status().counts.setItem === 2 &&
     F(e).status().counts.removeItem === 2, F(e).status().counts);
  ok('★★ゴミアイテムが1件も生まれない', F(e).garbageScan().length === 0, e.store);
}
{
  /* ★対照: トラップ無し（現状の iOS）では、実物の fix346/fix246 が**丸ごと素通り**する */
  const r = bootModules(false);
  const e = r.e;
  ok('★★[対照] fix346/fix246 のラッパは1枚も掛かっていない',
     e.ls.getItem === r.env.native.getItem && e.ls.setItem === r.env.native.setItem);
  e.ls.setItem('v292av2_kaede', 'data:image/png;base64,ZZZ');
  ok('★★[対照] 画像が localStorage に落ちる（quota 事故が起きる状態）',
     e.store['v292av2_kaede'] === 'data:image/png;base64,ZZZ');
  e.ls.setItem('v292Dfix77States', '{"a":1}');
  ok('★★[対照] スロット分離が効かない（別物語の状態が混ざる状態）',
     e.store['v292Dfix77States'] === '{"a":1}' && e.store['v292Dfix77States_slot_a'] === undefined);
  ok('★★[対照] 代わりに関数ソースのゴミアイテムが溜まる',
     ['getItem', 'setItem', 'removeItem', '__v346raw'].every(k => typeof e.store[k] === 'string'),
     Object.keys(e.store));
}

/* =====================================================================
   (11) 出荷の体裁（値ではなく関係で縛る）
   ===================================================================== */
console.log('\n== (11) 実装と出荷の体裁 ==');
{
  ok('★冪等ガードがある', /if\s*\(window\.__v292Dfix654\)\s*return/.test(SRC654));
  ok('★OFF スイッチがある', SRC654.indexOf("'v292Dfix654Off'") > 0);
  ok('★OFF は native 経由で読む（ラッパ経由にしない）',
     /rawGet\('v292Dfix654Off'\)/.test(SRC654) && /native\.getItem\.call/.test(SRC654));
  ok('★accessor は configurable:true（緊急時に手で戻せる）', /configurable:\s*true/.test(SRC654));
  ok('★全体が try/catch の fail-safe になっている', /catch\s*\(e\)\s*\{[\s\S]{0,400}not installed/.test(SRC654));
  ok('★既存モジュールを1バイトも変えていない（fix654 の名前が出てこない）',
     SRC346.indexOf('fix654') < 0 && SRC246.indexOf('fix654') < 0 && SRC569.indexOf('fix654') < 0);
  ok('★fix654 に CRLF / NUL は無い', (() => {
    const b = fs.readFileSync(path.join(__dirname, 'v292Dfix654-storage-trap.js'));
    return b.indexOf(Buffer.from('\r\n')) < 0 && b.filter(x => x === 0).length === 0;
  })());
}
{
  const ver = read('version.txt').trim();
  const token = (ver.match(/-(fix\w+)$/) || [])[1];
  ok('★version.txt から fix札を取り出せた', !!token, ver);
  ok('★★BUILT と version.txt が同値', (HTMLU.match(/var BUILT = '([^']+)'/) || [])[1] === ver,
     (HTMLU.match(/var BUILT = '([^']+)'/) || [])[1]);
  ok('★★HOME_BUILT と version.txt が同値', (HOME.match(/var HOME_BUILT = '([^']+)'/) || [])[1] === ver,
     (HOME.match(/var HOME_BUILT = '([^']+)'/) || [])[1]);
  ok('★★index.html に fix654 の script がある（cb は今の fix札）',
     (HTMLU.match(/v292Dfix654-storage-trap\.js\?cb=v292D(\w+)/) || [])[1] === token,
     (HTMLU.match(/v292Dfix654-storage-trap\.js\?cb=[^"]*/) || [])[0]);
  ok('★★home.html にも fix654 の script がある',
     (HOME.match(/v292Dfix654-storage-trap\.js\?cb=v292D(\w+)/) || [])[1] === token,
     (HOME.match(/v292Dfix654-storage-trap\.js\?cb=[^"]*/) || [])[0]);
  ok('★★index.html で fix654 は fix569 より前（すべてのラッパの代入を捕獲するため）',
     HTMLU.indexOf('v292Dfix654-storage-trap.js') > 0 &&
     HTMLU.indexOf('v292Dfix654-storage-trap.js') < HTMLU.indexOf('v292Dfix569-gc-shadow.js'));
  ok('★★home.html でも fix654 は fix569 より前',
     HOME.indexOf('v292Dfix654-storage-trap.js') > 0 &&
     HOME.indexOf('v292Dfix654-storage-trap.js') < HOME.indexOf('v292Dfix569-gc-shadow.js'));
  ok('★★index.html で fix654 は fix246 / fix346 より前',
     HTMLU.indexOf('v292Dfix654-storage-trap.js') > 0 &&
     HTMLU.indexOf('v292Dfix654-storage-trap.js') < HTMLU.indexOf('v292Dfix246-store-slot-isolation.js') &&
     HTMLU.indexOf('v292Dfix654-storage-trap.js') < HTMLU.indexOf('v292Dfix346-idb-avatars.js'));
  ok('★index.html の NUL は1個のまま',
     fs.readFileSync(path.join(__dirname, 'index.html')).filter(b => b === 0).length === 1);
  ok('★index.html に CRLF は無い', HTMLU.indexOf('\r\n') < 0);
  ok('★fix654 のソースの BUILD が version.txt と同値',
     (SRC654.match(/BUILD\s*=\s*'([^']+)'/) || [])[1] === ver, (SRC654.match(/BUILD\s*=\s*'([^']+)'/) || [])[1]);
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
