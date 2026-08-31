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
// ■fix769(2026-08-31 / PHASE 4E slice 2): Global Art Style contract = **anime-first 語順**
//   ・真因: slice 1 の prompt は "…portrait of a person in their forties, …" という
//     **写真キャプション調の主語句で始まっていた**。この先頭句が、fetch 層で末尾に付く
//     STYLE6_TAIL（画風）より強く効き、出力が写実へ倒れた（＝画風指定が負ける）。
//     結果 fix476 の Worker VLM 検品（hard 項目に anime_style）が写実を正しく弾いて全滅→合成502。
//   ・対処: 主語句そのものを画風で始める。
//       `dark fantasy anime character portrait of one <年代> <性別名詞>, 2d anime illustration, …`
//     ライブ実測で検品 score103 PASS・旧 Chronicle 系 2D アニメ出力に復帰することを確認した。
//   ・GPT 裁定: 旧 Chronicle 画風（2D アニメ）が正式ターゲット。写実は不採用。
//   ・art6 のときは fix484 の canonical STYLE6_TAIL を **live 参照で** 末尾に1回だけ付ける
//     （文字列は自前に複製しない＝二重管理事故 fix480 と同型の再発防止）。
//     このとき framing の 'simple plain background' は出さない（tail の dark shadowy background と
//     矛盾し、検品 desc = prompt − tail を汚すため）。art6 以外は従来どおり（fetch 層 fix338 が処理）。
//   ・kill: localStorage.v292Dfix769Off==='1' → slice 1 の旧語順（tail も付けない）。
//
// ■fix770(2026-08-31 / 同 slice): IDENTITY_REFERENCE（再生成時の同一人物性）
//   ・**再生成のときだけ**、直近に受理された当人のアイコン（Worker 公開 /img URL）を
//     参照画像として渡す: imgProvider:'together' ＋ style420.reference_images:[url]。
//     Worker は together 分岐でのみ reference_images を受理する（実効既定 provider は
//     pollinations で reference は無視される）ため、client 側で provider を明示する。
//   ・初回（当人のキャッシュ画像がまだ無い）は参照無し＝従来どおり。
//   ・参照元は同期ラグで1版古いことがある（既知 caveat）。
//   ・コスト: together FLUX.2-dev は **有料 model**。★fix772 で fix766 が既定ONになったため
//     この経路も既定で生きる。課金が発生するのは **ユーザーが明示↻を押した再生成だけ**
//     （初回生成・自動生成には参照が付かない＝無料経路）。↻1回あたり最大6候補
//     （fix476=3候補×最大2バッチ）が有料生成される。
//   ・kill: localStorage.v292Dfix770Off==='1' → reference 拡張だけ無効（fix769 の語順は残る）。
//
// ■fix773(2026-08-31 / PHASE 4E slice 3A): 「外見を作り直す」UX（API 1個だけ）
//   ・rebuildAndRegen(name): ①fix766.rebuildAppearance（EXPLICIT/locked は不触・RANDOM_FILL だけ
//     引き直し・appearanceRevision++）→ ②**直後の1回だけ reference を使わない**（one-shot）
//     → ③fix197.regenFor(name) を1回だけ呼ぶ。返値 { ok, revision }。全て try/catch。
//   ・なぜ reference を切るのか: 「外見を作り直す」は identity の **再定義** であって
//     「同じ人物の別の絵」ではない。旧 icon を参照させると作り直した外見が旧顔へ引き戻される。
//     以後の「もう一度」(↻) では新しく受理された icon が参照になる（＝新 identity で固定される）。
//   ・one-shot はモジュール内メモリのみ（localStorage を汚さない）。refUrlFor が先頭で消費する。
//   ・「もう一度」(↻) の挙動は不変（appearance 固定・variantIndex++・reference 付き）。
//   ・kill: localStorage.v292Dfix773Off==='1' → rebuildAndRegen は no-op（fix145 のボタンも非表示）。
//
// ■fix776(2026-08-31 / 4E-GEN1): genderOf に **record fallback** を足す（cast 欠落時だけ）
//   ・真因: subjectPhrase の性別は S.cast.{hero,npcs}.gender からしか来ず、cast に載っていない
//     roster 由来キャラ（例:「〜のお婆さん」）は常に g='' → 'elderly person' → 画像が男性へ倒れる
//     （OWNER 実画像で "お婆さん" に髭）。書いてある性別が prompt へ 1バイトも流れていなかった。
//   ・対処: cast に gender が無いときだけ fix766.get(name).attrs.gender を見る。
//     'FEMALE'→'女性' / 'MALE'→'男性' に写して従来の g 判定へ渡すだけ（下流の語順は不変）。
//   ・fix766 側の gender は **明示性別語からしか立たない**（職業・名前・年齢からの推測は禁止）。
//   ・★S.cast への逆書き込みはしない。双方に無ければ従来どおり '' ＝ neutral 'person'。
//   ・kill: localStorage.v292Dfix776Off==='1' → fallback を止め、cast-only の従来動作へ。
//
// ■公開口
//   window.__v292Dfix767 = { __armed, buildRecipe, toProviderBody, promptFor,
//     bumpVariant, variantOf, recordGeneration, generationsOf, FRAMING, WORDS, RECIPE_VERSION,
//     PROMPT_CONTRACT, HEAD_PREFIX, MEDIUM_WORD, SHOT_ANIME, AGE_ADJ, subjectPhrase, refUrlFor,
//     rebuildAndRegen, _skipRefOnce }
// =====================================================================
// ★fix771(2026-08-31): 受入E2Eで refUrlFor が常に '' になる実バグを観測(fix400.urlForの表示優先ラッパが
//   ローカル画像有=再生成時にサーバURLを抑止するため)。参照URLはns+proxyから直接構築へ変更。
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
  function f484(){ try{ var f=window.__v292Dfix484; return (f && f.__armed) ? f : null; }catch(e){ return null; } }
  function f400(){ try{ var f=window.__v292Dfix400; return f || null; }catch(e){ return null; } }
  function off769(){ try{ return localStorage.getItem('v292Dfix769Off')==='1'; }catch(e){ return false; } }
  function off770(){ try{ return localStorage.getItem('v292Dfix770Off')==='1'; }catch(e){ return false; } }
  function off773(){ try{ return localStorage.getItem('v292Dfix773Off')==='1'; }catch(e){ return false; } }

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

  // ---------- fix769: anime-first contract（主語句そのものを画風で始める） ----------
  var PROMPT_CONTRACT = 'anime-first-v1';
  var HEAD_PREFIX = 'dark fantasy anime character portrait of one ';
  /* ★fix774(2026-08-31 / 4E-SV1): reference無し無料生成の画風分散の根治。
     baseline実測(同seed対照6run)で老人・中年男性の4/4がsemi-realistic painterlyへ振れ(OWNER STYLE FAIL)、
     下記3句の挿入で5/5がクリーンな2Dアニメ/VN調へ収束(年齢感・キャラ間差は維持)を実測確認。
     GPT裁定の解決順A(prompt最小強化)のみで達成＝C(検品調整)は不要と裁定(必要最小限)。
     OFF: v292Dfix774Off='1' でこの3句だけ外す(旧fix769語順へ)。 */
  var MEDIUM_WORD_BASE = '2d anime illustration';
  var STYLE_LOCK_774 = 'clean lineart, flat cel shading, hand-drawn japanese visual novel art';
  function off774(){ try { return localStorage.getItem('v292Dfix774Off') === '1'; } catch(e){ return false; } }
  /* ★fix775(2026-08-31 / 4E-SV1最終): OWNER A/B判定(同一seed6キャラ横並び)で「全部B」採用。
     B=描画方法だけ半歩VN寄せの2句。内容(皺・年齢・体格)はKEEP・肌の立体感をフラット化。
     若返り・美形化・同顔化の副作用なしをA/Bで確認済み。OFF: v292Dfix775Off='1'(この2句のみ外す)。 */
  var STYLE_LOCK_775 = 'stylized anime facial proportions, simplified illustrated skin texture';
  function off775(){ try { return localStorage.getItem('v292Dfix775Off') === '1'; } catch(e){ return false; } }
  function MEDIUM_WORD_FN(){
    var s = MEDIUM_WORD_BASE;
    if (!off774()) s += ', ' + STYLE_LOCK_774;
    if (!off775()) s += ', ' + STYLE_LOCK_775;
    return s;
  }
  var MEDIUM_WORD = MEDIUM_WORD_BASE;   /* 公開口の後方互換用(値としては基本語のみ) */
  var SHOT_ANIME  = 'bust shot';
  /* 年代の **形容詞形**（WORDS.ageBand の名詞句は 769Off の旧語順用に温存する）。
     9 バンドが1対1で別語になるようにする＝ageBand が変われば prompt も必ず変わる。 */
  var AGE_ADJ = {
    CHILD:'young', EARLY_TEENS:'young teenage', LATE_TEENS:'teenage',
    TWENTIES:'young adult', THIRTIES:'adult', FORTIES:'middle-aged',
    FIFTIES:'older middle-aged', SENIOR:'aging', ELDERLY:'elderly'
  };
  /* subjectPhrase('ELDERLY','male') → 'elderly man' / ('LATE_TEENS','female') → 'teenage girl' */
  function subjectPhrase(band, g){
    var adj = AGE_ADJ[band] || '', noun;
    if (band === 'CHILD') noun = (g==='male' ? 'boy' : (g==='female' ? 'girl' : 'child'));
    else if (band === 'EARLY_TEENS' || band === 'LATE_TEENS'){
      noun = (g==='male' ? 'boy' : (g==='female' ? 'girl' : 'teenager'));
      if (noun === 'teenager') adj = (band === 'EARLY_TEENS' ? 'young' : 'older');   // 'young teenage teenager' を避ける
    } else noun = (g==='male' ? 'man' : (g==='female' ? 'woman' : 'person'));
    return (adj ? adj + ' ' : '') + noun;
  }
  /* art6 のときだけ fix484 の canonical tail を live 参照で返す（文字列は複製しない）。 */
  function styleTail(){
    if (off769()) return '';
    if (artStyleId() !== '6') return '';
    var f = f484();
    if (!f || typeof f.STYLE6_TAIL !== 'string' || !f.STYLE6_TAIL) return '';
    /* fix484 の kill(v292Dfix484Off='1')が引かれているときは付けない:
       fetch 層の画風正規化を止めた状態で、こちらだけ画風を足すのは筋が悪い。 */
    try { if (typeof f.active === 'function' && !f.active()) return ''; } catch(e){}
    return f.STYLE6_TAIL;
  }

  // ---------- fix770: IDENTITY_REFERENCE（再生成時のみ・有料 model。★fix772 以降は既定で有効） ----------
  var TOGETHER_MODEL = 'black-forest-labs/FLUX.2-dev';   // Worker は ^black-forest-labs/… のみ受理
  var TOGETHER_STEPS = 28;
  /* ★fix773: 「外見を作り直す」直後の1回だけ reference を使わないための one-shot（モジュール内メモリ）。
     localStorage には書かない＝リロードで自然消滅する（作り直しの1発分だけ効けばよい）。 */
  var skipRefOnce = Object.create(null);
  /* refUrlFor(name) → 参照画像URL | ''（'' = 初回 or 参照不能 = 従来どおり reference 無し） */
  function refUrlFor(name){
    try {
      /* ★fix773: one-shot を先頭で消費。あれば '' を返してフラグを削除（次回からは通常どおり参照する）。 */
      try { var pk773 = pkOf(name); if (pk773 && skipRefOnce[pk773]){ delete skipRefOnce[pk773]; return ''; } } catch(e773){}
      if (off770()) return '';
      var f = f197(); if (!f || typeof f.cachedFor !== 'function') return '';
      var cached = f.cachedFor(name) || '';
      if (String(cached).indexOf('data:') !== 0) return '';        // 受理済みアイコンが無い＝初回
      /* ★fix771(2026-08-31 受入実バグ): fix400.urlFor は表示優先ラッパ(ローカル画像有→サーバURL抑止)に
         包まれており、再生成時(=ローカル有)は必ず '' になる。表示用の抑止と参照用URLは別物なので、
         ns + proxy から直接組み立てる（構成要素は fix400 と同じ情報源・重複最小2行） */
      var ns771 = ''; try { ns771 = localStorage.getItem('v292Dfix400_ns') || ''; } catch(e771){}
      if (!ns771) return '';
      var px771 = 'https://novel-proxy.sansan2103.workers.dev';
      try { var pu = (localStorage.getItem('v292ProxyUrl') || '').trim(); if (pu) px771 = pu.replace(/\/+$/, ''); } catch(e772){}
      var url = px771 + '/img?ns=' + encodeURIComponent(ns771) + '&k=' + encodeURIComponent('v292av2_' + pkOf(name));
      return /^https:\/\//.test(url) ? url : '';                   // Worker は https のみ受理
    } catch(e){ return ''; }
  }

  /* ---------- gender（★fix776: cast 欠落時だけ fix766 record を見る） ----------
     ・第一権威は従来どおり S.cast.{hero,npcs}.gender（挙動を1バイトも変えない）。
     ・cast にその名前が無い / あっても gender が空のときだけ、fix766 の
       attrs.gender（**明示性別語からしか立たない**）を 'FEMALE'→'女性' / 'MALE'→'男性' へ移す。
     ・双方に無ければ従来どおり '' を返す（＝subjectPhrase は neutral 'person'）。
     ・★S.cast への逆書き込みは行わない（物語データは読むだけ）。
     ・kill: v292Dfix776Off='1' で fallback ごと従来の cast-only 動作へ戻る。 */
  function castGenderOf(name){
    try {
      var S = getS(); if (!S || !S.cast) return '';
      if (S.cast.hero && S.cast.hero.name === name) return String(S.cast.hero.gender || '');
      var ns = S.cast.npcs || [];
      for (var i=0;i<ns.length;i++){ if (ns[i] && ns[i].name === name) return String(ns[i].gender || ''); }
    } catch(e){}
    return '';
  }
  function off776(){ try { return localStorage.getItem('v292Dfix776Off') === '1'; } catch(e){ return false; } }
  function recordGenderOf(name){
    try {
      if (off776()) return '';
      var f = f766(); if (!f || typeof f.get !== 'function') return '';
      var rec = f.get(name);
      var g = rec && rec.attrs && rec.attrs.gender && rec.attrs.gender.value;
      if (g === 'FEMALE') return '女性';
      if (g === 'MALE')   return '男性';
    } catch(e){}
    return '';
  }
  function genderOf(name){
    var g = castGenderOf(name);
    if (g) return g;                 // cast が持っているならそれが権威（従来どおり）
    return recordGenderOf(name);     // ★fix776: cast 欠落時だけ record 由来（castへは書き戻さない）
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
      recipeVersion: info.recipeVersion || RECIPE_VERSION,
      ref: !!info.ref                                    // ★fix770: 参照画像つきで生成したか
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
   * toProviderBody(recipe) → { prompt, seed } （＋fix770 で参照可能なときだけ imgProvider / style420）
   *   ★model / size / n など既存 genOne の既定は触らない。
   *   ★fix769: art6 かつ fix484 armed のときだけ、fix484 の STYLE6_TAIL を live 参照で末尾に1回付ける。
   *     art6 以外・fix484 不在・769Off では付けない（＝従来どおり fetch 層が最終決定）。
   */
  function toProviderBody(recipe){
    if (!recipe) return null;
    var legacy = off769();                 // kill: slice 1 の旧語順へ
    var tail = legacy ? '' : styleTail();  // '' なら tail 無し（＝従来の framing を使う）
    var g = recipe.gender === '男性' ? 'male' : (recipe.gender === '女性' ? 'female' : '');
    var parts = [];

    /* ① 誰か（★fix769: 画風→主語 の順で始める。写真キャプション調の語で始めない） */
    if (legacy){
      var head = (g ? g + ' ' : '') + 'portrait';
      var age = w('ageBand', av(recipe,'ageBand'));
      parts.push(age ? (head + ' of ' + age) : head);
    } else {
      parts.push(HEAD_PREFIX + subjectPhrase(av(recipe,'ageBand'), g));
      parts.push(MEDIUM_WORD_FN());   /* ★fix774: style lock 3句込み(kill=v292Dfix774Off) */
    }

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

    /* ⑨ 構図。tail を付ける（art6）ときは短い 'bust shot' だけにする:
          'head and shoulders' は tail 側にあり、'simple plain background' は tail の
          dark shadowy background と矛盾して検品 desc を汚すため出さない。
          tail が無いとき（art6 以外 / fix484 不在 / 769Off）は従来の3語のまま。 */
    if (tail){
      parts.push(SHOT_ANIME);
    } else {
      parts.push(w('framing', recipe.framing && recipe.framing.shot));
      parts.push(w('framing', recipe.framing && recipe.framing.camera));
      parts.push(w('framing', recipe.framing && recipe.framing.background));
    }

    var prompt = parts.filter(function(x){ return !!x; }).join(', ');
    if (tail) prompt += ', ' + tail;   // ★末尾に1回だけ（fix484 が fetch 層で剥がして付け直しても冪等）
    var seed = hash32(String(recipe.sampling.appearanceSeed) + ':' + String(recipe.sampling.variantIndex)) >>> 0;
    if (seed === 0) seed = 1;   // provider へ 0 を渡さない（正整数を保証）
    var out = { prompt: prompt, seed: seed };
    /* ★fix770: 受理済みアイコンがあるとき（＝再生成）だけ参照画像を足す。初回は 2 キーのまま。 */
    var ref = refUrlFor(recipe.entityKey);
    if (ref){
      out.imgProvider = 'together';
      out.style420 = { model: TOGETHER_MODEL, steps: TOGETHER_STEPS, reference_images: [ref] };
    }
    return out;
  }

  /**
   * ★fix773: rebuildAndRegen(name) → { ok, revision }
   *   「外見を作り直す」の唯一の API。UI（fix145 のボタン）はこれを呼ぶだけ。
   *   ① fix766.rebuildAppearance: USER_EXPLICIT / STORY_EXPLICIT / locked は不触、
   *      RANDOM_FILL だけ捨てて appearanceRevision++ で引き直す（既存 API・ここでは何も足さない）。
   *   ② この直後の1回だけ reference を使わない（skipRefOnce）。
   *      理由: 作り直し＝identity の再定義であり、旧 icon を参照すると旧顔へ引き戻される。
   *      以後の「もう一度」(↻) は新しく受理された icon が参照になる。
   *   ③ fix197.regenFor(name) を1回だけ呼ぶ（生成キューへ載せるのは fix197 の役目・ここでは生成しない）。
   *   kill(v292Dfix773Off='1') は完全 no-op（rebuildAppearance も呼ばない＝revision も動かさない）。
   */
  function rebuildAndRegen(name){
    var out = { ok: false, revision: 0 };
    try {
      if (off773()) return out;                                  // kill: 何もしない
      var f = f766(); if (!f || typeof f.rebuildAppearance !== 'function') return out;
      var who = resolveName(name); if (!who) return out;
      var rec = null;
      try { rec = f.rebuildAppearance(who); } catch(e1){ return out; }
      if (!rec) return out;                                      // record が無い＝作り直す対象が無い
      out.revision = rec.appearanceRevision || 0;
      try { var pk = pkOf(who); if (pk) skipRefOnce[pk] = 1; } catch(e2){}   // ② regenFor より先に立てる
      try { var f2 = f197(); if (f2 && typeof f2.regenFor === 'function') f2.regenFor(who); } catch(e3){}
      out.ok = true;
    } catch(e){}
    return out;
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
    pkOf: pkOf, hash32: hash32,
    /* ★fix769/fix770 の検証口（読み取り専用の定数と純関数のみ） */
    PROMPT_CONTRACT: PROMPT_CONTRACT, HEAD_PREFIX: HEAD_PREFIX, MEDIUM_WORD: MEDIUM_WORD,
    SHOT_ANIME: SHOT_ANIME, AGE_ADJ: AGE_ADJ, subjectPhrase: subjectPhrase, refUrlFor: refUrlFor,
    /* ★fix773 */
    rebuildAndRegen: rebuildAndRegen,
    /* ★fix776: gender 解決の検証口（読み取りのみ・castへは書き戻さない） */
    genderOf: genderOf, castGenderOf: castGenderOf, recordGenderOf: recordGenderOf,
    _skipRefOnce: function(){ var o = {}; for (var k in skipRefOnce) o[k] = skipRefOnce[k]; return o; }   // 検証口(読み取り)
  };
  try { console.log(TAG, 'loaded (recipeVersion=' + RECIPE_VERSION + ')'); } catch(e){}
})();
