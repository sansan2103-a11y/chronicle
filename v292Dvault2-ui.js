/* v292Dvault2-ui.js — Vault v2 HOME UI r3 (Session A, 2026-10-12; GPT #125-EJ, Owner design acceptance 2026-10-12 16:20)
 * ------------------------------------------------------------------------------------------------------------------
 * r3 = same Vault v2 ops and safety rules as UI v0 (UI1, QA PASS on PC and iPhone), new presentation modelled on the
 * Owner's reference app: ONE padlock button in the HOME header.
 *   locked  : padlock (round). Hidden stories are not in the list. Tap -> one passphrase field -> open.
 *   open    : gold pill "開いています" + a thin bar "右上の鍵を押すと、すべての端末で閉じます". Hidden stories come back
 *             into the normal list with colour + a "非表示中" tag. Tap the pill = vault2relock (all devices, as before).
 *   hide / unhide : PC = one button at the bottom of the existing detail panel of the selected story (the PC layout is
 *             otherwise unchanged, Owner 16:15); narrow screens (no detail panel, <= 980px) = a visible "…" on each card
 *             -> bottom sheet. Hide only while open AND writeAvailable (ARM); unhide while open (ARM OFF allowed).
 *   first time: a one-time setup sheet (2 inputs, cannot-recover warning, checkbox) when no vault exists yet.
 * Unchanged from v0 (GPT #125-DM..#125-DS): owner-only (GET /api/auth/me entitlement === 'owner' AND vault2status ok),
 *   nothing drawn before that is confirmed (no flash of another account's state); hiddenIds used only when
 *   hiddenComplete === true (otherwise hide / unhide disabled with a notice); the passphrase is never stored and inputs
 *   are cleared right after use; HOME cloud rows are refetched through fix757 / fix889 after every change, applied only
 *   for the same principal; 60 s unlock-expiry poll only while open and visible, stops on a principal change.
 * Kill switch: localStorage['v292Dvault2UiOff'] === '1' (read once at load).
 * ms1 (2026-10-13, GPT design ruling "Vault UI3 複数選択 v1" relayed by the Owner 23:20, Owner 23:21 "2件より複数"):
 *   a "選択" button above the list, only while open. Selection mode: a tap on a card only toggles it (never opens the
 *   story), a check mark per card, "N件選択中", "N件を非表示にする" / "N件の非表示を解除する", "やめる". PC = a bar above
 *   the list; narrow = the same compact bar at the top of the list (GPT #125-FA). A confirm sheet shows the count (and titles) before anything runs.
 *   Execution = the existing vault2hide / vault2unhide, one story at a time by story id. Before EVERY request the
 *   principal (auth/me), the unlock and hiddenComplete (vault2status) and, for hide, ARM are checked again; a principal
 *   change, relock / expiry, auth failure, ARM off (hide) or an unknown state stops the run (no retry). Story-level
 *   refusals (409 / 404) are recorded and the run goes on. At the end the state is fetched again from the server and the
 *   result is counted from the server state, not from the responses. Not all-or-nothing: what failed stays selected.
 *   Nothing of this is shown while locked; a principal change / relock discards the selection.
 *   Kill switch (multi-select only): localStorage['v292Dvault2MsOff'] === '1' (read once at load).
 * ------------------------------------------------------------------------------------------------------------------ */
(function () {
  'use strict';
  var LS = null; try { LS = window.localStorage; } catch (e) {}
  try { if (LS && LS.getItem('v292Dvault2UiOff') === '1') return; } catch (e) {}
  if (!/\/home(\.html)?$/.test(location.pathname)) return;
  if (!/\.pages\.dev$/.test(location.hostname) && location.hostname !== '127.0.0.1' && location.hostname !== 'localhost') return;

  var TTL_MIN = 30, NARROW = '(max-width: 980px)';
  var S = { me: null, st: null, stories: [], unlockedAt: 0, busy: false, msg: '', msgKind: '' };
  var sheet = null, lockBtn = null, bar = null, sheetMode = '', sheetId = '';
  var MS_OFF = false; try { MS_OFF = !!(LS && LS.getItem('v292Dvault2MsOff') === '1'); } catch (e) {}
  var MS_MAX = 20;   /* one run handles at most this many stories (GPT #125-FB: 20; 10 stories took about 9 s with remote-like latency) */
  var MS = { on: false, ids: [], pending: null, run: null, note: '', noteKind: '', lockNote: '' }, msBox = null;

  function api(body) {
    return fetch('/api/save', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'x-chronicle-csrf': '1' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j || {} }; }, function () { return { s: r.status, j: {} }; }); },
            function () { return { s: 0, j: {} }; });
  }
  function me() {
    return fetch('/api/auth/me', { method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: { 'x-chronicle-csrf': '1' } })
      .then(function (r) { return r.ok ? r.json() : null; }, function () { return null; }).then(function (j) { switched(j); return j; }, function () { return null; });
  }
  /* GPT #125-EM OLD_ACCOUNT_DETAIL_RESIDUE: the moment this page is TOLD (an /auth/me answer) that the browser session now belongs to a
     different account, nothing of the previous account may stay on screen. Clear the story grid and the detail panel at once, then
     reload the page (the same thing a normal login does), once. Only a confirmed different account triggers it (a failed / missing
     answer does not). */
  var switching = false;
  function switched(j) {
    if (switching || !S.acct || !j || j.ok !== true || String(j.accountId || '') === S.acct) return false;
    switching = true; S.stopped = true; S.st = null; MS.on = false; MS.ids = []; MS.pending = null; MS.note = '';
    try { var g = el('grid'); if (g) g.innerHTML = ''; var d = el('detail'); if (d) d.innerHTML = ''; var r = el('recent'); if (r) r.innerHTML = ''; } catch (e) {}
    try { closeSheet(); } catch (e) {}
    try { location.reload(); } catch (e) {}
    return true;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function el(id) { return document.getElementById(id); }
  function narrow() { try { return window.matchMedia(NARROW).matches; } catch (e) { return false; } }

  /* ---- state (unchanged from v0) ---- */
  function refresh() {
    var wasUnlocked = !!(S.st && S.st.unlocked);
    return api({ op: 'vault2status' }).then(function (r) {
      if (r.s !== 200 || !r.j || r.j.ok !== true || r.j.vault2 !== true) { S.st = null; if (wasUnlocked) homeListRefresh(); paint(); return null; }
      S.st = r.j;
      if (wasUnlocked && !S.st.unlocked) homeListRefresh();   /* expired or locked elsewhere: drop rows fetched while unlocked */
      if (!S.st.unlocked) S.unlockedAt = 0;
      if (S.st.unlocked) return api({ op: 'listshadow' }).then(function (l) { S.stories = (l.s === 200 && l.j && Array.isArray(l.j.stories)) ? l.j.stories.filter(function (x) { return x && !x.deleted; }) : []; paint(); return S.st; });
      S.stories = []; paint();
      return S.st;
    });
  }
  function isOpen() { return !!(S.st && S.st.unlocked); }
  function hiddenKnown() { return !!(S.st && S.st.unlocked && Array.isArray(S.st.hiddenIds) && S.st.hiddenComplete === true); }
  function hiddenSet() { var o = {}; if (S.st && Array.isArray(S.st.hiddenIds)) S.st.hiddenIds.forEach(function (id) { o[String(id)] = 1; }); return o; }
  function storyOf(id) { for (var i = 0; i < S.stories.length; i++) if (String(S.stories[i].id) === String(id)) return S.stories[i]; return null; }
  function lockedHiddenOnDevice() {
    try { var g = window.__v292Dvault2CopyGate; var s = g && g.status && g.status(); return (s && Array.isArray(s.hidden)) ? s.hidden.map(String) : []; } catch (e) { return []; }
  }
  /* what may be done to one story right now: 'unhide' | 'hide' | '' plus a reason line for a disabled state */
  function actionFor(id) {
    if (!isOpen()) return { act: '', why: '鍵を開くと、非表示にできます。' };
    if (!hiddenKnown()) return { act: '', why: '隠している物語の一覧をすべて確認できないため、いまは操作を止めています。' };
    if (hiddenSet()[String(id)]) return { act: 'unhide', why: '' };
    if (!S.st.writeAvailable) return { act: '', why: 'いまは非表示にする操作を使えません。' };
    var x = storyOf(id);
    if (!x || x.authority !== 'canonical') return { act: '', why: 'クラウドに確定した物語だけ非表示にできます。' };
    return { act: 'hide', why: '' };
  }

  /* ---- header padlock + bar ---- */
  var ICON_LOCK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path></svg>';
  var ICON_OPEN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 7.5-2"></path></svg>';
  function addLock() {
    var hd = document.querySelector('header'); if (!hd || lockBtn) return;
    lockBtn = document.createElement('button'); lockBtn.type = 'button'; lockBtn.id = 'v2uiLock';
    lockBtn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); onLock(); });
    hd.appendChild(lockBtn); hd.classList.add('v2uiHasLock');
    bar = document.createElement('div'); bar.id = 'v2uiBar'; bar.style.display = 'none';
    bar.textContent = '隠した物語も表示中です。右上の鍵を押すと、すべての端末で閉じます。';
    if (hd.parentNode) hd.parentNode.insertBefore(bar, hd.nextSibling);
  }
  function paint() {
    if (!lockBtn) return;
    var open = isOpen();
    lockBtn.className = open ? 'v2uiLock v2uiOpenPill' : 'v2uiLock';
    lockBtn.innerHTML = open ? ICON_OPEN + '<span>開いています</span>' : ICON_LOCK;
    lockBtn.setAttribute('aria-label', open ? '鍵（開いています）。押すと、すべての端末で鍵を閉じます' : '鍵（閉じています）。押すと、合言葉で隠した物語を開きます');
    lockBtn.disabled = !!S.busy;
    if (bar) bar.style.display = open ? '' : 'none';
    msPaint();
    queueDecorate();
  }

  /* ---- card marks + "…" (narrow) + detail-panel button (PC) ---- */
  function decorate() {
    var grid = el('grid'); if (!grid) return;
    var unl = isOpen(), hs = unl ? hiddenSet() : {}, lk = {};
    if (!unl && S.st && S.st.hasVault) lockedHiddenOnDevice().forEach(function (id) { lk[id] = 1; });
    var cards = grid.querySelectorAll('.card[data-id]');
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i], id = String(c.getAttribute('data-id') || ''), old = c.querySelector('.v2uiMark');
      var label = unl ? (hs[id] ? '非表示中' : '') : (lk[id] ? '鍵がかかっています（この端末には内容が残っています）' : '');
      if (c.classList) { if (unl && hs[id]) c.classList.add('v2uiHid'); else c.classList.remove('v2uiHid'); }
      if (!label) { if (old) old.remove(); }
      else if (!old || old.textContent !== label) {
        if (old) old.remove();
        var m = document.createElement('div'); m.className = 'v2uiMark'; m.textContent = label;
        var host = c.querySelector('.cbody') || c; host.insertBefore(m, host.firstChild);
      }
      if (!c.querySelector('.v2uiMore')) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'v2uiMore'; b.textContent = '…';
        b.setAttribute('aria-label', 'この物語のメニュー'); b.setAttribute('data-id', id);
        b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); openSheet('menu', this.getAttribute('data-id')); });
        (c.querySelector('.cover') || c).appendChild(b);
      }
      msDecorateCard(c, id);
    }
    decorateDetail();
  }
  /* ms1: check mark + picked / not-pickable classes, only in selection mode; everything removed outside it */
  function msDecorateCard(c, id) {
    var ck = c.querySelector('.v2uiCk');
    if (!MS.on) { if (ck) ck.remove(); c.classList.remove('v2uiPicked'); c.classList.remove('v2uiNoPick'); c.removeAttribute('aria-checked'); return; }
    var picked = msHas(id), can = picked || !!actionFor(id).act;
    if (!ck) { ck = document.createElement('span'); ck.className = 'v2uiCk'; ck.setAttribute('aria-hidden', 'true'); (c.querySelector('.cover') || c).appendChild(ck); }
    var want = picked ? '✓' : ''; if (ck.textContent !== want) ck.textContent = want;   /* no write when unchanged (the grid observer would loop) */
    if (picked) c.classList.add('v2uiPicked'); else c.classList.remove('v2uiPicked');
    if (can) c.classList.remove('v2uiNoPick'); else c.classList.add('v2uiNoPick');
    c.setAttribute('aria-checked', picked ? 'true' : 'false');
  }
  function selectedId() { var c = document.querySelector('#grid .card.sel[data-id]'); return c ? String(c.getAttribute('data-id') || '') : ''; }
  function decorateDetail() {
    var d = el('detail'); if (!d) return;
    var old = el('v2uiDetail'); var id = selectedId();
    if (!S.st || !S.st.hasVault || !id || !d.firstChild) { if (old) old.remove(); return; }
    var a = actionFor(id);
    var key = id + '|' + a.act + '|' + a.why + '|' + S.busy + '|' + S.msg + '|' + (S.actId || '');
    if (old && old.getAttribute('data-k') === key && old.parentNode === d) return;
    if (old) old.remove();
    if (!isOpen()) return;   /* locked: nothing extra in the PC detail panel */
    var w = document.createElement('div'); w.id = 'v2uiDetail'; w.setAttribute('data-k', key);
    if (a.act) {
      var b = document.createElement('button'); b.type = 'button'; b.id = 'v2uiDetailBtn'; b.className = 'v2uiAct';
      b.setAttribute('data-v2', a.act); b.setAttribute('data-id', id); b.disabled = !!S.busy;
      b.textContent = a.act === 'unhide' ? '非表示を解除する' : 'この物語を非表示にする';
      b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); doAction(this.getAttribute('data-v2'), this.getAttribute('data-id')); });
      w.appendChild(b);
    } else {
      var p = document.createElement('div'); p.className = 'v2uiWhy'; p.textContent = a.why; w.appendChild(p);
    }
    if (S.msg && sheetMode === '' && (!S.actId || S.actId === id)) { var q = document.createElement('div'); q.className = S.msgKind === 'err' ? 'v2uiErr' : 'v2uiMsg'; q.textContent = S.msg; w.appendChild(q); }
    var anchor = d.querySelector('.dsec');
    if (anchor) d.insertBefore(w, anchor); else d.appendChild(w);
  }
  /* remove, from the screen only, the cards this page marked as hidden (used when the unlock ends without a refetch:
     logout / account change). Nothing is deleted anywhere; the next normal list render decides again. */
  function dropHiddenCards() { try { var ms = document.querySelectorAll('#grid .card.v2uiHid'); for (var i = 0; i < ms.length; i++) ms[i].remove(); } catch (e) {} }
  var decoQueued = false;
  function queueDecorate() { if (decoQueued) return; decoQueued = true; setTimeout(function () { decoQueued = false; try { decorate(); } catch (e) {} }, 50); }

  /* ---- sheet (bottom sheet on narrow screens, centred dialog on PC) ---- */
  function ensureSheet() {
    if (sheet) return sheet;
    sheet = document.createElement('div'); sheet.id = 'v2uiSheet'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true');
    sheet.style.display = 'none';
    sheet.addEventListener('click', onSheetClick);
    sheet.addEventListener('submit', onSubmit);
    document.body.appendChild(sheet);
    return sheet;
  }
  function openSheet(mode, id) { ensureSheet(); sheetMode = mode; sheetId = id || ''; S.msg = ''; lastKey = ''; sheet.style.display = ''; draw(); var f = sheet.querySelector('input[type=password]'); if (f) try { f.focus(); } catch (e) {} }
  function closeSheet() { MS.pending = null; if (!sheet) return; clearInputs(); sheet.style.display = 'none'; sheet.innerHTML = ''; sheetMode = ''; sheetId = ''; lastKey = ''; }
  function clearInputs() { if (!sheet) return; var ps = sheet.querySelectorAll('input[type=password]'); for (var i = 0; i < ps.length; i++) ps[i].value = ''; }
  function setMsg(t, kind) { S.msg = t || ''; S.msgKind = kind || ''; }

  var lastKey = '';
  function draw() {
    if (!sheet || sheet.style.display === 'none') return;
    var st = S.st;
    /* a form is not re-rendered while nothing it shows has changed: a background refresh must never wipe typing */
    var key = sheetMode + '|' + sheetId + '|' + (st ? (st.hasVault ? 1 : 0) + '' + (st.unlocked ? 1 : 0) + (st.writeAvailable ? 1 : 0) : 'x') + '|' + S.msg + '|' + S.busy + '|' + (st && st.hiddenIds ? st.hiddenIds.length : '');
    if (key === lastKey && sheet.querySelector('form')) return;
    lastKey = key;
    var h = '<div class="v2uiBox">', msg = S.msg ? '<div class="' + (S.msgKind === 'err' ? 'v2uiErr' : 'v2uiMsg') + '">' + esc(S.msg) + '</div>' : '';
    if (sheetMode === 'unlock') {
      sheet.setAttribute('aria-label', '隠した物語を開く');
      h += '<h2>隠した物語を開く</h2>' + msg +
        '<form data-v2="unlock"><label for="v2uiPass">合言葉</label><input id="v2uiPass" type="password" name="m" autocomplete="current-password" maxlength="128" placeholder="合言葉を入力" required>' +
        '<p class="v2uiNote">パスワード管理アプリの自動入力や貼り付けも使えます。約' + TTL_MIN + '分で自動的に鍵が閉まります。</p>' +
        '<button type="submit" class="v2uiPrimary"' + (S.busy ? ' disabled' : '') + '>開く</button></form>' +
        '<button type="button" class="v2uiGhost" data-v2="close">やめる</button>';
    } else if (sheetMode === 'setup') {
      sheet.setAttribute('aria-label', '物語を隠せるようにする');
      if (st && st.writeAvailable) {
        h += '<h2>物語を隠せるようにする</h2>' + msg +
          '<p class="v2uiNote">合言葉を決めると、右上の鍵で物語を隠したり出したりできます。この画面は最初の1回だけです。</p>' +
          '<form data-v2="set"><label for="v2uiN1">合言葉（6〜128文字。12文字以上をおすすめ）</label><input id="v2uiN1" type="password" name="m1" autocomplete="new-password" minlength="6" maxlength="128" required>' +
          '<label for="v2uiN2">もう一度</label><input id="v2uiN2" type="password" name="m2" autocomplete="new-password" minlength="6" maxlength="128" required>' +
          '<div class="v2uiWarn">合言葉を忘れないようにしてください。現在、この機能には合言葉の再設定・復旧方法がありません。忘れた場合、隠した物語を開けなくなる可能性があります。パスワード管理アプリなど、安全な場所への保存をおすすめします。</div>' +
          '<label class="v2uiChk"><input type="checkbox" name="ack" required> 上の内容を理解しました</label>' +
          '<button type="submit" class="v2uiPrimary"' + (S.busy ? ' disabled' : '') + '>合言葉を決める</button></form>' +
          '<button type="button" class="v2uiGhost" data-v2="close">やめる</button>';
      } else {
        h += '<h2>物語を隠せるようにする</h2>' + msg + '<p class="v2uiNote">いまは合言葉を設定できません。</p><button type="button" class="v2uiGhost" data-v2="close">閉じる</button>';
      }
    } else if (sheetMode === 'menu') {
      var x = storyOf(sheetId), a = actionFor(sheetId), t = cardTitle(sheetId) || (x && x.title) || '';
      sheet.setAttribute('aria-label', 'この物語のメニュー');
      h += '<h2 class="v2uiMenuTitle">' + esc(t || '（題名なし）') + '</h2>' + msg +
        '<a class="v2uiItem" href="index.html?story=' + encodeURIComponent(sheetId) + '">続きから遊ぶ</a>';
      if (a.act === 'hide') h += '<button type="button" class="v2uiItem v2uiAct" data-v2="hide" data-id="' + esc(sheetId) + '"' + (S.busy ? ' disabled' : '') + '>この物語を非表示にする</button>';
      else if (a.act === 'unhide') h += '<button type="button" class="v2uiItem v2uiAct" data-v2="unhide" data-id="' + esc(sheetId) + '"' + (S.busy ? ' disabled' : '') + '>非表示を解除する</button>';
      else if (S.st && S.st.hasVault) h += '<div class="v2uiWhy">' + esc(a.why) + '</div>';
      h += '<button type="button" class="v2uiGhost" data-v2="close">閉じる</button>';
    } else if (sheetMode === 'bulk') {
      var P = MS.pending || { kind: '', ids: [] }, n = P.ids.length, hide = P.kind === 'hide';
      sheet.setAttribute('aria-label', hide ? 'まとめて非表示にする' : 'まとめて非表示を解除する');
      h += '<h2>' + (hide ? n + '件の物語を非表示にしますか？' : n + '件の物語の非表示を解除しますか？') + '</h2>' + msg +
        '<ul class="v2uiList">' + P.ids.slice(0, 5).map(function (id) { var x = storyOf(id); return '<li>' + esc(cardTitle(id) || (x && x.title) || '（題名なし）') + '</li>'; }).join('') +
        (n > 5 ? '<li class="v2uiMore5">ほか ' + (n - 5) + ' 件</li>' : '') + '</ul>' +
        '<p class="v2uiNote">' + (hide ? '鍵が閉じているあいだ、一覧と読み出しから見えなくなります。すでに端末に保存された内容は消えません。' : '通常の一覧に戻ります。') +
        '1件ずつ順に処理します。途中でうまくいかなかった物語は、選んだまま残ります。</p>' +
        '<button type="button" class="v2uiPrimary" data-v2="bulkgo"' + (S.busy || !n ? ' disabled' : '') + '>' + (hide ? n + '件を非表示にする' : n + '件の非表示を解除する') + '</button>' +
        '<button type="button" class="v2uiGhost" data-v2="close">やめる</button>';
    }
    h += '</div>';
    sheet.innerHTML = h;
  }
  function cardTitle(id) { var c = document.querySelector('#grid .card[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"] .ctitle'); return c ? c.textContent : ''; }
  function errText(code, fallback) {
    return ({
      VAULT2_BAD_MASTER: '合言葉が違います。',
      VAULT2_LOCKED_OUT: '失敗が続いたため、しばらく開けません。時間をおいてからお試しください。',
      VAULT2_RATE_LIMITED: '少し待ってからもう一度お試しください。',
      VAULT2_NOT_ARMED: 'いまはこの操作を使えません。',
      VAULT2_OWNER_ONLY: 'この操作は利用できません。',
      VAULT2_LOCKED: '鍵が閉じました。もう一度開いてください。',
      VAULT2_EXISTS: '合言葉はすでに設定されています。',
      BAD_MASTER: '合言葉は6〜128文字にしてください。',
      STORY_NOT_ELIGIBLE: 'この物語はまだクラウドに確定していないため、非表示にできません。',
      TEMPORARILY_UNAVAILABLE: 'いまは確認できません。少し待ってからお試しください。'
    })[code] || fallback || 'うまくいきませんでした。少し待ってからお試しください。';
  }
  function act(body, okMsg) {
    S.busy = true; draw(); paint();
    return api(body).then(function (r) {
      S.busy = false;
      if (r.s === 200 && r.j && r.j.ok === true) { setMsg(okMsg || ''); return true; }
      setMsg(errText(r.j && r.j.errorCode), 'err'); return false;
    }).then(function (ok) { return refresh().then(function () { draw(); queueDecorate(); notifyHome(); return ok; }); });
  }
  /* GPT #125-DN / #125-DP / #125-DO (unchanged): refetch the HOME cloud rows through fix757 (applied only for the same
     principal) and ask fix889 again, once more after its 3 s window if the principal is still the same. */
  function samePrincipal() { return me().then(function (m) { return !!(m && m.ok === true && S.acct && String(m.accountId) === S.acct); }, function () { return false; }); }
  var lastHomeRefresh = 0;
  function homeListRefresh() { var now = Date.now(); if (now - lastHomeRefresh < 800) return; lastHomeRefresh = now; try { var h = window.__v292Dfix757; if (h && typeof h.refresh === 'function') { h.refresh(samePrincipal); S.homeRefreshes = (S.homeRefreshes || 0) + 1; } } catch (e) {}
    try { var F = window.__v292Dfix889; if (F && typeof F.refresh === 'function') { F.refresh(); var acct0 = S.acct;
      setTimeout(function () { me().then(function (m) { if (m && m.ok === true && acct0 && String(m.accountId) === acct0) { try { F.refresh(); } catch (e) {} } else { S.stopped = true; S.st = null; dropHiddenCards(); paint(); } }); }, 3300); } } catch (e) {} }
  function notifyHome() { homeListRefresh(); try { window.dispatchEvent(new CustomEvent('chr:vault2-ui-changed')); } catch (e) {} }

  function onLock() {
    if (S.busy) return;
    if (!S.st) { refresh(); return; }
    if (isOpen()) {   /* tap on the open pill = the existing global relock */
      act({ op: 'vault2relock' }, '').then(function (ok) { S.unlockedAt = 0; if (ok) dropHiddenCards(); paint(); });
      return;
    }
    openSheet(S.st.hasVault ? 'unlock' : 'setup');
  }
  function doAction(kind, id) {
    if (S.busy || MS.run || !id) return;
    if (!hiddenKnown()) { setMsg('隠している物語の一覧を確認できないため、操作を止めています。', 'err'); draw(); decorateDetail(); return; }
    if (kind === 'hide') {
      if (!window.confirm('この物語を非表示にしますか？\n鍵が閉じているあいだ、一覧と読み出しから見えなくなります。すでに端末に保存された内容は消えません。')) return;
      S.actId = id;   /* the result message is shown only in this story's detail (HOME keeps the selection during its refresh) */
      act({ op: 'vault2hide', id: id }, '非表示にしました。');
    } else if (kind === 'unhide') {
      S.actId = id;   /* the result message is shown only in this story's detail (HOME keeps the selection during its refresh) */
      act({ op: 'vault2unhide', id: id }, '非表示を解除しました。');
    }
  }
  function onSubmit(ev) {
    var f = ev.target; if (!f || !f.getAttribute) return; ev.preventDefault();
    var kind = f.getAttribute('data-v2'); S.actId = '';
    if (kind === 'set') {
      var a = f.m1.value, b = f.m2.value, ack = f.ack.checked; f.m1.value = ''; f.m2.value = '';
      if (a !== b) { setMsg('2回の合言葉が一致しません。', 'err'); a = b = ''; lastKey = ''; draw(); return; }
      if (!ack) { setMsg('注意事項を確認してください。', 'err'); a = b = ''; lastKey = ''; draw(); return; }
      var body = { op: 'vault2set', master: a }; a = b = '';
      act(body, '合言葉を決めました。右上の鍵から開けます。').then(function (ok) { body.master = ''; if (ok) closeSheet(); });
    } else if (kind === 'unlock') {
      var m = f.m.value; f.m.value = '';
      var ub = { op: 'vault2unlock', master: m }; m = '';
      act(ub, '').then(function (ok) { ub.master = ''; if (ok) { S.unlockedAt = Date.now(); closeSheet(); paint(); } else { lastKey = ''; draw(); } });
    }
  }
  function onSheetClick(ev) {
    var t = ev.target; if (!t || !t.getAttribute) return;
    var k = t.getAttribute('data-v2'); if (!k) { if (t === sheet) closeSheet(); return; }
    if (k === 'close') return closeSheet();
    if (k === 'bulkgo') { var P = MS.pending; MS.swallowUntil = Date.now() + 700; closeSheet(); if (P) msRun(P.kind, P.ids); return; }   /* a double tap must not fall through to the card under the closed sheet */
    if (k === 'hide' || k === 'unhide') { var id = t.getAttribute('data-id'); doAction(k, id); }
  }

  /* ---- ms1: multi-select (N stories) ---- */
  function msHas(id) { return MS.ids.indexOf(String(id)) >= 0; }
  function msAvailable() { return !MS_OFF && !S.stopped && !switching && isOpen() && hiddenKnown(); }
  function msOnGrid(id) { return !!document.querySelector('#grid .card[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]'); }
  function msCounts() { var o = { hide: 0, unhide: 0 }; MS.ids.forEach(function (id) { var a = actionFor(id).act; if (a) o[a]++; }); return o; }
  function msSetNote(t, kind) { MS.note = t || ''; MS.noteKind = kind || ''; }
  function msEnter() { if (!msAvailable() || S.busy || MS.run) return; MS.on = true; MS.ids = []; MS.lockNote = ''; msSetNote(''); msPaint(); queueDecorate(); }
  function msExit() { if (MS.run) return; MS.on = false; MS.ids = []; msSetNote(''); msPaint(); queueDecorate(); }
  /* a click anywhere on a card in selection mode toggles it and goes nowhere else (HOME's own handler = open on the 2nd
     click, the "…" menu, links inside the card). Capture phase on document = before every other listener. */
  function msOnClickCapture(e) {
    if (Date.now() < (MS.swallowUntil || 0) && e.target && e.target.closest && e.target.closest('#grid')) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); return; }
    if (!MS.on) return;
    var t = e.target, c = t && t.closest && t.closest('#grid .card[data-id]'); if (!c) return;
    e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    if (MS.run || S.busy) return;
    var id = String(c.getAttribute('data-id') || ''); if (!id) return;
    if (msHas(id)) MS.ids.splice(MS.ids.indexOf(id), 1);
    else {
      var a = actionFor(id);
      if (!a.act) { msSetNote(a.why || 'この物語は選べません。', 'err'); msPaint(); return; }
      if (MS.ids.length >= MS_MAX) { msSetNote('一度に選べるのは ' + MS_MAX + ' 件までです。', 'err'); msPaint(); return; }
      MS.ids.push(id);
    }
    msSetNote(''); msPaint(); queueDecorate();
  }
  /* confirm: the targets are fixed here = selected, still on the list, and still allowed for this action */
  function msConfirm(kind) {
    if (MS.run || S.busy || !msAvailable()) return;
    var ids = MS.ids.filter(function (id) { return msOnGrid(id) && actionFor(id).act === kind; });
    if (!ids.length) return;
    MS.pending = { kind: kind, ids: ids.slice() }; openSheet('bulk', kind);
  }
  function msStopText(why) {
    return ({ auth: 'ログイン状態を確認できなかったため、途中で止めました。', principal: 'アカウントが切り替わったため、途中で止めました。',
      locked: '鍵が閉じたため、途中で止めました。', arm: 'いまは非表示にする操作を使えないため、途中で止めました。',
      status: '状態を確認できなかったため、途中で止めました。', error: 'うまくいかなかったため、途中で止めました。' })[why] || '';
  }
  /* sequential run over the existing ops. Every request is preceded by a fresh principal + vault2status check. */
  function msRun(kind, ids) {
    if (MS.run || S.busy || !ids || !ids.length || (kind !== 'hide' && kind !== 'unhide')) return;
    if (!msAvailable()) return;
    var acct0 = S.acct, op = kind === 'hide' ? 'vault2hide' : 'vault2unhide';
    var R = MS.run = { kind: kind, ids: ids.slice(), i: 0, ok: [], fail: [], skip: [], stop: '', codes: {} };
    S.busy = true; S.actId = ''; setMsg(''); msSetNote(''); paint(); msPaint();
    function check() {
      return me().then(function (m) {
        if (switching || S.stopped) return 'principal';
        if (!m || m.ok !== true) return 'auth';
        if (String(m.accountId || '') !== acct0) return 'principal';
        return api({ op: 'vault2status' }).then(function (r) {
          if (switching || S.stopped) return 'principal';
          if (r.s === 401 || r.s === 403) return 'auth';
          if (r.s !== 200 || !r.j || r.j.ok !== true || r.j.vault2 !== true) return 'status';
          S.st = r.j;
          if (!r.j.unlocked) return 'locked';
          if (!Array.isArray(r.j.hiddenIds) || r.j.hiddenComplete !== true) return 'status';
          if (kind === 'hide' && !r.j.writeAvailable) return 'arm';
          return '';
        });
      }, function () { return 'auth'; });
    }
    function step() {
      if (R.i >= R.ids.length || R.stop) return Promise.resolve();
      var id = R.ids[R.i];
      return check().then(function (why) {
        if (why) { R.stop = why; return; }
        var inHidden = hiddenSet()[id] === 1;
        if ((kind === 'hide' && inHidden) || (kind === 'unhide' && !inHidden)) { R.skip.push(id); R.i++; msPaint(); return step(); }   /* already in the target state */
        return api({ op: op, id: id }).then(function (r) {
          R.i++;
          if (r.s === 200 && r.j && r.j.ok === true) { R.ok.push(id); msPaint(); return step(); }
          var code = (r.j && r.j.errorCode) || ('HTTP_' + r.s); R.fail.push(id); R.codes[id] = code;
          if (r.s === 409 || r.s === 404) { msPaint(); return step(); }   /* this story only; the next one is checked again */
          R.stop = code === 'VAULT2_LOCKED' ? 'locked' : code === 'VAULT2_NOT_ARMED' ? 'arm' : (r.s === 401 || r.s === 403) ? 'auth' : 'error';
        });
      });
    }
    return step().then(null, function () { if (!R.stop) R.stop = 'error'; }).then(function () {
      S.busy = false;
      if (switching) { MS.run = null; return; }   /* the page is reloading for the other account: show nothing */
      return refresh().then(null, function () { return null; }).then(function () {
        MS.run = null;
        var verified = !S.stopped && isOpen() && hiddenKnown() && S.acct === acct0;
        if (!verified) {   /* locked / unknown: no counts, no titles (never reveal how many are hidden) */
          MS.on = false; MS.ids = []; msSetNote(''); MS.lockNote = R.stop ? msStopText(R.stop) : '操作の結果を確認できませんでした。鍵を開いて確かめてください。';
        } else {
          var hs = hiddenSet(), done = [], left = [];
          R.ids.forEach(function (id) { var inH = hs[id] === 1; (((kind === 'hide') === inH) ? done : left).push(id); });
          var t = done.length + '件' + (kind === 'hide' ? 'を非表示にしました。' : 'の非表示を解除しました。');
          if (left.length) {
            var codes = {}; left.forEach(function (id) { if (R.codes[id]) codes[R.codes[id]] = 1; });
            var why = (codes.STORY_NOT_ELIGIBLE ? '削除済みか、クラウドに未確定のため非表示にできない物語がありました。' : '') + (codes['not-found'] ? 'すでに非表示ではなくなっていた物語がありました。' : '');   /* a stop has its own sentence below */
            t += left.length + '件はできませんでした。' + why + (R.stop ? msStopText(R.stop) : '');
          }
          MS.ids = left.filter(function (id) { return !!actionFor(id).act; });   /* what can still be retried stays selected */
          if (MS.ids.length) t += 'やり直せる物語は選んだまま残しています。'; else MS.on = false;
          msSetNote(t, left.length ? 'err' : '');
        }
        MS.last = { kind: kind, n: R.ids.length, ok: R.ok.length, fail: R.fail.length, skip: R.skip.length, stop: R.stop, verified: verified };
        draw(); paint(); notifyHome(); queueDecorate();
      });
    });
  }
  function ensureMsBox() {
    if (MS_OFF || msBox) return msBox;
    var grid = el('grid'); if (!grid || !grid.parentNode) return null;
    msBox = document.createElement('div'); msBox.id = 'v2uiMs'; msBox.style.display = 'none';
    msBox.addEventListener('click', function (e) {
      var b = e.target && e.target.closest && e.target.closest('[data-ms]'); if (!b) return;
      e.preventDefault(); e.stopPropagation();
      var k = b.getAttribute('data-ms');
      if (k === 'enter') msEnter(); else if (k === 'exit') msExit(); else if (k === 'hide' || k === 'unhide') msConfirm(k);
    });
    grid.parentNode.insertBefore(msBox, grid);
    return msBox;
  }
  var msKey = '';
  function msPaint() {
    if (MS_OFF) return;
    if (!msAvailable() && !MS.run) { MS.on = false; MS.ids = []; MS.pending = null; msSetNote(''); if (sheetMode === 'bulk') closeSheet(); }
    var box = ensureMsBox(); if (!box) return;
    var open = isOpen() && !S.stopped && !switching;
    try { document.body.classList.toggle('v2uiMsMode', !!(MS.on && open)); } catch (e) {}
    var R = MS.run, c = msCounts(), n = MS.ids.length;
    var key = [open ? 1 : 0, MS.on ? 1 : 0, n, c.hide, c.unhide, R ? R.i + '/' + R.ids.length + R.kind : '', MS.note, MS.noteKind, MS.lockNote, S.busy ? 1 : 0, msAvailable() ? 1 : 0].join('|');
    if (key === msKey) return; msKey = key;
    if (!open) {   /* locked: only a fixed sentence (no number, no title) may stay, until the next unlock */
      box.className = ''; if (MS.lockNote) { box.style.display = ''; box.innerHTML = '<div class="v2uiMsNote">' + esc(MS.lockNote) + '</div>'; } else { box.style.display = 'none'; box.innerHTML = ''; }
      return;
    }
    MS.lockNote = '';
    box.style.display = '';
    var note = MS.note ? '<div class="v2uiMsNote' + (MS.noteKind === 'err' ? ' v2uiMsErr' : '') + '" role="status">' + esc(MS.note) + '</div>' : '';
    if (R) {
      box.className = 'v2uiMsOn';
      box.innerHTML = '<div class="v2uiMsRow"><span class="v2uiMsCnt" role="status">' + (R.kind === 'hide' ? '非表示にしています' : '非表示を解除しています') + '… ' + Math.min(R.i + 1, R.ids.length) + ' / ' + R.ids.length + '</span></div>';
      return;
    }
    if (!MS.on) {
      box.className = '';
      box.innerHTML = '<div class="v2uiMsRow"><button type="button" class="v2uiMsBtn" data-ms="enter"' + (msAvailable() && !S.busy ? '' : ' disabled') + '>選択</button><span class="v2uiMsHint">複数の物語をまとめて非表示・解除できます</span></div>' + note;
      return;
    }
    box.className = 'v2uiMsOn';
    var h = '<div class="v2uiMsRow"><span class="v2uiMsCnt" role="status">' + (n ? n + '件選択中' : '物語を押して選んでください') + '</span>';
    if (c.hide) h += '<button type="button" class="v2uiMsGo" data-ms="hide"' + (S.busy ? ' disabled' : '') + '>' + c.hide + '件を非表示にする</button>';
    if (c.unhide) h += '<button type="button" class="v2uiMsGo" data-ms="unhide"' + (S.busy ? ' disabled' : '') + '>' + c.unhide + '件の非表示を解除する</button>';
    h += '<button type="button" class="v2uiMsBtn" data-ms="exit">やめる</button></div>';
    box.innerHTML = h + note;
  }

  /* ---- boot ---- */
  function style() {
    var s = document.createElement('style'); s.id = 'v2uiStyle';
    s.textContent =
      '#v2uiLock{margin-left:12px;height:40px;min-width:40px;border-radius:20px;border:1px solid #3a3c57;background:#15172a;color:var(--tx,#e2e0f2);display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:0 11px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700;line-height:1;flex-shrink:0;white-space:nowrap}' +
      '#v2uiLock.v2uiOpenPill{border-color:#c9a44c;background:#2b2412;color:#f0d78f;padding:0 14px}#v2uiLock[disabled]{opacity:.55;cursor:default}' +
      '@media (max-width:640px){header.v2uiHasLock{flex-wrap:wrap;row-gap:6px}header.v2uiHasLock #sync{order:3;flex:1 1 100%;text-align:left}}' +
      '#v2uiBar{padding:8px 20px;background:#1d1a10;border-bottom:1px solid #4a3f1d;font-size:13px;color:#e8d7a6}' +
      '.card.v2uiHid{border-color:#8f7bd6 !important;background:#1a1730}.card.v2uiHid .ctitle{color:#cbbcff}' +
      '.v2uiMark{font-size:11px;font-weight:700;padding:2px 8px;border-radius:5px;background:#b9a8f5;color:#1a1730;display:inline-block;margin:0 0 6px}' +
      '.v2uiMore{display:none;position:absolute;top:6px;right:6px;z-index:3;width:44px;height:44px;border-radius:22px;border:0;background:rgba(8,8,16,.72);color:#e2e0f2;font-size:20px;line-height:1;cursor:pointer}' +
      '@media ' + NARROW + '{.v2uiMore{display:block}}' +
      '#v2uiDetail{margin-top:10px}#v2uiDetail .v2uiAct{width:100%;padding:10px;border-radius:8px;border:1px solid #8f7bd6;background:#221d36;color:#cbbcff;font-size:13px;font-weight:700;cursor:pointer}' +
      '#v2uiDetail .v2uiAct[disabled]{opacity:.5;cursor:default}.v2uiWhy{font-size:12px;line-height:1.6;color:var(--dim,#8f93bb);margin:6px 0}' +
      '#v2uiSheet{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px}' +
      '#v2uiSheet .v2uiBox{background:#15172a;color:var(--tx,#e9e6dc);border:1px solid #2c2e48;border-radius:16px;width:100%;max-width:440px;padding:22px;box-sizing:border-box;max-height:100%;overflow:auto}' +
      '@media ' + NARROW + '{#v2uiSheet{align-items:flex-end;padding:0}#v2uiSheet .v2uiBox{max-width:none;border-radius:22px 22px 0 0;padding:24px 20px 30px}}' +
      '#v2uiSheet h2{margin:0 0 12px;font-size:19px}#v2uiSheet label{display:block;margin:10px 0 6px;font-size:14px;color:#c3c1d4}' +
      '#v2uiSheet input[type=password]{display:block;width:100%;box-sizing:border-box;height:50px;padding:0 14px;border-radius:12px;border:1px solid #3a3c57;background:#0b0c16;color:inherit;font-size:16px}' +
      '#v2uiSheet .v2uiChk{display:flex;gap:8px;align-items:center}#v2uiSheet .v2uiNote{font-size:13px;line-height:1.7;color:#9a99b0;margin:10px 0}' +
      '#v2uiSheet .v2uiPrimary{display:block;width:100%;height:50px;margin-top:12px;border-radius:14px;border:0;background:#c9a95a;color:#1b1608;font-size:16px;font-weight:700;cursor:pointer}' +
      '#v2uiSheet .v2uiGhost{display:block;width:100%;height:44px;margin-top:6px;border:0;background:transparent;color:#c3c1d4;font-size:15px;cursor:pointer}' +
      '#v2uiSheet .v2uiItem{display:block;width:100%;box-sizing:border-box;min-height:50px;padding:14px;margin:4px 0;border-radius:12px;border:0;background:transparent;color:inherit;font-size:16px;text-align:left;text-decoration:none;cursor:pointer}' +
      '#v2uiSheet .v2uiItem.v2uiAct{background:#221d36;color:#cbbcff;font-weight:700}#v2uiSheet button[disabled]{opacity:.5;cursor:default}' +
      '#v2uiSheet .v2uiWarn{font-size:12.5px;line-height:1.7;border-radius:10px;background:#2a1414;border:1px solid #6b2a2a;color:#ffc9c0;padding:10px 12px;margin:10px 0}' +
      '.v2uiMsg{font-size:13px;margin:8px 0;padding:8px 10px;border-radius:8px;background:rgba(255,255,255,.06)}.v2uiErr{font-size:13px;margin:8px 0;padding:8px 10px;border-radius:8px;background:rgba(200,60,60,.18)}' +
      '.v2uiMenuTitle{overflow-wrap:anywhere}' +
      '#v2uiMs{margin:0 0 12px;font-size:13px}#v2uiMs .v2uiMsRow{display:flex;flex-wrap:wrap;align-items:center;gap:8px}' +
      '#v2uiMs .v2uiMsBtn,#v2uiMs .v2uiMsGo{min-height:40px;padding:0 14px;border-radius:10px;border:1px solid #3a3c57;background:#15172a;color:var(--tx,#e2e0f2);font-family:inherit;font-size:13px;font-weight:700;cursor:pointer}' +
      '#v2uiMs .v2uiMsGo{border-color:#8f7bd6;background:#221d36;color:#cbbcff}#v2uiMs button[disabled]{opacity:.5;cursor:default}' +
      '#v2uiMs .v2uiMsHint{color:var(--dim,#8f93bb);font-size:12px}#v2uiMs .v2uiMsCnt{font-weight:700;color:#f0d78f;margin-right:4px}' +
      '#v2uiMs .v2uiMsNote{margin-top:8px;line-height:1.6;padding:8px 10px;border-radius:8px;background:rgba(255,255,255,.06)}#v2uiMs .v2uiMsErr{background:rgba(200,60,60,.18)}' +
      '#v2uiMs.v2uiMsOn{position:sticky;top:0;z-index:6;padding:10px 12px;border:1px solid #4a3f1d;border-radius:12px;background:#1d1a10}' +
      /* narrow (GPT #125-FA): NOT fixed to the screen bottom (it covered the legal footer). The same compact bar sits at the top of the
         story list and stays there while the list scrolls (sticky inside the list's own scroll area); nothing else moves. */
      '@media ' + NARROW + '{#v2uiMs.v2uiMsOn{padding:8px 10px;margin:0 0 10px;border-radius:10px}#v2uiMs.v2uiMsOn .v2uiMsRow{gap:6px}#v2uiMs.v2uiMsOn .v2uiMsGo{flex:1 1 auto;min-height:44px;font-size:14px}#v2uiMs.v2uiMsOn .v2uiMsBtn{min-height:44px}#v2uiMs.v2uiMsOn .v2uiMsNote{margin-top:6px;padding:6px 8px}}' +
      /* phone only, only while selecting: the left panel (sync / data buttons, stacked above the list on a phone) is folded away so the
         list has room; it comes back the moment selection ends. The header, the list and the legal footer stay as they are. */
      '@media (max-width:640px){body.v2uiMsMode main > aside{display:none}}' +
      'body.v2uiMsMode .v2uiMore{display:none !important}body.v2uiMsMode #v2uiDetail{display:none}body.v2uiMsMode .card.sel{border-color:var(--line,#2a2c44)}' +
      '.v2uiCk{position:absolute;top:8px;right:8px;z-index:4;width:30px;height:30px;border-radius:15px;border:2px solid rgba(255,255,255,.85);background:rgba(8,8,16,.55);color:#1b1608;font-size:18px;font-weight:900;line-height:26px;text-align:center;box-sizing:border-box}' +
      '.card.v2uiPicked{outline:3px solid #c9a44c;outline-offset:-3px}.card.v2uiPicked .v2uiCk{background:#c9a95a;border-color:#c9a95a}.card.v2uiNoPick{opacity:.45}' +
      '#v2uiSheet .v2uiList{margin:8px 0;padding-left:20px;font-size:14px;line-height:1.7;overflow-wrap:anywhere}#v2uiSheet .v2uiMore5{list-style:none;margin-left:-20px;color:#9a99b0}';
    document.head.appendChild(s);
  }
  function boot() {
    me().then(function (m) {
      if (!m || m.ok !== true || m.entitlement !== 'owner') return;
      S.me = { entitlement: m.entitlement }; S.acct = String(m.accountId || '');   /* kept in memory only, never shown */
      return refresh().then(function (st) {
        if (!st) return;
        style(); addLock(); paint();
        var grid = el('grid');
        if (grid && window.MutationObserver) new MutationObserver(queueDecorate).observe(grid, { childList: true, subtree: true });
        var det = el('detail');
        if (det && window.MutationObserver) new MutationObserver(function () { queueDecorate(); }).observe(det, { childList: true });
        if (!MS_OFF) document.addEventListener('click', msOnClickCapture, true);
        queueDecorate();
        window.addEventListener('chr:account-me', function () { if (!switching && !S.stopped) me(); });
        /* GPT #125-DO ① (unchanged): one timer; asks only while open and visible; a principal change stops it for good */
        setInterval(function () { if (S.stopped || !S.st || !S.st.unlocked || document.hidden || S.polling) return; S.polling = true;
          me().then(function (m2) { if (!m2 || m2.ok !== true || String(m2.accountId) !== S.acct) { S.stopped = true; S.st = null; dropHiddenCards(); paint(); return null; } return refresh(); })
            .then(function () { S.polling = false; draw(); queueDecorate(); }, function () { S.polling = false; }); }, 60000);
        document.addEventListener('visibilitychange', function () { if (!document.hidden && !S.stopped) refresh().then(function () { draw(); queueDecorate(); }); });
      });
    });
  }
  window.__v292Dvault2Ui = { status: function () { return { me: S.me, hasVault: !!(S.st && S.st.hasVault), unlocked: isOpen(), writeAvailable: !!(S.st && S.st.writeAvailable), hiddenCount: S.st ? S.st.hiddenCount : null, hiddenComplete: S.st ? S.st.hiddenComplete : null, stories: S.stories.length, lock: !!lockBtn, btn: !!lockBtn, sheet: sheetMode, homeRefreshes: S.homeRefreshes || 0, ui: 'r3', ms: MS_OFF ? 'off' : { on: MS.on, n: MS.ids.length, running: !!MS.run, last: MS.last || null } }; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
