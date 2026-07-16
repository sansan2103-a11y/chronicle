// =====================================================================
// Chronicle TRPG - v292Dfix478: アイコン生成の自動リトライ（502/429対策）
// ---------------------------------------------------------------------
// 背景(2026-07-16):
//   Worker v19d(strict)はTogether一時失敗で502を返す（黙ったfallback禁止は仕様）。
//   現状リトライがなく、新キャラのアイコンが「一時失敗→プレースホルダのまま」に
//   なる実害（本日実測: POST /image 502×2でレオン・ミカが未生成）。
//   本fixは fetch境界で、アイコン生成POSTの応答が status 429/502/503/524 または
//   ネットワーク例外のとき、最大2回（待機 1200ms→2600ms）再試行する。
//   成功・それ以外のstatusは即返す。
//
//   ★index.htmlでは fix475 より後（=より外側）に読み込む想定。再試行は
//     「自分の入口の url/init」をそのまま内側fetch（=fix475等で正規化される最終形）へ
//     再送する。内側は毎回同一結果（冪等）なので安全。外側チェーン全体は再実行しない。
//   ★index.html変更・デプロイは親が別途行う。本ファイルは新規1ファイルで完結。
// ---------------------------------------------------------------------
// OFF=localStorage.v292Dfix478Off==='1'（live評価）。冪等ガード・own props全継承(fix419c)。
// 検証口: window.__v292Dfix478 = { isAvatarGen, status, __sleep(テスト差替可) }
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix478 && window.__v292Dfix478.__armed) return;   // 二重arm禁止
  var TAG = '[v292Dfix478]';

  var RETRYABLE = { 429: 1, 502: 1, 503: 1, 524: 1 };   // 再試行対象status
  var WAITS = [1200, 2600];                              // 再試行前の待機(ms)。最大2回。
  var MAX_RETRY = 2;

  // ---------- OFF スイッチ（live評価。読取不能時は安全側=passthrough） ----------
  function off(){
    try { return localStorage.getItem('v292Dfix478Off') === '1'; } catch(e){ return true; }
  }

  // ---------- 対象判定（fix471/475 と同一の isAvatarGen） ----------
  function isAvatarGen(url, init){
    try {
      var u = String((url && url.url) || url || '');
      if (u.indexOf('gen.pollinations.ai/v1/images/generations') < 0 &&
          !(/workers\.dev/.test(u) && u.indexOf('/image') >= 0)) return false;
      return !!(init && init.method === 'POST' && typeof init.body === 'string');
    } catch(e){ return false; }
  }

  // ---------- 待機（テスト差替シーム: window.__v292Dfix478.__sleep） ----------
  function sleep(ms){
    try {
      var s = window.__v292Dfix478 && window.__v292Dfix478.__sleep;
      if (typeof s === 'function') return Promise.resolve(s(ms));
    } catch(e){}
    return new Promise(function(r){ setTimeout(r, ms); });
  }

  var _origFetch = window.fetch;

  // ---------- 対象リクエストのリトライ本体 ----------
  //   attempt=0 が初回、以降 attempt=1..MAX_RETRY が再試行。
  //   再試行前に console.info で1行。status は直前の応答status（例外時は 'reject'）。
  function fetchWithRetry(self, url, init){
    var lastResp = null, hadResp = false, lastErr = null;
    function step(attempt){
      var pre;
      if (attempt > 0){
        var st = hadResp && lastResp ? lastResp.status : 'reject';
        try { console.info(TAG + ' retry ' + attempt + '/' + MAX_RETRY + ' status=' + st); } catch(e){}
        pre = sleep(WAITS[attempt - 1]);
      } else {
        pre = Promise.resolve();
      }
      return pre.then(function(){
        // 内側fetch（=自分がラップした元fetch）へ、入口の url/init をそのまま再送。
        // init.body は string のため再利用可。Responseは consume しない（statusのみ参照）。
        return _origFetch.apply(self, [url, init]).then(function(resp){
          hadResp = true; lastResp = resp; lastErr = null;
          var s = resp ? resp.status : undefined;
          if (RETRYABLE[s] && attempt < MAX_RETRY) return step(attempt + 1);
          return resp;                        // 成功 or 非対象status or 再試行上限 → そのまま返す
        }, function(err){
          hadResp = false; lastErr = err;
          if (attempt < MAX_RETRY) return step(attempt + 1);
          throw err;                          // 再試行上限 → 最後の例外をそのまま投げる
        });
      });
    }
    return step(0);
  }

  // ---------- fetch ラッパ ----------
  var wrapped = function(url, init){
    try {
      if (!off() && isAvatarGen(url, init)){
        return fetchWithRetry(this, url, init);
      }
    } catch(e){ try { console.warn(TAG, 'wrap error', e); } catch(_){} }
    return _origFetch.apply(this, arguments);   // 非対象・OFF・例外 → 完全素通し
  };

  // ---------- own props 全継承（fix419cの教訓） ----------
  try {
    Object.getOwnPropertyNames(_origFetch).forEach(function(k){
      if (k === 'length' || k === 'name' || k === 'arguments' || k === 'caller' || k === 'prototype') return;
      try { Object.defineProperty(wrapped, k, Object.getOwnPropertyDescriptor(_origFetch, k)); } catch(e){}
    });
    try { Object.defineProperty(wrapped, 'name', { value: (_origFetch && _origFetch.name) || 'fetch', configurable: true }); } catch(e){}
    if (_origFetch && _origFetch.prototype) { try { wrapped.prototype = _origFetch.prototype; } catch(e){} }
  } catch(e){}
  wrapped.__v292Dfix478 = true;    // 冪等フラグはラッパ関数上にも立てる
  window.fetch = wrapped;

  // ---------- 検証口 ----------
  window.__v292Dfix478 = {
    __armed: true,
    isAvatarGen: isAvatarGen,
    WAITS: WAITS,
    MAX_RETRY: MAX_RETRY,
    __sleep: null,                 // テストで差替（本番はnull=実setTimeout）
    status: function(){ return { off: off(), armed: true }; }
  };
  try { console.log(TAG, 'armed; off:', off()); } catch(e){}
})();
