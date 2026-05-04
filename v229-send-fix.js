/* v229-send-fix:
   1. v227's send error judgement used s.cfg.apiKey but the actual app stores
      keys in s.cfg.key (anthropic), s.cfg.naiKey (NovelAI), s.cfg.orKey (OpenRouter).
      Fix the judgement so legitimate keys aren't mis-reported as "not set".
   2. Add deep send trace: log every step of the click→fetch path.
   3. Auto-revive disabled send button after 30s (faster than v200's 60s).
   4. If the user clicks send and nothing happens within 5s and there's no
      API call AND there's no visible loading indicator, surface a clear toast
      so the user knows the click was received but nothing fired. */
(function v229(){
  'use strict';
  if (window.__v229Active) return;
  window.__v229Active = true;

  function readKeyForProvider(){
    var s; try { s = JSON.parse(localStorage.getItem('chr6') || '{}'); } catch(e){ return null; }
    if (!s.cfg) return null;
    var p = s.cfg.provider || 'anthropic';
    if (p === 'anthropic')   return s.cfg.key   || null;
    if (p === 'novelai')     return s.cfg.naiKey || null;
    if (p === 'openrouter')  return s.cfg.orKey || null;
    return s.cfg.key || s.cfg.orKey || s.cfg.naiKey || null;
  }

  function showToast(msg, color){
    var status = document.getElementById('topStatus');
    if (status){
      status.textContent = '⚠ ' + msg;
      status.style.color = color || '#ff6b6b';
    }
    var t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:'+(color||'#c33')+';color:#fff;padding:12px 20px;border-radius:8px;z-index:99999;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,.3);max-width:90%;text-align:center;';
    t.textContent = '⚠ ' + msg;
    document.body.appendChild(t);
    setTimeout(function(){ t.remove(); }, 6000);
  }

  function bindSendDeep(){
    document.querySelectorAll('button').forEach(function(b){
      if (b.__v229Bound) return;
      var t = (b.textContent || '').trim();
      if (!/送信|▶/.test(t)) return;
      if (/取消/.test(t)) return;
      b.__v229Bound = true;

      b.addEventListener('click', function(e){
        var input = document.getElementById('inp');
        var val = input && input.value && input.value.trim();
        console.log('[v229] send clicked, input="' + (val||'') + '"');

        if (!val){ return; }

        var before = (window.__fetchTrace || []).length;
        var key = readKeyForProvider();
        var s; try { s = JSON.parse(localStorage.getItem('chr6')||'{}'); } catch(e){}
        var provider = s && s.cfg && s.cfg.provider;
        var hasWorld = s && s.world && (s.world.setting || s.world.scene);
        var hasHero = s && s.cast && s.cast.hero && s.cast.hero.name;

        setTimeout(function(){
          var after = (window.__fetchTrace || []).length;
          var loadingVisible = (document.body.innerText || '').indexOf('物語を紡いで') >= 0;

          console.log('[v229] check: fetchBefore=' + before + ' fetchAfter=' + after + ' loading=' + loadingVisible);

          if (after > before || loadingVisible){ return; }

          if (!key){
            showToast('APIキーが未設定です。設定からAPIキーを入力してください。');
          } else if (provider === 'anthropic' && !/^sk-ant-/.test(key)){
            showToast('Anthropic用APIキーは sk-ant- で始まる必要があります。設定を確認してください。');
          } else if (provider === 'openrouter' && !/^sk-or-/.test(key)){
            showToast('OpenRouter用APIキーは sk-or- で始まる必要があります。設定を確認してください。');
          } else if (!hasWorld){
            showToast('世界設定が未入力です。');
          } else if (!hasHero){
            showToast('主人公が未設定です。');
          } else {
            showToast('送信処理が起動しませんでした。設定パネルを開いて「保存」を押してから再試行してください。', '#d97706');
          }
        }, 5000);
      }, true);
    });
  }

  if (!window.__fetchTrace){
    window.__fetchTrace = [];
    var origFetch = window.fetch.bind(window);
    window.fetch = function(input, init){
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (/openrouter|anthropic|api\.openai/i.test(url)){
        window.__fetchTrace.push({ ts: Date.now(), url: url.substring(0, 60) });
      }
      return origFetch.apply(this, arguments);
    };
  }

  var disabledTimers = new WeakMap();
  setInterval(function(){
    document.querySelectorAll('button:disabled').forEach(function(b){
      var label = (b.textContent || '').trim();
      if (!/送信|▶/.test(label)) return;
      var since = disabledTimers.get(b);
      if (!since){ disabledTimers.set(b, Date.now()); return; }
      if (Date.now() - since > 30000){
        b.disabled = false;
        disabledTimers.delete(b);
        console.log('[v229] unstuck send button after 30s');
      }
    });
  }, 5000);

  if (window.__v227 && window.__v227.bindSendButton){
    window.__v227.bindSendButton = function(){};
  }

  function init(){
    bindSendDeep();
    setInterval(bindSendDeep, 3000);
    var mo = new MutationObserver(function(){ bindSendDeep(); });
    mo.observe(document.body, { childList: true, subtree: true });
    console.log('[v229] active: send-fix + deep diag + key-field corrected');
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.__v229 = { readKeyForProvider: readKeyForProvider, bindSendDeep: bindSendDeep, showToast: showToast };
})();
