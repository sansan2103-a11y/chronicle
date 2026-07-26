/* test_fix573.cjs — 主人公が「無言で消える」のを見張る（fix573）の回帰テスト
 *
 * 固定する契約:
 *   ①「名前があった → 空になった」書込を検知する
 *   ②検知しても**書込は止めない・値は変えない**（挙動を変えない）
 *   ③消える前の値を控える（読み戻して確認する）
 *   ④誤検知を作らない（元から空 / 入れ物ごと無い / 名前が変わっただけ は対象外）
 *   ⑤控えから復元候補を探せる
 *   ⑥他fixの setItem ラッパの own props を消さない（fix419cの教訓）
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c){ pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };

function story(name, desc, turns){
  return JSON.stringify({ turns: new Array(turns || 3).fill({}),
    cast: { hero: { name: name, desc: desc || '', gender: '女性' }, npcs: [{ name: 'ひなた', desc: 'x' }] } });
}
function makeEnv(seed){
  const store = {};
  /* ★2026-07-26の教訓: モックは setItem したキーが `Object.keys(localStorage)` にも
     見えるようにする（本物の Storage はそう振る舞う）。忘れると走査するコードのテストが
     素通りで合格したり、逆に理由不明で落ちたりする。 */
  const ls = {
    getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem(k, v){ store[k] = String(v); expose(k); },
    removeItem(k){ delete store[k]; try { delete ls[k]; } catch(e){} },
    key: i => Object.keys(store)[i] === undefined ? null : Object.keys(store)[i]
  };
  function expose(k){
    if (['getItem','setItem','removeItem','key','length'].indexOf(k) >= 0) return;
    try { Object.defineProperty(ls, k, { configurable:true, enumerable:true,
      get(){ return store[k]; }, set(v){ store[k] = String(v); } }); } catch(e){}
  }
  Object.keys(seed || {}).forEach(function(k){ store[k] = String(seed[k]); expose(k); });
  Object.defineProperty(ls, 'length', { get(){ return Object.keys(store).length; } });
  const el = { remove(){}, style:{}, setAttribute(){}, appendChild(){}, addEventListener(){}, parentNode:null };
  const doc = { readyState:'complete', addEventListener(){}, getElementById: () => null,
                createElement: () => Object.assign({}, el), body: el, documentElement: el };
  const quiet = { log(){}, warn(){}, error(){} };
  const win = { localStorage: ls, document: doc, console: quiet, setTimeout: () => 0, addEventListener(){} };
  win.window = win;
  new Function('window','document','localStorage','console','setTimeout',
    fs.readFileSync(path.join(__dirname, 'v292Dfix573-hero-guard.js'), 'utf8'))(win, doc, ls, quiet, () => 0);
  return { ls, store, win, f: win.__v292Dfix573 };
}
const bks = s => Object.keys(s).filter(k => k.indexOf('chr6_bk_fix573_hero_') === 0);

console.log('\n== 1. ★名前が消える書込を検知し、控えを取る ==');
{
  const e = makeEnv({ 'chr6_slot_smA': story('白石澪', 'あ'.repeat(172), 21), 'chr6_active_slot': '"smA"' });
  e.ls.setItem('chr6_slot_smA', story('', '', 21));            /* 名前が空になる保存 */
  const s = e.f.stats();
  ok('★検知した', s.losses === 1, s);
  ok('★消えた名前を記録している', s.lastLoss && s.lastLoss.lostName === '白石澪', s.lastLoss);
  ok('★説明の長さも記録', s.lastLoss && s.lastLoss.lostDescLen === 172, s.lastLoss);
  ok('★控えを取った', bks(e.store).length === 1, bks(e.store));
  ok('★呼び出し元の手がかり(stack)がある', !!(s.lastLoss && s.lastLoss.stack));
  ok('ログに残る', e.f.log().length === 1, e.f.log().length);
}

console.log('\n== 2. ★書込は止めない・値は変えない ==');
{
  const e = makeEnv({ 'chr6_slot_smA': story('白石澪', 'x', 21) });
  const newVal = story('', '', 21);
  e.ls.setItem('chr6_slot_smA', newVal);
  ok('★書込はそのまま通っている', e.ls.getItem('chr6_slot_smA') === newVal);
  ok('★勝手に復元していない', e.f._heroNameOf(e.ls.getItem('chr6_slot_smA')) === '');
}

console.log('\n== 3. 誤検知を作らない ==');
{
  const e = makeEnv({ 'chr6_slot_smA': story('', '', 3) });
  e.ls.setItem('chr6_slot_smA', story('', '', 4));
  ok('元から空 → 検知しない', e.f.stats().losses === 0);
}
{
  const e = makeEnv({ 'chr6_slot_smA': story('白石澪', 'x', 3) });
  e.ls.setItem('chr6_slot_smA', story('霧 涼太', 'y', 3));
  ok('名前が変わっただけ → 検知しない', e.f.stats().losses === 0);
}
{
  const e = makeEnv({ 'chr6_slot_smA': JSON.stringify({ turns: [], cast: { npcs: [] } }) });
  e.ls.setItem('chr6_slot_smA', story('', '', 1));
  ok('入れ物ごと無い → 検知しない', e.f.stats().losses === 0);
}
{
  const e = makeEnv({ 'v292en_x': 'a' });
  e.ls.setItem('v292en_x', 'b');
  ok('物語以外のキー → そもそも見ない', e.f.stats().checked === 0, e.f.stats());
}
{
  const e = makeEnv({ 'chr6': story('アリア', 'x', 5) });
  e.ls.setItem('chr6', story('', '', 5));
  ok('★既定枠 chr6 も対象（chr6_slot_* だけ見ると取りこぼす）', e.f.stats().losses === 1);
}

console.log('\n== 4. 復元候補を控えから探せる ==');
{
  const e = makeEnv({
    'chr6_slot_smA': story('', '', 21),
    'chr6_active_slot': '"smA"',
    'chr6_bk_guard_smA_1': story('白石澪', 'あ'.repeat(172), 27),
    'chr6_bk_fix458_smA_2': story('白石澪', 'あ'.repeat(172), 20),
    'chr6_bk_cloudsync_3': JSON.stringify({ ls: { 'chr6_slot_smA': story('白石澪', 'い'.repeat(100), 10) } })
  });
  const c = e.f.candidates('chr6_slot_smA');
  ok('★候補が見つかる', c.length === 3, c.length);
  ok('★ターン数が多い順に並ぶ', c[0].turns === 27, c.map(x => x.turns));
  ok('★丸ごと控えの中も探せる', c.some(x => x.from.indexOf('cloudsync') >= 0), c.map(x => x.from));
  ok('名前と説明の長さが出る', c[0].name === '白石澪' && c[0].descLen === 172, c[0]);
}

console.log('\n== 5. 起動時の点検 ==');
{
  const e = makeEnv({ 'chr6_slot_smA': story('', '', 21), 'chr6_active_slot': '"smA"',
                      'chr6_bk_guard_smA_1': story('白石澪', 'x', 27) });
  const r = e.f.check();
  ok('★いま空だと分かる', r.empty === true, r);
  ok('対象のキーを正しく選んでいる', r.key === 'chr6_slot_smA', r.key);
  ok('復元候補を添えて返す', r.candidates.length === 1, r.candidates);
}
{
  const e = makeEnv({ 'chr6_slot_smA': story('白石澪', 'x', 21), 'chr6_active_slot': '"smA"' });
  ok('正常なら empty=false', e.f.check().empty === false);
}

console.log('\n== 6. 他fixの setItem ラッパを壊さない（fix419cの教訓） ==');
{
  const e = makeEnv({ 'chr6_slot_smA': story('白石澪', 'x', 3) });
  /* 先に他fixが包み、印を付けている状態を作る */
  const inner = e.ls.setItem;
  const other = function(k, v){ return inner.call(e.ls, k, v); };
  other.__f490 = true; other.__f543 = true;
  e.ls.setItem = other;
  e.f._wrap();
  ok('★他fixの印が残っている(__f490)', e.ls.setItem.__f490 === true);
  ok('★他fixの印が残っている(__f543)', e.ls.setItem.__f543 === true);
  ok('自分の印も付く', e.ls.setItem.__f573 === true);
  e.f._wrap();
  ok('二重には包まない', e.ls.setItem.__f573 === true && e.f.stats().losses === 0);
}

console.log('\n== 7. OFFスイッチ ==');
{
  const e = makeEnv({ 'v292Dfix573Off': '1', 'chr6_slot_smA': story('白石澪', 'x', 3) });
  e.ls.setItem('chr6_slot_smA', story('', '', 3));
  ok('OFF なら検知しない', e.f.stats().losses === 0);
  ok('OFF でも書込は通る', e.f._heroNameOf(e.ls.getItem('chr6_slot_smA')) === '');
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
