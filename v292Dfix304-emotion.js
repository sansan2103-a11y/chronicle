// =====================================================================
// Chronicle TRPG - v292Dfix304: 感情描写ガード(生々しさ)を既定化
//   背景: fix297の追加指示欄で「痛み・悲しみ・怒りを生々しく描いて」を実機A/B→感情の身体性が
//     明確に増すと実証(おしん)。これを全ユーザー既定にする。ただし「常時」だと平穏な場面に苦痛を
//     足す恐れ→条件付き(感情が動く時だけ生々しく/動かない時は足さない)に整えた版を実機検証済:
//     感情シーン=身体感覚で生々しい / 平穏シーン=苦痛を足さず自然な緊張に留まる。
//   手法: Planner.build を最外ラップし毎ターンsys末尾に感情描写ルールを追記(fix300bと同方式)。
//     fix274対策で冪等マークは非__v292接頭辞(_v292f304)+MARKER冪等追記+setInterval再付与。
//   OFF: localStorage v292Dfix304Off='1'
// =====================================================================
(function(){
  'use strict';
  var TAG='[v292Dfix304:emotion]';
  if(window.__v292Dfix304) return; window.__v292Dfix304=true;
  var MARKER='【感情描写】';
  var GUARD='\n\n'+MARKER+'登場人物の感情、特に痛み・悲しみ・怒りが動く場面では、その感情を身体感覚（震え・熱・冷え・息・鼓動など）を交えて生々しく描く。感情が動かない平穏な場面では無理に苦痛や激情を足さない。';
  function block(){ try{ if(localStorage.getItem('v292Dfix304Off')==='1') return ''; }catch(e){} return GUARD; }
  function installBuild(){
    try{
      var P=window.Planner||(typeof Planner!=='undefined'?Planner:null);
      if(!P||typeof P.build!=='function') return false;
      if(P.build._v292f304===true) return true;
      var inner=P.build.bind(P);
      var wrapped=function(){
        var r=inner.apply(this,arguments);
        if(window.__v292ReactUnified) return r; // fix417: 反応統合時はこのガードを注入しない
        try{ if(r&&typeof r.sys==='string'){ var b=block(); if(b && r.sys.indexOf(MARKER)<0) r.sys=r.sys+b; } }catch(e){}
        return r;
      };
      try{ Object.keys(P.build).forEach(function(k){ wrapped[k]=P.build[k]; /* fix419c: 全プロパティ継承 */ }); }catch(e){}
      wrapped._v292f304=true;
      P.build=wrapped;
      try{ console.log(TAG,'emotion guard wired'); }catch(e){}
      return true;
    }catch(e){ return false; }
  }
  installBuild();
  try{ setInterval(installBuild, 2500); }catch(e){}
  window.__v292Dfix304api={ block:block, guard:GUARD, marker:MARKER };
  try{ console.log(TAG,'loaded'); }catch(e){}
})();
