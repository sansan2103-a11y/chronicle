/* =====================================================================
 * v292DfixEXP1-experience.js — 経験の忘れの直し E1（GPT #127-WR 裁定 5・2026-11-22・LOCAL・出荷しない・既定 OFF）
 * ---------------------------------------------------------------------
 * ■やること（今の長期記憶の入れ物の中だけ。新しい保存の鍵・台帳は作らない）
 *   (1) fix135（長期記憶の作り直し）の要約 AI への指示に、worldinfo の人物の欄の 1 項目 "exp" を足す。
 *       exp = [{ "k": 段階, "s": 何を（短い句）, "t": そのターン番号 }]。段階は 4 つだけ:
 *         taught = 教わった・見せてもらった（できるようになったかは本文に無い）
 *         first  = 初めてやって、できた（1 回）
 *         learned= 本文が「できるようになった」「身についた」と書いている
 *         failed = 特定の状況でできなかった
 *   (2) 返ってきた exp を型で検査する（段階が 4 つのどれか・句は 2〜24 字・ターンは今回の NEW TURNS の範囲・
 *       句の 3 字の並びのどれかが NEW TURNS の本文に実在・人物の項目だけ・learned は本文に「ようになった／身についた／覚えた」等があるときだけ）。通らないものは捨てる（数える）。
 *   (3) 前の版の exp を同じ人物の項目へ引き継ぐ。同じ句（空白・記号を除いて同じ／片方が片方を含む）は重ねず、段階とターンだけ新しい方。
 *       1 人 3 件まで。満杯のとき新しい句は足さない（古い件を押し出さない・数える）。人物の項目が消えたら前の項目を戻す（40 件の内側で）。
 *       保存は今の worldinfo の鍵（chr6_v292Dfix136_wi_<slot>）の中だけ。
 *   (4) MEM2 腕 A の覚え書き（memoryNotes）の最後に「経験と習得（本文で確かめた範囲）」の節を置く。1 人 2 件まで・全体 160 字まで。
 *       その分だけ、あらすじ・人物・出来事の枠を先に小さくする（覚え書き全体の 800 字は変えない）。
 * ■効く条件: 鍵 v292DfixEXP1aOn='1' かつ kill v292DfixEXP1Off が無い かつ MEM2 腕 A が ON（＝長期記憶が渡る人）かつ VAULTGATE2 の認可。
 *   VAULTGATE2: hidden(id) === false（隠していないと分かっている）か openWhy(id) === ''（隠した物語・いま解錠中で開いてよい）のときだけ。
 *   それ以外（施錠中・分からない・部品が無い）は何もしない（fail-closed・理由を数える）。
 * ■OFF・kill・条件外: 指示の文字列も、保存も、覚え書きも土台と 1 字も変えない。sys の文・AI への禁止文は足さない。
 * ■診断（読むだけ）: window.__v292DfixEXP1.stats()
 * ===================================================================== */
(function (root) {
  'use strict';
  if (!root || root.__v292DfixEXP1) return;
  var VER = 'exp1-20261126-r17';
  var KINDS = { taught: '教わった（習得は不明）', first: '初めてできた', learned: '身についた', failed: 'できなかった' };
  var PER = 3, NOTE_PER = 2, NOTE_MAX = 160, S_MIN = 2, S_MAX = 24;
  var ST = { on: 0, offWhy: {}, asked: 0, got: 0, kept: 0, rej: {}, dup: 0, upd: 0, swapped: 0, full: 0, restored: 0, notes: 0, noteChars: 0, emptyNonChar: 0, routed: 0, tFixed: {}, selfFirst: 0, pron: 0, inputTaught: 0, taughtTo: 0, a2: 0, a2Down: 0, a2Rej: {}, older: 0, olderRej: {} };   /* ★r7: older（範囲より前のターンの件を、そのターンの本文で確かめて通した） */   /* ★r6: a2（案 A2 の緩い検査で通した）・a2Down（learned を first に下げた）・a2Rej（案 A2 でも捨てた理由） */   /* ★r5: pron（代名詞・省略の主語をその人と見て通した）・inputTaught（入力の行の「A は B に…教える」で B の taught）・taughtTo（教えた側に付いた taught を教わった側へ回した） */   /* ★r4: emptyNonChar（人物でない項目の空の exp・捨てたのではない）・routed（人物でない項目の exp を主語の人物へ回した）・tFixed（ターン番号を直した形）・selfFirst（本人の「できた」で first） */
  function cnt(o, k) { o[k] = (o[k] || 0) + 1; }
  /* ★r10（2026-11-24・GPT #127-XF・既定 OFF・鍵 v292DfixEXP1r10On・kill v292DfixEXP1r10Off）:
     (1) taught の句だけ 40 字まで（「律からフィルムの入れ方を教わった」＝誰から・何を、が 24 字に入らず全部 LONG で落ちていた）
     (2) 入力の行ではその人がやったことになっているのに、地の文では別の登録人物がやっている → 覚えない（A2_ACTOR_CONFLICT）
     (3) 覚え書きの節を、起きた順の 1 行 1 件「T3｜紬：律から…を教わった（習得は不明）」にする（節の上限 200 字） */
  function r10On() { return lsg('v292DfixEXP1r10Off') !== '1'; }   /* 20261124-exp1r11on: 全員 既定 ON（長期記憶が ON の人）。実 AI 2 本で 24 字を超える taught が 2 件残り、誤って別の人に付いた経験 0 */
  function sMax(x) { return (x && x.k === 'taught' && r10On()) ? 40 : S_MAX; }
  function lsg(k) { try { return root.localStorage.getItem(k); } catch (e) { return undefined; } }
  function sid() { try { var f = root.__v292Dfix697; var id = f && f.status ? f.status().storyId : null; return id ? String(id) : null; } catch (e) { return null; } }
  function vaultOk() {
    var id = sid(); if (!id) return 'ID_UNKNOWN';
    var G = root.__v292DfixVAULTGATE2; if (!G || typeof G.hidden !== 'function') return 'NO_VAULTGATE2';
    try { if (G.hidden(id) === false) return ''; if (typeof G.openWhy === 'function' && G.openWhy(id) === '') return '';
      var wv = 'VAULT_' + String((typeof G.openWhy === 'function' && G.openWhy(id)) || 'HIDDEN').slice(0, 24);
      /* ★EXP1 r9（2026-11-24・既定 OFF・r8 と同じ鍵 v292DfixEXP1PendOn・kill v292DfixEXP1PendOff）: 頼む側も同じ穴だった（実機: 要約の依頼を組む時点で Vault の答えが古いと、経験を頼まないまま要約だけ送られた）。
         要約の送信そのものは長期記憶の側の関門（VAULTSEND1・MEM3）が決めていて、EXP1 が足すのはその依頼の中の 1 項目だけ＝外へ出る本文は増えない。
         答えが古いだけ（V2_PENDING・V2_CG_STALE・V2_INCOMPLETE）のときは働く。隠してある・施錠中と分かったときは今までどおり働かない。 */
      if (/^VAULT_V2_(?:PENDING|CG_STALE|INCOMPLETE)$/.test(wv) && lsg('v292DfixEXP1PendOff') !== '1'   /* 20261124: 全員 既定 ON（長期記憶が ON の人）。実機で頼む側の枝が 1 回通り 1 件採用・害なし */) { cnt(ST.rej, 'PEND_ASK_LIVE'); return ''; }
      return wv; } catch (e) { return 'VAULT_THREW'; }
  }
  /* why: '' = 働く／それ以外 = 働かない理由 */
  function why() {
    var k = lsg('v292DfixEXP1Off'); if (k === undefined) return 'STORAGE'; if (k === '1') return 'KILLED';
    /* ★r2: 長期記憶（MEM2 腕 A）が ON の人には既定 ON。鍵 v292DfixEXP1aOn は要らない（残っていても害はない）。kill v292DfixEXP1Off が常に勝つ */
    try { var M = root.__v292DfixMEM2; if (!M || typeof M.aOn !== 'function' || M.aOn() !== true) return 'MEM2A_OFF'; } catch (e) { return 'MEM2A_OFF'; }
    return vaultOk();
  }
  function on() { var w = why(); if (w) { cnt(ST.offWhy, w); return false; } ST.on++; return true; }
  function norm(s) { return String(s == null ? '' : s).replace(/[\s　、。，．,.「」『』（）()［］\[\]【】・…‥！？!?：:；;"'“”‘’]+/g, ''); }
  function cleanS(s) { s = String(s == null ? '' : s).replace(/[<>\[\]【】{}]/g, '').replace(/[\r\n\t]+/g, ' ').trim(); return s; }
  /* ---- (1) 指示の文字列 ---- */
  var WI_OLD = '"desc": "1 sentence Japanese: who/what" }';
  /* ★r4（実 AI 2 本で kept 0: 人物でない項目に exp・ターン番号の範囲外）: 書く場所と形を、形式の説明としてはっきりさせる（禁止文は足さない） */
  var WI_NEW = '"desc": "1 sentence Japanese: who/what", "exp": [ { "k": "taught|first|learned|failed", "s": "Japanese, 24 chars max: what this character was taught, did for the first time, can now do, or failed at", "t": N of the [Turn N] marker } ] }';
  var EXP_RULE = ' Format of "exp": it is a field of a character entry (type "character") and lists that character\'s own experiences, so place/object/concept entries have no "exp" field and a character with nothing to record has "exp": []. "t" is the number N written in the [Turn N] marker of the turn where it happens (a plain number). k: taught when the text only shows the character being taught or shown, first when the character did it once successfully for the first time (for example the character succeeds and says できた), learned only when the text says the character can now do it, failed when the character could not do it in a situation. Record only what the NEW TURNS text shows; k is never higher than what the text says, and never infer an ability the text does not show.';
  function prompt(p) {
    if (typeof p !== 'string' || !on()) return p;
    if (p.split(WI_OLD).length !== 2) { cnt(ST.rej, 'PROMPT_MISMATCH'); return p; }
    var q = p.split(WI_OLD).join(r10On() ? WI_NEW.replace('"s": "Japanese, 24 chars max: ', '"s": "Japanese, 24 chars max (for taught: 40 chars max, written as from whom and what, like 「律からフィルムの入れ方を教わった」; name the teacher only when the text names them): ') : WI_NEW);
    var ri = q.lastIndexOf('Use turnIdx values from the [Turn N] markers above.');
    if (ri < 0) { cnt(ST.rej, 'PROMPT_MISMATCH'); return p; }
    ri += 'Use turnIdx values from the [Turn N] markers above.'.length;
    q = q.slice(0, ri) + EXP_RULE + q.slice(ri);
    ST.asked++; lastAsked = true; return q;
  }
  /* KNOWN WORLD INFO の 1 行に、前の版の exp を見せる（同じことを重ねて返さないように） */
  function wiLine(w, base) {
    if (!w || !Array.isArray(w.exp) || !w.exp.length || !on()) return base;
    return base + ' [exp: ' + w.exp.map(function (x) { return x.k + ':' + x.s; }).join(' / ') + ']';
  }
  /* ---- (2)(3) 型の検査と引き継ぎ ---- */
  /* ---- (2) 型の検査（★r2: その人が主語の文と、その句の文に結び付ける） ----
     文に分け、「その人＋は／が／も」で始まる節（その人が主語）を探す。句の根拠は、その文か直前の 1 文に、句の 3 字の並びの半分以上があること。
     段階ごとに、主語の文そのものに次が要る（どれも、その人が主語の文の中だけで見る。本文のどこかにあるだけでは足りない）:
       learned: 習得を言い切る語（ようになった・身につけた・覚えた・習得した・ものにした）があり、打ち消し・噂・見せた の語が無い
       first  : 初めて・できた・成功・うまくいった（または learned の語）があり、打ち消し・噂・見せた の語が無い
       failed : 打ち消し（できなかった・うまくいかなかった・しくじ・失敗）がある
       taught : その人が主語で 教わった・習った・教えてもらった・見せてもらった、または「（誰か）は その人 に …教えた／見せた」の文
     噂・伝聞（噂・らしい・そうだ・と聞いた・と言っていた）の文は、どの段階の根拠にもしない。
     ★r3（レビュー 18 例）: 迷ったら覚えない側（捏造より忘れる方が害が小さい）。
       ・「」『』の中は根拠にしない（台詞の中の別人・言っただけ）。本文から中身を外してから文に分ける
       ・文のどこかに 打ち消しの文末（ていない・とは言えない・わけではない 等）・伝聞と推量（という・みたい・ようだ・だろう・かもしれない・はず 等）・
         問い（だろうか・のか）・願望（たい・たらいい・ほしい・願う）・夢・もし・約束／つもり／予定 がある文は、どの段階の根拠にもしない（HEDGE）
       ・その人の後ろに、読点の無い「名詞＋が／は」が来たら、そこから別の主語（「灯里は湊が…」「灯里が教えた湊は…」）。「湊がいなくても」だけは飛ばす
       ・「灯里と湊は」の並列はその人の主語とみる
       ・failed は動詞の形（しくじった・失敗した・できなかった・うまくいかなかった）だけ（「失敗を恐れず」は数えない）
       ・taught の「（誰か）は その人 に …教えた」は過去の形だけ（「教えると約束した」は数えない） */
  var LEARN_RE = /ようになっ|身につけ|身に付け|身についた|身に付いた|覚えた|習得し|ものにし/;
  var FIRST_RE = /初めて|できた|成功|うまくいった|上手くいった/;
  var NEG_RE = /できなかっ|できず|うまくいかなかっ|上手くいかなかっ|しくじ|失敗/;
  var FAIL_RE = /できなかっ|できず(に|、|。|じまい|終)|うまくいかなかっ|上手くいかなかっ|うまくいかず|しくじっ|しくじり|失敗し(た|て|ちゃ)|失敗だっ|失敗に終わ/;   /* ★r3: failed は動詞の形だけ */
  var HEDGE_RE = /ていない|てない|ていなかっ|ていません|とは言えな|とは言い切れな|とは限らな|わけではな|わけじゃな|ではなかっ|じゃなかっ|という|みたい|ようだ|ようで|ような気|らしく|だろう|でしょう|かもしれ|かも。|に違いな|はず(だ|で|が|。)|かどうか|のか([。？?、]|$)|かな([。？?]|$)|かしら|たい(と|な|。|気|思|$)|たら(いい|いいな|よかっ)|ればいい|といいな|ほしい|欲しい|願|祈|夢|もし|仮に|想像|約束|つもり|予定|しよう|ましょう|気がし/;   /* ★r3: 言い切っていない文（打ち消しの文末・伝聞と推量・問い・願望・夢・約束） */
  var TAUGHT_PAST_RE = /教え(た|てくれた|てあげた|てやった|ていた)|見せ(た|てくれた)|手ほどきし(た|てくれた)/;   /* ★r3: 過去の形だけ */
  var NOT_SUBJ_NOUN = /^(今日|今|今度|今回|最後|最初|結局|本当|実際|次|初|一人|独り|他|誰か|手元|手先|背|糊)$/;
  var RUMOR_RE = /噂|らしい|そうだ|と聞い|と言ってい|と言った|だって/;
  var SHOW_RE = /見せ(た|る|て|ては)/;
  var TAUGHT_SUBJ_RE = /教わ|習っ|習い|教えてもら|見せてもら|手ほどきを受け/;
  var TAUGHT_OBJ_RE = /教え(た|る|て)|見せ(た|る|て)|手ほどきし/;
  function esc(x) { return String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  /* ★EXP1 r11（2026-11-24・既定 OFF・鍵 v292DfixEXP1NameOn・kill v292DfixEXP1NameOff）: 要約 AI は人物の項目名を「渡瀬紬」と空白なしで返す（実機 4 本の診断で全件）。
     登録名は「渡瀬 紬」。空白なしの 3 字の名前からは「瀬紬」しか作れず、本文の「紬は…」に当たらないので、紬の経験が NOT_SUBJECT・NOT_TAUGHT・NOT_IN_TEXT で全部落ちていた。
     登録名（主人公と登場人物）と、空白・中黒を除いて同じ項目名は、登録名の形（名字・名前）でも本文を探す。一致する登録名がちょうど 1 つのときだけ。 */
  var CANON = {}, REGN = [];
  function nameOn() { return lsg('v292DfixEXP1NameOff') !== '1'; }   /* 20261124-exp1r11on: 全員 既定 ON。実機の診断に残った要約 AI の返事の当て直しで 残り 0 件 → 2〜3 件（全部正しい）。実機 2 本は AI が空白ありで返したので この枝は未通過（害なし） */
  function strip(n) { return String(n || '').replace(/[\s　・]+/g, ''); }
  function setCanon(ctx) {
    CANON = {}; REGN = [];
    try { if (ctx) { if (ctx.hero) REGN.push(String(ctx.hero)); if (ctx.gender && typeof ctx.gender === 'object') Object.keys(ctx.gender).forEach(function (k) { if (k && REGN.indexOf(k) < 0) REGN.push(k); }); } } catch (eRg) {}
    if (!nameOn() || !ctx) return;
    var reg = []; if (ctx.hero) reg.push(String(ctx.hero)); if (ctx.gender && typeof ctx.gender === 'object') Object.keys(ctx.gender).forEach(function (k) { if (k && reg.indexOf(k) < 0) reg.push(k); });
    var seen = {}; reg.forEach(function (r) { var k = strip(r); if (!k) return; seen[k] = (seen[k] || 0) + 1; if (strip(r) !== r) CANON[k] = r; });
    Object.keys(CANON).forEach(function (k) { if (seen[k] !== 1) delete CANON[k]; });
  }
  function forms(name) { var n0 = String(name || '').trim(), c0 = CANON[n0];
    if (c0 && c0 !== n0) { var o0 = forms0(c0); if (o0.indexOf(n0) < 0) o0.unshift(n0); cnt(ST, 'nameCanon'); return o0; }
    return forms0(name); }
  function forms0(name) { var n = String(name || '').trim(), out = []; if (!n) return out; out.push(n);
    try { var ns = n.replace(/[\s　・]+/g, ''); if (ns !== n && ns.length >= 2 && localStorage.getItem('v292DfixNAME1CHOff') !== '1') out.push(ns); } catch (eNs) {}   /* ★NAME1CH r2: AI は「瀬名 律」を「瀬名律」と続けて書くことがある（実機で NOT_SUBJECT・NOT_IN_TEXT） */
    var n1 = false; try { n1 = localStorage.getItem('v292DfixNAME1CHOff') !== '1'; } catch (eN1) {}   /* ★NAME1CH: 「渡瀬 紬」の「紬」。subjRe は直前が区切り・直後が助詞のときだけ当てる */
    var all2 = n.split(/[\s　・]+/).filter(Boolean), parts = all2.filter(function (x) { return x.length >= 2 || (n1 && all2.length === 2 && /^[一-鿿々ぁ-んァ-ヶー]$/.test(x)); }); if (all2.length > 1 && parts.length) out = out.concat(parts.filter(function (x) { return out.indexOf(x) < 0; }));
    else if (/^[一-鿿々]{4}$/.test(n)) { out.push(n.slice(0, 2)); out.push(n.slice(2)); } else if (/^[一-鿿々]{3}$/.test(n)) out.push(n.slice(1));
    return out; }
  function sentences(text) { return String(text || '').replace(/<[^>]*>/g, '\n').split(/(?<=[。！？!?\n])/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function grams(s) { var t = norm(s), out = []; for (var i = 0; i + 3 <= t.length; i++) out.push(t.slice(i, i + 3)); return out; }
  function phraseIn(s, txt) { var g = grams(s), tx = norm(txt), hit = 0; if (!g.length) return false; for (var i = 0; i < g.length; i++) if (tx.indexOf(g[i]) >= 0) hit++; return hit >= Math.max(1, Math.ceil(g.length / 2)); }
  function subjRe(who) { var f = forms(who); if (!f.length) return null; return new RegExp('(^|[、，,\\s　「（(])(' + f.map(esc).join('|') + ')(さん|ちゃん|くん|君)?(は|が|も|と[^、，,。]{1,8}?(?:さん|ちゃん|くん|君)?(?:は|が))'); }   /* ★r3: 「灯里と湊は」の並列も主語 */
  function recipRe(who) { var f = forms(who); if (!f.length) return null; return new RegExp('(' + f.map(esc).join('|') + ')(さん|ちゃん|くん|君)?(に|の手|を)'); }   /* 教わる側（「X に教えた」「X の手を取り…教えた」「X を…手ほどきした」） */
  /* その人が主語になる節だけを取り出す（文の中で別の人が主語になった所から後ろは外す） */
  function ownClause(sent, who) { var re = subjRe(who); if (!re) return null; var m = re.exec(sent); if (!m) return null;
    var rest = sent.slice(m.index + m[0].length);
    var other = /[、，,]\s*[^、，,。]{1,8}?(は|が)(?!ら)/.exec(rest); if (other && !new RegExp('^[、，,]\\s*(' + forms(who).map(esc).join('|') + ')').test(other[0])) rest = rest.slice(0, other.index);
    /* ★r3: 読点の無い「名詞（漢字・カタカナ）＋が／は」も別の主語の始まり。「X がいなくても」だけは飛ばして続ける */
    var re2 = /([一-鿿々ァ-ヶー]{1,6})(さん|ちゃん|くん|君)?(が|は)/g, m2, cut = -1;
    while ((m2 = re2.exec(rest))) { if (NOT_SUBJ_NOUN.test(m2[1])) continue; if (/^(い|居)?なくても/.test(rest.slice(m2.index + m2[0].length))) { re2.lastIndex = m2.index + m2[0].length; continue; } cut = m2.index; break; }
    if (cut >= 0) rest = rest.slice(0, cut);
    return rest; }
  function unquote(t) { return String(t || '').replace(/「[^「」]*」/g, '「」').replace(/『[^『』]*』/g, '『』'); }
  function checkItem(x, ctx, who) {
    if (!x || typeof x !== 'object') return 'NOT_OBJ';
    if (!Object.prototype.hasOwnProperty.call(KINDS, x.k)) return 'BAD_K';
    var s = cleanS(x.s); if (s.length < S_MIN) return 'SHORT'; if (s.length > sMax(x)) return 'LONG';
    var t = +x.t; if (!(t >= ctx.from && t <= ctx.to) || Math.floor(t) !== t) return 'BAD_T';
    if (typeof who !== 'string' || !who) return 'NO_WHO';
    var ss = sentences(unquote(String(ctx.text || '').replace(/<[^>]*>/g, '\n'))), found = false, why = 'NOT_IN_TEXT', rr = recipRe(who);   /* ★r3: 「」の中は根拠にしない */
    for (var i = 0; i < ss.length; i++) {
      var here = ss[i], prev = i > 0 ? ss[i - 1] : '';
      if (!phraseIn(s, here) && !phraseIn(s, prev + here)) continue;
      found = true; if (RUMOR_RE.test(here)) { if (why === 'NOT_IN_TEXT') why = 'RUMOR'; continue; }
      if (HEDGE_RE.test(here)) { if (why === 'NOT_IN_TEXT') why = 'HEDGED'; continue; }   /* ★r3 */
      var own = ownClause(here, who);
      if (x.k === 'taught') { if ((own != null && TAUGHT_SUBJ_RE.test(own)) || (rr && rr.test(here) && TAUGHT_OBJ_RE.test(here) && TAUGHT_PAST_RE.test(here) && own == null)) return { k: x.k, s: s, t: t }; if (why === 'NOT_IN_TEXT') why = 'NOT_TAUGHT'; continue; }
      if (own == null) { if (why === 'NOT_IN_TEXT') why = 'NOT_SUBJECT'; continue; }
      if (x.k === 'failed') { if (FAIL_RE.test(own)) return { k: x.k, s: s, t: t }; if (why === 'NOT_IN_TEXT') why = 'NOT_FAILED'; continue; }
      /* 習得・成功の語は、打ち消し・見せた の語と同じ区切り（読点まで）に無いことを見る（「三度しくじったあと、…できるようになった」は通す） */
      var segs = own.split(/[、，,]/), okL = false, okF = false, neg = false, shown = false;
      segs.forEach(function (g) { var n = NEG_RE.test(g), sh = SHOW_RE.test(g); if (n) neg = true; if (sh) shown = true; if (!n && !sh) { if (LEARN_RE.test(g)) { okL = true; okF = true; } if (FIRST_RE.test(g)) okF = true; } });
      if (x.k === 'learned') { if (okL) return { k: x.k, s: s, t: t }; if (why === 'NOT_IN_TEXT') why = neg ? 'NEGATED' : (shown ? 'SHOWN_ONLY' : 'LEARNED_NOT_SAID'); continue; }
      if (x.k === 'first') { if (okF) return { k: x.k, s: s, t: t }; if (why === 'NOT_IN_TEXT') why = neg ? 'NEGATED' : (shown ? 'SHOWN_ONLY' : 'FIRST_NOT_SAID'); continue; }
    }
    /* ★r16（2026-11-26・実 AI 観察用_1126 T8/T12 の実測: 入力「律は…紬にフィルムの入れ方（…）を実演しながら教える」に対し本文は手順を見せる描写だけで「教えた」と書かない
       → taught が NOT_TAUGHT／NOT_IN_TEXT で全部落ち、T26「誰に教わった」が 2 問とも誤答）。既定 OFF: localStorage v292DfixEXP1InputTeachOn='1'・kill v292DfixEXP1InputTeachOff='1'。
       taught に限り、その回の「入力」の文（「」の外）が「who に … 教える／教えた」で終わり、who が主語でなく、題材が入力の文と本文の両方にあり、本文に断りの語が無いとき採る。 */
    if (x.k === 'taught' && r16On() && ctx && typeof ctx.pt === 'string' && typeof ctx.nr === 'string' && ctx.pt && ctx.nr && rr) {
      try {
        var c16 = norm(typeof core15 === 'function' ? core15(s) : s), g16 = []; for (var q = 0; q + 3 <= c16.length; q++) g16.push(c16.slice(q, q + 3));
        var nr16 = norm(ctx.nr), nrU = unquote(String(ctx.nr));
        if (g16.length && !R16_HARD.test(nrU) && g16.some(function (z) { return nr16.indexOf(z) >= 0; }) && r16Shown(ctx.pt, nrU, who, g16)) {   /* r17: SOFT の語は r16Shown が成り立てば無視 */
          var ip = sentences(unquote(String(ctx.pt).replace(/<[^>]*>/g, '\n')));
          for (var j16 = 0; j16 < ip.length; j16++) { var h16 = ip[j16];
            if (HEDGE_RE.test(h16) || RUMOR_RE.test(h16)) continue;
            if (!R16_END.test(h16.replace(/[\s　。！？!?]+$/, ''))) continue;
            if (!rr.test(h16) || ownClause(h16, who) != null) continue;
            var hn = norm(h16), hit16 = 0; g16.forEach(function (z) { if (hn.indexOf(z) >= 0) hit16++; });
            var c16n = 0; g16.forEach(function (z) { if (/[一-鿿々ァ-ヶ]/.test(z) && hn.indexOf(z) >= 0) c16n++; });
            if (hit16 < Math.max(1, Math.ceil(g16.length / 2)) && c16n < 2) continue;   /* r16d: 要約 AI の言い換え（入力「レンズの拭き方」・句「レンズの手入れ」）は、漢字かカタカナを含む 3 字の一致 2 つ以上で同じ題材とみる */
            if (attemptOnly(ctx.pt, g16)) continue;
            cnt(ST, 'inputTeach'); return { k: x.k, s: s, t: t };
          }
        }
      } catch (e16) {}
    }
    return found ? why : 'NOT_IN_TEXT';
  }
  /* ---- ★r4: ターン番号の数え方のずれと、本人の「できた」 ----
     ctx.parts（fix135 が渡す・ターンごとの { i, pt, nr, says }）があるときだけ使う。無いとき（前の呼び方）は r3 と同じ。
     ・t は数か、数の文字列か「T3」「Turn 3」の形を読む。
     ・各ターンの本文だけで r3 の検査（checkItem）を通す。通ったターンの中から、t（そのまま）→ t−1（1 始まり）→ from＋t → from＋t−1（送った範囲の相対）の順に合うものを選ぶ。
       どれにも合わなければ、通ったターンが 1 つだけのときそのターンに直す。2 つ以上なら決められないので捨てる（T_AMBIG）。どのターンも通らなければ、r3 の検査の理由で捨てる。
     ・first だけ、本人の台詞で決める道を足す（selfFirst）: そのターンの会話のタグがその人で、台詞の頭（最初の … 。？ 、 までの部分）が できた・うまくいった・成功 で、
       打ち消し・言い切らない語（HEDGE）が無く、本文でその台詞の直前か直後の文がその人を主語にしていて、句がそのターンの本文（入力か地の文）にある。 */
  function parseT(t) { if (typeof t === 'number') return Math.floor(t) === t ? t : NaN; var m = /^\s*(?:T|Turn\s*)?(\d{1,4})\s*$/i.exec(String(t == null ? '' : t)); return m ? +m[1] : NaN; }
  function r16On() { return lsg('v292DfixEXP1InputTeachOff') !== '1'; }   /* 20261126-exp1r16on: GPT #127-XV の条件（本文で実際に教わった・試みだけは採らない）を入れ、実 AI 3 本（R16・R16c・R16d）で誤った記憶 0・フィルム＝律／レンズ＝店主が残る → 既定 ON */
  var R16_END = /(教える|教えてあげる|教えてやる|教えてみせる|手ほどきする|手ほどきをする|教えた|教えてあげた|教えてやった|手ほどきした)$/;
  /* r17（2026-11-26・実 AI 観察用_1126b の実測）: T8 = 本文に「紬は首を横に振った」（「入れたことある？」への返事）があるだけで断り扱いになり、実演＋紬が身を乗り出して見ている回が落ちた。
     T18 = 最後まで教わった直後に電話が鳴った回が、中断扱いで落ちた（GPT #127-XW の観察対象）。
     → はっきり「教えなかった」と書く語（HARD）だけを無条件の不採用にし、電話・遮る・首を横に振る等（SOFT）は、実演と教わる人の反応（r16Shown）が本文に無いときだけ不採用にする。
     入力が「教えようとした」だけの回は、今までどおり不採用（attemptOnly）。 */
  var R16_HARD = /教え(なかっ|られな|ようとしな|ずに|るのをやめ|る気はな|る暇|そびれ|損ね)/;
  var R16_REFUSE = /教え(なかっ|られな|ようとしな|ずに|るのをやめ|る気はな|る暇|そびれ|損ね)|断っ|断られ|拒ん|首を横に振|中断|携帯が(震|鳴)|スマホが(震|鳴)|着信|電話に出|遮っ|遮られ|席を外|その場を離れ|立ち去っ|出て行っ|出ていっ|電話が鳴|呼び出され|後にし|あとにし|また今度|やめておく|やめた/;
  /* r16d（実 AI 試験_R16c T8 の実データ: 入力「律は紬に、露出の合わせ方を教えようとカメラを構えるが、そのとき携帯が鳴り…席を外す」。要約が「教わった」を返せば a2 の道が採る）:
     入力の文（「」の外）で、題材の語がある文に「教えよう（と）・教えかけ・教えるつもり・教える前に」があれば、試みただけ。taught はどの道でも採らない（本文の地の文に過去形の「教えた／教わった」がある場合の r3 の道は別）。 */
  var R16_TRY = /教えよう|教えかけ|教えるつもり|教える前に|教えるはず|教えたかっ|教えそびれ/;
  function g3of(s) { var c = norm(typeof core15 === 'function' ? core15(cleanS(s)) : cleanS(s)), g = []; for (var q = 0; q + 3 <= c.length; q++) g.push(c.slice(q, q + 3)); return g; }
  function attemptOnly(pt, g) { try { if (!g || !g.length) return false; var ip = sentences(unquote(String(pt || ''))); for (var i = 0; i < ip.length; i++) { if (!R16_TRY.test(ip[i])) continue; var hn = norm(ip[i]), h = 0; g.forEach(function (z) { if (/[一-鿿々ァ-ヶ]/.test(z) && hn.indexOf(z) >= 0) h++; }); if (h >= 2) return true; } } catch (e) {} return false; }
  /* r16 v2（GPT #127-XV: 教える意図と、実際に教わったことを分ける）: 本文（「」の外）に (A) 実演・説明の語、または入力の文の手順の語が 4 つ以上あり、かつ (B) 教わる人が主語で、見る・聞く・試す動きがある */
  var R16_DEMO = /みせ|見せ|示し|示す|実演|手本|説明し|説明す|指し示|指で示|手を取っ|手を添え|やり方を|コツを|順に|ゆっくりと/;
  var R16_ATTEND = /覗き込|のぞき込|覗い|見つめ|見てい|見て、|見ながら|見守|目で追|目を追|目が.{0,10}追|視線.{0,12}(追|向|行き来|落と)|身を.{0,6}乗り出|耳を傾け|聞いてい|聞き入|頷|うなず|真似|まね|なぞ|やってみ|試し|受け取|手を伸ば|握っ|持ち直|差し込|回し|拭|結ん|押し|引い/;
  var R16_WATCH = /覗き込|のぞき込|見つめ|目で追|目を追|目が.{0,10}追|視線.{0,12}(追|行き来)|身を.{0,6}乗り出|耳を傾け|聞き入|頷きながら|うなずきながら|真似/;
  function r16Shown(pt, nrU, who, gCore) {
    try {
      var ss = sentences(nrU), nn = norm(nrU), A = false, B = false, sr = subjRe(who);
      for (var i = 0; i < ss.length && !A; i++) { if (!R16_DEMO.test(ss[i])) continue; var near = norm((i > 0 ? ss[i - 1] : '') + ss[i] + (i + 1 < ss.length ? ss[i + 1] : '')); if (gCore.some(function (z) { return near.indexOf(z) >= 0; })) A = true; }
      if (!A) { var up = unquote(String(pt)), rr0 = recipRe(who), m0 = rr0 ? rr0.exec(up) : null, ip = norm(m0 ? up.slice(m0.index + m0[0].length) : ''), seen = {}, hits = 0; for (var q = 0; q + 3 <= ip.length; q++) { var g = ip.slice(q, q + 3); if (seen[g]) continue; seen[g] = 1; if (gCore.indexOf(g) >= 0) continue; if (/^[ぁ-ん]+$/.test(g)) continue; if (nn.indexOf(g) >= 0) hits++; } if (hits >= 4) A = true; }
      if (!A || !sr) return false;
      for (var j = 0; j < ss.length && !B; j++) { var own = ownClause(ss[j], who); if (own != null && R16_ATTEND.test(own)) { B = true; break; }
        var mj = sr.exec(ss[j]); if (mj && R16_WATCH.test(ss[j].slice(mj.index + mj[0].length))) B = true; }   /* ownClause は「上がって」の「が」で切れることがある（実データ T8）ので、見る・聞くの語だけは文の残り全体で見る */
      return B;
    } catch (e) { return false; }
  }
  function partText(p) { return String((p && p.pt) || '') + '\n' + String((p && p.nr) || ''); }
  function selfFirst(x, p, who) {
    if (!p || !Array.isArray(p.says)) return false; var f = forms(who); if (!f.length) return false;
    var s = cleanS(x.s); if (!phraseIn(s, unquote(partText(p)))) return false;
    var said = p.says.some(function (c) { if (!c || f.indexOf(String(c.who || '')) < 0) return false; var head = String(c.say || '').replace(/^[\s…‥・、。]+/, '').split(/[…‥。？?！!、，,]/)[0];
      return /^(できた|でき(まし)?た|うまくいった|上手くいった|成功し(た|ました))$/.test(head) && !NEG_RE.test(head) && !HEDGE_RE.test(head); });
    if (!said) return false;
    var nr = String(p.nr || ''), re = /「([^「」]*)」/g, m;
    while ((m = re.exec(nr))) { var q = m[1].replace(/^[\s…‥・、。]+/, '').split(/[…‥。？?！!、，,]/)[0]; if (!/^(できた|でき(まし)?た|うまくいった|上手くいった|成功し(た|ました))$/.test(q)) continue;
      var before = unquote(nr.slice(0, m.index)).split(/(?<=[。！？!?\n])/).map(function (z) { return z.trim(); }).filter(Boolean).pop() || '';
      var after = (unquote(nr.slice(m.index + m[0].length)).split(/(?<=[。！？!?\n])/).map(function (z) { return z.trim(); }).filter(Boolean)[0]) || '';
      if ((ownClause(before, who) != null && !HEDGE_RE.test(before)) || (ownClause(after, who) != null && !HEDGE_RE.test(after))) return true; }
    return false; }
  /* ---- ★r5: 実 AI の本文の書き方（主語が「彼女は」・省略）でも、根拠を確かめる ----
     そのターンの地の文（「」の中は外す）を文ごとに見て、代名詞（彼女・彼）か省略の主語を、次のすべてがそろうときだけ「その人は」に置き換えた本文を作り、
     その本文で r3 の検査（打ち消し・伝聞・願望・他人が主語・段階の語）をそのまま通す（検査は緩めない）。
       ・その文より前で、最後に名前で主語になった登録の人物（主人公を含む）がその人（間に別の人物が名前で主語になっていない）
       ・代名詞の文: 代名詞の性（彼女＝女性・彼＝男性）が、登録の性（fix135 が渡す ctx.gender）と合う（性が分からなければ置き換えない）。そのうえで、
         すぐ前の文（台詞を除く）の主語がその人か、そのターンの地の文に名前の出る登録の人物が主人公を除いてその人だけで、主人公の性が代名詞と違う
       ・省略の文（人の主語も「名詞＋が／は」も無い文）: すぐ前の文（台詞を除く）の主語がその人（置き換えた後の主語を含む）
       ・その人が主人公なら置き換えない（主人公の習得を推しはからない）
     要約 AI がその人の欄に付けたことは、ここに来る前提（弱い根拠）で、それだけでは通さない。 */
  var PRON_RE = /^(彼女|彼)(は|が|も)/;
  function gOf(ctx, nm) { var g = ctx && ctx.gender ? String(ctx.gender[nm] || '') : ''; return /女/.test(g) ? 'F' : (/男/.test(g) ? 'M' : null); }
  function namedSubj(sent, names) { var best = null, at = -1; names.forEach(function (nm) { var re = subjRe(nm); if (!re) return; var g = new RegExp(re.source, 'g'), m; while ((m = g.exec(sent))) { if (m.index > at) { at = m.index; best = nm; } } }); return best; }
  function hasOtherSubj(sent) { if (PRON_RE.test(sent)) return true; var re2 = /([一-鿿々ァ-ヶー]{1,6})(さん|ちゃん|くん|君)?(が|は)/g, m; while ((m = re2.exec(sent))) { if (!/^(今日|今|今度|今回|最後|最初|結局|本当|実際|次)$/.test(m[1])) return true; } return false; }   /* 物の主語（糊が・指先が）も別の主語とみる（r3 の NOT_SUBJ_NOUN より狭い除外） */
  function resolveText(p, who, ctx) {
    var names = (ctx && ctx._names) || [], hero = ctx && ctx.hero ? String(ctx.hero) : '';
    if (!names.length || names.indexOf(who) < 0 || (hero && (who === hero || forms(hero).indexOf(who) >= 0))) return null;
    var nr = unquote(String((p && p.nr) || '')), ss = nr.replace(/<[^>]*>/g, '\n').split(/(?<=[。！？!?\n])/).map(function (z) { return z.trim(); }).filter(Boolean);
    var npcs = names.filter(function (nm) { return nm !== hero && forms(nm).some(function (f) { return nr.indexOf(f) >= 0; }); });
    var last = null, prevSubj = null, changed = false, out = [];
    ss.forEach(function (sent) {
      if (/^[「『][」』]$/.test(sent)) { out.push(sent); return; }   /* 台詞（中身は外した）: 主語の流れを変えない */
      var nm = namedSubj(sent, names), w = sent;
      if (nm) { last = nm; prevSubj = nm; }
      else if (PRON_RE.test(sent)) {
        var pg = /^彼女/.test(sent) ? 'F' : 'M', gw = gOf(ctx, who), gh = hero ? gOf(ctx, hero) : null;
        var ok = last === who && gw === pg && (prevSubj === who || (npcs.length === 1 && npcs[0] === who && gh && gh !== pg));
        if (ok) { w = sent.replace(PRON_RE, who + '$2'); changed = true; prevSubj = who; } else prevSubj = null;
      } else if (!hasOtherSubj(sent)) {
        if (prevSubj === who && last === who) { w = who + 'は' + sent; changed = true; }
      } else prevSubj = null;
      out.push(w); });
    return changed ? out.join('\n') : null;
  }
  /* ★r5: 主人公（または登録の人物）が入力の行で「A は B に…教える／教えた」と書いた回は、B が教わった（taught）の根拠にする。
     入力の行のその節に、打ち消し・言い切らない語が無いこと・句がそのターンの入力か地の文にあること・B の名前がそのターンの地の文に出ることが要る */
  function inputTaught(x, p, who, ctx) {
    if (!x || x.k !== 'taught' || !p) return false; var names = (ctx && ctx._names) || [], pt = unquote(String(p.pt || '')); if (!pt) return false;
    var f = forms(who); if (!f.length) return false; var others = names.filter(function (nm) { return nm !== who; }); if (ctx && ctx.hero && others.indexOf(String(ctx.hero)) < 0 && String(ctx.hero) !== who) others.push(String(ctx.hero)); if (!others.length) return false;
    var of = []; others.forEach(function (nm) { of = of.concat(forms(nm)); });
    var re = new RegExp('(^|[、。\\s])(' + of.map(esc).join('|') + ')(さん|ちゃん|くん|君)?(は|が)[、，,]?\\s*(' + f.map(esc).join('|') + ')(さん|ちゃん|くん|君)?に[、，,]?([^。！？!?]{0,40}?)(教え(る|た)|教えて(やる|あげる|くれる|やった|あげた|くれた)|手ほどきす|手ほどきし(た)?)([^。！？!?]*)');
    var m = re.exec(pt); if (!m) return false;
    var clause = m[0]; if (HEDGE_RE.test(clause) || RUMOR_RE.test(clause) || /教えな|教えず|教えられな/.test(clause)) return false;
    if (!f.some(function (z) { return String(p.nr || '').indexOf(z) >= 0; })) return false;
    if (!phraseIn(cleanS(x.s), pt + '\n' + unquote(String(p.nr || '')))) return false;
    /* ★r16c（GPT #127-XV 優先 1: 「教える」と入力しても、本文で実際に教わっていなければ採らない。例: 取り出したが電話が鳴って席を外した）: r5 のこの道にも、
       本文の「実演・説明＋教わる人が見ている」と「中断・断りの語が無い」を求める。kill: localStorage v292DfixEXP1ShownOff='1'（今までどおり） */
    if (lsg('v292DfixEXP1ShownOff') === '1') return true;
    if (attemptOnly(p.pt, g3of(x.s))) { cnt(ST, 'inputTryOnly'); return false; }
    try { var c5 = norm(typeof core15 === 'function' ? core15(cleanS(x.s)) : cleanS(x.s)), g5 = []; for (var q5 = 0; q5 + 3 <= c5.length; q5++) g5.push(c5.slice(q5, q5 + 3));
      var nu5 = unquote(String(p.nr || '')); if (R16_HARD.test(nu5) || !r16Shown(String(p.pt || ''), nu5, who, g5)) { cnt(ST, 'inputNotShown'); return false; } } catch (e5) { return false; }
    return true;
  }
  /* ---- ★r6: 案 A2（E1_REALAI_ANALYSIS.md §5・統括の採用）。要約 AI は本文の語をほとんど使わずに言い換えるので、句の文字の一致は求めない。
     r5 の検査（checkLoc の前半）で通らなかったときだけ、次の緩い検査で通す（r5 で通るものはそのまま＝r5 が通していた件は減らない）:
       1) 主人公は対象にしない 2) t は r4 と同じ読みで、その人が出る（名前か会話のタグ）ターンに決まる。t が範囲より前なら古い件として動かさない（前の版に残る）
       3) 句の漢字の半分以上（2 字以上・漢字が 1 字ならその字）がそのターンの入力か本文にある（「」の中も含む）
       4) その漢字を含む文が全部、言い切らない・伝聞の文なら捨てる。全部が別の登録の人物の名前の主語の文（「」の中は外して見る）でも捨てる
       5) first・learned は成功の語（できた・成功・うまくいった・初めて・ようになった）がそのターンに要る。learned は、その文に習得の語が無ければ first に下げる
       4b) 句の漢字を含む言い切りの文のどれかで、その人が主語（入力の行か、r5 の代名詞・省略の読みを通した地の文。「」の中は外す）
       6) failed は 失敗・しくじ・できなかった・うまくいかない・すぎ・足りない 等の語がそのターンに要る
     受け入れたすり抜けは README（意地悪な例を A2 の道で流した結果）。 */
  var A2_LEARN = /ようになっ|身につけ|身に付け|身についた|身に付いた|覚えた|習得し|ものにし/, A2_OK = /できた|成功|うまくいった|上手くいった|初めて|ようになっ/, A2_FAIL = /失敗|しくじ|できなかっ|うまくいかな|上手くいかな|すぎ|足りず|足りな/;
  function a2(x, ctx, who) {
    if (!x || typeof x !== 'object' || !Object.prototype.hasOwnProperty.call(KINDS, x.k)) return 'BAD_K';
    var s = cleanS(x.s); if (s.length < S_MIN) return 'SHORT'; if (s.length > sMax(x)) return 'LONG';
    var names = (ctx && ctx._names) || [], hero = ctx && ctx.hero ? String(ctx.hero) : '', f = forms(who);
    if (!f.length || (hero && (who === hero || forms(hero).indexOf(who) >= 0))) return 'A2_HERO';
    var t0 = parseT(x.t); if (x.t != null && x.t !== '' && isNaN(t0)) return 'BAD_T';
    if (!isNaN(t0) && t0 < ctx.from) return 'A2_OLD_T';
    var present = function (p) { var tx = String(p.nr || '') + String(p.pt || ''); return f.some(function (z) { return tx.indexOf(z) >= 0; }) || (Array.isArray(p.says) && p.says.some(function (c) { return c && f.indexOf(String(c.who || '')) >= 0; })); };
    var tries = isNaN(t0) ? [] : [t0, t0 - 1, ctx.from + t0, ctx.from + t0 - 1], p = null, i, j;
    for (i = 0; i < tries.length && !p; i++) for (j = 0; j < ctx.parts.length; j++) if (ctx.parts[j].i === tries[i] && present(ctx.parts[j])) { p = ctx.parts[j]; break; }
    if (!p) { var ps = ctx.parts.filter(present); if (ps.length === 1) p = ps[0]; }
    if (!p) return 'A2_NOT_PRESENT';
    var text = String(p.pt || '') + '\n' + String(p.nr || ''), ks = {}, kl = [];
    (s.match(/[一-鿿々]/g) || []).forEach(function (k) { if (!ks[k]) { ks[k] = 1; kl.push(k); } });
    var hit = kl.filter(function (k) { return text.indexOf(k) >= 0; });
    if (!kl.length || (kl.length < 2 ? hit.length < kl.length : hit.length < Math.max(2, Math.ceil(kl.length / 2)))) return 'A2_NO_ANCHOR';
    var ss = text.replace(/<[^>]*>/g, '\n').split(/(?<=[。！？!?\n」])/).map(function (z) { return z.trim(); }).filter(function (z) { return z && hit.some(function (k) { return z.indexOf(k) >= 0; }); });
    var live = ss.filter(function (z) { return !HEDGE_RE.test(z) && !RUMOR_RE.test(z); }); if (!live.length) return 'A2_HEDGED';
    var others = []; names.forEach(function (nm) { if (nm !== who) others = others.concat(forms(nm)); }); if (hero && others.indexOf(hero) < 0 && hero !== who) others = others.concat(forms(hero));
    var oRe = others.length ? new RegExp('(' + others.map(esc).join('|') + ')(さん|ちゃん|くん|君)?(は|が)') : null;
    if (oRe && live.every(function (z) { return oRe.test(unquote(z)); })) return 'A2_OTHER_SUBJ';
    /* ★r6 4b: 句の漢字を含む言い切りの文のどれかで、その人が主語であること（入力の行か地の文。地の文は r5 の代名詞・省略の読みを通した後。「」の中は外す） */
    var rt = resolveText(p, who, ctx), body = String(p.pt || '') + '\n' + (rt != null ? rt : unquote(String(p.nr || '')));
    var subj = body.replace(/<[^>]*>/g, '\n').split(/(?<=[。！？!?\n])/).map(function (z) { return z.trim(); }).filter(function (z) { return z && hit.some(function (k) { return z.indexOf(k) >= 0; }) && !HEDGE_RE.test(z) && !RUMOR_RE.test(z); });
    if (!subj.some(function (z) { return ownClause(z, who) != null; })) return 'A2_NOT_SUBJECT';
    var k = x.k;
    if (r10On() && k !== 'taught' && oRe) {            /* ★r10 (2): 根拠が入力の行だけで、地の文では別の人が主語 */
      var sp10 = function (tx) { return String(tx || '').replace(/<[^>]*>/g, '\n').split(/(?<=[。！？!?\n])/).map(function (z) { return z.trim(); }).filter(function (z) { return z && hit.some(function (kk) { return z.indexOf(kk) >= 0; }) && !HEDGE_RE.test(z) && !RUMOR_RE.test(z); }); };
      var nrU = unquote(String(p.nr || ''));
      var ownPt = sp10(String(p.pt || '')).some(function (z) { return ownClause(z, who) != null; });
      var ownNr = sp10(rt != null ? rt : nrU).some(function (z) { return ownClause(z, who) != null; });
      var otherNr = sp10(nrU).some(function (z) { return oRe.test(z) && ownClause(z, who) == null; });
      if (ownPt && !ownNr && otherNr) return 'A2_ACTOR_CONFLICT';
    }
    /* ★SPKCHK1 と同梱（2026-11-22・VX1_B3 の実測）: 句が「…だと話した／言った」＝台詞の申告の写しなら、first・learned にしない（A2 は「」の中も手がかりに数えるので、
       「糊って触るのも今日が初めてなんですよ」という台詞が first「糊を触るのが今日初めてだと話した」として残った）。kill: v292DfixEXP1SaidOff='1' で r7 のまま */
    /* ★r16d: taught は、入力が「教えようとした」だけの回・本文（「」の外）に中断や断りの語がある回は採らない。kill: v292DfixEXP1ShownOff='1' */
    if (k === 'taught' && lsg('v292DfixEXP1ShownOff') !== '1') { try { if (attemptOnly(p.pt, g3of(s))) return 'A2_TRY_ONLY'; var nu17 = unquote(String(p.nr || '')); if (R16_HARD.test(nu17) || (R16_REFUSE.test(nu17) && !r16Shown(String(p.pt || ''), nu17, who, g3of(s)))) return 'A2_INTERRUPTED'; } catch (e16d) {} }
    if ((k === 'first' || k === 'learned') && lsg('v292DfixEXP1SaidOff') !== '1' && /(?:と|って)(?:話し|言っ|語っ|答え|打ち明け|明かし|告げ|口にし|漏らし|こぼし)た$/.test(s)) return 'A2_SAID';
    if ((k === 'first' || k === 'learned') && !A2_OK.test(text)) return 'A2_NO_SUCCESS';
    if (k === 'learned' && !live.some(function (z) { return A2_LEARN.test(z); })) { k = 'first'; ST.a2Down++; }
    if (k === 'failed' && !A2_FAIL.test(text.replace(/失敗(を|も)(恐れ|怖が|気にせ|いと)[^。、]*/g, ''))) return 'A2_NO_FAIL';   /* 「失敗を恐れず」は失敗ではない */
    return { k: k, s: s, t: p.i };
  }
  /* ★r7（realai_out_voiceex1 の実測）: 要約 AI は、最初の作り直しで書かなかった経験を、後の作り直しで元のターンの番号（範囲より前）のまま書く。
     r6 はそれを「古い件（前の版に残っている）」として捨てたが、前の版に無いときは二度と入らなかった（A2・A4 で kept 0）。
     fix135 がこの範囲より前の 12 ターン（ctx.older）を渡すときだけ、t がそこに当たるなら、そのターンの本文だけで同じ検査（r5 → A2）を通す。 */
  function checkLoc(x, ctx, who) {
    var t0 = x && typeof x === 'object' ? parseT(x.t) : NaN;
    if (!isNaN(t0) && ctx && t0 < ctx.from && Array.isArray(ctx.older) && ctx.older.length) {
      var op = null; for (var oi = 0; oi < ctx.older.length; oi++) if (ctx.older[oi] && ctx.older[oi].i === t0) { op = ctx.older[oi]; break; }
      if (op) { var oc = {}; for (var ok in ctx) if (Object.prototype.hasOwnProperty.call(ctx, ok) && ok !== 'older') oc[ok] = ctx[ok]; oc.from = t0; oc.to = t0; oc.text = String(op.pt || '') + '\n' + String(op.nr || ''); oc.parts = [op];
        var ro = checkLocR6(x, oc, who); if (typeof ro !== 'string') { ST.older++; return ro; } cnt(ST.olderRej, ro); return ro; }
    }
    return checkLocR6(x, ctx, who);
  }
  function checkLocR6(x, ctx, who) {
    var r5 = checkLoc5(x, ctx, who); if (typeof r5 !== 'string' || !ctx || !Array.isArray(ctx.parts) || !ctx.parts.length || !ctx._names) return r5;   /* ★r6: r5 で通ればそのまま */
    if (r5 === 'NOT_OBJ' || r5 === 'BAD_K' || r5 === 'SHORT' || r5 === 'LONG' || r5 === 'BAD_T') return r5;
    var a = a2(x, ctx, who); if (typeof a === 'string') { cnt(ST.a2Rej, a); return r5; }
    ST.a2++; return a;
  }
  function checkLoc5(x, ctx, who) {
    if (!ctx || !Array.isArray(ctx.parts) || !ctx.parts.length) return checkItem(x, ctx, who);
    if (!x || typeof x !== 'object') return 'NOT_OBJ';
    var t0 = parseT(x.t); if (x.t != null && x.t !== '' && isNaN(t0)) return 'BAD_T';
    var pass = {}, n = 0, firstWhy = null, via = {};
    ctx.parts.forEach(function (p) { var y = {}; for (var k in x) if (Object.prototype.hasOwnProperty.call(x, k)) y[k] = x[k]; y.t = p.i;
      var r = checkItem(y, { from: p.i, to: p.i, text: partText(p), pt: String((p && p.pt) || ''), nr: String((p && p.nr) || '') }, who);
      if (typeof r === 'string' && x.k === 'first' && (r === 'FIRST_NOT_SAID' || r === 'NOT_SUBJECT' || r === 'NOT_IN_TEXT' || r === 'NEGATED') && selfFirst(x, p, who)) { r = { k: 'first', s: cleanS(x.s), t: p.i }; via[p.i] = 'self'; }
      if (typeof r === 'string' && (r === 'NOT_SUBJECT' || r === 'NOT_IN_TEXT' || r === 'NOT_TAUGHT') && x.k !== 'taught') { var rt = resolveText(p, who, ctx);   /* ★r5: 代名詞・省略の主語 */
        if (rt != null) { var r2 = checkItem(y, { from: p.i, to: p.i, text: String(p.pt || '') + '\n' + rt }, who); if (typeof r2 !== 'string') { r = r2; via[p.i] = 'pron'; } else if (r === 'NOT_SUBJECT' || r === 'NOT_IN_TEXT') r = r2; } }
      if (typeof r === 'string' && x.k === 'taught' && inputTaught(x, p, who, ctx)) { r = { k: 'taught', s: cleanS(x.s), t: p.i }; via[p.i] = 'input'; }   /* ★r5 */
      if (typeof r === 'string') { if (!firstWhy || (firstWhy === 'NOT_IN_TEXT' && r !== 'NOT_IN_TEXT')) firstWhy = r; return; }
      pass[p.i] = r; n++; });
    if (!n) { var z = {}; for (var kz in x) if (Object.prototype.hasOwnProperty.call(x, kz)) z[kz] = x[kz]; z.t = ctx.from;   /* 理由は r3 の検査（全文・t は範囲の頭に置いて t 以外の理由を見る） */
      var w = checkItem(z, { from: ctx.from, to: ctx.to, text: ctx.text }, who); return typeof w === 'string' ? (firstWhy && firstWhy !== 'NOT_IN_TEXT' ? firstWhy : w) : 'CROSS_TURN'; }
    var tries = isNaN(t0) ? [] : [[t0, 'same'], [t0 - 1, 'one_based'], [ctx.from + t0, 'relative'], [ctx.from + t0 - 1, 'relative_one_based']];
    for (var i = 0; i < tries.length; i++) if (pass[tries[i][0]]) { var c = pass[tries[i][0]]; if (tries[i][1] !== 'same') cnt(ST.tFixed, tries[i][1]); countVia(via[c.t]); return c; }
    if (n === 1) { var only = pass[Object.keys(pass)[0]]; cnt(ST.tFixed, isNaN(t0) ? 'no_t' : 'by_text'); countVia(via[only.t]); return only; }
    return 'T_AMBIG';
  }
  function countVia(v) { if (v === 'self') ST.selfFirst++; else if (v === 'pron') ST.pron++; else if (v === 'input') ST.inputTaught++; }
  /* ★r5: 教えた側に付いた taught の句から、教わった側の名前（「B に」）と「を教えた」を外す */
  /* ★EXP1 r14（2026-11-24・既定 OFF・鍵 v292DfixEXP1TaughtFromOn・kill v292DfixEXP1TaughtFromOff）: 教えた側の taught を教わった側へ回すとき（TAUGHT_TO）、
     句から「紬に」「を教えた」を外すだけで、教えた人の名前が付かなかった（実機 2 本: T4〜T6 の行に「律から」が無く、次の作り直しまで誰から教わったかが渡らない）。 */
  function r14On() { return lsg('v292DfixEXP1TaughtFromOff') !== '1' && lsg('v292DfixEXP1TaughtFromOn') === '1'; }
  function taughtPhrase(s, to) { var f = forms(to), t = cleanS(s); f.forEach(function (z) { t = t.replace(new RegExp('^' + esc(z) + '(さん|ちゃん|くん|君)?に[、，,]?'), ''); }); return t.replace(/(を|の)?(教えた|教える|教え始めた|教えはじめた|教えていた|教えている|教えてみせた|教えてあげた|教えてやった|手ほどきした|手ほどきを始めた|説明した|説明し始めた|実演した|実演してみせた|やってみせた|見せた)$/, '').trim(); }
  /* ---- (3) 引き継ぎ（★r2: 段階の優先で入れ替える・同じ話題は 1 件・戻すのは経験を持つ人だけ・30 件の内側） ----
     1 人の枠: 主の枠 3 件（learned > first > taught の順に大事）と、failed の別枠 1 件。
     同じ件: 句が同じ／片方が片方を含む／先頭の漢字の語（話題）が同じ → 重ねない。段階が上がるか同じなら、新しい方の段階とターンに置き換える（下がる知らせは無視）。
     満杯: 新しい件の段階が、枠の中でいちばん低い段階（同じなら古い方）より高いときだけ入れ替える。そうでなければ足さない（full を数える）。 */
  var RANK = { learned: 3, first: 2, taught: 1 };
  /* ★EXP1 r15（2026-11-25・既定 OFF・鍵 v292DfixEXP1TeachRouteOn・kill v292DfixEXP1TeachRouteOff）: 実 AI 1 本（試験_R14_1125）で見つけた 3 点。
     (a) 教えた側が主人公でない登録人物のとき、「蓮にもやい結びの結び方を教えた」が教えた側の taught（＝教わった）として通り、教わった側へ回らなかった
         （sys に「渡瀬 紬：蓮に…を教えた＝教わった」）。→ 句が「…教えた／見せた」で終わる taught は、通っても教わった側へ回す。回せなければ残さない。
     (b) 同じ件の判定が、句の頭の人名（「紬に…」「紬から…」）と「教わった／教えた」の字で重なり、別の題材（もやい結び／草笛）が 1 件に潰れた。
         → 頭の「登録名＋から／に／と／の」と末尾の「を教わった／を教えた」を外した中身で比べる。
     (c) 逆向きの教え（蓮が紬に教えた）も (a) で教わった側（紬）の経験になる。 */
  function r15On() { return lsg('v292DfixEXP1TeachRouteOff') !== '1'; }   /* 20261125-exp1r15on: 実 AI 1 本（同じ台本）で 教えた側に残らず・逆向きも回り・潰れ 0・4 問正答 → 全員 既定 ON */
  var TEACH_END = /(教えた|教える|教え始めた|教えはじめた|教えていた|教えている|教えてみせた|教えてあげた|教えてやった|手ほどきした|手ほどきを始めた|説明した|説明し始めた|実演した|実演してみせた|やってみせた|見せた)$/;
  function core15(s) {
    var n = norm(s), fs = [];
    REGN.forEach(function (r) { forms(r).forEach(function (z) { z = norm(z); if (z && fs.indexOf(z) < 0) fs.push(z); }); });
    fs.sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < fs.length; i++) { var re = new RegExp('^' + esc(fs[i]) + '(さん|ちゃん|くん|君)?(から|に|と|の)'); if (re.test(n)) { n = n.replace(re, ''); break; } }
    n = n.replace(/(を|の)?(教わった|教わる|習った|教えてもらった|見せてもらった|見せられた|教えられた|手ほどきを受けた|教えた|教える|教え始めた|教えはじめた|教えていた|教えている|教えてみせた|教えてあげた|教えてやった|手ほどきした|手ほどきを始めた|説明した|説明し始めた|実演した|実演してみせた|やってみせた|見せた)$/, '');
    return n;
  }
  /* r15b（GPT #127-XP の回帰条件）: 句の頭の登録名（教え手・相手）が両方にあって別の人なら、中身が同じでも別の件（紬から教わった結び方／透から教わった結び方） */
  function lead15(s) { var n = norm(s), best = '';
    REGN.forEach(function (r) { forms(r).forEach(function (z) { z = norm(z); if (z && new RegExp('^' + esc(z) + '(さん|ちゃん|くん|君)?(から|に|と|の)').test(n)) { if (!best) best = r; } }); });
    return best; }
  function topic(s) { var m = /^[一-鿿々ァ-ヶー]{1,6}/.exec(r15On() ? core15(s) : norm(s)); return m ? m[0] : ''; }
  function sameS(a, b) { var x = norm(a), y = norm(b); if (r15On()) { var la15 = lead15(a), lb15 = lead15(b); if (la15 && lb15 && la15 !== lb15) return false; var x15 = core15(a), y15 = core15(b); if (x15 && y15) { x = x15; y = y15; } } if (!x || !y) return false; if (x === y || x.indexOf(y) >= 0 || y.indexOf(x) >= 0) return true; var tx = topic(a), ty = topic(b); if (!!tx && tx === ty) return true; if (tx && ty && Math.min(tx.length, ty.length) >= 3 && (tx.indexOf(ty) === 0 || ty.indexOf(tx) === 0) && lsg('v292DfixEXP1RouteLeadOff') !== '1') return true;   /* r16b: 「フィルム（の入れ方）」と「フィルムカメラ（の入れ方）」は同じ件（実 AI 試験_R16_ON で重複 2 件） */
    /* ★r6: 言い換え（「背の剥がれた文庫に糊を引き直し仕上げた」と「文庫の背の糊を引き直し成功した」）も同じ件: 漢字の集合の重なりが、少ない方の 6 割以上（3 字以上） */
    var ka = {}, kb = {}, na = 0, nb = 0, both = 0; (x.match(/[一-鿿々]/g) || []).forEach(function (k) { if (!ka[k]) { ka[k] = 1; na++; } }); (y.match(/[一-鿿々]/g) || []).forEach(function (k) { if (!kb[k]) { kb[k] = 1; nb++; if (ka[k]) both++; } });
    return both >= 3 && both >= Math.ceil(Math.min(na, nb) * 0.6); }
  function addTo(list, c) {
    var pool = list.filter(function (x) { return (x.k === 'failed') === (c.k === 'failed'); }), cap = c.k === 'failed' ? 1 : PER;
    /* ★r12（2026-11-24・既定 OFF・鍵 v292DfixEXP1TaughtKeepOn・kill v292DfixEXP1TaughtKeepOff）: 「律から…を教わった」(taught) と「一人で…できた」(first／learned) は
       同じ漢字が重なると同じ件と見なされ、段階の高い方が taught を上書きして「誰から教わったか」が消えていた（実機 題材_1: KEPT なのに残らず）。
       taught と first／learned は別の事実として両方残す。満杯のときも、taught を first／learned で押し出さない。 */
    var r12 = lsg('v292DfixEXP1TaughtKeepOff') !== '1';   /* 20261124-r13on: 全員 既定 ON（実 AI 4 本で taught と first が最後まで両方残り、消えた件 0） */
    for (var i = 0; i < pool.length; i++) if (sameS(pool[i].s, c.s) && !(r12 && ((pool[i].k === 'taught') !== (c.k === 'taught')))) {
      var p = pool[i]; if (p.k === 'first' && c.k === 'first') { ST.dup++; return; }   /* ★r6: 初めてできたのは最初のターンのまま */
      if (c.k === 'failed' || RANK[c.k] >= RANK[p.k]) { if (p.k !== c.k || p.t !== c.t || p.s !== c.s) { p.k = c.k; p.t = c.t; p.s = c.s; ST.upd++; } else ST.dup++; } else ST.dup++; return; }
    if (pool.length < cap) { list.push(c); ST.kept++; return; }
    var low = null; pool.forEach(function (x) { if (!low || (RANK[x.k] || 0) < (RANK[low.k] || 0) || ((RANK[x.k] || 0) === (RANK[low.k] || 0) && x.t < low.t)) low = x; });
    if (r12 && c.k !== 'failed' && low && low.k === 'taught' && c.k !== 'taught') {   /* taught は押し出さない: taught 以外でいちばん低い・古い件と比べる */
      var low2 = null; pool.forEach(function (x) { if (x.k === 'taught') return; if (!low2 || (RANK[x.k] || 0) < (RANK[low2.k] || 0) || ((RANK[x.k] || 0) === (RANK[low2.k] || 0) && x.t < low2.t)) low2 = x; });
      if (low2 && (RANK[c.k] > RANK[low2.k] || (RANK[c.k] === RANK[low2.k] && c.t > low2.t))) { list.splice(list.indexOf(low2), 1, c); ST.swapped++; return; }
      ST.full++; return;
    }
    if (c.k !== 'failed' && low && RANK[c.k] > RANK[low.k]) { list.splice(list.indexOf(low), 1, c); ST.swapped++; return; }
    if (c.k === 'failed' && low && c.t >= low.t) { list.splice(list.indexOf(low), 1, c); ST.swapped++; return; }
    ST.full++;
  }
  var lastAsked = false, LAST = [];
  function merge(result, prevWI, ctx) {
    var asked = lastAsked; lastAsked = false;
    if (!result || !Array.isArray(result.worldinfo)) return result;
    var live = on();
    /* ★EXP1 r8（2026-11-24・既定 OFF・鍵 v292DfixEXP1PendOn・kill v292DfixEXP1PendOff）: 受け取った要約を取り込む時点で、Vault の答えが 15 秒より古いだけ
       （VAULTGATE2 が V2_PENDING／V2_CG_STALE／V2_INCOMPLETE＝「隠してある」とも「施錠中」とも言っていない）の回は、受けた exp を捨てていた（rej OFF_AT_MERGE・実 AI で 7 回）。
       取り込みは端末の中の記憶への書き込みで、外への送信は頼んだ時点でもう済んでいる。頼んだ回（応答に exp がある）に限り、この 3 つの理由のときは取り込む。
       隠した物語・施錠中（V2_LOCKED など）・kill・長期記憶 OFF は今までどおり捨てる。 */
    try { if (!live && lsg('v292DfixEXP1PendOff') !== '1'   /* 20261124: 全員 既定 ON（長期記憶が ON の人）。実機で頼む側の枝が 1 回通り 1 件採用・害なし */) { var w8 = why(); if (/^VAULT_V2_(?:PENDING|CG_STALE|INCOMPLETE)$/.test(String(w8)) && Array.isArray(result && result.worldinfo) && result.worldinfo.some(function (z) { return z && typeof z === 'object' && z.exp !== undefined; })) { live = true; cnt(ST.rej, 'PEND_KEPT_LIVE'); } } } catch (e8) {}
    if (!live && !asked) return result;   /* 頼んでいない・OFF: 土台と同じ（触らない） */
    var prevBy = {}; (prevWI || []).forEach(function (w) { if (w && w.type === 'character' && w.name && Array.isArray(w.exp)) prevBy[w.name] = w; });
    var names = {}, routed = {}, chars = result.worldinfo.filter(function (w) { return w && typeof w === 'object' && w.type === 'character' && typeof w.name === 'string' && w.name; }).map(function (w) { return w.name; });
    var diag = { at: Date.now(), from: ctx && ctx.from, to: ctx && ctx.to, items: [] };
    setCanon(ctx);
    if (ctx && typeof ctx === 'object') { var cx = {}; for (var kc in ctx) if (Object.prototype.hasOwnProperty.call(ctx, kc)) cx[kc] = ctx[kc]; cx._names = chars.slice(); ctx = cx; }   /* ★r5: 人物の名前（代名詞の読みと入力の行の taught に使う） */
    /* ★r4: 人物でない項目に付いた exp は、句の主語がこの版の人物の項目のだれか 1 人と確かめられるときだけ、その人の経験として検査に回す（確かめられなければ捨てる） */
    if (live) result.worldinfo.forEach(function (w) {
      if (!w || typeof w !== 'object' || w.type === 'character' || w.exp === undefined) return;
      if (!Array.isArray(w.exp) || !w.exp.length) { ST.emptyNonChar++; return; }
      w.exp.forEach(function (x) { ST.got++; var hit = [];
        chars.forEach(function (nm) { var c = checkLoc(x, ctx, nm); if (typeof c !== 'string') hit.push([nm, c]); });
        var v = hit.length === 1 ? 'ROUTED' : (hit.length ? 'NOT_CHARACTER_AMBIG' : 'NOT_CHARACTER');
        diag.items.push({ on: String(w.type || '').slice(0, 12), name: String(w.name || '').slice(0, 24), k: x && x.k, s: x && String(x.s || '').slice(0, 30), t: x && x.t, v: v, to: hit.length === 1 ? hit[0][0] : null, ft: hit.length === 1 ? hit[0][1].t : null });
        if (hit.length !== 1) { cnt(ST.rej, v); return; }
        ST.routed++; (routed[hit[0][0]] = routed[hit[0][0]] || []).push(hit[0][1]); }); });
    result.worldinfo = result.worldinfo.map(function (w) {
      if (!w || typeof w !== 'object') return w;
      var raw = w.exp, o = {}; for (var k in w) if (Object.prototype.hasOwnProperty.call(w, k) && k !== 'exp') o[k] = w[k];
      if (w.type !== 'character') { if (raw !== undefined && !live) cnt(ST.rej, 'NOT_CHARACTER'); return o; }
      names[w.name] = 1;
      var list = (prevBy[w.name] ? prevBy[w.name].exp : []).filter(function (x) { return x && KINDS[x.k] && typeof x.s === 'string'; }).map(function (x) { return { k: x.k, s: x.s, t: +x.t || 0 }; });
      if (!live) { if (raw !== undefined) cnt(ST.rej, 'OFF_AT_MERGE'); if (list.length) o.exp = list; return o; }   /* ★r2: 頼んだ後に OFF になった回は、受けた exp を保存しない（前の版だけ残す） */
      (Array.isArray(raw) ? raw : []).forEach(function (x) { ST.got++; var c = checkLoc(x, ctx, w.name);
        var t15 = !!(r15On() && x && x.k === 'taught' && typeof c !== 'string' && TEACH_END.test(cleanS(x.s)));   /* ★r15 (a) */
        if ((typeof c === 'string' || t15) && x && x.k === 'taught') {   /* ★r5: 教えた側に付いた taught は、教わった側（ほかの人物 1 人）の経験として検査し直す */
          var hit = [], lead16 = null;
          /* ★r16b（2026-11-26・実 AI 試験_R16_OFF T3 の実測: 律の「紬に…を見せた」が、紬では通らず冴で通って冴へ回り、sys に「霧島 冴＝律から紬に…を教わった」）:
             句の頭が「登録人物＋に」なら、回す先はその人だけ。kill: localStorage v292DfixEXP1RouteLeadOff='1' */
          if (lsg('v292DfixEXP1RouteLeadOff') !== '1') { var cs16 = cleanS(x.s); chars.forEach(function (nm) { if (lead16 || nm === w.name) return; if (forms(nm).some(function (z) { return z && new RegExp('^' + esc(z) + '(さん|ちゃん|くん|君)?に').test(cs16); })) lead16 = nm; }); }
          chars.forEach(function (nm) { if (nm === w.name) return; if (lead16 && nm !== lead16) return; var y = {}; for (var ky in x) if (Object.prototype.hasOwnProperty.call(x, ky)) y[ky] = x[ky]; y.s = taughtPhrase(x.s, nm); if (y.s === cleanS(x.s) && !forms(nm).some(function (z) { return cleanS(x.s).indexOf(z) >= 0; })) return; var cc = checkLoc(y, ctx, nm); if (typeof cc !== 'string') hit.push([nm, cc]); });
          if (hit.length === 1 && (r14On() || r15On())) {   /* ★r14: 教えた人の名前を句に入れる（「フィルムの入れ方」→「律からフィルムの入れ方を教わった」）。40 字を超えるなら入れない */
            var h14 = hit[0][1], s14 = String(h14.s || ''), f14 = forms(w.name), sh14 = f14.length ? f14.slice().sort(function (a, b) { return a.length - b.length; })[0] : '';
            if (sh14 && s14 && !/教わ|習っ|から/.test(s14) && !f14.some(function (z) { return s14.indexOf(z) >= 0; })) {
              var n14 = sh14 + 'から' + s14 + 'を教わった'; if (n14.length <= 40) { h14.s = n14; cnt(ST, 'taughtFrom'); } } }
          if (hit.length === 1) { ST.taughtTo++; diag.items.push({ on: 'character', name: String(w.name || '').slice(0, 24), k: x.k, s: String(x.s || '').slice(0, 30), t: x.t, v: 'TAUGHT_TO', to: hit[0][0], ft: hit[0][1].t }); (routed[hit[0][0]] = routed[hit[0][0]] || []).push(hit[0][1]); return; }
          if (t15) { cnt(ST.rej, 'TEACH_UNROUTED'); diag.items.push({ on: 'character', name: String(w.name || '').slice(0, 24), k: x.k, s: String(x.s || '').slice(0, 30), t: x.t, v: 'TEACH_UNROUTED', n: hit.length }); return; } }
        diag.items.push({ on: 'character', name: String(w.name || '').slice(0, 24), k: x && x.k, s: x && String(x.s || '').slice(0, 30), t: x && x.t, v: typeof c === 'string' ? c : 'KEPT', ft: typeof c === 'string' ? null : c.t });
        if (typeof c === 'string') { cnt(ST.rej, c); return; } addTo(list, c); });
      (routed[w.name] || []).forEach(function (c) { addTo(list, c); }); delete routed[w.name];   /* ★r4 */
      if (list.length) o.exp = list;
      return o;
    });
    if (live) Object.keys(routed).forEach(function (nm) { var e = null; result.worldinfo.forEach(function (w) { if (!e && w && w.type === 'character' && w.name === nm) e = w; }); if (!e) return; var list = Array.isArray(e.exp) ? e.exp : []; routed[nm].forEach(function (c) { addTo(list, c); }); if (list.length) e.exp = list; });   /* ★r5: 後から回した分（並びの前の人物へ） */
    if (live) { LAST.unshift(diag); if (LAST.length > 4) LAST.length = 4; }   /* ★r4: 診断（このページの間だけ・保存しない） */
    if (live) Object.keys(prevBy).forEach(function (n) { if (!names[n] && result.worldinfo.length < 30) { result.worldinfo.push(prevBy[n]); ST.restored++; } });   /* ★r2: 経験を持つ人だけ・30 件の内側。戻す項目は前の版そのまま */
    return result;
  }
  /* ---- (4) 覚え書きの節 ---- */
  var HEAD = '経験と習得（本文で確かめた範囲）：';
  function section(wi, cleanFn) {
    FGWI = null;
    if (!Array.isArray(wi) || !on()) return '';
    FGWI = wi;   /* r13: 前面の 1 行が読む（この関数が門を通った回の記録だけ） */
    var lines = [], used = HEAD.length, cl = typeof cleanFn === 'function' ? cleanFn : function (s) { return String(s || ''); };
    if (r10On()) {                                      /* ★r10 (3): 起きた順・1 行 1 件 */
      var all = [];
      wi.forEach(function (w) {
        if (!w || w.type !== 'character' || !w.name || !Array.isArray(w.exp) || !w.exp.length) return;
        w.exp.filter(function (x) { return x && KINDS[x.k] && x.s; }).slice().sort(function (a, b) { return (+b.t || 0) - (+a.t || 0); }).slice(0, NOTE_PER)
          .forEach(function (x) { all.push({ t: +x.t || 0, n: cl(w.name), s: cl(x.s), k: x.k }); });
      });
      all.sort(function (a, b) { return b.t - a.t; });
      var pick = [];
      all.forEach(function (x) {
        if (x.s.length <= 1) return;
        var tail = x.k === 'taught' ? ((/教わ|習っ|教えてもら|見せてもら|手ほどき/.test(x.s) ? '' : '＝教わった') + '（習得は不明）') : ('＝' + KINDS[x.k]);
        var ln = '\n・T' + (x.t + 1) + '｜' + x.n + '：' + x.s + tail;
        if (used + ln.length > 200) return;
        pick.push({ t: x.t, ln: ln }); used += ln.length;
      });
      if (!pick.length) return '';
      pick.sort(function (a, b) { return a.t - b.t; });
      var t10 = HEAD + pick.map(function (x) { return x.ln; }).join(''); ST.notes++; ST.noteChars += t10.length; return t10;
    }
    wi.forEach(function (w) {
      if (!w || w.type !== 'character' || !w.name || !Array.isArray(w.exp) || !w.exp.length) return;
      var items = w.exp.filter(function (x) { return x && KINDS[x.k] && x.s; }).slice().sort(function (a, b) { return (+b.t || 0) - (+a.t || 0); }).slice(0, NOTE_PER)
        .map(function (x) { return cl(x.s) + '＝' + KINDS[x.k] + '（T' + ((+x.t || 0) + 1) + '）'; }).filter(function (s) { return s.length > 2; });
      if (!items.length) return;
      var line = '\n・' + cl(w.name) + '：' + items.join('、');
      if (used + line.length > NOTE_MAX) return;
      lines.push(line); used += line.length;
    });
    if (!lines.length) return '';
    var t = HEAD + lines.join(''); ST.notes++; ST.noteChars += t.length; return t;
  }
  /* ★EXP1 r13（2026-11-24・GPT #127-XJ・既定 OFF・鍵 v292DfixEXP1FgOn・kill v292DfixEXP1FgOff）: 前面に出す人物の経験を、その人物の指示のすぐ後に 1 行で出す。
     実 AI 2 本: 経験の節（送信の 85% の位置の資料の中）に「律から教わった」が入っていても、紬は設定の「前職」へ話を寄せた（正答 1/4）。
     禁止文ではなく、事実の提示だけ（GPT #127-XJ の文面）。既存の覚え書きの節は動かさない（前面でない人物の経験が送られなくなるため＝追加方式）。1 人 2 件・全体 160 字まで。門は EXP1 と同じ（隠した物語・施錠中・長期記憶 OFF では出さない）。
     人物の記録は、覚え書きの節を作るとき（section）に受け取ったものを使う＝このページで一度も覚え書きを作っていなければ出さない。 */
  var FGWI = null, FG_MAX = 160;
  function fgOn() { return lsg('v292DfixEXP1FgOff') !== '1'; }   /* 20261124-r13on: 全員 既定 ON（長期記憶が ON の人）。実 AI 2 対 2: 正答 OFF 3/8 → ON 7/8・経験の作り話 OFF 5 → ON 1。GPT #127-XK (d) */
  function factOn() { return lsg('v292DfixEXP1FactOff') !== '1' && lsg('v292DfixEXP1FactOn') === '1'; }
  function fgLine(names) {
    try {
      if (!fgOn() || !Array.isArray(names) || !names.length || !Array.isArray(FGWI) || !on()) return '';
      var parts = [], used = 0;
      names.forEach(function (n) {
        var w = null; FGWI.forEach(function (z) { if (!w && z && z.type === 'character' && z.name && strip(z.name) === strip(n) && Array.isArray(z.exp) && z.exp.length) w = z; });
        if (!w) return;
        var xs = w.exp.filter(function (x) { return x && KINDS[x.k] && x.s && x.k !== 'failed'; }).slice().sort(function (a, b) { return ((b.k === 'taught') - (a.k === 'taught')) || ((+b.t || 0) - (+a.t || 0)); }).slice(0, 2)
          .sort(function (a, b) { return (+a.t || 0) - (+b.t || 0); });
        if (!xs.length) return;
        var seg = String(n) + '＝' + xs.map(function (x) {
          return 'T' + ((+x.t || 0) + 1) + ' ' + String(x.s).replace(/[\r\n【】]/g, ' ') + (x.k === 'taught' ? (factOn() ? '。技能の習得は未確認' : '（習得未確認）') : (x.k === 'first' ? '（初めて成功）' : '（身についた）'));   /* ★FACT1（GPT #127-XY 案 A・既定 OFF: localStorage v292DfixEXP1FactOn='1'・kill v292DfixEXP1FactOff='1'）: 教わった事実と、技能の習得を別の文に */
        }).join('／');
        if (used + seg.length > FG_MAX) return;
        parts.push(seg); used += seg.length;
      });
      if (!parts.length) return '';
      cnt(ST, 'fgLines');
      return '【物語内で確認された経験】' + parts.join('　') + '。';   /* GPT #127-XJ: 位置づけの一文は入れない */
    } catch (e) { return ''; }
  }
  var api = { VER: VER, on: on, why: why, prompt: prompt, wiLine: wiLine, merge: merge, section: section, fgLine: fgLine, checkItem: checkItem, checkLoc: checkLoc, parseT: parseT, last: function () { return JSON.parse(JSON.stringify(LAST)); }, KINDS: KINDS, NOTE_MAX: NOTE_MAX, PER: PER,
    stats: function () { return JSON.parse(JSON.stringify(ST)); } };
  try { Object.defineProperty(root, '__v292DfixEXP1', { value: Object.freeze(api), configurable: false, enumerable: false, writable: false }); } catch (e) { root.__v292DfixEXP1 = api; }
})(typeof window !== 'undefined' ? window : globalThis);
