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
  function nh1Labeled(d, kindJa) {
    if (!d || d.form === 'human') return null;
    var by = {}; d.parts.forEach(function (p) { (by[p.slot] = by[p.slot] || []).push(p.ja); });
    var seg = [];
    if (d.baseJa) seg.push('種類：' + d.baseJa);
    ['face', 'eyes', 'mouth', 'head', 'skin', 'body', 'arms', 'lower', 'motion', 'pose', 'clothes', 'hair', 'build'].forEach(function (k) { if (by[k]) seg.push(NH1_SLOT_JA[k] + '：' + by[k].join('・')); });
    if (d.restJa.length) seg.push('ほか：' + d.restJa.join('・'));
    var k = String(kindJa || '').replace(/[（）【】／：・|]/g, '').slice(0, 12);
    var s = '【' + (d.form === 'nonhuman' ? '人外' : '混合') + (k ? '（' + k + '）' : '') + '】' + seg.join('／');
    return s.length > 400 ? s.slice(0, 400).replace(/[／・][^／・]*$/, '') : s;
  }
  function nh1IsLabeled(text) { return NH1_HEAD.test(String(text == null ? '' : text).normalize('NFC').trim()); }
  /* labeled Japanese → { form, kindJa, base, baseJa, kind, parts: [{ slot, ja, en | null }] }. Values without a dictionary match keep en = null (the Worker translates them). */
  function nh1Parse(text) {
    var t = String(text == null ? '' : text).normalize('NFC').trim(), h = NH1_HEAD.exec(t);
    if (!h) return null;
    var out = { v: NH1_VER, form: h[1] === '人外' ? 'nonhuman' : 'mixed', kindJa: h[2] || '', base: null, baseJa: '', kind: null, parts: [] };
    t.slice(h[0].length).split('／').forEach(function (seg) {
      var m = /^([^：]{1,4})：(.*)$/.exec(seg.trim()); if (!m) { if (seg.trim()) out.parts.push({ slot: 'rest', ja: seg.trim(), en: null }); return; }
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
  function nh1Framing(o) {
    var s = {}; (o.parts || []).forEach(function (p) { s[p.slot] = 1; });
    if (s.lower || s.motion || s.pose || /zombie|skeleton|slime|doll|mummy/.test(String(o.base || ''))) return 'full-body figure, the whole body visible from head to toe';
    if (s.arms || s.body || s.clothes) return 'upper-body figure from head to waist, arms and torso visible';
    return 'upper-body portrait, head and torso visible';
  }
  function nh1Prompt(o) {
    var st = NH1_STYLE[o.presetId] || NH1_STYLE['chronicle_dark_vn_v1@1'], tone = o.tone === 'horror' ? 'horror' : 'normal';
    var g = o.gender === 'woman' || o.gender === 'man' ? o.gender : '';
    var b = String(o.base || '');
    var subj = o.form === 'nonhuman' ? (b || 'supernatural being') + (g && /ghost|apparition/.test(b) ? ' of a ' + g : '')
      : (b ? b : 'uncanny hybrid being, ' + (g ? 'a ' + g : 'a person') + ' with non-human body parts');
    var ps = (o.parts || []).filter(function (p) { return p && p.en; }).slice().sort(function (x, y) { return NH1_ORDER.indexOf(x.slot) - NH1_ORDER.indexOf(y.slot); });
    var plan = ps.filter(function (p) { return NH1_PLAN[p.slot]; }).map(function (p) { return p.en; });
    var feat = ps.filter(function (p) { return !NH1_PLAN[p.slot]; }).map(function (p) { return p.en; });
    var hasFace = ps.some(function (p) { return p.slot === 'face'; });
    var mood = tone === 'horror' ? 'unsettling, uncanny stillness' + (hasFace || /slime/.test(b) ? '' : ', unsmiling expression') : 'otherworldly';
    var details = (o.details || []).filter(Boolean).join(', ');
    var out = st[tone] + '. ' + nh1Framing({ parts: ps, base: b }) + '. portrait of one ' + subj +
      (plan.length ? '. body plan: ' + plan.join(', ') : '') + (feat.length ? '. distinctive features: ' + feat.join(', ') : '') +
      (details ? '. details: ' + details : '') + (o.traits ? '. traits: ' + o.traits : '') + '. mood: ' + mood +
      (plan.length ? '. every listed body part clearly visible in the frame' : '');
    return out.slice(0, 1800);
  }
  /* ---- NH1 core end ---- */

  function lsGet(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } }
  function on() {
    if (lsGet('v292DfixNH1Off') === '1') return false;
    try { var X = root.__v292DfixADMF1; return !!(X && typeof X.gate === 'function' && X.gate('nh1', false) === true); } catch (e) { return false; }
  }
  var calls = { draft: 0, labeled: 0 };
  root.__v292DfixNH1 = {
    ver: NH1_VER + '-iconx1-20261110', on: on,
    draft: function (t, o) { calls.draft++; return nh1Draft(t, o); },
    labeled: function (d, k) { calls.labeled++; return nh1Labeled(d, k); },
    isLabeled: nh1IsLabeled, parse: nh1Parse, slotsJa: nh1SlotsJa, anchors: nh1Anchors, anchorsS: nh1AnchorsS,
    status: function () { return { ver: NH1_VER, on: on(), killed: lsGet('v292DfixNH1Off') === '1', calls: JSON.parse(JSON.stringify(calls)) }; }
  };
})(typeof window !== 'undefined' ? window : this);
