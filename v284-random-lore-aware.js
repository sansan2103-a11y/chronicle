/* v284: random-fill lore awareness via LLM (full delegation) — v4
 *
 * v4 変更点 (2026-05-09):
 *   - 世界観 (cfgLore) 自体も LLM 生成対象に拡張
 *   - 場所 (cfgLoc) / 目的 (cfgObj) / トーン (cfgTone) も同様
 *   - LLM は「空欄だったフィールドだけ」自由に発明 (固定リストの結果に上書き)
 *   - lore が空でも api key があれば LLM 起動 (旧仕様: lore 必須)
 *
 * v3 (継承):
 *   - Api.call 名前参照 (top-level const、window 経由不可)
 *   - JSON 引用符 repair (escapeJpInlineQuotes / regexExtract fallback)
 *
 * 哲学 (おしんさん 2026-05-09 指示):
 *   - 「自由度に制限かけたくない・モデルの良さを活かしたい」
 *   - 空欄 = 「自由に発明してよい」シグナル、入力済み = 制約として尊重
 *
 * 依存: Api.call(sys, user, maxTok) / cfgLore #/cfgLoc/cfgObj/cfgTone/cfgHName/cfgHDesc / .npc-card[data-f]
 * Chain: v111 (form sync) ← v108 (gender) ← v284 (lore-aware)  ※v284 が最外
 * Idempotent: __v284Active / UI.__v284Hooked
 */
(function v284(){
  var TAG = '[v284]';
  if (window.__v284Active) return;
  window.__v284Active = true;
  console.log(TAG, 'init v4');

  function val(id){
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function snapshotBlanks(){
    var blank = {
      sceneLore: !val('cfgLore'),
      sceneLoc:  !val('cfgLoc'),
      sceneObj:  !val('cfgObj'),
      sceneTone: !val('cfgTone'),
      hName: !val('cfgHName'),
      hDesc: !val('cfgHDesc'),
      oldNpcCount: 0,
      npcs: []
    };
    var cards = document.querySelectorAll('#npcList .npc-card');
    blank.oldNpcCount = cards.length;
    cards.forEach(function(card){
      var n = card.querySelector('[data-f="name"]');
      var d = card.querySelector('[data-f="desc"]');
      blank.npcs.push({
        name: n ? !n.value.trim() : false,
        desc: d ? !d.value.trim() : false
      });
    });
    return blank;
  }

  function extendBlanksForNewNpcs(blank){
    var cards = document.querySelectorAll('#npcList .npc-card');
    for (var i = blank.oldNpcCount; i < cards.length; i++){
      blank.npcs[i] = { name: true, desc: true };
    }
  }

  function listAskFields(blank){
    var ask = [];
    if (blank.sceneLore) ask.push('scene.lore');
    if (blank.sceneLoc)  ask.push('scene.loc');
    if (blank.sceneObj)  ask.push('scene.obj');
    if (blank.sceneTone) ask.push('scene.tone');
    if (blank.hName) ask.push('hero.name');
    if (blank.hDesc) ask.push('hero.desc');
    blank.npcs.forEach(function(n, i){
      if (n.name) ask.push('npcs[' + i + '].name');
      if (n.desc) ask.push('npcs[' + i + '].desc');
    });
    return ask;
  }

  function buildPrompt(blank){
    var ask = listAskFields(blank);
    if (ask.length === 0) return null;

    // 既に入力済み (= ロックされた条件) を集める。空欄 = LLM 自由領域
    var locked = [];
    if (!blank.sceneLore && val('cfgLore')) locked.push('世界観: ' + val('cfgLore'));
    if (!blank.sceneLoc  && val('cfgLoc'))  locked.push('場所: '  + val('cfgLoc'));
    if (!blank.sceneObj  && val('cfgObj'))  locked.push('目的: '  + val('cfgObj'));
    if (!blank.sceneTone && val('cfgTone')) locked.push('トーン: ' + val('cfgTone'));
    if (!blank.hName && val('cfgHName')) locked.push('主人公名: ' + val('cfgHName'));
    if (!blank.hDesc && val('cfgHDesc')) locked.push('主人公: ' + val('cfgHDesc'));
    document.querySelectorAll('#npcList .npc-card').forEach(function(card, i){
      var nm = card.querySelector('[data-f="name"]');
      var dc = card.querySelector('[data-f="desc"]');
      if (nm && nm.value.trim() && !blank.npcs[i].name) locked.push('NPC[' + i + ']名: ' + nm.value.trim());
      if (dc && dc.value.trim() && !blank.npcs[i].desc) locked.push('NPC[' + i + ']: ' + dc.value.trim());
    });

    var sys = [
      'TRPG セッションの世界観とキャラクター一式を作ってください。',
      '・与えられた「ロック条件」を尊重しつつ、空いている要素を自由に発明する',
      '・世界観・場所・目的・トーン・主人公・NPC が互いに響き合う一貫した物語空間を作る',
      '・名前は世界観の語彙・響きに合わせて自由に造語してよい',
      '・性別・年齢・種族・職能・立場は自由',
      '・desc は1〜3文・80文字以内',
      '・出力は厳密に JSON のみ。前後に説明文・コードフェンス・コメントは付けない',
      '・JSON 値の中で引用符を使う時は 「」 や 『』 を使う (素の " は JSON が壊れる)'
    ].join('\n');

    var user = [
      '【ロック条件 (尊重して動かさない)】',
      locked.length ? locked.join('\n') : '(なし — 完全に自由に発明してよい)',
      '',
      '【生成してほしいフィールド】',
      JSON.stringify(ask),
      '',
      '【NPC 数】 ' + blank.npcs.length,
      '',
      '【出力 JSON 形式の例】',
      '{"scene":{"lore":"...","loc":"...","obj":"...","tone":"..."},"hero":{"name":"...","desc":"..."},"npcs":[{"name":"...","desc":"..."}]}',
      '',
      '※ 必要なフィールドだけ含めればよい。',
      '※ scene.lore は世界の根本設定 (1〜2文)、loc は具体的な場所、obj は主人公の現在の目的、tone は語りのトーン。',
      '※ 文字列値の中に " を使わない。代わりに 「」 を使う。'
    ].join('\n');

    return { sys: sys, user: user };
  }

  function escapeJpInlineQuotes(s){
    var out = '';
    for (var i = 0; i < s.length; i++){
      var c = s[i];
      if (c === '"'){
        var prev = i > 0 ? s.charCodeAt(i - 1) : 0;
        var next = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
        var isJp = function(cc){
          return (cc >= 0x3040 && cc <= 0x309F) ||
                 (cc >= 0x30A0 && cc <= 0x30FF) ||
                 (cc >= 0x4E00 && cc <= 0x9FFF) ||
                 (cc >= 0xFF01 && cc <= 0xFF60) ||
                 (cc >= 0x3000 && cc <= 0x303F); // CJK punctuation も含める
        };
        if (isJp(prev) && isJp(next)){
          out += '\\"';
          continue;
        }
      }
      out += c;
    }
    return out;
  }

  function safeParseJson(text){
    if (!text) return null;
    var s = String(text).trim();
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    try { return JSON.parse(s); } catch (e) {}
    var lo = s.indexOf('{'), hi = s.lastIndexOf('}');
    var trimmed = (lo >= 0 && hi > lo) ? s.slice(lo, hi + 1) : s;
    try { return JSON.parse(trimmed); } catch (e) {}
    var repaired = escapeJpInlineQuotes(trimmed);
    try { return JSON.parse(repaired); } catch (e) {}
    return regexExtract(trimmed);
  }

  // 壊れた JSON 用の最終 fallback
  function regexExtract(s){
    var out = { scene: {}, hero: {}, npcs: [] };
    var sceneBlock = s.match(/"scene"\s*:\s*\{([\s\S]*?)\}/);
    if (sceneBlock){
      var sb = sceneBlock[1];
      ['lore','loc','obj','tone'].forEach(function(k){
        var m = sb.match(new RegExp('"' + k + '"\\s*:\\s*"([^"]*)"'));
        if (m) out.scene[k] = m[1];
      });
    }
    var heroBlock = s.match(/"hero"\s*:\s*\{([\s\S]*?)\}/);
    if (heroBlock){
      var hb = heroBlock[1];
      var hn = hb.match(/"name"\s*:\s*"([^"]*)"/);
      var hd = hb.match(/"desc"\s*:\s*"([^"]*)"/);
      if (hn) out.hero.name = hn[1];
      if (hd) out.hero.desc = hd[1];
    }
    var npcsBlock = s.match(/"npcs"\s*:\s*\[([\s\S]*?)\](?:\s*\}?)/);
    if (npcsBlock){
      var nb = npcsBlock[1];
      var parts = nb.split(/\}\s*,\s*\{/);
      parts.forEach(function(p){
        var nm = p.match(/"name"\s*:\s*"([^"]*)"/);
        var dc = p.match(/"desc"\s*:\s*"([^"]*)"/);
        if (nm || dc){
          var npc = {};
          if (nm) npc.name = nm[1];
          if (dc) npc.desc = dc[1];
          out.npcs.push(npc);
        }
      });
    }
    var hasAny = out.scene.lore || out.scene.loc || out.scene.obj || out.scene.tone
              || out.hero.name || out.hero.desc || out.npcs.length;
    return hasAny ? out : null;
  }

  function setVal(el, v){
    if (!el || v === undefined || v === null) return false;
    var s = String(v).trim();
    if (!s) return false;
    el.value = s;
    try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch(e){}
    return true;
  }

  function setById(id, v){ return setVal(document.getElementById(id), v); }

  function applyResult(blank, parsed){
    if (!parsed || typeof parsed !== 'object') return 0;
    var changed = 0;

    // scene fields
    if (parsed.scene && typeof parsed.scene === 'object'){
      if (blank.sceneLore && setById('cfgLore', parsed.scene.lore)) changed++;
      if (blank.sceneLoc  && setById('cfgLoc',  parsed.scene.loc))  changed++;
      if (blank.sceneObj  && setById('cfgObj',  parsed.scene.obj))  changed++;
      if (blank.sceneTone && setById('cfgTone', parsed.scene.tone)) changed++;
    }

    // hero
    if (parsed.hero){
      if (blank.hName && setById('cfgHName', parsed.hero.name)) changed++;
      if (blank.hDesc && setById('cfgHDesc', parsed.hero.desc)) changed++;
    }

    // npcs
    var cards = document.querySelectorAll('#npcList .npc-card');
    var pNpcs = (parsed.npcs && Array.isArray(parsed.npcs)) ? parsed.npcs : [];
    blank.npcs.forEach(function(b, i){
      var card = cards[i]; if (!card) return;
      var p = pNpcs[i] || {};
      if (b.name && setVal(card.querySelector('[data-f="name"]'), p.name)) changed++;
      if (b.desc && setVal(card.querySelector('[data-f="desc"]'), p.desc)) changed++;
    });
    return changed;
  }

  // localStorage cast / scene を form と同期 (v111 が後で sync しても上書きされないように)
  function syncStateFromForm(){
    try {
      var s = JSON.parse(localStorage.getItem('chr6') || '{}');
      s.cast = s.cast || {};
      s.cast.hero = s.cast.hero || {};
      s.cast.hero.name = val('cfgHName');
      s.cast.hero.desc = val('cfgHDesc');
      s.cast.npcs = s.cast.npcs || [];
      document.querySelectorAll('#npcList .npc-card').forEach(function(card, i){
        s.cast.npcs[i] = s.cast.npcs[i] || {};
        var nameEl = card.querySelector('[data-f="name"]');
        var descEl = card.querySelector('[data-f="desc"]');
        if (nameEl) s.cast.npcs[i].name = nameEl.value.trim();
        if (descEl) s.cast.npcs[i].desc = descEl.value.trim();
      });
      s.scene = s.scene || {};
      s.scene.lore = val('cfgLore');
      s.scene.loc  = val('cfgLoc');
      s.scene.obj  = val('cfgObj');
      s.scene.tone = val('cfgTone');
      localStorage.setItem('chr6', JSON.stringify(s));
      // also sync in-memory S if exposed
      if (window.S){
        if (S.cast && S.cast.hero){ S.cast.hero.name = s.cast.hero.name; S.cast.hero.desc = s.cast.hero.desc; }
        if (S.scene){ S.scene.lore = s.scene.lore; S.scene.loc = s.scene.loc; S.scene.obj = s.scene.obj; S.scene.tone = s.scene.tone; }
      }
    } catch(e){
      console.warn(TAG, 'state sync failed', e && e.message);
    }
  }

  function getApi(){
    try { if (typeof Api === 'object' && Api && typeof Api.call === 'function') return Api; } catch(e){}
    return null;
  }

  function hasApiKey(){
    try {
      var prov = (window.S && S.cfg && S.cfg.provider) || '';
      if (prov === 'openrouter') return !!(S.cfg.orKey && S.cfg.orKey.trim());
      if (prov === 'novelai')    return !!(S.cfg.naiKey && S.cfg.naiKey.trim());
      return !!(S.cfg.key && S.cfg.key.trim());
    } catch(e){ return false; }
  }

  function showStatus(msg){
    try {
      if (typeof UI !== 'undefined' && UI && typeof UI.setStatus === 'function') UI.setStatus(msg);
    } catch(e){}
  }

  function loreEnhance(blank){
    extendBlanksForNewNpcs(blank);
    if (!hasApiKey()){
      console.log(TAG, 'no API key — skip LLM');
      return;
    }
    var pr = buildPrompt(blank);
    if (!pr){
      console.log(TAG, 'no blank fields — skip LLM');
      return;
    }
    var api = getApi();
    if (!api){ console.warn(TAG, 'Api.call not ready'); return; }
    showStatus('🌌 世界観とキャラを生成中…');
    console.log(TAG, 'LLM ask fields', listAskFields(blank));
    api.call(pr.sys, pr.user, 2200).then(function(r){
      if (!r || !r.text){ console.warn(TAG, 'LLM returned empty'); return; }
      var parsed = safeParseJson(r.text);
      if (!parsed){
        console.warn(TAG, 'JSON parse failed:', String(r.text).slice(0, 300));
        showStatus('🎲 ランダム生成しました（LLM 解析失敗 → 固定リスト）');
        return;
      }
      console.log(TAG, 'parsed', parsed);
      var n = applyResult(blank, parsed);
      if (n > 0){
        syncStateFromForm();
        showStatus('🌌 ' + n + ' 件を世界観に馴染ませました');
        console.log(TAG, 'applied', n, 'fields');
      } else {
        console.log(TAG, 'no fields applied');
      }
    }).catch(function(e){
      console.warn(TAG, 'LLM error', e && e.message);
      showStatus('🎲 ランダム生成しました（LLM スキップ）');
    });
  }

  function hookRandomFill(){
    if (typeof UI !== 'object' || !UI) return;
    if (UI.__v284Hooked) return;
    if (typeof UI.randomFill !== 'function') return;
    var orig = UI.randomFill.bind(UI);
    UI.randomFill = function(){
      var blank = snapshotBlanks();
      console.log(TAG, 'snapshot', blank);
      var r = orig.apply(this, arguments);
      setTimeout(function(){ loreEnhance(blank); }, 400);
      return r;
    };
    UI.__v284Hooked = true;
    console.log(TAG, 'UI.randomFill wrapped (v4)');
  }

  function init(){ hookRandomFill(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  setTimeout(init, 500);
  setTimeout(init, 2000);
  setTimeout(init, 4000);

  window.__v284 = {
    snapshotBlanks: snapshotBlanks,
    buildPrompt: buildPrompt,
    safeParseJson: safeParseJson,
    loreEnhance: loreEnhance,
    listAskFields: listAskFields,
    getApi: getApi,
    escapeJpInlineQuotes: escapeJpInlineQuotes,
    regexExtract: regexExtract
  };
  console.log(TAG, 'v284 active: random-lore-aware v4 (scene + chars LLM full delegation)');
})();
