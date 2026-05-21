/* v292Dfix80 — generation gate + auto-retry (関所＋再生成)
 * window.fetch をラップし、OpenRouter chat/completions 呼び出しを監視:
 *   - HTTPエラー(429/5xx)・ネットワーク例外 → バックオフして再試行
 *   - 空応答/極端に短い/退行的反復(ループ崩壊) → 同一リクエストで再生成
 *   最大 MAX 回。すべて失敗なら最後の応答を返す(無限ループ防止)。
 * 前提: 非ストリーミング。応答は[空白padding]+JSON(choices[0].message.content)。
 * 注: 「冗長/思案で停滞」のような品質ゲートは別パッチ(<beat>方式)。本パッチは信頼性担当。
 */
(function(){
'use strict';
var MAX = 3;
var ENDPOINT = "openrouter.ai/api/v1/chat/completions";

function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

function extractContent(text){
  try{
    var i = text.indexOf("{");
    if(i < 0) return null;
    var json = JSON.parse(text.slice(i));
    if(json && json.choices && json.choices[0]){
      var ch = json.choices[0];
      if(ch.message && typeof ch.message.content === "string") return ch.message.content;
      if(typeof ch.text === "string") return ch.text;
    }
  }catch(e){}
  return null;
}

function isDegenerate(content){
  var parts = content.split(/[。．！？]/).map(function(s){ return s.trim(); }).filter(function(s){ return s.length >= 4; });
  if(parts.length < 4) return false;
  var seen = {}; var uniq = 0;
  for(var i=0;i<parts.length;i++){ if(!seen[parts[i]]){ seen[parts[i]] = 1; uniq++; } }
  return (uniq / parts.length) < 0.5;
}

function gatePass(content){
  if(content == null) return false;
  if(content.trim().length < 20) return false;
  if(isDegenerate(content)) return false;
  return true;
}

function makeWrapper(orig){
  var wrapped = async function(){
    var args = arguments;
    var url = (args[0] && args[0].url) || args[0];
    var isCompletion = (typeof url === "string") && url.indexOf(ENDPOINT) !== -1;
    if(!isCompletion) return orig.apply(this, args);

    var last = null;
    for(var attempt = 0; attempt < MAX; attempt++){
      var resp;
      try{
        resp = await orig.apply(this, args);
      }catch(e){
        if(attempt < MAX - 1){ await sleep(1500 * (attempt + 1)); continue; }
        throw e;
      }
      if(!resp.ok){
        last = resp;
        if(attempt < MAX - 1){ await sleep(resp.status === 429 ? 2500 * (attempt + 1) : 1200); continue; }
        return resp;
      }
      var text = "";
      try{ text = await resp.clone().text(); }catch(e){ return resp; }
      var content = extractContent(text);
      if(gatePass(content)){
        if(attempt > 0){ try{ console.log("[v292Dfix80] passed after retry #" + attempt); }catch(e){} }
        return resp;
      }
      last = resp;
      if(attempt < MAX - 1){ try{ console.log("[v292Dfix80] gate fail, regenerating (" + (attempt + 1) + ")"); }catch(e){} await sleep(600); continue; }
    }
    return last;
  };
  wrapped.__fix80 = true;
  return wrapped;
}

function install(){
  try{
    if(typeof window.fetch === "function" && !window.fetch.__fix80){
      window.fetch = makeWrapper(window.fetch);
    }
    window.__v292Dfix80Active = true;
  }catch(e){}
}
install();
setInterval(install, 2000);
try{ if(window.console && console.log) console.log("[v292Dfix80] generation gate + auto-retry installed"); }catch(e){}
})();
