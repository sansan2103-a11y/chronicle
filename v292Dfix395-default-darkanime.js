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
  function slotKey(){ try{ return (window.__chr6Key ? window.__chr6Key() : 'chr6') || 'chr6'; }catch(e){ return 'chr6'; } }
  function chosen(){ try{ return localStorage.getItem('v292Dfix374Chosen_'+slotKey())==='1'; }catch(e){ return true; } }
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
      if (typeof S.save === 'function') S.save();
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
