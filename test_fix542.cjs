/* 回帰テスト: v292Dfix542 — 引用直前の地の文を構文タイプへ分類する（診断のみ・判定には未接続）
 * 由来: 実データ 離島17T `smrisv41ho7` ターン8 #2。
 *   直前が「大浦の声が掠れている。」なのに prev側の証拠が25点・hardなしで、台詞が涼太のまま残った。
 * GPT裁定: prev側を一律hard化してはいけない。次の4型を分けてから使う。
 *   「Xの声が掠れた/響いた/落ちた」= X が話し手
 *   「Xの声に、Yは〜」            = X は聞かれた側
 *   「Xの声を遮ってYが〜」         = Y が話し手
 *   「Xの声を思い出した」          = 証拠ではない */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };

function load(){
  const store = {};
  const ls = { getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; },
    key: i => Object.keys(store)[i], get length(){ return Object.keys(store).length; } };
  const el = { querySelectorAll: () => [], querySelector: () => null, addEventListener(){}, appendChild(){}, setAttribute(){}, style: {}, remove(){}, classList:{add(){},remove(){},contains:()=>false} };
  const doc = { hidden: false, visibilityState: 'visible', readyState: 'complete', documentElement: el, body: el,
    querySelectorAll: () => [], querySelector: () => null, getElementById: () => null, addEventListener(){},
    createElement: () => ({ style: {}, setAttribute(){}, addEventListener(){}, appendChild(){}, remove(){}, classList:{add(){},remove(){}} }) };
  const w = { localStorage: ls, document: doc, console: { log(){}, warn(){}, error(){} },
    setTimeout: () => 0, setInterval: () => 0, clearTimeout(){}, clearInterval(){},
    MutationObserver: function(){ return { observe(){}, disconnect(){} }; },
    navigator: { userAgent: 'node' }, location: { href: 'x', search: '' } };
  w.window = w;
  w.S = { cast: { hero: { name: '霧 涼太' }, npcs: [{ name: '大浦 源蔵' }, { name: '真鍋 ひかり' }] }, turns: [], save(){} };
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'v292Dfix469-speaker-score.js'), 'utf8'),
    vm.createContext(w), { filename: 'fix469' });
  return w;
}
const w = load();
const A = (line) => w.__v292Dfix469.preQuoteAnchor(line, ['霧 涼太', '大浦 源蔵', '真鍋 ひかり']);

console.log('\n== fix542: 実データ(離島17T T8)の型 ==');
{
  const r = A('大浦の声が掠れている。乾いた砂のような質感だ。');
  ok('★「大浦の声が掠れている」→ 大浦がアンカー', r && r.use && r.name === '大浦 源蔵' && r.kind === 'pre-quote-voice', r);
  const r2 = A('涼太の声が、乾いた空気に落ちる。');
  ok('★「涼太の声が…落ちる」→ 涼太がアンカー', r2 && r2.use && r2.name === '霧 涼太', r2);
}

console.log('\n== fix542: GPTが警告した「使ってはいけない」型 ==');
{
  const r = A('大浦の声に、涼太は顔を上げた。');
  ok('★「Xの声に、Yは〜」は使わない(Xは聞かれた側)', r && r.use === false && r.kind === 'addressed-to', r);
}
{
  const r = A('大浦の声を遮るように、涼太が息を吸った。');
  ok('★「Xの声を遮って〜」は使わない', r && r.use === false && r.kind === 'interrupted', r);
}
{
  const r = A('涼太は、大浦の声を思い出していた。');
  ok('★「Xの声を思い出した」は使わない', r && r.use === false && r.kind === 'recalled', r);
}
{
  ok('無関係な地の文は null', A('風が止んだ。蝉の声だけが、漁港の空気を震わせている。') === null ||
     A('風が止んだ。蝉の声だけが、漁港の空気を震わせている。').use === false,
     A('風が止んだ。蝉の声だけが、漁港の空気を震わせている。'));
  ok('空行は null', A('') === null);
  ok('登場人物名が無ければアンカーにしない', A('誰かの声が掠れている。') === null,
     A('誰かの声が掠れている。'));
}

console.log('\n== fix542: 発話開始アンカー ==');
{
  const r = A('大浦は門のプレートから指を離さないまま、口を開いた。');
  ok('★「Xは口を開いた」→ Xがアンカー', r && r.use && r.name === '大浦 源蔵' && r.kind === 'pre-quote-open', r);
  const r2 = A('涼太が声を潜めた。');
  ok('「Xが声を潜めた」→ Xがアンカー', r2 && r2.use && r2.name === '霧 涼太', r2);
}
{
  /* 2人出てくる場合は、動詞に近い方(後ろ)を採る */
  const r = A('涼太の視線を受けて、大浦の声が震えた。');
  ok('★2人出たら動詞に近い方を採る', r && r.name === '大浦 源蔵', r);
}
{
  /* 姓だけ・名だけの表記ゆれ */
  const r = A('源蔵の声が掠れている。');
  ok('名だけの表記でも正名へ寄る', r && r.name === '大浦 源蔵', r);
}

console.log('\n== fix542: 判定へ影響していないこと(この版は診断のみ) ==');
{
  const src = fs.readFileSync(path.join(__dirname, 'v292Dfix469-speaker-score.js'), 'utf8');
  const i = src.indexOf('function score(');
  const j = src.indexOf('function decide(');
  const body = src.slice(i, j);
  ok('★score() は preQuoteAnchor を呼んでいない(判定不変)', body.indexOf('preQuoteAnchor') < 0);
  const dec = src.slice(j, j + 1200);
  ok('★decide() も呼んでいない', dec.indexOf('preQuoteAnchor') < 0);
  ok('検証口として公開されている', src.indexOf('preQuoteAnchor: preQuoteAnchor') > 0);
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
