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
 *
 * ★fix758b（GPT #127-CO・BUNDLE24・S-5 P1「待機バナーの残留」）kill: v292Dfix758bOff='1'
 *   ・「保存済み」と数える kind を広げる: CANONICAL_COMMIT_OK に加えて
 *     CANONICAL_COMMIT_CONFIRMED_BY_READBACK（応答を失ったが readback で着地を確認）／
 *     CANONICAL_CONVERGED_AFTER_CONFLICT（409 だが server は自分の内容）／CANONICAL_CONVERGED_NO_WRITE（server == local）／
 *     F910_NO_LOCAL_PROGRESS（送るべき変更が無い）。どれも「この端末に未保存の進行は無い」事実。
 *   ・marker が DIVERGED／BOOTSTRAP_HOLD で、差分バナー（v781banner）が出ている間は待機バナーを出さない
 *     （待っても保存されない状態なので、差分バナーの 2 択に一本化する）。
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
    var B_OFF = false;
    try { B_OFF = (localStorage.getItem('v292Dfix758bOff') === '1'); } catch (e) { B_OFF = false; }
    function isOkKind(k) {
      if (k === 'CANONICAL_COMMIT_OK') return true;
      if (B_OFF) return false;
      return k === 'CANONICAL_COMMIT_CONFIRMED_BY_READBACK' || k === 'CANONICAL_CONVERGED_AFTER_CONFLICT'
        || k === 'CANONICAL_CONVERGED_NO_WRITE' || k === 'F910_NO_LOCAL_PROGRESS';
    }
    function divergedBannerShown() {
      if (B_OFF) return false;
      try {
        var G = window.__v292Dfix781; var st = (G && typeof G.state === 'function') ? G.state() : null;
        if (st !== 'DIVERGED' && st !== 'BOOTSTRAP_HOLD') return false;
        var b = document.getElementById('v781banner');
        return !!(b && b.isConnected && b.style.display !== 'none');
      } catch (e) { return false; }
    }

    /* ★fix758c（BASEFIX r2・GPT #127-LE A2「安全に送れない HOLD を見えるようにする」）kill: v292Dfix758cOff='1'
     *   既存の待機バナー（この要素）を再利用して、保存状態を 3 つに分けて見せる。表示だけ:
     *   通信 0・localStorage 書込 0・journal / marker に触らない・保存済み扱いにしない・自動送信を足さない。
     *   CONFIRMED_SAVED  … 端末の正本（V2 hash）＝ 最後に server で確認した正本。警告なし。
     *   UNCONFIRMED      … 送った書込みの着地を証明できないまま止まっている（HOLD_PARITY、ARMED_CAS で着地しなかったと証明されていない HOLD）。
     *   LOCAL_AHEAD_HELD … 端末が先に進んでいるが、安全条件で自動送信していない（PREPARED_LOCAL / HOLD_CONFLICT の HOLD、未着地と証明済みの ARMED_CAS）。
     *   優先順位: 差分バナー（DIVERGED / BOOTSTRAP_HOLD）・「このままローカル」通知（v927keep）・既存の待機 / 認証失敗の表示 が先。ここでは上書きしない。
     *   出すのは「journal が残ったまま、送信中でも予約中でも再開待ちでもない状態が 10 s 続いた」時だけ（照合・再開の途中の一瞬は出さない）。
     *   読むのは今の document の物語の journal / marker だけ（他の物語・口座の情報は出さない）。 */
    var C_OFF = false;
    try { C_OFF = (localStorage.getItem('v292Dfix758cOff') === '1'); } catch (e) { C_OFF = false; }
    var MSG_UNCONF = '⚠ クラウドに保存できたか確認できていません（確認が必要です）。この端末の内容は残っています。';
    var MSG_AHEAD = '⚠ この端末に、クラウドへまだ同期していない変更があります（安全のため自動では送っていません）。';
    var HELD_MS = 10000;
    var saveState = 'NONE', saveWhy = null, heldKey = null, heldSince = null, hashBusy = false, heldShown = false, heldStory = null;
    var NOT_LANDED_RE = /^(LOCAL_MOVED_SINCE_PREPARE|RESUME_NOT_READY_HOLD|BARRIER_TIMEOUT_HOLD|RESUME_HELD_AUTHORITY|RESUME_HELD_ROUTE|RESUME_BUDGET_EXHAUSTED|RESUME_ABORTED_STORY_CHANGED)$/;
    function keepLocalShown() {
      try { var b = document.getElementById('v927keep'); return !!(b && b.isConnected && b.style.display !== 'none' && b.getBoundingClientRect().height > 0); } catch (e) { return false; }
    }
    function setState(s, why) { saveState = s; saveWhy = why || null; }
    /* 既存の read-only 照会だけで「送れずに止まっている journal」を探す。 */
    function heldCandidate(api) {
      var j = null; try { j = (typeof api.journal === 'function') ? api.journal() : null; } catch (e) { return null; }
      if (!j) return null;
      var st = null; try { st = api.status(); } catch (e) { return null; }
      if (!st || st.inFlight) return null;
      var f9 = null; try { f9 = (typeof api.f909 === 'function') ? api.f909() : null; } catch (e) { f9 = null; }
      if (f9 && (f9.pushTimer || f9.inFlight)) return null;
      var js = null; try { js = (typeof api.journalStats === 'function') ? api.journalStats() : null; } catch (e) { js = null; }
      if (!js || js.waiting) return null;
      var f14 = null; try { f14 = (typeof api.f914 === 'function') ? api.f914() : null; } catch (e) { f14 = null; }
      if (f14 && f14.armed) return null;
      var age = 0; try { age = performance.now(); } catch (e) { age = 99999; }
      if (js.reconciled !== true && age < 35000) return null;           /* boot の再試行（最大 30 s）の間は待つ */
      var G = window.__v292Dfix781; var m = null; try { m = (G && typeof G.marker === 'function') ? G.marker() : null; } catch (e) { m = null; }
      if (!m) return null;
      if (m.state === 'DIVERGED' || m.state === 'BOOTSTRAP_HOLD' || m.inFlightSave) return null;
      var last = js.last || null;
      var why = (last && (last.reason || last.verdict)) || j.lastVerdict || null;
      return { j: j, m: m, why: why ? String(why) : null };
    }
    function classifyHeld(c, localHash) {
      var lc = c.m.lastConfirmed;
      if (c.m.state === 'CLEAN') return { s: 'CONFIRMED_SAVED', why: 'MARKER_CLEAN' };
      if (lc && lc.fingerprint != null && localHash && String(localHash) === String(lc.fingerprint)) return { s: 'CONFIRMED_SAVED', why: 'LOCAL_EQUALS_LAST_CONFIRMED' };
      var js = String(c.j.state || ''), w = String(c.why || '');
      var unproven = js === 'HOLD_PARITY' || (js === 'ARMED_CAS' && !NOT_LANDED_RE.test(w));
      return { s: unproven ? 'UNCONFIRMED' : 'LOCAL_AHEAD_HELD', why: js + ':' + w };
    }
    /* r2b（GPT #127-LK 見やすさ）: A2 の表示だけ、入力欄（#composer）の上に置き、少し濃い地・14px にする（コントラスト約 6:1）。
       既存の待機・認証失敗の表示に戻る時は元の見た目（CSS）に戻す。 */
    var HELD_BG = 'rgba(120,72,0,.96)';
    /* r2c（統括 #127-LK 判断 1）: 狭い画面（幅 720px 以下）でだけ、A2 の表示を左右 12px の余白まで広げる（390px で 2〜3 行）。
       PC（721px 以上）は r2b と同じ（幅は元の CSS のまま）。既存の待機・認証失敗の表示は restoreBaseStyle で元の CSS に戻る。 */
    var NARROW_MAX = 720, SIDE_GAP = 12;
    function fitNarrow(el) {
      try { var w = window.innerWidth || 0;
            if (w > 0 && w <= NARROW_MAX) { el.style.boxSizing = 'border-box'; el.style.maxWidth = 'none'; el.style.width = (w - SIDE_GAP * 2) + 'px'; }
            else { el.style.boxSizing = ''; el.style.width = ''; el.style.maxWidth = '90vw'; } } catch (e) {}
    }
    function placeAboveComposer(el) {
      fitNarrow(el);
      try { var cp = document.getElementById('composer'); var r = cp ? cp.getBoundingClientRect() : null;
            if (r && r.height > 0 && r.top > 0) { el.style.bottom = Math.max(8, Math.round(window.innerHeight - r.top + 8)) + 'px'; return; } } catch (e) {}
      el.style.bottom = '64px';
    }
    function restoreBaseStyle() { try { var el = findBanner(); if (el && el.getAttribute('data-v758c') === '1') { var d = el.style.display; el.style.cssText = CSS; el.style.display = d; el.removeAttribute('data-v758c'); } } catch (e) {} }
    /* r2d（統括・UI45 の指摘）: 入力の部分（#composer）の大きさが変わったら、A2 の表示をすぐ置き直す（5 s ごとの置き直しは残す）。
       window と visualViewport の resize でも置き直す。ResizeObserver が無い環境では何も足さない（r2c と同じ動き）。
       置き直すのは A2 の表示（data-v758c）が出ている間だけ。位置・幅・色の決まりは placeAboveComposer のまま。保存の判断には触らない。 */
    var roObs = null, roEl = null, roWin = false;
    function replaceHeldNow() { try { var el = findBanner(); if (el && el.getAttribute('data-v758c') === '1' && el.style.display !== 'none') placeAboveComposer(el); } catch (e) {} }
    function armReplace() {
      try {
        if (typeof window.ResizeObserver !== 'function') return;
        var cp = document.getElementById('composer');
        if (cp && cp !== roEl) { if (!roObs) roObs = new window.ResizeObserver(function () { replaceHeldNow(); }); if (roEl) { try { roObs.unobserve(roEl); } catch (e1) {} } roObs.observe(cp); roEl = cp; }
        if (!roWin) { roWin = true; window.addEventListener('resize', replaceHeldNow); try { if (window.visualViewport && typeof window.visualViewport.addEventListener === 'function') window.visualViewport.addEventListener('resize', replaceHeldNow); } catch (e2) {} }
      } catch (e) {}
    }
    function showText(msg) {
      var el = ensureBanner();
      if (!el) return;
      if (el.textContent !== msg) el.textContent = msg;
      el.setAttribute('data-v758c', '1'); el.style.background = HELD_BG; el.style.fontSize = '14px'; placeAboveComposer(el); armReplace();
      el.style.display = 'block';
      visible = true;
    }
    /* true = この tick の表示はここで決めた（呼び元は隠さない） */
    function heldTick(api) {
      var c = heldCandidate(api);
      if (!c) { heldKey = null; heldSince = null; return false; }
      if (hashBusy) return true;
      if (typeof api.contentHashV2 !== 'function') return false;
      hashBusy = true;
      var gen0 = c.m.localGeneration;
      try {
        api.contentHashV2(String(c.j.storyId), function (h) {
          hashBusy = false;
          try {
            var r = classifyHeld(c, h || null);
            if (r.s === 'CONFIRMED_SAVED') { heldKey = null; heldSince = null; setState('CONFIRMED_SAVED', r.why); if (heldShown) { heldShown = false; hide(); } return; }
            var key = r.s + '|' + r.why + '|' + gen0;
            if (heldKey !== key) { heldKey = key; heldSince = Date.now(); }
            if (Date.now() - heldSince < HELD_MS) return;
            if (divergedBannerShown() || keepLocalShown()) { if (heldShown) { heldShown = false; hide(); } return; }
            setState(r.s, r.why); heldShown = true; heldStory = String(c.j.storyId);
            showText(r.s === 'UNCONFIRMED' ? MSG_UNCONF : MSG_AHEAD);
          } catch (e2) {}
        });
      } catch (e) { hashBusy = false; return false; }
      return true;
    }

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
            if (isOkKind(ev.kind)) {
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

        if (divergedBannerShown()) { if (!C_OFF) setState('DIVERGED_NOTICE'); heldShown = false; hide(); return; }   /* ★fix758b */
        if (pendingByMark || pendingByFail) { if (!C_OFF) { setState('UNCONFIRMED', pendingByFail ? ('FAIL:' + lastFailKind) : 'ACK_PENDING'); restoreBaseStyle(); } heldShown = false; show(pendingByFail && isAuthKind(lastFailKind)); return; }
        /* ★fix758c: 既存の表示が何も無い時だけ、送れずに止まっている journal を見る */
        if (!C_OFF) {
          if (keepLocalShown()) { setState('KEEP_LOCAL_NOTICE'); heldShown = false; hide(); return; }
          if (heldTick(api)) return;
          /* ★fix758c（r2b・GPT #127-LK）: 一度出した表示は「保存の確認（marker CLEAN）」か「権威ある一致（端末の正本の V2 hash ＝ この物語で
             最後に server が確認した正本）」でだけ消す。次の保存が予約された・送信中になった・journal が書き換わっただけでは消さない。 */
          if (heldShown) {
            var G8 = window.__v292Dfix781; var m8 = null; try { m8 = (G8 && typeof G8.marker === 'function') ? G8.marker() : null; } catch (e8) { m8 = null; }
            if (m8 && m8.state === 'CLEAN') { setState('CONFIRMED_SAVED', 'MARKER_CLEAN'); heldShown = false; hide(); return; }
            if (!hashBusy && m8 && m8.lastConfirmed && m8.lastConfirmed.fingerprint != null && heldStory && typeof api.contentHashV2 === 'function') {
              hashBusy = true; var fp8 = String(m8.lastConfirmed.fingerprint);
              try { api.contentHashV2(heldStory, function (h8) { hashBusy = false; try { if (h8 && String(h8) === fp8 && heldShown) { setState('CONFIRMED_SAVED', 'LOCAL_EQUALS_LAST_CONFIRMED'); heldShown = false; hide(); } } catch (e9) {} }); } catch (e10) { hashBusy = false; }
            }
            try { var el8 = findBanner(); if (el8 && el8.style.display !== 'none') placeAboveComposer(el8); } catch (e11) {}
            return;   /* 表示と saveState はそのまま */
          }
          try { var G7 = window.__v292Dfix781; var m7 = (G7 && typeof G7.marker === 'function') ? G7.marker() : null;
                setState(m7 && m7.state === 'CLEAN' ? 'CONFIRMED_SAVED' : 'NONE', m7 ? String(m7.state) : null); } catch (e7) { setState('NONE'); }
          heldShown = false;
        }
        hide();
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
          polls: polls,
          saveState: C_OFF ? 'OFF' : saveState,   /* ★fix758c read-only: CONFIRMED_SAVED / UNCONFIRMED / LOCAL_AHEAD_HELD / NONE / DIVERGED_NOTICE / KEEP_LOCAL_NOTICE */
          saveWhy: saveWhy,
          heldShown: heldShown,
          text: (function () { try { var el = findBanner(); return el && el.style.display !== 'none' ? String(el.textContent || '') : null; } catch (e) { return null; } })()
        };
      },
      _tick: function (nowMs) { tick(nowMs); }
    };

    setTimeout(function () { tick(); }, 3000);
    setInterval(function () { tick(); }, 5000);

    console.log('[v292Dfix758:cloud-save-pending] loaded (UI only / default ON / kill=v292Dfix758Off=1)');
  } catch (e) { /* 表示専用モジュール: 例外でゲームを壊さない */ }
})();
