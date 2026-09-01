// =====================================================================
// Chronicle TRPG - v292Dfix297: AI Instructions (player-editable guidance)
//   未デプロイ(2026-06-14)。次セッションで環境安定後にデプロイ。
//   設定モーダルに自由記述欄を1つ追加し、毎ターンsysに「プレイヤーからの追加指示」を注入。
//   保存=スロット毎 / 上限1500字(肥大=Pro劣化予防) / 空なら無効。
//   OFF: localStorage v292AiInstrOff='1'
//   注入は高優先だが「物理的整合・前場面との連続性・破綻禁止は超えない」と添えて暴走防止。
//   fix297b(2026-06-15): settingsOv=fixedでoffsetParent常にnull→可視判定をdisplay/高さに変更。アンカーを.mpanel-bodyへ。
// =====================================================================
(function(){
  'use strict';
  var TAG='[v292Dfix297:ai-instructions]';
  if(window.__v292Dfix297) return; window.__v292Dfix297=true;
  var MAX=1500;
  var rawGet=Storage.prototype.getItem.bind(localStorage);
  var rawSet=Storage.prototype.setItem.bind(localStorage);
  /* ■fix783(2026-09-01) MULTI_TAB_CROSS_STORY_CFG_CONTAMINATION
     真因: 共有ポインタ chr6_active_slot(= __chr6Key()) は**全タブで1個**。別タブが物語を
       開いた瞬間このタブの key 解決が相手の story を指し、AI追加指示ストア v292aiInstr<sfx> が
       別 story へ着弾/汚染された(実測: ct_fix783_multitab.mjs R群)。
     対処: key 解決を fix694 document authority(__chronicleDocumentStoryKey)へ固定する
       (fix307f と同じ作法)。authority 無し document(home 等)では null=**読まない/書かない**。
     kill: localStorage v292Dfix783Off='1' → 全ファイル同時に旧 __chr6Key() 挙動へ戻る。 */
  function f783Off(){ try{ return localStorage.getItem('v292Dfix783Off')==='1'; }catch(e){ return false; } }
  function slotSfx(){
    if(!f783Off()){
      try{ var dk=window.__chronicleDocumentStoryKey;
           if(typeof dk==='string'&&dk) return (dk==='chr6')?'':dk.replace(/^chr6/,''); }catch(e){}
      return null;                                   /* authority 無し = 触らない */
    }
    try{ if(typeof window.__chr6Key==='function'){ var k=window.__chr6Key(); return (k&&k!=='chr6')?k.replace(/^chr6/,''):''; } }catch(e){} return '';
  }
  function KEY(){ var s=slotSfx(); return (s===null)?null:('v292aiInstr'+s); }
  function getInstr(){ try{ var k=KEY(); if(k===null) return ''; return rawGet(k)||''; }catch(e){ return ''; } }
  function setInstr(v){ try{ var k=KEY(); if(k===null) return; rawSet(k, String(v||'').slice(0,MAX)); }catch(e){} }

  // ---- sysへの注入(Planner.build最外ラップ) ----
  function block(){
    var t=getInstr().trim(); if(!t) return '';
    return '\n\n【プレイヤーからの追加指示（最優先で尊重する）】\n'+t+
      '\n（この指示を優先して反映する。ただし物語の物理的整合・前の場面との連続性・破綻させない原則は超えない。）';
  }
  function engineReady(P){ try{ return !!(P&&typeof P.build==='function'&&P.build.__v292NewEngine); }catch(e){ return false; } }
  function installBuild(){
    try{
      var P=window.Planner||(typeof Planner!=='undefined'?Planner:null);
      if(!P||typeof P.build!=='function') return false;
      if(P.build.__v292Dfix297ai) return true;
      var inner=P.build.bind(P);
      var wrapped=function(mode,text){
        var r=inner.apply(this,arguments);
        try{ if(localStorage.getItem('v292AiInstrOff')!=='1'&&r&&typeof r.sys==='string'){ var b=block(); if(b) r.sys=r.sys+b; } }catch(e){}
        return r;
      };
      try{ Object.keys(P.build).forEach(function(k){ if(k.indexOf('__')===0) wrapped[k]=P.build[k]; }); }catch(e){}
      wrapped.__v292Dfix297ai=true; P.build=wrapped;
      try{ console.log(TAG,'build wrapped'); }catch(e){}
      return true;
    }catch(e){ return false; }
  }
  (function waitB(){
    var P=window.Planner||(typeof Planner!=='undefined'?Planner:null);
    waitB._n=(waitB._n||0)+1;
    if(P&&(engineReady(P)||waitB._n>60)){ if(installBuild()) return; }
    setTimeout(waitB,500);
  })();

  // ---- 設定モーダルへUI差し込み ----
  // settingsOvはposition:fixed → offsetParentは常にnull。display/高さで可視判定する(fix297b)
  function settingsVisible(ov){ try{ if(getComputedStyle(ov).display==='none') return false; return ov.getBoundingClientRect().height>0; }catch(e){ return ov.offsetParent!==null; } }
  function injectUI(){
    try{
      if(localStorage.getItem('v292AiInstrOff')==='1') return;
      var ov=document.getElementById('settingsOv');
      if(!ov||!settingsVisible(ov)) return;
      if(document.getElementById('v292-ai-instr')) return;
      var panel=null;
      try{ var bodies=ov.querySelectorAll('.mpanel-body, #settingsPanel'); for(var i=0;i<bodies.length;i++){ if(bodies[i].getBoundingClientRect().height>0){ panel=bodies[i]; break; } } }catch(e){}
      if(!panel) panel=ov.querySelector('#settingsPanel')||ov.querySelector('.mpanel-body')||ov;
      if(!panel) return;
      var wrap=document.createElement('div'); wrap.className='fld'; wrap.id='v292-ai-instr-wrap'; wrap.style.cssText='margin-top:10px;';
      var lbl=document.createElement('label'); lbl.innerHTML='🛠 AIへの追加指示（上級者向け・任意）';
      var ta=document.createElement('textarea'); ta.id='v292-ai-instr'; ta.rows=4;
      ta.placeholder='物語AIへの指示を自由に書けます（このスロット専用・空でOK）。\n例: キャラの痛み・悲しみ・怒りは必要な場面で生々しく描いて／セリフ多めで／主人公に容赦しないで';
      ta.style.cssText='width:100%;box-sizing:border-box;background:var(--s2,#1a1a24);border:1px solid var(--border,#444);border-radius:8px;color:var(--tx,#eee);padding:9px;font-size:13px;line-height:1.6;resize:vertical;min-height:70px;';
      ta.value=getInstr();
      var hint=document.createElement('div'); hint.style.cssText='font-size:11px;color:var(--dim,#888);margin-top:4px;';
      function updHint(){ hint.textContent='毎ターンAIに渡されます（'+ta.value.length+'/'+MAX+'字）。物理的な整合・前の場面との繋がりは保たれます。'; }
      ta.addEventListener('input',function(){ if(ta.value.length>MAX) ta.value=ta.value.slice(0,MAX); setInstr(ta.value); updHint(); });
      updHint();
      wrap.appendChild(lbl); wrap.appendChild(ta); wrap.appendChild(hint);
      panel.appendChild(wrap);
      try{ console.log(TAG,'UI injected'); }catch(e){}
    }catch(e){}
  }
  try{ new MutationObserver(function(){ injectUI(); }).observe(document.documentElement||document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']}); }catch(e){}
  try{ setInterval(injectUI,1500); }catch(e){}
  injectUI();
  window.__v292AiInstr={ get:getInstr, set:setInstr, block:block, key:KEY, injectUI:injectUI };
  try{ console.log(TAG,'loaded'); }catch(e){}
})();
