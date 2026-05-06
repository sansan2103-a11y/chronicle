// v263-momentum-scroll-fix.js
// 目的: スマホで会話ログを最新まで (慣性スクロールで底まで) 飛ばすと最初に戻されるバグ修正
//
// 根本原因:
//   v261 の scrollTop gate は「touchstart/touchmove/wheel から 500ms 以内の scroll
//   だけを user scroll」と判定していた。スマホの慣性スクロールは指を離してから
//   1〜2 秒続くため、500ms 経過後の慣性 scroll を script scroll と誤認 →
//   userIsAtBottom が更新されず、その後 script (v201 等) が scrollTop=scrollHeight
//   を呼ぶと gate が拒否し、保存していた古い scrollTop (=0) に巻き戻す。
//
// 修正方針:
//   user/script の判別を「直近 setter 呼び出しから 50ms 以内か」に変更。
//   - script は scrollTop setter を経由するので、setter 呼び出し時刻を記録
//   - scroll event がその直後 (50ms以内) に来たら script 起因 → 無視
//   - それ以外 (touchstart 後の慣性含む) は全て user/momentum 起因として state 更新
//
// ガード: window.__v263Active

(function v263() {
  'use strict';
  if (window.__v263Active) {
    console.log('[v263] already active, skip');
    return;
  }
  window.__v263Active = true;
  console.log('[v263] momentum-scroll-fix init');

  var BOTTOM_THRESHOLD = 30;
  var SCRIPT_SCROLL_WINDOW_MS = 50;

  function reinstallScrollGate(id) {
    var el = document.getElementById(id);
    if (!el) return false;
    if (el.__v263ScrollGated) return true;

    try {
      var existed = Object.getOwnPropertyDescriptor(el, 'scrollTop');
      if (existed) delete el.scrollTop;
    } catch (e) {}

    var origSetter = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop').set;
    var origGetter = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop').get;

    var userScrollTop = origGetter.call(el);
    var userIsAtBottom = (el.scrollHeight - userScrollTop - el.clientHeight) < BOTTOM_THRESHOLD;
    var lastScriptSetterAt = 0;
    var inGate = false;

    el.addEventListener('scroll', function () {
      if (inGate) return;
      if (Date.now() - lastScriptSetterAt < SCRIPT_SCROLL_WINDOW_MS) return;
      userScrollTop = origGetter.call(el);
      userIsAtBottom = (el.scrollHeight - userScrollTop - el.clientHeight) < BOTTOM_THRESHOLD;
    }, { passive: true });

    Object.defineProperty(el, 'scrollTop', {
      get: function () { return origGetter.call(this); },
      set: function (v) {
        if (!userIsAtBottom) {
          var maxScroll = Math.max(0, this.scrollHeight - this.clientHeight);
          if (v >= maxScroll - 5) {
            inGate = true;
            origSetter.call(this, Math.min(userScrollTop, maxScroll));
            setTimeout(function () { inGate = false; }, 30);
            return;
          }
        }
        lastScriptSetterAt = Date.now();
        origSetter.call(this, v);
      },
      configurable: true
    });

    el.__v263ScrollGated = true;
    console.log('[v263] momentum-aware scroll gate installed on #' + id);
    return true;
  }

  function reinstallAll() {
    reinstallScrollGate('dialogue-stream');
    reinstallScrollGate('story');
  }
  reinstallAll();
  setTimeout(reinstallAll, 500);
  setTimeout(reinstallAll, 2000);
  setTimeout(reinstallAll, 5000);

  console.log('[v263] init complete');
})();
