/* 回帰テスト: v292Dfix611 — 話者変更の中央ゲート（影モード）
 *
 * ■このテストが固定する「約束」
 *   ①**副作用ゼロ**（who も DOM も localStorage も触らない。判定だけ）
 *   ②同一人物の名寄せ・役割語解決は**通す**（従来の正しい仕事を止めない）
 *   ③別人物への付け替え（cross-cast）は**直接証拠があるときだけ通す**
 *   ④実データで捕獲した誤りの文型（行動・反応・知覚・受動・曖昧発声）は**通さない**
 *   ⑤主人公が自分で入力した発話は動かさない
 *   ⑥短縮名の扱いは identityRelation と同じ規律（2文字以上・キャスト中で一意）
 *   ⑦OFF スイッチ
 *
 * ■このプロジェクトの罠への備え
 *   ★「異常0件」を信じない → selfTest() が肯定例・否定例を毎回通す（生存証明）。
 *   ★両辺 null で偽の合格が出ないよう、期待値は具体値で書く。
 *   ★モック localStorage は setItem したキーが Object.keys にも見えること。
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const eq = (n, got, want) => ok(n + ' = ' + JSON.stringify(want), JSON.stringify(got) === JSON.stringify(want), got);

const SRC = fs.readFileSync(path.join(__dirname, 'v292Dfix611-speaker-gate.js'), 'utf8');
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
function load(lsInit, withProvenance) {
  const ls = mkLS(lsInit), W = {};
  const ctx = { window: W, localStorage: ls, console: { log() {}, warn() {}, error() {} },
    JSON, Math, Object, Array, String, Number, RegExp, Date,
    setInterval: () => 1, setTimeout: () => 1 };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  if (withProvenance) vm.runInContext(PROV, ctx, { filename: 'v292Dfix606-speaker-provenance.js' });
  vm.runInContext(SRC, ctx, { filename: 'v292Dfix611-speaker-gate.js' });
  return { api: W.__v292Dfix611, prov: W.__v292Dfix606, ls, W };
}

const CAST = ['霧 涼太', '真鍋 ひかり', '藤堂 志乃', '戸波源蔵', 'ノア', 'カエデ', 'ひなた', '火村レイナ', '大浦 源蔵', '白石澪'];
const C = (text, extra) => Object.assign({ cast: CAST, evidenceText: text, tagMappingHighConfidence: true, uniqueCandidateCount: 1 }, extra || {});
const P = (from, to, extra) => Object.assign({ from, to, sourceKind: 'say-tag' }, extra || {});

console.log('--- 1. 起動と生存証明 ---');
{
  const { api, ls } = load();
  ok('window.__v292Dfix611 が生える', !!api && typeof api.decide === 'function');
  const st = api.selfTest();
  ok('★selfTest が合格する', st.ok === true, st.detail.filter(d => !d.ok));
  ok('判定理由が2種類以上立つ（allow と deny の両方が生きている）', st.reasonsSeen >= 2, st.reasonsSeen);
  eq('★localStorage へ1バイトも書かない', Object.keys(ls.__store).length, 0);
}

console.log('\n--- 2. ★実データで捕獲した誤りは通さない ---');
{
  const { api } = load();
  const cases = [
    ['封筒の口を開けた', '真鍋 ひかり', '真鍋は封筒の口を開けた。中から出てきたのは、一枚の処方箋の控えだった。'],
    ['半身を向けた', '藤堂 志乃', '志乃はゆっくりと、半身だけこちらに向けた。'],
    ['喉が動いた／答えない', '藤堂 志乃', '志乃の喉が、こくりと動いた。彼女は答えない。'],
    ['階段を上がり続けた', '霧 涼太', '涼太は、一段一段、上がり続けた。灯の光が、'],
    ['鼻を鳴らした', '戸波源蔵', '源蔵は小さく鼻を鳴らした。シャッターの鍵が鳴る。'],
    ['腰に手を当てた', 'ノア', 'ノアは腰に手を当てたまま、警戒するように首を巡らせた。']
  ];
  for (const [label, to, text] of cases) {
    const from = (to === '霧 涼太') ? '大浦 源蔵' : '霧 涼太';
    const d = api.decide(P(from, to), C(text));
    eq('★' + label + ' → 通さない', d.act, 'deny');
    eq('  理由', d.reason, 'tag-cross-cast-needs-hard-evidence');
  }
}

console.log('\n--- 3. 直接証拠があれば通す ---');
{
  const { api } = load();
  const yes = [
    ['引用のあと（と＋が）', '「行こう」と真鍋が言った。'],
    ['引用のあと（助詞なし）', '「行こう」真鍋は囁いた。'],
    ['引用のまえ', '真鍋が「行こう」と叫んだ。'],
    ['声の導入形', '真鍋の声がした。'],
    ['声で言う', '真鍋の声で続けた。']
  ];
  for (const [label, text] of yes) {
    const d = api.decide(P('霧 涼太', '真鍋 ひかり'), C(text));
    eq(label + ' → 通す', d.act, 'allow');
    eq('  理由', d.reason, 'hard-attribution-evidence');
  }
  eq('声の出所（fix604の型）も通す',
    api.decide(P('白石澪', 'ひなた'), C('ひなたの喉の奥から、引きつったような声が漏れる。')).act, 'allow');
}

console.log('\n--- 4. 通してはいけない紛らわしい形 ---');
{
  const { api } = load();
  eq('受動（頼まれた）は通さない',
    api.decide(P('霧 涼太', '真鍋 ひかり'), C('「何か言って」と真鍋が頼まれた。')).act, 'deny');
  eq('知覚（声を聞いた）は通さない',
    api.decide(P('霧 涼太', '真鍋 ひかり'), C('真鍋は声を聞いた。')).act, 'deny');
  eq('★「口を開いた」は通さない（慣用句だが cross-cast の直接証拠にしない）',
    api.decide(P('霧 涼太', '真鍋 ひかり'), C('真鍋は口を開いた。')).act, 'deny');
  eq('否定された声の出所は通さない',
    api.decide(P('白石澪', 'ひなた'), C('ひなたの喉の奥から声が漏れることはなかった。')).act, 'deny');
  eq('名前がまったく無ければ通さない',
    api.decide(P('霧 涼太', '真鍋 ひかり'), C('風が吹いた。')).act, 'deny');
  eq('候補が一意でなければ通さない',
    api.decide(P('霧 涼太', '真鍋 ひかり'), C('「行こう」と真鍋が言った。', { uniqueCandidateCount: 2 })).act, 'deny');
  /* ★向きに注意。対応が確実でないときは**タグを守らない**（＝従来どおり補正器に任せる）。
     deny は「who をタグ側へ固定する」意味なので、ここで deny にすると
     **分類器の誤対応まで保護してしまう**（GPT指摘）。 */
  const amb = api.decide(P('霧 涼太', '真鍋 ひかり'), C('真鍋は封筒の口を開けた。', { tagMappingHighConfidence: false }));
  eq('タグの対応が確実でなければタグを守らない', amb.act, 'allow');
  eq('  理由を残す', amb.reason, 'tag-provenance-ambiguous');
  eq('対応が確実なら同じ文でも守る',
    api.decide(P('霧 涼太', '真鍋 ひかり'), C('真鍋は封筒の口を開けた。', { tagMappingHighConfidence: true })).act, 'deny');
}

console.log('\n--- 5. 同一人物の名寄せ・役割語は通す ---');
{
  const { api } = load();
  const cast2 = ['氷川 杏子', '白石澪'];
  eq('杏子 → 氷川 杏子（名寄せ）',
    api.decide(P('杏子', '氷川 杏子'), { cast: cast2, evidenceText: '', tagMappingHighConfidence: true }).reason,
    'canonical-name-resolution');
  eq('少女 → 氷川 杏子（役割語＝ラベル解決）',
    api.decide(P('少女', '氷川 杏子'), { cast: cast2, evidenceText: '', tagMappingHighConfidence: true }).reason,
    'label-resolution');
  eq('怪異 → ノア（役割語＝ラベル解決）',
    api.decide(P('怪異', 'ノア'), { cast: CAST, evidenceText: '', tagMappingHighConfidence: true }).reason,
    'label-resolution');
  /* ★fix613: ラベル自身が話者だと地の文が言っているなら通さない（実データ「後ろの男Aが…言う」） */
  eq('★男A→霧 涼太 は、地の文が「男Aが言う」なら通さない',
    api.decide(P('男A', '霧 涼太'), C('後ろの男Aが、声をひそめて言う。')).reason, 'label-is-speaker');
  eq('  その手がかりが無ければ通す',
    api.decide(P('男A', '霧 涼太'), C('風が吹いた。')).reason, 'label-resolution');
  eq('同じ名前なら no-change',
    api.decide(P('ノア', 'ノア'), C('')).reason, 'no-change');
}

console.log('\n--- 6. identityRelation の規律 ---');
{
  const { api } = load();
  eq('完全一致', api.identityRelation('ノア', 'ノア', CAST), 'exact');
  eq('包含かつ一意 → 同一人物', api.identityRelation('真鍋', '真鍋 ひかり', CAST), 'same-entity');
  /* ★GPTの否定例「涼→霧 涼太」。**登録キャストに『涼』が居るなら**別人物として扱う。
     居ないなら、そもそも同一性の根拠が弱い名前なので登録キャストへ寄せる（名寄せ）。 */
  eq('★登録キャストに「涼」が居るなら別人物', api.identityRelation('涼', '霧 涼太', CAST.concat(['涼'])), 'cross-cast');
  ok('  → 直接証拠が無ければ通らない',
    api.decide(P('涼', '霧 涼太'), Object.assign(C('涼太は、一段一段、上がり続けた。'), { cast: CAST.concat(['涼']) })).act === 'deny');
  eq('登録キャストに居なければラベル解決', api.identityRelation('涼', '霧 涼太', CAST), 'label-resolution');
  /* ★逆向き（登録キャスト → 未登録ラベル）は劣化。通さない。実データ: カエデ→少女 */
  eq('★カエデ→少女 は劣化なので別人物扱い', api.identityRelation('カエデ', '少女', CAST), 'cross-cast');
  eq('★未登録の仮ラベル（男A）→ 登録キャスト はラベル解決', api.identityRelation('男A', '霧 涼太', CAST), 'label-resolution');
  eq('別々の登録キャスト', api.identityRelation('ノア', 'カエデ', CAST), 'cross-cast');
  /* ★同じ断片を含むキャストが複数いるときは同一人物と断定しない */
  const dup = ['佐藤 花', '佐藤 実'];
  eq('★断片が複数に当たるなら cross-cast', api.identityRelation('佐藤', '佐藤 花', dup), 'cross-cast');
  eq('空文字は unknown', api.identityRelation('', 'ノア', CAST), 'unknown');
}

console.log('\n--- 7. 短縮名トークンの規律 ---');
{
  const { api } = load();
  eq('フルネームと姓を返す', api.tokensFor('真鍋 ひかり', CAST), ['真鍋ひかり', '真鍋', 'ひかり']);
  eq('1文字の断片は返さない', api.tokensFor('霧 涼太', CAST).indexOf('霧') < 0, true);
  eq('★複数キャストに当たる断片は返さない',
    api.tokensFor('佐藤 花', ['佐藤 花', '佐藤 実']), ['佐藤花']);
  eq('空名は空配列', api.tokensFor('', CAST), []);
}

console.log('\n--- 8. 主人公の発話は動かさない ---');
{
  const { api } = load();
  eq('hero-utterance はロック',
    api.decide(P('白石澪', 'ひなた', { sourceKind: 'hero-utterance' }), C('「行こう」とひなたが言った。')).reason,
    'hero-utterance-locked');
}

console.log('\n--- 9. タグ由来でないカードは従来どおり ---');
{
  const { api } = load();
  eq('bare-inferred はこの段では触らない',
    api.decide(P('霧 涼太', '真鍋 ひかり', { sourceKind: 'bare-inferred' }), C('真鍋は封筒の口を開けた。')).reason,
    'legacy-inference');
  eq('harvest も触らない',
    api.decide(P('霧 涼太', '真鍋 ひかり', { sourceKind: 'harvest' }), C('真鍋は封筒の口を開けた。')).reason,
    'legacy-inference');
}

console.log('\n--- 10. OFF スイッチと壊れた入力 ---');
{
  const { api } = load({ v292Dfix611SpeakerGateOff: '1' }, true);
  eq('shadowRun が disabled を返す', api.shadowRun([], []).disabled, true);
  const { api: a2 } = load();
  eq('decide は OFF でも純関数として動く（テストと診断のため）',
    a2.decide(P('ノア', 'カエデ'), C('カエデは頷いた。')).act, 'deny');
  let threw = null;
  for (const p of [null, undefined, {}, { from: null, to: null }]) {
    for (const c of [null, undefined, {}, { cast: null }]) {
      try { a2.decide(p, c); } catch (e) { threw = String(e.message); }
    }
  }
  eq('壊れた入力でも例外を投げない', threw, null);
  eq('evidenceFor(null) は null', a2.evidenceFor(null, null, null), null);
}

console.log('\n--- 11. shadowRun（★適用しないこと・副作用が無いこと） ---');
{
  const { api, ls } = load({}, true);
  const turns = [
    { // 誤反転: モデルは霧 涼太、最終は真鍋 ひかり。直後は行動文
      inputType: 'DO',
      narrative: '「……何か、言ってなかったか」\n真鍋は封筒の口を開けた。',
      plan: { narrative: ['<say who="霧 涼太">「……何か、言ってなかったか」</say>', '真鍋は封筒の口を開けた。'] },
      _convSays: [{ who: '真鍋 ひかり', say: '「……何か、言ってなかったか」' }]
    },
    { // 正当な名寄せ
      inputType: 'DO',
      narrative: '「行くよ」',
      plan: { narrative: ['<say who="真鍋">「行くよ」</say>'] },
      _convSays: [{ who: '真鍋 ひかり', say: '「行くよ」' }]
    },
    { // 直接証拠あり → 通す
      inputType: 'DO',
      narrative: '「行こう」と真鍋が言った。',
      plan: { narrative: ['<say who="霧 涼太">「行こう」</say>', '「行こう」と真鍋が言った。'] },
      _convSays: [{ who: '真鍋 ひかり', say: '「行こう」' }]
    }
  ];
  const before = JSON.stringify(turns);
  const r = api.shadowRun(turns, CAST);
  eq('★selfTest 結果を必ず返す', r.selfTestPassed, true);
  eq('カード総数（分母）', r.cards, 3);
  eq('別人物への付け替えの提案数', r.tagCrossCastProposals, 2);
  eq('★誤反転は通さない', r.tagCrossCastDeniedNoHardEvidence, 1);
  eq('直接証拠があるものは通す', r.tagCrossCastAllowed, 1);
  eq('名寄せは別に数える', r.sameEntityRenamesAllowed, 1);
  eq('★turn / card を1文字も変更しない', JSON.stringify(turns), before);
  eq('★localStorage へ1バイトも書かない', Object.keys(ls.__store).length, 0);
  ok('明細に legacyFinalWho と newDecision が入る',
    r.items.length === 2 && r.items[0].legacyFinalWho === '真鍋 ひかり' && !!r.items[0].newDecision, r.items[0]);
  eq('fix606 が無ければ正直に error を返す', load({}, false).api.shadowRun([], []).error, 'fix606-missing');
}

console.log('\n--- 12. ★fix619 reconciler（GPT指定の12条件・影モード） ---');
{
  const { api, ls } = load({}, true);
  const CAST2 = ['霧 涼太', '真鍋 ひかり', '藤堂 志乃'];
  const mk = (who, say, tagWho, narr) => ({
    inputType: 'DO', narrative: say,
    plan: { narrative: ['<say who="' + tagWho + '">' + say + '</say>'].concat(narr ? [narr] : []) },
    _convSays: [{ who: who, say: say }]
  });

  /* ★本命: タグは霧 涼太、最終は真鍋 ひかり、直後は行動文 → タグへ戻す提案 */
  const t1 = mk('真鍋 ひかり', '「……何か、言ってなかったか」', '霧 涼太', '真鍋は封筒の口を開けた。');
  const r1 = api.reconcileTurn(t1, CAST2, '霧 涼太');
  eq('★タグへ戻す提案が1件', r1.proposals.length, 1);
  eq('  from → to', [r1.proposals[0].from, r1.proposals[0].to], ['真鍋 ひかり', '霧 涼太']);
  eq('★★適用しない（who は変わらない）', t1._convSays[0].who, '真鍋 ひかり');
  eq('★localStorage へ書かない', Object.keys(ls.__store).length, 0);

  /* apply:true を明示したときだけ書く。★本文は触らない */
  const t1b = mk('真鍋 ひかり', '「……何か、言ってなかったか」', '霧 涼太', '真鍋は封筒の口を開けた。');
  const sayBefore = t1b._convSays[0].say;
  api.reconcileTurn(t1b, CAST2, '霧 涼太', { apply: true });
  eq('apply:true なら who を直す', t1b._convSays[0].who, '霧 涼太');
  eq('★カード本文は変えない', t1b._convSays[0].say, sayBefore);

  /* ⑩ いまの who を支持する直接証拠があれば触らない */
  const t2 = mk('真鍋 ひかり', '「行こう」', '霧 涼太', '「行こう」と真鍋が言った。');
  eq('★最終whoに直接証拠があれば戻さない', api.reconcileTurn(t2, CAST2, '霧 涼太').proposals.length, 0);
  ok('  理由を数える', api.reconcileTurn(t2, CAST2, '霧 涼太').denied['final-who-has-hard-evidence'] === 1);

  /* ⑪ 第三者に直接証拠があれば触らない */
  const t3 = mk('真鍋 ひかり', '「行こう」', '霧 涼太', '「行こう」と志乃が言った。');
  eq('★第三者に直接証拠があれば戻さない', api.reconcileTurn(t3, CAST2, '霧 涼太').proposals.length, 0);

  /* ⑥ タグが未登録ラベルなら戻さない */
  const t4 = mk('真鍋 ひかり', '「行こう」', '少女', '真鍋は封筒の口を開けた。');
  eq('★タグが未登録ラベルなら戻さない', api.reconcileTurn(t4, CAST2, '霧 涼太').proposals.length, 0);
  ok('  理由', !!api.reconcileTurn(t4, CAST2, '霧 涼太').denied['tag-who-unresolvable']
      || !!api.reconcileTurn(t4, CAST2, '霧 涼太').denied['tag-who-label-only'],
      api.reconcileTurn(t4, CAST2, '霧 涼太').denied);

  /* ⑨ 名寄せ（同一人物）は対象外 */
  const t5 = mk('真鍋 ひかり', '「行こう」', '真鍋', '真鍋は封筒の口を開けた。');
  eq('★名寄せは対象外', api.reconcileTurn(t5, CAST2, '霧 涼太').proposals.length, 0);

  /* ④ 同じ発話のカードが2枚あれば触らない */
  const t6 = mk('真鍋 ひかり', '「うん」', '霧 涼太', '真鍋は封筒の口を開けた。');
  t6._convSays.push({ who: '藤堂 志乃', say: '「うん」' });
  eq('★同じ発話のカードが複数なら戻さない', api.reconcileTurn(t6, CAST2, '霧 涼太').proposals.length, 0);

  /* resolveToCast: 一意に決まらなければ null */
  eq('短縮名を解決する', api.resolveToCast('真鍋', CAST2), '真鍋 ひかり');
  eq('★複数に当たるなら解決しない', api.resolveToCast('佐藤', ['佐藤 花', '佐藤 実']), null);
  eq('未登録は解決しない', api.resolveToCast('少女', CAST2), null);

  /* OFF */
  const { api: aOff } = load({ v292Dfix619ReconcilerOff: '1' }, true);
  eq('OFF なら何も提案しない', aOff.reconcileTurn(t1, CAST2, '霧 涼太').disabled, true);

  /* 壊れた入力 */
  let threw = null;
  for (const t of [null, undefined, {}, { _convSays: null }, { _convSays: [null] }]) {
    try { api.reconcileTurn(t, CAST2, 'X'); } catch (e) { threw = String(e.message); }
  }
  eq('壊れた入力でも例外を投げない', threw, null);
  eq('fix606 が無ければ提案しない', load({}, false).api.reconcileTurn(t1, CAST2, 'X').denied['no-prov'], 1);
}

console.log('\npass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
