/* v134: explicit JSON DIALOGUES block from model - bypass narrative parsing */
(function v134(){
  'use strict';
  var TAG = '[v134]';
  if (window.__v134Active) return;
  window.__v134Active = true;

  var INSTRUCTION = '\n\n# 出力末尾の追加ブロック（重要・省略不可）\nnarrative出力の最後に必ず以下の形式のJSONブロックを付加してください：\n\n<DIALOGUES>\n[\n  {"speaker":"話者名","text":"発言内容","inner":false},\n  {"speaker":"話者名","text":"内心","inner":true}\n]\n</DIALOGUES>\n\n## ルール（厳守）\n- narrative内の全ての「」（発話）と《》（内心）を漏れなくリスト化\n- 「」は inner:false、《》は inner:true\n- speaker は文脈から判断する正しい話者名（登録キャラ名、または「盗賊」「兵士」「衛兵」「魔女」「老人」などの登録外NPC名）\n- 三人称代名詞（「この娘」「彼女」「あいつ」）が使われている場合は、文脈から発言者本人を特定する\n- 男性的話法（〜ねえぞ/〜じゃねえ/〜だぜ/〜やがる/おう）→ 男性NPCに振る\n- 女性的話法（〜だわ/〜かしら/〜なの/〜わよ）→ 女性キャラに振る\n- 嘆願（やめて/許して/お願い）→ 被害者側、嘲笑（へえ/だぜ）→ 攻撃者側\n- speakerは登録外NPCでも「○○の声」「○○の手」のようなフレーズではなく、実体名（盗賊・兵士など）を使う\n';

  function getCast(){ try { return JSON.parse(localStorage.getItem('chr6') || '{}'); } catch(e){ return {}; } }
  function setCast(s){ localStorage.setItem('chr6', JSON.stringify(s)); }

  function avUrl(name){
    var p = 'anime portrait, ' + name + ', detailed face, dark fantasy';
    var seed = 0;
    for (var i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) & 0x7fffffff;
    return 'https://image.pollinations.ai/prompt/' + encodeURIComponent(p) + '?width=384&height=384&seed=' + seed + '&nologo=true&model=flux';
  }

  function findInfo(name){
    if (!name) return null;
    var s = getCast();
    var c = s.cast || {};
    var hero = c.hero || {};
    if (hero.name === name) return { name: hero.name, avatar: hero.avatar||'', isHero: true };
    var npcs = c.npcs || [];
    for (var i = 0; i < npcs.length; i++){
      if (npcs[i] && npcs[i].name === name) return { name: npcs[i].name, avatar: npcs[i].avatar||'', isHero: false };
    }
    s.ephemerals = s.ephemerals || {};
    if (!s.ephemerals[name]){
      s.ephemerals[name] = { avatar: avUrl(name), firstSeen: Date.now() };
      setCast(s);
    }
    return { name: name, avatar: s.ephemerals[name].avatar || avUrl(name), isHero: false };
  }

  var origFetch = window.fetch.bind(window);
  window.fetch = function(input, init){
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var isApi = /openrouter\.ai|api\.anthropic\.com|api\.openai\.com/.test(url);

    if (isApi && init && init.body){
      try {
        var body = JSON.parse(init.body);
        if (body.messages && Array.isArray(body.messages) && body.messages.length){
          var injected = false;
          for (var i = body.messages.length - 1; i >= 0; i--){
            if (body.messages[i].role === 'system'){
              body.messages[i].content = (body.messages[i].content || '') + INSTRUCTION;
              injected = true;
              break;
            }
          }
          if (!injected){
            body.messages.unshift({ role: 'system', content: INSTRUCTION.trim() });
          }
          init.body = JSON.stringify(body);
        }
      } catch(e){ console.warn(TAG, 'inject err', e); }
    }

    var p = origFetch(input, init);

    if (isApi){
      p.then(function(r){
        try {
          r.clone().text().then(function(text){
            try {
              var resp = JSON.parse(text);
              var content = '';
              if (resp.choices && resp.choices[0] && resp.choices[0].message){
                content = resp.choices[0].message.content || '';
              } else if (resp.content && resp.content[0]){
                content = resp.content[0].text || '';
              }
              if (content){
                var m = content.match(/<DIALOGUES>([\s\S]*?)<\/DIALOGUES>/);
                if (m){
                  try {
                    var dialogues = JSON.parse(m[1].trim());
                    if (Array.isArray(dialogues) && dialogues.length){
                      window.__v134_pending = dialogues;
                      console.log(TAG, 'captured', dialogues.length, 'dialogues');
                    }
                  } catch(e){ console.warn(TAG, 'json parse err', e); }
                }
              }
            } catch(e){ /* ignore */ }
          });
        } catch(e){}
      });
    }

    return p;
  };

  setInterval(function(){
    if (!window.__v134_pending) return;
    var s = getCast();
    var turns = s.turns || [];
    if (!turns.length) return;
    var last = turns[turns.length - 1];
    if (last.dialogues) return;
    last.dialogues = window.__v134_pending;
    setCast(s);
    window.__v134_pending = null;
    console.log(TAG, 'attached dialogues to turn #' + (turns.length - 1));
    try { if (typeof UI === 'object' && UI && UI.renderAll) UI.renderAll(); } catch(e){}
  }, 400);

  function addCard(stream, opts){
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
    name.textContent = opts.speaker || '?';
    var txt = document.createElement('div');
    txt.style.cssText = 'font-size:13px;line-height:1.5;color:var(--tx);word-break:break-word' + (opts.inner ? ';font-style:italic;color:var(--dim)' : '');
    txt.textContent = opts.text;
    body.appendChild(name); body.appendChild(txt);
    card.appendChild(av); card.appendChild(body);
    stream.appendChild(card);
  }

  function rebuildIfPossible(){
    var stream = document.getElementById('dialogue-stream');
    if (!stream) return;
    var s = getCast();
    var turns = s.turns || [];
    var anyHas = turns.some(function(t){ return t.dialogues && Array.isArray(t.dialogues); });
    if (!anyHas) return;

    var hero = (s.cast && s.cast.hero) || {};
    var heroName = hero.name || '主人公';

    stream.innerHTML = '';
    turns.forEach(function(t){
      var inputType = t.inputType || '';
      var playerText = t.playerText || '';
      if (inputType === 'SAY' && playerText){
        addCard(stream, { speaker: heroName, text: playerText, isHero: true, avatar: hero.avatar });
      }
      if (t.dialogues && Array.isArray(t.dialogues)){
        t.dialogues.forEach(function(d){
          if (!d || !d.text) return;
          var info = findInfo(d.speaker) || { name: d.speaker || '?', avatar: '', isHero: false };
          var displayText = d.inner ? '《' + d.text + '》' : d.text;
          addCard(stream, { speaker: info.name, text: displayText, isHero: info.isHero, avatar: info.avatar, inner: !!d.inner });
        });
      } else {
        var narr = String(t.narrative || '');
        var rxDlg = /「([^「」\n]{1,300})」/g;
        var m;
        while ((m = rxDlg.exec(narr)) !== null){
          var info = findInfo(t.npcName || heroName);
          addCard(stream, { speaker: info.name, text: m[1], isHero: info.isHero, avatar: info.avatar });
        }
        if (t.innerThought && String(t.innerThought).trim() && !/^[.…]{1,4}$/.test(t.innerThought.trim())){
          addCard(stream, { speaker: heroName, text: '《' + t.innerThought + '》', isHero: true, avatar: hero.avatar, inner: true });
        }
      }
    });
    stream.scrollTop = stream.scrollHeight;
  }

  function init(){
    setTimeout(rebuildIfPossible, 1500);
    setTimeout(rebuildIfPossible, 4000);
    setTimeout(rebuildIfPossible, 8000);
    var stream = document.getElementById('dialogue-stream');
    if (stream){
      var obs = new MutationObserver(function(){
        clearTimeout(window.__v134tmr);
        window.__v134tmr = setTimeout(rebuildIfPossible, 800);
      });
      obs.observe(stream, { childList: true, subtree: false });
    }
  }

  if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', init); } else { init(); }

  console.log(TAG, 'v134 active: explicit JSON DIALOGUES block from model');
})();
