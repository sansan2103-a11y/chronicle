/* v136: lock v134-rendered cards from reattribution by older patches */
(function v136(){
  'use strict';
  var TAG = '[v136]';
  if (window.__v136Active) return;
  window.__v136Active = true;

  function getCast(){ try { return JSON.parse(localStorage.getItem('chr6') || '{}'); } catch(e){ return {}; } }

  function avUrl(name){
    var p = 'anime portrait, ' + name + ', detailed face, dark fantasy';
    var seed = 0;
    for (var i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) & 0x7fffffff;
    return 'https://image.pollinations.ai/prompt/' + encodeURIComponent(p) + '?width=384&height=384&seed=' + seed + '&nologo=true&model=flux';
  }

  function findInfo(name){
    if (!name) return null;
    var s = getCast(); var c = s.cast || {}; var hero = c.hero || {};
    if (hero.name === name) return { name: hero.name, avatar: hero.avatar||'', isHero: true };
    var npcs = c.npcs || [];
    for (var i = 0; i < npcs.length; i++){ if (npcs[i] && npcs[i].name === name) return { name: npcs[i].name, avatar: npcs[i].avatar||'', isHero: false }; }
    if (s.ephemerals && s.ephemerals[name]) return { name: name, avatar: s.ephemerals[name].avatar||'', isHero: false };
    return { name: name, avatar: avUrl(name), isHero: false };
  }

  function buildExpectedCards(){
    var s = getCast(); var turns = s.turns || [];
    var hero = (s.cast && s.cast.hero) || {}; var heroName = hero.name || '主人公';
    var anyHas = turns.some(function(t){ return t.dialogues && Array.isArray(t.dialogues); });
    if (!anyHas) return null;
    var expected = [];
    turns.forEach(function(t){
      if (t.inputType === 'SAY' && t.playerText){
        expected.push({ speaker: heroName, text: t.playerText, isHero: true, avatar: hero.avatar, inner: false });
      }
      if (t.dialogues && Array.isArray(t.dialogues)){
        t.dialogues.forEach(function(d){
          if (!d || !d.text) return;
          var info = findInfo(d.speaker);
          expected.push({ speaker: info.name, text: d.inner ? '《' + d.text + '》' : d.text, isHero: info.isHero, avatar: info.avatar, inner: !!d.inner });
        });
      } else {
        var narr = String(t.narrative || '');
        var rxDlg = /「([^「」\n]{1,300})」/g;
        var m;
        while ((m = rxDlg.exec(narr)) !== null){
          var info = findInfo(t.npcName || heroName);
          expected.push({ speaker: info.name, text: m[1], isHero: info.isHero, avatar: info.avatar, inner: false });
        }
        if (t.innerThought && String(t.innerThought).trim() && !/^[.…]{1,4}$/.test(t.innerThought.trim())){
          expected.push({ speaker: heroName, text: '《' + t.innerThought + '》', isHero: true, avatar: hero.avatar, inner: true });
        }
      }
    });
    return expected;
  }

  function makeCard(opts){
    var card = document.createElement('div');
    card.className = 'v101-dlg-card';
    if (opts.isHero) card.classList.add('hero');
    if (opts.inner) card.classList.add('inner');
    card.setAttribute('data-v136-locked', '1');
    card.setAttribute('data-v136-speaker', opts.speaker || '');
    card.setAttribute('data-v136-text', opts.text || '');
    var av = document.createElement('div');
    av.style.cssText = 'flex:0 0 44px;width:44px;height:44px;border-radius:8px;background:var(--s2);display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--dim);overflow:hidden;border:1px solid var(--border)';
    if (opts.avatar){
      var img = document.createElement('img');
      img.src = opts.avatar; img.alt = opts.speaker;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover';
      av.appendChild(img);
    } else { av.textContent = opts.speaker ? opts.speaker.slice(0,1) : '?'; }
    var body = document.createElement('div');
    body.style.cssText = 'flex:1;min-width:0';
    var name = document.createElement('div');
    name.style.cssText = 'font-size:11px;font-weight:600;color:var(--acc);margin-bottom:2px';
    name.textContent = opts.speaker || '?';
    var txt = document.createElement('div');
    txt.style.cssText = 'font-size:13px;line-height:1.5;color:var(--tx);word-break:break-word' + (opts.inner ? ';font-style:italic;color:var(--dim)' : '');
    txt.textContent = opts.text;
    body.appendChild(name); body.appendChild(txt);
    card.appendChild(av); card.appendChild(body);
    return card;
  }

  var rebuildBusy = false;
  var lastRebuildTime = 0;

  function rebuild(){
    if (rebuildBusy) return;
    var now = Date.now();
    if (now - lastRebuildTime < 500) return;
    var stream = document.getElementById('dialogue-stream');
    if (!stream) return;
    var expected = buildExpectedCards();
    if (!expected) return;
    rebuildBusy = true;
    try {
      var cards = stream.querySelectorAll('.v101-dlg-card');
      var allMatch = (cards.length === expected.length);
      if (allMatch){
        for (var i = 0; i < cards.length; i++){
          var c = cards[i];
          var nameEl = c.children[1] && c.children[1].children[0];
          if (!nameEl || nameEl.innerText !== expected[i].speaker){ allMatch = false; break; }
        }
      }
      if (allMatch){
        for (var i = 0; i < cards.length; i++){
          if (!cards[i].getAttribute('data-v136-locked')){
            cards[i].setAttribute('data-v136-locked', '1');
            cards[i].setAttribute('data-v136-speaker', expected[i].speaker);
            cards[i].setAttribute('data-v136-text', expected[i].text);
          }
        }
        return;
      }
      stream.innerHTML = '';
      expected.forEach(function(opts){ stream.appendChild(makeCard(opts)); });
      stream.scrollTop = stream.scrollHeight;
      lastRebuildTime = Date.now();
      console.log(TAG, 'rebuilt', expected.length, 'cards');
    } finally { rebuildBusy = false; }
  }

  function enforceLocks(){
    var stream = document.getElementById('dialogue-stream');
    if (!stream) return;
    var cards = stream.querySelectorAll('.v101-dlg-card[data-v136-locked]');
    var dirty = false;
    cards.forEach(function(c){
      var expectedSpeaker = c.getAttribute('data-v136-speaker');
      var nameEl = c.children[1] && c.children[1].children[0];
      if (nameEl && expectedSpeaker && nameEl.innerText !== expectedSpeaker){ dirty = true; }
    });
    if (dirty){ console.log(TAG, 'locked cards modified, restoring'); rebuild(); }
  }

  function init(){
    setTimeout(rebuild, 1000);
    setTimeout(rebuild, 3500);
    setTimeout(rebuild, 7000);
    var stream = document.getElementById('dialogue-stream');
    if (stream){
      var obs = new MutationObserver(function(){
        clearTimeout(window.__v136tmr);
        window.__v136tmr = setTimeout(enforceLocks, 200);
      });
      obs.observe(stream, { childList: true, subtree: true, characterData: true });
    }
    setInterval(enforceLocks, 1500);
  }

  if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', init); } else { init(); }

  console.log(TAG, 'v136 active: lock v134 cards from reattribution');
})();
