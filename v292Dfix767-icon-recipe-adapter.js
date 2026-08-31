// =====================================================================
// Chronicle TRPG - v292Dfix767: IconRecipe v1 + Provider Adapter
// PHASE 4E / Icon System slice 1（fix766 の相棒）
// ---------------------------------------------------------------------
// ■このfixの立場
//   fix766 が確定させた **外見レコード** を、画像プロバイダへ渡せる形（prompt / seed）へ
//   翻訳するだけの層。外見を決めない・保存もしない（決めるのは fix766）。
//   物語データ（S.cast / roster / chr6_* / v292av2_ / v292avrec_）は **1バイトも書かない**。
//   書くのは自前キー `v292cvar_<pk>`（variantIndex）と `v292cgen_<pk>`（直近3件の生成台帳）だけ。
//
// ■なぜ Recipe を挟むのか
//   従来は「自由文 → fetch」が直結で、プロバイダ都合（prompt文字列の形・seed の作り方）が
//   外見の決定に混ざっていた。間に Recipe を1枚置くと:
//     ・外見（fix766）／構図（framing）／画風（fix484 が fetch 層で最終決定）／サンプリング（seed）
//       の4つが分離され、どれを変えると何が変わるかが1対1になる
//     ・「同じ見た目のまま別の絵が欲しい」（= variantIndex++）が **初めて表現できる**
//       （従来の明示↻は fix197:344 で seed をランダム化するだけなので、外見ごと変わっていた）
//
// ■画風は入れない（重要）
//   prompt に style トークンを **一切足さない**。画風の最終権威は fetch 層の fix484（style-canon）で、
//   ここで足すと二重付与・剥がし漏れになる（fix480 の事故と同型）。
//
// ■mustNot / negative について（v1では送信しない）
//   現行 provider（Worker /image → gen.pollinations.ai /v1/images/generations）は
//   negative prompt を受け取らない。否定形を prompt 本文へ書くと逆に対象語が強調される。
//   よって v1 では hardConstraints の否定側は **送信せず**、QA 検査でのみ使う。
//   肯定形への変換（「眼鏡なし」→「素顔」等）は次スライスの課題。
//
// ■公開口
//   window.__v292Dfix767 = { __armed, buildRecipe, toProviderBody, promptFor,
//     bumpVariant, variantOf, recordGeneration, generationsOf, FRAMING, WORDS, RECIPE_VERSION }
// =====================================================================
(function(){
  'use strict';
  var TAG = '[v292Dfix767:icon-recipe]';
  var RECIPE_VERSION = 1;
  var VAR_PREFIX = 'v292cvar_';
  var GEN_PREFIX = 'v292cgen_';
  var GEN_RING   = 3;

  function getS(){ try{ return window.S || (0,eval)('typeof S!=="undefined"?S:null'); }catch(e){ return null; } }
  function lsg(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function lss(k,v){ try{ localStorage.setItem(k,v); return true; }catch(e){ return false; } }
  function f766(){ try{ var f=window.__v292Dfix766; return (f && f.__armed) ? f : null; }catch(e){ return null; } }
  function f197(){ try{ var f=window.__v292Dfix197; return f || null; }catch(e){ return null; } }

  function hash32(s){ var h=2166136261; s=String(s); for(var i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=(h*16777619)>>>0; } return h>>>0; }
  function artStyleId(){ try{ var S=getS(); return String((S&&S.cfg&&S.cfg.artStyle)!=null ? S.cfg.artStyle : 0); }catch(e){ return '0'; } }

  /* pk は fix197 の keyFor（＝ v292avrec_ / v292av2_ と同じ鍵）。keyFor の形は1バイトも変えない。 */
  function pkOf(name){
    try { var f = f197(); if (f && typeof f.keyFor === 'function') return f.keyFor(name); } catch(e){}
    return 'n' + hash32(String(name) + '|' + artStyleId()).toString(36);   // fix197 不在時のみのフォールバック
  }
  function resolveName(name){
    var f = f766();
    if (f && typeof f._resolveName === 'function'){ try { return f._resolveName(name); } catch(e){} }
    return String(name==null?'':name).trim();
  }

  // ---------- framing（v1は固定値。構図を毎回ぶらさないための固定） ----------
  var FRAMING = { shot: 'BUST_PORTRAIT', camera: 'FRONT_THREE_QUARTER', background: 'SIMPLE' };

  // ---------- enum → 英語表現（prompt に直結する語。EXPLICIT なトークンはこの表を通って必ず本文に出る） ----------
  var WORDS = {
    /* ageBand は「〜の人物」という名詞句そのもの（prompt を英語として読める形に保つ） */
    ageBand: {
      CHILD:'a young child', EARLY_TEENS:'an early teenager', LATE_TEENS:'a late teenager',
      TWENTIES:'a person in their twenties', THIRTIES:'a person in their thirties',
      FORTIES:'a person in their forties', FIFTIES:'a person in their fifties',
      SENIOR:'a person in their late sixties', ELDERLY:'an elderly person'
    },
    bodyBuild: { SLENDER:'slender', AVERAGE:'average', STOCKY:'stocky', MUSCULAR:'muscular', HEAVYSET:'heavyset', FRAIL:'frail' },
    heightImpression: { SHORT:'short', AVERAGE:'average height', TALL:'tall', VERY_TALL:'very tall' },
    faceShape: { ROUND:'round', OVAL:'oval', LONG:'long', SQUARE:'square', ANGULAR:'angular' },
    hairColor: { BLACK:'black', DARK_BROWN:'dark brown', BROWN:'brown', GRAY:'gray', WHITE:'white', SILVER:'silver', RED:'red', BLONDE:'blonde' },
    hairLength: { BALD:'bald', VERY_SHORT:'very short', SHORT:'short', MEDIUM:'medium length', SHOULDER:'shoulder length', LONG:'long' },
    hairShape: { STRAIGHT:'straight', WAVY:'wavy', CURLY:'curly', TIED_BACK:'tied back', BUN:'in a bun', MESSY:'messy', THINNING:'thinning' },
    clothingArchetype: {
      FISHER_WORKWEAR:"fisherman's work clothes", FARMER_WORKWEAR:"farmer's work clothes",
      OFFICE_WORKER:'plain office clothes', STUDENT_CASUAL:'casual student clothes',
      TRADITIONAL_JAPANESE:'traditional japanese clothes', SHRINE_PRIEST:'shinto priest robes',
      MERCHANT:"merchant's clothes", ELEGANT:'elegant clothes', PLAIN_CASUAL:'plain casual clothes',
      SHABBY_WORN:'shabby worn clothes'
    },
    clothingCondition: { NEAT:'neat', WORN:'worn', WEATHERED:'weathered', RAGGED:'ragged' },
    posture: { UPRIGHT:'upright', RELAXED:'relaxed', STOOPED:'stooped', GUARDED:'guarded' },
    expressionBaseline: { NEUTRAL:'neutral', RESERVED:'reserved', STERN:'stern', CHEERFUL:'cheerful', WEARY:'weary', GENTLE:'gentle' },
    silhouette: { SMALL_SOFT:'small soft', AVERAGE:'average', TALL_THIN:'tall thin', BROAD_HEAVY:'broad heavy', BENT_SMALL:'bent small' },
    framing: {
      BUST_PORTRAIT:'bust portrait, head and shoulders',
      FRONT_THREE_QUARTER:'three-quarter view facing the viewer',
      SIMPLE:'simple plain background'
    }
  };

  function genderOf(name){
    try {
      var S = getS(); if (!S || !S.cast) return '';
      if (S.cast.hero && S.cast.hero.name === name) return String(S.cast.hero.gender || '');
      var ns = S.cast.npcs || [];
      for (var i=0;i<ns.length;i++){ if (ns[i] && ns[i].name === name) return String(ns[i].gender || ''); }
    } catch(e){}
    return '';
  }

  // ---------- variantIndex（= 同じ外見のまま別サンプリング） ----------
  function variantOf(name){
    var pk = pkOf(name);
    var v = parseInt(lsg(VAR_PREFIX + pk) || '0', 10);
    return (isFinite(v) && v >= 0) ? v : 0;
  }
  function bumpVariant(name){
    var pk = pkOf(name);
    var v = variantOf(name) + 1;
    lss(VAR_PREFIX + pk, String(v));
    return v;
  }

  // ---------- GenerationRecord（直近3件 ring） ----------
  function generationsOf(pk){
    try { var a = JSON.parse(lsg(GEN_PREFIX + pk) || 'null'); return (a && a.length != null) ? a : []; }
    catch(e){ return []; }
  }
  function recordGeneration(pk, info){
    if (!pk || !info) return null;
    var arr = generationsOf(pk);
    arr.unshift({
      at: (function(){ try{ return Date.now(); }catch(e){ return 0; } })(),
      providerSeed: info.providerSeed,
      variantIndex: info.variantIndex,
      appearanceRevision: info.appearanceRevision,
      recipeVersion: info.recipeVersion || RECIPE_VERSION
    });
    while (arr.length > GEN_RING) arr.pop();
    lss(GEN_PREFIX + pk, JSON.stringify(arr));
    return arr;
  }

  // ---------- Recipe ----------
  /**
   * buildRecipe(name) → recipe | null
   *   fix766 に record が無ければ null（呼び手は従来経路へ落ちる）。
   */
  function buildRecipe(name){
    var f = f766(); if (!f) return null;
    var who = resolveName(name); if (!who) return null;
    var rec = null; try { rec = f.get(who); } catch(e){ return null; }
    if (!rec || !rec.attrs) return null;
    var revision = rec.appearanceRevision || 1;
    var aseed;
    try { aseed = f.appearanceSeed(who, revision, artStyleId()); } catch(e){ aseed = hash32(who + ':' + revision + ':' + artStyleId()); }
    return {
      recipeVersion: RECIPE_VERSION,
      entityKey: who,
      entityType: rec.entityType || 'HUMAN',
      appearanceRevision: revision,
      gender: genderOf(who),
      attrs: rec.attrs,
      distinctiveFeatures: rec.distinctiveFeatures || [],
      hardConstraints: rec.hardConstraints || [],
      framing: { shot: FRAMING.shot, camera: FRAMING.camera, background: FRAMING.background },
      artStyleId: artStyleId(),
      sampling: { appearanceSeed: aseed, variantIndex: variantOf(who) }
    };
  }

  function w(kind, v){ var m = WORDS[kind] || {}; return (v && m[v]) ? m[v] : ''; }
  function av(recipe, k){ var a = recipe.attrs && recipe.attrs[k]; return (a && a.value) ? a.value : ''; }

  /**
   * toProviderBody(recipe) → { prompt, seed }
   *   ★返すのは prompt と seed だけ。model / size / n など既存 genOne の既定は触らない。
   *   ★style トークンは足さない（fix484 が fetch 層で最終決定する）。
   */
  function toProviderBody(recipe){
    if (!recipe) return null;
    var g = recipe.gender === '男性' ? 'male' : (recipe.gender === '女性' ? 'female' : '');
    var parts = [];

    /* ① 誰か（性別＋年齢） */
    var head = (g ? g + ' ' : '') + 'portrait';
    var age = w('ageBand', av(recipe,'ageBand'));
    parts.push(age ? (head + ' of ' + age) : head);

    /* ② 体（身長印象＋体格＋シルエット） */
    var h = w('heightImpression', av(recipe,'heightImpression'));
    var b = w('bodyBuild', av(recipe,'bodyBuild'));
    if (h || b) parts.push([h, b, 'build'].filter(Boolean).join(' '));
    var si = w('silhouette', av(recipe,'silhouette'));
    if (si) parts.push(si + ' silhouette');

    /* ③ 顔 */
    var fs = w('faceShape', av(recipe,'faceShape'));
    if (fs) parts.push(fs + ' face');

    /* ④ 髪（★「<色> hair」が必ず連続するように色を hair の直前へ置く） */
    var hl = w('hairLength', av(recipe,'hairLength'));
    var hs = w('hairShape', av(recipe,'hairShape'));
    var hc = w('hairColor', av(recipe,'hairColor'));
    if (av(recipe,'hairLength') === 'BALD') parts.push('bald');
    else {
      var hair = [hl, hs, hc].filter(Boolean).join(' ');
      if (hair) parts.push(hair + ' hair');
    }

    /* ⑤ 服 */
    var ca = w('clothingArchetype', av(recipe,'clothingArchetype'));
    var cc = w('clothingCondition', av(recipe,'clothingCondition'));
    if (ca) parts.push('wearing ' + (cc ? cc + ' ' : '') + ca);

    /* ⑥ 姿勢・表情 */
    var po = w('posture', av(recipe,'posture'));
    if (po) parts.push(po + ' posture');
    var ex = w('expressionBaseline', av(recipe,'expressionBaseline'));
    if (ex) parts.push(ex + ' expression');

    /* ⑦ 目印（EXPLICIT な傷・ほくろ等はここで必ず本文に出る） */
    var df = recipe.distinctiveFeatures || [];
    for (var i=0;i<df.length;i++){ var v = df[i] && df[i].value; if (v) parts.push(String(v)); }

    /* ⑧ hardConstraints は肯定形のものだけ本文へ（否定形は送らない＝上のヘッダ参照） */
    var hcs = recipe.hardConstraints || [];
    for (var j=0;j<hcs.length;j++){
      var c = hcs[j]; var cv = (c && c.value != null) ? c.value : c;
      if (cv && String(cv).indexOf('no ') !== 0) parts.push(String(cv));
    }

    /* ⑨ 構図（画風ではない＝fix484 の管轄外） */
    parts.push(w('framing', recipe.framing && recipe.framing.shot));
    parts.push(w('framing', recipe.framing && recipe.framing.camera));
    parts.push(w('framing', recipe.framing && recipe.framing.background));

    var prompt = parts.filter(function(x){ return !!x; }).join(', ');
    var seed = hash32(String(recipe.sampling.appearanceSeed) + ':' + String(recipe.sampling.variantIndex)) >>> 0;
    if (seed === 0) seed = 1;   // provider へ 0 を渡さない（正整数を保証）
    return { prompt: prompt, seed: seed };
  }

  /** promptFor(name) → prompt文字列 | null（record が無ければ null＝呼び手は従来経路へ） */
  function promptFor(name){
    var r = buildRecipe(name); if (!r) return null;
    var b = toProviderBody(r); if (!b || !b.prompt) return null;
    return b.prompt;
  }

  window.__v292Dfix767 = {
    __armed: true,
    RECIPE_VERSION: RECIPE_VERSION,
    FRAMING: FRAMING, WORDS: WORDS,
    buildRecipe: buildRecipe, toProviderBody: toProviderBody, promptFor: promptFor,
    bumpVariant: bumpVariant, variantOf: variantOf,
    recordGeneration: recordGeneration, generationsOf: generationsOf,
    pkOf: pkOf, hash32: hash32
  };
  try { console.log(TAG, 'loaded (recipeVersion=' + RECIPE_VERSION + ')'); } catch(e){}
})();
