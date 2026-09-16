/* v292Dfix860-story-unlock-ui.js — STORY_PASSCODE client: unlock dialog + passcode 管理 UI
 * =====================================================================
 * ②C1 裁定 2026-09-16 / FIX860_UNLOCK_UI = IMPLEMENTATION_GO
 *
 * 契約（裁定）:
 *  ・token 管理は **fix859 supplier だけ**。ここでは sessionStorage を直接触らない。
 *  ・request は fix697 の storyPassRequest（＝既存 postSaveOnce）を共有。新 fetch 0 / 新 auth 0。
 *  ・locked flow: getstory -> 409 STORY_LOCKED -> dialog -> storyunlock 200 -> token 保存
 *                 -> getstory **exactly once**(= fix705.classify 1 回) -> 200 -> HOLD release 1 回
 *                 -> materialize 1 回。generic retry 0 / duplicate dialog 0 / duplicate materialize 0。
 *  ・wrong passcode: materialize しない / HOLD 解除しない / 入力欄を残してエラー表示。
 *  ・429: retryAfterMs を **表示にだけ** 使う（server authority を置き換えない）。
 *  ・passcode / token を console・log・error 表示へ出さない。入力値を永続保存しない。
 *  ・404 等を STORY_LOCKED として扱わない。
 *
 * kill switch: v292Dfix860Off='1'
 * ===================================================================== */
(function () {
  'use strict';
  var TAG = '[fix860]';
  var DLG_ID = 'chr6-storypass-dialog';
  var STY_ID = 'chr6-storypass-style';

  function off() { try { return localStorage.getItem('v292Dfix860Off') === '1'; } catch (e) { return false; } }
  function sup() { return (typeof window.__chronicleStorySessionSet === 'function') ? window : null; }
  function port() { var W = window.__v292Dfix697; return (W && typeof W.storyPassRequest === 'function') ? W : null; }
  function gate() { var F = window.__v292Dfix705; return (F && typeof F.classify === 'function') ? F : null; }

  var stats = { dialogsOpened: 0, unlockOk: 0, unlockFail: 0, lockedOut: 0,
                reclassify: 0, reloads: 0, reloadSuppressed: 0, stuckShown: 0, tokensStored: 0, tokensDropped: 0,
                setOk: 0, changeOk: 0, clearOk: 0, mismatchBlocked: 0, autoUnlockFail: 0 };
  var openFor = null;            /* ★duplicate dialog 0 のための単一性ガード */
  var reclassifiedFor = {};      /* ★sid ごとに再分類は 1 回だけ */
  var countdownTimer = null;

  /* ---------- 通信（token は supplier が authHeaders 経由で載せる） ---------- */
  function call(payload, cb) {
    var W = port();
    if (!W) { cb(null, 'NO_PORT'); return; }
    W.storyPassRequest(payload, function (r, err) { cb(r, err); });
  }

  /* ---------- server 応答の解釈 ---------- */
  function jsonOf(r) { return (r && r.j) || {}; }
  /* ★errorCode を厳密に見る。404 / not-found を STORY_LOCKED として扱わない。 */
  function isLocked(r) { return !!(r && r.status === 409 && jsonOf(r).errorCode === 'STORY_LOCKED'); }
  function isLockedOut(r) { return !!(r && r.status === 429 && jsonOf(r).errorCode === 'STORY_PASSCODE_LOCKED_OUT'); }
  function isBadPass(r) { return !!(r && r.status === 403 && jsonOf(r).errorCode === 'STORY_PASSCODE_INVALID'); }

  /* server が token を否認した理由なら、その sid の token **だけ** 捨てる */
  function dropIfIndicted(sid, r) {
    var reason = jsonOf(r).reason;
    if (!reason) return false;
    if (typeof window.__chronicleStorySessionReject !== 'function') return false;
    var dropped = window.__chronicleStorySessionReject(sid, reason);
    if (dropped) stats.tokensDropped++;
    return dropped;
  }

  /* ---------- markup ---------- */
  function ensureStyle() {
    if (document.getElementById(STY_ID)) return;
    var st = document.createElement('style');
    st.id = STY_ID;
    st.textContent =
      '#' + DLG_ID + '{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;' +
      'justify-content:center;background:rgba(0,0,0,.66);padding:16px;box-sizing:border-box;}' +
      '#' + DLG_ID + ' .sp-card{background:#1b1b20;color:#f2f2f4;border:1px solid #3a3a44;border-radius:12px;' +
      'width:100%;max-width:420px;padding:20px;box-sizing:border-box;font-size:15px;line-height:1.6;' +
      'max-height:calc(100vh - 32px);overflow:auto;-webkit-overflow-scrolling:touch;}' +
      '#' + DLG_ID + ' h2{margin:0 0 10px;font-size:17px;line-height:1.4;}' +
      '#' + DLG_ID + ' p{margin:0 0 12px;font-size:13.5px;color:#c8c8d0;}' +
      '#' + DLG_ID + ' .sp-warn{color:#ffcf7a;background:#2a2318;border:1px solid #574524;' +
      'border-radius:8px;padding:10px 12px;font-size:13px;margin:0 0 12px;}' +
      '#' + DLG_ID + ' .sp-err{color:#ff9d9d;font-size:13px;margin:0 0 10px;min-height:1.2em;}' +
      '#' + DLG_ID + ' input{width:100%;box-sizing:border-box;font-size:16px;padding:11px 12px;' +   /* 16px = iOS のズーム回避 */
      'border-radius:8px;border:1px solid #4a4a56;background:#111114;color:#fff;margin:0 0 10px;}' +
      '#' + DLG_ID + ' .sp-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;}' +
      '#' + DLG_ID + ' button{flex:1 1 auto;min-width:120px;min-height:44px;font-size:15px;' +        /* 44px = tap target */
      'border-radius:8px;border:1px solid #4a4a56;background:#2c2c34;color:#f2f2f4;cursor:pointer;padding:0 14px;}' +
      '#' + DLG_ID + ' button.sp-primary{background:#3d6bd6;border-color:#3d6bd6;color:#fff;}' +
      '#' + DLG_ID + ' button[disabled]{opacity:.5;cursor:default;}' +
      '@media (max-width:360px){#' + DLG_ID + ' .sp-card{padding:16px;}' +
      '#' + DLG_ID + ' button{min-width:100%;}}';
    (document.head || document.documentElement).appendChild(st);
  }
  function closeDialog() {
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    var d = document.getElementById(DLG_ID);
    if (d && d.parentNode) d.parentNode.removeChild(d);
    openFor = null;
  }
  function buildDialog(html) {
    ensureStyle();
    closeDialog();
    var wrap = document.createElement('div');
    wrap.id = DLG_ID;
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.innerHTML = '<div class="sp-card">' + html + '</div>';
    document.body.appendChild(wrap);
    return wrap;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

  /* ---------- 429 のカウントダウン（表示だけ。server authority は置き換えない） ---------- */
  function startCountdown(el, btn, ms) {
    if (countdownTimer) clearInterval(countdownTimer);
    var until = Date.now() + Math.max(0, +ms || 0);
    function tick() {
      var left = until - Date.now();
      if (left <= 0) {
        clearInterval(countdownTimer); countdownTimer = null;
        el.textContent = 'もう一度お試しいただけます。';
        if (btn) btn.disabled = false;
        return;
      }
      var s = Math.ceil(left / 1000), m = Math.floor(s / 60);
      el.textContent = '試行回数が多すぎます。あと ' + (m > 0 ? (m + ' 分 ' + (s % 60) + ' 秒') : (s + ' 秒')) + ' お待ちください。';
    }
    if (btn) btn.disabled = true;
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  // =====================================================================
  // (A) UNLOCK DIALOG — locked story を開いたとき
  // =====================================================================
  function openUnlock(sid, opts) {
    if (off() || !sid) return false;
    if (openFor === sid) return false;                 /* ★duplicate dialog 0 */
    var title = (opts && opts.title) || 'この物語はパスコードで保護されています';
    /* ★acceptance U-02 で発見した欠陥の修正: buildDialog() は内部で closeDialog() を呼び、
       closeDialog() が openFor を null に戻す。そのため openFor を **build より前**に立てると
       単一性ガードが即座に壊れ、409 が続くたびに dialog を開き直していた（dialogsOpened=3）。
       → build が終わってからガードを立てる。 */
    var wrap = buildDialog(
      '<h2>' + esc(title) + '</h2>' +
      '<p>続けるにはこの物語のパスコードを入力してください。</p>' +
      '<div class="sp-err" id="sp-err"></div>' +
      '<input id="sp-pass" type="password" autocomplete="off" autocapitalize="off" ' +
      'autocorrect="off" spellcheck="false" inputmode="text" placeholder="パスコード">' +
      '<div class="sp-row">' +
      '<button class="sp-primary" id="sp-go">開く</button>' +
      '<button id="sp-back">戻る</button>' +
      '</div>');
    openFor = sid;                                     /* ★build 後に立てる（上のコメント参照） */
    stats.dialogsOpened++;
    var inp = wrap.querySelector('#sp-pass'), err = wrap.querySelector('#sp-err');
    var go = wrap.querySelector('#sp-go'), back = wrap.querySelector('#sp-back');
    try { inp.focus(); } catch (e) {}

    back.onclick = function () {
      closeDialog();
      if (opts && typeof opts.onCancel === 'function') { try { opts.onCancel(); } catch (e) {} }
      else { try { location.href = 'home.html'; } catch (e) {} }
    };
    function submit() {
      var pass = inp.value || '';
      if (!pass) { err.textContent = 'パスコードを入力してください。'; return; }
      go.disabled = true; err.textContent = '確認しています…';
      /* ★入力値はここから先へ渡すだけ。保存も log も echo もしない。 */
      call({ op: 'storyunlock', id: sid, pass: pass }, function (r, e2) {
        go.disabled = false;
        inp.value = '';                                  /* ★入力を残さない（画面の欄は維持） */
        if (e2 || !r) { err.textContent = '通信できませんでした。少し待ってからもう一度お試しください。'; return; }
        if (isLockedOut(r)) {
          stats.lockedOut++;
          startCountdown(err, go, jsonOf(r).retryAfterMs);
          return;
        }
        if (isBadPass(r)) {
          stats.unlockFail++;
          /* ★materialize しない・HOLD を解除しない・入力欄は残す */
          err.textContent = 'パスコードが違います。';
          try { inp.focus(); } catch (e) {}
          return;
        }
        if (r.status !== 200 || !jsonOf(r).ok || !jsonOf(r).storySession) {
          err.textContent = 'この物語を開けませんでした。' ;
          return;
        }
        stats.unlockOk++;
        var stored = false;
        try { stored = window.__chronicleStorySessionSet(sid, jsonOf(r).storySession) === true; } catch (e) {}
        if (!stored) { err.textContent = 'この端末でパスコードの状態を保存できませんでした。'; return; }
        stats.tokensStored++;
        /* ★ここで reload マークを消してはいけない。unlock 成功 → reload → まだ locked →
           unlock 成功 → reload … という**ループそのもの**を許してしまう。
           マークは「gate が実際に解決したページ」でだけ消す（下の clearMarkIfResolved）。 */
        closeDialog();
        if (opts && typeof opts.onUnlocked === 'function') { try { opts.onUnlocked(sid); } catch (e) {} }
        else reclassifyOnce(sid);
      });
    }
    go.onclick = submit;
    inp.onkeydown = function (ev) { if (ev && (ev.key === 'Enter' || ev.keyCode === 13)) { ev.preventDefault(); submit(); } };
    return true;
  }

  /* ★getstory を exactly once だけやり直す。
     ★★fix862（live E2E で発見・修正）: fix705 の classify() は
     `if (classifyStarted) return cb({skipped:'ALREADY_RAN'})` で **document あたり 1 回**しか
     走らない。unlock 後にそのまま呼んでも何も起きず、★**正しい passcode を入れたのに
     物語が読み込まれず WRITE HOLD も張られたまま**になる（live で実測）。
     → classify() を 1 回試し、`ALREADY_RAN`（= 既に判定済み）なら **このページを 1 回だけ
     reload する**。token は sessionStorage にあるので、reload 後は通常経路がそのまま
     getstory 1 回 → HOLD 解除 1 回 → materialize 1 回 を行う（live で実測確認済み）。
     ★reload ループ防止: sid ごとに 1 回だけ。2 回目は reload せずエラー表示に戻す。 */
  var RELOAD_FLAG = 'chr6_sp_reloaded_';
  function reloadedAlready(sid) {
    try { return sessionStorage.getItem(RELOAD_FLAG + sid) === '1'; } catch (e) { return false; }
  }
  function markReloaded(sid) {
    try { sessionStorage.setItem(RELOAD_FLAG + sid, '1'); } catch (e) {}
  }
  function clearReloadMark(sid) {
    try { sessionStorage.removeItem(RELOAD_FLAG + sid); } catch (e) {}
  }
  function reclassifyOnce(sid) {
    if (reclassifiedFor[sid]) return false;            /* ★duplicate materialization 0 */
    var F = gate();
    if (!F) return false;
    reclassifiedFor[sid] = true;
    stats.reclassify++;
    var res = null;
    try { F.classify(function (r) { res = r; }); } catch (e) { res = { skipped: 'THREW' }; }
    /* classify が実際に走ったならここで終わり（HOLD 解除も materialize も既存経路が行う） */
    if (!res || !res.skipped) return true;
    if (res.skipped !== 'ALREADY_RAN') return true;    /* restore-hold 等は既存経路に任せる */
    if (reloadedAlready(sid)) {                        /* ★2 回目は reload しない */
      stats.reloadSuppressed++;
      /* ★★acceptance U-27f で発見: ここで黙って戻ると、unlock は成功しているのに
         dialog は閉じ、物語も開かず、★**画面に何も無い**状態で放置される。
         裁定「failed reload 時は無限 reload せず、error / locked UI へ留まる」に従い、
         ★**説明つきの停止 UI** を出す（再読み込みは人の操作でだけ行う＝ループにしない）。 */
      openStuck(sid);
      return false;
    }
    markReloaded(sid);
    stats.reloads++;
    try { location.reload(); } catch (e) {}
    return true;
  }

  /* ★自動 reload を使い切った後の停止 UI。★ここから自動で reload はしない。 */
  function openStuck(sid) {
    if (off() || !sid) return false;
    stats.stuckShown++;
    var wrap = buildDialog(
      '<h2>この物語を開けませんでした</h2>' +
      '<p>パスコードは確認できましたが、この画面では本文を読み込めませんでした。' +
      'お手数ですが再読み込みするか、一覧へ戻ってからもう一度開いてください。</p>' +
      '<div class="sp-err" id="sp-err">自動での再試行は行いません。</div>' +
      '<div class="sp-row">' +
      '<button class="sp-primary" id="sp-reload">再読み込み</button>' +
      '<button id="sp-back">一覧へ戻る</button>' +
      '</div>');
    openFor = sid;
    wrap.querySelector('#sp-reload').onclick = function () {
      /* ★人が押したときだけ。押した時点で mark を外し、次の 1 回を許す（ループにはならない）。 */
      clearReloadMark(sid);
      try { location.reload(); } catch (e) {}
    };
    wrap.querySelector('#sp-back').onclick = function () {
      closeDialog();
      try { location.href = 'home.html'; } catch (e) {}
    };
    return true;
  }

  /* fix705 からの通知口（fix705 側は 1 行の try/catch で呼ぶだけ） */
  window.__chronicleStoryLockedHook = function (sid, info) {
    if (off()) return;
    /* ★token が否認されたのなら、その sid の token だけ捨ててから訊き直す */
    if (info && info.reason && typeof window.__chronicleStorySessionReject === 'function') {
      if (window.__chronicleStorySessionReject(sid, info.reason)) stats.tokensDropped++;
    }
    delete reclassifiedFor[sid];                        /* unlock 後の 1 回を許可する */
    openUnlock(sid, null);
  };

  // =====================================================================
  // (B) PASSCODE 管理 UI — current story の設定から呼ぶ
  // =====================================================================
  var FIRST_LOCK_NOTE =
    'この物語にパスコードを設定すると、古い方式でのデータ同期が使えなくなる場合があります。' +
    '物語を開いて遊ぶ・保存することには影響しません。';
  var NO_RECOVERY_WARN =
    '★パスコードを忘れると、この物語を開く方法はありません。復旧もできません。控えを安全な場所に保管してください。';

  function openSet(sid, onDone) {
    if (off() || !sid) return false;
    var wrap = buildDialog(
      '<h2>パスコードを設定</h2>' +
      '<p>この物語を開くときにパスコードを求めるようにします。</p>' +
      '<div class="sp-warn">' + esc(NO_RECOVERY_WARN) + '</div>' +
      '<div class="sp-warn">' + esc(FIRST_LOCK_NOTE) + '</div>' +
      '<div class="sp-err" id="sp-err"></div>' +
      '<input id="sp-p1" type="password" autocomplete="new-password" placeholder="新しいパスコード">' +
      '<input id="sp-p2" type="password" autocomplete="new-password" placeholder="もう一度入力">' +
      '<div class="sp-row"><button class="sp-primary" id="sp-go">設定する</button>' +
      '<button id="sp-cancel">やめる</button></div>');
    var p1 = wrap.querySelector('#sp-p1'), p2 = wrap.querySelector('#sp-p2');
    var err = wrap.querySelector('#sp-err'), go = wrap.querySelector('#sp-go');
    wrap.querySelector('#sp-cancel').onclick = function () { closeDialog(); };
    go.onclick = function () {
      var a = p1.value || '', b = p2.value || '';
      if (a.length < 4) { err.textContent = 'パスコードは 4 文字以上にしてください。'; return; }
      if (a !== b) {                                    /* ★不一致なら request を 1 本も出さない */
        stats.mismatchBlocked++;
        err.textContent = '2 つの入力が一致していません。';
        p2.value = ''; try { p2.focus(); } catch (e) {}
        return;
      }
      go.disabled = true; err.textContent = '設定しています…';
      call({ op: 'storypassset', id: sid, pass: a }, function (r, e2) {
        go.disabled = false;
        if (e2 || !r || r.status !== 200 || !jsonOf(r).ok) {
          err.textContent = 'パスコードを設定できませんでした。';
          return;
        }
        stats.setOk++;
        /* ★session continuity: 直ちに unlock して token を持つ。
           失敗したら fail-open しない — locked UI（unlock dialog）へ戻す。 */
        autoUnlock(sid, a, function (okUnlock) {
          p1.value = ''; p2.value = '';
          closeDialog();
          if (typeof onDone === 'function') { try { onDone(true, okUnlock); } catch (e) {} }
          if (!okUnlock) { stats.autoUnlockFail++; openUnlock(sid, null); }
        });
      });
    };
    return true;
  }

  function openChange(sid, onDone) {
    if (off() || !sid) return false;
    var wrap = buildDialog(
      '<h2>パスコードを変更</h2>' +
      '<div class="sp-warn">' + esc(NO_RECOVERY_WARN) + '</div>' +
      '<div class="sp-err" id="sp-err"></div>' +
      '<input id="sp-p1" type="password" autocomplete="new-password" placeholder="新しいパスコード">' +
      '<input id="sp-p2" type="password" autocomplete="new-password" placeholder="もう一度入力">' +
      '<div class="sp-row"><button class="sp-primary" id="sp-go">変更する</button>' +
      '<button id="sp-cancel">やめる</button></div>');
    var p1 = wrap.querySelector('#sp-p1'), p2 = wrap.querySelector('#sp-p2');
    var err = wrap.querySelector('#sp-err'), go = wrap.querySelector('#sp-go');
    wrap.querySelector('#sp-cancel').onclick = function () { closeDialog(); };
    go.onclick = function () {
      var a = p1.value || '', b = p2.value || '';
      if (a.length < 4) { err.textContent = 'パスコードは 4 文字以上にしてください。'; return; }
      if (a !== b) { stats.mismatchBlocked++; err.textContent = '2 つの入力が一致していません。';
                     p2.value = ''; return; }
      go.disabled = true; err.textContent = '変更しています…';
      call({ op: 'storypassset', id: sid, pass: a }, function (r, e2) {
        go.disabled = false;
        if (e2 || !r) { err.textContent = '通信できませんでした。'; return; }
        if (isLocked(r)) {
          /* 旧 token が失効している = もう一度 unlock が要る */
          dropIfIndicted(sid, r);
          closeDialog(); openUnlock(sid, null); return;
        }
        if (r.status !== 200 || !jsonOf(r).ok) { err.textContent = 'パスコードを変更できませんでした。'; return; }
        stats.changeOk++;
        /* ★server 側で旧 token は lockVersion が変わって失効している。
           client も **旧 token を使い続けない** — 新 passcode で即 unlock して置き換える。 */
        try { window.__chronicleStorySessionClear(sid); } catch (e) {}
        autoUnlock(sid, a, function (okUnlock) {
          p1.value = ''; p2.value = '';
          closeDialog();
          if (typeof onDone === 'function') { try { onDone(true, okUnlock); } catch (e) {} }
          if (!okUnlock) { stats.autoUnlockFail++; openUnlock(sid, null); }
        });
      });
    };
    return true;
  }

  function clearPass(sid, cb) {
    if (off() || !sid) { if (cb) cb(false); return false; }
    call({ op: 'storypassclear', id: sid }, function (r, e2) {
      if (e2 || !r) { if (cb) cb(false, 'NETWORK'); return; }
      if (isLocked(r)) { dropIfIndicted(sid, r); openUnlock(sid, null); if (cb) cb(false, 'RELOCK'); return; }
      if (r.status !== 200 || !jsonOf(r).ok) { if (cb) cb(false, 'SERVER'); return; }
      stats.clearOk++;
      try { window.__chronicleStorySessionClear(sid); } catch (e) {}   /* ★解除時は token 削除 */
      if (cb) cb(true);
    });
    return true;
  }

  /* 設定直後・変更直後の自動 unlock。★失敗しても fail-open しない（呼び手が locked UI へ戻す）。 */
  function autoUnlock(sid, pass, cb) {
    call({ op: 'storyunlock', id: sid, pass: pass }, function (r) {
      var okNow = false;
      if (r && r.status === 200 && jsonOf(r).ok && jsonOf(r).storySession) {
        try { okNow = window.__chronicleStorySessionSet(sid, jsonOf(r).storySession) === true; } catch (e) { okNow = false; }
        if (okNow) stats.tokensStored++;
      }
      cb(okNow);
    });
  }

  // =====================================================================
  // (C) HOME の lock badge — ★presentation のみ。ここで security を成立させない。
  //     locked story をクリックしたら通常どおり遷移し、server 409 → play 側 unlock で成立する。
  // =====================================================================
  /* ★★fix863（live で発見・修正）: HOME の実 DOM は `<div class="card" data-id="<storyId>">` で、
     `data-story-id` **ではない**（live 実測: data-id 139 件 / data-story-id 0 件）。
     jsdom の acceptance では私が作った合成 DOM に `data-story-id` を使っていたため気づけなかった。
     → 両方の属性を受け付ける。 */
  function findCard(root, id) {
    var safe = String(id).replace(/["\\]/g, '');
    return root.querySelector('[data-story-id="' + safe + '"]') ||
           root.querySelector('[data-id="' + safe + '"]');
  }
  function decorate(root, stories) {
    if (off() || !root || !stories || !stories.length) return 0;
    var n = 0;
    for (var i = 0; i < stories.length; i++) {
      var st = stories[i];
      if (!st || !st.locked || !st.id) continue;
      var el = findCard(root, st.id);
      if (!el || el.querySelector('.chr6-lock-badge')) continue;
      var b = document.createElement('span');
      b.className = 'chr6-lock-badge';
      b.setAttribute('title', 'パスコードで保護されています');
      b.setAttribute('aria-label', 'パスコードで保護されています');
      b.textContent = '🔒';
      b.style.cssText = 'margin-left:6px;font-size:13px;line-height:1;opacity:.9;';
      el.appendChild(b); n++;
    }
    return n;
  }

  /* ★HOME だけで動く自動配線。★security はここに一切依存しない（badge は presentation のみ）。
     locked story をクリックしても navigation を奪わず、play 側の 409 → unlock で成立する。 */
  var homeRows = null, homeObs = null, homeRuns = 0;
  function homeRoot() {
    return document.querySelector('.grid') || document.body;
  }
  function isHomePage() {
    /* fix705（play 側の read gate）が居ないページ = HOME。?story= も持たない。 */
    return !window.__v292Dfix705 && !!document.querySelector('[data-id],[data-story-id]');
  }
  function paint() {
    if (!homeRows || !homeRows.length) return 0;
    homeRuns++;
    return decorate(homeRoot(), homeRows);
  }
  function autoDecorateHome() {
    if (off() || homeObs) return false;
    if (!isHomePage()) return false;
    var W = port();
    if (!W || typeof W.storyLockList !== 'function') return false;
    W.storyLockList(function (rows) {
      if (!rows) return;
      homeRows = rows.filter(function (r) { return r.locked; });
      if (!homeRows.length) return;
      paint();
      /* grid は再描画されうるので、再描画のたびに塗り直す（idempotent） */
      try {
        homeObs = new MutationObserver(function () { paint(); });
        homeObs.observe(homeRoot(), { childList: true, subtree: true });
      } catch (e) {}
    });
    return true;
  }
  /* ★reload マークの解除は「この document で gate が実際に解決した」ときだけ。
     ＝ token が効いて普通に読み込めたページ。ここで消しておけば、同じ tab で
     もう一度 lock したときにも 1 回だけ reload できる。解決していないページでは消さない
     （＝ reload ループを構造的に作らない）。 */
  function clearMarkIfResolved() {
    try {
      var F = gate(); if (!F) return false;
      var st = F.status(); if (!st || !st.storyId) return false;
      if (st.state && st.state.resolved === true && !st.state.error) { clearReloadMark(st.storyId); return true; }
    } catch (e) {}
    return false;
  }
  function onReady() { setTimeout(function () { autoDecorateHome(); clearMarkIfResolved(); }, 900); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
  else onReady();

  window.__v292Dfix860 = {
    off: off,
    openUnlock: openUnlock, openSet: openSet, openChange: openChange,
    clearPass: clearPass, decorate: decorate, close: closeDialog, openStuck: openStuck,
    autoDecorateHome: autoDecorateHome, findCard: findCard,
    clearMarkIfResolved: clearMarkIfResolved,
    reloadMark: function (sid) { return reloadedAlready(sid); },
    homeInfo: function () { return { isHome: isHomePage(), rows: homeRows ? homeRows.length : null,
      runs: homeRuns, observing: !!homeObs,
      badges: document.querySelectorAll('.chr6-lock-badge').length }; },
    reclassifyOnce: reclassifyOnce,
    stats: function () { return JSON.parse(JSON.stringify(stats)); },
    /* 診断用。★passcode も token も返さない。 */
    status: function () { return { off: off(), dialogOpenFor: openFor,
      hasPort: !!port(), hasGate: !!gate(), hasSupplier: typeof window.__chronicleStorySessionSet === 'function',
      reclassified: Object.keys(reclassifiedFor), stats: JSON.parse(JSON.stringify(stats)) }; },
    __texts: { noRecovery: NO_RECOVERY_WARN, firstLock: FIRST_LOCK_NOTE }
  };
  try { console.log(TAG, 'loaded (story passcode UI / kill=v292Dfix860Off=1)'); } catch (e) {}
})();
