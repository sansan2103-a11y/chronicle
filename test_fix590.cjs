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
  /* ★fix596: identity は「認証種別 + 正規化した値」の fingerprint になった。
     表示用の伏せ字は衝突しうるので使わない（GPT指定7）。形は id_<kind>_<数値> */
  ok('★hash化されたidentityは持っている', /"identity":"id_(google|pass|unknown)_\d+"/.test(raw), raw.slice(0, 80));
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
    /* ★fix593 で「共有revの昇格」関数が別に増えたので、純粋性の検査は reconcile 本体に限定する */
    const reconcileBody = SRC.slice(SRC.indexOf('function reconcile('), SRC.indexOf('★fix593'));
    ok('★★reconcile() は何も書き換えない（純粋関数）',
       reconcileBody.indexOf('setItem') < 0 && reconcileBody.indexOf('promoteRev') < 0 &&
       reconcileBody.indexOf('removeItem') < 0, reconcileBody.length);
    /* ★fix596 で Worker v25 の commitstate と繋いだので、ここは true になった。
       この行は「まだ繋いでいない」を固定していたもので、役目を終えている。 */
    ok('★★fix596: 復帰へ配線済みであることを明示している', /wiredIntoRecovery:\s*true/.test(SRC));
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
    /* ★fix596(GPT指定): remoteRev === appliedRev は「昇格不要」であって「異常」ではない。
       状態一致は確認できるので pending は解除してよいが、**rev は動かさない**。
       固定したい契約は「rev を進めない」ことなので、そこを見る。 */
    ok('★remoteRev が進んでいなければ rev を進めない', r.recoverable === false, r);
    ok('★★ただし状態一致そのものは確認できている（詰まらせない）',
       r.status === 'commit-confirmed' || r.status === 'state-equivalent-rebased', r);
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
  ok('★★fix596: 復帰へ配線済みであることを明示している', /wiredIntoRecovery:\s*true/.test(code));
  /* ★fix593 で「共有rev台帳」への書き込みが1つ増えた。書いてよいのはこの2キーだけ。 */
  ok('★★台帳が書き込むのは自分のキーと共有rev台帳だけ',
     (code.match(/setItem\(/g) || []).length === 2 && (code.match(/removeItem\(/g) || []).length === 1,
     { setItem: (code.match(/localStorage\.setItem\([^,]+/g) || []) });
  ok('★★共有revは fix580 が居ればその API を使う（キー直書きは fallback）',
     /promoteRev\(rev/.test(code) && /SHARED_REV_KEY/.test(code));
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


/* =====================================================================
 * fix593: pull収束証明（GPT裁定 a′）
 *   「pull が remoteRev を基点として、ローカル同期状態を安全に再構成できたと
 *     **証明できた場合だけ** 共有rev を remoteRev へ更新する」
 *   ★「差分0件」「skipped 0件」だけでは証明にならない（mergeMeta / barrier /
 *     ローカル専用キーの除外 / local-aheadスキップ が絡むため）
 * ===================================================================== */
{
  console.log('\n== (7) ★★fix593: pull収束証明 ==');
  const w = mkEnv(); const L = w.__v292Dfix590;
  const base = { remoteRev: 430, currentSharedRev: 429, pullCompleted: true, parsedOk: true,
                 applyErrors: 0, conflictSkips: 0, unknownSkips: 0,
                 metaMerged: true, metaMergeFailed: false, blockedWithoutTombstone: 0, readBackOk: true };
  ok('★★12条件を満たせば収束と認める', L.provePullConvergence(base).ok === true, L.provePullConvergence(base));
  const ng = (patch, why) => {
    const r = L.provePullConvergence(Object.assign({}, base, patch));
    ok('★' + why + ' → 昇格しない', r.ok === false && r.why === why, r);
  };
  ng({ remoteRev: 'x' }, 'remote-rev-invalid');
  ng({ remoteRev: 428 }, 'remote-rev-behind');
  ng({ pullCompleted: false }, 'pull-not-complete');
  ng({ parsedOk: false }, 'parse-failed');
  ng({ applyErrors: 1 }, 'apply-errors');
  ng({ conflictSkips: 1 }, 'conflict-skips');          /* ★local-aheadスキップがあれば昇格しない */
  ng({ unknownSkips: 1 }, 'unknown-skips');
  ng({ metaMerged: false }, 'meta-not-merged');
  ng({ metaMergeFailed: true }, 'meta-merge-failed');
  ng({ blockedWithoutTombstone: 1 }, 'barrier-without-tombstone');
  ng({ readBackOk: false }, 'readback-failed');
  ok('★metaがそもそも来ていないなら merged でなくてもよい',
     L.provePullConvergence(Object.assign({}, base, { metaMerged:false, metaAbsent:true })).ok === true);

  console.log('\n== (8) ★共有revの昇格は「上げるだけ」 ==');
  {
    const w2 = mkEnv({ seed: { 'v292Dfix580_rev': '429' } }); const L2 = w2.__v292Dfix590;
    ok('現在値を読める', L2.sharedRev() === 429);
    const up = L2.promoteSharedRev(430, 'test');
    ok('★★前へ進める', up.ok === true && w2.__store['v292Dfix580_rev'] === '430', up);
    const down = L2.promoteSharedRev(400, 'test');
    ok('★★下げない', down.ok === false && down.why === 'not-ahead' && w2.__store['v292Dfix580_rev'] === '430');
    ok('昇格を数えている', L2.stats().sharedRevPromoted === 1);
  }

  console.log('\n== (9) ★home.html に配線されている ==');
  {
    const home = read('home.html');
    ok('★★fix590 を積んでいる', home.indexOf('v292Dfix590-commit-ledger.js') > 0);
    ok('★★pull の最後に収束証明を呼んでいる', /provePullConvergence\(\{/.test(home));
    ok('★★証明が通ったときだけ昇格している', /if\s*\(proof\.ok\)[\s\S]{0,120}promoteSharedRev\(/.test(home));
    ok('★local-aheadスキップを conflictSkips として渡している', /conflictSkips:\s*skipped\.length/.test(home));
    ok('★書き戻し検査(readBackOk)を渡している', /readBackOk:\s*readBackOk/.test(home));
    ok('★mergeMeta の失敗を metaMergeFailed として渡している', /metaMergeFailed:\s*metaGuarded/.test(home));
    ok('★HOME_BUILT と version.txt が同値',
       (home.match(/HOME_BUILT = '([^']+)'/) || [])[1] === read('version.txt').trim());
  }

}

console.log('\n---------------------------------------------');
console.log('test_fix590/593: 合格 ' + pass + ' / 失敗 ' + fail);
console.log('pass=' + pass + ' fail=' + fail);
if (fail) process.exitCode = 1;
})();
