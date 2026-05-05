// v249-scroll-stabilize.js
// 目的: スマホスクロール巻き戻しの根本対策（v248 の ResizeObserver を撤去 + 別アプローチ）
//
// 理論:
//   v248 の ResizeObserver による「scrollTop 復元」が、モバイルの visualViewport 微小変動で
//   過剰に発火していた可能性。撤去して以下のシンプルな対策に置き換える:
//
//   1. v248 の ResizeObserver を停止
//   2. v247 の setInterval（psych-meters purge）を停止 → CSS のみに任せる
//      → 周期的なレイアウト変動を完全に止める
//   3. UI._scroll をフックして「ユーザーが読書中」なら呼ばれてもスキップ
//      → 読書中にだけ強制 auto-scroll を抑制
//   4. CSS で body / #story を完全に固定化
//
// 設計原則準拠:
//   - 機能向上 / バグ修正
//   - 「禁止」ではなく「条件付き抑制」
//
// ガード: window.__v249Active

(function () {
  'use strict';
  if (window.__v249Active) {
    console.log('[v249] already active, skip');
    return;
  }
  window.__v249Active = true;
  console.log('[v249] scroll stabilize active');

  // ====================================================================
  // Patch A: v248 / v247 の周期処理を停止
  // ====================================================================
  if (window.__v248ResizeObserver) {
    try { window.__v248ResizeObserver.disconnect(); } catch (e) {}
    window.__v248ResizeObserver = null;
    console.log('[v249] v248 ResizeObserver disconnected');
  }
  if (window.__v247PurgeInterval) {
    try { clearInterval(window.__v247PurgeInterval); } catch (e) {}
    window.__v247PurgeInterval = null;
    console.log('[v249] v247 purge interval cleared');
  }

  // ====================================================================
  // Patch B: より強力な CSS でレイアウト固定
  // ====================================================================
  var styleId = '__v249-stabilize';
  if (!document.getElementById(styleId)) {
    var style = document.createElement('style');
    style.id = styleId;
    style.textContent = [
      // body は完全固定
      'html { height: var(--v248-vh, 100dvh) !important; max-height: var(--v248-vh, 100dvh) !important; overflow: hidden !important; }',
      'body { height: var(--v248-vh, 100dvh) !important; max-height: var(--v248-vh, 100dvh) !important; min-height: 0 !important; overflow: hidden !important; position: relative !important; }',
      // #story はスムーズスクロールも巻き戻し原因なので無効化
      '#story {',
      '  overflow-anchor: none !important;',
      '  scroll-behavior: auto !important;',
      '  -webkit-overflow-scrolling: touch !important;',
      '  overscroll-behavior: none !important;',
      '  touch-action: pan-y !important;',
      '  scroll-snap-type: none !important;',
      '}',
      // psych-meters は v247 の CSS で既に消えてる前提
      '.psych-meters, .pmeter, .pmeter-label { display: none !important; visibility: hidden !important; height: 0 !important; }'
    ].join('\n');
    document.head.appendChild(style);
  }

  // ====================================================================
  // Patch C: UI._scroll の制御
  //   ユーザーが読書中（最近スクロールした、底にいない）なら強制スクロールを抑制
  // ====================================================================
  function installScrollGate() {
    if (typeof UI === 'undefined' || typeof UI._scroll !== 'function') return false;
    if (UI._scroll.__v249Hooked) return true;

    var orig = UI._scroll;
    var s = document.getElementById('story');
    var lastUserTouch = 0;
    var isAtBottom = true;

    if (s) {
      s.addEventListener('scroll', function () {
        lastUserTouch = Date.now();
        isAtBottom = (s.scrollHeight - s.scrollTop - s.clientHeight) < 30;
      }, { passive: true });
      s.addEventListener('touchstart', function () {
        lastUserTouch = Date.now();
      }, { passive: true });
      s.addEventListener('wheel', function () {
        lastUserTouch = Date.now();
      }, { passive: true });
    }

    UI._scroll = function () {
      var sinceTouch = Date.now() - lastUserTouch;
      // ユーザーが直近 3 秒以内にスクロール/タッチしていて、かつ底にいないなら抑制
      if (sinceTouch < 3000 && !isAtBottom) {
        if (!window.__v249ScrollSuppressed) window.__v249ScrollSuppressed = 0;
        window.__v249ScrollSuppressed++;
        return; // 強制 auto-scroll を skip
      }
      return orig.apply(this, arguments);
    };
    UI._scroll.__v249Hooked = true;
    return true;
  }
  if (!installScrollGate()) {
    var iv = setInterval(function () {
      if (installScrollGate()) clearInterval(iv);
    }, 200);
    setTimeout(function () { clearInterval(iv); }, 30000);
  }

  // ====================================================================
  // Patch D: psych-meters は CSS のみで対処（v247 setInterval 撤去後）
  //   一度だけ削除（再生成された場合は CSS が hide する）
  // ====================================================================
  document.querySelectorAll('.psych-meters').forEach(function (el) {
    el.remove();
  });
})();
