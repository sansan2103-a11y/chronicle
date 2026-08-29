// =====================================================================
// Chronicle v292Dfix587: StoryLifecycleService（物語削除の正規サービス）
// ---------------------------------------------------------------------
// ★これが「削除の唯一の正しい手順」。UIは意思表示を受け取るだけで、認可はここが出す。
//   GPT裁定「confirmは認可ではない。UIの意思表示を受け、StoryLifecycleServiceが
//            検証済み計画を発行する二段方式」
//
// ■なぜ必要か（実コードの棚卸しで判明した3つの欠陥）
//   ①削除の入口が3系統あり、消す範囲がバラバラだった（fix577で入口は塞いだ）
//   ②**tombstone(墓標)が無い**ので、削除がクラウドへ伝わらず次のpullで復活していた
//   ③削除前の退避が本体1キーだけで、サイドストア（12家族）が戻せなかった
//
// ■削除の順序（GPT指定・この順でなければならない）
//   ①現在のスロットを再読込          … confirm後に状態が変わっている可能性がある
//   ②本体＋サイドストアの exact key と hash を確定
//   ③fix564 で完全スナップショットを作成（新しい退避方式は作らない）
//   ④全パーツを read-back・hash一致・complete を確認
//   ⑤meta に tombstone を保存
//   ⑥tombstone をクラウドへ push し、**反映を確認**
//   ⑦DeleteGateway へ物理削除計画を渡す
//   ⑧本体＋サイドストアを exact-delete
//   ⑨一覧から非表示
//   ★**物理削除より先に tombstone をクラウドへ確定させる**のが要。
//     逆順だと「消したのに、クラウドの古い本体が次のpullで戻ってくる」を作る。
//
// ■オフライン／push失敗時（GPT指定）
//   tombstoneをローカルに保存 → 一覧からは非表示 → **物理削除は保留** →
//   再接続後にpush成功 → その後で物理削除。
//   つまり一時的に「容量は空かないが、消えたように見える」状態になる。
//   クラウドへ削除が伝わらない状態で実データを消すより安全。
//
// ■このfixが絶対にやらないこと
//   自分で localStorage.removeItem を呼ぶこと。物理削除は**必ず** fix569 の
//   exact-delete ゲート経由（削除の所有者を増やさない・第0段の趣旨）。
//
// 冪等: window.__chronicleStoryLifecycle / OFF: localStorage.v292Dfix587Off='1'
// =====================================================================
(function(){
  'use strict';
  if (window.__chronicleStoryLifecycle) return;
  var TAG = '[v292Dfix587:story-lifecycle]';
  var LIFECYCLE_VERSION = 1;

  function off(){ try { return localStorage.getItem('v292Dfix587Off') === '1'; } catch(e){ return false; } }
  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function lss(k, v){ try { localStorage.setItem(k, String(v)); return true; } catch(e){ return false; } }

  /* 記録はメモリを正本にする（容量満杯でも理由が消えないように・fix575で踏んだ型） */
  var LOG = [], LOG_MAX = 30;
  var stats = { requested: 0, completed: 0, pending: 0, refused: 0, physicalDeleted: 0, gateRefused: 0,
                /* ★fix588(GPT裁定 B/C/D): 異常系を推測で進めなかった回数を数える */
                malformedTombstones: 0, resumeRefused: 0, resumeBlocked: 0, classifierUnavailable: 0,
                /* ★fix589: 墓標をクラウドへ確定できなかった回数（理由は lastPushWhy / log に残す） */
                pushFailures: 0, autoResumeArmed: 0, autoResumeGaveUp: 0,
                /* 送信側で墓標スロットを除外できなかった回数（fix402/fix399 が報告する） */
                tombstonePayloadFilterUnavailable: 0,
                /* ★★fix595(GPT裁定): fix594 で「もう無いキー」を成功扱いにしたので、
                   physicalDeleted だけを見ると「実際に消した」のか「元から無かった」のか区別できない。
                   端末間試験でこの2つを混ぜると、削除が効いているのか、単に空振りしているのかが分からなくなる。
                   → **実在した計画キーを消した回数** と **既に無かった計画キーの回数** を分けて数える。 */
                gatewayPhysicalDeletes: 0, alreadyMissingPlannedKeys: 0,
                /* ★★fix602: 「なぜ片づかないのか」を総数ではなく**分類ごと**に数える。
                   2026-07-27 の実機で 16件中6件が gateRefused のまま残ったが、
                   `gateRefused` は総数だけだったので、stale なのか protected なのか
                   policy-unavailable なのかが**再読込した時点で分からなくなっていた**
                   （理由はメモリ上の LOG にしか無かった）。また「無言の失敗」。
                   → code 別カウンタと、理由の永続化(v292Dfix587_refusals)を足す。 */
                gateRefusedByCode: {}, blockedPlans: 0, blockedByReason: {},
                /* ★★fix708(STEP3F): shadow delete protocol の計数。
                   「墓標は立ったのにサーバは live のまま」を数えられるようにする。 */
                sdAttempts: 0, sdServerTombstoned: 0, sdAlreadyDeleted: 0, sdAlreadyAbsent: 0,
                sdHeld: 0, sdBaseConflict: 0, sdCanonicalUnsupported: 0, sdNoBaseHash: 0,
                sdContractUnavailable: 0, sdBaseHashCaptured: 0, sdBaseHashFailed: 0,
                sdLegacyPushAttempts: 0, sdLegacyPushOk: 0, sdLegacyPushDeferred: 0,
                sdTerminalHolds: 0, sdResumeSkippedTerminal: 0,
                /* ★★fix711: 移行期の 404（story_shadow に row が無いだけ）を legacy 経路へ戻した回数 */
                sd404LegacyRequired: 0, sd404LegacyCompleted: 0,
                /* ★★fix710: 呼び出し側の planId 絞り込みで resume 対象外にした件数 */
                sdResumeFilteredOut: 0, sdResumeInvalidFilter: 0,
                /* ★★fix720(STEP4D/RULING28): canonical delete protocol の計数（shadow 系と分離） */
                dcAttempts: 0, dcServerTombstoned: 0, dcAlreadyDeleted: 0, dcBaseConflict: 0,
                dcAmbiguous: 0, dcConfirmedByReadback: 0, sdAuthorityUnsupported: 0 };
  function bumpCode(map, code){
    try { var k = String(code || 'unknown'); map[k] = (map[k] || 0) + 1; } catch(e){}
  }
  function note(rec){ try { rec.at = Date.now(); LOG.push(rec); if (LOG.length > LOG_MAX) LOG.shift(); } catch(e){} }

  /* ---- 依存（どれか欠けたら削除しない = fail-closed） -------------------- */
  function dep(){
    var d = {};
    try { d.tomb = window.__v292Dfix579; } catch(e){}
    try { d.snap = window.__v292Dfix564; } catch(e){}
    try { d.gate = window.__v292Dfix569; } catch(e){}
    try { d.inv  = window.__v292Dfix562; } catch(e){}
    try { d.sync = window.__v292Dfix399x; } catch(e){}
    return d;
  }
  function missingDeps(d){
    var m = [];
    if (!d.tomb || typeof d.tomb.make !== 'function') m.push('fix579(墓標)');
    if (!d.snap || typeof d.snap.create !== 'function') m.push('fix564(スナップショット)');
    if (!d.gate || typeof d.gate.tryDeleteExact !== 'function') m.push('fix569(削除ゲート)');
    if (!d.inv  || typeof d.inv.sideStoreKeys !== 'function') m.push('fix562(分類器)');
    return m;
  }

  /* ---- meta の読み書き -------------------------------------------------- */
  function readMeta(){
    try { var a = JSON.parse(lsg('chr6_slots_meta') || '[]'); return Array.isArray(a) ? a : []; }
    catch(e){ return []; }
  }
  function writeMeta(a){ return lss('chr6_slots_meta', JSON.stringify(a)); }

  /* ---- ② exact key 一覧と hash ------------------------------------------ */
  function planKeys(slotId, d){
    var body = 'chr6_slot_' + slotId;
    var keys = [body];
    try { (d.inv.sideStoreKeys(slotId) || []).forEach(function(k){ if (keys.indexOf(k) < 0) keys.push(k); }); } catch(e){}
    var out = [], hashOf = (d.inv && d.inv._hash) ? d.inv._hash : null;
    keys.forEach(function(k){
      var v = lsg(k);
      if (v == null) return;                 /* 無いものは計画に載せない */
      out.push({ key: k, bytes: v.length, hash: hashOf ? hashOf(v) : null });
    });
    return out;
  }

  /* ---- ⑥ tombstone をクラウドへ確定させる ------------------------------- */
  /* 戻り: Promise<boolean>。true = クラウドへ反映できた
   * ★fix589: **失敗の理由を必ず残す**。
   *   実機テストで「オフライン」と表示されたが、真因は **fix399 の空ガード**だった
   *   （0ターンのスロットを開いた状態で push を呼ぶと EMPTY_LOCAL_GUARD で弾かれる）。
   *   理由を区別しないと、次に同じことが起きたとき原因が追えない。 */
  var lastPushWhy = null;
  function whyOf(e){
    try {
      if (!e) return 'unknown';
      if (e.emptyGuard) return 'empty-local-guard(0ターンのスロットを開いている)';
      if (e.conflict) return 'conflict(サーバが新しい)';
      var m = String(e.message || e);
      if (m.indexOf('ログイン') >= 0) return 'not-logged-in';
      if (m.indexOf('同期中') >= 0) return 'busy(別のpushが進行中)';
      return m.slice(0, 40);
    } catch(_){ return 'unknown'; }
  }
  function pushTombstone(d){
    return new Promise(function(res){
      try {
        if (!d.sync || typeof d.sync.push !== 'function'){
          lastPushWhy = 'sync-missing(このページにfix399が無い)'; stats.pushFailures++; res(false); return;
        }
        var p = d.sync.push();
        if (!p || typeof p.then !== 'function'){
          lastPushWhy = 'push-not-promise'; stats.pushFailures++; res(false); return;
        }
        p.then(function(){ lastPushWhy = null; res(true); },
               function(e){ lastPushWhy = whyOf(e); stats.pushFailures++;
                            note({ act:'push-failed', why: lastPushWhy }); res(false); });
      } catch(e){ lastPushWhy = whyOf(e); stats.pushFailures++; res(false); }
    });
  }

  // ===================================================================
  // ★★fix708(STEP3F): SHADOW DELETE PROTOCOL（クライアント側）
  // -------------------------------------------------------------------
  // 直した問題（HIGH / CONFIRMED）:
  //   DELETE_COMPLETION_COUPLED_TO_LEGACY_PKG_PUSH
  //     削除の確定が **legacy 全体パッケージ push** に結線されていたため、
  //     fix590 の commit ledger が needs-pull になっているだけで
  //     `RESOLUTION_REQUIRED` → push 失敗 → 物理削除が永久保留になっていた。
  //     ＝ LOCAL_TOMBSTONE_WITH_LIVE_BODY / DELETE_TRANSACTION_STALLED_AFTER_TOMBSTONE。
  //
  // 新しい順序（GPT裁定 E5・この順でなければならない）:
  //   (1) **live のうちに** canonical hash を確定（fix697 の契約のみ。独自 serializer 禁止）
  //   (2) snapshot + verify（既存）
  //   (3) 墓標（既存）
  //   (4) pending 計画へ storyId / deleteOpId / recoverySnapshotId / localDeleteBaseHash を載せる
  //   (5) サーバ削除段は **legacy pkg push を要求しない**。fresh getstory から始める
  //   (6) shadow live なら「今の serverHash === 保存した localDeleteBaseHash」を必須にし、
  //       一致したときだけ **fresh な rev/hash** で deleteshadow の CAS を撃つ
  //   (7) ★fix711: 404 は SHADOW_ROW_MISSING_LEGACY_REQUIRED。移行期は「クラウドに無い」と
  //       断定しない（story_shadow に row が無いだけ）。サーバに墓標行は作らず、legacy 経路へ戻し、
  //       legacy pkg 墓標 push が成功したときだけ物理削除する
  //   (8) deleted=true → CLOUD_ALREADY_DELETED → 物理削除可
  //   (9) authority=canonical → DELETE_CANONICAL_UNSUPPORTED → 止まる
  //  (10) deleteshadow 成功後にだけ fix660 ゲート経由の物理削除
  //  (11) legacy pkg push は **後追いの best-effort**。失敗しても削除は巻き戻さない
  //
  // ★fix734(RULING100 §Q3) COMMENT_ONLY / BEHAVIOR DELTA 0:
  //   実装は fix712 で既定 ON へ反転済み（sdOn() は v292Dfix708Off==='1' のときだけ OFF。
  //   v292Dfix708On は読んでいない）。旧コメント「既定 OFF」は stale だったので実装に合わせる。
  // 既定 ON（v292Dfix708Off==='1' のときだけ従来経路）。
  // OFF のときは 1 バイトも挙動が変わらない（従来の finishLegacy をそのまま通る）。
  // ===================================================================
  var SHADOW_DELETE_PROTOCOL_VERSION = 1;
  /* ★★fix708(GPT裁定 Q3): 「あとで再試行すれば直るもの」と「再送しても永久に直らないもの」を分ける。
     network 障害 = pending（従来どおり再試行可）。
     hash / authority の不一致 = **terminal**。何回 deleteshadow を撃っても成立しないので、
     自動 retry の対象から外す。ただし既存 moveToBlocked は dropPending() するため
     plan / snapshot / deleteOpId / localDeleteBaseHash を失う。裁定の指定どおり
     「pending payload は保持 ＋ terminal flag ＋ autoResume skip」とし、
     可視化のためだけに **既存の** blocked ledger へ 1 行足す（新しい ledger は作らない）。 */
  var SD_TERMINAL_VERDICTS = { DELETE_BASE_CONFLICT: 1, DELETE_CANONICAL_UNSUPPORTED: 1, DELETE_AUTHORITY_UNSUPPORTED: 1 };
  function sdTerminalReason(verdict){
    return (verdict === 'DELETE_BASE_CONFLICT') ? 'blocked-delete-base-conflict'
         : (verdict === 'DELETE_CANONICAL_UNSUPPORTED') ? 'blocked-delete-canonical-unsupported'
         : (verdict === 'DELETE_AUTHORITY_UNSUPPORTED') ? 'blocked-delete-authority-unsupported'
         : null;
  }
  /* ★dropPending しない版の blocked 記録。payload は pending 側に残したままにする。 */
  function recordBlockedKeepingPending(plan, reason){
    try {
      var a = readBlocked().filter(function(x){ return x && x.planId !== plan.planId; });
      a.push({ planId: plan.planId, slotId: plan.slotId, deleteOpId: plan.deleteOpId,
               at: Date.now(), blockedReason: String(reason),
               attempts: (+plan.attempts || 0), keys: [],
               payloadRetainedInPending: true });
      lss(BLOCKED_KEY, JSON.stringify(a.slice(-BLOCKED_MAX)));
      stats.blockedPlans = readBlocked().length;
      bumpCode(stats.blockedByReason, reason);
    } catch(e){}
  }
  /* autoResume / resumePending が拾ってよい計画だけを返す。 */
  function resumablePending(){
    return readPending().filter(function(p){ return !(p && p.sdTerminal === true); });
  }
  /* ★★fix712(GPT裁定 DEFAULT ON CUT): 既定を反転する。
     旧: DEFAULT OFF ＋ v292Dfix708On='1' で ON
     新: DEFAULT ON  ＋ v292Dfix708Off='1' で OFF（最優先の kill switch）
     ・v292Dfix708Off === '1' → 必ず OFF（v292Dfix708On='1' が残っていても OFF）
     ・それ以外（Off が無い / Off が別の値）→ ON
     ・旧 v292Dfix708On は **読まない** が、localStorage からの削除・cleanup もしない（互換のため残置）。
     ・localStorage の読取りが throw したときは **OFF**（kill switch 判定不能 → fail closed）。
     ★ここで変えるのは既定値の意味だけ。削除トランザクション本体・404 契約・fix710 の
       eligibility は 1バイトも変えていない。 */
  function sdOn(){
    /* ★★fix712(GPT裁定 追補): localStorage の読取り自体が throw した場合は **OFF**。
       default ON は「通常状態の既定値」であって、緊急停止スイッチ(v292Dfix708Off)の状態すら
       判定できない異常時まで削除トランザクションを ON にする意味ではない。→ fail closed。 */
    /* ★lsg() は例外を握り潰して null を返すので、ここでは **localStorage を直接読む**。
       そうしないと「読めなかった」と「Off が無い」を区別できず fail closed にならない。 */
    try { return localStorage.getItem('v292Dfix708Off') !== '1'; }
    catch(e){ return false; }
  }
  /* canonical hash 契約と shadow transport の owner は fix697 だけ。ここでは作らない。 */
  function contract(){
    var W = null;
    try { W = window.__v292Dfix697; } catch(e){ W = null; }
    if (!W) return null;
    if (typeof W.contentHashOf !== 'function') return null;
    if (typeof W.shadowRequest !== 'function') return null;
    return W;
  }
  /* ★live のうちに canonical hash を取る。取れなければ **null のまま先へ進み**、
     サーバ削除段で fail-closed にする（推測した hash で CAS を撃たない）。 */
  function captureDeleteBaseHash(storyId, cb){
    var W = contract();
    if (!W){ stats.sdContractUnavailable++; cb(null, 'CONTRACT_UNAVAILABLE'); return; }
    var done = false, t = null;
    function fin(h, why){
      if (done) return; done = true;
      if (t) { try { clearTimeout(t); } catch(e){} }
      if (h) stats.sdBaseHashCaptured++; else stats.sdBaseHashFailed++;
      cb(h || null, h ? null : (why || 'HASH_FAILED'));
    }
    try { t = setTimeout(function(){ fin(null, 'HASH_TIMEOUT'); }, 5000); } catch(e){}
    try { W.contentHashOf(String(storyId), function(h, why){ fin(h, why); }); }
    catch(e){ fin(null, 'HASH_THREW'); }
  }
  /* legacy 全体パッケージ push は **後追い**。成否は削除トランザクションに影響させない。 */
  function bestEffortLegacyPush(plan, d){
    try {
      stats.sdLegacyPushAttempts++;
      pushTombstone(d).then(function(pushed){
        if (pushed){ stats.sdLegacyPushOk++; return; }
        stats.sdLegacyPushDeferred++;
        note({ act:'legacy-push-deferred', slotId: plan.slotId, deleteOpId: plan.deleteOpId,
               why: lastPushWhy,
               detail:'削除は確定済み。legacy pkg push は後追いなので巻き戻さない' });
      }, function(){ stats.sdLegacyPushDeferred++; });
    } catch(e){}
  }

  /* ---- ⑦⑧ 物理削除（必ずゲート経由） ------------------------------------ */
  /* ★★fix735(RULING109 §4 / R110 最優先2): LDR server proof は **永続化しない**。
     ・plan オブジェクトへ書かない（= v292Dfix587_pending へ絶対に載らない）
     ・runtime memory だけで保持し、削除トランザクションが終わったら必ず捨てる
     ・reload すると必ず消えるので、「昔の proof で今の hard delete を通す」ことはできない
     ・fresh proof が無ければ hard delete は policy 側で DENY（fail closed）
     ★意図的に localStorage/sessionStorage/IndexedDB を一切使わない。 */
  var LDR_EXEC_PROOF = null;                      /* { planId, slotId, proof } | null */
  function setLdrExecProof(planId, slotId, proof){
    if (!planId || !proof || typeof proof !== 'object'){ LDR_EXEC_PROOF = null; return false; }
    LDR_EXEC_PROOF = { planId: String(planId), slotId: String(slotId), proof: proof };
    return true;
  }
  function clearLdrExecProof(){ LDR_EXEC_PROOF = null; }
  function ldrExecProofFor(plan){
    var h = LDR_EXEC_PROOF;
    if (!h || !plan) return null;
    if (h.planId !== String(plan.planId)) return null;      /* 別計画の proof は使わせない */
    if (h.slotId !== String(plan.slotId)) return null;      /* 別スロットの proof は使わせない */
    return h.proof;
  }

  /* ★★fix735: hard データの物理削除に対する policy guard。
     判定だけを返し、ここでは何も消さない・何も書かない。
     ・非 hard（releasable 等）は従来どおり gate 判断に委ねる（ok:true を返して素通し）
     ・hard は fix562.deletePolicy が allow を返したときだけ ok:true
     ・serverProof は **runtime holder からのみ** 取る。plan に埋まっている
       ldrServerProof は（過去バージョンや外部書換で存在しても）**絶対に使わない**。 */
  function policyVerdictForKey(it, plan, d){
    var inv = d && d.inv;
    if (!inv || typeof inv.classifyKey !== 'function' || typeof inv.deletePolicy !== 'function'){
      return { ok:false, code:'policy-unavailable', why:'fix562 の classifyKey/deletePolicy が無い' };
    }
    var raw = lsg(it.key);
    var cls = null;
    try { cls = inv.classifyKey(it.key, raw); } catch(e){ cls = null; }
    if (!cls) return { ok:false, code:'policy-unavailable', why:'classifyKey が判定できない' };
    if (cls.protection !== 'hard') return { ok:true, code:'not-hard', why:null, binding:null };
    var pol = null;
    try {
      pol = inv.deletePolicy({ key: it.key, value: raw, intent: 'lifecycle-delete',
                               verifiedPlan: plan,
                               serverProof: ldrExecProofFor(plan) });
    } catch(e){ pol = null; }
    if (!pol) return { ok:false, code:'policy-unavailable', why:'deletePolicy が例外' };
    if (typeof pol !== 'object') return { ok:false, code:'policy-unavailable', why:'deletePolicy の戻りが不正' };
    if (pol.allow !== true)
      return { ok:false, code:'policy-denied', why:String(pol.code || 'denied') + (pol.ldrWhy ? ('/' + pol.ldrWhy) : '') };
    return { ok:true, code:String(pol.code || 'allow'), why:null, binding: pol.binding || null };
  }

  /* ★★fix735(R110 最優先4): TOCTOU 再検証。
     policy が allow を返した「その瞬間の同一性」と、**gate を呼ぶ直前の現物**が
     完全に一致するときだけ通す。新しい永続 hash 権威は作らない（binding は揮発値）。 */
  function bindingStillValid(it, plan, d, binding){
    if (!binding || typeof binding !== 'object') return 'binding-missing';
    if (binding.key !== it.key) return 'binding-key-mismatch';
    if (String(binding.slotId) !== String(plan.slotId)) return 'binding-slot-mismatch';
    if (binding.planId !== plan.planId) return 'binding-planid-mismatch';
    if (binding.deleteOpId !== plan.deleteOpId) return 'binding-deleteopid-mismatch';
    if (binding.snapshotId !== plan.snapshotId) return 'binding-snapshotid-mismatch';
    if (plan.sdTerminal !== true) return 'binding-plan-not-terminal';
    if (binding.sdResolution !== plan.sdResolution) return 'binding-resolution-mismatch';
    if (binding.resolutionDeleteOpId !== plan.resolutionDeleteOpId) return 'binding-resolution-opid-mismatch';
    if (binding.resolvedServerRev !== plan.resolvedServerRev) return 'binding-serverrev-mismatch';
    if (it.bytes != null && binding.bytes !== it.bytes) return 'binding-planbytes-mismatch';
    if (it.hash != null && binding.hash !== it.hash) return 'binding-planhash-mismatch';
    var now = lsg(it.key);
    if (now == null) return 'binding-value-vanished';
    if (now.length !== binding.bytes) return 'binding-bytes-changed';
    var hashOf = (d.inv && d.inv._hash) ? d.inv._hash : null;
    if (typeof hashOf !== 'function') return 'binding-hash-unavailable';
    var h = null;
    try { h = hashOf(now); } catch(e){ return 'binding-hash-threw'; }
    if (h !== binding.hash) return 'binding-hash-changed';
    return null;
  }

  /* ★★fix736(RULING111-A): LDR terminal cleanup の実行スコープ。
     ・module scope の揮発変数のみ。localStorage 等へは一切書かない
     ・公開 API から直接立てられない（ldrCleanupOnce の内部でのみ set される）
     ・physicalPhase が成功しても dropPending を発火させないのは、この scope が
       立っていて **かつ** LDR terminal predicate を満たす plan のときだけ
     ・単なる boolean では止めない。predicate は毎回 plan を見て評価する */
  var LDR_CLEANUP_SCOPE = null;      /* { planId, slotId, authorityAt } | null */
  function ldrCleanupScopeFor(plan){
    var s = LDR_CLEANUP_SCOPE;
    if (!s || !plan) return null;
    if (s.planId !== String(plan.planId)) return null;
    if (s.slotId !== String(plan.slotId)) return null;
    return s;
  }
  /* exact LDR terminal plan であることの述語。ここを緩めない。 */
  function isLdrTerminalPlan(plan){
    if (!plan || typeof plan !== 'object') return false;
    if (plan.sdTerminal !== true) return false;
    if (plan.sdResolution !== 'SERVER_TOMBSTONED_BY_LDR') return false;
    if (!plan.sdHold || plan.sdHold.verdict !== 'DELETE_BASE_HASH_MISSING') return false;
    if (plan.localDeleteBaseHash != null && plan.localDeleteBaseHash !== '') return false;
    if (typeof plan.resolutionDeleteOpId !== 'string' || plan.resolutionDeleteOpId === '') return false;
    if (typeof plan.resolvedServerRev !== 'number' || !isFinite(plan.resolvedServerRev)) return false;
    return true;
  }
  /* dropPending を抑止してよいか。5 条件の AND。 */
  function preserveTerminalPlanOnSuccess(plan){
    var s = ldrCleanupScopeFor(plan);
    if (!s) return false;                      /* ① 内部 LDR cleanup path からの実行でない */
    if (!isLdrTerminalPlan(plan)) return false;/* ②③④ terminal / resolution / hold verdict */
    if (!ldrExecProofFor(plan)) return false;  /* ⑤ fresh authority 済み（runtime proof が生きている） */
    return true;
  }

  /* ★★fix735(RULING109 §4): executePlan を通ったら proof は **必ず** 捨てる。
     例外で抜けても捨てる。＝ proof は「1 回の削除実行」だけに効く揮発値であり、
     reload はもちろん、同一 runtime でも使い回せない。 */
  function executePlan(plan, d){
    try { return executePlanInner(plan, d); }
    finally { clearLdrExecProof(); }
  }
  function executePlanInner(plan, d){
    var deleted = [], refused = [];
    for (var i = 0; i < plan.keys.length; i++){
      var it = plan.keys[i];
      /* ★fix594: **もう存在しないキーは成功扱い**にする。
         2026-07-27 の実機で踏んだ: 物理削除が済んだ後も保留(pending)が残っていると、
         次の resumePending が「存在しないキー」をゲートへ渡し、ゲートが拒否 →
         partial 扱いで **永久に保留から外れない**（容量は空いているのに片づかない）。
         消す目的は既に達成されているので、ここは成功として数える。 */
      /* ★fix595: 「元から無かった」は成功だが**物理削除ではない**。別の数として数える。 */
      if (lsg(it.key) == null){ deleted.push(it.key); stats.alreadyMissingPlannedKeys++; continue; }
      /* ★★fix735(RULING108 修正2 / RULING109): hard データの物理削除は
             POLICY ALLOW ∧ TOCTOU BINDING OK ∧ DESTRUCTIVE GATE ALLOW
         でなければ実行しない。従来は fix562.deletePolicy を通さず fix569 のゲートだけで
         消していた（FIX587_GATE_ONLY_HARD_DELETE_BYPASS）。ここでそれを閉じる。
         ・policy が使えない/例外/deny/証明不足/binding 不一致 → **gate を呼ばない**。物理削除 0
         ・plan / snapshot / 墓標などの provenance は一切消さない
         ・hard 以外の分類は従来の挙動を変えない */
      var pv = policyVerdictForKey(it, plan, d);
      if (pv.ok && pv.code !== 'not-hard'){
        var bw = bindingStillValid(it, plan, d, pv.binding);
        if (bw) pv = { ok:false, code:'policy-binding-mismatch', why:bw };
      }
      if (!pv.ok){
        stats.f735PolicyDenied = (stats.f735PolicyDenied || 0) + 1;
        refused.push({ key: it.key, code: pv.code,
                       expectedBytes: (it.bytes == null ? null : it.bytes),
                       actualBytes: (function(){ var v = lsg(it.key); return v == null ? null : v.length; })(),
                       expectedHash: it.hash || null, actualHash: null,
                       policyWhy: pv.why || null });
        stats.gateRefused++; bumpCode(stats.gateRefusedByCode, pv.code);
        continue;                                   /* ★gate へ到達させない */
      }
      var r = null;
      try {
        r = d.gate.tryDeleteExact({
          key: it.key, expectedBytes: it.bytes, expectedHash: it.hash,
          intent: 'lifecycle-delete', path: 'fix587',
          reason: 'story-delete plan=' + plan.planId
        });
      } catch(e){ r = null; }
      if (r && r.ok && r.deleted && lsg(it.key) == null){ deleted.push(it.key); stats.physicalDeleted++; stats.gatewayPhysicalDeletes++; }
      else {
        var code = (r && r.code) || 'gate-unavailable';
        /* ★fix602: 拒否の**内訳**を残す。「期待した値」と「いまの値」を並べて初めて
           「内容が更新された(stale)」のか「保護されている(protected)」のかが後から分かる。
           ★生の中身は残さない（容量と個人情報の両方の理由で、長さと指紋だけ）。 */
        var nowVal = lsg(it.key), hashOf2 = (d.inv && d.inv._hash) ? d.inv._hash : null;
        refused.push({ key: it.key, code: code,
                       expectedBytes: (it.bytes == null ? null : it.bytes),
                       actualBytes: (nowVal == null ? null : nowVal.length),
                       expectedHash: it.hash || null,
                       actualHash: (nowVal != null && hashOf2) ? hashOf2(nowVal) : null });
        stats.gateRefused++; bumpCode(stats.gateRefusedByCode, code);
      }
    }
    if (refused.length) noteRefusals(plan, refused);
    return { deleted: deleted, refused: refused };
  }


  /* ---- ★★fix602: 拒否理由を**再読込しても消えない場所**へ残す -----------------
   * これまで理由はメモリ上の LOG にしか無かったので、ページを閉じた時点で
   * 「なぜ片づいていないのか」が誰にも分からなくなっていた。
   * ring 20件（GPT指定）。生の値は入れない。 */
  var REFUSAL_KEY = 'v292Dfix587_refusals', REFUSAL_MAX = 20;
  function readRefusals(){
    try { var a = JSON.parse(lsg(REFUSAL_KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch(e){ return []; }
  }
  function noteRefusals(plan, refused){
    try {
      var a = readRefusals(), at = Date.now();
      for (var i = 0; i < refused.length; i++){
        var f = refused[i];
        a.push({ at: at, slotId: plan.slotId, deleteOpId: plan.deleteOpId, planId: plan.planId,
                 key: f.key, code: f.code,
                 expectedBytes: f.expectedBytes, actualBytes: f.actualBytes,
                 expectedHash: f.expectedHash, actualHash: f.actualHash });
      }
      lss(REFUSAL_KEY, JSON.stringify(a.slice(-REFUSAL_MAX)));
    } catch(e){}
  }

  /* ---- ★★fix602: 自動で片づけられない計画は「終端状態」へ移す -------------------
   * ★GPT裁定: 「**永久に片づかない**を防ぐことは、必ず物理削除することではない。
   *   自動処理不能を**理由つきの終端状態**へ移すことも正しい解決」。
   *
   * なぜ再計画（現在値でスナップショットを作り直して消す）をここでやらないか:
   *   GPT が具体的な反例を4つ出した。
   *   A: 同じ slotId で**別の物語**が新規作成されていた場合、生きている物語を消してしまう。
   *      これを防ぐには物語の実体を識別する不変ID(storyInstanceId)が要るが、既存データには無い。
   *      タイトルや主人公での推測一致は危険。
   *   B: 別端末で**正式に復元**されていた場合、ローカルmetaだけでは分からない。
   *      再計画の前にサーバの墓標を読み直す必要がある。
   *   C: 今回の計画は11件中6件が既に消えている。**現在値だけ**をスナップショットすると、
   *      既に消えた6件の復元元が失われる。旧スナップショットと現在値を統合した
   *      「後継の完全な復元セット」でなければならない。
   *   D: サーバの墓標が指す復元セットと、物理削除の根拠にした復元セットが食い違う。
   *   → ここまで作るのは次段。**いまは安全側に倒し、理由を見えるようにして止める**。
   *      止まっている間の害は「容量が空かない」だけで、表示・起動・同期は既に遮断済み。 */
  var BLOCKED_KEY = 'v292Dfix587_blocked', BLOCKED_MAX = 10, MAX_ATTEMPTS = 3;
  function readBlocked(){
    try { var a = JSON.parse(lsg(BLOCKED_KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch(e){ return []; }
  }
  function moveToBlocked(plan, reason, refused){
    var a = readBlocked().filter(function(x){ return x && x.planId !== plan.planId; });
    a.push({ planId: plan.planId, slotId: plan.slotId, deleteOpId: plan.deleteOpId,
             at: Date.now(), blockedReason: String(reason),
             attempts: (+plan.attempts || 0),
             keys: (refused || []).map(function(f){ return { key: f.key, code: f.code }; }) });
    lss(BLOCKED_KEY, JSON.stringify(a.slice(-BLOCKED_MAX)));
    dropPending(plan.planId);
    stats.blockedPlans = readBlocked().length;
    bumpCode(stats.blockedByReason, reason);
    note({ act:'blocked', slotId: plan.slotId, deleteOpId: plan.deleteOpId, why: reason });
  }
  /* 拒否の内訳から、この計画をどう扱うかを決める。
     ★一過性(policy-unavailable / gate-unavailable)は再試行、それ以外は終端。
     ★再試行回数は**メモリではなく pending へ永続化**する（GPT指定。再起動で0に戻さない）。 */
  function decideAfterRefusal(plan, refused){
    var codes = {}, i;
    for (i = 0; i < refused.length; i++) codes[refused[i].code] = 1;
    if (codes['protected'])     return { terminal:true,  reason:'blocked-protected' };
    if (codes['stale'])         return { terminal:true,  reason:'blocked-stale-legacy' };
    if (codes['delete-failed']) return { terminal:false, reason:'delete-failed' };
    return { terminal:false, reason:'policy-unavailable' };   /* 分類器/ゲート未準備＝一過性 */
  }
  function afterRefusal(plan, refused){
    var v = decideAfterRefusal(plan, refused);
    if (v.terminal){ moveToBlocked(plan, v.reason, refused); return v.reason; }
    plan.attempts = (+plan.attempts || 0) + 1;
    plan.lastRefusalReason = v.reason;
    plan.lastAttemptAt = Date.now();
    if (plan.attempts >= MAX_ATTEMPTS){
      moveToBlocked(plan, 'blocked-' + v.reason + '-max-attempts', refused);
      return 'blocked-' + v.reason + '-max-attempts';
    }
    addPending(plan);
    return v.reason;
  }
  /* 人が読める理由。★生の hash も専門用語も出さない（おしん向け）。 */
  function humanReason(reason){
    var m = {
      'blocked-stale-legacy':   '内容が更新されたため、消してよいか確認が必要です',
      'blocked-protected':      '大切な控えとして保護されているため保留しています',
      'blocked-policy-unavailable-max-attempts': '安全確認の仕組みが動かないため保留しています',
      'blocked-delete-failed-max-attempts':      '3回試しても片づけられなかったため停止しました',
      'policy-unavailable':     '安全確認の準備ができるまで待っています',
      'delete-failed':          '片づけに失敗したので、次に開いたときにもう一度試します',
      /* ★fix708: 再送では直らない停止理由。データは消さずに残してある。 */
      'blocked-delete-base-conflict':        '削除を決めたあとに内容が変わったため、消してよいか確認が必要です',
      'blocked-delete-canonical-unsupported': 'この物語は保護された保存方式に切り替わっているため停止しました',
      /* ★fix720: 想定外の保存方式。データは消さずに残してある。 */
      'blocked-delete-authority-unsupported': 'この物語の保存方式を判定できないため停止しました'
    };
    return m[String(reason)] || '確認が必要です';
  }

  /* ---- 保留中の削除（tombstoneは立ったが物理削除がまだ） ----------------- */
  var PENDING_KEY = 'v292Dfix587_pending';
  function readPending(){
    try { var a = JSON.parse(lsg(PENDING_KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch(e){ return []; }
  }
  /* ★★fix735(RULING109 §4): pending へ serialize する直前に、authorization proof 系の
     フィールドを **必ず** 落とす。formal: PERSISTED_PLAN_LDR_SERVER_PROOF = 0。
     ・通常の計画は該当フィールドを持たないので、**同一オブジェクトをそのまま通す**
       （= 既存 plan の serialize バイト列は 1 バイトも変わらない）
     ・持っていた場合だけ shallow copy から取り除く（元 plan の provenance は書き換えない） */
  /* ★RULING110 §5: strip 対象は fix735 が所有する LDR 専用名だけにする。
     generic な `serverProof` は fix735 の namespace ではないので **strip しない**
     （将来 plan が無関係な serverProof を持ったときに黙って消さないため）。 */
  var LDR_NONPERSIST_FIELDS = ['ldrServerProof', 'ldrProof'];
  function stripExecProof(plan){
    if (!plan || typeof plan !== 'object') return plan;
    var hit = false, i;
    for (i = 0; i < LDR_NONPERSIST_FIELDS.length; i++)
      if (Object.prototype.hasOwnProperty.call(plan, LDR_NONPERSIST_FIELDS[i])){ hit = true; break; }
    if (!hit) return plan;                       /* ★通常経路: 無変更・無コピー */
    var o = {}, k;
    for (k in plan){
      if (!Object.prototype.hasOwnProperty.call(plan, k)) continue;
      if (LDR_NONPERSIST_FIELDS.indexOf(k) >= 0) continue;
      o[k] = plan[k];
    }
    return o;
  }
  function writePending(a){
    var safe = a.slice(-20), out = [], i;
    for (i = 0; i < safe.length; i++) out.push(stripExecProof(safe[i]));
    return lss(PENDING_KEY, JSON.stringify(out));
  }
  function addPending(plan){
    var a = readPending();
    /* ★★fix602: 同じ planId が既に載っているときは**置き換える**。
       旧実装は「載っていなければ push」だったので、`afterRefusal` が
       `plan.attempts` を増やしても**2回目以降は localStorage の古い方が書き戻され**、
       再試行回数が永久に 1 のままになっていた（上限3回に一度も到達しない）。
       ＝ fix602 が防ぐと宣言した「永久に片づかない」が、この経路にだけ残っていた。
       ★計画の同一性(planId + exact key + hash)は変えていない。増えるのは attempts などの
         進捗フィールドだけなので、置き換えても計画の同一性は壊れない。 */
    var replaced = false;
    for (var i = 0; i < a.length; i++){
      if (a[i] && a[i].planId === plan.planId){ a[i] = plan; replaced = true; break; }
    }
    if (!replaced) a.push(plan);
    writePending(a); stats.pending = a.length;
  }
  /* ★★fix736(RULING111-A §5): LDR terminal cleanup 中の exact plan は **落とさない**。
     成功経路（physicalPhase 末尾）だけでなく、拒否経路（afterRefusal → moveToBlocked）も
     dropPending を通るので、**source 側 1 箇所**で止める。
     こうすると「drop してから復元する」窓が構造的に存在しない。
     この値は physicalPhase が LDR predicate を満たしたときだけ立て、必ず finally で戻す。 */
  var LDR_PRESERVE_PLAN_ID = null;
  function dropPending(planId){
    if (LDR_PRESERVE_PLAN_ID != null && LDR_PRESERVE_PLAN_ID === String(planId)){
      stats.f736DropSuppressed = (stats.f736DropSuppressed || 0) + 1;
      note({ act:'ldr-cleanup-drop-suppressed', planId: String(planId),
             detail:'LDR terminal cleanup 中。server 削除の provenance を落とさない' });
      return;
    }
    var a = readPending().filter(function(x){ return x.planId !== planId; });
    writePending(a); stats.pending = a.length;
  }

  /* ---- ⑦⑧ 物理削除フェーズ（クラウド確定**後**に共通で使う） --------------
     ★fix708: 従来 finish の後半をそのまま切り出したもの。判定・順序は変えていない。 */
  function physicalPhaseInner(plan, d, snapshotId, extra){
    var slotId = plan.slotId, deleteOpId = plan.deleteOpId;
    function withExtra(o){ if (extra) for (var k in extra){ if (Object.prototype.hasOwnProperty.call(extra,k)) o[k] = extra[k]; } return o; }
    /* ★fix588(GPT裁定D-5): 物理削除の解禁条件に「fix562分類器が利用可能」を入れる。
       分類器が居ないと、墓標スロットの本体・サイドストアを payload から除外できず、
       「ローカルからは消したのに、送信物には残っている」状態を作りうる。
       通常同期は fail-open でよいが、**削除後の物理GCは必ず fail-closed**。 */
    if (!(d.inv && typeof d.inv.classifyKey === 'function')){
      stats.classifierUnavailable++;
      addPending(plan);
      note({ act:'pending', slotId:slotId, deleteOpId:deleteOpId,
             why:'分類器(fix562.classifyKey)が使えないので物理削除しない' });
      return withExtra({ ok:true, code:'pending-classifier', deleteOpId:deleteOpId, snapshotId:snapshotId, hidden:true });
    }
    /* ★★fix736: preserve 判定は executePlan を呼ぶ **前** に行う。
       executePlan は finally で runtime proof を捨てるので、後から評価すると
       「fresh authority 済み」条件が必ず false になってしまう。 */
    var preserveTerminal = false;
    try { preserveTerminal = preserveTerminalPlanOnSuccess(plan); } catch(e){ preserveTerminal = false; }
    var prevPreserve = LDR_PRESERVE_PLAN_ID;
    if (preserveTerminal) LDR_PRESERVE_PLAN_ID = String(plan.planId);
    var r;
    try {
      /* ⑦⑧ */
      r = executePlan(plan, d);
    } finally {
      /* 成功・拒否・例外いずれでも、この 1 回の実行を出たら抑止は解除する */
      if (preserveTerminal){
        stats.f736TerminalPlanPreserved = (stats.f736TerminalPlanPreserved || 0) + 1;
        note({ act:'ldr-cleanup-plan-preserved', slotId:slotId, deleteOpId:deleteOpId,
               planId: plan.planId,
               detail:'LDR terminal cleanup。物理 key だけ削除し、terminal plan は byte 不変で保持' });
      }
    }
    if (r.refused.length){
      /* ★fix602: ここで無条件に addPending すると、**同じhashの計画を永久に拒否され続ける**。
         一過性かどうかを判定し、自動で片づけられないものは理由つきの終端状態へ移す。 */
      var outcome = afterRefusal(plan, r.refused);
      note({ act:'partial', slotId:slotId, deleteOpId:deleteOpId, deleted:r.deleted.length,
             refused:r.refused, outcome: outcome });
      LDR_PRESERVE_PLAN_ID = prevPreserve;
      return withExtra({ ok:true, code:'partial', deleteOpId:deleteOpId, snapshotId:snapshotId,
               deleted:r.deleted.length, refused:r.refused,
               outcome: outcome, humanReason: humanReason(outcome) });
    }
    /* 保留に載っていたときだけ外す（載っていないのに書くと、無意味な localStorage 書込みになる）。
       ★fix736: LDR terminal cleanup 中は dropPending 側で抑止されるので、ここは無変更でよい。 */
    if (readPending().some(function(p){ return p && p.planId === plan.planId; })) dropPending(plan.planId);
    LDR_PRESERVE_PLAN_ID = prevPreserve;
    stats.completed++;
    note({ act:'completed', slotId:slotId, deleteOpId:deleteOpId, deleted:r.deleted.length });
    return withExtra({ ok:true, code:'deleted', deleteOpId:deleteOpId, snapshotId:snapshotId, deleted:r.deleted.length });
  }

  /* ★★fix745(GWS Phase B): physicalPhaseInner は「クラウド確定**後**・完全同期」の logical transaction。
     13 materialization target keys の物理削除（executePlan）と pending の read-modify-write を
     まとめて含むので、**この単位で** shared exclusive lock を取る。
       ・network 待機は必ずこの外（裁定: network待機中lock保持は禁止）。
       ・setItem 1回単位の lock にはしない（裁定REJECT）。logical transaction 全体。
       ・Class B(RECOVERY_OR_DESTRUCTIVE) = HARD_HOLD_NO_WRITE:
         BUSY なら physicalPhaseInner に**入らない** ＝ 物理削除0 / pending 保持 / 成功verdict禁止。
         次回 autoResume(resumePending) が続きをやるので、削除は失われず遅れるだけ。

     ★裁定(Phase B review §3): 1関数が sync/Promise を切り替える契約は REJECT。
       physicalPhaseInner … **常に同期**（legacy semantics を1バイトも変えない）
       physicalPhaseGws   … **常に Promise**
     3つの call site（finishLegacy / proceedPhysical / ldrCleanupOnce）はいずれも
     既に Promise / callback 文脈なので、常に Gws（Promise）を使って戻り値型を1つに固定する。 */
  /* ★★fix746(C13 Proof B): forward / recovery を **明示 enum** で区別する。
       heuristic（pending に載っているかで推測する等）は裁定 REJECT。既定は fail-closed の FORWARD。
       FORWARD_DELETE       … requestDelete。isolation exemption なし（Gate B を必ず通る）
       RECOVERY_RESUME      … resumePending。既に durable 化された pending の消化
       RECOVERY_LDR_CLEANUP … ldrCleanupOnce。同上（pending が無ければそもそも到達しない） */
  var PP_MODE = { FORWARD: 'FORWARD_DELETE', RESUME: 'RECOVERY_RESUME', LDR: 'RECOVERY_LDR_CLEANUP' };
  function isRecoveryMode(mode){ return mode === PP_MODE.RESUME || mode === PP_MODE.LDR; }

  /* ★recovery exemption は「無条件で書いてよい」ではない（裁定）。
     shared lock を取った**後**に durable pending を再読取して、
       ・pending が実在する
       ・parse 正常
       ・exact story identity が plan 側で確定している
       ・exact physical plan（keys）が plan 側で確定している
       ・壊れている可能性のある current resolver から target key を再導出していない
     を確認してからでなければ recovery を実行しない。
     不正なら RECOVERY_PENDING_INVALID_HOLD（write0 / pending 保持 / 成功扱いしない）。 */
  function validateDurableRecovery(plan){
    if (!plan || typeof plan !== 'object') return { ok:false, why:'plan-not-object' };
    var pid = (plan.planId == null) ? '' : String(plan.planId);
    var sid = (plan.slotId == null) ? '' : String(plan.slotId);
    if (!pid) return { ok:false, why:'plan-no-planId' };
    if (!sid) return { ok:false, why:'plan-no-slotId' };
    var all;
    try { all = readPending(); } catch(e){ return { ok:false, why:'pending-unreadable' }; }
    if (!all || Object.prototype.toString.call(all) !== '[object Array]')
      return { ok:false, why:'pending-not-array' };
    var hits = [];
    for (var i = 0; i < all.length; i++) if (all[i] && String(all[i].planId) === pid) hits.push(all[i]);
    if (hits.length !== 1) return { ok:false, why:'pending-not-unique:' + hits.length };
    var dur = hits[0];
    if (String(dur.slotId) !== sid) return { ok:false, why:'pending-slot-mismatch' };
    if (Object.prototype.toString.call(plan.keys) !== '[object Array]' || !plan.keys.length)
      return { ok:false, why:'plan-no-exact-keys' };
    /* ★target keys は durable plan 側の exact key でなければならない。
       壊れた resolver から作り直した key（＝ durable 側に無い key）が混ざっていたら拒否する。 */
    var durKeys = {};
    if (Object.prototype.toString.call(dur.keys) === '[object Array]')
      for (var j = 0; j < dur.keys.length; j++){ var dk = dur.keys[j]; if (dk && dk.key) durKeys[String(dk.key)] = 1; }
    for (var k2 = 0; k2 < plan.keys.length; k2++){
      var it = plan.keys[k2];
      if (!it || !it.key) return { ok:false, why:'plan-key-shape' };
      if (!durKeys[String(it.key)]) return { ok:false, why:'plan-key-not-in-durable-pending:' + it.key };
      /* exact key は必ず自 slot に属していること（他 slot へ展開しない） */
      if (String(it.key).indexOf(sid) < 0) return { ok:false, why:'plan-key-foreign-slot:' + it.key };
    }
    return { ok:true, durable: dur };
  }
  function recoveryInvalidHold(plan, snapshotId, why, extra){
    stats.recoveryPendingInvalid = (stats.recoveryPendingInvalid || 0) + 1;
    note({ act:'recovery-pending-invalid', slotId: plan && plan.slotId, planId: plan && plan.planId,
           why: 'durable pending の検証に失敗したため recovery を実行しない: ' + why });
    var o = { ok:false, code:'RECOVERY_PENDING_INVALID_HOLD', why: why, wrote:0,
              deleted:[], refused:[], planRetained:true, snapshotId: snapshotId || null };
    if (extra) for (var k in extra){ if (Object.prototype.hasOwnProperty.call(extra,k)) o[k] = extra[k]; }
    return o;
  }

  function physicalPhaseGws(plan, d, snapshotId, extra, mode){
    mode = mode || PP_MODE.FORWARD;                    /* ★既定は fail-closed の FORWARD */
    var G = null;
    try { G = window.__v292DfixGWS || null; } catch(e){ G = null; }
    if (!G || typeof G.runExclusive !== 'function' || typeof G.serializationRequired !== 'function'
        || !G.serializationRequired())
      return Promise.resolve(physicalPhaseInner(plan, d, snapshotId, extra));   /* legacy 経路 */

    /* recovery は専用入口（generic な exemption API は裁定 REJECT）。 */
    if (isRecoveryMode(mode)){
      if (typeof G.runFix587Recovery !== 'function')
        return Promise.resolve(gwsBusyHold(plan, snapshotId, { reason:'NO_RECOVERY_ENTRY' }, extra));
      return G.runFix587Recovery(function(){
        /* ★lock 取得後に durable pending を再読取して検証する */
        var v = validateDurableRecovery(plan);
        if (!v.ok) return recoveryInvalidHold(plan, snapshotId, v.why, extra);
        return physicalPhaseInner(plan, d, snapshotId, extra);
      }).then(function(x){
        return (x && x.ran) ? x.result : gwsBusyHold(plan, snapshotId, x, extra);
      });
    }
    return G.runExclusive('B', function(){ return physicalPhaseInner(plan, d, snapshotId, extra); })
      .then(function(x){
        return (x && x.ran) ? x.result : gwsBusyHold(plan, snapshotId, x, extra);
      });
  }
  /* BUSY 時の戻り。**pending は残す**（hidden:true ＝ 一覧からは既に消えている）。 */
  function gwsBusyHold(plan, snapshotId, x, extra){
    stats.gwsBusyHold = (stats.gwsBusyHold || 0) + 1;
    note({ act:'pending-gws-busy', slotId: plan.slotId, deleteOpId: plan.deleteOpId,
           why:'他タブ/他contextが物語データを更新中。物理削除は保留（write0・保留は保持）' });
    var o = { ok:true, code:'pending-gws-busy', deleteOpId: plan.deleteOpId, snapshotId: snapshotId,
              hidden:true, gwsBusy:true, wrote:0,
              policy: (x && x.policy) || 'HARD_HOLD_NO_WRITE', reason: (x && x.reason) || 'BUSY' };
    if (extra) for (var k in extra){ if (Object.prototype.hasOwnProperty.call(extra,k)) o[k] = extra[k]; }
    return o;
  }
  /* ---- ⑥⑦⑧ 旧経路: legacy pkg push が通ってから物理削除（fix708 OFF 時） ---- */
  /* ★★fix734(RULING100): DELETE_PLAN_SAFETY_MONOTONICITY
     一度 fix708 の安全管理下（shadow delete protocol）に入った計画は、
     kill switch(v292Dfix708Off='1') を立てても **より安全性の低い legacy 破壊経路へ降格させない**。
     ・降格させると「危険なので止めた計画」が、server の row を一切見ない legacy 経路へ落ち、
       local key を物理削除し得る（DELETE_KILL_SWITCH_SAFETY_DOWNGRADE）。
     ・最初から fix708 OFF で作られた真正 legacy plan は従来どおり通す。
       kill switch 本来の legacy fallback は壊さない。
     ・既存の sdHold は **上書きしない**（止まった理由の履歴を消さない）。 */
  function isGuardedPlan(plan){
    if (!plan || typeof plan !== 'object') return false;
    if (plan.shadowDeleteVersion === 1) return true;                 /* fix708 世代の plan */
    if (plan.sdHold && typeof plan.sdHold === 'object') return true; /* 安全上いちど止めた plan */
    return false;
  }
  function guardedDowngradeHold(plan, snapshotId){
    stats.f734GuardedDowngradeRefused = (stats.f734GuardedDowngradeRefused || 0) + 1;
    addPending(plan);                        /* ★payload は必ず保持（dropPending しない） */
    note({ act:'refused', slotId: (plan && plan.slotId), deleteOpId: (plan && plan.deleteOpId),
           why:'fix708 の安全管理下に入った計画を kill switch OFF で legacy 物理削除へ降格させない' });
    return { ok:true, code:'pending-guarded-no-downgrade',
             verdict:'DELETE_PLAN_SAFETY_MONOTONICITY_HOLD',
             deleteOpId: (plan && plan.deleteOpId), snapshotId: snapshotId,
             hidden:true, mutated:false };
  }
  function finishLegacy(plan, d, snapshotId, mode){
    var slotId = plan.slotId, deleteOpId = plan.deleteOpId;
    /* ★fix734: guarded plan は legacy 破壊経路へ入れない */
    if (isGuardedPlan(plan)) return Promise.resolve(guardedDowngradeHold(plan, snapshotId));
    return pushTombstone(d).then(function(pushed){
      if (!pushed){
        /* オフライン/push失敗: 一覧からは消えるが、実データは**まだ消さない**。
           クラウドへ削除が伝わらない状態で実データを消すと、次のpullで復活して
           「消したのに戻る」を作るため。再接続後に resumePending() が続きをやる。 */
        addPending(plan);
        note({ act:'pending', slotId:slotId, deleteOpId:deleteOpId,
               why:'クラウドへ墓標を反映できなかった。物理削除は保留' });
        return { ok:true, code:'pending-cloud', deleteOpId:deleteOpId, snapshotId:snapshotId, hidden:true };
      }
      return physicalPhaseGws(plan, d, snapshotId, null, mode);   /* ★fix745/746: 常にPromise・mode明示 */
    });
  }

  /* ---- ★★fix708: 新経路（shadow delete protocol） ------------------------ */
  function finishShadowDelete(plan, d, snapshotId, mode){
    var slotId = plan.slotId, deleteOpId = plan.deleteOpId;
    var sid = (plan.storyId != null && plan.storyId !== '') ? String(plan.storyId) : String(slotId);
    stats.sdAttempts++;

    /* 保留＝データを1バイトも消さずに止まる。理由は **計画そのもの**へ持たせる
       （新しい localStorage キーを増やさない）。 */
    function hold(code, verdict, why, extra){
      var terminal = (SD_TERMINAL_VERDICTS[verdict] === 1);
      try {
        plan.sdHold = { code: code, verdict: verdict, why: String(why || ''), at: Date.now(), terminal: terminal };
        if (terminal) plan.sdTerminal = true;      /* ★autoResume / resumePending はこれを skip する */
      } catch(e){}
      addPending(plan);                            /* ★payload は必ず保持（dropPending しない） */
      stats.sdHeld++;
      if (terminal){
        stats.sdTerminalHolds++;
        recordBlockedKeepingPending(plan, sdTerminalReason(verdict));
        note({ act:'shadow-delete-terminal', slotId:slotId, deleteOpId:deleteOpId,
               verdict:verdict, why:String(why || ''),
               detail:'自動 retry の対象から外した。plan/snapshot/deleteOpId は pending に保持したまま' });
      } else {
        note({ act:'shadow-delete-hold', slotId:slotId, deleteOpId:deleteOpId,
               verdict:verdict, why:String(why || '') });
      }
      var o = { ok:true, code:code, verdict:verdict, terminal:terminal, deleteOpId:deleteOpId,
                snapshotId:snapshotId, hidden:true, shadowDelete:true, why:String(why || ''),
                humanReason: terminal ? humanReason(sdTerminalReason(verdict)) : null };
      if (extra) for (var k in extra){ if (Object.prototype.hasOwnProperty.call(extra,k)) o[k] = extra[k]; }
      return o;
    }
    /* 物理削除まで進んでよい確定系。legacy pkg push は **後追い**。 */
    function proceedPhysical(verdict, extra){
      var e = { shadowDelete:true, verdict:verdict };
      if (extra) for (var k in extra){ if (Object.prototype.hasOwnProperty.call(extra,k)) e[k] = extra[k]; }
      /* ★fix745(GWS Phase B): 物理削除は shared lock 下。**常に Promise**（戻り値型を固定）。
         呼び出し元はすべて resolve(proceedPhysical(...)) なので Promise でも順序は変わらない。
         bestEffortLegacyPush は lock の**外**（network 後追い・失敗しても巻き戻さない）。 */
      return physicalPhaseGws(plan, d, snapshotId, e, mode).then(function(out){
        /* BUSY(pending-gws-busy) のときは削除が確定していないので legacy push もしない */
        if (out && out.gwsBusy === true) return out;
        bestEffortLegacyPush(plan, d);        /* ★(11) 失敗しても巻き戻さない */
        return out;
      });
    }

    /* (1)(4) live のうちに確定した hash が計画に無ければ **サーバ削除しない**。
       墓標の後に projection を作り直して hash を捏造することは禁止。 */
    var base = (plan.localDeleteBaseHash != null && plan.localDeleteBaseHash !== '')
                 ? String(plan.localDeleteBaseHash) : null;
    if (!base){
      stats.sdNoBaseHash++;
      return Promise.resolve(hold('pending-no-base-hash', 'DELETE_BASE_HASH_MISSING',
        '削除時点(live)の canonical hash が計画に無いので、サーバ側の削除を実行できない',
        { baseHashWhy: plan.localDeleteBaseHashWhy || null }));
    }
    var W = contract();
    if (!W){
      stats.sdContractUnavailable++;
      return Promise.resolve(hold('pending-contract-unavailable', 'DELETE_CONTRACT_UNAVAILABLE',
        'fix697 の canonical hash 契約 / shadow transport がこのページに無い'));
    }

    return new Promise(function(resolve){
      /* (5) legacy pkg push を要求しない。fresh getstory から始める。 */
      W.shadowRequest({ op:'getstory', id: sid }, function(r, err){
        if (err || !r){
          resolve(hold('pending-cloud', 'DELETE_SERVER_UNREACHABLE',
                       'getstory に到達できない: ' + String(err || '?')));
          return;
        }
        var j = r.j || {};
        /* ★★fix711(GPT裁定 SHADOW 404 SAFETY CUT): 移行期の 404 は
           「クラウドにその物語が無い」ことを意味しない。証明できるのは
           **story_shadow namespace に row が無い** ことだけ。
           main は local 38 スロットに対し story_shadow 7 行、CLOUD_STORY_CANONICAL = NOT YET。
           legacy package 側に本体が残っている可能性があるので、404 だけで physical delete へ
           進むのは禁止（SHADOW_404_NOT_AUTHORITATIVE_DURING_PARTIAL_COVERAGE）。
           → 従来の legacy 経路（finishLegacy）へ戻し、legacy pkg 墓標 push が
             **成功したときだけ** 物理削除する。失敗したら pending / 本体 / 墓標 / snapshot を保持。
           ★server row は作らない ★deleteshadow は撃たない ★新 op / 新 key / 新 ledger も作らない。
           将来 per-story cloud canonical へ完全 cutover し legacy package が story authority から
           退役した後にだけ、404 → CLOUD_ALREADY_ABSENT を再検討できる。 */
        if (r.status === 404 || j.errorCode === 'not-found'){
          stats.sd404LegacyRequired++;
          note({ act:'shadow-404-legacy-required', slotId:slotId, deleteOpId:deleteOpId,
                 verdict:'SHADOW_ROW_MISSING_LEGACY_REQUIRED',
                 detail:'story_shadow に row が無いだけ。legacy pkg 墓標 push の成功を物理削除の条件にする' });
          finishLegacy(plan, d, snapshotId, mode).then(function(res){
            try {
              res = res || {};
              res.shadowDelete = true;
              res.legacyFallback = true;
              res.verdict = (res.code === 'deleted' || res.code === 'partial')
                ? 'SHADOW_ROW_MISSING_LEGACY_COMPLETED' : 'SHADOW_ROW_MISSING_LEGACY_REQUIRED';
              if (res.code === 'deleted') stats.sd404LegacyCompleted++;
            } catch(e){}
            resolve(res);
          }, function(e){
            resolve(hold('pending-cloud', 'SHADOW_ROW_MISSING_LEGACY_REQUIRED',
                         'legacy fallback が失敗した: ' + String(e)));
          });
          return;
        }
        if (r.status !== 200 || !j.ok){
          resolve(hold('pending-cloud', 'DELETE_SERVER_ERROR',
                       'getstory status=' + r.status + ' code=' + String(j.errorCode || '?')));
          return;
        }
        var auth = String(j.authority || 'shadow');
        /* ★★fix720(STEP4D/RULING28 §5): authority 別 writer routing。
             shadow    → 既存 deleteshadow（下の経路。1 バイトも変えない）
             canonical → 新 deletecanonical（専用 writer。promotedelete は使わない）
             その他    → DELETE_AUTHORITY_UNSUPPORTED terminal hold（KEEP DATA） */
        if (auth !== 'shadow' && auth !== 'canonical'){
          stats.sdAuthorityUnsupported++;
          resolve(hold('blocked-canonical', 'DELETE_AUTHORITY_UNSUPPORTED',
                       'authority=' + auth + ' の削除はこの protocol では扱わない'));
          return;
        }
        /* (8) 既にサーバ側が墓標。物理削除は進めてよい。 */
        if (j.deleted === true){
          stats.sdAlreadyDeleted++;
          resolve(proceedPhysical('CLOUD_ALREADY_DELETED', { serverRev: (typeof j.rev === 'number' ? j.rev : null) }));
          return;
        }
        /* (6) shadow live: 削除意思を持った時点の内容と **今のサーバ内容** が同一であること。 */
        var serverHash = String(j.serverHash || ''), serverRev = (typeof j.rev === 'number') ? j.rev : null;
        if (!serverHash || serverHash !== base || serverRev === null){
          stats.sdBaseConflict++;
          resolve(hold('blocked-delete-base-conflict', 'DELETE_BASE_CONFLICT',
                       '削除時点の hash と現在の serverHash が一致しない（強制削除はしない）'));
          return;
        }
        /* ★★fix720(STEP4D/RULING28): canonical row は専用 writer deletecanonical へ。
           ・delete parity は上の base 比較（= fix719 sanitized canonicalProjection hash）を通過済み。
             raw local body と server blob の差は conflict にしない（§14）。
           ・§10: 送信後の network/応答不明は fresh getstory 最大 1 回の readback で収束判定。
             確定できなければ CANONICAL_DELETE_AMBIGUOUS（KEEP DATA / blind retry 禁止 / 物理削除 0）。
           ・§11: 409 (rev/hash/cas-lost) は force しない。readback 最大 1 回で
             「望んだ tombstone（deleted=true / authority=canonical）」なら収束、
             それ以外は DELETE_BASE_CONFLICT terminal（KEEP DATA）。 */
        if (auth === 'canonical'){
          stats.dcAttempts++;
          var dcReadbackConverge = function(holdCode, holdVerdict, holdMsg){
            W.shadowRequest({ op:'getstory', id: sid }, function(g2, ge2){
              var jj = (g2 && g2.j) || {};
              if (ge2 || !g2 || g2.status !== 200 || jj.ok !== true){
                stats.dcAmbiguous++;
                resolve(hold('pending-cloud', 'CANONICAL_DELETE_AMBIGUOUS',
                             'deletecanonical の結果を readback で確定できない（データは消さない）'));
                return;
              }
              if (jj.deleted === true && String(jj.authority || '') === 'canonical'){
                stats.dcConfirmedByReadback++;
                resolve(proceedPhysical('CANONICAL_DELETE_CONFIRMED_BY_READBACK',
                         { serverRev: (typeof jj.rev === 'number' ? jj.rev : null) }));
                return;
              }
              if (holdVerdict === 'DELETE_BASE_CONFLICT') stats.dcBaseConflict++; else stats.dcAmbiguous++;
              resolve(hold(holdCode, holdVerdict,
                           holdMsg + '（readback: deleted=' + (jj.deleted === true) + '）'));
            });
          };
          W.shadowRequest({ op:'deletecanonical', id: sid, expectedRev: serverRev,
                            expectedHash: serverHash, deleteOpId: String(deleteOpId),
                            mid: 'dc:' + sid + ':' + String(deleteOpId) }, function(r3, err3){
            if (err3 || !r3){
              dcReadbackConverge('pending-cloud', 'CANONICAL_DELETE_AMBIGUOUS',
                                 'deletecanonical に到達できない/応答不明');
              return;
            }
            var j3 = r3.j || {};
            if (r3.status === 200 && j3.ok === true){
              stats.dcServerTombstoned++;
              resolve(proceedPhysical('CANONICAL_DELETE_CONFIRMED',
                       { serverRev: (typeof j3.rev === 'number' ? j3.rev : null),
                         serverHash: j3.serverHash || null, replayed: (j3.replayed === true) }));
              return;
            }
            var ec3 = String(j3.errorCode || '');
            if (r3.status === 409 && ec3 === 'already-deleted'){
              stats.dcAlreadyDeleted++;
              resolve(proceedPhysical('CLOUD_ALREADY_DELETED',
                       { serverRev: (typeof j3.serverRev === 'number' ? j3.serverRev : null) }));
              return;
            }
            if (r3.status === 409 && ec3 === 'not-canonical'){
              stats.dcBaseConflict++;
              resolve(hold('blocked-delete-base-conflict', 'DELETE_BASE_CONFLICT',
                           'deletecanonical が not-canonical を返した（並行 authority 変化。強制削除はしない）'));
              return;
            }
            if (r3.status === 409 && (ec3 === 'rev-mismatch' || ec3 === 'hash-mismatch' || ec3 === 'cas-lost')){
              dcReadbackConverge('blocked-delete-base-conflict', 'DELETE_BASE_CONFLICT',
                                 'deletecanonical の CAS が ' + ec3 + ' で成立しなかった（強制削除はしない）');
              return;
            }
            resolve(hold('pending-cloud', 'DELETE_SERVER_ERROR',
                         'deletecanonical status=' + r3.status + ' code=' + (ec3 || '?')));
          });
          return;
        }
        /* ★保存済みの last-known rev は使わない。いま読んだ fresh な rev/hash で CAS を撃つ。 */
        W.shadowRequest({ op:'deleteshadow', id: sid, expectedRev: serverRev,
                          expectedHash: serverHash, deleteOpId: String(deleteOpId),
                          mid: 'ds:' + sid + ':' + String(deleteOpId) }, function(r2, err2){
          if (err2 || !r2){
            resolve(hold('pending-cloud', 'DELETE_SERVER_UNREACHABLE',
                         'deleteshadow に到達できない: ' + String(err2 || '?')));
            return;
          }
          var j2 = r2.j || {};
          if (r2.status === 200 && j2.ok === true){
            stats.sdServerTombstoned++;
            /* (10) サーバ墓標が確定した後にだけ物理削除する。 */
            resolve(proceedPhysical('SERVER_TOMBSTONED',
                     { serverRev: (typeof j2.rev === 'number' ? j2.rev : null),
                       serverHash: j2.serverHash || null, replayed: (j2.replayed === true) }));
            return;
          }
          var ec = String(j2.errorCode || '');
          if (r2.status === 409 && ec === 'already-deleted'){
            stats.sdAlreadyDeleted++;
            resolve(proceedPhysical('CLOUD_ALREADY_DELETED', { serverRev: (typeof j2.serverRev === 'number' ? j2.serverRev : null) }));
            return;
          }
          if (r2.status === 409 && ec === 'not-shadow'){
            stats.sdCanonicalUnsupported++;
            resolve(hold('blocked-canonical', 'DELETE_CANONICAL_UNSUPPORTED',
                         'deleteshadow が not-shadow を返した'));
            return;
          }
          if (r2.status === 409 && (ec === 'rev-mismatch' || ec === 'hash-mismatch' || ec === 'cas-lost')){
            stats.sdBaseConflict++;
            resolve(hold('blocked-delete-base-conflict', 'DELETE_BASE_CONFLICT',
                         'deleteshadow の CAS が ' + ec + ' で成立しなかった（強制削除はしない）'));
            return;
          }
          resolve(hold('pending-cloud', 'DELETE_SERVER_ERROR',
                       'deleteshadow status=' + r2.status + ' code=' + (ec || '?')));
        });
      });
    });
  }

  /* ---- 入口: fix708 が ON のときだけ新経路 -------------------------------- */
  /* ★fix746: mode は呼び出し側が **必ず明示**する。既定は fail-closed の FORWARD_DELETE。 */
  function finish(plan, d, snapshotId, mode){
    mode = mode || PP_MODE.FORWARD;
    if (!sdOn()) return finishLegacy(plan, d, snapshotId, mode);
    return finishShadowDelete(plan, d, snapshotId, mode);
  }

  /* ---- ★fix588: 既に墓標がある物語への2回目の要求 ------------------------
   * GPT必須条件「再実行してもsnapshotや墓標を重複作成しない／autoResumeが同じ
   * deleteOpIdを再利用する」。deleteOpId を作り直すと
   *   ・クラウドに既に載った墓標と食い違う
   *   ・復元の照合(restoreOfDeleteOpId)が通らなくなる
   *   ・復元セット(snapshot)が毎回増えて容量を食う
   * ので、**既存の deleteOpId のまま「続き」をやる**。 */
  /* 墓標は「deleted===true」で探す（deleteOpId は要求しない）。
     ★GPT裁定(B): 安全判定に deleteOpId を要求せず、**破壊処理には要求する**。
     deleteOpId が欠けた墓標は malformed として扱い、**削除を再開しない**。 */
  function tombstoneOf(slotId){
    var meta = readMeta();
    for (var i = 0; i < meta.length; i++){
      var e = meta[i];
      if (e && e.deleted === true && String(e.id) === String(slotId)) return e;
    }
    return null;
  }

  /* ★GPT裁定(C): pending を失ったときに deleteOpId だけで計画を再構成してはいけない。
     deleteOpId は「削除操作の同一性」しか示さず、**物理削除計画の同一性**は示さない。
     pending 消失後に次のことが起きている可能性がある:
       ・古い端末が本体を書き戻した ・サイドストアが増えた ・正式な復元が行われた
       ・別のsnapshotへ差し替わった ・同じslot IDが再利用された
     そこで、再構成を許すには次の組を全部確認する。 */
  function checkResumable(tomb, slotId, deleteOpId, d){
    var problems = [];
    if (tomb.deleted !== true) problems.push('墓標が deleted:true でない');
    if (!deleteOpId) problems.push('deleteOpId が無い');
    /* 正式な復元が成立していたら、古い deleteOpId で再開してはいけない */
    if (tomb.restoreOfDeleteOpId && String(tomb.restoreOfDeleteOpId) === String(deleteOpId))
      problems.push('この削除は正式に復元済み');
    var snapId = tomb.recoverySnapshotId || null;
    if (!snapId) problems.push('recoverySnapshotId が無い');
    var man = null;
    if (snapId){
      try { man = JSON.parse(lsg(snapId) || 'null'); } catch(e){ man = null; }
      if (!man) problems.push('復元セットのmanifestが読めない');
      else {
        if (man.complete !== true) problems.push('復元セットが complete でない');
        if (String(man.slotId) !== String(slotId)) problems.push('復元セットの slotId が一致しない');
        /* ★snapshot と deleteOpId の結び付けは manifest.reason に埋め込んである
             （fix564 を変えずに済ませるため。reason='lifecycle-delete:<deleteOpId>'） */
        if (String(man.reason || '') !== ('lifecycle-delete:' + deleteOpId))
          problems.push('復元セットが この削除操作(deleteOpId) のものだと確認できない');
      }
      var ver = null;
      try { ver = d.snap.verify(snapId); } catch(e){ ver = null; }
      if (!ver || !ver.ok) problems.push('復元セットのhash照合に落ちた');
    }
    return { ok: problems.length === 0, problems: problems, snapshotId: snapId };
  }

  function continueExisting(tomb, d, src){
    var slotId = String(tomb.id), deleteOpId = tomb.deleteOpId ? String(tomb.deleteOpId) : '';

    /* ★malformed な墓標: 隠す・開かせないのは表示側(fix588)がやる。ここでは**何も壊さない**。 */
    if (!deleteOpId){
      stats.malformedTombstones++;
      note({ act:'malformed-tombstone', slotId:slotId, source:src,
             why:'deleted:true だが deleteOpId が無い。隠すが、削除は再開しない' });
      return Promise.resolve({ ok:false, code:'malformed-tombstone', slotId:slotId });
    }

    /* 保留中の計画があれば、それをそのまま使う（keysもhashも当時のまま＝計画の同一性を保つ） */
    var plan = readPending().filter(function(p){ return p && String(p.slotId) === slotId; })[0] || null;
    if (plan){
      note({ act:'continue', slotId:slotId, source:src, deleteOpId:deleteOpId, keys:plan.keys.length });
      /* ★fix746: 既に durable 化された pending をそのまま使う継続なので RECOVERY_RESUME。 */
      return finish(plan, d, plan.snapshotId || tomb.recoverySnapshotId || null, PP_MODE.RESUME);
    }

    /* 保留が残っていない。残りのキーが無ければ、もう終わっている。 */
    var keys = planKeys(slotId, d);
    if (!keys.length){
      note({ act:'already-deleted', slotId:slotId, source:src, deleteOpId:deleteOpId });
      return Promise.resolve({ ok:true, code:'already-deleted', deleteOpId:deleteOpId,
                               snapshotId: tomb.recoverySnapshotId || null, deleted:0 });
    }

    /* ★ここが「工程の進捗を推測してはいけない」場面。厳格に照合する。 */
    var chk = checkResumable(tomb, slotId, deleteOpId, d);
    if (!chk.ok){
      stats.resumeRefused++;
      note({ act:'resume-refused', slotId:slotId, source:src, deleteOpId:deleteOpId, why:chk.problems });
      return Promise.resolve({ ok:false, code:'resume-refused', deleteOpId:deleteOpId, problems:chk.problems });
    }

    /* 照合は通った。だが**クラウドで墓標が確定しているかを推測してはいけない**。
       墓標を再commit（push）した上で、サーバから読み戻して確認する必要がある。
       ★read-back の口がまだ無い（fix399x に「remote meta だけ読む」APIが無い）ので、
         この異常系では**物理削除しない**。墓標の再commitだけ行って止まる。
         害は「消したのに容量が空かない」だけで、表示・起動・pull は既に遮断されている。
       → read-back API を作った段（次段）で、ここを「新しい planId を発行して削除」へ格上げする。 */
    return pushTombstone(d).then(function(pushed){
      stats.resumeBlocked++;
      note({ act:'resume-blocked', slotId:slotId, source:src, deleteOpId:deleteOpId,
             tombstoneRecommitted: !!pushed,
             why:'クラウド確定を read-back で確認できないため、物理削除は行わない' });
      return { ok:false, code:'resume-blocked-needs-readback', deleteOpId:deleteOpId,
               snapshotId: chk.snapshotId, tombstoneRecommitted: !!pushed,
               remaining: keys.length };
    });
  }

  /* ---- ★本体: 削除要求 --------------------------------------------------- */
  /* 戻り: Promise<{ok, code, ...}>。UIは ok を見るだけでよい。 */
  /* ★★fix721.1(STEP4F.1/RULING31): restore transaction hold（読取のみ・書込0） */
  function restoreHold(){
    try { var j = JSON.parse(lsg('v292Dfix721_txn') || 'null');
          return !!(j && (j.phase === 'PREPARED' || j.phase === 'APPLYING')); } catch(e){ return false; }
  }
  function requestDelete(slotId, opts){
    opts = opts || {};
    stats.requested++;
    if (restoreHold()){ note({ act:'refused', slotId:slotId, why:'restore transaction進行中' });
      return Promise.resolve({ ok:false, code:'restore-hold' }); }        /* ★fix721.1 */
    var src = String(opts.source || 'unknown');
    var d = dep();

    if (off()){
      stats.refused++; note({ act:'refused', slotId:slotId, source:src, why:'v292Dfix587Off=1' });
      return Promise.resolve({ ok:false, code:'service-off' });
    }
    var miss = missingDeps(d);
    if (miss.length){
      stats.refused++; note({ act:'refused', slotId:slotId, source:src, why:'依存が足りない: ' + miss.join(',') });
      return Promise.resolve({ ok:false, code:'missing-deps', missing: miss });
    }
    if (!slotId || slotId === 'default' || slotId === 'chr6'){
      stats.refused++; note({ act:'refused', slotId:slotId, source:src, why:'既定枠は削除できない' });
      return Promise.resolve({ ok:false, code:'not-deletable' });
    }

    /* ★fix588: 既に墓標が立っているなら、墓標も復元セットも作り直さず「続き」をやる。
       ここが無いと、保留中の物語をもう一度削除したときに deleteOpId が変わり、
       クラウド上の墓標と食い違う（＋スナップショットが毎回増える）。 */
    var already = tombstoneOf(slotId);
    if (already) return continueExisting(already, d, src);

    /* ①現在のスロットを再読込（confirm後に状態が変わっている可能性がある） */
    if (lsg('chr6_slot_' + slotId) == null){
      stats.refused++; note({ act:'refused', slotId:slotId, source:src, why:'本体セーブが無い' });
      return Promise.resolve({ ok:false, code:'no-body' });
    }

    /* ②exact key が1つでもあるかの **読み取りだけ**の事前確認。
       ★fix747: 計画に載せる exact key / hash は admission lock の中で **再導出**する。
         ここは「無駄な network を撃たない」ためだけの read-only pre-check。 */
    var preKeys = planKeys(slotId, d);
    if (!preKeys.length){
      stats.refused++; return Promise.resolve({ ok:false, code:'no-keys' });
    }

    /* ★★fix734(RULING99 §4): CURRENT_DELETE_HASH_CAPTURE_FAILS_OPEN の修正。
       旧実装は captureDeleteBaseHash が失敗しても proceed() し、墓標を立ててしまうため
       localDeleteBaseHash なしの plan が確定し、削除段で pending-no-base-hash の
       **恒久保留**（回復経路なし）になっていた。
       → base hash を確定できないなら **1 バイトも変更せずに中止**する。
       ★ snapshot 作成より前に hash を取る。これは fix708 がヘッダへ自ら書いた
         (1)hash → (2)snapshot → (3)墓標 の順序へ戻すだけで、成功時の振る舞いは同じ。
       ★ OFF 経路（sdOn()===false）は従来と完全に同じ。 */
    /* ★★fix747(裁定8: FIX587_FORWARD_ADMISSION)
       forward delete の **最初の localStorage mutation より前** に、短い GWS transaction を1つ置く。
         ・分類 = Class D（TURN_OR_USER_SEMANTIC）。ユーザーの「削除する」意思なので silent skip 禁止。
         ・lock 内で: runtime isolation check(Gate B) → 本体 / exact key を **再読取** →
           snapshot 作成 → verify → chr6_slots_meta 墓標更新 → lock release
         ・network（captureDeleteBaseHash / pushTombstone / shadowRequest）は必ず lock の **外**。
           lock を握ったまま network を待つのは裁定で禁止。
         ・lock 取得前の古い read だけで snapshot を書かない（read〜tombstone write を同一 critical section に）。
         ・admission FAIL（isolation FAIL / GWS BUSY）なら
           snapshot 0 / descriptor 0 / meta 変更 0 / pending 0 / physical delete 0 / hard data 変更 0。
           ★pending を作らないこと: forward の失敗を pending 化すると、次回 RECOVERY_RESUME の
             exemption によって Gate B を迂回できてしまう（裁定 REJECT）。 */
    function runForwardAdmission(fn){
      var G = null;
      try { G = window.__v292DfixGWS || null; } catch(e){ G = null; }
      if (!G || typeof G.runTurnMutation !== 'function'
          || typeof G.serializationRequired !== 'function' || !G.serializationRequired())
        return Promise.resolve({ ran:true, result: fn(), serialized:false });   /* legacy 経路は従来どおり */
      return G.runTurnMutation(function(){ return fn(); });
    }
    /* admission が通らなかったときの戻り。**1バイトも書いていない**ことを表す。 */
    function admissionHold(x){
      stats.f747AdmissionHold = (stats.f747AdmissionHold || 0) + 1;
      note({ act:'forward-admission-hold', slotId:slotId, source:src,
             reason: (x && x.reason) || 'BUSY', isolation: (x && x.isolation) || null,
             why:'削除操作をまだ開始していない（snapshot / 墓標 / 計画 / 物理削除すべて 0）' });
      return { ok:false, code:'FORWARD_ADMISSION_HOLD',
               reason: (x && x.reason) || 'BUSY',
               isolation: (x && x.isolation) || null,
               isolationDetail: (x && x.isolationDetail) || null,
               policy: (x && x.policy) || 'TURN_MUTATION_BUSY_HOLD',
               wrote: 0, mutated: false, snapshotId: null, deleteOpId: null };
    }

    function f734Continue(baseHash){
      return runForwardAdmission(function(){
        /* ============ ここから lock 内 / runtime isolation check 済み ============ */
        /* ★fix588(GPT裁定C): 復元セットが**どの削除操作のものか**を後から確認できるように、
             deleteOpId を先に決めて manifest の reason に埋め込む。
             （fix564 の形は変えない。pending を失った異常系で「別のsnapshotへ差し替わった」を検出するため） */
        var now = Date.now();
        var deleteOpId = 'del_' + slotId + '_' + now;

        /* ①本体を lock 内で再読取（confirm / network の間に状態が変わっている可能性がある） */
        if (lsg('chr6_slot_' + slotId) == null){
          stats.refused++;
          note({ act:'refused', slotId:slotId, source:src, why:'本体セーブが無い（admission 内の再読取）' });
          return { ok:false, code:'no-body', mutated:false };
        }
        /* ②exact key と hash も lock 内で再導出する。★計画に載るのはこちら。 */
        var keys = planKeys(slotId, d);
        if (!keys.length){
          stats.refused++;
          note({ act:'refused', slotId:slotId, source:src, why:'exact key が無い（admission 内の再導出）' });
          return { ok:false, code:'no-keys', mutated:false };
        }

        /* ③スナップショット作成（＝復元セット。新しい退避方式は作らない） */
        var snap = null;
        try { snap = d.snap.create(slotId, { now: now, reason: 'lifecycle-delete:' + deleteOpId }); }
        catch(e){ snap = { ok:false, error:String(e && e.message) }; }
        if (!snap || !snap.ok){
          stats.refused++;
          note({ act:'refused', slotId:slotId, source:src, why:'復元セットを作れない: ' + ((snap && snap.error) || '?') });
          return { ok:false, code:'snapshot-failed', error: snap && snap.error };
        }

        /* ④read-back・hash一致の検証。ここが通らなければ**絶対に消さない** */
        var ver = null;
        try { ver = d.snap.verify(snap.id); } catch(e){ ver = { ok:false }; }
        if (!ver || !ver.ok){
          stats.refused++;
          note({ act:'refused', slotId:slotId, source:src, why:'復元セットの検証に失敗' });
          return { ok:false, code:'snapshot-unverified', snapshotId: snap.id };
        }

        /* ⑤meta に tombstone を立てる */
        var meta = readMeta();
        var cur = meta.filter(function(e){ return e && String(e.id) === String(slotId); })[0] || null;
        var tomb = d.tomb.make({ slotId: slotId, title: (cur && cur.name) || (cur && cur.title) || '',
                                 deletedAt: now, deleteOpId: deleteOpId, recoverySnapshotId: snap.id });
        if (!tomb || !d.tomb.validate(tomb).ok){
          stats.refused++; return { ok:false, code:'tombstone-invalid' };
        }
        var next = meta.filter(function(e){ return !e || String(e.id) !== String(slotId); });
        next.push(tomb);
        if (!writeMeta(next)){
          stats.refused++;
          note({ act:'refused', slotId:slotId, source:src, why:'metaへ墓標を書けない（容量不足）' });
          return { ok:false, code:'tombstone-write-failed' };
        }
        note({ act:'tombstone', slotId:slotId, source:src, deleteOpId:deleteOpId, snapshotId:snap.id });

        var plan = { planId: 'plan_' + deleteOpId, deleteOpId: deleteOpId, slotId: slotId,
                     snapshotId: snap.id, createdAt: now, lifecycleVersion: LIFECYCLE_VERSION,
                     keys: keys, source: src };
        /* ★fix708(4): 計画へ最小限の項目だけ足す（schema はこれ以上増やさない）。 */
        if (sdOn()){
          plan.storyId = String(slotId);
          plan.recoverySnapshotId = snap.id;
          plan.shadowDeleteVersion = SHADOW_DELETE_PROTOCOL_VERSION;
          plan.localDeleteBaseHash = baseHash || null;
          if (!baseHash) plan.localDeleteBaseHashWhy = 'UNKNOWN';
        }
        stats.f747Admitted = (stats.f747Admitted || 0) + 1;
        return { ok:true, code:'admitted', plan: plan, snapshotId: snap.id };
        /* ============ ここで lock release ============ */
      }).then(function(x){
        if (!x || x.ran !== true) return admissionHold(x);
        var r = x.result;
        if (!r || r.ok !== true) return r || { ok:false, code:'admission-threw', mutated:false };
        /* ⑥network は lock の外。tombstone をクラウドへ確定させてから、はじめて物理削除する。 */
        /* ★fix746: 新規の delete intent なので FORWARD_DELETE（isolation exemption なし）。
           physicalPhaseGws が **再度** lock を取り、**再度** runtime isolation check を通す。 */
        return finish(r.plan, d, r.snapshotId, PP_MODE.FORWARD);
      });
    }
    if (!sdOn()) return f734Continue(null);      /* ★OFF は従来と完全に同じ経路 */
    return new Promise(function(resolve){
      captureDeleteBaseHash(slotId, function(h, why){
        note({ act:'delete-base-hash', slotId:slotId, captured: !!h,
               why: (h ? null : String(why || '?')) });
        if (typeof h !== 'string' || h === ''){
          stats.f734AbortedNoBaseHash = (stats.f734AbortedNoBaseHash || 0) + 1;
          stats.refused++;
          note({ act:'refused', slotId:slotId, source:src,
                 why:'削除時点の canonical hash を確定できないため中止した'
                      + '（本体・墓標・計画・送信すべて 0）' });
          resolve({ ok:false, code:'delete-base-hash-unavailable',
                    verdict:'DELETE_ABORTED_NO_BASE_HASH',
                    baseHashWhy: String(why || 'UNKNOWN'), mutated:false });
          return;
        }
        resolve(f734Continue(h));
      });
    });
  }

  /* ---- 保留分の続き（再接続後に呼ぶ） ------------------------------------ */
  /* ★★fix710(GPT裁定 PRIORITY 1): 呼び出し側が「この planId だけ」を指定できるようにする。
     引数なしの呼び出しは **1バイトも振る舞いが変わらない**（既存 autoResume / コンソール操作はそのまま）。
     これは HOME の boot trigger(fix710) が
       「pre-fix708 の historical pending を 1件も autoResume 対象にしない」
     という裁定条件を、fix587 の delete transaction 本体を作り直さずに満たすためだけの絞り込み。
     ★広げる方向には使えない: off / 依存欠け / terminal の判定は先に効いたままで、
       ここでできるのは **候補を減らすこと** だけ。 */
  function resumePending(opts){
    var d = dep();
    if (restoreHold()) return Promise.resolve({ ok:false, code:'restore-hold' });   /* ★fix721.1 */
    if (off() || missingDeps(d).length) return Promise.resolve({ ok:false, code:'not-ready' });
    /* ★fix708(Q3): terminal（再送では直らない）計画は自動再開の対象にしない。 */
    var allPending = readPending();
    var resumable = resumablePending();
    var skipped = allPending.length - resumable.length;
    if (skipped > 0) stats.sdResumeSkippedTerminal += skipped;
    var list = resumable, filteredOut = 0;
    if (opts && Object.prototype.hasOwnProperty.call(opts, 'onlyPlanIds')){
      var ids = opts.onlyPlanIds;
      /* ★★fix710(GPT裁定): 絞り込みを **要求されたのに解釈できない** ときは
         **全件 sweep へ戻してはいけない**（historical まで巻き込むため）。fail-closed。 */
      if (Object.prototype.toString.call(ids) !== '[object Array]'){
        stats.sdResumeInvalidFilter++;
        return Promise.resolve({ ok:false, code:'invalid-filter', done:0,
                                 skippedTerminal: skipped, filteredOut: resumable.length,
                                 pending: allPending.length });
      }
      var want = {};
      for (var oi = 0; oi < ids.length; oi++) want[String(ids[oi])] = 1;
      /* 同一 planId が pending に二重に載っていても **1回しか処理しない** */
      var seenPlan = {};
      list = resumable.filter(function(p){
        if (!p || want[String(p.planId)] !== 1) return false;   /* unknown id は無視（他 plan へ影響 0） */
        var k = String(p.planId);
        if (seenPlan[k] === 1) return false;
        seenPlan[k] = 1;
        return true;
      });
      filteredOut = resumable.length - list.length;
      stats.sdResumeFilteredOut += filteredOut;
    }
    /* ★空配列 = 対象0件。ここで止める（全件 resume へ fallback しない）。 */
    if (!list.length) return Promise.resolve({ ok:true, code:'nothing', done:0,
                                               skippedTerminal: skipped, filteredOut: filteredOut,
                                               pending: allPending.length });
    /* ★★fix708: ON のときは **legacy pkg push を待たない**。各計画を新 protocol へ通す。
       （旧実装は push 成功を全計画の前提条件にしていた＝今回直した結線そのもの） */
    if (sdOn()){
      var chain = Promise.resolve(), done2 = 0, held = [];
      list.forEach(function(plan){
        chain = chain.then(function(){
          return finishShadowDelete(plan, d, plan.snapshotId || plan.recoverySnapshotId || null, PP_MODE.RESUME)
            .then(function(r){
              if (r && r.code === 'deleted') done2++;
              else held.push({ slotId: plan.slotId, code: (r && r.code) || '?', verdict: (r && r.verdict) || null });
            }, function(){ held.push({ slotId: plan.slotId, code:'threw', verdict:null }); });
        });
      });
      return chain.then(function(){
        return { ok:true, code:'resumed', shadowDelete:true, done: done2,
                 pending: readPending().length, skippedTerminal: skipped,
                 filteredOut: filteredOut, held: held };
      });
    }
    /* ★★fix734(RULING100): OFF 分岐は finish() を通らず executePlan を直接呼ぶため、
       ここでも guarded plan を除外する。除外した計画は pending に残したまま理由だけ記録する。 */
    var guardedOut = list.filter(isGuardedPlan);
    if (guardedOut.length){
      list = list.filter(function(p){ return !isGuardedPlan(p); });
      guardedOut.forEach(function(p){
        stats.f734GuardedDowngradeRefused = (stats.f734GuardedDowngradeRefused || 0) + 1;
        note({ act:'refused', slotId: p && p.slotId, deleteOpId: p && p.deleteOpId,
               why:'fix708 の安全管理下に入った計画を kill switch OFF で legacy 物理削除へ降格させない' });
      });
      if (!list.length)
        return Promise.resolve({ ok:true, code:'pending-guarded-no-downgrade',
                                 verdict:'DELETE_PLAN_SAFETY_MONOTONICITY_HOLD',
                                 done:0, guardedHeld: guardedOut.length,
                                 pending: readPending().length, skippedTerminal: skipped,
                                 filteredOut: filteredOut });
    }
    return pushTombstone(d).then(function(pushed){
      /* ★fix589: 'still-offline' は誤解を招く名前だった（実際の原因は空ガードでもオフラインと表示された）。
         コード名を実態に合わせ、**理由を必ず返す**。 */
      if (!pushed) return { ok:false, code:'push-failed', why: lastPushWhy, pending:list.length };
      var done = 0, blocked = [];
      list.forEach(function(plan){
        var r = executePlan(plan, d);
        if (!r.refused.length){ dropPending(plan.planId); done++; stats.completed++;
          note({ act:'completed(resume)', slotId:plan.slotId, deleteOpId:plan.deleteOpId }); return; }
        /* ★fix602: 同じ計画を無限に再試行しない。終端へ移すか、回数を数えて保留する。 */
        var outcome = afterRefusal(plan, r.refused);
        if (String(outcome).indexOf('blocked') === 0)
          blocked.push({ slotId: plan.slotId, reason: outcome, humanReason: humanReason(outcome) });
      });
      return { ok:true, code:'resumed', done: done, pending: readPending().length,
               filteredOut: filteredOut, blocked: blocked };
    });
  }

  /* ---- ★★fix736: LDR terminal cleanup entrypoint（owner explicit / 1 件だけ） ----
     RULING111-A Architecture B。
     ・caller が渡してよいのは planId / slotId だけ。authority は 1 つも受け取らない
     ・server の deleted / rev / hash / proof / policy 結果を caller から受け取らない
     ・entrypoint 自身が fresh getstory を 1 回だけ取得し、runtime-only proof を作る
     ・物理削除は既存 physicalPhase を再利用する。
       classification fail-closed → fix735 deletePolicy → TOCTOU binding → fix569 gate
     ・executePlanInner / fix569 / removeItem を直接呼ばない
     ・deleteshadow は送らない（server は既に tombstone 済み）
     ・boot / autoResume / timer / sweep からは絶対に呼ばれない（呼び出し側は owner のみ）
     ・confirm:'OWNER_EXPLICIT' は **認証ではない**。誤操作防止 marker。 */
  var LDR_CLEANUP_CONFIRM = 'OWNER_EXPLICIT';
  function ldrCleanupOnce(req){
    function fail(code, why, extra){
      var o = { ok:false, code:code, why: why || null, deleted:[], refused:[],
                serverChecked:false, planRetained:true };
      if (extra) for (var k in extra){ if (Object.prototype.hasOwnProperty.call(extra,k)) o[k] = extra[k]; }
      try { LDR_CLEANUP_SCOPE = null; clearLdrExecProof(); } catch(e){}
      return Promise.resolve(o);
    }
    if (off()) return fail('lifecycle-off', 'fix587 が OFF');
    if (restoreHold()) return fail('restore-hold', 'fix721 の復元トランザクション中');
    if (!req || typeof req !== 'object') return fail('bad-request', '引数が無い');
    /* ★誤操作防止 marker。これ単独では authorization にならない。 */
    if (req.confirm !== LDR_CLEANUP_CONFIRM) return fail('confirm-required', 'confirm marker が無い');
    /* ★caller が authority を渡そうとしたら、その時点で拒否する（黙って無視しない） */
    var FORBIDDEN = ['serverProof','proof','deleted','rev','serverRev','serverHash','hash',
                     'authority','allow','policy','keys','expectedKeys','bytes'];
    for (var fi = 0; fi < FORBIDDEN.length; fi++){
      if (Object.prototype.hasOwnProperty.call(req, FORBIDDEN[fi]))
        return fail('caller-authority-rejected', 'caller は authority を渡せない: ' + FORBIDDEN[fi]);
    }
    var planId = (req.planId == null) ? '' : String(req.planId);
    var slotId = (req.slotId == null) ? '' : String(req.slotId);
    if (!planId || !slotId) return fail('bad-target', 'planId と slotId の両方が必要');

    var d = dep();
    var miss = missingDeps(d);
    if (miss.length) return fail('deps-missing', miss.join(','));

    /* ① exact terminal plan を pending から 1 件だけ取る（同一 planId が複数なら拒否） */
    var all = readPending();
    var hits = [];
    for (var i = 0; i < all.length; i++){
      if (all[i] && String(all[i].planId) === planId) hits.push(all[i]);
    }
    if (hits.length !== 1) return fail('plan-not-unique', 'planId 一致が ' + hits.length + ' 件');
    var plan = hits[0];
    if (String(plan.slotId) !== slotId) return fail('slot-mismatch', 'plan.slotId と一致しない');

    /* ② RUNTIME PROVENANCE（terminal record 側）。external artifact は runtime では見ない。 */
    if (!isLdrTerminalPlan(plan)) return fail('not-ldr-terminal', 'LDR terminal plan ではない');
    if (typeof plan.snapshotId !== 'string' || plan.snapshotId === '')
      return fail('plan-no-snapshotid', 'snapshotId が無い');
    if (typeof plan.deleteOpId !== 'string' || plan.deleteOpId === '')
      return fail('plan-no-deleteopid', 'deleteOpId が無い');

    /* ③ local 墓標 barrier が立っていること（消さない。立っていることを要求する） */
    var metaOk = false;
    try {
      var mrows = readMeta();
      for (var mi = 0; mi < mrows.length; mi++){
        if (mrows[mi] && mrows[mi].deleted === true && String(mrows[mi].id) === slotId){ metaOk = true; break; }
      }
    } catch(e){ metaOk = false; }
    if (!metaOk) return fail('no-meta-tombstone', 'meta 墓標が無い');

    /* ④ fresh authority。**entrypoint 自身が** 1 回だけ getstory する。deleteshadow は送らない。 */
    var W = contract();
    if (!W) return fail('contract-unavailable', 'fix697 の shadow transport が無い');
    var sid = (plan.storyId != null && plan.storyId !== '') ? String(plan.storyId) : slotId;
    var planSnapshot = JSON.stringify(plan);   /* ★TOCTOU: authority 取得前の plan preimage */
    return new Promise(function(resolve){
      var settled = false;
      function done(o){ if (settled) return; settled = true;
        try { LDR_CLEANUP_SCOPE = null; clearLdrExecProof(); } catch(e){}
        resolve(o); }
      try {
        W.shadowRequest({ op:'getstory', id: sid }, function(r, err){
          try {
            if (err || !r) return done({ ok:false, code:'server-unreachable', why:String(err || '?'),
                                          deleted:[], refused:[], serverChecked:false, planRetained:true });
            var j = r.j || {};
            if (j.ok !== true) return done({ ok:false, code:'server-not-ok', why:String(j.code || r.status || '?'),
                                              deleted:[], refused:[], serverChecked:true, planRetained:true });
            if (j.deleted !== true) return done({ ok:false, code:'server-not-deleted',
                                                   why:'server 側が deleted:true ではない',
                                                   deleted:[], refused:[], serverChecked:true, planRetained:true });
            if (j.authority !== 'shadow' && j.authority !== 'canonical')
              return done({ ok:false, code:'server-authority-unexpected', why:String(j.authority || '?'),
                             deleted:[], refused:[], serverChecked:true, planRetained:true });
            if (typeof j.rev !== 'number' || j.rev !== plan.resolvedServerRev)
              return done({ ok:false, code:'server-rev-mismatch',
                             why:'rev が terminal record と一致しない',
                             deleted:[], refused:[], serverChecked:true, planRetained:true });
            if (j.id != null && String(j.id) !== String(sid))
              return done({ ok:false, code:'server-id-mismatch', why:String(j.id),
                             deleted:[], refused:[], serverChecked:true, planRetained:true });

            /* ⑤ runtime-only proof を **entrypoint 自身が** 作る。caller の値は使わない。 */
            var okSet = setLdrExecProof(plan.planId, slotId,
              { id: sid, deleted: true, rev: j.rev, authority: j.authority,
                serverConfirmedAt: Date.now() });
            if (!okSet) return done({ ok:false, code:'proof-setup-failed', why:null,
                                       deleted:[], refused:[], serverChecked:true, planRetained:true });
            LDR_CLEANUP_SCOPE = { planId: String(plan.planId), slotId: slotId, authorityAt: Date.now() };

            /* ★fix736: authority 取得中に plan が書き換えられていないことを、
               physicalPhase を呼ぶ **直前** に pending を再読して byte 単位で確認する。 */
            var again = readPending().filter(function(x){ return x && String(x.planId) === planId; });
            if (again.length !== 1 || JSON.stringify(again[0]) !== planSnapshot)
              return done({ ok:false, code:'plan-mutated-during-authority', why:null,
                             deleted:[], refused:[], serverChecked:true, planRetained:true });

            /* ⑥ 既存 physicalPhase を再利用する。ここから先の順序は 1 バイトも変えない。
               ★fix745(GWS Phase B): 呼び出しだけ shared lock で囲う（Class B）。
                 serialization 不要なら同期のまま＝legacy と完全同一。
                 BUSY なら物理削除0・plan は保持したまま次回へ回す。 */
            function ldrFinish(out){
              var retained = readPending().some(function(p){ return p && String(p.planId) === String(plan.planId); });
              done({ ok: !!(out && out.code === 'deleted'),
                     code: (out && out.code) || 'unknown',
                     deleted: (out && out.deleted != null) ? out.deleted : 0,
                     refused: (out && out.refused) || [],
                     serverChecked: true,
                     planRetained: retained,
                     snapshotId: plan.snapshotId });
            }
            var ppLdr = null;
            try {
              /* ★fix746: RECOVERY_LDR_CLEANUP。
                 この入口は pending に exact 一致する terminal plan が **1件だけ**存在しないと
                 上流の 'plan-not-unique' で fail するため、新しい delete intent を作れない
                 （＝裁定の recovery 条件を call-site で満たしている）。 */
              ppLdr = physicalPhaseGws(plan, d, plan.snapshotId,      /* ★fix745: 常にPromise */
                                       { ldrCleanup:true, verdict:'LDR_TERMINAL_LOCAL_CLEANUP' },
                                       PP_MODE.LDR);
            } catch(e){
              return done({ ok:false, code:'physical-threw', why:String(e && e.message || e),
                             deleted:[], refused:[], serverChecked:true, planRetained:true });
            }
            return ppLdr.then(function(out){
              if (out && out.gwsBusy === true)
                return done({ ok:false, code:'pending-gws-busy', why:(out && out.reason) || 'BUSY',
                              deleted:[], refused:[], serverChecked:true, planRetained:true,
                              gwsBusy:true, wrote:0, snapshotId: plan.snapshotId });
              return ldrFinish(out);
            }, function(e3){
              return done({ ok:false, code:'physical-threw', why:String(e3 && e3.message || e3),
                            deleted:[], refused:[], serverChecked:true, planRetained:true });
            });
          } catch(e2){
            done({ ok:false, code:'threw', why:String(e2 && e2.message || e2),
                   deleted:[], refused:[], serverChecked:false, planRetained:true });
          }
        });
      } catch(e3){
        done({ ok:false, code:'request-threw', why:String(e3 && e3.message || e3),
               deleted:[], refused:[], serverChecked:false, planRetained:true });
      }
    });
  }

  /* ---- ★T2: pull barrier の判定 ------------------------------------------
   * 取り込み側がこれを使って「墓標が立っているスロットのキーは書き戻さない」。
   * ここは判定を返すだけで、自分では何も書かない。 */
  function shouldBlockRestore(key){
    try {
      var d = dep();
      if (off() || !d.tomb || typeof d.tomb.isBlockedByTombstone !== 'function') return false;
      var r = d.tomb.isBlockedByTombstone(key, readMeta());
      return !!(r && r.blocked);
    } catch(e){ return false; }
  }
  /* 取り込みパッケージから、墓標対象のキーを取り除く（fix399/402 がこれを通す） */
  function filterIncoming(lsObj){
    var out = {}, blocked = [];
    try {
      Object.keys(lsObj || {}).forEach(function(k){
        if (shouldBlockRestore(k)){ blocked.push(k); return; }
        out[k] = lsObj[k];
      });
    } catch(e){ return { ls: lsObj, blocked: [] }; }
    if (blocked.length) note({ act:'pullBlocked', count: blocked.length, sample: blocked.slice(0, 5) });
    return { ls: out, blocked: blocked };
  }

  /* ★保留分の自動再開。
     home.html はクラウドpush(fix399)を積んでいないので、そこでの削除は必ず
     「墓標は立てたが物理削除は保留」になる。アプリ(index.html)が開いたときに続きをやる。
     ★起動直後は同期の初期化が終わっていないので、少し待ってから1回だけ試す。
       失敗しても次回の起動でまた試すので、ここでしつこく再試行しない。 */
  /* ★★fix589: ここで fix399 の有無を判定してはいけなかった。
     index.html のスクリプト順は **fix587(2863行) → fix399(2919行)** なので、
     この関数が走る時点で `window.__v292Dfix399x` は**必ず未定義**。
     旧実装は `if (!d.sync) return;` で毎回そこで抜けており、
     **8秒のタイマーすら仕込まれていなかった**＝「次にアプリを開いたら続きを片づける」という
     fix587 の約束が実機で一度も成立していなかった。
     （2026-07-27 の実機テストで `log()` が空・`pending` が残り続けることで判明）

     → 「居るようになるまで待つ」ポーリングへ。home.html には fix399 が無いので、
       一定回数で諦める（そこで何もしないのが正しい）。
     ★ここで待つのは**参照が現れるのを待つだけ**で、何かを設置するわけではない
       （fix573 で踏んだ「解析中に発火する遅延設置」とは別物）。 */
  var RESUME_POLL_MS = 500, RESUME_POLL_MAX = 40;   /* 最大20秒 */
  function autoResume(){
    try {
      if (off()) return;
      if (!resumablePending().length) return;      /* ★fix708: terminal だけなら何もしない */
      var tries = 0;
      (function waitForSync(){
        tries++;
        var d = dep();
        if (d.sync && typeof d.sync.push === 'function'){
          stats.autoResumeArmed++;
          /* 起動直後は同期の初期化が終わっていないので、少し待ってから1回だけ試す。
             失敗しても次回の起動でまた試すので、ここでしつこく再試行しない。 */
          setTimeout(function(){
            try { resumePending().then(function(r){
              try {
                if (r && r.done) console.log(TAG, '保留していた削除を ' + r.done + '件 片づけました');
                else if (r && !r.ok) console.warn(TAG, '保留の削除を片づけられません: ' + (r.code||'?') + ' / ' + (r.why||lastPushWhy||''));
              } catch(e){}
            }, function(){}); } catch(e){}
          }, 8000);
          return;
        }
        if (tries > RESUME_POLL_MAX){ stats.autoResumeGaveUp++; return; }
        setTimeout(waitForSync, RESUME_POLL_MS);
      })();
    } catch(e){}
  }
  /* ★★fix745(GWS Phase B): module-scope autoResume は **必ず GWS を通す**。
     ・GWS 不在 / serialization 不要（C1 OFF・journal無し ＝ production の通常状態）
         → その場で同期実行。legacy と1バイトも変わらない（呼び出し位置・タイミング・guard）。
     ・serialization 必要（C1 active）
         → GWS_BOOT_RECOVERY_BARRIER に登録。barrier RESOLVED まで開始しない。
           CONFLICT/PENDING なら **1度も走らない**（fail-closed / pending は保持）。
     autoResume 自体は storage を読むだけで、実際の書込みは 8s 後の resumePending →
     physicalPhase（＝別途 shared lock で囲う logical transaction）で起きる。 */
  var gwsBypassed587 = false;
  (function(){
    var G = null;
    try { G = window.__v292DfixGWS || null; } catch(e){ G = null; }
    if (G && typeof G.runBootRecovery === 'function'){
      G.runBootRecovery('FIX587', function(){ try { autoResume(); } catch(e){} });
      return;
    }
    gwsBypassed587 = true;
    try { autoResume(); } catch(e){}
  })();

  window.__chronicleStoryLifecycle = {
    __armed: true,
    gwsBypassed: function(){ return gwsBypassed587; },
    requestDelete: requestDelete,
    resumePending: resumePending,
    pendingDeletes: readPending,
    /* ★★fix602: 「なぜ片づいていないのか」を読める口。どれも読むだけで何も書かない。 */
    blockedDeletes: readBlocked,
    refusals: readRefusals,
    humanReason: humanReason,
    /* 画面に出すための1行。★該当が無ければ null（＝黙るのではなく「無い」と言える形） */
    /* ★fix642(2026-07-29): 後継の計画で片づいた記録（superseded）は**画面に出さない**。
       fix642 は「旧blockedレコードを消さずに superseded を付けて履歴に残す」ので、
       ここで除かないと、片づけが完了した後も「停止しました」と言い続ける（＝嘘の警告）。
       ★履歴そのものは残す。blockedDeletes() は従来どおり全件を返す。 */
    pendingSummary: function(){
      var p = resumablePending(), b = readBlocked().filter(function(x){ return x && !x.superseded; });
      if (!p.length && !b.length) return null;
      var out = [];
      if (p.length) out.push('削除の後片づけが' + p.length + '件残っています');
      for (var i = 0; i < b.length; i++)
        out.push('削除の後片づけを停止しました（' + humanReason(b[i].blockedReason) + '）');
      return { pending: p.length, blocked: b.length, lines: out };
    },
    MAX_ATTEMPTS: MAX_ATTEMPTS,
    /* ★fix589: 「なぜクラウドへ確定できないのか」を実機で読めるようにする */
    lastPushWhy: function(){ return lastPushWhy; },
    shouldBlockRestore: shouldBlockRestore,
    filterIncoming: filterIncoming,
    /* ★fix588(GPT裁定D-5): 送信側で分類器が居らず墓標スロットを除外できなかったことを記録する口。
       通常同期は fail-open で通すが、記録は必ず残す（物理削除の解禁条件に効く）。 */
    noteFilterUnavailable: function(){ stats.tombstonePayloadFilterUnavailable++; },
    /* ★fix562 の deletePolicy がこれを見て lifecycle-delete を解禁する */
    tombstoneBarrierReady: true,
    /* ★★fix736(RULING111-A): owner explicit / 1 件だけの LDR terminal cleanup。
       boot / autoResume / timer / sweep からは呼ばれない。汎用 sweep 引数を持たない。 */
    ldrCleanupOnce: ldrCleanupOnce,
    /* ★★fix735(RULING109 §4 / R110 最優先2): LDR server proof の **非永続** 受け口。
       ここへ渡した proof は runtime memory にしか置かれない。localStorage /
       sessionStorage / IndexedDB / pending plan / meta / snapshot へは書かれない。
       executePlan を 1 回通ると必ず破棄される。reload すると必ず消える。 */
    provideLdrServerProof: function(planId, slotId, proof){ return setLdrExecProof(planId, slotId, proof); },
    clearLdrServerProof: function(){ clearLdrExecProof(); },
    /* 観測用。**proof の中身は返さない**（有無と対象だけ） */
    ldrServerProofStatus: function(){
      var h = LDR_EXEC_PROOF;
      return { present: !!h, planId: h ? h.planId : null, slotId: h ? h.slotId : null,
               persisted: false };
    },
    /* ★★fix708(STEP3F): 読むだけの観測口。ここから何かを起動することはできない。 */
    shadowDeleteStatus: function(){
      var W = contract();
      return { on: sdOn(), protocolVersion: SHADOW_DELETE_PROTOCOL_VERSION,
               contractAvailable: !!W,
               resumableCount: resumablePending().length,
               terminalCount: readPending().length - resumablePending().length,
               pending: readPending().map(function(p){
                 return { planId: p && p.planId, slotId: p && p.slotId,
                          storyId: (p && p.storyId) || null,
                          hasBaseHash: !!(p && p.localDeleteBaseHash),
                          baseHashWhy: (p && p.localDeleteBaseHashWhy) || null,
                          shadowDeleteVersion: (p && p.shadowDeleteVersion) || null,
                          terminal: !!(p && p.sdTerminal),
                          hold: (p && p.sdHold) || null };
               }) };
    },
    SHADOW_DELETE_PROTOCOL_VERSION: SHADOW_DELETE_PROTOCOL_VERSION,
    stats: function(){ return JSON.parse(JSON.stringify(stats)); },
    log: function(){ return LOG.slice(); },
    isOff: off,
    LIFECYCLE_VERSION: LIFECYCLE_VERSION
  };
})();
