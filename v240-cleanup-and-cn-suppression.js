// v240-cleanup-and-cn-suppression.js
// 目的:
//   1. プロバイダー UI を OpenRouter のみに整理
//   2. 中国語/漢文調出力の抑制（system prompt 強化 + recent フィルタ + 出力検出）
//
// 背景:
//   v239 で文脈注入が効くようになったが、汚染ターンを忠実に AI に渡すため
//   Magnum v4 72B が中国語/簡体字方向にドリフトし、最終的に簡体字オンリー出力に至るループが観測された。
//
// ガード: window.__v240Active

(function () {
  'use strict';
  if (window.__v240Active) {
    console.log('[v240] already active, skip');
    return;
  }
  window.__v240Active = true;
  console.log('[v240] cleanup + CN suppression active');

  // ====================================================================
  // 共通: 汚染判定
  // ====================================================================
  // 簡体字専用文字（中国本土のみで使用、和文では用いない）
  var SIMP_ONLY_RE = /[们这那说问觉让给过写读见个经实应发达学体会儿闷跱起所以这些那些不过可是他们她们它们他她问题开始继续变得]/g;
  // 漢文調定型表現
  var KANBUN_HEAD_RE = /^(突兀|騒擾|跫音|咆哮|低沈|巷議|質疑|残像|残骸|幻燈|索拉|只能|似乎|無情|沉黙|沉默|冷漠|無声)/;
  // 漢文助辞
  var KANBUN_PARTICLE_RE = /[矣焉之與于其所然亦乃即故]/g;

  function contamLevel(text) {
    if (!text) return { level: 0 };
    var len = text.length;
    if (len < 10) return { level: 0 };
    var cnRange = (text.match(/[一-鿿]/g) || []).length;
    var hira    = (text.match(/[぀-ゟ]/g) || []).length;
    var simp    = (text.match(SIMP_ONLY_RE) || []).length;
    var kPart   = (text.match(KANBUN_PARTICLE_RE) || []).length;
    var kanbun  = KANBUN_HEAD_RE.test(text.trim()) ? 1 : 0;
    var hiraR   = hira / len;
    var kanjiR  = cnRange / len;
    // 段階的判定
    if (simp >= 3) return { level: 3, reason: 'simp:' + simp };          // 完全に中国語
    if (hiraR < 0.10 && len > 30) return { level: 3, reason: 'no_hira' };// ひらがな極端に少ない
    if (simp >= 1 || kPart >= 2) return { level: 2, reason: 'simp/part' };// 中国語/古文混入
    if (hiraR < 0.20 && kanjiR > 0.40) return { level: 2, reason: 'kanbun' };
    if (kanbun) return { level: 1, reason: 'kanbun_head' };
    return { level: 0 };
  }

  function isHeavy(text) { return contamLevel(text).level >= 2; }
  function isAny(text)   { return contamLevel(text).level >= 1; }

  // ====================================================================
  // Patch A: プロバイダー UI 整理
  // =================================================================
  function applyProviderCleanup() {
    var prov = document.getElementById('cfgProvider');
    if (!prov) return false;

    // Anthropic, NovelAI のオプション削除
    ['anthropic', 'novelai'].forEach(function (val) {
      var opt = prov.querySelector('option[value="' + val + '"]');
      if (opt) opt.remove();
    });

    // 値が openrouter 以外なら強制
    if (prov.value !== 'openrouter') {
      prov.value = 'openrouter';
      try { prov.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
    }

    // 不要なフィールドを行ごと非表示
    ['cfgKey', 'cfgNaiKey', 'cfgModel'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var fld = el.closest('.fld');
      if (fld) fld.style.display = 'none';
      else el.style.display = 'none';
    });

    // S.cfg.provider 強制
    if (typeof S !== 'undefined' && S.cfg && S.cfg.provider !== 'openrouter') {
      S.cfg.provider = 'openrouter';
      if (typeof S.save === 'function') S.save();
    }
    return true;
  }

  // 設定 UI の表示時に再適用（DOM 再生成・他パッチの追記対策）
  function hookSettingsOpen() {
    if (typeof UI === 'undefined' || typeof UI.openSettings !== 'function') return false;
    if (UI.openSettings.__v240Hooked) return true;
    var origOpen = UI.openSettings;
    UI.openSettings = function () {
      var ret = origOpen.apply(this, arguments);
      setTimeout(applyProviderCleanup, 50);
      setTimeout(applyProviderCleanup, 300); // 念のためもう一度
      return ret;
    };
    UI.openSettings.__v240Hooked = true;
    return true;
  }

  // ====================================================================
  // Patch B: _buildSimplePrompt をラップして
  //   - sys に「簡体字/漢文禁止」ルール追加
  //   - recent から汚染ブロック除去
  // ====================================================================
  var ANTI_CN_RULES = [
    '【絶対言語制約】',
    '・出力は現代日本語のみ。簡体字（们/这/那/说/问/觉/让/给/过/写/读/见/个/经/实/应/发/达/学/体/会/儿/闷/跑/起/继续/变/得 等）絶対禁止。',
    '・漢文調・古典中国語の語彙（突兀/騒擾/跫音/咆哮/低沈/巷議/質疑/残像/索拉/只能/似乎/无情/沉黙/沉默/冷漠/無声 等）禁止。',
    '・文末・接続助辞「矣/焉/之/於/与/其/所/然/亦/乃/即/故」禁止。',
    '・「である」より「だ・です・ます・だった・していた」など現代日本語を優先。',
    '・固有名詞（ソーラ／カイル／リナ／スピカ等）は必ずカタカナ。中国語音訳（索拉/凯尔等）禁止。',
    '・HTML タグや実体参照（&lt; &gt; &amp; <br>）出力禁止。',
    '・1行1段落の原則。1段落内で <br> 等の改行記号を入れない。',
    '・直前ターンが古文/漢文調でも、現代日本語にトーンを戻して書く。'
  ].join('\n');

  function filterRecent(text) {
    if (!text) return text;
    // 直近ターンは v239 が "block1\n\n---\n\nblock2" 形式で連結している
    var blocks = text.split(/\n\n---\n\n/);
    var keptBlocks = [];
    blocks.forEach(function (b) {
      var lines = b.split(/\n/);
      var keepLines = [];
      lines.forEach(function (l) {
        // > で始まるプレイヤー入力行は無条件に残す
        if (/^>\s/.test(l)) { keepLines.push(l); return; }
        var info = contamLevel(l);
        if (info.level >= 2) {
          // 重度汚染行は削除
          return;
        }
        keepLines.push(l);
      });
      var bb = keepLines.join('\n').trim();
      if (bb) keptBlocks.push(bb);
    });
    var joined = keptBlocks.join('\n\n---\n\n');
    if (!joined) {
      return '[直前ターンに簡体字/漢文調が含まれていたため省略。現代日本語で新しい展開を書け]';
    }
    return joined;
  }

  function installPromptWrap2() {
    if (typeof window._buildSimplePrompt !== 'function') return false;
    if (window._buildSimplePrompt.__v240Hooked) return true;

    var orig = window._buildSimplePrompt;

    window._buildSimplePrompt = function (inputType, inputText) {
      var result;
      try {
        result = orig.apply(this, arguments);
      } catch (e) {
        throw e;
      }

      try {
        if (!result || typeof result.sys !== 'string' || typeof result.user !== 'string') return result;

        // sys に anti-CN ルールを追加（重複防止）
        if (result.sys.indexOf('絶対言語制約') === -1) {
          result.sys = ANTI_CN_RULES + '\n' + result.sys;
        }

        // recent ブロックを抽出 → フィルタ → 戻す
        var marker = '【直前の物語（参考。要約・繰返厳禁）】\n';
        var idx = result.user.indexOf(marker);
        if (idx !== -1) {
          var rest = result.user.slice(idx + marker.length);
          // recent の終端は次の \n\n【プレイヤー で区切られる
          var endIdx = rest.indexOf('\n\n【プレイヤー');
          if (endIdx !== -1) {
            var recent = rest.slice(0, endIdx);
            var filtered = filterRecent(recent);
            if (filtered !== recent) {
              result.user = result.user.slice(0, idx + marker.length) + filtered + rest.slice(endIdx);
              if (!window.__v240FilterCount) window.__v240FilterCount = 0;
              window.__v240FilterCount++;
            }
          }
        }
      } catch (e) {
        console.warn('[v240] prompt wrap fail:', e);
      }

      return result;
    };

    window._buildSimplePrompt.__v240Hooked = true;
    return true;
  }

  // ====================================================================
  // Patch C: AI 出力時に汚染検出 → ステータス警告
  // ====================================================================
  function hookRender() {
    if (typeof UI === 'undefined' || typeof UI.renderNarr !== 'function') return false;
    if (UI.renderNarr.__v240Hooked) return true;
    var orig = UI.renderNarr;
    UI.renderNarr = function (narr) {
      try {
        var text = (typeof narr === 'string') ? narr
                 : Array.isArray(narr) ? narr.join('\n')
                 : (narr && narr.text) ? narr.text
                 : '';
        var info = contamLevel(text);
        if (info.level >= 2) {
          console.warn('[v240] CN/Kanbun contamination detected:', info.reason, text.slice(0, 80));
          if (typeof UI.setStatus === 'function') {
            UI.setStatus('⚠ 中国語/漢文調を検知（' + info.reason + '）。「やり直す」推奨');
          }
          if (!window.__v240DetectCount) window.__v240DetectCount = 0;
          window.__v240DetectCount++;
        }
      } catch (e) {}
      return orig.apply(this, arguments);
    };
    UI.renderNarr.__v240Hooked = true;
    return true;
  }

  // ====================================================================
  // 起動
  // ====================================================================
  function tryInstall() {
    var a = applyProviderCleanup();
    var b = hookSettingsOpen();
    var c = installPromptWrap2();
    var d = hookRender();
    return a && b && c && d;
  }

  if (!tryInstall()) {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (tryInstall() || tries > 60) {
        clearInterval(iv);
        if (tries > 60) console.warn('[v240] install gave up after 60 retries');
      }
    }, 100);
  }
})();
