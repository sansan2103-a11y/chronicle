// =====================================================================
// v292Dfix693 cross-document-storage-event-probe  ★DIAGNOSTIC ONLY / 観測専用 / 一時出荷
// 目的: 使い捨て B(chr6_slot_smsxdwb6rjd) が 543 → 579 bytes へ復帰する瞬間について、
//       **OTHER_DOCUMENT_WRITE か SAME_DOCUMENT/UNOBSERVED_WRITE か**だけを判定する。
//   根拠: storage event は **同一 origin の「他の document」が書いたときにだけ発火**し、
//         自分自身の書込では発火しない。したがって
//           復帰と同時に event あり → 別 document が書いた（CASE A）
//           復帰したが event 無し   → 同一 document 内の未観測書込（CASE B）
//   ★StorageEvent.url が最重要。書込元 document の pathname と ?story= だけを取り出す
//     （生 query 全文は保存しない）。
// 観測対象 key（この 2 本だけ）:
//   1. chr6_slot_smsxdwb6rjd … 判定対象
//   2. v292Dfix402_dirtyTs   … 時刻相関の**補助のみ**。これで writer を断定しない
// ★Storage API を wrap しない / Proxy を使わない / localStorage へ 1 バイトも書かない。
// ★writer 修正はしない。containment もしない。
// kill switch: localStorage['v292Dfix693Off'] === '1'
// 検証口: window.__v292Dfix693 = { log, polls, state, verdict, clear }
// =====================================================================
(function(){
  'use strict';
  if (window.__f693done) return; window.__f693done = 1;
  var TAG = '[v292Dfix693:cross-document-storage-event]';

  var TARGET = 'chr6_slot_smsxdwb6rjd';        // ★使い捨て B のみ
  var AUX    = 'v292Dfix402_dirtyTs';          // 補助（時刻相関のみ）
  var EV_CAP = 200, POLL_CAP = 300, POLL_MS = 500;

  var EV = [], POLLS = [], evDropped = 0, pollDropped = 0, seq = 0;
  var t0 = (function(){ try { return performance.now(); } catch(e){ return 0; } })();
  function now(){ try { return Math.round((performance.now() - t0) * 10) / 10; } catch(e){ return -1; } }

  function rawGet(k){ try { return localStorage.getItem(String(k)); } catch(e){ return null; } }
  function isOff(){ return rawGet('v292Dfix693Off') === '1'; }
  function h10(s){
    if (s == null) return null;
    var a = 5381, b = 52711;
    for (var i = 0; i < s.length; i++){ var c = s.charCodeAt(i); a = (a * 33 ^ c) >>> 0; b = (b * 31 ^ c) >>> 0; }
    return ((a >>> 0).toString(16) + (b >>> 0).toString(16)).slice(0, 10);
  }
  function urlStory(){
    try { return new URLSearchParams(location.search).get('story') || ''; } catch(e){ return ''; }
  }
  function activeRaw(){
    var v = rawGet('chr6_active_slot');
    if (v == null) return null;
    try { return JSON.parse(String(v)); } catch(e){ return String(v); }
  }
  function storyIdGlobal(){
    try { return (typeof window.__chronicleStoryId === 'string') ? window.__chronicleStoryId : null; } catch(e){ return null; }
  }
  // ★event.url から pathname と story id だけ取り出す（生 query は保存しない）
  function fromUrl(u){
    var out = { pathname: null, story: null };
    try {
      if (!u) return out;
      var s = String(u);
      var q = s.indexOf('?');
      var head = (q >= 0) ? s.slice(0, q) : s;
      var i = head.indexOf('://');
      var afterHost = (i >= 0) ? head.slice(head.indexOf('/', i + 3)) : head;
      out.pathname = afterHost || head;
      var m = s.match(/[?&]story=([^&#]*)/);
      out.story = m ? decodeURIComponent(m[1]) : null;
    } catch(e){}
    return out;
  }
  function ready(){ try { return document.readyState; } catch(e){ return ''; } }
  function vis(){ try { return document.visibilityState; } catch(e){ return ''; } }

  // ---- storage event（他 document の書込でのみ発火）----
  function onStorage(e){
    try {
      if (isOff()) return;
      var key = e && e.key;
      if (key !== TARGET && key !== AUX) return;
      if (EV.length >= EV_CAP){ evDropped++; return; }
      var u = fromUrl(e && e.url);
      EV.push({
        seq: ++seq, t: now(), key: key,
        oldLen: (e.oldValue == null ? null : String(e.oldValue).length),
        oldHash: h10(e.oldValue == null ? null : String(e.oldValue)),
        newLen: (e.newValue == null ? null : String(e.newValue).length),
        newHash: h10(e.newValue == null ? null : String(e.newValue)),
        srcPathname: u.pathname, srcStory: u.story,
        docUrlStory: urlStory(), active: activeRaw(),
        chronicleStoryId: storyIdGlobal(),
        visibility: vis(), ready: ready()
      });
    } catch(e2){}
  }
  try { window.addEventListener('storage', onStorage, false); } catch(e){}

  // ---- 500ms read-only polling（変化したときだけ 1 行残す）----
  var lastLen = null, lastHash = null, pollN = 0;
  function sample(kind){
    try {
      if (isOff()) return;
      var v = rawGet(TARGET);
      var len = (v == null ? null : v.length);
      var hs  = (v == null ? null : h10(v));
      pollN++;
      if (kind === 'init' || len !== lastLen || hs !== lastHash){
        if (POLLS.length >= POLL_CAP){ pollDropped++; }
        else POLLS.push({ seq: ++seq, t: now(), kind: kind,
                          fromLen: lastLen, fromHash: lastHash, len: len, hash: hs,
                          active: activeRaw(), docUrlStory: urlStory(),
                          visibility: vis(), ready: ready() });
      }
      lastLen = len; lastHash = hs;
    } catch(e){}
  }
  sample('init');
  var timer = null;
  try { timer = setInterval(function(){ sample('poll'); }, POLL_MS); } catch(e){}

  window.__v292Dfix693 = {
    __armed: true,
    target: TARGET,
    log: function(){ return EV.slice(); },
    polls: function(){ return POLLS.slice(); },
    clear: function(){ EV.length = 0; POLLS.length = 0; evDropped = 0; pollDropped = 0; seq = 0; },
    stop: function(){ try { if (timer) clearInterval(timer); } catch(e){} return true; },
    state: function(){
      return { armed: !isOff(), off: isOff(), target: TARGET,
               docUrlStory: urlStory(), active: activeRaw(), chronicleStoryId: storyIdGlobal(),
               events: EV.length, evDropped: evDropped,
               pollSamples: pollN, pollChanges: POLLS.length, pollDropped: pollDropped,
               curLen: lastLen, curHash: lastHash, visibility: vis() };
    },
    // ★復帰（B の変化）と storage event の対応づけ。判定は人間が行う
    verdict: function(windowMs){
      var W = (typeof windowMs === 'number') ? windowMs : 1500;
      var changes = POLLS.filter(function(p){ return p.kind !== 'init'; });
      var evB = EV.filter(function(e){ return e.key === TARGET; });
      var evAux = EV.filter(function(e){ return e.key === AUX; });
      var pairs = changes.map(function(c){
        var hit = null;
        for (var i = 0; i < evB.length; i++){
          if (Math.abs(evB[i].t - c.t) <= W){ hit = evB[i]; break; }
        }
        var aux = null;
        for (var j = 0; j < evAux.length; j++){
          if (Math.abs(evAux[j].t - c.t) <= W){ aux = { t: evAux[j].t, srcStory: evAux[j].srcStory,
                                                        srcPathname: evAux[j].srcPathname }; break; }
        }
        return { changeAt: c.t, from: c.fromLen, to: c.len, fromHash: c.fromHash, toHash: c.hash,
                 matchedStorageEvent: hit ? { t: hit.t, srcPathname: hit.srcPathname, srcStory: hit.srcStory,
                                              oldLen: hit.oldLen, newLen: hit.newLen,
                                              visibility: hit.visibility } : null,
                 nearbyDirtyTsEvent: aux };
      });
      var restored = pairs.filter(function(p){ return p.to > p.from; });
      return { targetChanges: changes.length, storageEventsOnTarget: evB.length,
               storageEventsOnAux: evAux.length, pairs: pairs.slice(0, 20),
               anyRestoreWithEvent: restored.some(function(p){ return !!p.matchedStorageEvent; }),
               anyRestoreWithoutEvent: restored.some(function(p){ return !p.matchedStorageEvent; }),
               note: 'CASE A = 復帰に対応する storage event あり（別 document）/ CASE B = 復帰したが event 無し / CASE C = 変化なし' };
    }
  };
  try { console.log(TAG, 'loaded (diagnostic only, no storage writes)'); } catch(e){}
})();
