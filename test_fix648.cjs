/* 回帰テスト: v292Dfix648 — 句読点隣接重複 collapse（地の文の生成出口正規化）
 *
 * ★配信する v292Dfix648 を **そのまま** モックwindow上で走らせる（実チェーン方式）。
 *   collapse 関数だけを切り出して試すのではなく、実際の parsePlan/S.save ラップを通す。
 *
 * このテストが固定する契約（GPT裁定・緩めない・固定値/BUILT/cb/件数では縛らない）:
 *   (1) 「、。」→「。」
 *   (2) 「。、」→「。」
 *   (3) 「、。、」→「。」（連鎖は変化が無くなるまで反復＝冪等）
 *   (4) 対象外（「、、」「。。」「……。」「！？」「、！」）は不変
 *   (5) 二度かけて同じ（冪等）
 *   (6) <say>/_convSays[].say には適用しない（narrative のみ）
 *   (7) OFF（v292Dfix648Off='1'）で無変化
 *   (8) 既存保存データを遡及書換しない（生成を見ていないセッション＝履歴ロードでは触らない）
 *   (9) 新ターン経路（parsePlan→save）では適用する／同じターンは二度処理しない
 *  (10) soft signal 記録（件数・slot・turnIndex）だけ残す。再生成しない
 *  (11) index.html 配線（script タグ・?cb=fix648・fix555/fix553/fix645 の後・</body> 前・NUL1個）
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

const SRC648 = read('v292Dfix648-punct-collapse.js');
const SRC645 = read('v292Dfix645-scene-move-shadow.js');
const HTML   = fs.readFileSync(path.join(__dirname, 'index.html'), 'latin1');
const HTMLU  = Buffer.from(HTML, 'latin1').toString('utf8');

/* ---------------- 最小 window ---------------- */
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
  const w = {
    localStorage: ls,
    console: { log(){}, warn(){}, error(){} },
    setTimeout: () => 0, clearTimeout(){}, setInterval: () => 0, clearInterval(){},
    Promise: Promise, JSON: JSON, Date: Date, Math: Math, Object: Object, Array: Array, RegExp: RegExp,
    __chr6Key: () => opts.slotKey || 'chr6'
  };
  w.window = w; w.__store = store;
  return w;
}
function run(w, src, name){ const ctx = vm.createContext(w); vm.runInContext(src, ctx, { filename: name }); return w; }
function load648(opts){ const w = mkWin(opts); run(w, SRC648, 'v292Dfix648-punct-collapse.js'); return w; }

/* 生成→ターン確定→保存を模した実チェーンの一手。 */
function genTurn(w, narr, extra){
  const F = w.__v292Dfix648;
  if (!w.Planner){ w.Planner = { parsePlan(){ return { narrative: [] }; } }; F._wrapParse(); }
  w.Planner.parsePlan(narr);                     // ★生成シグナル（sawGen=true）
  const turn = Object.assign({ narrative: narr, plan: { narrative: [narr] } }, extra || {});
  if (!w.S){ w.S = { turns: [], save(){} }; F._wrapSave(); }
  w.S.turns.push(turn);
  w.S.save();
  return turn;
}

console.log('=== (1)〜(5) 純関数 collapse の契約 ===');
{
  const C = load648().__v292Dfix648.collapseNarrativePunctuation;
  // (1) 、。 → 。
  ok('(1a) 「それとも、。」→「それとも。」', C('それとも、。') === 'それとも。', C('それとも、。'));
  ok('(1b) 文中の「、。」も1つに', C('走った、。次に') === '走った。次に', C('走った、。次に'));
  // (2) 。、 → 。
  ok('(2a) 「崩れた。、いや」→「崩れた。いや」', C('崩れた。、いや') === '崩れた。いや', C('崩れた。、いや'));
  // (3) 連鎖 「、。、」→「。」（反復）
  ok('(3a) 「あ、。、い」→「あ。い」（GPT の連鎖例）', C('あ、。、い') === 'あ。い', C('あ、。、い'));
  ok('(3b) 「、。、」→「。」（両端読点の連鎖も1つへ）', C('、。、') === '。', C('、。、'));
  // ★一般化しない証明: 独立した2組の「、。」は各々「。」になり、結果「。。」＝これ以上潰さない
  //   （「。。」は対象外なので触らない）。全連続句読点を1文字へ縮める挙動では *ない*。
  ok('(3c) 「、。、。」→「。。」（別々の組は別々の。として残す＝過剰collapseしない）',
     C('、。、。') === '。。', C('、。、。'));
  ok('(3d) 「。、。」→「。。」（。、と、。の重なりも「。。」止まり）', C('。、。') === '。。', C('。、。'));
  // (4) 対象外は不変
  ok('(4a) 「、、」は不変（読点連打は意図的表現）', C('あ、、い') === 'あ、、い', C('あ、、い'));
  ok('(4b) 「。。」は不変', C('あ。。い') === 'あ。。い', C('あ。。い'));
  ok('(4c) 「……。」は不変', C('あ……。い') === 'あ……。い', C('あ……。い'));
  ok('(4d) 「！？」は不変', C('あ！？い') === 'あ！？い', C('あ！？い'));
  ok('(4e) 「、！」は不変（読点＋感嘆は対象外）', C('あ、！い') === 'あ、！い', C('あ、！い'));
  ok('(4f) 「。！」は不変', C('あ。！い') === 'あ。！い', C('あ。！い'));
  ok('(4g) 半角「,.」は不変（全角句読点だけが対象）', C('a,.b') === 'a,.b', C('a,.b'));
  ok('(4h) 普通の文は不変', C('静かな朝だった。彼は歩いた。') === '静かな朝だった。彼は歩いた。');
  ok('(4i) 空/null/undefined は空文字', C('') === '' && C(null) === '' && C(undefined) === '');
  // (5) 冪等（二度かけて同じ）
  const chainOnce = C('あ、。、い');
  ok('(5a) 二度かけて同じ（連鎖）', C(chainOnce) === chainOnce);
  ok('(5b) 二度かけて同じ（単純）', (() => { const a = C('X、。Y。、Z'); return C(a) === a && a === 'X。Y。Z'; })(), C('X、。Y。、Z'));
}

console.log('=== (6) narrative のみ・<say>/_convSays[].say には適用しない ===');
{
  const w = load648();
  // narrative に 、。 を含み、_convSays / plan.narrative にも 、。 を含むターンを確定させる
  const t = genTurn(w, 'それとも、。歩いた。', {
    _convSays: [{ who: 'A', say: '「行こう、。」' }],
    plan: { narrative: ['それとも、。歩いた。', '<say who="A">「行こう、。」</say>'] }
  });
  ok('(6a) narrative は正規化される', t.narrative === 'それとも。歩いた。', t.narrative);
  ok('(6b) _convSays[].say には手を付けない（カードはそのまま）',
     t._convSays[0].say === '「行こう、。」', t._convSays[0].say);
  ok('(6c) plan.narrative（一次証拠配列）には手を付けない',
     t.plan.narrative.join('|').indexOf('、。') >= 0, t.plan.narrative);
  ok('(6d) 退避（ロールバック可能）', t.__f648prev === 'それとも、。歩いた。', t.__f648prev);
}

console.log('=== (7) OFF で無変化 ===');
{
  const w = load648({ store: { v292Dfix648Off: '1' } });
  const t = genTurn(w, 'それとも、。歩いた。');
  ok('(7a) OFF: narrative を書き換えない', t.narrative === 'それとも、。歩いた。', t.narrative);
  ok('(7b) OFF: 記録もしない', w.__v292Dfix648.log().length === 0);
  ok('(7c) OFF: collapse 関数自体は純関数として使える（配線だけ止まる）',
     w.__v292Dfix648.collapseNarrativePunctuation('あ、。い') === 'あ。い');
}

console.log('=== (8) 非遡及：既存保存データを書き換えない ===');
{
  // 生成を一切見ていない（parsePlan 未実行）セッションで、既存ターンを持つ状態の save
  const w = load648();
  const F = w.__v292Dfix648;
  const existing = { narrative: '既存の。、ターンです。' };      // 例の T12 型の既存本文
  const S = { turns: [existing], save(){} };
  w.S = S;
  ok('(8a) S.save ラップ装着', F._wrapSave() === true);
  S.save();   // sawGen=false のはず（parsePlan を呼んでいない）
  ok('(8b) 履歴ロードだけの save では既存ターンを触らない（非遡及）',
     existing.narrative === '既存の。、ターンです。', existing.narrative);
  ok('(8c) 記録もしない', F.log().length === 0);
  // 途中ターンが末尾でない場合も、末尾（＝新規)以外は触らない
  const w2 = load648();
  const F2 = w2.__v292Dfix648;
  w2.Planner = { parsePlan(){ return {}; } }; F2._wrapParse();
  const mid = { narrative: 'T12。、いや' };                   // 既存の途中ターン
  const S2 = { turns: [mid], save(){} };
  w2.S = S2; F2._wrapSave();
  w2.Planner.parsePlan('新しい生成の本文。');                  // 生成は起きたが turns は増やしていない
  S2.save();                                                  // length は増えていない
  ok('(8d) 生成があっても length が増えなければ末尾（既存途中ターン）を触らない',
     mid.narrative === 'T12。、いや', mid.narrative);
}

console.log('=== (9) 新ターン経路では適用・同じターンは二度処理しない ===');
{
  const w = load648();
  const F = w.__v292Dfix648;
  const t1 = genTurn(w, '一つ目、。です。');
  ok('(9a) 新ターン1が正規化される', t1.narrative === '一つ目。です。', t1.narrative);
  // 同じ save を再度呼んでも二度処理しない（冪等・マーク）
  const before = t1.narrative;
  w.S.save();
  ok('(9b) 同じターンを二度処理しない', t1.narrative === before && F.log().length === 1, F.log().length);
  // 次の新ターン
  const t2 = genTurn(w, '二つ目。、です。');
  ok('(9c) 次の新ターンも正規化される', t2.narrative === '二つ目。です。', t2.narrative);
  ok('(9d) collapse の無いターンは記録を増やさない', (() => {
    const n0 = F.log().length;
    genTurn(w, '三つ目です。普通。');
    return F.log().length === n0;
  })());
  ok('(9e) stats() が turnsCollapsed / collapses を返す', (() => {
    const s = F.stats();
    return s.turnsCollapsed === 2 && s.collapses === 2 && s.turnsObserved >= 3;
  })(), F.stats());
}

console.log('=== (10) soft signal 記録（本文を保存しない・再生成しない） ===');
{
  const w = load648();
  const F = w.__v292Dfix648;
  genTurn(w, '記録される、。ターン。');
  const row = F.log()[0];
  ok('(10a) 記録が1件', F.log().length === 1);
  ok('(10b) 記録キー = ts/slotId/turnIndex/collapses（本文は無い）', (() => {
    const keys = Object.keys(row).sort().join(',');
    return keys === 'collapses,slotId,ts,turnIndex';
  })(), row && Object.keys(row));
  ok('(10c) collapses は件数（1）', row.collapses === 1, row);
  ok('(10d) turnIndex を持つ', typeof row.turnIndex === 'number', row);
  ok('(10e) 記録行に本文（narrative）を保存しない',
     JSON.stringify(row).indexOf('記録される') < 0 && JSON.stringify(row).indexOf('ターン') < 0, row);
  ok('(10f) 書き込むキーは v292Dfix648_log だけ（物語データ chr6* へは書かない）',
     Object.keys(w.__store).join(',') === 'v292Dfix648_log', Object.keys(w.__store));
  ok('(10g) このファイルは再生成経路（fix643 等）を呼ぶコードを持たない',
     !/rescue|regenerat|再生成|fix643/i.test(SRC648.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, m => '')), 'no rescue calls in code');
  ok('(10h) 上限100件（古い方から捨てる）', (() => {
    const w2 = load648();
    const F2 = w2.__v292Dfix648;
    const arr = []; for (let i = 0; i < 130; i++) arr.push({ ts: i, collapses: 1 });
    w2.localStorage.setItem('v292Dfix648_log', JSON.stringify(arr));
    genTurn(w2, 'あふれ、。テスト。');
    return F2.log().length === 100;
  })());
  ok('(10i) clearLog() で消える', (() => { F.clearLog(); return F.log().length === 0; })());
}

console.log('=== (11) selfTest / 読出口 ===');
{
  const F = load648().__v292Dfix648;
  const st = F.selfTest();
  ok('(11a) selfTest() が全ケース合格', st.ok === true, st.cases.filter(c => !c.pass));
  ok('(11b) selfTest の各ケースが冪等', st.cases.every(c => c.idempotent));
  ok('(11c) status() が off=false / sawGen を報告', (() => { const s = F.status(); return s.off === false && 'sawGen' in s; })(), F.status());
  ok('(11d) MAX_LOG=100', F.MAX_LOG === 100);
}

console.log('=== (12) fix645 と共存（S.save 多重ラップ・順序が競合しない） ===');
{
  // fix645 → fix648 の順で載せ、scene_move タグ剥がしと 、。collapse が両立することを実チェーンで確認
  const w = mkWin();
  run(w, SRC645, 'fix645');
  run(w, SRC648, 'fix648');
  const F45 = w.__v292Dfix645, F48 = w.__v292Dfix648;
  w.Planner = { parsePlan(rawText){ return { narrative: [] }; } };
  F45._wrapParse(); F48._wrapParse();
  const S = { turns: [], cast: { hero: { name: '澪' }, npcs: [] }, save(){} };
  w.S = S; F45._wrapSave(); F48._wrapSave();

  const narr = '澪は廊下を抜け、。厨房に入った。\n<scene_move who="hero" to="厨房" ev="厨房に入った"/>';
  w.Planner.parsePlan(narr);
  const turn = { narrative: narr, plan: { narrative: [narr] } };
  S.turns.push(turn);
  S.save();
  ok('(12a) fix648: 「、。」が collapse される', turn.narrative.indexOf('、。') < 0, turn.narrative);
  ok('(12b) fix645: scene_move タグが剥がれる', turn.narrative.indexOf('<scene_move') < 0, turn.narrative);
  ok('(12c) 本文が両処理の後も保たれる', turn.narrative.indexOf('厨房に入った') >= 0, turn.narrative);
  ok('(12d) fix645 は再生成を呼ばない（shadowのまま）',
     F45.stats().session && typeof F45.stats().session.stripped === 'number', F45.stats());
}

console.log('=== (13) index.html 配線 ===');
{
  ok('(13a) script タグが在る（?cb=fix648）',
     /<script src="v292Dfix648-punct-collapse\.js\?cb=fix648"><\/script>/.test(HTMLU), 'tag');
  ok('(13b) fix555 より後ろ',
     HTMLU.indexOf('v292Dfix648-punct-collapse.js') > HTMLU.indexOf('v292Dfix555-punct-repair.js'));
  ok('(13c) fix553 より後ろ',
     HTMLU.indexOf('v292Dfix648-punct-collapse.js') > HTMLU.indexOf('v292Dfix553-punct-probe.js'));
  ok('(13d) fix645 の近く（後ろ）',
     HTMLU.indexOf('v292Dfix648-punct-collapse.js') > HTMLU.indexOf('v292Dfix645-scene-move-shadow.js'));
  ok('(13e) </body> より前', HTMLU.indexOf('v292Dfix648-punct-collapse.js') < HTMLU.lastIndexOf('</body>'));
  ok('(13f) index.html の NUL は1個のまま',
     Buffer.from(HTML, 'latin1').filter(b => b === 0).length === 1,
     Buffer.from(HTML, 'latin1').filter(b => b === 0).length);
  ok('(13g) OFF スイッチ名が規約どおり', /v292Dfix648Off/.test(SRC648));
  ok('(13h) 冪等ガードが __v292* 形式', /__v292Dfix648/.test(SRC648));
  ok('(13i) collapse 対象が2種だけ（一般化していない＝コード上「、。」「。、」のみを置換）', (() => {
    const code = SRC648.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, m => '');   // コメントを除いた実コード
    const reps = code.match(/replaceAllStr\(s,\s*'[^']+',\s*'[^']+'\)/g) || [];
    return reps.length === 2 &&
           reps[0].indexOf("'、。', '。'") >= 0 && reps[1].indexOf("'。、', '。'") >= 0;
  })(), (SRC648.match(/replaceAllStr\(s,\s*'[^']+',\s*'[^']+'\)/g) || []));
}

console.log('');
console.log('PASS ' + pass + ' / FAIL ' + fail);
if (fail) process.exitCode = 1;
