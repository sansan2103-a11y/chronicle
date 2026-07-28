/* 回帰テスト: v292Dfix606 — 話者帰属の来歴（provenance）アナライザ
 *
 * ■このテストが固定するもの（形ではなく「約束」）
 *   ①**副作用を持たない**こと
 *      ・localStorage へ1バイトも書かない
 *      ・turn / card オブジェクトを1つも変更しない
 *      ・DOM を触らない（window.document を渡さなくても動く）
 *   ②分類（source）が実データの形どおりに立つこと。**分類ごとに生存証明**を取る。
 *      ★「総数>0」では分類器の欠陥を捕まえられない（fix569 で実証済み）。
 *   ③二次判定の印（hero-default / short-utterance / evidence-conflict）が
 *      **fix604 で実機捕獲した誤りをちゃんと拾う**こと。ここが本命。
 *   ④OFF スイッチで停止すること。
 *   ⑤stats() が **分母（total）と selfTestPassed を必ず一緒に返す**こと。
 *      （数字だけ返して「異常0件」と読ませない、というプロジェクトの決まり）
 *
 * ■このプロジェクトの罠に対する備え
 *   ★両辺 null で偽の合格が出ないよう、期待値は具体値で書く。
 *   ★モック localStorage は setItem したキーが Object.keys(localStorage) にも見えること。
 *   ★setInterval のスタブはコールバックを1回呼ぶ（呼ばないと「動かないから壊れない」で通ってしまう）。
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const eq = (n, got, want) => ok(n + ' = ' + JSON.stringify(want), JSON.stringify(got) === JSON.stringify(want), got);

const SRCPATH = path.join(__dirname, 'v292Dfix606-speaker-provenance.js');
const SRC = fs.readFileSync(SRCPATH, 'utf8');

/* ---------- モック localStorage ----------
   ★setItem したキーが Object.keys(localStorage) にも見えること。 */
function mkLS(init) {
  const store = Object.assign({}, init || {}), ls = {};
  Object.defineProperties(ls, {
    getItem: { value: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null },
    setItem: { value: (k, v) => { store[k] = String(v); Object.defineProperty(ls, k, { value: String(v), enumerable: true, configurable: true, writable: true }); } },
    removeItem: { value: k => { delete store[k]; delete ls[k]; } },
    key: { value: i => Object.keys(store)[i] },
    length: { get() { return Object.keys(store).length; } },
    __store: { value: store }
  });
  Object.keys(store).forEach(k => Object.defineProperty(ls, k, { value: store[k], enumerable: true, configurable: true, writable: true }));
  return ls;
}

let intervalCalls = 0;
function load(lsInit, state) {
  const ls = mkLS(lsInit);
  const win = {};
  const ctx = {
    window: win, localStorage: ls,
    console: { log() {}, warn() {}, error() {} },
    Date: Date, JSON: JSON, Math: Math, Object: Object, Array: Array, String: String, Number: Number,
    setInterval: (fn) => { intervalCalls++; try { fn(); } catch (e) {} return 1; },   // ★必ず1回呼ぶ
    setTimeout: (fn) => { try { fn(); } catch (e) {} return 1; }
  };
  ctx.globalThis = ctx;
  win.localStorage = ls;
  if (state) win.__chronicleGetState = () => state;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'v292Dfix606-speaker-provenance.js' });
  return { api: win.__v292Dfix606, ls, win };
}

console.log('--- 1. 起動と生存証明（canary） ---');
{
  const { api, ls } = load();
  ok('window.__v292Dfix606 が生える', !!api && typeof api.classifyCard === 'function');
  const st = api.selfTest();
  ok('selfTest が合格する', st.ok === true, st.detail.filter(d => !d.ok));
  eq('分類が7種すべて立つ（生存証明）', st.classesSeen, 7);
  ok('setInterval が1回は仕掛けられる', intervalCalls >= 1, intervalCalls);
  eq('★localStorage へ1バイトも書いていない', Object.keys(ls.__store).length, 0);
}

console.log('\n--- 2. 分類（source）ごとの判定 ---');
{
  const { api } = load();
  const H = { hero: '白石澪' };
  const c = (t, card, idx) => api.classifyCard(t, card, idx, H);

  eq('say-tag: タグの who と一致',
    c({ narrative: '<say who="ひなた">「おはよう」</say>' }, { who: 'ひなた', say: '「おはよう」' }, 1).source, 'say-tag');

  eq("say-tag: 属性が '…' でも読める",
    c({ narrative: "<say who='ひなた'>「おはよう」</say>" }, { who: 'ひなた', say: '「おはよう」' }, 1).source, 'say-tag');

  eq('say-tag: 属性が裸でも読める',
    c({ narrative: '<say who=ひなた>「おはよう」</say>' }, { who: 'ひなた', say: '「おはよう」' }, 1).source, 'say-tag');

  const ren = c({ narrative: '<say who="杏子">「行くよ」</say>' }, { who: '氷川 杏子', say: '「行くよ」' }, 1);
  eq('say-tag-renamed: タグと最終whoが違う', ren.source, 'say-tag-renamed');
  eq('say-tag-renamed: 確度は medium', ren.confidence, 'medium');
  ok('say-tag-renamed: evidence-conflict が立つ', ren.flags.indexOf('evidence-conflict') >= 0, ren.flags);
  eq('say-tag-renamed: tagWho を保存する', ren.tagWho, '杏子');

  eq('react-voice: _rv=1 は聖域',
    c({ narrative: 'ひなたが息を呑む。' }, { who: 'ひなた', say: '「……ぇ」', _rv: 1 }, 1).source, 'react-voice');

  eq('hero-utterance: SAYターン先頭の主人公発話',
    c({ narrative: '<say who="白石澪">「行こう」</say>', inputType: 'say', playerText: '行こう' },
      { who: '白石澪', say: '「行こう」' }, 0).source, 'hero-utterance');

  eq('harvest: 本文に say タグが1つも無い',
    c({ narrative: '「そこにいるのか」と、カエデが問う。' }, { who: 'カエデ', say: '「そこにいるのか」' }, 1).source, 'harvest');

  eq('unmatched: セリフが本文に無い',
    c({ narrative: '風が吹いた。' }, { who: 'レナ', say: '「誰かいる」' }, 1).source, 'unmatched');

  eq('bare-inferred: タグはあるがこのセリフはタグ外',
    c({ narrative: '<say who="ひなた">「おはよう」</say>\n「……ぇ」\n声が漏れる。' },
      { who: '白石澪', say: '「……ぇ」' }, 2).source, 'bare-inferred');
}

console.log('\n--- 3. 拾ってはいけない（偽陽性の否定） ---');
{
  const { api } = load();
  const H = { hero: '白石澪' };
  const c = (t, card, idx) => api.classifyCard(t, card, idx, H);

  eq('hero-utterance は先頭カード以外では立たない',
    c({ narrative: '<say who="白石澪">「行こう」</say>', inputType: 'say', playerText: '行こう' },
      { who: '白石澪', say: '「行こう」' }, 2).source, 'say-tag');

  eq('hero-utterance は DO ターンでは立たない',
    c({ narrative: '<say who="白石澪">「行こう」</say>', inputType: 'do', playerText: '行こう' },
      { who: '白石澪', say: '「行こう」' }, 0).source, 'say-tag');

  eq('hero-utterance は playerText と中身が違えば立たない',
    c({ narrative: '<say who="白石澪">「やめて」</say>', inputType: 'say', playerText: '行こう' },
      { who: '白石澪', say: '「やめて」' }, 0).source, 'say-tag');

  eq('閉じタグの無い壊れた say はタグとして数えない',
    c({ narrative: '<say who="ひなた">「おはよう」' }, { who: 'ひなた', say: '「おはよう」' }, 1).source, 'harvest');

  // 空の say タグで無限ループしないこと（lastIndex 前進の保険）
  const tags = api.listSayTags('<say who="A"></say><say who="B"></say>');
  eq('空 say を2件とも数え、無限ループしない', tags.length, 2);

  eq('鉤括弧の有無で照合が割れない',
    c({ narrative: '<say who="ひなた">おはよう</say>' }, { who: 'ひなた', say: '「おはよう」' }, 1).source, 'say-tag');

  /* ★short-utterance の水増し防止（実データで閾値を決めた根拠をここで固定する）。
     単純な字数だと普通の短い台詞まで候補に入り、二次判定の的が絞れなくなる。 */
  const sflags = (say) => c({ narrative: '「' + say + '」\n誰かが言った。' }, { who: '白石澪', say: '「' + say + '」' }, 1).flags;
  ok('「おはよう」は短い声ではない', sflags('おはよう').indexOf('short-utterance') < 0, sflags('おはよう'));
  ok('「行くよ」は短い声ではない', sflags('行くよ').indexOf('short-utterance') < 0, sflags('行くよ'));
  ok('「誰かいる」は短い声ではない', sflags('誰かいる').indexOf('short-utterance') < 0, sflags('誰かいる'));
  ok('「……」だけは短い声（中身0字なので印は付かない）', sflags('……').indexOf('short-utterance') < 0, sflags('……'));
  ok('「ぁ」は短い声', sflags('ぁ').indexOf('short-utterance') >= 0, sflags('ぁ'));
  ok('「うん」は短い声', sflags('うん').indexOf('short-utterance') >= 0, sflags('うん'));
}

console.log('\n--- 4. ★本命: fix604 で実機捕獲した誤りを二次判定の候補として拾えるか ---');
{
  /* 2026-07-27 iPhone 実機:
       「……ぇ」
       ひなたの喉の奥から、引きつったような声が漏れる。
     ＝地の文が話者を名指しているのに、会話ログは主人公(白石澪)に振っていた。 */
  const { api } = load();
  const turn = {
    narrative: '<say who="ひなた">「大丈夫だよ」</say>\n「……ぇ」\nひなたの喉の奥から、引きつったような声が漏れる。',
    inputType: 'do', playerText: ''
  };
  const card = { who: '白石澪', say: '「……ぇ」' };
  const r = api.classifyCard(turn, card, 2, { hero: '白石澪' });

  eq('実機ケースの source', r.source, 'bare-inferred');
  eq('実機ケースの確度', r.confidence, 'low');
  ok('★hero-default が立つ（主人公デフォルトしか根拠がない）', r.flags.indexOf('hero-default') >= 0, r.flags);
  ok('★short-utterance が立つ（中身は「ぇ」1字）', r.flags.indexOf('short-utterance') >= 0, r.flags);
  eq('字数の数え方（鉤括弧を除く）', r.len, 3);
  eq('中身の字数（三点リーダも除く）', r.contentLen, 1);
  ok('証拠に「ひなたの喉の奥から」が入る', r.evidence.after.indexOf('ひなたの喉の奥から') >= 0, r.evidence);
  ok('証拠の位置が本文中を指す', r.evidence.at > 0, r.evidence.at);

  // 正しく帰属できているカードは候補に挙がらない
  const good = api.classifyCard(turn, { who: 'ひなた', say: '「大丈夫だよ」' }, 1, { hero: '白石澪' });
  eq('正しいカードは印ゼロ', good.flags.length, 0);
}

console.log('\n--- 4b. ★fix607: 証拠の在り処（実セーブの形） ---');
{
  /* 2026-07-28、fix606 を出した直後に実セーブ(165ターン560カード)へ通したら
     **say-tag が0件**で、全部 harvest / unmatched に倒れた。
     原因は分類器ではなく「読む場所」だった:
       turn.narrative      … 画面用。タグは剥がされている（実測 165/165 でタグ0）
       turn.plan.narrative … モデルの構造化出力。<say who="…"> が生きている（実測 142/165・372タグ）
     ★この節が固定するのは「plan を先に見る」という契約そのもの。 */
  const { api } = load();
  const H = { hero: '白石澪' };
  const real = {
    narrative: '「おはよう」\nひなたが笑う。',
    plan: { narrative: '<say who="ひなた">「おはよう」</say>\nひなたが笑う。' },
    inputType: 'do', playerText: ''
  };
  eq('★plan.narrative のタグを証拠として読む',
    api.classifyCard(real, { who: 'ひなた', say: '「おはよう」' }, 1, H).source, 'say-tag');
  eq('★どちらの欄から読んだかを返す',
    api.classifyCard(real, { who: 'ひなた', say: '「おはよう」' }, 1, H).evidenceField, 'plan');

  const legacy = { narrative: '<say who="ひなた">「おはよう」</say>', inputType: 'do' };
  eq('plan が無ければ従来どおり narrative を見る',
    api.classifyCard(legacy, { who: 'ひなた', say: '「おはよう」' }, 1, H).evidenceField, 'narrative');

  const notag = { narrative: '「おはよう」と、ひなたが言う。', plan: { narrative: '「おはよう」と、ひなたが言う。' }, inputType: 'do' };
  eq('どちらにもタグが無ければ plan-notag',
    api.classifyCard(notag, { who: 'ひなた', say: '「おはよう」' }, 1, H).evidenceField, 'plan-notag');
  eq('タグが無ければ harvest のまま',
    api.classifyCard(notag, { who: 'ひなた', say: '「おはよう」' }, 1, H).source, 'harvest');

  /* ★fix608: plan.narrative は**段落の配列**だった（実測 165/165 ターン）。
     fix607 は typeof==='string' で弾き、実データで証拠を1件も読めていなかった。
     evidenceField を先に足しておいたので `narrative-notag:165` として即座に見えた。 */
  const realArr = {
    narrative: '「おはよう」\nひなたが笑う。',
    plan: { narrative: ['<say who="ひなた">「おはよう」</say>', 'ひなたが笑う。'] },
    inputType: 'do', playerText: ''
  };
  eq('★plan.narrative が配列でも読む', api.evidenceSource(realArr).field, 'plan');
  eq('★配列でも say-tag と判定できる',
    api.classifyCard(realArr, { who: 'ひなた', say: '「おはよう」' }, 1, H).source, 'say-tag');
  eq('textOf: 文字列はそのまま', api.textOf('abc'), 'abc');
  eq('textOf: 文字列配列は改行で連結', api.textOf(['a', 'b']), 'a\nb');
  eq('textOf: {text} の配列も受ける', api.textOf([{ text: 'a' }, { text: 'b' }]), 'a\nb');
  eq('textOf: 想定外の型は空文字', api.textOf({ x: 1 }), '');
  eq('textOf: null は空文字', api.textOf(null), '');

  eq('evidenceSource は plan を優先する', api.evidenceSource(real).field, 'plan');
  eq('evidenceSource(null) でも落ちない', api.evidenceSource(null).field, 'narrative-notag');

  /* ★実データの形（who は必ずダブルクォート・372/372）を1件通しておく＝生存証明 */
  const a = api.analyze([Object.assign({ _convSays: [{ who: 'ひなた', say: '「おはよう」' }] }, real)], '白石澪');
  eq('analyze も plan から読む', a.bySource['say-tag'], 1);
  eq('analyze が evidenceField を数える', a.evidenceField['plan'], 1);
}

console.log('\n--- 4c. ★fix609: 実データで見つけた「数えすぎ」2件 ---');
{
  /* 実セーブの unmatched 50件を読んだ結果:
       31件 … 句読点・三点リーダの表記が違うだけで**本文に在った**（句読点の校正でずれる）
       14件 … **プレイヤー自身が入力した発話**。`inputType` が実データでは大文字の 'SAY' で、
              小文字だけを見ていたため hero-utterance が1件も立っていなかった
     ＝どちらも私の数えすぎ。**残り5件だけが本当に本文に無い**。 */
  const { api } = load();
  const H = { hero: '白石澪' };

  // (1) inputType は大文字の 'SAY'
  const upper = { narrative: '「行こう」', plan: { narrative: ['<say who="白石澪">「行こう」</say>'] },
                  inputType: 'SAY', playerText: '行こう' };
  eq('★inputType が大文字 SAY でも hero-utterance',
    api.classifyCard(upper, { who: '白石澪', say: '「行こう」' }, 0, H).source, 'hero-utterance');
  eq('小文字 say でも従来どおり',
    api.classifyCard(Object.assign({}, upper, { inputType: 'say' }), { who: '白石澪', say: '「行こう」' }, 0, H).source, 'hero-utterance');
  eq('★句読点だけ違うプレイヤー発話も拾う',
    api.classifyCard(Object.assign({}, upper, { playerText: '行こう。' }), { who: '白石澪', say: '「行こう」' }, 0, H).source, 'hero-utterance');

  // (2) 句読点だけ違うカードは unmatched にしない
  const punct = { narrative: '「……もう、行こう」', inputType: 'do',
                  plan: { narrative: ['<say who="ひなた">「……もう、行こう」</say>'] } };
  const pr = api.classifyCard(punct, { who: 'ひなた', say: '「…もう行こう」' }, 1, H);
  eq('★句読点差のカードは say-tag として拾う', pr.source, 'say-tag');
  ok('★緩い照合を使ったことを印で残す', pr.flags.indexOf('punct-normalized') >= 0, pr.flags);

  const punct2 = { narrative: '「……もう、行こう」と誰かが言った。', inputType: 'do',
                   plan: { narrative: ['「……もう、行こう」と誰かが言った。'] } };
  eq('★タグ無しでも句読点差なら unmatched にしない',
    api.classifyCard(punct2, { who: 'ひなた', say: '「…もう行こう」' }, 1, H).source, 'harvest');

  // (3) ★緩めすぎていないこと（canary）— 本当に無いものは今でも unmatched
  eq('本当に本文に無いカードは unmatched のまま',
    api.classifyCard({ narrative: '風が吹いた。', plan: { narrative: ['風が吹いた。'] }, inputType: 'do' },
      { who: 'レナ', say: '「弟の遺体は、結局上がらなかったんです」' }, 1, H).source, 'unmatched');
  eq('別人の台詞を取り違えない（部分一致で通さない）',
    api.classifyCard({ narrative: '「行こうか」', plan: { narrative: ['「行こうか」'] }, inputType: 'do' },
      { who: 'レナ', say: '「行けない」' }, 1, H).source, 'unmatched');

  eq('loose(): 記号を落とす', api.loose('「……もう、行こう」'), 'もう行こう');
  eq('looseHas(): 記号違いを見つける', api.looseHas('「……もう、行こう」', '「…もう行こう」'), true);
  eq('looseHas(): 無いものは見つけない', api.looseHas('風が吹いた。', '「行こう」'), false);
}

console.log('\n--- 5. analyze(): 分母と内訳 ---');
{
  const { api } = load();
  const turns = [
    { narrative: '<say who="ひなた">「おはよう」</say>', inputType: 'do', _convSays: [{ who: 'ひなた', say: '「おはよう」' }] },
    { narrative: '<say who="ひなた">「大丈夫だよ」</say>\n「……ぇ」\nひなたの喉の奥から、声が漏れる。', inputType: 'do',
      _convSays: [{ who: 'ひなた', say: '「大丈夫だよ」' }, { who: '白石澪', say: '「……ぇ」' }] },
    { narrative: '風が吹いた。', inputType: 'do', _convSays: [{ who: 'レナ', say: '「誰かいる」' }] },
    { narrative: 'ただの地の文。', inputType: 'do' }   // _convSays 無し＝数えない
  ];
  const a = api.analyze(turns, '白石澪');
  eq('カード総数（分母）', a.total, 4);
  eq('_convSays を持つターン数', a.turns, 3);
  eq('say-tag の件数', a.bySource['say-tag'], 2);
  eq('bare-inferred の件数', a.bySource['bare-inferred'], 1);
  eq('unmatched の件数', a.bySource['unmatched'], 1);
  eq('hero-default の件数', a.byFlag['hero-default'], 1);
  eq('二次判定候補の件数', a.items.length, 1);
  eq('候補の位置（ターン1・カード1）', [a.items[0].turn, a.items[0].card], [1, 1]);

  eq('turns が配列でなければ空の結果', api.analyze(null, 'X').total, 0);
}

console.log('\n--- 6. ★副作用が無いこと ---');
{
  const turns = [
    { narrative: '<say who="杏子">「行くよ」</say>', inputType: 'do', _convSays: [{ who: '氷川 杏子', say: '「行くよ」' }] },
    { narrative: '風が吹いた。', inputType: 'do', _convSays: [{ who: 'レナ', say: '「誰かいる」', _rv: 1 }] }
  ];
  const before = JSON.stringify(turns);
  const state = { turns: turns, cast: { hero: { name: '白石澪' }, npcs: [{ name: '氷川 杏子' }] } };
  const { api, ls } = load({}, state);

  api.analyze(turns, '白石澪');
  api.stats();
  api.review(50);
  api.sweep();

  eq('★turn / card を1文字も変更しない', JSON.stringify(turns), before);
  eq('★localStorage へ1バイトも書かない', Object.keys(ls.__store).length, 0);
}

console.log('\n--- 7. stats() の契約 ---');
{
  const turns = [{ narrative: '<say who="ひなた">「おはよう」</say>', inputType: 'do', _convSays: [{ who: 'ひなた', say: '「おはよう」' }] }];
  const { api } = load({}, { turns: turns, cast: { hero: { name: '白石澪' } } });
  const s = api.stats();
  eq('selfTestPassed を必ず返す', s.selfTestPassed, true);
  eq('分母 total を必ず返す', s.total, 1);
  eq('分類の生存数を返す', s.classesSeen, 7);
  ok('bySource を返す', !!s.bySource && s.bySource['say-tag'] === 1, s.bySource);
  eq('needsReview を返す', s.needsReview, 0);
  ok('revisionsObserved を返す', typeof s.revisionsObserved === 'number', s.revisionsObserved);
}

console.log('\n--- 8. OFF スイッチ ---');
{
  const turns = [{ narrative: '<say who="ひなた">「おはよう」</say>', inputType: 'do', _convSays: [{ who: 'ひなた', say: '「おはよう」' }] }];
  const { api } = load({ v292Dfix606Off: '1' }, { turns: turns, cast: { hero: { name: '白石澪' } } });
  eq('stats が disabled を返す', api.stats().disabled, true);
  eq('review が disabled を返す', api.review(5).disabled, true);
  eq('sweep が何もしない', api.sweep(), 0);
  // 分類そのもの（pure function）は OFF でも呼べる＝テストと診断のため
  eq('classifyCard は OFF でも純関数として動く',
    api.classifyCard({ narrative: '<say who="A">「x」</say>' }, { who: 'A', say: '「x」' }, 1, { hero: 'H' }).source, 'say-tag');
}

console.log('\n--- 9. sweep(): 確定後に who が動いたら記録する（メモリのみ） ---');
{
  const turns = [{ narrative: '<say who="ひなた">「おはよう」</say>', inputType: 'do', _convSays: [{ who: '白石澪', say: '「おはよう」' }] }];
  const state = { turns: turns, cast: { hero: { name: '白石澪' } } };
  const { api, ls } = load({}, state);
  api.sweep();                                   // 初回＝基準を取るだけ
  eq('初回 sweep では変更ゼロ', api.revisions().length, 0);
  turns[0]._convSays[0].who = 'ひなた';           // 後追い補正器が動いた想定
  eq('2回目の sweep が1件検出', api.sweep(), 1);
  const rv = api.revisions();
  eq('記録の中身', [rv[0].from, rv[0].to, rv[0].turn, rv[0].card], ['白石澪', 'ひなた', 0, 0]);
  eq('同じ状態でもう一度呼んでも増えない（冪等）', api.sweep(), 0);
  eq('★記録は localStorage へ書かない', Object.keys(ls.__store).length, 0);
}

console.log('\n--- 10. 壊れた入力で例外を投げない ---');
{
  const { api } = load();
  const bad = [null, undefined, {}, { narrative: null }, { narrative: 123 }];
  let threw = null;
  for (const t of bad) {
    for (const card of [null, undefined, {}, { who: null, say: null }]) {
      try { api.classifyCard(t, card, 0, {}); } catch (e) { threw = String(e.message); }
    }
  }
  eq('壊れた入力でも例外を投げない', threw, null);
  eq('listSayTags(null) は空配列', api.listSayTags(null).length, 0);
  eq('未定義の turns でも analyze は落ちない', api.analyze(undefined, '').total, 0);
}

console.log('\npass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
