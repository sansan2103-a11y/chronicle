// =====================================================================
// Chronicle TRPG - v292Dfix400: アイコンをサーバーURLで配信して表示する
// ---------------------------------------------------------------------
// 背景(Deep Research 2026-07-07): iOS SafariのIndexedDBは未修正のWebKitバグで
//   書き込み取りこぼし・フリーズ・接続喪失を起こす。→ 画像をローカルに書くのを
//   やめ、Workerが配信するURLを<img src>にしてブラウザのHTTPキャッシュに任せる。
// 仕組み:
//   ・Worker v11+ が GET /img?ns=<名前空間>&k=<画像キー> で画像1枚をbytesで返す。
//   ・ns は op:meta の応答から取得(認証必須)して localStorage に保持。
//   ・fix197.applyOne が window.__v292Dfix400.urlFor(pk) を最優先で <img src> に。
//     読めなければ(ns無し/404/オフライン) fix197側のonerrorが「再生成させずに」
//     ローカル(cache/persist)→DiceBearへ後方互換フォールバック(fix400c)。
// スイッチ: 既定ON。全体OFF = localStorage v292Dfix400Off = '1' (従来のIDB/生成表示)。
// 検証: window.__v292Dfix400 = { enabled, urlFor, ns, ensureNs, status }
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix400 && window.__v292Dfix400.__real) return;
  var TAG = '[v292Dfix400:img-url]';

  function off(){ try { return localStorage.getItem('v292Dfix400Off') === '1'; } catch(e){ return false; } }
  function proxyUrl(){
    try {
      var u = (localStorage.getItem('v292ProxyUrl') || '').trim();
      if (u) return u.replace(/\/+$/, '');
      if (window.__v292Dfix247bapi && window.__v292Dfix247bapi.DEFAULT_PROXY_URL) return window.__v292Dfix247bapi.DEFAULT_PROXY_URL;
    } catch(e){}
    return 'https://novel-proxy.sansan2103.workers.dev';
  }
  function authHeaders(){
    var h = { 'Content-Type': 'application/json' };
    try { var g = (window.__chronicleGoogleId && window.__chronicleGoogleId()) || ''; if (g) h['x-google-id'] = g; } catch(e){}
    try { var p = (localStorage.getItem('v292ProxyPass') || '').trim(); if (p) h['x-chronicle-pass'] = p; } catch(e){}
    return h;
  }
  function isLoggedIn(){ var h = authHeaders(); return !!(h['x-google-id'] || h['x-chronicle-pass']); }
  function getNs(){ try { return localStorage.getItem('v292Dfix400_ns') || ''; } catch(e){ return ''; } }
  function setNs(ns){ try { localStorage.setItem('v292Dfix400_ns', String(ns)); } catch(e){} }

  var fetchingNs = false;
  function ensureNs(){
    try {
      if (off() || !isLoggedIn() || getNs() || fetchingNs) return;
      fetchingNs = true;
      fetch(proxyUrl() + '/save', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ op: 'meta' }) })
        .then(function(r){ return r.json(); })
        .then(function(j){ if (j && j.ns) { setNs(j.ns); try { console.log(TAG, 'ns acquired'); } catch(e){} triggerSweep(); } })
        .catch(function(){})
        .then(function(){ fetchingNs = false; });
    } catch(e){ fetchingNs = false; }
  }
  function triggerSweep(){ try { var f = window.__v292Dfix197 || window.__v292Dfix199; if (f && typeof f.sweep === 'function') { f.sweep(); setTimeout(function(){ try { f.sweep(); } catch(_){} }, 800); } } catch(e){} }

  window.__v292Dfix400 = {
    __real: true,
    enabled: function(){ return !off() && !!getNs(); },
    urlFor: function(pk){ var ns = getNs(); if (off() || !ns || !pk) return ''; return proxyUrl() + '/img?ns=' + encodeURIComponent(ns) + '&k=' + encodeURIComponent(pk); },
    ns: getNs,
    ensureNs: ensureNs,
    status: function(){ return { off: off(), loggedIn: isLoggedIn(), ns: getNs() ? 'set' : 'none', proxy: proxyUrl() }; }
  };

  setTimeout(ensureNs, 2500); setTimeout(ensureNs, 6000);
  try { document.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'visible') ensureNs(); }); } catch(e){}
  try { console.log(TAG, 'loaded', off() ? 'OFF' : 'ON', '(login=' + isLoggedIn() + ', ns=' + (getNs()?'set':'none') + ')'); } catch(e){}
})();
