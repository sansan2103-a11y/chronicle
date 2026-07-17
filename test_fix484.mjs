// =====================================================================
// test_fix484.mjs — v292Dfix484(最終送信境界 style6 正規化) のローカルテスト
//   実行: node test_fix484.mjs   (ネットワーク・本番リソースには一切触れない)
//   実ファイル(fix484/fix247/fix338/fix475/fix471)を vm サンドボックスに
//   【index.html と同じ読み込み順】で読み込み、実fetchが受け取るbodyを検証する。
// =====================================================================
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let passCnt = 0, failCnt = 0;
const fails = [];
function ok(cond, name, detail) {
  if (cond) { passCnt++; console.log('  ok  -', name); }
  else { failCnt++; fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL-', name, detail || ''); }
}

// ---------- ブラウザ風サンドボックス ----------
function mkSandbox(opts = {}) {
  const store = new Map(Object.entries(opts.ls || {}));
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    key: i => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
  const captured = [];   // 最内側(実fetch相当)が受け取った (url, init)
  const nativeFetch = function (url, init) { captured.push({ url, init }); return Promise.resolve({ ok: true }); };
  const logs = [];
  class XHRStub { open() {} setRequestHeader() {} send() {} }
  const sb = {
    console: { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push('[warn]' + a.join(' ')), error: (...a) => logs.push('[err]' + a.join(' ')) },
    localStorage,
    setInterval: () => 0, clearInterval: () => {}, setTimeout: (f) => 0, clearTimeout: () => {},
    MutationObserver: class { observe() {} disconnect() {} },
    XMLHttpRequest: XHRStub,
    document: {
      readyState: 'complete', addEventListener: () => {}, getElementById: () => null,
      querySelectorAll: () => [], getElementsByTagName: () => [], createElement: () => ({ style: {}, setAttribute: () => {} }),
      documentElement: {}, head: { appendChild: () => {} },
    },
    S: opts.S !== undefined ? opts.S : { cfg: { artStyle: 6 } },
  };
  sb.window = sb; sb.globalThis = sb;
  sb.fetch = nativeFetch;
  sb.__captured = captured; sb.__logs = logs; sb.__ls = store;
  vm.createContext(sb);
  return sb;
}
function load(sb, file) { vm.runInContext(readFileSync(file, 'utf8'), sb, { filename: file }); }

// ---------- 参照文字列 ----------
const LEGACY_LOCAL_TAIL = 'character portrait, head and shoulders, visible clothing, detailed face, dark fantasy, dim moody lighting, muted desaturated colors, dark shadowy background, pale skin, somber gothic horror atmosphere, high quality';
const JP_SUBJ = 'anime portrait of a young woman, 白石澪, 黒髪ロングの女子高生。セーラー服。物静かで姿勢が良い, ';
const EN_SUBJ = 'Anime portrait of an elderly man. elderly man in his 70s, deeply wrinkled weathered face, grey stubble, one clouded blind white eye, worn fisherman jacket, stooped posture';
// 人物本文にstyle語(anime/dark/detailed)を含む要求ケース（Codex追加テスト）
const EN_STYLEWORDS = 'A high school girl with an anime-inspired hair ornament, dark navy sailor uniform, detailed scar beneath left eye, long black hair';

console.log('== 1) STYLE6_TAIL 定義の一元性検証（fix475 / fix197(fix480) / 採用manifest と一致） ==');
{
  const sb = mkSandbox();
  load(sb, 'v292Dfix475-recipe-v3.js');
  load(sb, 'v292Dfix484-style-canon.js');
  const f475 = sb.window.__v292Dfix475, f484 = sb.window.__v292Dfix484;
  ok(!!f475?.__armed && !!f484?.__armed, 'fix475/fix484 両方 arm');
  ok(f484.STYLE6_TAIL === f475.STYLE6_TAIL, 'STYLE6_TAIL(=v2) が fix475 と同一文字列');
  ok(f484.STYLE6_TAIL_CREATURE === f475.STYLE6_TAIL_CREATURE, 'STYLE6_TAIL_CREATURE が fix475 と同一文字列');
  // ★fix486(style6-v2): canonicalは pale skin を含まない
  ok(!f484.STYLE6_TAIL.includes('pale skin'), '★v2 canonical末尾に pale skin を含まない');
  ok(f484.CANON_VERSION === 'style6-v2', '★CANON_VERSION=style6-v2');
  // 旧v1(pale skin有)は剥がし対象として保持されている
  ok(!!f484.STYLE6_TAIL_V1 && f484.STYLE6_TAIL_V1.includes('pale skin'), '★STYLE6_TAIL_V1(pale skin有)を保持');
  ok(f484.STYLE6_TAIL_V1 === f475.STYLE6_TAIL_V1, 'STYLE6_TAIL_V1 が fix475 と同一文字列');
  const hasEnd = (list, str) => list.some(e => e.s === str);
  ok(hasEnd(f484.END_TAILS, f484.STYLE6_TAIL_V1), '★v1 が END_TAILS に剥がし対象として存在');
  ok(hasEnd(f484.END_TAILS, f484.STYLE6_TAIL), '★v2 も END_TAILS に存在(冪等)');
  // v1タグのプロンプトは canonicalize で v2 へ正規化される(pale skin除去・本文保持)
  const _v1p = 'anime portrait of a young woman, dark brown skin, silver hair, ' + f484.STYLE6_TAIL_V1;
  const _v1r = f484.canonicalize(_v1p);
  ok(!_v1r.prompt.includes('pale skin') && _v1r.prompt.endsWith(f484.STYLE6_TAIL), '★v1タグ→v2へ正規化(pale skin除去)');
  ok(_v1r.prompt.includes('dark brown skin'), '★人物本文(dark brown skin)は保持');
  // fix197(fix480) の T480 リテラル= v2(pale skin無し)と一致
  const src197 = readFileSync('v292Dfix197-avatar-key.js', 'utf8');
  const m480 = src197.match(/var T480 = '([^']+)'/);
  ok(!!m480 && m480[1] === f484.STYLE6_TAIL, 'fix480(fix197内 T480) が v2 と同一文字列');
  // ★採用7人manifestは【履歴】=v1(pale skin有)のまま。ライブcanonical(v2)とは意図的に異なる。
  const manifest = JSON.parse(readFileSync('icons/approved/adopted_manifest_2026-07-15.json', 'utf8'));
  ok(manifest.recipe_iconRecipeV3.styleTail === f484.STYLE6_TAIL_V1, '採用manifest(履歴)は v1(=STYLE6_TAIL_V1)と一致・既存画像は不変');
  const has = (list, s) => list.some(e => e.s === s);
  ok(f475.END_TAILS.every(e => has(f484.END_TAILS, e.s)), 'fix475 END_TAILS を全て包含');
  ok(f475.FRONT_PREFIXES.every(e => has(f484.FRONT_PREFIXES, e.s)), 'fix475 FRONT_PREFIXES を全て包含');
  ok(has(f484.END_TAILS, LEGACY_LOCAL_TAIL), 'features.js legacy(avatarUrlLocal/genUrl)完全末尾も剥がし対象');
  // 実行時ドリフト警告の存在（定義が食い違ったら警告する仕組み）
  const src484 = readFileSync('v292Dfix484-style-canon.js', 'utf8');
  ok(src484.includes('definition drift'), '実行時ドリフト検知(警告)を実装');
}

// ART6_TAIL本文（fix484テーブルの先頭=semi-realistic系）を後続テストで使用
const sbRef = mkSandbox(); load(sbRef, 'v292Dfix484-style-canon.js');
const F = sbRef.window.__v292Dfix484;
const T = F.STYLE6_TAIL, TC = F.STYLE6_TAIL_CREATURE;
const ART6_TAIL_BODY = F.END_TAILS[0].s;

console.log('== 2) canonicalize 単体（既知の完全ブロックのみ剥がす・本文はバイト保持） ==');
{
  const count = (s, t) => s.split(t).length - 1;
  const cases = [
    ['a: legacy jp + STYLE6_TAIL(buildUrl/darkfantasy)', JP_SUBJ + T, T, JP_SUBJ.replace(/,\s*$/, '')],
    ['b: legacy jp + avatarUrlLocal完全末尾', JP_SUBJ + LEGACY_LOCAL_TAIL, T, JP_SUBJ.replace(/,\s*$/, '')],
    ['c: EN + ART6_TAIL(fix338旧出力)', EN_SUBJ + ', ' + ART6_TAIL_BODY, T, EN_SUBJ],
    ['d: 両tail重複(STYLE6+ART6)', EN_SUBJ + ', ' + T + ', ' + ART6_TAIL_BODY, T, EN_SUBJ],
    ['e: 末尾重複(STYLE6×2)', EN_SUBJ + ', ' + T + ', ' + T, T, EN_SUBJ],
    ['f: style語入り人物本文 + STYLE6_TAIL', EN_STYLEWORDS + ', ' + T, T, EN_STYLEWORDS],
    ['h1: fix470 webtoon末尾', EN_SUBJ + ', ' + F.END_TAILS.find(e => e.s.startsWith('korean webtoon anime illustration, hand-drawn digital painting, clean')).s, T, EN_SUBJ],
    ['h2: fix471 案C末尾', EN_SUBJ + ', ' + F.END_TAILS.find(e => e.s.startsWith('Style: dark fantasy anime illustration') && e.k === 'human').s, T, EN_SUBJ],
    ['g: creature ART6C_TAIL', 'a shadowy figure made of pure darkness, ' + F.END_TAILS.find(e => e.k === 'creature' && e.s.startsWith('Dark fantasy creature concept art, JRPG bestiary portrait, semi-realistic rendering, dim cinematic')).s, TC, 'a shadowy figure made of pure darkness'],
  ];
  for (const [name, input, tail, coreExpect] of cases) {
    const r1 = F.canonicalize(input);
    ok(r1.matched === 'marker', name + ' / marker検出');
    ok(r1.prompt === coreExpect + ', ' + tail, name + ' / 本文バイト保持+canonical末尾', JSON.stringify(r1.prompt.slice(0, 80)));
    ok(count(r1.prompt, tail) === 1, name + ' / tailちょうど1回');
    const r2 = F.canonicalize(r1.prompt);
    ok(r2.prompt === r1.prompt, name + ' / 冪等(2回で不変)');
  }
  // タグ無し + cfg artStyle=6 → 救済付与（本文は完全バイト保持）
  const r = F.canonicalize(EN_SUBJ);
  ok(r.matched === 'cfg' && r.prompt === EN_SUBJ + ', ' + T, 'タグ無し+cfg6 → canonical付与(本文バイト保持)');
  ok(F.canonicalize(r.prompt).prompt === r.prompt, 'cfg救済も冪等');
  const rs = F.canonicalize(EN_STYLEWORDS);
  ok(rs.prompt === EN_STYLEWORDS + ', ' + T, 'style語入り本文もcfg救済でバイト保持');
  const rc = F.canonicalize('霧の中に立つ人影、目のない亡霊');
  ok(rc.kind === 'creature' && rc.prompt.endsWith(TC), 'タグ無し+人外語 → creature canonical');
}

console.log('== 3) 非art6は不触 ==');
{
  const sb = mkSandbox({ S: { cfg: { artStyle: 3 } } });
  load(sb, 'v292Dfix484-style-canon.js');
  const f = sb.window.__v292Dfix484;
  const p1 = 'a young woman, vivid watercolor portrait, bright saturated colors';
  ok(f.canonicalize(p1).matched === null && f.canonicalize(p1).prompt === p1, 'artStyle=3・マーカー無し → 完全不触');
  const p2 = JP_SUBJ + f.STYLE6_TAIL;
  ok(f.canonicalize(p2).prompt.endsWith(f.STYLE6_TAIL), 'STYLE6マーカー付きはcfgに依らず正規化(冪等no-op)');
}

console.log('== 4) 実読み込み順の連鎖: fix484 → fix247 → fix338 (→fix475/fix471) ==');
// index.html順: fix484(最初)→fix247→…→fix338→…→fix475→…→fix471(最後)
// リクエストは外側(後読込)から内側へ流れ、fix247がURLをworkers.dev/imageへ書換えた後にfix484を通る。
const PROXY_LS = { v292ProxyUrl: 'https://novel-proxy.example.workers.dev', v292ProxyPass: 'test-pass' };
function chainRun(extraLs, prompt, files, bodyExtra) {
  const sb = mkSandbox({ ls: { ...PROXY_LS, ...extraLs }, S: { cfg: { artStyle: 6 } } });
  for (const f of files) load(sb, f);
  const body = Object.assign({ model: 'flux', prompt, n: 1, size: '384x384', seed: 101 }, bodyExtra || {});
  sb.fetch('https://gen.pollinations.ai/v1/images/generations', { method: 'POST', body: JSON.stringify(body) });
  const last = sb.__captured.at(-1);
  return { url: String(last.url), headers: (last.init && last.init.headers) || {}, raw: last.init.body, body: JSON.parse(last.init.body), sb };
}
const CHAIN = ['v292Dfix484-style-canon.js', 'v292Dfix247-proxy.js', 'v292Dfix338-artstyle.js'];
{
  // 初回legacy日本語経路（fix338既定ON）
  const r1 = chainRun({}, JP_SUBJ + LEGACY_LOCAL_TAIL, CHAIN);
  ok(r1.url === 'https://novel-proxy.example.workers.dev/image', '連鎖: fix247がURLをworkers.dev/imageへ書換');
  ok(r1.headers['x-chronicle-pass'] === 'test-pass', '連鎖: fix247の認証ヘッダ再構築後にfix484を通過');
  ok(r1.body.prompt === JP_SUBJ.replace(/,\s*$/, '') + ', ' + T, '連鎖: legacy日本語初回 → 本文バイト保持+canonical1回');
  ok(r1.body.seed === 101 && r1.body.model === 'flux' && r1.body.size === '384x384' && r1.body.n === 1, '連鎖: prompt以外のフィールドは不触');
  // 明示↻英文経路（fix480出力）
  const r2 = chainRun({}, EN_SUBJ + ', ' + T, CHAIN);
  ok(r2.body.prompt === EN_SUBJ + ', ' + T, '連鎖: ↻英文(fix480) → 本文バイト保持(Anime等も保持)+canonical1回');
  // fix338 ON/OFF でバイト一致（同じprompt/seed）
  const r3 = chainRun({ v292Dfix338Off: '1' }, EN_SUBJ + ', ' + T, CHAIN);
  ok(r3.raw === r2.raw, '連鎖: fix338 ON/OFF で実fetch bodyがバイト一致(EN↻)');
  const r4 = chainRun({ v292Dfix338Off: '1' }, JP_SUBJ + LEGACY_LOCAL_TAIL, CHAIN);
  ok(r4.raw === r1.raw, '連鎖: fix338 ON/OFF で実fetch bodyがバイト一致(legacy jp)');
  // style語入り人物本文（fix338 ONでも削られない=fix338ガードの効果）
  const r5 = chainRun({}, EN_STYLEWORDS + ', ' + T, CHAIN);
  ok(r5.body.prompt === EN_STYLEWORDS + ', ' + T, '連鎖: anime-inspired/dark navy/detailed scar が完全保持');
  const r5b = chainRun({ v292Dfix338Off: '1' }, EN_STYLEWORDS + ', ' + T, CHAIN);
  ok(r5b.raw === r5.raw, '連鎖: style語入り本文も fix338 ON/OFF でバイト一致');
  // provider Together/Pollinations: promptバイト一致・imgProvider以外のbody一致
  const rTg = chainRun({}, EN_SUBJ + ', ' + T, CHAIN, { imgProvider: 'together' });
  const rPl = chainRun({}, EN_SUBJ + ', ' + T, CHAIN, { imgProvider: 'pollinations' });
  ok(rTg.body.prompt === rPl.body.prompt && rTg.body.prompt === r2.body.prompt, '連鎖: provider間で最終promptバイト一致');
  const dTg = { ...rTg.body }; delete dTg.imgProvider;
  const dPl = { ...rPl.body }; delete dPl.imgProvider;
  ok(JSON.stringify(dTg) === JSON.stringify(dPl), '連鎖: imgProvider以外のbodyフィールドも一致');
  // fix475 ON を足しても最終promptは同一（二重適用なし）
  const r6 = chainRun({ v292Dfix475OnV1: '1' }, EN_SUBJ + ', ' + T, CHAIN.concat(['v292Dfix475-recipe-v3.js']));
  ok(r6.body.prompt === r2.body.prompt, '連鎖: fix475 ONでも最終promptは同一');
  // fix471 ON 相当（実fix471を最外殻に読み込み・案Cスタイル文を付けてくる）
  const r7 = chainRun({ v292Dfix471On: '1' }, EN_SUBJ + ', ' + T, CHAIN.concat(['v292Dfix475-recipe-v3.js', 'v292Dfix471-style-c.js']));
  ok(r7.body.prompt.endsWith(T) && r7.body.prompt.split(T).length - 1 === 1, '連鎖: fix471 ONでも末尾はSTYLE6ちょうど1回');
  ok(r7.body.prompt.includes('clouded blind white eye') && !r7.body.prompt.includes('semi-realistic') && !r7.body.prompt.includes('Style: dark fantasy'), '連鎖: fix471 ONでも人物記述保持・旧style除去');
  // fix470 スタイル文入力相当は §2 h1 で検証済み（fix470本体はプロンプトを書き換えずstyle420のみ付与）
  // fix484 kill switch時: fix338が従来どおり変換する(後方互換フォールバック)
  const r8 = chainRun({ v292Dfix484Off: '1' }, EN_SUBJ + ', ' + T, CHAIN);
  ok(r8.body.prompt.endsWith(ART6_TAIL_BODY), '連鎖: fix484 OFF時はfix338が従来動作(フォールバック確認)');
}

console.log('== 5) 非アイコンリクエストは完全不変 ==');
{
  const sb = mkSandbox({ ls: PROXY_LS, S: { cfg: { artStyle: 6 } } });
  for (const f of CHAIN) load(sb, f);
  // chat/API POST（fix247がURL書換するがbodyは不変であること）
  const chatBody = JSON.stringify({ model: 'x', messages: [{ role: 'user', content: 'dark fantasy anime の話をして, ' + T }] });
  sb.fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: chatBody });
  ok(sb.__captured.at(-1).init.body === chatBody, 'chat/API POST: bodyバイト不変(URLはプロキシ書換のみ)');
  // 非アイコンPOST(無関係URL)
  const misc = JSON.stringify({ prompt: 'x, ' + T });
  sb.fetch('https://example.com/api', { method: 'POST', body: misc });
  ok(sb.__captured.at(-1).init.body === misc && String(sb.__captured.at(-1).url) === 'https://example.com/api', '無関係POST: 完全不変');
  // GET（SEE画像/legacy）
  sb.fetch('https://image.pollinations.ai/prompt/xxx?width=768&height=512');
  ok(sb.__captured.at(-1).init === undefined, 'GET: 完全不変');
  // multipart相当（bodyが文字列でない）
  const fd = { __formData: true };
  sb.fetch('https://novel-proxy.example.workers.dev/image', { method: 'POST', body: fd });
  ok(sb.__captured.at(-1).init.body === fd, 'multipart(非文字列body): 完全不変');
  // 非JSON文字列body
  sb.fetch('https://novel-proxy.example.workers.dev/image', { method: 'POST', body: 'not-json' });
  ok(sb.__captured.at(-1).init.body === 'not-json', '非JSON文字列body: 完全不変');
}

console.log('== 6) 診断（既定OFF・秘密なし）と __diag484 除去 ==');
{
  const bodyBase = { model: 'flux', prompt: EN_SUBJ + ', ' + T, n: 1, size: '384x384', seed: 101, __diag484: { m: 'regen' } };
  const run = (ls) => { const sb = mkSandbox({ ls: { ...PROXY_LS, ...ls }, S: { cfg: { artStyle: 6 } } }); for (const f of CHAIN) load(sb, f);
    sb.fetch('https://gen.pollinations.ai/v1/images/generations', { method: 'POST', body: JSON.stringify(bodyBase) });
    return { out: JSON.parse(sb.__captured.at(-1).init.body), logs: sb.__logs }; };
  const a = run({});
  ok(!('__diag484' in a.out), '__diag484 は送信前に除去');
  ok(!a.logs.some(l => l.includes('[diag]')), '診断は既定OFF');
  const b = run({ v292Dfix484Diag: '1' });
  const dl = b.logs.find(l => l.includes('[diag]'));
  ok(!!dl, '診断ONで1行出力');
  if (dl) {
    const j = JSON.parse(dl.slice(dl.indexOf('{')));
    ok(j.mode === 'regen' && j.seed === 101 && j.canonicalStyleVersion === 'style6-v2' && typeof j.promptHash === 'string', '診断内容(mode/seed/canonVer/promptHash)');
    ok(!dl.includes('clouded blind') && !dl.includes('test-pass'), '診断にprompt本文・合言葉が含まれない');
  }
  const c = run({ v292Dfix484Off: '1' });
  ok(!('__diag484' in c.out), 'kill switch でも __diag484 は除去');
  // 二重ロード
  const sb8 = mkSandbox({ ls: PROXY_LS });
  load(sb8, 'v292Dfix484-style-canon.js');
  const fetchAfter1 = sb8.fetch;
  load(sb8, 'v292Dfix484-style-canon.js');
  ok(sb8.fetch === fetchAfter1, '二重ロードで再ラップしない(冪等)');
}

console.log('== 7) 診断タグ付与側の静的整合（fix197/fix476） ==');
{
  const src = readFileSync('v292Dfix476-pipeline.js', 'utf8');
  ok(src.includes('function genCandidates(url, init, baseBody, seeds, batch)'), 'genCandidates が batch を受ける');
  ok(src.includes('seeds1, 0)') && src.includes('seeds2, 1)'), '呼び出し側が batch 0/1 を渡す');
  ok(src.includes('d484.active && d484.active()'), 'fix484 有効時のみタグ付与(fix476)');
  const src197 = readFileSync('v292Dfix197-avatar-key.js', 'utf8');
  ok(src197.includes("body.__diag484 = { m: fresh403 ? 'regen' : 'auto' }"), 'fix197 が mode タグを付与');
}

console.log('\n==== 結果: pass=' + passCnt + ' fail=' + failCnt + ' ====');
if (fails.length) { console.log('失敗:'); fails.forEach(f => console.log(' - ' + f)); process.exit(1); }
