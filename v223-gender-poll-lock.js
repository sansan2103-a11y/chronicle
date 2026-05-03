/* v223-gender-poll-lock:
   v222 setItem hook didn't catch all writes because Brave/Chrome bypasses JS-level
   localStorage hooks for direct property assignment (localStorage.chr6 = ...). The
   app uses both paths.

   Robust approach: separate persistent key + aggressive polling.
   1. Store user's gender choices in localStorage key 'chr6_userGenderLock' as
      {hero: '女性', npc0: '男性', ...}
   2. Every 200ms, read chr6 + lock key. If chr6's gender differs from lock,
      write the corrected chr6 via setItem (poll-driven sync).
   3. On click of any gender radio, IMMEDIATELY update the lock key.
   4. On settings open / page load, immediately apply lock to chr6 + radios.
   5. Lock key survives chr6 rewrites because it's a different key.
*/
(function v223(){
  'use strict';
  if (window.__v223Active) return;
  window.__v223Active = true;

  var LOCK_KEY = 'chr6_userGenderLock';
  var MALE = '男性';
  var FEMALE = '女性';

  function readLock(){
    try { return JSON.parse(localStorage.getItem(LOCK_KEY) || '{}'); }
    catch(e){ return {}; }
  }

  function writeLock(lock){
    try { localStorage.setItem(LOCK_KEY, JSON.stringify(lock)); } catch(e){}
  }

  function setLockFor(charKey, gender){
    if (gender !== MALE && gender !== FEMALE) return;
    var lock = readLock();
    lock[charKey] = gender;
    writeLock(lock);
    console.log('[v223] lock set', charKey, '=', gender);
  }

  function getLockFor(charKey){
    return readLock()[charKey] || null;
  }

  function clearLockFor(charKey){
    var lock = readLock();
    delete lock[charKey];
    writeLock(lock);
  }

  function syncDescGender(desc, newGender){
    var prefix = '性別: ' + newGender + '。';
    if (!desc) return prefix;
    var rx = /性別[:：]\s*[男女]性?。?/;
    if (rx.test(desc)) return desc.replace(rx, '性別: ' + newGender + '。');
    return prefix + desc;
  }

  /* === Apply lock to chr6 === */
  function applyLockToCast(){
    var s; try { s = JSON.parse(localStorage.getItem('chr6') || '{}'); } catch(e){ return false; }
    if (!s.cast) return false;
    var lock = readLock();
    var changed = false;

    if (s.cast.hero && lock.hero){
      if (s.cast.hero.gender !== lock.hero){
        s.cast.hero.gender = lock.hero;
        s.cast.hero._userGender = lock.hero;
        s.cast.hero.desc = syncDescGender(s.cast.hero.desc || '', lock.hero);
        changed = true;
      }
    }

    if (s.cast.npcs && Array.isArray(s.cast.npcs)){
      s.cast.npcs.forEach(function(n, i){
        if (!n) return;
        var lockedG = lock['npc' + i];
        if (lockedG && n.gender !== lockedG){
          n.gender = lockedG;
          n._userGender = lockedG;
          n.desc = syncDescGender(n.desc || '', lockedG);
          changed = true;
        }
      });
    }

    if (changed){
      try { localStorage.setItem('chr6', JSON.stringify(s)); } catch(e){}
      console.log('[v223] applied lock to chr6');
      return true;
    }
    return false;
  }

  /* === Apply lock to visible radios === */
  function applyLockToRadios(){
    var lock = readLock();
    function setRadio(name, gender){
      if (!gender) return;
      var radio = document.querySelector('input[name="' + name + '"][value="' + gender + '"]');
      if (radio && !radio.checked){
        radio.checked = true;
        return true;
      }
      return false;
    }
    if (lock.hero) setRadio('v108g_hero', lock.hero);
    Object.keys(lock).forEach(function(k){
      var m = k.match(/^npc(\d+)$/);
      if (m){
        setRadio('v108g_npc' + m[1], lock[k]);
      }
    });
  }

  /* === Click handler: write lock immediately === */
  function findDescTextarea(radio){
    var card = radio.closest('.npc-card, [class*="npc"]');
    if (card) return card.querySelector('textarea');
    return document.getElementById('cfgHDesc');
  }

  function handleGenderClick(radio){
    if (!radio || !radio.checked) return;
    var newGender = radio.value;
    if (newGender !== MALE && newGender !== FEMALE) return;

    var charKey;
    if (radio.name === 'v108g_hero'){ charKey = 'hero'; }
    else {
      var m = radio.name.match(/v108g_npc(\d+)/) || radio.name.match(/v108g_npc_(\d+)/);
      if (m) charKey = 'npc' + m[1];
    }
    if (!charKey) return;

    /* 1. Lock key — protected from chr6 rewrites */
    setLockFor(charKey, newGender);

    /* 2. Update visible textarea */
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

    /* 3. Update chr6 immediately */
    applyLockToCast();
  }

  function bindRadios(){
    document.querySelectorAll('input[type="radio"]').forEach(function(r){
      if (r.__v223Bound) return;
      var v = r.value;
      var name = r.name || '';
      if ((v === MALE || v === FEMALE) && name.indexOf('v108g') >= 0){
        r.__v223Bound = true;
        r.addEventListener('click', function(){ handleGenderClick(r); }, true);
        r.addEventListener('change', function(){ handleGenderClick(r); }, true);
      }
    });
  }

  /* === Settings open hook === */
  function bindSettingsOpen(){
    document.addEventListener('click', function(e){
      var btn = e.target && e.target.closest && e.target.closest('button');
      if (!btn) return;
      var label = (btn.textContent || '').trim();
      if (/設定|Settings/.test(label)){
        setTimeout(function(){ bindRadios(); applyLockToRadios(); applyLockToCast(); }, 50);
        setTimeout(function(){ bindRadios(); applyLockToRadios(); applyLockToCast(); }, 300);
        setTimeout(function(){ bindRadios(); applyLockToRadios(); applyLockToCast(); }, 800);
      }
      /* Save button: immediately re-apply after save fires */
      if (/保存/.test(label)){
        setTimeout(applyLockToCast, 50);
        setTimeout(applyLockToCast, 300);
        setTimeout(applyLockToCast, 800);
        setTimeout(applyLockToCast, 1500);
      }
    }, true);
  }

  /* === Periodic poll: every 200ms re-apply lock === */
  function pollLoop(){
    applyLockToCast();
    applyLockToRadios();
  }

  /* === Init === */
  function init(){
    bindRadios();
    bindSettingsOpen();
    /* Initial apply (if chr6 already has data) */
    applyLockToCast();
    /* Poll every 200ms to combat any write paths we don't catch */
    setInterval(pollLoop, 200);
    /* Re-bind radios on DOM mutations */
    var mo = new MutationObserver(function(){ bindRadios(); });
    mo.observe(document.body, { childList: true, subtree: true });
    console.log('[v223] active: separate lock key + 200ms poll');
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.__v223 = {
    readLock: readLock,
    writeLock: writeLock,
    setLockFor: setLockFor,
    getLockFor: getLockFor,
    clearLockFor: clearLockFor,
    applyLockToCast: applyLockToCast,
    applyLockToRadios: applyLockToRadios,
    handleGenderClick: handleGenderClick,
    bindRadios: bindRadios,
    LOCK_KEY: LOCK_KEY
  };
})();
