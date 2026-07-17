// test_fix476_pipeline_run.mjs — v476.4 クライアントrun経路の配線テスト
// vm上に window を作り、_origFetch をモックして reserve→/image(runId/slot)→/avatar-inspect→commit を検証。
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ENTRY = 'https://gen.pollinations.ai/v1/images/generations';
const BASE = 'https://novel-proxy.test';

function makeCtx(mockFetch){
  const store = new Map();
  const localStorage = {
    getItem(k){ return store.has(k) ? store.get(k) : null; },
    setItem(k,v){ store.set(k, String(v)); },
    removeItem(k){ store.delete(k); },
    key(i){ return [...store.keys()][i]; },
    get length(){ return store.size; }
  };
  localStorage.setItem('v292ProxyUrl', BASE);
  const win = {};
  const ctx = vm.createContext({
    window: win, localStorage, crypto, fetch: mockFetch,
    Response, Request, Headers, AbortController, Promise, setTimeout, clearTimeout,
    console, Object, Array, JSON, Math, Date, isFinite, String, Number, Boolean, TextEncoder, TextDecoder
  });
  ctx.window = ctx;                 // W = window = ctx
  ctx.globalThis = ctx;
  // fix475 モック(arm済み)
  ctx.__v292Dfix475 = {
    __armed: true,
    detect: function(p){ return { kind: 'human' }; },
    canonicalize: function(p){ return String(p); },
    STYLE6_TAIL: ', anime style',
    CANON_VERSION: 'style6-v2'
  };
  ctx.__chronicleGoogleId = function(){ return ''; };
  return ctx;
}

function imgResp(tag, candidateId){
  return new Response(JSON.stringify({ data: [{ b64_json: tag }], provider: 'pollinations', fallback: false, runId: 'RUN1', candidateId: candidateId, slot: 0, imageSha256: 'sha-' + tag }),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
}
function jresp(obj, status){ return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } }); }

let pass = 0, fail = 0; const fails = [];
function ok(c, n){ if (c) pass++; else { fail++; fails.push(n); console.log('  ✗ ' + n); } }

function loadPipeline(ctx){
  const src = readFileSync(new URL('./v292Dfix476-pipeline.js', import.meta.url), 'utf8');
  const preFetch = ctx.fetch;
  preFetch.__v292Dfix478 = true;    // 内側チェーン健在(unsafeChain=false)
  vm.runInContext(src, ctx, { filename: 'pipeline.js' });
}

console.log('=== test_fix476_pipeline_run ===');

// ---------- 1) run経路ハッピーパス ----------
{
  const calls = [];
  let candSeq = 0;
  const mock = async (url, init) => {
    const u = String(url);
    const body = init && init.body ? JSON.parse(init.body) : {};
    calls.push({ u, op: body.op, slot: body.slot, runId: body.runId, hasCand: !!body.candidateId, method: (init && init.method) || 'GET' });
    if (/\/$/.test(u) && (init && init.method === 'GET')) return jresp({ ok: true, v: 27, avatarGuard: true });
    if (/\/avatar-run$/.test(u)) {
      if (body.op === 'reserve') return jresp({ ok: true, guard: true, runId: 'RUN1', maxImages: 6, maxInspects: 6 });
      if (body.op === 'commit') return jresp({ ok: true, winnerCandidateId: body.candidateId });
      if (body.op === 'release') return jresp({ ok: true });
    }
    if (u === ENTRY) { const cid = 'CAND' + (candSeq++); return imgResp('IMG' + body.slot, cid); }
    if (/\/avatar-inspect$/.test(u)) return jresp({ ok: true, candidateId: body.candidateId, result: { pass: true, hardFails: 0, score: 100 } });
    return jresp({ error: 'unexpected ' + u }, 500);
  };
  const ctx = makeCtx(mock);
  loadPipeline(ctx);
  ctx.__v292Dfix476.__serverGuard = true;   // サーバ標準ON強制
  const resp = await ctx.fetch(ENTRY, { method: 'POST', body: JSON.stringify({ prompt: 'a young woman', seed: 100 }) });
  const j = await resp.json();
  const imageCalls = calls.filter(c => c.u === ENTRY);
  const inspectCalls = calls.filter(c => /\/avatar-inspect$/.test(c.u));
  const reserved = calls.some(c => c.op === 'reserve');
  const committed = calls.some(c => c.op === 'commit');
  const allImgHaveRun = imageCalls.every(c => c.runId === 'RUN1' && typeof c.slot === 'number');
  ok(reserved && imageCalls.length === 3 && allImgHaveRun && inspectCalls.length === 3 && committed
     && j && j.data && /^IMG[012]$/.test(j.data[0].b64_json), '1 run経路: reserve→image×3(runId/slot)→inspect×3→commit→勝者返却');
  ok(ctx.__v292Dfix476.lastRun.mode === 'run' && ctx.__v292Dfix476.lastRun.runId === 'RUN1', '1b lastRun.mode=run/runId記録');
}

// ---------- 2) run経路 全滅 → 502(採用なし) ----------
{
  const calls = []; let candSeq = 0;
  const mock = async (url, init) => {
    const u = String(url); const body = init && init.body ? JSON.parse(init.body) : {};
    if (/\/$/.test(u) && init.method === 'GET') return jresp({ avatarGuard: true });
    if (/\/avatar-run$/.test(u)) {
      if (body.op === 'reserve') return jresp({ ok: true, guard: true, runId: 'RUN2' });
      return jresp({ ok: true });
    }
    if (u === ENTRY) { calls.push('img'); return imgResp('X', 'C' + (candSeq++)); }
    if (/\/avatar-inspect$/.test(u)) return jresp({ ok: true, result: { pass: false, hardFails: 3, score: 10 } });
    return jresp({}, 500);
  };
  const ctx = makeCtx(mock);
  loadPipeline(ctx);
  ctx.__v292Dfix476.__serverGuard = true;
  const resp = await ctx.fetch(ENTRY, { method: 'POST', body: JSON.stringify({ prompt: 'a young woman', seed: 5 }) });
  ok(resp.status === 502 && calls.length === 6 && ctx.__v292Dfix476.lastRun.fallback === 'all-fail-no-adopt',
     '2 run経路 全滅→6枚生成後502(採用なし)');
}

// ---------- 3) reserve guard:false → legacy(/inspect)へフォールバック ----------
{
  const calls = [];
  const mock = async (url, init) => {
    const u = String(url); const body = init && init.body ? JSON.parse(init.body) : {};
    if (/\/$/.test(u) && init.method === 'GET') return jresp({ avatarGuard: true });
    if (/\/avatar-run$/.test(u) && body.op === 'reserve') { calls.push('reserve'); return jresp({ ok: true, guard: false }); }
    if (u === ENTRY) { calls.push('img:runId=' + (body.runId || 'none')); return imgResp('LEG', 'ignore'); }
    if (/\/inspect$/.test(u) && !/avatar-inspect/.test(u)) { calls.push('legacy-inspect'); return jresp({ ok: true, results: [{ pass: true, score: 100, hardFails: 0 }] }); }
    return jresp({}, 500);
  };
  const ctx = makeCtx(mock);
  loadPipeline(ctx);
  ctx.__v292Dfix476.__serverGuard = true;   // runMode真だが reserveがguard:false → legacyへ
  const resp = await ctx.fetch(ENTRY, { method: 'POST', body: JSON.stringify({ prompt: 'a young woman', seed: 7 }) });
  const j = await resp.json();
  const legacyInspect = calls.some(c => c === 'legacy-inspect');
  const imgNoRun = calls.filter(c => c.indexOf('img:') === 0).every(c => c === 'img:runId=none');
  ok(resp.status === 200 && j.data[0].b64_json === 'LEG' && legacyInspect && imgNoRun,
     '3 reserve guard:false→legacy(/inspect・runId無し生成)へフォールバック');
}

// ---------- 4) serverGuard=false(runMode偽) → 最初からlegacy ----------
{
  const calls = [];
  const mock = async (url, init) => {
    const u = String(url); const body = init && init.body ? JSON.parse(init.body) : {};
    if (/\/$/.test(u) && init.method === 'GET') return jresp({ avatarGuard: false });
    if (/\/avatar-run$/.test(u)) { calls.push('avatar-run'); return jresp({ ok: true, guard: false }); }
    if (u === ENTRY) return imgResp('L2', 'x');
    if (/\/inspect$/.test(u)) return jresp({ ok: true, results: [{ pass: true, score: 100, hardFails: 0 }] });
    return jresp({}, 500);
  };
  const ctx = makeCtx(mock);
  loadPipeline(ctx);
  ctx.localStorage.setItem('v292Dfix476OnV1', '1');   // opt-in
  ctx.__v292Dfix476.__serverGuard = false;            // runMode偽
  const resp = await ctx.fetch(ENTRY, { method: 'POST', body: JSON.stringify({ prompt: 'a young woman', seed: 9 }) });
  const j = await resp.json();
  ok(resp.status === 200 && j.data[0].b64_json === 'L2' && !calls.some(c => c === 'avatar-run'),
     '4 runMode偽(opt-in)→/avatar-run叩かず従来legacy');
}

// ---------- 5) on()優先順位: Off最優先 ----------
{
  const ctx = makeCtx(async () => jresp({}));
  loadPipeline(ctx);
  ctx.localStorage.setItem('v292Dfix476Off', '1');
  ctx.localStorage.setItem('v292Dfix476OnV1', '1');
  ctx.__v292Dfix476.__serverGuard = true;
  ok(ctx.__v292Dfix476.status().on === false, '5 Offスイッチが最優先(on=false)');
}

console.log(`\n${pass} passed, ${fail} failed` + (fails.length ? `\nFAILURES:\n - ${fails.join('\n - ')}` : ''));
process.exit(fail ? 1 : 0);
