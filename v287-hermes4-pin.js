// v287-hermes4-pin.js
// 目的: OpenRouter コールのモデルを Hermes 4 405B (nousresearch/hermes-4-405b) に強制固定。
//
// 背景 (おしんさん 2026-05-10 観測):
//   ・index.html line 469: `orModel: 'mistralai/mistral-nemo'` がデフォルト
//   ・実機テストで [OpenRouter] model: mistralai/mistral-nemo が出ていた → 日本語追従が弱く、
//     JSON 構造を破った hybrid 出力 (npcs[0]: name: ... desc: ... 形式) を返す
//   ・ユーザーが手動で Hermes 4 405B を選んでいない場合、デフォルトのまま動いてしまう
//
// 対策:
//   1. fetch を wrap、openrouter.ai 宛 POST の body.model を強制的に hermes-4-405b に書き換え
//   2. 同時に S.cfg.orModel と localStorage.chr6 を Hermes 4 405B に同期 (UI を見たときに「設定が
//      Hermes 4 になっている」状態と整合させる)
//   3. 設定パネルの cfgOrModel <select> も Hermes 4 405B に選択 (init 時 + DOM ready 時)
//   4. v246 の fetch hook より「後」に動く必要があるため、v246 の wrap が掛かっているか待つ
//      (v246 は Hermes 系の sampling tuning だけで model 上書きは無いが、先後関係を崩したくない)
//
// チェーン:
//   fetch =
//     (caller)
//     → window.fetch (= v287 wrap)
//       → v287: body.model を hermes-4-405b に書き換え
//       → 元の window.fetch (= v246 wrap)
//         → v246: hermes 系 sampling tuning
//         → 真の origFetch
//
// ガード: window.__v287Active
// 既存ファイル (v246 / v211 / index.html) は触らない

(function v287(){
  'use strict';
  if (window.__v287Active) return;
  window.__v287Active = true;

  var TAG = '[v287]';
  var HERMES4_405B = 'nousresearch/hermes-4-405b';

  console.log(TAG, 'hermes4 pin init');

  // ===== fetch wrap =====
  // openrouter.ai 宛 POST の body.model を強制書き換え
  function patchFetch(){
    if (window.fetch.__v287Wrapped) return true;
    var prev = window.fetch;
    var wrapped = function(url, opts){
      var urlStr = typeof url === 'string' ? url : (url && url.url) || '';
      if (/openrouter\.ai\/api\/v1\/chat\/completions/i.test(urlStr)
          && opts && opts.body && typeof opts.body === 'string'){
        try {
          var body = JSON.parse(opts.body);
          var orig = body.model || '(none)';
          if (body.model !== HERMES4_405B){
            body.model = HERMES4_405B;
            opts.body = JSON.stringify(body);
            window.__v287PinCount = (window.__v287PinCount || 0) + 1;
            // 過剰ログ抑制: 3 回までは詳細ログ、以降はカウントのみ
            if (window.__v287PinCount <= 3){
              console.log(TAG, 'pinned model: ' + orig + ' → ' + HERMES4_405B + ' (count=' + window.__v287PinCount + ')');
            }
          }
        } catch(e){
          console.warn(TAG, 'body parse failed, leaving as-is:', e && e.message);
        }
      }
      return prev.apply(this, arguments);
    };
    wrapped.__v287Wrapped = true;
    window.fetch = wrapped;
    console.log(TAG, 'fetch wrapped (over ' + (prev.__v246Hooked ? 'v246-hooked' : 'native') + ')');
    return true;
  }

  // ===== S.cfg と localStorage を Hermes 4 405B に同期 =====
  function syncCfgToHermes4(){
    var changed = false;
    try {
      if (typeof S !== 'undefined' && S && S.cfg){
        if (S.cfg.orModel !== HERMES4_405B){
          var prev = S.cfg.orModel;
          S.cfg.orModel = HERMES4_405B;
          changed = true;
          console.log(TAG, 'S.cfg.orModel: ' + prev + ' → ' + HERMES4_405B);
        }
      }
    } catch(e){}
    try {
      var raw = localStorage.getItem('chr6');
      if (raw){
        var st = JSON.parse(raw);
        st.cfg = st.cfg || {};
        if (st.cfg.orModel !== HERMES4_405B){
          st.cfg.orModel = HERMES4_405B;
          localStorage.setItem('chr6', JSON.stringify(st));
          changed = true;
          console.log(TAG, 'localStorage.chr6.cfg.orModel synced to ' + HERMES4_405B);
        }
      }
    } catch(e){
      console.warn(TAG, 'localStorage sync failed:', e && e.message);
    }
    return changed;
  }

  // ===== 設定パネルの <select id="cfgOrModel"> を Hermes 4 405B に選択 =====
  function syncSelect(){
    try {
      var sel = document.getElementById('cfgOrModel');
      if (!sel) return false;
      // 既存の option チェック (v246 が追加していれば在る)
      var hasOpt = !!sel.querySelector('option[value="' + HERMES4_405B + '"]');
      if (!hasOpt){
        // v246 がまだ動いていない可能性 → 自前で追加
        var opt = document.createElement('option');
        opt.value = HERMES4_405B;
        opt.textContent = 'Hermes 4 405B（推奨・固定 by v287）';
        sel.insertBefore(opt, sel.firstChild);
        console.log(TAG, 'cfgOrModel option added');
      }
      if (sel.value !== HERMES4_405B){
        sel.value = HERMES4_405B;
        try { sel.dispatchEvent(new Event('change', { bubbles: true })); } catch(e){}
        console.log(TAG, 'cfgOrModel selected to ' + HERMES4_405B);
      }
      return true;
    } catch(e){
      console.warn(TAG, 'select sync failed:', e && e.message);
      return false;
    }
  }

  // ===== 初期化 =====
  patchFetch();
  syncCfgToHermes4();
  syncSelect();

  // DOM ready / S.cfg ready を待つ retry
  var tries = 0;
  var iv = setInterval(function(){
    syncCfgToHermes4();
    syncSelect();
    if (++tries > 60) clearInterval(iv);
  }, 500);

  // ===== Public API =====
  window.__v287 = {
    HERMES4_405B: HERMES4_405B,
    syncCfgToHermes4: syncCfgToHermes4,
    syncSelect: syncSelect,
    getPinCount: function(){ return window.__v287PinCount || 0; }
  };

  console.log(TAG, 'init complete');
})();
