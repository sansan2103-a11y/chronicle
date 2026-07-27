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
                tombstonePayloadFilterUnavailable: 0 };
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
      if (lsg(it.key) == null){ deleted.push(it.key); continue; }
      var r = null;
      try {
        r = d.gate.tryDeleteExact({
          key: it.key, expectedBytes: it.bytes, expectedHash: it.hash,
          intent: 'lifecycle-delete', path: 'fix587',
          reason: 'story-delete plan=' + plan.planId
        });
      } catch(e){ r = null; }
      if (r && r.ok && r.deleted && lsg(it.key) == null){ deleted.push(it.key); stats.physicalDeleted++; }
      else { refused.push({ key: it.key, code: (r && r.code) || 'gate-unavailable' }); stats.gateRefused++; }
    }
    return { deleted: deleted, refused: refused };
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
    if (!a.some(function(x){ return x.planId === plan.planId; })) a.push(plan);
    writePending(a); stats.pending = a.length;
  }
  function dropPending(planId){
    var a = readPending().filter(function(x){ return x.planId !== planId; });
    writePending(a); stats.pending = a.length;
  }

  /* ---- ⑥⑦⑧ 墓標をクラウドへ確定 → 物理削除（2つの入口で共有する） -------- */
  function finish(plan, d, snapshotId){
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
      /* ★fix588(GPT裁定D-5): 物理削除の解禁条件に「fix562分類器が利用可能」を入れる。
         分類器が居ないと、墓標スロットの本体・サイドストアを payload から除外できず、
         「ローカルからは消したのに、送信物には残っている」状態を作りうる。
         通常同期は fail-open でよいが、**削除後の物理GCは必ず fail-closed**。 */
      if (!(d.inv && typeof d.inv.classifyKey === 'function')){
        stats.classifierUnavailable++;
        addPending(plan);
        note({ act:'pending', slotId:slotId, deleteOpId:deleteOpId,
               why:'分類器(fix562.classifyKey)が使えないので物理削除しない' });
        return { ok:true, code:'pending-classifier', deleteOpId:deleteOpId, snapshotId:snapshotId, hidden:true };
      }
      /* ⑦⑧ */
      var r = executePlan(plan, d);
      if (r.refused.length){
        addPending(plan);
        note({ act:'partial', slotId:slotId, deleteOpId:deleteOpId, deleted:r.deleted.length,
               refused:r.refused });
        return { ok:true, code:'partial', deleteOpId:deleteOpId, snapshotId:snapshotId,
                 deleted:r.deleted.length, refused:r.refused };
      }
      /* 保留に載っていたときだけ外す（載っていないのに書くと、無意味な localStorage 書込みになる） */
      if (readPending().some(function(p){ return p && p.planId === plan.planId; })) dropPending(plan.planId);
      stats.completed++;
      note({ act:'completed', slotId:slotId, deleteOpId:deleteOpId, deleted:r.deleted.length });
      return { ok:true, code:'deleted', deleteOpId:deleteOpId, snapshotId:snapshotId, deleted:r.deleted.length };
    });
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

    /* ⑥tombstone をクラウドへ確定させてから、はじめて物理削除する */
    return finish(plan, d, snap.id);
  }

  /* ---- 保留分の続き（再接続後に呼ぶ） ------------------------------------ */
  function resumePending(){
    var d = dep();
    if (off() || missingDeps(d).length) return Promise.resolve({ ok:false, code:'not-ready' });
    var list = readPending();
    if (!list.length) return Promise.resolve({ ok:true, code:'nothing', done:0 });
    return pushTombstone(d).then(function(pushed){
      /* ★fix589: 'still-offline' は誤解を招く名前だった（実際の原因は空ガードでもオフラインと表示された）。
         コード名を実態に合わせ、**理由を必ず返す**。 */
      if (!pushed) return { ok:false, code:'push-failed', why: lastPushWhy, pending:list.length };
      var done = 0;
      list.forEach(function(plan){
        var r = executePlan(plan, d);
        if (!r.refused.length){ dropPending(plan.planId); done++; stats.completed++;
          note({ act:'completed(resume)', slotId:plan.slotId, deleteOpId:plan.deleteOpId }); }
      });
      return { ok:true, code:'resumed', done: done, pending: readPending().length };
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
      if (!readPending().length) return;
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
    /* ★fix589: 「なぜクラウドへ確定できないのか」を実機で読めるようにする */
    lastPushWhy: function(){ return lastPushWhy; },
    shouldBlockRestore: shouldBlockRestore,
    filterIncoming: filterIncoming,
    /* ★fix588(GPT裁定D-5): 送信側で分類器が居らず墓標スロットを除外できなかったことを記録する口。
       通常同期は fail-open で通すが、記録は必ず残す（物理削除の解禁条件に効く）。 */
    noteFilterUnavailable: function(){ stats.tombstonePayloadFilterUnavailable++; },
    /* ★fix562 の deletePolicy がこれを見て lifecycle-delete を解禁する */
    tombstoneBarrierReady: true,
    stats: function(){ return JSON.parse(JSON.stringify(stats)); },
    log: function(){ return LOG.slice(); },
    isOff: off,
    LIFECYCLE_VERSION: LIFECYCLE_VERSION
  };
})();
