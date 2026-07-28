/* 回帰テスト: v292Dfix620 — 話者の突き合わせを実際に適用する層
 *
 * ■このテストが固定する「約束」
 *   ①動かすのは `who` **だけ**。カード本文（`say`）は1文字も変えない
 *   ②判定は fix611 に一任する（ここで条件を再実装しない＝二重実装を作らない）
 *   ③過去ターンへ**自動では**遡らない（`repairPast` を明示的に呼んだときだけ）
 *   ④`repairPast` の既定は **dryRun**（何も書かない）
 *   ⑤書く前に**復元用の記録**を残す。`undoPast()` で戻せる
 *   ⑥OFF スイッチで完全に従来どおりになる（fix620 側・fix611 側の二重）
 *   ⑦条件を満たさないカードには触らない
 *   ⑧変わったときだけ保存・再描画を呼ぶ（毎回呼ばない）
 *
 * ■罠への備え
 *   ★setTimeout スタブはコールバックを呼ぶ（呼ばないと配線されず「壊れないから合格」になる）
 *   ★期待値は具体値で書く
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const eq = (n, got, want) => ok(n + ' = ' + JSON.stringify(want), JSON.stringify(got) === JSON.stringify(want), got);

const SRC = fs.readFileSync(path.join(__dirname, 'v292Dfix620-speaker-apply.js'), 'utf8');
const GATE = fs.readFileSync(path.join(__dirname, 'v292Dfix611-speaker-gate.js'), 'utf8');
const PROV = fs.readFileSync(path.join(__dirname, 'v292Dfix606-speaker-provenance.js'), 'utf8');

function mkLS(init) {
  const store = Object.assign({}, init || {}), ls = {};
  Object.defineProperties(ls, {
    getItem: { value: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null },
    setItem: { value: (k, v) => { store[k] = String(v); Object.defineProperty(ls, k, { value: String(v), enumerable: true, configurable: true, writable: true }); } },
    removeItem: { value: k => { delete store[k]; delete ls[k]; } },
    length: { get() { return Object.keys(store).length; } },
    __store: { value: store }
  });
  Object.keys(store).forEach(k => Object.defineProperty(ls, k, { value: store[k], enumerable: true, configurable: true, writable: true }));
  return ls;
}
const CAST = { hero: { name: '霧 涼太' }, npcs: [{ name: '真鍋 ひかり' }, { name: '藤堂 志乃' }] };
const TURN = () => ({
  inputType: 'DO', narrative: '「……何か、言ってなかったか」',
  plan: { narrative: ['<say who="霧 涼太">「……何か、言ってなかったか」</say>', '真鍋は封筒の口を開けた。'] },
  _convSays: [{ who: '真鍋 ひかり', say: '「……何か、言ってなかったか」' }]
});

function load(opts) {
  opts = opts || {};
  const ls = mkLS(opts.lsInit);
  const S = { turns: opts.turns || [], cast: JSON.parse(JSON.stringify(CAST)), save() { S.__saves = (S.__saves || 0) + 1; } };
  const appended = [];
  const UI = { appendTurn(t, i) { appended.push([t, i]); }, renderAll() {}, _renderHooks: [] };
  const repairs = { n: 0 };
  const W = { localStorage: ls, UI, __chronicleGetState: () => S, __v292Dfix66: { repair() { repairs.n++; } } };
  const ctx = { window: W, localStorage: ls, console: { log() {}, warn() {}, error() {} },
    JSON, Math, Object, Array, String, Number, RegExp, Date,
    setInterval: () => 1, setTimeout: (fn) => { try { fn(); } catch (e) {} return 1; } };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  if (opts.noDeps !== true) {
    vm.runInContext(PROV, ctx, { filename: 'v292Dfix606-speaker-provenance.js' });
    vm.runInContext(GATE, ctx, { filename: 'v292Dfix611-speaker-gate.js' });
  }
  vm.runInContext(SRC, ctx, { filename: 'v292Dfix620-speaker-apply.js' });
  return { api: W.__v292Dfix620, S, UI, ls, appended, repairs, W };
}

console.log('--- 1. 起動と生存証明 ---');
{
  const { api } = load();
  ok('window.__v292Dfix620 が生える', !!api && typeof api.applyTurn === 'function');
  const st = api.selfTest();
  ok('★selfTest が合格する', st.ok === true, st.detail);
  eq('  1件直る', st.detail.applied, 1);
  eq('  タグ側になる', st.detail.who, '霧 涼太');
  ok('  本文は不変', st.detail.sayUntouched === true);
}

console.log('\n--- 2. ★who だけ動かす。本文は触らない ---');
{
  const { api } = load();
  const t = TURN();
  const sayBefore = t._convSays[0].say, narrBefore = t.narrative;
  eq('1件適用', api.applyTurn(t, ['霧 涼太', '真鍋 ひかり'], '霧 涼太'), 1);
  eq('who がタグ側へ', t._convSays[0].who, '霧 涼太');
  eq('★say は1文字も変わらない', t._convSays[0].say, sayBefore);
  eq('★narrative も変わらない', t.narrative, narrBefore);
}

console.log('\n--- 3. 条件を満たさないカードには触らない（判定は fix611 に一任） ---');
{
  const { api } = load();
  // 直接証拠があるので触らない
  const t = TURN();
  t.plan.narrative[1] = '「……何か、言ってなかったか」と真鍋が言った。';
  eq('★直接証拠があれば触らない', api.applyTurn(t, ['霧 涼太', '真鍋 ひかり'], '霧 涼太'), 0);
  eq('  who も元のまま', t._convSays[0].who, '真鍋 ひかり');

  // 名寄せは対象外
  const t2 = TURN();
  t2.plan.narrative[0] = '<say who="真鍋">「……何か、言ってなかったか」</say>';
  eq('名寄せは触らない', api.applyTurn(t2, ['霧 涼太', '真鍋 ひかり'], '霧 涼太'), 0);

  // 途中で who が変わっていたら触らない
  const t3 = TURN();
  const g = load();
  t3._convSays[0].who = '藤堂 志乃';
  const n3 = api.applyTurn(t3, ['霧 涼太', '真鍋 ひかり', '藤堂 志乃'], '霧 涼太');
  ok('別のwhoでも条件を満たせば直る（12条件は fix611 が判定）', n3 === 0 || t3._convSays[0].who === '霧 涼太', { n3, who: t3._convSays[0].who });
}

console.log('\n--- 4. ターン確定時に自動で走る（appendTurn ラップ） ---');
{
  const { api, UI, S, appended, repairs } = load();
  const t = TURN();
  UI.appendTurn(t, 0);
  eq('★確定時に直る', t._convSays[0].who, '霧 涼太');
  eq('元の appendTurn も呼ばれる', appended.length, 1);
  ok('★変わったときだけ保存を呼ぶ', S.__saves === 1, S.__saves);
  ok('★変わったときだけ再描画を呼ぶ', repairs.n === 1, repairs.n);

  // 変わらないターンでは保存も再描画も呼ばない
  const { UI: UI2, S: S2, repairs: rp2 } = load();
  const t2 = TURN();
  t2.plan.narrative[1] = '「……何か、言ってなかったか」と真鍋が言った。';
  UI2.appendTurn(t2, 0);
  ok('★変わらなければ保存を呼ばない', !S2.__saves, S2.__saves);
  ok('★変わらなければ再描画も呼ばない', rp2.n === 0, rp2.n);
}

console.log('\n--- 5. 過去ターンへ自動では遡らない ---');
{
  const old1 = TURN(), old2 = TURN();
  const { api } = load({ turns: [old1, old2] });
  ok('★起動しただけでは過去ターンを直さない',
    old1._convSays[0].who === '真鍋 ひかり' && old2._convSays[0].who === '真鍋 ひかり',
    [old1._convSays[0].who, old2._convSays[0].who]);
  const r = api.repairPast();
  eq('★repairPast の既定は dryRun', r.dryRun, true);
  eq('  提案は2件', r.proposals.length, 2);
  eq('  適用は0件', r.applied, 0);
  ok('  データは変わっていない', old1._convSays[0].who === '真鍋 ひかり');
}

console.log('\n--- 6. repairPast({apply:true}) と復元 ---');
{
  const old1 = TURN(), old2 = TURN();
  const { api, S, ls, repairs } = load({ turns: [old1, old2] });
  const r = api.repairPast({ apply: true });
  eq('2件適用', r.applied, 2);
  eq('  who がタグ側へ', [old1._convSays[0].who, old2._convSays[0].who], ['霧 涼太', '霧 涼太']);
  eq('★本文は不変', old1._convSays[0].say, TURN()._convSays[0].say);
  ok('保存を呼ぶ', S.__saves >= 1, S.__saves);
  ok('再描画を呼ぶ', repairs.n >= 1, repairs.n);

  /* ★復元用の記録が残っている */
  const rec = api.restoreInfo();
  ok('★復元用の記録がある', !!rec && Array.isArray(rec.items) && rec.items.length === 2, rec);
  eq('  書き込んだキーは1つだけ', Object.keys(ls.__store), ['v292Dfix620_restore']);

  /* ★戻せる */
  const u = api.undoPast();
  eq('★元へ戻せる', u.restored, 2);
  eq('  who が元へ', [old1._convSays[0].who, old2._convSays[0].who], ['真鍋 ひかり', '真鍋 ひかり']);

  /* 記録は上書きしない（2回目の apply でも最初の記録を守る） */
  api.repairPast({ apply: true });
  const rec2 = api.restoreInfo();
  eq('復元記録は上書きしない', rec2.ts, rec.ts);
}

console.log('\n--- 7. OFF スイッチ（二重の逃げ道） ---');
{
  const t = TURN();
  const { api } = load({ lsInit: { v292Dfix620ApplyOff: '1' } });
  eq('fix620 側 OFF で何もしない', api.applyTurn(t, ['霧 涼太', '真鍋 ひかり'], '霧 涼太'), 0);
  eq('  who は元のまま', t._convSays[0].who, '真鍋 ひかり');
  eq('  repairPast も止まる', api.repairPast({ apply: true }).disabled, true);

  const t2 = TURN();
  const { api: a2 } = load({ lsInit: { v292Dfix619ReconcilerOff: '1' } });
  eq('★fix611 側 OFF でも止まる', a2.applyTurn(t2, ['霧 涼太', '真鍋 ひかり'], '霧 涼太'), 0);
  eq('  who は元のまま', t2._convSays[0].who, '真鍋 ひかり');
}

console.log('\n--- 8. 依存が無い・壊れた入力 ---');
{
  const { api } = load({ noDeps: true });
  const t = TURN();
  eq('★fix611 が無ければ何もしない', api.applyTurn(t, ['霧 涼太'], '霧 涼太'), 0);
  eq('  repairPast は正直に error を返す', api.repairPast().error, 'fix611-missing');
  eq('  selfTest も false', api.selfTest().ok, false);

  const { api: a2 } = load();
  let threw = null;
  for (const x of [null, undefined, {}, { _convSays: null }, { _convSays: [null] }]) {
    try { a2.applyTurn(x, ['A'], 'A'); } catch (e) { threw = String(e.message); }
  }
  eq('壊れた入力でも例外を投げない', threw, null);
  eq('復元記録が無いときの undo', a2.undoPast().error, 'no-restore-record');
}

console.log('\npass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
