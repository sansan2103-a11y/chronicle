// v276d-fetch-priority.js
// 目的:
//   v276 character-mind の repair を確実に発火させる。
//
// 背景 (引き継ぎ HANDOFF_v276series.md より):
//   v276b は callMindAnalysis を wrap して、その内部で window.fetch を一時的に書き換える方式。
//   しかし v211-hermes-tune などの後ロードスクリプトが window.fetch をさらに上書きしてしまい、
//   v276b の temp fetch hook が呼ばれない。結果、repair が走らず __v276Mind がセットされない。
//
// 解決策 (実機ブラウザの live-patch で動作確認済み):
//   後ロード script 群が出揃った後に、最後尾で window.fetch をもう一度 wrap する。
//   X-Title === 'v276 character-mind' のリクエストだけ傍受し、
//   レスポンスを clone().json() で覗いて window.__v276bRepair で repair → window.__v276Mind に格納。
//   非対象呼び出しは apply で素通し (this/arguments を保持)。
//
// 設計上の注意:
//   - install タイミング: DOMContentLoaded + setTimeout 3000ms。
//     v211 / v220 / v276b / v276c など他の hook が全部上書きを終えた後を狙う。
//   - 二重 install ガード:
//       window.__v276dActive       (process-level: スクリプトの再評価防止)
//       window.fetch.__v276dInstalled (function-level: 同じ wrapper の二重設置防止)
//   - レスポンスは clone().json() で読むだけ。元の res をそのまま return する
//     (新しい Response オブジェクトを構築しない — 上層が clone を期待する場合に壊れるため)。
//
// チェーン (install 後):
//   呼び出し側 → window.fetch (v276d wrapper)
//     → top.apply (= v211 など、その時点で window.fetch だったもの)
//       → … 後ロード hook 群 …
//         → v276c (送信時 body 改変)
//           → 元の fetch
//
// ガード: window.__v276dActive
//
// API:
//   window.__v276d.installed -> bool       インストール済みか
//   window.__v276d.reinstall()             手動で再インストール (debug 用)

(function v276d() {
  'use strict';

  if (window.__v276dActive) return;
  window.__v276dActive = true;
  console.log('[v276d] fetch-priority init (will install after DOMContentLoaded + 3s)');

  var INSTALL_DELAY_MS = 3000;

  function isMindCall(url, opts) {
    if (typeof url !== 'string') return false;
    if (url.indexOf('openrouter.ai') < 0) return false;
    if (!opts || !opts.headers) return false;
    var title = opts.headers['X-Title'] || opts.headers['x-title'];
    return typeof title === 'string' && title.indexOf('v276 character-mind') >= 0;
  }

  function extractAndStoreMind(res) {
    // res は消費せずに clone から JSON を読む。本体 (res) はそのまま return する。
    return res.clone().json().then(function (json) {
      try {
        var text = '';
        if (json && json.choices && json.choices[0] && json.choices[0].message) {
          text = String(json.choices[0].message.content || '').trim();
        }
        if (!text) {
          console.warn('[v276d] empty content, keep previous __v276Mind');
          return res;
        }

        var parsed = null;
        if (typeof window.__v276bRepair === 'function') {
          try { parsed = window.__v276bRepair(text); } catch (e1) {
            console.warn('[v276d] __v276bRepair threw', e1);
          }
        }
        // フォールバック: repair が無い / 失敗した場合は素の JSON.parse
        if (!parsed) {
          try { parsed = JSON.parse(text); } catch (_) { parsed = null; }
        }

        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          window.__v276Mind = parsed;
          console.log('[v276d] mind set via repair, keys=', Object.keys(parsed));
        } else {
          console.warn('[v276d] could not parse mind text, keep previous __v276Mind');
        }
      } catch (e) {
        console.warn('[v276d] mind extraction failed', e);
      }
      return res;
    }).catch(function (e) {
      console.warn('[v276d] response.clone().json() failed', e);
      return res;
    });
  }

  function install() {
    var top = window.fetch;
    if (typeof top !== 'function') {
      console.warn('[v276d] window.fetch is not a function, abort');
      return;
    }
    if (top.__v276dInstalled) {
      console.log('[v276d] hook already installed on current window.fetch, skip');
      return;
    }

    var wrapped = function (url, opts) {
      // 非対象は this / arguments を保ったまま素通し
      if (!isMindCall(url, opts)) {
        return top.apply(this, arguments);
      }
      // mind 呼び出し: 下層 (v211 / v276c / 元の fetch) に投げて、戻り Response を覗き見る
      var p = top.apply(this, arguments);
      // p が Promise でない場合 (理論上ありえないが念のため) はそのまま返す
      if (!p || typeof p.then !== 'function') return p;
      return p.then(function (res) {
        return extractAndStoreMind(res);
      });
    };
    wrapped.__v276dInstalled = true;
    wrapped.__wrappedFetch = top;  // debug 用に下層を保持

    window.fetch = wrapped;
    console.log('[v276d] top-level fetch wrapper installed');
  }

  function schedule() {
    setTimeout(install, INSTALL_DELAY_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule, { once: true });
  } else {
    schedule();
  }

  // === Public API (debug 用) ===
  window.__v276d = {
    get installed() {
      return !!(window.fetch && window.fetch.__v276dInstalled);
    },
    reinstall: function () {
      // 既存 wrapper を一旦剥がして再インストール (debug 用、通常は不要)
      try {
        if (window.fetch && window.fetch.__v276dInstalled && window.fetch.__wrappedFetch) {
          window.fetch = window.fetch.__wrappedFetch;
          console.log('[v276d] previous wrapper detached for reinstall');
        }
      } catch (e) {
        console.warn('[v276d] detach failed', e);
      }
      install();
    },
    isMindCall: isMindCall
  };
})();
