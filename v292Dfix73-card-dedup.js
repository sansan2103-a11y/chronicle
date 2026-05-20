// Chronicle TRPG - v292Dfix73: dialogue-card dedup + speaker reconcile + bracket cleanup
// 症状: 1ターンの会話ログに同じセリフが複数カードで重複（??? 4枚 / サクラ 2枚 等）。
// 原因: 複数の抽出パス（fix59/64/65/66）が (speaker,text) 正規化バラバラで dedup キー不一致。
//   fix64=表示「???」/fix66=内部「""」でキー不一致、say タグ内に「」混入でテキスト不一致。
// 修正: render 後に全カードを正規化テキストでグループ化し同一は1枚に統合（実 speaker 優先）。
//   別 speaker の正当な重複は残す。余分な先頭/末尾「」も掃除。fix66.repair を wrap。
// flag: window.__v292Dfix73Active
(function v292Dfix73(){
  'use strict';
  if (window.__v292Dfix73Active) return;
  window.__v292Dfix73Active = true;
  var TAG = '[v292Dfix73:card-dedup]';
  function normText(s){ return String(s==null?'':s).replace(/[「」『』（）()\s　…⋯]/g,''); }
  function cardSpeaker(c){ var e=c.querySelector('.dlg-name'); if(!e)return''; var fc=e.firstChild; return (fc&&fc.nodeType===3)?(fc.textContent||'').trim():(e.textContent||'').trim(); }
  function cardText(c){ var e=c.querySelector('.dlg-text'); return e?e.textContent:''; }
  function isUnknown(sp){ return !sp || sp==='???' || sp==='?'; }
  function dedup(){
    try {
      var stream = document.getElementById('dialogue-stream');
      if (!stream) return 0;
      var cards = Array.prototype.slice.call(stream.querySelectorAll('.v292-dlg-card'));
      var groups = Object.create(null);
      cards.forEach(function(c){
        if (/input-card/.test(c.className)) return;
        var nt = normText(cardText(c));
        if (nt.length < 2) return;
        (groups[nt] = groups[nt] || []).push(c);
      });
      var removed = 0;
      Object.keys(groups).forEach(function(nt){
        var g = groups[nt];
        if (g.length < 2) return;
        var real = Object.create(null);
        g.forEach(function(c){ var sp=cardSpeaker(c); if(!isUnknown(sp)) real[sp]=1; });
        var distinct = Object.keys(real);
        if (distinct.length >= 2) return;
        var keep = g[0];
        if (isUnknown(cardSpeaker(keep)) && distinct.length === 1){
          var ne = keep.querySelector('.dlg-name'); if (ne) ne.textContent = distinct[0];
        }
        for (var i=1;i<g.length;i++){ g[i].remove(); removed++; }
      });
      Array.prototype.slice.call(stream.querySelectorAll('.v292-dlg-card .dlg-text')).forEach(function(e){
        var t=e.textContent; var c=t.replace(/^[「『]+/,'').replace(/[」』]+$/,''); if(c!==t) e.textContent=c;
      });
      if (removed>0){ try{ console.log(TAG,'removed',removed,'duplicate card(s)'); }catch(_){} }
      return removed;
    } catch(e){ try{ console.warn(TAG,'err:',e&&e.message); }catch(_){} return 0; }
  }
  window.__v292Dfix73Dedup = dedup;
  function wrapFix66(){
    try {
      var ns = window.__v292Dfix66;
      if (ns && typeof ns.repair==='function' && !ns.repair.__v292Dfix73Wrapped){
        var orig = ns.repair;
        var w = function(){ var r=orig.apply(this,arguments); try{ dedup(); }catch(e){} return r; };
        w.__v292Dfix73Wrapped = true;
        ns.repair = w;
        return true;
      }
    } catch(e){}
    return false;
  }
  function tick(){ wrapFix66(); dedup(); }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',tick); else tick();
  setTimeout(tick,500); setTimeout(tick,1500); setTimeout(tick,4000);
  setInterval(tick,2000);
  try { console.log(TAG,'loaded'); } catch(_){}
})();
