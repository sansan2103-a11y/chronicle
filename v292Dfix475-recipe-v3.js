// =====================================================================
// Chronicle TRPG - v292Dfix475: iconRecipeV3 標準化（新キャラの絵柄を7人と一致させる）
// v475.2: fix471 transient defuse 追加（実チェーン fix475(外)→fix471(内)→fetch の順対策）
// ---------------------------------------------------------------------
// 背景(2026-07-16・設計=Fable5 / 監査=GPT-5.6):
//   2026-07-15に全7人のアイコンを iconRecipeV3(外見英文 + STYLE6_TAIL / together /
//   fallback0 / FLUX.1-schnell / steps4 / 384x384) で統一済み。しかし既定の生成経路は
//   fix338 の ART6_TAIL(別スタイル文=semi-realistic を含み画風が割れる系統)を使うため、
//   新規キャラの絵柄が既存7人とずれる。
//   本fixは fetch境界(送信直前=fix441/471で実証済みの唯一確実な層)で、画像生成POSTの
//   promptをV3(STYLE6_TAIL)へ正規化し、モデルをWorker既定(schnell/4)へ戻す(style420/
//   image_lorasを外す)。artStyle=6のリクエストだけを request-local に判定して介入する。
//
// 有効化(opt-in・既定OFF): localStorage.v292Dfix475OnV1='1' かつ v292Dfix475Off!=='1'
// 検証口: window.__v292Dfix475 = { canonicalize, STYLE6_TAIL, STYLE6_TAIL_CREATURE, status }
// ★index.html変更・デプロイは親が別途行う。本ファイルは新規1ファイルで完結。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix475 && window.__v292Dfix475.__armed) return;   // 二重arm禁止
  var TAG = '[v292Dfix475:recipe-v3]';

  // ---------- V3 の正body（fix338 PREFIX[7] / PREFIX_CREATURE[7] の '@TAIL ' 除去後） ----------
  // ★fix486(style6-v2): pale skin除去(fix484と同期)。v1はEND_TAILSに保持。
  var STYLE6_TAIL_V1 =
    'dark fantasy anime character portrait, head and shoulders, visible clothing, detailed face, ' +
    'dim moody lighting, muted desaturated colors, dark shadowy background, pale skin, ' +
    'somber gothic horror atmosphere, high quality';
  var STYLE6_TAIL =
    'dark fantasy anime character portrait, head and shoulders, visible clothing, detailed face, ' +
    'dim moody lighting, muted desaturated colors, dark shadowy background, ' +
    'somber gothic horror atmosphere, high quality';
  var STYLE6_TAIL_CREATURE =
    'dark fantasy anime creature concept art, full creature body visible, highly detailed, ' +
    'dim moody lighting, muted desaturated colors, dark shadowy background, ' +
    'somber gothic horror atmosphere, high quality, non-human creature, monster design, ' +
    'no human face, no human body';

  // ---------- 剥がし対象：末尾からのみ（END_TAILS）。kind で人間/人外を確定 ----------
  // 出典を各行に明記。'@TAIL ' は除去済みの本文で保持する。
  var H = 'human', C = 'creature';
  var END_TAILS = [
    // fix338 ART6_TAIL / ART6C_TAIL 本文（'@TAIL ' 除去後）＝現行の既定スタイル
    { s: 'Dark fantasy visual-novel illustration, semi-realistic anime rendering, textured mature facial features, individual asymmetrical face, dim cinematic lighting with soft shadows, muted desaturated cold palette, simple dark atmospheric background, chest-up bust with space around, not a close-up, highly detailed, high quality', k: H },
    { s: 'Dark fantasy creature concept art, JRPG bestiary portrait, semi-realistic rendering, dim cinematic lighting, muted desaturated palette, dark atmospheric background, upper body framing with space around, not a close-up, highly detailed, high quality, non-human creature, monster design, no human face', k: C },
    // STYLE6_TAIL(=v2) 自身 / creature 自身（冪等：既にV3ならno-op）
    { s: STYLE6_TAIL, k: H },
    // ★fix486: 旧canonical(v1・pale skin有)も剥がし対象
    { s: STYLE6_TAIL_V1, k: H },
    { s: STYLE6_TAIL_CREATURE, k: C },
    // fix471 STYLE_HUMAN / STYLE_CREATURE（案C・FLUX.2-dev端末の産物）
    { s: 'Style: dark fantasy anime illustration, hand-drawn digital painting, crisp clean linework, cel shading with soft gradients, muted desaturated cold palette, deep charcoal atmospheric background, dim rim light, matte finish. Composition: chest-up bust portrait, the character faces the viewer in a front view or a slight three-quarter turn, the whole face clearly visible with both eyes visible, never a profile view and never a back view, the subject centered with space around, the outfit and collar visible.', k: H },
    { s: 'Style: dark fantasy anime illustration, hand-drawn digital painting, crisp clean linework, cel shading with soft gradients, muted desaturated cold palette, deep charcoal atmospheric background, dim rim light, matte finish. Subject rendering: non-human creature concept art, unsettling silhouette, no human face. Composition: upper body framing, the subject centered with space around.', k: C },
    // fix470 STYLE_DEFAULT / STYLE_CREATURE（韓国ウェブトゥーン調）
    { s: 'korean webtoon anime illustration, hand-drawn digital painting, clean thin linework, soft airbrushed cel shading, muted desaturated palette, near-black charcoal background, faint smoky texture, subtle rim light, subtle blush, glossy dark anime eyes, not photorealistic, not a photograph, no 3d render, no realistic skin texture', k: H },
    { s: 'korean webtoon anime illustration, hand-drawn digital painting, smooth airbrushed shading, delicate thin linework, muted desaturated palette, near-black charcoal background, faint smoky texture, eerie non-human creature concept art, no human face, unsettling silhouette, matte finish', k: C },
    // fix471 genderLine 2種（末尾スペース/ピリオドは matcher が許容）
    { s: 'The subject is clearly female, with feminine facial features', k: H },
    { s: 'The subject is clearly male, with masculine facial features', k: H }
  ];

  // ---------- 剥がし対象：先頭からのみ（FRONT_PREFIXES）。art6系のみ ----------
  var FRONT_PREFIXES = [
    // fix338 ART6_OLD / ART6C_OLD（旧・闇アニメ）
    { s: 'Dark fantasy anime character portrait, semi-realistic anime rendering, pale porcelain skin, dim moody dramatic lighting, muted desaturated palette hex #262430 hex #4A3A44, dark shadowy background, delicate detailed face, elegant somber gothic atmosphere, head-and-shoulders, visible clothing, high quality', k: H },
    { s: 'Dark fantasy creature concept art, semi-realistic detailed rendering, muted desaturated palette hex #262430, dim moody lighting, dark shadowy background, somber atmosphere, non-human creature, monster design, no human face', k: C },
    // fix338 ART6_V1..V5
    { s: 'Soft semi-realistic anime portrait, clean lineless digital painting, luminous natural skin with subtle blush, large detailed glossy eyes, fine individual hair strands, soft even daylight, gentle pastel color grading, pale neutral desaturated background, calm delicate atmosphere, head-and-shoulders character portrait, visible clothing, highly detailed, high quality', k: H },
    { s: 'Soft semi-realistic anime portrait, clean lineless digital painting, luminous natural skin with subtle blush, large detailed glossy eyes, fine individual hair strands, soft dim ambient lighting, muted desaturated color grading, dark grey background, calm quiet atmosphere, medium shot, upper body visible from the chest up, subject small in frame with generous headroom and space around, not a close-up, visible clothing, highly detailed, high quality', k: H },
    { s: 'JRPG character portrait, visual novel style character bust, soft semi-realistic anime rendering, clean lineless digital painting, luminous natural skin, detailed glossy eyes, fine hair strands, soft dim ambient lighting, muted desaturated color grading, dark grey gradient background, three-quarter view with the body turned slightly to the side while facing the viewer, bust shot from the waist up, the full outfit and collar clearly visible, relaxed natural posture, subject small in frame with space around, not a close-up, highly detailed, high quality', k: H },
    { s: 'Dark fantasy anime character portrait, JRPG visual novel character bust, semi-realistic anime rendering, pale porcelain skin, detailed delicate face, quiet unreadable expression, dim moody dramatic lighting with soft shadows on the face, muted desaturated palette, dark shadowy atmospheric background with subtle depth, facing the viewer straight on, front view, symmetrical composition, bust shot from the chest up, the school uniform and collar clearly visible, subject centered with space around, not a close-up, somber gothic atmosphere, highly detailed, high quality', k: H },
    { s: 'Dark fantasy anime character portrait, JRPG visual novel character bust, semi-realistic anime rendering, pale porcelain skin, detailed delicate face, living expressive gaze that reflects the character personality, dim moody cinematic lighting with soft shadows, muted desaturated palette, dark shadowy atmospheric background with subtle depth, facing the viewer, caught mid-motion in a candid moment, relaxed asymmetric posture with a subtle head tilt and shoulders at slightly different heights, hair and collar with faint natural movement, alive and breathing, never a stiff frontal mugshot, bust shot from the chest up, the school uniform and collar clearly visible, subject centered with space around, not a close-up, somber gothic atmosphere, highly detailed, high quality', k: H },
    // fix338 ART6_NEW
    { s: 'Dark fantasy anime character portrait, JRPG visual novel character bust, semi-realistic anime rendering, distinct individual facial features unique to this character, face shape, age, build, skin tone and hair exactly as described, avoid a generic idol face, living expressive gaze that reflects the character personality, dim moody cinematic lighting with soft shadows, muted desaturated palette, dark shadowy atmospheric background with subtle depth, natural body angle chosen to suit the character, may be front facing, slightly turned or three-quarter, caught mid-motion in a candid moment, relaxed asymmetric posture, never a stiff symmetrical mugshot, bust shot from the chest up, the full outfit and collar clearly visible, subject centered with space around, not a close-up, somber gothic atmosphere, highly detailed, high quality', k: H },
    // fix338 ART6C_V1..V5
    { s: 'Soft semi-realistic creature concept art, clean lineless digital painting, luminous natural surfaces with subtle sheen, fine individual detail, soft even daylight, gentle pastel color grading, pale neutral desaturated background, calm delicate atmosphere, highly detailed, high quality, non-human creature, monster design, no human face', k: C },
    { s: 'Soft semi-realistic creature concept art, clean lineless digital painting, luminous natural surfaces with subtle sheen, fine individual detail, soft dim ambient lighting, muted desaturated color grading, dark grey background, calm quiet atmosphere, medium shot, subject small in frame with generous space around, not a close-up, highly detailed, high quality, non-human creature, monster design, no human face', k: C },
    { s: 'JRPG creature concept art, game bestiary portrait, soft semi-realistic rendering, clean lineless digital painting, luminous surfaces with subtle sheen, fine individual detail, soft dim ambient lighting, muted desaturated color grading, dark grey gradient background, three-quarter view angled to the side, upper body bust framing with space around, not a close-up, highly detailed, high quality, non-human creature, monster design, no human face', k: C },
    { s: 'Dark fantasy creature concept art, JRPG bestiary portrait, semi-realistic rendering, dim moody dramatic lighting, muted desaturated palette, dark shadowy atmospheric background with subtle depth, facing the viewer straight on, front view, symmetrical composition, upper body bust framing, subject centered with space around, not a close-up, somber gothic atmosphere, highly detailed, high quality, non-human creature, monster design, no human face', k: C },
    { s: 'Dark fantasy creature concept art, JRPG bestiary portrait, semi-realistic rendering, dim moody cinematic lighting, muted desaturated palette, dark shadowy atmospheric background with subtle depth, facing the viewer, caught mid-motion in a candid moment, asymmetric living posture, never a stiff symmetrical pose, upper body bust framing, subject centered with space around, not a close-up, somber gothic atmosphere, highly detailed, high quality, non-human creature, monster design, no human face', k: C },
    // fix338 ART6C_NEW
    { s: 'Dark fantasy creature concept art, JRPG bestiary portrait, semi-realistic rendering, distinct silhouette and anatomy unique to this creature, form, size and surface exactly as described, avoid a generic monster shape, dim moody cinematic lighting, muted desaturated palette, dark shadowy atmospheric background with subtle depth, natural angle chosen to suit the creature, caught mid-motion in a candid moment, asymmetric living posture, never a stiff symmetrical pose, upper body bust framing, subject centered with space around, not a close-up, somber gothic atmosphere, highly detailed, high quality, non-human creature, monster design, no human face', k: C }
  ];

  // ---------- 有効条件（live評価・opt-in・既定OFF） ----------
  function on(){
    try {
      if (localStorage.getItem('v292Dfix475Off') === '1') return false;
      return localStorage.getItem('v292Dfix475OnV1') === '1';
    } catch(e){ return false; }
  }
  function fix471On(){
    try {
      if (localStorage.getItem('v292Dfix471Off') === '1') return false;
      return localStorage.getItem('v292Dfix471On') === '1';
    } catch(e){ return false; }
  }

  var _warnedUnknown = false, _warned471 = false;   // 1セッション1回だけの警告
  function warnUnknownOnce(){ if (_warnedUnknown) return; _warnedUnknown = true; try { console.warn(TAG, 'unknown avatar prompt (no art6 marker) — passing through unchanged'); } catch(e){} }
  function warn471Once(){ if (_warned471) return; _warned471 = true; try { console.warn(TAG, 'artStyle=6生成のためfix471を一時無効化（fix475が画風を最終決定）'); } catch(e){} }

  // 末尾/先頭の余分な句読点・空白を掃除
  function coreOf(T){ return T.replace(/[\s.,;]+$/, ''); }
  function cleanTailPunct(s){ return s.replace(/[\s.,;]+$/, ''); }
  function cleanHeadPunct(s){ return s.replace(/^[\s.,;]+/, ''); }

  // 末尾に END_TAIL があるか（前置 ', '/' '/'. ' の揺れと末尾句読点を許容・最長一致）
  function stripEndOnce(s){
    var best = null, bestLen = -1, bestKind = null;
    for (var i = 0; i < END_TAILS.length; i++){
      var core = coreOf(END_TAILS[i].s);
      if (!core) continue;
      var idx = s.lastIndexOf(core);
      if (idx < 0) continue;
      var after = s.slice(idx + core.length);
      if (!/^[\s.,;]*$/.test(after)) continue;         // 末尾に句読点/空白しか残らない＝真の末尾一致
      if (core.length > bestLen){ best = core; bestLen = core.length; bestKind = END_TAILS[i].k; }
    }
    if (!best) return null;
    var atIdx = s.lastIndexOf(best);
    var head = cleanTailPunct(s.slice(0, atIdx));
    return { s: head, k: bestKind };
  }

  // 先頭に FRONT_PREFIX があるか（位置0の完全一致＋直後の ', '/'. ' を除去・最長一致）
  function stripFrontOnce(s){
    var best = null, bestLen = -1, bestKind = null;
    for (var i = 0; i < FRONT_PREFIXES.length; i++){
      var p = FRONT_PREFIXES[i].s;
      if (s.indexOf(p) === 0 && p.length > bestLen){ best = p; bestLen = p.length; bestKind = FRONT_PREFIXES[i].k; }
    }
    if (!best) return null;
    var rest = cleanHeadPunct(s.slice(best.length));
    return { s: rest, k: bestKind };
  }

  // art6判定（request-local）: 末尾END_TAILまたは先頭FRONT_PREFIXに一致した時だけ確定。
  //   subjectKind は一致マーカーの kind（末尾の最長一致を優先し、無ければ先頭）。
  function detect(s){
    // 末尾（最長一致で kind を決める）
    var eBest = null, eLen = -1, eKind = null;
    for (var i = 0; i < END_TAILS.length; i++){
      var core = coreOf(END_TAILS[i].s);
      var idx = s.lastIndexOf(core);
      if (idx < 0) continue;
      var after = s.slice(idx + core.length);
      if (!/^[\s.,;]*$/.test(after)) continue;
      if (core.length > eLen){ eBest = core; eLen = core.length; eKind = END_TAILS[i].k; }
    }
    if (eBest) return { kind: eKind };
    // 先頭
    var fBest = null, fLen = -1, fKind = null;
    for (var j = 0; j < FRONT_PREFIXES.length; j++){
      var p = FRONT_PREFIXES[j].s;
      if (s.indexOf(p) === 0 && p.length > fLen){ fBest = p; fLen = p.length; fKind = FRONT_PREFIXES[j].k; }
    }
    if (fBest) return { kind: fKind };
    return null;
  }

  // ---------- 単一の正規化関数 ----------
  function canonicalizeArt6Prompt(prompt){
    var orig = prompt;
    var s = String(prompt == null ? '' : prompt);
    if (!s) return orig;
    var det = detect(s);
    if (!det){ warnUnknownOnce(); return orig; }        // fail-open: 未知は無変更で返す
    var kind = det.kind;
    var body = s, r, guard;
    for (guard = 0; guard < 64; guard++){ r = stripEndOnce(body); if (!r) break; body = r.s; }
    for (guard = 0; guard < 64; guard++){ r = stripFrontOnce(body); if (!r) break; body = r.s; }
    body = cleanHeadPunct(cleanTailPunct(body)).trim();
    if (!body) body = 'character';
    var tail = (kind === C) ? STYLE6_TAIL_CREATURE : STYLE6_TAIL;
    return body + ', ' + tail;
  }

  // ---------- 送信直前 assert ----------
  function endsWithExact(p, T){ var t = p.replace(/\s+$/, ''); return t.length >= T.length && t.slice(t.length - T.length) === T; }
  function countOf(p, T){ if (!T) return 0; var n = 0, i = 0; while ((i = p.indexOf(T, i)) >= 0){ n++; i += T.length; } return n; }
  function assertBody(b){
    var p = String(b.prompt || '');
    var isH = endsWithExact(p, STYLE6_TAIL);
    var isC = endsWithExact(p, STYLE6_TAIL_CREATURE);
    if (!isH && !isC) return 'STYLE6 tail missing at end';
    var chosen = isC ? STYLE6_TAIL_CREATURE : STYLE6_TAIL;
    if (countOf(p, chosen) !== 1) return 'STYLE6 tail not exactly 1';
    // 既知の旧tailが末尾に残っていない
    for (var i = 0; i < END_TAILS.length; i++){
      var core = coreOf(END_TAILS[i].s);
      if (core === coreOf(chosen)) continue;
      if (endsWithExact(cleanTailPunct(p), core)) return 'legacy tail remains: ' + core.slice(0, 24);
    }
    if (b.style420 != null) return 'style420 present';
    if (b.image_loras != null) return 'image_loras present';
    if (b.size !== '384x384') return 'size not 384x384';
    return null;
  }

  // ---------- fetch ラッパ（fix471 isAvatarGen と同一判定） ----------
  function isAvatarGen(url, init){
    try {
      var u = String((url && url.url) || url || '');
      if (u.indexOf('gen.pollinations.ai/v1/images/generations') < 0 && !(/workers\.dev/.test(u) && u.indexOf('/image') >= 0)) return false;
      return !!(init && init.method === 'POST' && typeof init.body === 'string');
    } catch(e){ return false; }
  }

  var _origFetch = window.fetch;
  var wrapped = function(url, init){
    try {
      if (on() && isAvatarGen(url, init)){
        var b = JSON.parse(String(init.body));
        if (b && b.prompt != null && detect(String(b.prompt))){   // art6確定時のみ介入
          b.prompt = canonicalizeArt6Prompt(b.prompt);
          delete b.style420;                 // fix471がONでも強制上書き＝最終決定権
          delete b.image_loras;
          b.size = '384x384';                 // model と n は不触
          // テスト専用シーム（本番では未設定）: assert失敗を人工的に起こす
          try { var c = window.__v292Dfix475 && window.__v292Dfix475.__test_corrupt; if (typeof c === 'function') b.prompt = c(b.prompt); } catch(e){}
          var err = assertBody(b);
          if (err){
            try { console.error(TAG, 'send-time assert failed:', err); } catch(e){}
            return Promise.reject(new Error(TAG + ' send-time assert failed: ' + err));
          }
          init = Object.assign({}, init, { body: JSON.stringify(b) });   // art6のみ再構築（非対象はbyte-equivalentで素通し）
          // ---- transient defuse（v475.2）: 実チェーンは fix475(外)→fix471(内)→実fetch。
          //   fix471はラッパ入口で off() を live評価するため、この1リクエストの委譲中だけ
          //   v292Dfix471Off='1' にすれば内側fix471が確実に素通しする（=art6ではfix475が画風の最終決定権）。
          //   委譲直後(finally)に元値へ復元。非art6/artStyle0〜5でのfix471のユーザー選択は尊重する。
          if (fix471On()){
            warn471Once();
            var __had471 = false, __prev471 = null;
            try { __prev471 = localStorage.getItem('v292Dfix471Off'); __had471 = true; } catch(e){}
            try { localStorage.setItem('v292Dfix471Off', '1'); } catch(e){}
            try {
              return _origFetch.apply(this, [url, init]);   // 委譲（この間だけfix471は素通し）
            } finally {
              if (__had471){
                try {
                  if (__prev471 == null) localStorage.removeItem('v292Dfix471Off');
                  else localStorage.setItem('v292Dfix471Off', __prev471);
                } catch(e){}
              }
            }
          }
          return _origFetch.apply(this, [url, init]);   // fix471非ON: そのまま委譲（fix471には一切触らない）
        }
      }
    } catch(e){ try { console.warn(TAG, 'wrap error', e); } catch(_){} }
    return _origFetch.apply(this, [url, init]);   // strictでは arguments が再代入を反映しない -> 明示配列で渡す
  };
  // ★fix419cの教訓: 内側関数の own props を全継承（フラグ消し合い＝再ラップ地獄の防止）
  try {
    Object.getOwnPropertyNames(_origFetch).forEach(function(k){
      if (k === 'length' || k === 'name' || k === 'arguments' || k === 'caller' || k === 'prototype') return;
      try { Object.defineProperty(wrapped, k, Object.getOwnPropertyDescriptor(_origFetch, k)); } catch(e){}
    });
    try { Object.defineProperty(wrapped, 'name', { value: (_origFetch && _origFetch.name) || 'fetch', configurable: true }); } catch(e){}
    if (_origFetch && _origFetch.prototype) { try { wrapped.prototype = _origFetch.prototype; } catch(e){} }
  } catch(e){}
  wrapped.__v292Dfix475 = true;   // 冪等フラグはラッパ関数上にも立てる
  window.fetch = wrapped;

  // ---------- 検証口 ----------
  window.__v292Dfix475 = {
    __armed: true,
    canonicalize: canonicalizeArt6Prompt,
    detect: detect,
    STYLE6_TAIL: STYLE6_TAIL,
    STYLE6_TAIL_V1: STYLE6_TAIL_V1,
    STYLE6_TAIL_CREATURE: STYLE6_TAIL_CREATURE,
    END_TAILS: END_TAILS,
    FRONT_PREFIXES: FRONT_PREFIXES,
    status: function(){ return { on: on(), fix471On: fix471On(), armed: true }; }
  };
  try { console.log(TAG, 'armed; active:', on() ? 'on' : 'off(preview)'); } catch(e){}
})();
