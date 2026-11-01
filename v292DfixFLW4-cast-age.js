/* v292DfixFLW4-cast-age.js — FLOWFIX 4（GPT #127-PC「4 年齢 Local GO」）
 * 何を直すか: NPC の説明文に「十七歳」とはっきり書いてあっても、本文を作る AI への sys に入るのは【キャラ属性】の
 *   「名前=性別」だけで、年齢が届かない（説明文は在場判定までは送られない）。そのため AI が年齢を推して「十三、四」と書き得た。
 * やること（これだけ）: 【キャラ属性】（fix379 genderBlock / fix366 予備経路）の NPC 1 人ぶんの「名前=性別」の後ろに、
 *   はっきりした年齢があるときだけ「・17歳」を足す（例: 「白川 小夜=女性・17歳」）。説明文のほかの部分は 1 字も送らない。
 *   ・年齢の出どころ: ① 構造化された年齢（n.age が 1〜129 の整数、または「17」「17歳」）があればそれを優先
 *                     ② 無ければ説明文（n.desc）の中の、はっきりした年齢の書き方だけ（最初の一文に限らない）
 *                        「17歳」「十七歳」「17才」「年齢: 17」「年齢は十七歳」など
 *   ・推測しない: 「少女」「高校生」「十代」「二十代」「17歳くらい」「17歳に見える」などからは決めない
 *   ・過去・他人・幅の言い方は拾わない: 「十歳の頃」「十歳で〜した」「十歳だった」「十歳から」「十歳の妹」「妹は十歳」
 *     「享年」「十七、八歳」「17〜18歳」「17歳年上」 など
 *   ・違う年齢が 2 つ以上見つかったら決めない（足さない）。「」『』の中（台詞）は見ない
 *   ★r2（lane83・独立レビュー M1）: 他人の年齢を本人に付けない。「N歳」の後ろは次の形のときだけ本人の年齢とみなす（それ以外は足さない）:
 *     ・すぐ句読点・行末（「十七歳。」「17歳、黒髪」）／「です」「である」「であり」「だ」
 *     ・「N歳の<名詞>」で、その名詞句が句読点・行末か「で」「だ」「です」「である」で終わる（「十七歳の少女。」「二十歳の学生で、」）
 *       名詞句の中に助詞（を・に・と・から・へ・より・が・は・も・の など）があれば他人を修飾している扱い（「12歳の少年を助けた女性」）
 *       名詞が人の関係（父・母・師匠・上司・先生・生徒・主人公・弟子・部下 など）や複数（〜たち・達・ら）なら足さない
 *     ・「N歳を超える」「N歳になった」など、上の形でないものは足さない（分からなければ何も足さない）
 *   ・主人公には足さない（主人公の説明文は毎ターン user に入っている）。性別が無い NPC は従来どおり【キャラ属性】に出ない
 * 保存・通信: 0（読むだけ）。ほかの sys ブロック・予算（fix379 prio1）・マーカーは変えない。
 * kill: localStorage v292DfixFLW4Off='1' → suffix() は常に ''（送信ごとに評価・デプロイ不要）
 * 検証口: window.__v292DfixFLW4 = { version, off, ageOf(npc), ageFromText(desc), suffix(npc), status() }
 */
(function(root){
  'use strict';
  var W = root || {};
  if (W.__v292DfixFLW4) return;
  var VERSION = 'FLW4-r2';
  var stats = { calls: 0, added: 0, structured: 0, fromDesc: 0, ambiguous: 0, none: 0, off: 0 };
  function off(){ try { return !!(W.localStorage && W.localStorage.getItem('v292DfixFLW4Off') === '1'); } catch(e){ return false; } }
  function nfkc(s){ s = String(s == null ? '' : s); try { return s.normalize('NFKC'); } catch(e){ return s; } }
  var KD = '〇一二三四五六七八九';
  function kanjiNum(t){                                   /* 〇一二…九・十・百（例: 十七→17・二十→20・百二→102） */
    var n = 0, cur = 0, any = false;
    for (var i = 0; i < t.length; i++){
      var c = t.charAt(i), d = KD.indexOf(c);
      if (d >= 0){ cur = d; any = true; }
      else if (c === '十'){ n += (cur || 1) * 10; cur = 0; any = true; }
      else if (c === '百'){ n += (cur || 1) * 100; cur = 0; any = true; }
      else return null;
    }
    return any ? n + cur : null;
  }
  function numOf(t){ if (/^\d{1,3}$/.test(t)) return +t; return kanjiNum(t); }
  function okAge(n){ return typeof n === 'number' && isFinite(n) && Math.floor(n) === n && n >= 1 && n <= 129; }
  var NUM = '(\\d{1,3}|[〇一二三四五六七八九十百]{1,5})';
  /* 前: 数字の続き（範囲・桁）・享年・他人・見た目 */
  var PRE_NUM = /[\d〇一二三四五六七八九十百]$/;
  var PRE_RANGE = /[\d〇一二三四五六七八九十百]\s*[、,~〜～\-－ー・]\s*$/;
  var PRE_BAD = /(享年|没年|当時|時点|頃|ころ|昔|かつて|前に|見た目|外見|見かけ|一見|推定|自称|妹|弟|娘|息子|姉|兄|父|母|祖父|祖母|子供|子ども|こども|孫|夫|妻|恋人|友人|友達|幼馴染|相棒|主人公|あなた|君|お前|師匠|上司|先生|生徒|先輩|後輩|主人|主君|恩師|弟子|部下|患者|依頼人)(?:は|が|も|の|を|に|と|で)?[^。\n]{0,4}$/;
  /* 後: 時点・過去・幅・近似・見え方・他人の年齢 */
  var POST_BAD = /^(?:の(?:頃|ころ|時|とき|折|夏|冬|春|秋|誕生日|日|年|頃に|時に|ときに|妹|弟|娘|息子|子|孫|姉|兄|弟子|子供|子ども|こども|差|離れた)|頃|ころ|当時|時点|時分|まで|から|より|以来|以上|以下|未満|前後|くらい|ぐらい|位|ほど|程|前|年上|年下|上|下|差|違い|離れ|若い|若く|になる|になった|になれば|になったら|になって|に見え|にも見え|と見え|と言|だった|でした|であった|で(?!ある|あり|す)|児|頃|っぽ|代|〜|~|～|-|－|、\s*[\d〇一二三四五六七八九十])/;
  /* ★r2: 「N歳」が本人を指す形か（後ろだけを見る。分からなければ false） */
  var OTHER_NOUN = /(?:父|母|兄|姉|弟|妹|息子|娘|孫|夫|妻|師匠|上司|先生|生徒|主人公|主人|主君|恩師|弟子|部下|先輩|後輩|友人|友達|恋人|幼馴染|相棒|客|患者|依頼人|教え子|侍女|家来)$/;
  var PLURAL = /(?:たち|達|ら|ども|共|方)$/;
  function postSelf(post){
    post = post.replace(/^\s+/, '');
    if (post === '' || /^[。、，,．\n！？!?）)]/.test(post)) return true;
    if (/^(?:です|である|であり|だ(?![っろと]))/.test(post)) return true;
    if (post.charAt(0) !== 'の') return false;
    var seg = post.slice(1).split(/[。、，,．\n！？!?]/)[0];
    var m = seg.match(/^([^をにとからへよりがはもでだのやけ\s]{1,12}?)(?:で|だ|です|である|であり)?$/);
    if (!m) return false;
    if (OTHER_NOUN.test(m[1]) || PLURAL.test(m[1])) return false;
    return true;
  }
  function stripQuotes(s){ return s.replace(/「[^」]*」|『[^』]*』|“[^”]*”/g, '　'); }
  function clauseBefore(s, i){ var j = Math.max(s.lastIndexOf('。', i - 1), s.lastIndexOf('\n', i - 1), s.lastIndexOf('、', i - 1)); return s.slice(j + 1, i); }
  function ageFromText(desc){
    var s = stripQuotes(nfkc(desc)); if (!s) return null;
    var found = [], m, re;
    /* ① 年齢: 17 / 年齢は十七歳 / 年齢 17 */
    re = new RegExp('年齢\\s*(?:[:：]|は|=)?\\s*' + NUM + '\\s*(?:歳|才)?', 'g');
    while ((m = re.exec(s))){
      var post1 = s.slice(m.index + m[0].length);
      if (/^\s*(?:くらい|ぐらい|位|ほど|程|前後|以上|以下|未満|代|[、,~〜～\-－]\s*[\d〇一二三四五六七八九十])/.test(post1)) continue;
      var pre1 = clauseBefore(s, m.index);
      if (/(見た目|外見|見かけ|推定|自称|妹|弟|娘|息子|姉|兄|父|母|子供|子ども|孫|師匠|上司|先生|生徒|主人公|弟子|部下)(?:の|は)?\s*$/.test(pre1)) continue;
      var v1 = numOf(m[1]); if (okAge(v1)) found.push(v1);
    }
    /* ② 17歳 / 十七歳 / 17才（年齢: の後ろで既に拾ったものは①で数え済みなので重複しても同値） */
    re = new RegExp(NUM + '\\s*(?:歳|才)', 'g');
    while ((m = re.exec(s))){
      var i = m.index, pre = s.slice(0, i), post = s.slice(i + m[0].length);
      if (PRE_NUM.test(pre)) continue;                                   /* 「百十七歳」の途中などは同じ数の一部 */
      if (PRE_RANGE.test(pre)) continue;                                 /* 「十七、八歳」「17〜18歳」の後ろ側 */
      if (/年齢\s*(?:[:：]|は|=)?\s*$/.test(pre)) continue;               /* ①で処理済み */
      if (PRE_BAD.test(clauseBefore(s, i))) continue;
      if (POST_BAD.test(post)) continue;
      if (!postSelf(post)) continue;                                     /* ★r2: 本人を指す形でなければ拾わない */
      var v = numOf(m[1]); if (okAge(v)) found.push(v);
    }
    if (!found.length) return null;
    for (var k = 1; k < found.length; k++) if (found[k] !== found[0]) return { ambiguous: true, values: found.slice(0, 6) };
    return { years: found[0] };
  }
  function structured(n){
    if (!n || typeof n !== 'object' || !Object.prototype.hasOwnProperty.call(n, 'age')) return null;
    var a = n.age;
    if (typeof a === 'number') return okAge(a) ? a : null;
    if (typeof a === 'string'){ var t = nfkc(a).trim().match(/^(\d{1,3}|[〇一二三四五六七八九十百]{1,5})\s*(?:歳|才)?$/); if (t){ var v = numOf(t[1]); return okAge(v) ? v : null; } }
    return null;
  }
  function ageOf(n){
    if (!n || typeof n !== 'object') return null;
    var s = structured(n); if (s != null) return { years: s, src: 'structured' };
    var r = ageFromText(n.desc);
    if (r && r.years != null) return { years: r.years, src: 'desc' };
    if (r && r.ambiguous) return { ambiguous: true };
    return null;
  }
  function suffix(n){
    try {
      stats.calls++;
      if (off()){ stats.off++; return ''; }
      var a = ageOf(n);
      if (a && a.years != null){ stats.added++; if (a.src === 'structured') stats.structured++; else stats.fromDesc++; return '・' + a.years + '歳'; }
      if (a && a.ambiguous) stats.ambiguous++; else stats.none++;
      return '';
    } catch(e){ return ''; }
  }
  W.__v292DfixFLW4 = { version: VERSION, off: off, ageOf: ageOf, ageFromText: ageFromText, suffix: suffix,
                       status: function(){ return { version: VERSION, off: off(), stats: JSON.parse(JSON.stringify(stats)) }; } };
})(typeof window !== 'undefined' ? window : this);
