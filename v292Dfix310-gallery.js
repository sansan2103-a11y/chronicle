// =====================================================================
// Chronicle TRPG - v292Dfix310: セーブ管理をカードギャラリー化(Phase1)
//   目的: 「📁セーブ管理」のテキスト羅列を、AIダンジョン風のカバー付きカード
//         グリッドに見せ替える。一目でどの物語か分かるようにする。
//   方式: 非破壊の"再スキン"。features.jsのrenderManager(=.v30-overlay)が出る度に
//         MutationObserverで捕捉し、.v30-modalの中身をカードグリッドへ変換。
//         既存の data-act ボタン(load/saveto/import/clear/rename)は**要素ごと再利用**
//         (modalへのイベント委譲がそのまま効く)ので保存コアに一切触れない。
//   Phase1: カバーは世界観ハッシュ由来のテーマ別グラデーション(画像生成なし)。
//           Phase2で世界観メモからの画像生成を載せる予定。
//   非対象/不変: 保存コア(fix205/225/230)・スロット分離(fix246)・自己更新(fix242)。
//   OFF: localStorage v292Dfix310Off='1' で従来のリスト表示に戻る。
// =====================================================================
(function(){
  'use strict';
  var TAG='[v292Dfix310:gallery]';
  if(window.__v292Dfix310) return; window.__v292Dfix310=true;

  function isOff(){ try{ return localStorage.getItem('v292Dfix310Off')==='1'; }catch(e){ return false; } }

  function ensureStyles(){
    if(document.getElementById('v310-style')) return;
    var css=[
      '.v30-modal.v310{width:min(900px,95vw)}',
      '.v310-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;margin:4px 0 6px}',
      '.v310-card{position:relative;background:var(--s1,#111119);border:1px solid var(--border,rgba(139,118,240,.25));border-radius:14px;overflow:hidden;transition:.16s}',
      '.v310-card:hover{transform:translateY(-2px);border-color:var(--acc,#8b76f0);box-shadow:0 8px 24px rgba(0,0,0,.45)}',
      '.v310-card.active{border-color:var(--acc,#8b76f0)}',
      '.v310-cover{position:relative;aspect-ratio:16/10;cursor:pointer;display:flex;align-items:center;justify-content:center}',
      '.v310-cover .v310-ini{font-size:40px;font-weight:800;color:rgba(255,255,255,.85);text-shadow:0 2px 12px rgba(0,0,0,.5)}',
      '.v310-cover .v310-shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 45%,rgba(8,8,15,.78) 100%)}',
      '.v310-badge{position:absolute;top:9px;left:9px;background:var(--acc,#8b76f0);color:#fff;font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;letter-spacing:.04em;z-index:2}',
      '.v310-empty{position:absolute;top:9px;left:9px;background:rgba(8,8,15,.6);color:var(--dim,#888);font-size:10px;padding:3px 8px;border-radius:20px;z-index:2}',
      '.v310-play{position:absolute;left:0;right:0;bottom:0;display:flex;justify-content:center;padding:10px;opacity:0;transition:.16s;z-index:2}',
      '.v310-card:hover .v310-play{opacity:1}',
      '.v310-play b{background:var(--acc,#8b76f0);color:#fff;padding:6px 18px;border-radius:20px;font-size:12.5px;font-weight:700}',
      '.v310-body{padding:11px 13px 13px}',
      '.v310-body .v30-slot-name{margin:0 0 7px}',
      '.v310-body .v30-slot-name input{font-weight:700}',
      '.v310-meta{font-size:12px;color:var(--dim,#9aa0c8);line-height:1.7}',
      '.v310-meta .k{color:var(--acc,#a78bfa)}',
      '.v310-foot{display:flex;align-items:center;gap:8px;margin-top:7px;font-size:11px;color:var(--dim,#888)}',
      '.v310-menuwrap{position:absolute;top:7px;right:7px;z-index:3}',
      '.v310-dots{width:28px;height:28px;border-radius:8px;background:rgba(8,8,15,.6);border:1px solid var(--border,rgba(139,118,240,.25));color:var(--tx,#e0dcf0);cursor:pointer;font-size:15px;line-height:26px;text-align:center}',
      '.v310-menu{display:none;position:absolute;top:32px;right:0;background:var(--s1,#15152a);border:1px solid var(--border,rgba(139,118,240,.3));border-radius:10px;padding:6px;min-width:170px;box-shadow:0 8px 24px rgba(0,0,0,.5);flex-direction:column;gap:4px}',
      '.v310-menu.open{display:flex}',
      '.v310-menu .v30-btn{width:100%;text-align:left;border-radius:7px}',
      '@media(max-width:600px){.v310-grid{grid-template-columns:1fr}}'
    ].join('');
    var st=document.createElement('style'); st.id='v310-style'; st.textContent=css; document.head.appendChild(st);
  }

  function hashHue(s){ var h=0,i; s=s||''; for(i=0;i<s.length;i++){ h=(h*31+s.charCodeAt(i))>>>0; } return h%360; }
  function coverStyle(name){ var h=hashHue(name); return 'background:linear-gradient(160deg,hsl('+h+',42%,24%),hsl('+((h+28)%360)+',46%,9%))'; }
  function ini(name){ name=(name||'?').trim(); return name ? name.charAt(0) : '◆'; }

  // "主: X / 場: Y / N turn" → {hero, loc, turn}
  function parsePreview(t){
    var o={hero:'',loc:'',turn:''};
    if(!t) return o;
    var m;
    if((m=t.match(/主:\s*([^\/]+?)\s*(?:\/|$)/))) o.hero=m[1].trim();
    if((m=t.match(/場:\s*([^\/]+?)\s*(?:\/|$)/))) o.loc=m[1].trim();
    if((m=t.match(/(\d+)\s*turn/))) o.turn=m[1];
    return o;
  }
  function parseTs(t){ if(!t) return ''; var m=t.replace(/\(空\)/,'').match(/更新:\s*(.+)$/); return m?m[1].trim():''; }

  function transform(modal){
    if(!modal || modal.__v310done) return;
    var slots=modal.querySelectorAll('.v30-slot');
    if(!slots.length) return;
    modal.__v310done=true;
    ensureStyles();
    modal.classList.add('v310');

    var grid=document.createElement('div'); grid.className='v310-grid';
    var firstSlot=slots[0];
    // 各スロット→カード
    Array.prototype.forEach.call(slots, function(slot){
      var id=slot.getAttribute('data-id')||'';
      var active=slot.classList.contains('active');
      var nameWrap=slot.querySelector('.v30-slot-name');
      var nameInput=slot.querySelector('input[data-act="rename"]');
      var nm=nameInput?nameInput.value:(id||'');
      var metaTxt=(slot.querySelector('.v30-slot-meta')||{}).textContent||'';
      var prevTxt=(slot.querySelector('.v30-slot-preview')||{}).textContent||'';
      var hasData=metaTxt.indexOf('(空)')<0;
      var pv=parsePreview(prevTxt);
      var ts=parseTs(metaTxt);
      // 既存アクションボタン(要素ごと再利用)
      var actionBtns=slot.querySelectorAll('.v30-slot-actions [data-act]');
      var loadBtn=slot.querySelector('[data-act="load"]');

      var card=document.createElement('div');
      card.className='v310-card'+(active?' active':'');

      // cover
      var cover=document.createElement('div');
      cover.className='v310-cover'; cover.setAttribute('style', coverStyle(nm));
      cover.innerHTML='<div class="v310-shade"></div><div class="v310-ini">'+ (ini(nm)).replace(/[<>&]/g,'') +'</div>'+
        (active?'<div class="v310-badge">▶ プレイ中</div>':(hasData?'':'<div class="v310-empty">空</div>'))+
        (hasData?'<div class="v310-play"><b>'+(active?'閉じて続ける':'▶ 続きから')+'</b></div>':'');
      cover.addEventListener('click', function(){
        if(active){ var cb=modal.querySelector('[data-act="close"]'); if(cb) cb.click(); return; }
        if(loadBtn && !loadBtn.disabled){ loadBtn.click(); }
      });
      card.appendChild(cover);

      // ⋯ menu (move existing action buttons in)
      var mw=document.createElement('div'); mw.className='v310-menuwrap';
      var dots=document.createElement('div'); dots.className='v310-dots'; dots.textContent='⋯';
      var menu=document.createElement('div'); menu.className='v310-menu';
      Array.prototype.forEach.call(actionBtns, function(b){ menu.appendChild(b); }); // 要素ごと移動(委譲は維持)
      dots.addEventListener('click', function(e){ e.stopPropagation(); document.querySelectorAll('.v310-menu.open').forEach(function(m){ if(m!==menu) m.classList.remove('open'); }); menu.classList.toggle('open'); });
      mw.appendChild(dots); mw.appendChild(menu); card.appendChild(mw);

      // body
      var body=document.createElement('div'); body.className='v310-body';
      if(nameWrap) body.appendChild(nameWrap); // rename input をそのまま
      var meta=document.createElement('div'); meta.className='v310-meta';
      meta.innerHTML=(pv.loc?'<span class="k">📍</span> '+escH(pv.loc)+'　':'')+(pv.hero?'<span class="k">👤</span> '+escH(pv.hero):'');
      if(!pv.loc && !pv.hero) meta.innerHTML='<span style="opacity:.6">（空のスロット）</span>';
      body.appendChild(meta);
      var foot=document.createElement('div'); foot.className='v310-foot';
      foot.innerHTML=(hasData?'<span>📜 '+(pv.turn||'0')+'ターン</span><span style="opacity:.4">・</span>':'')+'<span>⏱ '+escH(ts||'—')+'</span>';
      body.appendChild(foot);
      card.appendChild(body);

      grid.appendChild(card);
    });

    // 旧スロット列を撤去してグリッド差し込み
    var h3=null; var nodes=modal.childNodes, i;
    for(i=0;i<nodes.length;i++){ if(nodes[i].tagName==='H3'){ h3=nodes[i]; break; } }
    var ref = (slots[0] && slots[0].parentNode===modal) ? slots[0] : (h3?h3.nextSibling:null);
    modal.insertBefore(grid, ref);
    Array.prototype.forEach.call(slots, function(s){ if(s.parentNode) s.parentNode.removeChild(s); });

    // メニュー外クリックで閉じる
    if(!modal.__v310docclick){ modal.__v310docclick=true; document.addEventListener('click', function(){ document.querySelectorAll('.v310-menu.open').forEach(function(m){ m.classList.remove('open'); }); }); }
  }

  function escH(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

  function scan(){
    if(isOff()) return;
    var ov=document.getElementById('v30-overlay'); if(!ov) return;
    var modal=ov.querySelector('.v30-modal'); if(modal) transform(modal);
  }

  try{
    var mo=new MutationObserver(function(){ try{ scan(); }catch(e){} });
    mo.observe(document.body||document.documentElement,{childList:true,subtree:true});
  }catch(e){}
  try{ setInterval(scan, 600); }catch(e){} // 保険
  scan();

  window.__v292Dfix310api={ transform:transform, scan:scan };
  try{ console.log(TAG,'loaded'); }catch(e){}
})();
