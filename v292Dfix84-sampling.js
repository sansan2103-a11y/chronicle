// v292Dfix84 sampling-override
// 生成リクエスト(OpenRouter chat/completions)に多様性/反復抑制のサンプリング値を注入する。
// 値は cfg(localStorage chr6.cfg) の同名キーがあればそれを優先、無ければ既定値。
// fix80 の fetch ラップより外側で body を改変するため、retry でも値は保持される。
// バックスラッシュ不使用(CodeMirror paste 対策)。
(function(){
  function readCfg(){
    try{ var s = JSON.parse(localStorage.getItem('chr6')); return (s && s.cfg) || {}; }
    catch(e){ return {}; }
  }
  function pick(c, key, def){
    return (typeof c[key] === 'number') ? c[key] : def;
  }
  function params(){
    var c = readCfg();
    return {
      temperature: pick(c, 'temperature', 0.95),
      top_p: pick(c, 'top_p', 0.95),
      frequency_penalty: pick(c, 'frequency_penalty', 0.5),
      presence_penalty: pick(c, 'presence_penalty', 0.3)
    };
  }

  if(window.__v292Dfix84Installed) return;
  var origFetch = window.fetch;

  window.fetch = function(){
    var args = arguments;
    try{
      var url = (args[0] && args[0].url) || args[0];
      if(typeof url === 'string' && url.indexOf('chat/completions') >= 0){
        var init = args[1];
        if(init && typeof init.body === 'string'){
          var body = JSON.parse(init.body);
          var p = params();
          body.temperature = p.temperature;
          body.top_p = p.top_p;
          body.frequency_penalty = p.frequency_penalty;
          body.presence_penalty = p.presence_penalty;
          init.body = JSON.stringify(body);
        }
      }
    }catch(e){}
    return origFetch.apply(this, args);
  };

  window.__v292Dfix84Installed = true;
  window.__v292Dfix84Active = true;
  try{ console.log('[v292Dfix84] sampling override installed'); }catch(e){}
})();
