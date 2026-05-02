/* v141: inline speaker-prefix format - 名前「セリフ」 - script-style narrative */
(function v141(){
  'use strict';
  var TAG = '[v141]';
  if (window.__v141Active) return;
  window.__v141Active = true;

  var INLINE_INSTRUCTION = '\n\n# 会話の表記形式（最重要・厳守）\nnarrative内の全ての会話は必ず以下の**台本形式**で書いてください：\n\n**話者名「セリフ」** の形式（話者名と「」の間にスペースなし）\n\n## 良い例（必ずこの形式）\n```\n盗賊「動くな、嬢ちゃん」\nセシリア「あなたたちは何者？」\nアリア「セシリアから離れろ！」\n盗賊A「へへ、可愛い子だ」\nセシリア《どうしてこんなことに…》\n```\n\n## 禁止例（絶対に書かない）\n- ❌ 「動くな」と盗賊が言った\n- ❌ 盗賊は嘲笑を浮かべて「動くな」と言う\n- ❌ 「動くな」（盗賊）\n\n## ルール\n- 通常会話：**話者名「セリフ」**\n- 心の声・内心：**話者名《内心》**\n- 話者名は登録キャラ名（アリア・セシリア等）または「盗賊」「兵士」「魔女」等の登録外NPC名\n- 同じ盗賊が複数いる場合は「盗賊A」「盗賊B」で区別\n- セリフは「」内、内心は《》内に書く\n- 話者名「」の前後で改行する\n- 地の文（情景描写）は通常通り書く\n\nこの形式に従えば、自動的に正しい話者で会話ログが構築されます。\n';

  function getCast(){ try { return JSON.parse(localStorage.getItem('chr6') || '{}'); } catch(e){ return {}; } }
  function setCast(s){ localStorage.setItem('chr6', JSON.stringify(s)); }

  function avUrl(name){
    var p = 'anime portrait, ' + name + ', detailed face, dark fantasy';
    var seed = 0;
    for (var i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) & 0x7fffffff;
    return 'https://image.pollinations.ai/prompt/' + encodeURIComponent(p) + '?width=384&height=384&seed=' + seed + '&nologo=true&model=flux';
  }

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
              body.messages[i].content = (body.messages[i].content || '') + INLINE_INSTRUCTION;
              break;
            }
          }
          init.body = JSON.stringify(body);
        }
      } catch(e){}
    }
    return prevFetch(input, init);
  };

  function isValidSpeakerName(name){
    if (!name || name.length < 2 || name.length > 12) return false;
    if (/[をはがにへもまでよりから]/.test(name)) return false;
    if (/(した|して|する|される|られる|である|ている)/.test(name)) return false;
    if (/(手|声|目|顔|肌|髪|血|涙|息|胸|腰|腕|足|指)$/.test(name)) return false;
    if (/^[ぁ-ゖ]+$/.test(name) && name.length < 4) return false;
    return true;
  }

  function extractInlineDialogues(narrative){
    if (!narrative) return [];
    var dialogues = [];
    var rx = /(?:^|[\n。])([一-鿿ぁ-ゖァ-ヺ・A-Z]{2,12})(「([^「」\n]{1,300})」|《([^《》\n]{1,300})》)/g;
    var m;
    while ((m = rx.exec(narrative)) !== null){
      var name = m[1];
      if (!isValidSpeakerName(name)) continue;
      var isInner = !!m[4];
      var text = m[3] || m[4];
      dialogues.push({ speaker: name, text: text, inner: isInner });
    }
    return dialogues;
  }

  function findInfo(name){
    if (!name) return null;
    var s = getCast(); var c = s.cast || {}; var hero = c.hero || {};
    if (hero.name === name) return { name: hero.name, avatar: hero.avatar||'', isHero: true };
    var npcs = c.npcs || [];
    for (var i = 0; i < npcs.length; i++){
      if (npcs[i] && npcs[i].name === name) return { name: npcs[i].name, avatar: npcs[i].avatar||'', isHero: false };
    }
    s.ephemerals = s.ephemerals || {};
    if (!s.ephemerals[name]){ s.ephemerals[name] = { avatar: avUrl(name), firstSeen: Date.now() }; setCast(s); }
    return { name: name, avatar: s.ephemerals[name].avatar || avUrl(name), isHero: false };
  }

  function processInlineDialogues(){
    var s = getCast();
    var turns = s.turns || [];
    var changed = false;
    turns.forEach(function(t){
      if (!t.narrative) return;
      var inline = extractInlineDialogues(t.narrative);
      if (inline.length > 0){
        inline.forEach(function(d){ findInfo(d.speaker); });
        var newDialogues = inline.map(function(d){ return { speaker: d.speaker, text: d.text, inner: d.inner }; });
        var oldStr = JSON.stringify(t.dialogues || []);
        var newStr = JSON.stringify(newDialogues);
        if (oldStr !== newStr){
          t.dialogues = newDialogues;
          changed = true;
          console.log(TAG, 'extracted', inline.length, 'inline dialogues');
        }
      }
    });
    if (changed){
      setCast(s);
      try { if (typeof UI === 'object' && UI && UI.renderAll) UI.renderAll(); } catch(e){}
    }
  }

  function decorateNarrative(){
    var narrPanel = document.getElementById('story') || document.querySelector('[data-narrative]') || document.querySelector('.narrative-panel');
    if (!narrPanel) return;
    var walker = document.createTreeWalker(narrPanel, NodeFilter.SHOW_TEXT);
    var nodes = [];
    var n;
    while (n = walker.nextNode()){
      if (n.textContent && /[一-鿿ぁ-ゖァ-ヺ・]{2,12}「/.test(n.textContent)) nodes.push(n);
    }
    nodes.forEach(function(node){
      if (node.parentElement && node.parentElement.classList && node.parentElement.classList.contains('v141-decorated')) return;
      var text = node.textContent;
      var rx = /([一-鿿ぁ-ゖァ-ヺ・]{2,12})(「[^「」]+」)/g;
      if (!rx.test(text)) return;
      rx.lastIndex = 0;
      var frag = document.createDocumentFragment();
      var lastIdx = 0;
      var m;
      while ((m = rx.exec(text)) !== null){
        var name = m[1];
        if (!isValidSpeakerName(name)) continue;
        if (m.index > lastIdx) frag.appendChild(document.createTextNode(text.slice(lastIdx, m.index)));
        var nameSpan = document.createElement('span');
        nameSpan.style.cssText = 'color:var(--acc);font-weight:600';
        nameSpan.textContent = name;
        frag.appendChild(nameSpan);
        frag.appendChild(document.createTextNode(m[2]));
        lastIdx = m.index + m[0].length;
      }
      if (lastIdx > 0){
        if (lastIdx < text.length) frag.appendChild(document.createTextNode(text.slice(lastIdx)));
        var wrapper = document.createElement('span');
        wrapper.className = 'v141-decorated';
        wrapper.appendChild(frag);
        node.parentNode.replaceChild(wrapper, node);
      }
    });
  }

  function init(){
    setTimeout(processInlineDialogues, 1500);
    setTimeout(decorateNarrative, 2000);
    setTimeout(processInlineDialogues, 4500);
    setTimeout(decorateNarrative, 5000);
    setInterval(function(){ processInlineDialogues(); decorateNarrative(); }, 5000);
  }

  if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', init); } else { init(); }

  console.log(TAG, 'v141 active: inline 名前「セリフ」 format');
})();
