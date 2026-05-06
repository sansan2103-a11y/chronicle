// v257-convo-fallback-renderer.js
// 目的: 会話ログ（左パネル #dialogue-stream）の fallback renderer
//
// 観測:
//   v256 で展開（右）パネルは fallback で描画されるようになったが、
//   会話ログ（左 #dialogue-stream）は空のまま。
//   原因は同じ: renderAll が appendChild エラーで failed → dialogue cards も
//   build されない。
//
// v257 戦略:
//   v256 と同じ流儀で、#dialogue-stream が空なら S.turns から
//   .v101-dlg-card を直接組み立てて append する。
//   既存 CSS が適用されるよう class 名を流用。
//
// 設計原則準拠:
//   - 機能向上 / バグ修正
//   - 「禁止」追加なし
//   - 元 renderer に依存しない、空 DOM へ append のみ
//
// ガード: window.__v257Active

(function () {
  'use strict';
  if (window.__v257Active) {
    console.log('[v257] already active, skip');
    return;
  }
  window.__v257Active = true;
  console.log('[v257] convo fallback renderer init');

  function esc(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ====================================================================
  // cast から avatar URL を引く
  // ====================================================================
  function getAvatarMap() {
    var map = {};
    try {
      var s = (typeof S !== 'undefined') ? S : JSON.parse(localStorage.getItem('chr6') || '{}');
      var cast = s.cast || {};
      if (cast.hero && cast.hero.name) {
        map[cast.hero.name] = cast.hero.avatar || '';
      }
      var npcs = cast.npcs || [];
      if (Array.isArray(npcs)) {
        npcs.forEach(function (n) {
          if (n && n.name) map[n.name] = n.avatar || '';
        });
      } else if (typeof npcs === 'object') {
        Object.keys(npcs).forEach(function (k) {
          if (npcs[k] && npcs[k].name) map[npcs[k].name] = npcs[k].avatar || '';
        });
      }
    } catch (e) {}
    return map;
  }

  // ====================================================================
  // 1 dialogue 分の card HTML
  // ====================================================================
  function buildDialogueCardHTML(speaker, text, inner, avatarMap) {
    var avatar = (avatarMap && avatarMap[speaker]) || '';
    var avatarHTML = avatar
      ? '<img src="' + esc(avatar) + '" alt="' + esc(speaker) + '" style="width:42px;height:42px;border-radius:50%;object-fit:cover;flex-shrink:0;">'
      : '<div style="width:42px;height:42px;border-radius:50%;background:var(--s2,#17172a);flex-shrink:0;"></div>';

    var quoteOpen = inner ? '《' : '「';
    var quoteClose = inner ? '》' : '」';

    return (
      '<div class="v101-dlg-card v257-card" style="display:flex;gap:10px;padding:10px 12px;margin-bottom:8px;background:rgba(255,255,255,0.02);border-left:3px solid var(--acc,#8b76f0);border-radius:4px;align-items:flex-start;">' +
        '<div style="flex-shrink:0;">' + avatarHTML + '</div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="color:var(--acc,#8b76f0);font-weight:bold;font-size:13px;margin-bottom:3px;">' + esc(speaker) + '</div>' +
          '<div style="color:var(--tx,#e0dcf0);font-size:14px;line-height:1.5;word-wrap:break-word;">' + esc(quoteOpen + text + quoteClose) + '</div>' +
        '</div>' +
      '</div>'
    );
  }

  // ====================================================================
  // フォールバック描画
  // ====================================================================
  var lastSig = '';

  function fallbackRender() {
    try {
      var convo = document.getElementById('dialogue-stream');
      if (!convo) return;

      var s;
      try {
        s = (typeof S !== 'undefined') ? S : JSON.parse(localStorage.getItem('chr6') || '{}');
      } catch (e) {
        s = JSON.parse(localStorage.getItem('chr6') || '{}');
      }
      var turns = (s && s.turns) || [];
      if (turns.length === 0) return;

      // 全 dialogues を集める
      var allDialogues = [];
      turns.forEach(function (t) {
        var ds = (t && t.dialogues) || [];
        ds.forEach(function (d) {
          if (d && d.speaker && d.text) {
            allDialogues.push({
              speaker: String(d.speaker),
              text: String(d.text),
              inner: !!d.inner
            });
          }
        });
      });
      if (allDialogues.length === 0) return;

      // 既に元 renderer が描画している（v101-dlg-card が存在し v257-card じゃない）なら skip
      var existingNonV257 = convo.querySelectorAll('.v101-dlg-card:not(.v257-card)');
      if (existingNonV257.length > 0) {
        // 元 renderer が動いているので、v257 fallback の残骸があれば片付ける
        var ourCards = convo.querySelectorAll('.v257-card');
        if (ourCards.length > 0) {
          ourCards.forEach(function (el) { el.remove(); });
          window.__v257CleanedAfterRecovery = (window.__v257CleanedAfterRecovery || 0) + 1;
        }
        return;
      }

      // 同一内容なら再描画しない
      var sig = allDialogues.map(function (d) {
        return d.speaker + '||' + d.text + '||' + (d.inner ? '1' : '0');
      }).join('@@');
      if (sig === lastSig) return;
      lastSig = sig;

      // 既存の v257 fallback を削除
      var ourExisting = convo.querySelectorAll('.v257-card');
      ourExisting.forEach(function (el) { el.remove(); });

      // avatar map を取得
      var avatarMap = getAvatarMap();

      // 描画
      var html = allDialogues.map(function (d) {
        return buildDialogueCardHTML(d.speaker, d.text, d.inner, avatarMap);
      }).join('');
      var container = document.createElement('div');
      container.className = 'v257-container';
      container.innerHTML = html;
      convo.appendChild(container);

      window.__v257Renders = (window.__v257Renders || 0) + 1;
      console.log('[v257] fallback render: ' + allDialogues.length + ' card(s) (count=' + window.__v257Renders + ')');
    } catch (e) {
      console.warn('[v257] fallback render fail:', e && e.message);
    }
  }

  // 起動
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

  window.__v257ForceRender = fallbackRender;

  console.log('[v257] init complete');
})();
