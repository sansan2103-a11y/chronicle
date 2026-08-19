// =====================================================================
// Chronicle v292Dfix702: STEP3D AUTHORITY CUTOVER（最小骨格・既定 OFF）
// ---------------------------------------------------------------------
// ■これは何か（GPT裁定 STEP3D IMPLEMENTATION GO）
//   legacy account pkg authority → per-story canonical authority への切替の第一段。
//   初回実装は範囲を絞る。「やりすぎない」が裁定の明示条件。
//
// ■このファイルがやること（4つだけ）
//   (5) v292Dfix702_storyAuth … server authority の **last-known cache**。authority の正本ではない。
//   (6) LEGACY APPLY MASK   … canonical story の body/sidecar を legacy pull/apply で上書きさせない。
//   (7) promotestory        … fresh getstory → strict CAS → fresh readback。
//   (+) PREBOOT GATE 骨格   … canonical document で「最初の書込・最初の push」を gate 解決まで抑止。
//       ★server→local body apply は**実装しない**（最初の canary と混ぜない・裁定 §「初回実装ではやりすぎない」）。
//   (+) promotedelete       … strict のみ。general な deleted:true 受理も row missing tombstone 生成もしない。
//
// ■authority の正本は server
//   marker は cache。marker と server が食い違ったら **server を信じ、marker を直す**。
//   marker missing + server canonical + localHash == serverHash → SAFE ADOPT。
//   marker missing + local != server                          → CONFLICT（何もしない）。
//
// ■このファイルが**やらないこと**（裁定どおり）
//   ・CLOUD_NEWER auto apply（実装しない／有効化しない）
//   ・full conflict UX / HOME authority 移行 / title trigger / restore 専用 flow
//   ・sidecar.genderMap の物理 schema 削除
//   ・legacy pkg の縮小・retirement・conflict 解消 / pull / forceput
//   ・canonical → legacy の自動復帰（promotion は one-way）
//
// ■スイッチ
//   有効 = v292Dfix702On === '1' かつ v292Dfix702Off !== '1'（★既定 OFF = 明示 opt-in）
//   ただし **LEGACY APPLY MASK だけは既定 ON**（canonical が1本も無ければ何も masking しないので無害。
//   canonical が出来た後に OFF だと上書き事故が起きるため、ここだけ opt-out 方式）。
// 検証口: window.__v292Dfix702 = { status, marker, classify, promote, promoteDelete, gate, ledger, off, on }
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix702) return;
  var TAG = '[v292Dfix702:authority-cutover]';
  var MARKER_KEY = 'v292Dfix702_storyAuth';   /* ★fix402 namespace を借りない（裁定 §2） */
  var TIMEOUT_MS = 25000, BUILD = 'fix702', PROTOCOL = 1;

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function lss(k,v){ try { localStorage.setItem(k, v); return true; } catch(e){ return false; } }
  function off(){ return lsg('v292Dfix702Off') === '1'; }
  function on(){ return !off() && lsg('v292Dfix702On') === '1'; }
  /* mask は既定 ON（opt-out）。canonical 0 件なら実質 no-op。 */
  function maskOn(){ return lsg('v292Dfix702MaskOff') !== '1'; }

  // ---- storyId（fix694 authority のみ・chr6_active_slot 不使用） ----
  function authorityKey(){
    try { var k = window.__chronicleDocumentStoryKey; return (typeof k === 'string' && k) ? k : null; } catch(e){ return null; }
  }
  function storyId(){
    var k = authorityKey();
    if (!k) return null;
    if (k === 'chr6') return 'default';
    if (k.indexOf('chr6_slot_') === 0) return k.slice(10);
    return null;
  }
  function bodyKeyOf(id){ return (id === 'default') ? 'chr6' : ('chr6_slot_' + id); }
  function aiKeyOf(id){ return (id === 'default') ? 'v292aiInstr' : ('v292aiInstr_slot_' + id); }
  /* ★P0-2: genderMap は canonical projection には入らない（fix701 で null 固定）が、
     legacy pkg が local の値を踏み潰さないよう mask 対象に含める。
     ★default story は genderMap_default = account-global の契約なので **除外**する。 */
  function genderKeysOf(id){
    if (id === 'default') return [];                 /* account-global を mask しない */
    return ['genderMap_' + id, 'genderMap_"' + id + '"'];
  }

  // =====================================================================
  // (5) marker = last-known server authority cache（authority の正本ではない）
  // =====================================================================
  function markerMap(){
    try { var m = JSON.parse(lsg(MARKER_KEY) || '{}'); return (m && typeof m === 'object' && !(m instanceof Array)) ? m : {}; }
    catch(e){ return {}; }
  }
  function markerOf(id){ var m = markerMap()[String(id)]; return (m && typeof m === 'object') ? m : null; }
  /* ★server の 200 応答からしか書かない。ローカル推測では書かない。 */
  function markerSet(id, authority, rev, hash){
    try {
      var m = markerMap();
      m[String(id)] = { authority: String(authority || 'shadow'), rev: (typeof rev === 'number' ? rev : null),
                        hash: hash || null, at: Date.now() };
      return lss(MARKER_KEY, JSON.stringify(m));
    } catch(e){ return false; }
  }
  function canonicalIds(){
    var m = markerMap(), out = [];
    for (var k in m){ if (Object.prototype.hasOwnProperty.call(m,k) && m[k] && m[k].authority === 'canonical') out.push(k); }
    return out;
  }

  // =====================================================================
  // (6) LEGACY APPLY MASK
  //   fix399 applySave() は毎回 window.__chronicleStoryLifecycle.filterIncoming を
  //   **呼び出し時に**参照する（L965 付近）。したがって後から service を包めば
  //   bootPull / onDown（クロージャ内呼出）/ fix402 applyPkg の**全経路**を覆える。
  //   ★api.applySave の wrapper では fix399 内部呼出を取り逃す（12-2 で確定）。
  //   masking するのは **canonical story の body / aiInstr / genderMap** だけ。
  //   ・genderMap_default は account-global なので mask しない。
  //   ・chr6_slots_meta は account global なので触らない（HOME list authority は STEP4 まで legacy）。
  //   ★legacy 側に「古い値がある」ケースも「キー自体が無い」ケースも、どちらでも local を保持する:
  //     applySave は setItem しかしないので、mask で incoming から外せば local はそのまま残る。
  //     さらに **fix402c の削除伝播**（applySave を通らない別経路）に対しては
  //     fix402 側へ canonical 保護を入れてある（P0-2 の第二の防壁）。
  // =====================================================================
  var maskStats = { calls: 0, blockedKeys: 0, lastBlocked: null, installed: false, mode: 'none' };
  function canonicalKeySet(){
    var ids = canonicalIds(), set = {};
    for (var i = 0; i < ids.length; i++){
      set[bodyKeyOf(ids[i])] = 1;
      set[aiKeyOf(ids[i])] = 1;
      var gk = genderKeysOf(ids[i]);
      for (var j = 0; j < gk.length; j++) set[gk[j]] = 1;
    }
    return set;
  }
  function maskIncoming(ls){
    var out = {}, blocked = [];
    if (!ls || typeof ls !== 'object') return { ls: ls, blocked: blocked };
    var set = canonicalKeySet();
    for (var k in ls){
      if (!Object.prototype.hasOwnProperty.call(ls, k)) continue;
      if (set[k]) { blocked.push(k); continue; }     /* ★canonical story の内容は書き戻さない */
      out[k] = ls[k];
    }
    return { ls: out, blocked: blocked };
  }
  function installMask(){
    if (maskStats.installed) return true;
    try {
      var svc = window.__chronicleStoryLifecycle;
      var prev = (svc && typeof svc.filterIncoming === 'function') ? svc.filterIncoming : null;
      var wrapped = function(incoming){
        maskStats.calls++;
        var cur = incoming, blockedAll = [];
        if (prev){
          try {
            var f = prev.apply(this, arguments);          /* ★fix587 の墓標 barrier を先に通す */
            if (f && f.ls) { cur = f.ls; if (f.blocked && f.blocked.length) blockedAll = blockedAll.concat(f.blocked); }
          } catch(e){}
        }
        if (maskOn()){
          try {
            var r = maskIncoming(cur);
            cur = r.ls;
            if (r.blocked.length){
              blockedAll = blockedAll.concat(r.blocked);
              maskStats.blockedKeys += r.blocked.length;
              maskStats.lastBlocked = { at: Date.now(), keys: r.blocked.slice(0, 8) };
              try { console.warn(TAG, 'canonical mask: ' + r.blocked.length + ' キーを legacy apply から除外'); } catch(e){}
            }
          } catch(e){}
        }
        return { ls: cur, blocked: blockedAll };
      };
      if (svc && typeof svc === 'object'){
        svc.filterIncoming = wrapped;
        maskStats.mode = prev ? 'wrap(fix587)' : 'attach(existing-svc)';
      } else {
        /* service ごと未定義でも mask だけは立てる（fail-closed 側） */
        window.__chronicleStoryLifecycle = { filterIncoming: wrapped, __f702created: true };
        maskStats.mode = 'create';
      }
      maskStats.installed = true;
      try { console.log(TAG, 'legacy apply mask installed (' + maskStats.mode + ')'); } catch(e){}
      return true;
    } catch(e){ return false; }
  }
  /* fix587 が後から load される場合に備えて短時間だけ再試行する（既に installed なら何もしない） */
  (function maskPoll(){
    maskPoll._n = (maskPoll._n || 0) + 1;
    try {
      var svc = window.__chronicleStoryLifecycle;
      if (maskStats.installed){
        /* 誰かが filterIncoming を置き換えたら（fix587 の後 load 等）包み直す */
        if (svc && typeof svc.filterIncoming === 'function' && !svc.filterIncoming.__f702){ maskStats.installed = false; installMask(); }
      } else if (svc || maskPoll._n > 6){ installMask(); }
      if (window.__chronicleStoryLifecycle && typeof window.__chronicleStoryLifecycle.filterIncoming === 'function'){
        try { window.__chronicleStoryLifecycle.filterIncoming.__f702 = true; } catch(e){}
      }
    } catch(e){}
    if (maskPoll._n > 40) return;
    setTimeout(maskPoll, 500);
  })();

  // =====================================================================
  // 通信（read/write とも fix697/fix700 と同一規約・独立実装）
  // =====================================================================
  function proxyUrl(){
    try {
      var u = (lsg('v292ProxyUrl') || '').replace(/\s+/g,'');
      if (u) return u.replace(/\/+$/, '');
      if (window.__v292Dfix247bapi && window.__v292Dfix247bapi.DEFAULT_PROXY_URL) return window.__v292Dfix247bapi.DEFAULT_PROXY_URL;
    } catch(e){}
    return 'https://novel-proxy.sansan2103.workers.dev';
  }
  function authHeaders(){
    var h = { 'Content-Type': 'application/json' };
    try { var g = (window.__chronicleGoogleId && window.__chronicleGoogleId()) || ''; if (g) h['x-google-id'] = g; } catch(e){}
    try { var p = (lsg('v292ProxyPass') || '').replace(/^\s+|\s+$/g,''); if (p) h['x-chronicle-pass'] = p; } catch(e){}
    return h;
  }
  function isLoggedIn(){ var h = authHeaders(); return !!(h['x-google-id'] || h['x-chronicle-pass']); }
  function post(payload, cb){
    var ac = null, timer = null;
    try { ac = new AbortController(); timer = setTimeout(function(){ try { ac.abort(); } catch(e){} }, TIMEOUT_MS); } catch(e){}
    payload.clientProtocol = PROTOCOL;
    var opts = { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) };
    if (ac) opts.signal = ac.signal;
    fetch(proxyUrl() + '/save', opts).then(function(res){
      return res.json().then(function(j){ return { status: res.status, j: j }; }, function(){ return { status: res.status, j: null }; });
    }).then(function(r){ if (timer) clearTimeout(timer); cb(null, r); })
    ['catch'](function(e){ if (timer) clearTimeout(timer); cb(e, null); });
  }
  function f697(){ var W = window.__v292Dfix697; return (W && typeof W.projection === 'function') ? W : null; }
  function localHash(cb){
    var W = f697(); if (!W) return cb(null, 'FIX697_ABSENT');
    var c = null; try { c = W.projection(); } catch(e){ c = null; }
    if (!c) return cb(null, 'NO_LOCAL_PROJECTION');
    try { W.contentHash(function(h){ cb(h || null, h ? null : 'HASH_FAIL', c); }); } catch(e){ cb(null, 'HASH_FAIL'); }
  }
  /* ★P0-4A: promote 用に取った canonicalString を保持し、送信直前にもう一度作って比較する。
     hash 計算は非同期なので、その間にユーザー保存が入ると「古い hash で promote する」窓ができる。 */
  function canonicalStringNow(){
    var W = f697(); if (!W) return null;
    var c = null; try { c = W.projection(); } catch(e){ c = null; }
    if (!c) return null;
    try { return W.canonicalString(c); } catch(e){ return null; }
  }

  // ---- 記録（メモリのみ） ----
  var stats = { promotes: 0, promoteOk: 0, promoteFail: 0, promoteDeletes: 0, promoteDeleteOk: 0,
                classifies: 0, safeAdopt: 0, conflicts: 0, netFail: 0, skipped: 0 };
  var LEDGER = [], LEDGER_CAP = 50;
  function note(row){ row.t = Date.now(); LEDGER.push(row); while (LEDGER.length > LEDGER_CAP) LEDGER.shift(); }

  // =====================================================================
  // 分類（裁定 §8: CLOUD_NEWER の auto apply は実装しない）
  // =====================================================================
  function classify(cb){
    cb = (typeof cb === 'function') ? cb : function(){};
    var id = storyId();
    if (!id){ stats.skipped++; return cb({ skipped: 'NO_AUTHORITY' }); }
    if (!isLoggedIn()){ stats.skipped++; return cb({ skipped: 'NOT_LOGGED_IN', storyId: id }); }
    localHash(function(lh, err){
      if (!lh){ stats.skipped++; return cb({ skipped: err || 'NO_LOCAL_HASH', storyId: id }); }
      post({ op: 'getstory', id: id }, function(e, r){
        if (e || !r){ stats.netFail++; var rn = { storyId: id, error: 'NET_FAIL' }; note(rn); return cb(rn); }
        var j = r.j || {};
        var mk = markerOf(id);
        stats.classifies++;
        if (r.status === 404 || (j && j.errorCode === 'not-found')){
          var ra = { storyId: id, serverPresent: false, serverAuthority: null, localHash: lh,
                     marker: mk, verdict: 'SERVER_ROW_ABSENT', note: 'row missing は delete ではない（未 seed）' };
          note(ra); return cb(ra);
        }
        if (r.status !== 200 || !j.ok){ stats.netFail++; var re = { storyId: id, error: 'HTTP_' + r.status }; note(re); return cb(re); }
        var sAuth = String(j.authority || 'shadow'), sRev = (typeof j.rev === 'number') ? j.rev : null;
        var sHash = j.serverHash || null, sDel = !!j.deleted;
        /* ★server が正本。marker は cache なので、食い違ったら server で直す。 */
        markerSet(id, sAuth, sRev, sHash);
        var v, detail = null;
        if (sDel){ v = 'SERVER_TOMBSTONE'; }
        else if (!mk){
          if (sAuth === 'canonical' && sHash && sHash === lh){ v = 'SAFE_ADOPT'; stats.safeAdopt++; }
          else if (sAuth === 'canonical'){ v = 'CONFLICT'; detail = 'marker missing + local != server'; stats.conflicts++; }
          else { v = (sHash === lh) ? 'EQUAL' : 'LEGACY_SHADOW_DIVERGED'; }
        } else if (sHash && sHash === lh){ v = 'EQUAL'; }
        else if (mk.hash && lh !== mk.hash && sHash === mk.hash){ v = 'LOCAL_AHEAD'; }
        else if (mk.hash && lh === mk.hash && sHash !== mk.hash){ v = 'CLOUD_NEWER'; }
        else { v = 'CONFLICT'; stats.conflicts++; }
        var row = { storyId: id, serverPresent: true, serverAuthority: sAuth, serverRev: sRev,
                    serverHash: sHash, serverDeleted: sDel, localHash: lh, markerBefore: mk,
                    verdict: v, detail: detail,
                    autoApply: false, autoApplyReason: 'CLOUD_NEWER auto apply は STEP3D では実装しない（裁定 §8）' };
        note(row); return cb(row);
      });
    });
  }

  // =====================================================================
  // (7) promotestory — fresh getstory → strict CAS → fresh readback
  // =====================================================================
  function promote(cb){
    cb = (typeof cb === 'function') ? cb : function(){};
    if (!on()){ stats.skipped++; return cb({ skipped: 'OFF' }); }
    var id = storyId();
    if (!id){ stats.skipped++; return cb({ skipped: 'NO_AUTHORITY' }); }
    if (!isLoggedIn()){ stats.skipped++; return cb({ skipped: 'NOT_LOGGED_IN' }); }
    var snapAtStart = canonicalStringNow();                 /* ★P0-4A: 起点スナップショット */
    if (snapAtStart == null){ stats.skipped++; return cb({ skipped: 'NO_LOCAL_PROJECTION', storyId: id }); }
    localHash(function(lh, err){
      if (!lh){ stats.skipped++; return cb({ skipped: err || 'NO_LOCAL_HASH', storyId: id }); }
      /* ★過去に観測した hash を authority にしない → 直前に必ず fresh getstory */
      post({ op: 'getstory', id: id }, function(e, r){
        if (e || !r || r.status !== 200 || !r.j || !r.j.ok){
          stats.netFail++; var rn = { storyId: id, ok: false, stage: 'fresh-getstory', error: 'UNAVAILABLE_OR_ABSENT', status: r ? r.status : null };
          note(rn); return cb(rn);
        }
        var g = r.j;
        var sAuth = String(g.authority || 'shadow');
        var pre = { serverRev: g.rev, serverHash: g.serverHash, serverAuthority: sAuth, serverDeleted: !!g.deleted, localHash: lh };
        markerSet(id, sAuth, g.rev, g.serverHash);
        if (sAuth === 'canonical'){ var already = { storyId: id, ok: true, alreadyCanonical: true, pre: pre }; note(already); return cb(already); }
        if (g.deleted){ var td = { storyId: id, ok: false, stage: 'precheck', error: 'SERVER_TOMBSTONE', pre: pre }; note(td); return cb(td); }
        if (!g.serverHash || g.serverHash !== lh){
          var hm = { storyId: id, ok: false, stage: 'precheck', error: 'HASH_MISMATCH', pre: pre };
          note(hm); return cb(hm);                     /* ★1つでも不一致 → NO WRITE */
        }
        /* ★★P0-4A: 送信直前に canonicalString を取り直して起点と比較する。
           非同期（hash 計算 + getstory 往復）の間にユーザー保存が入っていたら promote しない。 */
        var snapNow = canonicalStringNow();
        if (snapNow == null || snapNow !== snapAtStart){
          var lc = { storyId: id, ok: false, stage: 'precheck', error: 'LOCAL_CHANGED_DURING_PROMOTION',
                     pre: pre, note: 'promotestory request は送っていない' };
          note(lc); return cb(lc);                     /* ★promotestory request 0 */
        }
        stats.promotes++;
        var mid = 'promo:' + id + ':' + g.rev + ':' + lh;
        post({ op: 'promotestory', id: id, expectedRev: g.rev, expectedHash: lh, mid: mid }, function(e2, r2){
          /* ★★P0-4B: network error / timeout / 曖昧応答。
             ここで「失敗」と決めつけると、実際には成立している promotion を見失う。
             fresh getstory を **1回だけ** 行って server の実状で判定する。無限 retry はしない。 */
          var ambiguous = !!(e2 || !r2 || (r2.status !== 200 && r2.status !== 409) || !r2.j);
          if (ambiguous){
            return post({ op: 'getstory', id: id }, function(e3, r3){
              var b = (r3 && r3.j) ? r3.j : {};
              if (r3 && r3.status === 200 && b.ok && String(b.authority || '') === 'canonical'
                  && b.rev === g.rev && b.serverHash === lh && !b.deleted){
                stats.promoteOk++;
                markerSet(id, 'canonical', b.rev, b.serverHash);
                var okAmb = { storyId: id, ok: true, stage: 'ambiguous-resolved',
                              verdict: 'PROMOTION_CONFIRMED_AFTER_AMBIGUOUS', pre: pre,
                              post: { authority: b.authority, rev: b.rev, serverHash: b.serverHash, deleted: !!b.deleted },
                              contentUnchanged: (b.rev === g.rev && b.serverHash === lh) };
                note(okAmb); return cb(okAmb);
              }
              if (r3 && r3.status === 200 && b.ok && String(b.authority || '') === 'shadow'){
                stats.promoteFail++;
                var notDone = { storyId: id, ok: false, stage: 'ambiguous-resolved',
                                verdict: 'PROMOTION_NOT_APPLIED', pre: pre,
                                post: { authority: b.authority, rev: b.rev, serverHash: b.serverHash } };
                note(notDone); return cb(notDone);      /* promotion 未成立。再実行は呼び手の判断（自動 retry しない） */
              }
              stats.promoteFail++;
              var uncertain = { storyId: id, ok: false, stage: 'ambiguous-resolved',
                                verdict: 'PROMOTION_STATE_UNCERTAIN', hold: true, pre: pre,
                                post: { status: r3 ? r3.status : null, authority: b.authority, rev: b.rev, serverHash: b.serverHash },
                                note: '状態を確定できないため HOLD。自動 retry はしない。' };
              note(uncertain); return cb(uncertain);
            });
          }
          var j2 = r2.j || {};
          if (r2.status !== 200 || !j2.ok){
            stats.promoteFail++;
            var pf = { storyId: id, ok: false, stage: 'promote', status: r2.status, errorCode: j2.errorCode || null,
                       serverRev: j2.serverRev, serverHash: j2.serverHash, authority: j2.authority, pre: pre };
            note(pf); return cb(pf);
          }
          /* ★fresh readback で server 側の確定状態を取り直す（応答 echo を信じない） */
          post({ op: 'getstory', id: id }, function(e3, r3){
            var back = (r3 && r3.j) ? r3.j : {};
            var okAll = !!(r3 && r3.status === 200 && back.ok && String(back.authority||'') === 'canonical'
                           && back.rev === g.rev && back.serverHash === lh && !back.deleted);
            if (okAll) stats.promoteOk++; else stats.promoteFail++;
            markerSet(id, back.authority || 'canonical', back.rev, back.serverHash);
            var out = { storyId: id, ok: okAll, stage: 'readback', pre: pre,
                        post: { authority: back.authority, rev: back.rev, serverHash: back.serverHash, deleted: !!back.deleted },
                        contentUnchanged: (back.rev === g.rev && back.serverHash === lh) };
            note(out); return cb(out);
          });
        });
      });
    });
  }

  // =====================================================================
  // promotedelete — strict のみ
  //   ・general な deleted:true 受理も row missing tombstone 生成も **しない**
  //   ・物理削除はこのモジュールでは行わない（fix587/fix660 の正規経路に委ねる）
  // =====================================================================
  function promoteDelete(opts, cb){
    cb = (typeof cb === 'function') ? cb : function(){};
    opts = opts || {};
    if (!on()){ stats.skipped++; return cb({ skipped: 'OFF' }); }
    var id = storyId();
    if (!id){ stats.skipped++; return cb({ skipped: 'NO_AUTHORITY' }); }
    if (!isLoggedIn()){ stats.skipped++; return cb({ skipped: 'NOT_LOGGED_IN' }); }
    /* --- gate 1: pending delete plan / deleteOpId が local meta に存在し一致すること --- */
    var meta = null;
    try { var a = JSON.parse(lsg('chr6_slots_meta') || '[]'); if (a && a.length) for (var i=0;i<a.length;i++){ if (a[i] && String(a[i].id) === id) meta = a[i]; } } catch(e){}
    if (!meta || meta.deleted !== true){ return cb({ storyId: id, ok: false, stage: 'gate', error: 'NO_LOCAL_TOMBSTONE' }); }
    var localOpId = String(meta.deleteOpId || meta.deletedOpId || '');
    if (!localOpId){ return cb({ storyId: id, ok: false, stage: 'gate', error: 'NO_DELETE_OP_ID' }); }
    if (opts.deleteOpId && String(opts.deleteOpId) !== localOpId){
      return cb({ storyId: id, ok: false, stage: 'gate', error: 'DELETE_OP_ID_MISMATCH' });
    }
    localHash(function(lh, err){
      if (!lh){ return cb({ storyId: id, ok: false, stage: 'gate', error: err || 'NO_LOCAL_HASH' }); }
      post({ op: 'getstory', id: id }, function(e, r){
        if (e || !r || r.status !== 200 || !r.j || !r.j.ok){
          return cb({ storyId: id, ok: false, stage: 'fresh-getstory', error: 'UNAVAILABLE_OR_ABSENT', status: r ? r.status : null });
        }
        var g = r.j, sAuth = String(g.authority || 'shadow');
        var pre = { serverRev: g.rev, serverHash: g.serverHash, serverAuthority: sAuth, serverDeleted: !!g.deleted, localHash: lh, localOpId: localOpId };
        markerSet(id, sAuth, g.rev, g.serverHash);
        if (g.deleted) return cb({ storyId: id, ok: false, stage: 'precheck', error: 'ALREADY_TOMBSTONE', pre: pre });
        if (sAuth !== 'shadow') return cb({ storyId: id, ok: false, stage: 'precheck', error: 'NOT_SHADOW', pre: pre });
        if (!g.serverHash || g.serverHash !== lh) return cb({ storyId: id, ok: false, stage: 'precheck', error: 'HASH_MISMATCH', pre: pre });
        stats.promoteDeletes++;
        var mid = 'promodel:' + id + ':' + g.rev + ':' + lh;
        post({ op: 'promotedelete', id: id, expectedRev: g.rev, expectedHash: lh, deleteOpId: localOpId, mid: mid }, function(e2, r2){
          if (e2 || !r2){ stats.netFail++; return cb({ storyId: id, ok: false, stage: 'promotedelete', error: 'NET_FAIL', pre: pre }); }
          var j2 = r2.j || {};
          if (r2.status !== 200 || !j2.ok){
            return cb({ storyId: id, ok: false, stage: 'promotedelete', status: r2.status, errorCode: j2.errorCode || null, pre: pre });
          }
          post({ op: 'getstory', id: id }, function(e3, r3){
            var back = (r3 && r3.j) ? r3.j : {};
            var okAll = !!(r3 && r3.status === 200 && back.ok && back.deleted === true
                           && String(back.authority||'') === 'canonical' && back.rev === (g.rev + 1));
            if (okAll) stats.promoteDeleteOk++;
            markerSet(id, back.authority || 'canonical', back.rev, back.serverHash);
            var out = { storyId: id, ok: okAll, stage: 'readback', pre: pre,
                        post: { authority: back.authority, rev: back.rev, serverHash: back.serverHash, deleted: !!back.deleted },
                        physicalDelete: 'このモジュールでは実行しない（fix587/fix660 の正規経路に委ねる）' };
            note(out); return cb(out);
          });
        });
      });
    });
  }

  // =====================================================================
  // PREBOOT GATE（骨格のみ）
  //   ・目的は「gate 解決前に**書込と push を始めない**」こと。
  //     12-4 の実測で G.init()/S.load() は純読取と確定しているので、S 生成より前である必要はない。
  //   ・★server→local body apply はここでは一切行わない（最初の canary と混ぜない）。
  //   ・canonical document でだけ arm する。LEGACY story の挙動は変えない。
  // =====================================================================
  var gateState = { armed: false, resolved: true, reason: 'not-armed', suppressed: 0, at: null, verdict: null };
  var origSave = null, saveHost = null;
  function suppressSave(){
    try {
      var S = (typeof window.__chronicleGetState === 'function') ? window.__chronicleGetState('fix702') : (window.S || null);
      if (!S || typeof S.save !== 'function' || S.__f702gate) return false;
      origSave = S.save; saveHost = S;
      S.save = function(){
        if (!gateState.resolved){ gateState.suppressed++; try { console.warn(TAG, 'PREBOOT GATE: save suppressed'); } catch(e){} return; }
        return origSave.apply(this, arguments);
      };
      S.__f702gate = true;
      return true;
    } catch(e){ return false; }
  }
  function releaseSave(){
    try { if (saveHost && origSave){ saveHost.save = origSave; saveHost.__f702gate = false; origSave = null; saveHost = null; } } catch(e){}
  }
  function gate(cb){
    cb = (typeof cb === 'function') ? cb : function(){};
    if (!on()){ gateState.reason = 'OFF'; return cb({ skipped: 'OFF' }); }
    var id = storyId();
    if (!id){ gateState.reason = 'NO_AUTHORITY'; return cb({ skipped: 'NO_AUTHORITY' }); }
    var mk = markerOf(id);
    if (!mk || mk.authority !== 'canonical'){ gateState.reason = 'NOT_CANONICAL'; return cb({ skipped: 'NOT_CANONICAL' }); }
    gateState.armed = true; gateState.resolved = false; gateState.at = Date.now(); gateState.reason = 'armed';
    suppressSave();
    classify(function(res){
      gateState.verdict = res && res.verdict ? res.verdict : (res && res.skipped) || 'UNKNOWN';
      /* ★EQUAL / LOCAL_AHEAD のみ解除。それ以外は抑止したまま（apply も push もしない）。 */
      if (gateState.verdict === 'EQUAL' || gateState.verdict === 'LOCAL_AHEAD' || gateState.verdict === 'SAFE_ADOPT'){
        gateState.resolved = true; releaseSave(); gateState.reason = 'released:' + gateState.verdict;
      } else {
        gateState.reason = 'held:' + gateState.verdict;
        try { console.warn(TAG, 'PREBOOT GATE held: ' + gateState.verdict + '（apply も push も行わない）'); } catch(e){}
      }
      cb({ gate: JSON.parse(JSON.stringify(gateState)), classify: res });
    });
  }

  window.__v292Dfix702 = {
    __armed: true, off: off, on: on, maskOn: maskOn,
    status: function(){
      return { on: on(), off: off(), maskOn: maskOn(), loggedIn: isLoggedIn(), storyId: storyId(),
               authorityKey: authorityKey(), build: BUILD, protocol: PROTOCOL,
               fix697Present: !!f697(), marker: markerOf(storyId()), canonicalIds: canonicalIds(),
               mask: JSON.parse(JSON.stringify(maskStats)), gate: JSON.parse(JSON.stringify(gateState)),
               stats: JSON.parse(JSON.stringify(stats)) };
    },
    marker: markerMap, markerOf: markerOf,
    classify: classify, promote: promote, promoteDelete: promoteDelete, gate: gate,
    maskPreview: function(ls){ return maskIncoming(ls); },
    ledger: function(){ return LEDGER.slice(); }
  };
  try { console.log(TAG, 'loaded (authority cutover skeleton / default OFF / mask default ON / on=v292Dfix702On)'); } catch(e){}
})();
