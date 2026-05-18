// === v292Dfix55: GM mode (AI-Dungeon-style protagonist player control) ===
//
// 目的:
//   主人公の台詞・行動・内心を AI が勝手に書かない「GMモード」を追加する。
//   設定パネルにラジオを追加し、'auto' (従来) / 'gm' を切り替え可能にする。
//   GMモード時:
//     - system prompt の先頭に GM 役割分離ブロックを 1 度だけ挿入
//     - 入力欄プレースホルダーを GM 用に上書き
//     - 生成された narrative / dialogue 内で主人公が speaker として現れたら
//       console.warn のみ (自動削除はしない、最初は様子見)
//
// 設計方針 (ユーザー合意済み: A 案 = 役割の明確分離 system prompt 制御):
//   - 既存パッチを wrap せず Planner._extensions / _parseExtensions に push
//   - 独立 IIFE, setInterval を多用しない (wrap cascade 回避)
//   - localStorage key: 'chr6_protagonistMode' ('auto' | 'gm')
//   - 設定 UI は MutationObserver で settings overlay の open を検知して 1 度だけ inject
//   - window.__v292Dfix55Active = true をフラグとして公開
//
(function () {
  if (window.__v292Dfix55Active) return;
  window.__v292Dfix55Active = true;

  var TAG = '[v292Dfix55:gm-mode]';
  var STORAGE_KEY = 'chr6_protagonistMode';
  var MARKER = '【GMモード - 重要】';

  // ---------- state ----------
  function getMode() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      return v === 'gm' ? 'gm' : 'auto';
    } catch (e) {
      return 'auto';
    }
  }
  function setMode(v) {
    try {
      localStorage.setItem(STORAGE_KEY, v === 'gm' ? 'gm' : 'auto');
    } catch (e) {}
  }

  function getHeroName() {
    try {
      var S = (typeof window !== 'undefined') ? window.S : null;
      if (S && S.cast && S.cast.hero && S.cast.hero.name) return String(S.cast.hero.name);
    } catch (e) {}
    try {
      var raw = JSON.parse(localStorage.getItem('chr6') || '{}');
      if (raw && raw.cast && raw.cast.hero && raw.cast.hero.name) return String(raw.cast.hero.name);
    } catch (e) {}
    return '主人公';
  }

  // ---------- system prompt block ----------
  function buildGmBlock(heroName) {
    return [
      MARKER,
      'あなたは GM／ナレーターです。物語に登場する主人公（' + heroName + '）は、プレイヤー（ユーザー）が操作するキャラクターです。',
      '',
      '絶対ルール:',
      '- 主人公の台詞、行動、内心、選択は、プレイヤーが SAY/DO で明示的に入力した時のみ反映してください',
      '- あなた自身が主人公のセリフを書いたり、主人公を勝手に動かしたりしてはいけません',
      '- NPC の台詞・行動、環境描写、出来事は通常通り描写してください',
      '- 主人公が選択を迫られる場面では、状況描写で止めて、プレイヤーの入力を待ってください',
      '- プレイヤーが何も入力しない場合は、主人公は「黙って様子を見ている」状態として扱ってください'
    ].join('\n');
  }

  // ---------- Planner._extensions hook (sys prompt prepend) ----------
  function installSysHook() {
    if (!window.Planner || !Array.isArray(window.Planner._extensions)) {
      setTimeout(installSysHook, 300);
      return;
    }
    // hot-swap: drop previous fix55 entry if reloaded
    window.Planner._extensions = window.Planner._extensions.filter(function (fn) {
      return !(fn && fn.__v292Dfix55 === true);
    });

    var ext = function (ctx) {
      try {
        if (getMode() !== 'gm') return (ctx && ctx.sys) || '';
        var sys = (ctx && ctx.sys) ? String(ctx.sys) : '';
        // double-injection guard
        if (sys.indexOf(MARKER) >= 0) return sys;
        var heroName = '主人公';
        try {
          if (ctx && ctx.state && ctx.state.cast && ctx.state.cast.hero && ctx.state.cast.hero.name) {
            heroName = String(ctx.state.cast.hero.name);
          } else {
            heroName = getHeroName();
          }
        } catch (e) { heroName = getHeroName(); }
        var block = buildGmBlock(heroName);
        return block + '\n\n' + sys;
      } catch (e) {
        console.warn(TAG, 'sys ext err:', e && e.message);
        return (ctx && ctx.sys) || '';
      }
    };
    ext.__v292Dfix55 = true;
    window.Planner._extensions.push(ext);
    console.log(TAG, 'sys hook installed (mode=' + getMode() + ')');
  }
  installSysHook();

  // ---------- Planner._parseExtensions hook (post-process warning) ----------
  function installParseHook() {
    if (!window.Planner || !Array.isArray(window.Planner._parseExtensions)) {
      setTimeout(installParseHook, 300);
      return;
    }
    window.Planner._parseExtensions = window.Planner._parseExtensions.filter(function (fn) {
      return !(fn && fn.__v292Dfix55 === true);
    });

    var ext = function (plan /*, parseCtx */) {
      try {
        if (getMode() !== 'gm') return plan;
        if (!plan || typeof plan !== 'object') return plan;
        var heroName = getHeroName();
        if (!heroName || heroName === '主人公') return plan;
        // dialogues array: each item has { speaker, text } typically
        if (Array.isArray(plan.dialogues)) {
          plan.dialogues.forEach(function (d, idx) {
            if (!d) return;
            var sp = d.speaker || d.name || d.who || '';
            if (typeof sp === 'string' && sp.indexOf(heroName) >= 0) {
              console.warn(TAG, 'protagonist appears as speaker in dialogue[' + idx + ']:', d);
            }
          });
        }
        // narrative may contain "<hero>：..." or "<hero>「..." patterns
        if (typeof plan.narrative === 'string' && plan.narrative.indexOf(heroName) >= 0) {
          var pat = new RegExp(heroName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[:：「『]', '');
          if (pat.test(plan.narrative)) {
            console.warn(TAG, 'protagonist may speak in narrative (speaker-like pattern detected)');
          }
        }
      } catch (e) {
        console.warn(TAG, 'parse ext err:', e && e.message);
      }
      return plan;
    };
    ext.__v292Dfix55 = true;
    window.Planner._parseExtensions.push(ext);
    console.log(TAG, 'parse hook installed');
  }
  installParseHook();

  // ---------- Settings panel UI injection ----------
  var ROW_CLASS = 'v292Dfix55-gm-row';

  function buildSettingsRow() {
    var row = document.createElement('div');
    row.className = ROW_CLASS;
    row.style.cssText = 'display:flex;gap:10px;align-items:center;margin:8px 0;flex-wrap:wrap;padding:6px 8px;border:1px solid rgba(120,120,180,0.25);border-radius:6px;background:rgba(40,40,80,0.15)';
    row.innerHTML =
      '<span style="font-size:12px;color:var(--dim,#9999b8);min-width:90px;font-weight:600">主人公モード:</span>'
      + '<label style="font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer">'
      +   '<input type="radio" name="v292Dfix55_protoMode" value="auto"> 自動 (AI が動かす)'
      + '</label>'
      + '<label style="font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer">'
      +   '<input type="radio" name="v292Dfix55_protoMode" value="gm"> GM (自分で操作)'
      + '</label>'
      + '<span style="font-size:10px;color:var(--dim,#9999b8);flex-basis:100%;margin-top:2px">GM モード: 主人公の発話・行動は SAY/DO 入力時のみ反映されます</span>';

    var cur = getMode();
    row.querySelectorAll('input[type=radio]').forEach(function (r) {
      if (r.value === cur) r.checked = true;
      r.addEventListener('change', function () {
        if (r.checked) {
          setMode(r.value);
          console.log(TAG, 'mode changed →', r.value);
          // refresh placeholder immediately if input exists
          updateInputPlaceholder();
        }
      });
    });
    return row;
  }

  var __injecting = false;
  function injectSettingsOnce() {
    if (__injecting) return;
    __injecting = true;
    try {
      var ov = document.getElementById('settingsOv');
      if (!ov) return;
      if (getComputedStyle(ov).display === 'none') return;
      // remove stale rows (avoid duplicates on re-open)
      ov.querySelectorAll('.' + ROW_CLASS).forEach(function (n) { n.remove(); });

      // Anchor: prefer to insert AFTER hero gender row (.v292-grow with first child 主人公性別),
      //         else after #cfgHDesc, else after #cfgHName.
      var anchor = null;
      var grows = ov.querySelectorAll('.v292-grow');
      for (var i = 0; i < grows.length; i++) {
        var txt = (grows[i].textContent || '');
        if (txt.indexOf('主人公性別') >= 0) { anchor = grows[i]; break; }
      }
      if (!anchor) anchor = ov.querySelector('#cfgHDesc');
      if (!anchor) anchor = ov.querySelector('#cfgHName');
      if (!anchor || !anchor.parentNode) return;

      var row = buildSettingsRow();
      anchor.parentNode.insertBefore(row, anchor.nextSibling);
    } catch (e) {
      console.warn(TAG, 'inject err:', e && e.message);
    } finally {
      setTimeout(function () { __injecting = false; }, 100);
    }
  }

  function watchSettingsOverlay() {
    var ov = document.getElementById('settingsOv');
    if (!ov) {
      setTimeout(watchSettingsOverlay, 500);
      return;
    }
    if (ov.__v292Dfix55Watched) return;
    ov.__v292Dfix55Watched = true;
    // Initial pass in case the overlay is already visible
    injectSettingsOnce();
    var mo = new MutationObserver(function () {
      if (getComputedStyle(ov).display !== 'none') injectSettingsOnce();
    });
    mo.observe(ov, { attributes: true, attributeFilter: ['style', 'class'] });
    console.log(TAG, 'settings observer attached');
  }

  // ---------- Input placeholder override ----------
  var GM_PLACEHOLDER = '主人公として何をする？何を言う？ (DO/SAY/STORY で切替)';

  function updateInputPlaceholder() {
    try {
      var inp = document.getElementById('inp');
      if (!inp) return;
      if (getMode() === 'gm') {
        // Cache original first time
        if (typeof inp.__v292Dfix55OrigPh === 'undefined') {
          inp.__v292Dfix55OrigPh = inp.placeholder || '';
        }
        if (inp.placeholder !== GM_PLACEHOLDER) inp.placeholder = GM_PLACEHOLDER;
      } else {
        // Restore default if we previously overwrote
        if (inp.placeholder === GM_PLACEHOLDER) {
          inp.placeholder = inp.__v292Dfix55OrigPh || '行動を入力...';
        }
      }
    } catch (e) {}
  }

  function watchInputPlaceholder() {
    var inp = document.getElementById('inp');
    if (!inp) {
      setTimeout(watchInputPlaceholder, 500);
      return;
    }
    if (inp.__v292Dfix55PhWatched) return;
    inp.__v292Dfix55PhWatched = true;

    // Initial pass
    updateInputPlaceholder();

    // Re-apply whenever the host code (game's mode handler) overwrites placeholder.
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        if (muts[i].attributeName === 'placeholder') {
          // schedule async to avoid feedback loop with setting placeholder ourselves
          setTimeout(updateInputPlaceholder, 0);
          break;
        }
      }
    });
    mo.observe(inp, { attributes: true, attributeFilter: ['placeholder'] });
    console.log(TAG, 'input placeholder observer attached');
  }

  // ---------- Boot ----------
  function boot() {
    watchSettingsOverlay();
    watchInputPlaceholder();
    // re-install sys/parse hooks so we land AFTER later-loading extensions
    // (some extensions like v292Dfix54 replace the sys chain instead of prepending,
    // so being at the tail of _extensions is the only way to survive).
    installSysHook();
    installParseHook();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  // delayed retries cover late DOM and late-loading sys extensions
  // (no setInterval cascade — explicit one-shot timers only)
  setTimeout(boot, 1500);
  setTimeout(boot, 4000);
  setTimeout(boot, 9000);

  // ---------- Public API ----------
  window.Chr6GmMode = {
    get: getMode,
    set: function (v) {
      setMode(v);
      updateInputPlaceholder();
      // refresh radio state if visible
      try {
        document.querySelectorAll('input[name=v292Dfix55_protoMode]').forEach(function (r) {
          r.checked = (r.value === getMode());
        });
      } catch (e) {}
    },
    buildBlock: function (name) { return buildGmBlock(name || getHeroName()); }
  };

  console.log(TAG, 'loaded — current mode:', getMode());
})();

