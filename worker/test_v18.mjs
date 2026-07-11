// fakeD1 tests for Worker v18 (forksafe). Run: node test_v18.mjs
import {
  saveIncomingAsFork, trimForks, idemReserve, idemDone, idemRelease, idemReqHash,
  handleSave, d1Changed
} from './chronicle-proxy-v18_forksafe.js';

// ---------- fakeD1 (pattern-matching, models UNIQUE + meta.changes) ----------
function norm(sql) { return String(sql).replace(/\s+/g, ' ').trim(); }
function uniqueErr(tbl) { return new Error('UNIQUE constraint failed: ' + tbl); }

class Stmt {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...a) { this.args = a; return this; }
  async run() { return this.db._run(this.sql, this.args); }
  async first() { const r = this.db._run(this.sql, this.args); return (r.results && r.results[0]) || null; }
  async all() { const r = this.db._run(this.sql, this.args); return { results: r.results || [] }; }
}
class FakeD1 {
  constructor() { this.saves = []; this.idem = []; this.idem2 = []; this._forkInsertHook = null; this._forkCalls = 0; }
  prepare(sql) { return new Stmt(this, norm(sql)); }
  async exec() { return {}; }                       // CREATE/ALTER/INDEX = no-op
  async batch(stmts) { const out = []; for (const st of stmts) out.push(await st.run()); return out; }
  _findSave(u, kind) { return this.saves.find(r => r.u === u && r.kind === kind); }
  _run(sql, a) {
    const ch = (n, res) => ({ results: res || [], meta: { changes: n } });
    // ---- saves: fork plain INSERT (9 cols) ----
    if (sql.startsWith('INSERT INTO saves (u, kind, rev, baseRev, updatedAt, device, size, blob, createdAt) VALUES')) {
      this._forkCalls++;
      if (this._forkInsertHook) this._forkInsertHook(this._forkCalls, a);   // may throw
      const [u, kind, rev, baseRev, updatedAt, device, size, blob, createdAt] = a;
      if (this._findSave(u, kind)) throw uniqueErr('saves.u, saves.kind');
      this.saves.push({ u, kind, rev, baseRev, updatedAt, device, size, blob, createdAt });
      return ch(1);
    }
    // ---- saves: forceput retention INSERT..SELECT ----
    if (sql.startsWith('INSERT INTO saves (u, kind, rev, baseRev, updatedAt, device, size, blob, createdAt) SELECT')) {
      const [u, bkind, mainKind, createdAt] = a;
      const m = this._findSave(u, mainKind);
      if (!m) return ch(0);
      if (this._findSave(u, bkind)) throw uniqueErr('saves.u, saves.kind');
      this.saves.push({ u, kind: bkind, rev: m.rev, baseRev: m.baseRev, updatedAt: m.updatedAt, device: m.device, size: m.size, blob: m.blob, createdAt });
      return ch(1);
    }
    // ---- saves: INSERT OR IGNORE main RETURNING rev ----
    if (sql.startsWith('INSERT OR IGNORE INTO saves')) {
      const [u, kind, baseRev, updatedAt, device, size, blob] = a;
      if (this._findSave(u, kind)) return ch(0, []);
      this.saves.push({ u, kind, rev: 1, baseRev, updatedAt, device, size, blob, createdAt: null });
      return ch(1, [{ rev: 1 }]);
    }
    // ---- saves: UPDATE main conditional (AND rev=?8) RETURNING rev ----
    if (sql.startsWith('UPDATE saves SET rev=rev+1') && sql.includes('AND rev=?8')) {
      const [u, kind, baseRev, updatedAt, device, size, blob, expectRev] = a;
      const r = this._findSave(u, kind);
      if (!r || r.rev !== expectRev) return ch(0, []);
      r.rev += 1; r.baseRev = baseRev; r.updatedAt = updatedAt; r.device = device; r.size = size; r.blob = blob;
      return ch(1, [{ rev: r.rev }]);
    }
    // ---- saves: UPDATE main unconditional (forceput) RETURNING rev ----
    if (sql.startsWith('UPDATE saves SET rev=rev+1') && sql.includes('WHERE u=?1 AND kind=?2 RETURNING')) {
      const [u, kind, baseRev, updatedAt, device, size, blob] = a;
      const r = this._findSave(u, kind);
      if (!r) return ch(0, []);
      r.rev += 1; r.baseRev = baseRev; r.updatedAt = updatedAt; r.device = device; r.size = size; r.blob = blob;
      return ch(1, [{ rev: r.rev }]);
    }
    // ---- saves: SELECT rev,baseRev,updatedAt,device,size,blob ----
    if (sql.startsWith('SELECT rev, baseRev, updatedAt, device, size, blob FROM saves')) {
      const [u, kind] = a; const r = this._findSave(u, kind);
      return ch(0, r ? [r] : []);
    }
    // ---- saves: SELECT rev,updatedAt,device (main re-select) ----
    if (sql.startsWith('SELECT rev, updatedAt, device FROM saves')) {
      const [u, kind] = a; const r = this._findSave(u, kind);
      return ch(0, r ? [{ rev: r.rev, updatedAt: r.updatedAt, device: r.device }] : []);
    }
    // ---- saves: trimForks SELECT kind ORDER BY COALESCE(createdAt, updatedAt) ----
    if (sql.startsWith('SELECT kind FROM saves') && sql.includes('COALESCE(createdAt, updatedAt)')) {
      const [u, main] = a;
      const rows = this.saves.filter(r => r.u === u && r.kind !== main)
        .map(r => ({ kind: r.kind, _k: (r.createdAt != null ? r.createdAt : r.updatedAt) }))
        .sort((x, y) => y._k - x._k)
        .map(r => ({ kind: r.kind }));
      return ch(0, rows);
    }
    // ---- saves: DELETE by u,kind ----
    if (sql === 'DELETE FROM saves WHERE u=?1 AND kind=?2') {
      const [u, kind] = a; const before = this.saves.length;
      this.saves = this.saves.filter(r => !(r.u === u && r.kind === kind));
      return ch(before - this.saves.length);
    }
    // ---- idem2: INSERT ON CONFLICT DO NOTHING ----
    if (sql.startsWith('INSERT INTO idem2')) {
      const [u, mid, op, reqHash, ts] = a;
      if (this.idem2.find(r => r.u === u && r.mid === mid)) return ch(0);
      this.idem2.push({ u, mid, op, reqHash, status: 'processing', res: null, ts });
      return ch(1);
    }
    // ---- idem2: SELECT op,reqHash,status,res,ts ----
    if (sql.startsWith('SELECT op, reqHash, status, res, ts FROM idem2')) {
      const [u, mid] = a; const r = this.idem2.find(x => x.u === u && x.mid === mid);
      return ch(0, r ? [{ op: r.op, reqHash: r.reqHash, status: r.status, res: r.res, ts: r.ts }] : []);
    }
    // ---- idem2: DELETE processing (specific) ----
    if (sql === "DELETE FROM idem2 WHERE u=?1 AND mid=?2 AND status='processing'") {
      const [u, mid] = a; const before = this.idem2.length;
      this.idem2 = this.idem2.filter(r => !(r.u === u && r.mid === mid && r.status === 'processing'));
      return ch(before - this.idem2.length);
    }
    // ---- idem2: DELETE by u,mid ----
    if (sql === 'DELETE FROM idem2 WHERE u=?1 AND mid=?2') {
      const [u, mid] = a; const before = this.idem2.length;
      this.idem2 = this.idem2.filter(r => !(r.u === u && r.mid === mid));
      return ch(before - this.idem2.length);
    }
    // ---- idem2: DELETE ts GC ----
    if (sql === 'DELETE FROM idem2 WHERE ts < ?1') {
      const [t] = a; const before = this.idem2.length;
      this.idem2 = this.idem2.filter(r => !(r.ts < t));
      return ch(before - this.idem2.length);
    }
    // ---- idem2: UPDATE done ----
    if (sql.startsWith("UPDATE idem2 SET status='done'")) {
      const [u, mid, res, ts] = a; const r = this.idem2.find(x => x.u === u && x.mid === mid);
      if (!r) return ch(0);
      r.status = 'done'; r.res = res; r.ts = ts; return ch(1);
    }
    // ---- idem (old table) SELECT res ----
    if (sql.startsWith('SELECT res FROM idem WHERE')) {
      const [u, mid] = a; const r = this.idem.find(x => x.u === u && x.mid === mid);
      return ch(0, r ? [{ res: r.res }] : []);
    }
    throw new Error('fakeD1: unmatched SQL: ' + sql);
  }
}
class FakeKV { constructor() { this.m = new Map(); } async get(k) { return this.m.has(k) ? this.m.get(k) : null; } async put(k, v) { this.m.set(k, String(v)); } }
function mkCtx() { return { _p: [], waitUntil(p) { this._p.push(Promise.resolve(p).catch(() => {})); } }; }
async function flush(ctx) { await Promise.all(ctx._p); ctx._p = []; }
const REQ = new Request('https://x/save', { method: 'POST' });

// ---------- test harness ----------
let pass = 0, fail = 0; const lines = [];
function ok(name, cond, extra) { if (cond) { pass++; lines.push('PASS ' + name); } else { fail++; lines.push('FAIL ' + name + (extra ? ' :: ' + extra : '')); } }

async function run() {
  // ===== 1: fork INSERT always non-UNIQUE throw -> 503 & idem released & no done =====
  {
    const db = new FakeD1(); const env = { DB: db }; const ctx = mkCtx();
    const user = 'u1', mid = 'k1';
    const rz = await idemReserve(env, user, mid, 'put', idemReqHash('put', 's'));
    db._forkInsertHook = () => { throw new Error('disk I/O error'); };
    const o = { user, pkg: { device: 'd', updatedAt: 100 }, str: '{}', curRev: 2, baseRev: 1, curUpdatedAt: 50, curDevice: 'd', ns: 'ns', requestId: 'rq1', mid };
    const resp = await saveIncomingAsFork(REQ, env, ctx, o);
    const j = await resp.json(); await flush(ctx);
    ok('1 status 503', resp.status === 503, 'got ' + resp.status);
    ok('1 ok:false fork-save-failed', j.ok === false && j.errorCode === 'fork-save-failed' && j.retryable === true, JSON.stringify(j));
    ok('1 idem released (no row)', db.idem2.length === 0, JSON.stringify(db.idem2));
    ok('1 no done left', !db.idem2.some(r => r.status === 'done'), '');
    ok('1 reserve owned', rz.owned === true, '');
  }
  // ===== 2: fork INSERT 1st UNIQUE -> 2nd success =====
  {
    const db = new FakeD1(); const env = { DB: db }; const ctx = mkCtx();
    const user = 'u2', mid = 'k2';
    await idemReserve(env, user, mid, 'put', idemReqHash('put', 's'));
    db._forkInsertHook = (n) => { if (n === 1) throw uniqueErr('saves'); };  // 1st throws UNIQUE, 2nd real insert
    const t0 = Date.now();
    const o = { user, pkg: { device: 'd2', updatedAt: 100 }, str: '{"a":1}', curRev: 3, baseRev: 2, curUpdatedAt: 60, curDevice: 'd2', ns: 'ns', requestId: 'rq2', mid };
    const resp = await saveIncomingAsFork(REQ, env, ctx, o);
    const j = await resp.json(); await flush(ctx);
    const forks = db.saves.filter(r => r.u === user && r.kind !== 'main');
    ok('2 ok:true fork:true', j.ok === true && j.fork === true, JSON.stringify(j));
    ok('2 saves 1 fork row', forks.length === 1, 'n=' + forks.length);
    ok('2 createdAt ~ now', forks.length === 1 && forks[0].createdAt >= t0 && forks[0].createdAt <= Date.now() + 5, 'ca=' + (forks[0] && forks[0].createdAt));
    ok('2 idem2 done recorded', db.idem2.some(r => r.mid === mid && r.status === 'done'), JSON.stringify(db.idem2));
  }
  // ===== 3: both fork INSERT fail -> 503 =====
  {
    const db = new FakeD1(); const env = { DB: db }; const ctx = mkCtx();
    const user = 'u3', mid = 'k3';
    await idemReserve(env, user, mid, 'put', idemReqHash('put', 's'));
    db._forkInsertHook = (n) => { if (n === 1) throw uniqueErr('saves'); throw new Error('disk full'); };
    const o = { user, pkg: { device: 'd3', updatedAt: 100 }, str: '{}', curRev: 1, baseRev: 0, curUpdatedAt: 1, curDevice: 'd3', ns: 'ns', requestId: 'rq3', mid };
    const resp = await saveIncomingAsFork(REQ, env, ctx, o);
    const j = await resp.json(); await flush(ctx);
    ok('3 status 503', resp.status === 503 && j.errorCode === 'fork-save-failed', resp.status + ' ' + JSON.stringify(j));
    ok('3 idem released', db.idem2.length === 0, JSON.stringify(db.idem2));
  }
  // ===== 4: trimForks createdAt priority =====
  {
    const db = new FakeD1(); const env = { DB: db }; const user = 'u4';
    db.saves.push({ u: user, kind: 'fork:KEEP', rev: 0, baseRev: 0, updatedAt: 1, device: 'x', size: 0, blob: '{}', createdAt: 1000000 });
    db.saves.push({ u: user, kind: 'fork:X', rev: 0, baseRev: 0, updatedAt: 999, device: 'x', size: 0, blob: '{}', createdAt: 5 });
    db.saves.push({ u: user, kind: 'fork:Y', rev: 0, baseRev: 0, updatedAt: 998, device: 'x', size: 0, blob: '{}', createdAt: 4 });
    db.saves.push({ u: user, kind: 'fork:Z', rev: 0, baseRev: 0, updatedAt: 997, device: 'x', size: 0, blob: '{}', createdAt: 3 });
    await trimForks(env, user);
    const kinds = db.saves.filter(r => r.u === user).map(r => r.kind);
    ok('4 KEEP survives (new createdAt, old updatedAt)', kinds.includes('fork:KEEP'), kinds.join(','));
    ok('4 Z trimmed (old createdAt, newer updatedAt)', !kinds.includes('fork:Z'), kinds.join(','));
    ok('4 exactly 3 kept', kinds.length === 3, 'n=' + kinds.length);
  }
  // ===== 5: concurrent reserve same mid -> one owned, other processing =====
  {
    const db = new FakeD1(); const env = { DB: db }; const user = 'u5', mid = 'k5';
    const h = idemReqHash('put', 'same');
    const a = await idemReserve(env, user, mid, 'put', h);
    const b = await idemReserve(env, user, mid, 'put', h);
    ok('5 first owned', a.owned === true, JSON.stringify(a));
    ok('5 second processing', b.processing === true && !b.owned, JSON.stringify(b));
  }
  // ===== 6: same mid, different op/reqHash -> conflict =====
  {
    const db = new FakeD1(); const env = { DB: db }; const user = 'u6', mid = 'k6';
    await idemReserve(env, user, mid, 'put', idemReqHash('put', 'A'));
    const diffHash = await idemReserve(env, user, mid, 'put', idemReqHash('put', 'B'));
    const diffOp = await idemReserve(env, user, mid, 'putimg', idemReqHash('putimg', 'A'));
    ok('6 diff reqHash -> conflict', diffHash.conflict === true, JSON.stringify(diffHash));
    ok('6 diff op -> conflict', diffOp.conflict === true, JSON.stringify(diffOp));
  }
  // ===== 7: done then same mid -> replay =====
  {
    const db = new FakeD1(); const env = { DB: db }; const user = 'u7', mid = 'k7';
    const h = idemReqHash('put', 'P');
    await idemReserve(env, user, mid, 'put', h);
    await idemDone(env, user, mid, { ok: true, rev: 5, foo: 'bar' });
    const r = await idemReserve(env, user, mid, 'put', h);
    ok('7 replay', r.replay && r.replay.replayed === true && r.replay.rev === 5, JSON.stringify(r));
  }
  // ===== 8: expired done -> reprocess (re-reserve) =====
  {
    const db = new FakeD1(); const env = { DB: db }; const user = 'u8', mid = 'k8';
    const h = idemReqHash('put', 'Q');
    await idemReserve(env, user, mid, 'put', h);
    await idemDone(env, user, mid, { ok: true, rev: 9 });
    const row = db.idem2.find(r => r.mid === mid); row.ts = Date.now() - 90000000;  // >24h old
    const r = await idemReserve(env, user, mid, 'put', h);
    ok('8 expired -> owned (reprocess)', r.owned === true, JSON.stringify(r));
    ok('8 row reset to processing', db.idem2.find(x => x.mid === mid).status === 'processing', '');
  }
  // ===== 9: processing -> release -> resend reprocesses =====
  {
    const db = new FakeD1(); const env = { DB: db }; const user = 'u9', mid = 'k9';
    const h = idemReqHash('put', 'R');
    const a = await idemReserve(env, user, mid, 'put', h);
    await idemRelease(env, user, mid);
    const b = await idemReserve(env, user, mid, 'put', h);
    ok('9 released allows reprocess', a.owned === true && b.owned === true, JSON.stringify(a) + ' ' + JSON.stringify(b));
  }
  // ===== 10: non-regression normal put via handleSave (ok, rev+1) =====
  {
    const db = new FakeD1(); const env = { DB: db, LEDGER: new FakeKV(), ACCESS_CODE: 'secret' };
    const bodyStr = {};  // fixed payload per mid (real replay sends identical body)
    const mkReq = (mid) => {
      if (!bodyStr[mid]) bodyStr[mid] = JSON.stringify({ op: 'put', pkg: { updatedAt: 1700000000000, device: 'dev1', foo: 'bar' }, mid });
      return new Request('https://x/save', {
        method: 'POST',
        headers: { 'x-chronicle-pass': 'secret', 'Content-Type': 'application/json' },
        body: bodyStr[mid]
      });
    };
    const ctx = mkCtx();
    const r1 = await handleSave(mkReq('m10a'), env, ctx); const j1 = await r1.json(); await flush(ctx);
    const r2 = await handleSave(mkReq('m10b'), env, ctx); const j2 = await r2.json(); await flush(ctx);
    ok('10 first put ok rev1', j1.ok === true && j1.rev === 1, JSON.stringify(j1));
    ok('10 second put ok rev2 (rev+1)', j2.ok === true && j2.rev === 2, JSON.stringify(j2));
    // replay same mid returns done response
    const r1b = await handleSave(mkReq('m10a'), env, ctx); const j1b = await r1b.json(); await flush(ctx);
    ok('10 replay same mid', j1b.ok === true && j1b.replayed === true, JSON.stringify(j1b));
  }

  console.log(lines.join('\n'));
  console.log('\n==== ' + pass + ' passed, ' + fail + ' failed ====');
  if (fail) process.exit(1);
}
run().catch(e => { console.error('THREW', e); process.exit(2); });
