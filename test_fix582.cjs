/* 回帰テスト: v292Dfix582 — fix399 の push をサーバの競合検査(CAS)へ参加させる
 *
 * ★直した中身
 *   Worker(v23b:1501) は `hasBase = body.baseRev !== undefined && !== null` で分岐し、
 *   hasBase が false なら **fork判定を一切しない**（無条件上書きの経路へ進む）。
 *   fix399 は baseRev を送っていなかったため、サーバから見ると
 *   「別端末が何を書いていようが上書きする」要求だった。
 *
 * ★GPT指定の受け入れ条件（このファイルで固定するもの）
 *   ・fix399由来putの baseRev 欠落 0
 *   ・両経路が同じ Coordinator rev を使用
 *   ・serverTs/baseTs が書込み認可に使われない
 *   ・push前に remote meta+rev を取得
 *   ・fork後の再試行は最大1回
 *   ・2回目forkで dirty が残る
 *   ・成功応答の rev **だけ**を正本へ昇格
 *   ・fork応答の rev を成功revとして保存しない
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const SRC399 = read('v292Dfix399-cloudsync.js');
const SRC580 = read('v292Dfix580-meta-sync-coordinator.js');

/* サーバの挙動を模す。baseRev が現行と違えば fork（両方保持・上書きしない）。 */
function mkServer(startRev){
  const st = { rev: startRev == null ? 5 : startRev, puts: [], forks: 0, overwrites: 0 };
  return {
    state: st,
    handle(body){
      const o = JSON.parse(body);
      if (o.op === 'meta') return { ok: true, meta: { updatedAt: 1785000000000, rev: st.rev, size: 5000 }, rev: st.rev };
      if (o.op === 'get')  return { ok: true, data: null, rev: st.rev };
      if (o.op !== 'put')  return { ok: true };
      const hasBase = (o.baseRev !== undefined && o.baseRev !== null);
      st.puts.push({ hasBase, baseRev: hasBase ? +o.baseRev : null });
      if (!hasBase){ st.overwrites++; st.rev++; return { ok: true, rev: st.rev, lsSize: 1 }; }
      if (+o.baseRev !== st.rev){ st.forks++; return { ok: true, fork: true, rev: +o.baseRev, server: { rev: st.rev } }; }
      st.rev++;
      return { ok: true, rev: st.rev, lsSize: 1 };
    }
  };
}

function mkEnv(opts){
  opts = opts || {};
  const server = opts.server || mkServer();
  const store = Object.assign({
    'chr6': JSON.stringify({ turns: [{}, {}, {}] }),
    'chr6_active_slot': JSON.stringify('chr6'),   /* 本体に3ターンあるので空ガードに掛からない */
    'v292ProxyPass': 'testpass'
  }, opts.seed || {});
  const ls = {
    getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    key: i => { const a = Object.keys(store); return i < a.length ? a[i] : null; },
    get length(){ return Object.keys(store).length; }
  };
  const el = { querySelectorAll: () => [], querySelector: () => null, addEventListener(){}, appendChild(){},
               setAttribute(){}, style: {}, remove(){}, classList:{add(){},remove(){},contains:()=>false} };
  const doc = { hidden:false, visibilityState:'visible', readyState:'complete', documentElement: el, body: el,
    querySelectorAll: () => [], querySelector: () => null, getElementById: () => null, addEventListener(){},
    createElement: () => ({ style:{}, setAttribute(){}, addEventListener(){}, appendChild(){}, remove(){}, classList:{add(){},remove(){}} }) };
  const w = { localStorage: ls, document: doc, console: { log(){}, warn(){}, error(){} },
    setTimeout: (f) => { if (typeof f === 'function') f(); return 0; }, setInterval: () => 0,
    clearTimeout(){}, clearInterval(){},
    navigator: { userAgent: 'node' }, location: { href: 'https://x/', search: '', origin: 'https://x' },
    addEventListener(){}, removeEventListener(){}, JSON, Date, Error, Promise,
    /* bootPull の確認ダイアログ。テストでは常に「取り込まない」を選ぶ */
    confirm: () => false, alert(){}, prompt: () => null,
    /* ★IndexedDB の最小モック。画像0件で必ず解決する。
       解決しないモックにすると push が永久に待って**テストが無言で止まる**（実際に踏んだ）。 */
    indexedDB: { open(){
      const req = {};
      Promise.resolve().then(() => {
        const db = {
          close(){},
          transaction: () => ({ objectStore: () => ({
            openKeyCursor(){ const c = {}; Promise.resolve().then(() => c.onsuccess && c.onsuccess({ target: { result: null } })); return c; },
            openCursor(){ const c = {}; Promise.resolve().then(() => c.onsuccess && c.onsuccess({ target: { result: null } })); return c; }
          }) })
        };
        if (req.onsuccess) req.onsuccess({ target: { result: db } });
      });
      return req;
    } },
    fetch: function(url, init){
      const resp = server.handle(init.body);
      return Promise.resolve({ status: 200, json: () => Promise.resolve(resp),
                               clone: () => ({ json: () => Promise.resolve(resp) }) });
    }
  };
  w.window = w; w.__store = store; w.__server = server;
  const ctx = vm.createContext(w);
  vm.runInContext(SRC580, ctx, { filename: 'v292Dfix580-meta-sync-coordinator.js' });
  vm.runInContext(SRC399, ctx, { filename: 'v292Dfix399-cloudsync.js' });
  return w;
}

console.log('\n== (1) ソース: baseRev を送っている / 時刻を認可に使わない ==');
{
  const i = SRC399.indexOf('function push(force)');
  const body = SRC399.slice(i, SRC399.indexOf('// ---- pull(取得のみ', i));
  ok('★★baseRev を body に載せている', /body\.baseRev = c\.rev\(\)/.test(body), body.slice(0, 200));
  ok('★★時刻比較は Coordinator が無いときだけ（認可に使わない）',
     /if \(!c && serverTs > baseTs\(\) && !force\)/.test(body));
  ok('★push前に meta を取得している', /getMeta\(\)\.then/.test(body));
  /* ★fix585(GPT裁定): 「共有revの変化だけで自端末競合と判断する再試行も安全ではない」。
     revが動いた理由が本当に自端末の別経路かは rev の変化だけでは区別できない
     （別端末のpush成功をこちらのpull/metaが拾って進めた場合も同じ見え方になる）。
     現段階では**forkはすべて fail-closed**。 */
  ok('★★再試行のコードが残っていない（全forkがfail-closed）',
     !/attempt\(true\)/.test(body) && !/isRetry/.test(body) && !/sameDeviceRace/.test(body));
  ok('★fork時は必ず fail-closed を記録する', /noteFailClosed\('fork。/.test(body));
  ok('★fork時に dirty(localTs) を残す', /ef\.fork = true/.test(body) && /v292Dfix399_localTs/.test(body));
  ok('★★サーバのrevを baseRev として勝手に採用していない',
     !/promoteRev\(meta\.rev/.test(body) && !/promoteRev\(m2\.rev/.test(body), 'push直前の採用は無条件上書きと同義');
  ok('★緊急停止スイッチがある', SRC399.indexOf('v292Dfix582Off') > 0);
  ok('★baseTs は診断値へ降格したと明示している', SRC399.indexOf('baseTs_diagnosticOnly') > 0);
}

console.log('\n== (2) ★正常系: baseRev を付けて push し、成功revを昇格する ==');
{
  const w = mkEnv({ server: mkServer(5), seed: { 'v292Dfix402_baseRev': '5' } });
  const c = w.__v292Dfix580;
  ok('★fix402 の rev を引き継いでいる（いきなり0でforkまみれにしない）', c.rev() === 5, c.rev());
  return w.__v292Dfix399x.push().then(res => {
    const st = w.__server.state;
    ok('★★put に baseRev が付いている', st.puts.length === 1 && st.puts[0].hasBase === true, st.puts);
    ok('★★baseRev の値が共有revと一致', st.puts[0].baseRev === 5, st.puts);
    ok('★★無条件上書きが0件', st.overwrites === 0, st);
    ok('★成功rev(6)を正本へ昇格した', c.rev() === 6, c.rev());
    ok('push が成功を返す', res && res.rev === 6, res);
    return step3();
  });
}

function step3(){
  console.log('\n== (3) ★★別端末との分岐は再試行せず fail-closed ==');
  /* ★実装中に踏んだ設計バグの回帰テスト。
     最初の実装は「push直前にサーバの現在revを自分の基準として採用」していた。
     それだと**必ず一致して fork が起きず**、無条件上書きと同じ意味になっていた。
     baseRev は「自分のローカル状態が derive された版」でなければならない。 */
  const w = mkEnv({ server: mkServer(5), seed: { 'v292Dfix402_baseRev': '3' } });
  const c = w.__v292Dfix580;
  return w.__v292Dfix399x.push().then(
    () => { ok('★★別端末と分岐しているのに成功してはいけない', false, '成功してしまった'); return step4(); },
    err => {
      const st = w.__server.state;
      ok('★★自分の基準(3)のまま押している（サーバのrevを勝手に採用しない）',
         st.puts[0].baseRev === 3, st.puts);
      ok('★fork が起きた（＝競合検査が効いている）', st.forks === 1, st);
      ok('★★再試行していない（別端末の版を確認せず塗り替えない）', st.puts.length === 1, st.puts);
      ok('★エラーになる（fail-closed）', !!err && err.conflict === true && err.fork === true, String(err && err.message));
      ok('★サーバのrevを伝える（解決に使える）', err.serverRev === 5, err.serverRev);
      ok('★★上書きは0件', st.overwrites === 0, st);
      ok('★基準は3のまま（forkのrevを昇格していない）', c.rev() === 3, c.rev());
      ok('★dirty が残る', +w.__store['v292Dfix399_localTs'] > 0, w.__store['v292Dfix399_localTs']);
      ok('fail-closed を数えている', c.stats().failClosed === 1, c.stats());
      return step3b();
    });
}

function step3b(){
  console.log('\n== (3b) ★★同端末で共有revが動いていても、forkなら fail-closed（fix585） ==');
  /* 以前は「共有revが動いていたら自端末の同時発火とみなして1回押し直す」実装だった。
     GPT裁定「revの変化だけで自端末競合と判断する再試行も安全ではない」に従い、一律 fail-closed へ。 */
  const server = mkServer(5);
  const w = mkEnv({ server, seed: { 'v292Dfix402_baseRev': '5' } });
  const c = w.__v292Dfix580;
  const origHandle = server.handle.bind(server);
  let bumped = false;
  server.handle = function(body){
    const o = JSON.parse(body);
    if (o.op === 'put' && !bumped){
      bumped = true;
      server.state.rev = 7;
      c.promoteRev(7, 'テスト: 別経路のpush成功に見える出来事');
      return origHandle(body);
    }
    return origHandle(body);
  };
  return w.__v292Dfix399x.push().then(
    () => { ok('★★共有revが動いていても、forkなら成功させない', false, '成功してしまった'); return step4(); },
    err => {
      const st = server.state;
      ok('★★fail-closed になる', !!err && err.conflict === true && err.fork === true, String(err && err.message));
      ok('★★押し直していない（put は1回だけ）', st.puts.length === 1, st.puts);
      ok('★上書きは0件', st.overwrites === 0, st);
      ok('★dirty が残る', +w.__store['v292Dfix399_localTs'] > 0, w.__store['v292Dfix399_localTs']);
      ok('fail-closed を数えている', c.stats().failClosed === 1, c.stats());
      return step4();
    });
}

function step4(){
  console.log('\n== (4) ★★revが動き続けても押し直さない ==');
  /* 毎回 rev が進み続ける状況。無限に押し直さないことを確かめる。 */
  const server = mkServer(5);
  const w = mkEnv({ server, seed: { 'v292Dfix402_baseRev': '5' } });
  const c = w.__v292Dfix580;
  const origHandle = server.handle.bind(server);
  server.handle = function(body){
    const o = JSON.parse(body);
    if (o.op === 'put'){ server.state.rev++; c.promoteRev(server.state.rev, 'テスト: 毎回進む'); }
    return origHandle(body);
  };
  return w.__v292Dfix399x.push().then(
    () => { ok('★★押し続けて成功してはいけない', false, 'pushが成功してしまった'); return step5(); },
    err => {
      const st = server.state;
      ok('★★エラーになる（fail-closed）', !!err && err.conflict === true, String(err && err.message));
      ok('★★put は1回だけ（押し直さない）', st.puts.length === 1, st.puts);
      ok('★★dirty が残る（未同期だと分かる）', +w.__store['v292Dfix399_localTs'] > 0, w.__store['v292Dfix399_localTs']);
      ok('★fail-closed を数えている', c.stats().failClosed === 1, c.stats());
      ok('★★データは上書きされていない', st.overwrites === 0, st);
      return step5();
    });
}

function step5(){
  console.log('\n== (5) ★fork応答のrevを「成功rev」として保存しない ==');
  const w = mkEnv({ server: mkServer(9), seed: { 'v292Dfix402_baseRev': '2' } });
  const c = w.__v292Dfix580;
  return w.__v292Dfix399x.push().then(
    () => { ok('★分岐なので成功しない', false); return step6(); },
    () => {
      ok('★★fork応答のrev(2)を「成功rev」として昇格していない', c.rev() === 2, c.rev());
      ok('★★サーバのrev(9)へ勝手に上げてもいない', c.rev() !== 9, c.rev());
      ok('昇格の履歴に put成功が無い',
         !c.events().some(e => e.kind === 'revPromoted' && /push成功/.test(e.why || '')), c.events());
      return step6();
    });
}

function step6(){
  console.log('\n== (6) revは巻き戻さない ==');
  const w = mkEnv({ seed: { 'v292Dfix402_baseRev': '7' } });
  const c = w.__v292Dfix580;
  ok('前提: rev=7', c.rev() === 7);
  c.promoteRev(3, 'テスト: 古い応答が遅れて届いた');
  ok('★★古いrevで巻き戻らない', c.rev() === 7, c.rev());
  c.promoteRev(11, 'テスト: 新しい応答');
  ok('新しいrevなら上がる', c.rev() === 11, c.rev());
  ok('巻き戻しを記録している', c.events().some(e => e.kind === 'revIgnored'), c.events());

  console.log('\n== (7) 緊急停止すれば旧挙動へ戻る ==');
  {
    const w2 = mkEnv({ server: mkServer(5), seed: { 'v292Dfix582Off': '1', 'v292Dfix402_baseRev': '5' } });
    return w2.__v292Dfix399x.push().then(() => {
      const st = w2.__server.state;
      ok('★baseRev を送らない（旧挙動）', st.puts[0].hasBase === false, st.puts);
      ok('★（旧挙動なので）無条件上書きになる', st.overwrites === 1, st);
      ok('★syncState が casEnabled:false を返す',
         w2.__v292Dfix399x.syncState().casEnabled === false, w2.__v292Dfix399x.syncState());
      return step8();
    });
  }
}

function step8(){
  console.log('\n== (8) syncState が rev を見せる ==');
  const w = mkEnv({ seed: { 'v292Dfix402_baseRev': '4' } });
  const s = w.__v292Dfix399x.syncState();
  ok('★rev を出す', s.rev === 4, s);
  ok('★casEnabled:true', s.casEnabled === true, s);
  ok('★★baseTs は名前で診断値と分かる', 'baseTs_diagnosticOnly' in s && !('baseTs' in s), Object.keys(s));

  console.log('\n---------------------------------------------');
  console.log('PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
}
