/* =====================================================================
 * Chronicle v292DfixNH1: 人外モードの下書き（端末側・laneICONX1・2026-11-10・GPT #127-RY B GO・Local 候補）
 * ---------------------------------------------------------------------
 * 何をするか
 *   ・日本語の外見文から「人間／混合／人外」と体の部位ごとの特徴を拾い、部位ラベル付きの下書き
 *     「【人外（怪異）】種類：ゾンビ／目：白く濁った目／肌：灰緑色に腐った肌」を作る（辞書だけ・AI なし・通信なし・保存しない）。
 *   ・使うのは LC1 の外見の案（2 タップ・STARTICON）と MIDICON（自動アイコン）。人間の文には何もしない（下書きは今までどおり）。
 *   ・Worker（v46.41-iconx1 以降）は、鍵 nh1 が ON のときだけ、このラベル付きの外見から人外用の注文文を作る。
 *   ・辞書と判定は Worker と同じ文（src/nh1_core.js をそのまま埋め込み）。
 * 鍵：管理者画面 nh1（READY・行なし = OFF）。kill：localStorage v292DfixNH1Off='1'（この部品は何も返さない＝今までの下書き）
 * ★NH1b（丸アイコン向けの構図）：Worker が人外の注文文の構図を変える。端末 kill v292DfixNH1bOff='1' のあいだに作る下書きの末尾に「／構図：従来」を付け、
 *   その 1 人だけ Worker は NH1（iconx1）の構図で作る（保存形式は外見の文 1 本のまま。Owner は 2 タップの欄で消せる）。
 * ★ICONFIX1 b（laneICONFIX1・2026-11-11）：下書きの部位の取り方を直した（色を部位から切り離さない・「くちばし」の「し」を落とさない・「虎の毛皮」は服・
 *   蛇以外の尻尾は体の部位・種類に 鬼／狐（獣人ではない狐の妖怪）／烏天狗、部位に くちばし・甲羅・頭の皿・水かき・一本角・金棒）。
 *   kill：localStorage v292DfixICONFIX1bOff='1' → 下書きは今までとバイト一致（nh1Draft）。構図（ICONFIX1 c）は Worker だけ（端末は何もしない）。
 * ★ICONFIX2 a（laneICONFIX2・2026-11-14・GPT #127-TN icons (1)）：辞書の外の種族の語（黒猫・ロボット・からくり・黒い霧・ラミア・人魚）を、句の主語（「大きな黒猫」）の
 *   ときだけ種類として残す（「猫を抱いた少女」「猫背」「霧の中の女」は今までどおり）。種族と人間の両方が主語なら混合（黙って人間にしない）。
 *   「下半身が緑色の大蛇の女」は下半身が蛇＋色の語。歯車・金属の体・レンズの目・無数の目・二股の尻尾・刀・羽団扇・大男も部位として残す。
 *   使うのは設定の説明文からの下書き（LC1prop＝STARTICON・2 タップ）だけ。MIDICON（物語の本文から）は今までどおり ICONFIX1 b（影・闇は扱わない＝'shadow' の黒い人影を避ける）。
 *   kill：localStorage v292DfixICONFIX2aOff='1' → 下書きは ICONFIX1 b とバイト一致（v292DfixICONFIX1bOff='1' でも止まる）。Worker は変えない（知らない語は ER1x が訳す）。
 * 観測口：window.__v292DfixNH1.status()
 * ===================================================================== */
(function (root) {
  'use strict';
  if (typeof window === 'undefined' || root.__v292DfixNH1) return;
  /* ---- NH1 core (laneICONX1・GPT #127-RY B) — the same text is inlined into the Pages module v292DfixNH1-nonhuman.js and the Worker (build.py).
     Pure functions only (no DOM, no network, no storage). ES5 so it runs in both places.
     Japanese look text → { form: human | mixed | nonhuman, species, body parts } and the labeled draft 「【人外（怪異）】種類：…／顔：…／腕：…」.
     The Worker turns a labeled draft into the image prompt (nh1Prompt) only when the account key nh1 is ON. A human text never gets a header,
     so a human profile never takes this path (the human prompt stays byte-identical). ---- */
  var NH1_VER = 'nh1';
  var NH1_COMP_OLD_JA = '従来';   /* ★NH1b: 「構図：従来」を下書きの末尾に付けると、Worker はこの 1 人だけ NH1（iconx1）の構図で作る（端末の kill v292DfixNH1bOff='1' の運び方） */
  /* species words: [regex, English subject, form, kind (MIDICON kind: creature | spirit | yokai)] — first match wins.
     form 'soft' = a species that is usually drawn as a human-looking character (vampire, beastman, fairy): it never switches the prompt by itself;
     it only names the subject when strong non-human parts already made the figure mixed (狼の頭 + 獣人 → wolf beastman). */
  var NH1_BASE = [
    [/ゾンビ|屍人|動く死体|生ける屍|動く屍/, 'zombie', 'nonhuman', 'creature'],
    [/動く骸骨|骸骨|がいこつ|スケルトン|白骨/, 'animated skeleton', 'nonhuman', 'creature'],
    [/陶器の人形|ビスクドール|球体関節人形/, 'porcelain doll come to life', 'nonhuman', 'creature'],
    [/からくり人形|操り人形|日本人形|西洋人形|呪いの人形|人形(?!のよう|みたい)/, 'doll-like being', 'nonhuman', 'creature'],
    [/人狼/, 'werewolf', 'mixed', 'yokai'],
    [/狼の獣人/, 'wolf beastman', 'soft', 'yokai'], [/狐の獣人/, 'fox beastman', 'soft', 'yokai'], [/猫の獣人/, 'cat beastman', 'soft', 'yokai'], [/熊の獣人/, 'bear beastman', 'soft', 'yokai'], [/獣人/, 'beastman', 'soft', 'yokai'],
    [/スライム/, 'slime creature', 'nonhuman', 'creature'],
    [/のっぺらぼう/, 'noppera-bo, a faceless Japanese yokai', 'nonhuman', 'yokai'],
    [/口裂け女/, 'kuchisake-onna, a Japanese urban-legend yokai woman', 'mixed', 'yokai'],
    [/ろくろ首/, 'rokurokubi, a Japanese yokai with a very long stretching neck', 'mixed', 'yokai'],
    [/河童/, 'kappa, a Japanese river yokai', 'nonhuman', 'yokai'], [/天狗/, 'tengu, a Japanese mountain yokai', 'mixed', 'yokai'],
    [/吸血鬼|ヴァンパイア|バンパイア/, 'vampire', 'soft', 'yokai'], [/ミイラ/, 'mummy', 'nonhuman', 'creature'],
    [/幽霊|亡霊|怨霊|悪霊|霊体/, 'ghost', 'nonhuman', 'spirit'], [/霊のような存在/, 'ghostly apparition', 'nonhuman', 'spirit'], [/精霊/, 'nature spirit', 'nonhuman', 'spirit'], [/妖精/, 'fairy', 'soft', 'spirit'],
    [/化け物|怪物|魔物|異形/, 'monster', 'nonhuman', 'creature']
  ];
  /* body parts: [regex, slot, English, strong 1|0]. Longer / more specific forms first. slots: face eyes mouth head skin body arms lower motion pose clothes hair build */
  var NH1_PART = [
    [/顔はモナリザのような微笑み|モナリザのような微笑み|モナリザのような(?:読めない)?顔|モナリザ(?:の|みたいな)顔/, 'face', 'a face like an old Renaissance oil portrait, a faint ambiguous closed-lip smile, an unreadable gaze', 0],
    [/目も鼻も口もない顔|目鼻のない顔|顔のない|顔がない|のっぺりとした顔/, 'face', 'a completely smooth featureless face, blank skin where the eyes, nose and mouth would be', 1],
    [/読めない顔|読めない表情|無表情/, 'face', 'a blank unreadable expression', 0],
    [/ひび割れた頬|頬にひび/, 'face', 'a hairline crack across one porcelain cheek', 1],
    [/白いマスク|マスク/, 'face', 'a white surgical mask', 0],
    [/耳まで裂けた口|裂けた口|口が耳まで裂け/, 'mouth', 'a mouth slit open from ear to ear', 1],
    [/二股の長い舌|二股に割れた(?:長い)?舌|先の割れた舌/, 'mouth', 'a long forked tongue hanging out', 1],
    [/長い舌/, 'mouth', 'a long tongue hanging out', 1],
    [/鋭い牙|牙/, 'mouth', 'sharp fangs', 0],
    [/白く濁った目|濁った目|白目をむいた/, 'eyes', 'cloudy milky-white eyes', 0],
    [/ガラス玉の目|ガラスの目/, 'eyes', 'glossy glass-bead eyes', 1],
    [/眼窩に青い光|眼窩に光|空洞の眼窩|眼窩/, 'eyes', 'empty eye sockets glowing with faint light', 1],
    [/一つ目|単眼/, 'eyes', 'a single large eye in the middle of the face', 1], [/三つ目/, 'eyes', 'a third eye on the forehead', 1],
    [/赤く光る目|光る目/, 'eyes', 'glowing eyes', 0],
    [/狼の頭/, 'head', 'a wolf head with a long muzzle', 1], [/獣の耳|狼の耳|狐の耳|狐耳|猫耳/, 'head', 'pointed furry animal ears', 0],
    [/二本の角|角が生え|角のある|頭の角/, 'head', 'horns', 0], [/長く伸びた首|伸びる首|首が伸び/, 'head', 'a very long stretching neck', 1],
    [/灰緑色に腐った肌|腐った肌|腐りかけた肌|腐った皮膚/, 'skin', 'rotting grey-green skin', 1],
    [/灰色の毛皮|毛皮|毛むくじゃら/, 'skin', 'fur covering the body', 1],
    [/鱗|うろこ/, 'skin', 'scales on the skin', 1],
    [/陶器の肌|白磁の肌/, 'skin', 'smooth white porcelain skin', 1],
    [/青白い肌|血の気のない肌|土気色の肌/, 'skin', 'pale bloodless skin', 0],
    [/半透明の緑色の/, 'skin', 'translucent glossy green gel', 1], [/半透明の|透き通った体|透けた体/, 'skin', 'translucent', 1],
    [/球体関節/, 'body', 'visible ball joints at the shoulders, elbows and wrists', 1],
    [/不定形の体|ゲル状の体|どろどろの体/, 'body', 'an amorphous dripping gelatinous body', 1],
    [/中に骨が浮いている|骨が透けて/, 'body', 'bones suspended inside its translucent body', 1],
    [/触手/, 'body', 'writhing tentacles', 1], [/翼|羽根の生えた/, 'body', 'wings on the back', 0],
    [/体は大蛇の胴体|大蛇の胴体|蛇の(?:胴体|体|下半身)|下半身が蛇/, 'lower', 'a long scaly serpent body in place of legs, coiled on the ground', 1],
    [/蛇の尾|尻尾|長い尾/, 'lower', 'a long tail', 0],
    [/腕はカマキリの鎌|カマキリの(?:鎌|腕)|鎌の腕|腕が鎌/, 'arms', 'praying-mantis scythe forelimbs in place of arms', 1],
    [/腕が四本|四本の腕|多腕/, 'arms', 'four arms', 1], [/鋭い爪|長い爪|鉤爪/, 'arms', 'long sharp claws', 0],
    [/宙に浮いている|宙に浮き|宙に浮く|浮遊している|浮かんでいる|宙に漂/, 'motion', 'floating in the air above the ground', 1],
    [/足がない|足のない/, 'motion', 'legs fading into mist', 1],
    [/足を引きずって歩く|足を引きずる/, 'pose', 'a stiff lurching posture, dragging one foot', 0],
    [/片腕をだらりと垂らし|腕をだらりと/, 'pose', 'one arm hanging limp', 0],
    [/色褪せたボロ制服|色褪せたボロボロの制服|ボロボロの制服/, 'clothes', 'a faded, tattered school uniform', 0],
    [/破れた作業着/, 'clothes', 'torn work clothes', 0], [/錆びた鎧/, 'clothes', 'rusted armor', 0], [/革の鎧/, 'clothes', 'leather armor', 0],
    [/ぼろぼろのマント|ボロボロのマント/, 'clothes', 'a tattered cloak', 0], [/古い赤いドレス/, 'clothes', 'an old red dress', 0],
    [/赤いロングコート/, 'clothes', 'a red long coat', 0], [/紺色の着物/, 'clothes', 'a navy kimono', 0], [/白装束|白い着物/, 'clothes', 'a white burial kimono', 0],
    [/包帯/, 'clothes', 'old bandages wrapped around the body', 0],
    [/血まみれ|血に染まった/, 'clothes', 'blood-stained clothes', 0],
    [/金髪の巻き毛/, 'hair', 'curly blonde hair', 0], [/黒髪の長髪|長い黒髪/, 'hair', 'long black hair', 0],
    [/濡れた長い髪|濡れた髪/, 'hair', 'wet hair hanging down', 0], [/髪で顔が隠れ|顔を髪で隠/, 'hair', 'hair hanging over the face', 0]
  ];
  var NH1_SLOT_JA = { base: '種類', face: '顔', eyes: '目', mouth: '口', head: '頭', skin: '肌', body: '体', arms: '腕', lower: '下半身', motion: '動き', pose: '姿勢', clothes: '服', hair: '髪', build: '体格', rest: 'ほか' };
  var NH1_JA_SLOT = (function () { var o = {}; for (var k in NH1_SLOT_JA) if (Object.prototype.hasOwnProperty.call(NH1_SLOT_JA, k)) o[NH1_SLOT_JA[k]] = k; return o; })();
  var NH1_ROSTER_NH = /怪異|妖怪|幽霊|亡霊|化け物|怪物|魔物|霊/;
  var NH1_HEAD = /^【(人外|混合)(?:（([^（）【】]{1,12})）)?】/;
  function nh1Strong(p) { return p.strong === 1; }   /* a phrase that is clearly not a human body (featureless face, serpent body…). Animal ears, horns, wings, pale skin, glowing eyes are NOT strong (cute / fantasy humans keep the human prompt) */
  /* free Japanese text → draft. opt.rosterKind: the roster 種別; opt.isVisual(clause): keeps a left-over clause only if it is a look phrase */
  function nh1Draft(desc, opt) {
    opt = opt || {};
    var text = String(desc == null ? '' : desc).normalize('NFC');
    var clauses = text.split(/[、。・\n／]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    var base = null, baseForm = null, baseJa = '', kind = null, parts = [], rest = [];
    clauses.forEach(function (cl) {
      var r = cl, i, m;
      for (i = 0; i < NH1_PART.length; i++) { m = NH1_PART[i][0].exec(r); if (m) { var en = NH1_PART[i][2]; if (!parts.some(function (p) { return p.en === en; })) parts.push({ slot: NH1_PART[i][1], ja: m[0], en: en, strong: NH1_PART[i][3] }); r = r.replace(m[0], '\u0000'); } }
      if (!base) for (i = 0; i < NH1_BASE.length; i++) { m = NH1_BASE[i][0].exec(r); if (m) { base = NH1_BASE[i][1]; baseForm = NH1_BASE[i][2]; kind = NH1_BASE[i][3]; baseJa = m[0]; r = r.replace(m[0], '\u0000'); break; } }
      r.split('\u0000').forEach(function (x) { x = x.replace(/^[のでとがはをにも、]+|[のでとがはをにもし、]+$/g, '').trim(); if (x && (typeof opt.isVisual !== 'function' || opt.isVisual(x))) rest.push(x); });
    });
    var strong = parts.filter(nh1Strong), form = 'human';
    if (base && baseForm !== 'soft') form = baseForm; else if (strong.length) form = 'mixed';
    var rk = String(opt.rosterKind || '');
    if (form === 'human' && NH1_ROSTER_NH.test(rk) && parts.length) form = 'mixed';
    if (!base && NH1_ROSTER_NH.test(rk) && parts.some(function (p) { return p.slot === 'motion'; })) { base = 'ghostly apparition'; baseJa = '霊のような存在'; baseForm = 'nonhuman'; form = 'nonhuman'; kind = 'spirit'; }   /* written into the draft as 種類：霊のような存在 (the Owner can edit it) */
    if (!kind && form !== 'human') kind = NH1_ROSTER_NH.test(rk) ? 'spirit' : 'creature';
    return { v: NH1_VER, form: form, base: base, baseJa: baseJa, kind: kind, parts: parts, restJa: rest };
  }
  /* draft → labeled Japanese (≤ 400 chars, the profile.appearance limit). null for a human */
  function nh1Labeled(d, kindJa, compOld) {
    if (!d || d.form === 'human') return null;
    var by = {}; d.parts.forEach(function (p) { (by[p.slot] = by[p.slot] || []).push(p.ja); });
    var seg = [];
    if (d.baseJa) seg.push('種類：' + d.baseJa);
    ['face', 'eyes', 'mouth', 'head', 'skin', 'body', 'arms', 'lower', 'motion', 'pose', 'clothes', 'hair', 'build'].forEach(function (k) { if (by[k]) seg.push(NH1_SLOT_JA[k] + '：' + by[k].join('・')); });
    if (d.restJa.length) seg.push('ほか：' + d.restJa.join('・'));
    var k = String(kindJa || '').replace(/[（）【】／：・|]/g, '').slice(0, 12);
    var s = '【' + (d.form === 'nonhuman' ? '人外' : '混合') + (k ? '（' + k + '）' : '') + '】' + seg.join('／');
    if (s.length > 400) s = s.slice(0, 400).replace(/[／・][^／・]*$/, '');
    if (compOld && s.length + 6 <= 400) s += '／構図：' + NH1_COMP_OLD_JA;   /* ★NH1b: kill の印（6 字）。400 字を超えるときは付けない（その 1 人は新しい構図のまま）。表示・編集は他の句と同じ */
    return s;
  }
  function nh1IsLabeled(text) { return NH1_HEAD.test(String(text == null ? '' : text).normalize('NFC').trim()); }
  /* labeled Japanese → { form, kindJa, base, baseJa, kind, parts: [{ slot, ja, en | null }] }. Values without a dictionary match keep en = null (the Worker translates them). */
  function nh1Parse(text) {
    var t = String(text == null ? '' : text).normalize('NFC').trim(), h = NH1_HEAD.exec(t);
    if (!h) return null;
    var out = { v: NH1_VER, form: h[1] === '人外' ? 'nonhuman' : 'mixed', kindJa: h[2] || '', base: null, baseJa: '', kind: null, parts: [], comp: '' };
    t.slice(h[0].length).split('／').forEach(function (seg) {
      var m = /^([^：]{1,4})：(.*)$/.exec(seg.trim()); if (!m) { if (seg.trim()) out.parts.push({ slot: 'rest', ja: seg.trim(), en: null }); return; }
      if (m[1] === '構図') { if (m[2].trim() === NH1_COMP_OLD_JA) out.comp = 'old'; return; }   /* ★NH1b: 構図の印は部位ではない（訳さない・注文文に入れない） */
      var slot = NH1_JA_SLOT[m[1]] || 'rest';
      m[2].split('・').map(function (x) { return x.trim(); }).filter(Boolean).forEach(function (v) {
        var i, mm;
        if (slot === 'base') { for (i = 0; i < NH1_BASE.length; i++) { mm = NH1_BASE[i][0].exec(v); if (mm && mm[0] === v) { out.base = NH1_BASE[i][1]; out.baseJa = v; out.kind = NH1_BASE[i][3]; return; } } out.parts.push({ slot: 'base', ja: v, en: null }); return; }
        for (i = 0; i < NH1_PART.length; i++) { mm = NH1_PART[i][0].exec(v); if (mm && mm[0] === v) { out.parts.push({ slot: slot === 'rest' ? NH1_PART[i][1] : slot, ja: v, en: NH1_PART[i][2] }); return; } }
        out.parts.push({ slot: slot, ja: v, en: null });
      });
    });
    if (!out.kind) out.kind = NH1_ROSTER_NH.test(out.kindJa) ? 'spirit' : 'creature';
    return out;
  }
  /* look slots of the non-human dictionary found in any text: { 'nh_face': 1, ... } (counted next to MIDICON's look slots) */
  function nh1SlotsJa(text) {
    var t = String(text == null ? '' : text), o = {};
    for (var i = 0; i < NH1_PART.length; i++) { NH1_PART[i][0].lastIndex = 0; if (NH1_PART[i][0].test(t)) o['nh_' + NH1_PART[i][1]] = 1; }
    for (var j = 0; j < NH1_BASE.length; j++) if (NH1_BASE[j][0].test(t)) { o.nh_base = 1; break; }
    return o;
  }
  /* anchor words of a figure (for the generic-handle path): the non-human dictionary phrases found in its appearance text.
     nh1AnchorsS → [{ w, s }] with the slot ('hair' anchors do not count as the required non-hair anchor) */
  function nh1AnchorsS(text) {
    var t = String(text == null ? '' : text), o = [], seen = {};
    for (var i = 0; i < NH1_PART.length; i++) { var m = NH1_PART[i][0].exec(t); if (m && !seen[m[0]]) { seen[m[0]] = 1; o.push({ w: m[0], s: NH1_PART[i][1] }); } }
    for (var j = 0; j < NH1_BASE.length; j++) { var b = NH1_BASE[j][0].exec(t); if (b && !seen[b[0]]) { seen[b[0]] = 1; o.push({ w: b[0], s: 'base' }); break; } }
    return o;
  }
  function nh1Anchors(text) { return nh1AnchorsS(text).map(function (x) { return x.w; }); }
  /* the image prompt for a non-human / mixed figure.
     o = { presetId, tone: 'horror' | 'normal', form, base, gender: 'woman' | 'man' | '', parts: [{ slot, en }], details: [en], traits: 'k v, …' }
     GPT #127-RY: ① never darker than the art preset + story mood (a bright fantasy spirit stays bright) ② the framing always includes every listed part
     ③ no negation words, no 'silhouette' / 'shadow' (they draw a black figure) */
  var NH1_STYLE = {
    'chronicle_beautiful_novel_v1@1': { normal: 'elegant light-novel illustration of a supernatural being, delicate refined linework, painterly rendering, soft natural lighting, gentle harmonious colors, subtle painterly background, high quality, single figure, no text, no watermark',
      horror: 'elegant light-novel illustration of a supernatural being, delicate refined linework, painterly rendering, cold pale lighting, subdued colors, subtle painterly background, high quality, single figure, no text, no watermark' },
    'chronicle_cool_stylish_v1@1': { normal: 'cool stylish anime illustration of a supernatural being, sharp clean lines, high-contrast cinematic rim lighting, sleek modern color grading, minimal background, high quality, single figure, no text, no watermark',
      horror: 'cool stylish anime illustration of a supernatural being, sharp clean lines, high-contrast cinematic rim lighting, cold desaturated color grading, minimal background, high quality, single figure, no text, no watermark' },
    'chronicle_dark_vn_v1@1': { normal: 'dark fantasy visual-novel illustration of a supernatural being, detailed rendering, dim moody lighting, muted desaturated colors, dark shadowy background, somber gothic atmosphere, high quality, single figure, no text, no watermark',
      horror: 'dark fantasy visual-novel illustration of a supernatural being, detailed rendering, dim moody lighting, muted desaturated colors, dark shadowy background, somber gothic horror atmosphere, high quality, single figure, no text, no watermark' }
  };
  var NH1_ORDER = ['lower', 'arms', 'body', 'motion', 'head', 'face', 'mouth', 'eyes', 'skin', 'pose', 'hair', 'clothes', 'build', 'base', 'rest'];
  var NH1_PLAN = { lower: 1, arms: 1, body: 1, motion: 1 };
  /* ---- NH1 (iconx1) composition — kept byte-for-byte as the kill path (comp 'old') ---- */
  function nh1FramingOld(o) {
    var s = {}; (o.parts || []).forEach(function (p) { s[p.slot] = 1; });
    if (s.lower || s.motion || s.pose || /zombie|skeleton|slime|doll|mummy/.test(String(o.base || ''))) return 'full-body figure, the whole body visible from head to toe';
    if (s.arms || s.body || s.clothes) return 'upper-body figure from head to waist, arms and torso visible';
    return 'upper-body portrait, head and torso visible';
  }
  /* ---- NH1b composition for the round icon (GPT #127-SA ②). The icon is a 56–72 px circle: a full-body figure leaves the face about 7% of the frame.
     Rule: the figure is never reduced to a bare face, but the parts that identify it are brought near the centre and large, and a part that would need the whole body
     (serpent lower body, floating, a shambling gait) is made to fit by coiling / looking up / cutting at the knees. A circle clips the four corners, so nothing identifying sits there.
     Tier priority: lower > motion > whole-body species or pose > arms / body > face-only (face / mouth / eyes / skin / clothes only). Extras are added for arms and tentacles. No negation words, no silhouette / shadow. */
  var NH1B_EN = {   /* part wording that assumed the whole body in the frame (ground, feet) → wording that works in the tight frame. Only used by comp 'b'. */
    'floating in the air above the ground': 'hovering weightlessly, hair and sleeves drifting upward',
    'a long scaly serpent body in place of legs, coiled on the ground': 'a long scaly serpent body in place of legs, coiled into a tight spiral below the waist',
    'a stiff lurching posture, dragging one foot': 'a stiff lurching posture, shoulders slumped and head hanging forward'
  };
  var NH1B_TIER = {
    lower: 'centered compact composition, the upper body rising from a tight coil of the lower body that fills the bottom third of the frame, head and face large near the middle',
    motion: 'low-angle view looking up at the figure from slightly below, knees and above, hair and clothing drifting upward, soft mist at the bottom edge, head and face large near the middle',
    whole: 'three-quarter view from the knees up, leaning toward the viewer, head and face large near the middle, the body filling the frame',
    waist: 'waist-up figure centered and filling the frame, head and face large near the middle',
    face: 'tight bust portrait, head and shoulders filling the frame, face large and centered'
  };
  function nh1Framing(o) {
    var s = {}; (o.parts || []).forEach(function (p) { s[p.slot] = 1; });
    var whole = /zombie|skeleton|slime|doll|mummy/.test(String(o.base || ''));
    var tier = s.lower ? 'lower' : s.motion ? 'motion' : (whole || s.pose) ? 'whole' : (s.arms || s.body) ? 'waist' : 'face';
    var t = NH1B_TIER[tier];
    if (/slime/.test(String(o.base || ''))) t = 'centered close view, the rounded body mass filling the frame, the visible inner details near the middle';
    if (s.arms && tier !== 'face') t += ', the arms raised and spread outward at both sides so they stay inside the frame';
    if ((o.parts || []).some(function (p) { return /tentacle/.test(p.en); }) && !s.lower && tier !== 'face') t += ', the tentacles curling around the figure inside the frame';
    return t + ', simple uncluttered background';
  }
  function nh1Prompt(o) {
    var st = NH1_STYLE[o.presetId] || NH1_STYLE['chronicle_dark_vn_v1@1'], tone = o.tone === 'horror' ? 'horror' : 'normal';
    var g = o.gender === 'woman' || o.gender === 'man' ? o.gender : '';
    var b = String(o.base || '');
    var old = o.comp === 'old';
    var subj = o.form === 'nonhuman' ? (b || 'supernatural being') + (g && /ghost|apparition/.test(b) ? ' of a ' + g : '')
      : (b ? b : 'uncanny hybrid being, ' + (g ? 'a ' + g : 'a person') + ' with non-human body parts');
    var ps = (o.parts || []).filter(function (p) { return p && p.en; }).map(function (p) { return { slot: p.slot, en: (!old && NH1B_EN[p.en]) || p.en }; }).sort(function (x, y) { return NH1_ORDER.indexOf(x.slot) - NH1_ORDER.indexOf(y.slot); });
    var plan = ps.filter(function (p) { return NH1_PLAN[p.slot]; }).map(function (p) { return p.en; });
    var feat = ps.filter(function (p) { return !NH1_PLAN[p.slot]; }).map(function (p) { return p.en; });
    var hasFace = ps.some(function (p) { return p.slot === 'face'; });
    var mood = tone === 'horror' ? 'unsettling, uncanny stillness' + (hasFace || /slime/.test(b) ? '' : ', unsmiling expression') : 'otherworldly';
    var details = (o.details || []).filter(Boolean).join(', ');
    var out = st[tone] + '. ' + (old ? nh1FramingOld({ parts: ps, base: b }) : (o.fx && (o.fx.b || o.fx.c)) ? nh1FramingX({ parts: ps, base: b, fx: o.fx }) : nh1Framing({ parts: ps, base: b })) + '. portrait of one ' + subj +
      (plan.length ? '. body plan: ' + plan.join(', ') : '') + (feat.length ? '. distinctive features: ' + feat.join(', ') : '') +
      (details ? '. details: ' + details : '') + (o.traits ? '. traits: ' + o.traits : '') + '. mood: ' + mood +
      (plan.length ? (old ? '. every listed body part clearly visible in the frame' : '. the listed body parts large and clear near the middle of the frame') : '');
    return out.slice(0, 1800);
  }
  /* ---- NH1 core end ---- */
  /* ---- ICONFIX1 b/c core (laneICONFIX1・2026-11-11・LOCAL) — the same text is inlined into the Pages module v292DfixNH1-nonhuman.js and the Worker.
     Pure functions only, ES5. Used ONLY when the fix is on (device: localStorage v292DfixICONFIX1bOff !== '1'; Worker: env CHR_ICONFIX1B_OFF / CHR_ICONFIX1C_OFF).
     The NH1 core above is not changed (its tables are read, never modified): with the fix off every function above gives the same result as before.
     b (parser): ① a part keeps its colour (「黒い翼」 → black wings, 「緑色の鱗の肌」 → green scales) ② a left-over clause no longer loses a final 「し」 (くちばし)
                 ③ 「虎の毛皮」 is clothing (a tiger-skin loincloth), not body fur ④ a tail that is not a serpent's is a body part, never the coiled lower body
                 ⑤ new species 鬼 (oni) and 狐 (kitsune, the fox spirit — not the beastman) and parts くちばし・甲羅・頭の皿・水かき・一本角・金棒
     c (composition): 骸骨 and 人形 take the close tier (waist-up, face large) instead of the knees-up tier. ---- */
  var FX1_VER = 'fx1';
  var FX1_COLORS = [   /* [Japanese stem, English] longer stems first */
    ['灰緑', 'grey-green'], ['赤黒', 'dark red'], ['青黒', 'blue-black'], ['青白', 'pale bluish-white'], ['赤銅', 'coppery red'], ['真紅', 'crimson'],
    ['漆黒', 'jet-black'], ['純白', 'pure white'], ['ピンク', 'pink'], ['オレンジ', 'orange'],
    ['黒', 'black'], ['白', 'white'], ['赤', 'red'], ['紅', 'crimson'], ['青', 'blue'], ['蒼', 'blue'], ['緑', 'green'], ['黄', 'yellow'], ['茶', 'brown'],
    ['灰', 'grey'], ['金', 'golden'], ['銀', 'silver'], ['紫', 'purple'], ['桃', 'pink'], ['橙', 'orange'], ['紺', 'navy']
  ];
  var FX1_COLOR_SRC = '(?:真っ|深|濃い|薄い)?(' + FX1_COLORS.map(function (c) { return c[0]; }).join('|') + ')(?:色(?:の|い)?|い|の|な|く)';
  var FX1_COLOR_TAIL = new RegExp(FX1_COLOR_SRC + '$');      /* a colour phrase that ends right before a part */
  var FX1_COLOR_HEAD = new RegExp('^' + FX1_COLOR_SRC);      /* a colour phrase at the start of a labeled value */
  var FX1_SKIN_SUFFIX = /^(?:の肌|の皮膚|に覆われた肌|に覆われた皮膚|に覆われた体|の体)/;
  /** @param {*} x @returns {RegExp} */ function fx1Re(x) { return x; }
  /** @param {*} x @returns {string} */ function fx1Src(x) { return x && typeof x.source === 'string' ? x.source : ''; }
  function fx1ColorEn(stem) { for (var i = 0; i < FX1_COLORS.length; i++) if (FX1_COLORS[i][0] === stem) return FX1_COLORS[i][1]; return ''; }
  function fx1Colorize(en, c) {
    if (!c) return en;
    var m = /^(a|an) (.*)$/.exec(en);
    if (m) return (/^[aeiou]/.test(c) ? 'an ' : 'a ') + c + ' ' + m[2];
    return c + ' ' + en;
  }
  /* a colour phrase must be its own word: 「針金の」「黄金の」 are not colours of the next part */
  function fx1ColorOk(before, cm) { var p = before.charAt(before.length - cm[0].length - 1); return !(p && /[一-鿿]/.test(p) && !/^(?:真っ|深|濃い|薄い)/.test(cm[0])); }
  var FX1_BASE_ADD_AFTER_VAMPIRE = [   /* inserted right after 吸血鬼 (so 吸血鬼 stays a vampire) */
    [/赤鬼|青鬼|黒鬼|鬼女|鬼神|大鬼|小鬼|鬼(?=$|[、。・／\s]|で(?!も)|だ|と(?!呼|恐|称|言|い)|の(?!よう|ような|みたい|形相|首))/, 'oni, a Japanese ogre demon with horns', 'mixed', 'yokai', 'oni']
  ];
  var FX1_BASE_ADD_AFTER_BEASTMAN = [   /* after the beastman entries (狐の獣人 stays a beastman) */
    [/九尾の狐|九尾|妖狐|化け狐|白狐|天狐|狐の(?:妖怪|あやかし|化身|精|霊|神)|狐憑き|狐(?=$|[、。・／\s]|で(?!も)|だ|と(?!呼|恐|称|言|い))/, 'kitsune, a Japanese fox spirit with fox ears and fluffy fox tails', 'mixed', 'yokai', 'fox']
  ];
  var FX1_BASE_BEFORE_TENGU = [[/烏天狗|鴉天狗|カラス天狗/, 'karasu-tengu, a crow-headed Japanese mountain yokai', 'mixed', 'yokai']];
  var FX1_BASE = (function () {
    var o = [];
    for (var i = 0; i < NH1_BASE.length; i++) {
      var b = NH1_BASE[i];
      if (/天狗/.test(fx1Src(b[0]))) o = o.concat(FX1_BASE_BEFORE_TENGU);
      o.push(b);
      if (/吸血鬼/.test(fx1Src(b[0]))) o = o.concat(FX1_BASE_ADD_AFTER_VAMPIRE);
      if (fx1Src(b[0]) === '獣人') o = o.concat(FX1_BASE_ADD_AFTER_BEASTMAN);
    }
    return o;
  })();
  /* the 鬼 word must not be part of a word like 仕事の鬼 / 鬼教官 (lookahead handles the right side; the left side is checked here) */
  function fx1BaseOk(entry, r, m) {
    if (entry[4] !== 'oni' && entry[4] !== 'fox') return true;
    if (m[0].length > 1) return true;                               /* 赤鬼・九尾の狐 … are always species words */
    var p = r.charAt(m.index - 1);
    return !(p === 'の' || /[一-鿿]/.test(p));               /* 仕事の鬼・餓鬼・天邪鬼・雌狐 … are not the species */
  }
  var FX1_PART_ADD = [   /* checked before the NH1 parts */
    [/くちばし|嘴|クチバシ/, 'mouth', 'a hard bird-like beak', 1],
    [/背中に甲羅|亀の甲羅|甲羅/, 'body', 'a turtle shell on the back', 1],
    [/頭頂の皿|頭の皿|頭に皿/, 'head', 'a round dish-shaped plate on top of the head', 1],
    [/水かき|水掻き/, 'arms', 'webbed hands', 1],
    [/一本角|一本の角|額の角|額に角/, 'head', 'a single horn on the forehead', 0],
    [/頭に二本の角|角が二本|鋭い角|大きな角|曲がった角/, 'head', 'horns', 0],
    [/金棒/, 'clothes', 'a spiked iron club in hand', 0],
    [/虎の毛皮の腰巻き?|虎の毛皮|虎皮の腰巻き?|虎柄の(?:腰巻き?|褌|ふんどし|布)/, 'clothes', 'a tiger-skin loincloth', 0],
    [/毛皮の(?:腰巻き?|マント|コート|外套|服)|毛皮をまと(?:い|う|った)|毛皮を纏(?:い|う|った)/, 'clothes', 'an animal-fur garment', 0],
    [/九本の(?:尻尾|尾)|九つの(?:尻尾|尾)|九尾の尻尾/, 'body', 'nine fluffy fox tails fanning out behind', 0],
    [/(?:二|三|四|五|六|七|八|複数の|何本もの)(?:本の)?(?:尻尾|尾)/, 'body', 'several fluffy tails fanning out behind', 0],
    [/狐の(?:尻尾|尾)/, 'body', 'a fluffy fox tail', 0],
    [/蛇の尾/, 'lower', 'a long scaly serpent tail', 1]
  ];
  var FX1_PART = (function () {
    var o = FX1_PART_ADD.slice();
    for (var i = 0; i < NH1_PART.length; i++) {
      var p = NH1_PART[i];
      if (fx1Src(p[0]) === '蛇の尾|尻尾|長い尾') { o.push([/尻尾|長い尾/, 'body', 'a long tail', 0]); continue; }   /* a tail that is not a serpent's is not a lower body */
      if (fx1Src(p[0]) === '灰色の毛皮|毛皮|毛むくじゃら') { o.push([/灰色の毛皮/, 'skin', 'grey fur covering the body', 1], [/毛皮|毛むくじゃら/, 'skin', 'fur covering the body', 1]); continue; }   /* ★b①: the colour stays with the part */
      if (fx1Src(p[0]) === '赤く光る目|光る目') { o.push([/赤く光る目/, 'eyes', 'glowing red eyes', 0], [/光る目/, 'eyes', 'glowing eyes', 0]); continue; }
      if (fx1Src(p[0]) === '眼窩に青い光|眼窩に光|空洞の眼窩|眼窩') { o.push([/眼窩に青い光/, 'eyes', 'empty eye sockets glowing with faint blue light', 1], [/眼窩に光|空洞の眼窩|眼窩/, 'eyes', 'empty eye sockets glowing with faint light', 1]); continue; }
      o.push(p);
    }
    return o;
  })();
  var FX1_COLOR_SKIN = new RegExp(FX1_COLOR_SRC.replace(/\(\?:色\(\?:の\|い\)\?\|い\|の\|な\|く\)$/, '') + '(?:色)?(?:い|の)?肌');   /* 赤い肌・緑色の肌 */
  /* free Japanese text → draft (= nh1Draft with the fixes). Same return shape. */
  function nh1DraftX(desc, opt) {
    opt = opt || {};
    var text = String(desc == null ? '' : desc).normalize('NFC');
    var clauses = text.split(/[、。・\n／]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    var base = null, baseForm = null, baseJa = '', kind = null, parts = [], rest = [];
    clauses.forEach(function (cl) {
      var r = cl, i, m;
      for (i = 0; i < FX1_PART.length; i++) {
        m = fx1Re(FX1_PART[i][0]).exec(r); if (!m) continue;
        var st = m.index, en0 = m.index + m[0].length, en = FX1_PART[i][2];
        var cm = FX1_COLOR_TAIL.exec(r.slice(0, st));
        if (cm && cm[0].length && fx1ColorOk(r.slice(0, st), cm) && r.slice(0, st).indexOf('\u0000', st - cm[0].length) < 0) { st -= cm[0].length; en = fx1Colorize(en, fx1ColorEn(cm[1])); }
        if (FX1_PART[i][1] === 'skin') { var sm = FX1_SKIN_SUFFIX.exec(r.slice(en0)); if (sm) en0 += sm[0].length; }
        var ja = r.slice(st, en0);
        if (!parts.some(function (p) { return p.en === en; })) parts.push({ slot: FX1_PART[i][1], ja: ja, en: en, strong: FX1_PART[i][3] });
        r = r.slice(0, st) + '\u0000' + r.slice(en0);
      }
      m = FX1_COLOR_SKIN.exec(r);
      if (m && fx1ColorOk(r.slice(0, m.index + m[0].length), [m[0]])) { var ce = fx1ColorEn(m[1]) + ' skin'; if (!parts.some(function (p) { return p.en === ce; })) parts.push({ slot: 'skin', ja: m[0], en: ce, strong: 0 }); r = r.replace(m[0], '\u0000'); }
      if (!base) for (i = 0; i < FX1_BASE.length; i++) { m = fx1Re(FX1_BASE[i][0]).exec(r); if (m && fx1BaseOk(FX1_BASE[i], r, m)) { base = FX1_BASE[i][1]; baseForm = FX1_BASE[i][2]; kind = FX1_BASE[i][3]; baseJa = m[0]; r = r.replace(m[0], '\u0000'); break; } }
      r.split('\u0000').forEach(function (x) { x = x.replace(/^[のでとがはをにも、]+|(?:をし|[のでとがはをにも、])+$/g, '').trim(); if (x && (typeof opt.isVisual !== 'function' || opt.isVisual(x))) rest.push(x); });   /* ★b②: a final 「し」 is only dropped after を (肌をし), never from a word (くちばし) */
    });
    var strong = parts.filter(nh1Strong), form = 'human';
    if (base && baseForm !== 'soft') form = baseForm; else if (strong.length) form = 'mixed';
    var rk = String(opt.rosterKind || '');
    if (form === 'human' && NH1_ROSTER_NH.test(rk) && parts.length) form = 'mixed';
    if (!base && NH1_ROSTER_NH.test(rk) && parts.some(function (p) { return p.slot === 'motion'; })) { base = 'ghostly apparition'; baseJa = '霊のような存在'; baseForm = 'nonhuman'; form = 'nonhuman'; kind = 'spirit'; }
    if (!kind && form !== 'human') kind = NH1_ROSTER_NH.test(rk) ? 'spirit' : 'creature';
    return { v: NH1_VER, form: form, base: base, baseJa: baseJa, kind: kind, parts: parts, restJa: rest, fx: FX1_VER };
  }
  /* one labeled value → { slot, en } with the fixes (exact part, colour + part, part + skin suffix, colour + 肌). null = no dictionary match */
  function fx1PartOf(v, slot) {
    var i, mm, w = v;
    var exact = function (s) { for (var k = 0; k < FX1_PART.length; k++) { var q = fx1Re(FX1_PART[k][0]).exec(s); if (q && q[0] === s) return FX1_PART[k]; } return null; };
    var p = exact(w); if (p) return { slot: slot === 'rest' ? p[1] : slot, en: p[2], pslot: p[1] };
    var c = '', cm = FX1_COLOR_HEAD.exec(w);
    if (cm && cm[0].length < w.length) { c = fx1ColorEn(cm[1]); w = w.slice(cm[0].length); }
    var w2 = w.replace(/(?:の|に覆われた)(?:肌|皮膚|体)$/, '');
    p = exact(w) || (w2 !== w ? exact(w2) : null);
    if (p && (c || w2 !== w)) { if (w2 !== w && p[1] !== 'skin' && !exact(w)) return null; return { slot: slot === 'rest' ? p[1] : slot, en: fx1Colorize(p[2], c), pslot: p[1] }; }
    mm = FX1_COLOR_SKIN.exec(v); if (mm && mm[0] === v) return { slot: slot === 'rest' ? 'skin' : slot, en: fx1ColorEn(mm[1]) + ' skin', pslot: 'skin' };
    return null;
  }
  /* labeled Japanese → same shape as nh1Parse, with the fixed dictionary */
  function nh1ParseX(text) {
    var t = String(text == null ? '' : text).normalize('NFC').trim(), h = NH1_HEAD.exec(t);
    if (!h) return null;
    var out = { v: NH1_VER, form: h[1] === '人外' ? 'nonhuman' : 'mixed', kindJa: h[2] || '', base: null, baseJa: '', kind: null, parts: [], comp: '', fx: FX1_VER };
    t.slice(h[0].length).split('／').forEach(function (seg) {
      var m = /^([^：]{1,4})：(.*)$/.exec(seg.trim()); if (!m) { if (seg.trim()) out.parts.push({ slot: 'rest', ja: seg.trim(), en: null }); return; }
      if (m[1] === '構図') { if (m[2].trim() === NH1_COMP_OLD_JA) out.comp = 'old'; return; }
      var slot = NH1_JA_SLOT[m[1]] || 'rest';
      m[2].split('・').map(function (x) { return x.trim(); }).filter(Boolean).forEach(function (v) {
        var i, mm;
        if (slot === 'base') { for (i = 0; i < FX1_BASE.length; i++) { mm = fx1Re(FX1_BASE[i][0]).exec(v); if (mm && mm[0] === v) { out.base = FX1_BASE[i][1]; out.baseJa = v; out.kind = FX1_BASE[i][3]; return; } } out.parts.push({ slot: 'base', ja: v, en: null }); return; }
        var q = fx1PartOf(v, slot);
        if (q) {
          var sl = q.slot;
          if (sl === 'lower' && q.pslot !== 'lower') sl = q.pslot;          /* ★b④: 「下半身：九本の尻尾」（古い下書き）も体の部位 */
          if (sl === 'skin' && q.pslot === 'clothes') sl = 'clothes';       /* ★b③: 「肌：虎の毛皮」（古い下書き）は服 */
          out.parts.push({ slot: sl, ja: v, en: q.en }); return;
        }
        out.parts.push({ slot: slot, ja: v, en: null });
      });
    });
    if (!out.kind) out.kind = NH1_ROSTER_NH.test(out.kindJa) ? 'spirit' : 'creature';
    return out;
  }
  /* composition with the fixes. fx = { b: 1|0, c: 1|0 }. comp 'old' never reaches here. */
  var FX1C_TIER = 'three-quarter view from the waist up, leaning toward the viewer, head and face large near the middle, the body filling the frame';
  function nh1FramingX(o) {
    var fx = o.fx || {}, s = {}, ps = o.parts || [], b = String(o.base || '');
    ps.forEach(function (p) { s[p.slot] = 1; });
    if (fx.b && s.lower && !ps.some(function (p) { return p.slot === 'lower' && /serpent|snake|coil/.test(p.en); })) { delete s.lower; s.body = 1; }   /* ★b④: a tail is not a coiled lower body */
    var whole = /zombie|skeleton|slime|doll|mummy/.test(b);
    var tier = s.lower ? 'lower' : s.motion ? 'motion' : (whole || s.pose) ? 'whole' : (s.arms || s.body) ? 'waist' : 'face';
    var t = NH1B_TIER[tier];
    if (fx.c && tier === 'whole' && /skeleton|doll/.test(b)) t = FX1C_TIER;   /* ★c: 骸骨・人形は腰から上（顔を丸の中で大きく） */
    if (/slime/.test(b)) t = 'centered close view, the rounded body mass filling the frame, the visible inner details near the middle';
    if (s.arms && tier !== 'face') t += ', the arms raised and spread outward at both sides so they stay inside the frame';
    if (ps.some(function (p) { return /tentacle/.test(p.en); }) && !s.lower && tier !== 'face') t += ', the tentacles curling around the figure inside the frame';
    return t + ', simple uncluttered background';
  }
  /* ---- ICONFIX1 b/c core end ---- */
  /* ---- ICONFIX2 a core (laneICONFIX2・2026-11-14・LOCAL・GPT #127-TN icons (1)) — device only for now (the Worker keeps its own NH1/FX1 tables:
     a value this table knows but the Worker does not is translated there by ER1x, as before for any unknown part).
     Pure functions only, ES5. Used ONLY when the fix is on (device: localStorage v292DfixICONFIX2aOff !== '1' and v292DfixICONFIX1bOff !== '1').
     The NH1 / FX1 tables above are read, never modified: with the fix off every function above gives the same result as before.
     ① species words that the dictionary did not know (animal 黒猫, machine ロボット / からくり, amorphous 黒い霧, hybrids ラミア / 人魚) are kept as the species —
        but only when the word is the HEAD of its clause (「大きな黒猫」「黒い霧のかたまり」), never as an object or a modifier (「猫を抱いた少女」「猫背」「霧の中に立つ女」)
     ② ambiguous (a species head AND a human head in the same description: 「昼は少女、夜は黒猫」) → mixed, never silently human
     ③ body-structure / material / key-prop phrases are kept: 「下半身が緑色の大蛇の女」 → the serpent lower body (+ the colour words kept as a second value),
        歯車・金属の体・レンズの目・無数の目・二股の尻尾・刀・羽団扇・大男
     ④ the left-over clauses of a non-human figure are kept when they describe its body / material / props (keepRest), not only the human look words ---- */
  var FX2_VER = 'fx2a';
  var FX2_HUMAN_HEAD = /(?:少女|少年|女性|男性|女の子|男の子|青年|老人|老婆|老爺|紳士|婦人|淑女|娘|人間|女|男)$/;
  var FX2_COPULA = /^(?:で(?:ある|す|した)?|だ(?:った)?|です|でした|である)?$/;
  var FX2_BASE_ADD = [   /* [regex, English, form, kind, tag, kindJa, implied lower part ja] — checked AFTER the NH1/FX1 species (they keep priority) */
    [/ラミア|半人半蛇|蛇女/, 'lamia, a woman whose lower body is a long serpent tail', 'mixed', 'yokai', 'hybrid', '', '下半身が蛇'],
    [/人魚|マーメイド/, 'mermaid, a woman with a long fish tail in place of legs', 'mixed', 'yokai', 'hybrid', '', '下半身が魚の尾'],
    [/ケンタウロス|半人半馬/, 'centaur, a human upper body on a horse body', 'mixed', 'creature', 'hybrid', '', ''],
    [/アラクネ|女郎蜘蛛|半人半蜘蛛/, 'arachne, a woman whose lower body is a giant spider', 'mixed', 'yokai', 'hybrid', '', ''],
    [/アンドロイド|ガイノイド/, 'android, a humanoid machine with visible mechanical seams', 'mixed', 'creature', 'machine', '機械', ''],
    [/ロボット|機械人形|自動人形|オートマタ|オートマトン|ゴーレム|人型の機械|人型機械|機械兵|からくり(?!人形|仕掛け)/, 'mechanical automaton', 'nonhuman', 'creature', 'machine', '機械', ''],
    [/猫又|ねこまた|化け猫|(?:大きな|巨大な|小さな|黒い|白い)?(?:黒猫|白猫|三毛猫|野良猫|猫|ねこ|ネコ)/, 'cat, a four-legged animal', 'nonhuman', 'yokai', 'animal', '動物', ''],
    [/(?:大きな|巨大な|黒い|白い)?(?:黒犬|白犬|野良犬|山犬|狼|オオカミ|犬|いぬ|イヌ)/, 'dog-like four-legged animal', 'nonhuman', 'creature', 'animal', '動物', ''],
    [/(?:大きな|巨大な|白い|黒い)?(?:大蛇|白蛇|蛇)/, 'giant serpent', 'nonhuman', 'creature', 'animal', '動物', ''],
    [/(?:大きな|巨大な)?(?:大蜘蛛|蜘蛛)/, 'giant spider', 'nonhuman', 'creature', 'animal', '動物', ''],
    [/(?:大きな|巨大な|黒い)?(?:大烏|大鴉|烏|鴉|カラス|梟|フクロウ|鷹|鷲)/, 'large bird', 'nonhuman', 'creature', 'animal', '動物', ''],
    [/(?:大きな|巨大な)?(?:狸|たぬき|タヌキ|兎|うさぎ|ウサギ|熊|鼠|ネズミ|鹿|猿|虎|獅子|ライオン)/, 'animal', 'nonhuman', 'creature', 'animal', '動物', ''],
    [/竜|龍|ドラゴン/, 'dragon', 'nonhuman', 'creature', 'animal', '動物', ''],
    [/(?:黒い|白い|灰色の|赤い)?(?:霧|靄|煙)(?:の(?:かたまり|塊|渦|柱))?|(?:黒い|白い)?(?:霧|煙)の(?:ような|ような姿の)?(?:もの|存在)/, 'a shapeless mass of dark mist', 'nonhuman', 'spirit', 'amorphous', '不定形', '']
  ];
  var FX2_BASE = FX1_BASE.concat(FX2_BASE_ADD);
  var FX2_IDIOM = /負け犬|狂犬|番犬|忠犬|飼い犬|泥棒猫|猫かぶり|猫を被|猫背|猫舌|猫なで|猫撫で|猫目|猫耳|猫っ毛|猫可愛がり|猫の額|猫の手|一匹狼|送り狼|虎の子|虎の威|熊手|鷹揚|招き猫|竜胆|登竜門|煙たい|煙草|煙管|闇市|闇金|闇夜|影武者|影絵|影響|面影|人影|月影|鼠色|ねずみ色|狸寝入り|狐につま|蛇足|蛇口|鹿威し|猿芝居|鷲鼻|鷹の目|兎に角|うさぎ跳び/g;
  var FX2_SERPENT_LOWER = /下半身が([^、。・／\u0000]{0,10}?)(大蛇|蛇)(?:の(?:胴体|体|尾|姿))?/;   /* 「下半身が緑色の大蛇」→ 下半身が蛇（Worker が知っている形）＋ 緑色の大蛇（色の語は残す・Worker の ER1x が訳す） */
  var FX2_PART_ADD = [   /* checked before the FX1 parts */
    [/胸の窓から歯車が見える|胸の窓に歯車|胸の歯車|体の歯車|歯車の(?:体|胸|心臓)|(?:胸|体|腹)から歯車が(?:見える|のぞく)/, 'body', 'brass gears visible through a small window in the chest', 1],
    [/錆の浮いた金属の体|錆びた金属の体|錆だらけの(?:金属の)?体/, 'body', 'a rust-spotted metal body', 1],
    [/金属の体|鋼鉄の体|鉄の体|機械の体|金属製の体|機械仕掛けの体|ブリキの体/, 'body', 'a mechanical metal body', 1],
    [/(?:右|左|片)?(?:目|眼)(?:だけ)?が(?:ガラスの)?レンズ|レンズの(?:目|眼|瞳)/, 'eyes', 'one eye replaced by a round glass lens', 1],
    [/(?:(?:白い|赤い|青い|金色の|黄色い)?目がいくつも|無数の目|いくつもの目|たくさんの目|多数の目|複数の目)(?![にでをか])/, 'eyes', 'many eyes', 1],
    [/二股に分かれた(?:尻尾|尾)|二股の(?:尻尾|尾)|二又の(?:尻尾|尾)|(?:尻尾|尾)が二股|二本の(?:尻尾|尾)/, 'body', 'two tails (a tail forked in two)', 0],
    [/刀を握っている|刀を握り|刀を握った|刀を持っている|刀を持った|刀を持つ|日本刀|刀(?!傷|痕)/, 'clothes', 'a katana held in one hand', 0],
    [/羽団扇/, 'clothes', 'a feathered fan in hand', 0],
    [/大男|巨漢|巨体|大柄/, 'build', 'a huge towering build', 0]
  ];
  var FX2_PART = FX2_PART_ADD.concat(FX1_PART);
  /* the text after a species word inside its clause: the word is the head when nothing (or only a copula) follows, or は / が / も with no human noun after it */
  function fx2Head(r, m, tag) {
    var after = r.slice(m.index + m[0].length).split('\u0000')[0].trim();
    if (FX2_COPULA.test(after)) return true;
    /* 「黒猫は人の言葉を話す」: the topic at the start of the clause (animal / machine only; 「霧が晴れる」 is weather, not a figure) */
    if (tag !== 'amorphous' && /^[\u0001\s]*$/.test(r.slice(0, m.index)) && /^(?:は|も)/.test(after) && !/少女|少年|女性|男性|女の子|男の子|青年|老人|紳士|婦人|娘|人間|女|男/.test(after)) return true;
    return false;
  }
  function fx2BaseOk(entry, r, m) {
    if (!entry[4]) return fx1BaseOk(entry, r, m);
    var p = r.charAt(m.index - 1);
    if (entry[4] === 'animal' && p && /[一-鿿ァ-ヿ]/.test(p) && !/^(?:大|白|黒|三毛|野良|山)/.test(m[0])) return false;   /* 子猫 is fine (head), 招き猫 / 竜人 / 化け猫(handled) … a compound noun is not the animal */
    return fx2Head(r, m, entry[4]);
  }
  /* 「ロボットの少女」「黒猫の娘」「人形の姿をした女」: the species word directly names what a human noun is → ambiguous (mixed), never silently human */
  var FX2_AMB_AFTER = /^の(?:姿をした|姿の|体の)?(?:少女|少年|女性|男性|女の子|男の子|青年|娘|女|男)(?:$|で|だ|です|である|は|が)/;
  function fx2Amb(entry, r, m) {
    if (!entry[4] || entry[4] === 'hybrid') return false;
    var p = r.charAt(m.index - 1);
    if (entry[4] === 'animal' && p && /[一-鿿ァ-ヿ]/.test(p) && !/^(?:大|白|黒|三毛|野良|山)/.test(m[0])) return false;
    return FX2_AMB_AFTER.test(r.slice(m.index + m[0].length).split('\u0000')[0].trim());
  }
  function nh1DraftX2(desc, opt) {
    opt = opt || {};
    var text = String(desc == null ? '' : desc).normalize('NFC');
    var clauses = text.split(/[、。・\n／]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    var base = null, baseForm = null, baseJa = '', kind = null, kindJa = '', parts = [], rest = [], implied = '', tag = '', amb = 0;
    var humanHead = clauses.some(function (cl) { return FX2_HUMAN_HEAD.test(cl.replace(/(?:で(?:ある|す)?|だ|です)$/, '')); });
    var push = function (slot, ja, en, strong) { if (!parts.some(function (p) { return p.en === en && p.ja === ja; })) parts.push({ slot: slot, ja: ja, en: en, strong: strong }); };
    clauses.forEach(function (cl) {
      var r = cl, i, m;
      m = FX2_SERPENT_LOWER.exec(r);
      if (m) {   /* ★③ 下半身が…蛇: the Worker-known form + the user's own modifier words */
        push('lower', '下半身が蛇', 'a long scaly serpent body in place of legs, coiled on the ground', 1);
        var mod = (m[1] || m[2] === '大蛇') ? String(m[1] || '').replace(/^の/, '') + m[2] : '';
        if (mod) push('lower', mod, '', 1);
        r = r.slice(0, m.index) + '\u0000' + r.slice(m.index + m[0].length);
      }
      for (i = 0; i < FX2_PART.length; i++) {
        m = fx1Re(FX2_PART[i][0]).exec(r); if (!m) continue;
        var st = m.index, en0 = m.index + m[0].length, en = FX2_PART[i][2];
        var cm = FX1_COLOR_TAIL.exec(r.slice(0, st));
        if (cm && cm[0].length && fx1ColorOk(r.slice(0, st), cm) && r.slice(0, st).indexOf('\u0000', st - cm[0].length) < 0) { st -= cm[0].length; en = fx1Colorize(en, fx1ColorEn(cm[1])); }
        if (FX2_PART[i][1] === 'skin') { var sm = FX1_SKIN_SUFFIX.exec(r.slice(en0)); if (sm) en0 += sm[0].length; }
        var ja = r.slice(st, en0);
        if (!parts.some(function (p) { return p.en === en; })) parts.push({ slot: FX2_PART[i][1], ja: ja, en: en, strong: FX2_PART[i][3] });
        r = r.slice(0, st) + '\u0000' + r.slice(en0);
      }
      m = FX1_COLOR_SKIN.exec(r);
      if (m && fx1ColorOk(r.slice(0, m.index + m[0].length), [m[0]])) { var ce = fx1ColorEn(m[1]) + ' skin'; if (!parts.some(function (p) { return p.en === ce; })) parts.push({ slot: 'skin', ja: m[0], en: ce, strong: 0 }); r = r.replace(m[0], '\u0000'); }
      var rI = r.replace(FX2_IDIOM, function (w) { return new Array(w.length + 1).join('\u0001'); });   /* idioms (負け犬・猫背・煙草…) are never the species — same length, so indexes stay */
      if (!base) for (i = 0; i < FX2_BASE.length; i++) { var rr = FX2_BASE[i][4] ? rI : r; m = fx1Re(FX2_BASE[i][0]).exec(rr); if (m && !fx2BaseOk(FX2_BASE[i], rr, m) && fx2Amb(FX2_BASE[i], rr, m)) amb = 2; if (m && (amb === 2 || fx2BaseOk(FX2_BASE[i], rr, m))) { base = FX2_BASE[i][1]; baseForm = FX2_BASE[i][2]; kind = FX2_BASE[i][3]; tag = FX2_BASE[i][4] || ''; kindJa = FX2_BASE[i][5] || ''; implied = FX2_BASE[i][6] || ''; baseJa = m[0]; r = r.slice(0, m.index) + '\u0000' + r.slice(m.index + m[0].length); break; } }
      r.split('\u0000').forEach(function (x) { x = x.replace(/^[のでとがはをにも、]+|(?:をし|[のでとがはをにも、])+$/g, '').trim(); if (x && (typeof opt.isVisual !== 'function' || opt.isVisual(x))) rest.push(x); });
    });
    if (implied && !parts.some(function (p) { return p.slot === 'lower'; })) parts.push({ slot: 'lower', ja: implied, en: implied === '下半身が蛇' ? 'a long scaly serpent body in place of legs, coiled on the ground' : 'a long fish tail in place of legs', strong: 1 });   /* ラミア / 人魚 define their lower body */
    var strong = parts.filter(nh1Strong), form = 'human';
    if (base && baseForm !== 'soft') form = baseForm; else if (strong.length) form = 'mixed';
    if (tag && tag !== 'hybrid' && form === 'nonhuman' && (humanHead || amb === 2)) { form = 'mixed'; amb = amb || 1; }   /* ★② a species head and a human head: never silently human, never silently animal */
    var rk = String(opt.rosterKind || '');
    if (form === 'human' && NH1_ROSTER_NH.test(rk) && parts.length) form = 'mixed';
    if (!base && NH1_ROSTER_NH.test(rk) && parts.some(function (p) { return p.slot === 'motion'; })) { base = 'ghostly apparition'; baseJa = '霊のような存在'; baseForm = 'nonhuman'; form = 'nonhuman'; kind = 'spirit'; }
    if (!kind && form !== 'human') kind = NH1_ROSTER_NH.test(rk) ? 'spirit' : 'creature';
    return { v: NH1_VER, form: form, base: base, baseJa: baseJa, kind: kind, kindJa: form === 'human' ? '' : kindJa, parts: parts, restJa: rest, fx: FX1_VER, fx2: FX2_VER, amb: amb, tag: tag };
  }
  /* ★④ a left-over clause of a non-human figure: kept when it describes the body, a material or a prop (not a habit / story / speech) */
  var FX2_KEEP = /体|胴|胸|腹|背|腰|首|頭|手|腕|足|脚|尾|翼|羽|鱗|毛|皮|殻|骨|角|牙|爪|金属|真鍮|鉄|鋼|銅|錆|陶器|磁器|木製|石の|ガラス|レンズ|歯車|ゼンマイ|機械|継ぎ目|関節|霧|煙|靄|炎|光|目|眼|口|刀|剣|槍|弓|杖|斧|銃|盾|鎌|形|姿|大男|巨体|巨漢|大柄|小柄|古い|古びた/;
  var FX2_NONVIS = /話す|喋る|しゃべ|言葉|になると|ときどき|時々|たまに|ことがある|住む|住んで|暮らす|呼ばれ|言われ|噂|伝説|かつて|好む|嫌う|知って|覚えて|名乗/;
  function fx2KeepRest(c) { c = String(c || ''); return FX2_KEEP.test(c) && !FX2_NONVIS.test(c); }
  /* ---- ICONFIX2 a core end ---- */

  function lsGet(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } }
  function on() {
    if (lsGet('v292DfixNH1Off') === '1') return false;
    try { var X = root.__v292DfixADMF1; return !!(X && typeof X.gate === 'function' && X.gate('nh1', false) === true); } catch (e) { return false; }
  }
  var calls = { draft: 0, labeled: 0 };
  function fx2On() { return lsGet('v292DfixICONFIX2aOff') !== '1' && lsGet('v292DfixICONFIX1bOff') !== '1'; }   /* ★ICONFIX2 a (builds on ICONFIX1 b: its kill also turns this off) */
  root.__v292DfixNH1 = {
    ver: NH1_VER + '-iconx1nh1b-fx1-fx2a-20261114', on: on,
    draft: function (t, o) { calls.draft++; if (lsGet('v292DfixICONFIX1bOff') === '1') return nh1Draft(t, o); calls.fx1 = (calls.fx1 || 0) + 1; if (!fx2On() || !(o && o.fx2 === true)) return nh1DraftX(t, o); calls.fx2 = (calls.fx2 || 0) + 1; return nh1DraftX2(t, o); },   /* ★ICONFIX1 b ★ICONFIX2 a: only the caller that asks (LC1prop = STARTICON / 2-tap, a written description). MIDICON (story narrative) keeps fx1 */
    labeled: function (d, k) { calls.labeled++; return nh1Labeled(d, k, lsGet('v292DfixNH1bOff') === '1'); },   /* ★NH1b */
    isLabeled: nh1IsLabeled, parse: nh1Parse, parseX: nh1ParseX, draftX: nh1DraftX, draftX2: nh1DraftX2, draftOld: nh1Draft, slotsJa: nh1SlotsJa, anchors: nh1Anchors, anchorsS: nh1AnchorsS,
    fx2On: fx2On, keepRest: fx2KeepRest,   /* ★ICONFIX2 a: draftX2 / keepRest are pure (LC1prop's fact check reads draftX2 even when this key is off) */
    status: function () { return { ver: NH1_VER, on: on(), killed: lsGet('v292DfixNH1Off') === '1', nh1bKilled: lsGet('v292DfixNH1bOff') === '1', fx1b: lsGet('v292DfixICONFIX1bOff') === '1' ? 0 : FX1_VER, fx1c: lsGet('v292DfixICONFIX1cOff') === '1' ? 0 : 'worker-only', fx2a: fx2On() ? FX2_VER : 0, calls: JSON.parse(JSON.stringify(calls)) }; }
  };
})(typeof window !== 'undefined' ? window : this);
