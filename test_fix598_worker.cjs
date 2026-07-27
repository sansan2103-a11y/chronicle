/* 回帰テスト: Worker v26 — commitstate の応答へ ns を足した（fix598）
 *
 * ★なぜ必要か
 *   クライアントは「いま保留になっている送信は**自分のもの**か」を identity で判定する。
 *   ところがヘッダ由来の identity は同じ人でも時間で変わる（Googleトークンは失効して消え、
 *   合言葉とトークンでは取得元も違う。2026-07-27 に実機で踏んだ）。
 *   サーバ側の ns（アカウントごとに安定した名前空間）を基準にすれば、この揺れが消える。
 *   v25 では ns を得るのに op:'meta' をもう1往復していた。v26 は commitstate 自身が ns を返す。
 *
 * ★GPT がデプロイ前の必須条件として挙げたもの（このテストで固定する）
 *   N1 ns の同一性 …… 同じ認証 identity なら meta.ns / commitstate.ns / put応答.ns が一致する
 *   N2 commitstate は KV へ1バイトも書かない（読取専用のまま）
 *   N3 salt の安定性 …… ns は秘密 salt 依存。salt の入力・導出が v24/v25/v26 で同一
 *   N4 衝突しない入力 …… ns の入力 codeKey に認証種別が含まれる（allow:<email> / code:<pass>）
 *   N5 認証済み identity からのみ生成 …… nsFor の入力は resolveUser(env, gate.codeKey)。body 由来ではない
 *   N6 op:'meta' の応答は v25 と同一
 *   N7 ルートJSONは追加のみ（v:28 不変・既存キーが1つも消えていない）
 *   N8 実コードの増加が5行以内
 *   N9 capabilities.commitState === 2 かつ クライアントの能力判定は `>=` で書く
 *
 * ★★★salt の運用前提（ここに明記して固定する）
 *   ns = SHA-256(salt + '|' + codeKey) の先頭32hex。salt は
 *     env.IMG_SALT → env.ACCESS_CODE → env.GOOGLE_CLIENT_ID → 'chronicle-img'
 *   の優先順で決まる。**salt を変えると全端末の ns が変わり、identity が総入れ替えになる**
 *   （保留中の送信の持ち主判定が全部外れ、画像の逆引き索引 imgns:<ns> も全部迷子になる）。
 *   よって IMG_SALT / ACCESS_CODE / GOOGLE_CLIENT_ID は
 *   **通常の秘密ローテーション対象にしない**。変える必要が出たら移行計画（旧saltでの再索引）とセット。
 *   このテストは「導出の式が v24/v25/v26 で1バイトも変わっていないこと」を毎回確かめる。
 *
 * ★このテストは Cloudflare 環境なしで走る。
 *   走らせられる部分（nsFor / ensureNs）は**実際に実行して**挙動で固定し、
 *   走らせられない部分（ハンドラ内の配線）は静的検査で固定する。
 *   静的検査のテスト名には「何を保証しているのか」を必ず書く。
 *
 * ★このテストを書くときに守っていること（過去に踏んだ罠）
 *   ・ブロックコメントの一括除去（正規表現）は使わない。ソース中の文字列や正規表現に
 *     コメント終端記号が入っていると、そこまで丸ごと食って**本物の宣言まで消え、誤検出する**。
 *     除くときは必ず**行単位**で。
 *   ・両辺が null だと等しくなって**偽の合格**が出る。抜き出しは先に「取れたこと」を確かめ、
 *     期待値は具体値で書く。
 *   ・`node --check` が通ることは「動く」の証明にならない。前回はデプロイ直前に
 *     TDZ（宣言より前の const 参照）と「存在しない名前を export」の2件が
 *     Cloudflare の編集画面の指摘で見つかった。その2つの回帰検査を必ず入れる。
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };

function findSrc(names){
  for (const n of names){
    for (const p of [path.join(__dirname, n), path.join(__dirname, 'worker', n)]){
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}
const V26_PATH = findSrc(['chronicle-proxy-v26_ns.js']);
const V25_PATH = findSrc(['chronicle-proxy-v25_commitstate.js']);
const V24_PATH = findSrc(['chronicle-proxy-v24_tombstone.js']);
if (!V26_PATH || !V25_PATH){
  console.log('  FAIL  Worker v26/v25 の配布物が見つからない >> ' + String(V26_PATH) + ' / ' + String(V25_PATH));
  console.log('pass=0 fail=1'); process.exit(1);
}
const SRC   = fs.readFileSync(V26_PATH, 'utf8');   // 未デプロイの v26（検査対象）
const SRC25 = fs.readFileSync(V25_PATH, 'utf8');   // 現在の本番
const SRC24 = V24_PATH ? fs.readFileSync(V24_PATH, 'utf8') : null;

/* ★行単位でコメント行だけを落とす（一括の正規表現除去はしない）。
   ここで落ちるのは「行頭が // か * か ブロックコメント開始 の行」だけ。
   コードのある行は絶対に消えない＝宣言を食い潰す事故が起きない。 */
function codeLines(src){
  return src.split('\n').filter(l => {
    const t = l.trim();
    return t && !t.startsWith('//') && !t.startsWith('*') && t.slice(0, 2) !== '/' + '*';
  });
}
const NOCOMMENT = codeLines(SRC).join('\n');

/* 関数1本をソースから切り出す（本文中に行頭 } が出ないものにだけ使う） */
function grabFn(src, head){
  const i = src.indexOf(head);
  if (i < 0) return null;
  const j = src.indexOf('\n}', i);
  return j < 0 ? null : src.slice(i, j + 2);
}
const HANDLE_SAVE = (() => {
  const i = SRC.indexOf('async function handleSave(request, env, ctx) {');
  const j = SRC.indexOf('async function saveIncomingAsFork(', i);
  return (i > 0 && j > i) ? SRC.slice(i, j) : null;
})();
function blockOf(src, startNeedle, endNeedle){
  const i = src.indexOf(startNeedle);
  if (i < 0) return null;
  const j = src.indexOf(endNeedle, i + startNeedle.length);
  return j < 0 ? null : src.slice(i, j);
}

(async () => {

console.log('\n== (0) ★検査対象を取り違えていない ==');
{
  const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
  ok('★v26 の中身は記録どおり（sha256先頭16 = a4f5830b32a2929a）',
     sha(fs.readFileSync(V26_PATH)) === 'a4f5830b32a2929a', sha(fs.readFileSync(V26_PATH)));
  ok('★v26 は 2532 行', SRC.replace(/\n$/, '').split('\n').length === 2532, SRC.replace(/\n$/, '').split('\n').length);
  ok('★handleSave を切り出せた（以降の静的検査が空振りしていない）', !!HANDLE_SAVE && HANDLE_SAVE.length > 5000, HANDLE_SAVE && HANDLE_SAVE.length);
}

console.log('\n== (1) ★★N3/N4: nsFor を実際に走らせて、ns の導出そのものを固定する ==');
let nsFor = null;
{
  const fnNsFor   = grabFn(SRC, 'async function nsFor(env, codeKey) {');
  const fnEnsure  = grabFn(SRC, 'async function ensureNs(env, codeKey) {');
  ok('★nsFor / ensureNs を切り出せた', !!fnNsFor && !!fnEnsure && fnNsFor.indexOf('crypto.subtle.digest') > 0,
     { nsFor: fnNsFor && fnNsFor.length, ensureNs: fnEnsure && fnEnsure.length });
  const ctx = vm.createContext({ crypto: require('crypto').webcrypto, TextEncoder, Uint8Array, Array, String, Promise, Object });
  vm.runInContext(fnNsFor + '\n' + fnEnsure + '\nthis.__nsFor = nsFor; this.__ensureNs = ensureNs;', ctx, { filename: 'v26-ns.js' });
  nsFor = ctx.__nsFor;
  const ensureNs = ctx.__ensureNs;

  const E = (o) => Object.assign({ IMG_SALT: 'chronicle-img' }, o || {});

  /* ★期待値は具体値で書く。node の crypto で独立に計算した既知の値。 */
  ok('★★nsFor は SHA-256(salt|codeKey) の先頭32hex（既知の具体値と一致）',
     (await nsFor(E(), 'allow:osin@example.com')) === '074e5829b11b4c0e59558a0a46ac9dfe',
     await nsFor(E(), 'allow:osin@example.com'));
  ok('★★形は 32字の小文字16進', /^[0-9a-f]{32}$/.test(await nsFor(E(), 'allow:osin@example.com')));
  ok('★★同じ入力なら毎回同じ（identity が時間で揺れない＝v26 の目的そのもの）',
     (await nsFor(E(), 'allow:a@b.c')) === (await nsFor(E(), 'allow:a@b.c')));
  ok('★★別アカウントなら別 ns（金庫が混ざらない）',
     (await nsFor(E(), 'allow:a@b.c')) !== (await nsFor(E(), 'allow:x@y.z')));

  /* N4: 認証種別が入力に含まれる。含まれないと「合言葉が a@b.c の人」と
     「Googleが a@b.c の人」が同じ ns になり、別人の金庫を掴む。 */
  ok('★★★N4: 認証種別が違えば ns も違う（allow: と code: が衝突しない）',
     (await nsFor(E(), 'allow:same')) !== (await nsFor(E(), 'code:same')),
     { allow: await nsFor(E(), 'allow:same'), code: await nsFor(E(), 'code:same') });
  ok('★★区切り文字 | を跨いだ連結の取り違えが起きない（salt+ck の境界が動くと別値）',
     (await nsFor({ IMG_SALT: 'ab' }, 'c')) !== (await nsFor({ IMG_SALT: 'a' }, 'bc')));

  /* N3: salt 依存であること＝salt を変えると全端末の identity が入れ替わること。
     だから salt は通常のローテーション対象にしない（ファイル冒頭の運用前提）。 */
  ok('★★★N3: salt が変われば ns も変わる（＝salt を回すと全端末の identity が壊れる）',
     (await nsFor({ IMG_SALT: 's1' }, 'allow:a')) !== (await nsFor({ IMG_SALT: 's2' }, 'allow:a')));
  ok('★★N3: salt=s1 の具体値（導出式が変わったら落ちる）',
     (await nsFor({ IMG_SALT: 's1' }, 'allow:a')) === '7b7d6b9b3ca346afd0501754077d1ccb',
     await nsFor({ IMG_SALT: 's1' }, 'allow:a'));
  ok('★★salt の優先順は IMG_SALT > ACCESS_CODE > GOOGLE_CLIENT_ID > 既定',
     (await nsFor({ IMG_SALT: 'X', ACCESS_CODE: 'Y', GOOGLE_CLIENT_ID: 'Z' }, 'k')) === (await nsFor({ IMG_SALT: 'X' }, 'k')) &&
     (await nsFor({ ACCESS_CODE: 'Y', GOOGLE_CLIENT_ID: 'Z' }, 'k')) === (await nsFor({ IMG_SALT: 'Y' }, 'k')) &&
     (await nsFor({ GOOGLE_CLIENT_ID: 'Z' }, 'k')) === (await nsFor({ IMG_SALT: 'Z' }, 'k')) &&
     (await nsFor({}, 'k')) === (await nsFor({ IMG_SALT: 'chronicle-img' }, 'k')));
  ok('★★node の crypto と独立に一致する（実装が独自hashに差し替わっていない）', await (async () => {
    for (const ck of ['allow:a@b.c', 'code:pass1', 'あいうえお', '']){
      const mine = await nsFor({ IMG_SALT: 'S' }, ck);
      const want = crypto.createHash('sha256').update(Buffer.from('S|' + ck, 'utf8')).digest('hex').slice(0, 32);
      if (mine !== want) return false;
    }
    return true;
  })());

  console.log('\n== (2) ★★N1/N2: ensureNs は nsFor の戻り値をそのまま返し、KV へは逆引き索引だけ書く ==');
  {
    const writes = [], reads = [];
    const kv = new Map();
    const env = { IMG_SALT: 'chronicle-img',
      LEDGER: { get: async (k) => { reads.push(k); return kv.has(k) ? kv.get(k) : null; },
                put: async (k, v) => { writes.push([k, v]); kv.set(k, v); } } };
    const ck = 'allow:osin@example.com';
    const want = await nsFor(env, ck);
    const got = await ensureNs(env, ck);
    ok('★★★ensureNs の戻り値は nsFor の戻り値と完全に同じ（別値へ差し替わらない）',
       got === want && got === '074e5829b11b4c0e59558a0a46ac9dfe', { got, want });
    ok('★★★KV へ書くのは imgns:<ns> → codeKey の逆引き索引 1件だけ',
       writes.length === 1 && writes[0][0] === 'imgns:' + want && writes[0][1] === ck, writes);
    ok('★★2回目は既に索引があるので書かない（ns の値は同じまま）',
       (await ensureNs(env, ck)) === want && writes.length === 1, writes.length);
    /* ★KV に別値が入っていても ns はそれに引きずられない（KV由来の値へ差し替わる経路が無い） */
    kv.set('imgns:' + want, 'code:someone-else');
    ok('★★★KV の中身を書き換えても ns は変わらない（ns は KV から読んでいない）',
       (await ensureNs(env, ck)) === want);
    /* ★KV が落ちても ns は返る（try/catch で握って戻り値は素通し） */
    const envBad = { IMG_SALT: 'chronicle-img',
      LEDGER: { get: async () => { throw new Error('kv down'); }, put: async () => { throw new Error('kv down'); } } };
    ok('★★KV が落ちても ns は同じ値を返す（索引はbest-effort・identity は壊れない）',
       (await ensureNs(envBad, ck)) === want);
  }
}

console.log('\n== (3) ★★N2: commitstate は nsFor を使う（ensureNs ではない＝KVへ書かない） ==');
{
  const cs = blockOf(SRC, "if (op === 'commitstate') {", "if (op === 'get' || op === 'getfork') {");
  ok('★commitstate ブロックを切り出せた（以下の検査が空振りしていない）', !!cs && cs.length > 400, cs && cs.length);
  const B = cs || '';
  /* ★「無いこと」を見る検査は**コード行だけ**を対象にする。
     ソースの説明コメントに「ensureNs ではなく nsFor を使う」と書いてあるので、
     ソース全体を対象にすると誤検出する（コメントの一括除去ではなく行単位で落とす）。 */
  const Bcode = codeLines(B).join('\n');
  ok('★commitstate のコード行を取り出せた', Bcode.length > 300 && Bcode.indexOf('commitstate requires D1') > 0, Bcode.length);
  ok('★★★commitstate は nsFor(env, user) を呼ぶ', /const nsV26 = await nsFor\(env, user\);/.test(Bcode));
  ok('★★★commitstate は ensureNs を呼ばない（読取専用APIが KV へ書かない）',
     Bcode.indexOf('ensureNs') < 0);
  ok('★★commitstate 内に KV 書込みが1つも無い', !/LEDGER\.put|LEDGER\.delete/.test(Bcode));
  ok('★★commitstate 内に D1 書込みが1つも無い（読取専用・v25から不変）',
     !/UPDATE saves|INSERT INTO saves|INSERT OR IGNORE INTO saves|DELETE FROM saves|\.exec\(/.test(Bcode));
  ok('★★D1 へ発行するのは SELECT 1本だけ',
     (Bcode.match(/DB\.prepare\(/g) || []).length === 1 && /DB\.prepare\('SELECT rev, blob, package_hash/.test(Bcode), (Bcode.match(/DB\.prepare\(/g) || []).length);
  ok('★★行が無いとき（初回端末）も ns を返す',
     /if \(!row\) return json\(\{ ok: true, ns: nsV26, rev: 0,/.test(B));
  ok('★★行があるときも同じ nsV26 を返す（2つの出口で値が食い違わない）',
     /ok: true, ns: nsV26, rev: \+row\.rev \|\| 0,/.test(B));
  ok('★★nsV26 は1回しか代入されない（途中ですり替わらない）',
     (Bcode.match(/nsV26\s*=[^=]/g) || []).length === 1, (Bcode.match(/nsV26\s*=[^=]/g) || []));
  ok('★★D1 が無い環境では嘘の rev 0 を返さず 501 のまま（v25から不変）',
     /commitstate requires D1[\s\S]{0,140}501/.test(Bcode));
  ok('★★ns をリクエスト body から取っていない（N5: 詐称できない）',
     Bcode.indexOf('body.ns') < 0 && !/nsV26 = [^;]*body/.test(Bcode));
}

console.log('\n== (4) ★★★N1: ns の同一性 — meta / commitstate / put / fork の4経路すべてが nsFor 由来 ==');
{
  /* ★ここが v26 の核心。3経路（＋fork）が同じ関数の戻り値をそのまま使い、
     途中で乱数生成や KV 由来の別値へ差し替わる経路が無いことを、静的に固定する。
     ns の値そのものは Cloudflare 無しでは作れないので、
     「同じ入力を同じ関数へ渡している」ことを配線として証明する。 */
  const H = HANDLE_SAVE || '';
  ok('★★★入力は認証後に確定した canonical identity（resolveUser の戻り値）である',
     /const user = await resolveUser\(env, gate\.codeKey\);/.test(H));
  ok('★★★user はこのハンドラで1回しか束縛されない（あとから別の値へ変わらない）',
     (H.match(/\buser\s*=[^=]/g) || []).length === 1, (H.match(/\buser\s*=[^=]/g) || []));
  ok('★★★user は認証ゲートを通ったあとで作られる（未認証の値で ns を作らない）',
     H.indexOf('const gate = await checkAuth(request, env);') > 0 &&
     H.indexOf('const gate = await checkAuth(request, env);') < H.indexOf('const user = await resolveUser(env, gate.codeKey);'));
  ok('★★★ns の生成関数呼び出しは nsFor(env, user) / ensureNs(env, user) だけ（別の引数で呼ばない）',
     (H.match(/nsFor\([^)]*\)/g) || []).every(s => s === 'nsFor(env, user)') &&
     (H.match(/ensureNs\([^)]*\)/g) || []).every(s => s === 'ensureNs(env, user)'),
     { nsFor: (H.match(/nsFor\([^)]*\)/g) || []), ensureNs: (H.match(/ensureNs\([^)]*\)/g) || []) });
  ok('★★★ns を乱数から作る経路が無い',
     !/ns\s*=\s*[^;]*(Math\.random|randomUUID|getRandomValues)/.test(H));
  ok('★★★ns を KV から読む経路が無い（imgns: の逆引きは画像配信 handleImg 専用）',
     H.indexOf('imgns:') < 0 && SRC.indexOf("LEDGER.get('imgns:' + ns)") > 0);

  const meta = blockOf(SRC, "if (op === 'meta') {", "if (op === 'commitstate') {");
  ok('★meta ブロックを切り出せた', !!meta && meta.indexOf('v: 17') > 0, meta && meta.length);
  ok('★★経路1 meta: ensureNs(env, user) の値をそのまま ns として返す',
     /const ns = await ensureNs\(env, user\);\n\s*return json\(\{ ok: true, meta, rev: [^,]*, ns, v: 17,/.test(meta || ''));

  const put = blockOf(SRC, "if (op === 'put' || op === 'forceput') {", "if (op === 'forks') {");
  ok('★put/forceput ブロックを切り出せた', !!put && put.length > 3000, put && put.length);
  /* ★`ns =` を素で数えると `const ins = ...`（D1のINSERT結果）まで拾って誤検出する。
     識別子の境界を明示して、ns という**変数への代入**だけを数える。 */
  const nsAssign = ((put || '').match(/(^|[^\w$.])ns\s*=[^=]/gm) || []);
  ok('★★経路3 put: ensureNs(env, user) を1回だけ呼び、その ns を応答へ載せる',
     (put || '').indexOf('const ns = await ensureNs(env, user);') > 0 &&
     ((put || '').match(/const ns = await ensureNs/g) || []).length === 1 &&
     nsAssign.length === 1,
     nsAssign);
  ok('★★put の成功応答3本すべてに ns が載っている（どの分岐でも identity を返す）',
     ((put || '').match(/okJson\(\{ ok: true, rev: [^}]*ns, packageHash: pkgHash25/g) || []).length === 3,
     ((put || '').match(/okJson\(\{ ok: true, rev: [^}]*ns,/g) || []).length);
  ok('★★経路4 fork: put で作った同じ ns をそのまま持ち回る（fork でも identity が変わらない）',
     /ns: o\.ns,/.test(SRC) && ((put || '').match(/ns, requestId, mid \}\)/g) || []).length >= 1);

  /* ★★同一性の要（ensureNs が nsFor をそのまま返すこと）は (2) で**実際に走らせて**確認済み。
     ここではソース上でもそれが壊れていないことを見る。 */
  const fnEnsure = grabFn(SRC, 'async function ensureNs(env, codeKey) {');
  ok('★★★ensureNs の戻り値は nsFor の戻り値そのもの（加工しない）',
     /const ns = await nsFor\(env, codeKey\);[\s\S]*return ns;/.test(fnEnsure || '') &&
     !/return [^n;][^;]*;/.test((fnEnsure || '').slice((fnEnsure || '').lastIndexOf('return'))), fnEnsure);
}

console.log('\n== (5) ★★★N3: ns の導出は v24/v25/v26 で1バイトも変わっていない（乱数生成も無い） ==');
{
  /* ★ns が版によって変わると、更新した瞬間に**全端末の identity が総入れ替え**になる。
     保留中の送信は全部「別人のもの」と判定され、画像の逆引き索引も迷子になる。
     だから導出式の同一性は、毎回機械で確かめる。 */
  const pick = (src) => ({
    nsFor: grabFn(src, 'async function nsFor(env, codeKey) {'),
    ensureNs: grabFn(src, 'async function ensureNs(env, codeKey) {')
  });
  const a26 = pick(SRC), a25 = pick(SRC25);
  ok('★3版すべてから nsFor を取り出せた（null同士の比較で偽合格していない）',
     !!a26.nsFor && !!a25.nsFor && a26.nsFor.indexOf("env.IMG_SALT") > 0, { v26: !!a26.nsFor, v25: !!a25.nsFor });
  ok('★★★nsFor が v25 と完全一致（salt の入力・導出が同一）', a26.nsFor === a25.nsFor);
  ok('★★★ensureNs が v25 と完全一致', a26.ensureNs === a25.ensureNs && !!a26.ensureNs);
  if (SRC24){
    const a24 = pick(SRC24);
    ok('★★★nsFor が v24 とも完全一致（遡ってもランダム生成に切り替わった版が無い）',
       !!a24.nsFor && a26.nsFor === a24.nsFor);
    ok('★★★ensureNs が v24 とも完全一致', !!a24.ensureNs && a26.ensureNs === a24.ensureNs);
  } else {
    ok('★v24 の配布物が見つからない（遡り検査ができない）', false, 'chronicle-proxy-v24_tombstone.js');
  }
  ok('★★★salt の式そのものを固定する（優先順が入れ替わると全端末の ns が変わる）',
     /const salt = String\(env\.IMG_SALT \|\| env\.ACCESS_CODE \|\| env\.GOOGLE_CLIENT_ID \|\| 'chronicle-img'\);/.test(a26.nsFor || ''));
  ok('★★★連結の式を固定する（salt \\| codeKey の順・区切りは縦棒）',
     /const data = new TextEncoder\(\)\.encode\(salt \+ '\|' \+ String\(codeKey\)\);/.test(a26.nsFor || ''));
  ok('★★★切り出し長を固定する（32hex＝128bit。短くすると衝突する）',
     /return hex\.slice\(0, 32\);/.test(a26.nsFor || ''));
  ok('★★★nsFor / ensureNs の中に乱数が1つも無い',
     !/Math\.random|randomUUID|getRandomValues/.test((a26.nsFor || '') + (a26.ensureNs || '')));
}

console.log('\n== (6) ★★N6: op:meta の応答は v25 と同一（空白正規化後の完全一致） ==');
{
  /* ★旧クライアント（v26 に上げても更新されない端末）が読むのは meta。ここが動くと静かに壊れる。 */
  const grab = (src) => {
    const i = src.indexOf("if (op === 'meta') {");
    if (i < 0) return null;
    const end = src.indexOf('\n    }\n', i);
    return end < 0 ? null : src.slice(i, end + 6);
  };
  const now = grab(SRC), before = grab(SRC25);
  ok('★v26/v25 の両方から meta ブロックを取り出せた（null同士の比較で偽合格していない）',
     !!now && !!before && now.indexOf('v: 17') > 0 && before.indexOf('v: 17') > 0,
     { v26: now && now.length, v25: before && before.length });
  const norm = (s) => String(s).replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/[ \t]*\n[ \t]*/g, '\n').trim();
  ok('★★★meta ブロックが v25 と一致（空白正規化後）', !!now && norm(now) === norm(before),
     now === before ? undefined : { v26: norm(now || '').length, v25: norm(before || '').length });
  ok('★★meta の応答行そのものを具体値で固定する（v:17・ns あり・packageHash なし）',
     /return json\(\{ ok: true, meta, rev: meta \? \(\+meta\.rev \|\| 0\) : 0, ns, v: 17, d1: !!d1, requestId \}, 200, request\);/.test(now || ''));
  ok('★★meta へ ns 以外の新キーを足していない（commitstate 側だけを拡張した）',
     (now || '').indexOf('nsV26') < 0 && (now || '').indexOf('packageHash') < 0 && (now || '').indexOf('commitState') < 0);
}

console.log('\n== (7) ★★N7/N9: ルートJSONは追加のみ・v:28 不変・commitState は 2 ==');
{
  const grab = (src) => {
    const i = src.indexOf("service: 'chronicle-proxy'");
    if (i < 0) return null;
    const s = src.lastIndexOf('return json(', i), e = src.indexOf('200, request);', i);
    return (s < 0 || e < 0) ? null : src.slice(s, e);
  };
  const now = grab(SRC), before = grab(SRC25);
  ok('★v26/v25 の両方からルートJSONを取り出せた', !!now && !!before && now.indexOf('v: 28') > 0, { v26: now && now.length, v25: before && before.length });

  /* ★キー名だけを比べる。コメント行は行単位で落とす（一括の正規表現除去はしない）。 */
  const keys = (blk) => {
    const src = codeLines(blk).join('\n');
    const set = new Set();
    const re = /([A-Za-z_$][\w$]*)\s*:/g;
    let m; while ((m = re.exec(src))) set.add(m[1]);
    return set;
  };
  const k26 = keys(now || ''), k25 = keys(before || '');
  const lost = [...k25].filter(k => !k26.has(k));
  ok('★★★v25 のキーが1つも消えていない（追加のみ）', lost.length === 0, lost);
  ok('★キーを実際に拾えている（空集合同士の比較で偽合格していない）', k25.size > 15, k25.size);
  ok('★★★v:28 を変えていない（クライアントの対応検知が壊れる）', /\bv: 28,/.test(now || ''));
  ok('★★workerBuild が v26 に上がっている', /workerBuild: 'v26',/.test(now || ''));
  ok('★★★capabilities.commitState が 2（ns を返せる版であることの表明）',
     /capabilities: \{ tombstoneGuard: 1, packageHash: HASH_ALG_V25, commitOpId: 1, commitState: 2 \}/.test(now || ''));
  ok('★★commitState は v25 の 1 から単調増加している（下げていない）',
     /commitState: 1 \}/.test(before || '') && /commitState: 2 \}/.test(now || ''));
  ok('★★他の capabilities は据え置き（packageHash の規格名も不変）',
     /packageHash: HASH_ALG_V25/.test(now || '') && /packageHash: HASH_ALG_V25/.test(before || '') &&
     /const HASH_ALG_V25 = 'sha256-utf8-v1';/.test(SRC));
  ok('★★HTTP status は 200 のまま', /\}, 200, request\);/.test(SRC.slice(SRC.indexOf("service: 'chronicle-proxy'"), SRC.indexOf("service: 'chronicle-proxy'") + 1800)));
  ok('★ルートJSONへ ns を載せていない（認証前のGETに identity を出さない）',
     !/\bns:/.test(now || ''));
}

console.log('\n== (8) ★★N8: 実コードの増加が5行以内（コメント行・空行を除いた差分で数える） ==');
{
  /* ★「小さい変更である」ことを主張するなら、機械で数える。
     行単位でコメント行と空行を落とし、行の多重集合として差を取る。 */
  const cnt = (xs) => { const m = new Map(); for (const x of xs) m.set(x, (m.get(x) || 0) + 1); return m; };
  const norm = (src) => codeLines(src).map(l => l.trim());
  const a = cnt(norm(SRC25)), b = cnt(norm(SRC));
  let added = 0, removed = 0; const addedLines = [];
  for (const [k, v] of b){ const d = v - (a.get(k) || 0); if (d > 0){ added += d; addedLines.push(k.slice(0, 90)); } }
  for (const [k, v] of a){ const d = v - (b.get(k) || 0); if (d > 0) removed += d; }
  ok('★★★新しく現れた実コード行は5行以内', added <= 5, { added, addedLines });
  ok('★★★消えた実コード行も5行以内（こっそり別の変更を混ぜていない）', removed <= 5, removed);
  ok('★★実コードの正味の増加は1行（nsFor 呼び出しの1行だけ）',
     norm(SRC).length - norm(SRC25).length === 1, { v25: norm(SRC25).length, v26: norm(SRC).length });
  ok('★★新しく現れた行はすべて ns / workerBuild / capabilities に関するもの（無関係な変更が無い）',
     addedLines.every(l => /nsV26|workerBuild|capabilities/.test(l)), addedLines);
  ok('★★★ns 追加そのものは3行（宣言・行なし応答・通常応答）',
     addedLines.filter(l => /nsV26/.test(l)).length === 3, addedLines.filter(l => /nsV26/.test(l)));
}

console.log('\n== (9) ★★★TDZ: 宣言より前に const を参照していない（2026-07-27 に実際に踏んだ型） ==');
{
  /* ★★前回はデプロイ直前、Cloudflare の編集画面の赤線で見つかった。
     `const` は巻き上げられるが初期化前に読むと ReferenceError（TDZ）。
     `node --check` は構文しか見ないので通ってしまうし、単純な文字列検査でも見つからない。
     ここでは**宣言位置 < 使用位置**を直接比べる。 */
  const cs = blockOf(SRC, "if (op === 'commitstate') {", "if (op === 'get' || op === 'getfork') {") || '';
  const decl = cs.indexOf('const nsV26 = await nsFor(env, user);');
  const uses = [];
  { const re = /nsV26/g; let m; while ((m = re.exec(cs))) uses.push(m.index); }
  ok('★nsV26 の宣言と使用箇所を拾えた', decl > 0 && uses.length >= 3, { decl, uses });
  ok('★★★nsV26 は すべての使用箇所より前で宣言されている（TDZ で落ちない）',
     decl > 0 && uses.every(u => u >= decl), { decl, first: uses[0] });
  ok('★★nsV26 を二重宣言していない', (cs.match(/const nsV26/g) || []).length === 1);
  ok('★★nsV26 は nsFor 宣言後に評価される（関数宣言なので巻き上げ済み・非同期呼び出しも問題ない）',
     /^async function nsFor/m.test(SRC));
  /* ★同型の再発防止: v25 で直した put 側の関係も崩れていないか一緒に見る */
  const put = blockOf(SRC, "if (op === 'put' || op === 'forceput') {", "if (op === 'forks') {") || '';
  const useIdem = put.indexOf('idemReqHashV2({ op: op');
  ok('★put 側も宣言が先のまま（v25c の修正が残っている）',
     useIdem > 0 &&
     put.indexOf('const hasBase =') > 0 && put.indexOf('const hasBase =') < useIdem &&
     put.indexOf('const baseRev =') > 0 && put.indexOf('const baseRev =') < useIdem &&
     put.indexOf('const pkgHash25 =') < useIdem && put.indexOf('const commitOpId25 =') < useIdem,
     { useIdem, hasBase: put.indexOf('const hasBase ='), baseRev: put.indexOf('const baseRev =') });
  ok('★put 側の ns も使用より前で宣言されている',
     put.indexOf('const ns = await ensureNs(env, user);') > 0 &&
     put.indexOf('const ns = await ensureNs(env, user);') < put.indexOf('ns, requestId, mid }'));
}

console.log('\n== (10) ★★★export している名前がすべて実在する（2026-07-27 に実際に踏んだ型） ==');
{
  /* ★★前回は idemReqHash を v1/v2 へ分けたのに末尾の export リストを直し忘れ、
     **モジュールがそもそも読み込めない**（1リクエストも通らない）状態になっていた。
     `node --check` では出ない。Cloudflare の編集画面が
     「Cannot find name 'idemReqHash'」と出して教えてくれた。
     ★ここでコメントを落とすのは**行単位**。一括の正規表現除去は使わない
       （ソース中の文字列や正規表現にコメント終端記号が入っていると、
         そこまで丸ごと食って本物の宣言まで消え、誤検出する）。 */
  const lists = NOCOMMENT.match(/^export \{([^}]*)\}/gm) || [];
  ok('★export リストを見つけた', lists.length >= 1, lists.length);
  const names = [];
  for (const l of lists){
    for (const raw of l.replace(/^export \{/, '').replace(/\}$/, '').split(',')){
      const n = raw.trim().split(/\s+as\s+/)[0].trim();
      if (n) names.push(n);
    }
  }
  ok('★名前を取り出せた（空配列に対する every で偽合格していない）', names.length > 5, names.length);
  const missing = names.filter(n => !new RegExp(
    '(function\\s+' + n + '\\b|const\\s+' + n + '\\b|let\\s+' + n + '\\b|var\\s+' + n + '\\b|class\\s+' + n + '\\b)'
  ).test(NOCOMMENT));
  ok('★★★export している名前がすべて実在する（1つでも欠けると Worker が読み込めない）',
     missing.length === 0, missing);
  /* export const / export default 側も実在を見る */
  const constExports = NOCOMMENT.match(/^export const (\w+) = \{([^}]*)\}/gm) || [];
  ok('★export const __testInspect がある', /export const __testInspect = \{/.test(NOCOMMENT), constExports.length);
  const inner = ((NOCOMMENT.match(/^export const __testInspect = \{([^}]*)\}/m) || [])[1] || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  const missingInner = inner.filter(n => !new RegExp('(function\\s+' + n + '\\b|const\\s+' + n + '\\b|let\\s+' + n + '\\b|var\\s+' + n + '\\b)').test(NOCOMMENT));
  ok('★★__testInspect が並べる名前もすべて実在する', inner.length > 3 && missingInner.length === 0, { inner: inner.length, missingInner });
  ok('★★v26 で名前を消していない（v25 の export をすべて含む）', (() => {
    const l25 = (codeLines(SRC25).join('\n').match(/^export \{([^}]*)\}/gm) || []).join(',');
    const n25 = l25.replace(/export \{|\}/g, '').split(',').map(s => s.trim()).filter(Boolean);
    return n25.length > 5 && n25.every(n => names.indexOf(n) >= 0);
  })());
  ok('★★nsFor / ensureNs は export していない（Worker 内部専用のまま・v25と同じ）',
     names.indexOf('nsFor') < 0 && names.indexOf('ensureNs') < 0);
}

console.log('\n== (11) ★ESM として構文が通る（※これは「動く」の証明ではない。(9)(10) と併せて見る） ==');
{
  /* ★node --check は .js を CommonJS として見るので export で落ちる。
     .mjs へ写して ESM として構文検査する。
     ★これが通っても TDZ や存在しない export は見つからない（前回それで漏れた）。
       だから (9)(10) を別に置いている。ここは「最低限の門」でしかない。 */
  const tmp = path.join(os.tmpdir(), 'chronicle_v26_syntax_' + process.pid + '.mjs');
  let syntaxOk = false, err = null;
  try { fs.writeFileSync(tmp, SRC); execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); syntaxOk = true; }
  catch (e){ err = String((e && e.stderr) || e).slice(0, 300); }
  finally { try { fs.unlinkSync(tmp); } catch (e){} }
  ok('★ESM として構文エラーが無い', syntaxOk, err);
  ok('★NUL バイトや CR が混入していない（この配布物で前歴あり）',
     SRC.indexOf('\u0000') < 0 && SRC.indexOf('\r') < 0,
     { nul: SRC.indexOf('\u0000'), cr: SRC.indexOf('\r') });
}

console.log('\n== (12) ★★N9: クライアントの能力判定は >= で書く（=== 1 が残っていない） ==');
{
  const CL = path.join(__dirname, 'v292Dfix399-cloudsync.js');
  const has = fs.existsSync(CL);
  ok('★v292Dfix399-cloudsync.js がある', has);
  const C = has ? fs.readFileSync(CL, 'utf8') : '';
  /* ★★ここを `=== 1` で書いていると、サーバを v26 へ上げた瞬間に照合が丸ごと止まる。
     文字列としての `=== 1` はコメント中の説明にも出るので、
     **識別子に紐づいた比較**だけを探す（コメント一括除去はしない）。 */
  const bad = C.match(/commitState(Version)?\s*[=!]{2,3}\s*[0-9]+/g) || [];
  ok('★★★commitState を数値と等値比較している箇所が無い', bad.length === 0, bad);
  /* ★能力値を一度ローカル変数へ受けてから比較する書き方（cs === 1）も同じ事故を起こすので、
     判定関数そのものを取り出して、その中に等値比較が1つも無いことを見る。 */
  const fi = C.indexOf('function workerSupportsCommitState(){');
  const fj = C.indexOf('\n  }\n', fi);
  const capFn = (fi >= 0 && fj > fi) ? C.slice(fi, fj) : '';
  ok('★能力判定の関数を切り出せた', capFn.indexOf('nsInCommitState') > 0 && capFn.indexOf('capabilities') > 0, capFn.length);
  const bad2 = capFn.match(/\bcs\s*[=!]{2,3}\s*[0-9]+/g) || [];
  ok('★★★能力値(cs)を数値と等値比較している箇所も無い', bad2.length === 0, bad2);
  ok('★★能力判定が >= で書かれている（v25 でも v26 でも動く）',
     /cs >= 1/.test(capFn) && /nsInCommitState: cs >= 2/.test(capFn));
  ok('★★ns が commitstate に入るかどうかを版で判定している', /nsInCommitState/.test(C));
  ok('★★commitstate の ns を identity の最優先に使う（無ければ meta 由来へ落ちる）',
     /ns: \(j\.ns \? String\(j\.ns\) : identityArgs\(\)\.ns\)/.test(C));
  ok('★★v26 では ns 取得のための meta 往復をしない（1往復で済ませる）',
     /if \(cap && cap\.nsInCommitState\) return Promise\.resolve\(knownNs\(\)\);/.test(C));
  ok('★★v25 のときだけ meta を1回叩く経路が残っている（後方互換）',
     /return callSave\(\{ op:'meta' \}\)\.then/.test(C));
  ok('★★D1 が無い環境では commitstate を使わない（実装の有無と利用可否を混ぜない）',
     /cs >= 1 && j\.d1 === true/.test(C));
}

console.log('\n== (13) ★退行防止: v25 で入れた commitstate の性質が v26 でも残っている ==');
{
  ok('★op:commitstate がある', /if \(op === 'commitstate'\)/.test(SRC));
  ok('★rev / packageHash / lastCommitOpId / hashAlg を返す',
     /packageHash: ph/.test(SRC) && /lastCommitOpId: row\.last_commit_op_id/.test(SRC) && /hashAlg: alg \|\| HASH_ALG_V25/.test(SRC));
  ok('★slotId を渡すと墓標の中身を返す', /if \(slotId\) out\.tombstone = tombstoneOfSlot\(row\.blob, slotId\);/.test(SRC));
  ok('★v25以前の行は読むときにその場で計算し、DBへは書き戻さない',
     /if \(!ph && row\.blob\) \{ ph = await sha256Utf8v1\(String\(row\.blob\)\); alg = HASH_ALG_V25; computed = true; \}/.test(SRC) &&
     !/UPDATE saves SET package_hash/.test(SRC));
  ok('★unknown op の案内に commitstate が入っている', /get\|put\|forceput\|meta\|commitstate\|/.test(SRC));
  ok('★commitstate は d1Ready を通ってからでないと動かない',
     /const d1 = env\.DB \? await d1Ready\(env\) : false;[\s\S]{0,4000}if \(op === 'commitstate'\)/.test(SRC));
  ok("★op:'getraw' を足していない", SRC.indexOf("'getraw'") < 0 && SRC.indexOf('"getraw"') < 0);
  ok('★墓標保護（forceput の fail-closed）が残っている',
     /function tombstoneGuardForceput\(curBlob, incomingStr, restoreOfDeleteOpId\)/.test(SRC));
  ok('★冪等キーは idem-v2 のまま', /return 'idem-v2:' \+ await sha256Utf8v1\(canon\);/.test(SRC));
  ok('★migration の single-flight が残っている',
     /let __d1initPromise = null;/.test(SRC) && /if \(__d1initPromise\) return await __d1initPromise;/.test(SRC));
  ok('★★migration の結果を PRAGMA で実際に検証する', /PRAGMA table_info\(saves\)/.test(SRC) && /async function savesHasV25Columns\(env\)/.test(SRC));
}

console.log('\n---------------------------------------------');
console.log('test_fix598_worker: 合格 ' + pass + ' / 失敗 ' + fail);
console.log('PASS ' + pass + ' / FAIL ' + fail);
if (fail) process.exitCode = 1;
})();
