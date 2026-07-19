// =====================================================================
// Chronicle TRPG - v292Dfix492: アイコン生成の最終失敗トースト
// ---------------------------------------------------------------------
// 背景(2026-07-19):
//   アイコン生成は window.fetch の POST(gen.pollinations.ai / *.workers.dev/image)
//   で行われ、多層の fetch ラッパ(fix478 リトライ / fix476 検品 / fix491 無料
//   フォールバック)を通る。全層を尽くしてなお失敗すると、呼び出し元へは
//   「502 等の非ok Response」または「reject」が返るが、現状はコンソールにしか
//   出ずユーザーには何も見えない(「↻しても無反応」に見える)。
//
// 本fixは【最外殻】(index.html で最後にロード=私が配線)の fetch ラッパとして、
//   元リクエストの最終結果「だけ」を観測し、失敗時に控えめなトーストを出す。
//   Response は絶対に消費(json()/text())も改変も遅延もしない=読取専用の観測。
//
// ★注意:
//   1. 観測のみ。then/catch を挟むが、結果はそのまま return / 再throw する。
//   2. AbortError(ユーザー操作/内部キャンセル)はトーストしない。
//   3. 402/429=混雑、5xx/network=不調 の2文言。
//   4. 自前の div#v292f492toast だけを触る。既存DOMのテキスト・属性は不触
//      (このプロジェクトの地雷)。
//   5. レート制限(30s)・document.hidden 中は非表示。同時1つ。
// ---------------------------------------------------------------------
// OFFスイッチ(live評価・既定ON): localStorage.v292Dfix492Off==='1' でパススルー
// 冪等ガード: window.__v292Dfix492.__armed
// 検証口: window.__v292Dfix492 = { isAvatarGen, notifyFail(テスト用), stats, status }
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix492 && window.__v292Dfix492.__armed) return;   // 二重arm禁止
  var TAG = '[v292Dfix492:genfail-toast]';

  var RATE_MS = 30000;   // 前回表示からこの時間内は出さない
  var HIDE_MS = 6000;    // 表示継続
  var FADE_MS = 400;     // フェードアウト完了までの待ち
  var MSG_BUSY = '画像の生成が混み合っています。少し待ってから ↻ でやり直せます';
  var MSG_DOWN = '画像サービスが不調です。アイコンは後から ↻ で作り直せます';

  var stats = { toasts: 0, rateSkipped: 0, hiddenSkipped: 0, fails: 0 };
  var lastShown = 0;
  var pendingMsg = null, waitingDom = false;

  // ---------- OFFスイッチ(live・既定ON) ----------
  // 読取不能時はトースト有効側(=既定動作)へ。トーストは無害なので安全側。
  function off(){
    try { return localStorage.getItem('v292Dfix492Off') === '1'; }
    catch(e){ return false; }
  }

  // ---------- 対象判定(fix475/476/478/481/491 と同一) ----------
  function isAvatarGen(url, init){
    try {
      var u = String((url && url.url) || url || '');
      if (u.indexOf('gen.pollinations.ai/v1/images/generations') < 0 &&
          !(/workers\.dev/.test(u) && u.indexOf('/image') >= 0)) return false;
      return !!(init && init.method === 'POST' && typeof init.body === 'string');
    } catch(e){ return false; }
  }

  // ---------- トーストUI(自前 div のみ触る) ----------
  function isHidden(){
    try { return !!(document && document.hidden); } catch(e){ return false; }
  }
  function bodyOf(){
    try { return (document && document.body) || null; } catch(e){ return null; }
  }
  function applyStyle(el){
    var s = el.style;
    s.position = 'fixed';
    s.bottom = '18px';
    s.left = '50%';
    s.transform = 'translateX(-50%)';
    s.background = 'rgba(20,18,30,.92)';
    s.color = '#cfc8e8';
    s.fontSize = '12px';
    s.padding = '8px 14px';
    s.borderRadius = '8px';
    s.zIndex = '2147483000';
    s.pointerEvents = 'none';
    s.transition = 'opacity 0.3s';
    s.opacity = '0';
  }
  function fadeOut(el){
    try { el.style.opacity = '0'; } catch(e){}
    setTimeout(function(){
      try { if (el.parentNode) el.parentNode.removeChild(el); } catch(e){}
    }, FADE_MS);
  }
  function showToast(msg){
    var body = bodyOf();
    if (!body){
      // body 未生成 → DOMContentLoaded 後に遅延生成
      pendingMsg = msg;
      if (!waitingDom){
        waitingDom = true;
        try {
          document.addEventListener('DOMContentLoaded', function(){
            waitingDom = false;
            if (pendingMsg != null){ var m = pendingMsg; pendingMsg = null; showToast(m); }
          }, { once: true });
        } catch(e){}
      }
      return;
    }
    var el = null;
    try { el = document.getElementById('v292f492toast'); } catch(e){ el = null; }
    if (!el){
      el = document.createElement('div');
      el.id = 'v292f492toast';
      applyStyle(el);
      body.appendChild(el);
    }
    // 既存があればテキスト差替+タイマー延長(同時表示は1つ)
    el.textContent = msg;
    try { el.style.opacity = '1'; } catch(e){}
    if (el.__f492Timer){ try { clearTimeout(el.__f492Timer); } catch(e){} }
    el.__f492Timer = setTimeout(function(){ fadeOut(el); }, HIDE_MS);
  }

  // ---------- 失敗通知(検証口・テスト用に公開) ----------
  function notifyFail(status){
    try {
      stats.fails++;
      if (isHidden()){ stats.hiddenSkipped++; return; }
      var now = Date.now();   // ※テストで Date.now 差替可
      if (lastShown && (now - lastShown) < RATE_MS){ stats.rateSkipped++; return; }
      var msg = (status === 402 || status === 429) ? MSG_BUSY : MSG_DOWN;
      showToast(msg);
      lastShown = now;
      stats.toasts++;
    } catch(e){ try { console.warn(TAG, 'notifyFail error', e); } catch(_){} }
  }

  // ---------- fetch ラッパ(結果を観測するだけ) ----------
  var _origFetch = window.fetch;
  var wrapped = function(url, init){
    var isTarget = false;
    try { isTarget = (!off()) && isAvatarGen(url, init); } catch(e){ isTarget = false; }
    if (!isTarget) return _origFetch.apply(this, arguments);   // 非対象/OFF → 完全素通し

    var p = _origFetch.apply(this, arguments);
    try {
      return p.then(function(resp){
        // Response は消費・改変・遅延しない。status を覗くだけ。
        try {
          if (resp && resp.ok === false){
            var s = resp.status;
            if (s === 402 || s === 429 || (s >= 500 && s <= 599)) notifyFail(s);
          }
        } catch(e){}
        return resp;                       // 同一参照のまま返す
      }, function(err){
        try {
          if (!(err && err.name === 'AbortError')) notifyFail('network');   // Abortは無視
        } catch(e){}
        throw err;                         // reject はそのまま伝播
      });
    } catch(e){ return p; }
  };

  // ---------- own props 全継承(fix419c の教訓) ----------
  try {
    Object.getOwnPropertyNames(_origFetch).forEach(function(k){
      if (k === 'length' || k === 'name' || k === 'arguments' || k === 'caller' || k === 'prototype') return;
      try { Object.defineProperty(wrapped, k, Object.getOwnPropertyDescriptor(_origFetch, k)); } catch(e){}
    });
    try { Object.defineProperty(wrapped, 'name', { value: (_origFetch && _origFetch.name) || 'fetch', configurable: true }); } catch(e){}
    if (_origFetch && _origFetch.prototype){ try { wrapped.prototype = _origFetch.prototype; } catch(e){} }
  } catch(e){}
  wrapped.__v292Dfix492 = true;
  window.fetch = wrapped;

  window.__v292Dfix492 = {
    __armed: true,
    isAvatarGen: isAvatarGen,
    notifyFail: notifyFail,
    stats: stats,
    status: function(){ return { on: !off(), armed: true, lastShown: lastShown, stats: stats }; }
  };
  try { console.log(TAG, 'armed; off:', off()); } catch(e){}
})();
