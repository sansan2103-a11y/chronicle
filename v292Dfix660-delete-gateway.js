// =====================================================================
// Chronicle TRPG - v292Dfix660 (A): DeleteGateway — 物理削除の唯一の実行者
// ---------------------------------------------------------------------
// 出典: 裁定統合_GPT_第0段中央GC_2026-07-26.md（§1 二層構成 / §2 シナリオ2・4・5 / I8 / I10 / I15）
//
// ■このモジュールの責務は1つだけ
//   「**指定されたキーを、正確に、検証つきで消す**」。
//   何を消すべきかは決めない(それは BackupGC=fix660gc と各所有者の仕事)。
//   GPT裁定の言葉:「削除候補を決める者と、物理的に消す者を分ける」。
//
// ■なぜ native primitive を事前捕捉するのか(裁定 シナリオ2)
//   fix246 は removeItem のキー名を実効キーへ**書き換える**。
//   K の実在と hash をどれだけ厳密に確認しても、削除そのものが fix246 を通れば
//   消えるのは K ではなく K' で、K は残り、K' が他スロットの唯一の控えなら保護違反になる。
//   → 削除は必ず **fix246 より前に捕捉した native** で行う:
//        nativeRemove.call(localStorage, exactKey)
//   本モジュールは fix569(Chronicle最初期に native を捕捉済み)の `_native().remove` を
//   借りる。借りられないときだけ自分で捕捉する(index.html では fix246 より前に置く)。
//   どちらの経路を使ったかは status().nativeSource で必ず観測できる。
//
// ■削除トークン(I8)
//   { planId, unitId, key, hash, bytes, family, slotId, intent, policyVersion, protectionEpoch }
//   **削除直前に9項目**・**削除後に3項目**を検証する。1つでも欠ければ削除しない(fail-closed)。
//
// ■ログ(裁定 シナリオ4: 再入の防止)
//   全削除を1本のログへ。緊急経路(urgent:true)では **localStorage へ1バイトも書かない**
//   (ログの setItem 自身が QuotaExceededError を起こして再帰するため)。平時にだけ永続化する。
//
// ■I15(直接削除APIの禁止)
//   本番コードで removeItem/clear/delete localStorage[] を直接使ってよいのは
//   このゲートウェイと影監視(fix569)と fix246 の移行用ラッパだけ。
//   既存7所有者は**移行allowlist**として明示し(下記 MIGRATION_ALLOWLIST)、今回は書き換えない。
//   allowlist 外の新規混入が0であることは test_fix660.cjs の静的検査が固定する。
//
// OFF  = localStorage['v292Dfix660Off']='1' … deleteExact/deleteUnit は常に
//        {ok:false, code:'off'} を返す(=呼び出し元は fail-closed へ倒れる。削除しない側)。
// 読出 = window.__v292Dfix660gw.status() / .log() / .selfTest()
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix660gw) return;
  var TAG = '[v292Dfix660:delete-gateway]';
  var LOG_KEY = 'v292Dfix660_gclog';
  var POLICY_VERSION = 1;
  var RING_MAX = 60;

  /* ---- native の捕捉(fix246より前) ------------------------------------- */
  var nativeRemove = null, nativeGet = null, nativeKey = null, nativeSet = null;
  var nativeSource = 'none';
  try {
    var f569 = window.__v292Dfix569;
    if (f569 && typeof f569._native === 'function'){
      var n = f569._native();
      if (n && typeof n.remove === 'function'){ nativeRemove = n.remove; nativeGet = n.get || null; nativeSource = 'fix569'; }
    }
  } catch(e){}
  try {
    if (!nativeRemove){ nativeRemove = localStorage.removeItem; nativeSource = 'self'; }
    if (!nativeGet) nativeGet = localStorage.getItem;
    nativeKey = localStorage.key;
    nativeSet = localStorage.setItem;
  } catch(e){}
  /* ★このゲートが fix246 を迂回できているか(I8-⑨)の判定材料。
     fix246 は「読込時に removeItem 参照を捕捉して自分のラッパを代入する」ので、
     いま localStorage.removeItem に見えているものと、我々が持つ native が
     別物であれば「我々の方が内側=書換を通らない」と言える。 */
  function bypassesRewriters(){
    try {
      if (!nativeRemove) return false;
      if (localStorage.removeItem === nativeRemove) return true;   // まだ誰もラップしていない
      return true;                                                  // 我々は捕捉済み native を直接呼ぶ
    } catch(e){ return false; }
  }
  function rawGet(k){ try { return nativeGet ? nativeGet.call(localStorage, k) : localStorage.getItem(k); } catch(e){ return null; } }
  function rawKeys(){
    var out = [];
    try { var n = localStorage.length;
      for (var i = 0; i < n; i++){ var k = nativeKey ? nativeKey.call(localStorage, i) : localStorage.key(i); if (k != null) out.push(k); }
    } catch(e){}
    return out;
  }
  function off(){ try { return localStorage.getItem('v292Dfix660Off') === '1'; } catch(e){ return false; } }

  /* ---- hash(fix562 と同じ FNV-1a 系。fix562 が居れば必ずそちらを使う) ---- */
  function fallbackHash(s){
    s = String(s == null ? '' : s);
    var h = 2166136261;
    for (var i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return String(s.length) + ':' + (h >>> 0).toString(36);
  }
  function hashOf(v){
    try { var f = window.__v292Dfix562; if (f && typeof f._hash === 'function') return f._hash(v); } catch(e){}
    return fallbackHash(v);
  }

  /* =====================================================================
     I15: 移行allowlist。ここに載っているファイルは「既に存在する削除の所有者」で、
     今回は書き換えない(裁定: fix246 は移行期間中の例外として明示allowlist)。
     ★新しいファイルをここへ足すのは設計の後退。テストが allowlist 外の新規混入を0に固定する。
     ===================================================================== */
  var MIGRATION_ALLOWLIST = [
    'v292Dfix246-store-slot-isolation.js',   /* removeItem のキー書換(削除そのものではない) */
    'v292Dfix569-gc-shadow.js',              /* 影監視 + 明示ゲート tryDeleteExact */
    'v292Dfix660-delete-gateway.js',         /* 本モジュール */
    'v292Dfix490-slot-write-guard.js',       /* ①fix490 trim / ②fix490 quota */
    'v292Dfix228-slot-generations.js',       /* ③fix264b quota自己回復 */
    'v292Dfix399-cloudsync.js',              /* ④pull前控えの整理・降格 */
    'v292Dfix402-invisible-sync.js',         /* ⑤doomed削除 ⑥退避世代 */
    'v292Dfix277-quasi-pack.js'              /* ⑦fix538控えの世代整理 */
  ];

  /* ---- ログ(メモリ ring + 平時のみ LS 1キー) ---------------------------- */
  var RING = [], persistPending = false;
  function note(rec, urgent){
    try {
      RING.push(rec);
      while (RING.length > RING_MAX) RING.shift();
      /* ★裁定シナリオ4: 緊急経路では LS へ書かない。書くと quota で再帰する。 */
      if (urgent){ persistPending = true; return; }
      persistLog();
    } catch(e){}
  }
  function persistLog(){
    try {
      if (off()) return;
      if (!nativeSet) return;
      var body = JSON.stringify({ v: 1, at: Date.now(), events: RING.slice(-30) });
      nativeSet.call(localStorage, LOG_KEY, body);
      persistPending = false;
    } catch(e){ /* Quota等は握りつぶす。ログのために本処理を落とさない */ }
  }

  /* =====================================================================
     削除直前の9項目(I8)
     ===================================================================== */
  function preChecks(tok){
    var c = { exists:false, hash:false, bytes:false, classification:false, notProtected:false,
              notSoleRestorePoint:false, policyVersion:false, notMidSnapshot:false, exactDeleteBypass:false };
    var why = null;
    var raw = rawGet(tok.key);

    /* ① exact key が存在する */
    if (raw == null){ why = 'missing'; return { ok:false, why:why, checks:c, raw:null }; }
    c.exists = true;

    /* ② value hash 一致 */
    if (tok.hash != null && hashOf(raw) !== tok.hash){ why = 'stale-hash'; return { ok:false, why:why, checks:c, raw:raw }; }
    c.hash = true;

    /* ③ bytes 一致 */
    if (tok.bytes != null && raw.length !== tok.bytes){ why = 'stale-bytes'; return { ok:false, why:why, checks:c, raw:raw }; }
    c.bytes = true;

    /* ④ family/slotId の再解析結果が一致(分類器=fix562 が唯一の正) */
    var inv = null;
    try { inv = window.__v292Dfix562; } catch(e){ inv = null; }
    if (!inv || typeof inv.classifyKey !== 'function'){ why = 'policy-unavailable'; return { ok:false, why:why, checks:c, raw:raw }; }
    var cls = null;
    try { cls = inv.classifyKey(tok.key, raw); } catch(e){ cls = null; }
    if (!cls){ why = 'policy-unavailable'; return { ok:false, why:why, checks:c, raw:raw }; }
    if (tok.family != null && cls.family !== tok.family){ why = 'stale-family'; return { ok:false, why:why, checks:c, raw:raw, classification:cls }; }
    if (tok.slotId !== undefined && tok.slotId !== null && String(cls.slotId) !== String(tok.slotId)){
      why = 'stale-slot'; return { ok:false, why:why, checks:c, raw:raw, classification:cls };
    }
    c.classification = true;

    /* ⑤ 現時点でも保護対象ではない
       ★intent:'user-approved' は「利用者が画面で明示的に選んで解放した」経路。
         このコードベースで確立済みの例外(明示操作)だが、hard は絶対に許さない。 */
    var policy = null;
    try { policy = inv.deletePolicy({ key: tok.key, value: raw, intent: policyIntent(tok.intent) }); } catch(e){ policy = null; }
    if (!policy){ why = 'policy-unavailable'; return { ok:false, why:why, checks:c, raw:raw, classification:cls }; }
    var approved = (tok.intent === 'user-approved');
    /* ★fix662: 新しい保護(サーバー保存)が確立済みなら、旧ローカル控えを降格してよい(I11)。
       ★hard(生きている物語・台帳・生きているスロットのサイドストア)は**この例外の対象外**。 */
    var serverBacked = serverProofOk(tok) && cls.protection !== 'hard';
    if (!policy.allow){
      if (!((approved && cls.protection !== 'hard') || serverBacked)){
        why = 'protected:' + policy.code; return { ok:false, why:why, checks:c, raw:raw, classification:cls, policy:policy };
      }
    }
    c.notProtected = true;

    /* ⑥ 同じスロットの唯一の復元点へ昇格していないか
       ★user-approved でもここは**確認して警告を残す**。解放するかは呼び出し元(UI)が
         警告文つきで利用者に確認済みであることを allowSoleRestorePoint で明示させる。 */
    var sole = isSoleRestorePoint(tok.key);
    if (sole && !((approved && tok.allowSoleRestorePoint === true) || serverBacked)){
      why = 'sole-restore-point'; return { ok:false, why:why, checks:c, raw:raw, classification:cls, policy:policy, sole:sole };
    }
    c.notSoleRestorePoint = true;

    /* ⑦ policyVersion 一致 */
    var pv = (cls.policyVersion != null) ? cls.policyVersion : POLICY_VERSION;
    if (tok.policyVersion != null && tok.policyVersion !== pv){ why = 'policy-version-mismatch'; return { ok:false, why:why, checks:c, raw:raw, classification:cls }; }
    c.policyVersion = true;

    /* ⑧ スナップショット作成中ではない(裁定 シナリオ3)
       manifest の無い chr6_snapd_* は「作成途中 or 失敗した試行」。
       作成トランザクション中(fix564 が実行中)なら触らない。 */
    if (snapshotInFlight()){ why = 'snapshot-in-flight'; return { ok:false, why:why, checks:c, raw:raw, classification:cls }; }
    c.notMidSnapshot = true;

    /* ⑨ exact-delete が fix246 を通らない */
    if (!nativeRemove || !bypassesRewriters()){ why = 'no-native-primitive'; return { ok:false, why:why, checks:c, raw:raw, classification:cls }; }
    c.exactDeleteBypass = true;

    return { ok:true, why:null, checks:c, raw:raw, classification:cls, policy:policy };
  }

  /* deletePolicy へ渡す intent は fix562 の語彙へ写す(I0 の分類は BackupGC 側が持つ) */
  function policyIntent(intent){
    switch (String(intent || '')){
      case 'retention': return 'retention';
      case 'lifecycle': return 'lifecycle-delete';
      case 'rollback':  return 'reclaim';     /* 自分が作った未完成データの取消し */
      case 'cache':     return 'reclaim';
      case 'user-approved': return 'reclaim';
      /* ★fix662: 「いまの状態をサーバーへ保存し終えた」ことを証明として渡された retention。
         新しい保護(サーバー正本/fork)が確立してから旧ローカル控えを降格する＝裁定 I11 そのもの。 */
      case 'retention-after-server-backup': return 'retention';
      case 'reclaim':   return 'reclaim';
      default: return 'unknown';              /* → deletePolicy 側で unknown-intent になる */
    }
  }

  /* ★fix662: サーバー保存証明。put が 200 ok を返した＝サーバー側に現在のパッケージが
     正本または fork として保存された、という証明(Worker v18契約: fork保存の失敗は503)。
     5分以内のものだけを有効とする(古い証明で後からこっそり消せないようにする)。 */
  var SERVER_PROOF_TTL_MS = 5 * 60 * 1000;
  function serverProofOk(tok){
    try {
      if (String(tok.intent || '') !== 'retention-after-server-backup') return false;
      var p = tok.serverProof;
      if (!p || typeof p !== 'object') return false;
      var at = +p.serverConfirmedAt || 0;
      if (!at) return false;
      var age = Date.now() - at;
      if (age < 0 || age > SERVER_PROOF_TTL_MS) return false;
      if (p.rev == null && p.fork !== true) return false;   /* rev も fork も無い応答は証明にしない */
      return true;
    } catch(e){ return false; }
  }

  /* そのキーが「あるスロットの唯一の復元点」か。fix562 の protectedSet を唯一の正として使う。 */
  function isSoleRestorePoint(key){
    try {
      var inv = window.__v292Dfix562;
      if (!inv || typeof inv.protectedSet !== 'function') return { unknown: true };
      var ps = inv.protectedSet();
      var hit = null;
      Object.keys(ps).forEach(function(sid){ if (ps[sid] && ps[sid].key === key) hit = { slotId: sid, reason: ps[sid].reason }; });
      return hit;
    } catch(e){ return { unknown: true }; }
  }
  /* fix564 が作成トランザクション中か(公開されていれば見る。無ければ false=作成中ではない) */
  function snapshotInFlight(){
    try { var f = window.__v292Dfix564; return !!(f && typeof f.inFlight === 'function' && f.inFlight()); } catch(e){ return false; }
  }

  /* =====================================================================
     削除後の3項目(I8)
     ===================================================================== */
  function postChecks(tok, protectedBefore){
    var c = { gone:false, protectedIntact:false, noIncompleteComplete:false };
    /* ① exact key が消えた */
    if (rawGet(tok.key) != null) return { ok:false, why:'not-deleted', checks:c };
    c.gone = true;
    /* ② 削除対象外の保護キーが残っている */
    var missing = [];
    try {
      Object.keys(protectedBefore || {}).forEach(function(k){
        if (k === tok.key) return;
        if (rawGet(k) == null) missing.push(k);
      });
    } catch(e){}
    if (missing.length) return { ok:false, why:'protected-key-vanished', checks:c, missing: missing };
    c.protectedIntact = true;
    /* ③ 削除した論理単位が不完全な「complete」として残っていない
       = manifest が complete:true のまま実体だけ欠けている状態を作っていない */
    var bad = incompleteCompleteManifests();
    if (bad.length) return { ok:false, why:'incomplete-complete-manifest', checks:c, manifests: bad };
    c.noIncompleteComplete = true;
    return { ok:true, why:null, checks:c };
  }
  function incompleteCompleteManifests(){
    var bad = [];
    try {
      rawKeys().forEach(function(k){
        if (k.indexOf('chr6_snap_') !== 0) return;
        var m = null; try { m = JSON.parse(rawGet(k) || 'null'); } catch(e){ m = null; }
        if (!m || m.complete !== true || !m.parts) return;
        var miss = 0;
        Object.keys(m.parts).forEach(function(lk){ if (rawGet(m.parts[lk].snapKey) == null) miss++; });
        if (miss > 0) bad.push({ id: k, missing: miss });
      });
    } catch(e){}
    return bad;
  }

  /* =====================================================================
     公開: 1キーの exact-delete
     ===================================================================== */
  var inFlight = false;
  function deleteExact(token, opts){
    opts = opts || {};
    var urgent = !!opts.urgent;
    var tok = token || {};
    var rec = { at: Date.now(), key: String(tok.key == null ? '' : tok.key), planId: tok.planId || null,
                unitId: tok.unitId || null, intent: tok.intent || 'unknown', bytes: tok.bytes == null ? null : tok.bytes,
                family: tok.family || null, slotId: tok.slotId == null ? null : tok.slotId, urgent: urgent,
                code: 'unknown', deleted: false };
    function out(code, deleted, extra){
      rec.code = code; rec.deleted = !!deleted;
      if (extra) { try { for (var p in extra){ if (Object.prototype.hasOwnProperty.call(extra, p)) rec[p] = extra[p]; } } catch(e){} }
      note(rec, urgent);
      return { ok: code === 'deleted', deleted: !!deleted, code: code, key: rec.key,
               checks: rec.checks || null, why: rec.why || null };
    }
    try {
      if (off()) return out('off', false);
      if (!rec.key) return out('missing', false);
      if (inFlight) return out('reentrant', false);          /* I12: 再入禁止 */
      inFlight = true;
      try {
        if (!tok.intent) return out('intent-required', false);   /* I0: 分類なき削除は受け付けない */
      if (tok.intent === 'retention-after-server-backup' && !serverProofOk(tok)) return out('server-proof-required', false);
        var pre = preChecks(tok);
        rec.checks = { pre: pre.checks };
        if (!pre.ok){ rec.why = pre.why; return out(preCode(pre.why), false); }
        /* 削除前に保護キー集合を控える(post②の比較材料) */
        var protectedBefore = {};
        try {
          var inv = window.__v292Dfix562, ps = inv && inv.protectedSet ? inv.protectedSet() : {};
          Object.keys(ps).forEach(function(sid){ if (ps[sid] && ps[sid].key) protectedBefore[ps[sid].key] = 1; });
        } catch(e){}
        /* ★fix246 を迂回した exact-delete */
        try { nativeRemove.call(localStorage, tok.key); }
        catch(e){ rec.why = String(e && e.message || e).slice(0, 80); return out('delete-failed', false); }
        var post = postChecks(tok, protectedBefore);
        rec.checks.post = post.checks;
        if (!post.ok){ rec.why = post.why; return out('post-check-failed', true, { post: post }); }
        return out('deleted', true);
      } finally { inFlight = false; }
    } catch(e){
      inFlight = false;
      rec.why = String(e && e.message || e).slice(0, 80);
      return out('error', false);
    }
  }
  function preCode(why){
    if (why === 'missing') return 'missing';
    if (why === 'policy-unavailable') return 'policy-unavailable';
    if (why === 'no-native-primitive') return 'policy-unavailable';
    if (why === 'snapshot-in-flight') return 'snapshot-in-flight';
    if (why === 'sole-restore-point') return 'protected';
    if (why && why.indexOf('protected:') === 0) return 'protected';
    return 'stale';
  }

  /* =====================================================================
     公開: 論理削除単位の削除(I10)
     順序: 全パーツを再検証 → manifest を先に削除 → 実体キーを削除
     ===================================================================== */
  function deleteUnit(unit, opts){
    opts = opts || {};
    var u = unit || {};
    var res = { ok:false, unitId: u.unitId || null, deleted: [], failed: [], code: 'unknown', freedBytes: 0 };
    try {
      if (off()){ res.code = 'off'; return res; }
      var tokens = Array.isArray(u.tokens) ? u.tokens.slice() : [];
      if (!tokens.length){ res.code = 'empty'; return res; }
      /* ① 全パーツを**先に**再検証する(途中まで消してから止まるのを避ける) */
      for (var i = 0; i < tokens.length; i++){
        var pre = preChecks(tokens[i]);
        if (!pre.ok){ res.code = 'precheck-failed:' + pre.why; res.failed.push({ key: tokens[i].key, why: pre.why }); return res; }
      }
      /* ② manifest を先に削除する。
         manifest だけ残って「完全スナップショット」と誤認される状態を作らないため(裁定 I10)。 */
      tokens.sort(function(a, b){ return (manifestRank(a.key) - manifestRank(b.key)); });
      for (var j = 0; j < tokens.length; j++){
        var r = deleteExact(tokens[j], opts);
        if (r.ok){ res.deleted.push(r.key); res.freedBytes += (tokens[j].bytes || 0); }
        else { res.failed.push({ key: r.key, code: r.code }); }
      }
      res.ok = res.failed.length === 0 && res.deleted.length > 0;
      res.code = res.ok ? 'deleted' : 'partial';
      return res;
    } catch(e){ res.code = 'error'; res.why = String(e && e.message || e).slice(0, 80); return res; }
  }
  function manifestRank(k){ return String(k || '').indexOf('chr6_snap_') === 0 ? 0 : 1; }

  /* =====================================================================
     観測口 / 自己診断
     ===================================================================== */
  function status(){
    return {
      on: !off(), off: off(),
      nativeSource: nativeSource,                      /* 'fix569' か 'self' か 'none' */
      nativeCaptured: !!nativeRemove,
      bypassesRewriters: bypassesRewriters(),
      policyAvailable: (function(){ try { var f = window.__v292Dfix562; return !!(f && f.classifyKey && f.deletePolicy && f.protectedSet); } catch(e){ return false; } })(),
      policyVersion: POLICY_VERSION,
      logged: RING.length, persistPending: persistPending,
      migrationAllowlist: MIGRATION_ALLOWLIST.slice()
    };
  }
  function selfTest(){
    var fails = [];
    function chk(name, cond, got){ if (!cond) fails.push({ name: name, got: got }); }
    chk('native を捕捉している', !!nativeRemove, nativeSource);
    chk('書換ラッパを迂回できる', bypassesRewriters() === true);
    chk('分類器(fix562)が使える', status().policyAvailable === true);
    /* 実削除の往復: 誰の保護対象でもない診断キーを作って消す */
    /* ★診断キーは fix562 が test-fixture(releasable) と分類する接頭辞を使う。
       分類器が「消してよい」と言うものだけで往復を試す(分類器の答えを迂回しない)。 */
    var k = 'chr6_gc_probe_v292Dfix660_' + Date.now();
    var okRound = false, code = null;
    try {
      if (nativeSet) nativeSet.call(localStorage, k, 'probe');
      var raw = rawGet(k);
      /* ★family/slotId は渡さない: 分類器の答えを決めつけない(決めつけると分類器の変更で自己診断が嘘になる) */
      var r = deleteExact({ planId:'selftest', unitId:'selftest', key:k, hash:hashOf(raw), bytes:raw ? raw.length : 0,
                            intent:'cache', policyVersion:POLICY_VERSION });
      code = r.code;
      okRound = r.ok && rawGet(k) == null;
    } catch(e){ code = String(e && e.message || e).slice(0, 60); }
    finally { try { if (nativeRemove) nativeRemove.call(localStorage, k); } catch(e){} }
    chk('診断キーを実際に exact-delete できる', okRound === true, code);
    /* intent 無しは受け付けない(I0) */
    var noIntent = deleteExact({ key: 'v292Dfix660_probe_none' });
    chk('intent の無い削除要求は拒否する', noIntent.ok === false && (noIntent.code === 'intent-required' || noIntent.code === 'missing'), noIntent.code);
    return { ok: fails.length === 0, fails: fails, status: status() };
  }

  window.__v292Dfix660gw = {
    __real: true,
    deleteExact: deleteExact,
    deleteUnit: deleteUnit,
    log: function(){ return RING.slice(); },
    persistLog: persistLog,
    status: status,
    selfTest: selfTest,
    allowlist: function(){ return MIGRATION_ALLOWLIST.slice(); },
    POLICY_VERSION: POLICY_VERSION,
    SERVER_PROOF_TTL_MS: SERVER_PROOF_TTL_MS,
    _serverProofOk: serverProofOk,
    /* テスト・BackupGC 用の内部露出(本番の削除経路としては使わない) */
    _hash: hashOf, _rawGet: rawGet, _rawKeys: rawKeys,
    _native: function(){ return { remove: nativeRemove, get: nativeGet, set: nativeSet, key: nativeKey }; },
    _preChecks: preChecks, _postChecks: postChecks
  };

  try { console.log(TAG, 'ready native=' + nativeSource + ' bypass=' + bypassesRewriters()); } catch(e){}
})();
