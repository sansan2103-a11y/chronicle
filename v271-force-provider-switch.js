// v271-force-provider-switch.js
// 目的: v270 の filterProviders は dropdown UI のみ変更で
//       実際の S.cfg.provider が anthropic のままで Anthropic API 401 が出る問題を修正
//
// 観測:
//   v270 で UI dropdown を openrouter のみに絞ったが、S.cfg.provider は更新されず、
//   既存ユーザーの localStorage は anthropic のまま → ターン送信時に Anthropic API を呼んで
//   401 invalid x-api-key で物語が始まらない。
//
// 修正:
//   - 起動時に S.cfg.provider が anthropic / novelai なら openrouter に強制切替
//   - localStorage.chr6 にも反映 (ただし v265 / v259Writing flag で feedback loop 抑制)
//   - dropdown UI も同期
//
// ガード: window.__v271Active

(function v271() {
  'use strict';
  if (window.__v271Active) return;
  window.__v271Active = true;
  console.log('[v271] force-provider-switch init');

  function forceOpenRouter() {
    try {
      if (typeof S === 'undefined' || !S.cfg) return false;
      var changed = false;
      if (S.cfg.provider !== 'openrouter') {
        var prev = S.cfg.provider;
        S.cfg.provider = 'openrouter';
        changed = true;
        console.log('[v271] S.cfg.provider switched: ' + prev + ' → openrouter');
      }
      // dropdown UI sync
      var sel = document.getElementById('cfgProvider');
      if (sel && sel.value !== 'openrouter') {
        sel.value = 'openrouter';
        changed = true;
      }
      // localStorage 反映
      if (changed) {
        var s = {};
        try { s = JSON.parse(localStorage.getItem('chr6') || '{}'); } catch (e) {}
        s.cfg = s.cfg || {};
        if (s.cfg.provider !== 'openrouter') {
          s.cfg.provider = 'openrouter';
          window.__v259Writing = true;
          try { localStorage.setItem('chr6', JSON.stringify(s)); }
          finally { setTimeout(function () { window.__v259Writing = false; }, 250); }
        }
      }
      return changed;
    } catch (e) {
      console.warn('[v271] err:', e && e.message);
      return false;
    }
  }

  // 起動時 + 1秒後 + 3秒後 + 設定パネル開閉時にも適用
  forceOpenRouter();
  setTimeout(forceOpenRouter, 500);
  setTimeout(forceOpenRouter, 1500);
  setTimeout(forceOpenRouter, 5000);

  // 設定 dropdown が開かれた時も再適用
  setInterval(forceOpenRouter, 2000);

  window.__v271 = { forceOpenRouter: forceOpenRouter };
  console.log('[v271] init complete');
})();
