// v262-flicker-and-retry-fix.js
// 目的:
//   1. 会話ログの点滅 (~133ms 毎の innerHTML="" → 再構築) を解消
//   2. v220 retry の TypeError "Failed to convert value to 'AbortSignal'" を解消
//
// 根本原因 (1) — フィードバックループ:
//   - v258 reprocessAll が dialogues を変更 → setItem('chr6')
//   - setItem hook が v258/v259 を再起動
//   - v259 postProcessAll が text を modify → setItem('chr6') (S.save 経由)
//   - setItem hook が再び v258/v259 を起動
//   - v261 gate は chr6 hash で判定しているが、
//     v258/v259 自身の書き込みが hash を変えるので gate が効かない
//
// 根本原因 (2) — JSON clone で AbortSignal が破壊:
//   - v220 line 238: var newInit = JSON.parse(JSON.stringify(init));
//   - init.signal は AbortSignal で JSON シリアライズ不可 → {} になる
//   - origFetch(input, newInit) が "signal: {}" を受け取り TypeError
//   - 結果: catch で抑制されるが retry が動かない
//
// 修正方針:
//   A. v258.reprocessAll を min 5s rate-limit (引数なしの定期呼び出しのみ)
//   B. v259.postProcessAllTurns を min 5s rate-limit (同上)
//   C. v258 setItem hook と v259 setItem hook に「自己書き込みを除外する」フラグ協調
//      - chr6 を最後に書いた処理が v258/v259 自身なら次の hook 発火を 1 回だけ skip
//   D. v220 fetch retry を再ラップ: deep-clone 時に signal を除外、新しい AbortController を生成
//
// ガード: window.__v262Active

(function v262() {
  'use strict';
  if (window.__v262Active) {
    console.log('[v262] already active, skip');
    return;
  }
  window.__v262Active = true;
  console.log('[v262] flicker-and-retry-fix init');

  // ========================================================================
  // A+B. v258 / v259 reprocess の rate limit
  //      引数あり (強制呼び出し) はそのまま通し、引数なし (周期/hook トリガー)
  //      は前回実行から 5 秒以内なら skip
  // ========================================================================
  var lastV258 = 0, lastV259Post = 0, lastV259Deco = 0;
  var MIN_INTERVAL_MS = 5000;

  function rateLimit(target, methodName, lastVarName) {
    try {
      var obj = window[target];
      if (!obj || typeof obj[methodName] !== 'function') return false;
      if (obj[methodName].__v262RateLimited) return true;
      var orig = obj[methodName];
      obj[methodName] = function () {
        if (arguments.length > 0) {
          // 強制呼び出し (e.g., turn 完了時) はそのまま通す
          return orig.apply(this, arguments);
        }
        var now = Date.now();
        var last = window['__v262_' + lastVarName] || 0;
        if (now - last < MIN_INTERVAL_MS) {
          if (!window.__v262Skipped) window.__v262Skipped = 0;
          window.__v262Skipped++;
          return false;
        }
        window['__v262_' + lastVarName] = now;
        return orig.apply(this, arguments);
      };
      obj[methodName].__v262RateLimited = true;
      console.log('[v262] rate-limited ' + target + '.' + methodName);
      return true;
    } catch (e) { return false; }
  }

  function tryRateLimitAll() {
    rateLimit('__v258', 'reprocessAll', 'v258');
    rateLimit('__v259', 'postProcessAllTurns', 'v259Post');
    rateLimit('__v259', 'decorateCards', 'v259Deco');
  }
  tryRateLimitAll();
  var tries = 0;
  var rlIv = setInterval(function () {
    tryRateLimitAll();
    if (++tries > 30) clearInterval(rlIv);
  }, 500);

  // ========================================================================
  // C. setItem('chr6') hook の自己書き込み検知:
  //    v258 や v259 が自身の writeBack で hook を再発火させて
  //    無限ループを作っているので、Storage.prototype.setItem の hook
  //    フローに入る前に「直近 X ms に v258/v259 が自分で書いたか」を判定し、
  //    自己書き込みなら 1 回だけ next-hook 発火を抑制する。
  //
  //    実装: setItem を再 wrap し、key='chr6' で書き込みする際に
  //    「呼び出し元 stack」をスニッフィングする代わりに、
  //    「v262 が直前 200ms 以内に処理 lock を取得したか」フラグで判定。
  //    このフラグは reprocessAll/postProcessAllTurns wrap で立てる。
  // ========================================================================
  var v262WriteLockUntil = 0;
  function takeWriteLock(ms) {
    v262WriteLockUntil = Date.now() + (ms || 200);
  }
  function isWriteLocked() {
    return Date.now() < v262WriteLockUntil;
  }

  // wrap reprocessAll/postProcessAllTurns to take write lock
  function wrapWithLock(target, methodName) {
    try {
      var obj = window[target];
      if (!obj || typeof obj[methodName] !== 'function') return false;
      if (obj[methodName].__v262Locked) return true;
      var orig = obj[methodName];
      obj[methodName] = function () {
        var r;
        try { r = orig.apply(this, arguments); }
        finally { takeWriteLock(300); } // 自己書き込みの後 300ms は次 hook 発火を抑制
        return r;
      };
      obj[methodName].__v262Locked = true;
      return true;
    } catch (e) { return false; }
  }
  function tryWrapLockAll() {
    wrapWithLock('__v258', 'reprocessAll');
    wrapWithLock('__v259', 'postProcessAllTurns');
    wrapWithLock('__v259', 'decorateCards');
  }
  tryWrapLockAll();
  var tries2 = 0;
  var lkIv = setInterval(function () {
    tryWrapLockAll();
    if (++tries2 > 30) clearInterval(lkIv);
  }, 500);

  // setItem hook to absorb self-writes
  try {
    var proto = Storage.prototype;
    if (!proto.setItem.__v262Absorbed) {
      var origSet = proto.setItem;
      proto.setItem = function (key, value) {
        var ret = origSet.call(this, key, value);
        // chr6 への self-write 連鎖を抑制
        if (key === 'chr6' && isWriteLocked()) {
          // 後続の v258/v259 setItem hook には「自己書き込み」と認識させる
          window.__v259Writing = true;
          setTimeout(function () { window.__v259Writing = false; }, 250);
        }
        return ret;
      };
      proto.setItem.__v262Absorbed = true;
      console.log('[v262] setItem self-write absorber installed');
    }
  } catch (e) {}

  // ========================================================================
  // D. v220 fetch retry の AbortSignal 修正:
  //    fetch を再 hook して、v220 の retry path で newInit.signal が壊れていたら
  //    削除して新しい AbortController を生成する
  // ========================================================================
  try {
    var origFetch = window.fetch;
    if (!origFetch.__v262SigPatched) {
      window.fetch = function (input, init) {
        try {
          if (init && Object.prototype.hasOwnProperty.call(init, 'signal') && init.signal !== null) {
            // signal が AbortSignal でない場合は除去 (JSON.parse で {} になっているケース)
            if (!(init.signal instanceof AbortSignal)) {
              var clean = {};
              Object.keys(init).forEach(function (k) {
                if (k !== 'signal') clean[k] = init[k];
              });
              // 必要なら新しい AbortController を生成
              clean.signal = new AbortController().signal;
              return origFetch.call(this, input, clean);
            }
          }
        } catch (e) {}
        return origFetch.apply(this, arguments);
      };
      window.fetch.__v262SigPatched = true;
      console.log('[v262] fetch signal sanitizer installed');
    }
  } catch (e) {}

  console.log('[v262] init complete');
})();
