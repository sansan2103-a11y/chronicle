/* 回帰テスト: v292Dfix642 — 物語削除の「read-back 次段」
 *
 * 固定する契約
 *   C1 confirmStale 無しは拒否（1バイトも書かない・通信もしない）
 *   C2 ★クラウドの墓標が確定していなければ**消さない**（missing / alive / mismatch /
 *      empty / unsupported / 通信失敗 のすべて）
 *   C3 ★新しい planId が**いまのバイト**の exact（keys+bytes+hash）で作られる
 *      （旧計画の古い bytes を使い回さない＝stale で永久に止まる型を繰り返さない）
 *   C4 ★削除は DeleteGateway(fix569.tryDeleteExact) 経由だけ（intent/path/deleteOpId つき）
 *   C5 ★復元スナップショット（戻り道）が無い・検証に落ちる・計画キーを被覆しないなら消さない
 *   C6 chr6 / default は拒否
 *   C7 v292Dfix642Off='1' で全 API が拒否（通信もしない）
 *   C8 旧 blocked レコードは消えず superseded が付く
 *   C9 read-back は op:'commitstate' + slotId を使い、**op:'get' を呼ばない**
 *   C10 自動実行しない（読み込んだだけでは通信も削除も起きない）
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const SRC = read('v292Dfix642-delete-readback.js');
/* コメント（設計意図の説明に op:'get' や forceput の語が出る）を除いた**実コード**。
   「実装がその op を呼んでいないか」は必ずこちらで見る。 */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
                .filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

const SLOT = 'smrnoszes2j';
const OPID = 'del_' + SLOT + '_1700000000000';
const story = n => JSON.stringify({ turns: new Array(n).fill(0).map(() => ({})) });
const BODY_NOW = story(6);                 /* いまの本体（6ターン・追記後） */
const SIDE_NOW = '{"s":1}';

/* FNV-1a（fix562._hash / fix569 の fnv と同一実装） */
function fnv(str){
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
  return h.toString(16) + '-' + str.length;
}

/* ------------------------------------------------------------------ */
/* モック環境                                                          */
/* ------------------------------------------------------------------ */
function mkEnv(opts){
  opts = opts || {};
  const seed = Object.assign({
    'v292ProxyPass': 'pw',
    'chr6_slots_meta': JSON.stringify([
      { id: SLOT, name: '港の倉庫街', deleted: true, deletedAt: 1700000000000,
        deleteOpId: OPID, recoverySnapshotId: 'chr6_snap_' + SLOT + '_1700000000000',
        lifecycleVersion: 1 },
      { id: 'smAlive', name: '生きている物語' }
    ]),
    /* ★停止中の計画（fix587 が blocked-stale-legacy で終端へ移したもの）。
       当時の bytes は 12785 相当、いまは 18132 相当 ＝ stale */
    'v292Dfix587_blocked': JSON.stringify([
      { planId: 'plan_' + OPID, slotId: SLOT, deleteOpId: OPID, at: 1700000000000,
        blockedReason: 'blocked-stale-legacy', attempts: 3,
        keys: [{ key: 'chr6_slot_' + SLOT, code: 'stale' }] }
    ]),
    ['chr6_slot_' + SLOT]: BODY_NOW,
    ['v292Dfix77States_slot_' + SLOT]: SIDE_NOW,
    'chr6_slot_smAlive': story(2)
  }, opts.seed || {});
  if (opts.dropSeed) opts.dropSeed.forEach(k => { delete seed[k]; });

  const store = Object.assign({}, seed);
  const removedDirect = [];
  const ls = {
    getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => {
      if (opts.quotaFor && opts.quotaFor(k)){ const e = new Error('q'); e.name = 'QuotaExceededError'; throw e; }
      store[k] = String(v);
    },
    removeItem: k => { removedDirect.push(k); delete store[k]; },
    key: i => { const a = Object.keys(store); return i < a.length ? a[i] : null; },
    get length(){ return Object.keys(store).length; }
  };

  /* --- 通信（fetch）のモック --- */
  const calls = [];
  const server = opts.server || (b => ({
    ok: true, exists: true, rev: 9, packageHash: 'ph', serverTs: 1700000009999,
    tombstone: { deleted: true, deleteOpId: OPID, lifecycleVersion: 1, recoverySnapshotId: null }
  }));
  const fetchImpl = (url, o) => {
    let body = null;
    try { body = JSON.parse((o && o.body) || '{}'); } catch(e){ body = {}; }
    calls.push({ url: String(url), body: body, headers: (o && o.headers) || {} });
    if (opts.netFail) return Promise.reject(new Error('offline'));
    const r = server(body, calls.length);
    return Promise.resolve({ ok: (r.__status || 200) === 200, status: r.__status || 200,
                             json: () => Promise.resolve(r) });
  };

  /* --- fix564（論理スナップショット）のモック: 実物と同じレイアウトで書く --- */
  const snapCalls = [];
  const MPRE = 'chr6_snap_', DPRE = 'chr6_snapd_';
  function partKeys(slot){
    const out = [];
    if (ls.getItem('chr6_slot_' + slot) != null) out.push('chr6_slot_' + slot);
    Object.keys(store).forEach(k => {
      if (k === 'chr6_slot_' + slot) return;
      if (k.indexOf('chr6_bk_') === 0) return;
      if (k.indexOf(MPRE) === 0 || k.indexOf(DPRE) === 0) return;
      if (k.indexOf(slot) < 0) return;
      out.push(k);
    });
    return out;
  }
  const snap = {
    MPRE, DPRE,
    create: (slot, o) => {
      snapCalls.push({ slot, opts: o });
      if (opts.snapFail) return { ok: false, error: '容量不足' };
      const ks = partKeys(slot);
      if (ks.indexOf('chr6_slot_' + slot) < 0) return { ok: false, error: '本体セーブがありません' };
      const ts = o && o.now, id = MPRE + slot + '_' + ts, parts = {};
      let total = 0;
      ks.forEach((k, i) => {
        const v = ls.getItem(k); if (v == null) return;
        const dk = DPRE + slot + '_' + ts + '_' + i;
        ls.setItem(dk, v);
        parts[k] = { liveKey: k, snapKey: dk, hash: fnv(v), bytes: v.length,
                     role: k === 'chr6_slot_' + slot ? 'story' : 'sideStore' };
        total += v.length;
      });
      /* ★被覆漏れを作るテスト用フック（サイドストアだけ落とす） */
      if (opts.snapDropKey && parts[opts.snapDropKey]) delete parts[opts.snapDropKey];
      const man = { version: 1, id, slotId: slot, createdAt: ts, reason: String((o && o.reason) || ''),
                    kind: 'user', complete: true, partCount: Object.keys(parts).length,
                    totalBytes: total, parts };
      ls.setItem(id, JSON.stringify(man));
      return { ok: true, id, parts: man.partCount, bytes: total };
    },
    verify: id => {
      if (opts.verifyFailFor && opts.verifyFailFor(id)) return { ok: false, id, error: 'hash不一致' };
      let m = null; try { m = JSON.parse(ls.getItem(id) || 'null'); } catch(e){}
      if (!m || !m.parts) return { ok: false, error: 'manifestが読めません: ' + id };
      const missing = [];
      Object.keys(m.parts).forEach(lk => {
        const v = ls.getItem(m.parts[lk].snapKey);
        if (v == null || fnv(v) !== m.parts[lk].hash) missing.push(lk);
      });
      return { ok: missing.length === 0, id, missing };
    }
  };

  /* --- fix569（DeleteGateway）のモック --- */
  const gateCalls = [];
  const gate = {
    tryDeleteExact: req => {
      gateCalls.push(req);
      const raw = ls.getItem(req.key);
      if (raw == null) return { ok: false, deleted: false, code: 'missing', key: req.key };
      if (req.expectedBytes != null && raw.length !== req.expectedBytes)
        return { ok: false, deleted: false, code: 'stale', key: req.key };
      if (req.expectedHash != null && fnv(raw) !== req.expectedHash)
        return { ok: false, deleted: false, code: 'stale', key: req.key };
      if (opts.gateRefuse && opts.gateRefuse(req))
        return { ok: false, deleted: false, code: 'protected', key: req.key };
      delete store[req.key];
      return { ok: true, deleted: true, code: 'deleted', key: req.key };
    }
  };

  /* --- fix562（分類器）のモック --- */
  const inv = {
    _hash: fnv,
    classifyKey: k => ({ key: k }),
    sideStoreKeys: slot => Object.keys(store).filter(k =>
      k !== 'chr6_slot_' + slot && k.indexOf('chr6_bk_') !== 0 &&
      k.indexOf('chr6_snap') !== 0 && k.indexOf(slot) >= 0).sort()
  };

  const logs = [];
  const w = {
    localStorage: ls, fetch: fetchImpl,
    console: { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')) },
    setTimeout: (fn, ms) => 0, clearTimeout: () => {},
    JSON, Date, Error, Promise, Object, String, Number, Array,
    AbortController: undefined
  };
  if (opts.deps !== false){
    w.__v292Dfix564 = snap;
    w.__v292Dfix569 = gate;
    w.__v292Dfix562 = inv;
    if (!opts.realLifecycle) w.__chronicleStoryLifecycle = {
      blockedDeletes: () => { try { return JSON.parse(ls.getItem('v292Dfix587_blocked') || '[]'); } catch(e){ return []; } },
      isOff: () => opts.lifecycleOff === true,
      LIFECYCLE_VERSION: 1
    };
  }
  if (opts.withSync) w.__v292Dfix399x = { push: () => opts.pushFail ? Promise.reject(new Error('offline')) : Promise.resolve({ rev: 10 }) };
  w.window = w; w.self = w;
  const ctx = vm.createContext(w);
  /* ★fix587 の実物を同じ localStorage の上へ載せる（画面表示の契約を実物で確かめるため） */
  if (opts.realLifecycle)
    vm.runInContext(read('v292Dfix587-story-lifecycle.js'), ctx, { filename: 'v292Dfix587-story-lifecycle.js' });
  vm.runInContext(SRC, ctx, { filename: 'v292Dfix642-delete-readback.js' });
  return { w, store, ls, calls, gateCalls, snapCalls, logs, removedDirect,
           api: () => w.__v292Dfix642, life: () => w.__chronicleStoryLifecycle };
}
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r)); };
const snapshot = s => JSON.stringify(s);

/* ============================================================ */
async function main(){

console.log('\n== (0) ★★C10: 読み込んだだけでは何も起きない（自動実行なし） ==');
{
  const h = mkEnv();
  await flush();
  ok('★通信していない', h.calls.length === 0, h.calls.map(c => c.body && c.body.op));
  ok('★削除していない', h.store['chr6_slot_' + SLOT] === BODY_NOW);
  ok('★ゲートも呼んでいない', h.gateCalls.length === 0);
  ok('★localStorage を書いていない（runs も作らない）', h.store['v292Dfix642_runs'] === undefined);
  ok('★公開APIが生えている',
     !!h.api() && typeof h.api().readbackTombstone === 'function'
     && typeof h.api().resumeBlocked === 'function' && typeof h.api().status === 'function');
  ok('★fix587 の blocked を読めている', h.api().status().blocked.length === 1, h.api().status().blocked);
  ok('★停止理由も見える', h.api().status().blocked[0].blockedReason === 'blocked-stale-legacy');
}

console.log('\n== (1) ★★C1: confirmStale 無しは拒否（1バイトも書かず、通信もしない） ==');
{
  const h = mkEnv();
  const before = snapshot(h.store);
  const r = await h.api().resumeBlocked(SLOT, {});
  ok('★拒否する', r.ok === false && r.code === 'need-confirm', r);
  ok('★★データは1バイトも変わっていない', snapshot(h.store) === before);
  ok('★★通信していない（read-back すら走らせない）', h.calls.length === 0, h.calls.length);
  ok('★ゲートを呼んでいない', h.gateCalls.length === 0);
  ok('★人が読める案内がある', typeof r.hint === 'string' && r.hint.length > 0, r.hint);

  const r2 = await h.api().resumeBlocked(SLOT);       /* opts 省略 */
  ok('★opts 省略でも拒否', r2.code === 'need-confirm', r2);
  const r3 = await h.api().resumeBlocked(SLOT, { confirmStale: 'true' });   /* 文字列は不可 */
  ok('★★confirmStale は真偽値 true のみ（文字列 "true" では通さない）', r3.code === 'need-confirm', r3);
}

console.log('\n== (2) ★★C6: chr6 / default は拒否 ==');
{
  const h = mkEnv();
  for (const id of ['chr6', 'default', '']){
    const r = await h.api().resumeBlocked(id, { confirmStale: true });
    ok('★resumeBlocked("' + id + '") を拒否', r.ok === false && r.code === 'not-deletable', r);
    const rb = await h.api().readbackTombstone(id);
    ok('★readbackTombstone("' + id + '") も拒否', rb.ok === false && rb.code === 'not-deletable', rb);
  }
  ok('★★既定枠については通信していない', h.calls.length === 0);
  ok('★既定枠のデータは無傷', h.store['chr6_slot_smAlive'] === story(2));
}

console.log('\n== (3) ★★C7: OFFスイッチ v292Dfix642Off=1 で全拒否 ==');
{
  const h = mkEnv({ seed: { 'v292Dfix642Off': '1' } });
  const before = snapshot(h.store);
  const r = await h.api().resumeBlocked(SLOT, { confirmStale: true });
  ok('★resumeBlocked が service-off', r.ok === false && r.code === 'service-off', r);
  const rb = await h.api().readbackTombstone(SLOT);
  ok('★readbackTombstone も service-off', rb.ok === false && rb.code === 'service-off', rb);
  ok('★★通信していない', h.calls.length === 0);
  ok('★★データは1バイトも変わっていない', snapshot(h.store) === before);
  ok('★previewPlan も止まる', h.api().previewPlan(SLOT).code === 'service-off');
  ok('★status() は読める（OFFの事実を返す）', h.api().status().off === true);
}

console.log('\n== (4) ★★C9: read-back は op:commitstate + slotId（op:get を呼ばない） ==');
{
  const h = mkEnv();
  const r = await h.api().readbackTombstone(SLOT);
  ok('★確定を返す', r.ok === true && r.code === 'confirmed', r);
  ok('★★1往復だけ', h.calls.length === 1, h.calls.length);
  ok('★★op は commitstate', h.calls[0].body.op === 'commitstate', h.calls[0].body);
  ok('★★slotId を渡している', h.calls[0].body.slotId === SLOT, h.calls[0].body);
  ok('★★op:get を1度も呼んでいない',
     h.calls.every(c => c.body.op !== 'get' && c.body.op !== 'getfork'), h.calls.map(c => c.body.op));
  ok('★★put/forceput を1度も呼んでいない',
     h.calls.every(c => c.body.op !== 'put' && c.body.op !== 'forceput'), h.calls.map(c => c.body.op));
  ok('★/save へ送っている', /\/save$/.test(h.calls[0].url), h.calls[0].url);
  ok('★合言葉ヘッダを付けている', h.calls[0].headers['x-chronicle-pass'] === 'pw', h.calls[0].headers);
  ok('★結果をキャッシュしている', h.api().status().readbackCache[SLOT].code === 'confirmed');
  ok('★★読み取りでデータを1バイトも変えていない', h.store['chr6_slot_' + SLOT] === BODY_NOW);
  /* 実コードにも op:'get' / put / forceput が無いことを固定（将来の書き換えで混入させない） */
  ok("★★実装コードに op:'get' が現れない", !/op\s*:\s*'get(fork)?'/.test(CODE));
  ok('★★実装コードに forceput / put が現れない', !/forceput|op\s*:\s*'put'/.test(CODE));
  ok("★★実装コードで叩く op は commitstate だけ",
     (CODE.match(/op\s*:\s*'[a-z]+'/g) || []).join(',') === "op: 'commitstate'",
     (CODE.match(/op\s*:\s*'[a-z]+'/g) || []));
}

console.log('\n== (5) ★★C2: クラウド墓標が未確定なら消さない ==');
{
  const cases = [
    { name: '墓標がクラウドに無い', code: 'remote-tombstone-missing',
      srv: () => ({ ok:true, exists:true, rev:9, tombstone: null }) },
    { name: '★クラウドでは生きている（別端末で復元された）', code: 'remote-alive',
      srv: () => ({ ok:true, exists:true, rev:9, tombstone: { deleted:false, deleteOpId:null } }) },
    { name: '★別の削除操作の墓標（deleteOpId 不一致）', code: 'remote-deleteopid-mismatch',
      srv: () => ({ ok:true, exists:true, rev:9, tombstone: { deleted:true, deleteOpId:'del_other_1' } }) },
    { name: 'クラウドに正本が無い', code: 'remote-empty',
      srv: () => ({ ok:true, exists:false, rev:0 }) },
    { name: 'D1が無く読み戻せない(501)', code: 'readback-unsupported',
      srv: () => ({ __status:501, ok:false, errorCode:'unsupported' }) },
    { name: 'サーバが ok:false', code: 'readback-failed',
      srv: () => ({ ok:false, error:'boom' }) }
  ];
  for (const c of cases){
    const h = mkEnv({ server: c.srv });
    const before = snapshot(h.store);
    const rb = await h.api().readbackTombstone(SLOT);
    ok('★read-back: ' + c.name + ' → ' + c.code, rb.ok === false && rb.code === c.code, rb);
    const r = await h.api().resumeBlocked(SLOT, { confirmStale: true });
    ok('  ★★' + c.name + ' では削除しない', r.ok === false && r.code === 'cloud-tombstone-unconfirmed', r);
    ok('  ★★本体もサイドストアも残っている',
       h.store['chr6_slot_' + SLOT] === BODY_NOW && h.store['v292Dfix77States_slot_' + SLOT] === SIDE_NOW);
    ok('  ★ゲートを1度も呼んでいない', h.gateCalls.length === 0, h.gateCalls);
    ok('  ★復元セットも作っていない（無駄な容量を使わない）', h.snapCalls.length === 0);
    ok('  ★停止の理由を人の言葉で返す', typeof r.hint === 'string' && r.hint.length > 0, r.hint);
    ok('  ★旧blockedレコードは superseded にしない', !h.api().status().blocked[0].superseded);
  }
}

console.log('\n== (5b) ★通信そのものが失敗しても消さない ==');
{
  const h = mkEnv({ netFail: true });
  const r = await h.api().resumeBlocked(SLOT, { confirmStale: true });
  ok('★cloud-tombstone-unconfirmed', r.ok === false && r.code === 'cloud-tombstone-unconfirmed', r);
  ok('★read-back の理由は readback-failed', r.readback.code === 'readback-failed', r.readback);
  ok('★★データは無傷', h.store['chr6_slot_' + SLOT] === BODY_NOW);
}

console.log('\n== (5c) ★未確定なら墓標を再push → 再read-back する（fix399 がある場合） ==');
{
  let n = 0;
  const h = mkEnv({ withSync: true, server: () => {
    n++;
    return (n === 1) ? { ok:true, exists:true, rev:9, tombstone:null }
                     : { ok:true, exists:true, rev:10, tombstone:{ deleted:true, deleteOpId:OPID } };
  }});
  const r = await h.api().resumeBlocked(SLOT, { confirmStale: true });
  ok('★★再pushの後に確定して削除まで進む', r.ok === true && r.code === 'deleted', r);
  ok('★read-back を2回叩いている', h.calls.filter(c => c.body.op === 'commitstate').length === 2,
     h.calls.map(c => c.body.op));
  ok('★本体が消えている', h.store['chr6_slot_' + SLOT] === undefined);
}

console.log('\n== (5d) ★home（fix399なし）で未確定なら、自前で送らずに止まる ==');
{
  const h = mkEnv({ server: () => ({ ok:true, exists:true, rev:9, tombstone:null }) });
  const r = await h.api().resumeBlocked(SLOT, { confirmStale: true });
  ok('★止まる', r.ok === false && r.code === 'cloud-tombstone-unconfirmed', r.code);
  ok('★★push が無いことを理由として返す', r.push && r.push.code === 'push-unavailable', r.push);
  ok('★★勝手に forceput/put を送っていない',
     h.calls.every(c => ['commitstate'].indexOf(c.body.op) >= 0), h.calls.map(c => c.body.op));
  ok('★人がやることを案内している', /いま上げる|ゲーム画面/.test(r.hint || ''), r.hint);
  ok('★データは無傷', h.store['chr6_slot_' + SLOT] === BODY_NOW);
}

console.log('\n== (6) ★★★C3+C4: 新planId は「いまのバイト」の exact で作られ、ゲート経由で消える ==');
{
  const h = mkEnv();
  const r = await h.api().resumeBlocked(SLOT, { confirmStale: true });
  ok('★成功する', r.ok === true && r.code === 'deleted', r);
  ok('★★新しい planId が発行された（旧 planId と違う）',
     r.planId !== 'plan_' + OPID && String(r.planId).indexOf('plan_' + OPID) === 0, r.planId);
  ok('★★deleteOpId は作り直していない（クラウドの墓標と食い違わせない）', r.deleteOpId === OPID, r.deleteOpId);

  ok('★★削除はすべて DeleteGateway 経由', h.gateCalls.length >= 2, h.gateCalls.length);
  ok('★★自前で removeItem を呼んでいない（localStorage.removeItem の直呼びが0件）',
     h.removedDirect.length === 0, h.removedDirect);
  const del = h.gateCalls.filter(c => c.intent === 'lifecycle-delete' && c.path === 'fix642');
  ok('★intent=lifecycle-delete / path=fix642 を申告している', del.length === h.gateCalls.length,
     h.gateCalls.map(c => c.path));
  ok('★★deleteOpId を申告している', h.gateCalls.every(c => c.deleteOpId === OPID),
     h.gateCalls.map(c => c.deleteOpId));

  const body = h.gateCalls.filter(c => c.key === 'chr6_slot_' + SLOT)[0];
  ok('★★本体は**いまのバイト数**で申告している（旧計画の 12785 を使い回さない）',
     !!body && body.expectedBytes === BODY_NOW.length, body);
  ok('★★hash も**いまの値**の hash', !!body && body.expectedHash === fnv(BODY_NOW), body);
  const side = h.gateCalls.filter(c => c.key === 'v292Dfix77States_slot_' + SLOT)[0];
  ok('★★サイドストアも計画に入っている（exact bytes/hash つき）',
     !!side && side.expectedBytes === SIDE_NOW.length && side.expectedHash === fnv(SIDE_NOW), side);

  ok('★★本体が消えている', h.store['chr6_slot_' + SLOT] === undefined, Object.keys(h.store));
  ok('★★サイドストアも消えている', h.store['v292Dfix77States_slot_' + SLOT] === undefined);
  ok('★★生きている物語は無傷', h.store['chr6_slot_smAlive'] === story(2));
  ok('★★墓標は残っている（消えたことの記録を壊さない）',
     JSON.parse(h.store['chr6_slots_meta']).filter(e => e.id === SLOT && e.deleted === true).length === 1);
  ok('★消したキー数を返す', r.deleted === 2 && r.planned === 2, r);
  ok('★「元から無かった」件数と分けて数える', r.physicallyDeleted === 2 && r.alreadyMissing === 0, r);
}

console.log('\n== (7) ★★★C5: 復元スナップショット（戻り道）が無ければ消さない ==');
{
  /* (a) 作れない */
  {
    const h = mkEnv({ snapFail: true });
    const r = await h.api().resumeBlocked(SLOT, { confirmStale: true });
    ok('★snapshot-failed', r.ok === false && r.code === 'snapshot-failed', r);
    ok('★★データは無傷', h.store['chr6_slot_' + SLOT] === BODY_NOW &&
       h.store['v292Dfix77States_slot_' + SLOT] === SIDE_NOW);
    ok('★ゲートを呼んでいない', h.gateCalls.length === 0, h.gateCalls);
  }
  /* (b) 検証に落ちる */
  {
    const h = mkEnv({ verifyFailFor: id => /_1[6-9]\d{11}$/.test(id) || true });
    const r = await h.api().resumeBlocked(SLOT, { confirmStale: true });
    ok('★snapshot-unverified', r.ok === false && r.code === 'snapshot-unverified', r);
    ok('★★データは無傷', h.store['chr6_slot_' + SLOT] === BODY_NOW);
    ok('★ゲートを呼んでいない', h.gateCalls.length === 0);
  }
  /* (c) 計画キーを被覆していない（サイドストアが復元セットに入っていない） */
  {
    const h = mkEnv({ snapDropKey: 'v292Dfix77States_slot_' + SLOT });
    const r = await h.api().resumeBlocked(SLOT, { confirmStale: true });
    ok('★★snapshot-incomplete（1本でも戻せなければ消さない）',
       r.ok === false && r.code === 'snapshot-incomplete', r);
    ok('★どのキーが被覆漏れかを返す',
       (r.missing || []).indexOf('v292Dfix77States_slot_' + SLOT) >= 0, r.missing);
    ok('★★データは無傷（本体も消さない）', h.store['chr6_slot_' + SLOT] === BODY_NOW &&
       h.store['v292Dfix77States_slot_' + SLOT] === SIDE_NOW);
    ok('★ゲートを呼んでいない', h.gateCalls.length === 0);
  }
}

console.log('\n== (7b) ★★旧スナップショットが実在しても、現在値で撮り直してから消す ==');
{
  const h = mkEnv();
  const r = await h.api().resumeBlocked(SLOT, { confirmStale: true });
  ok('★新しい復元セットを作っている', h.snapCalls.length === 1, h.snapCalls.length);
  ok('★★撮り直した復元セットを使っている（旧IDではない）',
     r.snapshotId !== 'chr6_snap_' + SLOT + '_1700000000000' &&
     String(r.snapshotId).indexOf('chr6_snap_' + SLOT + '_') === 0, r.snapshotId);
  ok('★旧IDも記録に残す', r.priorRecoverySnapshotId === 'chr6_snap_' + SLOT + '_1700000000000', r);
  ok('★★reason に deleteOpId を埋めている（fix587 の checkResumable が要求する形）',
     h.snapCalls[0].opts.reason === 'lifecycle-delete:' + OPID, h.snapCalls[0].opts);
  const man = JSON.parse(h.store[r.snapshotId]);
  ok('★★消したバイト列そのものが復元セットに入っている（本体）',
     h.store[man.parts['chr6_slot_' + SLOT].snapKey] === BODY_NOW);
  ok('★★サイドストアも入っている',
     h.store[man.parts['v292Dfix77States_slot_' + SLOT].snapKey] === SIDE_NOW);
}

console.log('\n== (8) ★★C8: 旧 blocked レコードは消さず superseded を付ける ==');
{
  const h = mkEnv();
  const r = await h.api().resumeBlocked(SLOT, { confirmStale: true });
  const blocked = JSON.parse(h.store['v292Dfix587_blocked']);
  ok('★★レコードは消えていない', blocked.length === 1, blocked);
  ok('★★superseded に新しい planId が入る', blocked[0].superseded === r.planId, blocked[0]);
  ok('★いつ置き換えたかも残る', typeof blocked[0].supersededAt === 'number');
  ok('★停止理由は書き換えない（履歴を壊さない）', blocked[0].blockedReason === 'blocked-stale-legacy');
  ok('★返り値にも置き換えた planId を出す', (r.supersededPlanIds || []).indexOf('plan_' + OPID) >= 0, r);
  ok('★実行結果が runs に残る', JSON.parse(h.store['v292Dfix642_runs']).length === 1,
     h.store['v292Dfix642_runs']);
  ok('★runs に生の値は入っていない',
     !/turns|"s":1/.test(h.store['v292Dfix642_runs']), h.store['v292Dfix642_runs']);

  /* superseded 済みは「対象外」になる（二度打ちしても壊れない） */
  const r2 = await h.api().resumeBlocked(SLOT, { confirmStale: true });
  ok('★★二度目は not-blocked で止まる', r2.ok === false && r2.code === 'not-blocked', r2);
}

console.log('\n== (8b) ★★片づいた後に「停止しました」と言い続けない（嘘の警告を残さない） ==');
{
  /* fix587 の pendingSummary は superseded を除く（履歴は blockedDeletes に残る）。
     ★実物の fix587 を同じ localStorage の上に載せて確かめる（モックの作り直しでは意味が無い）。 */
  const h = mkEnv({ realLifecycle: true });
  const svc = h.life();
  ok('★片づける前は「停止しました」と出る',
     !!svc.pendingSummary() && /停止しました/.test(svc.pendingSummary().lines.join('')),
     svc.pendingSummary());

  /* fix587 実物に差し替わったので、blockedDeletes は本物の readBlocked を使う */
  const r = await h.api().resumeBlocked(SLOT, { confirmStale: true });
  ok('★片づいた', r.ok === true && r.code === 'deleted', r);
  ok('★★片づいた後は何も出さない', svc.pendingSummary() === null, svc.pendingSummary());
  ok('★★履歴そのものは残っている（blockedDeletes は全件を返す）',
     svc.blockedDeletes().length === 1 && svc.blockedDeletes()[0].superseded === r.planId,
     svc.blockedDeletes());
}

console.log('\n== (9) ★部分的に拒否されたら superseded にしない（未完を完了に見せない） ==');
{
  const h = mkEnv({ gateRefuse: req => req.key.indexOf('v292Dfix77States_') === 0 });
  const r = await h.api().resumeBlocked(SLOT, { confirmStale: true });
  ok('★code は partial', r.ok === true && r.code === 'partial', r);
  ok('★消えた分だけ消えている', h.store['chr6_slot_' + SLOT] === undefined);
  ok('★拒否されたキーは残っている', h.store['v292Dfix77States_slot_' + SLOT] === SIDE_NOW);
  ok('★拒否の内訳を返す（期待値と実測値つき）',
     r.refused.length === 1 && r.refused[0].code === 'protected'
     && r.refused[0].expectedBytes === SIDE_NOW.length, r.refused);
  ok('★★旧blockedを superseded にしない', !JSON.parse(h.store['v292Dfix587_blocked'])[0].superseded);
}

console.log('\n== (10) ★前提が崩れているときの拒否（fail-closed） ==');
{
  /* 停止中の計画に載っていない物語 */
  {
    const h = mkEnv();
    const r = await h.api().resumeBlocked('smAlive', { confirmStale: true });
    ok('★not-blocked', r.ok === false && r.code === 'not-blocked', r);
    ok('★★生きている物語は無傷', h.store['chr6_slot_smAlive'] === story(2));
    ok('★通信していない', h.calls.length === 0);
  }
  /* 墓標が無い */
  {
    const h = mkEnv({ seed: { 'chr6_slots_meta': JSON.stringify([{ id: SLOT, name: '港の倉庫街' }]) } });
    const r = await h.api().resumeBlocked(SLOT, { confirmStale: true });
    ok('★no-tombstone', r.ok === false && r.code === 'no-tombstone', r);
    ok('★★データは無傷', h.store['chr6_slot_' + SLOT] === BODY_NOW);
  }
  /* 墓標に deleteOpId が無い（malformed） */
  {
    const h = mkEnv({ seed: { 'chr6_slots_meta': JSON.stringify([
      { id: SLOT, deleted: true, lifecycleVersion: 1 }]) } });
    const r = await h.api().resumeBlocked(SLOT, { confirmStale: true });
    ok('★no-delete-op-id', r.ok === false && r.code === 'no-delete-op-id', r);
    ok('★★データは無傷', h.store['chr6_slot_' + SLOT] === BODY_NOW);
  }
  /* 正式に復元済み */
  {
    const h = mkEnv({ seed: { 'chr6_slots_meta': JSON.stringify([
      { id: SLOT, deleted: true, deleteOpId: OPID, restoreOfDeleteOpId: OPID, lifecycleVersion: 1 }]) } });
    const r = await h.api().resumeBlocked(SLOT, { confirmStale: true });
    ok('★★restored（復元済みを消し直さない）', r.ok === false && r.code === 'restored', r);
    ok('★★データは無傷', h.store['chr6_slot_' + SLOT] === BODY_NOW);
  }
  /* 依存が欠けている */
  {
    const h = mkEnv({ deps: false });
    const r = await h.api().resumeBlocked(SLOT, { confirmStale: true });
    ok('★missing-deps', r.ok === false && r.code === 'missing-deps', r);
    ok('★何が足りないかを返す', (r.missing || []).length >= 3, r.missing);
    ok('★★データは無傷', h.store['chr6_slot_' + SLOT] === BODY_NOW);
  }
  /* fix587 が OFF */
  {
    const h = mkEnv({ lifecycleOff: true });
    const r = await h.api().resumeBlocked(SLOT, { confirmStale: true });
    ok('★lifecycle-off', r.ok === false && r.code === 'lifecycle-off', r);
    ok('★★データは無傷', h.store['chr6_slot_' + SLOT] === BODY_NOW);
  }
  /* 未ログイン（read-back のヘッダが作れない） */
  {
    const h = mkEnv({ dropSeed: ['v292ProxyPass'] });
    const rb = await h.api().readbackTombstone(SLOT);
    ok('★not-logged-in', rb.ok === false && rb.code === 'not-logged-in', rb);
    ok('★★通信していない', h.calls.length === 0);
    const r = await h.api().resumeBlocked(SLOT, { confirmStale: true });
    ok('★削除も止まる', r.ok === false && r.code === 'cloud-tombstone-unconfirmed', r.code);
    ok('★★データは無傷', h.store['chr6_slot_' + SLOT] === BODY_NOW);
  }
}

console.log('\n== (11) ★もう消えている物語は「済み」として扱う（永久に片づかないを作らない） ==');
{
  const h = mkEnv({ dropSeed: ['chr6_slot_' + SLOT, 'v292Dfix77States_slot_' + SLOT] });
  const r = await h.api().resumeBlocked(SLOT, { confirmStale: true });
  ok('★already-deleted', r.ok === true && r.code === 'already-deleted', r);
  ok('★復元セットを新しく作っていない（無駄に容量を使わない）', h.snapCalls.length === 0);
  ok('★ゲートも呼んでいない', h.gateCalls.length === 0);
}

console.log('\n== (11b) ★本体が既に無くサイドストアだけ残る場合も、戻り道を作ってから消す ==');
{
  const h = mkEnv({ dropSeed: ['chr6_slot_' + SLOT] });
  const r = await h.api().resumeBlocked(SLOT, { confirmStale: true });
  ok('★消えた', r.ok === true && r.code === 'deleted', r);
  ok('★★fix564 は本体不在で断り、同レイアウトのフォールバックで撮った',
     r.recoveryFallback === true, { snapCalls: h.snapCalls.length, r });
  ok('★★復元セットIDは fix564 と同じ名前空間（fix564.verify/restore が使える）',
     String(r.snapshotId).indexOf('chr6_snap_' + SLOT + '_') === 0, r.snapshotId);
  const man = JSON.parse(h.store[r.snapshotId]);
  ok('★★manifest は fix564 の形（complete / parts / snapKey）',
     man.complete === true && !!man.parts['v292Dfix77States_slot_' + SLOT].snapKey, man);
  ok('★★消したバイト列が退避されている',
     h.store[man.parts['v292Dfix77States_slot_' + SLOT].snapKey] === SIDE_NOW);
  ok('★reason は fix587 が要求する形', man.reason === 'lifecycle-delete:' + OPID, man.reason);
  ok('★サイドストアは消えている', h.store['v292Dfix77States_slot_' + SLOT] === undefined);
  ok('★ゲート経由で消している', h.gateCalls.length === 1 && h.gateCalls[0].path === 'fix642', h.gateCalls);
}

console.log('\n== (11c) ★フォールバックの退避が書けなければ消さない（容量不足） ==');
{
  const h = mkEnv({ dropSeed: ['chr6_slot_' + SLOT],
                    quotaFor: k => k.indexOf('chr6_snapd_') === 0 });
  const r = await h.api().resumeBlocked(SLOT, { confirmStale: true });
  ok('★snapshot-failed', r.ok === false && r.code === 'snapshot-failed', r);
  ok('★★データは無傷', h.store['v292Dfix77States_slot_' + SLOT] === SIDE_NOW);
  ok('★ゲートで消していない（後始末の呼び出しはあり得るが、計画キーは消さない）',
     h.gateCalls.every(c => c.key.indexOf('chr6_snapd_') === 0), h.gateCalls.map(c => c.key));
}

console.log('\n== (12) ★previewPlan は読むだけ（実行前の確認用） ==');
{
  const h = mkEnv();
  const before = snapshot(h.store);
  const p = h.api().previewPlan(SLOT);
  ok('★消す予定のキーを返す', p.ok === true && p.keys.length === 2, p);
  ok('★★いまのバイト数で見える（旧計画の値ではない）',
     p.keys.filter(k => k.key === 'chr6_slot_' + SLOT)[0].bytes === BODY_NOW.length, p.keys);
  ok('★合計バイトも出す', p.totalBytes === BODY_NOW.length + SIDE_NOW.length, p.totalBytes);
  ok('★墓標と deleteOpId が見える', p.hasTombstone === true && p.deleteOpId === OPID, p);
  ok('★停止理由も見える', p.blocked[0].blockedReason === 'blocked-stale-legacy', p.blocked);
  ok('★★1バイトも書いていない', snapshot(h.store) === before);
  ok('★★通信していない', h.calls.length === 0);
}

console.log('\n== (13) 実装の体裁（配線・OFF・迂回禁止） ==');
{
  const HOME = read('home.html');
  ok('★home.html に fix642 を積んである',
     HOME.indexOf('v292Dfix642-delete-readback.js') > 0);
  ok('★★位置は fix587 より後（依存が先に載る）',
     HOME.indexOf('v292Dfix642-delete-readback.js') > HOME.indexOf('v292Dfix587-story-lifecycle.js'));
  ok('★★index.html には入れない（操作専用。ゲーム画面には要らない）',
     fs.readFileSync(path.join(__dirname, 'index.html'), 'latin1').indexOf('v292Dfix642-delete-readback.js') < 0);
  ok('★cb は home の他モジュールと同じ形式',
     /v292Dfix642-delete-readback\.js\?cb=v292Dfix\d+/.test(HOME),
     (HOME.match(/v292Dfix642-delete-readback\.js\?cb=[^"]*/) || [])[0]);
  const HOME_BUILT = (HOME.match(/HOME_BUILT\s*=\s*'\d{8}-fix(\d+)'/) || [])[1];
  const cb642 = (HOME.match(/v292Dfix642-delete-readback\.js\?cb=v292Dfix(\d+)/) || [])[1];
  ok('★★cb が HOME_BUILT と一致（上げ忘れていない）', !!cb642 && cb642 === HOME_BUILT, { cb642, HOME_BUILT });

  ok('★★OFFスイッチがある', SRC.indexOf('v292Dfix642Off') > 0);
  ok('★★冪等ガードが __v292* 系（fix274 の継承バグの教訓）', /if\s*\(window\.__v292Dfix642\)\s*return/.test(SRC));
  /* コメントを除いた実コードに removeItem / clear の直呼びが無いこと */
  ok('★★localStorage.removeItem を直接呼んでいない', !/\.removeItem\s*\(/.test(CODE), 'removeItem');
  ok('★★localStorage.clear を呼んでいない', !/\.clear\s*\(/.test(CODE));
  ok('★★Storage.prototype を触っていない', !/Storage\s*\.\s*prototype/.test(CODE));
  ok('★★applySave を呼んでいない（pullの事故経路に近づかない）', !/applySave/.test(CODE));
  ok('★★自動実行のフックが無い（addEventListener / setInterval を使わない）',
     !/addEventListener|setInterval/.test(CODE));
  ok('★★読み込み時に自分から通信しない（fetch の呼び出しは read-back の1か所だけ）',
     (CODE.match(/fetch\s*\(/g) || []).length === 1);
}

console.log('\n---------------------------------------------');
console.log('test_fix642: 合格 ' + pass + ' / 失敗 ' + fail);
console.log('pass=' + pass + ' fail=' + fail);
if (fail) process.exitCode = 1;
}

main().catch(e => {
  fail++;
  console.log('  FAIL  例外: ' + (e && e.stack || e));
  console.log('pass=' + pass + ' fail=' + fail);
  process.exitCode = 1;
});
