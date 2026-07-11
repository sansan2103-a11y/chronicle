// =====================================================================
// Chronicle TRPG - v292Dfix310: セーブ管理をカードギャラリー化
//   Phase1(済): v30セーブモーダルをカードグリッドへ再スキン(MutationObserver・
//     data-actボタン要素再利用で保存コア不触)。OFF=v292Dfix310Off。
//   Phase2(本版・cb=v292Dfix311): ①モーダルを全画面サイズに ②カバー画像を
//     その物語の世界観メモ(scene.lore)＋場所(scene.loc)＋トーン(scene.tone)から
//     pollinations(無料GET image.pollinations.ai・proxy予算を消費しない)で生成し
//     カバーに敷く。生成失敗時はPhase1のグラデ＋頭文字がそのまま残る(遮断器)。
//     seedはスロットIDをキーに含めて保存(v292cover_seed_<id>=本質的にスロット分離)。
//     右上↻で再生成(seed更新)。初回はカードごとに少しずらして生成＋失敗時は自動リトライ(無料pollinationsのrate-limit対策)。世界観が無い空スロットは生成しない。
//   Phase3: ＋新規カードでN枚の動的セーブ(chr6_slots_meta登録簿に追加・reload)/⋯の削除は「セーブを削除」1つに統合(旧clearは非表示)。
//   不変: 保存コア(fix205/225/230)/スロット分離(fix246)/自己更新(fix242)。
// =====================================================================
(function(){
  'use strict';
  var TAG='[v292Dfix310:gallery]';
  if(window.__v292Dfix310) return; window.__v292Dfix310=true;

  function isOff(){ try{ return localStorage.getItem('v292Dfix310Off')==='1'; }catch(e){ return false; } }
  function lsg(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function lss(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }

  function ensureStyles(){
    if(document.getElementById('v310-style')) return;
    var css=[
      // 全画面サイズ
      '.v30-modal.v310{width:96vw;max-width:none;height:92vh;max-height:92vh;display:flex;flex-direction:column}',
      '.v30-modal.v310 .v310-grid{flex:1;align-content:start;min-height:240px}', // fix417e: flex潰れ(高さ0)防止
      '.v310-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:18px;margin:6px 0 10px;overflow:auto}',
      '.v310-card{position:relative;background:var(--s1,#111119);border:1px solid var(--border,rgba(139,118,240,.25));border-radius:14px;overflow:hidden;transition:.16s}',
      '.v310-card:hover{transform:translateY(-2px);border-color:var(--acc,#8b76f0);box-shadow:0 8px 24px rgba(0,0,0,.45)}',
      '.v310-card.active{border-color:var(--acc,#8b76f0)}',
      '.v310-cover{position:relative;aspect-ratio:16/10;cursor:pointer;display:flex;align-items:center;justify-content:center;overflow:hidden}',
      '.v310-cover img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .45s}',
      '.v310-cover img.on{opacity:1}',
      '.v310-cover img.on ~ .v310-ini{opacity:0;transition:opacity .45s}',
      '.v310-cover .v310-ini{font-size:42px;font-weight:800;color:rgba(255,255,255,.85);text-shadow:0 2px 12px rgba(0,0,0,.5);z-index:1}',
      '.v310-cover .v310-shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 42%,rgba(8,8,15,.8) 100%);z-index:2}',
      '.v310-badge{position:absolute;top:9px;left:9px;background:var(--acc,#8b76f0);color:#fff;font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;letter-spacing:.04em;z-index:3}',
      '.v310-empty{position:absolute;top:9px;left:9px;background:rgba(8,8,15,.6);color:var(--dim,#888);font-size:10px;padding:3px 8px;border-radius:20px;z-index:3}',
      '.v310-regen{position:absolute;top:9px;right:9px;width:30px;height:30px;border-radius:50%;background:rgba(8,8,15,.6);border:1px solid var(--border,rgba(139,118,240,.3));color:#fff;cursor:pointer;font-size:15px;line-height:28px;text-align:center;opacity:0;transition:.16s;z-index:4}',
      '.v310-card:hover .v310-regen{opacity:1}',
      '.v310-regen.spin{animation:v310sp .8s linear infinite}',
      '@keyframes v310sp{to{transform:rotate(360deg)}}',
      '.v310-play{position:absolute;left:0;right:0;bottom:0;display:flex;justify-content:center;padding:10px;opacity:0;transition:.16s;z-index:3}',
      '.v310-card:hover .v310-play{opacity:1}',
      '.v310-play b{background:var(--acc,#8b76f0);color:#fff;padding:6px 18px;border-radius:20px;font-size:12.5px;font-weight:700}',
      '.v310-body{padding:11px 13px 13px}',
      '.v310-body .v30-slot-name{margin:0 0 7px}',
      '.v310-body .v30-slot-name input{font-weight:700}',
      '.v310-meta{font-size:12px;color:var(--dim,#9aa0c8);line-height:1.7}',
      '.v310-meta .k{color:var(--acc,#a78bfa)}',
      '.v310-foot{display:flex;align-items:center;gap:8px;margin-top:7px;font-size:11px;color:var(--dim,#888)}',
      '.v310-menuwrap{position:absolute;top:44px;right:9px;z-index:5}',
      '.v310-dots{width:28px;height:28px;border-radius:8px;background:rgba(8,8,15,.6);border:1px solid var(--border,rgba(139,118,240,.25));color:var(--tx,#e0dcf0);cursor:pointer;font-size:15px;line-height:26px;text-align:center;opacity:0;transition:.16s}',
      '.v310-card:hover .v310-dots{opacity:1}',
      '.v310-menu{display:none;position:absolute;top:32px;right:0;background:var(--s1,#15152a);border:1px solid var(--border,rgba(139,118,240,.3));border-radius:10px;padding:6px;min-width:170px;box-shadow:0 8px 24px rgba(0,0,0,.5);flex-direction:column;gap:4px}',
      '.v310-menu.open{display:flex}',
      '.v310-menu .v30-btn{width:100%;text-align:left;border-radius:7px}',
      '.v310-newcard{display:flex;align-items:center;justify-content:center;border:2px dashed var(--border,rgba(139,118,240,.4));background:transparent;min-height:230px;cursor:pointer;color:var(--dim,#9aa0c8)}',
      '.v310-newcard:hover{border-color:var(--acc,#8b76f0);color:var(--acc,#a78bfa);transform:translateY(-2px)}',
      '.v310-newinner{text-align:center}',
      '.v310-plus{font-size:38px;line-height:1;margin-bottom:8px}',
      '@media(max-width:600px){.v310-grid{grid-template-columns:1fr}.v30-modal.v310{width:100vw;height:100vh;max-height:100vh;border-radius:0;display:block;overflow-y:auto;-webkit-overflow-scrolling:touch}.v30-modal.v310 .v310-grid{flex:none;overflow:visible;min-height:0}}' // fix417e: iPhoneでグリッドが高さ0に潰れてセーブUIが見えない問題の根治(モーダル全体を縦スクロール化)
    ].join('');
    var st=document.createElement('style'); st.id='v310-style'; st.textContent=css; document.head.appendChild(st);
  }

  function hashN(s){ var h=0,i; s=String(s||''); for(i=0;i<s.length;i++){ h=(h*31+s.charCodeAt(i))>>>0; } return h; }
  function coverStyle(name){ var h=hashN(name)%360; return 'background:linear-gradient(160deg,hsl('+h+',42%,24%),hsl('+((h+28)%360)+',46%,9%))'; }
  function ini(name){ name=String(name||'?').trim(); return name?name.charAt(0):'◆'; }
  function escH(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

  // スロットのscene(世界観メモ/場所/トーン)を取得
  function getScene(id){
    try{ var raw=lsg(id==='default'?'chr6':'chr6_slot_'+id); if(!raw) return null; var d=JSON.parse(raw); return d&&d.scene||null; }catch(e){ return null; }
  }
  function buildPrompt(scene){
    if(!scene) return '';
    var loc=(scene.loc||'').trim();
    var lore=(scene.lore||'').replace(/【[^】]*】/g,' ').replace(/\s+/g,' ').trim().slice(0,90);
    var tone=(scene.tone||'').trim();
    var parts=[loc, lore, tone, 'cinematic key art, atmospheric lighting, detailed, no text, no people, no watermark'];
    var p=parts.filter(Boolean).join(', ');
    return p.slice(0,210);
  }
  function coverUrl(prompt,seed){
    return 'https://image.pollinations.ai/prompt/'+encodeURIComponent(prompt)+'?width=600&height=375&nologo=true&model=flux&seed='+seed;
  }
  function getSeed(id,prompt){ var s=lsg('v292cover_seed_'+id); if(s) return s; return String(hashN(prompt)%100000); }

  function attachCover(cover, id, scene, idx){
    var prompt=buildPrompt(scene);
    if(!prompt) return; // 空スロット=グラデのまま
    var seed=getSeed(id,prompt);
    var img=document.createElement('img'); img.alt=''; var tries=0;
    img.addEventListener('load', function(){ if(img.naturalWidth>0) img.classList.add('on'); });
    img.addEventListener('error', function(){ if(tries<3){ tries++; setTimeout(function(){ img.classList.remove('on'); img.src=coverUrl(prompt,seed)+'&r='+tries+'_'+Date.now(); }, 1400*tries+Math.random()*900); } });
    // 同時リクエストでpollinationsがrate-limitするのを避け、カードごとに少しずらして発火
    setTimeout(function(){ img.src=coverUrl(prompt,seed); }, (idx||0)*650);
    cover.insertBefore(img, cover.firstChild);
    // ↻再生成
    var rg=document.createElement('div'); rg.className='v310-regen'; rg.textContent='↻'; rg.title='カバー再生成';
    rg.addEventListener('click', function(e){
      e.stopPropagation();
      var ns=String(Math.floor(Math.random()*100000));
      lss('v292cover_seed_'+id, ns);
      rg.classList.add('spin'); img.classList.remove('on');
      img.onload=function(){ img.classList.add('on'); rg.classList.remove('spin'); };
      img.src=coverUrl(prompt,ns);
    });
    cover.appendChild(rg);
  }

  function parsePreview(t){ var o={hero:'',loc:'',turn:''},m; if(!t)return o;
    if((m=t.match(/主:\s*([^\/]+?)\s*(?:\/|$)/)))o.hero=m[1].trim();
    if((m=t.match(/場:\s*([^\/]+?)\s*(?:\/|$)/)))o.loc=m[1].trim();
    if((m=t.match(/(\d+)\s*turn/)))o.turn=m[1]; return o; }
  function parseTs(t){ if(!t)return''; var m=t.replace(/\(空\)/,'').match(/更新:\s*(.+)$/); return m?m[1].trim():''; }

  // ── Phase3: N枚動的セーブ(保存系のchr6_slots_meta登録簿を直接操作・コア不触) ──
  function readMeta(){ try{ return JSON.parse(lsg('chr6_slots_meta')||'[]')||[]; }catch(e){ return []; } }
  function writeMeta(m){ try{ localStorage.setItem('chr6_slots_meta', JSON.stringify(m)); }catch(e){} }
  function reopenManager(){ try{ var b=document.querySelector('[title^="\u30bb\u30fc\u30d6\u7ba1\u7406"]')||document.getElementById('v30-topbar-btn'); if(b) b.click(); }catch(e){} }
  function createSave(){
    var meta=readMeta();
    var id='s'+Date.now().toString(36)+Math.floor(Math.random()*1296).toString(36);
    meta.push({id:id, name:'\u65b0\u3057\u3044\u7269\u8a9e', key:'chr6_slot_'+id, updatedAt:null});
    writeMeta(meta);
    try{ if(window.S && typeof window.S.save==='function') window.S.save(); }catch(e){} // 現在のゲームを今のスロットへ退避
    try{ localStorage.setItem('chr6_active_slot', JSON.stringify(id)); }catch(e){}     // 新スロットをactiveに
    try{ location.reload(); }catch(e){}                                                // 空スロット→初期画面(既存init経路)
  }
  function deleteSave(id, card){
    if(id==='default') return;
    if(!confirm('\u3053\u306e\u30bb\u30fc\u30d6\u3092\u5b8c\u5168\u306b\u524a\u9664\u3057\u307e\u3059\u304b\uff1f\uff08\u4e2d\u8eab\u3082\u6d88\u3048\u307e\u3059\uff09')) return;
    writeMeta(readMeta().filter(function(x){ return x.id!==id; }));
    try{ localStorage.removeItem('chr6_slot_'+id); }catch(e){}
    try{ localStorage.removeItem('v292cover_seed_'+id); }catch(e){}
    try{ Object.keys(localStorage).forEach(function(k){ if(k.indexOf('_slot_'+id)>=0) localStorage.removeItem(k); }); }catch(e){} // fix246のper-storyキー
    var a=null; try{ a=JSON.parse(localStorage.getItem('chr6_active_slot')||'null'); }catch(e){}
    if(a===id){ try{ localStorage.setItem('chr6_active_slot', JSON.stringify('default')); location.reload(); }catch(e){} return; }
    if(card&&card.parentNode) card.parentNode.removeChild(card);
  }

  function transform(modal){
    if(!modal||modal.__v310done) return;
    var slots=modal.querySelectorAll('.v30-slot');
    if(!slots.length) return;
    modal.__v310done=true;
    ensureStyles(); modal.classList.add('v310');

    var grid=document.createElement('div'); grid.className='v310-grid';
    Array.prototype.forEach.call(slots, function(slot){
      var id=slot.getAttribute('data-id')||'';
      var active=slot.classList.contains('active');
      var nameWrap=slot.querySelector('.v30-slot-name');
      var nameInput=slot.querySelector('input[data-act="rename"]');
      var nm=nameInput?nameInput.value:(id||'');
      var metaTxt=(slot.querySelector('.v30-slot-meta')||{}).textContent||'';
      var prevTxt=(slot.querySelector('.v30-slot-preview')||{}).textContent||'';
      var hasData=metaTxt.indexOf('(空)')<0;
      var pv=parsePreview(prevTxt), ts=parseTs(metaTxt);
      var actionBtns=slot.querySelectorAll('.v30-slot-actions [data-act]');
      var loadBtn=slot.querySelector('[data-act="load"]');

      var card=document.createElement('div'); card.className='v310-card'+(active?' active':'');
      var cover=document.createElement('div'); cover.className='v310-cover'; cover.setAttribute('style',coverStyle(nm));
      cover.innerHTML='<div class="v310-ini">'+escH(ini(nm))+'</div><div class="v310-shade"></div>'+
        (active?'<div class="v310-badge">▶ プレイ中</div>':(hasData?'':'<div class="v310-empty">空</div>'))+
        (hasData?'<div class="v310-play"><b>'+(active?'閉じて続ける':'▶ 続きから')+'</b></div>':'');
      cover.addEventListener('click', function(){
        if(active){ var cb=modal.querySelector('[data-act="close"]'); if(cb) cb.click(); return; }
        if(loadBtn&&!loadBtn.disabled) loadBtn.click();
      });
      card.appendChild(cover);
      // カバー画像(世界観から生成)
      if(hasData){ try{ attachCover(cover, id, getScene(id), grid.children.length); }catch(e){} }

      var mw=document.createElement('div'); mw.className='v310-menuwrap';
      var dots=document.createElement('div'); dots.className='v310-dots'; dots.textContent='⋯';
      var menu=document.createElement('div'); menu.className='v310-menu';
      Array.prototype.forEach.call(actionBtns, function(b){ if(b.getAttribute('data-act')==='clear') return; menu.appendChild(b); }); // 旧「削除(空にする)」は統合のため非表示
      if(id!=='default'){ var del=document.createElement('button'); del.className='v30-btn v30-btn-danger'; del.textContent='\ud83d\uddd1 \u30bb\u30fc\u30d6\u3092\u524a\u9664'; del.addEventListener('click', function(e){ e.stopPropagation(); deleteSave(id, card); }); menu.appendChild(del); }
      dots.addEventListener('click', function(e){ e.stopPropagation(); document.querySelectorAll('.v310-menu.open').forEach(function(m){ if(m!==menu) m.classList.remove('open'); }); menu.classList.toggle('open'); });
      mw.appendChild(dots); mw.appendChild(menu); card.appendChild(mw);

      var body=document.createElement('div'); body.className='v310-body';
      if(nameWrap) body.appendChild(nameWrap);
      var meta=document.createElement('div'); meta.className='v310-meta';
      meta.innerHTML=(pv.loc?'<span class="k">📍</span> '+escH(pv.loc)+'　':'')+(pv.hero?'<span class="k">👤</span> '+escH(pv.hero):'');
      if(!pv.loc&&!pv.hero) meta.innerHTML='<span style="opacity:.6">（空のスロット）</span>';
      body.appendChild(meta);
      var foot=document.createElement('div'); foot.className='v310-foot';
      foot.innerHTML=(hasData?'<span>📜 '+(pv.turn||'0')+'ターン</span><span style="opacity:.4">・</span>':'')+'<span>⏱ '+escH(ts||'—')+'</span>';
      body.appendChild(foot);
      card.appendChild(body);
      grid.appendChild(card);
    });

    // ＋新規セーブカード
    var nc=document.createElement('div'); nc.className='v310-card v310-newcard';
    nc.innerHTML='<div class="v310-newinner"><div class="v310-plus">＋</div><div>新しい物語を始める</div></div>';
    nc.addEventListener('click', function(){ createSave(); });
    grid.appendChild(nc);

    var h3=null,nodes=modal.childNodes,i;
    for(i=0;i<nodes.length;i++){ if(nodes[i].tagName==='H3'){ h3=nodes[i]; break; } }
    var ref=(slots[0]&&slots[0].parentNode===modal)?slots[0]:(h3?h3.nextSibling:null);
    modal.insertBefore(grid, ref);
    Array.prototype.forEach.call(slots, function(s){ if(s.parentNode) s.parentNode.removeChild(s); });

    if(!modal.__v310docclick){ modal.__v310docclick=true; document.addEventListener('click', function(){ document.querySelectorAll('.v310-menu.open').forEach(function(m){ m.classList.remove('open'); }); }); }
  }

  function scan(){ if(isOff()) return; var ov=document.getElementById('v30-overlay'); if(!ov) return; var modal=ov.querySelector('.v30-modal'); if(modal) transform(modal); }
  try{ new MutationObserver(function(){ try{ scan(); }catch(e){} }).observe(document.body||document.documentElement,{childList:true,subtree:true}); }catch(e){}
  try{ setInterval(scan, 600); }catch(e){}
  scan();
  window.__v292Dfix310api={ transform:transform, scan:scan, buildPrompt:buildPrompt };
  try{ console.log(TAG,'loaded (phase2 covers)'); }catch(e){}
})();
