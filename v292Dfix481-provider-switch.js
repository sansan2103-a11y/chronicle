// =====================================================================
// Chronicle TRPG - v292Dfix481: アイコン生成プロバイダ切替スイッチ(Pollinations直行)
// ---------------------------------------------------------------------
// 背景(2026-07-17・おしん要望):
//   「一番安定していた頃」のアイコン(カエデ/レナ/リナ/ミリア)は旧Pollinations経路の出力。
//   2026-07-02のTogether移行後、同じプロンプトでも当時の絵柄は再現できない(実測)。
//   本fixは fetch境界で、アイコン生成POSTのbodyに imgProvider:'pollinations' を付け、
//   Worker v21 の明示Pollinations直行経路(fallbackではない・失敗は素直にエラー)へ流す。
//   fix476(3候補検品)より後にロード=外側 → 入口bodyに付けるので3候補すべてに継承される。
//
// 有効化(opt-in・既定OFF): localStorage.v292Dfix481OnV1='1' かつ v292Dfix481Off!=='1'(live評価)
// 検証口: window.__v292Dfix481 = { status(), __armed }
// ★index.html変更・デプロイは親が別途行う。本ファイルは新規1ファイルで完結。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix481 && window.__v292Dfix481.__armed) return;
  var TAG = '[v292Dfix481:provider]';
  var W = window;

  function on(){
    try {
      if (localStorage.getItem('v292Dfix481Off') === '1') return false;
      return localStorage.getItem('v292Dfix481OnV1') === '1';
    } catch(e){ return false; }
  }
  // fix471/475/476/478 と同一の対象判定
  function isAvatarGen(url, init){
    try {
      var u = String((url && url.url) || url || '');
      if (u.indexOf('gen.pollinations.ai/v1/images/generations') < 0 &&
          !(/workers\.dev/.test(u) && u.indexOf('/image') >= 0)) return false;
      return !!(init && init.method === 'POST' && typeof init.body === 'string');
    } catch(e){ return false; }
  }

  var _origFetch = W.fetch;
  var wrapped = function(url, init){
    try {
      if (on() && isAvatarGen(url, init)){
        var b = JSON.parse(String(init.body));
        if (b && b.imgProvider == null){
          b.imgProvider = 'pollinations';
          init = Object.assign({}, init, { body: JSON.stringify(b) });
          return _origFetch.call(this, url, init);
        }
      }
    } catch(e){ try { console.warn(TAG, 'wrap error', e); } catch(_){} }
    return _origFetch.apply(this, arguments);
  };
  // fix419cの教訓: own props全継承
  try {
    Object.getOwnPropertyNames(_origFetch).forEach(function(k){
      if (k === 'length' || k === 'name' || k === 'arguments' || k === 'caller' || k === 'prototype') return;
      try { Object.defineProperty(wrapped, k, Object.getOwnPropertyDescriptor(_origFetch, k)); } catch(e){}
    });
    try { Object.defineProperty(wrapped, 'name', { value: (_origFetch && _origFetch.name) || 'fetch', configurable: true }); } catch(e){}
    if (_origFetch && _origFetch.prototype) { try { wrapped.prototype = _origFetch.prototype; } catch(e){} }
  } catch(e){}
  wrapped.__v292Dfix481 = true;
  W.fetch = wrapped;

  W.__v292Dfix481 = { __armed: true, status: function(){ return { on: on(), armed: true }; } };
  try { console.log(TAG, 'armed; active:', on() ? 'on(pollinations)' : 'off(together)'); } catch(e){}
})();
