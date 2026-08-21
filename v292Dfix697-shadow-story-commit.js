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
  var BUILD = 'fix725';

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function lss(k,v){ try { localStorage.setItem(k, v); return true; } catch(e){ return false; } }
  function off(){ return lsg('v292Dfix697Off') === '1'; }
  /* ★★fix724(RULING37 §15/§24): FLAG 2-STATE CONTRACT。
     Off==='1' → OFF / それ以外 → DEFAULT ON。これだけ。
     legacy の v292Dfix697On は '1' でも '0' でも effective state に影響させない
     （fix723 の 3 値契約は STALE_EXPLICIT_ZERO_FLAG_SUPPRESSES_DEFAULT_ON のため撤回）。
     storage migration は行わない（残っている On キーを削除しない）。 */
  function on(){ return !off(); }

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

  // ---- meta（表示名 name / deleted 読み取り専用。★fix707: title ではなく name） ----
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
  /* ★★fix708(STEP3F): 任意 story の **read-only** projection を出せるようにする。
     なぜ必要か: 削除トランザクションは「まだ live のうちに」canonical hash を確定させる必要がある
     （墓標を立てた後に projection を作り直すのは禁止＝別物の hash になる）。
     独自 serializer を作ると contract が二重化するので、**必ずこの owner の実装を通す**。
     ★ここは読むだけ。書込・通信・commit・marker 更新を一切しない。
     ★deleted:true の meta を持つ story は従来どおり null（live のみ）＝ null 保護は壊さない。 */
  function keyOf(id){ return (String(id) === 'default') ? 'chr6' : ('chr6_slot_' + String(id)); }
  /* ★★fix719(STEP4E): CANONICAL CFG OWNERSHIP — story canonical に入る cfg の ALLOWLIST。
     ・secret-capable（key/naiKey/orKey/pollKey）・provider runtime（provider/orModel/model）・
       UI/device 設定（debug/showInner/simpleMode/aiAvatar/artStyle）・未知 field は **既定で除外**。
     ・Worker v34 の chrCanonicalStoryCfg と同一規約（別 serializer 禁止）。
     ・local body.cfg は一切書き換えない（projection 時にのみ濾過する read-only sanitize）。 */
  var CANONICAL_CFG_ALLOW = ['authorNote','bannedPhrases','creepyMode','dialogueLevel',
    'dramaLevel','engineMode','genrePresets','outLen','reactionLevel','toneKey'];
  function canonicalStoryCfg(raw){
    if (raw == null || typeof raw !== 'object' || Object.prototype.toString.call(raw) === '[object Array]') return null;
    var out = {};
    for (var i = 0; i < CANONICAL_CFG_ALLOW.length; i++){
      var k = CANONICAL_CFG_ALLOW[i];
      if (raw[k] !== undefined) out[k] = raw[k];
    }
    return out;
  }
  function projectFrom(id, key){
    if (!id || !key) return null;
    var bodyRaw = lsg(key);
    if (bodyRaw == null) return null;
    var d = null;
    try { d = JSON.parse(bodyRaw); } catch(e){ return null; }
    if (!d || typeof d !== 'object' || Object.prototype.toString.call(d) === '[object Array]') return null;
    var me = (id === 'default') ? null : metaEntry(id);
    if (me && me.deleted === true) return null;             // ★STEP2 は live のみ
    var turns = (d.turns && Object.prototype.toString.call(d.turns) === '[object Array]') ? d.turns : [];
    var body = { cfg: canonicalStoryCfg(d.cfg === undefined ? null : d.cfg), cast: (d.cast === undefined ? null : d.cast),
                 scene: (d.scene === undefined ? null : d.scene), turns: turns,
                 mode: (d.mode === undefined ? null : d.mode) };
    return {
      schema: 1,
      id: String(id),
      /* ★★fix707(CANONICAL_TITLE_SOURCE_CONTRACT)
         正式 contract: SERVER StoryRecord.title  <->  LOCAL chr6_slots_meta[].name
         ・live entry の表示名 field は **name**（title は fix579 の tombstone 専用 field で、
           tombstone は上の me.deleted 判定で既に null 返ししているため到達不能だった）。
         ・したがって me.title を読む旧実装では title が常に '' になっていた。
         ・default story は現行の 'default' 特例を**変更しない**（既存挙動維持）。 */
      title: (id === 'default') ? 'default' : ((me && me.name != null) ? String(me.name) : ''),
      deleted: false,
      body: body,
      sidecar: { aiInstr: readAiInstr(id), genderMap: readGenderMap(id) },
      turnCount: turns.length,
      snippet: snippetOf(body)
    };
  }
  function projection(){
    var id = storyId();
    if (!id) return null;
    return projectFrom(id, authorityKey());          /* ★従来と完全に同じ経路 */
  }
  /* ★fix708: document authority に依存しない read-only projection。 */
  function projectionOf(id){
    var s = (id == null) ? '' : String(id);
    if (!s) return null;
    return projectFrom(s, keyOf(s));
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
  /* ★★fix709(STEP3F canary で発見・HOME_SHADOW_TRANSPORT_AUTH_MISSING / GPT裁定 = APPROVED with 1 cut):
     window.__chronicleGoogleId を定義しているのは fix328 だが、**fix328 は index.html にしか script tag が無い**。
     home.html は fix663 が独自に Google ログインを持ち、**同じ保存キー v292GoogleToken・同じ形式**で保存し、
     認証ヘッダ相当は毎回 localStorage を読む方式になっている。
     そのため fix697 の authHeaders は HOME で常に空になり、shadowRequest が NOT_LOGGED_IN で止まっていた
     （＝削除の実入口である HOME で、fix708 のサーバ削除段が一度も到達できない）。

     ★裁定で確定した契約（ここを広げてはいけない）:
       A. window.__chronicleGoogleId が **function として存在する** ページ（index.html）
          ・helper が credential を返す      → 従来どおり認証
          ・helper が空 / null を返す        → 認証なし。**localStorage fallback しない**
          ・helper が throw する             → fail closed。**localStorage fallback しない**
          ＝ index の認証挙動を fix708 以前から 1 ミリも変えない。
       B. window.__chronicleGoogleId が **存在しない** ページ（home.html）だけ
          ・localStorage v292GoogleToken を **read-only fallback** として使ってよい。
     ★token 検証は fix328 / fix601 / fix663 と同一契約: exp は**秒** / 30 秒の余裕 / 期限切れは使わない /
       JSON schema を拡張しない / 新しい storage key を作らない / 書込をしない。 */
  function googleTokenFromLS(){
    try {
      var j = JSON.parse(lsg('v292GoogleToken') || 'null');
      if (j && j.token && j.exp && (j.exp * 1000) > (Date.now() + 30000)) return String(j.token);
    } catch(e){}
    return '';
  }
  function authHeaders(){
    var h = { 'Content-Type': 'application/json' };
    var g = '';
    if (typeof window.__chronicleGoogleId === 'function'){
      /* ★A: helper があるページでは helper だけ。空でも throw でも fallback しない（fail closed）。 */
      try { g = window.__chronicleGoogleId() || ''; } catch(e){ g = ''; }
    } else {
      /* ★B: helper 自体が無いページ（home.html）だけ read-only fallback。 */
      g = googleTokenFromLS();
    }
    if (g) h['x-google-id'] = g;
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

  // =====================================================================
  // ★★fix718(STEP4B): CANONICAL NORMAL SAVE ROUTING — document authority で write path を分離
  //   契約（GPT裁定 RULING22）:
  //     ・shadow document → 既存 putstory 経路（下の commit() 本体はバイト不変 / fresh getstory 追加なし）
  //     ・canonical document → canonicalCommit()（fresh-server-state-before-write / strict CAS / KEEP DATA）
  //     ・unknown / hold → どちらにも送らない（write 0、dirty は保持）
  //     ・LS の共有 cache (v292Dfix702_storyAuth) を canonical write authority にしない。
  //       cache が canonical を主張しても、in-memory の fresh 確認が無ければ unknown（送信 0）。
  //     ・account-global rev 参照 0 / force 0 / storage delete 0 / 新 endpoint ・新 auth 0。
  // =====================================================================
  var canonCtx = null;                       // ★document-scoped runtime: {id, rev, hash}（この document 自身の fresh 応答のみが更新）
  var canonHold = {};                        // ★terminal hold（CANONICAL_WRITE_CONFLICT / AUTHORITY_DRIFT / ALREADY_DELETED）
  var cstats = { routedCanonical: 0, routedShadow: 0, routedUnknown: 0, holds: 0,
                 convergedNoWrite: 0, sent: 0, ok: 0, noop: 0, convergedAfterConflict: 0,
                 confirmedByReadback: 0, conflicts: 0, ambiguous: 0, localChanged: 0,
                 drift: 0, deletedStop: 0, rowMissing: 0, parityFail: 0, netFail: 0 };
  function markerAuthorityHint(id){
    /* cache は「shadow へ送ってよいか」の否定側にだけ使う（canonical を与えない） */
    try { var m = JSON.parse(lsg('v292Dfix702_storyAuth') || '{}'); var e = m && m[String(id)];
          return !!(e && e.authority === 'canonical'); } catch(er){ return false; }
  }
  function docAuthorityRoute(id){
    if (canonHold[id]) return 'hold';
    if (canonCtx && canonCtx.id === id) return 'canonical';            // (1) この document 自身の canonical runtime
    /* ★★fix723(STEP4H/RULING36): (2) fix705 の read-only document authority contract。
       ・fix705 が boot で取得済みの fresh getstory 結果を **公開 contract 経由でのみ** 読む
         （内部 state を解釈しない・新規 network 0・LS cache 参照 0）。
       ・unsafe（STOP / 分類失敗）は **default shadow へ fallback せず 'hold'**。
         FAILED CLASSIFICATION != SHADOW（RULING36）。
       ・fresh かつ present かつ deleted:false のときだけ authority を採用する。
       ・NOT_FOUND（present:false / fresh:true）は判定せず下流へ落とす＝従来の new-story path。 */
    try {
      var F5 = window.__v292Dfix705;
      if (F5 && typeof F5.docAuthority === 'function'){
        var a5 = F5.docAuthority();
        if (a5 && String(a5.id) === String(id)){
          if (a5.unsafe === true) return 'hold';
          if (a5.fresh === true && a5.present === true){
            if (a5.deleted === true) return 'hold';
            if (a5.authority === 'canonical') return 'canonical';
            if (a5.authority === 'shadow') return 'shadow';
          }
        }
      }
    } catch(e){}
    try {                                                              // (3) fix702 の in-memory fresh accessor（あれば）
      var F2 = window.__v292Dfix702;
      if (F2 && typeof F2.docAuthority === 'function'){
        var a = F2.docAuthority();
        if (a && a.id === id && a.present === true){
          if (a.deleted) return 'unknown';
          if (a.authority === 'canonical') return 'canonical';
          if (a.authority === 'shadow') return 'shadow';
        }
      }
    } catch(e){}
    if (markerAuthorityHint(id)) return 'unknown';                     // (4) cache 単独は昇格させない＝送信 0
    return 'shadow';                                                   // (5) 既定（従来挙動）
  }
  function currentHashOf(id, cb){
    var c = null;
    try { c = projection(); } catch(e){ c = null; }
    if (!c || String(c.id) !== String(id)) return cb(null, null);
    var s = canonicalString(c);
    sha256hex(s, function(h){ cb(h || null, c); });
  }
  function sendPutCanonicalRaw(id, xr, xh, record, mid, cb){
    postSaveOnce({ op: 'putcanonical', id: id, expectedRev: xr, expectedHash: xh,
                   record: record, mid: mid,
                   clientMeta: { device: (navigator.userAgent || '').slice(0, 60), build: BUILD } }, cb);
  }
  function canonicalCommit(id, content, intendedLocalHash, why){
    inFlight = true; cstats.routedCanonical++;
    var fin = function(){ inFlight = false; };
    var condClearDirty = function(then){
      /* 送信 snapshot 以降に local mutation が無い場合のみ dirty 解消（後発入力を落とさない） */
      currentHashOf(id, function(h2){
        if (h2 && h2 === intendedLocalHash){ lastSentHash = intendedLocalHash; }
        then();
      });
    };
    /* ---- fresh getstory exactly 1（この応答だけを CAS authority にする） ---- */
    postSaveOnce({ op: 'getstory', id: id }, function(g, gerr){
      if (gerr || !g){ cstats.netFail++; note({ kind: 'C_GETSTORY_FAIL', id: id, why: why }); return fin(); }
      var j = g.j || {};
      if (g.status === 404){ cstats.rowMissing++; canonHold[id] = true;
        note({ kind: 'CANONICAL_ROW_MISSING', id: id }); return fin(); }
      if (g.status !== 200 || !j.ok){ cstats.netFail++; note({ kind: 'C_GETSTORY_HTTP_' + g.status, id: id }); return fin(); }
      if (String(j.authority || 'shadow') !== 'canonical'){
        cstats.drift++; canonHold[id] = true;
        note({ kind: 'CANONICAL_AUTHORITY_DRIFT', id: id, serverAuthority: j.authority || 'shadow' }); return fin(); }
      if (j.deleted){ cstats.deletedStop++; canonHold[id] = true;
        note({ kind: 'CANONICAL_ALREADY_DELETED', id: id }); return fin(); }
      var srvRev = (typeof j.rev === 'number') ? j.rev : 0;
      var srvHash = String(j.serverHash || '');
      /* ---- POST 前の local 再確認（連続入力競合対策） ---- */
      currentHashOf(id, function(hNow){
        if (!hNow){ cstats.netFail++; note({ kind: 'C_LOCAL_HASH_FAIL', id: id }); return fin(); }
        if (hNow !== intendedLocalHash){
          cstats.localChanged++; note({ kind: 'LOCAL_CHANGED_DURING_PREFLIGHT', id: id }); return fin(); }
        if (srvHash && srvHash === intendedLocalHash){
          /* 既に収束済み → write 0 */
          cstats.convergedNoWrite++; canonCtx = { id: id, rev: srvRev, hash: srvHash };
          note({ kind: 'CANONICAL_CONVERGED_NO_WRITE', id: id, rev: srvRev });
          return condClearDirty(fin);
        }
        /* ---- 異内容 → fresh 値で strict CAS 1回（force 禁止） ---- */
        var mid = 'pc:' + id + ':' + srvRev + ':' + intendedLocalHash;   // ★決定的（retry で新 mid を作らない）
        cstats.sent++;
        sendPutCanonicalRaw(id, srvRev, srvHash, content, mid, function(r, err){
          var readbackConverge = function(kindOk, kindKeep){
            postSaveOnce({ op: 'getstory', id: id }, function(g2, ge2){
              if (ge2 || !g2 || g2.status !== 200 || !(g2.j && g2.j.ok)){
                cstats.ambiguous++; note({ kind: 'CANONICAL_WRITE_AMBIGUOUS', id: id }); return fin(); }
              var j2 = g2.j;
              if (String(j2.serverHash || '') === intendedLocalHash){
                canonCtx = { id: id, rev: (typeof j2.rev === 'number' ? j2.rev : null), hash: intendedLocalHash };
                if (kindOk === 'CANONICAL_CONVERGED_AFTER_CONFLICT') cstats.convergedAfterConflict++;
                else cstats.confirmedByReadback++;
                note({ kind: kindOk, id: id, rev: j2.rev });
                return condClearDirty(fin);
              }
              if (kindKeep === 'CANONICAL_WRITE_CONFLICT'){
                cstats.conflicts++; canonHold[id] = true;
                note({ kind: 'CANONICAL_WRITE_CONFLICT', id: id, serverRev: j2.rev,
                       serverHash: String(j2.serverHash || '').slice(0, 16) });
              } else {
                cstats.ambiguous++; note({ kind: kindKeep, id: id, serverRev: j2.rev });
              }
              return fin();
            });
          };
          if (err || !r){ /* network / 不明瞭 → readback 最大 1 回 */
            return readbackConverge('CANONICAL_COMMIT_CONFIRMED_BY_READBACK', 'CANONICAL_WRITE_UNSETTLED'); }
          var jj = r.j || {};
          if (r.status === 200 && jj.ok){
            if (String(jj.serverHash || '') !== intendedLocalHash){
              cstats.parityFail++; note({ kind: 'CANONICAL_PARITY_FAIL', id: id }); return fin(); }
            canonCtx = { id: id, rev: (typeof jj.rev === 'number' ? jj.rev : null), hash: intendedLocalHash };
            if (jj.noop) cstats.noop++; else cstats.ok++;
            note({ kind: 'CANONICAL_COMMIT_OK', id: id, rev: jj.rev, noop: !!jj.noop, why: why });
            return condClearDirty(fin);
          }
          if (r.status === 409){ /* rev/hash mismatch ・cas-lost 等 → readback 最大 1 回で収束判定 */
            return readbackConverge('CANONICAL_CONVERGED_AFTER_CONFLICT', 'CANONICAL_WRITE_CONFLICT'); }
          cstats.netFail++; note({ kind: 'C_HTTP_' + r.status, id: id, errorCode: jj.errorCode || null });
          return fin();
        });
      });
    });
  }
  // ---- commit（完全 fire-and-forget） ----
  var inFlight = false, lastSentHash = null;
  function commit(why){
    /* ★★fix721.1(STEP4F.1/RULING31): restore transaction中はshadow/canonical writeを発火させない（読取のみ） */
    try { var __rj = JSON.parse(lsg('v292Dfix721_txn') || 'null');
          if (__rj && (__rj.phase === 'PREPARED' || __rj.phase === 'APPLYING')) return; } catch(e){}
    if (!on() || inFlight) return;
    if (!isLoggedIn()) { stats.skipped++; return; }
    var content = projection();
    if (!content) { stats.skipped++; return; }
    var id = content.id;
    var str = canonicalString(content);
    sha256hex(str, function(localHash){
      if (!localHash) { stats.netFail++; return; }
      if (localHash === lastSentHash) return;              // 端末側 no-op skip
      /* ★★fix718(STEP4B): document authority で write path を分離。
         shadow は以下の既存経路のまま（fresh getstory 追加なし・バイト不変）。 */
      var route = docAuthorityRoute(id);
      if (route === 'canonical'){ canonicalCommit(id, content, localHash, why); return; }
      if (route !== 'shadow'){
        if (route === 'hold') cstats.holds++; else cstats.routedUnknown++;
        note({ kind: 'CANONICAL_AUTHORITY_UNCONFIRMED', id: id, route: route });
        return;                                            /* 送信 0、dirty は保持 */
      }
      cstats.routedShadow++;
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

  // ---- トリガ1: S.save 相乗り ----
  /* ★★fix724(RULING37 §21-C): SAVE_CHAIN_TRUNCATED_AT_FEATURES_JS_FOR_NAMED_SLOTS 対策。
     ■何が起きていたか（RULING37 で確定した root cause）
       features.js(fix30) の S.save wrapper は named slot（chr6_slot_*）のとき
       inner を呼ばずに自分で lsSet して return する。
       → features.js より **内側** に install された層は、実 story の save で丸ごと飛ばされる。
       fix697 は内側に居たため markDirty が一度も発火しなかった（production 実測）。
     ■修正方針（fix444 world-law と同型・実績のある方式）
       (1) 冪等ガードを S 側フラグ → **関数側マーカー S.save.__f697** へ移す。
       (2) 低頻度 interval で「マーカーが消えていたら再 wrap」する。
           → 後から誰かが上に被せても、fix697 は必ず **最外殻へ戻る**＝truncation の外へ出る。
       (3) 内側関数の own props を全継承する（fix419c 教訓。__f444 等を隠さない）。
       (4) **多重 wrap しても markDirty は 1 save につき 1 回だけ**にする（depth ガード）。
           GPT裁定 §22 の「markDirty 二重発火 0 / commit storm 0」を構造で保証する。
     ■やらないこと
       ・features.js を書き換えない（named slot の保存経路には一切触れない）
       ・S.__f697wrapped は後方互換で書き続けるが **判定には使わない**
       ・bind しない（fix444 と同じく this を素通しする） */
  var REARM_MS = 2000;                    /* GPT裁定 RULING38 §Q3: 2000ms APPROVED（5000 へ落とさない） */
  var saveDepth = 0;
  var myWrapper = null;                   /* ★identity。marker だけに頼らない（後述） */
  var wrapStats = { installs: 0, rearmChecks: 0, marks: 0, skippedNoChange: 0 };

  /* ★★fix724(RULING38 §STOP): BLOCKED SAVE で false-dirty を作らない。
     fix600/fix635 の new-story-guard は「保存を通さない」= inner が body を書かずに return する。
     最外殻の fix697 が無条件に markDirty すると、書かれていない保存で commit が走ってしまう。
     → **この save で story body が実際に変化したときだけ** markDirty する。
     読むのは current document の body key 1 本だけ（storage write 0 / network 0）。 */
  function bodySnapshot(){
    try { var id = storyId(); if (!id) return null; return lsg(keyOf(id)); } catch(e){ return null; }
  }

  function wrapSave(){
    try {
      var S = (typeof window.__chronicleGetState === 'function') ? window.__chronicleGetState('fix697')
            : (window.S || null);
      if (!S || typeof S.save !== 'function') return false;
      /* ★★identity ガード（marker ガードでは不十分）:
         fix444/fix445 は inner の own props を全継承するため、__f697 マーカーだけを見ると
         「fix444 の wrapper に複写された __f697」を自分だと誤認し、fix697 層が内側に埋まったまま
         再装着されない。したがって **関数 identity** で判定する。 */
      if (S.save === myWrapper) return true;
      var os = S.save;
      var w = function(){
        var top = (saveDepth === 0);
        var before = top ? bodySnapshot() : null;
        saveDepth++;
        try { return os.apply(this, arguments); }
        finally {
          saveDepth--;
          if (saveDepth === 0){                 /* ★最外殻の層でだけ判定。層が二重でも 1 回 */
            try {
              var after = bodySnapshot();
              if (after !== before){ wrapStats.marks++; markDirty(); }
              else { wrapStats.skippedNoChange++; }
            } catch(e){}
          }
        }
      };
      /* ★★fix724(RULING38 §STOP: wrapper ping-pong 防止) MARKER UNION。
         fix419c の教訓どおり inner の own props を全継承するが、それだけでは足りない。
         ・fix444 の再装着条件は `S.save.__f444` の有無（関数側マーカー）。
         ・自分より外に「props を継承しない wrapper」（fix399/fix402/fix427/… ）が
           1 枚でも挟まると __f444 が消え、fix444 が再 wrap → 自分が埋没 → 自分も再 wrap …
           と 2 秒ごとに層が増え続ける（実測で再現した）。
         → **一度でも見たマーカーは落とさない**（os の props ∪ 直前の自分の props）。
           これで fix444 の guard は満たされ続け、ping-pong が止まる。 */
      try { var ks = Object.keys(os); for (var i = 0; i < ks.length; i++){ try { w[ks[i]] = os[ks[i]]; } catch(e2){} } } catch(e3){}
      try { if (myWrapper){ var pk = Object.keys(myWrapper);
              for (var j = 0; j < pk.length; j++){ try { if (w[pk[j]] === undefined) w[pk[j]] = myWrapper[pk[j]]; } catch(e4){} } } } catch(e5){}
      w.__f697 = true;                          /* 観測用マーカー（判定には使わない） */
      myWrapper = w;
      S.save = w;
      S.__f697wrapped = true;                   /* 後方互換のみ。判定に使わない */
      wrapStats.installs++;
      try { console.log(TAG, 'S.save wrapped (shadow trigger, re-armable)'); } catch(e){}
      return true;
    } catch(e){ return false; }
  }
  wrapSave();
  try { setInterval(function(){ wrapStats.rearmChecks++; try { wrapSave(); } catch(e){} }, REARM_MS); } catch(e){}

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

  /* ★★fix716: endpoint / auth / request の単一実装。shadowRequest と putStoryOnce が共有する。
     ここは送るだけ。localStorage / sessionStorage / docBaseRev / commit / projection を触らない。 */
  function postSaveOnce(body, cb){
    if (!isLoggedIn()){ cb(null, 'NOT_LOGGED_IN'); return; }
    var ac = null, timer = null;
    try { ac = new AbortController(); timer = setTimeout(function(){ try { ac.abort(); } catch(e){} }, TIMEOUT_MS); } catch(e){}
    var opts = { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) };
    if (ac) opts.signal = ac.signal;
    fetch(proxyUrl() + '/save', opts).then(function(res){
      return res.json().then(function(j){ return { status: res.status, j: j }; },
                             function(){ return { status: res.status, j: null }; });
    }).then(function(r){
      if (timer) clearTimeout(timer);
      cb({ status: r.status, j: r.j || {} }, null);
    })['catch'](function(e){
      if (timer) clearTimeout(timer);
      cb(null, 'NETWORK_FAILED');
    });
  }

  window.__v292Dfix697 = {
    __armed: true,
    off: off, on: on,
    status: function(){ return { on: on(), loggedIn: isLoggedIn(), storyId: storyId(),
      authorityKey: authorityKey(), documentShadowBaseRev: docBaseRev, docRevInit: docBaseRevInit,
      bootCache: revMap(), inFlight: inFlight, stats: JSON.parse(JSON.stringify(stats)),
      /* ★★fix724: save wrapper の装着状況（RULING37 §22 の観測点） */
      saveWrap: { installs: wrapStats.installs, rearmChecks: wrapStats.rearmChecks,
                  marks: wrapStats.marks, skippedNoChange: wrapStats.skippedNoChange,
                  attached: (function(){ try { var S = (typeof window.__chronicleGetState === 'function')
                    ? window.__chronicleGetState('fix697') : (window.S || null);
                    return !!(S && S.save && S.save === myWrapper); } catch(e){ return false; } })(),
                  rearmMs: REARM_MS } }; },
    stats: function(){ return JSON.parse(JSON.stringify(stats)); },
    ledger: function(){ return LEDGER.slice(); },
    flush: function(){ commit('manual'); return true; },
    /* ★fix718: read-only 可視化（書込 0） */
    canonState: function(){ return { ctx: canonCtx ? JSON.parse(JSON.stringify(canonCtx)) : null,
      holds: JSON.parse(JSON.stringify(canonHold)), cstats: JSON.parse(JSON.stringify(cstats)) }; },
    /* ★fix719: 規約検証用 read-only（書込 0） */
    canonicalStoryCfg: canonicalStoryCfg,
    projection: projection,
    canonicalString: canonicalString,
    contentHash: function(cb){ var c = projection(); if (!c) return cb(null); sha256hex(canonicalString(c), cb); },
    /* ★★fix708(STEP3F): 削除トランザクション用の read-only 口。
       どちらも **読むだけ**（書込 0 / 通信 0 / commit 0 / marker 更新 0）。 */
    projectionOf: projectionOf,
    contentHashOf: function(id, cb){
      var c = projectionOf(id);
      if (!c) return cb(null, 'NO_LIVE_PROJECTION');
      sha256hex(canonicalString(c), function(h){ cb(h || null, h ? null : 'HASH_FAILED'); });
    },
    /* fix587 が shadow op を出すための transport（endpoint/auth の owner を増やさない）。
       ★shadow op 以外は通さない。 */
    shadowRequest: function(payload, cb){
      var op = payload && payload.op;
      /* ★★fix720(STEP4D/RULING28): deletecanonical を allow-list に追加。
         caller は fix587 の削除トランザクションだけ（write 系汎用 op はここに足さない）。 */
      if (op !== 'getstory' && op !== 'deleteshadow' && op !== 'deletecanonical'){ cb(null, 'OP_NOT_ALLOWED'); return; }
      postSaveOnce(payload, cb);
    },
    /* ★★fix716(STEP C): per-story backfill 専用の **狭い** write 口。
       なぜ shadowRequest の allow-list に putstory を足さないのか:
         shadowRequest は read/delete 系の汎用外部口なので、そこへ write op を generic に開けると
         fix715 以外の caller にも putstory capability が広がる。ここは1本の専用口に閉じる。
       契約:
         ・caller から op を受け取らない。op は 'putstory' 固定。
         ・request は exactly 1。自動 retry は **しない**（曖昧なら caller が fresh getstory で確認する）。
         ・localStorage / sessionStorage へ 1 バイトも書かない。
         ・document authority に依存しない。current document の storyId も見ない。
         ・docBaseRev / document runtime rev を変更しない。commit を発火しない。projection を書き換えない。
           ＝別 story を backfill しても、いま開いている document の rev authority は一切動かない。
         ・endpoint / auth / request 実装は上と同一（postSaveOnce）。新 auth・新 token・新 endpoint は 0。
         ・応答は caller へそのまま返す（既存 error normalization のみ）。 */
    /* ★★fix717(STEP4A): canonical row への通常更新の **狭い** write 口（putcanonical 専用）。
       fix716 putStoryOnce と対をなす。authority で write path を完全分離する:
         shadow story    → putStoryOnce (op putstory 固定)
         canonical story → putCanonicalOnce (op putcanonical 固定)
       契約:
         ・caller から op を受け取らない。op は 'putcanonical' 固定。
         ・expectedRev / expectedHash 必須（caller は直前の fresh getstory から取得する。
           過去に観測した hash を authority にしない）。
         ・request は exactly 1。自動 retry しない（409 は CANONICAL_WRITE_CONFLICT として caller が停止）。
         ・localStorage / sessionStorage へ 1 バイトも書かない。docBaseRev / commit / projection を触らない。
           shadow 用の document rev 系（advanceDocRev）は canonical write と無関係のまま。
         ・endpoint / auth / request 実装は postSaveOnce（既存単一実装）を共有。新 auth・新 endpoint 0。 */
    putCanonicalOnce: function(payload, cb){
      var p = (payload && typeof payload === 'object') ? payload : null;
      if (!p) { cb(null, 'BAD_PAYLOAD'); return; }
      var id = (p.id == null) ? '' : String(p.id);
      if (!id) { cb(null, 'BAD_STORY_ID'); return; }
      if (!p.record || typeof p.record !== 'object') { cb(null, 'BAD_RECORD'); return; }
      var xr = +p.expectedRev;
      if (!(xr >= 0)) { cb(null, 'BAD_EXPECTED_REV'); return; }
      var xh = (p.expectedHash == null) ? '' : String(p.expectedHash);
      if (!xh) { cb(null, 'BAD_EXPECTED_HASH'); return; }
      var mid = (p.mid == null) ? '' : String(p.mid);
      if (!mid) { cb(null, 'BAD_MID'); return; }
      /* ★caller が渡してきた op / 任意 field は捨てて whitelist から組み直す。 */
      var body = { op: 'putcanonical', id: id, expectedRev: Math.floor(xr), expectedHash: xh,
                   record: p.record, mid: mid };
      if (p.clientMeta && typeof p.clientMeta === 'object') body.clientMeta = p.clientMeta;
      postSaveOnce(body, cb);
    },
    /* ★★fix725(RULING44 / Worker v36): SERVER-PRESERVING CFG SCRUB 専用の **狭い** write 口。
       なぜ shadowRequest の allow-list に scrubstorycfg を足さないのか:
         shadowRequest は read/delete 系の汎用外部口。write op を generic に開けると
         migration 以外の caller にも scrub capability が広がる。ここは1本の専用口に閉じる。
       契約:
         ・caller から op を受け取らない。op は 'scrubstorycfg' 固定。
         ・**client content payload を一切送らない**。送るのは id / expectedRev / expectedHash / mid だけ。
           record / body / cfg / cast / scene / turns / sidecar / title / deleted / authority は
           whitelist から組み直す時点で落ちる（Worker 側も fail-closed で拒否する）。
           ＝ CLIENT CONTENT AUTHORITY = ZERO。story content の source は server stored record のみ。
         ・request は exactly 1。自動 retry は **しない**（曖昧なら caller が fresh getstory で確認する）。
         ・localStorage / sessionStorage へ 1 バイトも書かない。
         ・current document の storyId を見ない。docBaseRev / commit / projection を触らない。
         ・**normal runtime からは呼ばれない**。migration caller 専用（自動 call 0 / UI 0 /
           background scrub 0）。呼ぶのは明示的な migration 手続きのみ。
         ・endpoint / auth / request 実装は postSaveOnce（既存単一実装）を共有。新 auth・新 endpoint 0。 */
    scrubStoryCfgOnce: function(payload, cb){
      var p = (payload && typeof payload === 'object') ? payload : null;
      if (!p) { cb(null, 'BAD_PAYLOAD'); return; }
      var id = (p.id == null) ? '' : String(p.id);
      if (!id) { cb(null, 'BAD_STORY_ID'); return; }
      var xr = +p.expectedRev;
      if (!(xr >= 0)) { cb(null, 'BAD_EXPECTED_REV'); return; }
      var xh = (p.expectedHash == null) ? '' : String(p.expectedHash);
      if (!xh) { cb(null, 'BAD_EXPECTED_HASH'); return; }
      var mid = (p.mid == null) ? '' : String(p.mid);
      if (!mid) { cb(null, 'BAD_MID'); return; }
      /* ★caller が渡してきた op / content / その他の任意 field は捨てる。ここで組み直す。 */
      var body = { op: 'scrubstorycfg', id: id, expectedRev: Math.floor(xr), expectedHash: xh, mid: mid };
      postSaveOnce(body, cb);
    },
    /* ★★fix729(RULING57 §4): CAPABILITY ENDPOINT == TITLE WRITE ENDPOINT を構造で保証するための
       read-only accessor。fix729 が独自の URL 設定体系を作らないよう、
       title write が実際に向く base をそのまま返す。書き込み能力は一切持たない。 */
    endpointBase: function(){ try { return proxyUrl(); } catch(e){ return ''; } },
    /* ★★fix729(RULING56 / Worker v37): TITLE-ONLY STRICT CAS 専用の **狭い** write 口。
       なぜ必要か:
         rename UI は現在開いていない slot も rename できる（CASE T2）。しかし fix697 の
         dirty trigger は body / sidecar しか見ないので title だけの変更は永久に commit されない。
         body を巻き込まずに server stored record の title だけを差し替える口をここに 1 本だけ開ける。
       契約（RULING56 §19-§20）:
         ・caller から op を受け取らない。op は 'setstorytitle' 固定。
         ・payload whitelist は id / title / expectedRev / expectedHash / mid の 5 つだけ。
           record / body / cfg / cast / scene / turns / sidecar / deleted / authority は
           組み直す時点で落ちる（Worker 側も fail-closed で拒否する）。
         ・request は exactly 1。自動 retry は **しない**。
         ・localStorage / sessionStorage へ 1 バイトも書かない。
         ・**current document を一切見ない**。storyId() / docBaseRev / projection() / commit() /
           markDirty を呼ばない。id は caller が明示的に渡す（cross-document 対応のため）。
         ・この port から normal body commit を呼ばない。
         ・endpoint / auth / request 実装は postSaveOnce（既存単一実装）を共有。新 auth・新 endpoint 0。 */
    setStoryTitleOnce: function(payload, cb){
      var p = (payload && typeof payload === 'object') ? payload : null;
      if (!p) { cb(null, 'BAD_PAYLOAD'); return; }
      var id = (p.id == null) ? '' : String(p.id);
      if (!id) { cb(null, 'BAD_STORY_ID'); return; }
      if (typeof p.title !== 'string') { cb(null, 'BAD_TITLE'); return; }
      var xr = +p.expectedRev;
      if (!(xr >= 0)) { cb(null, 'BAD_EXPECTED_REV'); return; }
      var xh = (p.expectedHash == null) ? '' : String(p.expectedHash);
      if (!xh) { cb(null, 'BAD_EXPECTED_HASH'); return; }
      var mid = (p.mid == null) ? '' : String(p.mid);
      if (!mid) { cb(null, 'BAD_MID'); return; }
      /* ★caller が渡してきた op / content / その他の任意 field は捨てる。ここで組み直す。 */
      var body = { op: 'setstorytitle', id: id, title: String(p.title).slice(0, 40),
                   expectedRev: Math.floor(xr), expectedHash: xh, mid: mid };
      postSaveOnce(body, cb);
    },
    putStoryOnce: function(payload, cb){
      var p = (payload && typeof payload === 'object') ? payload : null;
      if (!p) { cb(null, 'BAD_PAYLOAD'); return; }
      var id = (p.id == null) ? '' : String(p.id);
      if (!id) { cb(null, 'BAD_STORY_ID'); return; }
      if (!p.record || typeof p.record !== 'object') { cb(null, 'BAD_RECORD'); return; }
      var base = +p.baseStoryRev;
      if (!(base >= 0)) { cb(null, 'BAD_BASE_STORY_REV'); return; }
      var mid = (p.mid == null) ? '' : String(p.mid);
      if (!mid) { cb(null, 'BAD_MID'); return; }
      /* ★caller が渡してきた op / その他の任意 field は捨てる。ここで組み直す。 */
      var body = { op: 'putstory', id: id, baseStoryRev: base, record: p.record,
                   shadow: true, mid: mid };
      if (p.clientMeta && typeof p.clientMeta === 'object') body.clientMeta = p.clientMeta;
      postSaveOnce(body, cb);
    }
  };
  try { console.log(TAG, 'loaded (shadow non-authoritative / default ON / kill=v292Dfix697Off=1 / save-wrap re-arm)'); } catch(e){}
})();
