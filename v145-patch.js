/* v145: stabilize avatars - idempotent fill, ephemeral support, force-sync to stream */
(function v145(){
  'use strict';
  var TAG = '[v145]';
  if (window.__v145Active) return;
  window.__v145Active = true;

  function getCast(){ try { return JSON.parse(localStorage.getItem('chr6') || '{}'); } catch(e){ return {}; } }
  function setCast(s){ localStorage.setItem('chr6', JSON.stringify(s)); }

  function normalizeGender(g){
    if (!g) return '';
    var s = String(g).trim().toLowerCase();
    if (s === 'female' || s === 'f' || g === '女性' || g === '女') return '女性';
    if (s === 'male' || s === 'm' || g === '男性' || g === '男') return '男性';
    return '';
  }

  function stableAvUrl(name, gender){
    var p = 'anime portrait, ';
    var g = normalizeGender(gender);
    if (g === '女性') p += 'beautiful young woman, ';
    else if (g === '男性') p += 'handsome young man, ';
    else p += 'a person, ';
    p += name + ', detailed face, dark fantasy';
    var seed = 0;
    for (var i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) & 0x7fffffff;
    if (g) seed = (seed ^ g.charCodeAt(0)) & 0x7fffffff;
    return 'https://image.pollinations.ai/prompt/' + encodeURIComponent(p) + '?width=384&height=384&seed=' + seed + '&nologo=true&model=flux';
  }

  function isValidAvUrl(url){ return !!(url && /^https?:\/\//.test(url) && url.length > 30); }

  function fillMissingOnly(){
    var s = getCast();
    var c = s.cast || {};
    var changed = false;
    if (c.hero && c.hero.name && !isValidAvUrl(c.hero.avatar)){
      c.hero.avatar = stableAvUrl(c.hero.name, c.hero.gender);
      changed = true;
      console.log(TAG, 'hero avatar set:', c.hero.name);
    }
    var npcs = c.npcs || [];
    npcs.forEach(function(n){
      if (n && n.name && !isValidAvUrl(n.avatar)){
        n.avatar = stableAvUrl(n.name, n.gender);
        changed = true;
        console.log(TAG, 'NPC avatar set:', n.name);
      }
    });
    var eph = s.ephemerals || {};
    Object.keys(eph).forEach(function(name){
      var e = eph[name];
      if (e && !isValidAvUrl(e.avatar)){
        e.avatar = stableAvUrl(name, '');
        changed = true;
        console.log(TAG, 'ephemeral avatar set:', name);
      }
    });
    if (changed){ c.npcs = npcs; s.cast = c; s.ephemerals = eph; setCast(s); }
  }

  function syncStreamAvatars(){
    var stream = document.getElementById('dialogue-stream');
    if (!stream) return;
    var s = getCast();
    var c = s.cast || {};
    var hero = c.hero || {};
    var npcs = c.npcs || [];
    var eph = s.ephemerals || {};
    function findExpected(name){
      if (hero.name === name) return hero.avatar;
      for (var i = 0; i < npcs.length; i++){ if (npcs[i] && npcs[i].name === name) return npcs[i].avatar; }
      if (eph[name]) return eph[name].avatar;
      return null;
    }
    stream.querySelectorAll('.v101-dlg-card').forEach(function(card){
      var nameEl = card.children[1] && card.children[1].children[0];
      if (!nameEl) return;
      var speaker = nameEl.innerText;
      var expected = findExpected(speaker);
      if (!isValidAvUrl(expected)) return;
      var avatarDiv = card.children[0];
      if (!avatarDiv) return;
      var existingImg = avatarDiv.querySelector('img');
      if (existingImg && existingImg.src === expected) return;
      avatarDiv.innerHTML = '';
      var img = document.createElement('img');
      img.src = expected; img.alt = speaker;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover';
      avatarDiv.appendChild(img);
    });
  }

  function init(){
    setTimeout(fillMissingOnly, 800);
    setTimeout(syncStreamAvatars, 1200);
    setTimeout(fillMissingOnly, 3000);
    setTimeout(syncStreamAvatars, 3500);
    setInterval(function(){ fillMissingOnly(); syncStreamAvatars(); }, 3000);
  }

  if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', init); } else { init(); }

  console.log(TAG, 'v145 active: stable avatar fill + stream sync');
})();
