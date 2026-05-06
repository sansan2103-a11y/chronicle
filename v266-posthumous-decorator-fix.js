// v266-posthumous-decorator-fix.js
// 目的: v264 の posthumous スタイル適用が DOM セレクタ不一致で動かないバグを修正
//
// 観測:
//   会話カード (.v101-dlg-card) の構造は v200/v201/v257 によって異なる:
//   - 名前 div は class 無し、inline style に "color: var(--acc, #8b76f0)"
//   - 本文 div も class 無し、inline style に "color: var(--tx, #e0dcf0)"
//   v264 の decoratePosthumous は ".v101-dlg-name" を探していたため一致せず
//
// 修正方針:
//   - カードの 2 番目以降の子 div を再帰的に探索し、テキストから speaker/text を抽出
//   - speaker は「色 var(--acc)」を持つ div の textContent
//   - text は「color var(--tx)」を持つ div、もしくは「」で囲まれた本文
//   - posthumous マップでマッチしたら v264-posthumous class を付与
//
// ガード: window.__v266Active

(function v266() {
  'use strict';
  if (window.__v266Active) return;
  window.__v266Active = true;
  console.log('[v266] posthumous decorator fix init');

  function extractCardSpeakerText(card) {
    var name = '';
    var text = '';
    // 全ての descendant div を確認
    var divs = card.querySelectorAll('div');
    for (var i = 0; i < divs.length; i++) {
      var d = divs[i];
      var st = d.getAttribute('style') || '';
      var cls = d.className || '';
      // 名前: var(--acc) を含む inline style もしくは class .v101-dlg-name
      if (!name && (/var\(--acc/.test(st) || /v101-dlg-name/.test(cls))) {
        name = (d.textContent || '').trim();
        continue;
      }
      // 本文: var(--tx) を含む inline style もしくは class .v101-dlg-text
      if (!text && (/var\(--tx/.test(st) || /v101-dlg-text/.test(cls))) {
        text = (d.textContent || '').trim();
        continue;
      }
    }
    // フォールバック: 「」括弧内の本文を抽出
    if (!text) {
      var allText = card.textContent || '';
      var m = allText.match(/「([^「」]+)」/);
      if (m) text = m[1].trim();
    }
    // 「...」を取り除く
    text = text.replace(/^「|」$/g, '').trim();
    return { name: name, text: text };
  }

  function decoratePosthumous() {
    try {
      var s = JSON.parse(localStorage.getItem('chr6') || '{}');
      var turns = s.turns || [];
      var posthumousSet = {};
      turns.forEach(function (t) {
        (t.dialogues || []).forEach(function (d) {
          if (d && d.posthumous && d.speaker && d.text) {
            posthumousSet[d.speaker + '||' + d.text.trim()] = true;
          }
        });
      });
      var stream = document.getElementById('dialogue-stream');
      if (!stream) return;
      var cards = stream.querySelectorAll('.v101-dlg-card');
      var matched = 0;
      cards.forEach(function (card) {
        var info = extractCardSpeakerText(card);
        if (!info.name) return;
        var key = info.name + '||' + info.text;
        if (posthumousSet[key]) {
          card.classList.add('v264-posthumous');
          matched++;
        } else {
          card.classList.remove('v264-posthumous');
        }
      });
      window.__v266LastMatched = matched;
    } catch (e) {
      console.warn('[v266] decorate err:', e && e.message);
    }
  }

  // 既存の v264.decoratePosthumous を上書き (もし読み込み済みなら)
  if (window.__v264) {
    window.__v264.decoratePosthumous = decoratePosthumous;
  }

  // MutationObserver で会話カード追加時に decorate
  function installDecorator() {
    var stream = document.getElementById('dialogue-stream');
    if (!stream) return false;
    if (stream.__v266Decorated) return true;
    var pending = false;
    var mo = new MutationObserver(function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        decoratePosthumous();
      });
    });
    mo.observe(stream, { childList: true, subtree: true });
    stream.__v266Decorated = true;
    decoratePosthumous();
    return true;
  }

  installDecorator();
  setTimeout(installDecorator, 500);
  setTimeout(installDecorator, 2000);
  setTimeout(installDecorator, 5000);

  // 起動後 dialogues に posthumous を反映するため postProcessAllTurns を一度呼ぶ
  setTimeout(function () {
    if (window.__v259 && typeof window.__v259.postProcessAllTurns === 'function') {
      try { window.__v259.postProcessAllTurns(); } catch (e) {}
    }
    decoratePosthumous();
  }, 2500);
  setTimeout(decoratePosthumous, 4000);
  setTimeout(decoratePosthumous, 8000);

  window.__v266 = {
    decoratePosthumous: decoratePosthumous,
    extractCardSpeakerText: extractCardSpeakerText
  };

  console.log('[v266] init complete');
})();
