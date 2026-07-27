/* test_fix602_shadow.cjs — v292Dfix602（墓標スロットへの setItem の影監視）の回帰テスト
 *
 * 固定するのは**契約(振る舞い)**であって、ソースの形ではない。
 *   ①墓標が立ったスロットのキーへの setItem を観測して数える
 *   ②生きているスロットへの setItem は数えない
 *   ③★墓標 `sm1` が生きている `sm12` を巻き込まない（部分一致禁止）
 *   ④引用符付き slot ID のサイドストアを正しく墓標判定する
 *   ⑤分類器(fix562)が居なければ `classifierUnavailable` を数え、**書き込みは通す**
 *   ⑥★**経路ごと**に生存証明が立つ（総数だけで判定しない）
 *   ⑦★自分自身のフレームを経路と誤認しない
 *   ⑧localStorage へ1バイトも書かない
 *   ⑨OFF スイッチで観測が止まる
 *   ⑩selfTest() が canary を通してから結果を返す
 *   ⑪何も block しない（blocked は常に0。口だけは将来のために用意する）
 *
 * ★vm.runInContext の filename に**実ファイル名**を渡す。
 *   `new Function` にはファイル名が無く、スタック由来の経路判定を検証できないため。
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c){ pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const eq = (n, a, b) => ok(n + ' (' + JSON.stringify(a) + ' === ' + JSON.stringify(b) + ')', a === b);
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

const FIX602 = 'v292Dfix602-tombstone-write-shadow.js';
const FIX562 = 'v292Dfix562-backup-inventory.js';

/* ---- 実ブラウザに近い環境を作る -------------------------------------------
   ★モック localStorage は **setItem したキーが `Object.keys(localStorage)` にも見える**こと。
     忘れると fix562 のように Object.keys で走査するコードが「何も無い」と判断し、
     「新しく書いたキーを走査するテスト」が素通りで合格する。 */
function mkCtx(opts){
  opts = opts || {};
  const store = {};
  let used = 0;
  const cap = opts.cap == null ? Infinity : opts.cap;
  function expose(k){
    if (['getItem','setItem','removeItem','key','length','clear'].indexOf(k) >= 0) return;
    try { Object.defineProperty(ls, k, { configurable:true, enumerable:true,
      get(){ return store[k]; }, set(v){ store[k] = String(v); } }); } catch(e){}
  }
  const ls = {
    getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem(k, v){
      v = String(v);
      const add = k.length + v.length - (store[k] ? store[k].length : 0);
      if (used + add > cap){ const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
      used += add; store[k] = v; expose(k);
    },
    removeItem(k){ if (store[k] != null){ used -= k.length + store[k].length; delete store[k]; try { delete ls[k]; } catch(e){} } },
    key: i => Object.keys(store)[i] === undefined ? null : Object.keys(store)[i]
  };
  (opts.seedOrder || Object.keys(opts.seed || {})).forEach(k => {
    store[k] = String(opts.seed[k]); used += k.length + store[k].length; expose(k);
  });
  Object.defineProperty(ls, 'length', { get(){ return Object.keys(store).length; } });
  const el = { querySelectorAll: () => [], querySelector: () => null, addEventListener(){}, appendChild(){},
               setAttribute(){}, style:{}, remove(){}, classList:{ add(){}, remove(){}, contains: () => false } };
  const doc = { hidden:false, visibilityState:'visible', readyState:'complete', documentElement:el, body:el,
    querySelectorAll: () => [], querySelector: () => null, getElementById: () => null, addEventListener(){},
    createElement: () => Object.assign({}, el) };
  const logs = [];
  const w = { localStorage: ls, document: doc, Storage: { prototype: { setItem: ls.setItem } },
    console: { log(){}, warn(){ logs.push(Array.prototype.join.call(arguments, ' ')); }, error(){} },
    setTimeout: () => 0, setInterval: () => 0, clearTimeout(){}, clearInterval(){},
    navigator: { userAgent:'node' }, location: { href:'https://x/', search:'', origin:'https://x' },
    addEventListener(){}, removeEventListener(){}, Date, JSON, Math, Object, Array, String, Number, Error, RegExp };
  w.window = w; w.__store = store; w.__logs = logs; w.globalThis = w;
  const ctx = vm.createContext(w);
  if (opts.noClassifier !== true) vm.runInContext(read(FIX562), ctx, { filename: FIX562 });
  vm.runInContext(read(FIX602), ctx, { filename: FIX602 });
  if (opts.install !== false) w.__v292Dfix602.install();
  return { w, ls, store, ctx, f: w.__v292Dfix602 };
}
/* 実ファイル名のスタックで setItem を走らせる（＝実機と同じ見え方） */
function writeFrom(e, file, key, value){
  vm.runInContext('localStorage.setItem(' + JSON.stringify(key) + ',' + JSON.stringify(value == null ? 'v' : value) + ');',
    e.ctx, { filename: file });
}
const TOMB = (id, at) => ({ id, title:'', deleted:true, deletedAt: at || 1780000000000,
                            deleteOpId:'op_' + id, recoverySnapshotId:null, lifecycleVersion:1 });
function meta(entries){ return JSON.stringify(entries); }

/* 実機で起きた状況: 墓標 sm1 が立っているのに本体 chr6_slot_sm1 がまだ生きている */
function bugEnv(extra){
  const seed = Object.assign({
    'chr6_slots_meta': meta([{ id:'sm12', name:'生きている物語' }, TOMB('sm1')]),
    'chr6_slot_sm12': JSON.stringify({ turns:[{},{}] }),
    'chr6_slot_sm1':  JSON.stringify({ turns:[{},{},{},{}] }),
    'chr6_active_slot': '"sm12"'
  }, extra || {});
  return mkCtx({ seed });
}

console.log('\n== 1. 設置の契約（二段階初期化・挙動を変えない） ==');
{
  const e = mkCtx({ seed:{}, install:false });
  let s = e.f.stats();
  eq('読込直後は未設置（全ラッパの読込後に最外殻へ入る）', s.installed, false);
  eq('native は早期に捕捉している', s.capturedNative, true);
  eq('読込だけでは1バイトも書かない', Object.keys(e.store).length, 0);
  e.f.install(); e.f.install(); e.f.install();
  s = e.f.stats();
  eq('install は冪等', s.installCount, 1);
  eq('最外殻に居る', s.isOutermost, true);
  eq('VERSION が出る', typeof s.VERSION, 'string');
}
{
  const e = bugEnv();
  const before = JSON.stringify(e.store);
  const ret = e.ls.setItem('chr6_slot_sm1', 'X');
  eq('戻り値は undefined のまま', ret, undefined);
  eq('値はそのまま書かれる', e.ls.getItem('chr6_slot_sm1'), 'X');
  const others = JSON.parse(before);
  delete others['chr6_slot_sm1'];
  const nowOthers = Object.assign({}, e.store);
  delete nowOthers['chr6_slot_sm1'];
  eq('観測しても他のキーは1バイトも変わらない', JSON.stringify(nowOthers), JSON.stringify(others));
  eq('キーは1本も増えていない', Object.keys(e.store).length, Object.keys(JSON.parse(before)).length);
}

console.log('\n== 2. ★墓標スロットのキーへの setItem を観測して数える ==');
{
  const e = bugEnv();
  writeFrom(e, 'v292Dfix399-cloudsync.js', 'chr6_slot_sm1', JSON.stringify({ turns:[{},{},{},{},{},{}] }));
  const s = e.f.stats();
  eq('observed=1', s.observed, 1);
  eq('★経路が記録される(fix399)', s.byPath.fix399, 1);
  eq('GPT指定の名前でも同じ値', s.tombstoneWriteObservedByPath.fix399, 1);
  eq('unknownTombstoneWrites=0', s.unknownTombstoneWrites, 0);
  eq('★書き込みは通っている（拒否しない）', JSON.parse(e.store['chr6_slot_sm1']).turns.length, 6);
  const r = e.f.recent();
  eq('recent が1件', r.length, 1);
  eq('recent.key', r[0].key, 'chr6_slot_sm1');
  eq('recent.slotId', r[0].slotId, 'sm1');
  eq('recent.path', r[0].path, 'fix399');
  ok('recent.bytes が実バイト数', r[0].bytes > 10, r[0]);
  ok('recent.at が時刻', typeof r[0].at === 'number' && r[0].at > 0, r[0]);
  ok('★整合: observed === byPath の合計', s.consistency.observedEqualsByPathSum, s.byPath);
}

console.log('\n== 3. 生きているスロットへの setItem は数えない ==');
{
  const e = bugEnv();
  writeFrom(e, 'v292Dfix399-cloudsync.js', 'chr6_slot_sm12', JSON.stringify({ turns:[{},{},{}] }));
  writeFrom(e, 'features.js', 'chr6_active_slot', '"sm12"');
  const s = e.f.stats();
  eq('observed=0', s.observed, 0);
  ok('分母は動いている（0件の意味が「見ていない」ではないこと）', s.setItemsSeen >= 2, s.setItemsSeen);
  eq('生きているスロットの本体は普通に書ける', JSON.parse(e.store['chr6_slot_sm12']).turns.length, 3);
}

console.log('\n== 4. ★墓標 sm1 が生きている sm12 を巻き込まない（部分一致禁止） ==');
{
  /* liveSlots() の走査順で結果が変わらないこと。両方の並び順で確認する。 */
  for (const order of [['chr6_slot_sm12','chr6_slot_sm1'], ['chr6_slot_sm1','chr6_slot_sm12']]){
    const seed = {
      'chr6_slots_meta': meta([{ id:'sm12' }, TOMB('sm1')]),
      'chr6_active_slot': '"sm12"'
    };
    seed[order[0]] = '{"turns":[]}'; seed[order[1]] = '{"turns":[]}';
    const e = mkCtx({ seed, seedOrder: ['chr6_slots_meta','chr6_active_slot'].concat(order) });
    writeFrom(e, 'features.js', 'chr6_slot_sm12', '{"turns":[{}]}');
    writeFrom(e, 'features.js', 'chr6_v292Dfix54_genderMap_"sm12"', '{"a":"男"}');
    writeFrom(e, 'features.js', 'chr6_fix77States_sm12', '{"s":1}');
    const s = e.f.stats();
    eq('順序 ' + order[0] + ' 先: sm12 は1件も墓標扱いされない', s.observed, 0);
    /* 同じ環境で sm1 側は確実に数えられる（＝「何も数えていないから0」ではない） */
    writeFrom(e, 'features.js', 'chr6_v292Dfix54_genderMap_"sm1"', '{"a":"女"}');
    eq('  同環境で sm1 は数えられる', e.f.stats().observed, 1);
  }
}
{
  const e = bugEnv();
  eq('_tokenBounded: sm1 は "sm12" を含むキーに一致しない',
     e.f._tokenBounded('chr6_v292Dfix54_genderMap_"sm12"', 'sm1'), false);
  eq('_tokenBounded: 引用符に囲まれた sm1 は一致する',
     e.f._tokenBounded('chr6_v292Dfix54_genderMap_"sm1"', 'sm1'), true);
  eq('_tokenBounded: 末尾の sm1 も一致する', e.f._tokenBounded('chr6_fix77States_sm1', 'sm1'), true);
  eq('_tokenBounded: chr6_slot_sm12 に sm1 は一致しない', e.f._tokenBounded('chr6_slot_sm12', 'sm1'), false);
}

console.log('\n== 5. ★引用符付き slot ID のサイドストアを正しく墓標判定する ==');
{
  /* 実在する家族: chr6_v292Dfix54_genderMap_"smrg85jwsn6"（fix54 が JSON.parse せずに連結している） */
  const ID = 'smrg85jwsn6', SIB = 'smrg85jwsn61';
  const e = mkCtx({ seed: {
    'chr6_slots_meta': meta([{ id: SIB }, TOMB(ID)]),
    ['chr6_slot_' + SIB]: '{"turns":[]}',
    ['chr6_slot_' + ID]:  '{"turns":[{},{}]}'
  }});
  writeFrom(e, 'v292Dfix402-invisible-sync.js', 'chr6_v292Dfix54_genderMap_"' + ID + '"', '{"アリス":"女"}');
  let s = e.f.stats();
  eq('引用符付きサイドストアを観測', s.observed, 1);
  eq('slotId が引用符の中から取れる', e.f.recent()[0].slotId, ID);
  eq('経路 fix402', s.byPath.fix402, 1);
  writeFrom(e, 'v292Dfix402-invisible-sync.js', 'chr6_v292Dfix54_genderMap_"' + SIB + '"', '{"ボブ":"男"}');
  eq('★兄弟ID（末尾に1文字足しただけ）は巻き込まない', e.f.stats().observed, 1);
}
{
  /* 本体が既に消えている（＝分類器の live 一覧に出てこない）墓標のサイドストア */
  const ID = 'smrg85jwsn6';
  const e = mkCtx({ seed: { 'chr6_slots_meta': meta([TOMB(ID)]) } });
  writeFrom(e, 'v292Dfix587-story-lifecycle.js', 'chr6_fix307Roster_' + ID, '[{"n":"アリス"}]');
  const s = e.f.stats();
  eq('本体が無くても墓標のサイドストアとして数える', s.observed, 1);
  eq('slotId', e.f.recent()[0].slotId, ID);
  eq('経路 fix587', s.byPath.fix587, 1);
}

console.log('\n== 6. ★分類器(fix562)が居なければ判定不能として数え、書き込みは通す ==');
{
  const e = mkCtx({ noClassifier:true, seed: {
    'chr6_slots_meta': meta([{ id:'sm12' }, TOMB('sm1')]),
    'chr6_slot_sm1': '{"turns":[]}'
  }});
  eq('前提: 分類器は居ない', e.f.stats().classifierAvailable, false);
  writeFrom(e, 'v292Dfix399-cloudsync.js', 'chr6_slot_sm1', '{"turns":[{},{}]}');
  const s = e.f.stats();
  eq('★classifierUnavailable=1', s.classifierUnavailable, 1);
  eq('★observed=0（判定できないものを観測済みに混ぜない）', s.observed, 0);
  eq('★全件を1ラベルへ倒していない（unknownPath も0）', s.byPath.unknownPath, 0);
  eq('★書き込みは通る', JSON.parse(e.store['chr6_slot_sm1']).turns.length, 2);
  ok('判定不能の合計が出る', s.observedScope.undecidable === 1, s.observedScope);
}
{
  /* 分類器が例外を投げても素通し */
  const e = bugEnv();
  e.w.__v292Dfix562.classifyKey = function(){ throw new Error('boom'); };
  e.f._invalidate();
  writeFrom(e, 'v292Dfix399-cloudsync.js', 'chr6_slot_sm1', 'X');
  const s = e.f.stats();
  ok('classifierErrors>=1', s.classifierErrors >= 1, s.classifierErrors);
  eq('classifierUnavailable=1', s.classifierUnavailable, 1);
  eq('observed=0', s.observed, 0);
  eq('★書き込みは通る', e.ls.getItem('chr6_slot_sm1'), 'X');
}
{
  /* 墓標一覧そのものが壊れている場合も、書き込みは通す */
  const e = mkCtx({ seed: { 'chr6_slots_meta': '{壊れたJSON', 'chr6_slot_sm1': 'v' } });
  writeFrom(e, 'v292Dfix399-cloudsync.js', 'chr6_slot_sm1', 'X');
  const s = e.f.stats();
  ok('metaUnavailable>=1', s.metaUnavailable >= 1, s);
  eq('observed=0', s.observed, 0);
  eq('書き込みは通る', e.ls.getItem('chr6_slot_sm1'), 'X');
}

console.log('\n== 7. ★経路ごとの生存証明（総数だけで判定しない） ==');
{
  const e = bugEnv();
  const cases = [
    ['v292Dfix399-cloudsync.js',       'fix399'],
    ['v292Dfix402-invisible-sync.js',  'fix402'],
    ['v292Dfix587-story-lifecycle.js', 'fix587'],
    ['features.js',                    'features'],
    ['home.html',                      'home'],
    ['index.html',                     'index'],
    ['v292Dfix999-not-a-known-path.js','unknownPath']
  ];
  cases.forEach(([file, want], i) => {
    const before = e.f.stats().byPath[want] || 0;
    writeFrom(e, file, 'chr6_slot_sm1', 'turn' + i);
    const s = e.f.stats();
    eq('★' + file + ' → ' + want, (s.byPath[want] || 0), before + 1);
  });
  const s = e.f.stats();
  eq('observed=7', s.observed, 7);
  eq('★unknownTombstoneWrites=1（経路不明を別に数える）', s.unknownTombstoneWrites, 1);
  ok('★unknownTombstoneWrites === byPath.unknownPath', s.consistency.unknownEqualsUnknownPath, s.byPath);
  eq('★6経路すべてが観測済み（pathsNeverSeen が空）', s.observedScope.pathsNeverSeen.length, 0);
  ok('★総数だけでなく分類が全部立っている', ['fix399','fix402','fix587','features','home','index']
      .every(p => s.byPath[p] === 1), s.byPath);
}

console.log('\n== 8. ★自分自身のフレームを経路と誤認しない ==');
{
  const e = bugEnv();
  /* ①スタック取得は自分のファイルの中で例外を作るので、除かなければ必ず自分が先頭に来る */
  const st = e.f._stackOf();
  ok('_stackOf に自分のフレームが残っていない', st.indexOf('v292Dfix602') < 0, st.split('\n').slice(0,3));
  ok('（対照）除去前のスタックには自分のフレームがある',
     new Error('x').stack.indexOf('test_fix602_shadow') >= 0);
  /* ②自分のファイル名から呼ばれたことにしても、経路として名乗らない */
  writeFrom(e, FIX602, 'chr6_slot_sm1', 'X');
  const s1 = e.f.stats();
  eq('自分由来のフレームは unknownPath', s1.byPath.unknownPath, 1);
  eq('canary(fix602probe) には数えない', s1.byPath.fix602probe, 0);
  /* ③実経路の書き込みが canary に化けない（fix569 で踏んだ「全件が自分由来に見える」の裏返し） */
  writeFrom(e, 'v292Dfix399-cloudsync.js', 'chr6_slot_sm1', 'Y');
  const s2 = e.f.stats();
  eq('実経路は実経路として数える', s2.byPath.fix399, 1);
  eq('canary には流れ込まない', s2.byPath.fix602probe, 0);
  /* ④スタック照合そのものの単体確認 */
  eq('_matchStack: 自分のフレームだけなら unknownPath',
     e.f._matchStack('Error\n at v292Dfix602-tombstone-write-shadow.js:1:1').id, 'unknownPath');
  eq('_matchStack: 上の行（呼び出し元に近い方）を優先',
     e.f._matchStack('Error\n at a (features.js:1:1)\n at b (v292Dfix399-cloudsync.js:2:2)').id, 'features');
}

console.log('\n== 9. ★localStorage へ1バイトも書かない ==');
{
  const e = bugEnv();
  const before = Object.keys(e.store).slice().sort();
  writeFrom(e, 'v292Dfix399-cloudsync.js', 'chr6_slot_sm1', 'X');
  writeFrom(e, 'home.html', 'chr6_v292Dfix54_genderMap_"sm1"', '{"a":1}');
  e.f.stats(); e.f.recent();
  const after = Object.keys(e.store).slice().sort();
  const added = after.filter(k => before.indexOf(k) < 0);
  eq('増えたのはテストが書いたキーだけ', JSON.stringify(added), JSON.stringify(['chr6_v292Dfix54_genderMap_"sm1"']));
  eq('自分の名前のキーは1つも無い', after.filter(k => /fix602/i.test(k)).length, 0);
  /* selfTest の canary も痕跡を残さない */
  const r = e.f.selfTest();
  const after2 = Object.keys(e.store).slice().sort();
  eq('selfTest の後もキー集合は変わらない', JSON.stringify(after2), JSON.stringify(after));
  eq('canary の残骸は0件', r.leftover.length, 0);
}

console.log('\n== 10. OFF スイッチで観測が止まる ==');
{
  /* ①読込前から OFF: そもそも設置しない */
  const e = mkCtx({ seed: {
    'v292Dfix602ShadowOff': '1',
    'chr6_slots_meta': meta([TOMB('sm1')]),
    'chr6_slot_sm1': '{"turns":[]}'
  }});
  eq('isOff()=true', e.f.isOff(), true);
  eq('設置しない', e.f.armed(), false);
  writeFrom(e, 'v292Dfix399-cloudsync.js', 'chr6_slot_sm1', 'X');
  eq('observed=0', e.f.stats().observed, 0);
  eq('★素通し（書き込みは普通に効く）', e.ls.getItem('chr6_slot_sm1'), 'X');
  eq('selfTest は理由を返す', typeof e.f.selfTest().why, 'string');
}
{
  /* ②設置後に OFF へ切り替えても観測が止まる（TTLの範囲で反映） */
  const e = bugEnv();
  writeFrom(e, 'v292Dfix399-cloudsync.js', 'chr6_slot_sm1', 'X');
  eq('前提: 観測できている', e.f.stats().observed, 1);
  e.ls.setItem('v292Dfix602ShadowOff', '1');
  e.f._invalidate();
  writeFrom(e, 'v292Dfix399-cloudsync.js', 'chr6_slot_sm1', 'Y');
  const s = e.f.stats();
  eq('★OFF 後は増えない', s.observed, 1);
  ok('OFF 中に見送った件数が判る', s.skippedWhileOff >= 1, s.skippedWhileOff);
  eq('書き込みは通る', e.ls.getItem('chr6_slot_sm1'), 'Y');
}

console.log('\n== 11. ★selfTest() が canary を通してから結果を返す ==');
{
  const e = bugEnv();
  const r = e.f.selfTest();
  ok('selfTest ok=true', r.ok === true, r);
  eq('canary を実際に通した（observed が増えた）', r.observedDelta, 1);
  eq('canary は canary として数える', r.probeDelta, 1);
  ok('★実経路のカウンタは汚れていない', r.realPathsUntouched, r);
  ok('★経路ラベルごとの生存証明が全部立つ', r.pathLabelsOk, r.pathLabels);
  eq('  fix399 ラベル', r.pathLabels.fix399, 'fix399');
  eq('  fix402 ラベル', r.pathLabels.fix402, 'fix402');
  eq('  fix587 ラベル', r.pathLabels.fix587, 'fix587');
  eq('  features ラベル', r.pathLabels.features, 'features');
  eq('  home ラベル', r.pathLabels.home, 'home');
  eq('  index ラベル', r.pathLabels.index, 'index');
  eq('  unknownPath ラベル', r.pathLabels.unknownPath, 'unknownPath');
  eq('  ★自分のフレームだけなら経路にしない', r.pathLabels.selfFrameOnly, 'unknownPath');
  const steps = r.steps.map(s => s.name + '=' + s.delta);
  ok('4つの canary を通している', r.steps.length === 4, steps);
  eq('  墓標のキーは1件観測', r.steps[0].delta, 1);
  eq('  ★紛らわしいIDは0件', r.steps[1].delta, 0);
  eq('  墓標の本体キーは墓標と判定', r.steps[2].delta, 1);
  eq('  別スロットの本体キーは墓標ではない', r.steps[3].delta, 0);
  eq('canary の後始末ができている', r.leftover.length, 0);
}
{
  const e = mkCtx({ noClassifier:true, seed:{} });
  const r = e.f.selfTest();
  eq('★分類器が居なければ ok=false（全件0を信じない）', r.ok, false);
  ok('理由が明示される', typeof r.why === 'string' && r.why.length > 0, r.why);
}
{
  const e = bugEnv();
  e.f.selfTest();
  const s = e.f.stats();
  eq('★canary は実経路の pathsNeverSeen を埋めない', s.observedScope.pathsNeverSeen.length, 6);
}

console.log('\n== 12. ★何も block しない（口だけ用意し、0であることを固定する） ==');
{
  const e = bugEnv();
  writeFrom(e, 'v292Dfix399-cloudsync.js', 'chr6_slot_sm1', 'X');
  writeFrom(e, 'home.html', 'chr6_fix77States_sm1', 'Y');
  e.f.selfTest();
  const s = e.f.stats();
  eq('blocked=0', s.blocked, 0);
  eq('blockedByPath は空', Object.keys(s.blockedByPath).length, 0);
  eq('GPT指定の名前でも空', Object.keys(s.tombstoneWriteBlockedByPath).length, 0);
  ok('整合チェックが「止めていない」と言う', s.consistency.neverBlocks, s.consistency);
  eq('★将来のための口は存在する', typeof e.f._noteBlocked, 'function');
  eq('★観測された書き込みは全部そのまま通っている', e.ls.getItem('chr6_fix77States_sm1'), 'Y');
}

console.log('\n== 13. 重い処理を挟まない（fix543 は1読込で20回以上 setItem を呼ぶ） ==');
{
  const e = bugEnv();
  let classifyCalls = 0;
  const orig = e.w.__v292Dfix562.classifyKey;
  e.w.__v292Dfix562.classifyKey = function(k, v){ classifyCalls++; return orig.call(e.w.__v292Dfix562, k, v); };
  for (let i = 0; i < 25; i++) e.ls.setItem('v292Dfix543_probe_' + i, 'x');
  const s = e.f.stats();
  ok('setItem は全部見えている', s.setItemsSeen >= 25, s.setItemsSeen);
  eq('★墓標IDを含まないキーでは分類器を呼ばない', classifyCalls, 0);
  ok('★墓標一覧はキャッシュされる（毎回パースしない）', s.metaReads <= 2, { metaReads: s.metaReads, hits: s.metaCacheHits });
  /* 同じキーを繰り返し書いても分類は1回でよい */
  for (let i = 0; i < 5; i++) e.ls.setItem('chr6_slot_sm1', 'turn' + i);
  ok('同一キーの繰り返しは分類器を1回だけ呼ぶ', classifyCalls === 1, classifyCalls);
  eq('5回とも観測はする', e.f.stats().observed, 5);
}

console.log('\n== 14. 例外・戻り値をそのまま通す（QuotaExceededError を握らない） ==');
{
  const seed = { 'chr6_slots_meta': meta([TOMB('sm1')]), 'chr6_slot_sm1': 'v' };
  let used = 0; Object.keys(seed).forEach(k => used += k.length + seed[k].length);
  const e = mkCtx({ seed, cap: used + 5 });
  let name = null;
  try { e.ls.setItem('chr6_slot_sm1', 'x'.repeat(200)); } catch(err){ name = err.name; }
  eq('★QuotaExceededError はそのまま呼び出し元へ伝わる', name, 'QuotaExceededError');
  eq('観測はしている（書けなかった要求も記録に残す）', e.f.stats().observed, 1);
  eq('元の値は壊れていない', e.ls.getItem('chr6_slot_sm1'), 'v');
  eq('ラッパ内部の例外は0件', e.f.stats().wrapperErrors, 0);
}

console.log('\n== 15. recent() は直近20件・分母と注意書きが出る ==');
{
  const e = bugEnv();
  for (let i = 0; i < 25; i++) writeFrom(e, 'features.js', 'chr6_slot_sm1', 'turn' + i);
  const r = e.f.recent();
  eq('直近20件だけ持つ', r.length, 20);
  eq('最後の1件が最新', r[19].key, 'chr6_slot_sm1');
  ok('{at,key,slotId,path,bytes} が揃っている',
     ['at','key','slotId','path','bytes'].every(k => r[0][k] !== undefined), r[0]);
  const s = e.f.stats();
  eq('observed は25件のまま（リングで削れない）', s.observed, 25);
  ok('分母(setItemsSeen)が併記される', s.setItemsSeen >= 25, s.setItemsSeen);
  ok('「0でも無事故の証拠にならない」注意書きがある', /observed=0/.test(s.observedScope.note), s.observedScope.note);
  ok('墓標スロットへの書込は警告として残る', e.w.__logs.some(m => /墓標/.test(m)), e.w.__logs.slice(0,2));
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
