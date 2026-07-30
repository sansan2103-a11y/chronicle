/* 回帰テスト: Worker v27 — saves 本文の分割保存(chunks-v1)  [2026-07-29]
 *
 * ■なぜ必要か（本番障害）
 *   saves は「1ユーザー(u)×kind='main' の1行に、全物語のJSONを丸ごと1つの TEXT 列(blob)」で持つ。
 *   実ユーザーの合計が D1(SQLite)の string/row 上限を超え、UPDATE 自体が
 *   「string or blob too big: SQLITE_TOOBIG」で落ちる＝**全pushが500で失敗し続ける**。
 *   Worker の事前ガードは 4MB で D1 の実上限より緩いので、Worker は通し D1 が落とす。
 *
 * ■v27 が変えるのは「物理格納」だけ
 *   論理契約（op:put/forceput/get/getfork/meta/commitstate、payload形式、rev/baseRev の CAS、
 *   墓標guard、既存レスポンスの形）は1つも変えていない。saves 行に storage_mode を持たせ
 *     'inline-v1' … 従来どおり blob 列に全文（既定。既存行＝NULL もこの扱い）
 *     'chunks-v1' … blob=NULL。本文は save_chunks に idx 順で分割保存
 *   を同居させる。
 *
 * ■このテストの立ち位置（値ではなく関係で縛る）
 *   ・**実際に走らせる**。D1 は node:sqlite(実物のSQLite)で模擬し、handleSave をそのまま呼ぶ。
 *     静的検査（正規表現でソースを見るだけ）は「SQLが実際に通るか」「本文が本当に戻るか」を
 *     証明できない。今回いちばん怖いのは「chunk化された行を inline のつもりで読んで空を返す」で、
 *     これは実行しないと絶対に見つからない。
 *   ・期待値は「送ったものと戻ったものが**文字列として完全一致**」のような関係で書く。
 *     具体的なhash値やSQL文字列を焼き込むと、正しい変更でも落ちるテストになる。
 *   ・fail-closed の検査では「エラーになること」だけでなく
 *     **部分本文が1バイトも漏れていないこと**を確かめる（部分本文を返すのが最悪の事故だから）。
 *
 * ■踏んだ罠のメモ
 *   ・孤立サロゲート: JS文字列を素朴にコードユニットで割るとサロゲートペアが割れる。
 *     割れた片割れは SQLite の TEXT(UTF-8)を往復した時点で U+FFFD に化け、**連結しても元に戻らない**。
 *     このテストは実際に SQLite を往復させて、その化けを検出する。
 *   ・モジュールは import キャッシュで __d1init が残る。テストごとに
 *     クエリ文字列を変えて import し直し、まっさらな状態から migration を走らせる。
 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { pathToFileURL } = require('url');
const { DatabaseSync } = require('node:sqlite');

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + safe(x)) : '')); } };
function safe(x) { try { const s = JSON.stringify(x); return (s && s.length > 400) ? (s.slice(0, 400) + '…') : String(s); } catch (e) { return String(x); } }

function findSrc(names) {
  for (const n of names) {
    for (const p of [path.join(__dirname, n), path.join(__dirname, 'worker', n)]) {
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}
const V27_PATH = findSrc(['chronicle-proxy-v27_chunks.js']);
const V26_PATH = findSrc(['chronicle-proxy-v26_ns.js']);
if (!V27_PATH) {
  console.log('  FAIL  Worker v27 の配布物が見つからない(chronicle-proxy-v27_chunks.js)');
  console.log('pass=0 fail=1'); process.exit(1);
}
const SRC27 = fs.readFileSync(V27_PATH, 'utf8');
const SRC26 = V26_PATH ? fs.readFileSync(V26_PATH, 'utf8') : null;

/* ============================================================
 *  D1 モック（node:sqlite = 実物のSQLite の上に D1 の API 形だけ被せる）
 *    ・prepare().bind().run()/.all()/.first() / batch() / exec()
 *    ・run() の戻りは D1 と同じ { success, results, meta:{changes} }
 *      RETURNING がある文は results に行が入る（d1Changed がこれを見る）
 *    ・hooks.before(sql, params) を差し込めるようにして、
 *      「途中で例外」「CASの直前に別pushが割り込む」を再現できるようにする
 * ============================================================ */
function makeDB() {
  const db = new DatabaseSync(':memory:');
  const log = [];
  const hooks = { before: null };
  const norm = (v) => (v === undefined ? null : (typeof v === 'boolean' ? (v ? 1 : 0) : v));
  function exec1(sql, params) {
    if (hooks.before) hooks.before(sql, params);
    log.push({ sql: sql, params: params });
    const isSelect = /^\s*(SELECT|PRAGMA)/i.test(sql);
    const isReturning = /\bRETURNING\b/i.test(sql);
    const st = db.prepare(sql);
    const p = params.map(norm);
    if (isSelect || isReturning) {
      const rows = st.all.apply(st, p).map(r => Object.assign({}, r));
      return { success: true, results: rows, meta: { changes: isSelect ? 0 : rows.length } };
    }
    const r = st.run.apply(st, p);
    return { success: true, results: [], meta: { changes: Number(r.changes) } };
  }
  function mk(sql, params) {
    return {
      __sql: sql, __params: params,
      bind: function () { return mk(sql, Array.prototype.slice.call(arguments)); },
      run: async function () { return exec1(sql, params); },
      all: async function () { return exec1(sql, params); },
      first: async function () { const r = exec1(sql, params); return (r.results && r.results.length) ? r.results[0] : null; }
    };
  }
  return {
    prepare: (sql) => mk(sql, []),
    exec: async (sql) => { if (hooks.before) hooks.before(sql, []); log.push({ sql: sql, params: [] }); db.exec(sql); return { success: true }; },
    batch: async (stmts) => {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of stmts) out.push(exec1(s.__sql, s.__params));
        db.exec('COMMIT');
        return out;
      } catch (e) { try { db.exec('ROLLBACK'); } catch (e2) {} throw e; }
    },
    __raw: db, __log: log, __hooks: hooks,
    q: (sql, ...p) => db.prepare(sql).all.apply(db.prepare(sql), p).map(r => Object.assign({}, r))
  };
}

function makeKV() {
  const m = new Map();
  return { __m: m, get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, String(v)); }, delete: async (k) => { m.delete(k); } };
}

/* テストごとに**新しいモジュール実体**を読む（__d1init が前のテストの DB を指したままにならないように） */
let __imp = 0;
async function loadWorker() {
  __imp++;
  return await import(pathToFileURL(V27_PATH).href + '?v27test=' + __imp);
}

function makeCtx() {
  const pend = [];
  return { waitUntil: (p) => { pend.push(Promise.resolve(p).catch(() => {})); }, __settle: async () => { while (pend.length) { const a = pend.splice(0, pend.length); await Promise.all(a); } } };
}

function req(body) {
  return new Request('https://example.invalid/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-chronicle-pass': 'testpass', 'Origin': 'https://example.invalid' },
    body: JSON.stringify(body)
  });
}

async function makeEnvW() {
  const W = await loadWorker();
  const DB = makeDB();
  const LEDGER = makeKV();
  const env = { DB, LEDGER, ACCESS_CODE: 'testpass', IMG_SALT: 'chronicle-img' };
  return { W, env, DB, LEDGER };
}

async function call(W, env, body) {
  const ctx = makeCtx();
  const res = await W.handleSave(req(body), env, ctx);
  await ctx.__settle();
  const text = await res.text();
  let js = null; try { js = JSON.parse(text); } catch (e) {}
  return { status: res.status, json: js, text: text };
}

/* ---- 素材づくり ---- */
function bigPkg(charTarget, filler) {
  // pkg から idb を除いた JSON.stringify が charTarget 文字を超えるようにする
  const f = filler || 'あ';
  const unit = f;
  let s = '';
  const need = Math.ceil(charTarget / unit.length) + 16;
  s = unit.repeat(need);
  return { device: 'dev-A', updatedAt: 1700000000000, ls: { big: s } };
}
function payloadStrOf(pkg) {
  const light = {}; for (const k in pkg) { if (k !== 'idb') light[k] = pkg[k]; }
  return JSON.stringify(light);
}
function slotsMetaPkg(metaArr, padChars) {
  const p = { device: 'dev-A', updatedAt: 1700000000000, ls: { chr6_slots_meta: JSON.stringify(metaArr) } };
  if (padChars) p.ls.pad = 'ぱ'.repeat(padChars);
  return p;
}
function hasLoneSurrogate(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xD800 && c <= 0xDBFF) { const d = s.charCodeAt(i + 1); if (!(d >= 0xDC00 && d <= 0xDFFF)) return true; i++; }
    else if (c >= 0xDC00 && c <= 0xDFFF) return true;
  }
  return false;
}
const sha256 = (s) => crypto.createHash('sha256').update(Buffer.from(String(s), 'utf8')).digest('hex');

(async () => {

/* ============================================================ */
console.log('\n== (0) 検査対象を取り違えていない / 契約の基本形 ==');
let T = null;
{
  const W = await loadWorker();
  T = W.__testChunks27;
  ok('★v27 を ESM として読み込めた(Cloudflare が読めない構文が無い)', !!W && typeof W.handleSave === 'function');
  ok('★chunk ヘルパーが export されている(テストが本物を叩いている)',
     !!T && typeof T.splitChunksV27 === 'function' && typeof T.loadSaveBodyV27 === 'function' && typeof T.storeSaveBodyV27 === 'function');
  ok('★閾値は str.length で 1,000,000（D1の実上限2MBより十分手前）', T.CHUNK_THRESHOLD_V27 === 1000000, T.CHUNK_THRESHOLD_V27);
  ok('★1chunk は 262144 文字（最悪3byte/文字でも 768KB < 2MB）', T.CHUNK_SIZE_V27 === 262144, T.CHUNK_SIZE_V27);
  ok('★storage_mode の値は inline-v1 / chunks-v1', T.STORAGE_INLINE_V27 === 'inline-v1' && T.STORAGE_CHUNKS_V27 === 'chunks-v1');
  ok('★閾値(1MB) < 4MBガード（chunk経路に入る前に 413 で弾かれてしまわない）',
     T.CHUNK_THRESHOLD_V27 < 4 * 1024 * 1024);
  if (SRC26) {
    ok('★v26 は改変していない(正本を壊していない)',
       crypto.createHash('sha256').update(fs.readFileSync(V26_PATH)).digest('hex').slice(0, 16) === 'a4f5830b32a2929a',
       crypto.createHash('sha256').update(fs.readFileSync(V26_PATH)).digest('hex').slice(0, 16));
  }
}

/* ============================================================ */
console.log('\n== (1) 分割と結合の等価性（サロゲートペアを割らない） ==');
{
  const split = T.splitChunksV27;
  // (a) 純粋な文字列としての等価性
  const cases = [
    { name: 'ASCIIのみ', s: 'abcdefghij'.repeat(50) },
    { name: '日本語', s: 'あいうえお漢字ひらがな'.repeat(50) },
    { name: '絵文字のみ(全てサロゲートペア)', s: '😀'.repeat(500) },
    { name: '日本語+絵文字の交互', s: 'あ😀い😀う😀'.repeat(200) },
    { name: '合字(ZWJ)混じり', s: '👨‍👩‍👧‍👦あ'.repeat(100) },
    { name: '空文字', s: '' },
    { name: '1文字', s: 'a' },
    { name: 'サロゲート1個ぶん', s: '😀' }
  ];
  for (const c of cases) {
    let allOk = true, joinOk = true, loneOk = true;
    // 幅1は「1コードユニットしか入らない」ので、サロゲートペアを割らずには分割できない
    // （実装も前進を優先して割る）。実運用の幅は 262144 なので 2 以上で確かめる。
    for (let size = 2; size <= 12; size++) {
      const parts = split(c.s, size);
      if (parts.join('') !== c.s) { joinOk = false; break; }
      for (const p of parts) { if (hasLoneSurrogate(p)) { loneOk = false; break; } }
      if (!loneOk) break;
      // 前進していること（無限ループしない）
      for (const p of parts) if (p.length === 0) { allOk = false; }
    }
    ok('★' + c.name + ': どの分割幅でも 連結すると元と完全一致', joinOk, c.name);
    ok('★' + c.name + ': どの分割幅でも 孤立サロゲートが1つも出ない', loneOk, c.name);
    ok('★' + c.name + ': 空チャンクが出ない(前進が保証されている)', allOk, c.name);
  }
  // (b) 「素朴に割ると壊れる」ことをテスト自身が証明する（このテストが空振りでない根拠）
  const naive = (s, n) => { const o = []; for (let i = 0; i < s.length; i += n) o.push(s.slice(i, i + n)); return o; };
  const emo = '😀'.repeat(10);
  ok('★★素朴な分割(幅3)は孤立サロゲートを作る＝この検査は本物',
     naive(emo, 3).some(hasLoneSurrogate) && !split(emo, 3).some(hasLoneSurrogate));
  // (c) 実データ幅（CHUNK_SIZE_V27）でも境界がサロゲートに当たるケースを作って確かめる
  //     境界(index CHUNK_SIZE-1)がちょうど上位サロゲートになるよう、前置きの長さを奇数にする
  const pre = 'a'.repeat(T.CHUNK_SIZE_V27 - 1);       // 直後から 😀 が始まる = index CHUNK_SIZE-1 が上位サロゲート
  const boundary = pre + '😀'.repeat(200000);
  ok('★★仕込みが意図どおり(境界の直前が上位サロゲート)',
     (function () { const c = boundary.charCodeAt(T.CHUNK_SIZE_V27 - 1); return c >= 0xD800 && c <= 0xDBFF; })(),
     boundary.charCodeAt(T.CHUNK_SIZE_V27 - 1).toString(16));
  const bp = split(boundary, T.CHUNK_SIZE_V27);
  ok('★★実サイズの境界でもペアを割らない', !bp.some(hasLoneSurrogate) && bp.join('') === boundary);
  ok('★★境界を避けた分は1文字だけ短くなる(丸ごと1chunk落とすような実装ではない)',
     bp[0].length === T.CHUNK_SIZE_V27 - 1, bp[0].length);
}

/* ============================================================ */
console.log('\n== (2) SQLite を実際に往復させる（孤立サロゲートは本当に化ける） ==');
{
  const { W, env, DB } = await makeEnvW();
  await W.handleSave(req({ op: 'meta' }), env, makeCtx());   // migration を走らせる
  const T2 = W.__testChunks27;
  const s = 'あ😀'.repeat(600000);   // 1.2M文字超
  const h = await sha256(s);
  const desc = await T2.storeSaveBodyV27(env, 'u1', 'main', s, h);
  ok('★閾値超なので chunks-v1 になった', desc.mode === 'chunks-v1' && desc.chunkCount > 1, { mode: desc.mode, n: desc.chunkCount });
  const rows = DB.q("SELECT data FROM save_chunks WHERE u='u1' AND kind='main' ORDER BY idx");
  ok('★保存された chunk のどれにも孤立サロゲートが無い(SQLite往復後)', !rows.some(r => hasLoneSurrogate(String(r.data))));
  const joined = rows.map(r => String(r.data)).join('');
  ok('★★SQLite から読み戻して連結すると送った文字列と完全一致', joined === s, { got: joined.length, want: s.length });
  ok('★★sha256 も一致（U+FFFD への置換が1文字も起きていない）', (await sha256(joined)) === h);
  const back = await T2.readChunksV27(env, 'u1', 'main', desc.generationId, desc.chunkCount, s.length, h);
  ok('★readChunksV27 も同じ文字列を返す', back === s);
  ok('★byte_length は UTF-8 バイト長（文字数ではない）', desc.byteLength === Buffer.byteLength(s, 'utf8'), { got: desc.byteLength, want: Buffer.byteLength(s, 'utf8') });
  ok('★size(論理長)は str.length のまま', desc.size === s.length);
}

/* ============================================================ */
console.log('\n== (3) 契約1: 閾値以下の put は従来の inline 経路のまま ==');
{
  const { W, env, DB } = await makeEnvW();
  const pkg = { device: 'dev-A', updatedAt: 111, ls: { small: 'こんにちは' } };
  const str = payloadStrOf(pkg);
  ok('★前提: 閾値以下', str.length <= T.CHUNK_THRESHOLD_V27);
  const r = await call(W, env, { op: 'put', pkg: pkg });
  ok('★put は成功(200/ok)', r.status === 200 && r.json && r.json.ok === true, r.json);
  ok('★rev は 1(新規作成)', r.json.rev === 1, r.json.rev);
  ok('★size は論理payload長(str.length)', r.json.size === str.length, { got: r.json.size, want: str.length });
  const row = DB.q("SELECT * FROM saves WHERE u='code:master' AND kind='main'")[0];
  ok('★blob 列に全文がそのまま入っている(従来と同じ値)', row && row.blob === str);
  ok("★storage_mode は 'inline-v1'", row && row.storage_mode === 'inline-v1', row && row.storage_mode);
  ok('★generation_id / chunk_count は NULL', row && row.generation_id === null && row.chunk_count === null, row && { g: row.generation_id, c: row.chunk_count });
  ok('★save_chunks には1行も書いていない', DB.q('SELECT COUNT(*) AS n FROM save_chunks')[0].n === 0);
  ok('★★chunk 用の INSERT を1回も発行していない(SQL経路が従来のまま)',
     DB.__log.filter(l => /INSERT INTO save_chunks/i.test(l.sql)).length === 0);
  ok('★package_hash は v25 と同じ sha256-utf8-v1', row && row.package_hash === (await sha256(str)) && row.hash_alg === 'sha256-utf8-v1');
  const g = await call(W, env, { op: 'get' });
  ok('★get で同じ内容が戻る', g.status === 200 && JSON.stringify(g.json.data) === str, g.json && g.json.data);
  const m = await call(W, env, { op: 'meta' });
  ok('★meta の既存キーは不変(ok/meta/rev/ns/v/d1/requestId)',
     m.json.ok === true && m.json.v === 17 && m.json.d1 === true && m.json.rev === 1 && typeof m.json.ns === 'string' && !!m.json.meta);
  ok('★meta.size も論理payload長', m.json.meta.size === str.length);
  ok("★meta に storageMode を**追加**した(inline-v1)", m.json.storageMode === 'inline-v1', m.json.storageMode);
}

/* ============================================================ */
console.log('\n== (4) 契約2: 閾値超の put が成功し、get が送信payloadと完全一致で戻る ==');
let bigStrGlobal = null;
{
  const { W, env, DB } = await makeEnvW();
  const pkg = bigPkg(1100000, 'あ');
  const str = payloadStrOf(pkg); bigStrGlobal = str;
  ok('★前提: 閾値超', str.length > T.CHUNK_THRESHOLD_V27, str.length);
  ok('★前提: v26 ならこの1行が D1 の 2MB 上限を超える大きさ(UTF-8)', Buffer.byteLength(str, 'utf8') > 2 * 1024 * 1024, Buffer.byteLength(str, 'utf8'));
  const r = await call(W, env, { op: 'put', pkg: pkg });
  ok('★★put が成功する(v26 なら SQLITE_TOOBIG で 500 だった大きさ)', r.status === 200 && r.json.ok === true, r.json);
  ok('★応答 size は論理payload長のまま', r.json.size === str.length);
  ok('★応答 packageHash は blob へ入れる文字列の sha256(v25契約と同じ)', r.json.packageHash === (await sha256(str)));
  ok("★応答に storageMode:'chunks-v1' が付く(追加のみ)", r.json.storageMode === 'chunks-v1', r.json.storageMode);
  const row = DB.q("SELECT * FROM saves WHERE u='code:master' AND kind='main'")[0];
  ok('★saves.blob は NULL（巨大文字列を1列に入れていない＝TOOBIG が原理的に起きない）', row.blob === null);
  ok("★storage_mode='chunks-v1' / generation_id / chunk_count / byte_length が揃っている",
     row.storage_mode === 'chunks-v1' && !!row.generation_id && row.chunk_count > 1 && row.byte_length === Buffer.byteLength(str, 'utf8'),
     { m: row.storage_mode, g: row.generation_id, c: row.chunk_count, b: row.byte_length });
  ok('★size 列は論理payload長(クライアント互換)', row.size === str.length);
  const cn = DB.q('SELECT COUNT(*) AS n FROM save_chunks')[0].n;
  ok('★chunk 件数が manifest と一致', cn === row.chunk_count, { rows: cn, manifest: row.chunk_count });
  const maxLen = Math.max.apply(null, DB.q('SELECT data FROM save_chunks').map(r => String(r.data).length));
  ok('★1chunk は CHUNK_SIZE 以下', maxLen <= T.CHUNK_SIZE_V27, maxLen);
  const g = await call(W, env, { op: 'get' });
  ok('★★★get の read-back が送信payloadと文字列として完全一致', g.status === 200 && JSON.stringify(g.json.data) === str,
     { status: g.status, len: g.json && g.json.data ? JSON.stringify(g.json.data).length : null, want: str.length });
  ok('★get の rev も一致', g.json.rev === r.json.rev);
  const cs = await call(W, env, { op: 'commitstate' });
  ok('★commitstate の packageHash が put 応答と一致(三者一致が chunks でも成立)', cs.json.packageHash === r.json.packageHash);
  ok('★commitstate は hashComputedOnRead:false(chunks 行は必ず hash を持つ)', cs.json.hashComputedOnRead === false);
  ok('★commitstate.size も論理payload長', cs.json.size === str.length);
}

/* ============================================================ */
console.log('\n== (5) 契約3: 日本語・絵文字（サロゲートペア）を跨ぐ位置でも完全復元 ==');
{
  const { W, env, DB } = await makeEnvW();
  // JSON.stringify 後に chunk 境界が絵文字のペア内側へ落ちるよう、前置きの長さを1文字ずつずらして総当りする
  let found = null;
  for (let padDelta = 0; padDelta < 6 && !found; padDelta++) {
    const pkg = { device: 'd', updatedAt: 1, ls: { p: 'x'.repeat(padDelta), b: '😀'.repeat(600000) + 'あいうえお🎉' } };
    const s = payloadStrOf(pkg);
    const c = s.charCodeAt(T.CHUNK_SIZE_V27 - 1);
    if (c >= 0xD800 && c <= 0xDBFF) found = { pkg: pkg, str: s, delta: padDelta };
  }
  ok('★chunk 境界がサロゲートペアの内側に落ちる payload を作れた', !!found, found && found.delta);
  const pkg = found ? found.pkg : { device: 'd', updatedAt: 1, ls: { b: '😀'.repeat(600000) } };
  const str = payloadStrOf(pkg);
  const r = await call(W, env, { op: 'put', pkg: pkg });
  ok('★put 成功', r.status === 200 && r.json.ok === true, r.json);
  ok('★chunks-v1 になっている', r.json.storageMode === 'chunks-v1');
  ok('★保存された chunk に孤立サロゲートが1つも無い',
     !DB.q('SELECT data FROM save_chunks').some(x => hasLoneSurrogate(String(x.data))));
  const g = await call(W, env, { op: 'get' });
  ok('★★★絵文字を跨いでも read-back が完全一致(U+FFFD 置換が起きていない)',
     g.status === 200 && JSON.stringify(g.json.data) === str);
  ok('★★元の絵文字がそのまま残っている', g.status === 200 && JSON.stringify(g.json.data).indexOf('あいうえお🎉') >= 0);
}

/* ============================================================ */
console.log('\n== (6) 契約4/5: chunk 欠落・件数不一致・hash不一致は fail-closed（部分本文を返さない） ==');
{
  // (a) 1件欠落
  {
    const { W, env, DB } = await makeEnvW();
    const pkg = bigPkg(1100000, 'あ'); const str = payloadStrOf(pkg);
    await call(W, env, { op: 'put', pkg: pkg });
    const before = DB.q('SELECT COUNT(*) AS n FROM save_chunks')[0].n;
    DB.__raw.exec("DELETE FROM save_chunks WHERE idx=1");
    ok('★仕込み: chunk を1件消した', DB.q('SELECT COUNT(*) AS n FROM save_chunks')[0].n === before - 1);
    const g = await call(W, env, { op: 'get' });
    ok('★★★get は 500 / errorCode:chunk-integrity', g.status === 500 && g.json.errorCode === 'chunk-integrity', { s: g.status, j: g.json });
    ok('★★retryable:false（再送で直らない＝壊れた canonical の上書きを誘発しない）', g.json.retryable === false);
    ok('★★★部分本文を1バイトも返していない', g.text.indexOf('あああ') < 0 && !('data' in (g.json || {})));
    ok('★理由が判別できる(chunk-count-mismatch)', g.json.reason === 'chunk-count-mismatch', g.json.reason);
  }
  // (b) 件数は合うが中身が違う（hash 不一致）
  {
    const { W, env, DB } = await makeEnvW();
    const pkg = bigPkg(1100000, 'あ'); const str = payloadStrOf(pkg);
    await call(W, env, { op: 'put', pkg: pkg });
    const one = DB.q('SELECT idx, data FROM save_chunks ORDER BY idx')[1];
    const tampered = 'い' + String(one.data).slice(1);   // 長さは同じ・中身だけ違う
    DB.__raw.prepare('UPDATE save_chunks SET data=?1 WHERE idx=?2').run(tampered, one.idx);
    const g = await call(W, env, { op: 'get' });
    ok('★★★中身だけ差し替えても検出する(長さ検査だけでは通ってしまう改変)',
       g.status === 500 && g.json.errorCode === 'chunk-integrity' && g.json.reason === 'hash-mismatch', g.json);
    ok('★★部分本文を返していない', !('data' in (g.json || {})) && g.text.indexOf('いあ') < 0);
  }
  // (c) 余計な chunk が増えた（件数不一致）
  {
    const { W, env, DB } = await makeEnvW();
    const pkg = bigPkg(1100000, 'あ'); const str = payloadStrOf(pkg);
    await call(W, env, { op: 'put', pkg: pkg });
    const row = DB.q("SELECT generation_id, chunk_count FROM saves WHERE kind='main'")[0];
    DB.__raw.prepare('INSERT INTO save_chunks (u,kind,generation_id,idx,data,created_at) VALUES (?1,?2,?3,?4,?5,?6)')
      .run('code:master', 'main', row.generation_id, row.chunk_count, 'ごみ', Date.now());
    const g = await call(W, env, { op: 'get' });
    ok('★★★chunk が増えていても fail-closed', g.status === 500 && g.json.errorCode === 'chunk-integrity' && g.json.reason === 'chunk-count-mismatch', g.json);
  }
  // (d) manifest が壊れている（generation_id が消えた）
  {
    const { W, env, DB } = await makeEnvW();
    const pkg = bigPkg(1100000, 'あ');
    await call(W, env, { op: 'put', pkg: pkg });
    DB.__raw.exec("UPDATE saves SET generation_id=NULL WHERE kind='main'");
    const g = await call(W, env, { op: 'get' });
    ok('★★manifest 欠損も fail-closed(空データを ok:true で返さない)',
       g.status === 500 && g.json.errorCode === 'chunk-integrity' && g.json.reason === 'manifest-missing', g.json);
  }
  // (e) 壊れた canonical に対する commitstate / baseRev無しput も fail-closed
  {
    const { W, env, DB } = await makeEnvW();
    const pkg = slotsMetaPkg([{ id: 's1', deleted: true, deleteOpId: 'op1', lifecycleVersion: 2, recoverySnapshotId: 'r1' }], 1100000);
    await call(W, env, { op: 'put', pkg: pkg });
    ok('★前提: chunks-v1 で保存された', DB.q("SELECT storage_mode FROM saves WHERE kind='main'")[0].storage_mode === 'chunks-v1');
    DB.__raw.exec('DELETE FROM save_chunks WHERE idx=0');
    const cs = await call(W, env, { op: 'commitstate', slotId: 's1' });
    ok('★★commitstate(slotId付き) も fail-closed（墓標を「無い」と答えない）',
       cs.status === 500 && cs.json.errorCode === 'chunk-integrity', cs.json);
    const p2 = await call(W, env, { op: 'put', pkg: { device: 'x', updatedAt: 2, ls: {} } });
    ok('★★★baseRev 無しの put も fail-closed（墓標を確かめられないまま上書きさせない）',
       p2.status === 500 && p2.json.errorCode === 'chunk-integrity', p2.json);
    const stillBroken = DB.q("SELECT storage_mode, generation_id FROM saves WHERE kind='main'")[0];
    ok('★★canonical を上書きしていない(壊れたまま残す＝復旧の余地を残す)', stillBroken.storage_mode === 'chunks-v1');
    const fp = await call(W, env, { op: 'forceput', pkg: { device: 'x', updatedAt: 2, ls: {} } });
    ok('★★forceput も fail-closed(墓標guardが確認できないので通さない)',
       fp.status === 500 && fp.json.errorCode === 'chunk-integrity', fp.json);
  }
}

/* ============================================================ */
console.log('\n== (7) 契約6: baseRev 競合 — canonical 不変・fork 応答・staging が残らない ==');
{
  // (a) baseRev がズレている put（巨大payload）は fork になり、canonical は1バイトも動かない
  const { W, env, DB } = await makeEnvW();
  const pkgA = bigPkg(1100000, 'あ'); const strA = payloadStrOf(pkgA);
  const r1 = await call(W, env, { op: 'put', pkg: pkgA, baseRev: 0 });
  ok('★1回目の put 成功(rev=1)', r1.json.ok === true && r1.json.rev === 1, r1.json);
  const canonBefore = DB.q("SELECT rev, generation_id, package_hash FROM saves WHERE kind='main'")[0];
  const genCountBefore = DB.q("SELECT COUNT(DISTINCT generation_id) AS n FROM save_chunks WHERE kind='main'")[0].n;

  const pkgB = bigPkg(1100000, 'い'); const strB = payloadStrOf(pkgB);
  const r2 = await call(W, env, { op: 'put', pkg: pkgB, baseRev: 0 });   // 現行 rev=1 なのに baseRev=0
  ok('★★baseRev 競合は fork 応答(データを消さない)', r2.status === 200 && r2.json.ok === true && r2.json.fork === true, r2.json);
  const canonAfter = DB.q("SELECT rev, generation_id, package_hash FROM saves WHERE kind='main'")[0];
  ok('★★★canonical は不変(rev / generation_id / package_hash が動いていない)',
     canonAfter.rev === canonBefore.rev && canonAfter.generation_id === canonBefore.generation_id && canonAfter.package_hash === canonBefore.package_hash,
     { before: canonBefore, after: canonAfter });
  ok('★★main 側に staging(別世代)の chunk が1件も残っていない',
     DB.q("SELECT COUNT(DISTINCT generation_id) AS n FROM save_chunks WHERE kind='main'")[0].n === genCountBefore,
     DB.q("SELECT DISTINCT generation_id FROM save_chunks WHERE kind='main'"));
  const g1 = await call(W, env, { op: 'get' });
  ok('★★canonical の本文は1回目のまま', JSON.stringify(g1.json.data) === strA);
  // fork 側も chunks-v1 で保存され、読み出せる（契約11: fork 経路も閾値超で成功）
  const forkRow = DB.q("SELECT kind, storage_mode, chunk_count FROM saves WHERE kind<>'main'")[0];
  ok('★★fork 行も chunks-v1 で保存された(競合時だけ TOOBIG で落ちる穴が無い)',
     !!forkRow && forkRow.storage_mode === 'chunks-v1' && forkRow.chunk_count > 1, forkRow);
  const gf = await call(W, env, { op: 'getfork', kind: forkRow.kind });
  ok('★★★getfork が incoming payload と完全一致で戻る', gf.status === 200 && JSON.stringify(gf.json.data) === strB,
     { status: gf.status, len: gf.json && gf.json.data ? JSON.stringify(gf.json.data).length : null });

  // (b) CAS の直前に別 push が割り込んだ場合（0行更新）でも staging が残らない
  const e2 = await makeEnvW();
  const pkgC = bigPkg(1100000, 'う');
  await call(e2.W, e2.env, { op: 'put', pkg: pkgC, baseRev: 0 });
  const genBefore2 = e2.DB.q("SELECT DISTINCT generation_id FROM save_chunks WHERE kind='main'").map(r => r.generation_id);
  const canon2 = e2.DB.q("SELECT rev, generation_id FROM saves WHERE kind='main'")[0];
  let injected = false;
  e2.DB.__hooks.before = (sql) => {
    if (!injected && /UPDATE saves SET rev=rev\+1/.test(sql) && /AND rev=\?8/.test(sql)) {
      injected = true;
      e2.DB.__raw.exec("UPDATE saves SET rev=rev+1 WHERE kind='main'");   // 別デバイスが先にコミットした
    }
  };
  const pkgD = bigPkg(1100000, 'え'); const strD = payloadStrOf(pkgD);
  const r3 = await call(e2.W, e2.env, { op: 'put', pkg: pkgD, baseRev: 1 });
  e2.DB.__hooks.before = null;
  ok('★仕込み: CAS 直前に別 push を割り込ませた', injected);
  ok('★★CAS 0行 → fork 応答(v26 と同じ形)', r3.status === 200 && r3.json.ok === true && r3.json.fork === true, r3.json);
  const gensAfter2 = e2.DB.q("SELECT DISTINCT generation_id FROM save_chunks WHERE kind='main'").map(r => r.generation_id);
  ok('★★★CAS に負けた staging が main の chunk に残っていない',
     gensAfter2.length === genBefore2.length && gensAfter2.every(g => genBefore2.indexOf(g) >= 0), { before: genBefore2, after: gensAfter2 });
  const forkRow2 = e2.DB.q("SELECT kind FROM saves WHERE kind<>'main'")[0];
  const gf2 = await call(e2.W, e2.env, { op: 'getfork', kind: forkRow2.kind });
  ok('★★負けた側の payload は fork として完全に保持されている(データを消さない)', JSON.stringify(gf2.json.data) === strD);
}

/* ============================================================ */
console.log('\n== (8) 契約7: 旧 inline 行はそのまま読める / inline と chunks が混在できる ==');
{
  const { W, env, DB } = await makeEnvW();
  await call(W, env, { op: 'meta' });   // migration
  // v26 が書いたのと同じ形の行を直接入れる（storage_mode 列は NULL）
  const legacy = JSON.stringify({ device: 'old', updatedAt: 5, ls: { legacy: 'むかしのデータ' } });
  DB.__raw.prepare('INSERT INTO saves (u,kind,rev,baseRev,updatedAt,device,size,blob) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)')
    .run('code:master', 'main', 7, 6, 5, 'old', legacy.length, legacy);
  const legacyFork = JSON.stringify({ device: 'oldfork', updatedAt: 4, ls: { f: 'ふるいfork' } });
  DB.__raw.prepare('INSERT INTO saves (u,kind,rev,baseRev,updatedAt,device,size,blob) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)')
    .run('code:master', 'fork:old:1', 6, 5, 4, 'oldfork', legacyFork.length, legacyFork);
  ok('★仕込み: storage_mode が NULL の旧行', DB.q("SELECT storage_mode FROM saves WHERE kind='main'")[0].storage_mode === null);

  const g = await call(W, env, { op: 'get' });
  ok('★★storage_mode=NULL の旧行を inline として読める(1バイトも書き換えずに)',
     g.status === 200 && JSON.stringify(g.json.data) === legacy, g.json);
  const cs = await call(W, env, { op: 'commitstate' });
  ok('★★旧行の commitstate は hash をその場で計算して返す(v25 の挙動のまま)',
     cs.json.hashComputedOnRead === true && cs.json.packageHash === (await sha256(legacy)), cs.json);
  ok("★★旧行の storageMode は 'inline-v1' として見える", cs.json.storageMode === 'inline-v1');
  ok('★★旧行を読んでも DB を書き換えていない',
     DB.q("SELECT storage_mode, package_hash FROM saves WHERE kind='main'")[0].storage_mode === null);

  // main を chunks 化しても、旧 inline の fork は読めたまま（混在）
  const bigp = bigPkg(1100000, 'お'); const bigs = payloadStrOf(bigp);
  const r = await call(W, env, { op: 'put', pkg: bigp, baseRev: 7 });
  ok('★旧行の上に閾値超 put が通る(rev は +1)', r.json.ok === true && r.json.rev === 8, r.json);
  ok("★main は chunks-v1 へ切り替わり blob は NULL",
     (function () { const x = DB.q("SELECT storage_mode, blob FROM saves WHERE kind='main'")[0]; return x.storage_mode === 'chunks-v1' && x.blob === null; })());
  const g2 = await call(W, env, { op: 'get' });
  ok('★★chunks 化した main が完全一致で読める', JSON.stringify(g2.json.data) === bigs);
  const gf = await call(W, env, { op: 'getfork', kind: 'fork:old:1' });
  ok('★★★同じユーザーの中で inline(fork) と chunks(main) が混在して両方読める',
     gf.status === 200 && JSON.stringify(gf.json.data) === legacyFork, gf.json);

  // chunks → inline へ戻す（小さい put）。manifest がリセットされ、古い chunk を読まない
  const smallp = { device: 'z', updatedAt: 9, ls: { s: 'ちいさい' } }; const smalls = payloadStrOf(smallp);
  const r2 = await call(W, env, { op: 'put', pkg: smallp, baseRev: 8 });
  ok('★閾値以下へ戻る put も成功', r2.json.ok === true && r2.json.storageMode === 'inline-v1', r2.json);
  const row2 = DB.q("SELECT storage_mode, generation_id, chunk_count, blob FROM saves WHERE kind='main'")[0];
  ok('★★★chunks→inline の切替で manifest が必ずリセットされる(古い chunk を読む事故を根治)',
     row2.storage_mode === 'inline-v1' && row2.generation_id === null && row2.chunk_count === null && row2.blob === smalls, row2);
  const g3 = await call(W, env, { op: 'get' });
  ok('★★切替後の get は新しい小さい本文(古い巨大本文ではない)', JSON.stringify(g3.json.data) === smalls);
}

/* ============================================================ */
console.log('\n== (9) 契約8: forceput の墓標guard・既存不変条件が閾値超でも維持される ==');
{
  const tomb = [{ id: 's1', deleted: true, deleteOpId: 'op-1', lifecycleVersion: 3, recoverySnapshotId: 'snap-1' }];
  // (a) 墓標を消す forceput は 409（chunks-v1 の canonical でも同じ）
  {
    const { W, env, DB } = await makeEnvW();
    const pkg = slotsMetaPkg(tomb, 1100000);
    const r = await call(W, env, { op: 'put', pkg: pkg });
    ok('★前提: canonical は chunks-v1', r.json.storageMode === 'chunks-v1', r.json.storageMode);
    const canonBefore = DB.q("SELECT rev, generation_id, package_hash FROM saves WHERE kind='main'")[0];
    const bad = slotsMetaPkg([{ id: 's1', deleted: false }], 1100000);
    const f = await call(W, env, { op: 'forceput', pkg: bad });
    ok('★★★閾値超でも墓標guardが効く(409 / tombstone-clear-refused)',
       f.status === 409 && f.json.errorCode === 'tombstone-clear-refused', { s: f.status, j: f.json });
    ok('★★拒否時の tombstones に対象IDが入る(v25 の契約のまま)', Array.isArray(f.json.tombstones) && f.json.tombstones.indexOf('s1') >= 0, f.json.tombstones);
    ok('★★retryable:false / rev は現行値', f.json.retryable === false && f.json.rev === canonBefore.rev);
    const canonAfter = DB.q("SELECT rev, generation_id, package_hash FROM saves WHERE kind='main'")[0];
    ok('★★★拒否時に canonical は1バイトも動かない', JSON.stringify(canonAfter) === JSON.stringify(canonBefore), { canonBefore, canonAfter });
    ok('★★拒否時に staging chunk を残さない',
       DB.q("SELECT COUNT(DISTINCT generation_id) AS n FROM save_chunks WHERE kind='main'")[0].n === 1);
  }
  // (b) 墓標を保ったままの forceput は通り、旧 canonical は fork へ退避され読める
  {
    const { W, env, DB } = await makeEnvW();
    const pkg = slotsMetaPkg(tomb, 1100000); const str1 = payloadStrOf(pkg);
    await call(W, env, { op: 'put', pkg: pkg });
    const keep = slotsMetaPkg(tomb.concat([{ id: 's2', deleted: false }]), 1100000); const str2 = payloadStrOf(keep);
    const f = await call(W, env, { op: 'forceput', pkg: keep });
    ok('★★閾値超の forceput が成功する', f.status === 200 && f.json.ok === true && f.json.rev === 2, f.json);
    ok("★storageMode は chunks-v1", f.json.storageMode === 'chunks-v1');
    const g = await call(W, env, { op: 'get' });
    ok('★★forceput 後の canonical が送信payloadと完全一致', JSON.stringify(g.json.data) === str2);
    const forkKind = DB.q("SELECT kind FROM saves WHERE kind<>'main'")[0];
    ok('★★旧 canonical が fork へ退避された', !!forkKind, forkKind);
    const gf = await call(W, env, { op: 'getfork', kind: forkKind.kind });
    ok('★★★退避 fork が「退避前の canonical」と完全一致で読める(chunk のコピー漏れが無い)',
       gf.status === 200 && JSON.stringify(gf.json.data) === str1,
       { status: gf.status, len: gf.json && gf.json.data ? JSON.stringify(gf.json.data).length : null, want: str1.length });
    ok('★退避 fork も chunks-v1', DB.q("SELECT storage_mode FROM saves WHERE kind<>'main'")[0].storage_mode === 'chunks-v1');
    ok('★退避 fork の chunk は fork の kind で複製されている',
       DB.q("SELECT COUNT(*) AS n FROM save_chunks WHERE kind<>'main'")[0].n > 1);
  }
  // (c) 正式 restore（restoreOfDeleteOpId 一致）は閾値超でも通る
  {
    const { W, env, DB } = await makeEnvW();
    const pkg = slotsMetaPkg(tomb, 1100000);
    await call(W, env, { op: 'put', pkg: pkg });
    const restored = slotsMetaPkg([{ id: 's1', deleted: false }], 1100000); const strR = payloadStrOf(restored);
    const f = await call(W, env, { op: 'forceput', pkg: restored, restoreOfDeleteOpId: 'op-1' });
    ok('★★正式 restore は閾値超でも通る(v25c の例外規則が生きている)', f.status === 200 && f.json.ok === true, f.json);
    const g = await call(W, env, { op: 'get' });
    ok('★★restore 後の本文が完全一致', JSON.stringify(g.json.data) === strR);
  }
  // (d) baseRev 無し put の墓標guard（fork へ倒す）も閾値超で維持
  {
    const { W, env, DB } = await makeEnvW();
    const pkg = slotsMetaPkg(tomb, 1100000); const str1 = payloadStrOf(pkg);
    await call(W, env, { op: 'put', pkg: pkg });
    const naive = bigPkg(1100000, 'か'); const strN = payloadStrOf(naive);
    const p = await call(W, env, { op: 'put', pkg: naive });   // baseRev 無し（旧クライアント）
    ok('★★baseRev 無し put は墓標があるので fork へ倒れる(v24 の契約のまま)', p.json.ok === true && p.json.fork === true, p.json);
    const g = await call(W, env, { op: 'get' });
    ok('★★canonical(墓標つき)は守られたまま', JSON.stringify(g.json.data) === str1);
  }
}

/* ============================================================ */
console.log('\n== (10) 契約9: 同一 mid の再送で重複 generation を作らない ==');
{
  const { W, env, DB } = await makeEnvW();
  const pkg = bigPkg(1100000, 'き'); const str = payloadStrOf(pkg);
  const r1 = await call(W, env, { op: 'put', pkg: pkg, baseRev: 0, mid: 'm-1' });
  ok('★1回目 成功', r1.json.ok === true && r1.json.rev === 1, r1.json);
  const gens1 = DB.q('SELECT DISTINCT generation_id FROM save_chunks').map(r => r.generation_id);
  const rows1 = DB.q('SELECT COUNT(*) AS n FROM save_chunks')[0].n;
  const r2 = await call(W, env, { op: 'put', pkg: pkg, baseRev: 0, mid: 'm-1' });
  ok('★★同一 mid・同一 payload の再送は replay(v18 の冪等挙動のまま)', r2.json.ok === true && r2.json.replayed === true, r2.json);
  ok('★★rev が二重に進んでいない', r2.json.rev === r1.json.rev && DB.q("SELECT rev FROM saves WHERE kind='main'")[0].rev === 1);
  const gens2 = DB.q('SELECT DISTINCT generation_id FROM save_chunks').map(r => r.generation_id);
  ok('★★★重複 generation を作っていない', gens2.length === gens1.length && gens2.length === 1, { gens1, gens2 });
  ok('★★chunk 行も増えていない', DB.q('SELECT COUNT(*) AS n FROM save_chunks')[0].n === rows1);
  // 別 payload を同じ mid で送ったら 409（v25b/v25c の契約）
  const other = bigPkg(1100000, 'く');
  const r3 = await call(W, env, { op: 'put', pkg: other, baseRev: 0, mid: 'm-1' });
  ok('★★同一 mid で別 payload は 409 idem-key-reuse(閾値超でも維持)', r3.status === 409 && r3.json.errorCode === 'idem-key-reuse', r3.json);
  ok('★★409 のときも staging が残らない', DB.q('SELECT COUNT(DISTINCT generation_id) AS n FROM save_chunks')[0].n === 1);
}

/* ============================================================ */
console.log('\n== (11) 契約10: 途中で書込例外が起きても、旧 canonical はそのまま読める ==');
{
  // (a) chunk の途中で例外
  {
    const { W, env, DB } = await makeEnvW();
    const pkgA = bigPkg(1100000, 'け'); const strA = payloadStrOf(pkgA);
    await call(W, env, { op: 'put', pkg: pkgA, baseRev: 0 });
    const canonBefore = DB.q("SELECT rev, generation_id, package_hash, chunk_count FROM saves WHERE kind='main'")[0];
    let n = 0;
    DB.__hooks.before = (sql) => { if (/INSERT INTO save_chunks \(u, kind, generation_id, idx, data, created_at\) VALUES/.test(sql)) { n++; if (n === 3) throw new Error('D1_ERROR: simulated write failure'); } };
    const pkgB = bigPkg(1100000, 'こ');
    const r = await call(W, env, { op: 'put', pkg: pkgB, baseRev: 1 });
    DB.__hooks.before = null;
    ok('★仕込み: chunk 書込の途中で例外が起きた', n >= 3, n);
    ok('★★例外は既存の統一契約で返る(500 / errorCode:exception / retryable:true)',
       r.status === 500 && r.json.errorCode === 'exception' && r.json.retryable === true, r.json);
    const canonAfter = DB.q("SELECT rev, generation_id, package_hash, chunk_count FROM saves WHERE kind='main'")[0];
    ok('★★★canonical は1バイトも動いていない', JSON.stringify(canonAfter) === JSON.stringify(canonBefore), { canonBefore, canonAfter });
    const g = await call(W, env, { op: 'get' });
    ok('★★★失敗後も旧 canonical が完全一致で読める', g.status === 200 && JSON.stringify(g.json.data) === strA);
    ok('★★書きかけの世代が残っていない(staging を必ず片付ける)',
       DB.q("SELECT COUNT(DISTINCT generation_id) AS n FROM save_chunks WHERE kind='main'")[0].n === 1,
       DB.q("SELECT DISTINCT generation_id FROM save_chunks WHERE kind='main'"));
  }
  // (b) manifest 切替(UPDATE saves)で例外
  {
    const { W, env, DB } = await makeEnvW();
    const pkgA = bigPkg(1100000, 'さ'); const strA = payloadStrOf(pkgA);
    await call(W, env, { op: 'put', pkg: pkgA, baseRev: 0 });
    const canonBefore = DB.q("SELECT rev, generation_id FROM saves WHERE kind='main'")[0];
    DB.__hooks.before = (sql) => { if (/UPDATE saves SET rev=rev\+1/.test(sql) && /AND rev=\?8/.test(sql)) throw new Error('D1_ERROR: simulated commit failure'); };
    const r = await call(W, env, { op: 'put', pkg: bigPkg(1100000, 'し'), baseRev: 1 });
    DB.__hooks.before = null;
    ok('★★manifest 切替で落ちても 500(exception)', r.status === 500 && r.json.errorCode === 'exception', r.json);
    const canonAfter = DB.q("SELECT rev, generation_id FROM saves WHERE kind='main'")[0];
    ok('★★canonical は不変', JSON.stringify(canonAfter) === JSON.stringify(canonBefore));
    const g = await call(W, env, { op: 'get' });
    ok('★★旧 canonical が読める', JSON.stringify(g.json.data) === strA);
    ok('★★staging が残っていない', DB.q("SELECT COUNT(DISTINCT generation_id) AS n FROM save_chunks WHERE kind='main'")[0].n === 1);
  }
}

/* ============================================================ */
console.log('\n== (12) orphan GC と trimForks（ゴミが無限に積み上がらない） ==');
{
  const { W, env, DB } = await makeEnvW();
  const grace = T.CHUNK_GC_GRACE_MS_V27;
  ok('★GC には猶予がある(他リクエストの staging を巻き添えにしない)', grace > 0, grace);
  let rev = 0;
  for (let i = 0; i < 3; i++) {
    const r = await call(W, env, { op: 'put', pkg: bigPkg(1100000, String.fromCharCode(0x3042 + i)), baseRev: rev });
    rev = r.json.rev;
    // 猶予を越えたことにする（テスト内で5分待たないため created_at を過去へ倒す）
    DB.__raw.prepare('UPDATE save_chunks SET created_at=?1').run(Date.now() - grace - 60000);
  }
  const r4 = await call(W, env, { op: 'put', pkg: bigPkg(1100000, 'ぞ'), baseRev: rev });
  const gens = DB.q("SELECT DISTINCT generation_id FROM save_chunks WHERE kind='main'").map(x => x.generation_id);
  const cur = DB.q("SELECT generation_id FROM saves WHERE kind='main'")[0].generation_id;
  ok('★★何度書いても main の chunk 世代は1つに収束する(orphan GC)', gens.length === 1 && gens[0] === cur, { gens, cur });
  const g = await call(W, env, { op: 'get' });
  ok('★★GC 後も canonical が完全一致で読める(現行世代を消していない)',
     JSON.stringify(g.json.data) === payloadStrOf(bigPkg(1100000, 'ぞ')));

  // trimForks: 4本目の fork を作ると古い fork 行が消え、その chunk も消える
  const e2 = await makeEnvW();
  let rv = 0;
  const r0 = await call(e2.W, e2.env, { op: 'put', pkg: bigPkg(1100000, 'た'), baseRev: 0 }); rv = r0.json.rev;
  for (let i = 0; i < 4; i++) {
    await call(e2.W, e2.env, { op: 'put', pkg: bigPkg(1100000, 'ち' + i), baseRev: 0 });   // 毎回 baseRev ズレ = fork
  }
  const forkKinds = e2.DB.q("SELECT kind FROM saves WHERE kind<>'main'").map(r => r.kind);
  ok('★fork は3本までに保たれる(v14 からの契約)', forkKinds.length === 3, forkKinds.length);
  const chunkKinds = e2.DB.q("SELECT DISTINCT kind FROM save_chunks WHERE kind<>'main'").map(r => r.kind);
  ok('★★★消された fork の chunk も一緒に消える(永久ゴミにならない)',
     chunkKinds.every(k => forkKinds.indexOf(k) >= 0), { chunkKinds, forkKinds });
  ok('★残った fork は全部読める', await (async () => {
    for (const k of forkKinds) { const g = await call(e2.W, e2.env, { op: 'getfork', kind: k }); if (g.status !== 200 || !g.json.data) return false; }
    return true;
  })());
}

/* ============================================================ */
console.log('\n== (13) 既存の不変条件（v27 で変えていないこと） ==');
{
  const { W, env, DB } = await makeEnvW();
  // 4MB ガードは維持
  const huge = { device: 'd', updatedAt: 1, ls: { a: 'x'.repeat(4 * 1024 * 1024 + 100) } };
  const r = await call(W, env, { op: 'put', pkg: huge });
  ok('★★4MB ガードは維持(413 / too-large / retryable:false)',
     r.status === 413 && r.json.errorCode === 'too-large' && r.json.retryable === false, { s: r.status, j: r.json });
  ok('★413 のとき saves に行を作っていない', DB.q("SELECT COUNT(*) AS n FROM saves")[0].n === 0);
  ok('★413 のとき chunk も書いていない', DB.q('SELECT COUNT(*) AS n FROM save_chunks')[0].n === 0);
  // 1.3MB〜4MB(char)だが UTF-8 で 4MB 超 → 二段チェックで 413（chunk 経路でも従来どおり通す）
  const r2 = await call(W, env, { op: 'put', pkg: { device: 'd', updatedAt: 1, ls: { a: 'あ'.repeat(1400000) } } });
  ok('★★二段チェック(char 1.3MB 超 → byte 精査)も従来どおり動く', r2.status === 413 && r2.json.errorCode === 'too-large', { s: r2.status, j: r2.json });
  // 未知 op / bad-request / getfork not-found
  const r3 = await call(W, env, { op: 'nonsense' });
  ok('★未知 op は 400 bad-op(文言も含め従来どおり)', r3.status === 400 && r3.json.errorCode === 'bad-op', r3.json);
  const r4 = await call(W, env, { op: 'put' });
  ok('★pkg 無しは 400 bad-request', r4.status === 400 && r4.json.errorCode === 'bad-request', r4.json);
  const r5 = await call(W, env, { op: 'getfork', kind: 'fork:none' });
  ok('★存在しない fork は 404 not-found', r5.status === 404 && r5.json.errorCode === 'not-found', r5.json);
  const r6 = await call(W, env, { op: 'get' });
  ok('★行が無いときの get は ok:true / data:null(D1あり・KVフォールバック)', r6.status === 200 && r6.json.ok === true && r6.json.data === null, r6.json);
  const r7 = await call(W, env, { op: 'commitstate' });
  ok('★行が無いときの commitstate は exists:false / rev:0', r7.json.exists === false && r7.json.rev === 0, r7.json);
  const r8 = await call(W, env, { op: 'forks' });
  ok('★forks は空配列', r8.json.ok === true && Array.isArray(r8.json.forks) && r8.json.forks.length === 0);
  // 認証まわりは触っていない
  const noAuth = new Request('https://example.invalid/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'meta' }) });
  const ra = await W.handleSave(noAuth, env, makeCtx());
  ok('★認証なしは 401 errorCode:auth(v16 の統一契約のまま)', ra.status === 401 && JSON.parse(await ra.text()).errorCode === 'auth');
}

/* ============================================================ */
console.log('\n== (14) migration（既存データを壊さずに列と表を足す） ==');
{
  const { W, env, DB } = await makeEnvW();
  // v26 相当のスキーマを先に作っておく（既存本番の状態を再現）
  DB.__raw.exec("CREATE TABLE saves (u TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'main', rev INTEGER NOT NULL DEFAULT 0, baseRev INTEGER DEFAULT 0, updatedAt INTEGER, device TEXT, size INTEGER, blob TEXT, createdAt INTEGER, package_hash TEXT, last_commit_op_id TEXT, hash_alg TEXT, PRIMARY KEY (u, kind))");
  const old = JSON.stringify({ device: 'old', updatedAt: 1, ls: { keep: 'のこる' } });
  DB.__raw.prepare('INSERT INTO saves (u,kind,rev,baseRev,updatedAt,device,size,blob,package_hash,hash_alg) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)')
    .run('code:master', 'main', 42, 41, 1, 'old', old.length, old, await sha256(old), 'sha256-utf8-v1');
  const m = await call(W, env, { op: 'meta' });
  ok('★★ALTER TABLE ADD COLUMN で列を足せた(既存表を作り直していない)', m.json.ok === true && m.json.rev === 42, m.json);
  const cols = DB.q('PRAGMA table_info(saves)').map(c => c.name);
  ok('★storage_mode / generation_id / byte_length / chunk_count が足された',
     ['storage_mode', 'generation_id', 'byte_length', 'chunk_count'].every(c => cols.indexOf(c) >= 0), cols);
  ok('★save_chunks 表が作られた', DB.q("SELECT name FROM sqlite_master WHERE type='table' AND name='save_chunks'").length === 1);
  const row = DB.q("SELECT * FROM saves WHERE kind='main'")[0];
  ok('★★★既存行の中身は1バイトも書き換わっていない',
     row.blob === old && row.rev === 42 && row.baseRev === 41 && row.package_hash === (await sha256(old)) && row.storage_mode === null, row.rev);
  const g = await call(W, env, { op: 'get' });
  ok('★★migration 後も既存行がそのまま読める', JSON.stringify(g.json.data) === old);
  // もう一度 migration が走っても壊れない（duplicate column を握り潰す範囲が正しい）
  const { W: W2 } = await makeEnvW();
  const m2 = await W2.handleSave(req({ op: 'meta' }), env, makeCtx());
  ok('★★2回目の migration も成功する(duplicate column を正しく無視)', (await m2.json()).ok === true);
}

/* ============================================================ */
console.log('\n== (15) 静的検査: 論理契約を変えていないこと（差分の輪郭を固定する） ==');
{
  const codeLines = (src) => src.split('\n').filter(l => {
    const t = l.trim();
    return t && !t.startsWith('//') && !t.startsWith('*') && t.slice(0, 2) !== '/' + '*';
  }).join('\n');
  const C27 = codeLines(SRC27);
  ok('★capabilities は v26 のまま（新能力をまだ公開しない）',
     /capabilities: \{ tombstoneGuard: 1, packageHash: HASH_ALG_V25, commitOpId: 1, commitState: 2 \}/.test(C27));
  ok("★workerBuild は 'v27'", /workerBuild: 'v27'/.test(C27));
  ok('★ルートJSONの既存キーは残っている(削除ゼロ)',
     ["service: 'chronicle-proxy'", 'freeFallback: true', 'tombstoneGuard: true', 'inspectSpec:', 'avatarGuardSpec:'].every(k => C27.indexOf(k) >= 0));
  ok('★op の一覧(受け付ける口)が v26 と同じ',
     /unknown save op \(get\|put\|forceput\|meta\|commitstate\|putimg\|forks\|getfork\)/.test(C27));
  ok('★★put の CAS は rev 条件付き UPDATE のまま(楽観ロックを緩めていない)',
     /UPDATE saves SET rev=rev\+1[^']*WHERE u=\?1 AND kind=\?2 AND rev=\?8 RETURNING rev/.test(C27));
  ok('★★blob を書く SQL は必ず storage_mode も一緒に書く(manifest リセット漏れの根治)', (function () {
    const lines = C27.split('\n').filter(l => /(UPDATE saves SET|INSERT (OR IGNORE )?INTO saves)/.test(l) && /blob/.test(l));
    return lines.length > 0 && lines.every(l => /storage_mode/.test(l));
  })(), C27.split('\n').filter(l => /(UPDATE saves SET|INSERT (OR IGNORE )?INTO saves)/.test(l) && /blob/.test(l)).length);
  ok('★★saves から blob を読む SELECT は必ず manifest 列も読む(inline 前提で読む経路が残っていない)', (function () {
    const lines = C27.split('\n').filter(l => /SELECT[^']*\bblob\b[^']*FROM saves/.test(l) || /prepare\('SELECT ' \+ SAVE_BODY_COLS_V27/.test(l));
    if (!lines.length) return false;
    return lines.every(l => /SAVE_BODY_COLS_V27/.test(l) || /storage_mode/.test(l) || /SELECT u, \?2, rev/.test(l));
  })());
  ok('★★fail-closed の応答は 500 / chunk-integrity / retryable:false のひと組だけ',
     (C27.match(/errorCode: 'chunk-integrity'/g) || []).length === 1 && /errorCode: 'chunk-integrity', reason:[\s\S]{0,80}retryable: false/.test(C27));
  ok('★chunk データを base64 化していない(33%膨張を避ける決定が守られている)',
     C27.indexOf('btoa(') < 0 || !/save_chunks[\s\S]{0,200}btoa\(/.test(C27));
  if (SRC26) {
    const C26 = codeLines(SRC26);
    const keep = [
      "errorCode: 'tombstone-clear-refused'", "errorCode: 'idem-key-reuse'", "errorCode: 'idem-processing'",
      "errorCode: 'fork-save-failed'", "errorCode: 'too-large'", "errorCode: 'bad-op'", "errorCode: 'auth'",
      "errorCode: 'exception'", "errorCode: 'not-found'", "errorCode: 'unsupported'", "errorCode: 'maintenance'"
    ];
    ok('★★v26 の errorCode を1つも消していない(クライアントの分岐が壊れない)',
       keep.every(k => C26.indexOf(k) < 0 || C27.indexOf(k) >= 0), keep.filter(k => C26.indexOf(k) >= 0 && C27.indexOf(k) < 0));
    ok('★★v26 に無かった errorCode は chunk-integrity だけ', (function () {
      const codes = (s) => Array.from(new Set((s.match(/errorCode: '[a-z0-9-]+'/g) || [])));
      const added = codes(C27).filter(c => codes(C26).indexOf(c) < 0);
      return added.length === 1 && added[0] === "errorCode: 'chunk-integrity'";
    })(), (function () { const codes = (s) => Array.from(new Set((s.match(/errorCode: '[a-z0-9-]+'/g) || []))); return codes(C27).filter(c => codes(C26).indexOf(c) < 0); })());
  }
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);

})().catch(e => {
  console.log('  FAIL  テストが例外で停止: ' + (e && e.stack || e));
  console.log('PASS ' + pass + ' / FAIL ' + (fail + 1));
  process.exit(1);
});
