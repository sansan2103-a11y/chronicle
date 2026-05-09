// v282-input-priority.js
//
// 目的: プレイヤー入力 (playerText) を LLM にちゃんと拾わせる + 書き出し反復を防ぐ
//
// 背景 (おしんさん 2026-05-09 報告):
//   STORY 入力「親玉がリナに巻き付いた」と書いても、narrative が前ターンと
//   同じ「廊下の奥から現れたのは…」で始まる。プレイヤー入力が反映されず、
//   前ターン narrative の冒頭をコピーしてしまう。
//
// 原因 (Planner.build の user prompt 構造分析):
//   - 直近の流れと整合性を保ちつつ、退屈なループから脱出する方向で。
//   - [前ターン narrative 全文 ~400 字]
//   - 【プレイヤーの展開】
//   - <playerText> (1 行)
//   - ↓ 続きを書け
//   構造的に「前ターン narrative の続きを書く」モードに LLM が入ってしまい、
//   プレイヤー入力が後付け扱いになる。さらに narrative の冒頭がそのまま見える
//   ので「同じ書き出しから始まる」反復が誘発される。
//
// 哲学:
//   「制約より刺激」を維持。新しい禁止・強制を追加しない。**ラベルと位置だけ整理**。
//
// 動作:
//   Planner.build を wrap し、orig が返した r.user に対して:
//   1. 前ターン narrative の冒頭 60 字を `…` で省略 + 「(参考)」ラベル付与
//      → 書き出しコピーの源を断つ。中盤・後半は残るのでプロット連続性は保たれる
//   2. 【プレイヤーの展開】 を 【★今ターンの中身★】 ラベルに変更
//      → プレイヤー入力の重要度を視覚的に明示
//   3. 「↓ 続きを書け」を「↓ プレイヤーの新しい指示を中身として、続きを書け」に
//      → 「前ターンの続き」ではなく「プレイヤー指示の中身」と LLM に伝える
//
//   LLM への指示文言は変えていない。ラベル/位置調整のみ。禁止文言ゼロ追加。
//
// ガード: window.__v282Active

(function v282() {
  'use strict';
  if (window.__v282Active) return;
  window.__v282Active = true;
  console.log('[v282] input-priority init');

  // ============================================================
  // user プロンプト変換
  //
  // 注: User prompt には「直近の流れと整合性を保ちつつ、退屈なループから脱出する
  //     方向で。」という前置きが **2 回** 出現する (Chronicle の prompt 設計上の
  //     重複)。1 回目は過去 turn の history block 用、2 回目が「最新ターン
  //     narrative + プレイヤー入力」のセクション。**書き出し反復の元凶** は
  //     2 回目の方なので、lastIndexOf でそちらを target にする。
  // ============================================================
  var MARKER = '直近の流れと整合性を保ちつつ、退屈なループから脱出する方向で。\n';
  var END_MARKER = '\n\n【プレイヤーの展開】\n';
  var SUFFIX_MARKER = '\n\n↓ 続きを書け（地の文と台詞のみ。JSONや見出し禁止）。';

  function transformUser(u) {
    if (!u || typeof u !== 'string') return u;
    var modified = false;

    // 1. 最後の "直近の流れと整合性を保ちつつ..." 直後の narrative を冒頭省略
    var lastMarkerIdx = u.lastIndexOf(MARKER);
    if (lastMarkerIdx > -1) {
      var narrStart = lastMarkerIdx + MARKER.length;
      var narrEnd = u.indexOf(END_MARKER, narrStart);
      if (narrEnd > -1 && narrEnd > narrStart) {
        var prevNarr = u.substring(narrStart, narrEnd);
        // 既に v282 が処理済みならスキップ (idempotent)
        if (prevNarr.indexOf('(参考・直前ターンの様子') < 0) {
          var trimmed = prevNarr.length > 60 ? '…' + prevNarr.slice(60) : prevNarr;
          u = u.substring(0, narrStart) +
              '\n(参考・直前ターンの様子 / 冒頭は省略してあります)\n' +
              trimmed +
              u.substring(narrEnd);
          modified = true;
        }
      }
    }

    // 2. プレイヤー入力ラベルを強調 + 後置きの指示文を修正
    var playerLabelIdx = u.indexOf('【プレイヤーの展開】\n');
    var suffixIdx = u.indexOf(SUFFIX_MARKER, playerLabelIdx > -1 ? playerLabelIdx : 0);
    if (playerLabelIdx > -1 && suffixIdx > -1) {
      var plrStart = playerLabelIdx + '【プレイヤーの展開】\n'.length;
      var plrEnd = suffixIdx;
      var plr = u.substring(plrStart, plrEnd);
      u = u.substring(0, playerLabelIdx) +
          '【★今ターンの中身★ プレイヤーの新しい指示】\n' +
          plr +
          '\n\n↓ 上記のプレイヤーの新しい指示を中身として、続きを書け（地の文と台詞のみ。JSONや見出し禁止）。' +
          u.substring(suffixIdx + SUFFIX_MARKER.length);
      modified = true;
    }

    if (modified && !window.__v282LoggedOnce) {
      console.log('[v282] user prompt restructured (first turn logged)');
      window.__v282LoggedOnce = true;
    }
    return u;
  }

  // ============================================================
  // Planner.build wrap
  // ============================================================
  function wrapPlanner() {
    if (typeof Planner !== 'object' || !Planner || typeof Planner.build !== 'function') return false;
    if (Planner.build.__v282Wrapped) return true;
    var orig = Planner.build.bind(Planner);
    Planner.build = function (inputType, inputText) {
      var r = orig(inputType, inputText);
      try {
        if (r && r.user) r.user = transformUser(r.user);
      } catch (e) {
        console.warn('[v282] err:', e && e.message);
      }
      return r;
    };
    Planner.build.__v282Wrapped = true;
    console.log('[v282] Planner.build wrapped');
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
  // API (デバッグ用)
  // ============================================================
  window.__v282 = {
    transformUser: transformUser
  };

  console.log('[v282] init complete');
})();
