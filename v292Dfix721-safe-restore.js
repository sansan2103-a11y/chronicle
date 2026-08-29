// =====================================================================
// Chronicle v292Dfix721: SAFE FULL RESTORE（STEP4F / RULING30）— LOCAL ONLY (production HOLD)
// ---------------------------------------------------------------------
// fix291「まるごと読込」の内部を置換する安全なrestore transaction。
//   ・localStorage.clear() 禁止（管理対象keyの計画済み個別mutationのみ）
//   ・restore allowlist = default deny（UNKNOWN/control-plane/auth/flags/cloud cache = 復元しない）
//   ・import payload を authority にしない（rev/hash/authority/marker/owner/flag/pending 復元 0）
//   ・parse→validate→classify→plan→preflight(snapshot)→journal→sync apply→verify→reload
//   ・crash/quota → pre-restore rollback 一本（fix564 snapshot + journal 1キー）
//   ・次boot: PREPARED/APPLYING journal 検出 → engine より先に rollback recovery
//   ・cloud write 0（apply は同期1ブロック / IMPORT SUCCESS != CLOUD COMMIT）
// 検証口: window.__v292Dfix721 = { classifyForRestore, buildPlan, preflight, applyPlan,
//                                  recoverIfNeeded, importAll, journal, status, JOURNAL_KEY }
// OFF: v292Dfix721Off='1'（fix291旧経路には**戻らない**。importが安全に無効化されるだけ）
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix721) return;
  var TAG = '[v292Dfix721:safe-restore]';
  var BUILD = 'fix721.5';   /* STEP4G-A/B: + slotImportGuard + importMap（HOME adapter入口）
                               ★fix721.5(hotfix): SLOT_ISOLATED_BASE_KEY deny + plan全体HOLD
                                                  + SLOT_SIDECAR を境界一致へ根治 */
  var JOURNAL_KEY = 'v292Dfix721_txn';          // ★新規keyはこの1つだけ（RULING30許可枠）
  var VALUE_MAX = 1500000;                      // 1値上限（保守的）

  var rawGet = Storage.prototype.getItem.bind(localStorage);
  var rawSet = Storage.prototype.setItem.bind(localStorage);
  var rawDel = Storage.prototype.removeItem.bind(localStorage);
  var rawKey = Storage.prototype.key.bind(localStorage);

  function off(){ try { return rawGet('v292Dfix721Off') === '1'; } catch(e){ return false; } }
  function allKeys(){ var out = [], n = localStorage.length; for (var i = 0; i < n; i++){ var k = rawKey(i); if (k != null) out.push(k); } return out; }
  function fnv(s){ var h = 0x811c9dc5; for (var i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = (h + ((h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24))) >>> 0; } return h.toString(16) + '-' + s.length; }

  // ---- 分類（fix562の規約を再利用。restore専用のDENYを優先判定） ----
  var SLOT_RE = /^chr6_slot_([A-Za-z0-9]+)$/;
  var AI_RE = /^v292aiInstr(_slot_([A-Za-z0-9]+))?$/;
  var SHARED_ASSET_RE = /^(chrAiAv\d*:|v292av\d*_|v292avrec_|v292avatar)/;      // fix562と同一
  var DIAG_RE = /^(v292Dfix\d+_log|v292Dfix\d+_bkLog|v292Dfix\d+_dropped|__v346raw|v292Dfix573_log)/; // fix562と同一
  var TEST_FIXTURE_RE = /^(ab\d+p\d+[A-Za-z]?|chr6_gc_probe_|__v543|__v292probe)/;                    // fix562と同一
  var LITERALS = { 'undefined':1, 'null':1, 'setItem':1, 'getItem':1, 'removeItem':1, '[object Object]':1 };

  /* ★★★fix721.5(hotfix / PRODUCTION_RESTORE_INTEGRITY_DEFECT・GPT裁定 案(c))
   *
   * 【何が壊れていたか】
   *   旧 SLOT_SIDECAR 判定は `k.indexOf(storyIds[i]) >= 0` という **bare substring 包含**だった。
   *   slot id は1文字（'a'/'b'/'c'）なので、
   *       'v292Dfix77St(a)tes'.indexOf('a') === 12
   *   が成立し、**接尾辞なしの基底キーが「slot a の sidecar」として allow** されていた。
   *   allow された基底キーは applyPlan が `Storage.prototype.setItem.bind(localStorage)`
   *   （＝真の native）で書くため、fix246 の redirect wrapper を構造的に迂回する。
   *   結果:
   *     ・動作中のアプリは接尾辞つきを読むので **復元したのに状態が戻らない（silent omission）**
   *     ・基底キーが復活し、次 boot の fix246 が
   *       `else if (gv != null && _get(dst) != null){ _rem(base); }` ＝**コピーせず削除**へ入る
   *     ・fix246 ヘッダが「自動回復なし=主犯」と書くキーが失われ得る
   *
   * 【修正 A】slot-isolated 基底キーを明示的に危険 family として認識する。
   *   ただし **そのキーだけ skip して「復元成功」にしてはならない**（silent failure の温存）。
   *   危険基底キーを含む plan は **mutation 開始前に全体 HOLD**（write 0 / journal 0 / reload 0 /
   *   partial restore 0）。
   * 【修正 B】positive matcher を **family 単位の境界一致**へ根治。
   *   generic な文字包含も、根拠のない `_<id>` heuristic も作らない。
   *   production に実在する形式だけを列挙する（下記2表は実ソースの key 構築式から採取）。 */

  /* (A) 接尾辞なしのまま復元してはいけない基底キー。
   *     ・fix246 KEYS（redirect 管理下） … v292Dfix246-store-slot-isolation.js:44-51
   *     ・自己 suffix 系（'<base>' + slotSfx()） … fix307 / fix277 */
  var SLOT_ISOLATED_BASE = {
    'v292Dfix77States': 1, 'chr6_v292Dfix104_dlg': 1, 'chr6_v292Dfix135_sum': 1,
    'chr6_v292Dfix135_last': 1, 'chr6_v292Dfix136_wi': 1, 'chr6_v292Dfix137_ev': 1,
    'v292Dfix307Roster': 1, 'v292Dfix307Last': 1, 'v292Dfix277Quasi': 1
  };
  /* (B-1) '<base>_slot_<id>' 形式を採用している family */
  var SLOT_FAMILY_SLOTFORM = [
    'v292Dfix77States', 'v292Dfix307Roster', 'v292Dfix307Last', 'v292Dfix277Quasi',
    'chr6_v292Dfix104_dlg', 'chr6_v292Dfix135_sum', 'chr6_v292Dfix135_last',
    'chr6_v292Dfix136_wi', 'chr6_v292Dfix137_ev'
  ];
  /* (B-2) '<base>_<id>' 形式を採用している family（fix743 keysFor() と同一の構築式） */
  var SLOT_FAMILY_BAREFORM = [
    'chr6_relations', 'chr6_char_states', 'chr6_char_flags', 'chr6_pending_dice',
    'chr6_turn_summaries', 'chr6_chapter_titles', 'chr6_scene_breaks',
    'chr6_scene_summaries', 'v292cover_seed'
  ];
  var SLOT_ID_RE = /^[A-Za-z0-9]+$/;
  /* k が「既知 family の slot-scoped key」なら { base, id } を返す。それ以外は null。
     ★substring 包含は一切使わない。family prefix + 区切り + id の**構造一致**のみ。 */
  function slotScopedOf(k){
    var i, base, sep, id;
    for (i = 0; i < SLOT_FAMILY_SLOTFORM.length; i++){
      base = SLOT_FAMILY_SLOTFORM[i]; sep = base + '_slot_';
      if (k.length > sep.length && k.slice(0, sep.length) === sep){
        id = k.slice(sep.length);
        if (SLOT_ID_RE.test(id)) return { base: base, id: id, form: 'SLOT' };
      }
    }
    for (i = 0; i < SLOT_FAMILY_BAREFORM.length; i++){
      base = SLOT_FAMILY_BAREFORM[i]; sep = base + '_';
      if (k.length > sep.length && k.slice(0, sep.length) === sep){
        id = k.slice(sep.length);
        if (SLOT_ID_RE.test(id)) return { base: base, id: id, form: 'BARE' };
      }
    }
    return null;
  }
  /* story id の帰属判定（tombstone 照合用）。旧 `k.indexOf(id) >= 0` の置き換え。 */
  function storyIdOfKey(k){
    var m = SLOT_RE.exec(k); if (m) return m[1];
    var a = AI_RE.exec(k);   if (a) return a[2] || 'default';
    if (k === 'chr6') return 'default';
    var sc = slotScopedOf(k); if (sc) return sc.id;
    return null;
  }

  function denyFamily(k){
    if (LITERALS[k]) return 'LITERAL_KEY';
    /* ★fix721.5(hotfix): 接尾辞なし slot-isolated 基底キー。
       ここで deny するだけでは足りず、buildPlan が **plan 全体を HOLD** する（下記）。 */
    if (SLOT_ISOLATED_BASE[k]) return 'SLOT_ISOLATED_BASE_KEY';
    if (k === 'v292GoogleToken' || k === 'v292ProxyPass' || k === 'v292ProxyUrl') return 'AUTH_OR_OWNER_CONTROL';
    if (k === 'v292Dfix702_storyAuth' || k === 'v292Dfix402_storyRevs') return 'CLOUD_AUTHORITY_CACHE';
    if (/^v292Dfix\d+(On|Off)$/.test(k) || k === 'v292SaveExportOff') return 'FEATURE_FLAG';
    if (/^v292Dfix587_/.test(k)) return 'DELETE_TRANSACTION_STATE';
    if (/^chr6_snap_|^chr6_snapd_/.test(k)) return 'SNAPSHOT_RECOVERY';
    if (/^chr6_bk_/.test(k)) return 'HISTORICAL_BACKUP';
    if (/canary/i.test(k)) return 'CANARY_TEST_ASSET';
    if (k === 'chr6_active_slot' || k === 'chr6_epoch') return 'RUNTIME_CONTROL';
    if (k === JOURNAL_KEY) return 'RESTORE_TRANSACTION_STATE';
    if (DIAG_RE.test(k) || TEST_FIXTURE_RE.test(k)) return 'DIAGNOSTIC_OR_TEST';
    if (/^chr6_cleanup_log_|^chr6_broken_|^chr6_undo_/.test(k)) return 'HISTORICAL_DEBRIS';
    if (/^__/.test(k)) return 'INTERNAL_SCRATCH';
    return null;
  }
  /* storyIds = backupから復元対象になり得るstory id集合（canary除外済）で呼ぶ */
  function classifyForRestore(k, v, storyIds){
    var deny = denyFamily(k);
    if (deny) return { allow: false, family: deny };
    if (typeof v !== 'string') return { allow: false, family: 'NON_STRING_VALUE' };
    if (v.length > VALUE_MAX) return { allow: false, family: 'OVERSIZED_VALUE' };
    if (k === 'chr6') return { allow: true, family: 'STORY_DATA', slotId: 'default' };
    var m = SLOT_RE.exec(k);
    if (m) return /canary/i.test(m[1]) ? { allow: false, family: 'CANARY_TEST_ASSET' }
                                       : { allow: true, family: 'STORY_DATA', slotId: m[1] };
    var a = AI_RE.exec(k);
    if (a) return (a[2] && /canary/i.test(a[2])) ? { allow: false, family: 'CANARY_TEST_ASSET' }
                                                 : { allow: true, family: 'STORY_SIDECAR', slotId: a[2] || 'default' };
    if (SHARED_ASSET_RE.test(k)) return { allow: true, family: 'SHARED_ASSET' };
    if (k === 'chr6_slots_meta') return { allow: false, family: 'META_REBUILD' };   // copy禁止→rebuild
    /* ★fix721.5(hotfix): per-slot sidecar は **family 単位の境界一致**でのみ認める。
       旧実装の `k.indexOf(storyIds[i]) >= 0`（bare substring）は廃止。
       1文字 slot id ではキー本文中の偶然の a/b/c を slot 識別子と誤認するため。 */
    if (storyIds){
      var sc = slotScopedOf(k);
      if (sc && sc.id !== 'default'){
        for (var i = 0; i < storyIds.length; i++){
          if (storyIds[i] !== 'default' && storyIds[i] === sc.id)
            return { allow: true, family: 'SLOT_SIDECAR', slotId: sc.id };
        }
      }
    }
    return { allow: false, family: 'UNKNOWN' };
  }

  // ---- meta merge（RULING31 §5: CURRENT META + SANITIZED IMPORTED OVERLAY） ----
  //  ・current entryは全て保持（backupに無いstoryをmetaから消さない）
  //  ・current側がtombstone/control state（deleted/deleteOpId等）のentryはbackup liveで上書きしない（resurrection禁止）
  //  ・backup由来live entryは許可field（name/createdAt/updatedAt）だけをoverlay。新規はsanitized追加。
  var META_FIELDS = ['name', 'createdAt', 'updatedAt'];
  var META_CONTROL = ['deleted', 'deleteOpId', 'restoreOfDeleteOpId', 'recoverySnapshotId', 'deletedAt'];
  function hasControl(e){
    for (var i = 0; i < META_CONTROL.length; i++){ if (e && e[META_CONTROL[i]] !== undefined) return true; }
    return false;
  }
  function mergeMeta(currentRaw, backupRaw, storyIds){
    var cur = [];
    try { var p = JSON.parse(currentRaw || '[]'); if (Object.prototype.toString.call(p) === '[object Array]') cur = p; } catch(e){}
    var bk = [];
    try { var q = JSON.parse(backupRaw || '[]'); if (Object.prototype.toString.call(q) === '[object Array]') bk = q; } catch(e){}
    var out = cur.slice();                                        // ★current全保持（tombstone含む）
    var byId = {};
    out.forEach(function(e, i){ if (e && e.id != null) byId[String(e.id)] = i; });
    for (var i = 0; i < bk.length; i++){
      var e = bk[i];
      if (!e || typeof e !== 'object') continue;
      if (e.deleted === true) continue;                           // backup tombstoneは復元しない
      var id = String(e.id == null ? '' : e.id);
      if (!id || /canary/i.test(id)) continue;
      if (storyIds.indexOf(id) < 0) continue;                     // 本体が復元対象のentryのみ
      var idx = byId[id];
      if (idx !== undefined){
        var ce = out[idx];
        if (ce && (ce.deleted === true || hasControl(ce))) continue;   // ★current tombstone/control優先
        for (var j = 0; j < META_FIELDS.length; j++){ var f = META_FIELDS[j]; if (e[f] !== undefined) ce[f] = e[f]; }
      } else {
        var ne = { id: id };
        for (var k = 0; k < META_FIELDS.length; k++){ var f2 = META_FIELDS[k]; if (e[f2] !== undefined) ne[f2] = e[f2]; }
        if (ne.name == null) ne.name = '';
        out.push(ne); byId[id] = out.length - 1;
      }
    }
    return out;
  }
  // ---- journal（bounded metadata のみ。story本文・secret 0） ----
  function readJournal(){ try { var j = JSON.parse(rawGet(JOURNAL_KEY) || 'null'); return (j && typeof j === 'object') ? j : null; } catch(e){ return null; } }
  function writeJournal(j){ rawSet(JOURNAL_KEY, JSON.stringify(j)); }
  /* ★RULING31 §12 JOURNAL_DURABLE_BEFORE_MUTATION: 書込→読返し一致まで確認。失敗＝durableでない */
  function writeJournalDurable(j){
    var str = JSON.stringify(j);
    try { rawSet(JOURNAL_KEY, str); } catch(e){ return false; }
    return rawGet(JOURNAL_KEY) === str;
  }
  function clearJournal(){ try { rawDel(JOURNAL_KEY); } catch(e){} }

  // ---- plan ----
  function buildPlan(payload){
    var obj = payload || {};
    var data = (obj.data && typeof obj.data === 'object') ? obj.data : obj;
    if (!data || typeof data !== 'object' || Object.prototype.toString.call(data) === '[object Array]')
      return { ok: false, code: 'RESTORE_SCHEMA_INVALID' };
    var keys = Object.keys(data);
    if (!keys.length) return { ok: false, code: 'RESTORE_EMPTY' };
    /* storyIds: backup本体keyから導出（canary除外） */
    var storyIds = [];
    keys.forEach(function(k){
      if (typeof data[k] !== 'string') return;                     // 非string値はstory母集団にも入れない
      if (k === 'chr6') storyIds.push('default');
      var m = SLOT_RE.exec(k);
      if (m && !/canary/i.test(m[1])) storyIds.push(m[1]);
    });
    /* ★RULING31 §5/§17: current側がtombstone/control stateのstoryはrestore対象から除外
       （bodyの復元もしない = importによるlocal resurrection 0） */
    var tombIds = {};
    try { var cm0 = JSON.parse(rawGet('chr6_slots_meta') || '[]');
          cm0.forEach(function(e){ if (e && e.id != null && (e.deleted === true || hasControl(e))) tombIds[String(e.id)] = 1; }); } catch(e){}
    storyIds = storyIds.filter(function(id){ return !tombIds[id]; });
    var writes = [], denied = [], bytes = 0;
    keys.forEach(function(k){
      var m2 = SLOT_RE.exec(k);
      var a2 = AI_RE.exec(k);
      var tid = m2 ? m2[1] : (a2 && a2[2]) ? a2[2] : null;
      /* ★fix721.5(hotfix): ここも bare substring だった。境界一致の storyIdOfKey へ置換。 */
      if (!tid){ var sid0 = storyIdOfKey(k); if (sid0 && tombIds[sid0]) tid = sid0; }
      if (tid && tombIds[tid]){ denied.push({ k: k, family: 'CURRENT_TOMBSTONE_PRESERVED' }); return; }
      var c = classifyForRestore(k, data[k], storyIds);
      if (c.allow){
        /* ★rollback可能性で書込modeを分ける:
             overwrite-safe = fix564 snapshotが事前退避できるkey（実在slotにslot-scoped）
             create-only    = snapshotで守れないkey（default本体chr6 / SHARED_ASSET /
                              現在存在しないslotのkey）。既存値があるなら**上書きせず現状維持**
                              （=バックアップは欠けている分だけ埋める。データ喪失0でrollback可能） */
        var sid2 = c.slotId || null;
        var covered = !!(sid2 && sid2 !== 'default' && rawGet('chr6_slot_' + sid2) != null);
        if (!covered && sid2 && sid2 !== 'default'){ covered = false; }        // 新slot=create-only(自然に不在)
        var mode = covered ? 'overwrite' : 'create-only';
        writes.push({ k: k, family: c.family, slotId: sid2, mode: mode });
        bytes += String(data[k]).length;
      }
      else if (c.family !== 'META_REBUILD') denied.push({ k: k, family: c.family });
    });
    /* ★★★fix721.5(hotfix / GPT裁定): 危険 base key を1つでも含む backup は、
       **そのキーだけ落として「復元成功」にしない**。それは
       「復元したつもりで状態だけ戻っていない」という現状の silent failure を温存する。
       mutation を1バイトも始める前に **restore 全体を HOLD** する。
       ここで返すと preflight / journal / rawSet / reload はすべて実行されない。 */
    var baseKeys = [];
    for (var bi = 0; bi < denied.length; bi++)
      if (denied[bi].family === 'SLOT_ISOLATED_BASE_KEY') baseKeys.push(denied[bi].k);
    if (baseKeys.length)
      return { ok: false, code: 'RESTORE_SLOT_BASE_KEY_AMBIGUOUS_HOLD',
               baseKeys: baseKeys, denied: denied, wrote: 0, partial: false };
    if (!writes.length) return { ok: false, code: 'RESTORE_NOTHING_ALLOWED', denied: denied };
    /* ★★fix726(RULING48 §15-17): RESTORE INPUT SANITIZATION ONLY。
       top-level auth key は既に denyFamily() で deny 済みだが、
       悪意ある/古い backup の story cfg に secret4 を埋め込めば再注入できてしまう。
       ここで落とすのは **import copy だけ**。existing local story / runtime S.cfg には触れない。
       policy の authority は fix726。ここに第二の secret 判定を書かない。 */
    var sdata = data, secretStripped = 0;
    var G726b = window.__v292Dfix726;
    if (G726b && G726b.on() && typeof G726b.sanitizeImportedStoryRaw === 'function'){
      sdata = {};
      for (var dk in data){ if (Object.prototype.hasOwnProperty.call(data, dk)) sdata[dk] = data[dk]; }
      for (var wi = 0; wi < writes.length; wi++){
        if (writes[wi].family !== 'STORY_DATA') continue;
        var wk = writes[wi].k, wv = sdata[wk];
        if (typeof wv !== 'string') continue;
        var sres = G726b.sanitizeImportedStoryRaw(wv);
        if (sres && sres.ok && sres.value != null){
          if (sres.value !== wv){ sdata[wk] = sres.value; secretStripped += (sres.removed || 0); }
        }
        /* parse 不能等で !ok の場合は値を変えず、既存の classifyForRestore /
           applyPlan の契約にそのまま任せる（restore 挙動を変えない）。 */
      }
    }
    var meta = mergeMeta(rawGet('chr6_slots_meta'), sdata['chr6_slots_meta'], storyIds);
    /* ★RULING31 §3-4: NON_DESTRUCTIVE MERGE — backupに無い現在storyのremoveは行わない（removes恒常0） */
    var removes = [];
    var affected = {};
    writes.forEach(function(w){ if (w.mode === 'overwrite' && w.slotId && w.slotId !== 'default') affected[w.slotId] = 1; });
    return { ok: true, restoreId: 'r721_' + Date.now(), data: sdata, writes: writes, removes: removes,
             denied: denied, storyIds: storyIds, meta: meta, bytes: bytes,
             secretFieldsStripped: secretStripped,
             affectedSlots: Object.keys(affected) };
  }

  // ---- preflight: 影響slotをfix564で退避（complete必須） + journal PREPARED ----
  function preflight(plan){
    if (!plan || !plan.ok) return { ok: false, code: 'NO_PLAN' };
    var snap = window.__v292Dfix564;
    if (!snap || typeof snap.create !== 'function') return { ok: false, code: 'SNAPSHOT_PRIMITIVE_UNAVAILABLE' };
    var snaps = {}, failed = null;
    for (var i = 0; i < plan.affectedSlots.length; i++){
      var sid = plan.affectedSlots[i];
      if (rawGet('chr6_slot_' + sid) == null) continue;            // 現在存在しないslotは退避不要
      var r = null;
      try { r = snap.create(sid, { reason: 'fix721-restore:' + plan.restoreId, now: Date.now() }); } catch(e){ r = { ok: false, error: String(e) }; }
      if (!r || !r.ok){ failed = { slot: sid, r: r }; break; }
      snaps[sid] = r.id;
    }
    if (failed) return { ok: false, code: 'PREFLIGHT_SNAPSHOT_FAILED', detail: failed };
    var preMeta = rawGet('chr6_slots_meta');
    var j = { v: 1, restoreId: plan.restoreId, phase: 'PREPARED', at: Date.now(),
              writes: (plan.effWrites || plan.writes).map(function(w){ return w.k; }),
              removes: plan.removes.slice(),
              snapshots: snaps,
              preMeta: (preMeta == null ? null : preMeta),        // meta=台帳(本文でない・bounded)
              preMetaHash: (preMeta == null ? null : fnv(preMeta)) };
    if (!writeJournalDurable(j)){ clearJournal(); return { ok: false, code: 'JOURNAL_NOT_DURABLE' }; }
    return { ok: true, journal: j };
  }

  // ---- rollback（apply失敗/次boot recovery共用） ----
  function rollback(j, why){
    if (!j || typeof j !== 'object') return { ok: false, code: 'NO_JOURNAL', why: why };
    var snap = window.__v292Dfix564;
    var errs = [];
    /* 1. 書いたkeyを除去（snapshot復元で戻るものも一旦消してよい） */
    (j.writes || []).forEach(function(k){ try { rawDel(k); } catch(e){ errs.push('del:' + k); } });
    /* 2. meta復元 */
    try { if (j.preMeta == null) rawDel('chr6_slots_meta'); else rawSet('chr6_slots_meta', j.preMeta); }
    catch(e){ errs.push('meta'); }
    /* 3. snapshotから各slot復元（fix564.restoreはconfirm必須のdry-run既定） */
    var ids = Object.keys(j.snapshots || {});
    ids.forEach(function(sid){
      try { var r = snap.restore(j.snapshots[sid], { toSlot: sid, confirm: true });
            if (!r || !r.ok) errs.push('snap:' + sid); }
      catch(e){ errs.push('snap:' + sid); }
    });
    if (errs.length) return { ok: false, code: 'ROLLBACK_PARTIAL', errs: errs, why: why };
    clearJournal();
    return { ok: true, why: why };
  }

  // ---- apply（同期1ブロック。cloud通信 0） ----
  function applyPlan(plan, opts){
    opts = opts || {};
    if (off()) return { ok: false, code: 'FIX721_OFF' };
    if (!plan || !plan.ok) return { ok: false, code: 'NO_PLAN' };
    /* ★effective writes を apply直前の同期ブロック内で確定する:
       create-only で既に値があるkeyは**書かない**（=journalにも載せない）。
       journalのwritesは「本当に書くkeyだけ」になり、rollbackが未書込keyを消す事故を構造的に防ぐ。 */
    var effWrites = [], kept = [];
    for (var ew = 0; ew < plan.writes.length; ew++){
      var wr0 = plan.writes[ew];
      if (wr0.mode === 'create-only' && rawGet(wr0.k) != null) kept.push(wr0.k);
      else effWrites.push(wr0);
    }
    plan.effWrites = effWrites; plan.keptCurrent = kept;
    var pf = preflight(plan);
    if (!pf.ok) return pf;
    var j = pf.journal;
    j.phase = 'APPLYING';
    if (!writeJournalDurable(j)){ clearJournal(); return { ok: false, code: 'JOURNAL_NOT_DURABLE' }; }   /* story mutation 0のまま停止 */
    try {
      /* removes → writes → meta（全て同期。途中throw/quotaはcatchへ） */
      for (var r = 0; r < plan.removes.length; r++){
        rawDel(plan.removes[r]);
        if (opts.crashAfterRemoves != null && (r + 1) >= opts.crashAfterRemoves)
          throw { name: 'SimulatedCrash', atRemove: r + 1 };      // ★test専用crash注入
      }
      var actuallyWritten = [];
      var wlist = plan.effWrites || plan.writes;
      for (var w = 0; w < wlist.length; w++){
        var k = wlist[w].k;
        rawSet(k, String(plan.data[k]));
        actuallyWritten.push(k);
        if (opts.crashAfterWrites != null && actuallyWritten.length >= opts.crashAfterWrites)
          throw { name: 'SimulatedCrash', atWrite: actuallyWritten.length };  // ★test専用crash注入
      }
      rawSet('chr6_slots_meta', JSON.stringify(plan.meta));
      /* verify: 実際に書いたkeyを全読返し */
      for (var v = 0; v < actuallyWritten.length; v++){
        var kk = actuallyWritten[v];
        if (rawGet(kk) !== String(plan.data[kk])) throw { name: 'VerifyMismatch', key: kk };
      }
      j.phase = 'VERIFIED';
      writeJournal(j);
      clearJournal();
      var createdN = 0, restoredN = 0;
      (plan.effWrites || plan.writes).forEach(function(w){ if (w.mode === 'overwrite') restoredN++; else createdN++; });
      return { ok: true, code: 'RESTORED', restoreId: plan.restoreId,
               restored: restoredN, created: createdN, skippedExisting: (plan.keptCurrent || []).length,
               written: actuallyWritten.length, removed: 0,
               deniedCount: plan.denied.length, metaCount: plan.meta.length };
    } catch(e){
      if (e && e.name === 'SimulatedCrash' && opts.hardCrash) return { ok: false, code: 'SIMULATED_HARD_CRASH', journalLeft: true };
      var rb = rollback(j, 'apply-failed: ' + String((e && (e.name + (e.key ? ':' + e.key : ''))) || e));
      return { ok: false, code: rb.ok ? 'RESTORE_ROLLED_BACK' : 'ROLLBACK_PARTIAL', detail: rb };
    }
  }

  // ---- 次boot recovery（engine boot前に呼ぶ。scriptロード時に即実行） ----
  function recoverIfNeeded(){
    var j = readJournal();
    if (!j) return { ok: true, code: 'NO_JOURNAL' };
    if (j.phase === 'VERIFIED'){ clearJournal(); return { ok: true, code: 'VERIFIED_CLEARED' }; }
    var rb = rollback(j, 'boot-recovery(phase=' + j.phase + ')');
    return { ok: rb.ok, code: rb.ok ? 'RECOVERED_BY_ROLLBACK' : 'RECOVERY_PARTIAL', detail: rb };
  }

  /* ★★fix721.4(STEP4G-B/RULING34 §17): restore実行本体。
     入口（index fix291 / HOME adapter）が何であっても、plan→confirm→apply→reload の
     意味論はこの1本だけを通る。第二restore engine・第二allowlistを作らないための集約点。 */
  /* ★★裁定(Phase B review §3): 1つの関数が状況により 同期値 / Promise を返す契約は REJECT。
     ここは **sync core(Inner) + async GWS orchestration(Gws)** に分離してある。
       runRestoreFromDataInner(data) → **常に同期オブジェクト**（legacy semantics を1バイトも変えない）
       runRestoreFromDataGws(data)   → **常に Promise**（Promise を扱える caller だけが使う）
     呼び分けは同期の serializationRequired() で行い、戻り値型は関数ごとに固定する。 */
  function runRestoreFromDataInner(data){
    var plan = buildPlan(data);
    if (!plan.ok){
      /* ★fix721.5(hotfix): HOLD は「読み込めない形式」ではないので理由を正しく伝える。
         ここで return するため confirm / journal / rawSet / reload は 0。partial restore も 0。 */
      if (plan.code === 'RESTORE_SLOT_BASE_KEY_AMBIGUOUS_HOLD'){
        alert('このバックアップは、今の保存方式（物語ごとの分離保存）と形式が合わない項目を含んでいます。\n' +
              'そのまま読み込むと、キャラクターの状態などが「戻ったように見えて実際には反映されない」\n' +
              '状態になるため、安全のため **何も変更せずに中止** しました。\n\n' +
              '対象: ' + plan.baseKeys.join(', ') + '\n\n' +
              '今のデータは1バイトも変更していません。');
        return { ok:false, code: plan.code, baseKeys: plan.baseKeys, wrote: 0, partial: false };
      }
      alert('読み込めない形式です (' + plan.code + ')'); return { ok:false, code: plan.code };
    }
    /* ★fix721.2(RULING32 §5): ISOLATED RESTORE OPERATION — confirm contract の一部。
       他のChronicleタブを閉じることを復元の必須運用条件として明示する。 */
    var msg = '【まるごと読み込み（安全版・合流）】\n物語 ' + plan.storyIds.length + '件・' + plan.writes.length + '項目を読み込みます。\n' +
              '今ある物語は消しません（バックアップに無い物語はそのまま残ります）。\n' +
              '設定・ログイン・実験フラグ等の制御データ ' + plan.denied.length + '項目は安全のため復元しません。\n\n' +
              '⚠ 復元中に別のChronicleタブ（ホーム・物語）が開いていると、古い状態が再保存される可能性があります。\n' +
              '他のChronicleタブをすべて閉じてから続行してください。\n' +
              '（復元完了後は、開いていたChronicleタブを必ず再読み込みしてください）\n\n続けますか？';
    if (!confirm(msg)) return { ok:false, code:'CANCELLED' };
    return afterApply(applyPlan(plan));                            /* ★legacy: 完全同期・不変 */
  }

  function afterApply(r){
    if (r.ok){ alert('復元しました。ページを再読み込みします。'); try { location.reload(); } catch(e){} }
    else if (r.code === 'RESTORE_ROLLED_BACK'){ alert('復元に失敗したため、元の状態に戻しました。'); }
    else { alert('復元に失敗しました (' + r.code + ')。次回起動時に自動回復します。'); }
    return r;
  }
  function gws721(){
    try {
      var G = window.__v292DfixGWS || null;
      if (G && typeof G.runExclusive === 'function' && typeof G.serializationRequired === 'function') return G;
    } catch(e){}
    return null;
  }
  function serializationRequired721(){ var G = gws721(); return !!(G && G.serializationRequired()); }

  /* ★★fix745(GWS Phase B): apply は **logical transaction 全体**を shared lock で囲う。
       ・buildPlan / confirm() は lock の**外**（modal 待ちの間 lock を保持しない）。
       ・Class B(RECOVERY_OR_DESTRUCTIVE) = HARD_HOLD_NO_WRITE:
         BUSY なら applyPlan に**入らない** ＝ write0 / journal 未生成 / 成功verdict禁止 / reloadしない。
     **常に Promise を返す。** */
  function runRestoreFromDataGws(data){
    var G = gws721();
    if (!G) return Promise.resolve(runRestoreFromDataInner(data));
    var plan = buildPlan(data);
    if (!plan.ok){
      /* ★fix721.5(hotfix): 同上（Gws 経路。戻り値型は常に Promise を維持） */
      if (plan.code === 'RESTORE_SLOT_BASE_KEY_AMBIGUOUS_HOLD'){
        alert('このバックアップは、今の保存方式（物語ごとの分離保存）と形式が合わない項目を含んでいます。\n' +
              'そのまま読み込むと、キャラクターの状態などが「戻ったように見えて実際には反映されない」\n' +
              '状態になるため、安全のため **何も変更せずに中止** しました。\n\n' +
              '対象: ' + plan.baseKeys.join(', ') + '\n\n' +
              '今のデータは1バイトも変更していません。');
        return Promise.resolve({ ok:false, code: plan.code, baseKeys: plan.baseKeys, wrote: 0, partial: false });
      }
      alert('読み込めない形式です (' + plan.code + ')');
      return Promise.resolve({ ok:false, code: plan.code });
    }
    var msg = '【まるごと読み込み（安全版・合流）】\n物語 ' + plan.storyIds.length + '件・' + plan.writes.length + '項目を読み込みます。\n' +
              '今ある物語は消しません（バックアップに無い物語はそのまま残ります）。\n' +
              '設定・ログイン・実験フラグ等の制御データ ' + plan.denied.length + '項目は安全のため復元しません。\n\n' +
              '⚠ 復元中に別のChronicleタブ（ホーム・物語）が開いていると、古い状態が再保存される可能性があります。\n' +
              '他のChronicleタブをすべて閉じてから続行してください。\n' +
              '（復元完了後は、開いていたChronicleタブを必ず再読み込みしてください）\n\n続けますか？';
    if (!confirm(msg)) return Promise.resolve({ ok:false, code:'CANCELLED' });
    return G.runExclusive('B', function(){ return applyPlan(plan); }).then(function(x){
      if (x && x.ran) return afterApply(x.result);
      try { alert('他のタブが物語データを更新中のため、復元を中止しました。データは変更していません。\n' +
                  '他のChronicleタブを閉じてからやり直してください。'); } catch(e){}
      return { ok:false, code:'GWS_BUSY_HOLD', reason:(x && x.reason) || 'BUSY',
               policy:(x && x.policy) || 'HARD_HOLD_NO_WRITE', wrote:0 };
    });
  }

  // ---- fix291互換入口（index.html「📥 まるごと読込」） ----
  /* ★importAll は **常に undefined を返す**（FileReader callback。戻り値契約は不変）ので、
     内部で Inner / Gws を呼び分けても runtime-dependent return type にはならない。 */
  function importAll(file){
    if (!file) return;
    if (off()){ try { alert('復元機能は現在停止中です。'); } catch(e){} return; }
    var reader = new FileReader();
    reader.onload = function(){
      try {
        var data = JSON.parse(String(reader.result || '{}'));
        if (serializationRequired721()) runRestoreFromDataGws(data);   /* Promise は捨てる（元も戻り値未使用） */
        else runRestoreFromDataInner(data);
      }
      catch(e){ alert('読み込みに失敗しました: ' + (e && e.message)); }
    };
    reader.onerror = function(){ alert('ファイルの読み取りに失敗しました。'); };
    reader.readAsText(file);
  }

  /* ★★fix721.4(STEP4G-B/RULING34 §5・§17): HOME adapter 用入口。
     HOMEは自身のfile format（kind:'chronicle-device-backup' の pkg.ls）を parse/validate するだけで、
     **key-value map をそのまま safe core へ渡す**。HOME側に第二allowlistを持たせない
     （FIX721_ALLOWLIST = SINGLE AUTHORITY）。ここから先は fix291経路と完全に同一契約。 */
  /* ★importMap は HOME adapter へ **常に同期オブジェクト**を返す（既存 public contract を変えない）。
     serialization が必要な状態では Promise を返さず、**同期の fail-closed verdict**で止める。
     Promise を扱える HOME caller のために importMapGws（**常に Promise**）を別名で用意する。 */
  function importMapCheck(map){
    if (off()){ try { alert('復元機能は現在停止中です。'); } catch(e){} return { ok:false, code:'FIX721_OFF' }; }
    if (!map || typeof map !== 'object' || Object.prototype.toString.call(map) === '[object Array]'){
      alert('読み込めない形式です (RESTORE_SCHEMA_INVALID)');
      return { ok:false, code:'RESTORE_SCHEMA_INVALID' };
    }
    return null;
  }
  function importMap(map){
    var bad = importMapCheck(map); if (bad) return bad;
    if (serializationRequired721()){
      try { alert('別のタブが物語データを更新中の可能性があるため、この入口からは復元できません。\n' +
                  '他のChronicleタブをすべて閉じてから、もう一度お試しください。'); } catch(e){}
      return { ok:false, code:'GWS_SERIALIZATION_REQUIRED_USE_ASYNC_ENTRY', wrote:0 };
    }
    return runRestoreFromDataInner(map);
  }
  function importMapGws(map){
    var bad = importMapCheck(map); if (bad) return Promise.resolve(bad);
    if (!serializationRequired721()) return Promise.resolve(runRestoreFromDataInner(map));
    return runRestoreFromDataGws(map);
  }

  /* ★★fix721.3(STEP4G-A/RULING34 §6): SLOT IMPORT SAFETY POLICY（read-only helper）。
     features.js の単一slot import（セーブ管理「JSON 取込」）が、
       ・full restore transaction中（journal PREPARED/APPLYING）に割り込む
       ・current tombstone / delete-control state の slot へ body を書き戻す（local resurrection）
     ことを防ぐ判定を **fix721の単一policy** として提供する。
     features.js側で deleted/deleteOpId/pending/blocked 等のfield listを複製させないための口。
     storage write 0 / network 0 / 副作用0。返却は { allowed, reason }。 */
  function slotImportGuard(slotId){
    var id = (slotId == null) ? '' : String(slotId);
    if (!id) return { allowed: false, reason: 'NO_SLOT_ID' };
    if (off()) return { allowed: false, reason: 'FIX721_OFF' };
    try {
      var j = readJournal();
      if (j && (j.phase === 'PREPARED' || j.phase === 'APPLYING'))
        return { allowed: false, reason: 'RESTORE_HOLD_ACTIVE' };
    } catch(e){ /* journal不在/壊れ = hold無し（従来挙動） */ }
    var e2 = null;
    try {
      var cm = JSON.parse(rawGet('chr6_slots_meta') || '[]');
      if (Object.prototype.toString.call(cm) === '[object Array]'){
        for (var i = 0; i < cm.length; i++){
          if (cm[i] && cm[i].id != null && String(cm[i].id) === id){ e2 = cm[i]; break; }
        }
      }
    } catch(e){ return { allowed: false, reason: 'META_UNREADABLE' }; }   /* 判定不能はfail-closed */
    if (e2 && (e2.deleted === true || hasControl(e2)))
      return { allowed: false, reason: 'CURRENT_TOMBSTONE_OR_DELETE_CONTROL' };
    return { allowed: true, reason: 'OK' };
  }

  /* ★★fix745(GWS Phase B): module-scope boot recovery は **必ず GWS を通す**。
     ・GWS 不在 / serialization 不要（C1 OFF・journal無し ＝ production の通常状態）
         → その場で**同期実行**。legacy と1バイトも変わらない（順序・戻り値・reload判定）。
     ・serialization 必要（C1 active）
         → GWS_BOOT_RECOVERY_BARRIER に登録。shared lock 取得後に state 再読取 →
           同期 recovery → RESOLVED。unlocked recovery を1回も起こさない。
     裁定:「実際のproduction script順で起動した瞬間から、fix721/fix587が一度もGWSの外へ出ないか」 */
  var bootRecovery = null;
  var gwsBypassed = false;                 /* GWS未loadで走った＝load order違反（PASS条件の観測点） */
  function bootRecoverBody(){
    var out;
    try { out = recoverIfNeeded(); } catch(e){ out = { ok: false, code: 'RECOVERY_THREW' }; }
    bootRecovery = out;
    /* ★RULING31 §10-11: rollback recovery後は素のpre-restore状態で確実にboot し直す。
       journalはclear済みなので次loadでは発火しない（reloadループ不可）。test環境(location無し)ではskip。 */
    try {
      if (out && out.code === 'RECOVERED_BY_ROLLBACK' &&
          typeof location !== 'undefined' && location && typeof location.reload === 'function'){
        setTimeout(function(){ try { location.reload(); } catch(e){} }, 0);
      }
    } catch(e){}
    return out;
  }
  (function(){
    var G = null;
    try { G = window.__v292DfixGWS || null; } catch(e){ G = null; }
    if (G && typeof G.runBootRecovery === 'function'){
      var br = G.runBootRecovery('FIX721', bootRecoverBody);
      if (br && br.sync !== true)
        bootRecovery = { ok: true, code: 'DEFERRED_TO_GWS_BARRIER', barrier: br.barrier };
      return;
    }
    gwsBypassed = true;
    bootRecoverBody();
  })();

  window.__v292Dfix721 = {
    __armed: true, BUILD: BUILD, JOURNAL_KEY: JOURNAL_KEY,
    classifyForRestore: classifyForRestore, buildPlan: buildPlan, preflight: preflight,
    applyPlan: applyPlan, rollback: rollback, recoverIfNeeded: recoverIfNeeded,
    mergeMeta: mergeMeta, importAll: importAll, journal: readJournal,
    slotImportGuard: slotImportGuard,                                   /* ★fix721.3(STEP4G-A) read-only */
    importMap: importMap,                                               /* ★fix721.4(STEP4G-B) HOME adapter入口・常に同期 */
    importMapGws: importMapGws,                                         /* ★fix745: 常にPromise（async-capable caller用） */
    runRestoreFromDataInner: runRestoreFromDataInner,                    /* ★fix745: 常に同期 */
    runRestoreFromDataGws: runRestoreFromDataGws,                        /* ★fix745: 常にPromise */
    holdActive: function(){ var j = readJournal(); return !!(j && (j.phase === 'PREPARED' || j.phase === 'APPLYING')); },
    status: function(){ return { build: BUILD, off: off(), bootRecovery: bootRecovery, journal: readJournal(),
                                 gwsBypassed: gwsBypassed }; },
    gwsBypassed: function(){ return gwsBypassed; }
  };
  try { console.log(TAG, 'loaded (bootRecovery=' + (bootRecovery && bootRecovery.code) + ')'); } catch(e){}
})();
