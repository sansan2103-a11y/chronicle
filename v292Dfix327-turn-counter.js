// =====================================================================
// Chronicle TRPG - v292Dfix327: 物語のターン数表示(おしん要望・推奨の場所・負担最小)
//   「展開の描写」ヘッダ(.col-hdr「展開の描写／物語の進行・記録」)に「現NNターン」を表示。
//   負担最小: 1.5sポーリングでS.turns.lengthを見て、変化した時だけテキスト更新(DOM最小)。
//   スロット別: S.turns はアクティブスロットなので切替で自動追従。コア不触。
//   OFF: localStorage v292Dfix327Off='1'
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix327) return; window.__v292Dfix327 = true;
  function off(){ try { return localStorage.getItem('v292Dfix327Off') === '1'; } catch(e){ return false; } }
  function getS(){ try { return window.S || (typeof S !== 'undefined' ? S : null); } catch(e){ return null; } }
  function storyHdr(){
    try {
      var hs = document.querySelectorAll('.col-hdr');
      for (var i = 0; i < hs.length; i++){ if ((hs[i].textContent || '').indexOf('展開の描写') >= 0) return hs[i]; }
    } catch(e){}
    return null;
  }
  var last = -1;
  function update(){
    if (off()){ var b0=document.querySelector('.v327-turns'); if(b0) b0.textContent=''; return; }
    var hdr = storyHdr(); if (!hdr) return;
    var s = getS(); var n = (s && Array.isArray(s.turns)) ? s.turns.length : 0;
    var badge = hdr.querySelector('.v327-turns');
    if (!badge){
      badge = document.createElement('span'); badge.className = 'v327-turns';
      badge.style.cssText = 'margin-left:8px;font-size:11px;font-weight:700;color:var(--acc,#a78bfa);opacity:.9;white-space:nowrap';
      hdr.appendChild(badge);
    }
    if (n !== last){ badge.textContent = '現' + n + 'ターン'; last = n; }
  }
  try { setInterval(update, 1500); } catch(e){}
  update();
  try { console.log('[v292Dfix327:turncounter] loaded'); } catch(_){}
})();
