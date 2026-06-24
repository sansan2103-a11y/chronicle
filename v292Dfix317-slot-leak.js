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
  function blobCfg(){ try{ var d=JSON.parse(localStorage.getItem(activeKey())||'{}'); return (d&&d.cfg)||null; }catch(e){ return null; } }

  // スロット毎セレクタ(S.cfgに保存)。切替時にDOM値が前スロットのまま残る＋blobにキーが無いと
  // 前スロット値が漏れる(Object.assign統合)ので、読み込んだスロットのcfgに合わせて両方直す。
  // 注: 📏長さ(v100_outputLen)・👻怪異(v292Dfix308Mode)はlocalStorageのグローバル設計→対象外。
  var SELS=[
    {dom:'v292-drama-sel',  key:'dramaLevel',    def:2, num:true},
    {dom:'v292-react-sel',  key:'reactionLevel', def:1, num:true},
    {dom:'v292-dlg-sel',    key:'dialogueLevel', def:1, num:true},
    {dom:'v292-avatar-sel', key:'aiAvatar',      def:0, num:true},
    {dom:'v292-style-sel',  key:'artStyle',      def:3, num:true},
    {dom:'v292-engine-sel', key:'engineMode',    def:1, num:true},
    {dom:'v292-tone-sel',   key:'toneKey',       def:'shizuka', num:false},
    {dom:'v292-model-sel',  key:'orModel',       def:null, num:false}
  ];
  function syncSelectors(){
    var s=getS(); var bc=blobCfg(); if(!s||!s.cfg) return;
    SELS.forEach(function(m){
      try{
        var el=document.getElementById(m.dom);
        var has=bc && Object.prototype.hasOwnProperty.call(bc, m.key);
        var v=has?bc[m.key]:m.def;
        if(m.dom==='v292-model-sel' && v==null){ v=(el&&el.options&&el.options.length)?el.options[0].value:(s.cfg.orModel||''); }
        // (1)S.cfgを読み込んだスロットに合わせる(blobに無いキーの前スロット漏れを断つ)
        if(v!=null) s.cfg[m.key]= m.num?(+v):v;
        // (2)ドロップダウンの表示を合わせる
        if(el && v!=null){ var sv=m.num?String(+v):String(v);
          // 該当optionがある時だけ設定(model等で未知値を防ぐ)
          var ok=false; for(var i=0;i<el.options.length;i++){ if(el.options[i].value===sv){ ok=true; break; } }
          if(ok) el.value=sv;
        }
      }catch(e){}
    });
  }

  function hashN(s){ var h=0,i; s=String(s||''); for(i=0;i<s.length;i++){ h=((h<<5)-h+s.charCodeAt(i))|0; } return h; }

  // 物語シグネチャ: スロットキー＋場所＋世界観メモ。プレイ中(ターン追加)では変わらず、
  // スロット切替/新規開始でだけ変わる。
  function sig(){
    var s=getS(); var sc=(s&&s.scene)||{};
    return activeKey()+'|'+(sc.loc||'')+'|'+hashN((sc.lore||'')+''+(sc.tone||''));
  }

  function onStoryChange(){
    if(off()) return;
    // (0) 展開の描写(#story)を現スロットのS.turnsで作り直す。
    //   ★loadSlotはUI.renderAllを呼ばず弱いtriggerReRenderだけなので、右の物語パネル(#story)が
    //   前スロットのまま残る(おしん報告)。UI.renderAllは#storyの.turnを全消去しS.turnsから再構築
    //   する(非additive=漏れない)。UIはconst非公開なのでeval経由で取得。
    try{ var _UI=(0,eval)('typeof UI!=="undefined"?UI:null'); if(_UI&&typeof _UI.renderAll==='function') _UI.renderAll(); }catch(e){}
    // (A) 会話ログをwipe → fix66(追加専用)が新物語で全カードを作り直せるようにする
    try{ var st=document.getElementById('dialogue-stream'); if(st) st.innerHTML=''; }catch(e){}
    // (B) S.sceneの迷子キーを掃除(前スロットのcards/memoryNote等の漏れ防止)
    try{ var s=getS(), bs=blobScene();
      if(s&&s.scene&&bs){ Object.keys(s.scene).forEach(function(k){ if(!(k in bs)) { try{ delete s.scene[k]; }catch(_){} } }); }
    }catch(e){}
    // (B2) スロット毎セレクタ(進行/反応/セリフ/アイコン/画風/エンジン/トーン/モデル)を
    //      読み込んだスロットのcfgに合わせて表示＋値を再同期(切替desync＆漏れの根治)
    try{ syncSelectors(); }catch(e){}
    // (C) 会話ログを現物語で作り直す。残った前物語のカードは常駐オブザーバ(下)が
    //   追加された瞬間に除去するので、ここでは初期再構築だけ行う。
    function rebuild(){
      try{ var st2=document.getElementById('dialogue-stream'); if(st2) st2.innerHTML=''; }catch(e){}
      try{
        if(typeof window.regenerateConvLogV66==='function') window.regenerateConvLogV66();
        else if(window.__v292Dfix66 && typeof window.__v292Dfix66.repair==='function') window.__v292Dfix66.repair();
      }catch(e){}
    }
    rebuild(); setTimeout(rebuild, 120);
    // 直後の保険掃除(setTimeoutはバックグラウンドでも動く。observerと二重で漏れを断つ)
    [0,200,500,1000,2000,3500].forEach(function(ms){ setTimeout(cleanForeign, ms); });
    try{ console.log(TAG,'story switch → rebuilt; scene/selectors synced; foreign-observer+sweeps active'); }catch(e){}
  }

  // ── 常駐: 他物語(前スロット等)の発言カードを「追加された瞬間」に除去する ──
  //   会話ログfix66はアバター温め用に遅延repairを予約しており、切替後も前スロットの
  //   stale snapshotからカードを散発的に再追加する。タイマー掃除では取り切れない窓が残る
  //   ため、MutationObserverで常時監視し、現在の物語(live S.cast＋S.turnsのnarrative)に
  //   居ない話者のカードを即除去する。liveを使うので生成直後の正規カードは誤除去しない。
  function liveAllowed(){
    var set={}, narr='';
    try{ var s=getS();
      if(s){
        var c=s.cast||{}; var h=c.hero||c.protagonist; if(h&&h.name) set[h.name]=1;
        (c.npcs||[]).forEach(function(n){ if(n&&n.name) set[n.name]=1; });
        if(Array.isArray(s.turns)) narr=s.turns.map(function(t){return String(t&&t.narrative||'');}).join('\n');
      } else {
        var d=JSON.parse(localStorage.getItem(activeKey())||'{}');
        if(d.cast){ var h2=(d.cast.protagonist||d.cast.hero||{}); if(h2.name) set[h2.name]=1; (d.cast.npcs||[]).forEach(function(n){if(n&&n.name)set[n.name]=1;}); }
        narr=(d.turns||[]).map(function(t){return String(t&&t.narrative||'');}).join('\n');
      }
    }catch(e){}
    return {set:set, narr:narr};
  }
  function cleanForeign(){
    if(off()) return;
    try{
      var st=document.getElementById('dialogue-stream'); if(!st) return;
      var al=liveAllowed(); var set=al.set, narr=al.narr;
      var cards=st.querySelectorAll('.v292-dlg-card');
      for(var i=0;i<cards.length;i++){ var nm=cards[i].querySelector('.dlg-name'); if(!nm) continue;
        var who=(nm.textContent||'').trim();
        if(!who||who==='主人公'||who==='???') continue;
        if(!set[who] && narr.indexOf(who)<0){ if(cards[i].parentNode) cards[i].parentNode.removeChild(cards[i]); }
      }
    }catch(e){}
  }
  var _obsArmed=false, _cfScheduled=false;
  function scheduleClean(){ if(_cfScheduled) return; _cfScheduled=true; setTimeout(function(){ _cfScheduled=false; cleanForeign(); }, 0); }
  function armObserver(){
    if(_obsArmed) return; var st=document.getElementById('dialogue-stream'); if(!st) return;
    try{ new MutationObserver(function(muts){ for(var i=0;i<muts.length;i++){ if(muts[i].addedNodes&&muts[i].addedNodes.length){ scheduleClean(); return; } } }).observe(st,{childList:true}); _obsArmed=true; }catch(e){}
  }
  try{ setInterval(armObserver, 1000); }catch(e){} armObserver();

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

  window.__v292Dfix317api={ sig:sig, onStoryChange:onStoryChange, syncSelectors:syncSelectors, cleanForeign:cleanForeign };
  try{ console.log(TAG,'loaded'); }catch(e){}
})();
