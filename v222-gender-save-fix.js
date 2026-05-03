/* v222-gender-save-fix:
   Hooks localStorage.setItem('chr6', ...). Whenever chr6 is being written, reads
   the gender radio button state and overrides the gender field in the value being
   written. Radio buttons are the source of truth for gender. Also locks via
   _userGender flag and syncs desc text. */
(function v222(){
  'use strict';
  if (window.__v222Active) return;
  window.__v222Active = true;

  var MALE = '男性';   // 男性
  var FEMALE = '女性'; // 女性

  function readRadioGender(name){
    var checkedRadio = document.querySelector('input[name="' + name + '"]:checked');
    if (!checkedRadio) return null;
    var v = checkedRadio.value;
    if (v === MALE || v === FEMALE) return v;
    return null;
  }

  function readAllGenders(){
    var result = { hero: null, npcs: {} };
    result.hero = readRadioGender('v108g_hero');
    var npcRadios = document.querySelectorAll('input[type="radio"][name^="v108g_npc"]');
    var seen = {};
    npcRadios.forEach(function(r){
      var m = r.name.match(/v108g_npc(\d+)/);
      if (!m) m = r.name.match(/v108g_npc_(\d+)/);
      if (!m) return;
      var idx = parseInt(m[1], 10);
      if (seen[idx]) return;
      seen[idx] = true;
      result.npcs[idx] = readRadioGender(r.name);
    });
    return result;
  }

  function syncDescGender(desc, newGender){
    var prefix = '性別: ' + newGender + '。';
    if (!desc) return prefix;
    var rx = /性別[:：]\s*[男女]性?。?/;
    if (rx.test(desc)) return desc.replace(rx, '性別: ' + newGender + '。');
    return prefix + desc;
  }

  /* === CORE FIX: localStorage.setItem hook === */
  var origSet = localStorage.setItem.bind(localStorage);
  if (!localStorage.__v222Hooked){
    localStorage.setItem = function(key, value){
      if (key !== 'chr6') return origSet(key, value);
      try {
        var s = JSON.parse(value);
        var radio = readAllGenders();
        var changed = false;

        if (s.cast && s.cast.hero){
          if (radio.hero && s.cast.hero.gender !== radio.hero){
            console.log('[v222] override hero gender:', s.cast.hero.gender, '->', radio.hero);
            s.cast.hero.gender = radio.hero;
            s.cast.hero._userGender = radio.hero;
            s.cast.hero.desc = syncDescGender(s.cast.hero.desc || '', radio.hero);
            changed = true;
          } else if (radio.hero){
            s.cast.hero._userGender = radio.hero;
          }
        }

        if (s.cast && s.cast.npcs && Array.isArray(s.cast.npcs)){
          s.cast.npcs.forEach(function(n, i){
            if (!n) return;
            var rg = radio.npcs[i];
            if (rg && n.gender !== rg){
              console.log('[v222] override npc[' + i + ']:', n.gender, '->', rg);
              n.gender = rg;
              n._userGender = rg;
              n.desc = syncDescGender(n.desc || '', rg);
              changed = true;
            } else if (rg){
              n._userGender = rg;
            }
          });
        }

        if (changed) value = JSON.stringify(s);
      } catch(e){}
      return origSet(key, value);
    };
    localStorage.__v222Hooked = true;
  }

  /* === Click handler === */
  function findDescTextarea(radio){
    var card = radio.closest('.npc-card, [class*="npc"]');
    if (card) return card.querySelector('textarea');
    return document.getElementById('cfgHDesc');
  }

  function handleGenderClick(radio){
    if (!radio || !radio.checked) return;
    var newGender = radio.value;
    if (newGender !== MALE && newGender !== FEMALE) return;

    var ta = findDescTextarea(radio);
    if (ta){
      var newDescVal = syncDescGender(ta.value || '', newGender);
      if (newDescVal !== ta.value){
        var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(ta, newDescVal);
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    var s; try { s = JSON.parse(localStorage.getItem('chr6')||'{}'); } catch(e){ return; }
    if (!s.cast) s.cast = {};
    if (radio.name === 'v108g_hero'){
      s.cast.hero = s.cast.hero || {};
      s.cast.hero.gender = newGender;
      s.cast.hero._userGender = newGender;
      s.cast.hero.desc = syncDescGender(s.cast.hero.desc || '', newGender);
    } else {
      var m = radio.name.match(/v108g_npc(\d+)/);
      if (!m) m = radio.name.match(/v108g_npc_(\d+)/);
      if (m){
        var idx = parseInt(m[1], 10);
        s.cast.npcs = s.cast.npcs || [];
        while (s.cast.npcs.length <= idx) s.cast.npcs.push({});
        var n = s.cast.npcs[idx];
        n.gender = newGender;
        n._userGender = newGender;
        n.desc = syncDescGender(n.desc || '', newGender);
      }
    }
    localStorage.setItem('chr6', JSON.stringify(s));
  }

  function bindRadios(){
    var radios = document.querySelectorAll('input[type="radio"]');
    radios.forEach(function(r){
      if (r.__v222Bound) return;
      var v = r.value;
      var name = r.name || '';
      var isGender = (v === MALE || v === FEMALE);
      var isV108g = name.indexOf('v108g') >= 0;
      if (isGender && isV108g){
        r.__v222Bound = true;
        r.addEventListener('click', function(){ handleGenderClick(r); }, true);
        r.addEventListener('change', function(){ handleGenderClick(r); }, true);
      }
    });
  }

  function reflectGenderToRadios(){
    var s; try { s = JSON.parse(localStorage.getItem('chr6')||'{}'); } catch(e){ return; }
    if (!s.cast) return;
    function setRadio(name, gender){
      if (!gender) return;
      var radio = document.querySelector('input[name="' + name + '"][value="' + gender + '"]');
      if (radio && !radio.checked) radio.checked = true;
    }
    if (s.cast.hero) setRadio('v108g_hero', s.cast.hero._userGender || s.cast.hero.gender);
    (s.cast.npcs || []).forEach(function(n, i){
      if (n) setRadio('v108g_npc' + i, n._userGender || n.gender);
    });
  }

  function bindSettingsOpen(){
    document.addEventListener('click', function(e){
      var btn = e.target && e.target.closest && e.target.closest('button');
      if (!btn) return;
      var label = (btn.textContent || '').trim();
      if (/設定|Settings/.test(label)){
        setTimeout(function(){ bindRadios(); reflectGenderToRadios(); }, 100);
        setTimeout(function(){ bindRadios(); reflectGenderToRadios(); }, 400);
      }
    }, true);
  }

  function init(){
    bindRadios();
    bindSettingsOpen();
    setInterval(bindRadios, 3000);
    var mo = new MutationObserver(function(){ bindRadios(); });
    mo.observe(document.body, { childList: true, subtree: true });
    console.log('[v222] active: gender radio lock + setItem hook');
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.__v222 = {
    readAllGenders: readAllGenders,
    syncDescGender: syncDescGender,
    handleGenderClick: handleGenderClick,
    bindRadios: bindRadios,
    reflectGenderToRadios: reflectGenderToRadios
  };
})();
