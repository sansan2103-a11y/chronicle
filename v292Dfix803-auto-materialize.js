/* =====================================================================
 * v292Dfix803-auto-materialize.js
 *   3C-3B Automatic Materialize（QA canary 限定・changed:true のみ・default OFF）
 * ---------------------------------------------------------------------
 * 正本: GPT_RULING_FIX802_WRITE0_PASS_AUTO_MATERIALIZE_GO_20260903.md
 *   （Write rule / changed contract / Durability / Final flush / QA 受入条件）。
 * 責務（これ以外を持たない）:
 *   fix802 の fire 完了点から one-line notify を受け取り
 *   → dry candidate（fix802 が 793.__test.materializeFrom で作った純関数の結果）と
 *     **現在の local CanonicalMemory（v292Dmem1_slot_<sid>）** を **同一 serialization domain** で比較
 *   → changed:false / local 不在（null）→ **write 0**
 *   → changed:true → **既存 __v292Dfix793.materialize(sid) を 1 回だけ**呼ぶ
 *   → 直後に local を再読して post hash を取り、**candidate hash と一致しなければ
 *     MATERIALIZE_CANDIDATE_DRIFT** を記録して **その story の automatic を session 内で停止**（retry 0）。
 * ★禁止（実装に無いことを fixture が機械確認する）:
 *   独自の materializeFrom 呼出で書く / v292Dmem1_slot_* への直接書込 / localStorage 書込 /
 *   fix793 flag（v292Dfix793On/Off/Story）の上書き / timer（setTimeout/setInterval）/ retry /
 *   save の起動 / fetch / server rev 前進 / PENDING_REF→ACTIVE 昇格 / knownTo 拡張 /
 *   fix77・fix190・fix796 の変更 / 新 authority。
 * flags（READ のみ）: v292Dfix803On==='1'（既定 OFF）／v292Dfix803Off==='1'（kill・★final flush 用）／
 *   v292Dfix803Story（既定 'smtg00ynsv1'・fix793 / fix802 と同じ canary 概念）。
 *   OFF / kill / 非対象 story は **即 return（副作用 0）**。
 * serialization domain（監査 C）:
 *   norm / candCanon は fix802 の同名関数と **byte 同型**（records は memoryId 昇順・edges は
 *   relationId 昇順・時刻系 field は DROP）。**candidate 側と local 側の両方をこの 1 関数**に通すので
 *   「前回 fire の candidate hash」ではなく「現在の local 現物」との比較が authority になる。
 *   fix802 が渡してくる candHash16 は telemetry（domain 一致の相互検証）としてだけ使う。
 * ===================================================================== */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.__v292Dfix803) return;                 /* 二重install防止 */

  var BUILD = '20260903-fix803';
  var CANARY_DEFAULT = 'smtg00ynsv1';
  var KEY_PREFIX = 'v292Dmem1_slot_';               /* ★READ のみ。書込は fix793.materialize() 経由だけ */
  var DRIFT = 'MATERIALIZE_CANDIDATE_DRIFT';
  var ERR_MAX = 50;

  function ls(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function optedIn() { return ls('v292Dfix803On') === '1'; }
  function off() { return ls('v292Dfix803Off') === '1'; }
  function active() { return optedIn() && !off(); }
  function story() { var s = ls('v292Dfix803Story'); return (s && String(s)) || CANARY_DEFAULT; }
  function nowMs() { try { return performance.now(); } catch (e) { return Date.now(); } }

  /* ---------------- state（story ごと・in-memory・永続化しない） ---------------- */
  var halted = {};            /* sid -> reason（session 内停止・retry 0） */
  var materializedFor = {};   /* sid -> turnCount（1 successful turn につき materialize <=1） */
  var T = { fires: 0, changed: 0, unchanged: 0, nullSkips: 0, materialized: 0, driftStops: 0,
            matFailed: 0, skipped: 0, skipReasons: {}, domainMismatch: 0, lastRun: null, errors: [] };
  function skip(reason) { T.skipped++; T.skipReasons[reason] = (T.skipReasons[reason] || 0) + 1; return 'skipped:' + reason; }
  function err(sid, tc, stage, e) {
    T.errors.push({ at: Date.now(), storyId: sid, turnCount: tc, stage: stage,
                    message: String((e && e.message) || e || '').slice(0, 200) });
    if (T.errors.length > ERR_MAX) T.errors.shift();
  }

  /* ---------------- serialization domain（fix802 candCanon と同型・両側に同じ関数を通す） ---------------- */
  var DROP = /^(createdAt|updatedAt|materializedAt|generatedAt|at|ts|time|byteLen|lastRun|firstSeenAt|lastSeenAt)$/;
  function norm(v) {
    if (v === null || v === undefined) return v;
    if (Object.prototype.toString.call(v) === '[object Array]') return v.map(norm);
    if (typeof v === 'object') {
      var o = {}, ks = Object.keys(v).filter(function (k) { return !DROP.test(k); }).sort();
      ks.forEach(function (k) { o[k] = norm(v[k]); });
      return o;
    }
    return v;
  }
  function cmpBy(k) { return function (a, b) { return String(a[k]).localeCompare(String(b[k])); }; }
  function candCanon(v) {
    var recs = ((v && v.records) || []).slice().sort(cmpBy('memoryId')).map(norm);
    var eds = ((v && v.edges) || []).slice().sort(cmpBy('relationId')).map(norm);
    return JSON.stringify([recs, eds]);
  }
  function sha256hex16(s) {
    var sub = null;
    try { sub = window.crypto && window.crypto.subtle; } catch (e) { sub = null; }
    if (!sub || typeof sub.digest !== 'function') return Promise.reject(new Error('crypto.subtle unavailable'));
    return sub.digest('SHA-256', new TextEncoder().encode(String(s))).then(function (b) {
      return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); })
        .join('').slice(0, 16);
    });
  }
  function shapeOk(v) {
    return !!v && typeof v === 'object' && Object.prototype.toString.call(v) !== '[object Array]'
        && Object.prototype.toString.call(v.records) === '[object Array]'
        && Object.prototype.toString.call(v.edges) === '[object Array]';
  }

  /* ---------------- local CanonicalMemory の現物 READ（write は一切しない） ---------------- */
  function keyOf(sid) {
    var m = null; try { m = window.__v292Dfix793; } catch (e) { m = null; }
    return (m && typeof m.keyFor === 'function') ? m.keyFor(sid) : (KEY_PREFIX + String(sid));
  }
  /* 戻り: { present:bool, value:obj|null, reason:string|null } — 不在 / 壊れは値を作らない（fail-closed） */
  function readLocal(sid) {
    var raw;
    try { raw = window.localStorage.getItem(keyOf(sid)); }
    catch (e) { return { present: false, value: null, reason: 'storage-throw' }; }
    if (raw === null || raw === undefined) return { present: false, value: null, reason: 'absent' };
    var v = null;
    try { v = JSON.parse(raw); } catch (e) { return { present: false, value: null, reason: 'parse-error' }; }
    if (!shapeOk(v)) return { present: false, value: null, reason: 'bad-shape' };
    return { present: true, value: v, reason: null };
  }
  function hashLocal(sid) {
    var r = readLocal(sid);
    if (!r.present) return Promise.resolve({ hash: null, reason: r.reason });
    return sha256hex16(candCanon(r.value)).then(function (h) { return { hash: h, reason: null }; });
  }

  /* ---------------- 本体（notify 1 本・timer 0・retry 0） ---------------- */
  function finish(sid, tc, o, result, t0) {
    T.lastRun = { storyId: sid, turnCount: tc, candHash16: o.candHash16 || null, curHash16: (o.curHash16 === undefined ? null : o.curHash16),
                  postHash16: (o.postHash16 === undefined ? null : o.postHash16), fix802Hash16: o.fix802Hash16 || null,
                  domainMatch: (o.domainMatch === undefined ? null : o.domainMatch), rev: (o.rev === undefined ? null : o.rev),
                  materializeOk: (o.materializeOk === undefined ? null : o.materializeOk),
                  materializeReason: o.materializeReason || null, localReason: o.localReason || null,
                  result: result, ms: nowMs() - t0, at: Date.now() };
    return result;
  }

  function onFire(a) {
    if (!active()) return Promise.resolve('off');
    a = a || {};
    var sid = (a.storyId != null) ? String(a.storyId) : ((a.sid != null) ? String(a.sid) : '');
    if (sid !== story()) return Promise.resolve(skip('other-story'));
    if (halted[sid]) return Promise.resolve(skip('halted'));
    var tc = a.turnCount;
    if (typeof tc !== 'number' || !isFinite(tc)) return Promise.resolve(skip('turnCount-null'));
    if (materializedFor[sid] === tc) return Promise.resolve(skip('same-turnCount'));
    var cand = a.cand;
    if (!shapeOk(cand)) return Promise.resolve(skip('bad-candidate'));
    var m793 = null; try { m793 = window.__v292Dfix793; } catch (e) { m793 = null; }
    if (!m793 || typeof m793.materialize !== 'function') return Promise.resolve(skip('no-fix793'));

    var t0 = nowMs(), o = { fix802Hash16: (a.candHash16 == null) ? null : String(a.candHash16).slice(0, 16), rev: (typeof a.rev === 'number') ? a.rev : null };
    T.fires++;
    /* ★candidate と local を **同じ candCanon** に通す（GPT changed contract の authority） */
    return sha256hex16(candCanon(cand)).then(function (ch) {
      o.candHash16 = ch;
      o.domainMatch = (o.fix802Hash16 == null) ? null : (o.fix802Hash16 === ch);
      if (o.domainMatch === false) { T.domainMismatch++; err(sid, tc, 'domain', new Error('fix802 candHash16 != fix803 candHash16')); }
      return hashLocal(sid);
    }).then(function (cur) {
      o.curHash16 = cur.hash; o.localReason = cur.reason;
      /* ★local 不在 / 壊れ（null）→ write 0（初回でも書かない・GPT 明示） */
      if (cur.hash === null) { T.nullSkips++; return finish(sid, tc, o, 'null-skip:' + (cur.reason || 'absent'), t0); }
      /* ★changed:false → write 0 */
      if (cur.hash === o.candHash16) { T.unchanged++; return finish(sid, tc, o, 'unchanged', t0); }
      /* ★changed:true → 既存 fix793.materialize() のみ（新 write path 0・1 turn 1 回・retry 0） */
      T.changed++;
      materializedFor[sid] = tc;
      return Promise.resolve(m793.materialize(sid)).then(function (r) {
        o.materializeOk = !!(r && r.ok);
        o.materializeReason = (r && r.reason) ? String(r.reason) : null;
        if (!o.materializeOk) { T.matFailed++; return finish(sid, tc, o, 'materialize-failed:' + (o.materializeReason || 'unknown'), t0); }
        /* ★write authority の最低条件: dry candidate hash == materialize 後 local hash */
        return hashLocal(sid).then(function (post) {
          o.postHash16 = post.hash;
          if (post.hash !== o.candHash16) {
            T.driftStops++;
            halted[sid] = DRIFT;
            err(sid, tc, 'drift', new Error(DRIFT + ' cand=' + o.candHash16 + ' post=' + String(post.hash)));
            return finish(sid, tc, o, DRIFT, t0);
          }
          T.materialized++;
          return finish(sid, tc, o, 'materialized', t0);
        });
      });
    }).catch(function (e) {
      err(sid, tc, 'onFire', e);
      return finish(sid, tc, o, 'error', t0);   /* ★retry 0・次の fire で自然に再評価 */
    });
  }

  function status() {
    return { build: BUILD, on: optedIn(), off: off(), active: active(), story: story(),
             halted: JSON.parse(JSON.stringify(halted)),
             fires: T.fires, changed: T.changed, unchanged: T.unchanged, nullSkips: T.nullSkips,
             materialized: T.materialized, driftStops: T.driftStops, matFailed: T.matFailed,
             skipped: T.skipped, skipReasons: JSON.parse(JSON.stringify(T.skipReasons)),
             domainMismatch: T.domainMismatch, materializedFor: JSON.parse(JSON.stringify(materializedFor)),
             lastRun: T.lastRun, errors: T.errors.slice() };
  }
  function reset() {
    halted = {}; materializedFor = {};
    T = { fires: 0, changed: 0, unchanged: 0, nullSkips: 0, materialized: 0, driftStops: 0,
          matFailed: 0, skipped: 0, skipReasons: {}, domainMismatch: 0, lastRun: null, errors: [] };
  }

  window.__v292Dfix803 = {
    BUILD: BUILD, ENABLED_BY_DEFAULT: false, CANARY_DEFAULT: CANARY_DEFAULT, DRIFT: DRIFT,
    onFire: onFire, status: status,
    __test: { norm: norm, candCanon: candCanon, sha256hex16: sha256hex16, shapeOk: shapeOk,
              keyOf: keyOf, readLocal: readLocal, hashLocal: hashLocal, reset: reset,
              haltedOf: function (sid) { return halted[sid] || null; }, KEY_PREFIX: KEY_PREFIX }
  };
  /* ★自動実行しない。timer 0。fix802 の notify が来るまで何もしない。 */
})();
