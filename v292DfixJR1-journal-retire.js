/* v292DfixJR1 — TOMBSTONED MATERIALIZATION JOURNAL RETIREMENT（GPT #127-HC: design GO / local GO / production HOLD）
 * ============================================================================
 * 症状（Owner の PC で実測）:
 *   端末共通の fix750 journal（localStorage 'v292Dfix750_matTxn'）が、サーバーでは S-2 削除済み
 *   （deleted=1）の物語を指したまま残ると、
 *     ・fix756 が PREEXISTING_JOURNAL で止まり、新しい S2 物語が作れない
 *     ・fix745 の起動時バリア / generic MAT hold で、全物語のターンが止まる（fix827 の表示）
 *     ・fix750.recoveryStatus() は「対象の物語を開いて」と言うが、墓標の物語は開けない（fix588）＝出口なし
 *
 * ここでやること（これだけ）:
 *   journal が指す物語が **サーバーで削除済み（墓標）だと確かめられたときだけ**、journal を
 *   「退避」する。退避 = 生の文字列を別キーへそのまま写す → 読み戻してバイト一致を確かめる →
 *   そのあとでだけ 'v292Dfix750_matTxn' を消す。
 *
 * #127-HC の条件:
 *   1. 墓標の確認: 認証つきのサーバー応答（既存 getstory = fix697.getStoryV2Once）が
 *      journal.storyId について deleted=true を返すこと。404・通信失敗・行が無い は削除の証拠にしない。
 *      ローカルの墓標だけでは退避しない（ローカルの墓標は見ない）。
 *   2. アカウント: getstory はサーバー側で「いまのアカウントの行」だけを読む（WHERE u=<account>）。
 *      さらに読む前と読んだ後に /api/auth/me の accountId が同じ（かつ空でない）ことを確かめる。
 *      別アカウントの物語 id → getstory は 404 → 退避しない。
 *   3. 原本の保存: 退避先へ書く → 読み戻してバイト一致 → それからだけ元のキーを消す。
 *   4. 同時実行: 既存の Web Lock（fix745 と同じ名前 chronicle:cc2:materialization:v1・新しい lock 名なし）の中で、
 *      元のキーが最初に読んだ文字列と同じか確かめてから消す（別タブが書き換えていたら消さない）。
 *   5. 失敗したら何もしない: 容量不足・認証失敗・通信失敗・id 不一致・写しの失敗 → 元のキーは消さない。
 *   6. 途中で閉じても安全: 退避先は上書きしない。同じ文字列の退避がすでにあればそれを使い、
 *      別の内容がある番号は飛ばす。
 *   ・墓標でない / 分からない journal（進行中・壊れている・生きている物語）は従来どおり止まる。
 *     COMMITTING_SCHEMA2 を自動で完了させる機能は作らない。サーバーへの書込 0。
 *   ・消すのは 'v292Dfix750_matTxn' 1 本だけ。snapshot・本文・台帳（v292Dfix402_f781g_*）・
 *     止まっている削除・その他のキーには触らない。
 *   ・fix745 の recovery release epoch を、fix750.completeAppliedRecovery と同じ順序（epoch を先に進める →
 *     その後に journal を消す）で進める。開いたままの古いタブは古い状態のまま書き込めない
 *     （MATERIALIZATION_RELOAD_REQUIRED）。
 *   ・ゲーム画面（index.html）で退避した場合だけ、その画面を 1 回だけ読み込み直す
 *     （起動時バリアは document ごとに決まるため。fix756 / fix705 と同じ作法）。
 *     別のタブが先に退避した場合も、journal ありで開かれていた（＝止まっていた）ゲーム画面は、同じ文字列の退避が
 *     あることを確かめてから 1 回だけ読み込み直す（sessionStorage の印で 60 秒に 1 回まで）。
 *
 * 記録（診断用・秘密なし）: localStorage 'v292DfixJR1_note' = { v, count, last:{ at, storyId, phase, slot, len, page } }
 *   hash・アカウント id は書かない。画面には何も出さない（UI の変更なし）。
 * 止める鍵: localStorage v292DfixJR1Off = '1'
 * 検証口: window.__v292DfixJR1 = { status, whenSettled, off }
 * ========================================================================== */
(function () {
'use strict';
if (typeof window === 'undefined' || window.__v292DfixJR1) return;
var TAG = '[v292DfixJR1:journal-retire]';
var BUILD = 'JR1-20261021';
var KEY = 'v292Dfix750_matTxn';
var RET_PREFIX = 'v292DfixJR1_retired_';     /* 物語 id をキー名に入れない（同期の slot キー判定に掛からないように） */
var RET_MAX = 20;
var NOTE_KEY = 'v292DfixJR1_note';
var EPOCH_KEY = 'v292Dfix750_recoveryReleaseEpoch';   /* fix745 RELEASE_EPOCH_KEY と同じ */
var LOCK_NAME = 'chronicle:cc2:materialization:v1';     /* fix745 LOCK_NAME と同じ（新 lock 名なし） */
var RELOAD_GUARD = 'v292DfixJR1_reloadAt';               /* sessionStorage・再読み込みのループ止め */
var ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
var PAGE = (function () {
  try { var s = document.currentScript; var p = s && s.getAttribute('data-jr1'); if (p === 'home' || p === 'index') return p; } catch (e) {}
  try { return /home\.html$/.test(location.pathname) ? 'home' : 'index'; } catch (e) { return 'index'; }
})();

function lsg(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function off() { return lsg('v292DfixJR1Off') === '1'; }
var journalAtLoad = lsg(KEY);

var state = { build: BUILD, page: PAGE, phase: 'idle', code: null, attempts: 0, storyId: null, journalPhase: null,
              slot: null, at: null, reloadScheduled: false, journalAtLoad: journalAtLoad != null };
var LOG = [];
function note(o) { try { o.t = Date.now(); LOG.push(o); if (LOG.length > 30) LOG.shift(); } catch (e) {} }
function done(code, extra) {
  state.phase = 'done'; state.code = code; state.at = Date.now();
  if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) state[k] = extra[k];
  note({ code: code });
  try { console.log(TAG, code); } catch (e) {}
  return code;
}

function who() {
  try {
    return fetch('/api/auth/me', { method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: { 'x-chronicle-csrf': '1' } })
      .then(function (r) { return r.ok ? r.json() : null; }, function () { return null; })
      .then(function (j) { return (j && j.ok === true && j.accountId) ? String(j.accountId) : null; }, function () { return null; });
  } catch (e) { return Promise.resolve(null); }
}
function getStory(id) {
  return new Promise(function (res) {
    var W = null; try { W = window.__v292Dfix697; } catch (e) { W = null; }
    if (!W || typeof W.getStoryV2Once !== 'function') { res({ err: 'NO_READ_PATH' }); return; }
    var settled = false;
    var t = setTimeout(function () { if (!settled) { settled = true; res({ err: 'READ_TIMEOUT' }); } }, 30000);
    try {
      W.getStoryV2Once(id, function (r, err) {   /* fix697 契約: cb(result, errorCode) */
        if (settled) return; settled = true; clearTimeout(t);
        if (err || !r) { res({ err: String(err || 'READ_FAILED') }); return; }
        res({ status: r.status, j: r.j || {} });
      });
    } catch (e) { if (!settled) { settled = true; clearTimeout(t); res({ err: 'READ_THREW' }); } }
  });
}

/* 退避先: 同じ文字列の退避があればそれを使う。無ければ最初の空き番号。別内容の番号は飛ばす（上書きしない）。 */
function pickSlot(raw0) {
  var free = null;
  for (var n = 1; n <= RET_MAX; n++) {
    var k = RET_PREFIX + n, v;
    try { v = localStorage.getItem(k); } catch (e) { return { err: 'SLOT_READ_FAILED' }; }
    if (v === raw0) return { key: k, reuse: true };
    if (v === null && free === null) free = k;
  }
  return free ? { key: free, reuse: false } : { err: 'RETIRED_SLOTS_FULL' };
}
function findRetired(raw0) {
  for (var n = 1; n <= RET_MAX; n++) { if (lsg(RET_PREFIX + n) === raw0) return RET_PREFIX + n; }
  return null;
}
/* fix745 bumpReleaseEpoch と同じ作り（ページに GWS があればそれを使う）。書けなければ null。 */
function bumpEpoch() {
  try { var G = window.__v292DfixGWS; if (G && typeof G.bumpReleaseEpoch === 'function') return G.bumpReleaseEpoch(); } catch (e) { return null; }
  var prev = lsg(EPOCH_KEY);
  var v = String(Date.now()) + '-' + Math.random().toString(36).slice(2, 10);
  if (prev !== null && v === prev) return null;
  try { localStorage.setItem(EPOCH_KEY, v); } catch (e) { return null; }
  if (lsg(EPOCH_KEY) !== v) return null;
  return v;
}
function writeNote(sid, phase, slot, len) {
  try {
    var o = null; try { o = JSON.parse(lsg(NOTE_KEY) || 'null'); } catch (e) { o = null; }
    var count = (o && typeof o.count === 'number') ? o.count : 0;
    localStorage.setItem(NOTE_KEY, JSON.stringify({ v: 1, count: count + 1,
      last: { at: Date.now(), storyId: sid, phase: phase, slot: slot, len: len, page: PAGE } }));
  } catch (e) {}
}

/* lock の中（同期・待ちなし）。元のキーは最後に 1 回だけ消す。 */
function retireLocked(raw0, sid, phase) {
  var raw1;
  try { raw1 = localStorage.getItem(KEY); } catch (e) { return { code: 'ACTIVE_READ_FAILED' }; }
  if (raw1 === null) return findRetired(raw0) ? { code: 'ALREADY_RETIRED' } : { code: 'JOURNAL_GONE' };
  if (raw1 !== raw0) return { code: 'JOURNAL_CHANGED' };
  var s = pickSlot(raw0);
  if (s.err) return { code: s.err };
  if (!s.reuse) {
    try { localStorage.setItem(s.key, raw0); } catch (e) { return { code: 'COPY_WRITE_FAILED' }; }
  }
  var back; try { back = localStorage.getItem(s.key); } catch (e) { return { code: 'COPY_VERIFY_FAILED' }; }
  if (back !== raw0) return { code: 'COPY_VERIFY_FAILED' };
  var raw2; try { raw2 = localStorage.getItem(KEY); } catch (e) { return { code: 'ACTIVE_READ_FAILED' }; }
  if (raw2 !== raw0) return { code: 'JOURNAL_CHANGED' };
  var epoch = bumpEpoch();
  if (!epoch) return { code: 'EPOCH_WRITE_FAILED', slot: s.key };
  try { localStorage.removeItem(KEY); } catch (e) { return { code: 'CLEAR_FAILED', slot: s.key }; }
  if (lsg(KEY) !== null) return { code: 'CLEAR_FAILED', slot: s.key };
  writeNote(sid, phase, s.key, raw0.length);
  return { code: 'RETIRED', slot: s.key, reuse: s.reuse };
}

/* この画面が journal ありで開かれ（＝起動時バリアで止まっている）、その同じ journal がすでに退避されている
   （同じ文字列の退避がある・元のキーは無い）か。別タブが先に退避した場合に使う。read-only。 */
function retiredElsewhere() {
  return PAGE === 'index' && journalAtLoad != null && lsg(KEY) === null && findRetired(journalAtLoad) != null;
}
function scheduleReload(why) {
  if (PAGE !== 'index' || state.reloadScheduled) return false;
  try { var t = +sessionStorage.getItem(RELOAD_GUARD) || 0; if (Date.now() - t < 60000) { note({ reloadSkipped: 'GUARD' }); return false; } sessionStorage.setItem(RELOAD_GUARD, String(Date.now())); } catch (e) { return false; }
  state.reloadScheduled = true; note({ reload: why });
  try { setTimeout(function () { try { location.reload(); } catch (e) {} }, 300); } catch (e) {}
  return true;
}

/* 1 回分の判定。戻り値の code が RETRY_* のときだけ、上限つきでもう一度。 */
function attempt() {
  state.attempts++;
  if (off()) return Promise.resolve('OFF');
  var raw0 = lsg(KEY);
  if (raw0 === null) return Promise.resolve(retiredElsewhere() ? 'ALREADY_RETIRED' : 'NO_JOURNAL');
  var j = null; try { j = JSON.parse(raw0); } catch (e) { j = null; }
  if (!j || typeof j !== 'object' || typeof j.storyId !== 'string' || !ID_RE.test(j.storyId) || typeof j.phase !== 'string')
    return Promise.resolve('HOLD_JOURNAL_CORRUPT');
  var sid = j.storyId, phase = j.phase;
  state.storyId = sid; state.journalPhase = phase;
  var a0 = null;
  return who().then(function (w0) {
    if (!w0) return 'RETRY_AUTH_UNKNOWN';
    a0 = w0;
    return getStory(sid).then(function (g) {
      if (g.err) return (g.err === 'NOT_LOGGED_IN') ? 'RETRY_NOT_LOGGED_IN' : 'RETRY_READ_FAILED';
      var b = g.j || {};
      if (g.status !== 200 || b.ok !== true) return (g.status >= 500 || g.status === 429) ? 'RETRY_READ_FAILED' : 'HOLD_NOT_CONFIRMED';
      if (b.id == null || String(b.id) !== sid) return 'HOLD_ID_MISMATCH';
      if (b.authority !== 'shadow' && b.authority !== 'canonical') return 'HOLD_NOT_CONFIRMED';
      if (b.deleted !== true) return 'HOLD_NOT_TOMBSTONE';
      return who().then(function (w1) {
        if (!w1 || w1 !== a0) return 'HOLD_PRINCIPAL_CHANGED';
        var L = null; try { L = navigator.locks; } catch (e) { L = null; }
        if (!L || typeof L.request !== 'function') return 'HOLD_NO_WEB_LOCKS';
        return L.request(LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, function (lock) {
          if (!lock) return { code: 'RETRY_LOCK_BUSY' };
          return retireLocked(raw0, sid, phase);
        }).then(function (r) {
          if (r && r.slot) state.slot = r.slot;
          return (r && r.code) || 'HOLD_LOCK_FAILED';
        }, function () { return 'HOLD_LOCK_FAILED'; });
      });
    });
  });
}

var MAX_ATTEMPTS = 4, GAP_MS = 2000;
var RUN_P = null;
function run() {
  if (RUN_P) return RUN_P;
  state.phase = 'running';
  RUN_P = new Promise(function (resolve) {
    (function step() {
      attempt().then(function (code) {
        if (/^RETRY_/.test(code) && state.attempts < MAX_ATTEMPTS) { state.code = code; setTimeout(step, GAP_MS); return; }
        var c = /^RETRY_/.test(code) ? 'HOLD_' + code.slice(6) : code;
        done(c);
        if (c === 'RETIRED' || c === 'ALREADY_RETIRED') scheduleReload(c);
        resolve(JSON.parse(JSON.stringify(state)));
      }, function (e) { done('HOLD_THREW', { detail: String(e && e.message || e).slice(0, 80) }); resolve(JSON.parse(JSON.stringify(state))); });
    })();
  });
  return RUN_P;
}

/* 別タブが退避したとき: この画面が journal ありで開かれていた（＝止まっていた）なら 1 回だけ読み込み直す。 */
try {
  window.addEventListener('storage', function (ev) {
    try {
      if (off() || ev.key !== KEY || ev.newValue !== null) return;
      if (retiredElsewhere()) scheduleReload('RETIRED_ELSEWHERE');
    } catch (e) {}
  });
} catch (e) {}

function boot() {
  if (off()) { done('OFF'); return; }
  if (lsg(KEY) === null) {
    if (retiredElsewhere()) { done('ALREADY_RETIRED'); scheduleReload('RETIRED_ELSEWHERE'); return; }
    done('NO_JOURNAL'); return;
  }
  setTimeout(run, 600);
}
try {
  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot, { once: true });
} catch (e) {}

window.__v292DfixJR1 = {
  BUILD: BUILD, off: off,
  status: function () { return { state: JSON.parse(JSON.stringify(state)), log: LOG.slice(), active: lsg(KEY) != null }; },
  whenSettled: function () { return RUN_P ? RUN_P : Promise.resolve(JSON.parse(JSON.stringify(state))); }
};
try { console.log(TAG, 'loaded', BUILD, 'page=' + PAGE); } catch (e) {}
})();
