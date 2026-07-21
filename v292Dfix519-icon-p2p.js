// =====================================================================
// Chronicle TRPG - v292Dfix519: アイコンだけの端末間伝播(Worker/fix402非依存・opt-in)
// ---------------------------------------------------------------------
// 目的: PCで再生成したアイコンをiPhone等へ伝播する。ただし fix402(invisible-sync=
//   セーブ同期まるごと・過去にiPhoneフリーズ/データ消失の実害)を再有効化せず、
//   **アイコンのputimg送信＋受信だけ**を独立モジュールで完結させる(=セーブ同期のリスクを負わない)。
// 現行Workerだけで動く(新Worker不要): 送信=既存 op:putimg / 受信=既存 GET /img の ETag+304。
//
// 送信: localStorage['v292av2_'+pk] に「以前と異なる有効なdata:image」が書かれた(=再生成/新規)瞬間、
//   その1枚だけ op:putimg でサーバー(D1 images)へ。デバウンス。認証は fix400/fix402 と同じ。
// 受信: 表示中(DOMに data-avpk がある)キーだけを、visible時＋低頻度intervalで
//   GET /img?ns&k に If-None-Match(ローカルb64のETag) を付けて確認 → 200(=サーバーが新しい)なら
//   ローカルへ差替(setItem→fix346でIDB)→ fix197.sweep で表示反映。304ならskip。
//   ★表示中の数キー(最大12)だけ舐める=iOS負荷小・低レイテンシ(見ているキャラだけ最新化)。
//   ガード: 送信pending中(v292Dfix402_pimg)/受信由来の書込 は触らない(ループ・競合回避)。
// P1(fix517b)との整合: 受信でローカルが最新化される→ローカル優先表示がそのまま正しく効く。
//
// 有効化(opt-in・既定OFF): localStorage.v292Dfix519OnV1==='1' かつ v292Dfix519Off!=='1'
// 検証口: window.__v292Dfix519 = { on, recvSweep, flushSend, status }
// ETag契約: Worker handleImg と同一 = '"'+b64.length.toString(36)+'-'+smallHash(b64)+'"'
//   smallHash = djb2(h=5381; h=((h<<5)+h+c)|0; (h>>>0).toString(36)) ← Workerと同一式(必須)
// =====================================================================
(function(){
  'use strict';
  var W = (typeof window !== 'undefined') ? window : this;
  if (W.__v292Dfix519 && W.__v292Dfix519.__armed) return;
  var TAG = '[v292Dfix519:icon-p2p]';
  var PREFIX = 'v292av2_';

  function lsg(k){ try { return W.localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix519Off') === '1'; }
  function on(){ if (off()) return false; return lsg('v292Dfix519OnV1') === '1'; }
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
  function b64Of(durl){ var m = /^data:([^;,]+);base64,([\s\S]*)$/.exec(String(durl || '')); return m ? { ct: m[1], b64: m[2] } : null; }
  function etagOf(b64){ return '"' + b64.length.toString(36) + '-' + smallHash(b64) + '"'; }

  // ---------- 送信: 書込検知→putimg ----------
  var recvMark = {};       // pk -> 受信由来の書込(送信検知でskip)
  var sendQ = {}, sendTimer = null;
  var _fetch = (typeof fetch === 'function') ? fetch.bind(W) : null;
  function scheduleSend(pk){ sendQ[pk] = 1; if (sendTimer || !_fetch) return; sendTimer = setTimeout(flushSend, 1500); }
  function flushSend(){
    sendTimer = null; if (!on() || !loggedIn() || !_fetch){ sendQ = {}; return; }
    var ks = Object.keys(sendQ); sendQ = {};
    ks.forEach(function(pk){
      var v = null; try { v = W.localStorage.getItem(PREFIX + pk); } catch(e){}
      if (!(typeof v === 'string' && v.indexOf('data:') === 0)) return;
      try { _fetch(proxyUrl() + '/save', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ op: 'putimg', k: PREFIX + pk, data: v }) })
        .then(function(){ try { console.log(TAG, 'putimg', pk); } catch(e){} }).catch(function(){}); } catch(e){}
    });
  }
  // localStorage.setItem ラップ(fix346/fix402の更に外側)。元setItemを必ず先に実行。
  (function(){
    try {
      var ls = W.localStorage; var _set = ls.setItem.bind(ls), _get = ls.getItem.bind(ls);
      if (_set.__f519) return;
      var wrapped = function(k, v){
        var changed = false, isav = (typeof k === 'string' && k.indexOf(PREFIX) === 0 && typeof v === 'string' && v.indexOf('data:image') === 0);
        var pk = isav ? k.slice(PREFIX.length) : '';
        if (isav && on()){ try { var old = _get(k); if (old !== v) changed = true; } catch(e){} }
        var r = _set(k, v);
        if (isav && on()){
          if (recvMark[pk]){ delete recvMark[pk]; }        // 受信由来→送信しない
          else if (changed){ scheduleSend(pk); }           // 変化(regen/新規)→putimg
        }
        return r;
      };
      wrapped.__f519 = true;
      try { Object.defineProperty(wrapped, 'name', { value: 'setItem', configurable: true }); } catch(e){}
      ls.setItem = wrapped;
    } catch(e){}
  })();

  // ---------- 受信: 表示中キーだけ If-None-Match で最新化 ----------
  var recvBusy = false;
  function pendingKeys(){ try { return JSON.parse(lsg('v292Dfix402_pimg') || '{}') || {}; } catch(e){ return {}; } }
  function visibleKeys(){
    var out = {}; try { var imgs = document.querySelectorAll('img[data-avpk]'); for (var i = 0; i < imgs.length; i++){ var pk = imgs[i].getAttribute('data-avpk'); if (pk) out[pk] = 1; } } catch(e){}
    return Object.keys(out).slice(0, 12);
  }
  function recvSweep(){
    if (recvBusy || !on() || !loggedIn() || !_fetch || typeof document === 'undefined') return;
    var ns = nsGet(); if (!ns) return;
    var pend = pendingKeys();
    var ks = visibleKeys().filter(function(pk){ return !((PREFIX + pk) in pend); });   // 送信pending中は触らない
    if (!ks.length) return;
    recvBusy = true; var i = 0;
    (function next(){
      if (i >= ks.length){ recvBusy = false; return; }
      var pk = ks[i++]; var loc = null; try { loc = W.localStorage.getItem(PREFIX + pk); } catch(e){}
      var headers = {}; var lb = loc ? b64Of(loc) : null; if (lb) headers['If-None-Match'] = etagOf(lb.b64);
      _fetch(proxyUrl() + '/img?ns=' + encodeURIComponent(ns) + '&k=' + encodeURIComponent(PREFIX + pk), { headers: headers, cache: 'no-store' })
        .then(function(r){ if (r.status === 304 || !r.ok) return null; var ct = r.headers.get('Content-Type') || 'image/png'; return r.arrayBuffer().then(function(buf){ return { ct: ct, buf: buf }; }); })
        .then(function(o){
          if (o){
            try {
              var arr = new Uint8Array(o.buf), bin = ''; for (var j = 0; j < arr.length; j++) bin += String.fromCharCode(arr[j]);
              var durl = 'data:' + o.ct + ';base64,' + btoa(bin);
              if (durl !== loc){ recvMark[pk] = 1; try { W.localStorage.setItem(PREFIX + pk, durl); } catch(e){} try { var f = W.__v292Dfix197 || W.__v292Dfix199; if (f && f.sweep) f.sweep(); } catch(e){} try { console.log(TAG, 'recv-update', pk); } catch(e){} }
            } catch(e){}
          }
          setTimeout(next, 150);
        })
        .catch(function(){ setTimeout(next, 150); });
    })();
  }

  W.__v292Dfix519 = {
    __armed: true, on: on, smallHash: smallHash, etagOf: etagOf, b64Of: b64Of,
    recvSweep: recvSweep, flushSend: flushSend,
    status: function(){ return { armed: true, on: on(), loggedIn: loggedIn(), ns: nsGet() ? 'set' : 'none' }; }
  };
  try {
    if (typeof document !== 'undefined'){
      document.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'visible') setTimeout(recvSweep, 800); });
      if (typeof setInterval === 'function') setInterval(recvSweep, 20000);
      if (typeof setTimeout === 'function') setTimeout(recvSweep, 3000);
    }
  } catch(e){}
  try { console.log(TAG, 'armed; on:', on() ? 'on' : 'off(candidate)'); } catch(e){}
})();
