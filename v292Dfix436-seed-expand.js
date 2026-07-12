// =====================================================================
// Chronicle TRPG - v292Dfix436: 「種を広げる」= 🎲ランダム生成の部分補完
// ---------------------------------------------------------------------
// おしん要望(2026-07-12):
//   「ランダム入力の際にユーザーがすでに入力してる箇所をモデルが汲み取って
//     矛盾しないように空いてる箇所を埋めるようにできないかな？
//     ユーザーの入力した種を広げるとはこういう意味なんよ」
//
// 現状の真因(実コード読解で確定・推測なし):
//   🎲ボタン = index.html:368 onclick="UI.randomFill()"
//   → 最終的に features.js の v292Dfix117 (aiGenerate) が本体。
//   fix117 は既に「空欄のみ書く」設計だが、種が広がらない構造欠陥が2つある:
//
//   [欠陥A] モデルに渡す「確定情報」がスカラー6欄だけ。
//           filled = cfgHName/cfgHDesc/cfgLore/cfgLoc/cfgObj/cfgTone のみ。
//           ユーザーがNPCカードに書いた name/desc/personality/... は
//           **1文字もモデルに渡らない**。だから NPC の種は広がりようがない。
//
//   [欠陥B] 部分入力されたNPCカードは埋める対象から外れる。
//           applyScenario() の emptyCardList() は「name欄が空のカード」だけを
//           対象にする。→ 名前だけ書いたNPCの desc/personality/coreDesire/
//           coreFear/wound は **永久に埋まらない**。さらに fix202 の capN は
//           「空名カード数」なので、名前入りカードしか無いと capN=0 →
//           プロンプトは "npcsは必ず空配列[]" を強制 → モデルは何も返さない。
//           = おしんの「キャラ設定の一部入れてれば他の設定も埋めたり」が不能。
//
// fix436 の設計:
//   ① collectFields()   : DOM(設定パネル)から全項目を {key,label,value,filled,writable}
//                         で収集。NPCは1枚ずつ npc1_name … npc2_wound の平坦キー。
//                         性別ラジオ(v108g_hero / v108g_npc<idx>)は writable:false の
//                         「読み取り専用の確定情報」として同梱(モデルが性別に矛盾しない為)。
//   ② buildFillPrompt() : 埋まっている欄を【確定情報＝種】として全文渡し、
//                         **空欄のキーだけ**を列挙して「これだけを返せ」と指示。
//                         全欄埋まっていれば null（=生成しない）。
//   ③ applyFill()       : filled===true / writable===false の欄には **絶対に書かない**。
//                         書き込み直前にDOM実値も再確認する二重防御。未知キーは無視。
//                         *_name の重複は却下。JSON不正なら何も書かない。
//   ④ 失敗時            : 種がある → 何も書かない(定型文で種を汚さない)。
//                         種が皆無 → 従来の固定ランダムへ退避(空フォームで詰まない)。
//
// 発火点: UI.randomFill を最外周でラップ。成功時は旧経路(fix117/GR/seedAware)を
//         呼ばない = 「全上書き生成」を置き換える。OFF/鍵なし/失敗時のみ旧経路。
//   ⚠ seedAware/genderRadio/fix11 は whenReady(DOMContentLoaded)で後から
//     UI.randomFill を wrap する。素直に load 時 arm すると内側に入ってしまい、
//     genderRadio の固定プール(「性別: 女性。18歳の見習い記録官…」)が先に空欄を
//     潰してしまう。→ keeper で最外周を奪還する(fix417b/419c の三点セット流)。
//   ⚠ fix419c教訓: ラップ時は内側関数の own props を全継承する。
//   ⚠ fix418(genkeep) 連携: 成功時は旧 randomFill を呼ばないので
//     window.__f418genAt を自分で立てる(復元TTLの契約を守る)。
//
// API: fix117と同一経路(XHR → openrouter.ai/api/v1/chat/completions)。
//      fix247 が URL/ヘッダをプロキシへ書き換える。新経路は作らない。
// 冪等: window.__v292Dfix436 (検証口オブジェクトを兼ねる)
// OFF : localStorage v292Dfix436Off='1' → 従来の全上書き生成に戻る
// ロールバック: scriptタグ削除 or OFFスイッチ
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix436) return;

  var TAG = '[v292Dfix436:seedExpand]';
  var NEW_NPC_COUNT = 2;     // カード0枚のときに新規作成する枚数
  var MAX_VAL_LEN   = 400;   // モデル返答1値の上限(暴走ガード)
  var TIMEOUT_MS    = 60000;

  // ── 書き込み可能な欄(実DOM由来。推測項目は作らない) ──
  var SCALAR_DEFS = [
    { key: 'heroName', id: 'cfgHName', label: '主人公の名前' },
    { key: 'heroDesc', id: 'cfgHDesc', label: '主人公の説明（性格・外見・立場）' },
    { key: 'lore',     id: 'cfgLore',  label: '世界観メモ' },
    { key: 'loc',      id: 'cfgLoc',   label: '現在の場所' },
    { key: 'obj',      id: 'cfgObj',   label: '物語の前提・目的' },
    { key: 'tone',     id: 'cfgTone',  label: '文体・雰囲気' }
  ];
  var NPC_DEFS = [
    { f: 'name',        label: '名前' },
    { f: 'desc',        label: '外見・立場' },
    { f: 'personality', label: '性格特性' },
    { f: 'coreDesire',  label: '核心的欲求' },
    { f: 'coreFear',    label: '核心的恐怖' },
    { f: 'wound',       label: '傷・過去' }
  ];
  // モデルがネスト/別名で返したときの吸収表
  var ALIASES = {
    'hero_name': 'heroName', 'hero_desc': 'heroDesc',
    'scene_lore': 'lore', 'scene_loc': 'loc', 'scene_obj': 'obj', 'scene_tone': 'tone',
    'world': 'lore', 'world_lore': 'lore', 'setting': 'lore',
    'scene': 'loc', 'opening': 'loc', 'objective': 'obj'
  };
  var NAME_RE = /(^heroName$|_name$)/;

  function off(){ try { return localStorage.getItem('v292Dfix436Off') === '1'; } catch(e){ return false; } }
  function getUI(){ try { if (typeof UI !== 'undefined' && UI) return UI; } catch(e){} return window.UI || null; }
  function getS(){ try { if (typeof S !== 'undefined' && S) return S; } catch(e){} return window.S || null; }
  function setStatus(m, err){ try { var U = getUI(); if (U && U.setStatus) U.setStatus(m, err); } catch(e){} }
  function trim(v){ return String(v == null ? '' : v).replace(/^\s+|\s+$/g, ''); }
  function fire(el){ try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch(e){} }

  // ===================================================================
  // ① collectFields — 現在の設定パネルから全項目を収集(pure/DOM読取のみ)
  // ===================================================================
  function collectFields(doc){
    doc = doc || document;
    var out = [], i, j, el, v;

    for (i = 0; i < SCALAR_DEFS.length; i++){
      var d = SCALAR_DEFS[i];
      el = doc.getElementById(d.id);
      if (!el) continue;
      v = trim(el.value);
      out.push({ key: d.key, label: d.label, value: v, filled: v.length > 0, writable: true, el: el });
    }

    // 主人公の性別(ラジオ) = 読み取り専用の確定情報
    var hg = doc.querySelector('input[name="v108g_hero"]:checked');
    var hgv = hg ? trim(hg.value) : '';
    out.push({ key: 'heroGender', label: '主人公の性別', value: hgv, filled: hgv.length > 0, writable: false, el: null });

    var cards = doc.querySelectorAll('#npcList .npc-card');
    for (i = 0; i < cards.length; i++){
      var n = i + 1;                       // 表示キーは1始まり
      for (j = 0; j < NPC_DEFS.length; j++){
        var nd = NPC_DEFS[j];
        el = cards[i].querySelector('[data-f="' + nd.f + '"]');
        if (!el) continue;
        v = trim(el.value);
        out.push({
          key: 'npc' + n + '_' + nd.f,
          label: 'NPC' + n + 'の' + nd.label,
          value: v, filled: v.length > 0, writable: true, el: el
        });
      }
      // 性別ラジオの name は 0始まり(features.js genderRadio: v108g_npc<idx>)
      var ng = doc.querySelector('input[name="v108g_npc' + i + '"]:checked');
      var ngv = ng ? trim(ng.value) : '';
      out.push({
        key: 'npc' + n + '_gender', label: 'NPC' + n + 'の性別',
        value: ngv, filled: ngv.length > 0, writable: false, el: null
      });
    }
    return out;
  }

  // ===================================================================
  // ② buildFillPrompt — 種(確定情報)を全文渡し、空欄キーだけを要求(pure)
  // ===================================================================
  function buildFillPrompt(fields){
    var known = [], blanks = [], i, f;
    for (i = 0; i < (fields || []).length; i++){
      f = fields[i];
      if (!f || !f.key) continue;
      if (f.filled) { if (trim(f.value)) known.push(f); }
      else if (f.writable) blanks.push(f);
    }
    if (blanks.length === 0) return null;   // 全欄埋まっている → 生成しない

    var hasSeed = known.length > 0;
    var sys =
      'あなたはTRPGのシナリオ設計者。日本語で回答し、JSONオブジェクトだけを返す。' +
      '【最重要】ユーザーがすでに書いた「確定情報」は絶対に変更・否定・言い換えしない。' +
      'それを物語の種(seed)として出発点にし、指定された空欄だけを、確定情報と一切矛盾しないように創作して埋める。' +
      '世界観・時代・文化・ジャンル・技術水準・空気感は確定情報から必ず導く（例: 学園ホラーの世界に魔法使いを出さない／中世の世界にスマートフォンを出さない）。' +
      '確定情報が無い項目だけを自由に発想してよい。指定されたキー以外は絶対に返さない。';
    if (!hasSeed){
      sys = 'あなたはTRPGのシナリオ設計者。日本語で回答し、JSONオブジェクトだけを返す。' +
        '多様なジャンル（ダークファンタジー/ホラー/SF/現代/歴史/ミステリ/和風怪異 等）からランダムに一つ選び、' +
        '世界観・登場人物・場所・雰囲気が一つの世界として整合したシナリオを作る。指定されたキー以外は絶対に返さない。';
    }

    var u = [];
    u.push('## 確定情報（ユーザーがすでに書いた内容。絶対に変更しない。ここから発想する）');
    if (hasSeed){
      for (i = 0; i < known.length; i++){
        u.push('- ' + known[i].label + ' [' + known[i].key + ']: ' + known[i].value);
      }
    } else {
      u.push('（なし。自由に一つの世界を作ってよい）');
    }
    u.push('');
    u.push('## 埋めるべき空欄（このキーだけを返す。' + blanks.length + '件）');
    var keys = [];
    for (i = 0; i < blanks.length; i++){
      u.push('- ' + blanks[i].key + ' : ' + blanks[i].label);
      keys.push(blanks[i].key);
    }
    u.push('');
    u.push('## 出力形式');
    u.push('上に列挙したキーだけを含むJSONオブジェクトのみを返す。');
    u.push('確定情報のキーは絶対に含めない。説明文・前置き・コードフェンスは書かない。');
    u.push('{"' + keys[0] + '": "値"' + (keys.length > 1 ? ', "' + keys[1] + '": "値"' : '') + ' ...}');
    u.push('');
    u.push('## 各項目の書き方');
    u.push('- 値はすべて日本語の文字列。空文字にしない。');
    u.push('- npc1_* は同一人物、npc2_* は別の同一人物の設定（人物ごとに一貫させる）。');
    u.push('- *_desc は外見・立場を1〜2文で簡潔に。*_personality / *_coreDesire / *_coreFear は短い1文。*_wound は1〜2文。');
    u.push('- 性別が確定情報にある人物は、その性別と矛盾しない名前・外見にする。');
    u.push('- 既に名前が確定している人物と同じ名前を新しく作らない。');

    return { sys: sys, user: u.join('\n'), blankKeys: keys, knownKeys: (function(){ var a = []; for (i = 0; i < known.length; i++) a.push(known[i].key); return a; })() };
  }

  // ===================================================================
  // JSONパース(コードフェンス/ネスト/別名を吸収。失敗は null)
  // ===================================================================
  function parseFillJson(text){
    if (typeof text !== 'string' || !text) return null;
    var s = text.replace(/```[a-zA-Z]*/g, ' ').replace(/```/g, ' ');
    var a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    var o;
    try { o = JSON.parse(s.slice(a, b + 1)); } catch(e){ return null; }
    if (!o || typeof o !== 'object' || Object.prototype.toString.call(o) === '[object Array]') return null;

    // 1段のネストを平坦化: {"npc1":{"name":"…"}} → npc1_name
    var flat = {}, k, sk;
    for (k in o){
      if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
      var v = o[k];
      if (v && typeof v === 'object' && Object.prototype.toString.call(v) !== '[object Array]'){
        for (sk in v){
          if (!Object.prototype.hasOwnProperty.call(v, sk)) continue;
          flat[k + '_' + sk] = v[sk];
        }
      } else {
        flat[k] = v;
      }
    }
    // 別名を正規キーへ
    var out = {};
    for (k in flat){
      if (!Object.prototype.hasOwnProperty.call(flat, k)) continue;
      var nk = Object.prototype.hasOwnProperty.call(ALIASES, k) ? ALIASES[k] : k;
      if (!Object.prototype.hasOwnProperty.call(out, nk)) out[nk] = flat[k];
    }
    return out;
  }

  function normVal(v){
    if (typeof v === 'number') v = String(v);
    if (typeof v !== 'string') return '';
    var s = trim(v).replace(/^["'「『]+|["'」』]+$/g, '');
    s = trim(s);
    if (!s) return '';
    if (/^(なし|未定|不明|空|null|undefined|n\/a|-{1,3})$/i.test(s)) return '';
    if (s.length > MAX_VAL_LEN) s = s.slice(0, MAX_VAL_LEN);
    return s;
  }

  // ===================================================================
  // ③ applyFill — 空欄にだけ書く。filled/writable=false は絶対に触らない
  // ===================================================================
  function applyFill(fields, json){
    var rep = { applied: [], protected_: [], unknown: [], rejected: [] };
    if (!fields || !fields.length) return rep;
    if (!json || typeof json !== 'object' || Object.prototype.toString.call(json) === '[object Array]') return rep;

    var byKey = {}, taken = {}, i, f;
    for (i = 0; i < fields.length; i++){
      f = fields[i];
      if (!f || !f.key) continue;
      byKey[f.key] = f;
      if (f.filled && NAME_RE.test(f.key) && trim(f.value)) taken[trim(f.value)] = 1;
    }

    for (var k in json){
      if (!Object.prototype.hasOwnProperty.call(json, k)) continue;
      f = byKey[k];
      if (!f){ rep.unknown.push(k); continue; }                       // 未知キー → 無視
      if (!f.writable || f.filled){ rep.protected_.push(k); continue; } // ★ユーザー入力は絶対不可侵
      var v = normVal(json[k]);
      if (!v){ rep.rejected.push(k); continue; }
      if (NAME_RE.test(k)){
        if (taken[v]){ rep.rejected.push(k); continue; }              // 名前の重複は却下
        taken[v] = 1;
      }
      if (f.el){
        // 二重防御: 収集後にユーザーが打った可能性を考え、DOM実値も直前に再確認
        if (trim(f.el.value)){ rep.protected_.push(k); continue; }
        f.el.value = v;
        fire(f.el);   // fix351のデバウンス下書きコミットが拾う
      }
      f.value = v; f.filled = true;
      rep.applied.push(k);
    }
    return rep;
  }

  // ===================================================================
  // 発火点: UI.randomFill の最外周ラップ
  // ===================================================================
  var ORIG = null, WRAPPER = null, BUSY = false;

  function callOrig(ctx, args){
    if (typeof ORIG !== 'function') return undefined;
    try { return ORIG.apply(ctx || getUI(), args || []); } catch(e){ try { console.warn(TAG, 'orig err', e && e.message); } catch(_){} }
  }
  function legacy(){
    BUSY = true;
    try { callOrig(getUI(), []); } catch(e){}
    setTimeout(function(){ BUSY = false; }, 3000);
  }

  // カード0枚のときだけ空カードを作る(既存カードがあれば触らない=DOM値を壊さない)
  function ensureNpcCards(){
    var cards = document.querySelectorAll('#npcList .npc-card');
    if (cards.length > 0) return 0;
    var U = getUI();
    if (!U || typeof U.addNpc !== 'function') return 0;
    var added = 0;
    for (var i = 0; i < NEW_NPC_COUNT; i++){
      try { U.addNpc(); added++; } catch(e){ break; }
    }
    return added;
  }

  function request(p, cb){
    var st = getS(), cfg = (st && st.cfg) || {};
    var body = {
      model: cfg.orModel || 'deepseek/deepseek-v4-flash',
      temperature: 0.85,
      max_tokens: 1800,
      messages: [{ role: 'system', content: p.sys }, { role: 'user', content: p.user }]
    };
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', 'https://openrouter.ai/api/v1/chat/completions', true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Authorization', 'Bearer ' + (cfg.orKey || ''));
      xhr.timeout = TIMEOUT_MS;
      xhr.onload = function(){
        try {
          if (xhr.status !== 200) return cb(new Error('HTTP ' + xhr.status));
          var j = JSON.parse(xhr.responseText);
          var txt = (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
          if (!txt) return cb(new Error('empty'));
          cb(null, txt);
        } catch(e){ cb(e || new Error('parse')); }
      };
      xhr.onerror   = function(){ cb(new Error('network')); };
      xhr.ontimeout = function(){ cb(new Error('timeout')); };
      xhr.send(JSON.stringify(body));
    } catch(e){ cb(e || new Error('send')); }
  }

  function hasSeed(fields){
    for (var i = 0; i < fields.length; i++){
      if (fields[i] && fields[i].writable && fields[i].filled) return true;
    }
    return false;
  }
  function onFail(fields, why){
    try { console.warn(TAG, 'fail:', why); } catch(e){}
    if (!hasSeed(fields)){
      // 種が皆無 → 空フォームで詰まないよう従来の固定ランダムへ退避
      setStatus('AI生成に失敗しました。固定パターンで埋めます。', true);
      legacy();
      return;
    }
    // 種がある → 何も書かない(定型文で種を汚さない)。入力はそのまま。
    setStatus('AI生成に失敗しました。入力内容はそのままです。もう一度🎲を押してください。', true);
  }

  function run(){
    try { window.__f418genAt = Date.now(); } catch(e){}   // fix418(genkeep)のTTL契約

    ensureNpcCards();
    var fields = collectFields(document);
    var p = buildFillPrompt(fields);
    if (!p){
      setStatus('空欄はありません。🎲は「空いている欄」だけを埋めます。');
      return;
    }
    var st = getS(), cfg = (st && st.cfg) || {};
    if (cfg.provider !== 'openrouter' || !cfg.orKey){ legacy(); return; }

    setStatus('🎲 書いた内容から、空いている欄をAIが埋めています…（数秒）');
    request(p, function(err, txt){
      if (err) return onFail(fields, err && err.message);
      var json = parseFillJson(txt);
      if (!json) return onFail(fields, 'json');           // パース失敗 → 何も書かない
      var rep;
      try { rep = applyFill(fields, json); }
      catch(e){ return onFail(fields, 'apply'); }
      if (!rep.applied.length) return onFail(fields, 'nothing-applied');
      try { console.log(TAG, 'applied', rep.applied.length, rep.applied.join(','), '| protected', rep.protected_.length); } catch(e){}
      setStatus('🎲 空いていた' + rep.applied.length + '件を、書いた内容に合わせて埋めました。内容を確認して「保存してゲーム開始」を押してください。');
    });
  }

  function arm(){
    var U = getUI();
    if (!U || typeof U.randomFill !== 'function') return false;
    if (U.randomFill === WRAPPER) return true;      // すでに最外周

    var inner = U.randomFill;
    ORIG = inner;
    var w = function(){
      if (BUSY) return callOrig(this, arguments);       // 再ラップ時の二重発火ガード
      if (off()) return callOrig(this, arguments);      // OFF → 従来の全上書き生成
      BUSY = true;
      try { run(); } catch(e){ try { console.warn(TAG, 'run err', e && e.message); } catch(_){} }
      setTimeout(function(){ BUSY = false; }, 50);
    };
    // fix419c教訓: 内側関数の own props を全継承(他fixのラップ検出フラグを消さない)
    try {
      var ks = Object.keys(inner);
      for (var i = 0; i < ks.length; i++){ try { w[ks[i]] = inner[ks[i]]; } catch(e){} }
    } catch(e){}
    w.__f436 = true;
    U.randomFill = w;
    WRAPPER = w;
    try { console.log(TAG, 'armed', off() ? '(OFF)' : '(ON)'); } catch(e){}
    return true;
  }

  // seedAware/genderRadio/fix11 は DOMContentLoaded で後から wrap する。
  // keeper で最外周を奪還する(有限回。armは冪等)。
  function boot(){
    arm();
    var ticks = 0;
    var iv = setInterval(function(){
      ticks++;
      try { arm(); } catch(e){}
      if (ticks > 50) clearInterval(iv);   // 約30秒で停止
    }, 600);
  }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(boot, 0); }, { once: true });
  } else {
    setTimeout(boot, 0);
  }

  // 検証口(冪等ガードを兼ねる)
  window.__v292Dfix436 = {
    collectFields: collectFields,
    buildFillPrompt: buildFillPrompt,
    parseFillJson: parseFillJson,
    applyFill: applyFill,
    normVal: normVal,
    run: run,
    arm: arm,
    off: off,
    SCALAR_DEFS: SCALAR_DEFS,
    NPC_DEFS: NPC_DEFS,
    _state: function(){ return { armed: !!WRAPPER, busy: BUSY, hasOrig: typeof ORIG === 'function' }; }
  };
})();
