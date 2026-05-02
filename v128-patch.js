/* v128: stronger speaker filter — reject phrase-fragments via particle / verb endings */
(function v128(){
  'use strict';
  var TAG = '[v128]';
  if (window.__v128Active) return;
  window.__v128Active = true;

  var PHRASE_MARKERS = /[をはがにへ]|から|まで|より|として|により|について/;

  var BODY_RX = /(手|声|息|息遣い|目|顔|視線|表情|唇|頬|肌|髪|血|涙|汗|喉|舌|胸|腰|腕|足|指|背|瞳|姿|肩|額|耳|鼻|乳|乳房|尻|太もも|股|局部|性器|陰部|肢体|肉体|裸体|身体|柔肌|秘部|花弁|蜜壺|秘所|蜜口|花芯)$/;

  var VERB_RX = /(する|した|される|られる|してる|している|ている|そうな|そうに|気な|気に|そう|やがる|やがった|やがって|だぜ|だね|だな|である)$/;

  var ALL_HIRA_RX = /^[ぁ-ゖー]+$/;

  function getCast(){
    try { return JSON.parse(localStorage.getItem('chr6') || '{}'); }
    catch(e){ return {}; }
  }
  function setCast(s){ localStorage.setItem('chr6', JSON.stringify(s)); }

  function isRegistered(name){
    var s = getCast();
    var c = s.cast || {};
    if (c.hero && c.hero.name === name) return true;
    var npcs = c.npcs || [];
    for (var i = 0; i < npcs.length; i++){
      if (npcs[i] && npcs[i].name === name) return true;
    }
    return false;
  }

  function isBannedName(name){
    if (!name || name.length < 2 || name.length > 12) return true;
    if (isRegistered(name)) return false;
    if (PHRASE_MARKERS.test(name)) return true;
    if (BODY_RX.test(name)) return true;
    if (VERB_RX.test(name)) return true;
    if (ALL_HIRA_RX.test(name)) return true;
    if (/[ぁ-ゖ]{3,}/.test(name)) return true;
    return false;
  }

  function cleanEphemerals(){
    var s = getCast();
    if (!s.ephemerals) return false;
    var changed = false;
    Object.keys(s.ephemerals).forEach(function(name){
      if (isBannedName(name)){
        delete s.ephemerals[name];
        changed = true;
        console.log(TAG, 'cleaned:', name);
      }
    });
    if (changed) setCast(s);
    return changed;
  }

  function findValidSpeakerInfo(name){
    var s = getCast();
    var c = s.cast || {};
    var hero = c.hero || {};
    if (hero.name === name) return { name: hero.name, avatar: hero.avatar || '', isHero: true };
    var npcs = c.npcs || [];
    for (var i = 0; i < npcs.length; i++){
      if (npcs[i] && npcs[i].name === name) return { name: npcs[i].name, avatar: npcs[i].avatar || '', isHero: false };
    }
    if (s.ephemerals && s.ephemerals[name] && !isBannedName(name)){
      return { name: name, avatar: s.ephemerals[name].avatar || '', isHero: false };
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
    setTimeout(reattributeCards, 600);
    setTimeout(cleanEphemerals, 1500);
    setTimeout(reattributeCards, 2000);
    setTimeout(cleanEphemerals, 5000);
    setTimeout(reattributeCards, 6000);

    var stream = document.getElementById('dialogue-stream');
    if (stream){
      var obs = new MutationObserver(function(){
        clearTimeout(window.__v128tmr);
        window.__v128tmr = setTimeout(function(){
          cleanEphemerals();
          reattributeCards();
        }, 250);
      });
      obs.observe(stream, { childList: true, subtree: false });
    }
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  console.log(TAG, 'v128 active: particle/verb filter');
})();
