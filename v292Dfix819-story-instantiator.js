// =====================================================================
// Chronicle TRPG - v292Dfix819: STORY_INSTANTIATION_PRIMITIVE（原本 → 独立 Story）
// ---------------------------------------------------------------------
// GPT 裁定 2026-09-06（GPT_RULING_STORY_INSTANTIATION_CONTRACT_V1_GO_STAGE_WITH_REVISIONS_20260906.md）:
//   `STORY_INSTANTIATION_CONTRACT_V1 = GO_STAGE_WITH_REVISIONS` / `SELECTED = OPTION A'` /
//   `STORY_INSTANTIATION_PRIMITIVE_STAGE = GO` / Scenario UI・store の実装は stage 受入まで HOLD。
//
// ■ これは何か
//   「trusted な Scenario 形式の入力」から「まっさらな独立 Story」を 1 本作るだけの primitive。
//   **既存 Story を変える処理ではない**。何もない新 ID に、許可された初期値だけを書く。
//   （過去の fix41 applyTemplate =「いま開いている Story をテンプレで置換する」とは別物。
//     fixP0 の封鎖には触れない・applyTemplate を呼ばない・chr6_active_slot 切替をコピー機構に使わない）
//
// ■ 契約（GPT 裁定・1 つでも破ったら実装ミス）
//   BLANK_NEW_STORY_PATH = PROTECTED_INVARIANT   … 通常の「新しい物語」経路は 1 バイトも変えない
//   SCENARIO_PROJECTION  … scene 初期値 / hero 初期値 / NPC 初期 6 field のみ（whitelist）
//   RUNTIME_BOOTSTRAP    … cfg.provider / cfg.orKey は **呼び出し側の runtime から**受け取る。
//                          **Scenario から取らない**（SCENARIO_ORIGINAL_CONTAINS_API_SECRET = FORBIDDEN）
//   turns は常に []      … fix600/fix635 の new-story guard は memory turns >= 1(2) で発火するので、
//                          turns を入れない限り誤発火しない＝ guard を 1 バイトも触らずに済む
//   SCENARIO_STORY_TITLE_INITIALIZATION = FINAL_AT_META_CREATION
//                        … initialTitle を caller から受け取り meta 作成時に確定。
//                          fix809 への正常系依存 = FORBIDDEN（fallback safety としてのみ残る）
//   SIDE_STORE_POLICY = CREATE_NONE_AT_INSTANTIATION … side store を 1 本も作らない
//                          （navigation 後の lazy creation は ALLOWED＝既存 fix の正常動作）
//   SCENARIO_PROVENANCE_V1 = NONE_PERSISTED … source Scenario ID を Story へ保存しない
//   START_RULES_PROJECTION = CONTRACT YES / field implementation = DEFERRED
//                          … startRules は **書かない**（field/owner は Start Rules stage で決める）
//   ZERO_TURN_MATERIALIZATION = ALLOWED / DO_NOT_MODIFY … fix756 には触らない
//
// ■ 原子性（FAILURE_ATOMICITY）
//   snapshot old meta → snapshot old active → body → meta → active_slot → COMMIT → （caller が navigation）
//   pre-commit failure: 新 body 削除 → 旧 meta 復元 → 旧 active 復元
//   rollback 自体が失敗したら silent continuation 禁止 = HARD STOP（{ok:false, hard:true}）
//   navigation は caller の責務。**navigation 失敗で Story を消さない**（有効な作成済 Story）
//
// ■ ID 衝突（STORY_ID_OCCUPIED）
//   body OR meta OR **その id を含む localStorage key が 1 本でもある**（side store / tombstone /
//   lifecycle marker を包含）なら占有とみなす。5 回再採番して全部衝突なら **write 0 で失敗**。
//
// 検証口: window.__v292Dfix819 = { project, isOccupied, allocateId, instantiate, state }
// 既定: 誰も呼ばない（UI 未接続）。kill: v292Dfix819Off='1' で instantiate が即失敗する。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix819) return;
  var TAG = '[v292Dfix819:story-instantiator]';
  var META_KEY = 'chr6_slots_meta';
  var ACTIVE_KEY = 'chr6_active_slot';
  var BODY_PREFIX = 'chr6_slot_';
  var MAX_ID_TRIES = 5;

  /* ---- whitelist（GPT 裁定 SCENARIO_PROJECTION）---- */
  var SCENE_FIELDS = ['lore', 'loc', 'obj', 'tone'];
  var HERO_FIELDS  = ['name', 'desc'];
  var NPC_FIELDS   = ['name', 'desc', 'personality', 'coreDesire', 'coreFear', 'wound'];
  /* ★NPC の wound は「cast の初期定義フィールド」としてのみ許可。
     fix190 の永続「傷」を projection する意味では **ない**（GPT 明示）。 */

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function lss(k, v){ try { localStorage.setItem(k, v); return true; } catch(e){ return false; } }
  function lsr(k){ try { localStorage.removeItem(k); return true; } catch(e){ return false; } }
  function off(){ return lsg('v292Dfix819Off') === '1'; }
  function str(v){ return (v == null) ? '' : String(v); }
  function trim(v){ return str(v).trim(); }

  /* ---------- 純関数: whitelist projection ----------
     ・原本オブジェクトを 1 バイトも変えない（読むだけ・値は新しい string へ複製）
     ・whitelist 外は 1 つも通さない（runtime field を混ぜられても落ちる）
     ・turns は常に []
     ・cfg は **runtime 引数から**のみ（scenario.cfg は無視する） */
  function project(input, runtime){
    var sc = (input && typeof input === 'object') ? input : {};
    var srcScene = (sc.scene && typeof sc.scene === 'object') ? sc.scene : {};
    var srcCast  = (sc.cast  && typeof sc.cast  === 'object') ? sc.cast  : {};
    var srcHero  = (srcCast.hero && typeof srcCast.hero === 'object') ? srcCast.hero : {};
    var srcNpcs  = Object.prototype.toString.call(srcCast.npcs) === '[object Array]' ? srcCast.npcs : [];

    var scene = {};
    for (var i = 0; i < SCENE_FIELDS.length; i++){
      var f = SCENE_FIELDS[i]; var v = trim(srcScene[f]); if (v) scene[f] = v;
    }
    var hero = {};
    for (var h = 0; h < HERO_FIELDS.length; h++){
      var hf = HERO_FIELDS[h]; var hv = trim(srcHero[hf]); if (hv) hero[hf] = hv;
    }
    var npcs = [];
    for (var n = 0; n < srcNpcs.length; n++){
      var s = srcNpcs[n]; if (!s || typeof s !== 'object') continue;
      var o = {}, any = false;
      for (var k = 0; k < NPC_FIELDS.length; k++){
        var nf = NPC_FIELDS[k]; var nv = trim(s[nf]);
        if (nv){ o[nf] = nv; if (nf === 'name') any = true; }
      }
      if (any) npcs.push(o);          /* 名前の無い NPC は捨てる（saveSettings と同じ流儀） */
    }

    var body = { turns: [], cast: { hero: hero, npcs: npcs }, scene: scene };

    /* RUNTIME_BOOTSTRAP: scenario ではなく caller の runtime から。存在する時だけ入れる。 */
    var rt = (runtime && typeof runtime === 'object') ? runtime : null;
    if (rt){
      var cfg = {};
      var p = trim(rt.provider), o2 = trim(rt.orKey);
      if (p) cfg.provider = p;
      if (o2) cfg.orKey = o2;
      if (cfg.provider || cfg.orKey) body.cfg = cfg;
    }
    /* ★startRules は書かない（START_RULES_PROJECTION field implementation = DEFERRED）
       ★scenario id も書かない（SCENARIO_PROVENANCE_V1 = NONE_PERSISTED） */
    return body;
  }

  /* ---------- 占有判定（STORY_ID_OCCUPIED）----------
     body / meta / その id を含む **あらゆる** localStorage key（side store・tombstone・
     lifecycle marker を包含）。id の直後が英数字なら別 id の一部とみなして無視する。 */
  function idAppearsInKey(key, id){
    var at = 0, K = String(key), n = id.length;
    while (true){
      var p = K.indexOf(id, at);
      if (p < 0) return false;
      var nxt = K.charAt(p + n);
      if (!/[A-Za-z0-9]/.test(nxt)) return true;    /* 直後が英数字でなければ独立した id */
      at = p + 1;
    }
  }
  function readMeta(){
    try { var m = JSON.parse(lsg(META_KEY) || '[]'); return (Object.prototype.toString.call(m) === '[object Array]') ? m : []; }
    catch(e){ return []; }
  }
  function isOccupied(id){
    if (!id) return true;
    if (lsg(BODY_PREFIX + id) != null) return true;
    var meta = readMeta();
    for (var i = 0; i < meta.length; i++){ if (meta[i] && String(meta[i].id) === String(id)) return true; }
    try {
      for (var k = 0; k < localStorage.length; k++){
        var key = localStorage.key(k);
        if (key && idAppearsInKey(key, id)) return true;
      }
    } catch(e){ return true; }        /* 走査できないなら安全側（占有扱い）で再採番させる */
    return false;
  }
  function newId(){
    return 's' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
  }
  function allocateId(){
    for (var i = 0; i < MAX_ID_TRIES; i++){
      var id = newId();
      if (!isOccupied(id)) return id;
    }
    return null;                       /* 5 回全部衝突 → write 0 で失敗させる */
  }

  /* ---------- instantiate（原子的・navigation はしない）---------- */
  function instantiate(opts){
    var o = (opts && typeof opts === 'object') ? opts : {};
    if (off()) return { ok: false, code: 'OFF' };

    var title = trim(o.initialTitle);
    if (!title) return { ok: false, code: 'NO_TITLE' };   /* FINAL_AT_META_CREATION: title は必須 */

    var body;
    try { body = project(o.scenario, o.runtime); }
    catch(e){ return { ok: false, code: 'PROJECT_ERROR', message: e && e.message }; }

    var id = allocateId();
    if (!id) return { ok: false, code: 'ID_COLLISION_EXHAUSTED' };

    /* --- snapshot（rollback 用の生バイト。null は「キーが無かった」を意味する） --- */
    var snapMeta = lsg(META_KEY);
    var snapActive = lsg(ACTIVE_KEY);
    var wroteBody = false;
    var stage = 'begin';

    function restore(key, snap){
      if (snap == null) return lsr(key);
      return lss(key, snap);
    }
    function rollback(failedAt){
      var ok1 = wroteBody ? lsr(BODY_PREFIX + id) : true;
      var ok2 = restore(META_KEY, snapMeta);
      var ok3 = restore(ACTIVE_KEY, snapActive);
      if (ok1 && ok2 && ok3) return { ok: false, code: failedAt, rolledBack: true };
      /* ★rollback 失敗は silent continuation 禁止 = HARD STOP */
      try { console.error(TAG, 'ROLLBACK FAILED', { failedAt: failedAt, body: ok1, meta: ok2, active: ok3, id: id }); } catch(e){}
      return { ok: false, code: 'ROLLBACK_FAILED', hard: true, failedAt: failedAt,
               detail: { body: ok1, meta: ok2, active: ok3, id: id } };
    }

    /* 1) body */
    stage = 'BODY_WRITE_FAILED';
    var bodyStr;
    try { bodyStr = JSON.stringify(body); } catch(e){ return { ok: false, code: 'SERIALIZE_ERROR' }; }
    if (!lss(BODY_PREFIX + id, bodyStr)) return rollback(stage);
    wroteBody = true;

    /* 2) meta */
    stage = 'META_WRITE_FAILED';
    var meta = readMeta();
    var now = new Date().toISOString();
    meta.push({ id: id, name: title, key: BODY_PREFIX + id,
                updatedAt: null, createdAt: now, lastOpenedAt: now });
    var metaStr;
    try { metaStr = JSON.stringify(meta); } catch(e){ return rollback('META_SERIALIZE_FAILED'); }
    if (!lss(META_KEY, metaStr)) return rollback(stage);

    /* 3) active_slot */
    stage = 'ACTIVE_WRITE_FAILED';
    if (!lss(ACTIVE_KEY, JSON.stringify(id))) return rollback(stage);

    /* 4) COMMIT（navigation は caller。navigation 失敗でも Story は消さない） */
    try { console.log(TAG, 'LOCAL_STORY_CREATION_COMMITTED', id); } catch(e){}
    return { ok: true, id: id, key: BODY_PREFIX + id, title: title, committed: true };
  }

  window.__v292Dfix819 = {
    version: 'v292Dfix819-20260906-primitive',
    /* 純関数（テスト用・書込 0） */
    project: function(input, runtime){ return project(input, runtime); },
    isOccupied: isOccupied,
    allocateId: allocateId,
    /* 原子的な作成（navigation はしない） */
    instantiate: instantiate,
    state: function(){
      return { off: off(), whitelist: { scene: SCENE_FIELDS.slice(), hero: HERO_FIELDS.slice(), npc: NPC_FIELDS.slice() },
               maxIdTries: MAX_ID_TRIES, uiWired: false };
    }
  };
  try { console.log(TAG, 'loaded (primitive only; not wired to any UI)'); } catch(e){}
})();
