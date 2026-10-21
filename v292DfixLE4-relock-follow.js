/* v292DfixLE4-relock-follow.js — LaneE (GPT #127-IN P0): 開いている物語ページが「再施錠・非表示化」に追従する。
 * 新しい server API は無し。既存の読み取り op `vault2visible`（sendgate が story 画面で既に使っているもの）だけを使う。
 *  story 画面:  (1) home の金庫 UI が動いた合図（localStorage / BroadcastChannel）を受けたら直ちに 1 回確認
 *               (2) それ以外は定期確認（金庫のある口座 10 秒 / 無い口座 90 秒。画面が見えているときだけ）
 *               (3) 戻ってきたとき（visibilitychange / pageshow / focus / online）も直ちに 1 回確認
 *               確認の結果「この物語はいま見せてはいけない」(hasVault && visible に自分が居ない) なら:
 *                 即座に全面の覆いを掛け（絵・本文・会話ログは visibility:hidden）、reload して既存の fix889 の扉
 *                 （fail-closed）に引き渡す。答えが無い（通信不可 / 503）ときは何も変えない。
 *               扉の画面に居る間（fix889 の reason が HIDDEN / CACHED_HIDDEN）に visible に戻った（再解錠）ら、
 *               fix889 の一覧を取り直してから reload して、本文・絵を復元する。
 *  home 画面:   v292Dvault2-ui.js が出す window イベント `chr:vault2-ui-changed` を、他タブへ合図として中継するだけ。
 * reload は 120 秒に 2 回まで（超えたら覆いのまま止まり、ボタンで手動）。
 * ★r40 (GPT #127-JF) 定期確認の条件: 画面が見えている(visibilityState==='visible')間だけ（金庫あり/答え待ち 10 秒・金庫なし確定 90 秒）。背景では止め、戻ったとき即 1 回。
 *   fetch は cache:'no-store'。429/503/通信失敗は 10s→20s→40s→60s(上限)へ指数 back-off（成功で 10s に戻る）。入力欄(#inp)には一切触れない。
 * 停止: localStorage['v292DfixLE4Off']==='1'。 */
(function () {
  'use strict';
  try { if (localStorage.getItem('v292DfixLE4Off') === '1') return; } catch (e) {}
  if (window.__v292DfixLE4Init) return;   /* ★r40: 二重 init 防止（同じ script が 2 回読まれても listener / タイマーは 1 組） */
  window.__v292DfixLE4Init = 1;
  var KEY = 'v292DfixLE4sig', CH = 'v292DfixLE4', RLK = 'v292DfixLE4rl';
  if (!(location.protocol === 'https:' && /\.pages\.dev$/.test(location.hostname))) return;
  var HOME = /\/home(\.html)?$/.test(location.pathname);
  var bc = null; try { if (typeof BroadcastChannel === 'function') bc = new BroadcastChannel(CH); } catch (e) { bc = null; }

  if (HOME) {
    var emit = function () {
      try { localStorage.setItem(KEY, String(Date.now()) + ':' + Math.random().toString(36).slice(2, 7)); } catch (e) {}
      try { if (bc) bc.postMessage('vault'); } catch (e) {}
    };
    try { window.addEventListener('chr:vault2-ui-changed', emit); } catch (e) {}
    return;
  }

  var id = ''; try { id = new URLSearchParams(location.search).get('story') || ''; } catch (e) { id = ''; }
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return;

  /* 診断用の小さな履歴（sessionStorage・最大 24 件）: この document が読み込まれた時刻・種別と、LE4 が reload した理由。判定には使わない。 */
  var DBG = 'v292DfixLE4dbg';
  function dbg(k) { try { var a = JSON.parse(sessionStorage.getItem(DBG) || '[]') || []; a.push([Date.now(), k]); if (a.length > 24) a = a.slice(-24); sessionStorage.setItem(DBG, JSON.stringify(a)); } catch (e) {} }
  try { var nv = performance.getEntriesByType && performance.getEntriesByType('navigation')[0]; dbg('load:' + (nv && nv.type || '?')); } catch (e) {}
  var st = { log: [], checks: 0, answered: 0, hasVault: null, lastVisible: null, gated: 0, restored: 0, reloads: 0, signals: 0, lastAt: 0, lastGateAt: 0 };
  var busy = false, again = false, timer = null, gated = false, restoring = false, savedTitle = null, fails = 0;
  function visible() { try { return document.visibilityState === 'visible'; } catch (e) { return !document.hidden; } }
  var EVENT_WHY = { visible: 1, focus: 1, pageshow: 1, online: 1 };

  function gateInfo() { try { var F = window.__v292Dfix889; if (F && F.__real && typeof F.gate === 'function') return F.gate(); } catch (e) {} return { armed: false, released: false, reason: null }; }
  function reloadAllowed() {
    var a = []; try { a = JSON.parse(sessionStorage.getItem(RLK) || '[]') || []; } catch (e) { a = []; }
    var now = Date.now(); a = a.filter(function (t) { return typeof t === 'number' && now - t < 120000; });
    return a.length < 2;
  }
  function markReload() {
    var a = []; try { a = JSON.parse(sessionStorage.getItem(RLK) || '[]') || []; } catch (e) { a = []; }
    var now = Date.now(); a = a.filter(function (t) { return typeof t === 'number' && now - t < 120000; }); a.push(now);
    try { sessionStorage.setItem(RLK, JSON.stringify(a)); } catch (e) {}
  }

  /* fix889 の「単回の印」（sessionStorage['v889rel:<id>']）を書いてから reload する。
     印は権限ではなく「次の document では罠を張らない」という指示でしかなく、次の document は必ず server probe をやり直す
     （fix889 の v6/v7 の定義どおり。HIDDEN なら再び扉が閉じる）。LE4 は自分の probe で「見せてよい」を確認した後にだけ使う。
     これが無いと 再解錠 1 回につき reload が 2 回（LE4 の reload ＋ fix889 reopen の reload）になり、120 秒 2 回の上限を超える。 */
  function sealedReload(why) {
    var k = 'v889rel:' + id, stamp = String(Date.now());
    try { sessionStorage.setItem(k, stamp); } catch (e) {}
    var ok = false; try { ok = sessionStorage.getItem(k) === stamp; } catch (e) { ok = false; }
    markReload(); dbg(why + (ok ? '+seal' : '')); st.reloads++;
    try { location.reload(); } catch (e) {}
  }

  /* ---- 覆い ---- */
  function cover(msg, buttons) {
    try {
      if (!document.getElementById('le4-style')) {
        var s = document.createElement('style'); s.id = 'le4-style';
        s.textContent = 'html.le4-gate body>*:not(#le4-cover){visibility:hidden!important}' +
          '#le4-cover{position:fixed;inset:0;z-index:2147483647;background:#06060a;color:#e8e8ee;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;font:15px/1.7 system-ui,-apple-system,"Hiragino Sans",sans-serif}' +
          '#le4-cover .c{max-width:380px;width:100%;text-align:center}#le4-cover h2{margin:0 0 10px;font-size:17px}#le4-cover p{margin:0 0 14px;font-size:13.5px;color:#c8c8d0}' +
          '#le4-cover button{font:inherit;color:#f2f2f4;background:#2a2a33;border:1px solid #4a4a58;border-radius:10px;padding:10px 16px;margin:4px;min-height:44px;cursor:pointer}';
        (document.head || document.documentElement).appendChild(s);
      }
      document.documentElement.classList.add('le4-gate');
      if (savedTitle === null) { savedTitle = document.title; document.title = 'Chronicle'; }
      var c = document.getElementById('le4-cover');
      if (!c) { c = document.createElement('div'); c.id = 'le4-cover'; c.setAttribute('role', 'alert'); (document.body || document.documentElement).appendChild(c); }
      c.innerHTML = '';
      var w = document.createElement('div'); w.className = 'c';
      var h = document.createElement('h2'); h.textContent = '物語を閉じました'; w.appendChild(h);
      var p = document.createElement('p'); p.textContent = msg; w.appendChild(p);
      (buttons || []).forEach(function (b) { var x = document.createElement('button'); x.type = 'button'; x.textContent = b[0]; x.addEventListener('click', b[1], false); w.appendChild(x); });
      c.appendChild(w);
    } catch (e) {}
  }

  function lockDown() {
    if (gated) return;
    gated = true; st.gated++; st.lastGateAt = Date.now();
    var canReload = reloadAllowed();
    cover(canReload ? 'この物語は非表示になりました。画面を閉じています…' : 'この物語は非表示になりました。ホームで解錠し直すと続けられます。', canReload ? [] :
      [['ホームへ戻る', function () { try { location.href = 'home.html'; } catch (e) {} }], ['もう一度確認する', function () { gated = false; check('manual'); }]]);
    if (canReload) { markReload(); dbg('lockDown'); st.reloads++; setTimeout(function () { try { location.reload(); } catch (e) {} }, 250); }
  }

  /* 扉（fix889）の画面に居る間に、再解錠で見えるようになった → 一覧を取り直してから reload（本文・絵の復元） */
  function restore() {
    if (restoring) return;
    if (!reloadAllowed()) return;
    restoring = true; st.restored++;
    setTimeout(function () { restoring = false; }, 20000);   /* reload が起きなかったときの保険（次の確認でやり直せる） */
    try { var F = window.__v292Dfix889; if (F && typeof F.refresh === 'function') F.refresh(); } catch (e) {}
    /* copygate の「隠れている物語」台帳も取り直す（見えるようになった物語なら、単回の印の書き込みが通る）。最長 4 秒で打ち切り、通らなければ印なしで reload（従来どおり 2 段）。 */
    var pc = null; try { var CG = window.__v292Dvault2CopyGate; if (CG && typeof CG.refresh === 'function') pc = CG.refresh('le4-restore'); } catch (e) { pc = null; }
    var done = false, go = function () { if (done) return; done = true; setTimeout(function () { sealedReload('restore'); }, 700); };
    try { if (pc && typeof pc.then === 'function') { pc.then(go, go); setTimeout(go, 4000); } else setTimeout(go, 1500); } catch (e) { setTimeout(go, 1500); }
  }

  function handle(j) {
    if (!(j && j.ok === true && Object.prototype.toString.call(j.visible) === '[object Array]')) return;
    st.answered++; st.hasVault = (j.hasVault === true);
    var vis = j.visible.indexOf(id) >= 0; st.lastVisible = vis;
    try { st.log.push([Date.now(), st.lastWhy, vis ? 'visible' : 'not-visible', st.hasVault]); if (st.log.length > 12) st.log.shift(); } catch (e) {}
    var g = gateInfo();
    if (g.armed && !g.released) { if (vis && (g.reason === 'HIDDEN' || g.reason === 'CACHED_HIDDEN' || g.reason === 'UNCONFIRMED')) restore(); return; }   /* UNCONFIRMED = 扉の確認が通信の都合で止まっている状態。こちらの確認で「見せてよい」と分かったら、扉に再確認させる（reload は 120 秒 2 回まで） */
    if (!vis && st.hasVault) { lockDown(); return; }
    if (vis && (gated || document.getElementById('le4-cover'))) {
      gated = false;
      if (reloadAllowed()) { sealedReload('visibleAgain'); }
      else { dbg('uncover'); uncover(); }   /* reload の回数上限で覆いのまま止まっていたとき: 再解錠で見える状態に戻ったので、reload せず覆いだけ外す（画面の中身は覆いの下で残っている） */
    }
  }

  function uncover() {
    try {
      document.documentElement.classList.remove('le4-gate');
      var c = document.getElementById('le4-cover'); if (c && c.parentNode) c.parentNode.removeChild(c);
      if (savedTitle !== null) { document.title = savedTitle; savedTitle = null; }
      st.uncovered = (st.uncovered || 0) + 1;
    } catch (e) {}
  }

  function check(why) {
    if (!visible() && why !== 'manual') return;
    if (busy) { if (!EVENT_WHY[why]) again = true; return; }
    if (EVENT_WHY[why] && Date.now() - st.lastAt < 2000) return;   /* ★r40: focus/visible が同時に来ても 1 回 */
    busy = true; st.checks++; st.lastAt = Date.now(); st.lastWhy = why;
    var ac = null, to = null; try { ac = new AbortController(); to = setTimeout(function () { try { ac.abort(); } catch (e) {} }, 6000); } catch (e) {}
    var p;
    try {
      p = window.fetch('/api/save', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'x-chronicle-csrf': '1' }, body: JSON.stringify({ op: 'vault2visible', ids: [id] }), signal: ac ? ac.signal : undefined })
        .then(function (r) { st.lastStatus = r.status; return r.ok ? r.json() : null; }, function () { st.lastStatus = 0; return null; })
        .then(function (j) { return j; }, function () { return null; });
    } catch (e) { p = Promise.resolve(null); }
    p.then(function (j) {
      try { clearTimeout(to); } catch (e) {}
      busy = false;
      var good = !!(j && j.ok === true && Object.prototype.toString.call(j.visible) === '[object Array]');
      fails = good ? 0 : fails + 1; st.fails = fails;   /* ★r40: 429/503/通信失敗 = back-off */
      try { handle(j); } catch (e) {}
      schedule();
      if (again) { again = false; if (good) check('again'); }
    });
  }

  function schedule() {
    try { if (timer) clearTimeout(timer); } catch (e) {}
    timer = null;
    if (!visible()) return;   /* ★r40: 背景では定期確認しない */
    var base = st.hasVault === false ? 90000 : 10000;   /* ★r40: 金庫あり/答え待ち 10 秒、金庫なしと答えが出た口座は 90 秒（前面のみ） */
    var delay = fails > 0 ? Math.min(60000, 10000 * Math.pow(2, fails)) : base;   /* 失敗時 20→40→60 秒（success で base に戻る）。金庫なしの失敗は 60 秒上限 */
    st.nextDelay = delay;
    timer = setTimeout(function () { timer = null; check('poll'); }, delay);
  }

  function signalled() { st.signals++; check('signal'); setTimeout(function () { check('signal2'); }, 1500); }

  try { window.addEventListener('storage', function (e) { if (e && e.key === KEY) signalled(); }); } catch (e) {}
  try { if (bc) bc.onmessage = function () { signalled(); }; } catch (e) {}
  try { document.addEventListener('visibilitychange', function () { if (visible()) check('visible'); else { try { if (timer) clearTimeout(timer); } catch (e) {} timer = null; } }); } catch (e) {}
  try { window.addEventListener('pageshow', function (e) { if (e && e.persisted) check('pageshow'); }); } catch (e) {}
  try { window.addEventListener('focus', function () { check('focus'); }); window.addEventListener('online', function () { check('online'); }); } catch (e) {}
  setTimeout(function () { check('boot'); }, 1500);

  window.__v292DfixLE4 = { status: function () { st.polling = !!timer; return { id: id, gated: gated, covered: !!document.getElementById('le4-cover'), st: st }; }, check: function () { check('manual'); } };
})();
