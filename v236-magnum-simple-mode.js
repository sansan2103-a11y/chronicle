/* v236: Magnum simpleMode auto-enable + Planner.build hook
 * Fixes: v103 autoSimpleMode regex did not include "magnum",
 *        so Magnum V4 72B received the heavy Hermes JSON-Schema prompt
 *        and produced JS-comment-style outputs like
 *        "// 登場人物たち（の集合） セリア".
 * This patch:
 *   A) Re-runs the simpleMode auto-enable check including /magnum|anthracite/
 *      and persists the result to localStorage (chr6.cfg.simpleMode).
 *   B) Wraps Planner.build so that even if the in-memory S.cfg.simpleMode
 *      cache is stale, it gets forced to 1 whenever the active model
 *      matches /magnum/.
 * Idempotent: guarded by window.__v236Active.
 * Designed to coexist with v208-v234 (in particular v209-magnum-tune.js).
 */
(function(){
  if (window.__v236Active) return;
  window.__v236Active = true;
  var TAG = '[v236]';

  // ---- A) localStorage-side auto-simpleMode for magnum ---------------------
  function magnumAutoSimple(){
    try {
      var raw = localStorage.getItem('chr6');
      if (!raw) return;
      var s = JSON.parse(raw);
      if (!s || !s.cfg) return;
      var cfg = s.cfg;
      if (cfg.provider !== 'openrouter') return;
      var m = String(cfg.orModel || cfg.model || '').toLowerCase();
      if (/magnum|anthracite/.test(m) && !cfg.simpleMode) {
        cfg.simpleMode = true;
        localStorage.setItem('chr6', JSON.stringify(s));
        console.log(TAG, 'auto-enabled simpleMode for', m);
      }
      // Also sync in-memory state if S is already live
      if (typeof S !== 'undefined' && S && S.cfg && /magnum|anthracite/.test(String(S.cfg.orModel||'').toLowerCase())) {
        S.cfg.simpleMode = 1;
      }
    } catch (e) {
      console.warn(TAG, 'magnumAutoSimple error', e);
    }
  }
  magnumAutoSimple();
  setTimeout(magnumAutoSimple, 800);
  setTimeout(magnumAutoSimple, 2000);

  // ---- B) Planner.build hook -----------------------------------------------
  function installPlannerHook(retries){
    try {
      if (typeof Planner === 'undefined' || !Planner || typeof Planner.build !== 'function') {
        if (retries > 0) {
          setTimeout(function(){ installPlannerHook(retries - 1); }, 500);
        } else {
          console.warn(TAG, 'Planner.build not found after retries');
        }
        return;
      }
      if (Planner.__v236Hooked) return;
      var orig = Planner.build;
      Planner.build = function(input, mode) {
        try {
          var m = ((typeof S !== 'undefined' && S && S.cfg && S.cfg.orModel) || '').toLowerCase();
          if (/magnum|anthracite/.test(m)) {
            if (S && S.cfg) S.cfg.simpleMode = 1;
          }
        } catch (e) {}
        return orig.call(this, input, mode);
      };
      Planner.__v236Hooked = true;
      console.log(TAG, 'Planner.build hooked');
    } catch (e) {
      console.warn(TAG, 'installPlannerHook error', e);
    }
  }
  installPlannerHook(40);

  // ---- Hook the model select so changing model re-applies simpleMode -------
  function bindModelChange(retries){
    try {
      var sel = document.getElementById('orModel') ||
                document.querySelector('select[data-cfg="orModel"]') ||
                document.querySelector('select[name="orModel"]');
      if (!sel) {
        if (retries > 0) setTimeout(function(){ bindModelChange(retries-1); }, 600);
        return;
      }
      if (sel.__v236Bound) return;
      sel.addEventListener('change', function(){
        setTimeout(magnumAutoSimple, 50);
      });
      sel.__v236Bound = true;
      console.log(TAG, 'model select bound');
    } catch (e) {}
  }
  bindModelChange(20);

  console.log(TAG, 'v236 magnum-simple-mode loaded');
})();
