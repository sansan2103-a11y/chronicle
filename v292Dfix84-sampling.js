// v292Dfix84 sampling-override
// 生成リクエスト(OpenRouter chat/completions)に多様性/反復抑制のサンプリング値を注入する。
// 値は cfg(localStorage chr6.cfg) の同名キーがあればそれを優先、無ければ既定値。
// fix80 の fetch ラップより外側で body を改変するため、retry でも値は保持される。
// バックスラッシュ不使用(CodeMirror paste 対策)。
// ---------------------------------------------------------------------
// 2026-07-17 fix482同梱の改修(?cb=v292Dfix482):
//  1) 既定 temperature 0.95 は Hermes-4 時代の調整値。DeepSeek 系には高すぎて
//     語の反復ループ崩壊を誘発しやすい(おしん実プレイで実測)→ モデル別既定値へ。
//     deepseek 系 = 0.85(index.html本体の元の値)。それ以外 = 従来どおり 0.95。
//     cfg(chr6.cfg)の明示値は通常リクエストでは最優先(挙動互換)。
//  2) init.__f482Retry === true のリクエスト(fix482の品質再生成)は、fix482が設定した
//     サンプリング値を尊重して上書きしない(このときはcfg明示値も適用されない)。
//     マーカーは init オブジェクトの非送信プロパティ=JSON bodyに入らないため、
//     ネットワークへ漏れる経路が構造的に存在しない(GPT-5.6監査 重大4の反映)。
(function(){
  function readCfg(){
    try{ var s = JSON.parse(localStorage.getItem('chr6')); return (s && s.cfg) || {}; }
    catch(e){ return {}; }
  }
  function pick(c, key, def){
    return (typeof c[key] === 'number') ? c[key] : def;
  }
  function params(model){
    var c = readCfg();
    var isDeepseek = String(model || '').toLowerCase().indexOf('deepseek') >= 0;
    return {
      temperature: pick(c, 'temperature', isDeepseek ? 0.85 : 0.95),
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
        if(init && init.__f482Retry === true){
          // fix482 の品質再生成: fix482 が設定したサンプリング値を尊重(bodyは触らない)。
          // __f482Retry は init 上の非送信プロパティなのでネットワークへは漏れない。
        } else if(init && typeof init.body === 'string'){
          var body = JSON.parse(init.body);
          var p = params(body && body.model);
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
