// v248-mobile-scroll-fix.js
// 目的: モバイルブラウザでのスクロール巻き戻し対策
//
// 観測されたバグ:
//   スマホでスクロール → アドレスバー縮小 → 100vh / 100dvh 値変動
//   → レイアウト再計算 → #story の scrollTop リセット
//   特に v247 の setInterval（1秒）と組み合わさって、ユーザーの読書中に
//   スクロール位置が「巻き戻る」現象が発生
//
// 修正方針:
//   1. JavaScript で実際のビューポート高を計測して CSS 変数 --v248-vh に固定
//      - resize / orientationchange / visualViewport 変化時のみ更新
//      - 高頻度更新を避けて debounce
//   2. CSS で 100vh / 100dvh を使ってる箇所を --v248-vh に置き換え（強制 !important）
//   3. body.v101-mobile / body.v100-split の height を固定値に
//   4. #story コンテナの scrollTop を resize 時に保存・復元
//
// 設計原則準拠:
//   - 機能向上 / バグ修正系
//   - 「禁止」リスト追加なし
//
// ガード: window.__v248Active

(function () {
  'use strict';
  if (window.__v248Active) {
    console.log('[v248] already active, skip');
    return;
  }
  window.__v248Active = true;
  console.log('[v248] mobile scroll fix active');

  // ====================================================================
  // Patch A: 安定したビューポート高を CSS 変数 --v248-vh に固定
  // ====================================================================
  function getStableVh() {
    // visualViewport があればそれを使う（より正確）
    if (window.visualViewport) {
      return window.visualViewport.height;
    }
    return window.innerHeight;
  }

  var lastVh = 0;
  function updateVh() {
    var newVh = getStableVh();
    // 50px 以上変化した時だけ更新（キーボード popup などの微小変動を無視）
    if (Math.abs(newVh - lastVh) < 50) return;
    lastVh = newVh;
    document.documentElement.style.setProperty('--v248-vh', newVh + 'px');
    if (!window.__v248VhUpdates) window.__v248VhUpdates = 0;
    window.__v248VhUpdates++;
  }
  updateVh();

  // resize は debounce してから更新
  var resizeTimer = null;
  function debouncedUpdate() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(updateVh, 250);
  }
  window.addEventListener('resize', debouncedUpdate);
  window.addEventListener('orientationchange', debouncedUpdate);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', debouncedUpdate);
  }

  // ====================================================================
  // Patch B: 100vh / 100dvh を CSS 変数に置き換える override スタイル
  // ====================================================================
  var styleId = '__v248-vh-override';
  if (!document.getElementById(styleId)) {
    var style = document.createElement('style');
    style.id = styleId;
    // override 値: var(--v248-vh, 100dvh) → JS が走る前は 100dvh を fallback
    style.textContent = [
      'html, body, body.v100-split, body.v101-mobile {',
      '  height: var(--v248-vh, 100dvh) !important;',
      '  max-height: var(--v248-vh, 100dvh) !important;',
      '  min-height: 0 !important;',
      '}',
      '#dialogue-stream {',
      '  max-height: calc(var(--v248-vh, 100dvh) - 280px) !important;',
      '}',
      '#settingsPanel {',
      '  max-height: calc(var(--v248-vh, 100dvh) - 32px) !important;',
      '}',
      // 補助: スクロール挙動を安定化
      '#story {',
      '  overflow-anchor: none !important;',
      '  scroll-behavior: auto !important;',
      '  -webkit-overflow-scrolling: touch !important;',
      '  overscroll-behavior: contain !important;',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  // ====================================================================
  // Patch C: scrollTop 保存・復元（reflow 時の巻き戻し防止）
  //   ユーザーが読書中の位置を覚えておき、unwanted な reset があれば戻す
  // ====================================================================
  function installScrollGuard() {
    var s = document.getElementById('story');
    if (!s) return false;

    var lastUserScrollTop = 0;
    var isUserScrolling = false;
    var isAtBottom = true;
    var userScrollTimer = null;

    // ユーザーのスクロールを検知
    s.addEventListener('scroll', function () {
      isUserScrolling = true;
      lastUserScrollTop = s.scrollTop;
      isAtBottom = (s.scrollHeight - s.scrollTop - s.clientHeight) < 30;
      if (userScrollTimer) clearTimeout(userScrollTimer);
      userScrollTimer = setTimeout(function () {
        isUserScrolling = false;
      }, 200);
    }, { passive: true });

    // resize / レイアウト変動時に位置を復元
    var observer = new ResizeObserver(function () {
      // ユーザーが読書中で、底にいない場合のみ位置を復元
      if (!isAtBottom && !isUserScrolling) {
        // しばらく時間をおいて確認（レイアウト再計算後）
        setTimeout(function () {
          if (!isUserScrolling && Math.abs(s.scrollTop - lastUserScrollTop) > 30) {
            s.scrollTop = lastUserScrollTop;
            if (!window.__v248ScrollRestores) window.__v248ScrollRestores = 0;
            window.__v248ScrollRestores++;
          }
        }, 100);
      }
    });
    observer.observe(s);
    window.__v248ResizeObserver = observer;
    return true;
  }
  if (!installScrollGuard()) {
    var iv = setInterval(function () {
      if (installScrollGuard()) clearInterval(iv);
    }, 200);
    setTimeout(function () { clearInterval(iv); }, 30000);
  }
})();
