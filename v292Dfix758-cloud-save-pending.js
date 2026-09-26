/* v292Dfix758 — cloud-save-pending banner (UI only)
 * 背景: UNSYNCED_LOCAL_PROGRESS_OVERWRITE(local に未保存の進行があるまま canonical server 保存の
 *       成功確認が取れていない状態)の即時緩和。GPT裁定50で GO 済み。
 * 本モジュールは「表示のみ」。localStorage への書込 0 / 通信 0 / 保存経路・retry への介入 0。
 * fix697 の read-only 観測口 (__v292Dfix697.status()/.ledger()) を 5 秒 poll で読むだけ。
 * kill switch: localStorage.setItem('v292Dfix758Off','1') → 次回読込で無効。
 *
 * ★sp24 / H-1 SAVE_FAILURE_VISIBILITY（GPT裁定 PKT-20260926-RRDY-01 §1、RCA rca_H1.md §2/§5 挿入点 B）:
 *   ・isFailKind を拡張: HTTP_401/403 / C_HTTP_401/403 / C_GETSTORY_HTTP_* / C2_GETSTORY_HTTP_* /
 *     NET_FAIL / C_GETSTORY_FAIL / CANONICAL_WRITE_UNSETTLED を「保存失敗/未確認」として数える
 *     （旧: C2_GETSTORY_FAIL / AUTHORITY_PENDING / CANONICAL_AUTHORITY_UNCONFIRMED / C2_GETSTORY_HTTP_* のみ）。
 *   ・直近の失敗 kind が 401/403 のときは「クラウドに保存できていません。ログイン状態を確認してください。」
 *     （待機ではなく明示的な保存失敗）。それ以外の kind は従来の待機文言のまま。
 *   ・表示のみ / pointer-events:none / kill switch / 5 s poll は不変。rollback = live bytes へ戻す。
 */
(function () {
  'use strict';
  try {
    if (window.__v292Dfix758) return;

    var OFF = false;
    try { OFF = (localStorage.getItem('v292Dfix758Off') === '1'); } catch (e) { OFF = false; }
    if (OFF) return;

    var BANNER_ID = 'v292Dfix758Banner';
    var MSG = '☁ クラウド保存を待っています。同期完了まで再読み込みや別端末での続きを避けてください。';
    /* ★sp24/H-1: 401/403（認証・許可の失敗）は待っても直らないので、保存失敗として明示する */
    var MSG_AUTH = '⚠ クラウドに保存できていません。ログイン状態を確認してください。';
    var AUTH_KIND_RE = /^(?:C_|C2_)?(?:GETSTORY_)?HTTP_(401|403)$/;
    var CSS = 'position:fixed; left:50%; transform:translateX(-50%); bottom:64px; z-index:99998;'
      + ' background:rgba(180,120,20,.95); color:#fff; padding:8px 14px; border-radius:8px;'
      + ' font-size:13px; max-width:90vw; pointer-events:none;';
    var STALE_MS = 30000;

    var lastMarks = null;   // 直近に観測した saveWrap.marks
    var lastMarkT = null;   // marks が増えた時刻
    var lastOkT = null;     // 直近の CANONICAL_COMMIT_OK の t
    var lastFailT = null;   // 直近の保存失敗/未確認系の t
    var lastFailKind = null; // ★sp24: 直近の失敗 kind（401/403 判定用）
    var visible = false;
    var polls = 0;

    function isFailKind(k) {
      return k === 'C2_GETSTORY_FAIL'
        || k === 'AUTHORITY_PENDING'
        || k === 'CANONICAL_AUTHORITY_UNCONFIRMED'
        || /^C2_GETSTORY_HTTP_/.test(k)
        /* ★sp24/H-1: shadow 経路 (HTTP_401/403, NET_FAIL) / canonical schema1 (C_HTTP_*, C_GETSTORY_*) /
           canonical 書込の未確定 (CANONICAL_WRITE_UNSETTLED) も保存失敗として数える */
        || /^(?:C_)?HTTP_(401|403)$/.test(k)
        || /^C_GETSTORY_HTTP_/.test(k)
        || k === 'NET_FAIL'
        || k === 'C_GETSTORY_FAIL'
        || k === 'CANONICAL_WRITE_UNSETTLED';
    }
    function isAuthKind(k) { return AUTH_KIND_RE.test(String(k || '')); }

    function findBanner() {
      try { return document.getElementById(BANNER_ID) || null; } catch (e) { return null; }
    }

    function ensureBanner() {
      var el = findBanner();
      if (el) return el;
      if (!document.body) return null;
      el = document.createElement('div');
      el.id = BANNER_ID;
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('role', 'status');
      el.style.cssText = CSS;
      el.textContent = MSG;
      el.style.display = 'none';
      document.body.appendChild(el);
      return el;
    }

    function hide() {
      var el = findBanner();          // 非表示のためだけに生成はしない
      if (el) el.style.display = 'none';
      visible = false;
    }

    function show(authFail) {
      var el = ensureBanner();
      if (!el) return;
      /* ★sp24/H-1: 401/403 が直近の失敗なら保存失敗文言、それ以外は従来の待機文言 */
      var msg = authFail ? MSG_AUTH : MSG;
      if (el.textContent !== msg) el.textContent = msg;
      el.style.display = 'block';
      visible = true;
    }

    function tick(nowMs) {
      polls++;
      var now = (typeof nowMs === 'number') ? nowMs : Date.now();
      try {
        var api = window.__v292Dfix697;
        if (!api || typeof api.status !== 'function') { hide(); return; }

        var st = null;
        try { st = api.status(); } catch (e) { st = null; }
        if (!st || !st.on || !st.loggedIn) { hide(); return; }

        var marks = (st.saveWrap && typeof st.saveWrap.marks === 'number') ? st.saveWrap.marks : null;
        if (marks != null) {
          if (lastMarks == null) lastMarks = marks;
          else if (marks > lastMarks) { lastMarks = marks; lastMarkT = now; }
        }

        var led = null;
        try { led = (typeof api.ledger === 'function') ? api.ledger() : null; } catch (e) { led = null; }
        if (led && led.length) {
          for (var i = 0; i < led.length; i++) {
            var ev = led[i];
            if (!ev || typeof ev.t !== 'number' || typeof ev.kind !== 'string') continue;
            if (ev.kind === 'CANONICAL_COMMIT_OK') {
              if (lastOkT == null || ev.t > lastOkT) lastOkT = ev.t;
            } else if (isFailKind(ev.kind)) {
              if (lastFailT == null || ev.t > lastFailT) { lastFailT = ev.t; lastFailKind = ev.kind; }
            }
          }
        }

        var pendingByMark = (lastMarkT != null)
          && (lastOkT == null || lastOkT < lastMarkT)
          && ((now - lastMarkT) > STALE_MS);
        var pendingByFail = (lastFailT != null)
          && (lastOkT == null || lastOkT < lastFailT);

        if (pendingByMark || pendingByFail) show(pendingByFail && isAuthKind(lastFailKind)); else hide();
      } catch (e) {
        try { hide(); } catch (e2) {}
      }
    }

    window.__v292Dfix758 = {
      status: function () {
        return {
          on: true,
          off: OFF,
          visible: visible,
          lastMarkT: lastMarkT,
          lastOkT: lastOkT,
          lastFailT: lastFailT,
          lastFailKind: lastFailKind,
          polls: polls
        };
      },
      _tick: function (nowMs) { tick(nowMs); }
    };

    setTimeout(function () { tick(); }, 3000);
    setInterval(function () { tick(); }, 5000);

    console.log('[v292Dfix758:cloud-save-pending] loaded (UI only / default ON / kill=v292Dfix758Off=1)');
  } catch (e) { /* 表示専用モジュール: 例外でゲームを壊さない */ }
})();
