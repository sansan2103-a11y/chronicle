// v243-autocorrect-extended.js
// v242 の autocorrect を補強する追加パッチ
//
// 強化点:
//   1. 漢文/古文 / 古典中国語 / 文語 表現の置換テーブル拡張（60+ entries）
//   2. メタ文字列リーク除去（「既述情報により生成しました」等）
//   3. HTML / CSS / JSON-like ジャンク除去
//   4. fetch 起動確認用 unconditional counter（デバッグ）
//
// ガード: window.__v243Active

(function () {
  'use strict';
  if (window.__v243Active) {
    console.log('[v243] already active, skip');
    return;
  }
  window.__v243Active = true;
  console.log('[v243] autocorrect extended active');

  function getHeroName() {
    if (typeof S === 'undefined' || !S.cast || !S.cast.hero) return null;
    return (S.cast.hero.name && S.cast.hero.name.trim()) || null;
  }

  // ====================================================================
  // 拡張置換テーブル
  // ====================================================================
  var EXTENDED_SUBS = [
    // 漢文/文語語彙 → 現代日本語
    [/漆黒/g, '真っ暗'],
    [/茫漠とした/g, 'ぼんやりとした'],
    [/茫漠/g, 'ぼんやり'],
    [/脳裡/g, '頭の中'],
    [/脳裏/g, '頭の中'],
    [/何処迄/g, 'どこまで'],
    [/何処/g, 'どこ'],
    [/此処/g, 'ここ'],
    [/此の/g, 'この'],
    [/其の/g, 'その'],
    [/其処/g, 'そこ'],
    [/彼処/g, 'あそこ'],
    [/此/g, 'この'],
    [/其/g, 'その'],
    [/我等/g, '私たち'],
    [/我々/g, '私たち'],
    [/既述/g, '前述'],
    [/既述情報により生成しました[:：]?/g, ''],
    [/既述情報により生成/g, ''],
    [/応答です[:：]/g, ''],
    [/愚策/g, '愚かなこと'],
    [/肝要/g, '重要'],
    [/お題目/g, '問題'],
    [/些細なお題目/g, '小さな問題'],
    [/些少/g, 'わずか'],
    [/今しがた/g, 'さっき'],
    [/今し方/g, 'さっき'],
    [/此の況/g, 'この状況'],
    [/況や/g, 'まして'],
    [/況/g, '状況'],
    [/判然/g, 'はっきり'],
    [/判然としない/g, 'はっきりしない'],
    [/詰まる所/g, 'つまり'],
    [/詰まる/g, 'つまり'],
    [/兎に角/g, 'とにかく'],
    [/兎角/g, 'とかく'],
    [/迚も/g, 'とても'],
    [/暫く/g, 'しばらく'],
    [/須らく/g, '必ず'],
    [/須らくは/g, '必ずや'],
    [/已に/g, 'すでに'],
    [/凡そ/g, 'およそ'],
    [/恰も/g, 'まるで'],
    [/否応なし/g, 'いやおうなし'],
    [/瞬く間/g, 'あっという間'],
    [/瞬時/g, '一瞬'],
    [/朧げ/g, 'ぼんやり'],
    [/朧/g, 'ぼんやり'],
    [/夥しい/g, 'たくさんの'],
    [/夥しく/g, 'たくさん'],
    [/儘/g, 'まま'],
    [/侭/g, 'まま'],
    [/凄絶/g, 'すさまじい'],
    [/壮絶/g, 'すさまじい'],
    [/熾烈/g, '激しい'],
    [/熾烈な/g, '激しい'],
    [/誰彼/g, '誰か'],
    [/逐一/g, 'いちいち'],
    [/即ち/g, 'つまり'],
    [/乍ら/g, 'ながら'],
    [/併し/g, 'しかし'],
    [/併せて/g, 'あわせて'],
    [/恁の/g, 'こんな'],
    [/斯くも/g, 'こんなにも'],
    [/斯く/g, 'こう'],
    [/曰く/g, 'いわく'],
    [/曰く付き/g, 'いわく付き'],
    [/態と/g, 'わざと'],
    [/態々/g, 'わざわざ'],
    [/俄に/g, '急に'],
    [/俄か/g, '急'],
    [/俄/g, '急'],
    [/愈々/g, 'いよいよ'],
    [/弥/g, 'いよいよ'],
    [/全く以て/g, '全く'],
    [/以ての外/g, 'とんでもない'],
    [/今し方/g, 'さっき'],
    [/此度/g, '今回'],
    [/前以て/g, '前もって'],
    [/扠/g, 'さて'],
    [/抑も/g, 'そもそも'],
    [/抑/g, 'そもそも'],
    [/孰れ/g, 'どれ'],
    [/孰も/g, 'どれも'],
    // 簡体字 / 中国語特有 → 日本字
    [/没有/g, 'ない'],
    [/可是/g, 'でも'],
    [/不過/g, 'ただ'],
    [/而后/g, 'その後'],
    [/而后/g, 'その後'],
    [/同様に/g, '同じく'],
    [/总是/g, 'いつも'],
    [/總是/g, 'いつも'],
    [/総是/g, 'いつも'],
    [/无論/g, '無論'],
    [/无情/g, '無情'],
    [/无声/g, '声もなく'],
    [/无心/g, '無心'],
    [/无意/g, '無意'],
    [/无言/g, '無言'],
    [/没想到/g, '思いもよらなかった'],
    // 自分への言及の漢文化（v241 補強）
    [/吾輩/g, '私'],
    [/拙者/g, '私'],
    [/己/g, '自分'],
  ];

  // HTML / CSS / JSON-like ジャンク除去パターン
  function stripJunk(text) {
    // 二重括弧で囲まれた CSS/JSON-like
    text = text.replace(/\(\(\s*[^()]{0,200}\)\)/g, '');
    // ¥< … > のような円マーク混入 HTML タグ
    text = text.replace(/¥<[^>]{0,100}>/g, '');
    // CSS フラグメント: =""value or =":value" or class=""
    text = text.replace(/=""[^"]{0,80}"/g, '');
    text = text.replace(/=[\s'"]+[^'"\s>]{0,40}[\s'"]+/g, '');
    // ピン絵文字 + メタ
    text = text.replace(/[📍🔧⚙️]\s*[:：]\s*[^\s]{0,30}/g, '');
    // 単独の :未設定 / :default 等
    text = text.replace(/[:：]\s*(未設定|default|null|undefined|none)/g, '');
    // 末尾近くの em/px/rem 数値混入
    text = text.replace(/\.\s*\d+\s*(em|px|rem|%|vw|vh)/gi, '');
    // 連続するセミコロン・コロンの記号塊
    text = text.replace(/[;；][:：]+|[;:][\s;:]{2,}/g, '');
    return text;
  }

  function autoCorrect2(text) {
    if (!text || typeof text !== 'string') return text;
    var orig = text;
    var hero = getHeroName();

    // 主人公 → hero (念のため再適用)
    if (hero) text = text.replace(/主人公/g, hero);

    // 拡張置換
    EXTENDED_SUBS.forEach(function (pair) {
      text = text.replace(pair[0], pair[1]);
    });

    // ジャンク除去
    text = stripJunk(text);

    // 余分な空白・連続改行の正規化
    text = text.replace(/\n{3,}/g, '\n\n');
    text = text.replace(/[ 　]{2,}/g, ' ');

    if (text !== orig) {
      window.__v243CleanCount = (window.__v243CleanCount || 0) + 1;
    }
    return text;
  }

  // ====================================================================
  // Patch A: fetch をさらに wrap（v242 の上に重ねる）+ デバッグカウンタ
  // ====================================================================
  var origFetch = window.fetch;
  window.fetch = function (url, opts) {
    var urlStr = typeof url === 'string' ? url : (url && url.url) || '';
    var isAI = /openrouter\.ai|api\.anthropic\.com|api\.openai\.com/i.test(urlStr);

    if (isAI) {
      window.__v243FetchCount = (window.__v243FetchCount || 0) + 1;
    }

    var fetchPromise = origFetch.apply(this, arguments);
    if (!isAI) return fetchPromise;

    return fetchPromise.then(function (response) {
      if (!response || !response.ok) return response;
      var contentType = response.headers.get('content-type') || '';
      if (contentType.indexOf('application/json') === -1) return response;

      var cloned = response.clone();
      return cloned.text().then(function (text) {
        try {
          var json = JSON.parse(text);
          var modified = false;

          if (Array.isArray(json.choices)) {
            json.choices.forEach(function (ch) {
              if (ch && ch.message && typeof ch.message.content === 'string') {
                var c = autoCorrect2(ch.message.content);
                if (c !== ch.message.content) {
                  ch.message.content = c;
                  modified = true;
                }
              }
              if (ch && typeof ch.text === 'string') {
                var c2 = autoCorrect2(ch.text);
                if (c2 !== ch.text) {
                  ch.text = c2;
                  modified = true;
                }
              }
            });
          }
          if (Array.isArray(json.content)) {
            json.content.forEach(function (c) {
              if (c && typeof c.text === 'string') {
                var cc = autoCorrect2(c.text);
                if (cc !== c.text) {
                  c.text = cc;
                  modified = true;
                }
              }
            });
          }

          if (modified) {
            window.__v243InterceptCount = (window.__v243InterceptCount || 0) + 1;
            return new Response(JSON.stringify(json), {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers
            });
          }
        } catch (e) {
          console.warn('[v243] JSON intercept fail:', e);
        }
        return response;
      }).catch(function (e) {
        console.warn('[v243] response read fail:', e);
        return response;
      });
    });
  };
  window.fetch.__v243Hooked = true;

  // ====================================================================
  // Patch B: render フォールバック
  // ====================================================================
  function hookRender4() {
    if (typeof UI === 'undefined' || typeof UI.renderNarr !== 'function') return false;
    if (UI.renderNarr.__v243Hooked) return true;
    var orig = UI.renderNarr;
    UI.renderNarr = function (narr) {
      try {
        if (typeof narr === 'string') {
          var c = autoCorrect2(narr);
          if (c !== narr) {
            // S.turns の対象 turn を mutate
            if (typeof S !== 'undefined' && Array.isArray(S.turns)) {
              for (var i = S.turns.length - 1; i >= 0; i--) {
                if (S.turns[i].narrative === narr) {
                  S.turns[i].narrative = c;
                  if (typeof S.save === 'function') S.save();
                  break;
                }
              }
            }
            return orig.call(this, c);
          }
        }
      } catch (e) {}
      return orig.apply(this, arguments);
    };
    UI.renderNarr.__v243Hooked = true;
    return true;
  }

  if (!hookRender4()) {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (hookRender4() || tries > 60) clearInterval(iv);
    }, 100);
  }
})();
