// =====================================================================
// Chronicle TRPG - v292Dfix460: セーブ管理の「上の段が見えない」を根治
// ---------------------------------------------------------------------
// ★症状（おしん報告・2026-07-13）: セーブ管理を開くと、スロット一覧の**上の段だけ**が
//   細い帯に潰れて中身が見えない（下の段は正常）。
//
// ★真因（実測）:
//   ・`.v310-grid` は modal 内の **flex子（flex:1）** で、高さが親に制限される（実測 308px）。
//   ・`.v310-card` は `overflow:hidden` を持つため、**CSS Grid 上での最小サイズが 0** になる。
//   ・スロットが増えて **2段** になると、グリッドの高さが足りず、
//     auto トラックが min-content(=0) まで**縮められる** → 1段目が 31px に潰れた。
//     （2段目が無事だったのは「+ 新しい物語」カードに min-height:230px があり、
//       その段だけ縮まなかったため。＝ 犯人の証拠）
//   ・スロットが4件以下（1段）のうちは起きない。**スロットが増えて初めて出る**バグ。
//
// ★修正: カードに min-height を与えてトラックが潰れないようにする。
//   グリッドは既に `overflow:auto` なので、以後は**素直にスクロール**する。
//   （高さは実測: カバー186 + 本文124 = 310 → 余裕をみて 320px）
//
// 冪等: window.__v292Dfix460
// OFF : localStorage.v292Dfix460Off = '1'
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix460) return;
  window.__v292Dfix460 = { __armed: true };
  var TAG = '[v292Dfix460:slotgrid]';
  try { if (localStorage.getItem('v292Dfix460Off') === '1') return; } catch(e){}

  function inject(){
    try {
      if (document.getElementById('v292Dfix460-style')) return;
      var s = document.createElement('style');
      s.id = 'v292Dfix460-style';
      s.textContent =
        '.v30-modal.v310 .v310-card{min-height:320px}' +
        '@media(max-width:600px){.v30-modal.v310 .v310-card{min-height:300px}}';
      (document.head || document.documentElement).appendChild(s);
      try { console.log(TAG, 'slot card min-height applied (top row no longer collapses)'); } catch(e){}
    } catch(e){}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  else inject();
})();
