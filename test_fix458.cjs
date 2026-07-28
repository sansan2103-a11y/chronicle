/* 回帰テスト: v292Dfix458 — ダッシュ「——」の後処理 ＋ fix625（句読点の重なり）
 *
 * ■このテストが固定する「約束」
 *   ①1ターンの**1回目のダッシュは残す**（表現として有効なので全滅させない）
 *   ②行末・閉じ括弧の直前は「……」（言いよどみ）
 *   ③それ以外の文中の切断は「、」
 *   ④★fix625: 前後のどちらかが**すでに句読点**なら、`、` を足さずダッシュを落とす
 *     （`。、` `、。` という**画面に見える壊れ方**を実データで2件確認したため）
 *   ⑤OFF スイッチで従来どおりに戻る（fix458全体／fix625だけ、の二段）
 *   ⑥壊れた入力で例外を投げない
 *
 * ■実データの裏づけ（2026-07-28・実機の画面で発見）
 *   「言ってたな。——独り身でな」 → 「言ってたな。、独り身でな」（直前が `。`）
 *   「書類か、それとも——。」     → 「書類か、それとも、。」    （直後が `。`）
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const eq = (n, got, want) => ok(n + ' = ' + JSON.stringify(want), JSON.stringify(got) === JSON.stringify(want), got);

const SRC = fs.readFileSync(path.join(__dirname, 'v292Dfix458-dash-post.js'), 'utf8');

function load(opts) {
  opts = opts || {};
  const store = Object.assign({}, opts.lsInit || {});
  const wrote = [];
  const ls = {
    getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => { wrote.push(k); store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    get length() { return Object.keys(store).length; },
    key: i => Object.keys(store)[i] || null
  };
  const S = { turns: opts.turns || [], save() { S.__saves = (S.__saves || 0) + 1; } };
  const W = { localStorage: ls, __chronicleGetState: () => S };
  const doc = { readyState: 'complete', addEventListener() {} };
  const ctx = { window: W, localStorage: ls, document: doc, console: { log() {}, warn() {}, error() {} },
    JSON, Math, Object, Array, String, Number, RegExp, Date,
    setTimeout: () => 1, setInterval: () => 1 };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'v292Dfix458-dash-post.js' });
  return { api: W.__v292Dfix458, S, ls, store, wrote };
}

/* 画面に見えてはいけない重なり */
const COLLIDE_RE = /[。！？…、]、|、[。！？]/;

console.log('--- 1. 起動 ---');
{
  const { api } = load();
  ok('window.__v292Dfix458 が生える', !!api && typeof api.clean === 'function');
}

console.log('\n--- 2. 従来の約束（1回目は残す／行末は……／文中は、） ---');
{
  const { api } = load();
  eq('★1回目のダッシュは残る', api.clean('一度目——残る。'), '一度目——残る。');
  eq('★文中の2回目は「、」', api.clean('一度目——残る。文中で——切れる。'), '一度目——残る。文中で、切れる。');
  eq('★行末の2回目は「……」', api.clean('一度目——残る。行末で——'), '一度目——残る。行末で……');
  eq('★閉じ括弧の直前は「……」', api.clean('一度目——残る。「言いかけて——」'), '一度目——残る。「言いかけて……」');
  eq('ダッシュが無ければ素通り', api.clean('普通の文です。'), '普通の文です。');
}

console.log('\n--- 3. ★fix625: 句読点の重なりを作らない（実データ2件） ---');
{
  const { api } = load();

  /* 実例1: 直前が `。` */
  const r1 = api.clean('一度目——ここは残る。言ってたな。——独り身でな、冬の終わりに一週間ほど。');
  eq('★直前が「。」なら足さずに落とす', r1, '一度目——ここは残る。言ってたな。独り身でな、冬の終わりに一週間ほど。');
  ok('  「。、」が出ない', !COLLIDE_RE.test(r1), r1);

  /* 実例2: 直後が `。` */
  const r2 = api.clean('一度目——残る。書類か、それとも——。');
  eq('★直後が「。」なら足さずに落とす', r2, '一度目——残る。書類か、それとも。');
  ok('  「、。」が出ない', !COLLIDE_RE.test(r2), r2);

  /* 三点リーダの直後 */
  const r3 = api.clean('一度目——残る。……——そこにいた。');
  eq('★直前が「……」でも重ねない', r3, '一度目——残る。……そこにいた。');

  /* 直前が読点 */
  const r4 = api.clean('一度目——残る。ねえ、——聞いてる。');
  ok('★直前が「、」でも重ねない', !COLLIDE_RE.test(r4), r4);

  /* 直後が読点 */
  const r5 = api.clean('一度目——残る。そこで——、彼は黙った。');
  ok('★直後が「、」でも重ねない', !COLLIDE_RE.test(r5), r5);

  /* ★重なりを避けても、正常な文中変換は従来どおり残っていること（過剰に無効化しない） */
  eq('★句読点が無い場所では従来どおり「、」を足す',
     api.clean('一度目——残る。文中で——切れる。'), '一度目——残る。文中で、切れる。');
}

console.log('\n--- 4. ★OFF スイッチ（二段） ---');
{
  /* fix625 だけ止める＝昔の壊れた挙動へ戻る（＝この分岐が本当に効いている証明） */
  const { api: a625 } = load({ lsInit: { v292Dfix625Off: '1' } });
  const bad = a625.clean('一度目——残る。言ってたな。——独り身でな。');
  ok('★fix625 OFF なら昔どおり「。、」が出る（分岐が効いている証明）', COLLIDE_RE.test(bad), bad);

  /* fix458 全体を止めても clean() は純関数なので動く。止まるのは run()（配線側）。 */
  const { api: aAll } = load({ lsInit: { v292Dfix458Off: '1' } });
  ok('fix458 OFF でも clean 自体は純関数として動く', typeof aAll.clean('a——b——c') === 'string');
}

console.log('\n--- 5. ★会話カードの say にも同じ処理がかかる ---');
{
  const turn = {
    narrative: '一度目——残る。',
    _convSays: [{ who: 'A', say: 'まただ——。' }, { who: 'B', say: 'そうか——そうだな。' }]
  };
  const { api } = load({ turns: [turn] });
  /* processTurn は非公開なので clean で等価を確かめる（配線の有無に依存しない形で固定） */
  const s0 = api.clean('一度目——残る。まただ——。');
  ok('★セリフでも「、。」を作らない', !COLLIDE_RE.test(s0), s0);
}

console.log('\n--- 6. 壊れた入力 ---');
{
  const { api } = load();
  let threw = null;
  for (const x of [null, undefined, '', 0, {}, [], '——', '————', '—']) {
    try { api.clean(x); } catch (e) { threw = String(e.message); }
  }
  eq('例外を投げない', threw, null);
  eq('空文字はそのまま', api.clean(''), '');
  eq('単独の—は触らない', api.clean('—'), '—');
}

console.log('\n--- 7. ★総当たり: 重なりを「新たに作らない」 ---');
{
  /* ★最初この検査を「出力に重なりが1つも無いこと」と書いて 14件落ちた。
     中身を見たら**全部わたしが作った入力側に最初から重なりがある**ケースで、
     fix458 が作ったものではなかった（例: 入力が「。、——、」）。
     元から壊れている文を fix458 が直す義務は無い。ここで固定すべきは
     **clean() が重なりを増やさないこと**。数え方を間違えると、無実の側を責める。 */
  const { api } = load();
  const around = ['。', '、', '！', '？', '…', 'あ', '」', '\n', ''];
  const countCollisions = t => (String(t).match(/[。！？…、]、|、[。！？]/g) || []).length;
  const worse = [];
  for (const a of around) for (const b of around) {
    const src = '先頭——残る。' + a + '——' + b + '終わり';
    const out = api.clean(src);
    const d = countCollisions(out) - countCollisions(src);
    if (d > 0) worse.push({ src, out, delta: d });
  }
  eq('★81通りすべてで重なりを増やさない', worse.length, 0);

  /* ★そして「入力がきれいなら出力もきれい」を別に固定する（本来の狙い） */
  const cleanAround = ['。', '！', '？', '…', 'あ', '」', '\n', ''];
  const dirty = [];
  for (const a of cleanAround) for (const b of cleanAround) {
    const src = '先頭——残る。' + a + '——' + b + '終わり';
    if (countCollisions(src) > 0) continue;          // 入力が既に汚いものは対象外
    const out = api.clean(src);
    if (countCollisions(out) > 0) dirty.push({ src, out });
  }
  eq('★入力がきれいなら出力もきれい', dirty.length, 0);
}

console.log('\npass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
