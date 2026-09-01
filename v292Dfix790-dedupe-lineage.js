/* =====================================================================
 * v292Dfix790-dedupe-lineage.js
 *   Phase 3A-2 Consolidate / 第2slice = Dedupe（shadow）
 * ---------------------------------------------------------------------
 * GPT 裁定（2026-09-01 深夜50）:
 *   ・Dedupe の目的は「似た Memory を削除する」ことでは**ない**。
 *     同じ出来事 / 同じ claim について複数の raw record を
 *     **1 つの lineage + 複数 attestation** として束ねること。
 *     ★raw record は削除しない。
 *   ・入力は Narration 側 = semantic gate（fix789）で lineageEligible=true の
 *     ものだけ。REJECT / UNCERTAIN は lineage へ入れない。
 *     Speech 側 = 既存 Speech safety contract を保った candidate だけ。
 *   ・**claim と world fact を同じ truth lineage へ直接 merge しない**
 *     （epistemic status が違う。関係付けは後続 Update/Conflict slice）。
 *
 * ★禁止（実装に入れていないことを機械で確認できるように書く）
 *   raw 削除 / 全文類似度だけの merge / turn 近接だけの merge / speaker 無視 /
 *   claim と fact の同一 truth 化 / pronoun 強制 resolve / unknown entity 生成 /
 *   embedding / vector DB / 新 provider / canonical write / Planner injection
 *
 * ★束ねる根拠（既存情報だけを使う。類似度スコアは 1 つも使わない）
 *   Rule N（world_event）:
 *     同一 slot・**同一 turn**・同一 type で、prov.kind が
 *     narration 側と player 側の**両方**を含むとき＝
 *     「1 つの出来事を、地の文と player 入力が二重に記録した」形。
 *     ※ turn が違うものは束ねない（turn 近接 merge の禁止）。
 *     ※ 同一 turn でも両方 narration なら束ねない（別事象の可能性）。
 *   Rule S（dialogue_claim / NEGATION_CLAIM のみ）:
 *     同一 speakerEntityId（両方 non-null）・同一 speechAct.kind・同一 type で、
 *     命題の**構造核（topic, 否定される補語）が一致**するとき＝同一 claim の再言明。
 *     ※ 「同じ内容っぽい」では束ねない。核が取れなければ singleton。
 *
 * 境界: chr6mem（raw）と chr6adj（verdict）は **読むだけ**。
 *       lineage は **別 DB chr6lin** へ書く。fix670 / fix789 の schema に触れない。
 * opt-in: v292Dfix670On === '1' / kill: v292Dfix790Off === '1'
 * API   : window.__v292Dfix790 .status() .build(slotId?) .summary(slotId?)
 *                              .getLineages(slotId?) .clear(slotId?) .__test
 * ===================================================================== */
(function () {
  'use strict';
  var TAG = '[fix790.lineage]';
  var DEDUPE_VERSION = 'dedupe-1.0.0';
  var DB_NAME = 'chr6lin';          /* ★fix670(chr6mem) / fix789(chr6adj) とは別 DB */
  var DB_VER = 1;
  var STORE = 'lineages';

  function lsg(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function nowMs() { try { return Date.now(); } catch (e) { return 0; } }
  function optedIn() { return lsg('v292Dfix670On') === '1'; }
  function off() { return lsg('v292Dfix790Off') === '1'; }
  function armed() { return optedIn() && !off(); }

  var st = { build: '20260901-fix790', dedupeVersion: DEDUPE_VERSION, lastRun: null, counts: null };

  /* ---------------- lineage class（★claim と world fact を混ぜない） ------- */
  var CLASS_WORLD = 'world_event';
  var CLASS_CLAIM = 'dialogue_claim';
  function classOf(row) {
    /* 発話・文書由来は claim。地の文由来は world_event。
       ★この 2 つは **決して同じ lineage に入らない**（epistemic status が違う）。 */
    return (row && (row.speechAct || row.writtenRecord)) ? CLASS_CLAIM : CLASS_WORLD;
  }

  /* ---------------- Rule N: 地の文 × player の二重記録 -------------------- */
  var PLAYER_KINDS = ['player_do', 'player_story', 'player'];
  function isPlayerSource(k) { return PLAYER_KINDS.indexOf(String(k)) >= 0; }
  function isNarrationSource(k) { return String(k) === 'narration'; }

  /* ---------------- Rule S: NEGATION_CLAIM の構造核 ---------------------- */
  /* 「XはYではない/じゃない」の (topic, complement)。fix787 S3 と同じ構造を読む。
     ★類似度ではなく構造。核が取れなければ null を返し、singleton にする。 */
  var COP_NEG = /(?:では|じゃ)[、,\s]*(?:ない|ねえ|ねぇ|ありません|なかった|なかろう)/;
  var LEAD_CONNECTIVE = /^(?:でも|だが|しかし|けれど|けど|それでも|そして|だから)[、,\s]*/;
  var FILLER = /[…‥]+|[、，,]な[、，,]|^[\s　]+|[\s　]+$/g;
  function negCore(prop) {
    var s = String(prop || '').replace(LEAD_CONNECTIVE, '').replace(FILLER, '');
    var m = COP_NEG.exec(s);
    if (!m) return null;
    var head = s.slice(0, m.index);
    /* complement = 否定される直前の名詞（「わしの娘」→「娘」: 最後の「の」で切る） */
    var comp = head;
    var hasTopic = comp.indexOf('は') >= 0;
    var topic = null;
    if (hasTopic) {
      var ti = comp.indexOf('は');
      topic = comp.slice(0, ti).replace(/[、，,\s]+$/, '');
      comp = comp.slice(ti + 1);
    }
    comp = comp.replace(/^[、，,\s]+/, '');
    var g = comp.lastIndexOf('の');
    if (g >= 0 && g + 1 < comp.length) comp = comp.slice(g + 1);
    comp = comp.replace(/[、，,\s]+/g, '');
    if (!comp) return null;
    if (topic !== null) { topic = topic.replace(/[、，,\s]+/g, ''); if (!topic) topic = null; }
    return { topic: topic, complement: comp };
  }

  /* ---------------- lineage key ------------------------------------------ */
  function lineageKeyOf(row, groupTag) {
    return [row.slotId, classOf(row), groupTag].join('|');
  }

  /* ★grouping。**ここが束ねる根拠の全て**。類似度も turn 近接も使っていない。 */
  function groupTagsFor(rows) {
    var byTurnType = {}, i, r, k;
    for (i = 0; i < rows.length; i++) {
      r = rows[i];
      if (classOf(r) !== CLASS_WORLD) continue;
      k = r.sourceTurnIndex + '|' + r.type;
      (byTurnType[k] = byTurnType[k] || []).push(r);
    }
    var tags = {};                       /* eventId -> groupTag */
    Object.keys(byTurnType).forEach(function (k) {
      var g = byTurnType[k];
      var hasNarr = g.some(function (x) { return isNarrationSource(x.prov && x.prov.kind); });
      var hasPlayer = g.some(function (x) { return isPlayerSource(x.prov && x.prov.kind); });
      /* Rule N: 同一 turn・同一 type で、地の文と player 入力の**両方**があるときだけ束ねる */
      if (g.length >= 2 && hasNarr && hasPlayer) {
        g.forEach(function (x) { tags[x.eventId] = 'N:' + k; });
      } else {
        g.forEach(function (x) { tags[x.eventId] = 'E:' + x.eventId; });
      }
    });
    /* Rule S: NEGATION_CLAIM の再言明 */
    for (i = 0; i < rows.length; i++) {
      r = rows[i];
      if (classOf(r) !== CLASS_CLAIM) continue;
      var sa = r.speechAct;
      var core = (sa && sa.kind === 'NEGATION_CLAIM' && sa.speakerEntityId)
        ? negCore(sa.normalizedProposition) : null;
      if (core) {
        tags[r.eventId] = 'S:' + sa.kind + ':' + sa.speakerEntityId + ':' +
                          (core.topic == null ? '' : core.topic) + ':' + core.complement;
      } else {
        tags[r.eventId] = 'E:' + r.eventId;
      }
    }
    return tags;
  }

  /* ---------------- IDB --------------------------------------------------- */
  function openLin() {
    return new Promise(function (res, rej) {
      var q; try { q = window.indexedDB.open(DB_NAME, DB_VER); } catch (e) { return rej(e); }
      q.onupgradeneeded = function () {
        var db = q.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var os = db.createObjectStore(STORE, { keyPath: 'lineageId' });
          os.createIndex('by_slot', 'slotId', { unique: false });
        }
      };
      q.onsuccess = function () { res(q.result); };
      q.onerror = function () { rej(q.error); };
    });
  }
  function readAll(dbName, store, slotId) {
    return new Promise(function (res, rej) {
      var q; try { q = window.indexedDB.open(dbName); } catch (e) { return rej(e); }
      q.onupgradeneeded = function () { try { q.transaction.abort(); } catch (e) {} };
      q.onsuccess = function () {
        var db = q.result;
        if (!db.objectStoreNames.contains(store)) { db.close(); return res([]); }
        var tx = db.transaction([store], 'readonly');      /* ★readonly のみ */
        var g = tx.objectStore(store).getAll();
        g.onsuccess = function () {
          var rows = (g.result || []).filter(function (r) { return !slotId || r.slotId === slotId; });
          db.close(); res(rows);
        };
        g.onerror = function () { db.close(); rej(g.error); };
      };
      q.onerror = function () { rej(q.error); };
    });
  }
  function putLineages(list) {
    return openLin().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction([STORE], 'readwrite');
        var os = tx.objectStore(STORE);
        list.forEach(function (l) { os.put(l); });
        tx.oncomplete = function () { db.close(); res(list.length); };
        tx.onerror = function () { db.close(); rej(tx.error); };
      });
    });
  }

  /* ---------------- build ------------------------------------------------- */
  function buildLineages(rawRows, verdictRows) {
    var vBy = {};
    (verdictRows || []).forEach(function (v) { vBy[v.eventId] = v; });
    /* 入力の選別 */
    var members = rawRows.filter(function (r) {
      if (!r || !r.eventId) return false;
      if (classOf(r) === CLASS_CLAIM) {
        /* Speech 側: 既存 safety contract を保った candidate のみ。
           ★claim を world fact 扱いしない担保として worldFactPromotion を確認する。 */
        return r.recordKind === 'candidate' && r.worldFactPromotion === false;
      }
      /* Narration 側: semantic gate を **PASS したものだけ**。 */
      var v = vBy[r.eventId];
      return !!(v && v.lineageEligible === true);
    });
    var tags = groupTagsFor(members);
    var byKey = {};
    members.forEach(function (r) {
      var key = lineageKeyOf(r, tags[r.eventId]);
      (byKey[key] = byKey[key] || []).push(r);
    });
    return Object.keys(byKey).map(function (key) {
      var g = byKey[key].slice().sort(function (a, b) {
        return (a.sourceTurnIndex - b.sourceTurnIndex) || String(a.eventId).localeCompare(String(b.eventId));
      });
      var head = g[0];
      var cls = classOf(head);
      var sa = head.speechAct || null;
      return {
        lineageId: key, slotId: head.slotId, lineageClass: cls,
        kind: sa ? sa.kind : head.type, family: head.family,
        speakerEntityId: sa ? (sa.speakerEntityId || null) : null,
        subjectId: head.subjectId || null,
        /* ★attestation = 束ねた raw の参照。raw 自体は消していない。 */
        memberEventIds: g.map(function (x) { return x.eventId; }),
        attestationCount: g.length,
        sourceTurns: g.map(function (x) { return x.sourceTurnIndex; }),
        sourceModes: g.map(function (x) { return (x.prov && x.prov.kind) || x.sourceMode || null; }),
        normalizedProposition: sa ? sa.normalizedProposition : null,
        mergeRule: g.length > 1 ? (cls === CLASS_WORLD ? 'N:narration+player' : 'S:claim-restatement') : 'singleton',
        dedupeVersion: DEDUPE_VERSION, createdAt: nowMs()
      };
    });
  }

  function build(slotId) {
    if (!armed()) return Promise.resolve({ ok: false, reason: off() ? 'killed' : 'not-opted-in' });
    var t0 = nowMs();
    return Promise.all([readAll('chr6mem', 'events', slotId), readAll('chr6adj', 'verdicts', slotId)])
      .then(function (a) {
        var lin = buildLineages(a[0], a[1]);
        return putLineages(lin).then(function () {
          var c = { rawTotal: a[0].length, verdicts: a[1].length, lineages: lin.length,
                    merged: lin.filter(function (l) { return l.attestationCount > 1; }).length,
                    attestations: lin.reduce(function (n, l) { return n + l.attestationCount; }, 0),
                    world: lin.filter(function (l) { return l.lineageClass === CLASS_WORLD; }).length,
                    claim: lin.filter(function (l) { return l.lineageClass === CLASS_CLAIM; }).length };
          st.lastRun = nowMs(); st.counts = c;
          return { ok: true, ms: nowMs() - t0, counts: c };
        });
      });
  }
  function summary(slotId) {
    return readAll(DB_NAME, STORE, slotId).then(function (rows) {
      return { total: rows.length,
        merged: rows.filter(function (l) { return l.attestationCount > 1; })
                    .map(function (l) { return { id: l.lineageId, n: l.attestationCount,
                                                 turns: l.sourceTurns, rule: l.mergeRule }; }),
        byClass: rows.reduce(function (a, l) { a[l.lineageClass] = (a[l.lineageClass] || 0) + 1; return a; }, {}),
        attestations: rows.reduce(function (n, l) { return n + l.attestationCount; }, 0),
        crossClassLineages: 0 };
    });
  }
  function clear(slotId) {
    return readAll(DB_NAME, STORE, slotId).then(function (rows) {
      return openLin().then(function (db) {
        return new Promise(function (res, rej) {
          var tx = db.transaction([STORE], 'readwrite');
          var os = tx.objectStore(STORE);
          rows.forEach(function (r) { os.delete(r.lineageId); });
          tx.oncomplete = function () { db.close(); res(rows.length); };
          tx.onerror = function () { db.close(); rej(tx.error); };
        });
      });
    });
  }

  window.__v292Dfix790 = {
    __loaded: true, build_: st.build,
    status: function () {
      return { build: st.build, dedupeVersion: DEDUPE_VERSION, on: optedIn(), off: off(),
               active: armed(), db: DB_NAME, lastRun: st.lastRun, counts: st.counts,
               rules: ['N:same-turn narration+player', 'S:NEGATION_CLAIM restatement (same speaker + same core)'],
               note: 'raw は削除しない / claim と world fact は別 lineageClass' };
    },
    build: build, summary: summary, clear: clear,
    getLineages: function (slotId) { return readAll(DB_NAME, STORE, slotId); },
    __test: { buildLineages: buildLineages, groupTagsFor: groupTagsFor, negCore: negCore,
              classOf: classOf, lineageKeyOf: lineageKeyOf, isPlayerSource: isPlayerSource,
              isNarrationSource: isNarrationSource, CLASS_WORLD: CLASS_WORLD,
              CLASS_CLAIM: CLASS_CLAIM, DEDUPE_VERSION: DEDUPE_VERSION, DB_NAME: DB_NAME }
  };
  /* ★自動実行しない。build() を明示的に呼んだときだけ走る。 */
})();
