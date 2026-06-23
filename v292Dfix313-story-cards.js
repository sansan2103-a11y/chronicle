// =====================================================================
// Chronicle TRPG - v292Dfix313: 設定カード(編集できるトリガー式の永久canon/事典)
//   背景: 長期記憶の弱点(自動要約が毎回置換で古い重要事実が消える/間接参照を拾えない)を
//     補う。AIダンジョンのStory Card型=「名前＋トリガー語＋本文＋常時フラグ」を手書きでき、
//     常時カードは毎ターン必ず注入、トリガーカードは直近ターンに語が出た時だけ注入。
//   設計(コア不触):
//     - 保存: S.scene.cards[] に持つ → 既存セーブ機構(fix205/225/230)でスロット分離＋
//       JSON書出/読込/まるごと書出に自動で乗る。
//     - 注入: Planner._extensions に後処理を push(fix305と同じ機構)。組み上がったsysの末尾へ
//       【設定カード】ブロックを足す(常時＋直近トリガー命中のみ・冪等)。
//     - UI: トップバーに「🗂 カード」ボタン→管理モーダル(一覧/追加/編集/削除/常時トグル)。
//   OFF: localStorage v292Dfix313Off='1' で注入停止(データは保持)。
// =====================================================================
(function(){
  'use strict';
  var TAG='[v292Dfix313:story-cards]';
  if(window.__v292Dfix313) return; window.__v292Dfix313=true;
  var RECENT=6, MARK='【設定カード';

  function off(){ try{ return localStorage.getItem('v292Dfix313Off')==='1'; }catch(e){ return false; } }
  function getS(){ try{ return window.S||(typeof S!=='undefined'?S:null); }catch(e){ return null; } }
  function getCards(){ var s=getS(); if(!s) return []; if(!s.scene) s.scene={}; if(!Array.isArray(s.scene.cards)) s.scene.cards=[]; return s.scene.cards; }
  function persist(){ try{ var s=getS(); if(s&&typeof s.save==='function'){ s.save(); return; } }catch(e){}
    try{ if(window.S&&typeof window.S.save==='function') window.S.save(); }catch(e){} }
  function recentText(){ var s=getS(); if(!s||!Array.isArray(s.turns)) return ''; return s.turns.slice(-RECENT).map(function(t){ return (t&&t.narrative||'')+' '+(t&&(t.playerText||t.player)||''); }).join(' '); }

  // ---- 注入 ----
  function buildBlock(){
    if(off()) return '';
    var cards=getCards(); if(!cards.length) return '';
    var rt=recentText();
    var lines=[];
    cards.forEach(function(c){
      if(!c||!c.entry||!String(c.entry).trim()) return;
      var trig=Array.isArray(c.triggers)?c.triggers:String(c.triggers||'').split(/[,、\s]+/);
      var hit=c.always || trig.some(function(t){ t=String(t||'').trim(); return t && rt.indexOf(t)>=0; });
      if(hit) lines.push('■ '+(c.name||'無題')+(c.always?'（常時）':'')+'：'+String(c.entry).trim());
    });
    if(!lines.length) return '';
    return '\n\n【設定カード（常に効く確定設定・事典。参照用。本文に説明書きを混ぜない）】\n'+lines.join('\n');
  }
  function ext(ctx){
    try{ if(ctx&&typeof ctx.sys==='string'){ if(ctx.sys.indexOf(MARK)>=0) return ctx.sys; var b=buildBlock(); if(b) return ctx.sys+b; } }catch(e){}
    return ctx?ctx.sys:undefined;
  }
  ext.__v292Dfix313=true;
  function install(){
    var P=window.Planner||(typeof Planner!=='undefined'?Planner:null);
    if(!P) return false; if(!Array.isArray(P._extensions)) P._extensions=[];
    for(var i=P._extensions.length-1;i>=0;i--){ if(P._extensions[i]&&P._extensions[i].__v292Dfix313) P._extensions.splice(i,1); }
    P._extensions.push(ext);
    return true;
  }
  install(); try{ setInterval(install, 2500); }catch(e){}

  // ---- UI ----
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function ensureStyles(){
    if(document.getElementById('v313-style')) return;
    var css=[
      '.v313-modal{width:min(820px,94vw);max-height:88vh;overflow:auto}',
      '.v313-row{border:1px solid var(--border,rgba(139,118,240,.25));border-radius:10px;padding:12px;margin-bottom:12px;background:var(--bg,#09090f)}',
      '.v313-row .v313-top{display:flex;gap:8px;align-items:center;margin-bottom:8px}',
      '.v313-row input[type=text]{flex:1;background:var(--bg,#09090f);color:var(--tx,#e0dcf0);border:1px solid var(--border);border-radius:6px;padding:6px 9px;font-size:13px;font-family:inherit}',
      '.v313-row textarea{width:100%;min-height:54px;background:var(--bg,#09090f);color:var(--tx,#e0dcf0);border:1px solid var(--border);border-radius:6px;padding:6px 9px;font-size:13px;font-family:inherit;box-sizing:border-box;resize:vertical}',
      '.v313-lab{font-size:11px;color:var(--dim,#888);margin:6px 0 3px}',
      '.v313-always{display:flex;align-items:center;gap:5px;font-size:12px;color:var(--acc,#a78bfa);white-space:nowrap;cursor:pointer}',
      '.v313-del{background:transparent;border:1px solid rgba(224,96,96,.4);color:var(--err,#e06060);border-radius:6px;padding:5px 9px;font-size:12px;cursor:pointer}',
      '.v313-add{background:var(--acc,#8b76f0);color:#fff;border:none;border-radius:8px;padding:9px 16px;font-weight:700;font-size:13px;cursor:pointer}',
      '.v313-hint{font-size:11.5px;color:var(--dim,#888);line-height:1.7;margin:4px 0 12px}',
      '.v313-empty{color:var(--dim,#888);font-size:13px;padding:18px 0;text-align:center}'
    ].join('');
    var st=document.createElement('style'); st.id='v313-style'; st.textContent=css; document.head.appendChild(st);
  }
  function rowHtml(c,i){
    var trig=Array.isArray(c.triggers)?c.triggers.join(', '):(c.triggers||'');
    return '<div class="v313-row" data-i="'+i+'">'+
      '<div class="v313-top">'+
        '<input type="text" data-f="name" placeholder="名前（例: 前任者ハル）" value="'+esc(c.name||'')+'">'+
        '<label class="v313-always"><input type="checkbox" data-f="always"'+(c.always?' checked':'')+'> 常時</label>'+
        '<button class="v313-del" data-del="'+i+'">削除</button>'+
      '</div>'+
      '<div class="v313-lab">トリガー語（カンマ区切り・常時ONなら不要）</div>'+
      '<input type="text" data-f="triggers" placeholder="例: ハル, 前任者, 灯" value="'+esc(trig)+'">'+
      '<div class="v313-lab">内容（確定設定・事典として常に効かせたい事実）</div>'+
      '<textarea data-f="entry" placeholder="例: 前任灯台守ハルは15年前に岩礁で死亡。その霊が霧の夜に灯室に現れる。">'+esc(c.entry||'')+'</textarea>'+
    '</div>';
  }
  function render(modal){
    var cards=getCards();
    var html=['<h2>🗂 設定カード <button class="v30-close" id="v313-x">×</button></h2>'];
    html.push('<div class="v313-hint">AIに常に効かせたい確定設定やキャラ事典を書けます。<b>常時</b>＝毎ターン必ず注入（世界ルール・誰かの死・重大な因果向き）。<b>トリガー語</b>＝その語が直近の話に出た時だけ注入（脇役・場所など）。物語は要約で薄れても、ここに書いた事実は消えません。</div>');
    if(!cards.length) html.push('<div class="v313-empty">まだカードがありません。「＋カードを追加」から作成してください。</div>');
    else cards.forEach(function(c,i){ html.push(rowHtml(c,i)); });
    html.push('<div style="margin-top:10px"><button class="v313-add" id="v313-add">＋ カードを追加</button></div>');
    modal.innerHTML=html.join('');
    bind(modal);
  }
  function bind(modal){
    var x=modal.querySelector('#v313-x'); if(x) x.addEventListener('click', close);
    var add=modal.querySelector('#v313-add'); if(add) add.addEventListener('click', function(){ getCards().push({name:'',triggers:[],entry:'',always:false}); persist(); render(modal); });
    modal.addEventListener('input', function(e){
      var t=e.target, row=t.closest&&t.closest('.v313-row'); if(!row) return;
      var i=+row.getAttribute('data-i'), f=t.getAttribute('data-f'), cards=getCards(), c=cards[i]; if(!c) return;
      if(f==='name') c.name=t.value;
      else if(f==='entry') c.entry=t.value;
      else if(f==='triggers') c.triggers=t.value.split(/[,、]+/).map(function(x){return x.trim();}).filter(Boolean);
      else if(f==='always') c.always=t.checked;
      persist();
    });
    modal.addEventListener('click', function(e){
      var d=e.target.getAttribute&&e.target.getAttribute('data-del'); if(d==null) return;
      var cards=getCards(); cards.splice(+d,1); persist(); render(modal);
    });
  }
  function close(){ var ov=document.getElementById('v313-overlay'); if(ov&&ov.parentNode) ov.parentNode.removeChild(ov); }
  function open(){
    close(); ensureStyles();
    var ov=document.createElement('div'); ov.className='v30-overlay'; ov.id='v313-overlay';
    ov.addEventListener('click', function(e){ if(e.target===ov) close(); });
    var modal=document.createElement('div'); modal.className='v30-modal v313-modal';
    ov.appendChild(modal); document.body.appendChild(ov);
    render(modal);
  }
  window.__v292Dfix313api={ open:open, buildBlock:buildBlock, getCards:getCards };

  // ---- トップバーにボタン ----
  function topbarAnchor(){
    // 最優先=📁セーブ(v30-topbar-btn)。無ければ可視トップバー(y<70)の「設定」「キャラ」ボタン。
    var a=document.getElementById('v30-topbar-btn');
    if(a&&a.getBoundingClientRect().width>0) return a;
    var btns=document.querySelectorAll('button');
    for(var i=0;i<btns.length;i++){ var b=btns[i],r=b.getBoundingClientRect();
      if(r.top<70&&r.width>0&&/設定|キャラ/.test(b.textContent||'')) return b; }
    return null;
  }
  function ensureBtn(){
    var anchor=topbarAnchor(); if(!anchor||!anchor.parentNode) return;
    var b=document.getElementById('v313-btn');
    if(b){ // 既存=正しい場所(アンカーと同じ親)に居なければ移動
      if(b.parentNode!==anchor.parentNode){ try{ anchor.parentNode.insertBefore(b, anchor.nextSibling); }catch(e){} }
      return;
    }
    b=document.createElement('button'); b.id='v313-btn'; b.textContent='🗂 カード';
    b.className=anchor.className.indexOf('v30-topbar-btn')>=0?'v30-topbar-btn':(anchor.className||'top-btn');
    b.title='設定カード（トリガー式の確定設定・事典）';
    b.addEventListener('click', open);
    anchor.parentNode.insertBefore(b, anchor.nextSibling);
  }
  try{ setInterval(ensureBtn, 1500); }catch(e){} ensureBtn();

  try{ console.log(TAG,'loaded'); }catch(e){}
})();
