/* v292Dfix270: トップバーUI整理。縦書き化(ラベルspanが1文字幅で折返し)を根治=ラベル横書き小キャプション化+コントロール統一+折返しレイアウト。
   displayには一切触れない(fix243の折りたたみ=CSS非表示+インラインstyle表示の機構を壊さないため)。OFF: localStorage v292TopbarUiOff='1' */
(function(){
  try { if (localStorage.getItem('v292TopbarUiOff') === '1') return; } catch(e){}
  if (document.getElementById('v270css')) return;
  var css = ''
  + '#topbar{flex-wrap:wrap;align-items:center;row-gap:6px;column-gap:10px;height:auto;min-height:0;padding:8px 14px;}'
  + '#topbar h1{white-space:nowrap;margin-right:2px;}'
  + '#topbar button{white-space:nowrap;}'
  + '#topbar span.v243-foldable{flex-direction:column;align-items:stretch;gap:2px;}'
  + '#topbar span.v243-foldable>span:first-child{width:auto;min-width:0;white-space:nowrap;font-size:10px;line-height:1.15;opacity:.62;letter-spacing:.4px;}'
  + '#topbar select{background:#15152a;color:#d6d7ee;border:1px solid #32324e;border-radius:7px;padding:3px 6px;font-size:12px;min-height:24px;cursor:pointer;}'
  + '#topbar select:hover{border-color:#56568c;}'
  + '#topbar select:focus{outline:none;border-color:#7a7ac0;}'
  + '#topbar .v30-topbar-btn,#topbar .top-btn,#topbar #v243-toggle,#topbar .v292Dfix145-charlist-btn{min-height:28px;padding:4px 10px;border-radius:8px;}'
  + '#topbar span.v243-foldable:has(#v292-drama-sel),#topbar span.v243-foldable:has(#v292-engine-sel){border-left:1px solid #2d2d49;padding-left:12px;}'
  /* ★★fix865 MOBILE_SMALL_TAP_TARGETS_TOPBAR (②C1 裁定 2026-09-16 / P2-1)
     mobile の topbar ボタンが 28〜29px しかなく指で押しにくい。
     ★この 1 行を **同じ stylesheet の最後**に足すだけ。上の min-height:28px と同一
     specificity だが後勝ちなので !important は要らない。
     ★padding では届かない: line-height:normal / font-size:13px で内容高さが約 17〜21px しかなく、
     padding 6+6 でも 29〜33px 止まりであることを live で実測した。
     ★max-width:640px なので PC / iPad（820・1440 で実測）は 1px も変わらない。
     ★DOM 変更 0 / semantics 変更 0。対象は元から 32px 未満だった 2 class だけで、
     #v243-toggle と .v292Dfix145-charlist-btn（元から 33px）には触れない。 */
  + '@media(max-width:640px){#topbar .v30-topbar-btn,#topbar .top-btn{min-height:32px;}}';
  var st = document.createElement('style'); st.id = 'v270css'; st.textContent = css;
  (document.head || document.documentElement).appendChild(st);
  try { console.log('[v292Dfix270] topbar ui armed'); } catch(e){}
})();
