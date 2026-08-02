#!/usr/bin/env node
/* test_fix660.cjs — 第0段 中央GC（DeleteGateway + BackupGC）の受け入れテスト
 *
 * 出典: 裁定統合_GPT_第0段中央GC_2026-07-26.md
 *   §1 二層構成 / §2 シナリオ2(fix246の書換)・3(未完成snapshot)・4(ログ再入)・5(ロード順)
 *   I0 意図分類 / I3 復元能力 / I8 削除前9項目+削除後3項目 / I10 論理単位 /
 *   I12 再入禁止・最大1単位・再試行1回 / I13 最大3候補・全staleならfalse / I14 成功判定 / I15 直接削除API禁止
 *
 * ■このテストが固定する契約
 *   (1) 分類と保護のフィクスチャ（唯一のfullDump保護／古い世代はGREEN／作成途中snapd除外／unknown→review-only）
 *   (2) 論理単位の削除順序（manifest先行）
 *   (3) I8 の9項目 + 削除後3項目
 *   (4) quotaドリル（quota→reclaimUrgent→そのキーだけ1回再試行で成功／全staleならfalse・削除0・可視化）
 *   (5) I12/I13（最大3候補・最大1単位・再入禁止・再試行は1回）
 *   (6) I15 静的検査（allowlist 外の直接削除APIの新規混入が0）
 *   (7) user-approved 経路が必ず DeleteGateway を通る
 *   (8) home 統合（失敗の可視化・quota→reclaim→再試行の実走・fix658/659 のフック無傷）
 *   (9) exact-delete（fix246 モックの書換下でも exact key だけが消える）
 *  (10) 出荷の体裁
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c){ pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

const SRC_GW  = read('v292Dfix660-delete-gateway.js');
const SRC_GC  = read('v292Dfix660-backup-gc.js');
const SRC562  = read('v292Dfix562-backup-inventory.js');
const SRC569  = read('v292Dfix569-gc-shadow.js');
const HOME    = read('home.html');
const HTMLU   = Buffer.from(fs.readFileSync(path.join(__dirname, 'index.html'), 'latin1'), 'latin1').toString('utf8');
const stripBlock = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const CODE_GW = stripBlock(SRC_GW).replace(/^\s*\/\/.*$/gm, ' ');
const CODE_GC = stripBlock(SRC_GC).replace(/^\s*\/\/.*$/gm, ' ');
const CODEHOME = stripBlock(HOME);

const story = n => JSON.stringify({ turns: new Array(n).fill(0).map((_, i) => ({ i })) });

/* =====================================================================
   localStorage モック（quota注入・fix246書換の再現ができる）
   ===================================================================== */
function mkLS(seed, opts){
  opts = opts || {};
  const store = Object.assign(Object.create(null), seed || {});
  const removedKeys = [];
  const api = {
    getItem(k){ return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v){
      if (opts.quota && opts.quota(k, String(v), store)){
        const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e;
      }
      store[k] = String(v);
    },
    removeItem(k){ removedKeys.push(k); delete store[k]; },
    key(i){ return Object.keys(store)[i] || null; },
    get length(){ return Object.keys(store).length; },
    __store: store, __removed: removedKeys
  };
  /* ★本物の Storage は「保存キーが own enumerable property として見える」(named properties)。
     fix562 の keys() は Object.keys(localStorage) を使うので、そこまで真似ないと
     在庫が常に空になり、テストが偽の合格を出す。 */
  const RESERVED = { getItem:1, setItem:1, removeItem:1, key:1, length:1, clear:1, __store:1, __removed:1 };
  return new Proxy(api, {
    get(t, p){
      if (typeof p === 'symbol' || RESERVED[p] || (p in t)) return t[p];
      return Object.prototype.hasOwnProperty.call(store, p) ? store[p] : undefined;
    },
    has(t, p){ return RESERVED[p] || (p in t) || Object.prototype.hasOwnProperty.call(store, p); },
    ownKeys(){ return Object.keys(store); },
    getOwnPropertyDescriptor(t, p){
      if (Object.prototype.hasOwnProperty.call(store, p))
        return { value: store[p], enumerable: true, configurable: true, writable: true };
      return undefined;
    }
  });
}
function mkSandbox(seed, opts){
  opts = opts || {};
  const ls = opts.ls || mkLS(seed, opts);
  const logs = [], warns = [];
  const sb = {
    localStorage: ls,
    console: { log: (...a) => logs.push(a.join(' ')), warn: (...a) => warns.push(a.join(' ')), error: (...a) => warns.push(a.join(' ')) },
    setTimeout: () => 0, clearTimeout(){}, setInterval: () => 0, clearInterval(){},
    Date, JSON, Math, Object, Array, String, Number, parseInt, parseFloat, isFinite, Promise, RegExp, Error,
    document: { readyState: 'complete', addEventListener(){}, body: {} }
  };
  sb.window = sb;
  sb._ls = ls; sb._logs = logs; sb._warns = warns;
  vm.createContext(sb);
  if (opts.with569) vm.runInContext(SRC569, sb, { filename: 'fix569' });
  vm.runInContext(SRC562, sb, { filename: 'fix562' });
  vm.runInContext(SRC_GW, sb, { filename: 'fix660gw' });
  vm.runInContext(SRC_GC, sb, { filename: 'fix660gc' });
  return sb;
}

/* 現実に近い在庫（iPhone の実データを模す） */
const SLOT = 'smrg85jwsn6';
function baseSeed(extra){
  return Object.assign({
    'chr6_slots_meta': JSON.stringify([{ id: SLOT, name: '白鷺荘', key: 'chr6_slot_' + SLOT, updatedAt: 5 }]),
    ['chr6_slot_' + SLOT]: story(10),
    /* 唯一の丸ごと控え（サイドストアを運べる＝最強の復元点） */
    'chr6_bk_cloudsync_1784942016': JSON.stringify({ ls: { ['chr6_slot_' + SLOT]: story(96), 'chr6_v292Dfix54_x': '{}' } }),
    /* 同じスロットの古い部分控え（＝解放してよい） */
    ['chr6_bk_saveto_' + SLOT + '_1700000001']: JSON.stringify({ key: 'chr6_slot_' + SLOT, blob: story(3) }),
    ['chr6_bk_saveto_' + SLOT + '_1700000002']: JSON.stringify({ key: 'chr6_slot_' + SLOT, blob: story(4) }),
    /* 形式不明（unknown → review-only） */
    'chr6_bk_fix469_weird_1': 'not-json-at-all',
    /* 診断ログ */
    'v292Dfix660_probe_seed': 'x'
  }, extra || {});
}

(async () => {

/* =====================================================================
   (1) 実装の体裁と二層の分離
   ===================================================================== */
console.log('== (1) 二層の分離と体裁 ==');
{
  ok('★DeleteGateway に冪等ガード', /if\s*\(window\.__v292Dfix660gw\)\s*return/.test(SRC_GW));
  ok('★BackupGC に冪等ガード', /if\s*\(window\.__v292Dfix660gc\)\s*return/.test(SRC_GC));
  ok('★共通 OFF スイッチ v292Dfix660Off',
     SRC_GW.indexOf("'v292Dfix660Off'") > 0 && SRC_GC.indexOf("'v292Dfix660Off'") > 0);
  ok('★★BackupGC は物理削除をしない（削除APIを1つも持たない）',
     !/\.removeItem\s*\(/.test(CODE_GC) && !/nativeRemove/.test(CODE_GC) && !/localStorage\.clear/.test(CODE_GC));
  ok('★★BackupGC の削除は必ず DeleteGateway 経由（deleteUnit/deleteExact のみ）',
     /gw\(\)/.test(CODE_GC) && /G\.deleteUnit\(/.test(CODE_GC) && /G\.deleteExact\(/.test(CODE_GC));
  ok('★★分類を二重実装していない（fix562 を唯一の正として呼ぶ）',
     /__v292Dfix562/.test(CODE_GC) && /__v292Dfix562/.test(CODE_GW) &&
     !/function classifyKey/.test(CODE_GC) && !/function protectedSet/.test(CODE_GC));
  ok('★CRLF / NUL は無い', ['v292Dfix660-delete-gateway.js', 'v292Dfix660-backup-gc.js'].every(f => {
    const b = fs.readFileSync(path.join(__dirname, f));
    return b.indexOf(Buffer.from('\r\n')) < 0 && b.filter(x => x === 0).length === 0;
  }));
}
{
  const sb = mkSandbox(baseSeed(), { with569: true });
  ok('★★DeleteGateway が fix569 の捕捉済み native を借りる（二段階初期化・裁定§2シナリオ5）',
     sb.window.__v292Dfix660gw.status().nativeSource === 'fix569', sb.window.__v292Dfix660gw.status());
  ok('★fix569 が native を公開している（借用の契約）', (() => {
    const n = sb.window.__v292Dfix569._native();
    return n && typeof n.remove === 'function' && typeof n.get === 'function';
  })());
  ok('★★DeleteGateway の selfTest が緑', sb.window.__v292Dfix660gw.selfTest().ok === true, sb.window.__v292Dfix660gw.selfTest().fails);
  ok('★★BackupGC の selfTest が緑', sb.window.__v292Dfix660gc.selfTest().ok === true, sb.window.__v292Dfix660gc.selfTest().fails);
}
{
  const sb = mkSandbox(baseSeed());
  ok('★fix569 が居なければ自前で native を捕捉する', sb.window.__v292Dfix660gw.status().nativeSource === 'self');
}

/* =====================================================================
   (2) 分類と保護（I0 / I3）
   ===================================================================== */
console.log('\n== (2) 分類と保護（I0 意図分類 / I3 復元能力） ==');
{
  const sb = mkSandbox(baseSeed());
  const GC = sb.window.__v292Dfix660gc, GW = sb.window.__v292Dfix660gw;
  ok('★★I0: 既知5種の intent はそのまま通る',
     ['reclaim','retention','lifecycle','rollback','cache'].every(i => GC.classifyIntent(i) === i));
  ok('★★I0: 分類できない intent は unknown（＝review-only へ倒す）',
     GC.classifyIntent('whatever') === 'unknown' && GC.classifyIntent() === 'unknown');
  ok('★★I0: intent の無い削除要求はゲートウェイが受け付けない',
     GW.deleteExact({ key: 'chr6_bk_fix469_weird_1' }).code === 'intent-required');

  const cap = GC.restoreCapability();
  ok('★★I3: 唯一の fullDump が復元点として保護されている', !!cap['(fullDump)'], Object.keys(cap));
  ok('★I3: 復元点の階層が記録される（snapshot > fullDump > story-only）',
     Object.keys(cap).every(k => ['snapshot','fullDump','story-only'].indexOf(cap[k].tier) >= 0), cap);
  ok('★★I3: story-only しか無いスロットは degradedProtection として記録される', (() => {
    const sb2 = mkSandbox({
      'chr6_slots_meta': JSON.stringify([{ id: 'sOnly', name: 'x', key: 'chr6_slot_sOnly', updatedAt: 1 }]),
      'chr6_slot_sOnly': story(4),
      'chr6_bk_saveto_sOnly_1700000001': JSON.stringify({ key: 'chr6_slot_sOnly', blob: story(4) })
    });
    const c2 = sb2.window.__v292Dfix660gc.restoreCapability();
    return c2['sOnly'] && c2['sOnly'].degradedProtection === true;
  })());
}
{
  const sb = mkSandbox(baseSeed());
  const GC = sb.window.__v292Dfix660gc, GW = sb.window.__v292Dfix660gw;
  GC.plan();
  const cands = GC.candidates();
  const dumpKey = 'chr6_bk_cloudsync_1784942016';
  ok('★★唯一の fullDump は自動候補に**入らない**（自動では絶対に消さない）',
     cands.every(c => c.keys.indexOf(dumpKey) < 0), cands.map(c => c.keys));
  ok('★★古い部分控えは自動候補（GREEN）になる',
     cands.some(c => c.keys.some(k => k.indexOf('chr6_bk_saveto_') === 0)), cands.map(c => c.keys));
  const rv = GC.reviewCandidates();
  ok('★★唯一の fullDump は review-only として一覧に出る（隠さない）',
     rv.rows.some(r => r.keys.indexOf(dumpKey) >= 0 && r.auto === false), rv.rows.map(r => r.keys));
  ok('★★唯一の fullDump には必ず警告文が付く',
     rv.rows.filter(r => r.keys.indexOf(dumpKey) >= 0).every(r => /唯一の控え/.test(String(r.warning))),
     rv.rows.filter(r => r.keys.indexOf(dumpKey) >= 0).map(r => r.warning));
  ok('★reviewCandidates は1バイトも消さないと明記する', /1バイトも消していません/.test(rv.note), rv.note);
  ok('★★保護対象を intent:reclaim で消そうとしても拒否される（fail-closed）', (() => {
    const raw = sb._ls.getItem(dumpKey);
    const r = GW.deleteExact({ key: dumpKey, hash: GW._hash(raw), bytes: raw.length,
                               family: 'story-backup', intent: 'reclaim', policyVersion: 1 });
    return r.ok === false && r.code === 'protected' && sb._ls.getItem(dumpKey) != null;
  })());
}
{
  /* 作成途中の snapd（manifest が無い）は自動候補にせず review-only（裁定 シナリオ3） */
  const sb = mkSandbox(baseSeed({ 'chr6_snapd_orphan_1_0': 'partial-body' }));
  const GC = sb.window.__v292Dfix660gc;
  GC.plan();
  ok('★★作成途中/失敗した試行の snapd は自動候補に入らない',
     GC.candidates().every(c => c.keys.indexOf('chr6_snapd_orphan_1_0') < 0), GC.candidates());
  ok('★★その snapd は review-only として一覧に出る（消せない孤児を放置しない）',
     GC.reviewCandidates().rows.some(r => r.keys.indexOf('chr6_snapd_orphan_1_0') >= 0 && r.auto === false));
}
{
  /* 形式不明は review-only（I6/I0） */
  const sb = mkSandbox(baseSeed());
  const GW = sb.window.__v292Dfix660gw;
  const raw = sb._ls.getItem('chr6_bk_fix469_weird_1');
  const r = GW.deleteExact({ key: 'chr6_bk_fix469_weird_1', hash: GW._hash(raw), bytes: raw.length,
                             family: 'story-backup', intent: 'reclaim', policyVersion: 1 });
  ok('★unknown 形式でも fix562 が story-backup と分類すれば方針に従う（判断を二重に持たない）',
     ['deleted', 'protected'].indexOf(r.code) >= 0, r);
  const sb2 = mkSandbox({ 'v292_totally_unknown_key': 'x' });
  const GW2 = sb2.window.__v292Dfix660gw;
  const raw2 = sb2._ls.getItem('v292_totally_unknown_key');
  const r2 = GW2.deleteExact({ key: 'v292_totally_unknown_key', hash: GW2._hash(raw2), bytes: raw2.length,
                               intent: 'reclaim', policyVersion: 1 });
  ok('★★形式不明のキーは自動削除しない（review-only）',
     r2.ok === false && r2.code === 'protected' && sb2._ls.getItem('v292_totally_unknown_key') != null, r2);
}

/* =====================================================================
   (3) I8 削除前9項目 + 削除後3項目
   ===================================================================== */
console.log('\n== (3) I8: 削除直前9項目 / 削除後3項目 ==');
{
  const sb = mkSandbox(baseSeed());
  const GW = sb.window.__v292Dfix660gw;
  const key = 'chr6_bk_saveto_' + SLOT + '_1700000001';
  const raw = sb._ls.getItem(key);
  const good = { planId:'p1', unitId:'u1', key, hash: GW._hash(raw), bytes: raw.length,
                 family: 'story-backup', slotId: SLOT, intent: 'reclaim', policyVersion: 1 };
  const pre = GW._preChecks(good);
  const names = ['exists','hash','bytes','classification','notProtected','notSoleRestorePoint','policyVersion','notMidSnapshot','exactDeleteBypass'];
  ok('★★削除直前の検査はちょうど9項目', Object.keys(pre.checks).length === 9, Object.keys(pre.checks));
  ok('★★9項目の名前が裁定どおり', names.every(n => n in pre.checks), Object.keys(pre.checks));
  ok('★★正常系では9項目すべて true', names.every(n => pre.checks[n] === true), pre.checks);

  ok('★①存在しないキーは missing', GW._preChecks(Object.assign({}, good, { key: 'nope' })).why === 'missing');
  ok('★②hash 不一致は stale-hash', GW._preChecks(Object.assign({}, good, { hash: 'x' })).why === 'stale-hash');
  ok('★③bytes 不一致は stale-bytes', GW._preChecks(Object.assign({}, good, { bytes: 1 })).why === 'stale-bytes');
  ok('★④family 不一致は stale-family', GW._preChecks(Object.assign({}, good, { family: 'live-story' })).why === 'stale-family');
  ok('★④slotId 不一致は stale-slot', GW._preChecks(Object.assign({}, good, { slotId: 'other' })).why === 'stale-slot');
  ok('★⑦policyVersion 不一致は policy-version-mismatch',
     GW._preChecks(Object.assign({}, good, { policyVersion: 99 })).why === 'policy-version-mismatch');

  const r = GW.deleteExact(good);
  ok('★★9項目を通れば実際に消える', r.ok === true && sb._ls.getItem(key) == null, r);
  ok('★★削除後の検査は3項目', Object.keys(GW.log()[GW.log().length - 1].checks.post).length === 3,
     GW.log()[GW.log().length - 1].checks.post);
  ok('★★削除後3項目の名前が裁定どおり',
     ['gone','protectedIntact','noIncompleteComplete'].every(n => n in GW.log()[GW.log().length - 1].checks.post));
  ok('★★削除は1本のログに残る（無言の削除を作らない）', (() => {
    const last = GW.log()[GW.log().length - 1];
    return last.key === key && last.code === 'deleted' && last.intent === 'reclaim' && last.planId === 'p1';
  })(), GW.log()[GW.log().length - 1]);
}
{
  /* ⑤保護対象へ昇格していたら消さない（唯一の復元点） */
  const sb = mkSandbox({
    'chr6_slots_meta': JSON.stringify([{ id: 'sX', name: 'x', key: 'chr6_slot_sX', updatedAt: 1 }]),
    'chr6_slot_sX': story(2),
    'chr6_bk_saveto_sX_1700000001': JSON.stringify({ key: 'chr6_slot_sX', blob: story(9) })
  });
  const GW = sb.window.__v292Dfix660gw;
  const key = 'chr6_bk_saveto_sX_1700000001', raw = sb._ls.getItem(key);
  const r = GW.deleteExact({ key, hash: GW._hash(raw), bytes: raw.length, family: 'story-backup',
                             slotId: 'sX', intent: 'reclaim', policyVersion: 1 });
  ok('★★⑤⑥このスロットの唯一の復元点は消さない', r.ok === false && sb._ls.getItem(key) != null, r);
}
{
  /* ⑧スナップショット作成中は触らない（裁定 シナリオ3） */
  const sb = mkSandbox(baseSeed());
  sb.window.__v292Dfix564 = { inFlight: () => true };
  const GW = sb.window.__v292Dfix660gw;
  const key = 'chr6_bk_saveto_' + SLOT + '_1700000001', raw = sb._ls.getItem(key);
  const r = GW.deleteExact({ key, hash: GW._hash(raw), bytes: raw.length, family: 'story-backup',
                             slotId: SLOT, intent: 'reclaim', policyVersion: 1 });
  ok('★★⑧スナップショット作成中は削除しない', r.ok === false && r.code === 'snapshot-in-flight' && sb._ls.getItem(key) != null, r);
}
{
  /* 分類器が居なければ削除しない（fail-closed）*/
  const sb = mkSandbox(baseSeed());
  sb.window.__v292Dfix562 = null;
  const GW = sb.window.__v292Dfix660gw;
  const key = 'chr6_bk_saveto_' + SLOT + '_1700000001', raw = sb._ls.getItem(key);
  const r = GW.deleteExact({ key, hash: GW._hash(raw), bytes: raw.length, intent: 'reclaim' });
  ok('★★分類器が使えないときは削除しない（GC例外時に保護データを消す fail-open は作らない）',
     r.ok === false && r.code === 'policy-unavailable' && sb._ls.getItem(key) != null, r);
}

/* =====================================================================
   (4) I10 論理単位と削除順序（manifest 先行）
   ===================================================================== */
console.log('\n== (4) I10: 論理削除単位と manifest 先行 ==');
{
  const manifest = { slotId: 'sF', createdAt: 100, complete: true, kind: 'test-fixture', turns: 3, partCount: 2,
                     parts: { 'chr6_slot_sF': { snapKey: 'chr6_snapd_sF_100_0', hash: 'h', bytes: 5 },
                              'side_sF': { snapKey: 'chr6_snapd_sF_100_1', hash: 'h', bytes: 5 } } };
  const seed = baseSeed({
    'chr6_snap_sF_100': JSON.stringify(manifest),
    'chr6_snapd_sF_100_0': story(3),
    'chr6_snapd_sF_100_1': '{"side":1}'
  });
  const sb = mkSandbox(seed);
  const GC = sb.window.__v292Dfix660gc, GW = sb.window.__v292Dfix660gw;
  const units = GC._units();
  ok('★★スナップショットは manifest + 実体で1つの論理単位',
     units.length === 1 && units[0].keys.length === 3, units);
  ok('★unitId が単位を表す', units[0].unitId === 'snapshot:chr6_snap_sF_100', units[0].unitId);

  GC.plan();
  ok('★★スナップショットは**自動候補にしない**（fix562 が protected と分類する＝分類を二重に持たない）',
     GC.candidates().every(c => c.unitId.indexOf('snapshot:') !== 0), GC.candidates());
  const row = GC.reviewCandidates().rows.filter(r => r.unitId === 'snapshot:chr6_snap_sF_100')[0];
  ok('★★一覧には論理単位として出る（manifest+実体で1行）', !!row && row.keys.length === 3, row);
  const removed = sb._ls.__removed.slice();
  const res = GC.releaseApproved(['snapshot:chr6_snap_sF_100']);
  const order = sb._ls.__removed.slice(removed.length);
  ok('★★明示承認で論理単位ごと消える', res.ok === true && res.released.length === 1, res);
  ok('★★manifest を**先に**消す（manifest だけ残って「完全」と誤認される状態を作らない）',
     order[0] === 'chr6_snap_sF_100', order);
  ok('★実体キーもすべて消える',
     sb._ls.getItem('chr6_snapd_sF_100_0') == null && sb._ls.getItem('chr6_snapd_sF_100_1') == null);
  ok('★★解放は DeleteGateway のログに3件残る（無言の削除を作らない）',
     GW.log().filter(e => e.unitId === 'snapshot:chr6_snap_sF_100' && e.code === 'deleted').length === 3,
     GW.log().filter(e => e.unitId === 'snapshot:chr6_snap_sF_100').map(e => e.code));
}
{
  /* 1パーツでも stale なら**1バイトも消さない**（途中まで消して止まらない） */
  const manifest = { slotId: 'sF', createdAt: 100, complete: true, kind: 'test-fixture', partCount: 2,
                     parts: { a: { snapKey: 'chr6_snapd_sF_100_0' }, b: { snapKey: 'chr6_snapd_sF_100_1' } } };
  const sb = mkSandbox(baseSeed({
    'chr6_snap_sF_100': JSON.stringify(manifest),
    'chr6_snapd_sF_100_0': story(3),
    'chr6_snapd_sF_100_1': '{"side":1}'
  }));
  const GC = sb.window.__v292Dfix660gc, GW = sb.window.__v292Dfix660gw;
  GC.plan();
  const u = (GC._plan().reviewOnly || []).filter(x => x.unitId === 'snapshot:chr6_snap_sF_100')[0];
  u.tokens[u.tokens.length - 1].hash = 'BROKEN';
  const before = Object.keys(sb._ls.__store).length;
  const res = GW.deleteUnit({ unitId: u.unitId, tokens: u.tokens });
  ok('★★1パーツでも再検証に落ちたら1バイトも消さない',
     res.ok === false && /precheck-failed/.test(res.code) && Object.keys(sb._ls.__store).length === before, res);
}

/* =====================================================================
   (5) quota ドリル（I12 / I13 / I14）
   ===================================================================== */
console.log('\n== (5) quota ドリル（I12 最大1単位・再試行1回 / I13 最大3候補 / I14 成功判定） ==');
/* 「容量が一定を超えたら書けない」LS を、**いまの在庫からちょうど作る**。
   ・そのままでは 96ターンの本体が書けない
   ・保護されていない古い控えを1件解放すれば書ける
   という関係（＝iPhone で起きた配置）を、固定値ではなく計算で作る。 */
function quotaCap(seed, bigKey, big, freeKey){
  let used = 0;
  for (const k in seed) used += k.length + String(seed[k]).length;
  if (Object.prototype.hasOwnProperty.call(seed, bigKey)) used -= (bigKey.length + String(seed[bigKey]).length);
  const need = used + bigKey.length + big.length;                  /* 解放しないと必要な総量 */
  const freeable = freeKey.length + String(seed[freeKey]).length;  /* 1件解放で減る量 */
  return need - Math.max(1, Math.floor(freeable / 2));             /* need-freeable < CAP < need */
}
function mkQuota(cap){
  return (k, v, store) => {
    let used = 0;
    for (const kk in store) used += kk.length + String(store[kk]).length;
    if (Object.prototype.hasOwnProperty.call(store, k)) used -= (k.length + String(store[k]).length);
    return (used + k.length + v.length) > cap;
  };
}
function quotaSandbox(){
  /* ★極小の壊れ控え(15B)は先頭候補になるが解放量が足りず、ドリルの意図がぼやける。
     「1要求=1論理単位」で足りるケースと足りないケースを別々に固定したいので、
     このドリルでは在庫から外す(足りないケースは下の still-quota で別に固定する)。 */
  const seed = baseSeed();
  delete seed['chr6_bk_fix469_weird_1'];
  /* ★このスロットの**最良の控え**(=保護される)と、その次に良い**解放してよい**大きな控えを両方置く。
     こうしないと「大きい候補は必ず保護対象」になり、自動解放の効き目を測れない。 */
  seed['chr6_bk_saveto_' + SLOT + '_1600000000'] = JSON.stringify({ key: 'chr6_slot_' + SLOT, blob: story(90) });
  const freeKey = 'chr6_bk_saveto_' + SLOT + '_1500000000';
  seed[freeKey] = JSON.stringify({ key: 'chr6_slot_' + SLOT, blob: story(89) });
  const opts = { quota: mkQuota(quotaCap(seed, 'chr6_slot_' + SLOT, story(96), freeKey)) };
  const ls = mkLS(seed, opts);
  return mkSandbox(null, { ls, quota: opts.quota });
}
{
  const sb = quotaSandbox();
  const GC = sb.window.__v292Dfix660gc;
  GC.plan();
  const bigKey = 'chr6_slot_' + SLOT, big = story(96);
  let threw = false;
  try { sb._ls.setItem(bigKey, big); } catch(e){ threw = true; }
  ok('★★前提: 大きい本体は quota で書けない（iPhone で起きたことの再現）', threw === true);
  const before = sb._ls.__removed.length;
  const r = GC.reclaimUrgent({ needBytes: big.length, reason: 'home-pull',
                               retry: () => { try { sb._ls.setItem(bigKey, big); return true; } catch(e){ return false; } } });
  ok('★★reclaimUrgent が1論理単位だけ解放して、元の書込みが通る', r.ok === true && r.code === 'reclaimed', r);
  ok('★★I14: 成功判定は「元の setItem を1回だけ再試行して成功したこと」',
     r.retried === true && r.retrySucceeded === true, r);
  ok('★★実際に96ターンの本体が書けている', JSON.parse(sb._ls.getItem(bigKey)).turns.length === 96);
  ok('★★I13: 確認した候補は最大3件', r.probed <= 3 && r.probed >= 1, r.probed);
  ok('★★I12: 消したのは1論理単位だけ',
     (sb._ls.__removed.length - before) <= 3 && r.unitId != null, { removed: sb._ls.__removed.slice(before), unitId: r.unitId });
  ok('★★唯一の fullDump は消えていない（保護は絶対）', sb._ls.getItem('chr6_bk_cloudsync_1784942016') != null);
}
{
  /* 全候補が stale → 削除0・false・重い再走査をしない（I13） */
  const sb = quotaSandbox();
  const GC = sb.window.__v292Dfix660gc;
  GC.plan();
  /* 候補の hash を全部壊す＝stale */
  GC._plan().units.forEach(u => u.tokens.forEach(t => { t.hash = 'STALE'; }));
  const before = sb._ls.__removed.length;
  let retried = 0;
  const r = GC.reclaimUrgent({ needBytes: 1000, reason: 'home-pull', retry: () => { retried++; return false; } });
  ok('★★全候補 stale なら false', r.ok === false && r.code === 'all-stale' && r.staleAll === true, r);
  ok('★★そのとき1バイトも消さない', sb._ls.__removed.length === before, sb._ls.__removed.slice(before));
  ok('★★元の setItem を再試行もしない（無駄な失敗を増やさない）', retried === 0);
  ok('★★確認したのは最大3候補まで（フル走査しない）', r.probed <= 3, r.probed);
}
{
  /* 候補が無い（plan 未実行）→ no-plan・削除0 */
  const sb = quotaSandbox();
  const GC = sb.window.__v292Dfix660gc;
  const before = sb._ls.__removed.length;
  const r = GC.reclaimUrgent({ needBytes: 1, reason: 'x' });
  ok('★★plan が無ければ削除0で false（緊急経路で重い走査を始めない）',
     r.ok === false && r.code === 'no-plan' && sb._ls.__removed.length === before, r);
}
{
  /* 解放しても足りない → still-quota（再試行は1回だけ・I12） */
  const sb = quotaSandbox();
  const GC = sb.window.__v292Dfix660gc;
  GC.plan();
  let retries = 0;
  const r = GC.reclaimUrgent({ needBytes: 999999, reason: 'x', retry: () => { retries++; return false; } });
  ok('★★解放しても足りなければ still-quota で false', r.ok === false && r.code === 'still-quota', r);
  ok('★★I12: 元の setItem の再試行はちょうど1回', retries === 1, retries);
}
{
  /* I12 再入禁止 */
  const sb = quotaSandbox();
  const GC = sb.window.__v292Dfix660gc;
  GC.plan();
  let inner = null;
  GC.reclaimUrgent({ needBytes: 10, reason: 'outer', retry: () => {
    inner = GC.reclaimUrgent({ needBytes: 10, reason: 'inner', retry: () => true });
    return true;
  } });
  ok('★★I12: GC 実行中に別の GC を開始しない（再入は reentrant で弾く）',
     inner && inner.ok === false && inner.code === 'reentrant', inner);
}
{
  /* 緊急経路は localStorage へ書かない（裁定 シナリオ4: ログの再入） */
  const sb = quotaSandbox();
  const GC = sb.window.__v292Dfix660gc, GW = sb.window.__v292Dfix660gw;
  GC.plan();
  const before = Object.keys(sb._ls.__store).filter(k => k.indexOf('v292Dfix660_gclog') === 0).length;
  GC.reclaimUrgent({ needBytes: 10, reason: 'x', retry: () => true });
  ok('★★緊急経路ではログを localStorage へ書かない（ログ自身が quota で再帰するのを防ぐ）',
     Object.keys(sb._ls.__store).filter(k => k.indexOf('v292Dfix660_gclog') === 0).length === before &&
     GW.status().persistPending === true, GW.status());
  ok('★それでもログはメモリに残る（無言の削除を作らない）', GW.log().length > 0);
}

/* =====================================================================
   (6) exact-delete（fix246 の書換下でも exact key だけが消える）
   ===================================================================== */
console.log('\n== (6) fix246 の書換下でも exact key だけが消える（裁定 シナリオ2） ==');
{
  const seed = baseSeed({ ['chr6_bk_saveto_' + SLOT + '_1700000001_slot_other']: 'VICTIM' });
  const ls = mkLS(seed);
  const sb = mkSandbox(null, { ls, with569: true });
  /* fix246 相当: 以後 localStorage.removeItem は「キーに接尾辞を付けて」消すようになる */
  const nativeRemove = ls.removeItem.bind(ls);
  ls.removeItem = function(k){ return nativeRemove(k + '_slot_other'); };

  const GW = sb.window.__v292Dfix660gw;
  const key = 'chr6_bk_saveto_' + SLOT + '_1700000001';
  const raw = ls.getItem(key);
  const r = GW.deleteExact({ key, hash: GW._hash(raw), bytes: raw.length, family: 'story-backup',
                             slotId: SLOT, intent: 'reclaim', policyVersion: 1 });
  ok('★★書換ラッパの下でも exact key が消える', r.ok === true && ls.getItem(key) == null, r);
  ok('★★書換先の別キー（他スロットの控え）は消えない＝データ保護違反を作らない',
     ls.getItem(key + '_slot_other') === 'VICTIM', ls.getItem(key + '_slot_other'));
  ok('★status().bypassesRewriters が true', GW.status().bypassesRewriters === true);
}
{
  /* 対照: 書換ラッパ経由で消すと（＝ゲートウェイを使わないと）別のキーが消える */
  const seed = baseSeed({ ['chr6_bk_saveto_' + SLOT + '_1700000001_slot_other']: 'VICTIM' });
  const ls = mkLS(seed);
  const nativeRemove = ls.removeItem.bind(ls);
  ls.removeItem = function(k){ return nativeRemove(k + '_slot_other'); };
  const key = 'chr6_bk_saveto_' + SLOT + '_1700000001';
  ls.removeItem(key);
  ok('★★[対照] ゲートウェイを通さないと、確認したキーは残り、別のキーが消える（裁定 シナリオ2の実物）',
     ls.getItem(key) != null && ls.getItem(key + '_slot_other') == null);
}

/* =====================================================================
   (7) user-approved 経路
   ===================================================================== */
console.log('\n== (7) 利用者の明示承認による解放（必ず DeleteGateway を通る） ==');
{
  const sb = mkSandbox(baseSeed());
  const GC = sb.window.__v292Dfix660gc, GW = sb.window.__v292Dfix660gw;
  GC.plan();
  const rv = GC.reviewCandidates();
  const dumpKey = 'chr6_bk_cloudsync_1784942016';
  const dumpRow = rv.rows.filter(r => r.keys.indexOf(dumpKey) >= 0)[0];
  ok('★★唯一の fullDump は選択可能だが警告つき', !!dumpRow && dumpRow.selectable === true && !!dumpRow.warning, dumpRow);

  const n0 = GW.log().length;
  const r1 = GC.releaseApproved([dumpRow.unitId]);
  ok('★★明示承認だけでは唯一の復元点を解放しない（allowSoleRestorePoint が要る）',
     r1.ok === false && sb._ls.getItem(dumpKey) != null, r1);
  const r2 = GC.releaseApproved([dumpRow.unitId], { allowSoleRestorePoint: true });
  ok('★★警告に同意した明示操作なら解放できる', r2.ok === true && sb._ls.getItem(dumpKey) == null, r2);
  ok('★★解放は必ず DeleteGateway のログに残る（intent:user-approved）', (() => {
    const recs = GW.log().slice(n0).filter(e => e.key === dumpKey);
    /* 1回目は sole-restore-point で拒否・2回目が承認つきで deleted。**両方**残るのが正しい */
    return recs.length === 2 && recs[0].code === 'protected' && recs[0].why === 'sole-restore-point'
        && recs[1].code === 'deleted' && recs.every(r => r.intent === 'user-approved');
  })(), GW.log().slice(n0));
}
{
  /* hard（生きている物語そのもの）は明示承認でも解放しない */
  const sb = mkSandbox(baseSeed());
  const GW = sb.window.__v292Dfix660gw;
  const key = 'chr6_slot_' + SLOT, raw = sb._ls.getItem(key);
  const r = GW.deleteExact({ key, hash: GW._hash(raw), bytes: raw.length, family: 'live-story',
                             slotId: SLOT, intent: 'user-approved', policyVersion: 1, allowSoleRestorePoint: true });
  ok('★★hard は user-approved でも絶対に消えない', r.ok === false && sb._ls.getItem(key) != null, r);
  const GC = sb.window.__v292Dfix660gc;
  GC.plan();
  ok('★★生きている物語は reviewCandidates の選択対象にならない',
     GC.reviewCandidates().rows.every(r2 => r2.keys.indexOf(key) < 0 || r2.selectable === false),
     GC.reviewCandidates().rows.filter(r2 => r2.keys.indexOf(key) >= 0));
}

/* =====================================================================
   (8) I15 静的検査（allowlist 外の直接削除APIの新規混入が0）
   ===================================================================== */
console.log('\n== (8) I15: 直接削除APIの静的検査 ==');
{
  const gwAllow = (() => { const sb = mkSandbox({}); return sb.window.__v292Dfix660gw.allowlist(); })();
  ok('★★移行allowlist が既存7所有者 + fix246 + 影監視 + 本体を明示している', (() => {
    const must = ['v292Dfix246-store-slot-isolation.js','v292Dfix569-gc-shadow.js','v292Dfix660-delete-gateway.js',
                  'v292Dfix490-slot-write-guard.js','v292Dfix228-slot-generations.js','v292Dfix399-cloudsync.js',
                  'v292Dfix402-invisible-sync.js','v292Dfix277-quasi-pack.js'];
    return must.every(m => gwAllow.indexOf(m) >= 0) && gwAllow.length === must.length;
  })(), gwAllow);

  /* 本番の .js を走査し、危険APIの直接使用を検出する（裁定§4「veto足し忘れの静的保証」）。
     ★裁定の受け入れ条件は「protected namespace への直接 removeItem が0」だが、
       いま現に直接削除APIに触れているファイルは下の実測ベースラインだけある
       （sessionStorage や自前ストアの removeItem も含むため、検出は広めに取っている）。
       第0段の目的は**これ以上増やさないこと**なので、ここでは
       「ベースライン外の新規混入が0」を固定する。ベースラインは**減る方向にしか更新しない**。 */
  const DANGER = [/\.removeItem\s*\(/, /\[\s*["']removeItem["']\s*\]/, /Storage\s*\.\s*prototype\s*\.\s*removeItem/,
                  /localStorage\s*\.\s*clear\s*\(/, /delete\s+localStorage\s*\[/];
  const BASELINE = [
    /* ―― 削除の所有者（裁定 §1 の7所有者 + fix246 + 影監視 + 本ゲートウェイ） ―― */
    'v292Dfix246-store-slot-isolation.js','v292Dfix569-gc-shadow.js','v292Dfix660-delete-gateway.js',
    'v292Dfix490-slot-write-guard.js','v292Dfix228-slot-generations.js','v292Dfix399-cloudsync.js',
    'v292Dfix402-invisible-sync.js','v292Dfix277-quasi-pack.js',
    /* ―― それ以外に removeItem 系に触れている実測ファイル（2026-08-02 時点の棚卸し） ―― */
    'ab552_driver.js','features.js','v268-reset-bypass-fix.js','v270-final-cleanup.js',
    'v292Dfix135-longmem.js','v292Dfix197-avatar-key.js','v292Dfix291-saveexport.js','v292Dfix307-npc-roster.js',
    'v292Dfix326-story-scroll.js','v292Dfix328-google-login.js','v292Dfix384-auto-restore.js',
    'v292Dfix409-handle-merge.js','v292Dfix445-handle-lock.js','v292Dfix458-dash-post.js',
    'v292Dfix468-gen-timing.js','v292Dfix469-speaker-score.js','v292Dfix470-style-tail.js',
    'v292Dfix471-style-c.js','v292Dfix474-candidate.js','v292Dfix475-recipe-v3.js',
    'v292Dfix483-genbudget-sync.js','v292Dfix487-unknown-guard.js','v292Dfix515-icon-persist-probe.js',
    'v292Dfix516-regen-local-display.js','v292Dfix525-slot-ownership.js','v292Dfix543-save-guard.js',
    'v292Dfix553-punct-probe.js','v292Dfix555-punct-repair.js','v292Dfix564-snapshot.js',
    'v292Dfix573-hero-guard.js','v292Dfix590-commit-ledger.js','v292Dfix602-tombstone-write-shadow.js',
    'v292Dfix640-cast-evidence-ledger.js','v292Dfix643-collapse-rescue.js','v292Dfix645-scene-move-shadow.js',
    'v292Dfix648-punct-collapse.js','v292Dfix650-rescue-safety.js','v292Dfix651-guards.js'
  ];
  const files = fs.readdirSync(__dirname)
    .filter(f => /\.js$/.test(f) && !/^test_/.test(f) && !/^scan_/.test(f));
  const offenders = [];
  for (const f of files){
    const code = stripBlock(read(f)).replace(/^\s*\/\/.*$/gm, ' ');
    if (DANGER.some(re => re.test(code))) offenders.push(f);
  }
  const extra = offenders.filter(f => BASELINE.indexOf(f) < 0);
  ok('★★ベースライン外のファイルに直接削除APIが**新規混入していない**（第0段の要）', extra.length === 0, extra);
  ok('★★新規モジュール(BackupGC)は直接削除APIを持たない', offenders.indexOf('v292Dfix660-backup-gc.js') < 0);
  ok('★ゲートウェイの移行allowlist はベースラインの部分集合（嘘の許可を作らない）',
     gwAllow.every(f => BASELINE.indexOf(f) >= 0), gwAllow.filter(f => BASELINE.indexOf(f) < 0));
  ok('★検査が空振りしていない（実際に検出できている）', offenders.length >= 8, offenders.length);
  ok('★ベースラインに死に札が無い（棚卸しが腐っていない）',
     BASELINE.filter(f => files.indexOf(f) < 0).length === 0, BASELINE.filter(f => files.indexOf(f) < 0));
  ok('★★BackupGC は危険APIを1つも使っていない（選ぶだけの層）',
     !DANGER.some(re => re.test(CODE_GC)), 'backup-gc');
  ok('★★home.html の直接削除は既存3か所のまま（fix660 で1つも増やしていない）', (() => {
    /* ①fix659 の控え世代整理 ②fix596 の ns 消し ③sessionStorage の一回限り通知 */
    const hits = (CODEHOME.match(/\.removeItem\s*\(/g) || []).length;
    return hits === 3 && /pruneAheadBackups/.test(CODEHOME) && /v292Dfix596_ns/.test(CODEHOME);
  })(), (CODEHOME.match(/\.removeItem\s*\(/g) || []).length);
  ok('★★fix660 が home へ足したコード（容量UI一式）は削除APIを1つも使わない', (() => {
    const i = CODEHOME.indexOf('function f660gc'), j = CODEHOME.indexOf("el('upBtn').addEventListener");
    const region = (i >= 0 && j > i) ? CODEHOME.slice(i, j) : '';
    return region.length > 500 && !/\.removeItem\s*\(/.test(region) && /releaseApproved/.test(region);
  })());
}

/* =====================================================================
   (9) home 統合
   ===================================================================== */
console.log('\n== (9) home.html 統合（失敗の可視化 / quota→reclaim→再試行） ==');
const SRC579 = read('v292Dfix579-tombstone-schema.js');
const SRC564 = read('v292Dfix564-snapshot.js');
const SRC587 = read('v292Dfix587-story-lifecycle.js');
const SRC590 = read('v292Dfix590-commit-ledger.js');
function homeScript(){
  const parts = HOME.match(/<script>[\s\S]*?<\/script>/g) || [];
  const bodies = parts.map(p => p.replace(/^<script>/, '').replace(/<\/script>$/, ''));
  return bodies[bodies.length - 1];
}
const HOME_JS = homeScript();
function mkHome(opts){
  const ls = opts.ls || mkLS(opts.seed || {}, opts);
  const nodes = {}, listeners = {};
  function mkEl(id){
    const e = { id, value: '', textContent: '', innerHTML: '', className: '', style: { cssText: '' }, checked: false,
      firstChild: null, children: [], addEventListener(t, f){ (listeners[id] = listeners[id] || {})[t] = f; },
      appendChild(c){ e.children.push(c); return c; }, removeChild(){}, remove(){},
      querySelectorAll: () => [], setAttribute(){}, getAttribute: () => null, removeAttribute(){},
      click(){}, closest: () => null, classList: { add(){}, remove(){}, contains: () => false } };
    nodes[id] = e; return e;
  }
  ['q','sort','listTitle','navs','recent','grid','detail','sync','note','upBtn','downBtn','expBtn','impBtn','impFile','gcBtn','capMeter'].forEach(mkEl);
  const body = mkEl('__body');
  const document = { body, getElementById: id => nodes[id] || null,
    createElement: () => mkEl('__e' + Math.random()), createTextNode: t => ({ nodeValue: String(t) }),
    querySelectorAll: () => [], addEventListener(){} };
  const ops = [];
  const w = {
    localStorage: ls, sessionStorage: { getItem: () => null, setItem(){}, removeItem(){} },
    document, navigator: { userAgent: 'test' },
    location: { href: '', search: opts.search || '', pathname: '/home.html', hash: '', replace(){} },
    history: { replaceState(){} }, alert(){}, confirm(){ return true; },
    setTimeout: () => 0, clearTimeout(){}, console: { log(){}, warn(){}, error(){} },
    URL: { createObjectURL: () => 'blob:', revokeObjectURL(){} }, AbortController: undefined,
    fetch(url, o){
      if (String(url).indexOf('version.txt') >= 0) return Promise.resolve({ ok: true, text: () => Promise.resolve(read('version.txt').trim()) });
      let b = null; try { b = JSON.parse((o && o.body) || '{}'); } catch(e){ b = {}; }
      ops.push(b.op);
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(opts.server(b)) });
    }
  };
  w.window = w; w.self = w;
  const ctx = vm.createContext(w);
  vm.runInContext(SRC579, ctx, { filename: 'f579' });
  vm.runInContext(SRC562, ctx, { filename: 'f562' });
  vm.runInContext(SRC564, ctx, { filename: 'f564' });
  vm.runInContext(SRC_GW, ctx, { filename: 'f660gw' });
  vm.runInContext(SRC_GC, ctx, { filename: 'f660gc' });
  vm.runInContext(SRC587, ctx, { filename: 'f587' });
  vm.runInContext(SRC590, ctx, { filename: 'f590' });
  vm.runInContext(HOME_JS, ctx, { filename: 'home' });
  return { w, ls, nodes, ops, fire: (id, t, ev) => { const f = listeners[id] && listeners[id][t]; return f ? f(ev || {}) : undefined; } };
}
const settle = async (n = 200) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
{
  ok('★★home の s() が失敗理由（QuotaExceededError 等）を残す',
     /lastWriteError\s*=\s*\{\s*key:k/.test(HOME) && /function isQuotaError/.test(HOME));
  ok('★★home が書けなかったキーと理由を必ず画面へ出す',
     /件のデータを保存できませんでした/.test(HOME) && /writeFailures/.test(CODEHOME));
  ok('★★home の quota 経路は reclaimUrgent → そのキーだけ1回再試行',
     /reclaimUrgent\(\{[\s\S]{0,200}retry: function\(\)\{ return s\(key, val\); \}/.test(HOME));
  ok('★★容量メーターと「🧹 容量を空ける」がある',
     /id="capMeter"/.test(HOME) && /id="gcBtn"/.test(HOME) && /function openGcPanel/.test(HOME));
  ok('★★解放は必ず releaseApproved（＝DeleteGateway 経由）を通す',
     /gc\.releaseApproved\(ids/.test(HOME) && !/deleteExact\(/.test(CODEHOME));
  ok('★★home は自動で解放しない（利用者が選んで押したときだけ）',
     /if\(!confirm\(ids\.length\+' 件を解放します/.test(HOME));
}
{
  /* 実走: quota で本体が書けない → reclaim → 再試行で取り込みが成立する */
  const seed = Object.assign(baseSeed(), { v292ProxyPass: 'pw', 'v292Dfix402_baseRev': '0' });
  delete seed['chr6_bk_fix469_weird_1'];
  seed['chr6_bk_saveto_' + SLOT + '_1600000000'] = JSON.stringify({ key: 'chr6_slot_' + SLOT, blob: story(90) });
  const freeKey = 'chr6_bk_saveto_' + SLOT + '_1500000000';
  seed[freeKey] = JSON.stringify({ key: 'chr6_slot_' + SLOT, blob: story(89) });
  const quota = mkQuota(quotaCap(seed, 'chr6_slot_' + SLOT, story(96), freeKey));
  const ls = mkLS(seed, { quota });
  const remoteLs = { 'chr6_slots_meta': seed['chr6_slots_meta'], ['chr6_slot_' + SLOT]: story(96) };
  const h = mkHome({ ls, quota,
    server: b => b.op === 'meta' ? { ok: true, rev: 96, meta: { updatedAt: 1 } }
             : b.op === 'get' ? { ok: true, rev: 96, data: { ls: remoteLs, updatedAt: 1 } } : { ok: false } });
  h.w.__v292Dfix660gc.plan();
  await settle();
  const turns = (() => { try { return JSON.parse(ls.getItem('chr6_slot_' + SLOT)).turns.length; } catch(e){ return -1; } })();
  ok('★★[実走] quota でも 96ターンの本体が取り込めた（reclaim→1回再試行）', turns === 96, turns);
  ok('★★整理したことを画面に出す', /不要な控えを .* 件整理して取り込みました/.test(h.nodes.note.innerHTML), h.nodes.note.innerHTML);
  ok('★★唯一の fullDump は消していない', ls.getItem('chr6_bk_cloudsync_1784942016') != null);
}
{
  /* 実走: 解放できるものが1つも無い → 静かに失敗させず、必ず可視化する */
  const seed = { v292ProxyPass: 'pw', 'v292Dfix402_baseRev': '0',
                 'chr6_slots_meta': JSON.stringify([{ id: SLOT, name: 'x', key: 'chr6_slot_' + SLOT, updatedAt: 1 }]),
                 ['chr6_slot_' + SLOT]: story(2) };
  const quota = (k, v) => (k.indexOf('chr6_slot_') === 0 && v.length > 500);
  const ls = mkLS(seed, { quota });
  const remoteLs = { 'chr6_slots_meta': seed['chr6_slots_meta'], ['chr6_slot_' + SLOT]: story(96) };
  const h = mkHome({ ls, quota,
    server: b => b.op === 'meta' ? { ok: true, rev: 96, meta: { updatedAt: 1 } }
             : b.op === 'get' ? { ok: true, rev: 96, data: { ls: remoteLs, updatedAt: 1 } } : { ok: false } });
  await settle();
  ok('★★[実走] 書けなかったときは「取り込みました」で終わらせない',
     /保存できませんでした/.test(h.nodes.note.innerHTML), h.nodes.note.innerHTML);
  ok('★★失敗したキーとエラー名を出す',
     /chr6_slot_/.test(h.nodes.note.innerHTML) && /QuotaExceededError/.test(h.nodes.note.innerHTML), h.nodes.note.innerHTML);
  ok('★★「容量を空ける」へ誘導する', /容量を空ける/.test(h.nodes.note.innerHTML), h.nodes.note.innerHTML);
  ok('★★保護対象は1バイトも消えていない（fail-closed）', ls.getItem('chr6_slot_' + SLOT) === story(2));
}
{
  /* 容量メーターと解放UI */
  const seed = Object.assign(baseSeed(), { v292ProxyPass: 'pw' });
  const ls = mkLS(seed);
  const h = mkHome({ ls, server: () => ({ ok: false }) });
  await settle();
  ok('★★容量メーターが使用KBとキー数を出す',
     /保存容量: \d+KB \/ \d+キー/.test(h.nodes.capMeter.textContent), h.nodes.capMeter.textContent);
  h.fire('gcBtn', 'click');
  ok('★★「容量を空ける」で候補一覧が出る（1バイトも消さないと明記）',
     /容量を空ける/.test(h.nodes.note.innerHTML) && /1バイトも消していません/.test(h.nodes.note.innerHTML),
     h.nodes.note.innerHTML.slice(0, 200));
  ok('★★唯一の fullDump の行には警告文が出る',
     /唯一の控え/.test(h.nodes.note.innerHTML), h.nodes.note.innerHTML.indexOf('唯一の控え'));
  ok('★★一覧を開いただけでは1バイトも消えない',
     ls.getItem('chr6_bk_cloudsync_1784942016') != null && ls.__removed.length === 0, ls.__removed);
}
{
  /* fix658 / fix659 のフックが無傷 */
  ok('★fix658 のフックは3か所のまま', (CODEHOME.match(/__v292Dfix658\.\w+\s*\(/g) || []).length === 3);
  ok('★fix659 の autopull / adopt はそのまま',
     /function autoPullOnce/.test(HOME) && /f659adoptKey/.test(HOME) && /pull\(true, adoptId\)/.test(HOME));
  ok('★fix659 の控え作成（read-back 検証）はそのまま', /function backupAheadSlot/.test(HOME));
}

/* =====================================================================
   (10) 出荷の体裁
   ===================================================================== */
console.log('\n== (10) 出荷の体裁 ==');
{
  const token = (read('version.txt').trim().match(/-(fix\w+)$/) || [])[1];
  ok('★version.txt から fix札を取り出せた', !!token, token);
  for (const f of ['v292Dfix660-delete-gateway.js', 'v292Dfix660-backup-gc.js']){
    ok('★★index.html に ' + f + ' がある（cb は今の fix札）',
       (HTMLU.match(new RegExp(f.replace(/[.\\]/g, '\\$&') + '\\?cb=v292D(\\w+)')) || [])[1] === token,
       (HTMLU.match(new RegExp(f.replace(/[.\\]/g, '\\$&') + '\\?cb=[^"]*')) || [])[0]);
    ok('★★home.html にも ' + f + ' がある',
       (HOME.match(new RegExp(f.replace(/[.\\]/g, '\\$&') + '\\?cb=v292D(\\w+)')) || [])[1] === token);
  }
  ok('★★DeleteGateway は fix246 より**前**に置く（裁定 シナリオ2の必須条件）',
     HTMLU.indexOf('v292Dfix660-delete-gateway.js') > 0 &&
     HTMLU.indexOf('v292Dfix660-delete-gateway.js') < HTMLU.indexOf('v292Dfix246-store-slot-isolation.js'),
     { gw: HTMLU.indexOf('v292Dfix660-delete-gateway.js'), f246: HTMLU.indexOf('v292Dfix246-store-slot-isolation.js') });
  ok('★★DeleteGateway は fix569 より後（捕捉済み native を借りるため）',
     HTMLU.indexOf('v292Dfix660-delete-gateway.js') > HTMLU.indexOf('v292Dfix569-gc-shadow.js'));
  ok('★★BackupGC は fix562 より後（分類の正が先に載る）',
     HTMLU.indexOf('v292Dfix660-backup-gc.js') > HTMLU.indexOf('v292Dfix562-backup-inventory.js') &&
     HOME.indexOf('v292Dfix660-backup-gc.js') > HOME.indexOf('v292Dfix562-backup-inventory.js'));
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
