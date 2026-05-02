/* v129: extended body parts + first-person override re-attribution */
(function v129(){
  'use strict';
  var TAG = '[v129]';
  if (window.__v129Active) return;
  window.__v129Active = true;

  var PHRASE_MARKERS = /[をはがにへ]|から|まで|より|として|により|について/;

  var BODY_RX = /(手|声|息|息遣い|目|顔|視線|表情|唇|頬|肌|髪|血|涙|汗|喉|舌|胸|腰|腕|足|指|背|瞳|姿|肩|額|耳|鼻|乳|乳房|尻|太もも|股|局部|性器|陰部|陰唇|陰核|肢体|肉体|裸体|身体|柔肌|秘部|花弁|蜜壺|秘所|蜜口|花芯|花芽|花蕾|蕾|突起|双丘|双臀|媚肉|媚肌|媚壺|媚穴|淫核|淫唇|淫部|淫蕾|秘裂|割れ目|アヌス|胛門|頂|頂き|先端|根元|奥|腿|内腿|膝|爪先|喉笛|首筋|うなじ|項|あご|顔)$/;

  var VERB_RX = /(する|した|される|られる|してる|している|ている|そうな|そうに|気な|気に|そう|やがる|やがった|やがって|だぜ|だね|だな|である|となる|となった|なった|放す|放して)$/;

  var ALL_HIRA_RX = /^[ぁ-ゖー]+$/;

  function getCast(){ try { return JSON.parse(localStorage.getItem('chr6')||'{}'); } catch(e){ return {}; } }
  function setCast(s){ localStorage.setItem('chr6', JSON.stringify(s)); }

  function isRegistered(name){
    var s = getCast(); var c = s.cast || {}; var hero = c.hero || {};
    if (hero.name === name) return true;
    var npcs = c.npcs || [];
    for (var i = 0; i < npcs.length; i++){ if (npcs[i] && npcs[i].name === name) return true; }
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
    var s = getCast(); if (!s.ephemerals) return false;
    var changed = false;
    Object.keys(s.ephemerals).forEach(function(name){
      if (isBannedName(name)){ delete s.ephemerals[name]; changed = true; console.log(TAG,'cleaned:',name); }
    });
    if (changed) setCast(s); return changed;
  }

  function findInfo(name){
    var s = getCast(); var c = s.cast || {}; var hero = c.hero || {};
    if (hero.name === name) return { name: hero.name, avatar: hero.avatar||'', isHero: true };
    var npcs = c.npcs || [];
    for (var i = 0; i < npcs.length; i++){ if (npcs[i] && npcs[i].name === name) return { name: npcs[i].name, avatar: npcs[i].avatar||'', isHero: false }; }
    if (s.ephemerals && s.ephemerals[name] && !isBannedName(name)){ return { name: name, avatar: s.ephemerals[name].avatar||'', isHero: false }; }
    return null;
  }

  function findSubjectInNarrative(narr, dlgText){
    if (!narr || !dlgText) return null;
    var idx = narr.indexOf('「' + dlgText + '」');
    if (idx < 0) return null;
    var before = narr.slice(Math.max(0, idx - 200), idx);
    var rx = /([一-鿿ぁ-ゖァ-ヺ・]{2,12})(?:は|が|もまた|も)/g;
    var m, lastName = null;
    while ((m = rx.exec(before)) !== null){
      if (!isBannedName(m[1])){
        var info = findInfo(m[1]);
        if (info) lastName = info;
      }
    }
    return lastName;
  }

  function reattributeCards(){
    var stream = document.getElementById('dialogue-stream');
    if (!stream) return;
    var cards = stream.querySelectorAll('.v101-dlg-card');
    var s = getCast();
    var heroName = (s.cast && s.cast.hero && s.cast.hero.name) || '';
    var heroAvatar = (s.cast && s.cast.hero && s.cast.hero.avatar) || '';
    var turns = s.turns || [];
    var allNarr = turns.map(function(t){ return t.narrative || ''; }).join('\n\n');

    var lastValidSpeaker = null;
    cards.forEach(function(c){
      var body = c.children[1];
      var nameEl = body && body.children[0];
      var textEl = body && body.children[1];
      if (!nameEl || !textEl) return;
      var name = nameEl.innerText;
      var text = textEl.innerText;
      var innerMatch = text.match(/^《(.+)》$/);
      var dlgText = innerMatch ? innerMatch[1] : text;

      var shouldReattribute = false;
      var newTarget = null;

      if (isBannedName(name)){
        shouldReattribute = true;
        newTarget = lastValidSpeaker || { name: heroName, avatar: heroAvatar, isHero: true };
      } else if (name === heroName && !innerMatch){
        var subjInfo = findSubjectInNarrative(allNarr, dlgText);
        if (subjInfo && subjInfo.name !== heroName){
          shouldReattribute = true;
          newTarget = subjInfo;
        }
      }

      if (shouldReattribute && newTarget){
        if (!newTarget.name) newTarget = { name: '?', avatar: '', isHero: false };
        nameEl.innerText = newTarget.name;
        var avatarDiv = c.children[0];
        if (avatarDiv){
          avatarDiv.innerHTML = '';
          if (newTarget.avatar){
            var img = document.createElement('img');
            img.src = newTarget.avatar; img.alt = newTarget.name;
            img.style.cssText = 'width:100%;height:100%;object-fit:cover';
            avatarDiv.appendChild(img);
          } else {
            avatarDiv.textContent = newTarget.name ? newTarget.name.slice(0,1) : '?';
          }
        }
        c.classList.toggle('hero', !!newTarget.isHero);
        var info = findInfo(newTarget.name);
        if (info && !isBannedName(newTarget.name)) lastValidSpeaker = info;
      } else {
        var info2 = findInfo(name);
        if (info2 && !isBannedName(name)) lastValidSpeaker = info2;
      }
    });
  }

  function init(){
    cleanEphemerals();
    setTimeout(reattributeCards, 700);
    setTimeout(cleanEphemerals, 1500);
    setTimeout(reattributeCards, 2200);
    setTimeout(cleanEphemerals, 5000);
    setTimeout(reattributeCards, 6200);
    var stream = document.getElementById('dialogue-stream');
    if (stream){
      var obs = new MutationObserver(function(){
        clearTimeout(window.__v129tmr);
        window.__v129tmr = setTimeout(function(){ cleanEphemerals(); reattributeCards(); }, 350);
      });
      obs.observe(stream, { childList: true, subtree: false });
    }
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }

  console.log(TAG, 'v129 active: extended body + first-person override');
})();
