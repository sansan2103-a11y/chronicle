/* v127: filter body-part / action-fragment names + re-attribute to last valid speaker */
(function v127(){
  'use strict';
  var TAG = '[v127]';
  if (window.__v127Active) return;
  window.__v127Active = true;

  var BAN_PATTERNS = [
    /手$/, /声$/, /息$/, /息遣い$/, /目$/, /顔$/, /視線$/, /表情$/,
    /唇$/, /頰$/, /肌$/, /髪$/, /血$/, /涙$/, /汗$/, /喉$/, /舌$/,
    /胸$/, /腰$/, /腕$/, /足$/, /指$/, /背$/, /瞳$/, /姿$/,
    /って$/, /持って$/, /やがって$/, /やがる/, /じゃねえ/, /もん/, /だぜ$/, /だね$/,
    /^(って|たって|だって|ってこと)/,
    /^[ぁ-ゖ]+$/
  ];

  function isBannedName(name){
    if (!name || name.length < 2 || name.length > 12) return true;
    for (var i = 0; i < BAN_PATTERNS.length; i++){
      if (BAN_PATTERNS[i].test(name)) return true;
    }
    return false;
  }

  function getCast(){
    try { return JSON.parse(localStorage.getItem('chr6') || '{}'); }
    catch(e){ return {}; }
  }
  function setCast(s){ localStorage.setItem('chr6', JSON.stringify(s)); }

  function cleanEphemerals(){
    var s = getCast();
    if (!s.ephemerals) return;
    var changed = false;
    Object.keys(s.ephemerals).forEach(function(name){
      if (isBannedName(name)){
        delete s.ephemerals[name];
        changed = true;
      }
    });
    if (changed) setCast(s);
  }

  function avUrl(name){
    var p = 'anime portrait of a person, ' + name + ', detailed face, dark fantasy';
    var seed = 0;
    for (var i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) & 0x7fffffff;
    return 'https://image.pollinations.ai/prompt/' + encodeURIComponent(p) +
           '?width=384&height=384&seed=' + seed + '&nologo=true&model=flux';
  }

  function findValidSpeakerInfo(name){
    var s = getCast();
    var c = (s.cast || {});
    var hero = c.hero || {};
    if (hero.name === name) return { name: hero.name, avatar: hero.avatar || '', isHero: true };
    var npcs = c.npcs || [];
    for (var i = 0; i < npcs.length; i++){
      if (npcs[i] && npcs[i].name === name) return { name: npcs[i].name, avatar: npcs[i].avatar || '', isHero: false };
    }
    if (s.ephemerals && s.ephemerals[name]){
      return { name: name, avatar: s.ephemerals[name].avatar || avUrl(name), isHero: false };
    }
    return null;
  }

  function reattributeCards(){
    var stream = document.getElementById('dialogue-stream');
    if (!stream) return;
    var cards = stream.querySelectorAll('.v101-dlg-card');
    var lastValidSpeaker = null;
    var s = getCast();
    var heroName = (s.cast && s.cast.hero && s.cast.hero.name) || '';
    var heroAvatar = (s.cast && s.cast.hero && s.cast.hero.avatar) || '';

    cards.forEach(function(c){
      var body = c.children[1];
      var nameEl = body && body.children[0];
      if (!nameEl) return;
      var name = nameEl.innerText;
      if (isBannedName(name)){
        var target = lastValidSpeaker || { name: heroName, avatar: heroAvatar, isHero: true };
        if (!target.name) target = { name: '?', avatar: '', isHero: false };
        nameEl.innerText = target.name;
        var avatarDiv = c.children[0];
        if (avatarDiv){
          avatarDiv.innerHTML = '';
          if (target.avatar){
            var img = document.createElement('img');
            img.src = target.avatar;
            img.alt = target.name;
            img.style.cssText = 'width:100%;height:100%;object-fit:cover';
            avatarDiv.appendChild(img);
          } else {
            avatarDiv.textContent = target.name ? target.name.slice(0, 1) : '?';
          }
        }
        c.classList.toggle('hero', !!target.isHero);
      } else {
        var info = findValidSpeakerInfo(name);
        if (info) lastValidSpeaker = info;
      }
    });
  }

  function init(){
    cleanEphemerals();
    setTimeout(function(){
      try {
        if (typeof UI === 'object' && UI && typeof UI.renderAll === 'function'){
          UI.renderAll();
        }
      } catch(e){}
      setTimeout(reattributeCards, 600);
    }, 200);

    var stream = document.getElementById('dialogue-stream');
    if (stream){
      var obs = new MutationObserver(function(){
        clearTimeout(window.__v127tmr);
        window.__v127tmr = setTimeout(reattributeCards, 250);
      });
      obs.observe(stream, { childList: true, subtree: false });
    }

    setTimeout(cleanEphemerals, 1500);
    setTimeout(cleanEphemerals, 5000);
    setTimeout(reattributeCards, 2000);
    setTimeout(reattributeCards, 6000);
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  console.log(TAG, 'v127 active: body-part filter + reattribute');
})();
