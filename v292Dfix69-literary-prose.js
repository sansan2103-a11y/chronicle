// =====================================================================
// Chronicle TRPG - v292Dfix69: literary-prose system addendum (iter2)
// ---------------------------------------------------------------------
// 目的:
//   narrative が淡々・stage-direction 風に書かれる問題を解決。
//   「痛い！やめて！」のような映画台詞ではなく、実際の生理反応を
//   時間軸で staging させる。
//
// 真因（fix68 デプロイ後の実機検証で確認）:
//   現行 prompt は (1) atmospheric padding 抑制, (2) cast/coreFear 活用,
//   (3) speaker 整合 などは指示するが、craft レベルの guide が無い。
//   結果として LLM は:
//     - 感情を直接命名する（「○○を恐れた」「○○を感じた」）
//     - 衝撃直後に完成された一文を発話させる（「痛い！何をするの！」）
//     - 五感が視覚偏重
//     - 抽象名詞のまま（「縄」「木」「声」）
//     - 不随意な身体信号を書かない（指先・呼吸・視線など）
//     - 末尾に説明的 summary を置く（「彼女は X を恐れた」）
//
// 修正方針 (Planner._extensions に push、system prompt に追記):
//   Tier A（全ターン適用）:
//     - Show, not tell
//     - 五感の混入（視覚以外を最低1つ）
//     - 素材・質感の具体化
//     - 不随意な身体信号
//     - ペーシング
//     - 末尾説明 summary 禁止
//   Tier B（衝撃・痛み・暴力時のみ厳格適用）:
//     - Stage 0 / 1 / 2 / 3 の時間軸 staging
//     - Stage 3: 最初の発話は沈黙 / 「⋯⋯」 / 半完成単語のみ。
//       完成された文（「痛い！」「やめて！」「何をするの！」）絶対禁止
//   wound integration:
//     - 各キャラの wound に応じたリアクション傾向を明示指示
//     - 「感情を切り離して」キャラ → 痛みで叫ばない
//     - 「裏切られた」wound → 過去のフラッシュが先に来る
//
// 実機検証 (iter2, Chrome MCP):
//   DO「サクラの腕をひねり上げる」→
//     「フィオナはサクラの腕をひねり上げた。サクラの関節が不自然な角度に
//     曲がり、骨が軋む音が廃墟の静寂に響いた。彼女の顔から血の気が引いて
//     いく。…」
//     「⋯⋯っ、は、」← Stage 3 strict 適用、完成文なし
//
//   対照 (iter1 / fix69 無し):
//     「サクラは痛みに顔を歪め、息を飲んだ」（tell）
//     「⋯⋯っ、痛い！何をするの、フィオナさん！」（即時完成文）
//
// 互換性:
//   - fix50..68 は触らない（純追加 system addendum）
//   - flag: window.__v292Dfix69LiteraryActive
//   - addendum は Planner._extensions[末尾] に push（既存の system rules
//     の後ろに追加されるので、最新ルールが LLM の attention に近い）
// =====================================================================
(function v292Dfix69_literary(){
  'use strict';
  if (window.__v292Dfix69LiteraryActive) return;

  var TAG = '[v292Dfix69:literary-prose]';

  var ADDENDUM = '\n\n' +
    '【物語の質感ガイド（fix69）— 最優先ルール】\n' +
    '\n' +
    '■ 大原則: Show, not tell — 感情・状態の直接命名は禁止\n' +
    '禁止表現リスト（末尾説明・内省命名はとくに駆逐）:\n' +
    '- 「○○を恐れた / 感じた / 思い出した / 見た（比喩でなく心理として）」\n' +
    '- 「○○な表情を浮かべた / 視線を向けた / 表情だった」\n' +
    '- 「○○の色が混じっていた / 漂っていた」\n' +
    '- 「○○に震えていた」「彼女は○○と考えた」「○○を聞いていた」\n' +
    '- narrative の末尾に説明的 summary（「彼女は X を恐れた」「彼女は X を見た」）を置かない。physical action / sensory detail で締める\n' +
    '\n' +
    '代わりに body signal で示す: 指先が冷える / 呼吸が浅くなる / 視線が床へ落ちる / 喉が動く / 姿勢が崩れる / 肩が硬くなる / 唇が乾く / 瞳孔が広がる\n' +
    '部位を特定: 「彼女の顔」→「眉間の翳り、頬骨の影、唇の端、瞳孔の動き」\n' +
    '\n' +
    '■ 五感の混入 — 毎ターン視覚以外を最低 1 つ\n' +
    '触覚 / 聴覚 / 嗅覚 / 体性感覚 のどれかを必ず織り込む\n' +
    '\n' +
    '■ 素材・質感の具体化 — 抽象名詞を避ける\n' +
    '「縄」→「麻縄」 / 「木」→「朽ちた檜の梁」 / 「声」→「掠れた喉音」「乾いた声」「半分の音」\n' +
    '\n' +
    '■ 不随意な身体信号を必ず含む — 漏れ出る方を優先\n' +
    '「警戒した」→「肩が一瞬硬くなり、すぐ戻った」 / 「動揺した」→「指が縄を握り直した」\n' +
    '\n' +
    '■ ペーシング — 重要な瞬間は短い文で間を取る\n' +
    '\n' +
    '■ 身体接触・痛み・暴力・衝撃時の時間軸 staging（厳格適用）\n' +
    '- Stage 0 (衝撃, 0.1秒): 不随意のみ — 首/視界/呼吸の急変、意志は介在しない\n' +
    '- Stage 1 (感覚到来, 0.5-2秒): 痛みの種類を具体化（鋭い/鈍い/熱/痺れ/響き/遅れて広がる/脈打つ）、変化した身体部位を特定\n' +
    '- Stage 2 (cognition の遅延, 数秒): 言葉にならない、喉の音、不完全な単語、舌が動かない\n' +
    '\n' +
    '■ Stage 3 (発話) — 厳格ルール（重要）\n' +
    '物理的衝撃・痛みを受けた直後の **最初の dialogue** は、以下のどれかでなければならない:\n' +
    '  (a) 沈黙のままターン終了（dialogue なし）\n' +
    '  (b) 「⋯⋯」「…」のような無音\n' +
    '  (c) 半完成単語・息音・呻きのみ（「あ⋯⋯」「⋯⋯っ」「く⋯⋯」「ぁ⋯⋯」「は、」など、句点・感嘆符・問号で終わらない）\n' +
    '【絶対禁止】完成された一文を最初の発話にする：\n' +
    '  ✗「痛い！何をするの！」 ✗「やめて！」 ✗「待って！」 ✗「さん、どうして！」 ✗「○○、止めて！」\n' +
    '完成された protest は最低 1 段階（沈黙か息音）を挟んでから出す。即時には出さない。\n' +
    '\n' +
    '■ wound 整合性（各キャラの傷を尊重）\n' +
    '各キャラのリアクション傾向は、wound フィールドから導出する:\n' +
    '- 「感情を切り離して生きている」キャラ: 痛みで叫ばない。沈黙・呼吸の制御・視線の固定で表現。声を上げるとしても controlled で短い\n' +
    '- 「裏切られた / 信仰の崩壊」wound: 攻撃される時、過去の声・記憶のフラッシュが先に来る。今の痛みより過去が頭で鳴る\n' +
    '- 「責任を引きずる」wound: 自分が傷つけられても他者の安否へ意識が逴れる\n' +
    '- coreFear に直接対応する攻撃の場合、不随意反応はさらに激しい（呼吸停止 / 視野狭窄 / 解離）\n' +
    '\n' +
    '■ 分量と密度: 1 ターン 5〜10 文。過度な装飾は避け、具体性で勝負する';

  function getPlanner(){
    try { return (0, eval)('typeof Planner !== "undefined" ? Planner : null'); }
    catch(e){ return null; }
  }

  function literaryExtension(ctx) {
    try {
      if (ctx && typeof ctx.sys === 'string') {
        return ctx.sys + ADDENDUM;
      }
    } catch(e){}
    return ctx && ctx.sys;
  }
  literaryExtension.__v292Dfix69 = true;

  function install(){
    var P = getPlanner();
    if (!P || !Array.isArray(P._extensions)){
      setTimeout(install, 200);
      return false;
    }
    // 既存の同名フックを除く
    P._extensions = P._extensions.filter(function(f){ return !(f && f.__v292Dfix69); });
    P._extensions.push(literaryExtension);
    try { console.log(TAG, 'installed, extCount=', P._extensions.length); } catch(_){}
    return true;
  }

  // selfHeal: 配列 replace されても残る
  function selfHeal(){
    try {
      var P = getPlanner();
      if (!P || !Array.isArray(P._extensions)) return;
      var has = false;
      for (var i = 0; i < P._extensions.length; i++){
        if (P._extensions[i] && P._extensions[i].__v292Dfix69){ has = true; break; }
      }
      if (!has) P._extensions.push(literaryExtension);
    } catch(e){}
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', install);
  } else {
    install();
  }
  setTimeout(install, 400);
  setTimeout(install, 1500);
  setTimeout(install, 4000);
  setInterval(selfHeal, 2000);

  window.__v292Dfix69LiteraryActive = true;
  try { console.log(TAG, 'loaded'); } catch(_){}
})();
