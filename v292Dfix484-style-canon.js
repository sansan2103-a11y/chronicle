// =====================================================================
// Chronicle TRPG - v292Dfix484: 画風決定権の一本化（最終送信境界での style6 正規化）
// ---------------------------------------------------------------------
// 背景(2026-07-17・Codex第2段階指示):
//   artStyle=6 の最終画風タグが、fetchチェーン最内側の fix338(ART6_TAIL=semi-realistic
//   visual-novel調) と端末残留フラグ(v292Dfix338Off / 470On / 471On / 475OnV1 ...)に
//   依存して端末ごとに割れていた（第1段階監査 E1）。
//   本fixは「実際に Worker /image (または gen.pollinations.ai 直) へ送る直前」で一度だけ
//   正規化し、既知のスタイル末尾/接頭辞だけを安全に剥がして canonical STYLE6_TAIL を
//   ちょうど1回付与する。人物固有の髪・年齢・服装・表情などの記述は消さない。
//   → 上流ラッパ(fix338/420/470/471/475/476/481)や端末フラグが何であっても
//     最終送信プロンプトは同一形へ収束する。
//
// 配置: index.html で v292Dfix247-proxy.js の【直前】に読み込む。
//   fix247 は読み込み時の window.fetch(=本ラッパ)を _fetch として捕獲するため、
//   URL書換(workers.dev/image)・認証ヘッダ再構築の【後】の最終リクエストが必ずここを通る。
//   （後続の全ラッパは fix247 より外側なので、ここが送信直前の最終境界になる）
//
// 介入条件(request-local・fix475と同思想):
//   POST + JSON文字列body + prompt文字列 + 宛先が画像生成エンドポイント かつ
//   (a) 既知の art6系マーカー(末尾/先頭)を検出、または
//   (b) マーカー無しでも S.cfg.artStyle===6（タグ無し素通し便の救済。旧レシピ等）
//   それ以外(他画風0-5・非アイコン・チャット等)は byte-equivalent で素通し。
//
// 正規化内容（art6確定時のみ・【プロンプト末尾の画風一本化だけ】が本fixの範囲）:
//   ・既知の【完全な】旧STYLE/ART末尾ブロック(END_TAILS)を末尾から、既知の完全な
//     接頭辞ブロック(FRONT_PREFIXES)を先頭から繰り返し剥がす（重複もここで消える）。
//     本文中間・単語単位には一切触れない＝人物固有記述（髪・年齢・服装・表情・傷など）は
//     バイト単位で保持する。
//   ・canonical STYLE6_TAIL（人外は STYLE6_TAIL_CREATURE）を末尾に1回だけ付与
//   ・size / model / steps / style420 / image_loras などパラメータ類は【不触】（別変更の範囲）
//   ・冪等: 同じリクエストを2回通しても結果は変化しない
//
// fix338との整合: fix338(v292Dfix338-artstyle.js)の fetch層 'post' 変換は、fix484が有効な
//   artStyle=6 のとき【スキップ】する（fix338側に最小ガードを追加）。fix338の変換は
//   コア本文からも語を削る不可逆処理のため、内側からでは復元できず、ここで止めるのが
//   「端末フラグ非依存で同一の最終送信」を満たす唯一の最小手段。fix484不在/OFFなら従来どおり。
//
// 診断(既定OFF): localStorage v292Dfix484Diag='1' → 送信直前に秘密情報を含まない1行JSONを
//   console.log。内容= provider / promptHash(djb2) / canonicalStyleVersion / seed /
//   mode(auto|regen|pipeline) / cand / batch / size / 宛先種別。完全なprompt・キー・合言葉は出さない。
//   mode等は fix197/fix476 が body.__diag484 として付けるタグ由来（本fixが送信前に必ず除去する）。
//
// 既定ON。緊急OFF: localStorage v292Dfix484Off='1'（live評価・正規化のみ停止。__diag484除去は継続）
// 検証口: window.__v292Dfix484 = { canonicalize, detect, normalizeBody, active, status,
//   STYLE6_TAIL, STYLE6_TAIL_CREATURE, END_TAILS, FRONT_PREFIXES, CANON_VERSION }
// ※このファイルは document に一切触れない（Nodeサンドボックスでテスト可能）。
// =====================================================================
(function(){
  'use strict';
  var W = (typeof window !== 'undefined') ? window : this;
  if (W.__v292Dfix484 && W.__v292Dfix484.__armed) return;   // 二重arm禁止
  var TAG = '[v292Dfix484:style-canon]';
  var CANON_VERSION = 'style6-v1';

  // ---------- canonical（fix475 STYLE6_TAIL と同一文字列。テストで同一性を検証） ----------
  var STYLE6_TAIL =
    'dark fantasy anime character portrait, head and shoulders, visible clothing, detailed face, ' +
    'dim moody lighting, muted desaturated colors, dark shadowy background, pale skin, ' +
    'somber gothic horror atmosphere, high quality';
  var STYLE6_TAIL_CREATURE =
    'dark fantasy anime creature concept art, full creature body visible, highly detailed, ' +
    'dim moody lighting, muted desaturated colors, dark shadowy background, ' +
    'somber gothic horror atmosphere, high quality, non-human creature, monster design, ' +
    'no human face, no human body';

  // ---------- 剥がし対象：末尾からのみ（END_TAILS）。出典を各行に明記 ----------
  var H = 'human', C = 'creature';
  var END_TAILS = [
    // fix338 ART6_TAIL / ART6C_TAIL 本文（'@TAIL ' 除去後）＝fix338既定のsemi-realistic系
    { s: 'Dark fantasy visual-novel illustration, semi-realistic anime rendering, textured mature facial features, individual asymmetrical face, dim cinematic lighting with soft shadows, muted desaturated cold palette, simple dark atmospheric background, chest-up bust with space around, not a close-up, highly detailed, high quality', k: H },
    { s: 'Dark fantasy creature concept art, JRPG bestiary portrait, semi-realistic rendering, dim cinematic lighting, muted desaturated palette, dark atmospheric background, upper body framing with space around, not a close-up, highly detailed, high quality, non-human creature, monster design, no human face', k: C },
    // STYLE6_TAIL 自身 / creature 自身（冪等：既にcanonicalならno-op）
    { s: STYLE6_TAIL, k: H },
    { s: STYLE6_TAIL_CREATURE, k: C },
    // features.js legacy初回経路（avatarUrlLocal / genUrl / autofill系 v292Dfix285文言・完全ブロック）
    { s: 'character portrait, head and shoulders, visible clothing, detailed face, dark fantasy, dim moody lighting, muted desaturated colors, dark shadowy background, pale skin, somber gothic horror atmosphere, high quality', k: H },
    // fix471 STYLE_HUMAN / STYLE_CREATURE（案C）
    { s: 'Style: dark fantasy anime illustration, hand-drawn digital painting, crisp clean linework, cel shading with soft gradients, muted desaturated cold palette, deep charcoal atmospheric background, dim rim light, matte finish. Composition: chest-up bust portrait, the character faces the viewer in a front view or a slight three-quarter turn, the whole face clearly visible with both eyes visible, never a profile view and never a back view, the subject centered with space around, the outfit and collar visible.', k: H },
    { s: 'Style: dark fantasy anime illustration, hand-drawn digital painting, crisp clean linework, cel shading with soft gradients, muted desaturated cold palette, deep charcoal atmospheric background, dim rim light, matte finish. Subject rendering: non-human creature concept art, unsettling silhouette, no human face. Composition: upper body framing, the subject centered with space around.', k: C },
    // fix470 STYLE_DEFAULT / STYLE_CREATURE（韓国ウェブトゥーン調）
    { s: 'korean webtoon anime illustration, hand-drawn digital painting, clean thin linework, soft airbrushed cel shading, muted desaturated palette, near-black charcoal background, faint smoky texture, subtle rim light, subtle blush, glossy dark anime eyes, not photorealistic, not a photograph, no 3d render, no realistic skin texture', k: H },
    { s: 'korean webtoon anime illustration, hand-drawn digital painting, smooth airbrushed shading, delicate thin linework, muted desaturated palette, near-black charcoal background, faint smoky texture, eerie non-human creature concept art, no human face, unsettling silhouette, matte finish', k: C },
    // fix471 genderLine 2種
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

  // ---------- スイッチ（live評価） ----------
  function off(){ try { return localStorage.getItem('v292Dfix484Off') === '1'; } catch(e){ return false; } }
  function diagOn(){ try { return localStorage.getItem('v292Dfix484Diag') === '1'; } catch(e){ return false; } }
  function active(){ return !off(); }

  // ---------- cfg（マーカー無し便の救済用。request-local判定が最優先） ----------
  function cfgArt6(){
    try {
      var S = W.S || null;
      if (!S || !S.cfg || S.cfg.artStyle == null) return false;
      return String(S.cfg.artStyle) === '6';
    } catch(e){ return false; }
  }
  // fix338 isCreaturePrompt と同判定（タグ無し便のkind推定にのみ使用）
  var CREATURE_RE = /creature concept art|non-human creature|monster design|no human face|no human body|silhouette|faceless|no face|devoid of (?:any )?(?:face|features|detail)|apparition|wraith|specter|spectre|shadowy figure|made of (?:pure )?darkness|shadow (?:stretching|rising|standing|creeping|looming)|人影|亡霊|幽霊|化け物|怪物|異形|人の形をし/i;

  // ---------- 文字列ユーティリティ（fix475と同一ロジック） ----------
  function coreOf(T){ return T.replace(/[\s.,;]+$/, ''); }
  function cleanTailPunct(s){ return s.replace(/[\s.,;]+$/, ''); }
  function cleanHeadPunct(s){ return s.replace(/^[\s.,;]+/, ''); }

  function stripEndOnce(s){
    var best = null, bestLen = -1;
    for (var i = 0; i < END_TAILS.length; i++){
      var core = coreOf(END_TAILS[i].s);
      if (!core) continue;
      var idx = s.lastIndexOf(core);
      if (idx < 0) continue;
      var after = s.slice(idx + core.length);
      if (!/^[\s.,;]*$/.test(after)) continue;   // 末尾に句読点/空白しか残らない＝真の末尾一致
      if (core.length > bestLen){ best = core; bestLen = core.length; }
    }
    if (!best) return null;
    var atIdx = s.lastIndexOf(best);
    return cleanTailPunct(s.slice(0, atIdx));
  }
  function stripFrontOnce(s){
    var best = null, bestLen = -1;
    for (var i = 0; i < FRONT_PREFIXES.length; i++){
      var p = FRONT_PREFIXES[i].s;
      if (s.indexOf(p) === 0 && p.length > bestLen){ best = p; bestLen = p.length; }
    }
    if (!best) return null;
    return cleanHeadPunct(s.slice(best.length));
  }

  // art6マーカー検出（request-local）。一致マーカーのkindを返す（末尾の最長一致を優先）。
  function detect(s){
    var eBest = null, eLen = -1, eKind = null;
    for (var i = 0; i < END_TAILS.length; i++){
      var core = coreOf(END_TAILS[i].s);
      var idx = s.lastIndexOf(core);
      if (idx < 0) continue;
      var after = s.slice(idx + core.length);
      if (!/^[\s.,;]*$/.test(after)) continue;
      if (core.length > eLen){ eBest = core; eLen = core.length; eKind = END_TAILS[i].k; }
    }
    if (eBest) return { kind: eKind, via: 'end' };
    var fBest = null, fLen = -1, fKind = null;
    for (var j = 0; j < FRONT_PREFIXES.length; j++){
      var p = FRONT_PREFIXES[j].s;
      if (s.indexOf(p) === 0 && p.length > fLen){ fBest = p; fLen = p.length; fKind = FRONT_PREFIXES[j].k; }
    }
    if (fBest) return { kind: fKind, via: 'front' };
    return null;
  }

  // ---------- 正規化本体 ----------
  //   返り値: { prompt, kind, matched:'marker'|'cfg'|null }。matched=null は非art6（不触）。
  function canonicalize(prompt){
    var s = String(prompt == null ? '' : prompt);
    if (!s) return { prompt: prompt, kind: null, matched: null };
    var det = detect(s), kind = null, matched = null;
    if (det){ kind = det.kind; matched = 'marker'; }
    else if (cfgArt6()){ kind = CREATURE_RE.test(s) ? C : H; matched = 'cfg'; }   // タグ無し便の救済
    else return { prompt: s, kind: null, matched: null };
    var body = s, r, guard;
    for (guard = 0; guard < 64; guard++){ r = stripEndOnce(body); if (r == null) break; body = r; }
    for (guard = 0; guard < 64; guard++){ r = stripFrontOnce(body); if (r == null) break; body = r; }
    body = cleanHeadPunct(cleanTailPunct(body)).trim();   // 端の句読点/空白のみ。本文はバイト保持。
    if (!body) body = 'character';
    var tail = (kind === C) ? STYLE6_TAIL_CREATURE : STYLE6_TAIL;
    return { prompt: body + ', ' + tail, kind: kind, matched: matched };
  }

  // ---------- body正規化（artStyle=6確定時のみ介入。diag情報を返す） ----------
  //   触るのは b.prompt のみ。size / model / steps / style420 / image_loras 等の
  //   パラメータ類は本fixの範囲外（別変更）として一切変更しない。
  function normalizeBody(b){
    var info = { sv: null, kind: null, matched: null, changed: false };
    if (!b || typeof b !== 'object' || b.prompt == null) return info;
    var res = canonicalize(String(b.prompt));
    if (!res.matched) return info;
    info.sv = CANON_VERSION; info.kind = res.kind; info.matched = res.matched;
    if (b.prompt !== res.prompt){ b.prompt = res.prompt; info.changed = true; }
    return info;
  }

  // ---------- 定義ドリフト検知（STYLE6_TAILの二重管理事故の防止） ----------
  //   fix484はfix475より先に読み込まれるため参照は埋め込み定数だが、実行時に
  //   fix475/fix480(fix197)側の定義と食い違ったら1回だけ警告する（挙動は変えない）。
  var _driftWarned = false;
  function checkDrift(){
    if (_driftWarned) return;
    try {
      var f475 = W.__v292Dfix475;
      if (f475 && f475.__armed){
        if (f475.STYLE6_TAIL !== STYLE6_TAIL || f475.STYLE6_TAIL_CREATURE !== STYLE6_TAIL_CREATURE){
          _driftWarned = true;
          console.warn(TAG, 'STYLE6_TAIL definition drift vs fix475 — 定義を同期してください');
        }
      }
    } catch(e){}
  }

  // ---------- 対象判定 ----------
  //   fix247より内側=URLは書換後(workers.dev/image)にも書換前(gen.pollinations.ai)にもなり得る。
  function isImageGen(url, init){
    try {
      var u = String((url && url.url) || url || '');
      if (u.indexOf('gen.pollinations.ai/v1/images/generations') < 0 &&
          !(/workers\.dev/.test(u) && u.indexOf('/image') >= 0)) return false;
      return !!(init && init.method === 'POST' && typeof init.body === 'string');
    } catch(e){ return false; }
  }

  // ---------- 診断（秘密情報なし・既定OFF） ----------
  function djb2(s){ var h = 5381; s = String(s); for (var i = 0; i < s.length; i++){ h = ((h << 5) + h + s.charCodeAt(i)) | 0; } return (h >>> 0).toString(36); }
  function emitDiag(u, b, info){
    if (!diagOn()) return;
    try {
      var d = (b && b.__diag484) || {};
      var line = {
        provider: (b && b.imgProvider) === 'pollinations' ? 'pollinations' : 'default(together)',
        promptHash: djb2(b && b.prompt),
        canonicalStyleVersion: info.sv,          // null=非art6(不触)
        kind: info.kind, matchedBy: info.matched,
        seed: (b && b.seed != null) ? b.seed : null,
        mode: d.m || null,                        // auto | regen | (fix476経由は下2つ併用)
        pipeline: d.p === 1 ? true : false,
        cand: (d.c != null) ? d.c : null, batch: (d.b != null) ? d.b : null,
        size: (b && b.size) || null,
        dest: /workers\.dev/.test(String(u)) ? 'proxy' : 'direct'
      };
      console.log(TAG + '[diag]', JSON.stringify(line));
    } catch(e){}
  }

  // ---------- fetchラッパ（最内側。fix247がこれを _fetch として捕獲する） ----------
  var _origFetch = W.fetch;
  var wrapped = function(url, init){
    try {
      if (isImageGen(url, init)){
        var b = null;
        try { b = JSON.parse(String(init.body)); } catch(e){ b = null; }
        if (b && typeof b === 'object'){
          checkDrift();                                      // 定義ドリフトの実行時検知(警告のみ)
          var info = { sv: null, kind: null, matched: null, changed: false };
          if (active()) info = normalizeBody(b);            // 正規化（art6確定時のみ・promptのみ）
          emitDiag(url, b, info);                            // 診断（既定OFF）
          var hadDiagTag = (b.__diag484 != null);
          if (hadDiagTag) delete b.__diag484;                // 内部タグは必ず外部送信から除去
          if (info.changed || hadDiagTag){
            init = Object.assign({}, init, { body: JSON.stringify(b) });   // 呼び出し元initは破壊しない
          }
        }
      }
    } catch(e){ try { console.warn(TAG, 'wrap error', e); } catch(_){} }
    return _origFetch.apply(this, [url, init]);
  };
  // own props 全継承（fix419cの教訓: フラグ消し合い＝再ラップ地獄の防止）
  try {
    Object.getOwnPropertyNames(_origFetch).forEach(function(k){
      if (k === 'length' || k === 'name' || k === 'arguments' || k === 'caller' || k === 'prototype') return;
      try { Object.defineProperty(wrapped, k, Object.getOwnPropertyDescriptor(_origFetch, k)); } catch(e){}
    });
    try { Object.defineProperty(wrapped, 'name', { value: (_origFetch && _origFetch.name) || 'fetch', configurable: true }); } catch(e){}
    if (_origFetch && _origFetch.prototype) { try { wrapped.prototype = _origFetch.prototype; } catch(e){} }
  } catch(e){}
  wrapped.__v292Dfix484 = true;
  W.fetch = wrapped;

  // ---------- 検証口 ----------
  W.__v292Dfix484 = {
    __armed: true,
    CANON_VERSION: CANON_VERSION,
    STYLE6_TAIL: STYLE6_TAIL,
    STYLE6_TAIL_CREATURE: STYLE6_TAIL_CREATURE,
    END_TAILS: END_TAILS,
    FRONT_PREFIXES: FRONT_PREFIXES,
    detect: detect,
    canonicalize: canonicalize,
    normalizeBody: normalizeBody,
    isImageGen: isImageGen,
    active: active,
    status: function(){ return { armed: true, active: active(), diag: diagOn(), canon: CANON_VERSION }; }
  };
  try { console.log(TAG, 'armed; active:', active() ? 'on' : 'OFF(kill switch)'); } catch(e){}
})();
