// =====================================================================
// Chronicle TRPG - v292Dfix766: Canonical Appearance v1（外見の構造化ストア）
// PHASE 4E / Icon System slice 1
// ---------------------------------------------------------------------
// ■このfixの立場
//   「同じ人物のアイコンが毎回別人になる」の根治のうち、**外見という事実を1か所に確定させる**係。
//   絵は描かない・プロンプトも組まない（それは fix767）。ここは構造化レコードの生成と保管だけ。
//   物語データ（S.cast / S.turns / roster / chr6_* / v292av2_ / v292avrec_）は **1バイトも書かない**。
//   書くのは自前キー `v292capp_slot_<slotId>` だけ（fix640 と同じ slot scope 作法）。
//
// ■なぜ構造化するのか（実測された構造穴）
//   外見情報は非構造のまま3か所に散っていた:
//     ① S.cast.{hero,npcs[]}.desc … 自由文。性格・生い立ちが外見と混ざっている
//     ② fix307 roster の appr … 120字の自由文（自動抽出）
//     ③ fix461 の英訳キャッシュ … ①②の英訳
//   画像生成のたびにこの自由文を読み直して合成するため、**同じ人物でも合成のたびに違う**。
//   さらに未指定の属性（外見未記入のキャラ）は毎回モデル任せ＝毎回別人。
//   → 「決まっている事実（EXPLICIT）」と「一度決めたら固定する残り（RANDOM_FILL）」を
//      分けて1レコードに固定する。これが Canonical Appearance。
//
// ■v1で意図的にやらないこと（最小構造優先・GPT/DR裁定）
//   ・LLM は呼ばない。抽出は日本語の語彙規則だけ（決定的＝fixtureで固定できる）。
//   ・confidence / evidenceRef は持たない。
//   ・enum はここに書いた分で打ち止め。巨大 taxonomy 化は禁止（QAで不足を実証したときだけ足す）。
//   ・非人間（怪異）は対象外。entityType は 'HUMAN' 固定（v1）。
//
// ■opt-in（既定OFF＝プレビュー規約）
//   実機で動くのは localStorage.v292Dfix766On === '1' のときだけ。
//   OFF のとき ensureFor() は no-op（ストアへ1バイトも書かない）。
//   fixture からは extractExplicit / fillMissing / _store 系を直接呼べるので常に検証できる。
//
// ■公開口
//   window.__v292Dfix766 = { __armed, on, isOff, slotId, KEY,
//     ensureFor, get, rebuildAppearance,
//     extractExplicit, fillMissing, appearanceSeed, rng,
//     ENUMS, BASE_WEIGHTS, assertExplicitPreserved,
//     _load, _save, _reset, _put, _rosterCounts, _resolveName }
// =====================================================================
(function(){
  'use strict';
  var TAG = '[v292Dfix766:canonical-appearance]';

  // ---------- 環境アクセス（読取のみ） ----------
  function getS(){ try{ return window.S || (0,eval)('typeof S!=="undefined"?S:null'); }catch(e){ return null; } }
  function lsg(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function lss(k,v){ try{ localStorage.setItem(k,v); return true; }catch(e){ return false; } }
  function on(){ return lsg('v292Dfix766On') === '1' && lsg('v292Dfix766Off') !== '1'; }
  function isOff(){ return lsg('v292Dfix766Off') === '1'; }

  /* slotId: fix640 と同じ経路（document authority = __chr6Key）。読取のみ。 */
  function slotId(){
    try {
      var k = (typeof window.__chr6Key === 'function') ? window.__chr6Key() : 'chr6';
      k = String(k || 'chr6');
      return k.replace(/^chr6_slot_/, '') || 'chr6';
    } catch(e){ return 'chr6'; }
  }
  function KEY(){ return 'v292capp_slot_' + slotId(); }

  function hash(s){ var h=0; s=String(s); for(var i=0;i<s.length;i++){ h=((h<<5)-h+s.charCodeAt(i))|0; } return Math.abs(h).toString(36); }
  function hash32(s){ var h=2166136261; s=String(s); for(var i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=(h*16777619)>>>0; } return h>>>0; }

  function artStyle(){ try{ var S=getS(); return String((S&&S.cfg&&S.cfg.artStyle)!=null ? S.cfg.artStyle : 0); }catch(e){ return '0'; } }
  function worldStyleVersion(){ return artStyle(); }

  /* 名前解決: fix197 の公開口（canonName → resolveVariant764）。fold形は保存しない。 */
  function resolveName(name){
    var who = String(name==null?'':name).trim();
    if (!who) return '';
    try {
      var f = window.__v292Dfix197;
      if (f && typeof f.canonName === 'function'){ var c = f.canonName(who); if (c) who = String(c).trim() || who; }
      if (f && typeof f.resolveVariant764 === 'function'){ var v = f.resolveVariant764(who); if (v) who = String(v).trim() || who; }
    } catch(e){}
    return who;
  }

  // =====================================================================
  // ENUMS（英語トークン＝promptへ直結できる語。これ以上増やさない）
  // =====================================================================
  var ENUMS = {
    ageBand:            ['CHILD','EARLY_TEENS','LATE_TEENS','TWENTIES','THIRTIES','FORTIES','FIFTIES','SENIOR','ELDERLY'],
    bodyBuild:          ['SLENDER','AVERAGE','STOCKY','MUSCULAR','HEAVYSET','FRAIL'],
    heightImpression:   ['SHORT','AVERAGE','TALL','VERY_TALL'],
    faceShape:          ['ROUND','OVAL','LONG','SQUARE','ANGULAR'],
    hairColor:          ['BLACK','DARK_BROWN','BROWN','GRAY','WHITE','SILVER','RED','BLONDE'],
    hairLength:         ['BALD','VERY_SHORT','SHORT','MEDIUM','SHOULDER','LONG'],
    hairShape:          ['STRAIGHT','WAVY','CURLY','TIED_BACK','BUN','MESSY','THINNING'],
    clothingArchetype:  ['FISHER_WORKWEAR','FARMER_WORKWEAR','OFFICE_WORKER','STUDENT_CASUAL','TRADITIONAL_JAPANESE','SHRINE_PRIEST','MERCHANT','ELEGANT','PLAIN_CASUAL','SHABBY_WORN'],
    clothingCondition:  ['NEAT','WORN','WEATHERED','RAGGED'],
    posture:            ['UPRIGHT','RELAXED','STOOPED','GUARDED'],
    expressionBaseline: ['NEUTRAL','RESERVED','STERN','CHEERFUL','WEARY','GENTLE'],
    silhouette:         ['SMALL_SOFT','AVERAGE','TALL_THIN','BROAD_HEAVY','BENT_SMALL']
  };
  var ATTR_KEYS = ['ageBand','bodyBuild','heightImpression','faceShape','hairColor','hairLength','hairShape',
                   'clothingArchetype','clothingCondition','posture','expressionBaseline','silhouette'];

  /* base weights（controlled random fill の素の分布）。
     ・実在しうる人口分布に寄せる（CHILD/ELDERLY は薄い、TWENTIES〜FIFTIES を厚く）
     ・ただし「全員が同じ」を避けるのが目的なので、極端に尖らせない
     ・全 enum 値に必ず重みを置く（0 は置かない＝どのカテゴリも出うる） */
  var BASE_WEIGHTS = {
    ageBand:            { CHILD:3, EARLY_TEENS:5, LATE_TEENS:8, TWENTIES:14, THIRTIES:14, FORTIES:13, FIFTIES:12, SENIOR:9, ELDERLY:6 },
    bodyBuild:          { SLENDER:20, AVERAGE:24, STOCKY:16, MUSCULAR:13, HEAVYSET:14, FRAIL:9 },
    heightImpression:   { SHORT:24, AVERAGE:34, TALL:26, VERY_TALL:12 },
    faceShape:          { ROUND:20, OVAL:22, LONG:19, SQUARE:19, ANGULAR:18 },
    hairColor:          { BLACK:20, DARK_BROWN:16, BROWN:15, GRAY:12, WHITE:10, SILVER:8, RED:8, BLONDE:9 },
    hairLength:         { BALD:6, VERY_SHORT:14, SHORT:22, MEDIUM:21, SHOULDER:18, LONG:17 },
    hairShape:          { STRAIGHT:20, WAVY:17, CURLY:15, TIED_BACK:16, BUN:12, MESSY:14, THINNING:8 },
    clothingArchetype:  { FISHER_WORKWEAR:10, FARMER_WORKWEAR:10, OFFICE_WORKER:12, STUDENT_CASUAL:10,
                          TRADITIONAL_JAPANESE:11, SHRINE_PRIEST:8, MERCHANT:10, ELEGANT:9, PLAIN_CASUAL:12, SHABBY_WORN:9 },
    clothingCondition:  { NEAT:26, WORN:28, WEATHERED:24, RAGGED:14 },
    posture:            { UPRIGHT:28, RELAXED:28, STOOPED:20, GUARDED:22 },
    expressionBaseline: { NEUTRAL:20, RESERVED:18, STERN:16, CHEERFUL:15, WEARY:15, GENTLE:16 },
    silhouette:         { SMALL_SOFT:20, AVERAGE:24, TALL_THIN:20, BROAD_HEAVY:19, BENT_SMALL:14 }
  };

  // =====================================================================
  // 明示抽出（決定的・LLMなし）
  //   ★原則: 「職業語 → 服装 archetype」だけを正規化する。顔・体格・髪・肌へは波及させない。
  //     （漁師だから日焼け・白髪・痩せ型、という推測を EXPLICIT に立てるのは捏造）
  // =====================================================================
  function ageBandFromYears(y){
    if (y < 13) return 'CHILD';
    if (y < 15) return 'EARLY_TEENS';
    if (y < 20) return 'LATE_TEENS';
    if (y < 30) return 'TWENTIES';
    if (y < 40) return 'THIRTIES';
    if (y < 50) return 'FORTIES';
    if (y < 60) return 'FIFTIES';
    if (y < 75) return 'SENIOR';
    return 'ELDERLY';
  }
  function heightBandFromCm(c){
    if (c <= 155) return 'SHORT';
    if (c <= 175) return 'AVERAGE';
    if (c <= 189) return 'TALL';
    return 'VERY_TALL';
  }

  /* 傷の位置語 → 英語テンプレ（位置が読めなければ 'facial scar'） */
  var SCAR_POS = [
    [/左目|左の目/, 'scar over left eye'],
    [/右目|右の目/, 'scar over right eye'],
    [/左眉/,        'scar through left eyebrow'],
    [/右眉/,        'scar through right eyebrow'],
    [/頬|ほお|ほほ/, 'scar on the cheek'],
    [/額|ひたい|おでこ/, 'scar on the forehead'],
    [/顎|あご/,     'scar on the chin'],
    [/首|喉|のど/,  'scar on the neck'],
    [/手|腕/,       'scar on the hand']
  ];

  /* [正規表現, attrs のキー, 値] の素朴な表。先に書いた規則が勝つ（set-if-absent）。 */
  var RULES = [
    /* ---- ageBand（語彙。数値「歳」は別途・数値が最優先） ---- */
    [/老婆|お婆さん|おばあさん|ばあさん/,           'ageBand', 'ELDERLY'],
    [/老爺|老人|お爺さん|おじいさん|じいさん|翁/,   'ageBand', 'ELDERLY'],
    [/初老/,                                       'ageBand', 'FIFTIES'],
    [/中年/,                                       'ageBand', 'FORTIES'],
    [/青年/,                                       'ageBand', 'TWENTIES'],
    [/高校生/,                                     'ageBand', 'LATE_TEENS'],
    [/中学生/,                                     'ageBand', 'EARLY_TEENS'],
    [/小学生|幼児|幼い子|子供|こども/,              'ageBand', 'CHILD'],
    [/大学生/,                                     'ageBand', 'TWENTIES'],
    [/少年|少女/,                                  'ageBand', 'EARLY_TEENS'],
    /* ---- silhouette（語彙が体型そのものを含むもののみ） ---- */
    [/老婆|お婆さん|おばあさん|腰の曲が|腰が曲が/,  'silhouette', 'BENT_SMALL'],
    /* ---- hairColor（複合語を先に） ---- */
    [/白髪交じり|白髪混じり|ごま塩頭|胡麻塩/,       'hairColor', 'GRAY'],
    [/灰色の髪|グレーヘア/,                        'hairColor', 'GRAY'],
    [/白髪|銀白の髪/,                              'hairColor', 'WHITE'],
    [/銀髪/,                                       'hairColor', 'SILVER'],
    [/黒髪|烏の濡れ羽/,                            'hairColor', 'BLACK'],
    [/焦茶|濃い茶色の髪|ダークブラウン/,            'hairColor', 'DARK_BROWN'],
    [/茶髪|栗色|茶色い髪|ブラウンの髪/,             'hairColor', 'BROWN'],
    [/金髪|ブロンド/,                              'hairColor', 'BLONDE'],
    [/赤髪|赤毛|紅い髪|赤い髪/,                     'hairColor', 'RED'],
    /* ---- hairShape / hairLength（禿げ系は「かけ」を先に） ---- */
    [/禿げかけ|禿げ上が|はげかけ|薄毛|髪が薄/,      'hairShape', 'THINNING'],
    [/丸坊主|スキンヘッド|禿頭|禿げ頭|禿げ|はげ/,   'hairLength', 'BALD'],
    [/坊主頭/,                                     'hairLength', 'VERY_SHORT'],
    [/長髪|ロングヘア|髪が長|長い髪/,               'hairLength', 'LONG'],
    [/肩まで|肩ほど|セミロング/,                    'hairLength', 'SHOULDER'],
    [/短髪|ショートヘア|髪が短|短い髪/,             'hairLength', 'SHORT'],
    [/ポニーテール|後ろで結|束ねた髪|結った髪/,      'hairShape', 'TIED_BACK'],
    [/団子|シニヨン|まとめ髪/,                     'hairShape', 'BUN'],
    [/ボサボサ|ぼさぼさ|乱れた髪|無造作な髪/,        'hairShape', 'MESSY'],
    [/巻き毛|カールした髪|くせ毛|癖毛/,             'hairShape', 'CURLY'],
    [/ウェーブ|波打つ髪/,                          'hairShape', 'WAVY'],
    [/ストレートの髪|真っ直ぐな髪|まっすぐな髪/,     'hairShape', 'STRAIGHT'],
    /* ---- heightImpression（数値 cm は別途・数値が最優先） ---- */
    [/長身|背が高|高身長|大柄/,                    'heightImpression', 'TALL'],
    [/小柄|背が低|低身長/,                         'heightImpression', 'SHORT'],
    /* ---- bodyBuild ---- */
    [/太った|肥満|でっぷり|恰幅|かっぷく|でぶ/,      'bodyBuild', 'HEAVYSET'],
    [/痩せた|痩せ型|やせ型|細身|やせぎす|ほっそり/,  'bodyBuild', 'SLENDER'],
    [/筋肉質|鍛えられた|逞し|たくまし/,             'bodyBuild', 'MUSCULAR'],
    [/がっしり|ずんぐり|骨太|頑健/,                 'bodyBuild', 'STOCKY'],
    [/華奢|虚弱|病弱|やつれ/,                      'bodyBuild', 'FRAIL'],
    /* ---- faceShape ---- */
    [/丸顔/,   'faceShape', 'ROUND'],
    [/面長/,   'faceShape', 'LONG'],
    [/角張った顔|エラの張/, 'faceShape', 'SQUARE'],
    [/彫りの深|鋭い顔立ち/, 'faceShape', 'ANGULAR'],
    [/卵型/,   'faceShape', 'OVAL'],
    /* ---- posture ---- */
    [/猫背/,                       'posture', 'STOOPED'],
    [/背筋の伸び|姿勢がい|姿勢が良/, 'posture', 'UPRIGHT'],
    /* ---- clothingArchetype（★職業語→服装だけ。体格・顔へは波及させない） ---- */
    [/漁師|漁夫/,                   'clothingArchetype', 'FISHER_WORKWEAR'],
    [/農家|農夫|百姓|農民/,          'clothingArchetype', 'FARMER_WORKWEAR'],
    [/神職|神主|宮司|巫女|神官/,      'clothingArchetype', 'SHRINE_PRIEST'],
    [/会社員|サラリーマン|事務員|教師|教員|公務員/, 'clothingArchetype', 'OFFICE_WORKER'],
    [/学生|生徒|高校生|中学生|大学生/, 'clothingArchetype', 'STUDENT_CASUAL'],
    [/商人|店主|商売人|行商/,         'clothingArchetype', 'MERCHANT'],
    [/着物|和服|袴|羽織/,            'clothingArchetype', 'TRADITIONAL_JAPANESE'],
    [/ぼろ|襤褸|みすぼらし|擦り切れ/,  'clothingArchetype', 'SHABBY_WORN'],
    [/派手|華やか|上品|優雅|洒落/,    'clothingArchetype', 'ELEGANT'],
    /* ---- clothingCondition（服そのものの状態語だけ。職業からは引かない） ---- */
    [/ぼろぼろ|襤褸|ずたずた/,        'clothingCondition', 'RAGGED'],
    [/擦り切れ|汚れた服|薄汚れ/,      'clothingCondition', 'RAGGED'],
    [/くたびれた|着古し|使い込まれ/,   'clothingCondition', 'WORN'],
    [/潮風|風雨に|色褪せ|日に焼けた服/, 'clothingCondition', 'WEATHERED'],
    [/きちんとした|清潔|糊のきい|折り目正し/, 'clothingCondition', 'NEAT']
  ];

  /* distinctiveFeatures の語彙（傷は位置つきで別処理） */
  var FEATURE_RULES = [
    [/ほくろ|黒子/,           'mole'],
    [/そばかす|雀斑/,         'freckles'],
    [/眼帯/,                 'eye patch'],
    [/眼鏡|めがね|メガネ/,     'glasses'],
    [/日焼け|よく焼けた|浅黒/, 'sun-tanned skin'],
    [/無精髭|無精ひげ/,       'stubble'],
    [/髭|ひげ|鬚/,            'beard']
  ];

  function mkVal(v, source){ return { value: v, source: source, locked: false }; }

  /**
   * extractExplicit(text, source)
   *   日本語の自由文（cast desc / roster appr）から、**書いてあることだけ** を構造化して返す。
   *   返り値: { attrs: {key:{value,source,locked}}, distinctiveFeatures:[{value,source,locked}] }
   *   source は呼び手が指定する（ユーザーdesc由来='USER_EXPLICIT' / roster appr由来='STORY_EXPLICIT'）。
   */
  function extractExplicit(text, source){
    var src = source || 'STORY_EXPLICIT';
    var out = { attrs: {}, distinctiveFeatures: [] };
    var t = String(text==null?'':text);
    if (!t) return out;
    function setIfAbsent(k, v){ if (!out.attrs[k]) out.attrs[k] = mkVal(v, src); }

    /* 数値は語彙より強い（「65歳の老人」は SENIOR、「190cmの長身」は VERY_TALL） */
    var mAge = t.match(/(\d{1,3})\s*(?:歳|才)/);
    if (mAge){ var y = parseInt(mAge[1],10); if (y>=0 && y<=130) setIfAbsent('ageBand', ageBandFromYears(y)); }
    var mCm = t.match(/(\d{2,3})\s*(?:cm|ｃｍ|センチ)/i);
    if (mCm){ var c = parseInt(mCm[1],10); if (c>=100 && c<=250) setIfAbsent('heightImpression', heightBandFromCm(c)); }
    /* 「〜代」（40代 など） */
    var mDec = t.match(/(\d{1,2})\s*代/);
    if (mDec){ var d = parseInt(mDec[1],10); if (d>=10 && d<=90) setIfAbsent('ageBand', ageBandFromYears(d + 5)); }

    for (var i=0; i<RULES.length; i++){
      if (RULES[i][0].test(t)) setIfAbsent(RULES[i][1], RULES[i][2]);
    }

    /* 傷: 最初の出現位置の前後8字から位置語を読む。読めなければ 'facial scar' */
    var mScar = t.match(/刀傷|傷跡|傷痕|傷/);
    if (mScar){
      var idx = t.indexOf(mScar[0]);
      var win = t.slice(Math.max(0, idx-8), idx + mScar[0].length + 8);
      var label = 'facial scar';
      for (var s=0; s<SCAR_POS.length; s++){ if (SCAR_POS[s][0].test(win)){ label = SCAR_POS[s][1]; break; } }
      out.distinctiveFeatures.push({ value: label, source: src, locked: false });
    }
    for (var f=0; f<FEATURE_RULES.length; f++){
      if (FEATURE_RULES[f][0].test(t)){
        var v = FEATURE_RULES[f][1];
        var dup = false;
        for (var q=0; q<out.distinctiveFeatures.length; q++){ if (out.distinctiveFeatures[q].value === v){ dup = true; break; } }
        if (!dup) out.distinctiveFeatures.push({ value: v, source: src, locked: false });
      }
    }
    return out;
  }

  // =====================================================================
  // 決定的 PRNG（appearanceSeed から）
  // =====================================================================
  /* appearanceSeed = hash(entityKey + ':' + appearanceRevision + ':' + worldStyleVersion)
     同じ人物・同じ revision・同じ画風なら必ず同じ値（決定的）。 */
  function appearanceSeed(entityKey, appearanceRevision, wsv){
    var w = (wsv == null) ? worldStyleVersion() : String(wsv);
    return hash32(String(entityKey) + ':' + String(appearanceRevision==null?1:appearanceRevision) + ':' + w);
  }
  /* xorshift32。seed が 0 になると縮退するので 1 へ寄せる。 */
  function rng(seed){
    var x = (seed >>> 0) || 1;
    return function(){
      x ^= x << 13; x >>>= 0;
      x ^= x >>> 17;
      x ^= x << 5;  x >>>= 0;
      return x / 4294967296;
    };
  }

  // =====================================================================
  // controlled random fill
  // =====================================================================
  /* rosterCounts: { attrKey: { value: count } }。同じ値が既に多いほど重みを下げる。
     penalty = 1 / (1 + 0.35 * frequency) */
  function pickWeighted(key, counts, r, excluded){
    var w = BASE_WEIGHTS[key] || {};
    var vals = ENUMS[key] || [];
    var acc = [], total = 0;
    for (var i=0; i<vals.length; i++){
      var v = vals[i];
      if (excluded && excluded[v]){ acc.push(total); continue; }
      var base = (w[v] != null) ? w[v] : 1;
      var freq = (counts && counts[key] && counts[key][v]) ? counts[key][v] : 0;
      var eff = base / (1 + 0.35 * freq);
      total += eff; acc.push(total);
    }
    if (!(total > 0)) return vals[0];
    var t = r() * total;
    for (var j=0; j<acc.length; j++){ if (t < acc[j]) return vals[j]; }
    return vals[vals.length-1];
  }

  /**
   * fillMissing(record, rosterCounts, rngFn)
   *   未設定の attrs だけを埋める（source='RANDOM_FILL', locked=false）。
   *   ★ locked、および source が RANDOM_FILL 以外の既存値は絶対に触らない。
   *   record を破壊的に更新して返す（呼び手が保存する）。
   */
  /* 抽選から外すべき値（明示された事実と矛盾する組み合わせだけ・最小限）。
     例: 「赤髪」と明示されているのに hairLength を BALD で引くと、
         prompt から 'red hair' が消えて **明示が実質失われる**。矛盾の抑止は fill 側で行う。 */
  function exclusionsFor(record, key){
    var a = record.attrs || {};
    function explicit(k){ var x=a[k]; return !!(x && x.value && x.source && x.source !== 'RANDOM_FILL'); }
    if (key === 'hairLength'){
      if (explicit('hairColor')) return { BALD: 1 };
      if (explicit('hairShape') && a.hairShape.value === 'THINNING') return { BALD: 1 };
    }
    return null;
  }

  function fillMissing(record, rosterCounts, rngFn){
    if (!record) return record;
    if (!record.attrs) record.attrs = {};
    var r = rngFn || rng(appearanceSeed(record.entityKey || '', record.appearanceRevision || 1));
    for (var i=0; i<ATTR_KEYS.length; i++){
      var k = ATTR_KEYS[i];
      var cur = record.attrs[k];
      if (cur && cur.locked) continue;                                   // locked は不触
      if (cur && cur.source && cur.source !== 'RANDOM_FILL') continue;    // EXPLICIT は不触
      if (cur && cur.value) continue;                                    // 既に埋まっている RANDOM_FILL も保持
      record.attrs[k] = { value: pickWeighted(k, rosterCounts, r, exclusionsFor(record, k)), source: 'RANDOM_FILL', locked: false };
    }
    return record;
  }

  /**
   * assertExplicitPreserved(seedAttrs, record)
   *   「ユーザー/物語が明示した外見が、fill や rebuild で書き換えられていないこと」の検査。
   *   返り値 { ok:boolean, violations:[{key,expected,actual,actualSource}] }
   */
  function assertExplicitPreserved(seedAttrs, record){
    var viol = [];
    var sa = seedAttrs || {};
    var ra = (record && record.attrs) || {};
    for (var k in sa){
      if (!Object.prototype.hasOwnProperty.call(sa, k)) continue;
      var want = sa[k] && sa[k].value != null ? sa[k].value : sa[k];
      var got = ra[k];
      if (!got || got.value !== want || got.source === 'RANDOM_FILL'){
        viol.push({ key: k, expected: want, actual: got ? got.value : null, actualSource: got ? got.source : null });
      }
    }
    return { ok: viol.length === 0, violations: viol };
  }

  // =====================================================================
  // ストア（自前キーのみ）
  // =====================================================================
  function blank(){ return { version: 1, entities: {} }; }
  function _load(){
    try {
      var o = JSON.parse(lsg(KEY()) || 'null');
      if (!o || o.version !== 1 || !o.entities) return blank();
      return o;
    } catch(e){ return blank(); }
  }
  function _save(o){ try { return lss(KEY(), JSON.stringify(o)); } catch(e){ return false; } }
  function _reset(){ try { localStorage.removeItem(KEY()); } catch(e){} }
  function _put(name, record){
    var who = resolveName(name); if (!who) return null;
    var st = _load(); st.entities[who] = record; _save(st); return record;
  }
  function get(name){
    var who = resolveName(name); if (!who) return null;
    var st = _load();
    return Object.prototype.hasOwnProperty.call(st.entities, who) ? st.entities[who] : null;
  }

  /* 既に保存済みの他キャラの分布（多様性ペナルティの材料） */
  function _rosterCounts(exceptKey){
    var counts = {};
    try {
      var st = _load();
      for (var who in st.entities){
        if (!Object.prototype.hasOwnProperty.call(st.entities, who)) continue;
        if (who === exceptKey) continue;
        var a = st.entities[who] && st.entities[who].attrs; if (!a) continue;
        for (var k in a){
          if (!Object.prototype.hasOwnProperty.call(a, k)) continue;
          var v = a[k] && a[k].value; if (!v) continue;
          if (!counts[k]) counts[k] = {};
          counts[k][v] = (counts[k][v] || 0) + 1;
        }
      }
    } catch(e){}
    return counts;
  }

  // ---------- 素材収集（読取のみ） ----------
  function castDescOf(name){
    try {
      var S = getS(); if (!S || !S.cast) return '';
      if (S.cast.hero && S.cast.hero.name === name) return String(S.cast.hero.desc || '');
      var ns = S.cast.npcs || [];
      for (var i=0;i<ns.length;i++){ if (ns[i] && ns[i].name === name) return String(ns[i].desc || ''); }
    } catch(e){}
    return '';
  }
  function rosterApprOf(name){
    try {
      var ro = (window.__v292Dfix307api && window.__v292Dfix307api.loadRoster && window.__v292Dfix307api.loadRoster()) || [];
      for (var i=0;i<ro.length;i++){ if (ro[i] && ro[i].handle === name) return String(ro[i].appr || ''); }
    } catch(e){}
    return '';
  }

  /**
   * buildRecord(entityKey, userText, storyText, counts)
   *   ①ユーザー desc（USER_EXPLICIT）→ ②roster appr（STORY_EXPLICIT）の順に明示抽出し、
   *   残りを controlled random fill で埋める。fixture から直接呼べる純関数。
   */
  function buildRecord(entityKey, userText, storyText, counts){
    var rec = {
      schemaVersion: 1,
      entityType: 'HUMAN',
      entityKey: entityKey,
      appearanceRevision: 1,
      attrs: {},
      distinctiveFeatures: [],
      hardConstraints: [],
      updatedAt: 0
    };
    var seen = {};
    function merge(ex){
      for (var k in ex.attrs){
        if (!Object.prototype.hasOwnProperty.call(ex.attrs, k)) continue;
        if (!rec.attrs[k]) rec.attrs[k] = ex.attrs[k];
      }
      for (var i=0;i<ex.distinctiveFeatures.length;i++){
        var f = ex.distinctiveFeatures[i];
        if (seen[f.value]) continue;
        seen[f.value] = 1; rec.distinctiveFeatures.push(f);
      }
    }
    merge(extractExplicit(userText, 'USER_EXPLICIT'));
    merge(extractExplicit(storyText, 'STORY_EXPLICIT'));
    fillMissing(rec, counts, rng(appearanceSeed(entityKey, 1)));
    rec.updatedAt = nowMs();
    return rec;
  }
  function nowMs(){ try{ return Date.now(); }catch(e){ return 0; } }

  /**
   * ensureFor(name)
   *   On のときだけ動く。record が既にあれば **再抽出しない**（外見は一度決めたら固定）。
   *   OFF/未解決名なら null を返し、ストアへは1バイトも書かない。
   */
  function ensureFor(name){
    if (!on()) return null;
    var who = resolveName(name); if (!who) return null;
    var ex = get(who); if (ex) return ex;
    var rec = buildRecord(who, castDescOf(who), rosterApprOf(who), _rosterCounts(who));
    _put(who, rec);
    return rec;
  }

  /**
   * rebuildAppearance(name)
   *   「この人の“決めていない部分”だけ引き直す」。
   *   USER/STORY_EXPLICIT と locked は維持し、RANDOM_FILL だけ捨てて revision++ で引き直す。
   *   （明示↻＝同一外見の別サンプリングは fix767.bumpVariant の役目。こちらは別物）
   */
  function rebuildAppearance(name){
    var who = resolveName(name); if (!who) return null;
    var rec = get(who); if (!rec) return null;
    var kept = {};
    for (var k in rec.attrs){
      if (!Object.prototype.hasOwnProperty.call(rec.attrs, k)) continue;
      var a = rec.attrs[k];
      if (a && (a.locked || (a.source && a.source !== 'RANDOM_FILL'))) kept[k] = a;
    }
    rec.attrs = kept;
    rec.appearanceRevision = (rec.appearanceRevision || 1) + 1;
    fillMissing(rec, _rosterCounts(who), rng(appearanceSeed(who, rec.appearanceRevision)));
    rec.updatedAt = nowMs();
    _put(who, rec);
    return rec;
  }

  window.__v292Dfix766 = {
    __armed: true,
    on: on, isOff: isOff, slotId: slotId, KEY: KEY,
    ensureFor: ensureFor, get: get, rebuildAppearance: rebuildAppearance,
    extractExplicit: extractExplicit, fillMissing: fillMissing, buildRecord: buildRecord,
    appearanceSeed: appearanceSeed, rng: rng, hash32: hash32,
    ENUMS: ENUMS, ATTR_KEYS: ATTR_KEYS, BASE_WEIGHTS: BASE_WEIGHTS,
    assertExplicitPreserved: assertExplicitPreserved,
    worldStyleVersion: worldStyleVersion,
    _load: _load, _save: _save, _reset: _reset, _put: _put,
    _rosterCounts: _rosterCounts, _resolveName: resolveName
  };
  try { console.log(TAG, 'loaded (on=' + (on() ? '1' : '0') + ', key=' + KEY() + ')'); } catch(e){}
})();
