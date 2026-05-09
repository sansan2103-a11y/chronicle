// v279-scream-retry-toggle.js
//
// 目的: v220 (激痛・極限シーンの長音絶叫ルール / リトライ) を on/off できる toggle を提供する
//
// 背景 (HANDOFF_v278_followup.md):
//   v220 は激痛キーワード (眼球/喰らいつき/裂け/血/絶叫など) を検出すると、
//   - 大きなプロンプトブロック (EXTREME_PAIN_RULE, 約 35 行) を system prompt に注入
//   - レスポンスに長音絶叫が無ければ once retry
//   を行う。これは元々「悲鳴が省略される」問題を解決するためだったが、
//   結果として「同じ悲鳴が連続生成される」「悲鳴ループ」の温床にもなっている。
//   v278 の dedup で重複は削れるが、retry 自体が無駄な API call を生むので
//   ユーザーが状況に応じて切り替えられるようにする。
//
// 動作:
//   ON  (default, 初期値=true): v220 の挙動はそのまま (rule 注入 + retry)
//   OFF: 1) system prompt の末尾に v220 keyword を含む 1 行を pre-inject
//          → v220 の重複チェック (indexOf) が hit して injection をスキップ
//        2) window.__v220Retrying = true を維持
//          → v220 の retry 条件 `if (window.__v220Retrying) return resp;` が hit して retry スキップ
//
// 永続化: localStorage 'chr_v279_screamEnabled'  ('true' | 'false')
// UI:    設定パネル (#settingsPanel .mpanel-body) に checkbox を inject
//
// ガード: window.__v279Active

(function v279() {
  'use strict';
  if (window.__v279Active) return;
  window.__v279Active = true;
  console.log('[v279] scream-retry-toggle init');

  var LS_KEY = 'chr_v279_screamEnabled';
  var V220_KEYWORD = '# 🔥 激痛・極限シーンの長音絶叫ルール';
  // 上記は '# 🔥 激痛・極限シーンの長音絶叫ルール' と同等 (絵文字を含む文字列の表記揺れ防止に \u escape)

  // ============================================================
  // State
  // ============================================================
  function getEnabled() {
    try {
      var v = localStorage.getItem(LS_KEY);
      return v === null ? true : v === 'true';   // default ON
    } catch (e) { return true; }
  }

  function setEnabled(b) {
    try { localStorage.setItem(LS_KEY, b ? 'true' : 'false'); } catch (e) {}
    syncRetryFlag();
    syncCheckbox();
    console.log('[v279] scream retry/rule', b ? 'ENABLED' : 'DISABLED');
  }

  function syncRetryFlag() {
    // OFF: lock __v220Retrying = true so v220 always early-returns from retry path
    // ON:  release lock (v220 manages its own flag transitions)
    if (!getEnabled()) {
      window.__v220Retrying = true;
    } else if (window.__v220Retrying === true && !window.__v220ActuallyRetrying) {
      // only release if it was OUR lock, not an in-flight v220 retry
      window.__v220Retrying = false;
    }
  }

  // ============================================================
  // Fetch wrap (after v220) — pre-inject marker to suppress v220
  // ============================================================
  var prevFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    if (!getEnabled() && init && init.body) {
      try {
        var body = JSON.parse(init.body);
        if (body && body.messages && Array.isArray(body.messages)) {
          for (var i = 0; i < body.messages.length; i++) {
            var m = body.messages[i];
            if (m && m.role === 'system' && typeof m.content === 'string') {
              if (m.content.indexOf(V220_KEYWORD) < 0) {
                // Add a single line containing the v220 keyword so v220's
                // existence-check (indexOf) finds it and skips its 35-line injection.
                m.content = m.content +
                  '\n\n' + V220_KEYWORD +
                  ': ユーザー設定により無効化されています。\n';
                  // = "ユーザー設定により無効化されています。"
              }
              break;
            }
          }
          init.body = JSON.stringify(body);
        }
      } catch (e) {
        console.warn('[v279] body modify err:', e && e.message);
      }
      // Belt-and-suspenders: keep retry locked
      window.__v220Retrying = true;
    }
    return prevFetch(input, init);
  };
  console.log('[v279] fetch wrapped');

  syncRetryFlag();

  // ============================================================
  // UI: checkbox in settings panel
  // ============================================================
  function injectCheckbox() {
    var panel = document.getElementById('settingsPanel');
    if (!panel) return false;
    if (panel.querySelector('#v279ScreamToggle')) return true;
    var body = panel.querySelector('.mpanel-body');
    if (!body) return false;

    var sec = document.createElement('div');
    sec.className = 'sec';
    sec.id = 'v279Section';
    sec.textContent = '🔥 激痛シーンの絶叫強制 (v220)';
    // = "🔥 激痛シーンの絶叫強制 (v220)"

    var lab = document.createElement('label');
    lab.className = 'chk-row';
    lab.style.cssText = 'display:block;padding:4px 0;line-height:1.5;';
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = 'v279ScreamToggle';
    cb.checked = getEnabled();
    cb.addEventListener('change', function () { setEnabled(cb.checked); });
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(
      ' 激痛キーワード検出時に長音絶叫を強制し、出てなければ再生成する'
      // = " 激痛キーワード検出時に長音絶叫を強制し、出てなければ再生成する"
    ));

    var hint = document.createElement('div');
    hint.style.cssText = 'font-size:11px;color:#888;margin:2px 0 6px 22px;line-height:1.4;';
    hint.textContent = '⚠ 同じ悲鳴が連続して気になる場合は OFF にしてください。【効果】rule 注入 + retry が両方スキップされます。';
    // = "⚠ 同じ悲鳴が連続して気になる場合は OFF にしてください。【効果】rule 注入 + retry が両方スキップされます。"

    body.appendChild(sec);
    body.appendChild(lab);
    body.appendChild(hint);
    console.log('[v279] checkbox injected');
    return true;
  }

  function syncCheckbox() {
    var cb = document.getElementById('v279ScreamToggle');
    if (cb) cb.checked = getEnabled();
  }

  // Initial inject attempts
  setTimeout(injectCheckbox, 0);
  setTimeout(injectCheckbox, 500);
  setTimeout(injectCheckbox, 2000);
  setTimeout(injectCheckbox, 5000);
  var tries = 0;
  var iv = setInterval(function () {
    if (injectCheckbox() || ++tries > 20) clearInterval(iv);
  }, 500);

  // Re-sync when 設定 panel opens (in case something rebuilt it)
  function wrapOpenSettings() {
    if (!window.UI || typeof window.UI.openSettings !== 'function') return false;
    if (window.UI.openSettings.__v279Wrapped) return true;
    var orig = window.UI.openSettings;
    window.UI.openSettings = function () {
      var r = orig.apply(window.UI, arguments);
      setTimeout(injectCheckbox, 30);
      setTimeout(syncCheckbox, 60);
      return r;
    };
    window.UI.openSettings.__v279Wrapped = true;
    console.log('[v279] UI.openSettings wrapped');
    return true;
  }
  setTimeout(wrapOpenSettings, 0);
  setTimeout(wrapOpenSettings, 1000);
  setTimeout(wrapOpenSettings, 3000);

  // ============================================================
  // Public API
  // ============================================================
  window.__v279 = {
    getEnabled: getEnabled,
    setEnabled: setEnabled,
    injectCheckbox: injectCheckbox,
    V220_KEYWORD: V220_KEYWORD
  };

  console.log('[v279] init complete (scream:', getEnabled() ? 'ON' : 'OFF', ')');
})();
