/* 回帰テスト: Worker v25 — commitstate / packageHash / commitOpId
 *
 * ★なぜ必要か
 *   クライアントは put の応答を取り逃すことがある（離脱・通信断）。そのとき
 *   「サーバは受け取ったのか」が分からず、rev が食い違ったまま fork し続けて
 *   **保存できなくなる**（2026-07-27 に実際に起きた 429/430 デッドロック）。
 *   サーバが「canonical に入っている中身の hash」と「最後に成功した commit の op id」を
 *   返せれば、クライアントは自分が送ったものと突き合わせて自力で判断できる。
 *
 * ★GPT裁定（2026-07-27）で決めた、破ってはいけない約束
 *   W1 既存 op:'meta' の応答を**変えない**（旧クライアントが読む）
 *   W2 ルートJSONは**追加のみ**。既存キー・型・HTTP status を変えない
 *   W3 op:'meta' を拡張せず、**専用の op:'commitstate'** を足す
 *   W4 packageHash の入力は「**実際に D1 の blob 列へ保存する文字列**」＝ JSON.stringify(light)
 *   W5 canonical への書込みは blob と hash/opId を**同じSQL**で行う（途中で落ちても食い違わない）
 *   W6 fork 経路は canonical 側の rev/hash/opId を**変更しない**
 *   W7 commitOpId が来なければ null のまま。**サーバが架空のIDを発行しない**
 *   W8 getraw は追加しない
 *   W9 capabilities は実装完了後にだけ立てる
 *
 * ★このテストは Cloudflare 環境なしで走る。ソースの静的検査＋
 *   取り出した純粋関数（sha256Utf8v1 / tombstoneOfSlot）の実挙動で固定する。
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const crypto = require('crypto');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };

const CANDIDATES = ['chronicle-proxy-v25_commitstate.js', 'worker/chronicle-proxy-v25_commitstate.js'];
const SRC_PATH = CANDIDATES.map(f => path.join(__dirname, f)).find(p => fs.existsSync(p));
if (!SRC_PATH){ console.log('  FAIL  Worker v25 配布物が見つからない >> ' + CANDIDATES.join(' / '));
                console.log('pass=0 fail=1'); process.exit(1); }
const SRC = fs.readFileSync(SRC_PATH, 'utf8');
const V24_PATH = ['chronicle-proxy-v24_tombstone.js', 'worker/chronicle-proxy-v24_tombstone.js']
  .map(f => path.join(__dirname, f)).find(p => fs.existsSync(p));

(async () => {

console.log('\n== (1) ★★W4: packageHash の仕様が sha256-utf8-v1 で、入力が blob 列の文字列 ==');
{
  ok("★規格名を1か所で定義している", /const HASH_ALG_V25 = 'sha256-utf8-v1';/.test(SRC));
  ok('★SHA-256 を使っている', /crypto\.subtle\.digest\('SHA-256'/.test(SRC));
  ok('★UTF-8 で符号化している', /new TextEncoder\(\)\.encode/.test(SRC));
  ok('★小文字16進（padStart(2,"0") で桁落ちしない）', /toString\(16\)\.padStart\(2, '0'\)/.test(SRC));
  ok('★★hash の入力が str（＝blob列へ入る文字列）である',
     /const str = JSON\.stringify\(light\);[\s\S]{0,400}await sha256Utf8v1\(str\)/.test(SRC));
  ok('★★リクエストの生 pkg を hash していない（idb を含んだまま計算しない）',
     !/sha256Utf8v1\(\s*JSON\.stringify\(pkg\)\s*\)/.test(SRC) && !/sha256Utf8v1\(pkg\)/.test(SRC));
}

console.log('\n== (2) ★実際に hash 関数を動かして、node の crypto と一致することを確かめる ==');
{
  /* ソースから関数だけ取り出して、WebCrypto を持つ文脈で走らせる */
  const i = SRC.indexOf('async function sha256Utf8v1');
  const j = SRC.indexOf('\n}', i) + 2;
  const ctx = vm.createContext({ crypto: require('crypto').webcrypto, TextEncoder, Uint8Array });
  vm.runInContext(SRC.slice(i, j) + '\nthis.__f = sha256Utf8v1;', ctx, { filename: 'v25-hash.js' });
  const f = ctx.__f;
  const cases = ['', '{"a":1}', 'こんにちは', JSON.stringify({ ls: { 'chr6_slots_meta': '[{"id":"smA","deleted":true}]' } })];
  for (const c of cases){
    const mine = await f(c);
    const want = crypto.createHash('sha256').update(Buffer.from(c, 'utf8')).digest('hex');
    ok('★hash一致 (' + (c.length ? c.slice(0, 18) : '空文字') + ')', mine === want, { mine, want });
  }
  ok('★★64字の小文字16進である', /^[0-9a-f]{64}$/.test(await f('x')));
  ok('★★空文字でも定義どおり（既知のSHA-256）',
     (await f('')) === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
}

console.log('\n== (3) ★★W3: 専用 op:commitstate（meta を拡張していない） ==');
{
  ok('★★op:commitstate がある', /if \(op === 'commitstate'\)/.test(SRC));
  ok('★rev / packageHash / lastCommitOpId / hashAlg を返す',
     /packageHash: ph/.test(SRC) && /lastCommitOpId: row\.last_commit_op_id/.test(SRC) && /hashAlg: alg \|\| HASH_ALG_V25/.test(SRC));
  ok('★slotId を渡すと墓標の中身を返す', /if \(slotId\) out\.tombstone = tombstoneOfSlot\(row\.blob, slotId\);/.test(SRC));
  ok('★★D1が無いときは嘘のrev 0 を返さず unsupported で断る',
     /commitstate requires D1[\s\S]{0,120}501/.test(SRC));
  ok('★★読取専用（commitstate の中で saves を UPDATE/INSERT しない）', (() => {
    const i = SRC.indexOf("if (op === 'commitstate')");
    const body = SRC.slice(i, SRC.indexOf("if (op === 'get' || op === 'getfork')", i));
    return !/UPDATE saves|INSERT INTO saves|INSERT OR IGNORE INTO saves/.test(body);
  })());
  ok('★unknown op の案内に commitstate が入っている', /get\|put\|forceput\|meta\|commitstate\|/.test(SRC));
}

console.log('\n== (4) ★★W1: op:meta の応答を1バイトも変えていない ==');
{
  /* ★次の `if (op === '` まで取ると、v25で足した commitstate の**説明コメント**まで拾ってしまい
     「metaを変えた」と誤検出する（実際に一度踏んだ）。meta ブロックの閉じ括弧までで切る。 */
  const grab = (src) => {
    const i = src.indexOf("if (op === 'meta')");
    if (i < 0) return null;
    const end = src.indexOf('\n    }\n', i);
    return end < 0 ? null : src.slice(i, end + 6);
  };
  const now = grab(SRC);
  ok('★meta ブロックを取り出せた', !!now);
  ok("★★v17 のままで、rev/ns/d1 以外を足していない",
     /return json\(\{ ok: true, meta, rev: meta \? \(\+meta\.rev \|\| 0\) : 0, ns, v: 17, d1: !!d1, requestId \}, 200, request\);/.test(now || ''));
  ok('★★meta 応答に packageHash を混ぜていない（旧クライアント互換）', !/packageHash/.test(now || ''));
  if (V24_PATH){
    const before = grab(fs.readFileSync(V24_PATH, 'utf8'));
    ok('★★★v24 の meta ブロックと完全一致（差分ゼロ）', before === now,
       before === now ? undefined : { v24: (before || '').length, v25: (now || '').length });
  }
}

console.log('\n== (5) ★★W2: ルートJSONは追加のみ ==');
{
  const grab = (src) => {
    const i = src.indexOf("service: 'chronicle-proxy'");
    return i < 0 ? null : src.slice(src.lastIndexOf('return json(', i), src.indexOf('200, request);', i));
  };
  const now = grab(SRC);
  ok('★tombstoneGuard:true を出している', /tombstoneGuard: true/.test(now || ''));
  ok('★workerBuild を出している', /workerBuild: 'v25'/.test(now || ''));
  ok('★capabilities を出している', /capabilities: \{[^}]*commitState: 1/.test(now || ''));
  ok('★★既存キーを消していない', ['v: 28', 'freeFallback: true', 'd1: !!env.DB', 'ledger: !!env.LEDGER',
      'google: !!env.GOOGLE_CLIENT_ID', 'img: true', 'inspect: true', 'lora420: true']
      .every(k => (now || '').indexOf(k) >= 0));
  ok('★★v:28 の値を変えていない（クライアントの対応検知が壊れる）', /v: 28,/.test(now || ''));
  ok('★HTTP status は 200 のまま', /\}, 200, request\);/.test(SRC.slice(SRC.indexOf("service: 'chronicle-proxy'"), SRC.indexOf("service: 'chronicle-proxy'") + 1400)));
}

console.log('\n== (6) ★★W5/W6/W7: canonical への保存と fork の切り分け ==');
{
  /* canonical へ書く4経路すべてで hash/opId を同じSQLに載せている */
  const upds = SRC.match(/UPDATE saves SET rev=rev\+1[^']*/g) || [];
  ok('★canonical UPDATE は2本ある（put と forceput）', upds.length === 2, upds.length);
  ok('★★どちらの UPDATE も package_hash/last_commit_op_id/hash_alg を同じ文で更新する',
     upds.every(u => /package_hash=\?/.test(u) && /last_commit_op_id=\?/.test(u) && /hash_alg=\?/.test(u)), upds);
  const inss = SRC.match(/INSERT OR IGNORE INTO saves \([^)]*\)/g) || [];
  ok('★canonical INSERT は2本ある', inss.length === 2, inss.length);
  ok('★★どちらの INSERT も3列を含む',
     inss.every(u => /package_hash/.test(u) && /last_commit_op_id/.test(u) && /hash_alg/.test(u)), inss);
  ok('★★hash と blob を別のSQLに分けていない（途中で落ちると食い違う）',
     !/UPDATE saves SET package_hash/.test(SRC));

  /* fork は canonical を触らない */
  const i = SRC.indexOf('async function saveIncomingAsFork');
  const forkBody = SRC.slice(i, SRC.indexOf('\n}\n', i));
  ok('★★fork 経路が canonical(main) を UPDATE しない', !/UPDATE saves/.test(forkBody), forkBody.length);
  /* ★fork は main を **読む**（現行revを応答に載せるため）。読むのは正しい。書かないことを見る。 */
  ok("★★fork 経路で main に触れるのは SELECT だけ（書込みが1つも無い）", (() => {
    const writes = forkBody.match(/(INSERT INTO saves|INSERT OR IGNORE INTO saves|UPDATE saves|DELETE FROM saves)[^']*/g) || [];
    return writes.length > 0 && writes.every(w => !/kind[^,]*main/.test(w)) && !/UPDATE saves/.test(forkBody);
  })(), (forkBody.match(/(INSERT INTO saves|UPDATE saves|DELETE FROM saves)[^']*/g) || []));
  ok("★fork の保存先 kind は 'fork:' で始まる", /const base = 'fork:'/.test(forkBody));

  /* commitOpId は来なければ null */
  ok('★★commitOpId が無ければ null（サーバが架空のIDを作らない）',
     /const commitOpId25 = \(body && body\.commitOpId != null && body\.commitOpId !== ''\)\s*\n?\s*\? String\(body\.commitOpId\)\.slice\(0, 128\) : null;/.test(SRC));
  ok('★★サーバ側で commitOpId を生成していない',
     !/commitOpId25 = [^;]*requestId/.test(SRC) && !/commitOpId25 = [^;]*Date\.now/.test(SRC));
}

console.log('\n== (7) ★列は nullable な ALTER（既存データを書き換えない） ==');
{
  for (const c of ['package_hash TEXT', 'last_commit_op_id TEXT', 'hash_alg TEXT']){
    ok('★ALTER で ' + c.split(' ')[0] + ' を足す', new RegExp('ALTER TABLE saves ADD COLUMN ' + c).test(SRC));
  }
  ok('★★NOT NULL を付けていない（既存行が入らなくなる）',
     !/ADD COLUMN (package_hash|last_commit_op_id|hash_alg) TEXT NOT NULL/.test(SRC));
  ok('★★既存行を一括UPDATEしていない（旧データを黙って書き換えない）',
     !/UPDATE saves SET package_hash=[^?]/.test(SRC));
  ok('★v25以前の行は読むときにその場で計算する（DBへは書き戻さない）',
     /if \(!ph && row\.blob\) \{ ph = await sha256Utf8v1\(String\(row\.blob\)\); alg = HASH_ALG_V25; computed = true; \}/.test(SRC));
  ok('★計算して返したことを応答で明示する', /hashComputedOnRead: computed/.test(SRC));
}

console.log('\n== (8) ★★W8: getraw を足していない ==');
{
  ok("★★op:'getraw' が存在しない", SRC.indexOf("'getraw'") < 0 && SRC.indexOf('"getraw"') < 0);
}

console.log('\n== (9) ★tombstoneOfSlot を実際に動かす ==');
{
  const i = SRC.indexOf('function tombstoneOfSlot');
  const j = SRC.indexOf('\n}', SRC.indexOf('catch (e) { return null; }', i)) + 2;
  const ctx = vm.createContext({ JSON, String, Array });
  vm.runInContext(SRC.slice(i, j) + '\nthis.__t = tombstoneOfSlot;', ctx, { filename: 'v25-tomb.js' });
  const t = ctx.__t;
  const blob = JSON.stringify({ ls: { 'chr6_slots_meta': JSON.stringify([
    { id: 'smAlive', name: '生きている物語' },
    { id: 'smDead', deleted: true, deleteOpId: 'del_smDead_1', lifecycleVersion: 1, recoverySnapshotId: 'chr6_snap_1' }
  ]) } });
  const dead = t(blob, 'smDead');
  ok('★★墓標を取り出せる', !!dead && dead.deleted === true, dead);
  ok('★deleteOpId も返す', dead && dead.deleteOpId === 'del_smDead_1');
  ok('★recoverySnapshotId も返す', dead && dead.recoverySnapshotId === 'chr6_snap_1');
  const alive = t(blob, 'smAlive');
  ok('★★生きている物語は deleted:false（勝手に消えたことにしない）', !!alive && alive.deleted === false, alive);
  ok('★居ないスロットは null', t(blob, 'smNope') === null);
  ok('★★部分一致では拾わない（idの完全一致だけ）', t(blob, 'smDea') === null);
  ok('★壊れたblobでも例外を投げず null', t('{壊れ', 'smDead') === null && t(null, 'smDead') === null);
  ok('★slotId が無ければ null', t(blob, null) === null);
}

console.log('\n== (10) ★退行防止: v24 で入れた最終防御が残っている ==');
{
  ok('★★baseRevなし＋墓標ありは今も fork へ回す',
     /if \(op === 'put' && !hasBase && cur && blobHasTombstone\(cur\.blob\)\)/.test(SRC));
  ok('★★baseRev 不一致の fork も残っている',
     /if \(op === 'put' && hasBase && cur && baseRev !== curRev\)/.test(SRC));
  ok('★blobHasTombstone の二重エンコード対策が残っている', /s\.indexOf\('deleted'\)/.test(SRC));
}

console.log('\n---------------------------------------------');
console.log('test_fix596_worker: 合格 ' + pass + ' / 失敗 ' + fail);
console.log('pass=' + pass + ' fail=' + fail);
if (fail) process.exitCode = 1;
})();
