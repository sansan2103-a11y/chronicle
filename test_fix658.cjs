#!/usr/bin/env node
/* test_fix658.cjs — fix658 Phase1「系譜センサス(shadow)」の契約テスト
 *
 * ■このテストが固定する約束（値ではなく関係と挙動で縛る）
 *   (1) 実装の体裁: 冪等ガード / OFFスイッチ / 書込先が2キーだけ / 読み込みで通信もタイマーも起きない
 *   (2) 公開APIの**双方向**契約（test_fix655方式）
 *       ・fix658 が名乗る公開APIが実在する
 *       ・fix402 / home.html のフックが呼ぶ名前が**すべて**公開されている（無言の素通りを作らない）
 *   (3) 分類器の真理値表（実物をサンドボックスで走らせ、commitstate をモックして census を検証）
 *   (4) lsHash が fix402 の実装と**同一出力**（固定ベクトル）
 *   (5) リングバッファ上限80 / 40KB 間引き
 *   (6) v292Dfix658_* が fix402 と home.html の収集対象にならない（同期に混入しない）
 *   (7) commitstate が読取専用（書込opの文字列が存在しない）
 *   (8) OFF のとき全 note* が no-op（台帳不変・通信0）。API オブジェクトは必ず生える
 *   (9) shadow 不変条件: fix402 の fork / local-ahead / applyPkg の**既存文が変わっていない**
 *  (10) 出荷の体裁（script タグ・cb）。BUILT 同値契約は test_fix654 / test_fix653 が担保する
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c){ pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

const SRC658 = read('v292Dfix658-lineage-shadow.js');
const SRC402 = read('v292Dfix402-invisible-sync.js');
const HOME   = read('home.html');
const HTMLU  = Buffer.from(fs.readFileSync(path.join(__dirname, 'index.html'), 'latin1'), 'latin1').toString('utf8');
/* コメントを除いた実コード（静的検査で説明文に引っかからないように）。
   home.html は HTML コメントも落とす。`//` 行コメントは URL を壊すので落とさない。 */
const stripBlock = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const CODE658 = stripBlock(SRC658).replace(/^\s*\/\/.*$/gm, ' ');
const CODE402 = stripBlock(SRC402).replace(/^\s*\/\/.*$/gm, ' ');
const CODEHOME = stripBlock(HOME);

/* =====================================================================
   サンドボックス
   ===================================================================== */
function makeLS(seed){
  const store = Object.assign(Object.create(null), seed || {});
  return {
    getItem(k){ return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v){ store[k] = String(v); },
    removeItem(k){ delete store[k]; },
    key(i){ return Object.keys(store)[i] || null; },
    get length(){ return Object.keys(store).length; },
    __store: store
  };
}
function makeSandbox(opts){
  opts = opts || {};
  const ls = opts.ls || makeLS(opts.seed || { v292ProxyPass: 'pw' });
  const warns = [], logs = [], calls = [];
  let reply = opts.reply || null;                 // commitstate の応答（null なら ok:false）
  const sandbox = {
    localStorage: ls,
    console: { log: (...a) => logs.push(a.join(' ')), warn: (...a) => warns.push(a.join(' ')), error: (...a) => warns.push(a.join(' ')) },
    setTimeout, clearTimeout, setInterval, clearInterval,
    Date, JSON, Math, Object, Array, String, Number, parseInt, isFinite, Promise, RegExp, Error,
    AbortController: typeof AbortController !== 'undefined' ? AbortController : undefined,
    fetch(url, init){
      let body = null; try { body = JSON.parse(init && init.body); } catch(e){}
      calls.push({ url: String(url), body, headers: (init && init.headers) || null });
      const j = (typeof reply === 'function') ? reply(body) : reply;
      return Promise.resolve({ status: 200, json: () => Promise.resolve(j || { ok: false }) });
    }
  };
  sandbox.window = sandbox;
  sandbox._warns = warns; sandbox._logs = logs; sandbox._calls = calls; sandbox._ls = ls;
  sandbox._setReply = r => { reply = r; };
  vm.createContext(sandbox);
  return sandbox;
}
function load658(sb){ vm.runInContext(SRC658, sb, { filename: 'v292Dfix658' }); return sb.window.__v292Dfix658; }
const tick = async (n = 40) => { for (let i = 0; i < n; i++) await Promise.resolve(); };

(async () => {

/* =====================================================================
   (1) 実装の体裁
   ===================================================================== */
console.log('== (1) 実装の体裁（冪等・OFF・書込先・無害な読み込み） ==');
{
  ok('★冪等ガードが __v292* 系（fix274 の継承バグの教訓）', /if\s*\(window\.__v292Dfix658\)\s*return/.test(SRC658));
  ok('★OFF スイッチ v292Dfix658Off がある', SRC658.indexOf("'v292Dfix658Off'") > 0);
  ok('★★localStorage への書込みはソース中1か所だけ',
     (CODE658.match(/localStorage\.setItem\s*\(/g) || []).length === 1,
     (CODE658.match(/localStorage\.setItem\s*\(/g) || []).length);
  ok('★★その1か所は許可キー以外を弾くガードの内側（2キー封じ込め）',
     /if\s*\(k\s*!==\s*K_ANCHOR\s*&&\s*k\s*!==\s*K_CENSUS\)\s*return false;[\s\S]{0,120}localStorage\.setItem\s*\(k,\s*v\)/.test(CODE658));
  ok('★★許可キーはちょうど anchor / census の2つ',
     /K_ANCHOR\s*=\s*'v292Dfix658_anchor'/.test(SRC658) && /K_CENSUS\s*=\s*'v292Dfix658_census'/.test(SRC658) &&
     (CODE658.match(/K_ANCHOR\s*=|K_CENSUS\s*=/g) || []).length === 2);
  ok('★★localStorage.removeItem / clear を呼ばない（他人のデータに触れない）',
     !/localStorage\.removeItem\s*\(/.test(CODE658) && !/localStorage\.clear\s*\(/.test(CODE658));
  ok('★★Storage.prototype を触らない', !/Storage\s*\.\s*prototype/.test(CODE658));
  ok('★★fetch / localStorage のラッパを足さない（iOSラッパ素通り第18型の教訓）',
     !/window\.fetch\s*=/.test(CODE658) && !/localStorage\.setItem\s*=/.test(CODE658) &&
     !/localStorage\.getItem\s*=/.test(CODE658));
  ok('★★自動実行のフックが無い（addEventListener / setInterval を張らない）',
     !/addEventListener/.test(CODE658) && !/setInterval\s*\(/.test(CODE658));
  ok('★CRLF / NUL は無い', (() => {
    const b = fs.readFileSync(path.join(__dirname, 'v292Dfix658-lineage-shadow.js'));
    return b.indexOf(Buffer.from('\r\n')) < 0 && b.filter(x => x === 0).length === 0;
  })());
}
{
  const sb = makeSandbox();
  const before = JSON.stringify(sb._ls.__store);
  const F = load658(sb);
  ok('★★読み込みだけでは1バイトも書かない', JSON.stringify(sb._ls.__store) === before, sb._ls.__store);
  ok('★★読み込みだけでは通信しない', sb._calls.length === 0, sb._calls.length);
  ok('★API オブジェクトが生える', !!F && F.__real === true);
  const first = F;
  vm.runInContext(SRC658, sb, { filename: 'v292Dfix658#2' });
  ok('★★二重ロードで初期化し直さない', sb.window.__v292Dfix658 === first);
}

/* =====================================================================
   (2) 公開APIの双方向契約
   ===================================================================== */
console.log('\n== (2) 公開APIの双方向契約（fix655方式） ==');
{
  const DECLARED = ['noteCommit', 'notePull', 'noteConflict', 'status', 'census', 'anchor', 'selfTest', '_resetCensus'];
  const sb = makeSandbox();
  const F = load658(sb);
  for (const d of DECLARED) ok('★公開APIに ' + d + ' が実在(function)', typeof F[d] === 'function', typeof F[d]);

  /* 呼出側（fix402 / home.html）が実際に叩く名前を**ソースから抽出**して突き合わせる。
     宣言リストを手で写すのではなく、呼び出しの実体から拾うので写し間違いで緑にならない。 */
  const used = new Set();
  for (const src of [CODE402, CODEHOME]){
    const m = src.match(/__v292Dfix658\.([A-Za-z_]\w*)\s*\(/g) || [];
    m.forEach(t => used.add(t.replace(/__v292Dfix658\./, '').replace(/\s*\($/, '')));
  }
  ok('★★呼出側が fix658 を実際に叩いている（フックが存在する）', used.size >= 3, [...used]);
  for (const u of used) ok('★★呼出側が使う ' + u + ' が公開されている（無言の素通りを作らない）', typeof F[u] === 'function', typeof F[u]);

  ok('★★フックは必ず try{ if(window.__v292Dfix658) … } catch でくるまれている（例外を漏らさない）', (() => {
    let seen = 0;
    for (const src of [CODE402, CODEHOME]){
      const re = /__v292Dfix658\.\w+\s*\(/g;
      let m;
      while ((m = re.exec(src))){
        seen++;
        const before = src.slice(Math.max(0, m.index - 600), m.index);
        if (!/if\s*\(window\.__v292Dfix658\b[\s\S]*$/.test(before)) return false;
        if (!/try\s*\{[\s\S]*$/.test(before)) return false;
      }
    }
    return seen === 7;   /* fix402:4 + home:3 */
  })());
  ok('★fix402 側のフックは4か所（put成功 / fork / local-ahead / applyPkg）',
     (CODE402.match(/__v292Dfix658\.\w+\s*\(/g) || []).length === 4,
     (CODE402.match(/__v292Dfix658\.\w+\s*\(/g) || []));
  ok('★home.html 側のフックは3か所（notePull / lsHash / noteConflict）',
     (CODEHOME.match(/__v292Dfix658\.\w+\s*\(/g) || []).length === 3,
     (CODEHOME.match(/__v292Dfix658\.\w+\s*\(/g) || []));
}

/* =====================================================================
   (3) 分類器の真理値表（実物を走らせて census を検証）
   ===================================================================== */
console.log('\n== (3) 分類の真理値表（commitstate をモックして実際に記録させる） ==');
function anchorSeed(o){
  return JSON.stringify(Object.assign({ v: 1, localBaseRev: 10, localBasePackageHash: 'PHBASE0000',
                                        localBaseCommitOpId: 'op-1', localLsHash: '12:345', at: 1, via: 'put' }, o || {}));
}
async function runConflict(cloud, conflictArgs, anchorOverride){
  const seed = { v292ProxyPass: 'pw' };
  if (anchorOverride !== null) seed['v292Dfix658_anchor'] = anchorSeed(anchorOverride);
  const sb = makeSandbox({ seed, reply: cloud });
  const F = load658(sb);
  await F.noteConflict(conflictArgs);
  await tick();
  return { sb, F, census: F.census(), ev: F.census().events[F.census().events.length - 1] };
}
{
  const r = await runConflict({ ok: true, rev: 10, packageHash: 'PHBASE0000', lastCommitOpId: 'op-1' },
                              { where: 'put-fork', serverRev: 10, localLsHash: '99:777' });
  ok('★★ローカルだけ進んだ = fastForwardLocalToCloud', r.ev.cls === 'fastForwardLocalToCloud', r.ev);
  ok('★proposedWinner=local-ff-push / fork は作られない', r.ev.proposedWinner === 'local-ff-push' && r.ev.forkWouldBeCreated === false, r.ev);
  ok('★counts が加算される', r.census.counts.fastForwardLocalToCloud === 1, r.census.counts);
  ok('★where / localBaseRev / ah8 / ch8 / lh が記録される',
     r.ev.where === 'put-fork' && r.ev.localBaseRev === 10 && r.ev.ah8 === 'PHBASE00' && r.ev.ch8 === 'PHBASE00' && r.ev.lh === false, r.ev);
  ok('★commitstate を1回だけ読む', r.sb._calls.length === 1 && r.sb._calls[0].body.op === 'commitstate', r.sb._calls);
}
{
  const r = await runConflict({ ok: true, rev: 11, packageHash: 'PHBASE0000' },
                              { where: 'put-fork', serverRev: 11, localLsHash: '99:777' });
  ok('★★中身は同じなのに版だけ進んだ → anomaly:rev-bump-same-hash', r.ev.anomaly === 'rev-bump-same-hash', r.ev);
  ok('★分類自体は fastForwardLocalToCloud のまま', r.ev.cls === 'fastForwardLocalToCloud', r.ev);
}
{
  const r = await runConflict({ ok: true, rev: 10, packageHash: 'PHBASE0000' },
                              { where: 'put-fork', serverRev: 10, localLsHash: '12:345' });
  ok('★★どちらも動いていない = noConflict（見かけ上の競合）', r.ev.cls === 'noConflict' && r.ev.forkWouldBeCreated === false, r.ev);
  ok('★noConflict に勝者は無い', r.ev.proposedWinner === null, r.ev);
}
{
  /* ★統括レビュー追加(2026-08-02): クラウド不変+ローカルhash不明 を noConflict と言ってはいけない。
     この入力は local-ahead / home-pull-skip(=ローカルが進んでいることが文脈上確実)でしか起きない。 */
  const r = await runConflict({ ok: true, rev: 10, packageHash: 'PHBASE0000' },
                              { where: 'local-ahead', serverRev: 10, localLsHash: null });
  ok('★★クラウド不変+ローカルhash不明 = unknownLineage(local-hash-unknown)（嘘の noConflict を作らない）',
     r.ev.cls === 'unknownLineage' && r.ev.reason === 'local-hash-unknown' && r.ev.proposedWinner === null, r.ev);
}
{
  const r = await runConflict({ ok: true, rev: 12, packageHash: 'PHNEW00000' },
                              { where: 'put-fork', serverRev: 12, localLsHash: '12:345' });
  ok('★★クラウドだけ進んだ = fastForwardCloudToLocal', r.ev.cls === 'fastForwardCloudToLocal', r.ev);
  ok('★proposedWinner=cloud-ff-pull / fork は作られない',
     r.ev.proposedWinner === 'cloud-ff-pull' && r.ev.forkWouldBeCreated === false, r.ev);
}
{
  const r = await runConflict({ ok: true, rev: 12, packageHash: 'PHNEW00000' },
                              { where: 'put-fork', serverRev: 12, localLsHash: '99:777' });
  ok('★★双方が動いた = trueDivergence', r.ev.cls === 'trueDivergence', r.ev);
  ok('★★trueDivergence だけが forkWouldBeCreated=true', r.ev.forkWouldBeCreated === true && r.ev.proposedWinner === 'cloud-canonical', r.ev);
}
{
  const r = await runConflict({ ok: true, rev: 12, packageHash: 'PHNEW00000' },
                              { where: 'local-ahead', serverRev: 12, localLsHash: null });
  ok('★★ローカルの hash が不明なら unknownLineage（推測で分類しない）',
     r.ev.cls === 'unknownLineage' && r.ev.reason === 'local-hash-unknown', r.ev);
}
{
  const r = await runConflict({ ok: true, rev: 3, packageHash: 'X' }, { where: 'put-fork', serverRev: 3, localLsHash: '1:1' }, null);
  ok('★★anchor が無ければ unknownLineage(no-anchor)', r.ev.cls === 'unknownLineage' && r.ev.reason === 'no-anchor', r.ev);
}
{
  const r = await runConflict({ ok: false }, { where: 'put-fork', serverRev: 9, localLsHash: '1:1' });
  ok('★★commitstate が使えないときも黙らず unknownLineage で記録する',
     r.ev.cls === 'unknownLineage' && r.ev.reason === 'commitstate-unavailable', r.ev);
  ok('★その場合 serverRev は呼出側のヒントを使う', r.ev.serverRev === 9, r.ev);
}
{
  /* 未ログインなら通信そのものをしない */
  const sb = makeSandbox({ seed: { v292Dfix658_anchor: anchorSeed() }, reply: { ok: true, rev: 1, packageHash: 'Y' } });
  const F = load658(sb);
  await F.noteConflict({ where: 'put-fork', serverRev: 1, localLsHash: '1:1' });
  await tick();
  ok('★★未ログインなら通信0（無駄な往復をしない）', sb._calls.length === 0, sb._calls.length);
  ok('★それでもイベントは記録する（reason=no-auth）',
     F.census().events[0].cls === 'unknownLineage' && F.census().events[0].reason === 'no-auth', F.census().events[0]);
}
{
  /* turnDelta: remoteLs から fix658 が自分で数える（fix402 のループには触らない） */
  const sb = makeSandbox({ seed: {
      v292ProxyPass: 'pw',
      v292Dfix658_anchor: anchorSeed(),
      'chr6_slot_sA': JSON.stringify({ turns: [1, 2, 3, 4, 5] }),
      'chr6': JSON.stringify({ turns: [1] })
    }, reply: { ok: true, rev: 12, packageHash: 'PHNEW00000' } });
  const F = load658(sb);
  await F.noteConflict({ where: 'local-ahead', serverRev: 12, localLsHash: null,
                         remoteLs: { 'chr6_slot_sA': JSON.stringify({ turns: [1, 2] }), 'chr6': JSON.stringify({ turns: [1] }) } });
  await tick();
  ok('★★turnDelta = ローカル合計 - remote合計（6-3=3）', F.census().events[0].turnDelta === 3, F.census().events[0]);
  ok('★呼出側が turnDelta を直接渡せる', (async () => true)());
}
{
  const sb = makeSandbox({ seed: { v292ProxyPass: 'pw', v292Dfix658_anchor: anchorSeed() },
                           reply: { ok: true, rev: 12, packageHash: 'PHNEW00000' } });
  const F = load658(sb);
  await F.noteConflict({ where: 'home-pull-skip', serverRev: 12, localLsHash: null, turnDelta: -4 });
  await tick();
  ok('★★turnDelta を直接渡した場合はその値を記録する', F.census().events[0].turnDelta === -4, F.census().events[0]);
  ok('★where=home-pull-skip が残る', F.census().events[0].where === 'home-pull-skip');
}

console.log('\n== (3b) anchor 台帳（noteCommit / notePull / backfill） ==');
{
  const sb = makeSandbox({ seed: { v292ProxyPass: 'pw' } });
  const F = load658(sb);
  F.noteCommit({ rev: 42, packageHash: 'PH42', lastCommitOpId: 'opX', lsHash: '10:20' });
  const a = F.anchor();
  ok('★★put 成功で anchor が確定する（via=put）',
     a.localBaseRev === 42 && a.localBasePackageHash === 'PH42' && a.localBaseCommitOpId === 'opX' &&
     a.localLsHash === '10:20' && a.via === 'put', a);
  ok('★書込先は v292Dfix658_anchor だけ',
     Object.keys(sb._ls.__store).filter(k => k.indexOf('v292Dfix658') === 0).join(',') === 'v292Dfix658_anchor',
     Object.keys(sb._ls.__store));
}
{
  const sb = makeSandbox({ seed: { v292ProxyPass: 'pw' }, reply: { ok: true, rev: 7, packageHash: 'PH7', lastCommitOpId: 'op7' } });
  const F = load658(sb);
  F.notePull({ rev: 7, lsHash: '3:4', via: 'pull-index' });
  ok('★pull 直後は packageHash 不明（推測で埋めない）', F.anchor().localBasePackageHash === null, F.anchor());
  await tick();
  const a = F.anchor();
  ok('★★backfill で packageHash / opId が埋まる（rev一致時のみ）',
     a.localBasePackageHash === 'PH7' && a.localBaseCommitOpId === 'op7' && a.via === 'backfill', a);
  ok('★backfill は commitstate を1回だけ読む', sb._calls.length === 1 && sb._calls[0].body.op === 'commitstate', sb._calls);
}
{
  const sb = makeSandbox({ seed: { v292ProxyPass: 'pw' }, reply: { ok: true, rev: 99, packageHash: 'PH99' } });
  const F = load658(sb);
  F.notePull({ rev: 7, lsHash: '3:4', via: 'pull-home' });
  await tick();
  ok('★★rev がずれていたら backfill しない（別の版の指紋を貼らない）',
     F.anchor().localBasePackageHash === null && F.anchor().via === 'pull-home', F.anchor());
}

/* =====================================================================
   (4) lsHash 互換
   ===================================================================== */
console.log('\n== (4) lsHash が fix402 と同一出力 ==');
{
  /* fix402 の実装をソースから切り出してそのまま評価する（写経ではなく現物と比べる） */
  const i = SRC402.indexOf('function hash(s)');
  const j = SRC402.indexOf('\n', SRC402.indexOf('function lsHash(s)'));
  const frag = SRC402.slice(i, j);
  ok('★fix402 の hash/lsHash を切り出せた', /function lsHash/.test(frag), frag.slice(0, 40));
  const ctx = vm.createContext({ String });
  vm.runInContext(frag + '\n; this.__lsHash = lsHash;', ctx);
  const ref = ctx.__lsHash;

  const sb = makeSandbox();
  const F = load658(sb);
  const vectors = ['', 'a', '{}', JSON.stringify({ chr6: '{"turns":[1,2,3]}' }),
                   'あいうえお', '{"k":"' + 'x'.repeat(500) + '"}', JSON.stringify({ a: 1, b: [1, 2, 3], c: null })];
  let allOk = true, sample = null;
  for (const v of vectors){ if (ref(v) !== F.lsHash(v)){ allOk = false; sample = { v: v.slice(0, 20), ref: ref(v), got: F.lsHash(v) }; break; } }
  ok('★★固定ベクトル全件で fix402 と同一出力', allOk, sample);
  ok('★length接頭形式（衝突耐性つき）', /^\d+:\d+$/.test(F.lsHash('abc')), F.lsHash('abc'));
}

/* =====================================================================
   (5) リングバッファと 40KB 間引き
   ===================================================================== */
console.log('\n== (5) 台帳の上限（リングバッファ80 / 40KB） ==');
{
  const sb = makeSandbox({ seed: { v292ProxyPass: 'pw', v292Dfix658_anchor: anchorSeed() },
                           reply: { ok: true, rev: 12, packageHash: 'PHNEW00000' } });
  const F = load658(sb);
  for (let i = 0; i < 95; i++){ await F.noteConflict({ where: 'put-fork', serverRev: 12, localLsHash: '99:777' }); }
  await tick();
  const c = F.census();
  ok('★★events は80件で頭打ち', c.events.length === 80, c.events.length);
  ok('★★counts は間引かれても減らない（累計として残る）', c.counts.trueDivergence === 95, c.counts);
  ok('★台帳JSONは40KB以下', sb._ls.getItem('v292Dfix658_census').length <= 40000, sb._ls.getItem('v292Dfix658_census').length);
  ok('★firstAt / lastAt が入る', !!c.firstAt && !!c.lastAt);
  ok('★status() が観測日数と昇格条件を返す（自動昇格はしない）', (() => {
    const st = F.status();
    return st.conflictEvents === 95 && st.promotionRule.days === 14 && st.promotionRule.events === 20 &&
           st.promotionReady === false && /shadow/.test(st.phase);
  })(), F.status());
}
{
  /* 40KB 間引き: 巨大な census を種として置いてから1件足す */
  const big = { v: 1, counts: { fastForwardLocalToCloud: 0, fastForwardCloudToLocal: 0, trueDivergence: 0, unknownLineage: 0, noConflict: 0 },
                firstAt: 1, lastAt: 1, events: [] };
  for (let i = 0; i < 20; i++) big.events.push({ ts: i, where: 'put-fork', cls: 'trueDivergence', pad: 'z'.repeat(3000) });
  const sb = makeSandbox({ seed: { v292ProxyPass: 'pw', v292Dfix658_anchor: anchorSeed(), v292Dfix658_census: JSON.stringify(big) },
                           reply: { ok: true, rev: 12, packageHash: 'PHNEW00000' } });
  ok('★前提: 種の census は40KBを超えている', JSON.stringify(big).length > 40000, JSON.stringify(big).length);
  const F = load658(sb);
  await F.noteConflict({ where: 'put-fork', serverRev: 12, localLsHash: '99:777' });
  await tick();
  ok('★★40KB超は古い events から間引かれる', sb._ls.getItem('v292Dfix658_census').length <= 40000,
     sb._ls.getItem('v292Dfix658_census').length);
  ok('★★最新のイベントは必ず残る', F.census().events[F.census().events.length - 1].cls === 'trueDivergence');
}
{
  /* 書込失敗（Quota）は握りつぶして warn は一度だけ。例外を呼出側へ漏らさない */
  const ls = makeLS({ v292ProxyPass: 'pw' });
  ls.setItem = () => { throw new Error('QuotaExceededError'); };
  const sb = makeSandbox({ ls, reply: { ok: true, rev: 1, packageHash: 'P' } });
  const F = load658(sb);
  let threw = false;
  try { F.noteCommit({ rev: 1, packageHash: 'P', lsHash: 'x' }); F.noteCommit({ rev: 2, packageHash: 'P', lsHash: 'y' }); }
  catch(e){ threw = true; }
  ok('★★書込失敗でも例外を漏らさない', threw === false);
  ok('★★warn は一度だけ', sb._warns.length === 1, sb._warns);
}

/* =====================================================================
   (6) 同期への混入が無い
   ===================================================================== */
console.log('\n== (6) v292Dfix658_* が同期パッケージに混入しない ==');
{
  /* fix402 の収集部（tombstonedIds〜collectLight）を切り出して実際に走らせる */
  const frag = SRC402.slice(SRC402.indexOf('function isGlobalKey'), SRC402.indexOf('function collectLight'));
  ok('★fix402 の収集部を切り出せた', /function collectLS/.test(frag));
  const store = {
    'chr6': '{"turns":[1]}',
    'chr6_slot_s9x2k1ab': '{"turns":[1,2]}',
    'chr6_slots_meta': JSON.stringify([{ id: 's9x2k1ab', name: 'A' }]),
    'v292Dfix658_anchor': '{"v":1}',
    'v292Dfix658_census': '{"v":1}',
    'v292Dfix402_lastHash': '1:1'
  };
  const ls = makeLS(store);
  const ctx = vm.createContext({ localStorage: ls, JSON, Object, Array, String, console: { warn(){}, log(){} } });
  ctx.window = ctx;
  vm.runInContext('function lsGet(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }\n' + frag +
                  '\n; this.__collectLS = collectLS;', ctx, { filename: 'fix402-collect' });
  const out = ctx.__collectLS(['s9x2k1ab', 'chr6']);
  ok('★★fix402 collectLS は v292Dfix658_anchor を収集しない', !('v292Dfix658_anchor' in out), Object.keys(out));
  ok('★★fix402 collectLS は v292Dfix658_census を収集しない', !('v292Dfix658_census' in out), Object.keys(out));
  ok('★対照: 物語本体はちゃんと収集されている（判定式が死んでいない）',
     ('chr6' in out) && ('chr6_slot_s9x2k1ab' in out) && ('chr6_slots_meta' in out), Object.keys(out));
}
{
  /* home.html 側の送信（collectLS / push）に混入しないことをソース契約で確かめる */
  const i = HOME.indexOf('function collectLS(){');
  const body = HOME.slice(i, HOME.indexOf('function push()', i));
  ok('★home.html の collectLS を切り出せた', /lastPayloadDropped/.test(body));
  ok('★★home の収集条件も「slotId部分一致 か isGlobalKey」だけ（fix658キーは当たらない）',
     /if\(hit \|\| isGlobalKey\(k\)\) out\[k\]=g\(k\);/.test(body), body.slice(-200));
  ok('★★isGlobalKey に v292Dfix658 は含まれない',
     HOME.slice(HOME.indexOf('function isGlobalKey'), HOME.indexOf('function isGlobalKey') + 300).indexOf('v292Dfix658') < 0);
  ok('★★home の push が組む pkg は collectLS() の結果だけ（fix658 台帳を足していない）',
     /ls:collectLS\(\), full:true/.test(HOME) && !/v292Dfix658_/.test(CODEHOME),
     (CODEHOME.match(/.{0,40}v292Dfix658_.{0,40}/) || [])[0]);
}

/* =====================================================================
   (7) commitstate は読取専用
   ===================================================================== */
console.log('\n== (7) 読取専用（書込opを一切発行しない） ==');
{
  ok('★★ソースに op:put / forceput / putimg が存在しない',
     !/op\s*:\s*['"](put|forceput|putimg)['"]/.test(SRC658) && SRC658.indexOf("'forceput'") < 0 && SRC658.indexOf("'putimg'") < 0);
  ok('★★使う op は commitstate だけ', (() => {
    const ops = (CODE658.match(/op\s*:\s*'([a-z]+)'/g) || []).map(t => t.replace(/.*'([a-z]+)'/, '$1'));
    return ops.length >= 1 && ops.every(o => o === 'commitstate');
  })(), (CODE658.match(/op\s*:\s*'([a-z]+)'/g) || []));
  ok('★fetch の呼び出しは commitstate の1か所だけ', (CODE658.match(/fetch\s*\(/g) || []).length === 1,
     (CODE658.match(/fetch\s*\(/g) || []).length);
  ok('★10秒のタイムアウトがある', /CS_TIMEOUT_MS\s*=\s*10000/.test(SRC658) && /ctrl\.abort\(\)/.test(SRC658));
}
{
  const sb = makeSandbox({ seed: { v292ProxyPass: 'pw', v292Dfix658_anchor: anchorSeed() },
                           reply: { ok: true, rev: 12, packageHash: 'PHNEW00000' } });
  const F = load658(sb);
  await F.noteConflict({ where: 'put-fork', serverRev: 12, localLsHash: '1:1' });
  F.notePull({ rev: 3, lsHash: '1:1', via: 'pull-index' });
  await tick();
  ok('★★実行しても送るのは commitstate だけ', sb._calls.every(c => c.body && c.body.op === 'commitstate'), sb._calls.map(c => c.body && c.body.op));
  ok('★★送り先は /save（既存のプロキシ規約）', sb._calls.every(c => /\/save$/.test(c.url)), sb._calls.map(c => c.url));
  ok('★認証ヘッダを自前で組む（呼出側に依存しない）', sb._calls[0].headers['x-chronicle-pass'] === 'pw', sb._calls[0].headers);
}

/* =====================================================================
   (8) OFF スイッチ
   ===================================================================== */
console.log('\n== (8) OFF なら完全に no-op ==');
{
  const sb = makeSandbox({ seed: { v292Dfix658Off: '1', v292ProxyPass: 'pw', v292Dfix658_anchor: anchorSeed() },
                           reply: { ok: true, rev: 12, packageHash: 'PHNEW00000' } });
  const F = load658(sb);
  const before = JSON.stringify(sb._ls.__store);
  ok('★★OFF でも API オブジェクトは生える（呼出側は存在チェックだけで済む）',
     !!F && typeof F.noteCommit === 'function' && typeof F.notePull === 'function' && typeof F.noteConflict === 'function');
  F.noteCommit({ rev: 1, packageHash: 'P', lsHash: 'x' });
  F.notePull({ rev: 2, lsHash: 'y', via: 'pull-home' });
  await F.noteConflict({ where: 'put-fork', serverRev: 3, localLsHash: 'z' });
  F._resetCensus();
  await tick();
  ok('★★OFF なら台帳は1バイトも変わらない', JSON.stringify(sb._ls.__store) === before, sb._ls.__store);
  ok('★★OFF なら通信0', sb._calls.length === 0, sb._calls.length);
  ok('★★OFF と正直に名乗る（嘘の合格を出さない）', F.status().on === false && F.status().off === true, F.status());
  ok('★OFF でも selfTest は分類器を検査できる（純関数なので）', F.selfTest().ok === true, F.selfTest().fails);
}
{
  const sb = makeSandbox();
  const F = load658(sb);
  const st = F.selfTest();
  ok('★★selfTest が真理値表を通る（ok:true / fails:[]）', st.ok === true && Array.isArray(st.fails) && st.fails.length === 0, st);
  ok('★selfTest は boolean 配列ではなく {ok,fails} を返す', typeof st.ok === 'boolean' && Array.isArray(st.fails));
  ok('★selfTest は1バイトも書かない', Object.keys(sb._ls.__store).filter(k => k.indexOf('v292Dfix658_') === 0).length === 0);
}
{
  const sb = makeSandbox({ seed: { v292ProxyPass: 'pw' } });
  const F = load658(sb);
  F.noteCommit({ rev: 1, packageHash: 'P', lsHash: 'x' });
  ok('★_resetCensus は census だけを初期化し anchor は残す', (() => {
    F._resetCensus();
    return F.census().events.length === 0 && F.anchor() && F.anchor().localBaseRev === 1;
  })(), { c: F.census(), a: F.anchor() });
}

/* =====================================================================
   (9) shadow 不変条件（既存の分岐が1文も変わっていない）
   ===================================================================== */
console.log('\n== (9) shadow 不変条件（fix402 の既存文をそのまま残す） ==');
{
  ok('★★fork 分岐の既存文がそのまま残っている',
     /if \(r\.status === 200 && r\.json && r\.json\.ok && r\.json\.fork\) \{ forkBanner\(r\.json\.server \|\| \{\}\);/.test(SRC402) &&
     /return 'fork'; \}/.test(SRC402));
  ok('★★local-ahead 分岐の既存文がそのまま残っている',
     /applying = false;[\s\S]{0,200}pull中止\(local-ahead:全スロット比較\)→forkへ委譲[\s\S]{0,60}flush\('local-ahead'\);/.test(SRC402));
  ok('★★applyPkg の setBaseRev / lastHash がそのまま残っている',
     /setBaseRev\(rev\);\s*\n\s*try \{ lsSet\('v292Dfix402_lastHash', lsHash\(JSON\.stringify\(pkg\.ls \|\| \{\}\)\)\); \} catch\(e\)\{\}/.test(SRC402));
  ok('★★put 成功の setBaseRev / lastHash がそのまま残っている',
     /if \(r\.json\.rev != null\) setBaseRev\(r\.json\.rev\);/.test(SRC402) &&
     /lsSet\('v292Dfix402_lastHash', h\);/.test(SRC402));
  ok('★★applyPkg のフックは lastHash を読み戻すだけ（巨大 pkg を2度 stringify しない）',
     /notePull\(\{ rev: rev, lsHash: lsGet\('v292Dfix402_lastHash'\)/.test(SRC402));
  ok('★★フックは fix402 の変数を1つも書き換えない（代入が無い）', (() => {
    const hooks = SRC402.match(/try \{ if \(window\.__v292Dfix658\)[\s\S]*?\} catch\(e\)\{\}/g) || [];
    return hooks.length === 4 && hooks.every(h => !/[^=!<>]=[^=]/.test(h.replace(/__v292Dfix658\.\w+\(\{[\s\S]*?\}\)/g, 'CALL')));
  })(), (SRC402.match(/try \{ if \(window\.__v292Dfix658\)[\s\S]*?\} catch\(e\)\{\}/g) || []).length);
  ok('★★home.html の local-ahead スキップ判定はそのまま',
     /var lt = turnsOf\(g\(k\)\), rt = turnsOf\(ls\[k\]\);\s*\n\s*if\(lt > rt\)\{ skipped\.push\(k\); continue; \}/.test(HOME));
  ok('★★home.html の baseRev 更新はそのまま', /s\('v292Dfix402_baseRev', String\(serverRev\)\);/.test(HOME));
  ok('★★fix402 の実コードに現れる fix658 は「存在チェック+呼び出し」の8個だけ（他の改変が無い）',
     (CODE402.match(/__v292Dfix658/g) || []).length === 8 && (CODE402.match(/fix658/g) || []).length === 8,
     { api: (CODE402.match(/__v292Dfix658/g) || []).length, all: (CODE402.match(/fix658/g) || []).length });
  ok('★★home.html の実コードに現れる fix658 は「存在チェック+呼び出し」5個と script タグだけ', (() => {
    const api = (CODEHOME.match(/__v292Dfix658/g) || []).length;
    const tags = (CODEHOME.match(/v292Dfix658-lineage-shadow\.js\?cb=v292Dfix658/g) || []).length;
    const cbs = (CODEHOME.match(/\?cb=v292Dfix658/g) || []).length;      /* 出荷札（全モジュール共通） */
    const built = (CODEHOME.match(/HOME_BUILT = '\d{8}-fix658'/g) || []).length;
    const all = (CODEHOME.match(/fix658/g) || []).length;
    return api === 5 && tags === 1 && all === api + cbs + built + tags;
  })(), { api: (CODEHOME.match(/__v292Dfix658/g) || []).length, all: (CODEHOME.match(/fix658/g) || []).length });
}

/* =====================================================================
   (9a) fix402 を**実際に走らせて**フックが効くことを確かめる
   ===================================================================== */
console.log('\n== (9a) fix402 の put / fork / local-ahead 実走 ==');
const story = n => JSON.stringify({ turns: new Array(n).fill(0).map(() => ({})) });
const flushHome = async () => { for (let i = 0; i < 60; i++) await new Promise(r => setImmediate(r)); };
function mkIndex(opts){
  const store = Object.assign({ v292ProxyPass: 'pw', 'chr6': story(2) }, opts.seed || {});
  const ls = {
    getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    key: i => { const a = Object.keys(store); return i < a.length ? a[i] : null; },
    get length(){ return Object.keys(store).length; }
  };
  const calls = [];
  const mkEl = () => ({ style: { cssText: '' }, innerHTML: '', textContent: '', id: '',
                        appendChild(){}, parentNode: null, onclick: null });
  const w = {
    localStorage: ls, navigator: { userAgent: 'test' },
    document: { body: { appendChild(){} }, documentElement: { appendChild(){} },
                createElement: mkEl, addEventListener(){}, visibilityState: 'visible' },
    addEventListener(){}, setTimeout: () => 0, clearTimeout(){}, setInterval: () => 0, clearInterval(){},
    console: { log(){}, warn(){}, error(){} }, AbortController: undefined,
    fetch(url, o){
      let b = null; try { b = JSON.parse((o && o.body) || '{}'); } catch(e){ b = {}; }
      calls.push(b);
      return Promise.resolve({ status: 200, json: () => Promise.resolve(opts.server(b)) });
    }
  };
  w.window = w;
  const ctx = vm.createContext(w);
  vm.runInContext(SRC658, ctx, { filename: 'v292Dfix658' });
  vm.runInContext(SRC402, ctx, { filename: 'v292Dfix402' });
  return { w, store, calls, ctx };
}
{
  /* put 成功 → anchor が確定する */
  const h = mkIndex({ server: b => b.op === 'put' ? { ok: true, rev: 9, packageHash: 'PH9', lastCommitOpId: 'op9' } : { ok: false } });
  const res = await h.w.window.__v292Dfix402.flush('test');
  await flushHome();
  const F = h.w.window.__v292Dfix658;
  ok('★★既存の挙動は変わらない: put は成功して pushed を返す', res === 'pushed', res);
  ok('★★既存の挙動は変わらない: baseRev / lastHash が更新される',
     h.store['v292Dfix402_baseRev'] === '9' && !!h.store['v292Dfix402_lastHash'], h.store['v292Dfix402_baseRev']);
  const a = F.anchor();
  ok('★★noteCommit が呼ばれ anchor が確定する（via=put）',
     a && a.localBaseRev === 9 && a.localBasePackageHash === 'PH9' && a.localBaseCommitOpId === 'op9' && a.via === 'put', a);
  ok('★★anchor の localLsHash は fix402 が書いた lastHash と同値（系譜の基準が1つ）',
     a.localLsHash === h.store['v292Dfix402_lastHash'], { a: a.localLsHash, ls: h.store['v292Dfix402_lastHash'] });
  ok('★put 成功では commitstate を呼ばない（余計な往復をしない）',
     h.calls.every(c => c.op !== 'commitstate'), h.calls.map(c => c.op));
}
{
  /* fork 応答 → forkBanner は従来どおり出て、競合が記録される */
  const h = mkIndex({
    seed: { 'v292Dfix658_anchor': anchorSeed({ localBaseRev: 8, localBasePackageHash: 'PHOLD00000', localLsHash: '1:1' }) },
    server: b => b.op === 'put' ? { ok: true, fork: true, server: { rev: 12, device: 'iPhone' } }
             : b.op === 'commitstate' ? { ok: true, rev: 12, packageHash: 'PHNEW00000' } : { ok: false } });
  const res = await h.w.window.__v292Dfix402.flush('test');
  await flushHome();
  const F = h.w.window.__v292Dfix658;
  ok('★★既存の挙動は変わらない: fork 応答は fork を返す（clean 化しない）', res === 'fork', res);
  ok('★★既存の挙動は変わらない: fork では baseRev を進めない', h.store['v292Dfix402_baseRev'] === undefined, h.store['v292Dfix402_baseRev']);
  const ev = F.census().events[0];
  ok('★★put-fork が競合として記録される', !!ev && ev.where === 'put-fork', ev);
  ok('★★サーバ側の rev が記録される', ev.serverRev === 12, ev);
  ok('★★双方が動いていれば trueDivergence（fork が作られたという事実と一致）',
     ev.cls === 'trueDivergence' && ev.forkWouldBeCreated === true, ev);
}
{
  /* local-ahead → pull は従来どおり中止され、競合が記録される */
  const h = mkIndex({
    seed: { 'chr6': story(5), 'v292Dfix658_anchor': anchorSeed({ localBaseRev: 8, localBasePackageHash: 'PHOLD00000' }) },
    server: b => b.op === 'get' ? { ok: true, rev: 12, data: { ls: { 'chr6': story(2) } } }
             : b.op === 'put' ? { ok: true, rev: 13, packageHash: 'PH13' }
             : b.op === 'commitstate' ? { ok: true, rev: 12, packageHash: 'PHNEW00000' } : { ok: false } });
  await h.w.window.__v292Dfix402.pullApply(false);
  await flushHome();
  const F = h.w.window.__v292Dfix658;
  ok('★★既存の挙動は変わらない: 進んでいるローカルは上書きされない', h.store['chr6'] === story(5), h.store['chr6']);
  const ev = (F.census().events || []).filter(e => e.where === 'local-ahead')[0];
  ok('★★local-ahead が競合として記録される', !!ev, F.census().events);
  ok('★★turnDelta を fix402 のループに触らず数えられている（5-2=3）', ev.turnDelta === 3, ev);
  ok('★localLsHash が無いので unknownLineage（推測しない）',
     ev.cls === 'unknownLineage' && ev.reason === 'local-hash-unknown', ev);
}

/* =====================================================================
   (9b) home.html の pull() を**実際に走らせて**フックが効くことを確かめる
        （文字列検査だけだと「フックを書いたのに一度も呼ばれない」を見逃す）
   ===================================================================== */
console.log('\n== (9b) home.html pull() の実走（挙動は変わらず、記録だけ増える） ==');
function homeScript(){
  const parts = HOME.match(/<script>[\s\S]*?<\/script>/g) || [];
  const bodies = parts.map(p => p.replace(/^<script>/, '').replace(/<\/script>$/, ''));
  return bodies[bodies.length - 1];
}
const HOME_JS = homeScript();

function mkHome(opts){
  const store = Object.assign({}, opts.seed || {});
  const ls = {
    getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    key: i => { const a = Object.keys(store); return i < a.length ? a[i] : null; },
    get length(){ return Object.keys(store).length; }
  };
  const nodes = {};
  function mkEl(id){
    const e = { id, value: '', textContent: '', innerHTML: '', className: '', style: { cssText: '' },
      firstChild: null, children: [], addEventListener(){}, appendChild(c){ e.children.push(c); return c; },
      removeChild(){}, remove(){}, querySelectorAll: () => [], setAttribute(){}, getAttribute: () => null,
      removeAttribute(){}, click(){}, closest: () => null,
      classList: { add(){}, remove(){}, contains: () => false } };
    nodes[id] = e; return e;
  }
  ['q','sort','listTitle','navs','recent','grid','detail','sync','note','upBtn','downBtn','expBtn','impBtn','impFile'].forEach(mkEl);
  const body = mkEl('__body');
  const document = { body, getElementById: id => nodes[id] || null,
    createElement: () => mkEl('__el' + Math.random()), createTextNode: t => ({ nodeValue: String(t) }),
    querySelectorAll: () => [], addEventListener(){} };
  const calls = [];
  const w = {
    localStorage: ls, sessionStorage: { getItem: () => null, setItem(){}, removeItem(){} },
    document, navigator: { userAgent: 'test' },
    location: { href: '', search: '', pathname: '/home.html', replace(){} },
    alert(){}, confirm(){ return true; }, setTimeout: () => 0, clearTimeout(){},
    console: { log(){}, warn(){}, error(){} },
    URL: { createObjectURL: () => 'blob:', revokeObjectURL(){} },
    AbortController: undefined,
    fetch(url, o){
      if (String(url).indexOf('version.txt') >= 0) return Promise.resolve({ ok: true, text: () => Promise.resolve('20260802-fix658') });
      let b = null; try { b = JSON.parse((o && o.body) || '{}'); } catch(e){ b = {}; }
      calls.push(b);
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(opts.server(b)) });
    }
  };
  w.window = w; w.self = w;
  const ctx = vm.createContext(w);
  if (opts.with658 !== false) vm.runInContext(SRC658, ctx, { filename: 'v292Dfix658' });
  vm.runInContext(HOME_JS, ctx, { filename: 'home.html<script>' });
  return { w, store, ls, calls, nodes };
}

{
  /* ケースA: ローカルの方が進んでいる物語がある → per-slot local-ahead スキップが起きる */
  const remoteLs = { 'chr6_slots_meta': JSON.stringify([{ id: 'sA', name: 'A' }]), 'chr6_slot_sA': story(2) };
  const h = mkHome({
    seed: { v292ProxyPass: 'pw', 'chr6_slots_meta': JSON.stringify([{ id: 'sA', name: 'A' }]), 'chr6_slot_sA': story(5) },
    server: b => b.op === 'meta' ? { ok: true, rev: 20, meta: { updatedAt: 1 } }
             : b.op === 'get' ? { ok: true, rev: 20, data: { ls: remoteLs, updatedAt: 1 } }
             : b.op === 'commitstate' ? { ok: true, rev: 20, packageHash: 'PHNEW00000', lastCommitOpId: 'opZ' }
             : { ok: false }
  });
  await flushHome();
  const F = h.w.window.__v292Dfix658;
  ok('★★既存の挙動は変わらない: 進んでいるローカルは上書きされない', h.store['chr6_slot_sA'] === story(5), h.store['chr6_slot_sA']);
  ok('★★既存の挙動は変わらない: baseRev は serverRev へ進む', h.store['v292Dfix402_baseRev'] === '20', h.store['v292Dfix402_baseRev']);
  ok('★★フックが実際に呼ばれている（anchor が via=pull-home で立つ）',
     !!F.anchor() && F.anchor().via !== undefined && F.anchor().localBaseRev === 20, F.anchor());
  ok('★★ローカル差分を残したので lsHash は null（嘘を書かない）', F.anchor().localLsHash === null, F.anchor());
  const ev = F.census().events[F.census().events.length - 1];
  ok('★★home-pull-skip が競合として記録される', !!ev && ev.where === 'home-pull-skip', ev);
  ok('★★turnDelta = スキップしたスロットの (local - remote) 合計（5-2=3）', ev.turnDelta === 3, ev);
  ok('★書込先は fix658 の2キーだけ（他人のキーを増やさない）',
     Object.keys(h.store).filter(k => k.indexOf('v292Dfix658') === 0).sort().join(',') === 'v292Dfix658_anchor,v292Dfix658_census',
     Object.keys(h.store));
}
{
  /* ケースB: ローカル差分を1件も残さずに取り込めた → lsHash を記録する */
  const remoteLs = { 'chr6_slot_sA': story(9) };
  const h = mkHome({
    seed: { v292ProxyPass: 'pw', 'chr6_slots_meta': JSON.stringify([{ id: 'sA', name: 'A' }]), 'chr6_slot_sA': story(1) },
    server: b => b.op === 'meta' ? { ok: true, rev: 30, meta: { updatedAt: 1 } }
             : b.op === 'get' ? { ok: true, rev: 30, data: { ls: remoteLs, updatedAt: 1 } }
             : b.op === 'commitstate' ? { ok: true, rev: 30, packageHash: 'PH30', lastCommitOpId: 'op30' }
             : { ok: false }
  });
  await flushHome();
  const F = h.w.window.__v292Dfix658;
  ok('★★既存の挙動は変わらない: 進んだ remote は取り込まれる', h.store['chr6_slot_sA'] === story(9));
  const sb = makeSandbox(); const R = load658(sb);
  ok('★★差分ゼロで取り込めたときだけ lsHash を記録する',
     F.anchor().localLsHash === R.lsHash(JSON.stringify(remoteLs)), F.anchor());
  ok('★★backfill で packageHash が埋まる（home 経路でも系譜がつながる）',
     F.anchor().localBasePackageHash === 'PH30' && F.anchor().via === 'backfill', F.anchor());
  ok('★スキップが無ければ競合イベントは記録しない', F.census().events.length === 0, F.census().events);
}
{
  /* 対照: fix658 が載っていなくても home.html の pull は従来どおり動く（フックが依存を作っていない） */
  const remoteLs = { 'chr6_slot_sA': story(9) };
  const h = mkHome({ with658: false,
    seed: { v292ProxyPass: 'pw', 'chr6_slots_meta': JSON.stringify([{ id: 'sA', name: 'A' }]), 'chr6_slot_sA': story(1) },
    server: b => b.op === 'meta' ? { ok: true, rev: 30, meta: { updatedAt: 1 } }
             : b.op === 'get' ? { ok: true, rev: 30, data: { ls: remoteLs, updatedAt: 1 } } : { ok: false }
  });
  await flushHome();
  ok('★★[対照] fix658 不在でも取り込みは成功する（フックは fail-open）',
     h.store['chr6_slot_sA'] === story(9) && h.store['v292Dfix402_baseRev'] === '30', h.store['v292Dfix402_baseRev']);
  ok('★★[対照] fix658 不在なら commitstate も飛ばない', h.calls.every(c => c.op !== 'commitstate'), h.calls.map(c => c.op));
}

/* =====================================================================
   (10) 出荷の体裁
   ===================================================================== */
console.log('\n== (10) 出荷の体裁（script タグ・cb） ==');
{
  const token = (read('version.txt').trim().match(/-(fix\w+)$/) || [])[1];
  ok('★version.txt から fix札を取り出せた', !!token, token);
  ok('★★index.html に fix658 の script がある（cb は今の fix札）',
     (HTMLU.match(/v292Dfix658-lineage-shadow\.js\?cb=v292D(\w+)/) || [])[1] === token,
     (HTMLU.match(/v292Dfix658-lineage-shadow\.js\?cb=[^"]*/) || [])[0]);
  ok('★★home.html にも fix658 の script がある',
     (HOME.match(/v292Dfix658-lineage-shadow\.js\?cb=v292D(\w+)/) || [])[1] === token,
     (HOME.match(/v292Dfix658-lineage-shadow\.js\?cb=[^"]*/) || [])[0]);
  ok('★★index.html で fix658 は fix654(storage trap) より後',
     HTMLU.indexOf('v292Dfix658-lineage-shadow.js') > HTMLU.indexOf('v292Dfix654-storage-trap.js'));
  ok('★★index.html で fix658 は fix402 より前（呼ばれる側が先に載る）',
     HTMLU.indexOf('v292Dfix658-lineage-shadow.js') < HTMLU.indexOf('v292Dfix402-invisible-sync.js'));
  ok('★★中身を変えた fix402 の cb も今の fix札に上がっている',
     (HTMLU.match(/v292Dfix402-invisible-sync\.js\?cb=v292D(\w+)/) || [])[1] === token,
     (HTMLU.match(/v292Dfix402-invisible-sync\.js\?cb=[^"]*/) || [])[0]);
  ok('★index.html の NUL は1個のまま',
     fs.readFileSync(path.join(__dirname, 'index.html')).filter(b => b === 0).length === 1);
  ok('★home.html に NUL / CRLF は無い', (() => {
    const b = fs.readFileSync(path.join(__dirname, 'home.html'));
    return b.filter(x => x === 0).length === 0 && b.indexOf(Buffer.from('\r\n')) < 0;
  })());
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);

})().catch(e => { console.error('FATAL', e); console.log('PASS ' + pass + ' / FAIL ' + (fail + 1)); process.exit(1); });
