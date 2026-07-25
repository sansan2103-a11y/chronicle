// =====================================================================
// Chronicle TRPG - v292Dfix523: アイコンの端末間伝播（版差分・恒久化・既定ON）
// ---------------------------------------------------------------------
// 目的: PCで再生成したアイコンをiPhone等へ確実に伝播する。fix519e は「ローカルに
//   実画像がある鍵は絶対に触らない(missing-only)」ため、既に旧アイコンを持つ端末を
//   更新できなかった（＝伝播の主目的が達成できない）。fix523 は Worker v23b の
//   op:imgmanifest（画像別 rev/hash の一覧・data列を読まない軽量）を使い、
//   「サーバーが自分の知っている版より新しい時だけ」既存ローカルを上書きする。
//   → 巻き戻り(fix519cの実害)を rev で原理的に排除しつつ、伝播を実現する。
//
// 送信: localStorage['v292av2_'+pk] が変化(regen/新規)した瞬間、その1枚だけ
//   op:putimg（baseImageRev=既知rev付き）で送る。200なら応答 imageRev を既知revに記録。
//   409(image-conflict)＝他端末が先に公開＝サーバーが新しい → ローカルを上書きせず PULL。
// 受信: 低頻度で op:imgmanifest を1回だけ取得（223件でも数KB）。ローカル各鍵について
//   - server.hash === local.hash → 版だけ採用（PULLしない）
//   - server.hash ≠ local.hash かつ server.rev > 既知rev → PULL（サーバーが厳密に新しい）
//   - server.hash ≠ local.hash かつ server.rev ≤ 既知rev → ローカルが新しい/未公開 →
//       baseImageRev付き PUSH（条件付きputimg）。409ならPULLに切替（後着が前着を消さない）。
//   - ローカルに無い鍵（missing）→ サーバーにあれば PULL（常に安全）。
//   iOS配慮: 1sweepあたり最大6鍵、round-robin。送信中/402pending鍵は触らない。
//
// 既知rev台帳: localStorage['v292Dfix523_rev'] = { pk: rev }（pk は PREFIX 無しの生キー）。
//   putimg応答・PULL時に更新。これが「ローカル画像が対応するサーバー版」を表す＝巻き戻り防止の要。
// ハッシュ契約（Worker d1PutImg と同一・必須）: hash = String(fullDataUrl.length)+':'+smallHash(fullDataUrl)
//   smallHash = djb2(h=5381; h=((h<<5)+h+c)|0; (h>>>0).toString(36))。
// 既定ON（伝播が主目的）: localStorage.v292Dfix523Off!=='1'。検証口: window.__v292Dfix523。
// fix519 との関係: 本モジュールが送受信を一本化。index.html では fix519 を外し fix523 のみ読む。
// =====================================================================
(function(){
  'use strict';
  var W = (typeof window !== 'undefined') ? window : this;
  if (W.__v292Dfix523 && W.__v292Dfix523.__armed) return;
  var TAG = '[v292Dfix523:icon-sync]';
  var PREFIX = 'v292av2_';
  var REVLS = 'v292Dfix523_rev';

  function lsg(k){ try { return W.localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix523Off') === '1'; }
  function on(){ return !off(); }   // ★既定ON（伝播が主目的）。緊急停止= v292Dfix523Off='1'。
  function proxyUrl(){
    try { var u = (W.localStorage.getItem('v292ProxyUrl') || '').trim(); if (u) return u.replace(/\/+$/, ''); } catch(e){}
    try { if (W.__v292Dfix247bapi && W.__v292Dfix247bapi.DEFAULT_PROXY_URL) return W.__v292Dfix247bapi.DEFAULT_PROXY_URL; } catch(e){}
    return 'https://novel-proxy.sansan2103.workers.dev';
  }
  function authHeaders(){
    var h = { 'Content-Type': 'application/json' };
    try { var g = (W.__chronicleGoogleId && W.__chronicleGoogleId()) || ''; if (g) h['x-google-id'] = g; } catch(e){}
    try { var p = (W.localStorage.getItem('v292ProxyPass') || '').trim(); if (p) h['x-chronicle-pass'] = p; } catch(e){}
    return h;
  }
  function loggedIn(){ var h = authHeaders(); return !!(h['x-google-id'] || h['x-chronicle-pass']); }
  function nsGet(){ return lsg('v292Dfix400_ns') || ''; }
  function smallHash(s){ var h = 5381; s = String(s || ''); for (var i = 0; i < s.length; i++){ h = ((h << 5) + h + s.charCodeAt(i)) | 0; } return (h >>> 0).toString(36); }   // ★Worker同一式
  function hashFull(durl){ var s = String(durl || ''); return String(s.length) + ':' + smallHash(s); }   // ★Worker d1PutImg と同一（フルdata文字列）
  var _fetch = (typeof fetch === 'function') ? fetch.bind(W) : null;

  // ---------- 既知rev台帳 ----------
  function revMap(){ try { return JSON.parse(lsg(REVLS) || '{}') || {}; } catch(e){ return {}; } }
  function revGet(pk){ var m = revMap(); var v = m[pk]; return (typeof v === 'number' && isFinite(v)) ? v : 0; }
  function revSet(pk, rev){ try { var m = revMap(); m[pk] = +rev || 0; W.localStorage.setItem(REVLS, JSON.stringify(m)); } catch(e){} }

  // ---------- 共通 ----------
  var recvMark = {};        // pk -> 受信由来の書込（送信ラップでskip）
  var sending = {};         // pk -> 送信中（受信でskip）
  function localAv(pk){ try { var v = W.localStorage.getItem(PREFIX + pk); return (typeof v === 'string' && v.indexOf('data:') === 0) ? v : null; } catch(e){ return null; } }
  function fix402Pending(){ try { return JSON.parse(lsg('v292Dfix402_pimg') || '{}') || {}; } catch(e){ return {}; } }
  function applySweep(){ try { var f = W.__v292Dfix197 || W.__v292Dfix199; if (f && f.sweep) f.sweep(); } catch(e){} }

  // ---------- PULL（サーバー画像をローカルへ・素のGETでプリフライト回避） ----------
  function pullOne(pk, serverRev, done){
    var ns = nsGet(); if (!ns || !_fetch){ if (done) done(false); return; }
    _fetch(proxyUrl() + '/img?ns=' + encodeURIComponent(ns) + '&k=' + encodeURIComponent(PREFIX + pk), { cache: 'no-store' })
      .then(function(r){ if (!r.ok) return null; var ct = r.headers.get('Content-Type') || 'image/png'; return r.arrayBuffer().then(function(buf){ return { ct: ct, buf: buf }; }); })
      .then(function(o){
        var ok = false;
        if (o && o.buf && o.buf.byteLength){
          try {
            var arr = new Uint8Array(o.buf), bin = ''; for (var j = 0; j < arr.length; j++) bin += String.fromCharCode(arr[j]);
            var durl = 'data:' + o.ct + ';base64,' + btoa(bin);
            var loc = localAv(pk);
            if (durl !== loc){ recvMark[pk] = 1; try { W.localStorage.setItem(PREFIX + pk, durl); } catch(e){} applySweep(); try { console.log(TAG, 'pull', pk, 'rev', serverRev); } catch(e){} }
            if (serverRev != null) revSet(pk, serverRev);
            ok = true;
          } catch(e){}
        }
        if (done) done(ok);
      })
      .catch(function(){ if (done) done(false); });
  }

  // ---------- PUSH（ローカルをサーバーへ・条件付きputimg・409ならPULL） ----------
  // ★fix525(2026-07-25): 409(image-conflict)→GET /img が404だと rev を採らないまま同じ
  //   baseImageRev で再送し続ける無限ループになっていた(実機コンソールで 409/404 が連続)。
  var conflictN = {}, CONFLICT_MAX = 3;
  function pushOne(pk, done){
    var v = localAv(pk); if (!v || !_fetch){ if (done) done(false); return; }
    sending[pk] = true;
    _fetch(proxyUrl() + '/save', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ op: 'putimg', k: PREFIX + pk, data: v, baseImageRev: revGet(pk) }) })
      .then(function(r){ return r.json().then(function(j){ return { status: r.status, j: j }; }).catch(function(){ return { status: r.status, j: null }; }); })
      .then(function(res){
        delete sending[pk];
        if (res.status === 409 || (res.j && res.j.errorCode === 'image-conflict')){
          var sr = (res.j && res.j.serverRev != null) ? res.j.serverRev : null;
          try { console.log(TAG, 'push-conflict→pull', pk); } catch(e){}
          pullOne(pk, sr, function(ok){
            if (ok){ conflictN[pk] = 0; }
            else {
              // サーバーに実体が無い(404)以上「サーバーが新しい」は維持できない。revを採って打ち切る。
              if (sr != null) revSet(pk, sr);
              conflictN[pk] = (conflictN[pk] || 0) + 1;
              if (conflictN[pk] === CONFLICT_MAX){ try { console.warn(TAG, 'give up pushing', pk, '(server image unavailable)'); } catch(e){} }
            }
            if (done) done(true);
          });
          return;
        }
        if (res.j && res.j.ok && res.j.imageRev != null){ revSet(pk, res.j.imageRev); try { console.log(TAG, 'push', pk, 'rev', res.j.imageRev); } catch(e){} }
        if (done) done(true);
      })
      .catch(function(){ delete sending[pk]; if (done) done(false); });
  }

  // ---------- 送信: setItem ラップ（regen/新規で即PUSH・デバウンス） ----------
  var sendQ = {}, sendTimer = null;
  function scheduleSend(pk){ sendQ[pk] = 1; if (sendTimer || !_fetch) return; sendTimer = setTimeout(flushSend, 1500); }
  function flushSend(){
    sendTimer = null; if (!on() || !loggedIn() || !_fetch){ sendQ = {}; return; }
    var ks = Object.keys(sendQ); sendQ = {};
    ks.forEach(function(pk){
      if ((conflictN[pk] || 0) >= CONFLICT_MAX) return;   // ★fix525: 連続409のキーは送信を止める
      if (localAv(pk)) pushOne(pk);
    });
  }
  (function(){
    try {
      var ls = W.localStorage; var _set = ls.setItem.bind(ls), _get = ls.getItem.bind(ls);
      if (_set.__f523) return;
      var wrapped = function(k, v){
        var isav = (typeof k === 'string' && k.indexOf(PREFIX) === 0 && typeof v === 'string' && v.indexOf('data:image') === 0);
        var pk = isav ? k.slice(PREFIX.length) : '';
        var changed = false;
        if (isav && on()){ try { var old = _get(k); if (old !== v) changed = true; } catch(e){} }
        var r = _set(k, v);
        if (isav && on()){
          if (recvMark[pk]){ delete recvMark[pk]; }        // 受信由来→送信しない
          else if (changed){ scheduleSend(pk); }           // regen/新規→PUSH
        }
        return r;
      };
      wrapped.__f523 = true;
      try { Object.defineProperty(wrapped, 'name', { value: 'setItem', configurable: true }); } catch(e){}
      ls.setItem = wrapped;
    } catch(e){}
  })();

  // ---------- 受信: manifest 1回 → 版差分で PULL/PUSH（round-robin・iOS配慮） ----------
  var recvBusy = false, rrCursor = 0;
  var BATCH = 6;
  function localAvKeys(){
    var out = []; try { for (var i = 0; i < W.localStorage.length; i++){ var k = W.localStorage.key(i); if (k && k.indexOf(PREFIX) === 0){ var v = W.localStorage.getItem(k); if (typeof v === 'string' && v.indexOf('data:') === 0) out.push(k.slice(PREFIX.length)); } } } catch(e){}
    return out;
  }
  function visiblePks(){
    var out = {}; try { var imgs = document.querySelectorAll('img[data-avpk]'); for (var i = 0; i < imgs.length; i++){ var pk = imgs[i].getAttribute('data-avpk'); if (pk) out[pk] = 1; } } catch(e){}
    return out;
  }
  function fetchManifest(cb){
    if (!_fetch) { cb(null); return; }
    _fetch(proxyUrl() + '/save', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ op: 'imgmanifest' }) })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){ cb(j && j.manifest ? j.manifest : null); })
      .catch(function(){ cb(null); });
  }
  function recvSweep(){
    if (recvBusy || !on() || !loggedIn() || !_fetch || typeof document === 'undefined') return;
    if (!nsGet()) return;
    recvBusy = true;
    fetchManifest(function(man){
      if (!man){ recvBusy = false; return; }
      var pend = fix402Pending();
      var vis = visiblePks();
      var localKeys = localAvKeys();
      var cand = {};
      localKeys.forEach(function(pk){ if (man[PREFIX + pk]) cand[pk] = 1; });
      Object.keys(man).forEach(function(mk){ if (mk.indexOf(PREFIX) === 0){ var pk = mk.slice(PREFIX.length); if (!localAv(pk) && vis[pk]) cand[pk] = 1; } });
      var list = Object.keys(cand).filter(function(pk){ return !sending[pk] && !((PREFIX + pk) in pend); });
      if (!list.length){ recvBusy = false; return; }
      list.sort();
      var start = rrCursor % list.length; var batch = [];
      for (var n = 0; n < list.length && batch.length < BATCH; n++){ batch.push(list[(start + n) % list.length]); }
      rrCursor = (start + batch.length) % list.length;
      var i = 0;
      (function next(){
        if (i >= batch.length){ recvBusy = false; return; }
        var pk = batch[i++];
        var srv = man[PREFIX + pk]; var loc = localAv(pk);
        var sRev = srv ? (+srv.rev || 0) : 0, sHash = srv ? String(srv.hash || '') : '';
        var kRev = revGet(pk);
        var cont = function(){ setTimeout(next, 120); };
        if (!srv){ cont(); return; }
        if (!loc){ pullOne(pk, sRev, cont); return; }
        var lHash = hashFull(loc);
        if (sHash && sHash === lHash){ if (kRev !== sRev) revSet(pk, sRev); cont(); return; }
        if (sRev > kRev){ pullOne(pk, sRev, cont); return; }
        pushOne(pk, cont);
      })();
    });
  }

  W.__v292Dfix523 = {
    __armed: true, on: on, smallHash: smallHash, hashFull: hashFull,
    recvSweep: recvSweep, flushSend: flushSend, pullOne: pullOne, pushOne: pushOne,
    revMap: revMap, revGet: revGet,
    status: function(){ return { armed: true, on: on(), loggedIn: loggedIn(), ns: nsGet() ? 'set' : 'none', keys: localAvKeys().length, revs: Object.keys(revMap()).length }; }
  };
  try {
    if (typeof document !== 'undefined'){
      document.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'visible') setTimeout(recvSweep, 800); });
      if (typeof setInterval === 'function') setInterval(recvSweep, 20000);
      if (typeof setTimeout === 'function') setTimeout(recvSweep, 3000);
    }
  } catch(e){}
  try { console.log(TAG, 'armed; on:', on() ? 'on' : 'off'); } catch(e){}
})();
