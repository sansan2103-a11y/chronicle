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
  var BUILD = 'fix705+719merge+721gate+723auth';
  var TIMEOUT_MS = 25000;
  var APPLIED_KEY = 'v292Dfix705_applied';          /* ★sessionStorage（localStorage ではない） */

  // ---- localStorage 薄いアクセサ（読みのみ。書きは applyWrite だけ） ----
  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix705Off') === '1'; }
  /* ★★fix723(STEP4H/RULING36 §Q3): DEFAULT ON + EXPLICIT OFF。kill switch = v292Dfix705Off==='1'。
     On='0' 明示で従来 opt-in 相当へ戻せる（段階展開用の逃げ道）。 */
  function on(){ if (off()) return false; if (lsg('v292Dfix705On') === '0') return false; return true; }

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
    serverTitle: null, localTitle: null,
    legacy: false, legacyHashComputed: false
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
  function applyWrite(k, v){
    if (!applyWindow) return { ok: false, reason: 'NOT_IN_APPLY_WINDOW' };
    if (!isAllowed(k)) return { ok: false, reason: 'KEY_NOT_ALLOWED' };
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
    post({ op: 'getstory', id: STORY_ID }, function(e, r){
      if (e || !r) { stats.netFail++; return cb(stop('NETWORK', { detail: e ? String(e.message || e) : 'no response' })); }
      if (r.status === 404) {
        consumeApplied(); state.verdict = 'NOT_FOUND'; releaseHold('not-found'); return cb({ verdict: 'NOT_FOUND' });
      }
      if (r.status === 401 || r.status === 403) { stats.netFail++; return cb(stop('AUTH', { status: r.status })); }
      if (r.status !== 200 || !r.j || !r.j.ok) { stats.netFail++; return cb(stop('NETWORK', { status: r.status })); }

      var j = r.j;
      var auth = String(j.authority || 'shadow');
      state.serverRev = (typeof j.rev === 'number') ? j.rev : null;
      state.serverHash = j.serverHash || null;

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

      localHash(function(lh, herr){
        if (!lh) return cb(stop('HASH', { detail: herr }));
        state.localHash = lh;

        /* ---- same-hash（新 contract）: 1バイトも書かない ---- */
        if (lh === state.serverHash) {
          stats.sameHash++;
          consumeApplied();
          state.verdict = 'CANONICAL_SAME_HASH';
          releaseHold('same-hash');
          return cb({ verdict: 'CANONICAL_SAME_HASH', serverRev: state.serverRev });
        }

        var srvTitle0 = (j.record && j.record.title != null) ? String(j.record.title) : '';
        /* ---- ★fix707: legacy empty-title row の判定（server.title === '' のときだけ試す） ---- */
        if (srvTitle0 === '') {
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
        return doApply(j, cb);
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
  function doApply(j, cb){
    var rec = j.record;
    var body = rec && rec.body;
    if (!body || typeof body !== 'object') return cb(stop('PARSE', { detail: 'no record.body' }));

    /* ★★fix706: TITLE CONTRACT GATE（fail-closed）
       server title と local canonical projection title が一致しない場合、
       body も aiInstr も meta も書かず、reload もせず、HOLD を継続して STOP する。
       server title を name / title へ勝手に反映しない。 */
    var srvTitle = (rec.title == null) ? '' : String(rec.title);
    var locTitle = localProjectionTitle();
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
        if (!classifyStarted && window.__v292Dfix697 && typeof window.__v292Dfix697.contentHash === 'function') {
          classify(function(){});
          return;
        }
      }
      /* fix694 が出ない document（= story authority なし）は対象外 */
      if (bootN > 40 && typeof dk !== 'string') { releaseHold('no-fix694-authority'); return; }
      if (bootN > 120 && !classifyStarted) { stop('HASH', { detail: 'fix697 not present' }); return; }
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
                rev: null, hash: null, deleted: false,
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
  try { console.log(TAG, 'loaded (canonical read authority / default ON(fix723) / kill=v292Dfix705Off=1)'); } catch(e){}
})();
