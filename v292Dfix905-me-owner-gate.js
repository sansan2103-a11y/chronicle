/* =====================================================================
 * v292Dfix905 — Memory Engine Owner gate（client）
 *   GPT 裁定 MEMORY_ENGINE_OWNER_ON ME-2（2026-09-28）:
 *     production ME active = server 由来 entitlement owner
 *                             AND account_feature.memoryEngine（/auth/me features.memoryEngine === true）
 *                             AND v292DmeOff != '1'
 *     gate が true なら端末ごとの On flag（v292Dfix670On 等）は不要。
 *     production host では local flag だけでは ME を ON にできない。
 *     QA host（production 以外）では明示 On flag を fixture 用 override として許す。
 *   書くもの: なし（localStorage / sessionStorage / IDB へ一切書かない。gate は in-memory）。
 *   読むもの: window.__v292Dfix893.serverMe() / features()（この page の /auth/me 応答だけ。mark は読まない）。
 *   /auth/me 未応答・失敗・401・非 owner・features 無し → false（fail-closed）。
 *   kill: v292Dfix905Off='1' → production host では ME OFF。QA host では従来の On flag 判定。
 *   ★fix905b（GPT ME-3）: production host では gate 不在・script error・kill のどれでも OFF（fail-closed）。
 * ===================================================================== */
(function () {
  'use strict';
  if (window.__chrMeGate) return;
  var PROD_HOSTS = { 'chronicle-app.pages.dev': 1 };
  var fired = false, lastEval = null, evals = 0;
  function lsg(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function killed() { return lsg('v292Dfix905Off') === '1'; }
  function meOff() { return lsg('v292DmeOff') === '1'; }
  function prodHost() { try { return !!PROD_HOSTS[String(location.hostname)]; } catch (e) { return true; } }
  function serverGate() {
    try {
      var A = window.__v292Dfix893;
      if (!A || typeof A.serverMe !== 'function' || typeof A.features !== 'function') return { on: false, why: 'no-account-api' };
      var me = A.serverMe(), f = A.features();
      if (!me) return { on: false, why: 'no-server-me' };
      if (me.entitlement !== 'owner') return { on: false, why: 'not-owner' };
      if (me.status && me.status !== 'active') return { on: false, why: 'not-active' };
      if (!f || f.memoryEngine !== true) return { on: false, why: 'feature-off' };
      return { on: true, why: 'owner-feature' };
    } catch (e) { return { on: false, why: 'threw' }; }
  }
  function gateOn() { if (meOff()) return false; return serverGate().on; }
  function allow(localOn) {
    evals++;
    if (killed()) { var kv = prodHost() ? false : !!localOn; lastEval = 'killed:' + kv; return kv; }   /* ★fix905b: production host では kill = ME OFF（ac10 の flag 挙動へは戻さない） */
    if (gateOn()) { lastEval = 'gate'; return true; }
    if (localOn && !prodHost()) { lastEval = 'qa-override'; return true; }
    lastEval = prodHost() ? 'prod-closed' : 'off';
    return false;
  }
  function onAccount() {
    try { if (!fired && !killed() && gateOn()) { fired = true; window.dispatchEvent(new Event('chr:me-gate-on')); } } catch (e) {}
  }
  window.addEventListener('chr:account-me', onAccount);
  window.__chrMeGate = {
    build: '20260928-fix905b', allow: allow, gateOn: gateOn,
    status: function () { var g = serverGate(); return { killed: killed(), meOff: meOff(), prodHost: prodHost(), server: g, gateOn: gateOn(), fired: fired, lastEval: lastEval, evals: evals }; }
  };
  onAccount();
})();
