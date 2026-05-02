/* v126: MutationObserver-based fix - re-trigger UI.renderAll when stream cards detected */
(function v126(){
  'use strict';
  var TAG = '[v126]';
  if (window.__v126Active) return;
  window.__v126Active = true;

  var lastFireTime = 0;

  function getCast(){
    try { return JSON.parse(localStorage.getItem('chr6') || '{}'); }
    catch(e){ return {}; }
  }

  function checkAndFix(){
    var stream = document.getElementById('dialogue-stream');
    if (!stream) return;
    var cards = stream.querySelectorAll('.v101-dlg-card');
    if (cards.length === 0) return;

    var s = getCast();
    var hero = (s.cast || {}).hero || {};
    var heroName = hero.name || '';
    if (!heroName) return;

    var turns = s.turns || [];
    var hasNonHeroSubject = false;
    for (var i = 0; i < turns.length; i++){
      var narr = String(turns[i].narrative || '');
      var rx = /([一-鿿ぁ-ゖァ-ヺ・]{2,12})(?:は|が|もまた|も)/g;
      var m;
      while ((m = rx.exec(narr)) !== null){
        if (m[1] !== heroName && m[1] !== heroName.split('・')[0] && !/^(彼女|彼|それ|誰|何|私|僕|俺|あなた|君|奴|者|声|目|手|顔|心|首|腕|足|髪|血|涙|息|気)/.test(m[1])){
          hasNonHeroSubject = true;
          break;
        }
      }
      if (hasNonHeroSubject) break;
    }
    if (!hasNonHeroSubject) return;

    var allHero = true;
    cards.forEach(function(c){
      var body = c.children[1];
      var nameEl = body && body.children[0];
      if (!nameEl) return;
      if (nameEl.innerText !== heroName) allHero = false;
    });

    if (allHero){
      var now = Date.now();
      if (now - lastFireTime < 1500) return;
      lastFireTime = now;
      try {
        if (typeof UI === 'object' && UI && typeof UI.renderAll === 'function'){
          UI.renderAll();
          console.log(TAG, 'detected broken attribution, fired UI.renderAll');
        }
      } catch(e){}
    }
  }

  function init(){
    setTimeout(checkAndFix, 500);
    setTimeout(checkAndFix, 2000);
    setTimeout(checkAndFix, 5000);
    setTimeout(checkAndFix, 10000);

    var stream = document.getElementById('dialogue-stream');
    if (stream){
      var obs = new MutationObserver(function(){
        clearTimeout(window.__v126tmr);
        window.__v126tmr = setTimeout(checkAndFix, 300);
      });
      obs.observe(stream, { childList: true, subtree: false });
    }
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  console.log(TAG, 'v126 active: MutationObserver attribution-fix');
})();
