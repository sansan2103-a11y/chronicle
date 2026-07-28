/* 回帰テスト: v292Dfix616 — 話者の「由来」をターンへ記録する（GPT実装順②）
 *
 * ■このテストが固定する「約束」
 *   ①`_convSays` / `who` / `say` を **1文字も変えない**（並行配列にだけ書く）
 *   ②**新しいターンだけ**（過去ターンへ遡って書かない）
 *   ③`attach()` 単体では `S.save()` を **呼ばない**（純関数に近く保つ）。
 *     ★fix622: ターン確定の配線（appendTurn）でだけ、**付いたときに限り**1回保存する
 *     （実機で「最後のターンの meta が再読み込みで消える」を踏んだため。理由は本文コメント）
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
  const S = { turns: opts.turns || [], cast: { hero: { name: '白石澪' }, npcs: [{ name: 'ひなた' }] }, save() { saveCalls++; S.__saves = (S.__saves || 0) + 1; } };
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
  return { api: W.__v292Dfix616, S, UI, W, wrote, appended, ls };
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
  /* GPT指定の6項目 ＋ fix618 の2項目 ＋ fix621 の charOffset */
  ok('meta のキーは GPT 指定の6つ＋fix618の2つ＋fix621の1つ',
    JSON.stringify(Object.keys(t._convSayMeta[0]).sort()) ===
    JSON.stringify(['charOffset', 'paragraphIndex', 'promoteScore', 'promotedBy', 'sourceKind', 'sourceWhoRaw', 'speakerRevision', 'tagMappingConfidence', 'tagOrdinal']),
    Object.keys(t._convSayMeta[0]));
  eq('モデル由来なら promotedBy は null', t._convSayMeta[0].promotedBy, null);
  eq('speakerRevision は 0 から', t._convSayMeta[0].speakerRevision, 0);
}

console.log('\n--- 1b. ★fix622: 付けた meta を確実に残す（実機で消えた） ---');
{
  /* ■実機で踏んだ（2026-07-28・新しい物語の1ターン目）
     1ターン回して再読み込みしたら `_convSayMeta` が**消えていた**。
     保存されたスロットには `_convSayMeta` の文字列が1つも無く、
     その場で S.save() を1回呼ぶと 4507→4896 バイトになって現れた
     （＝削られてはいない。**一度も保存されていなかった**）。
     原因は index.html の順序:
         S.turns.push(turn); S.save(); UI.appendTurn(turn, …)
     meta は直前の保存に間に合わず、「次の保存」は来る保証が無い。
     ★このテストは「付けたら保存する／付けなければ保存しない」を固定する。 */
  const { api, UI, S } = load();
  const t = TURN();
  UI.appendTurn(t, 0);
  ok('★meta が付いた', Array.isArray(t._convSayMeta));
  eq('★付いたので保存を1回呼ぶ', S.__saves, 1);
  eq('  数えている', api.stats().saves, 1);

  /* 2回目（もう付くものが無い）＝保存を呼ばない */
  UI.appendTurn(t, 0);
  eq('★付かなければ保存を呼ばない', S.__saves, 1);
  eq('  件数も増えない', api.stats().saves, 1);

  /* OFF なら付けないし保存もしない */
  const { UI: UI3, S: S3 } = load({ lsInit: { v292Dfix616Off: '1' } });
  const t3 = TURN();
  UI3.appendTurn(t3, 0);
  ok('★OFF なら meta も保存も無い', !t3._convSayMeta && !S3.__saves, { meta: !!t3._convSayMeta, saves: S3.__saves });

  /* save が無い state でも例外を外へ出さない */
  const { UI: UI4, S: S4 } = load();
  delete S4.save;
  let threw = null;
  try { UI4.appendTurn(TURN(), 0); } catch (e) { threw = String(e.message); }
  eq('save が無くても落ちない', threw, null);

  /* ★localStorage へ自分では書かない（経路は S.save() だけ）
     ★モックの setItem は throw する設計なので、`wrote` が空＝一度も試みていない証明になる。 */
  const { UI: UI5, wrote: wrote5 } = load();
  UI5.appendTurn(TURN(), 0);
  eq('★localStorage へ直接書こうとすらしない', wrote5, []);
}

console.log('\n--- 1c. ★fix622: stats() が自分のカウンタを汚さない ---');
{
  /* ■実機で踏んだ: stats() が内部で selfTest() を呼んでいたため、
     読むだけで attached / alreadyHad が増え、**人工ターンの分**を
     実データの観測値だと読み違えた（実際の実データは 0件だった）。
     観測窓が観測するだけで動くなら、その数字は証拠に使えない。 */
  const { api } = load();
  const a = api.stats();
  const b = api.stats();
  const c = api.stats();
  eq('★何度読んでも attached は 0 のまま', [a.attached, b.attached, c.attached], [0, 0, 0]);
  eq('★alreadyHad も 0 のまま', [a.alreadyHad, b.alreadyHad, c.alreadyHad], [0, 0, 0]);
  eq('  それでも生存証明は動いている', a.selfTestPassed, true);
  eq('  selfTest を直接呼んでも汚さない', (api.selfTest(), api.stats().attached), 0);

  /* 本物の付与だけが数に出る */
  const { api: api2, UI: UI2 } = load();
  UI2.appendTurn(TURN(), 0);
  eq('★実データの付与だけが数に出る', api2.stats().attached, 1);
  eq('  読み直しても増えない', api2.stats().attached, 1);
}

console.log('\n--- 2c. ★fix621: paragraphIndex が「文字位置」になっていた誤りを固定する ---');
{
  /* ■実機で見つけた誤り（2026-07-28・新しい物語の1ターン目）
     plan.narrative が 6段落（長さ 85/32/36/51/36/24）のターンで、
     3枚のカードの paragraphIndex が **102 / 172 / 224** になっていた。
     6段落しか無いのだから、これは段落番号ではありえない。
     正体は listSayTags() が返す `at`＝**段落を連結したあとの文字位置**だった。
     挙動には影響しないが、後から来歴を追う人を確実に誤解させるので分離した。
     ★このテストは「2つの値が別物であること」を具体値で固定する。 */
  const { api } = load();
  const t = {
    inputType: 'DO',
    narrative: 'x',
    plan: { narrative: [
      'A'.repeat(85),                                   // 0..84      段落0
      '<say who="宿の主人">……去年の客、ねえ。</say>',      // 86..       段落1
      'B'.repeat(36),                                   //            段落2
      '<say who="宿の主人">あんた、何のために聞くんだい。</say>', //     段落3
      '<say who="緒方 湊">仕事です。私は記者ですから。</say>',   //     段落4
      'C'.repeat(24)                                    //            段落5
    ] },
    _convSays: [
      { who: '宿の主人', say: '……去年の客、ねえ。' },
      { who: '宿の主人', say: 'あんた、何のために聞くんだい。' },
      { who: '緒方 湊', say: '仕事です。私は記者ですから。' }
    ]
  };
  api.attach(t, '緒方 湊');
  const m = t._convSayMeta;
  eq('★段落番号は 1 / 3 / 4', m.map(x => x.paragraphIndex), [1, 3, 4]);
  ok('★文字位置は段落番号より遥かに大きい（＝別物であることの証明）',
    m.every(x => x.charOffset > x.paragraphIndex && x.charOffset > 85),
    m.map(x => [x.paragraphIndex, x.charOffset]));
  eq('  タグの順番も 0 / 1 / 2', m.map(x => x.tagOrdinal), [0, 1, 2]);
  eq('  段落番号は段落数を超えない', m.every(x => x.paragraphIndex < t.plan.narrative.length), true);

  /* ★段落の中に改行が入っていても数え方が崩れない（'\n' を数える実装だと壊れる） */
  const t2 = {
    inputType: 'DO', narrative: 'x',
    plan: { narrative: ['前置き\nもう1行\nさらに1行', '<say who="ひなた">「おはよう」</say>'] },
    _convSays: [{ who: 'ひなた', say: '「おはよう」' }]
  };
  api.attach(t2, '白石澪');
  eq('★段落内の改行に騙されない（段落1）', t2._convSayMeta[0].paragraphIndex, 1);
}

console.log('\n--- 2d. ★fix621: 旧形の meta だけ作り直す ---');
{
  const { api } = load();
  const t = TURN();
  /* fix621 より前に付いた形（charOffset が無い） */
  t._convSayMeta = [{ sourceKind: 'say-tag', sourceWhoRaw: 'ひなた', paragraphIndex: 15, tagOrdinal: 0, tagMappingConfidence: 'exact', speakerRevision: 0, promotedBy: null, promoteScore: null }];
  eq('★旧形は作り直す', api.attach(t, '白石澪'), true);
  eq('  charOffset が入る', t._convSayMeta[0].charOffset, 15);
  eq('  paragraphIndex は段落番号になる', t._convSayMeta[0].paragraphIndex, 0);
  eq('  作り直した件数を数える', api.stats().migrated, 1);
  eq('★2回目はもう作り直さない', api.attach(t, '白石澪'), false);
  eq('  件数も増えない', api.stats().migrated, 1);

  /* 判定関数そのもの */
  eq('新形は旧形と判定しない', api.isStaleMeta([{ charOffset: 0 }]), false);
  eq('空配列は旧形と判定しない', api.isStaleMeta([]), false);
  eq('配列でなければ false', api.isStaleMeta(null), false);
  eq('★null 混じりでも charOffset があれば新形', api.isStaleMeta([null, { charOffset: 3 }]), false);
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

console.log('\n--- 3. ★attach() 単体は保存を呼ばない ---');
{
  /* ★fix622 で「配線側は保存する」に変えたが、`attach()` 自体は
     副作用の無い部品のままにしておく（過去ターンへ手で付けるときに
     勝手な保存が走らないように）。保存するのは appendTurn の配線だけ。 */
  saveCalls = 0;
  const { api, S } = load();
  const t = TURN();
  api.attach(t, '白石澪');
  eq('★attach() 単体では S.save() を呼ばない', saveCalls, 0);
  eq('  カウンタにも出ない', api.stats().saves, 0);
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
