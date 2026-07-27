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

console.log('\n== (11) ★★v25c: 冪等リクエストhash は 型付きJSON配列＋SHA-256 ==');
{
  /* ★なぜ必要か(1): 旧 idemReqHash(op, str) は commitOpId と baseRev を無視する。
     同じ mid で「commitOpId=A/baseRev=430/pkg=P」と「commitOpId=B/baseRev=431/pkg=P」が届くと
     同一要求と誤認され、**canonicalへ入っていない commit を成功扱いにしてしまう**。
     ★なぜ必要か(2): v25b で書いた「null を文字列 'null' へ落とすので衝突しない」は**成立していなかった**。
     null と文字列 "null" が同じ文字列になる（GPT指摘。私の誤り）。型を保った JSON なら別になる。
     ★なぜ必要か(3): smallHash は非暗号学的な短いhash。冪等判定で衝突すると
     **別リクエストへ古い成功応答を返す**事故になるので、ここは SHA-256 全長を使う。 */
  ok('★★v2 関数がある', /async function idemReqHashV2\(o\)/.test(SRC));
  ok('★★型を保ったまま JSON.stringify している（null と "null" が別になる）',
     /const canon = JSON\.stringify\(\[/.test(SRC) &&
     /\(o\.baseRev == null \? null : Number\(o\.baseRev\)\)/.test(SRC) &&
     /\(o\.commitOpId == null \? null : String\(o\.commitOpId\)\)/.test(SRC));
  ok('★★payload は SHA-256 全長（smallHash を使っていない）',
     /await sha256Utf8v1\(o\.payloadStr == null \? '' : String\(o\.payloadStr\)\)/.test(SRC) &&
     !/smallHash\(String\(o\.payloadStr/.test(SRC));
  ok('★★最終出力も SHA-256', /return 'idem-v2:' \+ await sha256Utf8v1\(canon\);/.test(SRC));
  ok("★規格名を先頭に入れている（旧hashと混ざらない）", /'idem-v2',/.test(SRC));
  ok('★★put は既に計算済みの pkgHash25 を渡す（二重hashしない）',
     /idemReqHashV2\(\{ op: op, kind: 'main', baseRev: \(hasBase \? baseRev : null\), commitOpId: commitOpId25, payloadHash: pkgHash25 \}\)/.test(SRC));
  ok('★putimg も v2 で予約する', /idemReqHashV2\(\{ op: 'putimg', kind: k/.test(SRC));
  ok('★★★v1 fallback は commitOpId が無い要求だけに限る（GPT指摘2）',
     /\(commitOpId25 == null \? idemReqHashV1\(op, str\) : null\)/.test(SRC));
  ok('★旧v1は照合専用として残す（デプロイ直後24hの再送を409にしない）',
     /function idemReqHashV1\(op, payloadStr\)/.test(SRC) &&
     /const matches = \(rh === String\(reqHash\)\) \|\| \(legacyHash != null && rh === String\(legacyHash\)\);/.test(SRC));
  ok('★★書き込むのは常に v2（INSERT に渡すのは reqHash）',
     /INSERT INTO idem2 \(u,mid,op,reqHash,status,ts\)[\s\S]{0,140}\.bind\(user, mid, op, reqHash, now\)/.test(SRC));
  ok('★★旧 idemReqHash( を新規呼び出しで使っていない',
     !/[^12]idemReqHash\(/.test(SRC.replace(/\/\/[^\n]*/g, '')));

  /* 実際に動かす。★hash関数は本物（node crypto と一致することは (2) で確認済み） */
  const i = SRC.indexOf('async function idemReqHashV2');
  const j = SRC.indexOf('\n}', i) + 2;
  const hi = SRC.indexOf('async function sha256Utf8v1');
  const hj = SRC.indexOf('\n}', hi) + 2;
  const ctx = vm.createContext({ crypto: require('crypto').webcrypto, TextEncoder, Uint8Array, JSON, String, Number, Object });
  vm.runInContext(SRC.slice(hi, hj) + '\n' + SRC.slice(i, j) + '\nthis.__h = idemReqHashV2;', ctx, { filename: 'v25-idem.js' });
  const h = ctx.__h;
  const base = { op: 'put', kind: 'main', baseRev: 430, commitOpId: 'A', payloadStr: 'P' };
  const v = async (o) => await h(Object.assign({}, base, o));
  ok('★★baseRev が違えば別hash', (await v({})) !== (await v({ baseRev: 431 })));
  ok('★★commitOpId が違えば別hash', (await v({})) !== (await v({ commitOpId: 'B' })));
  ok('★★中身が違えば別hash', (await v({})) !== (await v({ payloadStr: 'Q' })));
  ok('★★kind が違えば別hash', (await v({})) !== (await v({ kind: 'other' })));
  ok('★同一なら同一hash（再送は再送として扱える）', (await v({})) === (await v({})));
  ok('★★★null と 文字列 "null" が別hash（v25b で私が間違えた点）',
     (await v({ commitOpId: null })) !== (await v({ commitOpId: 'null' })));
  ok('★★null と 空文字も別hash', (await v({ commitOpId: null })) !== (await v({ commitOpId: '' })));
  ok('★★数値 430 と 文字列 "430" が同一に潰れる（Number化しているので意図どおり）',
     (await v({ baseRev: 430 })) === (await v({ baseRev: '430' })));
  ok('★★baseRev 0 と null が別hash', (await v({ baseRev: 0 })) !== (await v({ baseRev: null })));
  ok('★出力の形が想定どおり', /^idem-v2:[0-9a-f]{64}$/.test(await v({})));
}

console.log('\n== (12) ★★v25c: forceput の墓標保護は fail-closed ==');
{
  /* ★なぜ必要か: v24 の防御は baseRevなしput にしか効かない。forceput は baseRev を見ない。
     ★v25b では「incoming に meta が無ければ止めない(fail-open)」にしていたが、GPT に差し戻された。
     canonical に墓標があるのに incoming に meta が無い forceput は、**墓標を丸ごと消す内容**そのもの。 */
  ok('★★判定関数がある', /function tombstoneGuardForceput\(curBlob, incomingStr, restoreOfDeleteOpId\)/.test(SRC));
  ok('★★v25b の fail-open 版は残っていない', SRC.indexOf('function tombstonesClearedBy') < 0);
  ok('★★forceput の本処理より前で判定している',
     SRC.indexOf('tombstoneGuardForceput(cur.blob, str') < SRC.indexOf("if (op === 'forceput') {\n          // ★v17(1)"));
  ok('★★拒否コードが原因ごとに分かれている（追える）',
     /'tombstone-clear-refused'/.test(SRC) && /'incoming-meta-missing'/.test(SRC) && /'canonical-unreadable'/.test(SRC));
  ok('★★409 で返す', /errorCode: g25\.code, retryable: false[\s\S]{0,160}\}, 409, request\)/.test(SRC));
  ok('★★どのスロットで止めたかを返す', /tombstones: \(g25\.cleared \|\| \[\]\)\.slice\(0, 20\)/.test(SRC));
  ok('★★拒否時に idem 予約を解放する（同じmidで上げ直せる）',
     /const g25 = tombstoneGuardForceput[\s\S]{0,240}idemRelease\(env, __idemU, __idemMid\)/.test(SRC));
  ok('★★マージではなく拒否（サーバがpayloadを書き換えるとhashが永久に一致しない）',
     !/incoming\['chr6_slots_meta'\] =/.test(SRC) && !/mergeMeta/.test(SRC));

  /* 実際に判定を動かす */
  const i = SRC.indexOf('function sameTombField');
  const j = SRC.indexOf('\n}', SRC.indexOf('return { ok: true };\n}', i)) + 2;
  const ctx = vm.createContext({ JSON, String, Array, Object });
  const mi = SRC.indexOf('function metaOfBlob');
  const mj = SRC.indexOf('\n}', SRC.indexOf('catch (e) { return null; }', mi)) + 2;
  vm.runInContext(SRC.slice(mi, mj) + '\n' + SRC.slice(i, j) + '\nthis.__g = tombstoneGuardForceput;', ctx, { filename: 'v25-forceput.js' });
  const g = ctx.__g;
  const mk = (meta) => JSON.stringify({ ls: { 'chr6_slots_meta': JSON.stringify(meta) } });
  const TOMB = { id: 'smDead', deleted: true, deleteOpId: 'd1', lifecycleVersion: 1, recoverySnapshotId: 'snap1' };
  const canonical = mk([{ id: 'smAlive', name: '生きている' }, TOMB]);

  ok('★★墓標を live に戻す incoming は止める',
     g(canonical, mk([{ id: 'smAlive' }, { id: 'smDead', name: '復活' }])).code === 'tombstone-clear-refused');
  ok('★★墓標ごと消した incoming も止める',
     g(canonical, mk([{ id: 'smAlive' }])).code === 'tombstone-clear-refused');
  ok('★★★incoming に meta が無ければ止める（v25b の fail-open を差し戻した点）',
     g(canonical, JSON.stringify({ ls: {} })).code === 'incoming-meta-missing');
  ok('★★★incoming が壊れていても止める',
     g(canonical, '{壊れ').code === 'incoming-meta-missing');
  ok('★★★canonical が読めないときも止める（墓標の有無を確かめられない）',
     g('{壊れ', canonical).code === 'canonical-unreadable');
  ok('★canonical が空（新規作成）は通す', g(null, canonical).ok === true);
  ok('★canonical に墓標が無ければ、incoming に meta が無くても通す（従来どおり）',
     g(mk([{ id: 'smAlive' }]), JSON.stringify({ ls: {} })).ok === true);
  ok('★★墓標を完全一致で保った incoming は通す（普通の「いま上げる」は動く）',
     g(canonical, mk([{ id: 'smAlive' }, TOMB])).ok === true);

  /* ★deleted:true だけの比較では不足（GPT指摘4）＝墓標の弱体化を拒否する */
  ok('★★deleted:true でも deleteOpId が違えば止める',
     g(canonical, mk([Object.assign({}, TOMB, { deleteOpId: 'd2' })])).code === 'tombstone-clear-refused');
  ok('★★deleted:true でも lifecycleVersion が違えば止める',
     g(canonical, mk([Object.assign({}, TOMB, { lifecycleVersion: 2 })])).code === 'tombstone-clear-refused');
  ok('★★★deleteOpId は同じでも recoverySnapshotId が欠落していれば止める（弱体化）',
     g(canonical, mk([{ id: 'smDead', deleted: true, deleteOpId: 'd1', lifecycleVersion: 1 }])).code === 'tombstone-clear-refused');

  /* ★正式restore経路 */
  ok('★★restoreOfDeleteOpId が現在の deleteOpId と一致するときだけ解除できる',
     g(canonical, mk([{ id: 'smAlive' }, { id: 'smDead', name: '復元' }]), 'd1').ok === true);
  ok('★★restoreOfDeleteOpId が違えば解除できない',
     g(canonical, mk([{ id: 'smAlive' }, { id: 'smDead', name: '復元' }]), 'dX').code === 'tombstone-clear-refused');
  ok('★★restoreOfDeleteOpId 未指定なら解除できない',
     g(canonical, mk([{ id: 'smAlive' }, { id: 'smDead', name: '復元' }]), null).code === 'tombstone-clear-refused');
  ok('★restoreOfDeleteOpId は body から渡している', /tombstoneGuardForceput\(cur\.blob, str, \(body && body\.restoreOfDeleteOpId\)\)/.test(SRC));

  ok('★★id は完全一致で照合する（部分一致で誤判定しない）',
     g(mk([TOMB]), mk([Object.assign({}, TOMB, { id: 'smDeadX' })])).cleared.join() === 'smDead');
}

console.log('\n== (13) ★★v25b: migration は single-flight（GPT デプロイ前指摘3） ==');
{
  /* ★なぜ必要か: migration の途中で commitstate に答えると、package_hash 列がまだ無い状態で
     SELECT して例外になる。1本だけ走らせ、他は同じ Promise を待つ。 */
  ok('★★同時実行を1本にまとめる仕掛けがある', /let __d1initPromise = null;/.test(SRC));
  ok('★★2本目以降は同じ Promise を待つ', /if \(__d1initPromise\) return await __d1initPromise;/.test(SRC));
  ok('★★失敗したら次のリクエストで再試行できる（nullへ戻す）', /if \(!r\) __d1initPromise = null;/.test(SRC));
  ok('★migration 本体が別関数に分かれている', /async function d1Migrate\(env\)/.test(SRC));
  ok('★★commitstate は d1Ready を通ってからでないと動かない（migration 途中に公開しない）',
     /const d1 = env\.DB \? await d1Ready\(env\) : false;[\s\S]{0,4000}if \(op === 'commitstate'\)/.test(SRC));
  /* ★★v25c(GPT指摘6/7): ALTER の catch で全エラーを握り潰すと、失敗した migration を成功と誤認する。 */
  ok('★★ALTER は addColumnIfMissing 経由（裸の try/catch で握り潰していない）',
     (SRC.match(/await addColumnIfMissing\(env, "ALTER TABLE saves ADD COLUMN (package_hash|last_commit_op_id|hash_alg) TEXT"\);/g) || []).length === 3 &&
     !/try \{ await env\.DB\.exec\("ALTER TABLE saves ADD COLUMN/.test(SRC));
  ok('★★★無視するのは「その列がもう在る」だけ。他は投げ直す',
     /if \(m\.indexOf\('duplicate column'\) >= 0 \|\| m\.indexOf\('already exists'\) >= 0\) return;/.test(SRC) &&
     /\n    throw e;\n  \}\n\}/.test(SRC));
  ok('★★★migration の結果を実際に検証する（例外が出ないことは列が在る証明にならない）',
     /async function savesHasV25Columns\(env\)/.test(SRC) &&
     /PRAGMA table_info\(saves\)/.test(SRC));
  ok('★★★3列が無ければ初期化完了にしない（503で正直に止まる）',
     /if \(!\(await savesHasV25Columns\(env\)\)\) return false;\n    __d1init = true;/.test(SRC));
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
