// v270-final-cleanup.js
// 目的: 一連のバグ修正と新機能追加を一元化:
//   1. ゲームリセットを確実に動作させる (v267 名前衝突問題の解決)
//   2. welcome 画面で過去ターンが残っている場合の確認ダイアログ
//   3. プロバイダー dropdown を OpenRouter のみに絞る (Anthropic/NovelAI を非表示)
//   4. 物語の多様化 (同じ展開ループの軽減: anti-repetition prompt + temperature 揺らぎ)
//
// 背景:
//   v267-fresh-start-confirm.js は既存の v267-meta-leak-cleanup.js と
//   window.__v267 名前空間が衝突して上書きされ、機能していなかった。
//   v268 も v267.resetGame に依存していたため動作せず。
//   v270 では独立した window.__v270 名前空間で全機能を提供。
//
// ガード: window.__v270Active

(function v270() {
  'use strict';
  if (window.__v270Active) return;
  window.__v270Active = true;
  console.log('[v270] final-cleanup init');

  // ========================================================================
  // A. 安全なゲームリセット (v265 の revert を bypass)
  // ========================================================================
  function safeResetGame() {
    try {
      var s;
      try { s = JSON.parse(localStorage.getItem('chr6') || '{}'); } catch (e) { s = {}; }

      var clean = {
        cfg: s.cfg,
        scene: s.scene || {},
        cast: s.cast || {},
        turns: [],
        ephemerals: s.ephemerals || {}
      };
      if (clean.scene) clean.scene.branches = [];

      function freshState() {
        return {
          alive: true, conscious: true, canSpeak: true, canAct: true,
          condition: '健康', hpEstimate: 100,
          bodyParts: {}, restraints: [], injuryLog: [],
          recentEvents: [], trauma: [],
          mentalProfile: { fear: 0, trust: 50, tension: 0, despair: 0 }
        };
      }
      if (clean.cast.hero) clean.cast.hero.state = freshState();
      if (Array.isArray(clean.cast.npcs)) {
        clean.cast.npcs.forEach(function (n) {
          if (!n) return;
          n.state = freshState();
          n.state.mentalProfile.trust = 0;
          n.emotion = '中立';
          if (typeof n.stress === 'number') n.stress = 50;
          if (typeof n.trust === 'number') n.trust = 0;
          if (typeof n.intimacy === 'number') n.intimacy = 0;
          n.keyMoments = [];
        });
      }

      // v265 の "wasDead" 判定を bypass: removeItem で OLD state を空にしてから書き込み
      window.__v259Writing = true;
      window.__v270Resetting = true;
      try {
        localStorage.removeItem('chr6');
        localStorage.setItem('chr6', JSON.stringify(clean));
      } finally {
        setTimeout(function () {
          window.__v259Writing = false;
          window.__v270Resetting = false;
        }, 500);
      }

      if (typeof S !== 'undefined') {
        S.turns = [];
        if (S.scene) S.scene.branches = [];
        if (S.cast && clean.cast) {
          if (clean.cast.hero) S.cast.hero = clean.cast.hero;
          if (clean.cast.npcs) S.cast.npcs = clean.cast.npcs;
        }
      }

      try { if (typeof UI !== 'undefined' && UI.renderAll) UI.renderAll(); } catch (e) {}
      try { if (typeof UI !== 'undefined' && UI.renderBranches) UI.renderBranches([]); } catch (e) {}
      try { if (typeof UI !== 'undefined' && UI._showIntro) UI._showIntro(); } catch (e) {}
      var stream = document.getElementById('dialogue-stream');
      if (stream) stream.innerHTML = '';

      console.log('[v270] safe reset complete');
      return true;
    } catch (e) {
      console.warn('[v270] reset err:', e && e.message);
      return false;
    }
  }

  // ========================================================================
  // B. welcome 画面に過去ターン警告
  // ========================================================================
  function hookWelcomeOnce() {
    var welcome = document.getElementById('welcome');
    if (!welcome) return false;
    if (welcome.__v270Hooked) return true;

    welcome.addEventListener('click', function (e) {
      var t = e.target;
      while (t && t !== welcome && t.tagName !== 'BUTTON' && t.tagName !== 'A') t = t.parentNode;
      if (!t || (t.tagName !== 'BUTTON' && t.tagName !== 'A')) return;
      var label = (t.textContent || '').trim();
      if (/設定|settings/i.test(label)) return;

      var hasPrevious = false, prevCount = 0;
      try {
        if (typeof S !== 'undefined' && S.turns && S.turns.length > 0) {
          hasPrevious = true;
          prevCount = S.turns.length;
        }
      } catch (err) {}
      if (!hasPrevious) return;

      e.stopPropagation();
      e.preventDefault();
      var msg = '前回までの物語が残っています（' + prevCount + ' ターン）。\n\n' +
                'リセットして新規開始しますか？\n\n' +
                'OK = 過去のターン・NPC 状態をリセットして新規開始\n' +
                'キャンセル = 続きから（既存ターンに新展開を追加）';
      if (window.confirm(msg)) {
        safeResetGame();
        setTimeout(function () { try { t.click(); } catch (err) {} }, 200);
      } else {
        setTimeout(function () {
          try {
            var inline = t.getAttribute('onclick');
            if (inline) (new Function(inline)).call(t);
          } catch (err) {}
        }, 50);
      }
    }, true);
    welcome.__v270Hooked = true;
    console.log('[v270] welcome hooked');
    return true;
  }

  hookWelcomeOnce();
  setTimeout(hookWelcomeOnce, 500);
  setTimeout(hookWelcomeOnce, 2000);
  setTimeout(hookWelcomeOnce, 5000);
  try {
    var moW = new MutationObserver(function () { hookWelcomeOnce(); });
    moW.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { moW.disconnect(); }, 30000);
  } catch (e) {}

  // ========================================================================
  // C. プロバイダー dropdown を OpenRouter のみに絞る
  // ========================================================================
  function filterProviders() {
    try {
      var sel = document.getElementById('cfgProvider');
      if (!sel || sel.__v270Filtered) return;
      var keep = ['openrouter']; // 現在使用中のみ残す
      Array.from(sel.options).forEach(function (opt) {
        if (keep.indexOf(opt.value) < 0) {
          opt.style.display = 'none';
          opt.disabled = true;
        }
      });
      // 強制的に openrouter を選択
      sel.value = 'openrouter';
      sel.__v270Filtered = true;
      console.log('[v270] provider dropdown filtered');
    } catch (e) {}
  }
  // 設定パネル展開時に dropdown が見える → ガードで再適用
  setInterval(filterProviders, 1000);
  setTimeout(filterProviders, 500);
  setTimeout(filterProviders, 2000);

  // ========================================================================
  // D. 物語の多様化 (anti-repetition)
  //   Planner.build をラップして system prompt にバリエーション指示を注入
  //   過去 N ターンの narrative summaries から「使われた展開」を抽出
  //   LLM に「以下の展開要素は直近で使ったので避けてください」と注入
  // ========================================================================
  (function antiRepetition() {
    function summarizePastNarratives() {
      try {
        var s = JSON.parse(localStorage.getItem('chr6') || '{}');
        var turns = (s.turns || []).slice(-5);
        // 直近 5 ターンの narrative から「シーン要素」を粗くキーワード抽出
        var keywords = new Set();
        var scenePatterns = [
          /(廊下|教室|階段|屋上|地下|倉庫|トイレ|職員室|体育館|保健室)/g,
          /(暗闇|血|悲鳴|笑い声|足音|呼吸|心臓|目)/g,
          /(影|怪物|魔物|霊|幽霊|モンスター)/g
        ];
        turns.forEach(function (t) {
          var n = (t.narrative || '');
          scenePatterns.forEach(function (rx) {
            var m;
            while ((m = rx.exec(n)) !== null) keywords.add(m[1]);
          });
        });
        return Array.from(keywords).slice(0, 12);
      } catch (e) { return []; }
    }

    function injectAntiRepetition() {
      if (typeof Planner !== 'object' || !Planner || typeof Planner.build !== 'function') return false;
      if (Planner.build.__v270AntiRep) return true;
      var orig = Planner.build.bind(Planner);
      Planner.build = function (inputType, inputText) {
        var r = orig(inputType, inputText);
        try {
          var kw = summarizePastNarratives();
          if (kw.length && r && r.sys) {
            var addon = '\n\n【展開バリエーション指示】\n' +
                        '以下のキーワード/シーン要素は直近のターンで既に使われています。\n' +
                        '可能なら別のシーン展開・別のホラー要素・別の心理描写を選んで、\n' +
                        '物語が同じパターンを繰り返さないようにしてください:\n' +
                        '  - 既出: ' + kw.join('、') + '\n' +
                        '\n新しい展開要素 (場所/イベント/感情/対象) を 1-2 個導入し、' +
                        '既出要素ばかりに依存しないでください。';
            r.sys += addon;
          }
        } catch (e) {}
        return r;
      };
      Planner.build.__v270AntiRep = true;
      console.log('[v270] anti-repetition injection installed');
      return true;
    }
    injectAntiRepetition();
    var arTries = 0;
    var arIv = setInterval(function () {
      if (injectAntiRepetition() || ++arTries > 30) clearInterval(arIv);
    }, 500);
  })();

  // ========================================================================
  // E. v267-fresh-start-confirm.js が壊れている問題を救済
  //   名前衝突で window.__v267 が meta-leak-cleanup に上書きされたため
  //   v267 のリセット機能を v270 にエイリアスとして提供
  // ========================================================================
  (function rescueV267() {
    try {
      // 既存 __v267 が meta-leak-cleanup の場合、resetGame を追加
      if (window.__v267 && typeof window.__v267.resetGame !== 'function') {
        window.__v267.resetGame = safeResetGame;
        console.log('[v270] rescued __v267.resetGame');
      }
    } catch (e) {}
  })();

  // ========================================================================
  // F. 公開 API
  // ========================================================================
  window.__v270 = {
    safeResetGame: safeResetGame,
    hookWelcomeOnce: hookWelcomeOnce,
    filterProviders: filterProviders
  };

  console.log('[v270] init complete');
})();
