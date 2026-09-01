/* =====================================================================
 * v292Dfix670-memory-engine.js — Memory Engine v0.3 / Phase 3A-1 Shadow
 * ---------------------------------------------------------------------
 * ■何をするか
 *   採用済みターンから「世界の事実の候補」を決定的ルールだけで抽出し、
 *   端末ローカルの IndexedDB へ shadow 記録する。**物語生成には一切使わない。**
 *
 * ■絶対にやらないこと（おしん指定）
 *   ・物語生成へ注入しない（Retrieval なし）
 *   ・fix77 / fix190 / cast / キャラ一覧を更新しない（読むだけ）
 *   ・fix135(longmem) / fix192 / fix105 / longmem 保存データへ触れない
 *   ・localStorage へ Memory 本体を書かない（フォールバックもしない）
 *   ・同期(fix399/fix402)・Worker・P0・fix666/fix667 へ触れない
 *   ・alias を自動統合しない。既知でない entity を正規 Entity へ昇格しない
 *   ・未知名詞句を Entity 化しない（missingArguments へ記録するだけ）
 *   ・孤児を自動削除しない
 *   ・extractorVersion 不一致 slot へ追記しない（自動再処理もしない）
 *   ・保存・描画・同期を止めない（失敗は必ず fail-open）
 *
 * ■v0.2 での変更（おしん監査 2026-08-03 の7件）
 *   1. SAY / 引用内を World Truth にしない
 *      - inputType==='SAY' の playerText は抽出対象から完全に外す
 *      - 抽出前に <say>...</say> / 「...」 / 『...』 を全マスク
 *      - 引用の中身は Phase 1 では保存しない（evidence もマスク後の文字列）
 *   2. Event と Candidate を1本にまとめ、
 *      span → type → subject → object → recordKind で全体 sort してから
 *      ordinal を一度だけ振る。eventId にも recordKind を含める。
 *   3. IDB commit は「cursor 削除完了 → Entity put → Event put → chain put」。
 *      cursor が null になったときだけ insertAndWriteChain() を1回実行する。
 *   4. externalSchedule（cache 破棄・1.2秒）と internalContinue（cache 維持・idle/0ms）を分離。
 *      reconcile 終了時に pending が残っていれば必ず次回を予約する。
 *   5. counts は累積加算をやめ、起動・slot 切替・commit 後に IDB から実数を再集計。
 *      events(n) は sourceTurnIndex / spanOrder / ordinal 順で返す。
 *   6. actor / subject / target / raw mention / entityType / candidate status を保持。
 *      未知名詞句は Entity 化せず missingArguments へ記録する。
 *      fix640 等の既存候補だけ entity_candidate として entities ストアへ。
 *      cast に id があれば id を使う。同名衝突は candidate へ落とす。
 *      fix640 台帳を「既知候補」の入力として読む（読むだけ・書かない）。
 *   7. ハッシュ入力を JSON.stringify 配列に統一。
 *      folded の独自 FNV を廃止し、200 ターンごとの末尾 turnKey を checkpoint に。
 *
 * ■v0.3（Phase 3A-1 / GPT 裁定枠 2026-09-01）での変更
 *   (a) event family を **9 種で確定**させた（増やさない・何でも箱にしない）:
 *       ENTITY_FACT / RELATION_EVENT / COMMITMENT_EVENT / DISCLOSURE_CLAIM_EVENT /
 *       DISCOVERY_EVENT / UNRESOLVED_EVENT / LOCATION_STATE_EVENT /
 *       WORLD_FACT_EVENT / PERSISTENT_HARM_CONTEXT
 *       v0.2 の type 文字列は 1 つも消さず、family を **後付けの1フィールド**として被せる。
 *       各 family は「構造条件 + 最小の明示マーカー」で高 precision に。
 *       語彙辞書で網羅しない（拾えないものは拾えないでよい＝Gold Set で測る）。
 *   (a') fix190 との責務分離: 現在の傷/関係の state は **fix190 が authority**。
 *       ME は経緯・原因・変化の出来事・背景だけを持ち、state を1バイトも複製しない
 *       （PERSISTENT_HARM_CONTEXT / RELATION_EVENT に stateAuthority:'fix190' を明記）。
 *   (b) 4C entityId 結線。解決の優先順は
 *       ① structured speaker/entity ID（SAY カード / <say who> 由来の _convSays.who）
 *       ② 既存 entityId（cast id / char:npc:<name>）
 *       ③ fix764 fold + fix197 canonName の**安全な**正名別名
 *       ④ 一意に証明できる contextual alias（「Xの声」→ X の発話表現）
 *       代名詞（彼/彼女/あの人…）は structured metadata か一意 context が無い限り
 *       **絶対に解決しない**（entityId=null / unresolved）。誤結合より未解決を採る。
 *   (c) SAY 全マスクの解除 = Speech Act モデル（(i)+(iii) hybrid）。
 *       発話は「世界の事実」ではなく「発話行為」として保存する:
 *         { kind, speakerEntityId, addresseeEntityIds, normalizedProposition,
 *           sourceTurn, sourceMode:'DIALOGUE', epistemic }
 *       ★raw 台詞は保存しない（normalizedProposition は短い正規化文・上限 64 字・
 *         引用符とタグは落とす・発話行為マーカーは kind が持つので命題から外す）。
 *       ★claim を WORLD_FACT へ昇格しない。真偽結合は 3A-2 の責務。
 *       ★speaker は structured who だけ。取れない発話は speaker:null=UNRESOLVED に留める。
 *       ★地の文の引用マスク（v0.2 監査1）は**そのまま維持**する。発話は
 *         product 側の構造化済み say カード（turn._convSays / SAY 入力）からだけ読む。
 *   (d) Knowledge Ownership 最小: Speech Act 系にだけ knownTo=[speaker, 明示 addressee]。
 *       「その場にいた」自動追加は禁止。不明 audience は UNKNOWN のまま。
 *       地の文由来は knownTo を持たない（scope 未主張）。
 *   (e) turnKey の入力に say カード（who/say）を含めた。抽出が読むものは全部
 *       内容アドレスに入っている、という v0.2 の不変条件を保つため。
 *       ★これにより v0.2 の chain とは鍵が変わる。extractorVersion 不一致 slot へは
 *         従来どおり追記せず、**.rebuild() で作り直す**（自動再処理はしない）。
 *
 * ■保存先
 *   IndexedDB 'chr6mem'（events / entities / chain / meta）
 *   localStorage は次の2キーだけ:
 *     v292Dfix670Off  = '1'      … 完全停止
 *     v292Dfix670stat = {...}    … 2KB 上限の観測値（slotId を含めない＝同期対象外）
 *
 * ■観測
 *   window.__v292Dfix670.status() / .selfTest() / .events(n) / .entities()
 *                        .unhandled() / .orphans() / .clearOrphans()
 *                        .rebuild() / .clear(slotId) / .reconcile() / .__test
 *
 * ■ロード位置
 *   index.html の末尾付近（UI が定義済みであればどこでもよい）。
 *   UI._renderHooks へ push するだけで、既存の何も上書きしない。
 *   ★index.html:1404 は renderAll から `hook(null)`、:1416 は appendTurn から `hook(turn)`。
 *     null = 再描画由来なので高速判定を禁止し、chain 全比較へ倒す。
 * =================================================================== */
(function () {
  'use strict';
  /* ★二重読込の防止は __loaded で行う。__armed は「この端末で起動したか」を表すので、
     未武装（opt-in していない）ときは false になる。 */
  if (window.__v292Dfix670 && window.__v292Dfix670.__loaded) return;

  var TAG = '[v292Dfix670]';
  var BUILD = '20260901-fix785';
  var SCHEMA_VERSION = 4;   /* ★v0.3: family / speechAct / knownTo / epistemic が増えた */
  var EXTRACTOR_VERSION = 'me-0.3.0';      /* ★抽出規則も鍵の作り方も変わったので上げる */
  var DB_NAME = 'chr6mem';                 /* ★chr6av(アバター)には相乗りしない */
  var DB_VER = 3;                          /* ★v0.3 で store も index も増やさない（既存の by_slot_type で足りる） */
  var OFF_KEY = 'v292Dfix670Off';          /* 緊急停止（ON より優先） */
  var ON_KEY = 'v292Dfix670On';            /* ★Canary の明示 opt-in。未設定なら何もしない */
  var STAT_KEY = 'v292Dfix670stat';        /* ★slotId を含めない＝collectLS の部分一致に当たらない */
  var STAT_MAX = 2048;
  var CHUNK = 30;                          /* 1回に処理する最大ターン数 */
  var CKPT = 200;                          /* checkpoint 間隔（末尾 turnKey を保存） */
  var UNHANDLED_MAX = 20;                  /* 1slot 最大20件 */
  var EVIDENCE_MAX = 120;
  var PROP_MAX = 64;                       /* ★normalizedProposition の上限（raw 台詞を貯めないため） */
  var SAY_MAX = 400;                       /* ★これを超える say カードは異常データとして扱わない */
  var PLACE_MAX = 24;                      /* ★場所の生 mention の上限（Entity 化はしない） */

  /* ---------- 小道具（すべて失敗しても投げない） ---------- */
  function lsg(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lss(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function off() { return lsg(OFF_KEY) === '1'; }
  function optedIn() { return lsg(ON_KEY) === '1'; }
  /* ★起動判定はこの1関数だけ。
       OFF=1                → 停止
       OFF!=1 かつ ON=1     → 起動
       それ以外             → 未武装（IDB を開かない・hook を登録しない・timer を作らない・観測値を書かない）
     OFF は毎回読むので、緊急停止はリロードなしで効く。 */
  function armed() { return !off() && optedIn(); }
  function nowMs() { try { return Date.now(); } catch (e) { return 0; } }
  function log() { try { console.warn.apply(console, [TAG].concat([].slice.call(arguments))); } catch (e) {} }

  var st = {
    build: BUILD, schemaVersion: SCHEMA_VERSION, extractorVersion: EXTRACTOR_VERSION,
    armed: false, degraded: false, reason: null, lastStop: null,
    slotId: null, turns: -1, processedCount: 0, chainKey: null,
    counts: { events: 0, candidates: 0, unhandled: 0, disputed: 0, entities: 0, entityCandidates: 0 },
    countsFresh: false,
    timings: { lastReconcileMs: 0, lastChunkTurns: 0, hashMs: 0 },
    reconciles: 0, extracts: 0, shaCalls: 0, chunks: 0, busyMs: 0, ctxRebuilds: 0, entityContextHash: null,
    prof: { resolve: 0, ctx: 0, chain: 0, keys: 0, extract: 0, ids: 0, tx: 0, counts: 0 },
    orphans: [], versionMismatch: false, rebuildRecommended: false,
    idb: { available: false, name: DB_NAME, version: DB_VER },
    crypto: false
  };
  function degrade(reason) { st.degraded = true; st.reason = String(reason || 'unknown'); }

  /* ---------- SHA-256 先頭128bit ---------- */
  function hasSubtle() {
    try { return !!(window.crypto && window.crypto.subtle && typeof window.crypto.subtle.digest === 'function'); }
    catch (e) { return false; }
  }
  st.crypto = hasSubtle();
  if (!st.crypto) degrade('no-crypto-subtle');
  /* ★R1: IndexedDB が無い環境は degraded。fail-open のまま何も書かない */
  try { if (typeof indexedDB === 'undefined' || !indexedDB) degrade('no-indexeddb'); }
  catch (e) { degrade('no-indexeddb'); }

  function h128(s) {
    st.shaCalls++;
    return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s)))
      .then(function (b) {
        var a = new Uint8Array(b), o = '';
        for (var i = 0; i < 16; i++) o += ('0' + a[i].toString(16)).slice(-2);
        return o;                                  /* 128bit / 32hex */
      });
  }
  function nfc(x) { try { return String(x == null ? '' : x).normalize('NFC').trim(); } catch (e) { return String(x == null ? '' : x).trim(); } }

  /* ★おしん指定7: 区切り文字連結ではなく JSON.stringify 配列を SHA-256 入力にする。
     配列要素の境界が JSON のエスケープで一意に決まるので、
     本文に何が入っていても隣の要素へ食い込まない。 */
  /* ★v0.3(e): 抽出は _convSays（構造化済み say カード）も読むので、
     内容アドレスにも含める。含めないと「本文が同じまま who だけ直った」ときに
     turnKey が変わらず、古い speaker のまま Event が残る（entityContextHash と同じ罠）。 */
  function sayCanon(t) {
    var a = (t && Array.isArray(t._convSays)) ? t._convSays : null;
    if (!a || !a.length) return [];
    var out = [], i, c;
    for (i = 0; i < a.length; i++) {
      c = a[i]; if (!c) continue;
      out.push([c.who == null ? null : nfc(c.who), nfc(c.say)]);
    }
    return out;
  }
  function normTurn(t) {
    return JSON.stringify([String((t && t.inputType) || ''), nfc(t && t.playerText), nfc(t && t.narrative),
                           sayCanon(t)]);
  }
  function contentHash(t) { return h128(normTurn(t)); }
  function turnKeyInput(slotId, prevKey, cHash) { return JSON.stringify([String(slotId), String(prevKey), String(cHash)]); }
  function turnKeyOf(slotId, prevKey, cHash) { return h128(turnKeyInput(slotId, prevKey, cHash)); }
  function eventIdInput(turnKey, type, subject, object, ordinal, recordKind) {
    return JSON.stringify([String(turnKey), String(type),
                           subject == null ? null : String(subject),
                           object == null ? null : String(object),
                           ordinal | 0, String(recordKind || 'event')]);
  }
  function eventIdOf(turnKey, type, subject, object, ordinal, recordKind) {
    return h128(eventIdInput(turnKey, type, subject, object, ordinal, recordKind));
  }

  /* ==================================================================
   * 正本の読み取り — S.turns ではなく「保存済み slot blob」を読む
   * ================================================================ */
  function urlStoryId() {
    try {
      var m = String(location.search || '').match(/[?&]story=([^&#]+)/);
      return m ? decodeURIComponent(m[1]) : null;
    } catch (e) { return null; }
  }
  function activeSlotId() { try { return JSON.parse(lsg('chr6_active_slot') || 'null'); } catch (e) { return null; } }
  function chr6Key() { try { return (typeof window.__chr6Key === 'function') ? window.__chr6Key() : 'chr6'; } catch (e) { return 'chr6'; } }

  /* ★小修正: 'default' と '' は 'chr6' と同じ既定 slot を指す。正規化して照合する。 */
  function normSlot(x) {
    var s = (x == null) ? '' : String(x);
    if (s === '' || s === 'default') return 'chr6';
    return s;
  }

  /* ★URL story / chr6_active_slot / __chr6Key() / 実読込key を照合する。
     1つでも食い違ったら slot-mismatch で止める（古い別タブの状態を記録しないため）。 */
  function resolveSlot() {
    var url = urlStoryId();
    var act = normSlot(activeSlotId());
    var key = chr6Key();
    var slotId, expectKeys;
    if (url) {
      slotId = normSlot(url);
      expectKeys = (slotId === 'chr6') ? ['chr6', 'chr6_slot_' + url] : ['chr6_slot_' + url];
      if (act !== slotId) return { ok: false, code: 'slot-mismatch', why: 'active!=url' };
    } else if (act !== 'chr6') {
      return { ok: false, code: 'slot-mismatch', why: 'no-url-story' };
    } else {
      slotId = 'chr6'; expectKeys = ['chr6'];
    }
    if (expectKeys.indexOf(key) < 0) return { ok: false, code: 'slot-mismatch', why: 'chr6Key!=expected' };
    var raw = lsg(key);
    if (raw == null) return { ok: false, code: 'no-blob', why: key };
    /* ★30ターンごとに 1.5MB の JSON を parse し直すと、1万ターンで二乗の重さになる
       （実測: 14.8秒のうち大半がこれ）。**生文字列が1バイトも違わないとき**だけ
       前回の parse 結果を使い回す。内容が変われば必ず parse し直すので、
       古い状態を記録することはない。 */
    var d = null;
    if (_blob.key === key && _blob.raw === raw) {
      d = _blob.data;
    } else {
      try { d = JSON.parse(raw); } catch (e) { blobForget(); return { ok: false, code: 'bad-blob', why: key }; }
      if (raw.length <= BLOB_CACHE_MAX) { _blob.key = key; _blob.raw = raw; _blob.data = d; }
      else blobForget();
    }
    var turns = (d && Array.isArray(d.turns)) ? d.turns : null;
    if (!turns) return { ok: false, code: 'bad-blob', why: 'turns' };
    return { ok: true, slotId: slotId, key: key, raw: raw, blob: d, turns: turns };
  }
  var _blob = { key: null, raw: null, data: null };
  var BLOB_CACHE_MAX = 8000000;
  function blobForget() { _blob.key = null; _blob.raw = null; _blob.data = null; }

  /* ==================================================================
   * IndexedDB
   * ================================================================ */
  var _db = null, _dbFail = false;
  function openDb() {
    return new Promise(function (res) {
      if (_db) return res(_db);
      if (_dbFail) return res(null);
      if (!armed()) return res(null);        /* ★未武装なら IndexedDB を作らない */
      var req;
      try { req = indexedDB.open(DB_NAME, DB_VER); }
      catch (e) { _dbFail = true; degrade('idb-open-threw'); return res(null); }
      req.onupgradeneeded = function () {
        try {
          var db = req.result, tx = req.transaction, ev, en;
          if (!db.objectStoreNames.contains('events')) {
            ev = db.createObjectStore('events', { keyPath: 'eventId' });
          } else { ev = tx.objectStore('events'); }
          mkIdx(ev, 'by_slot', 'slotId');
          mkIdx(ev, 'by_slot_turn', ['slotId', 'turnKey']);
          mkIdx(ev, 'by_slot_source_index', ['slotId', 'sourceTurnIndex']);
          mkIdx(ev, 'by_slot_type', ['slotId', 'type']);
          mkIdx(ev, 'by_slot_kind', ['slotId', 'recordKind']);      /* ★件数を O(log n) で数える */
          mkIdx(ev, 'by_slot_disputed', ['slotId', 'disputed']);
          if (!db.objectStoreNames.contains('entities')) {
            en = db.createObjectStore('entities', { keyPath: ['slotId', 'entityId'] });
          } else { en = tx.objectStore('entities'); }
          mkIdx(en, 'by_slot', 'slotId');
          mkIdx(en, 'by_slot_first_seen', ['slotId', 'firstSeenTurnIndex']);
          mkIdx(en, 'by_slot_kind', ['slotId', 'kind']);
          if (!db.objectStoreNames.contains('chain')) db.createObjectStore('chain', { keyPath: 'slotId' });
          if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'k' });
        } catch (e) { degrade('idb-upgrade'); }
      };
      req.onsuccess = function () { _db = req.result; st.idb.available = true; res(_db); };
      req.onerror = function () { _dbFail = true; degrade('idb-open-error'); res(null); };
      req.onblocked = function () { _dbFail = true; degrade('idb-blocked'); res(null); };  /* ★待たない */
    });
  }
  function mkIdx(store, name, keyPath) {
    try { if (!store.indexNames.contains(name)) store.createIndex(name, keyPath, { unique: false }); } catch (e) {}
  }
  function txDone(tx) {
    return new Promise(function (res) {
      tx.oncomplete = function () { res(true); };
      tx.onerror = function () { res(false); };
      tx.onabort = function () { res(false); };
    });
  }
  function reqP(r) { return new Promise(function (res) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { res(null); }; }); }

  function getChain(slotId) {
    return openDb().then(function (db) {
      if (!db) return null;
      try { return reqP(db.transaction('chain', 'readonly').objectStore('chain').get(slotId)); }
      catch (e) { return null; }
    });
  }
  function readAll(store, slotId) {
    return openDb().then(function (db) {
      if (!db || !slotId) return [];
      try {
        var ix = db.transaction(store, 'readonly').objectStore(store).index('by_slot');
        return reqP(ix.getAll(IDBKeyRange.only(slotId))).then(function (a) { return a || []; });
      } catch (e) { return []; }
    });
  }

  /* ==================================================================
   * chain（checkpoint + tail）
   * ★おしん指定7: turnKey 自体が前履歴すべてを含むので、
   *   200 ターンごとの末尾 turnKey を1つ持てば、その前の 200 件は「一致した」と断定できる。
   *   独自 FNV は廃止（衝突特性を自前で保証しなくて済む）。
   * ================================================================ */
  function buildChainRecord(slotId, keys, processedCount, unhandled, ver, ctxHash) {
    var cps = [], i, full = Math.floor(keys.length / CKPT);
    for (i = 0; i < full; i++) cps.push(keys[(i + 1) * CKPT - 1]);
    return { slotId: slotId, schemaVersion: SCHEMA_VERSION, extractorVersion: ver || EXTRACTOR_VERSION,
             total: keys.length, checkpoints: cps, tail: keys.slice(full * CKPT),
             chainKey: keys.length ? keys[keys.length - 1] : null,
             entityContextHash: ctxHash || null,          /* ★抽出が依存する Entity 文脈 */
             processedCount: processedCount, unhandled: unhandled || [], updatedAt: nowMs() };
  }

  /* ==================================================================
   * Entity 文脈のハッシュ（おしん指定3）
   * ★抽出は本文だけでなく cast / fix307 roster / fix640 台帳にも依存する。
   *   本文が同じまま cast の id やロスターが変わると、turnKey は変わらないので
   *   firstDiff は末尾を返し、過去の Event が古い entityId のまま残ってしまう。
   *   そこで Entity 文脈そのものを鍵にして chain へ保存し、変わったら d=0 で全再抽出する。
   * ================================================================ */
  function entityContextCanon(kn) {
    var names = (kn && kn.order) || [], out = [], i, e;
    for (i = 0; i < names.length; i++) {                  /* order は名前順に整列済み */
      e = kn.byName[names[i]];
      out.push([String(names[i]), String(e.entityId), String(e.entityType), String(e.status), !!e.ambiguous]);
    }
    /* ★v0.3(b): entity 解決は fix764(fold) / fix197(canonName) の有無で答えが変わる。
       層が入れ替わったら d=0 で作り直せるよう、可用性そのものを鍵に混ぜる。 */
    out.push(['__v03layers', !!fixFold(), !!fix197(), String((kn && kn.heroEntityId) || '')]);
    return JSON.stringify(out);
  }
  var _ctx = { slotId: null, canon: null, hash: null };
  function ctxForget() { _ctx.slotId = null; _ctx.canon = null; _ctx.hash = null; }
  function entityContextHash(slotId, kn) {
    var canon = entityContextCanon(kn);
    if (_ctx.slotId === slotId && _ctx.canon === canon) return Promise.resolve(_ctx.hash);
    return h128(canon).then(function (hh) {
      _ctx.slotId = slotId; _ctx.canon = canon; _ctx.hash = hh; return hh;
    });
  }

  /* checkpoint が一致した位置までは前史ごと同一と断定できる。
     食い違った checkpoint より手前の「検証済み末尾」から作り直す（最大199余分）。 */
  function firstDiff(oldRec, keys) {
    if (!oldRec) return 0;
    var oldTotal = oldRec.total | 0;
    var cps = oldRec.checkpoints || [];
    var tail = oldRec.tail || [];
    var verified = 0, i, pos;
    for (i = 0; i < cps.length; i++) {
      pos = (i + 1) * CKPT - 1;
      if (pos >= keys.length) break;                 /* 新しい方が短い：ここまでしか検証できない */
      if (keys[pos] !== cps[i]) break;               /* この区間で分岐 */
      verified = pos + 1;
    }
    if (verified === cps.length * CKPT) {            /* 全 checkpoint 一致 → tail を要素比較 */
      var tailStart = cps.length * CKPT;
      var m = Math.min(tail.length, Math.max(0, keys.length - tailStart));
      for (i = 0; i < m; i++) if (tail[i] !== keys[tailStart + i]) return tailStart + i;
      if (keys.length < oldTotal) return keys.length;          /* undo（短くなった） */
      return Math.min(oldTotal, keys.length);                  /* 追記だけ */
    }
    return verified;                                 /* 分岐区間の先頭へ戻す */
  }

  /* ==================================================================
   * 引用マスク（おしん指定1）
   * ★引用の中身は Phase 1 では保存しない。evidence もマスク後の文字列を使う。
   *   長さを保つ文字で置換するので、span の切り出し位置は変わらない。
   * ================================================================ */
  var MASK_CH = '＿';                            /* ＿ */
  function rep(n) { var s = ''; while (s.length < n) s += MASK_CH; return s.slice(0, n); }

  function maskQuotes(text) {
    var s = String(text || '');
    /* <say ...>...</say>（タグごと） */
    s = s.replace(/<say\b[^<>]*>[\s\S]*?<\/say>/g, function (m) { return rep(m.length); });
    /* 閉じていない <say ...> は末尾までマスク（開いた引用を地の文として読まない） */
    s = s.replace(/<say\b[^<>]*>[\s\S]*$/, function (m) { return rep(m.length); });
    /* 「」『』 は入れ子を許して走査。閉じなければ末尾までマスク。 */
    var out = s.split(''), depth = 0, start = -1, i, c;
    for (i = 0; i < out.length; i++) {
      c = out[i];
      if (c === '「' || c === '『') {         /* 「 『 */
        if (depth === 0) start = i;
        depth++;
      } else if (c === '」' || c === '』') {   /* 」 』 */
        if (depth > 0) {
          depth--;
          if (depth === 0 && start >= 0) { for (var j = start; j <= i; j++) out[j] = MASK_CH; start = -1; }
        }
      }
    }
    if (depth > 0 && start >= 0) for (i = start; i < out.length; i++) out[i] = MASK_CH;
    return out.join('');
  }

  /* ==================================================================
   * 抽出（決定的ルールのみ・API 0回）
   * ================================================================ */
  var G = {
    neg: /(ない|なかった|ぬ|ず(?![か-ん])|わけではない|ものではない)/,
    hyp: /(もし|たら|なら|ならば|かもしれ|だろうか|かどうか|仮に|とすれば)/,
    q: /[?？]|のか[。、]|だろうか/,
    /* ★v0.2.1: 旧版は そうだ(?![。！]) だったため「澪は死んだそうだ。」が素通りしていた。
       否定先読みを外し、伝聞の言い切り・体言止め・引用形をまとめて塞ぐ。
       「死にそうだ」のような様態も同時に落ちるが、いずれも World Truth ではないので都合がよい。 */
    hearsay: /(らしい|という噂|噂では|聞いた話|伝え聞|そうだ|そうです|そうな[。、]|とのこと|と聞(いた|いている)|と言われて|と伝えられ|だという|模様だ)/,
    metaphor: /(まるで|のように|みたいに|かのごとく|のごとく)/,
    illusion: /(夢の中|夢で|幻|幻覚|錯覚|白昼夢)/,
    future: /(しよう|するつもり|したい|しなければ|べきだ|予定だ)/,
    /* ★v0.2.2: 認識・誤認・演技・伝聞報告は World Truth にしない。
       「確認した」「判明した」は含めない（これらは確定を許す）。
       span 全体を保守的に落とす。Phase 1 は偽陽性を避ける方を優先する。 */
    belief: /(と思っ|と考え|と信じ|と勘違い|と誤解|と推測|と思われ|かに見え|ように見え|ふりをし|ふりを装|装っ|と報告され|と主張され|と述べられ)/,
    /* ★v0.2.3: 間接話法。「誰かがそう言った」であって世界の事実ではない。 */
    reported: /(と言っ|と語っ|と告げ|と報告し|と主張し|と述べ|と伝え(た|て)|によれば|によると|の話では)/,
    /* ★v0.2.3: 推量・伝聞的断定。確定してよい根拠にならない。 */
    uncertain: /(ようだ|ようだっ|みたいだ|みたいだっ|可能性がある|おそらく|たぶん|多分|はずだ|はずだっ|だろう|でしょう|に違いない|かもしれ)/,
    /* ★v0.2.3: 受益・使役・虚構化。動作主が入れ替わる／事実でない。 */
    voice: /(てもらっ|てもらう|ていただい|ことにし|ことにする|ことになっ)/
  };
  /* ==================================================================
   * v0.3 (a) event family — **この9種で確定。増やさない。**
   *   曖昧な何でも箱は作らない。決まらないものは UNRESOLVED か unhandled へ。
   * ================================================================ */
  var FAMILIES = ['ENTITY_FACT', 'RELATION_EVENT', 'COMMITMENT_EVENT', 'DISCLOSURE_CLAIM_EVENT',
                  'DISCOVERY_EVENT', 'UNRESOLVED_EVENT', 'LOCATION_STATE_EVENT',
                  'WORLD_FACT_EVENT', 'PERSISTENT_HARM_CONTEXT'];
  /* v0.2 の type は1つも消さない。family は後付けの1フィールドとして被せる。 */
  var FAM_OF = {
    death: 'ENTITY_FACT', revival: 'ENTITY_FACT', amnesia: 'ENTITY_FACT',
    curse_applied: 'ENTITY_FACT', possession_started: 'ENTITY_FACT',
    identity_revealed: 'ENTITY_FACT', name_declared: 'ENTITY_FACT',
    trait_declared: 'ENTITY_FACT', role_assigned: 'ENTITY_FACT',
    wound_persistent: 'PERSISTENT_HARM_CONTEXT', harm_context_recorded: 'PERSISTENT_HARM_CONTEXT',
    affiliation_changed: 'RELATION_EVENT', relation_formed: 'RELATION_EVENT',
    relation_broken: 'RELATION_EVENT', speech_relation_declaration: 'RELATION_EVENT',
    contract_made: 'COMMITMENT_EVENT', speech_commitment: 'COMMITMENT_EVENT',
    disclosure_made: 'DISCLOSURE_CLAIM_EVENT', speech_disclosure: 'DISCLOSURE_CLAIM_EVENT',
    discovery_made: 'DISCOVERY_EVENT', identity_confirmation: 'DISCOVERY_EVENT',
    identity_unresolved: 'UNRESOLVED_EVENT', time_loop_detected: 'UNRESOLVED_EVENT',
    terrain_changed: 'LOCATION_STATE_EVENT', seal_state_changed: 'LOCATION_STATE_EVENT',
    location_access_changed: 'LOCATION_STATE_EVENT',
    item_acquired: 'WORLD_FACT_EVENT', item_transferred: 'WORLD_FACT_EVENT',
    item_used: 'WORLD_FACT_EVENT', item_consumed: 'WORLD_FACT_EVENT',
    item_broken: 'WORLD_FACT_EVENT', item_lost: 'WORLD_FACT_EVENT',
    boss_defeated: 'WORLD_FACT_EVENT', quest_state_changed: 'WORLD_FACT_EVENT'
  };
  function familyOf(type) {
    var f = FAM_OF[type];
    return (f && FAMILIES.indexOf(f) >= 0) ? f : 'UNRESOLVED_EVENT';
  }
  /* ★fix190 が authority の領域。ME は経緯・原因・背景だけを持ち、
     現在の state（傷/関係/未解決）を1バイトも複製しない。 */
  var STATE_AUTHORITY_FIX190 = { PERSISTENT_HARM_CONTEXT: 1, RELATION_EVENT: 1 };

  var TYPES = [
    { type: 'death',              re: /(死んだ|息絶え|事切れ|絶命|命を落と)/,        cat: 'char' },
    { type: 'revival',            re: /(蘇っ|生き返っ|息を吹き返)/,                  cat: 'char' },
    { type: 'wound_persistent',   re: /(重傷|骨が折れ|腕を失|足を失|失明|深い傷)/,   cat: 'char' },
    { type: 'amnesia',            re: /(記憶を失|記憶が消え|忘れてしまっ(?=た記憶))/, cat: 'char' },
    { type: 'curse_applied',      re: /(呪われ|呪いをかけ|呪いが)/,                  cat: 'char' },
    { type: 'possession_started', re: /(憑依|取り憑|乗っ取られ)/,                    cat: 'char' },
    { type: 'terrain_changed',    re: /(崩落|崩れ落ち|塞がれ|埋まっ|開通|焼け落ち|橋が落ち)/, cat: 'place', place: 1 },
    { type: 'item_acquired',      re: /(受け取っ|手に入れ|拾っ|入手し)/,             cat: 'item' },
    { type: 'item_transferred',   re: /(渡し|手渡し|譲っ|奪っ|奪い取っ)/,            cat: 'item' },
    { type: 'item_used',          re: /(使っ|用い|かざし)/,                          cat: 'item' },
    { type: 'item_consumed',      re: /(飲み干し|食べ切っ|使い切っ|消費し)/,         cat: 'item' },
    { type: 'item_broken',        re: /(壊れ|砕け|割れ|折れて使えな)/,               cat: 'item' },
    { type: 'item_lost',          re: /(失くし|落とし|紛失|見失っ)/,                 cat: 'item' },
    { type: 'contract_made',      re: /(契約(を|が)(結|交わ)|[とに]誓っ|約束(を|し)た)/, cat: 'char' },   /* ★裸の「誓った」は外す（復讐を誓った を人物間契約にしない） */
    { type: 'quest_state_changed',re: /(依頼(を|が)(果た|達成|失敗)|任務(を|が)(果た|達成|失敗))/, cat: 'quest' },
    { type: 'seal_state_changed', re: /(封印(が|を)(破|解|砕)|結界(が|を)(破|解))/,  cat: 'place', place: 1 },
    { type: 'boss_defeated',      re: /(討伐し|倒した|撃破し)/,                      cat: 'char' },
    { type: 'identity_revealed',  re: /(正体は|本名は|実は[^。]{0,12}だった)/,       cat: 'char' },
    { type: 'name_declared',      re: /(と名乗っ|名は[^。]{0,10}という)/,            cat: 'char' },
    { type: 'affiliation_changed',re: /(に所属|の一員となっ|を離脱|を抜け)/,         cat: 'org' },
    { type: 'trait_declared',     re: /(一人称は|二人称は|と呼ぶことにし|口調を改め)/, cat: 'char' },
    { type: 'time_loop_detected', re: /(時間が巻き戻|時が巻き戻|ループし(て|た)|同じ日を繰り返)/, cat: 'meta' },

    /* ---- v0.3 追加。**構造条件 + 最小の明示マーカー**だけ。語彙で網羅しない ---- */
    /* ENTITY_FACT: 役目・役割の付与（人物の重要事実） */
    { type: 'role_assigned',      re: /(の役目は|の役割は|を任され(た|る)|に任命され|を託され)/, cat: 'char' },
    /* RELATION_EVENT: 関係の成立・破綻。**2人が解決できたときだけ event** */
    { type: 'relation_formed',    re: /(と(?:の)?(?:絆|関係)が(?:結ば|生まれ|深まっ)|と和解し|と手を組(んだ|み)|と親しくなっ)/, cat: 'char', two: 1 },
    { type: 'relation_broken',    re: /(と(?:の)?(?:縁|関係)を(?:断|切)|と決別し|と袂を分か|を裏切っ|と絶縁し)/, cat: 'char', two: 1 },
    /* ★COMMITMENT_EVENT の地の文側は v0.2 の contract_made がそのまま担う。
       「約束した」「[とに]誓った」は既に contract_made が拾うので、
       同じ事実を2件作る type は足さない（重複を作らないことが最小）。 */
    /* DISCLOSURE_CLAIM_EVENT: 開示行為そのもの。中身の真偽は主張しない */
    { type: 'disclosure_made',    re: /(に(?:秘密|真実|正体|素性)を(?:明かし|打ち明け|告げ)|に(?:全て|すべて)を(?:話し|打ち明け)|を打ち明け)/, cat: 'char' },
    /* DISCOVERY_EVENT: 発見。identity 系は両 referent が解決できたときだけ */
    { type: 'discovery_made',     re: /(を発見し|を見つけ(た|だし)|が判明し|を突き止め|に気づい(た|て))/, cat: 'meta' },
    { type: 'identity_confirmation', re: /(同じ(もの|物|人物|品|一つ|ひとつ)|同一(人物|の(もの|物)|だ|だっ)|に間違いない|と一致し)/, cat: 'char', identity: 1 },
    /* LOCATION_STATE_EVENT: 通行可否。場所は Entity 化せず生 mention を証拠に持つ */
    { type: 'location_access_changed', re: /(封鎖され|立ち入れなくなっ|通れなくなっ|通れるようになっ|閉ざされ)/, cat: 'place', place: 1 },
    /* PERSISTENT_HARM_CONTEXT: 傷の**経緯**（誰を庇ったか）。
       marker=庇護の構造 / cond=その span に実際の損傷語があること。
       現在の傷そのものは wound_persistent、現在 state は fix190 が持つ。 */
    { type: 'harm_context_recorded', re: /(を庇っ(?:て|た)|の身代わり(?:となっ|になっ)|を守って(?:倒れ|傷つ))/,
      cond: /(重傷|負傷|傷|倒れ|血|失っ|失明)/, cat: 'char' }
  ];
  var STABLE_TRAIT = { trait_declared: 1, affiliation_changed: 1, name_declared: 1 };
  var CHANGE_REASON = { identity_revealed: 1, curse_applied: 1, possession_started: 1, trait_declared: 1 };

  function splitSpans(text) {
    return String(text || '').split(/(?<=[。！？!?\n])/).map(function (s, i) { return { i: i, s: s }; })
      .filter(function (x) { return x.s.trim().length > 0; });
  }
  function gateBlocked(s) {
    if (G.neg.test(s)) return 'neg';
    if (G.hyp.test(s)) return 'hyp';
    if (G.q.test(s)) return 'q';
    if (G.metaphor.test(s)) return 'metaphor';
    if (G.illusion.test(s)) return 'illusion';
    if (G.future.test(s)) return 'future';
    if (G.belief.test(s)) return 'belief';      /* ★認識・演技（既存の門より後ろに置く） */
    if (G.reported.test(s)) return 'reported';  /* ★間接話法 */
    if (G.uncertain.test(s)) return 'uncertain';/* ★推量 */
    if (G.voice.test(s)) return 'voice';        /* ★受益・虚構化 */
    return null;
  }
  function isInSay(s) { return /<say[\s>]/.test(s) || /^[「『]/.test(s.trim()); }

  /* ==================================================================
   * 既知 entity（読むだけ・絶対に書かない）
   * ★おしん指定6: cast に id があれば名前ではなく id を使う。
   *   同名が複数の別 id を指す場合は確定させず candidate へ落とす。
   *   fix640 台帳（v292Dfix640Evid_slot_<id>）は「既知候補」の入力として読む。
   * ================================================================ */
  function entRef(entityId, entityType, status, source) {
    return { entityId: entityId, entityType: entityType, status: status, source: source };
  }
  /* explicit = その出所が **明示的な id** を持っていたか。
     ★v0.2.2: fix307 ロスターの値は既存形式で `1` のことがあり、id を持たない。
       id を持たない出所が、cast の明示 id を壊してはいけない。
       その場合は sources に出所を足すだけで、entityId と status は保つ。 */
  function addName(map, name, ref, explicit) {
    var n = nfc(name);
    if (!n) return;
    var cur = map[n];
    if (!cur) { map[n] = { entityId: ref.entityId, entityType: ref.entityType, status: ref.status,
                           sources: [ref.source], ambiguous: false, name: n }; return; }
    if (cur.sources.indexOf(ref.source) < 0) cur.sources.push(ref.source);
    if (cur.entityId === ref.entityId) return;
    if (!explicit) return;                        /* ★明示 id でない出所は確定済みを壊さない */
    cur.ambiguous = true; cur.status = 'candidate';   /* ★同名で別の明示 id → 確定させない */
    cur.entityId = 'ambiguous:' + n;
    cur.entityType = (cur.entityType === ref.entityType) ? cur.entityType : 'unknown';
  }
  function knownEntities(blob, slotId) {
    var map = {}, i, n, c, id, heroId = null;
    try {
      c = blob && blob.cast;
      if (c && c.hero && c.hero.name) {
        id = c.hero.id ? ('char:' + c.hero.id) : 'char:hero';
        heroId = id;                                   /* ★① structured: SAY カードの話者 */
        addName(map, c.hero.name, entRef(id, 'character', 'known', 'cast.hero'), true);
      }
      if (c && Array.isArray(c.npcs)) {
        for (i = 0; i < c.npcs.length; i++) {
          n = c.npcs[i] && c.npcs[i].name; if (!n) continue;
          id = (c.npcs[i] && c.npcs[i].id) ? ('char:' + c.npcs[i].id) : ('char:npc:' + nfc(n));
          addName(map, n, entRef(id, 'character', 'known', 'cast.npc'), true);
        }
      }
    } catch (e) {}
    try {
      var r = JSON.parse(lsg('v292Dfix307Roster_slot_' + slotId) || 'null');
      if (r && typeof r === 'object') Object.keys(r).forEach(function (k) {
        if (!k) return;
        /* ★値が 1 などの既存形式なら明示 id は無い。cast の id を上書きしない。 */
        var hasId = !!(r[k] && typeof r[k] === 'object' && r[k].id);
        var rid = hasId ? ('char:' + r[k].id) : ('char:npc:' + nfc(k));
        addName(map, k, entRef(rid, 'character', 'known', 'roster'), hasId);
      });
    } catch (e) {}
    /* ★fix640 台帳は「既知候補」。正規 Entity へは昇格させない（status='candidate'）。 */
    try {
      var L = JSON.parse(lsg('v292Dfix640Evid_slot_' + slotId) || 'null');
      if (L && L.v === 1 && L.entries && typeof L.entries === 'object') {
        Object.keys(L.entries).forEach(function (k) {
          var e = L.entries[k]; if (!e || !k) return;
          var nk = nfc(k); if (!nk) return;
          var ct = (e.candidateType === 'role-label') ? 'role' : 'character';
          /* ★台帳は明示 id を持たない。既知があれば出所を足すだけで上書きしない。 */
          addName(map, nk, entRef('char_candidate:' + nk, ct, 'candidate', 'fix640'), false);
        });
      }
    } catch (e) {}
    var order = Object.keys(map).sort(function (a, b) { return a < b ? -1 : (a > b ? 1 : 0); });
    return decorate({ byName: map, order: order }, heroId);
  }
  /* ★v0.3(b): fold 索引 / cast 既知名 / hero の entityId を1回だけ作る。
     ここで作るものは全部「既知の入力の写像」で、新しい Entity は1件も生まれない。 */
  function decorate(kn, heroId) {
    var idx = {}, cast = [], i, n, e, k;
    for (i = 0; i < kn.order.length; i++) {
      n = kn.order[i]; e = kn.byName[n]; if (!n || !e) continue;
      if (GENERIC.test(n)) continue;
      k = foldStr(n);
      if (!idx[k]) idx[k] = [];
      if (idx[k].indexOf(n) < 0) idx[k].push(n);
      if (e.status === 'known' && !e.ambiguous) cast.push(n);
    }
    kn.foldIdx = idx;
    kn.castNames = cast.sort(function (a, b) { return a < b ? -1 : (a > b ? 1 : 0); });
    kn.heroEntityId = heroId || null;
    return kn;
  }
  var GENERIC = /^(少女|少年|男|女|人影|誰か|老人|子供|声|影)$/;

  /* ==================================================================
   * v0.3 (b) 4C entityId 結線 — fix764 / fix197 を「読むだけ」で使う
   * ★誤結合より未解決を優先する。証明できない同一視は1件も作らない。
   * ★fold 結果は**比較にしか使わない**（fix764 の一線）。保存する raw は
   *   必ず本文の生文字列で、畳んだ字は localStorage にも IDB にも出さない。
   * ================================================================ */
  /* 代名詞は structured metadata か一意 context が無い限り解決しない */
  var PRONOUN = /^(彼|彼女|彼ら|彼等|彼女ら|彼女たち|あの人|あの男|あの女|あの方|その人|その男|その女|この人|この男|この女|あいつ|そいつ|こいつ|奴|ヤツ|やつ|自分|私|わたし|僕|ぼく|俺|おれ|あなた|貴方|お前|おまえ|君|きみ|誰か|何者か|相手|二人|全員)$/;
  /* 「Xの声」→ X の発話表現、という**一般規則**。X 自体が解決できるときだけ同一へ倒す */
  var VOICE_OF = /^(.{1,24}?)の(声|囁き|呟き|叫び|話し声|声音)$/;
  /* 場所らしさの最小マーカー（Entity 化はしない。生 mention を証拠に持つだけ） */
  var PLACE_SUFFIX = /(洞窟|洞穴|坑道|通路|階段|廊下|部屋|広間|門|扉|橋|道|街道|坂|峠|谷|崖|山|川|海岸|浜|港|島|森|林|村|町|街|城|館|屋敷|神社|寺|祠|遺跡|塔|地下室|倉庫|納屋|井戸|関所|市場|路地|廃墟|洞|穴)$/;

  function fixFold() {
    try {
      var f = window.__v292Dfix764;
      if (f && typeof f.fold === 'function' && !(typeof f.isOff === 'function' && f.isOff())) return f;
    } catch (e) {}
    return null;
  }
  function fix197() {
    try { var a = window.__v292Dfix197; if (a && typeof a.canonName === 'function') return a; } catch (e) {}
    return null;
  }
  function foldStr(s) {
    var f = fixFold(); if (!f) return String(s == null ? '' : s);
    try { return String(f.fold(s)); } catch (e) { return String(s == null ? '' : s); }
  }
  /* fix764.fold は 1字1字の写像 + 前後 trim。**先に前後空白を落としてから**渡せば
     長さが変わらないので span 内の位置がずれない。長さが変われば使わない（安全側）。 */
  function foldSpanSafe(span) {
    var f = fixFold(); if (!f) return null;
    var s = String(span || '');
    var m = /^[\s\u3000]+/.exec(s), off = m ? m[0].length : 0;
    var core = s.slice(off).replace(/[\s\u3000]+$/, '');
    if (!core) return null;
    var out; try { out = String(f.fold(core)); } catch (e) { return null; }
    if (out.length !== core.length) return null;
    return { text: out, offset: off };
  }
  /* fold 鍵 → 既知 entity。**1 entityId に決まるときだけ**返す（曖昧は解決しない） */
  function foldUnique(kn, key) {
    var ns = (kn && kn.foldIdx && kn.foldIdx[key]) || null;
    if (!ns || !ns.length) return null;
    var id = null, i, e;
    for (i = 0; i < ns.length; i++) {
      e = kn.byName[ns[i]]; if (!e) continue;
      if (id == null) id = e.entityId;
      else if (id !== e.entityId) return null;
    }
    return (id == null) ? null : kn.byName[ns[0]];
  }
  /* ③ 安全な正名別名。fix197.canonName と同じ根拠（空白差 / 一意な前方・後方一致）を
     **cast の既知名に対してだけ**適用する。fix197 が居るときは答え合わせをして、
     食い違ったら採らない。fix197 が居なくてもこの局所規則だけで決まる＝決定的。 */
  function canonAlias(name, kn) {
    var who = nfc(name); if (!who) return null;
    if (PRONOUN.test(who) || GENERIC.test(who)) return null;
    var names = (kn && kn.castNames) || [], i, n, hit = null;
    var ws = /[\s\u3000]/g, w0 = who.replace(ws, '');
    for (i = 0; i < names.length; i++) {
      if (names[i] === who) return null;                     /* 既に正名＝別名ではない */
      if (names[i].replace(ws, '') === w0) { if (hit && hit !== names[i]) return null; hit = names[i]; }
    }
    if (!hit) {
      var m = [];
      for (i = 0; i < names.length; i++) {
        n = names[i];
        if (n === who || n.length <= who.length) continue;
        if (n.slice(n.length - who.length) === who) { m.push(n); continue; }        /* 下の名前呼び */
        if (who.length >= 2 && n.slice(0, who.length) === who) m.push(n);           /* 姓呼び */
      }
      if (m.length !== 1) return null;                       /* 一意でなければ見送り */
      hit = m[0];
    }
    var a = fix197();
    if (a) {
      var c = null;
      try { c = String(a.canonName(who) || ''); } catch (e) { c = null; }
      if (c && c !== who && c !== hit) return null;           /* 食い違ったら採らない */
    }
    var e2 = kn.byName[hit];
    return e2 ? { entityId: e2.entityId, entityType: e2.entityType, status: e2.status,
                  ambiguous: !!e2.ambiguous, canonical: hit } : null;
  }
  /* 呼称 → entityId。**推測はしない**。決まらなければ entityId:null（unresolved）。 */
  function resolveMention(name, kn, depth) {
    var n = nfc(name);
    if (!n) return { entityId: null, reason: 'empty-mention' };
    if (n.length > 32) return { entityId: null, reason: 'mention-too-long' };
    if (PRONOUN.test(n)) return { entityId: null, reason: 'pronoun-not-resolved' };
    if (GENERIC.test(n)) return { entityId: null, reason: 'generic-not-resolved' };
    var e = kn && kn.byName ? kn.byName[n] : null;
    if (e) return { entityId: e.entityId, entityType: e.entityType, status: e.status,
                    ambiguous: !!e.ambiguous, raw: n, canonical: e.name, method: 'known-name' };
    var fk = foldStr(n), fe = (fk && fixFold()) ? foldUnique(kn, fk) : null;
    if (fe) return { entityId: fe.entityId, entityType: fe.entityType, status: fe.status,
                     ambiguous: !!fe.ambiguous, raw: n, canonical: fe.name, method: 'fold' };
    var vm = VOICE_OF.exec(n);
    if (vm && (depth | 0) < 2) {
      var base = nfc(vm[1]);
      if (!base || PRONOUN.test(base) || GENERIC.test(base))
        return { entityId: null, reason: 'voice-of-unresolved-base' };
      var r = resolveMention(base, kn, (depth | 0) + 1);
      if (r && r.entityId) return { entityId: r.entityId, entityType: r.entityType, status: r.status,
                                    ambiguous: !!r.ambiguous, raw: n, canonical: r.canonical, method: 'voice-of' };
      return { entityId: null, reason: 'voice-of-unresolved-base' };
    }
    var ca = canonAlias(n, kn);
    if (ca) return { entityId: ca.entityId, entityType: ca.entityType, status: ca.status,
                     ambiguous: !!ca.ambiguous, raw: n, canonical: ca.canonical, method: 'canonical-alias' };
    return { entityId: null, reason: 'unknown-mention' };
  }

  /* span 内に現れた既知 entity を出現順に返す（同一 entityId は1回） */
  function findRefs(span, known) {
    var names = (known && known.order) || [], hits = [], i, p, e;
    for (i = 0; i < names.length; i++) {
      if (!names[i] || GENERIC.test(names[i])) continue;
      p = span.indexOf(names[i]);
      if (p >= 0) hits.push({ name: names[i], pos: p, raw: names[i], via: 'exact' });
    }
    /* ★v0.3(b)③: 表記ゆれ（簡体↔新字体）だけが違う同一名を拾う。
       畳んだ文字列は比較にしか使わず、raw は本文の生文字列を切り出す。 */
    var fs = (known && known.foldIdx) ? foldSpanSafe(span) : null;
    if (fs) {
      var keys = Object.keys(known.foldIdx), fe, raw;
      for (i = 0; i < keys.length; i++) {
        fe = foldUnique(known, keys[i]); if (!fe || GENERIC.test(fe.name)) continue;
        p = fs.text.indexOf(keys[i]); if (p < 0) continue;
        raw = span.substr(p + fs.offset, keys[i].length);
        if (raw === fe.name) continue;                       /* exact パスで拾い済み */
        hits.push({ name: fe.name, pos: p + fs.offset, raw: raw, via: 'fold' });
      }
    }
    hits.sort(function (a, b) {
      if (a.pos !== b.pos) return a.pos - b.pos;
      if (b.name.length !== a.name.length) return b.name.length - a.name.length;  /* 長い名前優先 */
      return a.name < b.name ? -1 : 1;
    });
    var seen = {}, out = [];
    for (i = 0; i < hits.length; i++) {
      e = known.byName[hits[i].name]; if (!e) continue;
      if (seen[e.entityId]) continue; seen[e.entityId] = 1;
      out.push({ entityId: e.entityId, entityType: e.entityType, status: e.status,
                 ambiguous: !!e.ambiguous, raw: hits[i].raw, canonical: hits[i].name,
                 resolvedBy: hits[i].via, pos: hits[i].pos });
    }
    return out;
  }
  /* 素の { 名前: 'char' } 形式でも動くようにする（旧試験・呼び出しの後方互換） */
  function asKnown(known) {
    if (known && known.byName && known.order)
      return known.foldIdx ? known : decorate(known, known.heroEntityId || null);
    var src = known || {}, map = {};
    Object.keys(src).forEach(function (n) {
      var v = src[n];
      if (v && typeof v === 'object' && v.entityId) map[n] = v;
      else map[n] = { entityId: 'char:npc:' + n, entityType: 'character', status: 'known',
                      sources: ['legacy'], ambiguous: false, name: n };
    });
    return decorate({ byName: map, order: Object.keys(map).sort() }, null);
  }
  /* 後方互換（旧試験が使う）。最初の既知名を返す */
  function findSubject(span, known) {
    var r = findRefs(span, asKnown(known));
    return r.length ? r[0].raw : null;
  }

  /* 「銀の鍵」のような未知の固有名は Phase 1 では抽出しない（誤検出源になるため）。
     item 系で target が取れなかった場合は object を null のままにし、
     entity_candidate は「本文に現れた既知候補」からのみ作る。 */

  /* 1ターンの抽出。返すのは「未署名の候補」（eventId は後で決定的に振る） */
  /* ==================================================================
   * 役割の確定（v0.2.1・監査2）
   * ★出現順だけで actor / target を決めると
   *     「カエデは、澪が死んだことを確認した。」→ カエデが死んだ
   *     「澪からカエデは石板を受け取った。」  → 澪が受け取った
   *   のように**逆の事実**を記録してしまう。
   *   広い構文解析は Phase 1 では持ち込まない。型ごとの**狭い格規則**だけを使い、
   *   確定できないときは Event にせず candidate へ落とす。
   * ================================================================ */
  var PART = [
    { re: /^(?:から|より)/,  role: 'src' },   /* 長いものから順に見る */
    { re: /^(?:には|へは)/,  role: 'dat' },
    { re: /^(?:とは)/,       role: 'com' },
    { re: /^(?:が|は|も)/,   role: 'nom' },
    { re: /^(?:に|へ)/,      role: 'dat' },
    { re: /^(?:を)/,         role: 'acc' },
    { re: /^(?:と)/,         role: 'com' },
    { re: /^(?:の)/,         role: 'gen' }
  ];
  function particleAt(span, ref) {
    var rest = span.slice(ref.pos + String(ref.raw).length), i;
    for (i = 0; i < PART.length; i++) if (PART[i].re.test(rest)) return PART[i].role;
    return null;
  }
  /* ★v0.2.2: 相手役として認める格を**動詞群ごと**に分ける。
     「と」は共同行動者であって、取得元でも受取人でもない。item 系からは com を外す。
       渡す／手渡す／譲る … に／へ（dat）だけ
       奪う／奪い取る     … から／より（src）だけ
       受け取る           … から／より（src）だけ
       拾う／手に入れる／入手する … 人物の相手役なし
     roles が空配列 = 「2項だが人物の相手役は取らない」。null = そもそも2項ではない。 */
  var VERB_ROLES = [
    { type: 'item_transferred', re: /(渡し|手渡し|譲っ)/,       roles: ['dat'] },
    { type: 'item_transferred', re: /(奪っ|奪い取っ)/,          roles: ['src'] },
    { type: 'item_acquired',    re: /(受け取っ)/,               roles: ['src'] },
    { type: 'item_acquired',    re: /(手に入れ|拾っ|入手し)/,    roles: [] },
    { type: 'contract_made',    re: /[\s\S]/,                  roles: ['com', 'dat'] },
    { type: 'boss_defeated',    re: /[\s\S]/,                  roles: ['acc'] },
    /* ---- v0.3 ---- */
    { type: 'relation_formed',  re: /[\s\S]/,                  roles: ['com', 'dat'] },
    { type: 'relation_broken',  re: /(を裏切っ)/,               roles: ['acc'] },
    { type: 'relation_broken',  re: /[\s\S]/,                  roles: ['com', 'dat'] },
    { type: 'disclosure_made',  re: /[\s\S]/,                  roles: ['dat'] },
    { type: 'discovery_made',   re: /[\s\S]/,                  roles: [] },
    { type: 'harm_context_recorded', re: /[\s\S]/,             roles: ['acc'] }
  ];
  function otherRolesFor(type, span) {
    for (var i = 0; i < VERB_ROLES.length; i++)
      if (VERB_ROLES[i].type === type && VERB_ROLES[i].re.test(span)) return VERB_ROLES[i].roles;
    return null;
  }
  /* ★v0.2.3: 属格（〜の）でも主語として認めてよい型。
     「澪の正体は」「澪の一人称は」のように、人物の属性を述べる型だけ。
     item 系や boss_defeated で属格を主語にすると「澪の石板が壊れた → 澪が壊れた」になる。 */
  var GEN_OK = { identity_revealed: 1, name_declared: 1, trait_declared: 1, affiliation_changed: 1,
                 role_assigned: 1 };

  /* refs は出現順。kw は型の語が現れた位置。 */
  function resolveRoles(type, span, refs, kw) {
    if (!refs.length) return { ok: false, reason: 'no-subject', people: [] };
    /* ★v0.2.3: 1人でも助詞を必ず確認する。
       格を見ずに actor へ昇格させると
         「魔王が澪を倒した。」→ 澪が倒した
         「魔王が澪に石板を渡した。」→ 澪が渡した
         「澪子が死んだ。」（既知は澪だけ）→ 澪が死んだ
       のように**逆の事実**を記録してしまう。 */
    if (refs.length === 1) {
      var r0 = particleAt(span, refs[0]);
      if (r0 === 'nom') return { ok: true, actor: refs[0], target: null, mode: 'single' };
      if (r0 === 'gen' && GEN_OK[type]) return { ok: true, actor: refs[0], target: null, mode: 'single-gen' };
      return { ok: false, reason: 'unresolved-roles', people: refs };
    }
    var m = [], i, j;
    for (i = 0; i < refs.length; i++) m.push({ ref: refs[i], role: particleAt(span, refs[i]), pos: refs[i].pos });
    /* 主格のうち**述語に最も近いもの**を動作主にする。
       「AはBが死んだ…」なら B が選ばれる（埋め込み節の主語）。 */
    var actor = null;
    for (i = 0; i < m.length; i++) if (m[i].role === 'nom' && m[i].pos < kw) actor = m[i].ref;
    if (!actor) return { ok: false, reason: 'unresolved-roles', people: refs };
    var want = otherRolesFor(type, span);
    if (want === null) return { ok: true, actor: actor, target: null, mode: 'multi-unary' };
    /* 「と」で結ばれた別人がいるのに、その型が com を相手役として認めない場合は、
       その人物の役割が決まらない。もう一人を objectId へ入れてはいけない。 */
    var hasCom = false;
    for (j = 0; j < m.length; j++)
      if (m[j].role === 'com' && m[j].ref.entityId !== actor.entityId) hasCom = true;
    if (!want.length) {
      if (hasCom) return { ok: false, reason: 'coordinated-subject', people: refs };
      return { ok: true, actor: actor, target: null, mode: 'no-person-target' };
    }
    var t = null;
    for (i = 0; i < want.length && !t; i++)
      for (j = 0; j < m.length; j++)
        if (m[j].role === want[i] && m[j].ref.entityId !== actor.entityId) { t = m[j].ref; break; }
    if (!t) return { ok: false, reason: 'unresolved-roles', people: refs };
    return { ok: true, actor: actor, target: t, mode: 'binary' };
  }

  /* ★監査4: 安定形質の「変更理由」は、同じ span か直前 span の**同一人物**からしか採らない。
     source 全体を検索すると、別文・別人物の理由が流用される。 */
  function changeReasonMap(spans, kn) {
    var map = [], j, t, sp, refs, kw, rr, set;
    for (j = 0; j < spans.length; j++) {
      sp = spans[j].s; set = null;
      if (gateBlocked(sp) || G.hearsay.test(sp)) { map.push(null); continue; }
      refs = findRefs(sp, kn);
      for (t = 0; t < TYPES.length; t++) {
        if (!CHANGE_REASON[TYPES[t].type]) continue;
        if (!TYPES[t].re.test(sp)) continue;
        kw = sp.search(TYPES[t].re);
        rr = resolveRoles(TYPES[t].type, sp, refs, kw);
        /* ★同じ span に理由が2つ以上あることがある（正体判明＋一人称宣言など）。
           1つで上書きすると「自分自身が理由」になって判定が壊れるので、集合で持つ。 */
        if (rr.ok && rr.actor) {
          set = set || {};
          set[rr.actor.entityId] = set[rr.actor.entityId] || {};
          set[rr.actor.entityId][TYPES[t].type] = 1;
        }
      }
      map.push(set);
    }
    return map;
  }

  /* その span に、同一人物についての「その型以外の変更理由」があるか */
  function hasOtherReason(set, entityId, type) {
    var m = set && set[entityId], k;
    if (!m) return false;
    for (k in m) if (Object.prototype.hasOwnProperty.call(m, k) && k !== type) return true;
    return false;
  }
  function refView(r) {
    return r ? { entityId: r.entityId, raw: r.raw, entityType: r.entityType,
                 status: r.status, ambiguous: !!r.ambiguous,
                 resolvedBy: r.resolvedBy || r.method || 'exact' } : null;
  }

  /* ==================================================================
   * v0.3 (c) Speech Act — SAY 全マスクの解除
   * ★発話を「世界の事実」ではなく「発話行為」として保存する。
   * ★読む場所は product 側で**構造化済みの say カード**だけ:
   *     turn._convSays[i] = { who, say }   … <say who="X"> 由来（fix195/fix218/fix620）
   *     inputType==='SAY' の playerText     … 主人公が言ったことが構造で確定
   *   地の文の「」を発話として読み直すことはしない（v0.2 の引用マスクは維持）。
   * ★raw 台詞は保存しない。normalizedProposition だけを持つ。
   * ★claim を WORLD_FACT へ昇格しない（真偽結合は 3A-2）。
   * ================================================================ */
  var SPEECH_ACTS = [
    { kind: 'COMMITMENT', type: 'speech_commitment', epistemic: 'COMMITMENT',
      re: /(約束(する|だ|よ|します|しよう)|誓(う|います|おう)|請け合(う|います)|必ず(戻|帰|守|助け|迎え)[^。！？]{0,4}(る|ります|ます)|絶対に(守る|助ける|戻る))/,
      cut: /((と)?約束(する|だ|よ|します|しよう)|(と)?誓(う|います|おう)|請け合(う|います))/g,
      gate: 'full' },
    { kind: 'DISCLOSURE_CLAIM', type: 'speech_disclosure', epistemic: 'DISCLOSURE',
      re: /(実は|本当のことを言う|正直に言う|白状する|打ち明け(る|ます)|秘密(を|は|だ)|誰にも言(わない|うな)|黙っていた|隠していた)/,
      cut: /(^実は|本当のことを言う(と|が)?|正直に言う(と|が)?|白状する(と|が)?|(を)?打ち明け(る|ます))/g,
      gate: 'hypq' },
    { kind: 'RELATION_DECLARATION', type: 'speech_relation_declaration', epistemic: 'DIALOGUE_CLAIM',
      re: /((仲間|味方|敵|家族|恩人|師匠|弟子|相棒)(だ|です|だよ|になる|になろう|にはならない)|絶交だ|縁を切る|二度と(会わない|顔を見せるな))/,
      cut: null, gate: 'neghypq' }
  ];
  /* 呼びかけ（明示 addressee）。「Xさん、」「X、」の形だけ。推測はしない。 */
  var VOCATIVE = /^[「『\s\u3000]*([^\s\u3000、,。！？!?「」『』]{1,16}?)(さん|様|さま|殿|どの|くん|君|ちゃん)?[、,]/;

  function sayNorm(s) { return String(s || '').replace(/[\s\u3000。、！？!?…・「」『』]/g, ''); }

  /* 1ターン分の say カード（構造化済みのものだけ） */
  function sayCards(turn) {
    var out = [], a = (turn && Array.isArray(turn._convSays)) ? turn._convSays : [], i, c, who, say;
    var heroDup = null;
    if (String((turn && turn.inputType) || '') === 'SAY') {
      say = String((turn && turn.playerText) || '');
      if (say.trim() && say.length <= SAY_MAX) {
        out.push({ who: null, heroSelf: true, say: say, card: -1 });
        heroDup = sayNorm(say);
      }
    }
    for (i = 0; i < a.length; i++) {
      c = a[i]; if (!c) continue;
      say = String(c.say || '');
      if (!say.trim() || say.length > SAY_MAX) continue;
      if (heroDup && sayNorm(say) === heroDup) continue;     /* SAY 入力の写しは1回だけ */
      who = (c.who == null) ? null : nfc(c.who);
      if (who === '???' || who === '') who = null;            /* fix195 の未確定プレースホルダ */
      out.push({ who: who, heroSelf: false, say: say, card: i });
    }
    return out;
  }
  /* ① structured speaker。取れなければ null のまま（推測禁止） */
  function speakerOf(card, kn) {
    if (card.heroSelf) {
      var hid = kn && kn.heroEntityId;
      return hid ? { entityId: hid, entityType: 'character', status: 'known', ambiguous: false,
                     raw: null, method: 'structured-say-input' }
                 : { entityId: null, reason: 'no-hero-entity' };
    }
    if (!card.who) return { entityId: null, reason: 'no-structured-who' };
    var r = resolveMention(card.who, kn, 0);
    if (r && r.entityId) { r.method = 'structured-say-card/' + (r.method || 'known-name'); return r; }
    return { entityId: null, reason: (r && r.reason) || 'unknown-mention' };
  }
  /* ★命題の正規化。raw 台詞は保存しない。
     ・タグと引用符を落とす / 空白を畳む
     ・マーカーを含む**1文だけ**を採る（台詞全文を貯めない）
     ・発話行為マーカーは kind が持つので命題からは外す
     ・PROP_MAX で切る */
  function normalizeProposition(sayText, act) {
    var s = String(sayText || '');
    s = s.replace(/<[^<>]*>/g, ' ').replace(/[「」『』]/g, ' ');
    s = s.replace(/[\s\u3000]+/g, ' ').trim();
    var parts = s.split(/(?<=[。！？!?…])/).map(function (x) { return x.trim(); })
                 .filter(function (x) { return !!x; });
    var pick = null, i;
    for (i = 0; i < parts.length; i++) if (act.re.test(parts[i])) { pick = parts[i]; break; }
    if (pick == null) pick = parts.length ? parts[0] : s;
    var clause = pick;                                  /* 門は**この1文**に対して掛ける */
    if (act.cut) pick = pick.replace(act.cut, ' ');
    pick = pick.replace(/[\s\u3000]+/g, ' ')
               .replace(/^[\s、,と て]+/, '').replace(/[。、，,！？!?…・\s]+$/, '').trim();
    var truncated = false;
    if (pick.length > PROP_MAX) { pick = pick.slice(0, PROP_MAX) + '…'; truncated = true; }
    return { text: pick, truncated: truncated, clause: clause };
  }
  /* ★(d) 明示 addressee だけ。「その場にいた」の自動追加は禁止。 */
  function addresseesOf(sayText, kn, speakerId) {
    var m = VOCATIVE.exec(String(sayText || ''));
    if (!m || !m[1]) return [];
    var r = resolveMention(m[1], kn, 0);
    if (!r || !r.entityId) return [];
    if (speakerId && r.entityId === speakerId) return [];
    return [r.entityId];
  }
  /* ★発話行為の門。地の文の門（gateBlocked）とは1点だけ違う:
       G.neg の裸の「ず」は「必ず」を否定と誤認するため、発話では NEG_SPEECH を使う。
       他（仮定・疑問・比喩・幻・伝聞・推量・受益）は地の文と同じ門を通す。 */
  var NEG_SPEECH = /(ない|なかった|ません|ぬ(?![か-ん])|わけではない|ものではない)/;
  function speechGateBlocked(clause, mode) {
    var s = String(clause || '');
    if (mode === 'hypq') return G.hyp.test(s) ? 'hyp' : (G.q.test(s) ? 'q' : null);
    if (NEG_SPEECH.test(s)) return 'neg';
    if (G.hyp.test(s)) return 'hyp';
    if (G.q.test(s)) return 'q';
    if (mode !== 'full') return null;
    if (G.metaphor.test(s)) return 'metaphor';
    if (G.illusion.test(s)) return 'illusion';
    if (G.belief.test(s)) return 'belief';
    if (G.reported.test(s)) return 'reported';
    if (G.uncertain.test(s)) return 'uncertain';
    if (G.voice.test(s)) return 'voice';
    return null;
  }
  function extractSpeechActs(turn, idx, kn) {
    var out = [], cards = sayCards(turn), i, t, c, sp, prop, addr, act, clause, rec, ok;
    for (i = 0; i < cards.length; i++) {
      c = cards[i];
      for (t = 0; t < SPEECH_ACTS.length; t++) {
        act = SPEECH_ACTS[t];
        if (!act.re.test(c.say)) continue;                       /* マーカーが無い発話は保存しない */
        sp = speakerOf(c, kn);
        ok = !!(sp && sp.entityId);
        addr = ok ? addresseesOf(c.say, kn, sp.entityId) : addresseesOf(c.say, kn, null);
        /* ★呼びかけは addresseeEntityIds が持つので命題からは外す */
        var body = c.say, vm2;
        if (addr.length && (vm2 = VOCATIVE.exec(c.say))) body = c.say.slice(vm2[0].length);
        prop = normalizeProposition(body, act);
        clause = prop.text;
        /* ★仮定・疑問・否定・伝聞は発話行為にしない。門は**マーカーを含む1文**に掛ける
           （発話全文に掛けると、無関係な後続文の1語で正しい約束まで落ちる）。 */
        if (speechGateBlocked(prop.clause, act.gate)) continue;
        rec = {
          type: act.type, category: 'speech', family: ok ? familyOf(act.type) : 'UNRESOLVED_EVENT',
          sourceTurnIndex: idx, spanOrder: 200000 + i,
          sourceMode: 'DIALOGUE', epistemic: act.epistemic,
          roleMode: 'speech-act',
          actor: null, subject: null, target: null,
          subjectId: ok ? sp.entityId : null,
          objectId: addr.length ? addr[0] : null,
          recordKind: ok ? 'event' : 'candidate',
          candidateReason: ok ? null : 'speaker-unresolved',
          argumentResolution: ok ? 'complete' : 'partial',
          missingArguments: ok ? [] : [{ role: 'speaker', entityType: 'character',
                                         reason: (sp && sp.reason) || 'no-structured-who' }],
          personCandidates: null,
          speechAct: {
            kind: act.kind,
            speakerEntityId: ok ? sp.entityId : null,
            speakerSource: ok ? sp.method : null,
            addresseeEntityIds: addr.slice(),
            normalizedProposition: clause,
            propositionTruncated: !!prop.truncated,
            sourceTurn: idx, sourceMode: 'DIALOGUE',
            cardIndex: c.card
          },
          /* ★(d) knownTo は speaker + 明示 addressee だけ。audience 不明は UNKNOWN のまま */
          knownTo: (ok ? [sp.entityId] : []).concat(addr),
          audience: addr.length ? 'EXPLICIT' : 'UNKNOWN',
          /* ★claim を WORLD_FACT へ昇格しない（3A-2 の責務） */
          worldFactPromotion: false,
          /* ★raw 台詞は残さない。evidence は null（v0.2 の evidence 規律より強い） */
          prov: { kind: 'say_card', authority: 4, confidence: ok ? 0.9 : 0.5, evidence: null }
        };
        out.push(rec);
      }
    }
    return out;
  }

  /* ★場所の生 mention。**Entity 化はしない**（v0.2 監査3 の規律のまま）。 */
  function placeMentionAt(span, kw) {
    var head = String(span || '').slice(0, kw);
    var m = /([^\s\u3000。、，,！？!?「」『』がはをへにもとでやのから]{2,20})(?:が|は|へ|に|を|も)[^。、]{0,12}$/.exec(head);
    if (!m || !m[1]) return null;
    var np = m[1];
    if (np.length > PLACE_MAX) np = np.slice(-PLACE_MAX);
    return PLACE_SUFFIX.test(np) ? np : null;
  }

  /* 1ターンの抽出。返すのは「未署名の候補」（eventId は後で決定的に振る） */
  function extractTurn(turn, idx, known) {
    var res = { records: [], events: [], candidates: [], unhandled: [], entityRefs: [] };
    if (!turn) return res;
    var kn = asKnown(known);
    var mode = String(turn.inputType || '');
    var srcs = [];
    /* ★監査1: player_say は World Event 抽出を完全にスキップする。
       台詞は「誰かがそう言った」であって世界の事実ではない。 */
    if (mode !== 'SAY') {
      srcs.push({ text: maskQuotes(String(turn.playerText || '')),
                  kind: (mode === 'STORY' ? 'player_story' : mode === 'DO' ? 'player_do' : 'player'),
                  authority: 5, base: 0 });
    }
    srcs.push({ text: maskQuotes(String(turn.narrative || '')), kind: 'narration', authority: 3, base: 100000 });

    var s, spans, j, span, gb, t, refs, crMap, kw, rr, subj, tgt;
    for (s = 0; s < srcs.length; s++) {
      spans = splitSpans(srcs[s].text);
      crMap = changeReasonMap(spans, kn);
      for (j = 0; j < spans.length; j++) {
        span = spans[j].s;
        gb = gateBlocked(span);
        if (gb) continue;
        if (G.hearsay.test(span)) continue;                          /* Rumor は Phase1 では保存しない */
        if (srcs[s].kind === 'narration' && isInSay(span)) continue;  /* 念のための二重防御 */
        refs = findRefs(span, kn);
        for (t = 0; t < TYPES.length; t++) {
          if (!TYPES[t].re.test(span)) continue;
          /* ★v0.3: 構造条件（cond）。明示マーカーだけでは決めない型に足す追加条件。 */
          if (TYPES[t].cond && !TYPES[t].cond.test(span)) continue;
          var type = TYPES[t].type;
          if (type === 'time_loop_detected') {
            res.unhandled.push({ type: type, family: familyOf(type), sourceTurnIndex: idx,
                                 evidence: span.slice(0, EVIDENCE_MAX),
                                 reason: 'state_rewrite_not_supported' });
            continue;
          }
          kw = span.search(TYPES[t].re);
          /* ★v0.3(a) DISCOVERY: 「同じものだ」等の**文字列単独 rule は禁止**。
             両 referent が安全に解決できたときだけ IDENTITY_CONFIRMATION 候補。
               2件以上 … DISCOVERY_EVENT / identity_confirmation（candidate）
               1件     … UNRESOLVED_EVENT / identity_unresolved（candidate）
               0件     … 記録を1件も作らず unhandled にだけ残す（取り逃しは測れる） */
          if (TYPES[t].identity) {
            if (!refs.length) {
              if (res.unhandled.length < UNHANDLED_MAX)
                res.unhandled.push({ type: 'identity_unresolved', family: 'UNRESOLVED_EVENT',
                                     sourceTurnIndex: idx, evidence: span.slice(0, EVIDENCE_MAX),
                                     reason: 'identity-referents-unresolved' });
              continue;
            }
            var idType = (refs.length >= 2) ? 'identity_confirmation' : 'identity_unresolved';
            var idRec = {
              type: idType, category: TYPES[t].cat, family: familyOf(idType),
              sourceTurnIndex: idx, spanOrder: srcs[s].base + spans[j].i,
              sourceMode: 'NARRATION', epistemic: 'NARRATION_FACT_CANDIDATE',
              roleMode: 'identity',
              actor: refView(refs[0]), subject: refView(refs[0]),
              target: (refs.length >= 2) ? refView(refs[1]) : null,
              subjectId: refs[0].entityId,
              objectId: (refs.length >= 2) ? refs[1].entityId : null,
              recordKind: 'candidate',
              candidateReason: (refs.length >= 2) ? 'identity-confirmation-candidate'
                                                  : 'identity-referents-unresolved',
              argumentResolution: (refs.length >= 2) ? 'complete' : 'partial',
              missingArguments: (refs.length >= 2) ? [] : [{ role: 'referent', entityType: 'unknown',
                                     reason: 'second-referent-unresolved',
                                     evidence: span.slice(0, EVIDENCE_MAX) }],
              personCandidates: refs.map(refView),
              prov: { kind: srcs[s].kind, authority: srcs[s].authority, confidence: 0.55,
                      evidence: span.slice(0, EVIDENCE_MAX) }
            };
            res.records.push(idRec);
            res.entityRefs.push({ ref: refs[0], idx: idx });
            if (refs.length >= 2) res.entityRefs.push({ ref: refs[1], idx: idx });
            continue;
          }
          rr = resolveRoles(type, span, refs, kw);
          subj = rr.ok ? rr.actor : null;
          tgt  = rr.ok ? rr.target : null;
          var conf = subj ? ((subj.status === 'known' && !subj.ambiguous) ? 0.92 : 0.55) : 0.5;
          if (!rr.ok && rr.reason !== 'no-subject') conf = 0.6;        /* ★0.7 未満 */
          var rec = {
            type: type, category: TYPES[t].cat, family: familyOf(type), sourceTurnIndex: idx,
            spanOrder: srcs[s].base + spans[j].i,
            sourceMode: 'NARRATION', epistemic: 'NARRATION_FACT_CANDIDATE',
            roleMode: rr.ok ? rr.mode : null,
            actor: refView(subj), subject: refView(subj), target: refView(tgt),
            subjectId: subj ? subj.entityId : null,
            objectId: tgt ? tgt.entityId : null,
            recordKind: 'event',
            prov: { kind: srcs[s].kind, authority: srcs[s].authority, confidence: conf,
                    evidence: span.slice(0, EVIDENCE_MAX) }
          };
          /* ★fix190 が現在 state の authority。ME は経緯・原因・背景だけを持つ。
             state（傷/関係/未解決）は1バイトも複製しない。 */
          if (STATE_AUTHORITY_FIX190[rec.family]) { rec.stateAuthority = 'fix190'; rec.contextOnly = true; }
          /* ★v0.3(a) LOCATION_STATE: 場所は Entity 化しない。生 mention を証拠に持つだけ。
             人物の主格が同じ span に居るときは event にしない（人物へ誤帰属させない）。 */
          if (TYPES[t].place) {
            var pm = placeMentionAt(span, kw);
            var personNom = false;
            for (var pn = 0; pn < refs.length; pn++) if (particleAt(span, refs[pn]) === 'nom') personNom = true;
            rec.place = { mention: pm, resolved: false };
            if (pm && !personNom && !subj) {
              rec.prov.confidence = 0.9;                  /* 構造で決まったので event にしてよい */
              rec.roleMode = 'place-only';
            } else if (subj) {
              /* ★場所の状態変化の主語が人物になるのは格の取り違え（「カエデが…封鎖された」）。
                 v0.2 はここで event を作っていた。v0.3 は candidate へ落として断定しない。 */
              rec.recordKind = 'candidate';
              rec.candidateReason = 'place-subject-is-person';
            }
          }
          /* ★v0.3(a) 2項が要る family（関係・約束）は、両者が解決できたときだけ event */
          if (TYPES[t].two && !(rr.ok && rr.actor && rr.target)) {
            rec.recordKind = 'candidate';
            if (!rec.candidateReason) rec.candidateReason = 'binary-participants-unresolved';
          }
          /* ★監査3: 未知名詞句は Entity 化しない。取り逃しを測れるよう欠落を明示する。 */
          if (TYPES[t].cat === 'item') {
            rec.argumentResolution = 'partial';
            rec.missingArguments = [{ role: 'item', entityType: 'item',
                                      reason: 'unknown-noun-not-extracted',
                                      evidence: span.slice(0, EVIDENCE_MAX) }];
          } else if (TYPES[t].place) {
            rec.argumentResolution = 'partial';
            rec.missingArguments = [{ role: 'place', entityType: 'place',
                                      reason: 'place-entity-not-modeled',
                                      evidence: span.slice(0, EVIDENCE_MAX) }];
          } else {
            rec.argumentResolution = 'complete';
            rec.missingArguments = [];
          }
          if (rec.roleMode === 'place-only') {
            /* ★LOCATION_STATE は人物が主語ではない。人物の主語が無いことが**正しい形**なので、
               'no-subject' で candidate へ落とさない。場所は Entity 化しないまま
               missingArguments と place.mention に残す。 */
            rec.personCandidates = null;
          } else if (!rr.ok) {
            rec.recordKind = 'candidate';
            rec.candidateReason = rr.reason;   /* 'no-subject' | 'unresolved-roles' | 'coordinated-subject' */
            /* ★役割が決まらなくても、生の evidence と人物候補は残す */
            rec.personCandidates = (rr.people || []).map(refView);
          } else if (subj.ambiguous) { rec.recordKind = 'candidate'; rec.candidateReason = 'ambiguous-name'; }
          else if (subj.status !== 'known') { rec.recordKind = 'candidate'; rec.candidateReason = 'unknown-entity'; }

          if (STABLE_TRAIT[type] && subj) {                     /* ★安定形質は変更理由ゲート */
            var okReason = (srcs[s].kind === 'player_story');   /* STORY 入力の明示は理由になる */
            if (!okReason) {
              var sid = subj.entityId;
              okReason = hasOtherReason(crMap[j], sid, type)
                      || hasOtherReason((j > 0) ? crMap[j - 1] : null, sid, type);
            }
            if (!okReason) {
              rec.prov.disputed = true; rec.recordKind = 'candidate';
              if (!rec.candidateReason) rec.candidateReason = 'no-change-reason';
            }
          }
          if (rec.prov.confidence < 0.9 && rec.recordKind === 'event') {
            rec.recordKind = 'candidate'; if (!rec.candidateReason) rec.candidateReason = 'low-confidence';
          }
          res.records.push(rec);
          if (subj) res.entityRefs.push({ ref: subj, idx: idx });
          if (tgt) res.entityRefs.push({ ref: tgt, idx: idx });
        }
      }
    }
    /* ★v0.3(c): 発話行為。地の文とは別の経路で、構造化済み say カードからだけ読む。 */
    var sa = extractSpeechActs(turn, idx, kn), sk;
    for (sk = 0; sk < sa.length; sk++) res.records.push(sa[sk]);

    /* ★監査2: Event と Candidate を1本にまとめてから全体 sort し、ordinal を一度だけ振る */
    res.records.sort(cmpRec);
    assignOrdinals(res.records);
    res.events = res.records.filter(function (r) { return r.recordKind === 'event'; });
    res.candidates = res.records.filter(function (r) { return r.recordKind === 'candidate'; });
    return res;
  }
  /* span順 → type → subject → object → recordKind */
  function cmpRec(a, b) {
    if (a.spanOrder !== b.spanOrder) return a.spanOrder - b.spanOrder;
    if (a.type !== b.type) return a.type < b.type ? -1 : 1;
    var as = a.subjectId || '', bs = b.subjectId || ''; if (as !== bs) return as < bs ? -1 : 1;
    var ao = a.objectId || '', bo = b.objectId || ''; if (ao !== bo) return ao < bo ? -1 : 1;
    var ak = a.recordKind || '', bk = b.recordKind || ''; return ak === bk ? 0 : (ak < bk ? -1 : 1);
  }
  /* ordinal は「同じ (type, subject, object)」の中での 0起算連番。
     ★recordKind はキーに入れない。入れると event/candidate が両方 0 になり、
       eventId の分離を recordKind 1本に頼ることになる。両方で分離させる。 */
  function assignOrdinals(list) {
    var seen = {}, i, k;
    for (i = 0; i < list.length; i++) {
      k = list[i].type + '|' + (list[i].subjectId || '') + '|' + (list[i].objectId || '');
      list[i].ordinal = seen[k] = (seen[k] == null ? 0 : seen[k] + 1);
    }
    return list;
  }

  /* ==================================================================
   * スケジューラ（おしん指定4）
   *   externalSchedule : 外部からの変化通知。cache 破棄 + 1.2 秒。
   *   internalContinue : チャンク継続。cache 維持 + idle/0ms。
   * ================================================================ */
  var running = false, pendingFull = false, pendingFast = false, pendingChunk = false;
  var timerId = null, timerArmed = false, timerAt = 0, idleId = null, idleArmed = false;
  var _seq = { slotId: null, keys: null };
  function dropCache() { _seq.slotId = null; _seq.keys = null; }

  /* ★setTimeout の戻り値 0 を「未予約」と誤判定しないよう、真偽は専用フラグで持つ */
  function armTimer(ms) {
    var at = nowMs() + ms;
    if (timerArmed) { if (at >= timerAt) return; try { clearTimeout(timerId); } catch (e) {} timerArmed = false; }
    timerAt = at; timerArmed = true;
    timerId = setTimeout(function () {
      timerArmed = false; timerId = null; timerAt = 0; reconcile().catch(function () {});
    }, ms);
  }
  function externalSchedule(fromRenderAll) {
    if (!armed() || st.degraded) return;
    if (fromRenderAll) pendingFull = true; else pendingFast = true;
    dropCache();                              /* ★外部の変化合図＝鍵キャッシュを必ず捨てる */
    armTimer(1200);
  }
  function internalContinue() {
    if (!armed() || st.degraded) return;
    pendingChunk = true;                      /* ★cache は保持したまま次の30ターンへ */
    if (idleArmed || timerArmed) return;
    try {
      if (typeof window.requestIdleCallback === 'function') {
        idleArmed = true;
        idleId = window.requestIdleCallback(function () {
          idleArmed = false; idleId = null; reconcile().catch(function () {});
        }, { timeout: 200 });
        return;
      }
    } catch (e) { idleArmed = false; }
    armTimer(0);
  }
  /* 旧名（hook から呼ばれる） */
  function schedule(fromRenderAll) { externalSchedule(fromRenderAll); }

  /* ★内容アドレス方式のメモ。
       _memo.norm[i]   … そのターンの normTurn 文字列（contentHash の再計算を省くためだけ）
       _memo.chash[i]  … いまの contentHash
       _memo.prevIn[i] … key[i] を作ったときに使った「前ターン鍵」
       _memo.chashIn[i]… key[i] を作ったときに使った contentHash
       _memo.key[i]    … 得られた turnKey

     ★turnKey は (slotId, prevIn, chashIn) の純関数。再利用してよいのは
       「いまの prev」と「いまの chash」が、鍵を作ったときの入力と完全一致する
       ときだけ。norm での判定は使わない — contentHash を先に埋める段で
       norm を更新してしまい、判定が自分自身で無効化されるため（実測で踏んだ）。
     ★externalSchedule はこのメモを捨てない。捨てるのは「もう最新だ」という
       主張である _seq の方だけ。 */
  var _memo = { slotId: null, norm: [], chash: [], prevIn: [], chashIn: [], key: [] };
  var HBATCH = 200;                          /* contentHash の並列バッチ幅 */
  function memoReset(slotId) {
    _memo.slotId = slotId; _memo.norm = []; _memo.chash = []; _memo.prevIn = []; _memo.chashIn = []; _memo.key = [];
  }
  function memoTrim(n) {
    _memo.norm.length = n; _memo.chash.length = n;
    _memo.prevIn.length = n; _memo.chashIn.length = n; _memo.key.length = n;
  }

  function computeKeys(slotId, turns) {
    if (_seq.slotId === slotId && _seq.keys && _seq.keys.length === turns.length) {
      st.timings.hashMs = 0; return Promise.resolve(_seq.keys);
    }
    if (_memo.slotId !== slotId) memoReset(slotId);
    var t0 = nowMs();
    var N = turns.length, norms = new Array(N), need = [], i;
    for (i = 0; i < N; i++) {
      norms[i] = normTurn(turns[i]);
      if (_memo.norm[i] !== norms[i]) need.push(i);
    }
    /* ---- 第1段: contentHash は互いに独立なので並列で埋める ---- */
    function fillHashes(p) {
      if (p >= need.length) return Promise.resolve();
      var slice = need.slice(p, p + HBATCH);
      return Promise.all(slice.map(function (ix) {
        return h128(norms[ix]).then(function (c) { _memo.norm[ix] = norms[ix]; _memo.chash[ix] = c; });
      })).then(function () { return fillHashes(p + HBATCH); });
    }
    /* ---- 第2段: turnKey は鎖なので逐次。norm と prevIn が両方一致すれば SHA を呼ばない ---- */
    var keys = [], prev = 'GENESIS', j = 0;
    function step() {
      while (j < N) {
        if (_memo.key[j] && _memo.prevIn[j] === prev && _memo.chashIn[j] === _memo.chash[j]) {
          keys.push(prev = _memo.key[j]); j++; continue;
        }
        var ix = j, pin = prev, cin = _memo.chash[ix];
        return turnKeyOf(slotId, pin, cin).then(function (tk) {
          _memo.prevIn[ix] = pin; _memo.chashIn[ix] = cin; _memo.key[ix] = tk;
          keys.push(prev = tk); j++;
        }).then(step);
      }
      return Promise.resolve();
    }
    return fillHashes(0).then(step).then(function () {
      memoTrim(N);
      st.timings.hashMs = nowMs() - t0;
      _seq.slotId = slotId; _seq.keys = keys;
      return keys;
    });
  }

  /* ==================================================================
   * reconcile
   * ================================================================ */
  function reconcile() {
    if (off()) { st.lastStop = 'off'; return Promise.resolve('off'); }          /* ★OFF が最優先 */
    if (!optedIn()) { st.lastStop = 'not-armed'; return Promise.resolve('not-armed'); }
    if (st.degraded) { st.lastStop = 'degraded'; return Promise.resolve('degraded'); }
    if (running) { pendingFast = true; return Promise.resolve('busy'); }
    running = true;
    var full = pendingFull;
    pendingFull = false; pendingFast = false; pendingChunk = false;
    var t0 = nowMs(), tp = nowMs();
    var sl = resolveSlot();
    st.prof.resolve += nowMs() - tp;
    if (!sl.ok) { st.lastStop = sl.code; running = false; rearmIfPending(); return Promise.resolve(sl.code); }
    var slotChanged = (st.slotId !== sl.slotId);
    st.slotId = sl.slotId; st.turns = sl.turns.length;
    if (slotChanged) { st.countsFresh = false; dropCache(); memoReset(sl.slotId); blobForget(); ctxForget(); }

    var tCtx = nowMs();
    var kn = knownEntities(sl.blob, sl.slotId);
    return entityContextHash(sl.slotId, kn).then(function (ctx) {
    st.prof.ctx += nowMs() - tCtx;
    st.entityContextHash = ctx;
    var tChain = nowMs();
    return getChain(sl.slotId).then(function (old) {
      st.prof.chain += nowMs() - tChain;
      /* ★extractorVersion 不一致 slot へは追記しない */
      if (old && old.extractorVersion && old.extractorVersion !== EXTRACTOR_VERSION) {
        st.versionMismatch = true; st.rebuildRecommended = true; st.lastStop = 'version-mismatch';
        st.processedCount = old.processedCount || 0; st.chainKey = old.chainKey || null;
        return 'version-mismatch';
      }
      st.versionMismatch = false; st.rebuildRecommended = false;

      /* ★高速判定は「通常追記」のときだけ。renderAll 由来(null)は必ず全比較。
         ★おしん指定3: Entity 文脈が一致していることも必須にする。 */
      if (!full && old && old.entityContextHash === ctx
          && old.total === sl.turns.length && old.processedCount === sl.turns.length) {
        st.lastStop = 'fast-nochange'; st.processedCount = old.processedCount; st.chainKey = old.chainKey;
        return st.countsFresh ? 'nochange' : refreshCounts(sl.slotId).then(function () { return 'nochange'; });
      }
      var tKeys = nowMs();
      return computeKeys(sl.slotId, sl.turns).then(function (keys) {
        st.prof.keys += nowMs() - tKeys;
        /* ★Entity 文脈が変わっていたら、本文が同じでも全部作り直す。
           チャンクの途中で変わった場合もここへ来るので、1slot 内で
           異なる Entity 文脈の Event が混ざることはない。 */
        var ctxChanged = !old || old.entityContextHash !== ctx;
        var d = ctxChanged ? 0 : firstDiff(old, keys);
        if (ctxChanged && old) st.ctxRebuilds++;
        var doneUpTo = (old && !ctxChanged) ? Math.min(old.processedCount || 0, d) : 0;
        if (doneUpTo >= keys.length) {
          /* ★undo で短くなった場合もここへ来る。chain を書き直すだけでは
             d 以降（消えたターン由来）の event / entity が残ってしまうので、
             **必ず境界削除を伴う commit を通す**（event は0件）。 */
          var uh0 = ((old && old.unhandled) || []).filter(function (u) { return u.sourceTurnIndex < d; });
          return commit(sl.slotId, d, d, [], [], keys, keys.length, uh0, ctx).then(function (r) {
            st.lastStop = (r === 'ok') ? 'up-to-date' : r; return r === 'ok' ? 'up-to-date' : r;
          });
        }
        var end = Math.min(keys.length, doneUpTo + CHUNK);
        st.timings.lastChunkTurns = end - doneUpTo;
        st.chunks++;
        return processChunk(sl, keys, d, doneUpTo, end, old, kn, ctx).then(function (r) {
          if (end < keys.length) internalContinue();       /* ★cache 維持のまま次チャンク */
          return r;
        });
      });
    });
    }).then(function (r) {
      st.reconciles++; st.timings.lastReconcileMs = nowMs() - t0; st.busyMs += st.timings.lastReconcileMs;
      running = false; saveStat();
      rearmIfPending(); return r;
    }).catch(function (e) {
      running = false; degrade('reconcile:' + (e && e.message)); saveStat();
      rearmIfPending(); return 'error';
    });
  }
  /* ★おしん指定4: reconcile 終了時に pending が残っていたら必ず次回を予約する */
  function rearmIfPending() {
    if (!armed() || st.degraded) return;
    if (pendingFull || pendingFast) { armTimer(1200); return; }
    if (pendingChunk) internalContinue();
  }

  function processChunk(sl, keys, d, from, to, old, kn, ctx) {
    var known = kn || knownEntities(sl.blob, sl.slotId);
    var all = [], entMap = {};
    var unhandled = ((old && old.unhandled) || []).filter(function (u) { return u.sourceTurnIndex < d; });
    var i, r, j, tEx = nowMs();
    for (i = from; i < to; i++) {
      r = extractTurn(sl.turns[i], i, known);
      for (j = 0; j < r.records.length; j++) all.push({ rec: r.records[j], turnKey: keys[i] });
      for (j = 0; j < r.entityRefs.length; j++) touchEntity(entMap, sl.slotId, r.entityRefs[j].ref, i);
      for (j = 0; j < r.unhandled.length; j++) {
        if (unhandled.length < UNHANDLED_MAX) unhandled.push({ type: r.unhandled[j].type, turnKey: keys[i],
          sourceTurnIndex: i, evidence: r.unhandled[j].evidence, reason: r.unhandled[j].reason });
      }
      st.extracts++;
    }
    st.prof.extract += nowMs() - tEx;
    var tIds = nowMs();
    var rows = [], seq = 0;
    return all.reduce(function (p, it) {
      return p.then(function () {
        return eventIdOf(it.turnKey, it.rec.type, it.rec.subjectId, it.rec.objectId,
                         it.rec.ordinal, it.rec.recordKind).then(function (id) {
          var row = {
            eventId: id, slotId: sl.slotId, seq: seq++, turnKey: it.turnKey,
            sourceTurnIndex: it.rec.sourceTurnIndex,      /* ★削除境界用。同一性キーには使わない */
            spanOrder: it.rec.spanOrder, ordinal: it.rec.ordinal,
            type: it.rec.type, category: it.rec.category,
            family: it.rec.family || familyOf(it.rec.type),        /* ★v0.3(a) 9種のどれか */
            sourceMode: it.rec.sourceMode || 'NARRATION',
            epistemic: it.rec.epistemic || 'NARRATION_FACT_CANDIDATE',
            speechAct: it.rec.speechAct || null,                   /* ★v0.3(c) */
            knownTo: it.rec.knownTo,                               /* ★v0.3(d) 地の文は undefined */
            audience: it.rec.audience,
            worldFactPromotion: (it.rec.worldFactPromotion === true) ? true : false,
            stateAuthority: it.rec.stateAuthority || null,          /* fix190 が authority */
            contextOnly: !!it.rec.contextOnly,
            place: it.rec.place || null,
            recordKind: it.rec.recordKind,                /* 'event' | 'candidate' */
            disputed: (it.rec.prov && it.rec.prov.disputed) ? 1 : 0,   /* ★index 用に 0/1 で持つ */
            candidateReason: it.rec.candidateReason || null,
            roleMode: it.rec.roleMode || null,
            argumentResolution: it.rec.argumentResolution || 'complete',
            missingArguments: it.rec.missingArguments || [],
            personCandidates: it.rec.personCandidates || null,
            actor: it.rec.actor, subject: it.rec.subject, target: it.rec.target,
            subjectId: it.rec.subjectId, objectId: it.rec.objectId,
            payload: null, prov: it.rec.prov,
            schemaVersion: SCHEMA_VERSION, extractorVersion: EXTRACTOR_VERSION, createdAt: nowMs()
          };
          /* ★v0.3(d): 地の文由来は knownTo を**持たない**（scope 未主張）。
             undefined を入れて「主張しているが空」に見せない。 */
          if (it.rec.knownTo === undefined) { delete row.knownTo; delete row.audience; }
          rows.push(row);
        });
      });
    }, Promise.resolve()).then(function () {
      st.prof.ids += nowMs() - tIds;
      var ents = Object.keys(entMap).map(function (k) { return entMap[k]; });
      return commit(sl.slotId, d, from, rows, ents, keys, to, unhandled, ctx);
    });
  }

  /* ★未知／曖昧な固有名は正規 Entity へ昇格させず entity_candidate として保存する */
  function touchEntity(map, slotId, ref, idx) {
    var id = ref.entityId, e = map[id];
    var kind = (ref.status === 'known' && !ref.ambiguous) ? 'entity' : 'entity_candidate';
    if (!e) {
      map[id] = { slotId: slotId, entityId: id, name: ref.canonical || ref.raw, entityType: ref.entityType,
                  kind: kind, status: ref.status, ambiguous: !!ref.ambiguous,
                  firstSeenTurnIndex: idx, lastSeenTurnIndex: idx, mentions: 1, approx: true,
                  schemaVersion: SCHEMA_VERSION, extractorVersion: EXTRACTOR_VERSION, updatedAt: nowMs() };
      return;
    }
    if (idx < e.firstSeenTurnIndex) e.firstSeenTurnIndex = idx;
    if (idx > e.lastSeenTurnIndex) e.lastSeenTurnIndex = idx;
    e.mentions++;
  }

  /* ★おしん指定3: 1トランザクション内で
       cursor削除（events）→ cursor削除（entities）→ Entity put → Event put → chain put
     の順を保証する。cursor が null になったときだけ insertAndWriteChain() を1回だけ実行する。 */
  function commit(slotId, d, from, events, ents, keys, processedTo, unhandled, ctxHash) {
    return openDb().then(function (db) {
      if (!db) { degrade('idb-unavailable'); return 'degraded'; }
      var tx;
      try { tx = db.transaction(['events', 'entities', 'chain'], 'readwrite'); }
      catch (e) { degrade('idb-tx'); return 'degraded'; }
      var es = tx.objectStore('events'), ns = tx.objectStore('entities'), cs = tx.objectStore('chain');
      var wrote = false, aborted = false;

      /* ★v0.2.3: IDB の失敗を成功として扱わない。
         削除・取得・書込のどれか1つでも落ちたら transaction ごと abort し、
         processedCount と chain を進めない。Chronicle 本体は止めず、
         Memory Engine だけ degraded にする（fail-open の範囲はそこまで）。 */
      function fail(why) {
        if (aborted) return; aborted = true;
        degrade('idb-' + String(why || 'error'));
        try { tx.abort(); } catch (e) {}
      }

      function insertAndWriteChain() {
        if (aborted || wrote) return; wrote = true;      /* ★1回だけ */
        try {
          putEntities(function () {
            if (aborted) return;
            try {
              for (var i = 0; i < events.length; i++) es.put(events[i]);
              cs.put(buildChainRecord(slotId, keys.slice(0, processedTo), processedTo, unhandled, EXTRACTOR_VERSION, ctxHash));
            } catch (e) { fail('event-put'); }
          });
        } catch (e) { fail('insert'); }
      }
      /* entities は集計値なので get→merge→put（同一 tx 内で逐次） */
      function putEntities(done) {
        var i = 0;
        function next() {
          if (aborted) return;
          if (i >= ents.length) return done();
          var e = ents[i++], g;
          try { g = ns.get([slotId, e.entityId]); } catch (er) { return fail('entity-get'); }
          g.onerror = function () { fail('entity-get'); };   /* ★読めなければ進めない */
          g.onsuccess = function () {
            if (aborted) return;
            var o = g.result, m = e;
            if (o) {
              m = { slotId: slotId, entityId: e.entityId, name: o.name || e.name,
                    entityType: (o.entityType === e.entityType) ? e.entityType : 'unknown',
                    kind: (o.kind === 'entity' || e.kind === 'entity') ? 'entity' : 'entity_candidate',
                    status: (o.status === 'known' || e.status === 'known') ? 'known' : 'candidate',
                    ambiguous: !!(o.ambiguous || e.ambiguous),
                    firstSeenTurnIndex: Math.min(o.firstSeenTurnIndex | 0, e.firstSeenTurnIndex | 0),
                    lastSeenTurnIndex: Math.max(o.lastSeenTurnIndex | 0, e.lastSeenTurnIndex | 0),
                    mentions: (o.mentions | 0) + (e.mentions | 0), approx: true,
                    schemaVersion: SCHEMA_VERSION, extractorVersion: EXTRACTOR_VERSION, updatedAt: nowMs() };
            }
            try { ns.put(m); } catch (er) { return fail('entity-put'); }
            next();
          };
        }
        next();
      }
      /* 境界削除: events → entities の順に、それぞれ cursor が null になるまで */
      function delEntities(after) {
        var cur;
        try {
          cur = ns.index('by_slot_first_seen')
                  .openCursor(IDBKeyRange.bound([slotId, d], [slotId, Number.MAX_SAFE_INTEGER]));
        } catch (e) { return fail('entity-cursor'); }    /* ★開けなければ abort（after へ進まない） */
        cur.onsuccess = function () {
          if (aborted) return;
          var c = cur.result;
          if (c) {
            try { c.delete(); } catch (e) { return fail('entity-delete'); }   /* ★例外を握りつぶさない */
            c.continue();
          } else after();                                /* ★null になってから次段へ */
        };
        cur.onerror = function () { fail('entity-cursor'); };   /* ★失敗を成功扱いしない */
      }
      try {
        if (from === d) {                                /* このチャンクが最初＝境界の削除を行う */
          var cur = es.index('by_slot_source_index')
                      .openCursor(IDBKeyRange.bound([slotId, d], [slotId, Number.MAX_SAFE_INTEGER]));
          cur.onsuccess = function () {
            if (aborted) return;
            var c = cur.result;
            if (c) {
              try { c.delete(); } catch (e) { return fail('event-delete'); }  /* ★例外を握りつぶさない */
              c.continue();
            } else delEntities(insertAndWriteChain);     /* ★null になってから1回だけ */
          };
          cur.onerror = function () { fail('event-cursor'); };  /* ★失敗を成功扱いしない */
        } else {
          insertAndWriteChain();
        }
      } catch (e) { degrade('idb-write'); try { tx.abort(); } catch (e2) {} return 'degraded'; }

      var tTx = nowMs();
      return txDone(tx).then(function (ok) {
        st.prof.tx += nowMs() - tTx;
        /* ★abort / error のときは processedCount も chain も進めない */
        if (!ok) { if (!st.degraded) degrade('idb-abort'); st.countsFresh = false; return 'degraded'; }
        st.processedCount = processedTo;                 /* ★完了済み prefix だけ */
        st.chainKey = keys[processedTo - 1] || null;
        st.lastStop = 'ok';
        /* ★件数は IDB から実数で数え直す。ただし**そのパスを走り切ったチャンク**でだけ行う。
           チャンクごとに数え直すと O(チャンク数 × 全Event数) になり、
           1万ターンで 10.4 秒を件数計算だけに使ってしまう（実測）。
           途中は countsFresh=false を立てて「まだ確定していない」と示す。 */
        if (processedTo < keys.length) { st.countsFresh = false; return 'ok'; }
        var tC = nowMs();
        return refreshCounts(slotId).then(function () {
          st.prof.counts += nowMs() - tC; return 'ok';
        });
      });
    });
  }

  /* ==================================================================
   * counts を実数で再集計（おしん指定5）
   * ================================================================ */
  /* ★件数の数え方には2つの罠がある。実測で両方踏んだ。
       (1) getAll で全件読んで数えると、チャンクごとに O(全Event数) を払う
           → 1万ターンで二乗になる（24.2秒）
       (2) index.count() にしても、6本を別々の transaction で発行すると
           transaction 生成のオーバヘッドだけで 1回 39ms かかる
           → 334チャンクで 13.0秒（実測）
     読み取りは**1つの readonly transaction にまとめて**同期的に発行する。 */
  function refreshCounts(slotId) {
    var sid = slotId || st.slotId;
    if (!sid) { st.countsFresh = false; return Promise.resolve(null); }
    /* ★v0.2.3: 数えられなかったときに 0 件＋countsFresh=true にしない。
       「数えていない」と「0件だった」を取り違えないため。 */
    return openDb().then(function (db) {
      if (!db) { st.countsFresh = false; return null; }
      var tx;
      try { tx = db.transaction(['events', 'entities', 'chain'], 'readonly'); }
      catch (e) { st.countsFresh = false; return null; }
      var es = tx.objectStore('events'), ns = tx.objectStore('entities'), cs = tx.objectStore('chain');
      var q;
      try {
        q = [ es.index('by_slot').count(IDBKeyRange.only(sid)),
              es.index('by_slot_kind').count(IDBKeyRange.only([sid, 'candidate'])),
              es.index('by_slot_disputed').count(IDBKeyRange.only([sid, 1])),
              ns.index('by_slot').count(IDBKeyRange.only(sid)),
              ns.index('by_slot_kind').count(IDBKeyRange.only([sid, 'entity_candidate'])),
              cs.get(sid) ];
      } catch (e) { st.countsFresh = false; return null; }
      return Promise.all(q.map(reqP)).then(function (r) {
        var ch = r[5];
        /* count() が失敗すると reqP は null を返す。null が混ざったら数えたことにしない。 */
        for (var qi = 0; qi < 5; qi++) if (r[qi] == null) { st.countsFresh = false; return null; }
        st.counts = { events: (r[0] | 0) - (r[1] | 0), candidates: r[1] | 0, disputed: r[2] | 0,
                      unhandled: ((ch && ch.unhandled) || []).length,
                      entities: (r[3] | 0) - (r[4] | 0), entityCandidates: r[4] | 0 };
        st.countsFresh = true;
        if (ch) { st.processedCount = ch.processedCount || 0; st.chainKey = ch.chainKey || null; }
        return st.counts;
      });
    }).catch(function () { st.countsFresh = false; return null; });
  }

  /* ==================================================================
   * 孤児（記録のみ・自動削除しない）
   * ================================================================ */
  function scanOrphans() {
    return openDb().then(function (db) {
      if (!db) return [];
      var live = {};
      try {
        var meta = JSON.parse(lsg('chr6_slots_meta') || '[]');
        if (Array.isArray(meta)) meta.forEach(function (m) { if (m && m.id && !m.deleted) live[normSlot(m.id)] = 1; });
      } catch (e) {}
      live['chr6'] = 1;
      try {
        var tx = db.transaction('chain', 'readonly');
        return reqP(tx.objectStore('chain').getAllKeys()).then(function (ks) {
          var o = (ks || []).filter(function (k) { return !live[normSlot(k)]; });
          st.orphans = o; return o;                       /* ★消さない。記録して見せるだけ */
        });
      } catch (e) { return []; }
    });
  }

  /* ==================================================================
   * 観測値（localStorage・2KB上限・slotId を含めない）
   * ================================================================ */
  function saveStat() {
    if (!armed()) return;                    /* ★未武装なら localStorage へ何も書かない */
    try {
      var o = { v: 2, build: BUILD, schemaVersion: SCHEMA_VERSION, extractorVersion: EXTRACTOR_VERSION,
                degraded: st.degraded, reason: st.reason, lastStop: st.lastStop,
                processedCount: st.processedCount, events: st.counts.events, candidates: st.counts.candidates,
                disputed: st.counts.disputed, unhandled: st.counts.unhandled,
                entities: st.counts.entities, entityCandidates: st.counts.entityCandidates,
                orphans: st.orphans.length, versionMismatch: st.versionMismatch, updatedAt: nowMs() };
      var s = JSON.stringify(o);
      if (s.length > STAT_MAX) s = JSON.stringify({ v: 2, build: BUILD, degraded: st.degraded, updatedAt: nowMs() });
      lss(STAT_KEY, s);
    } catch (e) {}
  }

  /* ==================================================================
   * 起動（fail-open）
   * ================================================================ */
  /* ★Canary: v292Dfix670On === '1' の端末だけ起動する。
     未設定なら hook も timer も作らず、IndexedDB も localStorage も触らない。
     ゲーム本体（保存・描画・同期・生成）には何もしない。 */
  try {
    st.armed = armed() && !st.degraded;
    if (st.armed) {
      if (Array.isArray(window.UI && window.UI._renderHooks) || (typeof UI !== 'undefined' && Array.isArray(UI._renderHooks))) {
        var HK = (typeof UI !== 'undefined' && Array.isArray(UI._renderHooks)) ? UI._renderHooks : window.UI._renderHooks;
        /* ★index.html:1404 は renderAll から null、:1416 は appendTurn から turn。
           null は再描画由来なので高速判定を禁止して chain 全比較へ倒す。 */
        HK.push(function (turn) { try { externalSchedule(turn == null); } catch (e) {} });
      }
      window.addEventListener('pageshow', function () { try { externalSchedule(true); } catch (e) {} }, false);
      window.addEventListener('focus', function () { try { externalSchedule(true); } catch (e) {} }, false);
      setTimeout(function () {
        try {
          var sl0 = resolveSlot();
          if (sl0.ok) { st.slotId = sl0.slotId; refreshCounts(sl0.slotId); }   /* ★起動時に実数化 */
          externalSchedule(true); scanOrphans();
        } catch (e) {}
      }, 2500);
    }
  } catch (e) { degrade('boot:' + (e && e.message)); }

  /* ==================================================================
   * 公開 API
   * ================================================================ */
  function sortForRead(a) {
    return (a || []).slice().sort(function (x, y) {
      if ((x.sourceTurnIndex | 0) !== (y.sourceTurnIndex | 0)) return (x.sourceTurnIndex | 0) - (y.sourceTurnIndex | 0);
      if ((x.spanOrder | 0) !== (y.spanOrder | 0)) return (x.spanOrder | 0) - (y.spanOrder | 0);
      return (x.ordinal | 0) - (y.ordinal | 0);
    });
  }
  /* clear / clearOrphans / rebuild は entities も必ず消す */
  function wipeSlots(sids) {
    return openDb().then(function (db) {
      if (!db || !sids.length) return false;
      var tx;
      try { tx = db.transaction(['events', 'entities', 'chain'], 'readwrite'); } catch (e) { return false; }
      sids.forEach(function (sid) {
        try { tx.objectStore('chain').delete(sid); } catch (e) {}
        ['events', 'entities'].forEach(function (sn) {
          try {
            var cur = tx.objectStore(sn).index('by_slot').openCursor(IDBKeyRange.only(sid));
            cur.onsuccess = function () { var c = cur.result; if (c) { try { c.delete(); } catch (e) {} c.continue(); } };
          } catch (e) {}
        });
      });
      return txDone(tx);
    });
  }

  window.__v292Dfix670 = {
    __loaded: true, __armed: st.armed, build: BUILD,
    status: function () {
      return { build: BUILD, armed: st.armed, on: optedIn(), off: off(), active: armed(),
               degraded: st.degraded, reason: st.reason, lastStop: st.lastStop,
               schemaVersion: SCHEMA_VERSION, extractorVersion: EXTRACTOR_VERSION,
               families: FAMILIES.slice(),
               layers: { fold764: !!fixFold(), canon197: !!fix197() },
               crypto: st.crypto, idb: st.idb,
               slot: { id: st.slotId, turns: st.turns, processedCount: st.processedCount, chainKey: st.chainKey },
               counts: st.counts, countsFresh: st.countsFresh,
               timings: st.timings, reconciles: st.reconciles, extracts: st.extracts,
               shaCalls: st.shaCalls, chunks: st.chunks, busyMs: st.busyMs, prof: st.prof,
               ctxRebuilds: st.ctxRebuilds, entityContextHash: st.entityContextHash,
               orphans: st.orphans.slice(), versionMismatch: st.versionMismatch, rebuildRecommended: st.rebuildRecommended };
    },
    refreshCounts: function () { return refreshCounts(st.slotId); },
    /* ★v0.3: family 別の件数。store も index も増やさず、既存 by_slot_type の
       count() を1つの readonly transaction でまとめて発行して足し上げる。 */
    familyCounts: function () {
      var sid = st.slotId; if (!sid) return Promise.resolve(null);
      return openDb().then(function (db) {
        if (!db) return null;
        var types = Object.keys(FAM_OF), tx, q;
        try { tx = db.transaction('events', 'readonly'); } catch (e) { return null; }
        var ix;
        try { ix = tx.objectStore('events').index('by_slot_type');
              q = types.map(function (t) { return ix.count(IDBKeyRange.only([sid, t])); }); }
        catch (e) { return null; }
        return Promise.all(q.map(reqP)).then(function (r) {
          var out = {}, i;
          for (i = 0; i < FAMILIES.length; i++) out[FAMILIES[i]] = 0;
          for (i = 0; i < types.length; i++) {
            if (r[i] == null) return null;
            out[familyOf(types[i])] += (r[i] | 0);
          }
          return out;
        });
      }).catch(function () { return null; });
    },
    /* ★v0.2.1（監査5）: 後片付けの transaction の結果も返す。
       probe を消せなかったら ok にしない（書けたが消せない状態を成功と呼ばない）。 */
    selfTest: function () {
      return openDb().then(function (db) {
        if (!db) return { ok: false, writeOk: false, cleanupOk: false, reason: st.reason || 'no-idb' };
        try {
          var tx = db.transaction('meta', 'readwrite');
          tx.objectStore('meta').put({ k: '__probe', at: nowMs() });
          return txDone(tx).then(function (wOk) {
            var tx2;
            try { tx2 = db.transaction('meta', 'readwrite'); tx2.objectStore('meta').delete('__probe'); }
            catch (e) { return { ok: false, writeOk: !!wOk, cleanupOk: false, crypto: st.crypto, hooked: true, reason: 'cleanup-tx' }; }
            return txDone(tx2).then(function (cOk) {
              return { ok: !!wOk && !!cOk, writeOk: !!wOk, cleanupOk: !!cOk,
                       crypto: st.crypto, hooked: true };
            });
          });
        } catch (e) { return { ok: false, writeOk: false, cleanupOk: false, reason: 'tx' }; }
      });
    },
    /* ★公開 reconcile は cache を明示破棄する */
    reconcile: function () { dropCache(); pendingFull = true; return reconcile(); },
    events: function (n) { return readAll('events', st.slotId).then(function (a) { return sortForRead(a).slice(-(n || 20)); }); },
    entities: function () { return readAll('entities', st.slotId).then(function (a) {
      return (a || []).slice().sort(function (x, y) { return (x.firstSeenTurnIndex | 0) - (y.firstSeenTurnIndex | 0); }); }); },
    unhandled: function () { return getChain(st.slotId).then(function (c) { return (c && c.unhandled) || []; }); },
    orphans: function () { return scanOrphans(); },
    clearOrphans: function () {                                   /* ★明示呼び出しのみ */
      return scanOrphans().then(function (o) {
        if (!o.length) return [];
        return wipeSlots(o).then(function () { st.orphans = []; dropCache(); return o; });
      });
    },
    /* ★手動のみ。消してから単一 version で作り直す。
       ★v0.3: extractorVersion 不一致 slot へ**追記しない**規律はそのまま。
         .rebuild() は「消す」→「単一 version で作り直す」なので混在は起きない。
         消せなかったときは作り直さない（古い version の上へ書き足さないため）。 */
    rebuild: function () {
      var sl = resolveSlot(); if (!sl.ok) return Promise.resolve(sl.code);
      return window.__v292Dfix670.clear(sl.slotId).then(function (ok) {
        if (!ok) return 'clear-failed';
        dropCache(); pendingFull = true; return reconcile();
      });
    },
    clear: function (slotId) {
      var sid = slotId || st.slotId; if (!sid) return Promise.resolve(false);
      return wipeSlots([sid]).then(function (ok) {
        if (ok) {
          st.processedCount = 0; st.chainKey = null;
          st.counts = { events: 0, candidates: 0, unhandled: 0, disputed: 0, entities: 0, entityCandidates: 0 };
          st.countsFresh = true;
        }
        dropCache(); memoReset(null); blobForget(); ctxForget();   /* ★clear 後の cache 無効化 */
        return ok;
      });
    },
    /* 純関数（試験用・副作用なし） */
    __test: { normTurn: normTurn, contentHash: contentHash, turnKeyOf: turnKeyOf, eventIdOf: eventIdOf,
              turnKeyInput: turnKeyInput, eventIdInput: eventIdInput,
              extractTurn: extractTurn, assignOrdinals: assignOrdinals, cmpRec: cmpRec,
              buildChainRecord: buildChainRecord, firstDiff: firstDiff, resolveSlot: resolveSlot,
              splitSpans: splitSpans, gateBlocked: gateBlocked, knownEntities: knownEntities,
              knownNames: knownEntities, findRefs: findRefs, findSubject: findSubject, asKnown: asKnown,
              touchEntity: touchEntity,
              maskQuotes: maskQuotes, normSlot: normSlot, sortForRead: sortForRead,
              resolveRoles: resolveRoles, particleAt: particleAt, changeReasonMap: changeReasonMap,
              VERB_ROLES: VERB_ROLES, otherRolesFor: otherRolesFor, addName: addName,
              externalSchedule: externalSchedule, internalContinue: internalContinue,
              armed: armed, optedIn: optedIn, off: off, ON_KEY: ON_KEY, OFF_KEY: OFF_KEY,
              dropCache: dropCache, _seq: _seq, _memo: _memo, computeKeys: computeKeys,
              _blob: _blob, blobForget: blobForget, _ctx: _ctx, ctxForget: ctxForget,
              entityContextCanon: entityContextCanon, entityContextHash: entityContextHash, GEN_OK: GEN_OK,
              CHUNK: CHUNK, CKPT: CKPT, FOLD: CKPT, UNHANDLED_MAX: UNHANDLED_MAX, TYPES: TYPES,
              /* ---- v0.3 ---- */
              sayCanon: sayCanon, decorate: decorate,
              FAMILIES: FAMILIES, FAM_OF: FAM_OF, familyOf: familyOf,
              PRONOUN: PRONOUN, VOICE_OF: VOICE_OF, PLACE_SUFFIX: PLACE_SUFFIX,
              fixFold: fixFold, fix197: fix197, foldStr: foldStr, foldSpanSafe: foldSpanSafe,
              foldUnique: foldUnique, canonAlias: canonAlias, resolveMention: resolveMention,
              SPEECH_ACTS: SPEECH_ACTS, sayCards: sayCards, sayNorm: sayNorm,
              speakerOf: speakerOf, addresseesOf: addresseesOf,
              normalizeProposition: normalizeProposition, extractSpeechActs: extractSpeechActs,
              placeMentionAt: placeMentionAt, PROP_MAX: PROP_MAX, SAY_MAX: SAY_MAX,
              STATE_AUTHORITY_FIX190: STATE_AUTHORITY_FIX190 }
  };
  try {
    console.log(TAG, st.armed
      ? ('shadow armed (build ' + BUILD + ', extractor ' + EXTRACTOR_VERSION + ', families ' + FAMILIES.length + ')')
      : ('not armed — set localStorage ' + ON_KEY + "='1' and reload to opt in (build " + BUILD + ')'));
  } catch (e) {}
})();
