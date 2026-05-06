// v261-mobile-scroll-and-rerender-gate.js
// 目的: スマホ版の三大バグ修正
//   1. narrative / 会話ログのスクロールが renderAll の度に底に戻される
//   2. 会話ログが操作不能に感じる（2.5s毎の DOM 全置換でタップが奪われる）
//   3. スマホで送信ボタンをタップしてもターンが進まない（iOS タップ問題）
//
// 根本原因 (1)(2):
//   - v201 / v258 / v259 / v260 が setInterval で DOM 再描画を実行し、
//     その中で stream.scrollTop = stream.scrollHeight を無条件に呼ぶ
//   - v201 line 103: if (scrollHeight - scrollTop - clientHeight < 100) scrollTop = scrollHeight;
//     スクロール量が小さい panel ではユーザがどこにいても auto-bottom する
//   - v249 の scroll gate は 3秒のみ + UI._scroll しかカバーしない
//
// 根本原因 (3):
//   - inline onclick="G.submit()" のみ → iOS Safari のタップ遅延・blur レースで失われやすい
//   - 過去の submit 失敗で sendBtn.disabled / S.inFlight が stuck することがある
//   - v229 の 5秒判定 toast が「進行中なのに送信失敗」誤通知を出す
//
// 修正方針:
//   A. dialogue-stream / #story の scrollTop SETTER を override
//      → ユーザが「底にいない」状態なら、script による「底へジャンプ」を拒否
//   B. ユーザ操作（touchstart/touchmove/wheel）で「ユーザの意図」を更新
//   C. UI.renderAll を wrap して snapshot-based restore（補助的）
//   D. v258/v259 の周期 reprocessAll を chr6 hash で gate
//   E. CSS で scroll-behavior: auto / overflow-anchor: none を強制
//   F. 送信ボタンに pointerup/touchend バインド + stuck 復帰
//
// ガード: window.__v261Active

(function v261() {
  'use strict';
  if (window.__v261Active) {
    console.log('[v261] already active, skip');
    return;
  }
  window.__v261Active = true;
  console.log('[v261] mobile-scroll-and-rerender-gate init');

  var BOTTOM_THRESHOLD = 30; // px

  // ========================================================================
  // A. scrollTop setter gate — KEY FIX
  // ========================================================================
  function installScrollGate(id) {
    var el = document.getElementById(id);
    if (!el || el.__v261ScrollGated) return false;

    var origSetter = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop').set;
    var origGetter = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop').get;

    // ユーザの意図 (最後にユーザが触れた位置)
    var userScrollTop = origGetter.call(el);
    var userIsAtBottom = (el.scrollHeight - userScrollTop - el.clientHeight) < BOTTOM_THRESHOLD;
    var lastUserActionTs = 0;
    var inGate = false;

    function refreshUserIntent() {
      if (inGate) return;
      userScrollTop = origGetter.call(el);
      userIsAtBottom = (el.scrollHeight - userScrollTop - el.clientHeight) < BOTTOM_THRESHOLD;
      lastUserActionTs = Date.now();
    }

    el.addEventListener('touchstart', refreshUserIntent, { passive: true });
    el.addEventListener('touchmove', refreshUserIntent, { passive: true });
    el.addEventListener('wheel', refreshUserIntent, { passive: true });
    el.addEventListener('scroll', function () {
      if (inGate) return;
      // ユーザ起因の scroll かどうかは厳密に判別不可なので、
      // 直近 500ms にユーザ操作（touch/wheel）があればユーザ起因とみなす
      if (Date.now() - lastUserActionTs < 500) {
        userScrollTop = origGetter.call(el);
        userIsAtBottom = (el.scrollHeight - userScrollTop - el.clientHeight) < BOTTOM_THRESHOLD;
      }
    }, { passive: true });

    Object.defineProperty(el, 'scrollTop', {
      get: function () { return origGetter.call(this); },
      set: function (v) {
        if (!userIsAtBottom) {
          var maxScroll = Math.max(0, this.scrollHeight - this.clientHeight);
          // script が「底へジャンプ」しようとしている場合は拒否
          if (v >= maxScroll - 5) {
            inGate = true;
            origSetter.call(this, Math.min(userScrollTop, maxScroll));
            setTimeout(function () { inGate = false; }, 30);
            return;
          }
        }
        origSetter.call(this, v);
      },
      configurable: true
    });

    el.__v261ScrollGated = true;
    el.__v261UpdateUserIntent = refreshUserIntent;
    console.log('[v261] scroll gate installed on #' + id);
    return true;
  }

  function installAllGates() {
    installScrollGate('dialogue-stream');
    installScrollGate('story');
  }
  installAllGates();
  setTimeout(installAllGates, 500);
  setTimeout(installAllGates, 1500);
  setTimeout(installAllGates, 4000);

  // ========================================================================
  // B. v258 / v259 の周期 reprocessAll を「変化検知時のみ」に絞る
  // ========================================================================
  (function gateReprocess() {
    var lastChr6Hash = null;
    function chr6Hash() {
      try {
        var s = localStorage.getItem('chr6') || '';
        var h = 0;
        for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
        return h + ':' + s.length;
      } catch (e) { return Math.random(); }
    }
    function tryWrap(target, methodName) {
      try {
        var obj = window[target];
        if (!obj || typeof obj[methodName] !== 'function') return false;
        if (obj[methodName].__v261Gated) return true;
        var orig = obj[methodName];
        obj[methodName] = function () {
          var h = chr6Hash();
          if (arguments.length > 0) { lastChr6Hash = h; return orig.apply(this, arguments); }
          if (h === lastChr6Hash) return false;
          lastChr6Hash = h;
          return orig.apply(this, arguments);
        };
        obj[methodName].__v261Gated = true;
        console.log('[v261] gated ' + target + '.' + methodName);
        return true;
      } catch (e) { return false; }
    }
    function tryAllG() {
      tryWrap('__v258', 'reprocessAll');
      tryWrap('__v259', 'postProcessAllTurns');
      tryWrap('__v259', 'decorateCards');
    }
    tryAllG();
    var tries = 0;
    var iv = setInterval(function () {
      tryAllG();
      if (++tries > 30) clearInterval(iv);
    }, 500);
  })();

  // ========================================================================
  // C. CSS: scroll behavior 安定化
  // ========================================================================
  (function injectCSS() {
    var id = '__v261-style';
    if (document.getElementById(id)) return;
    var style = document.createElement('style');
    style.id = id;
    style.textContent = [
      '#story, #dialogue-stream {',
      '  scroll-behavior: auto !important;',
      '  overflow-anchor: none !important;',
      '  overscroll-behavior: contain !important;',
      '  -webkit-overflow-scrolling: touch !important;',
      '  touch-action: pan-y !important;',
      '}',
      'body.v101-mobile #story,',
      'body.v101-mobile #dialogue-stream {',
      '  scroll-snap-type: none !important;',
      '  contain: layout paint;',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  })();

  // ========================================================================
  // D. 送信ボタン信頼性向上（スマホ送信できないバグ対応）
  // ========================================================================
  (function reinforceSend() {
    function injectSendCSS() {
      var sid = '__v261-send-style';
      if (document.getElementById(sid)) return;
      var style = document.createElement('style');
      style.id = sid;
      style.textContent = [
        '#sendBtn, #composer .mdbtn, #composer .tbtn {',
        '  touch-action: manipulation !important;',
        '  -webkit-tap-highlight-color: rgba(160,138,240,.25);',
        '  user-select: none !important;',
        '  -webkit-user-select: none !important;',
        '}',
        '#sendBtn:not(:disabled) { pointer-events: auto !important; }',
        '#composer { position: relative; z-index: 10; }'
      ].join('\n');
      document.head.appendChild(style);
    }
    injectSendCSS();

    var lastSubmitTrigger = 0;
    var SUBMIT_DEBOUNCE_MS = 600;

    function tryReviveBtn(btn) {
      if (!btn) return;
      try {
        var inFlight = (typeof S !== 'undefined' && S.inFlight) === true;
        if (btn.disabled && !inFlight) {
          btn.disabled = false;
          btn.textContent = '送信 ▶';
          console.log('[v261] revived stuck sendBtn');
        }
      } catch (e) {}
    }

    function triggerSubmit(reason) {
      var now = Date.now();
      if (now - lastSubmitTrigger < SUBMIT_DEBOUNCE_MS) return;
      lastSubmitTrigger = now;
      try {
        if (typeof G !== 'undefined' && typeof G.submit === 'function') {
          console.log('[v261] sendBtn submit (' + reason + ')');
          G.submit();
        }
      } catch (e) {
        console.warn('[v261] submit err:', e && e.message);
      }
    }

    function bindSendBtn() {
      var btn = document.getElementById('sendBtn');
      if (!btn) return false;
      tryReviveBtn(btn);
      if (btn.__v261SendBound) return true;

      btn.addEventListener('pointerup', function () {
        if (btn.disabled) { tryReviveBtn(btn); if (btn.disabled) return; }
        triggerSubmit('pointerup');
      }, { passive: true });

      btn.addEventListener('touchend', function () {
        if (btn.disabled) { tryReviveBtn(btn); if (btn.disabled) return; }
        triggerSubmit('touchend');
      }, { passive: true });

      btn.__v261SendBound = true;
      console.log('[v261] sendBtn pointerup/touchend bound');
      return true;
    }

    function tryAllH() {
      bindSendBtn();
      try {
        var btn = document.getElementById('sendBtn');
        if (btn) {
          if (!btn.__v261StuckTrack) btn.__v261StuckTrack = { since: 0 };
          var inFlight = (typeof S !== 'undefined' && S.inFlight) === true;
          if (btn.disabled && !inFlight) {
            if (!btn.__v261StuckTrack.since) btn.__v261StuckTrack.since = Date.now();
            else if (Date.now() - btn.__v261StuckTrack.since > 8000) {
              btn.disabled = false;
              btn.textContent = '送信 ▶';
              btn.__v261StuckTrack.since = 0;
              console.log('[v261] forcibly revived sendBtn (stuck>8s, no inFlight)');
            }
          } else { btn.__v261StuckTrack.since = 0; }
        }
      } catch (e) {}
    }
    tryAllH();
    setInterval(tryAllH, 1000);

    function patchV229() {
      try {
        if (window.__v229 && typeof window.__v229.showToast === 'function' && !window.__v229.showToast.__v261Patched) {
          var origToast = window.__v229.showToast;
          window.__v229.showToast = function (msg, color) {
            var ov = document.getElementById('v113-loading');
            var loadingOn = ov && ov.classList && ov.classList.contains('on');
            var inFlight = (typeof S !== 'undefined' && S.inFlight) === true;
            if (loadingOn || inFlight) {
              console.log('[v261] suppressed v229 toast (in flight): ' + msg);
              return;
            }
            return origToast.apply(this, arguments);
          };
          window.__v229.showToast.__v261Patched = true;
        }
      } catch (e) {}
    }
    patchV229();
    setTimeout(patchV229, 1000);
    setTimeout(patchV229, 3000);
  })();

  // ========================================================================
  // E. デバッグ用 API
  // ========================================================================
  window.__v261 = {
    installScrollGate: installScrollGate,
    installAllGates: installAllGates
  };

  console.log('[v261] init complete');
})();
