/* ============================================================================
 * v292Dfix797 — 4A Layer2 v1 / same-turn hard capability contradiction
 *
 * 正本: out/FABLE51_4A_LAYER2_DESIGN_V2_20260902.md（設計 v2）
 *       out/GPT_RULING_4A1_IMPL_GO_REVISE_20260902.md（GPT 裁定・変更禁止 list）
 *       out/FABLE51_4A_LAYER2_MINIMAL_DESIGN_20260902.md（§1/§3/§4/§5/§6 不変）
 *
 * 一行: 「明示された hard capability 境界を、同一 turn の生成結果が無視して完遂した」
 *        場合だけを、生成後に最大 1 回 rewrite する。soft cognition は log のみ。
 *
 * 契約:
 *   ・既定 OFF（v292Dfix797On==='1' でのみ有効）/ kill switch v292Dfix797Off==='1'
 *   ・detect() は純関数・never throw・fail-open（依存が無ければ検出しない）
 *   ・localStorage 書込 0 / network 0（rewrite の Api.call は呼び出し側の Api を使う）
 *     / DOM 0 / 新 store 0 / 永続 0 / fix77・fix190 の値を 1 バイトも書かない
 *   ・fix741 の regex を **コピーしない**。window.__v292Dfix741.classify() を呼ぶ
 *   ・neg/hyp/reported/quote gate は fix670 の実装を **参照で再利用**
 *     （window.__v292Dfix670.__test.gateBlocked / maskQuotes / splitSpans）
 *   ・hero のみ（NPC は 4B）/ 医学ラベル 0 / severity 表 0 / 条件番号 0
 *   ・1 turn 最大 1 回・+1 call は HIGH 検出時のみ・セッション上限 20
 *
 * ★Rev5（2026-09-04 / GPT 裁定 §3〜§5）: 変更したのは **violation detection の vocabulary /
 *   surface realization のみ**。判定は必ず「active hard constraint category × outcome
 *   expression」の組で、単語単独の regex では HIT しない。
 *   宣言側（HARD_DENIAL / explicitHardConstraint / declBlocked / DOUBLE_NEG / COND_FORM /
 *   PAST_RECALL）・rewrite（instructionFor）・採用 gate（turnHook）・authority・
 *   beginTurnContext / prevFor / PREV snapshot・fix741 経路は Rev4 から **1 バイトも変えていない**
 *   （function 単位の source SHA-256 で証明 = INVARIANCE_PROOF.json）。
 *   本 file は QA build（DO_NOT_DEPLOY）。live index からは参照されない。
 *
 * ★Rev5b（2026-09-04 / GPT 裁定 (a)）: 変更したのは **宣言側 HARD_DENIAL の VOICE 形の
 *   実測された文法欠落 1 点のみ**。Corpus v2 C7a の条件文「大声は出せない」は Rev5 までの
 *   VOICE 5 形（声(が|は)出(ない|ず) / 叫べない / 喋れない / 話せない / 〜することもできない）の
 *   どれにも当たらず、24 件すべてで candidate が 0 だった。ここへ **capability 名詞（大声/声/
 *   叫び声）＋「出せない」** の形だけを足す。汎用の可能形否定 parser は作らない・他 category
 *   （ARM / LOCO / SIGHT / BODY）へは 1 つも足さない。
 *   **semantic boundary**: 「大声は出せない」を「一切発話不能」へ拡張しない。constraint が
 *   立った後の violation 判定は Rev5 の voiceOutcome のまま（restricted loud speech の完遂＝
 *   音量到達 or 発話持続）で、小声・掠れ声・囁きは VOICE_WEAK / VOICE_BREAK で従来どおり
 *   非該当。C7a と C7b を混ぜない。
 *   detector 本体（detect / VIOL / FAILWORD / PARTIAL / ALT_ETC / NONAGENT / HARDCOST /
 *   VOICE_WEAK / VOICE_LOUD / VOICE_BREAK / VOICE_NOCARRY / STILL_DISABLED / PROJ_FAIL /
 *   VIS_NEG / FREEZE_REL / handoffRe / partActive / freezeReleased / utteranceLen /
 *   sayHeroOk / voiceOutcome / outcomeAt）・rewrite（instructionFor）・採用 gate（turnHook）・
 *   beginTurnContext / prevFor / declBlocked / explicitHardConstraint 本体・fix741 経路は
 *   Rev5 から **1 バイトも変えていない**（INVARIANCE_PROOF.json）。
 *
 * ★N1P（2026-09-04 / GPT 裁定 N1P）: 変更したのは **採用 rewrite を io.parse へ渡す直前の
 *   「persistent 3 属性（傷 / 関係 / 未解決）の sanitise」1 点のみ**。
 *   rewrite は同 turn の矛盾を直す二次生成であって新しい物語イベントではないので、
 *   **即時状態（からだ/こころ/本能/目的）は最終描写に合わせて後勝ちのまま**、
 *   **persistent 状態（傷/関係/未解決）は rewrite が新規作成・変更・削除できない**ようにする。
 *   ・sanitise は **parse 前**に行う。parse 後に store を戻す方式は採らない
 *     （store が一瞬でも rewrite の誤った persistent 値を持つことを許さない）。
 *   ・基準は **同 turn の original 応答（io.text）の <state> の当該属性** だけ。store / PREV /
 *     localStorage は読まない（新 authority 0）。
 *   ・属性キーは live 実装に一致（fix190 captureExt FIELDS = 傷/関係/未解決、
 *     fix77 captureState = からだ/こころ/本能/目的）。who / entity の normalization は
 *     **今回入れない**（表記ゆれは記録のみ）。
 *   ・返すのは parse へ渡す text だけで、表示・保存・turn.dbg.raw に載る本文は rewrite の
 *     生バイト（r2）のまま＝ visible narrative は 1 バイトも変わらない。
 *   detector 本体（detect / VIOL / HARD_DENIAL / FAILWORD / PARTIAL / ALT_ETC / NONAGENT /
 *   HARDCOST / VOICE_* / VIS_NEG / FREEZE_REL / STILL_DISABLED / PROJ_FAIL / handoffRe /
 *   partActive / freezeReleased / utteranceLen / sayHeroOk / voiceOutcome / outcomeAt）・
 *   explicitHardConstraint / declBlocked / capabilityDenialRe・rewrite（instructionFor）・
 *   **turnHook の採用 gate（empty / short / no-state / still-violating）**・
 *   beginTurnContext / prevFor / ctxOf・fix741 経路は Rev5b から **1 バイトも変えていない**
 *   （INVARIANCE_PROOF_N1P.json）。
 *
 * index.html 側の変更: script タグ 1 行（＋コメント 1 行）＋ parsePlan 既存 rewrite 入口直後の
 *   hook 1 行 ＋ ★Rev4: G.submit の Planner.build 後・最初の Api.call 直前の
 *   beginTurnContext(S) 1 行 = 追加 4 行・削除 0。
 *   本 file 未 load / flag OFF で完全 no-op（出力 byte 同一）。
 * ==========================================================================*/
(function () {
  'use strict';

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  if (lsGet('v292Dfix797Off') === '1') return;          // kill switch（global を作らない）
  if (window.__v292Dfix797) return;                     // 二重 install 防止

  var BUILD = 'v292Dfix797-20260904-n1p';
  var SESSION_CAP = 20;                                  // 設計 §4 セッション上限
  var RING_MAX = 50;                                     // memory only（設計 §5）

  function on() { return lsGet('v292Dfix797On') === '1'; }

  /* ---- 外部依存（すべて参照。コピー 0・改変 0） ---------------------- */
  function dep741() {
    try { var f = window.__v292Dfix741; return (f && typeof f.classify === 'function') ? f : null; }
    catch (e) { return null; }
  }
  function dep670() {
    try {
      var t = window.__v292Dfix670 && window.__v292Dfix670.__test;
      return (t && typeof t.gateBlocked === 'function' && typeof t.maskQuotes === 'function'
              && typeof t.splitSpans === 'function') ? t : null;
    } catch (e) { return null; }
  }

  /* ========================================================================
   * 1. explicit hard denial の closed list（**唯一の定義**）
   *    ★Rev3（GPT 4A-1b・2026-09-02）: source B（同一 output）と source A（前 turn の
   *      fix77 karada/kizu 自由文）で **同じ pure helper `explicitHardConstraint()`**
   *      を共有する。source A 専用 classifier は作らない・list/regex を複製しない。
   *    ★推論しない: 骨折 / 痛い / 息苦しい / ショック / 恐怖 / 硬直 から能力不能を導かない。
   *      D 表現（「右手首を骨折して固定中」）は v1 では **MISS 許容**（語彙を広げない）。
   * ======================================================================*/
  /* ★Rev5b: capability 名詞 ＋ 可能形の否定 を組み立てる共有 helper（純関数・never throw）。
     **汎用の可能形否定 parser ではない**: 「どの capability 名詞」と「どの動詞語幹の可能形否定」
     を採るかは呼び出し側が閉じた列挙で明示する。Rev5b で呼ぶのは VOICE の 1 箇所のみで、
     ARM / LOCO / SIGHT / BODY からは呼んでいない（他 category への一般化 0）。 */
  function capabilityDenialRe(nouns, stems) {
    try {
      return new RegExp('(' + nouns.join('|') + ')(が|は|も|を)' +
                        '(?:もう|全く|まったく|ろくに|ほとんど|どうしても)?' +
                        '(' + stems.join('|') + ')ない');
    } catch (e) { return /(?!)/; }
  }
  /* VOICE の観測された穴（Corpus v2 C7a 条件文「大声は出せない」）だけを閉じる。
     声・大声という VOICE capability に明示的に結びついた「出せない」に限定するので、
     「大声で笑えない」（capability 否定でない・助詞が で）や「声が枯れている」
     （状態記述・可能形否定でない）は当たらない。 */
  var VOICE_POTENTIAL_DENIAL = capabilityDenialRe(['大声', '叫び声', '声'], ['出せ']);

  var HARD_DENIAL = [
    /* (a) 直接否定形 */
    { cat: 'ARM',   part: 1, re: /(左|右|両)?(腕|手首|手|拳|肘|肩)(が|は)(?:もう|全く|まったく|ろくに)?(使えない|動かない)/ },
    { cat: 'ARM',   re: /指(が|は)(?:もう|全く|まったく)?動かない/ },
    { cat: 'LOCO',  re: /(立てない|歩けない|走れない)/ },
    { cat: 'VOICE', re: /(声(が|は)(?:ほとんど)?出(ない|ず)|叫べない|喋れない|話せない)/ },
    /* ★Rev2（Fable5.1 裁定）: 旧 `(何も|全く)?見えない` は接頭辞が任意なので、環境側の
       「向こう側は…よく見えない」「底は見えない」を宣言として拾っていた（A0-C2-P2-B-s1）。
       hero の視覚能力そのものが主語になっている形だけに限定する。 */
    { cat: 'SIGHT', re: /(目|両目|視界|視力)(が|は|も)?[^。]{0,6}見えな(い|くな)/ },
    { cat: 'SIGHT', re: /(何も|全く|まったく)見えない/ },
    { cat: 'BODY',  re: /(体|身体)が動かない/ },
    /* (b) 「〜(こと)ができない」形（★Rev3 / GPT 4A-1b の E 表現。能力語は閉じたまま） */
    { cat: 'ARM',   part: 1, re: /(左|右|両)?(腕|手首|手|拳|肘|肩|指)で[^。]{0,12}(でき|出来)ない/ },
    { cat: 'LOCO',  re: /(走る|歩く|跳ぶ|立つ)こと(も|は|が)?[^。]{0,24}(でき|出来)ない/ },
    { cat: 'VOICE', re: /(声を出す|喋る|話す|叫ぶ)こと(も|は|が)?[^。]{0,24}(でき|出来)ない/ },
    /* (c) ★Rev5b: VOICE capability ＋ 可能形の否定（観測穴「大声は出せない」）。
           ここだけが Rev5 → Rev5b の宣言側 diff。他 category には 1 つも足していない。 */
    { cat: 'VOICE', re: VOICE_POTENTIAL_DENIAL },
    { cat: 'SIGHT', re: /(見る|読む)こと(も|は|が)?[^。]{0,24}(でき|出来)ない/ },
    { cat: 'BODY',  re: /動くこと(も|は|が)?[^。]{0,24}(でき|出来)ない/ }
  ];

  /* 2. 違反（結果側）の closed list — ★Rev5（GPT 裁定 2026-09-04 §3）------------
   *    判定は必ず **active hard constraint category × outcome expression** の組。
   *    「叫ぶ」「見えた」「回す」等の **単語単独では HIT しない**（act だけでは候補にならず、
   *    その category の能力が *完遂* したことを表す outcome 表現が別に要る）。
   *    outcome はカテゴリ一般の表層形のみを置く（個別 narrative の固有表現は入れない）:
   *      ・完遂アスペクト   〜切った / 回った / 開いた
   *      ・機構解除         錠・閂・ラッチ・シリンダーが 外れ / 落ち / 回っ
   *      ・射出到達         弦・矢が 放たれ / 命中 / 刺さ / 貫い
   *      ・移動到達         着地 / 渡り切る / 辿り着く / 走り続ける / 距離を詰める
   *      ・音量到達         ！！ / 響く・反響・跳ね返る / 空気を裂く / 埃が落ちる
   *      ・発話持続         連続引用 20 字以上（「一語二語」制約に対する完遂）
   *      ・知覚成立         見えた / 読み取れた / 表情を読む / 像を結ぶ / 判読
   *    C7a は speech（VOICE）のみ hard・movement は判定しない（C7b BODY と混ぜない）。
   *    C4 は soft のまま detector 対象外（VIOL に category を足していない）。 */
  var VIOL = {
    ARM: {
      act: /(回(す|し|る|そう|っ)|捻(る|り|っ)|(つま|摘)(む|み|ん)|挟(む|み|ん)|握(る|り|っ)|差し込|押し込|引き絞|弦を引|矢を(番|つが)|結(ぶ|び|ん)|操作|ピッキング|(ボタン|鍵|閂|錠)を(押|回|差))/,
      ok:  /((鍵|錠|錠前|閂|ラッチ|ボルト|シリンダー|掛け金|扉|戸|戸口|板戸|蓋)[^。]{0,14}(外れ|落ち|回っ|回り|開い|開く|開け|下り|上が|解け)|(回し|回り|捻り|引き|絞り|やり|し)(切|きっ)(た|て|り)|(最後まで|完全に|すっかり|きっちり)[^。]{0,10}(回|引|締め|開け|押し|外)|(弦|矢)[^。]{0,14}(放|離|射|飛(ん|び)|裂(い|く|け)|唸)|命中|射抜|(矢|弦)[^。]{0,10}(刺さ|貫)|(結び目|縄|紐)[^。]{0,10}(解け|外れ|緩)|やり遂げ|完遂)/,
      win: 10
    },
    LOCO: {
      act: /(走(る|っ|り)|駆け(る|た|て|出|抜け|寄)|跳(ぶ|ん|び)|踏み切|跳躍|越え(る|た|て)|渡(る|っ|り)|歩(く|い|き)|立ち上が|進(む|ん|み))/,
      ok:  /(たどり着|辿り着|着いた|到着|間に合(っ|う)|渡り(切|きっ)|抜け(た|出た|切っ)|越え(た|る)|振り切っ|着地|(向こう|反対)(側|岸)?[^。]{0,10}(立|降り|着|渡|出)|走り(続け|抜け|切っ)|距離を(詰め|取っ|稼)|逃げ(切っ|おおせ))/,
      win: 2
    },
    VOICE: { act: /(叫(ぶ|ん|び)|怒鳴(る|っ|り)|大声|声を(張り上げ|上げ|限り)|喚(く|い)|吼え|演説|まくし立て|言い切)/, ok: null, win: 1 },
    SIGHT: {
      act: /(見え(た|る|て(いる|くる|きた)?)|視認|見抜(い|く|け)|読(み取れ|み取っ|めた|み終え|み切っ|んだ)|判読|文字[^。]{0,12}(浮かび上が|読|判読|見え|形に)|(顔|表情|目元|視線|瞳|眼|姿|人影|輪郭|看板|手元|色|傷)を[^。]{0,10}(見(た|て|つめ|据え|比べ|続け|下ろ|上げ|分け|極め)|捉え|視認|確かめ)|(視界|視線)[^。]{0,8}(捉え|収め|入(っ|る)|開け|戻|晴れ|利(く|い))|(目元|視線|瞳孔|口角|まなざし)[^。]{0,14}(読|見|捉え|気づ)|表情[^。]{0,8}(読|見|捉え)|像を結|はっきり[^。]{0,8}(見|映))/,
      ok: null, win: 0
    },
    BODY: {
      act: /(駆け寄|走り寄|飛び(かか|出|込)|距離を詰め|踏み込(む|ん|み)|(掴|つか)(む|み|ん)|引きずり出|抱き(かかえ|上げ|寄せ)|持ち上げ|(縄|紐|鎖|布|猿ぐつわ)を[^。]{0,8}(外|解|切|引き抜|ほど)|突き飛ば|振り払)/,
      ok: null, win: 0
    }
  };

  /* 3. 非該当（設計 §2「試みて失敗／代替手段／部分達成」＋ Rev5 の category 別 guard） */
  var FAILWORD = /(できなかった|失敗し|届かな|叶わ(ず|なかった)|空(を)?切っ|滑(っ|り)|取り落と|力が入らな|果たせ|及ばな|阻まれ|回らな|開かな|入らな)/;
  var PARTIAL  = /(かろうじて|辛うじて|わずかに|ほんの少し|少しだけ|数センチ|半分だけ|なんとか|半周|途中まで)/;
  var ALT_ETC  = /(口で|歯で|口を使|歯を使|杖|松葉杖|肩を借り|支えられ)/;
  /* ★Rev5: 非行為主体（光・音・他者）が主語の節を「能力の完遂」として拾わない */
  var NONAGENT = /(光|音|足音|物音|風|空気|影|埃|煙|水|雨|振動|匂い|血|視線|気配|震え|痛み|悲鳴|鼓動|誰か|何か|人影)(が|は|も)[^。]{0,12}$/;
  /* ★Rev5: LOCO / BODY の強コスト（人手基準の「跳んだが崩れた」= 非該当） */
  var HARDCOST = /(崩れ|倒れ|転(倒|がっ|んだ|げ)|膝(が|から|を)[^。]{0,6}(折|崩|落|つ(い|く)|笑)|力尽き|意識が(飛|遠のい|白)|尻もち|うずくま)/;
  /* ★Rev5: 到達語の直後に「立てない／走れない」が続く型は能力の行使が成立していない */
  var STILL_DISABLED = /(立てな|走れな|歩けな|動けな|進めな)/;
  /* ★Rev5: VOICE 音量経路の否定（掠れ＝大声不成立）／持続経路の否定（断裂） */
  var VOICE_WEAK  = /(掠れ|かすれ|絞り出|裏返|音にならな|声にならな|届かな|小さ(く|な|い)声|囁|ささや|弱々し|くぐも|声(が|は)[^。]{0,4}割れ|喉(が|の)[^。]{0,6}(鳴|詰ま|焼|塞))/;
  /* 「声が外へ運ばれなかった」= 音量到達そのものの否定（掠れ等の弱さとは別扱い） */
  var VOICE_NOCARRY = /(音にならな|声にならな|届かな|漏れただけ|息だけ|音は出な)/;
  var VOICE_BREAK = /(途切れ|切れ切れ|咳き込|咳が|断ち切|続かな|一語|二語|一言|数語|そこで(切|止ま)|途中で(切|止)|言葉に(なら|でき)な)/;
  /* ★Rev5: 射出系 outcome は「狙いどおり届いたか」まで見る（低軌道・逸れは非該当）*/
  var PROJ_FAIL = /(狙い(より|から|を外|が[^。]{0,4}(外|逸|狂))|(低い|浅い|甘い)軌道|軌道が[^。]{0,4}(低|逸|それ)|逸れ|それて|手前に落ち|届かず|失速|かすめただけ)/;
  var VOICE_LOUD  = /(響(い|き|く|かせ)|反響|跳ね返|轟|震わせ|(裂|割)(い|く|いた)|埃[^。]{0,10}(落ち|舞)|耳を(打|つんざ)|(外|廊下|通り)(へ|に|まで)[^。]{0,10}(届|抜け|漏れ|響)|突き抜け|張り上げ)/;
  /* ★Rev5: VISION の非視覚経路（記憶・想像・気配・「空気を読む」）は非該当 */
  var VIS_NEG = /(気がする|ような気|かもしれ|だろうか|想像|記憶|思い出|脳裏|覚えて|知っている|気配|勘|音だけ|空気を読|心を読|察し)/;
  /* ★Rev5: C7b tonic の「硬直が解ける／体が勝手に」= AMBIGUOUS 域 → HIT させない */
  var FREEZE_REL = /(硬直(が|は|も)?[^。]{0,8}(解|ほど|抜け|去|緩|溶け)|勝手に[^。]{0,6}(動|進|出|走|伸び)|(体|身体|足|手|口)が(勝手|独りでに|ひとりでに)|自分の意志で(は)?(ない|なく)|意志と(は)?[^。]{0,4}(無)?関係|ようやく[^。]{0,8}(動|足|体|進))/;

  /* ★Rev5 helper（すべて純関数・never throw・新 authority 0） ------------------ */
  /* 対側の手・歯・口・杖へ「持ち替えた」= その能力の完遂ではない */
  function handoffRe(part) {
    var side = (part && /^(左|右)/.test(part)) ? (part.charAt(0) === '右' ? '左' : '右') : null;
    var alt = side ? '(' + side + '手|' + side + 'の(手|指)|歯|口|杖|反対の手|もう片方の手)'
                   : '(歯|口|杖|反対の手|もう片方の手)';
    try { return new RegExp(alt + '[^。]{0,10}(で|が|に|へ)[^。]{0,12}(回|引|握|掴|捉|差し込|押し込|摘|つま|捻|開け|切り替|持ち替|放)'); }
    catch (e) { return null; }
  }
  /* 制約部位は「一度示されたら対側への持ち替えが明示されるまで有効」（地の文は毎文
     部位名を書き直さない）。gate 済み節（否定・仮定・伝聞）は根拠に使わない。 */
  function partActive(part, list, vi, gates) {
    if (!part) return true;
    var side = /^(左|右|両)/.test(part) ? part.charAt(0) : '';
    var re, oppRe = null;
    try {
      re = side ? new RegExp(side + '(腕|手首|手|拳|肘|肩|指)') : /(腕|手首|手|拳|肘|肩|指)/;
      if (side === '右') oppRe = /左(腕|手首|手|拳|肘|肩|指)/;
      if (side === '左') oppRe = /右(腕|手首|手|拳|肘|肩|指)/;
    } catch (e) { return true; }
    if (re.test(list[vi].m)) return true;
    for (var j = vi - 1; j >= 0; j--) {
      if (gates[j]) continue;
      if (re.test(list[j].m)) return true;
      if (oppRe && oppRe.test(list[j].m)) return false;
    }
    return false;
  }
  /* 硬直の解除・不随意（「体が勝手に」）が描かれていれば C7b BODY は AMBIGUOUS 域 */
  function freezeReleased(list, vi) {
    for (var j = 0; j <= vi && j < list.length; j++) {
      if (FREEZE_REL.test(list[j].m) || FREEZE_REL.test(list[j].o)) return true;
    }
    return false;
  }
  /* ★Rev5: 引用の「実際の発話長」。mask 長は <say who="..."> の属性まで含むので、
     原文から発話本体だけを取り出して沈黙記号を除いた字数で測る。 */
  function utteranceLen(o) {
    var n = 0, m, str = String(o || '');
    var re1 = /<say[^>]*>([\s\S]*?)<\/say>/g, re2 = /「([^」]*)」/g;
    while ((m = re1.exec(str))) n = Math.max(n, String(m[1]).replace(/[…‥・。、\s　]/g, '').length);
    while ((m = re2.exec(str))) n = Math.max(n, String(m[1]).replace(/[…‥・。、\s　]/g, '').length);
    return n;
  }
  /* ★Rev5: <say who="X"> の話者が hero でない発話は hero の能力行使ではない */
  function sayHeroOk(o, ctx) {
    var str = String(o || ''), m, re = /<say\s+who="([^"]*)"/g, seen = false;
    var hero = (ctx && ctx.hero) || '';
    while ((m = re.exec(str))) { seen = true; if (hero && m[1] === hero) return true; }
    return !seen;
  }

  /* VOICE = 音量到達 or 発話持続の 2 経路。掠れ・断裂は各経路の否定側。 */
  function voiceOutcome(list, vi) {
    var v = list[vi], n1 = list[vi + 1], n2 = list[vi + 2];
    var winM = v.m + (n1 ? n1.m : ''), winO = v.o + (n1 ? n1.o : '');
    var wideM = winM + (n2 ? n2.m : '');
    if (VOICE_BREAK.test(wideM)) return null;                          /* 断裂＝持続不成立 */
    /* (1a) 到達が明示された音量（響く・反響・空気を裂く・埃が落ちる）は、同時に描かれる
       「掠れ」等の弱さより優先する。ただし「音にならない／届かない」は到達自体の否定。 */
    if (VOICE_LOUD.test(wideM) && !VOICE_NOCARRY.test(winM) && !VOICE_NOCARRY.test(winO))
      return { at: vi, path: 'volume' };
    if (VOICE_WEAK.test(winM) || VOICE_WEAK.test(winO)) return null;   /* 掠れ＝大声不成立 */
    var loud = /！！/.test(winO) || /！[^。！]{0,12}！/.test(winO);
    var vol  = /(大声|声を(張り上げ|限り)|ありったけ|腹の底から|力の限り)/.test(winM)
               && ((new RegExp(MASK_CH + '{4,}')).test(winM) || /！/.test(winO));
    if (loud || vol) return { at: vi, path: 'volume' };
    if ((new RegExp(MASK_CH + '{20,}')).test(winM) && utteranceLen(v.o) >= 20)
      return { at: vi, path: 'duration' };
    return null;
  }
  /* category ごとの outcome 照合。ARM / LOCO は act span から前方 win span まで。 */
  function outcomeAt(cat, V, list, vi, gates, handoff) {
    if (cat === 'VOICE') return voiceOutcome(list, vi);
    if (cat === 'SIGHT') return VIS_NEG.test(list[vi].m) ? null : { at: vi, path: 'perception' };
    if (cat === 'BODY') {
      if (HARDCOST.test(list[vi].m)) return null;
      var n0 = list[vi + 1];
      if (n0 && !gates[vi + 1] && HARDCOST.test(n0.m)) return null;
      return { at: vi, path: 'motion' };
    }
    if (!V.ok) return null;
    /* 代替手段への持ち替えは episode の前後 4 span まで見る（handoff 済みなら非該当）*/
    if (handoff) {
      for (var b = Math.max(0, vi - 4); b <= vi + (V.win || 0) && b < list.length; b++) {
        if (b === vi) continue;
        if (!gates[b] && handoff.test(list[b].m)) return null;
      }
    }
    for (var j = vi; j <= vi + (V.win || 0) && j < list.length; j++) {
      if (gates[j]) continue;
      if (FAILWORD.test(list[j].m) || PARTIAL.test(list[j].m)) continue;
      if (ALT_ETC.test(list[j].m)) continue;               /* 到達を代替手段が担っている */
      if (cat === 'LOCO' && j > vi && HARDCOST.test(list[j].m)) return null;
      if (!V.ok.test(list[j].m)) continue;
      if (cat === 'ARM' && /(弦|矢|命中|射抜)/.test(list[j].m)) {
        var pf = list[j].m + (list[j + 1] ? list[j + 1].m : '');
        if (PROJ_FAIL.test(pf)) return null;
      }
      if (cat === 'LOCO') {
        for (var q = j + 1; q <= j + 2 && q < list.length; q++)
          if (HARDCOST.test(list[q].m)) return null;
        for (var q2 = j + 1; q2 <= j + 4 && q2 < list.length; q2++)
          if (STILL_DISABLED.test(list[q2].m)) return null;   /* 到達後も不能のまま */
      }
      return { at: j, path: 'completion' };
    }
    return null;
  }
  /* H2 deferred-cost signature（telemetry のみ・H1 の成立条件にしない） */
  var COLLAPSE = /(崩れ(た|落ち)|膝(が|から)?(折れ|崩れ)|悲鳴|意識が(飛(んだ|び)|遠のい)|倒れ(た|込)|力尽き)/;
  /* SOFT × 深い計画（log only の判定・rewrite しない） */
  var PLAN_RE  = /(まず[^。]{0,24}(次に|そして|その後|それから)|段取り|手順|作戦|二手に|三つ(の|に)|二つ(の|に))/;

  /* 宣言側だけの追加ゲート（fix670 の neg は宣言自体が否定形なので使えない） */
  var DOUBLE_NEG = /(わけ|訳)ではない|ないことはない|ないでもない|ほどではない/;
  var COND_FORM  = /(なけれ)ば|ないなら|なかったら|ないと(いけ|だめ|まずい)/;
  var PAST_RECALL = /(昔は|かつて|以前は|あの頃|さっきまで|先ほどまで|数日前は)/;

  var MASK_CH = '＿';   /* fix670 maskQuotes の埋め文字（＿）。参照側で長さ判定に使う */

  /* ---- PREV snapshot（source A の唯一の source・ephemeral） --------------
   *  ★Rev4 / GPT 裁定 2026-09-03 §C:
   *   ・window.S は **一切参照しない**（live の index は window.S を意図的に生やさない）。
   *   ・io.state（＝ Layer2 実行時の state）や fix77 store の **現在値**を previous state
   *     として読まない。順序は Planner.build → Api.call → parsePlan → fix190 #11 →
   *     fix77 #14 → Layer2 なので、Layer2 時点の値は今回の <state> で更新済みでありうる。
   *   ・source A の契約 =「今回の生成が始まる前の fix77 状態」。よって index.html の
   *     G.submit 内・Planner.build の後・最初の Api.call の直前で beginTurnContext(S) が
   *     **1 turn attempt につき 1 回だけ**呼ばれ、その時点の値をここへ写す。
   *   ・ephemeral のみ（localStorage / IDB / canonical / fix77 store へ新規保存 0）。
   *   ・rewrite の再 call では更新しない（beginTurnContext は最初の Api.call より前だけ）。
   *   ・破棄 = 次の beginTurnContext による上書き ＋ story/turn/hero mismatch で fail-open。
   * -------------------------------------------------------------------- */
  var PREV = null;      /* { story, turn, name, karada, kizu } | null */

  /* story 同一性の判定にだけ使う read-only accessor（fix694 document authority）。 */
  function storyKeyOf() {
    try { if (typeof window.__chr6WriteKey === 'function') { var k = window.__chr6WriteKey(); if (k) return String(k); } } catch (e) {}
    try { if (typeof window.__chr6Key === 'function') { var k2 = window.__chr6Key(); if (k2) return String(k2); } } catch (e) {}
    return '';
  }
  function heroOf(st) { try { return (st && st.cast && st.cast.hero && st.cast.hero.name) || ''; } catch (e) { return ''; } }
  function turnOf(st) { try { return (st && st.turns) ? st.turns.length : -1; } catch (e) { return -1; } }

  /* index.html の G.submit（Planner.build の後・最初の Api.call の直前）から 1 行で呼ばれる。
     戻り値なし・plan/state を触らない・書込 0・never throw。 */
  function beginTurnContext(st) {
    try {
      if (!on()) { PREV = null; return; }                 /* 既定 OFF では snapshot も作らない */
      var nm = heroOf(st);
      var e = {};
      try { var store = window.__v292Dfix77Store; if (store && nm) e = store[nm] || {}; } catch (e2) { e = {}; }
      PREV = { story: storyKeyOf(), turn: turnOf(st), name: nm,
               karada: String(e.karada || e['からだ'] || ''),
               kizu:   String(e.kizu   || e['傷'] || '') };
    } catch (e) { PREV = null; }
  }

  /* Layer2 判定時に PREV を source A として使ってよいか。
     hero / story / turn の一致を確認できたときだけ返す。mismatch は fail-open（使わない）。 */
  function prevFor(hero, st) {
    var p = PREV;
    if (!p) return {};                                     /* snapshot 未準備 → source A なし */
    if (!hero || !p.name || p.name !== hero) return {};     /* hero mismatch */
    var story = storyKeyOf();
    if (story && p.story && story !== p.story) return {};   /* story mismatch → fail-open */
    var t = turnOf(st);
    if (t >= 0 && p.turn >= 0 && t !== p.turn) return {};   /* turn mismatch → fail-open */
    return { karada: p.karada, kizu: p.kizu };
  }

  /* ---- 節分割（fix414 keepClauses は非公開なので同形の最小分割のみ） ----
   *  ★fix741 の regex はコピーしない。分割した節を classify() へ渡すだけ。 */
  function splitClauses(text) {
    var out = [];
    String(text || '').split(/[。\n]/).forEach(function (sent) {
      String(sent).split(/(?:だが|が、|しかし|一方|ものの|ただし|けれど|けど)/).forEach(function (cl) {
        cl = String(cl || '').trim();
        if (cl) out.push(cl);
      });
    });
    return out;
  }

  /* ---- 帰属（v1 = hero のみ。他 cast 名が居る span は採らない） -------- */
  function heroAttributed(span, ctx) {
    var others = (ctx && ctx.others) || [];
    for (var i = 0; i < others.length; i++) {
      if (others[i] && span.indexOf(others[i]) >= 0) return false;
    }
    return true;
  }

  /* ---- gate（fix670 を参照で再利用） ----------------------------------
   *  ★Rev3: fix670 の gateBlocked は **最初に当たった 1 つ**しか返さないので、
   *    宣言文（必ず「〜ない」を含む）を丸ごと渡すと常に 'neg' が返り、
   *    hyp / reported / quote / belief などの後段ゲートが死ぬ（Rev1/Rev2 の実害）。
   *    → 「当たった否定表現そのもの」を取り除いた残りに gateBlocked を当てる。
   *      これで「彼は歩けないと言った」= reported を宣言側でも落とせる。
   *      regex はコピーせず、fix670 の実装をそのまま参照で使う。 */
  function declBlocked(g670, clause, matched) {
    if (DOUBLE_NEG.test(clause)) return 'double-neg';
    if (COND_FORM.test(clause)) return 'cond';
    if (PAST_RECALL.test(clause)) return 'past';
    var rest = matched ? clause.split(matched).join('') : clause;
    var g = null;
    try { g = g670.gateBlocked(rest); } catch (e) { g = null; }
    if (g && g !== 'neg') return g;                 /* 残りの neg は無視（宣言自体が否定形） */
    return null;
  }
  function violBlocked(g670, span) {
    var g = null;
    try { g = g670.gateBlocked(span); } catch (e) { g = null; }
    if (g) return g;                                 /* 違反側は neg も含めて全部ブロック */
    if (FAILWORD.test(span)) return 'fail-attempt';
    if (PARTIAL.test(span)) return 'partial';
    return null;
  }

  /* ---- 部位の対側（左手代替 → 非検出） -------------------------------- */
  function oppositeOf(part) {
    if (!part) return null;
    if (part.indexOf('右') === 0) return /左(腕|手|手首|拳|肘|肩)/;   /* 右→左 */
    if (part.indexOf('左') === 0) return /右(腕|手|手首|拳|肘|肩)/;   /* 左→右 */
    return null;
  }
  /* 宣言部位が span に現れるか（「その部位で」の条件） */
  function partPresent(part, span) {
    if (!part) return true;
    var side = /^(左|右|両)/.test(part) ? part.charAt(0) : '';
    var re = side ? new RegExp(side + '(腕|手首|手|拳|肘|肩)')
                  : /(腕|手首|手|拳|肘|肩|指)/;
    return re.test(span);
  }

  /* ========================================================================
   * explicitHardConstraint(text, ctx, g670) — ★Rev3 / GPT 4A-1b
   *   **source A（前 turn の karada/kizu 自由文）と source B（同一 output 本文）が
   *     共有する唯一の explicit hard denial 抽出器。** 純関数・never throw。
   *   返り値: [{ cat, part, at, text }]（at = text 内の文 index。source A 側は使わない）
   * ======================================================================*/
  function explicitHardConstraint(text, ctx, g670) {
    var out = [];
    try {
      var g = g670 || dep670(); if (!g) return out;            /* fail-open */
      var src = String(text || ''); if (!src.trim()) return out;
      var masked = g.maskQuotes(src);
      var spans = g.splitSpans(masked) || [];
      var cursor = 0;
      for (var i = 0; i < spans.length; i++) {
        var sm = String(spans[i].s || '');
        var at = masked.indexOf(sm, cursor); if (at < 0) at = cursor;
        var orig = src.substr(at, sm.length); cursor = at + sm.length;
        if (!heroAttributed(sm, ctx)) continue;
        /* 逆接で節に割ってから当てる（節をまたぐ誤結合を防ぐ・fix414 と同形） */
        var cls = sm.split(/(?:だが|が、|しかし|一方|ものの|ただし|けれど|けど)/);
        for (var k = 0; k < cls.length; k++) {
          for (var d = 0; d < HARD_DENIAL.length; d++) {
            var mm = cls[k].match(HARD_DENIAL[d].re);
            if (!mm) continue;
            if (declBlocked(g, cls[k], mm[0])) continue;
            var p = null;
            if (HARD_DENIAL[d].part && mm[1] !== undefined && mm[2] !== undefined) p = (mm[1] || '') + mm[2];
            out.push({ cat: HARD_DENIAL[d].cat, part: p, at: i, text: orig.trim().slice(0, 60) });
          }
        }
      }
    } catch (e) { return out; }
    return out;
  }

  /* ========================================================================
   * detect(text, ctx) — 純関数 / never throw
   *   ctx = { hero, others:[名前…], prev:{karada,kizu} }
   *   返り値 = { hit, severity, decl, viol, signals:{deferredCost}, soft:[],
   *              softViolation, reason, sourceA:[], sourceB:[] }
   * ======================================================================*/
  function detect(text, ctx) {
    var out = { hit: false, severity: null, decl: null, viol: null,
                signals: { deferredCost: false }, soft: [], softViolation: false,
                reason: null, sourceA: [], sourceB: [] };
    try {
      ctx = ctx || {};
      var f741 = (ctx.__dep741 !== undefined ? ctx.__dep741 : dep741());
      var g670 = (ctx.__dep670 !== undefined ? ctx.__dep670 : dep670());
      if (!f741 || !g670) { out.reason = 'dep-missing'; return out; }      /* fail-open */

      var raw = String(text || '');
      if (!raw.trim()) { out.reason = 'empty'; return out; }
      /* 本文（地の文）だけを見る。index.html:2034 と同じ切り方（<state> は本文末尾） */
      var body = raw.split(/<react|<state|<scene_move/)[0];
      var masked = g670.maskQuotes(body);
      var spans = g670.splitSpans(masked) || [];

      /* masked と body は長さ保存なので、offset を辿って原文 span を取り出せる */
      var cursor = 0, list = [];
      for (var i = 0; i < spans.length; i++) {
        var sm = String(spans[i].s || '');
        var at = masked.indexOf(sm, cursor);
        if (at < 0) at = cursor;
        list.push({ i: i, m: sm, o: body.substr(at, sm.length) });
        cursor = at + sm.length;
      }

      /* ---- source A: 前 turn state ------------------------------------
       *  A-1: 既存 fix741.classify()（HARD は STRUCTURAL_LOSS のみ・SOFT は log）
       *  A-2: ★Rev3 / GPT 4A-1b — source B と **同じ** explicitHardConstraint() を
       *       前 turn の karada/kizu 自由文へも当てる（専用 classifier を作らない）。 */
      var prev = ctx.prev || {};
      var prevText = String(prev.karada || '') + '。' + String(prev.kizu || '');
      var clauses = splitClauses(prevText);
      for (var c = 0; c < clauses.length; c++) {
        var cls = [];
        try { cls = f741.classify(clauses[c]) || []; } catch (e) { cls = []; }
        for (var k = 0; k < cls.length; k++) {
          var it = cls[k];
          if (it.cls === 'STRUCTURAL_LOSS') {
            var cat = null, part = null;
            if (/使用不可$/.test(it.text)) {            /* {部位}使用不可 */
              cat = 'ARM'; part = it.text.replace(/使用不可$/, '');
            } else if (it.text.indexOf('走行不可') === 0) {  /* 走行不可… */
              cat = 'LOCO';
            }
            if (cat) out.sourceA.push({ via: 'fix741', cat: cat, part: part, cls: it.cls, text: it.text, clause: clauses[c] });
          } else {
            out.soft.push({ src: 'A', cls: it.cls, text: it.text });      /* SOFT = log only */
          }
        }
      }
      var aExp = explicitHardConstraint(prevText, ctx, g670);
      for (var ax = 0; ax < aExp.length; ax++)
        out.sourceA.push({ via: 'explicit', cat: aExp[ax].cat, part: aExp[ax].part,
                           cls: 'EXPLICIT_HARD_DENIAL', text: aExp[ax].text, clause: aExp[ax].text });

      /* ---- source B: 同一 output 内の明示宣言（同一 helper・宣言より後方のみ） */
      out.sourceB = explicitHardConstraint(body, ctx, g670);

      /* ---- H1 判定: HARD 宣言 → 後方の完遂 --------------------------- */
      var cands = [];
      for (var a = 0; a < out.sourceA.length; a++)
        cands.push({ src: 'A', cat: out.sourceA[a].cat, part: out.sourceA[a].part, at: -1,
                     text: out.sourceA[a].text });
      for (var b = 0; b < out.sourceB.length; b++)
        cands.push({ src: 'B', cat: out.sourceB[b].cat, part: out.sourceB[b].part,
                     at: out.sourceB[b].at, text: out.sourceB[b].text });

      /* ★Rev5: gate（否定・仮定・伝聞・引用）を span ごとに 1 度だけ評価して使い回す。
         fix670 の実装は参照のまま・regex のコピー 0。 */
      var gates = [];
      for (var gi = 0; gi < list.length; gi++) {
        var gb = null;
        try { gb = g670.gateBlocked(list[gi].m); } catch (e) { gb = null; }
        gates.push(gb);
      }
      for (var ci = 0; ci < cands.length && !out.hit; ci++) {
        var cd = cands[ci], V = VIOL[cd.cat];
        if (!V) continue;
        var opp = oppositeOf(cd.part);
        var handoff = handoffRe(cd.part);
        for (var vi = 0; vi < list.length; vi++) {
          if (vi <= cd.at) continue;                       /* 宣言より後方のみ（A は at=-1＝全体） */
          var v = list[vi];
          if (!heroAttributed(v.m, ctx)) continue;
          if (!sayHeroOk(v.o, ctx)) continue;              /* ★Rev5: 他者の <say> は採らない */
          if (violBlocked(g670, v.m)) continue;
          var am = v.m.match(V.act);
          /* ★Rev5: VOICE の act は「発話動詞」または「引用された発話そのもの」。
             （地の文が「叫んだ」と書かず 引用＋反響描写だけで大声を表す形に合わせる）*/
          if (!am && cd.cat === 'VOICE') am = v.m.match(new RegExp(MASK_CH + '{3,}'));
          if (!am) continue;                               /* act 側（能力の行使）*/
          /* ★Rev5: 非行為主体が主語の節（「光が走る」「誰かが走っている」）は採らない */
          if (cd.cat !== 'SIGHT' && NONAGENT.test(v.m.slice(0, v.m.indexOf(am[0])))) continue;
          /* 代替手段（対側の手・口・杖など）は非該当 */
          if (opp && opp.test(v.m)) continue;
          if (cd.cat !== 'SIGHT' && ALT_ETC.test(v.m)) continue;
          if (cd.cat === 'ARM' && !partActive(cd.part, list, vi, gates)) continue;
          if (cd.cat === 'BODY' && freezeReleased(list, vi)) continue;
          /* ★Rev5: outcome 側（能力が完遂したことの表層形）が別に要る */
          var oc = outcomeAt(cd.cat, V, list, vi, gates, handoff);
          if (!oc) continue;
          out.hit = true; out.severity = 'HIGH';
          out.decl = { src: cd.src, cat: cd.cat, part: cd.part, text: cd.text, at: cd.at };
          out.viol = { at: oc.at, path: oc.path, text: (oc.at === vi ? v.o.trim().slice(0, 60)
                        : (v.o.trim().slice(0, 28) + '……' + list[oc.at].o.trim().slice(0, 28))) };
          /* ---- H2 deferred-cost signature（後方 2 文以内の崩れ語・信号のみ） */
          for (var h = vi; h <= vi + 2 && h < list.length; h++) {
            if (COLLAPSE.test(list[h].m)) { out.signals.deferredCost = true; break; }
          }
          break;
        }
      }

      /* ---- SOFT × 深い計画 / 長い流暢発話 → log only（rewrite しない） */
      if (out.soft.length && !out.hit) {
        var deep = PLAN_RE.test(masked) || (new RegExp(MASK_CH + '{40,}')).test(masked);
        if (deep) { out.softViolation = true; out.reason = 'soft-log-only'; }
      }
      if (!out.hit && !out.reason) out.reason = 'no-violation';
    } catch (e) {
      out.hit = false; out.severity = null; out.reason = 'error:' + (e && e.message);
    }
    return out;
  }

  /* ========================================================================
   * telemetry（memory only ring 50 / localStorage 書込 0）
   *   ★fix740 の ring は build 記録専用の固定 shape・cap 20・push 非公開のため
   *     相乗りせず自前 ring（設計 §5「無ければ memory-only ring 50」）。
   * ======================================================================*/
  var ring = [], last = null, sessionRewrites = 0;
  function rec(o) {
    try {
      o.t = PREV ? PREV.turn : -1;          /* ★Rev4: window.S 由来の turnNo() を廃止 */
      ring.push(o); while (ring.length > RING_MAX) ring.shift();
      last = o;
    } catch (e) {}
  }

  /* ======================================================================
   * ★N1P: persistent 3 属性（傷 / 関係 / 未解決）の **parse 前** sanitise
   *      （GPT 裁定 2026-09-04 N1P・N1 の「傷のみ」を narrow に 3 属性へ拡張）
   *
   *  採用が確定した rewrite text を io.parse へ渡す **直前**に、rewrite の <state …> の
   *  **傷 / 関係 / 未解決 attribute だけ**を、同 turn の original 応答（io.text）の
   *  **同 who** の値／有無へ exact restore する。
   *    ・original に あり → rewrite の当該 attr を同じ値へ置換
   *                         （rewrite 側に無ければ同値で追加＝presence 維持）
   *    ・original に なし → rewrite の当該 attr を除去（rewrite による新規追加を禁止）
   *    ・からだ / こころ / 本能 / 目的 / その他 は 1 バイトも触らない（後勝ちのまま）
   *    ・<state> が無い／不完全（fix190 の tag 正規表現に当たらない）→ no-op
   *    ・original text が空（比較基準が取れない）→ no-op（fail-open）
   *
   *  境界の根拠（GPT 裁定 §1）: rewrite は「同 turn の矛盾を修正する二次生成」であって
   *  新しい物語イベントではない。**即時状態（からだ/こころ/本能）は最終描写に合わせて
   *  更新してよい／persistent 状態（傷/関係/未解決）は rewrite が新規作成・変更・削除して
   *  はいけない**。属性キーは live 実装に一致させてある:
   *    fix190 captureExt  FIELDS = [['傷','kizu'], ['関係','kankei'], ['未解決','mikaiketsu']]
   *    fix77  captureState は からだ/こころ/本能/目的 のみ（＝ N1P は触らない）
   *
   *  返すのは **io.parse へ渡す text だけ**。採用時に呼び出し側へ返す result は rewrite の
   *  生バイト（r2）のままなので、表示・S.turns への保存・turn.dbg.raw は 1 バイトも変わらない。
   *
   *  tag 抽出（/<state\b[^>]*?\/?>/g）と属性読取（name\s*=\s*"([^"]*)"）は
   *  fix190 captureExt・fix77 captureState と同型で、「非空の値だけが後勝ちする」
   *  （fix190 の if (v) / fix77 の if (v)）も同じにしてある。したがって sanitise 後の
   *  2 回目 capture が書く 傷/関係/未解決 は「original だけを parse した場合」と who 単位で
   *  一致する ＝ この 3 属性に関して store は一瞬も rewrite 値を持たない。
   *
   *  純関数・never throw・localStorage 書込 0・DOM 0・network 0・store も PREV も読まない。
   *  ★N1 からの唯一の実装差: 値の差し戻しに置換関数を使い、値中の "$&" 等が
   *    String.prototype.replace の特殊パターンとして解釈されないようにしてある。
   * ====================================================================*/
  var N1P_FIELDS = ['傷', '関係', '未解決'];      /* fix190 FIELDS の属性キーと同一 */

  function n1pAttr(tag, name) {                 /* fix190 attrOf と同型（trim はしない） */
    try { var m = String(tag).match(new RegExp(name + '\\s*=\\s*"([^"]*)"')); return m ? m[1] : null; }
    catch (e) { return null; }
  }
  /* original text から who -> { 属性 -> { present, eff } } を作る。
     present = その属性が 1 度でも出たか／eff = 最後の非空の値（無ければ null）。 */
  function n1pPersistentOf(originalText) {
    var map = Object.create(null);
    try {
      var re = /<state\b[^>]*?\/?>/g, m;
      while ((m = re.exec(String(originalText))) !== null) {
        var who = n1pAttr(m[0], 'who'); if (who === null) continue;
        who = who.trim(); if (!who) continue;
        for (var i = 0; i < N1P_FIELDS.length; i++) {
          var f = N1P_FIELDS[i];
          var v = n1pAttr(m[0], f); if (v === null) continue;
          if (!Object.prototype.hasOwnProperty.call(map, who)) map[who] = Object.create(null);
          if (!Object.prototype.hasOwnProperty.call(map[who], f)) map[who][f] = { present: false, eff: null };
          map[who][f].present = true;
          if (v.trim() !== '') map[who][f].eff = v;   /* 非空だけ後勝ち = capture の if (v) と同じ */
        }
      }
    } catch (e) {}
    return map;
  }
  /* tag の name 属性を value へ。1 個なら in-place 置換（属性順を保つ）・0 個なら終端の直前へ挿入。 */
  function n1pPut(tag, name, value) {
    try {
      var t = String(tag);
      var n = (t.match(new RegExp(name + '\\s*=\\s*"[^"]*"', 'g')) || []).length;
      if (n === 1) return t.replace(new RegExp(name + '\\s*=\\s*"[^"]*"'),
                                    function () { return name + '="' + value + '"'; });
      if (n > 1) t = t.replace(new RegExp('\\s*' + name + '\\s*=\\s*"[^"]*"', 'g'), '');
      var m = /(\s*)(\/?>)\s*$/.exec(t);   /* 終端直前の空白は保存する（二重空白を作らない） */
      return m ? (t.slice(0, m.index) + ' ' + name + '="' + value + '"' + t.slice(m.index)) : t;
    } catch (e) { return tag; }
  }
  function n1pDel(tag, name) {
    try { return String(tag).replace(new RegExp('\\s*' + name + '\\s*=\\s*"[^"]*"', 'g'), ''); }
    catch (e) { return tag; }
  }

  function sanitizePersistentForParse(rewriteText, originalText) {
    try {
      var t2 = String(rewriteText == null ? '' : rewriteText);
      var t1 = String(originalText == null ? '' : originalText);
      if (!t1) return t2;                        /* 比較基準なし → 触らない（fail-open） */
      if (t2.indexOf('<state') < 0) return t2;   /* <state> なし → no-op */
      var P = n1pPersistentOf(t1);
      return t2.replace(/<state\b[^>]*?\/?>/g, function (tag) {
        var who = n1pAttr(tag, 'who'); if (who === null) return tag;
        who = who.trim(); if (!who) return tag;
        var e = Object.prototype.hasOwnProperty.call(P, who) ? P[who] : null;
        var out = tag;
        for (var i = 0; i < N1P_FIELDS.length; i++) {
          var f = N1P_FIELDS[i];
          var ent = (e && Object.prototype.hasOwnProperty.call(e, f)) ? e[f] : null;
          out = (ent && ent.present) ? n1pPut(out, f, ent.eff === null ? '' : ent.eff)
                                     : n1pDel(out, f);
        }
        return out;
      });
    } catch (e) { return String(rewriteText == null ? '' : rewriteText); }   /* fail-open */
  }

  /* ---- rewrite 指示文（設計 §3 verbatim・医学語 0・severity 0） -------- */
  function instructionFor(d) {
    return '\n\n【重要・書き直し】直前の本文で「'
      + String(d.decl.text || '').slice(0, 60)
      + '」と描写した直後に「'
      + String(d.viol.text || '').slice(0, 60)
      + '」が続いています。'
      + '制約と矛盾する行動・発話の結果だけを制約に合う形（失敗・部分達成・中断・別の手段）へ書き直し、'
      + '出来事の前後・人物の性格・意図・文体・他の登場人物は変えないでください。'
      + '<state> タグも本文に合わせて出力してください。';
  }

  function ctxOf(io) {
    /* ★Rev4: window.S は参照しない。state は hook が明示的に渡した io.state だけ。 */
    var st = (io && io.state) || null;
    var hero = (io && io.hero) || heroOf(st) || (PREV && PREV.name) || '';
    var others = [];
    try {
      var cast = (st && st.cast) || {};
      Object.keys(cast).forEach(function (k) {
        if (k === 'hero') return;                    /* ★hero 自身を others に混ぜない */
        var c = cast[k];
        if (!c) return;
        if (Array.isArray(c)) {
          c.forEach(function (x) { var n2 = x && x.name; if (n2 && n2 !== hero) others.push(n2); });
          return;
        }
        var nm = c.name || (typeof c === 'string' ? c : '');
        if (nm && nm !== hero) others.push(nm);
      });
    } catch (e) {}
    /* ★source A の prev は PREV snapshot だけ。io.state / fix77 store の現在値は見ない。
       （io.prev は fixture / probe が明示注入する場合のためだけに残す。deploy hook は渡さない） */
    var prev = (io && io.prev) || prevFor(hero, st);
    return { hero: hero, others: others, prev: prev };
  }

  /* ========================================================================
   * turnHook — index.html の 1 行 hook から呼ばれる唯一の入口
   *   io = { text, plan, sys, user, api, parse(text)->{ran,result}, state }
   *   返り値: null（元採用・no-op）/ { adopted:true, plan, result }
   *
   *  ★state integrity: rewrite 本文を **採用できると確定してから** parse する。
   *    → 却下時は parsePlan が走らない = fix190/fix77 capture も走らない
   *      = store は original の capture のまま = 最終採用本文と一致。
   *    → 採用時は rewrite 本文で parse = capture が rewrite 版で走り store が収束。
   * ======================================================================*/
  function turnHook(io) {
    if (!on()) return Promise.resolve(null);                     /* 既定 OFF */
    if (!io || !io.api || typeof io.api.call !== 'function' || typeof io.parse !== 'function')
      return Promise.resolve(null);
    var d;
    try { d = detect(io.text, ctxOf(io)); } catch (e) { return Promise.resolve(null); }
    if (!d.hit) {
      if (d.softViolation || d.soft.length) rec({ k: 'log', soft: d.soft.length, reason: d.reason });
      return Promise.resolve(null);
    }
    if (sessionRewrites >= SESSION_CAP) {
      rec({ k: 'capped', decl: d.decl && d.decl.text, cap: SESSION_CAP });
      return Promise.resolve(null);
    }
    sessionRewrites++;
    var base = { k: 'rewrite', src: d.decl.src, cat: d.decl.cat,
                 decl: String(d.decl.text || '').slice(0, 40),
                 viol: String(d.viol.text || '').slice(0, 40),
                 conf: 'HIGH', deferredCost: !!d.signals.deferredCost };
    return Promise.resolve()
      .then(function () { return io.api.call(io.sys, String(io.user || '') + instructionFor(d)); })
      .then(function (r2) {
        var t2 = r2 && r2.text ? String(r2.text) : '';
        if (!t2.trim())                       { rec(Object.assign({}, base, { adopted: false, why: 'empty' })); return null; }
        if (t2.replace(/<[^>]*>/g, '').trim().length < 40)
                                              { rec(Object.assign({}, base, { adopted: false, why: 'short' })); return null; }
        if (t2.indexOf('<state') < 0)         { rec(Object.assign({}, base, { adopted: false, why: 'no-state' })); return null; }
        var d2 = detect(t2, ctxOf(io));
        if (d2.hit)                           { rec(Object.assign({}, base, { adopted: false, why: 'still-violating' })); return null; }
        /* ★N1P: parse へ渡す text の 傷 / 関係 / 未解決 attr だけを original の値／有無へ
           restore する。採用 gate（上の 4 条件）は t2 の生バイトで判定済み。表示・保存は r2 のまま。 */
        var t2p = sanitizePersistentForParse(t2, io.text);
        return Promise.resolve(io.parse(t2p)).then(function (p2) {
          if (!p2 || p2.ran === false || !p2.result)
                                              { rec(Object.assign({}, base, { adopted: false, why: 'parse-denied' })); return null; }
          rec(Object.assign({}, base, { adopted: true, why: 'ok' }));
          return { adopted: true, plan: p2.result, result: r2 };
        });
      })
      .catch(function (e) {                    /* fail-open: 例外は必ず元採用 */
        rec(Object.assign({}, base, { adopted: false, why: 'error:' + (e && e.message) }));
        return null;
      });
  }

  /* ---- ★Rev4: install なし（_parseExtensions を増やさない） ---------------
   *  Rev3 は parsePlan 先頭の拡張（snapExt）で前 turn 値を取っていたが、それは
   *  「今回の生成が返ってきた後」であり契約に合わず、かつ window.S に依存していた。
   *  Rev4 の唯一の source は index.html G.submit の beginTurnContext(S) 1 行。
   *  → Planner を wrap しない・_parseExtensions に何も足さない・plan を触らない。 */

  window.__v292Dfix797 = {
    version: BUILD,
    detect: detect,
    explicitHardConstraint: explicitHardConstraint,   /* ★Rev3: source A / B 共用 pure helper */
    beginTurnContext: beginTurnContext,               /* ★Rev4: PREV snapshot の唯一の入口 */
    turnHook: turnHook,
    status: function () {
      return { build: BUILD, on: on(), off: lsGet('v292Dfix797Off') === '1',
               dep741: !!dep741(), dep670: !!dep670(),
               prevReady: !!PREV, prevTurn: PREV ? PREV.turn : -1,
               prevHero: PREV ? PREV.name : '', prevStory: PREV ? PREV.story : '',
               sessionRewrites: sessionRewrites, cap: SESSION_CAP, last: last };
    },
    log: function () { return ring.slice(); },
    __test: {
      HARD_DENIAL: HARD_DENIAL, VIOL: VIOL, splitClauses: splitClauses,
      /* ★N1P: persistent 3 属性 sanitiser（fixture 用・純関数・読み取りのみ） */
      sanitizePersistentForParse: sanitizePersistentForParse, n1pPersistentOf: n1pPersistentOf,
      n1pAttr: n1pAttr, N1P_FIELDS: N1P_FIELDS,
      /* ★Rev5b: 宣言側 helper（fixture 用・読み取りのみ） */
      capabilityDenialRe: capabilityDenialRe, VOICE_POTENTIAL_DENIAL: VOICE_POTENTIAL_DENIAL,
      /* ★Rev5: detector 内部（fixture 用・読み取りのみ） */
      NONAGENT: NONAGENT, HARDCOST: HARDCOST, VOICE_WEAK: VOICE_WEAK,
      VOICE_BREAK: VOICE_BREAK, VOICE_LOUD: VOICE_LOUD, VIS_NEG: VIS_NEG,
      FREEZE_REL: FREEZE_REL, VOICE_NOCARRY: VOICE_NOCARRY, STILL_DISABLED: STILL_DISABLED,
      PROJ_FAIL: PROJ_FAIL,
      handoffRe: handoffRe, partActive: partActive,
      freezeReleased: freezeReleased, voiceOutcome: voiceOutcome, outcomeAt: outcomeAt,
      utteranceLen: utteranceLen, sayHeroOk: sayHeroOk,
      explicitHardConstraint: explicitHardConstraint, declBlocked: declBlocked,
      instructionFor: instructionFor, ctxOf: ctxOf,
      prevSnap: function () { return PREV ? { story: PREV.story, turn: PREV.turn, name: PREV.name,
                                              karada: PREV.karada, kizu: PREV.kizu } : null; },
      prevFor: prevFor, heroOf: heroOf, turnOf: turnOf,
      clearTurnContext: function () { PREV = null; },
      resetSession: function () { sessionRewrites = 0; ring.length = 0; last = null; },
      sessionRewrites: function () { return sessionRewrites; }
    }
  };
})();
