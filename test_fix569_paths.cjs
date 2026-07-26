/* test_fix569_paths.cjs — fix569a の影監視が「既知7経路」を実際に識別できることの確認
 *
 * ■なぜ必要か（GPT裁定）
 *   「pull／保存／スナップショット作成を各1回通し、捕捉総数>0」だけでは**弱い**。
 *   別経路の removeItem が1回動いただけでも合格してしまう。
 *   そこで **7経路それぞれについてテスト用配置を作り、byPath が増えることを確認する**。
 *
 * ■2つの水準を分けて報告する（ここを曖昧にしない）
 *   [実起動]  実コードを実際に走らせて削除させ、byPath が増えることを確認した経路
 *             … fix490Trim / fix490Quota / fix264b / fix399
 *   [識別のみ] クラウド応答が要るため実起動できず、**実ファイル名つきのスタック**から
 *             識別できることだけを確認した経路
 *             … fix402Doomed / fix402Retention / fix277
 *             （削除ロジック自体は各fixの既存テストが担当。ここで確かめるのは
 *               「その経路から来た削除を、影監視が正しくその経路として数えられるか」）
 *   ★fix402 の doomed は **実データを消さず**、モックストレージ上でのみ扱う（GPT指定）。
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

/* ---- 実ブラウザと同じ読み込み順を作る -------------------------------------
   fix569(inner) → 対象fix → fix569.install()(outer を最外殻へ)
   ★vm の filename を実ファイル名にするので、スタックは実機と同じ形になる。 */
function mkCtx(opts){
  opts = opts || {};
  const store = {};
  let used = 0;
  const cap = opts.cap == null ? Infinity : opts.cap;
  /* ★モックは setItem したキーが `Object.keys(localStorage)` にも見えること（本物の Storage の振る舞い）。
     忘れると fix562 のように Object.keys で走査するコードが「何も無い」と判断して素通りする。 */
  function expose(k){
    if (['getItem','setItem','removeItem','key','length'].indexOf(k) >= 0) return;
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
  Object.keys(opts.seed || {}).forEach(k => { store[k] = String(opts.seed[k]); used += k.length + store[k].length; expose(k); });
  Object.defineProperty(ls, 'length', { get(){ return Object.keys(store).length; } });
  const el = { querySelectorAll: () => [], querySelector: () => null, addEventListener(){}, appendChild(){},
               setAttribute(){}, style: {}, remove(){}, classList: { add(){}, remove(){}, contains: () => false } };
  const doc = { hidden: false, visibilityState: 'visible', readyState: 'complete', documentElement: el, body: el,
    querySelectorAll: () => [], querySelector: () => null, getElementById: () => null, addEventListener(){},
    createElement: () => Object.assign({}, el) };
  const w = { localStorage: ls, document: doc, Storage: { prototype: { removeItem: ls.removeItem } },
    console: { log(){}, warn(){}, error(){} },
    setTimeout: () => 0, setInterval: () => 0, clearTimeout(){}, clearInterval(){},
    fetch: () => Promise.reject(new Error('no-net')),
    indexedDB: { open: () => ({ addEventListener(){}, set onsuccess(v){}, set onerror(v){}, set onupgradeneeded(v){} }) },
    navigator: { userAgent: 'node' }, location: { href: 'https://x/', search: '', origin: 'https://x' },
    addEventListener(){}, removeEventListener(){}, Date, JSON, Math, Object, Array, String, Number, Error, RegExp };
  w.window = w; w.__store = store; w.globalThis = w;
  const ctx = vm.createContext(w);
  /* ①fix569 を最初に（inner が fix246 相当より下に入る位置） */
  vm.runInContext(read('v292Dfix569-gc-shadow.js'), ctx, { filename: 'v292Dfix569-gc-shadow.js' });
  /* ②対象fix */
  (opts.load || []).forEach(f => { try { vm.runInContext(read(f), ctx, { filename: f }); } catch(e){ w.__loadErr = (w.__loadErr||'') + f + ':' + e.message.slice(0,60) + ';'; } });
  /* ③outer を最外殻へ */
  w.__v292Dfix569.install();
  return w;
}
const bp = w => w.__v292Dfix569.stats().byPath;

console.log('\n=========== [実起動] 実コードに実際に削除させる ===========');

console.log('\n== fix399: pull前の丸ごと控えの整理 ==');
{
  const full = JSON.stringify({ activeSlot: 'default', ls: { 'chr6': '{"turns":[{},{}]}' } });
  const seed = { 'chr6': '{"turns":[{},{}]}', 'chr6_active_slot': '"default"' };
  for (let i = 0; i < 3; i++) seed['chr6_bk_cloudsync_' + (1780000000000 + i * 1000)] = (i === 2 ? full : 'spare' + i);
  const w = mkCtx({ seed, load: ['v292Dfix399-cloudsync.js'] });
  ok('前提: fix399 の検証口が出ている', !!(w.__v292Dfix399x && w.__v292Dfix399x.backupBeforeApply), w.__loadErr);
  const before = bp(w).fix399;
  w.__v292Dfix399x.backupBeforeApply({ schema: 1, ls: { 'chr6': null }, idb: {} });
  ok('★byPath.fix399 が増える', bp(w).fix399 > before, { before, after: bp(w).fix399 });
  ok('★他の経路は増えていない', bp(w).fix490Trim === 0 && bp(w).fix264b === 0, bp(w));
}

console.log('\n== fix490 trimBackups: 同一identの控えを2世代へ ==');
{
  const story5 = JSON.stringify({ turns: [{}, {}, {}, {}, {}] });
  const seed = { 'chr6_slot_smA': story5, 'chr6_active_slot': '"smA"' };
  /* 同一identの控えを3世代仕込む → 新しい控えを取ると trim が古い方を消す */
  for (let i = 0; i < 3; i++) seed['chr6_bk_guard_smA_' + (1780000000000 + i)] = 'old' + i;
  const w = mkCtx({ seed, load: ['v292Dfix490-slot-write-guard.js'] });
  ok('前提: fix490 が armed', !!(w.__v292Dfix490 && w.__v292Dfix490.__armed), w.__loadErr);
  const before = bp(w).fix490Trim;
  /* 5ターンの物語を1ターンで潰す = check() が true → backup() → trimBackups() */
  w.localStorage.setItem('chr6_slot_smA', JSON.stringify({ turns: [{}] }));
  ok('★byPath.fix490Trim が増える', bp(w).fix490Trim > before, { before, after: bp(w).fix490Trim, keys: Object.keys(w.__store) });
  ok('★控えは2世代に収まる',
     Object.keys(w.__store).filter(k => /^chr6_bk_guard_smA_/.test(k)).length <= 2,
     Object.keys(w.__store).filter(k => /^chr6_bk_guard_smA_/.test(k)));
}

console.log('\n== fix490 dropOldestGuardBackup: 容量不足のとき（fix565が守る経路） ==');
{
  const story5 = JSON.stringify({ turns: [{}, {}, {}, {}, {}] });
  const seed = {
    'chr6_slot_smA': story5, 'chr6_active_slot': '"smA"',
    /* もう存在しないスロットの孤児控え = fix565 が最優先で消してよいと決めたもの */
    'chr6_bk_guard_smGONE_1780000000000': 'x'.repeat(300),
    /* 生きているスロットの唯一の控え = 消してはいけない */
    'chr6_bk_guard_smA_1780000000001': 'y'.repeat(50)
  };
  let used = 0; Object.keys(seed).forEach(k => used += k.length + seed[k].length);
  /* ★2026-07-26 fix576(A2)で契約が変わった。
     fix490Quota の物理削除は fix569 の exact-delete ゲート経由になり、
     ゲートは fix246 を迂回するため **native removeItem** を使う。
     つまりこの削除は **影監視(inner/outer)に映らない**（GPT裁定「別経路で計上する方針は正しい」）。
     したがって「byPath.fix490Quota が増える」を合格条件にし続けると、
     A2/A3 が進むほど**正しい実装が落ちる**テストになる。
     見るべきものを byPath から **ゲート側の計上(S.gate)** へ移す。 */
  const w = mkCtx({ seed, cap: used + 20,
                    load: ['v292Dfix562-backup-inventory.js', 'v292Dfix490-slot-write-guard.js'] });
  const before = bp(w).fix490Quota;
  const g0 = JSON.parse(JSON.stringify(w.__v292Dfix569.stats().gate || {}));
  w.localStorage.setItem('chr6_slot_smA', JSON.stringify({ turns: [{}] }));
  const g1 = w.__v292Dfix569.stats().gate || {};
  ok('★孤児の控えが消えている', w.__store['chr6_bk_guard_smGONE_1780000000000'] === undefined, Object.keys(w.__store));
  ok('★★生きているスロットの唯一の控えは残っている（fix565の契約）',
     Object.keys(w.__store).some(k => /^chr6_bk_guard_smA_/.test(k)), Object.keys(w.__store));
  ok('★ゲート側で deleted として計上される(fix576)',
     (g1.deleted || 0) > (g0.deleted || 0), { before: g0, after: g1 });
  ok('★★影監視(byPath)には**映らない**のが正しい(nativeで消すため)',
     bp(w).fix490Quota === before, { before, after: bp(w).fix490Quota });
}

console.log('\n== ★fix576: 分類器(fix562)が居なければ、fix490Quota は削除せず控えを諦める ==');
{
  const story5 = JSON.stringify({ turns: [{}, {}, {}, {}, {}] });
  const seed = {
    'chr6_slot_smA': story5, 'chr6_active_slot': '"smA"',
    'chr6_bk_guard_smGONE_1780000000000': 'x'.repeat(300),
    'chr6_bk_guard_smA_1780000000001': 'y'.repeat(50)
  };
  let used = 0; Object.keys(seed).forEach(k => used += k.length + seed[k].length);
  /* fix562 を**読み込まない** = 保護判定ができない環境 */
  const w = mkCtx({ seed, cap: used + 20, load: ['v292Dfix490-slot-write-guard.js'] });
  w.localStorage.setItem('chr6_slot_smA', JSON.stringify({ turns: [{}] }));
  ok('★★1件も消えていない(fail-closed)',
     w.__store['chr6_bk_guard_smGONE_1780000000000'] !== undefined, Object.keys(w.__store));
  ok('★policy-unavailable として計上される',
     (w.__v292Dfix569.stats().gate || {})['policy-unavailable'] > 0, w.__v292Dfix569.stats().gate);
  ok('★理由が dropLog に残る(無言にしない)',
     w.__v292Dfix490.dropLog().some(x => x.result === 'backup-skipped'), w.__v292Dfix490.dropLog());
  ok('★本体セーブは通っている(控えの失敗で巻き戻さない)',
     JSON.parse(w.__store['chr6_slot_smA']).turns.length === 1, w.__store['chr6_slot_smA']);
}

console.log('\n== fix264b: quota自己回復（__gen_ 世代の間引き） ==');
{
  const seed = {
    '__gen_chr6_slot_smA': JSON.stringify([{ t: 1, turns: 3, data: 'z'.repeat(200) }]),
    'chr6_slot_smA': JSON.stringify({ turns: [{}] })
  };
  let used = 0; Object.keys(seed).forEach(k => used += k.length + seed[k].length);
  const w = mkCtx({ seed, cap: used + 10, load: ['v292Dfix228-slot-generations.js'] });
  const before = bp(w).fix264b;
  try { w.localStorage.setItem('chr6_slot_smB', 'x'.repeat(150)); } catch(e){}
  ok('★byPath.fix264b が増える', bp(w).fix264b > before, { before, after: bp(w).fix264b, keys: Object.keys(w.__store) });
  ok('★__gen_ が間引かれている', w.__store['__gen_chr6_slot_smA'] === undefined, Object.keys(w.__store));
}

console.log('\n=========== [識別のみ] クラウド応答が要るため実起動できない3経路 ===========');
console.log('   （削除ロジック自体は各fixの既存テストが担当。ここで確かめるのは');
console.log('     「その経路から来た削除を、影監視が正しくその経路として数えられるか」）');
{
  /* ★vm の filename を実ファイル名にするので、スタックの見え方は実機と同じになる。
     実データは1バイトも触らない（モックストレージのみ・GPT指定）。 */
  const cases = [
    { file: 'v292Dfix402-invisible-sync.js', key: 'chr6_slot_smGONE', want: 'fix402Doomed',    label: 'fix402 doomed（メタに無いスロット）' },
    { file: 'v292Dfix402-invisible-sync.js', key: 'chr6',             want: 'fix402Doomed',    label: 'fix402 doomed（★既定枠 chr6 も対象）' },
    { file: 'v292Dfix402-invisible-sync.js', key: 'chr6_bk_cloudsync_del_1780000000000', want: 'fix402Retention', label: 'fix402 退避世代' },
    { file: 'v292Dfix277-quasi-pack.js',     key: 'chr6_bk_fix538_1780000000000',         want: 'fix277',          label: 'fix277 fix538控えの世代整理' }
  ];
  for (const c of cases){
    const seed = {}; seed[c.key] = 'v';
    const w = mkCtx({ seed });
    const before = bp(w)[c.want];
    /* 実ファイル名で「削除する側のコード」を走らせる */
    vm.runInContext('localStorage.removeItem(' + JSON.stringify(c.key) + ');', vm.createContext(w), { filename: c.file });
    const after = bp(w)[c.want];
    ok('★' + c.label + ' → byPath.' + c.want, after === before + 1, { before, after, byPath: bp(w) });
    ok('  ' + c.label + '：実際に消えている（拒否しない）', w.__store[c.key] === undefined);
  }
}

console.log('\n=========== 総合：7経路すべてが「観測済み」になったか ===========');
{
  /* 上の各ケースは別コンテキストなので、ここで1つのコンテキストに全部通して
     observedScope.pathsNeverSeen が空になることを確認する。 */
  const w = mkCtx({ seed: {} });
  const files = {
    fix490Trim:      ['v292Dfix490-slot-write-guard.js', 'trimBackups'],
    fix490Quota:     ['v292Dfix490-slot-write-guard.js', 'dropOldestGuardBackup'],
    fix264b:         ['v292Dfix228-slot-generations.js', null],
    fix399:          ['v292Dfix399-cloudsync.js', null],
    fix402Doomed:    ['v292Dfix402-invisible-sync.js', null],
    fix402Retention: ['v292Dfix402-invisible-sync.js', null],
    fix277:          ['v292Dfix277-quasi-pack.js', null]
  };
  const keyFor = {
    fix490Trim: 'chr6_bk_fix469_smA_1780000000000', fix490Quota: 'chr6_bk_guard_smA_1780000000000',
    fix264b: '__gen_chr6_slot_smA', fix399: 'chr6_bk_cloudsync_1780000000000',
    fix402Doomed: 'chr6_slot_smGONE', fix402Retention: 'chr6_bk_cloudsync_del_1780000000000',
    fix277: 'chr6_bk_fix538_1780000000000'
  };
  Object.keys(files).forEach(p => {
    const [file, fn] = files[p]; const k = keyFor[p];
    w.localStorage.setItem(k, 'v');
    const code = fn ? ('function ' + fn + '(){ localStorage.removeItem(' + JSON.stringify(k) + '); } ' + fn + '();')
                    : ('localStorage.removeItem(' + JSON.stringify(k) + ');');
    vm.runInContext(code, vm.createContext(w), { filename: file });
  });
  const st = w.__v292Dfix569.stats();
  const sc = st.observedScope;
  ok('★7経路すべてが観測済み（pathsNeverSeen が空）', sc.pathsNeverSeen.length === 0, sc);
  ok('★分母も出ている（outerRequests / innerCalls）', st.outerRequests >= 7 && st.innerCalls >= 7,
     [st.outerRequests, st.innerCalls]);
  ok('★迂回0件（正式指標 innerWithoutOuter）', st.innerWithoutOuter === 0, st.counters);
  ok('★カウンタ整合（inner/outer とも）', st.counters.innerOk && st.counters.outerOk, st.counters);
  ok('★postChecks === outerRequests', st.postChecks === st.outerRequests, [st.postChecks, st.outerRequests]);
  ok('★ロード順は検証済み', st.loadOrderVerified === true, st.markersAtLoad);
}

console.log('\n=========== ★fix574: 実際に「止まる／止めない」を経路別に確認 ===========');
{
  /* 保護対象を作る: 生きているスロット1件＋その唯一の復元可能な控え1件 */
  function envWithProtected(){
    const story = JSON.stringify({ turns: [{}, {}, {}] });
    const seed = { 'chr6_slot_smP': story, 'chr6_bk_fix469_smP_1780000000000': story };
    const w = mkCtx({ seed, load: ['v292Dfix562-backup-inventory.js'] });
    return w;
  }
  const K = 'chr6_bk_fix469_smP_1780000000000';

  /* ① retention の経路（fix490 trimBackups）→ ★止まる */
  {
    const w = envWithProtected();
    const prot = w.__v292Dfix562.protectedSet();
    const isProt = Object.keys(prot).some(s2 => prot[s2].key === K);
    ok('前提: この控えは保護対象', isProt, Object.keys(prot).map(s2 => prot[s2].key));
    vm.runInContext('function trimBackups(){ localStorage.removeItem(' + JSON.stringify(K) + '); } trimBackups();',
      vm.createContext(w), { filename: 'v292Dfix490-slot-write-guard.js' });
    const st = w.__v292Dfix569.stats();
    ok('★★保護対象の控えが残っている（削除を止めた）', w.__store[K] !== undefined, Object.keys(w.__store));
    ok('★拒否を1件計上', st.denied === 1, st.denied);
    ok('経路も記録される', st.deniedByPath.fix490Trim === 1, st.deniedByPath);
  }

  /* ② ループする経路（fix399）→ ★絶対に止めない（空回りを作らない） */
  {
    const w = envWithProtected();
    vm.runInContext('localStorage.removeItem(' + JSON.stringify(K) + ');',
      vm.createContext(w), { filename: 'v292Dfix399-cloudsync.js' });
    const st = w.__v292Dfix569.stats();
    ok('★★fix399 は止めない（実際に消える）', w.__store[K] === undefined, Object.keys(w.__store));
    ok('拒否は0件', st.denied === 0, st.denied);
    ok('★「ループするので止めなかった」と記録される', st.notDeniedBecausePathLoops === 1, st.notDeniedBecausePathLoops);
  }

  /* ③ quota の経路（fix490 dropOldestGuardBackup）→ ★絶対に止めない */
  {
    const w = envWithProtected();
    vm.runInContext('function dropOldestGuardBackup(){ localStorage.removeItem(' + JSON.stringify(K) + '); } dropOldestGuardBackup();',
      vm.createContext(w), { filename: 'v292Dfix490-slot-write-guard.js' });
    const st = w.__v292Dfix569.stats();
    ok('★fix490Quota は止めない', w.__store[K] === undefined);
    ok('拒否は0件', st.denied === 0, st.denied);
  }

  /* ④ 保護対象でない控えは、retention の経路でも普通に消える */
  {
    const w = envWithProtected();
    const SPARE = 'chr6_bk_fix469_smP_1780000000001';
    w.localStorage.setItem(SPARE, 'spare');
    vm.runInContext('function trimBackups(){ localStorage.removeItem(' + JSON.stringify(SPARE) + '); } trimBackups();',
      vm.createContext(w), { filename: 'v292Dfix490-slot-write-guard.js' });
    ok('★余剰の控えは普通に消える（機能を殺していない）', w.__store[SPARE] === undefined);
    ok('拒否は0件', w.__v292Dfix569.stats().denied === 0);
  }

  /* ⑤ 拒否OFFなら止めない */
  {
    const w = envWithProtected();
    w.localStorage.setItem('v292Dfix574DenyOff', '1');
    vm.runInContext('function trimBackups(){ localStorage.removeItem(' + JSON.stringify(K) + '); } trimBackups();',
      vm.createContext(w), { filename: 'v292Dfix490-slot-write-guard.js' });
    ok('★OFF なら従来どおり消える', w.__store[K] === undefined);
    ok('拒否は0件', w.__v292Dfix569.stats().denied === 0);
  }
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
