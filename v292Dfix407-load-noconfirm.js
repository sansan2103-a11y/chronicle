// =====================================================================
// Chronicle TRPG - v292Dfix407: セーブ読込のconfirm廃止(即ロード)
//   背景(2026-07-10夜・おしん承認): セーブ管理のスロット切替クリックで「レンダラ凍結」
//     (前セッション2回再現)の真因は、v30コアが読込時に出す confirm() ネイティブダイアログ。
//     自動操作(Chrome MCP)や背面コンテキストではダイアログが不可視・応答不能となり、
//     メインスレッドがダイアログ待ちで永久ブロック=凍結に見える。本セッションで完全再現:
//     confirm素のまま→CDP "renderer frozen"・スクショもブロック / confirm自動承諾→正常完了。
//     回復がタブ/アプリ再起動なのはダイアログ破棄と一致。
//   方針(おしん哲学=confirm廃止・不可視の自動化、fix402と同型): 読込クリックの同一
//     ディスパッチtickだけ window.confirm を自動承諾に差し替える(コア不触・最小変更)。
//     切替前の現状はコアが必ず S.save() する+fix402クラウド同期+v14 fork保全があるため
//     確認ダイアログは不要。
//   対象: v310ギャラリーのカバークリック / セーブ管理内の data-act="load" ボタン。
//     削除系の confirm は残す(破壊的操作のため。メッセージ判定で読込のみ承諾)。
//   検証(2026-07-10実機E2E): 凍結していた同一シナリオ(素のconfirm+背面タブ+切替クリック)で
//     往復とも正常完了・confirm復元・データ整合(17ターン)を確認。
//   OFF: localStorage v292Dfix407Off='1'
// =====================================================================
(function(){
  'use strict';
  var TAG='[v292Dfix407:load-noconfirm]';
  if(window.__v292Dfix407) return; window.__v292Dfix407=true;

  function off(){ try{ return localStorage.getItem('v292Dfix407Off')==='1'; }catch(e){ return false; } }
  function isLoadClick(t){
    try{
      if(!t || !t.closest) return false;
      if(!document.getElementById('v30-overlay')) return false;   // セーブ管理が開いている時だけ
      if(t.closest('.v310-cover')) return true;                   // v310ギャラリーのカバー
      if(t.closest('[data-act="load"]')) return true;             // 読込ボタン(⋯メニュー内含む)
      return false;
    }catch(e){ return false; }
  }

  document.addEventListener('click', function(e){
    if(off()) return;
    if(!isLoadClick(e.target)) return;
    if(window.confirm && window.confirm.__f407) return;           // 二重差し替え回避
    var oc=window.confirm;
    var stub=function(msg){
      // 読込確認だけ自動承諾。同tickの他のconfirm(削除等)は素通し
      if(/読み込む|読込/.test(String(msg||''))) return true;
      return oc.apply(window, arguments);
    };
    stub.__f407=true;
    window.confirm=stub;
    setTimeout(function(){ if(window.confirm===stub) window.confirm=oc; }, 0); // 同tick終了後に復元
  }, true); // capture: コアのbubbleリスナーより先に走る

  try{ console.log(TAG,'loaded'); }catch(e){}
})();
