/* v218-anti-meta: ULTRA prompt + meta detect + auto-retry + regenerate context */
(function v218(){
  'use strict';
  if (window.__v218Active) return;
  window.__v218Active = true;

  var META_PHRASES = [
    /素晴らしい(です(ね|よ))?/,
    /ワクワク/,
    /楽しみにしています/,
    /楽しみです/,
    /お願いしますね/,
    /これからのストーリー/,
    /物語を続ける/,
    /続きを書きましょう/,
    /続きを書きます/,
    /あなたが書いた/,
    /あなたの物語/,
    /あなたの作品/,
    /いかがでしょうか/,
    /楽しみに待っています/,
    /素敵です/,
    /面白い(です|アイデア|展開)/,
    /興味深い(です)?/,
    /ぐれお願いしますね/,
    /何かご質問/,
    /続けますか/,
    /どんな展開になる/,
    /どうぞお続け/,
    /どうぞ続け/,
    /応援しています/
  ];

  function isMetaResponse(text){
    if (!text) return false;
    var hits = 0;
    var matches = [];
    META_PHRASES.forEach(function(rx){
      var m = text.match(rx);
      if (m){ hits++; matches.push(m[0]); }
    });
    if (hits >= 2) return matches;
    if (hits >= 1 && text.length < 250) return matches;
    if (/あなた[はがの][^。]{0,30}(です|ます)/.test(text)) return ['direct-address'];
    return false;
  }

  function stripMetaSentences(text){
    if (!text) return text;
    var sentences = text.split(/(?<=[。！？\n])/);
    var out = sentences.filter(function(s){
      var trimmed = s.trim();
      if (!trimmed) return false;
      for (var i = 0; i < META_PHRASES.length; i++){
        if (META_PHRASES[i].test(trimmed)){
          console.log('[v218] strip:', trimmed.substring(0, 50));
          return false;
        }
      }
      return true;
    });
    return out.join('');
  }

  function reprocessTurns(){
    var s; try { s = JSON.parse(localStorage.getItem('chr6')||'{}'); } catch(e){ return; }
    var turns = s.turns || [];
    var changed = false;
    turns.forEach(function(t){
      if (!t || !t.narrative) return;
      if (isMetaResponse(t.narrative)){
        var clean = stripMetaSentences(t.narrative);
        if (clean !== t.narrative){ t.narrative = clean; changed = true; }
      }
    });
    if (changed){
      try { localStorage.setItem('chr6', JSON.stringify(s)); } catch(e){}
      try { eval('UI.renderAll()'); } catch(e){}
    }
  }

  var ULTRA_RULE = ['# ⚠️⚠️⚠️ あなたの正体（最優先）','','あなたは **物語を書く語り部** です。','あなたは **chat assistant ではない**。','ユーザーへの返答ではなく、**物語の地の文** を書いてください。','','## 🚫 絶対禁止','','- ❌ ユーザーへの呼びかけ：「あなた」「お願いしますね」','- ❌ 複め言葉：「素晴らしい」「ワクワク」','- ❌ メタ発言：「続きを書きます」「これからのストーリー」','- ❌ 質問返し：「いかがでしょうか？」','- ❌ ですます調（地の文は常体・小説体）','','## ✅ 正しい応答','','**ユーザー入力**：「スピカは怪異の親玉に弄ばれ壊れそうだ」','','**❌ 悪い**：「素晴らしいですね、物語を続けましょう」','','**✅ 良い（地の文）**：','> スピカの体は怪異の親玉によって弄ばれ続けた。','> 鴾い触手が彼女の柔肌を髙い回り...','','応答の最初の文字から地の文として書く。挨拶・前置き・コメントは一切不要。',''].join('\n');

  function bindRegenerateTracker(){
    document.addEventListener('click', function(e){
      var btn = e.target && e.target.closest && e.target.closest('button');
      if (!btn) return;
      var label = (btn.textContent || '').trim();
      if (/やり直[すしせ]|再生成|regenerate/i.test(label)){
        window.__v218RegenContext = true;
        console.log('[v218] REGENERATE clicked');
      } else if (/送信|▶/.test(label)){
        window.__v218RegenContext = false;
      }
    }, true);
  }

  function buildSceneState(){
    var s; try { s = JSON.parse(localStorage.getItem('chr6')||'{}'); } catch(e){ return null; }
    var turns = s.turns || [];
    if (turns.length === 0) return null;
    var lastTurn = turns[turns.length - 1];
    if (!lastTurn) return null;
    var scene = s.scene || {};
    var hero = (s.cast && s.cast.hero) || {};
    var npcs = (s.cast && s.cast.npcs) || [];
    var lines = ['# 📍 現在の状態（絶対遵守）', ''];
    if (scene.place) lines.push('- 場所：' + scene.place);
    if (scene.time) lines.push('- 時間：' + scene.time);
    if (hero.name) lines.push('- 主人公：' + hero.name + (hero.gender ? '（' + hero.gender + '）' : ''));
    if (npcs.length){
      lines.push('- 同シーンのNPC：');
      npcs.forEach(function(n){ if (!n || !n.name) return; lines.push('  • ' + n.name + (n.gender ? '（' + n.gender + '）' : '')); });
    }
    if (lastTurn.narrative){
      var tail = lastTurn.narrative.length > 600 ? lastTurn.narrative.substring(lastTurn.narrative.length - 600) : lastTurn.narrative;
      lines.push('');
      lines.push('## 直前の物語（ここから続ける）');
      lines.push('\`\`\`');
      lines.push(tail);
      lines.push('\`\`\`');
    }
    return lines.join('\n');
  }

  var origFetch = window.fetch.bind(window);
  window.fetch = function(input, init){
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var isApi = /openrouter\.ai|api\.anthropic\.com|api\.openai\.com/.test(url);
    if (!isApi) return origFetch(input, init);

    if (init && init.body){
      try {
        var body = JSON.parse(init.body);
        if (body.messages){
          var sceneState = buildSceneState();
          for (var i = 0; i < body.messages.length; i++){
            if (body.messages[i].role === 'system'){
              var c = body.messages[i].content || '';
              if (c.indexOf('# ⚠️⚠️⚠️ あなたの正体') < 0){ c = ULTRA_RULE + '\n\n' + c; }
              if (sceneState){
                c = c.replace(/\n\n# 📍 現在の状態[\s\S]*?(?=\n\n#|$)/, '');
                c = c + '\n\n' + sceneState;
              }
              body.messages[i].content = c;
              break;
            }
          }
          if (window.__v218RegenContext){
            console.log('[v218] regenerate flow');
            body.messages.push({ role: 'user', content: '【やり直し】上記の場面・状態を維持したまま、別の表現で同じ続きを書いてください。メタ言及・chat assistant 的な応答は **絶対禁止**。地の文だけを書いてください。' });
            window.__v218RegenContext = false;
          }
          init.body = JSON.stringify(body);
        }
      } catch(e){}
    }

    var firstResp = origFetch(input, init);
    return firstResp.then(function(resp){
      if (!resp.ok) return resp;
      var clone = resp.clone();
      return clone.text().then(function(text){
        try {
          var json = JSON.parse(text);
          var content = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
          if (!content) return resp;
          var meta = isMetaResponse(content);
          if (!meta) return resp;
          console.warn('[v218] META detected:', meta);
          if (window.__v218Retrying) return resp;
          window.__v218Retrying = true;
          var newInit = JSON.parse(JSON.stringify(init));
          var body2; try { body2 = JSON.parse(newInit.body); } catch(e){ window.__v218Retrying = false; return resp; }
          if (!body2.messages) { window.__v218Retrying = false; return resp; }
          body2.messages.push({ role: 'user', content: '⚠️ 前の応答はメタコメントでした。\n\n**やり直し**：\n- 「素晴らしい」「ワクワク」「お願いしますね」を **絶対に使わない**\n- ユーザーに **話しかけない**\n- 物語の地の文だけを書く\n- 最初の文字から **キャラクターの動作・状況描写** で開始\n- 例：「スピカの体が」「彼女の手は」「触手が彼女に」のような書き出し\n\n直前のプレイヤー指示の続きを地の文だけで書いてください。' });
          newInit.body = JSON.stringify(body2);
          newInit.headers = newInit.headers || init.headers;
          var retry = origFetch(input, newInit);
          return retry.then(function(r2){ window.__v218Retrying = false; return r2; }).catch(function(e){ window.__v218Retrying = false; return resp; });
        } catch(e){ return resp; }
      });
    });
  };

  function init(){
    bindRegenerateTracker();
    setTimeout(function(){ reprocessTurns(); }, 1500);
    setInterval(function(){ reprocessTurns(); }, 5000);
    console.log('[v218] active: anti-meta + auto-retry + ULTRA prompt + regen ctx');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.__v218 = { isMetaResponse: isMetaResponse, stripMetaSentences: stripMetaSentences, reprocessTurns: reprocessTurns, buildSceneState: buildSceneState, META_PHRASES: META_PHRASES };
})();
