// =====================================================================
// Chronicle TRPG - v292DfixSCENE2: 「いま」の天候・時刻・出来事の控え（＋ SEVERE1 / DRIVE1 / EX192 の判定）
// ---------------------------------------------------------------------
// r2（laneSCENE2R・2026-11-12・LOCAL 試作・未出荷）: GPT #127-SQ の裁定どおりに作り直し。
//   ・天候と時刻で扱いを分ける。
//       天候 = 変化の描写が無ければ「継続候補」。直前の本文で確かめられたときだけ言い切り、
//              そうでなければ「続いている可能性が高い（解除の描写なし）」。長く確かめられていない・時間が大きく飛んだときは「未確認」。
//       時刻 = 古い値を現在時刻として渡さない。「最後に確認された時刻：朝（2ターン目時点）／現在の正確な時刻：未確定」。
//              日をまたいだあと時刻が書かれていなければ、時刻は何も渡さない。
//       一度起きた出来事（爆発・地震・落雷）= 過去の確定事実として渡す。
//       継続中の出来事（停電・火事・祭り・包囲）= 終了の描写を判定し、終わったら「すでに起きた出来事」へ移す。
//   ・rule 文: 「現在まで続いていると確認できる状況を引き継ぐ。変化の描写がないことだけを理由に、古い時刻や一時的な出来事を現在の確定事実にしない。」
//   ・足すのは 1〜2 行（天候／時刻で 1 行、出来事があればもう 1 行）。先頭に「背景の控え（本文で言い直さなくてよい）」と付け、
//     渡した文をモデルが地の文で毎回言い直す自己強化を起きにくくする。
// この部品は判定だけ（純関数）。プロンプトへ載せるのは v292Dfix58（nowScene の行と rule の 1 文）と v292Dfix192（状態ブロック・見本）。
//   ・追加の AI 呼び出しはしない。保存・store・セーブ形式は 1 バイトも変えない（毎回 S.turns と S.scene から作り直す）。
//   ・読むもの: 前提（場所・開始条件。目的と世界設定は「いま」の描写ではないので読まない）・STORY の入力・各ターンの地の文
//     （「」『』（）と <say> の中は読まない）。
//   ・拾わない: 比喩（霧のような）・未来／条件（霧が来る前に・雨だったら）・回想（あの夜・十年前）・別の日（明日の朝）・写真や絵の中・人名／地名の中の字。
// 鍵（毎回評価・再読込不要。すべて既定 OFF＝送信バイト同一）:
//   SCENE2 : localStorage v292DfixSCENE2On='1'（kill v292DfixSCENE2Off='1' が常に優先）
//   SEVERE1: v292DfixSEVERE1On='1'（kill v292DfixSEVERE1Off='1'）
//   DRIVE1 : v292DfixDRIVE1On='1'（kill v292DfixDRIVE1Off='1'）
//   EX192  : v292DfixEX192On='1'（案 A）または '2'（案 B）（kill v292DfixEX192Off='1'）
// 検証口: window.__v292DfixSCENE2Core
// =====================================================================
(function(root){
  'use strict';
  var VER = 'scene2-20261112-r2c';
  function lsGet(k){ try { return root.localStorage ? root.localStorage.getItem(k) : null; } catch(e){ return null; } }
  function on(){ return lsGet('v292DfixSCENE2Off') !== '1' && lsGet('v292DfixSCENE2On') === '1'; }
  function severeOn(){ return lsGet('v292DfixSEVERE1Off') !== '1' && lsGet('v292DfixSEVERE1On') === '1'; }
  function driveOn(){ return lsGet('v292DfixDRIVE1Off') !== '1' && lsGet('v292DfixDRIVE1On') === '1'; }
  function ex192(){ if (lsGet('v292DfixEX192Off') === '1') return ''; var v = lsGet('v292DfixEX192On'); return v === '1' ? 'A' : (v === '2' ? 'B' : ''); }

  var W_LONG = 8;    // 天候・続く出来事: これより長く本文で確かめられていなければ「未確認」
  var PAST_N = 4;    // すでに起きた出来事を添えるターン数
  // ---- 語彙（控えめ。値は正規化した名前） ----
  // [カテゴリ, 正規表現（g なし）, 値]。上から順に試し、同じ位置で最初に当たったものを採る。
  var LEX = [
    ['天候', /濃霧|濃い霧|深い霧|霧が濃|濃いガス/, '濃霧'],
    ['天候', /砂嵐/, '砂嵐'],
    ['天候', /雷雨|暴風雨|嵐|暴風|台風/, '嵐'],
    ['天候', /霧雨|小雨|大雨|豪雨|土砂降り|本降り|夕立|雨脚|雨音|雨粒|雨が|雨は|雨も|雨の(?:夜|中|日|音|匂い|筋|夕方|朝|午後)|雨に|雨で|雨を|雨。|雨、/, '雨'],
    ['天候', /霧|朝靄|夕靄|靄|ガスが|ガスに|ガスの中/, '霧'],
    ['天候', /吹雪/, '吹雪'],
    ['天候', /雪が|雪は|雪も|雪の(?:夜|中|日|音|匂い|粒|白|壁|明かり)|雪に|雪で|雪明かり|大雪|粉雪|雪。|雪、/, '雪'],
    ['天候', /快晴|晴天|青空|晴れ渡|晴れ上が|よく晴れ|晴れてい|雲ひとつな|雲一つな/, '晴れ'],
    ['時刻', /夜明け前/, '夜明け前'],
    ['時刻', /夜が明け(?:た|て|てい|始め|る)|夜明け|明け方|未明|夜が白(?:み|ん)|(?:東の)?空(?:の端)?(?:が|は)白(?:み|ん)|空の端が(?:青白く)?明る|空が明るくな|(?:外|窓の外)が白く明る|日が昇/, '夜明け'],
    ['時刻', /早朝/, '早朝'],
    ['時刻', /翌朝|朝[。、]|朝日|朝の(?:光|教室|空気|当直|ホーム)|朝になっ|朝を迎え|朝焼け|朝露/, '朝'],
    ['時刻', /正午|昼下がり|昼過ぎ|昼間|日中|昼休み|昼前|真昼|昼になっ|昼まで(?:かか|に)|昼[。、]/, '昼'],
    ['時刻', /午後の|午後[。、]/, '午後'],
    ['時刻', /(?:日|夕日|太陽)が[^。、]{0,8}?(?:沈ん|沈み|沈む|落ちきっ|落ち切っ|落ちる)|日が落ち(?:た|て)|日没|日(?:は|が)(?:すっかり)?暮れ(?:た|て)|(?:外|窓の外|ガラスの外|空)は(?:もう|すっかり)(?:暗|真っ暗)/, '日没後'],
    ['時刻', /日が暮れ(?:始め|かけ)|夕方|夕暮れ|夕焼け|黄昏|日暮れ|夕日|西日/, '夕方'],
    ['時刻', /放課後/, '放課後'],
    ['時刻', /深夜|真夜中|夜更け|夜半|夜中|零時|午前[零〇0一二三1-3]時/, '深夜'],
    ['時刻', /午前[四五4-5]時/, '夜明け前'],
    ['時刻', /午前(?:[六七八九6-9]|十|10)時/, '朝'],
    ['時刻', /午後[一二三1-3]時/, '昼'],
    ['時刻', /午後[四五六4-6]時/, '夕方'],
    ['時刻', /午後(?:[七八九7-9]|十|10|11)時/, '夜'],
    ['時刻', /今夜|夜の|夜が|夜は|夜に|夜。|夜、|夜風|夜空|夜気|夜闇|月明かり|月の光|星空|夜$/, '夜'],
    ['出来事', /停電|電気(?:は|が)(?:来ていな|止まっ|落ち)|(?:蛍光灯|電灯|照明|明かり|非常灯|灯り)が[^。]{0,10}(?:またたいて|一斉に|ふっと|突然|全部)[^。]{0,6}消え|発電機が[^。]{0,6}止ま/, '停電'],
    ['出来事', /火事|火災|燃え広が|炎(?:が|は)[^。]{0,16}(?:上が|移|這い|広が|弾け|噴き|舐め)|火の手|火柱|燃え上が|燃えてい/, '火事'],
    ['出来事', /祭り|祭囃子|縁日|花火大会|[一-龠]{2}祭(?:の|。|、|で|が|は|当日)/, '祭り'],
    ['出来事', /包囲|籠城/, '包囲'],
    ['一度', /爆発/, '爆発'],
    ['一度', /地震/, '地震'],
    ['一度', /落雷|雷が落ち/, '落雷']
  ];
  // 語の直前・直後で捨てる（未来・条件・別の日・比喩・別の語・人名や地名）
  var BEFORE_SKIP = /(?:明日|明朝|次の|来週|今度の|いつかの|昨日|昨夜|去年|あの|かつての|昔の|夢の|もし|血の|矢の|涙の|拍手の|質問の|弾丸の|火の|花の|紙の|言葉の|人工の|データの|情報の)[のはも]?$/;
  var AFTER_SKIP  = /^(?:とともに|と同時に|から|頃|ごろ|以来|の雲|の気配|の予感|の前触れ|の前日|の前夜|の前|の準備|の支度|の後|のあと|はまだ|がまだ|もまだ|の?よう|の?ような|の?ように|みたい|のごとく|が来る|が来た[らり]|が来れば|は来る|が来そう|が近づ|が迫|を待|になる前|になったら|になれば|になるまで|が降る前|が降り出す前|が降ったら|が出たら|が出る前|が出れば|が止む前|がやんだら|が止んだら|の日に|の日には|の日は|の日を|の夜に|の夜には|の晩に|のたびに|の季節|の予報|予報|まで|戸|雲|崩|駄|吹き|女|叉|辱|見|宿り|山の|のポスター|の写真|の絵|の場面|の間は|だったら|なら)/;
  var TIME_BEFORE_SKIP = /[今毎]$/;   // 今朝・毎朝 は「いま」の時刻の証拠にしない
  var APPROACH = /接近|近づ|迫っ|迫り|地平|水平線|遠くに|彼方|来そう|まだ遠い|見える[。、]?$|が見え、/;   // 近づいている・遠くに見える天候は「いま」の天候にしない
  var NAME_AFTER = /^(?:島|ヶ|ケ|宮|乃|子|江|野|沢|田|森|村|谷|峰|丸|太|斗|荘|降り|鳥)/;   // 霧島・雨宮・雪乃・霧降りの谷・雷鳥荘 など
  // 文ごと捨てる（回想・仮定・伝聞・一般論・絵や写真の中）
  var SENT_SKIP = /(?:までに|あの日|あの夜|あの朝|あの晩|あの時|あのとき|昔|かつて|去年|昨年|昨日|昨夜|年前|思い出|夢の中|もし|なら[、。]|たら[、。]|れば[、。]|かもしれ|だろう|でしょう|はず|予報|伝説|言い伝え|噂|という|と言われ|毎年|毎晩|毎朝|いつも|ことがある|ことがあった|写真|ポスター|絵の中|写ってい|描かれてい|と書かれてい|メモ)/;
  // 消す（完了形・否定）: [カテゴリ, 消す値の配列, 正規表現]
  var ADV = '(?:すっかり|もう|ようやく|いつの間にか|いつしか|やがて|完全に)?';
  var MID = '[^。、]{0,8}?';
  var GONE = '(?:去っ|去り[、。]|去った|過ぎ(?:た|去|て)|抜け(?:た|て)|通り過ぎ|遠ざか(?:っ|り)|おさま(?:っ|り[、。])|収ま(?:っ|り[、。])|止ん|止み[、。]|やん|やみ[、。])';
  var END = [
    ['天候', ['霧', '濃霧'], new RegExp('(?:霧|靄|ガス)(?:が|は|も)?' + ADV + MID + '(?:晴れ(?:た|てい|上が|[、。])|消え(?:た|てい)|引い(?:た|てい)|切れ(?:た|てい)|薄れ|流れ(?:始め|去|る[。、]|[、。]))|(?:霧|靄|ガス)(?:は|が)もう(?:ない|無い|なかった)|白い幕が(?:裂け|[^。]{0,6}流れ去)')],
    ['天候', ['雨'], new RegExp('(?:雨|夕立)(?:が|は|も)' + MID + ADV + '(?:止ん|止み[、。]|やん|上が(?:り[、。]|った|ってい)|あが(?:り[、。]|った|ってい))|雨(?:の)?音(?:が|は|も)?' + ADV + '[^。]{0,10}(?:消えてい|聞こえな|止ん|やん)|雨(?:は|が|も)(?:もう)?降って(?:い)?な|雨の気配(?:は|も)?な|雫の音が[^。]{0,12}(?:止ん|やん)')],
    ['天候', ['雪', '吹雪'], new RegExp('(?:雪|吹雪)(?:が|は|も)' + MID + ADV + '(?:止ん|止み[、。]|やん|おさま(?:った|ってい|り[、。])|収ま(?:った|ってい|り[、。]))|雪(?:は|が|も)(?:もう)?降って(?:い)?な')],
    ['天候', ['嵐'], new RegExp('(?:嵐|台風|暴風雨|雷雨)(?:が|は|も|を)' + MID + ADV + '(?:' + GONE + '|抜けた)')],
    ['天候', ['砂嵐'], new RegExp('砂嵐(?:が|は|も)' + MID + ADV + GONE)],
    ['出来事', ['停電'], /停電(?:が|は)?(?:終わっ|復旧し|直っ)|(?:電気|電力|明かり|電灯|照明|蛍光灯|灯り|非常灯)(?:が|も)[^。]{0,14}(?:戻っ|復旧|つい(?:た|てい)|点い(?:た|てい|ていく)|点く|灯っ(?:た|てい))|白い光が戻っ|発電機が[^。]{0,6}動き出/],
    ['出来事', ['火事'], /鎮火|火(?:が|は)[^。]{0,12}(?:消え(?:た|てい|る)|消し止め|残っていな|止ま(?:る|っ)|食い止め)|消し止め(?:た|られ)|炎を叩き伏せ|炎は[^。]{0,8}見えなくな|火は[^。]{0,8}(?:自然に)?消え/],
    ['出来事', ['祭り'], /祭り?(?:が|は|の)[^。]{0,6}(?:終わっ|お開き|中止|打ち切)/],
    ['出来事', ['包囲'], /(?:包囲|囲み)(?:が|は)(?:解(?:け(?:た|て)|かれ)|とけ(?:た|て))/]
  ];
  // 晴れの描写（星・月・青空・日差し）は、雨・雪・嵐・霧の終わりの証拠にもなる（「止んだ」と書かれなくても、新しい描写を正とする）
  var CLEAR_SKY = /青空|快晴|晴天|晴れ渡|晴れ上が|雲ひとつな|雲一つな|星が(?:[^。、]{0,6})?(?:出|見え|瞬|またた)|星空|雲が(?:割れ|切れ)|雲の切れ間|虹が/;
  var CLOUDY = /曇(?:り|って|っ)|灰色の空|空が[^。]{0,10}(?:灰色|鉛色|暗く)|雲(?:が|に)(?:広が|覆|垂れ)/;   // 晴れの終わり
  var WET = ['雨', '雪', '吹雪', '嵐', '霧', '濃霧', '砂嵐'];
  // この回の入力（STORY/DO）が変化を言うときは、その値を載せない（入力の方が新しい）
  var END_INPUT = [
    [['霧', '濃霧'], /(?:霧|靄|ガス)(?:が|は)?(?:晴れ|消え|引|薄れ|切れ)/], [['雨'], /(?:雨|夕立)(?:が|は)?(?:止|や[むみん]|上が|あが)/],
    [['雪', '吹雪'], /(?:雪|吹雪)(?:が|は)?(?:止|や[むみん]|おさま|収ま)/], [['嵐'], /(?:嵐|台風)(?:が|は|を)?[^。、]{0,6}(?:去|過ぎ|抜け|おさま|収ま|止|や[むみん]|弱ま)/],
    [['砂嵐'], /砂嵐(?:が|は)?[^。、]{0,6}(?:去|過ぎ|おさま|収ま|止|や[むみん])/],
    [['停電'], /(?:電気|電力|明かり|電灯)(?:が|も)(?:戻|つ|点|灯)|停電(?:が|は)?(?:終わ|復旧)/], [['火事'], /鎮火|火(?:が|は)[^。]{0,8}消(?:え|し止め)/],
    [['祭り'], /祭り(?:が|は)[^。]{0,6}(?:終わ|中止|打ち切)/], [['包囲'], /包囲(?:が|は)解/]
  ];
  // 回想の場面（そのターンの本文は「いま」の証拠にしない）・絵や写真の説明の続き
  var FLASH = /^[—―─\-\s]*(?:回想|[一二三四五六七八九十数百\d]+年前|あの(?:日|夜|夏|冬|頃))/;
  var DEPICT = /写真|ポスター|肖像|絵の中|映像|写ってい|描かれてい/;
  // 時間が経った（新しい時刻が書かれていなければ「その後に時間経過」の印）
  var ELAPSE = /しばらくして|やがて|いつの間にか|[一二三四五六七八九十数半\d]+時間(?:後|が過ぎ|が経|ほど|ばかり)|[一二三四五六七八九十数\d]+分(?:後|が過ぎ|が経|ほど)|時間が(?:過ぎ|経)|時が(?:過ぎ|経)/;
  var ELAPSE_BIG = /[一二三四五六七八九十数半\d]+時間(?:後|が過ぎ|が経|ほど|ばかり)|半日/;
  // 日をまたいだ（時刻・天候は確かめ直すまで言わない）
  var DAYSKIP = /翌日|翌朝|翌晩|次の日|明くる(?:日|朝)|[一二三四五六七八九十数\d]+日(?:後|が過ぎ|が経|ほど(?:して|経))|[一二三四五六七八九十数\d]+週間(?:後|が過ぎ|が経)|数日|幾日/;

  function esc(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function maskNames(t, names){ (names || []).slice().sort(function(a, b){ return String(b).length - String(a).length; }).forEach(function(n){ if (n && String(n).length) t = t.split(String(n)).join('〇'); }); return t; }
  // 地の文の文だけ（「」『』（）<say> と状態タグの行は除く）
  function splitNarr(narr, names){
    var ls = Array.isArray(narr) ? narr : String(narr || '').split('\n'), t = '';
    for (var a = 0; a < ls.length; a++){
      var l = String(ls[a] == null ? '' : ls[a]);
      if (/^\s*<(react|state|summary|scene_move)\b/.test(l)) continue;
      t += l.replace(/<say\b[^>]*>[\s\S]*?<\/say>/g, '\n').replace(/<[^>]*>/g, ' ') + '\n';
    }
    t = maskNames(t, names);
    var buf = '', depth = 0, out = [];
    for (var i = 0; i < t.length; i++){
      var c = t.charAt(i);
      if (c === '「' || c === '『' || c === '（' || c === '('){ depth++; buf = ''; continue; }
      if (c === '」' || c === '』' || c === '）' || c === ')'){ if (depth > 0) depth--; buf = ''; continue; }
      if (depth > 0) continue;
      if (c === '。' || c === '！' || c === '？' || c === '\n'){ if (c !== '\n') buf += c; var x = buf.replace(/\s+/g, ' ').trim(); if (x) out.push(x); buf = ''; continue; }
      buf += c;
    }
    var x2 = buf.replace(/\s+/g, ' ').trim(); if (x2) out.push(x2);
    return out;
  }
  function plainSplit(s, names){   // 前提・入力の文（「」の中は使わない）
    return splitNarr(String(s || '').replace(/[・／\/]/g, '。'), names);
  }
  // 1 文から { ends, hits, clear, elapse, big, day }
  function scanSentence(s){
    var r = { ends: [], hits: [], clear: false, elapse: false, big: false, day: false };
    r.day = DAYSKIP.test(s); r.big = ELAPSE_BIG.test(s); r.elapse = r.big || ELAPSE.test(s);
    if (SENT_SKIP.test(s)) { r.day = false; r.elapse = false; r.big = false; return r; }
    END.forEach(function(e){ if (e[2].test(s)) e[1].forEach(function(v){ r.ends.push([e[0], v]); }); });
    r.clear = CLEAR_SKY.test(s); r.cloudy = CLOUDY.test(s);
    var used = {};
    for (var k = 0; k < LEX.length; k++){
      var cat = LEX[k][0], re = new RegExp(LEX[k][1].source, 'g'), m;
      while ((m = re.exec(s)) !== null){
        var p = m.index;
        if (used[p]) continue;
        var before = s.slice(Math.max(0, p - 6), p);
        var core = m[0].replace(/[がはのもをにで。、].*$/, '');
        var after = s.slice(p + core.length, p + core.length + 8);
        if (BEFORE_SKIP.test(before)) continue;
        if (AFTER_SKIP.test(after)) continue;
        if ((cat === '天候' || cat === '時刻') && NAME_AFTER.test(after)) continue;
        if (cat === '時刻' && TIME_BEFORE_SKIP.test(before)) continue;
        if (cat === '天候' && LEX[k][2] !== '晴れ' && APPROACH.test(s)) continue;
        for (var q = p; q < p + m[0].length; q++) used[q] = 1;
        if ((cat === '天候' || cat === '出来事') && r.ends.some(function(e){ return e[1] === LEX[k][2]; })) continue;   // 「霧が晴れた」の霧は存在の証拠にしない
        r.hits.push([cat, LEX[k][2], m[0]]);
      }
    }
    return r;
  }
  function premiseTexts(scene){
    var sc = scene || {}, out = [];
    ['loc', 'startCondition'].forEach(function(k){ if (sc[k]) out.push([k, String(sc[k])]); });   // 目的（obj）は「これからのこと」、世界設定（lore）は一般の決まりごとなので読まない
    return out;
  }
  // build(state, opt): いま書かせるターン番号 cur = turns.length + 1
  function build(state, opt){
    opt = opt || {};
    var S = state || {}, turns = Array.isArray(S.turns) ? S.turns : [];
    var names = [];
    try { if (S.cast && S.cast.hero && S.cast.hero.name) names.push(S.cast.hero.name); (S.cast && S.cast.npcs || []).forEach(function(n){ if (n && n.name) names.push(n.name); }); } catch(e){}
    var cur = turns.length + 1;
    var W = {}, T = null, E = {}, P = {}, trace = [];   // W/E: v -> {v, src, last, big}; T: {v, src, last, elapsed}; P: v -> {v, at, how}
    function endW(v, turnNo, from, s){ if (W[v]) { trace.push({ t: turnNo, from: from, op: 'end', cat: '天候', v: v, s: s }); delete W[v]; } }
    function apply(sents, turnNo, from){
      if (sents.length && FLASH.test(sents[0])) { trace.push({ t: turnNo, from: from, op: 'skip-flashback', s: sents[0].slice(0, 40) }); return true; }
      var depict = false;
      sents.forEach(function(s){
        if (depict) { depict = DEPICT.test(s); return; }   // 写真・絵の説明の次の 1 文は読まない
        depict = DEPICT.test(s);
        var r = scanSentence(s), s60 = s.slice(0, 60);
        if (r.day){   // 日をまたいだ: 天候と時刻は確かめ直すまで言わない。続く出来事は「未確認」へ
          Object.keys(W).forEach(function(v){ endW(v, turnNo, from + ':day', s60); });
          if (T) { trace.push({ t: turnNo, from: from + ':day', op: 'end', cat: '時刻', v: T.v, s: s60 }); T = null; }
          Object.keys(E).forEach(function(v){ E[v].big = true; });
        }
        r.ends.forEach(function(e){
          if (e[0] === '天候') endW(e[1], turnNo, from, s60);
          else if (E[e[1]]) { trace.push({ t: turnNo, from: from, op: 'end', cat: e[0], v: e[1], s: s60 }); P[e[1]] = { v: e[1], at: turnNo, how: 'ended' }; delete E[e[1]]; }
        });
        if (r.clear) WET.forEach(function(v){ endW(v, turnNo, from + ':clear', s60); });
        if (r.cloudy) endW('晴れ', turnNo, from + ':cloudy', s60);
        var timeHit = false;
        r.hits.forEach(function(h){
          trace.push({ t: turnNo, from: from, op: 'hit', cat: h[0], v: h[1], w: h[2], s: s60 });
          if (h[0] === '時刻'){ timeHit = true; if (!T || T.v !== h[1]) T = { v: h[1], src: turnNo, last: turnNo, elapsed: false }; else { T.last = turnNo; T.elapsed = false; } return; }
          if (h[0] === '一度'){ P[h[1]] = { v: h[1], at: turnNo, how: 'once' }; return; }
          var bag = h[0] === '天候' ? W : E;
          if (h[0] === '天候'){
            if (h[1] === '晴れ') WET.forEach(function(v){ endW(v, turnNo, from + ':clear', s60); });
            else if (W['晴れ']) endW('晴れ', turnNo, from + ':wet', s60);
          } else if (P[h[1]] && P[h[1]].how === 'ended') delete P[h[1]];   // また始まった
          if (h[1] === '雨' && bag['嵐']) { bag['嵐'].last = turnNo; bag['嵐'].big = false; return; }   // 嵐の最中の雨は嵐にまとめる
          if (h[1] === '嵐' && bag['雨']) delete bag['雨'];
          if (h[1] === '霧' && bag['濃霧']) { bag['濃霧'].last = turnNo; bag['濃霧'].big = false; return; }
          if (h[1] === '濃霧' && bag['霧']) { bag['濃霧'] = { v: '濃霧', src: bag['霧'].src, last: turnNo }; delete bag['霧']; return; }
          if (h[1] === '雪' && bag['吹雪']) { bag['吹雪'].last = turnNo; bag['吹雪'].big = false; return; }
          if (h[1] === '吹雪' && bag['雪']) { bag['吹雪'] = { v: '吹雪', src: bag['雪'].src, last: turnNo }; delete bag['雪']; return; }
          if (bag[h[1]]) { bag[h[1]].last = turnNo; bag[h[1]].big = false; } else bag[h[1]] = { v: h[1], src: turnNo, last: turnNo };
        });
        if (r.elapse && !timeHit && T) T.elapsed = true;
        if (r.big){ Object.keys(W).forEach(function(v){ if (W[v].last < turnNo) W[v].big = true; }); Object.keys(E).forEach(function(v){ if (E[v].last < turnNo) E[v].big = true; }); }
      });
    }
    premiseTexts(S.scene).forEach(function(p){ apply(plainSplit(p[1], names), 0, 'premise:' + p[0]); });
    for (var i = 0; i < turns.length; i++){
      var t = turns[i] || {}, no = i + 1;
      var pt = String(t.playerText || '');
      var fl = false;
      if (String(t.inputType || '').toUpperCase() === 'STORY' && pt && !/続きを(?:自然に)?進めて|^続きを書/.test(pt)) fl = apply(plainSplit(pt, names), no, 'input') === true;
      if (!fl) apply(splitNarr(t.narrative, names), no, 'narr');
    }
    // この回の入力が変化を言うなら、その値は載せない
    var ci = opt.currentInput || {}, cit = String(ci.text || '');
    if (cit && /^(STORY|DO)$/i.test(String(ci.type || ''))){
      END_INPUT.forEach(function(e){ if (e[1].test(cit)) e[0].forEach(function(v){ if (W[v]) { delete W[v]; trace.push({ t: cur, from: 'curInput', op: 'end', v: v }); } if (E[v]) { delete E[v]; trace.push({ t: cur, from: 'curInput', op: 'end', v: v }); } }); });
      if (CLEAR_SKY.test(cit)) WET.forEach(function(v){ if (W[v]) delete W[v]; });
      if (DAYSKIP.test(cit)) { W = {}; T = null; Object.keys(E).forEach(function(v){ E[v].big = true; }); }
      else if (T && (ELAPSE.test(cit) || /夜が明け|日が暮れ|日が沈|日が落ち|朝になっ|夜になっ|昼になっ/.test(cit))) T.elapsed = true;
    }
    function lvl(o){ var age = cur - o.last; return (o.big || age > W_LONG) ? 'unconfirmed' : (age <= 1 ? 'now' : 'likely'); }
    var norm = { weather: [], time: null, events: [], past: [] };
    Object.keys(W).map(function(k){ return W[k]; }).sort(function(a, b){ return b.last - a.last; }).slice(0, 2).forEach(function(o){ norm.weather.push({ v: o.v, src: o.src, last: o.last, level: lvl(o) }); });
    if (T) norm.time = { v: T.v, src: T.src, last: T.last, elapsed: !!T.elapsed, age: cur - T.last };
    Object.keys(E).map(function(k){ return E[k]; }).sort(function(a, b){ return b.last - a.last; }).slice(0, 2).forEach(function(o){ norm.events.push({ v: o.v, src: o.src, last: o.last, level: lvl(o) }); });
    Object.keys(P).map(function(k){ return P[k]; }).filter(function(o){ return cur - o.at <= PAST_N; }).sort(function(a, b){ return b.at - a.at; }).slice(0, 2).forEach(function(o){ norm.past.push({ v: o.v, at: o.at, how: o.how }); });
    return { cur: cur, norm: norm, trace: trace };
  }
  function when(n){ return n <= 0 ? '開始時点' : (n + 'ターン目時点'); }
  function whenW(n){ return n <= 0 ? '開始時' : (n + 'ターン目'); }
  var HEAD = '背景の控え（本文で言い直さなくてよい）：';
  // lines(norm) → 1〜2 行（何も無ければ ''）
  function line(norm){
    if (!norm) return '';
    var a = [], b = [];
    (norm.weather || []).forEach(function(w){
      if (w.level === 'now') a.push('現在の天候：' + w.v + '（直前の本文で確認）');
      else if (w.level === 'likely') a.push('現在の天候：' + w.v + 'が続いている可能性が高い（解除の描写なし）');
      else a.push('天候：' + w.v + 'は' + whenW(w.last) + 'に描写（その後は未確認）');
    });
    var t = norm.time;
    if (t){
      if (t.age <= 1 && !t.elapsed) a.push('最後に確認された時刻：' + t.v + '（直前の本文）');
      else a.push('最後に確認された時刻：' + t.v + '（' + when(t.last) + (t.elapsed ? '・その後に時間経過の描写あり' : '') + '）／現在の正確な時刻：未確定');
    }
    (norm.events || []).forEach(function(e){
      if (e.level === 'now') b.push('続いている出来事：' + e.v + '（直前の本文で確認）');
      else if (e.level === 'likely') b.push(e.v + 'が続いている可能性が高い（終了の描写なし）');
      else b.push(e.v + 'は' + whenW(e.last) + 'に描写（その後は未確認）');
    });
    var p = (norm.past || []).map(function(o){ return o.v + '（' + whenW(o.at) + (o.how === 'ended' ? 'に終了' : '') + '）'; });
    if (p.length) b.push('すでに起きた出来事：' + p.join('・'));
    if (!a.length && !b.length) return '';
    var out = [];
    if (a.length) out.push(HEAD + a.join('／'));
    if (b.length) out.push((a.length ? '出来事の控え：' : HEAD) + b.join('／'));
    return out.join('\n');
  }
  var GUARD = '現在まで続いていると確認できる状況を引き継ぐ。変化の描写がないことだけを理由に、古い時刻や一時的な出来事を現在の確定事実にしない。';

  // ---- SEVERE1 r2: 能力の制約（感情は指定しない） ----
  //   根拠は 傷（fix190 の永続の記録。治療状況を含む）と からだ（fix77 の瞬間値）。語が無ければ認定しない。
  //   U = 意識不明（覚醒の根拠が描かれるまで自発的な会話・意図的な行動はできない）
  //   S = 重い出血・衰弱（意識・姿勢・運動・会話量に制約）
  var UNCON_RE = /意識(?:が|は)?(?:な[しい]|無[しい])|意識(?:が|は)?戻(?:ら|って(?:い)?な)|意識を失|意識不明|気を失|失神|昏倒|昏睡|気絶/;
  var UNCON_NOT = /意識(?:が|は|も)?(?:戻っ(?:た|ている|てき)|はっきりし|ある|あり|清明)|(?:目|眼)を(?:開け|覚ま)|目覚め|覚醒し/;
  var SEV_RE = /大量(?:の)?出血|出血多量|出血(?:が|は)?(?:激し|止まら|多[いく]|続|継続|ひど|酷)|血が(?:止まら|噴)|失血|瀕死|虫の息|危篤|重体|衰弱(?:が|は)?(?:激し|ひど|酷|著し|している|しきっ)|呼吸(?:が|は)?(?:弱|浅く途切|止ま)|脈(?:が|は)?(?:弱|触れな)|心肺停止/;
  var SEV_NOT = /(?:出血|血)(?:が|は|も)?(?:止ま(?:った|ってい)|収ま(?:った|ってい)|おさま(?:った|ってい))|止血(?:済|した|された|できた|が済|完了)|手当て(?:済|が済|を終え)|(?:呼吸|脈)(?:が|は|も)?(?:落ち着(?:いた|いてい)|安定し)|容体(?:が|は)安定/g;
  var AWAKE_KA = /立(?:って|ち上が|ち尽)|歩(?:い|き|く)|走(?:っ|り|る)|座(?:って|り直)|話し(?:て|かけ)|喋|見つめ|見上げ|見据え|頷|うなず|握り返|身を起こ|振り返/;
  // sevClass(ka, ki) → 'U' | 'S' | ''（値だけからの判定。その後の本文の回復は recovered() で別に見る）
  function sevClass(ka, ki){
    ka = String(ka || ''); ki = String(ki || '');
    if (!ka && !ki) return '';
    var uKa = UNCON_RE.test(ka) && !UNCON_NOT.test(ka), uKi = UNCON_RE.test(ki) && !UNCON_NOT.test(ki);
    if (uKa) return 'U';
    if (uKi && !(ka && AWAKE_KA.test(ka)) && !UNCON_NOT.test(ka)) return 'U';   // 傷の記録は意識なし、からだ は起きて動いている → 食い違い＝認定しない
    var raw = ka + '／' + ki, both = raw.replace(SEV_NOT, '／');
    if (both !== raw && /止血|(?:出血|血)(?:が|は|も)?(?:止ま|収ま|おさま)|手当て/.test(raw)) both = both.replace(/大量(?:の)?出血|出血多量|出血(?:が|は)?(?:激し|止まら|多[いく]|続|継続|ひど|酷)[ぁ-ん]*|血が(?:止まら|噴)[ぁ-ん]*|失血/g, '／');   // 止血・手当て済みと書かれた記録の出血は数えない
    if (SEV_RE.test(both)) return 'S';
    return '';
  }
  function severe(v){ return sevClass(v, '') !== ''; }
  // その後の本文（値が書かれたターンより後の地の文で、その人の名と同じ文）に、覚醒／治療が描かれたか
  var AWAKE_RE = /目を開け|目を覚ま|意識が戻|意識を取り戻|気がつい|気が付い|息を吹き返|起き上が|身を起こ|薄く目を|瞼(?:が|を)(?:開|持ち上)/;
  var TREAT_RE = /血が止ま|出血が(?:止|収|おさ)ま|止血(?:が|を)?(?:終え|済|でき|した)|包帯を巻き終え|手当て(?:が|を)?(?:終え|済)|縫合(?:が|を)?(?:終え|済)|傷口を(?:縫い終え|塞)/;
  function seenAfter(state, name, sinceTurnIdx, re){
    try {
      var turns = (state && state.turns) || [], nm = String(name || ''); if (!nm) return false;
      for (var i = Math.max(0, (sinceTurnIdx | 0) + 1); i < turns.length; i++){
        var ss = splitNarr(turns[i] && turns[i].narrative, []);
        for (var k = 0; k < ss.length; k++) if (ss[k].indexOf(nm) >= 0 && re.test(ss[k])) return true;
      }
    } catch(e){}
    return false;
  }
  function recovered(state, name, sinceTurnIdx){ return seenAfter(state, name, sinceTurnIdx, AWAKE_RE) || seenAfter(state, name, sinceTurnIdx, TREAT_RE); }
  // sevNow(state, name, entryTurn, ka, ki) → 'U' | 'S' | ''（その後の本文の覚醒・治療を反映）
  function sevNow(state, name, entryTurn, ka, ki){
    var c = sevClass(ka, ki); if (!c) return '';
    if (c === 'U'){ if (seenAfter(state, name, entryTurn, AWAKE_RE)) { c = sevClass(String(ka || '').replace(UNCON_RE, '／'), String(ki || '').replace(UNCON_RE, '／')); } }
    if (c === 'S' && seenAfter(state, name, entryTurn, TREAT_RE)) c = '';   // 治療が描かれた → 制約の行からは外す（傷の記録はそのまま残る）
    return c;
  }
  function severeLine(uNames, sNames){
    var p = [];
    if (uNames && uNames.length) p.push('意識不明の人物（いま該当：' + uNames.join('・') + '）は、目を覚ます・意識が戻る根拠が本文に描かれるまで、自発的に話したり意図して動いたりできない');
    if (sNames && sNames.length) p.push('重い出血・衰弱のある人物（いま該当：' + sNames.join('・') + '）は、意識・姿勢・動き・話せる量に制約がある（落ち着いた態度でいてもよいが、損傷を無かったことにしない）');
    if (!p.length) return '';
    return '・' + p.join('。') + '。治療や回復が描かれたら、その程度に応じて状態を更新する。';
  }

  // ---- DRIVE1 r2: 本能・目的 が「主人公の指示・返事を待つ」だけの定型のとき ----
  //   待つ句を除いた残りに別の中身（自分の行動・狙い）があれば、その値は落とさない。
  function driveSpans(v, hero){
    var h = hero ? esc(String(hero)) : null;
    var who = '(?:主人公|あなた|君|きみ|相手|皆|みんな|誰か' + (h ? '|' + h + '(?:さん|くん|君|ちゃん|様)?' : '') + ')';
    return [
      new RegExp('(?:' + who + '(?:の|から(?:の)?|に))?(?:次の|つぎの)?指示(?:を|が)?(?:求め|待|仰|欲し|ほし|もらい)[ぁ-ん]*', 'g'),
      new RegExp('(?:' + who + '(?:の|に|へ))?(?:判断|決断|決定|命令|合図)(?:を|に)?(?:委ね|任せ|待|求め|仰)[ぁ-ん]*', 'g'),
      new RegExp('(?:' + who + '(?:に|が))?決めて(?:もらい|ほし|欲し|くれるのを待)[ぁ-ん]*', 'g'),
      new RegExp(who + '(?:の|が)(?:次の)?(?:言葉|返事|返答|答え|反応|出方|動き|一言)(?:を)?(?:待|窺|うかが)[ぁ-ん]*', 'g')
    ];
  }
  function drive(v, hero){
    v = String(v || ''); if (!v) return false;
    var rest = v, hit = false;
    driveSpans(v, hero).forEach(function(re){ rest = rest.replace(re, function(){ hit = true; return '／'; }); });
    if (!hit) return false;
    rest = rest.replace(/[\s　・、。,，．.／\/（）()「」:：\-ー―]/g, '').replace(/(?:ている|ていた|ながら|つつ|まま|だけ|ただ|じっと|黙って|静かに|その場で|次の|いる|する|こと|たい|の|を|に|は|が|て|で|と|も)/g, '');
    return rest.length < 3;   // 待つ以外の中身が残るなら落とさない
  }

  // ---- EX192: fix192 のミニ見本（自発の掛け合い）の差し替え（置き換えだけ。行数は増やさない） ----
  //   いまの見本は相手 B が「……ねえ、あんたが決めて」と決定を主人公へ渡す。差し替えは「自分の目的・恐怖・立場に応じて判断し、実行できる範囲で動く」姿を 1 つ示す。
  var EX192 = {
    A: [   // 案 A: 台詞あり（B は自分の恐れから判断し、できる範囲のことを自分で始める）
      '─ミニ見本（自発の掛け合いの例。台詞はこの場面だけのもので、型として使い回さない。短いのは抜粋なので、本文の長さの参考にはしない）─',
      '<say who="相手A">手当てが先よ。歩かせる気？</say>',
      '<say who="相手B">ここに居る方が危ない。……出口を見てくる。戻るまでに縛り終えて</say>',
      '相手Bは返事を待たずに戸口へ向かう。相手Aは布を裂く手を止めない。',
      '<react who="相手A" 反応="自分の役目（止血）を続ける" 声="<say who=\'相手A\'>縛り終えるまで、この人は動かさない</say>"/>'
    ].join('\n'),
    B: [   // 案 B: B の台詞を置かず、地の文で「立場と恐れから判断して動く」姿を示す
      '─ミニ見本（自発の掛け合いの例。人物は自分の目的・恐れ・立場から判断し、実行できる範囲で動く。短いのは抜粋なので、本文の長さの参考にはしない）─',
      '<say who="相手A">手当てが先よ。歩かせる気？</say>',
      '相手Bは首を振り、物音のする戸口を確かめに行く。言い争うより先に、いま自分にできること——荷をまとめる——に手をつけた。',
      '相手Aは布を裂く手を止めない。二人はそれぞれの理由で、別々に動き出している。',
      '<react who="相手A" 反応="自分の役目（止血）を続ける" 声="<say who=\'相手A\'>縛り終えるまで、この人は動かさない</say>"/>'
    ].join('\n')
  };

  root.__v292DfixSCENE2Core = { VER: VER, on: on, severeOn: severeOn, driveOn: driveOn, ex192: ex192, EX192: EX192,
    build: build, line: line, GUARD: GUARD, HEAD: HEAD, W_LONG: W_LONG,
    severe: severe, sevClass: sevClass, sevNow: sevNow, recovered: recovered, severeLine: severeLine,
    drive: drive, splitNarr: splitNarr, scanSentence: scanSentence };
})(typeof window !== 'undefined' ? window : globalThis);
