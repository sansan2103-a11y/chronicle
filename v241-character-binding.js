// v241-character-binding.js
// 目的: キャラ設定の prompt 反映を強化
//
// 観測されたバグ:
//   1. AI が narrative で「主人公は」とリテラル表記する（「ソーラは」を使わない）
//   2. AI が設定外の名前（ソウラ／カイル等）を捏造、会話ログに混入
//   3. プレイヤー入力に「主人公」が含まれていると、AI がそれをミラーして literal 表記を強化
//
// 修正:
//   A. プレイヤー入力 / recent context の「主人公」を hero.name に置換してから AI に渡す
//   B. 「絶対キャラ制約」ルールを system prompt に最優先で挿入
//   C. AI 出力に登場するカタカナ名で設定外のものを検知 → ステータス警告
//   D. ネームバリデータ (音違い検知): ソウラ／サウラ／空良 等、hero.name と類似する音違い名を警告
//
// ガード: window.__v241Active

(function () {
  'use strict';
  if (window.__v241Active) {
    console.log('[v241] already active, skip');
    return;
  }
  window.__v241Active = true;
  console.log('[v241] character binding active');

  // ====================================================================
  // 共通ヘルパ
  // ====================================================================
  function getHeroName() {
    if (typeof S === 'undefined' || !S.cast || !S.cast.hero) return null;
    return (S.cast.hero.name && S.cast.hero.name.trim()) || null;
  }

  function getValidNPCNames() {
    if (typeof S === 'undefined' || !S.cast || !S.cast.npcs) return [];
    var npcs = S.cast.npcs;
    var out = [];
    if (Array.isArray(npcs)) {
      npcs.forEach(function (n) { if (n && n.name && n.name.trim()) out.push(n.name.trim()); });
    } else if (typeof npcs === 'object') {
      Object.keys(npcs).forEach(function (k) {
        var n = npcs[k];
        if (n && n.name && n.name.trim()) out.push(n.name.trim());
      });
    }
    return out;
  }

  function getAllValidNames() {
    var hero = getHeroName();
    var npcs = getValidNPCNames();
    return (hero ? [hero] : []).concat(npcs);
  }

  // hero.name に対する音違いパターンを生成
  // 「ソーラ」→ ソウラ／ソラ／ソゥラ／サウラ／サーラ／空良 等の検出
  function makeSimilarNamesPatterns(heroName) {
    if (!heroName || heroName.length < 2) return [];
    var patterns = [];
    // 同じ長さ ±1 のカタカナ列で 1-2 文字違いを許容
    // 簡易: heroName の各文字を ?(任意のカタカナ) に置き換えたパターン
    for (var i = 0; i < heroName.length; i++) {
      var pat = heroName.slice(0, i) + '[゠-ヿ]' + heroName.slice(i + 1);
      patterns.push(new RegExp(pat, 'g'));
    }
    // 長音「ー」を「ウ／オ／ァ」と入れ替えた候補
    if (heroName.indexOf('ー') !== -1) {
      ['ウ', 'オ', 'ァ', 'ア'].forEach(function (sub) {
        patterns.push(new RegExp(heroName.replace(/ー/g, sub), 'g'));
      });
    }
    return patterns;
  }

  // ====================================================================
  // Patch A: _buildSimplePrompt をラップして
  //   - 入力テキストの「主人公」を hero.name に置換
  //   - 「絶対キャラ制約」ルールを sys に追加
  //   - user prompt 内の残った「主人公」も置換
  // ====================================================================
  function installPromptWrap3() {
    if (typeof window._buildSimplePrompt !== 'function') return false;
    if (window._buildSimplePrompt.__v241Hooked) return true;
    var orig = window._buildSimplePrompt;

    window._buildSimplePrompt = function (inputType, inputText) {
      var heroName = getHeroName();

      // 入力の「主人公」→ hero.name 置換
      var processedInput = inputText;
      if (heroName && typeof inputText === 'string') {
        processedInput = inputText.replace(/主人公/g, heroName);
      }

      var result = orig.call(this, inputType, processedInput);

      try {
        if (!result || typeof result.sys !== 'string' || typeof result.user !== 'string') return result;

        // 重複防止
        if (result.sys.indexOf('絶対キャラ制約') === -1) {
          var npcs = getValidNPCNames();
          var allNames = getAllValidNames();

          var rules = ['【絶対キャラ制約】'];
          if (heroName) {
            rules.push('・主人公の表記は必ず「' + heroName + '」固定。「主人公」「彼女」「彼」「キャラ」「あなた」など代名詞・総称での表記禁止（地の文・台詞・内心すべて）。');
            rules.push('・「' + heroName + '」の音違い（ソウラ／サウラ／ソラ／ソォラ／空良／索拉 等の類似名）禁止。');
          }
          if (npcs.length > 0) {
            rules.push('・登場可能 NPC は【' + npcs.join('、') + '】の ' + npcs.length + ' 人のみ。それ以外（カイル・ソウラ・新規キャラ）の登場・言及・名前出し禁止。');
          } else {
            rules.push('・本シーンに NPC は未配置。新規 NPC・第三者の登場禁止。');
          }
          if (allNames.length > 0) {
            rules.push('・登場可能な全キャラ: ' + allNames.join('／') + '。これらの名前は必ずカタカナで（漢字・簡体字音訳禁止）。');
          }
          rules.push('・「」内の発話は必ず登場キャラ（' + (allNames.join('／') || '主人公のみ') + '）のみ。それ以外の発話者を捏造したらルール違反。');
          rules.push('・narrative 中で主人公を「主人公」と書いたらルール違反。最初の発生から「' + (heroName || '指定名') + '」を使うこと。');

          result.sys = rules.join('\n') + '\n' + result.sys;
        }

        // user prompt 内の「主人公」→ hero.name にも適用（recent や入力に残っているもの）
        if (heroName) {
          // ただし「（主人公）」や「主人公（ソーラ）」のような表記は触らないため、後ろが '（' でないものに限定
          // 簡略化: すべて置換
          result.user = result.user.replace(/主人公/g, heroName);
          if (!window.__v241ReplaceCount) window.__v241ReplaceCount = 0;
          window.__v241ReplaceCount++;
        }
      } catch (e) {
        console.warn('[v241] prompt wrap fail:', e);
      }

      return result;
    };

    window._buildSimplePrompt.__v241Hooked = true;
    return true;
  }

  // ====================================================================
  // Patch B: AI 出力の hallucinated name 検知
  // ====================================================================
  function hookRender2() {
    if (typeof UI === 'undefined' || typeof UI.renderNarr !== 'function') return false;
    if (UI.renderNarr.__v241Hooked) return true;
    var orig = UI.renderNarr;

    UI.renderNarr = function (narr) {
      try {
        var text = (typeof narr === 'string') ? narr
                 : Array.isArray(narr) ? narr.join('\n')
                 : (narr && narr.text) ? narr.text
                 : '';

        var heroName = getHeroName();
        var validNames = getAllValidNames();
        var problems = [];

        // (1) 「主人公」リテラル使用検知
        if (text.indexOf('主人公') !== -1) {
          problems.push('「主人公」リテラル');
        }

        // (2) hero.name の音違い検知
        if (heroName) {
          var patterns = makeSimilarNamesPatterns(heroName);
          var found = new Set();
          patterns.forEach(function (re) {
            var m;
            re.lastIndex = 0;
            while ((m = re.exec(text)) !== null) {
              var name = m[0];
              if (name !== heroName && validNames.indexOf(name) === -1) {
                found.add(name);
              }
            }
          });
          if (found.size > 0) {
            problems.push('音違い名: ' + Array.from(found).join('/'));
           }
        }

        // (3) 「」内の話者名で⠮���定外のものの検知
        // パターン: NAME「...」 もしくは NAME君「...」 等
        var speakerRe = /([゠-ヿ]{R,8})(?:__\�l牲|含|さん|幻君くん|ちゃん|様)?[「『]/g;
        var speakers = new Set();
        var sm;
        while ((sm = speakerRe.exec(text)) !== null) {
          var spk = sm[1];
          if (validNames.indexOf(spk) === -1) {
            speakers.add(spk);
          }
        }
        if (speakers.size > 0) {
          problems.push('未現裆崋 : ' + Array.from(speakers).join('/'));
        }

        if (problems.length > 0) {
          console.warn('[v241] character violation:', problems.join(' | '), text.slice(0, 80));
          if (typeof UI.setStatus === 'function') {
            UI.setStatus('⚠ キャラ違反検知（' + problems.join(' | ') + '）。「やり直す」推奨');
          }
          if (!window.__v241ViolationCount) window.__v241ViolationCount = 0;
          window.__v241ViolationCount++;
        }
      } catch (e) {}
      return orig.apply(this, arguments);
    };

    UI.renderNarr.__v241Hooked = true;
    return true;
  }

  // ====================================================================
  // 起動
  // ====================================================================
  function tryInstall() {
    var a = installPromptWrap3();
    var b = hookRender2();
    return a && b;
  }

  if (!tryInstall()) {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (tryInstall() || tries > 60) {
        clearInterval(iv);
        if (tries > 60) console.warn('[v241] install gave up after 60 retries');
      }
    }, 100);
  }
})();
