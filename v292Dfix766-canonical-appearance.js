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
// ■fix768(2026-08-31): 受入E2E実データ(QA story村長のroster appr「老年の男性。日焼けした肌…」)で
//   「老年」が年齢語彙に無くageBandがRANDOM_FILLに落ちる取り残しを観測→ 老年/年老い をELDERLY語彙へ追加。
// ■fix772(2026-08-31): **既定ON化**（PHASE 4E slice2 CLOSED・GPT裁定GO）。
//   GO条件は実装確認済み: 初回生成は無料経路（fix770 の reference は cachedFor に画像がある
//   ＝再生成のときだけ付き、genOne の自動発火は fix197 applyOne :445-448 の
//   「cache/persist に画像が無く info.prompt がある」ときだけ＝icon未取得時のみ）。
//   有料 reference 生成が起きるのはユーザーの明示↻/明示「作り直す」経路のみで、
//   background 自動有料生成は無い。retry も有限（fix476=3+3候補で打ち止め・fix478=最大2回・
//   fix524=2sデバウンス・fix197 GEN_BUDGET=30/セッション）。kill は維持。
//
// ■fix776(2026-08-31 / 4E-GEN1): **明示性別語 → attrs.gender** の導出（軽微 schema 拡張）
//   ・真因: OWNER の実画像で「辻井のお婆さん」に髭が生えた。fix767 の subjectPhrase は
//     性別を **S.cast.{hero,npcs}.gender からしか読まない**ため、cast に載っていない
//     物語内キャラ（roster 由来の"お婆さん"など）は常に g='' → 主語が 'person' になる。
//     'elderly person' は画像モデル側で男性に倒れやすく、髭が生える。
//     ＝「女性という**書いてある事実**が prompt へ1バイトも流れていなかった」構造穴。
//   ・GPT 裁定: 12軸 ENUMS を増やさず、attrs に gender を1つだけ足す軽微拡張を承認。
//     ただし **推測は全面禁止**（職業・名前・年齢・服装・性格から性別を決めない）。
//     決めてよいのは「desc / roster appr の本文に明示的な性別語が書いてあるとき」だけ。
//   ・構造上の保証: gender は ENUMS / ATTR_KEYS に **入れない**。よって fillMissing の
//     RANDOM 対象に構造的になりえない（＝性別を勝手に抽選することが実装上不可能）。
//   ・両性の語が同一テキストに同居したら（例:「母親譲りの黒髪を持つ少年」）**導出しない**。
//     曖昧なら空＝従来どおり 'person'。誤った性別を立てるより無指定の方が安全。
//   ・単字「女」「男」「婆」の substring 判定は禁止（「彼女は言った」「長男の話」で誤爆する）。
//     語彙は必ず2字以上の語単位。「老人」は中立語として **どちらにも入れない**。
//   ・既存 record への backfill: get()/ensureFor() で attrs.gender が無い record を見つけたら、
//     **gender 項目だけ** 1回追い抽出して保存する（他 attrs は不触・appearanceRevision も不変）。
//     これが無いと fix772 の既定ON以前に作られた既存 record（＝実際に髭が生えた人）が直らない。
//     一般規則であり、特定 story / 特定名への patch ではない。
//   ・kill: localStorage.v292Dfix776Off === '1' → gender の導出と backfill だけ停止
//     （fix766 本体・12軸・fill は一切変えない）。
//
// ■fix778(2026-08-31 / 4E slice 3B): **Non-human Morphology v1** = attrs.entityType / attrs.morphology
//   ・真因（QA実機 smtg00ynsv1 で実測）: roster「青銅の心臓」の appr は
//     「人の手のひらほどの大きさの青銅製の塊。心臓のような形状で、内部から淡い灯りを保ち、脈動する。」
//     ＝**器物**なのに、v1 の entityType は 'HUMAN' 固定だったため 12軸が全部 RANDOM_FILL され
//     {THIRTIES, GRAY, OFFICE_WORKER, SMALL_SOFT} が立ち、fix767 が
//     "…portrait of one adult person…" を組んだ。**器物が30代会社員の人物画として生成される**。
//     ＝「人間ではない、という書いてある事実」が record にも prompt にも1バイトも無い構造穴。
//   ・GPT 裁定: Base + Human + Morphology の分離。**entityType は6種で打ち止め**（巨大 taxonomy 禁止）。
//       HUMAN / HUMANOID（人型の人外: 鬼・天狗・一つ目の童）/ BEAST（獣型: 黒犬・大蛇）/
//       OBJECT（器物・付喪神: 青銅の心臓）/ APPARITION（霊体・影: 濡れた着物の人影）/
//       PARTIAL（部分顕現: 鏡から伸びる腕）
//   ・構造上の保証: entityType / morphology は ENUMS / ATTR_KEYS の **外側**（fix776 gender と同じ）。
//     よって fillMissing の RANDOM 抽選対象に構造的になりえない（規約ではなく構造で保証）。
//   ・導出は **明示語のみ・既定 HUMAN**（＝迷ったら現状挙動＝安全側）。規律は fix776 と同じ:
//       ① 人間含意語（性別語・「男」「女」を含む語・年齢語・職業語・敬称）が同居したら HUMAN へ倒す
//          （「鬼のような形相の男」「犬を連れた老人」「鏡を持つ娘」は全て HUMAN）。
//       ② 主語判定を伴わない単純 substring は禁止。型語は **文の主名詞位置**
//          （句点・文末・閉じ括弧・コピュラ直前）に立っているときだけ採る。
//          「犬を連れた」の犬は格助詞「を」の前＝主名詞ではないので採らない。
//       ③ 修飾語として単独で人外を確定させる語（一つ目・付喪神・半透明・〜製 等）だけ位置を問わない。
//   ・非 HUMAN の record では human 12軸を **1つも RANDOM_FILL しない**（fillMissing が先頭で抜ける）。
//     rebuildAppearance でも復活しない（kept → fillMissing が no-op）。
//   ・morphology = appr からの決定的な英語名詞句（LLM なし）。fix767 の主語になる。
//     材質・発光・脈動・濡れ・着物 等は distinctiveFeatures へ（人外のときだけ追加語彙を使う＝
//     HUMAN の抽出結果は 1バイトも変わらない）。
//   ・既存 record の backfill: get() で attrs.entityType が無い record に 1回だけ追い抽出する。
//     明示語が無ければ **書込 0**（既定 HUMAN はキー自体を書かない＝将来語彙を足したとき
//     誤った HUMAN で凍結されない・fix776 backfillGender と同じ書込 0 規律）。
//     人外と判った既存 record は、その場で human 12軸の **RANDOM_FILL だけ** 落とす
//     （EXPLICIT / locked は残す）。appearanceRevision / updatedAt は不変。
//     これが無いと「青銅の心臓」の既存 record（30代会社員）が直らない。
//   ・kill: localStorage.v292Dfix778Off === '1' → 導出・backfill・fill 分岐の全てを停止し、
//     entityTypeOf は常に 'HUMAN' を返す＝**完全に従来（全員 HUMAN 扱い）**。
//
// ■kill（既定ON・停止は Off 側だけ）
//   localStorage.v292Dfix766Off === '1' のときだけ全停止（従来の強制停止をそのまま昇格）。
//   停止中の ensureFor() は no-op（ストアへ1バイトも書かない）。
//   旧 opt-in フラグ v292Dfix766On は **読むが不要**（残っていても害が無いよう真偽に影響させない）。
//   fixture からは extractExplicit / fillMissing / _store 系を直接呼べるので常に検証できる。
//
// ■公開口
//   window.__v292Dfix766 = { __armed, on, isOff, slotId, KEY,
//     ensureFor, get, rebuildAppearance,
//     extractExplicit, fillMissing, appearanceSeed, rng,
//     ENUMS, BASE_WEIGHTS, assertExplicitPreserved,
//     ★fix776: GENDER_WORDS, detectGenderWord, extractGender, backfillGender, isOff776,
//     ★fix778: ENTITY_TYPES, HUMAN_MARKERS, detectEntityType, extractEntityType,
//              morphologyOf, morphFeatures, entityTypeOf, backfillEntityType, isOff778,
//     _load, _save, _reset, _put, _rosterCounts, _resolveName }
// =====================================================================
(function(){
  'use strict';
  var TAG = '[v292Dfix766:canonical-appearance]';

  // ---------- 環境アクセス（読取のみ） ----------
  function getS(){ try{ return window.S || (0,eval)('typeof S!=="undefined"?S:null'); }catch(e){ return null; } }
  function lsg(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function lss(k,v){ try{ localStorage.setItem(k,v); return true; }catch(e){ return false; } }
  /* ★fix772: 既定ON。停止は v292Dfix766Off==='1' だけ（旧 opt-in の v292Dfix766On は
     後方互換で読むが結果には効かせない＝古い端末に '1' が残っていても害が無い）。 */
  function on(){ try { lsg('v292Dfix766On'); } catch(e){} return lsg('v292Dfix766Off') !== '1'; }
  function isOff(){ return lsg('v292Dfix766Off') === '1'; }
  /* ★fix776: gender 導出 + backfill だけの kill。fix766 本体（12軸・fill・store）には効かない。 */
  function isOff776(){ return lsg('v292Dfix776Off') === '1'; }
  /* ★fix778: entityType/morphology の導出・backfill・fill 分岐だけの kill。
     ON にすると entityTypeOf は常に 'HUMAN'＝完全に従来（全員 HUMAN 扱い）へ戻る。 */
  function isOff778(){ return lsg('v292Dfix778Off') === '1'; }
  /* ■fix779: 人外の形態語彙の追加分（顔なし・単眼・腕の本数・提げ物・裂けた口・肌の色）だけの kill。
     ON にすると morphFeatures は fix778 と 1バイト同じ結果へ戻る（人外以外は元から通らない）。 */
  function isOff779(){ return lsg('v292Dfix779Off') === '1'; }

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

  // =====================================================================
  // ★fix776: gender（明示語からの導出のみ・12軸の外側）
  // ---------------------------------------------------------------------
  //  ・gender は ENUMS にも ATTR_KEYS にも **入れない**。
  //    → fillMissing は ATTR_KEYS しか回さないので、RANDOM_FILL が gender を作ることは
  //      実装上ありえない（規約ではなく構造で保証する）。
  //  ・値は 'FEMALE' | 'MALE' の2値のみ。'UNKNOWN' は持たない（無い＝キー自体が無い）。
  //  ・語彙は「その人物の性別が本文に書いてある」と読める語だけ。2字以上の語単位のみ。
  //    単字「女」「男」「婆」は入れない（彼女／長男／男女 などで誤爆する）。
  //  ・「老人」「紳士」「主人」「人物」「村長」「漁師」「先生」「研究者」「巫女」等の
  //    職業語・敬称・年齢語は **どちらにも入れない**（＝推測禁止の実体）。
  //     ※「巫女」は職業語であり性別語ではない（男性神職が巫女装束を着る筋書きもありうる）。
  //       服装 archetype は既存 RULES が SHRINE_PRIEST として拾うので情報は落ちない。
  // =====================================================================
  var GENDER_WORDS = {
    FEMALE: ['女性','女の人','女の子','お婆さん','おばあさん','婆さん','ばあさん','老婆','女将','娘','少女','乙女','母親','母'],
    MALE:   ['男性','男の人','男の子','お爺さん','おじいさん','爺さん','じいさん','老爺','翁','息子','少年','父親','父']
  };
  var RE_FEMALE = new RegExp(GENDER_WORDS.FEMALE.join('|'));
  var RE_MALE   = new RegExp(GENDER_WORDS.MALE.join('|'));

  /**
   * detectGenderWord(text) → 'FEMALE' | 'MALE' | ''
   *   明示語が **片側だけ** 出たときだけ値を返す。両方出たら '' （曖昧＝導出しない）。
   *   例: 「母親譲りの黒髪を持つ少年」→ FEMALE語(母親)とMALE語(少年)が同居 → '' 。
   */
  function detectGenderWord(text){
    var t = String(text==null?'':text);
    if (!t) return '';
    var f = RE_FEMALE.test(t), m = RE_MALE.test(t);
    if (f && m) return '';
    if (f) return 'FEMALE';
    if (m) return 'MALE';
    return '';
  }
  /** extractGender(text, source) → {value,source,locked} | null （kill 中は常に null） */
  function extractGender(text, source){
    if (isOff776()) return null;
    var g = detectGenderWord(text);
    return g ? { value: g, source: source || 'STORY_EXPLICIT', locked: false } : null;
  }

  // =====================================================================
  // ★fix778: entityType / morphology（人外の形状。12軸の外側・明示語のみ・既定 HUMAN）
  // ---------------------------------------------------------------------
  //  ・entityType は **6種で打ち止め**（GPT 裁定・巨大 taxonomy 禁止）。
  //  ・ENUMS / ATTR_KEYS には入れない → fillMissing の抽選対象に構造的になりえない。
  //  ・「無い＝HUMAN」。HUMAN のときはキー自体を書かない（ストア書込 0・将来語彙を足したときに
  //    誤った HUMAN で凍結されないため）。
  // =====================================================================
  var ENTITY_TYPES = ['HUMAN','HUMANOID','BEAST','OBJECT','APPARITION','PARTIAL'];

  /* ① 人間含意語（veto）。1つでも出たら **無条件で HUMAN**（＝従来動作＝安全側）。
     単字「男」「女」をここに入れてよいのは、誤爆したときの行き先が HUMAN＝現状維持だから。
     （gender と逆で、こちらは「立てない方向」の判定なので単字 substring が安全側になる） */
  var HUMAN_MARKERS = [
    '男','女',
    '人間','人物','人々','村人','住人','大人','子供','こども','幼児','赤ん坊','若者',
    '老人','老年','年老い','老爺','老婆','初老','中年','青年','少年','少女',
    '学生','生徒','高校生','中学生','大学生',
    '息子','娘','母','父','兄','姉','弟','妹','祖父','祖母','夫','妻','主人','紳士','婦人',
    '爺','婆','翁',
    '漁師','漁夫','農夫','農家','百姓','農民','神主','宮司','神職','神官','巫女',
    '医者','教師','教員','会社員','事務員','公務員','商人','店主','行商','村長','先生',
    '研究者','武士','侍','職人',
    '\\d+\\s*[歳才]'
  ];
  var RE_HUMAN_MARK = new RegExp(HUMAN_MARKERS.join('|'));

  /* ② 主名詞位置の判定。型語のすぐ後ろが「句点/文末/閉じ括弧/コピュラ」のときだけ主名詞と見なす。
     「犬を連れた老人」の犬は次が格助詞「を」＝主名詞ではない → 採らない（単純 substring の禁止）。
     「鏡を持つ娘」「鬼のような形相」も同じ理屈で落ちる（次が「を」「の」）。 */
  var RE_HEAD_TAIL = /^(?:$|[。．.、，,！!？?\n\r」』）)\]】　 ]|で[、，,]|であ|です|だ[。．.、，,]|らしい)/;
  function headMatch(t, word){
    var from = 0, i;
    while ((i = t.indexOf(word, from)) >= 0){
      if (RE_HEAD_TAIL.test(t.slice(i + word.length))) return true;
      from = i + 1;
    }
    return false;
  }

  /* ③ 主名詞位置を要求する型語（長い語を先に置く＝「大蛇」が「蛇」より先） */
  var MORPH_HEAD = {
    APPARITION: ['人影','影法師','亡霊','幽霊','怨霊','生霊','死霊','悪霊','亡者','陽炎','残像','靄','霊','影','幻','魂'],
    BEAST:      ['大蛇','黒犬','蜘蛛','蝙蝠','犬','狼','猫','蛇','鴉','烏','狐','狸','鼠','猿','牛','馬','熊','猪','鹿','獣','蟲','虫','魚','鳥','龍','竜'],
    OBJECT:     ['彫像','能面','仮面','置物','骨董','絡繰','からくり','機械','提灯','行灯','人形','塊','鏡','壺','甕','器','刀','剣','鎧','兜','札','鈴','櫛','傘','像','面','石'],
    HUMANOID:   ['大入道','化け物','化物','物の怪','もののけ','山姥','天狗','河童','妖怪','獣人','入道','鵺','鬼']
  };
  /* ④ 位置を問わない語（それ単独で人外が確定する修飾語だけ）。veto には負ける。 */
  var MORPH_ANY = {
    APPARITION: ['半透明','透けて','実体の無い','実体のない','宙に浮かぶ'],
    HUMANOID:   ['一つ目','ひとつ目','一つ眼','三つ目','単眼','角の生えた','角が生えた','牙の生えた','人ならざる','異形','半人半'],
    OBJECT:     ['付喪神','器物']
  };
  /* 材質＋「製」は器物の確定語（材質を限定して誤爆面を絞る） */
  var RE_OBJ_MADE = /(青銅|銅|鉄|鋼|銀|金|石|木|陶|磁|硝子|ガラス|布|紙|骨|革|土)製/;
  /* ⑤ PARTIAL（部分顕現）。構文そのものが主語を含むので位置判定は不要。
     腕/手/指/脚/足のみを対象にする（顔・首は入れない＝face を主語にしない）。 */
  var RE_PARTIAL_FROM = /から[^。]{0,8}(?:伸び|突き出|生え|覗|のぞ|這い出)[^。]{0,6}(?:腕|手|指|脚|足)/;
  var RE_PARTIAL_ONLY = /(?:腕|手|指|脚|足)(?:だけ|のみ)/;
  /* 判定順（先に一致した型が勝つ＝決定的。人外どうしの曖昧さは HUMAN へ倒さない） */
  var MORPH_ORDER = ['PARTIAL','APPARITION','BEAST','OBJECT','HUMANOID'];

  /**
   * detectEntityType(text) → 'HUMANOID'|'BEAST'|'OBJECT'|'APPARITION'|'PARTIAL' | ''
   *   '' は「明示語なし＝既定 HUMAN」。人間含意語が1つでもあれば無条件に ''。
   */
  function detectEntityType(text){
    var t = String(text==null?'':text);
    if (!t) return '';
    if (RE_HUMAN_MARK.test(t)) return '';            // ★veto: 迷ったら HUMAN（従来動作）
    for (var i=0;i<MORPH_ORDER.length;i++){
      var ty = MORPH_ORDER[i];
      if (ty === 'PARTIAL'){ if (RE_PARTIAL_FROM.test(t) || RE_PARTIAL_ONLY.test(t)) return 'PARTIAL'; continue; }
      var any = MORPH_ANY[ty] || [];
      for (var a=0;a<any.length;a++){ if (t.indexOf(any[a]) >= 0) return ty; }
      if (ty === 'OBJECT' && RE_OBJ_MADE.test(t)) return 'OBJECT';
      var hd = MORPH_HEAD[ty] || [];
      for (var h=0;h<hd.length;h++){ if (headMatch(t, hd[h])) return ty; }
    }
    return '';
  }
  /** extractEntityType(text, source) → {value,source,locked} | null（HUMAN / kill 中は null） */
  function extractEntityType(text, source){
    if (isOff778()) return null;
    var ty = detectEntityType(text);
    return ty ? { value: ty, source: source || 'STORY_EXPLICIT', locked: false } : null;
  }

  /* ---------- morphology: 日本語 appr → 決定的な英語名詞句（LLM なし） ---------- */
  var MORPH_NOUN = {
    APPARITION: [['人影','a shadowy human silhouette'],['影法師','a shadowy human silhouette'],
                 ['亡霊','a pale ghost'],['幽霊','a pale ghost'],['死霊','a pale ghost'],
                 ['怨霊','a vengeful spirit'],['生霊','a wandering spirit'],['悪霊','a malevolent spirit'],
                 ['亡者','a wandering dead figure'],['陽炎','a shimmering phantom'],
                 ['残像','a lingering afterimage figure'],['靄','a drifting haze figure'],
                 ['霊','a pale ghost'],['影','a dark shadow figure'],['幻','a fading phantom'],['魂','a drifting soul']],
    BEAST:      [['大蛇','a giant serpent'],['黒犬','a black dog'],['蜘蛛','a giant spider'],['蝙蝠','a bat'],
                 ['犬','a dog'],['狼','a wolf'],['猫','a cat'],['蛇','a serpent'],['鴉','a crow'],['烏','a crow'],
                 ['狐','a fox'],['狸','a raccoon dog'],['鼠','a rat'],['猿','a monkey'],['牛','an ox'],
                 ['馬','a horse'],['熊','a bear'],['猪','a boar'],['鹿','a deer'],['蟲','an insect creature'],
                 ['虫','an insect creature'],['魚','a fish'],['鳥','a bird'],['龍','a dragon'],['竜','a dragon'],
                 ['獣','a beast']],
    OBJECT:     [['付喪神','an old possessed household object'],['彫像','a small statue'],['能面','a japanese noh mask'],
                 ['仮面','a japanese mask'],['置物','a small ornament'],['骨董','an antique object'],
                 ['絡繰','a clockwork automaton'],['からくり','a clockwork automaton'],['機械','an old machine'],
                 ['提灯','a paper lantern'],['行灯','a paper lamp'],['人形','an old japanese doll'],
                 ['塊','a solid lump'],['鏡','an ornate old mirror'],['壺','a ceramic jar'],['甕','a ceramic urn'],
                 ['器','an old vessel'],['刀','an old japanese sword'],['剣','an old sword'],
                 ['鎧','an old suit of armor'],['兜','an old helmet'],['札','a paper talisman'],
                 ['鈴','a small bell'],['櫛','an ornate comb'],['傘','an old paper umbrella'],
                 ['像','a small statue'],['面','a japanese noh mask'],['石','a stone']],
    HUMANOID:   [['一つ目の童','a one-eyed childlike yokai'],['一つ目','a one-eyed humanlike yokai'],
                 ['ひとつ目','a one-eyed humanlike yokai'],['一つ眼','a one-eyed humanlike yokai'],
                 ['三つ目','a three-eyed humanlike yokai'],['単眼','a one-eyed humanlike yokai'],
                 ['大入道','a giant bald yokai'],['化け物','a humanlike monster'],['化物','a humanlike monster'],
                 ['物の怪','a humanlike yokai'],['もののけ','a humanlike yokai'],['山姥','a mountain crone yokai'],
                 ['天狗','a tengu with a long red nose'],['河童','a kappa'],['妖怪','a humanlike yokai'],
                 ['獣人','a beast-headed humanoid'],['入道','a bald yokai'],['鵺','a chimeric yokai'],
                 ['異形','a misshapen humanlike figure'],['鬼','an oni demon with horns']]
  };
  var MORPH_FALLBACK = { HUMANOID:'a humanlike yokai', BEAST:'a beast', OBJECT:'an old object',
                         APPARITION:'a ghostly apparition', PARTIAL:'a disembodied human limb' };
  /* PARTIAL: 「<出所>から伸びる<部位>」を英語の1句に写す */
  var PARTIAL_LIMB = [['腕','a human arm'],['手','a human hand'],['指','human fingers'],
                      ['脚','a human leg'],['足','a human leg']];
  var PARTIAL_SRC  = [['水面','the water surface'],['暗闇','the darkness'],['井戸','a well'],['天井','the ceiling'],
                      ['地面','the ground'],['画面','a screen'],['障子','a paper screen'],['襖','a sliding paper door'],
                      ['鏡','a mirror'],['壁','a wall'],['戸','a doorway'],['扉','a doorway'],['床','the floor'],
                      ['闇','the darkness'],['水','the water'],['絵','a painting'],['穴','a hole']];
  /* 大きさ・形状（名詞句へ組み込む） */
  var MORPH_SIZE  = [[/手のひらほど|掌ほど|手のひら大/,'palm-sized'],[/巨大|見上げるほど|山のような/,'enormous'],
                     [/細長/,'elongated'],[/小ぶり|小さ/,'small']];
  var MORPH_SHAPE = [[/心臓のような|心臓の形|心臓状/,'shaped like a heart'],[/人の形|人型|ひとがた/,'roughly humanlike in shape'],
                     [/球状|丸い形/,'spherical'],[/歪|いびつ/,'misshapen']];
  function firstOf(pairs, t){ for (var i=0;i<pairs.length;i++){ if (t.indexOf(pairs[i][0]) >= 0) return pairs[i][1]; } return ''; }
  function firstRe(pairs, t){ for (var i=0;i<pairs.length;i++){ if (pairs[i][0].test(t)) return pairs[i][1]; } return ''; }

  /**
   * morphologyOf(entityType, text) → 英語名詞句
   *   決定的（LLM なし）。語彙に無ければ型ごとの fallback、型も無ければ 'mysterious entity'。
   */
  function morphologyOf(entityType, text){
    var t = String(text==null?'':text);
    var ty = String(entityType||'');
    if (!ty || ty === 'HUMAN') return '';
    if (ty === 'PARTIAL'){
      var limb = firstOf(PARTIAL_LIMB, t) || MORPH_FALLBACK.PARTIAL;
      var src  = RE_PARTIAL_FROM.test(t) ? firstOf(PARTIAL_SRC, t) : '';
      return src ? (limb + ' reaching out from ' + src) : (limb + ' emerging into view');
    }
    var noun = firstOf(MORPH_NOUN[ty] || [], t) || MORPH_FALLBACK[ty] || 'mysterious entity';
    var size = firstRe(MORPH_SIZE, t);
    if (size){
      /* 'a solid lump' → 'a palm-sized solid lump'（冠詞は size の頭文字で決める） */
      var art = /^[aeiou]/i.test(size) ? 'an ' : 'a ';
      noun = noun.replace(/^an?\s+/, art + size + ' ');
    }
    var shape = firstRe(MORPH_SHAPE, t);
    return shape ? (noun + ', ' + shape) : noun;
  }

  /* 人外のときだけ足す distinctiveFeatures 語彙（材質・発光・表面・色）。
     HUMAN の抽出結果を1バイトも変えないため、entityType≠HUMAN のときしか回さない。 */
  var MORPH_FEATURE_RULES = [
    [/青銅/,                  'made of tarnished bronze'],
    [/真鍮|黄銅/,             'made of brass'],
    [/(?:^|[^青黄])銅/,       'made of copper'],   /* 「青銅」「黄銅」の内側の銅では発火させない */
    [/鉄|鋼/,                 'made of dark iron'],
    [/銀色|銀製|白銀/,        'made of silver'],
    [/黄金|金色/,             'gilded'],
    [/石造|石製|岩/,          'made of stone'],
    [/木製|木彫|木造/,        'made of carved wood'],
    [/陶器|磁器|焼き物|陶製/,  'made of glazed ceramic'],
    [/硝子|ガラス/,           'made of glass'],
    [/骨製|白骨/,             'made of bone'],
    [/紙製|和紙/,             'made of paper'],
    [/錆|さび|朽ち/,          'rusted and decayed'],
    [/古い|古びた|年季|古めかし/, 'ancient and weathered'],
    [/淡い灯り|淡い光|仄かな光|ほのかな光|微かな光|内部から[^。]{0,6}(?:灯|光)/, 'faint inner glow'],
    [/光る|輝く|燐光|発光/,    'glowing'],
    [/脈動|脈打/,             'pulsating rhythmically'],
    [/濡れ/,                  'soaking wet and dripping'],
    [/着物|和服|袴|羽織/,      'draped in a japanese kimono'],
    [/半透明|透けて/,          'translucent'],
    [/角/,                    'with horns'],
    [/牙/,                    'with fangs'],
    [/鱗/,                    'covered in scales'],
    [/毛皮|毛並/,             'thick fur'],
    [/漆黒|真っ黒|黒/,        'black colored'],
    [/真っ白|白/,             'white colored'],
    [/紅|赤/,                 'red colored'],
    [/血/,                    'blood stained']
  ];
  /* =====================================================================
   * ■fix779(2026-08-31 / 4E slice 3B): 実測FAIL 由来の追加語彙（決定的規則のみ）
   * ---------------------------------------------------------------------
   * 実測(QA実機 smtg00ynsv1・fix778 の実 prompt で生成した実画像の目視QA):
   *   F2「顔のない人影。のっぺりとした頭部で、提灯を提げて立つ。」
   *      → 「顔のない/のっぺり/提灯を提げ」に規則が無く prompt から丸ごと落ち、
   *        モデルが角+赤目の悪魔を発明した（morphology FAIL）。
   *   F3「六本の腕を持つ影。」→「六本の腕」が落ちて腕2本で生成。
   *   F4「破れた提灯の付喪神。器物に一つ目と裂けた口が浮かぶ。」→「一つ目」「裂けた口」が落ち両目で生成。
   *   F5「角の生えた鬼。赤銅色の肌で、…」→ 材質規則 /(?:^|[^青黄])銅/ が「赤銅色の肌」で発火し
   *        'made of copper'（＝銅製の像）に化けていた。肌の色は材質ではない。
   * 真因はいずれも「fix766 の抽出語彙に規則が無く、書いてある情報が prompt に届いていない」こと。
   * ★ここは morphFeatures の中＝**人外(entityType≠HUMAN)のときしか回らない**。
   *   extractExplicit / backfillEntityType のどちらも out.attrs.entityType が立った時にしか
   *   morphFeatures を呼ばないので、HUMAN の抽出結果は構造的に 1バイトも変わらない。
   * kill: v292Dfix779Off='1' → 下の追加分は 1つも足さず、材質判定も fix778 と同一入力に戻る。
   * ===================================================================== */
  var MORPH_FEATURE_RULES_779 = [
    [/顔のない|顔が無い|顔がない|のっぺらぼう|のっぺり|目鼻の無い|目鼻のない/,
                                      'featureless blank face, no eyes, no mouth'],
    [/一つ目|ひとつ目|一つ眼|単眼|隻眼/, 'a single large eye, only one eye'],
    [/裂けた口|裂けた唇|口が裂け/,      'wide torn mouth'],
    [/(?:提灯|行灯|灯籠)を(?:提げ|下げ|持|携え)/, 'carrying a paper lantern']
  ];
  /* 腕の本数（「六本の腕」→ 'six arms'）。2〜9 のみ（1本は既定と同じ・10本以上は語彙にしない）。
     実測FAIL は腕だけなので、脚・目・首へは広げない（推測禁止）。 */
  var ARM_NUM = { '二':'two','三':'three','四':'four','五':'five','六':'six','七':'seven','八':'eight','九':'nine',
                  '2':'two','3':'three','4':'four','5':'five','6':'six','7':'seven','8':'eight','9':'nine',
                  '２':'two','３':'three','４':'four','５':'five','６':'six','７':'seven','８':'eight','９':'nine' };
  var RE_ARM_COUNT = /([二三四五六七八九23456789２３４５６７８９])\s*本の腕/;
  function armCountFeature(t){
    var m = RE_ARM_COUNT.exec(String(t==null?'':t));
    if (!m) return '';
    var n = ARM_NUM[m[1]];
    return n ? (n + ' arms') : '';
  }
  /* 「〜色の肌」は材質ではない（F5）。材質規則を回す前に肌色の言い回しを切り出し、
     その span を材質判定の入力から外す（全角空白へ差し替え）。
     ★材質規則そのもの（「青銅製の塊」→ made of tarnished bronze 等）は 1バイトも変えない。
       「材質は X製 だけ」に絞ると実測 PASS の「青銅の心臓」が退行するため、
       材質側ではなく **肌の言い回しだけ** を先に取り除く方向で解く。 */
  var SKIN_TONE = [
    ['赤銅','reddish-bronze skin'], ['青銅','bronze-toned skin'], ['乳白','milky pale skin'],
    ['青白','pale bluish skin'],   ['土気','sallow earthen skin'], ['褐','dark brown skin'],
    ['銅','coppery skin'],         ['鉄','iron-gray skin'],        ['灰','ashen gray skin'],
    ['土','earth-toned skin'],     ['金','golden skin'],           ['銀','silvery skin'],
    ['白','pale white skin'],      ['黒','dark black skin'],       ['赤','red skin'],
    ['青','bluish skin']
  ];
  var SKIN_WORDS = (function(){ var a=[]; for (var i=0;i<SKIN_TONE.length;i++) a.push(SKIN_TONE[i][0]); return a.join('|'); })();
  var RE_SKIN_PRE  = new RegExp('(' + SKIN_WORDS + ')色(?:の|をした|した)?(?:肌|膚|皮膚)', 'g');
  var RE_SKIN_POST = new RegExp('(?:肌|皮膚)(?:は|が)(' + SKIN_WORDS + ')色', 'g');
  /** skinToneScan(text) → { features:[…], masked:'材質判定用に肌色 span を抜いた本文' } */
  function skinToneScan(text){
    var out = [], masked = String(text==null?'':text);
    function rep(re){
      re.lastIndex = 0;
      masked = masked.replace(re, function(all, w){
        for (var j=0;j<SKIN_TONE.length;j++){
          if (SKIN_TONE[j][0] === w){ if (out.indexOf(SKIN_TONE[j][1]) < 0) out.push(SKIN_TONE[j][1]); break; }
        }
        return '　';
      });
    }
    rep(RE_SKIN_PRE); rep(RE_SKIN_POST);
    return { features: out, masked: masked };
  }

  /** morphFeatures(text) → ['made of tarnished bronze', …]（重複なし・決定的） */
  function morphFeatures(text){
    var t = String(text==null?'':text), out = [];
    if (!t) return out;
    /* ■fix779: 肌色 span を材質判定から外す（kill 中は mt === t ＝fix778 と同一入力）。 */
    var off779 = isOff779();
    var sk = off779 ? null : skinToneScan(t);
    var mt = sk ? sk.masked : t;
    for (var i=0;i<MORPH_FEATURE_RULES.length;i++){
      if (!MORPH_FEATURE_RULES[i][0].test(mt)) continue;
      var v = MORPH_FEATURE_RULES[i][1];
      if (out.indexOf(v) < 0) out.push(v);
    }
    if (off779) return out;                     /* ■fix779 kill: ここから下は 1つも足さない */
    for (var s=0;s<sk.features.length;s++){ if (out.indexOf(sk.features[s]) < 0) out.push(sk.features[s]); }
    for (var r=0;r<MORPH_FEATURE_RULES_779.length;r++){
      if (!MORPH_FEATURE_RULES_779[r][0].test(t)) continue;
      var v7 = MORPH_FEATURE_RULES_779[r][1];
      if (out.indexOf(v7) < 0) out.push(v7);
    }
    var ac = armCountFeature(t);
    if (ac && out.indexOf(ac) < 0) out.push(ac);
    return out;
  }

  /**
   * entityTypeOf(record) → 6種のいずれか（既定 'HUMAN'）
   *   kill(v292Dfix778Off='1') のときは record に何が入っていても 'HUMAN'＝完全に従来へ戻る。
   */
  function entityTypeOf(record){
    try {
      if (isOff778()) return 'HUMAN';
      var a = record && record.attrs;
      var v = a && a.entityType && a.entityType.value;
      if (v && ENTITY_TYPES.indexOf(v) >= 0) return v;
      var t = record && record.entityType;
      if (t && ENTITY_TYPES.indexOf(t) >= 0) return t;
    } catch(e){}
    return 'HUMAN';
  }

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
    [/老爺|老人|老年|年老い|お爺さん|おじいさん|じいさん|翁/,   'ageBand', 'ELDERLY'],   /* ★fix768: 「老年の男性」(QA story村長roster appr実測)と活用形「年老いた」を追加 */
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

    /* ★fix776: 明示性別語だけ（推測は一切しない・kill 中は何も足さない）。
       gender は ATTR_KEYS の外なので fillMissing / rebuild の抽選対象にはならない。 */
    var gEx = extractGender(t, src);
    if (gEx && !out.attrs.gender) out.attrs.gender = gEx;

    /* ★fix778: entityType / morphology（明示語のみ・既定 HUMAN・kill 中は null）。
       HUMAN のときはキー自体を作らない＝人間の抽出結果は 1バイトも変わらない。
       gender の veto（人間含意語）と entityType の veto は同じ規律なので、
       gender が立つテキストで entityType が非 HUMAN になることは構造上ありえない。 */
    var etEx = extractEntityType(t, src);
    if (etEx && !out.attrs.entityType){
      out.attrs.entityType = etEx;
      var mdesc = morphologyOf(etEx.value, t);
      if (mdesc && !out.attrs.morphology) out.attrs.morphology = mkVal(mdesc, src);
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
    /* ★fix778: 人外のときだけ材質・発光・脈動・濡れ・着物等を足す（HUMAN では 1つも回さない）。 */
    if (out.attrs.entityType){
      var mfs = morphFeatures(t);
      for (var m=0; m<mfs.length; m++){
        var mv = mfs[m], mdup = false;
        for (var mq=0; mq<out.distinctiveFeatures.length; mq++){ if (out.distinctiveFeatures[mq].value === mv){ mdup = true; break; } }
        if (!mdup) out.distinctiveFeatures.push({ value: mv, source: src, locked: false });
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
    /* ★fix778: 人外（entityType≠HUMAN）は human 12軸を 1つも抽選しない。
       真因＝器物「青銅の心臓」に {THIRTIES, GRAY, OFFICE_WORKER, SMALL_SOFT} が立っていた。
       rebuildAppearance も kept→fillMissing なので、ここで抜ければ人外の human 軸は復活しない。
       kill(v292Dfix778Off='1') では entityTypeOf が常に HUMAN を返す＝従来どおり 12軸を埋める。 */
    if (entityTypeOf(record) !== 'HUMAN') return record;
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
  function _reset(){ try { localStorage.removeItem(KEY()); } catch(e){} genderTried = Object.create(null); morphTried = Object.create(null); /* ★fix778 */ }
  function _put(name, record){
    var who = resolveName(name); if (!who) return null;
    var st = _load(); st.entities[who] = record; _save(st); return record;
  }
  /* ★fix776: 「gender だけ」の追い抽出を1回試したかの memo（モジュール内メモリ・localStorage は汚さない）。
     語が見つからなかった人を毎 get() で再走査しないためだけのもの。リロードで自然に消える。 */
  var genderTried = Object.create(null);

  /**
   * ★fix776 backfillGender(who, rec) → rec
   *   既存 record に attrs.gender が無いときだけ、**gender 項目だけ** 1回追い抽出して保存する。
   *   ・他の attrs / distinctiveFeatures / appearanceRevision / updatedAt は 1バイトも変えない。
   *   ・既に gender があれば絶対に触らない（USER_EXPLICIT / STORY_EXPLICIT の上書き禁止）。
   *   ・語が見つからなければ **保存もしない**（ストア書込0）。
   *   ・kill(v292Dfix776Off='1') / fix766 本体 Off のときは何もしない。
   *   一般規則: 「明示性別語が本文にあるのに record に gender が無い record を直す」だけであり、
   *   特定の story / 特定の名前に効く patch ではない。
   */
  function backfillGender(who, rec){
    try {
      if (!rec || !rec.attrs) return rec;
      if (isOff776() || !on()) return rec;
      if (rec.attrs.gender) return rec;                 // 既存 gender は絶対に上書きしない
      if (genderTried[who]) return rec;
      genderTried[who] = 1;
      /* 優先は buildRecord と同じ ①ユーザー desc → ②roster appr */
      var g = extractGender(castDescOf(who), 'USER_EXPLICIT');
      if (!g) g = extractGender(rosterApprOf(who), 'STORY_EXPLICIT');
      if (!g) return rec;                               // 明示語なし＝導出しない（書込もしない）
      rec.attrs.gender = g;                             // ★gender 以外は触らない・revision も動かさない
      _put(who, rec);
      return rec;
    } catch(e){ return rec; }
  }

  /* ★fix778: 「entityType だけ」の追い抽出を1回試したかの memo（モジュール内メモリ）。 */
  var morphTried = Object.create(null);

  /**
   * ★fix778 backfillEntityType(who, rec) → rec
   *   既存 record に attrs.entityType が無いときだけ、1回だけ追い抽出する。
   *   ・明示語が無ければ（＝既定 HUMAN）**キーも書かない・保存もしない**（ストア書込 0）。
   *   ・人外と判ったときだけ:
   *       attrs.entityType / attrs.morphology / 人外 distinctiveFeatures を足し、
   *       human 12軸の **RANDOM_FILL だけ** 落とす（EXPLICIT / locked は残す）。
   *       これが無いと「青銅の心臓」の既存 record（12軸全部 RANDOM_FILL で 30代会社員）が直らない。
   *   ・appearanceRevision / updatedAt は 1バイトも動かさない（外見の“版”は変えていないため）。
   *   ・kill(v292Dfix778Off='1') / fix766 本体 Off のときは何もしない。
   *   一般規則であり、特定 story / 特定名への patch ではない。
   */
  function backfillEntityType(who, rec){
    try {
      if (!rec || !rec.attrs) return rec;
      if (isOff778() || !on()) return rec;
      if (rec.attrs.entityType) return rec;             // 既存 entityType は絶対に上書きしない
      if (morphTried[who]) return rec;
      morphTried[who] = 1;
      /* 優先は buildRecord と同じ ①ユーザー desc → ②roster appr */
      var src = 'USER_EXPLICIT', txt = castDescOf(who);
      var et = extractEntityType(txt, src);
      if (!et){ src = 'STORY_EXPLICIT'; txt = rosterApprOf(who); et = extractEntityType(txt, src); }
      if (!et) return rec;                              // 明示語なし＝既定 HUMAN（書込 0）
      rec.attrs.entityType = et;
      var mdesc = morphologyOf(et.value, txt);
      if (mdesc && !rec.attrs.morphology) rec.attrs.morphology = mkVal(mdesc, src);
      if (!rec.distinctiveFeatures) rec.distinctiveFeatures = [];
      var mfs = morphFeatures(txt);
      for (var m=0;m<mfs.length;m++){
        var mv = mfs[m], mdup = false;
        for (var q=0;q<rec.distinctiveFeatures.length;q++){ if (rec.distinctiveFeatures[q] && rec.distinctiveFeatures[q].value === mv){ mdup = true; break; } }
        if (!mdup) rec.distinctiveFeatures.push({ value: mv, source: src, locked: false });
      }
      for (var i=0;i<ATTR_KEYS.length;i++){
        var k = ATTR_KEYS[i], a = rec.attrs[k];
        if (a && !a.locked && a.source === 'RANDOM_FILL') delete rec.attrs[k];   // 人外に人間の抽選値は残さない
      }
      rec.entityType = et.value;
      _put(who, rec);
      return rec;
    } catch(e){ return rec; }
  }

  function get(name){
    var who = resolveName(name); if (!who) return null;
    var st = _load();
    if (!Object.prototype.hasOwnProperty.call(st.entities, who)) return null;
    var rec = backfillGender(who, st.entities[who]);    // ★fix776: gender が無い既存 record だけ直す
    return backfillEntityType(who, rec);                // ★fix778: entityType が無い既存 record だけ直す
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
    /* ★fix778: 導出できた entityType を record 直下へも写す（fix767 の recipe が読む口）。
       明示語が無ければ 'HUMAN' のまま＝人間 record は 1バイトも変わらない。 */
    if (rec.attrs.entityType && rec.attrs.entityType.value) rec.entityType = rec.attrs.entityType.value;
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
    /* ★fix776: gender（12軸の外側・明示語のみ・kill=v292Dfix776Off） */
    isOff776: isOff776, GENDER_WORDS: GENDER_WORDS,
    detectGenderWord: detectGenderWord, extractGender: extractGender, backfillGender: backfillGender,
    /* ★fix778: entityType / morphology（6種・12軸の外側・明示語のみ・kill=v292Dfix778Off） */
    isOff778: isOff778, ENTITY_TYPES: ENTITY_TYPES, HUMAN_MARKERS: HUMAN_MARKERS,
    /* ■fix779: 実測FAIL 由来の追加語彙（人外のみ・kill=v292Dfix779Off） */
    isOff779: isOff779, MORPH_FEATURE_RULES_779: MORPH_FEATURE_RULES_779,
    SKIN_TONE: SKIN_TONE, skinToneScan: skinToneScan, armCountFeature: armCountFeature,
    MORPH_HEAD: MORPH_HEAD, MORPH_ANY: MORPH_ANY, MORPH_ORDER: MORPH_ORDER,
    detectEntityType: detectEntityType, extractEntityType: extractEntityType,
    morphologyOf: morphologyOf, morphFeatures: morphFeatures,
    entityTypeOf: entityTypeOf, backfillEntityType: backfillEntityType,
    assertExplicitPreserved: assertExplicitPreserved,
    worldStyleVersion: worldStyleVersion,
    _load: _load, _save: _save, _reset: _reset, _put: _put,
    _rosterCounts: _rosterCounts, _resolveName: resolveName
  };
  try { console.log(TAG, 'loaded (on=' + (on() ? '1' : '0') + ', key=' + KEY() + ')'); } catch(e){}
})();
