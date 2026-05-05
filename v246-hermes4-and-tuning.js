// v246-hermes4-and-tuning.js
// 目的: Hermes 4 をデフォルトに、Hermes 用サンプリングをチューニング、UI 整理
//
// 実装:
//   A. OpenRouter モデル一覧に Hermes 4 405B / 70B を追加（★最推奨を Hermes 4 405B に）
//   B. Hermes 系の sampling パラメータを最適化（temperature 0.72, top_p 0.90）
//   C. 作家ノートが空欄なら positive 言語指示をデフォルト挿入
//   D. .psych-meters（空 NPC 心理メーター）を UI から非表示
//
// 設計原則準拠:
//   - 全て positive guidance / 機能向上系
//   - 「禁止」は追加しない
//
// ガード: window.__v246Active

(function () {
  'use strict';
  if (window.__v246Active) {
    console.log('[v246] already active, skip');
    return;
  }
  window.__v246Active = true;
  console.log('[v246] hermes4 + tuning active');

  var HERMES4_405B = 'nousresearch/hermes-4-405b';
  var HERMES4_70B = 'nousresearch/hermes-4-70b';
  var HERMES3_405B = 'nousresearch/hermes-3-llama-3.1-405b';

  // ====================================================================
  // Patch A: OpenRouter モデル一覧に Hermes 4 を追加
  // ====================================================================
  function applyModelUpdate() {
    var sel = document.getElementById('cfgOrModel');
    if (!sel) return false;

    // Hermes 4 405B が無ければ追加
    if (!sel.querySelector('option[value="' + HERMES4_405B + '"]')) {
      var opt = document.createElement('option');
      opt.value = HERMES4_405B;
      opt.textContent = '★最推奨 Hermes 4 405B（Hermes 3 改良版・指示遵守↑・refusal↓）';
      sel.insertBefore(opt, sel.firstChild);
    } else {
      var existingOpt = sel.querySelector('option[value="' + HERMES4_405B + '"]');
      existingOpt.textContent = '★最推奨 Hermes 4 405B（Hermes 3 改良版・指示遵守↑・refusal↓）';
      sel.insertBefore(existingOpt, sel.firstChild);
    }

    // Hermes 4 70B が無ければ追加
    if (!sel.querySelector('option[value="' + HERMES4_70B + '"]')) {
      var opt70 = document.createElement('option');
      opt70.value = HERMES4_70B;
      opt70.textContent = '★推奨 Hermes 4 70B（軽量・コスト 1/8）';
      // 405B の直後に追加
      var ref = sel.querySelector('option[value="' + HERMES4_405B + '"]');
      if (ref && ref.nextSibling) sel.insertBefore(opt70, ref.nextSibling);
      else sel.appendChild(opt70);
    } else {
      sel.querySelector('option[value="' + HERMES4_70B + '"]').textContent =
        '★推奨 Hermes 4 70B（軽量・コスト 1/8）';
    }

    // Hermes 3 を「旧版」表示
    var hermes3Opt = sel.querySelector('option[value="' + HERMES3_405B + '"]');
    if (hermes3Opt) {
      hermes3Opt.textContent = 'Hermes 3 405B（旧版・継続サポート）';
    }

    // Magnum は既に v244 で「⚠ 非推奨」になってる想定
    return true;
  }

  function hookSettingsOpen3() {
    if (typeof UI === 'undefined' || typeof UI.openSettings !== 'function') return false;
    if (UI.openSettings.__v246Hooked) return true;
    var orig = UI.openSettings;
    UI.openSettings = function () {
      var ret = orig.apply(this, arguments);
      setTimeout(applyModelUpdate, 50);
      setTimeout(applyModelUpdate, 300);
      return ret;
    };
    UI.openSettings.__v246Hooked = true;
    return true;
  }

  // ====================================================================
  // Patch B: Hermes 系の sampling を fetch 層で最適化
  //   既存 v211-hermes-tune.js が temperature を設定するが、その上から再上書き
  // ====================================================================
  var origFetch = window.fetch;
  window.fetch = function (url, opts) {
    var urlStr = typeof url === 'string' ? url : (url && url.url) || '';
    var isAI = /openrouter\.ai|api\.anthropic\.com|api\.openai\.com/i.test(urlStr);

    if (isAI && opts && opts.body && typeof opts.body === 'string') {
      try {
        var body = JSON.parse(opts.body);
        var modelId = body.model || '';
        // Hermes 系（3 または 4、405B または 70B）に該当
        if (/hermes/i.test(modelId)) {
          var changed = false;
          if (typeof body.temperature !== 'number' || body.temperature > 0.78) {
            body.temperature = 0.72;
            changed = true;
          }
          if (typeof body.top_p !== 'number' || body.top_p > 0.93) {
            body.top_p = 0.90;
            changed = true;
          }
          if (typeof body.frequency_penalty !== 'number') {
            body.frequency_penalty = 0.3;
            changed = true;
          }
          if (changed) {
            opts.body = JSON.stringify(body);
            window.__v246TuneCount = (window.__v246TuneCount || 0) + 1;
          }
        }
      } catch (e) {
        // body parse 失敗は無視（既存処理に任せる）
      }
    }
    return origFetch.apply(this, arguments);
  };
  window.fetch.__v246Hooked = true;

  // ====================================================================
  // Patch C: 作家ノートのデフォルト
  //   S.cfg.authorNote / S.cfg.authorsNote が空なら positive な日本語指示をデフォルト
  // ====================================================================
  var DEFAULT_AUTHORS_NOTE = [
    '現代日本語のライトノベル/ホラー小説調で書く。',
    '漢字は常用漢字程度に抑え、簡体字・ハングル・英文の混入は避ける。',
    'ホラー・心理描写・成人描写はためらわず深く描く。',
    '主人公の名前を一貫して使う（「主人公」「彼女」など総称ではなく固有名で）。',
    '台詞は「キャラ名「セリフ」」形式で書く。'
  ].join('\n');

  function applyAuthorsNoteDefault() {
    if (typeof S === 'undefined' || !S.cfg) return false;
    // 既に設定済みなら触らない（ユーザー意思を尊重）
    var current = S.cfg.authorsNote || S.cfg.authorNote || '';
    if (current && current.trim() && current.trim().length > 10) return true;

    // 設定済みでなければ書き込み
    if ('authorsNote' in S.cfg || !('authorNote' in S.cfg)) {
      S.cfg.authorsNote = DEFAULT_AUTHORS_NOTE;
    }
    if ('authorNote' in S.cfg) {
      S.cfg.authorNote = DEFAULT_AUTHORS_NOTE;
    }
    if (typeof S.save === 'function') S.save();

    // UI 入力欄にも反映
    ['cfgAuthorsNote', 'cfgAuthorNote'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && !el.value) el.value = DEFAULT_AUTHORS_NOTE;
    });
    return true;
  }

  // ====================================================================
  // Patch D: .psych-meters（空 NPC 心理メーター）を非表示
  // ====================================================================
  function hidePsychMeters() {
    // CSS でも非表示にしておく（再描画されても効くように）
    var styleId = '__v246-style';
    if (!document.getElementById(styleId)) {
      var style = document.createElement('style');
      style.id = styleId;
      style.textContent = '.psych-meters { display: none !important; }';
      document.head.appendChild(style);
    }
    // 既存要素も即座に非表示
    document.querySelectorAll('.psych-meters').forEach(function (el) {
      el.style.display = 'none';
    });
    return true;
  }

  // ====================================================================
  // 起動
  // ====================================================================
  function tryInstall() {
    var a = applyModelUpdate();
    var b = hookSettingsOpen3();
    var c = applyAuthorsNoteDefault();
    var d = hidePsychMeters();
    return a && b && c && d;
  }

  if (!tryInstall()) {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (tryInstall() || tries > 60) clearInterval(iv);
    }, 100);
  }

  // psych-meters は再描画されることもあるので MutationObserver で常時抑制
  if (typeof MutationObserver !== 'undefined') {
    var observer = new MutationObserver(function () {
      document.querySelectorAll('.psych-meters').forEach(function (el) {
        if (el.style.display !== 'none') el.style.display = 'none';
      });
    });
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  }
})();
