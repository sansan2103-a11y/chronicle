// v280-scream-quote-prompt.js
//
// 目的: 悲鳴・絶叫を 1 発目から引用展開させる soft prompt 注入 (v220 retry の先回り)
//
// 背景 (おしんさん 2026-05-09 報告):
//   v279 ON 状態で激痛シーンを回しても、narrative が「リナの悲鳴は止むことはなく」
//   「金切り声が迸った」のような抽象描写で終わり、会話ログ (dialogues) に
//   絶叫の中身が出てこない。v220 の retry は内部チェックで「response 中に
//   どこか long-scream パターンがあれば OK」と判定するため、前ターンからの
//   引用や小さな呻き (「んぐぅ」など) が含まれていれば retry されない。
//
// 哲学:
//   - 「禁止」より「引用展開してね」と肯定文で誘導
//   - 内容の検閲ではなく、悲鳴をプレイヤー視点で体感できる形に書かせる
//
// 動作:
//   Planner.build を wrap し、prompt 末尾に【悲鳴・絶叫の引用展開ルール】を soft 注入。
//   v279 toggle が OFF なら一切注入しない (ユーザーが scream off にしている時は黙る)。
//
// ガード: window.__v280Active

(function v280() {
  'use strict';
  if (window.__v280Active) return;
  window.__v280Active = true;
  console.log('[v280] scream-quote-prompt init');

  // ============================================================
  // soft prompt block
  // ============================================================
  function buildScreamQuoteBlock() {
    return [
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━',
      '【悲鳴・絶叫の引用展開ルール (会話ログに流すために重要)】',
      '━━━━━━━━━━━━━━━━━━━━━━━━━',
      'narrative で悲鳴・絶叫・うめき・呻吟・金切り声・叫び声・嗚咽などを書く場合、',
      '**必ず該当キャラのセリフを引用形式で展開** してください。',
      '抽象的な「○○の悲鳴が響いた」だけで終わるのは禁止。',
      '',
      '✅ 好ましい (引用展開あり — 会話ログに流れる):',
      '  > リナの喉から金切り声が迸った。リナ「ひぃぃぃっ！や、やめて、やめてぇぇ！」',
      '  > スピカの悲鳴が教室に響いた。スピカ「いやぁああ！痛い、痛いよぉっ！」',
      '  > カエデは絶叫した。カエデ「ぎゃああああ！」',
      '  > 彼女は呻き声を漏らした。リナ「んぐぅ……っ、痛、痛い……」',
      '',
      '❌ 避けたい (抽象だけ — 会話ログに何も流れない):',
      '  > 「金切り声が迸った」だけで中身なし',
      '  > 「悲鳴が響いた」だけで中身なし',
      '  > 「絶叫した」だけで中身なし',
      '  > 「呻き声を漏らした」だけで中身なし',
      '',
      '## 書き方のルール',
      '- 長音は **3 文字以上** 重ねる (「あぁぁ」「いやぁああ」「ひぃぃぃ」)',
      '- 引用形式: narrative 内なら **キャラ名「セリフ」** または **キャラ名『セリフ』**',
      '- JSON dialogues 配列に入れる場合は speaker + text に分けて',
      '- 同じ悲鳴を繰り返さず、毎ターン違う表現で (痛い系/恐怖系/絶望系/呻吟系/絶叫系を混ぜる)',
      '',
      '## 補足',
      '- これは v220 の長音絶叫ルールの先回り版。1発目から引用形式で書けば retry が不要になります。',
      '- 抽象表現を使うこと自体は OK。ただし **必ず引用展開とセット** で。',
      '━━━━━━━━━━━━━━━━━━━━━━━━━'
    ].join('\n');
  }

  // ============================================================
  // v279 toggle 連動チェック
  // ============================================================
  function isEnabled() {
    if (window.__v279 && typeof window.__v279.getEnabled === 'function') {
      return window.__v279.getEnabled();
    }
    return true;  // v279 が無ければ default ON
  }

  // ============================================================
  // Planner.build wrap
  // ============================================================
  function wrapPlanner() {
    if (typeof Planner !== 'object' || !Planner || typeof Planner.build !== 'function') return false;
    if (Planner.build.__v280Wrapped) return true;
    var orig = Planner.build.bind(Planner);
    Planner.build = function (inputType, inputText) {
      var r = orig(inputType, inputText);
      try {
        if (!isEnabled()) return r;     // v279 OFF なら何もしない
        if (r && r.sys) r.sys += '\n' + buildScreamQuoteBlock();
      } catch (e) {
        console.warn('[v280] inject err:', e && e.message);
      }
      return r;
    };
    Planner.build.__v280Wrapped = true;
    console.log('[v280] Planner.build wrapped');
    return true;
  }
  setTimeout(wrapPlanner, 0);
  setTimeout(wrapPlanner, 500);
  setTimeout(wrapPlanner, 2000);
  setTimeout(wrapPlanner, 5000);
  var tries = 0;
  var iv = setInterval(function () {
    if (wrapPlanner() || ++tries > 30) clearInterval(iv);
  }, 500);

  // ============================================================
  // API
  // ============================================================
  window.__v280 = {
    buildScreamQuoteBlock: buildScreamQuoteBlock,
    isEnabled: isEnabled
  };

  console.log('[v280] init complete');
})();
