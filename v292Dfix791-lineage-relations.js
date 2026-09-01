/* =====================================================================
 * v292Dfix791-lineage-relations.js
 *   Phase 3A-2 Consolidate / 第3slice = Update / Conflict（shadow）
 * ---------------------------------------------------------------------
 * GPT 裁定（2026-09-01 深夜52）:
 *   ・目的は「どれが真実か」「どれが最新の正本か」を決めることでは**ない**。
 *     ★lineage 同士の**関係**を shadow で表すこと。
 *   ・claim と world fact を同じ truth として merge しない（関係だけを持つ）。
 *   ・巨大 relation taxonomy 禁止。名前は最小に。
 *   ・fix190（傷 / 関係 / 未解決の現在 state）は authority。ME は
 *     「いつ変わった・なぜ・誰が・どんな出来事だったか」という
 *     **semantic history** だけを持ち、現在 state を上書きしない。
 *
 * ★禁止（実装に無いことを機械で確認できるように書く）
 *   truth engine 化 / winner 選択 / confidence score での真偽決定 /
 *   「最新 turn だから正しい」/ speaker 信頼度 / embedding / vector /
 *   全文類似 / raw 削除 / lineage 削除 / claim×world merge /
 *   knownTo union / fix190 置換 / canonical write / Planner injection
 *
 * ★v1 の関係（3 種だけ。いずれも **candidate** であって確定ではない）
 *   SUPERSEDES_CANDIDATE      … world↔world。同 subject・同 type・turn 順が明確な
 *                                state 型のみ。後の lineage が前を **置き換える候補**。
 *                                ※現在 state は fix190 の authority。ここでは作らない。
 *   CLAIM_REVISION_CANDIDATE  … claim↔claim。**同一 speaker**・同 kind・同 topic で
 *                                complement が違う＝同じ話者が言い直した候補。
 *                                ※speaker が違うものは **different claims として保持**し、
 *                                  関係を作らない（どちらが正しいかを決めないため）。
 *   RELATED_UNRESOLVED        … claim↔claim。同一 speaker・同 kind・**同一の明示時間
 *                                アンカー**（十五年前 / あの晩 …）を共有する開示。
 *                                ★「同じ出来事だ」とは主張しない。未解決の関連のみ。
 *
 * ★SUPPORTS / CONTRADICTS（claim↔world）は **v1 では作らない**。
 *   claim の topic は「あれ」のような**未解決の指示表現**であり、world lineage 側は
 *   entityId を持つ。両者を突き合わせるには referent 解決が要るが、それは
 *   次 slice（Referent Resolution）の責務で、ここで pronoun を強制解決するのは禁止。
 *   → 「referent unresolved なら無理に relation を作らない」という裁定に従い、
 *     **claim↔world の relation は 0 件**にする（merge しないことは fix790 の
 *     lineageClass 分離で構造的に保証済み）。
 *
 * 境界: chr6mem / chr6adj / chr6lin は **読むだけ**。relation は **別 DB chr6rel** へ。
 *       自動実行しない（build() を明示的に呼んだときだけ）。
 * opt-in: v292Dfix670On === '1' / kill: v292Dfix791Off === '1'
 * ===================================================================== */
(function () {
  'use strict';
  var REL_VERSION = 'rel-1.0.0';
  var DB_NAME = 'chr6rel';
  var DB_VER = 1;
  var STORE = 'relations';

  function lsg(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function nowMs() { try { return Date.now(); } catch (e) { return 0; } }
  function optedIn() { return lsg('v292Dfix670On') === '1'; }
  function off() { return lsg('v292Dfix791Off') === '1'; }
  function armed() { return optedIn() && !off(); }

  var st = { build: '20260901-fix791', relVersion: REL_VERSION, lastRun: null, counts: null };

  var REL = {
    SUPERSEDES: 'SUPERSEDES_CANDIDATE',
    REVISION: 'CLAIM_REVISION_CANDIDATE',
    RELATED: 'RELATED_UNRESOLVED'
  };
  /* 後の値が前の値を置き換え得る state 型だけ。**fix190 の現在 state は作らない**。 */
  var STATE_TYPES = ['affiliation_changed', 'relation_formed', 'relation_broken',
                     'trait_declared', 'role_assigned'];
  /* 明示的な時間アンカー（fix787 S2 の時間距離スロットと同じ閉じた集合）。 */
  var TIME_ANCHOR = /(?:(?:[0-9０-９]+|[一二三四五六七八九十百千]+)\s*年(?:ほど|ばかり|くらい|ぐらい|も)?(?:前|昔)|あの(?:日|夜|晩|時|とき|頃|ころ)|かつて|以前|当時)/g;
  function anchorsOf(text) {
    var s = String(text || ''), out = [], m;
    TIME_ANCHOR.lastIndex = 0;
    while ((m = TIME_ANCHOR.exec(s)) !== null) { if (out.indexOf(m[0]) < 0) out.push(m[0]); }
    return out;
  }
  /* claim の構造核（fix790 と同じ読み方。ここでも referent は解決しない）。 */
  var COP_NEG = /(?:では|じゃ)[、,\s]*(?:ない|ねえ|ねぇ|ありません|なかった|なかろう)/;
  var LEAD_CONNECTIVE = /^(?:でも|だが|しかし|けれど|けど|それでも|そして|だから)[、,\s]*/;
  function claimCore(prop) {
    var s = String(prop || '').replace(LEAD_CONNECTIVE, '').replace(/[…‥]+/g, '');
    var m = COP_NEG.exec(s); if (!m) return null;
    var head = s.slice(0, m.index), comp = head, topic = null;
    if (comp.indexOf('は') >= 0) {
      var ti = comp.indexOf('は');
      topic = comp.slice(0, ti).replace(/[、，,\s]+$/, '');
      comp = comp.slice(ti + 1);
    }
    comp = comp.replace(/^[、，,\s]+/, '');
    var g = comp.lastIndexOf('の'); if (g >= 0 && g + 1 < comp.length) comp = comp.slice(g + 1);
    comp = comp.replace(/[、，,\s]+/g, ''); if (!comp) return null;
    if (topic !== null) { topic = topic.replace(/[、，,\s]+/g, ''); if (!topic) topic = null; }
    return { topic: topic, complement: comp };
  }
  function lastTurn(l) { return Math.max.apply(null, (l.sourceTurns || [0])); }

  /* ==================================================================
   * relation の導出。★スコアも閾値も一切使わない。構造の一致だけ。
   * ================================================================ */
  function deriveRelations(lineages) {
    var out = [], i, j, a, b;
    var world = lineages.filter(function (l) { return l.lineageClass === 'world_event'; });
    var claim = lineages.filter(function (l) { return l.lineageClass === 'dialogue_claim'; });

    /* --- SUPERSEDES_CANDIDATE（world↔world） --- */
    for (i = 0; i < world.length; i++) for (j = 0; j < world.length; j++) {
      if (i === j) continue;
      a = world[i]; b = world[j];
      if (!a.subjectId || a.subjectId !== b.subjectId) continue;      /* 同 subject（解決済みのみ） */
      if (a.kind !== b.kind) continue;                                 /* 同 type */
      if (STATE_TYPES.indexOf(a.kind) < 0) continue;                   /* state 型に限定 */
      if (!(lastTurn(a) < lastTurn(b))) continue;                      /* turn 順が明確なときだけ */
      out.push({ kind: REL.SUPERSEDES, fromLineageId: b.lineageId, toLineageId: a.lineageId,
                 basis: 'same-subject+same-state-type+turn-order',
                 note: '後の lineage が前を置き換える候補。現在 state は fix190 の authority。' });
    }
    /* --- CLAIM_REVISION_CANDIDATE / RELATED_UNRESOLVED（claim↔claim） --- */
    for (i = 0; i < claim.length; i++) for (j = i + 1; j < claim.length; j++) {
      a = claim[i]; b = claim[j];
      /* ★speaker が違う（または未解決）なら関係を作らない＝different claims のまま保持 */
      if (!a.speakerEntityId || !b.speakerEntityId) continue;
      if (a.speakerEntityId !== b.speakerEntityId) continue;
      if (a.kind !== b.kind) continue;
      var older = lastTurn(a) <= lastTurn(b) ? a : b;
      var newer = older === a ? b : a;

      if (a.kind === 'NEGATION_CLAIM') {
        /* ★言い直し候補は「後が前を revise する」向きを持つので turn 順が必須。
           同一 turn で順序が付かないものは作らない。 */
        if (lastTurn(older) === lastTurn(newer)) continue;
        var ca = claimCore(a.normalizedProposition), cb = claimCore(b.normalizedProposition);
        if (ca && cb && ca.topic && cb.topic && ca.topic === cb.topic &&
            ca.complement !== cb.complement) {
          out.push({ kind: REL.REVISION, fromLineageId: newer.lineageId, toLineageId: older.lineageId,
                     basis: 'same-speaker+same-kind+same-topic+different-complement',
                     note: '同じ話者による言い直し候補。どちらが正しいかは判定しない。' });
        }
        continue;
      }
      if (a.kind === 'PAST_DISCLOSURE') {
        /* ★RELATED_UNRESOLVED は**対称**な「関連あり」なので turn 順を要求しない
           （同一 turn 内の 2 つの開示も同じアンカーを共有し得る）。
           relationId を安定させるため向きだけ (older→newer) に固定する。 */
        /* ★同一の**明示**時間アンカーを共有する開示だけを「未解決の関連」として結ぶ。
           「同じ出来事だ」とは主張しない。文字列類似は使っていない。 */
        var aa = anchorsOf(a.normalizedProposition), ab = anchorsOf(b.normalizedProposition);
        var shared = aa.filter(function (x) { return ab.indexOf(x) >= 0; });
        if (shared.length) {
          out.push({ kind: REL.RELATED, fromLineageId: older.lineageId, toLineageId: newer.lineageId,
                     basis: 'same-speaker+same-kind+shared-time-anchor:' + shared.join('/'),
                     note: '同じ時間アンカーを参照している。同一の出来事だとは主張しない。' });
        }
      }
    }
    return out.map(function (r) {
      return Object.assign({
        relationId: [r.kind, r.fromLineageId, r.toLineageId].join('||'),
        slotId: (lineages[0] && lineages[0].slotId) || null,
        relVersion: REL_VERSION, createdAt: nowMs(),
        /* ★真偽を決めない・勝者を選ばない・knownTo を union しない、を明示的に持つ */
        resolvesTruth: false, winner: null, knownToUnion: false
      }, r);
    });
  }

  /* ---------------- IDB ---------------------------------------------- */
  function openRel() {
    return new Promise(function (res, rej) {
      var q; try { q = window.indexedDB.open(DB_NAME, DB_VER); } catch (e) { return rej(e); }
      q.onupgradeneeded = function () {
        var db = q.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var os = db.createObjectStore(STORE, { keyPath: 'relationId' });
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
        var tx = db.transaction([store], 'readonly');        /* ★readonly のみ */
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
  function putRelations(list) {
    return openRel().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction([STORE], 'readwrite');
        var os = tx.objectStore(STORE);
        list.forEach(function (r) { os.put(r); });
        tx.oncomplete = function () { db.close(); res(list.length); };
        tx.onerror = function () { db.close(); rej(tx.error); };
      });
    });
  }

  function build(slotId) {
    if (!armed()) return Promise.resolve({ ok: false, reason: off() ? 'killed' : 'not-opted-in' });
    var t0 = nowMs();
    return readAll('chr6lin', 'lineages', slotId).then(function (lin) {
      var rel = deriveRelations(lin);
      return putRelations(rel).then(function () {
        var c = { lineages: lin.length, relations: rel.length, claimWorldRelations: 0 };
        rel.forEach(function (r) { c[r.kind] = (c[r.kind] || 0) + 1; });
        st.lastRun = nowMs(); st.counts = c;
        return { ok: true, ms: nowMs() - t0, counts: c };
      });
    });
  }
  function summary(slotId) {
    return Promise.all([readAll(DB_NAME, STORE, slotId), readAll('chr6lin', 'lineages', slotId)])
      .then(function (a) {
        var rel = a[0], lin = a[1], byId = {};
        lin.forEach(function (l) { byId[l.lineageId] = l; });
        var crossClass = rel.filter(function (r) {
          var f = byId[r.fromLineageId], t = byId[r.toLineageId];
          return f && t && f.lineageClass !== t.lineageClass;
        }).length;
        return { total: rel.length,
          byKind: rel.reduce(function (o, r) { o[r.kind] = (o[r.kind] || 0) + 1; return o; }, {}),
          claimWorldRelations: crossClass,
          truthDecisions: rel.filter(function (r) { return r.resolvesTruth || r.winner; }).length,
          items: rel.map(function (r) {
            var f = byId[r.fromLineageId], t = byId[r.toLineageId];
            return { kind: r.kind, basis: r.basis,
                     from: f ? { turns: f.sourceTurns, prop: f.normalizedProposition } : null,
                     to: t ? { turns: t.sourceTurns, prop: t.normalizedProposition } : null };
          }) };
      });
  }
  function clear(slotId) {
    return readAll(DB_NAME, STORE, slotId).then(function (rows) {
      return openRel().then(function (db) {
        return new Promise(function (res, rej) {
          var tx = db.transaction([STORE], 'readwrite');
          var os = tx.objectStore(STORE);
          rows.forEach(function (r) { os.delete(r.relationId); });
          tx.oncomplete = function () { db.close(); res(rows.length); };
          tx.onerror = function () { db.close(); rej(tx.error); };
        });
      });
    });
  }

  window.__v292Dfix791 = {
    __loaded: true, build_: st.build,
    status: function () {
      return { build: st.build, relVersion: REL_VERSION, on: optedIn(), off: off(), active: armed(),
               db: DB_NAME, lastRun: st.lastRun, counts: st.counts,
               relationKinds: [REL.SUPERSEDES, REL.REVISION, REL.RELATED],
               note: '真偽を決めない / 勝者を選ばない / claim と world を merge しない / '
                   + 'knownTo を union しない / fix190 の現在 state を作らない' };
    },
    build: build, summary: summary, clear: clear,
    getRelations: function (slotId) { return readAll(DB_NAME, STORE, slotId); },
    __test: { deriveRelations: deriveRelations, claimCore: claimCore, anchorsOf: anchorsOf,
              lastTurn: lastTurn, REL: REL, STATE_TYPES: STATE_TYPES, REL_VERSION: REL_VERSION,
              DB_NAME: DB_NAME }
  };
  /* ★自動実行しない。Narrative 影響 0。 */
})();
