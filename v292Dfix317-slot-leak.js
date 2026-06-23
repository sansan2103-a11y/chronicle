// =====================================================================
// Chronicle TRPG - v292Dfix317: セーブ切替で前の物語が漏れる不具合を根治
//   症状(おしん報告/実機スクショ): スロットを読み込むと、展開の描写は新しい物語に
//     変わるのに、会話ログ(左)が前の物語のキャラ(カエデ/ミリア等)を出し続ける。
//   真因(実コード調査):
//     ① 会話ログfix66 repair()は「追加専用」(既存カードをDOMで差分して足すだけ・消さない)。
//     ② loadSlot()は #dialogue-stream を一度も消さない＋再描画は弱いtriggerReRender経由で
//        会話ログを作り直さない → 前スロットのカードがDOMに残留。
//     ③ おまけにloadSlotは Object.assign(S.scene, data.scene) で“統合”するため、前スロットに
//        在って新スロットに無いキー(私のfix313 cards / fix314 memoryNote 等)が消えずに漏れる。
//   修正(コア&fix66不触・全読込経路を捕捉する独立ディテクタ):
//     物語シグネチャ(アクティブスロットキー＋場所＋世界観メモのハッシュ)を監視し、
//     変化したら(=別の物語に切替)→(A)#dialogue-streamをwipe (B)S.sceneの“迷子キー”を
//     スロット保存値に合わせて掃除 (C)fix66 repairを呼び会話ログを新物語で作り直す。
//   OFF: localStorage v292Dfix317Off='1'
// =====================================================================
(function(){
  'use strict';
  var TAG='[v292Dfix317:slot-leak]';
  if(window.__v292Dfix317) return; window.__v292Dfix317=true;

  function off(){ try{ return localStorage.getItem('v292Dfix317Off')==='1'; }catch(e){ return false; } }
  function getS(){ try{ return window.S||(typeof S!=='undefined'?S:null); }catch(e){ return null; } }
  function activeKey(){ try{ return (typeof window.__chr6Key==='function')?window.__chr6Key():'chr6'; }catch(e){ return 'chr6'; } }
  function blobScene(){ try{ var d=JSON.parse(localStorage.getItem(activeKey())||'{}'); return (d&&d.scene)||null; }catch(e){ return null; } }
  function hashN(s){ var h=0,i; s=String(s||''); for(i=0;i<s.length;i++){ h=((h<<5)-h+s.charCodeAt(i))|0; } return h; }

  // 物語シグネチャ: スロットキー＋場所＋世界観メモ。プレイ中(ターン追加)では変わらず、
  // スロット切替/新規開始でだけ変わる。
  function sig(){
    var s=getS(); var sc=(s&&s.scene)||{};
    return activeKey()+'|'+(sc.loc||'')+'|'+hashN((sc.lore||'')+''+(sc.tone||''));
  }

  function onStoryChange(){
    if(off()) return;
    // (A) 会話ログをwipe → fix66(追加専用)が新物語で全カードを作り直せるようにする
    try{ var st=document.getElementById('dialogue-stream'); if(st) st.innerHTML=''; }catch(e){}
    // (B) S.sceneの迷子キーを掃除(前スロットのcards/memoryNote等の漏れ防止)
    try{ var s=getS(), bs=blobScene();
      if(s&&s.scene&&bs){ Object.keys(s.scene).forEach(function(k){ if(!(k in bs)) { try{ delete s.scene[k]; }catch(_){} } }); }
    }catch(e){}
    // (C) fix66に会話ログを再構築させる
    setTimeout(function(){
      try{
        if(typeof window.regenerateConvLogV66==='function') window.regenerateConvLogV66();
        else if(window.__v292Dfix66 && typeof window.__v292Dfix66.repair==='function') window.__v292Dfix66.repair();
      }catch(e){}
    }, 60);
    try{ console.log(TAG,'story switch detected → conv-log wiped & scene cleaned'); }catch(e){}
  }

  var last=null, primed=false;
  function check(){
    if(off()) return;
    var s=getS(); if(!s||!s.scene) return;   // 状態未確立なら待つ
    var cur=sig();
    if(!primed){ last=cur; primed=true; return; }  // 初回は基準化のみ(誤wipe防止)
    if(cur!==last){ last=cur; onStoryChange(); }
  }
  try{ setInterval(check, 600); }catch(e){}
  check();

  window.__v292Dfix317api={ sig:sig, onStoryChange:onStoryChange };
  try{ console.log(TAG,'loaded'); }catch(e){}
})();
