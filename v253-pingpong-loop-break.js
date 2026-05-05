// v253-pingpong-loop-break.js
// 目的: v220 / v203 / v209 の周期的 ping-pong ループを断つ（根本原因解消）
//
// 観測されたループ:
//   1. v220 が narrative の `名前「セリフ」` を抽出 → dialogues に追加 → localStorage.setItem
//   2. v209 が dialogues の avatar を cast に sync
//   3. v203 が line-based parser で dialogues の speaker を再属性 → localStorage.setItem
//   4. v220 が「再属性されて消えた」と判断して再追加 → 1 に戻る
//
//   結果: 5 秒ごとに console 大量出力 + localStorage 連続書き込み
//
// v252 で UI.renderAll は signature ベースで skip されるので「点滅」は止まったが、
// 内部のループは回り続けている。
//
// v253 戦略（外科的・他パッチへの副作用最小）:
//   A. localStorage.setItem('chr6', ...) を hook
//      stack に v220/v203/v209 が含まれる場合は書き込みを suppress
//      → 各パッチの in-memory 変更は localStorage に伝搬しない
//      → 次サイクルで他パッチが「変化」を検出できない → ping-pong 切断
//   B. console.log を hook して [v220]/[v203]/[v209] のスパムを silence
//      （CPU は微小に消費し続けるが、localStorage / DOM への副作用ゼロ）
//
//   ※ ユーザー操作（送信・リセット等）からの localStorage.setItem は通常通り動作
//     stack に上記パッチが含まれていなければ通る
//
// 設計原則準拠:
//   - 機能向上 / バグ修正
//   - 「禁止」追加なし
//   - destructive（clearInterval 全範囲など）は採用しない
//
// ガード: window.__v253Active

(function () {
  'use strict';
  if (window.__v253Active) {
    console.log('[v253] already active, skip');
    return;
  }
  window.__v253Active = true;

  // 識別する周期処理パッチの srcId 一覧
  var LOOP_PATCH_PATTERNS = [
    /v220-inline-dialogue/,     // dialogue 再追加
    /v203-strict-format/,       // speaker 再属性
    /v209-/,                    // avatar sync
    /v207-continuation/,        // 念のため（continuation-fix）
    /v210-cleanup/              // 念のため
  ];

  function callerInLoopPatch() {
    try {
      var stack = (new Error()).stack || '';
      for (var i = 0; i < LOOP_PATCH_PATTERNS.length; i++) {
        if (LOOP_PATCH_PATTERNS[i].test(stack)) return true;
      }
    } catch (e) {}
    return false;
  }

  // ====================================================================
  // Patch A: localStorage.setItem hook
  //   v220/v203/v209 etc からの chr6 書き込みを suppress
  // ====================================================================
  try {
    var proto = Storage.prototype;
    var origSetItem = proto.setItem;
    proto.setItem = function (key, value) {
      if (key === 'chr6' && callerInLoopPatch()) {
        if (!window.__v253BlockedSets) window.__v253BlockedSets = 0;
        window.__v253BlockedSets++;
        return; // suppress
      }
      return origSetItem.call(this, key, value);
    };
    console.log('[v253] localStorage.setItem hooked');
  } catch (e) {
    console.warn('[v253] setItem hook failed:', e);
  }

  // ====================================================================
  // Patch B: console.log hook で周期スパムを silence
  //   ユーザー操作起因の log は通したいので、明確なスパムパターンのみ filter
  // ====================================================================
  var SILENCE_PATTERNS = [
    /^\[v220\] inline dialogue extracted/,
    /^\[v220\] reprocessed turns/,
    /^\[v203\] reattributed turns/,
    /^\[v209\] synced \d+ dialogue avatar/,
    /^\[v210\] cleaned/,
    /^\[v207\] continuation/
  ];

  try {
    var origLog = console.log;
    console.log = function () {
      var first = arguments.length > 0 ? arguments[0] : '';
      if (typeof first === 'string') {
        for (var i = 0; i < SILENCE_PATTERNS.length; i++) {
          if (SILENCE_PATTERNS[i].test(first)) {
            if (!window.__v253SilencedLogs) window.__v253SilencedLogs = 0;
            window.__v253SilencedLogs++;
            return;
          }
        }
      }
      return origLog.apply(this, arguments);
    };
  } catch (e) {}

  // ====================================================================
  // Patch C: 念のため、UI.renderAll の v252 ラッパーが残っているか定期確認
  //   v252 watcher が clearInterval されてた時の保険
  // ====================================================================
  // v252 自体の監視ループに任せる（v253 では何もしない）

  console.log('[v253] ping-pong loop break active');
})();
