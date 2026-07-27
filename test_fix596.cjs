/* 回帰テスト: v292Dfix596 — commit ledger v2（送ったのに応答を取り逃したときの決着）
 *
 * ★なぜ必要か
 *   put の応答を受け取れないまま離脱すると「サーバは受け取ったのか」が分からない。
 *   分からないまま次の put を送ると**前回のコミットの証拠が消え**、rev が食い違ったまま
 *   fork し続けて保存できなくなる（2026-07-27 に実際に起きた 429/430 デッドロック）。
 *   Worker v25 の commitstate が「canonical の中身のhash」と「最後に成功した commit の op id」を
 *   返すので、自分が送ったものと突き合わせれば自力で決着できる。
 *
 * ★GPT裁定（2026-07-27）で決めた、破ってはいけない約束
 *   C1 commitOpId は put だけでなく forceput にも付ける
 *   C2 成功応答を ok:true だけで信用しない（rev/hashAlg/packageHash/lastCommitOpId を全部見る）
 *   C3 未解決の pending を新しい put で上書きしない
 *   C4 reconcile は TOCTOU 対策をする（開始時の写しと照合してから適用）
 *   C5 2種類の成功を厳密に分ける（commit-confirmed / state-equivalent-rebased）
 *   C6 hashAlg と packageSpec の両方が一致したときだけ三者照合を有効にする
 *   C7 identity は fingerprint（別アカウントの pending を誤適用しない）
 *   C8 rev は巻き戻さない
 *
 * ★このテストは台帳を**実際に動かす**（静的検査だけにしない）。
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const SRC = read('v292Dfix590-commit-ledger.js');
const SRC399 = read('v292Dfix399-cloudsync.js');
const HOME = read('home.html');

/* 台帳を本物で動かす環境 */
function mk(seed){
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
  vm.runInContext(SRC, vm.createContext(w), { filename: 'v292Dfix590-commit-ledger.js' });
  return w;
}
const PKG = { ls: { a: '1' }, updatedAt: 1, device: 'PC' };
const PKG2 = { ls: { a: '2' }, updatedAt: 2, device: 'PC' };

(async () => {

console.log('\n== (1) ★★C1: commitOpId を発行し、put も forceput も台帳に載る ==');
{
  const L = mk().__v292Dfix590;
  const r1 = await L.notePut({ pkg: PKG, baseRev: 10, op: 'put', identity: 'pass:abc', identityKind: 'pass' });
  ok('★put で commitOpId が発行される', !!r1.commitOpId && /^op_/.test(r1.commitOpId), r1);
  ok('★payloadHash は16進64字', /^[0-9a-f]{64}$/.test(r1.payloadHash || ''));
  ok('★台帳に op:put が入る', L.pendingCommit().op === 'put');
  ok('★★未解決として扱われる', L.hasAwaiting() === true);

  const L2 = mk().__v292Dfix590;
  const r2 = await L2.notePut({ pkg: PKG, baseRev: 10, op: 'forceput', identity: 'pass:abc' });
  ok('★★forceput も同じ台帳を通る（GPT指定1）', r2.ok === true && L2.pendingCommit().op === 'forceput', r2);
  ok('★commitOpId は毎回違う', r1.commitOpId !== r2.commitOpId);
}

console.log('\n== (2) ★★C3: 未解決の pending を新しい put で上書きしない ==');
{
  const L = mk().__v292Dfix590;
  const r1 = await L.notePut({ pkg: PKG, baseRev: 10, op: 'put', identity: 'pass:abc' });
  const r2 = await L.notePut({ pkg: PKG2, baseRev: 11, op: 'put', identity: 'pass:abc' });
  ok('★★2回目は blocked で返る（送ってはいけない）', r2.blocked === true && r2.code === 'pending-unresolved', r2);
  ok('★★台帳は1回目のまま（証拠が消えない）', L.pendingCommit().commitOpId === r1.commitOpId);
  ok('★数えている', L.stats().pendingBlockedNewPut === 1, L.stats());
}

console.log('\n== (3) ★★C2: 成功応答を ok:true だけで信用しない ==');
{
  const base = async () => {
    const L = mk().__v292Dfix590;
    const r = await L.notePut({ pkg: PKG, baseRev: 10, op: 'put', identity: 'pass:abc' });
    return { L, r };
  };
  {
    const { L, r } = await base();
    const v = L.noteResult({ rev: 11, source: 't', response: {
      ok: true, rev: 11, hashAlg: 'sha256-utf8-v1', packageHash: r.payloadHash, lastCommitOpId: r.commitOpId } });
    ok('★★全項目一致 → commit-confirmed', v.status === 'commit-confirmed', v);
    ok('★★pending が消える', L.hasAwaiting() === false);
    ok('★数えている', L.stats().commitConfirmed === 1);
  }
  {
    const { L, r } = await base();
    const v = L.noteResult({ rev: 11, source: 't', response: {
      ok: true, rev: 11, hashAlg: 'sha256-utf8-v1', packageHash: 'f'.repeat(64), lastCommitOpId: r.commitOpId } });
    ok('★★opId一致・hash不一致 → response-integrity-mismatch（単なる競合と分ける）',
       v.status === 'response-integrity-mismatch', v);
    ok('★★pending を消さない', L.hasAwaiting() === true);
    ok('★専用カウンタで数える', L.stats().responseIntegrityMismatch === 1);
  }
  {
    const { L, r } = await base();
    const v = L.noteResult({ rev: 11, source: 't', response: {
      ok: true, rev: 11, hashAlg: 'sha256-utf8-v1', packageHash: r.payloadHash, lastCommitOpId: 'op_someone_else' } });
    ok('★★opId が別 → ambiguous-response', v.status === 'ambiguous-response', v);
    ok('★★pending を消さない（appliedRev も進めさせない）', L.hasAwaiting() === true);
  }
  {
    const { L, r } = await base();
    const v = L.noteResult({ rev: 10, source: 't', response: {
      ok: true, rev: 10, hashAlg: 'sha256-utf8-v1', packageHash: r.payloadHash, lastCommitOpId: r.commitOpId } });
    ok('★★rev が baseRev より進んでいない → ambiguous-response', v.status === 'ambiguous-response', v);
  }
  {
    const { L } = await base();
    const v = L.noteResult({ rev: 11, source: 't', response: { ok: true, rev: 11 } });
    ok('★v25未満の応答（hashAlg無し）は従来どおり成功扱い', v.status === 'legacy-ok', v);
    ok('★その場合は pending を消す（照合の材料が無いので残しても決着できない）', L.hasAwaiting() === false);
  }
  {
    const { L, r } = await base();
    const v = L.noteResult({ fork: true, serverRev: 12, source: 't' });
    ok('★fork は fork のまま', v.status === 'fork');
    ok('★★fork でも pending を消さない', L.hasAwaiting() === true);
    ok('★forksObserved は事実として数える', L.stats().forksObserved === 1);
  }
}

console.log('\n== (4) ★★C5: 2種類の成功を厳密に分ける ==');
{
  const setup = async () => {
    const L = mk().__v292Dfix590;
    const r = await L.notePut({ pkg: PKG, baseRev: 10, op: 'put', identity: 'pass:abc' });
    return { L, r };
  };
  {
    const { L, r } = await setup();
    const v = await L.classify({
      remote: { rev: 11, packageHash: r.payloadHash, lastCommitOpId: r.commitOpId, hashAlg: 'sha256-utf8-v1' },
      appliedRev: 10, identity: 'pass:abc', currentHash: r.payloadHash });
    ok('★★opId まで一致 → commit-confirmed', v.status === 'commit-confirmed', v);
    ok('★appliedRev を進めてよい', v.canAdvanceAppliedRev === true);
  }
  {
    const { L, r } = await setup();
    const v = await L.classify({
      remote: { rev: 11, packageHash: r.payloadHash, lastCommitOpId: null, hashAlg: 'sha256-utf8-v1' },
      appliedRev: 10, identity: 'pass:abc', currentHash: r.payloadHash });
    ok('★★opId が null（v24が書いた行）→ state-equivalent-rebased', v.status === 'state-equivalent-rebased', v);
    ok('★★それでも appliedRev は進めてよい（中身が同一なので）', v.canAdvanceAppliedRev === true);
    ok('★★commit-confirmed としては数えない', L.stats().commitConfirmed === 0, L.stats());
    ok('★別カウンタで数える', L.stats().stateEquivalentRebased === 1);
  }
  {
    const { L, r } = await setup();
    const v = await L.classify({
      remote: { rev: 11, packageHash: 'a'.repeat(64), lastCommitOpId: null, hashAlg: 'sha256-utf8-v1' },
      appliedRev: 10, identity: 'pass:abc', currentHash: r.payloadHash });
    /* ★fix597 D1-A: canonical は「自分が送った内容」ではない。
       ただし「自分の commit は通らなかった」と**断定してはいけない**
       （一度通ったあと別端末の後続 commit に置き換わった可能性がある）。 */
    ok('★★remote の中身が違う → 本物の競合（pending は remote に追い越された扱い）',
       v.status === 'pending-superseded-by-remote', v);
    ok('★realConflicts で数える', L.stats().realConflicts === 1);
    ok('★appliedRev は進めない', v.canAdvanceAppliedRev === false);
    ok('★★自分のcommitの成否は断定しない（commit-failed にしない）',
       v.commitOutcome === 'unknown', v);
    ok('★★不一致が確定したので pending は解放するが、pull を要求し dirty のまま残す',
       v.releasePending === true && v.resolved === true &&
       v.needsPull === true && v.syncDirty === true, v);
    ok('★★解放しても決着まで通常putは止める（fix599 の関門を開く）',
       v.openGate === 'needs-pull', v);
  }
  {
    const { L, r } = await setup();
    const v = await L.classify({
      remote: { rev: 11, packageHash: r.payloadHash, lastCommitOpId: r.commitOpId, hashAlg: 'sha256-utf8-v1' },
      appliedRev: 10, identity: 'pass:abc', currentHash: 'b'.repeat(64) });
    /* ★fix597 D1-B: remote=lastSent かつ lastCommitOpId も一致 → 自分の commit は確定成功。
       それでも**ローカルが先へ進んでいるので自動 rebase はしない**（派生の証明が無い）。 */
    ok('★★remote=lastSent だが現在のローカルだけ違う → rebase しない',
       v.canAdvanceAppliedRev === false && v.status === 'commit-confirmed-local-diverged', v);
    ok('★★自分の commit が通った証明にはなっている（結果不明にしない）',
       v.commitOutcome === 'confirmed' && v.releasePending === true && v.resolved === true, v);
    ok('★★通常の needsPull にしない（local-ahead保護でpullがスキップされ再fork するため）',
       v.needsPull === false && v.conflictState === 'local-diverged-after-commit', v);
    ok('★★ユーザーが選べる決着手段を明示する（関門は明示操作でしか開かない）',
       v.openGate === 'local-diverged-after-commit' &&
       JSON.stringify(v.choices) === JSON.stringify(['adopt-remote', 'make-this-device-canonical']), v);
  }
  {
    /* ★同じ「remote=lastSent・ローカルだけ進んだ」でも、lastCommitOpId が一致しなければ
       自分の commit が通った証明にはならない。ここを混ぜると成功を捏造することになる。 */
    const { L, r } = await setup();
    const v = await L.classify({
      remote: { rev: 11, packageHash: r.payloadHash, lastCommitOpId: null, hashAlg: 'sha256-utf8-v1' },
      appliedRev: 10, identity: 'pass:abc', currentHash: 'b'.repeat(64) });
    ok('★★opId が無ければ「確定成功」とは記録しない（同じ競合状態だが outcome は unknown）',
       v.status === 'state-equivalent-local-diverged' && v.commitOutcome === 'unknown' &&
       v.conflictState === 'local-diverged-after-commit' && v.canAdvanceAppliedRev === false, v);
  }
}

console.log('\n== (5) ★★C4: TOCTOU（照合の最中に pending が変わったら適用しない） ==');
{
  const L = mk().__v292Dfix590;
  const r = await L.notePut({ pkg: PKG, baseRev: 10, op: 'put', identity: 'pass:abc' });
  const p0 = L.pendingCommit();
  /* 照合の途中で別の commit に入れ替わった状況を作る */
  L.clear();
  const r2 = await L.notePut({ pkg: PKG2, baseRev: 11, op: 'put', identity: 'pass:abc' });
  const v = await L.classify({
    remote: { rev: 11, packageHash: r.payloadHash, lastCommitOpId: r.commitOpId, hashAlg: 'sha256-utf8-v1' },
    appliedRev: 10, identity: 'pass:abc', currentHash: r.payloadHash, pendingAtStart: p0 });
  ok('★★開始時と違うので reconcile-stale', v.status === 'no' && v.why === 'reconcile-stale', v);
  ok('★★appliedRev を動かさない', v.canAdvanceAppliedRev === false);
  ok('★数えている', L.stats().reconcileStale === 1);
}

console.log('\n== (6) ★★C6/C7/C8: 前提条件のガード ==');
{
  const setup = async () => {
    const L = mk().__v292Dfix590;
    const r = await L.notePut({ pkg: PKG, baseRev: 10, op: 'put', identity: 'pass:abc', identityKind: 'pass' });
    return { L, r };
  };
  {
    const { L, r } = await setup();
    const v = await L.classify({
      remote: { rev: 11, packageHash: r.payloadHash, lastCommitOpId: r.commitOpId, hashAlg: 'sha256-utf8-v2' },
      appliedRev: 10, identity: 'pass:abc', currentHash: r.payloadHash });
    ok('★★hashAlg が違えば照合しない', v.why === 'hash-alg-mismatch', v);
  }
  {
    const { L, r } = await setup();
    const v = await L.classify({
      remote: { rev: 11, packageHash: r.payloadHash, lastCommitOpId: r.commitOpId,
                hashAlg: 'sha256-utf8-v1', packageSpec: 'chronicle-light-v2' },
      appliedRev: 10, identity: 'pass:abc', currentHash: r.payloadHash });
    ok('★★packageSpec が違えば照合しない（GPT指定6）', v.why === 'package-spec-mismatch', v);
  }
  {
    const { L, r } = await setup();
    const v = await L.classify({
      remote: { rev: 11, packageHash: r.payloadHash, lastCommitOpId: r.commitOpId, hashAlg: 'sha256-utf8-v1' },
      appliedRev: 10, identity: 'pass:different', identityKind: 'pass', currentHash: r.payloadHash });
    ok('★★別アカウントの pending を適用しない（GPT指定7）', v.why === 'identity-mismatch', v);
  }
  {
    const { L, r } = await setup();
    const v = await L.classify({
      remote: { rev: 9, packageHash: r.payloadHash, lastCommitOpId: r.commitOpId, hashAlg: 'sha256-utf8-v1' },
      appliedRev: 10, identity: 'pass:abc', currentHash: r.payloadHash });
    ok('★★remoteRev < appliedRev は異常。昇格も pending 解除もしない（rev巻き戻し禁止）',
       v.why === 'remote-rev-behind' && v.canAdvanceAppliedRev === false, v);
  }
  {
    const { L, r } = await setup();
    const v = await L.classify({
      remote: { rev: 10, packageHash: r.payloadHash, lastCommitOpId: r.commitOpId, hashAlg: 'sha256-utf8-v1' },
      appliedRev: 10, identity: 'pass:abc', currentHash: r.payloadHash });
    ok('★★remoteRev === appliedRev なら rev昇格は不要だが、状態一致は確認できる',
       v.status === 'commit-confirmed' && v.canAdvanceAppliedRev === false, v);
  }
  {
    const { L, r } = await setup();
    const v = await L.classify({ remoteReadFailed: true });
    ok('★読めなかったときは remote-read-failed', v.why === 'remote-read-failed', v);
    ok('★数えている', L.stats().remoteReadFailed === 1);
  }
  /* identity fingerprint そのもの */
  {
    const L = mk().__v292Dfix590;
    ok('★★同じ文字列でも認証種別が違えば別の identity',
       L.identityKey('abc', 'google') !== L.identityKey('abc', 'pass'));
    ok('★生の値を保存していない（伏せた値になっている）',
       L.identityKey('user@example.com', 'google').indexOf('user@example.com') < 0);
    ok('★同じ入力なら同じ値（照合できる）', L.identityKey('abc', 'pass') === L.identityKey('abc', 'pass'));
  }
}

console.log('\n== (7) ★★single-flight（同時に2本走らせない） ==');
{
  const L = mk().__v292Dfix590;
  await L.notePut({ pkg: PKG, baseRev: 10, op: 'put', identity: 'pass:abc' });
  let running = 0, maxRunning = 0, calls = 0;
  const runner = () => { calls++; running++; maxRunning = Math.max(maxRunning, running);
    return new Promise(r => setTimeout(() => { running--; r({ status:'remote-read-failed' }); }, 20)); };
  const a = L.runReconcile(runner);
  const b = L.runReconcile(runner);   /* 走っている最中の要求 */
  const rb = await b;
  await a;
  await new Promise(r => setTimeout(r, 80));
  ok('★★同時に2本走らない', maxRunning === 1, { maxRunning, calls });
  ok('★2本目は joined として返る', rb.status === 'joined', rb);
  ok('★数えている', L.stats().reconcileSingleFlightJoins === 1);
  ok('★★終わったあと最大1回だけやり直す（無限に連鎖しない）', calls === 2, { calls });
}
{
  const L = mk().__v292Dfix590;
  let calls = 0;
  const r = await L.runReconcile(() => { calls++; return Promise.resolve({ status:'x' }); });
  ok('★★pending が無ければ1バイトも通信しない', r.status === 'nothing-pending' && calls === 0, { r, calls });
}

console.log('\n== (8) ★★pull が収束したら pending を用済みにする（永久に詰まらせない） ==');
{
  const L = mk().__v292Dfix590;
  await L.notePut({ pkg: PKG, baseRev: 10, op: 'put', identity: 'pass:abc' });
  ok('★保留がある', L.hasAwaiting() === true);
  /* ★★fix597 D3: 解放の意味は「pendingのcommitが成功した」ではなく
     **「現在の canonical を新しい同期基点として正式に採用した」**。
     したがって pull の**収束証明**が要る。証明なしの呼び出しでは pending を消してはいけない。 */
  const mkProof = patch => L.provePullConvergence(Object.assign({
    remoteRev: 430, currentSharedRev: 10, pullCompleted: true, parsedOk: true,
    applyErrors: 0, conflictSkips: 0, unknownSkips: 0, metaMerged: true,
    metaMergeFailed: false, blockedWithoutTombstone: 0, readBackOk: true,
    retainedLocalDeltaCount: 0, metaMergedWithLocalDelta: false }, patch || {}));

  const bare = L.supersedeByPull(430);
  ok('★★証明の無い呼び出しでは pending を消さない（revだけ渡す旧呼び出しは拒否）',
     bare.ok === false && bare.code === 'proof-required' && L.hasAwaiting() === true, bare);
  const notConverged = L.supersedeByPull({ remoteRev: 430, proof: mkProof({ applyErrors: 1 }), identity: 'pass:abc' });
  ok('★★収束していない pull でも消さない',
     notConverged.ok === false && notConverged.code === 'pull-not-converged' && L.hasAwaiting() === true, notConverged);

  const proof = mkProof();
  ok('★収束証明が通る', proof.ok === true, proof);
  const sp = L.supersedeByPull({ remoteRev: 430, proof: proof, identity: 'pass:abc' });
  ok('★★pull収束（証明つき）で解消できる', sp.ok === true && L.hasAwaiting() === false, sp);
  ok('★数えている', L.stats().supersededByPull === 1);
  ok('★★remote を完全採用したので dirty を落とし、rev を進めてよい',
     sp.syncDirty === false && sp.canAdvanceAppliedRev === true, sp);
  ok('★★解消後は新しい put を送れる', (await L.notePut({ pkg: PKG2, baseRev: 430, op: 'put', identity: 'pass:abc' })).ok === true);
}
{
  /* ★★fix599: fullyAdoptedRemote は**呼出側の申告ではなく収束証明から導出する**。
     ここが呼出側任せだと、ローカル差分（墓標など）を抱えたまま dirty を落として
     **未同期の変更を失う**。 */
  const L = mk().__v292Dfix590;
  await L.notePut({ pkg: PKG, baseRev: 10, op: 'put', identity: 'pass:abc' });
  const proofWithDelta = L.provePullConvergence({
    remoteRev: 430, currentSharedRev: 10, pullCompleted: true, parsedOk: true,
    applyErrors: 0, conflictSkips: 0, unknownSkips: 0, metaMerged: true,
    metaMergeFailed: false, blockedWithoutTombstone: 0, readBackOk: true,
    retainedLocalDeltaCount: 1, metaMergedWithLocalDelta: true });
  ok('★収束はしているが remote の完全採用ではない',
     proofWithDelta.ok === true && proofWithDelta.fullyAdoptedRemote === false, proofWithDelta);
  const sp = L.supersedeByPull({ remoteRev: 430, proof: proofWithDelta, identity: 'pass:abc',
                                 fullyAdoptedRemote: true });   /* ★呼出側の嘘 */
  ok('★★呼出側が fullyAdoptedRemote:true と申告しても、証明が否定すれば dirty を落とさない',
     sp.ok === true && sp.syncDirty === true, sp);
}
{
  /* ★identity を確定できないなら pending を消してはいけない（証拠を失う） */
  const L = mk().__v292Dfix590;
  await L.notePut({ pkg: PKG, baseRev: 10, op: 'put', ns: 'ns_わたし' });
  const proof = L.provePullConvergence({
    remoteRev: 430, currentSharedRev: 10, pullCompleted: true, parsedOk: true,
    applyErrors: 0, conflictSkips: 0, unknownSkips: 0, metaMerged: true,
    metaMergeFailed: false, blockedWithoutTombstone: 0, readBackOk: true });
  const sp = await L.supersedeByPullAsync({ remoteRev: 430, proof: proof, ns: 'ns_べつの人' });
  ok('★★別 identity の pull収束では pending を消さない',
     sp.ok === false && sp.code === 'identity-mismatch' && L.hasAwaiting() === true, sp);
  /* ★identity を**確定できない**（指紋が未計算）ときも消さない。「違う」とは別の理由。 */
  const unv = L.supersedeByPull({ remoteRev: 430, proof: proof, ns: 'ns_まだ計算していない' });
  ok('★★identity を確定できないときも pending を消さない（identity不明≠identity不一致）',
     unv.ok === false && unv.code === 'identity-unverified' && L.hasAwaiting() === true, unv);
}

console.log('\n== (9) ★★旧版(v1)の記録は読まない（勝手に解釈しない） ==');
{
  const w = mk({ 'v292Dfix590_pending': JSON.stringify({ v: 1, spec: 'sha256-utf8-v1', payloadHash: 'x' }) });
  const L = w.__v292Dfix590;
  ok('★★v1 のレコードは無効として扱う', L.pendingCommit() === null && L.hasAwaiting() === false);
  ok('★版が上がっている', L.VERSION >= 3, L.VERSION);
  /* ★fix597(GPT裁定D2と同じ理由): v2 は形が互換（増えただけ）なので**捨てない**。
     捨てると「応答喪失commitの証拠」を失う。 */
  const w2 = mk({ 'v292Dfix590_pending': JSON.stringify({
    v: 2, spec: 'sha256-utf8-v1', packageSpec: 'chronicle-light-v1', op: 'put',
    commitOpId: 'op_old_1', payloadHash: 'a'.repeat(64), baseRev: 10,
    createdAt: Date.now(), status: 'awaiting-result' }) });
  ok('★★v2 の記録は捨てない（応答喪失commitの証拠を失わない）',
     w2.__v292Dfix590.hasAwaiting() === true &&
     w2.__v292Dfix590.pendingCommit().commitOpId === 'op_old_1', w2.__v292Dfix590.pendingCommit());
}

console.log('\n== (10) ★fix399 への配線 ==');
{
  ok('★★put に commitOpId を載せる', /if \(pr && pr\.ok && pr\.commitOpId\) body\.commitOpId = pr\.commitOpId;/.test(SRC399));
  /* ★fix599 で「送らない理由」が3種類に分かれた。固定したい意味は
     **blocked が返ったら callSave に到達せず必ず throw する**こと。 */
  {
    const blockedBody = SRC399.slice(SRC399.indexOf('if (pr && pr.blocked){'),
                                     SRC399.indexOf('if (pr && pr.ok && pr.commitOpId)'));
    ok('★★pending 未解決なら送信しない（blocked の枝から callSave へ落ちない）',
       blockedBody.length > 0 && /throw eb;/.test(blockedBody) && !/callSave\(/.test(blockedBody),
       blockedBody.length);
    ok('★★理由を混ぜない: 結果待ち / 関門 / 不変条件違反 を別のエラーとして投げる',
       /eb\.pendingCommit = true/.test(blockedBody) &&
       /eg\.resolutionRequired = true/.test(blockedBody) &&
       /ei\.invariant = pr\.code/.test(blockedBody), blockedBody.length);
    ok('★★止めたら未同期として残す（黙って捨てない）',
       /setNum\('v292Dfix399_localTs', Date\.now\(\)\);/.test(blockedBody));
  }
  ok('★★成功応答を noteResult に検証させる', /led\.noteResult\(\{ rev: j\.rev, source:'fix399', response: j \}\)/.test(SRC399));
  ok('★★曖昧なら rev を進めない', /if \(verdict\.status === 'ambiguous-response' \|\| verdict\.status === 'response-integrity-mismatch'\)\{[\s\S]{0,400}throw ea;/.test(SRC399));
  ok('★★promoteRev は検証を通ったあとにだけ呼ぶ',
     SRC399.indexOf("throw ea;") < SRC399.indexOf("c.promoteRev(j.rev, 'push成功')"));
  ok('★契機(1) 起動時 pending', /function reconcileOnBoot\(\)/.test(SRC399) && /led\.hasAwaiting\(\)\) return;/.test(SRC399));
  ok('★契機(2) fork 直後', /reconcileNow\('fork'\)/.test(SRC399));
  ok('★契機(3) 通信失敗の直後', /reconcileNow\(err && err\.pendingCommit \? 'pending-blocked' : 'io-error'\)/.test(SRC399));
  ok('★★契機(3) は fork と二重に走らせない',
     /var isFork = !!\(err && err\.fork\);[\s\S]{0,800}var noReconcile = isFork[\s\S]{0,400}if \(!noReconcile\) setTimeout\(function\(\)\{ reconcileNow\(/.test(SRC399));
  /* ★fix599: 関門・不変条件違反で止まったときは結末がもう判明しているので、
     照合を走らせても決着しないまま通信を繰り返すだけになる。 */
  ok('★★関門・不変条件違反でも再照合を走らせない',
     /var noReconcile = isFork \|\| !!\(err && \(err\.resolutionRequired \|\| err\.invariant\)\);/.test(SRC399));
  ok('★契機(4) 復帰時', /visibilitychange/.test(SRC399) && /shouldReconcileOnResume\(\)/.test(SRC399));
  ok('★★起動フックは pending が無ければ何もしない',
     /if \(!led \|\| typeof led\.hasAwaiting !== 'function' \|\| !led\.hasAwaiting\(\)\) return;/.test(SRC399));
  ok('★★capability が無ければ appliedRev を動かさず pull を要求',
     /if \(!cap\.ok\)\{[\s\S]{0,300}return \{ status:'unsupported', needsPull:true \};/.test(SRC399));
  /* ★★fix598: 能力の値は単調増加する。`=== 1` で書くと**サーバを新しくした瞬間に照合が丸ごと止まる**。
     能力判定は「その機能が使えるだけの版か」＝ `>=` でなければならない。 */
  ok('★★有効化条件は commitState が必要版以上（>=）かつ d1===true',
     /cs >= 1 && j\.d1 === true/.test(SRC399) && !/cap\.commitState === \d/.test(SRC399));
  ok('★★ns が commitstate に載るのは v26 以降。ここも >= で判定する',
     /nsInCommitState: cs >= 2/.test(SRC399));
  ok('★★昇格は canAdvanceAppliedRev のときだけ',
     /if \(v\.canAdvanceAppliedRev && c && v\.remoteRev != null\)\{/.test(SRC399));
  /* ★★永久に詰まらせないための逃げ道。これが無いと「未解決pendingで送信を止める」規則が
     そのまま「二度と保存できない」に化ける。 */
  /* ★fix597: 解放してよい分類は増えるので、**分類名の列挙ではなく台帳が返す releasePending**
     で判断していること自体を固定する（分類が増えるたびに配線が漏れる型を禁じる）。 */
  {
    const releaseBody = SRC399.slice(SRC399.indexOf('if (!fullMatch && v.releasePending){'),
                                     SRC399.indexOf("if (v.why === 'identity-unverified')"));
    ok('★★結末が確定した不一致は pending を解放する（分類名を数え上げない）',
       releaseBody.length > 0 && /led\.clear\(\);/.test(releaseBody) &&
       !/v\.why === '/.test(releaseBody), releaseBody.length);
    ok('★★ただし rev は動かさない（未反映のまま残す）',
       releaseBody.length > 0 && !/promoteRev\(/.test(releaseBody) &&
       /setNum\('v292Dfix399_localTs', Date\.now\(\)\);/.test(releaseBody), releaseBody.length);
    ok('★★解放しても決着まで通常putを止める関門を開く（fix599）',
       /led\.openGate\(\{ reason: v\.openGate/.test(releaseBody));
    ok('★★rev 昇格は三者一致のときだけ（解放の枝では絶対に昇格しない）',
       /if \(v\.canAdvanceAppliedRev && c && v\.remoteRev != null\)\{/.test(SRC399) &&
       SRC399.indexOf("c.promoteRev(v.remoteRev, 'fix596:'") <
       SRC399.indexOf('if (!fullMatch && v.releasePending){'));
  }
  /* ★緊急停止は**実際に動かして**確かめる（ソース文字列の形ではなく振る舞いを固定する） */
  {
    const Loff = mk({ 'v292Dfix590Off': '1' }).__v292Dfix590;
    const roff = await Loff.notePut({ pkg: PKG, baseRev: 10, op: 'put', identity: 'pass:abc' });
    ok('★★緊急停止できる（v292Dfix590Off で台帳ごと止まる）',
       roff.ok === false && roff.code === 'off', roff);
    ok('★★OFF なら送信はブロックされない（blocked を返さない）', roff.blocked !== true, roff);
    /* 未解決 pending も関門も残っている状態でも、OFF なら送信を止めてはいけない */
    const Loff2 = mk({ 'v292Dfix590Off': '1',
      'v292Dfix599_gate': JSON.stringify({ reason: 'needs-pull', since: Date.now() }),
      'v292Dfix590_pending': JSON.stringify({ v: 3, spec: 'sha256-utf8-v1', op: 'put',
        commitOpId: 'op_x', payloadHash: 'a'.repeat(64), status: 'awaiting-result',
        createdAt: Date.now() }) }).__v292Dfix590;
    const roff2 = await Loff2.notePut({ pkg: PKG2, baseRev: 10, op: 'put', identity: 'pass:abc' });
    ok('★★★pending も関門も残っていても、OFF なら送信をブロックしない（緊急停止が効く）',
       roff2.blocked !== true && roff2.code === 'off', roff2);
  }
  /* ★fix599: 関門が開いている間は通常putを止め、明示的な forceput だけ通す */
  {
    const L = mk({ 'v292Dfix599_gate': JSON.stringify({ reason: 'needs-pull', since: Date.now() }) }).__v292Dfix590;
    const rp = await L.notePut({ pkg: PKG, baseRev: 10, op: 'put', identity: 'pass:abc' });
    ok('★★関門が開いていれば通常putを止める',
       rp.ok === false && rp.blocked === true && rp.code === 'resolution-required', rp);
    ok('★★止めた理由と選べる決着手段を返す',
       !!rp.gate && rp.gate.reason === 'needs-pull' &&
       JSON.stringify(rp.gate.choices) === JSON.stringify(['adopt-remote']), rp.gate);
    const rf = await L.notePut({ pkg: PKG, baseRev: 10, op: 'forceput', identity: 'pass:abc' });
    ok('★★ユーザーが明示した forceput だけは通す（永久に詰まらせない）',
       rf.ok === true && rf.op === 'forceput', rf);
    ok('★★関門は正式pullの収束か三者一致でしか閉じない（forceput では閉じない）',
       L.gateState() !== null && L.gateState().reason === 'needs-pull', L.gateState());
  }
}

console.log('\n== (11) ★home.html への配線 ==');
{
  ok('★★forceput にも commitOpId を付ける（GPT指定1）',
     /op:'forceput'[\s\S]{0,1600}body596\.commitOpId = pr596\.commitOpId/.test(HOME));
  ok('★★forceput でも未解決 pending なら中止', /errorCode:'pending-commit-unresolved'/.test(HOME));
  ok('★★forceput の応答も noteResult に検証させる', /L596\.noteResult\(\{ rev: res596\.rev, source:'home:forceput', response: res596 \}\)/.test(HOME));
  ok('★★pull 収束時に pending を用済みにする（詰まらせない）',
     /typeof L590\.hasAwaiting === 'function' && L590\.hasAwaiting\(\)[\s\S]{0,2000}spFn\(\{ remoteRev: \+serverRev \|\| 0, proof: proof/.test(HOME));
  /* ★★fix597 D3 / fix599: 解放には**収束証明**を渡す。
     「remote を完全採用したか」を呼出側が申告してはいけない（未同期の変更を失う）。 */
  ok('★★解放には収束証明そのものを渡す', /spFn\(\{ remoteRev: \+serverRev \|\| 0, proof: proof, ns: nsNow597 \}\)/.test(HOME));
  ok('★★fullyAdoptedRemote は呼出側から渡さない（証明の側で導出させる）',
     (HOME.match(/spFn\(\{[^}]*\}\)/g) || []).length === 1 &&
     !/spFn\(\{[^}]*fullyAdoptedRemote[^}]*\}\)/.test(HOME),
     (HOME.match(/spFn\(\{[^}]*\}\)/g) || []));
  ok('★★ns指紋の計算を待ってから解放判定する（同期版だと identity 未確定になる）',
     /typeof L590\.supersedeByPullAsync === 'function'/.test(HOME));
  ok('★home.html に fix590 が積んである', HOME.indexOf('v292Dfix590-commit-ledger.js') > 0);
}

console.log('\n== (13) ★★★時刻で hash がぶれない（実機で踏んだ） ==');
{
  /* ★★2026-07-27 の実機で踏んだ。collectLight は `updatedAt: ts` を埋めるので、
     照合のときに**現在時刻で作り直すと、中身が1バイトも変わっていなくても hash が必ず変わる**。
     その結果 last-sent-vs-current-mismatch が常に成立し、
     三者一致（＝この仕組みの目的そのもの）が**永久に成立しない**状態だった。
     送ったときの ts を台帳に控え、照合ではその ts で作り直す。 */
  const L = mk().__v292Dfix590;
  const TS = 1785140000000;
  const pkgAt = t => ({ schema:1, updatedAt:t, device:'PC', activeSlot:'smA', ls:{ 'chr6_slot_smA':'x' } });
  const r = await L.notePut({ pkg: pkgAt(TS), baseRev: 10, op:'put', pkgTs: TS, identity:'pass:abc' });
  ok('★★台帳に pkgTs を控えている', L.pendingCommit().pkgTs === TS, L.pendingCommit());

  const sameTs   = await L.payloadHash(pkgAt(TS));
  const otherTs  = await L.payloadHash(pkgAt(TS + 60000));
  ok('★★同じ ts で作り直せば同じ hash になる（中身が同じなら一致する）', sameTs === r.payloadHash);
  ok('★★ts が違うだけで hash は変わる（＝現在時刻で作ると必ず外れる）', otherTs !== r.payloadHash);

  /* 中身が同じなら三者一致が成立することを、実際に classify で確かめる */
  const v = await L.classify({
    remote: { rev: 11, packageHash: r.payloadHash, lastCommitOpId: r.commitOpId, hashAlg: 'sha256-utf8-v1' },
    appliedRev: 10, identity: 'pass:abc', currentHash: sameTs });
  ok('★★★中身が同じなら commit-confirmed になる（仕組みが機能する）', v.status === 'commit-confirmed', v);

  /* 中身が本当に変わったときはちゃんと外れる */
  const changed = await L.payloadHash({ schema:1, updatedAt:TS, device:'PC', activeSlot:'smA', ls:{ 'chr6_slot_smA':'y' } });
  const v2 = await L.classify({
    remote: { rev: 11, packageHash: r.payloadHash, lastCommitOpId: r.commitOpId, hashAlg: 'sha256-utf8-v1' },
    appliedRev: 10, identity: 'pass:abc', currentHash: changed });
  ok('★★中身が変わっていれば rebase しない',
     v2.canAdvanceAppliedRev === false && v2.status === 'commit-confirmed-local-diverged' &&
     v2.conflictState === 'local-diverged-after-commit', v2);

  /* 配線側 */
  ok('★★push が pkgTs を渡している', /op: 'put', pkgTs: ts,/.test(SRC399));
  ok('★★照合は「送ったときの ts」で作り直す',
     /currentLocalPackageHash\(ctx\.pendingAtStart && ctx\.pendingAtStart\.pkgTs\)/.test(SRC399));
  ok('★★currentLocalPackageHash が ts を受け取れる', /function currentLocalPackageHash\(ts\)/.test(SRC399));
  ok('★forceput も pkgTs を渡している', /pkgTs: \(pkg && pkg\.updatedAt\) \|\| null,/.test(HOME));
}

console.log('\n== (14) ★★★キャッシュ破棄(?cb=)を上げ忘れていない（実機で踏んだ） ==');
{
  /* ★★2026-07-27 の実機で踏んだ。BUILT と version.txt は上げたのに、
     変更した .js の `?cb=` を上げ忘れた。その結果、**新しい版を出したのに
     ブラウザは古い .js を使い続け**、直したはずの不具合がそのまま残った。
     見た目の版番号だけが新しくなるので、直っていないことに気づきにくい。
     ★fix596 で中身を変えたファイルは、cb がいまのBUILTのfix札と一致していなければならない。 */
  const built = read('version.txt').trim();
  const token = (built.match(/-(fix[\w]+)$/) || [])[1];
  ok('★version.txt から fix札を取り出せた', !!token, built);
  const idx = read('index.html');
  for (const f of ['v292Dfix590-commit-ledger.js', 'v292Dfix399-cloudsync.js']){
    const cb = (idx.match(new RegExp(f.replace(/\./g, '\\.') + '\\?cb=v292D(\\w+)')) || [])[1];
    ok('★★' + f + ' の cb がいまのBUILTと一致（上げ忘れていない）', cb === token, { cb, token });
  }
  const cbHome = (HOME.match(/v292Dfix590-commit-ledger\.js\?cb=v292D(\w+)/) || [])[1];
  ok('★★home.html 側の cb も一致', cbHome === token, { cbHome, token });
  ok('★BUILT と HOME_BUILT と version.txt が同値', (() => {
    const b = (idx.match(/var BUILT = '([^']+)'/) || [])[1];
    const hb = (HOME.match(/HOME_BUILT = '([^']+)'/) || [])[1];
    return b === built && hb === built;
  })(), { built });
}

console.log('\n== (15) ★★★identity は安定した値から作る（実機で踏んだ） ==');
{
  /* ★★2026-07-27 の実機で踏んだ。保留を作ったときは合言葉から、照合のときは Google トークンから
     identity を作ったため identity-mismatch になり、**自分の保留を自分で解決できなくなった**。
     Google トークンは期限切れで消えるので、同じ端末・同じ人でも時間で種別が変わる。
     → サーバが返す ns（アカウントの名前空間）を基準にする。 */
  /* ★fix597: ns 由来の identity は SHA-256 指紋になり、指紋の計算が済むまで確定できない。
     同期版 identityOf は「未確定 = null」を返すので、**両辺 null で偽の合格**にならないよう
     identityOfAsync（指紋を計算してから返す）で比べ、値が実在することも確かめる。 */
  {
    const w = mk(); const L = w.__v292Dfix590;
    const a = await L.identityOfAsync({ ns: 'ns_abc', identity: 'pass-value', identityKind: 'pass' });
    const b = await L.identityOfAsync({ ns: 'ns_abc', identity: 'まったく別のトークン', identityKind: 'google' });
    ok('★★ns があれば ns から作る（認証の種別が変わっても同じ identity）',
       typeof a === 'string' && /^id_ns_[0-9a-f]{64}$/.test(a) && a === b, { a, b });
    ok('★★生の ns は localStorage に置かない（指紋だけ）',
       JSON.stringify(w.__store).indexOf('ns_abc') < 0 &&
       /^[0-9a-f]{64}$/.test(w.__store['v292Dfix597_nsfp'] || ''), w.__store);
  }
  {
    /* ★別インスタンスで作らないと、片方が「未確定=null」になって null===null の偽合格になる */
    const x = await mk().__v292Dfix590.identityOfAsync({ ns: 'ns_abc' });
    const y = await mk().__v292Dfix590.identityOfAsync({ ns: 'ns_xyz' });
    ok('★ns が違えば別の identity',
       /^id_ns_[0-9a-f]{64}$/.test(x || '') && /^id_ns_[0-9a-f]{64}$/.test(y || '') && x !== y, { x, y });
  }
  {
    const L = mk().__v292Dfix590;   /* ns をまだ一度も学んでいない台帳 */
    ok('★ns が無ければ従来どおりヘッダから作る',
       L.identityOf({ identity: 'abc', identityKind: 'pass' }) === L.identityKey('abc', 'pass') &&
       !!L.identityKey('abc', 'pass'));
    ok('★何も無ければ null', L.identityOf({}) === null);
  }

  /* 保留を作ったあと、認証の種別が変わっても自分の保留として扱える */
  const L2 = mk().__v292Dfix590;
  const r = await L2.notePut({ pkg: PKG, baseRev: 10, op:'put', pkgTs: 1, ns: 'ns_abc',
                               identity: 'pass-value', identityKind: 'pass' });
  const v = await L2.classify({
    remote: { rev: 11, packageHash: r.payloadHash, lastCommitOpId: r.commitOpId, hashAlg: 'sha256-utf8-v1' },
    appliedRev: 10, ns: 'ns_abc', identity: 'googleトークンに変わった', identityKind: 'google',
    currentHash: r.payloadHash });
  ok('★★★トークンが変わっても自分の保留として解決できる', v.status === 'commit-confirmed', v);
}

console.log('\n== (16) ★★★別アカウントの保留で自分の保存を止めない ==');
{
  /* ★これが無いと「未解決の保留がある間は送らない」規則が、
     別の人の残した保留で**自分が永久に保存できない**状態に化ける。 */
  const L = mk().__v292Dfix590;
  await L.notePut({ pkg: PKG, baseRev: 10, op:'put', ns: 'ns_ほかの人' });
  ok('★保留がある', L.hasAwaiting() === true);
  const r = await L.notePut({ pkg: PKG2, baseRev: 11, op:'put', ns: 'ns_わたし' });
  ok('★★★別アカウントの保留なら先へ進む（自分の保存を永久に止めない）', r.ok === true && r.blocked !== true, r);
  /* ★★fix597(GPT裁定D2): 別アカウントの pending は**捨てずに隔離する**。
     捨てると、そのアカウントへ戻ったときに「応答喪失commitの証拠」を失う。 */
  ok('★隔離したことを数えている', L.stats().foreignPendingQuarantined === 1, L.stats());
  ok('★台帳は自分のものに置き換わる', L.pendingCommit().commitOpId === r.commitOpId);
  ok('★★証拠は捨てずに隔離領域へ退避している（commitOpId と payloadHash が残る）', (() => {
    const f = L.foreignPendings();
    return f.length === 1 && !!f[0].commitOpId && f[0].commitOpId !== r.commitOpId &&
           /^[0-9a-f]{64}$/.test(f[0].payloadHash || '');
  })(), L.foreignPendings());
  ok('★★隔離側にも生の ns を残さない（identityTag は指紋）',
     JSON.stringify(L.foreignPendings()).indexOf('ns_ほかの人') < 0, L.foreignPendings());

  /* 同じアカウントならちゃんと止める（本来の目的は失わない） */
  const L2 = mk().__v292Dfix590;
  await L2.notePut({ pkg: PKG, baseRev: 10, op:'put', ns: 'ns_わたし' });
  const r2 = await L2.notePut({ pkg: PKG2, baseRev: 11, op:'put', ns: 'ns_わたし' });
  ok('★★同じアカウントなら止める', r2.blocked === true, r2);
}

console.log('\n== (17) ★ns を覚える配線 ==');
{
  ok('★★put の応答から ns を覚える', /rememberNs\(j\);\s+\/\* ★fix596c/.test(SRC399));
  /* ★★fix598: commitstate の ns は「いま読んだ canonical と同じ応答」から来るので最も強い。
     照合(classify)へ入る前に必ず覚えていること、を固定する。 */
  {
    const rc = SRC399.slice(SRC399.indexOf('var j = r.json;'), SRC399.indexOf('return led.classify({\n'));
    ok('★★commitstate の応答からも覚える（照合に入る前に）',
       rc.length > 0 && /rememberNs\(j\);/.test(rc), rc.length);
  }
  ok('★★台帳へ ns を渡している', /ns: ia\.ns, identity: ia\.identity/.test(SRC399));
  ok('★★照合でも ns を渡している（commitstate の ns を最優先、無ければ meta 由来へ落とす）',
     /ns: \(j\.ns \? String\(j\.ns\) : identityArgs\(\)\.ns\)/.test(SRC399));
  ok('★home の forceput も ns を渡している', /ns: ns596,/.test(HOME));
}

console.log('\n== (12) ★退行防止 ==');
{
  ok('★★payloadString は Worker と同じ規則（idbを除いて JSON.stringify）',
     /for \(var k in pkg\)\{ if \(k !== 'idb'/.test(SRC) && /return JSON\.stringify\(light\)/.test(SRC));
  ok('★hash仕様名を変えていない', /var HASH_SPEC = 'sha256-utf8-v1';/.test(SRC));
  ok('★fix593 の pull収束証明が残っている', /function provePullConvergence/.test(SRC));
  ok('★fix593 の promoteSharedRev が残っている', /function promoteSharedRev/.test(SRC));
  ok('★旧 reconcile() の口も残している（fix593の呼び出し側が使う）', /function reconcile\(o\)\{|function reconcile\(o\) \{/.test(SRC));
  ok('★★サーバに commitOpId を作らせない（クライアントでだけ発行）',
     /function newCommitOpId\(\)/.test(SRC));
  ok('★配線済みを表明している', /wiredIntoRecovery: true/.test(SRC));
}

console.log('\n---------------------------------------------');
console.log('test_fix596: 合格 ' + pass + ' / 失敗 ' + fail);
console.log('pass=' + pass + ' fail=' + fail);
if (fail) process.exitCode = 1;
})();
