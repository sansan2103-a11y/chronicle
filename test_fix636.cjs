/* 回帰テスト: v292Dfix636 — 登録NPCの「登場」証拠を会話ログの確定話者へ揃える
 *
 * 真因（このテストが固定する事実）:
 *   モデルへ渡る側 features.js fix95 は `t.playerText` と `t.narrative` しか見ない。
 *   画面に出る側 fix145 は fix520 で `t._convSays` も証拠に加えた。
 *   → 姓名で登録し本文が下の名前だけの人物は、会話ログで喋っていてもモデルへ渡らない。
 *
 * 固定すること:
 *   (0) 真因の固定 … fix95 の ctx が _convSays を含まない／fix145 は含む
 *   (1) 会話ログの who と**完全一致**する登録NPCだけ appeared=true になる
 *   (2) 部分一致・短縮名・別名では**絶対に**立てない（強制統合の拡大をしない）
 *   (3) 誰も除外しない（appeared を false/削除にする経路が無い）
 *   (4) hero や _convSays / say / who は1文字も触らない
 *   (5) 変化が無ければ save を呼ばない／あれば1回だけ呼ぶ
 *   (6) dryRun は1バイトも書かない
 *   (7) OFF / 冪等 / index.html 配線
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

const SRC636 = read('v292Dfix636-npc-presence-evidence.js');
const FEAT   = read('features.js');
const F145   = read('v292Dfix145-charlist.js');
const HTML   = fs.readFileSync(path.join(__dirname, 'index.html'), 'latin1');

function extractAccessor(){
  const i = HTML.indexOf('(function v292Dfix539(){');
  const j = HTML.indexOf('})();', i);
  return Buffer.from(HTML.slice(i, j + 5), 'latin1').toString('utf8');
}

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
    UI: opts.noUI ? undefined : { _renderHooks: [] },
    document: { readyState: 'complete', addEventListener(){} }
  };
  w.window = w; w.__store = store; w.__warns = warns; w.__timers = timers;
  return w;
}
function boot(w, S){
  const ctx = vm.createContext(w);
  vm.runInContext('let S = __seed;\n' + extractAccessor() + '\n', ctx, { filename: 'index.html:fix539' });
  vm.runInContext(SRC636, ctx, { filename: 'fix636' });
  return ctx;
}
function mkS(npcs, turns, hero){
  const s = { cast: { hero: hero || { name: '主人公' }, npcs: npcs }, turns: turns, saved: 0 };
  s.save = function(){ s.saved++; };
  return s;
}
function T(narrative, convSays, playerText){
  return { narrative: narrative || '', playerText: playerText || '', _convSays: convSays || [] };
}

console.log('\n== (0) 真因の固定: 2経路で証拠の集合が違う ==');
{
  const i = FEAT.indexOf('function v292Dfix95(');
  const j = FEAT.indexOf('})();', FEAT.indexOf("name-triggered NPC appearance guard armed"));
  const body = FEAT.slice(i, j);
  ok('★fix95 は playerText / narrative しか見ない', /t\.playerText/.test(body) && /t\.narrative/.test(body));
  ok('★fix95 は _convSays を見ていない（これが真因）', body.indexOf('_convSays') < 0);
  ok('★fix95 は sticky フラグ appeared を持っている', /n\.appeared === true/.test(body));
  const k = F145.indexOf('function findLastTurnForName');
  const b2 = F145.slice(k, k + 700);
  ok('★fix145(fix520) は _convSays を存在証拠にしている', b2.indexOf('_convSays') >= 0);
  ok('★fix636 は _convSays の who を証拠にする', SRC636.indexOf('_convSays') >= 0);
}

console.log('\n== (1) 完全一致した登録NPCだけ登場扱いになる ==');
{
  const npcs = [{ name: '白石澪' }, { name: '真鍋源蔵' }];
  const turns = [
    T('澪は窓辺に立っていた。', [{ who: '白石澪', say: 'ここにいるよ' }]),
    T('源蔵は黙っていた。', [])
  ];
  const S = mkS(npcs, turns);
  const w = mkWin(); w.__seed = S; boot(w, S);
  const r = w.__v292Dfix636.scan({});
  ok('★本文に登録名が出ない「白石澪」が登場扱いになる', npcs[0].appeared === true, npcs[0]);
  ok('★会話ログに出ていない「真鍋源蔵」は据え置き', npcs[1].appeared === undefined, npcs[1]);
  ok('promoted の中身', JSON.stringify(r.promoted) === JSON.stringify(['白石澪']), r.promoted);
  ok('save が1回だけ呼ばれる', S.saved === 1, S.saved);
  ok('★おしんへ無言にしない（警告が出る）', w.__warns.some(x => x.indexOf('白石澪') >= 0), w.__warns);
}

console.log('\n== (2) 部分一致・短縮名・別名では絶対に立てない ==');
{
  const cases = [
    ['短縮名（本文＆ログが「澪」だけ）', [{ name: '白石澪' }], [T('', [{ who: '澪', say: 'うん' }])]],
    ['姓だけ',                          [{ name: '白石澪' }], [T('', [{ who: '白石', say: 'うん' }])]],
    ['長い方が来た',                     [{ name: 'アン' }],   [T('', [{ who: 'アンナ', say: 'うん' }])]],
    ['空白の有無が違う',                 [{ name: '霧 涼太' }], [T('', [{ who: '霧涼太', say: 'うん' }])]],
    ['別名（記述的な仮呼称）',            [{ name: 'シオン' }], [T('', [{ who: '少女', say: 'うん' }])]]
  ];
  cases.forEach(([label, npcs, turns]) => {
    const S = mkS(npcs, turns);
    const w = mkWin(); w.__seed = S; boot(w, S);
    w.__v292Dfix636.scan({});
    ok('★' + label + ' → 立てない', npcs[0].appeared === undefined, npcs[0]);
  });
}
{
  /* 前後の空白は同一視してよい（表示の揺れであって別人ではない） */
  const npcs = [{ name: '白石澪' }];
  const S = mkS(npcs, [T('', [{ who: '  白石澪 ', say: 'a' }])]);
  const w = mkWin(); w.__seed = S; boot(w, S);
  w.__v292Dfix636.scan({});
  ok('前後の空白だけの違いは同一視する', npcs[0].appeared === true);
}

console.log('\n== (3) 誰も除外しない（安全側にしか動かない） ==');
{
  ok('★appeared を false にするコードが無い', !/appeared\s*=\s*false/.test(SRC636));
  ok('★appeared を delete するコードが無い', !/delete\s+\w+\.appeared/.test(SRC636));
  ok('★cast.npcs を差し替えるコードが無い', !/\.npcs\s*=\s*/.test(SRC636));
  /* filter は selfTest の「休眠中の名前を並べる」読み取り専用の用途でだけ使う。
     禁止したいのは **減らした配列を書き戻すこと** なので、代入の形で見る。 */
  ok('★npcs を splice しない', !/npcs\s*\.\s*splice\(/.test(SRC636));
  ok('★filter の結果を npcs へ書き戻さない', !/npcs\s*=\s*[^;]*\.filter\(/.test(SRC636));
  const npcs = [{ name: 'A', appeared: true }];
  const S = mkS(npcs, [T('', [])]);
  const w = mkWin(); w.__seed = S; boot(w, S);
  w.__v292Dfix636.scan({});
  ok('既に true のものは触らない', npcs[0].appeared === true && S.saved === 0);
}

console.log('\n== (4) 会話ログ・本文・heroには一切触らない ==');
{
  const npcs = [{ name: 'A' }];
  const turns = [T('本文はそのまま', [{ who: 'A', say: 'セリフはそのまま' }])];
  const hero = { name: '主人公', desc: 'd' };
  const S = mkS(npcs, turns, hero);
  const before = JSON.stringify({ turns, hero });
  const w = mkWin(); w.__seed = S; boot(w, S);
  w.__v292Dfix636.scan({});
  ok('★turns と hero が1文字も変わらない', JSON.stringify({ turns, hero }) === before);
  ok('★立ったのは appeared だけ', npcs[0].appeared === true && Object.keys(npcs[0]).join(',') === 'name,appeared',
     Object.keys(npcs[0]));
}

console.log('\n== (5) 変化が無ければ save を呼ばない ==');
{
  const S = mkS([{ name: 'A' }], [T('', [{ who: 'B', say: 'x' }])]);
  const w = mkWin(); w.__seed = S; boot(w, S);
  w.__v292Dfix636.scan({}); w.__v292Dfix636.scan({}); w.__v292Dfix636.scan({});
  ok('★該当なしなら save 0回', S.saved === 0, S.saved);
}
{
  const npcs = [{ name: 'A' }, { name: 'B' }];
  const S = mkS(npcs, [T('', [{ who: 'A', say: 'x' }, { who: 'B', say: 'y' }])]);
  const w = mkWin(); w.__seed = S; boot(w, S);
  w.__v292Dfix636.scan({});
  ok('★2人まとめて立てて save は1回', S.saved === 1 && npcs[0].appeared && npcs[1].appeared, S.saved);
  w.__v292Dfix636.scan({});
  ok('★2回目は何もしない（save も増えない）', S.saved === 1, S.saved);
}

console.log('\n== (6) dryRun は1バイトも書かない ==');
{
  const npcs = [{ name: 'A' }];
  const S = mkS(npcs, [T('', [{ who: 'A', say: 'x' }])]);
  const w = mkWin(); w.__seed = S; boot(w, S);
  const r = w.__v292Dfix636.scan({ dryRun: true });
  ok('★候補は見える', JSON.stringify(r.candidates) === JSON.stringify(['A']), r);
  ok('★でも書かない', npcs[0].appeared === undefined && S.saved === 0, npcs[0]);
  ok('★localStorage も触らない', Object.keys(w.__store).length === 0);
}

console.log('\n== (7) OFF・冪等・取り付け ==');
{
  const npcs = [{ name: 'A' }];
  const S = mkS(npcs, [T('', [{ who: 'A', say: 'x' }])]);
  const w = mkWin({ store: { 'v292Dfix636Off': '1' } }); w.__seed = S; boot(w, S);
  const r = w.__v292Dfix636.scan({});
  ok('★OFFなら何もしない', r.reason === 'off' && npcs[0].appeared === undefined);
  ok('★OFFでも selfTest（force）で候補だけは見える',
     JSON.stringify(w.__v292Dfix636.selfTest().wouldPromote) === JSON.stringify(['A']),
     w.__v292Dfix636.selfTest());
  ok('★selfTest は書かない', npcs[0].appeared === undefined);
}
{
  const npcs = [{ name: 'A' }];
  const S = mkS(npcs, [T('', [{ who: 'A', say: 'x' }])]);
  const w = mkWin(); w.__seed = S;
  const ctx = boot(w, S);
  ok('★render hook が1本だけ入る', w.UI._renderHooks.length === 1, w.UI._renderHooks.length);
  vm.runInContext(SRC636, ctx, { filename: 'fix636#2' });
  ok('★二重ロードでも hook は1本のまま', w.UI._renderHooks.length === 1, w.UI._renderHooks.length);
  w.UI._renderHooks[0]();
  ok('★hook 経由でも効く', npcs[0].appeared === true);
}
{
  const S = mkS([{ name: 'A' }], [T('', [{ who: 'A', say: 'x' }])]);
  const w = mkWin({ noUI: true }); w.__seed = S; boot(w, S);
  ok('★UI が無くても落ちない', !!w.__v292Dfix636 && w.__v292Dfix636.__armed === true);
}
{
  /* 状態が取れない環境でも例外を投げない */
  const w = mkWin(); w.__seed = null; boot(w, null);
  const r = w.__v292Dfix636.scan({});
  ok('★S が無ければ静かに no-cast', r.ok === false && r.reason === 'no-cast', r);
}

console.log('\n== (8) index.html に配線されている ==');
{
  const h = Buffer.from(HTML, 'latin1').toString('utf8');
  ok('★script タグがある', h.indexOf('v292Dfix636-npc-presence-evidence.js') >= 0);
  ok('★features.js（fix95 本体）より後に読み込む',
     h.indexOf('v292Dfix636-npc-presence-evidence.js') > h.indexOf('features.js?'));
  ok('★index.html の NUL バイトが1個のまま',
     fs.readFileSync(path.join(__dirname, 'index.html')).filter(b => b === 0).length === 1);
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
