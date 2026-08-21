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
  var BUILD = 'fix728';

  /* ★read 専用。この module は localStorage へ 1 バイトも書かない。 */
  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix726Off') === '1'; }
  function on(){ return !off(); }

  /* ---- 契約定数 ---- */
  var SECRET_FIELDS = ['key', 'naiKey', 'orKey', 'pollKey'];
  var TOPLEVEL_OMIT = ['v292ProxyPass', 'v292GoogleToken', 'v292ProxyUrl', 'v292Dfix702_storyAuth'];

  /* ★★fix728(RULING52 §1-§9): DIAGNOSTIC_RUNTIME_LOG != PORTABLE USER BACKUP。
     診断・trace・refusal・dropped-event の記録は、story でも snapshot 復旧資産でも
     ユーザー設定でも画像資産でもなく、別端末へ持ち出す復旧価値が 0。
     しかも内部の localStorage キー名を 'key' field に持つため、
     unknown key ambiguity（§7 の tripwire）を無用に増やす。よって export copy から落とす。

     ★EXACT KEY LIST ONLY（§4-§5）。prefix / regex による一般化は禁止。
     「log」「trace」「dropped」という語だけでは semantic authority を保証できず、
     将来そこに user data を持つ key が現れたときに、物語や復旧資産を
     誤って backup から消してしまう方が危険なため。
     未登録の新しい診断風 key は通常分類へ回す。unknown key tripwire に当たって
     FAIL CLOSED したら、そこで role を read-only trace してこの表へ足すか
     known schema を足すか判断する（= EXPECTED FAIL-CLOSED DISCOVERY PATH / §6）。

     ★これは fix721 の deny を流用したものではない（§3）。
     「復旧資産でない / 再生成される / portability 価値 0 / key ambiguity を持つ」
     という export 側独自の理由による。 */
  var DIAGNOSTIC_OMIT = ['v292Dfix651Trace', 'v292Dfix587_refusals',
                         'v292Dfix515log', 'v292Dfix490_dropped'];
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
    if (DIAGNOSTIC_OMIT.indexOf(k) >= 0) return 'DIAGNOSTIC_RUNTIME_LOG';
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

  /* =========================================================================
     ★★fix727 追加: 実データに存在した「story body ではないが secret4 を抱える」
     3 スキーマを **明示的に**登録する。generic recursive walker にはしない（§31）。

       SCHEMA_UNDO_RING  : ARRAY<{t,turns,data}>      data が story body の JSON 文字列
                           （fix302 系の巻き戻しリング。実データで secret4 を保持していた）
       SCHEMA_KEYED_BLOB : {key, blob, ts}            blob が story body の JSON 文字列
                           （chr6_bk_fix409_*。key は **localStorage のキー名**であって credential ではない）
       SCHEMA_SLOT_META  : ARRAY<{id,name,key,updatedAt}>
                           （chr6_bk_home_meta_*。key は キー名。secret ではないので素通し）

     いずれも「形が完全に一致したときだけ」処理する。1 要素でも形が違えば非該当とし、
     従来どおり mentionsSecretField による FAIL CLOSED へ落ちる。
     ========================================================================= */
  function allElements(a, pred){
    if (!Array.isArray(a) || !a.length) return false;
    for (var i = 0; i < a.length; i++){ if (!pred(a[i])) return false; }
    return true;
  }
  function hasExactKeys(o, names){
    if (!isPlainObject(o)) return false;
    var ks = Object.keys(o);
    if (ks.length !== names.length) return false;
    for (var i = 0; i < names.length; i++){
      if (!Object.prototype.hasOwnProperty.call(o, names[i])) return false;
    }
    return true;
  }
  function isUndoRing(v){
    return allElements(v, function(e){
      return hasExactKeys(e, ['t', 'turns', 'data']) && typeof e.data === 'string';
    });
  }
  function isKeyedBlob(v){
    return hasExactKeys(v, ['key', 'blob', 'ts'])
        && typeof v.key === 'string' && typeof v.blob === 'string';
  }
  /* SCHEMA_SLOT_META: HOME の story 一覧 metadata。実データでは 8 通りの field 組み合わせがあり、
     exact key set では表現できない。そこで RULING51 §1-§2 の 4 条件で定義する。

       ① ARRAY であり、全 item が plain object
       ② 全 item が id を持つ
       ③ 全 property 名が META_FIELD_TYPES の allowlist 内、かつ **型も実測 domain 内**
       ④ story-bearing field（cfg / body / blob / data）を 1 つも持たない

     naiKey / orKey / pollKey は allowlist に無いので、この形が BYOK credential を
     抱えることは構造上ありえない。'key' はこの schema でのみ storage pointer metadata として扱う。
     型まで一致しない場合は SLOT_META として認識せず、unknown 経路（＝tripwire）へ戻す。 */
  var META_FIELD_TYPES = {
    id:                 ['string'],
    name:               ['string'],
    title:              ['string'],
    key:                ['string'],
    summary:            ['string'],
    deleteOpId:         ['string'],
    recoverySnapshotId: ['string'],
    lastOpenedAt:       ['string'],
    createdAt:          ['string', 'number'],
    updatedAt:          ['string', 'number', 'null'],
    deletedAt:          ['number'],
    lifecycleVersion:   ['number'],
    turns:              ['number'],
    canary:             ['boolean'],
    deleted:            ['boolean']
  };
  /* この 4 つのいずれかを持つ item は story を運びうるので metadata 扱いしない。 */
  var STORY_BEARING_FIELDS = ['cfg', 'body', 'blob', 'data'];

  function typeTag(v){
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
  }
  function isStoryMetaRecord(e){
    if (!isPlainObject(e)) return false;
    if (!Object.prototype.hasOwnProperty.call(e, 'id')) return false;
    for (var b = 0; b < STORY_BEARING_FIELDS.length; b++){
      if (Object.prototype.hasOwnProperty.call(e, STORY_BEARING_FIELDS[b])) return false;
    }
    var ks = Object.keys(e);
    for (var i = 0; i < ks.length; i++){
      var allowed = META_FIELD_TYPES[ks[i]];
      if (!allowed) return false;                          /* 未知の field 名 */
      if (allowed.indexOf(typeTag(e[ks[i]])) < 0) return false;  /* 既知 domain 外の型 */
    }
    return true;
  }
  function isSlotMetaList(v){
    return allElements(v, isStoryMetaRecord);
  }

  /* ★★fix728(RULING51 §4-§6): parse 済み UNKNOWN payload の structural tripwire。
     own-property 'key' を持つ UNKNOWN object / UNKNOWN array item は raw export させない。
     mutation しない / story と推測して sanitize しない / 無制限 recursive traversal もしない。
     見るのは root object と array の direct item だけ。
     例外は明示認識済みの SCHEMA_SLOT_META / SCHEMA_KEYED_BLOB のみ（呼び出し順で保証）。 */
  function unknownHasKeyProperty(parsed){
    if (isPlainObject(parsed)){
      return Object.prototype.hasOwnProperty.call(parsed, 'key');
    }
    if (Array.isArray(parsed)){
      for (var i = 0; i < parsed.length; i++){
        if (isPlainObject(parsed[i]) && Object.prototype.hasOwnProperty.call(parsed[i], 'key')) return true;
      }
      return false;
    }
    return false;
  }

  /* 登録済みスキーマなら sanitize 結果を返す。非該当なら null（＝呼び出し側で FAIL CLOSED 判定）。 */
  function sanitizeKnownContainer(parsed){
    if (isUndoRing(parsed)){
      var ring = [], nr = 0;
      for (var i = 0; i < parsed.length; i++){
        var e = parsed[i];
        var r = sanitizeImportedStoryRaw(e.data);
        if (!r.ok) return { ok: false, schema: 'SCHEMA_UNDO_RING', error: r.error, index: i };
        ring.push({ t: e.t, turns: e.turns, data: r.value });
        nr += (r.removed || 0);
      }
      return { ok: true, schema: 'SCHEMA_UNDO_RING', value: ring, removed: nr };
    }
    if (isKeyedBlob(parsed)){
      var rb = sanitizeImportedStoryRaw(parsed.blob);
      if (!rb.ok) return { ok: false, schema: 'SCHEMA_KEYED_BLOB', error: rb.error };
      /* key は localStorage のキー名。触らない。 */
      return { ok: true, schema: 'SCHEMA_KEYED_BLOB',
               value: { key: parsed.key, blob: rb.value, ts: parsed.ts }, removed: rb.removed || 0 };
    }
    if (isSlotMetaList(parsed)){
      /* この 'key' はキー名。credential ではないので何も落とさない。 */
      return { ok: true, schema: 'SCHEMA_SLOT_META', value: parsed, removed: 0 };
    }
    return null;
  }

  /* ★★fix727(RULING50 §5・§7): UNKNOWN payload に対する tripwire。
     - naiKey / orKey / pollKey は一般的な field 名ではないので、どの family でも即 FAIL CLOSED。
     - 'key' は SCHEMA_SLOT_META / SCHEMA_KEYED_BLOB では storage pointer metadata として正当に現れ、
       アプリ全体でも一般語なので、story を抱えうる family の unknown payload に限って引き金にする。
       （「property 名が key なら secret ではない」という一般ルールにはしない。§5） */
  var UNAMBIGUOUS_SECRET_FIELDS = ['naiKey', 'orKey', 'pollKey'];
  function nameAppears(raw, n){
    return raw.indexOf('"' + n + '"') >= 0 || raw.indexOf('\\"' + n + '\\"') >= 0;
  }
  /* ★fix728(RULING51 §7): textual safety net は naiKey / orKey / pollKey の
     **token presence** のみを見る。引用符形式に依存せず plain token として検出するので、
     通常の JSON property も escaped nested JSON property も同じ 1 本で拾える。
     'key' はここでは見ない（authority は structural layer + unknownHasKeyProperty）。 */
  function tokenAppears(raw, n){
    var i = raw.indexOf(n);
    while (i >= 0){
      var before = i === 0 ? '' : raw.charAt(i - 1);
      var after  = raw.charAt(i + n.length);
      var wordish = /[A-Za-z0-9_$]/;
      if (!wordish.test(before) && !wordish.test(after)) return true;
      i = raw.indexOf(n, i + 1);
    }
    return false;
  }
  function tripwire(raw, fam){
    if (typeof raw !== 'string') return false;
    for (var i = 0; i < UNAMBIGUOUS_SECRET_FIELDS.length; i++){
      if (tokenAppears(raw, UNAMBIGUOUS_SECRET_FIELDS[i])) return true;
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
    var stats = { total: 0, omittedTopLevel: 0, omittedDiagnostic: 0, sanitizedBodies: 0,
                  secretFieldsRemoved: 0, passedThrough: 0, containers: {} };
    var keys = Object.keys(map);
    for (var i = 0; i < keys.length; i++){
      var k = keys[i], raw = map[k];
      stats.total++;
      var fam = classifyKey(k);

      /* ①-a TOPLEVEL_SECURITY_OMIT（§8） */
      if (fam === 'AUTH_OR_OWNER_CONTROL'){ stats.omittedTopLevel++; continue; }

      /* ①-b TOPLEVEL_DIAGNOSTIC_OMIT（§8）。
         export 対象ではないので parse も secret 判定もしない。 */
      if (fam === 'DIAGNOSTIC_RUNTIME_LOG'){ stats.omittedDiagnostic++; continue; }

      if (typeof raw !== 'string'){ out[k] = raw; stats.passedThrough++; continue; }

      /* ② ★★fix727(RULING50 §2): PAYLOAD SHAPE CLASSIFICATION。
         family 名で handler を決めない。実 production では story body が
         __undo_swap_chr6 / chr6_broken_* / "undefined" など family regex の外にも存在した。
         したがって「parse できた値の形」で判定する。 */
      var parsed = null, parseOk = true;
      try { parsed = JSON.parse(raw); } catch(e){ parseOk = false; }

      if (!parseOk){
        /* story slot family は必ず parse できなければならない（§20 FAIL CLOSED）。
           それ以外は unknown payload として ③ の tripwire へ。 */
        if (isStrictStoryFamily(fam)){
          return { ok: false, map: null, error: 'UNPARSEABLE_KNOWN_STORY_BLOB', failedKey: k, family: fam };
        }
        if (tripwire(raw, fam)){
          return { ok: false, map: null, error: 'UNPARSEABLE_SECRET_BEARING_BLOB', failedKey: k, family: fam };
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

      var kc = sanitizeKnownContainer(parsed);
      if (kc){
        if (!kc.ok){
          return { ok: false, map: null, error: 'KNOWN_CONTAINER_SANITIZE_FAILED',
                   failedKey: k, family: fam, schema: kc.schema, detail: kc.error };
        }
        var ks;
        try { ks = JSON.stringify(kc.value); }
        catch(e){ return { ok: false, map: null, error: 'RESTRINGIFY_FAILED', failedKey: k, family: fam }; }
        out[k] = ks;
        stats.sanitizedBodies++;
        stats.secretFieldsRemoved += kc.removed;
        stats.containers[kc.schema] = (stats.containers[kc.schema] || 0) + 1;
        continue;
      }

      /* ③ ここへ来た値だけが UNKNOWN。tripwire は sanitizer ではなく
         「raw のまま export してよいか」の関門としてのみ使う（§7）。 */
      if (tripwire(raw, fam)){
        return { ok: false, map: null, error: 'SECRET_FIELD_IN_UNRECOGNIZED_SCHEMA', failedKey: k, family: fam };
      }
      /* ★★fix728(RULING51 §4-§5): UNKNOWN な object / array item が own-property 'key' を
         持つなら、それが credential なのか storage pointer なのか判定できない。
         判定できないものを raw で持ち出さない。例外は上で既に認識済みの
         SCHEMA_SLOT_META / SCHEMA_KEYED_BLOB だけ（この行には到達しない）。 */
      if (unknownHasKeyProperty(parsed)){
        return { ok: false, map: null, error: 'UNKNOWN_KEY_PROPERTY', failedKey: k, family: fam };
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

  /* ---- 出力 invariant の自己検査（§22）。download 前に呼ぶ。 ----
     ★fix727: 'key' は SCHEMA_KEYED_BLOB / SCHEMA_SLOT_META では **localStorage のキー名**として
     正当に出現する。素の文字列走査だと必ず誤検知するため、2 層で見る。

       層1 STRUCTURAL … export text を parse し、既知スキーマ経由で到達できる
                        すべての cfg object に secret4 が無いことを確認する（authoritative）。
       層2 TEXTUAL    … naiKey / orKey / pollKey は一般的な field 名として使われないので
                        文字列走査も併用する（未知の隠れ場所に対する保険）。
                        'key' は曖昧なので層2 では見ない。層1 と sanitizer 側の
                        FAIL CLOSED（未知スキーマ + secret field 名）で塞ぐ。 */
  var UNAMBIGUOUS_SECRETS = ['naiKey', 'orKey', 'pollKey'];

  /* 既知スキーマだけを辿って cfg を集める。汎用 walker ではない。 */
  function collectCfgs(parsed, sink, depth){
    if (depth > 3) return;
    if (isStoryBodyLike(parsed)){
      if (isPlainObject(parsed.cfg)) sink.push(parsed.cfg);
      return;
    }
    if (isUndoRing(parsed)){
      for (var i = 0; i < parsed.length; i++) collectCfgs(parseMaybe(parsed[i].data), sink, depth + 1);
      return;
    }
    if (isKeyedBlob(parsed)){ collectCfgs(parseMaybe(parsed.blob), sink, depth + 1); return; }
    /* SCHEMA_SLOT_META には cfg が無い。それ以外の形は辿らない。 */
  }
  function parseMaybe(v){
    if (typeof v !== 'string') return v;
    try { return JSON.parse(v); } catch(e){ return null; }
  }

  function verifyExportText(text){
    if (typeof text !== 'string') return { ok: false, error: 'NOT_STRING' };
    var bad = [];

    /* --- 層1 STRUCTURAL --- */
    var doc = parseMaybe(text);
    if (doc === null) return { ok: false, error: 'EXPORT_TEXT_UNPARSEABLE' };
    var ls = (isPlainObject(doc) && isPlainObject(doc.ls)) ? doc.ls : (isPlainObject(doc) ? doc : null);
    if (ls === null) return { ok: false, error: 'EXPORT_SHAPE_UNEXPECTED' };

    for (var a = 0; a < TOPLEVEL_OMIT.length; a++){
      if (Object.prototype.hasOwnProperty.call(ls, TOPLEVEL_OMIT[a])) bad.push(TOPLEVEL_OMIT[a]);
    }
    for (var a2 = 0; a2 < DIAGNOSTIC_OMIT.length; a2++){
      if (Object.prototype.hasOwnProperty.call(ls, DIAGNOSTIC_OMIT[a2])) bad.push('diag:' + DIAGNOSTIC_OMIT[a2]);
    }
    var cfgs = [], lsKeys = Object.keys(ls);
    for (var b = 0; b < lsKeys.length; b++){
      collectCfgs(parseMaybe(ls[lsKeys[b]]), cfgs, 0);
    }
    /* INDEX export（payload 直）も同じ関数で検査できるようにする。 */
    if (isPlainObject(doc) && isPlainObject(doc.cfg)) cfgs.push(doc.cfg);
    for (var c = 0; c < cfgs.length; c++){
      for (var d = 0; d < SECRET_FIELDS.length; d++){
        if (Object.prototype.hasOwnProperty.call(cfgs[c], SECRET_FIELDS[d])) bad.push('cfg.' + SECRET_FIELDS[d]);
      }
    }

    /* --- 層2 TEXTUAL SAFETY NET（曖昧でない 3 つを token として検出） --- */
    for (var e = 0; e < UNAMBIGUOUS_SECRETS.length; e++){
      var n = UNAMBIGUOUS_SECRETS[e];
      if (tokenAppears(text, n)) bad.push('text:' + n);
    }

    /* 重複除去 */
    var uniq = [];
    for (var f = 0; f < bad.length; f++){ if (uniq.indexOf(bad[f]) < 0) uniq.push(bad[f]); }
    return uniq.length ? { ok: false, error: 'INVARIANT_VIOLATION', found: uniq,
                           cfgsChecked: cfgs.length } : { ok: true, cfgsChecked: cfgs.length };
  }

  window.__v292Dfix726 = {
    __armed: true,
    BUILD: BUILD,
    off: off, on: on,
    SECRET_FIELDS: SECRET_FIELDS.slice(),
    TOPLEVEL_OMIT: TOPLEVEL_OMIT.slice(),
    DIAGNOSTIC_OMIT: DIAGNOSTIC_OMIT.slice(),
    status: function(){ return { build: BUILD, on: on(),
      secretFields: SECRET_FIELDS.slice(), topLevelOmit: TOPLEVEL_OMIT.slice(),
      diagnosticOmit: DIAGNOSTIC_OMIT.slice() }; },
    classifyKey: classifyKey,
    isStoryBodyLike: isStoryBodyLike,
    sanitizeStoryBody: sanitizeStoryBody,
    sanitizeStoryExport: sanitizeStoryExport,
    sanitizeDeviceBackupMap: sanitizeDeviceBackupMap,
    sanitizeImportedStoryRaw: sanitizeImportedStoryRaw,
    sanitizeKnownContainer: sanitizeKnownContainer,
    tripwire: tripwire,
    tokenAppears: tokenAppears,
    unknownHasKeyProperty: unknownHasKeyProperty,
    verifyExportText: verifyExportText
  };
  try { console.log(TAG, 'loaded (export-copy only / no localStorage write / default ON / kill=v292Dfix726Off=1)'); } catch(e){}
})();
