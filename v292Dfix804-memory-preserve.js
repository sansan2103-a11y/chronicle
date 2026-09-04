/* v292Dfix804 — MEMORY_V1 CANONICAL PRESERVATION（F1-preserve / 案 P1）
 * =====================================================================
 * GPT 裁定 (F) MEMORY_V1_OPTIN_ONE_WAY / F1-preserve DESIGN GO:
 *   「authoring gate ≠ preservation gate」。
 *   fix793 の ON/OFF は **memoryV1 を新しく materialize / replace してよいか** の
 *   authority gate としてそのまま維持する。
 *   だが story が既に memoryV1 を持っている（local key に有効な値がある）なら、
 *   canonical projection / hash / save-preservation では 793 ON/OFF に関係なく
 *   **常に memoryV1 を存在させる**。
 *
 * 何を直すのか（事象）:
 *   fix743.buildSchema2Record L158-172 は optional sidecar memoryV1 を
 *   `window.__v292Dfix793.saveGate(storyId)` の include だけで決める。
 *   793 OFF / 非 canary story では `OPTIONAL_ABSENT:*` になり key を生やさない。
 *   → projectionV2（fix697 contentHashV2）から memoryV1 が消える
 *   → local hash ≠ server hash（server は Worker v40 の optional preserve で
 *      memoryV1 を保持し続ける）→ fix705/fix781 が DIVERGED / UNRESOLVED_GUARD_STATE
 *   → reload で「クラウドと差分があります」2 択。内容乖離は 0 なのに、である。
 *   同じ理由で fix705 の schema2 hydrate は post-apply-v2 hash が収束せず
 *   APPLY_NOT_CONVERGED で止まる（= 新端末で server memoryV1 を引けない）。
 *
 * 設計（narrow・GPT 契約どおり）:
 *   ・新 schema なし / Worker 変更なし / Memory 内容変更なし。
 *   ・新しい materialize authority を作らない。**書込を 1 バイトも行わない**
 *     （localStorage write 0 / IndexedDB 0 / 通信 0 / timer 0 / listener 0）。
 *   ・fix743 / fix793 / fix697 / fix705 / fix781 の**本体を改変しない**。
 *     fix793 の saveGate だけを wrap する（fix793 load 後・fix743 load 前）。
 *   ・preserve するのは「元 gate が **authoring authority が無い** と言ったとき」だけ:
 *       MEMORY_CANARY_DISABLED（793 OFF・未 opt-in・kill）
 *       NOT_CANARY_STORY  （canary 対象外 story）
 *     `loaded-absent`（= 793 ON でこの story に memory が無いと確定している／
 *     明示 clear 直後）は **preserve しない**。ここを preserve すると
 *     clearExplicit で消した memory を次の save で蘇らせてしまう。
 *   ・`hold` はそのまま素通し（fail-closed を 1 ミリも弱めない）。
 *   ・`include:true`（既に載る）はそのまま素通し（値を差し替えない）。
 *   ・local key に値が無い / 壊れている / MAX_BYTES 超過 → preserve しない
 *     （UNLOADED から null を作らない・従来どおり key を生やさない）。
 *   ・fix745 GWS barrier が開いていない間は preserve しない
 *     （= 従来挙動へフォールバック。新しい write を作らないので fail-closed のまま）。
 *   ・clearGate は wrap しない（明示 clear は 793 ON の権能のまま）。
 *
 * kill switch : localStorage v292Dfix804Off = '1' → 完全に従来挙動へ戻る。
 * 既定        : **ON**（preservation を既定 OFF にすると意味が無い。GPT gate 論点）。
 * telemetry   : window.__v292Dfix804.status() … read-only。memory-only ring。
 */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.__v292Dfix804) return;                 /* 二重install防止 */

  var BUILD = '20260904-fix804';
  var KEY_PREFIX = 'v292Dmem1_slot_';               /* fix793 と同じ story-scoped key */
  var MAX_BYTES = 262144;                           /* Worker v40 cap と同じ */
  var FLAG_OFF = 'v292Dfix804Off';

  /* 元 gate の include:false のうち「authoring authority が無いだけ」の理由。
     ここに載っていない理由（loaded-absent 等）は絶対に preserve しない。 */
  var PRESERVABLE = { 'MEMORY_CANARY_DISABLED': 1, 'NOT_CANARY_STORY': 1 };

  var RING_MAX = 20;
  var _ring = [], _applied = 0, _skipped = 0, _wrapped = false, _lastReason = null;

  function lsg(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function killed() { return lsg(FLAG_OFF) === '1'; }
  function keyFor(sid) { return KEY_PREFIX + String(sid); }

  function validShape(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v)
        && Object.prototype.toString.call(v.records) === '[object Array]'
        && Object.prototype.toString.call(v.edges) === '[object Array]';
  }
  /* fix793.byteLen と同一の測り方（stableStringify ではなく JSON.stringify の byte 長）。 */
  function byteLen(v) {
    var s; try { s = JSON.stringify(v); } catch (e) { return Infinity; }
    if (typeof TextEncoder === 'function') { try { return new TextEncoder().encode(s).length; } catch (e) {} }
    return s.length;
  }

  /* ★fix793.armed() の鏡像（fix793 の status() は barrierStateNow() を読むのでここでは使えない）。
     793 が armed でない = この client は memory key を **書きようがない**（materialize は
     armed ∧ canary でしか動かない）ので、boot recovery barrier は preserve の判断に無関係。
     armed のときだけ barrier を読む。これで fix798 の
       ㉗「793 OFF / kill + PENDING → barrier() を 1 度も読まない」
       ㉘「非 canary story → barrier() を読まない（他 story 挙動 0）」
     を 1 つも壊さない。 */
  function armedMirror() { return lsg('v292Dfix793On') === '1' && lsg('v292Dfix793Off') !== '1'; }

  /* barrier は fix793 と同じ判定を **読むだけ**（fix745 GWS）。open でなければ preserve しない。 */
  function barrierOpen() {
    var g; try { g = window.__v292DfixGWS; } catch (e) { return false; }
    if (!g || typeof g.barrier !== 'function') return false;
    var s; try { s = g.barrier(); } catch (e) { return false; }
    return s === 'NOT_REQUIRED' || s === 'RESOLVED';
  }

  function note(sid, reason) {
    _lastReason = reason;
    _ring.push({ storyId: String(sid || ''), reason: reason, n: _applied + _skipped });
    if (_ring.length > RING_MAX) _ring.shift();
  }

  /* local key から「既に存在する memoryV1」を読む（read-only・書込 0）。 */
  function existingMemory(sid) {
    var raw = lsg(keyFor(sid));
    if (raw === null || raw === undefined) return { ok: false, reason: 'NO_LOCAL_MEMORY' };
    var v; try { v = JSON.parse(raw); } catch (e) { return { ok: false, reason: 'PARSE_ERROR' }; }
    if (!validShape(v)) return { ok: false, reason: 'BAD_SHAPE' };
    var b = byteLen(v);
    if (b > MAX_BYTES) return { ok: false, reason: 'TOO_LARGE' };
    return { ok: true, value: v, bytes: b };
  }

  /* ---- saveGate wrapper 本体 ---- */
  function makeWrapper(M, orig) {
    return function preserveSaveGate(storyId) {
      var g = orig.call(M, storyId);
      if (killed()) return g;
      if (!g) return g;                                   /* 元が何も返さない = 触らない */
      if (g.hold) return g;                               /* ★fail-closed 素通し */
      if (g.include) return g;                            /* 既に載る = authoring 経路。触らない */
      var sid = String(storyId || '');
      if (!sid) return g;
      if (!PRESERVABLE[g.reason]) { _skipped++; note(sid, 'NOT_PRESERVABLE_REASON:' + (g.reason || '?')); return g; }
      /* ★先に「既存 memory があるか」だけを見る。無ければ barrier も読まずに従来どおり返す
         （memory を持たない story では GWS へ 1 回も触らない = fix798 ㉘ の不変条件）。 */
      var e = existingMemory(sid);
      if (!e.ok)                   { _skipped++; note(sid, e.reason); return g; }
      if (armedMirror() && !barrierOpen()) { _skipped++; note(sid, 'BARRIER_NOT_OPEN'); return g; }
      _applied++; note(sid, 'PRESERVE_EXISTING');
      /* 元 gate の情報は捨てずに残す（telemetry / 後段の判定材料） */
      return { include: true, value: e.value, bytes: e.bytes,
               reason: 'PRESERVE_EXISTING', preserved: true, authoringReason: g.reason };
    };
  }

  function install() {
    if (_wrapped) return true;
    var M = null; try { M = window.__v292Dfix793 || null; } catch (e) { M = null; }
    if (!M || typeof M.saveGate !== 'function') return false;
    if (M.__v292Dfix804Wrapped) { _wrapped = true; return true; }
    var orig = M.saveGate;
    M.saveGate = makeWrapper(M, orig);
    M.__v292Dfix804Wrapped = true;
    M.__v292Dfix804OrigSaveGate = orig;                   /* rollback / 検証用（read-only） */
    _wrapped = true;
    return true;
  }

  /* fix793 は index.html で必ず fix804 より前に load される。
     万一居なければ install は失敗するので、status() から遅延 install も試せるようにする
     （timer / listener は作らない）。 */
  var _installedAtLoad = install();

  window.__v292Dfix804 = {
    __loaded: true, build_: BUILD, ENABLED_BY_DEFAULT: true, FLAG_OFF: FLAG_OFF,
    installed: function () { return _wrapped; },
    install: install,                                     /* 冪等・read-only（wrap のみ） */
    status: function () {
      var sid = null;
      try { var M = window.__v292Dfix793; if (M && typeof M.canaryStory === 'function') sid = M.canaryStory(); } catch (e) {}
      return { build: BUILD, installed: _wrapped, installedAtLoad: _installedAtLoad,
               off: killed(), defaultOn: true,
               preserve: { applied: _applied > 0, count: _applied, skipped: _skipped,
                           reason: _lastReason, sid: sid },
               barrier: armedMirror() ? (barrierOpen() ? 'OPEN' : 'NOT_OPEN') : 'NOT_CONSULTED_793_UNARMED',
               preservableReasons: Object.keys(PRESERVABLE),
               note: 'authoring gate(793) は不変 / 書込 0 / hold 素通し / '
                   + 'loaded-absent と明示 clear は preserve しない / local key に値があるときだけ' };
    },
    ring: function () { return _ring.slice(); },
    __test: { existingMemory: existingMemory, validShape: validShape, byteLen: byteLen,
              barrierOpen: barrierOpen, PRESERVABLE: PRESERVABLE, MAX_BYTES: MAX_BYTES,
              keyFor: keyFor, makeWrapper: makeWrapper }
  };
  /* ★自動実行しない。Planner / Retrieve / materialize へは 1 本も繋がない。 */
})();
