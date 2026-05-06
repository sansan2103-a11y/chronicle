// v256-story-fallback-renderer.js
// 目的: 展開パネル（#story）が空のままになるバグの最終対策
//
// 観測（実機検証で判明）:
//   1. UI.renderAll() は呼ばれているが内部で appendChild エラーで throw
//   2. v254 wrapper が catch で握り潰すが、その時点で lastSig は既に更新済み
//   3. 次回 renderAll() 呼び出し時、sig === lastSig で SKIP → 永久に再描画されない
//   4. 結果: 会話ログ（左パネル）は描画されるが、展開（右パネル #story）は空
//
//   __v254Skipped が +1 ずつ増えるが、storyChildren は 0 のまま
//
// v256 戦略（フォールバック描画）:
//   1. setInterval で「turns > 0 だが #story が空」を 2 秒ごとに検出
//   2. その状態を検出したら、S.turns から直接 narrative DOM を構築して appendChild
//   3. 元の renderAll に依存しない独自 renderer を保持
//   4. renderAll が成功した時はこのフォールバックは何もしない（idempotent）
//
//   ※ dialogue cards（会話ログ）は元の renderAll で正常動作しているため触らない
//   ※ 元の rendering を妨げないように、#story が既に内容を持っていれば skip
//
// 設計原則準拠:
//   - 機能向上 / バグ修正
//   - 「禁止」追加なし
//   - 既存 patch を破壊しない（読み取りのみ + 空の DOM への append）
//
// ガード: window.__v256Active

(function () {
  'use strict';
  if (window.__v256Active) {
    console.log('[v256] already active, skip');
    return;
  }
  window.__v256Active = true;
  console.log('[v256] story fallback renderer init');

  // ====================================================================
  // helper: HTML エスケープ
  // ====================================================================
  function esc(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // narrative テキストを段落に分割して <p> で wrap
  function buildNarrativeBlocks(narrative) {
    if (!narrative) return '';
    var paragraphs = String(narrative).split(/\n\s*\n+|\n/).filter(function (p) {
      return p.trim().length > 0;
    });
    return paragraphs.map(function (p) {
      return '<p class="v256-narr-line">' + esc(p.trim()) + '</p>';
    }).join('');
  }

  // 1 turn 分の DOM HTML を作る（インライン CSS で見た目を確保）
  function buildTurnHTML(turn, idx) {
    if (!turn || !turn.narrative) return '';
    var inputType = (turn.inputType || '').toUpperCase();
    var playerText = turn.playerText || '';
    var label = inputType === 'DO' ? 'DO' :
                inputType === 'SAY' ? 'SAY' :
                inputType === 'STORY' ? 'STORY' : '';
    var labelClass = inputType === 'DO' ? 'v256-tag-do' :
                     inputType === 'SAY' ? 'v256-tag-say' :
                     'v256-tag-story';

    var headerHTML = '';
    if (label && playerText) {
      headerHTML =
        '<div class="v256-turn-header">' +
        '<span class="v256-tag ' + labelClass + '">' + label + '</span>' +
        '<span class="v256-player-text">' + esc(playerText.slice(0, 200)) + '</span>' +
        '</div>';
    }

    var narrHTML = buildNarrativeBlocks(turn.narrative);

    return (
      '<div class="v256-turn-block" data-v256-turn="' + idx + '">' +
        headerHTML +
        '<div class="v256-narr-body">' + narrHTML + '</div>' +
      '</div>'
    );
  }

  // ====================================================================
  // CSS（既存スタイルに馴染むよう最小限）
  // ====================================================================
  function injectStyle() {
    var styleId = '__v256_style';
    if (document.getElementById(styleId)) return;
    var style = document.createElement('style');
    style.id = styleId;
    style.textContent = [
      '.v256-turn-block {',
      '  margin-bottom: 14px;',
      '  padding: 12px 14px;',
      '  border-left: 3px solid var(--gold, #c4a45a);',
      '  background: rgba(255,255,255,0.02);',
      '  border-radius: 4px;',
      '}',
      '.v256-turn-header {',
      '  margin-bottom: 8px;',
      '  display: flex;',
      '  gap: 8px;',
      '  align-items: center;',
      '  font-size: 13px;',
      '}',
      '.v256-tag {',
      '  padding: 2px 8px;',
      '  border-radius: 3px;',
      '  font-weight: bold;',
      '  font-size: 11px;',
      '  letter-spacing: 0.5px;',
      '}',
      '.v256-tag-do { background: var(--do, #5a8ef0); color: #fff; }',
      '.v256-tag-say { background: var(--say, #6aaf78); color: #fff; }',
      '.v256-tag-story { background: var(--story, #c49040); color: #fff; }',
      '.v256-player-text {',
      '  color: var(--dim, #6868a0);',
      '  font-style: italic;',
      '}',
      '.v256-narr-body {',
      '  color: var(--tx, #e0dcf0);',
      '  line-height: 1.7;',
      '}',
      '.v256-narr-line {',
      '  margin: 0 0 0.7em 0;',
      '  white-space: pre-wrap;',
      '  word-wrap: break-word;',
      '}',
      '.v256-narr-line:last-child { margin-bottom: 0; }'
    ].join('\n');
    document.head.appendChild(style);
  }

  // ====================================================================
  // フォールバック描画
  // ====================================================================
  var lastFallbackSig = '';

  function fallbackRender() {
    try {
      var story = document.getElementById('story');
      if (!story) return;

      var s;
      try {
        s = (typeof S !== 'undefined') ? S : JSON.parse(localStorage.getItem('chr6') || '{}');
      } catch (e) {
        s = JSON.parse(localStorage.getItem('chr6') || '{}');
      }
      var turns = (s && s.turns) || [];

      // turns が無いなら何もしない
      if (turns.length === 0) return;

      // story panel に既に有意義な内容があるなら skip（元 render が成功している）
      // テキストがある or .v101-story-card 等の元クラスを持つ要素がある場合
      var hasContent = story.innerText.trim().length > 30;
      var hasOriginalCards = story.querySelector('.v101-story-card, .narr-block, .story-card, [class*="story-block"], [class*="narr-block"]');
      if (hasContent && hasOriginalCards) {
        // 元の render が動いている → fallback は不要
        // 念のため自分の fallback ブロックを片付ける
        var existing = story.querySelectorAll('.v256-turn-block');
        if (existing.length > 0) {
          existing.forEach(function (el) { el.remove(); });
          window.__v256CleanedAfterRecovery = (window.__v256CleanedAfterRecovery || 0) + 1;
        }
        return;
      }

      // signature: turn count + 各 turn の narrative の最初 50 文字
      var sig = turns.length + '|' + turns.map(function (t) {
        return ((t.narrative || '').slice(0, 50)) + '#' + (t.inputType || '');
      }).join('::');

      if (sig === lastFallbackSig) return; // 同じ内容で再描画は不要
      lastFallbackSig = sig;

      injectStyle();

      // 既存の v256 ブロックを削除して再構築
      var existing = story.querySelectorAll('.v256-turn-block');
      existing.forEach(function (el) { el.remove(); });

      // 新しく描画
      var html = turns.map(buildTurnHTML).join('');
      var container = document.createElement('div');
      container.className = 'v256-container';
      container.innerHTML = html;
      story.appendChild(container);

      window.__v256Renders = (window.__v256Renders || 0) + 1;
      console.log('[v256] fallback render: ' + turns.length + ' turn(s) (count=' + window.__v256Renders + ')');
    } catch (e) {
      console.warn('[v256] fallback render fail:', e && e.message);
    }
  }

  // ====================================================================
  // 起動: 定期的に fallback を試す
  // ====================================================================
  function startFallbackLoop() {
    fallbackRender();
    setInterval(function () {
      try { fallbackRender(); } catch (e) {}
    }, 2000);
  }

  if (document.readyState === 'complete') {
    setTimeout(startFallbackLoop, 500);
  } else {
    window.addEventListener('load', function () { setTimeout(startFallbackLoop, 500); });
    setTimeout(startFallbackLoop, 3000);
  }

  // 手動で呼べるように window に expose
  window.__v256ForceRender = fallbackRender;

  console.log('[v256] init complete');
})();
