/* v123: nickname (short-name) detection for vocative */
(function v123(){
  'use strict';
  var TAG = '[v123]';
  if (window.__v123Active) return;
  window.__v123Active = true;

  function getCast(){
    try { return JSON.parse(localStorage.getItem('chr6') || '{}'); }
    catch(e){ return {}; }
  }
  function setCast(s){ localStorage.setItem('chr6', JSON.stringify(s)); }

  /* Generate nicknames from a full name */
  function nicknames(name){
    if (!name) return [];
    var out = [name];
    if (name.indexOf('・') >= 0){
      var parts = name.split('・');
      parts.forEach(function(p){ if (p && p.length >= 2) out.push(p); });
    }
    if (name.indexOf(' ') >= 0){
      var parts2 = name.split(/\s+/);
      parts2.forEach(function(p){ if (p && p.length >= 2) out.push(p); });
    }
    /* Remove dupes */
    var seen = {};
    return out.filter(function(n){ if (seen[n]) return false; seen[n] = 1; return true; });
  }

  function findCast(name){
    if (!name) return null;
    var c = (getCast().cast || {});
    var h = c.hero || {};
    if (h.name){
      var hn = nicknames(h.name);
      if (hn.indexOf(name) >= 0 || (h.name.indexOf(name) >= 0 && name.length >= 2) || name.indexOf(h.name) === 0){
        return { isHero: true, name: h.name, avatar: h.avatar || '' };
      }
    }
    var npcs = c.npcs || [];
    for (var i = 0; i < npcs.length; i++){
      var n = npcs[i];
      if (!n || !n.name) continue;
      var nn = nicknames(n.name);
      if (nn.indexOf(name) >= 0 || (n.name.indexOf(name) >= 0 && name.length >= 2) || name.indexOf(n.name) === 0){
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

  /* Vocative — check ALL nicknames for each cast member */
  function findVocativeTargets(dlgText, allNames){
    var targets = [];
    allNames.forEach(function(name){
      if (!name) return;
      var nicks = nicknames(name);
      for (var i = 0; i < nicks.length; i++){
        var nick = nicks[i];
        var esc = nick.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var rxHonor = new RegExp(esc + '(?:さん|さま|様|くん|ちゃん|殿|氏)');
        var rxBare = new RegExp(esc + '(?:、|，|！|？|!|\\?|…|・|・・|〜|ー|っ|や|よ|ね|へ|に|を|。|\\.|だ|だっ)');
        var rxStart = new RegExp('^[\\s]*' + esc + '[、，！？!?…・〜ー。.]');
        if (rxHonor.test(dlgText) || rxBare.test(dlgText) || rxStart.test(dlgText)){
          targets.push(name); /* Push canonical name, not nickname */
          break;
        }
      }
    });
    return targets;
  }

  function attributeDialogue(narr, pos, dlgText, defSpk, heroName, npcs){
    var allNames = [heroName].concat(npcs.map(function(n){ return n && n.name; })).filter(Boolean);
    var vocativeTargets = findVocativeTargets(dlgText, allNames);

    /* 1. Explicit prefix */
    var before = narr.slice(Math.max(0, pos - 80), pos);
    var prefixMatch = before.match(/([一-鿿ぁ-ゖァ-ヺ々ー・]{2,12})(?:は|が|の)\s*$/);
    if (prefixMatch){
      var info = findCast(prefixMatch[1]);
      if (info && vocativeTargets.indexOf(info.name) < 0) return info;
    }

    /* 1b. Postfix WIDE */
    var after = narr.slice(pos + dlgText.length + 2, pos + dlgText.length + 200);
    var postMatch = after.match(/^[\s　]*[とは]?[、。\s]*([一-鿿ぁ-ゖァ-ヺ々ー・]{2,12})(?:は|が)?[^。\n]{0,40}(?:嗚咽|懇願|呟|言っ|答え|叫ん|問い|呼ん|尋ね|応え|返し|笑っ|囁い|吐い|怒鳴|頷|呻い|喘い|告げ|添え|繰り返|つぶや|もらし)/);
    if (postMatch){
      var info2 = findCast(postMatch[1]);
      if (info2 && vocativeTargets.indexOf(info2.name) < 0) return info2;
    }

    /* 2. First-person */
    if (FP_RX.test(dlgText)){
      if (vocativeTargets.indexOf(heroName) < 0){
        var hero = findCast(heroName);
        if (hero) return hero;
      }
    }

    /* 3. Vocative */
    if (vocativeTargets.length > 0){
      if (vocativeTargets.indexOf(heroName) >= 0){
        for (var i = 0; i < npcs.length; i++){
          var n = npcs[i];
          if (n && n.name && vocativeTargets.indexOf(n.name) < 0){
            return findCast(n.name);
          }
        }
      } else {
        var heroInfo = findCast(heroName);
        if (heroInfo) return heroInfo;
      }
    }

    /* 4. Subject of preceding sentence */
    var window2 = narr.slice(Math.max(0, pos - 200), pos);
    var subjMatches = [];
    var subjRx = /([一-鿿ぁ-ゖァ-ヺ々ー・]{2,12})(?:は|が)/g;
    var m;
    while ((m = subjRx.exec(window2)) !== null){
      var n = findCast(m[1]);
      if (n && vocativeTargets.indexOf(n.name) < 0){
        subjMatches.push({ pos: m.index, info: n });
      }
    }
    if (subjMatches.length > 0){
      return subjMatches[subjMatches.length - 1].info;
    }
    return null;
  }

  function attributeInnerThought(narr, pos, innerText, heroName, npcs){
    if (FP_RX.test(innerText)){
      var hero = findCast(heroName);
      if (hero) return hero;
    }
    var before = narr.slice(Math.max(0, pos - 200), pos);
    var subjMatches = [];
    var subjRx = /([一-鿿ぁ-ゖァ-ヺ々ー・]{2,12})(?:は|が|の)/g;
    var m;
    while ((m = subjRx.exec(before)) !== null){
      var n = findCast(m[1]);
      if (n) subjMatches.push({ pos: m.index, info: n });
    }
    if (subjMatches.length > 0){
      return subjMatches[subjMatches.length - 1].info;
    }
    return findCast(heroName);
  }

  function rerenderStreamV123(){
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

      var items = [];
      var rxDlg = /「([^「」\n]{1,300})」/g;
      var rxInn = /《([^《》\n]{1,300})》/g;
      var m;
      while ((m = rxDlg.exec(narr)) !== null){
        items.push({ pos: m.index, type: 'dlg', text: m[1] });
      }
      while ((m = rxInn.exec(narr)) !== null){
        items.push({ pos: m.index, type: 'inn', text: m[1] });
      }
      items.sort(function(a, b){ return a.pos - b.pos; });

      var innerCount = 0;
      items.forEach(function(it){
        if (!it.text || /^[\.\。\…\s]{1,3}$/.test(it.text.trim())) return;
        if (/送信|再生成|取消|続きを書く/.test(it.text)) return;

        if (it.type === 'dlg'){
          var info = attributeDialogue(narr, it.pos, it.text, npcName, heroName, npcs);
          if (!info){
            if (npcName){
              info = findCast(npcName);
              if (!info){ var eph = getEph(npcName); info = { isHero: false, name: npcName, avatar: eph.avatar }; }
            } else {
              info = { isHero: true, name: heroName, avatar: hero.avatar };
            }
          }
          addCard({ speaker: info.name, text: it.text, isHero: info.isHero, avatar: info.avatar });
        } else {
          if (++innerCount > 3) return;
          var info2 = attributeInnerThought(narr, it.pos, it.text, heroName, npcs);
          if (!info2) info2 = { isHero: true, name: heroName, avatar: hero.avatar };
          addCard({ speaker: info2.name, text: '《' + it.text + '》', isHero: info2.isHero, avatar: info2.avatar, inner: true });
        }
      });
    });

    stream.scrollTop = stream.scrollHeight;
  }

  function hookStream(){
    if (typeof UI !== 'object' || !UI || UI.__v123SHooked) return;
    if (typeof UI.renderAll === 'function'){
      var oA = UI.renderAll.bind(UI);
      UI.renderAll = function(){
        var r = oA.apply(this, arguments);
        try { rerenderStreamV123(); } catch(e){}
        return r;
      };
    }
    if (typeof UI.appendTurn === 'function'){
      var oP = UI.appendTurn.bind(UI);
      UI.appendTurn = function(){
        var r = oP.apply(this, arguments);
        try { rerenderStreamV123(); } catch(e){}
        return r;
      };
    }
    UI.__v123SHooked = true;
  }

  function init(){
    hookStream();
    try { rerenderStreamV123(); } catch(e){}
  }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  setTimeout(init, 800);
  setTimeout(init, 2500);

  console.log(TAG, 'v123 active: nickname vocative detection');
})();
