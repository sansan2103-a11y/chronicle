// v291-llm-aware-randomfill.js
// Purpose:
//   1. Preserve all user-entered settings fields across UI.randomFill execution.
//      Bug observed (2026-05-13 おしん): NPC personality/coreDesire/coreFear/wound
//      could be wiped because v110 only syncs name/desc to cast, then v108
//      re-opens settings panel after randomFill, causing the panel to re-render
//      from stale cast values.
//   2. Extend the §3.1 "seed-aware" philosophy to NPC psych fields. When NPC
//      name/desc are entered (= seeds) but personality/coreDesire/coreFear/wound
//      are blank, ask the LLM to generate fields that *resonate* with the
//      existing seed (name/desc/world). Never touch fields the user already filled.
//
// Philosophy (CLAUDE_RULES §3.1 — おしん 2026-05-13 直接の言葉):
//   "プレイヤーの入力を種として表現を広げていく物語"
//   "モデルの良さを活かした仕組み" / "表現に制限をかけずに自由度を高く保てる方法"
//
// Strategy:
//   - Wrap UI.randomFill at the OUTERMOST level (latest re-wrap wins).
//   - Snapshot DOM field values BEFORE calling the inner chain.
//     This bypasses the v110 form->cast debounce race because we read DOM directly.
//   - Run the inner chain (v286 etc) as before so existing seed-expansion still works.
//   - After the chain settles, RESTORE any field that had a non-empty snapshot value
//     but got changed by the chain. This guarantees user input is preserved.
//   - Separately, if any NPC has name/desc but blank psych fields, fire an LLM call
//     to fill ONLY those psych fields, using existing values as context (seeds).
//   - Idempotent guard: window.__v291Active. Re-wrap guard: UI.__v291Wrapped.

(function v291(){
  'use strict';
  if (window.__v291Active) return;
  window.__v291Active = true;
  var TAG = '[v291]';

  // ---------- DOM helpers ----------
  function $(id){ return document.getElementById(id); }
  function val(el){ return el && typeof el.value === 'string' ? el.value : ''; }
  function trimmed(s){ return (s == null ? '' : String(s)).trim(); }

  var SCENE_IDS = ['cfgLore','cfgLoc','cfgObj','cfgTone'];
  var HERO_IDS  = ['cfgHName','cfgHDesc'];
  var NPC_FIELDS = ['name','desc','personality','coreDesire','coreFear','wound'];
  var NPC_PSYCH_FIELDS = ['personality','coreDesire','coreFear','wound'];

  // ---------- Snapshot ----------
  function snapshotDom() {
    var snap = { scene: {}, hero: {}, npcs: [] };
    SCENE_IDS.forEach(function(id){ snap.scene[id] = val($(id)); });
    HERO_IDS.forEach(function(id){ snap.hero[id] = val($(id)); });
    var cards = document.querySelectorAll('#npcList .npc-card');
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      var npc = {};
      NPC_FIELDS.forEach(function(f){
        var el = c.querySelector('[data-f="' + f + '"]');
        npc[f] = el ? val(el) : null;
      });
      snap.npcs.push(npc);
    }
    return snap;
  }

  // ---------- Restore (non-blank only) ----------
  // Restore any field whose SNAPSHOT value was non-blank but the current DOM differs.
  // Fields snapshot=blank are left alone (the inner chain may have filled them).
  function restoreNonBlank(snap) {
    var restored = [];
    function tryRestore(el, oldVal, label) {
      if (!el) return;
      if (!trimmed(oldVal)) return; // snapshot was blank, don't restore
      if (val(el) === oldVal) return; // same as snapshot, no change
      el.value = oldVal;
      try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch(e){}
      restored.push(label);
    }
    SCENE_IDS.forEach(function(id){ tryRestore($(id), snap.scene[id], id); });
    HERO_IDS.forEach(function(id){ tryRestore($(id), snap.hero[id], id); });
    var cards = document.querySelectorAll('#npcList .npc-card');
    snap.npcs.forEach(function(npc, idx){
      var card = cards[idx];
      if (!card) return;
      NPC_FIELDS.forEach(function(f){
        var el = card.querySelector('[data-f="' + f + '"]');
        tryRestore(el, npc[f], 'npc[' + idx + '].' + f);
      });
    });
    return restored;
  }

  // ---------- Identify NPC psych fields that need LLM completion ----------
  // A NPC qualifies for psych-completion if it has a non-blank name or desc
  // (= seed exists to anchor the psych on) AND at least one psych field is blank.
  function listNpcPsychTargets() {
    var targets = [];
    var cards = document.querySelectorAll('#npcList .npc-card');
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      var name = trimmed((c.querySelector('[data-f="name"]') || {}).value);
      var desc = trimmed((c.querySelector('[data-f="desc"]') || {}).value);
      if (!name && !desc) continue; // no seed → no target (avoid hallucinating identity)
      var missing = [];
      NPC_PSYCH_FIELDS.forEach(function(f){
        var v = trimmed((c.querySelector('[data-f="' + f + '"]') || {}).value);
        if (!v) missing.push(f);
      });
      if (missing.length > 0) {
        targets.push({ i: i, name: name, desc: desc, missing: missing });
      }
    }
    return targets;
  }

  // ---------- LLM prompt for psych completion ----------
  function buildPsychPrompt(targets, ctx) {
    var sys = [
      'TRPG セッションの NPC 心理プロファイルを、既存の情報に整合する形で補完してください。',
      '',
      '【最重要 — 設計思想 (CLAUDE_RULES §3.1)】',
      '・プレイヤーが書いた name/desc は「種」。その意図・含意を絶対に保つ',
      '・補完する各フィールドは、種から自然に想像でき、世界観に響き合う内容にする',
      '・矛盾しない自然な人物像を立ち上げる。既存 NPC 同士の関係性が暗示されていれば尊重',
      '',
      '【各フィールドの定義 — 厳守】',
      '・personality (50字程度): 3〜4つの性格特性。読点区切りで簡潔に',
      '・coreDesire (30〜80字): その人物が根本で欲している/求めているもの',
      '・coreFear   (30〜80字): その人物が根本で恐れているもの',
      '・wound      (30〜80字): その人物の過去の傷・経験',
      '',
      '【ルール】',
      '・指定された missing フィールドのみ出力する。既に値があるフィールドは含めない',
      '・配列の i (NPC index) を保つ',
      '・出力は JSON のみ。前後に説明文・コードフェンス不要',
      '・JSON 値の中で素の " は使わない。「」を使う'
    ].join('\n');

    var ctxLines = [];
    if (ctx.scene && (ctx.scene.lore || ctx.scene.loc || ctx.scene.obj || ctx.scene.tone)) {
      ctxLines.push('世界観: ' + (ctx.scene.lore || '(未設定)'));
      ctxLines.push('場所: '   + (ctx.scene.loc  || '(未設定)'));
      ctxLines.push('目的: '   + (ctx.scene.obj  || '(未設定)'));
      ctxLines.push('トーン: ' + (ctx.scene.tone || '(未設定)'));
    }
    if (ctx.hero && (ctx.hero.name || ctx.hero.desc)) {
      ctxLines.push('主人公: ' + (ctx.hero.name || '(無名)') + ' — ' + (ctx.hero.desc || '(描写なし)'));
    }

    var targetsForLlm = targets.map(function(t){
      return { i: t.i, name: t.name || '(無名)', desc: t.desc || '(描写なし)', missing: t.missing };
    });

    var user = [
      '【既存の文脈】',
      ctxLines.length ? ctxLines.join('\n') : '(文脈情報なし — NPC 情報のみから推測してよい)',
      '',
      '【対象 NPC と補完してほしいフィールド】',
      JSON.stringify(targetsForLlm),
      '',
      '【出力 JSON 形式の例】',
      '{"npcs":[{"i":0,"personality":"...","wound":"..."},{"i":2,"coreDesire":"..."}]}',
      '',
      '※ 各 NPC の missing にあるフィールドのみ出力。既に値があるフィールドは含めない。'
    ].join('\n');

    return { sys: sys, user: user };
  }

  // ---------- LLM call ----------
  function callLlm(sys, user) {
    return new Promise(function(resolve){
      try {
        if (typeof Api !== 'object' || !Api || typeof Api.call !== 'function') {
          return resolve(null);
        }
        Api.call(sys, user, 1500).then(function(r){
          resolve(r && r.text ? r.text : null);
        }).catch(function(){ resolve(null); });
      } catch(e) { resolve(null); }
    });
  }

  // ---------- Parse LLM response ----------
  function parsePsychResponse(text) {
    if (!text) return null;
    var parser = (window.__v284 && window.__v284.safeParseJson) ? window.__v284.safeParseJson : null;
    if (parser) {
      try { var p = parser(text); if (p) return p; } catch(e){}
    }
    // Fallback: strip code fences and try JSON.parse
    try {
      var t = String(text).trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '');
      var firstBrace = t.indexOf('{');
      var lastBrace = t.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        t = t.slice(firstBrace, lastBrace + 1);
      }
      return JSON.parse(t);
    } catch(e) { return null; }
  }

  // ---------- Apply psych result ----------
  // Write to DOM ONLY if the target field is still blank (defense against race).
  function applyPsychResult(parsed) {
    if (!parsed || !parsed.npcs || !Array.isArray(parsed.npcs)) return 0;
    var cards = document.querySelectorAll('#npcList .npc-card');
    var applied = 0;
    parsed.npcs.forEach(function(entry){
      if (!entry || typeof entry.i !== 'number') return;
      var card = cards[entry.i];
      if (!card) return;
      NPC_PSYCH_FIELDS.forEach(function(f){
        var v = entry[f];
        if (!v || typeof v !== 'string') return;
        v = v.trim();
        if (!v) return;
        var el = card.querySelector('[data-f="' + f + '"]');
        if (!el) return;
        if (trimmed(val(el))) return; // user (or earlier fill) put something there; do not overwrite
        el.value = v;
        try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch(e){}
        applied++;
      });
    });
    return applied;
  }

  // ---------- Status helper ----------
  function showStatus(msg) {
    try {
      if (typeof UI !== 'undefined' && UI && typeof UI.setStatus === 'function') UI.setStatus(msg);
    } catch(e){}
  }

  // ---------- Main: post-chain handling ----------
  function postChain(snap) {
    // 1. Restore user-entered values that the chain may have wiped (panel re-render etc).
    var restored = restoreNonBlank(snap);
    if (restored.length) {
      console.log(TAG, 'restored user input:', restored.length, 'fields ->', restored.join(', '));
    } else {
      console.log(TAG, 'no fields needed restoration');
    }

    // 2. Run LLM psych completion for any NPC with seed but blank psych fields.
    var targets = listNpcPsychTargets();
    if (targets.length === 0) {
      console.log(TAG, 'no NPC psych targets — done');
      return;
    }
    console.log(TAG, 'psych targets:', targets.length, targets.map(function(t){ return '#' + t.i + '(' + t.missing.length + ')'; }).join(','));

    var ctx = {
      scene: {
        lore: trimmed(val($('cfgLore'))),
        loc:  trimmed(val($('cfgLoc'))),
        obj:  trimmed(val($('cfgObj'))),
        tone: trimmed(val($('cfgTone')))
      },
      hero: {
        name: trimmed(val($('cfgHName'))),
        desc: trimmed(val($('cfgHDesc')))
      }
    };

    var pr = buildPsychPrompt(targets, ctx);
    showStatus('🌱 NPC の心の輪郭を編んでいます…');
    callLlm(pr.sys, pr.user).then(function(text){
      if (!text) {
        console.warn(TAG, 'psych LLM returned empty');
        showStatus('🌱 補完なし (LLM 応答なし)');
        return;
      }
      var parsed = parsePsychResponse(text);
      if (!parsed) {
        console.warn(TAG, 'psych parse failed:', String(text).slice(0, 200));
        showStatus('🌱 補完なし (解析失敗)');
        return;
      }
      var applied = applyPsychResult(parsed);
      console.log(TAG, 'psych applied:', applied, 'fields');
      showStatus('🌱 NPC の心の輪郭を ' + applied + ' 件添えました');
    });
  }

  // ---------- Wrap UI.randomFill ----------
  function tryWrap() {
    if (typeof UI !== 'object' || !UI) return false;
    if (typeof UI.randomFill !== 'function') return false;
    if (UI.__v291Wrapped) return true;

    var inner = UI.randomFill.bind(UI);
    UI.randomFill = function() {
      var snap = snapshotDom();
      var snapCount = 0;
      SCENE_IDS.forEach(function(id){ if (trimmed(snap.scene[id])) snapCount++; });
      HERO_IDS.forEach(function(id){  if (trimmed(snap.hero[id]))  snapCount++; });
      snap.npcs.forEach(function(npc){
        NPC_FIELDS.forEach(function(f){ if (trimmed(npc[f])) snapCount++; });
      });
      console.log(TAG, 'snapshot: ' + snapCount + ' non-blank fields preserved');

      var r;
      try { r = inner.apply(this, arguments); } catch(e){
        console.warn(TAG, 'inner randomFill error:', e && e.message);
      }

      // Schedule post-chain handling.
      // The inner chain includes v286 which does setTimeout(runEnhance, 1500) + LLM (~3-10s),
      // so we wait long enough for v286 to settle. 4000ms is a balance.
      // If v286's LLM takes longer, our restore still works (it just runs first),
      // then v286 may write to fields that were snapshot-blank (those are not protected),
      // which is the intended behavior.
      setTimeout(function(){ postChain(snap); }, 4000);

      return r;
    };
    try { UI.randomFill.__v291Wrapped = true; } catch(e){}
    UI.__v291Wrapped = true;
    console.log(TAG, 'UI.randomFill wrapped (llm-aware preservation + psych completion)');
    return true;
  }

  function init() {
    if (tryWrap()) return;
    // Retry: if a later module re-wraps UI.randomFill, the function-level
    // __v291Wrapped flag disappears, and we wrap again on top.
    var attempts = 0;
    var id = setInterval(function(){
      try {
        if (typeof UI === 'object' && UI && typeof UI.randomFill === 'function') {
          if (!UI.randomFill.__v291Wrapped) {
            UI.__v291Wrapped = false;  // allow tryWrap to proceed
            tryWrap();
          }
        }
      } catch(e){}
      if (++attempts > 30) clearInterval(id);
    }, 300);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  setTimeout(init, 500);
  setTimeout(init, 1500);
  setTimeout(init, 3500);
  setTimeout(init, 7000);

  // ---------- Public surface ----------
  window.__v291 = {
    version: 'v291-llm-aware-1',
    snapshotDom: snapshotDom,
    restoreNonBlank: restoreNonBlank,
    listNpcPsychTargets: listNpcPsychTargets,
    buildPsychPrompt: buildPsychPrompt,
    parsePsychResponse: parsePsychResponse,
    applyPsychResult: applyPsychResult,
    postChain: postChain
  };
  console.log(TAG, 'v291 init: llm-aware-randomfill (preserve user input + psych seed-expand)');
})();
