// =====================================================================
// v292Dfix685 apply-identity-guard   (fix684 と 2 段 containment)
// 役割分担:
//   fix684 = WRITE containment … 物語画面で chr6_slot_B (B != URL story) への write を拒否
//   fix685 = APPLY IDENTITY containment … pull package の active identity を採用させない
// 症状(実測): cloud package は localStorage 全体スナップショット(full:true / 285 keys)で、
//   pkg.activeSlot = "smsvot5mnbj" と pkg.ls['chr6_active_slot'] = "\"smsvot5mnbj\"" を持つ。
//   boot 時に applySave がこれを復元すると、URL が別 story でも
//   __chr6Key() が foreign slot を返し、current S が foreign payload で埋まる。
// 本モジュールが触るのは **active identity の採用箇所だけ**。
//   ・package 全体の apply は止めない（他 284 キーは従来どおり）
//   ・URL story A に対応する chr6_slot_A の正常 restore は通す（新規端末の hydrate を残す）
//   ・foreign slot B の write は fix684 が担当（本モジュールは関与しない）
// ★current story は初期化時にキャッシュせず、判定時点の location.search から取得する。
// ★新規永続 schema は追加しない。使う identity は
//   URL ?story / pkg.activeSlot / pkg.ls['chr6_active_slot'] / storage key だけ。
//   本文・キャラ名・物語内容から story identity を推定しない。
// home(?story 無し)では何もしない ＝ 「最後に開いていた物語を復元する」既存仕様を維持。
// kill switch: localStorage['v292Dfix685Off'] === '1'
// 検証口: window.__v292Dfix685 = { state, __armed }
// =====================================================================
(function(){
  'use strict';
  if (window.__f685done) return; window.__f685done = 1;
  var TAG = '[v292Dfix685:apply-identity]';

  function ls(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return ls('v292Dfix685Off') === '1'; }
  // ★毎回 URL から読む（キャッシュしない）
  function currentStory(){
    try { return new URLSearchParams(location.search).get('story') || ''; } catch(e){ return ''; }
  }

  var stats = { sanitizedPkgField: 0, sanitizedPkgLsKey: 0, blockedActiveWrites: 0,
                lastPkgActiveSlot: null, applyCalls: 0 };

  // ---- (1) storage backstop: foreign な chr6_active_slot の書き込みを採用しない ----
  var origSet;
  try { origSet = localStorage.setItem; } catch(e){ origSet = null; }
  if (typeof origSet === 'function'){
    localStorage.setItem = function(k, v){
      try {
        if (!off() && String(k) === 'chr6_active_slot'){
          var cur = currentStory();
          if (cur){
            var val = null;
            try { val = JSON.parse(String(v)); } catch(e){ val = String(v); }
            if (typeof val === 'string' && val && val !== cur){
              stats.blockedActiveWrites++;
              try { console.warn(TAG, 'blocked foreign active identity', val, 'url=', cur); } catch(e){}
              return;   // ★URL の story を正とする
            }
          }
        }
      } catch(e){}
      return origSet.apply(localStorage, arguments);
    };
  }

  // ---- (2) applySave(pkg) の active identity だけ無害化 ----
  function sanitize(pkg){
    var cur = currentStory();
    if (off() || !cur || !pkg || typeof pkg !== 'object') return;
    stats.applyCalls++;
    try { stats.lastPkgActiveSlot = pkg.activeSlot || null; } catch(e){}
    try {
      if (pkg.ls && Object.prototype.hasOwnProperty.call(pkg.ls, 'chr6_active_slot')){
        delete pkg.ls['chr6_active_slot'];      // ★他 284 キーには触らない
        stats.sanitizedPkgLsKey++;
      }
    } catch(e){}
    try {
      if (pkg.activeSlot && pkg.activeSlot !== cur){
        pkg.activeSlot = cur;                   // ★URL の story を正とする
        stats.sanitizedPkgField++;
      }
    } catch(e){}
  }
  function wrapApply(api){
    try {
      if (!api || typeof api.applySave !== 'function' || api.__f685wrapped) return api;
      var orig = api.applySave;
      api.applySave = function(pkg){ try { sanitize(pkg); } catch(e){} return orig.apply(this, arguments); };
      api.__f685wrapped = true;
      try { console.log(TAG, 'wrapped applySave'); } catch(e){}
    } catch(e){}
    return api;
  }
  if (window.__v292Dfix399x){ wrapApply(window.__v292Dfix399x); }
  else {
    // まだ未定義なら、代入された瞬間に包む（script 順が前後しても取り逃さない）
    var held;
    try {
      Object.defineProperty(window, '__v292Dfix399x', {
        configurable: true,
        get: function(){ return held; },
        set: function(v){ held = wrapApply(v); }
      });
    } catch(e){}
  }

  window.__v292Dfix685 = {
    __armed: true,
    currentStory: currentStory,
    stats: function(){ return { sanitizedPkgField: stats.sanitizedPkgField,
                                sanitizedPkgLsKey: stats.sanitizedPkgLsKey,
                                blockedActiveWrites: stats.blockedActiveWrites,
                                lastPkgActiveSlot: stats.lastPkgActiveSlot,
                                applyCalls: stats.applyCalls }; },
    state: function(){ return { armed: !off(), urlStory: currentStory(), off: off(),
                                wrappedApplySave: !!(window.__v292Dfix399x && window.__v292Dfix399x.__f685wrapped) }; }
  };
  try { console.log(TAG, 'loaded (default ON; off=' + (off() ? '1' : '0') + ')'); } catch(e){}
})();
