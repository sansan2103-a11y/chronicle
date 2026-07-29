/* 回帰テスト: v292Dfix634 — AI外見説明文(chrAiAv4:)の端末間同期
 *
 * ■このテストが固定する「約束」
 *   ①束ねて既存 op:putimg チャネルへ置く（Worker無改造・キー1本・1リクエスト）
 *   ②★idempotencyキー(mid)を送らない（既知C4: payloadハッシュをidemキーにしない）
 *   ③マージは union。**片方にしか無いキーを消さない**（削除処理を作らない・制約6）
 *   ④★書き戻すのは 'chrAiAv4:' で始まるキーだけ（payloadに何が入っていても他は書かない）
 *   ⑤衝突は t が新しい方。t 同値なら文字列の小さい方＝**どの端末でも同じ答え**に収束する
 *   ⑥2端末シミュレーションで**必ず収束し、振動しない**（絵が行ったり来たりしない）
 *   ⑦409(image-conflict) → 取り直してマージ → 1回だけ再送
 *   ⑧OFF（v292Dfix634Off='1'）で通信も書込も起きない
 *   ⑨QuotaExceeded を掴んだらその回のマージを中断する（他のキーを壊さない）
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };

const SRC = fs.readFileSync(path.join(__dirname, 'v292Dfix634-aiappearance-sync.js'), 'utf8');
const SRVKEY = 'v292meta1_aiav';

function smallHash(s){ let h = 5381; s = String(s || ''); for (let i = 0; i < s.length; i++){ h = ((h << 5) + h + s.charCodeAt(i)) | 0; } return (h >>> 0).toString(36); }
function hashFull(s){ const t = String(s || ''); return String(t.length) + ':' + smallHash(t); }

function mkLS(init, opts){
  opts = opts || {};
  const store = Object.assign(Object.create(null), init || {});
  return {
    getItem(k){ return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v){ if (opts.blockWrite && opts.blockWrite(k)) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } store[k] = String(v); },
    removeItem(k){ delete store[k]; },
    key(i){ const ks = Object.keys(store); return i < ks.length ? ks[i] : null; },
    get length(){ return Object.keys(store).length; },
    __store: store
  };
}

/* ---- Worker v26 の putimg/imgmanifest/GET /img を模した最小サーバー ---- */
function mkServer(){
  const S = { rev: 0, data: null, bodies: [], gets: 0 };
  S.hash = () => (S.data == null ? null : hashFull(S.data));
  S.fetch = (url, init) => {
    const u = String(url);
    if (u.indexOf('/img?') >= 0){
      S.gets++;
      if (S.data == null) return Promise.resolve({ ok: false, status: 404 });
      const m = /^data:([^;,]+);base64,([\s\S]*)$/.exec(S.data);
      const buf = Buffer.from(m[2], 'base64');
      return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)) });
    }
    const body = JSON.parse(init.body);
    S.bodies.push(body);
    if (body.op === 'imgmanifest'){
      const man = {};
      if (S.data != null) man[SRVKEY] = { rev: S.rev, hash: S.hash() };
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, manifest: man }) });
    }
    if (body.op === 'putimg'){
      const h = hashFull(body.data);
      /* d1PutImg(v26:1562-1574) と同じ意味づけ */
      if (body.baseImageRev != null){
        if (S.data != null && S.hash() === h) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, imageRev: S.rev, hash: h, noop: true }) });
        if (S.data == null){ S.data = body.data; S.rev = 1; return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, imageRev: 1, hash: h }) }); }
        if (+body.baseImageRev !== S.rev){
          return Promise.resolve({ ok: false, status: 409, json: () => Promise.resolve({ ok: false, errorCode: 'image-conflict', serverRev: S.rev }) });
        }
      }
      S.data = body.data; S.rev++;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, imageRev: S.rev, hash: h }) });
    }
    return Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({ ok: false }) });
  };
  return S;
}

const tick = async (n = 80) => { for (let i = 0; i < n; i++) await Promise.resolve(); };

function load(opts){
  opts = opts || {};
  const ls = opts.ls || mkLS(Object.assign({ 'v292ProxyPass': 'pw', 'v292Dfix400_ns': 'abcd' }, opts.lsInit || {}), opts.lsOpts);
  const doc = { readyState: 'complete', visibilityState: 'visible', addEventListener(){} };
  const W = { localStorage: ls, document: doc };
  if (opts.f633) W.__v292Dfix633 = opts.f633;
  const server = opts.server || mkServer();
  const ctx = { window: W, localStorage: ls, document: doc, fetch: server.fetch,
    console: { log(){}, warn(){}, error(){} },
    JSON, Math, Object, Array, String, Number, RegExp, Date, Promise,
    TextEncoder, TextDecoder, btoa, atob, Buffer, Uint8Array,
    setTimeout: (fn) => { Promise.resolve().then(() => { try { fn(); } catch(e){} }); return 1; },
    setInterval: () => 2, clearInterval: () => {}, clearTimeout: () => {},
    escape: global.escape, unescape: global.unescape, encodeURIComponent, decodeURIComponent };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'v292Dfix634-aiappearance-sync.js' });
  return { W, ls, api: W.__v292Dfix634, server };
}

(async () => {

console.log('--- 1. 起動と生存証明 ---');
{
  const { api } = load();
  ok('window.__v292Dfix634 が生える', !!api && api.__armed === true);
  ok('既定ON', api.on() === true);
  ok('サーバーキーは v292meta1_aiav（v292av2_ で始まらない＝fix523/fix633が無視する）',
     api.SRVKEY === SRVKEY && api.SRVKEY.indexOf('v292av2_') !== 0);
  ok('status() が例外を投げない', (() => { try { api.status(); return true; } catch(e){ return false; } })());
}

console.log('--- 2. 束の作り方と符号化 ---');
{
  const { api, ls } = load({ lsInit: {
    'chrAiAv4:白石澪::123': 'a young woman with long black hair',
    'chrAiAv4:ミア::456': '若い女性、赤い外套',
    'chr6': '{"turns":[]}',
    'v292en_x': 'not-this-one'
  } });
  const b = api.bundle();
  ok('chrAiAv4: だけを束ねる', JSON.stringify(Object.keys(b.m).sort()) === JSON.stringify(['chrAiAv4:ミア::456', 'chrAiAv4:白石澪::123'].sort()), Object.keys(b.m));
  ok('★v292en_ は入れない（GPT裁定）', !Object.keys(b.m).some(k => k.indexOf('v292en_') === 0));
  ok('chr6 のようなセーブ本体は入れない', !Object.keys(b.m).some(k => k === 'chr6'));
  ok('既存エントリの世代は 0（サーバー側に既にあればそちらへ収束する）', b.m['chrAiAv4:ミア::456'].t === 0, b.m);

  const enc = api.encode(b);
  ok('data:application/json;base64, で符号化する（GET /img が読める形）', enc.indexOf('data:application/json;base64,') === 0);
  const dec = api.decode(Buffer.from(enc.split(',')[1], 'base64').toString('utf8'));
  ok('★日本語を含めて往復できる', dec.m['chrAiAv4:ミア::456'].v === '若い女性、赤い外套', dec.m);
  ok('bundleHash は at を含まない（中身が同じなら送らないため）',
     api.bundleHash(b) === api.bundleHash(Object.assign({}, b, { at: b.at + 99999 })));
}

console.log('--- 3. ★マージ規則 ---');
{
  const { api, ls } = load({ lsInit: { 'chrAiAv4:a::1': 'LOCAL-A', 'chrAiAv4:only-local::1': 'KEEP-ME' } });
  const r = api.merge({ v: 1, m: {
    'chrAiAv4:a::1': { v: 'LOCAL-A', t: 5 },              // 同値
    'chrAiAv4:b::1': { v: 'REMOTE-B', t: 3 },             // リモートのみ
    'v292en_evil': { v: 'SHOULD-NOT-BE-WRITTEN', t: 9 },  // ★対象外プレフィックス
    'chr6': { v: '{"turns":["EVIL"]}', t: 9 }             // ★セーブ本体を装った payload
  } });
  ok('リモートのみのキーを取り込む', ls.getItem('chrAiAv4:b::1') === 'REMOTE-B');
  ok('★ローカルのみのキーを消さない(union)', ls.getItem('chrAiAv4:only-local::1') === 'KEEP-ME');
  ok('★chrAiAv4: 以外は絶対に書かない(v292en_)', ls.getItem('v292en_evil') === null);
  ok('★chrAiAv4: 以外は絶対に書かない(chr6)', ls.getItem('chr6') === null);
  ok('対象外は skipped に数える', r.skipped === 2, r);
  ok('取り込みは1件', r.applied === 1, r);
  ok('同値の世代はサーバー側を採用する', api.tmap()['chrAiAv4:a::1'] === 5, api.tmap());
}
{
  /* 衝突: リモートの t が新しい → リモートが勝つ */
  const { api, ls } = load({ lsInit: { 'chrAiAv4:a::1': 'LOCAL', 'v292Dfix634_t': JSON.stringify({ 'chrAiAv4:a::1': 100 }) } });
  api.merge({ v: 1, m: { 'chrAiAv4:a::1': { v: 'REMOTE', t: 200 } } });
  ok('★リモートが新しければリモートが勝つ', ls.getItem('chrAiAv4:a::1') === 'REMOTE');
}
{
  /* 衝突: ローカルの t が新しい → ローカルを守る（↻で作り直した分が消えない） */
  const { api, ls } = load({ lsInit: { 'chrAiAv4:a::1': 'LOCAL', 'v292Dfix634_t': JSON.stringify({ 'chrAiAv4:a::1': 300 }) } });
  api.merge({ v: 1, m: { 'chrAiAv4:a::1': { v: 'REMOTE', t: 200 } } });
  ok('★ローカルが新しければローカルを守る(↻の結果を消さない)', ls.getItem('chrAiAv4:a::1') === 'LOCAL');
}
{
  /* 同値の t（どちらも既存＝t=0）→ 文字列の小さい方。**どちらの端末でも同じ答え** */
  const A = load({ lsInit: { 'chrAiAv4:a::1': 'AAA' } });
  const B = load({ lsInit: { 'chrAiAv4:a::1': 'BBB' } });
  A.api.merge({ v: 1, m: { 'chrAiAv4:a::1': { v: 'BBB', t: 0 } } });
  B.api.merge({ v: 1, m: { 'chrAiAv4:a::1': { v: 'AAA', t: 0 } } });
  ok('★t同値のタイブレークは決定的（両端末が同じ値になる）',
     A.ls.getItem('chrAiAv4:a::1') === 'AAA' && B.ls.getItem('chrAiAv4:a::1') === 'AAA',
     [A.ls.getItem('chrAiAv4:a::1'), B.ls.getItem('chrAiAv4:a::1')]);
}
{
  /* 異常な payload で落ちない */
  const { api } = load();
  ok('null/空でも落ちない', (() => { try { api.merge(null); api.merge({}); api.merge({ m: null }); return true; } catch(e){ return false; } })());
  const { api: a2, ls: l2 } = load();
  const r = a2.merge({ m: { 'chrAiAv4:big::1': { v: 'x'.repeat(5000), t: 1 }, 'chrAiAv4:nil::1': { v: '', t: 1 } } });
  ok('大きすぎる値は取り込まない(2000文字上限)', l2.getItem('chrAiAv4:big::1') === null);
  ok('空値は取り込まない', l2.getItem('chrAiAv4:nil::1') === null && r.skipped === 2, r);
}
{
  /* QuotaExceeded → その回のマージを中断する */
  const ls = mkLS({ 'v292ProxyPass': 'pw', 'v292Dfix400_ns': 'abcd', 'chrAiAv4:keep::1': 'KEEP' },
                  { blockWrite: (k) => k.indexOf('chrAiAv4:new') === 0 });
  const { api } = load({ ls });
  const r = api.merge({ m: { 'chrAiAv4:new1::1': { v: 'N1', t: 1 }, 'chrAiAv4:new2::1': { v: 'N2', t: 1 } } });
  ok('★書込失敗で aborted になる', r.aborted === true, r);
  ok('既存キーは壊れない', ls.getItem('chrAiAv4:keep::1') === 'KEEP');
}

console.log('--- 4. 送信の形（Worker契約・C4） ---');
{
  const { api, server } = load({ lsInit: { 'chrAiAv4:a::1': 'A' } });
  const r = await new Promise(res => api.pushNow(true, res));
  await tick();
  const body = server.bodies.filter(b => b.op === 'putimg')[0];
  ok('op:putimg で送る', !!body);
  ok('サーバーキーは1本だけ', body.k === SRVKEY);
  ok('★mid(idempotencyキー)を送らない（既知C4）', !('mid' in body), Object.keys(body));
  ok('baseImageRev(CAS)を送る', body.baseImageRev === 0, body.baseImageRev);
  ok('値は data:application/json;base64,', String(body.data).indexOf('data:application/json;base64,') === 0);
  ok('push成功でrevを覚える', api.state().rev === 1, api.state());
  ok('サーバーが返したhashを覚える', api.state().srvHash === hashFull(body.data), api.state());
}
{
  const { api, server } = load({ lsInit: { 'chrAiAv4:a::1': 'A' } });
  await new Promise(res => api.pushNow(true, res));
  const n1 = server.bodies.length;
  const r2 = await new Promise(res => api.pushNow(false, res));
  ok('★中身が同じなら送らない', r2.skipped === 'unchanged' && server.bodies.length === n1, [r2, server.bodies.length]);
}
{
  const { api, server } = load({ lsInit: {} });
  const r = await new Promise(res => api.pushNow(true, res));
  ok('束が空なら送らない', r.skipped === 'empty' && server.bodies.filter(x => x.op === 'putimg').length === 0, [r, server.bodies.map(x => x.op)]);
}

console.log('--- 5. 409(image-conflict) → 取り直してマージ → 1回だけ再送 ---');
{
  const server = mkServer();
  /* 他端末が先に置いた状態を作る */
  const other = load({ server, lsInit: { 'chrAiAv4:x::1': 'FROM-OTHER' } });
  await new Promise(res => other.api.pushNow(true, res));
  await tick();

  /* こちらは rev=0 のまま（＝知らない）で押す → 409 */
  const me = load({ server, lsInit: { 'chrAiAv4:y::1': 'FROM-ME' } });
  const r = await new Promise(res => me.api.pushNow(true, res));
  await tick(200);
  ok('★409を検出して conflict 経路へ入る', r && r.conflict === true, r);
  ok('★取り直してマージした結果、相手の分が手元に入る', me.ls.getItem('chrAiAv4:x::1') === 'FROM-OTHER', me.ls.__store);
  ok('自分の分は残っている(union)', me.ls.getItem('chrAiAv4:y::1') === 'FROM-ME');
}

console.log('--- 6. sweep: サーバーが空なら公開、既知なら引き直さない ---');
{
  const { api, server } = load({ lsInit: { 'chrAiAv4:a::1': 'A' } });
  const r1 = await new Promise(res => api.sweep(res));
  await tick(200);
  ok('★サーバーが空 → 自分の束を1回公開する', r1 && r1.published === true, r1);
  ok('サーバーに載った', server.data != null && server.rev === 1);
  const gets1 = server.gets;
  const r2 = await new Promise(res => api.sweep(res));
  await tick(200);
  ok('★自分が置いた版なら引き直さない(GETしない)', server.gets === gets1, [server.gets, gets1, r2]);
  ok('変化が無ければ何もしない', r2 && r2.same === true, r2);
}
{
  /* 相手が置いた版は1回だけ引き、次からは引かない（seen） */
  const server = mkServer();
  const other = load({ server, lsInit: { 'chrAiAv4:x::1': 'OTHER' } });
  await new Promise(res => other.api.pushNow(true, res));
  await tick();
  const me = load({ server, lsInit: {} });
  await new Promise(res => me.api.sweep(res));
  await tick(200);
  ok('相手の分を取り込む', me.ls.getItem('chrAiAv4:x::1') === 'OTHER');
  const g1 = server.gets;
  await new Promise(res => me.api.sweep(res));
  await tick(200);
  ok('★同じサーバー版を毎回GETし直さない(seen)', server.gets === g1, [server.gets, g1]);
}

console.log('--- 7. ★2端末シミュレーション: 収束し、振動しない ---');
{
  const server = mkServer();
  const A = load({ server, lsInit: { 'chrAiAv4:mia::1': 'DESC-FROM-A', 'chrAiAv4:aonly::1': 'A-ONLY' } });
  const B = load({ server, lsInit: { 'chrAiAv4:mia::1': 'DESC-FROM-B', 'chrAiAv4:bonly::1': 'B-ONLY' } });
  const step = async (d) => { await new Promise(res => d.api.sweep(res)); await tick(200); };
  for (let round = 0; round < 4; round++){ await step(A); await step(B); }

  const a = A.ls, b = B.ls;
  ok('★同じキャラの説明文が一致する（=同じ絵になる）',
     a.getItem('chrAiAv4:mia::1') === b.getItem('chrAiAv4:mia::1'),
     [a.getItem('chrAiAv4:mia::1'), b.getItem('chrAiAv4:mia::1')]);
  ok('★決定的な勝者（文字列の小さい方）', a.getItem('chrAiAv4:mia::1') === 'DESC-FROM-A', a.getItem('chrAiAv4:mia::1'));
  ok('★片方にしか無かった分も両方へ渡る(A→B)', b.getItem('chrAiAv4:aonly::1') === 'A-ONLY');
  ok('★片方にしか無かった分も両方へ渡る(B→A)', a.getItem('chrAiAv4:bonly::1') === 'B-ONLY');

  const revBefore = server.rev, putsBefore = server.bodies.filter(x => x.op === 'putimg').length;
  for (let round = 0; round < 3; round++){ await step(A); await step(B); }
  ok('★収束後は書き込みが起きない(振動しない)',
     server.rev === revBefore && server.bodies.filter(x => x.op === 'putimg').length === putsBefore,
     [server.rev, revBefore]);
  ok('収束後も中身は変わらない', a.getItem('chrAiAv4:mia::1') === 'DESC-FROM-A' && b.getItem('chrAiAv4:mia::1') === 'DESC-FROM-A');
}
{
  /* ↻で作り直した側（t が新しい）が勝ち、相手へ伝播する */
  const server = mkServer();
  const A = load({ server, lsInit: { 'chrAiAv4:mia::1': 'OLD' } });
  const B = load({ server, lsInit: { 'chrAiAv4:mia::1': 'OLD' } });
  const step = async (d) => { await new Promise(res => d.api.sweep(res)); await tick(200); };
  await step(A); await step(B);
  /* B が作り直す（setItem ラッパが世代を記録する） */
  B.ls.setItem('chrAiAv4:mia::1', 'REGENERATED-BY-B');
  await tick();
  await step(B); await step(A);
  ok('★↻で作り直した説明文が相手端末へ伝播する', A.ls.getItem('chrAiAv4:mia::1') === 'REGENERATED-BY-B', A.ls.getItem('chrAiAv4:mia::1'));
}

console.log('--- 8. setItem ラッパ ---');
{
  const { api, ls } = load({ lsInit: {} });
  ls.setItem('chrAiAv4:new::1', 'HELLO');
  ok('値はちゃんと書かれる', ls.getItem('chrAiAv4:new::1') === 'HELLO');
  ok('★この端末で作られた世代 t が記録される', (+api.tmap()['chrAiAv4:new::1'] || 0) > 0, api.tmap());
  ls.setItem('chr6', '{"turns":[]}');
  ok('無関係のキーは世代を記録しない', !('chr6' in api.tmap()), api.tmap());
  ok('無関係のキーもちゃんと書かれる', ls.getItem('chr6') === '{"turns":[]}');
}

console.log('--- 9. OFF は本当に何もしない ---');
{
  const { api, ls, server } = load({ lsInit: { 'v292Dfix634Off': '1', 'chrAiAv4:a::1': 'A' } });
  ok('on()=false', api.on() === false);
  await new Promise(res => api.sweep(res));
  await new Promise(res => api.pushNow(true, res));
  await new Promise(res => api.pullNow(res));
  await tick(100);
  ok('★OFFなら1バイトも通信しない', server.bodies.length === 0 && server.gets === 0, [server.bodies.length, server.gets]);
  ls.setItem('chrAiAv4:b::1', 'B');
  ok('OFFでも書込は通る(壊さない)', ls.getItem('chrAiAv4:b::1') === 'B');
  ok('OFFなら世代台帳も書かない', ls.getItem('v292Dfix634_t') === null);
}
{
  const { api, server } = load({ lsInit: { 'v292Dfix400_ns': '', 'chrAiAv4:a::1': 'A' } });
  await new Promise(res => api.sweep(res));
  await tick(60);
  ok('ns未取得なら通信しない', server.bodies.length === 0 && server.gets === 0);
}
{
  const { api, server } = load({ lsInit: { 'v292ProxyPass': '', 'chrAiAv4:a::1': 'A' } });
  await new Promise(res => api.sweep(res));
  await tick(60);
  ok('未ログインなら通信しない', server.bodies.length === 0);
}

console.log('--- 10. fix633 の manifest を共用する（往復を増やさない） ---');
{
  let called = 0;
  const f633 = { manifest: (cb) => { called++; cb({}); } };
  const { api, server } = load({ f633, lsInit: { 'chrAiAv4:a::1': 'A' } });
  await new Promise(res => api.sweep(res));
  await tick(100);
  ok('★fix633.manifest があればそれを使う', called === 1, called);
  ok('自前で imgmanifest を投げない', server.bodies.filter(b => b.op === 'imgmanifest').length === 0);
}

console.log('--- 11. 堅牢性 ---');
{
  const { api } = load({ lsInit: { 'v292Dfix634_t': '{{{broken', 'v292Dfix634_st': '{{{broken' } });
  ok('壊れた台帳でも {} として扱う', JSON.stringify(api.tmap()) === '{}' && JSON.stringify(api.state()) === '{}');
  ok('decode(壊れた文字列) は null', api.decode('{{{') === null && api.decode('') === null);
  ok('decode(m無し) は null', api.decode('{"v":1}') === null);
}
{
  const { W } = load();
  ok('冪等ガード用の __armed がある', W.__v292Dfix634.__armed === true);
}

console.log('');
console.log('pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);

})();
