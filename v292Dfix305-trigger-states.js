// =====================================================================
// Chronicle TRPG - v292Dfix305: キャラ状態のトリガー注入(倉庫方式・Phase1)
//   背景(おしんと設計): キャラ状態(fix77)は全キャラ無制限注入でsys肥大→長期でPro劣化。
//   案: キャラ一覧=倉庫。状態は保持しつつ、sysには「今登場してるキャラだけ」注入する。
//     トリガー=キャラ名が直近ターンに出てる(=場面的に必要)。未登録NPCもquasi-packの
//     登場で名前が本文に出るので同じく拾える。主人公は常時。
//   手法: fix77が注入した状態ブロックを、後段の_extensionで「登場中の行だけ」に絞る
//     (fix77本体は不触・倉庫=fix77ストアはそのまま保持)。OFF: v292Dfix305Off='1'
//   ※これは最小版。永久canon層/UIでのトリガー編集は後フェーズ。
// =====================================================================
(function(){
  'use strict';
  var TAG='[v292Dfix305:trigger-states]';
  if(window.__v292Dfix305) return; window.__v292Dfix305=true;
  var RECENT_TURNS=4;
  var HEADER='【各キャラの現在の状態';
  var FOOTER_MARK='・この状態を';
  function off(){ try{ return localStorage.getItem('v292Dfix305Off')==='1'; }catch(e){ return false; } }
  function getS(){ try{ return window.S||(typeof S!=='undefined'?S:null); }catch(e){ return null; } }
  function recentText(){
    var s=getS(); if(!s||!Array.isArray(s.turns)) return '';
    return s.turns.slice(-RECENT_TURNS).map(function(t){ return (t&&t.narrative||'')+' '+(t&&t.playerText||''); }).join(' ');
  }
  function heroName(){ try{ var s=getS(); return (s&&s.cast&&s.cast.hero&&s.cast.hero.name)||''; }catch(e){ return ''; } }
  function isActive(name, rt, hero){
    if(!name) return false;
    if(hero && name===hero) return true;   // 主人公は常時
    return rt.indexOf(name)>=0;             // 名前が直近に出た=登場中(トリガー)
  }
  function filterStatesBlock(sys){
    if(off()||typeof sys!=='string') return sys;
    try{
      var hi=sys.indexOf(HEADER); if(hi<0) return sys;
      var headerLineEnd=sys.indexOf('\n', hi); if(headerLineEnd<0) return sys;
      var linesStart=headerLineEnd+1;
      var footerMarkIdx=sys.indexOf(FOOTER_MARK, linesStart); if(footerMarkIdx<0) return sys;
      var footerLineStart=sys.lastIndexOf('\n', footerMarkIdx); if(footerLineStart<linesStart) footerLineStart=footerMarkIdx;
      var body=sys.slice(linesStart, footerLineStart);
      var rt=recentText(), hero=heroName();
      var kept=body.split('\n').filter(function(line){
        if(!line.trim()) return false;
        var name=line.split('｜')[0].trim();
        return isActive(name, rt, hero);
      });
      var newBody = kept.length ? kept.join('\n') : '';
      return sys.slice(0, linesStart) + newBody + sys.slice(footerLineStart);
    }catch(e){ return sys; }
  }
  function ext(ctx){ try{ if(ctx&&typeof ctx.sys==='string') return filterStatesBlock(ctx.sys); }catch(e){} return ctx?ctx.sys:undefined; }
  ext.__v292Dfix305=true;
  function install(){
    var P=window.Planner||(typeof Planner!=='undefined'?Planner:null);
    if(!P||!Array.isArray(P._extensions)) return false;
    for(var i=P._extensions.length-1;i>=0;i--){ if(P._extensions[i]&&P._extensions[i].__v292Dfix305) P._extensions.splice(i,1); }
    P._extensions.push(ext); // 末尾=fix77等の後に走り、組み上がった状態ブロックを絞る
    return true;
  }
  install(); try{ setInterval(install,2000); }catch(e){}
  window.__v292Dfix305api={ filterStatesBlock:filterStatesBlock, isActive:isActive, recentText:recentText, heroName:heroName };
  try{ console.log(TAG,'loaded'); }catch(e){}
})();
