// =====================================================================
// v292Dfix750 — C1 WRITE PATH WIRING（one-story materialization state machine）
//   裁定30 / 裁定31: C1_WRITE_PATH_WIRING_GATE + C1_WIRING_PREDEPLOY_HARDENING
//
//   目的:
//     exact 1 story を明示指定して
//       ROW_ABSENT → schema1 shadow → schema1 canonical   … prepare()（可逆）
//       schema1 canonical → schema2 canonical             … commitSchema2()（不可逆 1発）
//     へ安全に materialize できる **production client path** を作る。
//
//   ★裁定31 P0-1: prepare() と commitSchema2() を分離する。
//     ・prepare() は putcanonical(schema2) を **絶対に呼ばない**。server schema2 mutation 0。
//     ・CANONICAL_S1 までは v38 rollback 可能な可逆領域なので、実 Worker 上での
//       putstory / promotion / auth / CAS / fresh readback / title / authority /
//       rev-hash / GWS / journal / snapshot の live 検証をここで済ませられる。
//     ・commitSchema2() は READY_FOR_SCHEMA2 + fresh CANONICAL_S1 からしか開始できない。
//       ROW_ABSENT / SHADOW_S1 から内部で勝手に prepare しない（条件不成立は write0）。
//
//   ★裁定31 P0-2: prepare → commit の状態束縛。
//     journal に preparedServerRev / preparedServerHash / preparedSchema2RecordHash を持ち、
//     commit 直前に同じ GWS lock を新規取得して fresh 検証する。
//     1 個でも違えば HOLD_STATE_CHANGED_SINCE_PREPARE / schema2 write0。
//     journal の古い rev/hash を blind で expected 値に使わない（fresh 値と一致確認後にのみ使用）。
//
//   ★裁定31 P0-3: fix702On 永続 flag に依存しない。
//     fix702.promoteForC1Materialization()（in-memory permit・狭い専用入口）を使う。
//
//   ★裁定31 P0-4: caller supplied projection 禁止。
//     ROW_ABSENT 時の schema1 projection は fix697.projectionOf() から **内部生成**する。
//     caller が指定できるのは exact storyId まで。projection / record / body / sidecar を
//     opts で渡してきた場合は REFUSED_CALLER_PROJECTION_FORBIDDEN で write0。
//
//   作らないもの（裁定で明示禁止）:
//     all-story scan / arrays / auto-next / background migration /
//     general C1 enable / UI rollout / Memory Engine / new Worker op /
//     new raw fetch / new endpoint / new auth / new token / new lock name
//
//   再利用するもの（すべて既存・無改変で呼ぶだけ）:
//     fix697 getStoryV2Once       … schema2-capable 専用の狭い read 口（裁定36 OPTION_B）
//                                   （clientCanonicalSchemaMax:2 を内部固定。caller は storyId のみ）
//     fix697 putStoryOnce         … op:'putstory' 固定の狭い write 口
//     fix697 putCanonicalOnce     … op:'putcanonical' 固定の狭い write 口
//                                   （fix750 で record.schema===2 のときだけ
//                                     clientCanonicalSchemaMax:2 を whitelist に追加）
//     fix697 projectionOf         … read-only の正規 schema1 projection builder
//     fix697 canonicalString      … 既存 stableStringify（binding hash 用。新 serializer を作らない）
//     fix702 promoteForC1Materialization … fresh getstory → strict CAS → fresh readback
//     fix743 buildSchema2Record   … schema2 record builder（title 正本は meta.name）
//     fix745 GWS runMaterialization … chronicle:cc2:materialization:v1 で直列化
//                                   （裁定39 の dedicated entry。generic MAT hold のみ免除）
//     fix564 create/verify        … preimage snapshot
//
//   既定 OFF:
//     有効化 = localStorage v292Dfix750On === '1'
//     kill   = localStorage v292Dfix750Off === '1'（常に優先）
//     ★load 時に flag を読まない。write も一切しない。
//
//   検証口: window.__v292Dfix750 =
//     { status, classify, prepare, commitSchema2, journal, journalClear, resume, off, on }
//   ★materialize()（ABSENT→CANONICAL_S2 を1回で完走する旧 API）は裁定31 で廃止。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix750) return;                 /* 二重install防止 */
  var TAG = '[v292Dfix750:c1-materialize]';
  var BUILD = 'fix750';
  var JOURNAL_KEY = 'v292Dfix750_matTxn';
  var PHASE = {
    PREPARING:             'PREPARING',
    SHADOW_VERIFIED:       'SHADOW_VERIFIED',
    CANONICAL_S1_VERIFIED: 'CANONICAL_S1_VERIFIED',
    READY_FOR_SCHEMA2:     'READY_FOR_SCHEMA2',
    COMMITTING_SCHEMA2:    'COMMITTING_SCHEMA2',
    COMPLETE:              'COMPLETE'
  };
  var STATE = {
    ROW_ABSENT:   'ROW_ABSENT',
    SHADOW_S1:    'SHADOW_S1',
    CANONICAL_S1: 'CANONICAL_S1',
    CANONICAL_S2: 'CANONICAL_S2',
    UNSUPPORTED:  'UNSUPPORTED'
  };

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function lss(k, v){ try { localStorage.setItem(k, v); return true; } catch(e){ return false; } }
  function lsr(k){ try { localStorage.removeItem(k); return true; } catch(e){ return false; } }
  function off(){ return lsg('v292Dfix750Off') === '1'; }
  function on(){ return !off() && lsg('v292Dfix750On') === '1'; }

  function f697(){ try { return window.__v292Dfix697 || null; } catch(e){ return null; } }
  function f702(){ try { return window.__v292Dfix702 || null; } catch(e){ return null; } }
  function f743(){ try { return window.__v292DfixCC2 || null; } catch(e){ return null; } }
  function f564(){ try { return window.__v292Dfix564 || null; } catch(e){ return null; } }
  function gws(){  try { return window.__v292DfixGWS || null; } catch(e){ return null; } }
  /* ★裁定31 hardening 中に発見した第3の BLOCKER（C1_DOC_STORY_KEY_SEMANTICS）:
     window.__chronicleDocumentStoryKey は **body key**（'chr6' / 'chr6_slot_<id>'）であって
     bare storyId ではない。旧実装はこれを storyId と直接比較していたため、production では
     scope 判定が常に不成立（REFUSED_SCOPE_MISMATCH）になり materialization に到達できなかった。
     fixture が __chronicleDocumentStoryKey に bare id を入れていたため露見していなかった。
     ここは fix697 L89-97 / fix702 と **同一の authority-key 契約**をそのまま使う（別解釈を作らない）。 */
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

  var LOG = [];
  function note(o){ try { LOG.push({ at: Date.now(), o: o }); if (LOG.length > 60) LOG.shift(); } catch(e){} }
  function refuse(code, detail){
    var r = { ok: false, ran: false, wrote: 0, mutated: false, code: code };
    if (detail) r.detail = detail;
    note(r); return r;
  }

  /* ---------------- journal（最小・自分のキー1本だけ） ---------------- */
  function journal(){
    var raw = lsg(JOURNAL_KEY);
    if (raw == null) return null;
    try { return JSON.parse(raw); } catch(e){ return { __corrupt: true, raw: String(raw).slice(0, 200) }; }
  }
  function journalSet(j){ return lss(JOURNAL_KEY, JSON.stringify(j)); }
  function journalClear(){ return lsr(JOURNAL_KEY); }

  /* ═══════════════════════════════════════════════════════════════════
     ★★裁定43 PREPARED MID BINDING — canonical mid の生成式は **ここ 1 箇所だけ**。
     commit と reconcile で式を複製しない。両者とも journal.preparedCanonicalMid を使い、
     この関数は「その値が prepared 値と整合しているか」を検証するためだけに再計算する。
     ═══════════════════════════════════════════════════════════════════ */
  function canonicalMid(storyId, preparedRev, preparedHash){
    if (typeof storyId !== 'string' || !storyId) return null;
    if (typeof preparedRev !== 'number' || !isFinite(preparedRev)) return null;
    if (typeof preparedHash !== 'string' || !preparedHash) return null;
    return 'f750:canon:' + storyId + ':' + preparedRev + ':' + preparedHash;
  }
  /* journal に保存された mid が、同じ journal の prepared 値から導ける値と exact 一致するか。
     不一致（欠落・改変・式ズレ）は必ず write0 で止める。 */
  function canonicalMidBindingOk(j){
    if (!j || j.__corrupt) return false;
    if (typeof j.preparedCanonicalMid !== 'string' || !j.preparedCanonicalMid) return false;
    var expect = canonicalMid(j.storyId, j.preparedServerRev, j.preparedServerHash);
    return expect !== null && j.preparedCanonicalMid === expect;
  }

  /* ---------------- server 実状態の分類（唯一の authority） ----------------
     ★journal を信用して続きを書かない。分類は必ず fresh getstory の結果から行う。 */
  function classify(g){
    if (!g || g.absent === true) return STATE.ROW_ABSENT;
    var auth = String(g.authority || 'shadow');
    var schema = (g.schema === 2) ? 2 : 1;
    if (auth === 'canonical' && schema === 2) return STATE.CANONICAL_S2;
    if (auth === 'canonical' && schema === 1) return STATE.CANONICAL_S1;
    if (auth === 'shadow'    && schema === 1) return STATE.SHADOW_S1;
    return STATE.UNSUPPORTED;
  }

  /* ---------------- stable hash（binding 専用・server へは送らない） ----------------
     ★新しい serializer を作らない。fix697 の既存 canonicalString（stableStringify）を使う。
     ★秘密値そのものは journal に保存しない。保存するのは sha256 hex のみ。 */
  function stableStringOf(obj){
    var F = f697();
    if (!F || typeof F.canonicalString !== 'function') return null;
    try { return F.canonicalString(obj); } catch(e){ return null; }
  }
  function sha256hex(str){
    return new Promise(function(resolve){
      try {
        var g = (window.crypto && window.crypto.subtle) ? window.crypto
              : ((typeof crypto !== 'undefined' && crypto && crypto.subtle) ? crypto : null);
        if (!g) return resolve(null);
        var enc = new TextEncoder().encode(String(str));
        g.subtle.digest('SHA-256', enc).then(function(buf){
          var a = new Uint8Array(buf), h = '';
          for (var i = 0; i < a.length; i++){ var x = a[i].toString(16); h += (x.length < 2 ? '0' : '') + x; }
          resolve(h);
        })['catch'](function(){ resolve(null); });
      } catch(e){ resolve(null); }
    });
  }
  /* schema2 candidate record を build し、その安定 hash を返す。
     ★prepare でも commit でも **同じこの関数**を通す（二重実装しない）。 */
  function buildSchema2WithHash(storyId, deps){
    var C = f743();
    if (!C || typeof C.buildSchema2Record !== 'function')
      return Promise.resolve({ error: 'NO_BUILDER' });
    var built;
    try { built = C.buildSchema2Record(deps, storyId); }
    catch(e){ return Promise.resolve({ error: 'BUILDER_THREW', detail: String(e && e.message || e) }); }
    if (!built || built.hold) return Promise.resolve({ error: 'BUILD_SCHEMA2_HOLD', detail: built ? built.hold : null });
    if (!built.record || built.record.schema !== 2) return Promise.resolve({ error: 'BUILDER_NOT_SCHEMA2' });
    var s = stableStringOf(built.record);
    if (s == null) return Promise.resolve({ error: 'NO_STABLE_SERIALIZER' });
    return sha256hex(s).then(function(h){
      if (!h) return { error: 'HASH_UNAVAILABLE' };
      return { record: built.record, recordHash: h };
    });
  }

  /* ---------------- fresh getstory（schema2-capable dedicated read のみ） ----------------
     ★★裁定36 OPTION_B / BLOCKER #6 = C1_POST_COMMIT_READBACK_SCHEMA_DECLARATION_GAP:
       旧実装は fix697.shadowRequest({op:'getstory'}) を使っており
       clientCanonicalSchemaMax を宣言しないため、row が schema2 になった瞬間から
       Worker v39 の OLD CLIENT READ GATE に掛かり 409 CLIENT_SCHEMA_TOO_OLD になっていた
       （= schema2 を書けるのに書いた直後から自分で読めない）。live で実測。
     ★fix697.getStoryV2Once **のみ**を使う。shadowRequest への fallback は禁止。
       fallback を残すと「schema2 へ到達した後だけ突然旧 read へ落ちて 409」という
       同じ構造を再び作ることになる。ROW_ABSENT / schema1 / schema2 は
       すべてこの dedicated read で分類する。 */
  function freshGetStory(storyId){
    return new Promise(function(resolve){
      var F = f697();
      if (!F || typeof F.getStoryV2Once !== 'function')
        return resolve({ error: 'NO_V2_READ_PATH' });
      /* ★★裁定34 待ち BLOCKER5（FIX697_CALLBACK_ARG_ORDER）:
         fix697 の callback は **cb(result, errorCode)**（node 慣例の (err, result) ではない）。
         逐語: postSaveOnce は成功時 cb({status,j}, null) / 失敗時 cb(null, 'NETWORK_FAILED')。
         ★fix702 の post() は逆に cb(err, result) なので、両者を取り違えないこと。
         旧実装は (err, result) と解釈していたため、成功応答が err 扱いになり
         prepare が必ず READ_FAILED_AT_START で write0 になっていた（live で実測）。 */
      F.getStoryV2Once(storyId, function(r, errCode){
        if (errCode || !r) return resolve({ error: 'READ_UNAVAILABLE', detail: errCode || null });
        if (r.status === 404) return resolve({ absent: true, status: 404 });
        var j = r.j || {};
        if (r.status !== 200 || !j.ok){
          if (j.errorCode === 'not-found' || r.status === 404) return resolve({ absent: true, status: r.status });
          return resolve({ error: 'READ_FAILED', status: r.status, errorCode: j.errorCode || null });
        }
        if (j.absent === true || j.exists === false) return resolve({ absent: true, status: 200 });
        var rec = j.record || null;
        var schema = (rec && rec.schema === 2) ? 2 : 1;
        resolve({ absent: false, rev: (typeof j.rev === 'number' ? j.rev : null),
                  serverHash: j.serverHash || null, authority: String(j.authority || 'shadow'),
                  deleted: !!j.deleted, schema: schema, title: rec ? rec.title : null,
                  /* ★裁定39: release validation で server record 本体を照合するため保持する。
                     ★分類（classify）には使わない。従来の metadata 判定は 1 ビットも変えない。 */
                  record: rec });
      });
    });
  }

  /* ---------------- STATE A: row absent → schema1 shadow ----------------
     ★P0-4: projection は caller から受け取らない。fix697 の正規 builder から内部生成する。 */
  function internalProjection(storyId){
    var F = f697();
    if (!F || typeof F.projectionOf !== 'function') return { error: 'NO_PROJECTION_BUILDER' };
    var p = null;
    try { p = F.projectionOf(storyId); }
    catch(e){ return { error: 'PROJECTION_THREW', detail: String(e && e.message || e) }; }
    if (!p || typeof p !== 'object') return { error: 'NO_LOCAL_PROJECTION' };
    if (String(p.id) !== String(storyId))
      return { error: 'PROJECTION_ID_MISMATCH', detail: { got: p.id, want: storyId } };
    if (p.schema !== 1) return { error: 'PROJECTION_NOT_SCHEMA1', detail: p.schema };
    return { projection: p };
  }
  function stepShadowWrite(storyId, ctx){
    return new Promise(function(resolve){
      var F = f697();
      if (!F || typeof F.putStoryOnce !== 'function') return resolve(refuse('NO_PUTSTORY_PATH'));
      var ip = internalProjection(storyId);
      if (ip.error) return resolve(refuse(ip.error, ip.detail || null));
      var mid = 'f750:shadow:' + storyId + ':' + ctx.startedAt;
      /* ★fix697 契約: cb(result, errorCode) */
      F.putStoryOnce({ id: storyId, baseStoryRev: 0, record: ip.projection, mid: mid,
                       clientMeta: { build: BUILD } }, function(r, errCode){
        resolve({ err: errCode || null, status: r ? r.status : null, j: r ? r.j : null });
      });
    });
  }

  /* ---------------- STATE B: shadow → canonical（fix702 正規経路） ----------------
     ★P0-3: 永続 flag v292Dfix702On を立てない。専用の狭い入口だけを使う。 */
  function stepPromotion(storyId){
    return new Promise(function(resolve){
      var P = f702();
      if (!P || typeof P.promoteForC1Materialization !== 'function')
        return resolve({ err: 'NO_C1_PROMOTION_PATH' });
      /* ★fix702 の promotion は current document story にのみ作用する。
         呼び出し前に scope 一致を確認済み（prepare の preflight）。
         promoteForC1Materialization 側でも exact storyId / schema1 shadow を再検証する。 */
      P.promoteForC1Materialization(storyId, function(res){ resolve({ res: res || null }); });
    });
  }

  /* ---------------- STATE C: canonical schema1 → canonical schema2 ----------------
     ★ここだけが不可逆。commitSchema2() からしか呼ばれない。 */
  /* ★★裁定43: putcanonical の payload は **journal binding からのみ**組み立てる。
     ここで fresh server state からも current runtime BUILD からも値を作らない。
     req = { storyId, expectedRev, expectedHash, mid, record, build } */
  function stepCanonicalWrite(req){
    return new Promise(function(resolve){
      var F = f697();
      if (!F || typeof F.putCanonicalOnce !== 'function') return resolve(refuse('NO_PUTCANONICAL_PATH'));
      /* ★fix697 契約: cb(result, errorCode) */
      F.putCanonicalOnce({ id: req.storyId, expectedRev: req.expectedRev, expectedHash: req.expectedHash,
                           record: req.record, mid: req.mid, clientMeta: { build: req.build } },
        function(r, errCode){
          resolve({ err: errCode || null, status: r ? r.status : null, j: r ? r.j : null,
                    builtTitle: req.record.title });
        });
    });
  }

  /* ---------------- 共通 preflight（lock の外・mutation 0） ---------------- */
  function preflight(storyId, opts){
    if (!on()) return refuse('REFUSED_DISABLED');
    if (!storyId || typeof storyId !== 'string') return refuse('REFUSED_BAD_TARGET');
    if (storyId === 'default' || storyId === 'chr6')
      return refuse('REFUSED_DEFAULT_STORY_UNSUPPORTED');
    /* ★P0-4: caller supplied projection / record / body / sidecar は受け付けない。 */
    if (opts && (opts.projection !== undefined || opts.record !== undefined ||
                 opts.body !== undefined || opts.sidecar !== undefined))
      return refuse('REFUSED_CALLER_PROJECTION_FORBIDDEN',
                    { supplied: Object.keys(opts).filter(function(k){
                        return k === 'projection' || k === 'record' || k === 'body' || k === 'sidecar'; }) });
    /* ★scope: 対象は current document story のみ。fix702 の promotion が
       current document にしか作用しないため、ここを緩めると別 story を巻き込む。 */
    var dk = docStoryId();
    if (dk !== storyId) return refuse('REFUSED_SCOPE_MISMATCH', { documentStory: dk, target: storyId });
    var G = gws();
    /* ★裁定39: materialization は GWS の dedicated entry からのみ入る。
       generic runTurnMutation は generic MAT hold に掛かるため使わない（fallback も作らない）。 */
    if (!G || typeof G.runMaterialization !== 'function') return refuse('REFUSED_NO_GWS');
    var C = f743();
    if (!C || typeof C.buildSchema2Record !== 'function') return refuse('REFUSED_NO_BUILDER');
    var F = f697();
    if (!F || typeof F.projectionOf !== 'function' || typeof F.canonicalString !== 'function')
      return refuse('REFUSED_NO_PROJECTION_API');
    return null;
  }
  function mkCtx(opts){
    return {
      startedAt: Date.now(),
      deps: (opts && opts.deps) || { nativeGet: function(k){ return lsg(k); },
                                     nativeSet: lss, nativeRemove: lsr },
      snapshotId: null
    };
  }
  /* GWS 直列化（既存 lock 名のみ・新規 lock を作らない）
     ★★裁定39: dedicated materialization entry を使う。
       これが免除するのは generic MAT hold（MATERIALIZATION_RECONCILE_REQUIRED）**だけ**で、
       safetyDisabled / boot barrier / Web Locks / cross-context BUSY / Gate B は従来どおり掛かる。
       fix750 側の scope / snapshot / READY binding / server rev・hash / recordHash も全て維持。 */
  function inLock(fn){
    var G = gws();
    return G.runMaterialization(function(){
      /* ★legacy bypass 拒否: serializationRequired()===false のとき _runExclusive は
         lock を取らずに fn を呼ぶ。materialization を非直列で走らせない。 */
      if (typeof G.serializationRequired === 'function' && !G.serializationRequired())
        return refuse('REFUSED_SERIALIZATION_NOT_ACTIVE');
      return fn();
    }).then(function(x){
      if (!x || x.ran !== true){
        /* WEB_LOCKS_UNAVAILABLE / CROSS_CONTEXT_BUSY / SLOT_ISOLATION_RUNTIME_HOLD /
           GWS_SAFETY_DISABLED_HOLD / BOOT_RECOVERY_BARRIER_* — すべて write0 */
        return refuse('GWS_HOLD', { reason: x && x.reason, policy: x && x.policy,
                                    isolation: (x && x.isolation) || null });
      }
      return x.result;
    }, function(e){
      return refuse('GWS_THREW', String(e && e.message || e));
    });
  }

  /* =====================================================================
     prepare() — ROW_ABSENT → SHADOW_S1 → CANONICAL_S1 → READY_FOR_SCHEMA2
     ★schema2 write は 0。putCanonicalOnce をこの経路から呼ばない。
     ===================================================================== */
  function prepare(storyId, opts){
    opts = opts || {};
    var bad = preflight(storyId, opts);
    if (bad) return Promise.resolve(bad);
    var ctx = mkCtx(opts);
    return inLock(function(){ return prepareInsideLock(storyId, ctx); });
  }

  function prepareInsideLock(storyId, ctx){
    /* ---- 1) fresh getstory（開始時の唯一の authority）---- */
    return freshGetStory(storyId).then(function(g0){
      if (g0.error) return refuse('READ_FAILED_AT_START', g0);
      var s0 = classify(g0);
      if (s0 === STATE.UNSUPPORTED)
        return refuse('UNSUPPORTED_SERVER_STATE', { authority: g0.authority, schema: g0.schema, deleted: g0.deleted });
      if (g0.deleted) return refuse('SERVER_TOMBSTONE', g0);
      if (s0 === STATE.CANONICAL_S2){
        journalClear();
        var already = { ok: true, ran: true, wrote: 0, mutated: false, code: 'ALREADY_COMPLETE',
                        state: s0, server: g0 };
        note(already); return already;
      }

      /* ---- 2) preimage snapshot（first mutating server step の前に必須）---- */
      var S = f564();
      if (!S || typeof S.create !== 'function' || typeof S.verify !== 'function')
        return refuse('REFUSED_NO_SNAPSHOT_API');
      var cr;
      try { cr = S.create(storyId, { reason: 'fix750 C1 prepare preimage', now: Date.now() }); }
      catch(e){ return refuse('SNAPSHOT_THREW', String(e && e.message || e)); }
      if (!cr || !cr.ok) return refuse('SNAPSHOT_CREATE_FAILED', cr || null);
      var vr;
      try { vr = S.verify(cr.id); } catch(e){ return refuse('SNAPSHOT_VERIFY_THREW', String(e && e.message || e)); }
      if (!vr || !vr.ok || (vr.mismatch && vr.mismatch.length) || (vr.missing && vr.missing.length))
        return refuse('SNAPSHOT_VERIFY_FAILED', vr || null);
      ctx.snapshotId = cr.id;

      /* ---- 3) journal 確立（server mutation より前）---- */
      var j = { build: BUILD, storyId: storyId, phase: PHASE.PREPARING,
                snapshotId: ctx.snapshotId,
                lastVerifiedAuthority: g0.absent ? null : g0.authority,
                lastVerifiedSchema: g0.absent ? null : g0.schema,
                lastVerifiedRev: g0.absent ? null : g0.rev,
                lastVerifiedHash: g0.absent ? null : g0.serverHash,
                preparedServerRev: null, preparedServerHash: null, preparedSchema2RecordHash: null,
                preparedCanonicalMid: null,          /* ★裁定43 */
                startedAt: ctx.startedAt };
      if (!journalSet(j)) return refuse('JOURNAL_WRITE_FAILED');

      return advancePrepare(storyId, ctx, g0, s0, j, []);
    });
  }

  /* 状態を1つずつ進める。各遷移の後に必ず fresh readback で再分類する。
     ★観測済みの state からだけ次へ進む。blind replay しない。
     ★CANONICAL_S1 で必ず止まる（schema2 へは進まない）。 */
  function advancePrepare(storyId, ctx, g, state, j, steps){
    if (state === STATE.CANONICAL_S2){
      /* prepare 中に他者が schema2 にした場合。ここからは何も書かない。 */
      journalClear();
      var done = { ok: true, ran: true, wrote: steps.length, mutated: steps.length > 0,
                   code: 'ALREADY_COMPLETE', state: state, steps: steps, server: g,
                   snapshotId: ctx.snapshotId };
      note(done); return Promise.resolve(done);
    }

    if (state === STATE.ROW_ABSENT){
      j.phase = PHASE.PREPARING; journalSet(j);
      return stepShadowWrite(storyId, ctx).then(function(w){
        if (w && w.ok === false) return holdWith(j, 'SHADOW_WRITE_REFUSED', w, steps, ctx);
        /* 応答が曖昧でも再送しない。fresh readback で server 実状態から判定する。 */
        return freshGetStory(storyId).then(function(g1){
          if (g1.error) return holdWith(j, 'READ_FAILED_AFTER_SHADOW_WRITE', g1, steps, ctx);
          var s1 = classify(g1);
          steps.push({ step: 'SHADOW_WRITE', status: w.status || null, observedAfter: s1 });
          if (s1 === STATE.ROW_ABSENT)
            return holdWith(j, 'SHADOW_WRITE_DID_NOT_TAKE_EFFECT', { resp: w, server: g1 }, steps, ctx);
          j.phase = PHASE.SHADOW_VERIFIED;
          j.lastVerifiedAuthority = g1.authority; j.lastVerifiedSchema = g1.schema;
          j.lastVerifiedRev = g1.rev; j.lastVerifiedHash = g1.serverHash; journalSet(j);
          return advancePrepare(storyId, ctx, g1, s1, j, steps);
        });
      });
    }

    if (state === STATE.SHADOW_S1){
      j.phase = PHASE.SHADOW_VERIFIED; journalSet(j);
      return stepPromotion(storyId).then(function(p){
        if (p.err) return holdWith(j, 'PROMOTION_REFUSED', p, steps, ctx);
        return freshGetStory(storyId).then(function(g2){
          if (g2.error) return holdWith(j, 'READ_FAILED_AFTER_PROMOTION', g2, steps, ctx);
          var s2 = classify(g2);
          steps.push({ step: 'PROMOTION', res: p.res ? { ok: p.res.ok, skipped: p.res.skipped || null,
                                                         error: p.res.error || null } : null,
                       observedAfter: s2 });
          if (s2 === STATE.SHADOW_S1)
            return holdWith(j, 'PROMOTION_DID_NOT_TAKE_EFFECT', { res: p.res, server: g2 }, steps, ctx);
          j.phase = PHASE.CANONICAL_S1_VERIFIED;
          j.lastVerifiedAuthority = g2.authority; j.lastVerifiedSchema = g2.schema;
          j.lastVerifiedRev = g2.rev; j.lastVerifiedHash = g2.serverHash; journalSet(j);
          return advancePrepare(storyId, ctx, g2, s2, j, steps);
        });
      });
    }

    if (state === STATE.CANONICAL_S1){
      j.phase = PHASE.CANONICAL_S1_VERIFIED;
      j.lastVerifiedAuthority = g.authority; j.lastVerifiedSchema = g.schema;
      j.lastVerifiedRev = g.rev; j.lastVerifiedHash = g.serverHash;
      journalSet(j);
      /* ★schema2 candidate record を build して binding hash を固定する。
         ★ここで server へは 1 バイトも送らない。 */
      return buildSchema2WithHash(storyId, ctx.deps).then(function(b){
        if (b.error) return holdWith(j, b.error, b.detail || null, steps, ctx);
        /* ★★裁定43: ここで canonical mid を **固定**する。以後 commit も reconcile も
           この値を使い、fresh server state から mid を再生成しない。 */
        var pmid = canonicalMid(storyId, g.rev, g.serverHash);
        if (!pmid) return holdWith(j, 'PREPARED_MID_BUILD_FAILED',
                                   { rev: g.rev, hash: g.serverHash }, steps, ctx);
        j.phase = PHASE.READY_FOR_SCHEMA2;
        j.preparedServerRev = g.rev;
        j.preparedServerHash = g.serverHash;
        j.preparedSchema2RecordHash = b.recordHash;
        j.preparedCanonicalMid = pmid;
        j.preparedAt = Date.now();
        if (!journalSet(j)) return refuse('JOURNAL_WRITE_FAILED');
        var ready = { ok: true, ran: true, wrote: steps.length, mutated: steps.length > 0,
                      code: 'READY_FOR_SCHEMA2', state: state, steps: steps, server: g,
                      snapshotId: ctx.snapshotId,
                      prepared: { rev: g.rev, hash: g.serverHash, recordHash: b.recordHash,
                                  canonicalMid: pmid, build: j.build } };
        note(ready); return ready;
      });
    }

    return Promise.resolve(refuse('UNREACHABLE_STATE', state));
  }

  /* =====================================================================
     commitSchema2() — CANONICAL_S1 → CANONICAL_S2（★不可逆 ONE-SHOT）
     開始可能状態は READY_FOR_SCHEMA2 journal + fresh CANONICAL_S1 のみ。
     ROW_ABSENT / SHADOW_S1 から内部で prepare しない。
     ===================================================================== */
  function commitSchema2(storyId, opts){
    opts = opts || {};
    var bad = preflight(storyId, opts);
    if (bad) return Promise.resolve(bad);
    var j0 = journal();
    if (!j0) return Promise.resolve(refuse('REFUSED_NO_JOURNAL'));
    if (j0.__corrupt) return Promise.resolve(refuse('REFUSED_JOURNAL_CORRUPT', j0));
    if (j0.storyId !== storyId)
      return Promise.resolve(refuse('REFUSED_JOURNAL_STORY_MISMATCH', { journal: j0.storyId, target: storyId }));
    if (j0.phase !== PHASE.READY_FOR_SCHEMA2 && j0.phase !== PHASE.COMMITTING_SCHEMA2)
      return Promise.resolve(refuse('REFUSED_NOT_READY', { phase: j0.phase }));
    if (j0.preparedServerRev == null || !j0.preparedServerHash || !j0.preparedSchema2RecordHash
        || !j0.preparedCanonicalMid || !j0.build)
      return Promise.resolve(refuse('REFUSED_INCOMPLETE_BINDING', {
        rev: j0.preparedServerRev, hash: !!j0.preparedServerHash, recordHash: !!j0.preparedSchema2RecordHash,
        canonicalMid: !!j0.preparedCanonicalMid, build: !!j0.build }));
    /* ★★裁定43: mid は journal 由来。式との exact 一致を commit 前に検証する。 */
    if (!canonicalMidBindingOk(j0))
      return Promise.resolve(refuse('REFUSED_PREPARED_MID_MISMATCH', {
        stored: j0.preparedCanonicalMid || null,
        expected: canonicalMid(j0.storyId, j0.preparedServerRev, j0.preparedServerHash) }));
    var ctx = mkCtx(opts);
    ctx.snapshotId = j0.snapshotId || null;
    /* ★同じ GWS lock を **新規取得**する（prepare 終了から commit まで保持しない）。 */
    return inLock(function(){ return commitInsideLock(storyId, ctx); });
  }

  function commitInsideLock(storyId, ctx){
    /* ---- lock 内で journal を読み直す（lock 外で変わっている可能性がある）---- */
    var j = journal();
    if (!j) return Promise.resolve(refuse('REFUSED_NO_JOURNAL'));
    if (j.__corrupt) return Promise.resolve(refuse('REFUSED_JOURNAL_CORRUPT', j));
    if (j.storyId !== storyId)
      return Promise.resolve(refuse('REFUSED_JOURNAL_STORY_MISMATCH', { journal: j.storyId, target: storyId }));
    if (j.phase !== PHASE.READY_FOR_SCHEMA2 && j.phase !== PHASE.COMMITTING_SCHEMA2)
      return Promise.resolve(refuse('REFUSED_NOT_READY', { phase: j.phase }));
    /* ★★裁定43: lock 内でも mid binding を再検証（lock 外で journal が差し替わり得る）。 */
    if (!canonicalMidBindingOk(j) || !j.build)
      return Promise.resolve(refuse('REFUSED_PREPARED_MID_MISMATCH', {
        stored: j.preparedCanonicalMid || null, build: j.build || null,
        expected: canonicalMid(j.storyId, j.preparedServerRev, j.preparedServerHash) }));
    /* ---- 1) current document story 再確認（lock 取得までに切替わっている可能性）---- */
    if (docStoryId() !== storyId)
      return Promise.resolve(refuse('REFUSED_SCOPE_MISMATCH', { documentStory: docStoryId(), target: storyId }));
    /* ---- 2) snapshot が存在し verify PASS すること ---- */
    var S = f564();
    if (!S || typeof S.verify !== 'function') return Promise.resolve(refuse('REFUSED_NO_SNAPSHOT_API'));
    if (!j.snapshotId)
      return Promise.resolve(holdSync(j, 'HOLD_STATE_CHANGED_SINCE_PREPARE', { reason: 'SNAPSHOT_ID_MISSING' }, ctx));
    var vr;
    try { vr = S.verify(j.snapshotId); } catch(e){ vr = { ok: false, threw: String(e && e.message || e) }; }
    if (!vr || !vr.ok || (vr.mismatch && vr.mismatch.length) || (vr.missing && vr.missing.length))
      return Promise.resolve(holdSync(j, 'HOLD_STATE_CHANGED_SINCE_PREPARE',
                                      { reason: 'SNAPSHOT_VERIFY_FAILED', verify: vr || null }, ctx));
    ctx.snapshotId = j.snapshotId;

    /* ---- 3) fresh server state（authority / schema / rev / hash）---- */
    return freshGetStory(storyId).then(function(g){
      if (g.error) return refuse('READ_FAILED_AT_START', g);
      var st = classify(g);
      if (st === STATE.CANONICAL_S2){
        /* 既に schema2。write0 で完了扱い（resend 0）。 */
        j.phase = PHASE.COMPLETE; journalSet(j); journalClear();
        var done0 = { ok: true, ran: true, wrote: 0, mutated: false, code: 'ALREADY_COMPLETE',
                      state: st, server: g, snapshotId: ctx.snapshotId };
        note(done0); return done0;
      }
      if (st !== STATE.CANONICAL_S1)
        return holdSync(j, 'HOLD_STATE_CHANGED_SINCE_PREPARE',
                        { reason: 'NOT_CANONICAL_S1', observed: st, server: g }, ctx);
      if (g.deleted)
        return holdSync(j, 'HOLD_STATE_CHANGED_SINCE_PREPARE', { reason: 'SERVER_TOMBSTONE', server: g }, ctx);
      if (g.rev !== j.preparedServerRev)
        return holdSync(j, 'HOLD_STATE_CHANGED_SINCE_PREPARE',
                        { reason: 'SERVER_REV_CHANGED', prepared: j.preparedServerRev, fresh: g.rev }, ctx);
      if (g.serverHash !== j.preparedServerHash)
        return holdSync(j, 'HOLD_STATE_CHANGED_SINCE_PREPARE',
                        { reason: 'SERVER_HASH_CHANGED',
                          preparedPrefix: String(j.preparedServerHash).slice(0, 12),
                          freshPrefix: String(g.serverHash).slice(0, 12) }, ctx);

      /* ---- 4) local を今この瞬間に build し直して binding hash と一致するか ---- */
      return buildSchema2WithHash(storyId, ctx.deps).then(function(b){
        if (b.error) return holdSync(j, 'HOLD_STATE_CHANGED_SINCE_PREPARE',
                                     { reason: 'BUILD_FAILED', error: b.error, detail: b.detail || null }, ctx);
        if (b.recordHash !== j.preparedSchema2RecordHash)
          return holdSync(j, 'HOLD_STATE_CHANGED_SINCE_PREPARE',
                          { reason: 'RECORD_HASH_CHANGED',
                            preparedPrefix: String(j.preparedSchema2RecordHash).slice(0, 12),
                            freshPrefix: String(b.recordHash).slice(0, 12) }, ctx);

        /* ---- 5) ★ここだけが不可逆。putcanonical を **exactly 1 回**。---- */
        /* ★★裁定43: expectedRev / expectedHash / mid / build はすべて **journal 由来**。
           fresh 値からは作らない。fresh との一致は上の 3) で既に検証済みなので、
           journal 由来にしても normal commit の送信内容は従来と同一（parity）。 */
        /* ═══ ★★裁定44 BLOCKER #11 = C1_COMMIT_INTENT_DURABILITY ═══
           不可逆 putcanonical を送る **前** に COMMITTING journal が durable であることを必須化する。
             persist → fresh readback exact → only then putcanonical
           これで「persisted phase < COMMITTING ⇒ putcanonical attempt 0」が正式契約になり、
           safe abandon の判断を phase に依存させられる（裁定44）。
           ★journalSet の戻り値を無視して送信してはならない。
           ★readback は 8 フィールド exact（commitIntentIdentity）。 */
        j.phase = PHASE.COMMITTING_SCHEMA2; j.committingAt = Date.now();
        var want = commitIntentIdentity(j);
        if (!journalSet(j))
          return refuseNotSent('REFUSED_COMMITTING_JOURNAL_PERSIST_FAILED',
                               { reason: 'JOURNAL_SET_FAILED', phase: PHASE.COMMITTING_SCHEMA2 });
        var back = journal();
        if (!back || back.__corrupt || commitIntentIdentity(back) !== want)
          return refuseNotSent('REFUSED_COMMITTING_JOURNAL_PERSIST_FAILED',
                               { reason: 'READBACK_MISMATCH',
                                 persistedPhase: back && !back.__corrupt ? (back.phase || null) : null,
                                 corrupt: !!(back && back.__corrupt) });
        var steps = [];
        var req = { storyId: storyId, expectedRev: j.preparedServerRev,
                    expectedHash: j.preparedServerHash, mid: j.preparedCanonicalMid,
                    record: b.record, build: j.build };
        return stepCanonicalWrite(req).then(function(w){
          if (w && w.ok === false) return holdWith(j, 'CANONICAL_WRITE_REFUSED', w, steps, ctx);
          /* ★★裁定36 BLOCKER #7: ここから先は putcanonical を **送信済み**。
             以降の HOLD はすべて holdAfterWrite を通し、wrote:0 / mutated:false と断定しない。 */
          return freshGetStory(storyId).then(function(g3){
            if (g3.error)
              /* readback 不能 ＝ server mutation の有無を client からは証明できない。
                 ★「client が HOLD ＝ schema2 未作成」と解釈してはならない。
                 ★blind retry 禁止。caller は authoritative read（D1 等）で確定させること。 */
              return holdAfterWrite(j, 'READ_FAILED_AFTER_CANONICAL_WRITE', g3, steps, ctx, 'UNKNOWN');
            var s3 = classify(g3);
            steps.push({ step: 'CANONICAL_WRITE', status: w.status || null, observedAfter: s3 });
            if (s3 !== STATE.CANONICAL_S2)
              /* ★blind retry 禁止。schema1 canonical のままなら明示 resume を要求して HOLD。
                 readback 自体は成功しているが、それでも wrote:0 は返さない（NOT_OBSERVED）。 */
              return holdAfterWrite(j, 'CANONICAL_WRITE_DID_NOT_TAKE_EFFECT',
                              { resp: (w && w.j) ? { errorCode: w.j.errorCode, status: w.status } : { status: w.status },
                                server: g3 }, steps, ctx, 'NOT_OBSERVED');
            if (w.builtTitle != null && g3.title != null && g3.title !== w.builtTitle)
              /* mutation は authoritative readback で確認済み（APPLIED）。title だけが不一致。 */
              return holdAfterWrite(j, 'TITLE_MISMATCH_AFTER_WRITE',
                              { sent: w.builtTitle, server: g3.title }, steps, ctx, 'APPLIED');
            j.phase = PHASE.COMPLETE; j.lastVerifiedAuthority = 'canonical'; j.lastVerifiedSchema = 2;
            j.lastVerifiedRev = g3.rev; j.lastVerifiedHash = g3.serverHash; journalSet(j);
            journalClear();
            var done = { ok: true, ran: true, wrote: 1, mutated: true, code: 'MATERIALIZED',
                         serverWriteAttempted: true, serverMutationState: 'APPLIED',
                         authoritativeReadbackRequired: false,
                         state: s3, steps: steps, server: g3, snapshotId: ctx.snapshotId };
            note(done); return done;
          });
        });
      });
    });
  }

  /* HOLD: journal を残し、自動 rollback も自動 retry もしない
     ★★裁定36 BLOCKER #7 = C1_POST_WRITE_RESULT_TRUTHFULNESS:
       旧実装は steps が非空（＝既に server へ書いている）でも一律 wrote:0 / mutated:false を返していた。
       ここは **実際に完了が観測できた step 数**を返す（各 step は push 前に fresh readback で確認済み）。 */
  function holdWith(j, code, detail, steps, ctx){
    j.hold = code; j.holdAt = Date.now();
    journalSet(j);
    var n = (steps && steps.length) || 0;
    var h = { ok: false, ran: true, wrote: n, mutated: n > 0, code: 'HOLD', hold: code,
              detail: detail, steps: steps, journalRetained: true, snapshotId: ctx.snapshotId };
    note(h); return Promise.resolve(h);
  }

  /* ★★裁定36 BLOCKER #7: putcanonical を **送信したあと**の HOLD 専用。
     旧実装はここでも wrote:0 / mutated:false を返していたが、live で
       client result = { wrote:0, mutated:false, hold:'READ_FAILED_AFTER_CANONICAL_WRITE' }
       server        = schema2 row が実在
     という乖離が発生した（初 schema2 canonical row 作成時の実測）。
     ＝「client が write0 と言った」を **server mutation 不存在の証拠として使えてはならない**。
     契約:
       serverWriteAttempted        … putcanonical を送信したか（送信していれば常に true）
       serverMutationState         … 'APPLIED'（authoritative readback で確認）
                                     'UNKNOWN'（readback 不能。作成有無を証明できない）
                                     'NOT_OBSERVED'（readback は成功したが schema2 を観測できず）
       authoritativeReadbackRequired … caller が D1/authoritative read で確定させる必要があるか
     ★UNKNOWN / NOT_OBSERVED では wrote / mutated を **null** にする。
       0 / false を返さないので「書いていない証拠」として使えない。
     ★blind retry は禁止（この関数は retry を一切示唆しない）。 */
  function holdAfterWrite(j, code, detail, steps, ctx, mutState){
    j.hold = code; j.holdAt = Date.now();
    j.serverWriteAttempted = true;
    j.serverMutationState = mutState;
    journalSet(j);
    var applied = (mutState === 'APPLIED');
    var h = { ok: false, ran: true,
              wrote: applied ? 1 : null,
              mutated: applied ? true : null,
              serverWriteAttempted: true,
              serverMutationState: mutState,
              authoritativeReadbackRequired: !applied,
              code: 'HOLD', hold: code,
              detail: detail, steps: steps, journalRetained: true, snapshotId: ctx.snapshotId };
    note(h); return Promise.resolve(h);
  }
  /* ★★裁定44 BLOCKER #11: server へ 1 バイトも送っていないことが確実な refuse。
     journal へは書かない（そもそも journal 書込が失敗しているケースで使うため）。 */
  function refuseNotSent(code, detail){
    var r = { ok: false, ran: true, wrote: 0, mutated: false,
              serverWriteAttempted: false, serverMutationState: null,
              authoritativeReadbackRequired: false,
              code: code, detail: detail || null, journalRetained: true, snapshotRetained: true };
    note(r); return r;
  }
  /* commit の precondition 不成立（★server へ 1 バイトも送っていない）*/
  function holdSync(j, code, detail, ctx){
    j.hold = code; j.holdAt = Date.now();
    journalSet(j);
    var h = { ok: false, ran: true, wrote: 0, mutated: false, code: 'HOLD', hold: code,
              detail: detail, steps: [], journalRetained: true, snapshotId: ctx.snapshotId };
    note(h); return h;
  }

  /* ═══════════════════════════════════════════════════════════════════
     ★★裁定37 FIX750_CRASH_BOOT_RECOVERY_GATE — recoveryStatus()
     crash / reload で matTxn が残ったときの **分類だけ**を行う read-only 診断。

     契約（この関数は絶対に守る）:
       ・server へ write を 1 バイトも送らない（read は fix697.getStoryV2Once のみ）
       ・localStorage を 1 バイトも書かない / journal を clear しない / snapshot を消さない
       ・auto commit / auto retry / auto resume / auto rollback / auto cleanup を **しない**
       ・journal だけで結論を出さない。必ず fresh server truth と突き合わせる
         （ただし journal 自体が壊れている / story が違う場合は server を読む前に HARD_HOLD）
       ・この結果が GWS barrier を自動で開けることは無い（barrier は PENDING のまま）
       ・caller は引数を渡せない。対象は journal.storyId のみ
       ・fix750On / fix750Off の状態に関わらず動く（journal の寿命 > kill switch）

     戻り値: { verdict, ok:false, ran:true, wrote:0, mutated:false,
               serverWriteAttempted:false, autoResume:false, journalRetained:true,
               phase, storyId, server, snapshot, localCompletionEligible, detail? } */
  var RECOVERY = {
    NO_JOURNAL:                    'NO_JOURNAL',
    HARD_HOLD_JOURNAL_CORRUPT:     'HARD_HOLD_JOURNAL_CORRUPT',
    HARD_HOLD_STORY_MISMATCH:      'HARD_HOLD_STORY_MISMATCH',
    HOLD_READ_UNAVAILABLE:         'HOLD_READ_UNAVAILABLE',
    ALREADY_APPLIED_CANDIDATE:     'ALREADY_APPLIED_CANDIDATE',
    HOLD_AMBIGUOUS_NOT_APPLIED:    'HOLD_AMBIGUOUS_NOT_APPLIED',
    HOLD_PREPARED:                 'HOLD_PREPARED',
    HOLD_PARTIAL_PREPARE:          'HOLD_PARTIAL_PREPARE',
    HOLD_PARTIAL_OR_FAILED_PREPARE:'HOLD_PARTIAL_OR_FAILED_PREPARE'
  };
  function recResult(verdict, extra){
    var r = { verdict: verdict, ok: false, ran: true, wrote: 0, mutated: false,
              serverWriteAttempted: false, autoResume: false, journalRetained: true };
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) r[k] = extra[k];
    note(r); return r;
  }
  /* snapshot の健全性（read-only）。fix564.verify は snapshot コピーの自己整合しか見ないので、
     live local key との独立比較もここで行う（裁定32 で確定した 4 番目の乖離への対処）。 */
  function snapshotState(snapshotId){
    var out = { id: snapshotId || null, present: false, verifyOk: false, liveMatches: false };
    if (!snapshotId) return out;
    var raw = lsg(snapshotId);
    if (raw == null) return out;
    out.present = true;
    var S = f564();
    if (S && typeof S.verify === 'function'){
      try { var v = S.verify(snapshotId); out.verifyOk = !!(v && v.ok); out.verify = v; }
      catch(e){ out.verifyOk = false; out.verifyThrew = String(e && e.message || e); }
    }
    var man = null; try { man = JSON.parse(raw); } catch(e){ out.manifestCorrupt = true; return out; }
    if (!man || !man.parts){ out.manifestCorrupt = true; return out; }
    var all = true, n = 0;
    for (var lk in man.parts){
      if (!Object.prototype.hasOwnProperty.call(man.parts, lk)) continue;
      n++;
      var p = man.parts[lk];
      if (lsg(p.liveKey) !== lsg(p.snapKey)) all = false;
    }
    out.parts = n; out.liveMatches = (n > 0 && all);
    return out;
  }
  function recoveryStatus(){
    var j = journal();
    if (!j) return Promise.resolve(recResult(RECOVERY.NO_JOURNAL, { phase: null, storyId: null }));
    if (j.__corrupt)
      return Promise.resolve(recResult(RECOVERY.HARD_HOLD_JOURNAL_CORRUPT,
        { phase: null, storyId: null, detail: { raw: j.raw || null } }));
    var sid = j.storyId;
    if (!sid || typeof sid !== 'string')
      return Promise.resolve(recResult(RECOVERY.HARD_HOLD_JOURNAL_CORRUPT,
        { phase: j.phase || null, storyId: sid || null, detail: { reason: 'NO_STORY_ID' } }));
    /* ★scope: 別 story を巻き込まない。document が別なら server を読まずに HARD_HOLD。 */
    var dk = docStoryId();
    if (dk !== sid)
      return Promise.resolve(recResult(RECOVERY.HARD_HOLD_STORY_MISMATCH,
        { phase: j.phase || null, storyId: sid, detail: { documentStory: dk } }));
    var snap = snapshotState(j.snapshotId || null);
    return freshGetStory(sid).then(function(g){
      var base = { phase: j.phase || null, storyId: sid, snapshot: snap,
                   journal: { preparedServerRev: j.preparedServerRev == null ? null : j.preparedServerRev,
                              preparedServerHash: j.preparedServerHash || null,
                              preparedSchema2RecordHash: j.preparedSchema2RecordHash || null,
                              hold: j.hold || null } };
      if (g.error){
        base.server = { error: g.error, status: g.status || null, errorCode: g.errorCode || null };
        return recResult(RECOVERY.HOLD_READ_UNAVAILABLE, base);
      }
      var st = classify(g);
      base.server = { state: st, absent: !!g.absent, rev: g.rev == null ? null : g.rev,
                      serverHash: g.serverHash || null, authority: g.authority || null,
                      schema: g.schema == null ? null : g.schema, title: g.title == null ? null : g.title };
      if (st === STATE.CANONICAL_S2){
        /* server 側は既に schema2。**それでも自動で journal を閉じない**。
           local completion の候補にできるのは snapshot が健全なときだけ。 */
        base.localCompletionEligible = !!(snap.present && snap.verifyOk && snap.liveMatches);
        return recResult(RECOVERY.ALREADY_APPLIED_CANDIDATE, base);
      }
      if (st === STATE.CANONICAL_S1){
        if (j.phase === PHASE.COMMITTING_SCHEMA2) return recResult(RECOVERY.HOLD_AMBIGUOUS_NOT_APPLIED, base);
        if (j.phase === PHASE.READY_FOR_SCHEMA2)  return recResult(RECOVERY.HOLD_PREPARED, base);
        return recResult(RECOVERY.HOLD_PARTIAL_PREPARE, base);
      }
      if (st === STATE.SHADOW_S1)   return recResult(RECOVERY.HOLD_PARTIAL_PREPARE, base);
      if (st === STATE.ROW_ABSENT)  return recResult(RECOVERY.HOLD_PARTIAL_OR_FAILED_PREPARE, base);
      return recResult(RECOVERY.HOLD_PARTIAL_PREPARE, base);
    });
  }

  /* ═══════════════════════════════════════════════════════════════════
     ★★裁定39 C1_RECOVERY_RELEASE_GATE — completeAppliedRecovery()

     「schema2 まで確かに書けたあとに落ちた」journal **だけ**を、狭い正式経路で解消する。
     一般ユーザーに DevTools を触らせないための唯一の出口。

     契約:
       ・引数 0。対象は journal.storyId 固定（caller は対象を差し替えられない）。
       ・自動実行 0（明示呼び出しのみ）。UI から journalClear を直接露出しない。
       ・server write 0。snapshot 削除 0。
       ・成功時のみ v292Dfix750_matTxn を **1 回だけ** removeItem。他の storage mutation 0。
       ・NOT_APPLIED / PARTIAL / HARD_HOLD 系は **絶対に clear しない**
         （C1_RECOVERY_NON_APPLIED_EXIT は別 Gate。auto resume / cancel rollback は作らない）。
       ・成功しても同一 page でゲーム再開はしない（reloadRequired:true を返す）。

     clear 条件（1 つでも欠けたら REFUSE / journal 保持）:
       1. journal valid（parse 可・storyId あり）
       2. documentStory === journal.storyId
       3. fresh V2 read: authority canonical / schema 2 / deleted false
       4. server.rev === preparedServerRev + 1
       5. snapshot: present / verify PASS / liveMatches PASS
       6. 現在の buildSchema2Record() hash === journal.preparedSchema2RecordHash
       7. server schema2 record の client-owned（schema/title/deleted/body/sidecar）が
          現在の rebuilt record と semantic exact
       8. server-owned: id === storyId / turnCount === body.turns.length / snippet contract valid
       9. ★async validation 中に journal がすり替わっていないこと
          （開始時と clear 直前で transaction identity / binding を再照合） */
  var RELEASE = {
    COMPLETED:                              'RECOVERY_COMPLETED',
    REFUSED_NO_JOURNAL:                     'REFUSED_NO_JOURNAL',
    REFUSED_JOURNAL_CORRUPT:                'REFUSED_JOURNAL_CORRUPT',
    REFUSED_STORY_MISMATCH:                 'REFUSED_STORY_MISMATCH',
    REFUSED_NOT_APPLIED:                    'REFUSED_NOT_APPLIED',
    REFUSED_READ_UNAVAILABLE:               'REFUSED_READ_UNAVAILABLE',
    REFUSED_SERVER_REV_MISMATCH:            'REFUSED_SERVER_REV_MISMATCH',
    REFUSED_SNAPSHOT_UNVERIFIED:            'REFUSED_SNAPSHOT_UNVERIFIED',
    REFUSED_PREPARED_RECORD_HASH_MISMATCH:  'REFUSED_PREPARED_RECORD_HASH_MISMATCH',
    REFUSED_RECOVERY_SERVER_RECORD_MISMATCH:'REFUSED_RECOVERY_SERVER_RECORD_MISMATCH',
    REFUSED_JOURNAL_CHANGED_DURING_VALIDATION:'REFUSED_JOURNAL_CHANGED_DURING_VALIDATION',
    REFUSED_BUILD_FAILED:                   'REFUSED_BUILD_FAILED',
    /* ★裁定40 BLOCKER #10 */
    REFUSED_NO_COMPLETION_PATH:             'REFUSED_NO_COMPLETION_PATH',
    REFUSED_COMPLETION_LOCK_HOLD:           'REFUSED_COMPLETION_LOCK_HOLD',
    REFUSED_RELEASE_EPOCH_WRITE_FAILED:     'REFUSED_RELEASE_EPOCH_WRITE_FAILED',
    REFUSED_JOURNAL_CLEAR_FAILED:           'REFUSED_JOURNAL_CLEAR_FAILED'
  };
  function relResult(code, extra){
    var ok = (code === RELEASE.COMPLETED);
    var r = { code: code, completed: ok, journalCleared: ok, reloadRequired: ok,
              ok: false, ran: true, wrote: 0, mutated: false,
              serverWriteAttempted: false, autoResume: false,
              journalRetained: !ok, snapshotRetained: true };
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) r[k] = extra[k];
    note(r); return r;
  }
  /* journal の同一性（async 検証中のすり替え検出用）。値は hash ではなく binding そのもの。 */
  function journalIdentity(j){
    if (!j || j.__corrupt) return null;
    return [j.storyId, j.phase, j.snapshotId, j.startedAt, j.preparedAt,
            j.preparedServerRev, j.preparedServerHash, j.preparedSchema2RecordHash].join('\x1f');
  }
  /* client-owned フィールドの semantic exact 比較（key 順に依存しない） */
  function semanticEqual(a, b){
    if (a === b) return true;
    if (a === null || b === null || a === undefined || b === undefined) return a === b;
    var ta = Object.prototype.toString.call(a), tb = Object.prototype.toString.call(b);
    if (ta !== tb) return false;
    if (ta === '[object Array]'){
      if (a.length !== b.length) return false;
      for (var i = 0; i < a.length; i++) if (!semanticEqual(a[i], b[i])) return false;
      return true;
    }
    if (ta === '[object Object]'){
      var ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
      if (ka.length !== kb.length) return false;
      for (var n = 0; n < ka.length; n++) if (ka[n] !== kb[n]) return false;
      for (var m = 0; m < ka.length; m++) if (!semanticEqual(a[ka[m]], b[ka[m]])) return false;
      return true;
    }
    return a === b;
  }
  function completeAppliedRecovery(){
    var j0 = journal();
    if (!j0) return Promise.resolve(relResult(RELEASE.REFUSED_NO_JOURNAL));
    if (j0.__corrupt) return Promise.resolve(relResult(RELEASE.REFUSED_JOURNAL_CORRUPT));
    var sid = j0.storyId;
    if (!sid || typeof sid !== 'string')
      return Promise.resolve(relResult(RELEASE.REFUSED_JOURNAL_CORRUPT, { detail: { reason: 'NO_STORY_ID' } }));
    var dk = docStoryId();
    if (dk !== sid)
      return Promise.resolve(relResult(RELEASE.REFUSED_STORY_MISMATCH,
        { storyId: sid, detail: { documentStory: dk } }));
    if (j0.preparedServerRev == null || !j0.preparedSchema2RecordHash)
      return Promise.resolve(relResult(RELEASE.REFUSED_JOURNAL_CORRUPT,
        { storyId: sid, detail: { reason: 'INCOMPLETE_BINDING' } }));
    var id0 = journalIdentity(j0);
    var snap = snapshotState(j0.snapshotId || null);
    /* 5. snapshot は server を読む前に判定できる */
    if (!(snap.present && snap.verifyOk && snap.liveMatches))
      return Promise.resolve(relResult(RELEASE.REFUSED_SNAPSHOT_UNVERIFIED, { storyId: sid, snapshot: snap }));

    return freshGetStory(sid).then(function(g){
      var base = { storyId: sid, phase: j0.phase || null, snapshot: snap };
      if (g.error){
        base.server = { error: g.error, status: g.status || null, errorCode: g.errorCode || null };
        return relResult(RELEASE.REFUSED_READ_UNAVAILABLE, base);
      }
      var st = classify(g);
      base.server = { state: st, rev: g.rev == null ? null : g.rev, serverHash: g.serverHash || null,
                      authority: g.authority || null, schema: g.schema == null ? null : g.schema,
                      deleted: !!g.deleted };
      /* 3. applied 以外は絶対に clear しない */
      if (st !== STATE.CANONICAL_S2 || g.deleted === true)
        return relResult(RELEASE.REFUSED_NOT_APPLIED, base);
      /* 4. rev は prepared+1 でなければならない（別 context の後続更新を弾く） */
      if (g.rev !== (j0.preparedServerRev + 1))
        return relResult(RELEASE.REFUSED_SERVER_REV_MISMATCH,
          Object.assign(base, { expectedRev: j0.preparedServerRev + 1, actualRev: g.rev }));

      /* 6. 現在の local から record を build し直して prepared hash と一致するか */
      return buildSchema2WithHash(sid, mkCtx({}).deps).then(function(b){
        if (b.error) return relResult(RELEASE.REFUSED_BUILD_FAILED, Object.assign(base, { detail: b }));
        if (b.recordHash !== j0.preparedSchema2RecordHash)
          return relResult(RELEASE.REFUSED_PREPARED_RECORD_HASH_MISMATCH,
            Object.assign(base, { preparedPrefix: String(j0.preparedSchema2RecordHash).slice(0, 12),
                                  freshPrefix: String(b.recordHash).slice(0, 12) }));
        /* 7/8. server 上の schema2 record 本体と照合 */
        var srv = g.record;
        if (!srv || typeof srv !== 'object')
          return relResult(RELEASE.REFUSED_RECOVERY_SERVER_RECORD_MISMATCH,
            Object.assign(base, { detail: { reason: 'NO_SERVER_RECORD' } }));
        var mine = b.record;
        var clientOwned = ['schema', 'title', 'deleted', 'body', 'sidecar'];
        var bad = null;
        for (var i = 0; i < clientOwned.length; i++){
          var k = clientOwned[i];
          if (!semanticEqual(srv[k], mine[k])){ bad = k; break; }
        }
        if (bad)
          return relResult(RELEASE.REFUSED_RECOVERY_SERVER_RECORD_MISMATCH,
            Object.assign(base, { detail: { field: bad } }));
        var turns = (mine.body && Object.prototype.toString.call(mine.body.turns) === '[object Array]')
                    ? mine.body.turns.length : null;
        if (srv.id !== sid || srv.turnCount !== turns || typeof srv.snippet !== 'string')
          return relResult(RELEASE.REFUSED_RECOVERY_SERVER_RECORD_MISMATCH,
            Object.assign(base, { detail: { serverOwned: { id: srv.id, turnCount: srv.turnCount,
                                                           snippetType: typeof srv.snippet },
                                            expect: { id: sid, turnCount: turns } } }));
        /* ---- 9. finalization。★★裁定40 BLOCKER #10:
             ここだけは **既存 shared Web Lock で serialize** する（2 tab 同時 release の CAS）。
             新 lock は作らない。GWS の dedicated completion entry を使う。
             lock 内の順序は厳格に:
               (a) journal identity を再確認（async 検証中のすり替え検出）
               (b) release epoch を **先に**進める
               (c) epoch 書込の成功を読み戻して確認
               (d) その後にだけ matTxn を clear
             journal を先に消すのは禁止。epoch 書込に失敗したら journal を残す（fail-closed）ので、
             全 tab は引き続き MAT hold のまま。epoch が進めば、既存 tab は
             MATERIALIZATION_RELOAD_REQUIRED になり、journal clear 後も古い状態で動けない。 */
        var G = gws();
        if (!G || typeof G.runMaterializationRecoveryCompletion !== 'function')
          return relResult(RELEASE.REFUSED_NO_COMPLETION_PATH, base);
        return G.runMaterializationRecoveryCompletion(function(){
          /* (a) */
          var j1 = journal();
          if (!j1 || j1.__corrupt || journalIdentity(j1) !== id0)
            return relResult(RELEASE.REFUSED_JOURNAL_CHANGED_DURING_VALIDATION,
              Object.assign(base, { detail: { before: id0 ? 'present' : null,
                                              after: j1 ? 'changed' : 'absent' } }));
          /* (b)(c) epoch を先に進める。読み戻して確認できなければ journal は消さない。 */
          var epoch = (typeof G.bumpReleaseEpoch === 'function') ? G.bumpReleaseEpoch() : null;
          if (!epoch)
            return relResult(RELEASE.REFUSED_RELEASE_EPOCH_WRITE_FAILED,
              Object.assign(base, { detail: { reason: 'EPOCH_NOT_PERSISTED' } }));
          /* (d) ここだけが journal の mutation。exactly once。 */
          var cleared = journalClear();
          if (!cleared || journal() !== null)
            /* epoch は進んでいるので全 tab は reload-required。journal も残る＝safe hold。 */
            return relResult(RELEASE.REFUSED_JOURNAL_CLEAR_FAILED,
              Object.assign(base, { releaseEpoch: epoch, reloadRequired: true,
                                    detail: { reason: 'EPOCH_BUMPED_JOURNAL_KEPT' } }));
          return relResult(RELEASE.COMPLETED,
            Object.assign(base, { journalClearedOk: true, releaseEpoch: epoch,
                                  verified: { serverRev: g.rev, serverHash: g.serverHash,
                                              recordHash: b.recordHash, snapshotId: j0.snapshotId || null } }));
        }).then(function(x){
          if (!x || x.ran !== true)
            return relResult(RELEASE.REFUSED_COMPLETION_LOCK_HOLD,
              Object.assign(base, { detail: { reason: x && x.reason, policy: x && x.policy,
                                              active: x && x.active,
                                              reloadRequired: !!(x && x.reloadRequired) } }));
          return x.result;
        });
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════════════
     ★★裁定43 C1_AMBIGUOUS_COMMIT_EXPLICIT_RECONCILE_GATE
     reconcileAmbiguousCommit() — 「putcanonical を送ったかもしれないが server はまだ
     schema1」という COMMITTING_SCHEMA2 の曖昧状態を、**元とまったく同じ 1 発**として
     もう一度送り直せるかを判定し、条件が全部揃ったときだけ exactly 1 回だけ送る。

     ★これは retry ではない。Worker v39 監査（裁定42/43）で確定した契約に依存する:
       ・idempotency key は (u, mid)。op と reqHash(pc1:sid:rev:hash) は validator。
       ・reqHash は record 本体を **含まない** → same-mid different-record を Worker は
         検出できず古い成功応答を replay する。よって record binding は client 側の責務。
       ・noop 判定（server hash == 再構成 hash）は CAS より **前**。したがって既に schema2 なら
         idem の生死に関わらず mutation 0。
     ★journal は絶対に clear しない。epoch も bump しない。snapshot も消さない。
       local release は completeAppliedRecovery() のまま（1 API に混ぜない）。
     ★auto retry 0 / auto resume 0 / 2 回目送信 0。
     ═══════════════════════════════════════════════════════════════════ */
  var RECONCILE = {
    ALREADY_APPLIED_CANDIDATE:   'ALREADY_APPLIED_CANDIDATE',
    RECONCILED_APPLIED_CANDIDATE:'RECONCILED_APPLIED_CANDIDATE',
    REFUSED_NO_JOURNAL:          'REFUSED_NO_JOURNAL',
    REFUSED_JOURNAL_CORRUPT:     'REFUSED_JOURNAL_CORRUPT',
    REFUSED_PHASE_NOT_COMMITTING:'REFUSED_PHASE_NOT_COMMITTING',
    REFUSED_STORY_MISMATCH:      'REFUSED_STORY_MISMATCH',
    REFUSED_INCOMPLETE_BINDING:  'REFUSED_INCOMPLETE_BINDING',
    REFUSED_PREPARED_MID_MISMATCH:'REFUSED_PREPARED_MID_MISMATCH',
    REFUSED_SNAPSHOT_UNVERIFIED: 'REFUSED_SNAPSHOT_UNVERIFIED',
    REFUSED_BUILD_FAILED:        'REFUSED_BUILD_FAILED',
    REFUSED_PREPARED_RECORD_HASH_MISMATCH:'REFUSED_PREPARED_RECORD_HASH_MISMATCH',
    REFUSED_READ_UNAVAILABLE:    'REFUSED_READ_UNAVAILABLE',
    REFUSED_SERVER_STATE_MISMATCH:'REFUSED_SERVER_STATE_MISMATCH',
    REFUSED_JOURNAL_CHANGED_DURING_RECONCILE:'REFUSED_JOURNAL_CHANGED_DURING_RECONCILE',
    REFUSED_NO_RECONCILE_PATH:   'REFUSED_NO_RECONCILE_PATH',
    REFUSED_RECONCILE_LOCK_HOLD: 'REFUSED_RECONCILE_LOCK_HOLD',
    REFUSED_NO_PUTCANONICAL_PATH:'REFUSED_NO_PUTCANONICAL_PATH',
    REFUSED_NOT_SENT:            'REFUSED_NOT_SENT',
    HOLD_IDEM_PROCESSING:        'HOLD_IDEM_PROCESSING',
    HOLD_RECONCILE_WRITE_UNKNOWN:'HOLD_RECONCILE_WRITE_UNKNOWN',
    HOLD_RECONCILE_REFUSED:      'HOLD_RECONCILE_REFUSED',
    HOLD_POST_WRITE_READ_FAILED: 'HOLD_POST_WRITE_READ_FAILED',
    HOLD_NOT_OBSERVED:           'HOLD_NOT_OBSERVED'
  };
  /* ★fix697.putCanonicalOnce / postSaveOnce が **fetch より前**に返す error code（逐語）。
     この集合だけは「送信されていない」ことが production 契約から確定できる。 */
  var PRESEND_ERRORS = { BAD_PAYLOAD: true, BAD_STORY_ID: true, BAD_RECORD: true,
                         BAD_EXPECTED_REV: true, BAD_EXPECTED_HASH: true, BAD_MID: true,
                         NOT_LOGGED_IN: true };
  /* ★★裁定43/44 が列挙した 8 フィールド exact の journal identity。
     ・裁定43: reconcile の server write 直前 race 検出
     ・裁定44 BLOCKER #11: commit の COMMITTING durable readback 照合
     両者で同じ契約を共有する（式を複製しない）。 */
  function commitIntentIdentity(j){
    if (!j || j.__corrupt) return null;
    return [j.storyId, j.phase, j.snapshotId,
            j.preparedServerRev, j.preparedServerHash, j.preparedSchema2RecordHash,
            j.preparedCanonicalMid, j.build].join('\x1f');
  }
  /* server へ 1 バイトも送っていない refuse。wrote:0 / mutated:false は真実。 */
  function recoResult(code, extra){
    var r = { code: code, ok: false, ran: true, wrote: 0, mutated: false,
              serverWriteAttempted: false, serverMutationState: null,
              authoritativeReadbackRequired: false,
              completionRequired: false, autoResume: false,
              journalRetained: true, journalCleared: false, snapshotRetained: true };
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) r[k] = extra[k];
    note(r); return r;
  }
  /* ★送信後。wrote:0 / mutated:false を「server mutation 無し」の証拠として返さない。 */
  function recoAfterWrite(j, code, mutState, extra){
    var applied = (mutState === 'APPLIED');
    j.hold = code; j.holdAt = Date.now();
    j.serverWriteAttempted = true; j.serverMutationState = mutState;
    journalSet(j);
    var r = { code: code, ok: false, ran: true,
              wrote: applied ? 1 : null,
              mutated: applied ? true : null,
              serverWriteAttempted: true,
              serverMutationState: mutState,
              authoritativeReadbackRequired: !applied,
              completionRequired: applied,
              autoResume: false,
              journalRetained: true, journalCleared: false, snapshotRetained: true };
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) r[k] = extra[k];
    note(r); return r;
  }

  function reconcileAmbiguousCommit(){
    var j0 = journal();
    if (!j0) return Promise.resolve(recoResult(RECONCILE.REFUSED_NO_JOURNAL));
    if (j0.__corrupt) return Promise.resolve(recoResult(RECONCILE.REFUSED_JOURNAL_CORRUPT));
    var sid = j0.storyId;
    if (!sid || typeof sid !== 'string')
      return Promise.resolve(recoResult(RECONCILE.REFUSED_JOURNAL_CORRUPT, { detail: { reason: 'NO_STORY_ID' } }));
    /* ★許可 phase は COMMITTING_SCHEMA2 のみ。READY / PREPARING 等からは commit させない。 */
    if (j0.phase !== PHASE.COMMITTING_SCHEMA2)
      return Promise.resolve(recoResult(RECONCILE.REFUSED_PHASE_NOT_COMMITTING,
        { storyId: sid, phase: j0.phase || null }));
    var dk = docStoryId();
    if (dk !== sid)
      return Promise.resolve(recoResult(RECONCILE.REFUSED_STORY_MISMATCH,
        { storyId: sid, detail: { documentStory: dk } }));
    if (j0.preparedServerRev == null || !j0.preparedServerHash || !j0.preparedSchema2RecordHash
        || !j0.preparedCanonicalMid || !j0.build)
      return Promise.resolve(recoResult(RECONCILE.REFUSED_INCOMPLETE_BINDING,
        { storyId: sid, detail: { rev: j0.preparedServerRev, hash: !!j0.preparedServerHash,
                                  recordHash: !!j0.preparedSchema2RecordHash,
                                  canonicalMid: !!j0.preparedCanonicalMid, build: !!j0.build } }));
    /* ★mid は journal 由来。式との exact 一致を server read より前に検証する。 */
    if (!canonicalMidBindingOk(j0))
      return Promise.resolve(recoResult(RECONCILE.REFUSED_PREPARED_MID_MISMATCH,
        { storyId: sid, detail: { stored: j0.preparedCanonicalMid,
            expected: canonicalMid(j0.storyId, j0.preparedServerRev, j0.preparedServerHash) } }));
    var id0 = commitIntentIdentity(j0);
    var snap = snapshotState(j0.snapshotId || null);
    if (!(snap.present && snap.verifyOk && snap.liveMatches))
      return Promise.resolve(recoResult(RECONCILE.REFUSED_SNAPSHOT_UNVERIFIED,
        { storyId: sid, snapshot: snap }));

    return freshGetStory(sid).then(function(g){
      var base = { storyId: sid, phase: j0.phase, snapshot: snap,
                   binding: { rev: j0.preparedServerRev,
                              hashPrefix: String(j0.preparedServerHash).slice(0, 12),
                              recordHashPrefix: String(j0.preparedSchema2RecordHash).slice(0, 12),
                              mid: j0.preparedCanonicalMid, build: j0.build } };
      if (g.error)
        return recoResult(RECONCILE.REFUSED_READ_UNAVAILABLE,
          Object.assign(base, { server: { error: g.error, status: g.status || null,
                                          errorCode: g.errorCode || null } }));
      var st = classify(g);
      base.server = { state: st, rev: g.rev == null ? null : g.rev, serverHash: g.serverHash || null,
                      authority: g.authority || null, schema: g.schema == null ? null : g.schema,
                      deleted: !!g.deleted };
      /* ---- SERVER 既に schema2 → putcanonical 0。journal も snapshot もそのまま。 ---- */
      if (st === STATE.CANONICAL_S2 && g.deleted !== true)
        return recoResult(RECONCILE.ALREADY_APPLIED_CANDIDATE,
          Object.assign(base, { completionRequired: true }));
      /* ---- SERVER canonical schema1 exact のときだけ resend 候補 ---- */
      if (st !== STATE.CANONICAL_S1 || g.deleted === true
          || g.rev !== j0.preparedServerRev || g.serverHash !== j0.preparedServerHash)
        return recoResult(RECONCILE.REFUSED_SERVER_STATE_MISMATCH,
          Object.assign(base, { expected: { state: STATE.CANONICAL_S1, rev: j0.preparedServerRev,
                                            hashPrefix: String(j0.preparedServerHash).slice(0, 12) } }));
      /* ---- current local から record を build し直して prepared hash と exact 一致するか ---- */
      return buildSchema2WithHash(sid, mkCtx({}).deps).then(function(b){
        if (b.error)
          return recoResult(RECONCILE.REFUSED_BUILD_FAILED, Object.assign(base, { detail: b }));
        if (b.recordHash !== j0.preparedSchema2RecordHash)
          return recoResult(RECONCILE.REFUSED_PREPARED_RECORD_HASH_MISMATCH,
            Object.assign(base, { preparedPrefix: String(j0.preparedSchema2RecordHash).slice(0, 12),
                                  freshPrefix: String(b.recordHash).slice(0, 12) }));
        var G = gws();
        if (!G || typeof G.runMaterializationAmbiguousCommitReconcile !== 'function')
          return recoResult(RECONCILE.REFUSED_NO_RECONCILE_PATH, base);
        var F = f697();
        if (!F || typeof F.putCanonicalOnce !== 'function')
          return recoResult(RECONCILE.REFUSED_NO_PUTCANONICAL_PATH, base);
        /* ★★server write は専用 GWS entry の中だけ。isolationExempt は渡さない。 */
        return G.runMaterializationAmbiguousCommitReconcile(function(){
          /* (a) server write 直前に journal identity を再確認 */
          var j1 = journal();
          if (!j1 || j1.__corrupt || commitIntentIdentity(j1) !== id0)
            return recoResult(RECONCILE.REFUSED_JOURNAL_CHANGED_DURING_RECONCILE,
              Object.assign(base, { detail: { after: j1 ? 'changed' : 'absent' } }));
          /* (b) exact resend。payload はすべて journal binding 由来。exactly 1 回。 */
          var req = { storyId: sid, expectedRev: j1.preparedServerRev,
                      expectedHash: j1.preparedServerHash, mid: j1.preparedCanonicalMid,
                      record: b.record, build: j1.build };
          return stepCanonicalWrite(req).then(function(w){
            var sent = { status: w ? (w.status || null) : null,
                         errorCode: (w && w.j) ? (w.j.errorCode || null) : null };
            base.sent = sent;
            /* ★fix697 逐語: 下の code はすべて postSaveOnce の fetch より **前**で返る
               ＝ request は 1 バイトも出ていない。ここだけは serverWriteAttempted:false が真実。
               （NETWORK_FAILED は fetch 後なので含めない。） */
            if (w && w.err && PRESEND_ERRORS[w.err] === true)
              return recoResult(RECONCILE.REFUSED_NOT_SENT,
                Object.assign(base, { detail: { errorCode: w.err } }));
            /* ★★ここから先は「送信済みかもしれない」。2 回目送信は禁止。 */
            if (w && w.err === 'NETWORK_FAILED')
              return recoAfterWrite(j1, RECONCILE.HOLD_RECONCILE_WRITE_UNKNOWN, 'UNKNOWN',
                Object.assign(base, { detail: { reason: 'NETWORK_FAILURE_AFTER_SEND' } }));
            if (sent.errorCode === 'idem-processing')
              return recoAfterWrite(j1, RECONCILE.HOLD_IDEM_PROCESSING, 'UNKNOWN',
                Object.assign(base, { detail: { reason: 'SERVER_IDEM_PROCESSING', retry: false } }));
            /* ★応答が何であっても fresh V2 read を **1 回だけ**。 */
            return freshGetStory(sid).then(function(g3){
              if (g3.error)
                return recoAfterWrite(j1, RECONCILE.HOLD_POST_WRITE_READ_FAILED, 'UNKNOWN',
                  Object.assign(base, { server3: { error: g3.error, status: g3.status || null,
                                                   errorCode: g3.errorCode || null } }));
              var s3 = classify(g3);
              base.server3 = { state: s3, rev: g3.rev == null ? null : g3.rev,
                               serverHash: g3.serverHash || null, deleted: !!g3.deleted };
              if (s3 === STATE.CANONICAL_S2 && g3.deleted !== true)
                /* ★journal keep / snapshot keep / epoch bump 0 / journal clear 0 /
                   completeAppliedRecovery の自動 call 0。 */
                return recoAfterWrite(j1, RECONCILE.RECONCILED_APPLIED_CANDIDATE, 'APPLIED',
                  Object.assign(base, { code: RECONCILE.RECONCILED_APPLIED_CANDIDATE }));
              if (w && w.ok === false)
                return recoAfterWrite(j1, RECONCILE.HOLD_RECONCILE_REFUSED, 'NOT_OBSERVED',
                  Object.assign(base, { detail: { reason: 'WRITE_REFUSED_AND_NOT_SCHEMA2' } }));
              return recoAfterWrite(j1, RECONCILE.HOLD_NOT_OBSERVED, 'NOT_OBSERVED', base);
            });
          });
        }).then(function(x){
          if (!x || x.ran !== true)
            return recoResult(RECONCILE.REFUSED_RECONCILE_LOCK_HOLD,
              Object.assign(base, { detail: { reason: x && x.reason, policy: x && x.policy,
                                              isolation: x && x.isolation,
                                              active: x && x.active,
                                              reloadRequired: !!(x && x.reloadRequired) } }));
          return x.result;
        });
      });
    });
  }

  /* resume: 自動では絶対に走らない。明示呼び出しのみ。
     journal の phase は「どちらの段だったか」のヒントに過ぎず、
     続きの判断は必ず fresh getstory の結果から行う（prepare / commit と同一経路）。 */
  function resume(storyId){
    var j = journal();
    if (!j) return Promise.resolve(refuse('NO_JOURNAL'));
    if (j.__corrupt) return Promise.resolve(refuse('JOURNAL_CORRUPT', j));
    if (j.storyId !== storyId) return Promise.resolve(refuse('JOURNAL_STORY_MISMATCH',
                                                             { journal: j.storyId, target: storyId }));
    if (j.phase === PHASE.READY_FOR_SCHEMA2 || j.phase === PHASE.COMMITTING_SCHEMA2)
      return commitSchema2(storyId, {});
    return prepare(storyId, {});
  }

  window.__v292Dfix750 = {
    BUILD: BUILD, WIRED: false, ENABLED_BY_DEFAULT: false,
    JOURNAL_KEY: JOURNAL_KEY, PHASE: PHASE, STATE: STATE,
    off: off, on: on,
    classify: classify,
    prepare: prepare,
    commitSchema2: commitSchema2,
    resume: resume,
    /* ★裁定37: crash/reload 後の read-only 分類。server write 0 / storage write 0 / auto-* 0。 */
    RECOVERY: RECOVERY, recoveryStatus: recoveryStatus,
    /* ★裁定39: applied 済み journal だけを解消する狭い正式経路。自動実行 0 / server write 0。 */
    RELEASE: RELEASE, completeAppliedRecovery: completeAppliedRecovery,
    /* ★裁定43: ambiguous COMMITTING を元と同一の 1 発として明示 reconcile する狭い正式経路。
       journal clear / epoch bump / snapshot 削除は一切しない（local release は別 API）。 */
    RECONCILE: RECONCILE, reconcileAmbiguousCommit: reconcileAmbiguousCommit,
    canonicalMid: canonicalMid,
    journal: journal,
    journalClear: journalClear,
    status: function(){
      return { build: BUILD, on: on(), off: off(),
               documentStoryKey: docStoryKey(), documentStory: docStoryId(),
               journal: journal(),
               deps: { f697: !!f697(), f702: !!f702(), f743: !!f743(),
                       f564: !!f564(), gws: !!gws() },
               log: LOG.slice(-10) };
    }
  };
  try { console.log(TAG, 'loaded (prepare/commit separated / default OFF / on=v292Dfix750On)'); } catch(e){}
})();
