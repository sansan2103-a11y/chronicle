/* v131: object ban list + plea-cry routing + tightened speech verbs */
(function v131(){
  'use strict';
  var TAG = '[v131]';
  if (window.__v131Active) return;
  window.__v131Active = true;

  var OBJECT_RX = /^(衣服|服|下着|肌着|シャツ|スカート|スラックス|ズボン|ローブ|外套|マント|刀|剣|ナイフ|短刀|短剣|武器|盾|杖|弓|矢|鞘|鎧|甲冑|兜|靴|手袋|帽子|布|薄布|紐|縄|ロープ|鎖|床|壁|天井|扉|窓|椅子|机|テーブル|ベッド|寝台|燭台|蝋燭|灯|火|水|湯|布団|枕|シーツ|毛布|薬|毒|杯|皿|碗|箸|刃|刃先|切先|月|空|風|雨|雪|霧|闇|光|影|物音|足音|気配)$/;

  var SPEECH_VERBS = /(言う|言った|言って|呟く|呟いた|呟いて|呟き|叫ぶ|叫んだ|叫んで|叫び|問う|問うた|問い|答える|答えた|答え|応える|応えた|応え|返す|返した|怒鳴る|怒鳴った|怒鳴って|嘲る|嘲った|嘲り|罵る|罵った|罵り|喚く|喚いた|喚き|喘ぐ|喘いだ|呻く|呻いた|呻き|囁く|囁いた|囁き|懇願|嘆願|命じ|告げ|呼ぶ|呼んだ|呼び|尋ね|訊く|訊いた|訊き|問いか|つぶやい|もらし|漏らし|繰り返|つぶや|なおも|応じ|つぶ|溜息|ため息|口を開い|声を上げ|声を漏らし|口にし)/;

  var PLEA_RX = /(やめて|やめろ|許して|お願い|助けて|止めて|放して|離して|見ないで|触らないで|来ないで|怖い|嫌|いや|お助け|どうか|そんな|やだ|嫌だ|嫌です)/;

  var AGGRESSOR_RX = /(剥ぎ取|奪う|奪った|犯す|犯した|襲う|襲った|押さえつけ|掴む|掴んだ|引きずり|嘲笑|嘲り|嘲る|罵り|罵る|嬲|凌辱|陵辱|蹂躙|笑った|笑う|微笑|嗤|嗤う|嗤った|侮蔑|蔑む|蔑んだ|侮辱)/;

  function getCast(){ try { return JSON.parse(localStorage.getItem('chr6') || '{}'); } catch(e){ return {}; } }
  function setCast(s){ localStorage.setItem('chr6', JSON.stringify(s)); }

  function isObject(name){ if (!name) return false; return OBJECT_RX.test(name); }

  function findInfo(name){
    var s = getCast(); var c = s.cast || {}; var hero = c.hero || {};
    if (hero.name === name) return { name: hero.name, avatar: hero.avatar||'', isHero: true };
    var npcs = c.npcs || [];
    for (var i = 0; i < npcs.length; i++){ if (npcs[i] && npcs[i].name === name) return { name: npcs[i].name, avatar: npcs[i].avatar||'', isHero: false }; }
    if (s.ephemerals && s.ephemerals[name]){ return { name: name, avatar: s.ephemerals[name].avatar||'', isHero: false }; }
    return null;
  }

  function cleanObjectEphemerals(){
    var s = getCast(); if (!s.ephemerals) return;
    var changed = false;
    Object.keys(s.ephemerals).forEach(function(name){
      if (isObject(name)){ delete s.ephemerals[name]; changed = true; console.log(TAG,'removed object:',name); }
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

  function findNonAggressorSpeaker(narr, dlgText){
    var s = getCast(); var c = s.cast || {}; var hero = c.hero || {}; var heroName = hero.name || '';
    var npcs = c.npcs || [];
    var idx = narr.indexOf('「' + dlgText);
    if (idx < 0) idx = narr.indexOf(dlgText);
    var aggressorName = idx >= 0 ? findLastAggressor(narr, idx) : null;
    if (heroName && heroName !== aggressorName) return { name: heroName, avatar: hero.avatar||'', isHero: true };
    for (var i = 0; i < npcs.length; i++){
      var n = npcs[i];
      if (n && n.name && n.name !== aggressorName) return { name: n.name, avatar: n.avatar||'', isHero: false };
    }
    return null;
  }

  function reAttribute(){
    var stream = document.getElementById('dialogue-stream');
    if (!stream) return;
    var cards = stream.querySelectorAll('.v101-dlg-card');
    var s = getCast();
    var heroName = (s.cast && s.cast.hero && s.cast.hero.name) || '';
    var heroAvatar = (s.cast && s.cast.hero && s.cast.hero.avatar) || '';
    var turns = s.turns || [];
    var allNarr = turns.map(function(t){ return t.narrative || ''; }).join('\n\n');

    var lastValidSpeaker = null;
    cards.forEach(function(c){
      var body = c.children[1];
      var nameEl = body && body.children[0];
      var textEl = body && body.children[1];
      if (!nameEl || !textEl) return;
      var currentName = nameEl.innerText;
      var text = textEl.innerText;
      var innerMatch = text.match(/^《(.+)》$/);
      if (innerMatch){ if (!isObject(currentName)) lastValidSpeaker = findInfo(currentName) || lastValidSpeaker; return; }
      var dlgText = text;
      var newTarget = null;

      if (isObject(currentName)){
        newTarget = lastValidSpeaker || findNonAggressorSpeaker(allNarr, dlgText) || { name: heroName, avatar: heroAvatar, isHero: true };
      }
      else if (PLEA_RX.test(dlgText)){
        var idx = allNarr.indexOf('「' + dlgText);
        if (idx < 0) idx = allNarr.indexOf(dlgText);
        var aggressor = idx >= 0 ? findLastAggressor(allNarr, idx) : null;
        if (aggressor && aggressor === currentName){
          newTarget = findNonAggressorSpeaker(allNarr, dlgText) || lastValidSpeaker;
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
        if (!isObject(newTarget.name)) lastValidSpeaker = findInfo(newTarget.name);
      } else {
        if (!isObject(currentName)){
          var info = findInfo(currentName);
          if (info) lastValidSpeaker = info;
        }
      }
    });
  }

  function init(){
    cleanObjectEphemerals();
    setTimeout(reAttribute, 1200);
    setTimeout(cleanObjectEphemerals, 2000);
    setTimeout(reAttribute, 4000);
    setTimeout(cleanObjectEphemerals, 6000);
    setTimeout(reAttribute, 8000);
    var stream = document.getElementById('dialogue-stream');
    if (stream){
      var obs = new MutationObserver(function(){
        clearTimeout(window.__v131tmr);
        window.__v131tmr = setTimeout(function(){ cleanObjectEphemerals(); reAttribute(); }, 600);
      });
      obs.observe(stream, { childList: true, subtree: false });
    }
  }

  if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', init); } else { init(); }

  console.log(TAG, 'v131 active: object ban + plea routing');
})();
