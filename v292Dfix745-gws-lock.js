/* v292Dfix745 — GLOBAL WRITER SERIALIZATION（GWS）共有ロック層
 * GPT裁定 GLOBAL_WRITER_SERIALIZATION = SHARED_WEB_LOCK_BY_LOGICAL_TRANSACTION / GO
 *   ・13 materialization target keys のうち1つでも書く logical transaction は、
 *     C1 active 時に同じ exclusive Web Lock へ参加する。
 *   ・lock は **setItem 1回単位ではなく logical transaction 全体**を囲う。
 *   ・fix246 等の低レベル setItem wrapper を serialization layer にはしない（裁定REJECT）。
 *   ・network 待機中は lock を保持しない（呼び出し側が応答取得後に取ること）。
 *     ★★裁定38 GWS_NETWORK_WAIT_SCOPE = ACCEPTED_NARROW_EXCEPTION:
 *       GENERAL: この一般ルールは**変更しない**。network 待機を lock 内へ一般化しない。
 *       NARROW EXCEPTION: fix750 の exact-one-story **foreground** materialization
 *         （prepare / commitSchema2）に限り、logical transaction 全体の lock 保持を許容する。
 *         理由: lock 解除 → network → その間の local 変更 → 再 lock → stale projection 判定 →
 *         server 側 partial state との整合、という新しい状態機械を今作る方が危険と裁定された。
 *       条件（裁定37/38 逐語）: fix750 限定 / exact one story / foreground transaction 限定 /
 *         background migration 禁止 / turn・user semantic action との並行実行禁止 /
 *         cross-context BUSY は fail-closed（silent skip 禁止）/ blind retry 禁止 /
 *         既存 bounded network timeout を維持。
 *       ★この例外を他の writer（Class A/B/C/D の一般経路）へ転用することを禁止する。
 * BUSY policy は writer class 別（裁定4クラス）:
 *   A REPLAYABLE_REMOTE_APPLY  → DROP_AND_REFETCH      （write0・成功扱いしない・reloadしない）
 *   B RECOVERY_OR_DESTRUCTIVE  → HARD_HOLD_NO_WRITE    （write0・journal保持・通常処理を進めない）
 *   C RECOMPUTABLE_PERSIST     → SKIP_THIS_PERSIST     （write0・次tickで再生成）
 *   D TURN_OR_USER_SEMANTIC    → TURN_MUTATION_BUSY_HOLD（write0・silent skip禁止・上位を中止）
 * activation: C1 enabled OR C1 journal/RECOVERY_REQUIRED 存在。**transaction直前に毎回動的確認**
 *   （boot時cache禁止。別tabでC1がactiveになった場合にlockをbypassしてはならない）
 * kill switch : localStorage v292Dfix745Off='1'
 */
(function () {
'use strict';
if (typeof window === 'undefined') return;
if (window.__v292DfixGWS) return;

var LOCK_NAME = 'chronicle:cc2:materialization:v1';
var C1_JOURNAL_KEY = 'v292Dfix705_hydrateTxn';   /* C1 専用journal（fix743契約） */
/* ★★裁定33 OPTION_A（GWS_FIX750_ACTIVATION_WIRING）:
   fix750 の C1 materialization も GWS の活性条件に入れる。
   これが無いと fix750On=1 / CC2On absent のとき serializationRequired()===false になり、
   _runExclusive が legacy bypass するため fix750 は自分のガードで write0 になり、
   live prepare が構造的に実行できない（GWS_ACTIVATION_GAP_FOR_FIX750）。
   ★既存の CC2 / fix705 判定は 1 バイトも変えない。 */
var MAT_JOURNAL_KEY = 'v292Dfix750_matTxn';       /* fix750 materialization journal */
/* ★★裁定40 BLOCKER #10 = C1_POST_RELEASE_STALE_CONTEXT_REENTRY:
     journal 存在中の stale tab は裁定39 で止まるようになったが、recovery completion で
     matTxn を clear した瞬間、昔から開いている tab は matRecoveryActive()===false /
     serializationRequired()===false へ**動的復帰**して、古い in-memory 状態のまま
     writer を再開できてしまう。
   ★対策: recovery release epoch。document は load 時の値を baseline として持ち、
     transaction のたびに現在値と比較する。違えば MATERIALIZATION_RELOAD_REQUIRED。
     fresh reload した document だけが新 epoch を baseline として受け入れられる。 */
var RELEASE_EPOCH_KEY = 'v292Dfix750_recoveryReleaseEpoch';
var CLASS = { A: 'REPLAYABLE_REMOTE_APPLY', B: 'RECOVERY_OR_DESTRUCTIVE',
              C: 'RECOMPUTABLE_PERSIST',   D: 'TURN_OR_USER_SEMANTIC' };
var BUSY = { A: 'DROP_AND_REFETCH', B: 'HARD_HOLD_NO_WRITE',
             C: 'SKIP_THIS_PERSIST', D: 'TURN_MUTATION_BUSY_HOLD' };

function lsGet(k){ try { return localStorage.getItem(k); } catch (e){ return null; } }
function off(){ return lsGet('v292Dfix745Off') === '1'; }

/* ★load 時に 1 回だけ読む。以後この document ではこの値が baseline（動的に更新しない）。 */
var releaseEpochAtLoad = lsGet(RELEASE_EPOCH_KEY);
function releaseEpochNow(){ return lsGet(RELEASE_EPOCH_KEY); }
function releaseEpochStale(){ return releaseEpochNow() !== releaseEpochAtLoad; }
/* ★epoch を進める。recovery completion からのみ呼ばれる（下の dedicated entry 内）。
   成功したら新しい値を返し、書けなければ null を返す（journal は消さない＝fail-closed）。 */
function bumpReleaseEpoch(){
  var prev = lsGet(RELEASE_EPOCH_KEY);
  var v = String(Date.now()) + '-' + Math.random().toString(36).slice(2, 10);
  /* ★裁定41 EPOCH NON-REUSE: 生成値が旧値と同じなら fail-closed。再生成ループは作らない。 */
  if (prev !== null && v === prev) return null;
  try { localStorage.setItem(RELEASE_EPOCH_KEY, v); } catch (e){ return null; }
  if (lsGet(RELEASE_EPOCH_KEY) !== v) return null;      /* 読み戻して確認 */
  /* ★裁定41: 永続化後も old value と必ず異なることを明示確認。 */
  if (prev !== null && lsGet(RELEASE_EPOCH_KEY) === prev) return null;
  return v;
}

function locksApi(){
  try {
    var nav = (typeof navigator !== 'undefined') ? navigator : null;
    if (!nav || !nav.locks || typeof nav.locks.request !== 'function') return null;
    return nav.locks;
  } catch (e){ return null; }
}

/* C1 が active か。★boot時cache禁止：呼ばれるたびに読む */
/* ★★裁定33 OPTION_A: fix750 の materialization が「開始し得る」または「進行中」なら true。
   契約（逐語）:
     1) journal 存在は kill switch より強い。v292Dfix750Off=1 でも matTxn があれば active。
        既存 transaction/recovery が残っている状態で、kill switch を理由に GWS を解除しない。
     2) matTxn は JSON parse 結果で判定しない。non-null なら active。
        壊れた journal ほど fail-closed で serialization を維持する。
   ★新 lock 名は作らない（chronicle:cc2:materialization:v1 のみ）。
   ★裁定37 で activeRecoveries() へ 'MAT' として追加した（裁定33 の DEFER は解除）。
     ただし MAT は **recovery handler を持たない**。下の bootRecoveryBarrier を参照。 */
/* ★★fix756 NEW_STORY_SCHEMA2_DEFAULT: 裁定33 OPTION_A と同じ GWS_ACTIVATION_GAP 対策を
   **in-memory auto permit** にも適用する（裁定31 P0-3: 永続 flag に依存しない）。
   permit が armed の間だけ serializationRequired() を true にする。
   ・これは **活性化を広げるだけ**で、どの gate も緩めない（狭める方向のみ）。
   ・matRecoveryActive()（generic MAT hold）には影響しない — あちらは journal 存在のみ。
   ・window.__v292Dfix750 は fix745 より後に load されるが、この関数は transaction のたびに
     呼ばれる（boot 時 cache 禁止）ので参照時点では必ず解決している。不在なら false。 */
function autoNewStoryPermitArmed(){
  try {
    var F = window.__v292Dfix750;
    return !!(F && typeof F.autoPermitArmed === 'function' && F.autoPermitArmed());
  } catch (e){ return false; }
}
function materializationActive(){
  if (lsGet(MAT_JOURNAL_KEY) != null) return true;   /* journal 生存 > kill switch */
  if (lsGet('v292Dfix750Off') !== '1' && lsGet('v292Dfix750On') === '1') return true;
  if (lsGet('v292Dfix750Off') !== '1' && autoNewStoryPermitArmed()) return true;   /* ★fix756 */
  return false;
}
function c1Active(){
  try {
    var cc2 = window.__v292DfixCC2;
    if (cc2 && typeof cc2.isEnabled === 'function' && cc2.isEnabled()) return true;
  } catch (e){}
  /* ★fix743 の load 順に依存しないよう raw flag も見る。kill switch は常に優先 */
  if (lsGet('v292DfixCC2Off') !== '1' && lsGet('v292Dfix743Off') !== '1'
      && lsGet('v292DfixCC2On') === '1') return true;
  var j = lsGet(C1_JOURNAL_KEY);
  if (j != null) return true;                       /* journal 生存 = transaction/recovery 進行中 */
  if (materializationActive()) return true;         /* ★裁定33: fix750 materialization */
  return false;
}
/* ★★裁定11 FINAL GATE 2（SAFETY SWITCH FAIL-CLOSED）:
   kill switch 1 個で全 writer が GWS を素通りできてはいけない。
     C1 inactive かつ C1 journal 無し … v292Dfix745Off=1 で legacy bypass を許可（従来どおり）
     C1 active または journal 生存    … v292Dfix745Off=1 でも直列化要求を **落とさない**。
                                        代わりに transaction を GWS_SAFETY_DISABLED_HOLD で止める（write0）。
   GWS を本当に切りたいときは **先に C1 を OFF にする**（順序を強制する）。 */
function safetyDisabled(){ return off() && c1Active(); }
function serializationRequired(){ return c1Active(); }

/* fn は同期 or Promise を返す関数。Promise なら settle まで lock を保持する。
 * 戻り値: { ran:true, result } | { ran:false, reason, policy } */
/* ★★裁定(Phase B review §2): **汎用 same-context reentrant 機構は作らない**。
   `heldDepth > 0 → lock bypass` は REJECT された。外側 transaction が Promise を返して
   lock 保持のまま async 待機している間に、同じ window の無関係な timer/event callback が
   runExclusive へ入ってきた場合、深さカウンタでは
     「外側 transaction の正当な子」と「無関係な別 logical transaction」を区別できないため。

   代わりに **明示的 opaque ownership token** を使う。
     ・token は lock を実際に取得した critical section の中でのみ発行される。
     ・fn は第1引数で token を受け取り、**自分が起動した子にだけ**渡す。
     ・token を持たない writer は、たとえ同一 context でも通常どおり lock 取得を試みる
       （＝保持中なら CROSS_CONTEXT_BUSY で弾かれる）。
   → 「同じタブだから」では通らず、「親から token を渡された正当な子」だけが通る。 */
var currentToken = null;                 /* 実際に lock を保持している間だけ非 null（同時に1つ） */
function mintToken(){
  return { __gwsOwnership: true, lock: LOCK_NAME,
           id: 'gws-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10) };
}
/* 渡された token が「いま保持している lock そのもの」かどうか。参照一致のみを認める。 */
function isLockOwner(tok){ return !!(tok && currentToken && tok === currentToken); }
/* ★裁定11 GATE3(GLOBAL WRITE BYPASS AUDIT) 用の **読み取り専用** シグナル。
   いまこの context が GWS の critical section の中に居るか。token そのものは返さないので
   forge できない（＝bypass の口にならない）。監査 fixture 以外からは使わない。 */
function heldNow(){ return currentToken !== null; }

/* ★★C13 Proof B / Gate B（GPT裁定）:
     「check → lock」ではなく **「lock → check → mutation」** が最終 admission。
     enable 時に正常でも、その後 __chr6Key が throw したり chr6_active_slot が壊れると
     fix246 の suffix() は '' へ fail-open して base key を再生成し得るため、
     **shared lock を取った後・mutation の直前**に SLOT_ISOLATION_AUTHORITY を再確認する。
     失敗 = SLOT_ISOLATION_RUNTIME_HOLD / forward write 0 / silent skip 禁止 / base fallback 禁止。

   ★例外: RECOVERY MAY REPAIR / NEW MUTATION MAY NOT PROCEED
     既存 recovery（C1 / fix721 / fix587 の journal・pending）は isolation FAIL だけを理由に
     止めない。呼び出し側が opts.isolationExempt:true を明示した transaction のみ免除する。 */
function isolationGate(){
  try {
    var S = window.__v292DfixSlotIso;
    if (!S || typeof S.checkRuntime !== 'function')
      return { ok: false, hold: 'SLOT_ISOLATION_RUNTIME_HOLD', code: 'SLOT_ISOLATION_AUTHORITY_MISSING' };
    return S.checkRuntime();
  } catch (e){
    return { ok: false, hold: 'SLOT_ISOLATION_RUNTIME_HOLD', code: 'SLOT_ISOLATION_CHECK_THREW',
             detail: String(e && e.message || e) };
  }
}

/* ★GWS closure 内部専用。opts.isolationExempt はここからしか指定できない。 */
function _runExclusive(cls, fn, opts){
  opts = opts || {};
  var policy = BUSY[cls] || BUSY.D;
  var exempt = opts.isolationExempt === true;
  /* ★★裁定40 BLOCKER #10: epoch の判定は **legacy bypass より前**。
     recovery completion 後は serializationRequired() が false になるので、
     bypass の後に見たのでは手遅れになる。
     ★materializationOwner / recoveryCompletionOwner でも **免除しない**。
       fresh reload だけが新しい baseline を受け取れる。 */
  if (releaseEpochStale())
    return Promise.resolve({ ran: false, reason: 'MATERIALIZATION_RELOAD_REQUIRED',
                             policy: policy, wrote: 0, reloadRequired: true,
                             epochAtLoad: releaseEpochAtLoad, epochNow: releaseEpochNow() });
  if (!serializationRequired()) return Promise.resolve({ ran: true, result: fn(null), serialized: false });
  /* ★裁定11 GATE2: C1 active 中に GWS の kill switch が立っている = 直列化できない。
     ここで fail-open にすると 59 ファイルの結線が switch 1 個で無効化される。
     recovery（isolationExempt）も含めて **全部止める**（直列化できない状態で書かせない）。 */
  if (safetyDisabled())
    return Promise.resolve({ ran: false, reason: 'GWS_SAFETY_DISABLED_HOLD', policy: policy, wrote: 0,
                             detail: 'C1 が active のまま v292Dfix745Off が立っています。'
                                   + 'GWS を切るには先に C1 を OFF にしてください' });
  /* ★★裁定40: recovery completion は barrier PENDING でも通す必要がある。
     さもないと「recovery を解消する処理を recovery barrier 自身が永久に止める」循環になる。
     ただし通すのは **activeRecoveries() が exact ['MAT'] のとき**だけ。
     MAT + FIX721 / FIX587 / fix705(C1) の CONFLICT では従来どおり止める。 */
  var completionOwner = opts.recoveryCompletionOwner === true;
  /* ★★裁定43: ambiguous commit の明示 reconcile 専用 owner。
     barrier / generic MAT hold の越え方は completion owner と同一（exact ['MAT'] のときだけ）。
     ★ただし isolationExempt は **絶対に付けない**。この経路は schema2 の server write 能力を
       持つので、Gate B（slot isolation）は completion owner と違って免除できない。 */
  var reconcileOwner = opts.ambiguousReconcileOwner === true;
  var matGateOwner = completionOwner || reconcileOwner;
  var matOnly = (function(){ var a = activeRecoveries(); return a.length === 1 && a[0] === 'MAT'; })();
  if (!targetWriteAllowed() && !(matGateOwner && matOnly))
    return Promise.resolve({ ran: false, reason: 'BOOT_RECOVERY_BARRIER_' + barrierState, policy: policy, wrote: 0 });
  if (matGateOwner && !matOnly)
    return Promise.resolve({ ran: false, reason: 'MULTI_RECOVERY_CONFLICT', policy: policy, wrote: 0,
                             active: activeRecoveries(), journalsKept: true });
  /* ★★裁定39 BLOCKER #9 = C1_STALE_CONTEXT_MAT_ADMISSION:
       targetWriteAllowed() は **この document の barrierState** しか見ない。barrier は page load
       時にしか走らないので、
         Tab A を開く（matTxn 無し / barrier NOT_REQUIRED）
         → Tab B が materialization を開始して matTxn を作る
         → Tab B が crash（Web Lock は解放される）
         → Tab A は reload していない
       のとき Tab A の barrierState は NOT_REQUIRED のままで、normal writer が journal を
       横から踏み越えられてしまう。reload に依存してはならない。
     ★対策: transaction 開始のたびに **journal の存在を動的再確認**する（boot 時 cache 禁止）。
     ★ただし「matTxn があれば全部止める」にはしない。それだと READY journal を持つ
       正規 commitSchema2() 自身まで殺してしまう。正規 materialization transaction だけを
       この generic MAT hold の例外にする（dedicated named entry・下の runMaterialization）。
       public runExclusive からは materializationOwner を渡せない（isolationExempt と同じ思想）。 */
  if (matRecoveryActive() && opts.materializationOwner !== true && !matGateOwner)
    return Promise.resolve({ ran: false, reason: 'MATERIALIZATION_RECONCILE_REQUIRED',
                             policy: policy, wrote: 0, journalsKept: true, autoResume: false });
  var locks = locksApi();
  if (!locks) return Promise.resolve({ ran: false, reason: 'WEB_LOCKS_UNAVAILABLE', policy: policy, wrote: 0 });
  var got = false;
  return locks.request(LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, function (lock){
    if (!lock) return { ran: false, reason: 'CROSS_CONTEXT_BUSY', policy: policy, wrote: 0 };
    got = true;
    /* ★Gate B: lock 内・mutation 直前。recovery のみ免除。 */
    if (!exempt){
      var iso = isolationGate();
      if (!iso.ok)
        return { ran: false, reason: iso.hold || 'SLOT_ISOLATION_RUNTIME_HOLD',
                 isolation: iso.code, isolationDetail: iso.detail || null,
                 policy: policy, wrote: 0 };
    }
    var tok = mintToken(); currentToken = tok;
    function clear(){ if (currentToken === tok) currentToken = null; }
    return Promise.resolve(fn(tok)).then(function (r){
      clear(); return { ran: true, result: r, serialized: true, isolationExempt: exempt };
    }, function (e){ clear(); throw e; });
  }).then(function (r){ return r; }, function (e){
    return { ran: false, reason: got ? 'TRANSACTION_THREW' : 'LOCK_REQUEST_FAILED',
             detail: String(e && e.message || e), policy: policy, wrote: 0 };
  });
}

/* =====================================================================
 * ★B-3: GWS_BOOT_RECOVERY_BARRIER（GPT裁定・B-1/B-2はREJECT）
 *   serializationRequired()==false の通常legacy状態では**何もしない**
 *     （fix721 / fix587 の既存同期 boot semantics を1バイトも変えない）。
 *   true の時のみ:
 *     BOOT_RECOVERY_BARRIER=PENDING
 *       → shared Web Lock 取得（ここだけ async）
 *       → recovery state を**再読取**
 *       → 必要な recovery を**同期実行**（callback内に await/yield 0）
 *       → readback / journal 処理 → lock release → RESOLVED
 *   PENDING/CONFLICT の間は、13 target keys を mutation する writer の開始を禁止。
 *   ★複数 recovery（C1 journal と fix721 journal 等）が同時 ACTIVE なら
 *     DUAL_RECOVERY_CONFLICT_HOLD: rollback/restore/delete/journal clear すべて 0・
 *     成功verdict禁止・通常 boot へ進まない・preimage の自動選択禁止。
 * ===================================================================== */
var BARRIER = { NOT_REQUIRED: 'NOT_REQUIRED', PENDING: 'PENDING', RESOLVED: 'RESOLVED',
                CONFLICT: 'DUAL_RECOVERY_CONFLICT_HOLD' };
var FIX721_JOURNAL_KEY = 'v292Dfix721_txn';
var FIX587_PENDING_KEY = 'v292Dfix587_pending';
var barrierState = BARRIER.NOT_REQUIRED;   /* document scoped・非永続 */

function jsonOf(k){ var s = lsGet(k); if (s == null) return null; try { return JSON.parse(s); } catch (e){ return { __unparsable: true }; } }
function c1RecoveryActive(){
  var j = jsonOf(C1_JOURNAL_KEY);
  if (!j) return false;
  if (j.__unparsable) return true;                      /* 判定不能は active 扱い（fail-closed） */
  return j.phase === 'PREPARED' || j.phase === 'APPLYING' || j.phase === 'RECOVERY_REQUIRED';
}
function fix721RecoveryActive(){
  var j = jsonOf(FIX721_JOURNAL_KEY);
  if (!j) return false;
  if (j.__unparsable) return true;
  return j.phase === 'PREPARED' || j.phase === 'APPLYING';
}
function fix587PendingActive(){
  var j = jsonOf(FIX587_PENDING_KEY);
  if (!j) return false;
  if (j.__unparsable) return true;
  if (Object.prototype.toString.call(j) === '[object Array]') return j.length > 0;
  return true;
}
/* ★★裁定37 FIX750_CRASH_BOOT_RECOVERY_GATE:
   fix750 materialization journal が残ったまま reload された場合、
   既存 barrier は C1 / FIX721 / FIX587 しか見ていないため NO_PENDING_RECOVERY で
   RESOLVED になり、normal 13-key writer を通してしまっていた（＝crash 後に物語が進む）。
   ここでは **存在するかどうかだけ**を見る。JSON parse しない
   （壊れた journal ほど fail-closed で止める。materializationActive() と同じ契約）。 */
function matRecoveryActive(){ return lsGet(MAT_JOURNAL_KEY) != null; }
function activeRecoveries(){
  var a = [];
  if (c1RecoveryActive())     a.push('C1');
  if (fix721RecoveryActive()) a.push('FIX721');
  if (fix587PendingActive())  a.push('FIX587');
  if (matRecoveryActive())    a.push('MAT');
  return a;
}

/* 13 target key を mutation してよいか（barrier gate） */
function targetWriteAllowed(){
  return barrierState === BARRIER.NOT_REQUIRED || barrierState === BARRIER.RESOLVED;
}
function barrier(){ return barrierState; }

/* recoveries = { C1: fn, FIX721: fn, FIX587: fn }（同期関数のみ。無いものは省略可）
 * 戻り値: { barrier, ran, executed, active, reason?, results? } */
function bootRecoveryBarrier(recoveries){
  recoveries = recoveries || {};
  if (!serializationRequired()){
    barrierState = BARRIER.NOT_REQUIRED;
    return Promise.resolve({ barrier: BARRIER.NOT_REQUIRED, ran: false, legacyUnchanged: true, wrote: 0 });
  }
  barrierState = BARRIER.PENDING;
  var locks = locksApi();
  if (!locks) return Promise.resolve({ barrier: barrierState, ran: false, reason: 'WEB_LOCKS_UNAVAILABLE', wrote: 0 });
  /* ★boot liveness（裁定）: barrier だけは ifAvailable の fail-fast を使わず **queue して待つ**。
     PENDING の間 target-domain writer は全停止しているので、待機中に壊れる writer は無い。
     保持者が release / crash すれば Web Locks が自動的に順番を回す（timer polling・lease・
     heartbeat・retry queue は作らない）。一般 writer(Class A/C/D) の policy は変更しない。 */
  return locks.request(LOCK_NAME, { mode: 'exclusive' }, function (lock){
    if (!lock) return { barrier: BARRIER.PENDING, ran: false, reason: 'CROSS_CONTEXT_BUSY', wrote: 0 };
    /* ★lock取得後に recovery state を再読取（read→act の窓を潰す） */
    var act = activeRecoveries();
    if (act.length > 1){
      barrierState = BARRIER.CONFLICT;
      return { barrier: BARRIER.CONFLICT, ran: false, reason: 'MULTI_RECOVERY_CONFLICT',
               active: act, wrote: 0, journalsKept: true };
    }
    if (act.length === 0){
      barrierState = BARRIER.RESOLVED;
      return { barrier: BARRIER.RESOLVED, ran: false, reason: 'NO_PENDING_RECOVERY', active: [], wrote: 0 };
    }
    var who = act[0];
    /* ★★裁定37 CORE INVARIANT:
         MAT JOURNAL EXISTS → NEW NORMAL TARGET-DOMAIN MUTATION MUST NOT PROCEED
         until materialization state is explicitly reconciled.
       MAT には **recovery handler を登録させない**。理由:
         ・fix750 の reconcile は fresh V2 server read を要するので async。
           この barrier は「callback 内に await/yield 0」の同期契約なので構造的に入らない。
         ・auto commit / auto retry / auto resume / auto rollback / auto destructive cleanup は
           すべて禁止（裁定37）。handler を持たせると将来それを足す穴になる。
       よって MAT が先頭なら **常に PENDING を維持**して writer を止め続ける。
       分類は fix750.recoveryStatus()（read-only・server write 0）で別途行い、
       その結果が barrier を自動で開けることは無い。 */
    if (who === 'MAT'){
      barrierState = BARRIER.PENDING;
      return { barrier: BARRIER.PENDING, ran: false, reason: 'MATERIALIZATION_RECONCILE_REQUIRED',
               active: act, wrote: 0, journalsKept: true, autoResume: false };
    }
    var fn = recoveries[who];
    if (typeof fn !== 'function'){
      barrierState = BARRIER.PENDING;
      return { barrier: BARRIER.PENDING, ran: false, reason: 'RECOVERY_HANDLER_MISSING', active: act, wrote: 0 };
    }
    var tok = mintToken(); currentToken = tok;
    var out;
    try { out = fn(tok); }                /* ★同期。await/yield を入れない */
    finally { if (currentToken === tok) currentToken = null; }
    barrierState = BARRIER.RESOLVED;
    return { barrier: BARRIER.RESOLVED, ran: true, executed: who, active: act, result: out };
  }).then(function (r){ return r; }, function (e){
    barrierState = BARRIER.PENDING;
    return { barrier: BARRIER.PENDING, ran: false, reason: 'BARRIER_THREW',
             detail: String(e && e.message || e), wrote: 0 };
  });
}

/* =====================================================================
 * ★Phase B: production module-scope boot の唯一の入口
 *   裁定「GWS共通層が fix721 / fix587 の module-scope recovery より必ず先に
 *   load・initialize されること（candidate PASS条件）」を成立させるための層。
 *
 *   ・serializationRequired()==false（＝production の通常状態: C1 OFF / journal無し）
 *       → **その場で同期実行**。legacy の observable behavior を1バイトも変えない。
 *   ・true
 *       → handler を登録し、macrotask 境界（＝index.html の全 classic script が
 *         実行を終えた後）で **1本の bootRecoveryBarrier** を回す。
 *         barrier が選ばなかった module の boot fn も、GWSの外へは出さず
 *         同じ shared lock 下で登録順に実行する（BUSY policy は Class B）。
 * ===================================================================== */
var bootRegistry = {};        /* who -> fn */
var bootOrder = [];           /* 登録順（＝実 script load 順） */
var bootTrace = [];           /* 実 load 順の観測用。production 動作には影響しない */
var barrierArmed = false, barrierSettled = false;
var barrierPromise = null, barrierResolve = null, lastBarrierResult = null;

function nowMs(){ try { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); } catch (e){ return 0; } }
function traceAdd(ev, extra){
  try { var o = { ev: String(ev), t: nowMs() }; if (extra) o.detail = extra; bootTrace.push(o); } catch (e){}
}
function barrierDone(){
  if (!barrierPromise) barrierPromise = new Promise(function (res){ barrierResolve = res; });
  return barrierPromise;
}
function settleBarrier(r){
  barrierSettled = true;
  lastBarrierResult = r;
  if (barrierResolve) barrierResolve(r);
}
function runBarrierNow(){
  var order = bootOrder.slice();
  bootRecoveryBarrier(bootRegistry).then(function (r){
    traceAdd('BARRIER_' + (r && r.barrier), r && r.executed);
    /* CONFLICT / PENDING は HOLD。以降の boot fn を1つも走らせない（fail-closed） */
    if (!r || r.barrier !== BARRIER.RESOLVED){ settleBarrier(r); return; }
    var i = 0;
    (function next(){
      if (i >= order.length){ settleBarrier(r); return; }
      var who = order[i++];
      if (who === r.executed) return next();
      var fn = bootRegistry[who];
      if (typeof fn !== 'function') return next();
      /* ★recovery なので Gate B(SLOT_ISOLATION) は免除。RECOVERY MAY REPAIR。 */
      _runExclusive('B', fn, { isolationExempt: true }).then(function (x){
        traceAdd('POSTBOOT_' + who, x && (x.ran ? 'RAN' : x.reason));
        next();
      }, function (){ traceAdd('POSTBOOT_' + who, 'THREW'); next(); });
    })();
  }, function (e){ settleBarrier({ barrier: barrierState, ran: false, reason: 'BARRIER_SCHEDULE_THREW',
                                   detail: String(e && e.message || e), wrote: 0 }); });
}
function scheduleBarrier(){
  if (barrierArmed) return;
  barrierArmed = true;
  barrierDone();
  /* ★classic <script src> は parser-blocking なので、**DOMContentLoaded が
     「index.html の全 script が実行を終えた」唯一の確実な境界**。
     setTimeout(...,0) は script 間の network 待ちで先に発火し得る
     （実測: PRODUCTION_LOAD_ORDER_FIXTURE で fix587(#96) の登録前に barrier が閉じた）。
     late load した module は runBootRecovery 側で shared lock 下に回収する。 */
  var fire = function (){ setTimeout(runBarrierNow, 0); };
  try {
    if (typeof document !== 'undefined' && document && document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', fire, { once: true });
    } else { fire(); }
  } catch (e){ fire(); }
}
function runBootRecovery(who, fn){
  traceAdd('BOOT_' + who);
  if (typeof fn !== 'function') return { sync: true, ran: false, gws: true, reason: 'NO_FN' };
  if (!serializationRequired()){
    barrierState = BARRIER.NOT_REQUIRED;
    /* ★同期。legacy と同一タイミング・同一戻り値 */
    return { sync: true, ran: true, gws: true, barrier: BARRIER.NOT_REQUIRED, result: fn() };
  }
  if (bootOrder.indexOf(who) < 0) bootOrder.push(who);
  bootRegistry[who] = fn;
  /* ★barrier が既に閉じた後の late load。GWSの外へは絶対に出さない。 */
  if (barrierSettled){
    if (barrierState === BARRIER.RESOLVED){
      return { sync: false, ran: false, gws: true, late: true, barrier: barrierState,
               /* ★recovery 免除（同上） */
               promise: _runExclusive('B', fn, { isolationExempt: true }).then(function (x){
                 traceAdd('LATEBOOT_' + who, x && (x.ran ? 'RAN' : x.reason)); return x;
               }, function (){ traceAdd('LATEBOOT_' + who, 'THREW'); }) };
    }
    traceAdd('LATEBOOT_' + who, 'HELD_' + barrierState);
    return { sync: false, ran: false, gws: true, late: true, held: true,
             barrier: barrierState, promise: barrierDone() };
  }
  if (barrierState !== BARRIER.RESOLVED && barrierState !== BARRIER.CONFLICT) barrierState = BARRIER.PENDING;
  scheduleBarrier();
  return { sync: false, ran: false, gws: true, barrier: barrierState, deferred: true, promise: barrierDone() };
}

/* ★★裁定(Phase B review §3): 「同じ関数が状況により同期値 / Promise を返す」契約は REJECT。
   runExclusiveMaybeSync は**削除した**。
   呼び出し側は同期の serializationRequired() で **どちらの名前の関数を呼ぶか**を決め、
   runExclusive は **常に Promise** を返す（runtime-dependent return type を作らない）。 */

traceAdd('GWS_INIT');

window.__v292DfixGWS = {
  BUILD: 'fix745', LOCK_NAME: LOCK_NAME, C1_JOURNAL_KEY: C1_JOURNAL_KEY,
  MAT_JOURNAL_KEY: MAT_JOURNAL_KEY, materializationActive: materializationActive,
  CLASS: CLASS, BUSY: BUSY, BARRIER: BARRIER,
  FIX721_JOURNAL_KEY: FIX721_JOURNAL_KEY, FIX587_PENDING_KEY: FIX587_PENDING_KEY,
  barrier: barrier, targetWriteAllowed: targetWriteAllowed,
  activeRecoveries: activeRecoveries, matRecoveryActive: matRecoveryActive,
  bootRecoveryBarrier: bootRecoveryBarrier,
  serializationRequired: serializationRequired, c1Active: c1Active, safetyDisabled: safetyDisabled,
  /* ★★裁定: generic public exemption は REJECT。
       public runExclusive からは isolationExempt を **渡せない**（第3引数を捨てる）。
       免除が要る経路は dedicated named API だけに限定し、call-site を機械列挙できるようにする。
       新しい capability / token system は作らない。 */
  runExclusive: function (cls, fn){ return _runExclusive(cls, fn); },   /* exemption 不可 */
  isLockOwner: isLockOwner,              /* ★明示的 nested path 用（token 参照一致のみ） */
  heldNow: heldNow,                      /* ★監査用の読み取り専用シグナル */
  isolationGate: isolationGate,          /* ★Gate B の判定（read-only） */
  /* ---- 免除が許される dedicated entry はこの2つだけ ---- */
  /* fix587 の durable pending 消化専用（RECOVERY_RESUME / RECOVERY_LDR_CLEANUP）。
     ★免除は「無条件で書いてよい」ではない。呼び出し側が lock 内で durable pending を
       再読取・検証してから mutation すること（fix587 validateDurableRecovery）。
     ★BUSY は queue しない。Class B の HARD_HOLD_NO_WRITE のまま次の resume 機会へ回す。 */
  runFix587Recovery: function (fn){ return _runExclusive('B', fn, { isolationExempt: true }); },
  /* ★★裁定39: fix750 materialization 専用の狭い entry。
     generic MAT hold（上の MATERIALIZATION_RECONCILE_REQUIRED）**だけ**を免除する。
     ・generic bypass ではない。safetyDisabled / barrier / Web Locks / cross-context BUSY /
       Gate B(SLOT_ISOLATION) は一切免除しない。
     ・fix750 側の scope / snapshot / READY binding / server rev・hash / recordHash の
       各 gate も従来どおり全て維持される（GWS は関与しない）。
     ・新 lock 名は作らない（chronicle:cc2:materialization:v1 のみ）。
     ・public runExclusive からこの option は渡せない。 */
  runMaterialization: function (fn){ return _runExclusive('B', fn, { materializationOwner: true }); },
  /* ★★裁定40: MAT recovery の検証・epoch 更新・journal clear **専用**の狭い entry。
     ・schema2 write capability ではない（server write の免除は一切しない）
     ・activeRecoveries() が exact ['MAT'] のときだけ barrier PENDING を通る
     ・epoch mismatch / kill switch / Web Locks / cross-context BUSY は免除しない
     ・generic public runExclusive からこの option は渡せない
     ・recovery なので Gate B(SLOT_ISOLATION) のみ免除（fix587 recovery と同じ扱い）
     ・2 tab 同時 release を既存 shared lock で serialize する（新 lock は作らない） */
  runMaterializationRecoveryCompletion: function (fn){
    return _runExclusive('B', fn, { recoveryCompletionOwner: true, isolationExempt: true });
  },
  /* ★★裁定43: ambiguous COMMITTING の明示 reconcile 専用 entry。
     ★isolationExempt を渡さない（server write 能力があるため Gate B PASS 必須）。 */
  runMaterializationAmbiguousCommitReconcile: function (fn){
    return _runExclusive('B', fn, { ambiguousReconcileOwner: true });
  },
  RELEASE_EPOCH_KEY: RELEASE_EPOCH_KEY,
  releaseEpochNow: releaseEpochNow,
  releaseEpochAtLoad: function (){ return releaseEpochAtLoad; },
  releaseEpochStale: releaseEpochStale,
  bumpReleaseEpoch: bumpReleaseEpoch,
  /* Phase B: module-scope boot 入口 + 観測 */
  runBootRecovery: runBootRecovery,
  bootTrace: function (){ return bootTrace.slice(); },
  bootOrder: function (){ return bootOrder.slice(); },
  barrierResult: function (){ return lastBarrierResult; },
  whenBootSettled: function (){ return barrierArmed ? barrierDone() : Promise.resolve({ barrier: barrierState, ran: false, legacyUnchanged: true }); },
  /* class 別の薄い糖衣（呼び出し側の意図を明示させるため） */
  /* ★class 別の薄い糖衣も exemption 不可（内部 _runExclusive を exempt 無しで呼ぶ） */
  runRemoteApply:  function (fn){ return _runExclusive('A', fn); },
  runRecovery:     function (fn){ return _runExclusive('B', fn); },
  runRecomputable: function (fn){ return _runExclusive('C', fn); },
  runTurnMutation: function (fn){ return _runExclusive('D', fn); },
};
})();
