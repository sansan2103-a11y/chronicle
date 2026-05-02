/* v146 EMERGENCY: disable v120 over-aggressive foreign-language retry guard + dialogue stream scrollable fix */
(function v146(){
  'use strict';
  var TAG = '[v146]';
  if (window.__v146Active) return;
  window.__v146Active = true;

  var permissiveCheck = function(text){
    if (!text || typeof text !== 'string') return false;
    var jpChars = (text.match(/[ぁ-ゖァ-ヺ一-鿿]/g) || []).length;
    var totalLen = text.replace(/\s/g, '').length;
    if (totalLen < 50) return false;
    var ratio = jpChars / totalLen;
    return ratio < 0.3;
  };

  var GUARD_NAMES = ['containsForeign','hasForeign','detectForeign','isJapaneseEnough','isMostlyJapanese','foreignLangCheck','checkForeignLang','shouldRetryForeign','needsRetry'];
  GUARD_NAMES.forEach(function(name){
    try {
      if (typeof window[name] === 'function'){
        window[name] = function(){ return permissiveCheck(arguments[0]); };
        console.log(TAG, 'overrode global', name);
      }
    } catch(e){}
  });

  var retryWindow = false;
  var origLog = console.log;
  console.log = function(){
    var args = Array.prototype.slice.call(arguments);
    var s = args.map(function(a){ return typeof a === 'string' ? a : ''; }).join(' ');
    if (/外国語混入を検出/.test(s)){
      retryWindow = true;
      console.warn(TAG, 'foreign-lang retry detected — suppressing');
      setTimeout(function(){ retryWindow = false; }, 5000);
      return;
    }
    return origLog.apply(console, args);
  };

  var origAbortController = window.AbortController;
  if (origAbortController){
    window.AbortController = function(){
      var ctrl = new origAbortController();
      var origAbort = ctrl.abort.bind(ctrl);
      ctrl.abort = function(reason){
        if (retryWindow){
          console.log(TAG, 'abort blocked during retry window');
          return;
        }
        return origAbort(reason);
      };
      return ctrl;
    };
    window.AbortController.prototype = origAbortController.prototype;
  }

  function unstickSubmit(){
    var btns = document.querySelectorAll('button:disabled');
    btns.forEach(function(b){
      if (/送信|▶/.test(b.textContent || '') || b.id === 'send' || b.id === 'submit'){
        if (b.__v146disabledAt){
          var elapsed = Date.now() - b.__v146disabledAt;
          if (elapsed > 60000){
            console.log(TAG, 'unsticking submit button after', elapsed, 'ms');
            b.disabled = false;
            b.__v146disabledAt = 0;
          }
        } else {
          b.__v146disabledAt = Date.now();
        }
      } else {
        b.__v146disabledAt = 0;
      }
    });
  }

  function unstickLoading(){
    var loading = document.querySelectorAll('.loading, #loading, [class*="loading"], [class*="紡い"]');
    loading.forEach(function(el){
      if (el.style.display === 'none' || !el.offsetParent) return;
      if (el.__v146visibleAt){
        var elapsed = Date.now() - el.__v146visibleAt;
        if (elapsed > 90000){
          console.log(TAG, 'hiding stuck loading indicator after', elapsed, 'ms');
          el.style.display = 'none';
          el.__v146visibleAt = 0;
        }
      } else {
        el.__v146visibleAt = Date.now();
      }
    });
  }

  function ensureDialogueScrollable(){
    var stream = document.getElementById('dialogue-stream');
    if (!stream) return;
    var cs = window.getComputedStyle(stream);
    if (cs.overflowY !== 'auto' && cs.overflowY !== 'scroll'){
      var rect = stream.getBoundingClientRect();
      var available = window.innerHeight - rect.top - 180;
      if (available < 300) available = 300;
      stream.style.maxHeight = available + 'px';
      stream.style.overflowY = 'auto';
      stream.style.overflowX = 'hidden';
      console.log(TAG, 'dialogue-stream made scrollable: maxHeight=' + available + 'px');
    }
    var parent = stream.parentElement;
    while (parent && parent.tagName !== 'BODY'){
      var ps = window.getComputedStyle(parent);
      if (ps.overflow === 'hidden' && !parent.__v146fixed){
        parent.style.overflow = 'visible';
        parent.__v146fixed = true;
      }
      parent = parent.parentElement;
    }
  }

  function injectScrollCSS(){
    if (document.getElementById('v146-scroll-css')) return;
    var style = document.createElement('style');
    style.id = 'v146-scroll-css';
    style.textContent = [
      '#dialogue-stream {',
      '  max-height: calc(100vh - 280px) !important;',
      '  overflow-y: auto !important;',
      '  overflow-x: hidden !important;',
      '  scrollbar-width: thin !important;',
      '  scrollbar-color: var(--acc, #8b76f0) transparent !important;',
      '}',
      '#dialogue-stream::-webkit-scrollbar { width: 8px; }',
      '#dialogue-stream::-webkit-scrollbar-thumb { background: var(--acc, #8b76f0); border-radius: 4px; }',
      '#dialogue-stream::-webkit-scrollbar-track { background: transparent; }',
      '@media (max-width: 768px){',
      '  #dialogue-stream { max-height: 50vh !important; }',
      '}'
    ].join('\n');
    document.head.appendChild(style);
    console.log(TAG, 'injected scroll CSS');
  }

  function init(){
    injectScrollCSS();
    setTimeout(ensureDialogueScrollable, 500);
    setTimeout(ensureDialogueScrollable, 2000);
    setTimeout(unstickSubmit, 5000);
    setTimeout(unstickLoading, 5000);
    setInterval(function(){
      unstickSubmit();
      unstickLoading();
      ensureDialogueScrollable();
    }, 10000);
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  console.log(TAG, 'v146 active: foreign-lang retry guard DISABLED + scroll fix + unsticker');
})();
