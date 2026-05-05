// v245-dialogue-format.js
// 目的: AI が台詞を「キャラ名「セリフ」」形式で書くように方向付け
//
// 背景:
//   v244 で system prompt を「JSONや見出し禁止、自然な地の文で書く」に刷新したため、
//   AI が台詞を明示的な「キャラ名「セリフ」」形式で書かなくなり、内心や引用として
//   narrative に溶け込ませる傾向が強まった。
//
//   結果、会話ログ（キャラ名「セリフ」を抽出して表示する仕組み）が空のまま。
//
// 修正方針（設計原則準拠）:
//   - 「禁止」ではなく「形式の方向付け」を positive guidance として追加
//   - v244 style guide の「執筆スタイル」セクションに 1 ブロック追加
//   - 例示も含めて自然な動機を示す
//
// ガード: window.__v245Active

(function () {
  'use strict';
  if (window.__v245Active) {
    console.log('[v245] already active, skip');
    return;
  }
  window.__v245Active = true;
  console.log('[v245] dialogue format guidance active');

  function getHeroName() {
    if (typeof S === 'undefined' || !S.cast || !S.cast.hero) return null;
    return (S.cast.hero.name && S.cast.hero.name.trim()) || null;
  }
  function getValidNPCNames() {
    if (typeof S === 'undefined' || !S.cast || !S.cast.npcs) return [];
    var npcs = S.cast.npcs;
    var out = [];
    if (Array.isArray(npcs)) npcs.forEach(function (n) { if (n && n.name) out.push(n.name.trim()); });
    else if (typeof npcs === 'object') Object.keys(npcs).forEach(function (k) {
      if (npcs[k] && npcs[k].name) out.push(npcs[k].name.trim());
    });
    return out;
  }

  // ====================================================================
  // 台詞形式ガイド（実例ベース）
  // ====================================================================
  var DIALOGUE_GUIDE = function (heroName, npcs) {
    var exampleSpeaker = npcs[0] || heroName || 'スピカ';
    var lines = [
      '【台詞の書き方】',
      '・キャラが発話するシーンでは「キャラ名「セリフ内容」」の形式で書く。',
      '・例:',
      '  ' + exampleSpeaker + '「逃げるよ、急いで」',
      '  ' + (heroName || 'ソーラ') + '「待って、これは何…？」',
      '・地の文（情景描写・行動・内心）と台詞を交互に混ぜると自然。',
      '・1ターンに台詞が 0 個でも 3〜4 個でも OK（シーンに応じて）。',
      '・内心の独白は《》で囲んでもよい（例: 《これは罠かもしれない》）。'
    ];
    return lines.join('\n');
  };

  function installDialogueGuide() {
    if (typeof window._buildSimplePrompt !== 'function') return false;
    if (window._buildSimplePrompt.__v245Hooked) return true;

    var orig = window._buildSimplePrompt;
    window._buildSimplePrompt = function (inputType, inputText) {
      var result = orig.apply(this, arguments);
      try {
        if (!result || typeof result.sys !== 'string') return result;

        // 重複防止
        if (result.sys.indexOf('【台詞の書き方】') !== -1) return result;

        var heroName = getHeroName();
        var npcs = getValidNPCNames();
        var guide = DIALOGUE_GUIDE(heroName, npcs);

        // 「【執筆スタイル】」のブロック直後（次の【...】の前）に挿入
        var styleIdx = result.sys.indexOf('【執筆スタイル】');
        if (styleIdx !== -1) {
          // 「【執筆スタイル】」セクションの終わり（次の「【」）を探す
          var afterStyle = result.sys.slice(styleIdx);
          var nextSectionRel = afterStyle.indexOf('\n【', 1);
          if (nextSectionRel !== -1) {
            var insertAt = styleIdx + nextSectionRel;
            result.sys = result.sys.slice(0, insertAt) + '\n\n' + guide + result.sys.slice(insertAt);
          } else {
            // 次のセクションが無ければ末尾に追加
            result.sys += '\n\n' + guide;
          }
        } else {
          // v244 の style guide が無い場合は先頭に追加
          result.sys = guide + '\n\n' + result.sys;
        }

        if (!window.__v245InjectCount) window.__v245InjectCount = 0;
        window.__v245InjectCount++;
      } catch (e) {
        console.warn('[v245] dialogue guide inject fail:', e);
      }
      return result;
    };
    window._buildSimplePrompt.__v245Hooked = true;
    return true;
  }

  if (!installDialogueGuide()) {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (installDialogueGuide() || tries > 60) clearInterval(iv);
    }, 100);
  }
})();
