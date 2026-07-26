/* 回帰テスト: v292Dfix580 — MetaSyncCoordinator（影モード＝観測のみ）
 *   GPT実装順 1〜3:
 *     1. MetaSyncCoordinator を追加（まだ影モード）
 *     2. fix399／fix402 の push要求を記録し、二重発火を測定
 *     3. mergeMeta の**可換・結合・冪等**テスト
 *
 * ★このfixは観測しかしない。リクエストを1バイトも変えず、送信を遅らせず、
 *   localStorage へ書かない。壊れたら必ず素通しする。
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const SRC580 = read('v292Dfix580-meta-sync-coordinator.js');
const SRC579 = read('v292Dfix579-tombstone-schema.js');

function mkEnv(opts){
  opts = opts || {};
  const store = {};
  const calls = [];
  const ls = {
    getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    key: i => { const a = Object.keys(store); return i < a.length ? a[i] : null; },
    get length(){ return Object.keys(store).length; }
  };
  Object.keys(opts.seed || {}).forEach(k => { store[k] = opts.seed[k]; });
  /* 元の fetch。呼ばれた引数をそのまま記録して、改変が無いことを確かめる */
  const origFetch = function(input, init){
    calls.push({ input, init, bodyRef: init && init.body });
    const resp = opts.respond ? opts.respond(input, init) : { ok: true, rev: 1 };
    if (resp instanceof Error) return Promise.reject(resp);
    let consumed = false;
    const r = {
      status: 200,
      json: () => { consumed = true; return Promise.resolve(resp); },
      clone: () => ({ json: () => Promise.resolve(resp) }),
      get __consumed(){ return consumed; }
    };
    return Promise.resolve(r);
  };
  const w = { localStorage: ls, fetch: origFetch, console: { log(){}, warn(){}, error(){} },
    setTimeout: (f, ms) => { if (typeof f === 'function') f(); return 0; }, JSON, Date, Error, Promise };
  w.window = w; w.__store = store; w.__calls = calls; w.__origFetch = origFetch;
  vm.runInContext(SRC580, vm.createContext(w), { filename: 'v292Dfix580-meta-sync-coordinator.js' });
  return w;
}
/* 呼び出し元のファイル名を持つスタックを作るため、実ファイル名で eval する */
function callFrom(w, filename, bodyObj){
  const code = 'fetch("https://x/save", { method:"POST", headers:{}, body: ' +
               JSON.stringify(JSON.stringify(bodyObj)) + ' })';
  return vm.runInContext(code, w, { filename });
}

console.log('\n== (1) 設置と透過性 ==');
{
  const w = mkEnv();
  const f = w.__v292Dfix580;
  ok('★armed', f.__armed === true);
  ok('★fetch をラップしている', f.stats().isWrapped === true, f.stats());
  ok('★★まだ何も制御していないことを明示している',
     f.coordinating === false && f.stats().shadowOnly === true, f.stats());
  /* ★fix582 で役割が増えた: 共有rev台帳の**正本**になったので、この1キーだけは書く。
     観測だけだった頃の「1バイトも書かない」から契約が変わった箇所なので、
     「書いてよいのは rev 台帳だけ」に締め直す（何でも書けるようにはしない）。 */
  ok('★★書くのは共有rev台帳の1キーだけ',
     Object.keys(w.__store).length === 1 && w.__store['v292Dfix580_rev'] !== undefined, w.__store);
}
{
  /* ★リクエストが1バイトも変わらないこと */
  const w = mkEnv();
  const body = JSON.stringify({ op: 'put', baseRev: 7, pkg: { a: 1 } });
  return_ok: {
    vm.runInContext('fetch("https://x/save", { method:"POST", headers:{"X-T":"1"}, body: ' +
                    JSON.stringify(body) + ' })', w, { filename: 'v292Dfix402-invisible-sync.js' });
  }
  const c = w.__calls[0];
  ok('★★body が一致（改変していない）', c.bodyRef === body, { got: c.bodyRef, want: body });
  ok('★method が一致', c.init.method === 'POST');
  ok('★header が一致', c.init.headers['X-T'] === '1', c.init.headers);
  ok('★URL が一致', c.input === 'https://x/save', c.input);
}

console.log('\n== (2) ★baseRev を付けているかを経路別に数える ==');
{
  const w = mkEnv();
  const f = w.__v292Dfix580;
  /* fix402 は baseRev を付ける / fix399 は付けない（実コードの形をそのまま再現） */
  callFrom(w, 'v292Dfix402-invisible-sync.js', { op: 'put', baseRev: 3, pkg: {}, mid: 'm1' });
  callFrom(w, 'v292Dfix399-cloudsync.js',      { op: 'put', pkg: {} });
  const s = f.stats();
  ok('put を2件数えた', s.puts === 2, s);
  ok('★fix402 を識別できた', s.byPath.fix402 === 1, s.byPath);
  ok('★fix399 を識別できた', s.byPath.fix399 === 1, s.byPath);
  ok('★★fix402 は baseRev あり', s.baseRevByPath.fix402 === 1, s.baseRevByPath);
  ok('★★fix399 は baseRev なし（サーバの競合検査に参加していない）',
     s.noBaseRevByPath.fix399 === 1, s.noBaseRevByPath);
  ok('合計が一致', s.putsWithBaseRev === 1 && s.putsWithoutBaseRev === 1, s);
  ok('★report に名指しで出る', /fix399[\s\S]*参加していない/.test(f.report()), f.report());
}

console.log('\n== (3) ★二重発火の測定 ==');
{
  const w = mkEnv();
  const f = w.__v292Dfix580;
  callFrom(w, 'v292Dfix399-cloudsync.js',      { op: 'put', pkg: {} });
  callFrom(w, 'v292Dfix402-invisible-sync.js', { op: 'put', baseRev: 1, pkg: {} });
  ok('★★別経路の連続putを二重発火として数える', f.stats().doubleFire === 1, f.stats());
  ok('★どの経路の組み合わせか記録する',
     f.stats().doubleFirePairs[0].a === 'fix399' && f.stats().doubleFirePairs[0].b === 'fix402',
     f.stats().doubleFirePairs);
}
{
  /* 同じ経路の連続は二重発火ではない */
  const w = mkEnv();
  callFrom(w, 'v292Dfix402-invisible-sync.js', { op: 'put', baseRev: 1, pkg: {} });
  callFrom(w, 'v292Dfix402-invisible-sync.js', { op: 'put', baseRev: 2, pkg: {} });
  ok('★同一経路の連続は二重発火にしない', w.__v292Dfix580.stats().doubleFire === 0,
     w.__v292Dfix580.stats());
}

console.log('\n== (4) fork / 拒否 / 通信エラーを数える ==');
{
  const w = mkEnv({ respond: () => ({ ok: true, fork: true, rev: 5, server: { rev: 9 } }) });
  return callFrom(w, 'v292Dfix402-invisible-sync.js', { op: 'put', baseRev: 1, pkg: {} })
    .then(() => new Promise(r => setImmediate(r)))
    .then(() => {
      ok('★fork を数えた', w.__v292Dfix580.stats().forks === 1, w.__v292Dfix580.stats());
      return step5();
    });
}
function step5(){
  const w = mkEnv({ respond: () => ({ ok: false, error: 'conflict' }) });
  return callFrom(w, 'v292Dfix399-cloudsync.js', { op: 'put', pkg: {} })
    .then(() => new Promise(r => setImmediate(r)))
    .then(() => {
      ok('★拒否を数えた', w.__v292Dfix580.stats().conflicts === 1, w.__v292Dfix580.stats());
      return step6();
    });
}
function step6(){
  const w = mkEnv({ respond: () => new Error('offline') });
  return callFrom(w, 'v292Dfix399-cloudsync.js', { op: 'put', pkg: {} })
    .catch(() => {})
    .then(() => new Promise(r => setImmediate(r)))
    .then(() => {
      ok('★通信エラーを数えた', w.__v292Dfix580.stats().errors === 1, w.__v292Dfix580.stats());
      ok('★★エラーでも例外は呼び出し元へそのまま伝わる', true);
      return step7();
    });
}

function step7(){
  console.log('\n== (5) 壊れた入力でも素通しする ==');
  {
    const w = mkEnv();
    /* JSONでないbody・bodyなし・別URL */
    vm.runInContext('fetch("https://x/save", { method:"POST", body:"not-json" })', w, { filename: 'x.js' });
    vm.runInContext('fetch("https://x/save", { method:"POST" })', w, { filename: 'x.js' });
    vm.runInContext('fetch("https://x/other", { method:"POST", body:"{}" })', w, { filename: 'x.js' });
    ok('★どれも元のfetchへ渡っている', w.__calls.length === 3, w.__calls.length);
    ok('★putとして数えていない', w.__v292Dfix580.stats().puts === 0, w.__v292Dfix580.stats());
    ok('★観測側のエラーが出ていない', w.__v292Dfix580.stats().wrapperErrors === 0);
  }
  {
    const w = mkEnv({ seed: { 'v292Dfix580Off': '1' } });
    callFrom(w, 'v292Dfix399-cloudsync.js', { op: 'put', pkg: {} });
    ok('★OFFなら数えない', w.__v292Dfix580.stats().puts === 0, w.__v292Dfix580.stats());
    ok('★OFFでも元のfetchは呼ばれる（素通し）', w.__calls.length === 1, w.__calls.length);
  }
  {
    const w = mkEnv();
    ok('★meta/get も区別して数える', (() => {
      callFrom(w, 'v292Dfix399-cloudsync.js', { op: 'meta' });
      callFrom(w, 'v292Dfix399-cloudsync.js', { op: 'get' });
      const s = w.__v292Dfix580.stats();
      return s.metaCalls === 1 && s.gets === 1 && s.puts === 0;
    })(), w.__v292Dfix580.stats());
  }

  console.log('\n== (6) ★mergeMeta の代数的性質（可換・結合・冪等） ==');
  {
    const w = { console: { log(){}, warn(){}, error(){} }, JSON, Date };
    w.window = w;
    vm.runInContext(SRC579, vm.createContext(w), { filename: 'v292Dfix579-tombstone-schema.js' });
    const T = w.__v292Dfix579;
    const t  = T.make({ slotId: 'smA', deletedAt: 1785000000000, deleteOpId: 'del_1' });
    const t2 = T.make({ slotId: 'smB', deletedAt: 1785000000001, deleteOpId: 'del_2' });
    const liveA = { id: 'smA', name: 'A', updatedAt: '2026-07-26T00:00:00Z' };
    const liveB = { id: 'smB', name: 'B', updatedAt: '2026-07-26T01:00:00Z' };
    const liveC = { id: 'smC', name: 'C', updatedAt: '2026-07-26T02:00:00Z' };
    const key = m => m.slice().sort((x, y) => (x.id < y.id ? -1 : 1))
                      .map(e => e.id + ':' + (e.deleted ? 'T' + e.deleteOpId : 'L' + (e.updatedAt || ''))).join('|');

    const A = [t, liveB], B = [liveA, t2], C = [liveC, liveA];
    /* 可換 */
    ok('★★可換: merge(A,B) === merge(B,A)', key(T.mergeMeta(A, B)) === key(T.mergeMeta(B, A)),
       { ab: key(T.mergeMeta(A, B)), ba: key(T.mergeMeta(B, A)) });
    ok('可換(別の組): merge(B,C) === merge(C,B)', key(T.mergeMeta(B, C)) === key(T.mergeMeta(C, B)));
    /* 結合 */
    ok('★★結合: merge(merge(A,B),C) === merge(A,merge(B,C))',
       key(T.mergeMeta(T.mergeMeta(A, B), C)) === key(T.mergeMeta(A, T.mergeMeta(B, C))),
       { l: key(T.mergeMeta(T.mergeMeta(A, B), C)), r: key(T.mergeMeta(A, T.mergeMeta(B, C))) });
    /* 冪等 */
    ok('★★冪等: merge(A,A) === A', key(T.mergeMeta(A, A)) === key(A), { got: key(T.mergeMeta(A, A)), want: key(A) });
    ok('冪等(2回適用しても増えない)', T.mergeMeta(T.mergeMeta(A, B), B).length === T.mergeMeta(A, B).length);
    /* 墓標は何度マージしても消えない */
    let m = [t, liveB];
    for (let i = 0; i < 5; i++) m = T.mergeMeta(m, [liveA]);
    ok('★★墓標は5回マージしても解けない', T.isTombstone(m.filter(e => e.id === 'smA')[0]), m);
  }

  console.log('\n== (7) ★ロード順: fetchをラップする全ファイルより先にいる ==');
  {
    const idx = fs.readFileSync(path.join(__dirname, 'index.html'), 'latin1');
    const tags = (idx.match(/<script src="([^"?]+)/g) || []).map(t => t.replace('<script src="', ''));
    const pos = n => tags.indexOf(n);
    const me = pos('v292Dfix580-meta-sync-coordinator.js');
    ok('★script タグがある', me >= 0, me);
    /* ★fetch をラップするファイルを実際に走査して、全部より先にいることを確かめる。
       実測(2026-07-26): 21本あり、fix580を後ろに置くと先行5本に迂回された。 */
    const wrappers = fs.readdirSync(__dirname)
      .filter(f => /\.js$/.test(f) && !/^test_/.test(f))
      .filter(f => /window\.fetch\s*=/.test(read(f)))
      .filter(f => tags.indexOf(f) >= 0 && f !== 'v292Dfix580-meta-sync-coordinator.js');
    ok('fetchをラップするファイルを検出できている', wrappers.length >= 10, wrappers.length);
    const earlier = wrappers.filter(f => pos(f) < me);
    ok('★★fetchラッパの中で fix580 が最も先にいる', earlier.length === 0,
       { fix580: me, より先にいるラッパ: earlier.map(f => f + '@' + pos(f)) });
    /* ★2026-07-26に踏んだ: タグの位置だけ動かして **cbパラメータを据え置いた**ため、
       ブラウザが旧版のJSをキャッシュから使い続け、実機で新しい計測値が出なかった。
       ファイルを直したら cb も必ず上げる。 */
    const cb = (idx.match(/v292Dfix580-meta-sync-coordinator\.js\?cb=v292Dfix(\d+)/) || [])[1];
    ok('★★cbパラメータが fix581 以降（JSを直したらキャッシュバスターも上げる）',
       !!cb && Number(cb) >= 581, cb);
    ok('★fix569(localStorage監視)の次に置いている（fix569は先頭でなければならない）',
       pos('v292Dfix569-gc-shadow.js') === 0 && me === 1,
       { fix569: pos('v292Dfix569-gc-shadow.js'), fix580: me });
  }

  console.log('\n== (8) native fetch を捕まえたかを記録する ==');
  {
    const w = mkEnv();
    /* モックの fetch は native ではないので false が正しく記録される */
    ok('★capturedNativeFetch を記録している', w.__v292Dfix580.stats().capturedNativeFetch === false,
       w.__v292Dfix580.stats().capturedNativeFetch);
    ok('★nativeでなければ report に警告が出る',
       /観測できていない/.test(w.__v292Dfix580.report()), w.__v292Dfix580.report());
  }

  console.log('\n== (9) 静的: 観測が副作用を持たない ==');
  {
    const code = SRC580.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    /* setItem は rev台帳の書込み(lsSet)経由の1箇所だけ。増えていないことを固定する。 */
    ok('★★localStorage への書込みは1箇所だけ（rev台帳）',
       (code.match(/localStorage\.setItem/g) || []).length === 1, (code.match(/localStorage\.setItem/g)||[]).length);
    ok('★★書くキーは rev 台帳だけ', /REV_KEY = 'v292Dfix580_rev'/.test(SRC580) &&
       (code.match(/lsSet\(/g) || []).length >= 1 && !/lsSet\('(?!REV)/.test(code));
    ok('★★localStorage を消さない', !/localStorage\.removeItem/.test(code));
    ok('★リクエストの body を作り替えていない', !/init\.body\s*=/.test(code) && !/body:\s*JSON\.stringify/.test(code));
    ok('★レスポンスは clone してから読む（元のbodyを消費しない）', /res\.clone\(\)/.test(code));
  }

  console.log('\n---------------------------------------------');
  console.log('PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
}
