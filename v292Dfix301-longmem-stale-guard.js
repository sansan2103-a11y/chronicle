// =====================================================================
// Chronicle TRPG - v292Dfix301: longmem stale-read ガード
//   問題: fix299でlongmem(要約/worldinfo/events)が永続化されたが、取消/戻す等で
//         ターンが減ると、再要約(5秒ポーリング+LLM 数十秒)が走るまで古い要約に
//         「消した内容」が残る。その窓で「続きを書く」「送信」すると、消した内容が
//         longmem経由で拾われて復活してしまう(おしん指摘)。
//   修正: longmemの読み取りAPI(getSummary/getWorldInfoFor/getKeyEvents)をラップし、
//         「現ターン < lastBuild(=ターンが削られてstale)」のときは空を返す。
//         再要約でlastBuildが更新されれば自動復帰。fix135本体は不触。
//   キャラ一覧用の lm.raw.loadWorldInfo(fix298シム)は対象外=表示はそのまま。
//   OFF: localStorage v292Dfix301Off='1'
// =====================================================================
(function(){
  'use strict';
  if(window.__v292Dfix301) return; window.__v292Dfix301=true;
  function getS(){ try{ return window.S||(typeof S!=='undefined'?S:null); }catch(e){ return null; } }
  function lastBuild(){ try{ return parseInt(localStorage.getItem('chr6_v292Dfix135_last')||'-1',10); }catch(e){ return -1; } }
  function isStale(){
    try{ if(localStorage.getItem('v292Dfix301Off')==='1') return false; }catch(e){}
    var s=getS(); if(!s||!Array.isArray(s.turns)) return false;
    var cur=s.turns.length-1; var lb=lastBuild();
    return lb>=0 && cur<lb; // ターンがlastBuildより減った=消した内容が要約に残ってる
  }
  function wrap(){
    var lm=window.__longmem;
    if(!lm||lm.__v292Dfix301) return false;
    if(typeof lm.getSummary==='function'){ var gs=lm.getSummary.bind(lm); lm.getSummary=function(){ if(isStale()) return ''; return gs.apply(this,arguments); }; }
    if(typeof lm.getWorldInfoFor==='function'){ var gw=lm.getWorldInfoFor.bind(lm); lm.getWorldInfoFor=function(){ if(isStale()) return []; return gw.apply(this,arguments); }; }
    if(typeof lm.getKeyEvents==='function'){ var ge=lm.getKeyEvents.bind(lm); lm.getKeyEvents=function(){ if(isStale()) return []; return ge.apply(this,arguments); }; }
    lm.__v292Dfix301=true;
    try{ console.log('[v292Dfix301] longmem stale-read guard wired'); }catch(_){}
    return true;
  }
  (function waitLm(){ waitLm._n=(waitLm._n||0)+1; if(wrap()) return; if(waitLm._n>80) return; setTimeout(waitLm,500); })();
  window.__v292Dfix301api={ isStale:isStale };
})();
