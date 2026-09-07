// =====================================================================
// Chronicle TRPG - v292Dfix820: SCENARIO_ORIGINAL_STORE_V1（遊んでも原本が変わらない箱）
// ---------------------------------------------------------------------
// GPT 裁定 2026-09-06（GPT_RULING_SCENARIO_ORIGINAL_STORE_V1_GO_STAGE_WITH_REVISIONS_20260906.md）:
//   SCENARIO_ORIGINAL_STORE_V1 = GO_STAGE_WITH_REVISIONS / SCENARIO_ORIGINAL_STORE_STAGE = GO
//   new file only / script tag 0 / deploy 0 at stage。
//
// ■ これは何か
//   Scenario Original（＝物語の「原本」）だけを保存する **Story とは別 entity の local store**。
//   プレイ（index.html / S / features.js / 生成 / fix77 / fix190 / Memory / roster）から
//   原本を書き換える経路を **構造的に 0** にする。方向は
//       原本 → projection copy → fix819.instantiate → まっさらな新 Story
//   の一方向のみで、逆流する API を持たない。
//
// ■ 契約（1 つでも破ったら実装ミス）
//   SCENARIO_ORIGINAL_AUTHORITY_V1 = LOCAL_SEPARATE_STORE
//   IMMUTABLE_FROM_PLAY / OWNER_EDITABLE
//   UNKNOWN_FIELDS = REJECT      … 黙って落とさない（「保存したのに入っていない」を作らない）
//   READ_RETURNS_DEEP_COPY       … 返り値を書き換えても store は 1 バイトも変わらない
//   LIST_READS_META_ONLY         … 一覧は本体を 1 本も読まない
//   WHOLE_VALUE_EDIT             … 部分 patch を受け付けない（途中状態を作らない）
//   ROLLBACK_FAILURE = HARD_STOP … silent continuation 禁止
//   CLOUD_WRITE = 0 / STORY_SIDE_STORE = 0 / FIX41・APPLY_TEMPLATE = 0 /
//   ACTIVE_SLOT_WRITE = 0 / INDEX_LOAD = 0（index.html には絶対に載せない）
//
// ■ schema authority（GPT 裁定・二重 authority を作らない）
//   META: scenarioId / title / schemaVersion / createdAt / updatedAt
//   BODY: scenarioId / schemaVersion / scene / cast / startCondition / startRules   （v1.2: startRules 追加・schemaVersion 2）
//   meta.key                  = DO NOT STORE（scenarioId から決定的に導出できる）
//   body title/timestamps dup = DO NOT STORE
//
// ■ START_CONDITIONS_V1 = DEDICATED_SINGLE_FIELD
//   startCondition: string ＝ 物語開始時点の具体的な状況・配置・直前条件（T=0 でだけ prompt に出る）。
//   START_CONDITION != START_RULES。混ぜない。
//
// ■ START_RULES_V1（v1.2・GPT 裁定 2026-09-06(20)(21) START_RULES_V1 = GO_STAGE_WITH_REVISIONS）
//   startRules: string（optional・既定 ''）＝ 物語全体で持続する **作者（Owner）明示の自由文ルール**。
//   START_RULES_SOURCE = ORIGINAL_TEXT … 保存は原文（trim ＋ 改行正規化 \r\n|\r → \n のみ。
//     paraphrase 0 / 抽出 0 / 分解 0 / AI 0）。
//   START_RULES_MAX_LENGTH_V1 = 300 … **正規化後の Unicode code point 数**（JS .length = UTF-16 unit ではない）。
//     超過 = START_RULES_TOO_LONG で reject（write 0）。silent truncation 禁止。
//   ★『【』『】』は **reject しない**（GPT 裁定: 永続 schema は下流 prompt formatter＝fix459 の事情を知らない。
//     marker 衝突の回避は fix822 の render 時 MARKER_SAFE で行う）。
//   FIX820_SCHEMA_VERSION = BUMP（1 → 2）… accepted BODY shape が変わるため。migration engine は作らない。
//     deploy 前 hard gate = 既存 Scenario Original record が 0 であること（selfCheck.legacySchemaRecords / meta.count）。
//     1 件でも在れば STOP → migration 裁定。schemaVersion 1 の body/meta は read/edit で
//     SCHEMA_VERSION_MISMATCH（fail-closed・自動変換しない）。
//   FIX819_START_CONDITION_BRIDGE = IMPLEMENTATION_GO（fix819 v1.1）
//     … toInstantiationInput() は startRules / startCondition を **input の top-level** に複製し、
//       fix819.project が Story.scene.startRules / Story.scene.startCondition へ snapshot する
//       （空文字なら Story 側 key を作らない・Original への live link 0・provenance 0）。
//
// ■ STORY_ID_FORMAT_ASSUMPTION_V1（v1.1・GPT 裁定 2026-09-06(14)）
//   現行 Story ID = 's' + Date.now().toString(36)(8) + base36(rand)(1〜2) ＝ 英数字 10〜11 文字。
//   fix562.sideStoreKeys / classifyKey⑧ / fix587.planKeys は **裸の部分一致**なので、
//   もし 10 文字未満の Story ID が存在すると Scenario key がその Story の side-store と誤認されうる。
//   → Scenario key 側は「連続英数字 run < 10」を構造不変条件として固定し、
//     さらに create 前に **body-backed live Story ID**（= `chr6_slot_<id>` キーが実在する id）が
//     すべて s 始まり・英数字・length>=10 であることを要求する
//     （SHORT_SLOT_ID_SUBSTRING_HAZARD = HARD GATE / fail-closed）。
//   ★v1.1 で **判定対象を「chr6_slots_meta の全 id」から「body-backed live Story ID」へ狭めた**。
//     理由（実測 2026-09-06）: meta には本体の無い legacy ghost（`default`/`a`/`b`/`c`）が残っており、
//     これは **削除側（fix562.liveSlots はキー由来）では live に数えられない**ので side-store 誤認の
//     hazard を作らない。cloud package 側の誤認は **fix821 が membership authority を
//     body-backed へ移して解消済み**。したがって ghost は **diagnostic only** とし、
//     Scenario の create blocker にはしない（GPT 裁定）。
//
// 検証口: window.__v292Dfix820（下部の export を参照）
// 既定: 誰も呼ばない（UI 未接続・script タグ未追加）。kill: v292Dfix820Off='1' で全 API が即失敗する。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix820) return;
  var TAG = '[v292Dfix820:scenario-original-store]';
  var VERSION = 'v292Dfix820-20260907-store-v1.3';

  var META_KEY    = 'chr6_scenario_meta';
  var KEY_PREFIX  = 'chr6_scenario_';
  var STORY_META  = 'chr6_slots_meta';       /* READ 専用（ghost 診断の材料。membership authority ではない） */
  var STORY_BODY_PREFIX = 'chr6_slot_';      /* READ 専用（R3 gate の authority = 実在する Story 本体キー） */
  var SCHEMA_VERSION = 3;                    /* v1.3: BUMP（cast.*.gender を accepted BODY field に追加・GPT 裁定 56） */
  /* ★READ_SUPPORTED_SCHEMA = {2,3}（裁定 45 訂正版 / 裁定 56）。
     ・read / list は schema 2 をそのまま読む（**migration write 0**）
     ・Owner が **明示的に保存**したときだけ 2 → 3 へ上がる（exactly once）
     ・schema 1 と 4 以上は従来どおり SCHEMA_VERSION_MISMATCH で fail-closed（この lane で互換を広げない） */
  var READ_SCHEMA_VERSIONS = [2, 3];
  function schemaReadable(v){ return inList(READ_SCHEMA_VERSIONS, v); }
  var START_RULES_MAX_CP = 300;              /* START_RULES_MAX_LENGTH_V1（Unicode code point） */
  var MAX_ID_TRIES = 5;
  var MIN_STORY_ID_LEN = 10;                 /* STORY_ID_FORMAT_ASSUMPTION_V1 */
  var MAX_RUN = 9;                           /* Scenario key の連続英数字 run は 9 以下 */

  /* ---- whitelist（accepted schema surface。これ以外は 1 つも通さない）---- */
  var TOP_FIELDS   = ['title', 'scene', 'cast', 'startCondition', 'startRules'];
  var SCENE_FIELDS = ['lore', 'loc', 'obj', 'tone'];
  var HERO_FIELDS  = ['name', 'desc', 'gender'];
  var NPC_FIELDS   = ['name', 'desc', 'personality', 'coreDesire', 'coreFear', 'wound', 'gender'];
  /* ★SCENARIO_SCHEMA_V3 = GENDER_ONLY（裁定 56）。
     canonical 値は 2 値だけ。「未設定」は **key absent** で表し、'未設定' という string は保存しない。
     index の既存 authority（設定画面の性別ラジオ = 女性 / 男性 / 空）と完全一致させる。
     voice は V3 の canonical field ではない（裁定 42 の voice 部分は SUPERSEDED）。 */
  var GENDER_FIELD  = 'gender';
  var GENDER_VALUES = ['女性', '男性'];
  var CAST_FIELDS  = ['hero', 'npcs'];
  var META_FIELDS  = ['scenarioId', 'title', 'schemaVersion', 'createdAt', 'updatedAt'];
  /* ★npc.wound は「cast の初期定義フィールド」。fix190 の永続「傷」ではない（fix819 から継続） */
  var SECRET_NAMES = ['orKey', 'naiKey', 'pollKey', 'apiKey', 'provider', 'cfg'];

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function lss(k, v){ try { localStorage.setItem(k, v); return true; } catch(e){ return false; } }
  function lsr(k){ try { localStorage.removeItem(k); return true; } catch(e){ return false; } }
  function off(){ return lsg('v292Dfix820Off') === '1'; }
  function trim(v){ return (v == null) ? '' : String(v).trim(); }
  /* START_RULES 正規化: 改行を \n に統一してから trim。内容は 1 文字も変えない（原文保持） */
  function normRules(v){ return (v == null) ? '' : String(v).replace(/\r\n?/g, '\n').trim(); }
  /* Unicode code point 数（サロゲートペアを 1 と数える。JS .length ではない） */
  function codePoints(str){
    var n = 0, s = String(str == null ? '' : str);
    for (var i = 0; i < s.length; i++){
      var c = s.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length){
        var d = s.charCodeAt(i + 1);
        if (d >= 0xDC00 && d <= 0xDFFF){ i++; }
      }
      n++;
    }
    return n;
  }
  function isObj(o){ return !!o && typeof o === 'object' && Object.prototype.toString.call(o) !== '[object Array]'; }
  function isArr(o){ return Object.prototype.toString.call(o) === '[object Array]'; }
  function own(o){ var out = []; for (var k in o){ if (Object.prototype.hasOwnProperty.call(o, k)) out.push(k); } return out; }
  function inList(a, k){ for (var i = 0; i < a.length; i++){ if (a[i] === k) return true; } return false; }
  function clone(o){ try { return JSON.parse(JSON.stringify(o)); } catch(e){ return null; } }
  function err(code, detail){ var r = { ok: false, code: code }; if (detail != null) r.detail = detail; return r; }

  /* ================= key / id ================= */
  function keyFor(scenarioId){ return KEY_PREFIX + scenarioId; }

  /* SCENARIO_KEY_INVARIANT ①〜④
     ④は fix562.slotFromKey の孤児パターン `/_(sm[A-Za-z0-9]{3,})/` **そのもの**を検査する。
     「run が sm で始まるか」ではない（現行 Story ID は `_` ではなく `-` の後に来るため、
     区切りまで含めて実際の consumer と同じ式で判定しないと、無害な id を落としてしまう）。 */
  var SM_ORPHAN_RE = /_(sm[A-Za-z0-9]{3,})/;
  function keyInvariant(key){
    var k = String(key == null ? '' : key);
    var out = { key: k, startsWithPrefix: k.indexOf(KEY_PREFIX) === 0,
                noSlotToken: k.indexOf('chr6_slot_') < 0,
                noSmSlotToken: !SM_ORPHAN_RE.test(k), maxRun: 0, runs: [] };
    var runs = k.split(/[^A-Za-z0-9]+/);
    for (var i = 0; i < runs.length; i++){
      var r = runs[i]; if (!r) continue;
      out.runs.push(r);
      if (r.length > out.maxRun) out.maxRun = r.length;
    }
    out.runUnderLimit = out.maxRun <= MAX_RUN;
    out.ok = out.startsWithPrefix && out.noSlotToken && out.runUnderLimit && out.noSmSlotToken;
    return out;
  }

  function newScenarioId(){
    return 'sc-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1296).toString(36);
  }

  /* ================= meta ================= */
  function readMetaRaw(){
    var raw = lsg(META_KEY);
    if (raw == null) return { ok: true, list: [], raw: null };
    var p = null;
    try { p = JSON.parse(raw); } catch(e){ return { ok: false, code: 'META_PARSE_FAILED', raw: raw }; }
    if (!isArr(p)) return { ok: false, code: 'META_NOT_ARRAY', raw: raw };
    return { ok: true, list: p, raw: raw };
  }
  function metaIndexOf(list, id){
    for (var i = 0; i < list.length; i++){ if (list[i] && String(list[i].scenarioId) === String(id)) return i; }
    return -1;
  }

  /* ================= Story ID gate（READ のみ・書込 0）=================
     ★v1.1: 判定対象は **body-backed live Story ID**（`chr6_slot_<id>` キーが実在する id）。
       meta は authority にしない（fix821 と同じ authority へ揃える）。
       meta にしか無い ghost は `ghostMetaIds` として **報告するだけ**（blocker にしない）。 */
  function bodyBackedStoryIds(){
    var out = [], seen = {};
    try {
      for (var i = 0; i < localStorage.length; i++){
        var k = localStorage.key(i); if (!k) continue;
        var m = /^chr6_slot_([A-Za-z0-9]+)$/.exec(k); if (!m) continue;
        if (seen[m[1]]) continue; seen[m[1]] = 1; out.push(m[1]);
      }
    } catch(e){ return null; }              /* 列挙できない＝判定不能（fail-closed 側） */
    return out;
  }
  function ghostMetaIds(){
    var out = [], raw = lsg(STORY_META);
    if (raw == null) return out;
    var p = null;
    try { p = JSON.parse(raw); } catch(e){ return out; }
    if (!isArr(p)) return out;
    for (var i = 0; i < p.length; i++){
      var e = p[i]; if (!e) continue;
      var id = String(e.id == null ? '' : e.id);
      if (!id) continue;
      if (lsg(STORY_BODY_PREFIX + id) == null) out.push(id);   /* ★Story 本体（Scenario の BODY_PREFIX ではない） */
    }
    return out;
  }
  function storyIdGate(){
    var out = { ok: false, checked: 0, offenders: [], enumerable: false, ids: [], ghostMetaIds: [] };
    var ids = bodyBackedStoryIds();
    if (ids == null){ out.note = 'localStorage を列挙できない（判定不能）'; return out; }
    out.enumerable = true;
    out.ids = ids;
    try { out.ghostMetaIds = ghostMetaIds(); } catch(e){ out.ghostMetaIds = []; }
    for (var i = 0; i < ids.length; i++){
      var id = ids[i];
      out.checked++;
      var bad = null;
      if (!id) bad = 'EMPTY';
      else if (id.charAt(0) !== 's') bad = 'NOT_S_PREFIX';
      else if (!/^[A-Za-z0-9]+$/.test(id)) bad = 'NOT_ALPHANUMERIC';
      else if (id.length < MIN_STORY_ID_LEN) bad = 'TOO_SHORT';
      if (bad) out.offenders.push({ id: id, why: bad });
    }
    if (!ids.length) out.note = 'body-backed Story が 0 件';
    out.ok = out.offenders.length === 0;
    return out;
  }
  /* 提案キーに **body-backed** Story ID が裸の部分文字列として現れないこと（hard condition） */
  function storyIdSubstringHits(key){
    var hits = [], ids = bodyBackedStoryIds() || [];
    for (var i = 0; i < ids.length; i++){
      var id = ids[i];
      if (id && String(key).indexOf(id) >= 0) hits.push(id);
    }
    return hits;
  }

  /* ================= validation（accepted schema surface） ================= */
  /* 返り値: { ok:true, value } / { ok:false, code, detail }
     ★unknown field は黙って落とさず REJECT する。 */
  function validate(input){
    if (!isObj(input)) return err('NOT_OBJECT');

    var keys = own(input), i;
    for (i = 0; i < keys.length; i++){
      if (!inList(TOP_FIELDS, keys[i])) return err('UNKNOWN_FIELD', keys[i]);
    }

    var title = trim(input.title);
    if (!title) return err('NO_TITLE');

    /* scene */
    var scene = {}, srcScene = input.scene;
    if (srcScene !== undefined){
      if (!isObj(srcScene)) return err('SCENE_NOT_OBJECT');
      var sk = own(srcScene);
      for (i = 0; i < sk.length; i++){
        if (!inList(SCENE_FIELDS, sk[i])) return err('UNKNOWN_FIELD', 'scene.' + sk[i]);
        var sv = srcScene[sk[i]];
        if (sv != null && typeof sv !== 'string') return err('NOT_STRING', 'scene.' + sk[i]);
      }
      for (i = 0; i < SCENE_FIELDS.length; i++){
        var v = trim(srcScene[SCENE_FIELDS[i]]); if (v) scene[SCENE_FIELDS[i]] = v;
      }
    }

    /* cast */
    var hero = {}, npcs = [], srcCast = input.cast;
    if (srcCast !== undefined){
      if (!isObj(srcCast)) return err('CAST_NOT_OBJECT');
      var ck = own(srcCast);
      for (i = 0; i < ck.length; i++){
        if (!inList(CAST_FIELDS, ck[i])) return err('UNKNOWN_FIELD', 'cast.' + ck[i]);
      }
      if (srcCast.hero !== undefined){
        if (!isObj(srcCast.hero)) return err('HERO_NOT_OBJECT');
        var hk = own(srcCast.hero);
        for (i = 0; i < hk.length; i++){
          if (!inList(HERO_FIELDS, hk[i])) return err('UNKNOWN_FIELD', 'cast.hero.' + hk[i]);
          var hv = srcCast.hero[hk[i]];
          if (hv != null && typeof hv !== 'string') return err('NOT_STRING', 'cast.hero.' + hk[i]);
        }
        for (i = 0; i < HERO_FIELDS.length; i++){
          var h2 = trim(srcCast.hero[HERO_FIELDS[i]]);
          if (!h2) continue;                                   /* 空 = key を作らない（未設定） */
          if (HERO_FIELDS[i] === GENDER_FIELD && !inList(GENDER_VALUES, h2))
            return err('INVALID_ENUM', 'cast.hero.gender');    /* ★write 0（黙って落とさない） */
          hero[HERO_FIELDS[i]] = h2;
        }
      }
      if (srcCast.npcs !== undefined){
        if (!isArr(srcCast.npcs)) return err('NPCS_NOT_ARRAY');
        for (var n = 0; n < srcCast.npcs.length; n++){
          var src = srcCast.npcs[n];
          if (!isObj(src)) return err('NPC_NOT_OBJECT', n);
          var nk = own(src), o = {}, any = false;
          for (i = 0; i < nk.length; i++){
            if (!inList(NPC_FIELDS, nk[i])) return err('UNKNOWN_FIELD', 'cast.npcs[' + n + '].' + nk[i]);
            var nv0 = src[nk[i]];
            if (nv0 != null && typeof nv0 !== 'string') return err('NOT_STRING', 'cast.npcs[' + n + '].' + nk[i]);
          }
          for (i = 0; i < NPC_FIELDS.length; i++){
            var nv = trim(src[NPC_FIELDS[i]]);
            if (!nv) continue;                                 /* 空 = key を作らない（未設定） */
            if (NPC_FIELDS[i] === GENDER_FIELD && !inList(GENDER_VALUES, nv))
              return err('INVALID_ENUM', 'cast.npcs[' + n + '].gender');   /* ★write 0 */
            o[NPC_FIELDS[i]] = nv;
            if (NPC_FIELDS[i] === 'name') any = true;
          }
          if (!any) return err('NPC_WITHOUT_NAME', n);
          npcs.push(o);
        }
      }
    }

    /* startCondition（DEDICATED_SINGLE_FIELD） */
    var sc = '';
    if (input.startCondition !== undefined){
      if (input.startCondition != null && typeof input.startCondition !== 'string') return err('NOT_STRING', 'startCondition');
      sc = trim(input.startCondition);
    }

    /* startRules（START_RULES_V1・原文保持・code point cap・【】は reject しない） */
    var sr = '';
    if (input.startRules !== undefined){
      if (input.startRules != null && typeof input.startRules !== 'string') return err('NOT_STRING', 'startRules');
      sr = normRules(input.startRules);
      var cp = codePoints(sr);
      if (cp > START_RULES_MAX_CP) return err('START_RULES_TOO_LONG', { codePoints: cp, max: START_RULES_MAX_CP });
    }

    var value = { title: title, scene: scene, cast: { hero: hero, npcs: npcs }, startCondition: sc, startRules: sr };

    /* 二次防壁: 受理面の中に secret の **field 名**が構造として残っていないこと。
       主保証は上の whitelist reject。ここは「万一 whitelist を通り抜けたら書かない」ための最後の関門。 */
    var probe;
    try { probe = JSON.stringify(value); } catch(e){ return err('SERIALIZE_ERROR'); }
    for (i = 0; i < SECRET_NAMES.length; i++){
      if (probe.indexOf('"' + SECRET_NAMES[i] + '":') >= 0 || probe.indexOf('\\"' + SECRET_NAMES[i] + '\\":') >= 0){
        return err('SECRET_FIELD_IN_ACCEPTED_SURFACE', SECRET_NAMES[i]);
      }
    }
    return { ok: true, value: value };
  }

  function bodyOf(scenarioId, value){
    return { scenarioId: scenarioId, schemaVersion: SCHEMA_VERSION,
             scene: value.scene, cast: value.cast, startCondition: value.startCondition,
             startRules: (typeof value.startRules === 'string') ? value.startRules : '' };
  }

  /* ================= CRUD ================= */
  function isTaken(scenarioId){
    if (!scenarioId) return true;
    if (lsg(keyFor(scenarioId)) != null) return true;
    var m = readMetaRaw();
    if (!m.ok) return true;                        /* 読めないときは占有側（fail-closed） */
    return metaIndexOf(m.list, scenarioId) >= 0;
  }

  function allocateId(){
    for (var t = 0; t < MAX_ID_TRIES; t++){
      var id = newScenarioId();
      if (isTaken(id)) continue;
      var inv = keyInvariant(keyFor(id));
      if (!inv.ok) continue;
      if (storyIdSubstringHits(keyFor(id)).length) continue;
      return id;
    }
    return null;
  }

  function create(input){
    if (off()) return err('OFF');
    var v = validate(input);
    if (!v.ok) return v;

    var gate = storyIdGate();
    if (!gate.ok) return err('STORY_ID_FORMAT_ASSUMPTION_VIOLATED', gate.offenders);

    var m = readMetaRaw();
    if (!m.ok) return err(m.code);

    var id = allocateId();
    if (!id) return err('ID_ALLOCATION_EXHAUSTED');

    var snapMeta = m.raw;
    var bodyKey = keyFor(id), wroteBody = false;
    var now = new Date().toISOString();

    function rollback(failedAt){
      var ok1 = wroteBody ? lsr(bodyKey) : true;
      var ok2 = (snapMeta == null) ? lsr(META_KEY) : lss(META_KEY, snapMeta);
      if (ok1 && ok2) return { ok: false, code: failedAt, rolledBack: true };
      try { console.error(TAG, 'ROLLBACK FAILED', { failedAt: failedAt, body: ok1, meta: ok2, id: id }); } catch(e){}
      return { ok: false, code: 'ROLLBACK_FAILED', hard: true, failedAt: failedAt,
               detail: { body: ok1, meta: ok2, scenarioId: id } };
    }

    var bodyStr;
    try { bodyStr = JSON.stringify(bodyOf(id, v.value)); } catch(e){ return err('SERIALIZE_ERROR'); }
    if (!lss(bodyKey, bodyStr)) return rollback('BODY_WRITE_FAILED');
    wroteBody = true;

    var list = m.list.slice();
    list.push({ scenarioId: id, title: v.value.title, schemaVersion: SCHEMA_VERSION,
                createdAt: now, updatedAt: null });
    var metaStr;
    try { metaStr = JSON.stringify(list); } catch(e){ return rollback('META_SERIALIZE_FAILED'); }
    if (!lss(META_KEY, metaStr)) return rollback('META_WRITE_FAILED');

    try { console.log(TAG, 'SCENARIO_CREATED', id); } catch(e){}
    return { ok: true, scenarioId: id, title: v.value.title, createdAt: now };
  }

  /* read: meta + body を **deep copy で合成**して返す。壊れていても勝手に直さない。 */
  function read(scenarioId){
    if (off()) return err('OFF');
    var id = trim(scenarioId);
    if (!id) return err('NO_ID');
    var m = readMetaRaw();
    if (!m.ok) return err(m.code);
    var idx = metaIndexOf(m.list, id);
    if (idx < 0) return err('NOT_FOUND');
    var me = m.list[idx];

    var raw = lsg(keyFor(id));
    if (raw == null) return err('ORPHAN_META', id);          /* 自動修復しない */
    var body = null;
    try { body = JSON.parse(raw); } catch(e){ return err('BODY_PARSE_FAILED', id); }
    if (!isObj(body)) return err('BODY_NOT_OBJECT', id);
    if (String(body.scenarioId) !== id) return err('SCENARIO_ID_MISMATCH', { meta: id, body: body.scenarioId });
    /* ★v1.3: READ_SUPPORTED_SCHEMA = {2,3}。schema 2 はそのまま読む（**write 0**・自動 migration 0）。
       返す schemaVersion は **その record が実際に持っている版**（現行版に見せかけない）。 */
    if (!schemaReadable(body.schemaVersion)) return err('SCHEMA_VERSION_MISMATCH', body.schemaVersion);
    if (!schemaReadable(me.schemaVersion)) return err('SCHEMA_VERSION_MISMATCH', me.schemaVersion);
    if (body.schemaVersion !== me.schemaVersion)
      return err('SCHEMA_VERSION_MISMATCH', { meta: me.schemaVersion, body: body.schemaVersion });

    var out = clone({
      scenarioId: id,
      title: me.title == null ? '' : String(me.title),
      schemaVersion: body.schemaVersion,
      createdAt: me.createdAt == null ? null : me.createdAt,
      updatedAt: me.updatedAt == null ? null : me.updatedAt,
      scene: isObj(body.scene) ? body.scene : {},
      cast:  isObj(body.cast)  ? body.cast  : { hero: {}, npcs: [] },
      startCondition: typeof body.startCondition === 'string' ? body.startCondition : '',
      startRules: typeof body.startRules === 'string' ? body.startRules : ''
    });
    if (!out) return err('CLONE_FAILED');
    return { ok: true, scenario: out };
  }

  /* list: **body を 1 本も読まない**。meta の deep copy だけを返す。 */
  function list(){
    if (off()) return err('OFF');
    var m = readMetaRaw();
    if (!m.ok) return err(m.code);
    var out = [];
    for (var i = 0; i < m.list.length; i++){
      var e = m.list[i]; if (!isObj(e)) continue;
      var row = {};
      for (var f = 0; f < META_FIELDS.length; f++){
        var k = META_FIELDS[f];
        row[k] = (e[k] === undefined) ? null : e[k];
      }
      out.push(row);
    }
    return { ok: true, scenarios: clone(out) || [] };
  }

  /* edit: WHOLE_VALUE_EDIT。部分 patch は受け付けない（input は create と同じ完全な形）。 */
  function edit(scenarioId, input){
    if (off()) return err('OFF');
    var id = trim(scenarioId);
    if (!id) return err('NO_ID');
    var v = validate(input);
    if (!v.ok) return v;

    var m = readMetaRaw();
    if (!m.ok) return err(m.code);
    var idx = metaIndexOf(m.list, id);
    if (idx < 0) return err('NOT_FOUND');

    var bodyKey = keyFor(id);
    var snapBody = lsg(bodyKey);
    if (snapBody == null) return err('ORPHAN_META', id);      /* 自動修復しない */
    var oldBody = null;
    try { oldBody = JSON.parse(snapBody); } catch(e){ return err('BODY_PARSE_FAILED', id); }
    if (!isObj(oldBody)) return err('BODY_NOT_OBJECT', id);
    if (String(oldBody.scenarioId) !== id) return err('SCENARIO_ID_MISMATCH', { meta: id, body: oldBody.scenarioId });
    /* ★v1.3: schema 2 の原本も編集できる。**この explicit save のときだけ** schemaVersion が 3 へ上がる
       （bodyOf / meta が SCHEMA_VERSION を書く）。read / list では 1 バイトも書き換えない。 */
    if (!schemaReadable(oldBody.schemaVersion)) return err('SCHEMA_VERSION_MISMATCH', oldBody.schemaVersion);

    var snapMeta = m.raw;
    var wroteBody = false;

    function rollback(failedAt){
      var ok1 = wroteBody ? lss(bodyKey, snapBody) : true;
      var ok2 = (snapMeta == null) ? lsr(META_KEY) : lss(META_KEY, snapMeta);
      if (ok1 && ok2) return { ok: false, code: failedAt, rolledBack: true };
      try { console.error(TAG, 'ROLLBACK FAILED', { failedAt: failedAt, body: ok1, meta: ok2, id: id }); } catch(e){}
      return { ok: false, code: 'ROLLBACK_FAILED', hard: true, failedAt: failedAt,
               detail: { body: ok1, meta: ok2, scenarioId: id } };
    }

    var newBodyStr;
    try { newBodyStr = JSON.stringify(bodyOf(id, v.value)); } catch(e){ return err('SERIALIZE_ERROR'); }
    if (!lss(bodyKey, newBodyStr)) return rollback('BODY_WRITE_FAILED');
    wroteBody = true;

    var listArr = m.list.slice(), me = {};
    var src = m.list[idx];
    me.scenarioId    = id;
    me.title         = v.value.title;
    me.schemaVersion = SCHEMA_VERSION;
    me.createdAt     = (src && src.createdAt !== undefined) ? src.createdAt : null;   /* 不変 */
    me.updatedAt     = new Date().toISOString();
    listArr[idx] = me;
    var metaStr;
    try { metaStr = JSON.stringify(listArr); } catch(e){ return rollback('META_SERIALIZE_FAILED'); }
    if (!lss(META_KEY, metaStr)) return rollback('META_WRITE_FAILED');

    try { console.log(TAG, 'SCENARIO_EDITED', id); } catch(e){}
    return { ok: true, scenarioId: id, updatedAt: me.updatedAt };
  }

  /* remove: Scenario 専用 local 削除。fix587 も tombstone も cloud も使わない。 */
  function remove(scenarioId){
    if (off()) return err('OFF');
    var id = trim(scenarioId);
    if (!id) return err('NO_ID');
    var m = readMetaRaw();
    if (!m.ok) return err(m.code);
    var idx = metaIndexOf(m.list, id);
    if (idx < 0) return err('NOT_FOUND');

    var bodyKey = keyFor(id);
    var snapBody = lsg(bodyKey);
    var snapMeta = m.raw;
    var removedBody = false;

    function rollback(failedAt){
      var ok1 = (snapMeta == null) ? lsr(META_KEY) : lss(META_KEY, snapMeta);
      var ok2 = true;
      if (removedBody) ok2 = (snapBody == null) ? true : lss(bodyKey, snapBody);
      if (ok1 && ok2) return { ok: false, code: failedAt, rolledBack: true };
      try { console.error(TAG, 'ROLLBACK FAILED', { failedAt: failedAt, meta: ok1, body: ok2, id: id }); } catch(e){}
      return { ok: false, code: 'ROLLBACK_FAILED', hard: true, failedAt: failedAt,
               detail: { meta: ok1, body: ok2, scenarioId: id } };
    }

    var listArr = m.list.slice();
    listArr.splice(idx, 1);
    var metaStr;
    try { metaStr = JSON.stringify(listArr); } catch(e){ return err('META_SERIALIZE_FAILED'); }
    if (!lss(META_KEY, metaStr)) return rollback('META_WRITE_FAILED');

    if (snapBody != null){
      if (!lsr(bodyKey)) return rollback('BODY_REMOVE_FAILED');
      removedBody = true;
      if (lsg(bodyKey) != null) return rollback('BODY_REMOVE_FAILED');   /* 読み戻し確認 */
    }
    try { console.log(TAG, 'SCENARIO_REMOVED', id); } catch(e){}
    return { ok: true, scenarioId: id };
  }

  /* ================= fix819 への projection（純関数・caller は作らない） =================
     ★store の body そのものを fix819 へ渡さない。**新しいオブジェクト**を作って渡す。
     ★v1.2: startCondition / startRules は **input の top-level** に別々に複製する（scene の中には入れない。
       Scenario 側の型を保ち、fix819 v1.1 の project が Story.scene.* へ snapshot する）。
       空文字なら key を作らない。「desc 等へ混ぜる」は引き続き禁止。 */
  function toInstantiationInput(scenario){
    var s = isObj(scenario) ? scenario : {};
    var srcScene = isObj(s.scene) ? s.scene : {};
    var srcCast  = isObj(s.cast)  ? s.cast  : {};
    var srcHero  = isObj(srcCast.hero) ? srcCast.hero : {};
    var srcNpcs  = isArr(srcCast.npcs) ? srcCast.npcs : [];

    var scene = {}, i;
    for (i = 0; i < SCENE_FIELDS.length; i++){
      var sv = trim(srcScene[SCENE_FIELDS[i]]); if (sv) scene[SCENE_FIELDS[i]] = sv;
    }
    var hero = {};
    for (i = 0; i < HERO_FIELDS.length; i++){
      var hv = trim(srcHero[HERO_FIELDS[i]]); if (hv) hero[HERO_FIELDS[i]] = hv;
    }
    var npcs = [];
    for (var n = 0; n < srcNpcs.length; n++){
      var src = isObj(srcNpcs[n]) ? srcNpcs[n] : null; if (!src) continue;
      var o = {}, any = false;
      for (i = 0; i < NPC_FIELDS.length; i++){
        var nv = trim(src[NPC_FIELDS[i]]);
        if (nv){ o[NPC_FIELDS[i]] = nv; if (NPC_FIELDS[i] === 'name') any = true; }
      }
      if (any) npcs.push(o);
    }
    var sc = (typeof s.startCondition === 'string') ? trim(s.startCondition) : '';
    var sr = (typeof s.startRules === 'string') ? normRules(s.startRules) : '';
    var input = { scene: scene, cast: { hero: hero, npcs: npcs } };
    if (sc) input.startCondition = sc;     /* 空なら key を作らない */
    if (sr) input.startRules = sr;         /* 空なら key を作らない */
    return {
      input: input,
      initialTitle: trim(s.title),
      notProjected: [],
      diagnostics: {
        bridge: 'FIX819_START_CONDITION_BRIDGE = IMPLEMENTATION_GO (requires fix819 v1.1)',
        startConditionPresent: !!sc,
        startConditionLength: sc.length,
        startRulesPresent: !!sr,
        startRulesCodePoints: codePoints(sr),
        note: 'startCondition / startRules は input top-level に複製され fix819 v1.1 が Story.scene へ snapshot する（scene.lore/obj/desc へは混ぜない）'
      }
    };
  }

  /* ================= selfCheck（READ のみ・書込 0・自動修復 0） ================= */
  function selfCheck(){
    var out = { version: VERSION, schemaVersion: SCHEMA_VERSION, off: off(), writes: 0,
                storyIdGate: storyIdGate(), meta: null, orphanBodies: [], orphanMeta: [],
                readSchemaVersions: READ_SCHEMA_VERSIONS.slice(),
                legacySchemaRecords: [],              /* 読めない版（1 や 4 以上）= fail-closed 対象 */
                upgradableSchemaRecords: [],          /* 読めるが現行より古い版（= 2）。**自動では上げない** */
                keyInvariantSample: keyInvariant(keyFor(newScenarioId())),
                notes: [] };
    var m = readMetaRaw();
    out.meta = m.ok ? { ok: true, count: m.list.length } : { ok: false, code: m.code };
    if (m.ok){
      var known = {}, i;
      for (i = 0; i < m.list.length; i++){
        var e = m.list[i]; if (!isObj(e)) continue;
        var id = String(e.scenarioId == null ? '' : e.scenarioId);
        known[keyFor(id)] = 1;
        if (id && lsg(keyFor(id)) == null) out.orphanMeta.push(id);
        if (e.schemaVersion !== SCHEMA_VERSION){
          var row = { scenarioId: id, schemaVersion: e.schemaVersion === undefined ? null : e.schemaVersion };
          if (schemaReadable(e.schemaVersion)) out.upgradableSchemaRecords.push(row);
          else out.legacySchemaRecords.push(row);
        }
      }
      try {
        for (i = 0; i < localStorage.length; i++){
          var k = localStorage.key(i);
          if (k && k !== META_KEY && k.indexOf(KEY_PREFIX) === 0 && !known[k]) out.orphanBodies.push(k);
        }
      } catch(e){ out.notes.push('LS 列挙に失敗'); }
    }
    if (!out.storyIdGate.ok){
      out.notes.push('SHORT_SLOT_ID_SUBSTRING_HAZARD: body-backed live Story ID が '
                   + 'STORY_ID_FORMAT_ASSUMPTION_V1 を満たさない。create は fail-closed で拒否する。');
    }
    if (out.storyIdGate.ghostMetaIds && out.storyIdGate.ghostMetaIds.length){
      out.notes.push('GHOST_META_ENTRIES（本体の無い meta id）を検出したが **diagnostic only**。'
                   + 'membership authority ではないので create を止めない。1 バイトも直さない。');
    }
    if (out.orphanMeta.length || out.orphanBodies.length){
      out.notes.push('orphan を検出したが **自動修復しない**（報告のみ）。');
    }
    if (out.legacySchemaRecords.length){
      out.notes.push('LEGACY_SCHEMA_RECORDS: READ_SUPPORTED_SCHEMA の外にある Scenario record が存在する。'
                   + '自動 migration はしない（read/edit は SCHEMA_VERSION_MISMATCH で fail-closed）。migration 裁定が必要。');
    }
    if (out.upgradableSchemaRecords.length){
      out.notes.push('UPGRADABLE_SCHEMA_RECORDS: schema 2 の record は **そのまま読める**。'
                   + 'Owner が明示的に保存したときだけ 3 へ上がる（read/list の migration write は 0）。');
    }
    out.ok = out.storyIdGate.ok && (!m.ok ? false : true);
    return out;
  }

  window.__v292Dfix820 = {
    version: VERSION,
    schemaVersion: SCHEMA_VERSION,
    /* 純関数（書込 0） */
    validate: validate,
    keyFor: keyFor,
    keyInvariant: keyInvariant,
    newScenarioId: newScenarioId,
    isTaken: isTaken,
    storyIdGate: storyIdGate,
    bodyBackedStoryIds: bodyBackedStoryIds,
    ghostMetaIds: ghostMetaIds,
    storyIdSubstringHits: storyIdSubstringHits,
    toInstantiationInput: toInstantiationInput,
    codePoints: codePoints,
    normRules: normRules,
    /* CRUD */
    create: create,
    read: read,
    list: list,
    edit: edit,
    remove: remove,
    /* 診断 */
    selfCheck: selfCheck,
    state: function(){
      return { off: off(), metaKey: META_KEY, keyPrefix: KEY_PREFIX, schemaVersion: SCHEMA_VERSION,
               minStoryIdLen: MIN_STORY_ID_LEN, maxKeyRun: MAX_RUN, maxIdTries: MAX_ID_TRIES,
               startRulesMaxCodePoints: START_RULES_MAX_CP,
               genderValues: GENDER_VALUES.slice(), readSchemaVersions: READ_SCHEMA_VERSIONS.slice(),
               whitelist: { top: TOP_FIELDS.slice(), scene: SCENE_FIELDS.slice(), hero: HERO_FIELDS.slice(),
                            npc: NPC_FIELDS.slice(), meta: META_FIELDS.slice() },
               uiWired: false, indexLoaded: false };
    }
  };
  try { console.log(TAG, 'loaded (store only; not wired to any UI)'); } catch(e){}
})();
