// =====================================================================
// Chronicle TRPG - v292Dfix314: 記憶（編集できる記憶 ＋ コンテキスト透視）
//   目的(おしんの「①から順に」の②): AIダンジョンの Memory/Context 閲覧を移植。
//     (A)編集できる記憶=この物語で確定している事実を自由記述。毎ターン必ずsysに注入し、
//        自動要約に上書きされない永久メモ。AIが事実を取り違えたら手で直せる。
//     (B)コンテキスト透視(読み取り専用)=エンジンが今どう覚えているか(あらすじ/登場人物/
//        重要事象/キャラ状態)を可視化。「なぜAIがこう書くのか」が見える透明化。
//   設計(コア不触): 注入は fix313/309 同型の Planner.build 最外ラップ(★_extensionsは
//     現行送信経路で無効と実証済→使わない)。保存は S.scene.memoryNote(既存セーブ機構に相乗り)。
//     透視は window.__longmem / window.__v292Dfix77Store を読むだけ。
//   OFF: localStorage v292Dfix314Off='1' で(A)の注入停止(データは保持)。
// =====================================================================
(function(){
  'use strict';
  var TAG='[v292Dfix314:memory]';
  if(window.__v292Dfix314) return; window.__v292Dfix314=true;
  var MARK='【記憶（この物語で確定している事実';

  function off(){ try{ return localStorage.getItem('v292Dfix314Off')==='1'; }catch(e){ return false; } }
  function getS(){ try{ return window.S||(typeof S!=='undefined'?S:null); }catch(e){ return null; } }
  function getNote(){ var s=getS(); if(!s) return ''; if(!s.scene) s.scene={}; return (typeof s.scene.memoryNote==='string')?s.scene.memoryNote:''; }
  function setNote(v){ var s=getS(); if(!s) return; if(!s.scene) s.scene={}; s.scene.memoryNote=String(v||''); persist(); }
  function persist(){ try{ var s=getS(); if(s&&typeof s.save==='function'){ (typeof s.saveD==='function'?s.saveD('fix314.persist'):s.save()); return; } }catch(e){}
    try{ if(window.S&&typeof window.S.save==='function') window.S.save(); }catch(e){} }

  // ---- (A) 注入: Planner.build最外ラップ ----
  function buildBlock(){
    if(off()) return '';
    var n=getNote(); if(!n||!n.trim()) return '';
    return '\n\n'+MARK+'。常に踏まえ、本文に説明書きとして混ぜない）】\n'+n.trim();
  }
  function installBuild(){
    try{
      var P=window.Planner||(typeof Planner!=='undefined'?Planner:null);
      if(!P||typeof P.build!=='function') return false;
      if(P.build._v292f314===true) return true;
      var inner=P.build.bind(P);
      var wrapped=function(){
        var r=inner.apply(this,arguments);
        try{ if(r&&typeof r.sys==='string'){ var b=buildBlock(); if(b && r.sys.indexOf(MARK)<0) r.sys=r.sys+b; } }catch(e){}
        return r;
      };
      try{ Object.keys(P.build).forEach(function(k){ wrapped[k]=P.build[k]; }) /* fix419c: 全プロパティ継承(9者相互ラップダンスの根治) */; }catch(e){}
      wrapped._v292f314=true;
      P.build=wrapped;
      return true;
    }catch(e){ return false; }
  }
  installBuild(); try{ setInterval(installBuild, 2500); }catch(e){}

  // ---- (B) 透視: longmem/fix77 を読む ----
  function readContext(){
    var out={summary:'', wi:[], events:[], states:[]};
    try{ var lm=window.__longmem; if(lm){
      try{ out.summary = lm.getSummary()||''; }catch(e){}
      try{ out.wi = lm.getWorldInfoFor('', 12)||[]; }catch(e){}
      try{ out.events = lm.getKeyEvents(12)||[]; }catch(e){}
    }}catch(e){}
    try{ var st=window.__v292Dfix77Store||{};
      Object.keys(st).forEach(function(name){ var s=st[name]||{};
        var parts=[];
        if(s.karada) parts.push('体:'+s.karada);
        if(s.kokoro) parts.push('心:'+s.kokoro);
        if(s.honno) parts.push('本能:'+s.honno);
        if(s.mokuteki) parts.push('目的:'+s.mokuteki);
        if(parts.length) out.states.push({name:name, text:parts.join(' / ')});
      });
    }catch(e){}
    return out;
  }

  // ---- UI ----
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function ensureStyles(){
    if(document.getElementById('v314-style')) return;
    var css=[
      '.v314-modal{width:min(860px,94vw);max-height:88vh;overflow:auto}',
      '.v314-sec{border:1px solid var(--border,rgba(139,118,240,.25));border-radius:10px;padding:14px;margin-bottom:14px;background:var(--bg,#09090f)}',
      '.v314-sec h3{margin:0 0 8px;font-size:14px;color:var(--acc,#a78bfa)}',
      '.v314-hint{font-size:11.5px;color:var(--dim,#888);line-height:1.7;margin:0 0 10px}',
      '.v314-note{width:100%;min-height:120px;background:var(--bg,#09090f);color:var(--tx,#e0dcf0);border:1px solid var(--border);border-radius:8px;padding:9px 11px;font-size:13px;font-family:inherit;box-sizing:border-box;resize:vertical;line-height:1.7}',
      '.v314-sub{font-size:12px;color:var(--dim,#aaa);margin:12px 0 4px;font-weight:700}',
      '.v314-ctx{font-size:12.5px;color:var(--tx,#cfc9e6);line-height:1.75;white-space:pre-wrap;background:rgba(255,255,255,.02);border-radius:6px;padding:8px 10px;margin:0}',
      '.v314-li{font-size:12.5px;color:var(--tx,#cfc9e6);line-height:1.7;padding:2px 0;border-bottom:1px dashed rgba(139,118,240,.12)}',
      '.v314-empty{color:var(--dim,#777);font-size:12px;padding:6px 0}',
      '.v314-reload{background:transparent;border:1px solid var(--border);color:var(--acc,#a78bfa);border-radius:6px;padding:5px 11px;font-size:12px;cursor:pointer;float:right}',
      '#topbar.v243-collapsed #v314-btn{display:inline-flex !important}',
      '#v314-btn{display:inline-flex;align-items:center}'
    ].join('');
    var st=document.createElement('style'); st.id='v314-style'; st.textContent=css; document.head.appendChild(st);
  }
  function ctxHtml(){
    var c=readContext();
    var h=[];
    h.push('<div class="v314-sub">あらすじ（自動要約）</div>');
    h.push(c.summary ? '<div class="v314-ctx">'+esc(c.summary)+'</div>' : '<div class="v314-empty">（まだ生成されていません。数ターン進むと作られます）</div>');
    h.push('<div class="v314-sub">登場人物・場所・物</div>');
    if(c.wi.length) c.wi.forEach(function(w){ h.push('<div class="v314-li">・'+esc(w.name)+'（'+esc(w.type)+'）：'+esc(w.desc)+'</div>'); });
    else h.push('<div class="v314-empty">（なし）</div>');
    h.push('<div class="v314-sub">重要な出来事</div>');
    if(c.events.length) c.events.forEach(function(e){ h.push('<div class="v314-li">・T'+esc(e.turnIdx)+'：'+esc(e.event)+'</div>'); });
    else h.push('<div class="v314-empty">（なし）</div>');
    h.push('<div class="v314-sub">キャラクターの状態</div>');
    if(c.states.length) c.states.forEach(function(s){ h.push('<div class="v314-li">・'+esc(s.name)+'：'+esc(s.text)+'</div>'); });
    else h.push('<div class="v314-empty">（なし）</div>');
    return h.join('');
  }
  function render(modal){
    ensureStyles();
    var html=['<h2>🧠 記憶 <button class="v30-close" id="v314-x">×</button></h2>'];
    // (A) editable memory
    html.push('<div class="v314-sec">');
    html.push('<h3>✏️ 編集できる記憶</h3>');
    html.push('<div class="v314-hint">この物語で<b>確定している事実</b>を書いておくと、毎ターン必ずAIに渡され、自動要約で薄れても消えません。AIが事実を取り違えたらここで直してください。（例：「主人公の弟は3年前に死んでいる」「街の名はノクサス」）</div>');
    html.push('<textarea class="v314-note" id="v314-note" placeholder="例：主人公カイトは記憶を失っている。相棒のレンは本当はカイトの正体を知っている。">'+esc(getNote())+'</textarea>');
    html.push('</div>');
    // (B) read-only context
    html.push('<div class="v314-sec" id="v314-ctxsec">');
    html.push('<button class="v314-reload" id="v314-reload">↻ 再読込</button>');
    html.push('<h3>🔍 エンジンが今おぼえていること（読み取り専用）</h3>');
    html.push('<div class="v314-hint">AIが整合性のために内部で参照しているメモです。間違っていたら、上の「編集できる記憶」か🗂カードで上書きできます。</div>');
    html.push('<div id="v314-ctx">'+ctxHtml()+'</div>');
    html.push('</div>');
    modal.innerHTML=html.join('');
    bind(modal);
  }
  function bind(modal){
    var x=modal.querySelector('#v314-x'); if(x) x.addEventListener('click', close);
    var note=modal.querySelector('#v314-note');
    if(note) note.addEventListener('input', function(){ setNote(note.value); });
    var rl=modal.querySelector('#v314-reload');
    if(rl) rl.addEventListener('click', function(){ var c=modal.querySelector('#v314-ctx'); if(c) c.innerHTML=ctxHtml(); });
  }
  function close(){ var ov=document.getElementById('v314-overlay'); if(ov&&ov.parentNode) ov.parentNode.removeChild(ov); }
  function open(){
    close(); ensureStyles();
    var ov=document.createElement('div'); ov.className='v30-overlay'; ov.id='v314-overlay';
    ov.addEventListener('click', function(e){ if(e.target===ov) close(); });
    var modal=document.createElement('div'); modal.className='v30-modal v314-modal';
    ov.appendChild(modal); document.body.appendChild(ov);
    render(modal);
  }
  window.__v292Dfix314api={ open:open, buildBlock:buildBlock, getNote:getNote, setNote:setNote, readContext:readContext };

  // ---- トップバーにボタン（🗂カードの隣 / ⚙設定の隣） ----
  function topbarAnchor(){
    var bar=document.getElementById('topbar');
    if(bar){
      var kids=Array.prototype.slice.call(bar.children);
      var card=document.getElementById('v313-btn'); if(card&&card.parentNode===bar) return card;
      var gear=kids.filter(function(c){return /^⚙?設定$/.test((c.textContent||'').replace(/\s+/g,''));})[0];
      if(gear) return gear;
    }
    var a=document.getElementById('v30-topbar-btn');
    if(a&&a.getBoundingClientRect().width>0) return a;
    return null;
  }
  function ensureBtn(){
    ensureStyles();
    var anchor=topbarAnchor(); if(!anchor||!anchor.parentNode) return;
    var b=document.getElementById('v314-btn');
    if(b){ if(b.parentNode!==anchor.parentNode){ try{ anchor.parentNode.insertBefore(b, anchor.nextSibling); }catch(e){} }
      try{ b.classList.remove('v243-foldable'); }catch(e){} return; }
    b=document.createElement('button'); b.id='v314-btn'; b.textContent='🧠 記憶'; b.className='top-btn';
    b.title='記憶（編集できる記憶＋エンジンの記憶を見る）';
    b.addEventListener('click', open);
    anchor.parentNode.insertBefore(b, anchor.nextSibling);
    try{ b.classList.remove('v243-foldable'); }catch(e){}
  }
  try{ setInterval(ensureBtn, 1500); }catch(e){} ensureBtn();

  try{ console.log(TAG,'loaded'); }catch(e){}
})();
