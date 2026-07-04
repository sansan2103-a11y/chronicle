// =====================================================================
// Chronicle TRPG - v292Dfix372: 主人公/NPC性別ラジオの消失を自動復元
// 背景(2026-07-04 おしん):「主人公の性別選択できなくなってる」。
//   真因= features.js gender_radio(v108g)は UI.openSettings の150/500msタイマーと
//   _renderNpcList/addNpc ラップでしか注入されない。設定オープン後に別モジュールが
//   キャラ欄を再構築（おまかせ自動オープン等の非同期fill）すると .v292-grow 行が
//   消えたまま再挿入トリガーが無い（fix351メモの「再現取れずのレース」が顕在化）。
// 対策: 設定(settingsOv)が可視の間 1秒ポーリングし、#cfgHName があるのに
//   input[name="v108g_hero"] が無ければ UI._renderNpcList() を呼ぶ
//   （features.jsのラップ経由で injectOnce が走り hero+NPC 両方の行が復元される）。
//   ループ防止: 復元試行は設定オープン毎に最大3回。設定が閉じたらカウンタリセット。
// OFF: localStorage v292Dfix372Off='1'
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix372) return; window.__v292Dfix372 = true;
  var TAG = '[v292Dfix372:genderRadioGuard]';
  function off(){ try{ return localStorage.getItem('v292Dfix372Off')==='1'; }catch(e){ return false; } }
  var tries = 0;
  function tick(){
    if (off()) return;
    try {
      var ov = document.getElementById('settingsOv');
      var visible = ov && getComputedStyle(ov).display !== 'none';
      if (!visible){ tries = 0; return; }
      if (!ov.querySelector('#cfgHName')) return;
      if (ov.querySelector('input[name="v108g_hero"]')) return;
      if (tries >= 3) return;
      tries++;
      var UI = window.UI || (0,eval)('UI');
      if (UI && typeof UI._renderNpcList === 'function'){
        UI._renderNpcList();
        try{ console.log(TAG, 'gender radios restored (try ' + tries + ')'); }catch(_){}
      }
    } catch(e){}
  }
  setInterval(tick, 1000);
  try{ console.log(TAG, 'loaded', off()?'OFF':'ON'); }catch(_){}
})();
