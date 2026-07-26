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
  var stats = { requested: 0, completed: 0, pending: 0, refused: 0, physicalDeleted: 0, gateRefused: 0 };
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
  /* 戻り: Promise<boolean>。true = クラウドへ反映できた */
  function pushTombstone(d){
    return new Promise(function(res){
      try {
        if (!d.sync || typeof d.sync.push !== 'function'){ res(false); return; }
        var p = d.sync.push();
        if (!p || typeof p.then !== 'function'){ res(false); return; }
        p.then(function(){ res(true); }, function(){ res(false); });
      } catch(e){ res(false); }
    });
  }

  /* ---- ⑦⑧ 物理削除（必ずゲート経由） ------------------------------------ */
  function executePlan(plan, d){
    var deleted = [], refused = [];
    for (var i = 0; i < plan.keys.length; i++){
      var it = plan.keys[i];
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

    /* ③スナップショット作成（＝復元セット。新しい退避方式は作らない） */
    var now = Date.now();
    var snap = null;
    try { snap = d.snap.create(slotId, { now: now }); } catch(e){ snap = { ok:false, error:String(e && e.message) }; }
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
    var deleteOpId = 'del_' + slotId + '_' + now;
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
    return pushTombstone(d).then(function(pushed){
      if (!pushed){
        /* オフライン/push失敗: 一覧からは消えるが、実データは**まだ消さない**。
           クラウドへ削除が伝わらない状態で実データを消すと、次のpullで復活して
           「消したのに戻る」を作るため。再接続後に resumePending() が続きをやる。 */
        addPending(plan);
        note({ act:'pending', slotId:slotId, deleteOpId:deleteOpId,
               why:'クラウドへ墓標を反映できなかった。物理削除は保留' });
        return { ok:true, code:'pending-cloud', deleteOpId:deleteOpId, snapshotId:snap.id, hidden:true };
      }
      /* ⑦⑧ */
      var r = executePlan(plan, d);
      if (r.refused.length){
        addPending(plan);
        note({ act:'partial', slotId:slotId, deleteOpId:deleteOpId, deleted:r.deleted.length,
               refused:r.refused });
        return { ok:true, code:'partial', deleteOpId:deleteOpId, snapshotId:snap.id,
                 deleted:r.deleted.length, refused:r.refused };
      }
      stats.completed++;
      note({ act:'completed', slotId:slotId, deleteOpId:deleteOpId, deleted:r.deleted.length });
      return { ok:true, code:'deleted', deleteOpId:deleteOpId, snapshotId:snap.id, deleted:r.deleted.length };
    });
  }

  /* ---- 保留分の続き（再接続後に呼ぶ） ------------------------------------ */
  function resumePending(){
    var d = dep();
    if (off() || missingDeps(d).length) return Promise.resolve({ ok:false, code:'not-ready' });
    var list = readPending();
    if (!list.length) return Promise.resolve({ ok:true, code:'nothing', done:0 });
    return pushTombstone(d).then(function(pushed){
      if (!pushed) return { ok:false, code:'still-offline', pending:list.length };
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
  function autoResume(){
    try {
      if (off()) return;
      if (!readPending().length) return;
      var d = dep();
      if (!d.sync || typeof d.sync.push !== 'function') return;   /* home.html 側では何もしない */
      setTimeout(function(){
        try { resumePending().then(function(r){
          try { if (r && r.done) console.log(TAG, '保留していた削除を ' + r.done + '件 片づけました'); } catch(e){}
        }, function(){}); } catch(e){}
      }, 8000);
    } catch(e){}
  }
  try { autoResume(); } catch(e){}

  window.__chronicleStoryLifecycle = {
    __armed: true,
    requestDelete: requestDelete,
    resumePending: resumePending,
    pendingDeletes: readPending,
    shouldBlockRestore: shouldBlockRestore,
    filterIncoming: filterIncoming,
    /* ★fix562 の deletePolicy がこれを見て lifecycle-delete を解禁する */
    tombstoneBarrierReady: true,
    stats: function(){ return JSON.parse(JSON.stringify(stats)); },
    log: function(){ return LOG.slice(); },
    isOff: off,
    LIFECYCLE_VERSION: LIFECYCLE_VERSION
  };
})();
