/* v137: continuity reminder + DIALOGUES validation */
(function v137(){
  'use strict';
  var TAG = '[v137]';
  if (window.__v137Active) return;
  window.__v137Active = true;

  var CONTINUITY = '\n\n# シーン連続性（厳守）\n直前のターンの場面・時間・登場人物・状況を引き継ぎ、急な場面転換は禁止。同じ場所・同じ時間軸で物語を継続すること。場所を変える場合は narrative 内で明示的な移動描写（「○○へ向かった」等）を含めること。\n\n# DIALOGUES の話者判定（追加ルール）\n- 「貴様」「お前」「俺」「ねえぞ」「やがる」「だぜ」「だぞ」「じゃねえ」「やろう」を含む発話 → 男性NPC（盗賊・兵士・男など）に振る。女性キャラ（セシリア・アリア等）には絶対振らない\n- 「やめて」「お願い」「だわ」「かしら」「なの」を含む発話 → 女性キャラ（被害者）に振る\n- 「○○から離れろ」「○○を放して」のような他者を呼ぶ発話の話者は ○○ ではない別人\n- 同じ人が3回以上連続で話すのは不自然、交互の対話を心がける\n';

  function getCast(){ try { return JSON.parse(localStorage.getItem('chr6') || '{}'); } catch(e){ return {}; } }
  function setCast(s){ localStorage.setItem('chr6', JSON.stringify(s)); }

  var prevFetch = window.fetch.bind(window);
  window.fetch = function(input, init){
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var isApi = /openrouter\.ai|api\.anthropic\.com|api\.openai\.com/.test(url);

    if (isApi && init && init.body){
      try {
        var body = JSON.parse(init.body);
        if (body.messages && Array.isArray(body.messages) && body.messages.length){
          for (var i = body.messages.length - 1; i >= 0; i--){
            if (body.messages[i].role === 'system'){
              body.messages[i].content = (body.messages[i].content || '') + CONTINUITY;
              break;
            }
          }
          init.body = JSON.stringify(body);
        }
      } catch(e){}
    }

    return prevFetch(input, init);
  };

  var MASC_RX = /(貴様|お前|俺|ねえぞ|やがる|じゃねえ|だぜ|だぞ|やろう|てめえ|おう|だなあ)/;
  var FEM_RX = /(やめて|お願い|だわ|かしら|なの|ですわ|わよ|なのです|嫌|いや|怖い|許して|助けて)/;

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

  function selfReferenceFix(text, currentSpeaker, cast){
    var allNames = [];
    if (cast.hero && cast.hero.name) allNames.push(cast.hero.name);
    (cast.npcs || []).forEach(function(n){ if (n && n.name) allNames.push(n.name); });

    for (var i = 0; i < allNames.length; i++){
      var name = allNames[i];
      var esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var rx = new RegExp(esc + '(?:から|を)(?:離れ|放し|解放|遠ざけ)');
      if (rx.test(text) && currentSpeaker === name){
        for (var j = 0; j < allNames.length; j++){
          if (allNames[j] !== name) return allNames[j];
        }
      }
    }
    return null;
  }

  function validateAndRepair(){
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

        var swap = selfReferenceFix(text, speaker, s.cast || {});
        if (swap){
          console.log(TAG, 'self-ref fix:', speaker, '→', swap, '|', text.slice(0, 30));
          d.speaker = swap;
          hadFix = true;
          speaker = swap;
        }

        var gender = genderOf(speaker, s.cast || {});
        if (gender === 'female' && MASC_RX.test(text)){
          var alt = findOppositeGender('female', s.cast || {}, speaker);
          if (alt){
            console.log(TAG, 'masc-fem fix:', speaker, '→', alt, '|', text.slice(0, 30));
            d.speaker = alt;
            hadFix = true;
          }
        }
        else if (gender === 'male' && FEM_RX.test(text) && !MASC_RX.test(text)){
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
      console.log(TAG, 'validated & repaired dialogues');
      try { if (typeof UI === 'object' && UI && UI.renderAll) UI.renderAll(); } catch(e){}
    }
  }

  function init(){
    setTimeout(validateAndRepair, 1500);
    setTimeout(validateAndRepair, 4000);
    setInterval(validateAndRepair, 8000);
  }

  if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', init); } else { init(); }

  console.log(TAG, 'v137 active: continuity + DIALOGUES validation');
})();
