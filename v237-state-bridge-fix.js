(function(){
  if (window.__v237Active) return;
  window.__v237Active = true;

  // A) S/Planner/UI を window にブリッジ
  function bridge() {
    try {
      if (typeof S !== 'undefined' && !window.S) window.S = S;
      if (typeof Planner !== 'undefined' && !window.Planner) window.Planner = Planner;
      if (typeof UI !== 'undefined' && !window.UI) window.UI = UI;
    } catch(e){}
  }
  bridge();
  setInterval(bridge, 500);  // 後発の宣言にも対応

  // B) S.save をフック、書き込み直前に v23X フィールドを保証
  function hookSave() {
    if (!window.S || !window.S.save || window.S.save.__v237Hooked) {
      setTimeout(hookSave, 500);
      return;
    }
    const orig = window.S.save;
    window.S.save = function() {
      try {
        // 既存の localStorage chr6 を読んで authorsNote/worldInfo/povChar をマージ
        const raw = localStorage.getItem('chr6');
        if (raw) {
          const stored = JSON.parse(raw);
          if (stored && stored.cfg) {
            if (window.S.cfg) {
              if (stored.cfg.authorsNote && !window.S.cfg.authorsNote) {
                window.S.cfg.authorsNote = stored.cfg.authorsNote;
              }
              if (stored.cfg.worldInfo && !window.S.cfg.worldInfo) {
                window.S.cfg.worldInfo = stored.cfg.worldInfo;
              }
              if (stored.cfg.povChar && !window.S.cfg.povChar) {
                window.S.cfg.povChar = stored.cfg.povChar;
              }
            }
          }
        }
      } catch(e){}
      return orig.apply(this, arguments);
    };
    window.S.save.__v237Hooked = true;
  }
  hookSave();

  console.log('[v237] state bridge fix active');
})();
