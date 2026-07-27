/* 回帰テスト: v292Dfix590 — コミット台帳（「結果不明」を記録して読めるようにする）
 *
 * ★なぜ必要か（2026-07-27 の実機）
 *   push は成功して D1 が 430 へ進んだのに、応答を受け取る前にページを離脱し、
 *   appliedRev が 429 のまま取り残された。以後すべての put が fork → fail-closed で停止し、
 *   pull しないと自力復帰できない状態になった。
 *
 * この段で固定する契約（★appliedRev は1ミリも動かさない）
 *   L1 put の直前に「何を送ったか」を**永続化**する（ページ離脱をまたぐため）
 *   L2 **成功応答のときだけ**台帳を消す。fork では消さない
 *   L3 hash の対象は **D1に保存されるのと同じ規則**（pkgから idb を除いて直列化）
 *   L4 照合は三者一致（remote / lastSent / currentLocal）。2つだけの比較では通さない
 *   L5 不一致の理由を GPT 指定の名前で区別する
 *   L6 生のメールアドレス・合言葉を保存しない（identity は hash 化）
 *   L7 台帳を永続化できなかったら「自動照合不能」として扱う
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const SRC = read('v292Dfix590-commit-ledger.js');

function mkEnv(opts){
  opts = opts || {};
  const store = Object.assign({}, opts.seed || {});
  const ls = {
    getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => { if (opts.quota) { const e = new Error('q'); e.name = 'QuotaExceededError'; throw e; } store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    key: i => Object.keys(store)[i] != null ? Object.keys(store)[i] : null,
    get length(){ return Object.keys(store).length; }
  };
  const w = { localStorage: ls, console: { log(){}, warn(){}, error(){} }, JSON, Date, Error, Object, isFinite, String, Math,
              Promise, crypto: require('crypto').webcrypto, TextEncoder, Uint8Array };
  w.window = w; w.__store = store;
  vm.runInContext(SRC, vm.createContext(w), { filename: 'v292Dfix590-commit-ledger.js' });
  return w;
}
const PKG = { schema: 'v1', updatedAt: 111, device: 'test', activeSlot: 'smA',
              ls: { 'chr6_slot_smA': '{"turns":[1,2]}' } };
const PKG_WITH_IDB = Object.assign({}, PKG, { idb: { 'img1': 'data:...' } });

(async () => {

console.log('\n== (1) ★★hash の対象は「D1に保存されるのと同じ規則」（idbを除いて直列化） ==');
{
  const w = mkEnv(); const L = w.__v292Dfix590;
  /* Worker: const light={}; for(k in pkg){ if(k!=='idb') light[k]=pkg[k] } ; JSON.stringify(light) */
  const workerSide = (() => { const light = {}; for (const k in PKG_WITH_IDB){ if (k !== 'idb') light[k] = PKG_WITH_IDB[k]; } return JSON.stringify(light); })();
  ok('★★idb を含む pkg でも、Worker が保存する文字列と一致する',
     L.payloadString(PKG_WITH_IDB) === workerSide, { mine: (L.payloadString(PKG_WITH_IDB)||'').slice(0,40) });
  ok('★idb が無ければ pkg 全体と同じ', L.payloadString(PKG) === JSON.stringify(PKG));
  ok('★idb の有無で hash が変わらない（＝画像はblobに入らないから）',
     (await L.payloadHash(PKG)) === (await L.payloadHash(PKG_WITH_IDB)));
  ok('pkg でなければ null', L.payloadString(null) === null && (await L.payloadHash('x')) === null);
}

console.log('\n== (2) ★put直前に永続化し、成功応答のときだけ消す ==');
{
  const w = mkEnv(); const L = w.__v292Dfix590;
  const r = await L.notePut({ pkg: PKG, baseRev: 429, identity: 'someone@example.com', source: 'fix399' });
  ok('★記録できた', r.ok === true && r.persisted === true, r);
  ok('★★localStorage へ永続化されている（ページ離脱をまたぐため）',
     typeof w.__store['v292Dfix590_pending'] === 'string');
  ok('baseRev を持っている', L.pending().baseRev === 429);
  ok('status は awaiting-result', L.pending().status === 'awaiting-result');

  L.noteResult({ fork: true, serverRev: 430, source: 'fix399' });
  ok('★★fork では台帳を消さない（照合の材料として残す）', !!L.pending(), L.pending());
  ok('fork を数えている', L.stats().forks === 1);

  L.noteResult({ rev: 430, source: 'fix399' });
  ok('★★成功応答のときだけ消す', L.pending() === null);
}

console.log('\n== (3) ★★生の個人情報を保存しない ==');
{
  const w = mkEnv(); const L = w.__v292Dfix590;
  await L.notePut({ pkg: PKG, baseRev: 1, identity: 'oshin@example.com', source: 'fix399' });
  const raw = w.__store['v292Dfix590_pending'];
  ok('★★メールアドレスがそのまま保存されていない', raw.indexOf('oshin@example.com') < 0, raw.slice(0, 80));
  ok('★hash化されたidentityは持っている', /"identity":"id_\d+"/.test(raw), raw.slice(0, 80));
  ok('同じ相手なら同じキーになる', L.identityKey('a@b.c') === L.identityKey('a@b.c'));
  ok('違う相手なら違うキーになる', L.identityKey('a@b.c') !== L.identityKey('x@y.z'));
}

console.log('\n== (4) ★★照合は三者一致。2つだけでは通さない ==');
{
  const mk = async () => { const w = mkEnv(); const L = w.__v292Dfix590;
    await L.notePut({ pkg: PKG, baseRev: 429, identity: 'me', source: 'fix399' }); return L; };
  const H = await mkEnv().__v292Dfix590.payloadHash(PKG);

  {
    const L = await mk();
    const r = await L.reconcile({ remoteHash: H, remoteRev: 430, appliedRev: 429, identity: 'me', currentPkg: PKG });
    ok('★★三者一致なら復帰可能と答える', r.recoverable === true && r.why === 'three-way-match', r);
    ok('★remoteRev を返す（実際に動かすのは次の段）', r.remoteRev === 430);
    ok('★★この関数は appliedRev を書き換えない（純粋関数）',
       /wiredIntoRecovery:\s*false/.test(SRC) && SRC.indexOf('promoteRev') < 0);
  }
  {
    const L = await mk();
    /* remote は「最後に送ったもの」と一致するが、ローカルはその後 Q へ進んでいる */
    const moved = Object.assign({}, PKG, { updatedAt: 999 });
    const r = await L.reconcile({ remoteHash: H, remoteRev: 430, appliedRev: 429, identity: 'me', currentPkg: moved });
    ok('★★remote と lastSent の2つが一致しても、ローカルが進んでいたら通さない',
       r.recoverable === false && r.why === 'last-sent-vs-current-mismatch', r);
  }
  {
    const L = await mk();
    const r = await L.reconcile({ remoteHash: 'other', remoteRev: 430, appliedRev: 429, identity: 'me', currentPkg: PKG });
    ok('★remote が違う（＝本当に別端末が書いた）', r.recoverable === false && r.why === 'remote-vs-last-sent-mismatch', r);
  }
  {
    const L = await mk();
    const r = await L.reconcile({ remoteHash: H, remoteRev: 430, appliedRev: 429, identity: 'someone-else', currentPkg: PKG });
    ok('★identity が違えば通さない', r.recoverable === false && r.why === 'identity-mismatch', r);
  }
  {
    const L = await mk();
    const r = await L.reconcile({ remoteHash: H, remoteRev: 429, appliedRev: 429, identity: 'me', currentPkg: PKG });
    ok('★remoteRev が進んでいなければ通さない', r.recoverable === false && r.why === 'remote-rev-not-ahead', r);
  }
  {
    const L = await mk();
    const r = await L.reconcile({ remoteReadFailed: true, appliedRev: 429, identity: 'me', currentPkg: PKG });
    ok('★read-back に失敗したら通さない', r.recoverable === false && r.why === 'remote-read-failed', r);
  }
  {
    const L = await mk();
    const r = await L.reconcile({ remoteHash: H, remoteRev: 'x', appliedRev: 429, identity: 'me', currentPkg: PKG });
    ok('★応答が壊れていたら通さない', r.recoverable === false && r.why === 'remote-response-invalid', r);
  }
  {
    const w = mkEnv(); const L = w.__v292Dfix590;   /* notePut していない */
    const r = await L.reconcile({ remoteHash: H, remoteRev: 430, appliedRev: 429, identity: 'me', currentPkg: PKG });
    ok('★★送った記録が無ければ自動照合しない', r.recoverable === false && r.why === 'no-ledger', r);
  }
  {
    const L = await mk();
    const r = await L.reconcile({ remoteHash: H, remoteRev: 430, appliedRev: 429, identity: 'me', currentPkg: null });
    ok('★現在のpkgが作れなければ通さない', r.recoverable === false && r.why === 'hash-failed', r);
  }
}

console.log('\n== (5) ★永続化できなければ「自動照合不能」として扱う ==');
{
  const w = mkEnv({ quota: true }); const L = w.__v292Dfix590;
  const r = await L.notePut({ pkg: PKG, baseRev: 429, identity: 'me', source: 'fix399' });
  ok('★記録は返すが persisted:false', r.ok === true && r.persisted === false, r);
  ok('★失敗を数えている', L.stats().persistFailed === 1);
  const rc = await L.reconcile({ remoteHash: await L.payloadHash(PKG), remoteRev: 430, appliedRev: 429, identity:'me', currentPkg: PKG });
  ok('★★台帳が無いので照合しない（＝forkしたらpullを要求する側へ倒れる）',
     rc.recoverable === false && rc.why === 'no-ledger', rc);
}

console.log('\n== (6) OFF と、挙動を変えていないことの確認 ==');
{
  const w = mkEnv({ seed: { 'v292Dfix590Off': '1' } }); const L = w.__v292Dfix590;
  ok('★OFFなら記録しない', (await L.notePut({ pkg: PKG, baseRev: 1 })).ok === false);
  ok('★OFFなら照合しない', (await L.reconcile({})).recoverable === false);
  ok('★OFFスイッチがある（各fixの規約）', /v292Dfix590Off/.test(SRC));

  const noComment = s => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const code = noComment(SRC);
  ok('★★この段では復帰へ繋いでいないことを明示している', /wiredIntoRecovery:\s*false/.test(code));
  ok('★★台帳は localStorage の自分のキー以外を触らない',
     (code.match(/setItem\(/g) || []).length === 1 && (code.match(/removeItem\(/g) || []).length === 1);
  ok('★fix399 が put 直前に記録し、成功時だけ消している', (() => {
    const f = read('v292Dfix399-cloudsync.js');
    const i = f.indexOf('function attempt()');
    const j = f.indexOf('return attempt();');
    const body = f.slice(i, j);
    return /notePut\(/.test(body) && /noteResult\(\{\s*fork:true/.test(body) && /noteResult\(\{\s*rev:/.test(body);
  })());
  const idx = read('index.html');
  ok('★★index.html で fix590 が fix399 より前にある（fix399が呼ぶため）',
     idx.indexOf('v292Dfix590-commit-ledger.js') > 0 &&
     idx.indexOf('v292Dfix590-commit-ledger.js') < idx.indexOf('v292Dfix399-cloudsync.js'));
  const cb = (idx.match(/v292Dfix399-cloudsync\.js\?cb=v292Dfix(\d+)/) || [])[1];
  ok('★fix399 の cb を上げている', !!cb && Number(cb) >= 590, cb);
  const built = (idx.match(/var BUILT = '([^']+)'/) || [])[1] || '';
  ok('★BUILT と version.txt が同値', built === read('version.txt').trim(), { built });
}

console.log('\n---------------------------------------------');
console.log('test_fix590: 合格 ' + pass + ' / 失敗 ' + fail);
console.log('pass=' + pass + ' fail=' + fail);
if (fail) process.exitCode = 1;
})();
