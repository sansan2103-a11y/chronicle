/* test_fix569.cjs — v292Dfix569（削除の影監視・二層＋操作ID）の回帰テスト
 *
 * 固定するのは**契約(振る舞い)**であって、ソースの形ではない。
 *   ①挙動を1バイトも変えない（キー集合・値・戻り値・下流呼び出し）
 *   ②分類器が死んでも素通しする
 *   ③canary で生存証明ができる（通常/保護/迂回/書換/outer中断/fanout）
 *   ④7経路を byPath へ識別できる（自分自身のフレームは除く）
 *   ⑤自分では localStorage へ1バイトも書かない
 *   ⑥★正式な bypassedOuter は「outer操作IDを持たずに inner へ到達した件数」
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, 'v292Dfix569-gc-shadow.js');

let pass = 0, fail = 0;
function ok(name, cond, extra){ if (cond){ pass++; console.log('  ok  ' + name); } else { fail++; console.log('  NG  ' + name + (extra !== undefined ? ('  ' + JSON.stringify(extra)) : '')); } }
function eq(name, a, b){ ok(name + ' (' + JSON.stringify(a) + ' === ' + JSON.stringify(b) + ')', a === b); }

/* ---- localStorage のモック（setItem したキーが length/key() から見えること） ---- */
function makeEnv(opts){
  opts = opts || {};
  const store = {};
  const ls = {
    getItem(k){ return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v){ store[k] = String(v); },
    removeItem(k){ delete store[k]; },
    key(i){ return Object.keys(store)[i] === undefined ? null : Object.keys(store)[i]; },
    clear(){ Object.keys(store).forEach(k => delete store[k]); }
  };
  Object.defineProperty(ls, 'length', { get(){ return Object.keys(store).length; } });
  const win = { addEventListener(){} };
  const doc = { readyState: 'complete', addEventListener(){} };
  const Storage = { prototype: { removeItem: ls.removeItem } };
  const quiet = { log(){}, warn(){}, error(){} };
  if (opts.preMarker) win[opts.preMarker] = 1;      /* ロード順の異常を作る */
  new Function('window','document','localStorage','Storage','setTimeout','console',
    fs.readFileSync(SRC, 'utf8'))(win, doc, ls, Storage, setTimeout, quiet);
  return { win, ls, store, f: win.__v292Dfix569 };
}
function stubFix562(win, keys){
  win.__v292Dfix562 = { protectedSet(){ const o = {}; keys.forEach((k,i)=>{ o['s'+i] = { key:k, reason:'テスト保護' }; }); return o; } };
}

console.log('== 1. Phase1: inner は即設置、outer は install() まで未設置 ==');
{
  const e = makeEnv();
  const s = e.f.stats();
  eq('inner は install() を待たずに設置済み', s.innerInstalled, true);
  eq('outer は未設置', s.outerInstalled, false);
  eq('native を捕捉している', s.capturedNative, true);
  eq('★ロード順は検証済み（後続fixのマーカーが0件）', s.loadOrderVerified, true);
  eq('自分では何も書いていない', Object.keys(e.store).length, 0);
}

console.log('== 2. ★ロード順が崩れていたら loadOrderVerified=false ==');
{
  const e = makeEnv({ preMarker: '__v292Dfix246' });
  const s = e.f.stats();
  eq('loadOrderVerified=false', s.loadOrderVerified, false);
  ok('どのfixが先に居たか記録される', s.markersAtLoad.indexOf('fix246') >= 0, s.markersAtLoad);
  ok('observedScope に警告が出る', /fix569 より前に起動/.test(s.observedScope.loadOrderNote), s.observedScope.loadOrderNote);
}

console.log('== 3. 設置しても挙動が変わらない ==');
{
  const e = makeEnv();
  e.ls.setItem('chr6_slot_smA', 'story');
  e.ls.setItem('chr6_bk_guard_smA_1700000000000', 'bk');
  const before = JSON.stringify(e.store);
  e.f.install();
  eq('設置だけでは1バイトも変わらない', JSON.stringify(e.store), before);
  const ret = e.ls.removeItem('chr6_bk_guard_smA_1700000000000');
  eq('戻り値は undefined のまま', ret, undefined);
  eq('要求したキーは実際に消える（拒否しない）', e.ls.getItem('chr6_bk_guard_smA_1700000000000'), null);
  eq('無関係なキーは残る', e.ls.getItem('chr6_slot_smA'), 'story');
  const s = e.f.stats();
  eq('outerRequests=1', s.outerRequests, 1);
  eq('innerWithOuter=1', s.innerWithOuter, 1);
  eq('innerWithoutOuter=0', s.innerWithoutOuter, 0);
  eq('outerWithOneInner=1', s.outerWithOneInner, 1);
  eq('postChecks=1', s.postChecks, 1);
  eq('影監視は localStorage へ書いていない', Object.keys(e.store).indexOf('v292Dfix569_log'), -1);
}

console.log('== 4. ★保護対象でも「拒否しない」（569aは観測のみ） ==');
{
  const e = makeEnv();
  const K = 'chr6_bk_cloudsync_1700000000001';
  e.ls.setItem(K, 'the only full backup');
  stubFix562(e.win, [K]);
  e.f.install();
  e.ls.removeItem(K);
  const s = e.f.stats();
  eq('wouldDeny=1（判定はする）', s.wouldDeny, 1);
  eq('★それでも実際には消える', e.ls.getItem(K), null);
}

console.log('== 5. 分類器が例外を投げても素通しする ==');
{
  const e = makeEnv();
  e.win.__v292Dfix562 = { protectedSet(){ throw new Error('boom'); } };
  e.ls.setItem('chr6_bk_x_1700000000002', 'v');
  e.f.install();
  e.ls.removeItem('chr6_bk_x_1700000000002');
  eq('分類器が壊れても削除は通る', e.ls.getItem('chr6_bk_x_1700000000002'), null);
  const s = e.f.stats();
  ok('classifierErrors>=1', s.classifierErrors >= 1);
  eq('unknown=1', s.unknown, 1);
  eq('innerWithOuter=1', s.innerWithOuter, 1);
}

console.log('== 6. canary で生存証明ができる ==');
{
  const e = makeEnv();
  stubFix562(e.win, []);
  e.f.install();
  const r = e.f.selfTest();
  ok('selfTest ok=true', r.ok === true, r);
  eq('classifierAvailable=true', r.classifierAvailable, true);
  eq('outer を通ったのは2件（protected/normal）', r.probePathDelta, 2);
  eq('canary は後始末されている', Object.keys(e.store).filter(k => k.indexOf('chr6_gc_probe_') === 0).length, 0);
  const s = e.f.stats();
  eq('protectedProbeSeen=1', s.protectedProbeSeen, 1);
  eq('allowedProbeSeen=1', s.allowedProbeSeen, 1);
  eq('bypassProbeSeen=1', s.bypassProbeSeen, 1);
  ok('カウンタ整合（inner）', s.counters.innerOk, s.counters);
  ok('カウンタ整合（outer）', s.counters.outerOk, s.counters);
}

console.log('== 7. ★分類器が居ないときは ok=false（全件0を信じない） ==');
{
  const e = makeEnv();
  e.f.install();
  const r = e.f.selfTest();
  eq('ok=false', r.ok, false);
  eq('classifierAvailable=false', r.classifierAvailable, false);
  ok('理由が明示される', typeof r.why === 'string' && r.why.length > 0, r.why);
}

console.log('== 8. 7経路の識別（スタック＋キー形） ==');
{
  const e = makeEnv();
  const P = e.f._pathOf;
  const S490 = 'at v292Dfix490-slot-write-guard.js:80';
  eq('fix490 trimBackups', P('chr6_bk_fix469_smA_1', 'trimBackups ' + S490).id, 'fix490Trim');
  eq('fix490 dropOldestGuardBackup', P('chr6_bk_guard_smA_1', 'dropOldestGuardBackup ' + S490).id, 'fix490Quota');
  eq('fix490 関数名が無ければキー形で割る', P('chr6_bk_saveto_smA_1', S490).id, 'fix490Quota');
  eq('fix264b', P('__gen_chr6_slot_smA', 'at v292Dfix228-slot-generations.js:104').id, 'fix264b');
  eq('fix399', P('chr6_bk_cloudsync_1', 'at v292Dfix399-cloudsync.js:302').id, 'fix399');
  eq('fix402 doomed', P('chr6_slot_smGONE', 'at v292Dfix402-invisible-sync.js:357').id, 'fix402Doomed');
  eq('fix402 doomed（既定枠 chr6 も対象）', P('chr6', 'at v292Dfix402-invisible-sync.js:357').id, 'fix402Doomed');
  eq('fix402 退避世代', P('chr6_bk_cloudsync_del_1', 'at v292Dfix402-invisible-sync.js:365').id, 'fix402Retention');
  eq('fix277', P('chr6_bk_fix538_1', 'at v292Dfix277-quasi-pack.js:489').id, 'fix277');
  eq('canary はキー形で確定', P('chr6_gc_probe_allowed_x', 'no file info').id, 'fix569probe');
  eq('未知は unknownPath として残す', P('whatever', '').id, 'unknownPath');
}

console.log('== 9. ★自分自身のフレームを経路と誤認しない（2026-07-26に踏んだバグ） ==');
{
  /* 影監視のスタックには**必ず自分のファイル名**が含まれる。除かずに照合すると
     すべての削除が「自分（canary）由来」に見え、7経路が1件も数えられなくなる。
     この欠陥は wouldDeny の値には表れないので、経路別の生存証明を作るまで気づけなかった。 */
  const e = makeEnv();
  stubFix562(e.win, []);
  e.f.install();
  e.ls.setItem('chr6_bk_cloudsync_1780000000000', 'v');
  e.ls.removeItem('chr6_bk_cloudsync_1780000000000');
  const s = e.f.stats();
  eq('★canary 扱いにならない', s.byPath.fix569probe, 0);
  eq('outerRequests=1', s.outerRequests, 1);
  const r = e.f.selfTest();
  eq('★canary は今も canary として数える', r.probePathDelta, 2);
}

console.log('== 10. 二重設置しない / OFFスイッチ ==');
{
  const e = makeEnv();
  e.f.install(); e.f.install(); e.f.install();
  eq('outerInstallCount=1', e.f.stats().outerInstallCount, 1);
  eq('innerInstallCount=1', e.f.stats().innerInstallCount, 1);
  eq('isOutermost=true', e.f.stats().isOutermost, true);
}
{
  const e0 = makeEnv();
  e0.ls.setItem('v292Dfix569Off', '1');
  const e = makeEnv();  /* OFF は読み込み時に効く必要があるので別環境で確認 */
  e.ls.setItem('v292Dfix569Off', '1');
  e.f.install();
  eq('OFF なら outer は設置されない', e.f.armed(), false);
  e.ls.setItem('chr6_bk_z_1', 'v');
  e.ls.removeItem('chr6_bk_z_1');
  eq('素通し（削除は普通に効く）', e.ls.getItem('chr6_bk_z_1'), null);
  eq('outer は計上しない', e.f.stats().outerRequests, 0);
}

console.log('== 11. ★正式な bypassedOuter = innerWithoutOuter ==');
{
  const e = makeEnv();
  stubFix562(e.win, []);
  /* fix346 / fix472 と同じく、読込時に参照を bind して保持するコードを模擬 */
  const capturedEarly = e.ls.removeItem.bind(e.ls);
  e.f.install();
  e.ls.setItem('v292av2_nXXXX', 'img');
  capturedEarly('v292av2_nXXXX');           /* outer を通らない削除 */
  const s = e.f.stats();
  eq('実際には消える', e.ls.getItem('v292av2_nXXXX'), null);
  eq('outerRequests=0', s.outerRequests, 0);
  eq('★innerWithoutOuter=1', s.innerWithoutOuter, 1);
  eq('★bypassedOuter は innerWithoutOuter と同じ', s.bypassedOuter, 1);
  eq('画像として分類', s.observedScope.innerByFamily.image, 1);
  ok('カウンタ整合', s.counters.innerOk && s.counters.outerOk, s.counters);
}

console.log('== 12. ★fix246 の書換を二層の間で観測できる（rewrite canary の定義固定） ==');
{
  const e = makeEnv();
  stubFix562(e.win, []);
  /* fix246 相当を outer と inner の間に挟む（キー名を書き換える） */
  const inner = e.ls.removeItem;
  e.ls.setItem('base', 'v'); e.ls.setItem('base_slot_smA', 'v');
  e.ls.removeItem = function(k){ return inner.call(e.ls, k === 'base' ? 'base_slot_smA' : k); };
  e.f.install();
  e.ls.removeItem('base');
  const s = e.f.stats();
  eq('rewrittenKeys=1', s.rewrittenKeys, 1);
  eq('★fix246ObservedBetweenLayers=true', s.fix246ObservedBetweenLayers, true);
  eq('要求キーは残っている（＝書換が起きた）', e.ls.getItem('base'), 'v');
  eq('実際には別キーが消えている', e.ls.getItem('base_slot_smA'), null);
  const ev = e.f.events().filter(x => x.key === 'base')[0];
  ok('イベントに実効キーが残る', ev && ev.rewritten === true && ev.effectiveKey === 'base_slot_smA', ev);
  eq('迂回としては数えない', s.innerWithoutOuter, 0);
}

console.log('== 13. ★outer中断 canary（中間ラッパが例外）→ outerWithoutInner ==');
{
  const e = makeEnv();
  stubFix562(e.win, []);
  const inner = e.ls.removeItem;
  e.ls.removeItem = function(k){ if (k === 'boom') throw new Error('middle failed'); return inner.call(e.ls, k); };
  e.f.install();
  let threw = false;
  try { e.ls.removeItem('boom'); } catch(err){ threw = true; }
  const s = e.f.stats();
  ok('例外はそのまま呼び出し元へ伝わる', threw);
  eq('outerRequests=1', s.outerRequests, 1);
  eq('★outerWithoutInner=1（中間で止まった）', s.outerWithoutInner, 1);
  eq('迂回としては数えない', s.innerWithoutOuter, 0);
  eq('naiveDelta はマイナスになる（＝引き算を正式指標にしない理由）', s.naiveDelta, -1);
  ok('カウンタ整合', s.counters.outerOk, s.counters);
}

console.log('== 14. ★fanout canary（1要求が複数削除へ展開）→ outerFanout ==');
{
  const e = makeEnv();
  stubFix562(e.win, []);
  const inner = e.ls.removeItem;
  e.ls.setItem('a', '1'); e.ls.setItem('b', '2');
  e.ls.removeItem = function(k){ if (k === 'a'){ inner.call(e.ls, 'a'); return inner.call(e.ls, 'b'); } return inner.call(e.ls, k); };
  e.f.install();
  e.ls.removeItem('a');
  const s = e.f.stats();
  eq('outerRequests=1', s.outerRequests, 1);
  eq('★outerFanout=1', s.outerFanout, 1);
  eq('innerWithOuter=2', s.innerWithOuter, 2);
  eq('迂回としては数えない', s.innerWithoutOuter, 0);
  eq('naiveDelta は +1 だが迂回ではない', s.naiveDelta, 1);
  ok('カウンタ整合', s.counters.innerOk && s.counters.outerOk, s.counters);
}

console.log('== 15. 再入（削除の中で別の削除が走る）でも opStack が壊れない ==');
{
  const e = makeEnv();
  stubFix562(e.win, []);
  const inner = e.ls.removeItem;
  e.ls.setItem('x', '1'); e.ls.setItem('y', '2');
  let reentered = false;
  e.ls.removeItem = function(k){
    if (k === 'x' && !reentered){ reentered = true; e.win.__v292Dfix569 && outerCall('y'); }
    return inner.call(e.ls, k);
  };
  e.f.install();
  const outerCall = (kk) => e.ls.removeItem(kk);   /* 最外殻経由で再入させる */
  e.ls.removeItem('x');
  const s = e.f.stats();
  eq('outerRequests=2', s.outerRequests, 2);
  eq('innerWithoutOuter=0（再入は迂回ではない）', s.innerWithoutOuter, 0);
  ok('カウンタ整合', s.counters.innerOk && s.counters.outerOk, s.counters);
  eq('両方とも消えている', (e.ls.getItem('x') === null && e.ls.getItem('y') === null), true);
}

console.log('== 16. observedScope が「まだ観測していない経路」を明示する ==');
{
  const e = makeEnv();
  stubFix562(e.win, []);
  e.f.install();
  e.ls.setItem('chr6_bk_q_1', 'v'); e.ls.removeItem('chr6_bk_q_1');
  const sc = e.f.stats().observedScope;
  eq('7経路すべてが未観測として並ぶ', sc.pathsNeverSeen.length, 7);
  ok('注意書きがある', /無事故の証拠にはならない/.test(sc.note));
  ok('ロード順の結果が出ている', sc.loadOrderVerified === true, sc.loadOrderNote);
}

console.log('');
console.log('pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
