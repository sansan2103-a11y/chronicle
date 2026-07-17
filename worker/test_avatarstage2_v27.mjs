// test_avatarstage2_v27.mjs — fix476標準ON Stage2(ライブ結合)の単体テスト
// avatarClaimSlot / avatarFinalize / handleAvatarInspect を実SQLite(D1模擬)+VLMモックで検証。
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

// ---- D1アダプタ ----
class D1Stmt {
  constructor(db, sql){ this.db=db; this.sql=sql; this.args=[]; }
  bind(...a){ this.args=a.map(v=>v===undefined?null:v); return this; }
  async first(){ const r=this.db.prepare(this.sql).get(...this.args); return r===undefined?null:r; }
  async run(){ return { success:true, meta:this.db.prepare(this.sql).run(...this.args) }; }
  async all(){ return { results:this.db.prepare(this.sql).all(...this.args) }; }
  _runSync(){ return this.db.prepare(this.sql).run(...this.args); }
}
class D1 {
  constructor(){ this.db=new DatabaseSync(':memory:'); }
  async exec(sql){ this.db.exec(sql); }
  prepare(sql){ return new D1Stmt(this.db, sql); }
  async batch(stmts){ this.db.exec('BEGIN'); try { const r=stmts.map(s=>s._runSync()); this.db.exec('COMMIT'); return r; } catch(e){ try{this.db.exec('ROLLBACK');}catch(_){} throw e; } }
}

// ---- VLMモック(fetch差し替え) ----
let mockVlm = { single_person:true, face_clear:true, anime_style:true, desc_match_gender:null, desc_match_age_band:null, desc_match_hair:null, desc_match_clothing:null, front_or_three_quarter:true,
  no_text_or_watermark:true, no_severe_artifacts:true, chest_up_bust:true, dark_background:true, muted_colors:true };
async function mockFetch(url, opts){
  const u = String(url||'');
  if (u.indexOf('openrouter') >= 0 || /chat\/completions/.test(u)) {
    const content = JSON.stringify({ results:[ mockVlm ] });
    return new Response(JSON.stringify({ choices:[ { message:{ content } } ] }), { status:200, headers:{ 'Content-Type':'application/json' } });
  }
  return new Response('{}', { status:200, headers:{ 'Content-Type':'application/json' } });
}

// ---- Workerをvmで露出 ----
const src = readFileSync(new URL('./chronicle-proxy-v21_avatarguard.js', import.meta.url), 'utf8')
  .replace('export default {', 'globalThis.__worker = {')
  .replace(/^export\s*\{[^}]*\};?\s*$/gm, '')
  .replace(/^export\s+(const|let|var|function|async\s+function|class)\s/gm, '$1 ');
const ctx = vm.createContext({
  crypto, TextEncoder, TextDecoder, URL, Request, Response, Headers, fetch: mockFetch,
  btoa, atob, console, Date, Math, JSON, Object, Array, String, Number, Boolean, isFinite, parseInt, parseFloat, setTimeout, globalThis:null
});
ctx.globalThis = ctx;
vm.runInContext(src, ctx, { filename:'worker.js' });
const { handleAvatarRun, handleAvatarInspect, avatarClaimSlot, avatarFinalize, ownerHashOf, sha256hexBytes, b64ToBytes } = ctx;

// ---- テスト基盤 ----
let pass=0, fail=0; const fails=[];
function ok(c,n){ if(c) pass++; else { fail++; fails.push(n); console.log('  ✗ '+n); } }
const ctxObj = { waitUntil(){} };
const LEDGER = { _m:new Map(), async get(k){ return this._m.get(k)||null; }, async put(k,v){ this._m.set(k,v); }, async delete(k){ this._m.delete(k); } };
const DB = new D1();
const env = { DB, LEDGER, OPENROUTER_KEY:'sk-test', ADMIN_TOKEN:'admtok' };
function req(){ return new Request('https://x/avatar', { method:'POST', headers:{ origin:'https://x' } }); }
function gate(codeKey='code:u1', guard=true){ return { ok:true, codeKey, config:{ fix476Guard:guard } }; }

// 有効な1x1 PNG(validB64Image通過・PNG magic)
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PNG2 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
function jsonResp(obj){ return new Response(JSON.stringify(obj), { status:200, headers:{ 'Content-Type':'application/json' } }); }

async function reserve(g, creq){ const r = await handleAvatarRun(req(), { op:'reserve', clientRequestId:creq, kind:'human', promptHash:'p', desc:'a young woman with black hair' }, env, ctxObj, g); return r.json ? await r.json() : null; }
async function claim(g, runId, slot, seed){ return await avatarClaimSlot(env, g, { runId, slot, seed }); }
async function inspect(g, runId, candidateId, image){ const r = await handleAvatarInspect(req(), { runId, candidateId, image }, env, ctxObj, g); return { status:r.status, body: await r.json() }; }

console.log('=== test_avatarstage2_v27 ===');

// 1) claim: 正常 → candidateId発番・candidate reserved
const g1 = gate('code:u1');
const run1 = await reserve(g1, 's1');
let cand1;
{
  const c = await claim(g1, run1.runId, 0, 101);
  cand1 = c.candidateId;
  const row = await DB.prepare("SELECT * FROM avatar_candidates WHERE candidate_id=?").bind(cand1).first();
  ok(!c.error && !!cand1 && row && row.state==='reserved' && row.slot===0 && row.seed===101, '1 claim正常→candidate reserved');
}
// 2) claim: slot範囲外 → 400
{
  const c = await claim(g1, run1.runId, 9, 1);
  ok(c.error && c.status===400 && c.error.errorCode==='bad-slot', '2 slot範囲外→400');
}
// 3) claim: 同slot二重 → 409 slot-claimed(二重生成防止)
{
  const c = await claim(g1, run1.runId, 0, 999);
  ok(c.error && c.status===409 && c.error.errorCode==='slot-claimed', '3 同slot二重→409');
}
// 4) claim: 別owner → 404
{
  const c = await claim(gate('code:other'), run1.runId, 1, 1);
  ok(c.error && c.status===404 && c.error.errorCode==='no-run', '4 別owner→404');
}
// 5) claim: slot3は再バッチ未解放 → 409 rebatch-locked
{
  const c = await claim(g1, run1.runId, 3, 1);
  ok(c.error && c.status===409 && c.error.errorCode==='rebatch-locked', '5 slot3未解放→409');
}
// 6) finalize: 成功JSON応答 → candidate generated + image_sha256 + 応答にcandidateId
let sha1;
{
  const claimObj = { candidateId: cand1, runId: run1.runId, slot:0, seed:101 };
  const resp = jsonResp({ data:[{ b64_json: PNG }], provider:'pollinations', fallback:false });
  const out = await avatarFinalize(env, ctxObj, claimObj, resp, req());
  const j = await out.json();
  sha1 = await sha256hexBytes(b64ToBytes(PNG));
  const row = await DB.prepare("SELECT * FROM avatar_candidates WHERE candidate_id=?").bind(cand1).first();
  const runRow = await DB.prepare("SELECT image_count FROM avatar_runs WHERE run_id=?").bind(run1.runId).first();
  ok(out.status===200 && j.candidateId===cand1 && j.imageSha256===sha1 && j.data[0].b64_json===PNG
     && row.state==='generated' && row.image_sha256===sha1 && runRow.image_count===1, '6 finalize成功→generated+sha+image_count');
}
// 7) finalize: 失敗応答(502) → candidate failed・元応答返す・image_count不変
{
  const c2 = await claim(g1, run1.runId, 1, 202);
  const resp = new Response(JSON.stringify({ error:'poll fail' }), { status:502, headers:{ 'Content-Type':'application/json' } });
  const out = await avatarFinalize(env, ctxObj, c2, resp, req());
  const row = await DB.prepare("SELECT state FROM avatar_candidates WHERE candidate_id=?").bind(c2.candidateId).first();
  const runRow = await DB.prepare("SELECT image_count FROM avatar_runs WHERE run_id=?").bind(run1.runId).first();
  ok(out.status===502 && row.state==='failed' && runRow.image_count===1, '7 finalize失敗→failed+image_count不変');
}
// 8) avatar-inspect: 正常(SHA一致・VLM pass) → passed・inspect_count++
{
  mockVlm = { single_person:true, face_clear:true, anime_style:true, desc_match_gender:null, desc_match_age_band:null, desc_match_hair:null, desc_match_clothing:null, front_or_three_quarter:true, no_text_or_watermark:true, no_severe_artifacts:true, chest_up_bust:true, dark_background:true, muted_colors:true };
  const r = await inspect(g1, run1.runId, cand1, PNG);
  const row = await DB.prepare("SELECT state, pass FROM avatar_candidates WHERE candidate_id=?").bind(cand1).first();
  const runRow = await DB.prepare("SELECT inspect_count FROM avatar_runs WHERE run_id=?").bind(run1.runId).first();
  ok(r.status===200 && r.body.ok===true && r.body.result.pass===true && row.state==='passed' && row.pass===1 && runRow.inspect_count===1, '8 avatar-inspect合格→passed+count');
}
// 9) avatar-inspect: 冪等(検品済み再送) → reused・VLM再実行しない
{
  const r = await inspect(g1, run1.runId, cand1, PNG);
  ok(r.status===200 && r.body.reused===true, '9 検品冪等→reused');
}
// 10) avatar-inspect: SHA不一致(別画像) → 409 hash-mismatch
{
  const cH = await claim(g1, run1.runId, 2, 303);
  await avatarFinalize(env, ctxObj, cH, jsonResp({ data:[{ b64_json: PNG }], provider:'pollinations', fallback:false }), req());  // generatedにPNGのsha保存
  const r = await inspect(g1, run1.runId, cH.candidateId, PNG2);   // 別画像で検品
  ok(r.status===409 && r.body.errorCode==='hash-mismatch', '10 SHA不一致→409');
}
// 11) avatar-inspect: 別owner → 404
{
  const r = await inspect(gate('code:evil'), run1.runId, cand1, PNG);
  ok(r.status===404 && r.body.errorCode==='no-run', '11 別ownerのinspect→404');
}
// 12) commit(採用): passed候補 → committed(Stage1連携・E2E)
{
  const rc = await handleAvatarRun(req(), { op:'commit', runId: run1.runId, candidateId: cand1 }, env, ctxObj, g1);
  const j = await rc.json();
  ok(rc.status===200 && j.ok===true && j.winnerCandidateId===cand1 && j.imageSha256===sha1, '12 commit passed候補→採用');
}
// 13) 再バッチ解放: slot0-2全fail → rebatch_unlocked=1 → slot3 claim可能
{
  const g2 = gate('code:rb');
  const runR = await reserve(g2, 'rb1');
  mockVlm = { single_person:false, face_clear:true, anime_style:true, desc_match_gender:null, desc_match_age_band:null, desc_match_hair:null, desc_match_clothing:null, front_or_three_quarter:true, no_text_or_watermark:true, no_severe_artifacts:true, chest_up_bust:true, dark_background:true, muted_colors:true };  // single_person=false→fail
  for (let s=0; s<3; s++){
    const c = await claim(g2, runR.runId, s, 100+s);
    await avatarFinalize(env, ctxObj, c, jsonResp({ data:[{ b64_json: PNG }], provider:'pollinations', fallback:false }), req());
    await inspect(g2, runR.runId, c.candidateId, PNG);
  }
  const runRow = await DB.prepare("SELECT rebatch_unlocked FROM avatar_runs WHERE run_id=?").bind(runR.runId).first();
  const c3 = await claim(g2, runR.runId, 3, 200);   // slot3が解放されているはず
  ok(runRow.rebatch_unlocked===1 && !c3.error && !!c3.candidateId, '13 slot0-2全fail→再バッチ解放→slot3可');
}
// 14) avatar-inspect: run無し → 404 / runId欠落 → 400
{
  const r1 = await inspect(g1, 'ghostrun', 'x', PNG);
  const rr = await handleAvatarInspect(req(), { candidateId:'x', image:PNG }, env, ctxObj, g1);
  ok(r1.status===404 && r1.body.errorCode==='no-run' && rr.status===400, '14 run無し→404/runId欠落→400');
}
// 15) avatar-inspect: 不正画像 → 400
{
  const c = await claim(gate('code:img'), (await reserve(gate('code:img'),'im1')).runId, 0, 1);
  const rr = await handleAvatarInspect(req(), { runId:c.runId, candidateId:c.candidateId, image:'notbase64!!' }, env, ctxObj, gate('code:img'));
  const rb = await rr.json();
  ok(rr.status===400 && rb.errorCode==='inspect-bad-image-format', '15 不正画像→400');
}

console.log(`\n${pass} passed, ${fail} failed` + (fails.length ? `\nFAILURES:\n - ${fails.join('\n - ')}` : ''));
process.exit(fail?1:0);
