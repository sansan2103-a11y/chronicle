// =====================================================================
// Chronicle TRPG - v292Dfix658 Phase1: 系譜センサス(shadow classifier)
// ---------------------------------------------------------------------
// ■何のために作ったか(2026-08-02)
//   セーブ同期の競合時に「両方に新しいつづき」バナー(fix402 forkBanner)や
//   home.html の per-slot local-ahead スキップが起き、端末が旧分岐に取り残される
//   実害が出ていた。最終形は自動分岐解決だが、いきなり自動で勝者を決めると
//   間違えたときに物語が消える。**まず観測する**。
//
// ■Phase1 の絶対条件(GPT裁定)
//   ・ダイアログ・同期・保存の**挙動を1つも変えない**(shadow)。
//   ・競合イベントを系譜で分類して数えるだけ。判定結果で何かを止めたり進めたりしない。
//   ・昇格(Phase2=自動解決)の条件は「観測開始から14日 かつ 競合イベント20件」。
//     満たしたかは status().promotionReady で見る。**自動では昇格しない**。
//
// ■分類(4種+見かけの競合)
//   fastForwardLocalToCloud  … クラウドは自分の基点から動いていない/ローカルだけ進んだ
//   fastForwardCloudToLocal  … ローカルは基点から動いていない/クラウドだけ進んだ
//   trueDivergence           … 双方が基点から動いた(=本物の分岐)
//   unknownLineage           … 材料が足りず判断しない(嘘の分類をしない)
//   noConflict               … 見かけ上の競合(どちらも基点から動いていない)
//
// ■系譜判定の材料(anchor台帳)
//   put 成功応答 / commitstate から得た「自分が最後に基点にした版」を持つ。
//   Worker本体のスキーマには一切触らない。読むのは op:'commitstate'(読取専用)だけ。
//
// ■書込先は localStorage の2キーのみ
//   v292Dfix658_anchor / v292Dfix658_census
//   (どちらも fix402 / home.html の collectLS の収集条件に当たらないので同期へ混入しない)
//
// ■スイッチ / 観測口
//   OFF   = localStorage['v292Dfix658Off']='1' … note* は完全に no-op(通信0・書込0)
//   観測  = window.__v292Dfix658.status() / .census() / .anchor() / .selfTest()
//   後始末= window.__v292Dfix658._resetCensus()(手動検証用)
//
// ■やらないこと(この版で意図的に持たない性質)
//   ・fetch / localStorage のラッパを足さない(iOSラッパ素通り第18型の教訓)
//   ・読み込み時に通信しない・タイマーもイベントリスナも張らない
//   ・書込op(put/forceput/putimg)は一切発行しない
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix658) return;
  var TAG = '[v292Dfix658:lineage-shadow]';

  var K_ANCHOR = 'v292Dfix658_anchor';
  var K_CENSUS = 'v292Dfix658_census';
  var MAX_EVENTS = 80;        // リングバッファ上限
  var MAX_BYTES  = 40000;     // 台帳JSONの上限(超えたら古いeventsから間引く)
  var CS_TIMEOUT_MS = 10000;  // commitstate の Abort タイムアウト
  var PROMOTE_DAYS = 14, PROMOTE_EVENTS = 20;   // 昇格条件(判定のみ・自動昇格はしない)

  function lsGet(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  var warned = false;
  function warnOnce(msg){ if (warned) return; warned = true; try { console.warn(TAG, msg); } catch(e){} }
  /* ★書込先の封じ込め: localStorage への書込みはこの関数の中の1か所だけ。
     許可キー以外は受け付けない(呼び間違いでも他のキーを汚さない)。 */
  function lsSetGuarded(k, v){
    if (k !== K_ANCHOR && k !== K_CENSUS) return false;
    try { localStorage.setItem(k, v); return true; }
    catch(e){ warnOnce('台帳の書込みに失敗しました(観測を諦めます。同期には影響しません): ' + (e && e.message)); return false; }
  }
  function off(){ return lsGet('v292Dfix658Off') === '1'; }

  /* ---- fix402 と同一のハッシュ実装(固定ベクトルで一致を契約テストしている) ---- */
  function hash(s){ var h=0; s=String(s||''); for(var i=0;i<s.length;i++){ h=((h<<5)-h+s.charCodeAt(i))|0; } return String(h>>>0); }
  function lsHash(s){ s = String(s || ''); return String(s.length) + ':' + hash(s); }

  /* ---- 接続先と認証(fix402 と同じ規約。自前実装で呼出側に依存しない) ---- */
  function proxyUrl(){
    try {
      var u = (lsGet('v292ProxyUrl') || '').trim();
      if (u) return u.replace(/\/+$/, '');
      if (window.__v292Dfix247bapi && window.__v292Dfix247bapi.DEFAULT_PROXY_URL) return window.__v292Dfix247bapi.DEFAULT_PROXY_URL;
    } catch(e){}
    return 'https://novel-proxy.sansan2103.workers.dev';
  }
  function authHeaders(){
    var h = { 'Content-Type': 'application/json' };
    try { var g = (window.__chronicleGoogleId && window.__chronicleGoogleId()) || ''; if (g) h['x-google-id'] = g; } catch(e){}
    try { var p = (lsGet('v292ProxyPass') || '').trim(); if (p) h['x-chronicle-pass'] = p; } catch(e){}
    return h;
  }
  function isLoggedIn(){ var h = authHeaders(); return !!(h['x-google-id'] || h['x-chronicle-pass']); }

  /* ---- 読取専用API。**書込opは絶対に発行しない**(契約テストで固定) ---- */
  function callCommitstate(){
    var ctrl = null, timer = null;
    try { if (typeof AbortController !== 'undefined') ctrl = new AbortController(); } catch(e){ ctrl = null; }
    var opts = { method: 'POST', headers: authHeaders(), body: JSON.stringify({ op: 'commitstate' }) };
    if (ctrl) { opts.signal = ctrl.signal; timer = setTimeout(function(){ try { ctrl.abort(); } catch(e){} }, CS_TIMEOUT_MS); }
    var clear = function(){ if (timer) { clearTimeout(timer); timer = null; } };
    try {
      return fetch(proxyUrl() + '/save', opts)
        .then(function(r){ return r.json(); })
        .then(function(j){ clear(); return (j && j.ok) ? j : null; },
              function(){ clear(); return null; });   // ★決して reject しない(呼出側の未処理拒否を作らない)
    } catch(e){ clear(); return Promise.resolve(null); }
  }

  /* ---- anchor台帳(自分が最後に基点にした版) ---- */
  function readAnchor(){
    try { var a = JSON.parse(lsGet(K_ANCHOR) || 'null'); return (a && a.v === 1) ? a : null; } catch(e){ return null; }
  }
  function writeAnchor(a){ try { return lsSetGuarded(K_ANCHOR, JSON.stringify(a)); } catch(e){ return false; } }

  /* ---- census台帳(分類結果の集計とリングバッファ) ---- */
  function emptyCensus(){
    return { v: 1,
             counts: { fastForwardLocalToCloud: 0, fastForwardCloudToLocal: 0, trueDivergence: 0, unknownLineage: 0, noConflict: 0 },
             firstAt: null, lastAt: null, events: [] };
  }
  function readCensus(){
    try {
      var c = JSON.parse(lsGet(K_CENSUS) || 'null');
      if (!c || c.v !== 1) return emptyCensus();
      if (!c.counts || typeof c.counts !== 'object') c.counts = emptyCensus().counts;
      if (!Array.isArray(c.events)) c.events = [];
      return c;
    } catch(e){ return emptyCensus(); }
  }
  function writeCensus(c){
    try {
      while (c.events.length > MAX_EVENTS) c.events.shift();
      var s = JSON.stringify(c);
      while (s.length > MAX_BYTES && c.events.length > 1) { c.events.shift(); s = JSON.stringify(c); }
      return lsSetGuarded(K_CENSUS, s);
    } catch(e){ return false; }
  }

  function h8(s){ return s ? String(s).slice(0, 8) : null; }

  /* =====================================================================
     分類器(純関数)。ここが Phase2 で「誰を勝者にするか」を決める芯になる。
     Phase1 では proposedWinner を**記録するだけ**で、誰にも渡さない。
     ===================================================================== */
  function classify(anchor, cloud, localLsHash){
    var r = { cls: 'unknownLineage', proposedWinner: null, forkWouldBeCreated: false, reason: null, anomaly: null, lh: null };
    if (!anchor)                        { r.reason = 'no-anchor'; return r; }
    if (!anchor.localBasePackageHash)   { r.reason = 'anchor-package-hash-unknown'; return r; }
    if (!cloud || !cloud.packageHash)   { r.reason = 'cloud-package-hash-unknown'; return r; }

    var lh = (localLsHash && anchor.localLsHash) ? (String(localLsHash) === String(anchor.localLsHash)) : null;
    r.lh = lh;

    if (String(cloud.packageHash) === String(anchor.localBasePackageHash)) {
      /* クラウドは自分の基点から中身が変わっていない */
      if (cloud.rev != null && anchor.localBaseRev != null && (+cloud.rev) !== (+anchor.localBaseRev)) {
        r.anomaly = 'rev-bump-same-hash';   // 中身が同じなのに版だけ進んだ(空pushの疑い)
      }
      if (lh === false) { r.cls = 'fastForwardLocalToCloud'; r.proposedWinner = 'local-ff-push'; return r; }
      if (lh === true) { r.cls = 'noConflict'; return r; }
      /* ★統括レビュー(2026-08-02): localLsHash が無いのに noConflict と言ってはいけない。
         この入力は local-ahead / home-pull-skip(=ローカルが進んでいることが文脈上確実)でしか
         起きないため、「どちらも動いていない」は嘘になり得る。判断しない側へ倒す。 */
      if (!localLsHash) { r.reason = 'local-hash-unknown'; return r; }
      r.reason = 'anchor-lshash-unknown'; return r;
    }

    /* クラウドが基点から動いている */
    if (lh === true) { r.cls = 'fastForwardCloudToLocal'; r.proposedWinner = 'cloud-ff-pull'; return r; }
    if (!localLsHash) { r.reason = 'local-hash-unknown'; return r; }
    if (lh === false) { r.cls = 'trueDivergence'; r.proposedWinner = 'cloud-canonical'; r.forkWouldBeCreated = true; return r; }
    r.reason = 'anchor-lshash-unknown'; return r;
  }

  /* ---- ターン差(local-remote)。読取専用。数えられない材料があれば null(嘘を書かない) ---- */
  function turnsOfRaw(raw){
    if (raw == null) return 0;
    if (typeof raw !== 'string' || !raw) return 0;
    try { var d = JSON.parse(raw); return (d && Array.isArray(d.turns)) ? d.turns.length : 0; } catch(e){ return null; }
  }
  function turnDeltaFromRemoteLs(remoteLs){
    try {
      if (!remoteLs || typeof remoteLs !== 'object') return null;
      var keys = {}, k, i;
      for (k in remoteLs){ if (Object.prototype.hasOwnProperty.call(remoteLs, k) && (k === 'chr6' || /^chr6_slot_/.test(k))) keys[k] = 1; }
      try { for (i = 0; i < localStorage.length; i++){ var lk = localStorage.key(i); if (lk === 'chr6' || /^chr6_slot_/.test(lk)) keys[lk] = 1; } } catch(e){}
      var lt = 0, rt = 0;
      for (k in keys){
        if (!Object.prototype.hasOwnProperty.call(keys, k)) continue;
        var a = turnsOfRaw(lsGet(k)), b = turnsOfRaw(remoteLs[k]);
        if (a === null || b === null) return null;
        lt += a; rt += b;
      }
      return lt - rt;
    } catch(e){ return null; }
  }

  /* ---- イベント記録 ---- */
  function record(where, anchor, cloud, localLsHash, turnDelta, serverRevHint, forcedReason){
    var r = classify(anchor, cloud, localLsHash);
    if (forcedReason && r.cls === 'unknownLineage') r.reason = forcedReason;
    var ev = {
      ts: Date.now(),
      where: where,
      cls: r.cls,
      proposedWinner: r.proposedWinner,
      turnDelta: (turnDelta == null ? null : turnDelta),
      forkWouldBeCreated: !!r.forkWouldBeCreated,
      localBaseRev: (anchor && anchor.localBaseRev != null) ? anchor.localBaseRev : null,
      serverRev: (cloud && cloud.rev != null) ? (+cloud.rev || 0) : (serverRevHint == null ? null : serverRevHint),
      ah8: h8(anchor && anchor.localBasePackageHash),
      ch8: h8(cloud && cloud.packageHash),
      lh: r.lh
    };
    if (r.reason) ev.reason = r.reason;
    if (r.anomaly) ev.anomaly = r.anomaly;
    var c = readCensus();
    if (typeof c.counts[r.cls] !== 'number') c.counts[r.cls] = 0;
    c.counts[r.cls]++;
    if (!c.firstAt) c.firstAt = ev.ts;
    c.lastAt = ev.ts;
    c.events.push(ev);
    writeCensus(c);
    return ev;
  }

  /* =====================================================================
     公開API。呼出側(fix402 / home.html)は存在チェックだけで済むよう、
     OFF のときも**オブジェクトと関数は必ず生やす**(中身が no-op になる)。
     ===================================================================== */
  function noteCommit(o){
    try {
      if (off() || !o) return null;
      var a = { v: 1,
                localBaseRev: (o.rev == null ? null : (+o.rev || 0)),
                localBasePackageHash: o.packageHash || null,
                localBaseCommitOpId: o.lastCommitOpId || null,
                localLsHash: o.lsHash || null,
                at: Date.now(), via: 'put' };
      writeAnchor(a);
      return a;
    } catch(e){ return null; }
  }

  function notePull(o){
    try {
      if (off() || !o) return null;
      var a = { v: 1,
                localBaseRev: (o.rev == null ? null : (+o.rev || 0)),
                localBasePackageHash: null,
                localBaseCommitOpId: null,
                localLsHash: o.lsHash || null,
                at: Date.now(), via: (o.via || 'pull-index') };
      writeAnchor(a);
      /* backfill: pull応答には packageHash/lastCommitOpId が無い。commitstate を1回だけ読み、
         **rev が一致するときだけ**埋める。ずれていたら埋めない(推測で台帳を作らない)。 */
      if (isLoggedIn()) {
        callCommitstate().then(function(j){
          try {
            if (!j) return;
            var cur = readAnchor();
            if (!cur || cur.localBaseRev == null) return;
            if (cur.localBasePackageHash) return;                      // 既に確定済み(putが後勝ちした等)
            if ((+j.rev || 0) !== (+cur.localBaseRev || 0)) return;    // 基点がずれた=埋めない
            cur.localBasePackageHash = j.packageHash || null;
            cur.localBaseCommitOpId = j.lastCommitOpId || null;
            cur.via = 'backfill'; cur.at = Date.now();
            writeAnchor(cur);
          } catch(e){}
        });
      }
      return a;
    } catch(e){ return null; }
  }

  function noteConflict(o){
    try {
      if (off() || !o) return Promise.resolve(null);
      var where = String(o.where || 'unknown');
      var serverRev = (o.serverRev == null) ? null : (+o.serverRev || 0);
      var localLsHash = o.localLsHash || null;
      var turnDelta = (o.turnDelta == null) ? null : (+o.turnDelta);
      if (turnDelta == null && o.remoteLs) turnDelta = turnDeltaFromRemoteLs(o.remoteLs);
      var anchor = readAnchor();
      if (!isLoggedIn()) return Promise.resolve(record(where, anchor, null, localLsHash, turnDelta, serverRev, 'no-auth'));
      return callCommitstate().then(function(cloud){
        try { return record(where, anchor, cloud, localLsHash, turnDelta, serverRev, cloud ? null : 'commitstate-unavailable'); }
        catch(e){ return null; }
      }, function(){ return null; });
    } catch(e){ return Promise.resolve(null); }
  }

  function statusOf(){
    try {
      var c = readCensus(), a = readAnchor();
      var counts = c.counts || {};
      var total = (counts.fastForwardLocalToCloud || 0) + (counts.fastForwardCloudToLocal || 0)
                + (counts.trueDivergence || 0) + (counts.unknownLineage || 0) + (counts.noConflict || 0);
      var days = c.firstAt ? Math.floor((Date.now() - c.firstAt) / 86400000) : 0;
      return {
        phase: 'shadow(観測のみ・挙動は1つも変えない)',
        on: !off(), off: off(), loggedIn: isLoggedIn(), proxy: proxyUrl(),
        anchor: a ? { rev: a.localBaseRev, ph8: h8(a.localBasePackageHash),
                      opId8: a.localBaseCommitOpId ? String(a.localBaseCommitOpId).slice(0, 8) : null,
                      lh8: h8(a.localLsHash), via: a.via, at: a.at } : null,
        counts: counts, events: (c.events || []).length,
        firstAt: c.firstAt, lastAt: c.lastAt,
        observedDays: days, conflictEvents: total,
        promotionRule: { days: PROMOTE_DAYS, events: PROMOTE_EVENTS },
        promotionReady: (days >= PROMOTE_DAYS && total >= PROMOTE_EVENTS)
      };
    } catch(e){ return { phase: 'shadow', on: false, error: String(e && e.message) }; }
  }

  function selfTest(){
    var fails = [];
    function chk(name, cond, got){ if (!cond) fails.push({ name: name, got: got }); }
    var A = { v: 1, localBaseRev: 10, localBasePackageHash: 'PH-BASE', localBaseCommitOpId: 'op1', localLsHash: '12:345', at: 0, via: 'put' };
    var r;
    r = classify(A, { rev: 10, packageHash: 'PH-BASE' }, '99:777');
    chk('ff-local', r.cls === 'fastForwardLocalToCloud' && r.proposedWinner === 'local-ff-push' && r.forkWouldBeCreated === false && !r.anomaly, r);
    r = classify(A, { rev: 11, packageHash: 'PH-BASE' }, '99:777');
    chk('ff-local+anomaly', r.cls === 'fastForwardLocalToCloud' && r.anomaly === 'rev-bump-same-hash', r);
    r = classify(A, { rev: 10, packageHash: 'PH-BASE' }, '12:345');
    chk('noConflict', r.cls === 'noConflict' && r.forkWouldBeCreated === false && r.proposedWinner === null, r);
    r = classify(A, { rev: 10, packageHash: 'PH-BASE' }, null);
    chk('unknown-cloud-same-local-null', r.cls === 'unknownLineage' && r.reason === 'local-hash-unknown', r);
    r = classify(A, { rev: 12, packageHash: 'PH-NEW' }, '12:345');
    chk('ff-cloud', r.cls === 'fastForwardCloudToLocal' && r.proposedWinner === 'cloud-ff-pull' && r.forkWouldBeCreated === false, r);
    r = classify(A, { rev: 12, packageHash: 'PH-NEW' }, '99:777');
    chk('trueDivergence', r.cls === 'trueDivergence' && r.proposedWinner === 'cloud-canonical' && r.forkWouldBeCreated === true, r);
    r = classify(A, { rev: 12, packageHash: 'PH-NEW' }, null);
    chk('unknown-local-hash', r.cls === 'unknownLineage' && r.reason === 'local-hash-unknown', r);
    r = classify(null, { rev: 1, packageHash: 'X' }, '1:1');
    chk('unknown-no-anchor', r.cls === 'unknownLineage' && r.reason === 'no-anchor', r);
    r = classify({ v: 1, localBaseRev: 1, localBasePackageHash: null, localLsHash: '1:1' }, { rev: 1, packageHash: 'X' }, '1:1');
    chk('unknown-anchor-package-hash', r.cls === 'unknownLineage' && r.reason === 'anchor-package-hash-unknown', r);
    r = classify(A, null, '1:1');
    chk('unknown-cloud-package-hash', r.cls === 'unknownLineage' && r.reason === 'cloud-package-hash-unknown', r);
    chk('lsHash互換(空文字)', lsHash('') === '0:0', lsHash(''));
    chk('lsHash互換(a)', lsHash('a') === '1:97', lsHash('a'));
    return { ok: fails.length === 0, fails: fails };
  }

  window.__v292Dfix658 = {
    __real: true,
    noteCommit: noteCommit,
    notePull: notePull,
    noteConflict: noteConflict,
    status: statusOf,
    census: function(){ try { return readCensus(); } catch(e){ return null; } },
    anchor: function(){ try { return readAnchor(); } catch(e){ return null; } },
    selfTest: selfTest,
    _resetCensus: function(){ if (off()) return false; return writeCensus(emptyCensus()); },
    lsHash: lsHash,
    classify: classify
  };

  try { console.log(TAG, 'loaded', off() ? 'OFF' : 'ON', '(shadow: 観測のみ)'); } catch(e){}
})();
