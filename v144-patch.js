/* v144 EMERGENCY: normalize gender to Japanese + auto-generate missing avatars */
(function v144(){
  'use strict';
  var TAG = '[v144]';
  if (window.__v144Active) return;
  window.__v144Active = true;

  function getCast(){ try { return JSON.parse(localStorage.getItem('chr6') || '{}'); } catch(e){ return {}; } }
  function setCast(s){ localStorage.setItem('chr6', JSON.stringify(s)); }

  function normalizeGender(g){
    if (!g) return '';
    var s = String(g).trim().toLowerCase();
    if (s === 'female' || s === 'f' || g === '女性' || g === '女') return '女性';
    if (s === 'male' || s === 'm' || g === '男性' || g === '男') return '男性';
    return '';
  }

  function normalizeAllGenders(){
    var s = getCast();
    var c = s.cast || {};
    var changed = false;
    if (c.hero && c.hero.gender){
      var ng = normalizeGender(c.hero.gender);
      if (ng !== c.hero.gender){
        c.hero.gender = ng;
        changed = true;
        console.log(TAG, 'hero gender normalized →', ng);
      }
    }
    var npcs = c.npcs || [];
    npcs.forEach(function(n){
      if (n && n.gender){
        var ng = normalizeGender(n.gender);
        if (ng !== n.gender){
          n.gender = ng;
          changed = true;
          console.log(TAG, 'NPC', n.name, 'gender normalized →', ng);
        }
      }
    });
    if (changed){ c.npcs = npcs; s.cast = c; setCast(s); try { if (typeof UI === 'object' && UI && UI.renderAll) UI.renderAll(); } catch(e){} }
  }

  function avUrl(name, gender){
    var p = 'anime portrait, ';
    var g = normalizeGender(gender);
    if (g === '女性') p += 'beautiful young woman, ';
    else if (g === '男性') p += 'handsome young man, ';
    else p += 'a person, ';
    p += name + ', detailed face, dark fantasy';
    var seed = 0;
    for (var i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) & 0x7fffffff;
    return 'https://image.pollinations.ai/prompt/' + encodeURIComponent(p) + '?width=384&height=384&seed=' + seed + '&nologo=true&model=flux';
  }

  function fillMissingAvatars(){
    var s = getCast();
    var c = s.cast || {};
    var changed = false;
    if (c.hero && c.hero.name && !c.hero.avatar){
      c.hero.avatar = avUrl(c.hero.name, c.hero.gender);
      changed = true;
      console.log(TAG, 'hero avatar gen:', c.hero.name);
    }
    var npcs = c.npcs || [];
    npcs.forEach(function(n, idx){
      if (n && n.name && !n.avatar){
        n.avatar = avUrl(n.name, n.gender);
        changed = true;
        console.log(TAG, 'NPC[' + idx + '] avatar gen:', n.name);
      }
    });
    if (changed){ c.npcs = npcs; s.cast = c; setCast(s); try { if (typeof UI === 'object' && UI && UI.renderAll) UI.renderAll(); } catch(e){} }
  }

  function hookGenderRadios(){
    var radios = document.querySelectorAll('input[type="radio"][name*="gender" i], input[type="radio"][name*="性別"]');
    radios.forEach(function(r){
      if (r.__v144hooked) return;
      r.__v144hooked = true;
      r.addEventListener('change', function(){
        if (!r.checked) return;
        setTimeout(normalizeAllGenders, 100);
      }, true);
    });
  }

  function init(){
    setTimeout(normalizeAllGenders, 500);
    setTimeout(fillMissingAvatars, 1000);
    setTimeout(normalizeAllGenders, 2500);
    setTimeout(fillMissingAvatars, 3000);
    setInterval(function(){ normalizeAllGenders(); fillMissingAvatars(); }, 4000);
    setTimeout(hookGenderRadios, 1500);
    setInterval(hookGenderRadios, 3000);
  }

  if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', init); } else { init(); }

  console.log(TAG, 'v144 active: gender normalize JP + avatar fallback');
})();
