// =====================================================================
// Chronicle - v292Dp8d: 画像生成の送信境界 fail-closed ガード（Phase 8 / GPT #125-AJ〜）
// 目的: 画像生成の POST に、人物の名前や日本語の文（外見・年齢・身長・世界観など）が
//       そのまま載って画像 provider へ出ることを、送信の直前で止める。
//   ・通常はレシピ層（fix767 / fix475 / fix484 等）が英語の外見レシピへ置き換えるので、何も起きない。
//   ・レシピ層が kill や失敗で外れたときだけ、生の prompt が届いてしまう（REPORT #125-AK で実測）。
//     そのとき送らずに 422（errorCode 'EGRESS_BLOCKED'、再試行しない種類のエラー）を返し、呼び出し側は
//     既存の失敗処理（プレースホルダ / 影絵）に落ちる。503 は fix478 が再試行するので使わない（GPT #125-AK）。
// 対象: POST かつ文字列 body の、画像生成エンドポイントだけ
//   gen.pollinations.ai/v1/images/generations / <app>/api/image / <worker>/image
//   ※検品（/inspect）・テキスト LLM・GET・保存 API は対象外（1 バイトも触らない）。
// 判定: body.prompt に CJK 文字（ひらがな・カタカナ・漢字・半角カナ）を含む、または
//       この document の物語（__chronicleGetState = この画面の S、無ければ __chr6WriteKey の slot）の
//       登録名（主人公・NPC の name、2 文字以上）を含む → 送らない。タブ共有ポインタ（chr6_active_slot）は見ない。
// 限界: CJK と登録名の検出は、既知の legacy 経路の漏れに対する限定的な防御。英語の秘密情報や別物語の名前は検出しない。
// 読込位置: 画像関連の fetch ラッパより前（ネットワークに近い内側）。後から入るラッパが外側になる。
// OFF: localStorage v292Dp8dOff='1'（live 評価・リロード不要）
// 検証口: window.__v292Dp8d = { status(), check(url, init) }
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dp8d && window.__v292Dp8d.__installed) return;
  var TAG = '[v292Dp8d:image-egress-guard]';
  var CJK = /[぀-ヿ㐀-鿿豈-﫿ｦ-ﾟ]/;
  var stats = { checked: 0, blocked: 0, blockedCjk: 0, blockedName: 0, passed: 0, unreadable: 0 };
  function off(){ try { return localStorage.getItem('v292Dp8dOff') === '1'; } catch(e){ return false; } }
  function urlOf(u){ try { return String((u && u.url) || u || ''); } catch(e){ return ''; } }
  function isImageGen(u, init){
    var m = String((init && init.method) || (u && u.method) || 'GET').toUpperCase();
    if (m !== 'POST') return false;
    var s = urlOf(u);
    if (s.indexOf('gen.pollinations.ai/v1/images/generations') >= 0) return true;
    var path = s.replace(/^https?:\/\/[^\/]+/, '').split('?')[0].split('#')[0];
    return path === '/api/image' || (/workers\.dev/.test(s) && path === '/image');
  }
  function castOfDocument(){
    try { var S = (typeof window.__chronicleGetState === 'function') ? window.__chronicleGetState('p8d') : null; if (S && S.cast) return S.cast; } catch(e){}
    try { var k = (typeof window.__chr6WriteKey === 'function') ? window.__chr6WriteKey() : null; if (k){ var d = JSON.parse(localStorage.getItem(k) || 'null'); if (d && d.cast) return d.cast; } } catch(e){}
    return null;
  }
  function names(){
    var out = [];
    try {
      var c = castOfDocument(); if (!c) return out;
      var all = [].concat(c.hero ? [c.hero] : [], Array.isArray(c.npcs) ? c.npcs : []);
      for (var i = 0; i < all.length; i++){ var n = all[i] && all[i].name; if (typeof n === 'string'){ n = n.trim(); if (n.length >= 2) out.push(n); } }
    } catch(e){}
    return out;
  }
  /* 戻り値: null = 送ってよい / 'cjk' / 'name' = 送らない */
  function verdict(prompt){
    var p = String(prompt == null ? '' : prompt);
    if (CJK.test(p)) return 'cjk';
    var ns = names();
    for (var i = 0; i < ns.length; i++){ if (p.indexOf(ns[i]) >= 0) return 'name'; }
    return null;
  }
  function check(u, init){
    if (off() || !isImageGen(u, init)) return null;
    stats.checked++;
    var b = init && init.body;
    if (typeof b !== 'string'){ stats.unreadable++; return null; }   // 文字列でない body は判定できない（既存の画像経路はすべて文字列）
    var j = null; try { j = JSON.parse(b); } catch(e){ j = null; }
    var prompt = j && typeof j === 'object' ? j.prompt : null;
    if (typeof prompt !== 'string'){ stats.passed++; return null; }
    var v = verdict(prompt);
    if (!v){ stats.passed++; return null; }
    stats.blocked++; if (v === 'cjk') stats.blockedCjk++; else stats.blockedName++;
    return v;
  }
  function BLOCK_BODY(v){ return JSON.stringify({ error: 'EGRESS_BLOCKED', errorCode: 'EGRESS_BLOCKED', reason: v, retry: false }); }
  var orig = window.fetch;
  if (typeof orig !== 'function') return;
  var wrapped = function(u, init){
    var v = null;
    try { v = check(u, init); } catch(e){ v = null; }
    if (v){
      try { console.info(TAG, 'blocked image-gen POST (' + v + ')'); } catch(e){}
      return Promise.resolve(new Response(BLOCK_BODY(v), { status: 422, statusText: 'EGRESS_BLOCKED', headers: { 'Content-Type': 'application/json; charset=utf-8' } }));
    }
    return orig.apply(this, arguments);
  };
  try { window.fetch = wrapped; } catch(e){ return; }
  /* XHR 経由の画像生成も同じ判定で止める（open で method / url を覚え、send で body を判定）。
     止めた場合は送らずに、非同期で error → loadend を発火させる（呼び出し側は通信失敗として扱う）。 */
  try {
    var XP = XMLHttpRequest.prototype, _open = XP.open, _send = XP.send;
    XP.open = function(method, url){ try { this.__p8dM = String(method || 'GET'); this.__p8dU = String(url || ''); } catch(e){} return _open.apply(this, arguments); };
    XP.send = function(body){
      var v = null;
      try { v = check(this.__p8dU || '', { method: this.__p8dM || 'GET', body: body }); } catch(e){ v = null; }
      if (v){
        var x = this;
        try { console.info(TAG, 'blocked image-gen XHR (' + v + ')'); } catch(e){}
        /* 通信失敗（error）ではなく「422 EGRESS_BLOCKED で完了した応答」として見せる（error だと再試行する呼び出し側があるため） */
        var bodyTxt = BLOCK_BODY(v);
        try { Object.defineProperty(x, 'readyState', { configurable: true, get: function(){ return 4; } }); } catch(e){}
        try { Object.defineProperty(x, 'status', { configurable: true, get: function(){ return 422; } }); } catch(e){}
        try { Object.defineProperty(x, 'statusText', { configurable: true, get: function(){ return 'EGRESS_BLOCKED'; } }); } catch(e){}
        try { Object.defineProperty(x, 'responseText', { configurable: true, get: function(){ return bodyTxt; } }); } catch(e){}
        try { Object.defineProperty(x, 'response', { configurable: true, get: function(){ return (x.responseType === 'json') ? JSON.parse(bodyTxt) : bodyTxt; } }); } catch(e){}
        setTimeout(function(){ try { x.dispatchEvent(new Event('readystatechange')); } catch(e){} try { x.dispatchEvent(new ProgressEvent('load')); } catch(e){} try { x.dispatchEvent(new ProgressEvent('loadend')); } catch(e){} }, 0);
        return;
      }
      return _send.apply(this, arguments);
    };
  } catch(e){}
  window.__v292Dp8d = { __installed: true, status: function(){ return { off: off(), checked: stats.checked, blocked: stats.blocked, blockedCjk: stats.blockedCjk, blockedName: stats.blockedName, passed: stats.passed, unreadable: stats.unreadable }; }, check: check };
  try { console.log(TAG, 'installed'); } catch(e){}
})();
