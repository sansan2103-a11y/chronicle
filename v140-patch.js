/* v140 EMERGENCY: gender inference + narrative status-list strip + forced reattribution */
(function v140(){
  'use strict';
  var TAG = '[v140]';
  if (window.__v140Active) return;
  window.__v140Active = true;

  var STRONG_MASC = /(貴様|テメー|てめえ|やがる|やがった|やがれ|じゃねえ|じゃねぇ|だぜ|だぞ|やんの|やんな|だろうがな|くたばれ|ふざけんな|なめんな|ちくしょう|くそが|うるせえ|だまれ|やっちまえ|犯し|嬲|凌辱|淫乱女|このまんこ|お前のした|貴様は|きさま|オラ)/;

  var STRONG_FEM = /(やめて|お願い|許して|助けて|かしら|ですわ|なのです|くださいませ|ごめんなさい|あぁん|嬉しい|寂しい|ありがとう|なさって)/;

  var FEM_NAME_RX = /^(セシリア|アリア|エマ|アリス|リリ|サラ|エリ|ミア|ラナ|エヴァ|リン|アンナ|マリア|ソフィア|ルナ|ナナ|ユリ|スズ|ユイ|アイ|レイ|ミナ|エルザ|ヘレン|ベル|ラミィ|ティナ|ニナ|アイネ|エラ|ノア|ローザ|セレ|ルル|エル|ビビ|ココ|ルー)/;
  var MASC_NAME_RX = /^(盗賊|兵士|衛兵|男|爺|親父|王|騎士|戦士|魔王|アレク|アーサー|ジョン|トム|ボブ|マーク|ライ|ケン|タロ|ジロ|ハル|シン|ダン|レオ|アル|オット)/;

  function getCast(){ try { return JSON.parse(localStorage.getItem('chr6') || '{}'); } catch(e){ return {}; } }
  function setCast(s){ localStorage.setItem('chr6', JSON.stringify(s)); }

  function inferGender(name){
    if (!name) return null;
    if (FEM_NAME_RX.test(name)) return 'female';
    if (MASC_NAME_RX.test(name)) return 'male';
    return null;
  }

  function getEffectiveGender(name, cast){
    var hero = cast.hero || {};
    if (hero.name === name && hero.gender) return hero.gender;
    var npcs = cast.npcs || [];
    for (var i = 0; i < npcs.length; i++){
      if (npcs[i] && npcs[i].name === name && npcs[i].gender) return npcs[i].gender;
    }
    return inferGender(name);
  }

  function findNonAggressorMale(cast, exclude){
    var hero = cast.hero || {};
    var npcs = cast.npcs || [];
    if (hero.name !== exclude){
      var hg = getEffectiveGender(hero.name, cast);
      if (hg === 'male') return hero.name;
    }
    for (var i = 0; i < npcs.length; i++){
      var n = npcs[i];
      if (!n || !n.name || n.name === exclude) continue;
      var g = getEffectiveGender(n.name, cast);
      if (g === 'male') return n.name;
    }
    for (var i = 0; i < npcs.length; i++){
      if (npcs[i] && npcs[i].name && npcs[i].name !== exclude) return npcs[i].name;
    }
    return null;
  }

  function findNonAggressorFemale(cast, exclude){
    var hero = cast.hero || {};
    var npcs = cast.npcs || [];
    if (hero.name !== exclude){
      var hg = getEffectiveGender(hero.name, cast);
      if (hg === 'female') return hero.name;
    }
    for (var i = 0; i < npcs.length; i++){
      var n = npcs[i];
      if (!n || !n.name || n.name === exclude) continue;
      var g = getEffectiveGender(n.name, cast);
      if (g === 'female') return n.name;
    }
    return null;
  }

  function repairDialogues(){
    var s = getCast();
    var turns = s.turns || [];
    var changed = false;
    turns.forEach(function(t){
      if (!t.dialogues || !Array.isArray(t.dialogues)) return;
      t.dialogues.forEach(function(d){
        if (!d || !d.text || !d.speaker) return;
        var text = d.text;
        var speaker = d.speaker;
        var gender = getEffectiveGender(speaker, s.cast || {});
        var hasStrongMasc = STRONG_MASC.test(text);
        var hasStrongFem = STRONG_FEM.test(text);

        if (gender === 'female' && hasStrongMasc){
          var alt = findNonAggressorMale(s.cast || {}, speaker);
          if (alt){
            console.log(TAG, 'masc-fem fix:', speaker, '→', alt, '|', text.slice(0, 40));
            d.speaker = alt;
            changed = true;
            return;
          }
        }
        if (gender === 'male' && hasStrongFem && !hasStrongMasc){
          var alt = findNonAggressorFemale(s.cast || {}, speaker);
          if (alt){
            console.log(TAG, 'fem-masc fix:', speaker, '→', alt, '|', text.slice(0, 40));
            d.speaker = alt;
            changed = true;
            return;
          }
        }
        if (!gender && hasStrongMasc && FEM_NAME_RX.test(speaker)){
          var alt = findNonAggressorMale(s.cast || {}, speaker);
          if (alt){
            console.log(TAG, 'unknown-masc fix:', speaker, '→', alt, '|', text.slice(0, 40));
            d.speaker = alt;
            changed = true;
            return;
          }
        }
      });
    });
    if (changed){
      setCast(s);
      console.log(TAG, 'dialogues repaired');
      try { if (typeof UI === 'object' && UI && UI.renderAll) UI.renderAll(); } catch(e){}
    }
  }

  function cleanNarratives(){
    var s = getCast();
    var turns = s.turns || [];
    var changed = false;
    turns.forEach(function(t){
      if (!t.narrative) return;
      var orig = t.narrative;
      var clean = orig.replace(/^[\s]*[-*・]\s*[一-鿿ぁ-ゖァ-ヺ・]+\s*[：:]\s*[^\n]+\n?/gm, '');
      clean = clean.replace(/^[\s]*(Status|Character|Note|Notes|状態|登場人物|キャラ|キャラクター)\s*[：:][^\n]*\n?/gm, '');
      clean = clean.replace(/\n{3,}/g, '\n\n').trim();
      if (clean !== orig && clean.length > 50){
        t.narrative = clean;
        changed = true;
        console.log(TAG, 'cleaned narrative status-list');
      }
    });
    if (changed){
      setCast(s);
      try { if (typeof UI === 'object' && UI && UI.renderAll) UI.renderAll(); } catch(e){}
    }
  }

  function init(){
    setTimeout(repairDialogues, 1500);
    setTimeout(cleanNarratives, 2000);
    setTimeout(repairDialogues, 4500);
    setTimeout(cleanNarratives, 5000);
    setInterval(function(){ repairDialogues(); cleanNarratives(); }, 6000);
  }

  if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', init); } else { init(); }

  console.log(TAG, 'v140 active: gender inference + narrative status-strip');
})();
