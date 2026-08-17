// =====================================================================
// v292Dfix686 boot-read-probe   ★DIAGNOSTIC ONLY / 観測専用 / 一時出荷
// 目的: boot 時に「どの storage key を / どの caller が / その時 chr6_active_slot が
//       何を指している状態で」読んだかを確定する。
//       静的 census では 37T foreign memory の source を一意に決められなかったため。
// 観測対象:
//   GET … chr6_active_slot / chr6_slot_* / __gen_chr6_slot*
//   SET … chr6_active_slot のみ（loader 実行時と boot 完了後の時間差を捕まえるため）
//   それ以外の storage 操作は記録しない。
// ★記録は in-memory のみ。localStorage へ diagnostic を 1 バイトも書かない。
// ★観測専用。storage 値変更 / active_slot 変更 / slot 削除 / payload 変更 /
//   containment / save 発火 は一切行わない。
// ★fix654 が Storage.prototype を accessor trap にしているため prototype 代入は無効。
//   fix684 / fix685 で実証済みの instance 代入で登録する。
// ★透過性: 元の getItem / setItem の return value / arguments / this / throw を維持する。
// value hash は取らない（boot critical path への影響を最小化。key provenance で識別可能）。
// kill switch: localStorage['v292Dfix686Off'] === '1'
// 検証口: window.__v292Dfix686 = { log, state, summary, clear }
// =====================================================================
(function(){
  'use strict';
  if (window.__f686done) return; window.__f686done = 1;
  var TAG = '[v292Dfix686:boot-read-probe]';

  var LOG = [], CAP = 400, dropped = 0;
  var t0 = (function(){ try { return performance.now(); } catch(e){ return 0; } })();

  function now(){ try { return Math.round((performance.now() - t0) * 10) / 10; } catch(e){ return -1; } }
  function offRaw(store){ try { return store === '1'; } catch(e){ return false; } }

  function currentStory(){
    try { return new URLSearchParams(location.search).get('story') || ''; } catch(e){ return ''; }
  }
  function callerOf(){
    try {
      var st = (new Error()).stack || '';
      var lines = st.split('\n');
      var out = [];
      for (var i = 0; i < lines.length && out.length < 3; i++){
        var L = lines[i];
        if (!L || /boot-read-probe/.test(L) || /callerOf|Error/.test(L)) continue;
        out.push(L.trim().replace(/https?:\/\/[^\s)]*\//g, '').slice(0, 70));
      }
      return out.join(' | ');
    } catch(e){ return ''; }
  }
  function turnsNow(){
    try {
      if (typeof window.__chronicleGetState !== 'function') return null;
      var S = window.__chronicleGetState('v292Dfix686');
      if (!S || !Array.isArray(S.turns)) return null;
      return S.turns.length;
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

  // ---- GET: 完全 pass-through。記録は呼び出し後（値の長さが要るため）。----
  localStorage.getItem = function(k){
    var r = origGet.apply(this, arguments);
    try {
      if (localStorage.getItem !== undefined && origGet.call(this, 'v292Dfix686Off') !== '1'){
        var key = String(k), kind = kindOf(key);
        if (kind){
          var rec = { t: now(), op: 'GET', kind: kind, key: key,
                      urlStory: currentStory(),
                      len: (r == null ? null : String(r).length),
                      caller: callerOf(), turns: turnsNow() };
          if (kind === 'ACTIVE'){
            try { rec.storyId = r == null ? null : JSON.parse(String(r)); } catch(e){ rec.storyId = String(r); }
          }
          push(rec);
        }
      }
    } catch(e){}
    return r;
  };

  // ---- SET: chr6_active_slot のみ記録。値は変更しない。----
  localStorage.setItem = function(k, v){
    var rec = null;
    try {
      if (origGet.call(this, 'v292Dfix686Off') !== '1' && String(k) === 'chr6_active_slot'){
        var sid;
        try { sid = JSON.parse(String(v)); } catch(e){ sid = String(v); }
        rec = push({ t: now(), op: 'SET', kind: 'ACTIVE', key: String(k),
                     urlStory: currentStory(), storyId: sid,
                     len: (v == null ? null : String(v).length),
                     caller: callerOf(), turns: turnsNow(), ok: false });
      }
    } catch(e){}
    var r;
    try { r = origSet.apply(this, arguments); }
    catch(e){ try { if (rec) rec.threw = String((e && e.name) || e).slice(0, 40); } catch(e2){} throw e; }
    try { if (rec) rec.ok = true; } catch(e){}
    return r;
  };

  window.__v292Dfix686 = {
    __armed: true,
    log: function(){ return LOG.slice(); },
    clear: function(){ LOG.length = 0; dropped = 0; },
    state: function(){
      var off = false; try { off = origGet.call(localStorage, 'v292Dfix686Off') === '1'; } catch(e){}
      return { armed: !off, off: off, urlStory: currentStory(),
               events: LOG.length, dropped: dropped, cap: CAP, turnsNow: turnsNow() };
    },
    summary: function(){
      var byKind = {}, firstSlotGet = null, activeSeq = [];
      for (var i = 0; i < LOG.length; i++){
        var e = LOG[i];
        var tag = e.op + ':' + e.kind;
        byKind[tag] = (byKind[tag] || 0) + 1;
        if (!firstSlotGet && e.op === 'GET' && (e.kind === 'SLOT' || e.kind === 'GEN') && e.len) firstSlotGet = e;
        if (e.kind === 'ACTIVE') activeSeq.push(e.op + '@' + e.t + '=' + e.storyId + (e.op === 'SET' ? ('/ok=' + e.ok) : ''));
      }
      return { byKind: byKind, firstNonEmptySlotGet: firstSlotGet, activeSlotSequence: activeSeq.slice(0, 40) };
    }
  };
  try { console.log(TAG, 'loaded (diagnostic only, in-memory log)'); } catch(e){}
})();
