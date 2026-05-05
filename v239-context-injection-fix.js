// v239-context-injection-fix.js
// 目的: _buildSimplePrompt が直前ターンを毎回スルーしていたバグの修正
//
// 原因: _buildSimplePrompt の recent 構築ロジックが
//        Array.isArray(t.narrative) ? t.narrative.join('\n') : (t?.text || '')
//        となっており、実データは t.narrative が string なので常に空文字に落ちていた。
//        結果、user prompt は履歴があっても毎回「【物語開始】」のみとなり、
//        AI は完全に直前ターンを無視 → 漢文/中国語ハルシネーションが発生。
//
// 修正:
//   A. _buildSimplePrompt をラップして user プロンプトの「【物語開始】」を
//      実際の直近 3 ターンの narrative + playerText に差し替える
//   B. G.resetStory を強化（settings panel を閉じる、UI 再描画を確実に行う）
//   C. 直前ターン情報の最大長を 1500 字に制限（既存パッチ群との競合回避）
//
// ガード: window.__v239Active, window._buildSimplePrompt.__v239Hooked,
//        G.resetStory.__v239Hooked

(function () {
  'use strict';
  if (window.__v239Active) {
    console.log('[v239] already active, skip');
    return;
  }
  window.__v239Active = true;
  console.log('[v239] context injection fix active');

  // ====================================================================
  // Patch A: _buildSimplePrompt をラップして直前ターンを実際に注入する
  // ====================================================================
  function installPromptWrap() {
    if (typeof window._buildSimplePrompt !== 'function') return false;
    if (window._buildSimplePrompt.__v239Hooked) return true;

    var origPrompt = window._buildSimplePrompt;

    window._buildSimplePrompt = function (inputType, inputText) {
      var result;
      try {
        result = origPrompt.apply(this, arguments);
      } catch (e) {
        console.warn('[v239] origPrompt threw:', e);
        throw e;
      }

      try {
        if (!result || typeof result.user !== 'string') return result;
        if (typeof S === 'undefined' || !S || !Array.isArray(S.turns) || S.turns.length === 0) {
          return result;
        }

        // 直近 3 ターンを構築
        var pieces = [];
        var startIdx = Math.max(0, S.turns.length - 3);
        for (var i = startIdx; i < S.turns.length; i++) {
          var t = S.turns[i];
          if (!t) continue;

          var narr = '';
          if (Array.isArray(t.narrative)) narr = t.narrative.join('\n');
          else if (typeof t.narrative === 'string') narr = t.narrative;
          else if (typeof t.text === 'string') narr = t.text;

          var input = '';
          if (typeof t.playerText === 'string' && t.playerText.trim()) {
            var pt = t.playerText.trim();
            if (t.inputType === 'DO') input = '> 主人公は ' + pt + '。';
            else if (t.inputType === 'SAY') input = '> 主人公「' + pt + '」';
            else input = '> ' + pt;
          }

          if (narr || input) {
            pieces.push((input ? input + '\n' : '') + narr);
          }
        }

        if (pieces.length === 0) return result;

        var recent = pieces.join('\n\n---\n\n');
        // 上限 1500 字（先頭側を切る）
        if (recent.length > 1500) {
          recent = '...（前略）...\n' + recent.slice(-1500);
        }

        var marker = '【物語開始】';
        if (result.user.indexOf(marker) !== -1) {
          // false ブランチが選ばれていた = 原因の発火点。差し替え。
          var replacement = '【直前の物語（参考。要約・繰返厳禁）】\n' + recent;
          result.user = result.user.replace(marker, replacement);
          if (!window.__v239ReplaceCount) window.__v239ReplaceCount = 0;
          window.__v239ReplaceCount++;
        }
      } catch (e) {
        console.warn('[v239] context injection failed (returning original):', e);
      }

      return result;
    };

    window._buildSimplePrompt.__v239Hooked = true;
    return true;
  }

  // ====================================================================
  // Patch B: G.resetStory を堅牢化（panel close + 二重 clear）
  // ====================================================================
  function installResetWrap() {
    if (typeof G === 'undefined' || typeof G.resetStory !== 'function') return false;
    if (G.resetStory.__v239Hooked) return true;

    var origReset = G.resetStory;

    G.resetStory = function () {
      var ret;
      try {
        ret = origReset.apply(this, arguments);
      } catch (e) {
        console.warn('[v239] origReset threw:', e);
      }

      // 二重保険: turns/branches を確実に空にして再描画
      try {
        if (typeof S !== 'undefined' && S) {
          if (Array.isArray(S.turns)) S.turns.length = 0;
          else S.turns = [];
          if (S.scene && Array.isArray(S.scene.branches)) {
            S.scene.branches.length = 0;
          } else if (S.scene) {
            S.scene.branches = [];
          }
          if (typeof S.save === 'function') S.save();
        }
        if (typeof UI !== 'undefined' && UI) {
          if (typeof UI.renderAll === 'function') UI.renderAll();
          if (typeof UI.renderBranches === 'function') UI.renderBranches([]);
          if (typeof UI._showIntro === 'function') UI._showIntro();
          if (typeof UI.closeSettings === 'function') UI.closeSettings();
          if (typeof UI.setStatus === 'function') UI.setStatus('物語をリセットしました（v239）');
        }
      } catch (e) {
        console.warn('[v239] resetStory enhance failed:', e);
      }

      return ret;
    };

    G.resetStory.__v239Hooked = true;
    return true;
  }

  // ====================================================================
  // 起動
  // ====================================================================
  function tryInstall() {
    var a = installPromptWrap();
    var b = installResetWrap();
    return a && b;
  }

  if (!tryInstall()) {
    // DOMContentLoaded 後 / 他パッチ後に再試行
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (tryInstall() || tries > 40) {
        clearInterval(iv);
        if (tries > 40) console.warn('[v239] install gave up after 40 retries');
      }
    }, 100);
  }
})();
