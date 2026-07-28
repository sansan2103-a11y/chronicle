/* 回帰テスト: v292Dfix610 — 「封筒の口を開けた」を発話動詞と誤認しない
 *
 * ■実データ（2026-07-28・おしんの実セーブ 8wfr8b T1・単独実行で真因確定）
 *   モデルの出力:
 *     <say who="霧 涼太">「……何か、言ってなかったか。あの日、何か」</say>
 *     真鍋は封筒の口を開けた。中から出てきたのは、一枚の処方箋の控えだった。
 *   保存された会話ログ: 話者が **真鍋 ひかり** になっていた。
 *
 * ■真因
 *   fix469 の `SPEECH` に発話の慣用句 `口を開` が入っている。
 *   引用の直後の行で「真鍋」＋`は`(SUBJ)＋`口を開`(SPEECH) が揃い、
 *   **speechAfter=140 のハード証拠**が 真鍋 に付いて、
 *   モデルが明示した `<say who="霧 涼太">` を反転させていた。
 *   ★「口を開く」は発話だが、**直前が所有の「の」なら器物の口**（封筒の口・瓶の口・袋の口）。
 *
 * ■このテストが固定する振る舞い
 *   ①「Xは封筒の口を開けた」では**発話と判定しない**
 *   ②「Xは口を開いた」（本来の慣用句）は**従来どおり発話と判定する**
 *   ③「Xは封筒の口を開けた。そして言った」のように**他に発話動詞があれば従来どおり真**
 *   ④OFF スイッチで従来動作へ戻る
 *   ⑤実データの1文で、反転が起きないこと（end-to-end）
 *
 * ■罠への備え
 *   ★lookbehind は使わない設計なので、実装が lookbehind に戻っていないことも検査する
 *     （iOS Safari の対応差を持ち込まないという判断を、コメントではなくテストで固定する）。
 *   ★両辺 null で偽の合格が出ないよう、期待値は具体値で書く。
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const eq = (n, got, want) => ok(n + ' = ' + JSON.stringify(want), JSON.stringify(got) === JSON.stringify(want), got);

const SRCPATH = path.join(__dirname, 'v292Dfix469-speaker-score.js');
const SRC = fs.readFileSync(SRCPATH, 'utf8');

console.log('== (1) 実装の形を固定する ==');
{
  ok('★SPEECH に「口を開」が残っている（慣用句としては正しいので消さない）', /口を開/.test(SRC));
  ok('★speechTest() を経由している（SPEECH.test の直呼びが残っていない）',
    !/[^a-zA-Z]SPEECH\.test\(\s*strict/.test(SRC) && /speechTest\(/.test(SRC));
  ok('★lookbehind を使っていない（iOS Safari の対応差を持ち込まない判断を固定）',
    SRC.indexOf('(?<!') < 0 && SRC.indexOf('(?<=') < 0);
  ok('★OFF スイッチがある', SRC.indexOf('v292Dfix610Off') > 0);
}

/* ---------- speechTest だけを切り出して回す ---------- */
function mkLS(init) {
  const store = Object.assign({}, init || {}), ls = {};
  Object.defineProperties(ls, {
    getItem: { value: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null },
    setItem: { value: (k, v) => { store[k] = String(v); Object.defineProperty(ls, k, { value: String(v), enumerable: true, configurable: true, writable: true }); } },
    removeItem: { value: k => { delete store[k]; delete ls[k]; } },
    length: { get() { return Object.keys(store).length; } }
  });
  Object.keys(store).forEach(k => Object.defineProperty(ls, k, { value: store[k], enumerable: true, configurable: true, writable: true }));
  return ls;
}

const CUT_BEGIN = '  var SPEECH = ';
const CUT_END = '  var SUBJ   =';
function cut() {
  const a = SRC.indexOf(CUT_BEGIN), b = SRC.indexOf(CUT_END);
  if (a < 0 || b < 0 || b <= a) throw new Error('切り出し範囲が見つからない（実装が動いた可能性）');
  return SRC.slice(a, b);
}
function speechTestWith(lsInit) {
  const code = cut() + '\n;module.exports = speechTest;';
  const mod = { exports: null };
  const ctx = { localStorage: mkLS(lsInit), module: mod, String, RegExp, console: { log() {} } };
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: 'v292Dfix469-speaker-score.js' });
  return mod.exports;
}

console.log('\n== (2) 切り出しが成立しているか（先に確かめる） ==');
{
  const seg = cut();
  ok('切り出しに SPEECH の定義が入っている', seg.indexOf('var SPEECH') >= 0);
  ok('切り出しに speechTest の定義が入っている', seg.indexOf('function speechTest') >= 0);
  ok('切り出しが短すぎない', seg.length > 300, seg.length);
}

console.log('\n== (3) ★実データの1文 ==');
{
  const f = speechTestWith();
  eq('★「は封筒の口を開けた。中から出てきた」は発話ではない',
    f('は封筒の口を開けた。中から出てきた'), false);
  eq('★実データの直後14字でも発話ではない', f('は封筒の口を開けた。中から出て'), false);
}

console.log('\n== (4) 本来の慣用句は従来どおり拾う（canary） ==');
{
  const f = speechTestWith();
  eq('「は口を開いた」は発話', f('は口を開いた'), true);
  eq('「がゆっくりと口を開く」は発話', f('がゆっくりと口を開く'), true);
  eq('「は言った」は発話', f('は言った'), true);
  eq('「は答えた」は発話', f('は答えた'), true);
  eq('「は呟いた」は発話', f('は呟いた'), true);
  eq('★他に発話動詞があれば、器物の口があっても発話',
    f('は封筒の口を開けた。そして言った'), true);
}

console.log('\n== (5) 器物の「口」を広く落としすぎていないか ==');
{
  const f = speechTestWith();
  eq('「は瓶の口を開けた」は発話ではない', f('は瓶の口を開けた'), false);
  eq('「は袋の口を開ける」は発話ではない', f('は袋の口を開ける'), false);
  eq('発話動詞がまったく無い文は元から false', f('はゆっくりと歩き出した'), false);
  eq('空文字は false', f(''), false);
  eq('null でも落ちない', f(null), false);
}

console.log('\n== (6) OFF スイッチ ==');
{
  const f = speechTestWith({ v292Dfix610Off: '1' });
  eq('OFF なら従来どおり「封筒の口を開けた」を発話と見なす',
    f('は封筒の口を開けた。中から出てきた'), true);
  eq('OFF でも通常の発話は発話', f('は言った'), true);
}

console.log('\npass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
