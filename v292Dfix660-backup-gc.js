// =====================================================================
// Chronicle TRPG - v292Dfix660 (B): BackupGC — 削除候補を「選ぶ」層
// ---------------------------------------------------------------------
// 出典: 裁定統合_GPT_第0段中央GC_2026-07-26.md（I0/I2/I3/I10/I12/I13/I14）
//
// ■責務は1つ:「**何を消してよいかを選ぶ**」。物理削除は一切しない(DeleteGateway の仕事)。
//   分類・保護判定は fix562 を**唯一の正**として使う(二重実装しない)。
//
// ■iPhone で実際に起きたこと(2026-08-02)
//   使用2632KB/565キーで QuotaExceededError。home の pull が 96ターンのスロット本体
//   (約400KB)だけを**静かに書けず**、取り込みが成立していないのに「取り込みました」と表示されていた。
//   → (a) 書込失敗を無言にしない (b) quota のとき1論理単位だけ解放して**その1キーを1回だけ再試行**
//      (c) 自動で消せない分は「容量を空ける」画面で**利用者が明示承認して**解放する。
//   実データでは 597KB の唯一の fullDump が最大の占有者で、これは自動では絶対に消さない。
//   つまり (c) が恒久解の要で、(b) は取りこぼしを減らすための補助。
//
// ■I0 削除意図の分類
//   reclaim(容量回収) / retention(世代整理) / lifecycle(スロット削除・同期) /
//   rollback(自分が作った未完成データの取消し) / cache(再生成可能) / それ以外は unknown → review-only
//
// ■I3 守るのは「控え1件」ではなく**復元能力**
//   スロット毎に最良の復元点を最低1件保持する。優先順位:
//     verified complete snapshot ＞ verified fullDump ＞ story-only backup
//   story-only しか無いスロットは保護しつつ degradedProtection:true を記録する。
//
// ■I10 候補は「キー」ではなく**論理削除単位**
//   fix564 のスナップショットは manifest + 複数の chr6_snapd_* で一組。
//   解放は「全パーツ再検証 → manifest を先に削除 → 実体キー」の順(DeleteGateway が担保)。
//
// ■I12/I13/I14 緊急経路
//   reclaimUrgent は **走査ゼロ**(平時に計算した候補配列だけを見る)・
//   最大3候補を O(1) 再確認・削除は**最大1論理単位**・localStorage へ書かない・
//   成功判定は「失敗した元の setItem を**1回だけ**再試行して成功したこと」。
//   全候補が stale なら false(=fail-closed)。そこで重い再走査は始めない。
//
// OFF  = localStorage['v292Dfix660Off']='1'(DeleteGateway と共通) … plan/reclaim は何もしない
// 読出 = window.__v292Dfix660gc.status() / .plan() / .candidates() / .reviewCandidates() / .selfTest()
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix660gc) return;
  var TAG = '[v292Dfix660:backup-gc]';
  var MAX_PLAN = 24;          /* 平時に事前計算する候補の上限 */
  var URGENT_PROBE = 3;       /* I13: 緊急時に O(1) 再確認する候補数(実測で調整する) */

  var INTENTS = { reclaim:1, retention:1, lifecycle:1, rollback:1, cache:1 };
  function classifyIntent(intent){
    var i = String(intent || '');
    return INTENTS[i] ? i : 'unknown';       /* I0: 分類できない要求は unknown → review-only */
  }

  function gw(){ try { return window.__v292Dfix660gw; } catch(e){ return null; } }
  function inv(){ try { return window.__v292Dfix562; } catch(e){ return null; } }
  function off(){ try { return localStorage.getItem('v292Dfix660Off') === '1'; } catch(e){ return false; } }
  function rawGet(k){ var G = gw(); if (G) return G._rawGet(k); try { return localStorage.getItem(k); } catch(e){ return null; } }
  function rawKeys(){ var G = gw(); if (G) return G._rawKeys();
    var out = []; try { for (var i = 0; i < localStorage.length; i++){ var k = localStorage.key(i); if (k != null) out.push(k); } } catch(e){}
    return out; }
  function hashOf(v){ var G = gw(); if (G) return G._hash(v); return String(v == null ? 0 : String(v).length); }

  /* =====================================================================
     使用量(走査するので平時のみ呼ぶ)
     ===================================================================== */
  function usage(){
    var bytes = 0, count = 0, byFamily = {};
    try {
      var ks = rawKeys(), I = inv();
      count = ks.length;
      for (var i = 0; i < ks.length; i++){
        var v = rawGet(ks[i]);
        var b = (ks[i].length + (v == null ? 0 : v.length));
        bytes += b;
        var fam = 'unknown';
        try { if (I && I.classifyKey) fam = I.classifyKey(ks[i], v).family || 'unknown'; } catch(e){}
        byFamily[fam] = (byFamily[fam] || 0) + b;
      }
    } catch(e){}
    return { bytes: bytes, kb: Math.round(bytes / 1024), keys: count, byFamily: byFamily };
  }

  /* =====================================================================
     I3: スロット毎の復元能力
     ===================================================================== */
  function restoreCapability(){
    var out = {}, I = inv();
    if (!I || typeof I.protectedSet !== 'function') return out;
    var ps = null; try { ps = I.protectedSet(); } catch(e){ ps = null; }
    if (!ps) return out;
    Object.keys(ps).forEach(function(sid){
      var p = ps[sid] || {};
      var tier = (p.kind === 'snapshot') ? 'snapshot'
               : (sid === '(fullDump)' ? 'fullDump' : (p.complete ? 'fullDump' : 'story-only'));
      out[sid] = { key: p.key, bytes: p.bytes || 0, tier: tier, turns: p.turns || 0,
                   reason: p.reason || null,
                   /* story-only しか無いスロットは保護するが「弱い保護」として必ず記録する */
                   degradedProtection: (tier === 'story-only') };
    });
    return out;
  }

  /* =====================================================================
     論理削除単位の組み立て(I10)
     ===================================================================== */
  function snapshotUnits(){
    var units = [], manifests = {};
    try {
      rawKeys().forEach(function(k){
        if (k.indexOf('chr6_snap_') !== 0) return;
        var m = null; try { m = JSON.parse(rawGet(k) || 'null'); } catch(e){ m = null; }
        if (!m) return;
        manifests[k] = m;
      });
    } catch(e){}
    Object.keys(manifests).forEach(function(k){
      var m = manifests[k], keys = [k], bytes = (rawGet(k) || '').length + k.length;
      var missing = 0;
      Object.keys(m.parts || {}).forEach(function(lk){
        var sk = m.parts[lk].snapKey, v = rawGet(sk);
        if (v == null){ missing++; return; }
        keys.push(sk); bytes += v.length + sk.length;
      });
      units.push({ unitId: 'snapshot:' + k, kind: m.kind || 'user', slotId: m.slotId || null,
                   keys: keys, totalBytes: bytes, complete: !!m.complete && missing === 0,
                   createdAt: m.createdAt || 0, family: 'story-snapshot' });
    });
    return units;
  }
  /* manifest に属さない chr6_snapd_* = 作成途中 or 失敗した試行の孤児(裁定 シナリオ3)。
     ★自動削除しない。review-only にして、利用者の明示承認でだけ解放する。 */
  function orphanSnapd(){
    var owned = {};
    snapshotUnits().forEach(function(u){ u.keys.forEach(function(k){ owned[k] = 1; }); });
    var out = [];
    rawKeys().forEach(function(k){
      if (k.indexOf('chr6_snapd_') !== 0 || owned[k]) return;
      var v = rawGet(k);
      out.push({ key: k, bytes: (v == null ? 0 : v.length) + k.length });
    });
    return out;
  }

  /* =====================================================================
     plan(): 平時に削除候補を事前計算してメモリへ置く
     ★fix562.dryRun() の順位付けを唯一の正として使う(二重実装しない)。
     ===================================================================== */
  var PLAN = { planId: null, at: 0, units: [], protectedEpoch: null, reviewOnly: [], degraded: [] };
  function plan(opts){
    opts = opts || {};
    var out = { ok: false, planId: null, units: 0, reviewOnly: 0, why: null };
    try {
      if (off()){ out.why = 'off'; return out; }
      var I = inv();
      if (!I || typeof I.dryRun !== 'function'){ out.why = 'policy-unavailable'; return out; }
      var cap = restoreCapability();
      var protKeys = {};
      Object.keys(cap).forEach(function(sid){ if (cap[sid].key) protKeys[cap[sid].key] = cap[sid]; });

      var d = null;
      try { d = I.dryRun({ targetKB: (typeof opts.targetKB === 'number') ? opts.targetKB : 0 }); } catch(e){ d = null; }
      if (!d){ out.why = 'policy-unavailable'; return out; }

      var units = [], reviewOnly = [];
      /* ① 控え(chr6_bk_*) … 1キー=1論理単位 */
      (d.plan || []).forEach(function(c){
        if (protKeys[c.key]) return;                       /* 保護は候補にしない */
        var raw = rawGet(c.key);
        if (raw == null) return;
        var cls = null; try { cls = I.classifyKey(c.key, raw); } catch(e){ cls = null; }
        if (!cls){ return; }
        if (cls.protection === 'review'){ reviewOnly.push(reviewRow(c.key, raw, cls, '形式不明。自動では消しません')); return; }
        if (cls.protection === 'hard' || cls.protection === 'protected'){ reviewOnly.push(reviewRow(c.key, raw, cls, cls.why)); return; }
        units.push(mkUnit('backup:' + c.key, [{ key: c.key, raw: raw, cls: cls }], {
          rank: c.rank, why: c.why, intent: (c.rank === 4 || c.rank === 3) ? 'retention' : 'reclaim',
          slotId: cls.slotId, family: cls.family, createdAt: c.createdAt || 0
        }));
      });
      /* ②-a 保護されている控え(=dryRun が「消さない」と判断したもの)も**隠さず**一覧へ出す。
         iPhone の実データでは 597KB の唯一の fullDump が最大の占有者で、これは自動では
         絶対に消さない。だからこそ「見えない」ままにしてはいけない(利用者が判断できなくなる)。 */
      (d.protectedItems || []).forEach(function(k0){
        var raw = rawGet(k0.key);
        if (raw == null) return;
        var cls = null; try { cls = I.classifyKey(k0.key, raw); } catch(e){ cls = null; }
        if (!cls) return;
        reviewOnly.push(reviewRow(k0.key, raw, cls, k0.reason || cls.why));
      });
      /* ②-b スナップショット … I10 の論理単位。**自動候補にはしない**。
         fix562(唯一の正)は chr6_snap_/chr6_snapd_ を一律 protection:'protected' と分類しており、
         ここで「test-fixture だから reclaim してよい」と上書きすると分類を二重に持つことになる。
         → 一覧には論理単位として出し、解放は利用者の明示承認(user-approved)経路だけに限る。 */
      snapshotUnits().forEach(function(u){
        var isRestorePoint = false;
        Object.keys(cap).forEach(function(sid){ if (cap[sid].key === u.keys[0]) isRestorePoint = true; });
        reviewOnly.push({ unitId: u.unitId, key: u.keys[0], keys: u.keys.slice(), bytes: u.totalBytes,
                          family: 'story-snapshot', slotId: u.slotId, protection: 'protected',
                          tokens: snapshotTokens(u, I),
                          why: isRestorePoint ? 'このスロットの復元点。自動では消しません'
                             : (u.kind === 'test-fixture'
                                ? '回帰コーパスのスナップショット(ユーザデータより先に解放してよい層)。自動では消しません'
                                : '利用者のスナップショット。自動では消しません') });
      });
      /* ③ 作成途中/失敗した試行の snapd 孤児 … review-only(裁定 シナリオ3) */
      orphanSnapd().forEach(function(o){
        reviewOnly.push({ unitId: 'orphan-snapd:' + o.key, key: o.key, bytes: o.bytes,
                          family: 'story-snapshot', slotId: null,
                          why: '作成途中または失敗した試行の残骸。自動では消さず、確認のうえ解放します',
                          protection: 'review' });
      });

      units.sort(function(a, b){ return a.rank - b.rank || (a.createdAt || 0) - (b.createdAt || 0) || b.totalBytes - a.totalBytes; });
      PLAN = { planId: 'p' + Date.now(), at: Date.now(), units: units.slice(0, MAX_PLAN),
               protectedEpoch: epochOf(protKeys), reviewOnly: reviewOnly,
               degraded: Object.keys(cap).filter(function(sid){ return cap[sid].degradedProtection; }) };
      out.ok = true; out.planId = PLAN.planId; out.units = PLAN.units.length; out.reviewOnly = reviewOnly.length;
      return out;
    } catch(e){ out.why = String(e && e.message || e).slice(0, 80); return out; }
  }
  /* スナップショット論理単位の削除トークン(manifest 先行の順序は DeleteGateway が担保する) */
  function snapshotTokens(u, I){
    var G = gw(), out = [];
    u.keys.forEach(function(k){
      var raw = rawGet(k); if (raw == null) return;
      var cls = null; try { cls = I.classifyKey(k, raw); } catch(e){ cls = null; }
      if (!cls) return;
      out.push({ planId: null, unitId: u.unitId, key: k, hash: hashOf(raw), bytes: raw.length,
                 family: cls.family, slotId: cls.slotId, intent: 'user-approved',
                 policyVersion: (cls.policyVersion != null ? cls.policyVersion : (G ? G.POLICY_VERSION : 1)) });
    });
    return out;
  }
  function reviewRow(key, raw, cls, why){
    return { unitId: 'review:' + key, key: key, bytes: (raw == null ? 0 : raw.length) + key.length,
             family: cls.family, slotId: cls.slotId, why: why, protection: cls.protection };
  }
  function mkUnit(unitId, parts, meta){
    var G = gw();
    var total = 0, tokens = [];
    parts.forEach(function(p){
      var bytes = p.raw.length;
      total += bytes + p.key.length;
      tokens.push({ planId: null, unitId: unitId, key: p.key, hash: hashOf(p.raw), bytes: bytes,
                    family: p.cls.family, slotId: p.cls.slotId, intent: meta.intent,
                    policyVersion: (p.cls.policyVersion != null ? p.cls.policyVersion : (G ? G.POLICY_VERSION : 1)) });
    });
    return { unitId: unitId, rank: meta.rank == null ? 9 : meta.rank, why: meta.why || '',
             intent: meta.intent, slotId: meta.slotId || null, family: meta.family || null,
             createdAt: meta.createdAt || 0, totalBytes: total, tokens: tokens };
  }
  function epochOf(protKeys){
    var s = Object.keys(protKeys).sort().join('|');
    return hashOf(s);
  }

  /* =====================================================================
     reclaimUrgent(): quota の中から呼ばれる。走査ゼロ・最大1論理単位・LS書込なし。
     opts = { needBytes, reason, retry:function()->boolean }
       retry … 失敗した元の setItem を**1回だけ**やり直す関数(I14)。
               これが true を返したときだけ「容量回復に成功した」と判定する。
     ===================================================================== */
  var reclaiming = false;
  function reclaimUrgent(opts){
    opts = opts || {};
    var res = { ok: false, code: 'no-candidate', freedBytes: 0, unitId: null,
                probed: 0, staleAll: false, reason: opts.reason || null };
    if (off()){ res.code = 'off'; return res; }
    if (reclaiming){ res.code = 'reentrant'; return res; }   /* I12: 再入禁止 */
    reclaiming = true;
    try {
      var G = gw();
      if (!G){ res.code = 'gateway-unavailable'; return res; }
      var list = PLAN.units || [];
      if (!list.length){ res.code = 'no-plan'; res.staleAll = true; return res; }
      /* I13: 先頭から最大3候補だけ O(1) 再確認する。全走査はしない。 */
      var chosen = null;
      var n = Math.min(URGENT_PROBE, list.length);
      for (var i = 0; i < n; i++){
        res.probed++;
        if (unitStillValid(list[i])){ chosen = list[i]; break; }
      }
      if (!chosen){ res.code = 'all-stale'; res.staleAll = true; return res; }
      /* I12: 削除するのは**最大1論理単位** */
      var del = G.deleteUnit(chosen, { urgent: true });
      res.unitId = chosen.unitId;
      res.freedBytes = del.freedBytes || 0;
      /* 消したら候補配列から外す(次の要求で同じものを再試行しない) */
      PLAN.units = list.filter(function(u){ return u.unitId !== chosen.unitId; });
      if (!del.ok){ res.code = 'delete-failed:' + del.code; return res; }
      /* I14: 成功判定は「元の setItem を1回だけ再試行して通ったこと」 */
      if (typeof opts.retry === 'function'){
        var again = false;
        try { again = !!opts.retry(); } catch(e){ again = false; }
        res.retried = true; res.retrySucceeded = again;
        res.ok = again;
        res.code = again ? 'reclaimed' : 'still-quota';
        return res;
      }
      res.ok = true; res.code = 'deleted-no-retry-provided';
      return res;
    } catch(e){ res.code = 'error'; res.why = String(e && e.message || e).slice(0, 80); return res; }
    finally { reclaiming = false; }
  }
  /* O(1) 再確認: キーの実在・bytes・hash が候補作成時と同じか。走査しない。 */
  function unitStillValid(u){
    try {
      if (!u || !u.tokens || !u.tokens.length) return false;
      for (var i = 0; i < u.tokens.length; i++){
        var t = u.tokens[i], raw = rawGet(t.key);
        if (raw == null) return false;
        if (t.bytes != null && raw.length !== t.bytes) return false;
        if (t.hash != null && hashOf(raw) !== t.hash) return false;
      }
      return true;
    } catch(e){ return false; }
  }

  /* =====================================================================
     reviewCandidates(): 自動では消さないものの一覧(利用者に見せる)
     ===================================================================== */
  function reviewCandidates(){
    if (!PLAN.at) plan();
    var cap = restoreCapability();
    var soleFullDump = null;
    Object.keys(cap).forEach(function(sid){ if (sid === '(fullDump)') soleFullDump = cap[sid].key; });
    var rows = [];
    /* ① 自動で解放できる候補(そのまま出す。選べば即解放できる) */
    (PLAN.units || []).forEach(function(u){
      rows.push({ unitId: u.unitId, keys: u.tokens.map(function(t){ return t.key; }),
                  bytes: u.totalBytes, kb: Math.round(u.totalBytes / 1024),
                  family: u.family, slotId: u.slotId, createdAt: u.createdAt,
                  why: u.why, auto: true, protection: 'releasable', warning: null });
    });
    /* ② 自動では消さないもの(review-only / 保護)。明示承認があれば解放できるものだけ selectable。 */
    (PLAN.reviewOnly || []).forEach(function(r){
      var isSoleDump = (r.key === soleFullDump);
      rows.push({ unitId: r.unitId, keys: (r.keys && r.keys.length) ? r.keys.slice() : [r.key], bytes: r.bytes, kb: Math.round(r.bytes / 1024),
                  family: r.family, slotId: r.slotId, createdAt: null, why: r.why,
                  auto: false, protection: r.protection,
                  /* ★唯一の fullDump の解放には警告文を必須表示する(裁定 I3 の趣旨) */
                  warning: isSoleDump
                    ? '★これはサイドストア（状態・カルテ・ロスター・長期記憶）ごと復元できる唯一の控えです。解放すると、この端末から丸ごと復元する手段が失われます。'
                    : (r.protection === 'hard' ? '★生きている物語そのものです。ここからは解放できません。' : null),
                  selectable: r.protection !== 'hard' });
    });
    rows.sort(function(a, b){ return b.bytes - a.bytes; });
    return { planId: PLAN.planId, at: PLAN.at, rows: rows,
             degradedSlots: PLAN.degraded || [],
             usage: usage(),
             note: '★ここでは1バイトも消していません。選んで実行したものだけを、検証つきで解放します。' };
  }

  /* =====================================================================
     releaseApproved(): 利用者が画面で明示的に選んだものだけを解放する
     ★このコードベースで確立済みの例外「ユーザーの明示操作」。
       それでも hard は解放しない。唯一の fullDump は allowSoleRestorePoint の明示が要る。
     ===================================================================== */
  function releaseApproved(unitIds, opts){
    opts = opts || {};
    var res = { ok: false, released: [], skipped: [], freedBytes: 0 };
    try {
      if (off()){ res.code = 'off'; return res; }
      var G = gw();
      if (!G){ res.code = 'gateway-unavailable'; return res; }
      var want = {}; (unitIds || []).forEach(function(id){ want[id] = 1; });
      var I = inv();
      if (!I){ res.code = 'policy-unavailable'; return res; }

      /* ① 自動候補(PLAN.units)から */
      (PLAN.units || []).slice().forEach(function(u){
        if (!want[u.unitId]) return;
        var tokens = u.tokens.map(function(t){
          var t2 = {}; for (var p in t){ if (Object.prototype.hasOwnProperty.call(t, p)) t2[p] = t[p]; }
          t2.intent = 'user-approved';
          t2.allowSoleRestorePoint = !!opts.allowSoleRestorePoint;
          return t2;
        });
        var r = G.deleteUnit({ unitId: u.unitId, tokens: tokens });
        if (r.ok){ res.released.push(u.unitId); res.freedBytes += r.freedBytes || 0;
                   PLAN.units = PLAN.units.filter(function(x){ return x.unitId !== u.unitId; }); }
        else res.skipped.push({ unitId: u.unitId, code: r.code });
      });
      /* ② review-only から(明示承認が要るもの) */
      (PLAN.reviewOnly || []).slice().forEach(function(r0){
        if (!want[r0.unitId]) return;
        if (r0.protection === 'hard'){ res.skipped.push({ unitId: r0.unitId, code: 'hard-never-released' }); return; }
        var raw = rawGet(r0.key);
        if (raw == null){ res.skipped.push({ unitId: r0.unitId, code: 'missing' }); return; }
        var cls = null; try { cls = I.classifyKey(r0.key, raw); } catch(e){ cls = null; }
        if (!cls){ res.skipped.push({ unitId: r0.unitId, code: 'policy-unavailable' }); return; }
        /* ★論理単位(スナップショット)は必ず単位ごと・manifest 先行で消す(I10) */
        if (r0.tokens && r0.tokens.length){
          var toks = r0.tokens.map(function(t){
            var t2 = {}; for (var q in t){ if (Object.prototype.hasOwnProperty.call(t, q)) t2[q] = t[q]; }
            t2.intent = 'user-approved'; t2.allowSoleRestorePoint = !!opts.allowSoleRestorePoint; return t2;
          });
          var du = G.deleteUnit({ unitId: r0.unitId, tokens: toks });
          if (du.ok){ res.released.push(r0.unitId); res.freedBytes += du.freedBytes || 0;
                      PLAN.reviewOnly = PLAN.reviewOnly.filter(function(x){ return x.unitId !== r0.unitId; }); }
          else res.skipped.push({ unitId: r0.unitId, code: du.code });
          return;
        }
        var tok = { planId: PLAN.planId, unitId: r0.unitId, key: r0.key, hash: hashOf(raw), bytes: raw.length,
                    family: cls.family, slotId: cls.slotId, intent: 'user-approved',
                    policyVersion: (cls.policyVersion != null ? cls.policyVersion : G.POLICY_VERSION),
                    allowSoleRestorePoint: !!opts.allowSoleRestorePoint };
        var d = G.deleteExact(tok);
        if (d.ok){ res.released.push(r0.unitId); res.freedBytes += raw.length;
                   PLAN.reviewOnly = PLAN.reviewOnly.filter(function(x){ return x.unitId !== r0.unitId; }); }
        else res.skipped.push({ unitId: r0.unitId, code: d.code });
      });
      res.ok = res.released.length > 0;
      res.code = res.ok ? (res.skipped.length ? 'partial' : 'released') : 'nothing-released';
      try { G.persistLog(); } catch(e){}
      return res;
    } catch(e){ res.code = 'error'; res.why = String(e && e.message || e).slice(0, 80); return res; }
  }

  /* =====================================================================
     観測口 / 自己診断
     ===================================================================== */
  function status(){
    var u = usage();
    return { on: !off(), off: off(),
             usageKB: u.kb, usageBytes: u.bytes, keys: u.keys, byFamily: u.byFamily,
             planId: PLAN.planId, planAt: PLAN.at, candidates: (PLAN.units || []).length,
             reviewOnly: (PLAN.reviewOnly || []).length,
             degradedSlots: PLAN.degraded || [],
             urgentProbe: URGENT_PROBE, maxPlan: MAX_PLAN,
             gatewayAvailable: !!gw(), policyAvailable: !!(inv() && inv().dryRun) };
  }
  function selfTest(){
    var fails = [];
    function chk(name, cond, got){ if (!cond) fails.push({ name: name, got: got }); }
    chk('DeleteGateway が居る', !!gw());
    chk('分類器(fix562)が居る', !!(inv() && inv().classifyKey && inv().dryRun));
    chk('intent 分類: 既知5種はそのまま',
        ['reclaim','retention','lifecycle','rollback','cache'].every(function(i){ return classifyIntent(i) === i; }));
    chk('intent 分類: 未知は unknown(=review-only)',
        classifyIntent('whatever') === 'unknown' && classifyIntent() === 'unknown');
    var p = plan();
    chk('plan() が走る', p.ok === true || p.why === 'policy-unavailable' || p.why === 'off', p);
    /* 候補ゼロでも「走査ゼロ・削除ゼロ・false」で返ること(I13) */
    var saved = PLAN.units; PLAN.units = [];
    var r = reclaimUrgent({ needBytes: 1, reason: 'selftest' });
    PLAN.units = saved;
    chk('候補が無ければ削除0で false(fail-closed)', r.ok === false && r.freedBytes === 0, r);
    return { ok: fails.length === 0, fails: fails, status: status() };
  }

  window.__v292Dfix660gc = {
    __real: true,
    plan: plan,
    candidates: function(){ return (PLAN.units || []).map(function(u){
      return { unitId: u.unitId, keys: u.tokens.map(function(t){ return t.key; }), bytes: u.totalBytes, rank: u.rank, why: u.why }; }); },
    reclaimUrgent: reclaimUrgent,
    reviewCandidates: reviewCandidates,
    releaseApproved: releaseApproved,
    restoreCapability: restoreCapability,
    usage: usage,
    status: status,
    selfTest: selfTest,
    classifyIntent: classifyIntent,
    /* テスト用の内部露出 */
    _plan: function(){ return PLAN; }, _units: snapshotUnits, _orphanSnapd: orphanSnapd, _unitStillValid: unitStillValid
  };

  try { console.log(TAG, 'ready'); } catch(e){}
})();
