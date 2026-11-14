/* =====================================================================
 * Chronicle v292DfixOWNERON1: Owner のアカウントで入った端末だけ、指定の機能を既定 ON にする（laneOWNERON1・2026-11-15・LOCAL 候補・未出荷）
 * ---------------------------------------------------------------------
 * ■やること（読むだけ。localStorage / sessionStorage / cookie / IDB / DOM / 通信へは 1 つも書かない）
 *   各機能の on() が want('<名前>') を呼ぶ。この部品は、その時点の「サーバーが答えたアカウント」が Owner かどうかだけを答える。
 *   Owner の判定は既存の読み口と同じ（BF1-OWNER / CP1 / E64 / smrc1 と同じ）:
 *     window.__v292Dfix893.serverMe()（この page の GET /api/auth/me の答え・in-memory）の entitlement === 'owner' かつ status === 'active'。
 *     entitlement 'owner' は Worker の管理画面からは付けられない（acct-entitle-set は beta / none だけ・owner の行は OWNER_FIXED）。
 *   さらに次の全部がそろったときだけ Owner とみなす（どれか 1 つでも欠けたら OFF＝fail-closed）:
 *     ・accountId が 32 桁の hex
 *     ・同じ答えの機能スイッチの写し（fix893.flagsSnap()）があり、その acct が serverMe の accountId と同じ
 *       （fix893 はログアウト・401・403・通信失敗・別タブでのログアウト／別アカウントへの切り替えで写しを捨てる＝そのとき OFF）
 *     ・ログインの印（localStorage v292Dfix837_sess）の acct が同じ（印は「OFF へ倒すきっかけ」にだけ使う。ON の根拠にはしない）
 *     ・匿名経路（fix886）が動いていない
 *   答えがまだ来ていない・401・未ログイン・通信失敗・fix893 が無い（*.pages.dev 以外）・例外 → OFF。
 * ■対象の機能（一覧はここ 1 か所。足すときは FEATURES に 1 行 ＋ その機能の on() に want('<名前>') の 1 か所）
 * ■優先順: 各機能の Off 鍵（常に勝つ）＞ 全体 kill v292DfixOWNERON1Off='1' ＞ 各機能の On 鍵（従来どおり ON）＞ Owner 判定。
 *   On 鍵を手で入れた端末（Owner の PC の Chrome）は従来どおり ON。Owner 以外・未ログインはこの部品が無いのと同じ。
 * ■毎回評価（覚えない）。答えが遅れて届いたら、その後に呼ばれた on() から ON。ログアウト・別アカウントは次に呼ばれた on() から OFF。
 * ■診断（コンソール・読むだけ）: window.__v292DfixOWNERON1.status() / want('place1') / owner()
 * ===================================================================== */
(function (root) {
  'use strict';
  if (!root || root.__v292DfixOWNERON1) return;
  var VER = 'owneron1-20261115-r1';
  var KILL = 'v292DfixOWNERON1Off';
  var MARK_KEY = 'v292Dfix837_sess';
  var ACCT_RE = /^[0-9a-f]{32}$/;
  /* 対象の機能（名前 → その機能の kill 鍵）。On 鍵の判定は各機能の on() が先にしている */
  var FEATURES = {
    place1: { off: 'v292DfixPLACE1Off' },   /* PLACE1: 物のいまの持ち主・置き場所の控え（v292DfixPLACE1-where-now.js） */
    spkw1: { off: 'v292DfixSPKW1Off' }      /* SPKW1: 話者の窓推測の直し（index.html の genConvLog 付近・v292Dfix303・v292Dfix469） */
  };
  var ST = { evals: 0, yes: 0, lastWhy: null, why: {} };

  function lsGet(k) { try { var ls = root.localStorage; return ls ? ls.getItem(k) : null; } catch (e) { return undefined; } }   /* undefined = 読めない */

  /* owner() → { on: bool, why } — 読むだけ */
  function owner() {
    var k = lsGet(KILL);
    if (k === undefined) return { on: false, why: 'storage-unreadable' };
    if (k === '1') return { on: false, why: 'killed' };
    var F = null; try { F = root.__v292Dfix893 || null; } catch (e) { F = null; }
    if (!F || typeof F.serverMe !== 'function' || typeof F.flagsSnap !== 'function') return { on: false, why: 'no-account-api' };
    var me = null, snap = null;
    try { me = F.serverMe(); snap = F.flagsSnap(); } catch (e) { return { on: false, why: 'read-error' }; }
    if (!me) return { on: false, why: 'no-server-me' };
    if (me.entitlement !== 'owner') return { on: false, why: 'not-owner' };
    if (me.status !== 'active') return { on: false, why: 'not-active' };
    var acct = String(me.accountId || '');
    if (!ACCT_RE.test(acct)) return { on: false, why: 'bad-account' };
    if (!snap || snap.acct !== acct) return { on: false, why: 'answer-dropped' };
    var mark = null; try { mark = JSON.parse(lsGet(MARK_KEY) || 'null'); } catch (e) { mark = null; }
    if (!mark || mark.sid !== 'cookie' || mark.acct !== acct) return { on: false, why: 'mark-mismatch' };
    try { var P = root.__v292Dfix886; if (P && P.api && typeof P.api.active === 'function' && P.api.active()) return { on: false, why: 'anon' }; }
    catch (e) { return { on: false, why: 'anon-unknown' }; }
    return { on: true, why: 'owner' };
  }
  /* want(name): その機能を Owner の既定で ON にしてよいとき true。それ以外は全部 false */
  function want(name) {
    var why, on = false;
    if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(FEATURES, name)) why = 'unknown-feature';
    else {
      var off = lsGet(FEATURES[name].off);
      if (off === undefined) why = 'storage-unreadable';
      else if (off === '1') why = 'feature-off';
      else { var o = owner(); on = o.on; why = o.why; }
    }
    ST.evals++; if (on) ST.yes++; ST.lastWhy = String(name) + ':' + why; ST.why[why] = (ST.why[why] || 0) + 1;
    return on;
  }
  function status() {
    var o = owner(), f = {};
    for (var n in FEATURES) if (Object.prototype.hasOwnProperty.call(FEATURES, n)) { var off = lsGet(FEATURES[n].off); f[n] = { off: off === '1', ownerDefault: !!(o.on && off !== '1' && off !== undefined) }; }
    return { ver: VER, killed: lsGet(KILL) === '1', owner: o, features: f, evals: ST.evals, yes: ST.yes, lastWhy: ST.lastWhy, why: JSON.parse(JSON.stringify(ST.why)) };
  }
  try { Object.defineProperty(root, '__v292DfixOWNERON1', { value: Object.freeze({ ver: VER, want: want, owner: owner, status: status, features: function () { return Object.keys(FEATURES); } }), configurable: false, enumerable: false, writable: false }); }
  catch (e) { try { root.__v292DfixOWNERON1 = { ver: VER, want: want, owner: owner, status: status }; } catch (e2) {} }
})(typeof window !== 'undefined' ? window : globalThis);
