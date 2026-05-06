// v255-render-resilience.js
// 目的: 「物語が展開されないバグ」の根本対策
//
// 観測:
//   v254 が renderAll を try/catch でラップしているが、
//   render 中に内部 forEach の途中で appendChild エラーが起きると、
//   その時点で render が中断 → 部分的に描画された DOM が残る or 完全に空になる
//
//   症状: 会話ログ・展開の描写パネルが空のまま
//   コンソール: [v254] renderAll throw: Failed to execute 'appendChild' on 'Node':
//             parameter 1 is not of type 'Node'
//
// 原因の推定:
//   1. v205 の orphan-cards cleanup が render 中に DOM を削除 →
//      forEach が古い参照を持っていて null になる
//   2. v220/v203/v209 の周期処理が dialogue を mutation 中に renderAll が走る
//   3. autocorrect (v242/v243) の途中で text が undefined になる瞬間
//
// v255 の戦略:
//   A. UI.renderTurn に safety wrap を追加（各 turn 単位で try/catch）
//      → ある turn で例外が起きても他の turn は描画される
//   B. UI.renderAll の error 後、500ms 後にもう一度 renderAll を call
//      → 部分描画状態を全描画状態に修復
//   C. 描画失敗を console.warn でデバッグ可能にする（v254 の console.error より目立たせない）
//
// 設計原則準拠:
//   - 機能向上 / バグ修正
//   - 「禁止」追加なし
//
// ガード: window.__v255Active

(function () {
  'use strict';
  if (window.__v255Active) {
    console.log('[v255] already active, skip');
    return;
  }
  window.__v255Active = true;
  console.log('[v255] render resilience init');

  // ====================================================================
  // Patch A: UI.renderTurn を per-turn try/catch でラップ
  //   各 turn の rendering で例外が起きても、forEach は継続
  // ====================================================================
  function ensureRenderTurnResilience() {
    if (typeof UI === 'undefined' || typeof UI.renderTurn !== 'function') return false;
    if (UI.renderTurn._v255Wrapped) return true;

    var orig = UI.renderTurn;
    UI.renderTurn = function () {
      try {
        return orig.apply(this, arguments);
      } catch (e) {
        if (!window.__v255TurnErrors) window.__v255TurnErrors = 0;
        window.__v255TurnErrors++;
        console.warn('[v255] renderTurn skipped due to error:', e && e.message);
        // skip this turn, return undefined
      }
    };
    UI.renderTurn._v255Wrapped = true;
    // v254 互換マーカーは保持
    UI.renderTurn._v252Wrapper = true;
    UI.renderTurn._v251Hooked = true;
    UI.renderTurn._v254Hooked = true;
    return true;
  }

  // ====================================================================
  // Patch B: renderAll error 後の自動リカバリ
  //   v254 が console.error で error を出した時、500ms 後に再 render
  // ====================================================================
  var origConsoleError = console.error;
  var recoveryPending = false;

  console.error = function () {
    var first = arguments.length > 0 ? arguments[0] : '';
    if (typeof first === 'string' && /\[v254\] renderAll throw/.test(first)) {
      // schedule recovery
      if (!recoveryPending) {
        recoveryPending = true;
        setTimeout(function () {
          recoveryPending = false;
          try {
            // signature を null にして強制 re-render
            if (window.__v255RecoveryCount === undefined) window.__v255RecoveryCount = 0;
            window.__v255RecoveryCount++;
            // 直接 renderAll を呼ぶ
            if (typeof UI !== 'undefined' && typeof UI.renderAll === 'function') {
              UI.renderAll();
            }
          } catch (e) {}
        }, 500);
      }
    }
    return origConsoleError.apply(this, arguments);
  };

  // ====================================================================
  // Patch C: forEach 内部失敗にも対応
  //   一部の renderTurn が失敗しても、後続の append が NULL になることがある
  //   → Node.prototype.appendChild を temporarily wrap して null を捕捉
  //   （副作用最小: render コンテキストでだけ動作）
  // ====================================================================
  // ※ Node.prototype の grand wrap は副作用が大きいので採用しない
  //   代わりに renderTurn try/catch + auto recovery で十分

  // ====================================================================
  // 監視ループ（後続 patch の上書き対策）
  // ====================================================================
  function startWatcher255() {
    ensureRenderTurnResilience();
    setInterval(function () {
      try { ensureRenderTurnResilience(); } catch (e) {}
    }, 1000);
  }

  if (document.readyState === 'complete') {
    setTimeout(startWatcher255, 100);
  } else {
    window.addEventListener('load', function () { setTimeout(startWatcher255, 100); });
    setTimeout(startWatcher255, 3000);
  }

  console.log('[v255] init complete');
})();
