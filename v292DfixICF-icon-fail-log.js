/* =====================================================================
 * v292DfixICF-icon-fail-log.js — アイコン（キャラの絵）の失敗理由を、この端末にだけ短く記録する（lane ICF・Tier 1・記録のみ）
 * ---------------------------------------------------------------------
 * 目的: 「絵を作れませんでした」などの失敗が、どの入口・どの段階・どの理由で起きたかを後から数えられるようにする。
 *   今日は失敗理由がどこにも残らない（Worker は 502 GENERATION_FAILED だけを返し、client の記録はメモリだけで再読み込みで消える）。
 * 何をするか（見るだけ。要求・応答・画像・保存は 1 バイトも変えない）:
 *   1. __chronicleAssetV2 の ensureFirst / newDraw / setProfile / adoptCandidate を包み、結果（成功・失敗の code）を受け取る。
 *      引数はそのまま渡し、callback には元と同じ引数・同じ this で先に返す。記録はその後（setTimeout 0）。
 *   2. __v292Dfix697 の assetV2EnsureFirst / assetV2Write / assetV2Read を包み、通信 1 回の HTTP status・Worker の errorCode・
 *      かかった時間（ms）・通信失敗（NETWORK_FAILED）を受け取る（応答の中身は既に解析済みの値を読むだけ）。
 *   3. 旧形式の物語のアイコン生成（POST gen.pollinations.ai/v1/images/generations・workers.dev/image・/api/image）だけ、
 *      window.fetch の一番外側で結果を見る。元の Promise をそのまま返す（別の枝で見る）。失敗の応答だけ clone して errorCode を読む。
 *      それ以外の通信は元の fetch をそのまま呼ぶ（判定は URL と method だけ）。
 *   4. 画面のボタン（data-av2-* などの印）の click を capture で見て、どのボタンからの操作かを覚える（文字は読まない）。
 *      「確定して新しい候補を作る」「確定してアイコンを作る」を外見の欄が空のまま押したとき（B37-A が止める）は EMPTY_APPEARANCE を記録。
 * 記録（localStorage 'v292DfixICF_log'・この端末だけ・どこへも送らない）:
 *   失敗 1 件 = { t 時刻, b 版, p 入口, u ボタン, o 操作, s 段階, r 理由コード, h HTTP, w Worker の errorCode, x 補足,
 *                 pv provider, rt 経路, ms 時間, kd 人/人外, n60 直前 60 秒の生成回数, rr 同じキャラの直前 15 分の失敗回数,
 *                 ch キャラ id の短い hash, hid 途中で画面が隠れた, off オフライン, pf 端末, br ブラウザ, q requestId, gf Worker の失敗分類（Tier 2 用・無ければ無し）, c 回数 }
 *   成功は回数と時間（直近 30 件）だけ。上限: 失敗 100 件・全体 20,000 文字（古いものから捨てる）。
 *   ★入れないもの: 文章（外見・指示・物語）・名前・物語 id・画像・URL・鍵。property 名 'key' も使わない（fix726 の書き出しの関門）。
 * 読む口: window.__chrIconFail.status() / .summary() / .entries(n) / .clear()
 * kill: localStorage v292DfixICFOff='1'（読み込み時に見る。何も包まない・何も書かない。status() だけ答える）。
 *       包んだ後に '1' にした場合も、その時点から記録しない（包みは素通し）。
 * ===================================================================== */
(function () {
  'use strict';
  var W = (typeof window !== 'undefined') ? window : null;
  if (!W || W.__chrIconFail) return;
  var VER = 'ICF-a1', LSK = 'v292DfixICF_log', KILL = 'v292DfixICFOff';
  var MAX_N = 100, MAX_CHARS = 20000, MAX_OKMS = 30, COALESCE_MS = 600000, RR_MS = 900000, EF_TIMEOUT_MS = 90000;
  function now() { return Date.now(); }
  function lsg(k) { try { return W.localStorage.getItem(k); } catch (e) { return null; } }
  function killed() { return lsg(KILL) === '1'; }
  var BUILD = (function () { try { var cs = document.currentScript; var m = cs && /[?&]cb=([0-9A-Za-z._-]{1,48})/.exec(String(cs.src || '')); return m ? m[1] : null; } catch (e) { return null; } })();   // this file's ?cb= = the package label
  function build() { return BUILD; }
  function tok(v, max) { if (v == null) return null; var s = String(v); return /^[A-Za-z0-9._:\/-]+$/.test(s) ? s.slice(0, max || 40) : null; }
  function num(v) { return (typeof v === 'number' && isFinite(v)) ? Math.round(v) : null; }
  function h8(s) { var h = 0x811c9dc5; s = String(s == null ? '' : s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul ? Math.imul(h, 0x01000193) : (h * 0x01000193) | 0; } return ('0000000' + (h >>> 0).toString(16)).slice(-8).slice(0, 6); }
  var st = { installed: false, off: false, hooks: { a: false, f: false, fetch: false, click: false, vis: false }, writes: 0, writeFail: 0, records: 0, ok: 0, last: null, err: null };

  /* ---------- storage (own key only) ---------- */
  function empty() { return { v: 1, d: [], ok: {}, okMs: [] }; }
  function load() {
    var raw = lsg(LSK); if (!raw) return empty();
    try { var o = JSON.parse(raw); if (!o || typeof o !== 'object' || o.v !== 1 || !Array.isArray(o.d)) return empty();
      if (!o.ok || typeof o.ok !== 'object' || Array.isArray(o.ok)) o.ok = {}; if (!Array.isArray(o.okMs)) o.okMs = []; return o; } catch (e) { return empty(); }
  }
  var mem = null;   /* used only when the device storage refuses our write */
  function cap(o) {
    while (o.d.length > MAX_N) o.d.shift();
    while (o.okMs.length > MAX_OKMS) o.okMs.shift();
    var s = JSON.stringify(o);
    while (s.length > MAX_CHARS && (o.d.length || o.okMs.length)) { if (o.d.length) o.d.shift(); else o.okMs.shift(); s = JSON.stringify(o); }
    return s;
  }
  function commit(mutate) {
    if (killed()) return;
    try {
      var o = load(); mutate(o); var s = cap(o);
      try { W.localStorage.setItem(LSK, s); st.writes++; mem = null; }
      catch (e) { st.writeFail++; mem = o; }
    } catch (e2) { st.err = String(e2 && e2.message || e2).slice(0, 80); }
  }
  function later(f) { try { setTimeout(function () { try { f(); } catch (e) { st.err = String(e && e.message || e).slice(0, 80); } }, 0); } catch (e) {} }

  /* ---------- environment (coarse, no identifiers) ---------- */
  var ua = ''; try { ua = String(navigator.userAgent || ''); } catch (e) {}
  var PF = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (function () { try { return navigator.maxTouchPoints > 1; } catch (e) { return false; } })()) ? 'ios' : /Android/.test(ua) ? 'android' : 'desktop';
  var BR = /CriOS/.test(ua) ? 'crios' : /FxiOS/.test(ua) ? 'fxios' : /EdgiOS|Edg\//.test(ua) ? 'edge' : /Chrome\//.test(ua) ? 'chrome' : /Safari\//.test(ua) ? 'safari' : /Firefox\//.test(ua) ? 'firefox' : 'other';
  var visSeq = 0;
  function hiddenNow() { try { return !!document.hidden; } catch (e) { return false; } }
  function offline() { try { return navigator.onLine === false; } catch (e) { return false; } }

  /* ---------- which UI surface / button (no text is read) ---------- */
  var SURF = [['v292Dav2-portrait.js', 'card'], ['v292DfixB37-onboard.js', 'onb'], ['v292DfixLC1-workbench.js', 'lc1'], ['v292Dav2-migrate-ui.js', 'mig']];   // LD1 only wraps setProfile (never a caller): skipped
  function surface() {
    var s = ''; try { s = String(new Error('icf').stack || ''); } catch (e) {}
    var best = null, at = -1;
    for (var i = 0; i < SURF.length; i++) { var k = s.indexOf(SURF[i][0]); if (k >= 0 && (at < 0 || k < at)) { at = k; best = SURF[i][1]; } }
    return best;
  }
  var intent = null;   /* { u, t } */
  var UI_MAP = [['[data-av2-ef]', 'ef'], ['[data-av2-prof="confirm-and-first"]', 'one'], ['[data-av2-prof="confirm"]', 'confirm'], ['[data-av2-nd]', 'nd'], ['[data-av2-free]', 'free'],
                ['[data-av2-pick="adopt"]', 'adopt'], ['[data-av2-pv="adopt"]', 'adopt'], ['[data-onb="run"]', 'onb'], ['[data-lc1]', 'lc1']];
  function onClick(ev) {
    try {
      if (killed()) return;
      var t = ev && ev.target; if (!t || typeof t.closest !== 'function') return;
      if (t.closest('[data-av2-ask="ok"]')) { if (intent) intent.t = now(); return; }   // the in-panel confirmation keeps the button that opened it
      for (var i = 0; i < UI_MAP.length; i++) {
        var el = t.closest(UI_MAP[i][0]); if (!el) continue;
        if (el.disabled) return;
        intent = { u: UI_MAP[i][1], t: now() };
        if (intent.u === 'nd' || intent.u === 'one') emptyGuardCheck(el, intent.u);
        return;
      }
    } catch (e) {}
  }
  /* B37-A (v292Dav2-portrait.js guarded()): an empty appearance box is refused in the UI, before any request (no network → nothing else would see it) */
  function emptyGuardCheck(btn, u) {
    try {
      if (lsg('v292DfixB37aOff') === '1') return;                                   // without B37-A these buttons go to setProfile / newDraw (recorded there)
      var tools = btn.closest('[data-av2-ui="profile"]'); if (!tools) return;
      var ta = tools.querySelector('textarea[data-av2-prof="appearance"]'), gs = tools.querySelector('select[data-av2-prof="gender"]');
      if (!ta) return;
      var A = W.__chronicleAssetV2, ap = '';
      if (A && typeof A.previewProfile === 'function') { var pv = A.previewProfile({ appearance: ta.value, gender: gs ? gs.value : '' }); ap = pv && pv.appearance || ''; }
      else ap = String(ta.value || '').replace(/\s+/g, ' ').trim();
      if (ap) return;
      var card = btn.closest('.v292Dfix145-card'), cid = card ? card.getAttribute('data-av2-cid') : null;
      later(function () { fail({ p: 'card', u: u, o: u === 'nd' ? 'regenerate' : 'ensure_first', s: 'ui', r: 'EMPTY_APPEARANCE', ch: cid ? h8(cid) : null, ms: 0 }); });
    } catch (e) {}
  }
  function curIntent() { return (intent && now() - intent.t < 180000) ? intent.u : null; }

  /* ---------- entries ---------- */
  var genTimes = [];
  function n60() { var t = now(); genTimes = genTimes.filter(function (x) { return t - x < 60000; }); return genTimes.length; }
  function kindOf(cid) {
    try { var S = W.__chronicleGetState ? W.__chronicleGetState('icf') : null; var c = S && S.cast; if (!c) return null;
      var all = [].concat(c.hero ? [c.hero] : [], Array.isArray(c.npcs) ? c.npcs : []);
      for (var i = 0; i < all.length; i++) { var e = all[i]; if (e && e.character_id === cid) { var p = e.profile || {}; var sp = typeof p.species === 'string' ? p.species.trim() : '';
        if (sp) return sp === 'HUMAN' ? 'h' : 'c'; return (p.appearance || p.gender) ? 'h' : null; } }
    } catch (e) {}
    return null;
  }
  function base(o) {
    var e = { t: now(), b: build(), p: o.p || null, u: o.u === undefined ? curIntent() : o.u, o: o.o || null, s: o.s || null, r: tok(o.r, 48) || 'UNKNOWN' };
    if (o.h != null) e.h = num(o.h); if (o.w) e.w = tok(o.w, 40); if (o.x) e.x = tok(o.x, 40); if (o.pv) e.pv = tok(o.pv, 24); if (o.rt) e.rt = tok(o.rt, 24);
    if (o.ms != null) e.ms = num(o.ms); if (o.kd) e.kd = o.kd; if (o.n60 != null) e.n60 = o.n60; if (o.ch) e.ch = o.ch; if (o.hid) e.hid = 1; if (offline()) e.off = 1;
    e.pf = PF; e.br = BR; if (o.q) e.q = tok(o.q, 40); if (o.gf) e.gf = o.gf; e.c = 1;
    return e;
  }
  function fail(o) {
    if (killed()) return;
    var e = base(o); st.records++; st.last = { r: e.r, s: e.s, t: e.t };
    commit(function (L) {
      var prev = L.d.length ? L.d[L.d.length - 1] : null;
      if (o.coalesce && prev && prev.p === e.p && prev.o === e.o && prev.s === e.s && prev.r === e.r && prev.h === e.h && prev.w === e.w && prev.ch === e.ch && e.t - (prev.t2 || prev.t) < COALESCE_MS) { prev.c = (prev.c || 1) + 1; prev.t2 = e.t; return; }
      if (e.ch) { var k = 0; for (var i = 0; i < L.d.length; i++) { var x = L.d[i]; if (x.ch === e.ch && x.s !== 'display' && e.t - x.t < RR_MS) k++; } if (k) e.rr = k; }
      L.d.push(e);
    });
  }
  function okRec(o) {
    if (killed()) return;
    st.ok++;
    commit(function (L) { var k = (o.p || '?') + ':' + (o.o || '?') + ':' + (o.r || 'OK'); L.ok[k] = (+L.ok[k] || 0) + 1;
      if (o.ms != null && o.gen) L.okMs.push([num(o.ms), o.o === 'regenerate' ? 'rg' : 'ef', PF]); });
  }
  function gf(j) {
    try { var g = j && j.gf; if (!g || typeof g !== 'object' || Array.isArray(g)) return null;
      var out = {}; var c = tok(g.cls, 16), e = tok(g.code, 40), s = num(g.st), m = num(g.ms), sg = tok(g.stage, 16);
      if (c) out.c = c; if (e) out.e = e; if (s != null) out.s = s; if (m != null) out.m = m; if (sg) out.g = sg; return Object.keys(out).length ? out : null; } catch (e2) { return null; }
  }

  /* ---------- transport (fix697 Asset v2 ports) ---------- */
  var tr = {};   /* op|cid → last transport result for the current call */
  var TRACK = { 'portrait.ensure_first': 1, 'portrait.regenerate': 1, 'portrait.adopt': 1 };
  function trDone(op, cid, t0, v0, r, err) {
    var j = r && r.j;
    tr[op + '|' + cid] = { t0: t0, st: r && typeof r.status === 'number' ? r.status : null, err: err || null, ms: now() - t0, hid: visSeq !== v0 || hiddenNow(),
      w: j && (j.errorCode || (typeof j.error === 'string' && /^[A-Z_0-9]+$/.test(j.error) ? j.error : null)) || null, ws: j && j.ok && typeof j.status === 'string' ? j.status : null,
      q: j && j.requestId || null, gf: gf(j), er: j && j.er1x || null };
  }
  function wrapCb(cb, after) { return function () { var a = arguments, self = this; try { if (typeof cb === 'function') return cb.apply(self, a); } finally { try { after.apply(null, a); } catch (e) {} } }; }
  function own(dst, src) { try { for (var p in src) { if (Object.prototype.hasOwnProperty.call(src, p)) { try { dst[p] = src[p]; } catch (e) {} } } } catch (e) {} }
  var fObj = null, fDone = {};   /* wrap each method of one fix697 object once (LD1 may wrap ours later without copying our mark) */
  function wrapF() {
    var F = W.__v292Dfix697; if (!F || typeof F !== 'object') return false;
    if (F !== fObj) { fObj = F; fDone = {}; }
    var okAny = false;
    var wEF = F.assetV2EnsureFirst;
    if (typeof wEF === 'function' && !wEF.__icf && !fDone.ef) {
      var gEF = function (args, cb) {
        var a = Array.prototype.slice.call(arguments);
        if (!killed()) { var cid = args && args.character_id, t0 = now(), v0 = visSeq; a[1] = wrapCb(cb, function (r, err) { trDone('portrait.ensure_first', cid, t0, v0, r, err); }); }
        return wEF.apply(this, a);
      };
      own(gEF, wEF); gEF.__icf = true; try { F.assetV2EnsureFirst = gEF; } catch (e) {} fDone.ef = F.assetV2EnsureFirst === gEF;
    }
    var wW = F.assetV2Write;
    if (typeof wW === 'function' && !wW.__icf && !fDone.w) {
      var gW = function (op, args, cb) {
        var a = Array.prototype.slice.call(arguments);
        if (!killed() && TRACK[op] === 1) { var cid = args && args.character_id, t0 = now(), v0 = visSeq; a[2] = wrapCb(cb, function (r, err) { trDone(op, cid, t0, v0, r, err); }); }
        return wW.apply(this, a);
      };
      own(gW, wW); gW.__icf = true; try { F.assetV2Write = gW; } catch (e) {} fDone.w = F.assetV2Write === gW;
    }
    var wR = F.assetV2Read;
    if (typeof wR === 'function' && !wR.__icf && !fDone.r) {
      var gR = function (op, args, cb) {
        var a = Array.prototype.slice.call(arguments);
        if (!killed() && (op === 'asset.get' || op === 'portrait.list')) {
          var t0 = now();
          a[2] = wrapCb(cb, function (r, err) {
            var s = r && typeof r.status === 'number' ? r.status : null;
            if (op === 'asset.get') {
              var ty = r && String(r.type || '').split(';')[0].trim().toLowerCase();
              var bad = !err && s === 200 && r.bytes && !(ty === 'image/png' || ty === 'image/jpeg' || ty === 'image/webp');
              if (err || s !== 200 || !r.bytes || bad) later(function () { fail({ p: 'display', u: null, o: 'asset_get', s: 'display', r: err ? 'NETWORK' : bad ? 'BAD_IMAGE_TYPE' : !r.bytes && s === 200 ? 'EMPTY_BYTES' : 'HTTP_' + s, h: s, w: r && r.j && r.j.errorCode, ms: now() - t0, coalesce: true }); });
            } else {
              var j = r && r.j;
              if (s !== 404 && (err || s !== 200 || !j || !Array.isArray(j.portraits))) later(function () { fail({ p: 'display', u: null, o: 'list', s: 'display', r: err ? 'NETWORK' : 'HTTP_' + s, h: s, w: j && j.errorCode, ms: now() - t0, coalesce: true }); });
            }
          });
        }
        return wR.apply(this, a);
      };
      own(gR, wR); gR.__icf = true; try { F.assetV2Read = gR; } catch (e) {} fDone.r = F.assetV2Read === gR;
    }
    okAny = !!(fDone.ef && fDone.w);
    st.hooks.f = okAny; return okAny;
  }

  /* ---------- data plane (__chronicleAssetV2) ---------- */
  var PRE = { AV2_OFF: 1, AV2_FLAG_OFF: 1, NOT_SCHEMA2_DOCUMENT: 1, BAD_CHARACTER_ID: 1, REGISTRATION_IN_PROGRESS: 1, REBASE_REQUIRED: 1, REGISTRATION_BLOCKED: 1,
              UNKNOWN_CHARACTER_ID: 1, CHARACTER_DELETED: 1, IN_PROGRESS: 1, OWNER_CONFIRM_REQUIRED: 1, EMPTY_APPEARANCE: 1, MIGRATION_OFF: 1, NOT_PREPARED: 1, BAD_ASSET_ID: 1 };
  var OPN = { ensureFirst: 'ensure_first', newDraw: 'regenerate', setProfile: 'set_profile', adoptCandidate: 'adopt' };
  var WOP = { ensureFirst: 'portrait.ensure_first', newDraw: 'portrait.regenerate', adoptCandidate: 'portrait.adopt' };
  function finish(m, ctx, res) {
    var o = OPN[m], wop = WOP[m], t = wop ? tr[wop + '|' + ctx.cid] : null;
    if (wop) delete tr[wop + '|' + ctx.cid];
    if (t && t.t0 && t.t0 < ctx.t0) t = null;
    var p = ctx.p || ({ onb: 'onb', lc1: 'lc1' })[ctx.u] || (ctx.u ? 'card' : '?');
    var ms = now() - ctx.t0, gen = (m === 'ensureFirst' || m === 'newDraw');
    var hid = ctx.v0 !== visSeq || (t && t.hid);
    if (res && res.ok) { okRec({ p: p, o: o, r: tok(res.code, 32) || 'OK', ms: t ? t.ms : ms, gen: gen && !!t && res.calls === 1 }); return; }
    var code = tok(res && res.code, 48) || 'NO_RESULT';
    var stg;
    if (m === 'setProfile') stg = 'profile';
    else if (m === 'adoptCandidate') stg = t ? (code === 'OUTCOME_UNKNOWN' ? 'reconcile' : 'adopt') : (code === 'READ_FAIL' ? 'list' : 'pre');
    else if (!t) stg = (code === 'READ_FAIL') ? 'list' : (PRE[code] ? 'pre' : 'gen');
    else stg = (code === 'OUTCOME_UNKNOWN') ? 'reconcile' : 'gen';
    var x = null;
    if (t && t.err) x = (t.ms >= EF_TIMEOUT_MS - 1500 && gen) ? 'TIMEOUT' : (t.hid ? 'NET_HIDDEN' : (offline() ? 'OFFLINE' : 'NETWORK'));
    else if (t && t.st != null && t.st !== 200 && code === 'OUTCOME_UNKNOWN') x = 'HTTP_' + t.st;
    else if (t && t.er) x = 'ER1X_' + t.er;
    else if (code === 'UNKNOWN_STATUS' && t && t.ws) x = t.ws;
    if (gen && t) genTimes.push(ctx.t0);
    fail({ p: p, u: ctx.u, o: o, s: stg, r: code, h: t ? t.st : (res && res.http != null ? res.http : null), w: t ? t.w : null, x: x, pv: gen && t ? 'together' : null, rt: wop && t ? 'worker-av2' : null,
           ms: t ? t.ms : ms, kd: ctx.kd, n60: gen ? ctx.n60 : null, ch: ctx.cid ? h8(ctx.cid) : null, hid: hid, q: t ? t.q : null, gf: t ? t.gf : null });
  }
  var aObj = null, aDone = {};
  function wrapA() {
    var A = W.__chronicleAssetV2; if (!A || typeof A !== 'object') return false;
    if (A !== aObj) { aObj = A; aDone = {}; }
    var n = 0;
    ['ensureFirst', 'newDraw', 'setProfile', 'adoptCandidate'].forEach(function (m) {
      var f = A[m]; if (typeof f !== 'function') return; if (f.__icf || aDone[m]) { n++; return; }
      var g = function (cid) {
        var a = Array.prototype.slice.call(arguments);
        if (!killed()) {
          try { wrapF(); } catch (e) {}
          var ctx = { t0: now(), v0: visSeq, cid: typeof cid === 'string' ? cid : null, p: surface(), u: curIntent(), kd: null, n60: null };
          if (m === 'ensureFirst' || m === 'newDraw') { ctx.kd = kindOf(ctx.cid); ctx.n60 = n60(); }
          var cb = a[2];
          while (a.length < 2) a.push(undefined);
          a[2] = wrapCb(cb, function (res) { var r0 = res; later(function () { finish(m, ctx, r0); }); });
        }
        return f.apply(this, a);
      };
      own(g, f); g.__icf = true;
      try { A[m] = g; } catch (e) {}
      if (A[m] === g) { aDone[m] = true; n++; }
    });
    st.hooks.a = n === 4; return n === 4;
  }

  /* ---------- legacy (schema-1) image generation: outermost fetch observer ---------- */
  function legacyInfo(input, init) {
    var m = String((init && init.method) || (input && input.method) || 'GET').toUpperCase(); if (m !== 'POST') return null;
    var u = String((input && input.url) || input || '');
    var path = u.replace(/^https?:\/\/[^\/]+/, '').split('?')[0].split('#')[0];
    var hit = u.indexOf('gen.pollinations.ai/v1/images/generations') >= 0 ? 'direct' : (/workers\.dev/.test(u) && path === '/image') ? 'worker' : (path === '/api/image') ? 'worker' : null;
    if (!hit) return null;
    if (hit === 'direct') { try { var P = W.__v292Dfix247; if (P && typeof P.on === 'function' && P.on()) hit = 'proxy'; } catch (e) {} }   // fix247 rewrites the pollinations URL to the Worker /image
    var pv = null; try { var b = init && typeof init.body === 'string' && init.body.length < 20000 ? JSON.parse(init.body) : null; if (b && typeof b.imgProvider === 'string') pv = b.imgProvider; } catch (e) {}
    return { rt: hit, pv: pv };
  }
  function snap491() { try { var s = W.__v292Dfix491 && W.__v292Dfix491.status ? W.__v292Dfix491.status().stats : null; return s ? { f: +s.fallbacks || 0, to: +s.postTimeouts || 0 } : null; } catch (e) { return null; } }
  function legacyDone(info, t0, v0, s0, res, err) {
    var ms = now() - t0, hid = visSeq !== v0, s1 = snap491();
    var fb = (s0 && s1) ? { f: s1.f - s0.f, to: s1.to - s0.to } : null;
    var x = fb && fb.f > 0 ? 'FREE_GET_FALLBACK' : (fb && fb.to > 0 ? 'POST_TIMEOUT' : null);
    if (err) { var ab = err && err.name === 'AbortError'; if (ab) return;   // a cancellation by the caller (fix492 does not count it either)
      genTimes.push(t0); return later(function () { fail({ p: 'legacy', u: null, o: 'image', s: 'legacy', r: hid ? 'NET_HIDDEN' : 'NETWORK', x: x, pv: info.pv, rt: info.rt, ms: ms, hid: hid }); }); }
    if (res && res.ok) { genTimes.push(t0); return later(function () { okRec({ p: 'legacy', o: 'image', r: x || 'OK', ms: ms, gen: true }); }); }
    genTimes.push(t0);
    var stc = res ? res.status : null, ct = ''; try { ct = String(res.headers.get('content-type') || ''); } catch (e) {}
    var rec = function (j) {
      var wc = j && (j.errorCode || null), r = null, er = j && typeof j.error === 'string' ? j.error : '';
      if (/all candidates failed inspection/.test(er)) r = 'INSPECT_ALL_FAIL';
      else if (wc === 'fb-inspect-fail') r = 'FALLBACK_INSPECT_FAIL';
      else if (wc === 'EGRESS_BLOCKED') r = 'EGRESS_BLOCKED';
      else if (wc === 'ASSET_V2_REQUIRED') r = 'ASSET_V2_REQUIRED';
      else if (stc === 402) r = 'BUDGET'; else if (stc === 429) r = 'RATE_LIMITED'; else if (wc === 'LEDGER_UNHEALTHY') r = 'LEDGER_UNHEALTHY';
      else if (stc === 502) r = 'GENERATION_FAILED'; else r = 'HTTP_' + stc;
      fail({ p: 'legacy', u: null, o: 'image', s: 'legacy', r: r, h: stc, w: wc, x: x, pv: (j && typeof j.provider === 'string' ? j.provider : info.pv), rt: info.rt, ms: ms, hid: hid });
    };
    if (/json/i.test(ct) && res && typeof res.clone === 'function') {
      var cl = null; try { cl = res.clone(); } catch (e) { cl = null; }
      if (cl) { cl.json().then(function (j) { later(function () { rec(j); }); }, function () { later(function () { rec(null); }); }); return; }
    }
    later(function () { rec(null); });
  }
  function wrapFetch() {
    var of = W.fetch; if (typeof of !== 'function' || of.__icf) return !!(of && of.__icf);
    var g = function (input, init) {
      var info = null; try { if (!killed()) info = legacyInfo(input, init); } catch (e) { info = null; }
      if (!info) return of.apply(this, arguments);
      var t0 = now(), v0 = visSeq, s0 = snap491();
      var p = of.apply(this, arguments);
      try { if (p && typeof p.then === 'function') p.then(function (res) { try { legacyDone(info, t0, v0, s0, res, null); } catch (e) {} }, function (err) { try { legacyDone(info, t0, v0, s0, null, err || new Error('reject')); } catch (e) {} }); } catch (e) {}
      return p;   // the caller gets the very same promise
    };
    own(g, of); g.__icf = true;
    try { W.fetch = g; } catch (e) {}
    st.hooks.fetch = W.fetch === g; return st.hooks.fetch;
  }

  /* ---------- read API ---------- */
  function pct(a, q) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }); return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1) + 0.5))]; }
  function cnt(arr, f) { var o = {}; arr.forEach(function (e) { var k = f(e); if (k == null) k = '-'; o[k] = (o[k] || 0) + (e.c || 1); }); return o; }
  function data() { return mem || load(); }
  var API = {
    version: VER,
    status: function () { var raw = lsg(LSK); var L = data();
      return { version: VER, installed: st.installed, off: killed(), build: build(), entries: L.d.length, chars: raw ? raw.length : 0, maxEntries: MAX_N, maxChars: MAX_CHARS,
               lastAt: L.d.length ? L.d[L.d.length - 1].t : null, hooks: JSON.parse(JSON.stringify(st.hooks)), writes: st.writes, writeFail: st.writeFail, memoryOnly: !!mem, err: st.err, pf: PF, br: BR }; },
    summary: function () { var L = data(), d = L.d.slice(), gen = d.filter(function (e) { return e.s !== 'display' && e.s !== 'pre'; });
      var okN = 0; Object.keys(L.ok).forEach(function (k) { if (/:(ensure_first|regenerate|image):/.test(k) && !/:EXISTS$/.test(k)) okN += +L.ok[k] || 0; });
      var fms = gen.filter(function (e) { return typeof e.ms === 'number'; }).map(function (e) { return e.ms; }), oms = L.okMs.map(function (x) { return x[0]; }).filter(function (x) { return typeof x === 'number'; });
      var perCh = {}; gen.forEach(function (e) { if (e.ch) perCh[e.ch] = (perCh[e.ch] || 0) + 1; });
      return { version: VER, off: killed(), entries: d.length, since: d.length ? d[0].t : null, until: d.length ? (d[d.length - 1].t2 || d[d.length - 1].t) : null,
               failures: gen.reduce(function (n, e) { return n + (e.c || 1); }, 0), successes: okN, ok: JSON.parse(JSON.stringify(L.ok)),
               byReason: cnt(d, function (e) { return e.r; }), byStage: cnt(d, function (e) { return e.s; }), byPath: cnt(d, function (e) { return e.p + (e.u ? '/' + e.u : ''); }),
               byOp: cnt(d, function (e) { return e.o; }), byHttp: cnt(d, function (e) { return e.h; }), byWorkerCode: cnt(d, function (e) { return e.w; }), byExtra: cnt(d, function (e) { return e.x; }),
               byPlatform: cnt(d, function (e) { return e.pf + '/' + e.br; }), byBuild: cnt(d, function (e) { return e.b; }), byGf: cnt(d, function (e) { return e.gf ? (e.gf.e || e.gf.c) : null; }),
               hiddenDuring: d.filter(function (e) { return e.hid; }).length, offline: d.filter(function (e) { return e.off; }).length,
               failMs: { p50: pct(fms, 0.5), p90: pct(fms, 0.9), max: fms.length ? Math.max.apply(null, fms) : null }, okMs: { n: oms.length, p50: pct(oms, 0.5), p90: pct(oms, 0.9), max: oms.length ? Math.max.apply(null, oms) : null },
               sameCharRepeat: Object.keys(perCh).filter(function (k) { return perCh[k] > 1; }).length, chars: Object.keys(perCh).length,
               last: d.slice(-5) }; },
    entries: function (n) { var d = data().d; return JSON.parse(JSON.stringify(d.slice(-Math.max(1, Math.min(MAX_N, +n || 20))))); },
    clear: function () { try { W.localStorage.removeItem(LSK); } catch (e) {} mem = null; return true; },
    __t: { h8: h8, legacyInfo: legacyInfo, cap: cap, PF: PF, BR: BR }
  };
  W.__chrIconFail = API;
  if (killed()) { st.off = true; return; }   /* kill: no wrapper, no listener, no write */

  try { document.addEventListener('visibilitychange', function () { visSeq++; }, true); st.hooks.vis = true; } catch (e) {}
  try { document.addEventListener('click', onClick, true); st.hooks.click = true; } catch (e) {}
  try { wrapFetch(); } catch (e) {}
  var tries = 0;
  (function install() {
    var a = false, f = false; try { a = wrapA(); } catch (e) {} try { f = wrapF(); } catch (e) {}
    st.installed = a || f;
    if ((!a || !f) && ++tries < 60) setTimeout(install, 1000);
  })();
})();
