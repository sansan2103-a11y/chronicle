// =====================================================================
// Chronicle TRPG - v292Dfix890: ANON_GATE_YIELD_V2
//   (hotfix 20260920-sp14h / incident: candidate/sp14_g8post_v1.md E1 CRITICAL_FAIL + E2 FAIL)
//   ★v2 = GPT 裁定 SP14H (OFFLINE_IMPLEMENTATION_GO) の必須条件 1・2・4 を入れた版。
// ---------------------------------------------------------------------
// ■ 何が起きたか（実測・g8post §2）
//   sp14 が live になったあと、まっさらな匿名訪問者は 1 ターンも遊べない。
//   worker v44.1 は publicAnon:1 を返し、fix886 は入口を 2 つ開けている
//   （設定パネルの自動 open の抑止・送信ゲートの番兵）のに、
//   v292Dfix328-google-login.js が player 画面に入って約 5.8 秒後、
//   全画面 overlay #g250-gate を被せる。z-index 99999 / inset:0 / pointer-events:auto。
//   その結果、物語を始めるボタンも送信ボタンも click が通らない。
//
//   fix328 側の条件（:363）は
//       shouldGate() = enabled() && workerReady && !!purl() && !ppass() && !valid()
//   で、匿名訪問者では 4 つとも真になる。fix886 の中に g250 / fix328 の記述は 0 件で、
//   この 3 枚目の板は fix886 の宣言した作用範囲の外に居た。
//
// ■ v1 → v2 で変えたこと（裁定の必須条件）
//   ①【0-frame】「出た板を後から閉じる」をやめた。**showGate が撃つ前に封じる**。
//      v1 は MutationObserver で除去していたが、それは「1 frame は出る」設計である。
//      v2 は 3 段で、上 2 つが発火前の抑止:
//        (a) style … head に #g250-gate{display:none!important} を入れる。
//            **paint の前に効く**ので、万一 node が作られても 1 frame も見えない。
//        (b) placeholder … body に <div id="g250-gate" hidden> を **先に置く**。
//            fix328 の showGate は冒頭で getElementById('g250-gate') を見て
//            在れば return する（:366）ので、**本物の板は二度と作られない**。
//            hideGate（:385）が placeholder を remove したら observer が即座に置き直す。
//        (c) MutationObserver ＋ 1 秒掃引 … (a)(b) の取りこぼしの保険（fallback）。
//      ★provisional（暫定）相 … 匿名かどうかの答え（fix886 の probe）は通信を 1 往復
//        待つ。実測では fix328 の checkWorker の方が先に返ることがあり、
//        「答えを待ってから封じる」と数 frame の窓が開く。そこで
//        **credential が 1 つも無い訪問者にかぎり、答えが出るまで (a) の style だけ**を
//        先に掛ける。placeholder は置かない＝ fix328 は従来どおり本物の板を作る。
//        答えが publicAnon:0 だった / 上限 2.5 秒を過ぎたら **style を外すだけ**で、
//        その瞬間に本物の板がそのまま見える（node には一切触っていない）。
//        この暫定の抑止は publicAnon:0 の訪問者に対して
//        「probe の往復ぶん（実測 60 ms 程度・最大 2.5 秒）板が遅れて出る」という形で現れる。
//        隠さずに書く。fix328 の state machine は 1 バイトも変わらない。
//   ②【presence-only】匿名判定を worker の chrPubNoAuth と同じ境界にした。
//      合言葉 / Google token / story session / code の **どれかが「在る」だけ**で譲らない。
//      **期限切れ・壊れている token も「在る」**として扱う。
//      client 側で壊れた credential を匿名へ格下げしない（downgrade しない）。
//      → v1 は Google token を fix328 と同じ valid() 相当で見ていた。v2 はやめた。
//   ④ 案内の文面を変更。Google ログインだけでは allow 台帳に無ければ 403 になるので、
//      「続きが保存されます」は不正確だった。
//
// ■ 作用する条件（全部真のときだけ。1 つでも偽なら 1 バイトも作用しない）
//   1. 匿名経路が開いている … fix886 の api.probeState().anon === 1
//      （fix886 がまだ probe 前 / 居ないときは、同じ cache key を同じ形で読む。fix886:110-116）
//   2. credential が 1 つも無い（presence-only・下記 4 key/param のどれも「在る」と言わない）
//   3. proxy URL が在る
//
// ■ 壊さない約束
//   NO_FIX328_EDIT  … fix328 の byte を 1 文字も変えない。v292GoogleLoginOff も書かない。
//   CARD_KEPT       … 設定パネル内の Google カード #g250-settings は生かす（むしろ届くようにする）。
//   NO_DOWNGRADE    … 期限切れ / 壊れた credential を匿名として扱わない。
//   LS_WRITE_1      … localStorage へ書くのは v292Dfix890NoticeSeen の 1 key だけ。
//   NO_NETWORK      … 自分では 1 本も通信しない（匿名判定は fix886 の結果と cache を読むだけ）。
//   NO_STATIC_DOM   … index.html の静的 DOM・文言・style を書き換えない。
//
// 検証口: window.__v292Dfix890 = { version, status(), stats, api }
// kill:  localStorage[v292Dfix890] = 0   → 何もしない（fix328 は sp14 と同じ挙動に戻る）
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix890) return;
  var TAG = '[v292Dfix890:anon-gate-yield]';
  var VERSION = 'v292Dfix890-20260920-sp14h-v2.0';

  var GATE_ID   = 'g250-gate';
  var CARD_ID   = 'g250-settings';
  var DEV_FOLD  = 'v880-dev';
  var DEV_SEC   = 'v880-sec-dev';
  var OV_ID     = 'settingsOv';
  var NOTICE_ID = 'v890-notice';
  var OPEN_ID   = 'v890-open';
  var CLOSE_ID  = 'v890-x';
  var STYLE_ID  = 'v292Dfix890-css';
  var PH_ATTR   = 'data-v890-ph';

  var LS_KILL   = 'v292Dfix890';
  var LS_SEEN   = 'v292Dfix890NoticeSeen';
  var LS_PROBE  = 'v292Dfix886Probe';

  var SWEEP_MS  = 1000;      /* fix328 の最短 timer（renderUI 3 秒）より細かい */
  var FAST_MS   = 120;       /* 起動直後だけの細かい掃引（E2 と provisional の解除を見つける） */
  var E2_MS     = 3000;      /* fix890 が動き出してから 3 秒。これを過ぎたら E2 の判定はしない */
  var PROV_MS   = 2500;      /* 暫定の style 抑止の上限。過ぎたら外す */
  var PROBE_TTL = 600000;    /* fix886:55 の TTL と同じ 10 分 */

  /* ★player に出る文字列はこの 2 つだけ。 */
  var COPY  = '招待済みの方はGoogleログインでクラウド保存できます';
  var XLABEL = '閉じる';
  /* paint 前に効かせる 1 規則。node を消さずに 0-frame を保証する側。 */
  var CSS_RULE = '#g250-gate{display:none!important;visibility:hidden!important;pointer-events:none!important}';

  var T0 = Date.now();
  /* ★この page の読み込みが始まった時刻。実測（headless Chromium・sp14h の 308 本の script）では
     index.html:2814 の自動 open は約 0.33 秒に起き、fix890（最後の script）が動き出すのは
     約 1.4 秒だった。つまり marker は fix890 より先に立つ。
     「起動直後のものか」を T0 で測ると必ず外すので、navigation 開始時刻で測る。 */
  var NAV0 = (function(){
    try {
      if (window.performance && typeof window.performance.now === 'function') return Date.now() - window.performance.now();
    } catch(e){}
    return T0;
  })();

  var stats = { sweeps: 0, styleOn: 0, styleOff: 0, placeholder: 0, gateRemoved: 0, observed: 0,
                provArmed: 0, provReleased: 0, noticeShown: 0, noticeDismissed: 0,
                cardMoved: 0, foldsOpened: 0, loginRedirect: 0, e2Closed: 0, settled0: 0, stopped: 0 };

  /* ---------------- localStorage ---------------- */
  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function lss(k, v){ try { localStorage.setItem(k, v); } catch(e){} }
  function off(){ return lsg(LS_KILL) === '0'; }

  /* ---------------- 既存の読み手と同じ読み方 ---------------- */
  function purl(){ var v = lsg('v292ProxyUrl'); return (v || '').trim().replace(/\/+$/, ''); }

  /* ★★presence-only（裁定 SP14H 必須条件 2）
     worker の chrPubNoAuth は「ヘッダが在るだけで匿名判定を外す」。client 側の譲り判定も
     同じ境界に揃える。**値の中身は見ない・期限も見ない・壊れていても「在る」**。
     壊れた / 期限切れの credential を匿名へ格下げしないための規則であり、
     fix328 の valid()（:54）とは **わざと違う**。 */
  function present(k){
    var v = lsg(k);
    if (v === null || v === undefined) return false;
    var s = String(v).trim();
    return !!(s && s !== 'null' && s !== 'undefined' && s !== '{}' && s !== '[]');
  }
  function codeInUrl(){
    try {
      var c = new URLSearchParams(location.search).get('code');
      return !!(c && String(c).trim());
    } catch(e){ return false; }
  }
  /* 「在る」と言った理由を返す（'' = 1 つも無い） */
  function credPresent(){
    if (present('v292ProxyPass')) return 'pass';          /* 合言葉 / アクセスコード（fix328:33） */
    if (present('v292GoogleToken')) return 'google';      /* 期限切れ・壊れていても在る（fix328:51） */
    if (present('v292Dfix837_sess')) return 'session';    /* 長寿命 session（fix328:74 / fix886:82） */
    if (codeInUrl()) return 'code-url';                   /* ?code= の配布リンク（fix328:305 の経路） */
    return '';
  }

  function f886(){ try { var o = window.__v292Dfix886; return (o && o.api) ? o.api : null; } catch(e){ return null; } }

  /* 匿名経路が開いているか。1 = 開 / 0 = 閉 / null = まだ分からない */
  function anonProbe(){
    var a = f886();
    if (a){
      try { if (a.isOff()) return 0; } catch(e){}
      try { var p = a.probeState(); if (p && p.done) return (p.anon === 1) ? 1 : 0; } catch(e){}
    }
    try {
      var o = JSON.parse(lsg(LS_PROBE) || 'null');
      if (o && typeof o.at === 'number' && (Date.now() - o.at) < PROBE_TTL && (o.anon === 0 || o.anon === 1)) return o.anon;
    } catch(e){}
    return null;
  }

  /* 本番の譲り条件 */
  function active(){
    if (off()) return false;
    if (!purl()) return false;
    if (credPresent()) return false;
    return anonProbe() === 1;
  }
  /* 暫定相: credential が 1 つも無く、まだ publicAnon:0 と確定していない間だけ */
  var provUntil = 0, provOn = false;
  function provisional(){
    if (off()) return false;
    if (credPresent()) return false;
    if (anonProbe() === 0) return false;
    if (active()) return false;                 /* 本番に上がったら暫定ではない */
    return Date.now() < provUntil;
  }

  /* ---------------- ① (a) style：paint 前に効く抑止 ---------------- */
  function styleOn(){
    try {
      if (document.getElementById(STYLE_ID)) return false;
      var head = document.head || document.getElementsByTagName('head')[0] || document.documentElement;
      if (!head) return false;
      var s = document.createElement('style');
      s.id = STYLE_ID;
      s.setAttribute('type', 'text/css');
      s.appendChild(document.createTextNode(CSS_RULE));
      head.appendChild(s);
      stats.styleOn++;
      return true;
    } catch(e){ return false; }
  }
  function styleOff(){
    try {
      var s = document.getElementById(STYLE_ID);
      if (!s || !s.parentNode) return false;
      s.parentNode.removeChild(s);
      stats.styleOff++;
      return true;
    } catch(e){ return false; }
  }

  /* ---------------- ① (b) placeholder：showGate を発火前に封じる ---------------- */
  function isOurs(n){ try { return !!(n && n.getAttribute && n.getAttribute(PH_ATTR) === '1'); } catch(e){ return false; } }
  function placeholder(){
    if (!active()) return false;
    if (!document.body) return false;
    var g = null;
    try { g = document.getElementById(GATE_ID); } catch(e){}
    if (g){
      if (isOurs(g)) return false;                       /* もう在る */
      /* 本物が先に出来ていた（我々が本番に上がる前の 1 往復ぶん）。畳んでから外す。 */
      try { g.style.display = 'none'; } catch(e){}
      try { if (g.parentNode) g.parentNode.removeChild(g); } catch(e){}
      stats.gateRemoved++;
    }
    try {
      var d = document.createElement('div');
      d.id = GATE_ID;                                    /* ★fix328:366 はこの id が在れば return する */
      d.setAttribute(PH_ATTR, '1');
      d.setAttribute('aria-hidden', 'true');
      d.hidden = true;
      d.style.cssText = 'display:none!important';
      document.body.appendChild(d);
      stats.placeholder++;
      return true;
    } catch(e){ return false; }
  }
  function removePlaceholder(){
    try {
      var g = document.getElementById(GATE_ID);
      if (g && isOurs(g) && g.parentNode){ g.parentNode.removeChild(g); return true; }
    } catch(e){}
    return false;
  }

  /* ---------------- ① (c) MutationObserver（fallback） ---------------- */
  var mo = null;
  function observe(){
    if (mo) return false;
    try {
      if (!document.body || typeof window.MutationObserver !== 'function') return false;
      mo = new window.MutationObserver(function(recs){
        var touched = false, i, j, n, L;
        for (i = 0; i < recs.length; i++){
          L = recs[i].addedNodes;
          for (j = 0; L && j < L.length; j++){ n = L[j]; if (n && n.nodeType === 1 && n.id === GATE_ID) touched = true; }
          L = recs[i].removedNodes;
          for (j = 0; L && j < L.length; j++){ n = L[j]; if (n && n.nodeType === 1 && n.id === GATE_ID) touched = true; }
        }
        if (!touched) return;
        stats.observed++;
        /* 本物が入った / placeholder が hideGate に消された、のどちらでも同じ手当て */
        placeholder();
      });
      /* fix328 は document.body.appendChild(ov) で直付けする（:377）。直下だけ見れば足りる。 */
      mo.observe(document.body, { childList: true });
      return true;
    } catch(e){ mo = null; return false; }
  }
  function unobserve(){ try { if (mo) mo.disconnect(); } catch(e){} mo = null; }

  /* ---------------- ② ログイン導線 ---------------- */
  function seen(){ return lsg(LS_SEEN) === '1'; }

  function uiRef(){
    try { if (typeof UI !== 'undefined' && UI) return UI; } catch(e){}
    try { return window.UI || null; } catch(e){}
    return null;
  }

  /* #g250-settings が届く位置に居ることを保証する（作用は本番相のときだけ）。
     ★なぜ要るか: fix884 は #cfgProxyPass247 の .fld を #v880-dev（開発者向けの details）へ移す。
       fix328 の renderUI（:267-274）はその .fld の直前にカードを差し込むので、移動が先だと
       カードごと #v880-dev の中に入る。fix880 の applyDevGate（:155-162）は開発者モードが
       off のとき #v880-dev に display:none !important を付けるので、カードが丸ごと消える。 */
  function ensureCardReachable(){
    if (!active()) return false;
    var card = null, dev = null;
    try { card = document.getElementById(CARD_ID); } catch(e){}
    if (!card) return false;
    try { dev = document.getElementById(DEV_FOLD); } catch(e){}
    if (dev && dev !== card && dev.contains && dev.contains(card)){
      var sec = null;
      try { sec = document.getElementById(DEV_SEC); } catch(e){}
      var anchor = (sec && sec.parentNode && sec.parentNode === dev.parentNode) ? sec : dev;
      try { if (anchor.parentNode){ anchor.parentNode.insertBefore(card, anchor); stats.cardMoved++; } } catch(e){}
    }
    var n = card.parentNode, guard = 0;
    while (n && n.nodeType === 1 && guard++ < 16){
      try {
        if (n.tagName === 'DETAILS' && n.id !== DEV_FOLD && n.open !== true){ n.open = true; stats.foldsOpened++; }
      } catch(e){}
      n = n.parentNode;
    }
    return true;
  }

  function openLogin(){
    try { ensureCardReachable(); } catch(e){}
    try {
      var ui = uiRef();
      /* reason 無しの open。fix886 の wrapper は key-missing だけを見るので素通りする。 */
      if (ui && typeof ui.openSettings === 'function') ui.openSettings();
      else { var ov = document.getElementById(OV_ID); if (ov && ov.classList) ov.classList.add('open'); }
    } catch(e){}
    try { ensureCardReachable(); } catch(e){}
  }

  function dismiss(){
    lss(LS_SEEN, '1');
    removeNotice();
    stats.noticeDismissed++;
  }
  function removeNotice(){
    try { var d = document.getElementById(NOTICE_ID); if (d && d.parentNode) d.parentNode.removeChild(d); } catch(e){}
  }
  function noticeSlot(){
    try {
      var c = document.getElementById('composer');
      if (c){
        var r = c.querySelector ? c.querySelector('.inp-row') : null;
        return { parent: c, before: r || c.firstChild };
      }
    } catch(e){}
    try {
      var t = document.getElementById('topbar');
      if (t && t.parentNode) return { parent: t.parentNode, before: t.nextSibling };
    } catch(e){}
    try { if (document.body) return { parent: document.body, before: document.body.firstChild }; } catch(e){}
    return null;
  }
  function ensureNotice(){
    if (!active() || seen()) return false;
    var d = null;
    try { d = document.getElementById(NOTICE_ID); } catch(e){}
    if (d) return false;
    var slot = noticeSlot();
    if (!slot || !slot.parent) return false;
    try {
      d = document.createElement('div');
      d.id = NOTICE_ID;
      d.setAttribute('role', 'status');
      d.setAttribute('aria-live', 'polite');
      /* 流し込みの 1 行。overlay ではないので、押さないかぎり何も遮らない。 */
      d.style.cssText = 'display:flex;align-items:center;gap:8px;margin:0 0 6px;padding:6px 10px;'
        + 'border:1px solid rgba(127,127,160,.35);border-radius:8px;background:rgba(127,127,160,.10);'
        + 'font:12px/1.6 system-ui,sans-serif;color:inherit';

      var b = document.createElement('button');
      b.id = OPEN_ID;
      b.type = 'button';
      b.style.cssText = 'flex:1 1 auto;min-width:0;text-align:left;background:transparent;border:0;'
        + 'padding:0;margin:0;color:inherit;font:inherit;text-decoration:underline;cursor:pointer';
      b.textContent = COPY;
      b.addEventListener('click', function(ev){ try { ev.preventDefault(); } catch(e){} openLogin(); }, false);

      var x = document.createElement('button');
      x.id = CLOSE_ID;
      x.type = 'button';
      x.setAttribute('aria-label', XLABEL);
      x.style.cssText = 'flex:0 0 auto;background:transparent;border:0;padding:0 2px;margin:0;'
        + 'color:inherit;opacity:.65;font:inherit;cursor:pointer';
      x.textContent = '✕';
      x.addEventListener('click', function(ev){ try { ev.preventDefault(); } catch(e){} dismiss(); }, false);

      d.appendChild(b);
      d.appendChild(x);
      slot.parent.insertBefore(d, slot.before || null);
      stats.noticeShown++;
      return true;
    } catch(e){ return false; }
  }

  /* fix328 の login API は showGate() を呼ぶ（:409）。本番相ではその板を封じているので、
     そのまま呼ばせると **押しても何も起きないボタン**になる。行き先だけ設定パネルへ差し替える
     （fix328 の byte は変えない。runtime の 1 プロパティだけ）。 */
  var loginWrapped = false;
  function wrapLogin(){
    if (loginWrapped) return false;
    var api = null;
    try { api = window.__v292Dfix328api; } catch(e){}
    if (!api || typeof api.login !== 'function') return false;
    if (api.login.__v890){ loginWrapped = true; return false; }
    var prev = api.login;
    var w = function(){
      try { if (active()){ stats.loginRedirect++; openLogin(); return undefined; } } catch(e){}
      return prev.apply(this, arguments);
    };
    w.__v890 = true;
    w.__v890prev = prev;
    api.login = w;
    loginWrapped = true;
    return true;
  }
  function unwrapLogin(){
    var api = null;
    try { api = window.__v292Dfix328api; } catch(e){}
    if (!api || !api.login || !api.login.__v890) return false;
    api.login = api.login.__v890prev;
    loginWrapped = false;
    return true;
  }

  /* ---------------- ③ E2（起動由来の key-missing 自動 open を 1 度だけ閉じる） ---------------- */
  var e2Done = false, userOpened = false, sawKeyMissing = false;
  var wrapped = false;

  function wrapUi(){
    if (wrapped) return false;
    var ui = uiRef();
    if (!ui || typeof ui.openSettings !== 'function') return false;
    if (ui.openSettings.__v890){ wrapped = true; return false; }
    var prev = ui.openSettings;
    var w = function(reason){
      try {
        if (reason === 'key-missing') sawKeyMissing = true;
        else userOpened = true;                 /* 人が開いたものには触らない */
      } catch(e){}
      return prev.apply(this, arguments);
    };
    w.__v890 = true;
    w.__v890prev = prev;
    ui.openSettings = w;
    wrapped = true;
    return true;
  }
  function unwrapUi(){
    var ui = uiRef();
    if (!ui || !ui.openSettings || !ui.openSettings.__v890) return false;
    ui.openSettings = ui.openSettings.__v890prev;
    wrapped = false;
    return true;
  }

  function e2Tick(){
    if (e2Done || userOpened) return false;
    if ((Date.now() - T0) > E2_MS){ e2Done = true; return false; }
    if (!active()) return false;
    var km = null;
    try { km = window.__v292Dfix854KeyMissing; } catch(e){}
    /* 証拠は 2 つ。index.html:2562 が立てる marker か、こちらの wrapper が観測した reason。
       marker は window の値なので、この page の読み込み以外のものは入り得ない。 */
    if (!(typeof km === 'number' && km >= (NAV0 - 1000)) && !sawKeyMissing) return false;
    var ov = null;
    try { ov = document.getElementById(OV_ID); } catch(e){}
    if (!ov || !ov.classList || !ov.classList.contains('open')) return false;
    try {
      var ui = uiRef();
      if (ui && typeof ui.closeSettings === 'function') ui.closeSettings();
      else ov.classList.remove('open');
    } catch(e){}
    e2Done = true;
    stats.e2Closed++;
    return true;
  }

  /* ---------------- 掃引 ---------------- */
  var iv = null, fast = null, stopped = false;

  /* 本番相を降りる（credential が出来た / kill / publicAnon:0）。
     fix328 が従来どおり板を出せる状態へ戻す。 */
  function disarm(why){
    var ch = false;
    if (removePlaceholder()) ch = true;
    if (styleOff()) ch = true;
    if (unwrapLogin()) ch = true;
    removeNotice();
    provOn = false;
    if (ch){ try { console.log(TAG, 'disarmed (' + (why || '') + ')'); } catch(e){} }
    return ch;
  }
  function stopAll(why){
    if (stopped) return false;
    stopped = true;
    try { if (iv) clearInterval(iv); } catch(e){}
    try { if (fast) clearInterval(fast); } catch(e){}
    iv = null; fast = null;
    disarm(why);
    unobserve();
    unwrapUi();
    stats.stopped++;
    try { console.log(TAG, 'stopped (' + (why || '') + ')'); } catch(e){}
    return true;
  }

  function sweep(){
    stats.sweeps++;
    if (off()){ stopAll('kill'); return false; }
    var p = anonProbe();
    /* 匿名経路が閉じていると確定した（この page life では覆らない） → 暫定 style を外して畳む */
    if (p === 0){ stats.settled0++; if (provOn){ stats.provReleased++; } stopAll('publicAnon:0'); return false; }
    var c = credPresent();
    /* credential が出来た（カードからログインした等） → 以後は作用 0。ただし畳まない:
       ログアウトすれば fix328 はまた板を出すので、そこでまた譲ってもらう必要がある。 */
    if (c){ disarm('credential:' + c); return false; }

    if (active()){
      if (provOn){ provOn = false; }          /* 暫定から本番へ昇格（style はそのまま残す） */
      styleOn();                               /* (a) 0-frame の保険 */
      placeholder();                           /* (b) showGate を発火前に封じる */
      e2Tick();
      ensureNotice();
      ensureCardReachable();
      wrapLogin();
      return true;
    }

    /* 暫定相 */
    if (provisional()){
      if (!provOn){ provOn = true; stats.provArmed++; }
      styleOn();
      return true;
    }
    if (provOn){                                /* 上限を過ぎた → style を外すだけ。node は無傷 */
      provOn = false; stats.provReleased++;
      styleOff();
      try { console.log(TAG, 'provisional window closed — fix328 behaves as before'); } catch(e){}
    }
    return false;
  }

  /* ---------------- boot ---------------- */
  function boot(){
    if (off()){ try { console.log(TAG, 'disabled (v292Dfix890=0)'); } catch(e){} return false; }
    var c = credPresent();
    /* credential を 1 つでも持っている利用者には最初から 1 バイトも作用しない */
    if (c){ try { console.log(TAG, 'inert (credential present: ' + c + ')'); } catch(e){} return false; }
    if (anonProbe() === 0){ try { console.log(TAG, 'inert (publicAnon:0)'); } catch(e){} return false; }

    /* ★ここが 0-frame の要。fix328 の boot は同じ DOMContentLoaded で先に走り、
       checkWorker の 1 往復を待ってから showGate する。こちらは **同期で** style を入れる。 */
    provUntil = Date.now() + PROV_MS;
    if (!active()){ provOn = true; stats.provArmed++; }
    styleOn();
    observe();
    wrapUi();
    wrapLogin();
    sweep();
    try { iv = setInterval(sweep, SWEEP_MS); } catch(e){}
    try {
      fast = setInterval(function(){
        if (stopped) return;
        sweep();
        if ((Date.now() - T0) > Math.max(E2_MS, PROV_MS)){ try { clearInterval(fast); } catch(e){} fast = null; }
      }, FAST_MS);
    } catch(e){}
    try { console.log(TAG, 'armed'); } catch(e){}
    return true;
  }

  window.__v292Dfix890 = {
    version: VERSION,
    stats: stats,
    status: function(){
      var g = null, n = false, s = false;
      try { g = document.getElementById(GATE_ID); } catch(e){}
      try { n = !!document.getElementById(NOTICE_ID); } catch(e){}
      try { s = !!document.getElementById(STYLE_ID); } catch(e){}
      return { off: off(), active: active(), prov: provOn, anon: anonProbe(), url: !!purl(),
               cred: credPresent(), seen: seen(),
               gate: !!g, gateIsPlaceholder: isOurs(g), style: s, notice: n,
               wrapped: wrapped, loginWrapped: loginWrapped, stopped: stopped,
               e2Done: e2Done, userOpened: userOpened, sawKeyMissing: sawKeyMissing,
               ageMs: Date.now() - T0, armedAtMs: Math.round(T0 - NAV0) };
    },
    api: {
      isOff: off, active: active, provisional: provisional, anonProbe: anonProbe,
      credPresent: credPresent, present: present, codeInUrl: codeInUrl,
      purl: purl, seen: seen,
      styleOn: styleOn, styleOff: styleOff, placeholder: placeholder, removePlaceholder: removePlaceholder,
      isOurs: isOurs, observe: observe, unobserve: unobserve,
      ensureNotice: ensureNotice, removeNotice: removeNotice, dismiss: dismiss,
      openLogin: openLogin, ensureCardReachable: ensureCardReachable,
      wrapUi: wrapUi, unwrapUi: unwrapUi, wrapLogin: wrapLogin, unwrapLogin: unwrapLogin,
      e2Tick: e2Tick, sweep: sweep, boot: boot, disarm: disarm, stopAll: stopAll,
      COPY: COPY, XLABEL: XLABEL, CSS_RULE: CSS_RULE,
      GATE_ID: GATE_ID, STYLE_ID: STYLE_ID, NOTICE_ID: NOTICE_ID, LS_SEEN: LS_SEEN
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
