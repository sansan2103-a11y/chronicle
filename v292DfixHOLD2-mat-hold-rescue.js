/* v292DfixHOLD2 — 全物語停止（HOLD1）の救済 UI（1a）と、昇格中の外見保存の待機（1b）（GPT #127-VZ 1a / 1b）
 * ============================================================================
 * 1a 救済 UI（既定 ON・kill localStorage v292DfixHOLD2Off='1'）
 *   fix827 の通知（journal v292Dfix750_matTxn が残り、MAT 系の理由でターンが止まっている）のパネルに、
 *   条件をすべて確かめられたときだけ「この作りかけの物語を削除してやり直す」を足す。
 *   条件（どれか 1 つでも確かめられなければボタンを出さない＝案内文だけ）:
 *     journal の対象 = 開いている物語／同一アカウント（serverMe の accountId・iso2 の作成・書込の記録・getstory が
 *     そのアカウントの行を返す）／Vault で隠していない（fix889 が無い・判定不明も不可）／削除を使えるアカウント（fix933）／
 *     端末 0 ターン・サーバー 0 ターン（getstory を 1 回）／墓標でない／未同期の印（DIRTY 等）・送信中の印・保存予約がない。
 *   押すと画面内の確認（ネイティブの confirm/prompt は使わない）→ ホームへ移り、ホームで同じ条件を確かめ直してから、
 *   既存の公式の削除（DL2 の確認シート〔openDelete〕。DL2 の削除はホームでだけ動く＝D8）をその物語だけ選んだ状態で開く。
 *   実際に送るのは DL2 のシートの「一覧から削除する」（DL2 の既存の手順・確認・CAS のまま）。
 *   DL2 の成功のあと getstory で墓標（deleted:true・同じ id・authority shadow/canonical＝JR1 が退避する条件）を確かめ、
 *   ホームを読み直す（JR1 が起動時に journal を退避する）。journal はこのモジュールでは触らない。
 *   途中で失敗・取り消し → 何も消さない（DL2 も送らない／送れなかった）。理由を短く出す。
 * 1b 外見保存の待機（既定 ON・kill localStorage v292DfixHOLD2bOff='1'）
 *   matWait(storyId): その物語の昇格 journal がある（壊れて読めない journal を含む）／その物語の fix756 が実行中 のとき
 *   理由の文字列を返す（それ以外は ''）。STARTICON（外見の自動保存・内部の自動再読込・絵の送信の開始）と
 *   av2 の setProfile の入口がこれを見る。待機の上限（WAIT_MS）は STARTICON の側で数える。
 * 記録: stats()（数と理由のコードだけ。本文・題名・id・アカウントは記録しない）。書くのは sessionStorage の 1 本
 *   （'v292DfixHOLD2_intent'：ホームへ渡す 1 回の依頼。物語の id と時刻だけ・10 分で無効）だけ。localStorage への書込 0。
 * ========================================================================== */
(function () {
'use strict';
if (typeof window === 'undefined' || window.__v292DfixHOLD2) return;
var VERSION = 'HOLD2-20261121-r1';
var KEY = 'v292Dfix750_matTxn', INTENT = 'v292DfixHOLD2_intent', INTENT_TTL = 10 * 60 * 1000, NOTE_ID = 'v292DfixHOLD2-note';
var WAIT_MS = 120000, READ_TIMEOUT_MS = 15000;
var ID_RE = /^[A-Za-z0-9]{1,80}$/;
var PAGE = (function () {
  try { var s = document.currentScript; var p = s && s.getAttribute && s.getAttribute('data-hold2'); if (p === 'home' || p === 'index') return p; } catch (e) {}
  try { return /home\.html$/.test(location.pathname) ? 'home' : 'index'; } catch (e) { return 'index'; }
})();
function lsg(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function ssg(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
function sss(k, v) { try { sessionStorage.setItem(k, v); return sessionStorage.getItem(k) === v; } catch (e) { return false; } }
function ssr(k) { try { sessionStorage.removeItem(k); } catch (e) {} }
function off() { return lsg('v292DfixHOLD2Off') === '1' || lsg('v292DfixHOLD2On') !== '1'; }   /* stage 1 (2026-11-21): QA 前は既定 OFF。Owner PC の実機 QA 後に既定 ON へ戻す */
function bOff() { return lsg('v292DfixHOLD2bOff') === '1' || lsg('v292DfixHOLD2bOn') !== '1'; }   /* stage 1: 同上 */

var st = { a: { shown: 0, offered: 0, guidance: 0, skip: {}, confirmOpened: 0, confirmCancelled: 0, executed: 0, recheckFailed: 0 },
           home: { started: 0, skip: {}, sheetOpened: 0, success: 0, fail: {}, cancelled: 0, tombstoneOk: 0, retired: 0, retireHold: 0 },
           b: {} };
function bump(o, k) { k = String(k || 'unknown').slice(0, 40); o[k] = (o[k] || 0) + 1; }
function bNote(k) { bump(st.b, k); }

/* ---------------------------------------------------------------- 1b */
function matWait(id) {
  if (bOff()) return '';
  if (!id) return '';
  id = String(id);
  var raw = lsg(KEY);
  if (raw != null) {
    var j = null; try { j = JSON.parse(raw); } catch (e) { j = null; }
    if (!j || typeof j !== 'object' || typeof j.storyId !== 'string') return 'journal-unreadable';
    if (j.storyId === id) return 'journal';
  }
  try { var F = window.__v292Dfix756, s = (F && typeof F.state === 'function') ? F.state() : null;
    if (s && s.phase === 'running' && String(s.storyId) === id) return 'fix756-running'; } catch (e) { return 'fix756-unknown'; }
  return '';
}

/* ---------------------------------------------------------------- 条件（共通） */
/* iso2 / fix946 と同じ式（v292Diso2-owner-send-guard.js の hash / fnv / tagOf）。serverMe の accountId から期待する印を作る。 */
function h36(s) { var h = 0; s = String(s); for (var i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; } return Math.abs(h).toString(36); }
function fnv(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; } return (h >>> 0).toString(36); }
function tagOfAcct(a) { var raw = 'acct:' + a; return 'o' + fnv(raw) + h36(raw); }
function meAcct() { try { var A = window.__v292Dfix893, m = (A && typeof A.serverMe === 'function') ? A.serverMe() : null; return (m && m.accountId) ? String(m.accountId) : null; } catch (e) { return null; } }
function accountOk(id) {
  var me = meAcct(); if (!me) return 'account-unknown';
  try {
    var I = window.__v292Diso2; if (!I || typeof I.owner !== 'function' || typeof I.stampOf !== 'function') return 'account-unknown';
    var o = I.owner(), want = tagOfAcct(me);
    if (!o || o.bad || o.docKind !== 'acct' || o.now !== want || (o.doc != null && o.doc !== want)) return 'account-unknown';
    var sp = I.stampOf(id, 's'); if (!sp || sp.c !== want || (sp.w != null && sp.w !== want)) return 'account-unknown';
  } catch (e) { return 'account-unknown'; }
  return null;
}
function vaultOk(id) {
  try { var F = window.__v292Dfix889; if (!F || typeof F.isHidden !== 'function') return 'vault-unknown'; if (F.isHidden(id)) return 'vault'; } catch (e) { return 'vault-unknown'; }
  try { var raw = lsg('chr6_vault_hidden'); if (raw != null) { var o = JSON.parse(raw); var a = (o && Array.isArray(o.hidden)) ? o.hidden : null; if (!a) return 'vault-unknown';
    for (var i = 0; i < a.length; i++) if (String(a[i]) === id) return 'vault'; } } catch (e) { return 'vault-unknown'; }
  return null;
}
function deleteUsable() {
  if (lsg('v292DfixDL2Off') === '1') return 'delete-unavailable';
  try { var F = window.__v292Dfix933; if (!F || typeof F.status !== 'function' || F.status().allowed !== true) return 'delete-unavailable'; } catch (e) { return 'delete-unavailable'; }
  return null;
}
function localOk(id) {
  var raw = lsg('chr6_slot_' + id); if (raw == null) return 'local-unreadable';
  var d = null; try { d = JSON.parse(raw); } catch (e) { d = null; }
  if (!d || typeof d !== 'object' || !Array.isArray(d.turns)) return 'local-unreadable';
  if (d.turns.length !== 0) return 'turns';
  var mk = lsg('v292Dfix402_f781g_' + id);
  if (mk != null) { var m = null; try { m = JSON.parse(mk); } catch (e) { m = null; }
    if (!m || typeof m !== 'object') return 'marker-unreadable';
    if (m.inFlightSave) return 'saving';
    if (m.state !== 'CLEAN') return 'dirty'; }
  try { var W = window.__v292Dfix697, f = (W && typeof W.f909 === 'function') ? W.f909() : null; if (f && (f.pushTimer || f.inFlight)) return 'saving'; } catch (e) { return 'saving'; }
  return null;
}
function getStory(id) {
  return new Promise(function (res) {
    var W = null; try { W = window.__v292Dfix697; } catch (e) {}
    if (!W || typeof W.getStoryV2Once !== 'function') { res({ err: 'NO_READ_PATH' }); return; }
    var done = false, t = setTimeout(function () { if (!done) { done = true; res({ err: 'READ_TIMEOUT' }); } }, READ_TIMEOUT_MS);
    try { W.getStoryV2Once(id, function (r, err) { if (done) return; done = true; clearTimeout(t); if (err || !r) { res({ err: String(err || 'READ_FAILED') }); return; } res({ status: r.status, j: r.j || {} }); }); }
    catch (e) { if (!done) { done = true; clearTimeout(t); res({ err: 'READ_THREW' }); } }
  });
}
function serverZero(id) {
  return getStory(id).then(function (g) {
    if (g.err) return 'server-unreadable';
    var b = g.j || {};
    if (g.status === 404) return 'server-absent';
    if (g.status !== 200 || b.ok !== true) return 'server-unreadable';
    if (b.id == null || String(b.id) !== id) return 'server-unreadable';
    if (b.deleted === true) return 'tombstone';
    if (b.authority !== 'shadow' && b.authority !== 'canonical') return 'server-unreadable';
    var rec = b.record; if (!rec || typeof rec !== 'object' || !rec.body || !Array.isArray(rec.body.turns)) return 'server-turns-unknown';
    if (rec.body.turns.length !== 0) return 'turns';
    if (rec.turnCount != null && rec.turnCount !== 0) return 'turns';
    return null;
  }, function () { return 'server-unreadable'; });
}
function readJournal() {
  var raw = lsg(KEY); if (raw == null) return { none: true };
  var j = null; try { j = JSON.parse(raw); } catch (e) { j = null; }
  if (!j || typeof j !== 'object' || typeof j.storyId !== 'string' || !ID_RE.test(j.storyId)) return { corrupt: true };
  return { id: j.storyId };
}
/* 全部の条件。戻り: Promise<null（全部 OK）| 理由コード> */
function checkAll(id) {
  var why = vaultOk(id) || deleteUsable() || accountOk(id) || localOk(id);
  if (why) return Promise.resolve(why);
  return serverZero(id).then(function (w) {
    if (w) return w;
    return accountOk(id) || vaultOk(id) || localOk(id);   /* 読んでいる間に変わっていないか */
  });
}

/* ---------------------------------------------------------------- 1a: index（fix827 のパネル） */
var TXT_OTHER = 'ホームに戻り、作りかけ（0 ターン）の物語があれば削除してください。解決しない場合は管理者に連絡してください。';
var TXT_CONFIRM = 'この物語（0 ターン）を一覧から削除します。設定とアイコンは失われます。削除後、ホームで新しく作り直してください。';
var WHY_TEXT = { turns: 'ターンが進んでいる物語です', vault: '隠している物語です', 'vault-unknown': '隠している物語かどうかを確認できません',
  'account-unknown': 'アカウントを確認できません', 'delete-unavailable': 'この画面からは削除を使えません', 'local-unreadable': '端末の状態を確認できません',
  'marker-unreadable': '保存の状態を確認できません', dirty: 'クラウドへの保存が終わっていません', saving: '保存の途中です', 'server-unreadable': 'クラウドの状態を確認できません',
  'server-absent': 'クラウドでこの物語を確認できません', 'server-turns-unknown': 'クラウドの状態を確認できません', tombstone: 'クラウドではすでに削除されています（ホームを開き直してください）',
  'journal-unreadable': '保存処理の記録を読めません' };
function sameText(why) { return 'この物語は、ここからは安全に削除できない状態です（' + (WHY_TEXT[why] || '状態を確認できません') + '）。解決しない場合は管理者に連絡してください。'; }
function docStoryId() { try { var k = window.__chronicleDocumentStoryKey; return (typeof k === 'string' && k.indexOf('chr6_slot_') === 0) ? k.slice(10) : null; } catch (e) { return null; } }
function mk(tag, attrs, text) { var e = document.createElement(tag); if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; }
var BTN_CSS = 'margin:6px 8px 0 0;padding:6px 12px;font-size:13px;border-radius:7px;border:1px solid #c99;background:#3a2626;color:#f2e2e2;cursor:pointer;';
function evaluateIndex() {
  var J = readJournal();
  if (J.none) return Promise.resolve({ kind: 'none' });
  if (J.corrupt) return Promise.resolve({ kind: 'same', why: 'journal-unreadable' });
  var doc = docStoryId();
  if (!doc || J.id !== doc) return Promise.resolve({ kind: 'other' });
  return checkAll(J.id).then(function (w) { return w ? { kind: 'same', why: w } : { kind: 'ok', id: J.id }; }, function () { return { kind: 'same', why: 'unknown' }; });
}
function decorate(el, out) {
  if (off() || PAGE !== 'index' || !el) return false;
  st.a.shown++;
  var box = mk('div', { 'data-h2': 'box' }); box.style.cssText = 'margin-top:6px;';
  el.appendChild(box);
  evaluateIndex().then(function (r) {
    if (!box.parentNode) return;
    if (r.kind === 'none') { bump(st.a.skip, 'no-journal'); return; }
    if (r.kind !== 'ok') {
      bump(st.a.skip, r.kind === 'other' ? 'other-story' : r.why); st.a.guidance++;
      box.appendChild(mk('div', { 'data-h2': 'guide' }, r.kind === 'other' ? TXT_OTHER : sameText(r.why)));
      return;
    }
    st.a.offered++;
    var b = mk('button', { 'data-h2': 'delete', type: 'button' }, 'この作りかけの物語を削除してやり直す'); b.style.cssText = BTN_CSS;
    b.onclick = function () { openConfirm(box, b, r.id); };
    box.appendChild(b);
  });
  return true;
}
function openConfirm(box, b, id) {
  st.a.confirmOpened++;
  b.disabled = true;
  var c = mk('div', { 'data-h2': 'confirm', role: 'alertdialog' }); c.style.cssText = 'margin-top:6px;padding:8px;border:1px solid #c99;border-radius:8px;background:#2a1f1f;';
  c.appendChild(mk('div', { 'data-h2': 'confirm-text' }, TXT_CONFIRM));
  var go = mk('button', { 'data-h2': 'confirm-go', type: 'button' }, '削除してやり直す（ホームへ）'); go.style.cssText = BTN_CSS;
  var no = mk('button', { 'data-h2': 'confirm-no', type: 'button' }, 'やめる'); no.style.cssText = BTN_CSS.replace('#3a2626', '#1a2431');
  var msg = mk('div', { 'data-h2': 'confirm-msg' });
  no.onclick = function () { st.a.confirmCancelled++; if (c.parentNode) c.parentNode.removeChild(c); b.disabled = false; };
  go.onclick = function () {
    go.disabled = true; no.disabled = true; msg.textContent = '確認しています…';
    var J = readJournal();
    var p = (J.id && J.id === id && docStoryId() === id) ? checkAll(id) : Promise.resolve('changed');
    p.then(function (w) {
      if (w) { st.a.recheckFailed++; bump(st.a.skip, 'recheck:' + w); if (c.parentNode) c.parentNode.removeChild(c); if (b.parentNode) b.parentNode.removeChild(b);
        box.appendChild(mk('div', { 'data-h2': 'guide' }, '削除しませんでした（' + (WHY_TEXT[w] || '状態が変わりました') + '）。何も変わっていません。')); return; }
      if (!sss(INTENT, JSON.stringify({ v: 1, id: id, t: Date.now(), phase: 'go' }))) { msg.textContent = '削除の準備ができませんでした。何も変わっていません。'; no.disabled = false; return; }
      st.a.executed++;
      try { location.href = 'home.html'; } catch (e) {}
    });
  };
  c.appendChild(go); c.appendChild(no); c.appendChild(msg);
  box.appendChild(c);
}

/* ---------------------------------------------------------------- 1a: home（DL2 の公式の削除へ渡す） */
function note(text) {
  try { var old = document.getElementById(NOTE_ID); if (old && old.parentNode) old.parentNode.removeChild(old);
    var d = mk('div', { id: NOTE_ID, role: 'status' }); d.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:99997;max-width:92vw;box-sizing:border-box;background:#1d2733;color:#dfe8f2;border:1px solid #c99;border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.6;';
    d.appendChild(mk('div', { 'data-h2': 'note-text' }, text));
    var x = mk('button', { 'data-h2': 'note-close', type: 'button' }, '閉じる'); x.style.cssText = 'margin-top:6px;padding:4px 12px;font-size:13px;border-radius:7px;border:1px solid #567;background:#1a2431;color:#cfd8e3;cursor:pointer;';
    x.onclick = function () { if (d.parentNode) d.parentNode.removeChild(d); };
    d.appendChild(x); (document.body || document.documentElement).appendChild(d); } catch (e) {}
}
function readIntent() {
  var raw = ssg(INTENT); if (raw == null) return null;
  var o = null; try { o = JSON.parse(raw); } catch (e) { o = null; }
  if (!o || o.v !== 1 || typeof o.id !== 'string' || !ID_RE.test(o.id) || typeof o.t !== 'number' || Date.now() - o.t > INTENT_TTL || Date.now() < o.t - 60000) { ssr(INTENT); return null; }
  return o;
}
function homeFail(code, text) { bump(st.home.fail, code); ssr(INTENT); note(text || ('削除しませんでした（' + (WHY_TEXT[code] || '状態を確認できません') + '）。物語はそのまま残っています。')); }
function waitFor(pred, ms, step) { return new Promise(function (res) { var t0 = Date.now(); (function poll() { var v = null; try { v = pred(); } catch (e) { v = null; } if (v) return res(v); if (Date.now() - t0 > ms) return res(null); setTimeout(poll, step || 500); })(); }); }
var HP = null;
function homeRun() {
  var it = readIntent(); if (!it) return Promise.resolve('NO_INTENT');
  if (off()) { ssr(INTENT); return Promise.resolve('OFF'); }
  var id = it.id;
  if (it.phase === 'deleted') {
    /* 削除の後の読み直し: JR1 の起動時の退避を待つ（JR1 は自分で動く。ここでは journal に触らない） */
    return waitFor(function () { var J = window.__v292DfixJR1, s = J && J.status ? J.status() : null; return (s && s.state && s.state.phase === 'done') ? s : null; }, 60000).then(function () {
      ssr(INTENT);
      var J = readJournal();
      if (J.none || (J.id && J.id !== id)) { st.home.retired++; note('作りかけの物語を削除しました。ホームで新しく作り直してください。'); return 'RETIRED'; }
      st.home.retireHold++; note('物語の削除は済みましたが、止まっている保存処理の記録の片づけを確認できませんでした。ホームをもう一度開き、解決しない場合は管理者に連絡してください。'); return 'RETIRE_HOLD';
    });
  }
  if (it.phase !== 'go') { ssr(INTENT); return Promise.resolve('BAD_PHASE'); }
  st.home.started++;
  var D = null;
  return waitFor(function () { var x = window.__v292DfixDL2; return (x && typeof x.active === 'function' && x.active() && meAcct()) ? x : null; }, 30000).then(function (d) {
    D = d; if (!D) { homeFail('delete-unavailable'); return 'DL2_UNAVAILABLE'; }
    var J = readJournal();
    if (J.none) { ssr(INTENT); note('止まっている保存処理はもうありません。物語はそのまま残っています。'); bump(st.home.skip, 'no-journal'); return 'NO_JOURNAL'; }
    if (J.corrupt || J.id !== id) { homeFail('journal-changed', '削除しませんでした（状態が変わりました）。物語はそのまま残っています。'); return 'JOURNAL_CHANGED'; }
    return checkAll(id).then(function (w) {
      if (w) { homeFail(w); return 'CHECK_' + w; }
      st.home.sheetOpened++;
      try { D.openDelete([id]); } catch (e) { homeFail('sheet', '削除の画面を開けませんでした。物語はそのまま残っています。'); return 'SHEET_THREW'; }
      /* DL2 のシートの結果を待つ（送るのは利用者が DL2 の「一覧から削除する」を押したとき）。閉じたら取り消し */
      return waitFor(function () {
        var s = D.status(); var row = (s && s.rows) ? s.rows.filter(function (r) { return r.id === id; })[0] : null;
        if (row && row.result) return { r: row.result, done: row.done };
        if (s && !s.sheetOpen && s.phase == null) {   /* 閉じられた: 閉じる直前に結果が出ていたかを DL2 の記録（メモリ）で確かめる */
          var lg = (s.log || []).filter(function (e) { return e && e.id === id; }); var last = lg.length ? lg[lg.length - 1] : null;
          return last ? { r: { ok: !!last.ok, text: last.text }, done: !!last.ok } : { closed: true }; }
        return null;
      }, INTENT_TTL, 500).then(function (x) {
        if (!x || x.closed) { st.home.cancelled++; ssr(INTENT); note('削除をやめました。物語はそのまま残っています。'); return 'CANCELLED'; }
        if (!x.r.ok) { homeFail('dl2-failed', '削除できませんでした（' + String(x.r.text || '').slice(0, 80) + '）。止まっている保存処理の記録はそのまま残っています。'); return 'DL2_FAILED'; }
        st.home.success++;
        return getStory(id).then(function (g) {
          var b = g.j || {};
          if (g.err || g.status !== 200 || b.ok !== true || String(b.id) !== id || b.deleted !== true || (b.authority !== 'shadow' && b.authority !== 'canonical')) {
            homeFail('tombstone-unconfirmed', 'クラウドで削除を確認できませんでした。止まっている保存処理の記録はそのまま残っています。ホームをもう一度開いてください。'); return 'TOMBSTONE_UNCONFIRMED'; }
          st.home.tombstoneOk++;
          if (!sss(INTENT, JSON.stringify({ v: 1, id: id, t: Date.now(), phase: 'deleted' }))) { note('物語を削除しました。ホームをもう一度開いてください。'); return 'INTENT_WRITE_FAILED'; }
          try { location.replace('home.html'); } catch (e) {}
          return 'DELETED';
        });
      });
    });
  });
}
function bootHome() { if (PAGE !== 'home') return; if (ssg(INTENT) == null) return; HP = homeRun(); }
try { if (document.readyState === 'complete') setTimeout(bootHome, 0); else window.addEventListener('load', function () { setTimeout(bootHome, 0); }, { once: true }); } catch (e) {}

window.__v292DfixHOLD2 = {
  VERSION: VERSION, PAGE: PAGE, WAIT_MS: WAIT_MS, off: off, bOff: bOff,
  matWait: matWait, bNote: bNote, decorate: decorate,
  whenHomeSettled: function () { return HP || Promise.resolve('NO_INTENT'); },
  stats: function () { return JSON.parse(JSON.stringify({ version: VERSION, page: PAGE, off: off(), bOff: bOff(), a: st.a, home: st.home, b: st.b })); },
  _t: { tagOfAcct: tagOfAcct, evaluateIndex: evaluateIndex, checkAll: checkAll }
};
})();
