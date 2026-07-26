/* test_fix569.cjs — v292Dfix569（削除の影監視）の回帰テスト
 *
 * 固定するのは**契約(振る舞い)**であって、ソースの形ではない。
 *   ①挙動を1バイトも変えない（キー集合・値・戻り値・下流呼び出し）
 *   ②分類器が死んでも素通しする
 *   ③canary 3種で生存証明ができる
 *   ④7経路を byPath へ識別できる
 *   ⑤自分では localStorage へ1バイトも書かない
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, 'v292Dfix569-gc-shadow.js');

let pass = 0, fail = 0;
function ok(name, cond, extra){ if (cond){ pass++; console.log('  ok  ' + name); } else { fail++; console.log('  NG  ' + name + (extra ? '  ' + JSON.stringify(extra) : '')); } }
function eq(name, a, b){ ok(name + ' (' + JSON.stringify(a) + ' === ' + JSON.stringify(b) + ')', a === b); }

/* ---- localStorage のモック --------------------------------------------------
   ★2026-07-26の教訓: setItem したキーが Object.keys(localStorage) にも見えないと、
   「新しく書いたキーを走査するテスト」が素通りで合格する。ここでは length/key() を
   実データから引くので同じ穴は開かない。 */
function makeEnv(){
  const store = {};
  const ls = {
    getItem(k){ return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v){ store[k] = String(v); },
    removeItem(k){ delete store[k]; },
    key(i){ return Object.keys(store)[i] === undefined ? null : Object.keys(store)[i]; },
    clear(){ Object.keys(store).forEach(k => delete store[k]); }
  };
  Object.defineProperty(ls, 'length', { get(){ return Object.keys(store).length; } });
  const win = { addEventListener(){}, };
  const doc = { readyState: 'complete', addEventListener(){} };
  const Storage = { prototype: { removeItem: ls.removeItem } };
  const quiet = { log(){}, warn(){}, error(){} };
  new Function('window','document','localStorage','Storage','setTimeout','console',
    fs.readFileSync(SRC, 'utf8'))(win, doc, ls, Storage, setTimeout, quiet);
  return { win, ls, store, f: win.__v292Dfix569 };
}
/* fix562（保護判定）のスタブ。protectedSet() だけを提供する。 */
function stubFix562(win, protectedKeyList){
  win.__v292Dfix562 = { protectedSet(){
    const out = {};
    protectedKeyList.forEach((k, i) => { out['slot' + i] = { key: k, reason: 'テスト保護' }; });
    return out;
  }};
}

console.log('== 1. Phase1: native を捕捉し、armする前は何もしていない ==');
{
  const e = makeEnv();
  eq('armed=false（DOMContentLoaded前は未設置）', e.f.armed(), false);
  const s = e.f.stats();
  ok('native を捕捉している', s.capturedNative === true);
  eq('requestedCalls=0', s.requestedCalls, 0);
  eq('自分では何も書いていない', Object.keys(e.store).length, 0);
}

console.log('== 2. 設置しても挙動が変わらない（キー集合・値・戻り値） ==');
{
  const e = makeEnv();
  e.ls.setItem('chr6_slot_smA', 'story');
  e.ls.setItem('chr6_bk_guard_chr6_slot_smA_1700000000000', 'bk');
  const before = JSON.stringify(e.store);
  e.f.install();
  eq('armed=true', e.f.armed(), true);
  eq('設置だけでは1バイトも変わらない', JSON.stringify(e.store), before);
  const ret = e.ls.removeItem('chr6_bk_guard_chr6_slot_smA_1700000000000');
  eq('戻り値は undefined のまま', ret, undefined);
  eq('要求したキーは実際に消える（拒否しない）', e.ls.getItem('chr6_bk_guard_chr6_slot_smA_1700000000000'), null);
  eq('無関係なキーは残る', e.ls.getItem('chr6_slot_smA'), 'story');
  const s = e.f.stats();
  eq('requestedCalls=1', s.requestedCalls, 1);
  eq('downstreamCalls=1', s.downstreamCalls, 1);
  eq('postChecks=1', s.postChecks, 1);
  eq('影監視は localStorage へ書いていない', Object.keys(e.store).indexOf('v292Dfix569_log'), -1);
}

console.log('== 3. ★保護対象でも「拒否しない」（569aは観測のみ） ==');
{
  const e = makeEnv();
  const K = 'chr6_bk_cloudsync_1700000000001';
  e.ls.setItem(K, 'the only full backup');
  stubFix562(e.win, [K]);
  e.f.install();
  e.ls.removeItem(K);
  const s = e.f.stats();
  eq('wouldDeny=1（判定はする）', s.wouldDeny, 1);
  eq('★それでも実際には消える（挙動を変えない）', e.ls.getItem(K), null);
  eq('wouldAllow=0', s.wouldAllow, 0);
}

console.log('== 4. 分類器が例外を投げても素通しする ==');
{
  const e = makeEnv();
  e.win.__v292Dfix562 = { protectedSet(){ throw new Error('boom'); } };
  e.ls.setItem('chr6_bk_x_1700000000002', 'v');
  e.f.install();
  e.ls.removeItem('chr6_bk_x_1700000000002');
  eq('分類器が壊れても削除は通る', e.ls.getItem('chr6_bk_x_1700000000002'), null);
  const s = e.f.stats();
  eq('classifierErrors>=1', s.classifierErrors >= 1, true);
  eq('unknown=1（判定不能として計上）', s.unknown, 1);
  eq('downstreamCalls=1', s.downstreamCalls, 1);
}

console.log('== 5. canary 3種で生存証明ができる ==');
{
  const e = makeEnv();
  stubFix562(e.win, []);
  e.f.install();
  const r = e.f.selfTest();
  ok('selfTest ok=true', r.ok === true, r);
  eq('classifierAvailable=true', r.classifierAvailable, true);
  eq('probe が byPath へ 3件', r.probePathDelta, 3);
  eq('canary は後始末されている', Object.keys(e.store).filter(k => k.indexOf('chr6_gc_probe_') === 0).length, 0);
  const s = e.f.stats();
  eq('protectedProbeSeen=1', s.protectedProbeSeen, 1);
  eq('allowedProbeSeen=1', s.allowedProbeSeen, 1);
  eq('rewriteProbeSeen=1', s.rewriteProbeSeen, 1);
}

console.log('== 6. ★分類器が居ないときは ok=false になる（全件0を信じない） ==');
{
  const e = makeEnv();
  e.f.install();
  const r = e.f.selfTest();
  eq('ok=false', r.ok, false);
  eq('classifierAvailable=false', r.classifierAvailable, false);
  ok('理由が明示される', typeof r.why === 'string' && r.why.length > 0, r.why);
}

console.log('== 7. 7経路の識別（スタック＋キー形） ==');
{
  const e = makeEnv();
  const P = e.f._pathOf;
  const S490 = 'at v292Dfix490-slot-write-guard.js:80';
  eq('fix490 trimBackups', P('chr6_bk_fix469_smA_1', 'trimBackups ' + S490).id, 'fix490Trim');
  eq('fix490 dropOldestGuardBackup', P('chr6_bk_guard_chr6_slot_smA_1', 'dropOldestGuardBackup ' + S490).id, 'fix490Quota');
  eq('fix490 関数名が取れないときはキー形で割る', P('chr6_bk_saveto_smA_1', S490).id, 'fix490Quota');
  eq('fix264b', P('__gen_chr6_slot_smA', 'at v292Dfix228-slot-generations.js:104').id, 'fix264b');
  eq('fix399', P('chr6_bk_cloudsync_1', 'at v292Dfix399-cloudsync.js:302').id, 'fix399');
  eq('fix402 doomed', P('chr6_slot_smGONE', 'at v292Dfix402-invisible-sync.js:357').id, 'fix402Doomed');
  eq('fix402 doomed（既定枠 chr6 も対象）', P('chr6', 'at v292Dfix402-invisible-sync.js:357').id, 'fix402Doomed');
  eq('fix402 退避世代', P('chr6_bk_cloudsync_del_1', 'at v292Dfix402-invisible-sync.js:365').id, 'fix402Retention');
  eq('fix277', P('chr6_bk_fix538_1', 'at v292Dfix277-quasi-pack.js:489').id, 'fix277');
  eq('canary はキー形で確定する', P('chr6_gc_probe_allowed_x', 'no file info').id, 'fix569probe');
  eq('未知はスタックが取れなくても unknownPath として残す', P('whatever', '').id, 'unknownPath');
}

console.log('== 8. 二重設置しない ==');
{
  const e = makeEnv();
  e.f.install(); e.f.install(); e.f.install();
  eq('installCount=1', e.f.stats().installCount, 1);
  eq('isOutermost=true', e.f.stats().isOutermost, true);
}

console.log('== 9. OFFスイッチ ==');
{
  const e = makeEnv();
  e.ls.setItem('v292Dfix569Off', '1');
  e.f.install();
  eq('armed=false', e.f.armed(), false);
  e.ls.setItem('chr6_bk_z_1', 'v');
  e.ls.removeItem('chr6_bk_z_1');
  eq('素通し（削除は普通に効く）', e.ls.getItem('chr6_bk_z_1'), null);
  eq('計上もしない', e.f.stats().requestedCalls, 0);
}

console.log('== 10. ★observedScope が「まだ観測していない経路」を明示する ==');
{
  const e = makeEnv();
  stubFix562(e.win, []);
  e.f.install();
  e.ls.setItem('chr6_bk_q_1', 'v'); e.ls.removeItem('chr6_bk_q_1');
  const sc = e.f.stats().observedScope;
  eq('7経路すべてが未観測として並ぶ', sc.pathsNeverSeen.length, 7);
  ok('注意書きがある', /無事故の証拠にはならない/.test(sc.note));
}

console.log('== 11. 要求キーが残ったら書換の疑いとして記録する（シナリオ2の観測点） ==');
{
  const e = makeEnv();
  stubFix562(e.win, []);
  e.f.install();
  /* fix246 相当（下流がキー名を書き換える）を挟んだ順序を作り直して再現する */
  const e2 = makeEnv();
  stubFix562(e2.win, []);
  e2.ls.setItem('base', 'v');
  e2.ls.setItem('base_slot_smA', 'v');
  const native = e2.ls.removeItem;
  e2.ls.removeItem = function(k){ return native.call(e2.ls, k === 'base' ? 'base_slot_smA' : k); };  /* = fix246相当 */
  e2.f.install();   /* shadow を最外殻へ */
  e2.ls.removeItem('base');
  const evs = e2.f.events();
  ok('rewriteSuspect が記録される', evs.some(x => x.verdict === 'rewriteSuspect' && x.key === 'base'), evs);
  eq('要求キーは残っている（＝書換が起きた）', e2.ls.getItem('base'), 'v');
  eq('実際には別キーが消えている', e2.ls.getItem('base_slot_smA'), null);
}

console.log('== 12. ★inner（下段の監視）が即座に設置され、迂回を数える ==');
{
  const e = makeEnv();
  const st0 = e.f.stats();
  eq('inner は install() を待たずに設置済み', st0.inner.installed, true);
  e.ls.setItem('chr6_bk_a_1', 'v');
  e.ls.removeItem('chr6_bk_a_1');                 /* outer 未設置 → inner だけ増える */
  const st1 = e.f.stats();
  eq('inner.calls=1', st1.inner.calls, 1);
  eq('outer.requestedCalls=0', st1.requestedCalls, 0);
  eq('bypassedOuter=1（最外殻を通っていない削除として数える）', st1.bypassedOuter, 1);
  eq('inner は家族別に数える', st1.observedScope.innerByFamily.backup, 1);
}

console.log('== 13. outer 設置後は inner と outer が揃って増える ==');
{
  const e = makeEnv();
  stubFix562(e.win, []);
  e.f.install();
  e.ls.setItem('chr6_bk_b_1', 'v');
  e.ls.removeItem('chr6_bk_b_1');
  const s = e.f.stats();
  eq('inner.calls=1', s.inner.calls, 1);
  eq('outer.requestedCalls=1', s.requestedCalls, 1);
  eq('bypassedOuter=0', s.bypassedOuter, 0);
}

console.log('== 14. ★捕捉済み参照からの削除（fix346/fix472型）を迂回として検出する ==');
{
  const e = makeEnv();
  stubFix562(e.win, []);
  /* fix346 / fix472 と同じく、読込時に参照を bind して保持するコードを模擬 */
  const capturedEarly = e.ls.removeItem.bind(e.ls);
  e.f.install();                                   /* その後で outer を最外殻へ */
  e.ls.setItem('v292av2_nXXXX', 'img');
  capturedEarly('v292av2_nXXXX');                  /* outer を通らない削除 */
  const s = e.f.stats();
  eq('実際には消える', e.ls.getItem('v292av2_nXXXX'), null);
  eq('outer は気づかない', s.requestedCalls, 0);
  eq('★inner が拾う', s.inner.calls, 1);
  eq('bypassedOuter=1', s.bypassedOuter, 1);
  eq('画像として分類', s.observedScope.innerByFamily.image, 1);
  ok('注意書きに fix346/fix472 が明記されている', /fix346\/fix472/.test(s.observedScope.bypassNote));
}

console.log('== 15. selfTest の迂回canary ==');
{
  const e = makeEnv();
  stubFix562(e.win, []);
  e.f.install();
  const r = e.f.selfTest();
  const s3 = r.steps.filter(x => x.name === 'bypass')[0];
  ok('迂回canaryが検出される', s3 && s3.detected === true, s3);
  eq('inner だけ +1', s3.innerDelta, 1);
  eq('outer は +0', s3.outerDelta, 0);
  eq('canary は残らない', Object.keys(e.store).filter(k => k.indexOf('chr6_gc_probe_') === 0).length, 0);
}

console.log('');
console.log('pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
