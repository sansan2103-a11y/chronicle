/* v285: seed-aware random fill — wraps v284 with the "seed" philosophy.
 *
 * 設計思想 (おしんさん 2026-05-09 後半指示):
 *   「プレーヤーの作った種を広げて豊かにしていく設定がいいかなと思ってる。
 *    プレイヤーの想いを形にすることができ更に手軽さもある。そんなイメージかな」
 *
 *   v4 までの「入力済み = 動かさない (ロック条件)」二分法から脱却し、
 *   入力済み = 「種 (seed)」 として扱い、その意図を保ったまま豊かに膨らませる。
 *
 * 改善点:
 *   1. プロンプト基調を「種を消さず広げる」方向に書き換え
 *   2. POV 規定: hero.desc は本人視点、npc.desc は外から見た第一印象
 *   3. desc 文字数指定: hero 50-120 / npc 50-100、「性別: ◯」だけは禁止
 *   4. 「性別: ◯」prefix を v108 から受け継いだ blank フィールドから事前に剥がす
 *   5. 出力検証: desc が空 / 30文字未満なら 1 回だけ retry
 *
 * 戦略:
 *   v284 の wrap を温存しつつ、v285 が UI.randomFill をさらに wrap。
 *   v284 の内部 loreEnhance は Api.call の一時的 stub で不発化させ、
 *   v285 が自前パイプラインで本番 LLM を呼ぶ。
 *   v284 の helpers (snapshotBlanks / safeParseJson / getApi 等) は再利用。
 *
 * 依存: window.__v284 (helpers), Api.call, S.cfg, UI.randomFill, UI.setStatus
 * Idempotent: __v285Active / UI.__v285Hooked
 */
(function v285(){
  var TAG = '[v285]';
  if (window.__v285Active) return;

  // ---------- DOM helpers ----------
  function val(id){
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
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

  // ---------- Gender prefix utilities ----------
  // v108 が空欄 desc に「性別: 女性。」のようなプレースホルダを書き込む。
  // LLM が desc を充実させなかった時、これだけ残ると見栄えが悪い。
  // 元から空欄だった (blank=true) フィールドからは事前に剥がしておく。
  var GENDER_RE = /^性別\s*[:：]\s*[^。\n]*。?\s*$/;

  function stripGenderPrefix(s){
    return String(s || '').replace(/^性別\s*[:：]\s*[^。\n]*。\s*/, '').trim();
  }

  function clearGenderPlaceholders(blank){
    if (blank.hDesc){
      var hDesc = document.getElementById('cfgHDesc');
      if (hDesc && GENDER_RE.test(hDesc.value.trim())){
        hDesc.value = '';
        try { hDesc.dispatchEvent(new Event('input', {bubbles:true})); } catch(e){}
      }
    }
    var cards = document.querySelectorAll('#npcList .npc-card');
    cards.forEach(function(card, i){
      if (blank.npcs[i] && blank.npcs[i].desc){
        var dc = card.querySelector('[data-f="desc"]');
        if (dc && GENDER_RE.test(dc.value.trim())){
          dc.value = '';
          try { dc.dispatchEvent(new Event('input', {bubbles:true})); } catch(e){}
        }
      }
    });
  }

  // ---------- Config / status ----------
  function hasApiKey(){
    try {
      var prov = (window.S && S.cfg && S.cfg.provider) || '';
      if (prov === 'openrouter') return !!(S.cfg.orKey && S.cfg.orKey.trim());
      if (prov === 'novelai')    return !!(S.cfg.naiKey && S.cfg.naiKey.trim());
      return !!(S.cfg.key && S.cfg.key.trim());
    } catch(e){ return false; }
  }

  function getApi(){
    try { if (typeof Api === 'object' && Api && typeof Api.call === 'function') return Api; } catch(e){}
    return null;
  }

  function showStatus(msg){
    try {
      if (typeof UI !== 'undefined' && UI && typeof UI.setStatus === 'function') UI.setStatus(msg);
    } catch(e){}
  }

  // ---------- Seed collection ----------
  // 入力済み = 「プレイヤーの種」。意図を保って膨らませる対象。
  function collectSeeds(blank){
    var seeds = [];
    if (!blank.sceneLore && val('cfgLore')) seeds.push('世界観の種: 「' + val('cfgLore') + '」');
    if (!blank.sceneLoc  && val('cfgLoc'))  seeds.push('場所の種: 「'  + val('cfgLoc') + '」');
    if (!blank.sceneObj  && val('cfgObj'))  seeds.push('目的の種: 「'  + val('cfgObj') + '」');
    if (!blank.sceneTone && val('cfgTone')) seeds.push('トーンの種: 「' + val('cfgTone') + '」');
    if (!blank.hName && val('cfgHName')) seeds.push('主人公名の種: 「' + val('cfgHName') + '」');
    if (!blank.hDesc && val('cfgHDesc')){
      var hd = stripGenderPrefix(val('cfgHDesc'));
      if (hd) seeds.push('主人公像の種: 「' + hd + '」');
    }
    document.querySelectorAll('#npcList .npc-card').forEach(function(card, i){
      var nm = card.querySelector('[data-f="name"]');
      var dc = card.querySelector('[data-f="desc"]');
      if (nm && nm.value.trim() && !blank.npcs[i].name) seeds.push('NPC[' + i + ']名の種: 「' + nm.value.trim() + '」');
      if (dc && dc.value.trim() && blank.npcs[i] && !blank.npcs[i].desc){
        var v = stripGenderPrefix(dc.value.trim());
        if (v) seeds.push('NPC[' + i + ']像の種: 「' + v + '」');
      }
    });
    return seeds;
  }

  // ---------- Field listing (mirrors v284) ----------
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

  function extendBlanksForNewNpcs(blank){
    var cards = document.querySelectorAll('#npcList .npc-card');
    for (var i = blank.oldNpcCount; i < cards.length; i++){
      blank.npcs[i] = { name: true, desc: true };
    }
  }

  // ---------- Seed-aware prompt ----------
  function buildSeedPrompt(blank){
    var ask = listAskFields(blank);
    if (ask.length === 0) return null;
    var seeds = collectSeeds(blank);

    var sys = [
      'TRPG セッションの世界観とキャラクター一式を作ってください。',
      '',
      '【最重要 — 設計思想】',
      '・プレイヤーが書き留めた「種(seed)」は、その意図を絶対に保つ。種にある固有名詞・キーワード・含意を消したり言い換えたりしない',
      '・種は短い断片であっても、その方向に世界を豊かに広げる。種を出発点として周辺要素 (NPC, 場所, 目的, トーン) が自然に響き合うよう、余白を埋めていく',
      '・空欄の要素は、種に馴染むよう自由に発明してよい',
      '・「制約より刺激」: 種を否定する形ではなく、種を肯定し膨らませる方向で書く',
      '',
      '【視点 (POV) の規定 — 厳守】',
      '・hero.desc は「主人公本人の像」として書く — 年齢・性別・職能・特徴・小さな秘密を簡潔に。語り手目線・「〜の友人」「〜の同級生」のような他者視点は禁止',
      '・npc[].desc は「外から見たそのキャラの第一印象」 — 役割・主人公との関係性・癖や雰囲気',
      '・scene.lore は「世界の根本ルール」として客観的に',
      '',
      '【desc の量 — 厳守】',
      '・hero.desc は 50〜120 文字。生身の人物像が立ち上がる程度の具体性',
      '・npc[].desc は 50〜100 文字。第一印象として情景が浮かぶ程度',
      '・「性別: ◯」だけで終わるのは絶対に不可。具体的な特徴を必ず書く',
      '',
      '【その他】',
      '・名前は世界観の語彙・響きに合わせて自由に造語してよい',
      '・性別・年齢・種族・職能・立場は自由',
      '・出力は厳密に JSON のみ。前後に説明文・コードフェンス・コメントは付けない',
      '・JSON 値の中で引用符を使う時は「」や『』を使う (素の " は JSON が壊れる)'
    ].join('\n');

    var user = [
      '【プレイヤーの種 (seed) — 意図を保ってください】',
      seeds.length ? seeds.join('\n') : '(なし — 完全に自由に発明してよい)',
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
      '※ 文字列値の中に " を使わない。代わりに「」を使う。'
    ].join('\n');

    return { sys: sys, user: user };
  }

  // ---------- Apply ----------
  function applyResult(blank, parsed){
    if (!parsed || typeof parsed !== 'object') return 0;
    var changed = 0;

    if (parsed.scene && typeof parsed.scene === 'object'){
      if (blank.sceneLore && setById('cfgLore', parsed.scene.lore)) changed++;
      if (blank.sceneLoc  && setById('cfgLoc',  parsed.scene.loc))  changed++;
      if (blank.sceneObj  && setById('cfgObj',  parsed.scene.obj))  changed++;
      if (blank.sceneTone && setById('cfgTone', parsed.scene.tone)) changed++;
    }
    if (parsed.hero){
      if (blank.hName && setById('cfgHName', parsed.hero.name)) changed++;
      if (blank.hDesc && setById('cfgHDesc', parsed.hero.desc)) changed++;
    }
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

  // ---------- Thin desc detection ----------
  // desc が空 or 30 文字未満 or 「性別: ◯」だけ のフィールドは retry 対象
  function isThinDesc(s){
    if (!s) return true;
    var t = String(s).trim();
    if (t.length < 30) return true;
    if (GENDER_RE.test(t)) return true;
    return false;
  }

  function findThinDescs(blank, parsed){
    var thin = [];
    if (blank.hDesc){
      var d = (parsed && parsed.hero && parsed.hero.desc) || '';
      if (isThinDesc(d)) thin.push('hero.desc');
    }
    var pNpcs = (parsed && parsed.npcs && Array.isArray(parsed.npcs)) ? parsed.npcs : [];
    blank.npcs.forEach(function(b, i){
      if (b.desc){
        var nd = (pNpcs[i] && pNpcs[i].desc) || '';
        if (isThinDesc(nd)) thin.push('npcs[' + i + '].desc');
      }
    });
    return thin;
  }

  // ---------- Retry prompt for thin descs ----------
  function buildRetryPrompt(blank, prevParsed, thinFields){
    var sys = [
      '前回の生成で desc が薄すぎた / 空だった / 「性別: ◯」だけだったフィールドを補完してください。',
      '',
      '【ルール — 厳守】',
      '・必ず 50 文字以上の具体的な desc を書く',
      '・hero.desc は主人公本人の像 (年齢/性別/職能/特徴/小さな秘密)。他者視点 NG',
      '・npc[].desc は外から見た第一印象 (役割/関係/癖/雰囲気)',
      '・「性別: ◯」だけで終わるのは絶対不可',
      '・前回の他フィールドの内容と矛盾しないよう、世界観に沿わせる',
      '・出力は JSON のみ。引用符は「」を使う'
    ].join('\n');

    var ctx = [];
    if (prevParsed && prevParsed.scene){
      var sc = prevParsed.scene;
      ctx.push('世界観: ' + (sc.lore || '') + ' / 場所: ' + (sc.loc || '') + ' / 目的: ' + (sc.obj || '') + ' / トーン: ' + (sc.tone || ''));
    }
    if (prevParsed && prevParsed.hero){
      ctx.push('主人公: ' + (prevParsed.hero.name || '') + ' — ' + (prevParsed.hero.desc || ''));
    }
    if (prevParsed && prevParsed.npcs){
      prevParsed.npcs.forEach(function(n, i){
        ctx.push('NPC[' + i + ']: ' + ((n && n.name) || '') + ' — ' + ((n && n.desc) || ''));
      });
    }

    var user = [
      '【既に決まっている文脈】',
      ctx.length ? ctx.join('\n') : '(なし)',
      '',
      '【補完してほしいフィールド】',
      JSON.stringify(thinFields),
      '',
      '【出力例】',
      '{"hero":{"desc":"..."},"npcs":[{"desc":"..."}]}',
      '',
      '※ 補完対象フィールドのみ含めれば良い。',
      '※ 配列インデックスを保つ (例: NPC[2] のみ薄かったなら npcs[0],npcs[1] は省略可、npcs[2] のみ書く形でも可。または length 揃えて null/{} を入れても可)。',
      '※ 文字列値に素の " を使わない。'
    ].join('\n');

    return { sys: sys, user: user };
  }

  function applyRetryResult(parsed2, thinFields){
    if (!parsed2) return 0;
    var changed = 0;
    thinFields.forEach(function(f){
      if (f === 'hero.desc'){
        if (parsed2.hero && parsed2.hero.desc && !isThinDesc(parsed2.hero.desc)){
          if (setById('cfgHDesc', parsed2.hero.desc)) changed++;
        }
      } else {
        var m = f.match(/^npcs\[(\d+)\]\.desc$/);
        if (m){
          var i = parseInt(m[1], 10);
          var pNpc = (parsed2.npcs && parsed2.npcs[i]) || null;
          if (pNpc && pNpc.desc && !isThinDesc(pNpc.desc)){
            var card = document.querySelectorAll('#npcList .npc-card')[i];
            if (card){
              var dc = card.querySelector('[data-f="desc"]');
              if (dc && setVal(dc, pNpc.desc)) changed++;
            }
          }
        }
      }
    });
    return changed;
  }

  // ---------- localStorage / S sync (mirrors v284) ----------
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
      if (window.S){
        if (S.cast && S.cast.hero){ S.cast.hero.name = s.cast.hero.name; S.cast.hero.desc = s.cast.hero.desc; }
        if (S.scene){ S.scene.lore = s.scene.lore; S.scene.loc = s.scene.loc; S.scene.obj = s.scene.obj; S.scene.tone = s.scene.tone; }
      }
    } catch(e){
      console.warn(TAG, 'state sync failed', e && e.message);
    }
  }

  // ---------- Main pipeline ----------
  function runEnhance(blank){
    extendBlanksForNewNpcs(blank);
    if (!hasApiKey()){
      console.log(TAG, 'no API key — keep v108 fallback as-is');
      return;
    }
    // 「性別: ◯」プレースホルダを blank フィールドから剥がす (LLM が空白として埋める)
    clearGenderPlaceholders(blank);

    var pr = buildSeedPrompt(blank);
    if (!pr){
      console.log(TAG, 'no blank fields — skip');
      return;
    }
    var api = getApi();
    if (!api){ console.warn(TAG, 'Api.call not ready'); return; }

    showStatus('🌱 種を膨らませて世界を編む…');
    var ask = listAskFields(blank);
    console.log(TAG, 'LLM ask fields', ask, 'seeds', collectSeeds(blank).length);

    var parser = (window.__v284 && window.__v284.safeParseJson) ? window.__v284.safeParseJson : null;
    if (!parser){ console.warn(TAG, 'v284 parser missing'); return; }

    api.call(pr.sys, pr.user, 2400).then(function(r){
      if (!r || !r.text){
        console.warn(TAG, 'empty LLM response');
        showStatus('🎲 ランダム生成（LLM 応答なし）');
        return;
      }
      var parsed = parser(r.text);
      if (!parsed){
        console.warn(TAG, 'parse failed:', String(r.text).slice(0, 300));
        showStatus('🎲 ランダム生成（解析失敗）');
        return;
      }
      console.log(TAG, 'parsed', parsed);
      var n = applyResult(blank, parsed);
      var thin = findThinDescs(blank, parsed);
      console.log(TAG, 'applied', n, 'thin', thin);

      if (thin.length === 0){
        syncStateFromForm();
        showStatus('🌱 ' + n + ' 件の種を世界に咲かせました');
        return;
      }

      // 軽量 retry — 薄い desc を補完
      showStatus('🌱 さらに膨らませています…');
      var pr2 = buildRetryPrompt(blank, parsed, thin);
      api.call(pr2.sys, pr2.user, 1500).then(function(r2){
        var parsed2 = parser(r2 && r2.text);
        var added = applyRetryResult(parsed2, thin);
        syncStateFromForm();
        if (added > 0){
          showStatus('🌱 ' + (n + added) + ' 件の種を咲かせ、' + added + ' 件を補完しました');
          console.log(TAG, 'retry applied', added);
        } else {
          showStatus('🌱 ' + n + ' 件の種を咲かせました（一部簡素）');
        }
      }).catch(function(e){
        console.warn(TAG, 'retry error', e && e.message);
        syncStateFromForm();
        showStatus('🌱 ' + n + ' 件の種を咲かせました（補完スキップ）');
      });
    }).catch(function(e){
      console.warn(TAG, 'LLM error', e && e.message);
      showStatus('🎲 ランダム生成（LLM スキップ）');
    });
  }

  // ---------- Hook ----------
  // v284 の hook の上にさらに wrap。v284 内部の loreEnhance は Api.call 一時 stub で不発化。
  function hookOnTopOfV284(){
    if (typeof UI !== 'object' || !UI) return false;
    if (typeof UI.randomFill !== 'function') return false;
    if (!UI.__v284Hooked) return false; // v284 が先に hook されているのを待つ
    if (UI.__v285Hooked) return true;
    if (!window.__v284 || typeof window.__v284.snapshotBlanks !== 'function') return false;

    var v284wrap = UI.randomFill.bind(UI);

    UI.randomFill = function(){
      var blank = window.__v284.snapshotBlanks();
      console.log(TAG, 'snapshot', blank);

      // v284 内部の loreEnhance の Api 呼び出しだけを一時的に空応答に差し替える
      var Api_ref = (typeof Api === 'object' && Api) ? Api : null;
      if (Api_ref && !Api_ref.__v285Stubbed){
        Api_ref.__v285Stubbed = true;
        var origCall = Api_ref.call;
        Api_ref.call = function(){
          console.log(TAG, 'stubbed v284 inner Api.call');
          return Promise.resolve({ text: '' });
        };
        // v284 の setTimeout(loreEnhance, 400) 発火後に restore
        setTimeout(function(){
          Api_ref.call = origCall;
          delete Api_ref.__v285Stubbed;
        }, 500);
      }

      var r = v284wrap.apply(this, arguments);

      // v284 の base→v108→v111 と loreEnhance bail を待ってから本番呼び出し
      setTimeout(function(){ runEnhance(blank); }, 700);
      return r;
    };
    UI.__v285Hooked = true;
    window.__v285Active = true;
    console.log(TAG, 'UI.randomFill re-wrapped (v285 seed-aware)');
    return true;
  }

  function init(){
    if (hookOnTopOfV284()) return;
    // v284 がまだ hook できていない可能性 — リトライ
    setTimeout(function(){ if (!UI.__v285Hooked) hookOnTopOfV284(); }, 400);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  setTimeout(init, 700);
  setTimeout(init, 1500);
  setTimeout(init, 3000);
  setTimeout(init, 6000);

  // ---------- Public surface ----------
  window.__v285 = {
    runEnhance: runEnhance,
    buildSeedPrompt: buildSeedPrompt,
    collectSeeds: collectSeeds,
    findThinDescs: findThinDescs,
    isThinDesc: isThinDesc,
    stripGenderPrefix: stripGenderPrefix,
    clearGenderPlaceholders: clearGenderPlaceholders,
    listAskFields: listAskFields
  };
  console.log(TAG, 'v285 active: seed-aware (POV + thick desc + retry)');
})();
