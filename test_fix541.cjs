/* 回帰テスト: v292Dfix541 — 「別個体を1つのハブへ束ねた疑い」の検出（読取専用・停止措置なし）
 * 由来: 実セーブ 廃墟21T `smrrcv21iph` の `怪異.ali = ["長身の怪異","孤児院の怪異"]`。
 * GPT裁定: 「一般名詞で終わる正名＋修飾つき別名が2つ以上」は候補抽出には有効だが
 *   自動削除条件としては乱暴（少女/白い服の少女/門前にいた少女 は普通に同一人物）。
 *   → 2段階に分け、第2段階の「別個体の証拠」で危険度を上げるだけにする。 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };

function mk(ledger, cast, turns){
  const store = {};
  if (ledger) store['v292Dfix277Quasi'] = JSON.stringify(ledger);
  const ls = { getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; },
    key: i => Object.keys(store)[i], get length(){ return Object.keys(store).length; } };
  const el = { querySelectorAll: () => [], querySelector: () => null, addEventListener(){}, appendChild(){}, setAttribute(){}, style: {}, remove(){}, insertBefore(){}, classList:{add(){},remove(){},contains:()=>false} };
  const doc = { hidden: false, visibilityState: 'visible', readyState: 'complete', documentElement: el, body: el,
    querySelectorAll: () => [], querySelector: () => null, getElementById: () => null, addEventListener(){},
    createElement: () => ({ style: {}, setAttribute(){}, addEventListener(){}, appendChild(){}, remove(){}, classList:{add(){},remove(){}} }) };
  const w = { localStorage: ls, document: doc, console: { log(){}, warn(){}, error(){} },
    setTimeout: () => 0, setInterval: () => 0, clearTimeout(){}, clearInterval(){},
    MutationObserver: function(){ return { observe(){}, disconnect(){} }; },
    navigator: { userAgent: 'node' }, location: { href: 'x', search: '' } };
  w.window = w; w.__store = store;
  w.S = { cast: cast || { hero: { name: 'アリア' }, npcs: [] }, turns: turns || [], save(){} };
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'v292Dfix277-quasi-pack.js'), 'utf8'),
    vm.createContext(w), { filename: 'fix277' });
  return w;
}

console.log('\n== fix541: 実データ(廃墟21T)の再現 ==');
{
  const w = mk({ '怪異': { seen: [9, 12], last: 12, ali: ['長身の怪異', '孤児院の怪異'] } });
  const hubs = w.__v292QuasiPack.ambiguousHubs();
  ok('★「怪異」が疑わしいハブとして挙がる', hubs.length === 1 && hubs[0].canonical === '怪異', hubs);
  ok('別名2件が記録される', hubs[0] && hubs[0].aliases.length === 2, hubs[0]);
  ok('★この版では停止措置を取らない(検出のみ)', hubs[0] && hubs[0].action === 'review-only', hubs[0]);
  ok('別個体の証拠が無ければ risk=suspect', hubs[0] && hubs[0].risk === 'suspect', hubs[0]);
}

console.log('\n== fix541: 別個体の証拠があれば risk を上げる ==');
{
  /* 同一ターンで両方の呼称が話者として並存 */
  const w = mk({ '怪異': { seen: [1], last: 1, ali: ['長身の怪異', '孤児院の怪異'] } }, null,
    [{ narrative: '', _convSays: [{ who: '長身の怪異', say: 'あ' }, { who: '孤児院の怪異', say: 'い' }] }]);
  const h = w.__v292QuasiPack.ambiguousHubs()[0];
  ok('★同一ターンで両方が喋る → high', h && h.risk === 'high', h);
  ok('証拠の種類が分かる', h && h.evidence.some(e => /same-turn-both-speak/.test(e)), h && h.evidence);
}
{
  /* 明示的な分離表現 */
  const w = mk({ '怪異': { seen: [1], last: 1, ali: ['長身の怪異', '孤児院の怪異'] } }, null,
    [{ narrative: ['長身の怪異の後ろから、もう一体、孤児院の怪異が現れた。'], _convSays: [] }]);
  const h = w.__v292QuasiPack.ambiguousHubs()[0];
  ok('★「もう一体」で high', h && h.risk === 'high', h);
  ok('分離表現として記録される', h && h.evidence.some(e => /explicit-separation/.test(e)), h && h.evidence);
}
{
  /* 登場ターンが重なる */
  const w = mk({ '怪異': { seen: [1], last: 1, ali: ['長身の怪異', '孤児院の怪異'] },
                 '長身の怪異': { seen: [3, 4], last: 4, ali: [] },
                 '孤児院の怪異': { seen: [4, 5], last: 5, ali: [] } });
  const h = w.__v292QuasiPack.ambiguousHubs().filter(x => x.canonical === '怪異')[0];
  ok('★登場ターンが重なると high', h && h.risk === 'high', h);
  ok('重なりとして記録される', h && h.evidence.some(e => /overlapping-turns/.test(e)), h && h.evidence);
}

console.log('\n== fix541: 拾ってはいけないもの(GPTが警告した誤検出) ==');
{
  /* 同一人物が複数の呼ばれ方をするのは普通。証拠が無ければ high にしない */
  const w = mk({ '少女': { seen: [1, 2, 3], last: 3, ali: ['白い服の少女', '門前にいた少女'] } });
  const h = w.__v292QuasiPack.ambiguousHubs()[0];
  ok('★候補には挙がるが high にはしない', h && h.risk === 'suspect', h);
  ok('★削除も統合停止もしない', h && h.action === 'review-only', h);
}
{
  const w = mk({ 'シオン': { seen: [1], last: 1, ali: ['少女', '白いワンピースの少女'] } });
  ok('★固有名(名乗った名前)のハブは対象外', w.__v292QuasiPack.ambiguousHubs().length === 0,
     w.__v292QuasiPack.ambiguousHubs());
}
{
  const w = mk({ 'カエデ': { seen: [1], last: 1, ali: ['長身の女', '外套の女'] } },
    { hero: { name: 'アリア' }, npcs: [{ name: 'カエデ' }] });
  ok('★登録キャストのハブは対象外', w.__v292QuasiPack.ambiguousHubs().length === 0,
     w.__v292QuasiPack.ambiguousHubs());
}
{
  const w = mk({ '怪異': { seen: [1], last: 1, ali: ['長身の怪異'] } });
  ok('★別名が1件だけなら候補にしない', w.__v292QuasiPack.ambiguousHubs().length === 0,
     w.__v292QuasiPack.ambiguousHubs());
}
{
  /* 修飾関係がない別名（正名を含まない）は「束ね」の型ではない */
  const w = mk({ '少女': { seen: [1], last: 1, ali: ['ミナ', 'サヤ'] } });
  ok('★正名を含まない別名は対象外', w.__v292QuasiPack.ambiguousHubs().length === 0,
     w.__v292QuasiPack.ambiguousHubs());
}
{
  /* 検出しても aliasMap は一切変えない（挙動不変の担保） */
  const w = mk({ '怪異': { seen: [1], last: 1, ali: ['長身の怪異', '孤児院の怪異'] } });
  const before = JSON.stringify(w.__v292QuasiPack.aliasMap());
  w.__v292QuasiPack.ambiguousHubs();
  ok('★検出しても別名解決は変わらない(挙動不変)',
     JSON.stringify(w.__v292QuasiPack.aliasMap()) === before, before);
  ok('★台帳も書き換えない', !/ambiguous/.test(w.__store['v292Dfix277Quasi'] || ''), 'ok');
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
