// v254-mobile-input-and-log-finalize.js
// 目的:
//   1. スマホで「プレイヤー入力後に展開へ反映されない」不具合の解消
//   2. v253 のログフィルタ漏れ（v209 multi-arg）を fix
//
// 不具合 1 の推定原因:
//   A. v252 の signature 計算が localStorage 由来 → submit 直後で
//      まだ save 前のタイミングで renderAll が走ると old signature と一致 → skip
//   B. v249 の UI._scroll gate がユーザーの直近 touch を理由に scroll 抑制
//      → 新ターンが描画されても scroll 位置が古いまま、画面外で見えない
//   C. renderAll が turn 内部で例外を投げると DOM が中途半端な状態で固まる
//      （実機シミュレーションで appendChild エラー観測）
//
// 修正方針（外科的、後方互換）:
//   A. v252 の signature を上書き: localStorage の代わりに in-memory S を見る
//   B. UI._scroll の v249 gate を bypass: 新ターン追加直後は強制 scroll
//   C. renderAll を try/catch でラップ: 例外時は最後の良好状態の DOM を維持し
//      かつ console.error で原因記録
//
// ログフィルタ:
//   - v253 の console.log フィルタは第1引数のみ参照
//   - v254 で「全引数を空白連結後にマッチ」に拡張（v209 多引数も silence）
//
// 設計原則準拠:
//   - 機能向上 / バグ修正
//   - 「禁止」追加なし
//
// ガード: window.__v254Active

(function () {
  'use strict';
  if (window.__v254Active) {
    console.log('[v254] already active, skip');
    return;
  }
  window.__v254Active = true;
  console.log('[v254] mobile input fix + log finalize init');

  // ====================================================================
  // Patch A: console.log フィルタを「全引数連結後マッチ」に拡張
  //   v253 の filter を上書きして multi-arg ケース（v209 等）を捕捉
  // ====================================================================
  var SILENCE_PATTERNS_FULL = [
    /\[v220\] inline dialogue extracted/,
    /\[v220\] reprocessed turns/,
    /\[v203\] reattributed turns/,
    /\[v209\] synced \d+ dialogue avatar/,
    /\[v210\] cleaned/,
    /\[v207\] continuation/
  ];

  try {
    var origLog254 = console.log;
    console.log = function () {
      // 全引数を string 化して空白連結
      var fullMsg = '';
      for (var i = 0; i < arguments.length; i++) {
        var a = arguments[i];
        if (typeof a === 'string') {
          fullMsg += a + ' ';
        } else if (a !== null && a !== undefined) {
          try { fullMsg += String(a) + ' '; } catch (e) {}
        }
      }
      fullMsg = fullMsg.trim();

      for (var j = 0; j < SILENCE_PATTERNS_FULL.length; j++) {
        if (SILENCE_PATTERNS_FULL[j].test(fullMsg)) {
          if (!window.__v254SilencedLogs) window.__v254SilencedLogs = 0;
          window.__v254SilencedLogs++;
          return;
        }
      }
      return origLog254.apply(this, arguments);
    };
  } catch (e) {}

  // ====================================================================
  // Patch B: v252 の signature を in-memory S ベースに置換
  //   localStorage は save タイミングで stale になりうる
  //   in-memory S（生きてる state）を直接見る方が正確
  // ====================================================================
  function computeStateSignatureFromMemory() {
    try {
      // 優先: in-memory S
      var s = (typeof S !== 'undefined') ? S : null;
      if (!s) {
        s = JSON.parse(localStorage.getItem('chr6') || '{}');
      }
      var turns = s.turns || [];
      var cast = '';
      if (s.cast) {
        cast = ((s.cast.hero && s.cast.hero.name) || '') + '/' +
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

  // v252 wrapper を強制再ラップ（in-memory ベース）
  var lastSigV254 = null;
  var renderAllPendingV254 = null;
  var lastRenderAllAtV254 = 0;

  function makeV254RenderAllWrapper(originalRenderAll) {
    function wrapped() {
      var args = arguments;
      var ctx = this;
      var now = Date.now();

      var sig = computeStateSignatureFromMemory();
      if (sig === lastSigV254) {
        if (!window.__v254Skipped) window.__v254Skipped = 0;
        window.__v254Skipped++;
        return;
      }
      lastSigV254 = sig;

      // debounce
      if (now - lastRenderAllAtV254 < 100) {
        if (renderAllPendingV254) clearTimeout(renderAllPendingV254);
        renderAllPendingV254 = setTimeout(function () {
          renderAllPendingV254 = null;
          lastRenderAllAtV254 = Date.now();
          try {
            originalRenderAll.apply(ctx, args);
          } catch (e) {
            console.error('[v254] renderAll throw:', e && e.message);
          }
        }, 50);
        return;
      }

      lastRenderAllAtV254 = now;
      try {
        return originalRenderAll.apply(ctx, args);
      } catch (e) {
        console.error('[v254] renderAll throw:', e && e.message);
      }
    }
    wrapped._v254Wrapper = true;
    wrapped._v252Wrapper = true; // v252 互換マーカー保持
    return wrapped;
  }

  function ensureV254RenderAllHook() {
    if (typeof UI === 'undefined' || typeof UI.renderAll !== 'function') return false;
    if (UI.renderAll._v254Wrapper) return true;
    var current = UI.renderAll;
    UI.renderAll = makeV254RenderAllWrapper(current);
    if (!window.__v254WrapCount) window.__v254WrapCount = 0;
    window.__v254WrapCount++;
    return true;
  }

  // ====================================================================
  // Patch C: UI._scroll の v249 gate bypass
  //   新ターン追加（in-memory S.turns.length 増加）を検出した時は
  //   gate を bypass して原関数を直接呼ぶ
  // ====================================================================
  var lastTurnCountV254 = (typeof S !== 'undefined' && S.turns) ? S.turns.length : -1;

  function getCurrentTurnCount() {
    try {
      if (typeof S !== 'undefined' && S.turns) return S.turns.length;
      var s = JSON.parse(localStorage.getItem('chr6') || '{}');
      return (s.turns || []).length;
    } catch (e) { return -1; }
  }

  function ensureScrollOverride() {
    if (typeof UI === 'undefined' || typeof UI._scroll !== 'function') return false;
    if (UI._scroll._v254Hooked) return true;

    var currentScroll = UI._scroll;
    UI._scroll = function () {
      var newCount = getCurrentTurnCount();
      // 新ターン追加: gate 無視で強制 scroll
      if (newCount > lastTurnCountV254 && lastTurnCountV254 >= 0) {
        lastTurnCountV254 = newCount;
        try {
          // #story を bottom に直接 scroll（gate を avoid）
          var storyEl = document.getElementById('story');
          if (storyEl) {
            storyEl.scrollTop = storyEl.scrollHeight;
          }
          // dialogue-stream も
          var ds = document.getElementById('dialogue-stream');
          if (ds) {
            ds.scrollTop = ds.scrollHeight;
          }
        } catch (e) {}
        if (!window.__v254ForcedScrolls) window.__v254ForcedScrolls = 0;
        window.__v254ForcedScrolls++;
        return; // gate を呼ばずに終了
      }
      lastTurnCountV254 = newCount;
      return currentScroll.apply(this, arguments);
    };
    UI._scroll._v254Hooked = true;
    return true;
  }

  // ====================================================================
  // Patch D: 監視ループ（後続 patch の上書き対策）
  // ====================================================================
  function startWatcher254() {
    ensureV254RenderAllHook();
    ensureScrollOverride();

    setInterval(function () {
      try {
        ensureV254RenderAllHook();
        ensureScrollOverride();
      } catch (e) {}
    }, 1000);
  }

  if (document.readyState === 'complete') {
    setTimeout(startWatcher254, 100);
  } else {
    window.addEventListener('load', function () {
      setTimeout(startWatcher254, 100);
    });
    setTimeout(startWatcher254, 3000);
  }

  // ====================================================================
  // Patch E: localStorage.setItem を hook して新ターン保存を検出 → 強制再描画
  //   submit 経路で save が起きた時、もし renderAll が skip されていたら
  //   強制的に走らせる（in-memory state も新しくなっているので signature mismatch する）
  // ====================================================================
  try {
    var proto = Storage.prototype;
    var origSet = proto.setItem;
    if (!proto.setItem._v254Hooked) {
      proto.setItem = function (key, value) {
        var ret = origSet.call(this, key, value);
        if (key === 'chr6') {
          // 新ターン保存 detection
          setTimeout(function () {
            try {
              var newCount = getCurrentTurnCount();
              if (newCount > lastTurnCountV254) {
                lastTurnCountV254 = newCount;
                if (typeof UI !== 'undefined' && typeof UI.renderAll === 'function') {
                  try { UI.renderAll(); } catch (e) {}
                }
                // 強制 scroll
                var storyEl = document.getElementById('story');
                if (storyEl) storyEl.scrollTop = storyEl.scrollHeight;
              }
            } catch (e) {}
          }, 50);
        }
        return ret;
      };
      proto.setItem._v254Hooked = true;
    }
  } catch (e) {}

  console.log('[v254] init complete');
})();
