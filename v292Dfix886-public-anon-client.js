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
// ■ v1 → v2（sp14i part C / incident: candidate/sp14h_g8post_v1.md §5）
//   live の実測で **1 UI ターンが上流 POST を 3–4 本食っていた**:
//     t=10932 POST#1（本文生成）… 応答が返らない
//     t=43119 POST#2（同じ本文生成の再送。差 +32,187 ms）→ 200 @61496
//     t=61600 POST#3（会話ログ genConvLog）→ 200
//     t=62316 POST#4（補助生成）→ **429 anon-daily**
//   その結果、worker の匿名 1 日バケットは **UI 1 ターンで尽きる**。
//   内訳の特定（client の byte を読んで確かめた）:
//     ・**client 側に 32 s の定数は 1 つも無い。** 本文生成の abort は index.html:1804 の
//       150 s である。+32.2 s は「上流が約 30.2 s で切れた」＋「client の透過 retry の
//       待ち 2,000 ms」の和である。
//     ・その透過 retry は **index.html:3027（v292Dfix265 / v292Dfix269）**:
//         catch -> /HTTP 5xx|Failed to fetch|NetworkError|load failed/ なら
//         2,000 ms（429 なら 8,000 ms）待って Api.call をもう 1 度呼ぶ。
//       途中に v292Dfix80-gen-gate-retry.js の failResp()（fix502）が挟まると、
//       throw が合成 503 に化けてこの分岐へ確実に入る。
//     ・fix80 自身の MAX=3 ループは、匿名経路では **ほぼ効かない**:
//       内側 fix80 は fix886 が書き換えたあとの URL（<proxy>/openrouter.ai）を見るので
//       isCompletion が偽になり素通し、外側 fix80 は予算 owner ではないので
//       owner-miss を検知してその場で結果を返す。本 v2 の予算 cap (ii) は保険である。
//     ・POST#3/#4 は本文 200 のあとに走る **補助生成**（会話ログ genConvLog /
//       引用の話者照会 attribQuotes218 / 校正系）である。
//   v2 は **匿名経路が開いているときだけ**、1 UI ターン = 上流 1 本に固定する:
//     (i)  補助生成を上流へ出さない。★v2.1（Fable 裁定 C）: **黙って捨てるのではなく、
//          G.genConvLog が担っていた「会話ログの行」を client 側で同等に補う**。
//          localSays() が本文から 「」『』 の発話を抜き、直前に現れた登場人物名へ割り当てる
//          （who 24 字 / say 80 字 / 上限 24 件 = genConvLog の後段フィルタと同じ刻み）。
//          G.attribQuotes218 -> {}（話者の再照会。補えないが、表示行は localSays が出す）。
//          ★補えない残り（開示）: 上流の helper は 「」 の無い悲鳴・呻き（「……ぁ」等）も
//          拾えるが、localSays は引用符のある発話しか見えない。
//     (ii) fix80 の共通予算（init.__chronicleAttemptBudget）を **1 本**へ絞る（保険）。
//     (iii) 匿名 POST に **90 秒**の AbortController を付ける（E3 実測の典型 4 s を十分覆う）。
//     (iv) ★実体はここ。1 ターン 2 本目以降の text POST は上流へ出さず、1 本目の結果で答える
//          （失敗ターンは同じ status/body を replay ＝ 文面が食い違わない。
//            成功ターンは空 content ＝ 補助生成が黙って no-op に落ちる）。
//   ★(iv) は **fetch と XHR の両方**に掛かる（実測で XHR 経由の抜け道が 3 ターンあたり 2 本あった）。
//   認証経路は 1 バイトも変わらない（すべて active() の内側。active() は v1 と同じ）。
//   待ちの可視化は既存のまま: UI.setLoading(true) が送信ボタンを無効化し
//   「物語を紡いでいます…」を出し続ける（retry を止めても無言にはならない）。
//   kill: localStorage[v292Dfix886TurnOff]='1' → (i)〜(iv) だけ止まる（v1 の挙動へ戻る）。
//
// 検証口: window.__v292Dfix886 = { version, api }
// kill:  localStorage[v292Dfix886Off] = 1   → sp11a と同じ挙動へ戻る
//        localStorage[v292PublicAiOff] = 1  → lane 一括停止（以後の同 lane patch も同じ鍵）
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix886) return;
  var TAG = '[v292Dfix886:public-anon]';
  var VERSION = 'v292Dfix886-20260921-sp16r-v2.2';

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
  /* ---- v2 part C ---- */
  var LS_TURN_OFF = 'v292Dfix886TurnOff';   /* C 脚だけの kill（読むだけ・書かない） */
  var BUDGET_KEY  = '__chronicleAttemptBudget';  /* fix80/fix494 の共通予算 object の key */
  var ANON_TIMEOUT_MS = 90000;              /* 匿名 POST の上限。E3 実測の典型は約 4 s */
  /* 1 ターン 2 本目以降に返す合成 body。choices[0].message.content は空文字なので、
     会話ログ生成・話者照会・校正のどれも「何も採れなかった」として黙って落ちる。 */
  var EMPTY_BODY = '{"choices":[{"message":{"content":""},"finish_reason":"stop"}]}';

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
  /* ★sp16(C-4): sticky=true のとき自動で消さない。枯渇（anon-daily）は「一時的な失敗」ではなく
     「今日の終わり」であり、12 秒で消えると player は読み終える前に見失う。
     node も id も他の style も足さない（同じ 1 面を使い回す = 面は 1 つのまま）。 */
  function notice(text, sticky){
    var t = String(text == null ? '' : text);
    if (!t) return false;
    try {
      var d = document.getElementById(NOTICE_ID);
      if (!d){
        d = document.createElement('div');
        d.id = NOTICE_ID;
        d.setAttribute('role', 'status');
        d.setAttribute('aria-live', 'polite');
        d.style.cssText = 'position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));transform:translateX(-50%);max-width:92vw;padding:10px 16px;border-radius:10px;background:rgba(20,20,24,.92);color:#fff;font-size:14px;line-height:1.6;z-index:99999;cursor:pointer';
        d.addEventListener('click', function(){ try { d.style.display = 'none'; } catch(e){} });
        var host = document.body || document.documentElement;
        if (host) host.appendChild(d);
      }
      d.textContent = t;
      d.style.display = '';
      if (d.__t) { try { clearTimeout(d.__t); } catch(e){} d.__t = null; }
      if (!sticky) d.__t = setTimeout(function(){ try { d.style.display = 'none'; } catch(e){} }, NOTICE_MS);
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
    /* ★sp16(C-4): 枯渇だけは自動で消さない。それ以外は従来どおり NOTICE_MS で消える。 */
    return notice(line, code === 'anon-daily');
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

  /* ---------------- v2 part C: 1 UI ターン = 上流 1 本 ---------------- */
  var turn = { n: 0, posts: 0, blocked: 0, aux: 0, timeouts: 0, capped: 0, last: null };
  function turnOff(){ return lsg(LS_TURN_OFF) === '1'; }
  function turnOn(){ return !off() && !turnOff(); }
  function gRef(){
    try { if (typeof G !== 'undefined' && G) return G; } catch(e){}
    try { return window.G || null; } catch(e){}
    return null;
  }
  /* 合成 Response。Response が無い環境でも読み手が使う形だけは満たす。 */
  function synth(status, body){
    var b = String(body == null ? '' : body);
    try {
      if (typeof Response === 'function')
        return new Response(b, { status: status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
    } catch(e){}
    var o = { ok: (status >= 200 && status < 300), status: status, statusText: '',
              text: function(){ return Promise.resolve(b); },
              json: function(){ try { return Promise.resolve(JSON.parse(b)); } catch(x){ return Promise.reject(x); } } };
    o.clone = function(){ return o; };
    return o;
  }
  /* XHR を上流へ出さずに、同じターンの 1 本目の答えで完了させる。
     readyState / status / responseText は prototype の accessor を own property で影にする。 */
  function xhrReplay(x, status, body){
    try {
      var def = function(k, v){
        try { Object.defineProperty(x, k, { value: v, configurable: true, writable: true }); }
        catch(e){ try { x[k] = v; } catch(e2){} }
      };
      def('readyState', 4); def('status', status); def('statusText', '');
      def('responseText', body); def('response', body);
      try { def('responseURL', mapText()); } catch(e){}
      try { if (typeof x.onreadystatechange === 'function') x.onreadystatechange(); } catch(e){}
      try { if (typeof x.dispatchEvent === 'function' && typeof Event === 'function') x.dispatchEvent(new Event('readystatechange')); } catch(e){}
      try { if (typeof x.onload === 'function') x.onload(); } catch(e){}
      try { if (typeof x.dispatchEvent === 'function' && typeof Event === 'function') x.dispatchEvent(new Event('load')); } catch(e){}
      try { if (typeof x.onloadend === 'function') x.onloadend(); } catch(e){}
    } catch(e){}
  }
  /* ターンの 1 本目の結果を覚える（2 本目以降の答えに使う）。本文は読み捨てない clone から取る。 */
  function record(res){
    try {
      var st = (res && res.status) || 0, ok = !!(res && res.ok);
      if (!res || typeof res.clone !== 'function'){ turn.last = { ok: ok, status: st, body: EMPTY_BODY }; return; }
      res.clone().text().then(function(t){ turn.last = { ok: ok, status: st, body: t }; })['catch'](function(){
        turn.last = { ok: ok, status: st, body: '{}' };
      });
    } catch(e){}
  }
  /* fix80（v292Dfix80-gen-gate-retry.js）の共通予算を 1 本へ絞る＝ auto-retry を無効化。
     ★object を作り直さず **その場で書き換える**。外側の fix80 層は同じ object の sent を
     見て owner-miss を判定するので、別 object に差し替えると誤検知させてしまう。 */
  function capBudget(oo){
    try {
      var b = oo[BUDGET_KEY];
      if (b && typeof b === 'object'){
        if (typeof b.remaining !== 'number' || b.remaining > 1) b.remaining = 1;
        b.limit = 1;
      } else {
        oo[BUDGET_KEY] = { remaining: 1, sent: 0, limit: 1 };
      }
      turn.capped++;
      return true;
    } catch(e){ return false; }
  }
  /* 匿名 POST の 90 秒上限。呼び出し側の signal は殺さず、両方を見る。 */
  function armTimeout(oo){
    var ctrl = null;
    try { ctrl = (typeof AbortController === 'function') ? new AbortController() : null; } catch(e){ ctrl = null; }
    if (!ctrl) return null;
    var prev = null;
    try { prev = oo.signal || null; } catch(e){ prev = null; }
    try { oo.signal = ctrl.signal; } catch(e){ return null; }
    var tid = null;
    try { tid = setTimeout(function(){ try { turn.timeouts++; ctrl.abort(); } catch(e){} }, ANON_TIMEOUT_MS); } catch(e){}
    try {
      if (prev){
        if (prev.aborted) ctrl.abort();
        else if (typeof prev.addEventListener === 'function')
          prev.addEventListener('abort', function(){ try { ctrl.abort(); } catch(e){} });
      }
    } catch(e){}
    return function(){ try { if (tid !== null) clearTimeout(tid); } catch(e){} };
  }

  /* --- (a) UI ターンの境界。すべての UI ターンは G.submit() を通る
         （startScene / cont / retry はいずれも this.submit() を呼ぶ）。 --- */
  var turnWrapped = false;
  function wrapTurn(){
    if (turnWrapped || !turnOn()) return false;
    var g = gRef();
    if (!g || typeof g.submit !== 'function') return false;
    if (g.submit.__v886t){ turnWrapped = true; return false; }
    var prev = g.submit;
    var w = function(){
      try {
        /* ★新しい UI ターンの境界は「**飛んでいない** submit」だけである。
           index.html:2985 の if (S.inFlight) return; で戻る呼び出し（UI の二重押し、
           fix138 の続き等）で counter を reset すると、**飛んでいるターンに
           上流 1 本を余分に許してしまう**（D-2 で実測：3 ターンで 5 本）。 */
        var st0 = stRef();
        if (active() && !(st0 && st0.inFlight)){ turn.n++; turn.posts = 0; turn.last = null; }
      } catch(e){}
      return prev.apply(this, arguments);
    };
    w.__v886t = true; w.__v886tprev = prev;
    g.submit = w; turnWrapped = true;
    return true;
  }
  function unwrapTurn(){
    var g = gRef();
    if (!g || !g.submit || !g.submit.__v886t) return false;
    g.submit = g.submit.__v886tprev; turnWrapped = false; return true;
  }

  /* --- (b-0) ★v2.1 compensation: G.genConvLog が担っていた会話ログ行を、上流へ出さずに作る。
         genConvLog の契約は「登場キャラがこの瞬間に実際に声に出したもの」なので、本文中の
         「」『』 の発話がその中核である。話者は直前に現れた登場人物名（fix173/207 と同じ
         「本文に出てくる呼び名」規則）。刻みは genConvLog の後段と同じ 24 字 / 80 字 / 24 件。 --- */
  function castNames(){
    var out = [];
    try {
      var st = stRef(); var c = (st && st.cast) || {};
      if (c.hero && c.hero.name) out.push(String(c.hero.name));
      if (Object.prototype.toString.call(c.npcs) === '[object Array]')
        for (var i = 0; i < c.npcs.length; i++) if (c.npcs[i] && c.npcs[i].name) out.push(String(c.npcs[i].name));
    } catch(e){}
    return out;
  }
  function nearestName(before, names){
    var best = '', at = -1;
    for (var i = 0; i < names.length; i++){
      if (!names[i]) continue;
      var k = before.lastIndexOf(names[i]);
      if (k > at){ at = k; best = names[i]; }
    }
    return best;
  }
  /* cast に名前が無い／本文の呼び名が cast に無いとき、fix173/207 と同じ
     「本文で使われている呼び名をそのまま使う」規則で、発話の直前の語を話者にする。
     正規表現を使わずに 1 文字ずつ戻る（読む側が挙動を追えるように）。 */
  var STOP = [' ', '\u3000', '\u3001', '\u3002', '\uff01', '\uff1f', '!', '?', '\u300c', '\u300d',
              '\u300e', '\u300f', '\uff08', '\uff09', '(', ')', '\n', '\r', '\t', '\u2015', '\u2026'];
  function tokenBefore(before){
    try {
      var s = String(before == null ? '' : before), out = '', i, ch;
      for (i = s.length - 1; i >= 0 && out.length < 12; i--){
        ch = s.charAt(i);
        if (STOP.indexOf(ch) >= 0) break;
        out = ch + out;
      }
      return out.replace(/(\u306f|\u304c|\u3082|\u3068|\u306e)$/, '');
    } catch(e){}
    return '';
  }
  function localSays(narr){
    var out = [];
    try {
      var text = String(narr == null ? '' : narr).replace(/<[^>]+>/g, '');
      var names = castNames();
      var hero = names.length ? names[0] : '';
      var re = /[「『]([^」』]{1,200})[」』]/g;
      var m, last = '';
      while ((m = re.exec(text)) !== null && out.length < 24){
        var say = String(m[1]).replace(/s+/g, ' ').trim();
        if (!say) continue;
        var ctx = text.slice(Math.max(0, m.index - 80), m.index);
        /* 話者の選び方（開示：これは heuristic であって、上流 helper の推論と同じでは無い）:
           1. 発話の直前 16 字に登場人物名が在るならそれ（「<名前>が「…」」の形）
           2. 無ければ直前の語（fix173/207 の「本文の呼び名」規則）
           3. それも無ければ 80 字窓の登場人物名 → 直前の話者 → 主人公 */
        var tail = ctx.slice(Math.max(0, ctx.length - 16));
        var who = nearestName(tail, names) || tokenBefore(ctx) || nearestName(ctx, names) || last || hero;
        if (!who) continue;
        last = who;
        out.push({ who: String(who).slice(0, 24), say: say.slice(0, 80) });
      }
    } catch(e){ return []; }
    return out;
  }

  /* --- (b) 補助生成を匿名では上流へ出さない（(b-0) で同等の行を補う） --- */
  var auxWrapped = false;
  function wrapAux(){
    if (auxWrapped || !turnOn()) return false;
    var g = gRef();
    if (!g) return false;
    var done = 0;
    try {
      if (typeof g.genConvLog === 'function'){
        if (g.genConvLog.__v886a) done++;
        else {
          var p1 = g.genConvLog;
          var w1 = function(narr){ try { if (active()){ turn.aux++; return Promise.resolve(localSays(narr)); } } catch(e){} return p1.apply(this, arguments); };
          w1.__v886a = true; w1.__v886aprev = p1; g.genConvLog = w1; done++;
        }
      }
    } catch(e){}
    try {
      if (typeof g.attribQuotes218 === 'function'){
        if (g.attribQuotes218.__v886a) done++;
        else {
          var p2 = g.attribQuotes218;
          var w2 = function(){ try { if (active()){ turn.aux++; return Promise.resolve({}); } } catch(e){} return p2.apply(this, arguments); };
          w2.__v886a = true; w2.__v886aprev = p2; g.attribQuotes218 = w2; done++;
        }
      }
    } catch(e){}
    if (done >= 2) auxWrapped = true;
    return done > 0;
  }
  function unwrapAux(){
    var g = gRef(), k = 0;
    if (!g) return false;
    try { if (g.genConvLog && g.genConvLog.__v886a){ g.genConvLog = g.genConvLog.__v886aprev; k++; } } catch(e){}
    try { if (g.attribQuotes218 && g.attribQuotes218.__v886a){ g.attribQuotes218 = g.attribQuotes218.__v886aprev; k++; } } catch(e){}
    auxWrapped = false;
    return k > 0;
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
          /* ★v2 part C (iv): このターンは上流 1 本をもう使った。2 本目以降は外へ出さない。
             失敗ターンは 1 本目と同じ status/body を replay する（画面の文面が食い違わない）。
             成功ターンは空 content を返す（補助生成が黙って no-op に落ちる）。 */
          if (turnOn() && turn.posts >= 1){
            turn.blocked++;
            var L = turn.last;
            /* ★v2.1: このターンの 1 本目の答えを **そのまま replay する**（成否を問わない）。
               失敗ターン → 同じ status/body なので画面の文面が食い違わない。
               成功ターン → 同じ本文が返るので、同一ターン内の書き直し
               （index.html:3057 fix235）や _cmfTry が **ターンを落とさずに** 成立する。
               ★空 content を返していた v2.0 はここでターンを 1 つ落としていた（D-4 で検出）。 */
            if (L) return Promise.resolve(synth(L.status || 503, L.body || '{}'));
            return Promise.resolve(synth(200, EMPTY_BODY));
          }
          var oo = {}, k;
          if (o) for (k in o) oo[k] = o[k];
          oo.headers = anonHeaders();
          var clear = null;
          if (turnOn()){
            turn.posts++;
            capBudget(oo);          /* (ii) fix80 の auto-retry を無効化 */
            clear = armTimeout(oo); /* (iii) 90 秒 */
          }
          var r = _fetch.call(this, mapText(), oo);
          if (r && typeof r.then === 'function') return r.then(function(res){
            try { if (clear) clear(); } catch(e){}
            try { if (turnOn()) record(res); } catch(e){}
            watch(res);
            return res;
          }, function(err){
            try { if (clear) clear(); } catch(e){}
            /* 1 本目が throw した（通信断・abort）。ターンの結果は「失敗」として覚える。
               body は空 object にする＝画面には汎用文が出る（新しい文言を 1 つも増やさない）。 */
            try { if (turnOn()) turn.last = { ok: false, status: 503, body: '{}' }; } catch(e2){}
            throw err;
          });
          try { if (clear) clear(); } catch(e){}
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
        /* ★v2.1 part C: **fetch と XHR は同じターン予算を共有する**。
           ここを開けておくと「1 ターン = 上流 1 本」が XHR 経由で抜ける
           （実測: 3 ターンで fetch 3 本 ー XHR 2 本 = 5 本だった）。 */
        if (this.__v886 && turnOn() && turn.posts >= 1){
          turn.blocked++;
          var self = this, L = turn.last;
          var stt = (L && L.status) || 200, body = (L && L.body) || EMPTY_BODY;
          setTimeout(function(){ xhrReplay(self, stt, body); }, 0);
          return undefined;
        }
        if (this.__v886 && turnOn() && !this.__v886c){ this.__v886c = true; turn.posts++; }
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
  function tick(){ try { wrapUi(); sentinel(); wrapTurn(); wrapAux(); } catch(e){} }
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
      turnOff: turnOff, turnOn: turnOn, wrapTurn: wrapTurn, unwrapTurn: unwrapTurn,
      wrapAux: wrapAux, unwrapAux: unwrapAux, capBudget: capBudget, armTimeout: armTimeout,
      synth: synth, record: record, localSays: localSays, castNames: castNames, tokenBefore: tokenBefore,
      turnState: function(){ return { n: turn.n, posts: turn.posts, blocked: turn.blocked,
                                      aux: turn.aux, timeouts: turn.timeouts, capped: turn.capped,
                                      last: turn.last ? { ok: turn.last.ok, status: turn.last.status } : null,
                                      wrapped: turnWrapped, auxWrapped: auxWrapped, on: turnOn() }; },
      BUDGET_KEY: BUDGET_KEY, ANON_TIMEOUT_MS: ANON_TIMEOUT_MS, EMPTY_BODY: EMPTY_BODY,
      LS_TURN_OFF: LS_TURN_OFF,
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
