/* v138: lenient JSON parse + extended masculine speech detection */
(function v138(){
  'use strict';
  var TAG = '[v138]';
  if (window.__v138Active) return;
  window.__v138Active = true;

  var MASC_RX_EXT = /(貴様|お前ら?|テメー|てめえ|俺|俺ら|オレ|オラ|ねえぞ|ねえな|やがる|やがった|やがって|じゃねえ|じゃねぇ|だぜ|だぞ|やろう|やんの|やんな|がな|だろうが|だろうな|へっ|フンッ|ハッ|ぐちゃぐちゃ|やがれ|くそが|ちくしょう|くたばれ|ふざけんな|なめんな|生意気|よほど|随分と|うるせえ|だまれ|やっちまえ|犯し|嬲|凌辱|嫐)/;

  var FEM_RX_EXT = /(やめて|お願い|だわ|かしら|なの|ですわ|わよ|なのです|嫌|いや|怖い|許して|助けて|くださいませ|ごめんなさい|あぁん|あぁっ|ああん|くださる|ください|嬉しい|悲しい|寂しい)/;

  function getCast(){ try { return JSON.parse(localStorage.getItem('chr6') || '{}'); } catch(e){ return {}; } }
  function setCast(s){ localStorage.setItem('chr6', JSON.stringify(s)); }

  function repairJson(jsonStr){
    if (!jsonStr) return jsonStr;
    var s = jsonStr;
    s = s.replace(/,(\s*[\]}])/g, '$1');
    s = s.replace(/^\uFEFF/, '').trim();
    s = s.replace(/,\s*$/, '');
    return s;
  }

  function tryParseDialogues(content){
    if (!content) return null;
    var m = content.match(/<DIALOGUES>([\s\S]*?)<\/DIALOGUES>/);
    if (!m) return null;
    var inner = m[1].trim();
    try { return JSON.parse(inner); } catch(e){}
    try { return JSON.parse(repairJson(inner)); } catch(e){}
    var arrMatch = inner.match(/\[([\s\S]*)\]/);
    if (arrMatch){
      try { return JSON.parse('[' + repairJson(arrMatch[1]) + ']'); } catch(e){}
    }
    try {
      var objs = [];
      var rx = /\{[^{}]*"speaker"[^{}]*\}/g;
      var mm;
      while ((mm = rx.exec(inner)) !== null){
        try { objs.push(JSON.parse(repairJson(mm[0]))); } catch(e){}
      }
      if (objs.length) return objs;
    } catch(e){}
    return null;
  }

  var prevFetch = window.fetch.bind(window);
  window.fetch = function(input, init){
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var isApi = /openrouter\.ai|api\.anthropic\.com|api\.openai\.com/.test(url);
    var p = prevFetch(input, init);
    if (!isApi) return p;
    return p.then(function(originalResponse){
      try {
        originalResponse.clone().text().then(function(text){
          try {
            var resp = JSON.parse(text);
            var content = '';
            if (resp.choices && resp.choices[0] && resp.choices[0].message){
              content = resp.choices[0].message.content || '';
            } else if (resp.content && resp.content[0]){
              content = resp.content[0].text || '';
            }
            if (content){
              var dialogues = tryParseDialogues(content);
              if (Array.isArray(dialogues) && dialogues.length){
                window.__v138_pending = dialogues;
                console.log(TAG, 'rescued', dialogues.length, 'dialogues via lenient parse');
              }
            }
          } catch(e){}
        });
      } catch(e){}
      return originalResponse;
    });
  };

  setInterval(function(){
    if (!window.__v138_pending) return;
    var s = getCast();
    var turns = s.turns || [];
    if (!turns.length) return;
    var last = turns[turns.length - 1];
    if (last.dialogues && last.dialogues.length) return;
    last.dialogues = window.__v138_pending;
    setCast(s);
    window.__v138_pending = null;
    console.log(TAG, 'attached rescued dialogues to turn #' + (turns.length - 1));
    try { if (typeof UI === 'object' && UI && UI.renderAll) UI.renderAll(); } catch(e){}
  }, 500);

  function genderOf(name, cast){
    if (!name) return null;
    var hero = cast.hero || {};
    if (hero.name === name) return hero.gender || null;
    var npcs = cast.npcs || [];
    for (var i = 0; i < npcs.length; i++){
      if (npcs[i] && npcs[i].name === name) return npcs[i].gender || null;
    }
    return null;
  }

  function findOppositeGender(currentGender, cast, exclude){
    var hero = cast.hero || {};
    var npcs = cast.npcs || [];
    var target = currentGender === 'male' ? 'female' : 'male';
    if (hero.gender === target && hero.name !== exclude) return hero.name;
    for (var i = 0; i < npcs.length; i++){
      if (npcs[i] && npcs[i].gender === target && npcs[i].name !== exclude) return npcs[i].name;
    }
    for (var i = 0; i < npcs.length; i++){
      if (npcs[i] && npcs[i].name !== exclude) return npcs[i].name;
    }
    return null;
  }

  function inferGender(name){
    if (!name) return null;
    if (/^(盗賊|兵士|衛兵|男|爺|親父|王|騎士|戦士|魔王)/.test(name)) return 'male';
    if (/^(姫|妃|令嬢|女|娘|魔女|修道女|少女|乙女|花嫁)/.test(name)) return 'female';
    return null;
  }

  function validateAndRepairAll(){
    var s = getCast();
    var turns = s.turns || [];
    var changed = false;
    turns.forEach(function(t){
      if (!t.dialogues || !Array.isArray(t.dialogues)) return;
      t.dialogues.forEach(function(d){
        if (!d || !d.text || !d.speaker) return;
        var text = d.text;
        var speaker = d.speaker;
        var hadFix = false;
        var gender = genderOf(speaker, s.cast || {}) || inferGender(speaker);
        if (gender === 'female' && MASC_RX_EXT.test(text)){
          var alt = findOppositeGender('female', s.cast || {}, speaker);
          if (alt){
            console.log(TAG, 'masc-fem fix:', speaker, '→', alt, '|', text.slice(0, 30));
            d.speaker = alt;
            hadFix = true;
          }
        }
        else if (gender === 'male' && FEM_RX_EXT.test(text) && !MASC_RX_EXT.test(text)){
          var alt = findOppositeGender('male', s.cast || {}, speaker);
          if (alt){
            console.log(TAG, 'fem-masc fix:', speaker, '→', alt, '|', text.slice(0, 30));
            d.speaker = alt;
            hadFix = true;
          }
        }
        if (hadFix) changed = true;
      });
    });
    if (changed){
      setCast(s);
      console.log(TAG, 'repaired all turns');
      try { if (typeof UI === 'object' && UI && UI.renderAll) UI.renderAll(); } catch(e){}
    }
  }

  function init(){
    setTimeout(validateAndRepairAll, 1500);
    setTimeout(validateAndRepairAll, 4500);
    setInterval(validateAndRepairAll, 6000);
  }

  if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', init); } else { init(); }

  console.log(TAG, 'v138 active: lenient JSON + extended speech detection');
})();
