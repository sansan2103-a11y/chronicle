// =====================================================================
// Chronicle TRPG - v292Dfix374: 新規物語の既定画風から「闇アニメ(初代)=7」を外す
// 背景(2026-07-04 おしん承認):
//   画風7は fix349 の旧式(外見先頭+スタイル語末尾=@TAIL)を意図的に完全再現した
//   「思い出再現モード」で、構造的に一枚ごとに画風がブレる(Fluxは前方の語が最強)。
//   新規slotがcfg継承等で7を引き継ぐと、ライトユーザーは初回生成から混在を見る。
// 対策:
//   ① 新規物語(turns===0)で artStyle===7 かつ「ユーザーが自分で選んだ」フラグが
//      無ければ、統一エンジン系の 6(闇アニメ) に自動置換+保存(起動+2sポーリング)。
//   ② 画風セレクタのchangeを捕捉し、スロット別フラグ
//      v292Dfix374Chosen_<slotKey> を立てる → 以後そのslotは絶対に上書きしない。
//      (フラグはslot保存データの外=cfg継承で新slotに漏れない)
//   ③ ターン進行済みslot(turns>0)は一切触らない(廃校slot等の意図的な7を保護)。
//   セレクタ選択肢から7は消さない(選びたい人はいつでも選べる)。
// OFF: localStorage v292Dfix374Off='1'
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix374) return; window.__v292Dfix374 = true;
  var TAG = '[v292Dfix374:defaultStyleGuard]';
  var LEGACY = 7, UNIFIED = 6;
  function off(){ try{ return localStorage.getItem('v292Dfix374Off')==='1'; }catch(e){ return false; } }
  function getS(){ try{ if (window.S) return window.S; return (0,eval)('S'); }catch(e){ return null; } }
  /* ■fix783(2026-09-01) MULTI_TAB_CROSS_STORY_CFG_CONTAMINATION
     真因: 共有ポインタ chr6_active_slot(= __chr6Key()) は**全タブで1個**。別タブが物語を
       開いた瞬間このタブの key 解決が相手の story を指し、画風「本人が選んだ」記録 v292Dfix374Chosen_<key> が
       別 story へ着弾/汚染された(実測: ct_fix783_multitab.mjs R群)。
     対処: key 解決を fix694 document authority(__chronicleDocumentStoryKey)へ固定する
       (fix307f と同じ作法)。authority 無し document(home 等)では null=**読まない/書かない**。
     kill: localStorage v292Dfix783Off='1' → 全ファイル同時に旧 __chr6Key() 挙動へ戻る。 */
  function f783Off(){ try{ return localStorage.getItem('v292Dfix783Off')==='1'; }catch(e){ return false; } }
  function slotKey(){
    if(!f783Off()){
      try{ var dk=window.__chronicleDocumentStoryKey; if(typeof dk==='string'&&dk) return dk; }catch(e){}
      return null;                                   /* authority 無し = 触らない */
    }
    try{ return (window.__chr6Key ? window.__chr6Key() : 'chr6') || 'chr6'; }catch(e){ return 'chr6'; }
  }
  function chosen(){ try{ var k=slotKey(); if(k===null) return true; /* ■fix783: 判定できない=触らない側(既存の catch と同じ fail-safe) */
      return localStorage.getItem('v292Dfix374Chosen_'+k)==='1'; }catch(e){ return true; } }
  function markChosen(){ try{ var k=slotKey(); if(k===null) return; localStorage.setItem('v292Dfix374Chosen_'+k,'1'); }catch(e){} }
  function isStyleSelect(el){
    try{
      if (!el || el.tagName!=='SELECT') return false;
      var os=el.options; if(!os||os.length<6) return false;
      for(var i=0;i<os.length;i++){ if(/闇アニメ/.test(os[i].text)) return true; }
      return false;
    }catch(e){ return false; }
  }
  document.addEventListener('change', function(ev){
    try{ if (isStyleSelect(ev.target)) markChosen(); }catch(e){}
  }, true);
  function tick(){
    if (off()) return;
    try {
      var S = getS(); if (!S || !S.cfg || !Array.isArray(S.turns)) return;
      if (S.turns.length !== 0) return;
      if (Number(S.cfg.artStyle) !== LEGACY) return;
      if (chosen()) return;
      S.cfg.artStyle = UNIFIED;
      if (typeof S.save === 'function') (typeof S.saveC==='function'?S.saveC('fix374.tick'):S.save());
      try {
        var sels = document.querySelectorAll('select');
        for (var i=0;i<sels.length;i++){
          if (isStyleSelect(sels[i]) && Number(sels[i].value)===LEGACY) sels[i].value = String(UNIFIED);
        }
      } catch(e){}
      try{ console.log(TAG, 'artStyle 7 -> 6 on fresh story'); }catch(_){}
    } catch(e){}
  }
  /* v2: boot時のslot切替ウィンドウを避け、6秒後からチェック開始 */
  setTimeout(function(){ tick(); setInterval(tick, 2000); }, 6000);
  try{ console.log(TAG, 'loaded', off()?'OFF':'ON'); }catch(_){}
})();
