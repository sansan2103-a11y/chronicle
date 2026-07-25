/* 回帰テスト: v292Dfix540 — 別名台帳の壊れた向き(登録キャストが別名側 / 相互別名の循環)を遮断する
 * 由来: 2026-07-25、実セーブ12物語の読取専用フォレンジック。
 *   離島17T `smrisv41ho7` の台帳に `涼太.ali=["霧 涼太"]` と `霧 涼太.ali=["涼太"]` の相互別名があり、
 *   しかも `霧 涼太` はこの物語の**主人公**だった。
 *   実測影響: normalizeConvWho が 霧 涼太→涼太 を36件・涼太→霧 涼太 を7件、同じ1回で総入れ替え。
 * 方針: 連鎖(A→B→C)は**一切触らない**。12物語のうち6物語に正当な連鎖があるため。 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };

function mk(ledger, cast, turns, off){
  const store = {};
  if (off) store['v292Dfix540Off'] = '1';
  if (ledger) store['v292Dfix277Quasi'] = JSON.stringify(ledger);
  const ls = { getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; },
    key: i => Object.keys(store)[i], get length(){ return Object.keys(store).length; } };
  const el = { querySelectorAll: () => [], querySelector: () => null, addEventListener(){}, appendChild(){}, setAttribute(){}, style: {}, remove(){}, insertBefore(){}, classList:{add(){},remove(){},contains:()=>false} };
  const doc = { hidden: false, visibilityState: 'visible', readyState: 'complete', documentElement: el, body: el,
    querySelectorAll: () => [], querySelector: () => null, getElementById: () => null, addEventListener(){},
    createElement: () => ({ style: {}, setAttribute(){}, addEventListener(){}, appendChild(){}, remove(){}, classList:{add(){},remove(){}} }) };
  const warns = [];
  const w = { localStorage: ls, document: doc, console: { log(){}, warn: (...a) => warns.push(a.join(' ')), error(){} },
    setTimeout: () => 0, setInterval: () => 0, clearTimeout(){}, clearInterval(){},
    MutationObserver: function(){ return { observe(){}, disconnect(){} }; },
    navigator: { userAgent: 'node' }, location: { href: 'x', search: '' } };
  w.window = w; w.__warns = warns; w.__store = store;
  w.S = { cast: cast || { hero: { name: '霧 涼太' }, npcs: [{ name: '真鍋 ひかり' }] },
          turns: turns || [], save(){ w.__saved = (w.__saved || 0) + 1; } };
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'v292Dfix277-quasi-pack.js'), 'utf8'),
    vm.createContext(w), { filename: 'fix277' });
  return w;
}

/* 実データそのまま: 相互別名 + 片方が主人公 */
const REAL = () => ({ '涼太': { seen: [3], last: 3, ali: ['霧 涼太'] },
                      '霧 涼太': { seen: [3], last: 3, ali: ['涼太'] },
                      '女将': { seen: [5], last: 5, ali: ['民宿の女将'] } });
const TURNS = () => ([
  { _convSays: [{ who: '霧 涼太', say: 'ここは' }, { who: '真鍋 ひかり', say: 'いこう' }] },
  { _convSays: [{ who: '涼太', say: 'まって' }, { who: '民宿の女将', say: 'おかえり' }] }
]);

console.log('\n== fix540: 実データ(離島17T)の再現と遮断 ==');
{
  const w = mk(REAL(), null, TURNS());
  const map = w.__v292QuasiPack.aliasMap();
  ok('★主人公「霧 涼太」は別名側に立たない', !('霧 涼太' in map), map);
  ok('★短縮形「涼太」→「霧 涼太」は残る(正しい向きは壊さない)', map['涼太'] === '霧 涼太', map);
  ok('無関係な別名(民宿の女将→女将)は残る', map['民宿の女将'] === '女将', map);
  ok('★遮断した事実が記録される', w.__v292Dfix540.dropped().some(d => d.from === '霧 涼太' && d.why === 'cast-is-canonical'),
     w.__v292Dfix540.dropped());
  ok('★警告が出る(無言で落とさない)', w.__warns.some(x => /fix540/.test(x)), w.__warns.length);
}
{
  const w = mk(REAL(), null, TURNS());
  const n = w.__v292QuasiPack.normalizeConvWho('t');
  const who = []; w.S.turns.forEach(t => t._convSays.forEach(c => who.push(c.who)));
  ok('★総入れ替えが起きない(主人公のカードは主人公のまま)', who[0] === '霧 涼太', who);
  ok('★短縮形のカードは正名へ寄る', who[2] === '霧 涼太', who);
  ok('件数は正しい(涼太1件 + 民宿の女将1件)', n === 2, n);
}
{
  /* 冪等性: fix540 前は2回目で元へ戻っていた */
  const w = mk(REAL(), null, TURNS());
  w.__v292QuasiPack.normalizeConvWho('1');
  const a = []; w.S.turns.forEach(t => t._convSays.forEach(c => a.push(c.who)));
  w.__v292QuasiPack._dropCache();
  const n2 = w.__v292QuasiPack.normalizeConvWho('2');
  const b = []; w.S.turns.forEach(t => t._convSays.forEach(c => b.push(c.who)));
  ok('★2回目は0件(冪等)', n2 === 0, n2);
  ok('★2回目で入れ替わらない', a.join(',') === b.join(','), [a, b]);
}

console.log('\n== fix540: 登録キャストが絡まない純粋な循環 ==');
{
  const w = mk({ 'A影': { seen: [1], last: 1, ali: ['B影'] }, 'B影': { seen: [1], last: 1, ali: ['A影'] } },
    { hero: { name: '主人公' }, npcs: [] }, []);
  const map = w.__v292QuasiPack.aliasMap();
  ok('★相互別名は両方落とす(fail-closed)', !('A影' in map) && !('B影' in map), map);
  ok('循環として記録される', w.__v292Dfix540.dropped().some(d => d.why === 'cycle'), w.__v292Dfix540.dropped());
}

console.log('\n== fix540: 壊してはいけないもの ==');
{
  /* 連鎖(A→B→C)は12物語のうち6物語にある正当なデータ。触らない。 */
  const w = mk({ '少女': { seen: [1], last: 1, ali: ['白いワンピースの少女', '観覧車の少女'] },
                 'シオン': { seen: [2], last: 2, ali: ['少女'] } },
    { hero: { name: 'アリア' }, npcs: [] }, []);
  const map = w.__v292QuasiPack.aliasMap();
  ok('★連鎖はそのまま残す(白いワンピースの少女→少女)', map['白いワンピースの少女'] === '少女', map);
  ok('★連鎖はそのまま残す(少女→シオン)', map['少女'] === 'シオン', map);
  ok('連鎖を循環と誤判定しない', w.__v292Dfix540.dropped().length === 0, w.__v292Dfix540.dropped());
}
{
  const w = mk(REAL(), null, TURNS(), true);
  const map = w.__v292QuasiPack.aliasMap();
  ok('★OFFで従来どおり(退行できる)', map['霧 涼太'] === '涼太' && map['涼太'] === '霧 涼太', map);
}
{
  /* 別名がキャスト名を指す向きは正当。落としてはいけない */
  const w = mk({ '霧 涼太': { seen: [1], last: 1, ali: ['涼太', '少年'] } },
    { hero: { name: '霧 涼太' }, npcs: [] }, []);
  const map = w.__v292QuasiPack.aliasMap();
  ok('★キャスト名へ向かう別名は残す', map['涼太'] === '霧 涼太' && map['少年'] === '霧 涼太', map);
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
