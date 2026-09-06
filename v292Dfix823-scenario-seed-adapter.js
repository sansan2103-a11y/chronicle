// =====================================================================
// Chronicle TRPG - v292Dfix823: SEED_EXPANSION_V1 — Scenario Seed Adapter（home 専用・dormant）
// ---------------------------------------------------------------------
// GPT 裁定 2026-09-06 (25) SEED_EXPANSION_V1 = GO_STAGE_WITH_REVISIONS:
//   ARCHITECTURE = fix823 Scenario Seed Adapter = existing fix436 + fix335 reuse = NEW ENGINE 0
//   FIX823_STAGE_IMPLEMENTATION = GO / SEED_EXPANSION_PRODUCTION_DEPLOY = HOLD
//
// ■ これは何か
//   Scenario Original（fix820 の入力オブジェクト）の **空欄だけ**を、fix436 の公開 pure 関数
//   （buildFillPrompt / parseFillJson / normVal / applyFill / request）で埋める薄いアダプタ。
//   生成 engine は作らない。random は fix335 の pure API（__v292Dfix335api.draw）だけ。
//
// ■ 契約（1 つでも破ったら実装ミス）
//   AUTHORITY: non-empty input = LOCKED（USER/SCENARIO explicit の merge は UI lane。ここでは非空 = 不可侵）
//   MODES（caller が必ず明示。fix823 は意図を推測しない）:
//     EXPAND_EXISTING … 空欄補完のみ。NPC 人数の増減 0（0 人は 0 のまま）
//     OMAKASE_CREATE  … Owner が「全部おまかせ」を明示。NPC 0 人なら既定 2 人を新規生成してよい
//   RANDOM_SEED_HINT … OMAKASE_CREATE かつ explicit seed 0 のときだけ。確定情報 block とは別節で
//                      「参考にしてもしなくてもよい多様性の種」として渡す。field authority ではない（AI_INFERRED）
//   RANDOM direct fallback（fix335 → field）… OMAKASE_CREATE かつ seed 0 かつ AI 失敗/利用不可 のときだけ。
//                      report.generationMode = 'RANDOM_FALLBACK'。部分入力ありの AI 失敗は WRITE 0
//   startRules   … AI write 0 / random write 0。確定 context として渡すだけ（paraphrase・転記 0）
//   startCondition … 空欄なら AI fill 可・非空なら LOCK。random では作らない
//   SILENT TRUNCATION = FORBIDDEN … raw JSON を parseFillJson/normVal の **前**に preflight。
//                      normVal が長さで切る値が 1 つでもあれば candidate 全体 reject（write 0）
//   TRANSPORT = fix247 proxy only（BYOK / S.cfg 移植 0）。
//     FIX823_TRANSPORT_AVAILABILITY = ACTUAL_PROXY_RUNTIME_ONLY（裁定 27）:
//       「実際の fix247 runtime が loaded かつ active」と runtime authority（fix247 が公開する on()/state）で
//       確認できるときだけ true。fix823 自身が Google token / expiry / proxy pass から判定を再計算しない。
//       現行 fix247 は `window.__v292Dfix247 = true`（boolean）しか公開しないので、home（fix247 不在）でも
//       index（fix247 在るが API 無し）でも **false** = fail-closed。home transport bridge（別 lane）が
//       on() を公開したとき初めて true になる。
//     proxy 不可: EXPAND_EXISTING → AI_UNAVAILABLE/write 0、OMAKASE_CREATE ∧ seed 0 → RANDOM_FALLBACK 可
//   NPC SLOT（裁定 26）… EXISTING_NPC_SLOT_DELETION_BY_EXPANSION = FORBIDDEN。EXPAND_EXISTING は base の NPC slot 数と
//                      identity を完全維持（name が最後まで空でも slot も explicit field も消さない。無効 name は name だけ不採用）。
//                      OMAKASE_CREATE の synthetic 2 slot は name が揃わなければ GENERATION_INCOMPLETE（partial save 0）→
//                      seed 0 なら RANDOM_FALLBACK、それでも揃わなければ write 0。
//   ATOMICITY … candidate は detached（入力オブジェクト mutation 0）→ fix820.validate → fix820.edit（whole-value）。
//                      field-by-field write 0。失敗時 meta/body byte 不変
//   Story / active slot / cloud / canonical への書込 0。DOM 0。
//
// 検証口: window.__v292Dfix823 = { MODES, toFields, explicitSeedCount, buildPrompt, preflightRaw,
//                                   toScenarioInput, randomCandidate, transportAvailable, expand, expandAndSave, state }
// 既定: 誰も呼ばない（UI caller 0）。kill: localStorage v292Dfix823Off='1' → expand/expandAndSave が即 {ok:false, code:'OFF'}。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix823) return;
  var TAG = '[v292Dfix823:scenario-seed-adapter]';
  var VERSION = 'v292Dfix823-20260906-adapter-v1.2';   /* v1.1: 裁定 26 slot 維持 / v1.2: 裁定 27 FIX823_TRANSPORT_AVAILABILITY = ACTUAL_PROXY_RUNTIME_ONLY */
  var MODES = { EXPAND_EXISTING: 'EXPAND_EXISTING', OMAKASE_CREATE: 'OMAKASE_CREATE' };
  var OMAKASE_DEFAULT_NPC = 2;          /* fix436 NEW_NPC_COUNT と同じ既定（OMAKASE_CREATE 専用） */
  var SCENE_FIELDS = ['lore', 'loc', 'obj', 'tone'];
  var HERO_FIELDS  = ['name', 'desc'];
  var NPC_FIELDS   = ['name', 'desc', 'personality', 'coreDesire', 'coreFear', 'wound'];
  var SCALAR_MAP = [ /* fix436 SCALAR_DEFS と同じ key / label */
    { key: 'heroName', label: '主人公の名前',                  get: function(s){ return s.cast.hero.name; } },
    { key: 'heroDesc', label: '主人公の説明（性格・外見・立場）', get: function(s){ return s.cast.hero.desc; } },
    { key: 'lore',     label: '世界観メモ',                    get: function(s){ return s.scene.lore; } },
    { key: 'loc',      label: '現在の場所',                    get: function(s){ return s.scene.loc; } },
    { key: 'obj',      label: '物語の前提・目的',              get: function(s){ return s.scene.obj; } },
    { key: 'tone',     label: '文体・雰囲気',                  get: function(s){ return s.scene.tone; } }
  ];
  var NPC_LABEL = { name: '名前', desc: '外見・立場', personality: '性格特性', coreDesire: '核心的欲求', coreFear: '核心的恐怖', wound: '傷・過去' };

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix823Off') === '1'; }
  function str(v){ return (v == null) ? '' : String(v); }
  function trim(v){ return str(v).replace(/^\s+|\s+$/g, ''); }
  function isObj(o){ return !!o && typeof o === 'object' && Object.prototype.toString.call(o) !== '[object Array]'; }
  function isArr(o){ return Object.prototype.toString.call(o) === '[object Array]'; }
  function clone(o){ return JSON.parse(JSON.stringify(o)); }
  function f436(){ return window.__v292Dfix436 || null; }
  function f335(){ return window.__v292Dfix335api || null; }
  function f820(){ return window.__v292Dfix820 || null; }
  function fail(code, detail){ var r = { ok: false, code: code }; if (detail !== undefined) r.detail = detail; return r; }

  /* ---- 入力の正規化（読むだけ・新オブジェクト） ---- */
  function normalizeInput(input){
    var s = isObj(input) ? input : {};
    var scene = isObj(s.scene) ? s.scene : {};
    var cast = isObj(s.cast) ? s.cast : {};
    var hero = isObj(cast.hero) ? cast.hero : {};
    var npcs = isArr(cast.npcs) ? cast.npcs : [];
    var out = { title: trim(s.title), scene: {}, cast: { hero: {}, npcs: [] },
                startCondition: trim(s.startCondition), startRules: str(s.startRules).replace(/\r\n?/g, '\n').replace(/^\s+|\s+$/g, '') };
    var i, j;
    for (i = 0; i < SCENE_FIELDS.length; i++) out.scene[SCENE_FIELDS[i]] = trim(scene[SCENE_FIELDS[i]]);
    for (i = 0; i < HERO_FIELDS.length; i++) out.cast.hero[HERO_FIELDS[i]] = trim(hero[HERO_FIELDS[i]]);
    for (i = 0; i < npcs.length; i++){
      var src = isObj(npcs[i]) ? npcs[i] : {}, o = {};
      for (j = 0; j < NPC_FIELDS.length; j++) o[NPC_FIELDS[j]] = trim(src[NPC_FIELDS[j]]);
      out.cast.npcs.push(o);
    }
    return out;
  }

  /* ---- ① toFields: Scenario → fix436 の fields[]（el:null・pure） ---- */
  function toFields(input, mode){
    var s = normalizeInput(input);
    var fields = [], i, j;
    for (i = 0; i < SCALAR_MAP.length; i++){
      var d = SCALAR_MAP[i], v = d.get(s);
      fields.push({ key: d.key, label: d.label, value: v, filled: v.length > 0, writable: true, el: null });
    }
    var npcCount = s.cast.npcs.length;
    if (mode === MODES.OMAKASE_CREATE && npcCount === 0) npcCount = OMAKASE_DEFAULT_NPC;   /* ★ OMAKASE_CREATE だけ */
    for (i = 0; i < npcCount; i++){
      var src = s.cast.npcs[i] || {};
      for (j = 0; j < NPC_FIELDS.length; j++){
        var f = NPC_FIELDS[j], nv = trim(src[f]);
        fields.push({ key: 'npc' + (i + 1) + '_' + f, label: 'NPC' + (i + 1) + 'の' + NPC_LABEL[f], value: nv, filled: nv.length > 0, writable: true, el: null });
      }
    }
    /* startCondition: 空欄なら AI fill 可 */
    fields.push({ key: 'startCondition', label: '開始時の状況（物語の最初の場面・配置・直前の出来事。1〜3文）', value: s.startCondition, filled: s.startCondition.length > 0, writable: true, el: null });
    /* startRules: 確定 context のみ（writable:false = fix436 applyFill が構造的に書かない） */
    fields.push({ key: 'startRules', label: '開始ルール（作者が定めた約束。矛盾しない補完をする。書き換え・転記はしない）', value: s.startRules, filled: s.startRules.length > 0, writable: false, el: null });
    return fields;
  }
  function explicitSeedCount(fields){
    var n = 0;
    for (var i = 0; i < fields.length; i++){ if (fields[i] && fields[i].filled && trim(fields[i].value)) n++; }
    return n;
  }

  /* ---- ② prompt: fix436.buildFillPrompt ＋（条件付き）seed hint を別節で ---- */
  function seedHintText(pack){
    if (!pack || !isObj(pack)) return '';
    var lines = [], keys = ['setting', 'era_tech', 'stance', 'lack_desire', 'relationship', 'opening_pressure', 'secret', 'world_rule', 'mood_tone'];
    for (var i = 0; i < keys.length; i++){ var a = pack[keys[i]]; if (a && a.text) lines.push('- ' + trim(a.text)); }
    if (!lines.length) return '';
    return '\n\n## 参考の種（多様性のためのヒント。確定情報ではない。従っても従わなくてもよい。矛盾すれば無視する）\n' + lines.join('\n');
  }
  function buildPrompt(fields, mode, pack){
    var F = f436(); if (!F || typeof F.buildFillPrompt !== 'function') return fail('FIX436_UNAVAILABLE');
    var p = F.buildFillPrompt(fields);
    if (!p) return { ok: true, prompt: null, blanks: 0 };
    var seeds = explicitSeedCount(fields);
    var hinted = false;
    if (mode === MODES.OMAKASE_CREATE && seeds === 0 && pack){
      var h = seedHintText(pack);
      if (h){ p = { sys: p.sys, user: p.user + h, blankKeys: p.blankKeys, knownKeys: p.knownKeys }; hinted = true; }
    }
    return { ok: true, prompt: p, blanks: p.blankKeys.length, seeds: seeds, hinted: hinted };
  }

  /* ---- ③ preflight: parseFillJson / normVal より前に raw を検査（SILENT TRUNCATION = FORBIDDEN） ---- */
  function extractRawObject(text){
    if (typeof text !== 'string' || !text) return null;
    var s = text.replace(/```[a-zA-Z]*/g, ' ').replace(/```/g, ' ');
    var a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try { var o = JSON.parse(s.slice(a, b + 1)); return isObj(o) ? o : null; } catch(e){ return null; }
  }
  function strippedLen(v){
    /* fix436.normVal と同じ前処理（trim → 端の引用符除去 → trim）の後の JS .length */
    var s = trim(str(v)).replace(/^["'「『]+|["'」』]+$/g, ''); s = trim(s); return s.length;
  }
  function preflightRaw(text){
    var F = f436(); if (!F || typeof F.normVal !== 'function') return fail('FIX436_UNAVAILABLE');
    var o = extractRawObject(text);
    if (!o) return fail('BAD_JSON');
    var oversized = [], walk = function(obj, prefix){
      for (var k in obj){
        if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
        var v = obj[k];
        if (isObj(v)){ walk(v, prefix + k + '_'); continue; }
        if (typeof v !== 'string' && typeof v !== 'number') continue;
        var n = F.normVal(v);                       /* 実物の normVal に通す */
        if (n && n.length < strippedLen(v)) oversized.push(prefix + k);   /* 長さ理由で短くなった = silent truncation */
      }
    };
    walk(o, '');
    if (oversized.length) return fail('AI_VALUE_OVERSIZED', oversized);
    return { ok: true };
  }

  /* ---- ④ fields → Scenario input（新オブジェクト。base は不変） ---- */
  function toScenarioInput(fields, base){
    var s = normalizeInput(base);
    var byKey = {}, i;
    for (i = 0; i < fields.length; i++){ if (fields[i] && fields[i].key) byKey[fields[i].key] = fields[i]; }
    var val = function(k){ var f = byKey[k]; return f ? trim(f.value) : ''; };
    var out = { title: s.title, scene: {}, cast: { hero: {}, npcs: [] }, startCondition: '', startRules: s.startRules /* 原文そのまま */ };
    var sc = { lore: val('lore'), loc: val('loc'), obj: val('obj'), tone: val('tone') };
    for (var k in sc){ if (sc[k]) out.scene[k] = sc[k]; }
    var hn = val('heroName'), hd = val('heroDesc');
    if (hn) out.cast.hero.name = hn; if (hd) out.cast.hero.desc = hd;
    /* NPC（裁定 26）: fields の npcN_* を N 順に **slot をそのまま**再構成する。name が無くても slot は消さない
       （EXISTING_NPC_SLOT_DELETION_BY_EXPANSION = FORBIDDEN）。name の無い slot は namelessSlots として報告するだけ。
       slot 数は toFields が決めた数（EXPAND_EXISTING = base の npcs 数 / OMAKASE_CREATE = base 0 なら 2） */
    var slots = {}, nameless = [];
    for (i = 0; i < fields.length; i++){
      var m = /^npc(\d+)_(\w+)$/.exec(fields[i] && fields[i].key || '');
      if (!m) continue;
      var n = +m[1]; slots[n] = slots[n] || {}; var v = trim(fields[i].value); if (v) slots[n][m[2]] = v;
    }
    var ns = Object.keys(slots).map(Number).sort(function(a, b){ return a - b; });
    for (i = 0; i < ns.length; i++){
      var o = slots[ns[i]];
      if (!o.name) nameless.push(ns[i]);
      out.cast.npcs.push(o);
    }
    var scd = val('startCondition'); if (scd) out.startCondition = scd;
    return { input: out, namelessSlots: nameless };
  }

  /* ---- transport / random ---- */
  function transportAvailable(){
    /* ACTUAL_PROXY_RUNTIME_ONLY: 実 fix247 runtime の authority だけを見る。LS（v292ProxyUrl/Pass/GoogleToken）や
       __chronicleGoogleId を fix823 が読んで「fix247 なら ON だろう」と再計算することは **しない**。
       fix247 が on()（or state().on）を公開していなければ fail-closed で false。 */
    try {
      var p = window.__v292Dfix247;
      if (!p || typeof p !== 'object') return false;              /* 不在 or 現行の boolean marker → false */
      if (typeof p.on === 'function') return p.on() === true;
      if (typeof p.state === 'function'){ var st = p.state(); return !!(st && st.on === true); }
      return false;
    } catch(e){ return false; }
  }
  function randomCandidate(base, cb){
    /* OMAKASE_CREATE + seed 0 専用。fix335 の pack を field へ（startCondition / startRules は作らない） */
    var A = f335(); if (!A || typeof A.draw !== 'function') return cb(fail('FIX335_UNAVAILABLE'));
    var s = normalizeInput(base);
    A.draw(function(p1, f1){
      if (!f1 || !f1.npc || !f1.npc.name || !f1.hero || !f1.hero.name) return cb(fail('FIX335_DRAW_FAILED'));
      var npcs = [f1.npc], taken = {}; taken[f1.npc.name] = 1; taken[f1.hero.name] = 1;
      var tries = 0;
      (function more(){
        if (npcs.length >= OMAKASE_DEFAULT_NPC){
          var out = { title: s.title, scene: { lore: f1.lore, loc: f1.loc, obj: f1.obj, tone: f1.tone },
                      cast: { hero: { name: f1.hero.name, desc: f1.hero.desc }, npcs: npcs },
                      startCondition: '', startRules: s.startRules };
          return cb({ ok: true, input: out, generationMode: 'RANDOM_FALLBACK' });
        }
        if (tries++ >= 4) return cb(fail('RANDOM_INCOMPLETE'));      /* 2 人揃わなければ write 0（黙って 1 人にしない） */
        A.draw(function(p2, f2){
          if (f2 && f2.npc && f2.npc.name && !taken[f2.npc.name]){ taken[f2.npc.name] = 1; npcs.push(f2.npc); }
          more();
        });
      })();
    });
  }

  /* ---- ⑤ expand（保存しない。candidate を返す） ---- */
  function expand(input, opts, cb){
    if (typeof opts === 'function'){ cb = opts; opts = {}; }
    opts = opts || {}; cb = cb || function(){};
    if (off()) return cb(fail('OFF'));
    var mode = opts.mode;
    if (mode !== MODES.EXPAND_EXISTING && mode !== MODES.OMAKASE_CREATE) return cb(fail('MODE_REQUIRED'));
    var F = f436(); if (!F || typeof F.request !== 'function') return cb(fail('FIX436_UNAVAILABLE'));
    var base = clone(isObj(input) ? input : {});
    var baseStr = JSON.stringify(input);
    var fields = toFields(base, mode);
    var seeds = explicitSeedCount(fields);
    var baseNpcCount = normalizeInput(base).cast.npcs.length;
    var report = { mode: mode, explicitSeeds: seeds, calls: 0, generationMode: null, hinted: false, applied: [], protected_: [], unknown: [], rejected: [], namelessSlots: [] };
    var omakaseZero = (mode === MODES.OMAKASE_CREATE && seeds === 0);

    function finishRandom(code){
      if (!omakaseZero) return cb(fail(code, report));               /* 部分入力あり → WRITE 0 */
      randomCandidate(base, function(r){
        if (!r.ok){ report.randomFailure = r.code; return cb(fail(code, report)); }   /* random も揃わなければ write 0（理由を report に残す） */
        report.generationMode = 'RANDOM_FALLBACK'; report.fallbackReason = code;
        return cb({ ok: true, candidate: r.input, report: report });
      });
    }
    function proceed(pack){
      var bp = buildPrompt(fields, mode, pack);
      if (!bp.ok) return cb(bp);
      if (!bp.prompt){ report.generationMode = 'NONE'; return cb({ ok: true, candidate: null, report: report, noBlanks: true }); }
      report.hinted = bp.hinted;
      if (!transportAvailable()) return finishRandom('AI_UNAVAILABLE');
      report.calls = 1;
      F.request(bp.prompt, function(err, txt){
        if (err) return finishRandom('AI_FAILED');
        var pf = preflightRaw(txt);
        if (!pf.ok) return cb(fail(pf.code, pf.detail));          /* oversized / bad json → write 0（random にも落とさない） */
        var json = F.parseFillJson(txt);
        if (!json) return cb(fail('BAD_JSON'));
        var rep; try { rep = F.applyFill(fields, json); } catch(e){ return cb(fail('APPLY_ERROR')); }
        report.applied = rep.applied; report.protected_ = rep.protected_; report.unknown = rep.unknown; report.rejected = rep.rejected;
        if (!rep.applied.length) return cb(fail('NOTHING_APPLIED', report));
        var t = toScenarioInput(fields, base);
        report.namelessSlots = t.namelessSlots; report.generationMode = 'AI_INFERRED';
        if (JSON.stringify(input) !== baseStr) return cb(fail('BASE_MUTATED'));   /* 入力を汚していないことの自己検査 */
        /* 裁定 26: EXPAND_EXISTING は base の NPC 数を厳密に維持（hard invariant・崩れたら fail-closed） */
        if (mode === MODES.EXPAND_EXISTING && t.input.cast.npcs.length !== baseNpcCount) return cb(fail('NPC_COUNT_INVARIANT_VIOLATED', { base: baseNpcCount, got: t.input.cast.npcs.length }));
        /* 裁定 26: OMAKASE_CREATE の synthetic slot（base 0 → 2）は name が揃わなければ incomplete（partial save 0）
           → seed 0 なら RANDOM_FALLBACK、それ以外は write 0 */
        if (mode === MODES.OMAKASE_CREATE && baseNpcCount === 0 && t.namelessSlots.length) return finishRandom('GENERATION_INCOMPLETE');
        return cb({ ok: true, candidate: t.input, report: report });
      });
    }
    if (omakaseZero && f335() && typeof f335().draw === 'function'){
      try { f335().draw(function(pack){ proceed(pack || null); }); } catch(e){ proceed(null); }
    } else proceed(null);
  }

  /* ---- ⑥ expandAndSave: fix820 read → expand → validate → edit（whole-value） ---- */
  function expandAndSave(scenarioId, opts, cb){
    if (typeof opts === 'function'){ cb = opts; opts = {}; }
    opts = opts || {}; cb = cb || function(){};
    if (off()) return cb(fail('OFF'));
    var ST = f820(); if (!ST || typeof ST.read !== 'function') return cb(fail('FIX820_UNAVAILABLE'));
    var r = ST.read(scenarioId); if (!r.ok) return cb(r);
    var sc = r.scenario;
    var input = { title: sc.title, scene: sc.scene, cast: sc.cast, startCondition: sc.startCondition, startRules: sc.startRules };
    expand(input, opts, function(res){
      if (!res.ok) return cb(res);
      if (res.noBlanks) return cb({ ok: true, saved: false, noBlanks: true, report: res.report });
      var v = ST.validate(res.candidate);
      if (!v.ok) return cb(fail('VALIDATE_FAILED', v));
      var e = ST.edit(scenarioId, res.candidate);
      if (!e.ok) return cb(e);
      return cb({ ok: true, saved: true, scenarioId: scenarioId, report: res.report });
    });
  }

  window.__v292Dfix823 = {
    version: VERSION, MODES: MODES, OMAKASE_DEFAULT_NPC: OMAKASE_DEFAULT_NPC,
    toFields: toFields, explicitSeedCount: explicitSeedCount, buildPrompt: buildPrompt, seedHintText: seedHintText,
    preflightRaw: preflightRaw, toScenarioInput: toScenarioInput, randomCandidate: randomCandidate,
    transportAvailable: transportAvailable, expand: expand, expandAndSave: expandAndSave,
    state: function(){ return { off: off(), fix436: !!f436(), fix436Request: !!(f436() && f436().request), fix335: !!f335(), fix820: !!f820(), transport: transportAvailable(), uiWired: false }; }
  };
  try { console.log(TAG, 'loaded (adapter only; not wired to any UI)'); } catch(e){}
})();
