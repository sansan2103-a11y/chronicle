/* v292Dfix859-story-session.js — STORY_PASSCODE client: session token supplier
 * =====================================================================
 * ②C1 裁定 2026-09-16 / STORY_PASSCODE_CLIENT_INTEGRATION = IMPLEMENTATION_GO
 *
 * 役割はこれ**だけ**:
 *   ・story ごとの unlock token を sessionStorage に持つ（sid 単位・global 1 個方式は禁止）
 *   ・request payload を見て「その op に、その sid の token を付けてよいか」を判定し、
 *     付けてよいときだけ header 値を返す
 *
 * ★このファイルは fetch も UI も持たない。dialog は fix860 の担当。
 * ★token の真実の源をここ 1 つにする（fix837 の supplier パターン）。
 *   consumer（fix697 / fix700 / fix702 / fix705 の authHeaders）は 3 行読むだけで、
 *   ★**各モジュールが独自に token 管理をしない**。
 *
 * 保管場所の契約（裁定）:
 *   ・sessionStorage のみ
 *   ・localStorage 禁止 / URL 禁止 / story JSON 禁止
 *   → reload では再利用され、tab / browser session が終われば再 unlock が要る。
 *
 * kill switch: v292Dfix859Off='1' → 常に '' を返す（＝ token を 1 つも送らない従来挙動）。
 * ===================================================================== */
(function () {
  'use strict';
  var TAG = '[fix859]';
  var PREFIX = 'chr6_storysess_';
  var SKEW_MS = 5000;          /* 飛行中に切れる token を送らないための余裕 */
  var SID_MAX = 80;            /* worker 側 String(body.id).slice(0,80) と揃える */

  /* ★worker の SP_PROTECTED_OPS と 1:1（v41.4-storypass worker.js より転記）。
     ★推測で field 名や op 名を増やさない。 */
  var PROTECTED_OPS = {
    getstory: 1, putstory: 1, putcanonical: 1, promotestory: 1, promotedelete: 1,
    deleteshadow: 1, deletecanonical: 1, scrubstorycfg: 1, setstorytitle: 1
  };
  /* passcode lifecycle のうち **valid token を要求する** op（worker の契約どおり）。
     storyunlock は token を持たない状態で撃つ op なので入れない。
     storypassstatus は session を触らないので入れない。 */
  var TOKEN_PASS_OPS = { storypassset: 1, storypassclear: 1 };

  function off() {
    try { return localStorage.getItem('v292Dfix859Off') === '1'; } catch (e) { return false; }
  }
  function ss() {
    try { return window.sessionStorage; } catch (e) { return null; }
  }
  function normSid(v) {
    if (v == null) return '';
    var s = String(v);
    if (!s) return '';
    return s.slice(0, SID_MAX);
  }
  function keyFor(sid) { return PREFIX + sid; }

  /* token の payload を読む（署名は検証しない＝できない。権威は常に server）。
     ★client 側の期限判定は「無駄な 409 を出さない」ための UX 都合にすぎない。 */
  function payloadOf(token) {
    try {
      var seg = String(token).split('.')[0];
      if (!seg) return null;
      var b64 = seg.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      return JSON.parse(atob(b64));
    } catch (e) { return null; }
  }

  function readRaw(sid) {
    var s = ss(); if (!s) return '';
    try { return s.getItem(keyFor(sid)) || ''; } catch (e) { return ''; }
  }
  function clear(sid) {
    sid = normSid(sid); if (!sid) return false;
    var s = ss(); if (!s) return false;
    try { s.removeItem(keyFor(sid)); return true; } catch (e) { return false; }
  }

  /* 期限切れ / 別 sid の token は返さず、その場で捨てる */
  function get(sid) {
    if (off()) return '';
    sid = normSid(sid); if (!sid) return '';
    var t = readRaw(sid);
    if (!t) return '';
    var pl = payloadOf(t);
    if (!pl) { clear(sid); return ''; }
    if (String(pl.sid || '') !== sid) { clear(sid); return ''; }      /* 取り違え防止 */
    if (!(+pl.exp > Date.now() + SKEW_MS)) { clear(sid); return ''; }  /* 期限切れ */
    return t;
  }

  function set(sid, token) {
    sid = normSid(sid);
    if (!sid || !token) return false;
    var pl = payloadOf(token);
    /* ★保存する前に「この token は本当にこの sid のものか」を確認する。
       署名は検証できないが、sid 取り違えだけはここで確実に止める。 */
    if (!pl || String(pl.sid || '') !== sid) {
      try { console.warn(TAG, 'token の sid が一致しないため保存しません'); } catch (e) {}
      return false;
    }
    var s = ss(); if (!s) return false;
    try { s.setItem(keyFor(sid), String(token)); return true; } catch (e) { return false; }
  }

  /* UI 用。token 本体は返さない。 */
  function info(sid) {
    sid = normSid(sid);
    var t = sid ? readRaw(sid) : '';
    if (!t) return { has: false };
    var pl = payloadOf(t);
    if (!pl) return { has: false };
    var left = (+pl.exp || 0) - Date.now();
    return { has: left > 0, expiresInMs: left > 0 ? left : 0,
             sid: String(pl.sid || ''), v: String(pl.v || '') };
  }

  /* server から「その token では通らない」と言われたときの後始末。
     ★裁定: 該当 sid の token **だけ** 破棄し、他 sid には触らない。 */
  var DROP_REASONS = {
    'lock-version-mismatch': 1, 'expired': 1, 'bad-signature': 1,
    'malformed-session': 1, 'unknown-session': 1, 'version-mismatch': 1,
    'user-mismatch': 1, 'sid-mismatch': 1, 'session-secret-missing': 1, 'verify-failed': 1
  };
  function noteRejection(sid, reason) {
    sid = normSid(sid);
    if (!sid) return false;
    if (!DROP_REASONS[String(reason || '')]) return false;
    return clear(sid);
  }

  /* ★consumer（4 つの authHeaders）が呼ぶ唯一の入口。
     payload から対象 story id を取り出し、その sid の token だけを返す。 */
  function forPayload(payload) {
    if (off()) return '';
    if (!payload || typeof payload !== 'object') return '';
    var op = String(payload.op || '');
    if (!PROTECTED_OPS[op] && !TOKEN_PASS_OPS[op]) return '';
    /* ★sid は **payload.id** 固定。worker 側も handleStoryShadow / spHandlePassOp とも
       `body.id` しか読まない（v41.4 source で確認済み）。推測で別名を足さない。 */
    var sid = normSid(payload.id);
    if (!sid) return '';
    return get(sid);
  }

  /* 診断用（token 値は出さない） */
  function status() {
    var s = ss(), keys = [];
    try { for (var i = 0; i < s.length; i++) { var k = s.key(i); if (k && k.indexOf(PREFIX) === 0) keys.push(k.slice(PREFIX.length)); } } catch (e) {}
    var lsLeak = [];
    try { for (var j = 0; j < localStorage.length; j++) { var lk = localStorage.key(j); if (lk && lk.indexOf(PREFIX) === 0) lsLeak.push(lk); } } catch (e) {}
    return { off: off(), sids: keys, count: keys.length,
             localStorageLeak: lsLeak, protectedOps: Object.keys(PROTECTED_OPS),
             tokenPassOps: Object.keys(TOKEN_PASS_OPS) };
  }

  window.__chronicleStorySession      = get;             /* (sid) -> token | '' */
  window.__chronicleStorySessionFor   = forPayload;      /* (payload) -> token | '' */
  window.__chronicleStorySessionSet   = set;
  window.__chronicleStorySessionClear = clear;
  window.__chronicleStorySessionInfo  = info;
  window.__chronicleStorySessionReject = noteRejection;
  window.__v292Dfix859 = { off: off, status: status, get: get, set: set, clear: clear,
                           info: info, forPayload: forPayload, noteRejection: noteRejection,
                           PREFIX: PREFIX, PROTECTED_OPS: PROTECTED_OPS, TOKEN_PASS_OPS: TOKEN_PASS_OPS };
})();
