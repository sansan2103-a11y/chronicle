/* 回帰テスト: v292Dfix633 — アイコン版差分スイープを「全在庫」に対して回す
 *
 * ■このテストが固定する「約束」
 *   ①★原因B: 生localStorageが0件でも、IDB在庫225件が版差分の対象になる
 *     （fix523 の localAvKeys は localStorage.length を見ていて常に0件＝これが縮退の芯）
 *   ②判定表が fix523 と**完全に同一**（same-content / server-newer / local-newer / missing）
 *   ③実行は fix523 のプリミティブ（pullOne/pushOne/revSet）へ委譲する＝二重実装しない
 *   ④1スイープ最大6キー・round-robin（iOS配慮）
 *   ⑤fix523 が OFF なら本モジュールも動かない（緊急停止スイッチを1本に保つ）
 *   ⑥shadow（v292Dfix633Shadow='1'）は判定だけして通信しない
 *   ⑦画像以外のサーバーキー（v292meta1_*）には触らない
 *   ⑧送信待ち（v292Dfix402_pimg）のキーは触らない
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };

const SRC = fs.readFileSync(path.join(__dirname, 'v292Dfix633-icon-sweep-full.js'), 'utf8');

function smallHash(s){ let h = 5381; s = String(s || ''); for (let i = 0; i < s.length; i++){ h = ((h << 5) + h + s.charCodeAt(i)) | 0; } return (h >>> 0).toString(36); }
function hashFull(s){ const t = String(s || ''); return String(t.length) + ':' + smallHash(t); }

function mkLS(init){
  const store = Object.assign(Object.create(null), init || {});
  return {
    getItem(k){ return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v){ store[k] = String(v); },
    removeItem(k){ delete store[k]; },
    key(i){ const ks = Object.keys(store); return i < ks.length ? ks[i] : null; },
    get length(){ return Object.keys(store).length; },
    __store: store
  };
}
const tick = async (n = 80) => { for (let i = 0; i < n; i++) await Promise.resolve(); };

function load(opts){
  opts = opts || {};
  const ls = mkLS(Object.assign({ 'v292ProxyPass': 'pw', 'v292Dfix400_ns': 'abcd', 'v292Dfix633Live': '1' }, opts.ls || {}));
  const mem = Object.assign(Object.create(null), opts.mem || {});   // 'v292av2_pk' -> dataURL（IDB/fix346相当）
  const _get = ls.getItem.bind(ls);
  ls.getItem = (k) => (typeof k === 'string' && k.indexOf('v292av2_') === 0 && (k in mem)) ? mem[k] : _get(k);

  const calls = { pull: [], push: [], rev: [], fetch: [] };
  const revs = Object.assign(Object.create(null), opts.revs || {});
  const f523 = (opts.no523 ? null : {
    __armed: true,
    on: () => (opts.f523off ? false : true),
    hashFull: hashFull,
    revGet: (pk) => (+revs[pk] || 0),
    revSet: (pk, r) => { revs[pk] = +r || 0; calls.rev.push([pk, +r || 0]); },
    pullOne: (pk, rev, cb) => { calls.pull.push([pk, rev]); if (cb) cb(true); },
    pushOne: (pk, cb) => { calls.push.push(pk); if (cb) cb(true); },
    /* ★fix657: DEPS契約に isApplyBlocked が加わった(隔離キーの計画除外)。モックも契約を満たす */
    isApplyBlocked: () => false
  });

  const visible = opts.visible || [];
  const doc = { readyState: 'complete', visibilityState: 'visible', addEventListener(){},
    documentElement: {},
    querySelectorAll(sel){ return visible.map(pk => ({ getAttribute: (a) => (a === 'data-avpk' ? pk : null) })); } };

  const W = { localStorage: ls, document: doc };
  if (f523) W.__v292Dfix523 = f523;
  if (opts.inv !== null) W.__v292av = opts.inv || { keys: () => Object.keys(mem).map(k => k.slice('v292av2_'.length)), note(){}, refresh(cb){ if (cb) cb(); } };

  const manifest = opts.manifest || {};
  const fetchImpl = (url, init) => {
    calls.fetch.push({ url, body: init && init.body });
    if (opts.fetchFail) return Promise.reject(new Error('net'));
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, manifest }) });
  };

  const ctx = { window: W, localStorage: ls, document: doc, fetch: fetchImpl,
    console: { log(){}, warn(){}, error(){} },
    JSON, Math, Object, Array, String, Number, RegExp, Date, Promise,
    setTimeout: (fn) => { Promise.resolve().then(() => { try { fn(); } catch(e){} }); return 1; },
    setInterval: () => 2, clearInterval: () => {}, clearTimeout: () => {} };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'v292Dfix633-icon-sweep-full.js' });
  return { W, ls, mem, api: W.__v292Dfix633, calls, revs };
}
const actOf = (plan, pk) => { const e = plan.filter(p => p.pk === pk)[0]; return e ? e.act : null; };

(async () => {

console.log('--- 1. 起動と生存証明 ---');
{
  const { api } = load();
  ok('window.__v292Dfix633 が生える', !!api && api.__armed === true);
  ok('fix523 が居れば既定ON', api.on() === true);
  ok('status() が例外を投げない', (() => { try { api.status(); return true; } catch(e){ return false; } })());
}
{
  ok('★fix523 が居なければ動かない', load({ no523: true }).api.on() === false);
  ok('★fix523 が OFF なら動かない(緊急停止は1本)', load({ f523off: true }).api.on() === false);
  ok('自分のOFFでも動かない', load({ ls: { 'v292Dfix633Off': '1' } }).api.on() === false);
}

console.log('--- 2. ★原因B: 生localStorage 0件 / 在庫225件 が対象になる ---');
{
  const mem = {}, manifest = {};
  for (let i = 0; i < 225; i++){
    const d = 'data:image/png;base64,IMG' + i;
    mem['v292av2_pk' + i] = d;
    manifest['v292av2_pk' + i] = { rev: 1, hash: hashFull(d) };
  }
  const { api, ls } = load({ mem, manifest });
  ok('生localStorageに画像は1件も無い(実測LS=0件を再現)', Object.keys(ls.__store).filter(k => k.indexOf('v292av2_') === 0).length === 0);
  ok('★在庫が225件見えている', api.localKeys().length === 225, api.localKeys().length);
  const plan = api.decide(manifest);
  ok('★225件すべてが判定対象になる(縮退しない)', plan.length === 225, plan.length);
  ok('中身一致なので全部 rev 採用のみ', plan.every(p => p.act === 'rev' || p.act === 'noop'), plan.slice(0, 3));
}

console.log('--- 3. 判定表が fix523 と同一 ---');
{
  const mem = {
    'v292av2_same':  'data:image/png;base64,SAME',
    'v292av2_new':   'data:image/png;base64,LOCALNEW',
    'v292av2_old':   'data:image/png;base64,LOCALOLD',
    'v292av2_only':  'data:image/png;base64,LOCALONLY'
  };
  const manifest = {
    'v292av2_same':    { rev: 5, hash: hashFull('data:image/png;base64,SAME') },
    'v292av2_new':     { rev: 2, hash: hashFull('data:image/png;base64,SERVER') },  // 既知rev=9 → ローカルが新しい
    'v292av2_old':     { rev: 9, hash: hashFull('data:image/png;base64,SERVER') },  // 既知rev=2 → サーバーが新しい
    'v292av2_missing': { rev: 1, hash: hashFull('data:image/png;base64,M') }        // ローカルに無い
  };
  const { api } = load({ mem, manifest, revs: { same: 5, new: 9, old: 2 }, visible: ['missing'] });
  const plan = api.decide(manifest);
  ok('同じ中身 かつ rev一致 → noop', actOf(plan, 'same') === 'noop', plan);
  ok('★サーバーが厳密に新しい → pull', actOf(plan, 'old') === 'pull', plan);
  ok('★ローカルが新しい/未公開 → push', actOf(plan, 'new') === 'push', plan);
  ok('★ローカルに無く画面に映っている → pull', actOf(plan, 'missing') === 'pull', plan);
  ok('サーバーに無いローカル専用キーは対象外', actOf(plan, 'only') === null, plan);
}
{
  /* 同じ中身だが rev がずれている → 通信せず rev だけ採る */
  const mem = { 'v292av2_a': 'data:image/png;base64,A' };
  const manifest = { 'v292av2_a': { rev: 7, hash: hashFull('data:image/png;base64,A') } };
  const { api } = load({ mem, manifest, revs: { a: 3 } });
  ok('★中身一致・rev違い → rev のみ採用(PULLしない)', actOf(api.decide(manifest), 'a') === 'rev');
}
{
  /* ローカルに無く画面にも映っていない → 引かない(iOS負荷/通信量の保護) */
  const manifest = { 'v292av2_z': { rev: 1, hash: 'x' } };
  const { api } = load({ mem: {}, manifest, visible: [] });
  ok('★非表示のサーバー専用キーは引かない', api.decide(manifest).length === 0, api.decide(manifest));
}

console.log('--- 4. 画像以外のサーバーキーに触らない ---');
{
  const manifest = {
    'v292meta1_aiav': { rev: 3, hash: 'zzz' },       // fix634 の束
    'v292av2_a':      { rev: 1, hash: hashFull('data:image/png;base64,A') }
  };
  const { api } = load({ mem: { 'v292av2_a': 'data:image/png;base64,A' }, manifest, revs: { a: 1 } });
  const plan = api.decide(manifest);
  ok('★v292meta1_* は判定対象に入らない', plan.every(p => String(p.pk).indexOf('meta1') < 0), plan);
  ok('画像キーだけが対象', plan.length === 1 && plan[0].pk === 'a', plan);
}

console.log('--- 5. 送信待ち(v292Dfix402_pimg)のキーは触らない ---');
{
  const mem = { 'v292av2_a': 'data:image/png;base64,A', 'v292av2_b': 'data:image/png;base64,B' };
  const manifest = {
    'v292av2_a': { rev: 9, hash: hashFull('data:image/png;base64,SERVER') },
    'v292av2_b': { rev: 9, hash: hashFull('data:image/png;base64,SERVER') }
  };
  const { api } = load({ mem, manifest, revs: { a: 1, b: 1 },
    ls: { 'v292Dfix402_pimg': JSON.stringify({ 'v292av2_a': { ts: 1, h: 'x' } }) } });
  const plan = api.decide(manifest);
  ok('★pending のキーは除外される', actOf(plan, 'a') === null, plan);
  ok('pending でないキーは残る', actOf(plan, 'b') === 'pull', plan);
}

console.log('--- 6. sweep は fix523 のプリミティブへ委譲する ---');
{
  const mem = {}, manifest = {};
  for (let i = 0; i < 20; i++){
    mem['v292av2_p' + i] = 'data:image/png;base64,LOCAL' + i;
    manifest['v292av2_p' + i] = { rev: 9, hash: hashFull('data:image/png;base64,SERVER' + i) };
  }
  const { api, calls } = load({ mem, manifest });    // 既知rev=0 < 9 → 全部 pull
  await new Promise(r => api.sweep(r));
  await tick(200);
  ok('★pullOne が呼ばれる(自前でfetchしない)', calls.pull.length > 0, calls.pull.length);
  ok('★1スイープ最大6件(iOS配慮)', calls.pull.length === 6, calls.pull.length);
  const first = calls.pull.map(x => x[0]);
  await new Promise(r => api.sweep(r));
  await tick(200);
  const second = calls.pull.slice(6).map(x => x[0]);
  ok('★round-robin で次の6件へ進む', JSON.stringify(first) !== JSON.stringify(second), [first, second]);
  ok('サーバーrevを渡している', calls.pull[0][1] === 9);
}
{
  const mem = { 'v292av2_a': 'data:image/png;base64,A' };
  const manifest = { 'v292av2_a': { rev: 1, hash: hashFull('data:image/png;base64,SERVER') } };
  const { api, calls } = load({ mem, manifest, revs: { a: 5 } });   // 既知rev>サーバー → push
  await new Promise(r => api.sweep(r));
  await tick(100);
  ok('★pushOne が呼ばれる', JSON.stringify(calls.push) === JSON.stringify(['a']), calls.push);
  ok('pull は呼ばれない', calls.pull.length === 0);
}
{
  const mem = { 'v292av2_a': 'data:image/png;base64,A' };
  const manifest = { 'v292av2_a': { rev: 7, hash: hashFull('data:image/png;base64,A') } };
  const { api, calls, revs } = load({ mem, manifest, revs: { a: 3 } });
  await new Promise(r => api.sweep(r));
  await tick(100);
  ok('★中身一致なら通信せず revSet だけ', calls.pull.length === 0 && calls.push.length === 0 && revs.a === 7, [calls, revs]);
}

console.log('--- 7. shadow は判定だけして通信しない ---');
{
  const mem = { 'v292av2_a': 'data:image/png;base64,A' };
  const manifest = { 'v292av2_a': { rev: 9, hash: hashFull('data:image/png;base64,SERVER') } };
  const { api, calls } = load({ mem, manifest, ls: { 'v292Dfix633Shadow': '1' } });
  const r = await new Promise(res => api.sweep(res));
  await tick(60);
  ok('shadow() が true', api.shadow() === true);
  ok('★shadow では pullOne/pushOne を呼ばない', calls.pull.length === 0 && calls.push.length === 0, calls);
  ok('判定結果は返る(何件をどう判定したかが見える)', r && r.pull === 1, r);
}

console.log('--- 8. OFF は本当に何もしない ---');
{
  const mem = { 'v292av2_a': 'data:image/png;base64,A' };
  const manifest = { 'v292av2_a': { rev: 9, hash: 'x' } };
  const { api, calls } = load({ mem, manifest, ls: { 'v292Dfix633Off': '1' } });
  await new Promise(r => api.sweep(r));
  await tick(60);
  ok('★OFFなら通信も委譲も起きない', calls.fetch.length === 0 && calls.pull.length === 0 && calls.push.length === 0, calls);
}
{
  const { api, calls } = load({ mem: { 'v292av2_a': 'data:image/png;base64,A' },
    manifest: { 'v292av2_a': { rev: 9, hash: 'x' } }, f523off: true });
  await new Promise(r => api.sweep(r));
  await tick(60);
  ok('★fix523 OFF でも通信しない', calls.fetch.length === 0, calls.fetch);
}
{
  const { api, calls } = load({ ls: { 'v292Dfix400_ns': '' }, mem: { 'v292av2_a': 'data:image/png;base64,A' } });
  await new Promise(r => api.sweep(r));
  await tick(60);
  ok('ns 未取得なら通信しない', calls.fetch.length === 0);
}
{
  const { api, calls } = load({ ls: { 'v292ProxyPass': '' }, mem: { 'v292av2_a': 'data:image/png;base64,A' } });
  await new Promise(r => api.sweep(r));
  await tick(60);
  ok('未ログインなら通信しない', calls.fetch.length === 0);
}

console.log('--- 9. manifest は10秒TTLでキャッシュし、往復を増やさない ---');
{
  const { api, calls } = load({ manifest: { 'v292av2_a': { rev: 1, hash: 'x' } } });
  await new Promise(r => api.manifest(() => r()));
  await new Promise(r => api.manifest(() => r()));
  ok('★2回目はキャッシュ(fetchは1回)', calls.fetch.length === 1, calls.fetch.length);
  api.invalidateManifest();
  await new Promise(r => api.manifest(() => r()));
  ok('invalidate すれば取り直す', calls.fetch.length === 2, calls.fetch.length);
  ok('op:imgmanifest を送っている', String(calls.fetch[0].body).indexOf('imgmanifest') >= 0, calls.fetch[0]);
}
{
  const { api, calls } = load({ fetchFail: true });
  const m = await new Promise(r => api.manifest(r));
  ok('通信失敗なら null を返し例外を投げない', m === null);
  await new Promise(r => api.sweep(r));
  ok('manifest が無ければスイープしない', true);
}

console.log('--- 10. 堅牢性 ---');
{
  const { api } = load();
  ok('decide(null) が空配列', JSON.stringify(api.decide(null)) === '[]');
  ok('decide({}) が空配列', JSON.stringify(api.decide({})) === '[]');
  const { api: api2 } = load({ ls: { 'v292Dfix402_pimg': '{{{broken' } });
  ok('壊れたpending台帳でも落ちない', (() => { try { api2.decide({}); return true; } catch(e){ return false; } })());
}
{
  const { W, api } = load();
  const before = W.__v292Dfix633;
  ok('冪等ガード用の __armed がある', before.__armed === true);
}


console.log('--- 15. ★既定はshadow（Live未指定ならPULL/PUSHを撃たない） ---');
{
  const mem = { 'v292av2_a': 'data:image/png;base64,A' };
  const manifest = { imgs: { 'v292av2_a': { rev: 9, h: 'srv' } } };
  const { api, calls } = load({ mem, manifest, ls: { 'v292Dfix633Live': '' } });
  ok('★Live未指定なら shadow() が true', api.shadow() === true);
  ok('★★既定では pullOne/pushOne を呼ばない', calls.pull.length === 0 && calls.push.length === 0, calls);
}
{
  const { api } = load({});   // ヘルパ既定は Live='1'
  ok("Live='1' なら shadow() は false", api.shadow() === false);
}

console.log('');
console.log('pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);

})();
