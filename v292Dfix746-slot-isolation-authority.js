// =====================================================================
// Chronicle v292Dfix746: SLOT ISOLATION AUTHORITY（C13 Proof B / GPT裁定）
// ---------------------------------------------------------------------
// 目的:
//   Cloud Canonical(C1) が active な間、**接尾辞なしの slot-isolated base key を
//   再生成し得る forward mutation を 0 にする**ための単一 authority。
//
//   fix246 の suffix() は legacy 生存性のため fail-open で、
//     ・__chr6Key() が throw / 不在 / non-function / '' や null を返す
//     ・chr6_active_slot が壊れた JSON
//   のいずれでも suffix()==='' へ落ち、通常の wrapper writer が **base key へ書ける**。
//   legacy ではそれでよいが、C1 では
//     「slot identity を確定できないなら base へ書く」ではなく
//     「slot identity を確定できないなら **書かない / ON にしない**」にする。
//
// 契約（裁定）:
//   ・**同期・read-only**。localStorage へ1バイトも書かない。
//   ・**persistent PASS / adopt marker を作らない**。毎回いまの値から判定する。
//   ・fix246 本体は変更しない。
//   ・Gate A: C1 enable 前（失敗 = SLOT_ISOLATION_PRE_ENABLE_HOLD / enable write 0）
//   ・Gate B: shared lock 取得**後**・mutation **直前**（失敗 = SLOT_ISOLATION_RUNTIME_HOLD /
//             forward write 0 / silent skip 禁止 / base fallback 禁止）
//   ・**RECOVERY MAY REPAIR / NEW MUTATION MAY NOT PROCEED**
//     既存 recovery（C1 / fix721 / fix587 の journal・pending）は
//     isolation FAIL だけを理由に止めない。止めるのは forward mutation のみ。
//
// 検証口: window.__v292DfixSlotIso
// OFF   : v292Dfix746Off='1'（★OFF にすると authority は "利用不可" を返す。
//          fail-open ではなく、呼び出し側が HOLD する材料になる）
// =====================================================================
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.__v292DfixSlotIso) return;

  var TAG = '[v292Dfix746:slot-isolation]';
  var BUILD = 'fix746.0';

  /* ---- native（fix246 の redirect wrapper を通さない read 専用アクセス） ---- */
  var natGet = null;
  try { natGet = Storage.prototype.getItem.bind(localStorage); } catch (e) { natGet = null; }
  function rawGet(k){ try { return natGet ? natGet(k) : null; } catch (e){ return null; } }
  /* wrapper 経由の read（redirect 先を観測するために使う。書き込みはしない） */
  function wrapGet(k){ try { return localStorage.getItem(k); } catch (e){ return null; } }

  function off(){ return rawGet('v292Dfix746Off') === '1'; }

  /* fix721.5 と同一集合（v292Dfix246 KEYS + 自己 suffix 系）。
     ここは authority の判定対象であって restore 分類ではないので、独立に持つ。 */
  var SLOT_ISOLATED_BASE = [
    'v292Dfix77States', 'chr6_v292Dfix104_dlg', 'chr6_v292Dfix135_sum',
    'chr6_v292Dfix135_last', 'chr6_v292Dfix136_wi', 'chr6_v292Dfix137_ev',
    'v292Dfix307Roster', 'v292Dfix307Last', 'v292Dfix277Quasi'
  ];
  /* fix246 が redirect 管理する 6 キー（destination 検証はこの部分集合で行う） */
  var FIX246_KEYS = [
    'v292Dfix77States', 'chr6_v292Dfix104_dlg', 'chr6_v292Dfix135_sum',
    'chr6_v292Dfix135_last', 'chr6_v292Dfix136_wi', 'chr6_v292Dfix137_ev'
  ];

  var C = {
    OK:                 'SLOT_ISOLATION_READY',
    AUTHORITY_OFF:      'SLOT_ISOLATION_AUTHORITY_OFF',
    NO_NATIVE:          'SLOT_ISOLATION_NO_NATIVE_ACCESS',
    DEFAULT_STORY:      'DEFAULT_STORY_UNSUPPORTED_IN_C1',
    KEY_FN_MISSING:     'SLOT_RESOLVER_MISSING',
    KEY_FN_NOT_FUNC:    'SLOT_RESOLVER_NOT_FUNCTION',
    KEY_FN_THREW:       'SLOT_RESOLVER_THREW',
    KEY_FN_EMPTY:       'SLOT_RESOLVER_EMPTY_OR_DEFAULT',
    KEY_FN_SHAPE:       'SLOT_RESOLVER_UNEXPECTED_SHAPE',
    KEY_FN_UNSTABLE:    'SLOT_RESOLVER_UNSTABLE',
    ACTIVE_UNPARSABLE:  'ACTIVE_SLOT_UNPARSABLE',
    ACTIVE_EMPTY:       'ACTIVE_SLOT_EMPTY_OR_DEFAULT',
    RESOLVER_CONFLICT:  'SLOT_RESOLVER_CONFLICT',
    EXPECTED_MISMATCH:  'EXPECTED_STORY_ID_MISMATCH',
    SUFFIX_EMPTY:       'SLOT_SUFFIX_EMPTY',
    ISO_OFF:            'SLOT_ISOLATION_DISABLED',
    ISO_NOT_ARMED:      'SLOT_ISOLATION_WRAPPER_NOT_ARMED',
    BASE_PRESENT:       'SLOT_ISOLATED_BASE_KEY_PRESENT',
    DEST_MISMATCH:      'REDIRECT_DESTINATION_MISMATCH'
  };
  function bad(code, extra){
    var o = { ok: false, code: code };
    if (extra) for (var k in extra){ if (Object.prototype.hasOwnProperty.call(extra, k)) o[k] = extra[k]; }
    return o;
  }

  /* =====================================================================
   * check(expectedStoryId?) — 同期・read-only。**毎回いまの値から判定**する。
   *   expectedStoryId を渡した場合は resolver の解決結果と一致することも要求する。
   *   戻り値: { ok:true, storyId, suffix, checks:{...} }
   *         | { ok:false, code, ... }
   * ===================================================================== */
  function check(expectedStoryId){
    if (off())    return bad(C.AUTHORITY_OFF);
    if (!natGet)  return bad(C.NO_NATIVE);

    var checks = {};

    /* --- (1)(2)(3) __chr6Key の存在と型 --- */
    var fn = null;
    try { fn = window.__chr6Key; } catch (e){ return bad(C.KEY_FN_THREW, { at: 'access', detail: String(e && e.message || e) }); }
    if (fn == null) return bad(C.KEY_FN_MISSING);
    if (typeof fn !== 'function') return bad(C.KEY_FN_NOT_FUNC, { typeofKey: typeof fn });
    checks.resolverPresent = true;

    /* --- (4) throw しないこと。★1回だけでなく2回呼んで安定性も見る --- */
    var k1, k2;
    try { k1 = fn(); } catch (e){ return bad(C.KEY_FN_THREW, { at: 'call1', detail: String(e && e.message || e) }); }
    try { k2 = fn(); } catch (e){ return bad(C.KEY_FN_THREW, { at: 'call2', detail: String(e && e.message || e) }); }
    if (k1 !== k2) return bad(C.KEY_FN_UNSTABLE, { first: String(k1), second: String(k2) });
    checks.resolverStable = true;

    /* --- (5)(6) 値の形。default 'chr6' は C1 対象外 --- */
    if (k1 == null || k1 === '') return bad(C.KEY_FN_EMPTY, { value: k1 === '' ? '""' : String(k1) });
    if (typeof k1 !== 'string')  return bad(C.KEY_FN_SHAPE, { typeofValue: typeof k1 });
    if (k1 === 'chr6')           return bad(C.DEFAULT_STORY, { value: k1 });
    var m = /^chr6_slot_([A-Za-z0-9]+)$/.exec(k1);
    if (!m) return bad(C.KEY_FN_SHAPE, { value: k1 });
    var idFromKeyFn = m[1];
    if (idFromKeyFn === 'default') return bad(C.DEFAULT_STORY, { value: k1 });
    checks.resolverNamedStory = true;

    /* --- (7)(8) chr6_active_slot（★fix246 と同じく native read で見る） --- */
    var rawActive = rawGet('chr6_active_slot');
    var active;
    try { active = JSON.parse(rawActive || 'null'); }
    catch (e){ return bad(C.ACTIVE_UNPARSABLE, { raw: String(rawActive).slice(0, 40) }); }
    if (active == null || active === '' || active === 'default')
      return bad(C.ACTIVE_EMPTY, { value: active === '' ? '""' : String(active) });
    if (typeof active !== 'string' || !/^[A-Za-z0-9]+$/.test(active))
      return bad(C.ACTIVE_UNPARSABLE, { value: String(active).slice(0, 40) });
    checks.activeSlotParsed = true;

    /* --- (9) resolver 間の矛盾 0 --- */
    if (active !== idFromKeyFn)
      return bad(C.RESOLVER_CONFLICT, { chr6Key: idFromKeyFn, activeSlot: active });
    checks.resolverAgreement = true;

    /* --- 呼び出し側の期待 story と一致するか --- */
    if (expectedStoryId != null && String(expectedStoryId) !== idFromKeyFn)
      return bad(C.EXPECTED_MISMATCH, { expected: String(expectedStoryId), actual: idFromKeyFn });

    /* --- (10) suffix が '' でない（fix246 と同一の導出） --- */
    var sfx = k1.replace(/^chr6/, '');            /* 'chr6_slot_a' → '_slot_a' */
    if (!sfx || sfx === '') return bad(C.SUFFIX_EMPTY, { chr6Key: k1 });
    if (sfx !== '_slot_' + idFromKeyFn) return bad(C.KEY_FN_SHAPE, { suffix: sfx });
    checks.suffix = sfx;

    /* --- (11)(12) isolation が有効で、wrapper が実際に武装しているか --- */
    if (rawGet('v292StoreSlotIsoOff') === '1') return bad(C.ISO_OFF, { flag: 'v292StoreSlotIsoOff' });
    var armed = false;
    try { armed = (window.__v292Dfix246 === 1); } catch (e){ armed = false; }
    if (!armed) return bad(C.ISO_NOT_ARMED, { marker: false });
    /* instance 側に wrapper が乗っていること（iOS 等で代入が no-op になる事故を検出）。
       ★fix654 が Storage.prototype を accessor 化しているため own property は作られない。
         `Storage.prototype.getItem` は this===SP で protoImpl(真のnative)を返し、
         `localStorage.getItem` は instance 用 WeakMap の wrapper を返す。
         したがって **参照が異なること**が「instance に wrapper が乗っている」正しい判定。 */
    var instanceWrapped = false;
    try {
      instanceWrapped = (localStorage.getItem !== Storage.prototype.getItem)
                     && (localStorage.setItem !== Storage.prototype.setItem)
                     && (localStorage.removeItem !== Storage.prototype.removeItem);
    } catch (e){ instanceWrapped = false; }
    if (!instanceWrapped) return bad(C.ISO_NOT_ARMED, { instanceWrapped: false });
    checks.isolationArmed = true;

    /* --- (13) 9 個の base key がすべて不存在（★native read で見る） --- */
    var present = [];
    for (var i = 0; i < SLOT_ISOLATED_BASE.length; i++)
      if (rawGet(SLOT_ISOLATED_BASE[i]) != null) present.push(SLOT_ISOLATED_BASE[i]);
    if (present.length) return bad(C.BASE_PRESENT, { keys: present });
    checks.baseKeysAbsent = SLOT_ISOLATED_BASE.length;

    /* --- (14) redirect destination が期待どおりか（read-only 観測） ---
       wrapper 経由の getItem(base) が native の get(base + suffix) と一致すること。
       両方 null のケースは判定材料にならないので、非空比較が何件成立したかも返す。 */
    var probes = 0, nonVacuous = 0;
    for (var j = 0; j < FIX246_KEYS.length; j++){
      var b = FIX246_KEYS[j];
      var viaWrapper = wrapGet(b);
      var viaNativeDest = rawGet(b + sfx);
      probes++;
      if (viaWrapper !== viaNativeDest)
        return bad(C.DEST_MISMATCH, { key: b, expectedDest: b + sfx });
      if (viaNativeDest != null) nonVacuous++;
    }
    checks.destinationProbes = probes;
    checks.destinationProbesNonVacuous = nonVacuous;

    return { ok: true, code: C.OK, storyId: idFromKeyFn, suffix: sfx, checks: checks };
  }

  /* Gate A: C1 enable 前。失敗コードを PRE_ENABLE_HOLD で包む（enable write 0 の材料）。 */
  function checkPreEnable(expectedStoryId){
    var r = check(expectedStoryId);
    if (r.ok) return r;
    return { ok: false, gate: 'PRE_ENABLE', hold: 'SLOT_ISOLATION_PRE_ENABLE_HOLD',
             code: r.code, detail: r, wrote: 0 };
  }
  /* Gate B: shared lock 取得後・mutation 直前。失敗は RUNTIME_HOLD（forward write 0）。 */
  function checkRuntime(expectedStoryId){
    var r = check(expectedStoryId);
    if (r.ok) return r;
    return { ok: false, gate: 'RUNTIME', hold: 'SLOT_ISOLATION_RUNTIME_HOLD',
             code: r.code, detail: r, wrote: 0 };
  }
  /* 便宜: boolean。ただし呼び出し側は必ず code を記録すること（silent skip 禁止）。 */
  function ready(expectedStoryId){ return check(expectedStoryId).ok === true; }

  window.__v292DfixSlotIso = {
    BUILD: BUILD,
    CODES: C,
    SLOT_ISOLATED_BASE: SLOT_ISOLATED_BASE.slice(),
    check: check,
    checkPreEnable: checkPreEnable,
    checkRuntime: checkRuntime,
    ready: ready,
    isOff: off,
    /* 診断のみ（read-only）。persistent marker は一切持たない。 */
    status: function (expectedStoryId){
      var r = check(expectedStoryId);
      return { build: BUILD, off: off(), ok: r.ok, code: r.code,
               storyId: r.storyId || null, suffix: r.suffix || null };
    }
  };
  try { console.log(TAG, 'authority armed (read-only, no persistent marker)'); } catch (e){}
})();
