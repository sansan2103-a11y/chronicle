// =====================================================================
// Chronicle TRPG - v292Dfix395: 新規物語の既定画風を「闇アニメ(6)」にする
// おしん依頼(2026-07-06): 最初にセレクタが選んでいる画風を闇アニメにしたい
//   （現状は既定がダーク幻想=3。※エンジン上は6も3もdarkfantasyで中身は同じ＝ラベル既定の変更）。
// 方式(fix374と同じ実証パターン・非破壊):
//   ・新規物語(turns===0)で、ユーザーが画風を自分で選んでいなければ
//     （fix374の chosen フラグ v292Dfix374Chosen_<slotKey> を流用）、
//     既定(3=ダーク幻想) または 未設定 のときだけ 6(闇アニメ) へ置換+保存。
//   ・進行済みslot(turns>0)・本人が選んだ画風・6以外の明示値は一切触らない。
//   ・changeは発火させない＝再生成コストなし（表示セレクタの値だけ同期）。
// OFF: localStorage v292Dfix395Off='1'
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix395) return; window.__v292Dfix395 = true;
  var TAG = '[v292Dfix395:default-darkanime]';
  var TARGET = 6, DEFAULT = 3;
  function off(){ try{ return localStorage.getItem('v292Dfix395Off')==='1'; }catch(e){ return false; } }
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
  function isStyleSelect(el){
    try{
      if (!el || el.tagName!=='SELECT') return false;
      var os=el.options; if(!os||os.length<6) return false;
      for(var i=0;i<os.length;i++){ if(/闇アニメ/.test(os[i].text)) return true; }
      return false;
    }catch(e){ return false; }
  }
  function tick(){
    if (off()) return;
    try {
      var S = getS(); if (!S || !S.cfg || !Array.isArray(S.turns)) return;
      if (S.turns.length !== 0) return;          // 進行済みは不触
      if (chosen()) return;                      // 本人が選んだら尊重
      var cur = S.cfg.artStyle;
      if (cur != null && Number(cur) !== DEFAULT) return;  // 既定(3)/未設定の時だけ
      if (Number(cur) === TARGET) return;
      S.cfg.artStyle = TARGET;
      if (typeof S.save === 'function') (typeof S.saveC==='function'?S.saveC('fix395.tick'):S.save());
      try {
        var sels = document.querySelectorAll('select');
        for (var i=0;i<sels.length;i++){
          if (isStyleSelect(sels[i]) && (sels[i].value==='' || Number(sels[i].value)===DEFAULT)) sels[i].value = String(TARGET);
        }
      } catch(e){}
      try{ console.log(TAG, 'default artStyle -> 6(闇アニメ) on fresh story'); }catch(_){}
    } catch(e){}
  }
  tick(); setInterval(tick, 2000);
  try{ console.log(TAG, 'loaded', off()?'OFF':'ON'); }catch(_){}
})();
