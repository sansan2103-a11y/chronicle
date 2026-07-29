// =====================================================================
// Chronicle TRPG - v292Dfix634: AI外見説明文(chrAiAv4:)の端末間同期
// ---------------------------------------------------------------------
// 真因(原因D'・2026-07-29に現コードで確認):
//   features.js:10506 の __aiAvatar は、キャラの外見説明文をLLMに書かせて
//   localStorage['chrAiAv4:<名前>::<descのhash>'] にキャッシュする(実測202件・44KB)。
//   しかし fix399 の isGlobalKey()(65-69行)は v292avrec_ / v292appr_ / chr6_slots_meta /
//   chr6_active_slot / chr6_epoch / genderMap_default しか通さず、**chrAiAv4: は同期対象外**。
//   → 相手端末にその説明文が無いと have() が false になり genAsync() がその場で
//     **別の説明文を生成**する。説明文が違えば絵も違う＝「別端末で別の絵が定着する」。
//   ★「chrAiAv4: は正本(同期)に入れる」はGPT裁定済み・確定。v292en_ は入れない。
//
// 輸送設計(Worker は1バイトも変更しない):
//   Worker の op:putimg は k(≤128文字)と data(≤2MB)を受ける汎用のkey-valueで、
//   画像であることを要求していない。形式を要求するのは GET /img だけ(handleImg:1633行の
//   /^data:([^;,]+);base64,/)。→ data:application/json;base64,... として置けば読み書きできる。
//
//   サーバーキー : 'v292meta1_aiav' (1件だけ。'v292av2_' で始まらないので fix523/fix633 は無視する)
//   値           : data:application/json;base64,<base64(JSON)>
//   JSON         : { v:1, at:<ms>, m: { "<localStorageのキー>": { v:"<説明文>", t:<世代ms> } } }
//   競合制御     : op:putimg の baseImageRev(画像と同じCAS)。409 → 取り直してマージ → 1回だけ再送
//   受信         : op:imgmanifest の rev/hash(fix633と共用の1回の取得) → 差があるときだけ GET /img
//   idempotency  : ★mid を送らない(既知C4: idempotencyキーをpayloadハッシュにしない)
//
// なぜ1件に束ねるか: キー別に置くと初回同期で202リクエスト(6秒間隔なら20分)。
//   束ねれば1リクエスト(44KB→JSON約60KB→base64約80KB。上限2MBに対して十分小さい)。
//   さらに 'chrAiAv4:<日本語名>::<hash>' は128文字に収まらない恐れがあるが、
//   束ねればサーバーキーは固定1本で、実キーは payload の中なので長さ制限を受けない。
//
// マージ規則(収束すること・絵が振動しないこと):
//   両方にある : t が大きい方。t が同値なら「文字列として小さい方」(決定的なタイブレーク)
//   片方だけ   : そのまま採用(union。**消さない**)
//   既存エントリの t は 0 として扱う → サーバーに既に登録があればそちらへ全端末が収束する。
//   ユーザーが作り直したときだけ setItem ラッパが t=Date.now() を記録し、ローカルが勝つ。
//
// 安全弁: 書き戻すのは 'chrAiAv4:' で始まるキーだけ / 1値2000文字 / 800件 / 1.5MB で上限
//   / QuotaExceeded を捕まえたらその回のマージを中断 / 束のhashが前回と同じなら送らない。
//
// 緊急OFF: localStorage.v292Dfix634Off='1'
// 冪等ガード: window.__v292Dfix634.__armed / setItem ラッパ側は __f634
// =====================================================================
(function(){
  'use strict';
  var W = (typeof window !== 'undefined') ? window : this;
  if (W.__v292Dfix634 && W.__v292Dfix634.__armed) return;
  var TAG = '[v292Dfix634:aiappearance-sync]';
  var LSP = 'chrAiAv4:';
  var SRVKEY = 'v292meta1_aiav';
  var STKEY = 'v292Dfix634_st';        // { rev, hash, at }
  var TKEY  = 'v292Dfix634_t';         // { lsKey: 世代ms }
  var MAX_VAL = 2000, MAX_ENTRIES = 800, MAX_BYTES = 1500000;
  var DEBOUNCE_MS = 8000, FIRST_MS = 12000, PERIOD_MS = 30000;

  var _ls = null, _get = null, _set = null;
  try { _ls = W.localStorage; _get = _ls.getItem.bind(_ls); _set = _ls.setItem.bind(_ls); } catch(e){}
  function lsg(k){ try { return _get ? _get(k) : null; } catch(e){ return null; } }
  function lss(k, v){ try { if (!_set) return false; _set(k, v); return true; } catch(e){ return false; } }
  function off(){ return lsg('v292Dfix634Off') === '1'; }
  function on(){ return !off(); }
  function proxyUrl(){
    try { var u = (lsg('v292ProxyUrl') || '').trim(); if (u) return u.replace(/\/+$/, ''); } catch(e){}
    try { if (W.__v292Dfix247bapi && W.__v292Dfix247bapi.DEFAULT_PROXY_URL) return W.__v292Dfix247bapi.DEFAULT_PROXY_URL; } catch(e){}
    return 'https://novel-proxy.sansan2103.workers.dev';
  }
  function authHeaders(){
    var h = { 'Content-Type': 'application/json' };
    try { var g = (W.__chronicleGoogleId && W.__chronicleGoogleId()) || ''; if (g) h['x-google-id'] = g; } catch(e){}
    try { var p = (lsg('v292ProxyPass') || '').trim(); if (p) h['x-chronicle-pass'] = p; } catch(e){}
    return h;
  }
  function loggedIn(){ var h = authHeaders(); return !!(h['x-google-id'] || h['x-chronicle-pass']); }
  function nsGet(){ return lsg('v292Dfix400_ns') || ''; }
  var _fetch = (typeof fetch === 'function') ? fetch.bind(W) : null;

  // ---- Worker と同一のハッシュ契約(imgmanifest の hash と突き合わせる) ----
  function smallHash(s){ var h = 5381; s = String(s || ''); for (var i = 0; i < s.length; i++){ h = ((h << 5) + h + s.charCodeAt(i)) | 0; } return (h >>> 0).toString(36); }
  function hashFull(s){ var t = String(s || ''); return String(t.length) + ':' + smallHash(t); }

  // ---- UTF-8 base64 ----
  function utf8Bytes(s){
    try { if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(String(s)); } catch(e){}
    var out = [], str = unescape(encodeURIComponent(String(s)));
    for (var i = 0; i < str.length; i++) out.push(str.charCodeAt(i) & 255);
    return out;
  }
  function b64enc(s){
    var bytes = utf8Bytes(s), bin = '', i, CH = 8192;
    for (i = 0; i < bytes.length; i += CH){
      var sub = Array.prototype.slice.call(bytes, i, i + CH);
      bin += String.fromCharCode.apply(String, sub);
    }
    return (typeof btoa === 'function') ? btoa(bin) : W.btoa(bin);
  }
  function bytesToStr(buf){
    try { if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(new Uint8Array(buf)); } catch(e){}
    var arr = new Uint8Array(buf), bin = '';
    for (var i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
    try { return decodeURIComponent(escape(bin)); } catch(e){ return bin; }
  }

  // ---- 状態台帳 ----
  function st(){ try { var o = JSON.parse(lsg(STKEY) || '{}'); return (o && typeof o === 'object') ? o : {}; } catch(e){ return {}; } }
  function stSet(o){ try { lss(STKEY, JSON.stringify(o || {})); } catch(e){} }
  function tmap(){ try { var o = JSON.parse(lsg(TKEY) || '{}'); return (o && typeof o === 'object') ? o : {}; } catch(e){ return {}; } }
  function tmapSet(o){
    try {
      var ks = Object.keys(o);
      if (ks.length > MAX_ENTRIES){                      // 古い順に落とす(LSの本体は消さない)
        ks.sort(function(a, b){ return (+o[a] || 0) - (+o[b] || 0); });
        for (var i = 0; i < ks.length - MAX_ENTRIES; i++) delete o[ks[i]];
      }
      lss(TKEY, JSON.stringify(o));
    } catch(e){}
  }
  function tOf(k){ var m = tmap(); return +m[k] || 0; }
  function noteT(k, t){ var m = tmap(); m[k] = +t || Date.now(); tmapSet(m); }

  // ---- ローカルの chrAiAv4 一覧(生localStorageにある。fix346の対象外) ----
  function localMap(){
    var out = {};
    try {
      var n = W.localStorage.length || 0;
      for (var i = 0; i < n; i++){
        var k = W.localStorage.key(i);
        if (!k || k.indexOf(LSP) !== 0) continue;
        var v = lsg(k);
        if (typeof v === 'string' && v && v.length <= MAX_VAL) out[k] = v;
      }
    } catch(e){}
    return out;
  }

  // ---- 束を作る ----
  function bundle(){
    var lm = localMap(), tm = tmap(), m = {}, ks = Object.keys(lm), i;
    if (ks.length > MAX_ENTRIES){
      ks.sort(function(a, b){ return (+tm[b] || 0) - (+tm[a] || 0); });   // 新しい順に残す
      ks = ks.slice(0, MAX_ENTRIES);
    }
    ks.sort();                                                            // ★決定的な順序(hashを安定させる)
    for (i = 0; i < ks.length; i++) m[ks[i]] = { v: lm[ks[i]], t: (+tm[ks[i]] || 0) };
    return { v: 1, at: Date.now(), m: m };
  }
  // hash は at を含めない形で取る(中身が同じなら送らないため)
  function bundleBody(b){ var ks = Object.keys(b.m).sort(), i, s = []; for (i = 0; i < ks.length; i++) s.push(ks[i] + '' + b.m[ks[i]].v); return s.join(''); }
  function bundleHash(b){ return hashFull(bundleBody(b)); }
  function encode(b){ return 'data:application/json;base64,' + b64enc(JSON.stringify(b)); }
  function decode(text){
    try { var o = JSON.parse(String(text || '')); return (o && o.m && typeof o.m === 'object') ? o : null; } catch(e){ return null; }
  }

  // ---- マージ(remote → local)。戻り: { applied, skipped, aborted } ----
  function merge(remote){
    var res = { applied: 0, skipped: 0, aborted: false, conflicts: 0 };
    if (!remote || !remote.m) return res;
    var lm = localMap(), tm = tmap(), ks = Object.keys(remote.m), i, dirtyT = false;
    for (i = 0; i < ks.length; i++){
      var k = ks[i];
      if (String(k).indexOf(LSP) !== 0){ res.skipped++; continue; }     // ★chrAiAv4: 以外は絶対に書かない
      var e = remote.m[k];
      if (!e || typeof e !== 'object'){ res.skipped++; continue; }
      var rv = String(e.v == null ? '' : e.v), rt = +e.t || 0;
      if (!rv || rv.length > MAX_VAL){ res.skipped++; continue; }
      var lv = (Object.prototype.hasOwnProperty.call(lm, k)) ? lm[k] : null;
      var lt = +tm[k] || 0;
      if (lv === null){
        if (!lss(k, rv)){ res.aborted = true; break; }                  // Quota等 → その回は中断
        tm[k] = rt; dirtyT = true; res.applied++;
        continue;
      }
      if (lv === rv){ if (lt === 0 && rt > 0){ tm[k] = rt; dirtyT = true; } continue; }
      res.conflicts++;
      var take = (rt > lt) || (rt === lt && rv < lv);                   // 同値なら文字列小さい方(決定的)
      if (take){
        if (!lss(k, rv)){ res.aborted = true; break; }
        tm[k] = rt; dirtyT = true; res.applied++;
      }
    }
    if (dirtyT) tmapSet(tm);
    if (res.aborted){ try { console.warn(TAG, 'merge aborted (write failed)'); } catch(e){} }
    return res;
  }

  // ---- 送信 ----
  var pushing = false;
  function pushNow(force, done){
    if (!on() || !_fetch || !loggedIn()){ if (done) done({ skipped: 'off-or-anon' }); return; }
    if (pushing){ if (done) done({ skipped: 'busy' }); return; }
    var b = bundle();
    var keys = Object.keys(b.m);
    if (!keys.length){ if (done) done({ skipped: 'empty' }); return; }
    var data = encode(b);
    if (data.length > MAX_BYTES){ try { console.warn(TAG, 'bundle too large', data.length); } catch(e){} if (done) done({ skipped: 'too-large', bytes: data.length }); return; }
    var s = st(), bh = bundleHash(b);
    if (!force && s.hash === bh){ if (done) done({ skipped: 'unchanged' }); return; }
    pushing = true;
    _fetch(proxyUrl() + '/save', { method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ op: 'putimg', k: SRVKEY, data: data, baseImageRev: (+s.rev || 0) }) })
      .then(function(r){ return r.json().then(function(j){ return { status: r.status, j: j }; }).catch(function(){ return { status: r.status, j: null }; }); })
      .then(function(res){
        pushing = false;
        if (res.status === 409 || (res.j && res.j.errorCode === 'image-conflict')){
          try { console.log(TAG, 'push-conflict -> pull & merge & retry once'); } catch(e){}
          pullNow(function(){
            var b2 = bundle(), s2 = st();
            if (s2.hash === bundleHash(b2)){ if (done) done({ conflict: true, resolved: 'server-wins' }); return; }
            pushOnce(b2, function(r2){ if (done) done({ conflict: true, retried: true, result: r2 }); });
          });
          return;
        }
        if (res.j && res.j.ok){
          var s3 = st(); s3.rev = (res.j.imageRev != null) ? (+res.j.imageRev || 0) : (+s3.rev || 0);
          s3.hash = bh; s3.srvHash = String(res.j.hash || ''); s3.at = Date.now(); stSet(s3);
          try { console.log(TAG, 'push ok rev', s3.rev, 'entries', keys.length, 'bytes', data.length); } catch(e){}
          if (done) done({ ok: true, rev: s3.rev, entries: keys.length, bytes: data.length });
          return;
        }
        if (done) done({ ok: false, status: res.status });
      })
      .catch(function(){ pushing = false; if (done) done({ ok: false, error: 'network' }); });
  }
  // 409後の1回だけの再送(再帰しない)
  function pushOnce(b, done){
    var data = encode(b), s = st(), bh = bundleHash(b);
    if (data.length > MAX_BYTES){ if (done) done({ skipped: 'too-large' }); return; }
    _fetch(proxyUrl() + '/save', { method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ op: 'putimg', k: SRVKEY, data: data, baseImageRev: (+s.rev || 0) }) })
      .then(function(r){ return r.json().then(function(j){ return { status: r.status, j: j }; }).catch(function(){ return { status: r.status, j: null }; }); })
      .then(function(res){
        if (res.j && res.j.ok){
          var s2 = st(); s2.rev = (res.j.imageRev != null) ? (+res.j.imageRev || 0) : (+s2.rev || 0);
          s2.hash = bh; s2.srvHash = String(res.j.hash || ''); s2.at = Date.now(); stSet(s2);
          if (done) done({ ok: true, rev: s2.rev });
          return;
        }
        if (done) done({ ok: false, status: res.status });
      })
      .catch(function(){ if (done) done({ ok: false, error: 'network' }); });
  }

  // ---- 受信 ----
  //   seenHash: 取り込んだ時点のサーバー側hash。次のsweepで同じhashなら**引き直さない**
  //   (これが無いと、相手端末が最後に置いた版を毎回GETし続ける)
  function pullNow(done, seenHash){
    if (!on() || !_fetch){ if (done) done({ skipped: 'off' }); return; }
    var ns = nsGet();
    if (!ns){ if (done) done({ skipped: 'no-ns' }); return; }
    _fetch(proxyUrl() + '/img?ns=' + encodeURIComponent(ns) + '&k=' + encodeURIComponent(SRVKEY), { cache: 'no-store' })
      .then(function(r){ if (!r.ok) return null; return r.arrayBuffer(); })
      .then(function(buf){
        if (!buf){ if (done) done({ skipped: 'not-found' }); return; }
        var remote = decode(bytesToStr(buf));
        if (!remote){ if (done) done({ skipped: 'bad-payload' }); return; }
        var m = merge(remote);
        var s = st();
        if (!m.aborted && seenHash) s.seen = String(seenHash);
        s.at = Date.now(); stSet(s);                    // ★s.hash は「最後にpushした束」の意味なので触らない
        try { console.log(TAG, 'pull applied', m.applied, 'conflicts', m.conflicts); } catch(e){}
        if (done) done({ ok: true, merged: m });
      })
      .catch(function(){ if (done) done({ ok: false, error: 'network' }); });
  }

  // ---- 差分検出(manifest経由・fix633のキャッシュを共用) ----
  function manifest(cb){
    try {
      var f = W.__v292Dfix633;
      if (f && typeof f.manifest === 'function'){ f.manifest(cb); return; }
    } catch(e){}
    if (!_fetch || !loggedIn()){ cb(null); return; }
    _fetch(proxyUrl() + '/save', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ op: 'imgmanifest' }) })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){ cb(j && j.manifest ? j.manifest : null); })
      .catch(function(){ cb(null); });
  }
  var sweeping = false;
  function sweep(done){
    if (!on() || sweeping || !loggedIn() || !nsGet() || !_fetch){ if (done) done({ skipped: 'idle' }); return; }
    sweeping = true;
    manifest(function(man){
      if (!man){ sweeping = false; if (done) done({ skipped: 'no-manifest' }); return; }
      var srv = man[SRVKEY], s = st();
      var b = bundle(), bh = bundleHash(b);
      var finish = function(r){ sweeping = false; if (done) done(r); };
      if (!srv){
        // サーバーにまだ束が無い → 自分の分を1回だけ置く
        if (!Object.keys(b.m).length){ finish({ skipped: 'nothing-to-publish' }); return; }
        pushNow(true, function(r){ finish({ published: true, result: r }); });
        return;
      }
      var sRev = +srv.rev || 0, sHash = String(srv.hash || '');
      // ★突き合わせ済みのサーバーhash(seen) = 自分がpushした版 or 取り込み済みの版。
      //   一致していれば**サーバーは前回から動いていない**ので引き直さない。
      var reconciled = !!(sHash && (sHash === s.srvHash || sHash === s.seen));
      if (reconciled){
        var s2 = st(); s2.rev = sRev; stSet(s2);
        if (s2.hash === bh){ finish({ same: true }); return; }     // ローカルも当時のまま → 何もしない
        pushNow(false, function(r){ finish({ pushed: r }); });     // ローカルだけ進んだ → 送る
        return;
      }
      // 他端末が置いた(または初回) → 取り込んでマージし、ローカルが勝っている分を送り返す
      pullNow(function(){
        var s3 = st(); s3.rev = sRev; stSet(s3);
        pushNow(false, function(r){ finish({ pulled: true, pushed: r }); });
      }, sHash);
    });
  }

  // ---- 送信契機: chrAiAv4: への書込を捕まえる ----
  var timer = null;
  function schedule(){
    if (!on() || timer || typeof setTimeout !== 'function') return;
    timer = setTimeout(function(){ timer = null; sweep(); }, DEBOUNCE_MS);
  }
  (function wrap(){
    try {
      if (!_ls || !_set) return;
      var cur = _ls.setItem;
      if (cur && cur.__f634) return;
      var wrapped = function(k, v){
        var isav = (typeof k === 'string' && k.indexOf(LSP) === 0 && typeof v === 'string' && v);
        var old = null;
        if (isav && on()){ try { old = _get(k); } catch(e){ old = null; } }
        var r = _set(k, v);
        if (isav && on() && old !== v){
          try { noteT(k, Date.now()); } catch(e){}    // ★この端末で作られた/作り直された世代
          schedule();
        }
        return r;
      };
      wrapped.__f634 = true;
      try { Object.defineProperty(wrapped, 'name', { value: 'setItem', configurable: true }); } catch(e){}
      _ls.setItem = wrapped;
    } catch(e){}
  })();

  W.__v292Dfix634 = {
    __armed: true, on: on,
    SRVKEY: SRVKEY, LSP: LSP,
    hashFull: hashFull, bundle: bundle, bundleHash: bundleHash, encode: encode, decode: decode,
    localMap: localMap, merge: merge, pushNow: pushNow, pullNow: pullNow, sweep: sweep,
    tmap: tmap, noteT: noteT, state: st,
    status: function(){
      var b = bundle(), s = st();
      return { armed: true, on: on(), loggedIn: loggedIn(), ns: nsGet() ? 'set' : 'none',
               entries: Object.keys(b.m).length, bytes: encode(b).length,
               rev: (+s.rev || 0), hash: s.hash || null, srvHash: s.srvHash || null, at: s.at || 0 };
    }
  };

  try {
    if (typeof document !== 'undefined'){
      if (typeof setTimeout === 'function') setTimeout(function(){ sweep(); }, FIRST_MS);
      if (typeof setInterval === 'function') setInterval(function(){ sweep(); }, PERIOD_MS);
      if (document.addEventListener){
        document.addEventListener('visibilitychange', function(){
          if (document.visibilityState === 'visible'){ try { setTimeout(function(){ sweep(); }, 4000); } catch(e){} }
        });
      }
    }
  } catch(e){}
  try { console.log(TAG, 'armed; on:', on() ? 'on' : 'off'); } catch(e){}
})();
