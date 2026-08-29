// =====================================================================
// Chronicle TRPG - v292Dfix336: プロキシsentinel充填のwindow.S undefinedバグ根治
// 症状(おしん2026-07-01報告): 「物語を始める」を押すと開始ゲート(APIキー未設定)で
//   設定が開き進まない。特に新規/おまかせで作った世界(provider既定=anthropic)で発生。
// 真因: fix247-proxy の ensureSentinel() が `var st=window.S` を読むが、ページのSは
//   グローバルconst(window.S未定義)なので毎回early return→provider='openrouter'+
//   orKey/pollKey='__proxy__' の充填が効かない→startSceneのhasKeyゲートが永久にfail。
//   (fix333iで判明した window.S undefined と同型のバグ)
// 修正: 堅牢なgetS()(window.S || indirect eval 'S')でsentinelを確実に充填し直す。
//   プロキシON時のみ・空欄のみ(ユーザー自身の鍵は上書きしない)・fix247と同じ意味。
//   追加モジュール(fix247は不触=proxy本体を壊さない)。OFF=v292Dfix336Off='1'。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix336) return; window.__v292Dfix336 = true;
  var TAG='[v292Dfix336:sentinel-fix]';
  function off(){ try{ return localStorage.getItem('v292Dfix336Off')==='1'; }catch(e){ return false; } }
  function ls(k){ try{ return (localStorage.getItem(k)||'').trim(); }catch(e){ return ''; } }
  function proxyOff(){ return ls('v292ProxyOff')==='1'; }
  function purl(){ return ls('v292ProxyUrl').replace(/\/+$/,''); }
  function ppass(){ return ls('v292ProxyPass'); }
  function gid(){ try{ return (window.__chronicleGoogleId && window.__chronicleGoogleId()) || ''; }catch(e){ return ''; } }
  function proxyOn(){ return !proxyOff() && !!(purl() && (ppass() || gid())); }
  // ★堅牢なS取得(window.S未定義でもグローバルSを拾う)
  function getS(){ try{ return window.S || (0,eval)('S'); }catch(e){ return null; } }

  function ensureSentinel(){
    if (off() || !proxyOn()) return;
    var st=getS(); if (!st || !st.cfg) return;
    var ch=false;
    if (!st.cfg.orKey){ st.cfg.orKey='__proxy__'; ch=true; }
    if (!st.cfg.pollKey){ st.cfg.pollKey='__proxy__'; ch=true; }
    if (st.cfg.provider!=='openrouter'){ st.cfg.provider='openrouter'; ch=true; }
    if (ch){ try{ st.save && (typeof st.saveC==='function'?st.saveC('fix336.sentinelCfg'):st.save()); }catch(e){} try{ console.log(TAG,'sentinel filled via getS()'); }catch(_){} }
  }
  // 起動直後に速く効かせる(ゲートを押す前に埋める)＋常駐で保険
  setTimeout(ensureSentinel, 300);
  setTimeout(ensureSentinel, 1200);
  setInterval(ensureSentinel, 3000);
  try{ document.addEventListener('DOMContentLoaded', ensureSentinel); }catch(e){}

  window.__v292Dfix336api={ ensureSentinel:ensureSentinel, proxyOn:proxyOn, getS:getS };
  try{ console.log(TAG,'loaded; proxyOn:', proxyOn()); }catch(_){}
})();
