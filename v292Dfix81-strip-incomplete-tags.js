/* v292Dfix81 — strip incomplete/leftover <state> tags from narrative
 * fix77(captureState) は完全な <state ... /> を捕捉・除去するが、
 * モデル出力が truncate されると尻切れタグ(例: <state who="A" からだ="...) が
 * 展開描写に漏れる。本パッチは _parseExtensions の末尾で走り、
 * 残った <state> 断片(完全/尻切れ/孤立クローズ)を表示用 narrative から除去する。
 * 注: <say> は会話ログのカード化に使うため触らない(fix64/66が処理)。
 * 正規表現はバックスラッシュ非使用(ペースト事故回避)。
 */
(function(){
'use strict';
function clean(s){
  if(typeof s !== "string") return s;
  s = s.replace(/<state[^>]*[/]?>/gi, "");
  s = s.replace(/<state[^>]*$/i, "");
  s = s.replace(/<[/]state>/gi, "");
  return s;
}
function fix81Ext(plan, ctx){
  try{
    if(plan && Array.isArray(plan.narrative)){
      var out = [];
      for(var i = 0; i < plan.narrative.length; i++){
        var o = plan.narrative[i];
        if(typeof o !== "string"){ out.push(o); continue; }
        var c = clean(o);
        if(o.trim().length > 0 && c.trim().length === 0) continue;
        out.push(c);
      }
      plan.narrative = out;
    }
    if(plan && typeof plan._structuredNarrative === "string"){
      plan._structuredNarrative = clean(plan._structuredNarrative);
    }
  }catch(e){}
  return plan;
}
fix81Ext.__fix81 = "strip-incomplete-tags";
function install(){
  try{
    var P = window.Planner;
    if(!P || !Array.isArray(P._parseExtensions)) return;
    for(var i = P._parseExtensions.length - 1; i >= 0; i--){
      if(P._parseExtensions[i] && P._parseExtensions[i].__fix81 === "strip-incomplete-tags"){ P._parseExtensions.splice(i, 1); }
    }
    P._parseExtensions.push(fix81Ext);
    window.__v292Dfix81Active = true;
  }catch(e){}
}
install();
setInterval(install, 2000);
try{ if(window.console && console.log) console.log("[v292Dfix81] strip-incomplete-tags installed (tail)"); }catch(e){}
})();
