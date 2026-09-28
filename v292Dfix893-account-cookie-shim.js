/* ============================================================================
 * v292Dfix893 ACCOUNT_COOKIE_SHIM（ACCOUNT_IDENTITY_P2 / S-A same-origin）
 * ----------------------------------------------------------------------------
 * 役割: 新しい same-origin の配信先（Cloudflare Pages, *.pages.dev）でだけ動き、
 *   ・Worker（novel-proxy.*.workers.dev）宛ての fetch / XHR を same-origin の /api/* へ付け替える
 *   ・credential header（x-chronicle-pass / x-google-id / x-chronicle-session）を外し、
 *     x-chronicle-csrf: 1 を付ける（認証は HttpOnly cookie __Host-chr_sess だけ）
 *   ・localStorage に credential を置かせない（書込を捨て、起動時に掃除する）
 *   ・ログインは Google → POST /api/auth/google → cookie。状態は GET /api/auth/me
 *   ・他モジュールには window.__chronicleSessionId() が 'cookie:<accountId>' を返すことで
 *     「ログイン済み」を伝える（値はこの shim が送信前に必ず外すので外へ出ない）
 * github.io など他の origin では **何もしない**（最初の行で return、グローバルも作らない）。
 * 読み込み位置: index.html / home.html とも fix654 の直後（fetch を捕まえる他モジュールより前）。
 * kill: この origin で localStorage v292Dfix893Off='1'（その場合 app は未ログイン扱いになる）。
 * ========================================================================== */
(function () {
  'use strict';
  var WORKER = 'https://novel-proxy.sansan2103.workers.dev';
  var CLIENT_ID = '755944735372-g4g0rl8if91m2nimo23jdf125cjhs07q.apps.googleusercontent.com';
  var HOST_OK = /\.pages\.dev$/;
  try { if (location.protocol !== 'https:' || !HOST_OK.test(location.hostname)) return; } catch (e) { return; }
  var LS = window.localStorage;
  var nativeGet = Storage.prototype.getItem, nativeSet = Storage.prototype.setItem, nativeRemove = Storage.prototype.removeItem;
  function lsGet(k) { try { return nativeGet.call(LS, k); } catch (e) { return null; } }
  function lsSet(k, v) { try { nativeSet.call(LS, k, v); } catch (e) {} }
  function lsDel(k) { try { nativeRemove.call(LS, k); } catch (e) {} }
  if (lsGet('v292Dfix893Off') === '1') return;

  var MARK_KEY = 'v292Dfix837_sess';
  var CRED_KEYS = ['v292ProxyPass', 'v292GoogleToken'];
  var CRED_HEADERS = { 'x-chronicle-pass': 1, 'x-google-id': 1, 'x-chronicle-session': 1 };
  var PLAY = { beta: 1, paid: 1, owner: 1 };
  var state = { me: null, checked: false, lastError: null, features: null };   /* ★fix905: features は in-memory のみ（mark / localStorage へ書かない） */

  function readMark() { try { var o = JSON.parse(lsGet(MARK_KEY) || 'null'); return (o && o.sid === 'cookie' && o.acct) ? o : null; } catch (e) { return null; } }
  function writeMark(me) { lsSet(MARK_KEY, JSON.stringify({ sid: 'cookie', acct: me.accountId, ent: me.entitlement, ts: Date.now() })); }
  function clearMark() { lsDel(MARK_KEY); }

  /* ---- 1. 起動時の掃除: credential を持たない ---- */
  CRED_KEYS.forEach(lsDel);
  if (lsGet(MARK_KEY) && !readMark()) lsDel(MARK_KEY);        /* 本物の fix837 sid は捨てる */
  try {                                                         /* ?code= は取り込ませない（fix247b より前） */
    var u0 = new URL(location.href);
    if (u0.searchParams.has('code')) { u0.searchParams.delete('code'); history.replaceState(history.state, '', u0.pathname + u0.search + u0.hash); }
  } catch (e) {}
  if (!lsGet('v292ProxyUrl')) lsSet('v292ProxyUrl', WORKER);
  lsSet('v292GoogleLoginOff', '1');                             /* 旧 Google ログイン（fix328 / home f663）はこの origin では使わない */

  /* ---- 2. localStorage に credential を書かせない（fix654 の trap の上から instance で捕まえる） ---- */
  try {
    var prevSet = LS.setItem;
    LS.setItem = function (k, v) {
      k = String(k);
      if (CRED_KEYS.indexOf(k) >= 0) return;
      if (k === MARK_KEY) { try { var o = JSON.parse(String(v)); if (!(o && o.sid === 'cookie')) return; } catch (e) { return; } }
      return prevSet.apply(this, arguments);
    };
  } catch (e) {}

  /* ---- 3. 「ログイン済み」の供給（同期で答える。値は送信前に外される） ---- */
  function loggedIn() { var m = state.me || readMark(); return !!(m && PLAY[m.entitlement || m.ent]); }
  function supplier() { var m = state.me || readMark(); return (m && PLAY[m.entitlement || m.ent]) ? 'cookie:' + (m.accountId || m.acct) : ''; }
  ['__chronicleSessionId', '__chronicleGoogleId'].forEach(function (name) {
    try { Object.defineProperty(window, name, { configurable: false, enumerable: true, get: function () { return supplier; }, set: function () {} }); } catch (e) {}
  });

  /* ---- 4. fetch / XHR の付け替え ---- */
  var nativeFetch = window.fetch.bind(window);
  function mapUrl(url) {
    var s = String(url || '');
    if (s.indexOf(WORKER) !== 0) return null;
    var rest = s.slice(WORKER.length);
    if (rest === '' || rest.charAt(0) === '?') rest = '/' + rest;
    if (rest.charAt(0) !== '/') return null;
    if (rest.indexOf('/img') === 0 && (rest.length === 4 || rest.charAt(4) === '?')) return null;   /* 画像 URL は認証不要のまま */
    return '/api' + rest;
  }
  function onAuthFailure() { state.me = null; clearMark(); unrenderLogout897(); showGate('expired'); }
  function watch(resp) {
    try {
      if (resp && resp.status === 401) {
        resp.clone().json().then(function (j) { if (j && (j.errorCode === 'SESSION_INVALID' || j.errorCode === 'NO_SESSION')) onAuthFailure(); }).catch(function () {});
      }
    } catch (e) {}
    return resp;
  }
  function synth(obj, status) { return Promise.resolve(new Response(JSON.stringify(obj), { status: status, headers: { 'Content-Type': 'application/json' } })); }
  window.fetch = function (input, init) {
    var url = (typeof input === 'string') ? input : (input && input.url) || String(input);
    var mapped = mapUrl(url);
    if (!mapped) return nativeFetch(input, init);
    init = init || {};
    var method = String(init.method || (input && input.method) || 'GET').toUpperCase();
    var h = new Headers(init.headers || (input && input.headers) || {});
    Object.keys(CRED_HEADERS).forEach(function (k) { h.delete(k); });
    h.set('x-chronicle-csrf', '1');
    var body = init.body;
    if (typeof body === 'string' && /^\/api\/save(\?|$)/.test(mapped)) {
      try {
        var op = (JSON.parse(body) || {}).op;
        if (op === 'session') return synth({ ok: false, error: 'cookie session origin', errorCode: 'unsupported' }, 400);
        if (op === 'sessionend') return logout().then(function () { return new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }); });
      } catch (e) {}
    }
    var out = { method: method, headers: h, credentials: 'same-origin' };
    if (body != null) out.body = body;
    else if (input && typeof input !== 'string' && input.body && method !== 'GET' && method !== 'HEAD') { out.body = input.body; out.duplex = 'half'; }
    if (init.signal) out.signal = init.signal;
    if (init.keepalive) out.keepalive = true;
    return nativeFetch(mapped, out).then(watch);
  };
  var XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.setRequestHeader, XSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    var mapped = mapUrl(url);
    this.__f893 = !!mapped;
    var args = Array.prototype.slice.call(arguments);
    if (mapped) args[1] = mapped;
    return XO.apply(this, args);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    if (this.__f893 && CRED_HEADERS[String(k).toLowerCase()]) return;
    return XS.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (this.__f893) { try { XS.call(this, 'x-chronicle-csrf', '1'); } catch (e) {} }
    return XSend.apply(this, arguments);
  };

  /* ---- 5. account API ---- */
  function api(path, method, body) {
    var o = { method: method, credentials: 'same-origin', headers: { 'x-chronicle-csrf': '1' } };
    if (body) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); }
    return nativeFetch('/api' + path, o).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j.__status = r.status; return j; }); });
  }
  function refreshMe() {
    return api('/auth/me', 'GET').then(function (j) {
      state.checked = true;
      if (j && j.ok) { state.me = { accountId: j.accountId, entitlement: j.entitlement, status: j.status }; state.features = (j.features && typeof j.features === 'object') ? { memoryEngine: j.features.memoryEngine === true } : null; writeMark(state.me); if (!PLAY[j.entitlement]) showGate('entitlement'); else { hideGate(); renderLogout897(); } }
      else if (j && j.__status === 401) { state.me = null; state.features = null; clearMark(); unrenderLogout897(); showGate('login'); }
      else { state.lastError = j && (j.errorCode || j.__status); state.features = null; }
      try { window.dispatchEvent(new Event('chr:account-me')); } catch (e905) {}
      return state.me;
    }).catch(function (e) { state.checked = true; state.lastError = String(e && e.message || e); state.features = null; try { window.dispatchEvent(new Event('chr:account-me')); } catch (e905) {} return state.me; });
  }
  function loginWithCredential(cred) {
    return api('/auth/google', 'POST', { credential: cred }).then(function (j) {
      if (j && j.ok) { state.me = { accountId: j.accountId, entitlement: j.entitlement, status: j.status }; writeMark(state.me); location.reload(); return true; }
      setGateMsg('ログインできませんでした（' + ((j && j.errorCode) || 'error') + '）。もう一度お試しください。');
      return false;
    });
  }
  function logout() {
    return api('/auth/logout', 'POST', {}).catch(function () {}).then(function () { state.me = null; clearMark(); });
  }

  /* ---- 6. ログイン画面（この origin だけ） ---- */
  var gateEl = null;
  function ensureGate() {
    if (gateEl || !document.body) return gateEl;
    gateEl = document.createElement('div');
    gateEl.id = 'f893-gate';
    gateEl.setAttribute('role', 'dialog');
    gateEl.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(10,10,14,.94);color:#eee;display:none;align-items:center;justify-content:center;font-family:system-ui,sans-serif;padding:16px';
    gateEl.innerHTML = '<div style="max-width:360px;width:100%;text-align:center"><div style="font-size:20px;margin-bottom:12px">Chronicle</div><div id="f893-msg" style="font-size:14px;line-height:1.6;margin-bottom:16px"></div><div id="f893-btn" style="display:flex;justify-content:center;min-height:44px"></div><button id="f893-out" type="button" style="display:none;margin-top:16px;background:none;border:1px solid #666;color:#ccc;border-radius:6px;padding:6px 12px">別のアカウントでログイン</button></div>';
    document.body.appendChild(gateEl);
    gateEl.querySelector('#f893-out').onclick = function () { logout().then(function () { location.reload(); }); };
    return gateEl;
  }
  function setGateMsg(t) { var g = ensureGate(); if (g) g.querySelector('#f893-msg').textContent = t; }
  var gisLoaded = false;
  function renderGoogleButton() {
    var g = ensureGate(); if (!g) return;
    var go = function () {
      try {
        window.google.accounts.id.initialize({ client_id: CLIENT_ID, callback: function (r) { if (r && r.credential) loginWithCredential(r.credential); }, auto_select: false, use_fedcm_for_prompt: true });
        window.google.accounts.id.renderButton(g.querySelector('#f893-btn'), { theme: 'filled_black', size: 'large', text: 'signin_with', locale: 'ja' });
      } catch (e) { setGateMsg('ログインボタンを表示できませんでした。再読み込みしてください。'); }
    };
    if (window.google && window.google.accounts && window.google.accounts.id) return go();
    if (gisLoaded) return;
    gisLoaded = true;
    var s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = go;
    s.onerror = function () { setGateMsg('ログイン部品を読み込めませんでした。通信状態を確認して再読み込みしてください。'); };
    document.head.appendChild(s);
  }
  function showGate(kind) {
    var run = function () {
      var g = ensureGate(); if (!g) return;
      g.style.display = 'flex';
      var out = g.querySelector('#f893-out');
      if (kind === 'entitlement') { setGateMsg('ログインしました。このアカウントはまだ利用の準備ができていません（招待待ち）。'); out.style.display = ''; g.querySelector('#f893-btn').innerHTML = ''; }
      else { setGateMsg(kind === 'expired' ? 'ログインの有効期限が切れました。もう一度ログインしてください。' : 'Google アカウントでログインしてください。'); out.style.display = 'none'; renderGoogleButton(); }
    };
    if (document.body) run(); else document.addEventListener('DOMContentLoaded', run);
  }
  function hideGate() { if (gateEl) gateEl.style.display = 'none'; }

  /* ---- 7. ■fix897: ホームの「ログアウト」（GPT ACCOUNT_IDENTITY_P2_20260927_17 / Gate 7B）
     この origin では旧ログイン UI（fix328 設定欄・home f663）が無効化されているため、
     利用可能（PLAY）な account でログイン中の利用者がログアウトする手段が無かった。
     既存の logout()（POST /api/auth/logout → cookie 消去 → mark 消去）を呼ぶボタンを
     ホームの #loginState の直後に 1 つだけ置く。新しい認証経路は作らない。
     ・ホーム以外（物語画面）には出さない（#loginState が無い）。二重生成しない（id で判定）。
     ・押下 → 二度押し防止 → logout() → reload（ログイン画面が出る）。
     kill: localStorage v292Dfix897Off='1' → 何も描かない。 */
  /* ■fix897（GPT _18 Q2）: STALE_LOGIN_STATUS_TEXT。server 認証済み（refreshMe で PLAY を確認）の時だけ、
     旧 #loginState（旧トークン基準で「未ログイン」と描く）と招待文言 #v888invite を表示制御で隠す。
     origin では判定しない。node・handler は触らない（display のみ、自分が隠したものだけ戻す）。 */
  var F897_STALE_IDS = ['loginState', 'v888invite'];
  function staleUi897(hide) {
    try {
      if (lsGet('v292Dfix897Off') === '1') return;
      F897_STALE_IDS.forEach(function (id) {
        var e = document.getElementById(id); if (!e) return;
        if (hide) { if (e.getAttribute('data-f897h') !== '1') { e.setAttribute('data-f897h', '1'); e.style.display = 'none'; } }
        else if (e.getAttribute('data-f897h') === '1') { e.removeAttribute('data-f897h'); e.style.display = ''; }
      });
    } catch (e) {}
  }
  function unrenderLogout897() {
    try { var b = document.getElementById('f897-account'); if (b && b.parentNode) b.parentNode.removeChild(b); } catch (e) {}
    staleUi897(false);
  }
  function renderLogout897() {
    try {
      if (lsGet('v292Dfix897Off') === '1') return;
      var run = function () {
        try {
          if (document.getElementById('f897-account')) return;
          var anchor = document.getElementById('loginState');
          if (!anchor || !anchor.parentNode) return;
          var box = document.createElement('div');
          box.id = 'f897-account';
          box.style.cssText = 'margin-top:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11px;line-height:1.5';
          var label = document.createElement('span');
          label.style.cssText = 'opacity:.75';
          label.textContent = 'Google アカウントでログイン中';
          var btn = document.createElement('button');
          btn.id = 'f897-logout'; btn.type = 'button'; btn.textContent = 'ログアウト';
          btn.style.cssText = 'font-size:11px;padding:3px 10px;border:1px solid rgba(127,127,160,.55);border-radius:6px;background:transparent;color:inherit;cursor:pointer';
          btn.onclick = function () {
            if (btn.disabled) return;
            btn.disabled = true; btn.textContent = 'ログアウトしています…';
            logout().then(function () { location.reload(); });
          };
          box.appendChild(label); box.appendChild(btn);
          anchor.parentNode.insertBefore(box, anchor.nextSibling);
        } catch (e) {}
        staleUi897(true);
      };
      if (document.body) run(); else document.addEventListener('DOMContentLoaded', run);
    } catch (e) {}
  }

  window.__v292Dfix893 = { active: true, loggedIn: loggedIn, me: function () { return state.me || readMark(); }, serverMe: function () { return state.me; }, features: function () { return state.features; }, refreshMe: refreshMe, logout: logout, loginWithCredential: loginWithCredential, status: function () { return { active: true, checked: state.checked, me: state.me, features: state.features, mark: readMark(), lastError: state.lastError }; } };
  refreshMe();
})();
