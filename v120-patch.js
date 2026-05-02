/* v120: bump max_tokens + suppress wasteful retries */
(function v120(){
  'use strict';
  var TAG = '[v120]';
  if (window.__v120Active) return;
  window.__v120Active = true;

  /* Override fetch to ensure max_tokens is generous and inject length hint */
  var origFetch = window.fetch;
  window.fetch = function(url, opts){
    try {
      if (typeof url === 'string' &&
          (url.indexOf('openrouter.ai') !== -1 || url.indexOf('api.anthropic.com') !== -1) &&
          opts && opts.body && typeof opts.body === 'string'){
        var b = JSON.parse(opts.body);
        if (b && b.messages){
          /* Force generous max_tokens — overrides v102's lower caps */
          b.max_tokens = 4096;
          /* Anti-repetition stays */
          if (b.repetition_penalty === undefined) b.repetition_penalty = 1.15;
          if (b.frequency_penalty === undefined) b.frequency_penalty = 0.4;
          if (b.presence_penalty === undefined) b.presence_penalty = 0.3;
          /* Inject length hint into last system message */
          var sys = b.messages.find(function(m){ return m.role === 'system'; });
          if (sys && typeof sys.content === 'string' && sys.content.indexOf('1ターン') < 0){
            sys.content += '\n\n【出力ルール】\n- 1ターンは地の文＋会話で 300〜500字以内に収める\n- 「と考えて」「と思って」のような同型構文を3回以上連続させない\n- 同じフレーズの繰り返しは最大2回まで\n- 1タ・ン内の《内的独白》は最大2個まで\n- 【メタ見出し】や「↓」のような指示文を出力に含めない';
            opts.body = JSON.stringify(b);
          } else {
            opts.body = JSON.stringify(b);
          }
        }
      }
    } catch(e){}
    return origFetch.apply(this, arguments);
  };

  /* Suppress the foreign-language retry storm */
  if (window.__retryGuardInstalled !== 'v120'){
    var origConsoleWarn = console.warn;
    var retryCount = 0;
    var lastRetryTs = 0;
    console.warn = function(){
      var msg = Array.prototype.join.call(arguments, ' ');
      if (/外国語|Retry/.test(msg)){
        var now = Date.now();
        if (now - lastRetryTs < 60000){
          retryCount++;
          if (retryCount >= 2){
            console.log(TAG, 'BLOCKED retry storm');
            return;
          }
        } else {
          retryCount = 0;
        }
        lastRetryTs = now;
      }
      return origConsoleWarn.apply(this, arguments);
    };
    window.__retryGuardInstalled = 'v120';
  }

  console.log(TAG, 'v120 active: max_tokens 4096 + length-hint + retry guard');
})();
