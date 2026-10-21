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
 *        ・plan.narrative には触らない（<say who> の証拠源）
 *        ・新しく書き足した「」にはカードを付けない（話者の自動推定は SPEAKER-01 の領分）。件数だけ 1 行表示する。
 *   2. UI.saveEdit をこの module から包み替える（index.html は編集しない）。
 *        narrative + _convSays + _convSayMeta を 1 回の S.saveD で一緒に保存。保存が通らなければ 3 つとも戻し、DOM には触らない。
 *   3. 保存が通ったら #dialogue-stream を空にして renderAll → fix66 repair() が turns から作り直す（fix295 がスクロールを保つ）。
 *   4. 会話ログのカードの ✕（手動削除）。確認（スマホ）→ 削除 → 「元に戻す」トースト。
 *        fix66 が各カードに data-ti / data-ci を付ける（applier が入れる）。
 *
 * ■★r40 既定 OFF（opt-in）: localStorage v292DfixEdit01On='1' のときだけ有効。OFF = UI.saveEdit は元のまま・✕ も data-ti/data-ci も付かない（旧挙動）。
 * ■kill: localStorage v292DfixEdit01Off='1'（On より常に優先）→ 同じく旧挙動。
 * ■診断: window.__v292DfixEDIT01.status() / .reconcile(turn, narr, opts)
 * ===================================================================== */
(function (root) {
  'use strict';
  var TAG = '[v292DfixEDIT01]';
  var THRESH = 0.6;

  /* ★r40 (GPT #127-JF 'Owner QA first'): opt-in。localStorage v292DfixEdit01On==='1' のときだけ有効。v292DfixEdit01Off==='1' は強制停止で常に勝つ。storage 不可 = OFF（旧挙動）。 */
  function enabled() { try { var ls = root.localStorage; return !!ls && ls.getItem('v292DfixEdit01On') === '1' && ls.getItem('v292DfixEdit01Off') !== '1'; } catch (e) { return false; } }
  function off() { return !enabled(); }

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
    var spans = [], re = /「([^」]*)」|『([^』]*)』/g, m;
    while ((m = re.exec(raw))) {
      var inner = m[1] !== undefined ? m[1] : m[2];
      var ns = map[m.index], ne = map[m.index + m[0].length];
      spans.push({ ns: ns, ne: ne, key: body.slice(ns, ne), inner: String(inner).trim(), used: false });
      if (m[0].length === 0) re.lastIndex++;
    }
    return { raw: raw, body: body, spans: spans };
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
    var oldBody = (opts.oldNarr != null) ? analyse(opts.oldNarr).body : null;
    var heroKey = (turn.inputType === 'SAY' && turn.playerText) ? norm(turn.playerText) : null;
    var hero = opts.hero || '';
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
    if (oldBody != null) {
      var oldWhole = {}, oa = analyse(opts.oldNarr), oi;
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

  /* ---------- 実行環境（ブラウザ） ---------- */
  var ST = { installed: false, reason: 'init', saves: 0, reverted: 0, lastResult: null, cardDeletes: 0, undos: 0 };

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

  function makeSaveEdit(orig) {
    return function saveEdit() {
      if (off()) return orig.apply(this, arguments);
      var UI = this, S = getS();
      if (!S || !(S.editIdx >= 0) || !S.turns || !S.turns[S.editIdx]) return orig.apply(this, arguments);
      var idx = S.editIdx, turn = S.turns[idx], ta = root.document.getElementById('editTa');
      if (!ta) return orig.apply(this, arguments);
      var newNarr = ta.value, snap = {
        narr: turn.narrative, hasCs: has(turn, '_convSays'), cs: turn._convSays, hasMeta: has(turn, '_convSayMeta'), meta: turn._convSayMeta };
      var res;
      try { res = reconcile(turn, newNarr, { oldNarr: snap.narr, hero: heroName(S) }); } catch (e) { res = { applicable: false, changed: false, newQuotes: 0 }; try { console.warn(TAG, 'reconcile err', e && e.message); } catch (_) {} }
      var revert = function () {
        try {
          turn.narrative = snap.narr;
          if (snap.hasCs) turn._convSays = snap.cs; else delete turn._convSays;
          if (snap.hasMeta) turn._convSayMeta = snap.meta; else delete turn._convSayMeta;
        } catch (e) {}
        ST.reverted++;
      };
      /* 3 つを同じ保存に載せる（fix670 が二重に再計算しない） */
      turn.narrative = newNarr;
      if (res.applicable && res.changed) {
        turn._convSays = res.says;
        if (res.metaAction === 'splice') turn._convSayMeta = res.meta;
        else if (res.metaAction === 'drop') delete turn._convSayMeta;
      }
      ST.lastResult = { idx: idx, changed: !!res.changed, kept: res.kept, dropped: res.dropped, reworded: res.reworded, newQuotes: res.newQuotes, metaAction: res.metaAction, lenOk: res.lenOk };
      var p;
      try { p = (typeof S.saveD === 'function') ? S.saveD('UI.saveEdit') : Promise.resolve({ ran: true, result: S.save() }); }
      catch (e) { p = Promise.reject(e); }
      Promise.resolve(p).then(function (x) {
        if (!x || x.ran !== true) {
          revert();
          try { UI.setStatus('編集を保存できませんでした。もう一度お試しください', true); } catch (e) {}
          return;
        }
        ST.saves++;
        UI.closeEdit();
        clearStream();      /* fix317:100 と同じ。renderAll の hook → fix66 repair() が turns から作り直す（_convSays 無しの古いターンも本文どおりになる） */
        UI.renderAll(); UI.renderBranches(S.scene && S.scene.branches);
        if (res.applicable && res.newQuotes > 0) {
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
    var revert = function () { turn._convSays = snap.cs; if (snap.hasMeta) turn._convSayMeta = snap.meta; else delete turn._convSayMeta; };
    var p; try { p = (typeof S.saveD === 'function') ? S.saveD('EDIT01.deleteCard') : Promise.resolve({ ran: true, result: S.save() }); } catch (e) { p = Promise.reject(e); }
    return Promise.resolve(p).then(function (x) {
      if (!x || x.ran !== true) { revert(); toast('保存できなかったので、消していません'); return { ok: false, why: 'save-refused' }; }
      ST.cardDeletes++;
      try { if (cardEl && cardEl.parentNode) cardEl.parentNode.removeChild(cardEl); } catch (e) {}
      if (!opts.silent) toast('会話ログから1件消しました（本文はそのままです）', function () { undoDelete(turn, ci, entry, metaAligned, metaEntry); });
      return { ok: true, turn: turn, entry: entry };
    }, function () { revert(); toast('保存できなかったので、消していません'); return { ok: false, why: 'save-rejected' }; });
  }
  function undoDelete(turn, ci, entry, metaAligned, metaEntry) {
    var S = getS();
    if (!S || !turn || !Array.isArray(turn._convSays)) return Promise.resolve({ ok: false });
    var snap = { cs: turn._convSays, hasMeta: has(turn, '_convSayMeta'), meta: turn._convSayMeta };
    var at = Math.min(ci, snap.cs.length), ncs = snap.cs.slice(); ncs.splice(at, 0, entry); turn._convSays = ncs;
    if (metaAligned && Array.isArray(snap.meta) && snap.meta.length === snap.cs.length) { var nm = snap.meta.slice(); nm.splice(at, 0, metaEntry); turn._convSayMeta = nm; }
    var revert = function () { turn._convSays = snap.cs; if (snap.hasMeta) turn._convSayMeta = snap.meta; else delete turn._convSayMeta; };
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
    reconcile: reconcile, norm: norm, similarity: similarity, analyse: analyse,
    decorate: decorate, deleteCard: deleteCard, undoDelete: undoDelete, install: install, sweepDecorate: sweepDecorate, enabled: enabled,
    status: function () { return { installed: ST.installed, reason: ST.reason, off: off(), saves: ST.saves, reverted: ST.reverted, cardDeletes: ST.cardDeletes, undos: ST.undos, last: ST.lastResult }; }
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
