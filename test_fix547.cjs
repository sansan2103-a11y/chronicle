/* 回帰テスト: v292Dfix547 — S取得の移行バッチ1（会話ログ書換系8ファイル）
 * 方針: **判定ロジックには一切触れない。取得経路だけ**を「正式API優先」へ差し替える。
 *   第二経路は従来の式をそのまま残すので、index.html が古いキャッシュでも挙動は変わらない。
 * GPT指定の合格条件のうち、オフラインで固定できるものをここで押さえる。
 *   (1) 人工的な既知1件を必ず検出する → 各fixに検出口が無いので「同じSを見ていること」で代替
 *   (2) 無変更ケースは0件 → 同上
 *   (3) 実セーブの前後dryRun一致 → **APIと従来式が同一オブジェクトを返す**ことで論理的に保証
 *   (4) state取得成功回数が0でない → 実機で byFeature に出ることを確認（別途・実機ログ）
 *   (5) misses/rescued/errors が増えていない → 実機で確認（別途）
 * 対象は「取得のみ・休眠ガード無し・単一関数」の8件。
 * fix66(休眠ガード3件を含む) / fix445(G.S 経由) / fix376(bare S.save) は**このバッチに入れない**。 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };

const BATCH = {
  'v292Dfix489-convlog-gate.js': 'fix489',
  'v292Dfix465-role-who.js': 'fix465',
  'v292Dfix462-bare-speaker.js': 'fix462',
  'v292Dfix458-dash-post.js': 'fix458',
  'v292Dfix390-speaker-fullname.js': 'fix390',
  'v292Dfix388-first-person-speaker.js': 'fix388',
  'v292Dfix383-vocative-fix.js': 'fix383',
  'v292Dfix303-speaker-backref.js': 'fix303'
};
/* このバッチに入れてはいけないもの（理由つきで固定する） */
/* バッチ1の時点で「機械移行してはいけない」と判断したもの。
   バッチ3で**1件ずつ中身を見て**移行した(下の専用セクション参照)。 */
const EXCLUDED = {};

console.log('\n== バッチ1: 8ファイルが正式APIを第一経路にしている ==');
Object.keys(BATCH).forEach(function (f) {
  const s = fs.readFileSync(path.join(__dirname, f), 'utf8');
  const fx = BATCH[f];
  const i = s.indexOf('function getS()');
  const body = s.slice(i, i + 420);
  ok(fx + ': 正式APIを第一経路にしている',
     body.indexOf("window.__chronicleGetState('" + fx + "')") > 0, body.slice(0, 100));
  ok(fx + ': ★従来の式を第二経路としてそのまま残す(挙動不変の担保)',
     /window\.S \|\| \(0,eval\)\('typeof S!=="undefined"\?S:null'\)/.test(body), body.slice(0, 200));
  ok(fx + ': getS は1つだけ(取り違えが起きない)', (s.match(/function getS\(\)/g) || []).length === 1);
});

console.log('\n== このバッチに入れてはいけないものを固定する ==');
Object.keys(EXCLUDED).forEach(function (f) {
  const s = fs.readFileSync(path.join(__dirname, f), 'utf8');
  ok(f.slice(9, 22) + ': 未移行のまま(' + EXCLUDED[f] + ')',
     s.indexOf('__chronicleGetState') < 0, f);
});
{
  /* fix66 は window.S の有無そのもので分岐する箇所を持つので、バッチ1では機械移行しなかった。
     バッチ3で「取得関数(getState / getStateSafe)だけ」を移行し、持ち主判定の分岐は残した。 */
  const s = fs.readFileSync(path.join(__dirname, 'v292Dfix66-renderhook-repair.js'), 'utf8');
  const branches = (s.match(/window\.S && window\.S/g) || []).length;
  ok('★fix66 は window.S の有無で分岐する箇所を持つ(だから一括置換しなかった)', branches >= 2, branches);
}

console.log('\n== 読み込んでも壊れない / 正式APIが優先される ==');
function mkWin(apiState, windowState){
  const store = {};
  const ls = { getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; },
    key: i => Object.keys(store)[i], get length(){ return Object.keys(store).length; } };
  const el = { querySelectorAll: () => [], querySelector: () => null, addEventListener(){}, appendChild(){}, setAttribute(){}, style: {}, remove(){}, insertBefore(){}, classList:{add(){},remove(){},contains:()=>false} };
  const doc = { hidden: false, visibilityState: 'visible', readyState: 'complete', documentElement: el, body: el,
    querySelectorAll: () => [], querySelector: () => null, getElementById: () => null, addEventListener(){},
    createElement: () => ({ style: {}, setAttribute(){}, addEventListener(){}, appendChild(){}, remove(){}, classList:{add(){},remove(){}} }) };
  const calls = [];
  const w = { localStorage: ls, document: doc, console: { log(){}, warn(){}, error(){} },
    setTimeout: () => 0, setInterval: () => 0, clearTimeout(){}, clearInterval(){},
    MutationObserver: function(){ return { observe(){}, disconnect(){} }; },
    navigator: { userAgent: 'node' }, location: { href: 'x', search: '' },
    addEventListener(){}, removeEventListener(){}, fetch: () => Promise.reject(new Error('x')) };
  if (apiState !== undefined) w.__chronicleGetState = function(feature){ calls.push(feature); return apiState; };
  if (windowState !== undefined) w.S = windowState;
  w.window = w; w.__calls = calls;
  return w;
}
const REAL = { cast: { hero: { name: '本物' }, npcs: [] }, turns: [], save(){} };
const FAKE = { cast: { hero: { name: 'ニセ' }, npcs: [] }, turns: [{}, {}], save(){} };
Object.keys(BATCH).forEach(function (f) {
  const fx = BATCH[f];
  const w = mkWin(REAL, FAKE);
  let err = null;
  try { vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), vm.createContext(w), { filename: fx }); }
  catch (e) { err = e.message; }
  ok(fx + ': 読み込みで例外が出ない', err === null, err);
});
{
  /* 正式APIが無い環境（index.htmlが古いキャッシュ）でも動く＝移行期の後方互換 */
  const w = mkWin(undefined, FAKE);
  let err = null;
  try { vm.runInContext(fs.readFileSync(path.join(__dirname, 'v292Dfix489-convlog-gate.js'), 'utf8'), vm.createContext(w), { filename: 'fix489' }); }
  catch (e) { err = e.message; }
  ok('★正式APIが無くても読み込める(古いindex.htmlでも壊れない)', err === null, err);
}

console.log('\n== バッチ2A: fix192（プロンプト生成）==');
{
  const f = 'v292Dfix192-newengine.js';
  const s2 = fs.readFileSync(path.join(__dirname, f), 'utf8');
  const i = s2.indexOf('function getS()');
  const body = s2.slice(i, i + 420);
  ok('fix192: 正式APIを第一経路にしている', body.indexOf("window.__chronicleGetState('fix192')") > 0, body.slice(0,120));
  ok('fix192: ★従来の式をそのまま残す(旧式は eval(\'S\') 形)',
     /window\.S \|\| \(0,eval\)\('S'\)/.test(body), body.slice(0,220));
  ok('fix192: localStorage.setItem をラップしていない(単独移行の条件)',
     !/localStorage\.setItem\s*=/.test(s2));
  ok('fix192: window.S の有無で分岐していない(単独移行の条件)',
     !/window\.S && window\.S|if \(!window\.S\)/.test(s2));
  const w = mkWin(REAL, FAKE);
  let err = null;
  try { vm.runInContext(s2, vm.createContext(w), { filename: 'fix192' }); } catch (e) { err = e.message; }
  ok('fix192: 読み込みで例外が出ない', err === null, err);
}
{
  /* ★fix402 はバッチ2Aの条件を満たさない(GPTの条件で自分で弾いた) */
  const s3 = fs.readFileSync(path.join(__dirname, 'v292Dfix402-invisible-sync.js'), 'utf8');
  ok('★fix402 は localStorage.setItem をラップするので単独バッチへ回す',
     /localStorage\.setItem\s*=/.test(s3));
  ok('★fix402 は S.save もラップする(実行順に依存する)', /S\.save = function/.test(s3));
  /* fix402 はバッチ2A(単純取得)から外し、**保存ラッパ組(バッチ2B)**として移行した。
     除外理由(setItemラップ / S.saveラップ)は上の2件で固定済み。 */
  ok('★fix402 は保存ラッパ組として移行済み', s3.indexOf("__chronicleGetState('fix402')") > 0);
}

console.log('\n== バッチ2B: 保存ラッパ組(fix399 / fix402 / fix490) ==');
{
  const cases = [
    ['v292Dfix399-cloudsync.js', 'fix399', "window.S \\|\\| \\(0,eval\\)\\('S'\\)"],
    ['v292Dfix402-invisible-sync.js', 'fix402', "window.S \\|\\| \\(0,eval\\)\\('S'\\)"],
    ['v292Dfix490-slot-write-guard.js', 'fix490', "window.S \\|\\| \\(0,eval\\)\\('typeof S"]
  ];
  cases.forEach(function (c) {
    const s2 = fs.readFileSync(path.join(__dirname, c[0]), 'utf8');
    ok(c[1] + ': 正式APIを第一経路にしている', s2.indexOf("__chronicleGetState('" + c[1] + "')") > 0);
    ok(c[1] + ': ★従来の式をそのまま残す', new RegExp(c[2]).test(s2));
  });
  const s399 = fs.readFileSync(path.join(__dirname, 'v292Dfix399-cloudsync.js'), 'utf8');
  const s402 = fs.readFileSync(path.join(__dirname, 'v292Dfix402-invisible-sync.js'), 'utf8');
  const s490 = fs.readFileSync(path.join(__dirname, 'v292Dfix490-slot-write-guard.js'), 'utf8');
  ok('★fix399: S.save のラップと冪等フラグに触れていない', /S\.__f399wrapped = true/.test(s399) && /S\.save = function/.test(s399));
  ok('★fix402: S.save のラップと冪等フラグに触れていない', /S\.__f402wrapped = true/.test(s402) && /S\.save = function/.test(s402));
  ok('★fix490: setItem ラッパの構造と __f490 に触れていない', /wrapped\.__f490 = true/.test(s490) && /localStorage\.setItem = wrapped/.test(s490));
  /* ★2026-07-26 に書き換えた。ここは元々 fix399 の**旧trimの形**(while(bks.length>1) / bks2[0] /
     catch(e2){return false} )をソースの正規表現で固定していたが、fix568 が
     **まさにその形をバグとして根治した**ため、テストが修正を妨げていた。
     形ではなく fix568 が確立した**契約**を固定する。振る舞いの検証は test_fix544 が持つ。 */
  ok('★fix399: 書く前に保護対象(読める完全控えの最新1件)を決めている(fix568)',
     /readableFullDump/.test(s399) && /var keep = readable\.length/.test(s399));
  ok('★fix399: 保護対象は整理の対象外', /if \(cur\[i\] === keep\) continue;/.test(s399));
  ok('★fix399: 容量不足なら控えを犠牲にせず取り込みを中止する(fail-closed)',
     /abortPull/.test(s399) && /return false/.test(s399));
  ok('★fix399: 2世代の約束は維持されている', /while \(fin\.length > 2\)/.test(s399));
}

console.log('\n== バッチ3: 1件ずつ判断したもの(fix376 / fix445 / fix66) ==');
{
  const s376 = fs.readFileSync(path.join(__dirname, 'v292Dfix376-speaker-guard.js'), 'utf8');
  ok('fix376: 正式APIを第一経路にしている', s376.indexOf("__chronicleGetState('fix376')") > 0);
  ok('fix376: ★従来の式をそのまま残す', /if \(window\.S\) return window\.S; return \(0,eval\)\('S'\)/.test(s376));
  ok('★fix376 は「getSを持たない」という台帳の分類が誤りだった(中身を見て確認)',
     (s376.match(/function getS\(\)/g) || []).length === 1);
}
{
  const s445 = fs.readFileSync(path.join(__dirname, 'v292Dfix445-handle-lock.js'), 'utf8');
  ok('fix445: ★G.S を先頭のまま残す(モックが本物に負けないように=GPT裁定)',
     s445.indexOf('if (G && G.S) return G.S;') > 0);
  const iG = s445.indexOf('G && G.S'), iA = s445.indexOf("__chronicleGetState('fix445')");
  ok('fix445: ★G.S → 正式API → 従来式 の順', iG > 0 && iA > iG, [iG, iA]);
  ok('fix445: ★経路ごとに try を分けた(G が解決できなくても後段へ進む)',
     /try \{ if \(G && G\.S\) return G\.S; \} catch\(e\)\{\}/.test(s445));
  /* 元は1つの try だったので、G が未解決だと ReferenceError で eval へ到達せず必ず null になった */
  ok('★fix445: 元の「1つのtryで全部囲う」形は残っていない',
     !/return G\.S \|\| \(0,eval\)/.test(s445));
}
{
  const s66 = fs.readFileSync(path.join(__dirname, 'v292Dfix66-renderhook-repair.js'), 'utf8');
  ok('fix66: getState が正式APIを最初に試す', /a0 = window\.__chronicleGetState/.test(s66));
  ok('fix66: getStateSafe も正式APIを最初に試す', s66.indexOf("__chronicleGetState('fix66')") > 0);
  ok('fix66: ★window.S フォールバックを残している(追加のみ)',
     /if \(window\.S && window\.S\.turns\) return window\.S;/.test(s66));
  /* ★ここが本題: 「メモリ上の状態がこの turns の持ち主か」を見る分岐は**触らない** */
  ok('★fix66: 1338/1339行の分岐(turns の持ち主判定)は手つかず',
     (s66.match(/window\.S && window\.S\.turns === turns/g) || []).length === 1 &&
     /else if \(!\(window\.S && window\.S\.turns\)\)\{ localStorage\.setItem/.test(s66));
}

console.log('\n== features.js 分類1「純粋な状態取得」だけを移行 ==');
{
  const f = fs.readFileSync(path.join(__dirname, 'features.js'), 'utf8');
  ok('★分類1を4箇所だけ移行した', (f.match(/__chronicleGetState\('features'\)/g) || []).length === 4,
     (f.match(/__chronicleGetState\('features'\)/g) || []).length);
  ok('★従来の経路(lexical S → window.S)を全部残している',
     /typeof S !== 'undefined' && S\) \? S/.test(f) && /typeof window !== 'undefined' && window\.S\) \? window\.S/.test(f));
  ok('★localStorage フォールバックも残っている',
     /JSON\.parse\(localStorage\.getItem\(window\.__chr6Key \? window\.__chr6Key\(\) : 'chr6'\)/.test(f));
  /* ★分類5「window.S の有無で分岐する休眠ガード」は**1つも触らない**(GPT裁定) */
  ok('★休眠ガード if(!window.S) は10箇所のまま(1つも触っていない)',
     (f.match(/if \(!window\.S/g) || []).length === 10, (f.match(/if \(!window\.S/g) || []).length);
  ok('★window.S を機能フラグとして使う分岐も残っている',
     /if \(window\.S && window\.S\.cast\) return window\.S;/.test(f));
  /* 残りの取得箇所は次スライス。今回触っていないことを固定する */
  ok('★9002行型(var S = ... window.S ...)はまだ触っていない',
     /var S = \(typeof window !== 'undefined' && window\.S\) \? window\.S : null;/.test(f));
}

console.log('\n== 台帳の更新（移行済みの数） ==');
{
  const fs2 = fs;
  let migrated = 0;
  fs2.readdirSync(__dirname).filter(x => /^v292Dfix\d+.*\.js$/.test(x)).forEach(function (f) {
    const s = fs2.readFileSync(path.join(__dirname, f), 'utf8');
    if (s.indexOf('__chronicleGetState') > 0) migrated++;
  });
  /* コア5(fix277/469/409/145/77) + バッチ1の8 + fix543(再保存で状態を取りに行くため参照) = 14 */
  /* コア5 + バッチ1の8 + fix543 + バッチ2Aのfix192 = 15 */
  /* コア5 + バッチ1の8 + fix543 + fix192 + 保存ラッパ組3 = 18 */
  /* コア5 + バッチ1の8 + fix543 + fix192 + 保存ラッパ組3 + バッチ3の3 = 21 */
  /* + fix553(句読点崩れの検出器。保存本文を読むので最初から正式APIを使う) = 22 */
  /* + fix555(校正専用リクエストで cfg のプロバイダ/キー/モデルを読む) = 23 */
  /* + fix606(話者帰属の来歴アナライザ。読み取り専用で S.turns を走査する) = 24
     ★この台帳が固定しているのは「番号」ではなく
       **新しく S を読むモジュールを足したら、必ず正式API(fix539)経由にする**という契約。
       fix606 は第一経路が __chronicleGetState なのでここへ足す。
       間接eval だけで S を取るモジュールを足した場合は、この数は増えず**別の意味で落ちる**。 */
  /* + fix611(話者変更の中央ゲート。影モードで S.turns を読む) = 25 */
  /* + fix616(話者の由来を記録。cast.hero を取るため) = 26 */
  /* + fix620(突き合わせの適用層。cast と turns を取るため) = 27 */
  /* + fix624(生成の崩壊を測る探り。読み取り専用で S.turns を走査する) = 28 */
  /* ★2026-07-29 キャラ系統6層監査（fix635/636/637）。3本とも「window.S を唯一の経路にしない」
     という、この台帳が守らせたかった契約そのものが動機なので、必ずここへ足す。
     + fix635(新しい物語の保存ガードを正式API で武装し直す。fix600 が window.S で空振りしていた) = 29
     + fix636(登録NPCの登場証拠を会話ログの確定話者へ揃える。cast と turns を取る)          = 30
     + fix637(登録キャストが空のまま進むのを観測する。cast/turns/scene を読む)               = 31 */
  ok('★__chronicleGetState を参照するのは31ファイル(+features.js)', migrated === 31, migrated);
  ok('★features.js も分類1だけ移行済み',
     fs2.readFileSync(path.join(__dirname, 'features.js'), 'utf8').indexOf('__chronicleGetState') > 0);
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
