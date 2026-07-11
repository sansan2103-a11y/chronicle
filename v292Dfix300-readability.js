// =====================================================================
// Chronicle TRPG - v292Dfix300: 文体の基本ルール(読みやすさガード)
//   目的: 地の文が難解すぎ/翻訳調/独特な言い回しで没入感を阻害する問題を是正。
//         平易で自然な小説文体に寄せる。Flash/Pro両モデルで実機A/B改善を確認済み。
//   手法: Planner.build を最外ラップし、毎ターンsys末尾に文体ガードを追記(エンジン不触・非破壊)。
//   fix300b: fix274(build-flag-guard)が__v292*フラグを後続wrapへ伝播するため、当初の
//     `if(P.build.__v292Dfix300)return`ガードが誤発火し実ラップをスキップしていた(実機判明)。
//     対策=①冪等マークを非__v292接頭辞(_v292f300・fix274は伝播しない) ②sysに既にマーカーが
//     あれば追記しない(冪等) ③最外を奪われたらsetIntervalで再付与。
//   OFF: localStorage v292Dfix300Off='1'
// =====================================================================
(function(){
  'use strict';
  var TAG='[v292Dfix300:readability]';
  if(window.__v292Dfix300) return; window.__v292Dfix300=true;

  var MARKER='【文体の基本ルール】';
  // 実機A/Bで効果確認(Flash/Pro両方で短文化・平易化・翻訳調低減)。
  var GUARD='\n\n'+MARKER+'物語の地の文は、平易で自然な日本語の小説の文体で書く。難解な語彙・凝った比喩・翻訳調の不自然な言い回しを避け、一文を短めに区切り、読みやすさを優先する。ただし場面の緊張感・恐怖・情景描写は損なわない。';

  function block(){
    try{ if(localStorage.getItem('v292Dfix300Off')==='1') return ''; }catch(e){}
    return GUARD;
  }
  function installBuild(){
    try{
      var P=window.Planner||(typeof Planner!=='undefined'?Planner:null);
      if(!P||typeof P.build!=='function') return false;
      if(P.build._v292f300===true) return true; // 既に最外(非__v292マークなのでfix274が他wrapへ伝播しない)
      var inner=P.build.bind(P);
      var wrapped=function(){
        var r=inner.apply(this,arguments);
        try{ if(r&&typeof r.sys==='string'){ var b=block(); if(b && r.sys.indexOf(MARKER)<0) r.sys=r.sys+b; } }catch(e){}
        return r;
      };
      try{ Object.keys(P.build).forEach(function(k){ wrapped[k]=P.build[k]; }) /* fix419c: 全プロパティ継承(9者相互ラップダンスの根治) */; }catch(e){}
      wrapped._v292f300=true;
      P.build=wrapped;
      try{ console.log(TAG,'readability guard wired'); }catch(e){}
      return true;
    }catch(e){ return false; }
  }
  installBuild();
  // 他のbuild wrapに最外を奪われたら再付与。sysへの追記はMARKER冪等なので二重化しない。
  try{ setInterval(installBuild, 2500); }catch(e){}

  window.__v292Dfix300api={ block:block, guard:GUARD, marker:MARKER };
  try{ console.log(TAG,'loaded'); }catch(e){}
})();
