/* v292DfixVAULTGATE2-vault-open.js — 「この物語は隠されているか・いま解錠中で開いてよいか」の 1 か所（VAULTGATE2・2026-11-22）
 * ------------------------------------------------------------------------------------------------------------------
 * 経緯: 今の隠す仕組みは Vault v2（HOME の鍵・op vault2hide → D1 vault2_story・解錠は cookie のセッション）。
 *   fix889（v1・vault_member・解錠の印は sessionStorage）は v7.8 で凍結（入口は QA の端末だけ・Worker は hidestory を
 *   VAULT_V1_DORMANT / VAULT_MEMBERSHIP_DISABLED で拒否）。ところが STARTICON・MIDICON・RESTYLE1 の Vault の判定は fix889 だけを
 *   見ていた。vault2 の解錠中は listshadow が隠した物語も返すので、fix889 はその物語を「隠していない」と答え、自動の経路が
 *   通常の物語として動いていた（文章 AI に lore の先頭と説明文を渡す）。
 * ここで決めること（同期の関数。未取得は「隠した物語かもしれない」＝ fail-closed）:
 *   hidden(id)  … true = 隠した物語（または分からない）／ false = 隠していないと分かっている（vault2・fix889 の両方で）
 *   openWhy(id) … '' = 隠した物語で、いま解錠中で開いてよい／'NOT_HIDDEN' = 隠していない／それ以外 = 理由（止める）
 *   vault2 の材料（どれも本物の部品の公開口。新しい保存先は作らない）:
 *     ・CopyGate（v292Dvault2-copygate.js）.status(): effective 'novault' = この account に Vault が無い（Vault を使ったことが無い人は
 *       ここで決まる。通信を足さない）／'vault' + hidden[] = 施錠中で隠れている物語（op vault2visible の答え・HIDDEN_UNLOCKED は visible
 *       に入るので、解錠中の隠した物語はこれだけでは分からない）／'unknown' = 分からない。
 *       CopyGate が無く __v292Dvault2CopyGateScope.scope === 'OUT_OF_SCOPE'（pages.dev 以外・fix893 OFF）= Vault v2 の対象外。
 *     ・op vault2status（HOME の __v292Dvault2Ui と同じ要求・同じ cookie）: unlocked と、解錠中だけ hiddenIds / hiddenComplete。
 *       CopyGate が 'vault' のときだけ、問われたときに送る（15 秒で古くなる・同時に 1 本）。Vault の無い人には送らない。
 *     ・施錠の瞬間: chr:vault2-blocked（SendGate が物語を止めた）と、HOME の鍵が動いた合図（LE4 と同じ BroadcastChannel / localStorage）を受けたら即「分からない」（読み直すまで止める）。ほかは 15 秒ごとの読み直しと CopyGate の
 *       hidden[]（施錠中の答え）で分かる。送る直前の最後の関門は Worker（SendGate の HIDDEN_LOCKED・mxGuard）のまま。
 *   fix889: isHidden(id) が true なら隠した物語（解錠は従来の state/unlocked/status().open を全部見る）。部品が無い = fail-closed。
 * kill: localStorage v292DfixVAULTGATE2Off='1' → この部品は何も出さない（呼ぶ側は fix889 だけの判定＝土台と同じに戻る）。
 * ★r2（レビュー (4)(a)(b)）: kill していないのに部品が無い・読めないときは、呼ぶ側が「隠した物語かもしれない」として止める（呼ぶ側の 1 行）。
 *   vault2status の読み直しが失敗したら 5→10→20→30 秒（上限）と間を空ける（成功・合図で 0 に戻る）。待つ間は「分からない」（止める）。
 * ★r2b（実機の退行: Vault のある人の隠していない物語で、15 秒ごとの読み直しの往復の間だけ「分からない」になり、RESTYLE1 がそれを最終の見送りにしていた）:
 *   答えが 10 秒たったら先回りで読み直す（15 秒の確定の窓は変えない＝隠した物語を「隠していない」と確定する窓は広げない）。state(id) を足した。
 * stats は件数と理由だけ（物語 ID・名前・本文を持たない）。端末の記録（localStorage / sessionStorage）には何も書かない。
 * ------------------------------------------------------------------------------------------------------------------ */
(function () {
  'use strict';
  var root = window;
  try { if (root.localStorage.getItem('v292DfixVAULTGATE2Off') === '1') return; } catch (e) {}
  if (root.__v292DfixVAULTGATE2) return;
  var VER = 'vaultgate2-20261122-r2', TTL = 15000, TIMEOUT = 8000, BACKOFF = [5000, 10000, 20000, 30000], AHEAD = 10000;   /* ★r2b: 答えが古くなる前（10 秒）に読み直しを始める＝読み直しの往復の間も前の確定の答えを使う（確定の窓は今の 15 秒のまま） */   /* ★r2: 読み直しの失敗が続いたら間隔を空ける（上限 30 秒） */
  var V2 = { st: null, at: 0, acct: null, inflight: null, lockedAt: 0, known: {}, n: 0, fails: 0, nextAt: 0 };
  var stats = { asks: 0, probes: 0, probeFail: 0, blocked: 0, signal: 0, backoff: 0, why: {} };
  function cnt(k) { k = String(k || 'X').slice(0, 32); stats.why[k] = (stats.why[k] || 0) + 1; }
  function acct() { try { var F = root.__v292Dfix893; var m = (F && typeof F.serverMe === 'function') ? F.serverMe() : null; return (m && m.accountId) ? String(m.accountId) : null; } catch (e) { return null; } }
  function cg() {
    try {
      var G = root.__v292Dvault2CopyGate;
      if (!G || typeof G.status !== 'function') { var sc = root.__v292Dvault2CopyGateScope; return (sc && sc.scope === 'OUT_OF_SCOPE') ? { e: 'novault' } : { e: 'unknown', why: 'NO_COPYGATE' }; }
      var s = G.status() || {}; var e = s.effective;
      if (e === 'novault') return { e: 'novault' };
      if (e === 'vault') return { e: 'vault', hidden: Array.isArray(s.hidden) ? s.hidden.map(String) : null, at: +s.answeredAt || 0 };
      return { e: 'unknown', why: 'CG_' + String(e || 'NONE').toUpperCase() };
    } catch (e) { return { e: 'unknown', why: 'CG_THREW' }; }
  }
  function failed() { stats.probeFail++; V2.st = null; V2.at = 0; V2.fails++; V2.nextAt = Date.now() + BACKOFF[Math.min(V2.fails, BACKOFF.length) - 1]; }
  function probe() {
    if (V2.inflight) return; if (Date.now() < V2.nextAt) { stats.backoff++; return; } var a0 = acct(); if (!a0) return;
    stats.probes++; var my = ++V2.n, t0 = Date.now();
    var ac = null; try { ac = new AbortController(); setTimeout(function () { try { ac.abort(); } catch (e) {} }, TIMEOUT); } catch (e) {}
    V2.inflight = root.fetch('/api/save', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'x-chronicle-csrf': '1' }, body: JSON.stringify({ op: 'vault2status' }), signal: ac ? ac.signal : undefined })
      .then(function (r) { return r.ok ? r.json() : null; }, function () { return null; })
      .then(function (j) {
        V2.inflight = null; if (my !== V2.n) return;
        if (!j || j.ok !== true) return failed();
        if (acct() !== a0 || V2.lockedAt > t0) { V2.st = null; V2.at = 0; return; }   /* 古い答え（アカウントが変わった・途中で施錠の合図）: 失敗には数えない */
        var st = { hasVault: j.hasVault === true, unlocked: j.unlocked === true, ids: Array.isArray(j.hiddenIds) ? j.hiddenIds.map(String) : null, complete: j.hiddenComplete === true };
        if (st.unlocked && st.ids) st.ids.forEach(function (x) { V2.known[x] = 1; });   /* 施錠の後も「隠した物語」と分かるように（メモリだけ） */
        V2.st = st; V2.at = Date.now(); V2.acct = a0; V2.fails = 0; V2.nextAt = 0;
      }, function () { V2.inflight = null; failed(); });
  }
  function fresh() { return !!(V2.st && Date.now() - V2.at <= TTL && V2.acct === acct() && V2.at > V2.lockedAt); }
  /* vault2 の答え: { h: true|false|null, open: bool, why } */
  function v2(id) {
    id = String(id || '');
    var c = cg();
    if (c.e === 'novault') return { h: false, open: false, why: 'V2_NOVAULT' };
    if (c.e !== 'vault') return { h: null, open: false, why: 'V2_' + (c.why || 'UNKNOWN') };
    if (c.hidden && c.hidden.indexOf(id) >= 0) return { h: true, open: false, why: 'V2_LOCKED' };
    if (!fresh()) { probe(); return { h: null, open: false, why: 'V2_PENDING' }; }
    var s = V2.st;
    if (Date.now() - V2.at > AHEAD) probe();   /* ★r2b: 先回りの読み直し（答えが届くまでは、まだ 15 秒の内の前の答え） */
    if (!s.hasVault) return { h: null, open: false, why: 'V2_DISAGREE' };   /* CopyGate は vault と言っている */
    if (s.unlocked) {
      if (!s.ids || !s.complete) return { h: null, open: false, why: 'V2_INCOMPLETE' };
      return s.ids.indexOf(id) >= 0 ? { h: true, open: true, why: '' } : { h: false, open: false, why: 'V2_VISIBLE' };
    }
    if (V2.known[id]) return { h: true, open: false, why: 'V2_LOCKED' };
    if (!c.hidden || c.at < V2.at - TTL) return { h: null, open: false, why: 'V2_CG_STALE' };
    return { h: false, open: false, why: 'V2_VISIBLE' };   /* 施錠中で、CopyGate の答えに無い = 隠していない */
  }
  function f889(id) {
    try { var V = root.__v292Dfix889; if (!V || typeof V.isHidden !== 'function') return { h: true, why: 'NO_VAULT' };
      if (!V.isHidden(id)) return { h: false };
      if (V.__real !== true || typeof V.state !== 'function' || typeof V.unlocked !== 'function' || typeof V.status !== 'function') return { h: true, why: 'NO_VAULT' };
      if (V.state() !== 'ready') return { h: true, why: 'NOT_READY' };
      if (V.unlocked() !== true) return { h: true, why: 'LOCKED' };
      var s = V.status(); if (!s || s.open !== true) return { h: true, why: 'NOT_OPEN' };
      return { h: true, why: '' };
    } catch (e) { return { h: true, why: 'THREW' }; }
  }
  function hidden(id) { try { stats.asks++; var a = f889(id); if (a.h) return true; var b = v2(id); if (b.h !== false) { if (b.h === null) cnt(b.why); return true; } return false; } catch (e) { return true; } }
  function openWhy(id) {
    try {
      var a = f889(id), b = v2(id);
      if (!a.h && b.h === false) return 'NOT_HIDDEN';
      if (a.h && a.why) return a.why;
      if (b.h === null) return b.why || 'V2_UNKNOWN';
      if (b.h === true && !b.open) return b.why || 'V2_LOCKED';
      return '';
    } catch (e) { return 'THREW'; }
  }
  function drop(k) { stats[k]++; V2.lockedAt = Date.now(); V2.st = null; V2.at = 0; V2.n++; V2.inflight = null; V2.nextAt = 0; }   /* 合図 = 状態が変わった: 待たずに読み直す */
  try { root.addEventListener('chr:vault2-blocked', function () { drop('blocked'); }); } catch (e) {}
  /* HOME の鍵が動いた合図（LE4 と同じ: BroadcastChannel 'v292DfixLE4' / localStorage 'v292DfixLE4sig'）→ 次に問われたら読み直す（それまでは分からない＝止める） */
  try { if (typeof BroadcastChannel === 'function') { var bc = new BroadcastChannel('v292DfixLE4'); bc.onmessage = function () { drop('signal'); }; } } catch (e) {}
  try { root.addEventListener('storage', function (ev) { if (ev && ev.key === 'v292DfixLE4sig') drop('signal'); }); } catch (e) {}
  /* ★r2b: 'hidden' | 'visible' | 'unknown'（未確定＝読み直し待ち・失敗・合図の後など）。呼ぶ側は unknown を最終の見送りにせず、上限つきで待てる */
  function state(id) { try { var a = f889(id); if (a.h) return 'hidden'; var b = v2(id); return b.h === false ? 'visible' : (b.h === true ? 'hidden' : 'unknown'); } catch (e) { return 'unknown'; } }
  root.__v292DfixVaultHidden = hidden;
  root.__v292DfixVAULTGATE2 = { ver: VER, hidden: hidden, openWhy: openWhy, state: state,
    status: function () { return { ver: VER, cg: cg().e, v2: V2.st ? { hasVault: V2.st.hasVault, unlocked: V2.st.unlocked, n: V2.st.ids ? V2.st.ids.length : null, complete: V2.st.complete, age: Date.now() - V2.at } : null, stats: JSON.parse(JSON.stringify(stats)) }; } };
})();
