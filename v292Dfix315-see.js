// =====================================================================
// Chronicle TRPG - v292Dfix315: SEE（いまの場面を絵にする）
//   目的(おしんの「①から順に」の③): AIダンジョンのSEE/画像生成を移植。
//     今この瞬間の展開描写＋場所＋トーンから、無料pollinations(flux)で一枚絵を生成して表示。
//   設計(コア不触・予算不使用): fix311カバーと同じ image.pollinations.ai の無料GET
//     (proxy予算を消費しない)。失敗時は自動リトライ3回→グラデ+文言フォールバック(遮断器)。
//     ↻で再生成。場面が無い(新規ゲーム)時は生成しない。
//   注: モデルへのプロンプト送信や課金経路は一切使わない。純粋に表示専用。
// =====================================================================
(function(){
  'use strict';
  var TAG='[v292Dfix315:see]';
  if(window.__v292Dfix315) return; window.__v292Dfix315=true;

  function getS(){ try{ return window.S||(typeof S!=='undefined'?S:null); }catch(e){ return null; } }
  function hashN(s){ var h=0,i; s=String(s||''); for(i=0;i<s.length;i++){ h=((h<<5)-h+s.charCodeAt(i))|0; } return Math.abs(h); }

  // 直近の展開描写を一文に蒸留（タグ/話者記号を除去）
  function latestScene(){
    var s=getS(); if(!s||!Array.isArray(s.turns)||!s.turns.length) return '';
    var t=s.turns[s.turns.length-1]; if(!t) return '';
    var nar=t.narrative; if(Array.isArray(nar)) nar=nar.join(' ');
    nar=String(nar||t.text||'');
    nar=nar.replace(/<[^>]*>/g,' ')          // タグ除去
           .replace(/「[^」]*」/g,' ')        // セリフ除去(情景優先)
           .replace(/[【][^】]*[】]/g,' ')
           .replace(/\s+/g,' ').trim();
    return nar.slice(0,140);
  }
  function buildPrompt(){
    var s=getS(); var sc=(s&&s.scene)||{};
    var loc=(sc.loc||'').trim();
    var tone=(sc.tone||'').trim();
    var moment=latestScene();
    var parts=[loc, moment, tone, 'cinematic film still, atmospheric lighting, highly detailed illustration, dramatic mood'];
    return parts.filter(Boolean).join(', ').slice(0,260);
  }
  function imgUrl(prompt,seed){
    return 'https://image.pollinations.ai/prompt/'+encodeURIComponent(prompt)+'?width=768&height=512&nologo=true&model=flux&seed='+seed;
  }

  // ---- UI ----
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function ensureStyles(){
    if(document.getElementById('v315-style')) return;
    var css=[
      '.v315-modal{width:min(840px,94vw);max-height:90vh;overflow:auto;text-align:center}',
      '.v315-stage{position:relative;width:100%;aspect-ratio:3/2;border-radius:12px;overflow:hidden;background:linear-gradient(135deg,#1a1530,#0c0a18);display:flex;align-items:center;justify-content:center;margin:6px 0 12px}',
      '.v315-img{width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .6s}',
      '.v315-img.on{opacity:1}',
      '.v315-spin{position:absolute;color:var(--dim,#9a90c8);font-size:13px;letter-spacing:.04em}',
      '.v315-fallback{position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;gap:8px;color:#cfc9e6;background:linear-gradient(135deg,#241b46,#100c22);padding:20px;text-align:center}',
      '.v315-fallback .t{font-size:13px;line-height:1.7;color:#b9b0e0}',
      '.v315-cap{font-size:12px;color:var(--dim,#999);line-height:1.7;margin:0 0 12px;text-align:left;white-space:pre-wrap;max-height:5.4em;overflow:auto}',
      '.v315-actions{display:flex;gap:10px;justify-content:center}',
      '.v315-btn2{background:var(--acc,#8b76f0);color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:13px;cursor:pointer;font-weight:700}',
      '.v315-btn2.ghost{background:transparent;border:1px solid var(--border,rgba(139,118,240,.4));color:var(--acc,#a78bfa);font-weight:400}',
      '.v315-empty{color:var(--dim,#888);font-size:13px;padding:30px 0}',
      '#topbar.v243-collapsed #v315-btn{display:inline-flex !important}',
      '#v315-btn{display:inline-flex;align-items:center}'
    ].join('');
    var st=document.createElement('style'); st.id='v315-style'; st.textContent=css; document.head.appendChild(st);
  }
  var _seedBump=0;
  function generate(modal){
    var prompt=buildPrompt();
    var stage=modal.querySelector('#v315-stage'); if(!stage) return;
    if(!prompt || !latestScene()){
      stage.innerHTML='<div class="v315-empty">まだ描写がありません。物語を一度進めてから「見る」を押してください。</div>';
      return;
    }
    var s=getS(); var turnN=(s&&s.turns)?s.turns.length:0;
    var seed=(hashN(prompt)%100000)+turnN*7+_seedBump;
    stage.innerHTML='<div class="v315-spin">いまの場面を描いています…</div>'+
      '<img class="v315-img" id="v315-img" alt="scene">'+
      '<div class="v315-fallback" id="v315-fb"><div class="t">絵の生成に失敗しました。<br>通信が混んでいるかもしれません。<br>「↻ 描き直す」でもう一度お試しください。</div></div>';
    var img=stage.querySelector('#v315-img');
    var fb=stage.querySelector('#v315-fb');
    var spin=stage.querySelector('.v315-spin');
    var tries=0;
    img.addEventListener('load', function(){ if(img.naturalWidth>0){ img.classList.add('on'); if(spin) spin.style.display='none'; } });
    img.addEventListener('error', function(){
      if(tries<3){ tries++; setTimeout(function(){ img.classList.remove('on'); img.src=imgUrl(prompt,seed)+'&r='+tries+'_'+Date.now(); }, 1400*tries+Math.random()*900); }
      else{ if(spin) spin.style.display='none'; if(fb) fb.style.display='flex'; }
    });
    img.src=imgUrl(prompt,seed);
    var cap=modal.querySelector('#v315-cap'); if(cap) cap.textContent='この場面：'+ (latestScene()||'(なし)');
  }
  function render(modal){
    ensureStyles();
    var html=['<h2>👁 いまの場面を見る <button class="v30-close" id="v315-x">×</button></h2>'];
    html.push('<div class="v315-stage" id="v315-stage"></div>');
    html.push('<p class="v315-cap" id="v315-cap"></p>');
    html.push('<div class="v315-actions">');
    html.push('<button class="v315-btn2" id="v315-regen">↻ 描き直す</button>');
    html.push('<button class="v315-btn2 ghost" id="v315-close2">閉じる</button>');
    html.push('</div>');
    modal.innerHTML=html.join('');
    var x=modal.querySelector('#v315-x'); if(x) x.addEventListener('click', close);
    var c2=modal.querySelector('#v315-close2'); if(c2) c2.addEventListener('click', close);
    var rg=modal.querySelector('#v315-regen'); if(rg) rg.addEventListener('click', function(){ _seedBump+=997; generate(modal); });
    generate(modal);
  }
  function close(){ var ov=document.getElementById('v315-overlay'); if(ov&&ov.parentNode) ov.parentNode.removeChild(ov); }
  function open(){
    close(); ensureStyles();
    var ov=document.createElement('div'); ov.className='v30-overlay'; ov.id='v315-overlay';
    ov.addEventListener('click', function(e){ if(e.target===ov) close(); });
    var modal=document.createElement('div'); modal.className='v30-modal v315-modal';
    ov.appendChild(modal); document.body.appendChild(ov);
    render(modal);
  }
  window.__v292Dfix315api={ open:open, buildPrompt:buildPrompt, latestScene:latestScene, imgUrl:imgUrl };

  // ---- トップバーにボタン（🧠記憶の隣） ----
  function topbarAnchor(){
    var bar=document.getElementById('topbar');
    if(bar){
      var mem=document.getElementById('v314-btn'); if(mem&&mem.parentNode===bar) return mem;
      var card=document.getElementById('v313-btn'); if(card&&card.parentNode===bar) return card;
      var kids=Array.prototype.slice.call(bar.children);
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
    var b=document.getElementById('v315-btn');
    if(b){ if(b.parentNode!==anchor.parentNode){ try{ anchor.parentNode.insertBefore(b, anchor.nextSibling); }catch(e){} }
      try{ b.classList.remove('v243-foldable'); }catch(e){} return; }
    b=document.createElement('button'); b.id='v315-btn'; b.textContent='👁 見る'; b.className='top-btn';
    b.title='いまの場面を絵にする（無料・予算不使用）';
    b.addEventListener('click', open);
    anchor.parentNode.insertBefore(b, anchor.nextSibling);
    try{ b.classList.remove('v243-foldable'); }catch(e){}
  }
  try{ setInterval(ensureBtn, 1500); }catch(e){} ensureBtn();

  try{ console.log(TAG,'loaded'); }catch(e){}
})();
