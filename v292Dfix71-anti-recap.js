// Chronicle TRPG - v292Dfix71: anti-recap (履歴逆流・反復崩壊の除去)
// 原因: fix35 が注入する番号付き「これまでの経緯」recap を、モデルが prose 化して
//   本文に吐き出し、turn.narrative に保存→次ターンで増幅→反復ループ崩壊。
// 修正: (1) anti-recap system 指示を後置 (2) クロスターン dedup で既出文を出力段で除去。
// flag: window.__v292Dfix71Active
(function v292Dfix71(){
  'use strict';
  if (window.__v292Dfix71Active) return;
  window.__v292Dfix71Active = true;
  var TAG = '[v292Dfix71:anti-recap]';
  var ANTI = '\n\n【最重要・出力規律：過去の再ナレーション禁止】\n'
    + '・「これまでの経緯」「storySoFar」「recentScenes」「recentDialogues」等の履歴は文脈把握のためだけ。本文(narrative)で再現しない。\n'
    + '・本文で過去の出来事を再ナレーション・要約・列挙しない。既に起きたこと（指を折った/腕を切った 等）を書き直さない。\n'
    + '・過去形で物語を頭から振り返る文（「○○は目を覚ました。…が現れ…」等）を書き出しに使わない。\n'
    + '・本文に書くのはプレイヤーの今回の入力の直後に起きる新しい一場面だけ（5〜10文）。\n'
    + '・キャラの現在の状態（傷の様子等）への言及は可。ただし「どう負ったか」の経緯再説明は不可。';
  function getPlanner(){ try { return (0,eval)('typeof Planner!=="undefined"?Planner:null'); } catch(e){ return null; } }
  function getState(){ try { var S=(0,eval)('typeof S!=="undefined"?S:null'); if(S&&S.turns)return S; } catch(e){} try { var r=localStorage.getItem('chr6'); if(r){var p=JSON.parse(r); if(p&&p.turns)return p;} } catch(e){} return {turns:[]}; }
  function antiRecapExt(ctx){ try { if (ctx && typeof ctx.sys==='string') return ctx.sys + ANTI; } catch(e){} return ctx && ctx.sys; }
  antiRecapExt.__v292Dfix71 = true;
  function norm(t){ return String(t==null?'':t).replace(/[「」『』（）()\s　…⋯。、！？!?.,<>\/="]/g,''); }
  function splitSentences(text){ var out=[],buf=''; for(var i=0;i<text.length;i++){ var c=text.charAt(i); buf+=c; if(c==='。'||c==='！'||c==='？'||c==='\n'){ if(buf.trim())out.push(buf); buf=''; } } if(buf.trim())out.push(buf); return out; }
  function crossTurnDedup(plan, ctx){
    try {
      if (!plan || !Array.isArray(plan.narrative)) return plan;
      var S = (ctx && ctx.state) || getState();
      var turns = (S && S.turns) || [];
      var prev = Object.create(null);
      turns.forEach(function(t){ splitSentences(String(t&&t.narrative||'')).forEach(function(s){ var k=norm(s); if(k.length>=8) prev[k]=1; }); });
      var dropped = 0;
      plan.narrative = plan.narrative.map(function(line){
        if (typeof line!=='string') return line;
        var kept = splitSentences(line).filter(function(s){ var k=norm(s); if(k.length>=8 && prev[k]){ dropped++; return false; } return true; });
        return kept.join('').trim();
      }).filter(function(l){ return l && String(l).trim().length>1; });
      if (dropped>0){ try{ console.log(TAG,'cross-turn dedup removed',dropped,'recap sentence(s)'); }catch(_){} }
    } catch(e){ try{ console.warn(TAG,'dedup err:',e&&e.message); }catch(_){} }
    return plan;
  }
  crossTurnDedup.__v292Dfix71 = true;
  function install(){
    var P = getPlanner();
    if (!P) { setTimeout(install,200); return false; }
    P._extensions = P._extensions || [];
    P._parseExtensions = P._parseExtensions || [];
    if (!P._extensions.some(function(f){return f&&f.__v292Dfix71;})) P._extensions.push(antiRecapExt);
    if (!P._parseExtensions.some(function(f){return f&&f.__v292Dfix71;})) P._parseExtensions.push(crossTurnDedup);
    try { console.log(TAG,'installed'); } catch(_){}
    return true;
  }
  function selfHeal(){
    var P = getPlanner();
    if (!P || !Array.isArray(P._extensions) || !Array.isArray(P._parseExtensions)) return;
    if (!P._extensions.some(function(f){return f&&f.__v292Dfix71;})) P._extensions.push(antiRecapExt);
    if (!P._parseExtensions.some(function(f){return f&&f.__v292Dfix71;})) P._parseExtensions.push(crossTurnDedup);
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',install); else install();
  setTimeout(install,400); setTimeout(install,1500); setTimeout(install,4000);
  setInterval(selfHeal,2000);
  try { console.log(TAG,'loaded'); } catch(_){}
})();
