// v250-convo-flicker-fix.js
// 目的: PC会話ログの点滅を解消
//
// 観測されたバグ:
//   v220-inline-dialogue-and-extreme-scream.js が 5 秒ごとに reprocessTurns() を実行し、
//   `changed` フラグが立つたびに UI.renderAll() を呼び出して会話ログ全体を再生成する。
//   会話カード（v101-dlg-card）が 5 秒おきに削除→再作成され、点滅として見える。
//
//   実機計測:
//     renderAll: 4996ms / 4998ms / 4998ms / 5016ms 間隔 → ほぼぴったり 5 秒周期
//     v101-dlg-card 追加: 4 秒間で 65 個（renderAll 1 回で 5 カード × 13 ターン分）
//
//   v220 はターン送信時にも reprocessTurns を呼ぶ仕組みがあるので、
//   定期実行（setInterval）は本質的に不要。ターン送信時の 1 回呼び出しで十分。
//
// 修正方針（設計原則準拠）:
//   - v220 の setInterval を停止（機能向上 / バグ修正）
//   - 「禁止」追加なし
//   - 会話カードの ID/data 比較で diff render を入れることも検討したが、
//     大規模改修になるため今回は setInterval 停止のみ
//
// ガード: window.__v250Active

(function () {
  'use strict';
  if (window.__v250Active) {
    console.log('[v250] already active, skip');
    return;
  }
  window.__v250Active = true;
  console.log('[v250] convo flicker fix active');

  // ====================================================================
  // Patch A: v220 の setInterval を全停止
  //   v220 init() 内の setInterval(reprocessTurns, 5000) を強制クリア
  // ====================================================================
  // setInterval 全 ID をスキャン → reprocessTurns を含むハンドラを止める
  // 直接 ID 取得できないので、setInterval を hook して ID をキャッシュする戦略は使えない
  // （既に v220 は init 済み）
  //
  // 代わりに reprocessTurns 自体を「最初の 1 回だけ実行する」no-op に置き換える
  if (window.__v220 && typeof window.__v220.reprocessTurns === 'function') {
    var orig = window.__v220.reprocessTurns;
    var firstCallDone = false;
    var lastChangeTime = 0;

    window.__v220.reprocessTurns = function () {
      // 最初の呼び出しは通す（v220 の 1.5s 後の setTimeout で起動時に動く）
      if (!firstCallDone) {
        firstCallDone = true;
        try { return orig.apply(this, arguments); } catch (e) {}
        return;
      }

      // 以降は「直前の変化から 30 秒以上経った」場合のみ実行
      // 通常はターン送信時に別ルートで再描画されるため、定期実行はほぼ不要
      var now = Date.now();
      if (now - lastChangeTime > 30000) {
        lastChangeTime = now;
        try { return orig.apply(this, arguments); } catch (e) {}
      }
      // それ以外はスキップ（点滅原因の renderAll を抑制）
    };
    console.log('[v250] v220.reprocessTurns wrapped (skip periodic re-render)');
  }

  // ====================================================================
  // Patch B: UI.renderAll の高頻度連続呼び出しを抑制
  //   100ms 以内の連続呼び出しは 1 回に集約（debounce）
  // ====================================================================
  if (typeof UI !== 'undefined' && typeof UI.renderAll === 'function' && !UI.renderAll.__v250Hooked) {
    var origRenderAll = UI.renderAll;
    var renderAllPending = null;
    var lastRenderAllAt = 0;

    UI.renderAll = function () {
      var args = arguments;
      var ctx = this;
      var now = Date.now();
      // 連続呼び出しを 100ms にまとめる
      if (now - lastRenderAllAt < 100) {
        // 直前の呼び出しから 100ms 以内 → debounce
        if (renderAllPending) clearTimeout(renderAllPending);
        renderAllPending = setTimeout(function () {
          renderAllPending = null;
          lastRenderAllAt = Date.now();
          try { origRenderAll.apply(ctx, args); } catch (e) { console.warn('[v250] renderAll fail', e); }
        }, 50);
        if (!window.__v250RenderAllSuppressed) window.__v250RenderAllSuppressed = 0;
        window.__v250RenderAllSuppressed++;
        return;
      }
      lastRenderAllAt = now;
      return origRenderAll.apply(ctx, args);
    };
    UI.renderAll.__v250Hooked = true;
    console.log('[v250] UI.renderAll debounced');
  }

  // ====================================================================
  // Patch C: psych-meters 関連の mutation を起こさないように DOM 削除
  //   v246 で hide にしたが、本体は残ってて IMG src/style 変更が観測されてる
  //   v247 で remove したが setInterval も止まったので、念のため定期削除を 10s に
  // ====================================================================
  function purgePsychOnce() {
    document.querySelectorAll('.psych-meters').forEach(function (el) {
      try { el.remove(); } catch (e) {}
    });
  }
  purgePsychOnce();
  // 5 秒に 1 回（v220 の 5s 周期と被らないよう少しずらす）
  // ただしこれ自体が点滅原因にならないよう、要素が無ければ即 skip する
  var v250PurgeInterval = setInterval(function () {
    var nodes = document.querySelectorAll('.psych-meters');
    if (nodes.length > 0) {
      nodes.forEach(function (el) {
        try { el.remove(); } catch (e) {}
      });
    }
  }, 10000);
  window.__v250PurgeInterval = v250PurgeInterval;

  // ====================================================================
  // Patch D: 会話ログ panel に CSS transition を一時的に切る
  //   再生成時の opacity/transform animation が点滅原因の場合に保険
  // ====================================================================
  var styleId = '__v250-noflicker';
  if (!document.getElementById(styleId)) {
    var style = document.createElement('style');
    style.id = styleId;
    style.textContent = [
      // 会話カード再生成時のフェードイン animation を切る
      '.v101-dlg-card,',
      '.dlg-card,',
      '.dialogue-card {',
      '  animation: none !important;',
      '  transition: none !important;',
      '}',
      // dialogue-stream（コンテナ）も同様
      '#dialogue-stream,',
      '.dialogue-stream {',
      '  animation: none !important;',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  console.log('[v250] convo flicker fix applied');
})();
