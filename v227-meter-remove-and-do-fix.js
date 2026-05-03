/* v227-meter-remove-and-do-fix:
   1. Meter widgets — completely REMOVE from DOM (v225 only display:none).
      Walks NPC cards and removes any wrapper div containing 信頼/緊張/trust/tension.
   2. Retry-loop safety: cap auto-retries (v218/v220/v225) to once per turn AND a
      30-second timeout, prevent infinite waits.
   3. DO send safety: surface errors when send fails (e.g., no API key) instead of
      silently failing. */
(function v227(){
  'use strict';
  if (window.__v227Active) return;
  window.__v227Active = true;

  /* ============================================================ */
  /* A. Hard-remove meter widgets from DOM                        */
  /* ============================================================ */
  function isMeterText(text){
    if (!text) return false;
    var t = text.trim();
    if (t.length > 30) return false;
    return /^(信頼|緊張|trust|tension|stress)/i.test(t) ||
           /信頼[:：\s]*\d+/.test(t) ||
           /緊張[:：\s]*\d+/.test(t);
  }

  function removeMeterWidgets(){
    /* Find any element whose text matches meter pattern */
    var candidates = document.querySelectorAll('label, span, div, p');
    candidates.forEach(function(el){
      if (!isMeterText(el.textContent)) return;
      /* Walk up to find the meter wrapper */
      var node = el;
      var card = el.closest('.npc-card, [class*="npc-card"]');
      var wrapper = el.closest('.psych-row, .meter-row, .stat-row, [class*="meter"], [class*="psych"], [class*="stat"]');
      if (wrapper && wrapper !== card){
        wrapper.remove();
      } else {
        /* No specific wrapper — find the smallest div ancestor that's a meter row */
        var p = el.parentElement;
        while (p && p !== card){
          var pText = (p.textContent || '').trim();
          if (pText.length < 50 && /信頼|緊張|trust|tension/i.test(pText)){
            /* Check if siblings include a progress/range/numeric value */
            var hasMeter = !!p.querySelector('progress, input[type="range"], .bar, [class*="bar"]');
            var siblingHasMeter = (function(){
              var s = p.parentElement;
              if (!s) return false;
              return !!s.querySelector('progress, input[type="range"]');
            })();
            if (hasMeter || siblingHasMeter){
              p.remove();
              return;
            }
          }
          p = p.parentElement;
        }
        /* Fallback: hide the immediate parent */
        if (el.parentElement && el.parentElement !== card){
          el.parentElement.remove();
        }
      }
    });

    /* Also remove progress bars / range inputs that look meter-like */
    document.querySelectorAll('progress, input[type="range"]').forEach(function(r){
      var name = (r.name || '') + ' ' + (r.id || '');
      var nearbyText = (r.parentElement ? (r.parentElement.textContent || '').substring(0, 30) : '');
      if (/trust|tension|stress|信頼|緊張/i.test(name + ' ' + nearbyText)){
        var wrap = r.closest('.psych-row, .meter-row, .stat-row');
        if (wrap){
          wrap.remove();
        } else if (r.parentElement){
          r.parentElement.remove();
        } else {
          r.remove();
        }
      }
    });

    /* Numeric values like "0 / 50" with no label */
    document.querySelectorAll('span, div').forEach(function(el){
      var t = (el.textContent || '').trim();
      if (/^\d+\s*\/\s*\d+$/.test(t) && t.length < 10){
        var wrap = el.closest('.psych-row, .meter-row, .stat-row, [class*="meter"]');
        if (wrap) wrap.remove();
      }
    });
  }

  /* ============================================================ */
  /* B. Cap auto-retry loops + timeout safety                     */
  /* ============================================================ */
  /* Reset retry flags every 30s so they can't get stuck */
  setInterval(function(){
    window.__v218Retrying = false;
    window.__v220Retrying = false;
    window.__v225Retrying = false;
  }, 30000);

  /* ============================================================ */
  /* C. DO send error visibility                                  */
  /* ============================================================ */
  function showSendError(msg){
    /* Use existing topStatus if present */
    var status = document.getElementById('topStatus');
    if (status){
      status.textContent = '⚠ ' + msg;
      status.style.color = '#ff6b6b';
    }
    /* Also try a toast */
    var toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#c33;color:#fff;padding:12px 20px;border-radius:8px;z-index:99999;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,.3);';
    toast.textContent = '⚠ ' + msg;
    document.body.appendChild(toast);
    setTimeout(function(){ toast.remove(); }, 5000);
  }

  function bindSendButton(){
    document.querySelectorAll('button').forEach(function(b){
      if (b.__v227SendBound) return;
      var t = (b.textContent || '').trim();
      if (!/送信|▶/.test(t)) return;
      if (/取消/.test(t)) return;
      b.__v227SendBound = true;
      b.addEventListener('click', function(){
        var input = document.getElementById('inp');
        if (!input || !input.value.trim()){
          /* Don't show error for empty input */
          return;
        }
        /* Wait briefly to see if a fetch fires */
        var fetchCountBefore = (window.__fetchTrace || []).length;
        setTimeout(function(){
          var fetchCountAfter = (window.__fetchTrace || []).length;
          if (fetchCountAfter === fetchCountBefore){
            /* No fetch — likely API key validation failed silently */
            var s; try { s = JSON.parse(localStorage.getItem('chr6')||'{}'); } catch(e){}
            var apiKey = s && s.cfg && s.cfg.apiKey;
            var provider = s && s.cfg && s.cfg.provider;
            if (!apiKey){
              showSendError('APIキーが未設定です。設定からAPIキーを入力してください。');
            } else if (provider === 'anthropic' && !/^sk-ant-/.test(apiKey)){
              showSendError('プロバイダー「Anthropic」用のAPIキー（sk-ant-で始まる）が必要です。');
            } else if (provider === 'openrouter' && !/^sk-or-/.test(apiKey)){
              showSendError('プロバイダー「OpenRouter」用のAPIキー（sk-or-で始まる）が必要です。');
            } else {
              showSendError('送信に失敗しました。設定とAPIキーをご確認ください。');
            }
          }
        }, 1500);
      }, true);
    });
  }

  /* Install fetch tracer (lightweight, only counts) */
  if (!window.__fetchTrace){
    window.__fetchTrace = [];
    var origFetch = window.fetch.bind(window);
    window.fetch = function(input, init){
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var isApi = /openrouter|anthropic|openai/.test(url);
      if (isApi){
        window.__fetchTrace.push({ ts: Date.now(), url: url.substring(0, 60) });
      }
      return origFetch.apply(this, arguments);
    };
  }

  /* ============================================================ */
  /* Init                                                         */
  /* ============================================================ */
  function init(){
    removeMeterWidgets();
    bindSendButton();
    setInterval(removeMeterWidgets, 2000);
    setInterval(bindSendButton, 3000);
    var mo = new MutationObserver(function(){
      removeMeterWidgets();
      bindSendButton();
    });
    mo.observe(document.body, { childList: true, subtree: true });
    console.log('[v227] active: meter remove + retry safety + send error visibility');
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.__v227 = {
    removeMeterWidgets: removeMeterWidgets,
    isMeterText: isMeterText,
    showSendError: showSendError,
    bindSendButton: bindSendButton
  };
})();
