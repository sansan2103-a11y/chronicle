// =====================================================================
// v292Dfix691 story-boot-cross-write-probe   ★DIAGNOSTIC ONLY / 観測専用 / 一時出荷
// 目的: **STORY_BOOT_CROSS_SLOT_WRITE = REPRODUCED** の書き込み主体を 1 本特定する。
//   実測(CHECKPOINT_OBSERVATION_P0_P1_HIT_001): 汚染済み canary X を開く boot 区間で、
//   ・X 自身            139,540 → 139,504（正常 save）
//   ・smsvot5mnbj（未 open） 114,140 → 114,104   ★これが事件
//   が同時に起きた。cloud は baseRev / lastHash / pushedTs 不変（新規 pull/push なし）。
//   → 今回はこの **story boot boundary だけ** を見る。一般監査も static census も足さない。
// 観測対象:
//   SET … **全 chr6_slot_*** ＋ chr6 ＋ **chr6_active_slot**（今回の最重要項目）
//   GET … chr6_active_slot / boot 開始時 active_slot が指す slot / current URL story の slot
//         （これ以外の GET は記録しない。ログ量を無駄に増やさない）
// 記録: seq / t(performance.now) / key / value length / caller / URL story id /
//       chr6_active_slot 実値 / window.__chronicleStoryId / S.turns.length / document.readyState
//   ★payload 本文と hash は取らない。
// ★in-memory のみ。localStorage / sessionStorage へ 1 バイトも書かない。
// ★観測専用: storage を変更しない / SET を止めない / save を発火しない /
//   active_slot を変更しない / diagnostic を永続化しない。
// ★fix654 の accessor trap があるため prototype 代入は無効。instance 代入で登録する
//   （fix684 / fix686 / fix690 で実証済み）。
// ★caller 抽出は query 付き URL の stack frame に対応（fix690 で実証済みの正規表現）。
// kill switch: localStorage['v292Dfix691Off'] === '1'
// 検証口: window.__v292Dfix691 = { log, state, foreign, timeline, summary, clear }
// =====================================================================
(function(){
  'use strict';
  if (window.__f691done) return; window.__f691done = 1;
  var TAG = '[v292Dfix691:story-boot-cross-write]';

  var LOG = [], CAP = 3000, dropped = 0, seq = 0;
  var t0 = (function(){ try { return performance.now(); } catch(e){ return 0; } })();
  function now(){ try { return Math.round((performance.now() - t0) * 10) / 10; } catch(e){ return -1; } }

  var origGet, origSet;
  try { origGet = localStorage.getItem; origSet = localStorage.setItem; } catch(e){ return; }
  if (typeof origGet !== 'function' || typeof origSet !== 'function') return;

  function rawGet(k){ try { return origGet.call(localStorage, String(k)); } catch(e){ return null; } }
  function isOff(){ return rawGet('v292Dfix691Off') === '1'; }
  function urlStory(){
    try { return new URLSearchParams(location.search).get('story') || ''; } catch(e){ return ''; }
  }
  function activeRaw(){
    var v = rawGet('chr6_active_slot');
    if (v == null) return null;
    try { return JSON.parse(String(v)); } catch(e){ return String(v); }
  }

  // ---- boot 開始時点の identity を 1 回だけ確定 ----
  var URL_STORY = urlStory();               // この画面の物語
  var BOOT_ACTIVE = activeRaw();            // boot 開始時に active_slot が指していた物語
  var GET_WATCH = { 'chr6_active_slot': 1 };
  if (URL_STORY)   GET_WATCH['chr6_slot_' + URL_STORY] = 1;
  if (BOOT_ACTIVE) GET_WATCH['chr6_slot_' + BOOT_ACTIVE] = 1;

  var RE_FRAME = /([A-Za-z0-9_.-]+\.(?:js|html))(?:\?[^\s:)]*)?:(\d+):\d+/g;
  function callerOf(){
    try {
      var st = (new Error()).stack || '';
      RE_FRAME.lastIndex = 0;
      var out = [], m;
      while ((m = RE_FRAME.exec(st)) && out.length < 5){
        if (m[1].indexOf('fix691') >= 0) continue;   // 自分自身の frame は落とす
        out.push(m[1] + ':' + m[2]);
      }
      return out.join(' < ');
    } catch(e){ return ''; }
  }
  function turnsNow(){
    try {
      if (typeof window.__chronicleGetState !== 'function') return null;
      var S = window.__chronicleGetState('v292Dfix691');
      if (!S || !Array.isArray(S.turns)) return null;
      return S.turns.length;
    } catch(e){ return null; }
  }
  function storyIdGlobal(){
    try { return (typeof window.__chronicleStoryId === 'string') ? window.__chronicleStoryId : null; } catch(e){ return null; }
  }
  function push(rec){ if (LOG.length >= CAP){ dropped++; return null; } LOG.push(rec); return rec; }

  function mk(op, key, len){
    return { seq: ++seq, t: now(), op: op, key: key, len: len,
             urlStory: urlStory(), active: activeRaw(),
             chronicleStoryId: storyIdGlobal(), turns: turnsNow(),
             ready: (function(){ try { return document.readyState; } catch(e){ return ''; } })(),
             caller: callerOf() };
  }
  // ★「今の URL story 以外の slot 本体への書き込み」= foreign
  function isForeignSlotKey(key){
    if (!URL_STORY) return false;                       // home 等では判定しない
    if (key === 'chr6') return true;                    // default 本体も current story ではない
    if (key.indexOf('chr6_slot_') !== 0) return false;
    return key.slice(10) !== URL_STORY;
  }

  // ---- GET: 3 キーだけ記録。完全 pass-through。----
  localStorage.getItem = function(k){
    var r = origGet.apply(this, arguments);
    try {
      if (!isOff()){
        var key = String(k);
        if (GET_WATCH[key] === 1){
          var e = mk('GET', key, (r == null ? null : String(r).length));
          if (key === 'chr6_active_slot'){
            try { e.value = r == null ? null : JSON.parse(String(r)); } catch(e2){ e.value = String(r); }
          }
          push(e);
        }
      }
    } catch(e){}
    return r;
  };

  // ---- SET: 全 chr6_slot_* ＋ chr6 ＋ chr6_active_slot。値は一切変更しない。----
  localStorage.setItem = function(k, v){
    var e = null;
    try {
      if (!isOff()){
        var key = String(k);
        if (key === 'chr6_active_slot' || key === 'chr6' || key.indexOf('chr6_slot_') === 0){
          e = mk('SET', key, (v == null ? null : String(v).length));
          e.ok = false;
          if (key === 'chr6_active_slot'){
            try { e.value = JSON.parse(String(v)); } catch(e2){ e.value = String(v); }
            e.prev = e.active;
          } else {
            e.slotId = (key === 'chr6') ? 'chr6' : key.slice(10);
            e.foreign = isForeignSlotKey(key);          // ★事件フラグ
          }
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

  window.__v292Dfix691 = {
    __armed: true,
    urlStory: URL_STORY,
    bootActive: BOOT_ACTIVE,
    getWatch: function(){ return Object.keys(GET_WATCH); },
    log: function(){ return LOG.slice(); },
    clear: function(){ LOG.length = 0; dropped = 0; seq = 0; },
    state: function(){
      return { armed: !isOff(), off: isOff(), urlStory: URL_STORY, bootActive: BOOT_ACTIVE,
               activeNow: activeRaw(), chronicleStoryId: storyIdGlobal(),
               events: LOG.length, dropped: dropped, cap: CAP, turnsNow: turnsNow(),
               foreignSets: LOG.filter(function(e){ return e.op === 'SET' && e.foreign; }).length };
    },
    // ★最重要: current URL story 以外の slot への SET を時系列で返す
    foreign: function(){
      return LOG.filter(function(e){ return e.op === 'SET' && e.foreign; })
                .map(function(e){ return { seq: e.seq, t: e.t, key: e.key, slotId: e.slotId, len: e.len,
                                           urlStory: e.urlStory, active: e.active,
                                           chronicleStoryId: e.chronicleStoryId, turns: e.turns,
                                           ready: e.ready, ok: e.ok, caller: e.caller }; });
    },
    timeline: function(limit){
      var n = limit || 60, out = [];
      for (var i = 0; i < LOG.length && out.length < n; i++){
        var e = LOG[i];
        var tag = (e.key === 'chr6_active_slot') ? ('active=' + e.value)
                : ((e.slotId === URL_STORY) ? 'SELF' : ('★' + e.slotId));
        out.push(e.seq + ' ' + e.t + ' ' + e.op + ' ' + tag + ' len=' + e.len +
                 ' [act=' + e.active + ' turns=' + e.turns + ' ' + e.ready + '] ' + e.caller);
      }
      return out;
    },
    summary: function(){
      var byTag = {};
      for (var i = 0; i < LOG.length; i++){
        var e = LOG[i];
        var t = e.op + ':' + ((e.key === 'chr6_active_slot') ? 'ACTIVE'
              : (e.slotId === URL_STORY ? 'SELF' : (e.op === 'GET' ? e.key.slice(0, 16) : 'FOREIGN')));
        byTag[t] = (byTag[t] || 0) + 1;
      }
      return { byTag: byTag, events: LOG.length, dropped: dropped,
               urlStory: URL_STORY, bootActive: BOOT_ACTIVE };
    }
  };
  try { console.log(TAG, 'loaded (diagnostic only, in-memory log)'); } catch(e){}
})();
