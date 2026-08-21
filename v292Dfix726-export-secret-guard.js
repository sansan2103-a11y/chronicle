// =====================================================================
// Chronicle v292Dfix726: EXPORT-COPY SECRET GUARD（RULING48）
// ---------------------------------------------------------------------
// ■これは何か
//   「端末から持ち出される控え（portable backup / slot JSON）」から、
//   認証情報と鍵欄だけを落とすための **判断だけを持つ**小さな module。
//
//   RULING48 §1-3 の HYBRID 方針:
//     POLICY / SANITIZATION        = この module（唯一の authority）
//     EXPORT TRIGGER / DOWNLOAD UX = 既存の HOME exportAll() / features exportCurrent()
//   既存 export 関数を外から wrap して乗っ取ることは **しない**。
//   呼び出し側が payload を作った直後に、ここを 1 回呼ぶ。
//
// ■絶対にやらないこと（STOP 条件 §31 に対応）
//   ・live localStorage を読む以外のことをしない（setItem / removeItem を 1 回も呼ばない）
//   ・runtime S.cfg を書き換えない
//   ・snapshot / backup family を丸ごと落とさない（§13: 復旧資産は残す）
//   ・unknown blob を汎用 recursive walker で無差別に書き換えない（§12: KNOWN SCHEMA ONLY）
//   ・sanitize できない known story body を raw のまま通さない（§20: FAIL CLOSED）
//
// ■除去対象
//   top-level key（§5・§27）:
//     v292ProxyPass / v292GoogleToken / v292ProxyUrl
//     v292Dfix702_storyAuth … cloud authority の last-known cache（正本ではない / fresh getstory で再取得可能）
//   story body の cfg（§7）:
//     key / naiKey / orKey / pollKey を **値に関係なく** 4 field とも除去。
//     PUBLIC SENTINEL '__proxy__' も落とす（proxy 運用なら fix247 が runtime へ再生成する）。
//
// ■export に残すもの
//   v292Dfix399_imgKeys … IndexedDB 画像キー名の期待集合（自己修復の基準）。credential ではない。
//   snapshot / backup 本体 / turns / cast / scene / mode / secret 以外の cfg。
//
// 検証口: window.__v292Dfix726 = { BUILD, off, on, status, classifyKey, isStoryBodyLike,
//                                  sanitizeStoryBody, sanitizeDeviceBackupMap, sanitizeStoryExport, selfTest }
// kill switch: localStorage v292Dfix726Off='1'（既定 ON）
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix726) return;
  var TAG = '[v292Dfix726:export-secret-guard]';
  var BUILD = 'fix726';

  /* ★read 専用。この module は localStorage へ 1 バイトも書かない。 */
  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix726Off') === '1'; }
  function on(){ return !off(); }

  /* ---- 契約定数 ---- */
  var SECRET_FIELDS = ['key', 'naiKey', 'orKey', 'pollKey'];
  var TOPLEVEL_OMIT = ['v292ProxyPass', 'v292GoogleToken', 'v292ProxyUrl', 'v292Dfix702_storyAuth'];
  var STORY_FIELDS  = ['cfg', 'cast', 'scene', 'turns', 'mode'];

  /* known story family（§12）。ここに載っていない key の中身は触らない。 */
  var FAM_DEFAULT_SLOT = /^chr6$/;
  var FAM_NAMED_SLOT   = /^chr6_slot_/;
  var FAM_SNAP_INDEX   = /^chr6_snap_/;      /* snapshot index（parts 表） */
  var FAM_SNAP_PART    = /^chr6_snapd_/;     /* snapshot part（story body のことがある） */
  var FAM_BACKUP       = /^chr6_bk/;         /* 世代バックアップ */

  function classifyKey(k){
    if (typeof k !== 'string') return 'UNKNOWN';
    if (TOPLEVEL_OMIT.indexOf(k) >= 0) return 'AUTH_OR_OWNER_CONTROL';
    if (FAM_DEFAULT_SLOT.test(k)) return 'STORY_DEFAULT_SLOT';
    if (FAM_NAMED_SLOT.test(k))   return 'STORY_NAMED_SLOT';
    if (FAM_SNAP_PART.test(k))    return 'SNAPSHOT_PART';
    if (FAM_SNAP_INDEX.test(k))   return 'SNAPSHOT_INDEX';
    if (FAM_BACKUP.test(k))       return 'HISTORICAL_BACKUP';
    return 'OTHER';
  }
  /* この family は「必ず story body として parse できる」ことを要求する（§20 FAIL CLOSED）。 */
  function isStrictStoryFamily(fam){
    return fam === 'STORY_DEFAULT_SLOT' || fam === 'STORY_NAMED_SLOT';
  }
  /* この family は「secret field 名を含むなら parse できなければならない」。 */
  function isSecretBearingFamily(fam){
    return isStrictStoryFamily(fam) || fam === 'SNAPSHOT_PART'
        || fam === 'SNAPSHOT_INDEX' || fam === 'HISTORICAL_BACKUP';
  }

  function isPlainObject(o){
    return !!o && typeof o === 'object' && !Array.isArray(o);
  }
  /* KNOWN SCHEMA 判定: story body は {cfg,cast,scene,turns,mode} を root に持つ平坦な形。 */
  function isStoryBodyLike(o){
    if (!isPlainObject(o)) return false;
    var n = 0;
    for (var i = 0; i < STORY_FIELDS.length; i++){
      if (Object.prototype.hasOwnProperty.call(o, STORY_FIELDS[i])) n++;
    }
    return n >= 1 && (Object.prototype.hasOwnProperty.call(o, 'cfg') || n >= 2);
  }
  /* raw 文字列が secret field 名を含むか（値は見ない。token の有無だけ）。 */
  function mentionsSecretField(raw){
    if (typeof raw !== 'string') return false;
    for (var i = 0; i < SECRET_FIELDS.length; i++){
      /* nested JSON string 内では \"orKey\" の形で現れるので両方見る。 */
      if (raw.indexOf('"' + SECRET_FIELDS[i] + '"') >= 0) return true;
      if (raw.indexOf('\\"' + SECRET_FIELDS[i] + '\\"') >= 0) return true;
    }
    return false;
  }

  /* ---- story body の sanitize（copy に対してのみ） ----
     戻り値 { ok, value, removed } / value は **新しい object**。入力は変更しない。 */
  function sanitizeStoryBody(body){
    if (!isPlainObject(body)) return { ok: false, value: null, removed: 0, error: 'NOT_OBJECT' };
    var copy;
    try { copy = JSON.parse(JSON.stringify(body)); }
    catch(e){ return { ok: false, value: null, removed: 0, error: 'CLONE_FAILED' }; }
    var removed = 0;
    if (isPlainObject(copy.cfg)){
      for (var i = 0; i < SECRET_FIELDS.length; i++){
        var f = SECRET_FIELDS[i];
        if (Object.prototype.hasOwnProperty.call(copy.cfg, f)){ delete copy.cfg[f]; removed++; }
      }
    }
    return { ok: true, value: copy, removed: removed };
  }

  /* ---- INDEX slot export（features.js exportCurrent）用 ----
     payload = { _meta, cfg, cast, scene, turns, mode }（cfg は runtime S.cfg 参照のことがある）。
     runtime を変更せず、export copy から secret4 を落とす。 */
  function sanitizeStoryExport(payload){
    if (!isPlainObject(payload)) return { ok: false, payload: null, removed: 0, error: 'NOT_OBJECT' };
    var copy;
    try { copy = JSON.parse(JSON.stringify(payload)); }
    catch(e){ return { ok: false, payload: null, removed: 0, error: 'CLONE_FAILED' }; }
    var removed = 0;
    if (isPlainObject(copy.cfg)){
      for (var i = 0; i < SECRET_FIELDS.length; i++){
        var f = SECRET_FIELDS[i];
        if (Object.prototype.hasOwnProperty.call(copy.cfg, f)){ delete copy.cfg[f]; removed++; }
      }
    }
    return { ok: true, payload: copy, removed: removed };
  }

  /* ---- HOME device backup（home.html exportAll）用 ----
     入力: { key: rawString } の平坦 map（localStorage の detached copy）。
     出力: { ok, map, stats, error, failedKey }
     ・TOPLEVEL_OMIT は key ごと落とす
     ・known story family は parse → story body なら secret4 を除去 → 再 stringify
     ・parse できず、かつ secret field 名を含む known family は FAIL CLOSED（§20）
     ・それ以外の key は素通し（§12 KNOWN SCHEMA ONLY）
     ・live localStorage には触らない */
  function sanitizeDeviceBackupMap(map){
    if (!isPlainObject(map)) return { ok: false, map: null, error: 'NOT_OBJECT' };
    var out = {};
    var stats = { total: 0, omittedTopLevel: 0, sanitizedBodies: 0, secretFieldsRemoved: 0, passedThrough: 0 };
    var keys = Object.keys(map);
    for (var i = 0; i < keys.length; i++){
      var k = keys[i], raw = map[k];
      stats.total++;
      var fam = classifyKey(k);

      if (fam === 'AUTH_OR_OWNER_CONTROL'){ stats.omittedTopLevel++; continue; }

      if (typeof raw !== 'string'){ out[k] = raw; stats.passedThrough++; continue; }

      if (!isSecretBearingFamily(fam)){ out[k] = raw; stats.passedThrough++; continue; }

      var parsed = null, parseOk = true;
      try { parsed = JSON.parse(raw); } catch(e){ parseOk = false; }

      if (!parseOk){
        /* ★FAIL CLOSED: story slot は必ず parse できなければならない。
           snapshot/backup は raw が secret field 名を含むときだけ必須。 */
        if (isStrictStoryFamily(fam) || mentionsSecretField(raw)){
          return { ok: false, map: null, error: 'UNPARSEABLE_KNOWN_STORY_BLOB', failedKey: k, family: fam };
        }
        out[k] = raw; stats.passedThrough++; continue;
      }

      if (isStoryBodyLike(parsed)){
        var r = sanitizeStoryBody(parsed);
        if (!r.ok) return { ok: false, map: null, error: 'STORY_BODY_SANITIZE_FAILED', failedKey: k, family: fam };
        var s;
        try { s = JSON.stringify(r.value); }
        catch(e){ return { ok: false, map: null, error: 'RESTRINGIFY_FAILED', failedKey: k, family: fam }; }
        out[k] = s;
        stats.sanitizedBodies++;
        stats.secretFieldsRemoved += r.removed;
        continue;
      }

      /* story body ではない known family（snapshot index 等）。
         ただし raw が secret field 名を含むなら、想定外の schema なので通さない。 */
      if (mentionsSecretField(raw)){
        return { ok: false, map: null, error: 'SECRET_FIELD_IN_UNRECOGNIZED_SCHEMA', failedKey: k, family: fam };
      }
      out[k] = raw; stats.passedThrough++;
    }
    return { ok: true, map: out, stats: stats };
  }

  /* ---- restore/import 側（fix721 が story body を採用するときに呼ぶ） ----
     IMPORT COPY からのみ secret4 を落とす（§16 RESTORE INPUT SANITIZATION ONLY）。
     既存 local story / runtime S.cfg には触れない。 */
  function sanitizeImportedStoryRaw(raw){
    if (typeof raw !== 'string') return { ok: false, value: null, removed: 0, error: 'NOT_STRING' };
    var parsed = null;
    try { parsed = JSON.parse(raw); } catch(e){ return { ok: false, value: null, removed: 0, error: 'UNPARSEABLE' }; }
    if (!isStoryBodyLike(parsed)) return { ok: true, value: raw, removed: 0, note: 'NOT_STORY_BODY' };
    var r = sanitizeStoryBody(parsed);
    if (!r.ok) return { ok: false, value: null, removed: 0, error: r.error };
    var s;
    try { s = JSON.stringify(r.value); } catch(e){ return { ok: false, value: null, removed: 0, error: 'RESTRINGIFY_FAILED' }; }
    return { ok: true, value: s, removed: r.removed };
  }

  /* ---- 出力 invariant の自己検査（§22）。download 前に呼ぶ。 ---- */
  function verifyExportText(text){
    if (typeof text !== 'string') return { ok: false, error: 'NOT_STRING' };
    /* ★nested JSON string の中では "orKey" が \"orKey\" として現れる。両形を見る。 */
    function present(name){
      return text.indexOf('"' + name + '"') >= 0 || text.indexOf('\\"' + name + '\\"') >= 0;
    }
    var bad = [];
    for (var i = 0; i < TOPLEVEL_OMIT.length; i++){
      if (present(TOPLEVEL_OMIT[i])) bad.push(TOPLEVEL_OMIT[i]);
    }
    for (var j = 0; j < SECRET_FIELDS.length; j++){
      if (present(SECRET_FIELDS[j])) bad.push('cfg.' + SECRET_FIELDS[j]);
    }
    return bad.length ? { ok: false, error: 'INVARIANT_VIOLATION', found: bad } : { ok: true };
  }

  window.__v292Dfix726 = {
    __armed: true,
    BUILD: BUILD,
    off: off, on: on,
    SECRET_FIELDS: SECRET_FIELDS.slice(),
    TOPLEVEL_OMIT: TOPLEVEL_OMIT.slice(),
    status: function(){ return { build: BUILD, on: on(),
      secretFields: SECRET_FIELDS.slice(), topLevelOmit: TOPLEVEL_OMIT.slice() }; },
    classifyKey: classifyKey,
    isStoryBodyLike: isStoryBodyLike,
    sanitizeStoryBody: sanitizeStoryBody,
    sanitizeStoryExport: sanitizeStoryExport,
    sanitizeDeviceBackupMap: sanitizeDeviceBackupMap,
    sanitizeImportedStoryRaw: sanitizeImportedStoryRaw,
    verifyExportText: verifyExportText
  };
  try { console.log(TAG, 'loaded (export-copy only / no localStorage write / default ON / kill=v292Dfix726Off=1)'); } catch(e){}
})();
