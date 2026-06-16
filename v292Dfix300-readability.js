// =====================================================================
// Chronicle TRPG - v292Dfix300: 文体の基本ルール(読みやすさガード)
//   目的: 地の文が難解すぎ/翻訳調/独特な言い回しになり没入感を阻害する問題を是正。
//         平易で自然な小説文体に寄せる。Flash/Pro両モデルで実機A/B改善を確認済み。
//   手法: fix297同様 Planner.build を最外ラップし、毎ターンsys末尾に文体ガードを追記。
//         エンジン本体は不触・非破壊。fix297(プレイヤー追加指示)と併存可。
//   OFF: localStorage v292Dfix300Off='1'
// =====================================================================
(function(){
  'use strict';
  var TAG='[v292Dfix300:readability]';
  if(window.__v292Dfix300) return; window.__v292Dfix300=true;

  // 実機A/Bで効果確認した文体指示(Flash/Pro両方で短文化・平易化・翻訳調低減)。
  // プレイヤー追加指示(fix297)を上書きしないよう「最優先」とは書かない=標準の文体規範。
  var GUARD='\n\n【文体の基本ルール】物語の地の文は、平易で自然な日本語の小説の文体で書く。難解な語彙・凝った比喩・翻訳調の不自然な言い回しを避け、一文を短めに区切り、読みやすさを優先する。ただし場面の緊張感・恐怖・情景描写は損なわない。';

  function block(){
    try{ if(localStorage.getItem('v292Dfix300Off')==='1') return ''; }catch(e){}
    return GUARD;
  }
  function installBuild(){
    try{
      var P=window.Planner||(typeof Planner!=='undefined'?Planner:null);
      if(!P||typeof P.build!=='function') return false;
      if(P.build.__v292Dfix300) return true;
      var inner=P.build.bind(P);
      var wrapped=function(){
        var r=inner.apply(this,arguments);
        try{ if(r&&typeof r.sys==='string'){ var b=block(); if(b) r.sys=r.sys+b; } }catch(e){}
        return r;
      };
      try{ Object.keys(P.build).forEach(function(k){ if(k.indexOf('__')===0) wrapped[k]=P.build[k]; }); }catch(e){}
      wrapped.__v292Dfix300=true; P.build=wrapped;
      try{ console.log(TAG,'readability guard wired'); }catch(e){}
      return true;
    }catch(e){ return false; }
  }
  (function waitB(){ waitB._n=(waitB._n||0)+1; if(installBuild()) return; if(waitB._n>120) return; setTimeout(waitB,500); })();

  window.__v292Dfix300api={ block:block, guard:GUARD };
  try{ console.log(TAG,'loaded'); }catch(e){}
})();
