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
  /* ■fix783(2026-09-01) MULTI_TAB_CROSS_STORY_CFG_CONTAMINATION
     真因: 共有ポインタ chr6_active_slot(= __chr6Key()) は**全タブで1個**。別タブが物語を
       開いた瞬間このタブの key 解決が相手の story を指し、S.cfg の8セレクタ / S.scene の自story固有キー削除 が
       別 story へ着弾/汚染された(実測: ct_fix783_multitab.mjs R群)。
     対処: key 解決を fix694 document authority(__chronicleDocumentStoryKey)へ固定する
       (fix307f と同じ作法)。authority 無し document(home 等)では null=**読まない/書かない**。
     kill: localStorage v292Dfix783Off='1' → 全ファイル同時に旧 __chr6Key() 挙動へ戻る。 */
  function f783Off(){ try{ return localStorage.getItem('v292Dfix783Off')==='1'; }catch(e){ return false; } }
  function activeKey(){
    if(!f783Off()){
      try{ var dk=window.__chronicleDocumentStoryKey; if(typeof dk==='string'&&dk) return dk; }catch(e){}
      return null;                                   /* authority 無し = 触らない */
    }
    try{ return (typeof window.__chr6Key==='function')?window.__chr6Key():'chr6'; }catch(e){ return 'chr6'; }
  }
  function blobScene(){ try{ var _k=activeKey(); if(!_k) return null; var d=JSON.parse(localStorage.getItem(_k)||'{}'); return (d&&d.scene)||null; }catch(e){ return null; } }
  function blobCfg(){ try{ var _k=activeKey(); if(!_k) return null; var d=JSON.parse(localStorage.getItem(_k)||'{}'); return (d&&d.cfg)||null; }catch(e){ return null; } }

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
    if(activeKey()===null) return;                  /* ■fix783: authority 無し document は no-op */
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
    return (activeKey()||'')+'|'+(sc.loc||'')+'|'+hashN((sc.lore||'')+''+(sc.tone||''));
  }

  var _lastSwitchT=0;
  function onStoryChange(){
    if(off()) return;
    if(activeKey()===null) return;                  /* ■fix783: authority 無し document は no-op */
    _lastSwitchT=Date.now();
    // (0) 展開の描写(#story)を現スロットのS.turnsで作り直す。
    //   ★loadSlotはUI.renderAllを呼ばず弱いtriggerReRenderだけなので、右の物語パネル(#story)が
    //   前スロットのまま残る(おしん報告)。UI.renderAllは#storyの.turnを全消去しS.turnsから再構築
    //   する(非additive=漏れない)。UIはconst非公開なのでeval経由で取得。
    //   ★単発だと切替直後のレース(前スロット表示で固着)に負けるので、renderAllは現S.turnsから
    //   毎回作り直す冪等処理＝複数passで確実に現物語へ収束させる(setTimeout=背景タブでも動く)。
    function _renderStory(){ try{ var _UI=(0,eval)('typeof UI!=="undefined"?UI:null'); if(_UI&&typeof _UI.renderAll==='function') _UI.renderAll(); }catch(e){} }
    _renderStory(); // ★まず同期で即再描画(setTimeout/rAFのタイマー絞りに依存しない)
    [120,350,800,1500,2800].forEach(function(ms){ setTimeout(_renderStory, ms); }); // 念のため追走
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
        var _k=activeKey(); var d=_k?(JSON.parse(localStorage.getItem(_k)||'{}')):{};
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
  // ★会話ログのMutationObserverは廃止(fix66との綱引きで高速点滅した)。350msポーリングのcleanForeignで掃除する。

  // ── 常駐: #story が S.turns とズレた瞬間に作り直す(切替レースの収束を即時化) ──
  // ★#storyのMutationObserverも廃止(renderAll→fix66 hook→再描画の再帰ループで点滅源だった)。350msポーリングのensureStoryで収束させる。

  // ── 常駐: 展開の描写(#story)が現スロットのS.turnsと食い違っていたら作り直す ──
  //   loadSlotのrenderAllレース(切替直後に前スロット表示で固着)を恒久的に自己修復する。
  //   S.turnsは常に正しい(実機確認済)ので、#storyの.turn数＋先頭ターン本文と突き合わせ、
  //   ずれていればUI.renderAllで現物語に収束させる(冪等)。プレイ中は一致するので空振り。
  function storyMatches(){
    try{
      var s=getS(); if(!s||!Array.isArray(s.turns)) return true;
      var story=document.getElementById('story'); if(!story) return true;
      var turns=story.querySelectorAll(':scope > .turn');
      if(turns.length!==s.turns.length) return false;
      if(s.turns.length===0) return true;
      var fn=String((s.turns[0]&&s.turns[0].narrative)||'').replace(/<[^>]*>/g,'').replace(/\s+/g,'').slice(0,14);
      if(!fn) return true;
      var got=(turns[0].textContent||'').replace(/\s+/g,'');
      return got.indexOf(fn)>=0;
    }catch(e){ return true; }
  }
  var _renderingStory=false;
  function ensureStory(){
    if(off()||_renderingStory) return;
    if(!storyMatches()){ _renderingStory=true; try{ var _UI=(0,eval)('typeof UI!=="undefined"?UI:null'); if(_UI&&typeof _UI.renderAll==='function') _UI.renderAll(); }catch(e){} _renderingStory=false; }
  }

  var last=null, primed=false;
  function check(){
    if(off()) return;
    if(activeKey()===null) return;                  /* ■fix783: authority 無し document では監視ごと止める */
    var s=getS(); if(!s||!s.scene) return;   // 状態未確立なら待つ
    var cur=sig();
    if(!primed){ last=cur; primed=true; return; }  // 初回は基準化のみ(誤wipe防止)
    if(cur!==last){ last=cur; onStoryChange(); }
    try{ ensureStory(); }catch(e){}   // 展開の描写の食い違いを常時自己修復(切替レース対策・350ms毎)
    try{ if(Date.now()-_lastSwitchT < 8000) cleanForeign(); }catch(e){}  // 会話ログの他物語カード掃除は切替後~8sだけ(常駐observer廃止=点滅しない/プレイ中は不発)
  }
  try{ setInterval(check, 350); }catch(e){}
  check();

  window.__v292Dfix317api={ sig:sig, onStoryChange:onStoryChange, syncSelectors:syncSelectors, cleanForeign:cleanForeign, ensureStory:ensureStory, storyMatches:storyMatches };
  try{ console.log(TAG,'loaded'); }catch(e){}
})();
