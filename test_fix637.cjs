/* 回帰テスト: v292Dfix637 — 「登録キャストが空のまま進む」を無言にしない観測層
 *
 * このテストが固定する事実（監査 2026-07-29）:
 *   S.cast.npcs へ書き込む生きた経路は5つだけで、そのうち **人が触らなくても埋まるのは
 *   features.js §8 auto_bootstrap だけ**。その §8 が `if (!window.S) return;` で始まり、
 *   このページの S はトップレベル const（window.S は永久に undefined）＝**一度も走っていない**。
 *
 * 固定すること:
 *   (0) 真因の固定（features.js §8/§9/§10 と fix50 が window.S を hard gate にしている）
 *   (1) 既定では**1バイトも書かない**（proposal / report / check は読み取り専用）
 *   (2) 3ターン以上進んで cast が空なら警告する（無言にしない）／1回だけ
 *   (3) hero が入っていれば提案しない（人の設定を上書きしない）
 *   (4) apply() は許可フラグ無しでは書かない。許可時のみ、空欄だけ埋める
 *   (5) deadPaths() が休眠を実測で判定できる
 *   (6) OFF / 冪等 / index.html 配線
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

const SRC637 = read('v292Dfix637-cast-bootstrap-probe.js');
const FEAT   = read('features.js');
const HTML   = fs.readFileSync(path.join(__dirname, 'index.html'), 'latin1');
const HTMLU  = Buffer.from(HTML, 'latin1').toString('utf8');

function extractAccessor(){
  const i = HTML.indexOf('(function v292Dfix539(){');
  const j = HTML.indexOf('})();', i);
  return Buffer.from(HTML.slice(i, j + 5), 'latin1').toString('utf8');
}

/* features.js §8 の純粋関数（extractKatakanaNames / extractSceneLoc / extractSceneObj）を
   **本物のソースから切り出して**モックへ載せる。テストが自前実装と乖離しないようにする。 */
function realHelpers(){
  const i = FEAT.indexOf('(function autoBootstrap(){');
  const END = '  })();';
  const j = FEAT.indexOf(END, FEAT.indexOf("'registered (render hook + initial sweep)'"));
  if (i < 0 || j < 0) throw new Error('features.js から autoBootstrap を切り出せない');
  const body = FEAT.slice(i, j + END.length);
  const sandbox = { console: { log(){}, warn(){} } };
  vm.createContext(sandbox);
  vm.runInContext(
    'var __out = {};\n' +
    body.replace('(function autoBootstrap(){', '(function autoBootstrap(){')
        .replace('whenReady(register);', '__out.extractKatakanaNames = extractKatakanaNames;'
                                       + '__out.extractSceneLoc = extractSceneLoc;'
                                       + '__out.extractSceneObj = extractSceneObj;'
                                       + '__out.extractFromState = extractFromState;')
    , sandbox, { filename: 'features.js:autoBootstrap' });
  return sandbox.__out;
}
const HELP = realHelpers();

function mkWin(opts){
  opts = opts || {};
  const store = Object.assign({}, opts.store || {});
  const ls = {
    getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    key: i => { const a = Object.keys(store); return i < a.length ? a[i] : null; },
    get length(){ return Object.keys(store).length; }
  };
  const warns = [], timers = [];
  const w = {
    localStorage: ls,
    console: { log(){}, warn: (...a) => warns.push(a.join(' ')), error(){} },
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    clearTimeout(){}, setInterval: () => 0, clearInterval(){},
    document: { readyState: 'complete', addEventListener(){} },
    __v292: opts.noHelpers ? {} : { autoBootstrap: HELP }
  };
  w.window = w; w.__store = store; w.__warns = warns; w.__timers = timers;
  return w;
}
function boot(w, S){
  const ctx = vm.createContext(w);
  vm.runInContext('let S = __seed;\n' + extractAccessor() + '\n', ctx, { filename: 'index.html:fix539' });
  vm.runInContext(SRC637, ctx, { filename: 'fix637' });
  return ctx;
}
function mkS(hero, npcs, turns, scene){
  const s = { cast: { hero: hero, npcs: npcs }, scene: scene || { loc: '', obj: '' }, turns: turns, saved: 0 };
  s.save = function(){ s.saved++; };
  return s;
}

console.log('\n== (0) 真因の固定: window.S を hard gate にしている休眠モジュール ==');
{
  ok('★index.html の S はトップレベル const', HTMLU.indexOf('const S = {') >= 0);
  ok('★window.S への代入がどこにも無い', !/window\.S\s*=[^=]/.test(HTMLU));
  ok('★features.js §8 auto_bootstrap は !window.S で即 return',
     FEAT.indexOf('if (!window.S || !S.cast) return;') >= 0);
  ok('★§8 の extractFromState も !window.S で null',
     /function extractFromState\(\)\{?\s*[\r\n ]*if \(!window\.S\) return null;/.test(FEAT.replace(/\n/g, '\n')) ||
     FEAT.indexOf('if (!window.S) return null;') >= 0);
  ok('★§9 memory の buildStateBlock も !window.S で空文字',
     FEAT.indexOf("if (!window.S || !S.cast) return '';") >= 0);
  ok('★fix50 の getRoster も window.S だけを見る',
     FEAT.indexOf("var S = (typeof window !== 'undefined' && window.S) ? window.S : null;") >= 0);
  /* cast.npcs へ書く生きた経路の本数を固定する（増減したら気づけるように） */
  const writers = [
    ['features.js §7 syncStateFromForm（設定フォーム）', /S\.cast\.npcs\[i\]\.name = nameEl\.value\.trim\(\)/],
    ['features.js §8 auto_bootstrap',                    /S\.cast\.npcs\.push\(\{ name: np\.name/],
    ['features.js fix42 wizard',                         /S\.cast\.npcs\.push\(npc\)/]
  ];
  writers.forEach(([label, re]) => ok('経路が残っている: ' + label, re.test(FEAT)));
  ok('経路が残っている: fix145 promoteToNpc',
     read('v292Dfix145-charlist.js').indexOf("st.cast.npcs.push({ name: name, desc: desc, appeared: true })") >= 0);
  ok('経路が残っている: fix351 commitDraft',
     read('v292Dfix351-settings-draft.js').indexOf('S.cast.npcs = list;') >= 0);
}

console.log('\n== (1) 既定では1バイトも書かない ==');
{
  const S = mkS({ name: '' }, [], [
    { playerText: '', narrative: 'ミナはドアを開けた。ソウタが振り返る。' },
    { playerText: '', narrative: 'ミナは廊下へ出た。' },
    { playerText: '', narrative: '図書館の奥でソウタが待っていた。' }
  ]);
  const before = JSON.stringify(S.cast) + '|' + JSON.stringify(S.scene);
  const w = mkWin(); w.__seed = S; boot(w, S);
  const p = w.__v292Dfix637.proposal();
  ok('★候補が出る（hero）', !!(p.hero && p.hero.name), p);
  ok('★候補が出る（npcs）', p.npcs.length >= 1, p.npcs);
  w.__v292Dfix637.report();
  w.__v292Dfix637.check();
  ok('★cast も scene も変わらない', JSON.stringify(S.cast) + '|' + JSON.stringify(S.scene) === before,
     { before, after: JSON.stringify(S.cast) + '|' + JSON.stringify(S.scene) });
  ok('★save を呼ばない', S.saved === 0);
  ok('★localStorage へ書かない', Object.keys(w.__store).length === 0, w.__store);
}

console.log('\n== (2) 空のまま進んでいたら警告する（1回だけ） ==');
{
  const S = mkS({ name: '' }, [], [{ narrative: 'ミナが来た。' }, { narrative: 'ミナが笑う。' }, { narrative: 'ミナが去る。' }]);
  const w = mkWin(); w.__seed = S; boot(w, S);
  const r1 = w.__v292Dfix637.check();
  ok('★3ターンで警告する', !!r1 && r1.heroEmpty === true, r1);
  ok('★警告文に状況が入っている', w.__warns.some(x => x.indexOf('登録キャストが空') >= 0), w.__warns);
  const n = w.__warns.length;
  const r2 = w.__v292Dfix637.check();
  ok('★2回目は黙る（ログを汚さない）', r2 === null && w.__warns.length === n);
}
{
  const S = mkS({ name: '' }, [], [{ narrative: 'ミナが来た。' }, { narrative: 'ミナが笑う。' }]);
  const w = mkWin(); w.__seed = S; boot(w, S);
  ok('★2ターンではまだ警告しない（早すぎる判断をしない）', w.__v292Dfix637.check() === null);
}

console.log('\n== (3) 人が設定した内容は上書き対象にしない ==');
{
  const S = mkS({ name: '白石澪', desc: 'd' }, [], [{ narrative: 'ミナが来た。' }, {}, {}]);
  const w = mkWin(); w.__seed = S; boot(w, S);
  const p = w.__v292Dfix637.proposal();
  ok('★hero が入っていれば提案しない', p.ok === false && p.reason === 'hero-already-set', p);
  /* 主人公が入っていて NPC が0件なのは正常（名無しの存在は fix277/fix307 が持つ）。
     ここで鳴らすとログが常時汚れて本当の異常が埋もれるので、鳴らさないことを固定する。 */
  ok('★hero があれば NPC 0件でも警告しない（ログを汚さない）',
     w.__v292Dfix637.check() === null && w.__warns.length === 0, w.__warns);
}
{
  const S = mkS({ name: '' }, [], []);
  const w = mkWin(); w.__seed = S; boot(w, S);
  ok('ターンが無ければ提案しない', w.__v292Dfix637.proposal().reason === 'no-turns');
}
{
  const S = mkS({ name: '' }, [], [{ narrative: 'ミナが来た。' }]);
  const w = mkWin({ noHelpers: true }); w.__seed = S; boot(w, S);
  ok('★§8 の純粋関数が無ければ推測しない（自前実装で埋めない）',
     w.__v292Dfix637.proposal().reason === 'helpers-missing');
}

console.log('\n== (4) apply() は明示的な許可が要る ==');
{
  const S = mkS({ name: '' }, [], [{ narrative: 'ミナはドアを開けた。ソウタが振り返る。' }, {}, {}]);
  const w = mkWin(); w.__seed = S; boot(w, S);
  const r = w.__v292Dfix637.apply();
  ok('★許可なしでは書かない', r.written === false && r.reason === 'not-allowed', r);
  ok('★cast は空のまま', S.cast.hero.name === '' && S.cast.npcs.length === 0);
  ok('★理由をコンソールに残す', w.__warns.some(x => x.indexOf('v292Dfix637Apply') >= 0));
}
{
  const S = mkS({ name: '' }, [], [{ narrative: 'ミナはドアを開けた。ソウタが振り返る。' }, {}, {}]);
  const w = mkWin({ store: { 'v292Dfix637Apply': '1' } }); w.__seed = S; boot(w, S);
  const r = w.__v292Dfix637.apply();
  ok('★許可があれば書く', r.written === true, r);
  ok('★hero が入る', !!S.cast.hero.name, S.cast.hero);
  ok('★save が呼ばれる', S.saved === 1);
  const snapshot = JSON.stringify(S.cast);
  const r2 = w.__v292Dfix637.apply();
  ok('★2回目は変化なし（冪等）', r2.written === false && JSON.stringify(S.cast) === snapshot, r2);
}
{
  /* 既に入っている欄は絶対に上書きしない */
  const S = mkS({ name: '' }, [{ name: 'ミナ', desc: '既存' }],
                [{ narrative: 'ミナはドアを開けた。ソウタが振り返る。' }, {}, {}],
                { loc: '既存の場所', obj: '' });
  const w = mkWin({ store: { 'v292Dfix637Apply': '1' } }); w.__seed = S; boot(w, S);
  w.__v292Dfix637.apply();
  ok('★既存NPCの desc を壊さない', S.cast.npcs[0].desc === '既存', S.cast.npcs);
  ok('★同名NPCを二重に足さない', S.cast.npcs.filter(n => n.name === 'ミナ').length === 1, S.cast.npcs);
  ok('★既に入っている scene.loc を上書きしない', S.scene.loc === '既存の場所');
}

console.log('\n== (5) deadPaths() が休眠を実測で判定する ==');
{
  const S = mkS({ name: '澪' }, [], [{ narrative: 'x' }]);
  const w = mkWin();
  /* §8 が死んでいる状態（extractFromState が null）を本物と同じ形で再現 */
  w.__v292.autoBootstrap = Object.assign({}, HELP, { extractFromState: function(){ return null; } });
  w.__v292.memory = { buildStateBlock: function(){ return ''; } };
  w.__v292.stateInference = { isEnabled: function(){ return false; } };
  w.Planner = { v292Dfix50: { getRoster: function(){ return []; } } };
  w.__v292Dfix600 = { memTurns: function(){ return -1; } };
  w.__seed = S; boot(w, S);
  const d = w.__v292Dfix637.deadPaths();
  const by = {}; d.forEach(x => { by[x.path] = x; });
  ok('★§8 auto_bootstrap を休眠と判定', by['features.js §8 auto_bootstrap'].alive === false, by);
  ok('★§9 memory を休眠と判定', by['features.js §9 memory(v219) sys注入'].alive === false);
  ok('★§10 は「既定OFF（仕様）」と区別して出す',
     by['features.js §10 state_inference'].detail.indexOf('仕様') >= 0);
  ok('★fix50 声紋ブロックを休眠と判定', by['features.js fix50 声紋ブロック'].alive === false);
  ok('★fix600 を休眠と判定', by['fix600 新物語ガード'].alive === false);
}
{
  /* 生きている側も正しく生と判定できる（判定器が常に false を返すだけではない） */
  const S = mkS({ name: '澪' }, [], [{ narrative: 'x' }]);
  const w = mkWin();
  w.__v292.autoBootstrap = Object.assign({}, HELP, { extractFromState: function(){ return { hero: null, npcs: [], scene: {} }; } });
  w.__v292.memory = { buildStateBlock: function(){ return '# 🧠 ...'; } };
  w.Planner = { v292Dfix50: { getRoster: function(){ return [{ name: '澪' }]; } } };
  w.__v292Dfix600 = { memTurns: function(){ return 3; } };
  w.__seed = S; boot(w, S);
  const by = {}; w.__v292Dfix637.deadPaths().forEach(x => { by[x.path] = x; });
  ok('★生きているものは生と判定する', by['features.js §8 auto_bootstrap'].alive === true
     && by['features.js §9 memory(v219) sys注入'].alive === true
     && by['features.js fix50 声紋ブロック'].alive === true
     && by['fix600 新物語ガード'].alive === true, by);
}

console.log('\n== (6) OFF・冪等・配線 ==');
{
  const S = mkS({ name: '' }, [], [{ narrative: 'ミナが来た。' }, {}, {}]);
  const w = mkWin({ store: { 'v292Dfix637Off': '1' } }); w.__seed = S; boot(w, S);
  ok('★OFFなら警告もしない', w.__v292Dfix637.check() === null && w.__warns.length === 0);
}
{
  const S = mkS({ name: '' }, [], [{ narrative: 'ミナが来た。' }]);
  const w = mkWin(); w.__seed = S;
  const ctx = boot(w, S);
  const first = w.__v292Dfix637;
  vm.runInContext(SRC637, ctx, { filename: 'fix637#2' });
  ok('★二重ロードで初期化し直さない', w.__v292Dfix637 === first);
}
{
  ok('★script タグがある', HTMLU.indexOf('v292Dfix637-cast-bootstrap-probe.js') >= 0);
  ok('★features.js より後に読み込む（__v292.autoBootstrap 公開後）',
     HTMLU.indexOf('v292Dfix637-cast-bootstrap-probe.js') > HTMLU.indexOf('features.js?'));
  ok('★index.html の NUL バイトが1個のまま',
     fs.readFileSync(path.join(__dirname, 'index.html')).filter(b => b === 0).length === 1);
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
