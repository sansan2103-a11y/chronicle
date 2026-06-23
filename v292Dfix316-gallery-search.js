// =====================================================================
// Chronicle TRPG - v292Dfix316: セーブ・ギャラリーの検索＆並べ替え
//   目的(おしんの「①から順に」の④): fix310カードギャラリー(セーブ管理)に
//     検索窓＋並べ替えを足す。セーブが増えても目的の物語をすぐ見つけられる。
//   設計(コア＆fix310不触): fix310が描く .v310-grid を監視し、上部にツールバーを一度だけ
//     差し込む。検索=カードの名前＋シーン文でフィルタ(非表示)。並べ替え=カード要素を
//     並び替え(既定/名前/ターン数/更新日時)。＋新規カードは常に末尾・常に表示。
//   OFF: localStorage v292Dfix316Off='1'
// =====================================================================
(function(){
  'use strict';
  var TAG='[v292Dfix316:gallery-search]';
  if(window.__v292Dfix316) return; window.__v292Dfix316=true;
  function off(){ try{ return localStorage.getItem('v292Dfix316Off')==='1'; }catch(e){ return false; } }

  function ensureStyles(){
    if(document.getElementById('v316-style')) return;
    var css=[
      '.v316-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:4px 0 12px}',
      '.v316-search{flex:1;min-width:160px;background:var(--bg,#09090f);color:var(--tx,#e0dcf0);border:1px solid var(--border,rgba(139,118,240,.3));border-radius:9px;padding:9px 13px;font-size:13px;font-family:inherit}',
      '.v316-search:focus{outline:none;border-color:var(--acc,#8b76f0)}',
      '.v316-sort{background:var(--bg,#09090f);color:var(--tx,#e0dcf0);border:1px solid var(--border,rgba(139,118,240,.3));border-radius:9px;padding:9px 11px;font-size:13px;font-family:inherit;cursor:pointer}',
      '.v316-count{font-size:12px;color:var(--dim,#9aa0c8);white-space:nowrap}',
      '.v316-none{grid-column:1/-1;text-align:center;color:var(--dim,#888);font-size:13px;padding:24px 0}'
    ].join('');
    var st=document.createElement('style'); st.id='v316-style'; st.textContent=css; document.head.appendChild(st);
  }

  function readMeta(){ try{ return JSON.parse(localStorage.getItem('chr6_slots_meta')||'[]')||[]; }catch(e){ return []; } }
  function cardName(card){ var i=card.querySelector('.v30-slot-name input, input[data-act="rename"]'); return i?String(i.value||''):''; }
  function cardText(card){ var m=card.querySelector('.v310-meta'); return (cardName(card)+' '+((m&&m.textContent)||'')).toLowerCase(); }
  function cardTurn(card){ var f=card.querySelector('.v310-foot'); var t=(f&&f.textContent)||''; var m=t.match(/(\d+)\s*ターン/); return m?parseInt(m[1],10):-1; }
  function cardUpdated(card){
    // 名前で chr6_slots_meta の updatedAt を引く(無ければ0)。タイブレーク用。
    var nm=cardName(card); var meta=readMeta();
    for(var i=0;i<meta.length;i++){ if(meta[i]&&meta[i].name===nm){ var u=meta[i].updatedAt; return u?(+new Date(u))||0:0; } }
    return 0;
  }

  function apply(grid){
    var bar=grid.__v316bar; if(!bar) return;
    var q=(bar.querySelector('.v316-search').value||'').trim().toLowerCase();
    var sort=bar.querySelector('.v316-sort').value;
    var cards=Array.prototype.slice.call(grid.querySelectorAll('.v310-card:not(.v310-newcard)'));
    var newcard=grid.querySelector('.v310-newcard');
    // フィルタ
    var shown=0;
    cards.forEach(function(c){ var hit=!q || cardText(c).indexOf(q)>=0; c.style.display=hit?'':'none'; if(hit) shown++; });
    // 並べ替え(表示中のみ意味があるが全体を並べる)
    if(sort!=='default'){
      cards.sort(function(a,b){
        if(sort==='name') return cardName(a).localeCompare(cardName(b),'ja');
        if(sort==='turn') return cardTurn(b)-cardTurn(a);
        if(sort==='updated') return cardUpdated(b)-cardUpdated(a);
        return 0;
      });
    } else {
      cards.sort(function(a,b){ return (a.__v316idx||0)-(b.__v316idx||0); });
    }
    cards.forEach(function(c){ grid.appendChild(c); });
    if(newcard) grid.appendChild(newcard); // 常に末尾
    // 件数表示 & 0件メッセージ
    var cnt=bar.querySelector('.v316-count'); if(cnt) cnt.textContent=shown+' / '+cards.length+' 件';
    var none=grid.querySelector('.v316-none');
    if(q && shown===0){ if(!none){ none=document.createElement('div'); none.className='v316-none'; none.textContent='「'+q+'」に一致する物語はありません'; grid.insertBefore(none, newcard||null); } }
    else if(none){ none.parentNode.removeChild(none); }
  }

  function injectBar(grid){
    if(grid.__v316bar && grid.__v316bar.parentNode) return;
    ensureStyles();
    // 元のDOM順を記憶(既定ソート用)
    Array.prototype.forEach.call(grid.querySelectorAll('.v310-card:not(.v310-newcard)'), function(c,i){ if(c.__v316idx==null) c.__v316idx=i; });
    var bar=document.createElement('div'); bar.className='v316-bar';
    bar.innerHTML='<input class="v316-search" type="text" placeholder="🔍 物語を検索（名前・場所・主人公）">'+
      '<select class="v316-sort">'+
        '<option value="default">並べ替え：既定</option>'+
        '<option value="updated">更新が新しい順</option>'+
        '<option value="turn">ターンが多い順</option>'+
        '<option value="name">名前順（あいうえお）</option>'+
      '</select>'+
      '<span class="v316-count"></span>';
    grid.parentNode.insertBefore(bar, grid);
    grid.__v316bar=bar;
    bar.querySelector('.v316-search').addEventListener('input', function(){ apply(grid); });
    bar.querySelector('.v316-sort').addEventListener('change', function(){ apply(grid); });
    apply(grid);
  }

  function scan(){
    if(off()) return;
    var ov=document.getElementById('v30-overlay'); if(!ov) return;
    var grid=ov.querySelector('.v310-grid'); if(!grid) return;
    // fix310がグリッドを作り直したら(barが外れていたら)再注入
    if(!grid.__v316bar || !grid.__v316bar.parentNode) injectBar(grid);
  }
  try{ new MutationObserver(function(){ try{ scan(); }catch(e){} }).observe(document.body||document.documentElement,{childList:true,subtree:true}); }catch(e){}
  try{ setInterval(scan, 600); }catch(e){}
  scan();

  window.__v292Dfix316api={ scan:scan, apply:apply };
  try{ console.log(TAG,'loaded'); }catch(e){}
})();
