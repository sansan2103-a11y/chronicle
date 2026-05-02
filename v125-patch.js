/* v125: trigger UI.renderAll() so v118-v124 wrap chain applies on first paint */
(function v125(){
  'use strict';
  var TAG = '[v125]';
  if (window.__v125Active) return;
  window.__v125Active = true;

  function fire(){
    try {
      if (typeof UI === 'object' && UI && typeof UI.renderAll === 'function'){
        UI.renderAll();
      }
    } catch(e){ console.warn(TAG, 'renderAll err', e); }
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){
      setTimeout(fire, 100);
      setTimeout(fire, 1000);
      setTimeout(fire, 3000);
    });
  } else {
    setTimeout(fire, 100);
    setTimeout(fire, 1000);
    setTimeout(fire, 3000);
  }

  console.log(TAG, 'v125 active: force renderAll for wrap-chain application');
})();
