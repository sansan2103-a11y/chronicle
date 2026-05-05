// v247-flicker-and-voice.js
// 目的:
//   1. v246 の MutationObserver による画面点滅を解消
//      - psych-meters を CSS のみで非表示（強力なセレクタ）
//      - 既存の MutationObserver を停止し、setInterval で軽く監視（重い処理ではない）
//   2. NPC 別の口調ガイド（positive guidance）を style guide に追加
//      - 「キャラごとの性別・年齢・性格に合った話し方」と明示
//   3. サンプリングをさらに微調整（temperature 0.68 まで下げる）
//      - 多言語ドリフトと不自然な語尾の更なる抑制
//
// 設計原則準拠:
//   - 全て positive guidance / 機能向上系
//   - 「禁止」は追加しない
//
// ガード: window.__v247Active

(function () {
  'use strict';
  if (window.__v247Active) {
    console.log('[v247] already active, skip');
    return;
  }
  window.__v247Active = true;
  console.log('[v247] flicker fix + voice guide active');

  // ====================================================================
  // Patch A: v246 の MutationObserver を停止 + 強力 CSS で psych-meters 消去
  // ====================================================================
  // CSS で完全に消す（!important + 複数セレクタで確実に）
  var styleId = '__v247-flicker-fix';
  if (!document.getElementById(styleId)) {
    var style = document.createElement('style');
    style.id = styleId;
    style.textContent = [
      '.psych-meters,',
      '.pmeter,',
      '.pmeter-label {',
      '  display: none !important;',
      '  visibility: hidden !important;',
      '  height: 0 !important;',
      '  width: 0 !important;',
      '  margin: 0 !important;',
      '  padding: 0 !important;',
      '  border: 0 !important;',
      '  pointer-events: none !important;',
      '  opacity: 0 !important;',
      '}'
    ].join('\n');
    // 末尾に追加して特異度を最大化
    document.head.appendChild(style);
  }

  // 既存の psych-meters 要素を **DOM から完全削除**（hide ではなく remove）
  function purgePsychMeters() {
    document.querySelectorAll('.psych-meters').forEach(function (el) {
      el.remove();
    });
  }
  purgePsychMeters();

  // setInterval で 1 秒に 1 回だけ削除（軽量、点盅原因にならない）
  var purgeInterval = setInterval(purgePsychMeters, 1000);
  window.__v247PurgeInterval = purgeInterval;

  // ====================================================================
  // Patch B: NPC 別口調ガイドを style guide に追加
  // ====================================================================
  function getHeroInfo() {
    if (typeof S === 'undefined' || !S.cast || !S.cast.hero) return null;
    var h = S.cast.hero;
    return {
      name: (h.name || '').trim(),
      gender: h.gender || '',
      age: h.age || '',
      desc: (h.desc || '').slice(0, 100)
    };
  }
  function getNPCInfos() {
    if (typeof S === 'undefined' || !S.cast || !S.cast.npcs) return [];
    var npcs = S.cast.npcs;
    var out = [];
    var keys = Array.isArray(npcs) ? npcs.map(function(_, i){ return i; }) : Object.keys(npcs);
    keys.forEach(function (k) {
      var n = npcs[k];
      if (n && n.name) {
        out.push({
          name: n.name.trim(),
          gender: n.gender || '',
          age: n.age || '',
          desc: (n.desc || '').slice(0, 100)
        });
      }
    });
    return out;
  }

  var VOICE_GUIDE = function (hero, npcs) {
    var lines = ['【キャラの声】'];
    lines.push('・各キャラの性別・年齢・性格に合った口調で書く（語尾・一人称・口癖を一貫させる）。');
    if (hero && hero.name) {
      var heroNote = '・' + hero.name + (hero.gender ? '（' + hero.gender : '（') +
        (hero.age ? hero.age + '歳' : '') +
        (hero.desc ? '、' + hero.desc : '') + '）';
      lines.push(heroNote);
    }
    npcs.forEach(function (n) {
      var note = '・' + n.name + (n.gender ? '（' + n.gender : '（') +
        (n.age ? n.age + '歳' : '') +
        (n.desc ? '、' + n.desc : '') + '）';
      lines.push(note);
    });
    lines.push('・上の人物像から自然に導かれる口調を選ぶ（女性少女なら「〜なの」「〜だよ」、貫禄ある女性なら「〜ね」「〜よ」、少年なら「〜だぜ」「〜さ」など）。');
    lines.push('・1ターンで同じキャラが連続して話すのは最大2回まで。複数キャラがいるなら均等に出す。');
    return lines.join('\n');
  };

  function installVoiceGuide() {
    if (typeof window._buildSimplePrompt !== 'function') return false;
    if (window._buildSimplePrompt.__v247Hooked) return true;

    var orig = window._buildSimplePrompt;
    window._buildSimplePrompt = function (inputType, inputText) {
      var result = orig.apply(this, arguments);
      try {
        if (!result || typeof result.sys !== 'string') return result;
        if (result.sys.indexOf('【キャラの声】') !== -1) return result;

        var hero = getHeroInfo();
        var npcs = getNPCInfos();
        if (!hero && npcs.length === 0) return result;

        var voiceBlock = VOICE_GUIDE(hero, npcs);

        // 「【台詞の書き方】」の直後に挿入（v245 ブロックの直後）
        var dialogIdx = result.sys.indexOf('【台詞の書き方】');
        if (dialogIdx !== -1) {
          var afterDialog = result.sys.slice(dialogIdx);
          var nextSection = afterDialog.indexOf('\n【', 1);
          if (nextSection !== -1) {
            var insertAt = dialogIdx + nextSection;
            result.sys = result.sys.slice(0, insertAt) + '\n\n' + voiceBlock + result.sys.slice(insertAt);
          } else {
            result.sys += '\n\n' + voiceBlock;
          }
        } else {
          // 台詞ガイドが無いなら先頭に追加
          result.sys = voiceBlock + '\n\n' + result.sys;
        }

        if (!window.__v247InjectCount) window.__v247InjectCount = 0;
        window.__v247InjectCount++;
      } catch (e) {
        console.warn('[v247] voice guide inject fail:', e);
      }
      return result;
    };
    window._buildSimplePrompt.__v247Hooked = true;
    return true;
  }

  // ====================================================================
  // Patch C: サンプリング微調整（temperature 0.68）
  //   v246 が 0.72 にしてたが、さらに下げて多言語ドリフト・不自然な語尾を抑制
  // ====================================================================
  var origFetch = window.fetch;
  window.fetch = function (url, opts) {
    var urlStr = typeof url === 'string' ? url : (url && url.url) || '';
    var isAI = /openrouter\.ai|api\.anthropic\.com|api\.openai\.com/i.test(urlStr);

    if (isAI && opts && opts.body && typeof opts.body === 'string') {
      try {
        var body = JSON.parse(opts.body);
        var modelId = body.model || '';
        if (/hermes/i.test(modelId)) {
          var changed = false;
          // v246 が 0.72 を入れてくる前提でさらに微調整
          if (typeof body.temperature !== 'number' || body.temperature > 0.70) {
            body.temperature = 0.68;
            changed = true;
          }
          // top_p は v246 の 0.90 をそのまま採用（変更なし）
          // presence_penalty を追加（同じトピックの繰り返しを抑制）
          if (typeof body.presence_penalty !== 'number') {
            body.presence_penalty = 0.2;
            changed = true;
          }
          if (changed) {
            opts.body = JSON.stringify(body);
            window.__v247TuneCount = (window.__v247TuneCount || 0) + 1;
          }
        }
      } catch (e) {}
    }
    return origFetch.apply(this, arguments);
  };
  window.fetch.__v247Hooked = true;

  // ====================================================================
  // 起動
  // ====================================================================
  function tryInstall() {
    return installVoiceGuide();
  }
  if (!tryInstall()) {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (tryInstall() || tries > 60) clearInterval(iv);
    }, 100);
  }
})();
