/* v135: re-wrap fetch to STRIP <DIALOGUES> block from response body before existing narrative parser sees it */
(function v135(){
  'use strict';
  var TAG = '[v135]';
  if (window.__v135Active) return;
  window.__v135Active = true;

  var prevFetch = window.fetch.bind(window);

  window.fetch = function(input, init){
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var isApi = /openrouter\.ai|api\.anthropic\.com|api\.openai\.com/.test(url);

    var p = prevFetch(input, init);
    if (!isApi) return p;

    return p.then(function(originalResponse){
      return originalResponse.clone().text().then(function(text){
        try {
          var resp = JSON.parse(text);
          var modified = false;

          if (resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content){
            var c = resp.choices[0].message.content;
            if (/<DIALOGUES>[\s\S]*?<\/DIALOGUES>/.test(c)){
              resp.choices[0].message.content = c.replace(/\s*<DIALOGUES>[\s\S]*?<\/DIALOGUES>\s*/g, '').trim();
              modified = true;
            }
          }
          if (resp.content && resp.content[0] && resp.content[0].text){
            var t = resp.content[0].text;
            if (/<DIALOGUES>[\s\S]*?<\/DIALOGUES>/.test(t)){
              resp.content[0].text = t.replace(/\s*<DIALOGUES>[\s\S]*?<\/DIALOGUES>\s*/g, '').trim();
              modified = true;
            }
          }

          if (modified){
            console.log(TAG, 'stripped <DIALOGUES> from response body');
            return new Response(JSON.stringify(resp), {
              status: originalResponse.status,
              statusText: originalResponse.statusText,
              headers: originalResponse.headers
            });
          }
        } catch(e){ }
        return originalResponse;
      }).catch(function(){ return originalResponse; });
    });
  };

  function cleanExistingNarratives(){
    try {
      var s = JSON.parse(localStorage.getItem('chr6') || '{}');
      var turns = s.turns || [];
      var changed = false;
      turns.forEach(function(t){
        if (t.narrative && /<DIALOGUES>[\s\S]*?<\/DIALOGUES>/.test(t.narrative)){
          t.narrative = t.narrative.replace(/\s*<DIALOGUES>[\s\S]*?<\/DIALOGUES>\s*/g, '').trim();
          changed = true;
          console.log(TAG, 'cleaned existing narrative');
        }
      });
      if (changed){
        localStorage.setItem('chr6', JSON.stringify(s));
        try { if (typeof UI === 'object' && UI && UI.renderAll) UI.renderAll(); } catch(e){}
      }
    } catch(e){}
  }

  function init(){
    cleanExistingNarratives();
    setTimeout(cleanExistingNarratives, 1500);
    setTimeout(cleanExistingNarratives, 5000);
  }

  if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', init); } else { init(); }

  console.log(TAG, 'v135 active: strip DIALOGUES from response body');
})();
