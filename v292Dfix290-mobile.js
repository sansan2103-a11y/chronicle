// =====================================================================
// Chronicle TRPG - v292Dfix290: スマホ(狭幅)で会話ログ/展開描写を読みやすく
// ---------------------------------------------------------------------
// おしんFB「iPhoneだと会話ログと展開の描写がちょっとしか入らない」。
// 原因: content-cols が常に横並び50/50 → スマホ幅では各カラムが画面半分(約190px)
//   で極端に狭く、1行に少ししか入らない。
// 対策: @media(max-width:600px)で2カラムを縦積みにし、各カラムを全幅で表示。
//   会話ログ=画面高の32vh、展開描写=残り全部(主役なので大きく)。
//   トップバー/入力欄/ボタンの余白も圧縮して本文領域を最大化。
//   #inp は font-size:16px(iOS Safariのフォーカス時自動ズーム防止)。
// PC(幅>600px)には一切影響しない=回帰なし。OFF: localStorage v292MobileUiOff='1'
// =====================================================================
(function(){
  'use strict';
  var TAG = '[v292Dfix290:mobile]';
  if (window.__v292Dfix290) return;
  window.__v292Dfix290 = true;

  var CSS = [
    '@media (max-width: 600px){',
    '  #topbar{ padding:6px 8px !important; row-gap:4px !important; column-gap:6px !important; }',
    '  #topbar h1{ font-size:15px !important; }',
    '  #content-cols{ flex-direction:column !important; gap:6px !important; }',
    '  #content-cols > .dialogue-col{ flex:0 0 auto !important; height:32vh !important; min-height:0 !important; }',
    '  #content-cols > .narrative-col{ flex:1 1 auto !important; min-height:40vh !important; }',
    '  .col-hdr{ padding:4px 10px !important; font-size:11px !important; }',
    '  .col-hdr-sub{ font-size:10px !important; }',
    '  #story{ padding:10px 12px 6px !important; gap:16px !important; }',
    '  #story, .narr-block{ font-size:15px !important; line-height:1.75 !important; }',
    '  .narr-block{ padding:12px 30px 12px 14px !important; }',
    '  #composer{ padding:6px 8px !important; }',
    '  .mode-row{ gap:4px !important; }',
    '  .mode-row .mdbtn{ padding:8px 4px !important; font-size:12px !important; min-height:38px !important; }',
    '  #inp{ font-size:16px !important; }',
    '  #branches button, .branch-actions button{ font-size:12px !important; }',
    '}'
  ].join('\n');

  function inject(){
    try {
      if (localStorage.getItem('v292MobileUiOff') === '1'){ var ex=document.getElementById('v292Dfix290Style'); if(ex) ex.remove(); return; }
      var st = document.getElementById('v292Dfix290Style');
      if (!st){ st = document.createElement('style'); st.id = 'v292Dfix290Style'; (document.head||document.documentElement).appendChild(st); }
      if (st.textContent !== CSS) st.textContent = CSS;
    } catch(e){}
  }
  inject();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  try { setInterval(inject, 3000); } catch(e){}

  window.__v292Dfix290Mobile = { inject: inject, css: CSS };
  try { console.log(TAG, 'loaded'); } catch(e){}
})();
