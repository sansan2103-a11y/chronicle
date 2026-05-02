/* v124: ephemeral auto-register from prefix + wider subject markers */
(function v124(){
  'use strict';
  var TAG = '[v124]';
  if (window.__v124Active) return;
  window.__v124Active = true;

  function getCast(){
    try { return JSON.parse(localStorage.getItem('chr6') || '{}'); }
    catch(e){ return {}; }
  }
  function setCast(s){ localStorage.setItem('chr6', JSON.stringify(s)); }

  function nicknames(name){
    if (!name) return [];
    var out = [name];
    if (name.indexOf('・') >= 0){
      var parts = name.split('・');
      parts.forEach(function(p){ if (p && p.length >= 2) out.push(p); });
    }
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

  /* Avatar URL builder */
  function avUrl(name){
    var d = name;
    var p = 'anime portrait of ';
    if (/盗賊|スパイ|密偵|無頼/.test(d)) p += 'a hooded rogue, sharp features, ';
    else if (/兵士|戦士|騎士/.test(d)) p += 'a battle hardened warrior, ';
    else if (/老|爺/.test(d)) p += 'an elderly weathered man, ';
    else if (/魔女/.test(d)) p += 'a witch, mystical aura, ';
    else if (/魔物|怪物|オーク/.test(d)) p += 'a monster creature, fantasy, ';
    else if (/狼|犬/.test(d)) p += 'a wolf creature, ';
    else if (/姫|嬢|令嬢/.test(d)) p += 'a noble lady, ';
    else p += 'a person, ';
    p += name + ', detailed face, dark fantasy, dramatic lighting';
    var seed = 0;
    for (var i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) & 0x7fffffff;
    return 'https://image.pollinations.ai/prompt/' + encodeURIComponent(p) +
           '?width=384&height=384&seed=' + seed + '&nologo=true&model=flux';
  }

  /* findCastOrEphemeral: lookup, and if not found AND name is plausible, register ephemeral */
  function findCastOrEphemeral(name){
    if (!name) return null;
    var info = findCast(name);
    if (info) return info;
    /* Filter out non-name words */
    if (name.length < 2 || name.length > 12) return null;
    if (/^(彼女|彼|それ|これ|あれ|誰|何|私|僕|俺|あなた|君|お前|奴|者|人|声|目|手|顔|心|首|腕|足|髪|肌|血|涙|息|気|何か|誰か|何処|どこ)/.test(name)) return null;
    /* Looks like a generic noun (盗賊/兵士/魔女/etc) or proper name → register ephemeral */
    try {
      var s = getCast();
      s.ephemerals = s.ephemerals || {};
      if (!s.ephemerals[name]){
        s.ephemerals[name] = { avatar: avUrl(name), firstSeen: Date.now() };
        setCast(s);
      }
      return { isHero: false, name: name, avatar: s.ephemerals[name].avatar };
    } catch(e){ return null; }
  }

  var FP_RX = /(私|わたし|僕|ぼく|俺|おれ|あたし|うち)(?:は|の|が|を|に|だ|、|，|。|…|でも)/;

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
          targets.push(name);
          break;
        }
      }
    });
    return targets;
  }

  /* Wide subject regex: は|が|も|もまた|の|、 */
  var WIDE_SUBJ_RX = /([一-鿿ぁ-ゖァ-ヺ々ー・]{2,12})(?:は|が|もまた|も(?![一-鿿])|の(?=[、。\s]|目|声|顔|手|心|腕|足|首|肌|血|涙|息|姿|背|表情|瞳|髪|頬|口|唇)|、(?=\s))/g;

  function attributeDialogue(narr, pos, dlgText, defSpk, heroName, npcs){
    var allNames = [heroName].concat(npcs.map(function(n){ return n && n.name; })).filter(Boolean);
    var vocativeTargets = findVocativeTargets(dlgText, allNames);

    /* 1. Explicit prefix WIDE: name + は/が/もまた/も */
    var before = narr.slice(Math.max(0, pos - 80), pos);
    var prefixMatch = before.match(/([一-鿿ぁ-ゖァ-ヺ々ー・]{2,12})(?:は|が|もまた|も)\s*[、。\s]?[^「\n]{0,30}$/);
    if (prefixMatch){
      var info = findCastOrEphemeral(prefixMatch[1]);
      if (info && vocativeTargets.indexOf(info.name) < 0) return info;
    }

    /* 1b. Postfix verb */
    var after = narr.slice(pos + dlgText.length + 2, pos + dlgText.length + 200);
    var postMatch = after.match(/^[\s　]*[とは]?[、。\s]*([一-鿿ぁ-ゖァ-ヺ々ー・]{2,12})(?:は|が)?[^。\n]{0,40}(?:嗚咽|懇願|呟|言っ|答え|叫ん|問い|呼ん|尋ね|応え|返し|笑っ|囁い|吐い|怒鳴|頷|呻い|喘い|告げ|添え|繰り返|つぶや|もらし)/);
    if (postMatch){
      var info2 = findCastOrEphemeral(postMatch[1]);
      if (info2 && vocativeTargets.indexOf(info2.name) < 0) return info2;
    }

    /* 2. First-person → hero */
    if (FP_RX.test(dlgText)){
      if (vocativeTargets.indexOf(heroName) < 0){
        var hero = findCast(heroName);
        if (hero) return hero;
      }
    }

    /* 3. Vocative implies non-speaker */
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

    /* 4. Subject of preceding sentence WIDE (with ephemeral registration) */
    var window2 = narr.slice(Math.max(0, pos - 200), pos);
    var subjMatches = [];
    var m;
    WIDE_SUBJ_RX.lastIndex = 0;
    while ((m = WIDE_SUBJ_RX.exec(window2)) !== null){
      var n = findCastOrEphemeral(m[1]);
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
    var m;
    WIDE_SUBJ_RX.lastIndex = 0;
    while ((m = WIDE_SUBJ_RX.exec(before)) !== null){
      var n = findCastOrEphemeral(m[1]);
      if (n) subjMatches.push({ pos: m.index, info: n });
    }
    if (subjMatches.length > 0){
      return subjMatches[subjMatches.length - 1].info;
    }
    return findCast(heroName);
  }

  function rerenderStreamV124(){
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
              info = findCastOrEphemeral(npcName);
              if (!info) info = { isHero: true, name: heroName, avatar: hero.avatar };
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
    if (typeof UI !== 'object' || !UI || UI.__v124SHooked) return;
    if (typeof UI.renderAll === 'function'){
      var oA = UI.renderAll.bind(UI);
      UI.renderAll = function(){
        var r = oA.apply(this, arguments);
        try { rerenderStreamV124(); } catch(e){}
        return r;
      };
    }
    if (typeof UI.appendTurn === 'function'){
      var oP = UI.appendTurn.bind(UI);
      UI.appendTurn = function(){
        var r = oP.apply(this, arguments);
        try { rerenderStreamV124(); } catch(e){}
        return r;
      };
    }
    UI.__v124SHooked = true;
  }

  function init(){
    hookStream();
    try { rerenderStreamV124(); } catch(e){}
  }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  setTimeout(init, 800);
  setTimeout(init, 2500);

  console.log(TAG, 'v124 active: ephemeral prefix + wide subject');
})();

