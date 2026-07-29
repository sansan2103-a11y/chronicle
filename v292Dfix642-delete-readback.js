// =====================================================================
// Chronicle v292Dfix642: 削除の「read-back 次段」（操作専用・自動実行なし）
// ---------------------------------------------------------------------
// ■なぜ必要か（fix587 が明記した宿題）
//   v292Dfix587-story-lifecycle.js の continueExisting() にこう書いてある:
//     「照合は通った。だが**クラウドで墓標が確定しているかを推測してはいけない**。
//       ★read-back の口がまだ無い（fix399x に remote meta だけ読む APIが無い）ので、
//         この異常系では**物理削除しない**。
//       → read-back API を作った段（次段）で、ここを『新しい planId を発行して削除』へ格上げする。」
//   これがその次段。
//
// ■いま止まっているもの（2026-07-29 実機）
//   v292Dfix587_blocked に2件。どちらも blocked-stale-legacy。
//   ＝削除計画を作った後にスロットの中身が変わり、fix569 の exact 一致関門が
//     fail-closed で止めた（**正しい動作**。無理に消さなかった）。
//   停止の実体は v292Dfix587_refusals の code:'stale'（expectedBytes 12785 / actualBytes 18132 等）。
//
// ■read-back に何を使うか（Worker は1バイトも変えない）
//   Worker v26 の **op:'commitstate' + slotId**。読取専用で、canonical blob の
//   chr6_slots_meta から「そのslotIdの墓標」だけを {deleted, deleteOpId, ...} で返す。
//   ★op:'get' は使わない。canonical pkg 全体が返るうえ、その応答を applySave へ流す形が
//     既存コードにあるため、**読むだけのつもりが復活・上書きになる**事故経路が近い。
//
// ■このモジュールが絶対にやらないこと
//   ・自動実行（bootフック・タイマー・イベント購読）。人がコンソールから呼ぶときだけ動く
//   ・localStorage.removeItem の直接呼び出し（物理削除は必ず fix569 の DeleteGateway 経由）
//   ・op:'get' の応答を applySave へ流すこと（読み取りは meta 相当だけ）
//   ・自前で forceput / put を組み立てること（正本の上書きを patch が持たない）
//   ・deleteOpId の作り直し（クラウドの墓標と食い違うため。作り直すのは planId だけ）
//
// ■「消す前に必ず戻り道」
//   旧 recoverySnapshotId が実在しても、それだけを根拠に現在値を消さない。
//   stale＝**旧スナップショットの中身とこれから消すバイト列が違う**という状態なので、
//   旧セットだけでは追記分が戻せない（fix602 コメントの反例C）。
//   → **必ず現在値で撮り直し**、計画キーを全部被覆していることを確かめてから消す。
//     旧スナップショットは消さない（priorRecoverySnapshotId として残す）。
//
// 冪等: window.__v292Dfix642 / OFF: localStorage.v292Dfix642Off='1'
// 使い方（home.html のコンソール）:
//   __v292Dfix642.status()
//   __v292Dfix642.readbackTombstone('smrnoszes2j').then(console.log)
//   __v292Dfix642.previewPlan('smrnoszes2j')
//   __v292Dfix642.resumeBlocked('smrnoszes2j', { confirmStale:true }).then(console.log)
// =====================================================================
(function v292Dfix642(){
  'use strict';
  if (window.__v292Dfix642) return;
  var TAG = '[v292Dfix642:delete-readback]';
  var VERSION = 1;
  var DEFAULT_PROXY = 'https://novel-proxy.sansan2103.workers.dev';
  var READBACK_TIMEOUT_MS = 20000;

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function lss(k, v){ try { localStorage.setItem(k, String(v)); return true; } catch(e){ return false; } }
  function off(){ try { return lsg('v292Dfix642Off') === '1'; } catch(e){ return false; } }
  function nowMs(){ try { return Date.now(); } catch(e){ return 0; } }

  /* 記録はメモリを正本にする（容量満杯でも理由が消えないように・fix575/587と同じ型） */
  var LOG = [], LOG_MAX = 30;
  function note(rec){ try { rec.at = nowMs(); LOG.push(rec); if (LOG.length > LOG_MAX) LOG.shift(); } catch(e){} }

  /* read-back の結果キャッシュ（メモリのみ・status() から読む） */
  var readbackCache = {};

  /* =====================================================================
   * 依存（どれか欠けたら何もしない = fail-closed）
   * ===================================================================== */
  function dep(){
    var d = {};
    try { d.snap = window.__v292Dfix564; } catch(e){}
    try { d.gate = window.__v292Dfix569; } catch(e){}
    try { d.inv  = window.__v292Dfix562; } catch(e){}
    try { d.life = window.__chronicleStoryLifecycle; } catch(e){}
    try { d.sync = window.__v292Dfix399x; } catch(e){}
    return d;
  }
  function missingDeps(d){
    var m = [];
    if (!d.snap || typeof d.snap.create !== 'function' || typeof d.snap.verify !== 'function') m.push('fix564(スナップショット)');
    if (!d.gate || typeof d.gate.tryDeleteExact !== 'function') m.push('fix569(削除ゲート)');
    if (!d.inv  || typeof d.inv.sideStoreKeys !== 'function') m.push('fix562(分類器)');
    /* ★fix588(GPT裁定D-5): 物理削除の解禁条件に「分類器が使える」が入っている。
       通常同期は fail-open でよいが、**削除後の物理GCは必ず fail-closed**。 */
    if (!d.inv  || typeof d.inv.classifyKey !== 'function') m.push('fix562.classifyKey');
    if (!d.life || typeof d.life.blockedDeletes !== 'function') m.push('fix587(削除サービス)');
    return m;
  }

  /* =====================================================================
   * meta / 墓標 / 停止中の計画
   * ===================================================================== */
  function readMeta(){
    try { var a = JSON.parse(lsg('chr6_slots_meta') || '[]'); return Array.isArray(a) ? a : []; }
    catch(e){ return []; }
  }
  function tombstoneOf(slotId){
    var meta = readMeta();
    for (var i = 0; i < meta.length; i++){
      var e = meta[i];
      if (e && e.deleted === true && String(e.id) === String(slotId)) return e;
    }
    return null;
  }
  var BLOCKED_KEY = 'v292Dfix587_blocked';
  function readBlocked(){
    try { var a = JSON.parse(lsg(BLOCKED_KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch(e){ return []; }
  }
  function blockedOf(slotId){
    return readBlocked().filter(function(x){
      return x && String(x.slotId) === String(slotId) && !x.superseded;
    });
  }
  /* ★旧レコードは**消さない**。superseded を付けて履歴に残す（何を後継にしたか追えるように）。 */
  function markSuperseded(slotId, newPlanId){
    var a = readBlocked(), marked = [];
    for (var i = 0; i < a.length; i++){
      var x = a[i];
      if (!x || String(x.slotId) !== String(slotId) || x.superseded) continue;
      x.superseded = String(newPlanId);
      x.supersededAt = nowMs();
      marked.push(x.planId);
    }
    if (marked.length) lss(BLOCKED_KEY, JSON.stringify(a));
    return marked;
  }

  /* =====================================================================
   * 計画キー（fix587 の planKeys と同じ作り方・同じ形式）
   * ===================================================================== */
  function hashOf(d, s){
    try { return (d.inv && typeof d.inv._hash === 'function') ? d.inv._hash(s) : null; }
    catch(e){ return null; }
  }
  function planKeys(slotId, d){
    var body = 'chr6_slot_' + slotId;
    var keys = [body];
    try {
      (d.inv.sideStoreKeys(slotId) || []).forEach(function(k){ if (keys.indexOf(k) < 0) keys.push(k); });
    } catch(e){}
    var out = [];
    keys.forEach(function(k){
      var v = lsg(k);
      if (v == null) return;                 /* 無いものは計画に載せない */
      out.push({ key: k, bytes: v.length, hash: hashOf(d, v) });
    });
    return out;
  }

  /* =====================================================================
   * ① read-back（Worker v26 の op:'commitstate' + slotId・読取専用）
   * ===================================================================== */
  function proxyUrl(){
    var u = String(lsg('v292ProxyUrl') || '').trim();
    return (u || DEFAULT_PROXY).replace(/\/+$/, '');
  }
  /* home.html の authHeaders と同じ規則。
     ★fix601: Google の exp は**秒**、Date.now() は**ミリ秒**。桁を間違えると常に期限切れ扱いになる。 */
  function authHeaders(){
    var h = { 'Content-Type': 'application/json' };
    var p = String(lsg('v292ProxyPass') || '').trim();
    if (p) h['x-chronicle-pass'] = p;
    var t = null;
    try { t = JSON.parse(lsg('v292GoogleToken') || 'null'); } catch(e){ t = null; }
    if (t && t.token && (!t.exp || (t.exp * 1000) > (nowMs() + 30000))) h['x-google-id'] = t.token;
    return h;
  }
  function loggedIn(){ var h = authHeaders(); return !!(h['x-google-id'] || h['x-chronicle-pass']); }

  function callRead(body, ms){
    return new Promise(function(res, rej){
      var ctrl = null, timer = null;
      try { if (typeof AbortController !== 'undefined') ctrl = new AbortController(); } catch(e){}
      var o = { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) };
      if (ctrl){
        o.signal = ctrl.signal;
        try { timer = setTimeout(function(){ try { ctrl.abort(); } catch(e){} }, ms || READBACK_TIMEOUT_MS); } catch(e){}
      }
      var p;
      try { p = fetch(proxyUrl() + '/save', o); } catch(e){ rej(e); return; }
      Promise.resolve(p).then(function(r){
        try { if (timer) clearTimeout(timer); } catch(e){}
        var st = (r && typeof r.status === 'number') ? r.status : ((r && r.ok) ? 200 : 0);
        return Promise.resolve(r.json()).then(function(j){ res({ status: st, json: j }); });
      }, function(e){
        try { if (timer) clearTimeout(timer); } catch(e2){}
        rej(e);
      });
    });
  }

  function finishReadback(slotId, r){
    r.slotId = String(slotId);
    r.at = nowMs();
    readbackCache[String(slotId)] = r;
    note({ act: 'readback', slotId: String(slotId), code: r.code, ok: !!r.ok });
    return r;
  }

  /* 戻り: Promise<{ok, code, slotId, remote, expectedDeleteOpId, at, hint?}>
     ★ok:true は「クラウドの正本に、この削除操作の墓標が確定している」ときだけ。 */
  function readbackTombstone(slotId, cb){
    var done = function(r){ try { if (typeof cb === 'function') cb(r); } catch(e){} return r; };
    if (off()) return Promise.resolve(done(finishReadback(slotId, { ok:false, code:'service-off' })));
    var sid = String(slotId == null ? '' : slotId);
    if (!sid || sid === 'chr6' || sid === 'default')
      return Promise.resolve(done(finishReadback(sid, { ok:false, code:'not-deletable' })));
    if (!loggedIn())
      return Promise.resolve(done(finishReadback(sid, { ok:false, code:'not-logged-in',
        hint:'ログインしていないためクラウドを読み戻せません。ゲーム画面からログインしてください。' })));

    var tomb = tombstoneOf(sid);
    var expected = (tomb && tomb.deleteOpId) ? String(tomb.deleteOpId) : null;

    return callRead({ op: 'commitstate', slotId: sid }, READBACK_TIMEOUT_MS).then(function(r){
      var j = r && r.json;
      if (r.status === 501 || (j && j.errorCode === 'unsupported'))
        return done(finishReadback(sid, { ok:false, code:'readback-unsupported', http:r.status,
          hint:'このアカウントのサーバ側にD1が無く、墓標を読み戻せません。' }));
      if (r.status !== 200 || !j || j.ok !== true)
        return done(finishReadback(sid, { ok:false, code:'readback-failed', http:r.status,
          error: (j && (j.error || j.errorCode)) || null }));

      var out = { rev: (j.rev == null ? null : j.rev), exists: (j.exists === true),
                  packageHash: j.packageHash || null, serverTs: j.serverTs || null,
                  tombstone: (j.tombstone == null ? null : j.tombstone) };
      if (j.exists === false)
        return done(finishReadback(sid, { ok:false, code:'remote-empty', remote:out,
          expectedDeleteOpId: expected,
          hint:'クラウドにこの端末の正本がまだありません。ホームの「☁ いま上げる」を先に実行してください。' }));
      if (!out.tombstone)
        return done(finishReadback(sid, { ok:false, code:'remote-tombstone-missing', remote:out,
          expectedDeleteOpId: expected,
          hint:'クラウドの正本にこの物語の墓標がありません。ホームの「☁ いま上げる」か、ゲーム画面を一度開いて同期してください。' }));
      if (out.tombstone.deleted !== true)
        return done(finishReadback(sid, { ok:false, code:'remote-alive', remote:out,
          expectedDeleteOpId: expected,
          hint:'クラウドではこの物語が「生きている」状態です。別の端末で復元された可能性があるため、削除しません。' }));
      if (expected && String(out.tombstone.deleteOpId || '') !== expected)
        return done(finishReadback(sid, { ok:false, code:'remote-deleteopid-mismatch', remote:out,
          expectedDeleteOpId: expected,
          hint:'クラウドの墓標は別の削除操作のものです。この計画の根拠にはできません。' }));
      if (!expected)
        return done(finishReadback(sid, { ok:false, code:'no-delete-op-id', remote:out,
          hint:'この端末の墓標に deleteOpId がありません（malformed）。削除を再開しません。' }));

      return done(finishReadback(sid, { ok:true, code:'confirmed', remote:out, expectedDeleteOpId: expected }));
    }, function(e){
      return done(finishReadback(sid, { ok:false, code:'readback-failed',
        error: String((e && e.message) || e).slice(0, 80) }));
    });
  }

  /* =====================================================================
   * ② 墓標の再push（fix587 の pushTombstone 相当）
   * ★home.html には fix399 が無い。居ないときは**自前で送らない**。
   *   patch モジュールが正本の上書き(forceput)を持つのは、削除事故の作り方そのもの。
   * ===================================================================== */
  function pushTombstone(d){
    return new Promise(function(res){
      try {
        if (!d.sync || typeof d.sync.push !== 'function'){
          res({ ok:false, code:'push-unavailable',
                hint:'このページにはクラウド送信(fix399)がありません。ホームの「☁ いま上げる」を押すか、ゲーム画面を一度開いてください。' });
          return;
        }
        var p = d.sync.push();
        if (!p || typeof p.then !== 'function'){ res({ ok:false, code:'push-not-promise' }); return; }
        p.then(function(){ res({ ok:true, code:'pushed' }); },
               function(e){ res({ ok:false, code:'push-failed', error: String((e && e.message) || e).slice(0, 60) }); });
      } catch(e){ res({ ok:false, code:'push-failed', error: String((e && e.message) || e).slice(0, 60) }); }
    });
  }

  /* =====================================================================
   * ③ 復元セット（★必ず現在値で撮り直す。旧セットは消さない）
   * ===================================================================== */
  /* fix564 と同じレイアウトで自前に書く（本体キーが既に無く fix564.create が断る場合だけ）。
     新形式は作らない ＝ fix564.verify / restore / remove がそのまま使える。 */
  function fallbackSnapshot(slotId, ts, reason, keys, d){
    var MPRE = (d.snap && d.snap.MPRE) || 'chr6_snap_';
    var DPRE = (d.snap && d.snap.DPRE) || 'chr6_snapd_';
    var id = MPRE + slotId + '_' + ts;
    if (lsg(id) != null) return { ok:false, error:'同じIDのスナップショットが既にあります: ' + id };
    var written = [], parts = {}, total = 0, failed = null;
    for (var i = 0; i < keys.length; i++){
      var liveKey = keys[i].key, val = lsg(liveKey);
      if (val == null){ failed = { at: liveKey, error: '実体が消えました' }; break; }
      var dataKey = DPRE + slotId + '_' + ts + '_' + i;
      if (!lss(dataKey, val)){ failed = { at: liveKey, error: '書けません（容量不足）' }; break; }
      written.push({ key: dataKey, bytes: val.length, hash: hashOf(d, val) });
      var back = lsg(dataKey);
      if (back == null || back.length !== val.length || hashOf(d, back) !== hashOf(d, val)){
        failed = { at: liveKey, error: '読み戻しが一致しません' }; break;
      }
      parts[liveKey] = { liveKey: liveKey, snapKey: dataKey, hash: hashOf(d, val), bytes: val.length,
                         role: (liveKey === 'chr6_slot_' + slotId) ? 'story' : 'sideStore' };
      total += val.length;
    }
    if (failed){
      /* fail-closed。後始末も**ゲート経由**で行う（自前 removeItem を呼ばない）。 */
      var orphan = [];
      written.forEach(function(w){
        var r = null;
        try { r = d.gate.tryDeleteExact({ key:w.key, expectedBytes:w.bytes, expectedHash:w.hash,
                                          intent:'lifecycle-delete', path:'fix642',
                                          reason:'fix642 fallback-snapshot rollback' }); } catch(e){}
        if (!(r && r.ok)) orphan.push(w.key);
      });
      return { ok:false, error: failed.error, at: failed.at, orphanParts: orphan };
    }
    var manifest = { version: 1, id: id, slotId: slotId, createdAt: ts, reason: String(reason),
                     kind: 'user', protectedReason: null, complete: true, turns: null,
                     partCount: Object.keys(parts).length, totalBytes: total, parts: parts };
    if (!lss(id, JSON.stringify(manifest))) return { ok:false, error:'manifestを書けませんでした' };
    var chk = null; try { chk = JSON.parse(lsg(id) || 'null'); } catch(e){}
    if (!chk || chk.partCount !== manifest.partCount) return { ok:false, error:'manifestの読み戻しが一致しません' };
    return { ok:true, id: id, parts: manifest.partCount, bytes: total, fallback: true };
  }

  /* 復元セットを用意し、**計画キーを全部被覆している**ことを確かめる。
     被覆確認までやって初めて「消す前に必ず戻り道がある」と言える。 */
  function ensureRecovery(slotId, deleteOpId, tomb, keys, ts, d){
    var prior = (tomb && tomb.recoverySnapshotId) ? String(tomb.recoverySnapshotId) : null;
    var priorOk = false;
    if (prior){ try { var pv = d.snap.verify(prior); priorOk = !!(pv && pv.ok); } catch(e){ priorOk = false; } }

    var reason = 'lifecycle-delete:' + deleteOpId;   /* ★fix587.checkResumable が要求する形 */
    var snap = null;
    try { snap = d.snap.create(slotId, { now: ts, reason: reason }); }
    catch(e){ snap = { ok:false, error: String((e && e.message) || e) }; }
    if (!snap || !snap.ok){
      /* 本体キーが無いと fix564 は断る。その場合だけ同レイアウトで自前に撮る。 */
      var hasBody = lsg('chr6_slot_' + slotId) != null;
      if (!hasBody) snap = fallbackSnapshot(slotId, ts, reason, keys, d);
    }
    if (!snap || !snap.ok)
      return { ok:false, code:'snapshot-failed', error: (snap && snap.error) || '?',
               priorRecoverySnapshotId: prior, priorSnapshotVerified: priorOk };

    var ver = null;
    try { ver = d.snap.verify(snap.id); } catch(e){ ver = null; }
    if (!ver || !ver.ok)
      return { ok:false, code:'snapshot-unverified', snapshotId: snap.id, detail: ver,
               priorRecoverySnapshotId: prior, priorSnapshotVerified: priorOk };

    /* ★被覆確認: これから消す exact なバイト列が、復元セットに入っているか */
    var man = null; try { man = JSON.parse(lsg(snap.id) || 'null'); } catch(e){ man = null; }
    var missing = [];
    if (!man || !man.parts) missing = keys.map(function(k){ return k.key; });
    else keys.forEach(function(k){
      var p = man.parts[k.key];
      if (!p || p.bytes !== k.bytes || String(p.hash) !== String(k.hash)) missing.push(k.key);
    });
    if (missing.length)
      return { ok:false, code:'snapshot-incomplete', snapshotId: snap.id, missing: missing,
               priorRecoverySnapshotId: prior, priorSnapshotVerified: priorOk };

    return { ok:true, snapshotId: snap.id, parts: (man && man.partCount) || keys.length,
             fallback: !!snap.fallback,
             priorRecoverySnapshotId: prior, priorSnapshotVerified: priorOk };
  }

  /* =====================================================================
   * ④ 物理削除（必ず DeleteGateway 経由。自前 removeItem を呼ばない）
   * ===================================================================== */
  function executePlan(plan, d){
    var deleted = [], refused = [], alreadyMissing = [];
    for (var i = 0; i < plan.keys.length; i++){
      var it = plan.keys[i];
      /* fix594 と同じ: もう無いキーは成功扱い。ただし「物理削除した」とは別に数える(fix595)。 */
      if (lsg(it.key) == null){ deleted.push(it.key); alreadyMissing.push(it.key); continue; }
      var r = null;
      try {
        r = d.gate.tryDeleteExact({
          key: it.key, expectedBytes: it.bytes, expectedHash: it.hash,
          intent: 'lifecycle-delete', path: 'fix642',
          deleteOpId: plan.deleteOpId,
          reason: 'story-delete-resume plan=' + plan.planId
        });
      } catch(e){ r = null; }
      if (r && r.ok && r.deleted && lsg(it.key) == null){ deleted.push(it.key); }
      else {
        var nowVal = lsg(it.key);
        refused.push({ key: it.key, code: (r && r.code) || 'gate-unavailable',
                       expectedBytes: it.bytes, actualBytes: (nowVal == null ? null : nowVal.length),
                       expectedHash: it.hash || null,
                       actualHash: (nowVal != null) ? hashOf(d, nowVal) : null });
      }
    }
    return { deleted: deleted, refused: refused, alreadyMissing: alreadyMissing };
  }

  /* =====================================================================
   * ⑤ 実行結果の履歴（メモリ＋小さなring・生の値は残さない）
   * ===================================================================== */
  var RUNS_KEY = 'v292Dfix642_runs', RUNS_MAX = 10;
  function readRuns(){
    try { var a = JSON.parse(lsg(RUNS_KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch(e){ return []; }
  }
  function noteRun(rec){
    try { var a = readRuns(); rec.at = nowMs(); a.push(rec); lss(RUNS_KEY, JSON.stringify(a.slice(-RUNS_MAX))); }
    catch(e){}
  }

  /* =====================================================================
   * ⑥ 事前確認（read-back の前に、書き込みゼロで判定できるものを全部見る）
   * ===================================================================== */
  function precheck(slotId, opts, d){
    var sid = String(slotId == null ? '' : slotId);
    if (off()) return { code:'service-off' };
    if (!opts || opts.confirmStale !== true)
      return { code:'need-confirm',
               hint:'内容が更新された（stale）計画を作り直します。resumeBlocked(slotId, {confirmStale:true}) で明示してください。' };
    if (!sid || sid === 'chr6' || sid === 'default') return { code:'not-deletable' };
    var miss = missingDeps(d);
    if (miss.length) return { code:'missing-deps', missing: miss };
    try { if (typeof d.life.isOff === 'function' && d.life.isOff()) return { code:'lifecycle-off' }; } catch(e){}
    var blocked = blockedOf(sid);
    if (!blocked.length)
      return { code:'not-blocked',
               hint:'この物語は停止中の削除計画(v292Dfix587_blocked)に載っていません。対象外です。' };
    var tomb = tombstoneOf(sid);
    if (!tomb) return { code:'no-tombstone' };
    var deleteOpId = tomb.deleteOpId ? String(tomb.deleteOpId) : '';
    if (!deleteOpId) return { code:'no-delete-op-id' };
    if (tomb.restoreOfDeleteOpId && String(tomb.restoreOfDeleteOpId) === deleteOpId)
      return { code:'restored', hint:'この削除は正式に復元済みです。再開しません。' };
    return { ok:true, slotId: sid, tomb: tomb, deleteOpId: deleteOpId, blocked: blocked };
  }

  /* =====================================================================
   * ⑦ 本体: 停止中の計画を、新しい planId で作り直して完遂する
   * ===================================================================== */
  function resumeBlocked(slotId, opts, cb){
    if (typeof opts === 'function'){ cb = opts; opts = null; }
    var done = function(r){
      try { if (typeof cb === 'function') cb(r); } catch(e){}
      note({ act:'resume', slotId: String(slotId), code: r && r.code, ok: !!(r && r.ok) });
      return r;
    };
    var d = dep();
    var pre = precheck(slotId, opts, d);
    if (!pre.ok){ pre.ok = false; pre.slotId = String(slotId); return Promise.resolve(done(pre)); }

    var sid = pre.slotId, tomb = pre.tomb, deleteOpId = pre.deleteOpId;

    /* (c) クラウドの墓標を read-back で確認する。推測しない。 */
    return readbackTombstone(sid).then(function(r1){
      if (r1.ok) return { readback: r1, push: null, retried: false };
      /* 未確定 → 墓標を再push → 再read-back */
      return pushTombstone(d).then(function(pr){
        if (!pr.ok) return { readback: r1, push: pr, retried: false };
        return readbackTombstone(sid).then(function(r2){
          return { readback: r2, first: r1, push: pr, retried: true };
        });
      });
    }).then(function(rb){
      if (!rb.readback.ok){
        return done({ ok:false, code:'cloud-tombstone-unconfirmed', slotId: sid, deleteOpId: deleteOpId,
                      readback: rb.readback, retriedAfterPush: !!rb.retried, push: rb.push || null,
                      hint: rb.readback.hint || (rb.push && rb.push.hint) ||
                            'クラウドの墓標を確認できないため、物理削除は行いませんでした（データはそのままです）。' });
      }

      var ts = nowMs();

      /* (d) ★消す前に必ず戻り道。現在値で撮り直し、計画キーの被覆まで確かめる。 */
      var keysForSnap = planKeys(sid, d);
      if (!keysForSnap.length)
        return done({ ok:true, code:'already-deleted', slotId: sid, deleteOpId: deleteOpId,
                      deleted: 0, readback: rb.readback });
      var rec = ensureRecovery(sid, deleteOpId, tomb, keysForSnap, ts, d);
      if (!rec.ok){
        rec.ok = false; rec.slotId = sid; rec.deleteOpId = deleteOpId; rec.readback = rb.readback;
        rec.hint = '復元セット（戻り道）を用意できなかったので、1バイトも消していません。';
        noteRun({ slotId: sid, deleteOpId: deleteOpId, code: rec.code, deleted: 0 });
        return done(rec);
      }

      /* (e) 新しい planId。★deleteOpId は作り直さない（クラウドの墓標と食い違うため）。
             keys は**撮り直した後に取り直す**。スナップショットとズレていれば下の被覆確認で落ちる。 */
      var keys = planKeys(sid, d);
      var man = null; try { man = JSON.parse(lsg(rec.snapshotId) || 'null'); } catch(e){ man = null; }
      var drift = [];
      keys.forEach(function(k){
        var p = man && man.parts && man.parts[k.key];
        if (!p || p.bytes !== k.bytes || String(p.hash) !== String(k.hash)) drift.push(k.key);
      });
      if (drift.length){
        var dr = { ok:false, code:'snapshot-incomplete', slotId: sid, deleteOpId: deleteOpId,
                   snapshotId: rec.snapshotId, missing: drift, readback: rb.readback,
                   hint:'復元セットを作った直後に内容が変わりました。安全のため消していません。' };
        noteRun({ slotId: sid, deleteOpId: deleteOpId, code: dr.code, deleted: 0 });
        return done(dr);
      }

      var plan = {
        planId: 'plan_' + deleteOpId + '_r' + ts,
        deleteOpId: deleteOpId,
        slotId: sid,
        snapshotId: rec.snapshotId,
        createdAt: ts,
        lifecycleVersion: (d.life && d.life.LIFECYCLE_VERSION) || 1,
        keys: keys,
        source: 'fix642:resume',
        /* fix642 の追加分（fix587 の読み手は無視できる） */
        supersedesPlanId: (pre.blocked[0] && pre.blocked[0].planId) || null,
        priorRecoverySnapshotId: rec.priorRecoverySnapshotId || null,
        priorSnapshotVerified: !!rec.priorSnapshotVerified
      };

      /* (f) 削除は必ず DeleteGateway 経由 */
      var ex = executePlan(plan, d);

      /* (g) 履歴。旧レコードは消さず superseded を付ける（完遂したときだけ） */
      var superseded = [];
      if (!ex.refused.length) superseded = markSuperseded(sid, plan.planId);

      var out = {
        ok: true,
        code: ex.refused.length ? 'partial' : 'deleted',
        slotId: sid, deleteOpId: deleteOpId, planId: plan.planId,
        snapshotId: plan.snapshotId,
        priorRecoverySnapshotId: plan.priorRecoverySnapshotId,
        priorSnapshotVerified: plan.priorSnapshotVerified,
        recoveryFallback: !!rec.fallback,
        planned: plan.keys.length,
        deleted: ex.deleted.length,
        physicallyDeleted: ex.deleted.length - ex.alreadyMissing.length,
        alreadyMissing: ex.alreadyMissing.length,
        deletedKeys: ex.deleted,
        refused: ex.refused,
        supersededPlanIds: superseded,
        readback: rb.readback
      };
      noteRun({ slotId: sid, deleteOpId: deleteOpId, planId: plan.planId, code: out.code,
                planned: out.planned, deleted: out.deleted, refused: ex.refused.length,
                snapshotId: plan.snapshotId, priorSnapshotId: plan.priorRecoverySnapshotId });
      try {
        console.log(TAG, out.code, sid, '計画' + out.planned + '件 / 消した' + out.deleted + '件'
                  + ' / 拒否' + ex.refused.length + '件 / 復元セット=' + plan.snapshotId);
      } catch(e){}
      return done(out);
    });
  }

  /* =====================================================================
   * ⑧ 読むだけの口
   * ===================================================================== */
  /* 実行前に「何を消すつもりか」を見る。★1バイトも書かない・通信もしない。 */
  function previewPlan(slotId){
    var d = dep(), sid = String(slotId == null ? '' : slotId);
    if (off()) return { ok:false, code:'service-off' };
    var miss = missingDeps(d);
    if (miss.length) return { ok:false, code:'missing-deps', missing: miss };
    if (!sid || sid === 'chr6' || sid === 'default') return { ok:false, code:'not-deletable' };
    var tomb = tombstoneOf(sid);
    var keys = planKeys(sid, d);
    var prior = (tomb && tomb.recoverySnapshotId) ? String(tomb.recoverySnapshotId) : null;
    var priorOk = null;
    if (prior){ try { var v = d.snap.verify(prior); priorOk = !!(v && v.ok); } catch(e){ priorOk = false; } }
    return { ok:true, slotId: sid,
             hasTombstone: !!tomb, deleteOpId: (tomb && tomb.deleteOpId) || null,
             blocked: blockedOf(sid).map(function(b){
               return { planId: b.planId, blockedReason: b.blockedReason, at: b.at }; }),
             keys: keys, totalBytes: keys.reduce(function(a, b){ return a + b.bytes; }, 0),
             priorRecoverySnapshotId: prior, priorSnapshotVerified: priorOk,
             lastReadback: readbackCache[sid] || null };
  }

  function status(){
    var d = dep();
    var blocked = readBlocked().map(function(b){
      return { planId: b.planId, slotId: b.slotId, deleteOpId: b.deleteOpId, at: b.at,
               blockedReason: b.blockedReason, attempts: b.attempts,
               keys: (b.keys || []).length,
               superseded: b.superseded || null, supersededAt: b.supersededAt || null,
               readback: readbackCache[String(b.slotId)] || null,
               tombstonePresent: !!tombstoneOf(b.slotId),
               remainingKeys: (missingDeps(d).length ? null : planKeys(String(b.slotId), d).length) };
    });
    return {
      version: VERSION, off: off(), loggedIn: loggedIn(), proxy: proxyUrl(),
      missingDeps: missingDeps(d),
      pushAvailable: !!(d.sync && typeof d.sync.push === 'function'),
      blocked: blocked,
      readbackCache: JSON.parse(JSON.stringify(readbackCache)),
      runs: readRuns(),
      log: LOG.slice()
    };
  }

  window.__v292Dfix642 = {
    __armed: true,
    VERSION: VERSION,
    isOff: off,
    readbackTombstone: readbackTombstone,
    resumeBlocked: resumeBlocked,
    status: status,
    previewPlan: previewPlan,
    /* 実機で理由を読むための口（どれも読むだけ） */
    log: function(){ return LOG.slice(); },
    runs: readRuns,
    /* テスト専用の内部露出（本番コードからは使わない） */
    _planKeys: function(slotId){ return planKeys(String(slotId), dep()); },
    _precheck: function(slotId, opts){ return precheck(slotId, opts, dep()); },
    _pushTombstone: function(){ return pushTombstone(dep()); },
    _blockedOf: blockedOf
  };
  try { if (!off()) console.log(TAG, 'ready (操作専用・自動実行なし)'); } catch(e){}
})();
