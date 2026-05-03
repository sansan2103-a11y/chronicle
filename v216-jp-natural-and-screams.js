/* v216-jp-natural-and-screams: dialect-strip + standard JP rule + scream repertoire */
(function v216(){
  'use strict';
  if (window.__v216Active) return;
  window.__v216Active = true;

  var KANSAI_RX = /(おおきに|おおきの|ほな|せや[なね]?|ちゃう|わて|めっちゃ|ほんま|ほんで|やるんけ|やで|なんでやねん|ええやん|やってもうた|あかんやろ|なんぼ|どないし|どや顔|あほやな)/;
  var ARCHAIC_RX = /(というた|しろうた|見たあった|ござる|ござります|候|でござ[るい]|奉る|えたまわる)/;
  var CLASSICAL_RX = /(可憐な|誠に|然らば|斯くて|是に|然れども|嘸呼|然るに|蓋し|且つ又|凡そ|畢竟|頗る)/;

  function findUnnatural(t){
    if(!t)return [];
    var found = [];
    var m;
    if((m = t.match(KANSAI_RX))) found.push({k:'関西弁', s:m[0]});
    if((m = t.match(ARCHAIC_RX))) found.push({k:'古語', s:m[0]});
    if((m = t.match(CLASSICAL_RX))) found.push({k:'古典', s:m[0]});
    return found;
  }

  var REPLACE = [
    [/おおきに/g, 'ありがとう'],
    [/おおきの/g, 'ありがとう'],
    [/ほな/g, 'じゃあ'],
    [/せやな/g, 'そうだね'],
    [/せや/g, 'そうだ'],
    [/ちゃう/g, '違う'],
    [/わて/g, '私'],
    [/めっちゃ/g, 'すごく'],
    [/ほんま/g, '本当'],
    [/ほんで/g, 'それで'],
    [/というた/g, 'と言った'],
    [/しろうた/g, 'した'],
    [/服というた/g, '服を'],
    [/ござ[るい]ます/g, 'です'],
    [/でござる/g, 'だ']
  ];

  function normalize(t){
    if(!t)return t;
    var out = t;
    REPLACE.forEach(function(p){ out = out.replace(p[0], p[1]); });
    return out;
  }

  function reprocessTurns(){
    var s; try { s = JSON.parse(localStorage.getItem('chr6')||'{}'); } catch(e){ return; }
    var turns = s.turns || [];
    var changed = false;
    turns.forEach(function(t){
      if(!t)return;
      if(t.narrative){
        var n2 = normalize(t.narrative);
        if(n2 !== t.narrative){
          var found = findUnnatural(t.narrative);
          if(found.length) console.log('[v216] normalized:', found.map(function(f){return f.k+':'+f.s;}).join(', '));
          t.narrative = n2;
          changed = true;
        }
      }
      if(Array.isArray(t.dialogues)){
        t.dialogues.forEach(function(d){
          if(!d || !d.text)return;
          var d2 = normalize(d.text);
          if(d2 !== d.text){ d.text = d2; changed = true; }
        });
      }
    });
    if(changed){
      try { localStorage.setItem('chr6', JSON.stringify(s)); } catch(e){}
      try { eval('UI.renderAll()'); } catch(e){}
    }
  }

  var NATURAL_JP = ['','','# 🎴 日本語の自然性ルール（最重要）','','## 必須：現代標準語のみ','- すべての地の文・セリフは **東京式の現代標準語**','- 方言・古語・漢文調・候文は **使用禁止**','','## 🚫 禁止表現','- ❌ 関西弁：「おおきに」「ほな」「せや」「ちゃう」「わて」「めっちゃ」「ほんま」','- ❌ 古語：「というた」「しろうた」「ござる」「ござります」「奉る」「候」','- ❌ 不自然な口語崩壊：「服というた」「と言うた」「しろうた」','','## ✅ 正しい例','- 「ありがとう」「じゃあ」「違う」「私」','- 「すごい」「本当」「と言った」「した」','','## キャラごとの口調差','- キャラの個性は **語尾・一人称・敬語の有無** で出す','- 「〜だぜ」「〜じゃない？」「〜ですわ」「〜だわ」「〜だぞ」など','- ただし **方言ではなく現代標準語のバリエーション** に留める'].join('\n');

  var SCREAM = ['','','# 😱 悲鳴・絶叫・痛みの表現（高ストレス時必須）','','NPCの **stress >= 70** または **苦痛・恐怖の場面** では、','以下のような表現を **積極的に** 使ってください：','','## 悲鳴・絶叫','- 「きゃあああ！」「きゃー！」「きゃっ！」','- 「いやああ！」「いやだいやだ！」「いやー！」','- 「ひぃっ！」「ひぃいい！」「ひっ……」','- 「ぎゃあああ！」「ぎゃっ！」','- 「うわああ！」「うあああ……」','- 「ああああ！」「あああっ！」','','## 痛みの叫び','- 「痛い痛い痛い！」「いた、いたい！」「いたあああい！」','- 「やめて！やめてくれ！」「やめてやめて！」','- 「お願い、お願いだから……！」','- 「やめろやめろ！」「離せ！離してくれ！」','','## 嘆願・恐怖','- 「助けて！」「だれか助けて……！」','- 「もうやめて……」「お願い、もう許して……」','- 「く……っ！」「ぐぅ……っ！」「うっ……ぅ……」','','## 内心の悲鳴（《》で表現）','- 《いやだ、いやだ……》','- 《もう限界、もう無理……》','- 《助けて、誰か……！》','- 《痛い……痛い、痛い、痛い……》','','## 必須','- 苦痛・恐怖の場面では **最低1回はこれらの表現** を使う','- 同じ表現の連発を避け、**バリエーション** を出す','- 長音「ああ」「いい」「うう」を **2文字以上** 重ねる','- 感嘆符「！」「？！」「……！」を活用'].join('\n');

  var origFetch = window.fetch.bind(window);
  window.fetch = function(input, init){
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var isApi = /openrouter\.ai|api\.anthropic\.com|api\.openai\.com/.test(url);
    if (isApi && init && init.body){
      try {
        var body = JSON.parse(init.body);
        if (body.messages){
          for (var i = body.messages.length - 1; i >= 0; i--){
            if (body.messages[i].role === 'system'){
              var c = body.messages[i].content || '';
              if (c.indexOf('# 🎴 日本語の自然性ルール') < 0){ c = c + NATURAL_JP; }
              if (c.indexOf('# 😱 悲鳴・絶叫・痛みの表現') < 0){ c = c + SCREAM; }
              body.messages[i].content = c;
              break;
            }
          }
          init.body = JSON.stringify(body);
        }
      } catch(e){}
    }
    return origFetch(input, init);
  };

  function init(){
    setTimeout(function(){ reprocessTurns(); }, 1500);
    setInterval(function(){ reprocessTurns(); }, 5000);
    console.log('[v216] active: natural JP + scream repertoire');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.__v216 = { findUnnatural: findUnnatural, normalize: normalize, reprocessTurns: reprocessTurns };
})();
