/* v215-cn-strip-and-lock: CN strip + JP-only prompt + user-gender lock */
(function v215(){
  'use strict';
  if (window.__v215Active) return;
  window.__v215Active = true;

  var CN_PARTICLES = /[呀嗎吧呢啊嘛咯喔哦嗯咦囉啦哎哇耶噢]/;
  var CN_WORDS = /(了結|怎麼|什麼|這個|那個|這裡|那裡|沒有|沒事|好嗎|是嗎|来了|去了|對的|對啊|不是這樣的|怎么|什么|为什么|不是|沒事)/;

  function containsCN(t){ if(!t)return false; return CN_PARTICLES.test(t)||CN_WORDS.test(t); }
  function stripCNFromText(t){
    if(!t)return t;
    t = t.replace(CN_WORDS, function(m){ console.log('[v215] CN word:', m); return ''; });
    t = t.replace(/[呀嗎嘛吧呢啊咯喔哦嗯咦囉啦哎哇噢]/g, function(m){ console.log('[v215] CN particle:', m); return ''; });
    t = t.replace(/「\s*」/g, '');
    t = t.replace(/[、。]\s*[、。]/g, '。');
    return t;
  }

  function reprocessTurns(){
    var s; try { s = JSON.parse(localStorage.getItem('chr6')||'{}'); } catch(e){ return; }
    var turns = s.turns || [];
    var changed = false;
    turns.forEach(function(t){
      if(!t)return;
      if(t.narrative && containsCN(t.narrative)){
        var c2 = stripCNFromText(t.narrative);
        if(c2 !== t.narrative){ t.narrative = c2; changed = true; }
      }
      if(Array.isArray(t.dialogues)){
        t.dialogues.forEach(function(d){
          if(d && d.text && containsCN(d.text)){
            var cd = stripCNFromText(d.text);
            if(cd !== d.text){ d.text = cd; changed = true; }
          }
        });
      }
    });
    if(changed){
      try { localStorage.setItem('chr6', JSON.stringify(s)); } catch(e){}
      try { eval('UI.renderAll()'); } catch(e){}
    }
  }

  var STRONG_JP = ['','','# 言語ルール（最重要）','','- 出力は完全に日本語のみ','- 中国語の語尾粒子 呀嗎嘛吧呢啊 を使わない','- 中国語表現 了結/怎麼/什麼/這個 使用禁止','- 例：「どういう了結呀？」→「どういうこと？」'].join('\n');

  var origFetch = window.fetch.bind(window);
  window.fetch = function(input, init){
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var isApi = /openrouter\.ai|api\.anthropic\.com|api\.openai\.com/.test(url);
    if (isApi && init && init.body){
      try {
        var body = JSON.parse(init.body);
        if (body.messages){
          for (var i = body.messages.length-1; i >= 0; i--){
            if (body.messages[i].role === 'system'){
              var c = body.messages[i].content || '';
              if (c.indexOf('# 言語ルール') < 0){
                body.messages[i].content = c + STRONG_JP;
              }
              break;
            }
          }
          init.body = JSON.stringify(body);
        }
      } catch(e){}
    }
    return origFetch(input, init);
  };

  function findCharByContext(radio){
    var name = radio.name || '';
    if (name === 'v108g_hero') return {type: 'hero', idx: -1};
    var card = radio.closest('.npc-card, [class*="npc"]');
    if (card){
      var cards = document.querySelectorAll('.npc-card');
      var idx = Array.from(cards).indexOf(card);
      return {type: 'npc', idx: idx};
    }
    return null;
  }

  function lockGender(t, idx, g){
    if (!g || (g !== '女性' && g !== '男性')) return;
    var s; try { s = JSON.parse(localStorage.getItem('chr6')||'{}'); } catch(e){ return; }
    s.cast = s.cast || {};
    if (t === 'hero'){
      s.cast.hero = s.cast.hero || {};
      s.cast.hero._userGender = g;
      s.cast.hero.gender = g;
      console.log('[v215] LOCKED hero:', g);
    } else if (t === 'npc'){
      s.cast.npcs = s.cast.npcs || [];
      if (s.cast.npcs[idx]){
        s.cast.npcs[idx]._userGender = g;
        s.cast.npcs[idx].gender = g;
        console.log('[v215] LOCKED npc[' + idx + ']:', g);
      }
    }
    try { localStorage.setItem('chr6', JSON.stringify(s)); } catch(e){}
  }

  function bindRadios(){
    document.querySelectorAll('input[type="radio"]').forEach(function(r){
      if (r.__v215Bound) return;
      var v = r.value, name = r.name || '';
      if ((v === '女性' || v === '男性') && /v108g/i.test(name)){
        r.__v215Bound = true;
        var h = function(){
          if (!r.checked) return;
          var ctx = findCharByContext(r);
          if (ctx) lockGender(ctx.type, ctx.idx, r.value);
        };
        r.addEventListener('change', h);
        r.addEventListener('click', h);
      }
    });
  }

  function patchAutoFix(){
    if (window.__v214 && !window.__v214.__v215P){
      window.__v214.aggressiveFix = function(){
        var s; try { s = JSON.parse(localStorage.getItem('chr6')||'{}'); } catch(e){ return; }
        if (!s.cast) return;
        var changed = false;
        function fix(c){
          if (!c || !c.name || !c.gender) return;
          if (c._userGender) return;
          var v = window.__v213;
          if (!v.validatePair(c.name, c.gender)){
            c.name = v.pickName(c.gender);
            changed = true;
            if (c.desc){ c.desc = c.desc.replace(/性別[:：]\s*[男女][性]?。?/, '性別: ' + c.gender + '。'); }
          }
        }
        if (s.cast.hero) fix(s.cast.hero);
        (s.cast.npcs || []).forEach(fix);
        if (changed){ try { localStorage.setItem('chr6', JSON.stringify(s)); } catch(e){} }
      };
      window.__v214.__v215P = true;
    }
  }

  function init(){
    setTimeout(function(){ reprocessTurns(); bindRadios(); patchAutoFix(); }, 1500);
    setInterval(function(){ reprocessTurns(); bindRadios(); patchAutoFix(); }, 4000);
    var mo = new MutationObserver(function(){ bindRadios(); });
    mo.observe(document.body, { childList: true, subtree: true });
    console.log('[v215] active: CN strip + JP rule + gender lock');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.__v215 = { containsCN: containsCN, stripCNFromText: stripCNFromText, reprocessTurns: reprocessTurns, lockGender: lockGender };
})();
