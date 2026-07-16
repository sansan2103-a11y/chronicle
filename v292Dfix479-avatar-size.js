// =====================================================================
// v292Dfix479: 会話ログのアバター拡大（2026-07-16・おしん指定）
//   72px円形 → PC 96px / モバイル(<=640px) 80px。円形(border-radius)は既存を継承。
//   方式: <style>タグ注入のみ（要素・classListには一切触らない=fix329教訓に抵触しない）。
//   OFF: localStorage v292Dfix479Off='1' （反映はリロード後）
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix479) return; window.__v292Dfix479 = true;
  var TAG = '[v292Dfix479:avatar-size]';
  function off(){ try { return localStorage.getItem('v292Dfix479Off') === '1'; } catch(e){ return false; } }
  try {
    if (off()){ console.log(TAG, 'disabled by v292Dfix479Off'); return; }
    if (document.getElementById('v292Dfix479Style')) return;
    var st = document.createElement('style');
    st.id = 'v292Dfix479Style';
    st.textContent =
      '.v292-dlg-card .dlg-av{width:96px !important;height:96px !important;}' +
      '.v292-dlg-card .dlg-av img{width:96px !important;height:96px !important;}' +
      '@media (max-width:640px){' +
        '.v292-dlg-card .dlg-av{width:80px !important;height:80px !important;}' +
        '.v292-dlg-card .dlg-av img{width:80px !important;height:80px !important;}' +
      '}';
    (document.head || document.documentElement).appendChild(st);
    console.log(TAG, 'armed (PC 96px / mobile 80px)');
  } catch(e){}
})();
