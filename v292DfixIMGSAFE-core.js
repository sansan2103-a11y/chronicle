/* =====================================================================
 * v292DfixIMGSAFE-core.js — 画像の安全確認（画面側の写し・IMGSAFE-X・GPT #127-PK 案X。画面では決まった語だけ＝SEE（既定 OFF）の早めの知らせ）
 *   Worker と同じ判定の区間（/*@@IMGSAFE_CORE_BEGIN … END@@*\/）を、そのままのバイトで持つ（tools/build_pages.py が埋め込み、GATE が一致を確かめる）。
 *   使う所: 「👁 見る」（v292Dfix315 SEE。画面から直接 image.pollinations.ai へ送る経路）＝送る文そのものを確かめ、
 *          未成年らしさ × 性的な描写なら送らずに理由を出す。LC1・キャラ一覧・アイコンの失敗トーストは、Worker の理由に添える分類の文言だけ使う。
 *   通信・保存はしない（判定だけ）。読めなかったとき SEE は描かない（安全側）。
 *   kill（端末だけ）: localStorage v292DfixIMGSAFEOff='1' → SEE の確認をしない（Worker 側の確認は別・env CHR_IMGSAFE_OFF）。
 *   観測口: window.__chrImgSafe = { v, verdict(texts), hint(y, s), seeMsg(v), off(), stats, remember(y, s), last() }
 *   r3: remember / last = Worker が返した分類の 2 語だけを画面の中で 10 分覚える（FLW2 が表示の読み直しの後に分類の一言を出すため。保存・通信なし）
 * ===================================================================== */
(function () {
  if (typeof window === 'undefined' || window.__chrImgSafe) return;
/*@@IMGSAFE_CORE_BEGIN imgsafex@@*/
/* ★IMGSAFE-X（GPT #127-PK 案X）共通の決まった語の判定（Worker と画面で同じバイト）。ES5 だけ・AI は使わない・線形の走査だけ。
   案X では、文脈で意味が変わる語（胸・谷間・濡れた・透ける・色気・誘惑・比べ方・経歴や役割の例外）はここで判定しない＝ER1x の分類（AI）に任せる。
   ここに残すのは、はっきりした組み合わせだけ:
     未成年らしさ = 人をはっきり指す語（少女・女子高生・child・teen など）・18 歳未満の年齢（単位つき、または「見た目は」「looks」「as she was at」の後）・学年
     性的 A = 裸・性行為・下着（否定の言い方でも数える）。性的 B = はっきり性的な見せ方・体の語（AI の分類が無い経路だけ。B は否定の言い方なら数えない）
   mode 'rules'（AI の分類がある経路）= A だけ。'strict'（既定・AI の分類が無い経路）= A と B、未成年らしさに girl / boy も足す。
   文を整える順は r3 と同じ（見えない書式の文字 → NFKC → 合成記号 → 小文字 → 似た形の文字（キリル・ギリシャ・small capital）→ 工口/口リ/一 → かな → 空白）。 */
var CHR_IMGSAFE_V = 'imgsafex';
var CHR_IMGSAFE_RULES_V = 'xg2';   /* ★40 件 run 1 R02: 性的な場面・ポーズ…を act に（床にも効く） */   /* ★X-c: 判定の版（キャッシュの鍵に入れる＝規則を変えたら古い分類は使わない） */
var CHR_IMGSAFE_MAXLEN = 20000;
var CHR_IMGSAFE_BOILER = ['girl next door', 'girl-next-door'];
var CHR_IMGSAFE_INVIS = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF0-\uFFFB]|\uDB40[\uDC00-\uDDEF]|\uD834[\uDD73-\uDD7A]/g;
var CHR_IMGSAFE_COMB = /[\u0300-\u036F\u0483-\u0489\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F\u3099\u309A]/g;
var CHR_IMGSAFE_HG = { '\u0430': 'a', '\u0432': 'b', '\u0435': 'e', '\u0451': 'e', '\u043A': 'k', '\u043C': 'm', '\u043D': 'h', '\u043E': 'o', '\u043F': 'n', '\u0440': 'p', '\u0441': 'c', '\u0442': 't', '\u0443': 'y', '\u0445': 'x', '\u0455': 's', '\u0456': 'i', '\u0457': 'i', '\u0458': 'j', '\u0501': 'd', '\u04CF': 'l', '\u051B': 'q', '\u051D': 'w', '\u0261': 'g', '\u0131': 'i', '\u0251': 'a',
  '\u03B1': 'a', '\u03B2': 'b', '\u03B3': 'y', '\u03B5': 'e', '\u03B7': 'n', '\u03B9': 'i', '\u03BA': 'k', '\u03BC': 'u', '\u03BD': 'v', '\u03BF': 'o', '\u03C1': 'p', '\u03C2': 's', '\u03C4': 't', '\u03C5': 'u', '\u03C7': 'x', '\u03C9': 'w', '\u03F2': 'c', '\u03F3': 'j',
  '\u1D00': 'a', '\u0299': 'b', '\u1D04': 'c', '\u1D05': 'd', '\u1D07': 'e', '\uA730': 'f', '\u0262': 'g', '\u029C': 'h', '\u026A': 'i', '\u1D0A': 'j', '\u1D0B': 'k', '\u029F': 'l', '\u1D0D': 'm', '\u0274': 'n', '\u1D0F': 'o', '\u1D18': 'p', '\u01EB': 'q', '\u0280': 'r', '\uA731': 's', '\u1D1B': 't', '\u1D1C': 'u', '\u1D20': 'v', '\u1D21': 'w', '\u028F': 'y', '\u1D22': 'z' };
function chrImgSafeNorm(s) {
  var t = String(s == null ? '' : s);
  if (t.length > CHR_IMGSAFE_MAXLEN) t = t.slice(0, CHR_IMGSAFE_MAXLEN);
  t = t.replace(CHR_IMGSAFE_INVIS, '');
  try { t = t.normalize('NFKC'); } catch (e) {}
  t = t.replace(/[\u00C0-\u024F\u1E00-\u1EFF]/g, function (c) { try { return c.normalize('NFD').replace(CHR_IMGSAFE_COMB, ''); } catch (e) { return c; } });
  t = t.replace(CHR_IMGSAFE_COMB, '');
  t = t.toLowerCase();
  t = t.replace(/[\u01EB\u0131\u0250-\u02AF\u0370-\u03FF\u0400-\u052F\u1D00-\u1D2B\uA730\uA731]/g, function (c) { return CHR_IMGSAFE_HG.hasOwnProperty(c) ? CHR_IMGSAFE_HG[c] : c; });
  for (var b = 0; b < CHR_IMGSAFE_BOILER.length; b++) t = t.split(CHR_IMGSAFE_BOILER[b]).join(' ');
  t = t.replace(/(^|[^\u3400-\u9FFF])(?:\u5DE5\u53E3|\u5DE5\u30ED|\u30A8\u53E3)(?:(?![\u3400-\u9FFF])|(?=[\u540C\u672C\u6F2B\u753B\u7CFB]))/g, '$1\u30A8\u30ED').replace(/\u53E3(?=[\u30EA\u308A])/g, '\u30ED').replace(/([\u30A1-\u30F6\u30FC])[\u4E00\u2015\u2010\uFF0D\u2014\u2013\u2212]/g, '$1\u30FC');
  t = t.replace(/[\u30A1-\u30F6]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); });
  t = t.replace(/\s+/g, ' ');
  t = t.replace(/([\u3041-\u3096\u30FC\u3400-\u9FFF])[ \u30FB\u00B7*_~|\/\\.\-\u2010-\u2015\u2025\u2026]+(?=[\u3041-\u3096\u30FC\u3400-\u9FFF])/g, '$1');
  return t;
}
var CHR_IMGSAFE_KNUM = { '〇': 0, '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
function chrImgSafeIsKnum(c) { return c === '十' || c === '百' || c === '千' || CHR_IMGSAFE_KNUM.hasOwnProperty(c); }
function chrImgSafeKval(s) {
  if (/^[0-9]+$/.test(s)) return s.length > 4 ? 99999 : parseInt(s, 10);
  if (s.length > 6) return 99999;
  var total = 0, cur = 0, seen = false;
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i);
    if (CHR_IMGSAFE_KNUM.hasOwnProperty(c)) { cur = cur * 10 + CHR_IMGSAFE_KNUM[c]; seen = true; }
    else if (c === '十' || c === '百' || c === '千') { total += (cur || 1) * (c === '十' ? 10 : c === '百' ? 100 : 1000); cur = 0; seen = true; }
    else return NaN;
  }
  return seen ? total + cur : NaN;
}
var CHR_IMGSAFE_ENNUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60 };
/* ---------- 未成年らしさの語（ひらがなに直した後の形）。rules = 人をはっきり指す語と年齢だけ（場所・持ち物・比べ方の語は AI に任せる） ---------- */
var CHR_IMGSAFE_YOUTH = [
  ['school', /女子高生|男子高生|女子高校生|男子高校生|高校生|女子校生|女学生|女子中学生|女子小学生|中学生|小学生|中高生|小中学生|園児|生徒|(?:中学|高校|小学)[1-6一二三四五六]年|小学校(?:高|低|中)学年/g],
  ['school', /\b(?:school ?girls?|school ?boys?|(?:elementary|grade|primary|middle|junior[- ]high|high)[- ]?school(?:ers?|[- ]students?|[- ]girls?|[- ]boys?|[- ]pupils?)|highschoolers?|kindergartn?ers?|kindergarteners?|pre-?schoolers?|junior[- ]high[- ]students?|(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)[- ]grade(?:rs?)?|jk|jc|js)\b/g],
  ['child', /少女|しょうじょ|幼女|ようじょ|女児|男児|少年|しょうねん|子供|子ども|こども|女の子|おんなのこ|男の子|おとこのこ|幼子|童女|小娘|赤ん坊|赤ちゃん|あかちゃん|乳児|乳幼児|幼児|未成年|てぃーん|ちびっこ|ちびっ子|きっず|しょた|ろり|がき|幼少|思春期/g],
  ['child', /\b(?:child|children|childhood|kids?|toddlers?|infants?|babies|underage|under-age|underaged|minors?|preteens?|pre-teens?|tweens?|teens?|teenage(?:rs?|d)?|adolescents?|juveniles?|little (?:girl|boy|kid|one)s?|young (?:girl|boy)s?|girl child|lolita|loli|lolicon|shota|shotacon|barely[- ]legal|jailbait)\b/g]
];
/* strict（AI の分類が無い経路だけ）: 上に加えて girl / boy */
var CHR_IMGSAFE_YOUTH_STRICT = /\b(?:girls?|boys?|girlish|boyish|child-?like|childish|school uniforms?|sailor uniforms?|serafuku)\b/g;
/* ---------- 性的な語。A = 裸・性行為・下着（どの経路でも。否定の言い方でも数える）／ B = はっきり性的な見せ方・体の語（AI の分類が無い経路だけ） ---------- */
var CHR_IMGSAFE_SEX_A = [
  ['underwear', /全裸|半裸|裸|はだか|ぬーど|すっぽんぽん|一糸(?:まとわ|纏わ)ぬ|生まれたままの姿|下着|らんじぇりー|ぶらじゃー|のーぶら|のーぱん|ぶら|ぱんてぃ|ぱんちら|ぱんつ(?:が|の)?(?:丸見え|まるみえ)|てぃーばっく|tばっく|ねぐりじぇ|まいくろびきに|紐水着|ひも水着|極小水着/g],
  ['underwear', /\b(?:nude|nudes|naked|nudity|topless|bottomless|unclothed|undressed|undressing|half-?naked|semi-?nude|(?:no|without)\s(?:clothes|clothing)|not\swearing\s(?:any(?:thing)?|clothes|clothing)|wearing\snothing|nothing\son(?!\s[a-z])|(?:wearing\s)?(?:only|just)\s(?:a\s)?(?:bath\s)?towel|(?:bath\s)?towel\sonly|nothing\sbut|lingerie|underwear|undergarments?|panties|panty|pantsu|bras?|brassiere|bra-?less|thong|g-?string|negligee|micro[- ]?bikinis?|string bikinis?|upskirt)\b/g],
  ['act', /性的な?(?:場面|ぽーず|行為|描写|姿|奉仕)|性的に(?:描|強調|見せ)|せっくす|性行為|性交|自慰|おなにー|絶頂|強姦|れいぷ|犯され|淫行|援交|援助交際|売春|射精|精液|愛撫|ぽるの|成人向け|18禁|r-?18|えっち(?:する|して|した|な行為|しよ)/g],
  ['act', /\b(?:sex|having\ssex|intercourse|sex\sact|sexual\sact|masturbat[a-z]*|orgasm[a-z]*|porn[a-z]*|explicit|r-?18|18\+|xxx|nsfw|hentai|rape[ds]?|raping|molest[a-z]*|fellatio|blowjob|semen|cum)\b/g]
];
var CHR_IMGSAFE_SEX_B = [
  ['body', /巨乳|爆乳|豊乳|おっぱい|乳首|ちくび|下乳|m字開脚|ぐらまらす|ないすばでぃ|ぼんきゅっぼん/g],
  ['body', /\b(?:busty|buxom|voluptuous|cleavage|oppai|boobs?|boobies|tits|titty|nipples?|areolae?|(?:large|big|huge|giant|enormous) (?:breasts|bust|boobs)|spread legs|legs spread|bedroom eyes|[d-k]-?cup(?: bust| breasts)?|ass|butt|buttocks|booty|crotch|groin|briefs)\b/g],
  ['underwear', /\b(?:see-?through (?:dress|top|blouse|shirt|clothes|clothing|fabric|outfit|nightgown|nightie|swimsuit)|sheer (?:dress|top|blouse|nightgown|nightie)|skimpy|low-?cut|plunging neckline|revealing (?:[a-z]+ )?(?:outfit|clothes|clothing|dress|top|swimsuit|bikini)|lifting (?:her|his) skirt)\b/g],
  ['framing', /せくしー|せくしぃ|せくしい|色っぽ|艶っぽ|妖艶|艶めかし|なまめかし|官能|扇情|煽情|えろ|えちえち|すけべ|卑猥|猥褻|わいせつ|悩殺|発情|欲情|胸ちら|ぐらびあ/g],
  ['framing', /\b(?:sexy|sexual|sexualized|seductive(?:ly)?|suggestive(?:ly)?|provocative(?:ly)?|sensual|erotic|lewd|sultry|lustful|horny|aroused|fetish|bondage|ecchi|gravure|pin-?up)\b/g]
];
var CHR_IMGSAFE_HIRA = /[ぁ-ゖー]/;
var CHR_IMGSAFE_KANJI = /[㐀-鿿]/;
/* 語ごとの例外（前後の数文字だけ＝一定の手間）。true = この一致は数えない */
function chrImgSafeSkipYouth(w, pre, post) {
  if (w === 'ろり') return /(?:ごす|ごしっく|あま|甘|白|しろ|黒|くろ|くら|和|ぱんく|ちゃいな|姫|ひめ)$/.test(pre) || /^ーた(?:ふぁっしょん|服|ふく|どれす)/.test(post)
    || /^ー(?!た)/.test(post) || (/(?:こ|ご|ぽ|ぼ|ぺ|べ|と|ど|ほ|ぱ|く|ぐ|ち)$/.test(pre) && /^(?:と|っ|ん)/.test(post)) || (/ふ$/.test(pre) && /^だ/.test(post));
  if (w === 'がき') return /(?:は|らく|て|え|あ|も|した|たて|よこ|なぐり|はしり|と)$/.test(pre);
  if (w === 'しょた') return /^い/.test(post);
  if (w === 'てぃーん') return /(?:るー|る|ぷろ|かん|くりす|ばれん)$/.test(pre);
  if (w === 'しょうじょ') return /^う/.test(post);
  if (w === '生徒') return /^(?:会長の母|の(?:母|父|親))/.test(post);
  if (w === 'lolita') return /gothic\s?$|goth\s?$/.test(pre) || /^\s?(?:fashion|style|dress|outfit|clothes|clothing)\b/.test(post);
  if (w === 'minor' || w === 'minors') return w === 'minor' && !(/\b(?:a|an|is|as|the|are|was)\s$/.test(pre) && !/^\s[a-z]/.test(post)) && !/^\s(?:girl|boy|child|kid)/.test(post);
  if (w === 'kid' || w === 'kids') return /^[- ]?(?:gloves?|leather|skin)\b/.test(post);
  if (w === 'jk' || w === 'jc' || w === 'js') return /[0-9.]$/.test(pre) || /^[0-9.]/.test(post);
  return false;
}
function chrImgSafeSkipSex(w, pre, post) {
  if (w === 'ぶら') return CHR_IMGSAFE_HIRA.test(pre.slice(-1)) || CHR_IMGSAFE_HIRA.test(post.charAt(0));
  if (w === 'のーぶら' || w === 'のーぱん') return CHR_IMGSAFE_HIRA.test(post.charAt(0)) && !/^つ/.test(post);   /* ノーブランド・ノーパンク */
  if (w === '裸') return /^(?:足|眼|一貫|電球|の王様|々|馬)/.test(post) || /(?:赤|上半身|半)$/.test(pre);   /* 上半身裸・半裸は AI に任せる */
  if (w === 'nude' || w === 'ぬーど') return /^[- ]?(?:colou?red|colou?r|tone[ds]?|beige|pink|lipstick|lips|heels|pumps|shoes|flats|stockings|tights|makeup|nails|polish|からー|いろ|色|の口紅|べーじゅ)/.test(post);   /* 色の名前 */
  if (w === 'ass' || w === 'butt') return /^[- ]?(?:length|long)\b/.test(post) || (w === 'ass' && /\b(?:bad|kick|smart|dumb)\s?-?$/.test(pre));
  if (w === 'bra' || w === 'bras') return /sports\s$/.test(pre) || /^\s?(?:strap\s(?:on|of)\sa|shop|store)\b/.test(post);   /* スポーツブラは運動着 */
  if (w === '下着') return /^(?:売り場|店|泥棒|めーかー|ぶらんど|を(?:買|選|洗|干))/.test(post);   /* 着ていない（売り場・泥棒など） */
  if (w === 'thong') return /^\s?(?:sandals?|flip|slippers?)\b/.test(post);
  if (w === 'sex') return /^\s?[:=]/.test(post) || /^\s(?:female|male)\b/.test(post) || /\b(?:opposite|same|either|biological)\s$/.test(pre);
  if (w === 'explicit') return /^\s(?:instructions?|orders?|permission|consent|rules?)\b/.test(post);
  if (w === 'cum') return !/^\s?(?:on|shot|covered)\b/.test(post);
  if (w === 'nothing but') return !/wearing\s$/.test(pre) && !/^\s(?:a\s)?(?:towel|lingerie|underwear|panties|bra|apron|bandages?|ribbons?|stockings|socks|a\sshirt|shirt|bikini|sheet|blanket|smile|skin)\b/.test(post);
  if (w === 'えろ') return !(/^(?:い|く|す|か|同|本|画|系|漫画|まんが|げ|っぽ|がき|えろ)/.test(post) || !CHR_IMGSAFE_HIRA.test(pre.slice(-1)));
  if (/^(?:large|big|huge|giant|enormous) /.test(w)) return false;
  if (w === 'sexual') return /^\s(?:orientation|identity|harassment|education)\b/.test(post);
  return false;
}
var CHR_IMGSAFE_NEG_POST = /^(?:く)?(?:では|じゃ|は|も)?(?:な|無)(?:い|く|し)(?![ぁ-ゖー])|^(?:の|が|は|も)?(?:少な|すくな|控えめ|ひかえめ|ほとんどな|まったくな|全くな|一切な|ぜろ|皆無)/;
var CHR_IMGSAFE_NEG_PRE = /\b(?:no|not|non|without|never|zero)[- ]$/;
/* 年齢の数字（ASCII の数字・漢数字・英語の数の語）を 1 回の走査で読む。18 未満なら youth に入れる（経歴の例外は無い） */
/* ★X-c（GPT #127-PM）: 未成年の語が「実際に描く人物」を指すときだけ数える。経歴（元〜・〜だった頃に・former・when she was）と別の人（〜の母・子供を抱いた・mother of・holding a child）は数えない。
   描く姿の言い方（〜のまま・〜の頃の姿・成長が止まった・見た目は・as a・looks like）は数える。前後の数文字だけを見る（一定の手間）。 */
var CHR_IMGSAFE_FORM_POST = /^[^、。,.!?;]{0,8}?(?:まま|の姿(?!勢)|姿で|姿の|の容姿|容姿|の外見|外見|の見た目|見た目|成長が止ま|成長の止ま|時が止ま|年を取らな|年をとらな|歳を取らな|歳をとらな|老いな|変わらな|変わらぬ|に戻っ|に若返|に返っ)/;
function chrImgSafeDepicted(pre, post) {
  var p = post.replace(/^\s?(?:歳|才|さい|-?\s?(?:years?|yrs?)(?:\s?-?\s?old)?|y\/o|yo)/, '');
  if (CHR_IMGSAFE_FORM_POST.test(p)) return true;
  if (/(?:見た目は|外見は|姿は|容姿は|見た目が|外見が|見かけは)$/.test(pre) || /\b(?:drawn|shown|depicted|portrayed|rendered|appears?|appearing|looks?|looking|dressed|presented|pictured)\s(?:as|like)\s(?:a\s|an\s)?$/.test(pre) || /\bas\s(?:a\s|an\s)?$/.test(pre)) return true;
  if (/(?:^|[^㐀-鿿])元$/.test(pre) || /(?:昔の|かつての|過去の|昔は|かつて)$/.test(pre)) return false;
  if (/\b(?:former\s|ex-\s?|once\s(?:a|an)\s|used\sto\sbe\s(?:a\s|an\s)?|when\s(?:she|he|they|i)\s(?:was|were)\s(?:a\s|an\s)?|since\s(?:she|he|they|i)\s(?:was|were)\s(?:a\s|an\s)?|back\sin\s(?:her|his|their)\s)$/.test(pre)) return false;
  if (/^[^、。,.!?\s]{0,4}?だった(?:過去|経歴|頃に|ころに|時に|ときに|こと)/.test(p)) return false;
  if (/^(?:の頃に|のころに|頃に|ころに|の時に|のときに|時代に|時代を|時代から|期に|の頃から|当時|以来|前に)/.test(p)) return false;
  if (/^(?:の(?:母|父|親|先生|教師|担任|姉|兄|祖母|祖父|ぱぱ)|を(?:抱|連れ|背負|おぶ|あや|見守)|と(?:一緒|二人|手を|並)|がいる|がいた|を持つ|を育て|を産)/.test(p)) return false;
  if (/^の(?:娘|息子|妹|弟|孫|子供|子ども|子)(?:を|と|が|に|の)/.test(p)) return false;
  if (/(?:娘|息子|妹|弟|孫|子供|子ども|生徒|教え子|姪|甥)(?:は|が|も)(?:今|いま|まだ)?$/.test(pre) || /\b(?:daughter|son|sister|brother|child|kid|student|niece|nephew)\s(?:is|was)\s(?:still\s)?(?:a\s|an\s)?$/.test(pre)) return false;   /* 別の人（娘は中学生） */
  if (/\b(?:mother|father|parent|mom|mum|dad|teacher|aunt|uncle)\sof\s(?:a\s|an\s|two\s|three\s)?$/.test(pre) || /\b(?:with|holding|carrying|hugging|cradling|beside|and)\s(?:a|an|her|his|their|the|two|three)\s(?:little\s|young\s|small\s)?$/.test(pre)) return false;
  if (/^(?:'s|s'|')?\s(?:mother|father|parent|teacher|mom|dad)\b/.test(p) || /^[- ]?(?:years?|yrs?)[- ]old[- ](?:daughter|son|child|kid|sister|brother)\b/.test(post) && /\b(?:with|holding|her|his|their|of)\s(?:a\s|an\s)?$/.test(pre)) return false;
  return true;
}
/* ★X-c 床（AI が none と答えても止める）: 描く人物が明示的に未成年 × 否定されていない裸・性行為・下着（86-c）。水着・体・見せ方は AI に任せる */
var CHR_IMGSAFE_SEX_FLOOR = [
  ['underwear', /全裸|裸|はだか|ぬーど|すっぽんぽん|一糸(?:まとわ|纏わ)ぬ|生まれたままの姿|とっぷれす|(?:ばす)?たおる[一ー]枚|しーつ[一ー]枚/g],
  ['underwear', /\b(?:nude|nudes|naked|nudity|bottomless|unclothed|undressed|undressing|(?:no|without)\s(?:clothes|clothing)|not\swearing\s(?:any(?:thing)?|clothes|clothing)|wearing\snothing|nothing\son(?!\s[a-z])|topless|(?:(?:wearing|in|wrapped\sin|clad\sin|dressed\sin|covered(?:\sby|\swith|\sin)?)\s(?:only|just)|covered\sonly|nothing\sbut)\s(?:by\s|in\s|with\s)?an?\s(?:bath\s)?(?:towel|bedsheet|sheet|blanket)(?!\sof\b)(?![a-z])|clothes\sfalling\soff)\b/g],
  ['underwear', /下着|らんじぇりー|ぶらじゃー|のーぶら|のーぱん|ぱんてぃ|ねぐりじぇ|べびーどーる/g],   /* ★86-c（rv 86 HIGH）: 描く未成年 × 下着・ランジェリー（着ている）。水着・寝間着・普段着は入れない */
  ['underwear', /\b(?:underwear|lingerie|bra|bras|panties|knickers|negligee|nightie)\b/g]
];
function chrImgSafeNumbers(t) {
  var out = { youth: [], adult: false }, n = t.length, i = 0;
  function judge(v, s, e, isWord) {
    var pre = t.slice(Math.max(0, s - 24), s), post = t.slice(e, e + 30), y = null;
    if (!isWord && /^\s?(?:歳|才|さい)/.test(post)) { y = 'age'; }
    else if (!isWord && /^\s?の\s?(?:娘|少女|子(?!供|ども)|女の子|男の子|少年|小娘)/.test(post)) { y = 'age'; }
    else if (!isWord && /(?:齢|年は|年齢は?|年齢:|見た目は|外見は|見た目が|外見が|見かけは)\s?$/.test(pre)) { y = 'age'; }
    else if (!isWord && /^\s?代/.test(post) && !/^\s?代目/.test(post) && !/第\s?$/.test(pre) && !/[0-9]$/.test(pre)) { if (v === 10) out.youth.push({ y: 'age', dep: chrImgSafeDepicted(pre, post) }); else if (v >= 20 && v <= 90 && v % 10 === 0) out.adult = true; return; }
    else if (!isWord && /(?:中|高|小)$/.test(pre) && !CHR_IMGSAFE_KANJI.test(pre.slice(-2, -1)) && v >= 1 && v <= 6 && (post === '' || /^(?:の|生|女子|男子|年生|[、。,.!?\s])/.test(post))) { out.youth.push({ y: 'school', dep: chrImgSafeDepicted(pre, post) }); return; }
    else if ((/^\s?-?\s?(?:years?|yrs?)(?:\s?-?\s?old)?\b/.test(post) && !/^\s?-?\s?(?:years?|yrs?)\s(?:of(?!\sage)|ago|later|before|after|in|since|experience|training|as|at|on|with|to)\b/.test(post)) || /^\s?(?:y\/o|y\.o\.?|yo)\b/.test(post) || /\b(?:aged?|age\sis|age\sof|age:|age\s=)\s?$/.test(pre)
      || /\b(?:looks?|looking|appears?|appearing|seems?)\s(?:about\s|around\s|like\s(?:a\s)?|only\s)?$/.test(pre) || /\bas\s(?:she|he|they|i)\s(?:was|were|is|looks?)\sat\s$/.test(pre) || /\b(?:at|is|was)\s$/.test(pre) && /\b(?:she|he|they|girl|boy|herself|himself)\s(?:is|was|at)\s$|(?:^|[,.]\s?)(?:at|is)\s$/.test(pre)
      || (!isWord && /^\s?,\s?(?:female|male|girl|boy)\b/.test(post) && (s === 0 || /[,.。、]\s?$/.test(pre)))) { y = 'age'; }
    else if (/\bunder[- ]?$/.test(pre) && v <= 18) { out.youth.push({ y: 'age', dep: true }); return; }
    else if (/^(?:st|nd|rd|th)[- ]grade(?:r|rs)?\b/.test(post) || /\bgrade\s$/.test(pre)) { if (v <= 12) out.youth.push({ y: 'school', dep: chrImgSafeDepicted(pre, post) }); return; }
    if (!y) return;
    if (v < 18) out.youth.push({ y: y, dep: chrImgSafeDepicted(pre, post) }); else if (v < 200) out.adult = true;
  }
  while (i < n) {
    var c = t.charAt(i);
    if (c >= '0' && c <= '9') { var j = i + 1; while (j < n && t.charAt(j) >= '0' && t.charAt(j) <= '9') j++;
      judge(chrImgSafeKval(t.slice(i, j)), i, j, false); i = j; continue; }
    if (chrImgSafeIsKnum(c)) { var k = i + 1; while (k < n && chrImgSafeIsKnum(t.charAt(k))) k++; var kv = chrImgSafeKval(t.slice(i, k)); if (Number.isFinite ? Number.isFinite(kv) : isFinite(kv)) judge(kv, i, k, false); i = k; continue; }
    i++;
  }
  var re = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty)\b/g, m;
  while ((m = re.exec(t))) judge(CHR_IMGSAFE_ENNUM[m[1]], m.index, m.index + m[0].length, true);
  return out;
}
function chrImgSafeFirstSex(lists, t, neg) {
  for (var r = 0; r < lists.length; r++) {
    var re = lists[r][1], m; re.lastIndex = 0;
    while ((m = re.exec(t))) {
      if (m[0] === '') { re.lastIndex++; continue; }
      var s = m.index, e = s + m[0].length, pre = t.slice(Math.max(0, s - 24), s), post = t.slice(e, e + 16);
      if (chrImgSafeSkipSex(m[0], pre, post)) continue;
      if (neg && (CHR_IMGSAFE_NEG_POST.test(post) || CHR_IMGSAFE_NEG_PRE.test(pre))) continue;
      return lists[r][0];
    }
  }
  return null;
}
function chrImgSafeFirstYouth(t, strict, depOnly) {
  for (var r = 0; r < CHR_IMGSAFE_YOUTH.length; r++) {
    var re = CHR_IMGSAFE_YOUTH[r][1], m; re.lastIndex = 0;
    while ((m = re.exec(t))) {
      if (m[0] === '') { re.lastIndex++; continue; }
      var s = m.index, e = s + m[0].length;
      if (chrImgSafeSkipYouth(m[0], t.slice(Math.max(0, s - 24), s), t.slice(e, e + 16))) continue;
      if (depOnly && !chrImgSafeDepicted(t.slice(Math.max(0, s - 24), s), t.slice(e, e + 30))) continue;
      return CHR_IMGSAFE_YOUTH[r][0];
    }
  }
  if (strict) { CHR_IMGSAFE_YOUTH_STRICT.lastIndex = 0; if (CHR_IMGSAFE_YOUTH_STRICT.test(t)) return 'child'; }
  return null;
}
function chrImgSafeJoin(texts, more) {
  var arr = (Array.isArray(texts) ? texts : [texts]).concat(Array.isArray(more) ? more : []), parts = [];
  for (var i = 0; i < arr.length; i++) parts.push(chrImgSafeNorm(arr[i]));
  return parts.join(' 。 ');
}
/* 未成年らしさ（人を指す語・18 歳未満の年齢・学年）が文にあるか。AI の分類の「年齢不明」を補う */
function chrImgSafeYouthIn(texts) { var t = chrImgSafeJoin(texts); return !!(chrImgSafeNumbers(t).youth.length || chrImgSafeFirstYouth(t, false)); }
/* 18 歳未満の年齢・学年が数字ではっきり書かれているか（AI が adult と答えても、これは打ち消さない） */
function chrImgSafeUnder18In(texts) { return chrImgSafeNumbers(chrImgSafeJoin(texts)).youth.length > 0; }
/* ★X-c: 描く人物が明示的に未成年か（人を指す語・18 歳未満の年齢・学年のうち、経歴・別の人を除いたもの）。AI の adult では打ち消さない */
function chrImgSafeDepictedYouthIn(texts) { var t = chrImgSafeJoin(texts), nu = chrImgSafeNumbers(t).youth; for (var i = 0; i < nu.length; i++) if (nu[i].dep) return true; return !!chrImgSafeFirstYouth(t, false, true); }
/* texts（＋ more）: 文の配列。mode 'rules' = A の語だけ（AI の分類がある経路）／ 'strict'（既定）= A と B の語・girl/boy も（AI の分類が無い経路）。
   戻り値 null = 通す / { y, s } = 拒否（y = age | school | child、s = underwear | act | body | framing） */
function chrImgSafeVerdict(texts, more, mode) {
  if (mode === 'floor') {   /* ★X-c: 床だけ（否定された裸は数えない・描く人物だけ） */
    var tf = chrImgSafeJoin(texts, more), sf = chrImgSafeFirstSex(CHR_IMGSAFE_SEX_FLOOR, tf, true) || chrImgSafeFirstSex([CHR_IMGSAFE_SEX_A[2], CHR_IMGSAFE_SEX_A[3]], tf, true);
    if (!sf) return null;
    var nf = chrImgSafeNumbers(tf).youth, yf = null; for (var q = 0; q < nf.length; q++) if (nf[q].dep) { yf = nf[q].y; break; }
    if (!yf) yf = chrImgSafeFirstYouth(tf, false, true);
    return yf ? { y: yf, s: sf } : null;
  }
  var strict = mode !== 'rules', t = chrImgSafeJoin(texts, more);
  var s = chrImgSafeFirstSex(CHR_IMGSAFE_SEX_A, t, false) || (strict ? chrImgSafeFirstSex(CHR_IMGSAFE_SEX_B, t, true) : null);
  if (!s) return null;
  var num = chrImgSafeNumbers(t), y = num.youth.length ? num.youth[0].y : chrImgSafeFirstYouth(t, strict);
  if (!y) return null;
  return { y: y, s: s };
}
/*@@IMGSAFE_CORE_END@@*/
  var Y = { age: '年齢の語', school: '学校・学年の語', child: '子ども・幼さの語' };
  var S = { body: '体の語', underwear: '下着・裸の語', framing: '見せ方の語', act: '性行為の語' };
  var stats = { checked: 0, refused: 0 }, last = null;
  function remember(y, s) { if (Y.hasOwnProperty(y) && S.hasOwnProperty(s)) last = { y: y, s: s, t: Date.now() }; }
  function hint(y, s) { var a = Y.hasOwnProperty(y) ? Y[y] : null, b = S.hasOwnProperty(s) ? S[s] : null; return (a && b) ? '（当たった語の種類：' + a + '・' + b + '）' : ''; }
  function off() { try { return localStorage.getItem('v292DfixIMGSAFEOff') === '1'; } catch (e) { return false; } }
  window.__chrImgSafe = {
    v: CHR_IMGSAFE_V, off: off, hint: hint, stats: stats, remember: remember,
    last: function () { return (last && Date.now() - last.t < 600000) ? { y: last.y, s: last.s } : null; },
    verdict: function (texts) { stats.checked++; var r = chrImgSafeVerdict(texts); if (r) stats.refused++; return r; },
    seeMsg: function (r) { return 'この場面には、未成年に見える人物の性的な描写が含まれるため、絵を作りませんでした（画像サービスへは何も送っていません）。人物の外見の説明から、性的な体の描写や見せ方を外してください' + hint(r && r.y, r && r.s); }
  };
})();
