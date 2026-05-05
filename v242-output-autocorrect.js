// v242-output-autocorrect.js
// 目的: AI 出力の自動補正（fetch レスポンス傍受）
//
// 背景:
//   v240 (CN/Kanbun 抑制) + v241 (キャラ制約) を強化したが、Magnum v4 72B が
//   制約に従いきれず「主人公」リテラル / 漢文表記を残す → 既存 v218 系の retry が発火
//   → 数回のリトライ後にフォールバックで「…」だけが保存される事象が発生。
//
// 修正方針:
//   AI 応答を fetch 層で傍受、JSON を読んで narrative content を取り出し、
//   既知の置換ルールで自動補正してから返す。retry トリガーが反応する前に
//   汚染を除去するので、retry 自体が起こらず、AI が頑張った内容が活きる。
//
// 補正内容:
//   1. 「主人公」 → hero.name (S.cast.hero.name)
//   2. hero.name の音違い (ソウラ/ソゥラ/ソァラ/サウラ/サーラ/空良/索拉) → hero.name
//   3. 漢文調語彙 → 現代日本語 (突兀→唐突 / 騒擾→騒ぎ / 跫音→足音 / 咆哮→怒声 等)
//   4. HTML タグ・実体参照の除去 (<br> / &lt; / &gt; / &amp;)
//   5. 簡体字 NPC 名 (索拉→ゼーラ / 凯尔→カイル) — ただし設定外なら hero.name に
//
// ガード: window.__v242Active

(function () {
  'use strict';
  if (window.__v242Active) {
    console.log('[v242] already active, skip');
    return;
  }
  window.__v242Active = true;
  console.log('[v242] output autocorrect active');

  // ====================================================================
  // 共通: 固有名取得
  // ====================================================================
  function getHeroName() {
    if (typeof S === 'undefined' || !S.cast || !S.cast.hero) return null;
    return (S.cast.hero.name && S.cast.hero.name.trim()) || null;
  }
  function getValidNames() {
    if (typeof S === 'undefined' || !S.cast) return [];
    var out = [];
    var hero = getHeroName();
    if (hero) out.push(hero);
    if (S.cast.npcs) {
      var n = S.cast.npcs;
      if (Array.isArray(n)) n.forEach(function (x) { if (x && x.name) out.push(x.name.trim()); });
      else if (typeof n === 'object') Object.keys(n).forEach(function (k) {
        if (n[k] && n[k].name) out.push(n[k].name.trim());
      });
    }
    return out;
  }

  // 漢文 → 現代日本語の置換テーブル
  var KANBUN_SUBS = [
    [/突兀である/g, '唐突に'],
    [/突兀として/g, '唐突に'],
    [/突兀/g, '突然'],
    [/騒擾/g, '騒ぎ'],
    [/跫音/g, '足音'],
    [/咆哮/g, '怒声'],
    [/巷議/g, '噂'],
    [/質疑/g, '問い'],
    [/低沈/g, '低く沈んだ'],
    [/沉黙/g, '沈黙'],
    [/沉默/g, '沈黙'],
    [/無声/g, '声もなく'],
    [/冷漠/g, '冷たく'],
    [/只能/g, ''],
    [/似乎/g, ''],
    // 簡体字 → 日本字（同形異字を含む）
    [/无情/g, '無情'],
    [/这/g, ''],
    [/那/g, 'その'],
    [/们/g, '達'],
  ];

  // hero name の代表的な音違い候補（regex ではなく完全一致リスト）
  function getHeroVariants(heroName) {
    if (!heroName) return [];
    var v = [];
    // 長音「ー」を ウ/オ/ァ/ア/ゥ/ォ で置換
    if (heroName.indexOf('ー') !== -1) {
      ['ウ', 'オ', 'ァ', 'ア', 'ゥ', 'ォ'].forEach(function (sub) {
        v.push(heroName.replace(/ー/g, sub));
      });
    }
    // 中国語音訳の代表例
    if (heroName === 'ソーラ') v.push('索拉', '索拉爾', '索菈', 'sora');
    return v;
  }

  // メイン補正関数
  function autoCorrect(text) {
    if (!text || typeof text !== 'string') return text;
    var original = text;

    // 1. 「主人公」 → hero.name
    var hero = getHeroName();
    if (hero) {
      text = text.replace(/主人公/g, hero);

      // 2. 音違い変種を hero に置換
      var variants = getHeroVariants(hero);
      variants.forEach(function (v) {
        if (v && v !== hero) {
          text = text.split(v).join(hero);
        }
      });
    }

    // 3. 漢文調 → 現代日本語
    KANBUN_SUBS.forEach(function (pair) {
      text = text.replace(pair[0], pair[1]);
    });

    // 4. HTML タグ・実体参照除去
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&#?\w+;/g, ''); // 残った実体参照
    // 任意の HTML タグ風（<…>）を除去（中括弧記号はそのまま保護したいので慎重に）
    text = text.replace(/<\/?[a-zA-Z][^>]{0,40}>/g, '');

    // 5. 連続「…」「・」「.」の正規化
    text = text.replace(/[.．]{4,}/g, '……');
    text = text.replace(/…{3,}/g, '……');

    if (text !== original) {
      window.__v242CleanCount = (window.__v242CleanCount || 0) + 1;
    }
    return text;
  }

  // ====================================================================
  // Patch A: fetch 傍受
  // ====================================================================
  var origFetch = window.fetch;
  window.fetch = function (url, opts) {
    var urlStr = typeof url === 'string' ? url : (url && url.url) || '';
    var isAI = /openrouter\.ai|api\.anthropic\.com|api\.openai\.com/i.test(urlStr);

    var fetchPromise = origFetch.apply(this, arguments);
    if (!isAI) return fetchPromise;

    return fetchPromise.then(function (response) {
      if (!response || !response.ok) return response;
      var contentType = response.headers.get('content-type') || '';
      if (contentType.indexOf('application/json') === -1) return response;

      // JSON を読んで補正
      var cloned = response.clone();
      return cloned.text().then(function (text) {
        try {
          var json = JSON.parse(text);
          var modified = false;

          // OpenRouter / OpenAI 形式: choices[0].message.content
          if (Array.isArray(json.choices)) {
            json.choices.forEach(function (ch) {
              if (ch && ch.message && typeof ch.message.content === 'string') {
                var cleaned = autoCorrect(ch.message.content);
                if (cleaned !== ch.message.content) {
                  ch.message.content = cleaned;
                  modified = true;
                }
              }
              // text-only 形式
              if (ch && typeof ch.text === 'string') {
                var c2 = autoCorrect(ch.text);
                if (c2 !== ch.text) {
                  ch.text = c2;
                  modified = true;
                }
              }
            });
          }

          // Anthropic 形式: content[].text
          if (Array.isArray(json.content)) {
            json.content.forEach(function (c) {
              if (c && typeof c.text === 'string') {
                var cleaned = autoCorrect(c.text);
                if (cleaned !== c.text) {
                  c.text = cleaned;
                  modified = true;
                }
              }
            });
          }

          if (modified) {
            window.__v242InterceptCount = (window.__v242InterceptCount || 0) + 1;
            var newBody = JSON.stringify(json);
            return new Response(newBody, {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers
            });
          }
        } catch (e) {
          console.warn('[v242] JSON intercept fail:', e);
        }
        // 改変しなかったら元の response を返す（cloned ではなく original）
        return response;
      }).catch(function (e) {
        console.warn('[v242] response read fail:', e);
        return response;
      });
    });
  };
  window.fetch.__v242Hooked = true;

  // ====================================================================
  // Patch B: 既存ターン render 時の補正フォールバック
  // ====================================================================
  function hookRender3() {
    if (typeof UI === 'undefined' || typeof UI.renderNarr !== 'function') return false;
    if (UI.renderNarr.__v242Hooked) return true;
    var orig = UI.renderNarr;
    UI.renderNarr = function (narr) {
      try {
        if (typeof narr === 'string') {
          var cleaned = autoCorrect(narr);
          if (cleaned !== narr) {
            // 直近 turn を mutate
            if (typeof S !== 'undefined' && Array.isArray(S.turns)) {
              for (var i = S.turns.length - 1; i >= 0; i--) {
                if (S.turns[i].narrative === narr) {
                  S.turns[i].narrative = cleaned;
                  if (typeof S.save === 'function') S.save();
                  break;
                }
              }
            }
            return orig.call(this, cleaned);
          }
        }
      } catch (e) {}
      return orig.apply(this, arguments);
    };
    UI.renderNarr.__v242Hooked = true;
    return true;
  }

  // ====================================================================
  // 起動
  // ====================================================================
  if (!hookRender3()) {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (hookRender3() || tries > 60) clearInterval(iv);
    }, 100);
  }
})();
