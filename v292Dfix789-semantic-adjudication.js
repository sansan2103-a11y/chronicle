/* =====================================================================
 * v292Dfix789-semantic-adjudication.js
 *   Phase 3A-2 Consolidate / 第1slice = Semantic Adjudication（shadow）
 * ---------------------------------------------------------------------
 * GPT 裁定（2026-09-01 深夜48）:
 *   ・3A-1 Extract は CLOSED のまま。**Extractor（fix670）へ戻らない**。
 *     このファイルは Extractor ではない。fix670 の TYPES / S1-S3 /
 *     EXTRACTOR_VERSION には 1 バイトも触れない。
 *   ・legacy narration TYPES の raw precision が低い（155T: FP 37/47・
 *     recordKind='event' の 5 件が 5 件とも誤り）ため、dedupe / lineage を
 *     作る前に semantic precision gate を通す。
 *   ・判定器は既存の凍結資産 **me1-semantics-2.0.0 を無改造で再利用**する
 *     （語彙追加・class 表追加・threshold 緩和はすべて禁止）。
 *   ・raw record は削除しない。recordKind='event' も raw extractor 結果として
 *     保持する。ただし **'event' であること自体は truth ではない**。
 *     semantic gate を PASS しない限り lineage を作らない。
 *
 * ★非交渉 invariant
 *   - raw recordKind='event' だけを理由に Memory lineage を作らない。
 *   - Known FP を lineageEligible=true にしない。
 *   - UNCERTAIN も lineageEligible=false（初版は precision 優先）。
 *
 * ★境界
 *   - canonical write 0 / Planner injection 0 / Narrative 影響 0 / Worker 0。
 *   - fix670 の IDB（chr6mem）は **読むだけ**。verdict は別 DB(chr6adj)へ書く。
 *     fix670 の schema・version・rebuild に一切干渉しない。
 *   - Speech（S1-S3 signature / v0.3 マーカー / written record）は **対象外**。
 *     発話側 precision は既に 4.3% であり、この gate の対象は legacy narration。
 *
 * opt-in : v292Dfix670On === '1'（ME 本体と同じ。ME が無ければ何もしない）
 * kill   : v292Dfix789Off === '1' → 完全停止（verdict を 1 件も作らない）
 * API    : window.__v292Dfix789
 *            .status()                 … 観測値
 *            .adjudicate(slotId?)      … chr6mem を読んで verdict を chr6adj へ
 *            .summary(slotId?)         … verdict 集計
 *            .clear(slotId?)           … verdict 削除（raw には触らない）
 *            .__test                   … fixture 用
 * ===================================================================== */
(function () {
  'use strict';
  var TAG = '[fix789.adj]';
  var ADJ_VERSION = 'adj-1.0.0';
  var ME1_URL = 'v292Dfix789-me1-semantics-2.0.0.js';   /* me1-semantics-2.0.0 を byte 同一で配置したもの */
  var DB_NAME = 'chr6adj';                              /* ★fix670 の chr6mem とは別 DB */
  var DB_VER = 1;
  var STORE = 'verdicts';

  function lsg(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function log() { try { console.warn.apply(console, [TAG].concat([].slice.call(arguments))); } catch (e) {} }
  function nowMs() { try { return Date.now(); } catch (e) { return 0; } }

  var st = {
    build: '20260901-fix789', adjVersion: ADJ_VERSION,
    me1: null, me1Version: null, me1Error: null,
    lastRun: null, counts: null, degraded: false, reason: null
  };

  function optedIn() { return lsg('v292Dfix670On') === '1'; }
  function off() { return lsg('v292Dfix789Off') === '1'; }
  function armed() { return optedIn() && !off(); }

  /* ------------------------------------------------------------------
   * me1-semantics のロード。★bytes を改変せずに読む。
   *   CommonJS のまま配置されているので module/exports/require を与えて評価する。
   *   取得できなければ degraded（verdict を 1 件も作らない＝安全側）。
   * ---------------------------------------------------------------- */
  var me1Promise = null;
  function loadMe1() {
    if (me1Promise) return me1Promise;
    me1Promise = fetch(ME1_URL, { cache: 'force-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function (src) {
      var mod = { exports: {} };
      var fn = new Function('module', 'exports', 'require', src);
      /* me1 が宣言している唯一の依存は require('crypto')。それは module 内の
         sha256() でしか使われず、sha256() は run() の resultDigest でしか呼ばれない。
         この slice は run() を使わず e4Extract / a2Theme / a2Sense / splitHead /
         classifyHead だけを使うので、**呼ばれたら明示的に落ちる shim** を渡す。
         ★me1 の bytes は 1 バイトも変えない（宣言された依存を満たすだけ）。 */
      fn(mod, mod.exports, function (name) {
        if (name === 'crypto') {
          return { createHash: function () {
            throw new Error('me1-digest-unavailable-in-browser (run() is not used by fix789)');
          } };
        }
        throw new Error('require-not-available:' + name);
      });
      var m = mod.exports;
      if (!m || typeof m.a2Theme !== 'function' || typeof m.classifyHead !== 'function') {
        throw new Error('me1-contract-missing');
      }
      st.me1 = m; st.me1Version = String(m.COMPONENT || 'me1') + '-' + String(m.VERSION || '?');
      return m;
    }).catch(function (e) {
      st.degraded = true; st.reason = 'me1-load-failed'; st.me1Error = String(e && e.message || e);
      log('me1 load failed', st.me1Error);
      return null;
    });
    return me1Promise;
  }

  /* ==================================================================
   * type-aware mapping（profiling で確定した版）
   *   ★「nonItem だから reject」ではない。**event type が期待する semantic
   *     domain と、me1 が読んだ theme の class / reality の整合**を見る。
   * ================================================================ */
  var ITEM_TYPES = ['item_acquired', 'item_broken', 'item_lost', 'item_used',
                    'item_transferred', 'item_consumed'];
  var PLACE_TYPES = ['terrain_changed', 'seal_state_changed', 'location_access_changed'];
  var PERSON_TYPES = ['affiliation_changed', 'wound_persistent', 'harm_context_recorded',
                      'relation_formed', 'relation_broken'];
  /* 期待 domain が item/place/person のいずれでもない type は **判定しない**
     （me1 の item gate を当てるのが誤りになるため。例: name_declared / discovery_made） */
  function domainOf(type) {
    if (ITEM_TYPES.indexOf(type) >= 0) return 'item';
    if (PLACE_TYPES.indexOf(type) >= 0) return 'place';
    if (PERSON_TYPES.indexOf(type) >= 0) return 'person';
    return 'unscoped';
  }

  /* 記録自身の keyword 位置を出すための re。★fix670 の TYPES と同値を写しただけで、
     抽出には一切使わない（抽出は fix670 が済ませている）。 */
  var TYPE_RE = {
    item_acquired: /(受け取っ|手に入れ|拾(?:っ|い上げ)|入手し)/,
    item_broken: /(壊れ|砕け|割れ|折れて使えな)/,
    item_lost: /(失くし|落とし|紛失|見失っ)/,
    item_used: /(使っ|用い|かざし)/,
    item_transferred: /(渡し|手渡し|譲っ|奪っ|奪い取っ)/,
    item_consumed: /(飲み干し|食べ切っ|使い切っ|消費し)/,
    terrain_changed: /(崩落|崩れ落ち|塞がれ|埋まっ|開通|焼け落ち|橋が落ち)/,
    seal_state_changed: /(封印(が|を)(破|解|砕)|結界(が|を)(破|解))/,
    affiliation_changed: /(に所属|の一員となっ|を離脱|を抜け)/,
    wound_persistent: /(重傷|骨が折れ|腕を失|足を失|失明|深い傷)/
  };
  var SIMILE = ['ような', 'ように', 'ごとく', 'みたいに'];
  var TAIL_PARTICLE = /(?:が|は|を|へ|に|も|と|で|の|から|まで|より)+$/;

  /* keyword 直前の名詞句。読点・空白は「間」なので跨いで戻り、末尾助詞は落とす。
     （最初の版はここで切れてしまい「天井の」「彼の声は、」が unknown になっていた） */
  function npBeforeKw(text, kw) {
    var head = String(text || '').slice(0, kw).replace(/[\s　、，,]+$/, '');
    var m = /([^\s　。、，,！？!?「」『』（）—\-]{1,24})$/.exec(head);
    if (!m) return null;
    var np = m[1].replace(TAIL_PARTICLE, '');
    return np || null;
  }
  function classOfNp(m1, np) {
    if (!m1 || !np) return null;
    try {
      var sh = m1.splitHead(np);
      return m1.classifyHead(sh.head, np);
    } catch (e) { return null; }
  }
  /* me1 の theme 判定（e4Extract → a2Theme → a2Sense）。★me1 は無改造。
     promotionGate は identityRes 済み itemId を前提とするためここでは使わず、
     promotionGate 自身が最初に見る signal（identityEligibilityFalse / sense /
     eventReality）を直接読む。 */
  function unitsOf(m1, text) {
    try {
      var s = m1.e4Extract(text, {});
      s = m1.a2Theme(s.units, text, {});
      s = m1.a2Sense(s.units, text, {});
      return (s.units || []).filter(function (u) { return u.decision === 'span'; });
    } catch (e) { return []; }
  }

  var V = { ACCEPT: 'ACCEPT', REJ_MISMATCH: 'REJECT_SEMANTIC_MISMATCH',
            REJ_FIG: 'REJECT_FIGURATIVE', UNCERTAIN: 'UNCERTAIN' };

  /* 1 record の裁定。rec = { type, evidence } 相当。 */
  function adjudicateOne(m1, type, evidence) {
    var ev = String(evidence || '');
    var domain = domainOf(type);
    if (domain === 'unscoped') return { v: V.ACCEPT, why: 'UNSCOPED_TYPE', cls: null };
    if (!m1) return { v: V.UNCERTAIN, why: 'ME1_UNAVAILABLE', cls: null };
    if (!ev) return { v: V.UNCERTAIN, why: 'NO_EVIDENCE', cls: null };

    var re = TYPE_RE[type] || null;
    var kw = re ? ev.search(re) : -1;
    var units = unitsOf(m1, ev);
    var u = null;
    if (units.length && kw >= 0) {
      /* 同じ span に別事象の unit が混ざるので、**記録自身の keyword に最も近い**
         unit を選ぶ（例:「茶盆を置いた…目を落とした」は 落と 側が当該記録）。 */
      u = units.slice().sort(function (a, b) {
        return Math.abs(a.predicateAt - kw) - Math.abs(b.predicateAt - kw);
      })[0];
    } else if (units.length) { u = units[0]; }

    if (u) {
      if (u.eventReality === 'figurative') return { v: V.REJ_FIG, why: 'ME1_FIGURATIVE', cls: u.semanticClass };
      if (domain === 'item') {
        if (u.identityEligibilityFalse) return { v: V.REJ_MISMATCH, why: 'ME1_IE_FALSE:' + u.semanticClass, cls: u.semanticClass };
        if (u.sense === 'invalid') return { v: V.REJ_MISMATCH, why: 'ME1_SENSE_INVALID', cls: u.semanticClass };
        if (u.semanticClass === 'trackable_physical_object') return { v: V.ACCEPT, why: 'ME1_ITEM_OK', cls: u.semanticClass };
        /* ★unknown を ACCEPT にはしない。実測で FP 9 件（偽 event T152 を含む）が
           復活し、非交渉 invariant を壊すことが確認されている。 */
        return { v: V.UNCERTAIN, why: 'ME1_' + u.semanticClass + '_' + u.sense, cls: u.semanticClass };
      }
    }
    var simile = SIMILE.some(function (x) { return ev.indexOf(x) >= 0; });
    var np = kw >= 0 ? npBeforeKw(ev, kw) : null;
    var cls = classOfNp(m1, np);
    if (simile) return { v: V.REJ_FIG, why: 'SIMILE', cls: cls };
    if (!np) return { v: V.ACCEPT, why: 'NO_ME1_OPINION', cls: null };
    var nonItem = (m1.CLASS_PARTITION && m1.CLASS_PARTITION.nonItem) || [];
    if (domain === 'item') {
      if (cls === 'trackable_physical_object') return { v: V.ACCEPT, why: 'NP_ITEM', cls: cls };
      if (nonItem.indexOf(cls) >= 0 || cls === 'part_of_object' || cls === 'substance' ||
          cls === 'formal_noun_reference') return { v: V.REJ_MISMATCH, why: 'NP_' + cls, cls: cls };
      return { v: V.UNCERTAIN, why: 'NP_' + cls, cls: cls };
    }
    if (domain === 'place') {
      return cls === 'place_or_environment' ? { v: V.ACCEPT, why: 'NP_PLACE', cls: cls }
                                            : { v: V.REJ_MISMATCH, why: 'NP_' + cls, cls: cls };
    }
    if (domain === 'person') {
      return cls === 'person' ? { v: V.ACCEPT, why: 'NP_PERSON', cls: cls }
                              : { v: V.REJ_MISMATCH, why: 'NP_' + cls, cls: cls };
    }
    return { v: V.ACCEPT, why: 'DEFAULT', cls: cls };
  }

  /* ★Speech 由来 record は対象外。gate を当てず、判定そのものを付けない。 */
  function isSpeechRecord(row) {
    return !!(row && (row.speechAct || row.writtenRecord));
  }
  /* lineageEligible は ACCEPT のときだけ true。UNCERTAIN も false（precision 優先）。 */
  function eligibleOf(v) { return v === V.ACCEPT; }

  /* ------------------------------------------------------------------ IDB */
  function openAdj() {
    return new Promise(function (res, rej) {
      var q;
      try { q = window.indexedDB.open(DB_NAME, DB_VER); } catch (e) { return rej(e); }
      q.onupgradeneeded = function () {
        var db = q.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var os = db.createObjectStore(STORE, { keyPath: 'eventId' });
          os.createIndex('by_slot', 'slotId', { unique: false });
        }
      };
      q.onsuccess = function () { res(q.result); };
      q.onerror = function () { rej(q.error); };
    });
  }
  /* ★chr6mem は **読むだけ**。version を指定せずに開き、upgrade は起こさない。 */
  function readRawEvents(slotId) {
    return new Promise(function (res, rej) {
      var q;
      try { q = window.indexedDB.open('chr6mem'); } catch (e) { return rej(e); }
      q.onupgradeneeded = function () { try { q.transaction.abort(); } catch (e) {} };
      q.onsuccess = function () {
        var db = q.result;
        if (!db.objectStoreNames.contains('events')) { db.close(); return res([]); }
        var tx = db.transaction(['events'], 'readonly');
        var g = tx.objectStore('events').getAll();
        g.onsuccess = function () {
          var rows = (g.result || []).filter(function (r) { return !slotId || r.slotId === slotId; });
          db.close(); res(rows);
        };
        g.onerror = function () { db.close(); rej(g.error); };
      };
      q.onerror = function () { rej(q.error); };
    });
  }
  function putVerdicts(list) {
    return openAdj().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction([STORE], 'readwrite');
        var os = tx.objectStore(STORE);
        list.forEach(function (v) { os.put(v); });
        tx.oncomplete = function () { db.close(); res(list.length); };
        tx.onerror = function () { db.close(); rej(tx.error); };
      });
    });
  }
  function getVerdicts(slotId) {
    return openAdj().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction([STORE], 'readonly');
        var g = tx.objectStore(STORE).getAll();
        g.onsuccess = function () {
          var rows = (g.result || []).filter(function (r) { return !slotId || r.slotId === slotId; });
          db.close(); res(rows);
        };
        g.onerror = function () { db.close(); rej(g.error); };
      });
    });
  }

  /* ------------------------------------------------------------------ run */
  function adjudicate(slotId) {
    if (!armed()) return Promise.resolve({ ok: false, reason: off() ? 'killed' : 'not-opted-in' });
    var t0 = nowMs();
    return loadMe1().then(function (m1) {
      return readRawEvents(slotId).then(function (rows) {
        var out = [], skipped = 0;
        rows.forEach(function (row) {
          if (!row || !row.eventId) return;
          if (isSpeechRecord(row)) { skipped++; return; }        /* ★Speech は対象外 */
          var r = adjudicateOne(m1, row.type, (row.prov && row.prov.evidence) || '');
          out.push({
            eventId: row.eventId, slotId: row.slotId,
            sourceTurnIndex: row.sourceTurnIndex, type: row.type,
            recordKind: row.recordKind,                          /* raw のまま保持（truth ではない） */
            semanticVerdict: r.v, semanticReason: r.why, semanticClass: r.cls,
            lineageEligible: eligibleOf(r.v),
            adjudicator: st.me1Version || 'unavailable',
            adjVersion: ADJ_VERSION, createdAt: nowMs()
          });
        });
        return putVerdicts(out).then(function () {
          var c = { total: out.length, speechSkipped: skipped, eligible: 0 };
          out.forEach(function (v) {
            c[v.semanticVerdict] = (c[v.semanticVerdict] || 0) + 1;
            if (v.lineageEligible) c.eligible++;
          });
          st.lastRun = nowMs(); st.counts = c;
          return { ok: true, ms: nowMs() - t0, counts: c, me1: st.me1Version, degraded: st.degraded };
        });
      });
    });
  }
  function summary(slotId) {
    return getVerdicts(slotId).then(function (rows) {
      var c = { total: rows.length, eligible: 0, byVerdict: {}, byReason: {},
                eventKindEligible: 0 };
      rows.forEach(function (v) {
        c.byVerdict[v.semanticVerdict] = (c.byVerdict[v.semanticVerdict] || 0) + 1;
        c.byReason[v.semanticReason] = (c.byReason[v.semanticReason] || 0) + 1;
        if (v.lineageEligible) c.eligible++;
        if (v.recordKind === 'event' && v.lineageEligible) c.eventKindEligible++;
      });
      return c;
    });
  }
  function clear(slotId) {
    return getVerdicts(slotId).then(function (rows) {
      return openAdj().then(function (db) {
        return new Promise(function (res, rej) {
          var tx = db.transaction([STORE], 'readwrite');
          var os = tx.objectStore(STORE);
          rows.forEach(function (r) { os.delete(r.eventId); });
          tx.oncomplete = function () { db.close(); res(rows.length); };
          tx.onerror = function () { db.close(); rej(tx.error); };
        });
      });
    });
  }

  window.__v292Dfix789 = {
    __loaded: true, build: st.build,
    status: function () {
      return { build: st.build, adjVersion: ADJ_VERSION, on: optedIn(), off: off(), active: armed(),
               me1: st.me1Version, me1Error: st.me1Error, degraded: st.degraded, reason: st.reason,
               lastRun: st.lastRun, counts: st.counts, db: DB_NAME,
               scope: 'legacy-narration-only (speech records are not adjudicated)' };
    },
    adjudicate: adjudicate, summary: summary, clear: clear, getVerdicts: getVerdicts,
    __test: {
      adjudicateOne: adjudicateOne, domainOf: domainOf, npBeforeKw: npBeforeKw,
      classOfNp: classOfNp, unitsOf: unitsOf, isSpeechRecord: isSpeechRecord,
      eligibleOf: eligibleOf, loadMe1: loadMe1, V: V, TYPE_RE: TYPE_RE,
      ITEM_TYPES: ITEM_TYPES, PLACE_TYPES: PLACE_TYPES, PERSON_TYPES: PERSON_TYPES,
      SIMILE: SIMILE, ADJ_VERSION: ADJ_VERSION, ME1_URL: ME1_URL, DB_NAME: DB_NAME
    }
  };
  /* ★自動実行しない。ME 本体の reconcile にも一切フックしない（Narrative 影響 0）。
     評価は明示的に __v292Dfix789.adjudicate() を呼んだときだけ走る。 */
})();
