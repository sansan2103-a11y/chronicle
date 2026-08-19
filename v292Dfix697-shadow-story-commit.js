// =====================================================================
// Chronicle v292Dfix697: SHADOW_NONAUTHORITATIVE_WRITE（STEP2・非権威影コミット）
// ---------------------------------------------------------------------
// ■これは何か（GPT裁定 STEP2 CONDITIONAL GO）
//   per-story canonical 検証のため、この document が権限を持つ story だけを
//   Worker v29 の別表 story_shadow へ「影」としてコミットする。
//   **影は canonical ではない**。成功しても production の正にしない。
//   失敗/409/timeout のすべてで現行 pkg sync（fix399/fix402）へ副作用 0。
//
// ■絶対条件（裁定の写し）
//   ・shadow success → production canonical 扱いしない
//   ・shadow failure → 現行 pkg save を止めない
//   ・shadow 409     → 現行 fork UI を発火させない
//   ・production read path から story_shadow 参照 0（このファイルは読み経路を持たない）
//   ・fix402 の baseRev / dirtyTs / pushedTs / fork banner / send eligibility に触れない
//
// ■storyId の出所（裁定: fix694 authority のみ / chr6_active_slot 使用禁止）
//   window.__chronicleDocumentStoryKey('chr6' → 'default' / 'chr6_slot_X' → 'X')。
//   null（bare index 等・権限なし document）は影コミット 0。
//
// ■canonical projection（裁定 BLOCKER3/4/5 反映）
//   content = { schema, id, title, deleted, body{cfg,cast,scene,turns,mode},
//               sidecar{aiInstr, genderMap}, turnCount, snippet }
//   ・device/build は content に入れない（clientMeta として送る audit metadata）
//   ・hash は stableStringify(content) の SHA-256。Worker 側 chrCanonicalStoryString と
//     同一規約（契約試験で fixture 群の完全一致を検証）
//   ・★STEP3C 裁定: sidecar.genderMap = **null 固定**（全 story 共通）。
//       GENDER_SOURCE_CONTRACT_001 の確定により、gender の canonical source は
//       body.cast.hero.gender / body.cast.npcs[].gender のみ。
//       projection は genderMap_<id> / genderMap_"<id>" / chr6_v292Dfix54_genderMap_* を
//       **一切読まない**（legacy genderMap を canonical hash / source から除外）。
//       schema shape は変えない（sidecar.genderMap キーは残し値だけ null 固定）。
//       Worker serializer 側の物理削除は STEP3D〜3E 境界の課題として据置。
//   ・aiInstr: slot story = 'v292aiInstr_slot_<id>' / default story = 'v292aiInstr'
//     （fix297 KEY() = 'v292aiInstr' + slotSfx() と同じ導出）
//
// ■baseStoryRev（★裁定 DOCUMENT-SCOPED STORY REV）
//   v292Dfix402_storyRevs = { "<storyId>": rev } は **shared device-local BOOT CACHE**。
//   commit 時の live authority として毎回読み直してはいけない。
//   各 story document は非永続の runtime 値 documentShadowBaseRev を持ち、
//   **モジュール初期化時に一度だけ** storyRevs[storyId] からコピーする。
//   以後の commit は documentShadowBaseRev のみを baseStoryRev として使う。
//   shared map が他 document から更新されても、開いている document の
//   documentShadowBaseRev は変わらない（storage event 追従もしない）。
//   documentShadowBaseRev を進めるのは:
//     この document 自身の 200 normal / 200 noop / 409 SEED_EQUIVALENT のみ。
//   SHADOW_CONFLICT 409 では進めない。
//   進めたときは shared map も bootstrap cache として同時更新してよい。
//
// ■mid（BLOCKER2）
//   'ps:' + storyId + ':' + baseStoryRev + ':' + contentHash
//   同一 commit の通信再送 = 同一 mid（Worker idem2 が replay）。
//   内容が A→B→A と戻っても baseRev が違うため別 mid（旧 ps:<id>:<hash> の衝突を回避）。
//
// ■409 semantics（裁定どおり）
//   serverHash === localContentHash → SEED_EQUIVALENT: marker = serverRev / retry 0 / UI 0
//   serverHash !== localContentHash → SHADOW_CONFLICT: marker 不変 / retry 0 / UI 0 / 記録のみ
//
// ■トリガ
//   S.save 相乗り（fix402 と同型・独立 wrap）＋ sidecar 指紋 20 秒 poll（read-only）。
//   debounce 12s / maxwait 45s（fix402 と同じ定数・別タイマー）。
//   deleted(墓標) story は commit しない（STEP2 は live のみ）。
//   title は body/sidecar commit 時に現在値を projection（title 専用 hook は作らない）。
//
// ■スイッチ
//   有効 = v292Dfix697On === '1' かつ v292Dfix697Off !== '1'（★既定 OFF = 明示 opt-in）
// 検証口: window.__v292Dfix697 = { status, stats, ledger, flush, projection, contentHash, off }
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix697) return;
  var TAG = '[v292Dfix697:shadow-story-commit]';
  var DEBOUNCE_MS = 12000, MAXWAIT_MS = 45000, SIDE_POLL_MS = 20000, TIMEOUT_MS = 25000;
  var MARKER_KEY = 'v292Dfix402_storyRevs';   // ★collectLS 除外 prefix に同居（pkg baseline 不変）
  var BUILD = 'fix700';

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function lss(k,v){ try { localStorage.setItem(k, v); return true; } catch(e){ return false; } }
  function off(){ return lsg('v292Dfix697Off') === '1'; }
  function on(){ return !off() && lsg('v292Dfix697On') === '1'; }

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

  // ---- meta（title / deleted 読み取り専用） ----
  function metaEntry(id){
    try {
      var a = JSON.parse(lsg('chr6_slots_meta') || '[]');
      if (!Array.isArray(a)) return null;
      for (var i = 0; i < a.length; i++){ if (a[i] && String(a[i].id) === String(id)) return a[i]; }
    } catch(e){}
    return null;
  }

  // ---- sidecar 読み取り（BLOCKER5 の正規化） ----
  function readAiInstr(id){
    var k = (id === 'default') ? 'v292aiInstr' : ('v292aiInstr_slot_' + id);
    var v = lsg(k);
    return (v == null || v === '') ? null : String(v);
  }
  /* ★STEP3C: legacy genderMap を canonical から除外。
     genderMap_<id> / genderMap_"<id>" / chr6_v292Dfix54_genderMap_* を読まず、常に null。
     引数 id は schema 互換のため残すが未使用。 */
  function readGenderMap(id){ return null; }

  // ---- canonical projection（Worker chrCanonicalStoryString と同一規約） ----
  function stableStringify(v){
    if (v === undefined) return 'null';
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Object.prototype.toString.call(v) === '[object Array]'){
      var s = '[';
      for (var i = 0; i < v.length; i++) s += (i ? ',' : '') + stableStringify(v[i]);
      return s + ']';
    }
    var ks = []; for (var k in v){ if (Object.prototype.hasOwnProperty.call(v, k)) ks.push(k); }
    ks.sort();
    var out = '';
    for (var j = 0; j < ks.length; j++){
      var kk = ks[j];
      if (v[kk] === undefined) continue;
      out += (out ? ',' : '') + JSON.stringify(kk) + ':' + stableStringify(v[kk]);
    }
    return '{' + out + '}';
  }
  function snippetOf(body){
    try {
      var t = body && body.turns;
      if (!t || !t.length) return '';
      var last = t[t.length - 1] || {};
      var txt = String(last.narrative || last.text || last.n || '');
      return txt.slice(0, 200);
    } catch(e){ return ''; }
  }
  function projection(){
    var id = storyId();
    if (!id) return null;
    var bodyRaw = lsg(authorityKey());
    if (bodyRaw == null) return null;
    var d = null;
    try { d = JSON.parse(bodyRaw); } catch(e){ return null; }
    if (!d || typeof d !== 'object' || Object.prototype.toString.call(d) === '[object Array]') return null;
    var me = (id === 'default') ? null : metaEntry(id);
    if (me && me.deleted === true) return null;             // ★STEP2 は live のみ
    var turns = (d.turns && Object.prototype.toString.call(d.turns) === '[object Array]') ? d.turns : [];
    var body = { cfg: (d.cfg === undefined ? null : d.cfg), cast: (d.cast === undefined ? null : d.cast),
                 scene: (d.scene === undefined ? null : d.scene), turns: turns,
                 mode: (d.mode === undefined ? null : d.mode) };
    return {
      schema: 1,
      id: String(id),
      title: (me && me.title != null) ? String(me.title) : (id === 'default' ? 'default' : ''),
      deleted: false,
      body: body,
      sidecar: { aiInstr: readAiInstr(id), genderMap: readGenderMap(id) },
      turnCount: turns.length,
      snippet: snippetOf(body)
    };
  }
  function canonicalString(content){ return stableStringify(content); }
  function sha256hex(str, cb){
    try {
      var enc = new TextEncoder().encode(String(str));
      crypto.subtle.digest('SHA-256', enc).then(function(buf){
        var a = new Uint8Array(buf), h = '';
        for (var i = 0; i < a.length; i++){ var x = a[i].toString(16); h += (x.length < 2 ? '0' : '') + x; }
        cb(h);
      })['catch'](function(){ cb(null); });
    } catch(e){ cb(null); }
  }

  // ---- 通信（fix402 と独立・fire-and-forget） ----
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

  // ---- rev 管理（★DOCUMENT-SCOPED: shared map は boot cache のみ） ----
  function revMap(){
    try { var m = JSON.parse(lsg(MARKER_KEY) || '{}'); return (m && typeof m === 'object') ? m : {}; }
    catch(e){ return {}; }
  }
  var docBaseRev = null, docBaseRevInit = false;      // ★非永続 runtime 値（この document 専用）
  function initDocRev(){
    if (docBaseRevInit) return;
    var id = storyId();
    if (!id) return;                                   // 権限なし document は初期化もしない
    docBaseRevInit = true;
    docBaseRev = +revMap()[id] || 0;                   // ★boot cache から一度だけコピー
  }
  function advanceDocRev(id, rev){
    // ★この document 自身の 200 normal / 200 noop / SEED_EQUIVALENT からのみ呼ばれる
    docBaseRev = +rev || 0;
    try { var m = revMap(); m[String(id)] = docBaseRev; lss(MARKER_KEY, JSON.stringify(m)); } catch(e){}
  }

  // ---- 記録（メモリのみ・永続キー追加なし） ----
  var stats = { commits: 0, ok: 0, noop: 0, parityPass: 0, parityFail: 0,
                seedEquivalent: 0, shadowConflict: 0, netFail: 0, skipped: 0 };
  var LEDGER = [], LEDGER_CAP = 50;
  function note(row){ row.t = Date.now(); LEDGER.push(row); while (LEDGER.length > LEDGER_CAP) LEDGER.shift(); }
  /* ★STEP3C SUCCESS LEDGER（裁定: canary observability 目的のみ）
     in-memory only / 永続化しない / localStorage に書かない / network 追加なし /
     canonical payload に混ぜない / 本文・aiInstr 実内容は記録しない（hash と長さのみ）。 */
  /* replayed は Worker の idemReserve が replay 応答へ付ける authoritative flag（j.replayed）。
     client 側で推測しない。 */

  // ---- commit（完全 fire-and-forget） ----
  var inFlight = false, lastSentHash = null;
  function commit(why){
    if (!on() || inFlight) return;
    if (!isLoggedIn()) { stats.skipped++; return; }
    var content = projection();
    if (!content) { stats.skipped++; return; }
    var id = content.id;
    var str = canonicalString(content);
    sha256hex(str, function(localHash){
      if (!localHash) { stats.netFail++; return; }
      if (localHash === lastSentHash) return;              // 端末側 no-op skip
      initDocRev();
      var baseRev = +docBaseRev || 0;                      // ★shared map を再読しない（document-scoped）
      var mid = 'ps:' + id + ':' + baseRev + ':' + localHash;   // ★BLOCKER2
      var payload = { op: 'putstory', id: id, baseStoryRev: baseRev,
                      record: content, shadow: true, mid: mid,
                      clientMeta: { device: (navigator.userAgent || '').slice(0, 60), build: BUILD } };
      inFlight = true; stats.commits++;
      var ac = null, timer = null;
      try { ac = new AbortController(); timer = setTimeout(function(){ try { ac.abort(); } catch(e){} }, TIMEOUT_MS); } catch(e){}
      var opts = { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) };
      if (ac) opts.signal = ac.signal;
      fetch(proxyUrl() + '/save', opts).then(function(res){
        return res.json().then(function(j){ return { status: res.status, j: j }; });
      }).then(function(r){
        inFlight = false; if (timer) clearTimeout(timer);
        var j = r.j || {};
        if (r.status === 200 && j.ok){
          lastSentHash = localHash;
          if (j.noop) stats.noop++; else stats.ok++;
          if (j.serverHash && j.serverHash === localHash){ stats.parityPass++; }
          else { stats.parityFail++; note({ kind: 'PARITY_FAIL', id: id, rev: j.rev, localHash: localHash, serverHash: j.serverHash || null, why: why }); }
          /* ★STEP3C SUCCESS LEDGER: 成功も1行だけ記録（type/why/baseRev/serverRev/hash のみ） */
          note({ kind: 'SUCCESS', type: (j.noop ? 'NOOP' : 'OK'), id: id, why: why,
                 baseRev: baseRev, serverRev: (typeof j.rev === 'number' ? j.rev : null),
                 localHash: localHash, serverHash: j.serverHash || null, replayed: (j.replayed === true) });
          if (typeof j.rev === 'number') advanceDocRev(id, j.rev);   // 200 normal / 200 noop
          return;
        }
        if (r.status === 409 && j.conflict){
          if (j.serverHash && j.serverHash === localHash){
            stats.seedEquivalent++;                         // ★SEED_EQUIVALENT: doc rev 採用可・retry 0・UI 0
            if (typeof j.serverRev === 'number') advanceDocRev(id, j.serverRev);
            lastSentHash = localHash;
            note({ kind: 'SEED_EQUIVALENT', id: id, serverRev: j.serverRev });
          } else {
            stats.shadowConflict++;                         // ★SHADOW_CONFLICT: marker 不変・retry 0・UI 0
            note({ kind: 'SHADOW_CONFLICT', id: id, baseRev: baseRev,
                   serverRev: (typeof j.serverRev === 'number' ? j.serverRev : null),
                   localHash: localHash, serverHash: j.serverHash || null });
          }
          return;
        }
        stats.netFail++;
        note({ kind: 'HTTP_' + r.status, id: id, errorCode: j.errorCode || null });
      })['catch'](function(e){
        inFlight = false; if (timer) clearTimeout(timer);
        stats.netFail++;
        note({ kind: 'NET_FAIL', id: id, msg: String((e && e.message) || e).slice(0, 60) });
      });
    });
  }

  // ---- debounce（fix402 と別タイマー・同定数） ----
  var pushTimer = null, firstDirtyTs = 0;
  function markDirty(){
    if (!on()) return;
    var now = Date.now();
    if (!firstDirtyTs) firstDirtyTs = now;
    if (pushTimer) clearTimeout(pushTimer);
    var wait = DEBOUNCE_MS;
    if (now - firstDirtyTs >= MAXWAIT_MS) wait = 0;
    pushTimer = setTimeout(function(){ pushTimer = null; firstDirtyTs = 0; commit('debounce'); }, wait);
  }

  // ---- トリガ1: S.save 相乗り（fix402 と同型・独立 wrap） ----
  function wrapSave(){
    try {
      var S = (typeof window.__chronicleGetState === 'function') ? window.__chronicleGetState('fix697')
            : (window.S || null);
      if (!S || typeof S.save !== 'function' || S.__f697wrapped) return !!(S && S.__f697wrapped);
      var os = S.save.bind(S);
      S.save = function(){ var r = os.apply(this, arguments); try { markDirty(); } catch(e){} return r; };
      S.__f697wrapped = true; S.save.__f697 = true;
      try { console.log(TAG, 'S.save wrapped (shadow trigger)'); } catch(e){}
      return true;
    } catch(e){ return false; }
  }
  (function wpoll(){ wpoll._n = (wpoll._n || 0) + 1; if (wrapSave()) return; if (wpoll._n > 120) return; setTimeout(wpoll, 500); })();

  // ---- トリガ2: sidecar 指紋 poll（read-only・aiInstr/genderMap 変更を拾う） ----
  var lastFp = null;
  function fp(){
    var id = storyId(); if (!id) return null;
    var a = readAiInstr(id) || '';          /* ★STEP3C: genderMap は projection に入らないので指紋対象外 */
    return a.length + ':' + a.slice(0, 80);
  }
  try {
    setInterval(function(){
      if (!on()) return;
      var f = fp();
      if (f == null) return;
      if (lastFp != null && f !== lastFp) markDirty();
      lastFp = f;
    }, SIDE_POLL_MS);
  } catch(e){}

  // ★boot 時に一度だけ document rev snapshot を取る（fix694 authority は既に確定済み）
  try { initDocRev(); } catch(e){}

  window.__v292Dfix697 = {
    __armed: true,
    off: off, on: on,
    status: function(){ return { on: on(), loggedIn: isLoggedIn(), storyId: storyId(),
      authorityKey: authorityKey(), documentShadowBaseRev: docBaseRev, docRevInit: docBaseRevInit,
      bootCache: revMap(), inFlight: inFlight, stats: JSON.parse(JSON.stringify(stats)) }; },
    stats: function(){ return JSON.parse(JSON.stringify(stats)); },
    ledger: function(){ return LEDGER.slice(); },
    flush: function(){ commit('manual'); return true; },
    projection: projection,
    canonicalString: canonicalString,
    contentHash: function(cb){ var c = projection(); if (!c) return cb(null); sha256hex(canonicalString(c), cb); }
  };
  try { console.log(TAG, 'loaded (shadow non-authoritative / default OFF / on=v292Dfix697On)'); } catch(e){}
})();
