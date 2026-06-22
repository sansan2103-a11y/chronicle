// =====================================================================
// Chronicle TRPG - v292Dfix309: 展開の推進ルール(マンネリ/足踏み回避ガード)
//   目的: 「続きを書く」連打や種ゼロ進行で、地の文が同じモチーフ(同じ物音・同じ台詞・
//         同じ小道具)を循環し場面が前進しない問題を是正。毎ターン必ず新しい要素を一つ
//         動かし、未登場の物・情報を少しずつ出して状況を前へ進める。
//   根拠: 2026-06-22 対照実験(AIダンジョン烏越の常時注入「毎ターン1変化＋道具デッキ」を
//         手本にfix297欄でA/B実証)。OFF=声/無線機に循環、ON=未使用要素を毎ターン引いて
//         謎が前進することを実機確認。
//   手法: fix300/304と同型。Planner.build を最外ラップし毎ターンsys末尾に推進ガードを
//         追記(エンジン不触・非破壊)。非__v292マーク(_v292f309)でfix274のフラグ伝播を回避、
//         MARKER冪等で二重注入を防ぎ、最外を奪われたらsetIntervalで再付与。
//   OFF: localStorage v292Dfix309Off='1'
// =====================================================================
(function(){
  'use strict';
  var TAG='[v292Dfix309:progression]';
  if(window.__v292Dfix309) return; window.__v292Dfix309=true;

  var MARKER='【展開の推進ルール】';
  // 汎用(シナリオ非依存)。烏越式の「毎ターン1変化＋道具デッキ＋反復回避」を一般化。
  var GUARD='\n\n'+MARKER+'毎ターン、必ず何か新しいものを一つ以上動かす。新しい手がかり・危険・人物の感情の変化・印象的な物音や気配・場所の移動・時間経過のうち、まだ出していないものを選んで場面を一つ前へ進める。直前のターンと同じモチーフ(同じ物音・同じ台詞・同じ小道具)の単なる繰り返しは避け、まだ登場していない物や情報を少しずつ出して状況を深める。説明を長く続けず、行動・会話・物音・視界・沈黙で前へ進める。';

  function block(){
    try{ if(localStorage.getItem('v292Dfix309Off')==='1') return ''; }catch(e){}
    return GUARD;
  }
  function installBuild(){
    try{
      var P=window.Planner||(typeof Planner!=='undefined'?Planner:null);
      if(!P||typeof P.build!=='function') return false;
      if(P.build._v292f309===true) return true; // 既に最外(非__v292マークなのでfix274が他wrapへ伝播しない)
      var inner=P.build.bind(P);
      var wrapped=function(){
        var r=inner.apply(this,arguments);
        try{ if(r&&typeof r.sys==='string'){ var b=block(); if(b && r.sys.indexOf(MARKER)<0) r.sys=r.sys+b; } }catch(e){}
        return r;
      };
      try{ Object.keys(P.build).forEach(function(k){ if(k.indexOf('__')===0) wrapped[k]=P.build[k]; }); }catch(e){}
      wrapped._v292f309=true;
      P.build=wrapped;
      try{ console.log(TAG,'progression guard wired'); }catch(e){}
      return true;
    }catch(e){ return false; }
  }
  installBuild();
  try{ setInterval(installBuild, 2500); }catch(e){}

  window.__v292Dfix309api={ block:block, guard:GUARD, marker:MARKER };
  try{ console.log(TAG,'loaded'); }catch(e){}
})();
