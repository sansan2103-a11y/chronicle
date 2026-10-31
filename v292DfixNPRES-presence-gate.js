/* =====================================================================
 * Chronicle v292DfixNPRES (r-c333): NPC を「場面にいる／未確認／別の場所」の 3 つに分け、次ターンの指示の載せ方を変える（読むだけ・保存しない）
 * ---------------------------------------------------------------------
 * 実例（Owner iPhone 2026-10-31・本番 65-b）: 別の場所にいる NPC（千景）を AI が何度も場面に入れる。✎ で消しても次のターンでまた入る。
 * 実測（laneNPRES・合成物語・nonet2）: fix192 stateBlock は fix77 store の全員の「からだ・こころ」を何ターン前でも載せる。
 *   fix305（登場中だけ）は新エンジンでは効かない。✎（EDIT-01）は本文と会話ログだけを直し、store は消した本文の値のまま。
 * GPT #127-OE / #127-OG の条件（r-a の「4 ターン名前が無い＝いない」も、r-b の「6 ターンで未確認」もやめた）:
 *   (a) 場面にいる証拠がある → 今の値をそのまま渡す。名前が何ターン出なくても、主人公の場面移動・はっきりした退場が無い限り外さない
 *   (b) 最近の同席が確かめられない → 古い「その瞬間の値」は載せない・前に出さない。ただし「いない」とも書かない
 *   (c) 別の場所にいる証拠がある → 場面に入れない。傷・関係・未解決は残す
 *   今回の入力に名前があるだけでは「いる」の証拠にしない。store・fix190 には書かない。CP1 の受け口は上書きしない。
 *
 * ■証拠（正本の本文だけ。<state>/<react> タグ・plan._v254who・入力文は「いる」の証拠にしない）
 *   新しいターンから順に（全ターン）見て、最初に証拠があったターンで決める:
 *     ・本文（turn.narrative）でその人の名前の形が出る文のうち、最後の文が
 *         強い不在（CP1 の ABSENT と同じ語・同じ形「名＋は/が/も＋短い間＋いない／出て行った／立ち去った…」）→ (c)
 *         弱い離れ（電話・声だけ・越し・向こう・待つ・残る・置いて・回想・夢・噂・らしい 等）→ (b)
 *         それ以外 → そのターンに「いる」
 *     ・本文に名前が無く、会話ログ（_convSays）にその人の発話がある → そのターンに「いる」（本文に電話・画面の語があれば (b)）
 *   「いる」ターン te のあと、主人公の場面移動（CP1 の sceneMoveOf、fix645 と同じ検証）があれば (b)。無ければ何ターンたっても (a)。
 *   証拠が 1 つも無ければ (b)。
 *   CP1 が実効 ON で、その人が ABSENT（プレイヤーの明示）なら (c)。
 *   名前の形は CP1 rawForms/formTable と同じ（cast 全体で一意な形だけ）。形が無い人（同名で一意でない等）は判定しない＝従来どおり。主人公は対象外。
 * ■✎ で消えた描写（孤立した値）: store の行の turn のターンで、plan.narrative の地の文（AI の元の文）にはその人がいたのに、
 *   今の本文と会話ログにはいない → その値（からだ・こころ・本能・目的）は使わない（グループは本文の残りから決める）。
 * ■使い方（fix192 の 3 か所・fix145 の表示・fix333 の前面化＝fgStates333 が CP1 の結果の後に fgRestrict を当てる）
 *   (b)・(c)・孤立: 【各キャラの現在の状態】で からだ・こころ・本能・目的 を載せない。(c) だけ先頭に「別の場所にいる」。
 *   (b)・(c): 【この場面の種】【自発】の候補にしない（候補を減らすだけ）。fgRestrict()（fix333 の前面化・背景）からも外す。
 *   孤立: キャラ一覧で、からだ・こころ・本能を表示しない。
 * ■スイッチ: 既定 OFF。kill v292DfixNPRESOff='1'（常に勝つ・その場で効く）。
 *   ★admf2（laneINT・2026-11-01・GPT #127-OQ 3）: ON にするのは管理者画面だけ = ADMF1.gate('npres1') が true のとき（そのアカウントの行が 1）。
 *   行なし・取得失敗・待ち・別アカウント・ADMF1Off・ADMF1 が読めない → OFF。端末の opt-in v292DfixNPRESOn='1' はもう ON にしない（読むのは診断の表示だけ）。
 *   判定は呼ばれるたびに ADMF1 へ聞く（読むだけ・保存しない）。/auth/me の答えが後から届けば、その次の組み立てから ON。d1〜d4 の部分 kill はそのまま。
 *   OFF/kill のとき gate()=null・orphan()=false・fgRestrict()=null → 呼ぶ側は従来と 1 バイトも同じ。
 * ■書かないもの: localStorage・S・store・サーバー・plan・DOM・ほかの部品の関数（包まない・上書きしない）。新しい【】見出し・規則文は無い。
 * ■診断: window.__v292DfixNPRES.status()（件数だけ。名前・本文は入れない）
 * ■r-d（laneNPRES holes・2026-10-31・c333 の上。ON のときだけ効く。別々に止められる）:
 *   d1: 閉じた「…」『…』の中だけに出る名前と、地の文の「X のことを口にした／X について話した」は「いる」の証拠にしない（強い不在・弱い離れの判定は c333 のまま）。
 *       その人自身の発話（会話ログの who）と、カギかっこの外の動作・帰属は従来どおり「いる」。kill v292DfixNPRESd1Off='1'（その場で効く）。
 *   d2: (a) でも、最後の「いる」の証拠より新しいターンの描写が ✎ で消えた（孤立の値と同じ合図）なら、fgRestrict（前面化・背景）からも外す。kill v292DfixNPRESd2Off='1'。
 *   d1Off と d2Off の両方で c333 と同じ動き。
 * ■r-d2（GPT #127-OM）: d1 に「離れた所からの声」を足す（d1Off で一緒に止まる）。電話・無線・録音・画面越し・読み上げ などで届いた声は「いる」の証拠にしない。
 *   ・本人の台詞（会話ログ who）: その台詞と前後 1 文に離れた声の合図があれば (b)。前後の文の合図は、ほかの NPC の名前の形が出る文なら数えない（別の人の電話を取り違えない）。
 *     台詞が本文に見つからないときは、そのターンの本文全体で合図を見る。c333 の CALL の判定（ターン全体）はそのまま。
 *   ・本文で名前が出る文: かっこの外に合図があり、ほかの NPC の名前が出ない文、または本人の離れた台詞に付いた帰属の文は (b)。
 * ■r-d3（2026-10-31・coordinator の d3 指示・kill v292DfixNPRESd3Off='1'、その場で効く。d3Off で d2 と同じ）:
 *   ・離れた所からの声（d1 が見つけたもの）で、それが最新のターンで、通話・無線・画面越しが続いているなら、状態の行に
 *     「電話（無線・画面）の向こうにいる。この場にはいない。声だけで会話に加われる」を書く（からだ・こころ等と前面化は従来どおり外す）。
 *     録音・留守電・読み上げ・放送は、話に加われないので書かない。その最新ターンで通話が切れた（電話を切・通話が切れ 等）なら「別の場所にいる」(c)。
 *   ・c333 の弱い語の取り違えを直す: 弱い語は、かっこの外にあるときだけ数える。画面・電話・手紙などの「物」の語だけなら、
 *     その人が文の主語（名＋は/が/も）で、映る・越し・向こう・声 などの結び付きが無ければ「いる」のまま（例「司書が画面を覗き込んだ」）。
 *     待つ・残る・向かう・越し・らしい などの語は従来どおり。会話ログだけの台詞は、c333 のターン全体の CALL 判定の代わりに、その台詞と前後 1 文だけを見る。
 * ■r-d4（GPT #127-OO・kill v292DfixNPRESd4Off='1'、その場で効く。d4Off で d3 と同じ。d3Off でも止まる）:
 *   ・通話が何ターンも続き、途中のターンに電話の語が無いとき: 本人の台詞が会話ログだけ（または本文が「X の声…」だけ）なら、
 *     さかのぼって最後の通話の始まり（d1 の離れた声）まで見て（r-d4b: 6 ターンの上限を外した。安全のため 200 ターンまで）、その間に通話の終わり・体の登場が無ければ、離れた声として扱う。
 *     新しい保存はしない（本文と会話ログから毎回さかのぼって決める）。
 *   ・通話が切れた後: そのあと本人の体の登場が書かれていなければ、会話ログだけの台詞は「確かめられない」(b・一行なし)、黙っていれば「別の場所にいる」(c)。
 *   d2 は変えない（✎ の描写が消えたターンに本文・会話ログの名前が残っていれば orphan にならず前面化に残る。退場の扱いにはしない＝「別の場所にいる」は付かない。傷・関係・未解決・登録は消さない）。
 * ===================================================================== */
(function () {
  'use strict';
  var G = window;
  if (G.__v292DfixNPRES) return;
  var VER = 'npres-d4b-admf2-20261101';
  var NOTE = '別の場所にいる';
  function ls(k) { try { return G.localStorage.getItem(k); } catch (e) { return null; } }
  function killed() { return ls('v292DfixNPRESOff') === '1'; }
  function optIn() { return ls('v292DfixNPRESOn') === '1'; }
  function d1() { return ls('v292DfixNPRESd1Off') !== '1'; }   /* ★d1 kill（その場で効く） */
  function d2() { return ls('v292DfixNPRESd2Off') !== '1'; }   /* ★d2 kill（その場で効く） */
  function d3() { return ls('v292DfixNPRESd3Off') !== '1'; }   /* ★d3 kill（その場で効く） */
  function d4() { return ls('v292DfixNPRESd4Off') !== '1'; }   /* ★d4 kill（その場で効く） */
  function admfOn() { try { var A = G.__v292DfixADMF1; return !!(A && typeof A.gate === 'function' && A.gate('npres1', false) === true); } catch (e) { return false; } }   /* ★admf2: 管理者画面の ON だけ（ADMF1 が無い・例外 = OFF） */
  function on() { return !killed() && admfOn(); }
  var LOAD_ON = false; try { LOAD_ON = on(); } catch (e) { LOAD_ON = false; }   /* 診断用: 読み込み時の値（ふつうは答えが届く前なので false） */
  var ST = { gates: 0, a: 0, b: 0, c: 0, cp1c: 0, orphanVals: 0, fgCalls: 0, fgFiltered: 0, fgExcluded: 0, rosterHidden: 0, d1Skip: 0, d1Remote: 0, d2Excluded: 0, d3Kept: 0, d3Note: 0, d3Ended: 0, d4Call: 0, d4After: 0, errors: 0 };

  function getS() {
    try { var g = G.__chronicleGetState; if (typeof g === 'function') { var s = g('npres'); if (s) return s; } } catch (e) {}
    try { return (0, eval)('typeof S!=="undefined"?S:null'); } catch (e2) { return null; }
  }
  function realStore() {
    try { var X = G.__v292Dfix850x; if (X && typeof X.realStore === 'function') { var r = X.realStore(); if (r && typeof r === 'object') return r; } } catch (e) {}
    try { return G.__v292Dfix77Store || {}; } catch (e2) { return {}; }
  }
  /* ---- 名前の形（CP1 rawForms / formTable と同じ規則） ---- */
  function rawForms(name) {
    var n = String(name || '').trim(), out = [];
    if (!n) return out;
    out.push(n);
    var parts = n.split(/[\s　・]+/).filter(Boolean);
    if (parts.length > 1) { parts.forEach(function (p) { if (p.length >= 2) out.push(p); }); return out; }
    var L = n.length;
    if (L === 3) { out.push(n.slice(1)); out.push(n.slice(0, 2)); }
    else if (L === 4) { out.push(n.slice(0, 2)); out.push(n.slice(2)); }
    else if (L >= 5) { out.push(n.slice(0, 2)); out.push(n.slice(-3)); out.push(n.slice(-2)); }
    return out.filter(function (f) { return f.length >= 2; });
  }
  function castNames(S) {
    var c = (S && S.cast) || {}, a = [];
    try { if (c.hero && c.hero.name) a.push(String(c.hero.name)); } catch (e) {}
    (Array.isArray(c.npcs) ? c.npcs : []).forEach(function (p) { if (p && p.name) a.push(String(p.name)); });
    return a;
  }
  function formTable(names) {
    var count = {}, all = names.map(function (n) { var fs = rawForms(n); fs.forEach(function (f) { count[f] = (count[f] || 0) + 1; }); return { name: n, forms: fs }; });
    var t = {}; all.forEach(function (e) { t[e.name] = (t[e.name] ? [] : e.forms.filter(function (f) { return count[f] === 1; })); });   /* 同じ完全名が 2 人いれば形は無い */
    return t;
  }
  function sp(x) { return String(x == null ? '' : x).replace(/[\s　]/g, ''); }
  function esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  /* ---- 文の分類（強い不在＝CP1 の ABSENT_V と同じ語と形。弱い離れ＝遠隔・越し・待つ・回想など） ---- */
  var HON = '(?:先輩|せんぱい|さん|くん|君|ちゃん|様|さま|氏|先生|部長)?';
  var GAP = '(?:どこにも|どこへも|もう|既に|すでに|まだ|また|やはり|やっぱり)*[^、。！？!?\\nはがもてで]{0,10}?';
  var ABSENT_V = '(?:は|が|も|の姿(?:は|が|も)?|とは)?' + GAP + '(?:いない|居ない|いなかった|居なかった|いなくなった|居なくなった|いなくなって|消えた|消えていた|姿がない|姿が見えない|姿はない|姿は無い|見当たらない|見あたらない|はぐれた|はぐれて|置いていかれた|取り残された|連れ去られた|さらわれた|攫われた|離れ離れ|別行動|置いてき|置いて行|立ち去った|出て行った|出ていった|去った|去っていった|帰った|帰っていった|帰ってしまった|姿を消した)';
  var WEAK = /電話|通話|受話器|スピーカー|声だけ|声しか|画面|モニター|メッセージ|メール|手紙|写真|通知|噂|思い出|回想|記憶|夢|幻|かもしれ|だろう|らしい|はず|つもり|もし|越し|向こう|待って|待つ|待ち|残っ|残る|残し|置いて|向かっ|別の場所|別の部屋|隣の部屋|遠く/;
  var CALL = /電話|通話|受話器|スピーカー越し|画面越し|ビデオ通話|声だけ|声しか|モニター|端末/;
  function sentences(s) { return String(s || '').split(/[。！？!?\n]/).filter(function (x) { return x.trim(); }); }
  var UNREAL = /かもしれ|だろう|ような気|気がした|思い出|回想|夢|幻|電話|通話|受話器|画面|スマホ|端末|メッセージ|噂|らしい|はず|だったら|つもり|かのよう|もし|想像|錯覚|声だけ|声しか/;   /* CP1 の UNREAL と同じ語 */
  function classify(sent, fs) {
    for (var i = 0; i < fs.length; i++) if (sent.indexOf(fs[i]) >= 0 && new RegExp(esc(fs[i]) + HON + ABSENT_V).test(sent)) return UNREAL.test(sent) ? 'weak' : 'strong';
    return WEAK.test(sent) ? 'weak' : 'present';
  }
  /* ★d1: 閉じた「…」『…』の中身を \u0001 に替える（文の区切り・空白は残すので sentences() の分け方が本文と同じ。閉じていないかっこは替えない） */
  function maskQ(s) {
    var a = String(s).split(''), st = [];
    for (var i = 0; i < a.length; i++) {
      var ch = a[i];
      if (ch === '「' || ch === '『') st.push(i);
      else if ((ch === '」' || ch === '』') && st.length) { var o = st.pop(); if (!st.length) for (var j = o; j <= i; j++) if (!/[。！？!?\n\s]/.test(a[j])) a[j] = '\u0001'; }
    }
    return a.join('');
  }
  /* ★d1: 地の文で話題に出ただけ（X のことを口にした／X について話した／X の名前を呟いた 等）も外す */
  var TOPIC_SP = '口にし|口にす|話し|話す|話題に|言っ|言い|言う|尋ね|訊ね|訊い|聞い|聞か|聞く|問い|問う|呟|つぶや|噂し|噂す';
  function topicOff(q, fs) {
    var r = q;
    for (var i = 0; i < fs.length; i++) r = r.replace(new RegExp(esc(fs[i]) + HON + '(?:のこと|の事|について|に関して|の名前|の名|の噂|の話題)[をはがもで]?[^、。\\n]{0,4}?(?:' + TOPIC_SP + ')', 'g'), '\u0001');
    return r;
  }
  /* ★d1(r-d2): 離れた所から届いた声の合図（電話・無線・録音・画面越し・読み上げ など） */
  var VR = /もしもし|電話越し|電話口|電話の向こう|受話器の向こう|受話器から|通話(?:口|中|越し)|着信|電話が鳴|無線(?:機)?(?:越し|から|が鳴|が入|に入)|通信(?:機)?(?:から|が入|越し)|トランシーバー(?:から|越し)|インカム(?:から|越し)|録音(?:された|の声|を再生)|留守電|ボイス(?:メッセージ|メモ)|読み上げ|画面越し|画面の向こう|ビデオ通話|スピーカー(?:から|越し)|ラジオから|放送で|イヤホン(?:から|越し)|ノイズ混じり|(?:電話|スマホ|携帯|端末|モニター|画面|無線|ラジオ|スピーカー|通信機|受話器)[^。！？!?\n]{0,12}?(?:声|聞こえ|響い|響く|流れ)/;
  function segs(nar) { var out = [], st = 0; for (var i = 0; i <= nar.length; i++) { if (i === nar.length || /[。！？!?\n]/.test(nar.charAt(i))) { if (nar.slice(st, i).trim()) out.push({ s: nar.slice(st, i), a: st, b: i }); st = i + 1; } } return out; }
  function stripBr(q) { return String(q == null ? '' : q).replace(/^[\s「『]+|[\s」』]+$/g, ''); }
  /* 本人の台詞が離れた所からか: 台詞の文と前後 1 文（前後の文は、ほかの NPC の名前の形が出るなら数えない） */
  function remoteOwn(nar, quotes, others, re) {   /* 見つけた合図の文字列（無ければ ''）。re の既定は VR */
    var ss = null, R = re || VR, f = function (x) { var m = R.exec(x); return m ? m[0] : ''; };
    for (var k = 0; k < quotes.length; k++) {
      var qt = stripBr(quotes[k]); if (!qt) continue;
      var p = nar.indexOf(qt); if (p < 0) { var w = f(nar); if (w) return w; continue; }
      ss = ss || segs(nar); var idx = [];
      for (var j = 0; j < ss.length; j++) if (ss[j].b > p && ss[j].a < p + qt.length) idx.push(j);
      if (!idx.length) continue;
      for (var m = idx[0]; m <= idx[idx.length - 1]; m++) { var c1 = f(ss[m].s); if (c1) return c1; }
      var nb = [idx[0] - 1, idx[idx.length - 1] + 1];
      for (var x = 0; x < 2; x++) { var g = ss[nb[x]]; if (g && !hit(g.s, others)) { var c2 = f(g.s); if (c2) return c2; } }
    }
    return '';
  }
  /* ★d3: 弱い語の取り違えを直す・離れた声の種類と通話の終わり */
  var DEV3 = /画面|モニター|電話|通話|受話器|スピーカー|スマホ|携帯|端末|メッセージ|メール|通知|写真|手紙/g;
  var TIE3 = /映|越し|向こう|から聞こえ|の声|声が|声だけ|声しか/;
  var VRC3 = new RegExp(VR.source + '|' + CALL.source);
  var REC3 = /録音|留守電|ボイス(?:メッセージ|メモ)|読み上げ|放送|ラジオ/;
  var RADIO3 = /無線|トランシーバー|インカム|通信/;
  var SCREEN3 = /画面|ビデオ|モニター/;
  var END3 = /電話を切|通話を切|通話が切れ|電話が切れ|通信が切れ|無線が切れ|回線が切れ|通話を終え|電話を終え|通話が途切れ|通信が途絶/;
  function voiceOff4(q, fs) { var r = q; for (var i = 0; i < fs.length; i++) r = r.replace(new RegExp(esc(fs[i]) + HON + 'の声', 'g'), '\u0001'); return r; }
  function absHit(sent, fs) { for (var i = 0; i < fs.length; i++) if (sent.indexOf(fs[i]) >= 0 && new RegExp(esc(fs[i]) + HON + ABSENT_V).test(sent)) return true; return false; }
  function lexWeak3(q, fs) {   /* q = かっこの外だけの文。弱い語の 'weak' をもう一度決める */
    if (!WEAK.test(q)) return 'present';                    /* 弱い語はかっこの中だけ */
    if (WEAK.test(q.replace(DEV3, ''))) return 'weak';      /* 待つ・残る・越し・らしい などは c333 のまま */
    if (TIE3.test(q) || VR.test(q)) return 'weak';
    for (var i = 0; i < fs.length; i++) if (new RegExp(esc(fs[i]) + HON + '[はがも]').test(q)) return 'present';   /* 主語が本人で、物の語だけ */
    return 'weak';
  }
  function hit(txt, fs) { for (var k = 0; k < fs.length; k++) if (fs[k] && txt.indexOf(fs[k]) >= 0) return true; return false; }
  function sayHit(t, fs, name, all) {
    var cs = t && t._convSays; if (!Array.isArray(cs)) return all ? [] : false; var r = [];
    for (var i = 0; i < cs.length; i++) { var c = cs[i]; if (!c) continue; var w = String(c.who == null ? '' : c.who); if (w === name || fs.indexOf(w) >= 0) { if (!all) return true; r.push(String(c.say == null ? '' : c.say)); } }
    return all ? r : false;
  }
  /* そのターンの証拠: 'strong' | 'weak' | 'present' | '' */
  function evidenceOf(t, fs, name, D1, others, D3, info, D4) {
    var nar = String((t && t.narrative) || ''), last = '', ownR = null;
    var own = function () { if (ownR === null) ownR = remoteOwn(nar, sayHit(t, fs, name, true), others || []); return ownR; };   /* ★d1(r-d2) */
    var rem = function (cue) { ST.d1Remote++; if (!D3) return 'weak'; if (info) info.cue = String(cue || ''); return 'remote'; };   /* ★d3: 離れた声は 'remote'（グループは b） */
    var ss = sentences(nar), qm = (D1 || D3) ? sentences(maskQ(nar)) : null; if (qm && qm.length !== ss.length) qm = null;   /* ★d1/d3: 分け方がずれたら c333 のまま */
    var qs = D1 ? qm : null;
    var voice = false;
    ss.forEach(function (s, i) { if (!hit(s, fs)) return; var c = classify(s, fs); if (qs && c === 'present' && !hit(topicOff(qs[i], fs), fs)) { ST.d1Skip++; return; }   /* ★d1: かっこの中・話題だけの「いる」は数えない */
      if (D4 && qs && c === 'present' && !hit(voiceOff4(qs[i], fs), fs) && !VR.test(qs[i])) { voice = true; return; }   /* ★d4: 「X の声…」だけの文は体の証拠にしない（会話ログだけと同じ扱い） */
      if (qs && c === 'present') { var cue = (VR.exec(qs[i]) && !hit(qs[i], others || [])) ? VR.exec(qs[i])[0] : ((/[「」『』]/.test(s) && own()) ? own() : ''); if (cue) c = rem(cue); }   /* ★d1(r-d2): 離れた所からの声 */
      else if (D3 && qm && c === 'weak' && !absHit(s, fs)) {   /* ★d3: 弱い語だけの 'weak' を見直す */
        if (D1 && VR.test(qm[i]) && !hit(qm[i], others || [])) c = rem(VR.exec(qm[i])[0]);
        else { c = lexWeak3(qm[i], fs); if (c === 'present') ST.d3Kept++; }
      }
      last = c; });
    if (last) return last;
    if (sayHit(t, fs, name) || voice) {
      if (D3) { var w = remoteOwn(nar, sayHit(t, fs, name, true), others || [], D1 ? VRC3 : CALL); if (w) return D1 ? rem(w) : 'weak'; if (CALL.test(nar)) ST.d3Kept++; if (info) info.logOnly = true; return 'present'; }   /* ★d3: CALL もその台詞と前後 1 文だけ。★d4: 会話ログ（声）だけの「いる」に印 */
      if (CALL.test(nar)) return 'weak'; if (D1 && own()) { ST.d1Remote++; return 'weak'; } return 'present'; }   /* ★d1(r-d2): 本人の台詞が離れた所から */
    return '';
  }
  function planProse(t) {
    var pn = t && t.plan && t.plan.narrative; if (!Array.isArray(pn)) return '';
    return pn.map(function (l) { return typeof l === 'string' ? l.replace(/<say\b[\s\S]*?<\/say>/gi, '').replace(/<[^>]*>/g, '') : ''; }).join('\n');
  }
  function canonText(t) {
    var s = String((t && t.narrative) || ''); var cs = t && t._convSays;
    if (Array.isArray(cs)) for (var i = 0; i < cs.length; i++) { var c = cs[i]; if (c) s += '\n' + String(c.who == null ? '' : c.who) + '\n' + String(c.say == null ? '' : c.say); }
    return s;
  }
  function isHero(n, hero) { var x = sp(n); return !x || x === '主人公' || x === 'あなた' || (hero && x === hero); }
  function cp1Absent(S) {
    var out = {};
    try {
      var F = G.__v292DfixCP1; if (!F || typeof F.on !== 'function' || !F.on() || typeof F.effective !== 'function' || !F.effective()) return out;
      var cur = S.scene && S.scene[F.FIELD], len = S.turns.length;
      var p = (cur && cur.v === 1 && cur.turnsLen === len && cur.npcs) ? cur : (typeof F.derive === 'function' ? F.derive(S) : null);
      if (p && p.npcs) Object.keys(p.npcs).forEach(function (id) { var x = p.npcs[id]; if (x && x.state === 'ABSENT' && x.name) out[String(x.name)] = 1; });
    } catch (e) {}
    return out;
  }

  /* gate(): OFF なら null。ON なら（1 回の build の間だけ使う。入力文は読まない）
       group(name, entry) → '' | 'a' | 'b' | 'c'   orphan(name, entry) → 真偽   out(name, entry) → 'b' か 'c' */
  function gate() {
    if (!on()) return null;
    try {
      var S = getS(); if (!S || !Array.isArray(S.turns) || !S.turns.length) return null;
      ST.gates++;
      var turns = S.turns, L = turns.length, tbl = formTable(castNames(S));
      var hero = ''; try { hero = sp(S.cast && S.cast.hero && S.cast.hero.name); } catch (e) {}
      var abs = cp1Absent(S), moves = null, memo = {}, omemo = {}, tmemo = {}, rmemo = {}, D1 = d1(), D3 = d3(), D4 = D3 && d4();
      var formsOf = function (n) { return Object.prototype.hasOwnProperty.call(tbl, n) ? tbl[n] : [n]; };
      var npcNames = castNames(S).filter(function (x) { return !isHero(x, hero); });
      var othersOf = function (n) { var o = []; npcNames.forEach(function (x) { if (x !== n) rawForms(x).forEach(function (f) { if (o.indexOf(f) < 0) o.push(f); }); }); return o; };   /* ★d1(r-d2): ほかの NPC の名前の形（同名の別人を取り違えないため、一意でない形も入れる） */
      var moveAfter = function (te) {
        if (!moves) { moves = []; try { var F = G.__v292DfixCP1; if (F && typeof F.sceneMoveOf === 'function') for (var i = 0; i < L; i++) { var m = F.sceneMoveOf(turns[i], S.cast && S.cast.hero && S.cast.hero.name); if (m && m.to) moves.push(i); } } catch (e) {} }
        for (var k = 0; k < moves.length; k++) if (moves[k] > te) return true;
        return false;
      };
      var api = {
        group: function (name, entry) {
          try {
            var n = String(name == null ? '' : name); if (isHero(n, hero)) return '';
            if (Object.prototype.hasOwnProperty.call(memo, n)) return memo[n];
            var fs = formsOf(n), r = '', oth = D1 ? othersOf(n) : null;
            if (fs.length) {
              if (abs[n]) { r = 'c'; ST.cp1c++; }
              else {
                r = 'b';
                var endAfter = false;   /* ★d4: より新しいターンに通話の終わりがあった */
                var endIn = function (j) { return END3.test(maskQ(String((turns[j] && turns[j].narrative) || ''))); };
                for (var i = L - 1; i >= 0; i--) {
                  var inf = {}, ev = evidenceOf(turns[i], fs, n, D1, oth, D3, inf, D4); if (!ev) { if (D4 && endIn(i)) endAfter = true; continue; }
                  if (D4 && ev === 'present' && inf.logOnly) {   /* ★d4: 会話ログ（声）だけの台詞 → 6 ターン以内の通話の始まり・終わりをさかのぼって見る */
                    var cr = '';
                    for (var j = i - 1; j >= 0 && j >= i - 200; j--) {   /* ★d4b: 最後の通話の始まりまで（GPT #127-OQ）。体の登場・退場・通話の終わりで止まる */
                      var inj = {}, ej = evidenceOf(turns[j], fs, n, D1, oth, D3, inj, D4), ej_end = endIn(j);
                      if (ej === 'remote') { cr = ej_end ? 'ended' : 'remote'; if (!ej_end) inf.cue = inj.cue; break; }
                      if (ej && !(ej === 'present' && inj.logOnly)) break;   /* 体の登場・退場などがあれば通話の続きではない */
                      if (ej_end) { cr = 'ended'; break; }
                    }
                    if (cr === 'remote') { ev = 'remote'; ST.d4Call++; }
                    else if (cr === 'ended') { r = 'b'; ST.d4After++; break; }   /* 切れた後、体の登場なしに話している → 確かめられない（一行なし） */
                  }
                  if (ev === 'remote') {   /* ★d3: 最新ターンで続いている通話なら声だけの参加、切れていれば (c) */
                    r = 'b'; var nr = maskQ(String(turns[i].narrative || ''));
                    if ((i === L - 1 && END3.test(nr)) || (D4 && (END3.test(nr) || endAfter))) { r = 'c'; ST.d3Ended++; }   /* ★d4: 切れたのが前のターンでも (c) */
                    else if (i === L - 1 && !REC3.test(inf.cue)) rmemo[n] = RADIO3.test(inf.cue) ? '無線' : SCREEN3.test(inf.cue) ? '画面' : '電話';
                  }
                  else if (ev === 'strong') r = 'c'; else if (ev === 'weak') r = 'b';
                  else { r = moveAfter(i) ? 'b' : 'a'; tmemo[n] = i; }   /* 時間では下げない（GPT #127-OG）。★d2: 「いる」の証拠のターン */
                  break;
                }
              }
              ST[r]++;
            }
            memo[n] = r; return r;
          } catch (e2) { ST.errors++; return ''; }
        },
        orphan: function (name, entry) {
          try {
            var n = String(name == null ? '' : name); if (isHero(n, hero)) return false;
            var fs = formsOf(n), e = entry || realStore()[n], tn = e && typeof e.turn === 'number' ? e.turn : -1, r = false, key = n + '\u0000' + tn;
            if (Object.prototype.hasOwnProperty.call(omemo, key)) return omemo[key];
            if (fs.length && tn >= 0 && tn < L && Math.floor(tn) === tn) r = hit(planProse(turns[tn]), fs) && !hit(canonText(turns[tn]), fs);
            if (r) ST.orphanVals++;
            omemo[key] = r; return r;
          } catch (e3) { ST.errors++; return false; }
        },
        out: function (name, entry) { var g = this.group(name, entry); return g === 'b' || g === 'c'; },
        /* ★d3: (b) のうち、最新ターンで通話が続いている人の一行（無ければ ''） */
        note: function (name, entry) { var n = String(name == null ? '' : name); if (this.group(name, entry) !== 'b' || !Object.prototype.hasOwnProperty.call(rmemo, n)) return ''; ST.d3Note++; return rmemo[n] + 'の向こうにいる。この場にはいない。声だけで会話に加われる'; },
        /* ★d2: (a) だが、最後の「いる」の証拠より新しいターンで書かれた値の描写が ✎ で消えた（orphan と同じ合図） */
        edited: function (name, entry) {
          try {
            var n = String(name == null ? '' : name); if (this.group(name, entry) !== 'a' || !Object.prototype.hasOwnProperty.call(tmemo, n)) return false;
            var e = entry || realStore()[n], tn = e && typeof e.turn === 'number' ? e.turn : -1;
            return tmemo[n] < tn && this.orphan(n, e);
          } catch (e4) { ST.errors++; return false; }
        }
      };
      return api;
    } catch (e) { ST.errors++; return null; }
  }
  /* キャラ一覧用: ✎ で消えた描写の値だけ隠す */
  function orphan(name, entry) { var g = gate(); var r = !!(g && g.orphan(name, entry)); if (r) ST.rosterHidden++; return r; }
  /* fix333 前面化・背景用（呼ぶ側が CP1 の結果を先に渡す）。外す人がいなければ null。名前を足さない（states の鍵の部分集合だけを返す） */
  function fgRestrict(states, text) {
    var g = gate(); if (!g || !states || typeof states !== 'object') return null;
    try {
      ST.fgCalls++;
      var rs = realStore(), out = {}, ex = 0, D2 = d2();
      Object.keys(states).forEach(function (k) { if (g.out(k, rs[k])) ex++; else if (D2 && g.edited(k, rs[k])) { ex++; ST.d2Excluded++; } else out[k] = states[k]; });   /* ★d2 */
      if (!ex) return null;
      ST.fgFiltered++; ST.fgExcluded += ex; return out;
    } catch (e) { ST.errors++; return null; }
  }

  G.__v292DfixNPRES = {
    VER: VER, on: on, gate: gate, orphan: orphan, fgRestrict: fgRestrict, note: NOTE,
    status: function () { var o = {}; for (var k in ST) o[k] = ST[k]; o.ver = VER; o.loadOn = LOAD_ON; o.on = on(); o.devOptInIgnored = optIn(); try { var A = G.__v292DfixADMF1; o.admf = (A && typeof A.decide === 'function') ? A.decide('npres1') : null; } catch (e) { o.admf = null; } return o; },
    _classify: classify, _forms: rawForms
  };
  try { console.log('[v292DfixNPRES] loaded r-d4b admf2 (on=' + (on() ? '1' : '0') + ')'); } catch (e) {}
})();
