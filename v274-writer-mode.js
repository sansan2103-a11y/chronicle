// v274-writer-mode.js
// 目的: 「✨ 自由に展開」ボタンを追加し、LLM に物語を 1 ターン分自由に進めてもらう
//       通常の DO/SAY/STORY と違い、ユーザーの細かい指示なしでモデル主導の展開を依頼。
//       Hermes 4 の創造性を最大限活用するモード。
//
// 動作:
//   - composer の tool-row に「✨ 自由に展開」ボタンを追加
//   - クリック時: 「物語を自由に進めてください。プレイヤーの指示はありません。
//                  モデル独自の判断で意外性のある展開を 1 ターン分描写してください」と
//                  入力に設定して STORY モードで送信
//   - v273 + v275 のヒントが効いて、自由な展開が出る
//
// ガード: window.__v274Active

(function v274() {
  'use strict';
  if (window.__v274Active) return;
  window.__v274Active = true;
  console.log('[v274] writer-mode init');

  var WRITER_PROMPT = '物語を自由に進めてください。プレイヤーからの細かい指示はありません。\n' +
                      'モデル独自の判断で、意外性のある展開、新しいシーン要素、' +
                      '予期せぬ転換などを 1 ターン分自由に描写してください。\n' +
                      '直近の流れと整合性を保ちつつ、退屈なループから脱出する方向で。';

  function fireWriterTurn() {
    try {
      if (typeof S !== 'undefined' && S.inFlight) {
        console.log('[v274] in flight, skip');
        return;
      }
      if (typeof G !== 'object' || typeof G.submit !== 'function') {
        console.warn('[v274] G.submit not available');
        return;
      }
      // 入力欄に writer プロンプトを設定
      var inp = document.getElementById('inp');
      if (!inp) return;
      inp.value = WRITER_PROMPT;
      // モードを STORY に
      if (typeof G.setMode === 'function') {
        try { G.setMode('STORY'); } catch (e) {}
      }
      // submit
      console.log('[v274] firing writer turn');
      G.submit();
    } catch (e) {
      console.warn('[v274] fire err:', e && e.message);
    }
  }

  function injectButton() {
    if (document.getElementById('v274-writer-btn')) return true;
    var toolRow = document.querySelector('#composer .tool-row');
    if (!toolRow) return false;

    var btn = document.createElement('button');
    btn.id = 'v274-writer-btn';
    btn.className = 'tbtn';
    btn.textContent = '✨ 自由に展開';
    btn.title = 'モデルに自由な展開を任せる (Hermes 4 の創造性発揮)';
    btn.style.cssText = 'background: linear-gradient(135deg, rgba(160,138,240,.25), rgba(139,118,240,.15)) !important; color: var(--acc) !important; border-color: var(--acc) !important; font-weight: 600;';
    btn.onclick = fireWriterTurn;

    // 「続きを書く」の隣に追加
    var contBtn = Array.from(toolRow.querySelectorAll('button')).find(function (b) {
      return /続き/.test(b.textContent || '');
    });
    if (contBtn && contBtn.parentNode === toolRow) {
      toolRow.insertBefore(btn, contBtn.nextSibling);
    } else {
      toolRow.appendChild(btn);
    }

    console.log('[v274] writer button injected');
    return true;
  }

  injectButton();
  setTimeout(injectButton, 500);
  setTimeout(injectButton, 2000);
  setTimeout(injectButton, 5000);

  // tool-row が再生成された場合に再 install
  setInterval(injectButton, 3000);

  window.__v274 = {
    fireWriterTurn: fireWriterTurn,
    injectButton: injectButton
  };

  console.log('[v274] init complete');
})();
