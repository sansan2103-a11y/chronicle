/* 回帰テスト: v292Dfix635 — 新しい物語の保存ガードを「実際に効く形」で武装し直す
 *
 * 固定すること:
 *   (0) 真因の固定 … fix600 が window.S を読んでいる（＝const S のこのページでは永久に届かない）
 *   (1) fix635 は正式API(__chronicleGetState)で S を取れる
 *   (2) ?new=1 が無ければ何もしない（既存の物語に影響しない）
 *   (3) 止める条件は fix600 と完全同一（disk<=0 かつ memory>=2 のときだけ）
 *   (4) 止めたときは localStorage へ1バイトも書かない（消しも上書きもしない）
 *   (5) 通すときは元の save がそのまま呼ばれる
 *   (6) OFFスイッチが効く（v292Dfix635Off / v292Dfix600Off の両方）
 *   (7) 冪等（二重ロードで二重ラップしない）
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

const SRC635 = read('v292Dfix635-new-story-guard-rearm.js');
const SRC600 = read('v292Dfix600-new-story-guard.js');
const HTML   = fs.readFileSync(path.join(__dirname, 'index.html'), 'latin1');

/* index.html の fix539 アクセサを本物から切り出す（テストが本番と乖離しないように） */
function extractAccessor(){
  const i = HTML.indexOf('(function v292Dfix539(){');
  const j = HTML.indexOf('})();', i);
  if (i < 0 || j < 0) return null;
  return Buffer.from(HTML.slice(i, j + 5), 'latin1').toString('utf8');
}

function mkWin(opts){
  opts = opts || {};
  const store = Object.assign({}, opts.store || {});
  const ses = {};
  const ls = {
    getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    key: i => { const a = Object.keys(store); return i < a.length ? a[i] : null; },
    get length(){ return Object.keys(store).length; }
  };
  const errs = [], warns = [];
  const timers = [];
  const w = {
    localStorage: ls,
    sessionStorage: { getItem: k => (k in ses ? ses[k] : null), setItem: (k, v) => { ses[k] = String(v); } },
    console: { log(){}, warn: (...a) => warns.push(a.join(' ')), error: (...a) => errs.push(a.join(' ')) },
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    clearTimeout(){}, setInterval: () => 0, clearInterval(){},
    location: { search: opts.search || '' },
    document: { readyState: 'complete', addEventListener(){}, getElementById: () => null }
  };
  w.window = w; w.__store = store; w.__ses = ses; w.__errs = errs; w.__warns = warns; w.__timers = timers;
  return w;
}

/* index.html と同じ「S と同一スコープ」を再現し、そこへ fix635 を読み込む */
function boot(w, S, src){
  const ctx = vm.createContext(w);
  vm.runInContext('let S = __seed;\n' + extractAccessor() + '\nglobalThis.__setS = function(v){ S = v; };\n',
                  ctx, { filename: 'index.html:fix539' });
  vm.runInContext(src || SRC635, ctx, { filename: 'fix635' });
  return ctx;
}
function mkS(turns){
  const s = { cast: { hero: { name: '' }, npcs: [] }, scene: {}, turns: turns.slice(), saved: 0 };
  s.save = function(){ s.saved++; };
  return s;
}
function drainTimers(w, n){
  for (let i = 0; i < (n || 5); i++){
    const t = w.__timers.splice(0);
    if (!t.length) break;
    t.forEach(fn => { try { fn(); } catch(e){} });
  }
}

console.log('\n== (0) 真因の固定: fix600 は window.S を読んでいる ==');
{
  ok('★fix600 の memTurns が window.S を読む', /function memTurns\(\)\{[\s\S]{0,120}var S = window\.S;/.test(SRC600.replace(/\n/g, '')) || SRC600.indexOf('var S = window.S;') >= 0);
  ok('★fix600 の wrapSave も window.S を読む', (SRC600.match(/var S = window\.S;/g) || []).length >= 2,
     (SRC600.match(/var S = window\.S;/g) || []).length);
  ok('★index.html の S はトップレベル const（window に出ない）',
     Buffer.from(HTML, 'latin1').toString('utf8').indexOf('const S = {') >= 0);
  ok('★index.html のどこにも window.S への代入が無い',
     !/window\.S\s*=[^=]/.test(Buffer.from(HTML, 'latin1').toString('utf8')));
  ok('★fix635 は window.S を「唯一の経路」にしていない',
     SRC635.indexOf('__chronicleGetState') >= 0);
}

console.log('\n== (1) 正式APIで S に届く ==');
{
  const w = mkWin({ search: '?story=abc&new=1', store: { 'chr6_slot_abc': JSON.stringify({ turns: [] }) } });
  w.__seed = mkS([]);
  boot(w, w.__seed);
  ok('★state が取れる', w.__v292Dfix635.getState() === w.__seed);
  ok('★memTurns が -1 でない（fix600 との違いはここだけ）', w.__v292Dfix635.memTurns() === 0, w.__v292Dfix635.memTurns());
  drainTimers(w);
  ok('★S.save を包めた', w.__v292Dfix635.state().wrapped === true, w.__v292Dfix635.state());
}

console.log('\n== (2) ?new=1 が無ければ何もしない ==');
{
  const w = mkWin({ search: '?story=abc', store: { 'chr6_slot_abc': JSON.stringify({ turns: [] }) } });
  const S = mkS([{}, {}, {}]);
  w.__seed = S; boot(w, S); drainTimers(w);
  ok('armed=false', w.__v292Dfix635.state().armed === false);
  ok('wrapped=false（save を包まない）', w.__v292Dfix635.state().wrapped === false);
  S.save();
  ok('★保存はそのまま通る', S.saved === 1);
}
{
  const w = mkWin({ search: '?new=1' });   // story= が無い
  w.__seed = mkS([{}, {}]); boot(w, w.__seed); drainTimers(w);
  ok('story= が無ければ何もしない', w.__v292Dfix635.state().armed === false);
}

console.log('\n== (3) 止める条件は fix600 と完全同一 ==');
function guard(diskTurns, memTurns, extra){
  const store = {};
  if (diskTurns >= 0) store['chr6_slot_abc'] = JSON.stringify({ turns: new Array(diskTurns).fill({}) });
  Object.assign(store, extra || {});
  const w = mkWin({ search: '?story=abc&new=1', store });
  const S = mkS(new Array(memTurns).fill({}));
  w.__seed = S; boot(w, S); drainTimers(w);
  return { w, S };
}
{
  const { w } = guard(0, 0);
  ok('disk=0 memory=0 → 止めない', w.__v292Dfix635.shouldBlock() === null);
}
{
  const { w, S } = guard(0, 1);
  ok('★disk=0 memory=1（新品の正常な1手目）→ 絶対に止めない', w.__v292Dfix635.shouldBlock() === null);
  S.save();
  ok('  実際に保存が通る', S.saved === 1);
}
{
  const { w, S } = guard(0, 2);
  ok('★disk=0 memory=2 → 止める', !!w.__v292Dfix635.shouldBlock(), w.__v292Dfix635.shouldBlock());
  S.save();
  ok('  実際に保存が止まる', S.saved === 0, S.saved);
  ok('  止めた回数が数えられている', w.__v292Dfix635.state().blocked === 1);
  ok('  ホームへの案内が残る', String(w.__ses['chr6_home_notice'] || '').indexOf('保存を止めました') >= 0);
  ok('  エラーとして知らせている（無言にしない）', w.__errs.length >= 1);
}
{
  const { w, S } = guard(0, 20);
  ok('★disk=0 memory=20（2026-07-27 の実際の事故）→ 止める', !!w.__v292Dfix635.shouldBlock());
  S.save(); ok('  保存が止まる', S.saved === 0);
}
{
  const { w, S } = guard(5, 20);
  ok('★disk>0（自前の中身がある）→ もう新品ではないので止めない', w.__v292Dfix635.shouldBlock() === null);
  S.save(); ok('  保存が通る', S.saved === 1);
}
{
  const { w } = guard(-1, 3);   // ディスクにスロットが無い
  ok('ディスクに無い(-1) + memory=3 → 止める', !!w.__v292Dfix635.shouldBlock());
}

console.log('\n== (4) 止めても localStorage は1バイトも変わらない ==');
{
  const store = { 'chr6_slot_abc': JSON.stringify({ turns: [] }), 'chr6_other': 'keep' };
  const w = mkWin({ search: '?story=abc&new=1', store });
  const S = mkS([{}, {}]); w.__seed = S; boot(w, S); drainTimers(w);
  const before = JSON.stringify(w.__store);
  S.save(); S.save(); S.save();
  ok('★止めた後もストアが同一（消しも上書きもしない）', JSON.stringify(w.__store) === before,
     { before, after: JSON.stringify(w.__store) });
  ok('★元データが残っている', w.__store['chr6_other'] === 'keep');
}

console.log('\n== (5) 通すときは元の save がそのまま呼ばれる（引数と this も） ==');
{
  const store = { 'chr6_slot_abc': JSON.stringify({ turns: [{}, {}, {}] }) };
  const w = mkWin({ search: '?story=abc&new=1', store });
  let seen = null, thisOk = false;
  const S = mkS([{}, {}, {}]);
  S.save = function(a, b){ seen = [a, b]; thisOk = (this === S); };
  w.__seed = S; boot(w, S); drainTimers(w);
  S.save('x', 42);
  ok('★引数が素通しされる', JSON.stringify(seen) === JSON.stringify(['x', 42]), seen);
  ok('★this が保たれる', thisOk === true);
}

console.log('\n== (6) OFFスイッチ ==');
{
  const store = { 'chr6_slot_abc': JSON.stringify({ turns: [] }), 'v292Dfix635Off': '1' };
  const w = mkWin({ search: '?story=abc&new=1', store });
  const S = mkS([{}, {}]); w.__seed = S; boot(w, S); drainTimers(w);
  ok('v292Dfix635Off=1 で armed しない', w.__v292Dfix635.state().armed === false);
  S.save(); ok('  保存はそのまま通る', S.saved === 1);
}
{
  const store = { 'chr6_slot_abc': JSON.stringify({ turns: [] }), 'v292Dfix600Off': '1' };
  const w = mkWin({ search: '?story=abc&new=1', store });
  const S = mkS([{}, {}]); w.__seed = S; boot(w, S); drainTimers(w);
  ok('★v292Dfix600Off=1 でも止まる（逃げ道は2つ）', w.__v292Dfix635.state().armed === false);
  S.save(); ok('  保存はそのまま通る', S.saved === 1);
}

console.log('\n== (7) 冪等 ==');
{
  const store = { 'chr6_slot_abc': JSON.stringify({ turns: [] }) };
  const w = mkWin({ search: '?story=abc&new=1', store });
  const S = mkS([{}, {}]); w.__seed = S;
  const ctx = boot(w, S); drainTimers(w);
  const wrapped1 = S.save;
  vm.runInContext(SRC635, ctx, { filename: 'fix635#2' });   // 二重ロード
  drainTimers(w);
  ok('★二重ロードで save を二重に包まない', S.save === wrapped1);
  S.save();
  ok('  止まる回数も1回だけ数える', w.__v292Dfix635.state().blocked === 1, w.__v292Dfix635.state());
}

console.log('\n== (8) 共有ポインタの是正（fix600 と同じ挙動を保つ） ==');
{
  const store = { 'chr6_slot_abc': JSON.stringify({ turns: [] }), 'chr6_active_slot': JSON.stringify('other') };
  const w = mkWin({ search: '?story=abc&new=1', store });
  w.__seed = mkS([]); boot(w, w.__seed);
  ok('★別タブが書いたポインタをこの物語へ直す', w.__store['chr6_active_slot'] === JSON.stringify('abc'),
     w.__store['chr6_active_slot']);
}

console.log('\n== (9) selfTest が実機で読める形になっている ==');
{
  const store = { 'chr6_slot_abc': JSON.stringify({ turns: [] }) };
  const w = mkWin({ search: '?story=abc&new=1', store });
  w.__seed = mkS([{}, {}]); boot(w, w.__seed); drainTimers(w);
  const t = w.__v292Dfix635.selfTest();
  ok('selfTest に必要な項目がある',
     t && t.armed === true && t.wrapped === true && t.stateReachable === true && !!t.wouldBlockNow, t);
}

console.log('\n== (10) index.html に配線されている ==');
{
  const h = Buffer.from(HTML, 'latin1').toString('utf8');
  ok('★script タグがある', h.indexOf('v292Dfix635-new-story-guard-rearm.js') >= 0);
  ok('★fix600 より後に読み込む（包み直しが外側になる）',
     h.indexOf('v292Dfix635-new-story-guard-rearm.js') > h.indexOf('v292Dfix600-new-story-guard.js'));
  ok('★index.html の NUL バイトが1個のまま',
     fs.readFileSync(path.join(__dirname, 'index.html')).filter(b => b === 0).length === 1);
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
