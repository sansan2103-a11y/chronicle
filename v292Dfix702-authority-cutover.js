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
  /* ★★fix703(production regression 修正)
     fix702 初版は「service が無ければ自分で __chronicleStoryLifecycle を作る」実装だった。
     しかし index.html の読込順は fix702(L2829) → fix587(L3205) で、
     fix587 の冒頭は `if (window.__chronicleStoryLifecycle) return;` という**冪等ガード**。
     先にオブジェクトを作ってしまうと **fix587 が丸ごと起動しなくなる**（実機で観測）。
     → 二度と value 代入で先回りしない。fix685 と同じ accessor 方式で
       「fix587 が代入した瞬間に包む」に変える。自前生成は最後の保険だけ。 */
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
      wrapped.__f702 = true;
      if (!(svc && typeof svc === 'object')) return false;   /* ★自分では作らない（fix587 を殺さない） */
      svc.filterIncoming = wrapped;
      maskStats.mode = prev ? 'wrap(fix587)' : 'attach(existing-svc)';
      maskStats.installed = true;
      try { console.log(TAG, 'legacy apply mask installed (' + maskStats.mode + ')'); } catch(e){}
      return true;
    } catch(e){ return false; }
  }
  /* ★fix703: accessor 方式。getter は「まだ誰も代入していない間」undefined を返すので、
     fix587 の冪等ガードは素通りし、fix587 は正常に起動できる。
     fix587（あるいは他モジュール）が代入した瞬間に setter が包む。 */
  var __svcHeld = undefined;
  if (!(window.__chronicleStoryLifecycle && typeof window.__chronicleStoryLifecycle === 'object')){
    try {
      Object.defineProperty(window, '__chronicleStoryLifecycle', {
        configurable: true,
        get: function(){ return __svcHeld; },
        set: function(v){ __svcHeld = v; try { maskStats.installed = false; installMask(); } catch(e){} }
      });
      maskStats.mode = 'accessor-armed';
    } catch(e){ maskStats.mode = 'accessor-failed'; }
  } else {
    installMask();
  }
  /* 監視: 誰かが filterIncoming を差し替えたら包み直す。
     ★最後の保険: DOMContentLoaded 後も service がまだ無い（fix587 未ロード / OFF）なら、
     そこで初めて自前生成する。この時点なら同期 script tag はすべて実行済みで
     fix587 の冪等ガードを踏まない。 */
  (function maskPoll(){
    maskPoll._n = (maskPoll._n || 0) + 1;
    try {
      var svc = window.__chronicleStoryLifecycle;
      if (svc && typeof svc.filterIncoming === 'function' && !svc.filterIncoming.__f702){
        maskStats.installed = false; installMask();
      }
      var domReady = (typeof document !== 'undefined' && document.readyState !== 'loading');
      if (!svc && domReady && maskPoll._n > 4){
        __svcHeld = { filterIncoming: null, __f702created: true };
        var host = __svcHeld;
        maskStats.installed = false;
        host.filterIncoming = function(x){ return { ls: x, blocked: [] }; };   /* 一旦置いてから包む */
        installMask();
        maskStats.mode = 'create(fallback:no-lifecycle)';
      }
    } catch(e){}
    if (maskPoll._n > 60) return;
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
  /* ★fix718(STEP4B): in-memory fresh authority（LS cache とは別。write authority の根拠はこちら） */
  var lastFresh = null;   // {id, present, authority, rev, hash, deleted, at}
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
          lastFresh = { id: id, present: false, authority: null, rev: null, hash: null, deleted: false, at: Date.now() };
          note(ra); return cb(ra);
        }
        if (r.status !== 200 || !j.ok){ stats.netFail++; var re = { storyId: id, error: 'HTTP_' + r.status }; note(re); return cb(re); }
        var sAuth = String(j.authority || 'shadow'), sRev = (typeof j.rev === 'number') ? j.rev : null;
        var sHash = j.serverHash || null, sDel = !!j.deleted;
        /* ★server が正本。marker は cache なので、食い違ったら server で直す。 */
        markerSet(id, sAuth, sRev, sHash);
        lastFresh = { id: id, present: true, authority: sAuth, rev: sRev, hash: sHash, deleted: sDel, at: Date.now() };
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
  // (7-C1) 裁定31 P0-3 — C1 materialization 専用の狭い promotion 入口
  //   なぜ必要か: promote() は v292Dfix702On（origin 全体の永続 localStorage flag）を要求する。
  //   promotion のためだけにそれを一時 ON にすると、途中の crash/reload で flag が残留し、
  //   promotion 以外の fix702 挙動まで ON 状態で残る。FIRST_SCHEMA2 の制御として広すぎる。
  //   契約:
  //     ・current document exact story のみ
  //     ・schema1 shadow のみ（fresh getstory で確認）
  //     ・persistent fix702On 不要 / kill switch v292Dfix702Off は常に優先
  //     ・permit は in-memory のみ。promote() の同期 guard を通った直後に disarm するので、
  //       reload/crash 後の permit 残留は構造上 0。
  //     ・promotion ロジック自体は再実装せず promote() をそのまま reuse する。
  //     ・通常 fix702 behavior / 既存 fix702On path は一切変更しない。
  // =====================================================================
  var C1_PERMIT = null;   /* ★in-memory のみ。永続化しない。 */
  function c1PermitValid(id){
    return !!(C1_PERMIT && C1_PERMIT.armed === true && id && C1_PERMIT.storyId === id);
  }
  function promoteForC1Materialization(targetId, cb){
    cb = (typeof cb === 'function') ? cb : function(){};
    if (!targetId || typeof targetId !== 'string') return cb({ ok: false, error: 'C1_BAD_TARGET' });
    if (off()) return cb({ ok: false, error: 'C1_KILLED' });
    var id = storyId();
    if (!id || id !== targetId)
      return cb({ ok: false, error: 'C1_SCOPE_MISMATCH', documentStory: id, target: targetId });
    if (!isLoggedIn()) return cb({ ok: false, error: 'NOT_LOGGED_IN' });
    /* ★fresh server state を見てからしか permit を arm しない。 */
    post({ op: 'getstory', id: id }, function(e, r){
      if (e || !r || r.status !== 200 || !r.j || !r.j.ok)
        return cb({ ok: false, error: 'C1_PRECHECK_UNAVAILABLE', status: r ? r.status : null });
      var g = r.j;
      if (String(g.authority || 'shadow') !== 'shadow')
        return cb({ ok: false, error: 'C1_NOT_SHADOW', authority: g.authority });
      if (g.record && g.record.schema === 2)
        return cb({ ok: false, error: 'C1_NOT_SCHEMA1', schema: 2 });
      if (g.deleted) return cb({ ok: false, error: 'C1_SERVER_TOMBSTONE' });
      var done = false;
      C1_PERMIT = { storyId: id, armed: true, at: Date.now() };
      try {
        promote(function(res){ if (done) return; done = true; C1_PERMIT = null; cb(res); });
      } catch(err){
        done = true; C1_PERMIT = null;
        return cb({ ok: false, error: 'C1_PROMOTE_THREW', detail: String(err && err.message || err) });
      } finally {
        /* ★promote() の permit 検査は同期。ここで disarm しても遅くない。
           permit の寿命 = 1 回の同期呼出フレームのみ。 */
        C1_PERMIT = null;
      }
    });
  }

  // =====================================================================
  // (7) promotestory — fresh getstory → strict CAS → fresh readback
  // =====================================================================
  function promote(cb){
    cb = (typeof cb === 'function') ? cb : function(){};
    var id = storyId();
    /* ★裁定31 P0-3: 永続 flag v292Dfix702On の代わりに、in-memory の C1 permit でも通す。
       permit は promoteForC1Materialization が同期フレーム内だけ arm するため、
       reload/crash 後に残留し得ない（localStorage へ 1 バイトも書かない）。
       ON 時の既存挙動は 1 バイトも変えない。 */
    if (!on() && !c1PermitValid(id)){ stats.skipped++; return cb({ skipped: 'OFF' }); }
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
        /* ★★fix733(RULING90 §11-§14) — TYPE A SIDE-PORT NOTIFY
           promote 系は server の authority / lifecycle 自体を変える。fix697 が持っている
           document rev authority と route は送信を試みた時点で信用できなくなるため、
           **request attempt 時点で** invalidate する（応答を待たない。network error でも
           server 側で成立している可能性があるため）。
           fix697 側は AUTHORITY_RELOAD_REQUIRED になり、reload まで body write 0 になる。
           ここでは fix702 の判定・CAS・marker には一切触れていない。 */
        try { var _f697 = window.__v292Dfix697;
              if (_f697 && typeof _f697.invalidateDocRevAuthority === 'function'){
                _f697.invalidateDocRevAuthority('promotestory-attempt', id, true);
              } } catch(_e733){}
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
        /* ★★fix733(RULING90 §11-§14) — TYPE A SIDE-PORT NOTIFY
           promote 系は server の authority / lifecycle 自体を変える。fix697 が持っている
           document rev authority と route は送信を試みた時点で信用できなくなるため、
           **request attempt 時点で** invalidate する（応答を待たない。network error でも
           server 側で成立している可能性があるため）。
           fix697 側は AUTHORITY_RELOAD_REQUIRED になり、reload まで body write 0 になる。
           ここでは fix702 の判定・CAS・marker には一切触れていない。 */
        try { var _f697 = window.__v292Dfix697;
              if (_f697 && typeof _f697.invalidateDocRevAuthority === 'function'){
                _f697.invalidateDocRevAuthority('promotedelete-attempt', id, true);
              } } catch(_e733){}
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
    /* ★fix718: document-scoped read-only accessor。LS cache ではなく直近の fresh getstory のみを返す。 */
    docAuthority: function(){ var id = storyId();
      if (!id || !lastFresh || lastFresh.id !== id) return null;
      return JSON.parse(JSON.stringify(lastFresh)); },
    classify: classify, promote: promote, promoteDelete: promoteDelete, gate: gate,
    /* ★裁定31 P0-3: C1 materialization 専用の狭い promotion 入口（永続 flag 不要） */
    promoteForC1Materialization: promoteForC1Materialization,
    c1PermitArmed: function(){ return !!(C1_PERMIT && C1_PERMIT.armed); },
    maskPreview: function(ls){ return maskIncoming(ls); },
    ledger: function(){ return LEDGER.slice(); }
  };
  try { console.log(TAG, 'loaded (authority cutover skeleton / default OFF / mask default ON / on=v292Dfix702On)'); } catch(e){}
})();
