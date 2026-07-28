/* 回帰テスト: v292Dfix616 — 話者の「由来」をターンへ記録する（GPT実装順②）
 *
 * ■このテストが固定する「約束」
 *   ①`_convSays` / `who` / `say` を **1文字も変えない**（並行配列にだけ書く）
 *   ②**新しいターンだけ**（過去ターンへ遡って書かない）
 *   ③自分から `S.save()` を **呼ばない**（大きな書込の副作用を避ける）
 *   ④`localStorage` へ自分では書かない
 *   ⑤同じターンへ二度書かない（冪等）
 *   ⑥カードが多すぎる／meta が大きすぎるターンには付けない（容量の暴走防止）
 *   ⑦OFF スイッチで書き足しが止まる
 *   ⑧`purge()` は**明示的に呼んだときだけ**落とす
 *   ⑨fix606 が無ければ黙って何もしない（勝手に別の判定を書かない）
 *
 * ■このプロジェクトの罠への備え
 *   ★モック localStorage の setItem は throw させ、「書いていない」ことを**証明**する。
 *   ★setTimeout スタブはコールバックを呼ぶ（呼ばないと「動かないから壊れない」で通る）。
 *   ★期待値は具体値で書く（両辺 null の偽合格を避ける）。
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const eq = (n, got, want) => ok(n + ' = ' + JSON.stringify(want), JSON.stringify(got) === JSON.stringify(want), got);

const SRC = fs.readFileSync(path.join(__dirname, 'v292Dfix616-say-provenance-persist.js'), 'utf8');
const PROV = fs.readFileSync(path.join(__dirname, 'v292Dfix606-speaker-provenance.js'), 'utf8');

let saveCalls = 0;
function load(opts) {
  opts = opts || {};
  const wrote = [];
  const ls = {
    getItem: k => (opts.lsInit && Object.prototype.hasOwnProperty.call(opts.lsInit, k)) ? opts.lsInit[k] : null,
    setItem: (k) => { wrote.push(k); throw new Error('fix616 must not write localStorage: ' + k); },
    removeItem: (k) => { wrote.push(k); throw new Error('fix616 must not remove localStorage: ' + k); },
    length: 0
  };
  const S = { turns: opts.turns || [], cast: { hero: { name: '白石澪' }, npcs: [{ name: 'ひなた' }] }, save() { saveCalls++; } };
  const appended = [];
  const UI = { appendTurn(t, i) { appended.push([t, i]); }, renderAll() {}, _renderHooks: [] };
  const W = { localStorage: ls, UI, __chronicleGetState: () => S };
  const ctx = { window: W, localStorage: ls, console: { log() {}, warn() {}, error() {} },
    JSON, Math, Object, Array, String, Number, RegExp, Date,
    setInterval: () => 1, setTimeout: (fn) => { try { fn(); } catch (e) {} return 1; } };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  if (opts.noProv !== true) vm.runInContext(PROV, ctx, { filename: 'v292Dfix606-speaker-provenance.js' });
  vm.runInContext(SRC, ctx, { filename: 'v292Dfix616-say-provenance-persist.js' });
  return { api: W.__v292Dfix616, S, UI, W, wrote, appended };
}

const TURN = () => ({
  inputType: 'DO',
  narrative: '「おはよう」\nひなたが笑う。',
  plan: { narrative: ['<say who="ひなた">「おはよう」</say>', 'ひなたが笑う。'] },
  _convSays: [{ who: 'ひなた', say: '「おはよう」' }]
});

console.log('--- 1. 起動と生存証明 ---');
{
  const { api, wrote } = load();
  ok('window.__v292Dfix616 が生える', !!api && typeof api.attach === 'function');
  const st = api.selfTest();
  ok('★selfTest が合格する', st.ok === true, st.detail);
  eq('★localStorage へ1バイトも書かない', wrote.length, 0);
  eq('由来の種類を返す', st.detail.sourceKind, 'say-tag');
  eq('モデルが書いた生の who を残す', st.detail.sourceWhoRaw, 'ひなた');
  eq('タグの何番目かを残す', st.detail.tagOrdinal, 0);
  eq('対応の確かさを残す', st.detail.mapConf, 'exact');
}

console.log('\n--- 2. ★カードを1文字も変えない ---');
{
  const { api } = load();
  const t = TURN();
  const before = JSON.stringify(t._convSays);
  api.attach(t, '白石澪');
  eq('★_convSays は不変', JSON.stringify(t._convSays), before);
  eq('★narrative も不変', t.narrative, '「おはよう」\nひなたが笑う。');
  eq('並行配列は同じ長さ', t._convSayMeta.length, t._convSays.length);
  /* GPT指定の6項目 ＋ fix618 で足した2項目（そのタグを fix464 が挿入したか） */
  ok('meta のキーは GPT 指定の6つ＋fix618の2つ',
    JSON.stringify(Object.keys(t._convSayMeta[0]).sort()) ===
    JSON.stringify(['paragraphIndex', 'promoteScore', 'promotedBy', 'sourceKind', 'sourceWhoRaw', 'speakerRevision', 'tagMappingConfidence', 'tagOrdinal']),
    Object.keys(t._convSayMeta[0]));
  eq('モデル由来なら promotedBy は null', t._convSayMeta[0].promotedBy, null);
  eq('speakerRevision は 0 から', t._convSayMeta[0].speakerRevision, 0);
}

console.log('\n--- 2b. ★fix618: fix464 が挿入したタグを見分ける ---');
{
  /* `<say who="X">` はモデルが書いたとは限らない。
     fix464（裸セリフ→タグ昇格）が後から挿入していることがある。
     ★保存されたテキストからは区別できない（括弧の有無も行の形も見分けに使えなかった）。
     区別できるのは**その場だけ**なので、fix464 の昇格ログをここで拾って印を残す。 */
  const { api, W } = load();
  W.__v292Dfix464 = { stats: () => ({ last: [{ who: 'ひなた', score: 5, say: 'おはよう' }] }) };
  const t = TURN();
  api.attach(t, '白石澪');
  eq('★fix464 が昇格させたタグだと分かる', t._convSayMeta[0].sourceKind, 'say-tag-promoted');
  eq('  誰が挿入したか', t._convSayMeta[0].promotedBy, 'fix464');
  eq('  そのときの点数も残す', t._convSayMeta[0].promoteScore, 5);

  /* ★別のセリフには付けない（取り違え防止） */
  const { api: a2, W: W2 } = load();
  W2.__v292Dfix464 = { stats: () => ({ last: [{ who: 'ひなた', score: 5, say: 'またね' }] }) };
  const t2 = TURN();
  a2.attach(t2, '白石澪');
  eq('別のセリフの昇格ログには反応しない', t2._convSayMeta[0].sourceKind, 'say-tag');
  eq('  promotedBy も null', t2._convSayMeta[0].promotedBy, null);

  /* ★fix464 が居なくても落ちない */
  const { api: a3 } = load();
  const t3 = TURN();
  eq('fix464 が無くても付く', a3.attach(t3, '白石澪'), true);
  eq('  promotedBy は null', t3._convSayMeta[0].promotedBy, null);
}

console.log('\n--- 3. ★保存を自分から呼ばない ---');
{
  saveCalls = 0;
  const { api, S } = load();
  const t = TURN();
  api.attach(t, '白石澪');
  eq('★S.save() を呼んでいない', saveCalls, 0);
  ok('（次の自然な保存に相乗りする設計）', true);
}

console.log('\n--- 4. ターン確定で自動的に付く（appendTurn ラップ） ---');
{
  const { UI, appended } = load();
  const t = TURN();
  UI.appendTurn(t, 0);
  ok('★appendTurn 経由で meta が付く', Array.isArray(t._convSayMeta), t._convSayMeta);
  eq('元の appendTurn も呼ばれる', appended.length, 1);
  eq('  引数はそのまま渡る', appended[0][1], 0);
}

console.log('\n--- 5. 冪等・遡らない ---');
{
  const { api } = load();
  const t = TURN();
  eq('1回目は付く', api.attach(t, '白石澪'), true);
  eq('★2回目は付けない（冪等）', api.attach(t, '白石澪'), false);
  eq('  内容も増えない', t._convSayMeta.length, 1);

  /* ★過去ターンへ遡らない: 読み込み時に一斉付与するような処理は無い */
  const old1 = TURN(), old2 = TURN();
  const { api: a2 } = load({ turns: [old1, old2] });
  ok('★起動しただけでは過去ターンに付かない',
    !Array.isArray(old1._convSayMeta) && !Array.isArray(old2._convSayMeta),
    [!!old1._convSayMeta, !!old2._convSayMeta]);
  eq('  coverage も 0 と数える', a2.coverage().turnsWithMeta, 0);
}

console.log('\n--- 6. 容量の暴走を止める ---');
{
  const { api } = load();
  const many = TURN();
  many._convSays = [];
  for (let i = 0; i < 41; i++) many._convSays.push({ who: 'ひなた', say: '「' + i + '」' });
  eq('★カードが多すぎるターンには付けない', api.attach(many, '白石澪'), false);
  ok('  meta を作っていない', !Array.isArray(many._convSayMeta));
  eq('  上限は 40 枚', api._limits.MAX_CARDS, 40);
  eq('  1ターンの上限は 8000 字', api._limits.MAX_META_CHARS, 8000);
  ok('  理由を数えている', api.stats().skippedTooMany >= 1, api.stats());
}

console.log('\n--- 7. OFF スイッチ ---');
{
  const { api } = load({ lsInit: { v292Dfix616Off: '1' } });
  const t = TURN();
  eq('OFF なら付けない', api.attach(t, '白石澪'), false);
  ok('  meta が無い', !Array.isArray(t._convSayMeta));
  eq('  stats が disabled を返す', api.stats().disabled, true);
}

console.log('\n--- 8. purge()（★明示的に呼んだときだけ） ---');
{
  const t1 = TURN(), t2 = TURN();
  const { api, S } = load({ turns: [t1, t2] });
  api.attach(t1, '白石澪'); api.attach(t2, '白石澪');
  eq('2ターンに付いた', api.coverage().turnsWithMeta, 2);
  saveCalls = 0;
  const p = api.purge();
  eq('★2ターンから落ちた', p.purgedTurns, 2);
  eq('  purge も保存を呼ばない', saveCalls, 0);
  eq('  coverage が 0 に戻る', api.coverage().turnsWithMeta, 0);
  eq('★カードは purge 後も無傷', JSON.stringify(t1._convSays), JSON.stringify(TURN()._convSays));
}

console.log('\n--- 9. fix606 が無ければ何もしない ---');
{
  const { api } = load({ noProv: true });
  const t = TURN();
  eq('★勝手に別の判定を書かない', api.attach(t, '白石澪'), false);
  ok('  meta を作らない', !Array.isArray(t._convSayMeta));
  ok('  理由を数える', api.stats().skippedNoProv >= 1, api.stats());
}

console.log('\n--- 10. 壊れた入力・ずれの検出 ---');
{
  const { api } = load();
  let threw = null;
  for (const t of [null, undefined, {}, { _convSays: null }, { _convSays: [] }, { _convSays: [null] }]) {
    try { api.attach(t, '白石澪'); } catch (e) { threw = String(e.message); }
  }
  eq('壊れた入力でも例外を投げない', threw, null);

  /* ★長さのずれ（後段でカードが増えた）を検出できること */
  const t = TURN();
  api.attach(t, '白石澪');
  t._convSays.push({ who: 'ひなた', say: '「またね」' });   // 後段がカードを増やした想定
  const { api: a3 } = load({ turns: [t] });
  eq('★カードが増えたら長さのずれとして数える', a3.coverage().lengthMismatch, 1);
}

console.log('\npass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
