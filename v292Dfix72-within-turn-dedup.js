// Chronicle TRPG - v292Dfix72: within-turn repetition guard
// 症状: モデル（特に Hermes 4）が1ターンの narrative 内で同じ文を延々繰り返す。
// fix71 のクロスターン dedup は前ターンとの重複しか消さず、ターン内ループは素通り。
// fix26/27 の dedup は正規化フル行一致なので run-on（1行内反復）を取りこぼす。
// 修正: 各 narrative 行を「。！？改行」で文分割し、ターン内で既出の文（正規化>=8字）を除去。
//   seen はターン内で行をまたいで共有 → 1行内ループも複数行ループも両方捕捉。
// flag: window.__v292Dfix72Active
(function v292Dfix72(){
  'use strict';
  if (window.__v292Dfix72Active) return;
  window.__v292Dfix72Active = true;
  var TAG = '[v292Dfix72:within-turn-dedup]';
  function getPlanner(){ try { return (0,eval)('typeof Planner!=="undefined"?Planner:null'); } catch(e){ return null; } }
  function norm(t){ return String(t==null?'':t).replace(/[「」『』（）()\s　…⋯。、！？!?.,<>\/="]/g,''); }
  function splitSentences(text){
    var out=[],buf='';
    for (var i=0;i<text.length;i++){ var c=text.charAt(i); buf+=c; if(c==='。'||c==='！'||c==='？'||c==='\n'){ if(buf.trim())out.push(buf); buf=''; } }
    if (buf.trim()) out.push(buf);
    return out;
  }
  function withinTurnDedup(plan, ctx){
    try {
      if (!plan || !Array.isArray(plan.narrative)) return plan;
      var seen = Object.create(null);
      var dropped = 0;
      plan.narrative = plan.narrative.map(function(line){
        if (typeof line !== 'string') return line;
        var parts = splitSentences(line);
        var kept = [];
        for (var i=0;i<parts.length;i++){
          var s = parts[i];
          var k = norm(s);
          if (k.length >= 8 && seen[k]){ dropped++; continue; }
          if (k.length >= 8) seen[k] = 1;
          kept.push(s);
        }
        return kept.join('').trim();
      }).filter(function(l){ return l && String(l).trim().length>1; });
      if (dropped>0){ try{ console.log(TAG,'removed',dropped,'repeated sentence(s) within turn'); }catch(_){} }
    } catch(e){ try{ console.warn(TAG,'err:',e&&e.message); }catch(_){} }
    return plan;
  }
  withinTurnDedup.__v292Dfix72 = true;
  function install(){
    var P = getPlanner();
    if (!P) { setTimeout(install,200); return false; }
    P._parseExtensions = P._parseExtensions || [];
    if (!P._parseExtensions.some(function(f){return f&&f.__v292Dfix72;})) P._parseExtensions.push(withinTurnDedup);
    try { console.log(TAG,'installed'); } catch(_){}
    return true;
  }
  function selfHeal(){
    var P = getPlanner();
    if (!P || !Array.isArray(P._parseExtensions)) return;
    if (!P._parseExtensions.some(function(f){return f&&f.__v292Dfix72;})) P._parseExtensions.push(withinTurnDedup);
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',install); else install();
  setTimeout(install,400); setTimeout(install,1500); setTimeout(install,4000);
  setInterval(selfHeal,2000);
  try { console.log(TAG,'loaded'); } catch(_){}
})();
