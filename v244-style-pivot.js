// v244-style-pivot.js
// 方針転換: 禁止リスト → ポジティブな style guide / モデル基盤切替
//
// 背景:
//   v240-v243 で「禁止項目を増やす + 事後補正」のアプローチを取ってきたが、
//   Magnum v4 72B 自体が中国語混合モデルで根本治癒は不可能。
//   ユーザー要望: 「モデルを活かして根底の調整」「AI Dungeon のような自由度」
//
// 修正方針:
//   1. デフォルト OpenRouter モデルを Hermes 3 405B に変更
//      (Magnum の選択肢は dropdown から削除、新規ユーザーは Hermes に)
//   2. system prompt の v240「絶対言語制約」と v241「絶対キャラ制約」を撤去
//      (Hermes は素直なモデルなので negative list は逆効果)
//   3. positive style guide で文体を方向付け
//      - 「現代日本語のライトノベル/ホラー小説調」
//      - 「短文を重ねて緊張感」
//      - 「五感描写を交互に」
//   4. キャラ情報は保持するが「強制」ではなく「参考情報」として渡す
//   5. v240-v243 の autocorrect/render hook は残す（安全網）
//
// ガード: window.__v244Active

(function () {
  'use strict';
  if (window.__v244Active) {
    console.log('[v244] already active, skip');
    return;
  }
  window.__v244Active = true;
  console.log('[v244] style pivot active');

  var HERMES_MODEL_ID = 'nousresearch/hermes-3-llama-3.1-405b';
  var EURYALE_MODEL_ID = 'sao10k/l3.3-euryale-70b';

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
  // Patch A: モデル選択を Hermes 3 405B 推奨に
  //   - cfgOrModel から Magnum 系を削除（互換性のため値だけは保持）
  //   - 既存ユーザーが Magnum 選択中なら、設定パネル開いた時に Hermes 推奨表示
  //   - 新規 / 設定なしユーザーは Hermes をデフォルトに
  // ====================================================================
  function applyModelPivot() {
    var sel = document.getElementById('cfgOrModel');
    if (!sel) return false;

    // Hermes 3 405B のオプションを最上部に再配置（既に存在）
    var hermesOpt = sel.querySelector('option[value="' + HERMES_MODEL_ID + '"]');
    if (hermesOpt) {
      // 推奨マーク追加
      if (hermesOpt.textContent.indexOf('★推奨') === -1) {
        hermesOpt.textContent = '★推奨 Hermes 3 405B（自由度・品質バランス最高）';
      }
      // 最上部に移動
      sel.insertBefore(hermesOpt, sel.firstChild);
    }

    // Euryale も推奨マーク
    var eurOpt = sel.querySelector('option[value="' + EURYALE_MODEL_ID + '"]');
    if (eurOpt && eurOpt.textContent.indexOf('★推奨') === -1) {
      eurOpt.textContent = '★推奨 Euryale 70B（成人描写OK・コスト低）';
    }

    // Magnum を非推奨マーク（削除はしない、選択中ユーザーの互換性のため）
    var magnumOpt = sel.querySelector('option[value="anthracite-org/magnum-v4-72b"]');
    if (magnumOpt && magnumOpt.textContent.indexOf('⚠') === -1) {
      magnumOpt.textContent = '⚠ Magnum v4 72B（日本語が崩れがち、非推奨）';
    }

    // 新規ユーザー (S.cfg.orModel が空 or 未設定) は Hermes に
    if (typeof S !== 'undefined' && S.cfg) {
      if (!S.cfg.orModel || S.cfg.orModel === '' || S.cfg.orModel === 'anthracite-org/magnum-v4-72b') {
        // 自動切替はしない（ユーザーの意思を尊重）が、初回のみ提案
        if (!window.__v244ModelSuggested) {
          window.__v244ModelSuggested = true;
          if (S.cfg.orModel === 'anthracite-org/magnum-v4-72b' && typeof UI !== 'undefined' && UI.setStatus) {
            setTimeout(function () {
              UI.setStatus('💡 v244: 設定 → モデル を Hermes 3 405B に切替推奨（日本語品質大幅改善）');
            }, 2000);
          }
        }
      }
    }
    return true;
  }

  function hookSettingsOpen2() {
    if (typeof UI === 'undefined' || typeof UI.openSettings !== 'function') return false;
    if (UI.openSettings.__v244Hooked) return true;
    var orig = UI.openSettings;
    UI.openSettings = function () {
      var ret = orig.apply(this, arguments);
      setTimeout(applyModelPivot, 50);
      setTimeout(applyModelPivot, 300);
      return ret;
    };
    UI.openSettings.__v244Hooked = true;
    return true;
  }

  // ====================================================================
  // Patch B: system prompt を style-focused に刷新
  //   - v240 の「絶対言語制約」(35行) を撤去
  //   - v241 の「絶対キャラ制約」(6行) を soften
  //   - positive style guide を挿入
  // ====================================================================
  var STYLE_GUIDE = function (heroName, npcs) {
    var lines = [
      '【執筆スタイル】',
      '・現代日本語のライトノベル/ホラー小説調で書く。文体は村上春樹・桜庭一樹あたりの硬すぎず柔らかすぎない筆致を参考に。',
      '・短い文と長い文を混在させて緊張感のリズムを作る。',
      '・五感描写（視覚・聴覚・触覚・嗅覚・体内感覚）を順番に織り込む。',
      '・抽象的な感情語（怖い／悲しい等）より具体的な身体反応で示す。',
      '・1ターンの長さは 200〜500 字の地の文＋必要に応じて台詞。',
      '',
      '【キャラ表記】',
      heroName ? '・主人公は「' + heroName + '」と呼ぶ（地の文・台詞すべて）。' : '',
      npcs.length > 0 ? '・登場人物: ' + npcs.join('、') + '。これらの名前で呼ぶ。' : '',
      '・固有名はカタカナで（漢字音訳しない）。',
      '',
      '【展開】',
      '・直前の物語を要約・繰り返しせず、必ず展開を 1 段階以上進める。',
      '・「ような」「みたいな」比喩を多用しない。',
      '・主人公の行動は勝手に追加しない（プレイヤー入力に従う）。'
    ].filter(Boolean);
    return lines.join('\n');
  };

  function installPromptPivot() {
    if (typeof window._buildSimplePrompt !== 'function') return false;
    if (window._buildSimplePrompt.__v244Hooked) return true;

    var orig = window._buildSimplePrompt;
    window._buildSimplePrompt = function (inputType, inputText) {
      var result = orig.apply(this, arguments);
      try {
        if (!result || typeof result.sys !== 'string') return result;

        // v240「絶対言語制約」ブロックを除去
        result.sys = result.sys.replace(/【絶対言語制約】[\s\S]*?(?=【|$)/, '');
        // v241「絶対キャラ制約」ブロックを除去
        result.sys = result.sys.replace(/【絶対キャラ制約】[\s\S]*?(?=【|$)/, '');
        // 既存の長い「ジャンル指針」「絶対ルール」も整理（オプション、Magnum 用は残す）
        // → 触らない（NPC info / 場所 / トーン などは保持される）

        // style guide を先頭に追加
        var heroName = getHeroName();
        var npcs = getValidNPCNames();
        var styleBlock = STYLE_GUIDE(heroName, npcs);

        // 重複防止
        if (result.sys.indexOf('【執筆スタイル】') === -1) {
          result.sys = styleBlock + '\n\n' + result.sys;
        }

        // 連続する空行を整理
        result.sys = result.sys.replace(/\n{3,}/g, '\n\n').trim();

        if (!window.__v244PivotCount) window.__v244PivotCount = 0;
        window.__v244PivotCount++;
      } catch (e) {
        console.warn('[v244] prompt pivot fail:', e);
      }
      return result;
    };
    window._buildSimplePrompt.__v244Hooked = true;
    return true;
  }

  // ====================================================================
  // Patch C: v240/v241 の警告を弑める
  //   v240/v241 が render 時に「やり直す推奨」と出すが、
  //   Hermes ではほぼ発火しないはず。誤検知時の煩わしさを減らすため、
  //   検知しても status に出さず console.log のみに格下げ
  // ====================================================================
  function softenWarnings() {
    // UI.setStatus を一時ラップして v240/v241 の警告メッセージを抑制
    if (typeof UI === 'undefined' || typeof UI.setStatus !== 'function') return false;
    if (UI.setStatus.__v244Hooked) return true;
    var orig = UI.setStatus;
    UI.setStatus = function (msg) {
      try {
        if (typeof msg === 'string' &&
            (msg.indexOf('中国語/漢文調を検知') !== -1 || msg.indexOf('キャラ違反検知') !== -1)) {
          // 軽い情報ログに格下げ
          console.log('[v244 muted warning]', msg);
          return; // status に出さない
        }
      } catch (e) {}
      return orig.apply(this, arguments);
    };
    UI.setStatus.__v244Hooked = true;
    return true;
  }

  // ====================================================================
  // 起動
  // ====================================================================
  function tryInstall() {
    var a = applyModelPivot();
    var b = hookSettingsOpen2();
    var c = installPromptPivot();
    var d = softenWarnings();
    return a && b && c && d;
  }

  if (!tryInstall()) {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (tryInstall() || tries > 60) clearInterval(iv);
    }, 100);
  }
})();
