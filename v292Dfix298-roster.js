// =====================================================================
// Chronicle TRPG - v292Dfix298: 永続キャラロスター(lifecycle付き)
//   目的: キャラ一覧の「登場キャラ」を揮発するlongmem worldinfo依存から外し、
//         登場した未登録キャラを常時表示。死亡/負傷ステータス表示 + 手動退場。
//   手法(fix145本体は不触):
//     1. window.__longmem.raw.loadWorldInfo を「読み取り時だけ」ラップし、quasi-pack
//        (fix277)由来の登場キャラを type:character として合成して返す → 一覧に常時出る。
//        ※fix135内部の要約処理はクロージャ直呼びなので影響しない(表示専用・記憶に副作用なし)。
//     2. 描画後のモーダルDOMを拡張: 死亡💀/負傷🩸バッジ + グレーアウト + 🚪退場ボタン。
//   リセット安全(最重要):
//     - storeにchr6_epochを刻印。epoch変化 or ターン数リグレッションで即クリア(fix177同作法)。
//     - quasi名は「last <= 現ターン-1」で現ゲーム整合フィルタ(リセット後の旧キャラ漏れ防止)。
//     - 単一書き込みガード(_lmCanWrite相当: 前面 & 最新epochのタブのみ書く)。
//   保存: localStorage 'v292Dfix298'+スロット接尾辞 = {epoch,hwTurns,dismissed} 物語と別キー(消しても無傷)
//   OFF: localStorage v292Dfix298Off='1'
// =====================================================================
(function(){
  'use strict';
  var TAG='[v292Dfix298:roster]';
  if(window.__v292Dfix298) return; window.__v292Dfix298=true;

  function off(){ try{ return localStorage.getItem('v292Dfix298Off')==='1'; }catch(e){ return false; } }
  function slotSfx(){ try{ if(typeof window.__chr6Key==='function'){ var k=window.__chr6Key(); return (k&&k!=='chr6')?k.replace(/^chr6/,''):''; } }catch(e){} return ''; }
  function SK(){ return 'v292Dfix298'+slotSfx(); }
  function curEpoch(){ try{ return +(localStorage.getItem('chr6_epoch')||0); }catch(e){ return 0; } }
  function getS(){ try{ return window.S || (typeof S!=='undefined'?S:null); }catch(e){ return null; } }
  function curTurns(){ var s=getS(); return (s&&Array.isArray(s.turns))?s.turns.length:0; }

  // ---- 永続store(リセット安全) ----
  function save(st){
    // 単一書き込みガード: 背景タブ/旧epochタブは書かない(多タブclobber防止)
    try{ if(document.visibilityState && document.visibilityState!=='visible') return; }catch(e){}
    try{ if(window.__chrEpoch && curEpoch() > window.__chrEpoch) return; }catch(e){}
    try{ localStorage.setItem(SK(), JSON.stringify(st)); }catch(e){}
  }
  function load(){
    var st; try{ st=JSON.parse(localStorage.getItem(SK())||'null'); }catch(e){ st=null; }
    var ep=curEpoch(), ct=curTurns();
    if(!st || typeof st!=='object' || !st.dismissed){ st={epoch:ep, hwTurns:ct, dismissed:{}}; save(st); return st; }
    // リセット検知: epoch変化 or ターン数が記録高水位より減少 → 旧ゲーム扱いでクリア
    if(st.epoch!==ep || ct < (st.hwTurns||0)){
      st={epoch:ep, hwTurns:ct, dismissed:{}}; save(st);
      try{ console.log(TAG,'reset detected (epoch/turns regress) -> roster cleared'); }catch(e){}
      return st;
    }
    if(ct > (st.hwTurns||0)){ st.hwTurns=ct; save(st); }
    return st;
  }
  function isDismissed(name){ try{ return !!(load().dismissed||{})[name]; }catch(e){ return false; } }
  function setDismiss(name, v){ var st=load(); st.dismissed=st.dismissed||{}; if(v) st.dismissed[name]=1; else delete st.dismissed[name]; save(st); }

  // ---- quasi-pack(fix277)由来の登場キャラ(リセット安全フィルタ) ----
  function quasiRoster(){
    var out={};
    try{
      var qs=JSON.parse(localStorage.getItem('v292Dfix277Quasi'+slotSfx())||'{}')||{};
      var ct=curTurns();
      Object.keys(qs).forEach(function(n){
        var e=qs[n]; if(!e) return;
        var last=(e.last!=null)?e.last:-1;
        // 現ゲーム整合: 最終登場ターンが現ターン範囲内のものだけ(リセット後の旧キャラを除外)
        if(last>=0 && last<=ct-1 && Array.isArray(e.seen) && e.seen.length>=1) out[n]=last;
      });
    }catch(e){}
    return out; // {name:lastTurn}
  }

  // ---- loadWorldInfoシム(表示専用・読み取り時のみ合成) ----
  function installWiShim(){
    try{
      var lm=window.__longmem; if(!lm||!lm.raw||typeof lm.raw.loadWorldInfo!=='function') return false;
      if(lm.raw.__v292Dfix298wi) return true;
      var orig=lm.raw.loadWorldInfo.bind(lm.raw);
      lm.raw.loadWorldInfo=function(){
        var arr=orig()||[];
        if(off()) return arr;
        try{
          if(!Array.isArray(arr)) arr=[];
          var have={}; arr.forEach(function(w){ if(w&&w.name) have[w.name]=1; });
          var dis=(load().dismissed)||{};
          var showDis=!!window.__v292Dfix298ShowDismissed;
          var qr=quasiRoster();
          var extra=[];
          Object.keys(qr).forEach(function(n){
            if(have[n]) return;
            if(dis[n] && !showDis) return; // 退場済みは隠す(表示トグルON時のみ出す)
            extra.push({name:n, type:'character', desc:'（登場した未登録キャラ）'});
          });
          if(extra.length) arr=arr.concat(extra);
        }catch(e){}
        return arr;
      };
      lm.raw.__v292Dfix298wi=true;
      try{ console.log(TAG,'worldinfo display-shim installed'); }catch(e){}
      return true;
    }catch(e){ return false; }
  }
  (function waitLm(){ waitLm._n=(waitLm._n||0)+1; if(installWiShim()) return; if(waitLm._n>80) return; setTimeout(waitLm,500); })();

  // ---- 死亡/負傷ステータス判定 ----
  function statusFor(name){
    // 1. cast state(v264/265が永続管理する権威データ)
    try{
      var s=getS();
      if(s&&s.cast){
        var list=[].concat(s.cast.hero?[s.cast.hero]:[], Array.isArray(s.cast.npcs)?s.cast.npcs:[]);
        for(var i=0;i<list.length;i++){ var c=list[i];
          if(c&&c.name===name&&c.state){
            var stt=c.state;
            if(stt.alive===false||stt.condition==='死亡') return {dead:true, at:stt.diedAtTurn};
            if(stt.condition && stt.condition!=='健康' && stt.condition!=='正常' && stt.condition!=='無事') return {dead:false, cond:String(stt.condition).slice(0,12)};
          }
        }
      }
    }catch(e){}
    // 2. fix77 store の からだ に死亡キーワード
    try{
      var f=window.__v292Dfix77Store;
      if(f&&f[name]&&f[name].karada&&/死亡|事切れ|絶命|喰われ|死んだ|息絶え/.test(f[name].karada)) return {dead:true};
    }catch(e){}
    return {dead:false};
  }

  function reopen(){ try{ if(window.__charlist&&typeof window.__charlist.open==='function') window.__charlist.open(); }catch(e){} }

  // ---- 描画後モーダルの拡張 ----
  function augment(modal){
    try{
      if(off()||!modal) return;
      var dis=(load().dismissed)||{};
      var showDis=!!window.__v292Dfix298ShowDismissed;
      var anyDismissed=Object.keys(dis).length>0;
      var cards=modal.querySelectorAll('.v292Dfix145-card');
      Array.prototype.forEach.call(cards,function(card){
        var name=card.getAttribute('data-name'); if(!name) return;
        var dismissed=!!dis[name];
        if(dismissed && !showDis){ card.style.display='none'; return; }
        card.style.display='';
        if(card.__v292Dfix298done) return; card.__v292Dfix298done=true;
        var col=card.children[1]; if(!col) return;
        var nLine=col.children[0];
        var btnRow=col.children[col.children.length-1];
        // ステータスバッジ
        var sf=statusFor(name);
        if(sf.dead){
          card.style.opacity='0.5'; card.style.filter='grayscale(0.85)';
          if(nLine){ var bd=document.createElement('span'); bd.textContent='💀 故 '+(sf.at!=null?('(T'+sf.at+'没) '):''); bd.style.cssText='color:#ff8a8a;font-weight:bold;'; nLine.insertBefore(bd, nLine.firstChild); }
        } else if(sf.cond){
          if(nLine){ var bi=document.createElement('span'); bi.textContent='🩸 '+sf.cond+' '; bi.style.cssText='color:#ffc060;font-weight:bold;'; nLine.insertBefore(bi, nLine.firstChild); }
        }
        // 退場 / 復活 ボタン
        if(btnRow && btnRow.querySelector && btnRow.querySelector('button')){
          var b=document.createElement('button');
          if(dismissed){
            b.textContent='↩ 復活'; b.style.cssText='background:#3a5a3a;border:1px solid #4a7a4a;color:#fff;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;';
            b.onclick=function(e){ e.stopPropagation(); setDismiss(name,false); reopen(); };
            card.style.opacity='0.7';
          } else {
            b.textContent='🚪 退場'; b.style.cssText='background:#6a3a3a;border:1px solid #8a4a4a;color:#fff;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;';
            b.onclick=function(e){ e.stopPropagation(); setDismiss(name,true); reopen(); };
          }
          btnRow.appendChild(b);
        }
      });
      // 「退場済みを表示」トグル(退場済みがある時だけ出す)
      if(anyDismissed && !modal.__v292Dfix298toggle){
        modal.__v292Dfix298toggle=true;
        var hdr=modal.querySelector('div');
        if(hdr){
          var tg=document.createElement('button');
          tg.textContent=showDis?'退場済みを隠す':'退場済みを表示';
          tg.style.cssText='background:#33334a;border:1px solid #555;color:#cfcfe0;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;margin-right:6px;';
          tg.onclick=function(e){ e.stopPropagation(); window.__v292Dfix298ShowDismissed=!showDis; reopen(); };
          hdr.insertBefore(tg, hdr.lastChild);
        }
      }
    }catch(e){}
  }

  // ---- モーダル出現をbody childListで軽量検知(広域observer回避) ----
  try{
    new MutationObserver(function(muts){
      for(var i=0;i<muts.length;i++){
        var added=muts[i].addedNodes; if(!added) continue;
        for(var j=0;j<added.length;j++){
          var n=added[j];
          if(n && n.nodeType===1 && n.classList && n.classList.contains('v292Dfix145-modal')){
            augment(n);
          }
        }
      }
    }).observe(document.body, {childList:true});
  }catch(e){}

  window.__v292Dfix298api={ load:load, dismiss:setDismiss, quasiRoster:quasiRoster, statusFor:statusFor, reinstall:installWiShim };
  try{ console.log(TAG,'loaded'); }catch(e){}
})();
