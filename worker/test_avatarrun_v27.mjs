// test_avatarrun_v27.mjs — fix476標準ON基盤(run予約)の単体テスト
// 実SQLite(node:sqlite)でD1を模したアダプタ + vmでWorker内部関数を露出して検証。
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

// ---- D1アダプタ(node:sqlite) ----
class D1Stmt {
  constructor(db, sql){ this.db = db; this.sql = sql; this.args = []; }
  bind(...a){ this.args = a.map(v => v === undefined ? null : v); return this; }
  async first(){ const r = this.db.prepare(this.sql).get(...this.args); return (r === undefined ? null : r); }
  async run(){ const info = this.db.prepare(this.sql).run(...this.args); return { success: true, meta: info }; }
  async all(){ return { results: this.db.prepare(this.sql).all(...this.args) }; }
  _runSync(){ return this.db.prepare(this.sql).run(...this.args); }
}
class D1 {
  constructor(){ this.db = new DatabaseSync(':memory:'); }
  async exec(sql){ this.db.exec(sql); }
  prepare(sql){ return new D1Stmt(this.db, sql); }
  async batch(stmts){ this.db.exec('BEGIN'); try { const r = stmts.map(s => s._runSync()); this.db.exec('COMMIT'); return r; } catch(e){ try{this.db.exec('ROLLBACK');}catch(_){} throw e; } }
}

// ---- Workerソースをvmで評価して内部関数を露出 ----
const src = readFileSync(new URL('./chronicle-proxy-v21_avatarguard.js', import.meta.url), 'utf8')
  .replace('export default {', 'globalThis.__worker = {')
  .replace(/^export\s*\{[^}]*\};?\s*$/gm, '')       // named exportリストを無効化
  .replace(/^export\s+(const|let|var|function|async\s+function|class)\s/gm, '$1 ');  // export const/function... → 普通の宣言
const ctx = vm.createContext({
  crypto, TextEncoder, TextDecoder, URL, Request, Response, Headers,
  btoa, atob, console, Date, Math, JSON, Object, Array, String, Number, Boolean, isFinite, parseInt, parseFloat, globalThis: null
});
ctx.globalThis = ctx;
vm.runInContext(src, ctx, { filename: 'worker.js' });

const handleAvatarRun = ctx.handleAvatarRun;
const ownerHashOf = ctx.ownerHashOf;
const sha256hex = ctx.sha256hex;

// ---- テスト基盤 ----
let pass = 0, fail = 0; const fails = [];
function ok(cond, name){ if (cond){ pass++; } else { fail++; fails.push(name); console.log('  ✗ ' + name); } }
const ctxObj = { waitUntil(){} };
function reqFor(){ return new Request('https://novel-proxy.example/avatar-run', { method:'POST', headers:{ origin:'https://x' } }); }
function gate(codeKey='code:alice', guard=true, extra={}){ return { ok:true, codeKey, config: Object.assign({ fix476Guard: guard }, extra) }; }
async function call(body, g){ const res = await handleAvatarRun(reqFor(), body, { DB: DB }, ctxObj, g || gate()); return { status: res.status, body: await res.json() }; }

// 各テストで新しいDB(=クリーン)を使うため、d1初期化ガードをリセットできない問題に対処:
// __d1init はモジュール内lexicalで外から触れない。→ 単一DBで通し、テスト間はowner/clientReqIdを変えて分離。
const DB = new D1();

console.log('=== test_avatarrun_v27 ===');

// 1) reserve guard OFF → {guard:false}
{
  const r = await call({ op:'reserve', clientRequestId:'c1' }, gate('code:alice', false));
  ok(r.status===200 && r.body.guard===false && r.body.ok===true, '1 reserve guardOFF→{guard:false}');
}
// 2) reserve guard ON → runId発行
let run2;
{
  const r = await call({ op:'reserve', clientRequestId:'c2', kind:'human', promptHash:'ph', desc:'d', canonicalVersion:'style6-v2', characterPk:'pk2' });
  run2 = r.body.runId;
  ok(r.status===200 && r.body.guard===true && !!r.body.runId && r.body.reused===false && r.body.maxImages===6 && r.body.maxInspects===6, '2 reserve guardON→runId');
}
// 3) reserve 同一clientReqId → reused:true 同一runId
{
  const r = await call({ op:'reserve', clientRequestId:'c2' });
  ok(r.status===200 && r.body.reused===true && r.body.runId===run2, '3 reserve同一→reused同一runId');
}
// 4) reserve 別clientReqId(同owner・c2生存中) → 429 run-in-flight
{
  const r = await call({ op:'reserve', clientRequestId:'c3' });
  ok(r.status===429 && r.body.errorCode==='run-in-flight', '4 別reqで同時run→429');
}
// 5) status → reserved
{
  const r = await call({ op:'status', runId: run2 });
  ok(r.status===200 && r.body.state==='reserved' && r.body.imageCount===0 && r.body.expired===false, '5 status→reserved');
}
// 6) commit 候補なし → 404 no-candidate
{
  const r = await call({ op:'commit', runId: run2, candidateId:'nope' });
  ok(r.status===404 && r.body.errorCode==='no-candidate', '6 commit候補なし→404');
}
// 7) 候補(generated)を直接投入 → commitは 409 not-passed
{
  await DB.prepare("INSERT INTO avatar_candidates (candidate_id, run_id, slot, seed, state, image_sha256, provider, hard_fails, score, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .bind('cand-gen', run2, 0, 111, 'generated', 'abc', 'pollinations', 0, 90, Date.now()).run();
  const r = await call({ op:'commit', runId: run2, candidateId:'cand-gen' });
  ok(r.status===409 && r.body.errorCode==='not-passed', '7 commit未合格→409');
}
// 8) 候補をpassedに更新 → commit成功
{
  await DB.prepare("UPDATE avatar_candidates SET state='passed' WHERE candidate_id=?").bind('cand-gen').run();
  const r = await call({ op:'commit', runId: run2, candidateId:'cand-gen' });
  ok(r.status===200 && r.body.ok===true && r.body.winnerCandidateId==='cand-gen' && r.body.imageSha256==='abc' && r.body.seed===111, '8 commit合格→採用');
}
// 9) commit冪等 → reused:true
{
  const r = await call({ op:'commit', runId: run2, candidateId:'cand-gen' });
  ok(r.status===200 && r.body.reused===true && r.body.winnerCandidateId==='cand-gen', '9 commit冪等→reused');
}
// 9b) run状態がcommittedに / 候補がadopted
{
  const run = await DB.prepare("SELECT state, winner_candidate_id FROM avatar_runs WHERE run_id=?").bind(run2).first();
  const cand = await DB.prepare("SELECT state FROM avatar_candidates WHERE candidate_id=?").bind('cand-gen').first();
  ok(run.state==='committed' && run.winner_candidate_id==='cand-gen' && cand.state==='adopted', '9b DB状態 committed/adopted');
}
// 10) commit済clientReqIdで再reserve → 新run(reused:false・古い候補は掃除)
let run10;
{
  const r = await call({ op:'reserve', clientRequestId:'c2' });
  run10 = r.body.runId;
  const oldCand = await DB.prepare("SELECT COUNT(*) AS n FROM avatar_candidates WHERE run_id=?").bind(run2).first();
  ok(r.status===200 && r.body.reused===false && r.body.runId!==run2 && (+oldCand.n)===0, '10 commit後の再reserve→新run+旧候補掃除');
}
// 11) release(reserved) → released
{
  const r = await call({ op:'release', runId: run10 });
  const run = await DB.prepare("SELECT state FROM avatar_runs WHERE run_id=?").bind(run10).first();
  ok(r.status===200 && r.body.state==='released' && run.state==='released', '11 release→released');
}
// 12) owner不一致 → 404 no-run(別ユーザーがrun10を触る)
{
  const r = await call({ op:'status', runId: run10 }, gate('code:mallory'));
  ok(r.status===404 && r.body.errorCode==='no-run', '12 owner不一致→404');
}
// 13) 期限切れrun → commit 409 run-expired
{
  const rr = await call({ op:'reserve', clientRequestId:'c-exp', kind:'human', promptHash:'p', desc:'d' });
  const rid = rr.body.runId;
  await DB.prepare("INSERT INTO avatar_candidates (candidate_id, run_id, slot, seed, state, image_sha256, created_at) VALUES (?,?,?,?,?,?,?)")
    .bind('cand-exp', rid, 0, 1, 'passed', 'z', Date.now()).run();
  await DB.prepare("UPDATE avatar_runs SET expires_at=? WHERE run_id=?").bind(Date.now()-1000, rid).run();
  const r = await call({ op:'commit', runId: rid, candidateId:'cand-exp' });
  ok(r.status===409 && r.body.errorCode==='run-expired', '13 期限切れcommit→409');
}
// 13b) 期限切れrunがある状態で同owner新clientReqId reserve → in-flightにカウントされず成功
{
  const r = await call({ op:'reserve', clientRequestId:'c-after-exp' }, gate('code:expuser'));
  // 別ownerにしたので独立。期限切れがin-flight除外されることは c-exp と同ownerで別途確認:
  const r2 = await call({ op:'reserve', clientRequestId:'c-exp2' }, gate('code:alice'));
  // aliceのc2はcommitted, c-* は他owner。aliceに生存reservedは無い→成功するはず
  ok(r.status===200 && r.body.ok===true && r2.status===200 && r2.body.ok===true, '13b 期限切れ/確定済はin-flight除外');
}
// 14) reserve clientRequestId欠落 → 400
{
  const r = await call({ op:'reserve' }, gate('code:bob'));
  ok(r.status===400 && r.body.errorCode==='bad-req', '14 clientReqId欠落→400');
}
// 15) unknown op(存在するrun) → 400 bad-op
{
  const rr = await call({ op:'reserve', clientRequestId:'c-unknown' }, gate('code:carol'));
  const r = await call({ op:'frobnicate', runId: rr.body.runId }, gate('code:carol'));
  ok(r.status===400 && r.body.errorCode==='bad-op', '15 unknown op→400');
}
// 16) commit runId欠落 → 400
{
  const r = await call({ op:'commit', candidateId:'x' });
  ok(r.status===400 && r.body.errorCode==='bad-req', '16 runId欠落→400');
}
// 17) ownerHashOf(HMAC): 決定的・32字・codeKey非露出・鍵で変わる
{
  const env1 = { ADMIN_TOKEN: 'secretA' };
  const env2 = { ADMIN_TOKEN: 'secretB' };
  const a = await ownerHashOf(env1, 'code:alice');
  const b = await ownerHashOf(env1, 'code:alice');
  const c = await ownerHashOf(env1, 'code:bob');
  const d = await ownerHashOf(env2, 'code:alice');
  ok(a===b && a!==c && a!==d && a.length===32 && /^[0-9a-f]+$/.test(a) && a.indexOf('alice')<0, '17 ownerHash(HMAC)決定的/32字/鍵依存/非露出');
}
// 18) sha256hex 既知ベクタ("abc")
{
  const h = await sha256hex('abc');
  ok(h==='ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', '18 sha256hex("abc")既知ベクタ');
}
// 19) guard OFF時は commit も通常どおり動く(ガードは reserve の分岐のみ・既存runは尊重)
{
  // guard OFFのownerでreserve→guard:falseなのでrunは作られない。statusはrunなし404。
  const r = await call({ op:'status', runId:'ghost' }, gate('code:nobody', false));
  ok(r.status===404 && r.body.errorCode==='no-run', '19 guardOFFでも存在しないrunは404');
}
// 20) D1未バインド → 503
{
  const res = await handleAvatarRun(reqFor(), { op:'reserve', clientRequestId:'z' }, { /* no DB */ }, ctxObj, gate());
  ok(res.status===503, '20 D1未バインド→503');
}
// 21) ★原子性: 部分ユニークindex avatar_runs_one_active が同ownerの2本目activeを弾く(直接INSERT)
{
  const oh = await ownerHashOf({}, 'code:atomic');
  const ins = (rid, st) => DB.prepare("INSERT INTO avatar_runs (run_id, owner_hash, client_request_id, prompt_hash, kind, description, provider, state, created_at, expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .bind(rid, oh, 'creq-'+rid, 'p', 'human', 'd', 'auto', st, Date.now(), Date.now()+300000).run();
  await ins('atomic-1', 'reserved');
  let threw = false;
  try { await ins('atomic-2', 'active'); } catch(e){ threw = true; }
  // 3本目: 別ownerなら通る(indexはowner単位)
  const oh2 = await ownerHashOf({}, 'code:atomic2');
  let ok2 = true;
  try { await DB.prepare("INSERT INTO avatar_runs (run_id, owner_hash, client_request_id, prompt_hash, kind, description, provider, state, created_at, expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .bind('atomic-3', oh2, 'creq-3', 'p', 'human', 'd', 'auto', 'reserved', Date.now(), Date.now()+300000).run(); } catch(e){ ok2 = false; }
  ok(threw && ok2, '21 部分ユニークindexが同owner2本目activeを弾く/別ownerは通す');
}
// 22) 期限切れreservedがindexを占有していても reserve は掃いて成功(TTL回復・別clientReqId)
{
  const g = gate('code:ttluser');
  const r1 = await call({ op:'reserve', clientRequestId:'t1' }, g);   // active 1本
  const oh = await ownerHashOf({}, 'code:ttluser');
  await DB.prepare("UPDATE avatar_runs SET expires_at=? WHERE run_id=?").bind(Date.now()-1000, r1.body.runId).run();  // 期限切れ化(state=reservedのまま=index占有)
  const r2 = await call({ op:'reserve', clientRequestId:'t2' }, g);   // 別reqId・掃いて成功するはず
  ok(r1.status===200 && r2.status===200 && r2.body.ok===true && r2.body.runId!==r1.body.runId, '22 期限切れreservedを掃いて新reserve成功');
}

// 23) canary: 全体OFFでも fix476GuardUsers に載る codeKey は guard:true
{
  const r = await call({ op:'reserve', clientRequestId:'can1' }, gate('code:canary', false, { fix476GuardUsers:['code:canary'] }));
  ok(r.status===200 && r.body.guard===true && !!r.body.runId, '23 canary名簿ユーザーは全体OFFでもguard:true');
}
// 24) canary外は全体OFFなら guard:false
{
  const r = await call({ op:'reserve', clientRequestId:'non1' }, gate('code:nonlisted', false, { fix476GuardUsers:['code:someoneelse'] }));
  ok(r.status===200 && r.body.guard===false, '24 名簿外は全体OFFでguard:false');
}
console.log(`\n${pass} passed, ${fail} failed` + (fails.length ? `\nFAILURES:\n - ${fails.join('\n - ')}` : ''));
process.exit(fail ? 1 : 0);
