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
//     fix697 putStoryOnce         … op:'putstory' 固定の狭い write 口
//     fix697 putCanonicalOnce     … op:'putcanonical' 固定の狭い write 口
//                                   （fix750 で record.schema===2 のときだけ
//                                     clientCanonicalSchemaMax:2 を whitelist に追加）
//     fix697 projectionOf         … read-only の正規 schema1 projection builder
//     fix697 canonicalString      … 既存 stableStringify（binding hash 用。新 serializer を作らない）
//     fix702 promoteForC1Materialization … fresh getstory → strict CAS → fresh readback
//     fix743 buildSchema2Record   … schema2 record builder（title 正本は meta.name）
//     fix745 GWS runTurnMutation  … chronicle:cc2:materialization:v1 で直列化
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

  /* ---------------- fresh getstory（既存 shadowRequest 経路のみ） ---------------- */
  function freshGetStory(storyId){
    return new Promise(function(resolve){
      var F = f697();
      if (!F || typeof F.shadowRequest !== 'function')
        return resolve({ error: 'NO_READ_PATH' });
      /* ★★裁定34 待ち BLOCKER5（FIX697_CALLBACK_ARG_ORDER）:
         fix697 の callback は **cb(result, errorCode)**（node 慣例の (err, result) ではない）。
         逐語: postSaveOnce は成功時 cb({status,j}, null) / 失敗時 cb(null, 'NETWORK_FAILED')。
         ★fix702 の post() は逆に cb(err, result) なので、両者を取り違えないこと。
         旧実装は (err, result) と解釈していたため、成功応答が err 扱いになり
         prepare が必ず READ_FAILED_AT_START で write0 になっていた（live で実測）。 */
      F.shadowRequest({ op: 'getstory', id: storyId }, function(r, errCode){
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
                  deleted: !!j.deleted, schema: schema, title: rec ? rec.title : null });
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
  function stepCanonicalWrite(storyId, ctx, fresh, record){
    return new Promise(function(resolve){
      var F = f697();
      if (!F || typeof F.putCanonicalOnce !== 'function') return resolve(refuse('NO_PUTCANONICAL_PATH'));
      /* ★expectedRev / expectedHash は **直前の fresh readback 値のみ**。
         journal の値は「prepared 値と一致するか」の検査にだけ使い、expected には fresh を渡す。 */
      var mid = 'f750:canon:' + storyId + ':' + fresh.rev + ':' + fresh.serverHash;
      /* ★fix697 契約: cb(result, errorCode) */
      F.putCanonicalOnce({ id: storyId, expectedRev: fresh.rev, expectedHash: fresh.serverHash,
                           record: record, mid: mid, clientMeta: { build: BUILD } },
        function(r, errCode){
          resolve({ err: errCode || null, status: r ? r.status : null, j: r ? r.j : null,
                    builtTitle: record.title });
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
    if (!G || typeof G.runTurnMutation !== 'function') return refuse('REFUSED_NO_GWS');
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
  /* GWS 直列化（既存 lock 名のみ・新規 lock を作らない） */
  function inLock(fn){
    var G = gws();
    return G.runTurnMutation(function(){
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
        j.phase = PHASE.READY_FOR_SCHEMA2;
        j.preparedServerRev = g.rev;
        j.preparedServerHash = g.serverHash;
        j.preparedSchema2RecordHash = b.recordHash;
        j.preparedAt = Date.now();
        if (!journalSet(j)) return refuse('JOURNAL_WRITE_FAILED');
        var ready = { ok: true, ran: true, wrote: steps.length, mutated: steps.length > 0,
                      code: 'READY_FOR_SCHEMA2', state: state, steps: steps, server: g,
                      snapshotId: ctx.snapshotId,
                      prepared: { rev: g.rev, hash: g.serverHash, recordHash: b.recordHash } };
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
    if (j0.preparedServerRev == null || !j0.preparedServerHash || !j0.preparedSchema2RecordHash)
      return Promise.resolve(refuse('REFUSED_INCOMPLETE_BINDING', {
        rev: j0.preparedServerRev, hash: !!j0.preparedServerHash, recordHash: !!j0.preparedSchema2RecordHash }));
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
        j.phase = PHASE.COMMITTING_SCHEMA2; j.committingAt = Date.now(); journalSet(j);
        var steps = [];
        return stepCanonicalWrite(storyId, ctx, g, b.record).then(function(w){
          if (w && w.ok === false) return holdWith(j, 'CANONICAL_WRITE_REFUSED', w, steps, ctx);
          return freshGetStory(storyId).then(function(g3){
            if (g3.error) return holdWith(j, 'READ_FAILED_AFTER_CANONICAL_WRITE', g3, steps, ctx);
            var s3 = classify(g3);
            steps.push({ step: 'CANONICAL_WRITE', status: w.status || null, observedAfter: s3 });
            if (s3 !== STATE.CANONICAL_S2)
              /* ★blind retry 禁止。schema1 canonical のままなら明示 resume を要求して HOLD。 */
              return holdWith(j, 'CANONICAL_WRITE_DID_NOT_TAKE_EFFECT',
                              { resp: (w && w.j) ? { errorCode: w.j.errorCode, status: w.status } : { status: w.status },
                                server: g3 }, steps, ctx);
            if (w.builtTitle != null && g3.title != null && g3.title !== w.builtTitle)
              return holdWith(j, 'TITLE_MISMATCH_AFTER_WRITE',
                              { sent: w.builtTitle, server: g3.title }, steps, ctx);
            j.phase = PHASE.COMPLETE; j.lastVerifiedAuthority = 'canonical'; j.lastVerifiedSchema = 2;
            j.lastVerifiedRev = g3.rev; j.lastVerifiedHash = g3.serverHash; journalSet(j);
            journalClear();
            var done = { ok: true, ran: true, wrote: 1, mutated: true, code: 'MATERIALIZED',
                         state: s3, steps: steps, server: g3, snapshotId: ctx.snapshotId };
            note(done); return done;
          });
        });
      });
    });
  }

  /* HOLD: journal を残し、自動 rollback も自動 retry もしない */
  function holdWith(j, code, detail, steps, ctx){
    j.hold = code; j.holdAt = Date.now();
    journalSet(j);
    var h = { ok: false, ran: true, wrote: 0, mutated: false, code: 'HOLD', hold: code,
              detail: detail, steps: steps, journalRetained: true, snapshotId: ctx.snapshotId };
    note(h); return Promise.resolve(h);
  }
  /* commit の precondition 不成立（★server へ 1 バイトも送っていない）*/
  function holdSync(j, code, detail, ctx){
    j.hold = code; j.holdAt = Date.now();
    journalSet(j);
    var h = { ok: false, ran: true, wrote: 0, mutated: false, code: 'HOLD', hold: code,
              detail: detail, steps: [], journalRetained: true, snapshotId: ctx.snapshotId };
    note(h); return h;
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
