/* =====================================================================
 * v292Dfix792-referent-resolution.js
 *   Phase 3A-2 Consolidate / 第4slice = Referent Resolution（shadow）
 * ---------------------------------------------------------------------
 * GPT 裁定（2026-09-01 深夜54）:
 *   ・★解ける referent だけ安全に解く。「未解決を全部なくす」ではない。
 *     **誤 resolve より UNRESOLVED を優先**する。
 *   ・resolved 件数の最低ノルマは置かない。**全件 UNRESOLVED でも
 *     証拠不足なら安全設計として PASS**。
 *   ・4C identity architecture 自体は変更しない。代名詞・指示表現を
 *     4C へ新規登録しない。new entity を作らない。
 *   ・hero: stable hero identity が既にある場合のみ接続。無ければ
 *     `char:hero` 等を**新設せず** UNRESOLVED +「hero canonical identity
 *     不足」として記録し GPT へ報告する。
 *   ・me1 identityRes は限定利用（全面 run() しない・改造しない・
 *     **new を自動採用しない**）。
 *   ・結果は raw へ**書き戻さない**。semantic verdict を**上書きしない**。
 *
 * ★禁止 resolve 根拠（実装に無いことを機械で確認できるように書く）
 *   一番近くに出た人物 / 前の turn に出たから / 会話の流れ的に多分この人 /
 *   「彼」だから最後の男性 NPC / 「あれ」だから直前の物 / topic が似ている /
 *   同じ単語が多い / turn 距離スコア / 全文 similarity / LLM 推測 /
 *   embedding / vector / confidence による決定
 *
 * ★bounded source context
 *   入力は **raw に既に保存されている文字列だけ**（normalizedProposition /
 *   prov.evidence / missingArguments[].evidence）。元本文を再走査しない。
 *   新しい Memory Event を作らない（coverage 再抽出は禁止）。
 *
 * 境界: chr6mem / chr6lin は **読むだけ**。chr6adj / chr6rel は**触らない**。
 *       resolution は **別 DB chr6ref** へ。自動実行しない。
 * 依存: 4C identity は **fix670 の既存経路（knownEntities / PRONOUN /
 *       GENERIC / foldStr）を読むだけ**で再利用する。新しい語彙を 1 語も
 *       足さない。取得できなければ **fail-closed**（build を拒否）。
 * opt-in: v292Dfix670On === '1' / kill: v292Dfix792Off === '1'
 * ===================================================================== */
(function () {
  'use strict';
  var REF_VERSION = 'ref-1.0.0';
  var DB_NAME = 'chr6ref';
  var DB_VER = 1;
  var STORE = 'resolutions';

  function lsg(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function nowMs() { try { return Date.now(); } catch (e) { return 0; } }
  function optedIn() { return lsg('v292Dfix670On') === '1'; }
  function off() { return lsg('v292Dfix792Off') === '1'; }
  function armed() { return optedIn() && !off(); }

  var st = { build: '20260901-fix792', refVersion: REF_VERSION, lastRun: null, counts: null,
             heroIdentity: null, degraded: false, reason: null };

  var STATUS = { RESOLVED: 'RESOLVED_EXISTING', UNRESOLVED: 'UNRESOLVED', AMBIGUOUS: 'AMBIGUOUS' };
  /* ladder は 5 段だけ。上から順に評価し、最初に成立したものだけ採る。 */
  var LADDER = {
    L1: 'L1_STRUCTURED_ID',            /* raw が role に紐付けて既に持っている entityId */
    L2: 'L2_CANONICAL_EXACT',          /* 4C known identity 名と表層が完全一致 */
    L3: 'L3_SOURCE_EXPLICIT_NOUN',     /* 同一 attestation 内の明示名詞参照 */
    L4: 'L4_SAME_TURN_UNIQUE',         /* 同一 turn 内で一意に対応する既存 identity */
    L5: 'L5_ME1_IDENTITY_RES_EXISTING' /* me1 identityRes が existing を返したもののみ */
  };
  var REASON = {
    HERO_MISSING: 'hero-canonical-identity-missing',
    UNKNOWN_SPEAKER: 'unknown-speaker-mention',
    NO_ITEM_REGISTRY: 'no-structured-item-identity',
    PLACE_NOT_MODELED: 'place-entity-not-modeled',
    DEMONSTRATIVE: 'demonstrative-without-structured-antecedent',
    PRONOUN: 'pronoun-not-resolved-by-design',
    GENERIC: 'generic-noun-not-an-identity',
    CANDIDATE_ONLY: 'candidate-only-identity-not-canonical',
    MODIFIED_NP: 'modified-np-not-provably-same-individual',
    MULTIPLE: 'multiple-equally-supported-candidates',
    NO_SURFACE: 'no-surface-in-bounded-source-context',
    NO_EVIDENCE: 'no-structural-evidence'
  };

  /* 指示表現の閉じた集合。**解くため**ではなく「解かない」と判定するために持つ。
     ★ここに語を足しても resolve は 1 件も増えない（安全側にしか働かない）。 */
  var DEMONSTRATIVE = /^(?:これ|それ|あれ|どれ|ここ|そこ|あそこ|どこ|こちら|そちら|あちら|この|その|あの|どの|こんなん|そんなもの|こんなもの|あんなもの|もの|それら|これら|あれら)$/;
  var DEMONSTRATIVE_DET = /^(?:この|その|あの|どの)/;

  /* ==================================================================
   * referent slot の列挙
   *   ★新しい slot 種別を発明しない。raw が既に構造化しているものだけ。
   * ================================================================ */
  function collectSlots(lineages, eventsById) {
    var out = [];
    lineages.forEach(function (l) {
      var members = l.memberEventIds || [];
      /* --- (1) speaker slot: claim なのに speakerEntityId が無い --- */
      if (l.lineageClass === 'dialogue_claim' && !l.speakerEntityId) {
        var e0 = eventsById[members[0]] || null;
        var ma = (e0 && e0.missingArguments) || [];
        var spMiss = null, k;
        for (k = 0; k < ma.length; k++) if (ma[k].role === 'speaker') { spMiss = ma[k]; break; }
        out.push({
          slotKey: 'speaker|' + l.lineageId,
          lineageId: l.lineageId, eventId: members[0] || null,
          slotKind: 'speaker', role: 'speaker', expectType: 'character',
          surface: null,
          extractorReason: spMiss ? (spMiss.reason || null) : null,
          sourceTurn: (l.sourceTurns && l.sourceTurns[0]) || null,
          texts: l.normalizedProposition ? [l.normalizedProposition] : [],
          structuredEntityId: null
        });
      }
      /* --- (2) missingArguments の各 role --- */
      members.forEach(function (id) {
        var e = eventsById[id]; if (!e) return;
        (e.missingArguments || []).forEach(function (m, mi) {
          if (m.role === 'speaker') return;              /* (1) で扱う */
          out.push({
            slotKey: 'arg|' + id + '|' + m.role + '|' + mi,
            lineageId: l.lineageId, eventId: id,
            slotKind: 'argument', role: m.role, expectType: m.entityType || null,
            surface: null,
            extractorReason: m.reason || null,
            sourceTurn: e.sourceTurnIndex != null ? e.sourceTurnIndex : null,
            texts: [m.evidence, e.prov && e.prov.evidence].filter(Boolean),
            structuredEntityId: (m.role === 'subject' ? e.subjectId : null)
                             || (m.role === 'object' ? e.objectId : null) || null
          });
        });
      });
      /* --- (3) claim topic（否定 claim の「あれ」等） --- */
      if (l.lineageClass === 'dialogue_claim' && l.kind === 'NEGATION_CLAIM') {
        var topic = claimTopic(l.normalizedProposition);
        if (topic) out.push({
          slotKey: 'topic|' + l.lineageId,
          lineageId: l.lineageId, eventId: members[0] || null,
          slotKind: 'claim_topic', role: 'topic', expectType: null,
          surface: topic,
          extractorReason: null,
          sourceTurn: (l.sourceTurns && l.sourceTurns[0]) || null,
          texts: [l.normalizedProposition],
          structuredEntityId: null
        });
      }
    });
    return out;
  }
  /* fix791 と同じ読み方で topic だけ取る（referent は解決しない）。 */
  var COP_NEG = /(?:では|じゃ)[、,\s]*(?:ない|ねえ|ねぇ|ありません|なかった|なかろう)/;
  var LEAD_CONNECTIVE = /^(?:でも|だが|しかし|けれど|けど|それでも|そして|だから)[、,\s]*/;
  function claimTopic(prop) {
    var s = String(prop || '').replace(LEAD_CONNECTIVE, '').replace(/[…‥]+/g, '');
    var m = COP_NEG.exec(s); if (!m) return null;
    var head = s.slice(0, m.index), ti = head.indexOf('は');
    if (ti < 0) return null;
    var topic = head.slice(0, ti).replace(/[、，,\s]+/g, '');
    return topic || null;
  }

  /* ==================================================================
   * 明示名詞参照の探索（L3）
   *   ★「同じ単語が多い」ではない。known identity 名が bounded source
   *     context に**独立した名詞句として**現れているかだけを見る。
   *   ・直後が「の」    → その名前は後続名詞の**修飾語**。referent ではない。
   *                       （例:「村長の使い」の「村長」を村長に結ばない）
   *   ・直前が「の」    → 修飾された名詞句の head。修飾が個体を絞っている
   *                       可能性があるので **AMBIGUOUS**（例:「わしの娘」）。
   *   ・どちらでもない  → 独立した明示名詞参照。候補にする。
   * ================================================================ */
  function findExplicitMentions(texts, knownNames) {
    var free = [], modified = [];
    (texts || []).forEach(function (t) {
      var s = String(t || '');
      knownNames.forEach(function (n) {
        var from = 0, i;
        while ((i = s.indexOf(n, from)) >= 0) {
          from = i + 1;
          var after = s.charAt(i + n.length);
          var before = i > 0 ? s.charAt(i - 1) : '';
          if (after === 'の') continue;                             /* 修飾語側 → 使わない */
          if (before === 'の') { if (modified.indexOf(n) < 0) modified.push(n); continue; }
          if (free.indexOf(n) < 0) free.push(n);
        }
      });
    });
    return { free: free, modified: modified };
  }

  /* ==================================================================
   * 1 slot の解決。★ladder の上から順。最初に成立したものだけ。
   * deps = { known, heroEntityId, isPronoun, isGeneric, fold,
   *          itemRegistry, me1IdentityRes }
   * ================================================================ */
  function resolveSlot(slot, deps, sameTurnIndex) {
    var known = deps.known || {};
    var names = Object.keys(known);
    function ok(ladder, entityId, extra) {
      return Object.assign({ status: STATUS.RESOLVED, resolvedEntityId: entityId,
                             ladder: ladder, reason: null, candidates: [] }, extra || {});
    }
    function no(reason, extra) {
      return Object.assign({ status: STATUS.UNRESOLVED, resolvedEntityId: null,
                             ladder: null, reason: reason, candidates: [] }, extra || {});
    }
    function amb(reason, cands) {
      return { status: STATUS.AMBIGUOUS, resolvedEntityId: null, ladder: null,
               reason: reason, candidates: cands || [] };
    }

    /* ---- L1: raw が role に紐付けて既に持っている entityId ------------
       ★personCandidates は role に紐付いていない「turn 内の人物言及」なので
         根拠にしない（＝「一番近くに出た人物」に堕ちるため）。 */
    if (slot.structuredEntityId) {
      /* ★4C の canonical identity でないもの（char_candidate: / ambiguous:）は採らない。 */
      if (/^(?:char_candidate:|ambiguous:)/.test(slot.structuredEntityId)) {
        return no(REASON.CANDIDATE_ONLY, { candidates: [slot.structuredEntityId] });
      }
      return ok(LADDER.L1, slot.structuredEntityId, { candidates: [slot.structuredEntityId] });
    }

    /* ---- speaker slot の構造的原因を先に分類する（解かないが理由は残す） */
    if (slot.slotKind === 'speaker') {
      if (slot.extractorReason === 'no-hero-entity') {
        /* ★hero canonical identity が無い。char:hero を**新設しない**。 */
        if (!deps.heroEntityId) return no(REASON.HERO_MISSING);
        return ok(LADDER.L1, deps.heroEntityId);   /* 既に安定 hero identity がある場合のみ */
      }
      if (slot.extractorReason === 'unknown-mention') return no(REASON.UNKNOWN_SPEAKER);
    }

    var surf = slot.surface ? String(slot.surface) : null;

    /* ---- 代名詞・指示表現・総称は**設計として解かない** ---------------- */
    if (surf) {
      if (deps.isPronoun(surf)) return no(REASON.PRONOUN);
      if (DEMONSTRATIVE.test(surf)) return no(REASON.DEMONSTRATIVE);
      if (DEMONSTRATIVE_DET.test(surf)) return no(REASON.DEMONSTRATIVE);
      if (deps.isGeneric(surf)) return no(REASON.GENERIC);
    }

    /* ---- L2: 4C known identity 名と表層が完全一致 --------------------- */
    if (surf) {
      var hit2 = null, i2;
      for (i2 = 0; i2 < names.length; i2++) {
        var e2 = known[names[i2]];
        if (!e2 || e2.status !== 'known' || e2.ambiguous) continue;
        if (names[i2] === surf || deps.fold(names[i2]) === deps.fold(surf)) { hit2 = e2; break; }
      }
      if (hit2) return ok(LADDER.L2, hit2.entityId);
      /* 表層はあるが canonical に無い。candidate しか無い場合はそれを明示する。 */
      var cand2 = known[surf];
      if (cand2 && cand2.status !== 'known') return no(REASON.CANDIDATE_ONLY);
    }

    /* ---- L3: 同一 attestation 内の明示名詞参照 ------------------------ */
    var canonNames = names.filter(function (n) {
      var e = known[n]; return e && e.status === 'known' && !e.ambiguous;
    });
    var men = findExplicitMentions(slot.texts, canonNames);
    if (men.free.length === 1) {
      return ok(LADDER.L3, known[men.free[0]].entityId, { candidates: [men.free[0]] });
    }
    if (men.free.length > 1) return amb(REASON.MULTIPLE, men.free.slice());
    if (men.modified.length) {
      /* ★修飾つき名詞句（「わしの娘」）は同一個体である構造証拠が無い。
         ここで結ぶと「同じ単語が多い」型の誤 resolve になる。 */
      return amb(REASON.MODIFIED_NP, men.modified.slice());
    }

    /* ---- L4: 同一 turn 内で一意に対応する既存 identity ----------------
       ★speaker には適用しない（「同じ turn にいた人」で話者を決めるのは
         禁止根拠そのもの）。item / place のみ。 */
    if (slot.slotKind === 'argument' && slot.role !== 'speaker') {
      var pool = (sameTurnIndex && sameTurnIndex[slot.sourceTurn]) || [];
      var typed = pool.filter(function (x) {
        return slot.expectType ? x.entityType === slot.expectType : false;
      });
      if (typed.length === 1) return ok(LADDER.L4, typed[0].entityId, { candidates: [typed[0].entityId] });
      if (typed.length > 1) return amb(REASON.MULTIPLE, typed.map(function (x) { return x.entityId; }));
    }

    /* ---- L5: me1 identityRes（**existing のみ**採用・new は採らない） ---
       ★registry（structured item identity）が空なら me1 を呼ばない。
         4C は item identity を持たないため、実データでは常にここで止まる。 */
    if (slot.expectType === 'item' && deps.itemRegistry && deps.itemRegistry.length && deps.me1IdentityRes) {
      var r5 = null;
      try { r5 = deps.me1IdentityRes(slot, deps.itemRegistry); } catch (e) { r5 = null; }
      if (r5 && r5.resolution === 'existing' && r5.itemId) return ok(LADDER.L5, r5.itemId);
      /* ★new / unknown は採用しない。原則 UNRESOLVED。 */
    }

    /* ---- 解けない理由を構造的に分類する（architecture gap の一次資料） */
    if (slot.extractorReason === 'place-entity-not-modeled') return no(REASON.PLACE_NOT_MODELED);
    if (slot.expectType === 'item') return no(REASON.NO_ITEM_REGISTRY);
    if (!surf && !(slot.texts || []).length) return no(REASON.NO_SURFACE);
    return no(REASON.NO_EVIDENCE);
  }

  /* 同一 turn 内の「role に紐付いた解決済み identity」だけを集める。
     ★personCandidates（単なる言及）は入れない。 */
  function buildSameTurnIndex(events, known) {
    var idx = {};
    (events || []).forEach(function (e) {
      var t = e.sourceTurnIndex; if (t == null) return;
      var push = function (id, ty) {
        if (!id) return;
        if (!idx[t]) idx[t] = [];
        for (var i = 0; i < idx[t].length; i++) if (idx[t][i].entityId === id) return;
        idx[t].push({ entityId: id, entityType: ty });
      };
      push(e.subjectId, 'character');
      push(e.objectId, 'item');
      if (e.speechAct && e.speechAct.speakerEntityId) push(e.speechAct.speakerEntityId, 'character');
    });
    return idx;
  }

  function deriveResolutions(lineages, events, deps) {
    var byId = {}; (events || []).forEach(function (e) { byId[e.eventId] = e; });
    var slots = collectSlots(lineages || [], byId);
    var idx = buildSameTurnIndex(events, deps.known);
    var slotId = (lineages && lineages[0] && lineages[0].slotId) || null;
    return slots.map(function (s) {
      var v = resolveSlot(s, deps, idx);
      return {
        refId: (slotId || '') + '|' + s.slotKey,
        slotId: slotId, lineageId: s.lineageId, eventId: s.eventId,
        slotKind: s.slotKind, role: s.role, expectType: s.expectType,
        surface: s.surface, sourceTurn: s.sourceTurn,
        extractorReason: s.extractorReason,
        status: v.status, resolvedEntityId: v.resolvedEntityId,
        ladder: v.ladder, reason: v.reason, candidates: v.candidates,
        refVersion: REF_VERSION, createdAt: nowMs(),
        /* ★契約フィールド（機械で確認できるように持つ） */
        writesRaw: false, createsNewEntity: false,
        overridesSemanticVerdict: false, knownToUnion: false
      };
    });
  }

  /* ---------------- 4C identity は fix670 の既存経路を読むだけ -------- */
  function deps670(slotId) {
    var m = window.__v292Dfix670, T = m && m.__test;
    if (!T || !T.knownEntities || !T.resolveSlot || !T.PRONOUN || !T.foldStr) {
      return { ok: false, reason: 'fix670-identity-path-unavailable' };
    }
    var sl, kn;
    try { sl = T.resolveSlot(slotId); kn = T.knownEntities(sl && sl.blob, slotId); }
    catch (e) { return { ok: false, reason: 'fix670-identity-read-failed' }; }
    if (!kn || !kn.byName) return { ok: false, reason: 'fix670-identity-empty' };
    return { ok: true, deps: {
      known: kn.byName,
      heroEntityId: kn.heroEntityId || null,
      isPronoun: function (s) { return T.PRONOUN.test(s); },
      /* ★GENERIC は fix670 が __test に出していないことがある。**足しに行かない**
         （fix670 を 1 バイトも変えない）。無いときは総称語の早期 UNRESOLVED を
         行わないだけで、安全性は L2「4C known 名と完全一致」/ L3「独立した明示
         名詞参照」の厳格さが担保する。総称語がそれで解けるのは、4C 側がその語を
         canonical identity として登録している場合だけ＝4C の判断に従う。 */
      isGeneric: function (s) { return T.GENERIC ? T.GENERIC.test(s) : false; },
      fold: function (s) { return T.foldStr(s); },
      /* ★4C は item identity を持たない。registry は空のまま me1 を呼ばない。 */
      itemRegistry: [], me1IdentityRes: null
    } };
  }

  /* ---------------- IDB ---------------------------------------------- */
  function openRef() {
    return new Promise(function (res, rej) {
      var q; try { q = window.indexedDB.open(DB_NAME, DB_VER); } catch (e) { return rej(e); }
      q.onupgradeneeded = function () {
        var db = q.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var os = db.createObjectStore(STORE, { keyPath: 'refId' });
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
  function putResolutions(list) {
    return openRef().then(function (db) {
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
    var d = deps670(slotId);
    if (!d.ok) {                                   /* ★fail-closed */
      st.degraded = true; st.reason = d.reason;
      return Promise.resolve({ ok: false, reason: d.reason });
    }
    st.degraded = false; st.reason = null;
    st.heroIdentity = d.deps.heroEntityId ? 'present' : 'missing';
    var t0 = nowMs();
    var m = window.__v292Dfix670;
    return Promise.all([readAll('chr6lin', 'lineages', slotId), (window.__v292Dfix801 ? window.__v292Dfix801.eventsForStory(slotId) : m.events(Infinity))])   /* ★fix801: story-scoped adapter（fallback = fix670 正式契約 events(Infinity)=全件） */
      .then(function (a) {
        var rows = deriveResolutions(a[0], a[1], d.deps);
        return putResolutions(rows).then(function () {
          var c = { lineages: a[0].length, slots: rows.length,
                    heroIdentity: st.heroIdentity, newEntitiesCreated: 0 };
          rows.forEach(function (r) { c[r.status] = (c[r.status] || 0) + 1; });
          st.lastRun = nowMs(); st.counts = c;
          return { ok: true, ms: nowMs() - t0, counts: c };
        });
      });
  }
  function summary(slotId) {
    return readAll(DB_NAME, STORE, slotId).then(function (rows) {
      function tally(f) {
        return rows.reduce(function (o, r) { var k = f(r); if (k) o[k] = (o[k] || 0) + 1; return o; }, {});
      }
      return {
        total: rows.length,
        byStatus: tally(function (r) { return r.status; }),
        byReason: tally(function (r) { return r.reason; }),
        byLadder: tally(function (r) { return r.ladder; }),
        bySlotKind: tally(function (r) { return r.slotKind; }),
        /* ★GPT 報告項目 */
        heroCanonicalIdentityMissing: rows.filter(function (r) {
          return r.reason === REASON.HERO_MISSING; }).length,
        unknownSpeakerMentions: rows.filter(function (r) {
          return r.reason === REASON.UNKNOWN_SPEAKER; }).length,
        /* ★安全指標（すべて 0 であること） */
        newEntitiesCreated: rows.filter(function (r) { return r.createsNewEntity; }).length,
        pronounForcedResolutions: rows.filter(function (r) {
          return r.status === STATUS.RESOLVED && r.reason === REASON.PRONOUN; }).length,
        semanticVerdictOverrides: rows.filter(function (r) { return r.overridesSemanticVerdict; }).length,
        rawWrites: rows.filter(function (r) { return r.writesRaw; }).length,
        knownToUnions: rows.filter(function (r) { return r.knownToUnion; }).length,
        resolved: rows.filter(function (r) { return r.status === STATUS.RESOLVED; })
          .map(function (r) { return { turn: r.sourceTurn, kind: r.slotKind, role: r.role,
                                       ladder: r.ladder, id: r.resolvedEntityId }; }),
        ambiguous: rows.filter(function (r) { return r.status === STATUS.AMBIGUOUS; })
          .map(function (r) { return { turn: r.sourceTurn, kind: r.slotKind, role: r.role,
                                       reason: r.reason, candidates: r.candidates }; })
      };
    });
  }
  function clear(slotId) {
    return readAll(DB_NAME, STORE, slotId).then(function (rows) {
      return openRef().then(function (db) {
        return new Promise(function (res, rej) {
          var tx = db.transaction([STORE], 'readwrite');
          var os = tx.objectStore(STORE);
          rows.forEach(function (r) { os.delete(r.refId); });
          tx.oncomplete = function () { db.close(); res(rows.length); };
          tx.onerror = function () { db.close(); rej(tx.error); };
        });
      });
    });
  }

  window.__v292Dfix792 = {
    __loaded: true, build_: st.build,
    status: function () {
      return { build: st.build, refVersion: REF_VERSION, on: optedIn(), off: off(), active: armed(),
               db: DB_NAME, lastRun: st.lastRun, counts: st.counts,
               heroIdentity: st.heroIdentity, degraded: st.degraded, reason: st.reason,
               statuses: [STATUS.RESOLVED, STATUS.UNRESOLVED, STATUS.AMBIGUOUS],
               ladders: [LADDER.L1, LADDER.L2, LADDER.L3, LADDER.L4, LADDER.L5],
               note: '解けるものだけ解く / 誤 resolve より UNRESOLVED / new entity を作らない / '
                   + 'raw へ書き戻さない / semantic verdict を上書きしない / knownTo を union しない' };
    },
    build: build, summary: summary, clear: clear,
    getResolutions: function (slotId) { return readAll(DB_NAME, STORE, slotId); },
    __test: { collectSlots: collectSlots, resolveSlot: resolveSlot,
              deriveResolutions: deriveResolutions, findExplicitMentions: findExplicitMentions,
              buildSameTurnIndex: buildSameTurnIndex, claimTopic: claimTopic,
              STATUS: STATUS, LADDER: LADDER, REASON: REASON,
              DEMONSTRATIVE: DEMONSTRATIVE, REF_VERSION: REF_VERSION, DB_NAME: DB_NAME }
  };
  /* ★自動実行しない。Narrative 影響 0。 */
})();
