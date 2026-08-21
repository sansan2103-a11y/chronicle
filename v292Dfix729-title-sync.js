// =====================================================================
// Chronicle v292Dfix729: TITLE SYNC（RULING56 / Worker v37 setstorytitle）
// ---------------------------------------------------------------------
// ■何のためか
//   セーブ管理モーダルの rename は **現在開いていない slot も** 対象にできる（CASE T2）。
//   一方 fix697 の dirty trigger は body / sidecar しか見ないので、名前だけの変更は
//   一度も commit されず、server の title が永久に古いままになっていた
//   （CANONICAL_TITLE_PROPAGATION_GAP）。
//
//   ここは「rename という操作」を受け取り、その story の **title だけ**を
//   server stored record 上で差し替える orchestration に徹する。
//
// ■rename entrypoint（RULING58 §1-§3・§23）
//   user-facing な rename は 2 系統のみ。どちらも同じ hook へ集約する（SINGLE AUTHORITY）。
//     INDEX … features.js renameSlot（セーブ管理モーダル）
//     HOME  … home.html renameStory（#renBtn「名前を変更」）
//   ※ v292Dfix526 の boot 時 auto-retitle は user-facing rename ではないため hook しない
//     （RULING57 §17: boot all-story title reconciliation = NO）。
//
// ■責務の分割（RULING56 §21）
//     features.js / home.html … event only（1 行呼ぶだけ）
//     fix697        … transport only（setStoryTitleOnce = 狭い POST 口）
//     この module   … fresh getstory → 判定 → CAS exactly 1 → readback validate
//     Worker v37    … server-record title mutation
//
// ■絶対にやらないこと
//   ・current document を触らない。__chronicleDocumentStoryKey / chr6_active_slot /
//     S.load / S.save / projection() / commit() / markDirty を一切呼ばない（§24）
//   ・対象 story の **body を読まない**。server stored record が唯一の source
//   ・localStorage / sessionStorage へ 1 バイトも書かない
//   ・自動 retry しない（曖昧なら 1 回の fresh getstory で確認して終わり）
//   ・poll しない / timer を増やさない（event-driven only。§16）
//   ・tombstone を触らない（server deleted=true は Worker 側で reject。§11）
//
// ■capability gate（§26）
//   Worker root の top-level storyTitleWrite が 1 でなければ **server write しない**（RULING59）。
//   local rename は従来どおり成功する。Worker 先行 deploy を安全にするため。
//
// 検証口: window.__v292Dfix729 = { BUILD, off, on, status, stats, syncTitle, capability }
// hook:   window.__chronicleTitleRename(id, name)
// kill switch: localStorage v292Dfix729Off='1'（既定 ON）
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix729) return;
  var TAG = '[v292Dfix729:title-sync]';
  var BUILD = 'fix729';
  var TITLE_MAX = 40;                     /* features.js renameSlot と同じ上限 */

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix729Off') === '1'; }
  function on(){ return !off(); }

  var stats = { hooks: 0, skippedOff: 0, skippedNoPort: 0, skippedNoCapability: 0,
                skippedBadInput: 0, reads: 0, noop: 0, writes: 0, ok: 0, fail: 0, netFail: 0 };
  var lastResult = null;

  /* ---- capability（RULING57 §1-§9）----
     SINGLE AUTHORITY = ROOT PROBE。fix729 自身が current proxy Worker root を lazy GET し、
     **root JSON の top-level** storyTitleWrite === 1 を確認する（RULING59 §2・§5・§16 で正式化）。
     ★location は 1 箇所だけ（§3・§15）: j.capabilities.storyTitleWrite は runtime gate として見ない。
       nested にしか無い場合は FAIL CLOSED（write 0）。OR / AND 互換層を作らない。

     ★endpoint-scoped（§5）: cache は必ず { endpoint, value } の対で持つ。
       proxy URL を切り替えたら旧 endpoint の判定を新 endpoint へ持ち越さない。
     ★in-flight 共有（§6）: 同一 endpoint の probe 中なら同じ Promise を共有し root GET を増やさない。
     ★retry 0（§7）: 同一 rename event 内で自動再試行しない。失敗は cache しない
       （＝次の独立した rename event で再 probe できる）。timer / background retry も 0。
     ★unsupported は cache 可（RULING57 §8）: 正常応答で top-level storyTitleWrite != 1 なら、その endpoint について
       page lifetime 中 cache してよい。endpoint 変更で invalidate。
     ★auth を足さない（§3）: header 追加 0 / Google token 送信 0 / ProxyPass 明示追加 0 / no-store。 */
  var capCache = { endpoint: null, value: null, at: 0 };   /* value: true | false | null(未確定) */
  var capInFlight = { endpoint: null, promise: null };

  /* ★§4: capability endpoint == title write endpoint。fix697 が実際に使う base をそのまま借りる。
     fix729 は独自の URL 設定体系を持たない。 */
  function endpointBase(){
    try {
      var F = window.__v292Dfix697;
      if (F && typeof F.endpointBase === 'function'){
        var b = F.endpointBase();
        return (typeof b === 'string' && b) ? b.replace(/\/+$/, '') : '';
      }
    } catch(e){}
    return '';
  }

  function cachedFor(ep){
    if (!ep) return null;
    if (capCache.endpoint === ep && capCache.value !== null) return capCache.value;
    return null;
  }

  function probeCapability(ep){
    /* 同一 endpoint の in-flight があれば共有（root GET を増やさない）。 */
    if (capInFlight.promise && capInFlight.endpoint === ep) return capInFlight.promise;
    var pr = new Promise(function(resolve){
      var f = null;
      try { f = window.fetch; } catch(e){}
      if (typeof f !== 'function'){ resolve(null); return; }
      var done = false;
      var finish = function(v){ if (done) return; done = true; resolve(v); };
      try {
        /* ★header を 1 つも足さない。credential も送らない。 */
        f(ep + '/', { method: 'GET', cache: 'no-store' }).then(function(res){
          if (!res || res.status !== 200){ finish(null); return; }
          return res.json().then(function(j){
            /* ★RULING59 §2・§6・§8: SUPPORTED iff root JSON が object かつ
               **top-level** j.storyTitleWrite === 1。j.capabilities.* は参照しない（nested-only は FAIL CLOSED）。 */
            var v = !!(j && typeof j === 'object' && j.storyTitleWrite === 1);
            finish(v);
          }, function(){ finish(null); });          /* invalid JSON → 未確定（§11-I） */
        }, function(){ finish(null); });            /* network fail → 未確定（§11-E） */
      } catch(e){ finish(null); }
    }).then(function(v){
      if (capInFlight.endpoint === ep) { capInFlight.endpoint = null; capInFlight.promise = null; }
      /* ★失敗（null）は cache しない。true / false だけ endpoint 付きで覚える。 */
      if (v === true || v === false){ capCache = { endpoint: ep, value: v, at: Date.now() }; }
      return v;
    });
    capInFlight = { endpoint: ep, promise: pr };
    return pr;
  }

  /* test harness 専用。production runtime の authority は root probe（§9）。
     ここを通しても endpoint を跨いだ持ち越しは起きない（endpoint 付きで保存する）。 */
  function setCapability(v, ep){
    var e = ep || endpointBase();
    capCache = { endpoint: e, value: (v === true || v === 1 || v === '1'), at: Date.now() };
    return capCache.value;
  }

  function port(){
    try {
      var F = window.__v292Dfix697;
      if (F && typeof F.setStoryTitleOnce === 'function' && typeof F.shadowRequest === 'function') return F;
    } catch(e){}
    return null;
  }

  function normalize(name){
    if (typeof name !== 'string') return null;
    return name.slice(0, TITLE_MAX);
  }

  function midFor(id, rev, hash, title){
    /* 同じ rename を 2 回投げても server 側 idem で 1 回に畳まれるよう決定的にする。 */
    return 'title:' + id + ':' + rev + ':' + String(hash).slice(0, 16) + ':' + title.length;
  }

  /* ---- 本体 ----
     syncTitle(id, name, cb)
       cb(result) の result は必ず { ok:boolean, stage:string, ... } の形。
       例外を投げない。caller（features.js）は結果を無視してよい。 */
  function syncTitle(id, name, cb){
    cb = (typeof cb === 'function') ? cb : function(){};
    stats.hooks++;
    var done = function(r){ lastResult = r; try { cb(r); } catch(e){} return r; };

    if (!on()){ stats.skippedOff++; return done({ ok: false, stage: 'skip', reason: 'OFF' }); }

    var sid = (id == null) ? '' : String(id);
    var title = normalize(name);
    if (!sid || title === null){ stats.skippedBadInput++; return done({ ok: false, stage: 'skip', reason: 'BAD_INPUT' }); }
    /* default slot は server story ではないので対象外（rename UI 側でも disabled）。 */
    if (sid === 'default'){ stats.skippedBadInput++; return done({ ok: false, stage: 'skip', reason: 'DEFAULT_SLOT' }); }

    var F = port();
    if (!F){ stats.skippedNoPort++; return done({ ok: false, stage: 'skip', reason: 'NO_PORT' }); }

    /* ★capability gate（§7）: 対応が確認できるまで server write を 1 回もしない。
       endpoint が取れない場合も write 0。 */
    var ep = endpointBase();
    if (!ep){ stats.skippedNoCapability++; return done({ ok: false, stage: 'skip', reason: 'NO_ENDPOINT' }); }
    var cached = cachedFor(ep);
    if (cached === false){ stats.skippedNoCapability++; return done({ ok: false, stage: 'skip', reason: 'CAPABILITY_OFF' }); }
    if (cached === true){ return proceed(); }
    return probeCapability(ep).then(function(v){
      if (v !== true){
        stats.skippedNoCapability++;
        return done({ ok: false, stage: 'skip',
                      reason: (v === false) ? 'CAPABILITY_OFF' : 'CAPABILITY_UNKNOWN' });
      }
      return proceed();
    });

    /* ---- 1) fresh getstory。過去に観測した rev/hash を authority にしない。 ---- */
    function proceed(){
    stats.reads++;
    F.shadowRequest({ op: 'getstory', id: sid }, function(res, err){
      if (err || !res || res.status !== 200 || !res.j || !res.j.ok){
        stats.netFail++;
        return done({ ok: false, stage: 'fresh-getstory', reason: 'UNAVAILABLE_OR_ABSENT',
                      status: res ? res.status : null, id: sid });
      }
      var j = res.j;
      var rec = j.record || {};
      var auth = String(j.authority || 'shadow');
      var rev = +j.rev || 0;
      var hash = String(j.serverHash || '');
      var pre = { id: sid, serverRev: rev, serverAuthority: auth, serverDeleted: !!j.deleted };

      /* ---- 2) 事前判定。ここで落ちるものは write 0。 ---- */
      if (j.deleted){ return done({ ok: false, stage: 'precheck', reason: 'SERVER_TOMBSTONE', pre: pre }); }
      if (auth !== 'shadow' && auth !== 'canonical'){
        return done({ ok: false, stage: 'precheck', reason: 'UNEXPECTED_AUTHORITY', pre: pre });
      }
      if (!hash){ return done({ ok: false, stage: 'precheck', reason: 'NO_SERVER_HASH', pre: pre }); }

      var serverTitle = (typeof rec.title === 'string') ? rec.title : '';
      /* ---- 3) same-title は request すら送らない（§12 より手前で落とす）。 ---- */
      if (serverTitle === title){
        stats.noop++;
        return done({ ok: true, stage: 'noop', reason: 'SAME_TITLE', pre: pre, titleChanged: 0 });
      }

      /* ---- 4) title-only CAS exactly 1。auto retry 0。 ---- */
      stats.writes++;
      var mid = midFor(sid, rev, hash, title);
      F.setStoryTitleOnce({ id: sid, title: title, expectedRev: rev, expectedHash: hash, mid: mid },
        function(res2, err2){
          if (err2 || !res2 || !res2.j){
            stats.netFail++;
            /* ★曖昧応答。ここで「失敗」と決めつけない。fresh getstory を **1 回だけ**。 */
            return F.shadowRequest({ op: 'getstory', id: sid }, function(res3){
              var b = (res3 && res3.j) ? res3.j : null;
              var t3 = (b && b.record && typeof b.record.title === 'string') ? b.record.title : null;
              if (res3 && res3.status === 200 && b && b.ok && t3 === title){
                stats.ok++;
                return done({ ok: true, stage: 'ambiguous-resolved', pre: pre,
                              post: { rev: b.rev, authority: b.authority, deleted: !!b.deleted },
                              titleChanged: 1 });
              }
              stats.fail++;
              return done({ ok: false, stage: 'ambiguous-unresolved', pre: pre,
                            note: 'no auto retry; caller must re-trigger explicitly' });
            });
          }
          var j2 = res2.j;
          if (!j2.ok){
            stats.fail++;
            return done({ ok: false, stage: 'cas', reason: j2.errorCode || 'CAS_FAILED',
                          pre: pre, serverRev: j2.serverRev, serverHash: j2.serverHash ? true : false });
          }
          if (j2.noop === true){
            stats.noop++;
            return done({ ok: true, stage: 'server-noop', pre: pre, titleChanged: 0 });
          }
          /* ---- 5) readback validate。1 回だけ。 ---- */
          F.shadowRequest({ op: 'getstory', id: sid }, function(res4){
            var b4 = (res4 && res4.j) ? res4.j : null;
            var t4 = (b4 && b4.record && typeof b4.record.title === 'string') ? b4.record.title : null;
            var validated = !!(res4 && res4.status === 200 && b4 && b4.ok && t4 === title
                               && String(b4.authority || '') === auth && !b4.deleted);
            if (validated) stats.ok++; else stats.fail++;
            return done({ ok: validated, stage: 'readback', pre: pre,
                          post: b4 ? { rev: b4.rev, authority: b4.authority, deleted: !!b4.deleted } : null,
                          titleChanged: 1,
                          revDelta: b4 ? ((+b4.rev || 0) - rev) : null });
          });
        });
    });
    }   /* end proceed() */
  }

  /* ---- features.js から呼ばれる hook（1 行だけ） ---- */
  window.__chronicleTitleRename = function(id, name){
    try { syncTitle(id, name, null); } catch(e){ try { console.warn(TAG, 'hook error', e && e.name); } catch(_){ } }
  };

  window.__v292Dfix729 = {
    __armed: true,
    BUILD: BUILD,
    off: off, on: on,
    TITLE_MAX: TITLE_MAX,
    syncTitle: syncTitle,
    setCapability: setCapability,
    endpointBase: endpointBase,
    probeCapability: probeCapability,
    capability: function(){ return { endpoint: capCache.endpoint, value: capCache.value, at: capCache.at }; },
    stats: function(){ var o = {}; for (var k in stats) o[k] = stats[k]; return o; },
    last: function(){ return lastResult; },
    status: function(){
      return { build: BUILD, on: on(), titleMax: TITLE_MAX,
               portPresent: !!port(), endpoint: endpointBase(),
               capability: { endpoint: capCache.endpoint, value: capCache.value },
               stats: (function(){ var o = {}; for (var k in stats) o[k] = stats[k]; return o; })() };
    }
  };
  try { console.log(TAG, 'loaded (event-driven title-only CAS / no poll / no localStorage write / default ON / kill=v292Dfix729Off=1)'); } catch(e){}
})();
