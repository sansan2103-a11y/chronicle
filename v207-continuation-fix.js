/* v207-continuation-fix: stronger continuation detection.
   The "続きを書く" button sends playerText "続きを自然に進めてください。" which
   v206's narrow regex didn't catch. v207 catches any short user text containing
   continuation keywords and forcefully anchors to last narrative tail. */
(function v207(){
  'use strict';
  if (window.__v207Active) return;
  window.__v207Active = true;

  var origFetch = window.fetch.bind(window);
  window.fetch = function(input, init){
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var isApi = /openrouter\.ai|api\.anthropic\.com|api\.openai\.com/.test(url);
    if (isApi && init && init.body){
      try {
        var body = JSON.parse(init.body);
        if (body.messages && Array.isArray(body.messages)){
          var lastUser = null;
          for (var j = body.messages.length - 1; j >= 0; j--){
            if (body.messages[j].role === 'user'){ lastUser = body.messages[j]; break; }
          }
          if (lastUser){
            var ut = String(lastUser.content || '');
            /* Wide continuation match — any short message containing
               continuation keywords. */
            var isContinuation = ut.length < 100 &&
              /続き|続け|自然に進め|そのまま|このまま|どうなる|それから|そして|引き続き/.test(ut);
            if (isContinuation){
              try {
                var s = JSON.parse(localStorage.getItem('chr6') || '{}');
                var turns = s.turns || [];
                if (turns.length > 0){
                  var last = turns[turns.length - 1];
                  if (last && last.narrative){
                    var tail = last.narrative.substring(Math.max(0, last.narrative.length - 400));
                    lastUser.content = '【重要】これは物語の続きの生成リクエストです。**新しいシーンを作らず**、必ず以下の続きを書いてください：\n\n直前の物語：\n```\n' + tail + '\n```\n\nこの直後から自然に続けてください。場所も時間も登場人物も同じです。最初から書き直したり、別の目覚めシーンを作ったりしないでください。';
                    console.log('[v207] continuation anchor injected, tail:', tail.substring(0, 50));
                  }
                }
              } catch(e){}
            }
          }
          init.body = JSON.stringify(body);
        }
      } catch(e){}
    }
    return origFetch(input, init);
  };

  console.log('[v207] active: stronger continuation detection');
})();
