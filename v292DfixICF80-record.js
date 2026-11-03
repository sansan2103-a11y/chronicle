/* =====================================================================
 * v292DfixICF80-record.js — アイコンが作られなかった理由を、既存の ICF の記録（この端末だけ）へ 1 行足す小さな口（laneEDICF・2026-11-03・Local 候補）
 * ---------------------------------------------------------------------
 * GPT: ICF は作り直さない。最小にして、既にある記録（ICF の v292DfixICF_log・fix492 のトースト）で足りるところはそれを使う。
 *   - ICF（v292DfixICF-icon-fail-log.js・c393f1a8・本番で既定 ON）は、通信を伴う失敗（Asset v2 の 502 / 429 / 422 など）を既に記録している。
 *   - fix492 はトーストを出すだけで、記録はメモリの回数だけ（再読み込みで消える）。→ 記録の正本は ICF の log のまま。
 *   - 足りないのは「通信しないで見送った理由」（自動アイコンの 公開モード OFF・まだ条件を満たさない・端末側の上限）を、
 *     別のレーン（MIDICON3 mx3-c）が同じ記録へ書ける口と、理由を 5 つの分類で数える読み口だけ。この部品はそれだけを足す。
 *
 * ■口（呼ぶ側は MIDICON3 など。この部品は誰も包まない・通信しない・DOM に触らない）
 *   window.__icfRecord(category, meta) → { ok:true, cat, r } / { ok:false, why }
 *     category: 'IMGSAFE_REFUSED'（画像の安全確認で断られた）/ 'CAP_REACHED'（上限）/ 'PROVIDER_FAILED'（画像サービス・通信の失敗）/
 *               'PUBLIC_MODE_OFF'（一般公開・機能の鍵が OFF）/ 'NOT_YET_ELIGIBLE'（まだ条件を満たさない）/ 'OTHER'
 *               これ以外の文字列は理由コードとみなして classify() で分類する（例: 'MX_CAP' → CAP_REACHED）。
 *     meta（どれも任意・決まった形だけ受け取る。ほかの key は捨てる）:
 *       code  理由コード（英大文字で始まる短い記号。'EVIDENCE:2/3:old' のような ':' 区切りは可。'flag-off' のような小文字は 'FLAG_OFF' にそろえる）
 *       cid   キャラ id → **6 桁の hash（ICF と同じ h8）だけ**を残す。生の id は残さない
 *       http  HTTP 番号（100〜599）/ cap 上限の名前（'turn' など → x='cap_turn'）/ q requestId / ms かかった時間 / src 呼んだ部品（'mx' など・既定 'api'）
 *     ★残さないもの: 文章（本文・外見・名前・呼び名）・物語 id・画像・URL・鍵。日本語や空白を含む文字列は形が合わないので必ず捨てられる。
 *   window.__icfRecord.summary() … ICF の記録全体（ICF 自身の行も含む）を 5 分類で数える（読むだけ）
 *   window.__icfRecord.classify(code, http, workerCode) / .ch(cid) / .status() / .enabled() / .CATS
 *
 * ■記録の形（ICF の log の d[] に足す 1 行。ICF の summary() / entries() からもそのまま読める）
 *   { t 時刻, b 版, p 呼んだ部品, o:'auto', s 段階（pre / gate / gen）, r 理由コード, cat 分類, x 補足, h HTTP, ch キャラ hash, ms, q, pf 端末, br ブラウザ, c 回数, t2 最後の時刻 }
 *   直前の行と同じ（p・cat・r・h・ch・x）で 10 分以内なら c を 1 増やすだけ（毎ターンの「まだ条件を満たさない」で記録が埋まらない）。
 *   この口から足す行は最大 30 行（超えたらこの口の古い行から捨てる）。全体の上限は ICF と同じ 100 行・20,000 字。1 分に 60 回を超えた分は書かずに数えるだけ。
 *
 * ■flag（既定 OFF）
 *   有効 = localStorage v292DfixICF80On='1' かつ v292DfixICF80Off!=='1'（kill が常に勝つ）かつ v292DfixICFOff!=='1'（ICF 自体の停止にも従う）。
 *   無効のとき: 口（関数）はあるが何もしない（{ok:false, why:'off'} を返す）。保存・通信・タイマー・リスナーは 0。呼ぶ側は typeof で確かめなくてよい。
 *   記録の形が ICF の形（{v:1, d:[]…}）でないときは上書きしない（{ok:false, why:'foreign-shape'}）。
 * ===================================================================== */
(function () {
  'use strict';
  var W = (typeof window !== 'undefined') ? window : null;
  if (!W || W.__icfRecord) return;
  var VER = 'ICF80-a1', LSK = 'v292DfixICF_log', ON = 'v292DfixICF80On', OFF = 'v292DfixICF80Off', ICF_OFF = 'v292DfixICFOff';
  var MAX_N = 100, MAX_CHARS = 20000, MAX_API = 30, COALESCE_MS = 600000, RATE_N = 60, RATE_MS = 60000;
  var CATS = ['IMGSAFE_REFUSED', 'CAP_REACHED', 'PROVIDER_FAILED', 'PUBLIC_MODE_OFF', 'NOT_YET_ELIGIBLE', 'OTHER'];
  var STAGE = { IMGSAFE_REFUSED: 'gate', CAP_REACHED: 'gate', PROVIDER_FAILED: 'gen', PUBLIC_MODE_OFF: 'pre', NOT_YET_ELIGIBLE: 'pre', OTHER: 'gen' };
  function isCat(c) { for (var i = 0; i < CATS.length; i++) if (CATS[i] === c) return true; return false; }
  function lsg(k) { try { return W.localStorage.getItem(k); } catch (e) { return null; } }
  function enabled() { return lsg(ON) === '1' && lsg(OFF) !== '1' && lsg(ICF_OFF) !== '1'; }
  var BUILD = (function () { try { var cs = document.currentScript; var m = cs && /[?&]cb=([0-9A-Za-z._-]{1,48})/.exec(String(cs.src || '')); return m ? m[1] : null; } catch (e) { return null; } })();

  /* ---------- the same helpers as ICF (reuse its own when present: same hash, same platform labels) ---------- */
  function icfT() { try { var A = W.__chrIconFail; return (A && A.__t) ? A.__t : null; } catch (e) { return null; } }
  function h8own(s) { var h = 0x811c9dc5; s = String(s == null ? '' : s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul ? Math.imul(h, 0x01000193) : (h * 0x01000193) | 0; } return ('0000000' + (h >>> 0).toString(16)).slice(-8).slice(0, 6); }
  function h8(s) { var T = icfT(); try { if (T && typeof T.h8 === 'function') return T.h8(s); } catch (e) {} return h8own(s); }
  function plat() {
    var T = icfT(); if (T && T.PF && T.BR) return { pf: T.PF, br: T.BR };
    var ua = ''; try { ua = String(navigator.userAgent || ''); } catch (e) {}
    var pf = /iPhone|iPad|iPod/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android' : 'desktop';
    var br = /CriOS/.test(ua) ? 'crios' : /FxiOS/.test(ua) ? 'fxios' : /EdgiOS|Edg\//.test(ua) ? 'edge' : /Chrome\//.test(ua) ? 'chrome' : /Safari\//.test(ua) ? 'safari' : /Firefox\//.test(ua) ? 'firefox' : 'other';
    return { pf: pf, br: br };
  }

  /* ---------- classification (pure) ---------- */
  var MAP = {
    IMGSAFE_REFUSED: ['APPEARANCE_UNSAFE_MINOR', 'APPEARANCE_UNSAFE_POLICY', 'APPEARANCE_UNSAFE', 'IMGSAFE_REFUSED', 'IMGSAFE', 'REJECTED', 'SENSITIVE_DESC', 'UNSAFE'],
    CAP_REACHED: ['BUDGET', 'RATE_LIMITED', 'IMG_RATE', 'IMG_MONTHLY_CAP', 'IMG_ACCT_MONTHLY_CAP', 'MX_CAP', 'CAP', 'CAP_TURN', 'CAP_STORY_DAY', 'CAP_STORY_TOTAL', 'CAP_STORY_DESC', 'CAP_ACCT_DAY', 'CAP_DESC', 'CAP_ATTEMPTS_THIS_FIGURE', 'QUOTA'],
    PROVIDER_FAILED: ['GENERATION_FAILED', 'NETWORK', 'OFFLINE', 'NET_HIDDEN', 'TIMEOUT', 'OUTCOME_UNKNOWN', 'LEDGER_UNHEALTHY', 'RETRY_LATER', 'INSPECT_ALL_FAIL', 'FALLBACK_INSPECT_FAIL', 'PROVIDER_FAILED', 'NO_RESULT', 'UNKNOWN_STATUS', 'BAD_IMAGE_TYPE', 'EMPTY_BYTES'],
    PUBLIC_MODE_OFF: ['PUBLIC_MODE_OFF', 'PUBLIC_AI_OFF', 'FLAG_OFF', 'AV2_OFF', 'AV2_FLAG_OFF', 'MX_OFF', 'MX_NOT_ENABLED', 'MIGRATION_OFF', 'NOT_ENABLED', 'KILL', 'EGRESS_BLOCKED', 'ASSET_V2_REQUIRED', 'NOT_LOGGED_IN', 'VAULT'],
    NOT_YET_ELIGIBLE: ['NOT_YET_ELIGIBLE', 'NO_CANDIDATE', 'EVIDENCE', 'NO_LOOK', 'FEW_FEATURES', 'EMPTY_APPEARANCE', 'NOT_SCHEMA2', 'NOT_SCHEMA2_DOCUMENT', 'NO_STORY', 'REGISTRATION_IN_PROGRESS', 'REBASE_REQUIRED', 'NOT_PREPARED', 'IN_PROGRESS', 'OWNER_CONFIRM_REQUIRED',
      'UNGROUNDED_REQUIRES_EXPLICIT_NEW_DRAW', 'EXPLICIT_NEW_DRAW_REQUIRED', 'GENERIC', 'HERO', 'IDENTITY_A', 'IDENTITY_C', 'APPEARANCE_CONFLICT', 'MISMATCH', 'BUSY', 'NOT_SETTLED']
  };
  var IDX = {}; (function () { for (var c in MAP) { if (!Object.prototype.hasOwnProperty.call(MAP, c)) continue; for (var i = 0; i < MAP[c].length; i++) IDX[MAP[c][i]] = c; } })();
  function head(code) { var s = String(code == null ? '' : code); var k = s.indexOf(':'); return k >= 0 ? s.slice(0, k) : s; }
  function byCode(code) {
    if (code == null || code === '') return null;
    var s = String(code); if (IDX[s]) return IDX[s];
    var h = head(s); if (IDX[h]) return IDX[h];
    if (/^CAP_/.test(h)) return 'CAP_REACHED';
    if (/^APPEARANCE_UNSAFE/.test(h) || /^IMGSAFE/.test(h)) return 'IMGSAFE_REFUSED';
    if (/^(A|EXTRA|IDENTITY|FIX641|APPOSED)_/.test(h) || /^NO_RETRY$/.test(h)) return 'NOT_YET_ELIGIBLE';
    var m = /^HTTP_(\d{3})$/.exec(h); if (m) return byHttp(+m[1]);
    return null;
  }
  function byHttp(h) { h = +h; if (!(h >= 100)) return null; if (h === 402 || h === 429) return 'CAP_REACHED'; if (h >= 500) return 'PROVIDER_FAILED'; return null; }
  function classify(code, http, wcode) { return byCode(code) || byCode(wcode) || byHttp(http) || 'OTHER'; }

  /* ---------- sanitising (only fixed shapes survive) ---------- */
  var CODE_RE = /^[A-Z][A-Z0-9_]{1,31}(?::[A-Za-z0-9_+\/.-]{1,24}){0,3}$/;
  function code(v) {
    if (v == null) return null; var s = String(v);
    if (/^[a-z][a-z0-9-]{1,31}$/.test(s)) s = s.replace(/-/g, '_').toUpperCase();   /* 'flag-off' → 'FLAG_OFF' */
    return CODE_RE.test(s) ? s : null;
  }
  function tokRe(v, re) { if (v == null) return null; var s = String(v); return re.test(s) ? s : null; }
  function int(v, lo, hi) { var n = +v; return (typeof v === 'number' || /^\d+$/.test(String(v))) && isFinite(n) && n >= lo && n <= hi ? Math.round(n) : null; }

  /* ---------- storage (the ICF key, the ICF shape) ---------- */
  var st = { calls: 0, writes: 0, coalesced: 0, dropped: 0, rateDropped: 0, writeFail: 0, refused: {}, ignoredKeys: 0, last: null, err: null };
  var stamps = [];
  function refuse(why) { st.refused[why] = (st.refused[why] || 0) + 1; return { ok: false, why: why }; }
  function loadRaw() {
    var raw = lsg(LSK); if (!raw) return { v: 1, d: [], ok: {}, okMs: [] };
    try { var o = JSON.parse(raw); if (!o || typeof o !== 'object' || o.v !== 1 || !Array.isArray(o.d)) return null;
      if (!o.ok || typeof o.ok !== 'object' || Array.isArray(o.ok)) o.ok = {}; if (!Array.isArray(o.okMs)) o.okMs = []; return o; } catch (e) { return null; }
  }
  function capList(o) {
    var api = 0, i; for (i = 0; i < o.d.length; i++) if (o.d[i] && o.d[i].cat) api++;
    while (api > MAX_API) { for (i = 0; i < o.d.length; i++) if (o.d[i] && o.d[i].cat) { o.d.splice(i, 1); api--; st.dropped++; break; } }
    while (o.d.length > MAX_N) { o.d.shift(); st.dropped++; }
    while (o.okMs.length > 30) o.okMs.shift();
    var s = JSON.stringify(o);
    while (s.length > MAX_CHARS && (o.d.length || o.okMs.length)) { if (o.d.length) { o.d.shift(); st.dropped++; } else o.okMs.shift(); s = JSON.stringify(o); }
    return s;
  }
  function write(e) {
    if (!enabled()) return;   /* switched off between the call and the deferred write */
    try {
      var o = loadRaw(); if (!o) { refuse('foreign-shape'); return; }
      var prev = o.d.length ? o.d[o.d.length - 1] : null;
      if (prev && prev.cat && prev.p === e.p && prev.cat === e.cat && prev.r === e.r && prev.h === e.h && prev.ch === e.ch && prev.x === e.x && e.t - (prev.t2 || prev.t) < COALESCE_MS) { prev.c = (prev.c || 1) + 1; prev.t2 = e.t; st.coalesced++; }
      else o.d.push(e);
      var s = capList(o);
      try { W.localStorage.setItem(LSK, s); st.writes++; } catch (x) { st.writeFail++; }
    } catch (e2) { st.err = String(e2 && e2.message || e2).slice(0, 80); }
  }

  function record(category, meta) {
    st.calls++;
    if (!enabled()) return { ok: false, why: 'off' };
    try {
      meta = (meta && typeof meta === 'object') ? meta : {};
      var KEYS = { code: 1, cid: 1, http: 1, cap: 1, q: 1, ms: 1, src: 1 };
      for (var k in meta) if (Object.prototype.hasOwnProperty.call(meta, k) && !KEYS[k]) st.ignoredKeys++;
      var c0 = String(category == null ? '' : category), cat, r;
      var mc = code(meta.code), http = int(meta.http, 100, 599);
      if (isCat(c0)) { cat = c0; r = mc || c0; }
      else { var cc = code(c0); if (!cc && !mc) return refuse('bad-category'); r = mc || cc; cat = classify(cc || mc, http); }
      var now = Date.now();
      stamps = stamps.filter(function (x) { return now - x < RATE_MS; });
      if (stamps.length >= RATE_N) { st.rateDropped++; return { ok: false, why: 'rate' }; }
      stamps.push(now);
      var P = plat();
      var e = { t: now, b: BUILD, p: tokRe(meta.src, /^[a-z0-9_-]{1,16}$/) || 'api', o: 'auto', s: STAGE[cat], r: r, cat: cat };
      var cap = tokRe(meta.cap, /^[A-Za-z0-9_]{1,24}$/); if (cap) e.x = 'cap_' + cap;
      if (http != null) e.h = http;
      if (meta.cid != null && String(meta.cid).length && String(meta.cid).length <= 128) e.ch = h8(meta.cid);
      var ms = int(meta.ms, 0, 10000000); if (ms != null) e.ms = ms;
      var q = tokRe(meta.q, /^[A-Za-z0-9_-]{4,40}$/); if (q) e.q = q;
      e.pf = P.pf; e.br = P.br; e.c = 1;
      st.last = { cat: cat, r: r, t: now };
      try { setTimeout(function () { write(e); }, 0); } catch (x) { write(e); }   /* never inside the caller's stack */
      return { ok: true, cat: cat, r: r };
    } catch (e3) { st.err = String(e3 && e3.message || e3).slice(0, 80); return { ok: false, why: 'error' }; }
  }

  /* ---------- read side (no write) ---------- */
  function catOf(e) { return (e && e.cat && isCat(e.cat)) ? e.cat : classify(e && e.r, e && e.h, e && e.w); }
  function summary() {
    var raw = lsg(LSK), o = null; try { o = raw ? JSON.parse(raw) : null; } catch (e) { o = null; }
    var d = (o && Array.isArray(o.d)) ? o.d : [], by = {}, api = 0, byApi = {}, i;
    for (i = 0; i < CATS.length; i++) { by[CATS[i]] = 0; byApi[CATS[i]] = 0; }
    for (i = 0; i < d.length; i++) { var e = d[i]; if (!e) continue; var c = catOf(e), n = +e.c || 1; by[c] += n; if (e.cat) { api++; byApi[c] += n; } }
    var lastApi = d.filter(function (x) { return x && x.cat; }).slice(-5);
    return { version: VER, enabled: enabled(), entries: d.length, apiEntries: api, byCategory: by, byCategoryApi: byApi, lastApi: JSON.parse(JSON.stringify(lastApi)), chars: raw ? raw.length : 0 };
  }
  function status() { return { version: VER, enabled: enabled(), flagOn: lsg(ON) === '1', killed: lsg(OFF) === '1', icfOff: lsg(ICF_OFF) === '1', icfPresent: !!icfT(), build: BUILD, calls: st.calls, writes: st.writes, coalesced: st.coalesced,
    dropped: st.dropped, rateDropped: st.rateDropped, writeFail: st.writeFail, refused: JSON.parse(JSON.stringify(st.refused)), ignoredKeys: st.ignoredKeys, last: st.last, err: st.err, limits: { MAX_API: MAX_API, MAX_N: MAX_N, MAX_CHARS: MAX_CHARS, RATE_N: RATE_N } }; }

  record.version = VER; record.CATS = CATS.slice(); record.enabled = enabled; record.classify = classify; record.ch = function (cid) { return h8(cid); };
  record.summary = summary; record.status = status; record.__t = { code: code, capList: capList };
  W.__icfRecord = record;
})();
