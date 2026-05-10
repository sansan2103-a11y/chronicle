// v286e-narrative-recovery.js (v286e2-final: YAML/hybrid + body fallback fix)
(function v286e(){
  'use strict';
  if (window.__v286eActive) return;
  window.__v286eActive = true;
  console.log('[v286e] narrative-recovery init');

  var TAG = '[v286e]';

  function val(id){
    var el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
  }

  function readNpcCardValues(field){
    var out = [];
    document.querySelectorAll('#npcList .npc-card').forEach(function(card){
      var el = card.querySelector('[data-f="' + field + '"]');
      out.push(el ? String(el.value || '').trim() : '');
    });
    return out;
  }

  var KANJI_DIGIT = {
    '一':1, '二':2, '三':3, '四':4, '五':5,
    '六':6, '七':7, '八':8, '九':9, '十':10
  };
  function kanjiOrDigitToInt(s){
    if (!s) return -1;
    var t = String(s).trim();
    if (/^\d+$/.test(t)) return parseInt(t, 10);
    if (KANJI_DIGIT[t] != null) return KANJI_DIGIT[t];
    if (/^十(\d|[一二三四五六七八九])$/.test(t)){
      var d = t.charAt(1);
      return 10 + (KANJI_DIGIT[d] || parseInt(d, 10) || 0);
    }
    if (/^([一二三四五六七八九])十$/.test(t)){
      return (KANJI_DIGIT[t.charAt(0)] || 0) * 10;
    }
    return -1;
  }

  function cleanText(s){
    if (!s) return '';
    return String(s)
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/^[\s。、,.\-—:：]+/, '')
      .replace(/[\s]+$/, '')
      .trim();
  }

  function cleanName(s){
    if (!s) return '';
    return String(s)
      .replace(/[\*「」『』"'\s]/g, '')
      .trim();
  }

  function paraBody(p){
    var t = String(p);
    t = t.replace(/^第\s*[一二三四五六七八九十0-9]+\s*の?\s*NPC[、,\s]*\*\*[^*\n]+\*\*[、。:：\s]*/, '');
    t = t.replace(/^[^。\n]{1,30}の名は\s*\*\*[^*\n]+\*\*[、。:：\s]*/, '');
    t = t.replace(/^\*\*[^*\n]+\*\*[、。:：\s]*/, '');
    t = t.replace(/^npcs?\s*\[\s*\d+\s*\]\s*[:：]\s*/i, '');
    t = t.replace(/^(?:hero|scene)\s*[:：]\s*/i, '');
    t = t.replace(/^\s*name\s*[:：]\s*["'「『]?[^"'\n」』]{1,40}["'」』]?\s*[,，;；]?\s*\n+/i, '');
    t = t.replace(/^\s*desc\s*[:：]\s*["'「『]?/i, '');
    t = t.replace(/["'」』]\s*$/, '');
    return cleanText(t);
  }

  function extractYamlHybrid(text){
    if (!text || typeof text !== 'string') return null;
    var s = String(text);
    var hasBlockHeader = /(^|\n)\s*(npcs?\s*\[\s*\d+\s*\]|hero|scene)\s*[:：]/i.test(s);
    var hasKeyVal = /(^|\n)\s*(name|desc|lore|loc|obj|tone)\s*[:：]/i.test(s);
    if (!hasBlockHeader && !hasKeyVal) return null;
    s = s.replace(/^\s*```(?:json|yaml|ya?ml)?\s*/i, '').replace(/\s*```\s*$/, '');
    var result = { scene: {}, hero: {}, npcs: [] };
    var lines = s.split('\n');
    var currentBlock = null;
    var currentNpcIdx = -1;
    var pendingKey = null;

    function setKv(key, value){
      var k = String(key).toLowerCase().trim();
      var v = String(value || '').trim();
      v = v.replace(/^["'「『]\s*/, '').replace(/\s*["'」』]\s*$/, '');
      v = v.replace(/[,，;；]\s*$/, '');
      v = v.trim();
      if (!v) return;
      if (currentBlock === 'scene' && /^(lore|loc|obj|tone)$/.test(k)){
        if (!result.scene[k]) result.scene[k] = v;
      } else if (currentBlock === 'hero' && (k === 'name' || k === 'desc')){
        if (!result.hero[k]) result.hero[k] = v;
      } else if (currentBlock === 'npc' && currentNpcIdx >= 0 && (k === 'name' || k === 'desc')){
        while (result.npcs.length <= currentNpcIdx) result.npcs.push({});
        if (!result.npcs[currentNpcIdx][k]) result.npcs[currentNpcIdx][k] = v;
      }
    }

    for (var i = 0; i < lines.length; i++){
      var raw = lines[i];
      var line = raw.trim();
      if (!line) { pendingKey = null; continue; }
      var bm;
      if ((bm = line.match(/^(scene|hero)\s*[:：]\s*(.*)$/i))){
        currentBlock = bm[1].toLowerCase();
        currentNpcIdx = -1;
        pendingKey = null;
        continue;
      }
      if ((bm = line.match(/^npcs?\s*\[\s*(\d+)\s*\]\s*[:：]\s*(.*)$/i))){
        currentBlock = 'npc';
        currentNpcIdx = parseInt(bm[1], 10);
        pendingKey = null;
        continue;
      }
      var kv = line.match(/^["'`]?([A-Za-z_][\w]*)["'`]?\s*[:：]\s*(.*)$/);
      if (kv){
        var key = kv[1];
        var val2 = kv[2];
        if (!val2){ pendingKey = key; continue; }
        setKv(key, val2);
        pendingKey = null;
        continue;
      }
      if (pendingKey){
        setKv(pendingKey, line);
        pendingKey = null;
        continue;
      }
    }
    while (result.npcs.length && Object.keys(result.npcs[result.npcs.length-1] || {}).length === 0){
      result.npcs.pop();
    }
    if (!Object.keys(result.scene).length) delete result.scene;
    if (!Object.keys(result.hero).length) delete result.hero;
    if (!result.npcs.length) delete result.npcs;
    if (!result.scene && !result.hero && !result.npcs) return null;
    var anyDesc = (result.hero && result.hero.desc) ||
                  (result.npcs && result.npcs.some(function(n){ return n && n.desc; }));
    if (!anyDesc && !(result.scene && result.scene.lore)) return null;
    return result;
  }

  function mergeRecovered(yaml, narrative){
    if (!yaml && !narrative) return null;
    if (!yaml) return narrative;
    if (!narrative) return yaml;
    var out = { scene: {}, hero: {}, npcs: [] };
    ['lore','loc','obj','tone'].forEach(function(k){
      var y = yaml.scene && yaml.scene[k];
      var n = narrative.scene && narrative.scene[k];
      if (y) out.scene[k] = y;
      else if (n) out.scene[k] = n;
    });
    ['name','desc'].forEach(function(k){
      var y = yaml.hero && yaml.hero[k];
      var n = narrative.hero && narrative.hero[k];
      if (y) out.hero[k] = y;
      else if (n) out.hero[k] = n;
    });
    var yNpcs = yaml.npcs || [];
    var nNpcs = narrative.npcs || [];
    var maxLen = Math.max(yNpcs.length, nNpcs.length);
    for (var i = 0; i < maxLen; i++){
      var slot = {};
      ['name','desc'].forEach(function(k){
        var y = yNpcs[i] && yNpcs[i][k];
        var n = nNpcs[i] && nNpcs[i][k];
        if (y) slot[k] = y;
        else if (n) slot[k] = n;
      });
      out.npcs.push(slot);
    }
    while (out.npcs.length && Object.keys(out.npcs[out.npcs.length-1] || {}).length === 0){
      out.npcs.pop();
    }
    if (!Object.keys(out.scene).length) delete out.scene;
    if (!Object.keys(out.hero).length) delete out.hero;
    if (!out.npcs.length) delete out.npcs;
    if (!out.scene && !out.hero && !out.npcs) return null;
    return out;
  }

  function paraFirstBoldName(p){
    var m = String(p).match(/\*\*([^*\n]{1,20})\*\*/);
    return m ? cleanName(m[1]) : '';
  }

  function paraNpcIndex(p){
    var m = String(p).match(/第\s*([一二三四五六七八九十0-9]+)\s*の?\s*NPC/);
    if (m){
      var n = kanjiOrDigitToInt(m[1]);
      return n > 0 ? n - 1 : -1;
    }
    var m2 = String(p).match(/NPC\s*\[?\s*(\d+)\s*\]?/i);
    if (m2) return parseInt(m2[1], 10);
    return -1;
  }

  function isSceneParagraph(p){
    return /^(?:世界(?:は|観[:：]|の根本)|舞台(?:は|として)|ロアは)/.test(String(p).trim());
  }

  function isHeroParagraph(p, heroNameSeed){
    var t = String(p);
    if (/(?:^|\s)主人公(?:は|の|が|を|の名)/.test(t)) return true;
    if (/(?:^|\s)ヒーロー(?:は|の|が|を)/.test(t)) return true;
    if (/プロタゴニスト/.test(t)) return true;
    if (heroNameSeed){
      if (new RegExp('^' + escapeReg(heroNameSeed) + 'の名は').test(t.trim())) return true;
      var bn = paraFirstBoldName(t);
      if (bn && bn === heroNameSeed) return true;
    }
    return false;
  }

  function escapeReg(s){
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function extractScene(text){
    var scene = {};
    var flat = String(text).replace(/\n+/g, ' ');
    var pieces = flat.split('。');
    var sentences = [];
    for (var i = 0; i < pieces.length; i++){
      var seg = pieces[i].trim();
      if (seg) sentences.push(seg + (i < pieces.length - 1 ? '。' : ''));
    }
    function pickFirst(re, transform){
      for (var i = 0; i < sentences.length; i++){
        if (re.test(sentences[i])){
          return transform(sentences[i]);
        }
      }
      return '';
    }
    scene.lore = pickFirst(
      /(世界は|舞台は|ロアは|世界観\s*[:：])/,
      function(s){
        return cleanText(
          s.replace(/^.*?(?:世界は|舞台は|ロアは|世界観\s*[:：])\s*/, '')
        );
      }
    );
    scene.loc = pickFirst(
      /(具体的な場所|場所\s*[:：]|場所は(?!ある)|舞台地は|舞台地\s*[:：])/,
      function(s){
        return cleanText(
          s.replace(/^.*?(?:具体的な場所|場所|舞台地)\s*[:：]?\s*(?:は)?\s*/, '')
        );
      }
    );
    scene.obj = pickFirst(
      /目的(?:は|を\s|\s*[:：])/,
      function(s){
        return cleanText(
          s.replace(/^.*?目的\s*[:：]?\s*(?:は|を)?\s*/, '')
        );
      }
    );
    scene.tone = pickFirst(
      /(語りのトーン|語り口は|語り口\s*[:：]|トーン(?:は|\s*[:：])|雰囲気(?:は|\s*[:：]))/,
      function(s){
        return cleanText(
          s.replace(/^.*?(?:語りのトーン|語り口|トーン|雰囲気)\s*[:：]?\s*(?:は)?\s*/, '')
        );
      }
    );
    Object.keys(scene).forEach(function(k){
      if (scene[k] && scene[k].length > 200) scene[k] = scene[k].slice(0, 200);
      if (!scene[k]) delete scene[k];
    });
    return scene;
  }

  function recoverFromNarrative(text){
    if (!text || typeof text !== 'string') return null;
    var s = String(text).trim();
    s = s.replace(/^```(?:json|yaml|ya?ml)?\s*/i, '').replace(/\s*```\s*$/, '');
    if (s.length < 30) return null;
    var yamlR = null;
    try { yamlR = extractYamlHybrid(s); } catch(e){ yamlR = null; }
    var narrR = null;
    try { narrR = recoverNarrativeMode(s); } catch(e){ narrR = null; }
    if (!yamlR && !narrR) return null;
    if (!narrR) return yamlR;
    if (!yamlR) return narrR;
    return mergeRecovered(yamlR, narrR);
  }

  function recoverNarrativeMode(s){
    if (!s || s.length < 30) return null;
    var paragraphs = s.split(/\n\s*\n+/).map(function(p){ return p.trim(); }).filter(Boolean);
    if (paragraphs.length === 0) return null;
    var heroNameSeed = val('cfgHName');
    var npcNameSeeds = readNpcCardValues('name');
    var npcCount = document.querySelectorAll('#npcList .npc-card').length;
    var scene = extractScene(s);
    var hero = null;
    var npcsRecovered = new Array(npcCount).fill(null);
    var fallbackNpcQueue = [];
    paragraphs.forEach(function(p){
      if (isSceneParagraph(p)) return;
      var pName = paraFirstBoldName(p);
      var nIdx  = paraNpcIndex(p);
      var body  = paraBody(p);
      // v286e2-final: paraBody の結果を信頼し、空のときだけ cleanText(p) に fallback
      // (旧 < 30 fallback は YAML 風キー値が NPC desc に流入する不具合を起こしていた)
      if (!body){ body = cleanText(p); }
      if (nIdx >= 0){
        if (nIdx < npcsRecovered.length){
          if (!npcsRecovered[nIdx]){
            npcsRecovered[nIdx] = { name: pName || npcNameSeeds[nIdx] || '', desc: body };
          }
        }
        return;
      }
      if (!hero && isHeroParagraph(p, heroNameSeed)){
        hero = { name: pName || heroNameSeed || '', desc: body };
        return;
      }
      if (pName){
        for (var i = 0; i < npcNameSeeds.length; i++){
          if (npcNameSeeds[i] && pName === npcNameSeeds[i] && !npcsRecovered[i]){
            npcsRecovered[i] = { name: pName, desc: body };
            return;
          }
        }
      }
      fallbackNpcQueue.push({ name: pName, body: body });
    });
    var fallbackIdx = 0;
    if (!hero && fallbackNpcQueue.length){
      var head = fallbackNpcQueue[0];
      if (head.body && head.body.length >= 30){
        hero = { name: head.name || heroNameSeed || '', desc: head.body };
        fallbackIdx = 1;
      }
    }
    for (; fallbackIdx < fallbackNpcQueue.length; fallbackIdx++){
      var item = fallbackNpcQueue[fallbackIdx];
      var slot = -1;
      for (var k = 0; k < npcsRecovered.length; k++){
        if (!npcsRecovered[k]){ slot = k; break; }
      }
      if (slot < 0){
        if (npcsRecovered.length === 0){
          npcsRecovered.push(null);
          slot = 0;
        } else { break; }
      }
      npcsRecovered[slot] = { name: item.name || npcNameSeeds[slot] || '', desc: item.body };
    }
    var npcs = npcsRecovered.map(function(n){ return n || {}; });
    while (npcs.length && !npcs[npcs.length-1].name && !npcs[npcs.length-1].desc){
      npcs.pop();
    }
    var result = {};
    if (Object.keys(scene).length) result.scene = scene;
    if (hero && (hero.name || hero.desc)) result.hero = hero;
    if (npcs.length) result.npcs = npcs;
    if (!result.scene && !result.hero && !result.npcs) return null;
    return result;
  }

  function patchSafeParseJson(){
    if (!window.__v284 || typeof window.__v284.safeParseJson !== 'function') return false;
    if (window.__v284.safeParseJson.__v286eWrapped) return true;
    var orig = window.__v284.safeParseJson;
    var wrapped = function(text){
      var parsed;
      try { parsed = orig(text); } catch(e){
        console.warn(TAG, 'orig safeParseJson threw', e && e.message);
        parsed = null;
      }
      if (parsed) return parsed;
      var recovered;
      try { recovered = recoverFromNarrative(text); } catch(e){
        console.warn(TAG, 'recoverFromNarrative threw', e && e.message);
        recovered = null;
      }
      if (recovered){
        var keys = Object.keys(recovered);
        var npcLen = (recovered.npcs && recovered.npcs.length) || 0;
        console.log(TAG, 'narrative recovery succeeded:',
          'keys=', keys, 'npcs=', npcLen,
          'heroName=', (recovered.hero && recovered.hero.name) || '(none)',
          'heroDesc.len=', (recovered.hero && recovered.hero.desc && recovered.hero.desc.length) || 0
        );
      } else {
        console.log(TAG, 'narrative recovery failed (returned null) — text head:',
          String(text || '').slice(0, 120));
      }
      return recovered;
    };
    wrapped.__v286eWrapped = true;
    window.__v284.safeParseJson = wrapped;
    console.log(TAG, '__v284.safeParseJson wrapped');
    return true;
  }

  if (!patchSafeParseJson()){
    var tries = 0;
    var iv = setInterval(function(){
      if (patchSafeParseJson() || ++tries > 60) clearInterval(iv);
    }, 500);
  }

  window.__v286e = {
    recoverFromNarrative: recoverFromNarrative,
    recoverNarrativeMode: recoverNarrativeMode,
    extractYamlHybrid: extractYamlHybrid,
    mergeRecovered: mergeRecovered,
    extractScene: extractScene,
    paraBody: paraBody,
    paraFirstBoldName: paraFirstBoldName,
    paraNpcIndex: paraNpcIndex,
    isSceneParagraph: isSceneParagraph,
    isHeroParagraph: isHeroParagraph,
    version: 'v286e2-final'
  };

  console.log(TAG, 'v286e2-final (YAML/hybrid + body-fallback fix) init complete');
})();
