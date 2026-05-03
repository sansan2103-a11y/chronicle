/* v217-strict-jp-whitelist: foreign-script strip + grammar fix + dedupe */
(function v217(){
  'use strict';
  if (window.__v217Active) return;
  window.__v217Active = true;

  var SCRIPTS = {
    cyrillic: /[Ѐ-ӿԀ-ԯ]/,
    hangul: /[가-힯ᄀ-ᇿ㄰-㆏]/,
    thai: /[฀-๿]/,
    greek: /[Ͱ-Ͽἀ-῿]/,
    arabic: /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/,
    devanagari: /[ऀ-ॿ]/,
    hebrew: /[֐-׿]/
  };

  function detectForeign(t){
    if(!t)return [];
    var found = [];
    for(var k in SCRIPTS){
      var rx = new RegExp(SCRIPTS[k].source + '+', 'g');
      var ms = t.match(rx);
      if(ms) ms.forEach(function(m){ found.push({s:k, t:m}); });
    }
    return found;
  }

  function stripForeign(t){
    if(!t)return t;
    var out = t;
    Object.keys(SCRIPTS).forEach(function(name){
      var rx = new RegExp(SCRIPTS[name].source + '+', 'g');
      out = out.replace(rx, function(m){ console.log('[v217] strip', name, ':', m); return ''; });
    });
    out = out.replace(/「\s*」/g, '');
    out = out.replace(/[、。]\s*[、。]/g, '。');
    out = out.replace(/\s{2,}/g, ' ');
    return out;
  }

  var GRAMMAR = [
    [/目覚ましがか/g, '目覚めたか'],
    [/お前の目覚ましがか/g, 'お前、目覚めたか'],
    [/(\S)の([一-鿿]{2,4})がか[？?]/g, '$1、$2か？'],
    [/[、。]\s*が[、。]/g, '。'],
    [/たあった/g, 'た']
  ];

  function fixGrammar(t){
    if(!t)return t;
    var out = t;
    GRAMMAR.forEach(function(p){ out = out.replace(p[0], p[1]); });
    return out;
  }

  function sanitize(t){ return fixGrammar(stripForeign(t)); }

  function dedupeDlgInTurn(dlgs){
    if (!Array.isArray(dlgs) || dlgs.length < 2) return false;
    var changed = false;
    var seen = {};
    var out = [];
    dlgs.forEach(function(d){
      if (!d) return;
      var key = (d.speaker||'') + '||' + (d.text||'').trim();
      if (seen[key]){ console.log('[v217] dup in-turn:', d.speaker, (d.text||'').substring(0,30)); changed = true; return; }
      seen[key] = true;
      out.push(d);
    });
    if (changed){ dlgs.length = 0; out.forEach(function(d){ dlgs.push(d); }); }
    return changed;
  }

  function dedupeAcrossTurns(turns){
    if (turns.length < 2) return false;
    var prev = turns[turns.length-2];
    var curr = turns[turns.length-1];
    if (!prev || !curr) return false;
    if (!Array.isArray(prev.dialogues) || !Array.isArray(curr.dialogues)) return false;
    var prevSigs = {};
    prev.dialogues.forEach(function(d){
      if(d) prevSigs[(d.speaker||'')+'||'+(d.text||'').trim()] = true;
    });
    var changed = false;
    var newDlg = curr.dialogues.filter(function(d){
      if (!d) return false;
      var sig = (d.speaker||'')+'||'+(d.text||'').trim();
      if (prevSigs[sig]){ console.log('[v217] dup cross-turn:', d.speaker, (d.text||'').substring(0,30)); changed = true; return false; }
      return true;
    });
    if (changed) curr.dialogues = newDlg;
    return changed;
  }

  function reprocessTurns(){
    var s; try { s = JSON.parse(localStorage.getItem('chr6')||'{}'); } catch(e){ return; }
    var turns = s.turns || [];
    var changed = false;
    turns.forEach(function(t){
      if (!t) return;
      if (t.narrative){
        var clean = sanitize(t.narrative);
        if (clean !== t.narrative){
          var f = detectForeign(t.narrative);
          if (f.length) console.log('[v217] foreign:', f.map(function(x){return x.s+':'+x.t;}).join(', '));
          t.narrative = clean;
          changed = true;
        }
      }
      if (Array.isArray(t.dialogues)){
        t.dialogues.forEach(function(d){
          if (!d || !d.text) return;
          var c = sanitize(d.text);
          if (c !== d.text){ d.text = c; changed = true; }
        });
        if (dedupeDlgInTurn(t.dialogues)) changed = true;
      }
    });
    if (dedupeAcrossTurns(turns)) changed = true;
    if (changed){
      try { localStorage.setItem('chr6', JSON.stringify(s)); } catch(e){}
      try { eval('UI.renderAll()'); } catch(e){}
    }
  }

  var WHITELIST_RULE = ['','','# 🌐 文字種の絶対ルール（最重要）','','## 使用可能','- ✅ 日本語：ひらがな・カタカナ・漢字','- ✅ 英数字（最低限）','- ✅ 日本語句読点・記号','','## 🚫 絶対禁止','- ❌ キリル文字：руковод/Привет などロシア語','- ❌ ハングル：안녕/감사 など韓国語','- ❌ タイ文字：สวัสดี','- ❌ ギリシャ文字・アラビア文字・デーヴァナーガリー・ヘブライ文字','- ❌ 中国語特有：呀 嗎 嘛 吧 啊 了結 怎麼など','','## 文法','- 「〜がか？」「〜の名詞がか？」のような不自然文法は **絶対禁止**','- ✅ 「お前、目覚めたか？」','- ❌ 「お前の目覚ましがか？」','','## 反復禁止','- 直前ターン・直前3ターンで使ったセリフを **再利用禁止**','- 同じキャラが同じセリフを2回続けない','- ✅ 直前「やめろ」→今回「待て」など表現を変える'].join('\n');

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
              if (c.indexOf('# 🌐 文字種の絶対ルール') < 0){
                body.messages[i].content = c + WHITELIST_RULE;
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

  function init(){
    setTimeout(function(){ reprocessTurns(); }, 1500);
    setInterval(function(){ reprocessTurns(); }, 5000);
    console.log('[v217] active: foreign strip + grammar fix + dedupe');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.__v217 = { detectForeign: detectForeign, stripForeign: stripForeign, fixGrammar: fixGrammar, sanitize: sanitize, dedupeDlgInTurn: dedupeDlgInTurn, dedupeAcrossTurns: dedupeAcrossTurns, reprocessTurns: reprocessTurns };
})();
