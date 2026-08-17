// =====================================================================
// v292Dfix690 newstory-firstboot-probe   ★DIAGNOSTIC ONLY / 観測専用 / 一時出荷
// 目的: **ホーム UI の正規経路で新規作成した登録済み物語 Y の「初回 boot」**を観測し、
//       chr6_slot_Y が
//         CASE A … story page の最初の自然な GET の時点で既に foreign（= 入る前から壊れている）
//         CASE B … 最初は正常 0T で、その後 SET で foreign サイズに置き換わる（= root write boundary）
//         CASE C … GET/SET は正常なのに boot 後の S だけ foreign（= 別 apply path）
//       のどれかを判定する。
// ★#54 の反省:
//   ・caller が全件空だった。stack frame が `index.html?v=…&story=…:12345:6` の形で、
//     query 付き URL に正規表現が一致していなかった → RE_FRAME を修正し契約試験を追加。
//   ・CAP 600 で 349 件 drop した → CAP を上げ、**観測対象キーを絞って**総量を抑える。
//   ・`chr6`（default 本体）が記録対象外だった → 追加。
// 観測対象（GET はここに絞る。無差別に増やさない）:
//   chr6_active_slot / chr6 / chr6_slot_<Y> / chr6_slot_<X> /
//   __gen_chr6_slot_<Y> / __gen_chr6_slot_<X>
//     Y = URL の ?story（この画面の物語）
//     X = probe ロード時点の chr6_active_slot 実値（直前に開いていた物語 = source 候補）
// 観測対象（SET は広く取る。今回の最重要項目）:
//   chr6_active_slot / **すべての chr6_slot_*** / chr6
// 記録項目: t / op / key / value length / caller / URL story / chr6_active_slot 実値 /
//           window.__chronicleStoryId / S.turns.length。**payload 本文と hash は取らない。**
// ★in-memory のみ。localStorage / sessionStorage へ 1 バイトも書かない。
// ★観測専用。storage mutation / containment / active_slot 変更 / save 誘発 / migration は行わない。
// ★fix654 の accessor trap があるため prototype 代入は無効。instance 代入で登録する。
// kill switch: localStorage['v292Dfix690Off'] === '1'
// 検証口: window.__v292Dfix690 = { log, state, summary, timeline, verdict, clear }
// =====================================================================
(function(){
  'use strict';
  if (window.__f690done) return; window.__f690done = 1;
  var TAG = '[v292Dfix690:newstory-firstboot-probe]';

  var LOG = [], CAP = 3000, dropped = 0;
  var t0 = (function(){ try { return performance.now(); } catch(e){ return 0; } })();
  function now(){ try { return Math.round((performance.now() - t0) * 10) / 10; } catch(e){ return -1; } }

  var origGet, origSet;
  try { origGet = localStorage.getItem; origSet = localStorage.setItem; } catch(e){ return; }
  if (typeof origGet !== 'function' || typeof origSet !== 'function') return;

  function rawGet(k){ try { return origGet.call(localStorage, String(k)); } catch(e){ return null; } }
  function isOff(){ return rawGet('v292Dfix690Off') === '1'; }
  function currentStory(){
    try { return new URLSearchParams(location.search).get('story') || ''; } catch(e){ return ''; }
  }
  function activeNow(){
    var v = rawGet('chr6_active_slot');
    if (v == null) return null;
    try { return JSON.parse(String(v)); } catch(e){ return String(v); }
  }

  // ---- 観測対象キーの確定（probe ロード時点で 1 回だけ）----
  var Y = currentStory();                 // この画面の物語
  var X = activeNow();                    // 直前に開いていた物語（source 候補）
  var WATCH = { 'chr6_active_slot': 1, 'chr6': 1 };
  if (Y){ WATCH['chr6_slot_' + Y] = 1; WATCH['__gen_chr6_slot_' + Y] = 1; }
  if (X){ WATCH['chr6_slot_' + X] = 1; WATCH['__gen_chr6_slot_' + X] = 1; }

  // ★#54 修正: `file.js?cb=…:line:col` / `index.html?v=…&story=…:line:col` の両方に一致させる
  var RE_FRAME = /([A-Za-z0-9_.-]+\.(?:js|html))(?:\?[^\s:)]*)?:(\d+):\d+/g;
  function callerOf(){
    try {
      var st = (new Error()).stack || '';
      RE_FRAME.lastIndex = 0;
      var out = [], m;
      while ((m = RE_FRAME.exec(st)) && out.length < 4){
        if (m[1].indexOf('fix690') >= 0) continue;   // 自分自身の frame は落とす
        out.push(m[1] + ':' + m[2]);
      }
      return out.join(' < ');
    } catch(e){ return ''; }
  }
  function turnsNow(){
    try {
      if (typeof window.__chronicleGetState !== 'function') return null;
      var S = window.__chronicleGetState('v292Dfix690');
      if (!S || !Array.isArray(S.turns)) return null;
      return S.turns.length;
    } catch(e){ return null; }
  }
  function storyIdGlobal(){
    try { return (typeof window.__chronicleStoryId === 'string') ? window.__chronicleStoryId : null; } catch(e){ return null; }
  }
  function f527(){
    try { var a = window.__v292Dfix527;
          return (a && typeof a.storyId === 'function') ? a.storyId() : null; } catch(e){ return null; }
  }
  function push(rec){ if (LOG.length >= CAP){ dropped++; return null; } LOG.push(rec); return rec; }

  function rec(op, key, len){
    return { t: now(), op: op, key: key, len: len,
             urlStory: currentStory(), active: activeNow(),
             chronicleStoryId: storyIdGlobal(), f527StoryId: f527(),
             turns: turnsNow(), ready: (function(){ try { return document.readyState; } catch(e){ return ''; } })(),
             caller: callerOf() };
  }

  // ---- GET: 対象キーだけ記録。完全 pass-through。----
  localStorage.getItem = function(k){
    var r = origGet.apply(this, arguments);
    try {
      if (!isOff()){
        var key = String(k);
        if (WATCH[key] === 1){
          var e = rec('GET', key, (r == null ? null : String(r).length));
          if (key === 'chr6_active_slot'){
            try { e.value = r == null ? null : JSON.parse(String(r)); } catch(e2){ e.value = String(r); }
          }
          push(e);
        }
      }
    } catch(e){}
    return r;
  };

  // ---- SET: chr6_active_slot / 全 chr6_slot_* / chr6 を記録。値は一切変更しない。----
  localStorage.setItem = function(k, v){
    var e = null;
    try {
      if (!isOff()){
        var key = String(k);
        var isSlot = (key.indexOf('chr6_slot_') === 0);
        if (isSlot || key === 'chr6_active_slot' || key === 'chr6'){
          e = rec('SET', key, (v == null ? null : String(v).length));
          e.ok = false;
          if (key === 'chr6_active_slot'){
            try { e.value = JSON.parse(String(v)); } catch(e2){ e.value = String(v); }
            e.prev = e.active;
          }
          if (isSlot) e.slotId = key.slice(10);
          push(e);
        }
      }
    } catch(e2){}
    var r;
    try { r = origSet.apply(this, arguments); }
    catch(err){ try { if (e) e.threw = String((err && err.name) || err).slice(0, 40); } catch(e3){} throw err; }
    try { if (e) e.ok = true; } catch(e4){}
    return r;
  };

  function bodyLen(k){ var v = rawGet(k); return v == null ? null : v.length; }
  function bodyTurns(k){
    var v = rawGet(k); if (v == null) return null;
    try { var d = JSON.parse(v); return (d && Array.isArray(d.turns)) ? d.turns.length : null; } catch(e){ return 'ERR'; }
  }

  window.__v292Dfix690 = {
    __armed: true,
    watchKeys: function(){ return Object.keys(WATCH); },
    log: function(){ return LOG.slice(); },
    clear: function(){ LOG.length = 0; dropped = 0; },
    state: function(){
      return { armed: !isOff(), off: isOff(), Y: Y, X: X,
               urlStory: currentStory(), active: activeNow(),
               chronicleStoryId: storyIdGlobal(), f527StoryId: f527(),
               events: LOG.length, dropped: dropped, cap: CAP, turnsNow: turnsNow(),
               yLen: Y ? bodyLen('chr6_slot_' + Y) : null,
               yTurns: Y ? bodyTurns('chr6_slot_' + Y) : null,
               xLen: X ? bodyLen('chr6_slot_' + X) : null,
               xTurns: X ? bodyTurns('chr6_slot_' + X) : null };
    },
    timeline: function(limit){
      var n = limit || 80, out = [];
      for (var i = 0; i < LOG.length && out.length < n; i++){
        var e = LOG[i];
        var k = (e.key === 'chr6_slot_' + Y) ? 'Y' : (X && e.key === 'chr6_slot_' + X) ? 'X' : e.key;
        out.push(e.t + ' ' + e.op + ' ' + k + ' len=' + e.len +
                 ' [active=' + e.active + ' f527=' + e.f527StoryId + ' turns=' + e.turns + '] ' + e.caller);
      }
      return out;
    },
    // ★CASE A / B / C の一次判定材料（最終判定は人間が行う）
    verdict: function(foreignMin){
      var big = (typeof foreignMin === 'number') ? foreignMin : 50000;
      var firstY = null, firstYSet = null, ySets = [], otherSets = [];
      for (var i = 0; i < LOG.length; i++){
        var e = LOG[i];
        if (e.key === 'chr6_slot_' + Y){
          if (e.op === 'GET' && firstY === null) firstY = e;
          if (e.op === 'SET'){ if (!firstYSet) firstYSet = e; ySets.push({ t: e.t, len: e.len, caller: e.caller, turns: e.turns }); }
        } else if (e.op === 'SET' && e.key.indexOf('chr6_slot_') === 0){
          otherSets.push({ t: e.t, slot: e.slotId, len: e.len, caller: e.caller, turns: e.turns });
        }
      }
      return {
        Y: Y, X: X,
        firstGetOnY: firstY ? { t: firstY.t, len: firstY.len, caller: firstY.caller } : null,
        firstGetLooksForeign: firstY ? (firstY.len != null && firstY.len >= big) : null,
        setsOnY: ySets.slice(0, 10),
        setsOnOtherSlots: otherSets.slice(0, 10),
        turnsAfterBoot: turnsNow(),
        note: 'CASE A = firstGetLooksForeign true / CASE B = firstGet 正常かつ setsOnY に foreign サイズ / CASE C = 両方正常で turnsAfterBoot だけ foreign'
      };
    },
    summary: function(){
      var byTag = {};
      for (var i = 0; i < LOG.length; i++){ var e = LOG[i]; var t = e.op + ':' + e.key; byTag[t] = (byTag[t] || 0) + 1; }
      return { byTag: byTag, events: LOG.length, dropped: dropped };
    }
  };
  try { console.log(TAG, 'loaded (diagnostic only, in-memory log)'); } catch(e){}
})();
