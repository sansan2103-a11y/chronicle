// =====================================================================
// Chronicle TRPG - v292Dfix491: アイコン生成の無料GETフォールバック (v2・GPT監査反映)
// ---------------------------------------------------------------------
// 背景(2026-07-19実測・読取専用ハーネス):
//   gen.pollinations.ai の POST API(課金キー経路)が上流障害でハング(>90s)。
//   fix481全端末ON+管理config=pollinationsで全アイコン生成がそこへ固定され
//   フォールバック無し → fix476候補40sタイムアウト→候補0→「↻しても変わらない」。
//   同時刻に image.pollinations.ai の無料GET(2.8s)と together(0.9s)は健在。
//
// 本fixは fetch境界で、アイコン生成POST(runId無しのもの)に自前タイムアウト(18s)を
// 掛け、時間切れ/ネットワーク例外/429/5xx のとき image.pollinations.ai の無料GETへ
// 1回だけ切替え、b64化した合成200を返す。
//
// ★GPT監査(2026-07-19)の条件を反映:
//   1. 位置 = fix478より外側・fix476より内側(index.htmlで fix478 → fix491 → fix476)。
//      無料GET失敗をfix478が再試行しない/自前abortはfix478bが再試行しない。
//   2. run経路の候補(body.runIdあり)は不触。候補応答はcandidateId必須のため
//      合成200を返しても破棄される=無駄打ちになる。runId無しの最後の砦
//      (fix476 no-candidates素通し)と旧経路だけを救う。
//   3. Abortの3分類: 親signal abort=フォールバックせず即reject /
//      自前POSTタイムアウト=フォールバック可 / 無料GETタイムアウト=reject。
//      timer/listenerはfinallyで必ず解除。
//   4. 絶対deadline: start+34s。無料GET予算=min(12s, deadline-now-4s余白)。
//      3s未満ならフォールバックしない(後段のb64化・検品の時間を確保)。
//   5. 画像実体検証: Content-Type image/* + b64マジック(PNG/JPEG/GIF/WebP)。
//   6. 偽画像(注文無視の同一画像)対策: b64のSHA-256を記録し、異なるprompt+seedで
//      同一SHAが再来したら破棄+ブレーカ加算。検品(fix476)も引き続き有効。
//   7. サーキットブレーカ: フォールバック失敗/偽画像が計3回でセッション内停止。
//   8. 無料GETは直列(同時1本・最小間隔1200ms)でレート制限回避。
//   9. ★GPT再監査(2周目)反映: 親signalの無い呼び出し(=下流にfix476の検品が無い
//      run最後の砦/旧経路)では、フォールバック画像を自前で /inspect に掛け、
//      pass時のみ採用。検品不能/不合格なら破棄(未検品画像はキャッシュへ入れない)。
//      親signalのある呼び出し(fix476旧経路の候補)は下流のfix476が検品するため二重検品しない。
// ★v3(2026-07-19): Worker v28(freeFallback:true)検知で自動退避。arm後に proxyBase()+'/' を
//   GETし root JSON の freeFallback===true なら serverFb=true=以後サーバ側へ委譲
//   (サーバ側フォールバック最長30sが自前18sより遅いための衝突回避)。
// ★v4(2026-07-19・GPT監査③): (重大1)serverFb時は対象POSTに fbOwner:'server' を付与(run有無問わず)。
//   サーバはfbOwner有りだけフォールバックし全分岐でfbOwnerを削除=上流に漏らさない。serverFb=falseでは付けない。
//   (重大2)serverFb時も非run(runId無し)のフォールバック応答(pollinations-free)は完全素通しにせず、
//   親signal無し(=下流に検品が無い)なら自前inspectFallbackに掛け、fail/検品不能は502で旧画像へ復帰させる。
// ---------------------------------------------------------------------
// 有効化(opt-in・既定OFF): localStorage.v292Dfix491OnV1==='1' かつ v292Dfix491Off!=='1'
// 冪等ガード: window.__v292Dfix491.__armed
// 検証口: window.__v292Dfix491 = { isAvatarGen, buildFreeUrl, stats, status,
//          __postTimeoutMs, __getTimeoutMs, __breakerMax (テスト差替可) }
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix491 && window.__v292Dfix491.__armed) return;   // 二重arm禁止
  var TAG = '[v292Dfix491:freefb]';

  var POST_TIMEOUT_MS = 18000;   // 課金POSTを見切る時間(GPT推奨18〜20s)
  var GET_TIMEOUT_MS  = 12000;   // 無料GETの上限
  var TOTAL_BUDGET_MS = 34000;   // 自分のdeadline(fix476の40s枠-余白)
  var RESERVE_MS      = 4000;    // 後処理(b64化・Response構築)の余白
  var GET_MIN_MS      = 3000;    // これ未満の残時間ならフォールバックしない
  var GET_GAP_MS      = 1200;    // 無料GETの最小間隔(直列化)
  var BREAKER_MAX     = 3;       // 失敗+偽画像がこの回数でセッション内停止
  var FREE_BASE = 'https://image.pollinations.ai/prompt/';

  function on(){
    try {
      if (localStorage.getItem('v292Dfix491Off') === '1') return false;
      return localStorage.getItem('v292Dfix491OnV1') === '1';
    } catch(e){ return false; }
  }

  // ---------- 対象判定(fix475/476/478/481 と同一) ----------
  function isAvatarGen(url, init){
    try {
      var u = String((url && url.url) || url || '');
      if (u.indexOf('gen.pollinations.ai/v1/images/generations') < 0 &&
          !(/workers\.dev/.test(u) && u.indexOf('/image') >= 0)) return false;
      return !!(init && init.method === 'POST' && typeof init.body === 'string');
    } catch(e){ return false; }
  }

  // ---------- 無料GET URL(fix487 SILH_URLS と同経路・同モデル) ----------
  function buildFreeUrl(body){
    var p = String((body && body.prompt) || '').slice(0, 1800);
    if (!p) return '';
    var seed = (body && body.seed != null && isFinite(body.seed)) ? (body.seed | 0) : 1;
    var wh = '384';
    try {
      var m = /^(\d{2,4})x(\d{2,4})$/.exec(String((body && body.size) || ''));
      if (m) wh = m[1];
    } catch(e){}
    return FREE_BASE + encodeURIComponent(p) +
      '?width=' + wh + '&height=' + wh + '&model=flux&nologo=true&seed=' + seed;
  }

  function abortError(){
    try { return new DOMException('Aborted', 'AbortError'); }
    catch(e){ var er = new Error('Aborted'); er.name = 'AbortError'; return er; }
  }

  // ---------- b64マジック検証(fix197 b64ToDataUrl と同じ判定表) ----------
  function b64LooksImage(b64){
    if (typeof b64 !== 'string' || b64.length < 100) return false;
    return b64.charAt(0) === '/' || b64.slice(0, 5) === 'iVBOR' ||
           b64.slice(0, 6) === 'R0lGOD' || b64.slice(0, 4) === 'UklG';
  }

  // ---------- 偽画像(同一SHA再来)検知 ----------
  var shaSeen = {};   // sha -> 最初の 'prompt先頭64|seed'
  function shaOf(b64){
    try {
      if (!(window.crypto && crypto.subtle && window.TextEncoder)) return Promise.resolve(null);
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(b64)).then(function(buf){
        var a = new Uint8Array(buf), h = '';
        for (var i = 0; i < 8; i++){ h += ('0' + a[i].toString(16)).slice(-2); }
        return h;
      }, function(){ return null; });
    } catch(e){ return Promise.resolve(null); }
  }

  var stats = { fallbacks: 0, fallbackOk: 0, fallbackFail: 0, postTimeouts: 0, post5xx: 0,
                postNetErr: 0, parentAborts: 0, dupImages: 0, breakerTrips: 0, skippedRunMode: 0, skippedNoBudget: 0, inspectPass: 0, inspectFail: 0,
                serverFbGuarded: 0, serverFbInspectFail: 0 };   // ★v4: サーバ委譲時の非run事後検品カウンタ
  var breaker = 0;
  var serverFb = false;   // ★v3: Worker v28検知フラグ。true=サーバ側フォールバックへ委譲(素通し)
  function breakerOpen(){ return breaker >= (API.__breakerMax || BREAKER_MAX); }
  function tripBreaker(why){
    breaker++;
    if (breakerOpen()){ stats.breakerTrips++; try { console.warn(TAG, 'circuit breaker OPEN (' + why + ') — 以後このセッションはフォールバック停止'); } catch(e){} }
  }

  // ---------- 無料GETの直列化 ----------
  var _gate = Promise.resolve();
  function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
  function serialized(fn){
    var run = _gate.then(fn, fn);
    _gate = run.then(function(){ return sleep(GET_GAP_MS); }, function(){ return sleep(GET_GAP_MS); });
    return run;
  }

  function blobToB64(blob){
    return new Promise(function(resolve, reject){
      try {
        var fr = new FileReader();
        fr.onload = function(){
          var d = String(fr.result || '');
          var i = d.indexOf('base64,');
          if (d.indexOf('data:image') === 0 && i > 0) resolve(d.slice(i + 7));
          else reject(new Error('not-image-dataurl'));
        };
        fr.onerror = function(){ reject(fr.error || new Error('fr-error')); };
        fr.readAsDataURL(blob);
      } catch(e){ reject(e); }
    });
  }

  var _origFetch = window.fetch;

  // ---------- ★条件9: 自前検品(下流に検品が無い経路のみ) ----------
  function proxyBase(){
    try {
      if (localStorage.getItem('v292ProxyOff') === '1') return '';
      return (localStorage.getItem('v292ProxyUrl') || '').trim().replace(/\/+$/, '');
    } catch(e){ return ''; }
  }
  function inspectHeaders(){
    var out = { 'Content-Type': 'application/json' };
    try { var g = (window.__chronicleGoogleId && window.__chronicleGoogleId()) || ''; if (g) out['x-google-id'] = g; } catch(e){}
    try { var pw = (localStorage.getItem('v292ProxyPass') || '').trim(); if (pw) out['x-chronicle-pass'] = pw; } catch(e){}
    return out;
  }
  function inspectFallback(b64, prompt){
    var base = proxyBase();
    if (!base) return Promise.reject(new Error('inspect-unavailable'));   // 検品不能=不採用
    var kind = 'human', desc = '';
    try {
      var f475 = window.__v292Dfix475;
      var d = f475 && f475.detect && f475.detect(String(prompt));
      if (d && d.kind) kind = d.kind;
      var tail = (kind === 'creature') ? (f475 && f475.STYLE6_TAIL_CREATURE) : (f475 && f475.STYLE6_TAIL);
      var t = String(prompt || '').replace(/\s+$/, '');
      if (tail && t.length >= tail.length && t.slice(t.length - tail.length) === tail){
        t = t.slice(0, t.length - tail.length).replace(/[\s,;]+$/, '');
      }
      desc = t.slice(0, 800);
    } catch(e){ desc = String(prompt || '').slice(0, 800); }
    var ac = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = ac ? setTimeout(function(){ try { ac.abort(); } catch(e){} }, 12000) : null;
    var opt = { method: 'POST', headers: inspectHeaders(), body: JSON.stringify({ images: [b64], kind: kind, desc: desc }) };
    if (ac) opt.signal = ac.signal;
    return _origFetch.call(window, base + '/inspect', opt)
      .then(function(r){
        if (!r || !r.ok) throw new Error('inspect-status-' + (r && r.status));
        return r.json();
      })
      .then(function(j){
        var res = j && Array.isArray(j.results) && j.results[0];
        if (!res || !res.pass) throw new Error('inspect-fail');
        stats.inspectPass++;
        return true;
      })
      .catch(function(err){ stats.inspectFail++; throw err; })
      .finally(function(){ if (timer) clearTimeout(timer); });
  }

  // ---------- 無料GETフォールバック本体(親signal尊重・deadline厳守) ----------
  function freeFallback(body, parentSignal, startedAt){
    stats.fallbacks++;
    return serialized(function(){
      if (parentSignal && parentSignal.aborted){ stats.parentAborts++; throw abortError(); }
      var getTo = (API && typeof API.__getTimeoutMs === 'number') ? API.__getTimeoutMs : GET_TIMEOUT_MS;
      var budget = Math.min(getTo, startedAt + TOTAL_BUDGET_MS - Date.now() - RESERVE_MS);
      if (budget < GET_MIN_MS){ stats.skippedNoBudget++; throw new Error('no-time-budget'); }
      var ac = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var onAbort = null, timer = null;
      if (ac && parentSignal){
        onAbort = function(){ try { ac.abort(); } catch(e){} };
        try { parentSignal.addEventListener('abort', onAbort, { once: true }); } catch(e){}
      }
      if (ac) timer = setTimeout(function(){ try { ac.abort(); } catch(e){} }, budget);
      var url = buildFreeUrl(body);
      if (!url) throw new Error('no-prompt');
      var opt = { method: 'GET', mode: 'cors' };
      if (ac) opt.signal = ac.signal;
      return _origFetch.call(window, url, opt)
        .then(function(r){
          if (!r || !r.ok) throw new Error('free-get-status-' + (r && r.status));
          var ct = String(r.headers.get('Content-Type') || '');
          if (!/^image\//i.test(ct)) throw new Error('free-get-not-image');
          return r.blob();
        })
        .then(blobToB64)
        .then(function(b64){
          if (parentSignal && parentSignal.aborted){ stats.parentAborts++; throw abortError(); }
          if (!b64LooksImage(b64)) throw new Error('free-get-bad-image');
          var fp = String(body.prompt || '').slice(0, 64) + '|' + body.seed;
          return shaOf(b64).then(function(sha){
            if (sha){
              if (shaSeen[sha] != null && shaSeen[sha] !== fp){
                stats.dupImages++; tripBreaker('duplicate-image');
                throw new Error('free-get-duplicate-image');   // 注文無視の同一画像 → 破棄
              }
              shaSeen[sha] = fp;
            }
            var adopt = function(){
              stats.fallbackOk++;
              try { console.info(TAG, 'free GET fallback adopted (seed=' + body.seed + ')'); } catch(e){}
              return new Response(JSON.stringify({ data: [ { b64_json: b64 } ], provider: 'pollinations-free', fallback: true }),
                { status: 200, statusText: 'OK', headers: { 'Content-Type': 'application/json; charset=utf-8' } });
            };
            if (parentSignal) return adopt();   // 下流(fix476)が検品する経路
            // 下流に検品が無い経路 → 自前検品passのみ採用(不合格/検品不能は破棄)
            return inspectFallback(b64, body.prompt).then(adopt);
          });
        })
        .catch(function(err){
          if (!(err && err.name === 'AbortError' && parentSignal && parentSignal.aborted)){
            stats.fallbackFail++;
            if (!(err && String(err.message || '').indexOf('duplicate') >= 0)) tripBreaker('fallback-fail');
          }
          try { console.info(TAG, 'abort=free-get-timeout/fail:', String((err && err.message) || err).slice(0, 80)); } catch(e){}
          throw err;
        })
        .finally(function(){
          if (timer) clearTimeout(timer);
          if (onAbort && parentSignal){ try { parentSignal.removeEventListener('abort', onAbort); } catch(e){} }
        });
    });
  }

  // ---------- 対象POSTのタイムアウト+フォールバック ----------
  function fetchWithFallback(self, url, init){
    var startedAt = Date.now();
    var parentSignal = init && init.signal;
    if (parentSignal && parentSignal.aborted) return Promise.reject(abortError());

    var body = null;
    try { body = JSON.parse(init.body); } catch(e){ body = null; }
    if (!body || !body.prompt) return _origFetch.apply(self, [url, init]);        // 形不明 → 素通し
    if (body.runId != null){ stats.skippedRunMode++; return _origFetch.apply(self, [url, init]); }  // run候補 → 不触(条件2)
    if (breakerOpen()) return _origFetch.apply(self, [url, init]);                // ブレーカ開 → 素通し

    var ac = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timedOut = false, timer = null, onAbort = null;
    var init2 = Object.assign({}, init);
    if (ac){
      init2.signal = ac.signal;
      if (parentSignal){
        onAbort = function(){ try { ac.abort(); } catch(e){} };
        try { parentSignal.addEventListener('abort', onAbort, { once: true }); } catch(e){}
      }
      timer = setTimeout(function(){ timedOut = true; try { ac.abort(); } catch(e){} }, (API && typeof API.__postTimeoutMs === 'number') ? API.__postTimeoutMs : POST_TIMEOUT_MS);
    }
    function cleanup(){
      if (timer) clearTimeout(timer);
      if (onAbort && parentSignal){ try { parentSignal.removeEventListener('abort', onAbort); } catch(e){} }
    }
    function parentDead(){ return !!(parentSignal && parentSignal.aborted); }

    return _origFetch.apply(self, [url, init2]).then(function(resp){
      cleanup();
      var s = resp ? resp.status : 0;
      if (resp && (s === 429 || (s >= 500 && s <= 599))){
        if (parentDead()) throw abortError();
        stats.post5xx++;
        try { console.info(TAG, 'POST status=' + s + ' -> free GET fallback'); } catch(e){}
        return freeFallback(body, parentSignal, startedAt).catch(function(){ return resp; });  // 失敗時は元responseで現状維持
      }
      return resp;
    }, function(err){
      cleanup();
      if (parentDead()){ try { console.info(TAG, 'abort=parent'); } catch(e){} throw err; }   // 親abort → 尊重(条件3)
      if (timedOut){
        stats.postTimeouts++;
        try { console.info(TAG, 'abort=fix491-post-timeout(' + POST_TIMEOUT_MS + 'ms) -> free GET fallback'); } catch(e){}
        return freeFallback(body, parentSignal, startedAt);
      }
      if (err && err.name === 'AbortError') throw err;   // 自分以外のabort → 尊重
      stats.postNetErr++;
      try { console.info(TAG, 'POST network error -> free GET fallback'); } catch(e){}
      return freeFallback(body, parentSignal, startedAt).catch(function(){ throw err; });
    });
  }

  // ---------- ★v4: サーバ委譲(serverFb=true)経路 ----------
  //   条件: fbOwner:'server' を付けて送る(run有無問わず)。応答は
  //   ・runId付き → 不触(サーバ側 avatarFinalize + /avatar-inspect が検品を担う)
  //   ・非run + フォールバック応答(pollinations-free) + 親signal無し → 自前検品(pass=原本/fail=502)
  //   ・非run + フォールバック応答 + 親signalあり → 下流fix476が検品するので素通し
  //   ・json解釈不能 / 非fallback応答 → 素通し
  function serverYield(self, url, init){
    var body = null;
    try { body = JSON.parse(init.body); } catch(e){ body = null; }
    if (!body) return _origFetch.apply(self, [url, init]);   // パース不能 → 素通し(fbOwner付けない)
    body.fbOwner = 'server';
    var init2 = Object.assign({}, init);
    init2.body = JSON.stringify(body);
    var parentSignal = init && init.signal;
    var isRun = (body.runId != null);
    var p = _origFetch.apply(self, [url, init2]);
    if (isRun) return p;   // run経路: fbOwner付与のみ・応答不触(条件: サーバ側検品が担う)
    return p.then(function(resp){
      if (!resp || !resp.ok) return resp;
      var cl;
      try { cl = resp.clone(); } catch(e){ return resp; }
      return cl.json().then(function(j){
        if (!(j && j.provider === 'pollinations-free' && j.fallback === true && j.data && j.data[0] && j.data[0].b64_json)) return resp;   // 非fallback → 素通し
        if (parentSignal) return resp;   // 下流fix476が検品 → 素通し
        stats.serverFbGuarded++;
        return inspectFallback(j.data[0].b64_json, body.prompt).then(function(){
          return resp;   // pass → 原本を返す
        }, function(){
          stats.serverFbInspectFail++;
          try { console.info(TAG, 'server fallback image failed self-inspect -> 502'); } catch(e){}
          return new Response(JSON.stringify({ error: 'fallback-inspect-fail', errorCode: 'fb-inspect-fail' }),
            { status: 502, statusText: 'Bad Gateway', headers: { 'Content-Type': 'application/json; charset=utf-8' } });
        });
      }, function(){ return resp; });   // json解釈不能 → 素通し
    });
  }

  // ---------- fetch ラッパ ----------
  var wrapped = function(url, init){
    try {
      if (on() && isAvatarGen(url, init)){
        if (serverFb) return serverYield(this, url, init);   // ★v4: サーバ委譲(fbOwner付与+非run事後検品)
        return fetchWithFallback(this, url, init);           // 従来(v2): クライアント側タイムアウト+無料GET
      }
    } catch(e){ try { console.warn(TAG, 'wrap error', e); } catch(_){} }
    return _origFetch.apply(this, arguments);
  };

  // ---------- own props 全継承(fix419cの教訓) ----------
  try {
    Object.getOwnPropertyNames(_origFetch).forEach(function(k){
      if (k === 'length' || k === 'name' || k === 'arguments' || k === 'caller' || k === 'prototype') return;
      try { Object.defineProperty(wrapped, k, Object.getOwnPropertyDescriptor(_origFetch, k)); } catch(e){}
    });
    try { Object.defineProperty(wrapped, 'name', { value: (_origFetch && _origFetch.name) || 'fetch', configurable: true }); } catch(e){}
    if (_origFetch && _origFetch.prototype) { try { wrapped.prototype = _origFetch.prototype; } catch(e){} }
  } catch(e){}
  wrapped.__v292Dfix491 = true;
  window.fetch = wrapped;

  var API = window.__v292Dfix491 = {
    __armed: true,
    isAvatarGen: isAvatarGen,
    buildFreeUrl: buildFreeUrl,
    stats: stats,
    __postTimeoutMs: POST_TIMEOUT_MS,
    __getTimeoutMs: GET_TIMEOUT_MS,
    __breakerMax: BREAKER_MAX,
    status: function(){ return { on: on(), armed: true, breaker: breaker, serverFb: serverFb, stats: stats }; }
  };

  // ---------- ★v3: Worker v28検知(root JSON の freeFallback:true で自動退避) ----------
  function probeServerFb(){
    try {
      var base = proxyBase();
      if (!base) return;   // proxy未設定 → 後続タイマーで再試行(serverFb維持)
      _origFetch.call(window, base + '/', { method: 'GET' })
        .then(function(r){ return (r && r.ok) ? r.json() : null; })
        .then(function(j){
          if (j && j.freeFallback === true){
            serverFb = true;
            try { console.info(TAG, 'server v28 freeFallback detected -> yielding to server'); } catch(e){}
          }
        })
        .catch(function(){});   // 失敗時は serverFb 維持(初期値false)
    } catch(e){}
  }
  probeServerFb();                                   // arm時
  try { setTimeout(probeServerFb, 2500); } catch(e){}  // +2.5秒後
  try { setTimeout(probeServerFb, 8000); } catch(e){}  // +8秒後

  try { console.log(TAG, 'armed; on:', on()); } catch(e){}
})();
