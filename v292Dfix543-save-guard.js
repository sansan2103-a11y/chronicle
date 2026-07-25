// Chronicle TRPG - v292Dfix543: 保存の失敗を「無言」にしない
// ────────────────────────────────────────────────────────────
// 症状(2026-07-25・実測で発見):
//   localStorage が **4.97MB / 588鍵** まで肥大し、**空きが 26KB しかなかった**。
//   物語は 1ターンあたり約 2.9KB 増えるので、あと9ターンほどで保存が失敗する状態だった。
//   ところが index.html の保存はこう書かれている:
//       set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
//   → **QuotaExceededError を握りつぶす**。ターンは生成されて画面にも出るのに保存されず、
//     リロードすると消えている。**例外も警告も出ないので気づけない。**
//   これは同日の fix539(状態Sの取得が無言で空振りする)と**まったく同じ型**の事故。
//
// 方針(今日の方針と同じ): **挙動は変えない。観測できるようにするだけ。**
//   ・localStorage.setItem をラップし、**失敗したときだけ**記録して警告し、
//     **例外はそのまま投げ直す**(既存の呼び出し側は catch しているので挙動は不変)。
//   ・物語の保存(chr6 / chr6_slot_*)が失敗したときは、画面にもトーストを出す(1回だけ)。
//   ・失敗する前に気づけるよう、**空き容量が閾値を下回ったら**先に警告する。
//   ・fix419c の教訓: 内側関数の own props を全継承する(fix490 の __f490 等を隠さない)。
//
// 読出: window.__v292Dfix543.stats() / .headroom() / .recent()
// OFF : localStorage v292Dfix543Off='1'
(function v292Dfix543(){
  'use strict';
  if (window.__v292Dfix543Active) return;
  window.__v292Dfix543Active = true;
  var TAG = '[v292Dfix543:save-guard]';
  var LOW_WATER = 200 * 1024;   /* 空きがこれを下回ったら先に警告する(物語 約70ターン分) */

  function off(){ try { return localStorage.getItem('v292Dfix543Off') === '1'; } catch(e){ return false; } }
  function isStoryKey(k){ return typeof k === 'string' && (k === 'chr6' || k.indexOf('chr6_slot_') === 0); }

  var stats = { failures: 0, storyFailures: 0, lowWaterWarnings: 0, lastFailure: null };
  var recent = [];       /* 上限20件。鍵名・大きさ・エラー名だけ。**本文は入れない** */
  var warned = {};
  var lowWarnedAt = 0;

  var PROBE_KEY = '__v543hp';
  function note(key, size, err){
    try {
      /* ★fix543b(実機で発覚): 空き容量の推定は setItem を意図的に失敗させて測るので、
         そのプローブ自身の失敗を数えてしまっていた(実測: failures=34 が全部プローブ)。
         自分のノイズで診断が埋まると、本物の保存失敗に気づけない。除外する。 */
      if (key === PROBE_KEY) return;
      stats.failures++;
      if (isStoryKey(key)) stats.storyFailures++;
      var rec = { key: String(key).slice(0, 48), bytes: size,
                  errorName: (err && err.name) ? String(err.name) : '',
                  keys: (function(){ try { return localStorage.length; } catch(e){ return -1; } })(),
                  ts: Date.now() };
      stats.lastFailure = rec;
      recent.push(rec); while (recent.length > 20) recent.shift();
      var w = 'fail:' + rec.key;
      if (!warned[w]){
        warned[w] = 1;
        try { console.warn(TAG, '★保存に失敗した(無言にしない):', rec.key, rec.bytes + 'B', rec.errorName); } catch(e){}
      }
      if (isStoryKey(key) && !warned.__storyToast){
        warned.__storyToast = 1;
        toast('保存できませんでした（保存領域の空きが不足しています）。このままだと進行が失われます。', true);
      }
    } catch(e){}
  }

  function toast(msg, isErr){
    /* 既存の showToast があればそれを使う。無ければ何もしない(DOMを勝手に作らない) */
    try { if (typeof window.showToast === 'function'){ window.showToast(msg, !!isErr); return; } } catch(e){}
    try { if (window.UI && typeof window.UI.toast === 'function'){ window.UI.toast(msg); return; } } catch(e){}
    try { console.warn(TAG, msg); } catch(e){}
  }

  /* 空き容量の推定(二分探索・書けたら即消す)。呼ぶたびに走らせると重いので間引く */
  var lastProbe = 0, lastHeadroom = -1;
  function headroom(force){
    var now = Date.now();
    if (!force && lastHeadroom >= 0 && (now - lastProbe) < 60000) return lastHeadroom;
    var lo = 0, hi = 4 * 1024 * 1024, ok = 0;
    function probe(n){
      try { localStorage.setItem(PROBE_KEY, new Array(n + 1).join('x')); localStorage.removeItem(PROBE_KEY); return true; }
      catch(e){ try { localStorage.removeItem(PROBE_KEY); } catch(_){} return false; }
    }
    for (var i = 0; i < 22 && lo <= hi; i++){
      var mid = Math.floor((lo + hi) / 2);
      if (probe(mid)){ ok = mid; lo = mid + 1; } else hi = mid - 1;
    }
    lastProbe = now; lastHeadroom = ok;
    return ok;
  }

  function checkLowWater(){
    try {
      if (off()) return;
      var now = Date.now();
      if (now - lowWarnedAt < 10 * 60 * 1000) return;   /* 10分に1回まで */
      var h = headroom(false);
      if (h >= 0 && h < LOW_WATER){
        lowWarnedAt = now; stats.lowWaterWarnings++;
        try { console.warn(TAG, '★保存領域の空きが少ない:', Math.round(h / 1024) + 'KB'); } catch(e){}
        toast('保存領域の空きが残り約' + Math.round(h / 1024) + 'KBです。古い控えの整理をおすすめします。', true);
      }
    } catch(e){}
  }

  function wrap(){
    try {
      var prev = localStorage.setItem;
      if (!prev || prev.__f543) return;
      var wrapped = function(k, v){
        try { return prev.apply(localStorage, arguments); }
        catch(e){
          if (!off()){
            var size = 0; try { size = String(v == null ? '' : v).length; } catch(_){}
            note(k, size, e);
          }
          throw e;   /* ★投げ直す。既存の呼び出し側は catch しているので挙動は不変 */
        }
      };
      /* ★fix419c: 内側関数の own props を全継承(fix490 の __f490 等を見えなくしない) */
      try { for (var p in prev){ if (Object.prototype.hasOwnProperty.call(prev, p)){ try { wrapped[p] = prev[p]; } catch(e){} } } } catch(e){}
      wrapped.__f543 = true;
      localStorage.setItem = wrapped;
      try { console.log(TAG, 'installed'); } catch(e){}
    } catch(e){}
  }

  /* fix490 など後発のラップに巻き直されることがあるので、定期的に最外殻を確認する */
  wrap();
  try { setTimeout(wrap, 800); setTimeout(wrap, 3000); setInterval(wrap, 5000); } catch(e){}
  try { setTimeout(checkLowWater, 6000); setInterval(checkLowWater, 5 * 60 * 1000); } catch(e){}

  window.__v292Dfix543 = {
    stats: function(){ try { return JSON.parse(JSON.stringify(stats)); } catch(e){ return null; } },
    recent: function(){ return recent.slice(); },
    headroom: headroom,
    off: off
  };
  try { console.log(TAG, 'loaded'); } catch(e){}
})();
