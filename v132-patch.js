/* v132: plea continues with last non-aggressor speaker (victim continuity) */
(function v132(){
  'use strict';
  var TAG = '[v132]';
  if (window.__v132Active) return;
  window.__v132Active = true;

  var EXTRA_BAN = /^(ブラジャー|下着|肌着|腰布|腰巻|全て|全部|それ|これ|あれ|どれ|何か|誰か|あの|その|この|どの|時間|空間|場所|場面|状況|世界|現実|その瞬間|あの瞬間|この瞬間)$/;

  var PLEA_RX = /(やめて|やめろ|許して|お願い|助けて|止めて|放して|離して|見ないで|触らないで|来ないで|怖い|嫌|いや|お助け|どうか|そんな|やだ|嫌だ|嫌です|やだぁ|おねがい|無理)/;

  var AGGRESSOR_RX = /(剥ぎ取|奪う|奪った|犯す|犯した|襲う|襲った|押さえつけ|掴む|掴んだ|引きずり|嘲笑|嘲り|嘲る|罵り|罵る|嬲|凌辱|陵辱|蹂躙|笑った|笑う|微笑|嗤|嗤う|嗤った|侮蔑|蔑む|蔑んだ|侮辱|犯される|嘲笑う|哂う|哄笑|高笑い)/;

  function getCast(){ try { return JSON.parse(localStorage.getItem('chr6') || '{}'); } catch(e){ return {}; } }
  function setCast(s){ localStorage.setItem('chr6', JSON.stringify(s)); }

  function findInfo(name){
    var s = getCast(); var c = s.cast || {}; var hero = c.hero || {};
    if (hero.name === name) return { name: hero.name, avatar: hero.avatar||'', isHero: true };
    var npcs = c.npcs || [];
    for (var i = 0; i < npcs.length; i++){ if (npcs[i] && npcs[i].name === name) return { name: npcs[i].name, avatar: npcs[i].avatar||'', isHero: false }; }
    if (s.ephemerals && s.ephemerals[name]) return { name: name, avatar: s.ephemerals[name].avatar||'', isHero: false };
    return null;
  }

  function cleanExtraBan(){
    var s = getCast();
    if (!s.ephemerals) return;
    var changed = false;
    Object.keys(s.ephemerals).forEach(function(name){
      if (EXTRA_BAN.test(name)){ delete s.ephemerals[name]; changed = true; console.log(TAG,'cleaned:',name); }
    });
    if (changed) setCast(s);
  }

  function findLastAggressor(narr, idx){
    if (!narr || idx === undefined) return null;
    var window2 = narr.slice(Math.max(0, idx - 400), idx);
    var rx = /([一-鿿ぁ-ゖァ-ヺ・]{2,12})(?:は|が)([^「\n。]{0,60})/g;
    var m, last = null;
    while ((m = rx.exec(window2)) !== null){
      if (AGGRESSOR_RX.test(m[2])) last = m[1];
    }
    return last;
  }

  function reAttribute(){
    var stream = document.getElementById('dialogue-stream');
    if (!stream) return;
    var cards = stream.querySelectorAll('.v101-dlg-card');
    var s = getCast();
    var heroName = (s.cast && s.cast.hero && s.cast.hero.name) || '';
    var heroAvatar = (s.cast && s.cast.hero && s.cast.hero.avatar) || '';
    var npcs = (s.cast && s.cast.npcs) || [];
    var turns = s.turns || [];
    var allNarr = turns.map(function(t){ return t.narrative || ''; }).join('\n\n');

    var lastNonAggressorSpeaker = null;
    cards.forEach(function(c){
      var body = c.children[1];
      var nameEl = body && body.children[0];
      var textEl = body && body.children[1];
      if (!nameEl || !textEl) return;
      var currentName = nameEl.innerText;
      var text = textEl.innerText;
      var innerMatch = text.match(/^《(.+)》$/);

      if (innerMatch){
        if (currentName) lastNonAggressorSpeaker = findInfo(currentName) || lastNonAggressorSpeaker;
        return;
      }
      var dlgText = text;
      var newTarget = null;

      if (PLEA_RX.test(dlgText)){
        var idx = allNarr.indexOf('「' + dlgText);
        if (idx < 0) idx = allNarr.indexOf(dlgText);
        var aggressor = idx >= 0 ? findLastAggressor(allNarr, idx) : null;
        var currentIsAggressor = (aggressor && aggressor === currentName);
        var heroIsAggressor = (aggressor && aggressor === heroName);

        if (currentIsAggressor){
          if (lastNonAggressorSpeaker && lastNonAggressorSpeaker.name !== aggressor){
            newTarget = lastNonAggressorSpeaker;
          }
          if (!newTarget){
            for (var i = 0; i < npcs.length; i++){
              var n = npcs[i];
              if (n && n.name && n.name !== aggressor && n.name !== heroName){
                newTarget = { name: n.name, avatar: n.avatar||'', isHero: false };
                break;
              }
            }
          }
          if (!newTarget && heroName && !heroIsAggressor){
            newTarget = { name: heroName, avatar: heroAvatar, isHero: true };
          }
        }
      }

      if (newTarget && newTarget.name && newTarget.name !== currentName){
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
        if (newTarget.name) lastNonAggressorSpeaker = findInfo(newTarget.name) || newTarget;
      } else {
        if (currentName){
          var idx2 = allNarr.indexOf('「' + dlgText);
          if (idx2 < 0) idx2 = allNarr.indexOf(dlgText);
          var agg = idx2 >= 0 ? findLastAggressor(allNarr, idx2) : null;
          if (currentName !== agg) lastNonAggressorSpeaker = findInfo(currentName) || { name: currentName };
        }
      }
    });
  }

  function init(){
    cleanExtraBan();
    setTimeout(reAttribute, 1300);
    setTimeout(cleanExtraBan, 2200);
    setTimeout(reAttribute, 4500);
    setTimeout(cleanExtraBan, 6500);
    setTimeout(reAttribute, 8500);
    var stream = document.getElementById('dialogue-stream');
    if (stream){
      var obs = new MutationObserver(function(){
        clearTimeout(window.__v132tmr);
        window.__v132tmr = setTimeout(function(){ cleanExtraBan(); reAttribute(); }, 700);
      });
      obs.observe(stream, { childList: true, subtree: false });
    }
  }

  if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', init); } else { init(); }

  console.log(TAG, 'v132 active: victim-continuity plea routing');
})();
