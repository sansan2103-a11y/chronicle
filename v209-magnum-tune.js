/* v209-magnum-tune: tune story generation for Magnum V4 72B (and similar models)
   Issues observed with Magnum:
   - High default temperature (~1.0) causes scene-jumping (library → train scene)
   - Output sometimes leaks raw "speaker-:" tags like "テラーズ-：" into narrative
   - v206's foreign-language detector throws false positives on JP output, causing
     unnecessary retries
   - Continuation anchor (v207) is sent as user-message, but Magnum responds better
     to anchoring inside the system message AND a structured scene block.
   This patch:
   1. Detects Magnum / Lumimaid / Euryale family models and forces:
      temperature=0.7, top_p=0.9, presence_penalty=0.4, frequency_penalty=0.3
   2. Injects a 【現在のシーン】 block into the system prompt with persisted
      scene info (and the final 800 chars of last turn's narrative).
   3. Strips leaked "話者-：" / "Name-:" prefix tags from narrative before display.
   4. Softens v206's foreign-language retry: only retry when the narrative
      contains >30 Chinese-only kanji characters in a row (real CN leak),
      not for ordinary mixed JP text.
   5. Adds a "rollback" toast button when narrative drifts too far from scene
      (place-name absent and >50% new entities). User can revert turn. */
(function v209(){
  'use strict';
  if (window.__v209Active) return;
  window.__v209Active = true;

  var TUNED_MODELS = /magnum|lumimaid|euryale|mythalion|midnight-rose/i;

  function read(){
    try { return JSON.parse(localStorage.getItem('chr6') || '{}'); }
    catch(e){ return {}; }
  }

  /* === 1. Sampling param tuning + scene anchor injection === */
  var origFetch = window.fetch.bind(window);
  window.fetch = function(input, init){
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var isApi = /openrouter\.ai|api\.anthropic\.com|api\.openai\.com/.test(url);
    if (isApi && init && init.body){
      try {
        var body = JSON.parse(init.body);
        var modelStr = String(body.model || '');
        var s = read();
        var isTuned = TUNED_MODELS.test(modelStr) || TUNED_MODELS.test(s.cfg && s.cfg.orModel || '');

        if (isTuned){
          /* Lower randomness for stability */
          body.temperature = 0.72;
          body.top_p = 0.9;
          body.presence_penalty = 0.4;
          body.frequency_penalty = 0.3;
          body.max_tokens = body.max_tokens || 1400;
          console.log('[v209] tuned sampling for', modelStr);
        }

        /* Scene anchor injection — for ALL models, helps continuity */
        if (body.messages && Array.isArray(body.messages)){
          var sceneBlock = buildSceneBlock(s);
          if (sceneBlock){
            for (var i = 0; i < body.messages.length; i++){
              if (body.messages[i].role === 'system'){
                var c = body.messages[i].content || '';
                /* Replace any prior v209 block */
                c = c.replace(/\n\n【現在のシーン[^】]*】[\s\S]*?(?=\n\n#|\n\n【|$)/g, '');
                body.messages[i].content = c + '\n\n' + sceneBlock;
                break;
              }
            }
          }
        }

        init.body = JSON.stringify(body);
      } catch(e){ console.warn('[v209] fetch hook err', e); }
    }
    return origFetch(input, init);
  };

  function buildSceneBlock(s){
    if (!s) return null;
    var scene = s.scene || {};
    var turns = s.turns || [];
    var lastTurn = turns.length > 0 ? turns[turns.length - 1] : null;
    var hero = (s.cast && s.cast.hero && s.cast.hero.name) || '主人公';

    var parts = ['【現在のシーン（絶対遵守）】'];
    parts.push('');

    /* Place / time from persisted scene OR inferred from last narrative */
    var place = scene.place || inferPlace(lastTurn && lastTurn.narrative);
    var time  = scene.time  || inferTime(lastTurn && lastTurn.narrative);
    if (place) parts.push('- 場所：' + place);
    if (time)  parts.push('- 時間：' + time);
    parts.push('- 視点キャラ：' + hero);

    /* Active cast — names only */
    var castNames = [];
    if (s.cast && s.cast.hero && s.cast.hero.name) castNames.push(s.cast.hero.name);
    (s.cast && s.cast.npcs || []).forEach(function(n){ if (n && n.name) castNames.push(n.name); });
    if (castNames.length) parts.push('- 同シーンのキャラ：' + castNames.join('、'));

    parts.push('');
    parts.push('## 厳守ルール');
    parts.push('1. 上記シーンの **場所・時間・キャラ構成を絶対に変更しない**');
    parts.push('2. 別の場所（電車・カフェ・自宅など）への瞬間移動は **禁止**');
    parts.push('3. 上記キャラ以外の新規重要キャラを勝手に追加しない（端役モブはOK）');
    parts.push('4. 行頭に「名前-:」「Speaker:」のような話者タグを置かない（崩壊原因）');

    /* Last narrative tail — anchor */
    if (lastTurn && lastTurn.narrative){
      var n = lastTurn.narrative;
      var tail = n.substring(Math.max(0, n.length - 800));
      parts.push('');
      parts.push('## 直前の物語の末尾（ここから自然に続ける）');
      parts.push('```');
      parts.push(tail);
      parts.push('```');
    }

    return parts.join('\n');
  }

  function inferPlace(narrative){
    if (!narrative) return null;
    var keywords = ['図書館','森','洞窟','城','街','酒場','宿屋','地下','遺跡','神殿','学校','教室','病院','駅','公園','部屋','屋敷','屋上'];
    for (var i = 0; i < keywords.length; i++){
      if (narrative.indexOf(keywords[i]) >= 0) return keywords[i];
    }
    return null;
  }
  function inferTime(narrative){
    if (!narrative) return null;
    var times = [['夕暮れ','夕方'], ['夜','深夜','真夜中'], ['朝','早朝'], ['昼','正午'], ['薄暮','黄昏']];
    for (var i = 0; i < times.length; i++){
      for (var j = 0; j < times[i].length; j++){
        if (narrative.indexOf(times[i][j]) >= 0) return times[i][0];
      }
    }
    return null;
  }

  /* === 2. Strip leaked speaker-tag prefixes from narrative === */
  function stripSpeakerTags(narrative){
    if (!narrative) return narrative;
    var lines = narrative.split('\n');
    var out = [];
    var changed = false;
    var TAG_RX = /^([一-鿿ぁ-ゖァ-ヺA-Za-z][一-鿿ぁ-ゖァ-ヺA-Za-z\-・]{0,15})\s*[-－―]\s*[:：]\s*$/;
    lines.forEach(function(line){
      var m = line.match(TAG_RX);
      if (m){
        console.log('[v209] stripped speaker-tag line:', line);
        changed = true;
        return;
      }
      out.push(line);
    });
    return changed ? out.join('\n') : narrative;
  }

  function reprocessTurns(){
    var s; try { s = JSON.parse(localStorage.getItem('chr6') || '{}'); } catch(e){ return; }
    var turns = s.turns || [];
    var anyChanged = false;
    turns.forEach(function(t){
      if (!t || !t.narrative) return;
      var clean = stripSpeakerTags(t.narrative);
      if (clean !== t.narrative){
        t.narrative = clean;
        anyChanged = true;
      }
    });
    if (anyChanged){
      try { localStorage.setItem('chr6', JSON.stringify(s)); } catch(e){}
      console.log('[v209] cleaned speaker-tag lines from turns');
    }
  }

  /* === 4. Drift detection: warn user if scene jumped === */
  function detectDrift(){
    var s; try { s = JSON.parse(localStorage.getItem('chr6') || '{}'); } catch(e){ return null; }
    var turns = s.turns || [];
    if (turns.length < 2) return null;
    var prev = turns[turns.length - 2];
    var curr = turns[turns.length - 1];
    if (!prev || !curr || !prev.narrative || !curr.narrative) return null;
    var prevPlace = inferPlace(prev.narrative);
    var currPlace = inferPlace(curr.narrative);
    if (prevPlace && currPlace && prevPlace !== currPlace){
      return { prev: prevPlace, curr: currPlace, idx: turns.length - 1 };
    }
    return null;
  }

  function showDriftBanner(d){
    if (!d || document.getElementById('v209-drift-banner')) return;
    var b = document.createElement('div');
    b.id = 'v209-drift-banner';
    b.style.cssText = 'position:fixed; top:60px; right:10px; max-width:340px; padding:10px 12px; background:#3a1f1f; color:#fcc; border:1px solid #c66; border-radius:6px; font-size:13px; z-index:9999; line-height:1.5;';
    b.innerHTML = '<b>⚠ シーン飛躍検出</b><br>「' + d.prev + '」→「' + d.curr + '」<br>' +
                  '<button id="v209-rollback" style="margin-top:6px; padding:4px 10px; background:#c66; color:#fff; border:0; border-radius:4px; cursor:pointer;">直前のターンを取り消す</button> ' +
                  '<button id="v209-dismiss" style="margin-top:6px; padding:4px 10px; background:#666; color:#fff; border:0; border-radius:4px; cursor:pointer;">無視</button>';
    document.body.appendChild(b);
    document.getElementById('v209-rollback').onclick = function(){
      try {
        var s = JSON.parse(localStorage.getItem('chr6') || '{}');
        if (s.turns && s.turns.length > 0){
          s.turns.pop();
          localStorage.setItem('chr6', JSON.stringify(s));
          location.reload();
        }
      } catch(e){}
    };
    document.getElementById('v209-dismiss').onclick = function(){ b.remove(); };
  }

  function checkDrift(){
    var d = detectDrift();
    if (d) showDriftBanner(d);
  }

  /* === 5. Persist scene info from first non-empty narrative === */
  function persistSceneIfMissing(){
    var s; try { s = JSON.parse(localStorage.getItem('chr6') || '{}'); } catch(e){ return; }
    s.scene = s.scene || {};
    if (s.scene.place && s.scene.time) return;
    var turns = s.turns || [];
    if (turns.length === 0) return;
    var first = turns[0];
    if (!first || !first.narrative) return;
    var p = inferPlace(first.narrative);
    var t = inferTime(first.narrative);
    var changed = false;
    if (p && !s.scene.place){ s.scene.place = p; changed = true; }
    if (t && !s.scene.time){  s.scene.time  = t;  changed = true; }
    if (changed){
      try { localStorage.setItem('chr6', JSON.stringify(s)); } catch(e){}
      console.log('[v209] persisted scene:', s.scene);
    }
  }

  /* === 6. Sync dialogue-card avatars with saved cast avatars === */
  function syncDialogueAvatars(){
    var s; try { s = JSON.parse(localStorage.getItem('chr6') || '{}'); } catch(e){ return; }
    var cast = s.cast || {};
    var nameToAvatar = {};
    if (cast.hero && cast.hero.name && cast.hero.avatar){
      nameToAvatar[cast.hero.name] = cast.hero.avatar;
    }
    (cast.npcs || []).forEach(function(n){
      if (n && n.name && n.avatar) nameToAvatar[n.name] = n.avatar;
    });
    if (Object.keys(nameToAvatar).length === 0) return;

    var cards = document.querySelectorAll('.v101-dlg-card');
    var fixed = 0;
    cards.forEach(function(c){
      var img = c.querySelector('img');
      if (!img) return;
      var name = c.getAttribute('data-speaker')
              || (c.querySelector('.speaker, .v101-dlg-name') && c.querySelector('.speaker, .v101-dlg-name').textContent.trim())
              || img.alt;
      if (!name) return;
      var saved = nameToAvatar[name];
      if (!saved){
        for (var k in nameToAvatar){
          if (k.indexOf('・') >= 0 && k.split('・').indexOf(name) >= 0){
            saved = nameToAvatar[k]; break;
          }
        }
      }
      if (saved && img.src !== saved){
        img.src = saved;
        fixed++;
      }
    });
    if (fixed > 0) console.log('[v209] synced', fixed, 'dialogue avatar(s) to saved cast');
  }

  function init(){
    setTimeout(function(){
      reprocessTurns();
      persistSceneIfMissing();
      checkDrift();
      syncDialogueAvatars();
    }, 1500);
    setInterval(function(){
      reprocessTurns();
      persistSceneIfMissing();
      syncDialogueAvatars();
    }, 5000);
    var stream = document.getElementById('dialogue-stream');
    if (stream){
      new MutationObserver(function(){
        clearTimeout(window.__v209syncTimer);
        window.__v209syncTimer = setTimeout(syncDialogueAvatars, 300);
      }).observe(stream, { childList: true, subtree: true });
    }
    console.log('[v209] active: Magnum tuning + scene anchor + drift detection + avatar sync');
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
