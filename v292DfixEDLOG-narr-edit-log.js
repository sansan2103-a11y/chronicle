/* =====================================================================
 * Chronicle v292DfixEDLOG: 「展開の描写」の手編集を、差分つきの小さな記録として同じ保存に残す（laneCORR・2026-10-31・Local 候補）
 * ★laneEDICF（2026-11-03）: 本番 90-b（20261103-bundle90-b）の木へ載せ直し。中身は laneCORR 版（781a5a81）と同じで、VER だけ変えた。
 *   90-b の包みの順: EDLOG → SFL1 → EDIT-01(69 EDG) → 元の saveEdit。SFLTap（65）は UI.saveEdit() を呼ぶだけなので、この包みを通る（本文が同じなら記録しない）。
 * ---------------------------------------------------------------------
 * ■目的（Owner 指示）: Owner が ✎ で直した本文から「AI が何を間違えたか」を後で集計・分析できるようにする。
 *   今の 62-b には本文の編集履歴が 1 件も残らない（UI.saveEdit は narrative を上書きするだけ。EDIT-01 の lastResult はメモリだけ）。
 *
 * ■やること（これ以外はやらない）
 *   1. 既存の「保存」（UI.saveEdit = SFL1(EDIT-01b(元の saveEdit)) の包み）の、さらに外側を 1 回だけ包む。
 *      中の誰か（EDIT-01 / 元の saveEdit）が同期的に呼ぶ S.saveD('UI.saveEdit') を 1 回だけ横取りし、
 *      その瞬間（＝本文がメモリ上で新しい文に置き換わった直後・保存の直前）に、そのターンへ記録を 1 件足す。
 *      → 本文と記録は **同じ 1 回の S.saveD** で保存される（新しい保存経路・新しい localStorage キー・Worker の新 op は無い）。
 *   2. 保存が ran:true を返さなければ（ran:false / undefined / reject / throw）、足した記録を外す（EDIT-01 が本文を戻すのと同じ時点）。
 *      → 本文だけ・記録だけが残る形にしない。
 *   3. 記録の形（turn._narrEdits[]・1 編集 1 件・本文の全文は持たない）:
 *        { v:1, eid, ts, story, ti, tk, h0, h1, l0, l1, ops:[{p,d,i}], tr, rev0, g0, build, src:'edit', cd, cr, nq, sfl, pd }
 *          h0/h1 = 編集前/後の本文のハッシュ（cyrb53・同期・暗号用途ではない）、l0/l1 = 文字数
 *          ops   = 変わった区間だけ（p = 編集前の本文での位置、d = 消えた文字列、i = 入った文字列）。後ろから当てると編集後の本文になる。
 *          tr    = 0 そのまま / 1 区間を切り詰めた（ハッシュで照合のみ）/ 2 大きすぎて ops を持たない / 3 物語全体の記録が 120000 字を超えたので ops を持たない
 *          rev0  = 編集した時点の文書の rev（fix705 docAuthority）、g0 = 保存直前の fix781 localGeneration。
 *                  「保存後の rev」と「クラウド確定」は同じ保存の中には書けない（保存が終わるまで分からない）→ 記録に書かない。
 *                  live の状態は status() で読み、後の分析ではクラウドの書き出しに同じ eid が有るかで判定する（読み取り側の仕事）。
 *          tk    = そのターンの指紋（inputType|playerText のハッシュ。編集で変わらない）
 *          cd/cr/nq = 同じ保存で EDIT-01 が外したカード数 / 言い直しに合わせたカード数 / 新しい「」の数（あれば）
 *          sfl   = 同じ保存で SFL1 が直した話者の件数（あれば）
 *          pd    = 上限で古い記録を捨てた累計件数
 *   4. 上限: 1 ターン 12 件・1 件の ops 24 区間・1 区間 600 字・1 件 6000 字・1 ターンの記録 24000 字（超えたら古い順に捨てる）・
 *      物語全体 120000 字（超えたら新しい記録はハッシュと文字数だけ＝1 件 約 300 字）。
 *
 * ■flag（既定 OFF・この物語だけ）
 *   有効 = localStorage v292DfixEDLogOn='1' かつ v292DfixEDLogOff!=='1'（kill が常に勝つ）かつ 物語 id === 'smvhfq1rulp'（Owner の QA 物語）。
 *   それ以外（OFF・kill・別の物語・物語 id が分からない・storage 不可）は **包みも入れない**（読み込み時に無効なら install しない）。
 *   保存の瞬間にももう一度確かめ、無効なら中をそのまま呼ぶ。保護物語 smv82tjjai8 / smv92e8vv1f / smv6r10s7u9 は常に無効。
 *   既にある _narrEdits は消さない・書き換えない（後始末はコンソールの purge() だけ）。読むものは誰も居ない（未知の turn フィールド）。
 *
 * ■学習・sys・他の物語へは流さない: このモジュールは記録を書くだけ。Planner / sys / Memory / cast / 設定カードへは 1 バイトも渡さない。
 * ■診断（コンソールのみ）: window.__v292DfixEDLOG.{status(), list(ti), verify(ti), diff(a,b), apply(a,ops), hash(s), enabled(), purge()}
 * ===================================================================== */
(function (root) {
  'use strict';
  var TAG = '[v292DfixEDLOG]', VER = 'edlog-20261103-edicf-a';
  var TARGET = 'smvhfq1rulp';
  var PROTECTED = { smv82tjjai8: 1, smv92e8vv1f: 1, smv6r10s7u9: 1 };
  var FIELD = '_narrEdits';
  var MAX_REC = 12, MAX_OPS = 24, MAX_SPAN = 600, MAX_REC_CHARS = 6000, MAX_TURN_CHARS = 24000, MAX_STORY_CHARS = 120000, LCS_CELLS = 250000;

  /* ---------- flag ---------- */
  function lsGet(k) { try { var ls = root.localStorage; return ls ? ls.getItem(k) : null; } catch (e) { return null; } }
  function sidOf(k) { if (k == null) return null; var x = String(k).replace(/^(doc|url):/, ''); if (x.indexOf('chr6_slot_') === 0) x = x.slice(10); return x || null; }
  function curSid() {
    var sid = null;
    try { var dk = root.__chronicleDocumentStoryKey; if (typeof dk === 'string' && dk) sid = sidOf(dk); } catch (e) {}
    if (!sid) { try { sid = sidOf(new URLSearchParams(root.location.search).get('story')); } catch (e) {} }
    return sid;
  }
  function flagOn() { return lsGet('v292DfixEDLogOn') === '1' && lsGet('v292DfixEDLogOff') !== '1'; }
  function active() { var sid = curSid(); return flagOn() && !!sid && sid === TARGET && !PROTECTED[sid]; }

  /* ---------- 純関数 ---------- */
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  /* cyrb53（同期・53bit）。照合用。暗号用途ではない */
  function hash(str) {
    str = String(str == null ? '' : str);
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57, i, ch;
    for (i = 0; i < str.length; i++) { ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    var n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
    return 'c53:' + ('00000000000000' + n.toString(16)).slice(-14);
  }
  function splitLines(s) { var out = [], p = 0, q; while ((q = s.indexOf('\n', p)) >= 0) { out.push(s.slice(p, q + 1)); p = q + 1; } if (p < s.length) out.push(s.slice(p)); return out; }
  /* 1 区間を、共通の先頭・末尾を除いて細くする */
  function narrow(a, b, aStart) {
    var pre = 0, n = Math.min(a.length, b.length);
    while (pre < n && a.charCodeAt(pre) === b.charCodeAt(pre)) pre++;
    var suf = 0; while (suf < n - pre && a.charCodeAt(a.length - 1 - suf) === b.charCodeAt(b.length - 1 - suf)) suf++;
    return { p: aStart + pre, d: a.slice(pre, a.length - suf), i: b.slice(pre, b.length - suf) };
  }
  /* diff(a, b) → ops（編集前 a の位置で昇順・重ならない）。行単位の LCS で区間を見つけ、区間の中は文字単位で細くする */
  function diff(a, b) {
    a = String(a == null ? '' : a); b = String(b == null ? '' : b);
    if (a === b) return [];
    var A = splitLines(a), B = splitLines(b), na = A.length, nb = B.length, ops = [];
    if (na * nb > LCS_CELLS || na === 0 || nb === 0) { var o = narrow(a, b, 0); return [o]; }
    var L = new Array(na + 1), i, j;
    for (i = 0; i <= na; i++) { L[i] = new Uint32Array(nb + 1); }
    for (i = na - 1; i >= 0; i--) for (j = nb - 1; j >= 0; j--) L[i][j] = (A[i] === B[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    var posA = [0]; for (i = 0; i < na; i++) posA.push(posA[i] + A[i].length);
    i = 0; j = 0;
    var hA = -1, hB = -1;
    var flush = function (ia, jb) {
      if (hA < 0) return;
      if (ia - hA === jb - hB) { for (var x = 0; x < ia - hA; x++) if (A[hA + x] !== B[hB + x]) ops.push(narrow(A[hA + x], B[hB + x], posA[hA + x])); }   /* 同じ行数を置き換えた区間は 1 行ずつ（分析で種類が混ざらない） */
      else { var da = A.slice(hA, ia).join(''), ib = B.slice(hB, jb).join(''); if (da !== ib) ops.push(narrow(da, ib, posA[hA])); }
      hA = -1; hB = -1; };
    while (i < na && j < nb) {
      if (A[i] === B[j]) { flush(i, j); i++; j++; }
      else { if (hA < 0) { hA = i; hB = j; } if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; }
    }
    if (i < na || j < nb) { if (hA < 0) { hA = i; hB = j; } }
    flush(na, nb);
    return ops;
  }
  /* apply(a, ops) → 編集後の本文（ops は diff の出力。後ろから当てる） */
  function apply(a, ops) {
    var s = String(a == null ? '' : a), k;
    for (k = ops.length - 1; k >= 0; k--) { var o = ops[k]; if (s.substr(o.p, o.d.length) !== o.d) return null; s = s.slice(0, o.p) + o.i + s.slice(o.p + o.d.length); }
    return s;
  }
  function boundOps(ops) {
    var tr = 0, out = [], k;
    for (k = 0; k < ops.length && k < MAX_OPS; k++) {
      var o = ops[k], d = o.d, i = o.i;
      if (d.length > MAX_SPAN) { d = d.slice(0, MAX_SPAN); tr = 1; }
      if (i.length > MAX_SPAN) { i = i.slice(0, MAX_SPAN); tr = 1; }
      out.push(tr ? { p: o.p, d: d, i: i, dl: o.d.length, il: o.i.length } : { p: o.p, d: d, i: i });
    }
    if (ops.length > MAX_OPS) tr = 1;
    return { ops: out, tr: tr, n: ops.length };
  }
  /* makeRecord(before, after, ctx) — 入力を変えない */
  function makeRecord(before, after, ctx) {
    ctx = ctx || {};
    var raw = diff(before, after), b = boundOps(raw);
    var rec = { v: 1, eid: ctx.eid || newEid(), ts: ctx.ts || Date.now(), story: ctx.story || null, ti: ctx.ti, tk: ctx.tk || null,
      h0: hash(before), h1: hash(after), l0: String(before).length, l1: String(after).length,
      ops: b.ops, nops: b.n, tr: b.tr, rev0: ctx.rev0 == null ? null : ctx.rev0, g0: ctx.g0 == null ? null : ctx.g0,
      build: ctx.build || VER, src: 'edit' };
    if (ctx.e01) { rec.cd = ctx.e01.cd; rec.cr = ctx.e01.cr; rec.nq = ctx.e01.nq; }
    if (ctx.sfl) rec.sfl = ctx.sfl;
    if (JSON.stringify(rec).length > MAX_REC_CHARS) { rec.ops = null; rec.tr = 2; }
    if ((+ctx.storyChars || 0) > MAX_STORY_CHARS) { rec.ops = null; rec.tr = 3; }   /* 物語全体の記録が上限を超えたら、ハッシュと文字数だけ（鎖は切らない） */
    return rec;
  }
  /* 既存の配列に足して上限を守った新しい配列を返す（入力の配列は変えない） */
  function appendBounded(list, rec) {
    var L = (list || []).slice(), pd = 0;
    if (L.length && L[L.length - 1] && typeof L[L.length - 1].pd === 'number') pd = L[L.length - 1].pd;
    L.push(rec);
    while (L.length > MAX_REC) { L.shift(); pd++; }
    while (L.length > 1 && JSON.stringify(L).length > MAX_TURN_CHARS) { L.shift(); pd++; }
    if (pd) rec.pd = pd;
    return L;
  }
  var _eN = 0;
  function newEid() { _eN++; return 'e' + Date.now().toString(36) + Math.floor(Math.random() * 1679616).toString(36) + _eN.toString(36); }

  /* ---------- 実行環境 ---------- */
  var ST = { installed: false, reason: 'init', saves: 0, reverted: 0, records: 0, skippedSame: 0, skippedForeign: 0, staleIgnored: 0, last: null };
  function getS() {
    try { if (typeof root.__chronicleGetState === 'function') { var s = root.__chronicleGetState('edlog'); if (s) return s; } } catch (e) {}
    try { return (0, eval)('typeof S!=="undefined"?S:null'); } catch (e2) { return null; }
  }
  function getUI() { try { if (root.UI) return root.UI; } catch (e) {} try { return (0, eval)('typeof UI!=="undefined"?UI:null'); } catch (e2) { return null; } }
  function curRev() { try { var a = root.__v292Dfix705 && root.__v292Dfix705.docAuthority && root.__v292Dfix705.docAuthority(); return (a && typeof a.rev === 'number') ? a.rev : null; } catch (e) { return null; } }
  function f781Killed() { return lsGet('v292Dfix781Off') === '1'; }
  function m781() { try { var F = root.__v292Dfix781; if (!F || typeof F.marker !== 'function') return null; return F.marker(curSid()) || null; } catch (e) { return null; } }
  function genNow() { try { if (f781Killed()) return null; var m = m781(); return m ? (+m.localGeneration || 0) : null; } catch (e) { return null; } }
  function curBuild() { try { var sc = root.document && root.document.querySelector('script[src*="v292DfixEDLOG-narr-edit-log.js"]'); var m = sc && String(sc.getAttribute('src') || '').match(/[?&]cb=([^&]+)/); return (m ? m[1] : 'nocb') + '/' + VER; } catch (e) { return VER; } }
  function e01Info(idx) { try { var E = root.__v292DfixEDIT01, st = E && E.status && E.status(), l = st && st.last; if (!l || l.idx !== idx) return null; return { cd: (l.dropped || []).length, cr: (l.reworded || []).length, nq: l.newQuotes || 0 }; } catch (e) { return null; } }
  function sflInfo(idx) { try { var F = root.__v292DfixSFL1, st = F && F.status && F.status(), l = st && st.last; if (!l || l.idx !== idx || l.outcome !== 'pending' || !Array.isArray(l.items)) return null; return l.items.length || null; } catch (e) { return null; } }

  var _seq = 0;
  function storyChars(S) { var n = 0; try { (S.turns || []).forEach(function (t) { if (t && Array.isArray(t[FIELD])) n += JSON.stringify(t[FIELD]).length; }); } catch (e) {} return n; }
  /* その瞬間（本文は新しい文になっている）に記録を足す。足さないときは null */
  function attach(S, idx, turn, before) {
    var after = turn.narrative;
    if (typeof after !== 'string' || typeof before !== 'string') return null;
    if (after === before) { ST.skippedSame++; return null; }
    if (has(turn, FIELD) && !Array.isArray(turn[FIELD])) { ST.skippedForeign++; return null; }   /* 見知らぬ形は触らない */
    var rec = makeRecord(before, after, { story: curSid(), ti: idx, tk: hash(String(turn.inputType || '') + '|' + String(turn.playerText == null ? '' : turn.playerText)),
      rev0: curRev(), g0: genNow(), build: curBuild(), e01: e01Info(idx), sfl: sflInfo(idx), storyChars: storyChars(S) });
    var had = has(turn, FIELD), old = turn[FIELD], list = appendBounded(had ? old : [], rec);
    turn[FIELD] = list;
    return { turn: turn, had: had, old: old, list: list, rec: rec, idx: idx };
  }
  /* 記録を外す（EDIT-01 が本文を戻すのと同じ時点）。後から別の記録が足されていても、この eid の記録だけ外す */
  function detach(ctx) {
    if (!ctx) return;
    try {
      var t = ctx.turn, cur = t[FIELD];
      if (cur === ctx.list) { if (ctx.had) t[FIELD] = ctx.old; else delete t[FIELD]; }
      else if (Array.isArray(cur)) { var nl = cur.filter(function (r) { return !(r && r.eid === ctx.rec.eid); }); if (nl.length !== cur.length) { if (!nl.length && !ctx.had) delete t[FIELD]; else t[FIELD] = nl; } }
    } catch (e) {}
    ST.reverted++;
  }
  function watchCloud(seq, res, ctx) {   /* live の状態だけ（保存データには書かない）。SFL1 r7c と同じ根拠: fix781 の印 */
    var t0 = Date.now(), iv = null;
    var tick = function () {
      if (seq !== _seq) { clearInterval(iv); return; }
      if (f781Killed() || res.gen === null || res.g0 === null || !(res.gen > res.g0)) { res.state4 = 'cloud_unknown'; clearInterval(iv); return; }
      var m = m781(); if (!m) { res.state4 = 'cloud_unknown'; if (Date.now() - t0 > 600000) clearInterval(iv); return; }   /* 印が一時的に読めないだけのことがある（実測）→ 見張りは続ける */
      if (m.state === 'DIVERGED') { res.state4 = 'local_only_conflict'; clearInterval(iv); return; }
      if (m.state === 'CLEAN' && (+m.localGeneration || 0) >= res.gen) {
        var still = false; try { still = Array.isArray(ctx.turn[FIELD]) && ctx.turn[FIELD].some(function (r) { return r && r.eid === ctx.rec.eid; }) && hash(ctx.turn.narrative) === ctx.rec.h1; } catch (e) {}
        res.state4 = still ? 'cloud_confirmed' : 'cloud_unknown'; if (!still) res.why = 'changed-after'; clearInterval(iv); return; }
      if (Date.now() - t0 > 600000) clearInterval(iv);
    };
    iv = setInterval(tick, 500);
  }

  function makeSaveEdit(inner) {
    var w = function saveEdit() {
      var self = this, args = arguments;
      if (!active()) return inner.apply(self, args);
      var S = getS();
      if (!S || !(S.editIdx >= 0) || !S.turns || !S.turns[S.editIdx] || typeof S.saveD !== 'function') return inner.apply(self, args);
      var idx = S.editIdx, turn = S.turns[idx], before = turn.narrative;
      var real = S.saveD, hadOwn = has(S, 'saveD'), ctx = null, done = false, seq = 0;
      var restore = function () { try { if (S.saveD === oneShot) { if (hadOwn) S.saveD = real; else delete S.saveD; } } catch (e) {} };
      var fail = function (why) { if (done) return; done = true; if (!ctx) return; detach(ctx); ST.last = { idx: idx, eid: ctx.rec.eid, outcome: 'reverted:' + why, state4: 'not_saved' }; };
      var ok = function () { if (done) return; done = true; if (!ctx) return; ST.saves++; ST.records++;
        var res = ST.last = { idx: idx, eid: ctx.rec.eid, outcome: 'saved-local', state4: 'cloud_unknown', g0: ctx.rec.g0, gen: genNow(), nops: ctx.rec.nops, tr: ctx.rec.tr };
        watchCloud(seq, res, ctx); };
      var oneShot = function () {
        restore();
        try { ctx = attach(S, idx, turn, before); } catch (e) { ctx = null; try { console.warn(TAG, 'attach err', e && e.message); } catch (_) {} }
        if (ctx) seq = ++_seq;
        var p;
        try { p = real.apply(this === undefined ? S : this, arguments); } catch (e) { fail('saveD-throw'); throw e; }
        Promise.resolve(p).then(function (x) { if (!x || x.ran !== true) fail('ran-false'); else ok(); }, function () { fail('rejected'); });
        return p;
      };
      S.saveD = oneShot;
      try { return inner.apply(self, args); }
      finally { restore(); }
    };
    w.__edlog = true;
    try { if (inner.__sfl1) w.__sfl1 = true; if (inner.__edit01) w.__edit01 = true; } catch (e) {}
    w.__inner = inner;
    return w;
  }

  function install() {
    if (!active()) { ST.reason = 'inactive'; return 'stop'; }
    var UI = getUI();
    if (!UI || typeof UI.saveEdit !== 'function') { ST.reason = 'no-UI'; return false; }
    if (UI.saveEdit.__edlog) { ST.installed = true; ST.reason = 'ok'; return true; }
    /* SFL1 が最外に包み終わるのを待つ（先に包むと SFL1 が EDIT-01 の印を見つけられず入らなくなる） */
    var F = root.__v292DfixSFL1;
    if (!UI.saveEdit.__sfl1) {
      var r = null; try { r = F && F.status ? F.status().reason : null; } catch (e) {}
      if (F && (r === 'init' || r === 'no-UI' || r === 'no-edit01' || r === 'wait-edit01')) { ST.reason = 'wait-sfl1'; return false; }
    }
    var w = makeSaveEdit(UI.saveEdit); UI.saveEdit = w;
    ST.installed = true; ST.reason = 'ok';
    return true;
  }

  /* ---------- 診断（コンソールのみ） ---------- */
  function list(ti) { var S = getS(), t = S && S.turns && S.turns[ti]; return (t && Array.isArray(t[FIELD])) ? t[FIELD].slice() : []; }
  function verify(ti) {   /* 記録の鎖（h1→次の h0）と、最後の h1 が今の本文と一致するか */
    var S = getS(), t = S && S.turns && S.turns[ti], L = (t && Array.isArray(t[FIELD])) ? t[FIELD] : [], out = { ti: ti, n: L.length, chain: true, tail: null, replay: [] };
    for (var k = 0; k < L.length; k++) { if (k && L[k - 1].h1 !== L[k].h0) out.chain = false; }
    if (L.length && t) out.tail = (L[L.length - 1].h1 === hash(t.narrative));
    return out;
  }
  function status() {
    var S = getS(), turnsWith = 0, recs = 0, chars = 0;
    try { (S && S.turns || []).forEach(function (t) { var L = t && Array.isArray(t[FIELD]) ? t[FIELD] : null; if (!L || !L.length) return; turnsWith++; recs += L.length; chars += JSON.stringify(L).length; }); } catch (e) {}
    var last = null; try { last = ST.last ? JSON.parse(JSON.stringify(ST.last)) : null; } catch (e) {}
    return { ver: VER, enabled: active(), flagOn: flagOn(), story: curSid(), target: TARGET, installed: ST.installed, reason: ST.reason, saves: ST.saves, reverted: ST.reverted, records: ST.records,
      skippedSame: ST.skippedSame, skippedForeign: ST.skippedForeign, turnsWithLog: turnsWith, recordsInStory: recs, chars: chars, last: last };
  }
  function purge() {   /* 手動のみ: この物語の全ターンから _narrEdits を外して保存 */
    var S = getS(), n = 0; if (!S || !Array.isArray(S.turns)) return Promise.resolve({ ok: false, why: 'no-S' });
    if (curSid() !== TARGET) return Promise.resolve({ ok: false, why: 'not-target' });
    S.turns.forEach(function (t) { if (t && has(t, FIELD)) { n += Array.isArray(t[FIELD]) ? t[FIELD].length : 1; delete t[FIELD]; } });
    if (!n) return Promise.resolve({ ok: true, purged: 0 });
    var p; try { p = S.saveD('EDLOG.purge'); } catch (e) { p = Promise.reject(e); }
    return Promise.resolve(p).then(function (x) { return { ok: !!(x && x.ran === true), purged: n }; }, function () { return { ok: false, purged: n }; });
  }

  var api = { ver: VER, enabled: active, status: status, list: list, verify: verify, diff: diff, apply: apply, hash: hash, makeRecord: makeRecord, appendBounded: appendBounded, install: install, purge: purge,
    limits: { MAX_REC: MAX_REC, MAX_OPS: MAX_OPS, MAX_SPAN: MAX_SPAN, MAX_REC_CHARS: MAX_REC_CHARS, MAX_TURN_CHARS: MAX_TURN_CHARS, MAX_STORY_CHARS: MAX_STORY_CHARS } };
  root.__v292DfixEDLOG = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  /* ---------- 起動（無効なら何もしない。SFL1 の包みを待ってから最外に包む） ---------- */
  try {
    if (root.document) {
      var r0 = install();
      if (r0 !== true && r0 !== 'stop') {
        var tries = 0, iv = setInterval(function () { tries++; var r = install(); if (r === true || r === 'stop' || tries > 100) { clearInterval(iv); if (!ST.installed && ST.reason !== 'inactive') { try { console.warn(TAG, 'not installed:', ST.reason); } catch (_) {} } } }, 250);
      }
    }
  } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
