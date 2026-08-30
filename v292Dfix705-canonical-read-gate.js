// =====================================================================
// v292Dfix705 — STEP3E: canonical read authority（既知 storyId 限定）
//   ★fix706 改訂: meta を HOLD しない / title hydration を行わない / title 不一致は fail-closed
//   ★fix707 改訂: LEGACY EMPTY-TITLE **SAME-HASH ONLY** COMPATIBILITY（serverHash 一致必須）
//                legacy diff hydration は採用しない（OVERBROAD として REJECT）
// ---------------------------------------------------------------------
// 役割:
//   ・story document を開いた時点（head）で **WRITE HOLD** を張る。
//   ・server に op:'getstory' を **document あたり1回**だけ投げて authority を分類する。
//       authority = 'canonical' → server を正本として扱う（same-hash なら無書込）
//       authority = 'shadow'    → HOLD 解除。現行 shadow/local 経路へ戻す
//       row なし / 404          → HOLD 解除。現行経路へ戻す
//       network/auth/parse/hash/classification 失敗
//                               → KEEP LOCAL DATA + HOLD 継続 + 明示エラー + STOP
//   ・「fetch 失敗したので local を正本として書く」は**実装しない**。
//
// 設計上の必須事実（実測）:
//   F1 起動時の最初の body 書込は index.html:2424（fixProviderCfg / 2429 で同期呼出）で、
//      S.save を経由しない直書き。→ HOLD は storage 境界に、かつ head で張る必要がある。
//   F2 S は boot で一度だけ hydrate され以後 localStorage を読み直さない。
//      → apply 後は location.reload() が必須（fix399/fix402 の既存 pull と同じ）。
//   F3 __v292Dfix654._native('setItem') は全 wrapper 装着前に捕獲された native。
//      → canonical hydration をこれで書けば fix698 layer1 / fix402 / fix527 が発火しない。
//
// 禁止（コードで担保）:
//   ・legacy pkg apply（fix399 applySave / fix402 applyPkg）を呼ばない
//   ・fix587 filterIncoming を通さない（fix702 mask と衝突させない）
//   ・chr6_slots_meta / genderMap_* / account 設定 / 他 story を書かない
//   ・canonical marker を削除しない
//   ・canonical → shadow の downgrade をしない
//   ・owner global（__chronicleStoryLifecycle 等）を先行生成しない
//
// 既定: OFF（v292Dfix705On === '1' かつ v292Dfix705Off !== '1' のときだけ有効）
// 検証口: window.__v292Dfix705 = { status, stats, classify, release, on, off, __armed }
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix705) return;                 /* 冪等（自 namespace のみ） */
  var TAG = '[v292Dfix705:canonical-read-gate]';
  var BUILD = 'fix705+719merge+721gate+723auth+724flags+755v2read+755b+755d+755e';
  var TIMEOUT_MS = 25000;
  var APPLIED_KEY = 'v292Dfix705_applied';          /* ★sessionStorage（localStorage ではない） */

  // ---- localStorage 薄いアクセサ（読みのみ。書きは applyWrite だけ） ----
  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix705Off') === '1'; }
  /* ★★fix724(RULING37 §15/§24): FLAG 2-STATE CONTRACT。
     Off==='1' → OFF / それ以外 → DEFAULT ON。これだけ。
     legacy の v292Dfix705On は '1' でも '0' でも effective state に影響させない
     （fix723 の 3 値契約は STALE_EXPLICIT_ZERO_FLAG_SUPPRESSES_DEFAULT_ON のため撤回）。
     storage migration は行わない（残っている On キーを削除しない）。 */
  function on(){ return !off(); }

  /* ★★fix721.2(STEP4F.2/RULING32 §2): INDEX PRE-RECOVERY SIDE EFFECT GAP 封鎖。
     restore journal(v292Dfix721_txn)が PREPARED/APPLYING の間は、fix705 は
     getstory / classify / apply / body write を一切開始しない（読取のみのgate。
     journal を localStorage から直読するので fix721 の load 前でも有効）。
     journal 不在/壊れ = hold 無し（従来挙動）。第二markerは作らない。 */
  function restoreHold721(){
    try {
      var j = JSON.parse(lsg('v292Dfix721_txn') || 'null');
      return !!(j && (j.phase === 'PREPARED' || j.phase === 'APPLYING'));
    } catch(e){ return false; }
  }

  // ---- sessionStorage（apply → reload の収束記録） ----
  function ssGet(k){ try { return sessionStorage.getItem(k); } catch(e){ return null; } }
  function ssSet(k,v){ try { sessionStorage.setItem(k, v); return true; } catch(e){ return false; } }
  function ssDel(k){ try { sessionStorage.removeItem(k); return true; } catch(e){ return false; } }

  // =====================================================================
  // storyId の導出（T0: head。fix694 はまだ走っていないので URL から独立に導く）
  //   ・?story=<id> のみを見る。chr6_active_slot（mirror）は読まない。
  //   ・T1 で __chronicleDocumentStoryKey が確定したら **必ず突合**し、
  //     食い違ったら KEY_DIVERGENCE として HOLD 継続 + STOP。
  // =====================================================================
  function urlStoryId(){
    try {
      var m = String(location.search || '').match(/[?&]story=([^&#]*)/);
      if (!m) return null;
      var v = decodeURIComponent(m[1] || '');
      v = v.replace(/^"+|"+$/g, '');
      if (!v) return null;
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(v)) return null;   /* 一意に取れないなら hold しない */
      return v;
    } catch(e){ return null; }
  }
  function bodyKeyOf(id){ return (id === 'default') ? 'chr6' : ('chr6_slot_' + id); }
  function aiKeyOf(id){ return (id === 'default') ? 'v292aiInstr' : ('v292aiInstr_slot_' + id); }

  var STORY_ID = urlStoryId();
  var BODY_KEY = STORY_ID ? bodyKeyOf(STORY_ID) : null;
  var AI_KEY   = STORY_ID ? aiKeyOf(STORY_ID) : null;

  /* ★書込許可リスト（コード固定・この2つだけ）。native body writer はこれ以外を書けない。
     ★fix706: chr6_slots_meta はこの list にも WRITE HOLD にも入れない（title hydration を行わないため）。 */
  function allowList(){ return BODY_KEY ? (AI_KEY ? [BODY_KEY, AI_KEY] : [BODY_KEY]) : []; }
  function isAllowed(k){
    var a = allowList();
    for (var i = 0; i < a.length; i++) if (a[i] === String(k)) return true;
    return false;
  }
  /* ★★fix706(POST-CANARY SAFETY REVISION)
     WRITE HOLD の対象は「body / aiInstr」だけに戻す。
     ・chr6_slots_meta は **HOLD しない**。
       現行 canonical hash 規約では meta.name / lastOpenedAt 等は hash 入力ではないため、
       分類前に meta 全体を DROP する必要がない。
       fix705 では DROP していたため通常起動の lastOpenedAt 更新が失われていた
       （META_HOLD_LASTOPENED_LOSS / MEDIUM / CONFIRMED）。
     ・current document からの write を止めるだけ。他 tab を制御する仕組みは持たない。 */
  function heldKeys(){ return allowList().slice(); }
  function isHeld(k){
    var a = heldKeys();
    for (var i = 0; i < a.length; i++) if (a[i] === String(k)) return true;
    return false;
  }

  // =====================================================================
  // state / stats
  // =====================================================================
  var state = {
    build: BUILD, storyId: STORY_ID, bodyKey: BODY_KEY, aiKey: AI_KEY,
    held: false, holdInstalled: false, resolved: false,
    phase: 'init',            /* init / held / classifying / applied / released / stopped */
    verdict: null,            /* CANONICAL_SAME_HASH / CANONICAL_APPLIED / SHADOW / NOT_FOUND / … */
    error: null,              /* NETWORK / AUTH / PARSE / HASH / APPLY_PARTIAL / … */
    serverRev: null,          /* ★document runtime live authority（共有 rev map には書かない） */
    serverHash: null,
    localHash: null,
    markerAuthority: null,
    keyDivergence: null,
    serverTitle: null, localTitle: null, freshLocal: false,
    legacy: false, legacyHashComputed: false,
    schema: null              /* ★fix755: fresh 分類が確定した row の schema（1/2）。未分類は null */
  };
  var stats = {
    holdBlockedSet: 0, holdBlockedRemove: 0, lastBlockedKey: null,
    getstory: 0, netFail: 0,
    sameHash: 0, applies: 0, reloads: 0, partial: 0, stops: 0,
    titleUnresolved: 0, legacySameHash: 0, legacyUnsupported: 0,
    /* ★意図的に迂回したことを観測可能にする（裁定要件） */
    bypass: { nativeWrites: 0, keys: [], bypassed: ['fix698:layer1-setItem', 'fix402:wrapSetItem', 'fix527:mirror-lock', 'fix706:write-hold'] }
  };
  var LEDGER = [], LEDGER_CAP = 30;
  function note(row){ try { row.t = Date.now(); LEDGER.push(row); while (LEDGER.length > LEDGER_CAP) LEDGER.shift(); } catch(e){} }
  function stop(code, extra){
    state.phase = 'stopped'; state.error = code; stats.stops++;
    var r = { stop: code }; if (extra) for (var k in extra) r[k] = extra[k];
    note(r);
    try { console.warn(TAG, 'STOP:', code, '（local データは保持。write hold は継続）'); } catch(e){}
    return r;
  }

  // =====================================================================
  // (1) WRITE HOLD — storage 境界・document scoped
  //   ・対象は **この document の story の 2 key だけ**。他 story / 他 key は素通し。
  //   ・block = 「捨てる」。既存値は書き換えない（KEEP LOCAL DATA）。
  //   ・marker(v292Dfix702_storyAuth) の有無に関係なく張る（裁定 Q2）。
  // =====================================================================
  function installHold(){
    if (state.holdInstalled || !BODY_KEY) return false;
    var f654 = window.__v292Dfix654;
    if (!f654 || typeof f654.wrap !== 'function') { state.error = 'NO_STORAGE_TRAP'; return false; }
    var prevSet = f654.wrap('setItem', function(k, v){
      try {
        if (state.held && isHeld(k)){
          stats.holdBlockedSet++; stats.lastBlockedKey = String(k);
          return;                                     /* ★捨てる。既存値は無変更 */
        }
      } catch(e){}
      return prevSet ? prevSet.call(this, k, v) : undefined;
    });
    var prevRem = f654.wrap('removeItem', function(k){
      try {
        if (state.held && isHeld(k)){
          stats.holdBlockedRemove++; stats.lastBlockedKey = String(k);
          return;                                     /* ★KEEP DATA: 削除も止める */
        }
      } catch(e){}
      return prevRem ? prevRem.call(this, k) : undefined;
    });
    state.holdInstalled = true; state.held = true; state.phase = 'held';
    note({ hold: 'installed', keys: heldKeys() });
    return true;
  }
  function releaseHold(why){
    state.held = false; state.resolved = true; state.phase = 'released';
    note({ hold: 'released', why: why });
  }

  // =====================================================================
  // (2) canonical hydration 専用 native writer
  //   ★fix705 内部からのみ / apply window 中のみ / allowlist の key のみ。
  //   ★汎用 writer として export しない（window へ出さない）。
  // =====================================================================
  var applyWindow = false;
  /* ★fix755: schema2 hydrate の書込先は fix743.keysFor(STORY_ID) の固定集合
     （body + sidecar 13 keys）。新しい key mapping をここに作らない。
     schema1 のときは従来どおり body / aiInstr の 2 key のみ。 */
  function applyAllowedKeys(){
    if (state.schema === 2){
      try {
        var C = window.__v292DfixCC2;
        if (C && typeof C.keysFor === 'function' && STORY_ID){
          var K = C.keysFor(STORY_ID), out = [];
          for (var f in K){ if (Object.prototype.hasOwnProperty.call(K, f)) out.push(String(K[f])); }
          return out;
        }
      } catch(e){}
      return [];                                   /* builder 不在 = 書込 0（fail-closed） */
    }
    return allowList();
  }
  function isApplyAllowed(k){
    var a = applyAllowedKeys();
    for (var i = 0; i < a.length; i++) if (a[i] === String(k)) return true;
    return false;
  }
  function applyWrite(k, v){
    if (!applyWindow) return { ok: false, reason: 'NOT_IN_APPLY_WINDOW' };
    if (!isApplyAllowed(k)) return { ok: false, reason: 'KEY_NOT_ALLOWED' };
    var f654 = window.__v292Dfix654;
    var nat = (f654 && typeof f654._native === 'function') ? f654._native('setItem') : null;
    if (typeof nat !== 'function') return { ok: false, reason: 'NO_NATIVE_SETITEM' };
    try {
      nat.call(localStorage, String(k), String(v));
      stats.bypass.nativeWrites++;
      if (stats.bypass.keys.indexOf(String(k)) < 0) stats.bypass.keys.push(String(k));
      return { ok: true };
    } catch(e){ return { ok: false, reason: 'QUOTA_OR_THROW', detail: String(e && e.message || e) }; }
  }
  /* ★fix755: schema2 hydrate 専用の remove（server 側 null の sidecar を exact に反映する）。
     apply window 中 / 許可キーのみ / fix654 native removeItem 経由。export しない。 */
  function applyRemove(k){
    if (!applyWindow) return { ok: false, reason: 'NOT_IN_APPLY_WINDOW' };
    if (!isApplyAllowed(k)) return { ok: false, reason: 'KEY_NOT_ALLOWED' };
    var f654 = window.__v292Dfix654;
    var nat = (f654 && typeof f654._native === 'function') ? f654._native('removeItem') : null;
    if (typeof nat !== 'function') return { ok: false, reason: 'NO_NATIVE_REMOVEITEM' };
    try {
      nat.call(localStorage, String(k));
      stats.bypass.nativeWrites++;
      if (stats.bypass.keys.indexOf(String(k)) < 0) stats.bypass.keys.push(String(k));
      return { ok: true };
    } catch(e){ return { ok: false, reason: 'REMOVE_THROW', detail: String(e && e.message || e) }; }
  }

  /* ★★fix706: title hydration は **実行しない**（裁定 (c) ADOPT / (b) HOLD）。
     applyTitleMeta は削除した。理由:
       ・chr6_slots_meta の表示名 field は name であり title ではない
         （CANONICAL_TITLE_SOURCE_CONTRACT / HIGH / CONFIRMED MISMATCH / OPEN）
       ・server canonical title は現行 client 由来 row では実質 '' なので、
         それを local へ hydrate すると表示名を空にする危険がある
       ・migration / compatibility 設計なしに me.title → me.name へ変えることも禁止
     したがって fix706 は「title が一致する場合だけ body / aiInstr を apply する」
     fail-closed 方針にする（下記 doApply の TITLE_CONTRACT_UNRESOLVED）。 */

  // =====================================================================
  // (3) 通信（fix697/fix700 と同一規約・独立実装）
  // =====================================================================
  function proxyUrl(){
    try {
      var u = (lsg('v292ProxyUrl') || '').replace(/\s+/g, '');
      if (u) return u.replace(/\/+$/, '');
      if (window.__v292Dfix247bapi && window.__v292Dfix247bapi.DEFAULT_PROXY_URL) return window.__v292Dfix247bapi.DEFAULT_PROXY_URL;
    } catch(e){}
    return 'https://novel-proxy.sansan2103.workers.dev';
  }
  function authHeaders(){
    var h = { 'Content-Type': 'application/json' };
    try { var g = (window.__chronicleGoogleId && window.__chronicleGoogleId()) || ''; if (g) h['x-google-id'] = g; } catch(e){}
    try { var p = (lsg('v292ProxyPass') || '').replace(/^\s+|\s+$/g, ''); if (p) h['x-chronicle-pass'] = p; } catch(e){}
    return h;
  }
  function isLoggedIn(){ var h = authHeaders(); return !!(h['x-google-id'] || h['x-chronicle-pass']); }
  function post(payload, cb){
    var ac = null, timer = null;
    try { ac = new AbortController(); timer = setTimeout(function(){ try { ac.abort(); } catch(e){} }, TIMEOUT_MS); } catch(e){}
    var opts = { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) };
    if (ac) opts.signal = ac.signal;
    fetch(proxyUrl() + '/save', opts).then(function(res){
      return res.json().then(function(j){ return { status: res.status, j: j }; },
                             function(){ return { status: res.status, j: null }; });
    }).then(function(r){ if (timer) clearTimeout(timer); cb(null, r); })
    ['catch'](function(e){ if (timer) clearTimeout(timer); cb(e, null); });
  }

  // =====================================================================
  // (4) local canonical hash
  //   ★fix697 の projection / canonicalString を **再実装しない**（規約分岐を作らない）。
  //     fix697.contentHash は on() を見ないので OFF でも使える。
  //     fix697 が居ない場合は HASH_UNAVAILABLE として STOP（local を正本にしない）。
  // =====================================================================
  function localHash(cb){
    var W = window.__v292Dfix697;
    if (!W || typeof W.contentHash !== 'function') return cb(null, 'HASH_UNAVAILABLE');
    try { W.contentHash(function(h){ cb(h || null, h ? null : 'HASH_NULL'); }); }
    catch(e){ cb(null, 'HASH_THROW'); }
  }
  /* ★fix755: schema2 row 用の local hash。fix697.contentHashV2（= fix743 builder +
     既存 canonicalString の単一実装）を使う。fix705 に serializer を作らない。 */
  function localHashV2(cb){
    var W = window.__v292Dfix697;
    if (!W || typeof W.contentHashV2 !== 'function') return cb(null, 'HASH_V2_UNAVAILABLE');
    try { W.contentHashV2(STORY_ID, function(h, err){ cb(h || null, h ? null : (err || 'HASH_V2_NULL')); }); }
    catch(e){ cb(null, 'HASH_V2_THROW'); }
  }
  /* ★fix755: 分類済み schema に応じた hash 経路（schema1 は従来と byte 同一の経路） */
  function localHashForSchema(cb){
    if (state.schema === 2) return localHashV2(cb);
    return localHash(cb);
  }

  // =====================================================================
  // (5) marker（fix702 の cache を **読むだけ**。分類の高速化用。HOLD の条件にはしない） 
  // =====================================================================
  function markerOf(id){
    try {
      var m = JSON.parse(lsg('v292Dfix702_storyAuth') || '{}');
      if (m && typeof m === 'object' && m[id]) return m[id];
    } catch(e){}
    return null;
  }

  // =====================================================================
  // (6) applied record（sessionStorage・収束判定）
  // =====================================================================
  function readApplied(){
    try {
      var r = JSON.parse(ssGet(APPLIED_KEY) || 'null');
      if (!r || typeof r !== 'object') return null;
      if (String(r.storyId) !== String(STORY_ID)) return null;      /* ★別 story の record は使わない */
      return r;
    } catch(e){ return null; }
  }
  function writeApplied(rec){ return ssSet(APPLIED_KEY, JSON.stringify(rec)); }
  function consumeApplied(){ ssDel(APPLIED_KEY); }

  // =====================================================================
  // (7) 分類 → same-hash / apply / 解除 / STOP
  // =====================================================================
  var classifyStarted = false;
  function classify(cb){
    cb = (typeof cb === 'function') ? cb : function(){};
    if (!on()) return cb({ skipped: 'OFF' });
    if (!STORY_ID) return cb({ skipped: 'NO_STORY_ID' });
    if (classifyStarted) return cb({ skipped: 'ALREADY_RAN' });    /* ★document あたり1回 */
    /* ★fix721.2: restore-hold 中は開始しない（classifyStarted を消費しない = hold 解除後に実行可能） */
    if (restoreHold721()) return cb({ skipped: 'restore-hold' });
    classifyStarted = true;
    state.phase = 'classifying';

    if (!isLoggedIn()) return cb(stop('AUTH', { detail: 'not logged in' }));

    var mk = markerOf(STORY_ID);
    state.markerAuthority = mk ? String(mk.authority || '') : null;

    stats.getstory++;
    /* ★★fix755(裁定 BLOCKER#12): current document の authoritative read を
       **schema2-capable** にする。fix697.getStoryV2Once（op:'getstory' 固定 /
       clientCanonicalSchemaMax:2 内部固定）を使う。汎用 shadowRequest には触らない。
       ★fix697 契約: cb(result, errorCode)（fix705 の post とは引数順が逆。罠#3）。 */
    var W755 = window.__v292Dfix697;
    if (!W755 || typeof W755.getStoryV2Once !== 'function')
      return cb(stop('NETWORK', { detail: 'NO_V2_READ_PATH' }));
    W755.getStoryV2Once(STORY_ID, function(r, e){
      if (e === 'NOT_LOGGED_IN') { stats.netFail++; return cb(stop('AUTH', { detail: e })); }
      if (e || !r) { stats.netFail++; return cb(stop('NETWORK', { detail: e ? String(e) : 'no response' })); }
      if (r.status === 404) {
        consumeApplied(); state.verdict = 'NOT_FOUND'; releaseHold('not-found'); return cb({ verdict: 'NOT_FOUND' });
      }
      if (r.status === 401 || r.status === 403) { stats.netFail++; return cb(stop('AUTH', { status: r.status })); }
      if (r.status !== 200 || !r.j || !r.j.ok) { stats.netFail++;
        return cb(stop('NETWORK', { status: r.status,
                                    errorCode: (r.j && r.j.errorCode) || null })); }

      var j = r.j;
      var auth = String(j.authority || 'shadow');
      state.serverRev = (typeof j.rev === 'number') ? j.rev : null;
      state.serverHash = j.serverHash || null;
      /* ★fix755: row schema を確定（Worker getstory は recordSchema を返す） */
      state.schema = (typeof j.recordSchema === 'number') ? j.recordSchema
                   : ((j.record && j.record.schema === 2) ? 2 : 1);

      if (auth === 'shadow') {
        /* ★downgrade 禁止: marker が canonical なのに server が shadow → 競合として STOP */
        if (state.markerAuthority === 'canonical') {
          return cb(stop('AUTHORITY_CONFLICT', { markerAuthority: 'canonical', serverAuthority: 'shadow' }));
        }
        consumeApplied(); state.verdict = 'SHADOW'; releaseHold('shadow'); return cb({ verdict: 'SHADOW' });
      }
      if (auth !== 'canonical') {
        return cb(stop('UNKNOWN_AUTHORITY', { serverAuthority: auth }));
      }
      if (j.deleted) {
        /* live delete は STEP3E スコープ外。触らずに STOP（KEEP DATA） */
        return cb(stop('SERVER_TOMBSTONE', {}));
      }
      if (!j.record || typeof j.record !== 'object') return cb(stop('PARSE', { detail: 'no record' }));
      if (!state.serverHash) return cb(stop('PARSE', { detail: 'no serverHash' }));

      localHashForSchema(function(lh, herr){
        if (!lh) {
          /* ★fix755d(実機 iPhone E2E で観測): schema2 + local body 不在 = 新端末 bootstrap。
             local に守るべき本文が無いので HASH 失敗で止めず、server canonical の
             hydrate(apply)へ進む。fix694 が authority を与えた document（= meta 登録済み）
             だけがここへ来る。schema1 と「body があるのに hash 失敗」は従来どおり STOP。 */
          var freshLocal755 = false;
          try { freshLocal755 = (state.schema === 2 && lsg(BODY_KEY) == null); } catch(e755d){}
          if (!freshLocal755) return cb(stop('HASH', { detail: herr }));
          state.freshLocal = true;
        }
        state.localHash = lh || null;

        /* ---- same-hash（新 contract）: 1バイトも書かない ---- */
        if (lh === state.serverHash) {
          stats.sameHash++;
          consumeApplied();
          state.verdict = 'CANONICAL_SAME_HASH';
          releaseHold('same-hash');
          return cb({ verdict: 'CANONICAL_SAME_HASH', serverRev: state.serverRev });
        }

        var srvTitle0 = (j.record && j.record.title != null) ? String(j.record.title) : '';
        /* ---- ★fix707: legacy empty-title row の判定（server.title === '' のときだけ試す）
           ★fix755: schema2 row は fix750 の新契約でのみ作られる（legacy 旧契約 row は存在しない）
                    ため schema1 のときだけ。schema2 は通常 diff 経路へ。 ---- */
        if (srvTitle0 === '' && state.schema !== 2) {
          return legacyEmptyTitleHash(function(lgh){
            state.legacyHashComputed = !!lgh;
            if (lgh && lgh === state.serverHash) {
              /* ★serverHash 一致を確認できた場合のみ legacy と認める */
              stats.legacySameHash++;
              state.legacy = true;
              consumeApplied();
              state.verdict = 'CANONICAL_LEGACY_TITLE_EMPTY';
              releaseHold('legacy-empty-title-same-hash');
              return cb({ verdict: 'CANONICAL_LEGACY_TITLE_EMPTY', serverRev: state.serverRev });
            }
            /* ★★fix707 FINAL SAFETY CUT
               legacy hash も不一致。この時点では
                 ・旧 contract（title を '' として commit した）row なのか
                 ・新 contract で local meta.name が本当に空の row なのか
               を server.title === '' だけからは判定できない。
               したがって **body を hydrate しない**（LEGACY_EMPTY_TITLE_DIFF_HYDRATION = REJECTED）。
               local title も '' のときだけ、新 contract の blank-title row として
               通常の diff 経路へ進む（title は一致しているので契約違反ではない）。 */
            var lt0 = localProjectionTitle();
            if (lt0 === null) return cb(stop('TITLE_CONTRACT_UNRESOLVED', { reason: 'NO_LOCAL_PROJECTION' }));
            if (lt0 !== '') {
              stats.legacyUnsupported++;
              return cb(stop('LEGACY_TITLE_DIFF_UNSUPPORTED', {
                reason: 'SERVER_EMPTY_TITLE_WITH_LOCAL_TITLE_AND_HASH_MISMATCH',
                serverTitleLen: 0, localTitleLen: lt0.length,
                note: 'body/aiInstr/meta write 0 / reload 0 / HOLD 継続（旧契約かを証明できない）'
              }));
            }
            return afterHash();
          });
        }
        return afterHash();

        function afterHash(){

        /* ---- 収束保護: 同じ serverHash で apply 済みなのにまだ一致しない ---- */
        var prev = readApplied();
        if (prev && String(prev.serverHash) === String(state.serverHash)) {
          consumeApplied();
          var diag = { serverTitleLen: (j.record.title == null ? 0 : String(j.record.title).length),
                       localTitleLen: (localProjectionTitle() == null ? -1 : localProjectionTitle().length),
                       legacyHashComputed: state.legacyHashComputed };
          return cb(stop('APPLY_NOT_CONVERGED', diag));      /* ★再 apply しない = reload ループ禁止 */
        }

        /* ---- dedicated apply ---- */
        /* ★fix745: call site で呼び分ける（1関数の runtime-dependent return type を作らない）。
           afterHash の戻り値は caller(classify) で使われないため、どちらの分岐でも影響しない。 */
        if (gwsRequired()){ doApplyGws(j, cb); return; }
        return doApplyInner(j, cb);
        }
      });
    });
  }

  /* local canonical projection の title（fix697 の projection をそのまま使う） */
  /* ★★fix707: LEGACY EMPTY-TITLE COMPATIBILITY（READ / HYDRATION 限定）
     旧 contract（title を常に '' として commit していた）で作られた server row を
     **server を書き換えずに** 読めるようにする。
     ・legacy 判定は server.title === '' だけでは行わない。**serverHash 一致を必須**とする。
     ・serializer は fix697 の canonicalString をそのまま使う（規約分岐を作らない）。
     ・putstory / promotestory では使用しない（この module は書込 op を持たない）。 */
  function sha256hex(str, cb){
    try {
      crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(str))).then(function(buf){
        var a = new Uint8Array(buf), h = '';
        for (var i = 0; i < a.length; i++){ var x = a[i].toString(16); h += (x.length < 2 ? '0' : '') + x; }
        cb(h);
      })['catch'](function(){ cb(null); });
    } catch(e){ cb(null); }
  }
  function legacyEmptyTitleHash(cb){
    var W = window.__v292Dfix697;
    if (!W || typeof W.projection !== 'function' || typeof W.canonicalString !== 'function') return cb(null, 'NO_FIX697');
    var pj = null;
    try { pj = W.projection(); } catch(e){ return cb(null, 'PROJECTION_THROW'); }
    if (!pj) return cb(null, 'NO_PROJECTION');
    var copy = {};
    for (var k in pj) if (Object.prototype.hasOwnProperty.call(pj, k)) copy[k] = pj[k];
    copy.title = '';                       /* ★title だけを '' に強制。他 field は触らない */
    var str = null;
    try { str = W.canonicalString(copy); } catch(e){ return cb(null, 'CANONICAL_THROW'); }
    sha256hex(str, function(h){ cb(h || null, h ? null : 'HASH_FAIL'); });
  }

  function localProjectionTitle(){
    try {
      var W = window.__v292Dfix697;
      if (!W || typeof W.projection !== 'function') return null;
      var pj = W.projection();
      if (!pj) return null;
      return (pj.title == null) ? '' : String(pj.title);
    } catch(e){ return null; }
  }

  /* ★fix755d: 新端末 bootstrap 用の title 正本（fix750 と同一契約:
     SERVER StoryRecord.title ↔ LOCAL chr6_slots_meta[].name。読取のみ）。 */
  function localMetaName755(){
    try {
      var m = JSON.parse(lsg('chr6_slots_meta') || '[]');
      if (Object.prototype.toString.call(m) !== '[object Array]') return null;
      for (var i755 = 0; i755 < m.length; i755++){ var e755 = m[i755];
        if (e755 && String(e755.id) === STORY_ID) return (e755.name == null) ? '' : String(e755.name); }
      return null;
    } catch(e){ return null; }
  }

  /* ★★fix719(STEP4E): HYDRATION CFG MERGE — server canonical body.cfg を local body.cfg 全体へ
     丸ごと上書きしない。server が権威を持つのは allowlist を通った story cfg だけで、
     local の provider runtime / secret-capable / UI-device cfg（=非 allowlist field）は保持する。
     merge 規約はこの1本のみ（fix705 特殊 merge を増やさない）。 */
  var HY_CFG_ALLOW = ['authorNote','bannedPhrases','creepyMode','dialogueLevel',
    'dramaLevel','engineMode','genrePresets','outLen','reactionLevel','toneKey'];
  function hydrateMergedCfg(localRaw, serverStoryCfg){
    var loc = (localRaw && typeof localRaw === 'object' && Object.prototype.toString.call(localRaw) !== '[object Array]') ? localRaw : null;
    var srv = (serverStoryCfg && typeof serverStoryCfg === 'object' && Object.prototype.toString.call(serverStoryCfg) !== '[object Array]') ? serverStoryCfg : null;
    if (!loc && !srv) return null;
    var out = {};
    var k;
    if (loc){ for (k in loc){ if (Object.prototype.hasOwnProperty.call(loc, k) && HY_CFG_ALLOW.indexOf(k) < 0) out[k] = loc[k]; } }
    if (srv){ for (k in srv){ if (Object.prototype.hasOwnProperty.call(srv, k) && HY_CFG_ALLOW.indexOf(k) >= 0) out[k] = srv[k]; } }
    /* ★server 側に無い allowlist field は server 権威に従い落とす（out には local 非 allowlist 分と srv 通過分だけが残る） */
    return out;
  }
  /* ★★fix745(GWS Phase B): doApply は **applyWindow 開始〜readback/収束判定〜reload 予約**までが
     1つの logical transaction。read-compare(dedupe) → native setItem → 再読取hash照合 が
     ひとつづきでなければ TOCTOU になるため、**transaction 全体**を shared lock で囲う。
       ・native setItem semantics は維持する（applyWrite 内の
         `__v292Dfix654._native('setItem')` は一切触らない。fix246 wrapper へは戻さない）。
       ・lock は setItem 単位ではなく doApply 単位。
       ・呼び出し元(afterHash)は既に network response 取得後の callback なので、
         lock 保持中に network を待たない。
       ・Class A(REPLAYABLE_REMOTE_APPLY) / BUSY = DROP_AND_REFETCH:
         **apply 0 / body write 0 / applied 記録 0 / reload 0** で STOP する。
         applied 記録を残さないので次 load で再取得・再適用できる。
       ・serialization 不要（C1 OFF・journal無し ＝ production の通常状態）は **完全素通し**。 */
  /* ★裁定(Phase B review §3): 1関数が sync/Promise を切り替える契約は REJECT。
       doApplyInner … 既存の callback 形式のまま（**常に同じ戻り値契約**・legacy 不変）
       doApplyGws   … **常に Promise**（結果は cb で受ける）
     呼び分けは同期の gwsRequired() で call site が行う。 */
  function gwsApi(){
    try {
      var G = window.__v292DfixGWS || null;
      if (G && typeof G.runExclusive === 'function' && typeof G.serializationRequired === 'function') return G;
    } catch(e){}
    return null;
  }
  function gwsRequired(){ var G = gwsApi(); return !!(G && G.serializationRequired()); }
  function doApplyGws(j, cb){
    var G = gwsApi();
    if (!G) return Promise.resolve(doApplyInner(j, cb));
    return G.runExclusive('A', function(){
      return new Promise(function(res){
        var settled = false;
        function once(out){ if (settled) return; settled = true; res(out); }
        try { doApplyInner(j, once); }
        catch(e){ once(stop('APPLY_THREW', { detail: String(e && e.message || e) })); }
      });
    }).then(function(x){
      if (x && x.ran) return cb(x.result);
      return cb(stop('GWS_BUSY_DROP_AND_REFETCH', {
        policy: (x && x.policy) || 'DROP_AND_REFETCH', reason: (x && x.reason) || 'BUSY',
        wrote: 0, applied: 0, reloaded: 0 }));
    }, function(e){
      return cb(stop('GWS_THREW', { detail: String(e && e.message || e), wrote: 0 }));
    });
  }
  function doApplyInner(j, cb){
    var rec = j.record;
    var body = rec && rec.body;
    if (!body || typeof body !== 'object') return cb(stop('PARSE', { detail: 'no record.body' }));

    /* ★★fix706: TITLE CONTRACT GATE（fail-closed）
       server title と local canonical projection title が一致しない場合、
       body も aiInstr も meta も書かず、reload もせず、HOLD を継続して STOP する。
       server title を name / title へ勝手に反映しない。 */
    var srvTitle = (rec.title == null) ? '' : String(rec.title);
    var locTitle = localProjectionTitle();
    /* ★fix755d: 新端末 bootstrap（schema2 + local body 不在）は projection が存在しないため、
       fix750 と同一の title 正本契約（meta[].name）で照合する。不一致は従来どおり fail-closed。 */
    if (locTitle === null && state.schema === 2 && state.freshLocal === true) locTitle = localMetaName755();
    state.serverTitle = srvTitle; state.localTitle = locTitle;
    if (locTitle === null) return cb(stop('TITLE_CONTRACT_UNRESOLVED', { reason: 'NO_LOCAL_PROJECTION' }));
    /* ★fix707 FINAL: title 不一致の例外は無い。legacy 特例で body を書く経路は存在しない。 */
    if (srvTitle !== locTitle) {
      stats.titleUnresolved++;
      return cb(stop('TITLE_CONTRACT_UNRESOLVED', {
        reason: 'SERVER_LOCAL_TITLE_MISMATCH',
        serverTitleLen: srvTitle.length, localTitleLen: locTitle.length,
        note: 'body/aiInstr/meta write 0 / reload 0 / HOLD 継続'
      }));
    }

    /* ★★fix755(裁定 BLOCKER#12): schema2 row は body だけでなく sidecar 13 keys も
       **exact** に hydrate する。書込計画は fix743.buildWritePlan（既存 C1-b の
       key/serialization mapping）をそのまま使う。新 mapping をここに作らない。
       newValue === null は remove（server 側 null を local へ exact 反映。残すと
       post-apply の V2 hash が収束せず APPLY_NOT_CONVERGED で止まるため）。 */
    if (state.schema === 2){
      var C755 = null;
      try { C755 = window.__v292DfixCC2 || null; } catch(e755){}
      if (!C755 || typeof C755.buildWritePlan !== 'function')
        return cb(stop('APPLY_PARTIAL', { fail: { stage: 'plan', reason: 'NO_FIX743_BUILDER' } }));
      /* validateServerRecord（既存 contract）で record を先に検証（書込 0 で判定） */
      if (typeof C755.validateServerRecord === 'function'){
        var verr755 = null;
        try { verr755 = C755.validateServerRecord(rec); } catch(e756){ verr755 = 'VALIDATOR_THREW'; }
        if (verr755) return cb(stop('APPLY_PARTIAL', { fail: { stage: 'validate', reason: verr755 } }));
      }
      var plan755 = null;
      try { plan755 = C755.buildWritePlan(STORY_ID, rec, { nativeGet: lsg }); }
      catch(e757){ return cb(stop('APPLY_PARTIAL', { fail: { stage: 'plan', reason: String(e757 && e757.message || e757) } })); }
      if (!plan755 || Object.prototype.toString.call(plan755) !== '[object Array]' || !plan755.length)
        return cb(stop('APPLY_PARTIAL', { fail: { stage: 'plan', reason: 'EMPTY_PLAN' } }));
      applyWindow = true;
      var wrote755 = 0, skipped755 = 0, fail755 = null;
      try {
        for (var pi = 0; pi < plan755.length; pi++){
          var it = plan755[pi];
          var cur755 = lsg(it.key);
          if (it.newValue === null){
            if (cur755 === null) { skipped755++; continue; }        /* 既に absent */
            var wr = applyRemove(it.key);
            if (!wr.ok){ fail755 = { stage: it.field, reason: wr.reason, detail: wr.detail || null }; break; }
            wrote755++;
          } else {
            if (cur755 === String(it.newValue)) { skipped755++; continue; }
            var ww = applyWrite(it.key, String(it.newValue));
            if (!ww.ok){ fail755 = { stage: it.field, reason: ww.reason, detail: ww.detail || null }; break; }
            wrote755++;
          }
        }
      } catch(e758){ fail755 = { stage: 'throw', reason: String(e758 && e758.message || e758) }; }
      applyWindow = false;
      if (fail755){
        stats.partial++;
        return cb(stop('APPLY_PARTIAL', { schema: 2, wrote: wrote755, skipped: skipped755, fail: fail755 }));
      }
      writeApplied({ storyId: STORY_ID, serverHash: state.serverHash, serverRev: state.serverRev });
      return localHashV2(function(lhV2, herrV2){
        if (!lhV2) return cb(stop('HASH', { detail: herrV2, stage: 'post-apply-v2' }));
        state.localHash = lhV2;
        if (lhV2 !== state.serverHash){
          return cb(stop('APPLY_NOT_CONVERGED', {
            stage: 'post-apply-v2', schema: 2,
            wrote: wrote755, skipped: skipped755
          }));                                        /* ★reload しない / 再 apply しない */
        }
        stats.applies++;
        state.verdict = 'CANONICAL_APPLIED'; state.phase = 'applied';
        note({ apply: 'ok', schema: 2, keys: stats.bypass.keys.slice(),
               wrote: wrote755, skipped: skipped755, serverRev: state.serverRev });
        stats.reloads++;
        try { setTimeout(function(){ try { location.reload(); } catch(e){} }, 300); } catch(e){}
        return cb({ verdict: 'CANONICAL_APPLIED', serverRev: state.serverRev, reload: true, schema: 2 });
      });
    }

    applyWindow = true;
    var wroteBody = false, wroteAi = false, fail = null;
    var skippedBody = false, skippedAi = false;
    try {
      var __locBody = null; try { __locBody = JSON.parse(lsg(BODY_KEY) || 'null'); } catch(e2){ __locBody = null; }
      var __locCfg = (__locBody && typeof __locBody === 'object') ? __locBody.cfg : null;
      var bodyStr = JSON.stringify({
        cfg:   hydrateMergedCfg(__locCfg, (body.cfg === undefined ? null : body.cfg)),
        cast:  (body.cast  === undefined ? null : body.cast),
        scene: (body.scene === undefined ? null : body.scene),
        turns: (Object.prototype.toString.call(body.turns) === '[object Array]') ? body.turns : [],
        mode:  (body.mode  === undefined ? null : body.mode)
      });
      /* ★条件 D の精神: 同じ内容なら書き直さない（field 単位でも無駄な write を出さない） */
      if (lsg(BODY_KEY) === bodyStr) { skippedBody = true; }
      else {
        var w1 = applyWrite(BODY_KEY, bodyStr);
        if (!w1.ok) fail = { stage: 'body', reason: w1.reason, detail: w1.detail || null };
        else wroteBody = true;
      }

      if (!fail) {
        var ai = rec.sidecar && rec.sidecar.aiInstr;
        if (ai != null && ai !== '') {
          if (lsg(AI_KEY) === String(ai)) { skippedAi = true; }
          else {
            var w2 = applyWrite(AI_KEY, String(ai));
            if (!w2.ok) fail = { stage: 'aiInstr', reason: w2.reason, detail: w2.detail || null };
            else wroteAi = true;
          }
        }
        /* ★sidecar.aiInstr が null のときは触らない（削除もしない） */
      }
    } catch(e){ fail = { stage: 'throw', reason: String(e && e.message || e) }; }
    applyWindow = false;

    if (fail) {
      stats.partial++;
      /* ★APPLY_PARTIAL: reload しない / HOLD 継続 / 自動 forceput なし / legacy apply なし */
      return cb(stop('APPLY_PARTIAL', { wroteBody: wroteBody, wroteAi: wroteAi, fail: fail }));
    }

    /* ★裁定: body + aiInstr + title を含む local canonical content を再計算し、
       serverHash と一致する状態で reload する。一致しなければ reload しない。 */
    /* ★applied 記録は「書込を実行した」時点で残す。
       収束しなかった場合でも記録が残るので、同一 session の次の boot は
       write 0 のまま APPLY_NOT_CONVERGED を返す（apply の反復を防ぐ）。 */
    writeApplied({ storyId: STORY_ID, serverHash: state.serverHash, serverRev: state.serverRev });
    localHash(function(lh2, herr2){
      if (!lh2) return cb(stop('HASH', { detail: herr2, stage: 'post-apply' }));
      state.localHash = lh2;
      if (lh2 !== state.serverHash) {
        return cb(stop('APPLY_NOT_CONVERGED', {
          stage: 'post-apply',
          serverTitleLen: srvTitle.length, localTitleLen: locTitle.length,
          wroteBody: wroteBody, wroteAi: wroteAi
        }));                                            /* ★reload しない / 再 apply しない */
      }
      stats.applies++;
      state.verdict = 'CANONICAL_APPLIED'; state.phase = 'applied';
      note({ apply: 'ok', keys: stats.bypass.keys.slice(),
             skippedBody: skippedBody, skippedAi: skippedAi, serverRev: state.serverRev });

      /* ★F2: 実行中 document は S を再読しないので reload が必須 */
      stats.reloads++;
      try { setTimeout(function(){ try { location.reload(); } catch(e){} }, 300); } catch(e){}
      return cb({ verdict: 'CANONICAL_APPLIED', serverRev: state.serverRev, reload: true });
    });
  }

  // =====================================================================
  // (8) boot: T0 で HOLD → fix694 と突合 → 分類を1回起動
  // =====================================================================
  if (on() && STORY_ID) {
    installHold();
  } else {
    state.phase = on() ? 'no-story-id' : 'off';
  }

  var bootN = 0;
  /* ★fix755e(実機 iPhone E2E で観測): __chronicleGoogleId() は fix328 の Worker probe
     (workerReady)完了まで同期的に '' を返すため、boot 直後に分類を始めると
     NOT_LOGGED_IN → stop('AUTH') で誤 STOP する（遅い回線で確実に発生。fix402 は
     起動が遅いので同じ load で「ログイン済み」に見え、非対称になる）。
     auth が読める状態になるまで分類開始を待つ。合言葉(v292ProxyPass)があれば即 ready。
     どちらも無いまま待機上限に達したら AUTH で fail-closed STOP（hold 維持・従来と同じ終端）。 */
  function authReady755(){
    try { if ((lsg('v292ProxyPass') || '').replace(/^\s+|\s+$/g,'')) return true; } catch(e){}
    try { if (typeof window.__chronicleGoogleId === 'function' && window.__chronicleGoogleId()) return true; } catch(e){}
    return false;
  }

  (function bootPoll(){
    /* ★fix721.2: restore journal PREPARED/APPLYING 中は分類を開始せず待機だけ続ける
       （getstory 0 / apply 0 / body write 0。bootN も消費しない）。 */
    try { if (restoreHold721()) { setTimeout(bootPoll, 250); return; } } catch(e){}
    bootN++;
    try {
      if (!on() || !STORY_ID || state.phase === 'stopped') return;

      /* fix694 authority との突合（食い違ったら HOLD 継続 + STOP） */
      var dk = window.__chronicleDocumentStoryKey;
      if (typeof dk === 'string' && dk) {
        if (dk !== BODY_KEY) {
          state.keyDivergence = { fix694: dk, fix705: BODY_KEY };
          stop('KEY_DIVERGENCE', state.keyDivergence);
          return;
        }
        /* 突合 OK。fix697（hash 提供元）が来たら分類を始める */
        /* ★fix755.2(実機 E2E で観測): fix743 は index の末尾近くで load されるため、
           fix697 だけ待って分類を始めると schema2 の localHashV2 が
           __v292DfixCC2 不在 → HASH_FAILED で誤 STOP する boot 競合がある。
           schema は server を読むまで分からないので、schema1/2 共通で fix743 も待つ。
           （fix743 は静的 script tag。万一 load しない場合は既存の bootN>120 で
             STOP('HASH') し write-hold は維持される = fail-closed のまま。） */
        if (!classifyStarted && authReady755() && window.__v292Dfix697 &&
            typeof window.__v292Dfix697.contentHash === 'function' &&
            typeof window.__v292Dfix697.getStoryV2Once === 'function' &&
            window.__v292DfixCC2 &&
            typeof window.__v292DfixCC2.buildSchema2Record === 'function' &&
            typeof window.__v292DfixCC2.buildWritePlan === 'function' &&
            typeof window.__v292DfixCC2.validateServerRecord === 'function' &&
            typeof window.__v292DfixCC2.keysFor === 'function') {
          classify(function(){});
          return;
        }
      }
      /* fix694 が出ない document（= story authority なし）は対象外 */
      if (bootN > 40 && typeof dk !== 'string') { releaseHold('no-fix694-authority'); return; }
      if (bootN > 120 && !classifyStarted) {
        if (!authReady755()) { stop('AUTH', { detail: 'AUTH_NOT_READY_TIMEOUT' }); return; }
        stop('HASH', { detail: 'fix697 not present' }); return;
      }
    } catch(e){}
    setTimeout(bootPoll, 250);
  })();

  // =====================================================================
  // 検証口（自 namespace のみ）
  // =====================================================================
  // =====================================================================
  // ★★fix723(STEP4H/RULING36): DOCUMENT AUTHORITY ACCESSOR（read-only contract）
  //   ・fix697 が write transport（putstory / putcanonical）を選ぶための **唯一の公開 evidence**。
  //   ・storage write 0 / network 追加 0 / LS authority cache 参照 0。
  //     すでに取得済みの fresh getstory 応答（state.serverRev/serverHash/verdict）だけを写す。
  //   ・現在 document の storyId と完全一致する fresh classification だけを返す。
  //   ・authority として返すのは 'canonical' / 'shadow' のみ。
  //   ・STOP / 分類失敗（NETWORK / AUTH / PARSE / HASH / SERVER_TOMBSTONE /
  //     AUTHORITY_CONFLICT / APPLY_PARTIAL / KEY_DIVERGENCE / …）は
  //     **authority を返さず unsafe:true** を立てる。
  //     呼び手は unsafe を default shadow へ fallback してはならない（FAILED CLASSIFICATION != SHADOW）。
  //   ・generic な内部 state を素通しで漏らさない（固定 field のみ・deep copy 不要な primitive のみ）。
  // =====================================================================
  function docAuthority(){
    if (!on() || !STORY_ID) return null;
    var out = { id: String(STORY_ID), present: false, authority: null,
                rev: null, hash: null, deleted: false, schema: null,
                phase: String(state.phase || ''), fresh: false, unsafe: false, build: BUILD };
    /* STOP は必ず phase='stopped' を立てる。error だけが立つ非 STOP（NO_STORAGE_TRAP 等）も
       分類の健全性を保証できないので unsafe 扱いにする。 */
    if (state.phase === 'stopped' || state.error){ out.unsafe = true; return out; }
    var v = state.verdict;
    if (v === 'NOT_FOUND'){
      /* server canonical row が確認されなかった状態。既存 shadow / new-story path へ進めてよい
         （RULING36 §NOT_FOUND）。delete 契約の 404 != CLOUD_FULLY_ABSENT とは無関係。 */
      out.present = false; out.fresh = true; return out;
    }
    if (v === 'SHADOW'){
      out.present = true; out.authority = 'shadow'; out.fresh = true;
      out.rev = (typeof state.serverRev === 'number') ? state.serverRev : null;
      out.hash = state.serverHash || null;
      return out;
    }
    if (v === 'CANONICAL_SAME_HASH' || v === 'CANONICAL_APPLIED' || v === 'CANONICAL_LEGACY_TITLE_EMPTY'){
      out.present = true; out.authority = 'canonical'; out.fresh = true;
      out.rev = (typeof state.serverRev === 'number') ? state.serverRev : null;
      out.hash = state.serverHash || null;
      /* ★fix755: fresh 分類が確定した row の schema（1/2）。fix697 の write 経路選択が使う。 */
      out.schema = (state.schema === 2) ? 2 : 1;
      return out;
    }
    /* 未分類（verdict null / 分類中）: fresh=false・unsafe=false。呼び手は下流の判定へ落としてよい。 */
    return out;
  }

  window.__v292Dfix705 = {
    __armed: true, on: on, off: off, docAuthority: docAuthority,
    status: function(){
      return { on: on(), off: off(), build: BUILD, loggedIn: isLoggedIn(),
               storyId: STORY_ID, bodyKey: BODY_KEY, aiKey: AI_KEY,
               allowList: allowList(), heldKeys: heldKeys(), metaHeld: false,
               state: JSON.parse(JSON.stringify(state)),
               stats: JSON.parse(JSON.stringify(stats)),
               applied: readApplied() };
    },
    stats: function(){ return JSON.parse(JSON.stringify(stats)); },
    classify: classify,
    release: function(why){ releaseHold(why || 'manual'); return true; },
    ledger: function(){ return LEDGER.slice(); }
  };
  try { console.log(TAG, 'loaded (canonical read authority / default ON / kill=v292Dfix705Off=1)'); } catch(e){}
})();
