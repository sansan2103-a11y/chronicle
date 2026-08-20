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
                /* ★★fix710: 呼び出し側の planId 絞り込みで resume 対象外にした件数 */
                sdResumeFilteredOut: 0, sdResumeInvalidFilter: 0 };
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
  //   (7) 404/absent → CLOUD_ALREADY_ABSENT（サーバに墓標行は作らない）→ 物理削除可
  //   (8) deleted=true → CLOUD_ALREADY_DELETED → 物理削除可
  //   (9) authority=canonical → DELETE_CANONICAL_UNSUPPORTED → 止まる
  //  (10) deleteshadow 成功後にだけ fix660 ゲート経由の物理削除
  //  (11) legacy pkg push は **後追いの best-effort**。失敗しても削除は巻き戻さない
  //
  // 既定 OFF（v292Dfix708On==='1' かつ v292Dfix708Off!=='1' のときだけ新経路）。
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
  var SD_TERMINAL_VERDICTS = { DELETE_BASE_CONFLICT: 1, DELETE_CANONICAL_UNSUPPORTED: 1 };
  function sdTerminalReason(verdict){
    return (verdict === 'DELETE_BASE_CONFLICT') ? 'blocked-delete-base-conflict'
         : (verdict === 'DELETE_CANONICAL_UNSUPPORTED') ? 'blocked-delete-canonical-unsupported'
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
  function sdOn(){
    try { return lsg('v292Dfix708On') === '1' && lsg('v292Dfix708Off') !== '1'; }
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
  function executePlan(plan, d){
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
      'blocked-delete-canonical-unsupported': 'この物語は保護された保存方式に切り替わっているため停止しました'
    };
    return m[String(reason)] || '確認が必要です';
  }

  /* ---- 保留中の削除（tombstoneは立ったが物理削除がまだ） ----------------- */
  var PENDING_KEY = 'v292Dfix587_pending';
  function readPending(){
    try { var a = JSON.parse(lsg(PENDING_KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch(e){ return []; }
  }
  function writePending(a){ return lss(PENDING_KEY, JSON.stringify(a.slice(-20))); }
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
  function dropPending(planId){
    var a = readPending().filter(function(x){ return x.planId !== planId; });
    writePending(a); stats.pending = a.length;
  }

  /* ---- ⑦⑧ 物理削除フェーズ（クラウド確定**後**に共通で使う） --------------
     ★fix708: 従来 finish の後半をそのまま切り出したもの。判定・順序は変えていない。 */
  function physicalPhase(plan, d, snapshotId, extra){
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
    /* ⑦⑧ */
    var r = executePlan(plan, d);
    if (r.refused.length){
      /* ★fix602: ここで無条件に addPending すると、**同じhashの計画を永久に拒否され続ける**。
         一過性かどうかを判定し、自動で片づけられないものは理由つきの終端状態へ移す。 */
      var outcome = afterRefusal(plan, r.refused);
      note({ act:'partial', slotId:slotId, deleteOpId:deleteOpId, deleted:r.deleted.length,
             refused:r.refused, outcome: outcome });
      return withExtra({ ok:true, code:'partial', deleteOpId:deleteOpId, snapshotId:snapshotId,
               deleted:r.deleted.length, refused:r.refused,
               outcome: outcome, humanReason: humanReason(outcome) });
    }
    /* 保留に載っていたときだけ外す（載っていないのに書くと、無意味な localStorage 書込みになる） */
    if (readPending().some(function(p){ return p && p.planId === plan.planId; })) dropPending(plan.planId);
    stats.completed++;
    note({ act:'completed', slotId:slotId, deleteOpId:deleteOpId, deleted:r.deleted.length });
    return withExtra({ ok:true, code:'deleted', deleteOpId:deleteOpId, snapshotId:snapshotId, deleted:r.deleted.length });
  }

  /* ---- ⑥⑦⑧ 旧経路: legacy pkg push が通ってから物理削除（fix708 OFF 時） ---- */
  function finishLegacy(plan, d, snapshotId){
    var slotId = plan.slotId, deleteOpId = plan.deleteOpId;
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
      return physicalPhase(plan, d, snapshotId, null);
    });
  }

  /* ---- ★★fix708: 新経路（shadow delete protocol） ------------------------ */
  function finishShadowDelete(plan, d, snapshotId){
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
      var out = physicalPhase(plan, d, snapshotId, e);
      bestEffortLegacyPush(plan, d);          /* ★(11) 失敗しても巻き戻さない */
      return out;
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
        /* (7) 行が無い = クラウドにはもう存在しない。サーバ墓標行は **作らない**。 */
        if (r.status === 404 || j.errorCode === 'not-found'){
          stats.sdAlreadyAbsent++;
          resolve(proceedPhysical('CLOUD_ALREADY_ABSENT'));
          return;
        }
        if (r.status !== 200 || !j.ok){
          resolve(hold('pending-cloud', 'DELETE_SERVER_ERROR',
                       'getstory status=' + r.status + ' code=' + String(j.errorCode || '?')));
          return;
        }
        var auth = String(j.authority || 'shadow');
        /* (9) canonical の削除は本ラウンドの対象外。止まる。 */
        if (auth !== 'shadow'){
          stats.sdCanonicalUnsupported++;
          resolve(hold('blocked-canonical', 'DELETE_CANONICAL_UNSUPPORTED',
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
  function finish(plan, d, snapshotId){
    if (!sdOn()) return finishLegacy(plan, d, snapshotId);
    return finishShadowDelete(plan, d, snapshotId);
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
      return finish(plan, d, plan.snapshotId || tomb.recoverySnapshotId || null);
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
  function requestDelete(slotId, opts){
    opts = opts || {};
    stats.requested++;
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

    /* ②exact key と hash を確定 */
    var keys = planKeys(slotId, d);
    if (!keys.length){
      stats.refused++; return Promise.resolve({ ok:false, code:'no-keys' });
    }

    /* ③スナップショット作成（＝復元セット。新しい退避方式は作らない）
       ★fix588(GPT裁定C): 復元セットが**どの削除操作のものか**を後から確認できるように、
         deleteOpId を先に決めて manifest の reason に埋め込む。
         （fix564 の形は変えない。pending を失った異常系で「別のsnapshotへ差し替わった」を検出するため） */
    var now = Date.now();
    var deleteOpId = 'del_' + slotId + '_' + now;
    var snap = null;
    try { snap = d.snap.create(slotId, { now: now, reason: 'lifecycle-delete:' + deleteOpId }); }
    catch(e){ snap = { ok:false, error:String(e && e.message) }; }
    if (!snap || !snap.ok){
      stats.refused++;
      note({ act:'refused', slotId:slotId, source:src, why:'復元セットを作れない: ' + ((snap && snap.error) || '?') });
      return Promise.resolve({ ok:false, code:'snapshot-failed', error: snap && snap.error });
    }

    /* ④read-back・hash一致の検証。ここが通らなければ**絶対に消さない** */
    var ver = null;
    try { ver = d.snap.verify(snap.id); } catch(e){ ver = { ok:false }; }
    if (!ver || !ver.ok){
      stats.refused++;
      note({ act:'refused', slotId:slotId, source:src, why:'復元セットの検証に失敗' });
      return Promise.resolve({ ok:false, code:'snapshot-unverified', snapshotId: snap.id });
    }

    /* ★★fix708(1): **墓標を立てる前に** live projection から canonical hash を確定する。
       墓標を立てた後は fix697 の projection が null になるため、ここでしか取れない
       （後から作り直すのは「別物の hash」を作ることであり、裁定で禁止されている）。 */
    function proceed(baseHash, baseWhy){
      /* ⑤meta に tombstone を立てる */
      var meta = readMeta();
      var cur = meta.filter(function(e){ return e && String(e.id) === String(slotId); })[0] || null;
      var tomb = d.tomb.make({ slotId: slotId, title: (cur && cur.name) || (cur && cur.title) || '',
                               deletedAt: now, deleteOpId: deleteOpId, recoverySnapshotId: snap.id });
      if (!tomb || !d.tomb.validate(tomb).ok){
        stats.refused++; return Promise.resolve({ ok:false, code:'tombstone-invalid' });
      }
      var next = meta.filter(function(e){ return !e || String(e.id) !== String(slotId); });
      next.push(tomb);
      if (!writeMeta(next)){
        stats.refused++;
        note({ act:'refused', slotId:slotId, source:src, why:'metaへ墓標を書けない（容量不足）' });
        return Promise.resolve({ ok:false, code:'tombstone-write-failed' });
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
        if (!baseHash) plan.localDeleteBaseHashWhy = String(baseWhy || 'UNKNOWN');
      }

      /* ⑥tombstone をクラウドへ確定させてから、はじめて物理削除する */
      return finish(plan, d, snap.id);
    }

    if (!sdOn()) return proceed(null, null);      /* ★OFF は従来と完全に同じ経路 */
    return new Promise(function(resolve){
      captureDeleteBaseHash(slotId, function(h, why){
        note({ act:'delete-base-hash', slotId:slotId, deleteOpId:deleteOpId,
               captured: !!h, why: (h ? null : String(why || '?')) });
        resolve(proceed(h, why));
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
          return finishShadowDelete(plan, d, plan.snapshotId || plan.recoverySnapshotId || null)
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
  try { autoResume(); } catch(e){}

  window.__chronicleStoryLifecycle = {
    __armed: true,
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
