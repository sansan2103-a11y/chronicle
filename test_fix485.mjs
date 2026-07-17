// =====================================================================
// test_fix485.mjs — v292Dfix476 v476.3(GPT-5.6監査反映)のローカルテスト
//   実行: node test_fix485.mjs   (ネットワーク・本番リソースには一切触れない)
//   検証対象(GPT-5.6指定の最小修正):
//     ① hardFailCount: 未返却(undefined)/hard欠落も欠損失敗として計上(Worker v20.4のhardFails優先)
//     ② 全候補不合格(2バッチ後 pass 0件) → 自動採用しない(502)・候補はlastRunに保持
//     ③ softスコアは表示専用 → 合格中の勝者は生成順で先頭(最高softではない)
//     ④ 検品サービス不能(inspect-failed)のfail-openは従来どおり(回帰確認)
// =====================================================================
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let passCnt = 0, failCnt = 0;
const fails = [];
function ok(cond, name, detail) {
  if (cond) { passCnt++; console.log('  ok  -', name); }
  else { failCnt++; fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL-', name, detail || ''); }
}

const GEN_URL = 'https://gen.pollinations.ai/v1/images/generations';

// ---------- サンドボックス ----------
//   inspectScript(i): i回目(0始まり)の /inspect 呼び出しへ返す results[0] 相当。
//   'HTTP_FAIL' を返すと resp.ok=false(検品サービス不能)を再現。
function mkSandbox(inspectScript) {
  const store = new Map([['v292Dfix476OnV1', '1'], ['v292ProxyUrl', 'https://novel-proxy.example.workers.dev']]);
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    key: i => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
  let genN = 0, inspN = 0;
  const inner = function (url, init) {
    const u = String(url);
    if (u.includes('/inspect')) {
      const r = inspectScript(inspN++);
      if (r === 'HTTP_FAIL') return Promise.resolve({ ok: false });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [r] }) });
    }
    // 候補生成(内側チェーン相当): seedごとに一意のb64を返す
    const body = JSON.parse(String(init.body));
    const b64 = 'B64_' + body.seed;
    genN++;
    return Promise.resolve({
      ok: true,
      __seed: body.seed,
      clone() { return { json: () => Promise.resolve({ data: [{ b64_json: b64 }] }) }; },
      body: { cancel() {} },
    });
  };
  inner.__v292Dfix478 = true;   // 順序ガード(fix478が内側)を満たす
  const sb = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    localStorage,
    setTimeout: () => 0, clearTimeout: () => {},
    document: undefined,
    __v292Dfix475: { __armed: true, detect: p => ({ kind: 'human' }), canonicalize: s => String(s), STYLE6_TAIL: 'TAIL6' },
  };
  sb.window = sb; sb.globalThis = sb;
  sb.fetch = inner;
  sb.__genCount = () => genN; sb.__inspCount = () => inspN;
  vm.createContext(sb);
  vm.runInContext(readFileSync('v292Dfix476-pipeline.js', 'utf8'), sb, { filename: 'v292Dfix476-pipeline.js' });
  return sb;
}
function entryCall(sb, seed) {
  return sb.fetch(GEN_URL, { method: 'POST', body: JSON.stringify({ prompt: 'a girl, TAIL6', seed }) });
}

// ---------- 1) __test 単体: hardFailCount(①) ----------
console.log('== 1) hardFailCount: 未返却=欠損失敗(GPT①) ==');
{
  const sb = mkSandbox(() => ({ pass: false }));
  const { hardFailCount } = sb.__v292Dfix476.__test;
  ok(hardFailCount({ hardFails: 2, hard: { a: false } }) === 2, 'サーバ計算 hardFails(数値) を最優先');
  ok(hardFailCount({ hard: { a: false, b: true, c: null } }) === 1, '従来: false のみ計上・null は除外');
  ok(hardFailCount({ hard: {} }) === 99, '★hardが空(全項目未返却がJSON欠落) → 99(最劣後)');
  ok(hardFailCount({}) === 99, '★hard自体なし → 99(最劣後)');
  ok(hardFailCount(null) === 99, '★result欠落 → 99(最劣後)');
  ok(hardFailCount({ hard: { a: true, b: null } }) === 0, '全true/null → 0');
}

// ---------- 2) __test 単体: bestPass(③) ----------
console.log('== 2) bestPass: softは勝者決定に使わない(GPT③) ==');
{
  const sb = mkSandbox(() => ({ pass: false }));
  const { bestPass, mkFailResponse } = sb.__v292Dfix476.__test;
  const c1 = { pass: false, score: 105 }, c2 = { pass: true, score: 101 }, c3 = { pass: true, score: 103 };
  ok(bestPass([c1, c2, c3]) === c2, '合格中の勝者=生成順で先頭(c2)。最高soft(c3)ではない');
  ok(bestPass([c1]) === null, '合格なし → null');
  const fr = mkFailResponse();
  ok(fr && fr.ok !== true && (fr.status === 502 || fr.ok === false), 'mkFailResponse: ok=false / 502');
}

// ---------- 3) 実チェーン: 全候補不合格 → 自動採用しない(GPT②) ----------
console.log('== 3) 実チェーン: 2バッチ全滅 → 502・候補保持・採用なし(GPT②) ==');
await (async () => {
  const sb = mkSandbox(() => ({ pass: false, score: 0, hard: { anime_style: false }, hardFails: 1 }));
  const resp = await entryCall(sb, 100);
  const lr = sb.__v292Dfix476.lastRun;
  ok(resp && resp.ok !== true && resp.status === 502, '応答: 502(自動採用・本画像書込みなし)');
  ok(lr.fallback === 'all-fail-no-adopt', 'lastRun.fallback=all-fail-no-adopt');
  ok(lr.picked === null, 'lastRun.picked=null(採用なし)');
  ok(lr.rebatched === true, '再バッチ1回は実施済(6候補評価)');
  ok(Array.isArray(lr.failedCandidates) && lr.failedCandidates.length === 6, '不合格候補6件をlastRunに保持(人間比較用)');
  ok(lr.failedCandidates.every(c => typeof c.b64 === 'string' && c.b64.startsWith('B64_')), '候補は画像b64付きで保持');
  ok(sb.__inspCount() === 6, '検品は1枚ずつ×6回');
  ok(typeof sb.__v292Dfix476.showFailed === 'function', 'showFailed() 比較口が存在');
  ok(sb.__v292Dfix476.showFailed() === 6, 'showFailed(): DOMなし環境でも件数を返す(fail-safe)');
})();

// ---------- 4) 実チェーン: 先頭合格が勝つ(soft不使用)(GPT③) ----------
console.log('== 4) 実チェーン: 合格2件なら生成順で先頭を採用(GPT③) ==');
await (async () => {
  // seeds(base=100) = [100, 201, 311]。検品順=候補順。
  const script = [
    { pass: false, score: 0, hard: { anime_style: false }, hardFails: 1 },   // seed100
    { pass: true, score: 101, hard: {}, hardFails: 0 },                       // seed201(先頭合格・soft低)
    { pass: true, score: 103, hard: {}, hardFails: 0 },                       // seed311(soft高)
  ];
  const sb = mkSandbox(i => script[i]);
  const resp = await entryCall(sb, 100);
  const lr = sb.__v292Dfix476.lastRun;
  ok(lr.picked === 201, '勝者=先頭合格(seed201)。最高soft(seed311)ではない');
  ok(resp && resp.__seed === 201, '呼び出し元へ返るのは勝者の元Response');
  ok(lr.rebatched === false, '合格ありなら再バッチしない');
})();

// ---------- 5) 実チェーン: 検品サービス不能は従来fail-open(回帰) ----------
console.log('== 5) 実チェーン: 検品サービス不能(全滅) → 従来どおり先頭候補fail-open(回帰) ==');
await (async () => {
  const sb = mkSandbox(() => 'HTTP_FAIL');
  const resp = await entryCall(sb, 100);
  const lr = sb.__v292Dfix476.lastRun;
  ok(lr.fallback === 'inspect-failed', 'fallback=inspect-failed(検品不能はfail-open維持)');
  ok(lr.picked === 100 && resp && resp.__seed === 100, '先頭候補(seed100)を採用(仕様不変)');
})();

// ---------- 6) 実チェーン: 全項目未返却候補が明確な不合格候補より優遇されない(①の結合確認) ----------
console.log('== 6) 実チェーン: 未返却候補の判定不能優遇が消えたことの結合確認 ==');
await (async () => {
  // 旧Worker(v20.3以前)相当: hardFails無し・未返却はJSON欠落(hard={})を想定。
  // 全滅ケースなので v476.3 では誰も採用されない(=優遇問題自体が消滅)。
  const script = i => (i % 2 === 0)
    ? { pass: false, score: 0, hard: {} }                                    // 未返却相当 → hardFailCount=99
    : { pass: false, score: 0, hard: { front_or_three_quarter: false } };    // 横顔(明確な不合格) → 1
  const sb = mkSandbox(script);
  const resp = await entryCall(sb, 100);
  const lr = sb.__v292Dfix476.lastRun;
  ok(resp.status === 502 && lr.picked === null, '全滅 → 未返却候補も横顔候補も採用されない');
  const hf = lr.failedCandidates.map(c => c.hardFails);
  ok(hf.filter(x => x === 99).length === 3 && hf.filter(x => x === 1).length === 3,
     '保持候補のhardFails: 未返却=99(最劣後)・横顔=1 で記録(旧: 未返却=0で最優先)');
})();

console.log('');
console.log('==== 結果: pass=' + passCnt + ' fail=' + failCnt + ' ====');
if (failCnt) { console.log(fails.join('\n')); process.exit(1); }
