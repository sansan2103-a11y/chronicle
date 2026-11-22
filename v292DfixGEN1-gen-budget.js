/* =====================================================================
 * v292DfixGEN1-gen-budget.js — 世代の写し（__gen_）の容量の予算（★GEN1 r3・GPT #127-UN / #127-UR / #127-UT・2026-11-16・既定 OFF）
 * ---------------------------------------------------------------------
 * ■前提（fix228 v292Dfix228-slot-generations.js）
 *   __gen_chr6_slot_<id> = [{t, turns, data: 本体の生 JSON 全文}, …] 新しい順・最大 3。物語画面で 2 秒ごとに見て、ターン数が
 *   変わったら「変わる前の本体」を先頭に足す（＝開いている物語だけが育つ）。読むのは console の __v292Restore()/__v292Gens()（手動）だけ。
 * ■すること（v292DfixGEN1On='1' のときだけ。既定は何もしない）
 *   __gen_ の合計（キー名＋値の字数）が BUDGET_CHARS（40 万字・ソフト上限）を超え、かつ「守る分だけでは超えない」ときだけ、
 *   次の条件を全部確かめられた生きている物語の __gen_ を「最新の有効な 1 世代」だけにする（キーは消さない）。1 回の実行で 1 本。
 *   (a) 所属（#127-UT 1(a)）: 鍵 __gen_chr6_slot_<id> から id を完全一致で取り、物語一覧（chr6_slots_meta）に生きた行がちょうど 1 行。
 *       かつアカウントが確定: iso2 の持ち主（この画面のアカウント・食い違いなし・anon / conflict でない）と、その物語の記録
 *       （iso2 stampOf(id,'s') の c と w）が一致。記録が無い・読めない → 所属不明として残す。
 *       世代の data の指紋が別の物語のもの・読めない → 残す。指紋が無いことは削除の根拠にしない（根拠は鍵とアカウントの記録だけ）。
 *   (b) 同期（#127-UT 1(b)）: 端末の印で、同期の印 v292Dfix402_f781g_<id> が CLEAN・送信中でない・storyId 一致・
 *       lastConfirmed.serverRev（数）と fingerprint（64 桁）がある、かつ端末の今の内容の V2 hash（fix697.contentHashV2）＝fingerprint。
 *       さらに既存の口 fix697.getStoryV2Once で 1 回読み、rev＝lastConfirmed.serverRev・serverHash＝fingerprint・deleted でない・canonical。
 *       getstory は 1 回の dryRun / run で MAX_SERVER_CHECKS 本まで（数える）。未同期キュー（f911・f697p・rescue・dl2conflict・fix750・fix587）なし。
 *       確認が 1 つでも欠けたら残す。
 *   唯一のローカル復旧元: 本体 chr6_slot_<id> が無い・読めない・turns が無い、または本体のターン数が世代のどれかより少ない → 世代を全部残す。
 *   残す世代: 新しい順で最初の「data が読めて turns を持つ」世代。それが無い → 全部残す。
 *   そのほか: 開いていない（この画面・active_slot・10 分以内・Web Lock）・Vault／パスコードでない（判断できない → 残す）。
 *   削除済みの物語の __gen_ はここでは扱わない（STORE1b の AUTOCLEAN1 の担当。r3 で本体の無い削除済みの物語の __gen_ も足した）。
 * ■r4（独立レビュー）: 旧 id（a・b・c・default・chr6）と形の違う id（STORE1b と同じ /^s[0-9a-z]{8,10}$/ でない）は対象外。
 *   前回の続きから回す（v292DfixGEN1Cur）・確かめられなかった物語は印・本体・世代が変わるまで聞かない（v292DfixGEN1Unc・最大 50）。
 *   自動の run は 24 時間に 1 回（v292DfixGEN1Last）。この 3 つの鍵を書くのは On のときの run だけ。
 * ■口: window.__v292DfixGEN1.dryRun() → Promise（書き込み 0。数と理由コードだけ。キー名・id・本文は出さない）
 *        .run() → Promise（On のときだけ・1 回 1 本）・.status()。On のときは物語画面を開いて 30 秒後に 1 回 run()。
 *   kill: v292DfixGEN1Off='1'（dryRun も含めて何もしない）。記録はメモリだけ。
 * ===================================================================== */
(function () {
  'use strict';
  var W = (typeof window !== 'undefined') ? window : globalThis;
  if (W.__v292DfixGEN1) return;
  var VER = 'gen1-20261116-r4', ON = 'v292DfixGEN1On', OFF = 'v292DfixGEN1Off';
  var BUDGET_CHARS = 400000, RECENT_OPEN_MS = 10 * 60 * 1000, AUTO_DELAY_MS = 30000, MAX_PER_RUN = 1, MAX_SERVER_CHECKS = 3;
  var PREFIX = '__gen_chr6_slot_', HEX64 = /^[0-9a-f]{64}$/;
  /* ★r4: STORE1b と同じ id の形・旧 id の表（a・b・c・default・chr6 は対象外） */
  var ID_RE = /^s[0-9a-z]{8,10}$/, LEGACY = { a: 1, b: 1, c: 1, 'default': 1, chr6: 1 };
  /* ★r4: 回し方（AUTOCLEAN1 r2 と同じ型）。前回どこまで見たか（id の指紋 8 字）と、確かめられなかった物語（指紋 → 印の署名）を覚える。
     run（On）のときだけ書く。dryRun は読むだけ。自動の run は 24 時間に 1 回。 */
  var CUR_K = 'v292DfixGEN1Cur', UNC_K = 'v292DfixGEN1Unc', LAST_K = 'v292DfixGEN1Last', UNC_MAX = 50, AUTO_GAP_MS = 24 * 3600 * 1000;
  function fnv8(s) { var h = 0x811c9dc5; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; } return ('0000000' + h.toString(16)).slice(-8); }
  function fpId(id) { return fnv8('gen1:' + id); }
  var st = { dry: 0, runs: 0, trimmed: 0, freedChars: 0, getstory: 0, skipped: {}, last: null, err: 0 };
  function ls() { try { return W.localStorage; } catch (e) { return null; } }
  function g(k) { try { var L = ls(); return L ? L.getItem(k) : null; } catch (e) { return null; } }
  function J(s, d) { try { return JSON.parse(s); } catch (e) { return d; } }
  function isArr(a) { return Object.prototype.toString.call(a) === '[object Array]'; }
  function off() { return g(OFF) === '1'; }
  function on() { return !off() && g(ON) === '1'; }
  function curDocId() { try { var k = W.__chronicleDocumentStoryKey; if (typeof k === 'string' && k) return k === 'chr6' ? 'default' : k.replace(/^chr6_slot_/, ''); } catch (e) {} return null; }
  function genKeys() { var out = []; try { var L = ls(); for (var i = 0; i < L.length; i++) { var k = L.key(i); if (k && k.indexOf('__gen_') === 0) out.push(k); } } catch (e) {} return out; }

  function vaultWhy(id) {
    try { var U = W.__v292DfixVAULTUNI1; if (U && U.on()) { var uv = U.del(id, 'gen1'); if (uv === 'vault') return 'vault'; if (uv === 'hold') return 'vault-v2-pending'; } } catch (eU) { return 'vault-check-threw'; }   /* ★VAULTUNI1 */
    var vh = g('chr6_vault_hidden');
    if (vh != null) { var v = J(vh, null); if (!v || typeof v !== 'object' || isArr(v)) return 'vault-cache-unreadable'; if (v.hidden !== undefined && !isArr(v.hidden)) return 'vault-cache-unreadable'; if (isArr(v.hidden) && v.hidden.map(String).indexOf(id) >= 0) return 'vault'; }
    try { var F = W.__v292Dfix889; if (!F || typeof F.isHidden !== 'function' || typeof F.hiddenIds !== 'function') return 'vault-unavailable';
      if (F.isHidden(id)) return 'vault'; var hs = F.hiddenIds(); if (!isArr(hs)) return 'vault-state-unknown'; if (hs.map(String).indexOf(id) >= 0) return 'vault'; } catch (e) { return 'vault-check-threw'; }
    if (g('chr6_storysess_' + id) != null) return 'passcode';
    try { if (W.sessionStorage && W.sessionStorage.getItem('chr6_storysess_' + id) != null) return 'passcode'; } catch (e2) { return 'vault-check-threw'; }
    return null;
  }
  /* (a) アカウントの確定と、その物語の持ち主の記録（iso2）。null = 一致 */
  function accountWhy(id) {
    try {
      var I = W.__v292Diso2; if (!I || typeof I.owner !== 'function' || typeof I.stampOf !== 'function') return 'account-unknown';
      var o = I.owner(); if (!o || o.bad || typeof o.now !== 'string' || !o.now || !o.docKind || o.docKind === 'anon' || o.docKind === 'conflict') return 'account-unknown';
      if (o.doc && o.doc !== o.now) return 'account-unknown';
      if (typeof I.status === 'function') { var s = I.status(); if (s && s.consistent === false) return 'account-unknown'; }
      var sp = I.stampOf(id, 's'); if (!sp || typeof sp !== 'object' || typeof sp.c !== 'string' || !sp.c) return 'owner-unknown';
      if (sp.c !== o.now || (sp.w != null && sp.w !== o.now)) return 'owner-foreign';
      return null;
    } catch (e) { return 'account-unknown'; }
  }
  function fpOf(d) { try { if (!d || typeof d !== 'object') return null; var c = [d.slotId, d.storyId, d._slot, d.cfg && d.cfg.slotId, d.cfg && d.cfg.storyId, d.scene && d.scene.slotId, d.scene && d.scene.storyId];
    for (var i = 0; i < c.length; i++) if (typeof c[i] === 'string' && c[i]) return c[i]; return null; } catch (e) { return null; } }
  function turnsN(d) { return (d && typeof d === 'object' && isArr(d.turns)) ? d.turns.length : -1; }
  /* 世代の読み取り: 別の物語の指紋 → 残す。残す 1 世代＝新しい順で最初の有効な世代。{ why } か { keep, maxTurns } */
  function genWhy(id, gens) {
    var keep = -1, maxT = -1;
    for (var i = 0; i < gens.length; i++) { var x = gens[i]; if (!x || typeof x !== 'object' || typeof x.data !== 'string') return { why: 'gen-shape-unknown' };
      var d = J(x.data, null); if (d && typeof d === 'object') { var f = fpOf(d); if (f && f !== id && f !== 'chr6_slot_' + id) return { why: 'owner-foreign-gen' }; }
      var n = turnsN(d); if (n > maxT) maxT = n; if (keep < 0 && n >= 0) keep = i; }
    if (keep < 0) return { why: 'no-valid-gen' };
    return { keep: keep, maxTurns: maxT };
  }
  /* 唯一のローカル復旧元か: 本体が無い・読めない・turns が無い・世代より短い → 残す */
  function bodyWhy(id, maxTurns) {
    var raw = g('chr6_slot_' + id); if (raw == null) return 'body-missing';
    var b = J(raw, null); var n = turnsN(b); if (n < 0) return 'body-unreadable';
    if (n < maxTurns) return 'body-behind-gen';
    return null;
  }
  /* 同期の端末の印（(b) の前半）。null = 揃っている */
  function markerOf(id) { var mk = g('v292Dfix402_f781g_' + id); return mk == null ? null : J(mk, null); }
  function localWhy(id, meta, now) {
    if (!id || LEGACY[id] === 1) return 'legacy-id';
    if (!ID_RE.test(id)) return 'id-shape';
    if (!isArr(meta)) return 'meta-unreadable';
    var live = 0, tomb = 0, row = null;
    for (var i = 0; i < meta.length; i++) { var e = meta[i]; if (!e || String(e.id) !== id) continue; if (e.deleted === true) tomb++; else { live++; row = e; } }
    if (tomb) return 'tombstoned';
    if (live !== 1) return live ? 'dup-live-row' : 'not-in-list';
    if (curDocId() === id) return 'open-here';
    var act = g('chr6_active_slot'); if (act != null && (act === id || J(act, null) === id || act === 'chr6_slot_' + id)) return 'active-slot';
    var lo = row && row.lastOpenedAt ? Date.parse(row.lastOpenedAt) : 0; if (lo && now - lo < RECENT_OPEN_MS) return 'recently-opened';
    var aw = accountWhy(id); if (aw) return aw;
    if (g('v292Dfix402_f781g_' + id) == null) return 'no-sync-marker';
    var mo = markerOf(id); if (!mo || typeof mo !== 'object') return 'marker-unreadable';
    if (String(mo.state || '') !== 'CLEAN') return 'unsynced';
    if (mo.inFlightSave) return 'in-flight';
    if (mo.storyId == null || String(mo.storyId) !== id) return 'marker-id-mismatch';
    var lc = mo.lastConfirmed; if (!lc || typeof lc.serverRev !== 'number' || !isFinite(lc.serverRev) || typeof lc.fingerprint !== 'string' || !HEX64.test(lc.fingerprint)) return 'ack-unconfirmed';
    if (g('v292Dfix402_f911_' + id) != null) return 'stash';
    if (g('v292Dfix402_f697p_' + id) != null) return 'journal';
    if (g('v292Dfix945_rescue_' + id) != null) return 'rescue';
    var cf = g('v292Dfix587_dl2conflict'); if (cf != null) { var co = J(cf, null); if (!co || typeof co !== 'object') return 'conflict-unreadable'; if (Object.prototype.hasOwnProperty.call(co, id)) return 'conflict'; }
    var mt = g('v292Dfix750_matTxn'); if (mt != null) { var to = J(mt, null); if (!to || typeof to !== 'object') return 'mat-journal-unreadable'; if (String(to.storyId) === id || String(to.slotId) === id) return 'mat-journal'; }
    var pd = g('v292Dfix587_pending'); if (pd != null) { var pa = J(pd, null); if (!isArr(pa)) return 'pending-unreadable';
      for (var p = 0; p < pa.length; p++) { var pl = pa[p]; if (!pl) continue; if (String(pl.slotId) !== id && String(pl.storyId || '') !== id) continue; return 'delete-plan-open'; } }
    var vw = vaultWhy(id); if (vw) return vw;
    return null;
  }
  /* (b) の後半: 端末の内容の hash と、既存の getstory の口で読んだサーバーの rev / hash。null = 一致 */
  function syncWhy(id, mo, budget) {
    var F = W.__v292Dfix697;
    if (!F || typeof F.contentHashV2 !== 'function' || typeof F.getStoryV2Once !== 'function') return Promise.resolve('sync-port-unavailable');
    var lc = mo.lastConfirmed;
    return new Promise(function (res) { try { F.contentHashV2(id, function (h) { res(h || null); }); } catch (e) { res(null); } }).then(function (h) {
      if (!h) return 'fingerprint-unavailable';
      if (h !== lc.fingerprint) return 'fingerprint-mismatch';
      if (budget.left <= 0) return 'server-check-budget';
      budget.left--; budget.used++; st.getstory++;
      return new Promise(function (res) { try { F.getStoryV2Once(id, function (r, err) { res(err ? null : r); }); } catch (e) { res(null); } }).then(function (r) {
        var j = r && r.j;
        if (!r || r.status !== 200 || !j || j.ok !== true) return 'server-unconfirmed';
        if (j.deleted) return 'server-deleted';
        if (String(j.authority || '') !== 'canonical') return 'server-authority';
        if (j.rev !== lc.serverRev) return 'rev-mismatch';
        if (String(j.serverHash || '') !== lc.fingerprint) return 'server-hash-mismatch';
        return null;
      });
    });
  }
  function gensOf(raw) { var a = J(raw, null); return isArr(a) ? a : null; }

  function sigOf(id, v) { var b = g('chr6_slot_' + id); return fnv8(String(g('v292Dfix402_f781g_' + id)) + '|' + (b == null ? -1 : b.length) + '|' + (v == null ? -1 : v.length)); }
  function loadUnc() { var o = J(g(UNC_K) || 'null', null); return (o && typeof o === 'object' && !isArr(o)) ? o : {}; }
  function saveUnc(o) { var ks = Object.keys(o); while (ks.length > UNC_MAX) { delete o[ks.shift()]; } try { W.localStorage.setItem(UNC_K, JSON.stringify(o)); } catch (e) {} }
  /* 計画（書き込み 0）。getstory は budget の本数まで。mode.write のとき（run）だけ、確かめられなかった物語と続きの位置を覚える */
  function plan(budget, mode) {
    mode = mode || {};
    var now = Date.now(), meta = J(g('chr6_slots_meta') || '[]', null);
    var keys = genKeys(), total = 0, rows = [], excluded = {}, exChars = {};
    function ex(why, size) { excluded[why] = (excluded[why] || 0) + 1; exChars[why] = (exChars[why] || 0) + size; }
    keys.forEach(function (k) {
      var v = g(k); var size = k.length + (v == null ? 0 : v.length); total += size;
      if (k.indexOf(PREFIX) !== 0) return ex('default-slot', size);
      var id = k.slice(PREFIX.length);
      var why = localWhy(id, meta, now); if (why) return ex(why, size);
      var gens = gensOf(v); if (!gens) return ex('gen-unreadable', size);
      if (gens.length <= 1) return ex('already-small', size);
      var gw = genWhy(id, gens); if (gw.why) return ex(gw.why, size);
      var bw = bodyWhy(id, gw.maxTurns); if (bw) return ex(bw, size);
      var nv = JSON.stringify([gens[gw.keep]]);
      var row = null; for (var i = 0; i < meta.length; i++) if (meta[i] && String(meta[i].id) === id && meta[i].deleted !== true) row = meta[i];
      rows.push({ key: k, id: id, fp: fpId(id), sig: sigOf(id, v), size: size, save: v.length - nv.length, nv: nv, value: v, marker: g('v292Dfix402_f781g_' + id), lo: (row && row.lastOpenedAt) ? (Date.parse(row.lastOpenedAt) || 0) : 0 });
    });
    rows.sort(function (a, b) { return a.lo - b.lo; });   /* 最後に開いたのが古い順 */
    /* 守る分だけで上限を超えるなら（端末の印で候補になった分をすべて減らしても超えるなら）サーバーに聞かず 0 本 */
    var optimistic = total; rows.forEach(function (x) { optimistic -= x.save; });
    var base = { total: total, budget: BUDGET_CHARS, over: total > BUDGET_CHARS, localCandidates: rows.length, excluded: excluded, excludedChars: exChars };
    if (total <= BUDGET_CHARS) return Promise.resolve(Object.assign(base, { noop: 'under-budget', confirmed: [], protectedChars: total, projected: total }));
    if (optimistic > BUDGET_CHARS) return Promise.resolve(Object.assign(base, { noop: 'protected-over-budget', confirmed: [], protectedChars: optimistic, projected: total }));
    /* ★r4: 前回の続きから回す。確かめられなかった物語は、印・本体・世代が変わるまで聞かない */
    var unc = loadUnc(), cur = g(CUR_K), start = 0, uncDirty = false, lastFp = null;
    if (typeof cur === 'string' && /^[0-9a-f]{8}$/.test(cur)) { for (var c0 = 0; c0 < rows.length; c0++) if (rows[c0].fp === cur) { start = (c0 + 1) % rows.length; break; } }
    var order = rows.slice(start).concat(rows.slice(0, start));
    /* 覚えている（確かめられなかった）物語を守る側に数えても上限を超えるなら、サーバーに聞かず 0 本 */
    var opt2 = total; order.forEach(function (x) { if (unc[x.fp] !== x.sig) opt2 -= x.save; });
    if (opt2 > BUDGET_CHARS) { order.forEach(function (x) { if (unc[x.fp] === x.sig) ex('remembered-unconfirmed', x.size); });
      return Promise.resolve(Object.assign(base, { noop: 'protected-over-budget', confirmed: [], remembered: order.filter(function (x) { return unc[x.fp] === x.sig; }).length, protectedChars: opt2, projected: total })); }
    var confirmed = [], unverified = 0, remembered = 0, chain = Promise.resolve();
    order.forEach(function (x) { chain = chain.then(function () {
      if (unc[x.fp] === x.sig) { remembered++; ex('remembered-unconfirmed', x.size); return; }
      if (budget.left <= 0) { unverified++; return; }
      lastFp = x.fp;
      return syncWhy(x.id, markerOf(x.id), budget).then(function (w) {
        if (w) { if (w === 'server-check-budget') unverified++; else { ex(w, x.size); if (mode.write) { unc[x.fp] = x.sig; uncDirty = true; } } }
        else { confirmed.push(x); if (mode.write && unc[x.fp] != null) { delete unc[x.fp]; uncDirty = true; } }
      });
    }); });
    return chain.then(function () {
      if (mode.write) { if (uncDirty) saveUnc(unc); if (lastFp) { try { W.localStorage.setItem(CUR_K, lastFp); } catch (eC) {} } }
      /* 確かめられなかった候補は守る側に数える */
      var keptMin = total; confirmed.forEach(function (x) { keptMin -= x.save; });
      var pick = [], projected = total, noop = null;
      if (keptMin > BUDGET_CHARS) noop = 'protected-over-budget';
      else for (var r = 0; r < confirmed.length && projected > BUDGET_CHARS; r++) { pick.push(confirmed[r]); projected -= confirmed[r].save; }
      if (!noop && !pick.length) noop = 'none-confirmed';
      return Object.assign(base, { noop: noop, confirmed: pick, confirmedCount: confirmed.length, unverified: unverified, remembered: remembered, protectedChars: keptMin, projected: projected });
    });
  }
  function counts(p, budget) {
    var first = p.confirmed.slice(0, MAX_PER_RUN);
    return { ok: true, total: p.total, budget: p.budget, over: p.over, noop: p.noop, protectedChars: p.protectedChars, localCandidates: p.localCandidates,
      confirmedCandidates: p.confirmedCount || 0, unverified: p.unverified || 0, remembered: p.remembered || 0,
      wouldTrim: p.confirmed.length, wouldFree: p.confirmed.reduce(function (s, x) { return s + x.save; }, 0), projected: p.projected,
      thisRun: { maxPerRun: MAX_PER_RUN, trim: first.length, free: first.reduce(function (s, x) { return s + x.save; }, 0) },
      getstoryCalls: budget.used, excluded: p.excluded, excludedChars: p.excludedChars, on: on() };
  }
  /* 書き込み 0（getstory の読みだけ。本数は getstoryCalls） */
  function dryRun() {
    if (off()) return Promise.resolve({ ok: false, why: 'off' });
    st.dry++;
    var budget = { left: MAX_SERVER_CHECKS, used: 0 };
    return plan(budget).then(function (p) { return counts(p, budget); }, function () { st.err++; return { ok: false, why: 'error' }; });
  }
  function withLock(name, fn) {
    try { var L = W.navigator && W.navigator.locks; if (!L || typeof L.request !== 'function') return Promise.resolve(fn(null, 'locks-unavailable'));
      return L.request(name, { mode: 'exclusive', ifAvailable: true }, function (lk) { return fn(lk, lk ? null : 'open-lock'); }); }
    catch (e) { return Promise.resolve(fn(null, 'lock-threw')); }
  }
  function skip(why) { st.skipped[why] = (st.skipped[why] || 0) + 1; }
  function run() {
    if (!on()) return Promise.resolve({ ok: false, why: off() ? 'off' : 'not-on' });
    st.runs++;
    var budget = { left: MAX_SERVER_CHECKS, used: 0 }, done = { trimmed: 0, freed: 0 };
    return plan(budget, { write: true }).then(function (p) {
      try { var U = W.__v292DfixVAULTUNI1; if (U && U.on()) U.hold('gen1', function () { st.vuRerun = (st.vuRerun || 0) + 1; run(); }); } catch (eH) {}   /* ★VAULTUNI1: 分からなかった物語は、判定が取れてから run を最初からやり直す */
      if (!p.over || !p.confirmed.length) { st.last = { at: Date.now(), trimmed: 0, freed: 0, noop: p.noop, getstory: budget.used }; return { ok: true, trimmed: 0, freed: 0, noop: p.noop, getstoryCalls: budget.used }; }
      var chain = Promise.resolve();
      p.confirmed.slice(0, MAX_PER_RUN).forEach(function (x) {
        chain = chain.then(function () {
          return withLock('chronicle:story-open:' + x.id, function (lk, why) {
            if (!lk) { skip(why); return; }
            /* Web Lock の中で読み直す（同期で）: 条件・印・値・世代・本体 */
            var w2 = localWhy(x.id, J(g('chr6_slots_meta') || '[]', null), Date.now()); if (w2) { skip('recheck-' + w2); return; }
            if (g('v292Dfix402_f781g_' + x.id) !== x.marker) { skip('marker-changed'); return; }
            var v2 = g(x.key); if (v2 !== x.value) { skip('changed'); return; }
            var gens = gensOf(v2); var gw = gens ? genWhy(x.id, gens) : { why: 'x' }; if (!gens || gens.length <= 1 || gw.why || bodyWhy(x.id, gw.maxTurns)) { skip('changed'); return; }
            var nv = JSON.stringify([gens[gw.keep]]); if (nv !== x.nv) { skip('changed'); return; }
            try { W.localStorage.setItem(x.key, nv); } catch (e) { skip('write-failed'); return; }
            if (g(x.key) !== nv) { skip('readback-mismatch'); return; }
            done.trimmed++; done.freed += v2.length - nv.length; st.trimmed++; st.freedChars += v2.length - nv.length;
          });
        });
      });
      return chain.then(function () { st.last = { at: Date.now(), trimmed: done.trimmed, freed: done.freed, getstory: budget.used }; return { ok: true, trimmed: done.trimmed, freed: done.freed, getstoryCalls: budget.used }; });
    }).then(null, function () { st.err++; return { ok: false, why: 'error' }; });
  }
  /* 自動の run は 24 時間に 1 回（試みる前に時刻を書く＝物語の画面を開くたびに問い合わせない）。手動の run() は制限しない */
  function autoDue() { var t = +g(LAST_K) || 0, n = Date.now(); return !(t > 0 && n >= t && n - t < AUTO_GAP_MS); }
  function autoRun() { if (!on() || !autoDue()) { st.autoSkipped = (st.autoSkipped || 0) + 1; return; } try { W.localStorage.setItem(LAST_K, String(Date.now())); } catch (e) { return; } run(); }
  try { if (on() && typeof setTimeout === 'function' && curDocId()) setTimeout(function () { try { autoRun(); } catch (e) { st.err++; } }, AUTO_DELAY_MS); } catch (e) {}
  W.__v292DfixGEN1 = { VER: VER, dryRun: dryRun, run: run, autoRun: autoRun,
    LIMITS: { BUDGET_CHARS: BUDGET_CHARS, RECENT_OPEN_MS: RECENT_OPEN_MS, MAX_PER_RUN: MAX_PER_RUN, MAX_SERVER_CHECKS: MAX_SERVER_CHECKS, AUTO_GAP_MS: AUTO_GAP_MS },
    status: function () { var o = JSON.parse(JSON.stringify(st)); o.ver = VER; o.on = on(); o.off = off(); return o; } };
})();
