/* v118: gender persist + vocative attribution + spiral fix */
(function v118(){
  'use strict';
  var TAG = '[v118]';
  if (window.__v118Active) return;
  window.__v118Active = true;

  function getCast(){
    try { return JSON.parse(localStorage.getItem('chr6') || '{}'); }
    catch(e){ return {}; }
  }
  function setCast(s){ localStorage.setItem('chr6', JSON.stringify(s)); }

  /* ===== 1. Hook saveSettings to preserve gender + avatar ===== */
  function hookSave(){
    if (typeof UI !== 'object' || !UI || UI.__v118SaveHooked) return;
    if (typeof UI.saveSettings === 'function'){
      var orig = UI.saveSettings.bind(UI);
      UI.saveSettings = function(){
        var before = getCast();
        var heroBack = before.cast && before.cast.hero ? {
          gender: before.cast.hero.gender,
          avatar: before.cast.hero.avatar
        } : null;
        var npcsBack = (before.cast && before.cast.npcs ? before.cast.npcs : []).map(function(n){
          return n ? { gender: n.gender, avatar: n.avatar } : null;
        });
        var result = orig.apply(this, arguments);
        try {
          var after = getCast();
          if (after.cast){
            if (after.cast.hero && heroBack){
              if (heroBack.gender && !after.cast.hero.gender) after.cast.hero.gender = heroBack.gender;
              if (heroBack.avatar && !after.cast.hero.avatar) after.cast.hero.avatar = heroBack.avatar;
            }
            (after.cast.npcs || []).forEach(function(n, i){
              if (n && npcsBack[i]){
                if (npcsBack[i].gender && !n.gender) n.gender = npcsBack[i].gender;
                if (npcsBack[i].avatar && !n.avatar) n.avatar = npcsBack[i].avatar;
              }
            });
            setCast(after);
          }
        } catch(e){}
        return result;
      };
      UI.__v118SaveHooked = true;
      console.log(TAG, 'saveSettings hooked');
    }
  }

  /* ===== 2. Better dialogue attribution with vocative detection ===== */
  function findCast(name){
    if (!name) return null;
    var c = (getCast().cast || {});
    var h = c.hero || {};
    if (h.name && (h.name === name || name.indexOf(h.name) === 0 || h.name.indexOf(name) === 0)){
      return { isHero: true, name: h.name, avatar: h.avatar || '' };
    }
    var npcs = c.npcs || [];
    for (var i = 0; i < npcs.length; i++){
      var n = npcs[i];
      if (!n || !n.name) continue;
      if (n.name === name || name.indexOf(n.name) === 0 || n.name.indexOf(name) === 0){
        return { isHero: false, name: n.name, avatar: n.avatar || '' };
      }
    }
    return null;
  }

  function getEph(name){
    try {
      var s = getCast();
      s.ephemerals = s.ephemerals || {};
      if (!s.ephemerals[name]){
        var p = 'anime portrait of a person, ' + name + ', detailed face, dark fantasy';
        var seed = 0;
        for (var i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) & 0x7fffffff;
        s.ephemerals[name] = {
          avatar: 'https://image.pollinations.ai/prompt/' + encodeURIComponent(p) +
                  '?width=384&height=384&seed=' + seed + '&nologo=true&model=flux'
        };
        setCast(s);
      }
      return s.ephemerals[name];
    } catch(e){ return { avatar: '' }; }
  }

  var FP_RX = /(私|わたし|僕|ぼく|俺|おれ|あたし|うち)(?:は|の|が|を|に|だ|、|，|。|…|でも)/;

  /* Vocative detection: if dialogue contains "[name]さん|様|くん|ちゃん" → speaker is NOT that name */
  function findVocativeTargets(dlgText, allNames){
    var targets = [];
    allNames.forEach(function(name){
      if (!name) return;
      var rx = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:さん|さま|様|くん|ちゃん|殿)');
      if (rx.test(dlgText)) targets.push(name);
    });
    return targets;
  }

  function attributeDialogue(narr, pos, dlgText, defSpk, heroName, npcs){
    var allNames = [heroName].concat(npcs.map(function(n){ return n && n.name; })).filter(Boolean);
    /* 0. Vocative: dialogue addressed to X → speaker is NOT X */
    var vocativeTargets = findVocativeTargets(dlgText, allNames);
    /* 1. Explicit name prefix */
    var before = narr.slice(Math.max(0, pos - 80), pos);
    var prefixMatch = before.match(/([一-鿿ぁ-ゖァ-ヺ々ー・]{2,12})(?:は|が|の)\s*$/);
    if (prefixMatch){
      var info = findCast(prefixMatch[1]);
      if (info && vocativeTargets.indexOf(info.name) < 0) return info;
    }
    /* 2. First-person */
    if (FP_RX.test(dlgText)){
      if (vocativeTargets.indexOf(heroName) < 0){
        var hero = findCast(heroName);
        if (hero) return hero;
      }
    }
    /* 3. Vocative implies hero is speaking (most common: hero addresses NPC) */
    if (vocativeTargets.length > 0){
      var hero = findCast(heroName);
      if (hero && vocativeTargets.indexOf(heroName) < 0) return hero;
      /* If hero is the vocative target, then the speaker is one of the NPCs */
      for (var i = 0; i < npcs.length; i++){
        var n = npcs[i];
        if (n && n.name && vocativeTargets.indexOf(n.name) < 0){
          return findCast(n.name);
        }
      }
    }
    /* 4. Nearest cast name in surrounding text */
    var window2 = narr.slice(Math.max(0, pos - 150), pos);
    var heroIdx = heroName ? window2.lastIndexOf(heroName) : -1;
    var npcMatch = { idx: -1, name: null };
    npcs.forEach(function(n){
      if (!n || !n.name) return;
      var ix = window2.lastIndexOf(n.name);
      if (ix > npcMatch.idx) npcMatch = { idx: ix, name: n.name };
    });
    if (heroIdx >= 0 && heroIdx > npcMatch.idx){
      if (vocativeTargets.indexOf(heroName) < 0){
        return findCast(heroName);
      }
    }
    if (npcMatch.idx >= 0){
      if (vocativeTargets.indexOf(npcMatch.name) < 0){
        return findCast(npcMatch.name);
      }
    }
    return null;
  }

  /* ===== 3. Spiral / repetition detection ===== */
  function killSpiral(text){
    if (!text) return text;
    var t = String(text);
    /* Pattern: "と考えて、X した。" 3+ times → keep first only */
    t = t.replace(/(と考えて、[^。\n]{1,30}。\s*){3,}/g, function(m){
      var first = m.match(/と考えて、[^。\n]{1,30}。/);
      return first ? first[0] : '';
    });
    /* Pattern: "と" + verb + "た。" sequences too */
    t = t.replace(/((?:と[一-鿿]+た。)\s*){4,}/g, function(m){
      var first = m.match(/と[一-鿿]+た。/);
      return first ? first[0] : '';
    });
    /* Generic: 3+ chars phrase repeated 3+ times */
    t = t.replace(/((?:[一-鿿ぁ-ゖァ-ヺ]{3,30}))\1{2,}/g, '$1');
    return t;
  }

  function strongCleanV118(text){
    if (!text) return text;
    var t = String(text);
    /* Currency noise */
    t = t.replace(/[¥￥$]+/g, '');
    /* Meta brackets */
    t = t.replace(/【[^】\n]{1,30}】/g, '');
    /* Prompt leak */
    t = t.replace(/^.*↓[^\n]*(続きを書|地の文|見出し禁止|台詞のみ|JSONを使|使わず)[^\n]*$/gm, '');
    t = t.replace(/^[\(（]地の文[^\)）]*[\)）][\s。]*$/gm, '');
    /* Placeholder */
    t = t.replace(/^主人公は[\s　]+[^\n]{0,80}$/gm, '');
    /* Spiral kill */
    t = killSpiral(t);
    /* Strip pure dialogue lines */
    var lines = t.split('\n');
    var out = [];
    for (var i = 0; i < lines.length; i++){
      var line = lines[i];
      if (!line.trim()){ out.push(line); continue; }
      var stripped = line
        .replace(/「[^「」\n]+」/g, '')
        .replace(/《[^《》\n]+》/g, '')
        .replace(/[\s　]+/g, '')
        .trim();
      if (line.indexOf('「') >= 0 && stripped.length < 8) continue;
      out.push(line);
    }
    t = out.join('\n');
    /* Cap inner thoughts to 2 */
    var count = 0;
    t = t.replace(/《[^《》\n]+》/g, function(m){
      count++;
      return count <= 2 ? m : '';
    });
    /* Collapse blanks */
    t = t.replace(/\n{3,}/g, '\n\n');
    return t.trim();
  }

  /* Hook UI.renderNarr (chained over v117) */
  if (typeof UI === 'object' && UI && typeof UI.renderNarr === 'function' && !UI.__v118Hooked){
    var origR = UI.renderNarr.bind(UI);
    UI.renderNarr = function(text){
      try {
        var t = Array.isArray(text) ? text.join('\n') : String(text || '');
        return origR(strongCleanV118(t));
      } catch(e){ return origR(text); }
    };
    UI.__v118Hooked = true;
  }

  /* ===== 4. Better dialogue stream rendering with vocative + multi-《》 split ===== */
  function rerenderStreamV118(){
    var stream = document.getElementById('dialogue-stream');
    if (!stream) return;
    var s = getCast();
    var hero = (s.cast || {}).hero || {};
    var heroName = hero.name || '主人公';
    var npcs = (s.cast || {}).npcs || [];

    stream.innerHTML = '';

    function addCard(opts){
      var card = document.createElement('div');
      card.className = 'v101-dlg-card';
      if (opts.isHero) card.classList.add('hero');
      if (opts.inner) card.classList.add('inner');
      var av = document.createElement('div');
      av.style.cssText = 'flex:0 0 44px;width:44px;height:44px;border-radius:8px;background:var(--s2);display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--dim);overflow:hidden;border:1px solid var(--border)';
      if (opts.avatar){
        var img = document.createElement('img');
        img.src = opts.avatar; img.alt = opts.speaker;
        img.style.cssText = 'width:100%;height:100%;object-fit:cover';
        av.appendChild(img);
      } else {
        av.textContent = opts.speaker ? opts.speaker.slice(0, 1) : '?';
      }
      var body = document.createElement('div');
      body.style.cssText = 'flex:1;min-width:0';
      var name = document.createElement('div');
      name.style.cssText = 'font-size:11px;font-weight:600;color:var(--acc);margin-bottom:2px';
      name.textContent = opts.speaker || '？';
      var txt = document.createElement('div');
      txt.style.cssText = 'font-size:13px;line-height:1.5;color:var(--tx);word-break:break-word' +
        (opts.inner ? ';font-style:italic;color:var(--dim)' : '');
      txt.textContent = opts.text;
      body.appendChild(name); body.appendChild(txt);
      card.appendChild(av); card.appendChild(body);
      stream.appendChild(card);
    }

    var turns = s.turns || [];
    turns.forEach(function(t){
      var inputType = t.inputType || '';
      var playerText = t.playerText || '';
      if (inputType === 'SAY' && playerText){
        addCard({ speaker: heroName, text: playerText, isHero: true, avatar: hero.avatar });
      }
      var inner = t.innerThought;
      if (inner && String(inner).trim() && !/^[.…]{1,4}$/.test(String(inner).trim())){
        addCard({ speaker: heroName, text: '（' + inner + '）', isHero: true, avatar: hero.avatar, inner: true });
      }
      var narr = String(t.narrative || '');
      var npcName = t.npcName || '';
      if (!narr) return;

      /* Find each 「..」 in narrative */
      var rx = /「([^「」\n]{1,300})」/g;
      var m;
      while ((m = rx.exec(narr)) !== null){
        var dlg = m[1];
        if (!dlg || /^[\.\。\…\s]{1,3}$/.test(dlg.trim())) continue;
        if (/送信|再生成|取消|続きを書く/.test(dlg)) continue;

        var info = attributeDialogue(narr, m.index, dlg, npcName, heroName, npcs);
        if (!info){
          if (npcName){
            info = findCast(npcName);
            if (!info){ var eph = getEph(npcName); info = { isHero: false, name: npcName, avatar: eph.avatar }; }
          } else {
            info = { isHero: true, name: heroName, avatar: hero.avatar };
          }
        }
        addCard({ speaker: info.name, text: dlg, isHero: info.isHero, avatar: info.avatar });
      }

      /* Inner thoughts in narrative as separate cards */
      var rxInner = /《([^《》\n]{1,300})》/g;
      var icount = 0;
      while ((m = rxInner.exec(narr)) !== null){
        if (++icount > 3) break; /* cap at 3 inner cards per turn */
        var inn = m[1];
        if (!inn || inn.length < 2) continue;
        addCard({ speaker: heroName, text: '《' + inn + '》', isHero: true, avatar: hero.avatar, inner: true });
      }
    });

    stream.scrollTop = stream.scrollHeight;
  }

  function hookStream(){
    if (typeof UI !== 'object' || !UI || UI.__v118SHooked) return;
    if (typeof UI.renderAll === 'function'){
      var oA = UI.renderAll.bind(UI);
      UI.renderAll = function(){
        var r = oA.apply(this, arguments);
        try { rerenderStreamV118(); } catch(e){}
        return r;
      };
    }
    if (typeof UI.appendTurn === 'function'){
      var oP = UI.appendTurn.bind(UI);
      UI.appendTurn = function(){
        var r = oP.apply(this, arguments);
        try { rerenderStreamV118(); } catch(e){}
        return r;
      };
    }
    UI.__v118SHooked = true;
  }

  function cleanStored(){
    try {
      var s = getCast();
      var changed = false;
      var turns = s.turns || [];
      for (var i = 0; i < turns.length; i++){
        var t = turns[i];
        if (t && t.narrative){
          var clean = strongCleanV118(t.narrative);
          if (clean !== t.narrative){ t.narrative = clean; changed = true; }
        }
      }
      if (changed){
        setCast(s);
        if (typeof UI === 'object' && typeof UI.renderAll === 'function'){
          try { UI.renderAll(); } catch(e){}
        }
      }
    } catch(e){}
  }

  function init(){
    hookSave();
    hookStream();
    cleanStored();
    try { rerenderStreamV118(); } catch(e){}
  }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  setTimeout(init, 800);
  setTimeout(init, 2500);
  setTimeout(init, 5000);

  console.log(TAG, 'v118 active: gender persist + vocative + spiral kill');
})();
