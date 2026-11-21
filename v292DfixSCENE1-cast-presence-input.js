/* =====================================================================
 * v292DfixSCENE1-cast-presence-input.js — SCENE1（GPT #127-WN 優先2・2026-11-22・既定 OFF）
 *   ※ 2026-11-11 の laneSCENE1（NOW1・FACTS2・STATE2）とは別物。名前が同じなのは裁定の呼び名に合わせたため。
 * ---------------------------------------------------------------------
 * a. 未登場の登録 NPC を「既出」から分けて渡す（A2）
 *    ・既出 = 主人公／fix95 の appeared 印がある／名前が どれかのターンの本文・入力・会話ログ、今回の入力、始まりの条件・舞台の説明 に出ている。
 *      これらが読めないときは全員を既出とする（未登場と決めつけない＝今の動き）。名前は登録名そのままで照合する（自動の名寄せはしない）。
 *    ・【キャラ属性】（fix379 genderBlock）: 既出の人だけを今の書式で並べ、未登場の人は同じ欄の後ろに
 *      「登録済みで、まだ本文に出ていない人物: 名前(性別・年代)…」と並べる。性別・年代は確定値（gender 欄・FLW4 の年齢）だけ。空なら名前だけ。
 *    ・【話者】（fix459 blockA の who の一覧＝本番で【呼称の固定】の代わりに届いている所）と【呼称の固定】（fix445・fix459 を止めたときに届く）も同じ分け方。
 *    ・説明文（desc）は足さない。禁止の文は足さない。
 * b. 退出の判定を広げる（NPRES・PLACE1・fix333）
 *    ・本文（かっこの中を除く）で「名＋は/が/も …（て・で・読点をまたいでよい・ほかの主語の は/が/も はまたがない）… 退出の語」
 *      （戻った/戻って・帰った・引き上げた・出て行った・部屋/店/裏口…を出た・立ち去った・去った・退出・退室・席を外した・姿を消した・
 *       追い出された・締め出された／「名を追い出した・締め出した」）。仮定・否定・意思（〜そう・〜よう・〜ふり 等）は数えない。
 *    ・戻りは、後の本文の「名が 戻ってきた・入ってきた・合流した・追いついた・現れた…」（声だけ・期待・仮定は除く）か、
 *      SAY の入力の呼びかけ（文頭の「名、」）だけ＝PLACE1 の既存の解除の条件と同じ形。名前が出ただけ・「戻った」の字だけでは戻りにしない。
 *    ・PLACE1 の「その場にいない人」の行: 本文で確認できた退出を足す（経路は本文に書かれていたものだけ。無ければ書かない）。
 *    ・fix333 の前面の人物: 上の退出と PLACE1 の不在の行の人を外す。NPRES が ON なら、退出の文を強い不在として数え、戻りも上の条件に合わせる。
 *    ・新しい状態の台帳は作らない（毎回ターンの本文から作り直す・保存しない）。NPRES・MEM2 が OFF でも効く。
 * c. 入力の種類で、展開を動かす欄を分ける
 *    ・【NPCの登場】（fix306）・【展開の推進ルール】（fix309）・【この場面の種】（fix192）は「続きを書く」のときだけ入れる。
 *    ・DO・SAY・STORY のとき、前面の人物は、本文か会話ログで一度でもその場に出たことのある人に限る（加えて b の退出・不在を外す）。
 *    ・「続きを書く」は UI のボタンが渡す識別値（cont() → begin の k='cont'）で決める。生成し直すは元のターンの印（turn.inputKind）を引き継ぐ。
 *      識別値の無い古い経路の保険としてだけ、STORY の入力が「続きを自然に進めてください。」のときを「続きを書く」とする（件数を数える）。
 * 鍵: ON は端末の localStorage v292DfixSCENE1On='1'（既定 OFF）。kill v292DfixSCENE1Off='1'（常に勝つ）。部分 OFF: v292DfixSCENE1aOff / bOff / cOff。
 *     どれも呼ばれるたびに評価。OFF・kill のとき、呼ぶ側の結果は土台と 1 バイトも同じ（この部品は null・false・'' を返すだけ）。
 * 書かないもの: localStorage・サーバー・S（例外: c が ON の「続きを書く」のターンに turn.inputKind='cont' を 1 つ付ける＝生成し直すのため）。
 * stats は件数と理由だけ（名前・本文は入れない）。sys の字数の増減も数で持つ。
 * ===================================================================== */
(function (root) {
  'use strict';
  if (root.__v292DfixSCENE1) return;
  var VER = 'scene1-20261122-r4';
  var CONT_TEXT = '続きを自然に進めてください。';
  function ls(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } }
  function on() { return ls('v292DfixSCENE1Off') !== '1' && ls('v292DfixSCENE1On') === '1'; }
  function aOn() { return on() && ls('v292DfixSCENE1aOff') !== '1'; }
  function bOn() { return on() && ls('v292DfixSCENE1bOff') !== '1'; }
  function cOn() { return on() && ls('v292DfixSCENE1cOff') !== '1'; }
  function getS() { try { return root.__chronicleGetState ? root.__chronicleGetState('scene1') : (root.S || null); } catch (e) { return null; } }
  function str(x) { return x == null ? '' : String(x); }
  function sp(x) { return str(x).replace(/[\s　]/g, ''); }
  function esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  var ST = { builds: 0, fgCalls: 0, aAttr: 0, aSpeaker: 0, aLock: 0, aUnappeared: 0, aUnknown: 0, bExits: 0, bExitsInput: 0, bBacks: 0, bBackWhy: { heroMoved: 0, input: 0, speaker: 0, back: 0, withHero: 0, acts: 0 }, bStale: 0, aMaybe: 0, bPlaceLines: 0, bFgOut: 0, bNpres: 0,
    cSkip: { '306': 0, '309': 0, '192': 0 }, cTenkai: { T1: 0, T2: 0, chars: 0 }, cFgOut: 0, cKind: { cont: 0, DO: 0, SAY: 0, STORY: 0, unknown: 0 }, cLegacy: 0, cMarked: 0, cRetry: 0,
    sysDelta: { attr: 0, speaker: 0, lock: 0 }, errors: 0 };
  function err() { ST.errors++; }

  /* ---------------- 入力の種類（c） ---------------- */
  var CUR = null;   /* begin〜end の間だけ（1 回の組み立て） */
  function begin(mode, text) { if (!on()) { CUR = null; return; } var k = str(root.__v292DfixSCENE1Kind); CUR = { m: str(mode).toUpperCase(), t: str(text), k: k }; ST.builds++; }
  var LAST = null;   /* 直前の組み立て（fix333 は組み立ての後、送る直前に前面の人物を決めるため。同じターン数・60 秒以内だけ使う） */
  function turnsLen() { try { var S = getS(); return S && Array.isArray(S.turns) ? S.turns.length : -1; } catch (e) { return -1; } }
  function end() { if (CUR) LAST = { m: CUR.m, t: CUR.t, k: CUR.k, at: Date.now(), n: turnsLen() }; CUR = null; }
  function kindOf(X) {
    if (!X) return '';
    if (X.k === 'cont') return 'cont';
    if (!X.k && X.m === 'STORY' && X.t.trim() === CONT_TEXT) { return 'cont-legacy'; }   /* 識別値の無い古い経路の保険 */
    return X.m;
  }
  function kind() { return kindOf(CUR); }
  function kindLate() { if (CUR) return kindOf(CUR); if (LAST && Date.now() - LAST.at < 60000 && LAST.n === turnsLen()) return kindOf(LAST); return ''; }
  function kindCounted() { var k = kindLate(); if (k === 'cont-legacy') { ST.cLegacy++; k = 'cont'; } return k; }
  /* fix306 / fix309 / fix192 seedBlock が聞く: true なら、その欄を入れない */
  function skipPush(which) {
    try { if (!cOn() || !CUR) return false; var k = kind(); if (k === 'cont' || k === 'cont-legacy' || !k) return false;
      if (ST.cSkip[which] !== undefined) ST.cSkip[which]++; return true; } catch (e) { err(); return false; }
  }
  /* ★r2（判断 1）: 【展開】の欄の中で「AI が自分から場面を動かす」文だけを、DO・SAY・STORY のターンで外す（禁止の文に置き換えない・何も足さない）。
     対象（この 2 つだけ・ほかの文は残す）:
       T1 PRUNE1 の差し替え後の「毎ターン、場面を一つ動かす。」（14 字。同じ行の「危機の最中は…その危機そのものを動かす」は残す＝危機への反応の文）
       T2 fix459 の元の「・毎ターン、まだ出していないものを一つ動かす（手がかり・危険・感情の変化・物音や気配・移動・時間経過）。」（PRUNE1 が無いときの形・1 行ごと）
     残す文: 「直前のターンと同じモチーフの繰り返しで場面を埋めない」（繰り返しの防止）・「説明を長く続けず、行動・会話…で前へ進める」（書き方）・
       【展開を前に進める（進行エンジン）】（入力の直後を描き結果を一つ出す＝入力を尊重して結果を描く文）・衝突の順位の文。 */
  var TK1 = '毎ターン、場面を一つ動かす。', TK2 = '・毎ターン、まだ出していないものを一つ動かす（手がかり・危険・感情の変化・物音や気配・移動・時間経過）。';
  function tenkaiCut(sys) {
    try {
      if (!cOn() || typeof sys !== 'string') return null; var k = kindLate(); if (!(k === 'DO' || k === 'SAY' || k === 'STORY')) return null;
      var i = sys.indexOf('【展開】'); if (i < 0) return null; var j = sys.indexOf('\n【', i + 1); if (j < 0) j = sys.length;
      var blk = sys.slice(i, j), nb = blk;
      if (nb.indexOf('・' + TK1) >= 0) { nb = nb.replace('・' + TK1, '・'); ST.cTenkai.T1++; ST.cTenkai.chars += TK1.length; if (/・\n/.test(nb)) nb = nb.replace(/・\n/, ''); }
      if (nb.indexOf(TK2) >= 0) { var r = nb.replace(TK2 + '\n', ''); if (r === nb) r = nb.replace(TK2, ''); ST.cTenkai.chars += nb.length - r.length; nb = r; ST.cTenkai.T2++; }
      if (nb === blk) return null;
      return sys.slice(0, i) + nb + sys.slice(j);
    } catch (e) { err(); return null; }
  }
  /* UI: 「続きを書く」のターンに印（生成し直すのため）。生成し直すでは元の印を引き継ぐ */
  function markCont(turn) { try { if (!cOn() || !turn || typeof turn !== 'object') return; turn.inputKind = 'cont'; ST.cMarked++; } catch (e) { err(); } }
  function retryKind(turn) {
    try { if (!cOn() || !turn) return ''; var k = '';
      if (turn.inputKind === 'cont') k = 'cont';
      else if (turn.inputKind === undefined && str(turn.inputType).toUpperCase() === 'STORY' && str(turn.playerText).trim() === CONT_TEXT) { k = 'cont'; ST.cLegacy++; }
      if (k) ST.cRetry++; return k; } catch (e) { err(); return ''; }
  }

  /* ---------------- 既出・未登場（a） ---------------- */
  /* ★r3（レビュー (3) a）: キャラ一覧が「登場したか」を見る照合（fix145 findLastTurnForName＝完全名の素の一致・会話ログを含む／fix529b
     findLastTurnAsPerson＝空白・中黒で分けた名前の部分と別名台帳〔QuasiPack.aliasMap〕の呼び名を、前後の文字を見て人の名前として）と、
     NPRES・CP1 と同じ名前の形（rawForms: 空白の無い 3〜5 字の名前は 姓・名 の候補）を、そのまま読むだけ使う。
     どれか 1 つでも当たれば「出たかもしれない」＝既出。同じ形を持つ登録キャラがほかに居ても、両方を既出にする（未登場と決めつけない側）。
     確かに一度も当たらない人だけを未登場にする。照合は読むだけ・保存しない（名寄せの台帳は作らない）。 */
  var PRE_BAD = /[一-鿿゠-ヿｦ-ﾝーA-Za-z0-9０-９ａ-ｚＡ-Ｚ]/;
  var POST_OK = /[\s　」』）)】\]〉》〕｝}・…—―、。，．！？!?:：;；\n\r]/;
  var POST_PARTICLE = /^(?:は|が|を|に|へ|と|も|で|の|や|ね|よ|か|から|まで|より|こそ|さえ|しか|だけ|さん|ちゃん|くん|君|様|さま|殿|氏|先輩|先生|たち|達|ら)/;
  function asPerson(text, name) {   /* = fix145 findLastTurnAsPerson の usedAsPerson */
    if (!text || !name) return false; var s = String(text), i = s.indexOf(name);
    while (i >= 0) { var before = i === 0 ? '' : s.charAt(i - 1), rest = s.slice(i + name.length);
      if ((before === '' || !PRE_BAD.test(before)) && (rest === '' || POST_OK.test(rest.charAt(0)) || POST_PARTICLE.test(rest))) return true;
      i = s.indexOf(name, i + 1); }
    return false;
  }
  function rawForms(name) {   /* = NPRES / CP1 rawForms（読むだけの写し） */
    var n = str(name).trim(), out = []; if (!n) return out; out.push(n);
    var parts = n.split(/[\s　・]+/).filter(Boolean);
    if (parts.length > 1) { parts.forEach(function (p) { if (p.length >= 2) out.push(p); }); return out; }
    var L = n.length;
    if (L === 3) { out.push(n.slice(1)); out.push(n.slice(0, 2)); } else if (L === 4) { out.push(n.slice(0, 2)); out.push(n.slice(2)); } else if (L >= 5) { out.push(n.slice(0, 2)); out.push(n.slice(-3)); out.push(n.slice(-2)); }
    return out.filter(function (f) { return f.length >= 2; });
  }
  function aliasesOf(name) { var out = []; try { var Q = root.__v292QuasiPack; if (Q && typeof Q.aliasMap === 'function') { var am = Q.aliasMap() || {}; Object.keys(am).forEach(function (a) { if (am[a] === name && a && a !== name) out.push(a); }); } } catch (e) {} return out; }
  function maybeAppeared(name, ctx, whos) {
    var full = str(name).trim(), nos = sp(full);
    if (ctx.indexOf(full) >= 0 || (nos && ctx.indexOf(nos) >= 0)) return 'full';                      /* fix145: 完全名の素の一致（空白を除いた形も） */
    var fs = rawForms(full).concat(aliasesOf(full)).filter(function (f) { return f !== full; });
    for (var i = 0; i < fs.length; i++) { if (whos[fs[i]] || whos[sp(fs[i])]) return 'who'; if (asPerson(ctx, fs[i])) return 'part'; }   /* 姓・名・別名・会話ログの話者 */
    if (whos[full] || whos[nos]) return 'who';
    return '';
  }
  function turnText(t) {
    if (!t) return ''; var s = str(t.narrative) + '\n' + str(t.playerText);
    var cs = t._convSays; if (Array.isArray(cs)) cs.forEach(function (c) { if (c) s += '\n' + str(c.who) + '\n' + str(c.say); });
    return s;
  }
  /* { appeared: {name:1}, list: [npc...] } または null（判定できない＝呼ぶ側は今のまま） */
  function appearance(S) {
    try {
      S = S || getS(); if (!S || !S.cast || !Array.isArray(S.turns)) { ST.aUnknown++; return null; }
      var roster = root.__v292Dfix95Roster; var npcs = Array.isArray(roster) && roster.length ? roster : (Array.isArray(S.cast.npcs) ? S.cast.npcs : []);
      var sc = S.scene || {}, ctx = [str(sc.startCondition), str(sc.startRules), str(sc.lore), str(sc.obj), str(sc.loc), CUR ? CUR.t : ''].join('\n'), whos = {};
      for (var i = 0; i < S.turns.length; i++) { var t = S.turns[i]; ctx += '\n' + turnText(t); if (t && Array.isArray(t._convSays)) t._convSays.forEach(function (c) { if (c && c.who) { whos[str(c.who).trim()] = 1; whos[sp(c.who)] = 1; } }); }
      var ap = {};
      npcs.forEach(function (n) { if (!n || !n.name) return; var nm = str(n.name).trim(); var why = n.appeared === true ? 'mark' : maybeAppeared(nm, ctx, whos); if (why) { ap[nm] = 1; if (why === 'part' || why === 'who') ST.aMaybe++; } });
      return { appeared: ap, npcs: npcs };
    } catch (e) { err(); return null; }
  }
  function confirmedSuffix(n) {   /* 性別・年代の確定値だけ（gender 欄と FLW4 の年齢）。無ければ '' */
    var g = str(n.gender).trim(), a = '';
    try { var F = root.__v292DfixFLW4; if (F && typeof F.suffix === 'function') a = str(F.suffix(n)).replace(/^・/, ''); } catch (e) {}
    var p = [g, a].filter(Boolean); return p.length ? '(' + p.join('・') + ')' : '';
  }
  /* fix379 genderBlock の代わり（未登場がいないとき・判定できないときは null＝今の文のまま） */
  function attrBlock(S) {
    try {
      if (!aOn()) return null; S = S || getS(); var A = appearance(S); if (!A) return null;
      var un = A.npcs.filter(function (n) { return n && n.name && !A.appeared[str(n.name).trim()]; });
      if (!un.length) return null;
      var parts = [], h = S.cast.hero, F = root.__v292DfixFLW4;
      if (h && h.gender && (h.name || '').length) parts.push(h.name + '(主人公)=' + h.gender);
      A.npcs.forEach(function (n) { if (n && n.name && n.gender && A.appeared[str(n.name).trim()]) parts.push(n.name + '=' + n.gender + (F && typeof F.suffix === 'function' ? F.suffix(n) : '')); });
      var t = parts.length ? '\n【キャラ属性】' + parts.join('、') + '。各キャラの一人称・言葉遣い・地の文の代名詞(彼/彼女)は、この性別と人物像に必ず一致させる。' : '\n【キャラ属性】';
      t += '登録済みで、まだ本文に出ていない人物: ' + un.map(function (n) { return str(n.name).trim() + confirmedSuffix(n); }).join('、') + '。';
      ST.aAttr++; ST.aUnappeared += un.length; return t;
    } catch (e) { err(); return null; }
  }
  function noteDelta(which, before, after) { try { ST.sysDelta[which] += (str(after).length - str(before).length); } catch (e) {} }
  /* fix459 blockA・fix445 の一覧: names を { a: 既出, u: 未登場 } に分ける（未登場がいなければ null） */
  function split(names) {
    try {
      if (!aOn() || !Array.isArray(names)) return null; var S = getS(), A = appearance(S); if (!A) return null;
      var reg = {}; A.npcs.forEach(function (n) { if (n && n.name) reg[str(n.name).trim()] = n; });
      var a = [], u = [];
      names.forEach(function (x) { var k = str(x).trim(); if (reg[k] && !A.appeared[k]) u.push(k); else a.push(x); });
      if (!u.length) return null; return { a: a, u: u, reg: reg };
    } catch (e) { err(); return null; }
  }
  function speakerList(cast) {   /* fix459 blockA: '：' + 一覧 の部分を作る。null なら呼ぶ側は今のまま */
    var r = split(cast); if (!r) return null;
    var before = '：' + cast.join('／'), after = (r.a.length ? '：' + r.a.join('／') : '') + '（登録済み・まだ本文に出ていない人物：' + r.u.join('／') + '）';
    ST.aSpeaker++; noteDelta('speaker', before, after); return after;
  }
  function lockSplit(names) {   /* fix445: { a, extra }。extra は未登場の一文 */
    var r = split(names); if (!r) return null;
    var extra = '登録済み・まだ登場していない人物: ' + r.u.map(function (k) { return k + confirmedSuffix(r.reg[k]); }).join('、') + '。';
    ST.aLock++; return { a: r.a, extra: extra };
  }

  /* ---------------- 退出・戻り（b） ---------------- */
  /* ★r3（レビュー (3) b）: 確かでない退出は書かない側へ倒す。退出と認めるのは次を全部満たす文だけ:
       ・主語がその人物だけ（名＋は/が/も の前が「と・や・、」でない。文に主人公の名前・二人・一緒・共に・揃って 等が無い）
       ・否定（〜ず・〜ない・〜なかった）・仮定・意思・回想（昔・かつて・以前・十年前・あの日・あの頃・当時・〜ことがある 等）でない・かっこの中でない
       ・同じ文の後ろと次の文に、その人が戻る・場に留まる記述（入ってきた・戻ってきた・すぐに・いる・座って・残って 等）が無い
     戻り（いない、を解く）: 後のターンで
       ・その人が話者（会話ログの who）になった
       ・地の文でその人が主語になり、移動・退出でない動作をしている（声だけ・電話・話題・回想・遠くは除く）
       ・戻る・入ってくる・現れる類の記述／主人公と一緒に動いた（「湊と灯里は…」）
       ・主人公が場所を移った（CP1 の場面の移動・PLACE1 の主人公の現在地の行が変わった）＝「この場」が変わるので、その前の退出は全部外す
       ・利用者の入力（DO・STORY）がその人をこの場に来させた（名前＋来る・入る・現れる・戻る・下りる 等）
       名前が出ただけ（話題に出る・思い出す・SAY で呼ぶ）では解かない。
     どれも当たらないまま 6 ターンたったら、行を外す（「いない」と言い切らない・前面の人物の扱いは今の判定に戻す）。 */
  var STALE_TURNS = 6;
  var HON = '(?:先輩|せんぱい|さん|くん|君|ちゃん|様|さま|氏|先生)?';
  var GAPX = '[^。！？!?\\n「」『』\u0001はがも]{0,40}?';
  var EXIT_V = '(?:(?:へ|に|の方へ)(?:戻っ|帰っ|引き上げ|引き揚げ)(?!て(?:き|来|く|こ))(?:た|て)|(?:帰って|戻って|下りて|降りて)(?:行っ|いっ)(?:た|て)|出て(?:行っ|いっ)(?:た|て|てしまっ)|(?:部屋|自室|店|家|外|廊下|裏口|玄関|戸口|屋敷|教室|事務所)(?:を|から)出(?:た|て)(?!き|来|い(?:か|け))|立ち去(?:った|って)|去っ(?:た|て)(?!き|来)|去っていっ(?:た|て)|退出し(?:た|て)|退室し(?:た|て)|席を外し(?:た|て)|姿を消し(?:た|て)|(?:追い出され|追放され|締め出され|放り出され|連れ出され)(?:た|て))';
  var OBJ_V = '(?:追い出し|追放し|締め出し|放り出し|押し出し|追い返し|外へ出し|外に出し)(?:た|て|、|$)';
  var INROOM = /(?:席|レジ|机|椅子|カウンター|ソファ|窓辺|窓際|壁際|隅|奥|そば|脇|横|前|後ろ|元の場所|元の位置|定位置|持ち場|作業|仕事|話|本題|手元|視線|顔|調子|笑顔|表情|自分|正気|我|意識)$/;
  /* ★r4（実 AI の比較 42 本で b が一度も働かなかった真因: 退出の検出が AI の本文だけを読み、利用者の DO・STORY 入力に書かれた退出を読んでいなかった）:
     利用者の DO・STORY 入力も、本文と同じ規則（主語がその人だけ・否定／仮定／回想／かっこの中は除く・同じ文と次の文で戻る・留まるなら除く）で読む。
     入力は「戻る・出ていく・立ち去る」のような言い切りの形でも書かれるので、その形を足す。SAY は読まない（台詞の中身は命令や希望であり得る）。
     依頼・希望・意思（〜よう頼む・〜てほしい・〜たい・〜させる 等）は退出にしない。 */
  var EXIT_V_IN = '(?:(?:へ|に|の方へ)(?:戻る|帰る|引き上げる|引き揚げる)|(?:帰って|戻って|下りて|降りて)(?:行く|いく)|出て(?:行く|いく)|(?:部屋|自室|店|家|外|廊下|裏口|玄関|戸口|屋敷|教室|事務所)(?:を|から)出る|立ち去る|去る|去っていく|退出する|退室する|席を外す|姿を消す|(?:追い出され|追放され|締め出され|放り出され|連れ出され)る)';
  var OBJ_V_IN = '(?:追い出す|追放する|締め出す|放り出す|押し出す|追い返す|外へ出す|外に出す)';
  var IRREAL_IN = /よう(?:に)?(?:頼|言|促|告|伝|お願|命じ)|てほしい|て欲しい|てもらう|させる|させて|たい|たがる|ようとする|しようと|かどうか|ないか|[？?]/;
  var EXCOUNT = {};   /* 退出を確定した (人, ターン) を 1 回だけ数える（メモリだけ・保存しない） */
  var IRREAL = /かもしれ|だろう|ような|ように|ようと|そうに|そうだ|ふり|つもり|たら|なら|れば|はず|夢|想像|回想|思い出|電話|画面/;
  var PAST = /昔|かつて|以前|その頃|あの頃|あの日|あの時|当時|幼い頃|子供の頃|子どもの頃|若い頃|年前|ヶ月前|か月前|カ月前|ことがある|ことがあった|ていた頃|だった頃/;
  var NEG_AFTER = /^[^。、]{0,6}(?:ず|ずに|ない|なかった|ません|まい)/;
  var GROUP = /二人|ふたり|三人|みんな|全員|一緒|共に|ともに|揃って|そろって|連れ立|並んで|一同|皆で/;
  var BACK = /(?:戻ってく|戻ってき|戻って来|帰ってき|帰って来|引き返してき|引き返して来|追いつい|追い付い|合流し|合流す|入ってき|入って来|駆け込んでき|駆けつけ|駆け付け|姿を見せ|姿を現|現れ|下りてき|降りてき|下りて来|降りて来|上がってき|上がって来|顔を出)/;
  var STAY = /すぐに|すぐ|まだ|残って|残った|残る|いる|居る|座って|座った|立って|待って|留ま|とどま/;
  var NOT_BACK = /(?:声|聞こえ|電話|待|はず|だろう|かもしれ|ように|たら|なら|れば|写真|向こう|遠く|映って|映る)/;
  var REMOTE = /声|聞こえ|電話|通話|画面|写真|手紙|思い出|回想|夢|噂|のこと|について|の話|向こう|遠く|二階から|階上|階下|外から|窓の外/;
  var MOVE_OUT = /出て|出た|去っ|立ち去|帰っ|戻っ|離れ|向かっ|行っ|いっ|消え/;
  var IN_ARRIVE = /(?:来る|来て|来た|くる|きて|きた|入って|入る|現れ|戻って|戻る|下りて|降りて|やって|合流|顔を出|姿を見せ|連れて)/;
  function maskQ(s) {
    var a = String(s).split(''), st = [];
    for (var i = 0; i < a.length; i++) { var ch = a[i];
      if (ch === '「' || ch === '『') st.push(i);
      else if ((ch === '」' || ch === '』') && st.length) { var o = st.pop(); if (!st.length) for (var j = o; j <= i; j++) if (!/[。！？!?\n]/.test(a[j])) a[j] = '\u0001'; } }
    return a.join('');
  }
  function plain(narr) { var t = Array.isArray(narr) ? narr.join('\n') : str(narr); t = t.replace(/<say\b[^>]*>[\s\S]*?<\/say>/g, '「」').replace(/<[^>]*>/g, ' '); return maskQ(t); }
  function sents(s) { return String(s || '').split(/[。！？!?\n]/).filter(function (x) { return x.trim(); }); }
  function heroForms() { try { var S = getS(); var h = S && S.cast && S.cast.hero && S.cast.hero.name; return h ? [str(h).trim(), sp(h)].concat(rawForms(h)) : []; } catch (e) { return []; } }
  function hasAny(sent, fs) { for (var i = 0; i < fs.length; i++) if (fs[i] && sent.indexOf(fs[i]) >= 0) return true; return false; }
  /* sent の中のその人の退出 → { route } | null。next = 次の文（留まる・戻るの確認用。無ければ ''） */
  function exitIn(sent, forms, next, hero, isInput) {
    if (!sent || IRREAL.test(sent) || PAST.test(sent) || (isInput && IRREAL_IN.test(sent))) return null;
    var hf = hero || heroForms(); if (GROUP.test(sent)) return null;   /* 主語がその人物だけ（二人・一緒 等があれば退出にしない） */
    for (var i = 0; i < forms.length; i++) { var f = forms[i]; if (!f || sent.indexOf(f) < 0) continue;
      var re = new RegExp(esc(f) + HON + '(?:は|が|も)(' + GAPX + ')(' + (isInput ? EXIT_V + '|' + EXIT_V_IN : EXIT_V) + ')'), m = re.exec(sent), hit = null;
      if (m) { var pre = m.index > 0 ? sent.charAt(m.index - 1) : ''; if (/[とや・]/.test(pre) || hasAny(m[1], hf)) continue;   /* 「湊と灯里は」「灯里は湊と…」は主人公と一緒 */
        if (/^(?:へ|に|の方へ)/.test(m[2])) { var dst = /([^、\s]{1,12})$/.exec(str(m[1])); if (!dst || INROOM.test(dst[1])) continue; }   /* 「席に戻った」「仕事に戻った」は退出ではない */
        hit = { route: route(m[1], m[2]), end: m.index + m[0].length }; }
      else { var o = new RegExp(esc(f) + HON + 'を' + GAPX + (isInput ? '(?:' + OBJ_V + '|' + OBJ_V_IN + ')' : OBJ_V)).exec(sent); if (o) hit = { route: '', end: o.index + o[0].length }; }
      if (!hit) continue;
      var tail = sent.slice(hit.end);
      if (NEG_AFTER.test(tail)) continue;                                  /* 出ていかず・戻らない */
      if (BACK.test(tail) || /すぐ/.test(tail)) continue;                  /* 同じ文の中で戻る */
      if (next && hasAny(next, forms) && (BACK.test(next) || STAY.test(next))) continue;   /* 次の文で留まる・戻る */
      if (next && /^(?:今は|いまは)?[^。]{0,8}(?:ここに|この場に)(?:いる|居る)/.test(next)) continue;
      return { route: hit.route };
    }
    return null;
  }
  function route(gap, verb) {   /* 本文に書かれた経路だけ。行き先「〜へ戻った」・出口「〜から出た」。無ければ '' */
    var g = str(gap).replace(/^[、\s]+/, ''), v = str(verb);
    var dest = /([^、\s]{1,12})$/.exec(g);
    if (/^(?:へ|に|の方へ)/.test(v)) { var p = dest ? dest[1].replace(/^.*(?:て|で|、)/, '') : ''; return p ? p + v.replace(/(?:た|て)$/, 'た').replace(/る$/, 'った').replace(/っった$/, 'った').replace(/^(?:の方へ|に)/, 'へ').replace(/引き上げった$/, '引き上げた').replace(/引き揚げった$/, '引き揚げた') : ''; }
    var fr = /([^、\s]{1,12})から$/.exec(g); if (fr && /^出て/.test(v)) return fr[1].replace(/^.*(?:て|で)/, '') + 'から出た';
    var ex = /^((?:部屋|自室|店|家|外|廊下|裏口|玄関|戸口|屋敷|教室|事務所)(?:を|から))出/.exec(v); if (ex) return ex[1] + '出た';   /* 入力の「店を出る」も「店を出た」と書く */
    if (fr) return fr[1].replace(/^.*(?:て|で)/, '') + 'から出た';
    return '';
  }
  function backIn(sent, forms) { if (!sent || /(?:ない|なかった)/.test(sent) || !BACK.test(sent) || NOT_BACK.test(sent)) return false; return hasAny(sent, forms); }
  /* その人が主語で、この場で動作している（移動・退出・声だけ・話題・回想でない） */
  function actsHere(sent, forms) {
    if (!sent || IRREAL.test(sent) || PAST.test(sent) || REMOTE.test(sent) || /(?:ない|なかった|ず[、。]|ずに)/.test(sent)) return false;
    for (var i = 0; i < forms.length; i++) { var f = forms[i]; if (!f) continue; var m = new RegExp(esc(f) + HON + '(?:は|が|も)').exec(sent); if (!m) continue;
      var rest = sent.slice(m.index + m[0].length); if (MOVE_OUT.test(rest) && !BACK.test(rest)) continue;
      if (/が$/.test(m[0]) && /^[^、]{1,20}?(?:た|る|ている|ていた)[^、。]{0,12}?は/.test(rest)) continue;   /* ★r4: 「灯里が閉めた二階の扉は…」＝名前は連体の節の主語（場で動いているとは言えない） */
      return true; }
    return false;
  }
  function withHero(sent, forms, hf) { if (!sent || !hasAny(sent, hf) || !hasAny(sent, forms)) return false; for (var i = 0; i < forms.length; i++) { var f = forms[i]; if (f && new RegExp('(?:と|、)' + esc(f) + HON + '(?:は|が|も)|' + esc(f) + HON + '(?:と|、)').test(sent)) return true; } return /一緒|共に|ともに|二人|ふたり|揃って|並んで/.test(sent); }
  function formsOf(name) { var n = str(name).trim(), f = [n], s = sp(n); if (s && s !== n) f.push(s); return f; }
  function npcNames(S) { var out = []; try { var r = root.__v292Dfix95Roster, L = Array.isArray(r) && r.length ? r : (S.cast.npcs || []); L.forEach(function (n) { if (n && n.name) out.push(str(n.name).trim()); }); } catch (e) {} return out; }
  var HERO_MOVE = /(?:を出て|を出る|を出た|へ向か|に向か|へ行く|へ行っ|に行く|に行っ|へ移|に移|へ入る|へ入っ|に入る|に入っ|へ戻る|へ戻っ|に戻る|に戻っ|へ帰る|へ帰っ|に帰る|に帰っ|へ下り|へ降り|へ上が)/;
  function heroMovedAt(S, t) {
    try { var F = root.__v292DfixCP1; if (F && typeof F.sceneMoveOf === 'function') { var m = F.sceneMoveOf(t, S.cast && S.cast.hero && S.cast.hero.name); if (m && m.to) return true; } } catch (e) {}
    try { if (str(t && t.inputType).toUpperCase() === 'DO') { var pt = maskQ(str(t.playerText)); if (HERO_MOVE.test(pt) && !/(?:ない|なかった|ようと|たい|つもり)/.test(pt)) return true; } } catch (e2) {}   /* 予備: 主人公の DO の入力が場所を移る（CP1 が読めないとき） */
    return false;
  }
  function heroPlaceSeq(S) {   /* PLACE1 の主人公の現在地の行が変わったターン（PLACE1 が無い・OFF なら空） */
    var out = {}; try { var P = root.__v292DfixPLACE1; if (!P || typeof P.on !== 'function' || !P.on() || typeof P.parseInput !== 'function' || typeof P.makeCtx !== 'function') return out;
      var ctx = P.makeCtx(S), hero = S.cast && S.cast.hero && S.cast.hero.name;
      S.turns.forEach(function (t, i) { var ty = str(t && t.inputType).toUpperCase(); if ((ty === 'DO' || ty === 'STORY') && t.playerText) { try { var ev = P.parseInput(str(t.playerText), hero, ctx, ty === 'STORY') || []; if (ev.some(function (e) { return e && e.kind === 'hero'; })) out[i + 1] = 1; } catch (e2) {} } }); } catch (e) {}
    return out;
  }
  function noteExit(n, tn, src) { var k = n + '\u0000' + tn + '\u0000' + src; if (EXCOUNT[k]) return; EXCOUNT[k] = 1; ST.bExits++; if (src === 'input') ST.bExitsInput++; }   /* ★r4: 退出を確定した所で数える */
  function curInput(S) {   /* 組み立て中の入力（begin〜end・または直前の組み立てで同じターン数・60 秒以内）。無ければ null */
    var X = CUR || (LAST && Date.now() - LAST.at < 60000 && LAST.n === (S && S.turns ? S.turns.length : -1) ? LAST : null);
    if (!X || !X.t || X.k === 'cont' || (X.m === 'STORY' && X.t.trim() === CONT_TEXT)) return null;
    return { inputType: X.m, playerText: X.t, narrative: '', _convSays: [] };
  }
  /* いま退出したままの人: { name: { turn, route } }（毎回ターンから作る・保存しない） */
  function exited(S) {
    var out = {};
    try {
      S = S || getS(); if (!S || !Array.isArray(S.turns)) return out;
      var hf = heroForms(), L = S.turns.length, hp = heroPlaceSeq(S);
      npcNames(S).forEach(function (n) {
        var fs = formsOf(n), fb = fs.concat(rawForms(n)), st = null;   /* 退出は登録名そのまま（確かな側）・戻りは姓・名の形でも（戻す側） */
        var TT = S.turns.slice(), cin = curInput(S); if (cin) TT.push(cin);   /* ★r4: 組み立て中の入力も 1 つのターンとして読む（その回の送信から効く） */
        for (var i = 0; i < TT.length; i++) { var t = TT[i] || {}, ty = str(t.inputType).toUpperCase(), tn = i + 1;
          if (st && tn > st.turn) {
            if (heroMovedAt(S, t) || hp[tn]) { st = null; ST.bBacks++; ST.bBackWhy.heroMoved++; }
            else if ((ty === 'DO' || ty === 'STORY') && hasAny(maskQ(str(t.playerText)), fb) && IN_ARRIVE.test(str(t.playerText)) && !/(?:ない|なかった)/.test(str(t.playerText))) { st = null; ST.bBacks++; ST.bBackWhy.input++; }
            else if (Array.isArray(t._convSays) && t._convSays.some(function (c) { return c && fb.indexOf(str(c.who).trim()) >= 0; })) { st = null; ST.bBacks++; ST.bBackWhy.speaker++; }
          }
          if (ty === 'DO' || ty === 'STORY') {   /* ★r4: 利用者の入力に書かれた退出（SAY は読まない）。入力で戻ってくる・この場で動くなら解く（既存の条件） */
            var ins = sents(maskQ(str(t.playerText)));
            for (var q = 0; q < ins.length; q++) { var xi = exitIn(ins[q], fs, ins[q + 1] || '', hf, true);
              if (xi) { st = { turn: tn, route: xi.route, src: 'input' }; noteExit(n, tn, 'input'); continue; }
              if (st && tn > st.turn && actsHere(ins[q], fb)) { st = null; ST.bBacks++; ST.bBackWhy.input++; } } }
          var ss = sents(plain(t.narrative));
          for (var j = 0; j < ss.length; j++) {
            var x = exitIn(ss[j], fs, ss[j + 1] || '', hf); if (x) { st = { turn: tn, route: x.route }; noteExit(n, tn, 'narr'); continue; }
            if (!st) continue;
            if (backIn(ss[j], fb)) { st = null; ST.bBacks++; ST.bBackWhy.back++; }
            else if (withHero(ss[j], fb, hf)) { st = null; ST.bBacks++; ST.bBackWhy.withHero++; }
            else if (tn > st.turn && actsHere(ss[j], fb)) { st = null; ST.bBacks++; ST.bBackWhy.acts++; } }
        }
        if (st && TT.length - st.turn >= STALE_TURNS) { st = null; ST.bStale++; }   /* 6 ターン何も分からない → 言い切らずに外す */
        if (st) out[n] = st;
      });
    } catch (e) { err(); }
    return out;
  }
  /* NPRES classify が聞く: その文は退出の文か（NPRES では「確かめられない」(b) として数える。退出のままかは stillOut が決める） */
  function exitHit(sent, fs) { try { if (!bOn()) return false; var r = !!exitIn(maskQ(str(sent)), fs || [], '', null); if (r) ST.bNpres++; return r; } catch (e) { err(); return false; } }
  /* NPRES group が聞く: SCENE1 の退出のまま（戻りの条件を満たしていない）か */
  var EXMEMO = null;
  function exMemo() { var S = getS(), key = S && S.turns ? S.turns.length + '|' + (CUR ? 'c' + CUR.m + CUR.t : (LAST ? 'l' + LAST.m + LAST.t + LAST.n : '')) + '|' + Math.floor(Date.now() / 2000) : '';   /* r4: いまの入力も鍵に入れる */ if (!EXMEMO || EXMEMO.key !== key) EXMEMO = { key: key, x: exited(S) }; return EXMEMO.x; }
  function stillOut(name) { try { if (!bOn()) return false; return !!exMemo()[str(name).trim()]; } catch (e) { err(); return false; } }
  /* PLACE1 build が聞く: このターン（turn＝何ターン目）の本文で確認でき、いまも退出のままの人（PLACE1 の person の形） */
  function narrExits(narr, names, hero, turn) {
    try { if (!bOn()) return null; var out = [], X = null;
      if (turn === undefined) {   /* その本文だけで見る（同じ本文の中の戻り・留まりは打ち消す） */
        X = {}; var ss = sents(plain(narr)), hf = hero ? [str(hero).trim(), sp(hero)].concat(rawForms(hero)) : heroForms();
        (names || []).forEach(function (n) { var k = str(n).trim(); if (!k || k === str(hero).trim()) return; var fs = formsOf(k), fb = fs.concat(rawForms(k)), hitX = null;
          for (var j = 0; j < ss.length; j++) { var x = exitIn(ss[j], fs, ss[j + 1] || '', hf); if (x) { hitX = x; continue; } if (hitX && (backIn(ss[j], fb) || withHero(ss[j], fb, hf))) hitX = null; }
          if (hitX) X[k] = { route: hitX.route }; });
      } else X = exMemo();
      (names || []).forEach(function (n) { var k = str(n).trim(); if (!k || k === str(hero).trim()) return; var e = X[k]; if (!e || (turn !== undefined && e.turn !== turn)) return;
        out.push({ kind: 'person', who: [k], place: '', mode: 'gone', exit: e.route ? e.route : '', ev: 'scene1-narr' }); ST.bPlaceLines++; });
      return out; } catch (e) { err(); return null; }
  }
  /* fix333 fgStates333 が聞く: 前面・背景の候補から外す人を除いた states（外す人がいなければ null） */
  function fgFilter(states, text) {
    try {
      if (!bOn() && !cOn()) return null; if (!states || typeof states !== 'object') return null; ST.fgCalls++;
      var S = getS(); if (!S) return null; var drop = {}, hero = sp(S.cast && S.cast.hero && S.cast.hero.name);
      if (bOn()) {
        var x = exited(S); Object.keys(x).forEach(function (n) { drop[n] = 'exit'; });
        try { var P = root.__v292DfixPLACE1; if (P && typeof P.absentNames === 'function') P.absentNames(S, null).forEach(function (n) { if (!drop[n]) drop[n] = 'place1'; }); } catch (eP) {}
      }
      var k = cOn() ? kindCounted() : '';
      if (k && ST.cKind[k] !== undefined) ST.cKind[k]++; else if (cOn()) ST.cKind.unknown++;
      if (cOn() && (k === 'DO' || k === 'SAY' || k === 'STORY')) {   /* 本文か会話ログで一度もその場に出ていない人は前面にしない */
        var all = ''; (S.turns || []).forEach(function (t) { all += '\n' + str(t && t.narrative) + '\n' + (Array.isArray(t && t._convSays) ? t._convSays.map(function (c) { return c ? str(c.who) : ''; }).join('\n') : ''); });
        Object.keys(states).forEach(function (n) { if (sp(n) === hero || drop[n]) return; if (formsOf(n).concat(rawForms(n)).every(function (f) { return all.indexOf(f) < 0; })) drop[n] = 'never';   /* r3: 姓・名の形でも当たれば「出た」 */ });
      }
      var out = {}, ex = 0;
      Object.keys(states).forEach(function (n) { if (drop[n] && sp(n) !== hero) { ex++; if (drop[n] === 'never') ST.cFgOut++; else ST.bFgOut++; } else out[n] = states[n]; });
      return ex ? out : null;
    } catch (e) { err(); return null; }
  }

  root.__v292DfixSCENE1 = {
    VER: VER, on: on, aOn: aOn, bOn: bOn, cOn: cOn,
    begin: begin, end: end, kind: kind, skipPush: skipPush, tenkaiCut: tenkaiCut, markCont: markCont, retryKind: retryKind,
    appearance: appearance, attrBlock: attrBlock, speakerList: speakerList, lockSplit: lockSplit, noteDelta: noteDelta,
    exitHit: exitHit, stillOut: stillOut, narrExits: narrExits, fgFilter: fgFilter, exited: function () { return Object.keys(exited(getS())).length; },
    status: function () { return { ver: VER, on: on(), a: aOn(), b: bOn(), c: cOn(), stats: JSON.parse(JSON.stringify(ST)) }; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
