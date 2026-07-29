/* 回帰テスト: v292Dfix632 — 画像の中身の変化を**検出して記録する**（2026-07-29 診断専用へ格下げ）
 *                + ★fix517 / fix516 の挙動を壊していないことの固定（制約3）
 *
 * ■このテストが固定する「約束」（★は fix638 と同時の格下げで新しくなった契約）
 *   ①中身が変わったときだけ検知する（同じ絵を書き直しても検知しない）
 *   ②★fix632 は v292Dfix399_imgHash へ**二度と書かない**（同期の判断を汚さない）
 *     → 「取り込みが起きただけで dirty が消える＝送っていないのに成功扱い」を構造的に潰す
 *   ③★検知結果は自前キー v292Dfix632_diag にだけ残る（診断専用）
 *   ④書込は必ず本来の連鎖（fix523→fix346）へ通す。画像を生localStorageへ増やさない
 *   ⑤OFF（v292Dfix632Off='1'）で素通し＝fix630 時点の挙動へ戻る
 *   ⑥setItem を経ないIDB直書きも起動時 reconcile が拾う。★初回シードの full 送信は廃止
 *   ⑦★旧版が書いた 'dirty632:' は起動時に実在庫hash（fix399と同じ式）へ戻す。
 *     読めないときは触らない（勝手な値で full 送信を誘発しない）
 *   ⑧★fix517: ローカル実画像あり→urlForは''／なし→元URL（fail-open）。fix632を噛ませても同じ
 *   ⑨★fix516: opt-in のときだけ armed。凍結pk一致かつローカル有のときだけ ''
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

/* ★IndexedDB の最小モック（後始末 clearLegacyMarker 用）。
   openKeyCursor だけを模す。mode:'fail' で open が失敗する端末を再現する。 */
function mkIDB(keys, mode){
  return {
    open(){
      const req = {};
      Promise.resolve().then(() => {
        if (mode === 'fail'){ if (req.onerror) req.onerror(); return; }
        const db = {
          objectStoreNames: { contains: () => true },
          close(){},
          transaction(){
            return { objectStore(){
              return { openKeyCursor(){
                const cur = {};
                Promise.resolve().then(() => {
                  if (mode === 'cursor-fail'){ if (cur.onerror) cur.onerror(); return; }
                  let i = 0;
                  const step = () => {
                    if (i < keys.length){
                      const k = keys[i++];
                      if (cur.onsuccess) cur.onsuccess({ target: { result: { key: k, continue: () => Promise.resolve().then(step) } } });
                    } else if (cur.onsuccess) cur.onsuccess({ target: { result: null } });
                  };
                  step();
                });
                return cur;
              } };
            } };
          }
        };
        req.result = db;
        if (req.onsuccess) req.onsuccess({ target: { result: db } });
      });
      return req;
    }
  };
}

function load632(opts){
  opts = opts || {};
  const ls = mkLS(opts.ls || {});
  const mem = Object.assign(Object.create(null), opts.mem || {});
  installFix346Like(ls, mem);
  const W = { localStorage: ls, document: mkDoc() };
  if (opts.inv) W.__v292av = opts.inv;
  if (opts.idb) W.indexedDB = opts.idb;
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

console.log('--- 2. ★sentinel は fix399 の hash() と絶対に衝突しない（後始末の判定に使う） ---');
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

console.log('--- 3. ★中身が変わったときだけ検知する / ★imgHash へは二度と書かない ---');
{
  const { api, ls, mem } = load632();
  const D1 = 'data:image/png;base64,AAAA', D2 = 'data:image/png;base64,BBBB';
  ok('初期は検知0件', api.diag().n === 0, api.diag());
  ls.setItem('v292av2_mia', D1);
  ok('新規書込を検知する', api.diag().n === 1, api.diag());
  ok('★★v292Dfix399_imgHash へは書かない(同期の判断を汚さない)', ls.getItem('v292Dfix399_imgHash') === null);
  ok('★isDirty() は常に false（同期を汚す dirty は存在しない）', api.isDirty() === false);
  ok('★診断キーにだけ残る', ls.getItem('v292Dfix632_diag') !== null);
  ok('★画像は生localStorageへ入らない(fix346連鎖へ通っている)', ls.__store['v292av2_mia'] === undefined);
  ok('memへ届いている', mem['v292av2_mia'] === D1);
  ok('台帳に中身ハッシュが載る', api.ledger()['mia'] === api.hashFull(D1), api.ledger());

  ls.setItem('v292av2_mia', D1);
  ok('★同じ中身を書き直しても検知しない', api.diag().n === 1, api.diag());

  ls.setItem('v292av2_mia', D2);
  ok('★中身が変われば検知する(=原因Aの観測は維持)', api.diag().n === 2, api.diag());
  ok('台帳が新しい中身ハッシュへ更新される', api.ledger()['mia'] === api.hashFull(D2));
  ok('★何度書いても imgHash は無傷', ls.getItem('v292Dfix399_imgHash') === null);
  ok('検知の理由が残る', /content-changed/.test(String(api.diag().last && api.diag().last.why)), api.diag());
}
{
  const { api, ls } = load632();
  for (let i = 0; i < 20; i++) ls.setItem('v292av2_k' + i, 'data:image/png;base64,' + i);
  ok('★診断は上限つきで溜め込まない', api.diag().recent.length <= 8, api.diag().recent.length);
  ok('総数は数え続ける', api.diag().n === 20, api.diag().n);
  ok('★大量に書いても imgHash は無傷', ls.getItem('v292Dfix399_imgHash') === null);
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
  ok('OFFなら imgHash を触らない', ls.getItem('v292Dfix399_imgHash') === null);
  ok('OFFなら診断も書かない', ls.getItem('v292Dfix632_diag') === null);
  ok('OFFなら台帳も書かない', ls.getItem('v292Dfix632_ih') === null);
  ok('OFFなら reconcile も何もしない', api.reconcile().skipped === 'off');
}

console.log('--- 6. reconcile: setItem を経ない変化(IDB直書き)を拾う / ★初回シードのfull送信は廃止 ---');
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
  ok('★検知として記録する', r.dirtied === true && api.diag().n === 1, api.diag());
  ok('★★それでも imgHash は触らない', ls.getItem('v292Dfix399_imgHash') === null);
  ok('台帳が実物へ追いつく', api.ledger()['x'] === api.hashFull('data:image/png;base64,NEW'));
}
{
  /* ★初回シード: 以前は「1回だけ 5MB の full 送信を誘発」していた。正本が per-key になったので廃止 */
  const mem = { 'v292av2_x': 'data:image/png;base64,X' };
  const inv = { keys: () => ['x'], note(){}, refresh(cb){ if (cb) cb(); } };
  const { api, ls } = load632({ mem, inv });
  const r1 = api.reconcile();
  ok('★初回でも dirty 化しない(5MB full 送信を誘発しない)', r1.seeded === false && r1.dirtied === false, r1);
  ok('★初回でも imgHash を触らない', ls.getItem('v292Dfix399_imgHash') === null);
  ok('seededフラグは互換のため立つ', ls.getItem('v292Dfix632_seeded') === '1');
  const r2 = api.reconcile();
  ok('2回目も何も起こさない', r2.seeded === true && r2.dirtied === false, r2);
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
  ok('同時に fix632 が変化を検知している', W.__v292Dfix632.diag().n === 1, W.__v292Dfix632.diag());
  ok('★それでも imgHash は無傷（fix517経路でも汚さない）', ls.getItem('v292Dfix399_imgHash') === null);

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

console.log('--- 9b. ★後始末: 旧版が書いた dirty632: を実在庫hashへ戻す ---');
{
  const idbKeys = ['v292av2_b', 'v292av2_a'];       // 順不同で渡す（sort されることを確かめる）
  const { api, ls } = load632({
    ls: { 'v292Dfix399_imgHash': 'dirty632:1753800000000' },
    idb: mkIDB(idbKeys)
  });
  ok('旧印を検出できる', api.legacyMarkerPresent() === true);
  await new Promise(res => api.clearLegacyMarker(res));
  const expect = fix399hash(['v292av2_a', 'v292av2_b'].join('|'));
  ok('★実在庫hash（fix399と同じ式）へ戻る', ls.getItem('v292Dfix399_imgHash') === expect, ls.getItem('v292Dfix399_imgHash'));
  ok('★戻した値は10進数字列＝次のpushで full を誘発しない', /^\d+$/.test(ls.getItem('v292Dfix399_imgHash')));
  ok('旧印は消えている', api.legacyMarkerPresent() === false);
  ok('公開しているhash式が fix399 と一致', api.fix399Hash('v292av2_a|v292av2_b') === expect);
}
{
  /* IDB が読めない端末では触らない（適当な値を書いて full 送信を誘発しない） */
  const { api, ls } = load632({
    ls: { 'v292Dfix399_imgHash': 'dirty632:1' }, idb: mkIDB([], 'fail')
  });
  const r = await new Promise(res => api.clearLegacyMarker(res));
  ok('★IDBを読めないときは書き換えない', ls.getItem('v292Dfix399_imgHash') === 'dirty632:1', r);
  ok('理由が残る', r.acted === false && r.why === 'idb-unreadable', r);
}
{
  /* 印が無い端末では1バイトも書かない */
  const { api, ls } = load632({ ls: { 'v292Dfix399_imgHash': '12345' }, idb: mkIDB(['v292av2_a']) });
  const r = await new Promise(res => api.clearLegacyMarker(res));
  ok('★印が無ければ何もしない', ls.getItem('v292Dfix399_imgHash') === '12345' && r.acted === false, r);
}
{
  /* OFF なら後始末もしない（緊急停止で完全に旧挙動へ戻す） */
  const { api, ls } = load632({
    ls: { 'v292Dfix632Off': '1', 'v292Dfix399_imgHash': 'dirty632:1' }, idb: mkIDB(['v292av2_a'])
  });
  await new Promise(res => api.clearLegacyMarker(res));
  ok('OFFなら旧印にも触らない', ls.getItem('v292Dfix399_imgHash') === 'dirty632:1');
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
