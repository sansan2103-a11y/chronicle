// v261-mobile-scroll-and-rerender-gate.js
// 目的: スマホ版の三大バグ修正
//   1. narrative / 会話ログのスクロールが renderAll の度に底に戻される
//   2. 会話ログが操作不能に感じる（2.5s毎の DOM 全置換でタップが奪われる）
//   3. スマホで送信ボタンをタップしてもターンが進まない（iOS タップ問題）
//
// 根本原因 (1)(2):
//   - v258 / v259 / v260 が setInterval で UI.renderAll() を周期実行
//   - UI.renderAll は連鎖 hook 経由で各種 rerenderStream() を呼ぶ
//   - rerenderStream() は無条件に dialogue-stream.innerHTML = "" → scrollTop = scrollHeight
//   - v249 の scroll gate は 3秒のみ + UI._scroll しかカバーしない
//
// 根本原因 (3):
//   - inline onclick="G.submit()" のみ → iOS Safari のタップ遅延・blur レースで失われやすい
//   - 過去の submit 失敗で sendBtn.disabled / S.inFlight が stuck することがある
//   - v229 の 5秒判定 toast が「進行中なのに送信失敗」誤通知を出す
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
  // A. パネル状態トラッカ
  // ========================================================================
  var panels = {};

  function trackPanel(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    if (panels[id] && panels[id].el === el && panels[id].__attached) return panels[id];

    var p = {
      el: el,
      scrollTop: el.scrollTop,
      isAtBottom: (el.scrollHeight - el.scrollTop - el.clientHeight) < BOTTOM_THRESHOLD,
      __attached: true,
      lastUserAction: 0
    };

    function refresh() {
      p.scrollTop = el.scrollTop;
      p.isAtBottom = (el.scrollHeight - el.scrollTop - el.clientHeight) < BOTTOM_THRESHOLD;
    }

    el.addEventListener('scroll', function () {
      if (p.__suppressUserUpdate) return;
      p.lastUserAction = Date.now();
      refresh();
    }, { passive: true });

    el.addEventListener('touchstart', function () { p.lastUserAction = Date.now(); }, { passive: true });
    el.addEventListener('touchmove', function () { p.lastUserAction = Date.now(); }, { passive: true });
    el.addEventListener('wheel', function () { p.lastUserAction = Date.now(); }, { passive: true });

    panels[id] = p;
    return p;
  }

  function trackAll() {
    trackPanel('story');
    trackPanel('dialogue-stream');
  }
  trackAll();
  setTimeout(trackAll, 500);
  setTimeout(trackAll, 1500);
  setTimeout(trackAll, 4000);

  // ========================================================================
  // B. scrollTop 復元ヘルパ
  // ========================================================================
  function restorePanel(p) {
    if (!p || !p.el) return;
    var el = p.el;
    if (p.isAtBottom) {
      var target = Math.max(0, el.scrollHeight - el.clientHeight);
      if (Math.abs(el.scrollTop - target) > 1) {
        p.__suppressUserUpdate = true;
        el.scrollTop = target;
        setTimeout(function () { p.__suppressUserUpdate = false; }, 80);
      }
    } else {
      var t = Math.max(0, Math.min(p.scrollTop, el.scrollHeight - el.clientHeight));
      if (Math.abs(el.scrollTop - t) > 1) {
        p.__suppressUserUpdate = true;
        el.scrollTop = t;
        setTimeout(function () { p.__suppressUserUpdate = false; }, 80);
      }
    }
  }

  function restoreAll() {
    Object.keys(panels).forEach(function (k) { restorePanel(panels[k]); });
  }

  // ========================================================================
  // C. UI.renderAll / appendTurn ラップ
  // ========================================================================
  function snapshotPanels() {
    Object.keys(panels).forEach(function (k) {
      var p = panels[k];
      if (!p || !p.el) return;
      p.scrollTop = p.el.scrollTop;
      p.isAtBottom = (p.el.scrollHeight - p.el.scrollTop - p.el.clientHeight) < BOTTOM_THRESHOLD;
    });
  }

  function wrapRenderAll() {
    if (typeof UI !== 'object' || !UI || typeof UI.renderAll !== 'function') return false;
    if (UI.renderAll.__v261Wrapped) return true;
    var orig = UI.renderAll.bind(UI);
    UI.renderAll = function () {
      snapshotPanels();
      var r;
      try { r = orig.apply(this, arguments); } catch (e) { console.warn('[v261] renderAll err', e); }
      restoreAll();
      requestAnimationFrame(restoreAll);
      setTimeout(restoreAll, 0);
      setTimeout(restoreAll, 16);
      setTimeout(restoreAll, 50);
      setTimeout(restoreAll, 120);
      setTimeout(restoreAll, 250);
      return r;
    };
    UI.renderAll.__v261Wrapped = true;
    console.log('[v261] UI.renderAll wrapped');
    return true;
  }

  function wrapAppendTurn() {
    if (typeof UI !== 'object' || !UI || typeof UI.appendTurn !== 'function') return false;
    if (UI.appendTurn.__v261Wrapped) return true;
    var orig = UI.appendTurn.bind(UI);
    UI.appendTurn = function () {
      snapshotPanels();
      var r;
      try { r = orig.apply(this, arguments); } catch (e) { console.warn('[v261] appendTurn err', e); }
      restoreAll();
      requestAnimationFrame(restoreAll);
      setTimeout(restoreAll, 50);
      setTimeout(restoreAll, 200);
      return r;
    };
    UI.appendTurn.__v261Wrapped = true;
    console.log('[v261] UI.appendTurn wrapped');
    return true;
  }

  function wrapUI() {
    var ok1 = wrapRenderAll();
    var ok2 = wrapAppendTurn();
    return ok1 && ok2;
  }

  if (!wrapUI()) {
    var iv = setInterval(function () {
      if (wrapUI()) { clearInterval(iv); }
    }, 200);
    setTimeout(function () { clearInterval(iv); }, 30000);
  }

  // ========================================================================
  // D. MutationObserver
  // ========================================================================
  function installStreamObserver() {
    var stream = document.getElementById('dialogue-stream');
    if (!stream) return false;
    if (stream.__v261Observed) return true;
    var p = trackPanel('dialogue-stream');
    if (!p) return false;
    var pending = false;
    var mo = new MutationObserver(function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        restorePanel(p);
      });
    });
    mo.observe(stream, { childList: true, subtree: false });
    stream.__v261Observed = true;
    console.log('[v261] dialogue-stream observer installed');
    return true;
  }

  function installStoryObserver() {
    var story = document.getElementById('story');
    if (!story) return false;
    if (story.__v261Observed) return true;
    var p = trackPanel('story');
    if (!p) return false;
    var pending = false;
    var mo = new MutationObserver(function (mutations) {
      var relevant = false;
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if ((m.addedNodes && m.addedNodes.length) || (m.removedNodes && m.removedNodes.length)) {
          relevant = true; break;
        }
      }
      if (!relevant) return;
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        restorePanel(p);
      });
    });
    mo.observe(story, { childList: true, subtree: false });
    story.__v261Observed = true;
    console.log('[v261] #story observer installed');
    return true;
  }

  function installObservers() {
    installStreamObserver();
    installStoryObserver();
  }
  installObservers();
  setTimeout(installObservers, 800);
  setTimeout(installObservers, 2500);
  setTimeout(installObservers, 6000);

  // ========================================================================
  // E. v258 / v259 の周期 reprocessAll を「変化検知時のみ」に絞る
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
          if (arguments.length > 0) {
            lastChr6Hash = h;
            return orig.apply(this, arguments);
          }
          if (h === lastChr6Hash) {
            return false;
          }
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
    var iv2 = setInterval(function () {
      tryAllG();
      if (++tries > 30) clearInterval(iv2);
    }, 500);
  })();

  // ========================================================================
  // F. CSS: スクロール挙動の安定化
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
  // G. デバッグ用 API
  // ========================================================================
  window.__v261 = {
    panels: panels,
    restoreAll: restoreAll,
    trackPanel: trackPanel
  };

  // ========================================================================
  // H. スマホ送信ボタン信頼性向上（追加報告対応）
  //    - touch-action: manipulation で 300ms delay 排除
  //    - pointerup / touchend に直接 submit を bind
  //    - sendBtn.disabled が stuck (>8s かつ S.inFlight=false) なら強制復帰
  //    - 二重発火防止 600ms debounce
  //    - v229 の誤発火 toast を抑制
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
        if (btn.disabled) {
          tryReviveBtn(btn);
          if (btn.disabled) return;
        }
        triggerSubmit('pointerup');
      }, { passive: true });

      btn.addEventListener('touchend', function () {
        if (btn.disabled) {
          tryReviveBtn(btn);
          if (btn.disabled) return;
        }
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
          } else {
            btn.__v261StuckTrack.since = 0;
          }
        }
      } catch (e) {}
    }
    tryAllH();
    setInterval(tryAllH, 1000);

    // v229 の誤発火 toast 抑制
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

  console.log('[v261] init complete');
})();
