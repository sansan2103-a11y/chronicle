'use strict';
/**
 * me1-semantics-2.0.0
 * lineage: RL-1（current candidate）
 *
 * 仕様入力（この 3 点のみ。新しい設計調査はしていない）:
 *   integrity/me1_semantic_class_schema_v1.json      semanticClass 12 種 / 5 軸 / identity gold contract
 *   integrity/me1_normative_reconciliation_v1.json   window / RUKI / HEAD-NORMALIZATION の CURRENT・SUPERSEDED
 *   integrity/me1_semantic_contract_recovery_v1.json E4 / A2 / idres の一般 rule family（READ ONLY 回収）
 *
 * 1.0.0 との関係:
 *   1.0.0 は SEMANTIC_FIDELITY_FAILED。bytes は変更していない。2.0.0 は新規導出である。
 *   1.0.0 の lexicon head matcher / eligibleThemes allowlist は廃止した。
 *
 * 固定した裁定（integrity/me1_normative_reconciliation_v1.json）:
 *   - active / proximity window は CURRENT barrier として維持
 *   - window 内は EXISTING の十分条件ではない
 *   - window 外は NEW の根拠ではない（abstain へ倒す）
 *   - registry 一意性は identity evidence ではない
 *   - window を外して EXISTING へ進むには独立 positive identity witness が必須
 *   - identity witness 単独で Event Promotion しない
 *   - RUKI 原案 REJECTED / HEAD-NORMALIZATION（idres-0.15.0）DEFERRED。先取りしない
 *   - metric-driven loosening 禁止
 *
 * 実装規律:
 *   - 決定的。Date / Math.random / 実行順序に依存しない。
 *   - fail-closed。判断できないものは昇格させない。
 *   - conf#7 固有の callId / span / 語 / antecedentTurn を 1 つも hardcode していない。
 *   - 規則はすべて class / 形態 / 構造のレベル。observed-token allowlist ではない。
 *   - 依存: Node 標準のみ（E7-03）。
 */

const crypto = require('crypto');

const COMPONENT = 'me1-semantics';
const VERSION = '2.0.0';
const SUPERSEDES = Object.freeze({ version: '1.0.0', reason: 'SEMANTIC_FIDELITY_FAILED（ME1-SEM-C1〜C4）', bytesPreserved: true });

// ============================================================ schema
const SEMANTIC_CLASS = Object.freeze([
  'trackable_physical_object',
  'person', 'body_part', 'place_or_environment', 'abstract',
  'natural_phenomenon_or_signal', 'physical_quantity', 'event_clause',
  'substance', 'part_of_object', 'formal_noun_reference', 'unknown',
]);
const CLASS_PARTITION = Object.freeze({
  item: Object.freeze(['trackable_physical_object']),
  nonItem: Object.freeze(['person', 'body_part', 'place_or_environment', 'abstract',
    'natural_phenomenon_or_signal', 'physical_quantity', 'event_clause']),
  unresolved: Object.freeze(['substance', 'part_of_object', 'formal_noun_reference', 'unknown']),
});
const EVENT_REALITY = Object.freeze(['real', 'figurative']);
const TRACKABILITY = Object.freeze(['trackable', 'non_trackable', 'uncertain']);
const SENSE = Object.freeze(['valid', 'invalid', 'uncertain']);
const RESOLUTION = Object.freeze({ EXISTING: 'existing', NEW: 'new', UNKNOWN: 'unknown' });

const STAGES = Object.freeze(['E4_EXTRACTION', 'A2_THEME', 'A2_SENSE', 'IDENTITY_RES', 'PROMOTION_GATE']);
const DISABLE_SEMANTICS = Object.freeze({
  E4_EXTRACTION: 'predicate anchoring を行わず theme span を 1 件も出さない。',
  A2_THEME: '全 mention を trackable_physical_object / trackable / ieFalse=false 扱いにする。',
  A2_SENSE: 'sense を常に valid にする。',
  IDENTITY_RES: '全 mention を new 扱いにする（gold contract 違反を意図的に起こす）。',
  PROMOTION_GATE: '棄権規則を適用せず全 mention を昇格させる。',
});

// ============================================================ 形態・構造の rule family（class レベル）
// 回収した historical contract の一般規則。特定 corpus 用の語彙ではない。
const HARD_BOUNDARY = ['。', '、', '「', '」', '『', '』', '（', '）', '\n', '…', '‥'];
const ARG_PARTICLE_ACC = ['を'];
const ARG_PARTICLE_NOM = ['が', 'は'];
const BOUNDARY_PARTICLES = ['から', 'まで', 'より', 'も', 'に', 'へ', 'で', 'と', 'の'];
const GENITIVE = 'の';

// 形式名詞・照応（class: formal_noun_reference）
const FORMAL_NOUN = ['それ', 'これ', 'あれ', 'そこ', 'ここ', 'あそこ', 'もの', 'こと', 'そいつ', 'こいつ', 'あいつ', 'やつ', 'どれ'];
// 指示連体詞（既出参照のマーカー）
const DEMONSTRATIVE_DET = ['その', 'あの', 'この', '件の'];
// 同一性マーカー（positive identity witness の候補）
const SAME_IDENTITY_MARKER = ['例の', 'さっきの', '先ほどの', 'くだんの', '同じ', '先の'];
// 新規導入マーカー（positive novelty evidence）
const NOVELTY_MARKER = ['新しい', '新品', '新たな', '新調', '別の', 'もう一つ', 'もう一本', 'もう一枚', 'もう一冊',
  '二つ目', '三つ目', '予備の', '替えの', '見知らぬ', 'よその'];
// 回収 contract の NOVELTY_INTRO_STEMS を precision-first で 2 分割した（normative priority 1 による締め付け。
// 緩和ではなく限定なので metric-driven loosening に当たらない）。
//   creation  : その turn で個体が生成される。定義上「それ以前に存在しない」＝初出の positive evidence。
//   acquisition: 場面へ搬入されただけ。既知個体の搬入と区別できないので novelty evidence にしない。
const NOVELTY_INTRO_STEM_CREATION = ['作っ', '作り', 'こしらえ', '拵え', '焼き上げ', '編み上げ', '仕立て',
  '削り出し', '鋳込ん', '生まれ', '産まれ', '出来上が'];
const NOVELTY_INTRO_STEM_ACQUISITION = ['持ち込', '運び込', '持ってき', '買っ', '購入', '拾っ', '授かっ', '取り出'];
// NEW の根拠として明示的に禁止するもの（監査で参照するため列挙して固定する）
const FORBIDDEN_NOVELTY_BASIS = Object.freeze([
  'REGISTRY_HAS_NO_SAME_HEAD_CANDIDATE',
  'OUT_OF_ACTIVE_WINDOW',
  'ABSENT_FROM_RECENT_CONTEXT',
  'FIRST_SEEN_IN_RUNNER_INPUT',
  'PHYSICAL_OPERATION_EVIDENCE',
  'REGISTRY_COMPLETENESS_ASSERTED',
  'NOVELTY_INTRO_STEM_ACQUISITION',
]);
// 比喩・hedge（eventReality=figurative / 個体化しない）
// 回収 contract の unrealized 文脈規則を port した。
//   「unrealized 文脈 + 先行 antecedent 無し → insufficient_evidence / unknown（resolved_new 禁止）」
// 2.0.0 初版はこの rule family を移植しておらず、未実現の予定を実現した event として昇格させていた。
// 判定は述語の後続節尾に現れる文法形式のみを見る。語彙 allowlist ではなく構文形式である。
const IRREALIS_MARKER = ['ことになっ', 'ことにな', 'ことにし', 'つもり', 'はず', 'だろう', 'でしょ',
  'かもしれ', 'まい', '予定', '手筈', '約束', 'つもりだ',
  // 手筈・予定の同義構文（回収 contract の unrealized 文脈と同一 family）
  '運びだ', '運びにな', 'ことになる', '段取り', '心づもり', '腹づもり'];
// 条件・仮定形式。実現していない事態を述べる（回収 contract の unrealized 文脈と同一趣旨）。
const CONDITIONAL_MARKER = ['たら', 'だら', 'れば', 'ければ', 'なら', 'ならば', 'とすれば', 'としたら'];
// 引用補文（間接話法）。「〜と言った / 〜と聞いた」の補文内の事態は、地の文の事実ではない。
// 括弧付き引用は E4 の quotation_construction が別途弾く。ここは括弧なしの引用補文を扱う。
// 発話・思考述語（引用補文の主動詞）。回収 contract の quotation_construction に対応する一般クラス。
const SPEECH_THOUGHT_STEM = ['言', '伝え', '聞', '話', '述べ', '答え', '思', '考え',
  '語', '告げ', '申', '訊', '尋ね', '返事', '知らせ', '触れ回'];
const QUOTATIVE_COMPLEMENT = ['と言', 'と伝', 'と聞', 'と話', 'と述べ', 'と答え', 'と思', 'と考え',
  'とのこと', 'という話', 'といわれ', 'と言われ'];
const NEGATION_MARKER = ['ない', 'なかっ', 'ません', 'ませんで', 'ず、', 'ずに', 'ぬ。'];
const SIMILE = ['ような', 'ように', 'ごとく', 'みたいに'];
const HEDGE = ['ようなもの', 'らしきもの', 'らしき', 'みたいなもの', 'ような感触'];

// class を決める形態クラス（head 末尾一致 / 接尾辞）
const CLASS_SUFFIX = Object.freeze([
  { cls: 'physical_quantity', suffix: ['数', '率', '度', '量', '値', '幅', '厚み', '重さ', '長さ'] },
  { cls: 'part_of_object', suffix: ['先', '端', '根元', '縁', '裏', '表面', '部分', '角', '面'] },
  { cls: 'person', suffix: ['さん', '様', '氏', '君', 'ちゃん', '殿', '翁', '先生', '親方', '番頭', '職人', '医者', '夫人', '婦人'] },
]);
const CLASS_HEAD = Object.freeze([
  { cls: 'body_part', heads: ['目', '手', '指', '足', '顔', '首', '肩', '腕', '頭', '口', '耳', '胸', '背', '腰', '膝', '掌', '爪', '髪', '唇', '肌', '腹'] },
  { cls: 'place_or_environment', heads: ['壁', '床', '天井', '部屋', '室', '場', '地面', '廊下', '階段', '石段', '路地', '空間', '庭', '広場', '通路', '敷地', '足元', '水面', '畳', '土間'] },
  { cls: 'natural_phenomenon_or_signal', heads: ['光', '音', '風', '熱', '煙', '影', '匂い', '香り', '気配', '響き', '声', '霧', '雨', '雷', '波', '湿気', '振動'] },
  { cls: 'abstract', heads: ['記憶', '約束', '沈黙', '感覚', '感情', '気持ち', '意識', '記録', '事実', '関係', '時間', '雰囲気', '話', '評判', '信用', '名誉', '立場', '意味', '価値', '責任', '期待', '信頼', '縁', '心', '気'] },
  { cls: 'person', heads: ['男', '女', '少年', '少女', '者', '人物', '主人公', '主人', '客', '娘', '息子', '父', '母', '兄', '弟', '姉', '妹', '妻', '夫', '彼', '彼女', '私', '僕', '俺', '自分'] },
  { cls: 'substance', heads: ['水', '茶', '砂', '泥', '灰', '湯', '血', '油', '塩', '粉', '埃', '屑', '繊維'] },
  { cls: 'part_of_object', heads: ['残骸', '破片', '欠片', '断片', '塊'] },
]);

// trackability の positive evidence（述語側の手掛かり。class レベル）
const EV_TRACK = Object.freeze({
  grip: ['握', '手に取', '掌', '指で挟', '指先', '手を伸ば', '持っ', '携え', '抱え'],
  transfer: ['渡し', '渡す', '受け取', '差し出', '手渡', '取り出'],
  placement: ['置い', '置か', '置く', '掛か', '掛け', '並べ', '載せ', '入れ', 'しまい', '包ん', '収め'],
  acquire: ['拾', '掬い上げ', '引き出', '剥が', '摘ま'],
  handle: ['裏返', '折り畳', '広げ', '押し込', '触れ', '提示', '使っ', '開い'],
  inscription: ['刻印', '彫っ', '書かれ', '印字', '文字', '数字', '記号', '紋様', '刻まれ'],
});
const CLASSIFIER = ['一つ', '二つ', '三つ', '一枚', '二枚', '一冊', '一本', '二本', '一個', '一片', '一振り'];
// 回収 contract の PLURALITY_STEMS / LEGACY_CARDINALITY_STEMS / ACTIVE_BARE_CARDINALITY_STEMS を port した。
// 2.0.0 初版は CLASSIFIER を trackability 証拠にしか使っておらず、identity の ambiguity barrier として
// 使っていなかった（ME1-SEM-I 裁定の「plurality/cardinality conflict 無し」条件が未実装だった）。
const PLURALITY_STEM = ['両方', '双方', '複数', '数個', '数本', '数枚', '幾つ', 'いくつ', 'それぞれ', '各'];
const CARDINALITY = Object.freeze(CLASSIFIER.concat(PLURALITY_STEM));
function cardinalityOf(mods) { return (mods || []).filter(m => CARDINALITY.indexOf(m) !== -1); }
function cardinalityConflict(aMods, bMods) {
  const A = cardinalityOf(aMods), B = cardinalityOf(bMods);
  if (!A.length || !B.length) return false;
  return !A.some(x => B.indexOf(x) !== -1);
}

// 述語クラス（A2-SENSE 用）
const PRED_CLASS_BASE = Object.freeze({
  physical_handling: ['置い', '置か', '置く', '拾', '掴', '握', '載せ', '担い', '抱え', '包ん', '差し出', '受け取', '手渡', '取り出', '広げ', '裏返'],
  physical_motion: ['落ち', '落と', '転が', '浮か', '沈み', '沈め', '飛ば', '投げ', '零れ', '滑り', '滑っ'],
  physical_destruction: ['割れ', '割っ', '壊れ', '壊し', '潰れ', '砕け', '折れ', '折っ', '裂け', '破れ', '欠け'],
  perception_signal: ['聞こえ', '見え', '匂っ', '響い', '光っ', '晴れ', '止ん', '吹い', '消え', '消し', '灯っ'],
  mental: ['思っ', '感じ', '覚え', '忘れ'],
  // 回収 contract の NOVELTY_INTRO_STEMS。E4 が anchor できなければ novelty evidence は到達不能になる。
  physical_introduction: NOVELTY_INTRO_STEM_CREATION.concat(NOVELTY_INTRO_STEM_ACQUISITION),
});
// ★ ME1-SEM-H: EV_TRACK には物理操作の動詞語幹が宣言されているのに、その多くが predicate anchor
// （PRED_CLASS）に入っていなかった。同じ module 内の 2 つの一覧が食い違っている内部不整合であり、
// 語彙の追加ではなく既存宣言の結線である。名詞的 evidence（掌 / 指先 / 文字 等）は anchor にしない。
const EV_TRACK_NOMINAL = ['掌', '指先', '刻印', '文字', '数字', '記号', '紋様'];
const HANDLING_ANCHORS = Object.freeze(Array.from(new Set(
  PRED_CLASS_BASE.physical_handling.concat(
    EV_TRACK.grip, EV_TRACK.transfer, EV_TRACK.placement, EV_TRACK.acquire, EV_TRACK.handle)
    .filter(x => EV_TRACK_NOMINAL.indexOf(x) === -1))));
const PRED_CLASS = Object.freeze(Object.assign({}, PRED_CLASS_BASE,
  { physical_handling: HANDLING_ANCHORS }));
// 多義縮約 predicate（機能結果か物理軌道かで sense が変わる）
const POLYSEMOUS = ['落と', '落ち', '下げ', '下ろ', '上げ', '切っ', '切る', '消し'];
const FUNCTIONAL_RESULT_CUE = ['暗くなっ', '消え', '静まっ', '止まっ', '途絶え', '沈黙', '動かなくなっ', '聞こえなくなっ', '見えなくなっ'];
const PHYSICAL_AFTERMATH_CUE = ['転が', '砕け', '割れ', '跳ね', '音を立て', '拾い上げ', '粉々', '破片'];

// class × predicate class の互換表（valid / invalid / uncertain）
const SENSE_TABLE = Object.freeze({
  trackable_physical_object: { physical_handling: 'valid', physical_introduction: 'valid', physical_motion: 'valid', physical_destruction: 'valid', perception_signal: 'uncertain', mental: 'invalid' },
  part_of_object: { physical_handling: 'uncertain', physical_introduction: 'uncertain', physical_motion: 'valid', physical_destruction: 'valid', perception_signal: 'uncertain', mental: 'invalid' },
  substance: { physical_handling: 'uncertain', physical_introduction: 'uncertain', physical_motion: 'valid', physical_destruction: 'uncertain', perception_signal: 'uncertain', mental: 'invalid' },
  body_part: { physical_handling: 'uncertain', physical_introduction: 'uncertain', physical_motion: 'uncertain', physical_destruction: 'uncertain', perception_signal: 'uncertain', mental: 'uncertain' },
  person: { physical_handling: 'invalid', physical_introduction: 'invalid', physical_motion: 'uncertain', physical_destruction: 'invalid', perception_signal: 'uncertain', mental: 'valid' },
  place_or_environment: { physical_handling: 'invalid', physical_introduction: 'invalid', physical_motion: 'uncertain', physical_destruction: 'uncertain', perception_signal: 'valid', mental: 'invalid' },
  natural_phenomenon_or_signal: { physical_handling: 'invalid', physical_introduction: 'invalid', physical_motion: 'uncertain', physical_destruction: 'invalid', perception_signal: 'valid', mental: 'invalid' },
  abstract: { physical_handling: 'invalid', physical_introduction: 'invalid', physical_motion: 'invalid', physical_destruction: 'invalid', perception_signal: 'uncertain', mental: 'valid' },
  physical_quantity: { physical_handling: 'invalid', physical_introduction: 'invalid', physical_motion: 'uncertain', physical_destruction: 'invalid', perception_signal: 'uncertain', mental: 'invalid' },
  event_clause: { physical_handling: 'invalid', physical_introduction: 'invalid', physical_motion: 'invalid', physical_destruction: 'invalid', perception_signal: 'uncertain', mental: 'uncertain' },
  formal_noun_reference: {},   // 全 uncertain（個体が確定していない）
  unknown: {},                 // 全 uncertain（class 不明を invalid にしない）
});

// identity 用: 安定属性 vs 可変状態
const STABLE_ATTR = ['真鍮', '鉄', '銅', '銀', '金', '錫', '木', '竹', '陶', '白磁', '漆', '革', '麻', '絹', '紙', '硝子', '琺瑯',
  '赤', '青', '藍', '朱', '白', '黒', '茶', '緑', '黄', '紫', '灰'];
const MUTABLE_STATE = ['濡れ', '乾い', '乾き', '煤け', '錆び', '汚れ', '欠け', '古び', '古い', '無傷', '傷ん', '擦り切れ', '曇っ', '焦げ'];

// window（CURRENT barrier。撤廃には positive witness が必須）
const WINDOW = Object.freeze({
  // 回収 contract（idres-0.14）には route ごとに別の window が 3 つある。
  // ME1-SEM-I-R2 裁定: これらを 1 本へ潰さず route-specific に使う。
  //   exact surface recurrence  -> exactSurfaceTurnWindow 40
  //   head-only candidate search -> headOnlyTurnWindow 10（head-only 単独は identity evidence ではない）
  //   bare / weak mention salience -> activeTurnWindow 1（照応束縛の salience 判定のみ）
  activeTurnWindow: 1,
  headOnlyTurnWindow: 10,
  exactSurfaceTurnWindow: 40,
  routeBinding: Object.freeze({
    EXACT_SURFACE_RECURRENCE: 'exactSurfaceTurnWindow',
    HEAD_ONLY_CANDIDATE_SEARCH: 'headOnlyTurnWindow',
    BARE_MENTION_SALIENCE: 'activeTurnWindow',
  }),
  semantics: 'window 内は EXISTING の十分条件ではない。window 外は NEW の根拠ではない（abstain へ倒す）。'
    + ' activeTurnWindow を全 identity route へ一律適用しない（ME1-SEM-I-R2）。',
  turnFields: Object.freeze({
    confirmedIdentityTurn: '同一個体と確定できた最後の turn。UNKNOWN の mention では進めない。identity window の基準。',
    surfaceMentionTurn: '同じ表層が観測された最後の turn。identity ではなく salience。照応束縛の判定にのみ使う。',
  }),
});

const sha256 = s => crypto.createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = v => typeof v === 'string' && v.length > 0;
const isIdx = v => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const off = (o, s) => !!(o && Array.isArray(o.disable) && o.disable.indexOf(s) !== -1);
const hasAny = (s, list) => list.some(x => s.indexOf(x) !== -1);
const endsAny = (s, list) => list.some(x => s.length > x.length && s.endsWith(x)) || list.some(x => s === x);

// ============================================================ E4: predicate anchored theme span
/**
 * 述語を検出し、その項（を格。lost/broken 系のみ が・は）となる名詞句 span を左方向へ取る。
 * head 文字列の探索ではない。述語が無ければ何も出さない。
 */
function findPredicates(text) {
  const out = [];
  const all = [];
  for (const cls of Object.keys(PRED_CLASS)) for (const stem of PRED_CLASS[cls]) all.push({ cls, stem });
  all.sort((a, b) => b.stem.length - a.stem.length);
  const taken = new Array(text.length).fill(false);
  for (let i = 0; i < text.length; i++) {
    if (taken[i]) continue;
    for (const p of all) {
      if (text.startsWith(p.stem, i)) {
        for (let k = i; k < i + p.stem.length; k++) taken[k] = true;
        out.push({ predicate: p.stem, predClass: p.cls, at: i });
        i += p.stem.length - 1;
        break;
      }
    }
  }
  return out;
}

/** 述語位置から左へ項助詞を探し、その左の名詞句 span を境界規則で切る。 */
function themeSpanFor(text, pred) {
  const left = text.slice(0, pred.at);
  const particles = ARG_PARTICLE_ACC.concat(
    ['physical_motion', 'physical_destruction'].indexOf(pred.predClass) !== -1 ? ARG_PARTICLE_NOM : []);
  let pIdx = -1, pTok = null;
  for (const t of particles) {
    const k = left.lastIndexOf(t);
    if (k > pIdx) { pIdx = k; pTok = t; }
  }
  if (pIdx < 0) return { ok: false, abstainReason: 'no_argument_particle' };
  // ME1-SEM-N: 項と述語の間の「読点」は同一節内の挿入であり、係り受けを切らない。
  // 回収 contract の原則「述語とその項の関係・助詞・連体修飾・副詞境界から span を決める」に従い、
  // 節境界（。「」『』改行 …）は越えず、読点だけを跨げるようにする。無制限には跨がない。
  const between = left.slice(pIdx + pTok.length);
  const CLAUSE_BOUNDARY = HARD_BOUNDARY.filter(b => b !== '、');
  if (hasAny(between, CLAUSE_BOUNDARY)) {
    return { ok: false, abstainReason: 'boundary_between_argument_and_predicate' };
  }
  if (between.indexOf('、') !== -1) {
    // 読点を跨ぐのは次を全部満たすときだけ。
    //  1. 間に別の述語が無い（別 predicate の項へ誤接続しない）
    //  2. 間に別の項助詞が無い（他の項が挟まっていない）
    //  3. 引用の quotative と の直後でない（引用補文側へ結合しない）
    const interveningPred = findPredicates(between).length > 0;
    if (interveningPred) return { ok: false, abstainReason: 'intervening_predicate_across_comma' };
    const otherArg = ARG_PARTICLE_ACC.concat(ARG_PARTICLE_NOM).some(t => between.indexOf(t) !== -1);
    if (otherArg) return { ok: false, abstainReason: 'intervening_argument_across_comma' };
    // 引用補文（「〜と言い、」等）を跨いで結合しない。副詞末尾の「と」（そっと 等）を誤検出しないよう
    // 引用の と は発話・思考述語と組でのみ判定する。
    if (QUOTATIVE_COMPLEMENT.some(m => between.indexOf(m) !== -1)) {
      return { ok: false, abstainReason: 'quotative_across_comma' };
    }
    // 読点が 2 つ以上ある挿入は節構造が曖昧なので取らない
    if ((between.match(/、/g) || []).length > 2) return { ok: false, abstainReason: 'ambiguous_clause_gap' };
  }

  // 引用句の内側は遡らない（fail-closed）
  const quoteOpen = Math.max(left.lastIndexOf('「'), left.lastIndexOf('『'));
  const quoteClose = Math.max(left.lastIndexOf('」'), left.lastIndexOf('』'));
  if (quoteOpen > quoteClose && quoteOpen < pIdx) return { ok: false, abstainReason: 'quotation_construction' };

  // 左境界: 句読点 / 別の境界助詞 / 別の項助詞
  // ME1-SEM-P: 回収 contract の ARGUMENT_MARKER_PARTICLE_TOKENS は
  // を/が/は/に/へ/で/と/も/から/まで/より の全部を項標識として挙げている。
  // 単モーラ助詞を境界から外していたため「両手で渡し簿」のような over-capture が出ていた。
  // 単モーラ助詞は語中一致（「もの」の「も」等）を避けるため、その位置から
  // FORMAL_NOUN / HEDGE が始まる場合は境界として採らない。
  let start = 0;
  const LEFT_BOUNDARY = HARD_BOUNDARY
    .concat(BOUNDARY_PARTICLES.filter(x => x !== GENITIVE))
    .concat(ARG_PARTICLE_ACC, ARG_PARTICLE_NOM);
  const insideWord = (k, b) => b.length === 1
    && FORMAL_NOUN.concat(HEDGE).some(w => w.length > 1 && w[0] === b && left.startsWith(w, k));
  for (const b of LEFT_BOUNDARY) {
    let k = left.lastIndexOf(b, pIdx - 1);
    while (k >= 0 && insideWord(k, b)) k = left.lastIndexOf(b, k - 1);
    if (k >= 0 && k + b.length > start && k + b.length <= pIdx) start = k + b.length;
  }
  let span = left.slice(start, pIdx);
  if (!span.length) return { ok: false, abstainReason: 'empty_theme_span' };

  // 連体修飾「Xの」は head 側へ寄せず、先頭の指示連体詞・同一性/新規性マーカーだけ残す
  // 比較選択詞「ほう / 方」: 「新しいほうの X」は既出個体のうちの一方を選ぶ表現であり、
  // 新規導入ではない。novelty marker の直後が比較選択詞なら marker として剥がさず、
  // 修飾語として span に残す（identity resolution へ回す）。一般的な構文規則である。
  const COMPARATIVE_SELECTOR = ['ほう', '方'];
  const preMods = [];
  let guard = 0;
  while (guard++ < 4) {
    const hit = DEMONSTRATIVE_DET.concat(SAME_IDENTITY_MARKER, NOVELTY_MARKER).find(d => span.startsWith(d));
    if (!hit) break;
    const rest = span.slice(hit.length);
    if (NOVELTY_MARKER.indexOf(hit) !== -1 && COMPARATIVE_SELECTOR.some(c => rest.startsWith(c))) break;
    preMods.push(hit); span = rest;
  }
  if (!span.length) return { ok: false, abstainReason: 'determiner_only' };
  // hedge / simile が span 内にあれば個体化しない
  const figurative = hasAny(span, HEDGE) || hasAny(left.slice(start), SIMILE);

  return {
    ok: true, spanStart: start, spanEnd: pIdx, surface: span,
    particle: pTok, preModifiers: preMods, figurative,
  };
}

/** 述語の直後から節末（HARD_BOUNDARY）までを取り、未実現・否定の文法形式があるかを見る。 */
function clauseTail(text, predicateAt) {
  let end = text.length;
  for (let i = predicateAt; i < text.length; i++) {
    if (!HARD_BOUNDARY.some(b => text.startsWith(b, i))) continue;
    // 読点の直後が引用補文（「、と言った」）なら、その節は引用の内容なので範囲へ含める。
    if (text[i] === '、' && text[i + 1] === 'と') {
      // 「、と（主語）…言った」型。引用の と で始まる節に発話・思考述語があれば引用補文とみなす。
      let j = i + 1;
      while (j < text.length && !HARD_BOUNDARY.some(b => text.startsWith(b, j))) j++;
      const seg = text.slice(i + 1, j);
      if (SPEECH_THOUGHT_STEM.some(v => seg.indexOf(v) !== -1)) continue;
    }
    end = i; break;
  }
  return text.slice(predicateAt, end);
}
/**
 * R-3: 凍結期 compare harness の NONPAST contract を current lineage へ最小移植したもの。
 *
 * 回収した原文の構造:
 *   凍結 19 述語は「完全表層形」で与えられ、うち NONPAST = {受け取る, 受け取り, 拾う} の 3 形。
 *   GateS は promotedNonPast を違反として数え、reachedResolver からも NONPAST を外している。
 *   つまり frozen contract は「述語の完全表層形の時制」で realized / nonpast を分けている。
 *
 * ここで移植するのはその区別だけである。汎用の日本語 tense parser は作らない。
 * 判定は構文層（引用 → 未実現 → 否定 → 条件）を先に見て、どれにも当たらない場合にのみ
 * 述語複合の節末形で REALIZED / NONPAST を分ける。末尾 1 文字だけでは判定しない
 * （「受け取る運びだ」は だ で終わるが IRREALIS、「置いてある」は る で終わるが結果状態）。
 *
 * 区分名は historical contract に合わせる。
 */
const REALIS_CLASS = Object.freeze(['REALIZED_PAST_OR_COMPLETED', 'NONPAST', 'IRREALIS',
  'QUOTED_OR_REPORTED', 'UNCERTAIN']);
// 結果・継続の補助動詞（状態として実現している）
const RESULTATIVE_AUX = ['てある', 'ている', 'ていた', 'てあっ', 'ておい', 'てしまっ', 'ちまっ'];
// 節末に付く助詞・準体助詞。時制判定の前に落とす。
// 「んだ」は説明の のだ の口語形だが、同時に撥音便の過去形（読んだ / 持ち込んだ）と衝突するため
// trailer には入れない。過去形を非過去と誤判定する方が危険である。
const CLAUSE_FINAL_TRAILER = ['のである', 'のであっ', 'のだ', 'のです', 'ので', 'から', 'けれど', 'けれども',
  'ものの', 'ものを', 'が', 'し', 'よ', 'ね', 'な', 'か', 'とも', 'とき', 'ころ', 'ため'];
function stripTrailers(x) {
  let t = x;
  for (let g = 0; g < 4; g++) {
    const hit = CLAUSE_FINAL_TRAILER.find(w => t.endsWith(w) && t.length > w.length);
    if (!hit) break;
    t = t.slice(0, t.length - hit.length);
  }
  return t;
}

function realisOf(text, predicateAt) {
  const tail = clauseTail(text, predicateAt);
  const irrealis = IRREALIS_MARKER.filter(m => tail.indexOf(m) !== -1);
  const negated = NEGATION_MARKER.filter(m => tail.indexOf(m) !== -1);
  const conditional = CONDITIONAL_MARKER.filter(m => tail.indexOf(m) !== -1);
  const quotative = QUOTATIVE_COMPLEMENT.filter(m => tail.indexOf(m) !== -1);
  // 「と（主語）…言った」型: 引用の と と発話・思考述語の間に主語等が挟まる形も引用補文である。
  if (!quotative.length) {
    const m = tail.match(new RegExp('と[^。]{0,12}(' + SPEECH_THOUGHT_STEM.join('|') + ')'));
    if (m) quotative.push('QUOTATIVE_WITH_INTERVENING_SUBJECT');
  }
  const all = irrealis.concat(negated, conditional, quotative);

  // 構文層で決まるものを先に返す（順序は historical contract の fail-closed 方針に合わせる）
  let realisClass = null;
  if (quotative.length) realisClass = 'QUOTED_OR_REPORTED';
  else if (irrealis.length || conditional.length) realisClass = 'IRREALIS';
  else if (negated.length) realisClass = 'IRREALIS';

  if (realisClass === null) {
    // 述語複合の節末形で REALIZED / NONPAST を分ける。
    const core = stripTrailers(tail.replace(/[。、」』\s]+$/, ''));
    if (RESULTATIVE_AUX.some(a => core.indexOf(a) !== -1)) realisClass = 'REALIZED_PAST_OR_COMPLETED';
    else if (/[ただ]$/.test(core)) realisClass = 'REALIZED_PAST_OR_COMPLETED';
    else if (core.length === 0) realisClass = 'UNCERTAIN';
    else realisClass = 'NONPAST';
  }
  // REALIZED 以外はすべて「この turn で実現した event である証拠が無い」側へ倒す。
  const unrealized = realisClass !== 'REALIZED_PAST_OR_COMPLETED';
  const markers = all.slice();
  if (!all.length && unrealized) markers.push(realisClass);
  return { unrealized, realisClass, realisMarkers: markers };
}

function e4Extract(text, opts) {
  if (off(opts, 'E4_EXTRACTION')) return { stage: 'E4_EXTRACTION', disabled: true, units: [] };
  const preds = findPredicates(text);
  const units = [];
  preds.forEach((p, i) => {
    const s = themeSpanFor(text, p);
    units.push(Object.assign({
      unitId: 'u' + (i + 1), predicate: p.predicate, predClass: p.predClass, predicateAt: p.at,
    }, s.ok ? {
      decision: 'span', spanStart: s.spanStart, spanEnd: s.spanEnd, surface: s.surface,
      particle: s.particle, preModifiers: s.preModifiers, figurativeContext: s.figurative,
      unrealized: realisOf(text, p.at).unrealized, realisClass: realisOf(text, p.at).realisClass,
      realisMarkers: realisOf(text, p.at).realisMarkers,
    } : { decision: 'abstain', abstainReason: s.abstainReason }));
  });
  return { stage: 'E4_EXTRACTION', disabled: false, units };
}

// ============================================================ A2-THEME
/** span から head（末尾の名詞相当）と修飾語を分ける。連体「の」の右側を head 側とする。 */
const ADJ_OKURIGANA = ['い', 'な'];
function splitHead(surface) {
  // hedge / 形式名詞は分割せず全体を head とする（個体化しないため）
  if (HEDGE.some(h => surface.endsWith(h)) || FORMAL_NOUN.indexOf(surface) !== -1) {
    return { head: surface, modifiers: [] };
  }
  const g = surface.lastIndexOf(GENITIVE);
  const head = g >= 0 && g + 1 < surface.length ? surface.slice(g + 1) : surface;
  const modifiers = [];
  let rest = g >= 0 ? surface.slice(0, g) : '';
  if (rest.length) modifiers.push(rest);
  // 形容詞的前修飾（安定属性 / 可変状態）を head から剥がす
  // ME1-SEM-Q: 安定属性・可変状態の前置は「形容詞の送り仮名を伴う」場合だけ剥がす。
  // 送り仮名も属格も無い連接（木地 / 木賊 のような複合名詞）は 1 語であり、
  // 剥がすと registry の head と一致しなくなる。回収 contract の
  // ADJECTIVAL_ADVERBIAL_SUFFIX / OKURIGANA_EXCLUDED に対応する形態規則である。
  let h = head;
  let guard = 0;
  while (guard++ < 4) {
    const hit = STABLE_ATTR.concat(MUTABLE_STATE).find(a => h.startsWith(a) && h.length > a.length);
    if (!hit) break;
    const rest = h.slice(hit.length);
    const ok = ADJ_OKURIGANA.find(x => rest.startsWith(x) && rest.length > x.length);
    if (!ok) break;               // 送り仮名が無ければ複合名詞として扱い、剥がさない
    modifiers.push(hit); h = rest.slice(ok.length);
  }
  return { head: h, modifiers };
}

/**
 * registry 側の modifier を splitHead と同じ正規形へ揃える。
 * registry は外部入力なので「赤い」表記でも「赤」表記でも来る。正規化しないと
 * 同一個体が exact 不一致 → MODIFIER_CONFLICT へ落ち、精度ではなく表記揺れで判定が変わる。
 * 語彙追加ではなく、既に実装済みの形態規則の再利用である。
 */
function normalizeModifier(m) {
  if (typeof m !== 'string' || !m.length) return m;
  const hit = STABLE_ATTR.concat(MUTABLE_STATE).find(a => m.startsWith(a));
  if (!hit) return m;
  let rest = m.slice(hit.length);
  for (const ok of ADJ_OKURIGANA) if (rest === ok) { rest = ''; break; }
  return rest.length ? m : hit;
}

function classifyHead(head, surface) {
  if (FORMAL_NOUN.indexOf(head) !== -1 || FORMAL_NOUN.indexOf(surface) !== -1) return 'formal_noun_reference';
  for (const r of CLASS_SUFFIX) if (endsAny(head, r.suffix)) return r.cls;
  for (const r of CLASS_HEAD) if (r.heads.indexOf(head) !== -1) return r.cls;
  for (const r of CLASS_HEAD) if (r.heads.some(x => head.endsWith(x))) return r.cls;
  // 未知語は unknown。ineligible にはしない（禁止事項）。
  return 'unknown';
}

function a2Theme(units, text, opts) {
  const disabled = off(opts, 'A2_THEME');
  const out = units.map(u => {
    if (u.decision !== 'span') return u;
    if (disabled) {
      return Object.assign({}, u, {
        semanticClass: 'trackable_physical_object', eventReality: 'real',
        trackability: 'trackable', identityEligibilityFalse: false, themeReason: 'STAGE_DISABLED',
        head: u.surface, modifiers: [],
      });
    }
    const { head, modifiers } = splitHead(u.surface);
    let cls = classifyHead(head, u.surface);
    const figurative = u.figurativeContext === true;
    const eventReality = figurative ? 'figurative' : 'real';

    // trackability: positive evidence を述語側から取る
    const ctx = text.slice(Math.max(0, u.spanStart - 30), Math.min(text.length, u.predicateAt + 20));
    const evHit = Object.keys(EV_TRACK).filter(k => hasAny(ctx, EV_TRACK[k]));
    const hasClassifier = hasAny(ctx, CLASSIFIER);
    let trackability;
    if (CLASS_PARTITION.nonItem.indexOf(cls) !== -1) trackability = 'non_trackable';
    else if (cls === 'trackable_physical_object') trackability = 'trackable';
    else if (evHit.length >= 1 || hasClassifier) trackability = 'uncertain';
    else trackability = 'uncertain';

    // unknown class + 物理操作の positive evidence があれば item へ昇格（allowlist ではなく evidence 由来）
    if (cls === 'unknown' && !figurative && (evHit.length >= 1 || hasClassifier)) {
      cls = 'trackable_physical_object'; trackability = 'trackable';
    }

    // identityEligibilityFalse: class と figurative から決める。未知語であることを理由にしない。
    const ieFalse = figurative
      || CLASS_PARTITION.nonItem.indexOf(cls) !== -1
      || cls === 'formal_noun_reference'
      || cls === 'substance' || cls === 'part_of_object';

    return Object.assign({}, u, {
      head, modifiers, semanticClass: cls, eventReality, trackability,
      identityEligibilityFalse: ieFalse,
      themeEvidence: { trackEvidence: evHit, classifier: hasClassifier },
      themeReason: figurative ? 'FIGURATIVE' : ('CLASS_' + cls),
    });
  });
  return { stage: 'A2_THEME', disabled, units: out };
}

// ============================================================ A2-SENSE
function a2Sense(units, text, opts) {
  const disabled = off(opts, 'A2_SENSE');
  const out = units.map(u => {
    if (u.decision !== 'span') return u;
    if (disabled) return Object.assign({}, u, { sense: 'valid', senseReason: 'STAGE_DISABLED' });
    let predClass = u.predClass;
    // 多義縮約: 機能結果 cue と物理軌道 cue で解消。両方 / どちらも無ければ uncertain。
    if (POLYSEMOUS.some(p => u.predicate.indexOf(p) === 0)) {
      const after = text.slice(u.predicateAt);
      const fn = hasAny(after, FUNCTIONAL_RESULT_CUE);
      const ph = hasAny(after, PHYSICAL_AFTERMATH_CUE);
      if (fn && !ph) return Object.assign({}, u, { sense: 'invalid', senseReason: 'POLYSEMOUS_FUNCTIONAL_RESULT' });
      if (!fn && !ph) return Object.assign({}, u, { sense: 'uncertain', senseReason: 'POLYSEMOUS_UNRESOLVED' });
      predClass = 'physical_motion';
    }
    const row = SENSE_TABLE[u.semanticClass];
    if (!row) return Object.assign({}, u, { sense: 'uncertain', senseReason: 'CLASS_NOT_IN_TABLE' });
    const v = row[predClass];
    if (v === undefined) return Object.assign({}, u, { sense: 'uncertain', senseReason: 'PREDICATE_CLASS_UNKNOWN' });
    return Object.assign({}, u, { sense: v, senseReason: 'TABLE_' + u.semanticClass + '_' + predClass });
  });
  return { stage: 'A2_SENSE', disabled, units: out };
}

// ============================================================ IDENTITY_RES
function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const x = a.slice().sort(), y = b.slice().sort();
  return x.every((v, i) => v === y[i]);
}
/** 安定属性の衝突だけを modifier conflict とみなす（可変状態の差は衝突にしない）。 */
function stableConflict(aMods, bMods) {
  const st = m => m.filter(x => STABLE_ATTR.some(s => x.indexOf(s) !== -1));
  const A = st(aMods), B = st(bMods);
  if (!A.length || !B.length) return false;
  return !A.some(x => B.indexOf(x) !== -1);
}

/**
 * gold contract:
 *   existing = 前 turn 以前に導入済みの特定個体への再言及のみ
 *   new      = 同一 turn 初出（positive evidence が要る）
 *   unknown  = 曖昧・不能（作為的に減らさない）
 */
function identityRes(units, ctx, opts) {
  const disabled = off(opts, 'IDENTITY_RES');
  const turnId = ctx.turnId;
  // [{itemId, head, modifiers, lastSeenTurn, introducedTurn}]
  // ME1-SEM-I-R2: identity 確定の turn と、表層が現れただけの turn を分離する。
  // UNKNOWN の mention で confirmedIdentityTurn を進めると identity continuity を捏造する。
  // 一方 salience まで止めると正当な再解決が永久に不可能になるため、役割を分ける。
  // 入力互換: 旧 lastSeenTurn しか無い registry は confirmedIdentityTurn として読む。
  const registry = (ctx.registry || []).map(e => Object.assign({}, e, {
    modifiers: (e.modifiers || []).map(normalizeModifier),
    confirmedIdentityTurn: e.confirmedIdentityTurn === undefined
      ? (e.lastSeenTurn === undefined ? e.introducedTurn : e.lastSeenTurn) : e.confirmedIdentityTurn,
    surfaceMentionTurn: e.surfaceMentionTurn === undefined
      ? (e.lastSeenTurn === undefined ? e.introducedTurn : e.lastSeenTurn) : e.surfaceMentionTurn,
  }));
  const out = units.map(u => {
    if (u.decision !== 'span') return u;
    if (disabled) {
      return Object.assign({}, u, { resolution: RESOLUTION.NEW, itemId: null, antecedentTurn: null,
        candidates: [], idresReason: 'STAGE_DISABLED', identityWitness: null });
    }
    if (u.identityEligibilityFalse) {
      return Object.assign({}, u, { resolution: RESOLUTION.UNKNOWN, itemId: null, antecedentTurn: null,
        candidates: [], idresReason: 'IDENTITY_ELIGIBILITY_FALSE', identityWitness: null });
    }

    const pre = u.preModifiers || [];
    const refExpr = pre.some(p => DEMONSTRATIVE_DET.indexOf(p) !== -1);
    const sameMark = pre.filter(p => SAME_IDENTITY_MARKER.indexOf(p) !== -1);
    const novelty = pre.filter(p => NOVELTY_MARKER.indexOf(p) !== -1);
    const isAnaphor = u.semanticClass === 'formal_noun_reference';

    // head-final 構造規則: 日本語名詞句は head 末尾。span が registry head で終わるなら候補に挙げる。
    // ただし exact surface 一致（head 完全一致 + modifier 一致）とは別扱いで、単独では EXISTING にしない。
    const headMatches = registry.filter(e => e.head === u.head
      || (typeof u.surface === 'string' && u.surface.length > e.head.length && u.surface.endsWith(e.head)));

    // ---- NEW の positive evidence（許可される 3 種のみ。既存 contract から導出して固定した）
    //   1. EXPLICIT_NOVELTY_MARKER          … NOVELTY_MARKERS（回収 contract の rule family）
    //   2. CURRENT_TURN_INTRODUCTION_RECORD … introducedTurn === 当該 turn の導入記録が存在する
    //   3. CREATION_PREDICATE_IN_CURRENT_TURN … 当該 turn で個体が生成された構造証拠
    // これ以外は NEW の根拠にならない。無ければ UNKNOWN / abstain。
    const positiveNovelty = [];
    const rejectedNovelty = [];
    if (novelty.length) {
      positiveNovelty.push({ kind: 'EXPLICIT_NOVELTY_MARKER', detail: novelty.slice() });
    }
    // 上流が「この turn で個体を導入した」と明示的に記録している場合のみ。
    // registry から推測しない（推測は「見当たらない」と同じ negative 根拠に堕ちる）。
    const introRec = (ctx.introductionRecords || []).filter(r => r.turnId === turnId
      && r.head === u.head && sameSet(r.modifiers || [], u.modifiers));
    if (introRec.length === 1) {
      positiveNovelty.push({ kind: 'CURRENT_TURN_INTRODUCTION_RECORD', detail: [introRec[0].itemId || null] });
    }
    if (NOVELTY_INTRO_STEM_CREATION.some(s => u.predicate.indexOf(s) === 0)) {
      positiveNovelty.push({ kind: 'CREATION_PREDICATE_IN_CURRENT_TURN', detail: [u.predicate] });
    }
    // 監査用: 「NEW にしたくなるが根拠にしてはいけないもの」を明示的に記録する
    if (headMatches.length === 0) rejectedNovelty.push('REGISTRY_HAS_NO_SAME_HEAD_CANDIDATE');
    if (ctx.registryComplete === true) rejectedNovelty.push('REGISTRY_COMPLETENESS_ASSERTED');
    if (u.themeEvidence && (u.themeEvidence.trackEvidence || []).length) rejectedNovelty.push('PHYSICAL_OPERATION_EVIDENCE');
    if (NOVELTY_INTRO_STEM_ACQUISITION.some(s => u.predicate.indexOf(s) === 0)) rejectedNovelty.push('NOVELTY_INTRO_STEM_ACQUISITION');
    // exact surface recurrence は head 完全一致 + modifier 一致。
    // head-final 規則で拾った候補（span が head で終わるだけ）は exact ではなく head-only である。
    const exactMatches = headMatches.filter(e => e.head === u.head && sameSet(e.modifiers, u.modifiers));
    // 継続性 epoch barrier。
    // gold contract の ledger schema は continuityEvents（destroyed / transferred / lost / moved /
    // reestablished）を identity 判定の根拠として必須記載と定めている。既存 contract の概念であり
    // 新しい framework ではない。confirmedIdentityTurn より後・現 turn までの間に epoch が動いた個体は、
    // 表層一致だけでは同一個体と言えない（破壊・譲渡・紛失は stale resurrection、移動は所在 epoch の変化）。
    // reestablished は epoch を再確立するので barrier を解除する。
    // 回収 protocol の minimums は continuityEventsTotal を
    // 「destroy/transfer/lost/reestablish の合計」と定義し moved を数えていない。
    // 凍結期の compare harness も「moved は状態を殺さない」と明記している。
    // P-EPOCH が監視するのは「旧 epoch の所在を根拠にした昇格」であって個体の失効ではない。
    // よって moved を identity-breaking barrier にしない（C7-0037 が通るからという理由では決めない）。
    const EPOCH_BREAKING = ['destroyed', 'transferred', 'lost'];
    const epochBroken = e => {
      // 凍結期 compare harness の continuityStateAt と同じ畳み込みにする。
      //  - 当該 turn より前の event を順に畳み込んで状態を決める（失効は reestablished まで持続）。
      //  - 当該 turn の event はその言及自体が event の記述なので、失効としては数えない。
      //  - ただし当該 turn の reestablished は解除として扱う（言及が再確立の記述である）。
      // confirmedIdentityTurn で下限を切らない。切ると失効後の確定が失効を打ち消してしまう。
      const evs = (e.continuityEvents || []).slice().sort((a, b) => a.turn - b.turn);
      let broken = null;
      for (const ev of evs) {
        if (ev.turn >= turnId) break;
        if (EPOCH_BREAKING.indexOf(ev.type) !== -1) broken = ev.type;
        else if (ev.type === 'reestablished') broken = null;
      }
      if (evs.some(ev => ev.turn === turnId && ev.type === 'reestablished')) broken = null;
      return broken;
    };

    // ME1-SEM-O: identity continuity と location / continuity evidence validity を分離する。
    // 回収 contract で moved は個体の失効ではない（continuityEventsTotal に含まれない）。
    // しかし P-EPOCH が監視するのは「旧 epoch の所在を根拠にした昇格」である。
    // よって moved 以後は、移動前の観測に依拠する exact surface recurrence を
    // それ単独では identity witness にしない。独立 witness があれば EXISTING を許す
    // （moved を理由に別個体扱いはしない）。reestablished 等の扱いは
    // frozen continuityStateAt contract に従い、moved は状態を殺さない。
    const staleLocationEvidence = e => (e.continuityEvents || [])
      .some(ev => ev.type === 'moved' && ev.turn > e.confirmedIdentityTurn && ev.turn < turnId);

    // route-specific window（ME1-SEM-I-R2）
    const inExactWindow = e => (turnId - e.confirmedIdentityTurn) <= WINDOW.exactSurfaceTurnWindow;
    const inHeadWindow = e => (turnId - e.confirmedIdentityTurn) <= WINDOW.headOnlyTurnWindow;
    // salience は表層観測に基づく。identity evidence ではない。
    const isSalient = e => (turnId - e.surfaceMentionTurn) <= WINDOW.activeTurnWindow;

    // positive identity witness は「同一個体への再言及」を示す証拠のみ。
    // 安定属性（色・材質）の一致は compatibility / candidate narrowing であって identity proof ではない。
    // 反証: turn10 に赤い木製の椀A、turn100 に別個体の赤い木製の椀B。属性一致だけでは A≡B を示さない。
    //
    // registry 一意性は identity evidence ではない（E2 第 2 項）。
    // 旧 REFERRING_EXPRESSION_BOUND_TO_UNIQUE_ANTECEDENT は「候補が 1 件」を束縛根拠に流用していたため撤去した。
    // 指示連体詞・照応が antecedent を束縛できるのは、その antecedent が談話上 salient な場合
    // （= active window 内に現れている場合）に限る。
    // 反証: 「あの椀」+ registry の椀が 1 件だけ + 束縛根拠なし → EXISTING にしてはならない。
    const witnessOf = e => {
      if (sameMark.length) return { kind: 'SAME_IDENTITY_MARKER', detail: sameMark.slice() };
      if ((refExpr || isAnaphor) && isSalient(e)) {
        return {
          kind: 'ANAPHORIC_BINDING_TO_SALIENT_ANTECEDENT',
          detail: pre.slice(),
          antecedentSurfaceMentionTurn: e.surfaceMentionTurn,
        };
      }
      return null;
    };
    const attributeCompatibility = e => ({
      kind: 'STABLE_ATTRIBUTE_COMPATIBILITY',
      match: sameSet(e.modifiers, u.modifiers),
      note: '補強にのみ使う。単独で identity proof にしない。',
    });

    // --- unrealized 文脈（回収 contract の規則を port）:
    //   「unrealized 文脈 + 先行 antecedent 無し → unknown（resolved_new 禁止）」
    //   「unrealized 文脈 + 明確な既存 antecedent → resolved_existing 許可」
    // 未実現の予定の中に novelty marker があっても、個体はまだ導入されていない。
    // よって unrealized のとき NEW は出さない。明確な既存 antecedent がある場合のみ EXISTING 経路へ進む。
    if (u.unrealized && (positiveNovelty.length || exactMatches.length !== 1)) {
      return Object.assign({}, u, { resolution: RESOLUTION.UNKNOWN, itemId: null, antecedentTurn: null,
        candidates: headMatches.map(e => e.itemId), idresReason: 'UNREALIZED_CONTEXT_NEW_FORBIDDEN',
        identityWitness: null, noveltyEvidence: [],
        realisMarkers: (u.realisMarkers || []).slice() });
    }

    // --- 裁定の連言「novelty evidence 無し」を EXISTING より先に評価する。
    // ME1-SEM-I 原因分類 A: 「新しい鋏を受け取る」で 新しい が preModifier に取れていたのに、
    // exact 一致経路が先に走って EXISTING を出していた（順序の欠陥であって EXACT_SURFACE 規則の欠陥ではない）。
    if (positiveNovelty.length) {
      return Object.assign({}, u, { resolution: RESOLUTION.NEW, itemId: null, antecedentTurn: null,
        candidates: headMatches.map(e => e.itemId), idresReason: positiveNovelty[0].kind,
        noveltyEvidence: positiveNovelty.slice(), identityWitness: null });
    }

    // --- 複数候補は UNKNOWN 優先
    if (exactMatches.length > 1) {
      return Object.assign({}, u, { resolution: RESOLUTION.UNKNOWN, itemId: null, antecedentTurn: null,
        candidates: exactMatches.map(e => e.itemId), idresReason: 'MULTIPLE_EXACT_CANDIDATES', identityWitness: null });
    }
    // --- 安定属性の衝突があれば UNKNOWN
    if (exactMatches.length === 0 && headMatches.some(e => stableConflict(e.modifiers, u.modifiers))) {
      return Object.assign({}, u, { resolution: RESOLUTION.UNKNOWN, itemId: null, antecedentTurn: null,
        candidates: headMatches.map(e => e.itemId), idresReason: 'MODIFIER_CONFLICT', identityWitness: null });
    }

    // --- EXISTING 経路（ME1-SEM-I 裁定に沿って再構成）
    //
    // 裁定の要点:
    //   positive identity evidence = ACTIVE_WINDOW_EXACT_SURFACE_RECURRENCE
    //   registry uniqueness       = identity evidence ではない。競合候補の不在を確かめる
    //                                AMBIGUITY_BARRIER としてのみ使う。
    // EXISTING candidate になれるのは次を全部満たすときだけ:
    //   exact surface recurrence / active window 内 / novelty evidence 無し /
    //   stable attribute conflict 無し / plurality・cardinality conflict 無し /
    //   competing exact-surface antecedent 無し
    //
    // 「active window 内」の解釈:
    //   回収 contract には EXACT_SURFACE_WINDOW 40 と ACTIVE_BARE_TURN_WINDOW 1 の 2 つがある。
    //   裁定文は witness を ACTIVE_WINDOW_EXACT_SURFACE_RECURRENCE と命名し、
    //   「exact surface recurrence AND active window 内」を別々の連言として並べている。
    //   2 通りに読めるため、safety priority（wrong EXISTING と UNKNOWN の二者択一なら UNKNOWN）に従い
    //   厳しい方（activeTurnWindow）を採る。EXACT_SURFACE_WINDOW 40 は候補を絞る範囲としてのみ使う。
    //   この解釈自体は PENDING_RE_RULING として findings に記録する。
    if (exactMatches.length === 1) {
      const e = exactMatches[0];
      if (e.introducedTurn < turnId) {
        const barriers = {
          noNoveltyEvidence: positiveNovelty.length === 0,
          noStableAttributeConflict: !stableConflict(e.modifiers, u.modifiers),
          noCardinalityConflict: !cardinalityConflict(e.modifiers, u.modifiers),
          noCompetingExactSurfaceAntecedent: exactMatches.length === 1,
          registryUniquenessRole: 'AMBIGUITY_BARRIER_ONLY_NOT_IDENTITY_EVIDENCE',
        };
        barriers.notUnrealizedContext = u.unrealized !== true;
        const epoch = epochBroken(e);
        barriers.noContinuityEpochBreak = epoch === null;
        if (epoch !== null) barriers.epochBreakType = epoch;
        const allBarriersPass = barriers.noNoveltyEvidence && barriers.noStableAttributeConflict
          && barriers.noCardinalityConflict && barriers.noCompetingExactSurfaceAntecedent
          && barriers.notUnrealizedContext && barriers.noContinuityEpochBreak;

        barriers.locationEvidenceValid = !staleLocationEvidence(e);
        // exact surface recurrence 自体が identity evidence。窓は route-specific（40）。
        // ただし移動後は移動前の観測に依拠できないので独立 witness を要求する。
        if (allBarriersPass && inExactWindow(e) && barriers.locationEvidenceValid) {
          return Object.assign({}, u, { resolution: RESOLUTION.EXISTING, itemId: e.itemId,
            antecedentTurn: e.confirmedIdentityTurn, candidates: [e.itemId],
            idresReason: 'ELIGIBLE_EXACT_SURFACE_RECURRENCE',
            identityWitness: { kind: 'ELIGIBLE_EXACT_SURFACE_RECURRENCE',
              detail: [String(e.confirmedIdentityTurn)],
              window: 'exactSurfaceTurnWindow', antecedentConfirmedTurn: e.confirmedIdentityTurn },
            ambiguityBarriers: barriers, attributeCompatibility: attributeCompatibility(e) });
        }
        // window 外: registry 一意性は根拠にならない。独立した positive witness が要る。
        const w = allBarriersPass ? witnessOf(e) : null;
        if (w) {
          return Object.assign({}, u, { resolution: RESOLUTION.EXISTING, itemId: e.itemId,
            antecedentTurn: e.confirmedIdentityTurn, candidates: [e.itemId],
            idresReason: 'OUT_OF_EXACT_WINDOW_WITH_INDEPENDENT_WITNESS', identityWitness: w,
            ambiguityBarriers: barriers, attributeCompatibility: attributeCompatibility(e) });
        }
        return Object.assign({}, u, { resolution: RESOLUTION.UNKNOWN, itemId: null, antecedentTurn: null,
          candidates: [e.itemId],
          idresReason: !allBarriersPass ? 'AMBIGUITY_BARRIER_BLOCKED'
            : (!barriers.locationEvidenceValid ? 'STALE_LOCATION_EVIDENCE_NO_INDEPENDENT_WITNESS'
              : 'OUT_OF_EXACT_WINDOW_NO_POSITIVE_WITNESS'),
          identityWitness: null, ambiguityBarriers: barriers,
          attributeCompatibility: attributeCompatibility(e) });
      }
      // ★ BLOCKER ME1-SEM-G: 旧実装はここを SAME_TURN_REMENTION = EXISTING にしていた。
      // これは凍結済み gold contract（charter_conf8_v3.goldContractFrozen）に正面から反する:
      //   new = 同一 turn 初出（introductionTurn === その turn）
      // introducedTurn === turnId は「その turn で導入された」という positive な導入記録そのものなので
      // CURRENT_TURN_INTRODUCTION_RECORD として NEW にする（EXISTING は前 turn 以前の個体だけ）。
      return Object.assign({}, u, { resolution: RESOLUTION.NEW, itemId: null,
        antecedentTurn: null, candidates: [e.itemId],
        idresReason: 'CURRENT_TURN_INTRODUCTION_RECORD',
        noveltyEvidence: [{ kind: 'CURRENT_TURN_INTRODUCTION_RECORD', detail: [e.itemId] }],
        identityWitness: null });
    }

    // --- 新規導入の positive evidence があるなら NEW（head-only 候補より優先する）
    if (positiveNovelty.length) {
      return Object.assign({}, u, { resolution: RESOLUTION.NEW, itemId: null, antecedentTurn: null,
        candidates: headMatches.map(e => e.itemId), idresReason: positiveNovelty[0].kind,
        noveltyEvidence: positiveNovelty.slice(), identityWitness: null });
    }

    // --- head のみ一致: それ単独では EXISTING にしない
    if (headMatches.length > 0) {
      if (headMatches.some(e => cardinalityConflict(e.modifiers, u.modifiers))) {
        return Object.assign({}, u, { resolution: RESOLUTION.UNKNOWN, itemId: null, antecedentTurn: null,
          candidates: headMatches.map(e => e.itemId), idresReason: 'CARDINALITY_CONFLICT', identityWitness: null });
      }
      if (headMatches.some(e => epochBroken(e) !== null)) {
        return Object.assign({}, u, { resolution: RESOLUTION.UNKNOWN, itemId: null, antecedentTurn: null,
          candidates: headMatches.map(e => e.itemId), idresReason: 'CONTINUITY_EPOCH_BREAK', identityWitness: null });
      }
      const w = sameMark.length ? { kind: 'SAME_IDENTITY_MARKER', detail: sameMark.slice() } : null;
      if (w && headMatches.length === 1 && inHeadWindow(headMatches[0]) && headMatches[0].introducedTurn < turnId) {
        const e = headMatches[0];
        return Object.assign({}, u, { resolution: RESOLUTION.EXISTING, itemId: e.itemId,
          antecedentTurn: e.confirmedIdentityTurn, candidates: [e.itemId],
          idresReason: 'HEAD_ONLY_WITH_POSITIVE_WITNESS', identityWitness: w });
      }
      return Object.assign({}, u, { resolution: RESOLUTION.UNKNOWN, itemId: null, antecedentTurn: null,
        candidates: headMatches.map(e => e.itemId), idresReason: 'HEAD_ONLY_NOT_SUFFICIENT', identityWitness: null });
    }

    // --- 照応表現なのに antecedent を決められない -> UNKNOWN（NEW にしない）
    if (isAnaphor || refExpr) {
      return Object.assign({}, u, { resolution: RESOLUTION.UNKNOWN, itemId: null, antecedentTurn: null,
        candidates: [], idresReason: 'REFERRING_EXPRESSION_WITHOUT_ANTECEDENT', identityWitness: null });
    }

    // --- NEW は positive な新規導入根拠があるときだけ（ここに来る時点で positiveNovelty は空）
    //
    // ★ BLOCKER ME1-SEM-D（2026-08-10 裁定）で閉じた経路:
    //   「registry complete + same-head 候補ゼロ + 物理操作 evidence」を NEW の根拠にしていた。
    //   反証: turn10 で「赤い椀A」を導入 → turn100 で同じ A を「器を置いた」と表現する。
    //   registry は complete でも head「器」の一致は 0 件、物理操作もある。旧条件は NEW を出し、
    //   item 増殖が再発する。registry 不在は「別 head で既出」を排除できない。
    //   物理操作 evidence は「物理的に扱われた」証拠であって「新しい個体である」証拠ではない。
    // したがって registryComplete も物理操作も novelty evidence として使わない（FORBIDDEN_NOVELTY_BASIS）。
    return Object.assign({}, u, {
      resolution: RESOLUTION.UNKNOWN, itemId: null, antecedentTurn: null, candidates: [],
      idresReason: 'NO_POSITIVE_NOVELTY_EVIDENCE', identityWitness: null,
      rejectedNoveltyBasis: rejectedNovelty.slice(),
    });
  });
  return { stage: 'IDENTITY_RES', disabled, units: out };
}

// ============================================================ PROMOTION（identity 証拠と event 証拠を分離）
function promotionGate(units, opts) {
  const disabled = off(opts, 'PROMOTION_GATE');
  const out = units.map(u => {
    if (u.decision !== 'span') return u;
    if (disabled) return Object.assign({}, u, { promoted: true, abstained: false, promotionReason: 'STAGE_DISABLED', eventEvidence: null });
    if (u.identityEligibilityFalse) return Object.assign({}, u, { promoted: false, abstained: true, promotionReason: 'IDENTITY_ELIGIBILITY_FALSE', eventEvidence: null });
    if (u.sense !== 'valid') return Object.assign({}, u, { promoted: false, abstained: true, promotionReason: 'SENSE_' + String(u.sense).toUpperCase(), eventEvidence: null });
    if (u.resolution === RESOLUTION.UNKNOWN) return Object.assign({}, u, { promoted: false, abstained: true, promotionReason: 'IDENTITY_UNKNOWN', eventEvidence: null });
    // 未実現・否定の文脈は event が起きていない。identity が確定しても昇格させない。
    if (u.unrealized) return Object.assign({}, u, { promoted: false, abstained: true,
      promotionReason: 'UNREALIZED_CONTEXT', eventEvidence: null });

    // identity witness を event promotion の根拠に流用しない（E2 第 3 項）。
    const ev = ['physical_handling', 'physical_introduction', 'physical_motion', 'physical_destruction'].indexOf(u.predClass) !== -1
      ? { kind: 'PREDICATE_EVENT', predicate: u.predicate, predClass: u.predClass } : null;
    if (ev === null) {
      return Object.assign({}, u, { promoted: false, abstained: true,
        promotionReason: 'NO_INDEPENDENT_EVENT_EVIDENCE', eventEvidence: null });
    }
    return Object.assign({}, u, { promoted: true, abstained: false, promotionReason: 'PROMOTED', eventEvidence: ev });
  });
  return { stage: 'PROMOTION_GATE', disabled, units: out };
}

// ============================================================ 入力検査 / run
function validateInput(input) {
  const p = [];
  const add = (code, detail) => p.push({ code, detail: detail === undefined ? null : detail });
  if (!isObj(input)) { add('INPUT_MALFORMED'); return p; }
  if (!isStr(input.storyId)) add('STORY_ID_INVALID');
  if (!isIdx(input.turnId)) add('TURN_ID_INVALID');
  if (typeof input.rawSourceText !== 'string' || !input.rawSourceText.length) add('RAW_SOURCE_TEXT_INVALID');
  if (!isObj(input.registryState) || !Array.isArray(input.registryState.items)) add('REGISTRY_INVALID');
  else for (const e of input.registryState.items) {
    const hasTurn = isIdx(e.lastSeenTurn) || isIdx(e.confirmedIdentityTurn);
    if (!isObj(e) || !isStr(e.itemId) || !isStr(e.head) || !Array.isArray(e.modifiers)
      || !isIdx(e.introducedTurn) || !hasTurn) { add('REGISTRY_ENTRY_INVALID'); break; }
  }
  return p;
}

function run(input, opts) {
  const problems = validateInput(input);
  if (problems.length) return { component: COMPONENT + '-' + VERSION, ok: false, problems, final: null, failClosed: true };
  const o = opts || {};
  const bad = (Array.isArray(o.disable) ? o.disable : []).filter(s => STAGES.indexOf(s) === -1);
  if (bad.length) return { component: COMPONENT + '-' + VERSION, ok: false,
    problems: [{ code: 'UNKNOWN_STAGE_IN_DISABLE', detail: bad }], final: null, failClosed: true };

  const text = input.rawSourceText;
  const trace = [];
  let s = e4Extract(text, o); trace.push({ stage: s.stage, disabled: s.disabled, units: s.units.length });
  s = a2Theme(s.units, text, o); trace.push({ stage: s.stage, disabled: s.disabled });
  s = a2Sense(s.units, text, o); trace.push({ stage: s.stage, disabled: s.disabled });
  s = identityRes(s.units, { turnId: input.turnId, registry: input.registryState.items,
    registryComplete: input.registryState.complete === true,
    introductionRecords: Array.isArray(input.introductionRecords) ? input.introductionRecords : [] }, o);
  trace.push({ stage: s.stage, disabled: s.disabled });
  s = promotionGate(s.units, o); trace.push({ stage: s.stage, disabled: s.disabled });

  const units = s.units;
  const spans = units.filter(u => u.decision === 'span');
  const memoryDelta = spans.filter(u => u.promoted).map(u => ({
    unitId: u.unitId, kind: u.resolution === RESOLUTION.EXISTING ? 'LINK_EXISTING' : 'CREATE_NEW',
    itemId: u.itemId, head: u.head, modifiers: u.modifiers.slice(),
    spanStart: u.spanStart, spanEnd: u.spanEnd, surface: u.surface, antecedentTurn: u.antecedentTurn,
  }));
  const events = spans.filter(u => u.promoted && u.eventEvidence).map(u => ({
    unitId: u.unitId, predicate: u.predicate, predClass: u.predClass,
    semanticClass: u.semanticClass, sense: u.sense, itemId: u.itemId, evidence: u.eventEvidence,
  }));
  const abstentions = units.filter(u => u.decision === 'abstain' || u.abstained).map(u => ({
    unitId: u.unitId, reason: u.decision === 'abstain' ? u.abstainReason : u.promotionReason,
    predicate: u.predicate, surface: u.surface || null,
  }));

  const final = {
    storyId: input.storyId, turnId: input.turnId,
    units: units.map(u => ({
      unitId: u.unitId, decision: u.decision, abstainReason: u.abstainReason || null,
      predicate: u.predicate, predClass: u.predClass,
      surface: u.surface || null, spanStart: u.spanStart === undefined ? null : u.spanStart,
      spanEnd: u.spanEnd === undefined ? null : u.spanEnd,
      head: u.head || null, modifiers: u.modifiers || [], preModifiers: u.preModifiers || [],
      particle: u.particle === undefined ? null : u.particle,
      semanticClass: u.semanticClass || null, eventReality: u.eventReality || null,
      trackability: u.trackability || null,
      identityEligibilityFalse: u.identityEligibilityFalse === undefined ? null : u.identityEligibilityFalse,
      sense: u.sense || null, senseReason: u.senseReason || null,
      resolution: u.resolution || null, itemId: u.itemId === undefined ? null : u.itemId,
      antecedentTurn: u.antecedentTurn === undefined ? null : u.antecedentTurn,
      candidates: u.candidates || [], identityWitness: u.identityWitness || null,
      idresReason: u.idresReason || null,
      noveltyEvidence: u.noveltyEvidence || [],
      ambiguityBarriers: u.ambiguityBarriers || null,
      unrealized: u.unrealized === undefined ? null : u.unrealized,
      realisClass: u.realisClass || null,
      realisMarkers: u.realisMarkers || [],
      rejectedNoveltyBasis: u.rejectedNoveltyBasis || [],
      promoted: u.promoted === undefined ? false : u.promoted,
      abstained: u.abstained === undefined ? (u.decision === 'abstain') : u.abstained,
      promotionReason: u.promotionReason || null, eventEvidence: u.eventEvidence || null,
    })),
    memoryDelta, events, abstentions,
  };
  final.resultDigest = sha256(JSON.stringify(final.units.map(x =>
    [x.unitId, x.spanStart, x.spanEnd, x.semanticClass, x.eventReality, x.trackability,
     x.identityEligibilityFalse, x.sense, x.resolution, x.itemId, x.antecedentTurn, x.promoted])));

  return { component: COMPONENT + '-' + VERSION, ok: true, problems: [],
    stagesRun: trace, disabledStages: (Array.isArray(o.disable) ? o.disable : []).slice(),
    final, failClosed: true };
}

module.exports = {
  COMPONENT, VERSION, SUPERSEDES,
  SEMANTIC_CLASS, CLASS_PARTITION, EVENT_REALITY, TRACKABILITY, SENSE, RESOLUTION,
  STAGES, DISABLE_SEMANTICS, WINDOW, SENSE_TABLE, FORBIDDEN_NOVELTY_BASIS, REALIS_CLASS,
  NOVELTY_INTRO_STEM_CREATION, NOVELTY_INTRO_STEM_ACQUISITION, normalizeModifier,
  findPredicates, themeSpanFor, e4Extract, splitHead, classifyHead, a2Theme, a2Sense,
  identityRes, promotionGate, validateInput, run,
};
