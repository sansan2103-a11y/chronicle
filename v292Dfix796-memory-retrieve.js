/* =====================================================================
 * v292Dfix796-memory-retrieve.js
 *   Phase 3C-0 — Retrieve shadow（観測専用 / 文字列を返すだけ / 書き込み 0）
 * ---------------------------------------------------------------------
 * 契約（Fable5.1 指示 3C-0・GPT 裁定 2026-09-02 反映）:
 *   ・入力は **Canonical memoryV1 だけ**。shadow 5 層 DB（lineage / relation /
 *     resolution / event / adjunct）を直読しない。fix190 / fix77 の state 値を
 *     読まない。server を読まない。
 *   ・index = **lifecycle==='ACTIVE' の全 record**（dialogue_claim も world_event も）。
 *     **PENDING_REF は index に入れない**（filter ではなく構造的排除）。
 *     index 経路に非 ACTIVE が 1 件でも現れたら **fail-closed**（0 件 + log
 *     INVARIANT_PENDING_IN_INDEX）。
 *   ・key = entityId **完全一致のみ**。部分一致・表層類似度・embedding 禁止。
 *     （負のベンチマーク: 「村長の使い」は「村長」に一致してはならない）
 *   ・score = 3*entityHit + 2*recencyBand + 1*relationHit + 1*epistemicBonus。
 *     整数・決定的・同点は memoryId 昇順。
 *   ・select = 上位 3 件 / score<4 は 0 件 / 1 件 80 字で切り「…」/ 合計 約300 字。
 *     **300T・500T でも上限同一**（turn 数に比例する成分を持たない）。
 *   ・render = **文字列を返すだけ**。world_event は render 段で除外し、除外件数を返す。
 *   ・knownTo は **provenance/log のみ**。フィルタに使わない。
 *   ・fail-open: 例外 / memoryV1 未ロード / 空 → 空配列・空文字。throw しない。
 *   ・副作用 0: localStorage は **read のみ**（setItem/removeItem を呼ばない）。
 *     network 0 / timer 0 / listener 0 / DOM 0 / 生成系レジストリ非登録 / hook 0。
 *
 * ---------------------------------------------------------------------
 * ★Rev4（2026-09-02 / Fable5.1 指摘の off-by-one 修正。閾値・重み・tier・list は不変）
 *   **ターン番号の基準を 0-based の `S.turns` 配列 index に統一する。**
 *   ・`record.source.lastTurn` は fix670 `extractTurn(sl.turns[i], i, ...)` の `i`
 *     （= `sourceTurnIndex`）を fix790 `sourceTurns` 経由で fix793 が
 *     `Math.max(sourceTurns)` にしたもの。**表示ターン番号ではなく 0-based の配列 index**。
 *   ・したがって `turnCtx.currentTurn` も **いま生成しようとしているターンの 0-based index**
 *     （= 生成直前の `S.turns.length`。呼び出し側が渡す値であって本 module は算出しない）。
 *   ・未来ガードは **strict past**: `lastTurn >= currentTurn` を除外する。
 *     旧 Rev3 は 1-based の表示ターン番号を渡したうえで `>` だったため、
 *     **全ターンが 1 ターン先の発話を見られていた**（QA 155T 実測で
 *     `lastTurn === currentTurn` の record が 16 ターンで採用されていた）。
 *   ・`recencyBandOf` の `d = currentTurn - lastTurn` も同じ基準になる（帯 20/60 は不変）。
 *   ・`__test.buildTurnCtxFromTurn(turnIndex, ...)` の turnIndex も **0-based**
 *     （`slotBody.turns[turnIndex]` を読み `currentTurn = turnIndex` を返す）。
 * ---------------------------------------------------------------------
 * ★Rev5（2026-09-02 / GPT 3C-1 裁定。閾値・重み・tier 定義・80 字・3 件は不変）
 *   (a) **query entity source は 2 つだけ**（裁定 5）:
 *       tier2 = `interlocutorId`／tier1 = `explicitInputMentionIds`
 *       （= player 入力から既存 canonical entity へ **一意 resolve** できた entityId。
 *        candidate / ambiguous / 部分一致 / 表層類似は 0）。
 *       **presence 概念を作らない**。`presentIds` は廃止。`recentMentionIds` は v1 では DEFER。
 *       turnCtx にそれらが残っていても keysFor は **無視する**。
 *   (b) **dry hook**（裁定 7）: `dryBlock(turnCtx, opts)` は Planner に渡す *予定の* block を
 *       生成して返すだけ。sys 出力 0 / Planner.build 非参照 / DOM 0 / localStorage write 0 /
 *       `wired` は false のまま。
 *   (c) **budget**（裁定 2）: block を途中で文字切断しない。予算超過時は件数を
 *       3→2→1 と decrement し、1 件でも入らなければ block 全体 drop（0 字）。
 *       telemetry: `selected / actuallyInjected / droppedByBudget / finalChars`。
 *   (d) **guard 文と順序**（裁定 4）: `GUARD_SENTENCE` と `ORDER = ['memory','currentState','guard']`
 *       を定数として保持。**dry では render しない**（3C-2 で sys に入れる予定文）。
 *   (e) **repetition telemetry**（裁定 6）: `newTelemetry()` + `dryBlock(..., {telemetry})` で
 *       record ごとの injectCount / lastInjectedTurn、ターンごとの interlocutorId / queryReason /
 *       同一 top3 streak を蓄積する。**抑制は入れない**（観測のみ）。
 * ---------------------------------------------------------------------
 * ---------------------------------------------------------------------
 * ★Rev6（2026-09-03 / GPT 裁定 3C-2 = 案 A ADOPT。閾値・重み・tier・80 字・3 件・
 *   select/score/render の挙動は **1 mm も変えない**。足すのは block provider だけ）
 *   (a) **`canaryBlocks(ctx)` を新設**。3C-2 QA canary で state-prompt owner
 *       （engineMode=1 の fix192）へ **memoryText / guardText の 2 文字列だけ**を
 *       READ-ONLY で渡す。Retrieve・score・entity 解決・300 字化は **すべてこちら側**。
 *       呼び出し側は返った文字列を自分の block 配列へ差すだけ。
 *   (b) **戻り値は null か { memoryText, guardText, meta }**。片方だけは絶対に返さない。
 *       memory 0 件 → **null**（guard 単独禁止をこの層で構造的に保証する）。
 *   (c) **registry へ登録しない**（Rev5 までと同じく `registered:false`）。
 *       3C-2 では registry 経由（末尾追記）では順序契約を満たせないため、
 *       registry 登録という選択肢自体を撤回した。sys を自分で書く経路も無い。
 *   (d) **cap は 300 固定**（GPT 裁定 2）。残予算 API は 3C-2 では使わない。
 *       render は件数を 3→2→1 と decrement するので **record 途中で切れない**。
 *       guard 固定文の長さは cap の外側で別に数える（meta.guardChars）。
 *   (e) gate は 5 段。1 つでも外れたら null:
 *       armed()（`v292Dfix796On==='1'` かつ `v292Dfix796Off!=='1'`）
 *       → story 一致（`v292Dfix796Story === ctx.sid`）→ memoryV1 あり
 *       → select 成立 → render text 非空。
 *   (f) telemetry: `status().lastBlocks = { memoryChars, guardChars, records,
 *       droppedByCap, order }`（＋ gate / sid / currentTurn / queryReason / reason）。
 *   (g) turnCtx は呼び出し側が渡してよい（fixture / dry）。渡されない場合だけ
 *       `ctx.text` / `ctx.prevTurn` / `ctx.currentTurn` から **この module 内で**
 *       組み立てる。呼び出し側に entity 解決を持たせない、が 3C-2 の要点。
 *       live 世代では「いま生成中のターン」の対話相手が確定していないので、
 *       interlocutor は **直前ターン**（prevTurn）から取る（canary 限定の近似・記録済み）。
 *   (g2) live の `chr6_active_slot` は JSON 文字列（`"smtg00ynsv1"`）で保存されているが
 *       memoryV1 の key は生の storyId。囲みの二重引用符だけ `normSid()` で外す。
 *   (h) 副作用は Rev5 と同じ 0。localStorage は read のみ・network 0 / timer 0 /
 *       listener 0 / DOM 0 / 生成系レジストリ非登録。throw 0（fail-open で null）。
 * ★DEPLOY != ENABLE。既定 OFF。load 時に自動実行しない。
 * opt-in : v292Dfix796On  === '1'（既定 OFF）
 * kill   : v292Dfix796Off === '1'
 * ---------------------------------------------------------------------
 * ★解釈メモ（Fable5.1 裁定待ち・実装は保守側に倒してある）
 *  (I1) turnCtx は呼び出し側が渡す平坦オブジェクト。本 module は
 *       interlocutorId / explicitInputMentionIds / currentTurn を **自分で計算しない**。
 *  (I2) 【Fable5.1 裁定 Rev2 → ★Rev5 で query source を確定】entityHit の tier は
 *       **interlocutorId 一致 = 2（直接の対話相手のみ）** /
 *       **explicitInputMentionIds 一致 = 1** / else 0。重み・tier 値は Rev2 のまま。
 *       tier1 の id 集合には interlocutorId も含める（speaker ではなく ref 側が
 *       対話相手だった場合を 0 に落とさないため）。
 *       presentIds / recentMentionIds / playerInputNames は **query source ではない**。
 *  (I3) ★Rev5: 名前 → entityId の解決は builder 側の
 *       `explicitMentionIdsFromText` だけが行い、**一意 resolve できたものだけ**を
 *       entityId として渡す。select 側は entityId の完全一致しか見ない
 *       （「村長の使い」!== 「村長」／candidate・ambiguous・部分一致は 0）。
 *  (I4) 合計文字数: 目標 300 字（TOTAL_SOFT）。3 件 × 80 字 + 見出し + 境界行の
 *       構造上の最大は 360 字（TOTAL_HARD）なので、hard 上限は 360 とし、
 *       360 を超える場合のみ末尾行を落とす。turn 数には一切依存しない。
 *  (I5) relationHit は record.relationRefs（relationId 文字列）の共有で判定する。
 *       1 hop のみ。推移閉包なし。
 *  (I6) 【Fable5.1 裁定 Rev2・ADOPT as DEFAULT / Rev4 で基準を訂正】
 *       **未来 record と「いま生成中のターン」の record は候補にしない**。
 *       `source.lastTurn >= turnCtx.currentTurn` の record は select() の対象外
 *       （起きる前に思い出せない = correctness invariant であって tuning ではない）。
 *       `currentTurn` が未指定/非数値のときは除外しない（従来挙動）。
 *       除外件数は log.futureDropped に残す。閾値・係数は変えていない。
 *  (I7) 【Fable5.1 裁定 Rev2・ADOPT】**entityId 完全一致は admission key**。
 *       score は「入場した record の順位付け」しかしない。
 *       → **entityHit === 0 の record は recency がいくら新しくても select されない**。
 *       score = 3*entityHit + 2*recencyBand + 1*relationHit + 1*epistemicBonus と
 *       score<4 drop は **二次ガードとしてそのまま維持**（重み 3/2/1/1・帯 20/60 も不変）。
 *       除外件数は log.entityGateDropped に残す。
 *  (I8) __test.buildTurnCtxFromTurn(turnIndex, slotBody, knownEntitiesFn)
 *       = 155T shadow log 用の **純粋な** turnCtx 組み立て（live 参照 0・
 *       fix190/fix77 の state 値を読まない・callback は harness が渡す）。
 *       ★Rev5: 返すのは interlocutorId / explicitInputMentionIds / currentTurn のみ。
 *       在席を注入する opts（presentIdsFn）は **撤去**した。
 *  (I9) 【GPT 裁定 Rev3・確定】select() の log に **計測専用フィールド** を分離する。
 *       155T shadow log のための観測値であり、**選択挙動は 1 mm も変えない**
 *       （重み 3/2/1/1・帯 20/60・MIN_SCORE=4・MAX_ITEMS=3 は不変。
 *        GPT: 「0/155 を理由に緩めない」）。
 *       分割は排他かつ網羅:
 *         active = future + noEntity + lowScore + capped + selected
 *         resolvable = active - future = noEntity + lowScore + capped + selected
 *         entityHit  = resolvable - noEntity = lowScore + capped + selected
 *         admitted   = capped + selected
 *       ・active     : memoryV1 の ACTIVE 件数（= indexSize）
 *       ・resolvable : active から未来除外を引いた「turn 的に参照可能な母数」
 *       ・entityHit  : resolvable のうち entityHit>=1 の件数
 *       ・admitted   : entityHit>=1 かつ score>=4 かつ not future（= 入場成立）
 *       ・selected   : 最終採用件数（<=3）
 *       ・noMatchReason : { future, noEntity, lowScore, capped } = drop 理由ヒストグラム
 *       ★shape 変更: 従来の log.selected（配列）は **log.selectedDetail** に改名し、
 *         log.selected は **件数（数値）** になった。log.admitted の意味も
 *         「entity gate 通過数」→「入場成立数」に変わり、旧 admitted 値は
 *         **log.entityHit** に等しい（log.entityGateDropped は従来どおり残す）。
 *  (I10)【GPT 裁定 Rev3・確定】render(selected, opts) の上限は
 *       **呼び出し側が渡す残予算**。memory は「上位ブロックを引いた残り、最大 300 字」。
 *       opts.maxChars 既定 300（TOTAL_SOFT）。実効 cap = min(maxChars, 300)。
 *       構造上限 360（TOTAL_HARD）は据え置きで、cap が 360 を超えることはない。
 *       超過時は **末尾の record を丸ごと落とす**（行の途中で切らない）。
 *       1 件 + 見出し + 境界行 すら入らなければ **空文字**（memory 0 件は正常）。
 *       戻り値 { text, excludedWorldEvent, droppedForBudget, lines, chars, maxChars }
 *       ＋ ★Rev5 telemetry { selected, actuallyInjected, droppedByBudget, finalChars }。
 * ===================================================================== */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.__v292Dfix796) return;                  /* 二重install防止 */

  var BUILD = '20260902-fix796';
  var KEY_PREFIX = 'v292Dmem1_slot_';                /* fix793 と同じ story-scoped key（read only） */
  var LIFECYCLE_ACTIVE = 'ACTIVE';
  var CLASS_WORLD_EVENT = 'world_event';

  var LIMITS = {
    MAX_ITEMS: 3,          /* 上位 3 件 */
    MIN_SCORE: 4,          /* score < 4 は 0 件 */
    PROP_MAX: 80,          /* 1 件 80 字で切る */
    TOTAL_SOFT: 300,       /* 目標合計 */
    TOTAL_HARD: 360,       /* 構造上限（3*80 + 見出し + 境界行 + 行装飾） */
    RECENCY_NEAR: 20,      /* <=20T → 2 */
    RECENCY_MID: 60        /* 21..60T → 1 */
  };
  var CANDIDATE_PREFIX = 'char_candidate:';   /* ★Rev5: candidate は query entity にしない */
  var ELLIPSIS = '…';
  var HEAD = '【過去に語られたこと（参考・必ず触れなくてよい）】';
  var FOOT = '※これは記録であり、人物が今これを知っている根拠ではない。';
  var EPISTEMIC_BONUS = { DISCLOSURE: 1, COMMITMENT: 1 };

  /* ★Rev5 (GPT 裁定 4): 3C-2 で sys に入れる予定の guard 文。dry では render しない。 */
  var GUARD_SENTENCE = '記憶欄は過去の発言履歴であり、現在の事実や、現在の人物が知っている事実として'
                     + '自動的に扱わない。現在状態・制約と矛盾する場合は現在側を優先する。';
  /* ★Rev5: sys 内の予定順序（memory → current state → guard）。dry では順序定数を返すだけ。 */
  var ORDER = ['memory', 'currentState', 'guard'];

  var INV = { PENDING_IN_INDEX: 'INVARIANT_PENDING_IN_INDEX' };
  var REASON = {
    OK: 'OK',
    DISABLED: 'RETRIEVE_DISABLED',
    NO_MEMORY: 'MEMORY_UNAVAILABLE',
    EMPTY_INDEX: 'INDEX_EMPTY',
    NO_SELECTION: 'NO_RECORD_OVER_MIN_SCORE',
    FAIL_CLOSED: 'FAIL_CLOSED_INVARIANT',
    ERROR: 'RETRIEVE_ERROR'
  };

  /* ---------- flags（read only。書き込みは一切しない） ---------- */
  function lsg(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function isOn()  { return lsg('v292Dfix796On')  === '1'; }
  function isOff() { return lsg('v292Dfix796Off') === '1'; }
  function armed() { return isOn() && !isOff(); }
  function keyFor(storyId) { return KEY_PREFIX + String(storyId); }

  var _lastLog = null;
  var _lastBlocks = null;                            /* ★Rev6: canaryBlocks の最終 telemetry */
  function setLog(o) { _lastLog = o; return o; }
  function newLog(storyId, turnCtx) {
    return {
      build: BUILD, storyId: String(storyId || ''),
      turn: (turnCtx && isNum(turnCtx.currentTurn)) ? turnCtx.currentTurn : null,
      armed: armed(), on: isOn(), off: isOff(),
      reason: REASON.OK, invariants: [],
      indexSize: 0, candidates: 0, activeDialogueClaim: 0, activeWorldEvent: 0,
      keys: null, selectedDetail: [], knownToProvenance: [], excludedWorldEvent: 0, renderedChars: 0,
      futureDropped: 0, futureGateApplied: false, entityGateDropped: 0,
      /* ★(I9) Rev3 計測専用フィールド。観測のみ・選択挙動に一切影響しない。 */
      active: 0, resolvable: 0, entityHit: 0, admitted: 0, selected: 0,
      noMatchReason: { future: 0, noEntity: 0, lowScore: 0, capped: 0 },
      /* ★(I10) render 段で埋まる（budget で落とした record 数） */
      droppedForBudget: 0
    };
  }

  /* ---------- small helpers ---------- */
  function isNum(n) { return typeof n === 'number' && isFinite(n); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function str(s) { return (s === null || s === undefined) ? '' : String(s); }
  function uniqSorted(list) {
    var seen = {}, out = [], i, v;
    for (i = 0; i < list.length; i++) {
      v = str(list[i]); if (!v) continue;
      if (!Object.prototype.hasOwnProperty.call(seen, v)) { seen[v] = 1; out.push(v); }
    }
    out.sort(); return out;
  }
  /* entityId の表示名 = 最終 ':' セグメント（構造的な切り出し。類似度計算ではない） */
  function displayNameOf(entityId) {
    var s = str(entityId); if (!s) return '';
    var i = s.lastIndexOf(':');
    return i >= 0 ? s.slice(i + 1) : s;
  }
  function entityIdsOf(record) {
    var out = [], i, refs;
    if (!record) return out;
    if (record.source && record.source.speakerEntityId) out.push(str(record.source.speakerEntityId));
    refs = arr(record.refs);
    for (i = 0; i < refs.length; i++) if (refs[i] && refs[i].entityId) out.push(str(refs[i].entityId));
    return out;
  }
  function truncate(s, max) {
    var t = str(s);
    if (t.length <= max) return t;
    return t.slice(0, max) + ELLIPSIS;
  }

  /* ==================================================================
   * memoryV1 の取得（渡されたものを最優先。無ければ local key を read only）
   * ================================================================== */
  function resolveMemory(storyId, memoryV1) {
    if (memoryV1 && typeof memoryV1 === 'object') return memoryV1;
    if (memoryV1 !== undefined && memoryV1 !== null) return null;   /* 非オブジェクトは不正 */
    var sid = str(storyId); if (!sid) return null;
    var raw = lsg(keyFor(sid));
    if (!raw) return null;
    try { var v = JSON.parse(raw); return (v && typeof v === 'object') ? v : null; }
    catch (e) { return null; }
  }

  /* ==================================================================
   * index（構造的排除）: ACTIVE だけを **push する**。PENDING_REF は入れない。
   * ================================================================== */
  function buildIndex(memoryV1, storyId) {
    var out = [], recs = memoryV1 ? arr(memoryV1.records) : [], i, r, sid = str(storyId);
    for (i = 0; i < recs.length; i++) {
      r = recs[i];
      if (!r || typeof r !== 'object') continue;
      if (r.lifecycle !== LIFECYCLE_ACTIVE) continue;                /* ★構造的排除 */
      if (sid && r.storyId && str(r.storyId) !== sid) continue;
      out.push(r);
    }
    return out;
  }
  /* index 後段の不変条件検査。非 ACTIVE が 1 件でもあれば false（→ fail-closed） */
  function verifyIndex(index) {
    var i, list = arr(index);
    for (i = 0; i < list.length; i++) {
      if (!list[i] || list[i].lifecycle !== LIFECYCLE_ACTIVE) return false;
    }
    return true;
  }
  function candidatesFromIndex(index, log) {
    if (!verifyIndex(index)) {
      if (log) { log.invariants.push(INV.PENDING_IN_INDEX); log.reason = REASON.FAIL_CLOSED; log.candidates = 0; }
      return [];                                                     /* ★fail-closed */
    }
    var list = arr(index).slice(0);
    list.sort(function (a, b) { return str(a.memoryId) < str(b.memoryId) ? -1 : (str(a.memoryId) > str(b.memoryId) ? 1 : 0); });
    if (log) {
      log.indexSize = list.length; log.candidates = list.length;
      log.active = list.length;                                      /* ★(I9) 計測: ACTIVE 母数 */
      for (var i = 0; i < list.length; i++) {
        if (list[i].lineageClass === CLASS_WORLD_EVENT) log.activeWorldEvent++;
        else log.activeDialogueClaim++;
      }
    }
    return list;
  }

  /* ==================================================================
   * keysFor(turnCtx) — 突合に使う entityId 集合（完全一致のみ）
   *   ★Rev5（GPT 裁定 5）: query entity source は **2 つだけ**。
   *     tier2 = interlocutorId（いま話している相手）
   *     tier1 = explicitInputMentionIds（player 入力から既存 canonical entity へ
   *             **一意 resolve できた** entityId。candidate / 曖昧 / 部分一致は 0）
   *   **presentIds / recentMentionIds / playerInputNames は query source ではない**。
   *   turnCtx に残っていても **無視する**（presence 概念を持たない）。
   * ================================================================== */
  function keysFor(turnCtx) {
    var c = (turnCtx && typeof turnCtx === 'object') ? turnCtx : {};
    var interlocutorId = str(c.interlocutorId);
    var explicit = uniqSorted(arr(c.explicitInputMentionIds).map(str));
    var ids = uniqSorted([].concat(interlocutorId ? [interlocutorId] : [], explicit));
    return {
      interlocutorId: interlocutorId,
      explicitInputMentionIds: explicit,
      ids: ids,                                  /* 突合対象の entityId 集合 */
      /* tier1(=1): explicit input mention ＋ 対話相手（ref 側一致用）。tier2(=2) は speaker===interlocutorId のみ。 */
      tier1: uniqSorted([].concat(explicit, interlocutorId ? [interlocutorId] : [])),
      currentTurn: isNum(c.currentTurn) ? c.currentTurn : null
    };
  }
  /* 完全一致のみ。substring / fuzzy / embedding は使わない。 */
  function idInList(entityId, list) {
    var e = str(entityId); if (!e) return false;
    for (var i = 0; i < list.length; i++) if (list[i] === e) return true;   /* === のみ */
    return false;
  }
  /* ==================================================================
   * score 成分
   * ================================================================== */
  function entityHitOf(record, keys) {
    if (!record || !keys) return 0;
    var speaker = record.source ? str(record.source.speakerEntityId) : '';
    if (keys.interlocutorId && speaker && speaker === keys.interlocutorId) return 2;
    var ids = entityIdsOf(record), i;
    for (i = 0; i < ids.length; i++) if (idInList(ids[i], keys.tier1)) return 1;   /* ★entityId 完全一致のみ */
    return 0;
  }
  function recencyBandOf(record, keys) {
    if (!record || !record.source || !keys || !isNum(keys.currentTurn)) return 0;
    var last = record.source.lastTurn;
    if (!isNum(last)) return 0;
    var d = keys.currentTurn - last;
    if (d <= LIMITS.RECENCY_NEAR) return 2;
    if (d <= LIMITS.RECENCY_MID) return 1;
    return 0;
  }
  /* 1 hop のみ。推移閉包なし。relationRefs（relationId）の共有で判定。 */
  function relationHitOf(record, selectedRecords) {
    var mine = arr(record && record.relationRefs).map(str);
    if (!mine.length) return 0;
    var list = arr(selectedRecords), i, j, theirs;
    for (i = 0; i < list.length; i++) {
      theirs = arr(list[i] && list[i].relationRefs).map(str);
      for (j = 0; j < theirs.length; j++) if (theirs[j] && mine.indexOf(theirs[j]) >= 0) return 1;
    }
    return 0;
  }
  function epistemicBonusOf(record) {
    var e = record ? str(record.epistemic) : '';
    return Object.prototype.hasOwnProperty.call(EPISTEMIC_BONUS, e) ? EPISTEMIC_BONUS[e] : 0;
  }
  function scoreDetail(record, turnCtx, selectedRecords) {
    var keys = (turnCtx && turnCtx.ids && turnCtx.tier1) ? turnCtx : keysFor(turnCtx);
    var eH = entityHitOf(record, keys);
    var rB = recencyBandOf(record, keys);
    var rH = relationHitOf(record, selectedRecords);
    var eB = epistemicBonusOf(record);
    return { entityHit: eH, recencyBand: rB, relationHit: rH, epistemicBonus: eB,
             total: (3 * eH) + (2 * rB) + (1 * rH) + (1 * eB) };
  }
  /* 公開 score(): 整数を返す。第3引数（選択済み）は任意。省略時 relationHit=0。 */
  function score(record, turnCtx, selectedRecords) {
    try { return scoreDetail(record, turnCtx, selectedRecords).total; }
    catch (e) { return 0; }
  }

  /* ==================================================================
   * candidates(storyId, memoryV1) — ACTIVE のみ。PENDING_REF は絶対に入らない。
   * ================================================================== */
  function candidates(storyId, memoryV1) {
    try {
      var log = setLog(newLog(storyId, null));
      var mem = resolveMemory(storyId, memoryV1);
      if (!mem) { log.reason = REASON.NO_MEMORY; return []; }
      var idx = buildIndex(mem, storyId);
      var out = candidatesFromIndex(idx, log);
      if (!out.length && log.reason === REASON.OK) log.reason = REASON.EMPTY_INDEX;
      return out;
    } catch (e) {
      setLog(newLog(storyId, null)); _lastLog.reason = REASON.ERROR; _lastLog.error = str(e && e.message);
      return [];                                                     /* fail-open */
    }
  }

  /* ==================================================================
   * select(storyId, memoryV1, turnCtx)
   *   score 降順（同点 memoryId 昇順）で最大 3 件。score<4 は捨てる。
   *   relationHit は「選択済みとの 1 hop」なので貪欲に 1 件ずつ確定する
   *   （各ラウンドで最大 score・同点は memoryId 昇順 → 決定的）。
   * ================================================================== */
  function select(storyId, memoryV1, turnCtx) {
    var out = [];
    var log = setLog(newLog(storyId, turnCtx));
    /* ★早期 return でも log を必ず添付するため、本体は内部関数に閉じる */
    function run() {
      if (!armed()) { log.reason = REASON.DISABLED; return; }
      var mem = resolveMemory(storyId, memoryV1);
      if (!mem) { log.reason = REASON.NO_MEMORY; return; }
      var idx = buildIndex(mem, storyId);
      var pool = candidatesFromIndex(idx, log);
      if (log.invariants.length) return;                              /* fail-closed */
      if (!pool.length) { log.reason = REASON.EMPTY_INDEX; return; }

      var keys = keysFor(turnCtx);
      log.keys = { interlocutorId: keys.interlocutorId,
                   explicitInputMentionIds: keys.explicitInputMentionIds, ids: keys.ids };

      /* ★(I6) 既定で未来 record を除く。currentTurn 未指定なら除かない。 */
      var usable = pool;
      log.futureDropped = 0;
      log.futureGateApplied = isNum(keys.currentTurn);
      if (isNum(keys.currentTurn)) {
        usable = [];
        for (var f = 0; f < pool.length; f++) {
          var lt = (pool[f].source && isNum(pool[f].source.lastTurn)) ? pool[f].source.lastTurn : null;
          if (lt !== null && lt >= keys.currentTurn) { log.futureDropped++; continue; }
          usable.push(pool[f]);
        }
      }
      /* ★(I9) 計測のみ: resolvable = ACTIVE − 未来除外 */
      log.noMatchReason.future = log.futureDropped;
      log.resolvable = usable.length;
      /* ★(I7) admission gate: entityId 完全一致（entityHit>=1）が入場条件。
         entityHit===0 は recency に関わらず select しない。score は順位付けのみ。 */
      var entityAdmitted = [], g;
      log.entityGateDropped = 0;
      for (g = 0; g < usable.length; g++) {
        if (entityHitOf(usable[g], keys) >= 1) entityAdmitted.push(usable[g]);
        else log.entityGateDropped++;
      }
      /* ★(I9) 計測のみ: entityHit = resolvable のうち entityId 完全一致があった件数 */
      log.entityHit = entityAdmitted.length;
      log.noMatchReason.noEntity = log.entityGateDropped;
      var remaining = entityAdmitted.slice(0);  /* memoryId 昇順で安定済み */
      var chosenRecords = [];
      while (out.length < LIMITS.MAX_ITEMS && remaining.length) {
        var bestIdx = -1, best = null;
        for (var i = 0; i < remaining.length; i++) {
          var d = scoreDetail(remaining[i], keys, chosenRecords);
          /* remaining は memoryId 昇順。厳密な > のみで置換 → 同点は先着（=memoryId 昇順）*/
          if (best === null || d.total > best.total) { best = d; bestIdx = i; }
        }
        if (best === null || best.total < LIMITS.MIN_SCORE) break;    /* score<4 は 0 件側 */
        var rec = remaining.splice(bestIdx, 1)[0];
        chosenRecords.push(rec);
        out.push({
          memoryId: str(rec.memoryId),
          record: rec,
          lineageClass: str(rec.lineageClass),
          speakerEntityId: rec.source ? str(rec.source.speakerEntityId) : '',
          displayName: rec.source ? displayNameOf(rec.source.speakerEntityId) : '',
          lastTurn: (rec.source && isNum(rec.source.lastTurn)) ? rec.source.lastTurn : null,
          proposition: str(rec.normalizedProposition),
          proposition80: truncate(rec.normalizedProposition, LIMITS.PROP_MAX),
          score: best.total,
          breakdown: { entityHit: best.entityHit, recencyBand: best.recencyBand,
                       relationHit: best.relationHit, epistemicBonus: best.epistemicBonus },
          /* ★knownTo は provenance としてのみ同梱。フィルタに使わない。 */
          knownTo: (rec.knowledge && arr(rec.knowledge.knownTo)) || []
        });
      }
      if (!out.length) log.reason = REASON.NO_SELECTION;
      /* ★(I9) 計測のみ（選択は既に確定している）: 入場候補のうち選ばれなかったものを
         「score 不足(lowScore)」と「上限 3 件で溢れた(capped)」に排他分割する。
         最終 chosenRecords に対する事後採点なので決定的で、選択順序には影響しない。 */
      log.selected = out.length;
      for (var m = 0; m < remaining.length; m++) {
        if (scoreDetail(remaining[m], keys, chosenRecords).total >= LIMITS.MIN_SCORE) log.noMatchReason.capped++;
        else log.noMatchReason.lowScore++;
      }
      log.admitted = log.selected + log.noMatchReason.capped;
      for (var k = 0; k < out.length; k++) {
        log.selectedDetail.push({ memoryId: out[k].memoryId, score: out[k].score,
                            breakdown: out[k].breakdown, lineageClass: out[k].lineageClass,
                            lastTurn: out[k].lastTurn });
        log.knownToProvenance.push({ memoryId: out[k].memoryId, knownTo: out[k].knownTo });
      }
    }
    try { run(); }
    catch (e) {
      log.reason = REASON.ERROR; log.error = str(e && e.message);
      out.length = 0;                                                 /* fail-open: throw しない */
      log.selected = 0; log.selectedDetail = []; log.knownToProvenance = [];
    }
    try { Object.defineProperty(out, 'log', { value: log, enumerable: false, configurable: true }); } catch (e2) {}
    return out;
  }

  /* ==================================================================
   * (I8) buildTurnCtxFromTurn — 155T shadow log 用の turnCtx 組み立て（純粋）
   *   ・live 参照 0 / server 0 / DOM 0 / timer 0。
   *   ・**fix190 / fix77 の state 値は読まない**（シーンの entityId 取得のみ）。
   *   ・knownEntitiesFn(turnIndex) は harness が渡す callback。
   *     in-page では me1 抽出器の known entity map、fixture では stub。
   *     返り値は { <表示名>: {entityId,...} } の map / [{entityId,name}] / [id] の
   *     いずれでも受ける。
   *   ・戻り値は fix796 の turnCtx 契約そのまま:
   *     { interlocutorId, presentIds[], recentMentionIds[], playerInputNames[], currentTurn }
   *     ＋ 由来を追える _sources を同梱（log 用・retrieve は使わない）。
   *   ・★Rev4: turnIndex は **0-based**（slotBody.turns[turnIndex] を読む）。currentTurn = turnIndex。
   * ================================================================== */
  /* known entity 集合を { names:[], ids:[], byName:{name:id}, metaByName:{name:{status,ambiguous}} } に正規化する */
  function normalizeKnown(k) {
    var byName = {}, metaByName = {}, ids = [], names = [], i, v, key;
    if (!k) return { names: names, ids: ids, byName: byName, metaByName: metaByName };
    if (Array.isArray(k)) {
      for (i = 0; i < k.length; i++) {
        v = k[i];
        if (typeof v === 'string') { if (v) { ids.push(v); names.push(displayNameOf(v)); byName[displayNameOf(v)] = v; } }
        else if (v && typeof v === 'object') {
          var id = str(v.entityId), nm = str(v.name || v.displayName) || displayNameOf(id);
          if (id) { ids.push(id); if (nm) { names.push(nm); byName[nm] = id;
            metaByName[nm] = { status: str(v.status), ambiguous: v.ambiguous === true }; } }
        }
      }
    } else if (typeof k === 'object') {
      for (key in k) {
        if (!Object.prototype.hasOwnProperty.call(k, key)) continue;
        v = k[key];
        var id2 = (v && typeof v === 'object') ? str(v.entityId) : str(v);
        if (!id2) continue;
        ids.push(id2); names.push(str(key)); byName[str(key)] = id2;
        metaByName[str(key)] = (v && typeof v === 'object')
          ? { status: str(v.status), ambiguous: v.ambiguous === true }
          : { status: '', ambiguous: false };
      }
    }
    return { names: uniqSorted(names), ids: uniqSorted(ids), byName: byName, metaByName: metaByName };
  }

  function callKnown(fn, t) {
    if (typeof fn !== 'function') return null;
    try { return fn(t); } catch (e) { return null; }
  }

  /* 対話相手: turn.plan._v254who → turn._convSayMeta の順で「導ければ」取る。無ければ null。 */
  function interlocutorFromTurn(turn, byName) {
    if (!turn || typeof turn !== 'object') return null;
    var cand = null, m, last;
    if (turn.plan && typeof turn.plan === 'object' && turn.plan._v254who) cand = turn.plan._v254who;
    if (!cand) {
      m = turn._convSayMeta;
      if (Array.isArray(m) && m.length) {
        last = m[m.length - 1];
        if (typeof last === 'string') cand = last;
        else if (last && typeof last === 'object') cand = last.entityId || last.who || last.speaker || last.name || null;
      } else if (m && typeof m === 'object') {
        cand = m.entityId || m.who || m.speaker || m.name || null;
      }
    }
    cand = str(cand);
    if (!cand) return null;
    if (cand.indexOf(':') >= 0) return cand;                          /* 既に entityId */
    return Object.prototype.hasOwnProperty.call(byName, cand) ? byName[cand] : null;
  }

  /* ★Rev5: explicitInputMentionIds —— **player 入力文字列だけ**から、既存 canonical entity へ
     **一意に resolve できた** entityId を返す。GPT 裁定 5:
       ・最長一致（他の一致名の真部分文字列は落とす。「村長の使い」で「村長」を拾わない）
       ・candidate（`char_candidate:` / status==='candidate'）は **0**
       ・ambiguous:true は **0**
       ・部分一致・表層類似は **0**（literal 出現のみ）
     戻り値 { ids:[], names:[], dropped:[{name,reason}] }。落とした理由を必ず残す。 */
  function explicitMentionIdsFromText(playerText, kNow) {
    var out = { ids: [], names: [], dropped: [] };
    var text = str(playerText); if (!text || !kNow) return out;
    var names = arr(kNow.names), hit = [], i, j;
    for (i = 0; i < names.length; i++) {
      if (names[i] && text.indexOf(names[i]) >= 0) hit.push(names[i]);
    }
    var kept = [];
    for (i = 0; i < hit.length; i++) {
      var swallowed = false;
      for (j = 0; j < hit.length; j++) {
        if (i === j) continue;
        if (hit[j].length > hit[i].length && hit[j].indexOf(hit[i]) >= 0) { swallowed = true; break; }
      }
      if (swallowed) out.dropped.push({ name: hit[i], reason: 'substring_of_longer_match' });
      else kept.push(hit[i]);
    }
    var ids = [];
    for (i = 0; i < kept.length; i++) {
      var nm = kept[i];
      var id = Object.prototype.hasOwnProperty.call(kNow.byName, nm) ? str(kNow.byName[nm]) : '';
      var meta = (kNow.metaByName && kNow.metaByName[nm]) ? kNow.metaByName[nm] : null;
      if (!id) { out.dropped.push({ name: nm, reason: 'unresolved' }); continue; }
      if (meta && meta.ambiguous === true) { out.dropped.push({ name: nm, reason: 'ambiguous' }); continue; }
      if (meta && str(meta.status) === 'candidate') { out.dropped.push({ name: nm, reason: 'candidate' }); continue; }
      if (id.indexOf(CANDIDATE_PREFIX) === 0) { out.dropped.push({ name: nm, reason: 'candidate' }); continue; }
      ids.push(id); out.names.push(nm);
    }
    out.ids = uniqSorted(ids);
    return out;
  }

  function buildTurnCtxFromTurn(turnIndex, slotBody, knownEntitiesFn) {
    var ctx = { interlocutorId: null, explicitInputMentionIds: [], currentTurn: null,
                _sources: { interlocutor: 'none', explicitInput: 'none' },
                _explicitNames: [], _droppedMentions: [] };
    try {
      var ti = isNum(turnIndex) ? turnIndex : null;
      ctx.currentTurn = ti;
      var turns = (slotBody && Array.isArray(slotBody.turns)) ? slotBody.turns : [];
      var turn = (ti !== null && ti >= 0 && ti < turns.length) ? turns[ti] : null;   /* ★Rev4: 0-origin（S.turns の配列 index） */

      var kNow = normalizeKnown(callKnown(knownEntitiesFn, ti));

      /* 対話相手（tier2） */
      var who = interlocutorFromTurn(turn, kNow.byName);
      ctx.interlocutorId = who;
      if (who) ctx._sources.interlocutor = (turn && turn.plan && turn.plan._v254who) ? 'plan._v254who' : '_convSayMeta';

      /* ★Rev5: player 入力から一意 resolve できた canonical entity（tier1）だけ。
         在席（presence）も直近言及（recentMention）も **作らない**。 */
      var ex = explicitMentionIdsFromText(turn ? turn.playerText : '', kNow);
      ctx.explicitInputMentionIds = ex.ids;
      ctx._explicitNames = ex.names;
      ctx._droppedMentions = ex.dropped;
      if (ex.ids.length) ctx._sources.explicitInput = 'turn.playerText';
    } catch (e) {
      return { interlocutorId: null, explicitInputMentionIds: [],
               currentTurn: isNum(turnIndex) ? turnIndex : null,
               _sources: { interlocutor: 'error', explicitInput: 'error' },
               _explicitNames: [], _droppedMentions: [] };
    }
    return ctx;
  }

  /* ==================================================================
   * render(selected, opts) — 文字列を返すだけ。world_event は render 段で除外。
   *   ★(I10) opts.maxChars = **呼び出し側の残予算**（既定 300 = TOTAL_SOFT）。
   *      実効 cap = min(maxChars, TOTAL_SOFT)。TOTAL_HARD(360) は据え置きで、
   *      cap がそれを超えることはない。
   *      超過時は **末尾の record を丸ごと落とす**（行の途中では絶対に切らない）。
   *      1 件すら入らなければ空文字（memory 0 件は異常ではない）。
   *   戻り値 { text, excludedWorldEvent, droppedForBudget, lines, chars, maxChars }
   * ================================================================== */
  function composeText(lines) { return HEAD + '\n' + lines.join('\n') + '\n' + FOOT; }
  function capFor(opts) {
    var want = (opts && typeof opts === 'object' && isNum(opts.maxChars)) ? opts.maxChars : LIMITS.TOTAL_SOFT;
    var cap = (want < LIMITS.TOTAL_SOFT) ? want : LIMITS.TOTAL_SOFT;   /* min(maxChars, 300) */
    if (cap > LIMITS.TOTAL_HARD) cap = LIMITS.TOTAL_HARD;              /* 構造上限は常に効く */
    return cap;
  }
  function render(selected, opts) {
    var cap0 = LIMITS.TOTAL_SOFT;
    var res = { text: '', excludedWorldEvent: 0, droppedForBudget: 0, lines: [], chars: 0, maxChars: cap0,
                /* ★Rev5 telemetry（GPT 裁定 2）: 途中で文字切断せず件数で削る。 */
                selected: 0, actuallyInjected: 0, droppedByBudget: 0, finalChars: 0 };
    try {
      var cap = capFor(opts);
      res.maxChars = cap;
      var list = arr(selected), i, e, rec, lines = [];
      res.selected = list.length;
      for (i = 0; i < list.length; i++) {
        e = list[i]; if (!e) continue;
        rec = (e.record && typeof e.record === 'object') ? e.record : e;
        if (str(rec.lineageClass) === CLASS_WORLD_EVENT) { res.excludedWorldEvent++; continue; }  /* ★除外 */
        var spk = str(e.displayName) || displayNameOf(rec.source && rec.source.speakerEntityId)
                  || (rec.source ? str(rec.source.speakerEntityId) : '');
        var lt  = (e.lastTurn !== undefined && e.lastTurn !== null) ? e.lastTurn
                  : (rec.source ? rec.source.lastTurn : null);
        var prop = (e.proposition80 !== undefined && e.proposition80 !== null && e.proposition80 !== '')
                   ? str(e.proposition80) : truncate(rec.normalizedProposition, LIMITS.PROP_MAX);
        if (!prop) continue;                                          /* 命題が無い record は出さない */
        lines.push('・' + spk + '（T' + str(lt) + '）: ' + prop);
        if (lines.length >= LIMITS.MAX_ITEMS) break;                  /* turn 数に依存しない固定上限 */
      }
      if (!lines.length) { res.chars = 0; res.actuallyInjected = 0; res.droppedByBudget = res.droppedForBudget;
                           res.finalChars = 0; return res; }           /* 元から 0 件（rev2 と同一経路） */
      var text = composeText(lines);
      /* ★(I10) 残予算に収まるまで **末尾の record を丸ごと** 落とす。行の途中では切らない。 */
      while (lines.length && text.length > cap) {
        lines.pop(); res.droppedForBudget++;
        text = lines.length ? composeText(lines) : '';
      }
      if (!lines.length) {                                            /* 1 件も入らない = block 全体 drop（0 字） */
        res.text = ''; res.lines = []; res.chars = 0;
        res.actuallyInjected = 0; res.droppedByBudget = res.droppedForBudget; res.finalChars = 0;
        if (_lastLog) { _lastLog.excludedWorldEvent = res.excludedWorldEvent; _lastLog.renderedChars = 0;
                        _lastLog.droppedForBudget = res.droppedForBudget; }
        return res;
      }
      res.text = text; res.lines = lines; res.chars = text.length;
      res.actuallyInjected = lines.length; res.droppedByBudget = res.droppedForBudget; res.finalChars = res.chars;
      if (_lastLog) { _lastLog.excludedWorldEvent = res.excludedWorldEvent; _lastLog.renderedChars = res.chars;
                      _lastLog.droppedForBudget = res.droppedForBudget; }
    } catch (e3) {
      return { text: '', excludedWorldEvent: 0, droppedForBudget: 0, lines: [], chars: 0, maxChars: cap0,
               selected: 0, actuallyInjected: 0, droppedByBudget: 0, finalChars: 0 };   /* fail-open */
    }
    return res;
  }

  /* ==================================================================
   * ★Rev5 (I11 / GPT 裁定 7) dry hook —— **Planner 境界の外側**。
   *   ・Planner.build を読まない・sys に 1 文字も載せない・DOM も localStorage write も 0。
   *   ・「Planner に渡す**予定の** memory block」を生成して返すだけ。
   *   ・guard 文と ORDER は **定数として返すだけ**（dry では render しない）。
   *   dryBlock(turnCtx, { storyId, memoryV1, maxChars, telemetry })
   * ================================================================== */
  function newTelemetry() {
    return { byRecord: {}, turns: [], maxSameTop3Streak: 0, _lastTop3: null, _streak: 0 };
  }
  function noteTelemetry(t, res) {
    if (!t || typeof t !== 'object') return;
    var injected = arr(res.injectedMemoryIds), key = injected.join('|'), i;
    if (key && key === t._lastTop3) t._streak++;
    else { t._streak = key ? 1 : 0; t._lastTop3 = key || null; }
    if (t._streak > t.maxSameTop3Streak) t.maxSameTop3Streak = t._streak;
    for (i = 0; i < injected.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(t.byRecord, injected[i]))
        t.byRecord[injected[i]] = { injectCount: 0, lastInjectedTurn: null };
      t.byRecord[injected[i]].injectCount++;
      t.byRecord[injected[i]].lastInjectedTurn = res.currentTurn;
    }
    t.turns.push({ turn: res.currentTurn, interlocutorId: res.interlocutorId,
                   queryReason: res.queryReason, injected: injected.slice(),
                   sameTop3Streak: t._streak, selected: res.selected,
                   actuallyInjected: res.actuallyInjected,
                   droppedByBudget: res.droppedByBudget, finalChars: res.finalChars });
  }
  function dryBlock(turnCtx, opts) {
    var o = (opts && typeof opts === 'object') ? opts : {};
    var res = { build: BUILD, wired: false, registered: false, injectedToSys: false,
                order: ORDER.slice(), guardSentence: GUARD_SENTENCE, guardRendered: false,
                currentTurn: null, interlocutorId: '', explicitInputMentionIds: [],
                queryReason: 'none', reason: REASON.OK, invariants: [],
                selected: 0, actuallyInjected: 0, droppedByBudget: 0, finalChars: 0,
                text: '', lines: [], excludedWorldEvent: 0, strictPastExcluded: 0,
                selectedDetail: [], injectedMemoryIds: [] };
    try {
      var keys = keysFor(turnCtx);
      res.currentTurn = keys.currentTurn;
      res.interlocutorId = keys.interlocutorId;
      res.explicitInputMentionIds = keys.explicitInputMentionIds.slice();
      res.queryReason = keys.interlocutorId
        ? (keys.explicitInputMentionIds.length ? 'interlocutor+explicitInput' : 'interlocutor')
        : (keys.explicitInputMentionIds.length ? 'explicitInput' : 'none');
      var mem = Object.prototype.hasOwnProperty.call(o, 'memoryV1') ? o.memoryV1 : undefined;
      var sel = select(str(o.storyId), mem, turnCtx);
      var log = sel.log || null;
      var r = render(sel, { maxChars: isNum(o.maxChars) ? o.maxChars : LIMITS.TOTAL_SOFT });
      res.selected = sel.length;
      res.actuallyInjected = r.actuallyInjected;
      res.droppedByBudget = r.droppedByBudget;
      res.finalChars = r.finalChars;
      res.text = r.text; res.lines = r.lines.slice();
      res.excludedWorldEvent = r.excludedWorldEvent;
      if (log) { res.reason = log.reason; res.invariants = log.invariants.slice();
                 res.strictPastExcluded = log.futureDropped; res.log = log; }
      var kept = [], i;
      for (i = 0; i < sel.length; i++) {
        if (str(sel[i].lineageClass) === CLASS_WORLD_EVENT) continue;      /* render 段で除外される */
        kept.push(sel[i]);
      }
      for (i = 0; i < kept.length; i++) {
        res.selectedDetail.push({ memoryId: kept[i].memoryId, score: kept[i].score,
          breakdown: kept[i].breakdown, lineageClass: kept[i].lineageClass,
          speakerEntityId: kept[i].speakerEntityId, lastTurn: kept[i].lastTurn,
          proposition80: kept[i].proposition80,
          injected: i < res.actuallyInjected });
        if (i < res.actuallyInjected) res.injectedMemoryIds.push(kept[i].memoryId);
      }
      noteTelemetry(o.telemetry, res);
    } catch (e4) {
      res.reason = REASON.ERROR; res.error = str(e4 && e4.message);
      res.text = ''; res.lines = []; res.finalChars = 0;                  /* fail-open: throw しない */
    }
    return res;
  }

  /* ==================================================================
   * ★Rev6 — 3C-2 order 案 A 用の block provider
   *   canaryBlocks(ctx) -> null | { memoryText, guardText, meta }
   *   ctx = { sid, turnCtx?, mode?, text?, currentTurn?, prevTurn?, memoryV1?, maxChars? }
   * ================================================================== */

  /* memoryV1 の ACTIVE record が参照している entityId から「表示名 → entityId」を作る。
     同じ表示名に 2 つ以上の entityId がぶら下がったら ambiguous:true（= query source から落ちる）。
     入力は memoryV1 だけ。他 module の state も候補 entity も読まない。 */
  function knownFromMemory(memoryV1, storyId) {
    var idx = buildIndex(memoryV1, storyId), byName = {}, list = [], i, j, ids, nm, id, k;
    for (i = 0; i < idx.length; i++) {
      ids = entityIdsOf(idx[i]);
      for (j = 0; j < ids.length; j++) {
        id = str(ids[j]); if (!id) continue;
        if (id.indexOf(CANDIDATE_PREFIX) === 0) continue;            /* candidate は query source にしない */
        nm = displayNameOf(id); if (!nm) continue;
        if (!Object.prototype.hasOwnProperty.call(byName, nm)) {
          byName[nm] = { entityId: id, name: nm, status: '', ambiguous: false };
        } else if (byName[nm].entityId !== id) {
          byName[nm].ambiguous = true;                               /* 同名 2 id = 一意 resolve 不能 */
        }
      }
    }
    for (k in byName) { if (Object.prototype.hasOwnProperty.call(byName, k)) list.push(byName[k]); }
    return normalizeKnown(list);
  }

  /* 呼び出し側が turnCtx を持たない live 経路用。entity 解決は **ここ**でやる。 */
  function ctxFromCaller(o, kNow) {
    var who = interlocutorFromTurn(o.prevTurn, kNow.byName);
    var ex  = explicitMentionIdsFromText(o.text, kNow);
    return {
      interlocutorId: who,
      explicitInputMentionIds: ex.ids,
      currentTurn: isNum(o.currentTurn) ? o.currentTurn : null,
      _sources: { interlocutor: who ? 'prevTurn' : 'none',
                  explicitInput: ex.ids.length ? 'callerText' : 'none' },
      _explicitNames: ex.names, _droppedMentions: ex.dropped
    };
  }

  /* live の `chr6_active_slot` は **JSON 文字列**（`"smtg00ynsv1"`）で保存されているのに対し、
     memoryV1 の key は **生の storyId**（`v292Dmem1_slot_smtg00ynsv1`）。この差を呼び出し側に
     意識させないため、囲みの二重引用符だけをここで外す（他の正規化はしない）。 */
  function normSid(v) {
    var s = str(v).replace(/^\s+|\s+$/g, '');
    if (s.length >= 2 && s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') s = s.slice(1, -1);
    return s;
  }

  function storyFlag() { return normSid(lsg('v292Dfix796Story')); }

  function canaryBlocks(ctx) {
    var meta = { build: BUILD, gate: 'none', sid: '', currentTurn: null,
                 memoryChars: 0, guardChars: 0, records: 0, droppedByCap: 0,
                 order: ORDER.slice(), queryReason: 'none', reason: REASON.OK,
                 registered: false, cap: LIMITS.TOTAL_SOFT };
    try {
      var o = (ctx && typeof ctx === 'object') ? ctx : {};
      var sid = normSid(o.sid); meta.sid = sid;
      if (!armed())              { meta.gate = 'OFF';            meta.reason = REASON.DISABLED; _lastBlocks = meta; return null; }
      if (!sid)                  { meta.gate = 'NO_STORY_ID';    _lastBlocks = meta; return null; }
      var want = storyFlag();
      if (!want || want !== sid) { meta.gate = 'STORY_MISMATCH'; _lastBlocks = meta; return null; }
      var mem = Object.prototype.hasOwnProperty.call(o, 'memoryV1') ? o.memoryV1 : undefined;
      var m1 = resolveMemory(sid, mem);
      if (!m1)                   { meta.gate = 'NO_MEMORY'; meta.reason = REASON.NO_MEMORY; _lastBlocks = meta; return null; }

      var kNow = knownFromMemory(m1, sid);
      var tc = (o.turnCtx && typeof o.turnCtx === 'object') ? o.turnCtx : ctxFromCaller(o, kNow);
      meta.currentTurn = isNum(tc.currentTurn) ? tc.currentTurn : null;
      var keys = keysFor(tc);
      meta.queryReason = keys.interlocutorId
        ? (keys.explicitInputMentionIds.length ? 'interlocutor+explicitInput' : 'interlocutor')
        : (keys.explicitInputMentionIds.length ? 'explicitInput' : 'none');

      var sel = select(sid, m1, tc);
      if (_lastLog && _lastLog.reason) meta.reason = _lastLog.reason;

      /* ★cap 300 固定（GPT 裁定 2）。呼び出し側がさらに小さい値を渡した時だけ下げる。 */
      var cap = LIMITS.TOTAL_SOFT;
      if (isNum(o.maxChars) && o.maxChars < cap) cap = o.maxChars;
      meta.cap = cap;
      var r = render(sel, { maxChars: cap });
      meta.records = r.actuallyInjected;
      meta.droppedByCap = r.droppedByBudget;

      if (!r.text) {                                    /* ★memory 0 件 → guard も 0（guard 単独禁止） */
        meta.gate = 'NO_MEMORY_BLOCK';
        meta.memoryChars = 0; meta.guardChars = 0;
        _lastBlocks = meta; return null;
      }
      meta.gate = 'EMITTED';
      meta.memoryChars = r.text.length;
      meta.guardChars = GUARD_SENTENCE.length;          /* guard 固定文長は cap の外で数える */
      _lastBlocks = meta;
      return { memoryText: r.text, guardText: GUARD_SENTENCE, meta: meta };
    } catch (e5) {
      meta.gate = 'ERROR'; meta.reason = REASON.ERROR;
      meta.error = str(e5 && e5.message);
      meta.memoryChars = 0; meta.guardChars = 0; meta.records = 0;
      _lastBlocks = meta;
      return null;                                      /* fail-open: throw しない */
    }
  }

  /* ================================================================== */
  window.__v292Dfix796 = {
    __loaded: true, build_: BUILD, WIRED: false, ENABLED_BY_DEFAULT: false,
    keyPrefix: KEY_PREFIX, LIMITS: LIMITS, INVARIANTS: INV, REASON: REASON,
    GUARD_SENTENCE: GUARD_SENTENCE, ORDER: ORDER.slice(),
    status: function () {
      return {
        build: BUILD, on: isOn(), off: isOff(), active: armed(),
        wired: false, registered: false, writes: 'none',
        inputs: ['canonical memoryV1 only'],
        limits: LIMITS, keyPrefix: KEY_PREFIX,
        lastLog: _lastLog,
        lastBlocks: _lastBlocks,          /* ★Rev6: canaryBlocks の最終 telemetry */
        note: 'shadow only / index=ACTIVE all / PENDING_REF structurally excluded / '
            + 'exact entityId match only / world_event excluded at render / '
            + 'knownTo is provenance only / read-only localStorage / no hook / '
            + 'render cap = caller remaining budget (default 300, hard 360)'
      };
    },
    on:  function () { return isOn(); },      /* ★flag の読み取りのみ（書き込み禁止のため） */
    off: function () { return isOff(); },     /* ★kill flag の読み取りのみ */
    keysFor: keysFor,
    candidates: candidates,
    score: score,
    select: select,
    render: render,
    dryBlock: dryBlock,                       /* ★Rev5: sys へは 1 文字も載せない dry hook */
    canaryBlocks: canaryBlocks,               /* ★Rev6: 3C-2 order 案A の block provider（registry 非登録） */
    newTelemetry: newTelemetry,
    __test: {
      BUILD: BUILD, LIMITS: LIMITS, HEAD: HEAD, FOOT: FOOT, ELLIPSIS: ELLIPSIS,
      INV: INV, REASON: REASON,
      buildIndex: buildIndex, verifyIndex: verifyIndex, candidatesFromIndex: candidatesFromIndex,
      resolveMemory: resolveMemory, keyFor: keyFor,
      displayNameOf: displayNameOf, entityIdsOf: entityIdsOf, truncate: truncate,
      idInList: idInList,
      entityHitOf: entityHitOf,
      recencyBandOf: recencyBandOf, relationHitOf: relationHitOf,
      epistemicBonusOf: epistemicBonusOf, scoreDetail: scoreDetail,
      composeText: composeText, capFor: capFor,
      lastLog: function () { return _lastLog; },
      newLog: newLog,
      GUARD_SENTENCE: GUARD_SENTENCE, ORDER: ORDER, CANDIDATE_PREFIX: CANDIDATE_PREFIX,
      normalizeKnown: normalizeKnown, interlocutorFromTurn: interlocutorFromTurn,
      explicitMentionIdsFromText: explicitMentionIdsFromText,
      buildTurnCtxFromTurn: buildTurnCtxFromTurn,
      newTelemetry: newTelemetry, noteTelemetry: noteTelemetry,
      knownFromMemory: knownFromMemory, ctxFromCaller: ctxFromCaller,
      storyFlag: storyFlag, normSid: normSid, lastBlocks: function () { return _lastBlocks; }
    }
  };
  /* ★自動実行しない。生成側へ 1 本も繋がない。sys 登録なし。DOM 参照なし。 */
})();
