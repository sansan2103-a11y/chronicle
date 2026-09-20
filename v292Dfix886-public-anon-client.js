// =====================================================================
// Chronicle TRPG - v292Dfix886: PUBLIC_ANON_CLIENT_V1
//   (lane PUBLIC_AI_ACCESS / sp12 / GPT 裁定 #PUBLIC_AI_ACCESS G6 G7 G8)
// ---------------------------------------------------------------------
// ★★ACTIVATION: WAIT_V44_LIVE_GREEN / BUNDLED_WITH_SP10B_SP11A
//   worker v44.0-public-anon が live GREEN になるまで production では意味を持たない。
//   その前に配っても inert（下の publicAnon 判定で 0 になるため）。
//
// ■ これは何か
//   worker v44 の匿名経路（認証情報が 1 つも無い本文生成）の client 側。
//   既定 ON・ただし **root JSON の publicAnon が 1 のときだけ**動く。
//   それ以外（0／取得失敗／URL 未設定／認証あり／kill）では **1 バイトも作用しない**
//   ＝ sp11a（v43 期）の挙動がそのまま残る。設定パネルの自動 open も従来どおり起きる。
//
// ■ 4 つの作用（全部 runtime patch。静的 DOM 編集は 0）
//   1. 端末 id … localStorage v292AnonId に 32 桁の hex を 1 個だけ持つ。
//      crypto.getRandomValues 由来。意味のある値は入れない（worker が HMAC して bucket にする）。
//   2. transport … 本文生成の宛先だけを proxy へ向け、x-chronicle-anon を付ける。
//      Authorization / x-chronicle-pass / x-google-id / x-chronicle-session は **1 本も付けない**
//      （worker 側 chrPubNoAuth は ヘッダが在るだけで匿名判定を外すため）。
//      セーブ・管理・画像の経路には 1 度も触らない（NEVER_RE でも二重に塞ぐ）。
//   3. 入口の開放 … 鍵が無いことを理由にした設定パネルの自動 open を抑止し、
//      送信ゲートを通す。ゲート通過は fix247 と同じ手（cfg の番兵充填）で行う。
//      ★番兵はメモリだけに置き、保存はしない（localStorage への書込は id と probe cache だけ）。
//   4. 文面 … 429 / 400 / 502 のとき、server の error をそのまま出す。
//      errorCode は **絶対に画面へ出さない**（内部の理由コード）。
//
// ■ 合言葉の導線について（意図的な不採用・開示）
//   anon-daily のとき「コードを持っている人は設定から入れられる」旨の hint を添える案は、
//   (a) その入力欄 #cfgProxyPass247 が sp10B / fix884 で【開発者向け】の中へ移っており
//       player からは到達できない（codesUi() が実測で false を返す）
//   (b) その日本語文面は PUBLIC_COPY_TECH_LEAK_LINT の語彙表に当たる
//   の 2 点から **この版では出さない**。将来 lint 済み文面が決まったら
//   window.__v292Dfix886Hint に文字列を入れるだけで、codesUi() が true のときだけ出る。
//
// ■ 壊さない約束
//   NO_STATIC_DOM   … index.html の DOM・文言・style を静的に書き換えない。
//   NO_AUTH_MIX     … 認証情報が 1 つでも在れば作用しない（匿名 downgrade の逆も作らない）。
//   NO_CLOUD_SAVE   … 匿名プレイは端末ローカルのみ。保存経路には触らず、新しい error 文面も出さない。
//   LS_WRITE_2      … localStorage へ書くのは v292AnonId と v292Dfix886Probe の 2 key だけ。
//   NO_BYOK_RESTORE … fix884 の BYOK dev fold は動かさない（匿名は BYOK の代替ではない）。
//
// 検証口: window.__v292Dfix886 = { version, api }
// kill:  localStorage[v292Dfix886Off] = 1   → sp11a と同じ挙動へ戻る
//        localStorage[v292PublicAiOff] = 1  → lane 一括停止（以後の同 lane patch も同じ鍵）
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix886) return;
  var TAG = '[v292Dfix886:public-anon]';
  var VERSION = 'v292Dfix886-20260919-sp12-v1.0';

  var LS_ANON  = 'v292AnonId';
  var LS_PROBE = 'v292Dfix886Probe';
  var TTL      = 600000;          /* root JSON の cache 寿命 10 分 */
  var HOLD_MS  = 6000;            /* probe を待って自動 open を保留できる上限 */
  var NOTICE_MS = 12000;
  var ID_RE    = /^[A-Za-z0-9._:-]{8,64}$/;
  var TEXT_MARK = 'openrouter.ai/api/v1/chat/completions';
  var TEXT_PATH = '/openrouter.ai';
  var NOTICE_ID = 'v886notice';
  var CODE_FIELD = 'cfgProxyPass247';
  var DEV_HOST = 'v880-dev';
  /* 触ってはいけない経路。regex リテラルで持つ（文字列にしない）。 */
  var NEVER_RE = /\/(?:save|admin|image|inspect|avatar-[a-z]+)(?:[\/?#]|$)/;
  var STATUS_WATCH = [400, 429, 502, 503];

  /* ---------------- localStorage ---------------- */
  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function lss(k, v){ try { localStorage.setItem(k, v); } catch(e){} }
  function off(){ return lsg('v292Dfix886Off') === '1' || lsg('v292PublicAiOff') === '1'; }

  /* ---------------- 既存の読み手と同じ読み方（fix247 / fix841 と同一） ---------------- */
  function purl(){ var v = lsg('v292ProxyUrl'); return (v || '').trim().replace(/\/+$/, ''); }
  function ppass(){ var v = lsg('v292ProxyPass'); return (v || '').trim(); }
  function gid(){ try { return (window.__chronicleGoogleId && window.__chronicleGoogleId()) || ''; } catch(e){ return ''; } }
  function sess(){
    try {
      if (lsg('v292Dfix841Off') === '1') return '';
      if (typeof window.__chronicleSessionId === 'function'){ try { return window.__chronicleSessionId() || ''; } catch(e){ return ''; } }
      if (lsg('v292Dfix837Off') === '1') return '';
      var o = JSON.parse(lsg('v292Dfix837_sess') || 'null');
      if (o && o.sid && o.ts && (Date.now() - o.ts) < 604800000) return String(o.sid);
    } catch(e){}
    return '';
  }
  function hasAuth(){ return !!(ppass() || gid() || sess()); }

  /* ---------------- 端末 id ---------------- */
  function mkId(){
    var b = null, s = '', i;
    try {
      var c = window.crypto || window.msCrypto;
      if (c && typeof c.getRandomValues === 'function'){ b = new Uint8Array(16); c.getRandomValues(b); }
    } catch(e){ b = null; }
    if (!b){ b = new Uint8Array(16); for (i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256); }
    for (i = 0; i < 16; i++){ var h = b[i].toString(16); s += (h.length < 2 ? '0' + h : h); }
    return s;
  }
  function anonId(){
    var v = lsg(LS_ANON);
    if (typeof v === 'string' && v.length === 32 && ID_RE.test(v)) return v;
    v = mkId();
    lss(LS_ANON, v);
    return v;
  }

  /* ---------------- root JSON（publicAnon）---------------- */
  var probe = { anon: null, build: '', at: 0, done: false, inflight: null, source: 'none' };
  function readCache(){
    try {
      var o = JSON.parse(lsg(LS_PROBE) || 'null');
      if (o && typeof o.at === 'number' && (Date.now() - o.at) < TTL && (o.anon === 0 || o.anon === 1)) return o;
    } catch(e){}
    return null;
  }
  function settle(anon, build, source, cache){
    probe.anon = (anon === 1) ? 1 : 0;
    probe.build = build || '';
    probe.at = Date.now();
    probe.done = true;
    probe.source = source || 'net';
    if (cache !== false) lss(LS_PROBE, JSON.stringify({ at: probe.at, anon: probe.anon, build: probe.build }));
    flush();
    return probe.anon;
  }
  function fetchRoot(){
    if (off()) return null;
    if (probe.inflight) return probe.inflight;
    var u = purl();
    if (!u){ settle(0, '', 'no-url'); return null; }
    var p = null;
    try { p = _fetch.call(window, u + '/', { method: 'GET' }); } catch(e){ p = null; }
    if (!p || typeof p.then !== 'function'){ settle(0, '', 'no-transport'); return null; }
    probe.inflight = p.then(function(r){ return r.json(); }).then(function(j){
      settle((j && j.publicAnon === 1) ? 1 : 0, (j && j.workerBuild) || '', 'net');
    })['catch'](function(){ settle(0, '', 'fetch-failed'); });
    return probe.inflight;
  }

  /* ---------------- 有効判定 ---------------- */
  function active(){ return !off() && !!purl() && !hasAuth() && probe.anon === 1; }

  /* ---------------- 入口: 設定パネルの自動 open ---------------- */
  var ORIG = null, wrapped = false, pending = null, introDone = false, held = 0;
  function uiRef(){
    try { if (typeof UI !== 'undefined' && UI) return UI; } catch(e){}
    try { return window.UI || null; } catch(e){}
    return null;
  }
  function stRef(){
    try { if (typeof S !== 'undefined' && S) return S; } catch(e){}
    try { return window.S || null; } catch(e){}
    return null;
  }
  function intro(){
    if (introDone) return false;
    introDone = true;
    try { var ui = uiRef(); if (ui && typeof ui._showIntro === 'function') ui._showIntro(); } catch(e){}
    return true;
  }
  function flush(){
    var p = pending;
    if (!p) return false;
    pending = null;
    if (active()){ intro(); return true; }
    try { if (ORIG) ORIG.apply(p.self, p.args); } catch(e){}
    return true;
  }
  function wrapUi(){
    if (wrapped || off()) return false;
    var ui = uiRef();
    if (!ui || typeof ui.openSettings !== 'function') return false;
    if (ui.openSettings.__v886) { wrapped = true; return false; }
    ORIG = ui.openSettings;
    var w = function(reason){
      try {
        if (reason === 'key-missing' && !off()){
          if (probe.done){
            if (active()){ intro(); return undefined; }
          } else {
            pending = { self: this, args: arguments };
            held++;
            return undefined;
          }
        }
      } catch(e){}
      return ORIG.apply(this, arguments);
    };
    w.__v886 = true;
    w.__v886orig = ORIG;
    ui.openSettings = w;
    wrapped = true;
    return true;
  }
  function unwrapUi(){
    var ui = uiRef();
    if (!ui || !ui.openSettings || !ui.openSettings.__v886) return false;
    ui.openSettings = ui.openSettings.__v886orig;
    wrapped = false;
    return true;
  }

  /* ---------------- 入口: 送信ゲート（番兵 cfg・メモリのみ） ---------------- */
  var sentCount = 0;
  function sentinel(){
    if (!active()) return false;
    var st = stRef();
    if (!st || !st.cfg) return false;
    var ch = false;
    if (!st.cfg.orKey){ st.cfg.orKey = '__proxy__'; ch = true; }
    if (st.cfg.provider !== 'openrouter'){ st.cfg.provider = 'openrouter'; ch = true; }
    if (ch) sentCount++;
    return ch;
  }

  /* ---------------- 文面 ---------------- */
  var shown = 0, lastShown = '';
  function codesUi(){
    try {
      var n = document.getElementById(CODE_FIELD);
      if (!n) return false;
      while (n && n.nodeType === 1){
        if (n.id === DEV_HOST) return false;
        if (n.getAttribute && n.getAttribute('data-v15-dev')) return false;
        if (n.hidden) return false;
        var s = n.style;
        if (s && (s.display === 'none' || s.visibility === 'hidden')) return false;
        n = n.parentNode;
      }
      return true;
    } catch(e){ return false; }
  }
  function notice(text){
    var t = String(text == null ? '' : text);
    if (!t) return false;
    try {
      var d = document.getElementById(NOTICE_ID);
      if (!d){
        d = document.createElement('div');
        d.id = NOTICE_ID;
        d.setAttribute('role', 'status');
        d.setAttribute('aria-live', 'polite');
        d.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:92vw;padding:10px 16px;border-radius:10px;background:rgba(20,20,24,.92);color:#fff;font-size:14px;line-height:1.6;z-index:99999;cursor:pointer';
        d.addEventListener('click', function(){ try { d.style.display = 'none'; } catch(e){} });
        var host = document.body || document.documentElement;
        if (host) host.appendChild(d);
      }
      d.textContent = t;
      d.style.display = '';
      if (d.__t) { try { clearTimeout(d.__t); } catch(e){} }
      d.__t = setTimeout(function(){ try { d.style.display = 'none'; } catch(e){} }, NOTICE_MS);
      lastShown = t;
      shown++;
      return true;
    } catch(e){ return false; }
  }
  /* server の error を **そのまま** 出す。errorCode は 1 度も渡さない。 */
  function render(payload, status){
    var copy = (payload && typeof payload.error === 'string') ? payload.error.trim() : '';
    if (!copy) return false;
    var code = (payload && typeof payload.errorCode === 'string') ? payload.errorCode : '';
    var line = copy;
    if (code === 'anon-daily' && codesUi()){
      var h = window.__v292Dfix886Hint;
      if (typeof h === 'string' && h) line = copy + ' ' + h;
    }
    void status;
    return notice(line);
  }
  function watch(res){
    try {
      if (!res || res.ok) return false;
      if (STATUS_WATCH.indexOf(res.status) < 0) return false;
      if (typeof res.clone !== 'function') return false;
      var st = res.status;
      res.clone().json().then(function(j){ render(j, st); })['catch'](function(){});
      return true;
    } catch(e){ return false; }
  }

  /* ---------------- transport ---------------- */
  function isText(u){
    if (typeof u !== 'string' || !u) return false;
    if (NEVER_RE.test(u)) return false;
    return u.indexOf(TEXT_MARK) !== -1;
  }
  function mapText(){ return purl() + TEXT_PATH; }
  function wouldAttach(u){ return isText(u) && active(); }
  function anonHeaders(){ return { 'Content-Type': 'application/json', 'x-chronicle-anon': anonId() }; }

  /* ★kill は「作用しない」ではなく「wrap しない」まで戻す。
     off() のときは fetch も XHR も 1 つも包まない（harness B-1 / B-2 が実測で固定）。 */
  var KILLED = off();

  var _fetch = null;
  try { _fetch = window.fetch; } catch(e){ _fetch = null; }
  if (!KILLED && typeof _fetch === 'function'){
    window.fetch = function(u, o){
      try {
        if (wouldAttach(u)){
          var oo = {}, k;
          if (o) for (k in o) oo[k] = o[k];
          oo.headers = anonHeaders();
          var r = _fetch.call(this, mapText(), oo);
          if (r && typeof r.then === 'function') return r.then(function(res){ watch(res); return res; });
          return r;
        }
      } catch(e){}
      return _fetch.apply(this, arguments);
    };
    window.fetch.__v886 = true;
  }

  var _open = null, _setH = null, _send = null;
  try {
    _open = XMLHttpRequest.prototype.open;
    _setH = XMLHttpRequest.prototype.setRequestHeader;
    _send = XMLHttpRequest.prototype.send;
  } catch(e){ _open = null; }
  if (!KILLED && _open && _setH && _send){
    XMLHttpRequest.prototype.open = function(method, u){
      try {
        this.__v886 = false;
        if (wouldAttach(u)){ this.__v886 = true; arguments[1] = mapText(); }
      } catch(e){}
      return _open.apply(this, arguments);
    };
    XMLHttpRequest.prototype.setRequestHeader = function(name){
      try { if (this.__v886 && String(name).toLowerCase() === 'authorization') return undefined; } catch(e){}
      return _setH.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function(){
      try {
        if (this.__v886 && !this.__v886h){
          this.__v886h = true;
          _setH.call(this, 'x-chronicle-anon', anonId());
        }
      } catch(e){}
      return _send.apply(this, arguments);
    };
  }

  /* ---------------- boot ---------------- */
  var ticker = null;
  function tick(){ try { wrapUi(); sentinel(); } catch(e){} }
  function boot(){
    if (off()){ try { console.log(TAG, 'disabled (v292Dfix886Off / v292PublicAiOff)'); } catch(e){} return false; }
    var c = readCache();
    if (c){ probe.anon = c.anon; probe.build = c.build || ''; probe.at = c.at; probe.done = true; probe.source = 'cache'; }
    wrapUi();
    if (!probe.done) fetchRoot();
    tick();
    try { ticker = setInterval(tick, 1500); } catch(e){}
    try {
      setTimeout(function(){
        if (pending && !probe.done){ probe.done = true; probe.anon = 0; probe.source = 'hold-timeout'; flush(); }
      }, HOLD_MS);
    } catch(e){}
    try { console.log(TAG, 'armed'); } catch(e){}
    return true;
  }

  window.__v292Dfix886 = {
    version: VERSION,
    api: {
      isOff: off, active: active, hasAuth: hasAuth,
      anonId: anonId, newId: mkId, ID_RE: ID_RE,
      probe: fetchRoot, readCache: readCache, settle: settle,
      probeState: function(){ return { anon: probe.anon, build: probe.build, done: probe.done, source: probe.source }; },
      isTextRoute: isText, mapText: mapText, wouldAttach: wouldAttach, headers: anonHeaders,
      NEVER_RE: NEVER_RE, TEXT_PATH: TEXT_PATH, TEXT_MARK: TEXT_MARK,
      sentinel: sentinel, wrapUi: wrapUi, unwrapUi: unwrapUi, flush: flush,
      codesUi: codesUi, render: render, notice: notice, watch: watch,
      boot: boot, tick: tick,
      state: function(){
        return { wrapped: wrapped, sentinel: sentCount, shown: shown, last: lastShown,
                 pending: !!pending, held: held, anon: probe.anon, intro: introDone, ticker: !!ticker };
      }
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
