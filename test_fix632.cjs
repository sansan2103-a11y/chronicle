/* 回帰テスト: v292Dfix632 — 画像の中身の変化を検出して full 同期を起こす
 *                + ★fix517 / fix516 の挙動を壊していないことの固定（制約3）
 *
 * ■このテストが固定する「約束」
 *   ①中身が変わったときだけ dirty 化する（同じ絵を書き直しても dirty にしない）
 *   ②dirty の印は fix399 の hash() 出力（10進数字列）と**絶対に衝突しない**
 *     ★これが「fix399を1バイトも変えずに full 送信を起こす」設計の唯一の前提
 *   ③full 送信が成功して fix399 が imgHash を書き戻すと dirty は自動で解除される
 *   ④書込は必ず本来の連鎖（fix523→fix346）へ通す。画像を生localStorageへ増やさない
 *   ⑤OFF（v292Dfix632Off='1'）で素通し＝fix630 時点の挙動へ戻る
 *   ⑥setItem を経ないIDB直書きも起動時 reconcile が拾う。初回シードは**一度だけ**
 *   ⑦★fix517: ローカル実画像あり→urlForは''／なし→元URL（fail-open）。fix632を噛ませても同じ
 *   ⑧★fix516: opt-in のときだけ armed。凍結pk一致かつローカル有のときだけ ''
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };

const SRC632 = fs.readFileSync(path.join(__dirname, 'v292Dfix632-img-content-dirty.js'), 'utf8');
const SRC517 = fs.readFileSync(path.join(__dirname, 'v292Dfix517-local-authoritative-avatar.js'), 'utf8');
const SRC516 = fs.readFileSync(path.join(__dirname, 'v292Dfix516-regen-local-display.js'), 'utf8');

/* ---- v292Dfix399-cloudsync.js:62 の hash() を**そのまま**写したもの ---- */
function fix399hash(s){ var h = 0; s = String(s || ''); for (var i = 0; i < s.length; i++){ h = ((h << 5) - h + s.charCodeAt(i)) | 0; } return String(h >>> 0); }

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
/* fix346 を模したラッパ: 'v292av2_' は mem(=IDB相当)にだけ置き、生localStorageへは書かない */
function installFix346Like(ls, mem){
  const _get = ls.getItem.bind(ls), _set = ls.setItem.bind(ls), _del = ls.removeItem.bind(ls);
  ls.getItem = (k) => (typeof k === 'string' && k.indexOf('v292av2_') === 0 && (k in mem)) ? mem[k] : _get(k);
  ls.setItem = (k, v) => { if (typeof k === 'string' && k.indexOf('v292av2_') === 0){ mem[k] = String(v); return; } return _set(k, v); };
  ls.removeItem = (k) => { if (typeof k === 'string' && k.indexOf('v292av2_') === 0){ delete mem[k]; return; } return _del(k); };
}
function mkDoc(){
  return { readyState: 'complete', visibilityState: 'visible',
    addEventListener(){}, documentElement: {},
    getElementsByTagName(){ return []; }, querySelectorAll(){ return []; } };
}
function mkCtx(W, ls, extra){
  const ctx = Object.assign({ window: W, localStorage: ls, document: W.document,
    console: { log(){}, warn(){}, error(){} },
    JSON, Math, Object, Array, String, Number, RegExp, Date, Promise,
    setTimeout: (fn) => { Promise.resolve().then(() => { try { fn(); } catch(e){} }); return 1; },
    setInterval: () => 2, clearInterval: () => {}, clearTimeout: () => {},
    MutationObserver: function(){ this.observe = function(){}; this.disconnect = function(){}; } }, extra || {});
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  return ctx;
}
const tick = async (n = 60) => { for (let i = 0; i < n; i++) await Promise.resolve(); };

function load632(opts){
  opts = opts || {};
  const ls = mkLS(opts.ls || {});
  const mem = Object.assign(Object.create(null), opts.mem || {});
  installFix346Like(ls, mem);
  const W = { localStorage: ls, document: mkDoc() };
  if (opts.inv) W.__v292av = opts.inv;
  const ctx = mkCtx(W, ls);
  vm.runInContext(SRC632, ctx, { filename: 'v292Dfix632-img-content-dirty.js' });
  return { W, ls, mem, api: W.__v292Dfix632 };
}

(async () => {

console.log('--- 1. 起動と生存証明 ---');
{
  const { api } = load632();
  ok('window.__v292Dfix632 が生える', !!api && api.__armed === true);
  ok('既定ON', api.on() === true);
  ok('status() が例外を投げない', (() => { try { api.status(); return true; } catch(e){ return false; } })());
}

console.log('--- 2. ★sentinel は fix399 の hash() と絶対に衝突しない ---');
{
  const { api } = load632();
  ok('SENTINEL は "dirty632:"', api.SENTINEL === 'dirty632:');
  let allDigits = true, collide = false;
  const samples = ['', 'a', 'v292av2_x|v292av2_y', 'あ', '0', 'dirty632:1', 'x'.repeat(500)];
  for (let i = 0; i < 3000; i++) samples.push('v292av2_pk' + i + '|v292av2_pk' + (i * 7));
  for (const s of samples){
    const h = fix399hash(s);
    if (!/^\d+$/.test(h)) allDigits = false;
    if (h.indexOf('dirty632:') === 0) collide = true;
  }
  ok('★fix399の hash() は常に10進数字列', allDigits);
  ok('★どの入力でも "dirty632:" を生成しない = 衝突不能', !collide);
  ok('sentinelは数字列ではない', !/^\d+$/.test(api.SENTINEL + Date.now()));
}

console.log('--- 3. ★中身が変わったときだけ dirty 化する ---');
{
  const { api, ls, mem } = load632();
  const D1 = 'data:image/png;base64,AAAA', D2 = 'data:image/png;base64,BBBB';
  ok('初期は dirty でない', api.isDirty() === false);
  ls.setItem('v292av2_mia', D1);
  ok('新規書込で dirty になる', api.isDirty() === true, ls.getItem('v292Dfix399_imgHash'));
  ok('★画像は生localStorageへ入らない(fix346連鎖へ通っている)', ls.__store['v292av2_mia'] === undefined);
  ok('memへ届いている', mem['v292av2_mia'] === D1);
  ok('台帳に中身ハッシュが載る', api.ledger()['mia'] === api.hashFull(D1), api.ledger());

  // fix399 が full 送信に成功したときの書き戻しを模す
  ls.setItem('v292Dfix399_imgHash', fix399hash('v292av2_mia'));
  ok('★fix399の書き戻しで dirty が解除される', api.isDirty() === false);

  ls.setItem('v292av2_mia', D1);
  ok('★同じ中身を書き直しても dirty にならない', api.isDirty() === false, api.status());

  ls.setItem('v292av2_mia', D2);
  ok('★中身が変われば dirty になる(=原因Aの修復)', api.isDirty() === true);
  ok('台帳が新しい中身ハッシュへ更新される', api.ledger()['mia'] === api.hashFull(D2));
}
{
  const { api, ls } = load632();
  ls.setItem('v292av2_a', 'data:image/png;base64,A');
  const first = ls.getItem('v292Dfix399_imgHash');
  ls.setItem('v292av2_b', 'data:image/png;base64,B');
  ok('既に dirty なら印を上書きしない(理由と時刻を保つ)', ls.getItem('v292Dfix399_imgHash') === first);
}

console.log('--- 4. 画像以外の書込には一切干渉しない ---');
{
  const { api, ls } = load632();
  ls.setItem('chr6', '{"turns":[]}');
  ls.setItem('v292av2_notimg', 'https://example/x.png');   // data:image でない
  ok('通常キーで dirty にしない', api.isDirty() === false);
  ok('通常キーはそのまま保存される', ls.getItem('chr6') === '{"turns":[]}');
  ok('data:image でない値は台帳に載らない', Object.keys(api.ledger()).length === 0, api.ledger());
  ok('値はちゃんと書かれている', ls.getItem('v292av2_notimg') === 'https://example/x.png');
}

console.log('--- 5. OFF(v292Dfix632Off=1)で素通し ---');
{
  const { api, ls, mem } = load632({ ls: { 'v292Dfix632Off': '1' } });
  ok('OFFなら on()=false', api.on() === false);
  ls.setItem('v292av2_mia', 'data:image/png;base64,ZZZZ');
  ok('★OFFでも書込は通る(壊さない)', mem['v292av2_mia'] === 'data:image/png;base64,ZZZZ');
  ok('OFFなら dirty 化しない', ls.getItem('v292Dfix399_imgHash') === null);
  ok('OFFなら台帳も書かない', ls.getItem('v292Dfix632_ih') === null);
  ok('OFFなら reconcile も何もしない', api.reconcile().skipped === 'off');
}

console.log('--- 6. reconcile: setItem を経ない変化(IDB直書き)を拾う / 初回シードは一度だけ ---');
{
  /* 台帳が既にあり、実物が別物 = fix399 の applySave が IDB を直接書いた後の状態 */
  const mem = { 'v292av2_x': 'data:image/png;base64,NEW' };
  const inv = { keys: () => ['x'], note(){}, refresh(cb){ if (cb) cb(); } };
  const { api, ls } = load632({
    ls: { 'v292Dfix632_ih': JSON.stringify({ x: '30:oldhash' }), 'v292Dfix632_seeded': '1' },
    mem, inv
  });
  const r = api.reconcile();
  ok('変化を検出する', r.changed === 1, r);
  ok('★dirty 化する', api.isDirty() === true);
  ok('台帳が実物へ追いつく', api.ledger()['x'] === api.hashFull('data:image/png;base64,NEW'));
}
{
  /* 初回シード: 台帳が無い端末では1回だけ dirty 化して既存の乖離を解消する */
  const mem = { 'v292av2_x': 'data:image/png;base64,X' };
  const inv = { keys: () => ['x'], note(){}, refresh(cb){ if (cb) cb(); } };
  const { api, ls } = load632({ mem, inv });
  const r1 = api.reconcile();
  ok('★初回は seeded=false で dirty 化する', r1.seeded === false && r1.dirtied === true, r1);
  ok('seededフラグが立つ', ls.getItem('v292Dfix632_seeded') === '1');
  ls.setItem('v292Dfix399_imgHash', fix399hash('v292av2_x'));   // full送信成功を模す
  const r2 = api.reconcile();
  ok('★2回目はシードで dirty 化しない(一度きり)', r2.seeded === true && r2.dirtied === false, r2);
  ok('dirty のままにならない', api.isDirty() === false);
}
{
  /* 台帳から勝手に消さない（削除処理を作らない・制約6） */
  const inv = { keys: () => ['a'], note(){}, refresh(cb){ if (cb) cb(); } };
  const { api } = load632({
    ls: { 'v292Dfix632_ih': JSON.stringify({ a: '1:x', gone: '2:y' }), 'v292Dfix632_seeded': '1' },
    mem: { 'v292av2_a': 'data:image/png;base64,A' }, inv
  });
  api.reconcile();
  ok('★在庫から消えたキーも台帳に残す', api.ledger()['gone'] === '2:y', api.ledger());
}

console.log('--- 7. ★fix517 の挙動を壊していない（ローカル優先・fail-open） ---');
{
  const ls = mkLS({});
  const mem = Object.create(null);
  installFix346Like(ls, mem);
  const W = { localStorage: ls, document: mkDoc() };
  W.__v292Dfix400 = { urlFor: (pk) => 'https://proxy/img?ns=NS&k=v292av2_' + pk };
  const ctx = mkCtx(W, ls);
  vm.runInContext(SRC517, ctx, { filename: 'v292Dfix517-local-authoritative-avatar.js' });
  vm.runInContext(SRC632, ctx, { filename: 'v292Dfix632-img-content-dirty.js' });   // ★実際の読み込み順(632が後)
  const f517 = W.__v292Dfix517, f400 = W.__v292Dfix400;

  ok('fix517 が armed', !!f517 && f517.__armed === true);
  ok('fix517 が既定ON', f517.on() === true);
  ok('urlFor がラップされている', f517.wrapped() === true);
  ok('★ローカル無 → 元のサーバーURLを返す(fail-open)', f400.urlFor('nobody') === 'https://proxy/img?ns=NS&k=v292av2_nobody');

  ls.setItem('v292av2_mia', 'data:image/png;base64,MIA');    // ★fix632のラッパを通して書く
  ok('★fix632経由で書いても fix517 がローカルを認識する', f517.hasLocal('mia') === true);
  ok('★ローカル有 → "" を返す(サーバURL抑止)', f400.urlFor('mia') === '');
  ok('PREFIX付きpkでも同じ', f400.urlFor('v292av2_mia') === '');
  ok('同時に fix632 が dirty 化している', W.__v292Dfix632.isDirty() === true);

  ls.removeItem('v292av2_mia');
  ok('★ローカルが消えたら元URLへ戻る(壊れ画像を出さない)', f400.urlFor('mia') === 'https://proxy/img?ns=NS&k=v292av2_mia');
}
{
  /* fix517 OFF で従来どおりサーバー優先 */
  const ls = mkLS({ 'v292Dfix517Off': '1' });
  const mem = Object.create(null);
  installFix346Like(ls, mem);
  const W = { localStorage: ls, document: mkDoc() };
  W.__v292Dfix400 = { urlFor: (pk) => 'SRV:' + pk };
  const ctx = mkCtx(W, ls);
  vm.runInContext(SRC517, ctx, { filename: 'v292Dfix517-local-authoritative-avatar.js' });
  vm.runInContext(SRC632, ctx, { filename: 'v292Dfix632-img-content-dirty.js' });
  ls.setItem('v292av2_mia', 'data:image/png;base64,MIA');
  ok('fix517 OFF ならローカル有でもサーバーURL', W.__v292Dfix400.urlFor('mia') === 'SRV:mia');
}

console.log('--- 8. ★fix516 の挙動を壊していない（opt-in・凍結pk限定） ---');
{
  /* 既定は opt-in なので armed しない */
  const ls = mkLS({});
  const W = { localStorage: ls, document: mkDoc() };
  W.__v292Dfix400 = { urlFor: (pk) => 'SRV:' + pk };
  const ctx = mkCtx(W, ls);
  vm.runInContext(SRC516, ctx, { filename: 'v292Dfix516-regen-local-display.js' });
  ok('★既定(v292Dfix516OnV1未設定)では armed しない', !W.__v292Dfix516);
  ok('urlFor は素のまま', W.__v292Dfix400.urlFor('mia') === 'SRV:mia');
}
{
  const cache = { 'ミア': 'data:image/png;base64,MIA' };
  const ls = mkLS({
    'v292Dfix516OnV1': '1',
    'v292Dfix516pks': JSON.stringify([{ pk: 'pk_ミア', name: 'ミア' }])
  });
  const mem = Object.create(null);
  installFix346Like(ls, mem);
  const W = { localStorage: ls, document: mkDoc() };
  W.__v292Dfix400 = { urlFor: (pk) => 'SRV:' + pk };
  W.__v292Dfix197 = { cachedFor: (n) => cache[n] || '', keyFor: (n) => 'pk_' + n };
  const ctx = mkCtx(W, ls);
  vm.runInContext(SRC516, ctx, { filename: 'v292Dfix516-regen-local-display.js' });
  vm.runInContext(SRC632, ctx, { filename: 'v292Dfix632-img-content-dirty.js' });
  const f516 = W.__v292Dfix516;
  ok('opt-in なら armed', !!f516 && f516.__armed === true);
  ok('★凍結pk一致 かつ ローカル有 → ""', W.__v292Dfix400.urlFor('pk_ミア') === '');
  ok('★凍結されていないpkは素通し', W.__v292Dfix400.urlFor('pk_だれか') === 'SRV:pk_だれか');
  delete cache['ミア'];
  ok('★凍結pkでもローカル無なら元URL(重大2対策・fail-open)', W.__v292Dfix400.urlFor('pk_ミア') === 'SRV:pk_ミア');
  ok('markedPks は凍結pkのみ', JSON.stringify(Object.keys(f516.markedPks()).sort()) === JSON.stringify(['pk_ミア', 'v292av2_pk_ミア']));
}

console.log('--- 9. ★fix517 と fix516 の二重ラップが共存する（index.html の実順序） ---');
{
  const cache = { 'ミア': 'data:image/png;base64,MIA' };
  const ls = mkLS({ 'v292Dfix516OnV1': '1', 'v292Dfix516pks': JSON.stringify([{ pk: 'pk_ミア', name: 'ミア' }]) });
  const mem = Object.create(null);
  installFix346Like(ls, mem);
  const W = { localStorage: ls, document: mkDoc() };
  W.__v292Dfix400 = { urlFor: (pk) => 'SRV:' + pk };
  W.__v292Dfix197 = { cachedFor: (n) => cache[n] || '', keyFor: (n) => 'pk_' + n };
  const ctx = mkCtx(W, ls);
  vm.runInContext(SRC516, ctx, { filename: '516' });     // index.html:3025
  vm.runInContext(SRC517, ctx, { filename: '517' });     // index.html:3026
  vm.runInContext(SRC632, ctx, { filename: '632' });     // index.html 末尾
  ls.setItem('v292av2_pk_ミア', 'data:image/png;base64,MIA');
  ok('両方ラップされても "" を返す', W.__v292Dfix400.urlFor('pk_ミア') === '');
  ok('無関係のpkは元URLのまま', W.__v292Dfix400.urlFor('pk_他人') === 'SRV:pk_他人');
  ok('fix632 の台帳も正しく更新される', W.__v292Dfix632.ledger()['pk_ミア'] === W.__v292Dfix632.hashFull('data:image/png;base64,MIA'));
}

console.log('--- 10. ハッシュ契約が fix523 / Worker と同一 ---');
{
  const { api } = load632();
  /* Worker: hash = String(data.length) + ':' + smallHash(data) / smallHash = djb2(5381) base36 */
  function workerSmallHash(s){ let h = 5381; s = String(s || ''); for (let i = 0; i < s.length; i++){ h = ((h << 5) + h + s.charCodeAt(i)) | 0; } return (h >>> 0).toString(36); }
  const d = 'data:image/png;base64,ABCDEF';
  ok('★smallHash が Worker と同一', api.smallHash(d) === workerSmallHash(d));
  ok('★hashFull が Worker d1PutImg と同一', api.hashFull(d) === String(d.length) + ':' + workerSmallHash(d));
  ok('空文字でも落ちない', typeof api.hashFull('') === 'string');
}

console.log('--- 11. 冪等ガードと堅牢性 ---');
{
  const { W, ls, api } = load632();
  const before = W.__v292Dfix632;
  const setBefore = ls.setItem;
  const ctx2 = mkCtx(W, ls);
  vm.runInContext(SRC632, ctx2, { filename: '632-again' });
  ok('2回読んでも差し替わらない', W.__v292Dfix632 === before);
  ok('setItem を二重ラップしない', ls.setItem === setBefore);
}
{
  const { api, ls } = load632({ ls: { 'v292Dfix632_ih': '{{{broken' } });
  ok('壊れた台帳でも {} として扱う', JSON.stringify(api.ledger()) === '{}');
  ok('壊れた台帳でも書込で落ちない', (() => { try { ls.setItem('v292av2_a', 'data:image/png;base64,A'); return true; } catch(e){ return false; } })());
}
{
  const { api } = load632({ inv: { keys: () => [], note(){}, refresh(cb){ if (cb) cb(); } } });
  ok('在庫0件なら reconcile は何もしない', api.reconcile().skipped === 'empty-inventory');
}

console.log('');
console.log('pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);

})();
