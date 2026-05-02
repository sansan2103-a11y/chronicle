/* v133: ban abstract noun phrases (一切の慈悲 etc) + の-phrase filter */
(function v133(){
  'use strict';
  var TAG = '[v133]';
  if (window.__v133Active) return;
  window.__v133Active = true;

  var ABSTRACT_RX = /(慈悲|情け|感情|気持ち|想い|思い|心|魂|意識|記憶|過去|未来|現在|一切|全て|全部|何も|何か|誰も|誰か|空気|雰囲気|気配|匂い|音|静寂|沈黙|無言|現実|世界|時間|時|運命|宿命|因果|可能性|希望|絶望|恐怖|苦痛|快楽|喜び|悲しみ|怒り|哀しみ|愛|憎しみ|恨み|嫉妬|羨望|尊敬|畏怖|信頼|疑念|罪|罰|意志|決意|覚悟|諦め|気力|生気|活力|本能|理性|常識|矛盾|事実|真実|嘘|虚構|幻想|現象|状態|状況|場面|光景|景色|風景|空|地|海|山|森|川|湖|空間|場所|位置)/;

  function getCast(){ try { return JSON.parse(localStorage.getItem('chr6') || '{}'); } catch(e){ return {}; } }
  function setCast(s){ localStorage.setItem('chr6', JSON.stringify(s)); }

  function isRegistered(name){
    var s = getCast(); var c = s.cast || {};
    if (c.hero && c.hero.name === name) return true;
    var npcs = c.npcs || [];
    for (var i = 0; i < npcs.length; i++){ if (npcs[i] && npcs[i].name === name) return true; }
    return false;
  }

  function isBanned(name){
    if (!name || name.length < 2) return true;
    if (isRegistered(name)) return false;
    if (/の/.test(name) && name.length >= 3) return true;
    if (ABSTRACT_RX.test(name)) return true;
    return false;
  }

  function findInfo(name){
    var s = getCast(); var c = s.cast || {}; var hero = c.hero || {};
    if (hero.name === name) return { name: hero.name, avatar: hero.avatar||'', isHero: true };
    var npcs = c.npcs || [];
    for (var i = 0; i < npcs.length; i++){ if (npcs[i] && npcs[i].name === name) return { name: npcs[i].name, avatar: npcs[i].avatar||'', isHero: false }; }
    if (s.ephemerals && s.ephemerals[name]) return { name: name, avatar: s.ephemerals[name].avatar||'', isHero: false };
    return null;
  }

  function cleanBanned(){
    var s = getCast(); if (!s.ephemerals) return;
    var changed = false;
    Object.keys(s.ephemerals).forEach(function(name){
      if (isBanned(name)){ delete s.ephemerals[name]; changed = true; console.log(TAG,'cleaned:',name); }
    });
    if (changed) setCast(s);
  }

  function reAttribute(){
    var stream = document.getElementById('dialogue-stream');
    if (!stream) return;
    var cards = stream.querySelectorAll('.v101-dlg-card');
    var s = getCast();
    var heroName = (s.cast && s.cast.hero && s.cast.hero.name) || '';
    var heroAvatar = (s.cast && s.cast.hero && s.cast.hero.avatar) || '';
    var npcs = (s.cast && s.cast.npcs) || [];

    var lastValidSpeaker = null;
    cards.forEach(function(c){
      var body = c.children[1];
      var nameEl = body && body.children[0];
      var textEl = body && body.children[1];
      if (!nameEl || !textEl) return;
      var currentName = nameEl.innerText;

      if (isBanned(currentName)){
        var newTarget = lastValidSpeaker;
        if (!newTarget){
          for (var i = 0; i < npcs.length; i++){
            var n = npcs[i];
            if (n && n.name && !isBanned(n.name)){
              newTarget = { name: n.name, avatar: n.avatar||'', isHero: false }; break;
            }
          }
        }
        if (!newTarget && heroName){ newTarget = { name: heroName, avatar: heroAvatar, isHero: true }; }
        if (newTarget){
          nameEl.innerText = newTarget.name;
          var avatarDiv = c.children[0];
          if (avatarDiv){
            avatarDiv.innerHTML = '';
            if (newTarget.avatar){
              var img = document.createElement('img');
              img.src = newTarget.avatar; img.alt = newTarget.name;
              img.style.cssText = 'width:100%;height:100%;object-fit:cover';
              avatarDiv.appendChild(img);
            } else { avatarDiv.textContent = newTarget.name.slice(0,1); }
          }
          c.classList.toggle('hero', !!newTarget.isHero);
          lastValidSpeaker = newTarget;
        }
      } else {
        var info = findInfo(currentName);
        if (info) lastValidSpeaker = info;
      }
    });
  }

  function init(){
    cleanBanned();
    setTimeout(reAttribute, 1400);
    setTimeout(cleanBanned, 2300);
    setTimeout(reAttribute, 4700);
    setTimeout(cleanBanned, 6800);
    setTimeout(reAttribute, 9000);
    var stream = document.getElementById('dialogue-stream');
    if (stream){
      var obs = new MutationObserver(function(){
        clearTimeout(window.__v133tmr);
        window.__v133tmr = setTimeout(function(){ cleanBanned(); reAttribute(); }, 800);
      });
      obs.observe(stream, { childList: true, subtree: false });
    }
  }

  if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', init); } else { init(); }

  console.log(TAG, 'v133 active: abstract noun + の-phrase ban');
})();
