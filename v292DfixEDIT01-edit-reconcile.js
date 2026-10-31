/* =====================================================================
 * Chronicle v292DfixEDIT01: 「本文が正」フェーズ1 — 本文を編集して保存したら、会話ログ(_convSays)を本文に合わせる
 * ---------------------------------------------------------------------
 * 実例 E（Owner iPhone 2026-10-21 23:07）: 本文から消したセリフのカードが会話ログに残った。
 * 原因: UI.saveEdit は narrative だけを書き換え、_convSays / _convSayMeta / #dialogue-stream は据え置き。
 *       fix66 repair() は「足すだけ」なので古いカードが生き残る。
 *
 * ■やること（フェーズ1。これ以外はやらない）
 *   1. reconcile(turn, newNarr): 純関数。CL1-c と同じ述語（空白・句読点・括弧を除いて、台詞が最終本文に含まれるか）。
 *        ・本文にまだある台詞のカード → who と meta をそのまま残す
 *        ・本文から消えた台詞のカード → 捨てる
 *        ・言い回しを直した行（文字バイグラム類似度 >= 0.6、順序通り）→ who と meta を残し、say だけ新しい文にする
 *        ・_convSays と _convSayMeta は同じ添字の並行配列（fix922 / fix670）。必ず同時に切り詰める（長さが揃わなければ meta は捨てる）
 *        ・SAY モードの主人公の入力の写しは例外で残す（CL1-c と同じ）
 *        ・カードは新しい本文での出現位置の順に並べる
 *        ・plan.narrative はフェーズ1では触らなかった → フェーズ1b で <say> 区間だけ直す（下記）
 *        ・新しく書き足した「」にはカードを付けない（話者の自動推定は SPEAKER-01 の領分）。件数だけ 1 行表示する。
 *   2. UI.saveEdit をこの module から包み替える（index.html は編集しない）。
 *        narrative + _convSays + _convSayMeta を 1 回の S.saveD で一緒に保存。保存が通らなければ 3 つとも戻し、DOM には触らない。
 *   3. 保存が通ったら #dialogue-stream を空にして renderAll → fix66 repair() が turns から作り直す（fix295 がスクロールを保つ）。
 *   4. 会話ログのカードの ✕（手動削除）。確認（スマホ）→ 削除 → 「元に戻す」トースト。
 *        fix66 が各カードに data-ti / data-ci を付ける（applier が入れる）。
 *
 * ■フェーズ1b（EDIT-01b・2026-10-22）: 消した／言い直した台詞が「展開の描写」に戻ってくる件
 *   実例（PC・QA 物語・EDIT-01 ON）: ターン1の本文から 司書「閉館は九時…」 を消し、「…珍しいお客さんね」→「…だこと」に直して保存・リロード
 *   → .narr-block に古い行が .v292Dfix438-say として再挿入され、新旧が両方並んだ。
 *   原因: fix438 buildItems() は turn.plan.narrative（生成時の行配列・<say who> 付き）を読み、本文に無い <say> を挿入する（alreadyShown）。
 *         フェーズ1は plan.narrative / plan._structuredNarrative に触らなかったので、消した行が毎描画で戻る。
 *   対処: 編集保存（と ✕）の同じ S.saveD で、reconcile() の対応表（dropped / reworded）を使って plan.narrative と
 *         plan._structuredNarrative の <say> 区間だけを直す（reconcilePlan）。地の文・<state>/<react>/<scene_move> 等の他のタグは触らない。
 *         本文に元から無い <say>（fix213 で本文から落ち、fix438 が復元している行）は残す。型は維持（narrative=文字列配列 / _structuredNarrative={type,text,speaker} 配列）。
 *   次ターンの文脈（recentScenes=turn.narrative / recentDialogues=_convSays / recentHistory=narrative）は plan を読まないので影響なし。
 *   plan.narrative を後から読むもの（fix438 表示 / fix606・640・383 の話者証拠 / fix796 記憶照合 / fix292・293 文体）は、消した台詞が無くなる＝本文どおりになる。
 *
 * ■★r42 既定 ON（GPT #127-KA）: localStorage v292DfixEdit01Off='1' でなければ有効。v292DfixEdit01On は読まない（残っていても無害）。
 *   （r40/r41 は opt-in: v292DfixEdit01On='1' のときだけ有効だった。）
 * ■kill: localStorage v292DfixEdit01Off='1'（常に勝つ）→ 旧挙動（UI.saveEdit は元のまま・✕ も data-ti/data-ci も付かない）。storage 不可 = OFF（旧挙動）。
 * ■既存データ: 読み込み時には何もしない（再処理・移行なし）。動くのは「✎ 編集 → 保存」と「✕」の 2 操作だけ。
 * ■★r42 (GPT #127-KE/#127-KO) 入れ子の「」: 引用の区間は括弧の深さで切る（外側の対だけを 1 区間）。編集後の本文で括弧の対応が取れない
 *   （閉じ忘れ・余分な閉じ・「…』）ときは引用の区間を使わず、行が変わっていないカードだけ残し、消えた行・変わった行のカードと plan の同じ <say> を外す
 *   （本文は打ったとおり保存・言い直しは入れない・案内 1 行）。編集前だけ不整合なら編集後の区間で通常どおり合わせる。
 * ■診断: window.__v292DfixEDIT01.status() / .reconcile(turn, narr, opts) / .reconcilePlan(plan, opts)
 * ===================================================================== */
(function (root) {
  'use strict';
  var TAG = '[v292DfixEDIT01]';
  var THRESH = 0.6;

  /* ★r42 (GPT #127-KA): 既定 ON。v292DfixEdit01Off==='1' は強制停止で常に勝つ。storage 不可 = OFF（旧挙動）。v292DfixEdit01On は見ない（r40/r41 の opt-in 値が残っていても同じ ON）。 */
  function enabled() { try { var ls = root.localStorage; return !!ls && ls.getItem('v292DfixEdit01Off') !== '1'; } catch (e) { return false; } }
  function off() { return !enabled(); }
  /* ★EDG（bundle69-edg-a・案A）: ✎ の保存で本文が編集前と同じ（\r\n→\n だけ揃える）なら、会話カード・meta・plan の整理をしない。kill: localStorage v292DfixEDGOff='1'（62-b と同じ） */
  function edgOn() { try { var ls = root.localStorage; return !ls || ls.getItem('v292DfixEDGOff') !== '1'; } catch (e) { return true; } }
  function edgSame(a, b) { if (b == null) b = ''; return typeof a === 'string' && typeof b === 'string' && a.replace(/\r\n/g, '\n') === b.replace(/\r\n/g, '\n') && edgOn(); }

  /* ---------- 純関数 ---------- */
  /* CL1-c の _n1c と同じ文字集合（index.html:2954） */
  var NORM_RE = /[\s　。、．，,.・…‥—―–‐－\-〜～！？!?「」『』（）()【】“”"'’‘<>]/g;
  function norm(s) { return String(s == null ? '' : s).replace(NORM_RE, ''); }
  var DROP_CH = /[\s　。、．，,.・…‥—―–‐－\-〜～！？!?「」『』（）()【】“”"'’‘<>]/;
  function stripTags(s) { return String(s == null ? '' : s).replace(/<\/?say\b[^>]*>?/gi, ''); }

  /* 本文を正規化し、raw 位置 → 正規化位置の写像と、引用の範囲を作る */
  function analyse(narr) {
    var raw = stripTags(narr), body = '', map = new Array(raw.length + 1), i, ch;
    for (i = 0; i < raw.length; i++) {
      map[i] = body.length; ch = raw.charAt(i);
      if (!DROP_CH.test(ch)) body += ch;
    }
    map[raw.length] = body.length;
    /* ★r42 (GPT #127-KE): 引用は括弧の深さで切る。旧版の正規表現 /「([^」]*)」/ は入れ子の内側の最初の 」 で切れ、
       言い直した台詞が短く保存されていた（「…「続きは」って」→ say「…「続きは」）。外側の対になった 「…」/『…』 だけを 1 区間にする。
       対応が取れない（閉じ忘れ・余分な閉じ・「…』の食い違い）ときは quotesOk=false → reconcile は何もしない（旧挙動で保存）。 */
    var spans = [], stack = [], quotesOk = true, CLOSE = { '「': '」', '『': '』' };
    for (i = 0; i < raw.length; i++) {
      ch = raw.charAt(i);
      if (ch === '「' || ch === '『') { stack.push({ c: ch, i: i }); continue; }
      if (ch !== '」' && ch !== '』') continue;
      if (!stack.length || CLOSE[stack[stack.length - 1].c] !== ch) { quotesOk = false; continue; }
      var op = stack.pop();
      if (stack.length) continue;                                                     /* 内側の引用は外側の区間の一部 */
      var ns = map[op.i], ne = map[i + 1];
      spans.push({ ns: ns, ne: ne, key: body.slice(ns, ne), inner: raw.slice(op.i + 1, i).trim(), used: false });
    }
    if (stack.length) quotesOk = false;
    return { raw: raw, body: body, spans: spans, quotesOk: quotesOk };
  }

  function occurrences(body, k) {
    var out = [], p = 0, q;
    if (!k) return out;
    while ((q = body.indexOf(k, p)) >= 0) { out.push(q); p = q + k.length; }
    return out;
  }

  function bigrams(s) { var m = {}, i, g; for (i = 0; i < s.length - 1; i++) { g = s.substr(i, 2); m[g] = (m[g] || 0) + 1; } return m; }
  function similarity(a, b) {
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;
    var A = bigrams(a), B = bigrams(b), inter = 0, g;
    for (g in A) if (Object.prototype.hasOwnProperty.call(A, g) && B[g]) inter += Math.min(A[g], B[g]);
    var dice = (2 * inter) / ((a.length - 1) + (b.length - 1));
    if (a.length === b.length && a.length >= 3) {            /* 1 文字だけの打ち間違い（短い台詞はバイグラムが足りない） */
      var d = 0, i; for (i = 0; i < a.length; i++) if (a.charAt(i) !== b.charAt(i)) d++;
      if (d <= 1) dice = Math.max(dice, THRESH);
    }
    return dice;
  }

  /*
   * reconcile(turn, newNarr, opts) — 入力を一切変更しない。
   *   opts: { oldNarr, hero }   oldNarr = 編集前の本文（「新しい台詞」の件数を数えるため）, hero = 主人公名
   * 戻り値: { applicable, changed, says, meta, metaAction, kept, dropped[], reworded[], newQuotes, lenOk }
   *   applicable=false … turn に _convSays 配列が無い（古いターン）。何もしない。
   *   metaAction: 'none' | 'splice' | 'drop'
   */
  function reconcile(turn, newNarr, opts) {
    opts = opts || {};
    var cs = turn && Array.isArray(turn._convSays) ? turn._convSays : null;
    var res = { applicable: !!cs, changed: false, says: cs, meta: turn && turn._convSayMeta, metaAction: 'none', kept: 0, dropped: [], reworded: [], newQuotes: 0, lenOk: true };
    if (!cs) return res;
    var rawMeta = turn._convSayMeta, hasMeta = Array.isArray(rawMeta), metaAligned = hasMeta && rawMeta.length === cs.length;
    var A = analyse(newNarr), body = A.body;
    var OA = (opts.oldNarr != null) ? analyse(opts.oldNarr) : null, oldBody = OA ? OA.body : null;
    var heroKey = (turn.inputType === 'SAY' && turn.playerText) ? norm(turn.playerText) : null;
    var hero = opts.hero || '';
    /* ★r42 (GPT #127-KE/#127-KO): 編集後の本文で括弧の対応が取れないときは、引用の区間を一切使わない（言い直しの対応づけ・短い行・連結行を作らない）。
       その代わり「行が変わっていないカード」だけを残し、消えた行・変わった行のカードは外す（古い文言を会話ログ/plan/次ターンへ持ち越さない）。
       編集前だけ不整合（編集後は整っている）なら、編集後の区間で通常どおり合わせる（編集前の区間を使う「足して書き直した」判定だけ使わない）。 */
    if (!A.quotesOk) return lineFallback(turn, cs, rawMeta, metaAligned, newNarr, opts.oldNarr, heroKey, hero, res);
    var oldSpansOk = !OA || OA.quotesOk;
    var n = cs.length, st = new Array(n), used = {}, i, c, k;

    /* 1 回目: 本文にまだある台詞（n 番目のカードは n 番目の出現に当てる） */
    for (i = 0; i < n; i++) {
      c = cs[i]; k = norm(c && c.say);
      st[i] = { i: i, k: k, pos: -1, kind: 'drop', say: null };
      if (!c || typeof c !== 'object') { st[i].kind = 'keep'; continue; }          /* 想定外の形は触らない */
      if (!k) { st[i].kind = 'keep'; continue; }                                    /* 空の say は触らない（CL1-c は捨てるが、ここは編集と無関係） */
      var occ = occurrences(body, k), u = used[k] || 0, isHero = heroKey && k === heroKey && (!hero || c.who === hero);
      if (u < occ.length) { st[i].kind = 'keep'; st[i].pos = occ[u]; used[k] = u + 1; }
      else if (isHero) { st[i].kind = 'keep'; }                                     /* SAY の主人公の写し（CL1-c の例外） */
    }
    /* 一致した出現が覆う引用は「使用済み」 */
    for (i = 0; i < n; i++) {
      if (st[i].kind !== 'keep' || st[i].pos < 0) continue;
      var s0 = st[i].pos, e0 = s0 + st[i].k.length, j;
      for (j = 0; j < A.spans.length; j++) if (A.spans[j].ns < e0 && A.spans[j].ne > s0) A.spans[j].used = true;
    }
    /* 「足して書き直した」行: 古い台詞が、編集前は 1 つの引用そのものだったのに、いまは新しい（より長い）引用の一部になっている → その引用の文に更新する */
    if (oldBody != null && oldSpansOk) {
      var oldWhole = {}, oa = OA, oi;
      for (oi = 0; oi < oa.spans.length; oi++) oldWhole[oa.spans[oi].key] = true;
      var spanTaken = {};
      for (i = 0; i < n; i++) {
        if (st[i].kind !== 'keep' || st[i].pos < 0 || !oldWhole[st[i].k]) continue;
        var cov = null, jj;
        for (jj = 0; jj < A.spans.length; jj++) if (A.spans[jj].ns <= st[i].pos && A.spans[jj].ne >= st[i].pos + st[i].k.length) { cov = jj; break; }
        if (cov === null) continue;
        var cs2 = A.spans[cov];
        if (cs2.key === st[i].k || spanTaken[cov] || oldBody.indexOf(cs2.key) >= 0) continue;
        spanTaken[cov] = true; st[i].kind = 'reword'; st[i].pos = cs2.ns; st[i].say = cs2.inner;
      }
    }
    /* 候補 = 未使用で、編集前の本文に無かった引用（言い直した行／新しく書いた行） */
    var cand = [], j2;
    for (j2 = 0; j2 < A.spans.length; j2++) {
      var sp = A.spans[j2];
      if (sp.used || !sp.key) continue;
      if (oldBody != null && oldBody.indexOf(sp.key) >= 0) continue;
      cand.push(sp);
    }
    /* 2 回目: 言い回しを直した行を順序通りに当てる */
    var lastStart = -1;
    for (i = 0; i < n; i++) {
      if (st[i].kind !== 'drop') continue;
      var best = null, bestSim = THRESH - 1e-9, q;
      for (q = 0; q < cand.length; q++) {
        if (cand[q].used || cand[q].ns <= lastStart) continue;
        var sc = similarity(st[i].k, cand[q].key);
        if (sc > bestSim) { bestSim = sc; best = cand[q]; }
      }
      if (best) { best.used = true; lastStart = best.ns; st[i].kind = 'reword'; st[i].pos = best.ns; st[i].say = best.inner; }
    }
    for (j2 = 0; j2 < cand.length; j2++) if (!cand[j2].used) res.newQuotes++;

    /* 出現位置の順（位置の無いものは直前のカードの位置に付く）。安定ソート */
    var eff = [], last = -1;
    for (i = 0; i < n; i++) {
      if (st[i].kind === 'drop') { eff[i] = null; continue; }
      if (st[i].pos >= 0) last = st[i].pos;
      eff[i] = last;
    }
    var order = [];
    for (i = 0; i < n; i++) if (st[i].kind !== 'drop') order.push(i);
    order.sort(function (a, b) { return (eff[a] - eff[b]) || (a - b); });

    var outS = [], outM = [];
    for (i = 0; i < order.length; i++) {
      var o = order[i], src = cs[o];
      if (st[o].kind === 'reword') { var nc = {}, kk; for (kk in src) if (Object.prototype.hasOwnProperty.call(src, kk)) nc[kk] = src[kk]; nc.say = st[o].say; outS.push(nc); res.reworded.push({ i: o, from: String(src.say), to: st[o].say }); }
      else outS.push(src);
      if (metaAligned) outM.push(rawMeta[o]);
    }
    for (i = 0; i < n; i++) if (st[i].kind === 'drop') res.dropped.push({ i: i, who: String(cs[i] && cs[i].who || ''), say: String(cs[i] && cs[i].say || '') });
    res.kept = n - res.dropped.length;
    var same = outS.length === n, x;
    for (x = 0; same && x < n; x++) if (outS[x] !== cs[x]) same = false;
    res.changed = !same;
    res.says = outS;
    if (res.changed) {
      if (metaAligned) { res.meta = outM; res.metaAction = 'splice'; }
      else if (hasMeta) { res.meta = undefined; res.metaAction = 'drop'; }          /* 長さが合わない meta は添字が信用できない → 捨てる（fix922 は元々無効） */
    } else { res.says = cs; res.meta = rawMeta; }
    res.lenOk = !hasMeta || res.metaAction === 'drop' || (res.metaAction === 'splice' ? outM.length === outS.length : true);
    return res;
  }

  /* ★r42 (GPT #127-KO) 括弧の対応が取れない編集の安全側: 行単位（正規化して比較）で、変わっていない行にある台詞のカードだけ残す */
  function lineFallback(turn, cs, rawMeta, metaAligned, newNarr, oldNarr, heroKey, hero, res) {
    res.skipped = 'unbalanced-quotes'; res.fallback = 'unchanged-lines';
    var nl = String(stripTags(newNarr)).split('\n').map(norm), cnt = {}, i, c, k, j;
    String(stripTags(oldNarr == null ? '' : oldNarr)).split('\n').map(norm).forEach(function (x) { if (x) cnt[x] = (cnt[x] || 0) + 1; });
    var outS = [], outM = [];
    for (i = 0; i < cs.length; i++) {
      c = cs[i]; k = norm(c && c.say); var keep = false;
      if (!c || typeof c !== 'object' || !k) keep = true;                                   /* 想定外の形・空は触らない（通常経路と同じ） */
      else if (heroKey && k === heroKey && (!hero || c.who === hero)) keep = true;           /* SAY の主人公の写し */
      else for (j = 0; j < nl.length; j++) if (nl[j] && cnt[nl[j]] > 0 && nl[j].indexOf(k) >= 0) { keep = true; break; }
      if (keep) { outS.push(c); if (metaAligned) outM.push(rawMeta[i]); }
      else res.dropped.push({ i: i, who: String(c.who || ''), say: String(c.say || '') });
    }
    res.kept = outS.length; res.changed = outS.length !== cs.length; res.newQuotes = 0;
    if (res.changed) { res.says = outS; if (metaAligned) { res.meta = outM; res.metaAction = 'splice'; } else if (Array.isArray(rawMeta)) { res.meta = undefined; res.metaAction = 'drop'; } }
    res.lenOk = true;
    return res;
  }

  /* ---------- フェーズ1b: plan.narrative / plan._structuredNarrative の <say> 区間を本文に合わせる ---------- */
  /* <say who="X">…</say> と、fix61 が parsePlan 中だけ使う保護形 \uE000X\uE001…\uE002（_structuredNarrative には保護形のまま保存されている・実測）の両方を区間として扱う */
  var SAY_RE = /<say\b([^>]*)>([\s\S]*?)<\/say>|\uE000([^\uE001\uE002]*)\uE001([\s\S]*?)\uE002/gi;
  var SAY_FIX214 = /<say(\s+who="[^"]*"\s*)>([^<\n]*)[」』](?=\s*$)/g;   /* index.html fix214 / fix438 parseLine と同じ「」閉じの壊れタグ修復 */
  function hasSay(s) { return typeof s === 'string' && (s.indexOf('<say') >= 0 || s.indexOf('\uE000') >= 0); }
  function stripAllTags(s) { return String(s == null ? '' : s).replace(/<[^>]*>/g, ''); }
  function sayKey(text) { return norm(stripAllTags(text)); }
  function segsOf(line) {           /* 1 行（修復後）の say 区間 [{text,key,kind,to}] */
    var out = [], m; SAY_RE.lastIndex = 0;
    while ((m = SAY_RE.exec(line))) { var tx = m[2] != null ? m[2] : m[4]; out.push({ text: tx, key: sayKey(tx), kind: 'keep', to: null }); if (m[0].length === 0) SAY_RE.lastIndex++; }
    return out;
  }
  /* ★r42: 先頭の 「/『 が「全体を包む括弧」か（対の閉じが末尾にある／閉じが無い＝fix214 で 」 だけ落ちた形）。
     「「いいえ」でもいいよ」の中身「いいえ」でもいいよ のように、先頭が入れ子の内側の引用で始まるだけなら包みではない */
  function wrapsWhole(t, o, c) {
    if (t.charAt(0) !== o) return false;
    var d = 0, i, ch;
    for (i = 0; i < t.length; i++) { ch = t.charAt(i); if (ch === o) d++; else if (ch === c) { d--; if (d === 0) return i === t.length - 1; } }
    return o === '「';                                               /* 閉じが無い: 「 は fix214 の形として包む（旧挙動と同じ）、『 は包まない（旧挙動と同じ） */
  }
  function wrapLike(orig, to) {     /* 元のタグ中身が「…」/『…』で包まれていたら同じ形で */
    var t = String(orig == null ? '' : orig).trim();
    if (wrapsWhole(t, '「', '」')) return '「' + to + '」';           /* fix214 修復で 」 だけ落ちた形（「…）も同じ扱い */
    if (wrapsWhole(t, '『', '』')) return '『' + to + '』';
    return to;
  }
  /* 区間列（出現順）に規則 1〜3 を当てる。counters は呼び出しごとに新しく作る（narrative と structured で独立） */
  function decide(items, ctx) {
    var rw = {}, dp = {}, i, k, it;
    for (i = 0; i < ctx.reworded.length; i++) { k = norm(ctx.reworded[i] && ctx.reworded[i].from); if (k) (rw[k] = rw[k] || []).push(String(ctx.reworded[i].to == null ? '' : ctx.reworded[i].to)); }
    for (i = 0; i < ctx.dropped.length; i++) { k = norm(ctx.dropped[i] && ctx.dropped[i].say); if (k) dp[k] = (dp[k] || 0) + 1; }
    for (i = 0; i < items.length; i++) { it = items[i]; if (it.key && rw[it.key] && rw[it.key].length) { it.kind = 'reword'; it.to = rw[it.key].shift(); } }                       /* 1. 言い直し（前から） */
    for (i = items.length - 1; i >= 0; i--) { it = items[i]; if (it.kind === 'keep' && it.key && dp[it.key] > 0) { it.kind = 'drop'; dp[it.key]--; } }                           /* 2. 消したカードの台詞（後ろから＝reconcile が後ろのカードを捨てるのと同じ） */
    if (ctx.oldBody != null && ctx.newBody != null) {
      for (i = 0; i < items.length; i++) { it = items[i]; if (it.kind === 'keep' && it.key && ctx.oldBody.indexOf(it.key) >= 0 && ctx.newBody.indexOf(it.key) < 0) it.kind = 'drop'; }   /* 3. 編集前の本文にあって、いまは無い（カードの無かった行も本文が正） */
    }
  }
  function rebuildLine(repaired, segs, cur) {   /* cur = {n} 区間の消費位置 */
    var changed = false;
    var out = repaired.replace(SAY_RE, function (m, attrs, text, pWho, pText) {
      var sg = segs[cur.n++]; if (!sg) return m;
      if (sg.kind === 'drop') { changed = true; return ''; }
      if (sg.kind === 'reword') { changed = true; return (text != null) ? ('<say' + attrs + '>' + wrapLike(text, sg.to) + '</say>') : ('\uE000' + pWho + '\uE001' + wrapLike(pText, sg.to) + '\uE002'); }
      return m;
    });
    if (!changed) return null;
    out = out.replace(/[ \t]{2,}/g, ' ').trim();
    return out;
  }
  /*
   * reconcilePlan(plan, opts) — 純関数。入力を一切変更しない。
   *   opts: { dropped: [{say}], reworded: [{from,to}], oldNarr, newNarr }（oldNarr/newNarr が無ければ規則 3 は働かない＝✕ の経路）
   *   規則（<say>…</say> 区間ごと。地の文・他のタグはそのまま）:
   *     1. reworded.from と同じ台詞 → 中身を to に（who 属性・「」の形は維持）
   *     2. dropped.say と同じ台詞 → 区間を外す（後ろから 1 件ずつ）
   *     3. 編集前の本文にあって編集後の本文に無い台詞 → 区間を外す
   *     4. それ以外 → そのまま（本文に元から無い <say> = fix438 が復元している行は残す）
   *   区間が無くなって空になった行／要素は取り除く。型は維持。
   *   戻り値: { applicable, changed, narrative, structured, structuredAction:'none'|'replace', dropped, reworded }
   */
  function reconcilePlan(plan, opts) {
    opts = opts || {};
    var res = { applicable: false, changed: false, narrative: plan && plan.narrative, structured: plan && plan._structuredNarrative, structuredAction: 'none', dropped: 0, reworded: 0 };
    if (!plan || typeof plan !== 'object' || !Array.isArray(plan.narrative)) return res;
    res.applicable = true;
    var ctx = { reworded: Array.isArray(opts.reworded) ? opts.reworded : [], dropped: Array.isArray(opts.dropped) ? opts.dropped : [],
      oldBody: opts.oldNarr != null ? analyse(opts.oldNarr).body : null, newBody: opts.newNarr != null ? analyse(opts.newNarr).body : null };
    if (!ctx.reworded.length && !ctx.dropped.length && (ctx.oldBody == null || ctx.newBody == null)) return res;
    var i, j;
    /* --- plan.narrative（文字列配列） --- */
    var lines = plan.narrative, rep = [], segs = [], all = [];
    for (i = 0; i < lines.length; i++) {
      var raw = typeof lines[i] === 'string' ? lines[i] : null;
      if (raw === null || !hasSay(raw)) { rep.push(null); segs.push([]); continue; }
      var r = raw.replace(SAY_FIX214, '<say$1>$2</say>'), sg = segsOf(r);
      rep.push(r); segs.push(sg); for (j = 0; j < sg.length; j++) all.push(sg[j]);
    }
    var nChanged = false, outN = [];
    if (all.length) {
      decide(all, ctx);
      for (i = 0; i < lines.length; i++) {
        if (rep[i] === null || !segs[i].length) { outN.push(lines[i]); continue; }
        var nl = rebuildLine(rep[i], segs[i], { n: 0 });
        if (nl === null) { outN.push(lines[i]); continue; }
        nChanged = true; if (nl) outN.push(nl);
      }
      for (i = 0; i < all.length; i++) { if (all[i].kind === 'drop') res.dropped++; else if (all[i].kind === 'reword') res.reworded++; }
    }
    if (nChanged) { res.narrative = outN; res.changed = true; }
    /* --- plan._structuredNarrative（{type,text,speaker} 配列。fix26/27/28 の型をそのまま） --- */
    var st = plan._structuredNarrative;
    if (Array.isArray(st)) {
      var sItems = [], sMap = [], el;
      for (i = 0; i < st.length; i++) {
        el = st[i]; sMap.push(null);
        if (typeof el === 'string') { if (hasSay(el)) { var r1 = el.replace(SAY_FIX214, '<say$1>$2</say>'), g1 = segsOf(r1); sMap[i] = { rep: r1, segs: g1 }; for (j = 0; j < g1.length; j++) sItems.push(g1[j]); } }
        else if (el && typeof el === 'object') {
          if (el.type === 'dialogue' && typeof el.text === 'string') { var d = { key: norm(el.text), kind: 'keep', to: null, dlg: true }; sMap[i] = { dlg: d }; sItems.push(d); }
          else if (hasSay(el.text)) { var r2 = el.text.replace(SAY_FIX214, '<say$1>$2</say>'), g2 = segsOf(r2); sMap[i] = { rep: r2, segs: g2 }; for (j = 0; j < g2.length; j++) sItems.push(g2[j]); }
        }
      }
      if (sItems.length) {
        decide(sItems, ctx);
        var sChanged = false, outS = [];
        for (i = 0; i < st.length; i++) {
          el = st[i]; var mp = sMap[i];
          if (!mp) { outS.push(el); continue; }
          if (mp.dlg) {
            if (mp.dlg.kind === 'drop') { sChanged = true; continue; }
            if (mp.dlg.kind === 'reword') { var ne = {}, kk; for (kk in el) if (has(el, kk)) ne[kk] = el[kk]; ne.text = mp.dlg.to; outS.push(ne); sChanged = true; continue; }
            outS.push(el); continue;
          }
          var nt = rebuildLine(mp.rep, mp.segs, { n: 0 });
          if (nt === null) { outS.push(el); continue; }
          sChanged = true;
          if (!nt) continue;                                        /* 空になった要素は取り除く */
          if (typeof el === 'string') outS.push(nt);
          else { var ne2 = {}, k2; for (k2 in el) if (has(el, k2)) ne2[k2] = el[k2]; ne2.text = nt; outS.push(ne2); }
        }
        if (sChanged) { res.structured = outS; res.structuredAction = 'replace'; res.changed = true; }
      }
    }
    return res;
  }
  function planSnap(turn) {
    var p = turn && turn.plan;
    if (!p || typeof p !== 'object') return null;
    return { plan: p, nar: p.narrative, hasSt: has(p, '_structuredNarrative'), st: p._structuredNarrative };
  }
  function planApply(turn, pres) {   /* 戻り値: 書き換えたか */
    if (!pres || !pres.applicable || !pres.changed || !turn || !turn.plan) return false;
    if (pres.narrative !== turn.plan.narrative) turn.plan.narrative = pres.narrative;
    if (pres.structuredAction === 'replace') turn.plan._structuredNarrative = pres.structured;
    return true;
  }
  function planRevert(ps) {
    if (!ps) return;
    try { ps.plan.narrative = ps.nar; if (ps.hasSt) ps.plan._structuredNarrative = ps.st; else delete ps.plan._structuredNarrative; } catch (e) {}
  }

  /* ---------- 実行環境（ブラウザ） ---------- */
  var ST = { installed: false, reason: 'init', saves: 0, reverted: 0, lastResult: null, cardDeletes: 0, undos: 0, planEdits: 0 };

  function getS() {
    try { if (typeof root.__chronicleGetState === 'function') { var s = root.__chronicleGetState('edit01'); if (s) return s; } } catch (e) {}
    try { return (0, eval)('typeof S!=="undefined"?S:null'); } catch (e2) { return null; }
  }
  function getUI() {
    try { if (root.UI) return root.UI; } catch (e) {}
    try { return (0, eval)('typeof UI!=="undefined"?UI:null'); } catch (e2) { return null; }
  }
  function heroName(S) { try { return (S && S.cast && S.cast.hero && S.cast.hero.name) || ''; } catch (e) { return ''; } }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  function clearStream() { try { var st = root.document.getElementById('dialogue-stream'); if (st) st.innerHTML = ''; } catch (e) {} }
  function rebuildStream() {
    clearStream();
    try {
      if (typeof root.regenerateConvLogV66 === 'function') root.regenerateConvLogV66();
      else if (root.__v292Dfix66 && typeof root.__v292Dfix66.repair === 'function') root.__v292Dfix66.repair();
    } catch (e) {}
  }

  var SKIP_MSG = '本文を保存しました。かぎかっこ「」の対応が取れないため、直した台詞は会話ログに入れていません（消した・直した行のカードは外しました）。「」を閉じると次の編集から合わせます';
  function makeSaveEdit(orig) {
    return function saveEdit() {
      if (off()) return orig.apply(this, arguments);
      var UI = this, S = getS();
      if (!S || !(S.editIdx >= 0) || !S.turns || !S.turns[S.editIdx]) return orig.apply(this, arguments);
      var idx = S.editIdx, turn = S.turns[idx], ta = root.document.getElementById('editTa');
      if (!ta) return orig.apply(this, arguments);
      var newNarr = ta.value, snap = {
        narr: turn.narrative, hasCs: has(turn, '_convSays'), cs: turn._convSays, hasMeta: has(turn, '_convSayMeta'), meta: turn._convSayMeta };
      var res, edg = edgSame(newNarr, snap.narr);
      if (edg) res = { applicable: false, changed: false, newQuotes: 0, dropped: [], reworded: [], edg: true };   /* ★EDG: 本文そのまま = 整理しない */
      if (!edg) try { res = reconcile(turn, newNarr, { oldNarr: snap.narr, hero: heroName(S) }); } catch (e) { res = { applicable: false, changed: false, newQuotes: 0 }; try { console.warn(TAG, 'reconcile err', e && e.message); } catch (_) {} }
      /* フェーズ1b: plan.narrative / _structuredNarrative の <say> も同じ対応表で直す（失敗したら plan は触らない） */
      var ps = planSnap(turn), pres = null;
      /* ★r42 (#127-KO): 安全側（括弧不整合）でも、外したカードと消えた行の <say> は plan からも外す（言い直しは渡さない＝引用の区間は使わない） */
      if (!edg) try { pres = reconcilePlan(turn.plan, { dropped: (res && res.dropped) || [], reworded: (res && res.skipped) ? [] : ((res && res.reworded) || []), oldNarr: snap.narr, newNarr: newNarr }); } catch (e) { pres = null; try { console.warn(TAG, 'reconcilePlan err', e && e.message); } catch (_) {} }
      var revert = function () {
        try {
          turn.narrative = snap.narr;
          if (snap.hasCs) turn._convSays = snap.cs; else delete turn._convSays;
          if (snap.hasMeta) turn._convSayMeta = snap.meta; else delete turn._convSayMeta;
          planRevert(ps);
        } catch (e) {}
        ST.reverted++;
      };
      /* 3 つ（＋plan）を同じ保存に載せる（fix670 が二重に再計算しない） */
      turn.narrative = newNarr;
      if (res.applicable && res.changed) {
        turn._convSays = res.says;
        if (res.metaAction === 'splice') turn._convSayMeta = res.meta;
        else if (res.metaAction === 'drop') delete turn._convSayMeta;
      }
      var planChanged = planApply(turn, pres);
      if (res && res.skipped) { ST.skipped = (ST.skipped || 0) + 1; try { console.warn(TAG, 'skip reconcile:', res.skipped, 'turn', idx); } catch (_) {} }
      ST.lastResult = { idx: idx, skipped: (res && res.skipped) || null, changed: !!res.changed, kept: res.kept, dropped: res.dropped, reworded: res.reworded, newQuotes: res.newQuotes, metaAction: res.metaAction, lenOk: res.lenOk,
        plan: pres ? { applicable: pres.applicable, changed: planChanged, dropped: pres.dropped, reworded: pres.reworded, structured: pres.structuredAction } : null };
      if (edg) ST.lastResult.edg = true;
      var p;
      try { p = (typeof S.saveD === 'function') ? S.saveD('UI.saveEdit') : Promise.resolve({ ran: true, result: S.save() }); }
      catch (e) { p = Promise.reject(e); }
      Promise.resolve(p).then(function (x) {
        if (!x || x.ran !== true) {
          revert();
          try { UI.setStatus('編集を保存できませんでした。もう一度お試しください', true); } catch (e) {}
          return;
        }
        ST.saves++; if (planChanged) ST.planEdits++;
        UI.closeEdit();
        clearStream();      /* fix317:100 と同じ。renderAll の hook → fix66 repair() が turns から作り直す（_convSays 無しの古いターンも本文どおりになる） */
        UI.renderAll(); UI.renderBranches(S.scene && S.scene.branches);
        if (res.skipped) {
          try { UI.setStatus(SKIP_MSG); } catch (e) {}
        } else {
          try { var tsEl = root.document.getElementById('topStatus'); if (tsEl && tsEl.textContent === SKIP_MSG) UI.setStatus(''); } catch (e) {}   /* 前回の安全停止の案内を残さない */
        }
        if (!res.skipped && res.applicable && res.newQuotes > 0) {
          try { UI.setStatus('本文にあるが会話ログにないセリフ: ' + res.newQuotes + ' 件'); } catch (e) {}
        }
      }, function (err) {
        revert();
        try { UI.setStatus('編集を保存できませんでした。もう一度お試しください', true); } catch (e) {}
        try { console.warn(TAG, 'saveD rejected', err && err.message); } catch (_) {}
      });
    };
  }

  function install() {
    var UI = getUI();
    if (!UI || typeof UI.saveEdit !== 'function') { ST.reason = 'no-UI'; return false; }
    if (UI.saveEdit.__edit01) { ST.installed = true; ST.reason = 'ok'; return true; }
    var src = ''; try { src = Function.prototype.toString.call(UI.saveEdit); } catch (e) {}
    if (src.indexOf('editTa') < 0 || src.indexOf('saveD') < 0 || src.indexOf('_prev748') < 0) { ST.reason = 'signature-mismatch'; return false; }   /* 元の形が変わっていたら何もしない（旧挙動のまま） */
    var w = makeSaveEdit(UI.saveEdit); w.__edit01 = true; w.__orig = UI.saveEdit;
    UI.saveEdit = w; ST.installed = true; ST.reason = 'ok';
    return true;
  }

  /* ---------- 手動削除（✕） ---------- */
  var CSS = '.v292-dlg-card{position:relative}'
    + '.v292-edit01-x{position:absolute;top:2px;right:2px;width:28px;height:28px;border:0;border-radius:14px;background:transparent;color:inherit;opacity:.35;cursor:pointer;padding:0;line-height:28px;font-size:13px}'
    + '.v292-edit01-x::before{content:"\\2715"}'
    + '.v292-edit01-x:hover,.v292-edit01-x:focus{opacity:.9;background:rgba(128,128,128,.25)}'
    + '#v292Edit01-toast{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:100000;background:#222;color:#fff;border-radius:10px;padding:10px 14px;font-size:13px;display:flex;gap:12px;align-items:center;box-shadow:0 4px 16px rgba(0,0,0,.4);max-width:92vw}'
    + '#v292Edit01-toast button{background:transparent;border:1px solid #aaa;color:#fff;border-radius:6px;padding:4px 10px;font-size:13px;cursor:pointer}';
  function injectCss() {
    try { var d = root.document; if (!d || d.getElementById('v292Edit01-css')) return; var s = d.createElement('style'); s.id = 'v292Edit01-css'; s.textContent = CSS; (d.head || d.documentElement).appendChild(s); } catch (e) {}
  }
  function decorate(card) {
    try {
      if (off() || !card || !card.getAttribute || !card.getAttribute('data-ci') || card.querySelector('.v292-edit01-x')) return;
      injectCss();
      var b = root.document.createElement('button');
      b.type = 'button'; b.className = 'v292-edit01-x'; b.setAttribute('aria-label', 'このセリフを会話ログから消す'); b.title = 'このセリフを会話ログから消す（本文は変わりません）';
      card.appendChild(b);
    } catch (e) {}
  }
  function sweepDecorate() { try { var l = root.document.querySelectorAll('.v292-dlg-card[data-ci]'); for (var i = 0; i < l.length; i++) decorate(l[i]); } catch (e) {} }

  var toastTimer = null;
  function toast(msg, undoFn) {
    try {
      var d = root.document, t = d.getElementById('v292Edit01-toast');
      if (t) t.remove();
      injectCss();
      t = d.createElement('div'); t.id = 'v292Edit01-toast'; t.setAttribute('role', 'status');
      var sp = d.createElement('span'); sp.textContent = msg; t.appendChild(sp);
      if (undoFn) { var b = d.createElement('button'); b.type = 'button'; b.textContent = '元に戻す'; b.setAttribute('data-edit01', 'undo'); b.onclick = function () { try { clearTimeout(toastTimer); t.remove(); } catch (e) {} undoFn(); }; t.appendChild(b); }
      d.body.appendChild(t);
      clearTimeout(toastTimer); toastTimer = setTimeout(function () { try { t.remove(); } catch (e) {} }, 8000);
    } catch (e) {}
  }

  function isCoarse() { try { return !!(root.matchMedia && (root.matchMedia('(pointer: coarse)').matches || root.matchMedia('(max-width: 700px)').matches)); } catch (e) { return false; } }

  /* ti/ci のカードを削除。_convSays と _convSayMeta を同じ添字で外し、S.saveD で保存。通らなければ元に戻す。 */
  function deleteCard(ti, ci, cardEl, opts) {
    opts = opts || {};
    var S = getS(), turn = S && S.turns && S.turns[ti];
    if (!turn || !Array.isArray(turn._convSays) || !turn._convSays[ci]) return Promise.resolve({ ok: false, why: 'no-entry' });
    var entry = turn._convSays[ci];
    if (cardEl) { var tx = cardEl.querySelector && cardEl.querySelector('.dlg-text'); if (tx && norm(tx.textContent) !== norm(entry.say)) return Promise.resolve({ ok: false, why: 'mismatch' }); }
    var snap = { cs: turn._convSays, hasMeta: has(turn, '_convSayMeta'), meta: turn._convSayMeta };
    var metaAligned = Array.isArray(snap.meta) && snap.meta.length === snap.cs.length, metaEntry = metaAligned ? snap.meta[ci] : undefined;
    var ncs = snap.cs.slice(); ncs.splice(ci, 1); turn._convSays = ncs;
    if (metaAligned) { var nm = snap.meta.slice(); nm.splice(ci, 1); turn._convSayMeta = nm; }
    /* フェーズ1b: plan の同じ台詞の <say> 区間も外す（本文は触らない。規則 3 は働かない）。undo で元の配列へ戻す */
    var ps = planSnap(turn), pres = null;
    try { pres = reconcilePlan(turn.plan, { dropped: [{ say: entry.say }], reworded: [] }); } catch (e) { pres = null; }
    var planChanged = planApply(turn, pres);
    var revert = function () { turn._convSays = snap.cs; if (snap.hasMeta) turn._convSayMeta = snap.meta; else delete turn._convSayMeta; planRevert(ps); };
    var p; try { p = (typeof S.saveD === 'function') ? S.saveD('EDIT01.deleteCard') : Promise.resolve({ ran: true, result: S.save() }); } catch (e) { p = Promise.reject(e); }
    return Promise.resolve(p).then(function (x) {
      if (!x || x.ran !== true) { revert(); toast('保存できなかったので、消していません'); return { ok: false, why: 'save-refused' }; }
      ST.cardDeletes++; if (planChanged) ST.planEdits++;
      try { if (cardEl && cardEl.parentNode) cardEl.parentNode.removeChild(cardEl); } catch (e) {}
      if (!opts.silent) toast('会話ログから1件消しました（本文はそのままです）', function () { undoDelete(turn, ci, entry, metaAligned, metaEntry, planChanged ? ps : null); });
      return { ok: true, turn: turn, entry: entry, planChanged: planChanged };
    }, function () { revert(); toast('保存できなかったので、消していません'); return { ok: false, why: 'save-rejected' }; });
  }
  function undoDelete(turn, ci, entry, metaAligned, metaEntry, planPrev) {
    var S = getS();
    if (!S || !turn || !Array.isArray(turn._convSays)) return Promise.resolve({ ok: false });
    var snap = { cs: turn._convSays, hasMeta: has(turn, '_convSayMeta'), meta: turn._convSayMeta };
    var at = Math.min(ci, snap.cs.length), ncs = snap.cs.slice(); ncs.splice(at, 0, entry); turn._convSays = ncs;
    if (metaAligned && Array.isArray(snap.meta) && snap.meta.length === snap.cs.length) { var nm = snap.meta.slice(); nm.splice(at, 0, metaEntry); turn._convSayMeta = nm; }
    var ps = planSnap(turn);
    if (planPrev && ps && planPrev.plan === ps.plan) planRevert(planPrev);          /* フェーズ1b: ✕ で外した <say> 区間を元の配列に戻す（同じ plan オブジェクトのときだけ） */
    var revert = function () { turn._convSays = snap.cs; if (snap.hasMeta) turn._convSayMeta = snap.meta; else delete turn._convSayMeta; planRevert(ps); };
    var p; try { p = (typeof S.saveD === 'function') ? S.saveD('EDIT01.undoDelete') : Promise.resolve({ ran: true, result: S.save() }); } catch (e) { p = Promise.reject(e); }
    return Promise.resolve(p).then(function (x) {
      if (!x || x.ran !== true) { revert(); toast('保存できなかったので、戻していません'); return { ok: false }; }
      ST.undos++; rebuildStream(); return { ok: true };
    }, function () { revert(); return { ok: false }; });
  }

  function onClick(ev) {
    try {
      var t = ev.target; if (!t || !t.closest) return;
      var b = t.closest('.v292-edit01-x'); if (!b || off()) return;
      ev.preventDefault(); ev.stopPropagation();
      var card = b.closest('.v292-dlg-card'); if (!card) return;
      var ti = parseInt(card.getAttribute('data-ti'), 10), ci = parseInt(card.getAttribute('data-ci'), 10);
      if (!(ti >= 0) || !(ci >= 0)) return;
      if (isCoarse() && typeof root.confirm === 'function' && !root.confirm('このセリフを会話ログから消しますか？（本文はそのままです。あとで「元に戻す」もできます）')) return;
      deleteCard(ti, ci, card);
    } catch (e) { try { console.warn(TAG, 'click err', e && e.message); } catch (_) {} }
  }

  var api = {
    reconcile: reconcile, reconcilePlan: reconcilePlan, norm: norm, similarity: similarity, analyse: analyse,
    decorate: decorate, deleteCard: deleteCard, undoDelete: undoDelete, install: install, sweepDecorate: sweepDecorate, enabled: enabled,
    status: function () { return { installed: ST.installed, reason: ST.reason, off: off(), skipped: ST.skipped || 0, saves: ST.saves, reverted: ST.reverted, cardDeletes: ST.cardDeletes, undos: ST.undos, planEdits: ST.planEdits, last: ST.lastResult }; }
  };
  root.__v292DfixEDIT01 = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  /* ---------- 起動 ---------- */
  try {
    if (root.document && root.document.addEventListener) {
      root.document.addEventListener('click', onClick, true);
      if (!install()) {
        var tries = 0, iv = setInterval(function () { tries++; if (install() || tries > 40 || ST.reason === 'signature-mismatch') { clearInterval(iv); if (!ST.installed) { try { console.warn(TAG, 'not installed:', ST.reason); } catch (_) {} } } }, 250);
      }
      var go = function () { sweepDecorate(); };
      if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', go); else go();
      try { console.log(TAG, 'loaded (installed=' + ST.installed + ')'); } catch (_) {}
    }
  } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
