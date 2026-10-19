/* =====================================================================
 * v292Dbav2-beta.js — 招待者（beta）を最初から Asset v2 で始める（GPT #127-DV・Local 候補・未配信）
 * ---------------------------------------------------------------------
 * 正本はサーバー：/auth/me の features.assetV2Beta（entitlement beta かつ CHR_ASSET_V2_ALLOW・env CHR_AV2_BETA）。
 * 安全（旧画像の書込・公開 /img・旧生成の遮断）は Worker が行う。この client は「使い勝手」だけを受け持つ。
 *   1. features.assetV2Beta===true の端末では Asset v2 の local flag（v292Dav2On）を ON にする（自分で ON にした印 v292DbAv2 を残す）。
 *      false に変わったら、自分が ON にした分だけ戻す（Owner が手で ON にした flag には触らない）。
 *   2. 新しい物語を作る瞬間（home の newStory・シナリオの fix819 instantiate が本文を最初に書く前）に cast.av2 = schema 2 の印を付ける
 *      → 最初の保存で S2 の物語として作られる（サーバーの既存契約 none→S2）。サーバーの答えが true のときだけ。既存の物語には触らない。
 *   3. home で、まだ判定が分からない（/auth/me 未取得）うちは「新しい物語」「シナリオを作る」を保留する（旧形式に落とさない）。
 * kill: localStorage v292Dbav2Off = '1'   観測口: window.__v292Dbav2.status()
 * ===================================================================== */
(function () {
  'use strict';
  if (window.__v292Dbav2) return;
  function g(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function s(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function r(k) { try { localStorage.removeItem(k); } catch (e) {} }
  if (g('v292Dbav2Off') === '1') return;
  var st = { mode: null, flagSet: 0, flagCleared: 0, sidecar: null, held: 0 };
  function mode() {   /* true / false / null(unknown) — server answer only */
    try { var F = window.__v292Dfix893; if (!F || typeof F.serverMe !== 'function' || typeof F.features !== 'function') return null;
      var me = F.serverMe(), f = F.features(); if (!me || !f) return null; return f.assetV2Beta === true || f.assetV2New === true; } catch (e) { return null; }   /* ★FG-1c (GPT #127-FJ): Owner の新しい物語も S2 で始める（server の features.assetV2New）。旧画像の経路を閉じるのは server 側で beta だけ */
  }
  function applyFlag() {
    var m = mode(); st.mode = m; if (m === null) return m;
    if (m) { if (g('v292Dav2On') !== '1') { s('v292Dav2On', '1'); s('v292DbAv2', '1'); st.flagSet++; } }   /* ★FG-1c: 自分が ON にしたときだけ印を付ける（Owner が前から ON にしていた flag を、後で false になったときに消さない） */
    else if (g('v292DbAv2') === '1') { r('v292DbAv2'); r('v292Dav2On'); st.flagCleared++; }
    return m;
  }
  /* 2. new story → schema 2: stamped at creation (stampNew below, called by home newStory and fix819 instantiate) BEFORE the body is
     first written. No later fallback on the story page: a story whose first save already reached the server as legacy must stay legacy
     (LEG→S2 is refused by the server and would block saves). */
  /* 4. ★S2 初期昇格ガード（GPT #127-DX (b)）：新しく作った S2 の物語（URL new=1・本文に schema 2 の印）は、fix756 の初回の昇格
        （shadow → canonical schema 2）が終わるまで、物語の中身を変える操作（設定・送信）を止める。表示はそのまま。
        理由：昇格の途中で local の投影が変わると fix750 が HASH_MISMATCH で昇格を諦め、S2 の shadow は fix756r の救済の対象外なので
        以後の保存がサーバーへ届かなくなる（実測）。保存の門番・hash には触れない。
        解除：fix756 が MATERIALIZED。昇格できなかった・時間切れ：止めたまま、再試行できる案内（ホームへ）を出す。 */
  var isIndex = /\/index(\.html)?$/.test(location.pathname) || location.pathname === '/';
  var qs = null; try { qs = new URLSearchParams(location.search); } catch (e) {}
  var docId = qs ? qs.get('story') : null, isNew = !!(qs && qs.get('new') === '1');
  var prep = { on: false, done: false, verdict: null, t0: 0, refused: 0 };
  function slotS2(id) { try { var b = JSON.parse(localStorage.getItem('chr6_slot_' + id) || 'null'); return !!(b && b.cast && b.cast.av2 && b.cast.av2.assetSchema === 2); } catch (e) { return false; } }
  var OV_ID = 'v292Dbav2-prep';
  function overlay(msg, withHome) {
    try { var o = document.getElementById(OV_ID);
      if (!o) { o = document.createElement('div'); o.id = OV_ID;
        o.setAttribute('style', 'position:fixed;inset:0;z-index:2147483000;background:rgba(10,10,14,.72);display:flex;align-items:center;justify-content:center;pointer-events:auto');
        var c = document.createElement('div'); c.setAttribute('data-bav2', 'card'); c.setAttribute('style', 'background:#1c1c24;color:#eee;padding:18px 20px;border-radius:10px;max-width:86%;font-size:14px;line-height:1.7;text-align:center');
        o.appendChild(c); ['click', 'mousedown', 'touchstart', 'keydown', 'input'].forEach(function (t) { o.addEventListener(t, function (ev) { if (!(ev.target && ev.target.getAttribute && ev.target.getAttribute('data-bav2') === 'home')) { ev.stopPropagation(); } }, true); });
        (document.body || document.documentElement).appendChild(o); }
      var card = o.querySelector('[data-bav2="card"]'); card.textContent = msg;
      if (withHome && !o.querySelector('[data-bav2="home"]')) { var b = document.createElement('button'); b.setAttribute('data-bav2', 'home'); b.textContent = 'ホームへ戻る'; b.setAttribute('style', 'display:block;margin:12px auto 0;padding:6px 14px'); b.onclick = function () { location.href = 'home.html'; }; card.appendChild(b); }
    } catch (e) {}
  }
  function unOverlay() { try { var o = document.getElementById(OV_ID); if (o) o.parentNode.removeChild(o); } catch (e) {} }
  function wrapG() {
    try { var G = window.G; if (!G || G.__bav2) return !!(G && G.__bav2);
      ['submit', 'cont', 'retry'].forEach(function (k) { var f = G[k]; if (typeof f !== 'function') return;
        G[k] = function () { if (prep.on && !prep.done) { prep.refused++; overlay('物語を準備しています。少し待ってから、もう一度送信してください。'); return; } return f.apply(this, arguments); }; });
      G.__bav2 = true; return true; } catch (e) { return false; }
  }
  var MAT = 'v292Dbav2_mat:';
  function curAcct() { try { var F = window.__v292Dfix893; var m = F && typeof F.me === 'function' ? F.me() : null; return (m && m.accountId) ? String(m.accountId) : null; } catch (e) { return null; } }
  function writeMat() { try { sessionStorage.setItem(MAT + docId, JSON.stringify({ acct: curAcct(), t: Date.now() })); } catch (e) {} }
  function readMat() {   /* この tab・この物語・このアカウントの印だけを使う（#127-DZ） */
    try { var v = sessionStorage.getItem(MAT + docId); if (!v) return null; var o = JSON.parse(v); var a = curAcct();
      if (!o || !o.acct || !a || o.acct !== a) return null; return o; } catch (e) { return null; }
  }
  function canonicalNow() {   /* fix705 の分類で、この document の物語がサーバーで canonical か（true / false / null=まだ分からない） */
    try { var F5 = window.__v292Dfix705; if (!F5 || typeof F5.docAuthority !== 'function') return null; var a = F5.docAuthority();
      if (!a || String(a.id) !== String(docId) || a.fresh !== true) return null; return !!(a.present === true && String(a.authority || '') === 'canonical'); } catch (e) { return null; }
  }
  var SEND = { on: false, label: null };
  function sendState() {   /* #127-DY Q3: 送信の準備（fix892 の判定そのもの）をボタンに映す。タイマーで送信可能にはしない・自動送信しない */
    try { var btn = document.getElementById('sendBtn'); if (!btn) return; var F = window.__v292Dfix892; var k = (F && typeof F.holdKind === 'function') ? F.holdKind() : null;
      var hold = !!k || (prep.on && !prep.done);
      if (hold && !SEND.on) { SEND.on = true; SEND.label = btn.textContent; btn.disabled = true; btn.setAttribute('data-bav2-hold', '1'); btn.textContent = '保存準備中…'; }
      else if (!hold && SEND.on) { SEND.on = false; btn.disabled = false; btn.removeAttribute('data-bav2-hold'); if (SEND.label != null) btn.textContent = SEND.label; }
    } catch (e) {}
  }
  function release(v) { prep.done = true; prep.verdict = v; unOverlay(); writeMat(); }
  function fail(v) { prep.done = true; prep.failed = true; prep.verdict = v; overlay('物語の準備ができませんでした（' + v + '）。ホームへ戻って、もう一度開いてください。', true); }
  function prepTick() {
    if (!isIndex || !isNew || !docId) return;
    if (!prep.on) {
      if (!slotS2(docId)) return;
      prep.on = true; prep.t0 = Date.now();
      if (readMat()) prep.verify = true;   /* r5 (#127-EA): the mark never releases by itself — the overlay stays until fix705 confirms canonical */
      overlay('物語を準備しています…');
    }
    wrapG(); sendState();
    if (prep.done) return;
    if (prep.verify) {   /* 印がある＝この tab で昇格を見た物語。fix705 の分類で canonical を確かめてから解放する（分類前は解放しない） */
      var cv = canonicalNow();
      if (cv === true) return release('MARK_AND_SERVER_CANONICAL');
      if (cv === false) return fail('NOT_CANONICAL_AFTER_MARK');
      if (Date.now() - prep.t0 > 60000) return fail('CLIENT_TIMEOUT');
      return;
    }
    var cn = canonicalNow();
    if (cn === true) return release('SERVER_CANONICAL');   /* 昇格後の再読込・別の経路で既に canonical */
    var st = null; try { st = window.__v292Dfix756 && window.__v292Dfix756.status(); } catch (e) {}
    var s756 = st && st.state;
    if (s756 && s756.phase === 'done' && (s756.verdict === 'MATERIALIZED' || s756.verdict === 'ALREADY_SCHEMA2')) {
      /* 昇格の直後は、この document がすぐ再読込される（fix750/fix756 の materialize → reload）。その前に触らせると操作が再読込で消えるので、
         印だけ付けてオーバーレイは保つ。再読込が来なければ 3 秒後にこの document で解除する。 */
      if (!prep.matAt) { prep.matAt = Date.now(); writeMat(); }
      if (Date.now() - prep.matAt > 3000) return release(s756.verdict + '_NO_RELOAD');
      return;
    }
    var ended = s756 && (s756.phase === 'done' || s756.phase === 'skipped' || s756.phase === 'timeout');
    if (ended && cn === false) return fail((s756.phase === 'done' ? s756.verdict : s756.phase) + ':' + (s756.code || ''));   /* 分類済みで canonical でない＋昇格の試みが終わった */
    if (Date.now() - prep.t0 > 60000) return fail('CLIENT_TIMEOUT');
  }
  /* 3. home: hold creation while the server answer is unknown */
  var isHome = /\/home(\.html)?$/.test(location.pathname);
  function holdMsg(t) {
    try { var id = 'v292Dbav2-hold'; var d = document.getElementById(id); if (!d) { d = document.createElement('div'); d.id = id;
        d.setAttribute('style', 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#222;color:#eee;padding:10px 14px;border-radius:8px;font-size:13px;z-index:99999;max-width:90%');
        (document.body || document.documentElement).appendChild(d); }
      d.textContent = 'アカウントの確認中です。少し待ってからもう一度押してください。'; clearTimeout(d.__t); d.__t = setTimeout(function () { try { d.parentNode.removeChild(d); } catch (e) {} }, 3000); } catch (e) {}
  }
  if (isHome) {
    document.addEventListener('click', function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest('#newBtn, #scBtn') : null; if (!t) return;
      var F = window.__v292Dfix893; if (!F || !F.active) return;            /* not the account (Pages) mode → unchanged */
      if (applyFlag() === null) { st.held++; ev.preventDefault(); ev.stopImmediatePropagation(); holdMsg(); try { F.refreshMe && F.refreshMe(); } catch (e) {} }
    }, true);
  }
  var n = 0;
  (function tick() { n++; try { applyFlag(); } catch (e) {} try { prepTick(); } catch (e) {} if (n < 300 || (prep.on && n < 3000)) setTimeout(tick, n < 100 ? 100 : (prep.on ? 250 : 1000)); })();
  try { window.addEventListener('chr:account-me', function () { try { applyFlag(); } catch (e) {} }); } catch (e) {}
  /* creation hook (home newStory / fix819 instantiate): stamp the schema-2 sidecar into the body BEFORE it is first written,
     only when the server said true (never on the provisional mark). Returns the same object. */
  function stampNew(body, id) {
    try { if (mode() !== true || !body || typeof body !== 'object' || !id) return body;
      if (!body.cast || typeof body.cast !== 'object' || Array.isArray(body.cast)) body.cast = {};
      if (!body.cast.av2) { body.cast.av2 = { assetSchema: 2, sid: String(id), bindings: {}, known: {}, retired: [] }; st.stamped = (st.stamped || 0) + 1; }
    } catch (e) {}
    return body;
  }
  window.__v292Dbav2 = { stampNew: stampNew, preparing: function () { return prep.on && !prep.done; }, prep: function () { return JSON.parse(JSON.stringify(prep)); }, status: function () { return { mode: mode(), flag: g('v292Dav2On'), mine: g('v292DbAv2'), flagSet: st.flagSet, flagCleared: st.flagCleared, held: st.held, stamped: st.stamped || 0 }; } };
})();
