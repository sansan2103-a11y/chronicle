/* 回帰テスト: v292Dfix539 — S 取得契約（GPT監査 P0「無言の空振り」対策）
 * 由来: 2026-07-25 実機。fix277 の normalizeConvWho() が 0 件を返し、
 *   同時刻の手動カウントは 5 件だった = モジュール内の getS() が null を返していた。
 * ここで固定するのは GPT が指定した必須テスト:
 *   (1) 取得契約  (2) 再代入追従  (3) スロット汚染防止  (4) 空振り検知  (5) 既存挙動の一致 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };

const FILES = {
  fix277: 'v292Dfix277-quasi-pack.js',
  fix469: 'v292Dfix469-speaker-score.js',
  fix409: 'v292Dfix409-handle-merge.js',
  fix145: 'v292Dfix145-charlist.js',
  fix77:  'v292Dfix77-state-memory.js'
};

/* index.html の fix539 と同じ実装を抜き出して使う（本番と乖離しないよう index.html から切り出す） */
function extractAccessor(){
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'latin1');
  const i = html.indexOf('(function v292Dfix539(){');
  const j = html.indexOf('})();', i);
  if (i < 0 || j < 0) return null;
  return Buffer.from(html.slice(i, j + 5), 'latin1').toString('utf8');
}

function mkWin(opts){
  opts = opts || {};
  const store = opts.store || {};
  const ls = { getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; },
    key: i => Object.keys(store)[i], get length(){ return Object.keys(store).length; } };
  const el = { querySelectorAll: () => [], addEventListener(){}, appendChild(){}, setAttribute(){}, style: {}, insertBefore(){}, remove(){} };
  const doc = { hidden: false, documentElement: el, body: el, readyState: 'complete',
    querySelectorAll: () => [], querySelector: () => null, getElementById: () => null,
    addEventListener(){}, createElement: () => ({ style: {}, setAttribute(){}, addEventListener(){}, appendChild(){}, remove(){} }) };
  const warns = [];
  const w = { localStorage: ls, document: doc, console: { log(){}, warn: (...a) => warns.push(a.join(' ')), error(){} },
    setTimeout: () => 0, setInterval: () => 0, clearTimeout(){}, clearInterval(){},
    MutationObserver: function(){ return { observe(){}, disconnect(){} }; },
    navigator: { userAgent: 'node' }, location: { href: 'x', search: '' } };
  w.window = w; w.__warns = warns; w.__store = store;
  return w;
}

/* index.html と同じ「S と同一スコープ」を node 上で再現する。
   let にしているのは再代入追従テストのため（本番は const なので再代入は起きない）。 */
function installAccessor(w, initialS){
  const src = extractAccessor();
  if (!src) throw new Error('index.html から fix539 を取り出せない');
  const ctx = vm.createContext(w);
  vm.runInContext('let S = __seed;\n' + src + '\nglobalThis.__setS = function(v){ S = v; };\n', ctx, { filename: 'index.html:fix539' });
  return ctx;
}

console.log('\n== (1) 取得契約: __chronicleGetState() は実際の S を返す ==');
{
  const w = mkWin(); w.__seed = { turns: [1, 2, 3], cast: {} };
  installAccessor(w);
  ok('★取得できる', w.__chronicleGetState('t') === w.__seed, typeof w.__chronicleGetState);
  ok('feature 未指定でも動く', w.__chronicleGetState() === w.__seed);
  ok('Context 版は slotKey も返す', w.__chronicleGetStateContext('t').slotKey === 'chr6', w.__chronicleGetStateContext('t'));
  ok('診断が数えている', w.__chronicleState.stats().calls >= 3 && w.__chronicleState.stats().misses === 0, w.__chronicleState.stats());
}
{
  const w = mkWin(); w.__seed = { turns: [] };
  w.__chr6Key = function(){ return 'chr6_slot_abc'; };
  installAccessor(w);
  ok('slotKey は __chr6Key を尊重する', w.__chronicleGetStateContext('t').slotKey === 'chr6_slot_abc');
}

console.log('\n== (2) 再代入追従: 古い S を握り続けない（fix538b の永続キャッシュ廃止の担保） ==');
{
  const w = mkWin(); const A = { turns: ['A'] }, B = { turns: ['B'] };
  w.__seed = A; installAccessor(w);
  const first = w.__chronicleGetState('t');
  w.__setS(B);
  const second = w.__chronicleGetState('t');
  ok('★再代入後は新しい S を返す', second === B, second && second.turns);
  ok('★古い S を返さない', second !== first);
}

console.log('\n== (3) 各fixの getS が正式APIを第一経路にする ==');
Object.keys(FILES).forEach(function(fx){
  const w = mkWin(); const real = { cast: { hero: { name: 'アリア' }, npcs: [] }, turns: [], save(){} };
  w.__seed = real;
  const ctx = installAccessor(w);
  /* window.S にはワザと**別物**を置く。APIが優先されていれば real 側が使われる。 */
  w.S = { cast: { hero: { name: 'ニセ' }, npcs: [] }, turns: [{}, {}], save(){} };
  vm.runInContext(fs.readFileSync(path.join(__dirname, FILES[fx]), 'utf8'), ctx, { filename: fx });
  const st = w.__chronicleState.stats();
  ok(fx + ': 読み込みで例外なし', true);
  ok(fx + ': 診断に自分の名前で計上される or 未使用', !st.byFeature[fx] || st.byFeature[fx].calls >= 0, st.byFeature);
});
{
  /* fix145 は一覧生成で S を使うので、APIと window.S が食い違う状況で API 側が勝つことを直接見る */
  const w = mkWin(); const real = { cast: { hero: { name: 'アリア' }, npcs: [{ name: 'カエデ' }] }, turns: [], save(){} };
  w.__seed = real; const ctx = installAccessor(w);
  w.S = { cast: { hero: { name: 'ニセ' }, npcs: [] }, turns: [], save(){} };
  vm.runInContext(fs.readFileSync(path.join(__dirname, FILES.fix145), 'utf8'), ctx, { filename: 'fix145' });
  let names = null;
  try { names = w.__v292Dfix145x.collectChars().story.map(s => s.name); } catch (e) { names = 'ERR:' + e.message; }
  ok('★fix145: 正式API側の S が使われる(ニセを見ない)', Array.isArray(names) && names.indexOf('ニセ') < 0, names);
  ok('★fix145: window.S より API が優先される', w.__chronicleState.stats().byFeature.fix145 &&
     w.__chronicleState.stats().byFeature.fix145.calls > 0, w.__chronicleState.stats().byFeature);
}

console.log('\n== (4) 空振り検知: S が取れないとき、黙って 0 件にしない ==');
{
  const w = mkWin(); w.__seed = null;
  installAccessor(w);
  const got = w.__chronicleGetState('fixX');
  ok('★取れないときは null を返す(例外を投げない)', got === null, got);
  const st = w.__chronicleState.stats();
  ok('★misses が増える', st.misses === 1 && st.byFeature.fixX.misses === 1, st);
  ok('★警告が出る(無言にしない)', w.__warns.some(x => /state unavailable/.test(x)), w.__warns);
  w.__chronicleGetState('fixX'); w.__chronicleGetState('fixX');
  ok('★警告は feature ごとに1回だけ(ログを溢れさせない)',
     w.__warns.filter(x => /state unavailable/.test(x)).length === 1, w.__warns.length);
  ok('misses は毎回数える', w.__chronicleState.stats().byFeature.fixX.misses === 3, w.__chronicleState.stats());
}
{
  /* S が取れないとき fix538 は書き換えない(fail-closed)ままであること */
  const w = mkWin({ store: { 'v292Dfix277Quasi': JSON.stringify({ 'シオン': { seen: [1], last: 1, ali: ['少女'] } }) } });
  w.__seed = null; const ctx = installAccessor(w);
  vm.runInContext(fs.readFileSync(path.join(__dirname, FILES.fix277), 'utf8'), ctx, { filename: 'fix277' });
  let n = null; try { n = w.__v292QuasiPack.normalizeConvWho('no-state'); } catch (e) { n = 'ERR:' + e.message; }
  ok('★S 無しでも例外で止まらない', n === 0, n);
  ok('★S 無しなら会話ログを書き換えない', !Object.keys(w.__store).some(k => /^chr6_bk_fix538_/.test(k)), Object.keys(w.__store));
  ok('★S 無しは診断に残る(無言の空振りにしない)', w.__chronicleState.stats().byFeature.fix277.misses > 0,
     w.__chronicleState.stats().byFeature);
}

console.log('\n== (5) 既存挙動の一致: API がある時と window.S だけの時で結果が同じ ==');
function runNormalize(useApi){
  const store = { 'v292Dfix277Quasi': JSON.stringify({ 'シオン': { seen: [1, 2], last: 2, ali: ['少女'] } }),
    'chr6': JSON.stringify({ turns: [] }) };   /* 控えの元になる物語blob */
  const w = mkWin({ store });
  const S = { cast: { hero: { name: 'アリア' }, npcs: [{ name: 'カエデ' }] }, save(){},
    turns: [{ _convSays: [{ who: '少女', say: 'やっと来てくれた' }, { who: 'カエデ', say: 'ここは' }] },
            { _convSays: [{ who: '少女', say: 'シオンっていうんだ' }] }] };
  let ctx;
  if (useApi){ w.__seed = S; ctx = installAccessor(w); }
  else { ctx = vm.createContext(w); w.S = S; }
  vm.runInContext(fs.readFileSync(path.join(__dirname, FILES.fix277), 'utf8'), ctx, { filename: 'fix277' });
  const n = w.__v292QuasiPack.normalizeConvWho('cmp');
  const who = []; S.turns.forEach(t => (t._convSays || []).forEach(c => who.push(c.who)));
  return { n: n, who: who.join(','), bk: Object.keys(w.__store).filter(k => /^chr6_bk_fix538_/.test(k)).length };
}
{
  const a = runNormalize(true), b = runNormalize(false);
  ok('★API 経路で 2 件統合される', a.n === 2 && a.who === 'シオン,カエデ,シオン', a);
  ok('★window.S だけの経路と完全一致(挙動不変)', JSON.stringify(a) === JSON.stringify(b), [a, b]);
  ok('控えが取られている(fail-closed の前提)', a.bk === 1, a.bk);
}

console.log('\n== (6) 実装の後退防止 ==');
{
  const src277 = fs.readFileSync(path.join(__dirname, FILES.fix277), 'utf8');
  ok('★fix538b の永続キャッシュ(_lastS)が撤去されている', src277.indexOf('_lastS') < 0);
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'latin1');
  ok('★index.html に window.S を生やしていない(休眠コードを起こさない)',
     html.indexOf("Object.defineProperty(window, 'S'") < 0 && !/\n\s*window\.S\s*=[^=]/.test(html));
  ok('index.html が正式APIを定義している', html.indexOf('__chronicleGetState') > 0);
  Object.keys(FILES).forEach(function (fx) {
    const s = fs.readFileSync(path.join(__dirname, FILES[fx]), 'utf8');
    ok(fx + ': 正式APIを第一経路にしている',
       s.indexOf('window.__chronicleGetState') > 0 && s.indexOf("g('" + fx + "')") > 0, fx);
    ok(fx + ': フォールバックが救った場合も記録する(fix539b)',
       s.indexOf("'rescued-by-lexical'") > 0 && s.indexOf("'legacy-eval-threw'") > 0, fx);
  });
}

console.log('\n== (7) fix539b: 失敗段階を区別して残す ==');
{
  const w = mkWin(); w.__seed = null; installAccessor(w);
  w.__chronicleGetState('fixA');
  const st = w.__chronicleState.stats();
  const r = st.recent && st.recent[0];
  ok('★失敗理由が残る(getter-returned-null)', r && r.reason === 'getter-returned-null', st.recent);
  ok('★ページ状態も残る', r && typeof r.topLevel === 'boolean' && 'readyState' in r, r);
  const ALLOWED = ['feature', 'reason', 'errorName', 'errorMessage', 'readyState', 'visibilityState', 'topLevel', 'ts'];
  ok('★許可した項目しか残さない(本文やセーブ内容を記録しない)',
     r && Object.keys(r).every(k => ALLOWED.indexOf(k) >= 0), r && Object.keys(r));
  for (let i = 0; i < 30; i++) w.__chronicleGetState('fixA');
  ok('★リングバッファは20件で頭打ち', w.__chronicleState.stats().recent.length === 20,
     w.__chronicleState.stats().recent.length);
}
{
  /* getter が null を返しても後方互換が救えたら、その事実を記録する（機序特定の決定打） */
  const w = mkWin(); w.__seed = null; const ctx = installAccessor(w);
  w.S = { cast: { hero: { name: 'アリア' }, npcs: [] }, turns: [], save(){} };
  vm.runInContext(fs.readFileSync(path.join(__dirname, FILES.fix145), 'utf8'), ctx, { filename: 'fix145' });
  let names = null; try { names = w.__v292Dfix145x.collectChars().story.map(s => s.name); } catch (e) { names = 'ERR'; }
  const reasons = w.__chronicleState.stats().recent.map(x => x.reason);
  ok('★getter が null でも後方互換で動き続ける', Array.isArray(names), names);
  ok('★「救われた」ことが記録される', reasons.indexOf('rescued-by-window') >= 0 ||
     reasons.indexOf('rescued-by-lexical') >= 0, reasons);
}

console.log('\n== (7b) fix539c: 読取専用フォレンジックが成立する順序か ==');
{
  /* 2026-07-25 実測: 配信JSを new Function へ流してモックwindowを渡す検証手法では、
     bare S が**本物のページの const S** へ解決する(モック7ターンのはずが本物38ターンを返した)。
     lexical を window.S より先に見ていると、モックを渡しても本物のSで測ってしまい、
     「12物語すべて0件」という**無意味な全ゼロ**が返る(実際に一度そうなった)。
     → window.S を lexical より先に見る。本番では window.S は undefined なので挙動は変わらない。 */
  Object.keys(FILES).forEach(function (fx) {
    const s = fs.readFileSync(path.join(__dirname, FILES[fx]), 'utf8');
    const iWin = s.indexOf("'rescued-by-window'");
    const iLex = s.indexOf("'rescued-by-lexical'");
    ok(fx + ': window.S を lexical S より先に見る(モックが勝てる)', iWin > 0 && iLex > 0 && iWin < iLex, [iWin, iLex]);
  });
}
{
  /* 正式APIが無い状況で、モックの window.S が使われることを実際に確認する */
  const w = mkWin();
  const ctx = vm.createContext(w);
  w.S = { cast: { hero: { name: 'モック主人公' }, npcs: [{ name: 'モックNPC' }] }, turns: [], save(){} };
  vm.runInContext(fs.readFileSync(path.join(__dirname, FILES.fix145), 'utf8'), ctx, { filename: 'fix145' });
  let names = null; try { names = w.__v292Dfix145x.collectChars(); } catch (e) { names = 'ERR:' + e.message; }
  ok('★API が無くてもモックの window.S で動く(フォレンジックの前提)', names && typeof names === 'object', names);
}

console.log('\n== (8) 「未再現」と判断した前提が崩れていないか ==');
{
  /* 2026-07-25: ハーネスが非表示の「▶ 物語を始める」を直接 .click() し、
     35ターンの物語へ「幕開け」ターンを3つ追記してしまった。
     実測で #welcome は turns>0 のとき display:none / 矩形0x0 = 人間には到達不能だったため、
     GPTと合意のうえ**製品側は修正しない(再現せず)**とした。
     その判断の前提(3経路の非表示条件)が将来崩れたらここで気づけるようにする。 */
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'latin1');
  const u8 = Buffer.from(html, 'latin1').toString('utf8');
  ok('★renderAll が turns>0 で welcome を隠す',
     /wl\.style\.display\s*=\s*S\.turns\.length\s*\?\s*'none'\s*:\s*'block'/.test(u8));
  ok('★appendTurn が welcome を隠す',
     /getElementById\('welcome'\)\.style\.display\s*=\s*'none'/.test(u8));
  ok('★_showIntro は turns===0 のときだけ呼ばれる',
     /if\s*\(\s*S\.turns\.length\s*===\s*0\s*\)\s*this\._showIntro\(\)/.test(u8));
  ok('開始ボタンは welcomeActions の中にある(単独で露出していない)',
     u8.indexOf('id="welcomeActions"') > 0 &&
     u8.indexOf('id="welcomeActions"') < u8.indexOf('G.startScene()'));
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
