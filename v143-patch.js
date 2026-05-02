/* v143: gender auto-detect from dialogues + avatar regen button fix */
(function v143(){
  'use strict';
  var TAG = '[v143]';
  if (window.__v143Active) return;
  window.__v143Active = true;

  function getCast(){ try { return JSON.parse(localStorage.getItem('chr6') || '{}'); } catch(e){ return {}; } }
  function setCast(s){ localStorage.setItem('chr6', JSON.stringify(s)); }

  function scoreGender(text){
    if (!text) return { male: 0, female: 0 };
    var male = 0, female = 0;
    if (/俺/.test(text)) male += 2;
    if (/僕/.test(text)) male += 2;
    if (/(?:^|[^一-鿿])オレ/.test(text)) male += 2;
    if (/拙者|わし/.test(text)) male += 2;
    if (/あたし|わたし|わたくし/.test(text)) female += 2;
    if (/だぜ$|だぞ$|だぜ。|だぞ。|だぜ！|だぞ！/.test(text)) male += 2;
    if (/やがる|やがった|じゃねえ|じゃねぇ/.test(text)) male += 2;
    if (/ねえぞ|ねえな|だろうがな|やんの/.test(text)) male += 2;
    if (/てめえ|貴様|きさま/.test(text)) male += 2;
    if (/だわ$|だわ。|だわよ|わよ$|わよ。|わよ！/.test(text)) female += 2;
    if (/かしら$|かしら。|かしら？/.test(text)) female += 2;
    if (/なの$|なの。|なの？|ですわ/.test(text)) female += 2;
    if (/ごめんなさい|くださいませ/.test(text)) female += 1;
    return { male: male, female: female };
  }

  function inferFromScore(sc){
    var T = 2;
    if (sc.male >= T && sc.male >= sc.female * 2 + 1) return 'male';
    if (sc.female >= T && sc.female >= sc.male * 2 + 1) return 'female';
    return null;
  }

  function detectAndFixGenders(){
    var s = getCast();
    var c = s.cast || {};
    var hero = c.hero || {};
    var npcs = c.npcs || [];
    var turns = s.turns || [];
    var scores = {};
    function ensureScore(name){ if (!scores[name]) scores[name] = { male: 0, female: 0, dialogues: 0 }; return scores[name]; }
    turns.forEach(function(t){
      if (!t.dialogues || !Array.isArray(t.dialogues)) return;
      t.dialogues.forEach(function(d){
        if (!d || !d.speaker || !d.text) return;
        var sc = ensureScore(d.speaker);
        var sg = scoreGender(d.text);
        sc.male += sg.male;
        sc.female += sg.female;
        sc.dialogues += 1;
      });
    });
    var changed = false;
    if (hero.name && scores[hero.name]){
      var newG = inferFromScore(scores[hero.name]);
      if (newG && hero.gender !== newG){
        console.log(TAG, 'hero gender:', hero.name, '=', hero.gender, '→', newG);
        hero.gender = newG; c.hero = hero; changed = true;
      }
    }
    npcs.forEach(function(n){
      if (!n || !n.name || !scores[n.name]) return;
      var newG = inferFromScore(scores[n.name]);
      if (newG && n.gender !== newG){
        console.log(TAG, 'NPC gender:', n.name, '=', n.gender, '→', newG);
        n.gender = newG; changed = true;
      }
    });
    if (changed){ c.npcs = npcs; s.cast = c; setCast(s); try { if (typeof UI === 'object' && UI && UI.renderAll) UI.renderAll(); } catch(e){} }
  }

  function avUrl(name, gender){
    var p = 'anime portrait, ';
    if (gender === 'female') p += 'beautiful young woman, ';
    else if (gender === 'male') p += 'handsome young man, ';
    p += name + ', detailed face, dark fantasy';
    var seed = Math.floor(Math.random() * 0x7fffffff);
    return 'https://image.pollinations.ai/prompt/' + encodeURIComponent(p) + '?width=384&height=384&seed=' + seed + '&nologo=true&model=flux';
  }

  function regenAvatar(target){
    if (!target || !target.name) return;
    var s = getCast(); var c = s.cast || {};
    var newUrl = avUrl(target.name, target.gender);
    if (c.hero && c.hero.name === target.name){
      c.hero.avatar = newUrl;
    } else {
      var npcs = c.npcs || [];
      for (var i = 0; i < npcs.length; i++){
        if (npcs[i] && npcs[i].name === target.name){ npcs[i].avatar = newUrl; break; }
      }
    }
    s.cast = c; setCast(s);
    console.log(TAG, 'regen avatar:', target.name);
    try { if (typeof UI === 'object' && UI && UI.renderAll) UI.renderAll(); } catch(e){}
    var stream = document.getElementById('dialogue-stream');
    if (stream){
      stream.querySelectorAll('.v101-dlg-card').forEach(function(c2){
        var nameEl = c2.children[1] && c2.children[1].children[0];
        if (nameEl && nameEl.innerText === target.name){
          var avDiv = c2.children[0];
          if (avDiv){
            avDiv.innerHTML = '';
            var img = document.createElement('img');
            img.src = newUrl; img.alt = target.name;
            img.style.cssText = 'width:100%;height:100%;object-fit:cover';
            avDiv.appendChild(img);
          }
        }
      });
    }
  }

  function hookRegenButtons(){
    var btns = document.querySelectorAll('button.regen, button[data-regen], button[title*="再生成"], button[aria-label*="再生成"]');
    btns.forEach(function(btn){
      if (btn.__v143hooked) return;
      btn.__v143hooked = true;
      btn.addEventListener('click', function(e){
        var card = btn.closest('[data-npc-idx], [data-hero], .npc-card, .hero-card');
        var name = null;
        if (card){ var nameInput = card.querySelector('input[type="text"]'); if (nameInput) name = nameInput.value; }
        if (!name){
          var parent = btn.parentElement;
          while (parent){
            var inp = parent.querySelector('input[type="text"]');
            if (inp && inp.value){ name = inp.value; break; }
            parent = parent.parentElement;
          }
        }
        if (!name) return;
        var s = getCast(); var c = s.cast || {}; var target = null;
        if (c.hero && c.hero.name === name) target = c.hero;
        else { var npcs = c.npcs || []; for (var i = 0; i < npcs.length; i++){ if (npcs[i] && npcs[i].name === name){ target = npcs[i]; break; } } }
        if (target){ setTimeout(function(){ regenAvatar(target); }, 100); }
      }, true);
    });
  }

  function init(){
    setTimeout(detectAndFixGenders, 2000);
    setTimeout(detectAndFixGenders, 6000);
    setInterval(detectAndFixGenders, 10000);
    setTimeout(hookRegenButtons, 1000);
    setInterval(hookRegenButtons, 3000);
  }

  if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', init); } else { init(); }

  console.log(TAG, 'v143 active: gender auto-detect + avatar regen');
})();
