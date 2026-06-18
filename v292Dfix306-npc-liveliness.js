// =====================================================================
// Chronicle TRPG - v292Dfix306: NPC創作ディレクティブ(登場頻度UP)を既定化
//   背景(おしんと設計・2026-06-18 実機A/B検証済): 未登録NPCをモデルが空気を読んで
//     自分から創作して出す。臨場感UP。ホラー限定でなくトーン汎用。
//   検証で確定:
//     - 人がいて自然な場面では一人前へ出して言葉/行動で絡ませると生きたNPCが出る
//       (街=店主が宿情報/面会=老執事が登場・喋る)。弱い指示だと雰囲気どまり。
//     - 親密な二人/一人の静かな場面では自制(指示ありでも湧かせない=3/3)。
//     - 頻度はモデル自己調整でよい(判断式の文言。「まだ誰も絡んでなければ出す/既に出した
//       NPCが居る・親密な場面では増やさない」)。連続5ターンsimで間隔を自分で空けた。
//     - 重要な人間NPCには名前を与える→fix277/fix298で一覧に載り再登場で一貫。
//   手法: Planner.build を最外ラップし毎ターンsys末尾にディレクティブを追記(fix304と同方式)。
//     fix274対策で冪等マークは非__v292接頭辞(_v292f306)+MARKER冪等追記+setInterval再付与。
//   OFF: localStorage v292Dfix306Off='1'
// =====================================================================
(function(){
  'use strict';
  var TAG='[v292Dfix306:npc-liveliness]';
  if(window.__v292Dfix306) return; window.__v292Dfix306=true;
  var MARKER='【NPCの登場】';
  var GUARD='\n\n'+MARKER+'場面の空気を読むこと。人がいて自然な状況（街・店・宿・捜査・社交・群衆・緊迫など）では、雰囲気の描写だけで済ませず、まだ誰も絡んでいなければ未登録の人物を一人前へ出し、言葉や行動で関わらせる。情報・関係・緊張・選択肢のいずれかに寄与させること。再登場しそうな重要人物には名前を与える（一覧に残り一貫させるため）。ただし既に登場中・直近で出したNPCが居る場合や、親密な二人だけ・一人きりの静かな場面では無理に増やさない。中心キャラの焦点は薄めない。創作したNPCは状況次第で言葉を発し、生きた人物として絡ませてよい。';
  function block(){ try{ if(localStorage.getItem('v292Dfix306Off')==='1') return ''; }catch(e){} return GUARD; }
  function installBuild(){
    try{
      var P=window.Planner||(typeof Planner!=='undefined'?Planner:null);
      if(!P||typeof P.build!=='function') return false;
      if(P.build._v292f306===true) return true;
      var inner=P.build.bind(P);
      var wrapped=function(){
        var r=inner.apply(this,arguments);
        try{ if(r&&typeof r.sys==='string'){ var b=block(); if(b && r.sys.indexOf(MARKER)<0) r.sys=r.sys+b; } }catch(e){}
        return r;
      };
      try{ Object.keys(P.build).forEach(function(k){ if(k.indexOf('__')===0) wrapped[k]=P.build[k]; }); }catch(e){}
      wrapped._v292f306=true;
      P.build=wrapped;
      try{ console.log(TAG,'npc liveliness directive wired'); }catch(e){}
      return true;
    }catch(e){ return false; }
  }
  installBuild();
  try{ setInterval(installBuild, 2500); }catch(e){}
  window.__v292Dfix306api={ block:block, guard:GUARD, marker:MARKER };
  try{ console.log(TAG,'loaded'); }catch(e){}
})();
