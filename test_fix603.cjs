/* 回帰テスト: v292Dfix603 — ①確定した forceput は関門を閉じる ②隔離した証拠の復帰を実際に配線する
 *   対象: v292Dfix590-commit-ledger.js / v292Dfix399-cloudsync.js
 *
 * ================================================================================
 * (a) 確定した forceput は関門(gate)を閉じる
 * --------------------------------------------------------------------------------
 * ■なぜ必要か（2026-07-27 に発見）
 *   関門を閉じるのは「三者一致」と「正式pullの収束」の2箇所だけで、
 *   **ユーザーに提示している選択肢 `make-this-device-canonical`
 *   （＝home の「☁ いま上げる」＝ forceput）を選んでも閉じなかった**。
 *   forceput は成功し pending も消えるので、その後の runReconcile は 'nothing-pending' になり、
 *   三者一致の経路にも入らない。
 *   結果、**関門が開いたまま残り、以後の通常putが永久に resolution-required でブロックされる**
 *   （毎回 forceput を強いられる）。fix599 が塞いだはずのデッドロックと同じ形が、
 *   ユーザーへ出している選択肢の側に残っていた。
 *   ★閉じてよいのは**応答の検証を全部通った(allOk)ときだけ**。ok:true では閉じない。
 *
 * ================================================================================
 * (b) 隔離した pending の復帰が「実際に配線されている」
 * --------------------------------------------------------------------------------
 * ■なぜ必要か
 *   `restoreForeignFor()` は fix599 で作ったのに、**どこからも呼んでいなかった**。
 *   つまり D2 の目的（アカウントを戻したときに応答喪失commitの証拠を取り戻す）は
 *   実装されているのに**一度も達成されなかった**。
 *   これは「作ったが配線していない」型で、fix579 の visible() と同じ失敗。
 *   → ライブラリを足したら、**呼ぶ側を必ず同じ回で書く**。テストも呼ぶ側まで見る。
 *   ★呼ぶ場所は reconcile の**入口**（pendingAtStart を採る前）でなければならない。
 *     あとから戻すと TOCTOU 判定で reconcile-stale になり、戻した証拠がそのまま使われない。
 *     → ソース文字列の正規表現ではなく、**呼び出し順序が観測できる形**で検査する。
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const SRC590 = read('v292Dfix590-commit-ledger.js');
const SRC399 = read('v292Dfix399-cloudsync.js');

/* ---- 台帳(fix590)を本物で動かす環境 ---------------------------------------- */
function mkLedger(seed){
  const store = Object.assign({}, seed || {});
  const w = {
    localStorage: {
      getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
      key: i => Object.keys(store)[i] || null,
      get length(){ return Object.keys(store).length; }
    },
    crypto: require('crypto').webcrypto, TextEncoder, Uint8Array,
    JSON, Date, Math, Promise, Number, Object, String, Array, isFinite,
    setTimeout, console: { log(){}, warn(){}, error(){} }
  };
  w.window = w; w.__store = store;
  vm.runInContext(SRC590, vm.createContext(w), { filename: 'v292Dfix590-commit-ledger.js' });
  return w;
}
const PKG  = { ls: { 'chr6_slot_smA': 'x' }, updatedAt: 1, device: 'PC' };
const PKG2 = { ls: { 'chr6_slot_smA': 'y' }, updatedAt: 2, device: 'PC' };
/* 実機と同じ形の「関門が開いている」状態（fix597 D1-B で開くやつ） */
const GATE_OPEN = JSON.stringify({ reason: 'local-diverged-after-commit',
  conflictState: 'local-diverged-after-commit', remoteRev: 430, identity: null, since: 1785100000000 });
/* Worker v25 以降の正しい成功応答 */
const goodResp = (rev, r) => ({ ok: true, rev: rev, hashAlg: 'sha256-utf8-v1',
                                packageHash: r.payloadHash, lastCommitOpId: r.commitOpId });

/* ---- fix399 を本物で動かす環境（台帳は差し替え可能） ------------------------ */
function mk399(opts){
  opts = opts || {};
  const store = Object.assign({
    'chr6': JSON.stringify({ turns: [{}, {}, {}] }),
    'chr6_active_slot': JSON.stringify('chr6'),
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
               setAttribute(){}, style: {}, remove(){}, classList: { add(){}, remove(){}, contains: () => false } };
  const doc = { hidden: false, visibilityState: 'visible', readyState: 'complete', documentElement: el, body: el,
    querySelectorAll: () => [], querySelector: () => null, getElementById: () => null, addEventListener(){},
    createElement: () => ({ style: {}, setAttribute(){}, addEventListener(){}, appendChild(){}, remove(){},
                            classList: { add(){}, remove(){} } }) };
  const httpOps = [];
  const w = {
    localStorage: ls, document: doc, console: { log(){}, warn(){}, error(){} },
    /* ★遅延実行は走らせない。起動フックが勝手に通信して観測を汚さないようにする。 */
    setTimeout: () => 0, setInterval: () => 0, clearTimeout(){}, clearInterval(){},
    crypto: require('crypto').webcrypto, TextEncoder, Uint8Array,
    JSON, Date, Math, Promise, Number, Object, String, Array, isFinite, Error,
    navigator: { userAgent: 'node' }, location: { href: 'https://x/', search: '', origin: 'https://x' },
    addEventListener(){}, removeEventListener(){},
    confirm: () => false, alert(){}, prompt: () => null,
    /* 画像0件で必ず解決する IndexedDB モック（解決しないと push が無言で止まる） */
    indexedDB: { open(){
      const req = {};
      Promise.resolve().then(() => {
        const db = { close(){}, transaction: () => ({ objectStore: () => ({
          openKeyCursor(){ const c = {}; Promise.resolve().then(() => c.onsuccess && c.onsuccess({ target: { result: null } })); return c; },
          openCursor(){ const c = {}; Promise.resolve().then(() => c.onsuccess && c.onsuccess({ target: { result: null } })); return c; }
        }) }) };
        if (req.onsuccess) req.onsuccess({ target: { result: db } });
      });
      return req;
    } },
    /* capabilities を返さない＝v25未満扱い。照合は 'unsupported' で止まる（通信の中身は今回の関心事ではない） */
    fetch: (url, init) => {
      let body = null; try { body = init && init.body ? JSON.parse(init.body) : null; } catch(e){}
      httpOps.push(body ? String(body.op) : 'GET');
      const resp = { ok: true };
      return Promise.resolve({ status: 200, json: () => Promise.resolve(resp),
                               clone: () => ({ json: () => Promise.resolve(resp) }) });
    }
  };
  w.window = w; w.__store = store; w.__httpOps = httpOps;
  const ctx = vm.createContext(w);
  if (opts.realLedger) vm.runInContext(SRC590, ctx, { filename: 'v292Dfix590-commit-ledger.js' });
  if (opts.ledger) w.__v292Dfix590 = opts.ledger;
  vm.runInContext(SRC399, ctx, { filename: 'v292Dfix399-cloudsync.js' });
  return w;
}

(async () => {

console.log('\n== (a1) 前提: 関門が開いていると通常putは止まり、forceput だけ通る ==');
{
  const L = mkLedger({ 'v292Dfix599_gate': GATE_OPEN }).__v292Dfix590;
  ok('★関門が開いている（具体値で確認）',
     !!L.gateState() && L.gateState().reason === 'local-diverged-after-commit', L.gateState());
  const rp = await L.notePut({ pkg: PKG, baseRev: 429, op: 'put', identity: 'pass:abc' });
  ok('★★通常putは resolution-required で止まる',
     rp.ok === false && rp.blocked === true && rp.code === 'resolution-required', rp);
  ok('★★ユーザーに出す選択肢に「この端末をクラウドの正にする」が入っている',
     JSON.stringify(rp.gate.choices) === JSON.stringify(['adopt-remote', 'make-this-device-canonical']), rp.gate);
  const rf = await L.notePut({ pkg: PKG, baseRev: 429, op: 'forceput', identity: 'pass:abc' });
  ok('★★forceput は通る', rf.ok === true && rf.op === 'forceput' && !!rf.commitOpId, rf);
  ok('★★★送っただけでは関門を閉じない（結果を見る前に開放しない）',
     !!L.gateState() && L.gateState().reason === 'local-diverged-after-commit', L.gateState());
}

console.log('\n== (a2) ★★★確定した forceput が関門を閉じ、デッドロックが解ける ==');
{
  const w = mkLedger({ 'v292Dfix599_gate': GATE_OPEN });
  const L = w.__v292Dfix590;
  ok('★前提: 閉じた回数は0（この0は後で1になることで意味を持つ）', L.stats().gateClosed === 0, L.stats());
  const rf = await L.notePut({ pkg: PKG, baseRev: 429, op: 'forceput', identity: 'pass:abc' });
  const v = L.noteResult({ rev: 430, source: 'home:forceput', response: goodResp(430, rf) });

  ok('★★全検証を通って commit-confirmed', v.status === 'commit-confirmed' && v.rev === 430, v);
  ok('★★戻り値に op が入っている（put と forceput を呼び出し側が区別できる）', v.op === 'forceput', v);
  ok('★★戻り値に gateClosed が入っている', v.gateClosed === true, v);
  ok('★★★関門が閉じた', L.gateState() === null, L.gateState());
  ok('★閉じた回数を数えている', L.stats().gateClosed === 1, L.stats());
  ok('★保留も消える（自分の commit が canonical になった証明が取れたので）', L.hasAwaiting() === false);
  ok('★永続側からも消えている（再読込しても閉じたまま）',
     w.__store['v292Dfix599_gate'] === undefined, Object.keys(w.__store));

  const rp = await L.notePut({ pkg: PKG2, baseRev: 430, op: 'put', identity: 'pass:abc' });
  ok('★★★以後の通常putが通る（＝毎回 forceput を強いられる状態が解ける）',
     rp.ok === true && rp.op === 'put' && rp.blocked !== true, rp);
  ok('★止められた回数は増えていない', L.stats().gateBlockedPut === 0, L.stats());
}

console.log('\n== (a3) ★★ok:true でも検証を通らない応答では関門を閉じない ==');
{
  /* ①lastCommitOpId は一致するのに packageHash が違う＝Worker整合性異常 */
  const L1 = mkLedger({ 'v292Dfix599_gate': GATE_OPEN }).__v292Dfix590;
  const r1 = await L1.notePut({ pkg: PKG, baseRev: 429, op: 'forceput', identity: 'pass:abc' });
  const v1 = L1.noteResult({ rev: 430, source: 'home:forceput', response: {
    ok: true, rev: 430, hashAlg: 'sha256-utf8-v1', packageHash: 'f'.repeat(64), lastCommitOpId: r1.commitOpId } });
  ok('★★response-integrity-mismatch では閉じない',
     v1.status === 'response-integrity-mismatch' && !!L1.gateState() && L1.stats().gateClosed === 0, v1);
  ok('★その場合 pending も残す（証拠を捨てない）', L1.hasAwaiting() === true);

  /* ②packageHash は一致するが lastCommitOpId が別（別端末の commit が canonical） */
  const L2 = mkLedger({ 'v292Dfix599_gate': GATE_OPEN }).__v292Dfix590;
  const r2 = await L2.notePut({ pkg: PKG, baseRev: 429, op: 'forceput', identity: 'pass:abc' });
  const v2 = L2.noteResult({ rev: 430, source: 'home:forceput', response: {
    ok: true, rev: 430, hashAlg: 'sha256-utf8-v1', packageHash: r2.payloadHash, lastCommitOpId: 'op_someone_else' } });
  ok('★★ambiguous-response では閉じない',
     v2.status === 'ambiguous-response' && !!L2.gateState() && L2.stats().gateClosed === 0, v2);
  ok('★その場合 pending も残す', L2.hasAwaiting() === true);

  /* ③rev が進んでいない */
  const L3 = mkLedger({ 'v292Dfix599_gate': GATE_OPEN }).__v292Dfix590;
  const r3 = await L3.notePut({ pkg: PKG, baseRev: 429, op: 'forceput', identity: 'pass:abc' });
  const v3 = L3.noteResult({ rev: 429, source: 'home:forceput', response: goodResp(429, r3) });
  ok('★★rev が進んでいなければ閉じない',
     v3.status === 'ambiguous-response' && !!L3.gateState(), v3);

  /* ④照合の材料が無い応答（v25未満の Worker）。ここで閉じると「証明なしで開放」になる。 */
  const L4 = mkLedger({ 'v292Dfix599_gate': GATE_OPEN }).__v292Dfix590;
  await L4.notePut({ pkg: PKG, baseRev: 429, op: 'forceput', identity: 'pass:abc' });
  const v4 = L4.noteResult({ rev: 430, source: 'home:forceput', response: { ok: true, rev: 430 } });
  ok('★★★照合材料の無い成功(legacy-ok)では閉じない（ok:true を証明として使わない）',
     v4.status === 'legacy-ok' && !!L4.gateState() && L4.stats().gateClosed === 0, v4);
  ok('★legacy-ok は gateClosed を名乗らない', v4.gateClosed === undefined, v4);

  /* ⑤fork */
  const L5 = mkLedger({ 'v292Dfix599_gate': GATE_OPEN }).__v292Dfix590;
  await L5.notePut({ pkg: PKG, baseRev: 429, op: 'forceput', identity: 'pass:abc' });
  const v5 = L5.noteResult({ fork: true, serverRev: 431, source: 'home:forceput' });
  ok('★★fork では閉じない', v5.status === 'fork' && !!L5.gateState() && L5.stats().gateClosed === 0, v5);
}

console.log('\n== (a4) ★★通常putの commit-confirmed では閉じない（forceput のときだけ） ==');
{
  const w = mkLedger();
  const L = w.__v292Dfix590;
  const rp = await L.notePut({ pkg: PKG, baseRev: 429, op: 'put', identity: 'pass:abc' });
  /* 送ったあとに（別経路の照合で）関門が開いた、という順序を作る */
  L.openGate({ reason: 'needs-pull', remoteRev: 430 });
  const v = L.noteResult({ rev: 430, source: 'fix399', response: goodResp(430, rp) });
  ok('★通常putも確定はする', v.status === 'commit-confirmed' && v.op === 'put', v);
  ok('★★★通常putでは関門を閉じない（開放の根拠はユーザーの明示操作だけ）',
     v.gateClosed === false && !!L.gateState() && L.gateState().reason === 'needs-pull', L.gateState());
  ok('★閉じた回数は0のまま', L.stats().gateClosed === 0, L.stats());
}

console.log('\n== (a5) ★関門が開いていない状態で forceput が確定しても壊れない ==');
{
  const L = mkLedger().__v292Dfix590;
  const rf = await L.notePut({ pkg: PKG, baseRev: 429, op: 'forceput', identity: 'pass:abc' });
  const v = L.noteResult({ rev: 430, source: 'home:forceput', response: goodResp(430, rf) });
  ok('★★確定はする（例外にならない）', v.status === 'commit-confirmed' && v.op === 'forceput', v);
  ok('★★開いていないものを閉じたと言わない', v.gateClosed === false, v);
  ok('★閉じた回数も増えない（無意味な書込みをしない）', L.stats().gateClosed === 0, L.stats());
  ok('★関門は無いまま', L.gateState() === null);
}

console.log('\n== (b1) ★★隔離した証拠の復帰規則（restoreForeignIfIdle 単体） ==');
{
  const w = mkLedger();
  const L = w.__v292Dfix590;
  const tagA = await L.identityOfAsync({ ns: 'ns_わたし' });
  ok('★identity は指紋（生の ns ではない）', /^id_ns_[0-9a-f]{64}$/.test(tagA || ''), tagA);

  /* 同じアカウントの隔離2件（古い・新しい）＋別アカウントの1件 */
  L.quarantineForeign({ identity: tagA, commitOpId: 'op_古い試行', payloadHash: 'a'.repeat(64),
                        baseRev: 400, pkgTs: 1000, createdAt: 1000, op: 'put' });
  L.quarantineForeign({ identity: tagA, commitOpId: 'op_新しい試行', payloadHash: 'b'.repeat(64),
                        baseRev: 401, pkgTs: 2000, createdAt: 2000, op: 'put' });
  L.quarantineForeign({ identity: 'id_ns_べつの人', commitOpId: 'op_他人', payloadHash: 'c'.repeat(64),
                        createdAt: 3000, op: 'put' });
  ok('★前提: 隔離3件', L.foreignPendings().length === 3, L.foreignPendings().length);

  /* ①active pending があるときは復帰しない（新しい方の証拠を古い証拠で上書きしない） */
  const mine = await L.notePut({ pkg: PKG, baseRev: 410, op: 'put', ns: 'ns_わたし' });
  const r1 = await L.restoreForeignIfIdle({ ns: 'ns_わたし' });
  ok('★★active pending があるときは復帰しない',
     r1.ok === false && r1.code === 'active-pending-exists', r1);
  ok('★★台帳はいまの送信のまま（横から書き換えない）',
     L.pendingCommit().commitOpId === mine.commitOpId, L.pendingCommit());
  ok('★隔離も減らない', L.foreignPendings().length === 3, L.foreignPendings().length);

  /* ②決着したので active が空になった → ここで復帰する */
  L.clear();
  const r2 = await L.restoreForeignIfIdle({ ns: 'ns_わたし' });
  ok('★★復帰した', r2.ok === true, r2);
  ok('★★★最新1件だけが復帰する（古い試行の結果で新しい試行を上書きしない）',
     r2.restored.commitOpId === 'op_新しい試行' && r2.superseded === 1, r2);
  ok('★★台帳へ実際に載っている', L.pendingCommit().commitOpId === 'op_新しい試行', L.pendingCommit());
  ok('★★どこから戻したかが分かる（診断できる形で載せる）',
     L.pendingCommit().source === 'restored-from-foreign' &&
     L.pendingCommit().status === 'awaiting-result', L.pendingCommit());
  ok('★★送信に必要な材料をそのまま持ち帰っている（pkgTs / baseRev / payloadHash）',
     L.pendingCommit().pkgTs === 2000 && L.pendingCommit().baseRev === 401 &&
     L.pendingCommit().payloadHash === 'b'.repeat(64), L.pendingCommit());
  ok('★★★いきなり送信しない（まず照合する）', r2.needsReconcile === true, r2);

  const rest = L.foreignPendings();
  ok('★★古い試行は捨てずに残る（証拠を失わない）',
     rest.some(x => x.commitOpId === 'op_古い試行'), rest);
  ok('★★捨てない代わりに理由をつける（superseded-by-newer-local-attempt）',
     rest.filter(x => x.commitOpId === 'op_古い試行')[0].status === 'superseded-by-newer-local-attempt', rest);
  ok('★★別アカウントの隔離には触らない',
     rest.filter(x => x.commitOpId === 'op_他人')[0].status === 'foreign-pending', rest);
  ok('★復帰した1件は隔離から外れている', !rest.some(x => x.commitOpId === 'op_新しい試行'), rest);
  ok('★数えている', L.stats().foreignRestored === 1 && L.stats().foreignSupersededByNewer === 1, L.stats());
  ok('★★生の ns は隔離にも台帳にも残さない',
     JSON.stringify(w.__store).indexOf('ns_わたし') < 0, Object.keys(w.__store));
}
{
  /* ③identity を確定できないときは復帰しない。**foreign 扱いで捨ててもいけない**。 */
  const seed = { 'v292Dfix597_foreign': JSON.stringify([{ identityTag: 'id_ns_だれか',
    status: 'foreign-pending', op: 'put', commitOpId: 'op_不明', payloadHash: 'd'.repeat(64),
    baseRev: 400, pkgTs: 1, createdAt: 1000, quarantinedAt: Date.now() }]) };
  const L = mkLedger(seed).__v292Dfix590;
  const r = await L.restoreForeignIfIdle({});   /* ns も identity も無い＝確定できない */
  ok('★★identity 未確定なら復帰しない', r.ok === false && r.code === 'identity-unverified', r);
  ok('★★★それでも隔離は捨てない（未確定を不一致として扱わない）',
     L.foreignPendings().length === 1 && L.foreignPendings()[0].commitOpId === 'op_不明', L.foreignPendings());
  ok('★台帳も空のまま（推測で戻さない）', L.pendingCommit() === null, L.pendingCommit());
}
{
  /* ④隔離が空なら何もしない（無駄な書込みも通信もしない） */
  const w = mkLedger();
  const L = w.__v292Dfix590;
  const r = await L.restoreForeignIfIdle({ ns: 'ns_わたし' });
  ok('★★隔離が空なら nothing-to-restore', r.ok === false && r.code === 'nothing-to-restore', r);
  ok('★台帳は空のまま', L.pendingCommit() === null);
  ok('★★台帳キーを無駄に作らない', w.__store['v292Dfix590_pending'] === undefined, Object.keys(w.__store));
  ok('★★隔離の中身を捏造しない（空は空のまま）',
     (w.__store['v292Dfix597_foreign'] === undefined || w.__store['v292Dfix597_foreign'] === '[]') &&
     L.foreignPendings().length === 0, w.__store['v292Dfix597_foreign']);
}
{
  /* ⑤緊急停止（v292Dfix590Off）が効く */
  const L = mkLedger({ 'v292Dfix590Off': '1',
    'v292Dfix597_foreign': JSON.stringify([{ identityTag: 'id_ns_x', status: 'foreign-pending',
      commitOpId: 'op_x', payloadHash: 'e'.repeat(64), createdAt: 1000, quarantinedAt: Date.now() }]) }).__v292Dfix590;
  const r = await L.restoreForeignIfIdle({ ns: 'ns_x' });
  ok('★★OFF なら何もしない', r.ok === false && r.code === 'off', r);
  ok('★OFF でも隔離は残る', L.foreignPendings().length === 1);
}

console.log('\n== (b2) ★★★fix399 が runReconcile より「前」に復帰を呼んでいる（順序を観測する） ==');
{
  /* ★ソース文字列の正規表現ではなく、**呼び出し順序そのもの**を観測する。
     あとから戻すと runReconcile が採った pendingAtStart と食い違い、
     TOCTOU 判定（reconcile-stale）で**戻した証拠がそのまま使われない**。 */
  const order = [];
  const state = { pending: null };
  const led = {
    restoreForeignIfIdle: (args) => {
      order.push('restoreForeignIfIdle');
      led.__args = args;
      state.pending = 'op_復帰した証拠';
      return Promise.resolve({ ok: true, restored: { commitOpId: 'op_復帰した証拠' },
                               superseded: 0, needsReconcile: true });
    },
    runReconcile: () => {
      order.push('runReconcile');
      led.__pendingSeen = state.pending;      /* ★この時点で台帳に何が載っているか */
      return Promise.resolve({ status: 'nothing-pending' });
    },
    hasAwaiting: () => state.pending != null
  };
  const w = mk399({ ledger: led });
  await w.__v292Dfix399x.reconcileNow('test');
  ok('★★★呼び出し順が 復帰 → 照合 になっている',
     JSON.stringify(order) === JSON.stringify(['restoreForeignIfIdle', 'runReconcile']), order);
  ok('★★★照合が始まった時点で、戻した証拠が台帳に載っている（TOCTOUで捨てられない）',
     led.__pendingSeen === 'op_復帰した証拠', led.__pendingSeen);
  ok('★★identity の材料を渡している（誰の隔離かを判定できる形で呼ぶ）',
     !!led.__args && Object.prototype.hasOwnProperty.call(led.__args, 'ns') &&
     led.__args.identity === 'testpass' && led.__args.identityKind === 'pass', led.__args);
}
{
  /* 復帰が失敗しても照合は走る（復帰は「おまけ」であって、照合を止める理由にしない） */
  const order = [];
  const led = {
    restoreForeignIfIdle: () => { order.push('restoreForeignIfIdle'); return Promise.reject(new Error('壊れた')); },
    runReconcile: () => { order.push('runReconcile'); return Promise.resolve({ status: 'nothing-pending' }); },
    hasAwaiting: () => false
  };
  const w = mk399({ ledger: led });
  const r = await w.__v292Dfix399x.reconcileNow('test');
  ok('★★復帰が失敗しても照合は走る（fail-open）',
     JSON.stringify(order) === JSON.stringify(['restoreForeignIfIdle', 'runReconcile']) &&
     r.status === 'nothing-pending', { order, r });
}
{
  /* 復帰の口が無い古い台帳でも照合は走る（配線が新旧混在でも止めない） */
  const order = [];
  const led = {
    runReconcile: () => { order.push('runReconcile'); return Promise.resolve({ status: 'nothing-pending' }); },
    hasAwaiting: () => false
  };
  const w = mk399({ ledger: led });
  const r = await w.__v292Dfix399x.reconcileNow('test');
  ok('★★復帰の口が無い台帳でも照合は走る',
     JSON.stringify(order) === JSON.stringify(['runReconcile']) && r.status === 'nothing-pending', { order, r });
}
{
  /* 未ログインなら1バイトも通信しない（復帰も呼ばない） */
  const order = [];
  const led = {
    restoreForeignIfIdle: () => { order.push('restoreForeignIfIdle'); return Promise.resolve({ ok: false }); },
    runReconcile: () => { order.push('runReconcile'); return Promise.resolve({ status: 'nothing-pending' }); },
    hasAwaiting: () => false
  };
  const w = mk399({ ledger: led, seed: { 'v292ProxyPass': '' } });
  /* ★読み込み時の Worker 版判定(GET)は別件なので、そこからの増分で見る */
  const base = w.__httpOps.length;
  const r = await w.__v292Dfix399x.reconcileNow('test');
  ok('★★未ログインなら復帰も照合もしない',
     order.length === 0 && r.status === 'not-logged-in' && w.__httpOps.length === base,
     { order, r, base, now: w.__httpOps.length });
}

console.log('\n== (b3) ★★★実物どうしを繋いで、D2の目的が実際に達成されることを確かめる ==');
{
  /* ★モックではなく **fix590 の実物 + fix399 の実物**。
     「作ったが配線していない」を検出できるのはここだけ。 */
  const w = mk399({ realLedger: true });
  const L = w.__v292Dfix590;
  /* fix399 は ns を知らないので identity はヘッダ由来（合言葉）になる。同じ規則で隔離を作る。 */
  const tag = L.identityKey('testpass', 'pass');
  ok('★前提: 合言葉から identity を作れる', /^id_pass_/.test(tag || ''), tag);
  L.quarantineForeign({ identity: tag, commitOpId: 'op_応答を取り逃した送信', payloadHash: 'a'.repeat(64),
                        baseRev: 429, pkgTs: 111, createdAt: 1000, op: 'put' });
  ok('★前提: 台帳は空・隔離1件', L.pendingCommit() === null && L.foreignPendings().length === 1);

  const base = w.__httpOps.length;   /* 読み込み時の Worker 版判定(GET)は数えない */
  const r = await w.__v292Dfix399x.reconcileNow('test');
  ok('★★★アカウントを戻したら、隔離してあった証拠が実際に台帳へ戻る',
     L.pendingCommit() !== null && L.pendingCommit().commitOpId === 'op_応答を取り逃した送信', L.pendingCommit());
  ok('★隔離からは外れている', L.foreignPendings().length === 0, L.foreignPendings());
  ok('★数えている（0件ではなく1件）', L.stats().foreignRestored === 1, L.stats());
  /* ★★ここが順序の証拠: 復帰が照合より後なら、runReconcile は pending 無しと判断して
     'nothing-pending' を返し、runner（通信）は1度も走らない。 */
  ok('★★★戻した証拠がその場の照合対象になっている（nothing-pending にならない）',
     r.status !== 'nothing-pending' && r.status === 'unsupported', r);
  ok('★実際に照合の通信まで進んでいる', w.__httpOps.length > base, { base, ops: w.__httpOps });
}
{
  /* 隔離が無い通常の起動では、余計なことを一切しない */
  const w = mk399({ realLedger: true });
  const L = w.__v292Dfix590;
  const base = w.__httpOps.length;
  const r = await w.__v292Dfix399x.reconcileNow('test');
  ok('★★隔離も pending も無ければ照合は nothing-pending で終わる',
     r.status === 'nothing-pending', r);
  ok('★★照合のための通信を1回もしない',
     w.__httpOps.length === base, { base, ops: w.__httpOps });
  ok('★台帳も隔離も空のまま', L.pendingCommit() === null && L.foreignPendings().length === 0);
}

console.log('\n== (b4) 退行防止（口と表明が消えていない） ==');
{
  const L = mkLedger().__v292Dfix590;
  ok('★restoreForeignIfIdle が公開されている', typeof L.restoreForeignIfIdle === 'function');
  ok('★restoreForeignFor も残っている（単体で検証できる口）', typeof L.restoreForeignFor === 'function');
  ok('★★配線済みを表明している（fix579 visible() の再発防止）',
     L.foreignRestoreWired === true && /foreignRestoreWired: true/.test(SRC590), L.foreignRestoreWired);
  ok('★fix399 側にも fix603 の印が残っている（次に読む人が経緯をたどれる）',
     /fix603/.test(SRC399) && /restoreForeignIfIdle/.test(SRC399));
  ok('★関門の口は3つとも残っている',
     typeof L.openGate === 'function' && typeof L.closeGate === 'function' &&
     typeof L.gateState === 'function');
  ok('★★閉じていない関門を閉じようとしても壊れない',
     JSON.stringify(L.closeGate('なにもない')) === JSON.stringify({ ok: false, code: 'not-open' }),
     L.closeGate('なにもない'));
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
if (fail) process.exitCode = 1;
})();
