// v251-render-skip-on-no-change.js
// 目的: PC会話ログ点滅の根本対策
//
// v250 の問題:
//   - UI.renderAll フックは「UI が定義済み」なら掛かるが、v250 のロードタイミングでは UI 未定義
//   - v220 の setInterval は内部 closure で reprocessTurns を直接呼ぶので
//     window.__v220.reprocessTurns を上書きしても効かない
//   → 結局 5 秒ごとに renderAll が呼ばれて点滅継続
//
// v251 の戦略:
//   1. UI.renderAll を retry 付きでフック（v249 と同じパターン）
//   2. renderAll の中で「前回と同じ state なら DOM 更新スキップ」する
//      → reprocessTurns が呼ばれても、データ変化が無ければ何も起きない
//   3. signature ベースの比較（speaker+text の連結ハッシュ）
//
// 設計原則準拠:
//   - 機能向上 / バグ修正
//   - 「禁止」追加なし
//   - キャラ生成 / プロンプトには触らない
//
// ガード: window.__v251Active

(function () {
  'use strict';
  if (window.__v251Active) {
    console.log('[v251] already active, skip');
    return;
  }
  window.__v251Active = true;
  console.log('[v251] render skip on no-change init');

  // ====================================================================
  // helper: 全 turns の dialogue + narrative の signature 計算
  // ====================================================================
  function computeStateSignature() {
    try {
      var s = JSON.parse(localStorage.getItem('chr6') || '{}');
      var turns = s.turns || [];
      var sigs = turns.map(function (t) {
        var d = (t.dialogues || []).map(function (x) {
          return (x.speaker || '') + '||' + (x.text || '').trim() + '||' + (x.inner ? '1' : '0');
        }).join('@@');
        var n = (t.narrative || '').trim();
        return d + '##' + n;
      });
      // hero 名・NPCs も含める（設定変更時には再描画）
      var cast = '';
      if (s.cast) {
        cast = (s.cast.hero && s.cast.hero.name || '') + '/' +
               JSON.stringify((s.cast.npcs || []).map(function (n) { return n && n.name; }));
      }
      // mode と turn count も
      return turns.length + '|' + cast + '|' + sigs.join('::');
    } catch (e) {
      return 'ERR:' + Date.now();
    }
  }

  // ====================================================================
  // Patch A: UI.renderAll を hook（retry 付き）
  //   - 前回と同じ signature なら skip
  //   - 連続呼び出しは debounce（100ms 以内は集約）
  // ====================================================================
  var lastSig = null;
  var renderAllPending = null;
  var lastRenderAllAt = 0;

  function installRenderAllHook() {
    if (typeof UI === 'undefined' || typeof UI.renderAll !== 'function') return false;
    if (UI.renderAll.__v251Hooked) return true;

    var origRenderAll = UI.renderAll;

    UI.renderAll = function () {
      var args = arguments;
      var ctx = this;
      var now = Date.now();

      // signature 比較: 前回と同じならスキップ
      var sig = computeStateSignature();
      if (sig === lastSig) {
        if (!window.__v251Skipped) window.__v251Skipped = 0;
        window.__v251Skipped++;
        return;
      }
      lastSig = sig;

      // debounce: 100ms 以内の連続呼び出しは集約
      if (now - lastRenderAllAt < 100) {
        if (renderAllPending) clearTimeout(renderAllPending);
        renderAllPending = setTimeout(function () {
          renderAllPending = null;
          lastRenderAllAt = Date.now();
          try { origRenderAll.apply(ctx, args); } catch (e) {
            console.warn('[v251] renderAll fail', e);
          }
        }, 50);
        if (!window.__v251Debounced) window.__v251Debounced = 0;
        window.__v251Debounced++;
        return;
      }

      lastRenderAllAt = now;
      return origRenderAll.apply(ctx, args);
    };
    UI.renderAll.__v251Hooked = true;
    console.log('[v251] UI.renderAll hooked (skip-on-no-change + debounce)');
    return true;
  }

  // retry until UI is ready
  if (!installRenderAllHook()) {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (installRenderAllHook() || tries > 100) clearInterval(iv);
    }, 100);
    setTimeout(function () { try { clearInterval(iv); } catch (e) {} }, 30000);
  }

  // ====================================================================
  // Patch B: UI.renderTurn / UI.renderNarr も同様に skip
  //   - renderTurn は dialogues を再描画するので、同じ turn データなら skip
  // ====================================================================
  function installRenderTurnHook() {
    if (typeof UI === 'undefined' || typeof UI.renderTurn !== 'function') return false;
    if (UI.renderTurn.__v251Hooked) return true;

    var origRenderTurn = UI.renderTurn;
    var lastTurnSigs = {}; // turn index -> signature

    UI.renderTurn = function (turn, idx) {
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
          if (!window.__v251TurnSkipped) window.__v251TurnSkipped = 0;
          window.__v251TurnSkipped++;
          return;
        }
        lastTurnSigs[key] = sig;
      } catch (e) {}
      return origRenderTurn.apply(this, arguments);
    };
    UI.renderTurn.__v251Hooked = true;
    console.log('[v251] UI.renderTurn hooked');
    return true;
  }

  if (!installRenderTurnHook()) {
    var iv2 = setInterval(function () {
      if (installRenderTurnHook()) clearInterval(iv2);
    }, 100);
    setTimeout(function () { try { clearInterval(iv2); } catch (e) {} }, 30000);
  }

  // ====================================================================
  // Patch C: 起動時 1 回だけ signature 初期化（render される前に基準を作る）
  //   この時点で signature を設定しておけば、最初の render は通常通り走る
  //   （まだ render していない状態 = signature mismatch → render 通る）
  // ====================================================================
  // signature は null のまま放置。最初の renderAll で正常に走る。

  console.log('[v251] init complete');
})();
