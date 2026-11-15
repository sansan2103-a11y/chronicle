/* =====================================================================
 * v292DfixGEN1-gen-budget.js — 世代の写し（__gen_）の容量の予算（★GEN1・GPT #127-UN・2026-11-16・既定 OFF）
 * ---------------------------------------------------------------------
 * ■前提（fix228 v292Dfix228-slot-generations.js）
 *   __gen_chr6_slot_<id> = [{t, turns, data: 本体の生 JSON 全文}, …] 新しい順・最大 3。物語画面で 2 秒ごとに見て、ターン数が
 *   変わったら「変わる前の本体」を先頭に足す（＝開いている物語だけが育つ）。読むのは console の __v292Restore()/__v292Gens()（手動）だけ。
 *   消えるのは fix264b（保存が容量で失敗したときに全 __gen_ を 1 世代ずつ間引く）と STORE1b の手動の片づけ（削除済みの物語）だけ。
 * ■すること（v292DfixGEN1On='1' のときだけ。既定は何もしない）
 *   端末の __gen_ の合計（キー名＋値の文字数）が BUDGET_CHARS を超えているときだけ、次の条件を全部満たす物語の __gen_ を
 *   「最新の 1 世代だけ」に減らす（キーは消さない・0 世代にしない）。最後に開いた時刻が古い物語から順に、予算の内側に入るまで。
 *     ・物語一覧（chr6_slots_meta）に生きた行が 1 行ある（削除済み・墓標・一覧に無い・既定の chr6 は対象外＝STORE1b の担当）
 *     ・いま開いていない: この画面の物語でない・chr6_active_slot でない・lastOpenedAt が 10 分以内でない・
 *       Web Lock chronicle:story-open:<id>（物語画面が持つ・SOL1）を ifAvailable で取れる（取れない／Locks API が無い → 減らさない）
 *     ・同期済み: 同期の印 v292Dfix402_f781g_<id> があり state === 'CLEAN'・送信中でない・storyId 一致
 *     ・未送信の写し・競合・復旧の印が無い: v292Dfix402_f911_<id>・v292Dfix402_f697p_<id>・v292Dfix945_rescue_<id>・
 *       v292Dfix587_dl2conflict の該当・v292Dfix750_matTxn の該当・v292Dfix587_pending の未完了の削除計画
 *     ・Vault で隠していない・パスコードのセッションが無い（chr6_vault_hidden・fix889・chr6_storysess_<id>。判断できない → 減らさない）
 *     ・__gen_ の値が読めて、世代が 2 つ以上ある
 *   判断できないものは全部「減らさない」（fail-closed）。減らす直前に Web Lock の中で条件と値を読み直し、違えば何もしない。
 * ■r2（GPT #127-UR）: 40 万字はソフト上限（保護される分だけで超えるなら 0 本）・1 回の実行で最大 MAX_PER_RUN（既定 1）本・
 *   世代の data の指紋が別の物語／読めない __gen_ は「所属不明」として対象外。
 * ■口: window.__v292DfixGEN1.dryRun()（読むだけ。減らせる本数と字数・対象外の理由の数）・.run()（On のときだけ）・.status()
 *   On のときは物語画面を開いて 30 秒後に 1 回 run()。kill: v292DfixGEN1Off='1'（dryRun も含めて何もしない）。
 * ■記録: メモリだけ（件数と字数）。storage に記録を書かない。物語の id・本文はどこにも出さない。
 * ===================================================================== */
(function () {
  'use strict';
  var W = (typeof window !== 'undefined') ? window : globalThis;
  if (W.__v292DfixGEN1) return;
  var VER = 'gen1-20261116-r2', ON = 'v292DfixGEN1On', OFF = 'v292DfixGEN1Off';
  var BUDGET_CHARS = 400000, RECENT_OPEN_MS = 10 * 60 * 1000, KEEP = 1, AUTO_DELAY_MS = 30000, MAX_PER_RUN = 1;   /* ★r2 (GPT #127-UR): 1 回の実行で減らすのは既定 1 本 */
  var PREFIX = '__gen_chr6_slot_';
  var st = { dry: 0, runs: 0, trimmed: 0, freedChars: 0, skipped: {}, last: null, err: 0 };
  function ls() { try { return W.localStorage; } catch (e) { return null; } }
  function g(k) { try { var L = ls(); return L ? L.getItem(k) : null; } catch (e) { return null; } }
  function J(s, d) { try { return JSON.parse(s); } catch (e) { return d; } }
  function isArr(a) { return Object.prototype.toString.call(a) === '[object Array]'; }
  function off() { return g(OFF) === '1'; }
  function on() { return !off() && g(ON) === '1'; }
  function curDocId() { try { var k = W.__chronicleDocumentStoryKey; if (typeof k === 'string' && k) return k === 'chr6' ? 'default' : k.replace(/^chr6_slot_/, ''); } catch (e) {} return null; }
  function genKeys() { var out = []; try { var L = ls(); for (var i = 0; i < L.length; i++) { var k = L.key(i); if (k && k.indexOf('__gen_') === 0) out.push(k); } } catch (e) {} return out; }

  function vaultWhy(id) {
    var vh = g('chr6_vault_hidden');
    if (vh != null) { var v = J(vh, null); if (!v || typeof v !== 'object' || isArr(v)) return 'vault-cache-unreadable'; if (v.hidden !== undefined && !isArr(v.hidden)) return 'vault-cache-unreadable'; if (isArr(v.hidden) && v.hidden.map(String).indexOf(id) >= 0) return 'vault'; }
    try { var F = W.__v292Dfix889; if (!F || typeof F.isHidden !== 'function' || typeof F.hiddenIds !== 'function') return 'vault-unavailable';
      if (F.isHidden(id)) return 'vault'; var hs = F.hiddenIds(); if (!isArr(hs)) return 'vault-state-unknown'; if (hs.map(String).indexOf(id) >= 0) return 'vault'; } catch (e) { return 'vault-check-threw'; }
    if (g('chr6_storysess_' + id) != null) return 'passcode';
    try { if (W.sessionStorage && W.sessionStorage.getItem('chr6_storysess_' + id) != null) return 'passcode'; } catch (e2) { return 'vault-check-threw'; }
    return null;
  }
  /* 局所の条件（同期で判断できるもの）。null = 減らしてよい候補 */
  function localWhy(id, meta, now) {
    if (!id || id === 'default' || id === 'chr6') return 'default-slot';
    if (!isArr(meta)) return 'meta-unreadable';
    var live = 0, tomb = 0, row = null;
    for (var i = 0; i < meta.length; i++) { var e = meta[i]; if (!e || String(e.id) !== id) continue; if (e.deleted === true) tomb++; else { live++; row = e; } }
    if (tomb) return 'tombstoned';
    if (live !== 1) return live ? 'dup-live-row' : 'not-in-list';
    if (curDocId() === id) return 'open-here';
    var act = g('chr6_active_slot'); if (act != null && (act === id || J(act, null) === id || act === 'chr6_slot_' + id)) return 'active-slot';
    var lo = row && row.lastOpenedAt ? Date.parse(row.lastOpenedAt) : 0; if (lo && now - lo < RECENT_OPEN_MS) return 'recently-opened';
    var mk = g('v292Dfix402_f781g_' + id); if (mk == null) return 'no-sync-marker';
    var mo = J(mk, null); if (!mo || typeof mo !== 'object') return 'marker-unreadable';
    if (String(mo.state || '') !== 'CLEAN') return 'unsynced';
    if (mo.inFlightSave) return 'in-flight';
    if (mo.storyId != null && String(mo.storyId) !== id) return 'marker-id-mismatch';
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
  function gensOf(raw) { var a = J(raw, null); return isArr(a) ? a : null; }
  /* ★r2: 所属の確認。fix228 と同じ指紋（slotId / storyId / _slot / cfg.* / scene.*）。指紋が別の物語 → 所属不明として対象外。
     世代の data が読めない・形が違う → 対象外。指紋が無い世代は、鍵（fix783 以後は document の物語に固定）の物語のものとみなす。 */
  function fpOf(d) { try { if (!d || typeof d !== 'object') return null; var c = [d.slotId, d.storyId, d._slot, d.cfg && d.cfg.slotId, d.cfg && d.cfg.storyId, d.scene && d.scene.slotId, d.scene && d.scene.storyId];
    for (var i = 0; i < c.length; i++) if (typeof c[i] === 'string' && c[i]) return c[i]; return null; } catch (e) { return null; } }
  function ownerWhy(id, gens) {
    for (var i = 0; i < gens.length; i++) { var x = gens[i]; if (!x || typeof x !== 'object' || typeof x.data !== 'string') return 'gen-shape-unknown';
      var d = J(x.data, null); if (!d || typeof d !== 'object') return 'gen-data-unreadable';
      var f = fpOf(d); if (f && f !== id && f !== 'chr6_slot_' + id) return 'owner-unknown'; }
    return null;
  }
  function trimmed(gens) { return JSON.stringify(gens.slice(0, KEEP)); }

  /* 計画（読むだけ）: { total, budget, over, plan:[{key,id,before,after,save}], excluded:{why:n}, excludedChars:{why:n} } */
  function plan() {
    var now = Date.now(), meta = J(g('chr6_slots_meta') || '[]', null);
    var keys = genKeys(), total = 0, rows = [], excluded = {}, exChars = {};
    keys.forEach(function (k) {
      var v = g(k); var size = k.length + (v == null ? 0 : v.length); total += size;
      var why = null, id = null;
      if (k.indexOf(PREFIX) !== 0) why = 'default-slot';
      else { id = k.slice(PREFIX.length); why = localWhy(id, meta, now); }
      var gens = null;
      if (!why) { gens = gensOf(v); if (!gens) why = 'gen-unreadable'; else if (gens.length <= KEEP) why = 'already-small'; else why = ownerWhy(id, gens); }
      if (why) { excluded[why] = (excluded[why] || 0) + 1; exChars[why] = (exChars[why] || 0) + size; return; }
      var row = null; for (var i = 0; i < meta.length; i++) if (meta[i] && String(meta[i].id) === id && meta[i].deleted !== true) row = meta[i];
      var after = k.length + trimmed(gens).length;
      rows.push({ key: k, id: id, before: size, after: after, save: size - after, lo: (row && row.lastOpenedAt) ? (Date.parse(row.lastOpenedAt) || 0) : 0, value: v });
    });
    rows.sort(function (a, b) { return a.lo - b.lo; });   /* 最後に開いたのが古い順 */
    /* ★r2 (GPT #127-UR): 40 万字は「ソフト上限」。保護される分（対象外の __gen_ ＋ 対象の物語でも残す最新 1 世代）だけで
       上限を超えるなら、何も減らさない（消さずに残す）。 */
    var keptMin = total; rows.forEach(function (x) { keptMin -= x.save; });
    var pick = [], projected = total, why0 = null;
    if (total <= BUDGET_CHARS) why0 = 'under-budget';
    else if (keptMin > BUDGET_CHARS) why0 = 'protected-over-budget';
    else for (var r = 0; r < rows.length && projected > BUDGET_CHARS; r++) { pick.push(rows[r]); projected -= rows[r].save; }
    return { total: total, budget: BUDGET_CHARS, over: total > BUDGET_CHARS, protectedChars: keptMin, projected: projected, plan: pick, noop: why0, eligible: rows.length, excluded: excluded, excludedChars: exChars };
  }
  /* 読むだけ。本数と字数だけ返す（id・本文は返さない） */
  function dryRun() {
    if (off()) return { ok: false, why: 'off' };
    st.dry++;
    var p = plan();
    var first = p.plan.slice(0, MAX_PER_RUN);
    return { ok: true, total: p.total, budget: p.budget, over: p.over, protectedChars: p.protectedChars, noop: p.noop, eligible: p.eligible,
      wouldTrim: p.plan.length, wouldFree: p.plan.reduce(function (s, x) { return s + x.save; }, 0), projected: p.projected,
      thisRun: { maxPerRun: MAX_PER_RUN, trim: first.length, free: first.reduce(function (s, x) { return s + x.save; }, 0) },
      excluded: p.excluded, excludedChars: p.excludedChars, on: on() };
  }
  function withLock(name, fn) {
    try { var L = W.navigator && W.navigator.locks; if (!L || typeof L.request !== 'function') return Promise.resolve(fn(null, 'locks-unavailable'));
      return L.request(name, { mode: 'exclusive', ifAvailable: true }, function (lk) { return fn(lk, lk ? null : 'open-lock'); }); }
    catch (e) { return Promise.resolve(fn(null, 'lock-threw')); }
  }
  function skip(why) { st.skipped[why] = (st.skipped[why] || 0) + 1; }
  /* On のときだけ。1 本ずつ Web Lock の中で読み直してから「最新の 1 世代だけ」を書く */
  function run() {
    if (!on()) return Promise.resolve({ ok: false, why: off() ? 'off' : 'not-on' });
    st.runs++;
    var p = plan(), done = { trimmed: 0, freed: 0 };
    if (!p.over || !p.plan.length) { st.last = { at: Date.now(), trimmed: 0, freed: 0, over: p.over, noop: p.noop }; return Promise.resolve({ ok: true, trimmed: 0, freed: 0, over: p.over, noop: p.noop }); }
    var chain = Promise.resolve();
    p.plan.slice(0, MAX_PER_RUN).forEach(function (x) {   /* ★r2: 1 回の実行で最大 MAX_PER_RUN 本 */
      chain = chain.then(function () {
        return withLock('chronicle:story-open:' + x.id, function (lk, why) {
          if (!lk) { skip(why); return; }
          var meta = J(g('chr6_slots_meta') || '[]', null);
          var w2 = localWhy(x.id, meta, Date.now()); if (w2) { skip('recheck-' + w2); return; }
          var v2 = g(x.key); if (v2 !== x.value) { skip('changed'); return; }
          var gens = gensOf(v2); if (!gens || gens.length <= KEEP || ownerWhy(x.id, gens)) { skip('changed'); return; }
          var nv = trimmed(gens);
          try { W.localStorage.setItem(x.key, nv); } catch (e) { skip('write-failed'); return; }
          if (g(x.key) !== nv) { skip('readback-mismatch'); return; }
          done.trimmed++; done.freed += v2.length - nv.length; st.trimmed++; st.freedChars += v2.length - nv.length;
        });
      });
    });
    return chain.then(function () { st.last = { at: Date.now(), trimmed: done.trimmed, freed: done.freed, over: true }; return { ok: true, trimmed: done.trimmed, freed: done.freed, over: true }; },
      function () { st.err++; return { ok: false, why: 'error' }; });
  }
  try { if (on() && typeof setTimeout === 'function' && curDocId()) setTimeout(function () { try { run(); } catch (e) { st.err++; } }, AUTO_DELAY_MS); } catch (e) {}
  W.__v292DfixGEN1 = { VER: VER, dryRun: dryRun, run: run, LIMITS: { BUDGET_CHARS: BUDGET_CHARS, KEEP: KEEP, RECENT_OPEN_MS: RECENT_OPEN_MS, MAX_PER_RUN: MAX_PER_RUN },
    status: function () { var o = JSON.parse(JSON.stringify(st)); o.ver = VER; o.on = on(); o.off = off(); return o; } };
})();
