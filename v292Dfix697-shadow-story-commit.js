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
// 検証口: window.__v292Dfix697 = { status, stats, ledger, flush, projection, contentHash, off,
//                                  journal, journalStats }  ★fix697p は read-only 口のみ追加
// ■fix697p Rev3(CANONICAL_LANDED_NOCONFIRM_FIX697P): 二段 journal（PREPARED_LOCAL → ARMED_CAS）＋
//   send projection single-source（hash 対象 = PUT body）＋ 200/serverHash 不一致を捨てず
//   bounded readback 1 回で content deep-equal なら sanctioned confirm（LANDED_CONTENT_EQUAL）＋
//   boot reconcile を content-first 化（CLEARED_STALE_LANDED）＋ hash 規約の READ-ONLY 診断。
// ■fix697p Rev2(PRODUCT_SAVE_STRANDING_FIX697): P2 = startLazyRefresh の getstory に
//   clientCanonicalSchemaMax:2 / P1 = canonicalCommit2 入口の PREPARED_LOCAL journal
//   （storyId / lastConfirmedRev / lastConfirmedHash / intendedCanonicalHash / 最小 binding）
//   ＋ reload 後 fresh GET reconcile（Case A CONVERGED / Case B strict CAS を 1 回だけ /
//   Case C HOLD・HOLD_CONFLICT は自動 resume 禁止）。
//   kill = v292Dfix697pOff='1'（本体 OFF でも停止・そのとき挙動は base と byte 同一）。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix697) return;
  var TAG = '[v292Dfix697:shadow-story-commit]';
  var DEBOUNCE_MS = 12000, MAXWAIT_MS = 45000, SIDE_POLL_MS = 20000, TIMEOUT_MS = 25000;
  var MARKER_KEY = 'v292Dfix402_storyRevs';   // ★collectLS 除外 prefix に同居（pkg baseline 不変）
  var BUILD = 'fix725+781';

  /* ■fix781(Phase 2.5A): UnsyncedGuard への最小フック。
     ここは「送信を開始した / ACK を受けた」という **既に存在する事実** を durable に写すだけ。
     ・fix697 の判定・送信・CAS・retry 方針は 1 バイトも変えない。
     ・guard 不在（home.html など fix781 を読まない document）では全部 no-op。
     ・kill: v292Dfix781Off='1'（guard 側で live 評価。ここは guard の API を呼ぶだけ）。 */
  function g781(){ try { return window.__v292Dfix781 || null; } catch(e){ return null; } }
  function g781InFlight(id, fp){ try { var G = g781(); if (G) G.noteInFlight(id, fp); } catch(e){} }
  function g781Refine(id, fp){   try { var G = g781(); if (G) G.refineInFlight(id, fp); } catch(e){} }
  function g781Clear(id){        try { var G = g781(); if (G) G.clearInFlight(id); } catch(e){} }
  function g781Confirm(id, rev, fp){ try { var G = g781(); if (G) G.confirm(id, rev, fp); } catch(e){} }
  /* ■fix781: response handler の **同期本体が終わってから** 後片付けする。
     先に clear すると g781Confirm が inFlightSave.generation と突き合わせられず
     CLEAN 判定（裁定の CLEAN 遷移条件）が成立しなくなるため microtask へ回す。 */
  function g781Settle(id){
    var run = function(){ try { g781Clear(id); } catch(e){} try { f781cDrain(); } catch(e){} };
    try {
      if (typeof Promise === 'function' && Promise.resolve){ Promise.resolve().then(run); return; }
    } catch(e){}
    try { setTimeout(run, 0); } catch(e){ run(); }
  }
  function f781bOff(){ return lsg('v292Dfix781bOff') === '1'; }
  function f781cOff(){ return lsg('v292Dfix781cOff') === '1'; }

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
  /* ★★fix755(裁定 BLOCKER#12 / OPTION_B_MINIMAL_RUNTIME_PATH):
     schema2 の **server-parity content**（Worker chrCanonicalStoryContentV2 と同一形）を
     client 側で 1 箇所だけ合成する。
       ・record 本体は fix743.buildSchema2Record（既存 schema2 builder）をそのまま使う。
         新しい 13-key mapping をここに作らない。
       ・derived field（id / turnCount / snippet）は Worker と同じ導出:
         turnCount = body.turns.length / snippet = snippetOf(body)（V1 と同一実装を共有）。
       ・serializer は既存 canonicalString（stableStringify）のみ。duplicate 実装 0。
     read-only（storage write 0 / 通信 0 / commit 0）。 */
  function projectionV2(id){
    var sid = (id == null) ? '' : String(id);
    if (!sid) return null;
    var C = null;
    try { C = window.__v292DfixCC2 || null; } catch(e){ return null; }
    if (!C || typeof C.buildSchema2Record !== 'function') return null;
    var built;
    try { built = C.buildSchema2Record({ nativeGet: lsg }, sid); }
    catch(e){ return null; }
    if (!built || built.hold || !built.record || built.record.schema !== 2) return null;
    var r = built.record;
    var turns = (r.body && Object.prototype.toString.call(r.body.turns) === '[object Array]') ? r.body.turns : [];
    return { schema: 2, id: sid,
             title: (r.title == null) ? '' : String(r.title),
             deleted: r.deleted === true,
             body: r.body, sidecar: r.sidecar,
             turnCount: turns.length, snippet: snippetOf(r.body) };
  }
  function contentHashV2(id, cb){
    var c = projectionV2(id);
    if (!c) return cb(null, 'NO_V2_PROJECTION');
    sha256hex(canonicalString(c), function(h){ cb(h || null, h ? null : 'HASH_FAILED'); });
  }
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
  /* ★★fix733(RULING83 §15-§16 / §40 / §55-§59 ・ RULING88 §5-§7 ・ RULING89) — DOCUMENT REV AUTHORITY
     ■旧実装の欠陥（型エラー）
       docBaseRev = +revMap()[id] || 0
       は **UNKNOWN（cache に entry が無い）と KNOWN_REV_0（server に row が無い）を同一視**していた。
       server row が実在するのに cache が無い document は baseRev 0 で putstory し、
       409 SHADOW_CONFLICT（advance 0 / retry 0）へ落ちて **永久に同期できない**。
     ■3 状態
       UNKNOWN … authority 未確定。**rev 0 として送らない**（write 0 / commit intent は保持）
       KNOWN_0 … authoritative NOT_FOUND を確認したときだけ（server 不在の新規 story）
       KNOWN_N … fresh authoritative read の rev、または自 document の成功 CAS 結果
       v292Dfix402_storyRevs は **hint / cache であって write authority ではない**（RULING83 §40）。
     ■AUTHORITY EPOCH（RULING89 §12-§15）
       fix705 の docAuthority() は **document あたり one-shot**。side-port 等で server rev が進んだ後に
       同じ snapshot を再採用すると STALE_ONE_SHOT_AUTHORITY_RECONSUMPTION になる。
       そこで epoch を持ち、**epoch 0 でだけ fix705 snapshot を bootstrap authority として採用**する。
       invalidate すると epoch++ され、以後その snapshot は二度と authority にならない。
       epoch>0 で write 需要が出たときだけ **lazy authoritative getstory** を 1 epoch 1 回だけ行う。
     ■fix705 の safety switch は迂回しない（RULING89 §9-§10）
       OFF（docAuthority() が null）/ unsafe / STOP は lazy GET でも回復させない。write 0 を維持する。 */
  /* ★fix733 */
  var REV_UNKNOWN = 'UNKNOWN', REV_KNOWN = 'KNOWN';
  var docRevState = REV_UNKNOWN;     // 'UNKNOWN' | 'KNOWN'
  var docBaseRev = null;             // KNOWN のときだけ数値。UNKNOWN では null（0 へ落とさない）
  var docRevSource = null;           // どの証拠で KNOWN / なぜ UNKNOWN か
  var docRevId = null;
  var docBaseRevInit = false;        // 互換: status().docRevInit
  /* ★fix733 */
  var authorityEpoch = 0;            // ★invalidate のたびに ++
  var refreshInFlightEpoch = -1;     // ★1 epoch につき最大 1 in-flight GET
  var initialLocalHash = null;       // document bind 時の local canonical hash（read-only capture）
  var initialLocalHashAt = null;
  /* ★fix733 */
  var lineageBaseHash = null;        // 「この local が base にしている server content」の証明済み hash
  var pendingIntent = false;         // ★AUTHORITY_PENDING の commit intent（poll budget 切れでも捨てない）
  /* ★fix733(RULING90) ROUTE COHERENCE
     rev だけでなく **authority 種別**も coherent でなければ送ってはいけない。
     TYPE A（authority / lifecycle を変える side-port）が current document へ attempt されたら
     以後この document では body write 0 にし、reload で fix705 に再分類させる。 */
  var authorityReloadRequired = false;
  var bootstrapAuthority = null;     // epoch0 で確定した authority class（'shadow' | 'canonical' | null=absent）
  var bootstrapPresent = null;       // epoch0 で server row が在ったか
  /* ★fix733 */
  var revStats = { knownFromAbsent: 0, knownFromPresent: 0, unknownBlocks: 0, divergenceBlocks: 0,
                   pendingRechecks: 0, invalidations: 0, lazyReads: 0, staleRefreshDiscarded: 0,
                   pendingUnresolved: 0 };

  /* ★fix733 */
  function setDocRevKnown(id, rev, source){
    docRevState = REV_KNOWN; docBaseRev = (+rev || 0); docRevId = String(id);
    docRevSource = source; docBaseRevInit = true; recheckTries = 0;
    /* cache は「次回 boot のための hint」として更新するだけ。write authority には使わない。 */
    try { var m = revMap(); m[String(id)] = docBaseRev; lss(MARKER_KEY, JSON.stringify(m)); } catch(e){}
  }
  /* ★fix733 */
  function setDocRevUnknown(reason){
    docRevState = REV_UNKNOWN; docBaseRev = null; docRevSource = reason || null;
  }
  /* side-port / 409 で server rev が進んだ（または base が古いと確定した）とき。
     **current document への操作のときだけ**無効化する。非 current story は current authority を変えない。
     無効化は必ず UNKNOWN へ落とすだけで、rev を進めることは決してしない（fail-closed）。 */
  /* ★fix733 */
  function invalidateDocRevAuthority(reason, id, typeA){
    var cur = storyId();
    if (!cur) return false;
    if (id != null && String(id) !== String(cur)) return false;
    if (typeA === true){
      /* ★★fix733(RULING90 §13): authority / lifecycle を変え得る side-port。
         rev を取り直しても route（shadow / canonical / deleted）が変わっている可能性があるので
         **lazy refresh で復活させない**。reload して fix705 に再分類させる。 */
      authorityReloadRequired = true;
      try { note({ kind: 'AUTHORITY_RELOAD_REQUIRED', id: cur, reason: String(reason || 'type-a') }); } catch(e){}
    }
    authorityEpoch++;                       /* ★stale snapshot の再消費を構造的に禁止 */
    setDocRevUnknown('INVALIDATED:' + (reason || 'side-port'));
    lineageBaseHash = null;
    revStats.invalidations++;
    try { note({ kind: 'DOC_REV_AUTHORITY_INVALIDATED', id: cur, reason: String(reason || 'side-port'),
                 epoch: authorityEpoch }); } catch(e){}
    return true;
  }
  /* 互換: boot 時の一括初期化は行わない（UNKNOWN のまま始める）。 */
  function initDocRev(){ return; }
  function advanceDocRev(id, rev){
    // ★この document 自身の 200 normal / 200 noop / SEED_EQUIVALENT からのみ呼ばれる
    setDocRevKnown(id, rev, 'COMMIT_OK');
  }

  /* ---- lineage gate（RULING83 §55-§59 / RULING89 §21・§23） ----
     CASE A  server absent                      → KNOWN_REV_0
     CASE B  server hash == 現在の local         → KNOWN_N（送るものが無い / seed 相当）
     CASE B' server hash == bind 時 local        → KNOWN_N（local は server current の子孫）
     CASE B'' server hash == 証明済み lineage    → KNOWN_N
     CASE C  上記いずれでもない                   → BOOTSTRAP_CONTENT_DIVERGENCE / write 0
     **fresh read 成功 ≠ 自動送信。必ずこのゲートを通す。** */
  /* ★fix733 */
  function adoptAuthority(id, present, deleted, rev, hash, localHash, source, authorityClass){
    if (authorityEpoch === 0){                     /* ★fix733: bootstrap の route を記録して以後の比較基準にする */
      bootstrapPresent = (present === true);
      bootstrapAuthority = (present === true) ? String(authorityClass || '') : null;
    }
    if (present === false){
      revStats.knownFromAbsent++;
      setDocRevKnown(id, 0, source + ':SERVER_ABSENT');
      try { note({ kind: 'DOC_REV_KNOWN_0_SERVER_ABSENT', id: id, source: source }); } catch(e){}
      return true;
    }
    if (deleted === true){ setDocRevUnknown('SERVER_DELETED'); return false; }
    if (typeof rev !== 'number'){ setDocRevUnknown('NO_SERVER_REV'); return false; }
    var sh = hash || null;
    if (!sh){ setDocRevUnknown('NO_SERVER_HASH'); return false; }
    if (sh === localHash || (initialLocalHash && sh === initialLocalHash)
                         || (lineageBaseHash && sh === lineageBaseHash)){
      revStats.knownFromPresent++;
      setDocRevKnown(id, rev, source + ':SERVER_PRESENT');
      if (!lineageBaseHash) lineageBaseHash = sh;
      try { note({ kind: 'DOC_REV_KNOWN_N', id: id, rev: rev, source: source }); } catch(e){}
      return true;
    }
    revStats.divergenceBlocks++;
    setDocRevUnknown('BOOTSTRAP_CONTENT_DIVERGENCE');
    try { note({ kind: 'BOOTSTRAP_CONTENT_DIVERGENCE', id: id, serverRev: rev, serverHash: sh,
                 localHash: localHash, initialLocalHash: initialLocalHash, source: source }); } catch(e){}
    return false;
  }

  /* fix705 の公開 contract のみを読む。内部 state は解釈しない。追加 network 0。 */
  /* ★fix733 */
  function fresh705(id){
    var F5 = null;
    try { F5 = window.__v292Dfix705; } catch(e){ F5 = null; }
    if (!F5 || typeof F5.docAuthority !== 'function') return { err: 'NO_FIX705_MODULE' };
    var a5 = null;
    try { a5 = F5.docAuthority(); } catch(e){ return { err: 'FIX705_THREW' }; }
    if (a5 === null) return { err: 'AUTHORITY_DISABLED' };        /* OFF / STORY_ID 無し */
    if (!a5 || String(a5.id) !== String(id)) return { err: 'AUTHORITY_ID_MISMATCH' };
    if (a5.unsafe === true) return { err: 'AUTHORITY_UNSAFE' };   /* STOP / 分類失敗は迂回しない */
    return { a5: a5 };
  }

  /* ---- post-bootstrap lazy authoritative refresh（RULING89 §7-§8・§11-§15・§19） ----
     ・fix705 を置き換えない。epoch 0 の bootstrap は必ず fix705 が担う。
     ・epoch>0（= 一度 safe な authority を得た後に invalidate された document）でだけ使う。
     ・1 epoch につき最大 1 in-flight。開始時の epoch を保持し、応答時に epoch が変わっていたら破棄。 */
  /* ★fix733 */
  function startLazyRefresh(id){
    if (refreshInFlightEpoch === authorityEpoch) return;      /* GET storm を作らない */
    refreshInFlightEpoch = authorityEpoch;
    var myEpoch = authorityEpoch;
    revStats.lazyReads++;
    try { note({ kind: 'LAZY_AUTHORITY_REFRESH_START', id: id, epoch: myEpoch }); } catch(e){}
    /* ★★fix697p(P2 / GPT 裁定 3C-2 §4・REVISE でも ADOPT 維持): この getstory は schema2
       canonical document に対しても走るのに capability を宣言していなかった。Worker v39/v40 の
       OLD CLIENT READ GATE は stored blob が schema2 のとき clientCanonicalSchemaMax >= 2 を
       宣言しない client へ 409 CLIENT_SCHEMA_TOO_OLD を返すため、下の :510 相当が
       LAZY_REFRESH_HTTP_409 になり **epoch>0 の lazy authority 復帰が schema2 では構造的に
       成功しない**（live 実測）。
       ・capability は caller から受け取らず内部で 2 固定（fix751 getStoryV2Once と同じ規約）。
       ・request 数 / retry / 応答検証は 1 つも変えない（増える field はこの 1 個だけ）。
       ・kill（v292Dfix697pOff='1' / 本体 OFF）のとき body は base と **byte 同一**。
       ・memoryV1 sidecar は read 側で strip しない（応答をそのまま検証するだけ）。 */
    var f697pLazyBody = { op: 'getstory', id: id };
    if (f697pEnabled()) f697pLazyBody.clientCanonicalSchemaMax = 2;
    postSaveOnce(f697pLazyBody, function(r, err){
      if (myEpoch !== authorityEpoch){                        /* ★stale response は破棄 */
        revStats.staleRefreshDiscarded++;
        try { note({ kind: 'LAZY_AUTHORITY_REFRESH_DISCARDED', id: id, epoch: myEpoch,
                     currentEpoch: authorityEpoch }); } catch(e){}
        return;
      }
      refreshInFlightEpoch = -1;
      if (err || !r){ setDocRevUnknown('LAZY_REFRESH_FAILED'); return; }
      /* ★★fix733(RULING90 §16-§18) — lazy GET response validation。
         fix705 を再実装はしない。Stage B の refresh に必要な最小条件だけを課す:
           response OK / expected story id / recognized authority / not deleted /
           numeric rev / full hash / TYPE R では bootstrap と同じ authority class。
         いずれか欠けたら fresh base 不成立 = write 0。deleted / tombstone は絶対に KNOWN_0 にしない。 */
      var j = r.j || {};
      if (r.status === 404){
        /* server row が消えている。bootstrap で present だった document を KNOWN_0 へ戻すのは
           story resurrection になるので禁止（RULING90 §16）。 */
        if (bootstrapPresent === false){
          try { adoptAuthority(id, false, false, null, null, null, 'LAZY_REFRESH', null); } catch(e){}
          setDocRevUnknown('LAZY_REFRESH_ABSENT_NEEDS_LOCAL_HASH');
        }
        authorityReloadRequired = true;
        setDocRevUnknown('LAZY_REFRESH_SERVER_GONE');
        try { note({ kind: 'AUTHORITY_RELOAD_REQUIRED', id: id, reason: 'lazy-refresh-404' }); } catch(e){}
        return;
      }
      if (r.status !== 200 || !j.ok){ setDocRevUnknown('LAZY_REFRESH_HTTP_' + r.status); return; }
      if (String(j.id != null ? j.id : id) !== String(id)){ setDocRevUnknown('LAZY_REFRESH_ID_MISMATCH'); return; }
      if (j.deleted === true){
        authorityReloadRequired = true;
        setDocRevUnknown('LAZY_REFRESH_TOMBSTONE');
        try { note({ kind: 'AUTHORITY_RELOAD_REQUIRED', id: id, reason: 'lazy-refresh-tombstone' }); } catch(e){}
        return;                                                  /* resurrection 禁止 */
      }
      if (typeof j.rev !== 'number'){ setDocRevUnknown('LAZY_REFRESH_NO_REV'); return; }
      if (!j.serverHash){ setDocRevUnknown('LAZY_REFRESH_NO_HASH'); return; }
      var freshAuth = String(j.authority || 'shadow');
      if (freshAuth !== 'shadow' && freshAuth !== 'canonical'){
        setDocRevUnknown('LAZY_REFRESH_UNKNOWN_AUTHORITY'); return;
      }
      if (bootstrapAuthority != null && freshAuth !== bootstrapAuthority){
        /* ★rev / hash が正しくても route が違えば送らない（RULING90 §15）。 */
        authorityReloadRequired = true;
        setDocRevUnknown('AUTHORITY_ROUTE_CHANGED');
        try { note({ kind: 'AUTHORITY_RELOAD_REQUIRED', id: id, reason: 'authority-route-changed',
                     bootstrap: bootstrapAuthority, fresh: freshAuth }); } catch(e){}
        return;
      }
      var c = null;
      try { c = projection(); } catch(e){ c = null; }
      if (!c){ setDocRevUnknown('LAZY_REFRESH_NO_PROJECTION'); return; }
      sha256hex(canonicalString(c), function(lh){
        if (myEpoch !== authorityEpoch){ revStats.staleRefreshDiscarded++; return; }
        if (!lh){ setDocRevUnknown('LAZY_REFRESH_HASH_FAILED'); return; }
        var okAdopt = adoptAuthority(id, true, false, j.rev, j.serverHash, lh, 'LAZY_REFRESH', freshAuth);
        /* refresh 成功後も pending intent があるときだけ commit を再評価する。 */
        if (okAdopt && pendingIntent){ try { commit('lazy-refresh'); } catch(e){} }
      });
    });
  }

  /* ★fix733 */
  function resolveDocRev(id, localHash){
    if (docRevState === REV_KNOWN && String(docRevId) === String(id)) return true;
    if (authorityReloadRequired){                 /* ★fix733(RULING90): reload するまで body write 0 */
      setDocRevUnknown('AUTHORITY_RELOAD_REQUIRED'); return false;
    }
    var f = fresh705(id);
    if (f.err){ setDocRevUnknown(f.err); return false; }       /* OFF / unsafe / 不在は迂回しない */
    var a5 = f.a5;
    if (a5.fresh !== true){ setDocRevUnknown('AUTHORITY_PENDING'); return false; }
    if (authorityEpoch === 0){                                  /* epoch0 = bootstrap */
      return adoptAuthority(id, a5.present, a5.deleted, a5.rev, a5.hash, localHash,
                            'FIX705_BOOTSTRAP', a5.authority);
    }
    /* ★epoch>0: fix705 の one-shot snapshot は既に stale。二度と authority にしない。 */
    startLazyRefresh(id);
    setDocRevUnknown('AWAITING_LAZY_REFRESH');
    return false;
  }

  /* ---- AUTHORITY_PENDING: commit intent を落とさない（RULING89 §22） ----
     network retry ではなく local authority の再評価。poll budget が尽きても intent は残し、
     新しい authority event（invalidate / refresh 完了）や次の markDirty で再 arm できるようにする。 */
  /* ★fix733 */
  var recheckTimer = null, recheckTries = 0;
  var RECHECK_MS = 3000, RECHECK_MAX = 20;
  /* ★fix733 */
  function scheduleAuthorityRecheck(){
    if (recheckTimer) return;
    if (recheckTries >= RECHECK_MAX){
      if (pendingIntent){
        revStats.pendingUnresolved++;
        try { note({ kind: 'PENDING_UNRESOLVED', id: storyId(), tries: recheckTries }); } catch(e){}
      }
      return;                                   /* intent は残したまま poll だけ止める */
    }
    try {
      recheckTimer = setTimeout(function(){
        recheckTimer = null; recheckTries++; revStats.pendingRechecks++;
        try { if (on()) commit('authority-pending-recheck'); } catch(e){}
      }, RECHECK_MS);
    } catch(e){}
  }

  /* ---- document bind 時の local canonical hash を read-only capture ----
     lineage gate の base。projection() が使えるようになった最初の周回で 1 回だけ。書込 0 / 通信 0。
     取得できなくても UNKNOWN 側へ倒れるだけで、誤って送信することはない。 */
  /* ★fix733 */
  var initHashTries = 0;
  /* ★fix733 */
  function captureInitialLocalHash(){
    if (initialLocalHash) return;
    initHashTries++;
    var c = null;
    try { c = projection(); } catch(e){ c = null; }
    if (!c){ if (initHashTries < 120){ try { setTimeout(captureInitialLocalHash, 250); } catch(e){} } return; }
    try {
      sha256hex(canonicalString(c), function(h){
        if (!h){ if (initHashTries < 120){ try { setTimeout(captureInitialLocalHash, 250); } catch(e){} } return; }
        initialLocalHash = h; initialLocalHashAt = Date.now();
      });
    } catch(e){}
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
    g781InFlight(id, intendedLocalHash);                    /* ■fix781: 送信開始を durable 化 */
    var fin = function(){ inFlight = false; g781Clear(id); f781cDrain(); };   /* ■fix781 / ■fix781c */
    var condClearDirty = function(then){
      /* 送信 snapshot 以降に local mutation が無い場合のみ dirty 解消（後発入力を落とさない） */
      currentHashOf(id, function(h2){
        if (h2 && h2 === intendedLocalHash){ lastSentHash = intendedLocalHash; }
        /* ■fix781: ACK 済み事実の durable 化。canonCtx は直前に必ず設定されているので
           「server に載った rev と hash」をそのまま lastConfirmed にする。
           CLEAN へ落とすかは guard 側が inFlightSave.generation と突き合わせて決める。 */
        try { if (canonCtx && canonCtx.id === id) g781Confirm(id, canonCtx.rev, canonCtx.hash); } catch(e781){}
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
  /* ═══════════════════════════════════════════════════════════════════
     ★★fix755(裁定 BLOCKER#12 / OPTION_B_MINIMAL_RUNTIME_PATH)
     canonicalCommit2 — **canonical schema2 row 専用**の通常 save 経路。
       ・canonical schema1 は従来の canonicalCommit のまま（byte 不変・経路も不変）。
       ・fresh read / post-write readback は V2-capable getstory
         （clientCanonicalSchemaMax:2。**この canonical-save 内部読取だけ**。
          汎用 shadowRequest へは capability を足さない）。
       ・outgoing record は既存 schema2 builder（fix743.buildSchema2Record 経由の
         projectionV2）。legacy V1 projection を schema2 row へ書かない。
       ・hash 比較も既存 schema2 content contract（projectionV2 + canonicalString）。
       ・write は既存 putCanonicalOnceImpl（whitelist / cap2 自動付与）。
       ・CAS / readback / hold の意味論は canonicalCommit と同一（strict CAS 1回 /
         force 禁止 / readback 最大 1 回 / conflict は canonHold）。
     dirty 追跡（lastSentHash）は従来どおり V1 projection hash で行う:
       V1 hash は body/turns/title の変化を検出でき、schema2 save の成功後に
       「送信 snapshot 以降 local 変化なし」を確認する用途には従来契約のまま使える。 */
  function canonicalCommit2(id, intendedLocalHash, why){
    inFlight = true; cstats.routedCanonical++;
    g781InFlight(id, intendedLocalHash);                    /* ■fix781: まず V1 hash で記録（v2hash は後で refine） */
    var fin = function(){ inFlight = false; g781Clear(id); f781cDrain(); };   /* ■fix781 / ■fix781c */
    var condClearDirty = function(then){
      currentHashOf(id, function(h2){
        if (h2 && h2 === intendedLocalHash){ lastSentHash = intendedLocalHash; }
        /* ■fix781: schema2 の canonCtx.hash は v2hash（= server の content_hash と同一 domain）。 */
        try { if (canonCtx && canonCtx.id === id) g781Confirm(id, canonCtx.rev, canonCtx.hash); } catch(e781){}
        then();
      });
    };
    /* ★★fix697p Rev2(P1 / GPT REVISE 2): **CAS へ到達し得ない分岐より前**に
       PREPARED_LOCAL journal を書く。ここは
         ・intendedCanonicalHash（いまの local の schema2 canonical hash）
         ・lastConfirmedRev / lastConfirmedHash（fix781 marker の証明済み server pre-state）
       の両方が揃えられる最初の地点であり、この後の fresh getstory 失敗 / 404 / drift /
       schema1 / preflight 変化 / CAS 直前の unload のどれで落ちても reload 後に reconcile できる。
       ★4 field が揃わなければ **書かない**（blind write 禁止）。kill 時は同期で素通し。 */
    f697pPrepare(id, function(){
    /* ---- fresh getstory exactly 1（V2-capable。この応答だけを CAS authority にする） ---- */
    postSaveOnce({ op: 'getstory', id: id, clientCanonicalSchemaMax: 2 }, function(g, gerr){
      if (gerr || !g){ cstats.netFail++; note({ kind: 'C2_GETSTORY_FAIL', id: id, why: why }); return fin(); }
      var j = g.j || {};
      if (g.status === 404){ cstats.rowMissing++; canonHold[id] = true;
        note({ kind: 'CANONICAL_ROW_MISSING', id: id }); return fin(); }
      if (g.status !== 200 || !j.ok){ cstats.netFail++; note({ kind: 'C2_GETSTORY_HTTP_' + g.status, id: id }); return fin(); }
      if (String(j.authority || 'shadow') !== 'canonical'){
        cstats.drift++; canonHold[id] = true;
        note({ kind: 'CANONICAL_AUTHORITY_DRIFT', id: id, serverAuthority: j.authority || 'shadow' }); return fin(); }
      if (j.deleted){ cstats.deletedStop++; canonHold[id] = true;
        note({ kind: 'CANONICAL_ALREADY_DELETED', id: id }); return fin(); }
      var srvSchema = (typeof j.recordSchema === 'number') ? j.recordSchema
                    : ((j.record && j.record.schema === 2) ? 2 : 1);
      if (srvSchema !== 2){
        /* ★V2 経路へ入ったのに server は schema1 へ戻っている＝分類が古い。write 0 で戻す。
           次の commit で docAuthority から再 route される（downgrade write は絶対にしない）。 */
        note({ kind: 'C2_SERVER_NOT_SCHEMA2', id: id, recordSchema: srvSchema }); return fin(); }
      var srvRev = (typeof j.rev === 'number') ? j.rev : 0;
      var srvHash = String(j.serverHash || '');
      f697pHashProbe(id, j, 'cas-preflight');            /* ★fix697p Rev3(P0-5): READ-ONLY 診断のみ */
      /* ★★fix697p Rev3(P0-1 / P0-2 SEND PROJECTION SINGLE-SOURCE)
         Rev2 の欠陥（T23 実測 CANONICAL_LANDED_NOCONFIRM の直接原因）:
           journal の intendedCanonicalHash は f697pPrepare 時点の projectionV2() から、
           実際に送る body の hash は **getstory 1 往復を挟んだ別の projectionV2()** から
           計算されており、その間の local 変化（V2-only sidecar / memoryV1）を
           V1 preflight が素通しするため hash と body が乖離し得た。
         Rev3 の契約:
           ・**この 1 箇所でだけ** send object を作る（canonicalSend）。
           ・serialization も 1 回だけ（canonicalSendStr）。hash はそれを sha したもの。
           ・PUT body（rec）は canonicalSend の部分参照だけで組む。
           ・ARMED_CAS を書いた後に projectionV2() を呼び直すことは **禁止**。
             （readback の deep-equal も canonicalSendStr と比較する） */
      var canonicalSend = projectionV2(id);
      if (!canonicalSend){ cstats.netFail++; note({ kind: 'C2_BUILD_FAILED', id: id }); return fin(); }
      var canonicalSendStr = null;
      try { canonicalSendStr = canonicalString(canonicalSend); } catch(eCS){ canonicalSendStr = null; }
      if (canonicalSendStr === null){ cstats.netFail++; note({ kind: 'C2_BUILD_FAILED', id: id, reason: 'SERIALIZE' }); return fin(); }
      sha256hex(canonicalSendStr, function(v2hash){
        if (!v2hash){ cstats.netFail++; note({ kind: 'C2_LOCAL_HASH_FAIL', id: id }); return fin(); }
        /* ■fix781: server と比較可能な指紋が確定したので inFlightSave.fingerprint だけを差し替える
           （generation / startedAt は保つ = lost ACK reconcile が schema2 でも成立する）。 */
        g781Refine(id, v2hash);
        /* ---- POST 前の local 再確認（従来どおり V1 hash で mutation 検出） ---- */
        currentHashOf(id, function(hNow){
          if (!hNow){ cstats.netFail++; note({ kind: 'C2_LOCAL_V1_HASH_FAIL', id: id }); return fin(); }
          if (hNow !== intendedLocalHash){
            cstats.localChanged++; note({ kind: 'LOCAL_CHANGED_DURING_PREFLIGHT', id: id }); return fin(); }
          if (srvHash && srvHash === v2hash){
            /* 既に収束済み → write 0 */
            cstats.convergedNoWrite++; canonCtx = { id: id, rev: srvRev, hash: srvHash };
            note({ kind: 'CANONICAL_CONVERGED_NO_WRITE', id: id, rev: srvRev, schema: 2 });
            f697pClear(id, 'CONVERGED_NO_WRITE');            /* ★fix697p: server 側が最新 = journal 完了 */
            return condClearDirty(fin);
          }
          /* ---- 異内容 → fresh 値で strict CAS 1回（force 禁止） ---- */
          /* ★★fix697p Rev3(P0-1): **PUT の直前**に ARMED_CAS を durable 化する。
             ここに載る outgoingV2Hash は上の canonicalSendStr（= これから送る body の
             serialization）そのものの sha であり、PUT body と定義上一致する。 */
          f697pArm(id, srvRev, srvHash, v2hash, canonicalSend, canonicalSendStr);
          /* ★★fix697p Rev3b(Q1): **deleted も同一 object から取る**。
             Rev2 / Rev3 は `deleted:false` 固定で、hash 対象（canonicalSend）と PUT body が
             1 field だけずれ得た（P0-2「同一 object / serialization」契約の穴）。
             これで rec は canonicalSend の **部分参照のみ**で構成され、field 単位で同一になる。 */
          var rec = { schema: 2, title: canonicalSend.title, deleted: canonicalSend.deleted === true,
                      body: canonicalSend.body, sidecar: canonicalSend.sidecar };
          var mid = 'pc2:' + id + ':' + srvRev + ':' + v2hash;    /* ★決定的（retry で新 mid を作らない） */
          cstats.sent++;
          putCanonicalOnceImpl({ id: id, expectedRev: srvRev, expectedHash: srvHash,
                                 record: rec, mid: mid,
                                 clientMeta: { device: (navigator.userAgent || '').slice(0, 60), build: BUILD } },
            function(r, err){
            var readbackConverge = function(kindOk, kindKeep){
              postSaveOnce({ op: 'getstory', id: id, clientCanonicalSchemaMax: 2 }, function(g2, ge2){
                if (ge2 || !g2 || g2.status !== 200 || !(g2.j && g2.j.ok)){
                  cstats.ambiguous++; note({ kind: 'CANONICAL_WRITE_AMBIGUOUS', id: id }); return fin(); }
                var j2 = g2.j;
                if (String(j2.serverHash || '') === v2hash){
                  canonCtx = { id: id, rev: (typeof j2.rev === 'number' ? j2.rev : null), hash: v2hash };
                  if (kindOk === 'CANONICAL_CONVERGED_AFTER_CONFLICT') cstats.convergedAfterConflict++;
                  else cstats.confirmedByReadback++;
                  note({ kind: kindOk, id: id, rev: j2.rev, schema: 2 });
                  f697pClear(id, kindOk);                    /* ★fix697p: readback で着地確認 = journal 完了 */
                  return condClearDirty(fin);
                }
                if (kindKeep === 'CANONICAL_WRITE_CONFLICT'){
                  cstats.conflicts++; canonHold[id] = true;
                  note({ kind: 'CANONICAL_WRITE_CONFLICT', id: id, serverRev: j2.rev,
                         serverHash: String(j2.serverHash || '').slice(0, 16) });
                  /* ★fix697p Rev2(GPT REVISE 3-(2)): journal を消さず HOLD_CONFLICT にする。
                     自動 resume は永久に禁止。fresh GET で CONVERGED になったときだけ clear。 */
                  f697pMarkConflict(id, j2.rev, String(j2.serverHash || ''));
                } else {
                  cstats.ambiguous++; note({ kind: kindKeep, id: id, serverRev: j2.rev });
                }
                return fin();
              });
            };
            if (err || !r){ /* network / 不明瞭 → readback 最大 1 回（V2-capable） */
              return readbackConverge('CANONICAL_COMMIT_CONFIRMED_BY_READBACK', 'CANONICAL_WRITE_UNSETTLED'); }
            var jj = r.j || {};
            if (r.status === 200 && jj.ok){
              var ackHash = String(jj.serverHash || '');
              if (ackHash !== v2hash){
                /* ★★fix697p Rev3(P0-3 本丸): 200 で着地しているのに serverHash が一致しない。
                   Rev2 はここで黙って fin() していたため「server は rev を進めたのに client は
                   confirm も journal clear もしない」= CANONICAL_LANDED_NOCONFIRM になった（T23 実測）。
                   Rev3 は journal を HOLD_PARITY にし、**bounded fresh readback 1 回**で
                   server の canonical content が送信 object と deep-equal かどうかだけを判定する。
                   serverHash 欠落（空文字）も同じ経路で扱う（!== v2hash が成立するため）。 */
                cstats.parityFail++;
                note({ kind: 'CANONICAL_PARITY_FAIL', id: id, schema: 2,
                       ackRev: (typeof jj.rev === 'number' ? jj.rev : null),
                       ackHash: ackHash.slice(0, 16), outgoing: String(v2hash).slice(0, 16),
                       ackHashMissing: !ackHash });
                f697pMarkParity(id, (typeof jj.rev === 'number' ? jj.rev : null), ackHash, v2hash);
                return f697pParityReadback(id, canonicalSend, canonicalSendStr, v2hash, fin, condClearDirty);
              }
              canonCtx = { id: id, rev: (typeof jj.rev === 'number' ? jj.rev : null), hash: v2hash };
              if (jj.noop) cstats.noop++; else cstats.ok++;
              note({ kind: 'CANONICAL_COMMIT_OK', id: id, rev: jj.rev, noop: !!jj.noop, why: why, schema: 2 });
              f697pClear(id, 'CANONICAL_COMMIT_OK');         /* ★fix697p: ACK 確定 = journal 完了 */
              return condClearDirty(fin);
            }
            if (r.status === 409){
              return readbackConverge('CANONICAL_CONVERGED_AFTER_CONFLICT', 'CANONICAL_WRITE_CONFLICT'); }
            cstats.netFail++; note({ kind: 'C2_HTTP_' + r.status, id: id, errorCode: jj.errorCode || null });
            return fin();
          });
        });
      });
    });
    });                                            /* ★fix697p Rev2: f697pPrepare の callback 終端 */
  }
  /* ★fix755: route が canonical のとき、fix705 の fresh 分類が schema2 なら V2 save 経路へ。
     docAuthority に schema が無い（旧分類 / schema1）は従来経路（変更 0）。 */
  function docAuthoritySchema2(id){
    try {
      var F5 = window.__v292Dfix705;
      if (!F5 || typeof F5.docAuthority !== 'function') return false;
      var a5 = F5.docAuthority();
      return !!(a5 && String(a5.id) === String(id) && a5.unsafe !== true &&
                a5.fresh === true && a5.present === true &&
                a5.authority === 'canonical' && a5.schema === 2);
    } catch(e){ return false; }
  }

  /* ═══════════════════════════════════════════════════════════════════
     ★★fix697p Rev2(P1) — PRODUCT_SAVE_STRANDING_FIX697
     PREPARED_LOCAL JOURNAL + RELOAD RECONCILE（GPT REVISE 裁定 2026-09-03）

     ■観測 defect（CC_FIX799_LIVE_ACCEPT_20260902.md §4）
       putcanonical（F733_SIDEPORT_TYPE_A・:1200-1207）は **attempt 時点**で authority を
       invalidate する（`authorityReloadRequired = true`）。以後この page session では
         ・:546-550 resolveDocRev が AUTHORITY_RELOAD_REQUIRED で body write 0
         ・pendingIntent（:366）は **in-memory** なので reload で消える
         ・reload 後は S.save が発火しないので markDirty も立たない
       ＝ **未同期 local が自動で push されない（stranded）**。実例: smrj0rvnuup turn22 / server rev9。

     ■Rev1 → Rev2 の変更（GPT REVISE §2 / §3）
       Rev1 は journal を **strict CAS の直前 1 点**でしか書かなかった。
       → 「CAS へ到達する前に return した commit」（getstory 失敗 / route hold /
          AUTHORITY_RELOAD_REQUIRED / preflight 失敗 / CAS 直前の unload）が
          journal 無しのまま stranded になる。**この設計は REJECT された。**
       Rev2 は **canonicalCommit2 の入口**（fresh getstory より前・= CAS へ到達し得ない
       分岐より前）で **PREPARED_LOCAL** journal を書く。書ける条件は
         (a) intendedCanonicalHash … いまの local の schema2 canonical hash が計算できる
         (b) lastConfirmedRev / lastConfirmedHash … fix781 marker の lastConfirmed
             （= **証明済みの server pre-state**）が読める
       の両方が揃ったときだけ。**揃わなければ書かない**（blind write 禁止）。

     ■journal（story scoped 単一キー journal・形は fix721/fix750/fix781 と同一）
       key = `v292Dfix402_f697p_<storyId>`
       ★prefix AUDIT（live bytes・Rev2 で実施）:
         ・live 全 module で `v292Dfix402_` を **prefix 列挙**しているのは
           `v292Dfix402-invisible-sync.js:276` の `collectLS()` **1 箇所だけ**で、
           意味は「cloud-sync package から除外する」＝ skip。delete / migrate / clear は 0。
         ・削除ループが列挙する prefix は `^chr6_slot_` / `^chr6_bk_cloudsync_del_` /
           `^chr6_bk_cloudsync_(\d+)$` のみ。`v292Dfix402_` を消す経路は live に存在しない。
         ・fix705(:80) / fix781(:42,:69) が同じ理由で同 prefix に marker を同居させている。
         ・逆に専用 prefix（例 `v292Dfix697p_<storyId>`）にすると collectLS の
           `k.indexOf(slotId) >= 0` に **一致して package へ収集され**、他端末へ複製される。
           per-device journal を cross-device 複製するのは新事故源なので **不可**。
         → 互換 alias として `v292Dfix402_f697p_` を採用する（GPT REVISE §3(5) の許容条件を満たす）。
       record（v:2。v:1 = Rev1 record は「無し」扱いで fail-closed）:
         { v:2, state:'PREPARED_LOCAL'|'HOLD_CONFLICT', storyId,
           lastConfirmedRev, lastConfirmedHash, intendedCanonicalHash,
           commitBinding{route,schema,generation,epoch,build},
           resumeCount, holdCount, lastVerdict, createdAt, updatedAt, build }

     ■reload 後 reconcile（fresh GET は clientCanonicalSchemaMax:2 の read op）
       Case A  serverHash == intendedCanonicalHash → CONVERGED → clear → **write 0**
       Case B  serverHash/rev == lastConfirmed pre-state
               **かつ 現在の local canonical hash == intendedCanonicalHash**
               → 未着地かつ local も動いていない → strict CAS を **1 回だけ** resume
       Case C  それ以外（server 前進 / local 前進 / 404 / tombstone / drift / schema1 /
               HOLD_CONFLICT）→ **auto write 禁止** → HOLD
       ★HOLD_CONFLICT（in-session の CANONICAL_WRITE_CONFLICT）は journal を消さず保持し、
         **自動 resume を永久に禁止**する。fresh GET で CONVERGED になったときだけ clear。
       ★boot 1 回だけ reconcile する。live index.html の
         `window.__chronicleDocumentStoryKey = K;` （コメントに「非永続・document scoped・immutable」）
         が示すとおり story 切替は必ず document reload なので、
         同一 document 内での activation 再 reconcile は不要（GPT REVISE §3(6) の条件を満たす）。

     ■resume の意味（★blind retry ではない）
       保存した payload を再送しない。**既存の commit() 経路**を 1 回だけ起動し、
       fresh GET → strict CAS で改めて評価し直す。
       ・`__v292Dfix781.transition()/confirm()` は **呼ばない**。fix781 へは read だけ。
       ・fix705 の safety switch（OFF / unsafe / not fresh / route≠canonical）は迂回しない。
       ・barrier（fix745/748/798）は fix793 と同一述語で読むだけ。
         **NOT_REQUIRED / RESOLVED を明示的に返したときだけ** resume。
         待機は非 blocking の bounded poll（2s×15）で、story 切替 / pagehide で cancel、
         timeout したら **HOLD のまま**（auto write 0・budget も消費しない）。
       ・budget は **撃つ前に durable 化**する（crash 中断でも 2 回目は撃たない）。
       ・cross-story: key が story scoped な上に record.storyId を照合し、不一致は無視。
     ■kill: v292Dfix697pOff='1' → P1/P2 とも完全停止（storage read/write 0・GET 0・resume 0・
       startLazyRefresh の body も base と byte 同一）。v292Dfix697Off='1'（本体 OFF）でも同じ。
     ═══════════════════════════════════════════════════════════════════ */
  var F697P_PRE = 'v292Dfix402_f697p_';    /* ★prefix AUDIT 済み（上記）。collectLS 除外枠に同居 */
  var F697P_VER = 3;                       /* ★Rev3。書込は v:3 */
  /* ★Rev3: v:2(Rev2) の record も **読み取りは受け入れる**。
     理由: live に残っている PREPARED_LOCAL（smrj0rvnuup / T23 no-confirm）を
     P0-4 の CLEARED_STALE_LANDED で救う必要があるため。v:1(Rev1) は従来どおり無視。 */
  var F697P_VER_ACCEPT = { 2: 1, 3: 1 };
  var F697P_PREPARED = 'PREPARED_LOCAL';   /* prepare 時 snapshot（CAS 未到達でも残す） */
  var F697P_ARMED    = 'ARMED_CAS';        /* ★Rev3: これから PUT する body の指紋を確定した状態 */
  var F697P_PARITY   = 'HOLD_PARITY';      /* ★Rev3: 200 だが serverHash 不一致（content 未判定/不一致） */
  var F697P_CONFLICT = 'HOLD_CONFLICT';
  var F697P_RESUME_MAX = 1;                /* ★「1 回だけ」= journal 1 件につき resume 1 回 */
  var F697P_HOLD_MAX = 3;                  /* Case C を無限に GET し続けない */
  var F697P_WAIT_MS = 2000, F697P_WAIT_TRIES = 15;   /* barrier / readiness の bounded 待機（最大 30s） */
  var F697P_BOOT_MS = 250, F697P_BOOT_TRIES = 120;   /* storyId / login の bounded 待機（最大 30s） */
  /* ★Rev3e(GPT 追補 2): boot 時 projectionV2()==null の **bounded** retry。
     大きな boot scheduler は作らない（この 1 箇所・GET 再送 0・write 0）。 */
  var F697P_PROJ_RETRY_MS = 500, F697P_PROJ_RETRY_MAX = 6;

  var f697pStats = { prepares: 0, prepareSkipped: 0, arms: 0, clears: 0, clearFails: 0, conflicts: 0,
                     reconciles: 0, convergedA: 0, resumedB: 0, holdC: 0, localMoved: 0,
                     crossStoryIgnored: 0, barrierBlocked: 0, waitCancelled: 0,
                     budgetExhausted: 0, getFails: 0, skipped: 0,
                     /* ★Rev3 */
                     parityMismatch: 0, parityReadbacks: 0, parityReadbackFailed: 0,
                     holdParity: 0, landedContentEqual: 0, clearedStaleLanded: 0,
                     hashProbes: 0, hashContractMismatch: 0,
                     /* ★Rev3c(OPTIONAL_SIDECAR_PARITY_SEMANTICS) */
                     compareSkipped: 0, contentDiffers: 0, optionalExcluded: 0, cappedRescues: 0,
                     /* ★Rev3e(RECOVERY_LANDED_BASE_BOOKKEEPING) */
                     landedBaseConfirmed: 0, landedBaseRejected: 0, projRetries: 0, projRetryTimeouts: 0 };
  var f697pLastHashProbe = null;           /* ★Rev3(P0-5): READ-ONLY 診断の直近結果 */
  var f697pProjRetryTimer = null;          /* ★Rev3e: projection bounded retry の timer（cancel 対象） */
  var f697pLast = null;                    /* 直近 verdict（read-only 可視化） */
  var f697pResumeFired = false;            /* この page session で resume を撃ったか（多重発火の構造的禁止） */
  var f697pReconciled = false;
  var f697pWaitTimer = null;               /* barrier / readiness の待機 timer（cancel 可能） */

  function f697pOff(){ return lsg('v292Dfix697pOff') === '1'; }
  function f697pEnabled(){ return on() && !f697pOff(); }

  /* journal の読み書きは fix781 と同じく fix654 の native accessor を優先する
     （自分の wrapper へ再入しない / fix402・fix490・fix543 の観測を汚さない）。 */
  function f697pNat(m){
    try { var F = window.__v292Dfix654;
          var f = (F && typeof F._native === 'function') ? F._native(m) : null;
          return (typeof f === 'function') ? f : null; } catch(e){ return null; }
  }
  function f697pGet(k){
    try { var f = f697pNat('getItem'); if (f) return f.call(localStorage, String(k)); } catch(e){}
    return lsg(k);
  }
  function f697pSet(k, v){
    try { var f = f697pNat('setItem'); if (f){ f.call(localStorage, String(k), String(v)); return true; } } catch(e){}
    return lss(k, v);
  }
  function f697pDel(k){
    try { var f = f697pNat('removeItem'); if (f){ f.call(localStorage, String(k)); return true; } } catch(e){}
    try { localStorage.removeItem(String(k)); return true; } catch(e){ return false; }
  }
  function f697pKey(id){ return F697P_PRE + String(id); }

  /* fix781 marker を **読むだけ**（書込 0 / 遷移 0）。
     lastConfirmed = 「server 側に載ったことを ACK で確認済みの rev / content hash」
     ＝ blind ではない pre-state。これが無ければ journal を書かない。 */
  function f697pLastConfirmed(id){
    try {
      var G = g781();
      if (!G || typeof G.marker !== 'function') return null;
      var m = G.marker(id);
      if (!m || !m.lastConfirmed) return null;
      var r = m.lastConfirmed.serverRev, h = m.lastConfirmed.fingerprint;
      if (typeof r !== 'number' || typeof h !== 'string' || !h) return null;
      return { rev: r, hash: h, generation: (+m.localGeneration) || 0 };
    } catch(e){ return null; }
  }

  function f697pRead(id){
    if (!f697pEnabled() || !id) return null;      /* ★OFF / kill では storage を 1 バイトも読まない */
    try {
      var raw = f697pGet(f697pKey(id));
      if (raw == null) return null;
      var r = JSON.parse(raw);
      if (!r || typeof r !== 'object' || Object.prototype.toString.call(r) === '[object Array]') return null;
      if (!F697P_VER_ACCEPT[r.v]) return null;                  /* v:1(Rev1) / 未知 version は「無し」扱い */
      if (r.cleared === true) return null;                      /* tombstone */
      if (r.state !== F697P_PREPARED && r.state !== F697P_ARMED &&
          r.state !== F697P_PARITY && r.state !== F697P_CONFLICT) return null;
      if (String(r.storyId || '') !== String(id)){              /* ★cross-story replay の構造的禁止 */
        f697pStats.crossStoryIgnored++;
        try { note({ kind: 'F697P_CROSS_STORY_IGNORED', id: String(id),
                     recordStoryId: String(r.storyId || '') }); } catch(e){}
        return null;
      }
      if (typeof r.intendedCanonicalHash !== 'string' || !r.intendedCanonicalHash) return null;
      if (typeof r.lastConfirmedRev !== 'number') return null;
      if (typeof r.lastConfirmedHash !== 'string' || !r.lastConfirmedHash) return null;
      return r;
    } catch(e){ return null; }
  }

  function f697pSave(id, rec){
    try { rec.updatedAt = Date.now(); return f697pSet(f697pKey(id), JSON.stringify(rec)); }
    catch(e){ return false; }
  }

  /* ★★Rev2: PREPARED_LOCAL を canonicalCommit2 の入口で書く。
     4 field（storyId / lastConfirmedRev / lastConfirmedHash / intendedCanonicalHash）が
     揃わなければ **書かない**。next() は必ず 1 回だけ呼ぶ（save 経路を止めない）。 */
  function f697pPrepare(id, next){
    var done = false;
    var go = function(){ if (done) return; done = true; try { next(); } catch(e){} };
    if (!f697pEnabled()){ go(); return; }          /* ★kill: 同期で素通し = base と byte 同一 */
    var lc = null, c2 = null;
    try { lc = f697pLastConfirmed(id); } catch(e){ lc = null; }
    if (!lc){
      f697pStats.prepareSkipped++;
      try { note({ kind: 'F697P_PREPARE_SKIPPED', id: String(id), reason: 'NO_LAST_CONFIRMED' }); } catch(e){}
      go(); return;                                 /* ★blind write 禁止 */
    }
    try { c2 = projectionV2(id); } catch(e){ c2 = null; }
    if (!c2){
      f697pStats.prepareSkipped++;
      try { note({ kind: 'F697P_PREPARE_SKIPPED', id: String(id), reason: 'NO_V2_PROJECTION' }); } catch(e){}
      go(); return;
    }
    try {
      sha256hex(canonicalString(c2), function(h){
        if (!h){
          f697pStats.prepareSkipped++;
          try { note({ kind: 'F697P_PREPARE_SKIPPED', id: String(id), reason: 'HASH_FAILED' }); } catch(e){}
          go(); return;
        }
        f697pWritePrepared(id, lc, h);
        go();
      });
    } catch(e){ f697pStats.prepareSkipped++; go(); }
  }

  function f697pWritePrepared(id, lc, intendedHash){
    if (!f697pEnabled() || !id) return false;
    try {
      var prev = f697pRead(id);
      /* HOLD_CONFLICT は上書きしない（自動 resume 禁止の状態を保持する）。
         ★★Rev3b(Q2): **HOLD_PARITY も同じく粘着**させる。GPT R2「journal 保持」の趣旨は
         「次の commit の PREPARED_LOCAL で証跡を消さない」ことまで含む。出口は
         CONVERGED_NO_WRITE / COMMIT_OK / readback 収束 / CLEARED_STALE_LANDED の f697pClear だけ。
         （自動 resume 禁止は f697pReconcile 側で維持。save 自体は従来どおり止めない） */
      if (prev && (prev.state === F697P_CONFLICT || prev.state === F697P_PARITY)){
        try { note({ kind: 'F697P_PREPARE_SKIPPED', id: String(id),
                     reason: (prev.state === F697P_PARITY) ? 'HOLD_PARITY_KEPT' : 'HOLD_CONFLICT_KEPT' }); } catch(e){}
        return false;
      }
      var same = !!(prev && prev.intendedCanonicalHash === String(intendedHash)
                         && prev.lastConfirmedRev === lc.rev
                         && prev.lastConfirmedHash === String(lc.hash));
      /* ★Rev3d: `lastConfirmedHash` は **client fingerprint（contentHashV2 domain）**。
         serverHash との比較には二度と使わない（Case B は rev と client hash で判定する）。 */
      var rec = { v: F697P_VER, state: F697P_PREPARED, storyId: String(id),
                  lastConfirmedRev: lc.rev, lastConfirmedHash: String(lc.hash),
                  intendedCanonicalHash: String(intendedHash),
                  commitBinding: { route: 'canonicalCommit2', schema: 2,
                                   generation: lc.generation, epoch: authorityEpoch, build: BUILD },
                  resumeCount: same ? ((+prev.resumeCount) || 0) : 0,   /* ★別 intent なら budget を作り直す */
                  holdCount: same ? ((+prev.holdCount) || 0) : 0,
                  lastVerdict: same ? (prev.lastVerdict || null) : null,
                  createdAt: same ? (prev.createdAt || Date.now()) : Date.now(),
                  updatedAt: Date.now(), build: BUILD };
      var okw = f697pSave(id, rec);
      if (okw) f697pStats.prepares++;
      try { note({ kind: 'F697P_PREPARED_LOCAL', id: String(id), lastConfirmedRev: lc.rev,
                   lastConfirmedHash: String(lc.hash).slice(0, 16),
                   intended: String(intendedHash).slice(0, 16), ok: !!okw }); } catch(e){}
      return okw;
    } catch(e){ return false; }
  }

  /* ★in-session の CANONICAL_WRITE_CONFLICT: journal を消さず HOLD_CONFLICT にする。
     以後この journal からの **自動 resume は永久に禁止**（Case A の clear だけが出口）。 */
  function f697pMarkConflict(id, serverRev, serverHash){
    if (!f697pEnabled() || !id) return false;
    try {
      var rec = f697pRead(id);
      if (!rec) return false;
      rec.state = F697P_CONFLICT;
      rec.lastVerdict = 'IN_SESSION_CONFLICT';
      rec.conflictServerRev = (typeof serverRev === 'number') ? serverRev : null;
      rec.conflictServerHash = serverHash ? String(serverHash).slice(0, 64) : null;
      f697pStats.conflicts++;
      try { note({ kind: 'F697P_HOLD_CONFLICT', id: String(id), serverRev: rec.conflictServerRev }); } catch(e){}
      return f697pSave(id, rec);
    } catch(e){ return false; }
  }

  /* ★★fix697p Rev3(P0-1): ARMED_CAS — 「いま実際に PUT する body」の指紋を durable 化する。
     outgoingV2Hash は PUT body と同一 serialization（canonicalSendStr）の sha であることが契約。
     outgoingFingerprint は content の構造指紋（診断用・deep-equal の代替ではない）。 */
  function f697pArm(id, preRev, preHash, outHash, sendObj, sendStr){
    if (!f697pEnabled() || !id) return false;
    try {
      var rec = f697pRead(id);
      /* ★★Rev3b(Q2): HOLD_CONFLICT / HOLD_PARITY は ARM でも上書きしない（証跡の粘着）。
         この journal は「server に載ったか未判定」の状態なので、次の CAS が成功して
         f697pClear が走るまで保持する。 */
      if (rec && (rec.state === F697P_CONFLICT || rec.state === F697P_PARITY)){
        try { note({ kind: 'F697P_ARM_SKIPPED', id: String(id), reason: rec.state + '_KEPT' }); } catch(e){}
        return false;
      }
      if (!rec){
        /* prepare が skip された（lastConfirmed 無し）場合は ARMED も書かない = blind write 禁止 */
        f697pStats.prepareSkipped++;
        try { note({ kind: 'F697P_ARM_SKIPPED', id: String(id), reason: 'NO_PREPARED_JOURNAL' }); } catch(e){}
        return false;
      }
      var turns = null;
      try { turns = (sendObj && sendObj.body && Object.prototype.toString.call(sendObj.body.turns) === '[object Array]')
                    ? sendObj.body.turns.length : null; } catch(e){ turns = null; }
      var skeys = [];
      try { var sc = sendObj && sendObj.sidecar;
            if (sc && typeof sc === 'object'){ for (var kk in sc){
              if (Object.prototype.hasOwnProperty.call(sc, kk) && sc[kk] != null) skeys.push(kk); } }
            skeys.sort(); } catch(e){ skeys = []; }
      /* ★★Rev3f(GPT REVISE 1): **actual outgoing payload に own-property として存在した optional key を
         値に関わらず全部**記録する（object / string / **null** のいずれでも「送った」）。
         `sentOptionalNullKeys` は そのうち **明示 null（= clear を送った）** 部分集合。
         Worker は null=clear なので「送った null」は server 側で **key ごと消える**。
         その 2 つが揃って初めて LANDED_BASE の正規化が送信 domain を正確に復元できる。
         ★optional 契約が読めないときは **null**（空配列ではない）を記録し、LANDED_BASE を fail-closed にする。 */
      var sentOpt = null, sentOptNull = null;
      try {
        var OPTa = f697pOptionalNames();
        var sc2 = sendObj && sendObj.sidecar;
        if (OPTa && sc2 && typeof sc2 === 'object'){
          sentOpt = []; sentOptNull = [];
          for (var oi = 0; oi < OPTa.length; oi++){
            var ok2 = OPTa[oi];
            if (!Object.prototype.hasOwnProperty.call(sc2, ok2)) continue;
            sentOpt.push(ok2);
            if (sc2[ok2] === null) sentOptNull.push(ok2);
          }
          sentOpt.sort(); sentOptNull.sort();
        }
      } catch(e){ sentOpt = null; sentOptNull = null; }
      rec.state = F697P_ARMED;
      rec.preServerRev = (typeof preRev === 'number') ? preRev : null;
      rec.preServerHash = String(preHash || '');
      rec.outgoingV2Hash = String(outHash);
      rec.outgoingFingerprint = { len: (sendStr == null ? null : String(sendStr).length),
                                  turnCount: turns, sidecarKeys: skeys,
                                  /* ★Rev3f: LANDED_BASE の正規化はこの 2 つだけを使う */
                                  sentOptionalKeys: sentOpt, sentOptionalNullKeys: sentOptNull,
                                  title: (sendObj && sendObj.title != null) ? String(sendObj.title).slice(0, 40) : null };
      rec.armedAt = Date.now();
      rec.lastVerdict = null;
      f697pStats.arms++;
      try { note({ kind: 'F697P_ARMED_CAS', id: String(id), preServerRev: rec.preServerRev,
                   preServerHash: rec.preServerHash.slice(0, 16),
                   outgoing: rec.outgoingV2Hash.slice(0, 16),
                   sentOptionalKeys: sentOpt, sentOptionalNullKeys: sentOptNull,
                   len: rec.outgoingFingerprint.len, turnCount: turns }); } catch(e){}
      return f697pSave(id, rec);
    } catch(e){ return false; }
  }

  /* ★★fix697p Rev3b(Q3): **sanctioned confirm が実際に成立した時点でだけ** ledger へ
     CANONICAL_COMMIT_OK{via} を積む。fix758 は既存の監視 kind（CANONICAL_COMMIT_OK）で消灯するので
     **fix758 側の変更は不要**。成立判定は fix781 marker の lastConfirmed が
     server 実 rev / 実 hash に前進したことの再読み取りで行う（捏造禁止・fail-closed）。 */
  function f697pNoteCommitOk(id, rev, hash, via){
    try {
      var want = (typeof rev === 'number') ? rev : null;
      if (want === null) return false;
      var lc = f697pLastConfirmed(id);
      if (!lc || lc.rev !== want || String(lc.hash) !== String(hash)) return false;
      note({ kind: 'CANONICAL_COMMIT_OK', id: String(id), rev: want, noop: false, schema: 2,
             via: String(via || ''), confirmed: true });
      return true;
    } catch(e){ return false; }
  }

  /* ★★fix697p Rev3(P0-3): 200 ＋ serverHash 不一致 → HOLD_PARITY（まだ判定していない状態）。 */
  function f697pMarkParity(id, ackRev, ackHash, outHash){
    if (!f697pEnabled() || !id) return false;
    try {
      var rec = f697pRead(id);
      if (!rec) return false;
      if (rec.state === F697P_CONFLICT) return false;
      rec.state = F697P_PARITY;
      rec.lastVerdict = 'PARITY_MISMATCH';
      rec.ackServerRev = (typeof ackRev === 'number') ? ackRev : null;
      rec.ackServerHash = ackHash ? String(ackHash).slice(0, 64) : null;
      rec.outgoingV2Hash = String(outHash);
      f697pStats.parityMismatch++;
      return f697pSave(id, rec);
    } catch(e){ return false; }
  }

  /* server の canonical record を **projectionV2 と同一の wrap** に組み直す。
     ここで client の serializer を使うのは「hash 規約」ではなく「content 同一性」を見るため。 */
  function f697pServerWrap(id, j){
    try {
      var r = j && j.record;
      if (!r || typeof r !== 'object' || r.schema !== 2) return null;
      var turns = (r.body && Object.prototype.toString.call(r.body.turns) === '[object Array]') ? r.body.turns : [];
      return { schema: 2, id: String(id),
               title: (r.title == null) ? '' : String(r.title),
               deleted: r.deleted === true,
               body: r.body, sidecar: r.sidecar,
               turnCount: turns.length, snippet: snippetOf(r.body) };
    } catch(e){ return null; }
  }

  /* ★★fix697p Rev3c(OPTIONAL_SIDECAR_PARITY_SEMANTICS / P0-6): **pure comparator 1 本**。
     R1（P0-3 parity readback）と boot（P0-4）が **これだけ**を使う。

     契約（GPT 裁定 2026-09-03 §1）:
       ・必須 domain は **常に**比較する（1 つも除外しない）。
       ・optional field は **client が今回の outgoing payload に property を持っていた field だけ**比較する。
         Worker が omit=preserve 契約を持つ optional field を client が送らなかった場合、
         server に存在していても parity 差分にしない（= server-only optional を除外）。
       ・**explicit null 送信は比較対象**（property が存在する = 送った）。
       ・**unknown / non-optional の server-only は不一致**（除外しない）。
       ・PUT payload（canonicalSend / rec）は **1 バイトも変更しない**。server wrap も変更しない
         （shallow copy のみ）。comparator は state を持たない pure 関数。

     optional 名の単一ソース = fix743 の `S2_OPTIONAL_NAMES`（fix697 のソースに optional field 名の
     literal を 1 つも書かない）。取得できない = ownership 判定不能 → **fail-closed で ok:false**。 */
  function f697pOptionalNames(){
    try {
      var C = window.__v292DfixCC2;
      if (!C) return null;
      var a = C.S2_OPTIONAL_NAMES;
      if (Object.prototype.toString.call(a) !== '[object Array]') return null;
      var out = [];
      for (var i = 0; i < a.length; i++){ if (typeof a[i] === 'string' && a[i]) out.push(a[i]); }
      return out;
    } catch(e){ return null; }
  }
  function f697pHasOwn(o, k){
    try { return !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k); }
    catch(e){ return false; }
  }
  /* sendWrap = client が送った（または今作れる）projectionV2 形 / serverWrap = f697pServerWrap の戻り。
     戻り: { ok, reason?, equal, excluded:[key], diffKeys:[key] } — 値は一切載せない。 */
  function f697pContentEqual(sendWrap, serverWrap){
    if (!sendWrap || !serverWrap) return { ok: false, reason: 'NO_WRAP', equal: false, excluded: [], diffKeys: [] };
    var OPT = f697pOptionalNames();
    if (!OPT) return { ok: false, reason: 'NO_OPTIONAL_CONTRACT', equal: false, excluded: [], diffKeys: [] };
    var ss = serverWrap.sidecar, ls = sendWrap.sidecar;
    var excluded = [];
    try {
      for (var i = 0; i < OPT.length; i++){
        var k = OPT[i];
        /* 3 条件積: optional domain ∩ server が持つ ∩ **client が送っていない**。
           client が送っていれば（値が null でも）除外しない。 */
        if (f697pHasOwn(ss, k) && !f697pHasOwn(ls, k)) excluded.push(k);
      }
    } catch(e){ return { ok: false, reason: 'OWNERSHIP_THREW', equal: false, excluded: [], diffKeys: [] }; }
    var s2 = null, sStr = null, lStr = null;
    try {
      s2 = {}; for (var a1 in serverWrap){ if (Object.prototype.hasOwnProperty.call(serverWrap, a1)) s2[a1] = serverWrap[a1]; }
      if (excluded.length){
        var sc = {};
        for (var a2 in ss){ if (Object.prototype.hasOwnProperty.call(ss, a2)) sc[a2] = ss[a2]; }
        for (var a3 = 0; a3 < excluded.length; a3++) delete sc[excluded[a3]];
        s2.sidecar = sc;                       /* ★元 serverWrap.sidecar は触らない */
      }
      sStr = canonicalString(s2);
      lStr = canonicalString(sendWrap);
    } catch(e){ return { ok: false, reason: 'SERIALIZE_FAILED', equal: false, excluded: excluded, diffKeys: [] }; }
    if (sStr === lStr) return { ok: true, equal: true, excluded: excluded, diffKeys: [], localStr: lStr };
    /* 不一致: **キー名だけ**を出す（値は載せない） */
    var diffKeys = [];
    try {
      var top = { schema: 1, id: 1, title: 1, deleted: 1, turnCount: 1, snippet: 1 };
      for (var t in top){ if (JSON.stringify(s2[t]) !== JSON.stringify(sendWrap[t])) diffKeys.push(t); }
      var bk = { cfg: 1, cast: 1, scene: 1, turns: 1, mode: 1 };
      var sb = s2.body || {}, lb = sendWrap.body || {};
      for (var b1 in bk){ if (JSON.stringify(sb[b1]) !== JSON.stringify(lb[b1])) diffKeys.push('body.' + b1); }
      var seen = {}, kk;
      var scS = s2.sidecar || {}, scL = ls || {};
      for (kk in scS){ if (Object.prototype.hasOwnProperty.call(scS, kk)) seen[kk] = 1; }
      for (kk in scL){ if (Object.prototype.hasOwnProperty.call(scL, kk)) seen[kk] = 1; }
      for (kk in seen){
        var hs = f697pHasOwn(scS, kk), hl = f697pHasOwn(scL, kk);
        if (hs !== hl || JSON.stringify(scS[kk]) !== JSON.stringify(scL[kk])) diffKeys.push('sidecar.' + kk);
      }
      diffKeys.sort();
    } catch(e){ diffKeys = ['<UNKNOWN>']; }
    return { ok: true, equal: false, excluded: excluded, diffKeys: diffKeys, localStr: lStr };
  }
  /* ★★Rev3e(GPT 追補 2): boot で projectionV2() が null（fix793/fix743 の hold 等）のときの
     **bounded retry**。契約:
       ・null のまま「同値扱い」に倒すことは **絶対にしない**（fail-closed 維持）。
       ・retry 中に server write 0 / PUT 0 / confirm 0 / **getstory 再送 0**（既存応答 j を使い回す）。
       ・500ms × 6 の bounded。story / page 切替で cancel（f697pCancelProjRetry）。
       ・上限到達なら従来どおり HOLD へ落とし、retry 回数を telemetry に残す。 */
  function f697pWithProjection(id, tries, cb){
    var lnow = null;
    try { lnow = projectionV2(id); } catch(e){ lnow = null; }
    if (lnow) return cb(lnow, tries);
    if (tries >= F697P_PROJ_RETRY_MAX){
      f697pStats.projRetryTimeouts++;
      return cb(null, tries);
    }
    f697pStats.projRetries++;
    try { note({ kind: 'F697P_CONTENT_COMPARE_RETRY', id: String(id), n: (tries + 1),
                 max: F697P_PROJ_RETRY_MAX, reason: 'NO_V2_PROJECTION' }); } catch(e){}
    try {
      f697pProjRetryTimer = setTimeout(function(){
        f697pProjRetryTimer = null;
        try { f697pWithProjection(id, tries + 1, cb); } catch(e){}
      }, F697P_PROJ_RETRY_MS);
    } catch(e){ return cb(null, tries); }
  }

  /* 比較結果の note（キー名だけ・値 0）。skipped は救済しない = fail-closed。 */
  function f697pNoteCompare(id, where, cmp){
    try {
      if (!cmp || cmp.ok !== true){
        f697pStats.compareSkipped++;
        note({ kind: 'F697P_CONTENT_COMPARE_SKIPPED', id: String(id), where: String(where),
               reason: String((cmp && cmp.reason) || 'UNKNOWN'),
               retries: ((cmp && typeof cmp.retries === 'number') ? cmp.retries : 0) });
        return;
      }
      if (cmp.excluded && cmp.excluded.length) f697pStats.optionalExcluded++;
      note({ kind: 'F697P_CONTENT_COMPARE', id: String(id), where: String(where),
             equal: !!cmp.equal, excluded: (cmp.excluded || []).slice(0),
             optionalPreserved: !!(cmp.excluded && cmp.excluded.length) });
      if (!cmp.equal){
        f697pStats.contentDiffers++;
        note({ kind: 'F697P_CONTENT_DIFFERS', id: String(id), where: String(where),
               fields: (cmp.diffKeys || []).slice(0, 24) });
      }
    } catch(e){}
  }

  /* ★★fix697p Rev3(P0-5): READ-ONLY 診断。GET した server canonical を client 側で再 hash し
     Worker の serverHash と突き合わせるだけ。**write 0 / network 0 / 判定に使わない**。 */
  function f697pHashProbe(id, j, where){
    if (!f697pEnabled()) return;
    try {
      var w = f697pServerWrap(id, j);
      var sh = String((j && j.serverHash) || '');
      if (!w || !sh) return;
      f697pStats.hashProbes++;
      sha256hex(canonicalString(w), function(h){
        if (!h || h === sh) return;
        f697pStats.hashContractMismatch++;
        f697pLastHashProbe = { where: String(where || ''), serverHash: sh.slice(0, 16),
                               clientRehash: String(h).slice(0, 16), at: Date.now() };
        try { note({ kind: 'F697P_HASH_CONTRACT_PROBE', id: String(id), where: String(where || ''),
                     serverHash: sh.slice(0, 16), clientRehash: String(h).slice(0, 16) }); } catch(e){}
      });
    } catch(e){}
  }

  function f697pNoteVerdictById(id, verdict, extra){
    var rec = null; try { rec = f697pRead(id); } catch(e){ rec = null; }
    f697pNoteVerdict(id, rec, verdict, extra);
  }

  /* ★★fix697p Rev3(P0-3): parity mismatch の bounded readback（**GET 1 回だけ・retry 0**）。
       R1 content deep-equal → LANDED_CONTENT_EQUAL → 既存 sanctioned confirm 経路 → journal clear → CLEAN
       R2 content differs    → HOLD_PARITY 維持・confirm 0・retry 0・write 0
       R3 readback 失敗       → HOLD_PARITY_READBACK_FAILED・confirm 0・retry 0・write 0 */
  function f697pParityReadback(id, sendWrap, sendStr, outHash, fin, condClearDirty){
    f697pStats.parityReadbacks++;
    try { note({ kind: 'F697P_PARITY_READBACK_START', id: String(id),
                 outgoing: String(outHash).slice(0, 16) }); } catch(e){}
    postSaveOnce({ op: 'getstory', id: id, clientCanonicalSchemaMax: 2 }, function(g2, ge2){
      if (ge2 || !g2 || g2.status !== 200 || !(g2.j && g2.j.ok)){
        f697pStats.parityReadbackFailed++;
        f697pNoteVerdictById(id, 'HOLD_PARITY_READBACK_FAILED',
                             { status: g2 ? g2.status : null, err: ge2 || null });
        return fin();
      }
      var j2 = g2.j;
      f697pHashProbe(id, j2, 'parity-readback');
      var w = f697pServerWrap(id, j2);
      var srvStr = null;
      if (w){ try { srvStr = canonicalString(w); } catch(e){ srvStr = null; } }
      if (srvStr === null){
        f697pStats.parityReadbackFailed++;
        f697pNoteVerdictById(id, 'HOLD_PARITY_READBACK_FAILED', { reason: 'NO_SERVER_RECORD' });
        return fin();
      }
      /* ★★Rev3c: 文字列直比較をやめ、**pure comparator 1 本**に委ねる。
         optional preserve semantics（Worker の omit=preserve）を理解した上での equivalence。 */
      var cmp = f697pContentEqual(sendWrap, w);
      f697pNoteCompare(id, 'parity-readback', cmp);
      if (cmp.ok !== true){
        /* ownership 判定不能 / serialize 不能 → **救済しない**（fail-closed・HOLD_PARITY 維持） */
        f697pStats.holdParity++;
        f697pNoteVerdictById(id, 'HOLD_PARITY_COMPARE_SKIPPED',
          { serverRev: j2.rev, reason: String(cmp.reason || '') });
        return fin();
      }
      if (!cmp.equal){
        /* R2: 内容が違う = 着地していない（または別内容） → STOP */
        f697pStats.holdParity++;
        f697pNoteVerdictById(id, 'HOLD_PARITY',
          { serverRev: j2.rev, serverHash: String(j2.serverHash || '').slice(0, 16), contentEqual: false,
            diffFields: (cmp.diffKeys || []).slice(0, 12) });
        return fin();
      }
      /* R1: content equivalent → **着地している**。server の実 rev で正式 confirm する。 */
      var sRev = (typeof j2.rev === 'number') ? j2.rev : null;
      var sHash = String(j2.serverHash || '');
      f697pStats.landedContentEqual++;
      cstats.confirmedByReadback++;
      try { note({ kind: 'HASH_CONTRACT_MISMATCH_CONTENT_EQUAL', id: String(id), serverRev: sRev,
                   serverHashSeen: sHash.slice(0, 16), outgoing: String(outHash).slice(0, 16),
                   excluded: (cmp.excluded || []).slice(0) }); } catch(e){}
      /* ★★Rev3c(GPT 裁定 §3): fingerprint は **client contentHashV2 domain**（= outHash）に統一する。
         serverHash を lastConfirmed.fingerprint に入れると fix705 の `lh`（client 域）と永久に
         一致せず、CLEAN 直後の reload で resolve781 が UNRESOLVED_GUARD_STATE → DIVERGED を自作する。
         server 実 hash は `serverHashSeen` として note / verdict に **別 field** で残す。
         inFlightSave.fingerprint は既に v2hash（= outHash）に refine 済みなので触らない。 */
      canonCtx = { id: id, rev: sRev, hash: String(outHash) };
      f697pClear(id, 'LANDED_CONTENT_EQUAL');
      f697pFinish(id, 'LANDED_CONTENT_EQUAL', { serverRev: sRev, serverHashSeen: sHash.slice(0, 16),
                                                fingerprint: String(outHash).slice(0, 16),
                                                excluded: (cmp.excluded || []).slice(0) });
      /* ★Rev3b(Q3): confirm が成立した **後** に CANONICAL_COMMIT_OK{via:'content-equal'} を積む。 */
      return condClearDirty(function(){
        f697pNoteCommitOk(id, sRev, String(outHash), 'content-equal');
        fin();
      });
    });
  }

  /* ★★fix697p Rev3(P0-4): boot reconcile で「hash は違うが content は同一」= 既に着地していた
     ケースを救う。**server へは 1 バイトも書かない**。confirm は既存 hook のペアのみ。 */
  /* ★★fix697p Rev3e(RECOVERY_LANDED_BASE_BOOKKEEPING / GPT 裁定 Rev3e)
     「PUT は着地したが confirm できないまま local が先へ進んだ」ケースの **bookkeeping 収束**。
     turn-prefix 推論は使わない（GPT: 弱い）。使うのは **durable journal の landed payload provenance**:
       ・journal が ARM 済み（preServerRev N / outgoingV2Hash X / outgoingFingerprint）
       ・fresh GET の rev が **ちょうど N+1**（複数進んでいたら不成立）
       ・server canonical を **client の送信 domain へ正規化**（optional omit=preserve を、ARM 時に
         durable 化した `outgoingFingerprint.sidecarKeys`＝実際に送った非 null optional key で判定）
       ・その正規化 content の hash が **X と完全一致** = 「server が保持しているのは我々が PUT した payload そのもの」
     証明できたときだけ lastConfirmed を server rev（＋client fingerprint domain = X）へ前進させる。
     **現在の local 全体が server と一致する必要は無い**（PUT 後に local が先へ進んでいてよい）。
     契約: CLEAN にしない・state は触らない・server write 0・userChoice 書換 0・transition() 0。
       → `g781InFlight` を **呼ばず** に `g781Confirm` だけを使う。fix781 の confirm は
         inFlightSave が無いと canClean=false（ACK_DIRTY_KEPT）なので **lastConfirmed だけが前進**する。 */
  function f697pMarkerHasInFlight(id){
    try {
      var G = g781();
      if (!G || typeof G.marker !== 'function') return null;      /* 判定不能 */
      var m = G.marker(id);
      if (!m) return null;
      return !!m.inFlightSave;
    } catch(e){ return null; }
  }
  /* server wrap を「ARM 時に送った domain」へ正規化する（server / rec は 1 バイトも変更しない）。 */
  function f697pServerAsSent(serverWrap, rec){
    var OPT = f697pOptionalNames();
    if (!OPT) return { ok: false, reason: 'NO_OPTIONAL_CONTRACT' };
    var fp = rec && rec.outgoingFingerprint;
    var isArr = function(x){ return Object.prototype.toString.call(x) === '[object Array]'; };
    /* ★★Rev3f(GPT REVISE 1): 除外判定は **sentOptionalKeys**（値に関わらず送った optional key 全部）
       だけを使う。旧 `sidecarKeys`（非 null のみ）は使わない。無い journal は fail-closed。 */
    var sent = (fp && isArr(fp.sentOptionalKeys)) ? fp.sentOptionalKeys : null;
    if (!sent) return { ok: false, reason: 'NO_SENT_OPTIONAL_KEYS' };
    var sentNull = (fp && isArr(fp.sentOptionalNullKeys)) ? fp.sentOptionalNullKeys : [];
    var has = {}, wasNull = {};
    for (var i = 0; i < sent.length; i++) has[String(sent[i])] = 1;
    for (var n = 0; n < sentNull.length; n++) wasNull[String(sentNull[n])] = 1;
    var ss = serverWrap.sidecar, excluded = [], restoredNull = [];
    try {
      for (var o = 0; o < OPT.length; o++){
        var k = OPT[o], sHas = f697pHasOwn(ss, k);
        /* (1) server が持つ ∩ 送っていない → Worker の omit=preserve で残ったもの → 送信 domain から除外 */
        if (sHas && !has[k]) { excluded.push(k); continue; }
        /* (2) server に無い ∩ **null を送った** → 明示 clear が着地した形 → 送信 domain では null で存在した */
        if (!sHas && has[k] && wasNull[k]) { restoredNull.push(k); continue; }
        /* (3) それ以外（送った key が server にある / 送った非 null が server に無い）は素のまま比較する。 */
      }
    } catch(e){ return { ok: false, reason: 'OWNERSHIP_THREW' }; }
    var w = {};
    try {
      for (var a in serverWrap){ if (Object.prototype.hasOwnProperty.call(serverWrap, a)) w[a] = serverWrap[a]; }
      if (excluded.length || restoredNull.length){
        var sc = {};
        for (var b in ss){ if (Object.prototype.hasOwnProperty.call(ss, b)) sc[b] = ss[b]; }
        for (var c = 0; c < excluded.length; c++) delete sc[excluded[c]];
        for (var d2 = 0; d2 < restoredNull.length; d2++) sc[restoredNull[d2]] = null;
        w.sidecar = sc;
      }
      return { ok: true, wrap: w, str: canonicalString(w), excluded: excluded, restoredNull: restoredNull };
    } catch(e){ return { ok: false, reason: 'SERIALIZE_FAILED' }; }
  }
  /* provenance の事前条件（同期・安価）。満たさないなら null を返して従来経路へ。 */
  function f697pLandedBaseEligible(rec, j){
    if (!rec || !j) return null;
    if (rec.state !== F697P_PARITY && rec.state !== F697P_ARMED) return null;
    if (typeof rec.preServerRev !== 'number') return null;
    if (!rec.outgoingV2Hash) return null;
    if (typeof j.rev !== 'number') return null;
    if (j.rev !== rec.preServerRev + 1) return { reject: 'REV_NOT_EXACTLY_PLUS_ONE' };
    return { ok: true };
  }
  /* 成立したときの bookkeeping（server write 0 / CLEAN 化 0 / transition 0）。 */
  function f697pLandedBaseConfirm(id, rec, j, norm){
    var infl = f697pMarkerHasInFlight(id);
    if (infl !== false){
      f697pStats.landedBaseRejected++;
      try { note({ kind: 'F697P_LANDED_BASE_REJECTED', id: String(id),
                   reason: (infl === null ? 'MARKER_UNREADABLE' : 'IN_FLIGHT_SAVE_PRESENT') }); } catch(e){}
      return false;
    }
    f697pStats.landedBaseConfirmed++;
    try { note({ kind: 'F697P_LANDED_BASE_CONFIRMED', id: String(id), serverRev: j.rev,
                 preServerRev: rec.preServerRev,
                 fingerprint: String(rec.outgoingV2Hash).slice(0, 16),
                 serverHashSeen: String(j.serverHash || '').slice(0, 16),
                 excluded: (norm.excluded || []).slice(0),
                 restoredNull: (norm.restoredNull || []).slice(0), from: String(rec.state) }); } catch(e){}
    /* ★sanctioned hook は confirm だけ（noteInFlight は呼ばない）。
       fix781:315-336 → infl==null なので canClean=false → **lastConfirmed のみ前進 / state 不変**。 */
    try { g781Confirm(id, j.rev, String(rec.outgoingV2Hash)); } catch(e){}
    /* landed が証明できたので journal の役目（未着地 PUT の復旧）は終了 → clear。
       ★canonCtx は **設定しない**（local は server より先行しており write authority を与えない）。 */
    f697pClear(id, 'LANDED_BASE_CONFIRMED');
    f697pFinish(id, 'LANDED_BASE_CONFIRMED', { serverRev: j.rev, preServerRev: rec.preServerRev,
                                               fingerprint: String(rec.outgoingV2Hash).slice(0, 16),
                                               excluded: (norm.excluded || []).slice(0) });
    return true;
  }

  /* ★★Rev3c: fingerprint は **client contentHashV2 domain**（localHash）。serverHash は
     `serverHashSeen` として別 field に残すだけ（GPT 裁定 §3）。 */
  function f697pClearedStaleLanded(id, rec, rev, serverHash, localHash, excluded, capped){
    if (!localHash){
      /* fingerprint を client 域で確定できないなら **救済しない**（fail-closed・捏造禁止） */
      f697pStats.compareSkipped++;
      try { note({ kind: 'F697P_CONTENT_COMPARE_SKIPPED', id: String(id), where: 'boot-reconcile',
                   reason: 'NO_LOCAL_FINGERPRINT' }); } catch(e){}
      return f697pNoteVerdict(id, rec, 'CLEARED_STALE_LANDED_SKIPPED', { reason: 'NO_LOCAL_FINGERPRINT' });
    }
    f697pStats.clearedStaleLanded++;
    if (capped) f697pStats.cappedRescues++;
    try { note({ kind: 'F697P_CLEARED_STALE_LANDED', id: String(id), serverRev: rev,
                 serverHashSeen: String(serverHash).slice(0, 16),
                 fingerprint: String(localHash).slice(0, 16),
                 excluded: (excluded || []).slice(0), capped: !!capped,
                 from: String((rec && rec.state) || '') }); } catch(e){}
    /* ■sanctioned hook のペア（noteInFlight → confirm）。transition() は呼ばない。 */
    try { g781InFlight(id, String(localHash)); } catch(e){}
    try { g781Confirm(id, (typeof rev === 'number' ? rev : null), String(localHash)); } catch(e){}
    /* ★Rev3b(Q3): boot 救済でも confirm 成立時にだけ CANONICAL_COMMIT_OK{via:'boot-cleared-stale'}。 */
    f697pNoteCommitOk(id, rev, localHash, 'boot-cleared-stale');
    canonCtx = { id: id, rev: (typeof rev === 'number' ? rev : null), hash: String(localHash) };
    f697pClear(id, 'CLEARED_STALE_LANDED');
    f697pFinish(id, 'CLEARED_STALE_LANDED', { serverRev: rev, serverHashSeen: String(serverHash).slice(0, 16),
                                              fingerprint: String(localHash).slice(0, 16),
                                              excluded: (excluded || []).slice(0), capped: !!capped });
  }

  function f697pClear(id, reason){
    if (!f697pEnabled() || !id) return false;
    try {
      var k = f697pKey(id);
      if (f697pGet(k) == null) return true;
      var okd = f697pDel(k);
      if (!okd){
        /* removeItem が通らない環境では tombstone を書いて resume を構造的に不能にする */
        okd = f697pSet(k, JSON.stringify({ v: F697P_VER, storyId: String(id), cleared: true,
                                           reason: String(reason || ''), updatedAt: Date.now() }));
      }
      if (okd) f697pStats.clears++; else f697pStats.clearFails++;
      try { note({ kind: 'F697P_JOURNAL_CLEAR', id: String(id), reason: String(reason || ''), ok: !!okd }); } catch(e){}
      return okd;
    } catch(e){ f697pStats.clearFails++; return false; }
  }

  /* ■fix745/748/798 barrier: fix793(:344-351) と同一の read-only 述語。
     fix745 / fix748 は 1 バイトも変えない。判定不能はすべて fail-closed。 */
  function f697pBarrierState(){
    var g; try { g = window.__v292DfixGWS; } catch(e){ return 'API_UNAVAILABLE'; }
    if (!g || typeof g.barrier !== 'function') return 'API_UNAVAILABLE';
    var s; try { s = g.barrier(); } catch(e){ return 'API_THREW'; }
    return (s == null) ? 'API_UNAVAILABLE' : String(s);
  }
  function f697pBarrierAllows(s){ return s === 'NOT_REQUIRED' || s === 'RESOLVED'; }

  /* ★待機の cancel（story 切替 / pagehide）。cancel 後に自動 write は起きない。 */
  /* ★Rev3e: projection retry の cancel（story 切替 / pagehide）。write は元々 0。 */
  function f697pCancelProjRetry(reason){
    if (f697pProjRetryTimer == null) return false;
    try { clearTimeout(f697pProjRetryTimer); } catch(e){}
    f697pProjRetryTimer = null;
    try { note({ kind: 'F697P_CONTENT_COMPARE_RETRY_CANCELLED', reason: String(reason || '') }); } catch(e){}
    return true;
  }
  function f697pCancelWait(reason){
    try { f697pCancelProjRetry(reason); } catch(e){}
    if (f697pWaitTimer == null) return false;
    try { clearTimeout(f697pWaitTimer); } catch(e){}
    f697pWaitTimer = null;
    f697pStats.waitCancelled++;
    try { note({ kind: 'F697P_WAIT_CANCELLED', reason: String(reason || '') }); } catch(e){}
    return true;
  }

  function f697pFinish(id, verdict, extra){
    f697pLast = { verdict: String(verdict), id: String(id || ''), at: Date.now() };
    if (extra){ for (var k in extra){ if (Object.prototype.hasOwnProperty.call(extra, k)) f697pLast[k] = extra[k]; } }
    try { note({ kind: 'F697P_' + String(verdict), id: String(id || ''),
                 detail: JSON.parse(JSON.stringify(f697pLast)) }); } catch(e){}
  }
  /* HOLD: holdCount を進める（Case C の cap 用） */
  function f697pHold(id, rec, verdict, extra){
    f697pStats.holdC++;
    try {
      rec.holdCount = ((+rec.holdCount) || 0) + 1;
      rec.lastVerdict = String(verdict);
      f697pSave(id, rec);
    } catch(e){}
    var o = { reason: String(verdict), holdCount: ((+rec.holdCount) || 0) };
    if (extra){ for (var k in extra){ if (Object.prototype.hasOwnProperty.call(extra, k)) o[k] = extra[k]; } }
    f697pFinish(id, 'CASE_C_HOLD', o);
  }
  /* 判定不能で終わったときの記録（holdCount は進めない = 次 load で再挑戦できる） */
  function f697pNoteVerdict(id, rec, verdict, extra){
    try { if (rec){ rec.lastVerdict = String(verdict); f697pSave(id, rec); } } catch(e){}
    f697pFinish(id, verdict, extra);
  }

  /* resume を撃てる状態か（撃てないうちは budget を消費しない）。 */
  function f697pNotReady(id){
    if (!isLoggedIn()) return 'NOT_LOGGED_IN';
    var c = null; try { c = projection(); } catch(e){ c = null; }
    if (!c || String(c.id) !== String(id)) return 'NO_PROJECTION';
    if (inFlight) return 'IN_FLIGHT';
    return null;
  }

  function f697pResume(id, rec, serverRev, tries){
    tries = tries || 0;
    if (f697pResumeFired){ return f697pFinish(id, 'RESUME_ALREADY_FIRED'); }
    if (!f697pEnabled()){ f697pStats.skipped++; return f697pFinish(id, 'RESUME_SKIPPED_OFF'); }
    if (rec.state === F697P_CONFLICT){                          /* ★HOLD_CONFLICT は永久に resume 禁止 */
      return f697pHold(id, rec, 'HOLD_CONFLICT_NO_RESUME');
    }
    if (rec.state === F697P_PARITY){                            /* ★Rev3: HOLD_PARITY も resume 禁止 */
      return f697pHold(id, rec, 'HOLD_PARITY_NO_RESUME');
    }
    if (((+rec.resumeCount) || 0) >= F697P_RESUME_MAX){          /* ★1 journal = 1 resume（reload を跨いでも） */
      f697pStats.budgetExhausted++;
      return f697pHold(id, rec, 'RESUME_BUDGET_EXHAUSTED');
    }
    /* ★story 切替（document scoped なので通常起きないが、起きたら待機を捨てる） */
    if (String(storyId() || '') !== String(id)){
      f697pCancelWait('STORY_CHANGED');
      return f697pNoteVerdict(id, rec, 'RESUME_ABORTED_STORY_CHANGED');
    }
    var bs = f697pBarrierState();
    var nr = f697pNotReady(id);
    if (!f697pBarrierAllows(bs) || nr){
      if (tries < F697P_WAIT_TRIES){
        try {
          f697pWaitTimer = setTimeout(function(){
            f697pWaitTimer = null;
            try { f697pResume(id, rec, serverRev, tries + 1); } catch(e){}
          }, F697P_WAIT_MS);
        } catch(e){}
        return;                                                  /* ★非 blocking */
      }
      /* ★timeout は HOLD のまま。auto write 0・budget も消費しない。 */
      if (!f697pBarrierAllows(bs)){
        f697pStats.barrierBlocked++;
        return f697pNoteVerdict(id, rec, 'BARRIER_TIMEOUT_HOLD', { barrier: bs });
      }
      f697pStats.skipped++;
      return f697pNoteVerdict(id, rec, 'RESUME_NOT_READY_HOLD', { notReady: nr });
    }
    /* ■fix705 の safety switch は迂回しない（OFF / unsafe / not fresh / route≠canonical は resume 0）。 */
    var f = fresh705(id);
    if (f.err || !f.a5 || f.a5.fresh !== true || f.a5.unsafe === true){
      return f697pNoteVerdict(id, rec, 'RESUME_HELD_AUTHORITY', { err: (f && f.err) || null });
    }
    var rt = docAuthorityRoute(id);
    if (rt !== 'canonical'){ return f697pNoteVerdict(id, rec, 'RESUME_HELD_ROUTE', { route: String(rt) }); }
    /* ★budget を **先に** durable 化してから撃つ（crash 中断でも 2 回目は撃たない）。 */
    rec.resumeCount = ((+rec.resumeCount) || 0) + 1;
    rec.lastVerdict = 'CASE_B_RESUME';
    rec.resumedAt = Date.now();
    f697pSave(id, rec);
    f697pResumeFired = true;
    f697pStats.resumedB++;
    f697pFinish(id, 'CASE_B_RESUME', { serverRev: serverRev, barrier: bs,
                                       resumeCount: ((+rec.resumeCount) || 0) });
    /* ★blind retry ではない: 保存 payload の再送 0。既存 commit 経路で strict CAS をやり直すだけ。 */
    try { commit('fix697p-journal-resume'); } catch(e){}
  }

  /* ★Case B の追加条件（Rev3d): 現在の local client hash（contentHashV2 domain）が
     **その journal state の期待値**と一致すること。
       PREPARED_LOCAL → intendedCanonicalHash ／ ARMED_CAS → outgoingV2Hash
     一致しない = prepare/arm 以降に local が進んだ → **resume しない**（Case C HOLD）。 */
  function f697pVerifyLocalThenResume(id, rec, serverRev, expectHash, fromState){
    var want = String(expectHash == null ? rec.intendedCanonicalHash : expectHash);
    var c2 = null;
    try { c2 = projectionV2(id); } catch(e){ c2 = null; }
    if (!c2) return f697pHold(id, rec, 'NO_V2_PROJECTION');
    try {
      sha256hex(canonicalString(c2), function(h){
        if (!h) return f697pHold(id, rec, 'LOCAL_HASH_FAILED');
        if (h !== want){
          f697pStats.localMoved++;
          return f697pHold(id, rec, 'LOCAL_MOVED_SINCE_PREPARE',
                           { localHash: h.slice(0, 16), expected: want.slice(0, 16),
                             from: String(fromState || rec.state || '') });
        }
        try { note({ kind: 'F697P_CASE_B_RESUME_ELIGIBLE', id: String(id),
                     from: String(fromState || rec.state || ''), serverRev: serverRev,
                     localHash: h.slice(0, 16) }); } catch(e2){}
        f697pResume(id, rec, serverRev, 0);
      });
    } catch(e){ f697pHold(id, rec, 'LOCAL_HASH_THREW'); }
  }

  /* ★★Rev3c(GPT 裁定 §4): capped=true は「holdCount cap 到達後でも **safe content-equivalence**
     だけは試す」モード。holdCount の reset も cap 除外もしない。equivalence 以外の判定
     （Case A / B / C・resume）は一切行わず、journal も書かない（read-only 証明のみ）。 */
  function f697pReconcile(id, rec, capped){
    f697pStats.reconciles++;
    /* capped 中は holdCount を進めない（cap は既に適用済み・journal write 0） */
    var capStop = function(reason, extra){
      f697pStats.skipped++;
      var o = { holdCount: ((+rec.holdCount) || 0), reason: String(reason || '') };
      if (extra){ for (var k in extra){ if (Object.prototype.hasOwnProperty.call(extra, k)) o[k] = extra[k]; } }
      return f697pFinish(id, 'HOLD_CAP_REACHED', o);
    };
    var holdX = function(verdict, extra){
      if (capped) return capStop(verdict, extra);
      return f697pHold(id, rec, verdict, extra);
    };
    try { note({ kind: 'F697P_RECONCILE_START', id: String(id), state: String(rec.state),
                 lastConfirmedRev: rec.lastConfirmedRev,
                 intended: String(rec.intendedCanonicalHash).slice(0, 16) }); } catch(e){}
    /* ★read op（getstory）なので side-port 分類（TYPE_R/TYPE_A）に該当せず authority を汚さない。
       capability は caller 値を通さず内部で 2 固定（fix751 getStoryV2Once と同じ規約）。 */
    postSaveOnce({ op: 'getstory', id: id, clientCanonicalSchemaMax: 2 }, function(g, gerr){
      if (gerr || !g){ f697pStats.getFails++;
        return f697pNoteVerdict(id, rec, 'RECONCILE_GET_FAILED'); }
      var j = g.j || {};
      if (g.status === 404) return holdX('ROW_MISSING');       /* resurrection 禁止 */
      if (g.status !== 200 || !j.ok){ f697pStats.getFails++;
        return f697pNoteVerdict(id, rec, 'RECONCILE_GET_HTTP_' + g.status); }
      if (String(j.id != null ? j.id : id) !== String(id)) return holdX('ID_MISMATCH');
      if (j.deleted === true) return holdX('TOMBSTONE');
      if (String(j.authority || 'shadow') !== 'canonical')
        return holdX('AUTHORITY_DRIFT', { serverAuthority: String(j.authority || 'shadow') });
      var srvSchema = (typeof j.recordSchema === 'number') ? j.recordSchema
                    : ((j.record && j.record.schema === 2) ? 2 : 1);
      if (srvSchema !== 2) return holdX('SERVER_NOT_SCHEMA2', { recordSchema: srvSchema });
      if (typeof j.rev !== 'number') return holdX('NO_SERVER_REV');
      var sh = String(j.serverHash || '');
      if (!sh) return holdX('NO_SERVER_HASH');
      /* ★★fix697p Rev3(P0-4): hash だけで A/B/C を決めない。**最優先で content 同一性**を見る。
         比較対象は projectionV2 全体（turns ＋ sidecar 13key ＋ memoryV1）の canonical serialization。
         これで「Worker の content_hash 規約が client と違うだけで、実際は着地していた」
         （= T23 実測 CANONICAL_LANDED_NOCONFIRM）を救う。**server へは write 0**。 */
      f697pHashProbe(id, j, 'boot-reconcile');
      /* ★★Rev3c: boot も **同じ pure comparator 1 本**。boot には過去の actual PUT payload が
         無いので「現在 client が作れる effective local projection / ownership set」を基準にする
         （GPT 裁定 §2）。projection 不能 / ownership 判定不能 / serialize 不能 は
         CONTENT_COMPARE_SKIPPED で **救済しない・CLEAN にしない**（fail-closed）。 */
      var swrap = f697pServerWrap(id, j);
      /* ★★Rev3e: projectionV2()==null は **bounded retry**（500ms×6・GET 再送 0・write 0）。
         null のまま同値扱いにすることは絶対にしない。 */
      return f697pWithProjection(id, 0, function(lnow, retries){
      var cmp = (swrap && lnow)
        ? f697pContentEqual(lnow, swrap)
        : { ok: false, equal: false, excluded: [], diffKeys: [],
            reason: (!swrap ? 'NO_SERVER_RECORD' : 'NO_V2_PROJECTION') };
      cmp.retries = retries;
      f697pNoteCompare(id, 'boot-reconcile', cmp);
      if (cmp.ok === true && cmp.equal === true){
        /* fingerprint は client contentHashV2 domain（= 比較に使った local serialization の sha）。 */
        return sha256hex(cmp.localStr, function(lh){
          f697pClearedStaleLanded(id, rec, j.rev, sh, lh || null, cmp.excluded, !!capped);
        });
      }
      /* ★★Rev3e(RECOVERY_LANDED_BASE_BOOKKEEPING): local 全体が一致しなくても、
         **journal provenance**（ARM 時に固定した outgoing payload の指紋）で
         「server が保持しているのは我々が PUT したものそのもの」を証明できるなら
         lastConfirmed だけを server rev へ前進させる（CLEAN 化 0 / server write 0）。
         equivalence 救済と同じく **read-only 証明**なので cap 判定より前に置く。 */
      /* ★Rev3e(GPT 追補 2): projection が取れていない間は LANDED_BASE にも進まない（fail-closed）。 */
      var elig = lnow ? f697pLandedBaseEligible(rec, j) : null;
      if (elig && elig.reject){
        f697pStats.landedBaseRejected++;
        try { note({ kind: 'F697P_LANDED_BASE_REJECTED', id: String(id), reason: String(elig.reject),
                     serverRev: j.rev, preServerRev: rec.preServerRev }); } catch(e){}
      } else if (elig && elig.ok && swrap && lnow){
        var norm = f697pServerAsSent(swrap, rec);
        if (norm.ok !== true){
          f697pStats.landedBaseRejected++;
          try { note({ kind: 'F697P_LANDED_BASE_REJECTED', id: String(id),
                       reason: String(norm.reason || 'NORMALIZE_FAILED') }); } catch(e){}
        } else {
          return sha256hex(norm.str, function(nh){
            if (nh && nh === String(rec.outgoingV2Hash)){
              if (f697pLandedBaseConfirm(id, rec, j, norm)) return;
            } else {
              f697pStats.landedBaseRejected++;
              try { note({ kind: 'F697P_LANDED_BASE_REJECTED', id: String(id), reason: 'PROVENANCE_MISMATCH',
                           serverAsSent: String(nh || '').slice(0, 16),
                           outgoing: String(rec.outgoingV2Hash).slice(0, 16),
                           excluded: (norm.excluded || []).slice(0) }); } catch(e){}
            }
            return f697pReconcileTail(id, rec, j, sh, cmp, capped, capStop, holdX);
          });
        }
      }
      return f697pReconcileTail(id, rec, j, sh, cmp, capped, capStop, holdX);
      });
    });
  }

  /* reconcile の後半（Case A / HOLD 保持 / Case B / Case C）。Rev3e の非同期分岐から
     2 箇所で呼ぶために切り出しただけで、判定順序は Rev3d から 1 行も変えていない。 */
  function f697pReconcileTail(id, rec, j, sh, cmp, capped, capStop, holdX){
      /* ★Rev3c(GPT 裁定 §4): equivalent でない / 比較不能なら capped は従来どおり cap 適用。 */
      if (capped) return capStop(cmp.ok === true ? 'CONTENT_DIFFERS' : String(cmp.reason || 'COMPARE_SKIPPED'),
                                 { serverRev: j.rev });
      /* ---- Case A: intended / outgoing content が既に server へ着地している ---- */
      if (sh === String(rec.intendedCanonicalHash) ||
          (rec.outgoingV2Hash && sh === String(rec.outgoingV2Hash))){
        f697pStats.convergedA++;
        f697pClear(id, 'CASE_A_CONVERGED');
        return f697pFinish(id, 'CASE_A_CONVERGED', { serverRev: j.rev, from: String(rec.state) });
      }
      /* ---- HOLD_CONFLICT / HOLD_PARITY: 収束していない限り保持して HOLD（自動 resume 禁止） ---- */
      if (rec.state === F697P_CONFLICT){
        return holdX('HOLD_CONFLICT_KEPT', { serverRev: j.rev, serverHash: sh.slice(0, 16) });
      }
      if (rec.state === F697P_PARITY){
        /* ★Rev3: parity readback で content 不一致だった journal は自動 resume しない（GPT: STOP）。 */
        return holdX('HOLD_PARITY_KEPT', { serverRev: j.rev, serverHash: sh.slice(0, 16) });
      }
      /* ---- Case B 候補: server は lastConfirmed pre-state のまま = 未着地 ---- */
      /* ★★fix697p Rev3d(GPT 裁定 2026-09-03 / Case B REVISE): PREPARED_LOCAL と ARMED_CAS で
         resume 規則を分ける。**`lastConfirmedHash` は client fingerprint（contentHashV2 domain）であり、
         serverHash と比較してはならない**（Rev3c で fingerprint domain を統一した結果、
         optional 非対称 story では serverHash と永久に一致せず Case B が死んでいた）。

           PREPARED_LOCAL: `server.rev === lastConfirmedRev`（**rev が CAS authority**）
                           AND 現在 local の client hash === intendedCanonicalHash
                           → strict CAS を 1 回だけ resume。serverHash は要求しない。
           ARMED_CAS     : fresh GET が ARM 時の pre-state と完全一致
                           （`server.rev === preServerRev` AND `server.hash === preServerHash`）
                           AND 現在 local の client hash === outgoingV2Hash → resume once（強い規則を維持）。
         いずれも server.rev が進んでいれば HOLD / local が intended(outgoing) から動いていれば HOLD。 */
      if (rec.state === F697P_ARMED){
        var armedHash = String(rec.outgoingV2Hash || '');
        if (!armedHash) return holdX('ARMED_WITHOUT_OUTGOING_HASH', { serverRev: j.rev });
        if (j.rev === rec.preServerRev && sh === String(rec.preServerHash || '')){
          return f697pVerifyLocalThenResume(id, rec, j.rev, armedHash, 'ARMED_CAS');
        }
        return holdX('SERVER_MOVED', { serverRev: j.rev, serverHash: sh.slice(0, 16),
                                       preServerRev: (rec.preServerRev == null ? null : rec.preServerRev),
                                       from: 'ARMED_CAS' });
      }
      if (rec.state === F697P_PREPARED && j.rev === rec.lastConfirmedRev){
        return f697pVerifyLocalThenResume(id, rec, j.rev, String(rec.intendedCanonicalHash), 'PREPARED_LOCAL');
      }
      /* ---- Case C: server が別の rev/hash へ進んだ → auto write 禁止 ---- */
      return holdX('SERVER_MOVED', { serverRev: j.rev, serverHash: sh.slice(0, 16),
                                                  lastConfirmedRev: rec.lastConfirmedRev });
  }

  function f697pBoot(tries){
    tries = tries || 0;
    if (!f697pEnabled()) return;                    /* ★OFF / kill: storage 0 / GET 0 / resume 0 */
    if (f697pReconciled) return;
    var again = function(){
      if (tries < F697P_BOOT_TRIES){
        try { setTimeout(function(){ try { f697pBoot(tries + 1); } catch(e){} }, F697P_BOOT_MS); } catch(e){}
      }
    };
    var id = storyId();
    if (!id) return again();                        /* document bind 前 */
    var rec = f697pRead(id);
    if (!rec) return;                               /* journal 無し = 従来挙動（read 1 回・write 0・GET 0） */
    if (!isLoggedIn()) return again();               /* 未 login では authoritative GET を撃たない */
    /* ★★Rev3c(GPT 裁定 §4): holdCount cap に達していても **safe content-equivalence reconcile**
       だけは cap 判定より前に実施する（holdCount reset 禁止・cap 除外禁止のまま）。
       fresh GET が取れて optional-preserve semantics 込みで equivalent と証明できたときだけ
       CLEARED_STALE_LANDED → sanctioned confirm → journal clear（server write 0 の bookkeeping 収束）。
       differs / compare skipped / GET 失敗は従来どおり cap 適用（journal write 0・resume 0）。 */
    var capped = (((+rec.holdCount) || 0) >= F697P_HOLD_MAX);
    f697pReconciled = true;
    f697pReconcile(id, rec, capped);
  }

  // ---- commit（完全 fire-and-forget） ----
  var inFlight = false, lastSentHash = null;
  /* ■fix781c(サブfix・kill=v292Dfix781cOff): DROPPED COMMIT INTENT の 1 回だけ再スケジュール。
     旧実装は `if (!on() || inFlight) return;` で **in-flight 中に来た commit intent を黙って捨てて**
     いた（再スケジュール 0）。fix697 は自動再送を一切持たない（TIMEOUT_MS=25000 で abort → note のみ）
     ため、捨てられた intent は次の markDirty が来るまで永久に送られない。
     ・fin() 到達時にフラグが立っていれば **既存の markDirty(debounce) 経路へ 1 回だけ**戻す。
     ・network retry ではない（同じ payload の再送ではなく、現在の local を改めて評価し直す）。
     ・無限ループ防止に document 単位の上限を置く。 */
  var f781cPending = false, f781cCount = 0, F781C_MAX = 20;
  function f781cDrain(){
    try {
      if (!f781cPending) return;
      f781cPending = false;                                  /* ★consume してから発火（1 回のみ） */
      if (f781cOff()) return;
      if (f781cCount >= F781C_MAX){ note({ kind: 'F781C_CAP_REACHED', count: f781cCount }); return; }
      f781cCount++;
      note({ kind: 'F781C_RESCHEDULE', count: f781cCount });
      markDirty();
    } catch(e){}
  }
  function commit(why){
    /* ★★fix721.1(STEP4F.1/RULING31): restore transaction中はshadow/canonical writeを発火させない（読取のみ） */
    try { var __rj = JSON.parse(lsg('v292Dfix721_txn') || 'null');
          if (__rj && (__rj.phase === 'PREPARED' || __rj.phase === 'APPLYING')) return; } catch(e){}
    if (!on()) return;
    /* ■fix781c: in-flight 中の intent は捨てずに「あとで 1 回だけ」へ回す */
    if (inFlight){ if (!f781cOff()) f781cPending = true; return; }
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
      if (route === 'canonical'){
        /* ★fix755: schema2 row だけ V2 保存経路。schema1 canonical は従来のまま。 */
        if (docAuthoritySchema2(id)){ canonicalCommit2(id, localHash, why); return; }
        canonicalCommit(id, content, localHash, why); return;
      }
      if (route !== 'shadow'){
        if (route === 'hold') cstats.holds++; else cstats.routedUnknown++;
        note({ kind: 'CANONICAL_AUTHORITY_UNCONFIRMED', id: id, route: route });
        /* ★★fix733: ここも authority 未確定と同じ状態。debounce timer は既に消費されているため
           何もしないと commit intent が silent drop になる。再評価を予約する（network retry ではない）。 */
        revStats.unknownBlocks++;
        pendingIntent = true;
        setDocRevUnknown('ROUTE_' + String(route).toUpperCase());   /* ★fix733: 理由を残して診断可能にする */
        note({ kind: 'AUTHORITY_PENDING', id: id, reason: 'ROUTE_' + String(route).toUpperCase(), localHash: localHash });
        scheduleAuthorityRecheck();
        return;                                            /* 送信 0、dirty は保持 */
      }
      cstats.routedShadow++;
      /* ★★fix733: authority が確定していないなら **送らない**（rev 0 として送らない）。
         commit intent は捨てず AUTHORITY_PENDING として再評価を予約する。 */
      if (!resolveDocRev(id, localHash)){
        revStats.unknownBlocks++;
        pendingIntent = true;
        note({ kind: 'AUTHORITY_PENDING', id: id, reason: docRevSource, epoch: authorityEpoch, localHash: localHash });
        scheduleAuthorityRecheck();
        return;                                            /* write 0 */
      }
      pendingIntent = false;
      var baseRev = docBaseRev;                            // ★KNOWN のときだけ数値（cache は再読しない）
      var mid = 'ps:' + id + ':' + baseRev + ':' + localHash;   // ★BLOCKER2
      var payload = { op: 'putstory', id: id, baseStoryRev: baseRev,
                      record: content, shadow: true, mid: mid,
                      clientMeta: { device: (navigator.userAgent || '').slice(0, 60), build: BUILD } };
      inFlight = true; stats.commits++;
      g781InFlight(id, localHash);                           /* ■fix781: 送信開始を durable 化（shadow 経路） */
      var ac = null, timer = null;
      try { ac = new AbortController(); timer = setTimeout(function(){ try { ac.abort(); } catch(e){} }, TIMEOUT_MS); } catch(e){}
      var opts = { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) };
      if (ac) opts.signal = ac.signal;
      fetch(proxyUrl() + '/save', opts).then(function(res){
        return res.json().then(function(j){ return { status: res.status, j: j }; });
      }).then(function(r){
        inFlight = false; if (timer) clearTimeout(timer);
        g781Settle(id);                                        /* ■fix781 / ■fix781c: 後片付けは microtask（confirm の後） */
        var j = r.j || {};
        if (r.status === 200 && j.ok){
          lastSentHash = localHash;
          lineageBaseHash = localHash;                     /* ★fix733: server 側に載ったことが確定した内容 */
          if (j.noop) stats.noop++; else stats.ok++;
          if (j.serverHash && j.serverHash === localHash){ stats.parityPass++; }
          else { stats.parityFail++; note({ kind: 'PARITY_FAIL', id: id, rev: j.rev, localHash: localHash, serverHash: j.serverHash || null, why: why }); }
          /* ★STEP3C SUCCESS LEDGER: 成功も1行だけ記録（type/why/baseRev/serverRev/hash のみ） */
          note({ kind: 'SUCCESS', type: (j.noop ? 'NOOP' : 'OK'), id: id, why: why,
                 baseRev: baseRev, serverRev: (typeof j.rev === 'number' ? j.rev : null),
                 localHash: localHash, serverHash: j.serverHash || null, replayed: (j.replayed === true) });
          if (typeof j.rev === 'number') advanceDocRev(id, j.rev);   // 200 normal / 200 noop
          /* ■fix781: ACK 済み事実の durable 化（shadow 200 / noop） */
          g781Confirm(id, (typeof j.rev === 'number' ? j.rev : null), localHash);
          return;
        }
        if (r.status === 409 && j.conflict){
          if (j.serverHash && j.serverHash === localHash){
            stats.seedEquivalent++;                         // ★SEED_EQUIVALENT: doc rev 採用可・retry 0・UI 0
            if (typeof j.serverRev === 'number') advanceDocRev(id, j.serverRev);
            lastSentHash = localHash;
            lineageBaseHash = localHash;                    /* ★fix733: server と同一内容が確定 */
            /* ■fix781: SEED_EQUIVALENT も「server 側に同一内容が載っている」確定事実 */
            g781Confirm(id, (typeof j.serverRev === 'number' ? j.serverRev : null), localHash);
            note({ kind: 'SEED_EQUIVALENT', id: id, serverRev: j.serverRev });
          } else {
            stats.shadowConflict++;                         // ★SHADOW_CONFLICT: marker 不変・retry 0・UI 0
            /* ★★fix733(RULING89 §20): blind rev seed 0 / same payload retry 0 は維持。
               ただし「今持っている base が古い」ことは確定したので authority は invalidate してよい。
               次の write 需要で fresh authority を取り直す（rev だけ更新して stale local を送ることはしない）。 */
            invalidateDocRevAuthority('409-shadow-conflict', id);
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
        g781Settle(id);                                        /* ■fix781 / ■fix781c: 後片付けは microtask（confirm の後） */
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
    var base = a.length + ':' + a.slice(0, 80);
    /* ■fix781b(サブfix・kill=v292Dfix781bOff): SIDECAR DIRTY TRIGGER GAP の最小手当。
       schema2 の canonical content は sidecar 13key（fix743 S2_FIELDS）を含むのに、
       この poll は aiInstr 1 本しか指紋化していなかった。残り 12key
       （relations / charStates / charFlags / pendingDice / states77 / roster307 /
        turnSummaryOverrides / chapterTitles / sceneBreaks / sceneSummaries / coverSeed）
       は content_hash を動かすのに専用トリガが無く、次の S.save に相乗りしない限り
       永久に commit されなかった（= 「turn 同数で sidecar だけ先行」が送信すらされない）。
       ・key mapping は fix743.keysFor を **読むだけ**（新 serializer を作らない）。
       ・指紋の作り方は既存 base と同じ「長さ + 先頭数十文字」だけ（canonical hash ではない）。
       ・781bOff='1' のとき戻り値は従来と byte 同一。 */
    if (f781bOff()) return base;
    var K = null;
    try { var C = window.__v292DfixCC2; if (C && typeof C.keysFor === 'function') K = C.keysFor(String(id)); }
    catch(e){ K = null; }
    if (!K) return base;
    var names = [], n;
    for (n in K){ if (Object.prototype.hasOwnProperty.call(K, n)) names.push(n); }
    names.sort();                                        /* 決定的な順序（列挙順に依存しない） */
    var out = base;
    for (var i = 0; i < names.length; i++){
      var kk = String(K[names[i]]);
      if (kk === keyOf(id)) continue;                    /* body は S.save 側トリガが既に見ている */
      var v = null; try { v = lsg(kk); } catch(e2){ v = null; }
      out += '|' + names[i] + '=' + (v == null ? 'n' : (v.length + ':' + v.slice(0, 24)));
    }
    return out;
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

  /* ★★fix733: boot 時に cache から rev を推定するのをやめた（UNKNOWN のまま開始）。
     代わりに lineage gate の base となる local canonical hash だけを read-only で捉える。 */
  try { captureInitialLocalHash(); } catch(e){}

  /* ★★fix697p Rev2(P1): reload を跨いだ PREPARED_LOCAL journal の reconcile を 1 回だけ起動する。
     ここは「起動」だけ。判定・resume 可否は f697pBoot / f697pReconcile / f697pResume 側で
     fail-closed に決める（journal が無ければ storage 1 read で終わる＝従来挙動）。
     ★story 切替は必ず document reload（live index.html の __chronicleDocumentStoryKey は
       非永続・document scoped・immutable）なので、同一 document 内での再 reconcile は不要。 */
  try { f697pBoot(0); } catch(e){}
  /* ★barrier / readiness の待機は pagehide で必ず cancel する（GPT REVISE 3-(4)）。 */
  try {
    if (f697pEnabled() && typeof window.addEventListener === 'function'){
      window.addEventListener('pagehide', function(){ try { f697pCancelWait('PAGEHIDE'); } catch(e){} }, false);
    }
  } catch(e){}

  /* ★★fix716: endpoint / auth / request の単一実装。shadowRequest と putStoryOnce が共有する。
     ここは送るだけ。localStorage / sessionStorage / docBaseRev / commit / projection を触らない。 */
  /* ★★fix733(RULING83 §7 / RULING86 §31 / RULING88 §31 / RULING89 §16-§19) — SIDE-PORT REV COHERENCE
     trace 結果: side-port は server rev を進めるが v292Dfix402_storyRevs を更新しない。
       setstorytitle（fix729）             … server rev 前進 / cache 更新 0 / 非 current story も対象になり得る
       putcanonical（canonicalCommit・port）… server rev 前進 / cache 更新 0（rev は in-memory canonCtx のみ）
       promotestory / promotedelete（fix702）… server rev 前進 / 更新するのは v292Dfix702_storyAuth のみ
       deleteshadow / deletecanonical      … server 状態変更 / cache 更新 0
     いずれも SAFE REV HANDOFF を証明できないので **DOCUMENT AUTHORITY INVALIDATE** に分類する。
     ★タイミングは **response ではなく REQUEST ATTEMPT**（RULING89 §16-§18）。
       client 側が network error になっても server では成功している可能性があるため。
     実装位置は全 side-port が共有する postSaveOnce の 1 箇所だけ。port 本体は byte 不変。
     getstory 等の read は対象外。commit() 自身の putstory は postSaveOnce を通らないので自己無効化はしない。 */
  /* ★★fix733(RULING90 §12-§14) — side-port の 2 分類
     TYPE R  REV-ONLY / SAME-AUTHORITY 候補 … setstorytitle / scrubstorycfg / putstory
             → epoch invalidate → lazy getstory → authority が bootstrap と同一 かつ not deleted
               かつ rev/hash valid なら lineage gate へ進んで sync 再開できる
     TYPE A  AUTHORITY / LIFECYCLE CHANGING … putcanonical / promotestory / promotedelete /
             deleteshadow / deletecanonical
             → attempt した時点で AUTHORITY_RELOAD_REQUIRED。以後 body write 0。
               lazy rev refresh で無理に復活させない（reload で fix705 に再分類させる） */
  var F733_SIDEPORT_TYPE_R = { setstorytitle: 1, scrubstorycfg: 1, putstory: 1 };
  var F733_SIDEPORT_TYPE_A = { putcanonical: 1, promotestory: 1, promotedelete: 1,
                               deleteshadow: 1, deletecanonical: 1 };
  /* ★fix733 */
  function f733SidePortAttempt(body){
    if (!body) return;
    var op = String(body.op || '');
    if (F733_SIDEPORT_TYPE_A[op]){ invalidateDocRevAuthority('sideportA:' + op, body.id, true); return; }
    if (F733_SIDEPORT_TYPE_R[op]){ invalidateDocRevAuthority('sideportR:' + op, body.id, false); return; }
  }
  function postSaveOnce(body, cb){
    if (!isLoggedIn()){ cb(null, 'NOT_LOGGED_IN'); return; }
    try { f733SidePortAttempt(body); } catch(e){}          /* ★fix733: 送信を試みた時点で invalidate */
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

  /* ★★fix755: putCanonicalOnce の単一実装（export と canonicalCommit2 が共有。duplicate 禁止）。
     契約は fix717/fix750 のまま byte 同一の意味論:
       ・op 固定 / whitelist 組立 / record.schema===2 のときだけ clientCanonicalSchemaMax:2。 */
  function putCanonicalOnceImpl(payload, cb){
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
    /* ★★fix750(C1_WRITE_PATH_WIRING): schema2 canonical write のときだけ
         clientCanonicalSchemaMax を whitelist に加える。
       ・Worker v39 は schema2 record に対して clientCanonicalSchemaMax >= 2 を要求し、
         無ければ CLIENT_SCHEMA_TOO_OLD で fail-closed する（= negative control を壊さない）。
       ・**record.schema === 2 のときだけ** 送る。schema1 の既存 payload は 1 バイトも変えない。
       ・値は caller の申告をそのまま流さず 2 に正規化する（capability 詐称の余地を作らない）。
         schema2 を送る client は定義上 v2-capable であり、それ以外の値に意味は無い。 */
    if (p.record.schema === 2) body.clientCanonicalSchemaMax = 2;
    postSaveOnce(body, cb);
  }

  window.__v292Dfix697 = {
    __armed: true,
    /* ★★fix733: side-port 側から current document の rev authority を無効化するための口。
       **進めることは決してしない**（UNKNOWN へ落とすだけ）。fix702 / fix729 からも呼べる。 */
    invalidateDocRevAuthority: invalidateDocRevAuthority,
    docRevAuthority: function(){ return { state: docRevState, rev: docBaseRev, source: docRevSource,
      id: docRevId, epoch: authorityEpoch, authorityReloadRequired: authorityReloadRequired,
      bootstrapAuthority: bootstrapAuthority, bootstrapPresent: bootstrapPresent,
      initialLocalHash: initialLocalHash,
      lineageBaseHash: lineageBaseHash, pendingIntent: pendingIntent,
      stats: JSON.parse(JSON.stringify(revStats)) }; },
    off: off, on: on,
    status: function(){ return { on: on(), loggedIn: isLoggedIn(), storyId: storyId(),
      authorityKey: authorityKey(), documentShadowBaseRev: docBaseRev, docRevInit: docBaseRevInit,
      /* ★★fix733: 3 状態 authority + epoch の可視化（bootCache は hint であって write authority ではない） */
      docRev: { state: docRevState, rev: docBaseRev, source: docRevSource, id: docRevId,
                epoch: authorityEpoch, refreshInFlightEpoch: refreshInFlightEpoch,
                authorityReloadRequired: authorityReloadRequired,
                bootstrapAuthority: bootstrapAuthority, bootstrapPresent: bootstrapPresent,
                initialLocalHash: initialLocalHash, initialLocalHashAt: initialLocalHashAt,
                lineageBaseHash: lineageBaseHash, pendingIntent: pendingIntent,
                recheckTries: recheckTries, stats: JSON.parse(JSON.stringify(revStats)) },
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
    /* ★★fix697p(P1/P2): PREPARED_LOCAL journal の read-only 可視化（write 0 / network 0 / 遷移 0）。
       reset / force / resume を外から撃つ口は **作らない**（guard の無効化を構造的に禁止）。 */
    journal: function(id){ var s = id || storyId(); return s ? f697pRead(s) : null; },
    journalStats: function(){
      return { off: f697pOff(), enabled: f697pEnabled(), rev: 3,
               key: F697P_PRE + String(storyId() || ''),
               resumeFired: f697pResumeFired, reconciled: f697pReconciled,
               waiting: (f697pWaitTimer != null),
               resumeMax: F697P_RESUME_MAX, holdMax: F697P_HOLD_MAX,
               barrier: f697pBarrierState(), last: f697pLast ? JSON.parse(JSON.stringify(f697pLast)) : null,
               /* ★Rev3(P0-5): READ-ONLY 診断の直近結果（判定には使わない） */
               hashProbe: f697pLastHashProbe ? JSON.parse(JSON.stringify(f697pLastHashProbe)) : null,
               stats: JSON.parse(JSON.stringify(f697pStats)) }; },
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
    /* ★fix755: schema2 server-parity content の read-only 口（fix705 の分類 / 検証用）。 */
    projectionV2: projectionV2,
    contentHashV2: contentHashV2,
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
    /* ★★fix751(GPT裁定36 OPTION_B): schema2-capable client 専用の **狭い** read 口。
       背景（BLOCKER #6 = C1_POST_COMMIT_READBACK_SCHEMA_DECLARATION_GAP）:
         Worker v39 の getstory は OLD CLIENT READ GATE を持ち、stored blob が schema2 のとき
         clientCanonicalSchemaMax >= 2 を宣言しない client へは 409 CLIENT_SCHEMA_TOO_OLD を返す
         （fail-closed。旧 client へ schema2 を誤配信しないための安全装置）。
         fix750 の post-write readback は既存 shadowRequest を使っており capability を宣言しないため、
         schema2 を書いた直後から自分で読めず READ_FAILED_AFTER_CANONICAL_WRITE になっていた（live 実測）。
       なぜ shadowRequest へ無条件に capability を足さないのか（裁定36 で OPTION_A は却下）:
         shadowRequest は read/delete 系の汎用外部口。そこへ無条件に schema2 capability を付けると、
         schema2 を扱う能力の無い既存 caller まで「自分は読めます」と Worker へ申告することになり、
         Worker 側の fail-closed gate を弱める方向になる。既存 shadowRequest は **byte 不変**で残す。
       契約:
         ・caller が渡せるのは **exact storyId（string）だけ**。
           op / payload / record / clientCanonicalSchemaMax を caller から受け取らない。
         ・op は 'getstory' 固定。clientCanonicalSchemaMax は caller 値を通さず **内部で 2 固定**
           （capability 詐称の余地を作らない）。
         ・request は exactly 1。自動 retry しない。
         ・localStorage / sessionStorage へ 1 バイトも書かない。docBaseRev / commit / projection を触らない。
           op は read なので fix733 の side-port invalidate 分類（TYPE_R / TYPE_A）にも該当しない。
         ・endpoint / auth / request 実装は postSaveOnce（既存単一実装）を共有。
           新 fetch 0 / 新 endpoint 0 / 新 auth 0 / 新 Worker op 0。
         ・callback は fix697 正式契約 **cb(result, errorCode)**。
         ・ROW_ABSENT(404) / schema1(200) / schema2(200) をすべてこの1本で読める。 */
    getStoryV2Once: function(storyId, cb){
      if (typeof cb !== 'function') return;
      if (typeof storyId !== 'string' || !storyId){ cb(null, 'BAD_STORY_ID'); return; }
      /* ★caller の申告を一切流さず whitelist から組み直す。 */
      postSaveOnce({ op: 'getstory', id: storyId, clientCanonicalSchemaMax: 2 }, cb);
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
    putCanonicalOnce: putCanonicalOnceImpl,

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
