/* v292Dfix742 — R118 Phase3-A: EXISTING_PHYSICAL_SIGNAL_BRIDGE
 * fix333 の既存 physical signal (freeHands) を fix414 の既存 constraint text へ橋渡しする。
 * 新規 constraint text 0 本 / 新規 detector 0 本 / 新規 state authority 0。
 * RULING118-P3-REFRAME 準拠:
 *   - freeHands === 0 → 既存 constraint「腕使用不可」(rank 1) のみ
 *   - restrained === true 単独では emit 禁止
 *   - suspended は production evidence 0 のため HOLD（未実装）
 *   - posture detector 強化なし / gravity engine なし
 * kill switch : localStorage v292Dfix742Off = '1'
 * feature flag: localStorage v292Dfix414PhysP = '1'（既定 OFF）
 */
(function () {
  'use strict';

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  if (lsGet('v292Dfix742Off') === '1') return;   // kill switch
  if (window.__v292Dfix742) return;              // 二重install防止

  var RANK_PART = 1;               // 既存 rank: {part}使用不可
  var TEXT_ARM  = '腕使用不可';     // 既存 template {part}使用不可 の part='腕' 実体化
  var ARM_TEXT_RE = /(腕|手首|手|拳|肘|肩)/;
  var DISABLE_TEXT_RE = /使用不可/;

  var last = null;

  /* cons 内に既存の腕系 使用不可 constraint があるか（branch A 等が先に出している場合） */
  function armAlreadyConstrained(cons) {
    if (!cons || typeof cons.length !== 'number') return false;
    for (var i = 0; i < cons.length; i++) {
      var c = cons[i];
      if (!c) continue;
      var tx = '';
      try { tx = String(c.text == null ? '' : c.text); } catch (e) { continue; }
      if (!tx) continue;
      if (DISABLE_TEXT_RE.test(tx) && ARM_TEXT_RE.test(tx)) return true;
    }
    return false;
  }

  /* fix333 から当該 name の physical state を取る。取れなければ null（fail-open） */
  function signalFor(name) {
    var api = window.__v292Dfix333api;
    if (!api || typeof api.compileActorStates !== 'function') return null;
    var states = null;
    try { states = api.compileActorStates(); } catch (e) { return null; }
    if (!states || typeof states !== 'object') return null;
    var key;
    try { key = String(name == null ? '' : name); } catch (e) { return null; }
    if (!key) return null;
    var st = null;
    try { st = states[key]; } catch (e) { return null; }
    if (!st || typeof st !== 'object') return null;
    return st;
  }

  /* 判定のみ（副作用なし・test 用に公開） */
  function decide(st, cons) {
    if (!st) return { emit: false, why: 'no-state' };
    var fh = st.freeHands;
    if (typeof fh !== 'number') return { emit: false, why: 'freeHands-not-number' };
    if (fh !== 0) return { emit: false, why: 'freeHands-nonzero' };   // restrained単独/片手 は emit しない
    if (armAlreadyConstrained(cons)) return { emit: false, why: 'already-constrained' };
    return { emit: true, why: 'freeHands-zero', rank: RANK_PART, text: TEXT_ARM };
  }

  /* fix414 hook 本体 */
  window.__v292Dfix414P = function (name, cons, add) {
    if (lsGet('v292Dfix414PhysP') !== '1') return;      // 既定 OFF
    if (typeof add !== 'function') return;
    var st = null, d = null;
    try {
      st = signalFor(name);
      d = decide(st, cons);
    } catch (e) {
      last = { name: null, emit: false, why: 'error', err: String((e && e.message) || e) };
      return;                                           // fail-open
    }
    last = {
      name: (function () { try { return String(name == null ? '' : name); } catch (e2) { return ''; } })(),
      emit: !!d.emit,
      why: d.why,
      freeHands: (st && typeof st.freeHands === 'number') ? st.freeHands : null,
      restrained: !!(st && st.restrained),
      suspended: !!(st && st.suspended)
    };
    if (!d.emit) return;
    try { add(d.rank, d.text); } catch (e3) { /* fail-open */ }
  };

  window.__v292Dfix742 = {
    version: 'v1',
    decide: decide,
    armAlreadyConstrained: armAlreadyConstrained,
    status: function () {
      return {
        installed: true,
        flag: lsGet('v292Dfix414PhysP') === '1',
        off: lsGet('v292Dfix742Off') === '1',
        fix333: !!(window.__v292Dfix333api && window.__v292Dfix333api.compileActorStates),
        hooked: typeof window.__v292Dfix414P === 'function',
        last: last
      };
    }
  };

  try { console.log('[v292Dfix742:physical-bridge] loaded (flag=' + (lsGet('v292Dfix414PhysP') === '1' ? 1 : 0) + ')'); } catch (e) {}
})();
