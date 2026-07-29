/* 回帰テスト: v292Dfix641 — 証拠ベースの cast 自動登録
 *
 * ★実チェーン: 配信する fix640 と fix641 の**両方をそのまま**モックwindow上で走らせ、
 *   台帳→判定→S.cast.npcs への書き込みまでを通しで見る。判定器だけを切り出して試さない。
 *
 * このテストが固定する契約（GPT裁定・緩めない）:
 *   (1) 強い証拠が2系統 × 別々の2ターン → 昇格する
 *   (2) 弱い証拠が3回でも昇格しない／強が1系統だけでも昇格しない／2ターン未満は昇格しない
 *   (3) 役割語は昇格しない（正式名へ一意解決できたときだけ、その正式名で昇格）
 *   (4) cast.hero を埋めない／hero と同名は昇格しない
 *   (5) 既存キャストと重複登録しない（完全一致＋既存の正規化関数。類似統合はしない）
 *   (6) OFF で新規昇格が止まる／undo で外せる（人が登録したNPCは消さない）
 *   (7) fix277 の準登録カルテを参照しない
 *   (8) 昇格の由来が残る／appeared:true が付く（＝sys注入 fix95 に載る）
 *   (9) 冪等 / index.html 配線
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

const SRC640 = read('v292Dfix640-cast-evidence-ledger.js');
const SRC641 = read('v292Dfix641-cast-auto-register.js');
const FEAT   = read('features.js');
const HTML   = fs.readFileSync(path.join(__dirname, 'index.html'), 'latin1');
const HTMLU  = Buffer.from(HTML, 'latin1').toString('utf8');

function extractAccessor(){
  const i = HTML.indexOf('(function v292Dfix539(){');
  const j = HTML.indexOf('})();', i);
  return Buffer.from(HTML.slice(i, j + 5), 'latin1').toString('utf8');
}

/* features.js §8 の純粋関数を**本物のソースから**切り出す（本番と同じものを使う。
   fix640 は地の文の人物候補にこれを借りているので、モックで自前実装すると乖離する）。 */
function realHelpers(){
  const i = FEAT.indexOf('(function autoBootstrap(){');
  const END = '  })();';
  const j = FEAT.indexOf(END, FEAT.indexOf("'registered (render hook + initial sweep)'"));
  if (i < 0 || j < 0) throw new Error('features.js から autoBootstrap を切り出せない');
  const body = FEAT.slice(i, j + END.length);
  const sandbox = { console: { log(){}, warn(){} } };
  vm.createContext(sandbox);
  vm.runInContext('var __out = {};\n' + body.replace('whenReady(register);',
    '__out.extractKatakanaNames = extractKatakanaNames;'), sandbox, { filename: 'features.js:autoBootstrap' });
  return sandbox.__out;
}
const HELP = realHelpers();

function mkWin(opts){
  opts = opts || {};
  const store = Object.assign({ 'v292Dfix641Live': '1' }, opts.store || {});   // ★既定Live（既定dryRunの契約は末尾の追加テストで別途固定）
  const reads = [], writes = [];
  const ls = {
    getItem: k => { reads.push(k); return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: (k, v) => { writes.push(k); store[k] = String(v); },
    removeItem: k => { writes.push(k); delete store[k]; },
    key: i => { const a = Object.keys(store); return i < a.length ? a[i] : null; },
    get length(){ return Object.keys(store).length; }
  };
  const warns = [], logs = [];
  const w = {
    localStorage: ls,
    console: { log: (...a) => logs.push(a.join(' ')), warn: (...a) => warns.push(a.join(' ')), error(){} },
    setTimeout: () => 0, clearTimeout(){}, setInterval: () => 0, clearInterval(){},
    document: { readyState: 'complete', addEventListener(){} },
    UI: { _renderHooks: [], appendTurn: function(){ return 'orig'; } },
    __chr6Key: () => opts.slotKey || 'chr6',
    __v292: opts.noHelpers ? {} : { autoBootstrap: HELP }
  };
  if (opts.f197) w.__v292Dfix197 = opts.f197;
  w.window = w; w.__store = store; w.__warns = warns; w.__logs = logs; w.__reads = reads; w.__writes = writes;
  return w;
}
/* ★実チェーン: fix640 → fix641 の順で、配信するJSをそのまま流す */
function boot(w, S){
  const ctx = vm.createContext(w);
  w.__seed = S;
  vm.runInContext('let S = __seed;\n' + extractAccessor() + '\n', ctx, { filename: 'index.html:fix539' });
  vm.runInContext(SRC640, ctx, { filename: 'fix640' });
  vm.runInContext(SRC641, ctx, { filename: 'fix641' });
  return ctx;
}
function mkS(hero, npcs, turns){
  const s = { cast: { hero: hero === undefined ? { name: '' } : hero, npcs: npcs || [] }, turns: turns || [], saved: 0 };
  s.save = function(){ s.saved++; };
  return s;
}
function T(paras){ return { plan: { narrative: paras }, narrative: '', playerText: '' }; }
const npcNames = S => S.cast.npcs.map(n => n.name);

/* 強い証拠2系統（say_who + state_tag）× 2ターン */
function strong2x2(name){
  return [
    T(['<say who="' + name + '">「こんばんは」</say>', '<state who="' + name + '" からだ="立っている"/>']),
    T(['<say who="' + name + '">「行きましょう」</say>', '<state who="' + name + '" からだ="歩く"/>'])
  ];
}

console.log('\n== (1) 強い証拠2系統 × 2ターン → 昇格する ==');
{
  const S = mkS({ name: '' }, [], strong2x2('白石澪'));
  const w = mkWin(); boot(w, S);
  const r = w.__v292Dfix641.evaluate({});
  ok('★昇格する', r.promoted.indexOf('白石澪') >= 0, r);
  ok('★S.cast.npcs へ入る', npcNames(S).indexOf('白石澪') >= 0, S.cast.npcs);
  ok('★appeared:true が付く（fix95 が sys から外さないように）',
     S.cast.npcs[0].appeared === true, S.cast.npcs[0]);
  ok('★desc は空（推測で説明を作らない）', S.cast.npcs[0].desc === '');
  ok('★autoBy=fix641 の印が付く', S.cast.npcs[0].autoBy === 'fix641', S.cast.npcs[0]);
  ok('★S.save が呼ばれる', S.saved >= 1, S.saved);
  const why = w.__v292Dfix641.why('白石澪');
  ok('★由来（どの証拠で昇格したか）が残る',
     !!why && why.kinds.indexOf('say_who') >= 0 && why.kinds.indexOf('state_tag') >= 0, why);
  ok('★由来に turn が入る', !!why && typeof why.turn === 'number', why);
  const before = JSON.stringify(S.cast.npcs);
  w.__v292Dfix641.evaluate({});
  ok('★2回目は増えない（冪等）', JSON.stringify(S.cast.npcs) === before, S.cast.npcs);
}

console.log('\n== (2) 弱い証拠では昇格しない ==');
{
  /* 地の文に3回出る（prose_name × 3ターン）＝弱い証拠だけ */
  const S = mkS({ name: '' }, [], [
    T(['廊下の奥からミナが現れた。']),
    T(['ミナは黙っている。']),
    T(['ミナが振り返った。'])
  ]);
  const w = mkWin(); boot(w, S);
  const r = w.__v292Dfix641.evaluate({});
  ok('★弱い証拠が3回でも昇格しない', r.promoted.length === 0, r);
  ok('★cast は空のまま', S.cast.npcs.length === 0, S.cast.npcs);
  const c = r.considered.filter(x => x.name === 'ミナ')[0];
  ok('★理由は weak-evidence', !!c && c.reason === 'weak-evidence', r.considered);
  ok('★台帳には載っている（観測はできる）', !!w.__v292Dfix640.why('ミナ'));
}
{
  /* 反応（react）が何度あっても弱 */
  const S = mkS({ name: '' }, [], [
    T(['<react who="ミナ" 反応="肩を震わせる"/>']),
    T(['<react who="ミナ" 反応="うなずく"/>']),
    T(['<react who="ミナ" 反応="目を伏せる"/>'])
  ]);
  const w = mkWin(); boot(w, S);
  ok('★react だけでは昇格しない', w.__v292Dfix641.evaluate({}).promoted.length === 0, S.cast.npcs);
}
{
  /* 強い証拠が1系統だけ（say_who のみ）× 5ターン */
  const turns = [];
  for (let i = 0; i < 5; i++) turns.push(T(['<say who="ミナ">「' + i + '」</say>']));
  const S = mkS({ name: '' }, [], turns);
  const w = mkWin(); boot(w, S);
  const r = w.__v292Dfix641.evaluate({});
  ok('★強い証拠が1系統だけなら、何ターン出ても昇格しない', r.promoted.length === 0, r);
  const c = r.considered.filter(x => x.name === 'ミナ')[0];
  ok('★理由は weak-evidence（系統数が足りない）', !!c && c.reason === 'weak-evidence', c);
}
{
  /* 強い証拠2系統だが1ターンしかない */
  const S = mkS({ name: '' }, [], [
    T(['<say who="ミナ">「はい」</say>', '<state who="ミナ" からだ="立つ"/>'])
  ]);
  const w = mkWin(); boot(w, S);
  const r = w.__v292Dfix641.evaluate({});
  ok('★1ターンだけでは昇格しない', r.promoted.length === 0, r);
  const c = r.considered.filter(x => x.name === 'ミナ')[0];
  ok('★理由は few-turns', !!c && c.reason === 'few-turns', c);
}
{
  /* 回想でしか出てこない存在（fix408 の実害の型） */
  const S = mkS({ name: '' }, [], [
    T(['<say who="カエデ">「またね」</say>', '<state who="カエデ" からだ="立つ"/>']),
    T(['回想の中のカエデは笑っていた。']),
    T(['写真のカエデはまだ幼い。'])
  ]);
  const w = mkWin(); boot(w, S);
  const r = w.__v292Dfix641.evaluate({});
  ok('★回想での言及はターン数に数えない＝昇格しない', r.promoted.length === 0, r);
}

console.log('\n== (3) 役割語は昇格しない ==');
{
  const S = mkS({ name: '' }, [], strong2x2('宿の主人'));
  const w = mkWin(); boot(w, S);
  const r = w.__v292Dfix641.evaluate({});
  ok('★強い証拠が2系統×2ターンあっても、役割語は昇格しない', r.promoted.length === 0, r);
  ok('★cast は空のまま', S.cast.npcs.length === 0, S.cast.npcs);
  const c = r.considered.filter(x => x.from === '宿の主人')[0];
  ok('★理由は role-word-unresolved', !!c && c.reason === 'role-word-unresolved', r.considered);
}
['少女', '男', '怪異', '女将', '人影'].forEach(role => {
  const S = mkS({ name: '' }, [], strong2x2(role));
  const w = mkWin(); boot(w, S);
  ok('★役割語「' + role + '」は昇格しない', w.__v292Dfix641.evaluate({}).promoted.length === 0, S.cast.npcs);
});
{
  /* 正式名へ一意解決できたら、その**正式名**で昇格する */
  const S = mkS({ name: '' }, [], [
    T(['<say who="宿の主人">「いらっしゃい」</say>', '<state who="宿の主人" からだ="帳場"/>']),
    T(['<say who="宿の主人">「二階です」</say>', '<state who="宿の主人" からだ="階段"/>',
       '宿の主人の佐々木が鍵を差し出した。'])
  ]);
  const w = mkWin(); boot(w, S);
  const r = w.__v292Dfix641.evaluate({});
  ok('★一意解決できたら正式名で昇格する', npcNames(S).indexOf('佐々木') >= 0, { r, npcs: S.cast.npcs });
  ok('★役割語そのものは登録しない', npcNames(S).indexOf('宿の主人') < 0, S.cast.npcs);
  const why = w.__v292Dfix641.why('佐々木');
  ok('★由来に「どの役割語から来たか」が残る', !!why && why.from === '宿の主人', why);
}
{
  /* 候補が2つ＝曖昧なら昇格しない */
  const S = mkS({ name: '' }, [], [
    T(['<say who="宿の主人">「はい」</say>', '<state who="宿の主人" からだ="帳場"/>']),
    T(['<say who="宿の主人">「どうぞ」</say>', '<state who="宿の主人" からだ="廊下"/>',
       '宿の主人の佐々木が答えた。宿の主人の田島が現れた。'])
  ]);
  const w = mkWin(); boot(w, S);
  const r = w.__v292Dfix641.evaluate({});
  ok('★解決候補が2つ以上なら昇格しない', r.promoted.length === 0, { r, npcs: S.cast.npcs });
}

console.log('\n== (4) hero を埋めない ==');
{
  const S = mkS({ name: '' }, [], strong2x2('白石澪'));
  const w = mkWin(); boot(w, S);
  w.__v292Dfix641.evaluate({});
  ok('★cast.hero.name は空のまま（推測で主人公を確定しない）', S.cast.hero.name === '', S.cast.hero);
  ok('★昇格先は必ず npcs 側', S.cast.npcs.length === 1);
  ok('★ソースに cast.hero への代入が無い',
     !/cast\.hero\s*(\.name)?\s*=/.test(SRC641) && !/cast\.hero\s*(\.name)?\s*=/.test(SRC640));
}
{
  const S = mkS({ name: '白石澪' }, [], strong2x2('白石澪'));
  const w = mkWin(); boot(w, S);
  const r = w.__v292Dfix641.evaluate({});
  ok('★hero と同名は昇格しない（自分をNPCとして二重登録しない）',
     r.promoted.length === 0 && S.cast.npcs.length === 0, { r, npcs: S.cast.npcs });
}

console.log('\n== (5) 既存キャストと重複登録しない ==');
{
  const S = mkS({ name: '' }, [{ name: '白石澪', desc: '人が書いた説明' }], strong2x2('白石澪'));
  const w = mkWin(); boot(w, S);
  const r = w.__v292Dfix641.evaluate({});
  ok('★既に登録済みなら足さない', S.cast.npcs.length === 1, S.cast.npcs);
  ok('★人が書いた説明を壊さない', S.cast.npcs[0].desc === '人が書いた説明');
  const c = r.considered.filter(x => x.name === '白石澪')[0];
  ok('★理由は already', !!c && c.reason === 'already', c);
  ok('★save を呼ばない（変化が無いのに保存しない）', S.saved === 0, S.saved);
}
{
  /* 既存の正規化関数（fix197 canonName）で一致するなら足さない */
  const S = mkS({ name: '' }, [{ name: '桐生 悠真', desc: '' }], strong2x2('桐生悠真'));
  const w = mkWin({ f197: { canonName: n => String(n).replace(/[\s　]/g, '') } });
  boot(w, S);
  w.__v292Dfix641.evaluate({});
  ok('★既存の正規化関数で一致したら二重登録しない', S.cast.npcs.length === 1, S.cast.npcs);
}
{
  /* ★類似統合はしない: 正規化関数が無ければ「澪」と「白石澪」は別人のまま */
  const S = mkS({ name: '' }, [{ name: '白石澪', desc: '' }], strong2x2('澪'));
  const w = mkWin(); boot(w, S);
  w.__v292Dfix641.evaluate({});
  ok('★部分一致では統合しない（別人として登録される）',
     npcNames(S).indexOf('澪') >= 0 && S.cast.npcs.length === 2, S.cast.npcs);
}

console.log('\n== (6) OFF / 取り消し ==');
{
  const S = mkS({ name: '' }, [], strong2x2('白石澪'));
  const w = mkWin({ store: { 'v292Dfix641Off': '1' } }); boot(w, S);
  const r = w.__v292Dfix641.evaluate({});
  ok('★OFF なら新規昇格を止める', r.reason === 'off' && S.cast.npcs.length === 0, { r, npcs: S.cast.npcs });
  ok('★OFF でも S を書き換えない', S.saved === 0);
}
{
  const S = mkS({ name: '' }, [], strong2x2('白石澪'));
  const w = mkWin(); boot(w, S);
  w.__v292Dfix641.evaluate({});
  ok('前提: 昇格している', S.cast.npcs.length === 1);
  const u = w.__v292Dfix641.undo('白石澪');
  ok('★undo で外せる', u.removed === true && S.cast.npcs.length === 0, { u, npcs: S.cast.npcs });
  w.__v292Dfix641.evaluate({});
  ok('★取り消した名前は再昇格しない', S.cast.npcs.length === 0, S.cast.npcs);
  w.__v292Dfix641.unblock('白石澪');
  w.__v292Dfix641.evaluate({});
  ok('★unblock すれば再び昇格できる', S.cast.npcs.length === 1, S.cast.npcs);
}
{
  /* 人が登録したNPCは undo で消さない */
  const S = mkS({ name: '' }, [{ name: '手動NPC', desc: '人が登録' }], []);
  const w = mkWin(); boot(w, S);
  const u = w.__v292Dfix641.undo('手動NPC');
  ok('★人が登録したNPCは undo できない',
     u.removed === false && u.reason === 'not-auto-registered' && S.cast.npcs.length === 1, { u, npcs: S.cast.npcs });
}
{
  const S = mkS({ name: '' }, [{ name: '手動NPC', desc: '人が登録' }], strong2x2('白石澪'));
  const w = mkWin(); boot(w, S);
  w.__v292Dfix641.evaluate({});
  ok('前提: 自動1件＋手動1件', S.cast.npcs.length === 2, S.cast.npcs);
  w.__v292Dfix641.undoAll();
  ok('★undoAll は自動昇格ぶんだけ外す',
     npcNames(S).length === 1 && npcNames(S)[0] === '手動NPC', S.cast.npcs);
}
{
  const S = mkS({ name: '' }, [], strong2x2('白石澪'));
  const w = mkWin(); boot(w, S);
  const r = w.__v292Dfix641.dryRun();
  ok('★dryRun は昇格候補を見せるだけ', r.promoted.indexOf('白石澪') >= 0 && S.cast.npcs.length === 0, { r, npcs: S.cast.npcs });
  ok('★dryRun は save を呼ばない', S.saved === 0);
}

console.log('\n== (7) fix277 の準登録カルテを参照しない ==');
{
  const S = mkS({ name: '' }, [], [ T(['ミナが立っている。']) ]);
  const w = mkWin({ store: {
    'v292Dfix277Quasi': JSON.stringify({ 'ミナ': { turns: 99, appeared: 99 } }),
    'v292Dfix277Quasi_slot_other': JSON.stringify({ 'よその人': { turns: 99 } })
  }});
  boot(w, S);
  w.__v292Dfix641.evaluate({});
  ok('★fix277 のキーを読まない', w.__reads.every(k => k.indexOf('v292Dfix277Quasi') < 0), w.__reads);
  ok('★fix277 の「99ターン登場」を昇格根拠にしない', S.cast.npcs.length === 0, S.cast.npcs);
  const code = SRC641.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');
  ok('★コードに fix277 の台帳キー／APIが出てこない',
     code.indexOf('v292Dfix277Quasi') < 0 && code.indexOf('__v292QuasiPack') < 0 && code.indexOf('__v292Dfix277') < 0);
}

console.log('\n== (8) 書いた後に載る経路（モデル側 / 画面側） ==');
{
  const S = mkS({ name: '' }, [], strong2x2('白石澪'));
  const w = mkWin(); boot(w, S);
  w.__v292Dfix641.evaluate({});
  /* (b) モデル側: features.js fix95 は appeared!==true の NPC を sys から外す。
     その分岐条件そのものを固定して、appeared:true が必要であることを明文化する。 */
  ok('★fix95 は appeared===true のNPCだけを残す（＝appeared 必須）',
     FEAT.indexOf('if (n.appeared === true) return true;') >= 0);
  ok('★昇格した項目は fix95 のフィルタを通る',
     S.cast.npcs.filter(n => n.appeared === true).length === 1, S.cast.npcs);
  /* (a) 画面側: fix145 は S.cast.npcs を直接読む。同じ配列に入っていることを固定する。 */
  ok('★fix145（キャラ一覧）が読む S.cast.npcs に入っている',
     read('v292Dfix145-charlist.js').indexOf('cast.npcs') >= 0 && npcNames(S).indexOf('白石澪') >= 0);
  ok('★fix640 と同じ台帳に昇格記録が残る（別ストアを作らない）',
     JSON.parse(w.__store['v292Dfix640Evid_slot_chr6']).promotions.length === 1);
}
{
  /* 1回の評価で足す件数に上限がある（暴走時の被害を限る） */
  const turns = [];
  ['あ人', 'い人', 'う人', 'え人', 'お人'].forEach(() => {});
  const names = ['アオイ', 'イズミ', 'ウタ', 'エリ', 'オト'];
  for (let t = 0; t < 2; t++){
    const paras = [];
    names.forEach(n => { paras.push('<say who="' + n + '">「' + t + '」</say>'); paras.push('<state who="' + n + '" からだ="立つ"/>'); });
    turns.push(T(paras));
  }
  const S = mkS({ name: '' }, [], turns);
  const w = mkWin(); boot(w, S);
  const r = w.__v292Dfix641.evaluate({});
  ok('★1回の評価で足すのは上限まで（暴走時の被害を限る）', r.promoted.length === 3, r.promoted);
  w.__v292Dfix641.evaluate({});
  ok('★次の評価で残りが入る', S.cast.npcs.length === 5, npcNames(S));
}

console.log('\n== (9) 冪等 / 配線 ==');
{
  const S = mkS({ name: '' }, [], []);
  const w = mkWin(); const ctx = boot(w, S);
  const first = w.__v292Dfix641;
  vm.runInContext(SRC641, ctx, { filename: 'fix641#2' });
  ok('★二重ロードで初期化し直さない', w.__v292Dfix641 === first);
}
{
  const S = mkS({ name: '' }, [], []);
  const w = mkWin(); boot(w, S);
  ok('★ターン確定（UI.appendTurn）に相乗りする', w.UI.__v292Dfix641 === true);
  ok('★元の appendTurn の戻り値を壊さない', w.UI.appendTurn({}, 0) === 'orig');
}
{
  /* ターン確定フックを1回叩くと、採取→判定まで通しで走る（実チェーン） */
  const S = mkS({ name: '' }, [], strong2x2('白石澪'));
  const w = mkWin(); boot(w, S);
  w.UI.appendTurn(S.turns[1], 1);
  ok('★appendTurn 経由で採取から昇格まで通る', npcNames(S).indexOf('白石澪') >= 0, S.cast.npcs);
}
{
  ok('★script タグがある', HTMLU.indexOf('v292Dfix641-cast-auto-register.js') >= 0);
  ok('★?cb= が付いている', HTMLU.indexOf('v292Dfix641-cast-auto-register.js?cb=fix641') >= 0);
  ok('★fix640 より後に読み込む',
     HTMLU.indexOf('v292Dfix641-cast-auto-register.js') > HTMLU.indexOf('v292Dfix640-cast-evidence-ledger.js'));
  ok('★index.html の NUL バイトが1個のまま',
     fs.readFileSync(path.join(__dirname, 'index.html')).filter(b => b === 0).length === 1);
  ok('★OFFスイッチがある', SRC641.indexOf('v292Dfix641Off') >= 0);
  ok('★window.S を新設しない', !/window\.S\s*=[^=]/.test(SRC641));
  ok('★fix539 の正式APIで S を取る', SRC641.indexOf('__chronicleGetState') >= 0);
  ok('★昇格条件は 2ターン × 強2系統', SRC641.indexOf('MIN_TURNS = 2') >= 0 && SRC641.indexOf('MIN_STRONG_KINDS = 2') >= 0);
  ok('★features.js を変更していない', FEAT.indexOf('v292Dfix641') < 0);
}

console.log('\n== (X) ★既定はdryRun（Live未指定なら書かない） ==');
{
  const S = mkS({ name: '' }, [], strong2x2('千鶴'));
  const w = mkWin({ store: { 'v292Dfix641Live': '' } }); boot(w, S);
  const r = w.__v292Dfix641.evaluate({});
  ok('★Live未指定なら autoDowngraded', r.autoDowngraded === true, r);
  ok('★昇格候補としては見える', r.promoted.indexOf('千鶴') >= 0, r);
  ok('★★書かない（castは空のまま）', npcNames(S).length === 0, S.cast.npcs);
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
