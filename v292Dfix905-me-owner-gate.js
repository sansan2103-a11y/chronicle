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
  /* ★fix905c（GPT: AUTH_TRANSITION 契約）: ME が有効な production client は、次の user story action を始める前に
     server authorization（/auth/me）を再確認し、確認が終わるまで retrieve / generation を始めない。
     確認が owner + active + features.memoryEngine=true 以外・timeout・通信失敗なら、その action では ME だけ OFF（本編は通常どおり）。
     deny は次に確認が成功するまで続く。401 / 403（fix893）では fix893 が cached gate を即失効させる。
     kill: localStorage v292Dfix905cOff='1'（再確認をしない = fix905b の挙動）。v292Dfix905Off は production で ME OFF のまま。 */
  var deny = false, recheck = { waits: 0, ok: 0, denied: 0, timeouts: 0, errors: 0, skipped: 0, busy: 0, last: null };
  function c905Off() { return lsg('v292Dfix905cOff') === '1'; }
  function gateOn() { if (meOff()) return false; if (deny && !c905Off()) return false; return serverGate().on; }
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
  /* story action 入口の再確認（production host・gate が ON か deny 中のときだけ。OFF のときは network 0） */
  var RECHECK_MS = 5000, rcBusy = false;
  function needRecheck() { try { if (c905Off() || killed() || !prodHost() || meOff()) return false; return deny || serverGate().on; } catch (e) { return false; } }
  function recheckThen(cont) {
    var A = null; try { A = window.__v292Dfix893; } catch (e) { A = null; }
    if (!A || typeof A.refreshMe !== 'function') { deny = true; recheck.errors++; recheck.last = 'no-account-api'; return cont(); }
    var done = false; recheck.waits++;
    var fin = function (why) { if (done) return; done = true; rcBusy = false; recheck.last = why + '@' + Date.now(); try { cont(); } catch (e) {} };
    var to = setTimeout(function () { deny = true; recheck.timeouts++; fin('timeout'); }, RECHECK_MS);
    rcBusy = true;
    try {
      A.refreshMe().then(function () {
        clearTimeout(to); if (done) return;
        var g = serverGate();
        if (g.on) { deny = false; recheck.ok++; fin('ok'); }
        else { deny = true; recheck.denied++; fin('deny:' + g.why); }
      }, function () { clearTimeout(to); deny = true; recheck.errors++; fin('error'); });
    } catch (e3) { clearTimeout(to); deny = true; recheck.errors++; fin('threw'); }
  }
  var wrapped = false, wn = 0;
  /* ■fix917（B2 F905C_WRAPPED_SUBMIT_NOT_AWAITED・GPT 裁定 2026-09-29 GO_WITH_FIXES）:
     旧 wrapper は ME ON のとき再確認を始めて即 undefined を返したため、G.cont の `await this.submit()` が
     本物の submit より先に解決し、mode 戻し・入力クリアが先に走って「続きを書く」/ automode が空振りした。
     ・wrapper は実際に story action へ入る最終境界 **submit だけ**に置く（cont / retry は submit を await するので不要）。
     ・Promise を返し、fresh auth の後に original submit の完了（return / throw / reject）までそのまま待つ。
     ・deny / timeout でも ME だけ OFF にして本編 action は実行する（recheckThen の既存契約）。
     kill: v292Dfix917Off='1' → 従来 wrapper（submit / cont / retry・非 Promise）。起動時に評価。 */
  function f917Off() { try { return window.localStorage.getItem('v292Dfix917Off') === '1'; } catch (e) { return false; } }
  var f917 = { on: null, names: null, calls: 0, resolved: 0, rejected: 0, busyDrops: 0 };
  function wrapG() {
    if (wrapped) return;
    var g = null; try { g = (typeof G !== 'undefined' && G) ? G : null; } catch (e) { g = null; }
    if (g) {
      var on917 = !f917Off();
      f917.on = on917; f917.names = on917 ? ['submit'] : ['submit', 'cont', 'retry'];
      f917.names.forEach(function (name) {
        var orig = g[name];
        if (typeof orig !== 'function' || orig.__f905c) return;
        var w = on917 ? function () {
          var self = this, args = arguments;
          if (!needRecheck()) { recheck.skipped++; return orig.apply(self, args); }
          if (rcBusy) { recheck.busy++; f917.busyDrops++; return Promise.resolve(undefined); }   /* 確認中の二重送信は無視（入力は残る） */
          f917.calls++;
          return new Promise(function (resolve, reject) {
            recheckThen(function () {
              var r;
              try { r = orig.apply(self, args); } catch (e) { f917.rejected++; reject(e); return; }
              Promise.resolve(r).then(function (v) { f917.resolved++; resolve(v); }, function (e) { f917.rejected++; reject(e); });
            });
          });
        } : function () {
          var self = this, args = arguments;
          if (!needRecheck()) { recheck.skipped++; return orig.apply(self, args); }
          if (rcBusy) { recheck.busy++; return; }                 /* 確認中の二重送信は無視（入力は残る） */
          recheckThen(function () { orig.apply(self, args); });
        };
        w.__f905c = true; w.__orig = orig; g[name] = w;
      });
      /* ■fix917: cont / retry には auth wrapper を置かない（中で submit を await する）。
         ただし submit の再確認中（rcBusy）に押された cont / retry は、入力欄・mode を書き換える前に落とす
         （二度押しで先の submit の入力を消さない）。/auth/me は増やさない。 */
      if (on917) ['cont', 'retry'].forEach(function (name) {
        var orig2 = g[name];
        if (typeof orig2 !== 'function' || orig2.__f917g) return;
        var gw = function () { if (rcBusy) { f917.busyDrops++; return Promise.resolve(undefined); } return orig2.apply(this, arguments); };
        gw.__f917g = true; gw.__orig = orig2; g[name] = gw;
      });
      wrapped = true; return;
    }
    if (++wn < 600) setTimeout(wrapG, wn < 120 ? 250 : 2000);   /* G ができるまで（fix912 と同じ起動待ち） */
  }
  wrapG();
  window.__chrMeGate = {
    build: '20260929-fix905c', allow: allow, gateOn: gateOn,
    status: function () { var g = serverGate(); return { f917: JSON.parse(JSON.stringify(f917)), killed: killed(), meOff: meOff(), prodHost: prodHost(), server: g, gateOn: gateOn(), fired: fired, lastEval: lastEval, evals: evals, deny: deny, c905Off: c905Off(), wrapped: wrapped, recheck: JSON.parse(JSON.stringify(recheck)) }; },
    invalidate: function (why) { deny = true; recheck.last = 'invalidate:' + String(why || '') + '@' + Date.now(); }
  };
  onAccount();
})();
