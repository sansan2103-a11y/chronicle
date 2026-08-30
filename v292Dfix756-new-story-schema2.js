// =====================================================================
// v292Dfix756 — NEW_STORY_SCHEMA2_DEFAULT（M1 / 裁定47 SCHEMA2_MIGRATION_ROLLOUT 派生）
//
//   目的:
//     **server row が存在しない story**（fix705 verdict = NOT_FOUND）を、ユーザー操作なしに
//     schema2 canonical として D1 へ作り、以後の保存を fix697.canonicalCommit2 経路に乗せる。
//     ＝「新規 story は最初から schema2」を製品既定にする。
//
//   ★このモジュールは **状態機械を持たない**。
//     materialization の実体は既存 fix750（prepare → commitSchema2）そのまま。
//     fix756 がやるのは
//       (1) 起動条件の判定（read-only）
//       (2) fix750 の narrow auto permit を1回だけ arm して prepare→commit を順に呼ぶ
//       (3) 失敗時に **自分が作った** pre-irreversible journal を畳む（abandon）
//       (4) 成功時に 1 回だけ reload して fix705 に再分類させる
//     の 4 つだけ。
//
//   新しく作らないもの（裁定31/47 の禁止事項をそのまま維持）:
//     batch 機構 / all-story scan / 配列 / 自動 next / background migration /
//     新 Worker op / 新 endpoint / 新 auth / 新 token / 新 lock 名 / 新 serializer /
//     caller supplied projection / 新しい recovery 機構 / blind retry / force write
//
//   ── 起動条件（全部 AND。1つでも欠けたら write 0 で何もしない）────────────────
//     A. kill switch OFF          : localStorage v292Dfix756Off !== '1'
//     B. story document である     : window.__chronicleDocumentStoryKey が 'chr6_slot_<id>'
//                                    （'chr6' = default story は対象外。fix750 と同一契約）
//     C. fix705 の分類が NOT_FOUND : docAuthority() が {id 一致, unsafe:false, fresh:true, present:false}
//                                    ＝ auth-ready 済み・getstory 1回完了・server row 不在を確認済み。
//                                    ★fix756 は独自の getstory を **1本も出さない**。
//                                      auth 待ちも fix705 の authReady755 に完全に委ねる（二重実装しない）。
//     D. 進行中 transaction が無い  : __v292Dfix750.journal() === null
//     E. local に材料がある        : fix697.projectionOf(id) が schema1 projection を返し、
//                                    fix697.projectionV2(id) が非 null（= fix743 が schema2 record を
//                                    組める＝body/meta が揃っている）。**read-only の事前確認**で、
//                                    「2回 server へ書いてから BUILD hold で畳む」を構造的に避ける。
//     F. 依存が揃っている          : fix750 / fix697 / fix743 / fix564 / GWS(runMaterialization)
//     G. この tab session で未実行  : sessionStorage 'v292Dfix756_att:<id>' が無い
//
//   ── 状態遷移 ────────────────────────────────────────────────────
//     ROW_ABSENT ──prepare──> SHADOW_S1 ──prepare──> CANONICAL_S1 ──prepare──> READY_FOR_SCHEMA2
//                                                    ──commitSchema2──> CANONICAL_S2 ──> reload
//     ★fix402/fix697 の legacy shadow push が先に row を作っていた場合（race）は
//       prepare が fresh getstory で SHADOW_S1 と分類し、promotion から再開する（吸収される）。
//     ★prepare が **1 step も書かずに** READY_FOR_SCHEMA2 になった場合
//       （＝開始時点で既に CANONICAL_S1 = server row のある既存 schema1 story）は
//       commitSchema2 を **呼ばずに** abandon する。COHORT 手順（backup 先行）の対象を横取りしない。
//
//   ── fail-closed 方針 ────────────────────────────────────────────
//     ・getstory / putstory / promotestory が失敗したら **local を正本として書かない**。
//       server 実状態は fix750 の fresh readback だけが決める（fix756 は判定に参加しない）。
//     ・失敗時は「既存 legacy 経路へ戻す」を選ぶ（HOLD 継続ではなく abandon）。理由:
//       fix750 の journal(v292Dfix750_matTxn) が残ると fix745 の
//       matRecoveryActive() → MATERIALIZATION_RECONCILE_REQUIRED / BOOT_RECOVERY_BARRIER により
//       **通常プレイの 13-key mutation が全部止まる**（＝ユーザーが物語を進められなくなる）。
//       自動既定 ON の機能がその状態を残してはならない。
//     ・ただし abandon してよいのは **不可逆 putcanonical を 1 バイトも送っていないこと**が
//       journal から確定できる場合だけ（裁定44 の契約: persisted phase < COMMITTING_SCHEMA2
//       ⇒ putcanonical attempt 0）。加えて自分が作った journal であることを
//       （事前 null 観測 + storyId 一致 + startedAt >= 自分の T0）で確認する。
//       serverWriteAttempted / serverMutationState が立っていたら **絶対に触らない**
//       ＝ 裁定43 の明示 reconcile（__v292Dfix750.reconcileAmbiguousCommit）へ委ねる。
//     ・abandon 後の server は ROW_ABSENT / SHADOW_S1 / CANONICAL_S1（＝すべて schema1 の
//       既存 legacy 状態）。local は 1 バイトも変わっていない。次回 load で fix705 が
//       正しく再分類し、従来経路で通常プレイが続く。
//
//   ── reload が要る理由（no-reload は構造的に不可）──────────────────────────
//     prepare は fix702.promoteForC1Materialization を通る。fix702 は promotestory を
//     **attempt した時点で** fix697.invalidateDocRevAuthority(..., typeA=true) を呼ぶ（fix733/RULING90 §13）。
//     以後この document は authorityReloadRequired = true になり、
//     「reload して fix705 に再分類させる」まで body write 0 が **設計上の正**。
//     さらに fix705 の verdict は document あたり 1 回で確定（classifyStarted）なので、
//     同一ページ内では docAuthority() が NOT_FOUND のまま = fix697 は schema2 route を選べない。
//     よって MATERIALIZED 後に 1 回だけ location.reload() する（fix705 の CANONICAL_APPLIED と同じ作法・同じ 300ms）。
//     reload 後: fix705 が CANONICAL_SAME_HASH / schema:2 と分類 → fix697 が canonicalCommit2 を選ぶ。
//
//   ── 書かないもの ────────────────────────────────────────────────
//     他 story のキー / chr6_slots_meta / genderMap / aiInstr / account 設定 / canonical marker /
//     localStorage（fix756 自身の永続キーを 1 本も持たない）。
//     書くのは sessionStorage 'v292Dfix756_att:<id>' と 'v292Dfix756_done:<id>' の 2 本だけ
//     （tab session 限定の 1 回性ガード。reload ループ・多重 attempt を構造的に禁止する）。
//     canonical marker の削除 0 / canonical→shadow downgrade 0（fix750/fix697 側の契約のまま）。
//
//   既定 ON。kill switch = localStorage v292Dfix756Off === '1'。
//   検証口: window.__v292Dfix756 = { status, stats, state, gate, ledger, on, off }
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix756) return;                 /* 二重install防止（自 namespace のみ） */
  var TAG = '[v292Dfix756:new-story-schema2]';
  var BUILD = 'fix756';
  var ATT_PREFIX  = 'v292Dfix756_att:';
  var DONE_PREFIX = 'v292Dfix756_done:';
  /* ★裁定44: putcanonical を 1 バイトも送っていないことが phase から確定できる集合。
     COMMITTING_SCHEMA2 / COMPLETE は **含めない**（送信済みの可能性がある）。 */
  var SAFE_ABANDON_PHASES = ['PREPARING', 'SHADOW_VERIFIED', 'CANONICAL_S1_VERIFIED', 'READY_FOR_SCHEMA2'];

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function ssGet(k){ try { return sessionStorage.getItem(k); } catch(e){ return null; } }
  function ssSet(k, v){ try { sessionStorage.setItem(k, v); return true; } catch(e){ return false; } }
  function off(){ return lsg('v292Dfix756Off') === '1'; }
  function on(){ return !off(); }

  function f750(){ try { return window.__v292Dfix750 || null; } catch(e){ return null; } }
  function f705(){ try { return window.__v292Dfix705 || null; } catch(e){ return null; } }
  function f697(){ try { return window.__v292Dfix697 || null; } catch(e){ return null; } }
  function f743(){ try { return window.__v292DfixCC2 || null; } catch(e){ return null; } }
  function f564(){ try { return window.__v292Dfix564 || null; } catch(e){ return null; } }
  function gws(){  try { return window.__v292DfixGWS || null; } catch(e){ return null; } }

  /* ★fix697 L89-97 / fix702 / fix750 と **同一の authority-key 契約**。
     window.__chronicleDocumentStoryKey は body key であって bare storyId ではない。 */
  function docStoryKey(){
    try { var k = window.__chronicleDocumentStoryKey; return (typeof k === 'string' && k) ? k : null; }
    catch(e){ return null; }
  }
  function docStoryId(){
    var k = docStoryKey();
    if (!k) return null;
    if (k === 'chr6') return 'default';
    if (k.indexOf('chr6_slot_') === 0) return k.slice(10);
    return null;
  }

  var LEDGER = [], LEDGER_CAP = 40;
  function note(row){
    try { row.t = Date.now(); LEDGER.push(row); while (LEDGER.length > LEDGER_CAP) LEDGER.shift(); } catch(e){}
  }
  var stats = { polls: 0, gateChecks: 0, triggered: 0, prepared: 0, committed: 0,
                abandoned: 0, holds: 0, reloads: 0, manualReconcileRequired: 0 };
  var state = { build: BUILD, phase: 'idle', storyId: null, verdict: null, code: null,
                detail: null, startedAt: null, finishedAt: null, reloadScheduled: false,
                abandon: null, steps: null };

  var RAN = false;                 /* この document で 1 回だけ */
  var RUN_P = null;                /* 実行中/実行済みの Promise（診断・fixture 用。再実行はしない） */
  var T0 = 0;                      /* 実行開始時刻（journal 所有権判定に使う） */
  var JOURNAL_BEFORE_NULL = false; /* 実行直前に journal() === null を観測したか */

  // =====================================================================
  // (1) 起動条件（read-only。storage write 0 / 通信 0）
  // =====================================================================
  function gate(){
    stats.gateChecks++;
    if (!on())  return { ok: false, code: 'OFF' };
    if (RAN)    return { ok: false, code: 'ALREADY_RAN' };
    var id = docStoryId();
    if (!id) return { ok: false, code: 'NO_DOCUMENT_STORY' };
    if (id === 'default') return { ok: false, code: 'DEFAULT_STORY_UNSUPPORTED' };
    if (ssGet(ATT_PREFIX + id) != null) return { ok: false, code: 'ATTEMPTED_THIS_SESSION', storyId: id };

    var F750 = f750();
    if (!F750 || typeof F750.autoNewStoryPermit !== 'function' ||
        typeof F750.journal !== 'function' || typeof F750.journalClear !== 'function')
      return { ok: false, code: 'NO_FIX750' };
    var F697 = f697();
    if (!F697 || typeof F697.projectionOf !== 'function' || typeof F697.projectionV2 !== 'function')
      return { ok: false, code: 'NO_FIX697' };
    var C = f743();
    if (!C || typeof C.buildSchema2Record !== 'function') return { ok: false, code: 'NO_FIX743' };
    var S = f564();
    if (!S || typeof S.create !== 'function' || typeof S.verify !== 'function')
      return { ok: false, code: 'NO_FIX564' };
    var G = gws();
    if (!G || typeof G.runMaterialization !== 'function') return { ok: false, code: 'NO_GWS' };

    /* ★C: 権威判定は fix705 の read-only contract **だけ**を読む。
       unsafe（STOP / 分類失敗）は絶対に「row が無い」と解釈しない（FAILED CLASSIFICATION != NOT_FOUND）。 */
    var F5 = f705();
    if (!F5 || typeof F5.docAuthority !== 'function') return { ok: false, code: 'NO_FIX705' };
    var a5 = null;
    try { a5 = F5.docAuthority(); } catch(e){ return { ok: false, code: 'FIX705_THREW' }; }
    if (!a5) return { ok: false, code: 'FIX705_NO_AUTHORITY' };
    if (String(a5.id) !== String(id)) return { ok: false, code: 'FIX705_ID_MISMATCH' };
    if (a5.unsafe === true) return { ok: false, code: 'FIX705_UNSAFE', phase: a5.phase || null };
    if (a5.fresh !== true) return { ok: false, code: 'AWAITING_CLASSIFICATION', phase: a5.phase || null };
    if (a5.present !== false) return { ok: false, code: 'SERVER_ROW_PRESENT',
                                       authority: a5.authority || null, schema: a5.schema || null };

    /* ★D: 進行中/残留 transaction があれば触らない（recovery は fix750 の明示 API の仕事）。 */
    var j = null;
    try { j = F750.journal(); } catch(e){ return { ok: false, code: 'JOURNAL_READ_THREW' }; }
    if (j != null) return { ok: false, code: 'PREEXISTING_JOURNAL',
                            phase: (j && !j.__corrupt) ? (j.phase || null) : 'CORRUPT' };

    /* ★E: local 材料の read-only 事前確認。 */
    var p1 = null;
    try { p1 = F697.projectionOf(id); } catch(e){ p1 = null; }
    if (!p1 || p1.schema !== 1 || String(p1.id) !== String(id))
      return { ok: false, code: 'NO_LOCAL_SCHEMA1_PROJECTION' };
    var p2 = null;
    try { p2 = F697.projectionV2(id); } catch(e){ p2 = null; }
    if (!p2 || p2.schema !== 2 || String(p2.id) !== String(id))
      return { ok: false, code: 'NO_LOCAL_SCHEMA2_PROJECTION' };

    return { ok: true, storyId: id };
  }

  // =====================================================================
  // (2) journal abandon（自分が作った pre-irreversible transaction だけを畳む）
  //   ★これは recovery ではない。crash 後の未知 transaction を扱わない。
  //     「自分がこのフレームで開始し、putcanonical を送る前に失敗した」ものだけ。
  //   ★server へ 1 バイトも送らない / local 本体キーを 1 バイトも触らない /
  //     snapshot を消さない（destructive cleanup 禁止）。
  // =====================================================================
  function abandonIfOurs(id){
    var F750 = f750();
    if (!F750) return { abandoned: false, reason: 'NO_FIX750' };
    var j = null;
    try { j = F750.journal(); } catch(e){ return { abandoned: false, reason: 'JOURNAL_READ_THREW' }; }
    if (j == null) return { abandoned: false, reason: 'NO_JOURNAL' };
    if (j.__corrupt) return { abandoned: false, reason: 'JOURNAL_CORRUPT' };
    if (!JOURNAL_BEFORE_NULL) return { abandoned: false, reason: 'PREEXISTING_JOURNAL' };
    if (String(j.storyId) !== String(id)) return { abandoned: false, reason: 'STORY_MISMATCH' };
    if (typeof j.startedAt !== 'number' || !(j.startedAt >= T0))
      return { abandoned: false, reason: 'NOT_OURS' };
    /* ★裁定44: 不可逆 putcanonical の送信可能性が 1 ビットでもあれば触らない。 */
    if (j.serverWriteAttempted === true) return { abandoned: false, reason: 'SERVER_WRITE_ATTEMPTED' };
    if (j.serverMutationState) return { abandoned: false, reason: 'MUTATION_STATE_' + String(j.serverMutationState) };
    var okPhase = false;
    for (var i = 0; i < SAFE_ABANDON_PHASES.length; i++)
      if (j.phase === SAFE_ABANDON_PHASES[i]) { okPhase = true; break; }
    if (!okPhase) return { abandoned: false, reason: 'PHASE_' + String(j.phase) };
    var cleared = false;
    try { cleared = !!F750.journalClear(); } catch(e){ cleared = false; }
    if (!cleared) return { abandoned: false, reason: 'JOURNAL_CLEAR_FAILED', phase: j.phase };
    stats.abandoned++;
    return { abandoned: true, phase: j.phase, hold: j.hold || null };
  }

  // =====================================================================
  // (3) 終了処理
  // =====================================================================
  function scheduleReload(why){
    if (state.reloadScheduled) return;
    state.reloadScheduled = true;
    stats.reloads++;
    note({ kind: 'RELOAD_SCHEDULED', why: why });
    /* fix705 CANONICAL_APPLIED と同じ作法（300ms 後に 1 回だけ）。 */
    try { setTimeout(function(){ try { location.reload(); } catch(e){} }, 300); } catch(e){}
  }
  function finish(verdict, code, detail, extra){
    state.phase = 'done';
    state.verdict = verdict; state.code = code || null; state.detail = detail || null;
    state.finishedAt = Date.now();
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) state[k] = extra[k];
    note({ kind: 'FINISH', verdict: verdict, code: code || null, storyId: state.storyId });
    return state;
  }

  // =====================================================================
  // (4) 実行（permit 1 回 / prepare → commitSchema2）
  // =====================================================================
  function run(id){
    RAN = true;
    T0 = Date.now();
    state.phase = 'running'; state.storyId = id; state.startedAt = T0;
    stats.triggered++;
    /* ★server write より **前** に session guard を立てる。
       途中で crash / reload しても同じ tab session では二度と自動起動しない。 */
    ssSet(ATT_PREFIX + id, String(T0));
    JOURNAL_BEFORE_NULL = true;                    /* gate() で journal()===null を観測済み */
    note({ kind: 'START', storyId: id });

    var F750 = f750();
    return F750.autoNewStoryPermit(id, function(ops){
      return ops.prepare({}).then(function(pr){
        stats.prepared++;
        note({ kind: 'PREPARE_RESULT', ok: !!(pr && pr.ok), code: pr ? pr.code : null,
               wrote: pr ? pr.wrote : null, hold: pr ? pr.hold : null });
        if (!pr || pr.ok !== true) return { stage: 'PREPARE', result: pr || null };
        if (pr.code === 'ALREADY_COMPLETE') return { stage: 'ALREADY', result: pr };
        if (pr.code !== 'READY_FOR_SCHEMA2') return { stage: 'PREPARE', result: pr };
        /* ★scope: 1 step も書いていない = 開始時点で既に CANONICAL_S1（server row のある
           既存 schema1 story）。COHORT 手順の対象なので **自動では触らない**。 */
        var steps = (pr.steps && pr.steps.length) || 0;
        if (steps < 1) return { stage: 'SCOPE', result: pr };
        return ops.commitSchema2({}).then(function(cr){
          stats.committed++;
          note({ kind: 'COMMIT_RESULT', ok: !!(cr && cr.ok), code: cr ? cr.code : null,
                 hold: cr ? cr.hold : null, serverWriteAttempted: cr ? !!cr.serverWriteAttempted : null,
                 serverMutationState: cr ? (cr.serverMutationState || null) : null });
          return { stage: 'COMMIT', result: cr || null, prepare: pr };
        });
      });
    }).then(function(out){
      var r = out && out.result;
      state.steps = (out && out.prepare && out.prepare.steps) ||
                    (r && r.steps) || null;

      if (!out || !out.stage) { stats.holds++; return finish('HOLD', 'NO_RESULT', null,
                                                             { abandon: abandonIfOurs(id) }); }

      if (out.stage === 'ALREADY'){
        /* prepare 開始時点で既に CANONICAL_S2（fix705 の read 後に他 tab / 他端末が作った）。
           fix750 が journal を clear 済み。分類を最新化するため reload だけ行う。 */
        scheduleReload('ALREADY_SCHEMA2');
        return finish('ALREADY_SCHEMA2', r ? r.code : null, null, { abandon: abandonIfOurs(id) });
      }

      if (out.stage === 'SCOPE'){
        var ab0 = abandonIfOurs(id);
        return finish('REFUSED_EXISTING_SERVER_STORY', r ? r.code : null,
                      { reason: 'PREPARE_WROTE_0_STEPS_SERVER_ROW_PREEXISTED' }, { abandon: ab0 });
      }

      if (out.stage === 'PREPARE'){
        stats.holds++;
        var ab1 = abandonIfOurs(id);
        return finish('PREPARE_HOLD', r ? (r.hold || r.code) : null,
                      r ? { code: r.code, hold: r.hold || null, wrote: r.wrote } : null,
                      { abandon: ab1 });
      }

      /* out.stage === 'COMMIT' */
      if (r && r.ok === true && (r.code === 'MATERIALIZED' || r.code === 'ALREADY_COMPLETE')){
        ssSet(DONE_PREFIX + id, String(Date.now()));
        scheduleReload(r.code);
        return finish('MATERIALIZED', r.code, { serverRev: (r.server && r.server.rev) || null });
      }
      stats.holds++;
      if (r && r.serverWriteAttempted === true){
        /* ★不可逆 putcanonical を送った後の HOLD。journal は **絶対に触らない**。
           解決は裁定43 の明示 reconcile（__v292Dfix750.reconcileAmbiguousCommit）/
           裁定39 の completeAppliedRecovery で、authoritative read を根拠に人間が行う。 */
        stats.manualReconcileRequired++;
        try { console.error(TAG, 'HOLD after canonical write — manual reconcile required',
                            { storyId: id, hold: r.hold || null,
                              serverMutationState: r.serverMutationState || null }); } catch(e){}
        return finish('HOLD_MANUAL_RECONCILE_REQUIRED', r.hold || r.code,
                      { serverMutationState: r.serverMutationState || null,
                        authoritativeReadbackRequired: !!r.authoritativeReadbackRequired },
                      { abandon: { abandoned: false, reason: 'SERVER_WRITE_ATTEMPTED' } });
      }
      var ab2 = abandonIfOurs(id);
      return finish('COMMIT_HOLD', r ? (r.hold || r.code) : null,
                    r ? { code: r.code, hold: r.hold || null } : null, { abandon: ab2 });
    }, function(e){
      stats.holds++;
      var ab3 = abandonIfOurs(id);
      return finish('THREW', String(e && e.message || e), null, { abandon: ab3 });
    });
  }

  // =====================================================================
  // (5) boot poll — fix705 の分類完了（auth-ready 込み）を待つだけ
  //   ★独自の auth 判定・独自の getstory を持たない。
  //   ★上限に達したら黙って諦める（write 0 / 既存経路そのまま）。
  // =====================================================================
  var POLL_MS = 250, POLL_MAX = 200;               /* 最大 ≒ 50 秒（fix705 の boot 上限より長い） */
  var pollN = 0;
  (function bootPoll(){
    try {
      if (RAN) return;
      if (!on()) return;
      pollN++; stats.polls++;
      var g = gate();
      if (g.ok){ RUN_P = run(g.storyId); return; }
      state.phase = 'waiting'; state.code = g.code;
      /* 恒久的に成立しない条件は待たずに終える（poll を無駄に回さない） */
      if (g.code === 'OFF' || g.code === 'NO_DOCUMENT_STORY' || g.code === 'DEFAULT_STORY_UNSUPPORTED' ||
          g.code === 'ATTEMPTED_THIS_SESSION' || g.code === 'SERVER_ROW_PRESENT' ||
          g.code === 'FIX705_UNSAFE' || g.code === 'PREEXISTING_JOURNAL' ||
          g.code === 'FIX705_ID_MISMATCH'){
        state.phase = 'skipped'; note({ kind: 'SKIP', code: g.code }); return;
      }
      if (pollN >= POLL_MAX){ state.phase = 'timeout'; note({ kind: 'TIMEOUT', code: g.code }); return; }
    } catch(e){ try { note({ kind: 'POLL_THREW', detail: String(e && e.message || e) }); } catch(e2){} }
    try { setTimeout(bootPoll, POLL_MS); } catch(e){}
  })();

  // =====================================================================
  // 検証口（自 namespace のみ・read-only）
  // =====================================================================
  window.__v292Dfix756 = {
    __armed: true, BUILD: BUILD, ENABLED_BY_DEFAULT: true,
    SAFE_ABANDON_PHASES: SAFE_ABANDON_PHASES.slice(),
    on: on, off: off,
    /* なぜ起動した/しなかったのかを、副作用なしで説明する（実機受入で使う） */
    gate: gate,
    state: function(){ return JSON.parse(JSON.stringify(state)); },
    /* 実行が settle するまでの Promise（read-only。呼んでも実行を起動しない）。 */
    whenSettled: function(){ return RUN_P ? RUN_P : Promise.resolve(JSON.parse(JSON.stringify(state))); },
    stats: function(){ return JSON.parse(JSON.stringify(stats)); },
    ledger: function(){ return LEDGER.slice(); },
    status: function(){
      return { build: BUILD, on: on(), off: off(),
               documentStoryKey: docStoryKey(), documentStory: docStoryId(),
               ran: RAN, polls: pollN,
               state: JSON.parse(JSON.stringify(state)),
               stats: JSON.parse(JSON.stringify(stats)),
               deps: { f750: !!f750(), f705: !!f705(), f697: !!f697(),
                       f743: !!f743(), f564: !!f564(), gws: !!gws() },
               log: LEDGER.slice(-8) };
    }
  };
  try { console.log(TAG, 'loaded (new-story schema2 default ON / kill=v292Dfix756Off=1)'); } catch(e){}
})();
