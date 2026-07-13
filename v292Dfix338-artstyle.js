// =====================================================================
// Chronicle TRPG - v292Dfix338: 画風の体系整理 × ジャンル連動 × 画風統一
// ---------------------------------------------------------------------
// 背景(おしん実観察 2026-07-01): おまかせ生成した1キャスト内で画風が混ざる
//   (スピカ/シズクは暗い実写・ゴシックで同系なのにナナだけアニメ調に浮く)。
// DeepResearch(5角度)の結論:
//   ・Fluxは前方トークンを強く重み付け=末尾スタイル語(suffix)は最弱。現行は
//     "外見 + STYLE_SUFFIX" と末尾付与 → 各キャラの外見語に負けて画風が浮く。
//   ・キャラ外見にアニメ示唆語(anime/漫画/cartoon等)が混ざると共通スタイルを
//     上書きしてアニメ側へ引っ張る(SDのassociation effect)。
//   ・Fluxは重み記法もnegative promptも無視 → 効くのは「位置(前方)・中立語・hex」。
// → 本modは画像生成fetchをラップし、最終プロンプトを一箇所で整形:
//     ①旧suffix除去で外見を復元 ②外見からスタイル語を除去 ③画風プレフィックス
//     (hexパレット付)を先頭に前置き。cast/非cast/怪異すべてに効く。
//   さらに画風を4→5種に整理(従来→「ダーク」に改称・「SF」を新規追加)、
//   おまかせのジャンル(現代怪異/DF/SF/人間ドラマ)から既定画風を自動セット(上書き可)。
//
// 全コア不触・fetchラップと後付けDOM/設定のみ。★プレビュー制(既定は無効)。
//   有効化: localStorage v292Dfix338='1'（おしんが検証→良ければ既定化）。
//   これで friends のライブ挙動は既定不変=安全にA/B。
// index.html末尾(fix336の後)で読み込む。avatar生成fetch(fix197)より後でよい
//   (ラップは parse時に設置され、生成ループはDOMContentLoaded後に走るため間に合う)。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix338) return; window.__v292Dfix338 = {};
  var TAG='[v292Dfix338:artstyle]';
  function on(){ try{ return localStorage.getItem('v292Dfix338Off')!=='1'; }catch(e){ return true; } } // v292Dfix356: 既定ON化(画風統一を全員に)
  // v292Dfix396: 闇アニメ(初代)=7 をセレクタから撤去(不安定な@TAIL式)。OFFで復活。
  function off396(){ try{ return localStorage.getItem('v292Dfix396Off')==='1'; }catch(e){ return false; } }
  function curArt(){ try{ var c=getCfg(); return (c&&c.artStyle!=null)?Number(c.artStyle):null; }catch(e){ return null; } }

  function getS(){ try{ return window.S || (0,eval)('S'); }catch(e){ return null; } }
  function getCfg(){ try{ var S=getS(); return (S&&S.cfg)||null; }catch(e){ return null; } }
  function artIdx(){ try{ var c=getCfg(); var v=c&&c.artStyle; return (v==null)?3:(+v); }catch(e){ return 3; } }

  // ------- 5画風(append-only=既存セーブのindex 0-3を保持) -------
  // 0 anime / 1 realistic / 2 watercolor / 3 dark(旧darkfantasy=「従来」) / 4 sf(新)
  var LABELS=['アニメ','写実','水彩','ダーク幻想','SF','半写実アニメ','闇アニメ','闇アニメ(初代)'];
  var STYLE_TITLE='AIアイコンの絵柄。アニメ=明るいセル画 / 写実=暖色の写実画 / 水彩=淡く優しい / ダーク幻想=退色ゴシック(怪異・DF向き) / SF=寒色シネマティック / 半写実アニメ=なめらかな2.5D / 闇アニメ=青白い肌の暗い半実写アニメ。切替で全キャラ作り直し。世界のジャンルから自動で既定が選ばれ、ここでいつでも上書きできます';
  // 人物ポートレート用プレフィックス(前置き=Fluxで最も強い位置・hexでパレット固定)
  var PREFIX=[
    /*anime*/      'High-quality anime illustration, clean cel shading, crisp linework, vibrant saturated palette, head-and-shoulders character portrait, visible clothing',
    /*realistic*/  'Realistic digital painting, soft natural window light, warm muted palette hex #C89B7B hex #6B7A8F, gentle catch-lights, grounded semi-realism, head-and-shoulders character portrait, visible clothing, highly detailed',
    /*watercolor*/ 'Soft watercolor illustration, delicate transparent washes, gentle bleeding edges, pale low-saturation palette hex #D9C9B0 hex #A9B7C6, tender nostalgic mood, head-and-shoulders character portrait, visible clothing',
    /*dark*/       'Dark painterly character portrait, desaturated muted palette hex #2B2B33 hex #6E5A5A, deep shadows and dim moody lighting, pale skin, somber gothic horror atmosphere, dark shadowy background, head-and-shoulders, visible clothing, high quality',
    /*sf*/         'Cinematic science-fiction character portrait, cool teal and cyan palette hex #1B3B4B hex #3FB0C8, rim light with subtle underlight, sleek high-tech materials, dark high-contrast background, head-and-shoulders, visible clothing, highly detailed',
    /*realanime*/  'Soft semi-realistic anime portrait, delicate smooth rendering, pale luminous porcelain skin, fine detailed silky hair, gentle soft shading, natural muted palette, realistic facial features with subtle anime influence, soft diffused lighting, 2.5D, head-and-shoulders character portrait, visible clothing, highly detailed',
    /*darkanime*/  'Dark fantasy anime character portrait, semi-realistic anime rendering, pale porcelain skin, dim moody dramatic lighting, muted desaturated palette hex #262430 hex #4A3A44, dark shadowy background, delicate detailed face, elegant somber gothic atmosphere, head-and-shoulders, visible clothing, high quality',
    /*darkanime-classic v292Dfix349: 旧STYLE_SUFFIX完全再現(@TAIL=外見を先頭・スタイルを末尾に置く旧式)。
      廃校キャストのお気に入りアイコンと同じ式=Flux schnellで同じ画風が出る */
    /*darkanime旧*/ '@TAIL dark fantasy anime character portrait, head and shoulders, visible clothing, detailed face, dim moody lighting, muted desaturated colors, dark shadowy background, pale skin, somber gothic horror atmosphere, high quality'
  ];
  // 人外(怪異/怪物)用=人型強制語を外し、色調・雰囲気だけ継ぐ
  var PREFIX_CREATURE=[
    /*anime*/      'High-quality anime creature concept art, clean detailed rendering, vibrant palette, non-human creature, full creature body visible',
    /*realistic*/  'Realistic creature concept art, cinematic lighting, muted palette hex #6B7A8F, highly detailed, non-human creature, no human face',
    /*watercolor*/ 'Soft watercolor creature illustration, delicate washes, pale palette hex #A9B7C6, ethereal, non-human creature',
    /*dark*/       'Dark creature concept art, desaturated palette hex #2B2B33, deep shadows, dim moody lighting, somber gothic horror atmosphere, non-human creature, monster design, no human face',
    /*sf*/         'Cinematic sci-fi creature concept art, cool teal palette hex #1B3B4B, rim light, biomechanical detail, dark background, non-human creature, no human face',
    /*realanime*/  'Soft semi-realistic creature concept art, delicate smooth detailed rendering, natural muted palette, soft diffused lighting, non-human creature, no human face',
    /*darkanime*/  'Dark fantasy creature concept art, semi-realistic detailed rendering, muted desaturated palette hex #262430, dim moody lighting, dark shadowy background, somber atmosphere, non-human creature, monster design, no human face',
    /*darkanime旧*/ '@TAIL dark fantasy anime creature concept art, full creature body visible, highly detailed, dim moody lighting, muted desaturated colors, dark shadowy background, somber gothic horror atmosphere, high quality, non-human creature, monster design, no human face, no human body'
  ];
  // ===== v292Dfix429(2026-07-12): 絵柄「案C」を既定化 + index6 のラベルを「デフォルト」へ =====
  //   おしん指示: 既定画風(index6=闇アニメ)の中身を「案C」へ差し替え、ライトユーザーに意味が
  //   分かるようラベルも「デフォルト」に改名する。
  //   ★index も配列長も変えない → 既存セーブの cfg.artStyle=6 がそのまま新絵柄になる(データ不触・
  //     fix395/fix374 の既定=6 もそのまま生きる)。
  //   ★旧・闇アニメPREFIXは LEGACY_PREFIX として保持し stripOwnPrefix の剥がし対象に残す
  //     (これをしないと旧プロンプトが剥がれず新PREFIXが二重前置される)。
  //   OFF: localStorage v292Dfix429Off='1' → 旧・闇アニメPREFIX/ラベル/説明文へ復帰(live評価)。
  function off429(){ try{ return localStorage.getItem('v292Dfix429Off')==='1'; }catch(e){ return false; } }
  var ART6_OLD  = PREFIX[6];            // 旧・闇アニメ(人物)
  var ART6C_OLD = PREFIX_CREATURE[6];   // 旧・闇アニメ(人外)
  var LBL6_OLD  = LABELS[6];            // '闇アニメ'
  var TITLE_OLD = STYLE_TITLE;
  // ★fix431(2026-07-12・おしん指示): 背景をやや暗く / 被写体を引き気味に（丸トリミングで顔が潰れない）
  var ART6_V1   = 'Soft semi-realistic anime portrait, clean lineless digital painting, luminous natural skin with subtle blush, large detailed glossy eyes, fine individual hair strands, soft even daylight, gentle pastel color grading, pale neutral desaturated background, calm delicate atmosphere, head-and-shoulders character portrait, visible clothing, highly detailed, high quality';   // fix429版(剥がし対象に残す)
  var ART6_V2   = 'Soft semi-realistic anime portrait, clean lineless digital painting, luminous natural skin with subtle blush, large detailed glossy eyes, fine individual hair strands, soft dim ambient lighting, muted desaturated color grading, dark grey background, calm quiet atmosphere, medium shot, upper body visible from the chest up, subject small in frame with generous headroom and space around, not a close-up, visible clothing, highly detailed, high quality';   // fix431版(剥がし対象に残す)
  // ★fix432(2026-07-12・おしん指示): RPG/ビジュアルノベルのキャラ立ち絵風。斜め向き(三分の四)＋腰上まで＝服が見える。
  var ART6_V3   = 'JRPG character portrait, visual novel style character bust, soft semi-realistic anime rendering, clean lineless digital painting, luminous natural skin, detailed glossy eyes, fine hair strands, soft dim ambient lighting, muted desaturated color grading, dark grey gradient background, three-quarter view with the body turned slightly to the side while facing the viewer, bust shot from the waist up, the full outfit and collar clearly visible, relaxed natural posture, subject small in frame with space around, not a close-up, highly detailed, high quality';   // fix432版(斜め向き・剥がし対象に残す)
  // ★fix433(2026-07-12・おしん指示): 【正面向き】＋暗いムーディな雰囲気（リナのアイコン参照）。斜め向きは撤回。
  var ART6_V4   = 'Dark fantasy anime character portrait, JRPG visual novel character bust, semi-realistic anime rendering, pale porcelain skin, detailed delicate face, quiet unreadable expression, dim moody dramatic lighting with soft shadows on the face, muted desaturated palette, dark shadowy atmospheric background with subtle depth, facing the viewer straight on, front view, symmetrical composition, bust shot from the chest up, the school uniform and collar clearly visible, subject centered with space around, not a close-up, somber gothic atmosphere, highly detailed, high quality';   // fix433版(棒立ち・剥がし対象に残す)
  // ★fix434(2026-07-12・おしん指示「棒立ち感」): 真因=『symmetrical composition』(左右対称)＝証明写真化。
  //   正面は維持したまま、非対称の自然な姿勢・首の傾き・肩の高さ差・生気ある視線で立たせる。
  var ART6_V5   = 'Dark fantasy anime character portrait, JRPG visual novel character bust, semi-realistic anime rendering, pale porcelain skin, detailed delicate face, living expressive gaze that reflects the character personality, dim moody cinematic lighting with soft shadows, muted desaturated palette, dark shadowy atmospheric background with subtle depth, facing the viewer, caught mid-motion in a candid moment, relaxed asymmetric posture with a subtle head tilt and shoulders at slightly different heights, hair and collar with faint natural movement, alive and breathing, never a stiff frontal mugshot, bust shot from the chest up, the school uniform and collar clearly visible, subject centered with space around, not a close-up, somber gothic atmosphere, highly detailed, high quality';   // fix434版(顔が似る・正面固定)
  // ★fix435(2026-07-12・おしん指示): ①正面固定を撤回(向きは自由) ②キャラが似すぎ→真因=『pale porcelain skin, detailed delicate face』が
  //   年齢・体格・肌まで上書きしていた(初老の男が若い男になる実測)。外見文を最優先させる指示に置換。
  var ART6_NEW  = 'Dark fantasy anime character portrait, JRPG visual novel character bust, semi-realistic anime rendering, distinct individual facial features unique to this character, face shape, age, build, skin tone and hair exactly as described, avoid a generic idol face, living expressive gaze that reflects the character personality, dim moody cinematic lighting with soft shadows, muted desaturated palette, dark shadowy atmospheric background with subtle depth, natural body angle chosen to suit the character, may be front facing, slightly turned or three-quarter, caught mid-motion in a candid moment, relaxed asymmetric posture, never a stiff symmetrical mugshot, bust shot from the chest up, the full outfit and collar clearly visible, subject centered with space around, not a close-up, somber gothic atmosphere, highly detailed, high quality';
  // 人外用=案Cの色調・雰囲気を継ぎ、人型強制語(head-and-shoulders / visible clothing)は入れない
  var ART6C_V1  = 'Soft semi-realistic creature concept art, clean lineless digital painting, luminous natural surfaces with subtle sheen, fine individual detail, soft even daylight, gentle pastel color grading, pale neutral desaturated background, calm delicate atmosphere, highly detailed, high quality, non-human creature, monster design, no human face';   // fix429版(剥がし対象に残す)
  var ART6C_V2  = 'Soft semi-realistic creature concept art, clean lineless digital painting, luminous natural surfaces with subtle sheen, fine individual detail, soft dim ambient lighting, muted desaturated color grading, dark grey background, calm quiet atmosphere, medium shot, subject small in frame with generous space around, not a close-up, highly detailed, high quality, non-human creature, monster design, no human face';   // fix431版(剥がし対象に残す)
  var ART6C_V3  = 'JRPG creature concept art, game bestiary portrait, soft semi-realistic rendering, clean lineless digital painting, luminous surfaces with subtle sheen, fine individual detail, soft dim ambient lighting, muted desaturated color grading, dark grey gradient background, three-quarter view angled to the side, upper body bust framing with space around, not a close-up, highly detailed, high quality, non-human creature, monster design, no human face';   // fix432版(剥がし対象に残す)
  var ART6C_V4  = 'Dark fantasy creature concept art, JRPG bestiary portrait, semi-realistic rendering, dim moody dramatic lighting, muted desaturated palette, dark shadowy atmospheric background with subtle depth, facing the viewer straight on, front view, symmetrical composition, upper body bust framing, subject centered with space around, not a close-up, somber gothic atmosphere, highly detailed, high quality, non-human creature, monster design, no human face';   // fix433版(剥がし対象に残す)
  var ART6C_V5  = 'Dark fantasy creature concept art, JRPG bestiary portrait, semi-realistic rendering, dim moody cinematic lighting, muted desaturated palette, dark shadowy atmospheric background with subtle depth, facing the viewer, caught mid-motion in a candid moment, asymmetric living posture, never a stiff symmetrical pose, upper body bust framing, subject centered with space around, not a close-up, somber gothic atmosphere, highly detailed, high quality, non-human creature, monster design, no human face';   // fix434版
  var ART6C_NEW = 'Dark fantasy creature concept art, JRPG bestiary portrait, semi-realistic rendering, distinct silhouette and anatomy unique to this creature, form, size and surface exactly as described, avoid a generic monster shape, dim moody cinematic lighting, muted desaturated palette, dark shadowy atmospheric background with subtle depth, natural angle chosen to suit the creature, caught mid-motion in a candid moment, asymmetric living posture, never a stiff symmetrical pose, upper body bust framing, subject centered with space around, not a close-up, somber gothic atmosphere, highly detailed, high quality, non-human creature, monster design, no human face';
  var LBL6_NEW  = 'デフォルト';
  var TITLE_NEW = TITLE_OLD.replace('闇アニメ=青白い肌の暗い半実写アニメ', 'デフォルト=明るく柔らかい半写実アニメ');
  // 新旧どちらが有効でも、もう片方は「剥がすべき自前PREFIX」として残す(冪等化)
  var LEGACY_PREFIX = [ART6_OLD, ART6C_OLD, ART6_V1, ART6C_V1, ART6_V2, ART6C_V2, ART6_V3, ART6C_V3, ART6_V4, ART6C_V4, ART6_V5, ART6C_V5, ART6_NEW, ART6C_NEW];   // ★fix435   // ★fix434: fix433版(V4)も剥がし対象に追加   // ★fix433: fix432版(V3)も剥がし対象に追加   // ★fix432: fix431版(V2)も剥がし対象に追加   // ★fix431: fix429版(V1)も剥がし対象に追加（二重前置の防止）
  /* ★v292Dfix461(2026-07-13・GPT-5.6監査): スタイル接頭辞を **短くして被写体の後ろへ** 移す。
   *   旧: 長いスタイル文が先頭 → anime/JRPG の若い顔バイアスが人物属性(70代・痩身・皺)を押し潰していた。
   *   新: 被写体（英語の外見文）が先頭、スタイルは末尾（fix349の '@TAIL ' 機構を再利用）。
   *   ・メタ指示（"age ... exactly as described"）は効かないので削除
   *   ・否定（avoid a generic idol face）は肯定形（mature asymmetrical features）へ
   *   OFF: localStorage.v292Dfix461Off='1' で従来（長い接頭辞・先頭）に戻る。 */
  var ART6_TAIL  = '@TAIL Dark fantasy visual-novel illustration, semi-realistic anime rendering, textured mature facial features, individual asymmetrical face, dim cinematic lighting with soft shadows, muted desaturated cold palette, simple dark atmospheric background, chest-up bust with space around, not a close-up, highly detailed, high quality';
  var ART6C_TAIL = '@TAIL Dark fantasy creature concept art, JRPG bestiary portrait, semi-realistic rendering, dim cinematic lighting, muted desaturated palette, dark atmospheric background, upper body framing with space around, not a close-up, highly detailed, high quality, non-human creature, monster design, no human face';
  function off461(){ try { return localStorage.getItem('v292Dfix461Off') === '1'; } catch(e){ return false; } }
  try { LEGACY_PREFIX.push(ART6_TAIL.slice(6), ART6C_TAIL.slice(6)); } catch(e){}   // ★fix461: 二重前置の防止（剥がし対象に追加）

  function apply429(){
    var o = off429();
    PREFIX[6]          = o ? ART6_OLD  : ART6_NEW;
    PREFIX_CREATURE[6] = o ? ART6C_OLD : ART6C_NEW;
    LABELS[6]          = o ? LBL6_OLD  : LBL6_NEW;
    STYLE_TITLE        = o ? TITLE_OLD : TITLE_NEW;
    if (!o && !off461()){          // ★fix461: 被写体先頭・スタイル末尾
      PREFIX[6]          = ART6_TAIL;
      PREFIX_CREATURE[6] = ART6C_TAIL;
    }
    return !o;
  }
  apply429();   // 読み込み時に一度。以後 transformPrompt / patchSelector の入口で毎回 live 再評価する。

  // v292Dfix344: 「見る」(fix315b2)画像=768x512。fix315b2のstyleTailはindex0-3のみ対応で4/5は
  //   default(ダークファンタジー)に落ちる。ここでartStyle 4/5の時だけSEE画像のdarkタグを差し替える。
  var SEE_OLD_DARK='dark fantasy illustration, dim moody lighting, muted desaturated colors, gothic horror atmosphere';
  var SEE_TAIL={ 4:'cinematic science-fiction illustration, cool teal and cyan palette, rim lighting, sleek high-tech materials, dramatic dark atmosphere',
                 5:'soft semi-realistic anime illustration, delicate smooth rendering, pale luminous skin, natural muted palette, soft diffused lighting, 2.5D, highly detailed',
                 6:'dark fantasy anime illustration, semi-realistic anime, pale skin, dim moody lighting, muted desaturated colors, dark atmosphere' };

  // ------- プロンプト整形 -------
  // 旧suffixの開始点(features.js STYLE_SUFFIX / fix197 STYLE_SUFFIX_284 の先頭語)。
  // ここから末尾までを切り落として「外見コア」を復元する。
  var OLD_SUFFIX_START=/,\s*(high[- ]quality anime|clean detailed anime|high quality anime art style|realistic digital painting|soft watercolor|dark fantasy anime|dark fantasy)/i;
  // 我々のPREFIXが既に付いている場合の冪等化(先頭一致を剥がす)
  function stripOwnPrefix(s){
    for(var k=0;k<PREFIX.length;k++){ if(s.indexOf(PREFIX[k])===0) return s.slice(PREFIX[k].length).replace(/^[.\s,]+/,''); }
    for(var j=0;j<PREFIX_CREATURE.length;j++){ if(s.indexOf(PREFIX_CREATURE[j])===0) return s.slice(PREFIX_CREATURE[j].length).replace(/^[.\s,]+/,''); }
    /* v292Dfix429: 旧・闇アニメPREFIX(および OFF 時の新PREFIX)も剥がす。index6 を差し替えたため、
       これが無いと過去プロンプト/OFF切替後のプロンプトが剥がれず二重前置になる。 */
    for(var g=0;g<LEGACY_PREFIX.length;g++){ if(LEGACY_PREFIX[g] && s.indexOf(LEGACY_PREFIX[g])===0) return s.slice(LEGACY_PREFIX[g].length).replace(/^[.\s,]+/,''); }
    return s;
  }
  // 外見コアからスタイル示唆語(=画風を勝手に上書きする犯人)を除去。物理的特徴は残す。
  function stripStyleWords(s){
    return s
      .replace(/\b(anime|manga|cartoon|chibi|2d)\b/gi,'')
      .replace(/\bcel[- ]shad(?:ed|ing)\b/gi,'')
      .replace(/\bin the style of[^,.。]*/gi,'')
      .replace(/アニメ調|アニメ風|アニメ絵|漫画風|漫画調|劇画調|劇画|ちびキャラ|デフォルメ調/g,'')
      .replace(/\s{2,}/g,' ').replace(/(^|[\s、])[,，]+/g,'$1').trim();
  }
  function isCreaturePrompt(raw){ return /creature concept art|non-human creature|monster design|no human face|no human body|silhouette|faceless|no face|devoid of (?:any )?(?:face|features|detail)|apparition|wraith|specter|spectre|shadowy figure|made of (?:pure )?darkness|shadow (?:stretching|rising|standing|creeping|looming)|人影|亡霊|幽霊|化け物|怪物|異形|人の形をし/i.test(raw); } // v292Dfix358: 影/亡霊/シルエット系を人外判定に追加

  function transformPrompt(raw){
    try{
      apply429();   /* v292Dfix429: OFFスイッチをlive評価(リロード不要) */
      var idx=artIdx(); if(idx<0||idx>=PREFIX.length) idx=3;
      var s=String(raw||''); if(!s) return raw;
      s=stripOwnPrefix(s); /* v292Dfix358: 判定は自前prefix除去後(dark shadowy background等の誤検出防止) */
      var creature=isCreaturePrompt(s);
      var m=OLD_SUFFIX_START.exec(s);
      if(m) s=s.slice(0,m.index);
      // 我々のcreature語が本文に混ざっていたら除去(旧creature suffix由来)
      s=s.replace(/,?\s*(non-human creature|monster design|no human face|no human body|creature concept art|full creature body visible)/gi,'');
      var core=stripStyleWords(s).replace(/[\s,，、]+$/,'').trim();
      if(!core) core='character';
      var pre=(creature?PREFIX_CREATURE:PREFIX)[idx];
      if(pre.indexOf('@TAIL ')===0){ return core+', '+pre.slice(6); } /* v292Dfix349: 旧式=外見先頭+末尾スタイル */
      return pre+'. '+core;
    }catch(e){ return raw; }
  }
  window.__v292Dfix338.transformPrompt=transformPrompt; // test用
  /* v292Dfix429 検証口(node/実機共通・pure) */
  window.__v292Dfix429={ apply:apply429, off:off429, stripOwnPrefix:stripOwnPrefix,
    LABELS:LABELS, PREFIX:PREFIX, PREFIX_CREATURE:PREFIX_CREATURE, LEGACY_PREFIX:LEGACY_PREFIX,
    ART6_NEW:ART6_NEW, ART6_OLD:ART6_OLD, ART6C_NEW:ART6C_NEW, ART6C_OLD:ART6C_OLD,
    title:function(){ return STYLE_TITLE; } };

  // ------- 画像生成fetchをラップ(avatar=384x384 のみ整形) -------
  var _fetch=window.fetch;
  function isAvatarGen(url,init){
    try{
      var u=String(url||'');
      if(u.indexOf('gen.pollinations.ai')>=0 && u.indexOf('/images/generations')>=0){
        var b=init&&init.body; if(typeof b==='string' && b.indexOf('384x384')>=0) return 'post';
        return false;
      }
      if(u.indexOf('image.pollinations.ai/prompt/')>=0 && /width=384&height=384/.test(u)) return 'get';
      if(u.indexOf('image.pollinations.ai/prompt/')>=0 && /width=768&height=512/.test(u)) return 'see';
    }catch(e){}
    return false;
  }
  window.fetch=function(url,init){
    try{
      if(on()){
        var kind=isAvatarGen(url,init);
        if(kind==='post' && init && typeof init.body==='string'){
          var j=JSON.parse(init.body);
          if(j && j.prompt){ j.prompt=transformPrompt(j.prompt); init=Object.assign({},init,{body:JSON.stringify(j)}); }
        } else if(kind==='get'){
          var mm=/\/prompt\/([^?]+)(\?.*)$/.exec(String(url));
          if(mm){ var dec=''; try{ dec=decodeURIComponent(mm[1]); }catch(_e){ dec=mm[1]; }
            var np=transformPrompt(dec);
            url=String(url).slice(0,mm.index)+'/prompt/'+encodeURIComponent(np)+mm[2];
          }
        } else if(kind==='see'){
          // v292Dfix344: 「見る」画像=artStyle 4/5の時だけfix315bのdarkタグを新画風tailへ差し替え(0-3は正しいので不触)
          var idx=artIdx();
          if(idx>=4 && SEE_TAIL[idx]){
            var ms=/\/prompt\/([^?]+)(\?.*)$/.exec(String(url));
            if(ms){ var ds=''; try{ ds=decodeURIComponent(ms[1]); }catch(_e){ ds=ms[1]; }
              if(ds.indexOf(SEE_OLD_DARK)>=0){ ds=ds.replace(SEE_OLD_DARK, SEE_TAIL[idx]);
                url=String(url).slice(0,ms.index)+'/prompt/'+encodeURIComponent(ds)+ms[2]; }
            }
          }
        }
      }
    }catch(e){ try{ console.warn(TAG,'wrap error',e); }catch(_){} }
    return _fetch.call(this,url,init);
  };

  // ------- 画風セレクタを5種に整理(従来→ダーク改称・SF追加) -------
  function patchSelector(){
    try{
      var sel=document.getElementById('v292-style-sel'); if(!sel) return;
      apply429();   /* v292Dfix429: ラベル/説明文もlive評価 */
      // v292Dfix344: LABELS全件をセレクタに反映(既存0-2はラベル一致・3ダーク改称・4SF/5リアルアニメ追加)
      // v292Dfix396: 初代(7)は既定で撤去。OFF時 or 現slotが既に7の時だけ残す(廃校等の既存slot保護)。
      var vis396 = off396() ? LABELS.length : 7;
      var cur396 = curArt();
      for(var i=0;i<LABELS.length;i++){
        var o=sel.querySelector('option[value="'+i+'"]');
        var show396 = (i<vis396) || (i===7 && cur396===7);
        if(!show396){ if(o&&o.parentNode) o.parentNode.removeChild(o); continue; }
        if(!o){ o=document.createElement('option'); o.value=String(i); sel.appendChild(o); }
        if(o.textContent!==LABELS[i]) o.textContent=LABELS[i];
      }
      sel.title=STYLE_TITLE;
      try{ var c=getCfg(); if(c&&c.artStyle!=null) sel.value=String(+c.artStyle); }catch(_){}
    }catch(e){}
  }

  // ------- 全キャストのアイコンを現在の画風で作り直す -------
  function regenAllCast(){
    try{
      var f=window.__v292Dfix197||window.__v292Dfix199;
      if(f && typeof f.regenFor==='function'){
        var names={};
        try{ var S=getS(); if(S&&S.cast){ if(S.cast.hero&&S.cast.hero.name) names[S.cast.hero.name]=1; (S.cast.npcs||[]).forEach(function(n){ if(n&&n.name) names[n.name]=1; }); } }catch(_){}
        Object.keys(names).forEach(function(nm){ try{ f.regenFor(nm); }catch(_){} });
      }
      // fix197 sweep が data-avpk を外して新画風で再取得する(styleキー変化と同経路)
    }catch(e){}
  }
  window.__v292Dfix338.regenAllCast=regenAllCast;

  // ------- ジャンル→既定画風(おまかせから呼ばれる・上書き可) -------
  var GENRE_STYLE={ mh:3 /*現代怪異→ダーク*/, df:3 /*DF→ダーク*/, sf:4 /*SF→SF*/, hd:1 /*人間ドラマ→リアル*/ };
  // v292Dfix343: 現キャストに生成済みアイコンが1枚でもあるか(fix197キャッシュ照会)
  function hasAnyIcon(){
    try{
      var f=window.__v292Dfix197||window.__v292Dfix199; if(!f||typeof f.cachedFor!=='function') return false;
      var S=getS(); var names=[];
      if(S&&S.cast){ if(S.cast.hero&&S.cast.hero.name) names.push(S.cast.hero.name); (S.cast.npcs||[]).forEach(function(n){ if(n&&n.name) names.push(n.name); }); }
      for(var i=0;i<names.length;i++){ if(f.cachedFor(names[i])) return true; }
    }catch(e){}
    return false;
  }
  function onGenre(g){
    try{
      if(!on()) return;
      var idx=GENRE_STYLE[g]; if(idx==null) return;
      var c=getCfg(); if(!c) return;
      if(+c.artStyle===idx) return; // 既に同じ画風=何もしない(無駄な保存/再描画回避)
      // v292Dfix343: 既にアイコン生成済みのキャラが居れば画風を変えない=全アイコン再生成による
      //   トークン浪費を回避(おしん指摘)。まっさら(まだ絵が無い)新規のときだけジャンル既定を適用。
      //   画風変更は🖌セレクタで手動＝意図した再生成だけにする。
      if(hasAnyIcon()){ try{ console.log(TAG,'genre',g,'→ 既存アイコンあり: 画風据え置き(再生成しない)'); }catch(_){} return; }
      c.artStyle=idx;
      try{ var S=getS(); if(S&&typeof S.save==='function') S.save(); }catch(_){}
      patchSelector();
      try{ var sel=document.getElementById('v292-style-sel'); if(sel) sel.value=String(idx); }catch(_){}
      try{ if(window.__aiAvatar&&window.__aiAvatar.refreshAll) window.__aiAvatar.refreshAll(); }catch(_){}
      try{ console.log(TAG,'genre',g,'→ style',idx,LABELS[idx]); }catch(_){}
    }catch(e){}
  }
  window.__v292Dfix338.onGenre=onGenre;
  window.__v292Dfix338.on=on;

  // セレクタは features.js が最大~10秒かけて注入するのでポーリングで追従(冪等)
  var n=0; var iv=setInterval(function(){ n++; if(on()) patchSelector(); if(n>60) clearInterval(iv); }, 400);
  try{ console.log(TAG,'loaded; active:', on()?'on':'off(preview)'); }catch(_){}
})();
