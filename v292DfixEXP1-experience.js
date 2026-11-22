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
  var VER = 'exp1-20261122-r3';
  var KINDS = { taught: '教わった（習得は不明）', first: '初めてできた', learned: '身についた', failed: 'できなかった' };
  var PER = 3, NOTE_PER = 2, NOTE_MAX = 160, S_MIN = 2, S_MAX = 24;
  var ST = { on: 0, offWhy: {}, asked: 0, got: 0, kept: 0, rej: {}, dup: 0, upd: 0, swapped: 0, full: 0, restored: 0, notes: 0, noteChars: 0 };
  function cnt(o, k) { o[k] = (o[k] || 0) + 1; }
  function lsg(k) { try { return root.localStorage.getItem(k); } catch (e) { return undefined; } }
  function sid() { try { var f = root.__v292Dfix697; var id = f && f.status ? f.status().storyId : null; return id ? String(id) : null; } catch (e) { return null; } }
  function vaultOk() {
    var id = sid(); if (!id) return 'ID_UNKNOWN';
    var G = root.__v292DfixVAULTGATE2; if (!G || typeof G.hidden !== 'function') return 'NO_VAULTGATE2';
    try { if (G.hidden(id) === false) return ''; if (typeof G.openWhy === 'function' && G.openWhy(id) === '') return ''; return 'VAULT_' + String((typeof G.openWhy === 'function' && G.openWhy(id)) || 'HIDDEN').slice(0, 24); } catch (e) { return 'VAULT_THREW'; }
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
  var WI_NEW = '"desc": "1 sentence Japanese: who/what", "exp": [ { "k": "taught|first|learned|failed", "s": "Japanese, 24 chars max: what this character was taught, did for the first time, can now do, or failed at", "t": turn number } ] }';
  var EXP_RULE = ' For "exp" (character entries only; [] if none): record only what the NEW TURNS text shows — k=taught when the text only shows the character being taught or shown, first when the character did it once successfully for the first time, learned only when the text says the character can now do it, failed when the character could not do it in a situation; never upgrade k beyond what the text says, and never infer an ability the text does not show.';
  function prompt(p) {
    if (typeof p !== 'string' || !on()) return p;
    if (p.split(WI_OLD).length !== 2) { cnt(ST.rej, 'PROMPT_MISMATCH'); return p; }
    var q = p.split(WI_OLD).join(WI_NEW);
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
  function forms(name) { var n = String(name || '').trim(), out = []; if (!n) return out; out.push(n);
    var parts = n.split(/[\s　・]+/).filter(function (x) { return x.length >= 2; }); if (parts.length > 1) out = out.concat(parts);
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
    var s = cleanS(x.s); if (s.length < S_MIN) return 'SHORT'; if (s.length > S_MAX) return 'LONG';
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
    return found ? why : 'NOT_IN_TEXT';
  }
  /* ---- (3) 引き継ぎ（★r2: 段階の優先で入れ替える・同じ話題は 1 件・戻すのは経験を持つ人だけ・30 件の内側） ----
     1 人の枠: 主の枠 3 件（learned > first > taught の順に大事）と、failed の別枠 1 件。
     同じ件: 句が同じ／片方が片方を含む／先頭の漢字の語（話題）が同じ → 重ねない。段階が上がるか同じなら、新しい方の段階とターンに置き換える（下がる知らせは無視）。
     満杯: 新しい件の段階が、枠の中でいちばん低い段階（同じなら古い方）より高いときだけ入れ替える。そうでなければ足さない（full を数える）。 */
  var RANK = { learned: 3, first: 2, taught: 1 };
  function topic(s) { var m = /^[一-鿿々ァ-ヶー]{1,6}/.exec(norm(s)); return m ? m[0] : ''; }
  function sameS(a, b) { var x = norm(a), y = norm(b); if (!x || !y) return false; if (x === y || x.indexOf(y) >= 0 || y.indexOf(x) >= 0) return true; var tx = topic(a), ty = topic(b); return !!tx && tx === ty; }
  function addTo(list, c) {
    var pool = list.filter(function (x) { return (x.k === 'failed') === (c.k === 'failed'); }), cap = c.k === 'failed' ? 1 : PER;
    for (var i = 0; i < pool.length; i++) if (sameS(pool[i].s, c.s)) {
      var p = pool[i]; if (c.k === 'failed' || RANK[c.k] >= RANK[p.k]) { if (p.k !== c.k || p.t !== c.t || p.s !== c.s) { p.k = c.k; p.t = c.t; p.s = c.s; ST.upd++; } else ST.dup++; } else ST.dup++; return; }
    if (pool.length < cap) { list.push(c); ST.kept++; return; }
    var low = null; pool.forEach(function (x) { if (!low || (RANK[x.k] || 0) < (RANK[low.k] || 0) || ((RANK[x.k] || 0) === (RANK[low.k] || 0) && x.t < low.t)) low = x; });
    if (c.k !== 'failed' && low && RANK[c.k] > RANK[low.k]) { list.splice(list.indexOf(low), 1, c); ST.swapped++; return; }
    if (c.k === 'failed' && low && c.t >= low.t) { list.splice(list.indexOf(low), 1, c); ST.swapped++; return; }
    ST.full++;
  }
  var lastAsked = false;
  function merge(result, prevWI, ctx) {
    var asked = lastAsked; lastAsked = false;
    if (!result || !Array.isArray(result.worldinfo)) return result;
    var live = on();
    if (!live && !asked) return result;   /* 頼んでいない・OFF: 土台と同じ（触らない） */
    var prevBy = {}; (prevWI || []).forEach(function (w) { if (w && w.type === 'character' && w.name && Array.isArray(w.exp)) prevBy[w.name] = w; });
    var names = {};
    result.worldinfo = result.worldinfo.map(function (w) {
      if (!w || typeof w !== 'object') return w;
      var raw = w.exp, o = {}; for (var k in w) if (Object.prototype.hasOwnProperty.call(w, k) && k !== 'exp') o[k] = w[k];
      if (w.type !== 'character') { if (raw !== undefined) cnt(ST.rej, 'NOT_CHARACTER'); return o; }
      names[w.name] = 1;
      var list = (prevBy[w.name] ? prevBy[w.name].exp : []).filter(function (x) { return x && KINDS[x.k] && typeof x.s === 'string'; }).map(function (x) { return { k: x.k, s: x.s, t: +x.t || 0 }; });
      if (!live) { if (raw !== undefined) cnt(ST.rej, 'OFF_AT_MERGE'); if (list.length) o.exp = list; return o; }   /* ★r2: 頼んだ後に OFF になった回は、受けた exp を保存しない（前の版だけ残す） */
      (Array.isArray(raw) ? raw : []).forEach(function (x) { ST.got++; var c = checkItem(x, ctx, w.name); if (typeof c === 'string') { cnt(ST.rej, c); return; } addTo(list, c); });
      if (list.length) o.exp = list;
      return o;
    });
    if (live) Object.keys(prevBy).forEach(function (n) { if (!names[n] && result.worldinfo.length < 30) { result.worldinfo.push(prevBy[n]); ST.restored++; } });   /* ★r2: 経験を持つ人だけ・30 件の内側。戻す項目は前の版そのまま */
    return result;
  }
  /* ---- (4) 覚え書きの節 ---- */
  var HEAD = '経験と習得（本文で確かめた範囲）：';
  function section(wi, cleanFn) {
    if (!Array.isArray(wi) || !on()) return '';
    var lines = [], used = HEAD.length, cl = typeof cleanFn === 'function' ? cleanFn : function (s) { return String(s || ''); };
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
  var api = { VER: VER, on: on, why: why, prompt: prompt, wiLine: wiLine, merge: merge, section: section, checkItem: checkItem, KINDS: KINDS, NOTE_MAX: NOTE_MAX, PER: PER,
    stats: function () { return JSON.parse(JSON.stringify(ST)); } };
  try { Object.defineProperty(root, '__v292DfixEXP1', { value: Object.freeze(api), configurable: false, enumerable: false, writable: false }); } catch (e) { root.__v292DfixEXP1 = api; }
})(typeof window !== 'undefined' ? window : globalThis);
