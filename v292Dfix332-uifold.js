// =====================================================================
// Chronicle TRPG - v292Dfix332: 🛠AIへの追加指示欄を折りたたみ式に
// 背景(おしん2026-06-30「設定のAI指示欄をたためるように・UIが大きく見にくい」)。
// fix297が作る #v292-ai-instr-wrap(label+textarea+hint)を、ラベルクリックで開閉できる
// 折りたたみに。既定collapsed。開閉状態をlocalStorage(v292Dfix332Open)で記憶。
// 純UI(コア/プロンプト不触)。設定モーダルは動的生成なのでpoll/observeで都度enhance。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix332) return; window.__v292Dfix332 = true;
  var TAG='[v292Dfix332:uifold]';
  try{
    var st=document.createElement('style'); st.id='v292-fix332-style';
    st.textContent='#v292-ai-instr-wrap > label{cursor:pointer;user-select:none;display:block;}'
      +'#v292-ai-instr-wrap > label .v292-fold-caret{display:inline-block;transition:transform .15s;margin-right:6px;font-size:11px;opacity:.8;}'
      +'#v292-ai-instr-wrap.v292-folded > label .v292-fold-caret{transform:rotate(-90deg);}'
      +'#v292-ai-instr-wrap.v292-folded > textarea,#v292-ai-instr-wrap.v292-folded > div{display:none !important;}';
    (document.head||document.documentElement).appendChild(st);
  }catch(e){}
  function isOpen(){ try{ return localStorage.getItem('v292Dfix332Open')==='1'; }catch(e){ return false; } }
  function setOpen(v){ try{ localStorage.setItem('v292Dfix332Open', v?'1':'0'); }catch(e){} }
  function enhance(){
    var wrap=document.getElementById('v292-ai-instr-wrap'); if(!wrap) return;
    var lbl=wrap.querySelector('label'); if(!lbl) return;
    if(!wrap.__v292folded){
      wrap.__v292folded=true;
      if(!lbl.querySelector('.v292-fold-caret')){
        var c=document.createElement('span'); c.className='v292-fold-caret'; c.textContent='▾';
        lbl.insertBefore(c, lbl.firstChild);
      }
      if(!isOpen()) wrap.classList.add('v292-folded');
      lbl.addEventListener('click', function(){
        var folded=wrap.classList.toggle('v292-folded'); setOpen(!folded);
      });
      try{ console.log(TAG,'fold attached'); }catch(e){}
    }
  }
  try{ new MutationObserver(enhance).observe(document.documentElement||document.body,{childList:true,subtree:true}); }catch(e){}
  try{ setInterval(enhance,1500); }catch(e){}
  enhance();
  window.__v292Dfix332api={ enhance:enhance };
  try{ console.log(TAG,'loaded'); }catch(e){}
})();
