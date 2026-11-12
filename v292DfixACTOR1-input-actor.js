/* =====================================================================
 * v292DfixACTOR1-input-actor.js — 入力の主体を正しく伝える（a）／台詞の無い回に主人公を喋らせない（b）（★laneQUALA・GPT #127-SG §D の D5・D4・2026-11-12・Local 候補）
 * ---------------------------------------------------------------------
 * ■なぜ
 *   D5: DO の入力「壁の消火器を掴んで黒い腕を殴りつける。腕がほどけて美羽が落ち、右の手首を切る」で、本文が「蓮が手首を切った」になった（本物の AI 1/3）。
 *       fix192 buildSys（v292Dfix192-newengine.js:872）は DO の入力を丸ごと
 *         【プレイヤー入力＝主人公の行動】主人公〈蓮〉が「…美羽が落ち、右の手首を切る」という行動をとった。主人公の行動として本文に反映し、他キャラの行動にしない。
 *       と書く。入力の中で主語が「美羽」の部分まで「主人公の行動・他キャラの行動にしない」と指示していた。
 *   D4: 台詞を入力していない DO の回（鍵を美羽に預ける）で、AI が主人公の台詞「持っててくれ」を書く（本物の AI 3/3 本・PRUNE2 A/B でも O1 O2 A1 B1 C1）。
 *       「主人公の台詞を書かない」は AGENCY1b の STORY・続き・オートの文にしか無く、DO の回には無い（AGENCY1 の DO の文は「意図・発話内容を確定しない」）。
 *       逆に sys は「その場にいるキャラは…自分から喋り」「主人公しかいない場面では、独白・つぶやき…を見せてよい」（fix192:9 相当）と言う。
 * ■やること（送信直前・fetch 境界。PRUNE1/PRUNE2 と同じ形。元のブロックを作る部品は 1 行も触らない）
 *   (a) 既定 ON 候補（DO の腕）。STORY の腕は既定 OFF（v292DfixACTOR1aStoryOn='1' の端末だけ。STORY の行は主人公に帰属させていないので D5 の主因でなく、
 *       プレイヤーが NPC の動きを書く STORY は多い＝字数が毎回増えるため）。DO（と ON のときの STORY）の回で、入力文の中に「登録キャラ名＋が」（主人公以外）が主語として立つ部分があり、それが証明できるときだけ:
 *       DO   : 入力説明の行の「主人公の行動として本文に反映し、他キャラの行動にしない。」を
 *              「主語のない部分は主人公の行動として本文に反映する。「美羽が落ち、右の手首を切る」の主語は美羽（主人公ではない）。その部分は美羽の行動・身に起きることとして書き、主人公に移さない。」に置き換える。
 *       STORY: 方向づけの行の「その方向で場面を進める。」の直後に「「…」の主語は美羽（主人公ではない）。その部分は…主人公に移さない。」を足す。
 *       証明できない（は・も・関係節・従属節・引用の中・別名・未登録名・長すぎる）ときは何もしない（＝今のまま）。
 *   (b) 既定 OFF（端末キー v292DfixACTOR1bOn='1' で ON。A/B 用）。SAY でない回（DO・STORY・続き・オート）だけ:
 *       user 末尾の逐語反映の「・SAY → …」の行（この回は使わない行）を、同じ場所で
 *         「・この回は台詞の入力が無い。主人公〈蓮〉の台詞を「」でも<say>でも書かない（渡す・頼む・呼びかける行動も、言葉を足さず動作と表情で描く）」
 *       に差し替える（モデルが最後に読む位置）。sys では「主人公しかいない場面では、独白・つぶやき・心の声で内面を見せてよい。」を外し、
 *       「その場にいるキャラは生きている。」を「その場にいるNPCは生きている。」にする（食い違う 2 文。字数は増やさない側）。
 * ■止める
 *   v292DfixACTOR1Off='1' … 全部止める（受け取った body をそのまま渡す＝送信バイト同一）。毎回評価・再読み込み不要。
 *   v292DfixACTOR1aOff='1' … (a) だけ止める（STORY の腕も）。  v292DfixACTOR1bOff='1' … (b) を止める（bOn より強い）。localStorage が読めないときは何もしない。
 * ■診断（本文・入力文・名前・物語 ID は残さない）: window.__v292DfixACTOR1.status()
 * ■読み込み位置: index.html で CP1-final-tap の直後・PRUNE2 の前（fetch を包む部品の内側＝PRUNE1/PRUNE2 の後に当たる。CP1 tap は書き換え後を見る）。
 * ===================================================================== */
(function () {
  'use strict';
  var G = (typeof window !== 'undefined') ? window : globalThis;
  if (G.__v292DfixACTOR1) return;
  var VER = 'actor1-20261112-a', TAG = '[v292DfixACTOR1]';

  function ls(k) { try { return G.localStorage.getItem(k); } catch (e) { return '__ERR__'; } }
  function flags() {
    var all = ls('v292DfixACTOR1Off');
    if (all === '__ERR__' || all === '1') return { a: false, b: false };
    var a = ls('v292DfixACTOR1aOff') !== '1';
    return { a: a, as: a && ls('v292DfixACTOR1aStoryOn') === '1', b: ls('v292DfixACTOR1bOff') !== '1' && ls('v292DfixACTOR1bOn') === '1' };
  }

  var MK_SAY = '【プレイヤー入力＝主人公の発話】', MK_DO = '【プレイヤー入力＝主人公の行動】', MK_DIR = '【プレイヤー入力＝場面の方向づけ】';
  var DO_OLD = '主人公の行動として本文に反映し、他キャラの行動にしない。';
  var DO_KEEP = '主語のない部分は主人公の行動として本文に反映する。';
  var DIR_AT = 'と場面を方向づけた。その方向で場面を進める。';
  var B_SYS_RM = '主人公しかいない場面では、独白・つぶやき・心の声で内面を見せてよい。';
  var B_SYS_RW = ['その場にいるキャラは生きている。', 'その場にいるNPCは生きている。'];
  var SAY_NEW = '・SAY → 該当キャラの台詞として、引用形式で逐語的に（要約・言い換え・敬体↔常体の変換をしない）';   /* P2c 後の行 */
  var SAY_OLD = '・SAY 入力 → 該当キャラの台詞として、引用形式で逐語的に登場させる\n  (要約・言い換え・敬体↔常体の自動変換は禁止)';   /* v290 の元の 2 行 */
  var RULE = '━━━━━━━━━━━━━━━━━━━━━━━━━';
  function bLine(hero) { return '・この回は台詞の入力が無い。主人公' + (hero ? '〈' + hero + '〉' : '') + 'の台詞を「」でも<say>でも書かない（渡す・頼む・呼びかける行動も、言葉を足さず動作と表情で描く）'; }
  function aSentence(spans) {
    var who = [], q = [];
    spans.forEach(function (s) { q.push('「' + s.text + '」の主語は' + s.who.join('と')); s.who.forEach(function (w) { if (who.indexOf(w) < 0) who.push(w); }); });
    return q.join('、') + '（主人公ではない）。その部分は' + who.join('・') + 'の行動・身に起きることとして書き、主人公に移さない。';
  }

  /* ---------------- 主語の検出（純粋関数） ---------------- */
  var HON = '(?:さん|ちゃん|くん|君|先輩|先生|様)?';
  var PRON_SUBJ = /(?:俺|僕|私|わたし|あたし|自分|主人公|彼女|彼|二人|三人|みんな|全員)(?:たち|ら)?[がは]/;
  /* 関係節（「美羽が持っている鍵を」）: 動詞・形容詞の連体形＋名詞＋格助詞 */
  var REL = /(?:る|た|だ|ない|い)(?:[一-龥々ァ-ヶー]{1,8})(?:を|に|へ|で|と|が|は|も|の)/;
  /* 従属節（「美羽が落ちないように」「美羽が落ちるのを」「美羽が来たと言う」） */
  var SUB = /(?:よう(?:に|な|で)|(?:ない|る|た)よう|ため|ので|(?:る|た|い|だ)から|なら|たら|れば|ても|(?:る|た|の)(?:時|とき)|(?:る|の)前に|(?:た|の)(?:後で|あとで)|(?:る|た)まで|(?:る|た|ている)ところ|(?:る|ている)間に|うちに|(?:る|た|だ|い)と(?:思|言|叫|聞|告|伝|頼|囁|分か|わか|気づ|知)|のを|ことを|ことに|のか|(?:る|た|い)か(?:どうか)?[をが、。]?$|かも)/;
  var NOUN_GA = /[一-龥々ァ-ヶー]{1,8}(?:が|は)/;   /* 後ろの節に新しい主語 */
  function cls(c) { if (!c) return 'x'; if (/[一-龥々]/.test(c)) return 'k'; if (/[ァ-ヶー]/.test(c)) return 'K'; if (/[ぁ-ん]/.test(c)) return 'h'; if (/[A-Za-z0-9]/.test(c)) return 'a'; return 'x'; }
  function esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function maskQuotes(t) {   /* 引用（「」『』“”）の中身を同じ長さの記号に（位置を保つ）。閉じない引用は最後まで */
    var out = '', depth = 0, OPEN = '「『“', CLOSE = '」』”';
    for (var i = 0; i < t.length; i++) {
      var c = t[i];
      if (OPEN.indexOf(c) >= 0) { depth++; out += c; continue; }
      if (depth > 0 && CLOSE.indexOf(c) >= 0) { depth--; out += c; continue; }
      out += depth > 0 ? '＿' : c;
    }
    return out;
  }
  /* 1 つの名前の、境界の合った出現位置（と直後の位置）を返す */
  function findName(m, name, from) {
    var re = new RegExp(esc(name) + HON, 'g'); re.lastIndex = from || 0; var r = [], x;
    while ((x = re.exec(m))) {
      var prev = x.index > 0 ? m[x.index - 1] : '';
      if (prev && cls(prev) !== 'x' && cls(prev) === cls(name[0])) { re.lastIndex = x.index + 1; continue; }   /* 小美羽・バナナ */
      r.push({ at: x.index, end: x.index + x[0].length });
      if (x[0].length === 0) re.lastIndex++;
    }
    return r;
  }
  /* text の中で、主人公以外の登録キャラが「が」で主語になる部分を探す。返り値 { spans:[{who:[名], text, at, end}], why } */
  function detect(text, hero, names) {
    var t = String(text || '');
    if (!t || t.length > 400) return { spans: [], why: t ? 'too-long' : 'empty' };
    var npcs = (names || []).filter(function (n) { return n && n !== hero && n.length >= 1 && n.length <= 12; })
      .sort(function (a, b) { return b.length - a.length; });
    if (!npcs.length) return { spans: [], why: 'no-names' };
    var m = maskQuotes(t);
    /* 出現位置（長い名前を先に。重なりは捨てる） */
    var occ = [];
    npcs.forEach(function (n) { findName(m, n, 0).forEach(function (o) { if (!occ.some(function (p) { return o.at < p.end && p.at < o.end; })) occ.push({ name: n, at: o.at, end: o.end }); }); });
    if (hero) findName(m, hero, 0).forEach(function (o) { if (!occ.some(function (p) { return o.at < p.end && p.at < o.end; })) occ.push({ name: hero, hero: true, at: o.at, end: o.end }); });
    occ.sort(function (a, b) { return a.at - b.at; });
    var spans = [], why = 'no-subject', i;
    for (i = 0; i < occ.length; i++) {
      var o = occ[i]; if (o.hero) continue;
      var who = [o.name], start = o.at, p = o.end;
      /* 「剛と美羽が」: 名前＋と＋名前 … が */
      while (m[p] === 'と' && i + 1 < occ.length && occ[i + 1].at === p + 1 && !occ[i + 1].hero) { i++; who.push(occ[i].name); p = occ[i].end; }
      if (m[p] === 'と' && i + 1 < occ.length && occ[i + 1].at === p + 1 && occ[i + 1].hero) { why = 'with-hero'; i++; continue; }   /* 美羽と蓮が … は主人公も主体＝今のまま */
      var part = m[p];
      if (part !== 'が' && part !== 'は') { if (part === 'も') why = 'topic-mo'; continue; }
      /* 文の終わりまで（。！？改行） */
      var stop = m.slice(p).search(/[。！？!?\n]/); var sEnd = stop < 0 ? m.length : p + stop;
      /* 後ろの節に別の主語（名前＋が/は・代名詞＋が/は・名詞＋が/は）が出たらその手前で切る */
      var rest = m.slice(p + 1, sEnd), cut = sEnd, k;
      for (k = i + 1; k < occ.length; k++) { if (occ[k].at >= sEnd) break; var nx = m[occ[k].end]; if (nx === 'が' || nx === 'は') { cut = Math.min(cut, occ[k].at); break; } }
      var pm = rest.search(PRON_SUBJ); if (pm >= 0) cut = Math.min(cut, p + 1 + pm);
      /* 節の区切り（、 か て/で の後）からの 名詞＋が/は */
      var re2 = /(?:、|て|で)([一-龥々ァ-ヶー]{1,8})(?:が|は)/g, x2;
      while ((x2 = re2.exec(rest))) { var at2 = p + 1 + x2.index + 1; if (at2 < cut) { cut = at2; } break; }
      var body = m.slice(p + 1, cut).replace(/[、，,\s]+$/, '');
      var raw = t.slice(start, p + 1 + body.length);
      if (body.length < 1) { why = 'empty-pred'; continue; }
      if (part === 'は' && body.indexOf('を') < 0) { why = 'topic-wa'; continue; }   /* 「美羽は置いていく」＝目的語の主題化かもしれない。を が無いと証明できない */
      if (REL.test(body.replace(/＿+/g, ''))) { why = 'relative'; continue; }
      if (SUB.test(body)) { why = 'subordinate'; continue; }
      if (raw.length > 60) { why = 'span-too-long'; continue; }
      spans.push({ who: who, text: raw, at: start, end: start + raw.length });
      why = 'ok';
      if (spans.length >= 3) break;
    }
    return { spans: spans, why: spans.length ? 'ok' : why };
  }

  /* ---------------- 本文の書き換え（純粋関数） ---------------- */
  function cnt(h, n) { var c = 0, k = 0; if (!n) return 0; while ((k = h.indexOf(n, k)) >= 0) { c++; k += n.length; } return c; }
  function cut1(s, find, repl) { var i = s.indexOf(find); return i < 0 ? null : s.slice(0, i) + repl + s.slice(i + find.length); }
  function isStorySys(s) { return typeof s === 'string' && s.length > 1500 && s.indexOf('＜あなたの役割＞') >= 0 && s.indexOf('【出力の形式（これだけは形式として守る）】') >= 0; }
  function lineOf(s, mk) { var i = s.indexOf(mk); if (i < 0 || (i > 0 && s[i - 1] !== '\n')) return null; var e = s.indexOf('\n', i); return { at: i, end: e < 0 ? s.length : e, text: s.slice(i, e < 0 ? s.length : e) }; }
  function kindOf(sys, user) {
    if (lineOf(sys, MK_SAY)) return 'SAY';
    if (lineOf(sys, MK_DO)) return 'DO';
    if (lineOf(sys, MK_DIR)) return 'STORY';
    if (/続きを(?:自然に)?進めて/.test(String(user || '')) || sys.indexOf('【続きを書く＝物語を"横"に広げる】') >= 0) return 'CONT';
    return null;
  }
  function userInfo(u) {   /* user の JSON（末尾の逐語反映の前まで）から 入力・登場人物 を読む */
    try {
      var i = u.indexOf('\n\n' + RULE); var j = JSON.parse(i < 0 ? u : u.slice(0, i));
      var ci = j && j.currentInput, cast = j && j.cast;
      var hero = cast && cast.protagonist && typeof cast.protagonist.name === 'string' ? cast.protagonist.name : '';
      var npcs = cast && Array.isArray(cast.npcs) ? cast.npcs.map(function (n) { return n && typeof n.name === 'string' ? n.name : ''; }).filter(Boolean) : [];
      return { type: ci && ci.type || null, text: ci && typeof ci.text === 'string' ? ci.text : null, hero: hero, npcs: npcs };
    } catch (e) { return null; }
  }
  function sysNames(sys) {   /* 【話者】の「登録名の表記そのまま…：蓮／美羽／沙耶／剛。」 */
    var m = sys.match(/登録名の表記そのまま（空白も含めて）書く：([^\n。]{1,200})。/);
    return m ? m[1].split('／').map(function (x) { return x.trim(); }).filter(Boolean) : [];
  }

  /* sys / user を書き換える。返り値 { sys, user, ops:[], why } */
  function rewrite(sys, user, fl) {
    var ops = [], why = { a: null, b: null };
    fl = fl || flags();
    if (!isStorySys(sys) || typeof user !== 'string') return { sys: sys, user: user, ops: ops, why: { a: 'not-story', b: 'not-story' }, kind: null };
    var kind = kindOf(sys, user), s = sys, u = user, r;
    var info = userInfo(user);
    var hero = (info && info.hero) || '';
    /* ---- (a) ---- */
    if (!fl.a) why.a = 'off';
    else if (kind !== 'DO' && !(kind === 'STORY' && fl.as)) why.a = kind === 'STORY' ? 'story-off' : 'kind';
    else if (!info || !info.text || (info.type && info.type !== kind)) why.a = 'no-input';
    else {
      var L = lineOf(s, kind === 'DO' ? MK_DO : MK_DIR);
      var shown = info.text.slice(0, 80);
      if (!L || L.text.indexOf('「' + shown + '」') < 0) why.a = 'line-mismatch';
      else {
        var names = info.npcs.slice(); sysNames(s).forEach(function (n) { if (names.indexOf(n) < 0) names.push(n); });
        var d = detect(info.text, hero, names);
        if (!d.spans.length) why.a = d.why;
        else {
          var add = aSentence(d.spans), nl;
          if (kind === 'DO') {
            if (cnt(L.text, DO_OLD) !== 1) why.a = 'do-tail-missing';
            else {
              var heroPart = (info.text.slice(0, d.spans[0].at) + info.text.slice(d.spans[d.spans.length - 1].end)).replace(/[、。！？!?\s「」]/g, '').length >= 3;
              nl = L.text.replace(DO_OLD, (heroPart ? DO_KEEP : '') + add);
            }
          } else {
            if (cnt(L.text, DIR_AT) !== 1) why.a = 'dir-tail-missing';
            else nl = L.text.replace(DIR_AT, DIR_AT + add);
          }
          if (nl) { s = s.slice(0, L.at) + nl + s.slice(L.end); ops.push(kind === 'DO' ? 'a_do' : 'a_story'); why.a = 'ok:' + d.spans.length; }
        }
      }
    }
    /* ---- (b) ---- */
    if (!fl.b) why.b = 'off';
    else if (kind !== 'DO' && kind !== 'STORY' && kind !== 'CONT') why.b = 'kind';
    else {
      var BL = bLine(hero);
      if (u.indexOf(BL) >= 0) why.b = 'already';
      else {
        if (cnt(u, SAY_NEW) === 1) { u = cut1(u, SAY_NEW, BL); ops.push('b_user'); }
        else if (cnt(u, SAY_OLD) === 1) { u = cut1(u, SAY_OLD, BL); ops.push('b_user_old'); }
        else { var k2 = u.lastIndexOf('\n' + RULE); if (k2 >= 0 && k2 > u.length - 40) { u = u.slice(0, k2) + '\n' + BL + u.slice(k2); ops.push('b_user_ins'); } else { u = u + '\n' + BL; ops.push('b_user_end'); } }
        if (cnt(s, B_SYS_RM) === 1) { s = cut1(s, B_SYS_RM, ''); ops.push('b_sys_rm'); }
        if (cnt(s, B_SYS_RW[0]) === 1) { s = cut1(s, B_SYS_RW[0], B_SYS_RW[1]); ops.push('b_sys_rw'); }
        why.b = 'ok';
      }
    }
    return { sys: s, user: u, ops: ops, why: why, kind: kind };
  }

  var LAST = null, stats = { seen: 0, changed: 0, a: 0, b: 0, err: 0, aWhy: {} };
  function rewriteBody(body, stringify) {
    var fl = flags();
    if ((!fl.a && !fl.b) || typeof body !== 'string' || body.length < 2000) return body;
    if (body.indexOf('＜あなたの役割＞') < 0 && body.indexOf('\\uFF1C') < 0) return body;
    var b = JSON.parse(body);
    if (!b || !Array.isArray(b.messages) || !b.messages.length) return body;
    var si = -1, ui = -1, i;
    for (i = 0; i < b.messages.length; i++) { var m = b.messages[i]; if (m && m.role === 'system' && typeof m.content === 'string') { si = i; break; } }
    if (si < 0 || !isStorySys(b.messages[si].content)) return body;
    for (i = b.messages.length - 1; i > si; i--) { var x = b.messages[i]; if (x && x.role === 'user' && typeof x.content === 'string') { ui = i; break; } }
    if (ui < 0) return body;
    stats.seen++;
    var s0 = b.messages[si].content, u0 = b.messages[ui].content, r = rewrite(s0, u0, fl);
    var wa = String(r.why.a || '').split(':')[0]; stats.aWhy[wa] = (stats.aWhy[wa] || 0) + 1;
    LAST = { t: Date.now(), kind: r.kind, ops: r.ops.slice(), whyA: r.why.a, whyB: r.why.b, dSys: r.sys.length - s0.length, dUser: r.user.length - u0.length };
    if (r.sys === s0 && r.user === u0) return body;
    b.messages[si].content = r.sys; b.messages[ui].content = r.user;
    stats.changed++; if (r.ops.some(function (o) { return o[0] === 'a'; })) stats.a++; if (r.ops.some(function (o) { return o[0] === 'b'; })) stats.b++;
    return (stringify || JSON.stringify)(b);
  }

  /* ---- fetch 境界 ---- */
  var of = G.fetch;
  if (typeof of === 'function') {
    var wrapped = function (u, o) {
      try {
        if (o && o.method === 'POST' && typeof o.body === 'string' && /workers\.dev|openrouter/.test(String(u))) {
          var nb = rewriteBody(o.body);
          if (nb !== o.body) o = Object.assign({}, o, { body: nb });
        }
      } catch (e) { stats.err++; try { console.warn(TAG, 'skipped:', e && e.message); } catch (_) {} }
      return of.apply(this, [u, o]);
    };
    try { Object.keys(of).forEach(function (k) { wrapped[k] = of[k]; }); } catch (e) {}
    wrapped.__fACTOR1 = true;
    G.fetch = wrapped;
  }

  G.__v292DfixACTOR1 = {
    VER: VER, detect: detect, rewrite: rewrite, rewriteBody: rewriteBody, flags: flags, aSentence: aSentence, bLine: bLine,
    status: function () { return { ver: VER, flags: flags(), last: LAST ? JSON.parse(JSON.stringify(LAST)) : null, stats: JSON.parse(JSON.stringify(stats)) }; }
  };
  try { console.log(TAG, 'armed', VER); } catch (e) {}
})();
