// =====================================================================
// v292Dfix689 registered-boot-probe   ★DIAGNOSTIC ONLY / 観測専用 / 一時出荷
// 目的: **chr6_slots_meta へ正規登録済みの物語**を ?story=A で boot したとき、
//       過去に未登録 canary で観測した STOP 条件 B（fix30 bootLoadActiveSlot が
//       stale mirror B を読んで S を上書きする）が本当に成立するかを再測定する。
//       未登録 id では fix527 が early return するため、過去観測は
//       UNREGISTERED_STORY_COMPAT_PATH に限定される（CANARY_METHOD_CONFOUND_001）。
// 観測対象:
//   GET … chr6_active_slot / chr6_slot_* / __gen_chr6_slot*
//   SET … chr6_active_slot / chr6_slot_*（記録のみ。値は変更しない）
//   それ以外の storage 操作は記録しない。
// ★記録は in-memory のみ。localStorage / sessionStorage へ 1 バイトも書かない。
// ★観測専用。storage 値変更 / active_slot 変更 / slot 削除 / payload 変更 /
//   containment / save 発火 / migration は一切行わない。
// ★fix654 が Storage.prototype を accessor trap にしているため prototype 代入は無効。
//   fix684 / fix685 / fix686 で実証済みの instance 代入で登録する。
// ★透過性: 元の getItem / setItem の return value / arguments / this / throw を維持する。
// kill switch: localStorage['v292Dfix689Off'] === '1'
// 検証口: window.__v292Dfix689 = { log, state, summary, timeline, clear }
// =====================================================================
(function(){
  'use strict';
  if (window.__f689done) return; window.__f689done = 1;
  var TAG = '[v292Dfix689:registered-boot-probe]';

  var LOG = [], CAP = 600, dropped = 0;
  var t0 = (function(){ try { return performance.now(); } catch(e){ return 0; } })();

  function now(){ try { return Math.round((performance.now() - t0) * 10) / 10; } catch(e){ return -1; } }

  function currentStory(){
    try { return new URLSearchParams(location.search).get('story') || ''; } catch(e){ return ''; }
  }
  // ★caller は file.js:line の形だけを取り出す（生ソース片・URL・query を持ち出さない）
  var RE_FRAME = /([A-Za-z0-9_.-]+\.(?:js|html)):(\d+):\d+/g;
  function callerOf(){
    try {
      var st = (new Error()).stack || '';
      RE_FRAME.lastIndex = 0;
      var out = [], m, n = 0;
      while ((m = RE_FRAME.exec(st)) && out.length < 4){
        n++;
        if (m[1].indexOf('fix689') >= 0) continue;   // 自分自身の frame は落とす
        out.push(m[1] + ':' + m[2]);
      }
      return out.join(' < ');
    } catch(e){ return ''; }
  }
  function turnsNow(){
    try {
      if (typeof window.__chronicleGetState !== 'function') return null;
      var S = window.__chronicleGetState('v292Dfix689');
      if (!S || !Array.isArray(S.turns)) return null;
      return S.turns.length;
    } catch(e){ return null; }
  }
  function storyIdGlobal(){
    try { return (typeof window.__chronicleStoryId === 'string') ? window.__chronicleStoryId : null; } catch(e){ return null; }
  }
  function f527(){
    try {
      var a = window.__v292Dfix527;
      if (!a || typeof a.storyId !== 'function') return null;
      return a.storyId();
    } catch(e){ return null; }
  }
  function push(rec){
    if (LOG.length >= CAP){ dropped++; return null; }
    LOG.push(rec); return rec;
  }
  function kindOf(k){
    if (k === 'chr6_active_slot') return 'ACTIVE';
    if (k.indexOf('__gen_chr6_slot') === 0) return 'GEN';
    if (k.indexOf('chr6_slot_') === 0) return 'SLOT';
    return null;
  }

  var origGet, origSet;
  try { origGet = localStorage.getItem; origSet = localStorage.setItem; } catch(e){ return; }
  if (typeof origGet !== 'function' || typeof origSet !== 'function') return;

  function rawActive(){
    try {
      var v = origGet.call(localStorage, 'chr6_active_slot');
      if (v == null) return null;
      try { return JSON.parse(String(v)); } catch(e){ return String(v); }
    } catch(e){ return null; }
  }
  function isOff(){
    try { return origGet.call(localStorage, 'v292Dfix689Off') === '1'; } catch(e){ return false; }
  }
  function base(op, key, kind){
    return { t: now(), op: op, kind: kind, key: key,
             urlStory: currentStory(),
             activeNow: rawActive(),
             chronicleStoryId: storyIdGlobal(),
             f527StoryId: f527(),
             ready: (function(){ try { return document.readyState; } catch(e){ return ''; } })(),
             caller: callerOf(), turns: turnsNow() };
  }

  // ---- GET: 完全 pass-through。記録は呼び出し後（値の長さが要るため）。----
  localStorage.getItem = function(k){
    var r = origGet.apply(this, arguments);
    try {
      if (!isOff()){
        var key = String(k), kind = kindOf(key);
        if (kind){
          var rec = base('GET', key, kind);
          rec.len = (r == null ? null : String(r).length);
          if (kind === 'ACTIVE'){
            try { rec.value = r == null ? null : JSON.parse(String(r)); } catch(e){ rec.value = String(r); }
          }
          push(rec);
        }
      }
    } catch(e){}
    return r;
  };

  // ---- SET: chr6_active_slot と chr6_slot_* を記録。値は一切変更しない。----
  localStorage.setItem = function(k, v){
    var rec = null;
    try {
      if (!isOff()){
        var key = String(k), kind = kindOf(key);
        if (kind === 'ACTIVE' || kind === 'SLOT'){
          rec = base('SET', key, kind);
          rec.len = (v == null ? null : String(v).length);
          rec.ok = false;
          if (kind === 'ACTIVE'){
            try { rec.value = JSON.parse(String(v)); } catch(e){ rec.value = String(v); }
            rec.prev = rec.activeNow;
          }
          push(rec);
        }
      }
    } catch(e){}
    var r;
    try { r = origSet.apply(this, arguments); }
    catch(e){ try { if (rec) rec.threw = String((e && e.name) || e).slice(0, 40); } catch(e2){} throw e; }
    try { if (rec) rec.ok = true; } catch(e){}
    return r;
  };

  window.__v292Dfix689 = {
    __armed: true,
    log: function(){ return LOG.slice(); },
    clear: function(){ LOG.length = 0; dropped = 0; },
    state: function(){
      return { armed: !isOff(), off: isOff(), urlStory: currentStory(),
               activeNow: rawActive(), chronicleStoryId: storyIdGlobal(), f527StoryId: f527(),
               events: LOG.length, dropped: dropped, cap: CAP, turnsNow: turnsNow() };
    },
    // 時系列（人が読む用）。値そのものは出さず key / id / caller だけ
    timeline: function(limit){
      var n = limit || 60, out = [];
      for (var i = 0; i < LOG.length && out.length < n; i++){
        var e = LOG[i];
        out.push(e.t + ' ' + e.op + ' ' + (e.kind === 'ACTIVE' ? ('active=' + e.value) : e.key) +
                 ' [url=' + e.urlStory + ' mirror=' + e.activeNow + ' f527=' + e.f527StoryId +
                 ' turns=' + e.turns + '] ' + e.caller);
      }
      return out;
    },
    summary: function(){
      var byTag = {}, firstSlotRead = null, activeSeq = [], slotWrites = [];
      for (var i = 0; i < LOG.length; i++){
        var e = LOG[i];
        var tag = e.op + ':' + e.kind;
        byTag[tag] = (byTag[tag] || 0) + 1;
        if (!firstSlotRead && e.op === 'GET' && (e.kind === 'SLOT' || e.kind === 'GEN') && e.len)
          firstSlotRead = { t: e.t, key: e.key, len: e.len, caller: e.caller, mirror: e.activeNow };
        if (e.kind === 'ACTIVE')
          activeSeq.push({ t: e.t, op: e.op, value: e.value, caller: e.caller, ok: e.ok });
        if (e.kind === 'SLOT' && e.op === 'SET')
          slotWrites.push({ t: e.t, key: e.key, len: e.len, caller: e.caller });
      }
      return { byTag: byTag, firstNonEmptySlotRead: firstSlotRead,
               activeSlotSequence: activeSeq.slice(0, 40), slotWrites: slotWrites.slice(0, 20) };
    }
  };
  try { console.log(TAG, 'loaded (diagnostic only, in-memory log)'); } catch(e){}
})();
