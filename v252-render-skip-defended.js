// v252-render-skip-defended.js
// 目的: PC会話ログ点滅の確実な解消
//
// v251 の問題:
//   v251 が UI.renderAll をフックした後、後から読まれる patch（v200-v220 などが
//   <body> 後ろで読み込まれる）が UI.renderAll を再ラップして上書きする。
//   → __v251Hooked フラグが消失、フック効かない。
//
// v252 の戦略:
//   1. window.load イベントを待ってフック（全 sync script 完了後）
//   2. その後も 1 秒ごとに「現在の renderAll が我々のラップか」確認
//      → 上書きされていれば再ラップ（idempotent な install）
//   3. signature ベースの skip ロジックは v251 と同じ
//   4. 関数オブジェクトに ._v252Wrapper を立てて識別
//
// 設計原則準拠:
//   - 機能向上 / バグ修正
//   - 「禁止」追加なし
//
// ガード: window.__v252Active

(function () {
  'use strict';
  if (window.__v252Active) {
    console.log('[v252] already active, skip');
    return;
  }
  window.__v252Active = true;
  console.log('[v252] render skip defended init');

  // ====================================================================
  // signature 計算（state 全体）
  // ====================================================================
  function computeStateSignature() {
    try {
      var s = JSON.parse(localStorage.getItem('chr6') || '{}');
      var turns = s.turns || [];
      var cast = '';
      if (s.cast) {
        cast = (s.cast.hero && s.cast.hero.name || '') + '/' +
               JSON.stringify((s.cast.npcs || []).map(function (n) { return n && n.name; }));
      }
      var sigs = turns.map(function (t) {
        var d = (t.dialogues || []).map(function (x) {
          return (x.speaker || '') + '||' + (x.text || '').trim() + '||' + (x.inner ? '1' : '0');
        }).join('@@');
        return d + '##' + (t.narrative || '').trim();
      });
      return turns.length + '|' + cast + '|' + sigs.join('::');
    } catch (e) {
      return 'ERR:' + Date.now();
    }
  }

  // ====================================================================
  // wrapper 作成（idempotent install のための共通 factory）
  // ====================================================================
  var lastSig = null;
  var renderAllPending = null;
  var lastRenderAllAt = 0;

  function makeRenderAllWrapper(originalRenderAll) {
    function wrapped() {
      var args = arguments;
      var ctx = this;
      var now = Date.now();

      // signature 比較: 同一 state なら skip
      var sig = computeStateSignature();
      if (sig === lastSig) {
        if (!window.__v252Skipped) window.__v252Skipped = 0;
        window.__v252Skipped++;
        return;
      }
      lastSig = sig;

      // debounce: 100ms 以内の連続呼び出しは集約
      if (now - lastRenderAllAt < 100) {
        if (renderAllPending) clearTimeout(renderAllPending);
        renderAllPending = setTimeout(function () {
          renderAllPending = null;
          lastRenderAllAt = Date.now();
          try { originalRenderAll.apply(ctx, args); } catch (e) {
            console.warn('[v252] renderAll fail', e);
          }
        }, 50);
        if (!window.__v252Debounced) window.__v252Debounced = 0;
        window.__v252Debounced++;
        return;
      }

      lastRenderAllAt = now;
      return originalRenderAll.apply(ctx, args);
    }
    wrapped._v252Wrapper = true;
    wrapped._v252OriginalRef = originalRenderAll;
    return wrapped;
  }

  // ====================================================================
  // install + 再インストール監視
  //   1 秒ごとに「現在の UI.renderAll が我々のラップか」確認、
  //   外部に上書きされていたら再ラップ
  // ====================================================================
  function ensureHook() {
    if (typeof UI === 'undefined' || typeof UI.renderAll !== 'function') return false;

    // 既に v252 ラッパーなら何もしない
    if (UI.renderAll._v252Wrapper) return true;

    // 別のラッパー（v250 / v251 / 他）が掛かっている可能性 → そのまま original として包む
    var current = UI.renderAll;
    UI.renderAll = makeRenderAllWrapper(current);
    if (!window.__v252WrapCount) window.__v252WrapCount = 0;
    window.__v252WrapCount++;
    console.log('[v252] UI.renderAll wrapped (count=' + window.__v252WrapCount + ')');
    return true;
  }

  // 起動: window.load 後に install + 監視ループ開始
  function startWatcher() {
    // 即座に試す
    ensureHook();

    // 1 秒ごとに監視（上書きされてたら再ラップ）
    setInterval(function () {
      try { ensureHook(); } catch (e) {}
    }, 1000);
  }

  if (document.readyState === 'complete') {
    // 既にロード完了
    setTimeout(startWatcher, 100);
  } else {
    window.addEventListener('load', function () {
      setTimeout(startWatcher, 100);
    });
    // load イベントが発火しないケースの保険
    setTimeout(startWatcher, 3000);
  }

  // ====================================================================
  // renderTurn も同様（state 比較で skip）
  // ====================================================================
  var lastTurnSigs = {};

  function makeRenderTurnWrapper(originalRenderTurn) {
    function wrapped(turn, idx) {
      var key = idx === undefined ? 'last' : idx;
      try {
        var sig = '';
        if (turn) {
          var d = (turn.dialogues || []).map(function (x) {
            return (x.speaker || '') + '||' + (x.text || '').trim();
          }).join('@@');
          sig = d + '##' + ((turn.narrative || '').trim());
        }
        if (sig && lastTurnSigs[key] === sig) {
          if (!window.__v252TurnSkipped) window.__v252TurnSkipped = 0;
          window.__v252TurnSkipped++;
          return;
        }
        lastTurnSigs[key] = sig;
      } catch (e) {}
      return originalRenderTurn.apply(this, arguments);
    }
    wrapped._v252Wrapper = true;
    return wrapped;
  }

  function ensureRenderTurnHook() {
    if (typeof UI === 'undefined' || typeof UI.renderTurn !== 'function') return false;
    if (UI.renderTurn._v252Wrapper) return true;
    var current = UI.renderTurn;
    UI.renderTurn = makeRenderTurnWrapper(current);
    return true;
  }

  function startRenderTurnWatcher() {
    ensureRenderTurnHook();
    setInterval(function () {
      try { ensureRenderTurnHook(); } catch (e) {}
    }, 1000);
  }

  if (document.readyState === 'complete') {
    setTimeout(startRenderTurnWatcher, 100);
  } else {
    window.addEventListener('load', function () {
      setTimeout(startRenderTurnWatcher, 100);
    });
    setTimeout(startRenderTurnWatcher, 3000);
  }

  console.log('[v252] init complete');
})();
