/* =====================================================================
 * v292DfixDL2-server-delete.js — S-2「物語を一覧から削除する」（サーバの版を基準にした削除）
 *   GPT #127-FJ（D1〜D8 条件付き GO・client 実装のみ。production は HOLD）
 * ---------------------------------------------------------------------
 * 2 つの役割（読み込み位置の script タグの data-dl2 で決まる）:
 *   data-dl2="home"  … HOME（home.html）の削除の入口・確認シート・止まっている削除の一覧・受け取り側の片づけ
 *   data-dl2="index" … ゲーム画面とギャラリーの削除の入口を「削除はホームから」に振り向けるだけ（D8）
 *
 * ■HOME の削除（D1/D2）
 *   1. 確認シート（画面内。window.confirm / alert は使わない）を開く前に、/api/auth/me の accountId（A0）と
 *      listshadow を 1 回読む。サーバの rev / serverHash / authority を「表示基準」としてメモリだけに持つ（保存しない）。
 *   2. Owner が選んで「一覧から削除する」を押したら、accountId をもう一度確かめ（A0 と違えば何も送らない）、
 *      1 件ずつ deletestory2（fix697 の狭い口）を送る。サーバが墓標を作ってから（D2）、この端末の一覧を変える
 *      （fix587.acceptServerTombstone。サーバを読み直して確定を確かめる・物理削除なし）。
 *   3. 409 の版ずれ（別の端末で更新）は何もしない。自動で取り直して送らない。Owner が「確認し直す」を押すと
 *      新しい状態でシートを開き直す（チェックは外れた状態）。
 *   4. 応答を取り逃したら getstory を 1 回だけ読む。削除済みかつ rev が基準+1 → 成功。基準のまま → 「届きませんでした」
 *      （同じ deleteOpId で「もう一度送る」を押せる）。それ以外 → 「結果を確認できません」。自動で再送しない。
 * ■受け取り側（D3）: HOME の fix757 が listshadow を読み終えたら、deleted:true の行で、この端末に生きた行
 *   （または古い計画）がある物語だけを fix587.acceptServerTombstone に渡す（サーバが確定したものだけ。本文は残す。
 *   未保存の変更がある物語は墓標を立てず競合として一覧に残す）。前後の accountId が同じときだけ。iso2 の帰属が
 *   別のアカウントを示す物語には触らない。
 * ■止まっている削除（D4）: fix587 が隔離した古い計画を一覧にし、最初は全部チェックなし。Owner が選んだものだけ、
 *   そのときのサーバの状態から新しい要求を作って送る。
 * ■断るもの: 保護 3 件（Worker が最終の関所。ここは表示だけ）、Vault で隠した物語（D5・解錠中も）、パスコード付き、
 *   サーバの一覧に無い物語（隠した物語と区別できないため。旧 v1 経路へも渡さない）、fix933 が owner と判定しない利用者（D7）。
 * ■百鬼夜行の 2 件に専用の扱いは無い（Owner が選んだときだけ、ほかと同じ経路で消える）。
 * kill: localStorage v292DfixDL2Off='1' → HOME は従来の削除に戻る（古い計画の隔離は fix587 側で常に効く）。
 * 観測: window.__v292DfixDL2.status()
 * ===================================================================== */
(function () {
  'use strict';
  if (window.__v292DfixDL2) return;
  var VERSION = 'DL2-r1nw';   /* r1n (BUNDLE34): narrow-screen entry label + 44px target (T1) */
  var TAG = '[v292DfixDL2]';
  var cs = null; try { cs = document.currentScript; } catch (e) { cs = null; }
  var MODE = (cs && cs.getAttribute && cs.getAttribute('data-dl2') === 'index') ? 'index' : 'home';
  function lsg(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function off() { return lsg('v292DfixDL2Off') === '1'; }
  var PROTECT = { smv82tjjai8: 1, smv92e8vv1f: 1, smv6r10s7u9: 1 };   /* 表示用。最終の関所は Worker（env で外せない） */
  var st = { version: VERSION, mode: MODE, opened: 0, sends: 0, accepted: 0, reconciles: 0, results: [],
             receive: { runs: 0, applied: 0, resolved: 0, conflicts: 0, skipped: 0, last: null },
             guardRefused: 0, guardClicks: 0, wrapped: false, lastWhy: null };
  function note(o) { try { o.t = Date.now(); st.results.push(o); if (st.results.length > 40) st.results.shift(); } catch (e) {} }
  function svc() { try { return window.__chronicleStoryLifecycle || null; } catch (e) { return null; } }
  function W697() { try { return window.__v292Dfix697 || null; } catch (e) { return null; } }
  function A893() { try { return window.__v292Dfix893 || null; } catch (e) { return null; } }
  function bridge() { try { return window.__v292DhomeDL2 || null; } catch (e) { return null; } }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function allowed() {
    var F = null; try { F = window.__v292Dfix933; } catch (e) { F = null; }
    if (!F || typeof F.status !== 'function') return false;          /* 判定できない = 使わせない（fail-closed） */
    try { return F.status().allowed === true; } catch (e) { return false; }
  }
  function active() {
    if (off() || MODE !== 'home') return false;
    var A = A893(); if (!(A && A.active)) return false;               /* アカウント方式（cookie session）の画面だけ */
    var W = W697();
    if (!W || typeof W.deleteStory2Once !== 'function' || typeof W.listShadowBasisOnce !== 'function' || typeof W.getStoryV2Once !== 'function') return false;
    var s = svc(); if (!s || typeof s.acceptServerTombstone !== 'function' || typeof s.dl2QuarantinedPlans !== 'function') return false;
    return true;
  }
  function who() {
    return fetch('/api/auth/me', { method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: { 'x-chronicle-csrf': '1' } })
      .then(function (r) { return r.ok ? r.json() : null; }, function () { return null; })
      .then(function (j) { return (j && j.ok === true && j.accountId) ? String(j.accountId) : null; }, function () { return null; });
  }
  function listBasis() {
    return new Promise(function (res) {
      var W = W697();
      if (!W || typeof W.listShadowBasisOnce !== 'function') { res({ ok: false, code: 'NO_PORT' }); return; }
      try { W.listShadowBasisOnce(function (rows, err, status) { res(rows ? { ok: true, rows: rows } : { ok: false, code: err || 'LIST_FAIL', status: status || 0 }); }); }
      catch (e) { res({ ok: false, code: 'THREW' }); }
    });
  }
  function readMeta() { try { var a = JSON.parse(lsg('chr6_slots_meta') || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function metaRow(id) { var m = readMeta(); for (var i = 0; i < m.length; i++) if (m[i] && String(m[i].id) === String(id)) return m[i]; return null; }
  function localTurns(id) { try { var d = JSON.parse(lsg('chr6_slot_' + id) || 'null'); return (d && Array.isArray(d.turns)) ? d.turns.length : 0; } catch (e) { return 0; } }
  function vaultHidden(id) {
    try { var F = window.__v292Dfix889; if (F && typeof F.isHidden === 'function' && F.isHidden(id)) return true; } catch (e) { return true; }
    try { var o = JSON.parse(lsg('chr6_vault_hidden') || 'null'); var a = (o && Array.isArray(o.hidden)) ? o.hidden : []; for (var i = 0; i < a.length; i++) if (String(a[i]) === String(id)) return true; } catch (e) {}
    return false;
  }
  function dt(ms) { return ms ? new Date(ms).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'; }

  /* ================================================================ sheet (in-page) */
  var SHEET = 'dl2sheet', STY = 'dl2style';
  function ensureStyle() {
    if (document.getElementById(STY)) return;
    var s = document.createElement('style'); s.id = STY;
    s.textContent =
      '#' + SHEET + '{position:fixed;inset:0;z-index:100002;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.72);padding:16px;box-sizing:border-box}' +
      '#' + SHEET + ' .dl2card{background:#1b1b20;color:#f2f2f4;border:1px solid #3a3a44;border-radius:12px;width:100%;max-width:520px;padding:18px;box-sizing:border-box;font-size:14px;line-height:1.7;max-height:calc(100vh - 32px);overflow:auto}' +
      '#' + SHEET + ' h2{margin:0 0 8px;font-size:17px}' +
      '#' + SHEET + ' p{margin:0 0 8px;font-size:13px;color:#c8c8d0}' +
      '#' + SHEET + ' .dl2soft{color:#ffcf7a;background:#2a2318;border:1px solid #574524;border-radius:8px;padding:8px 10px;font-size:12.5px;margin:0 0 10px}' +
      '#' + SHEET + ' .dl2msg{font-size:13px;margin:8px 0;color:#e8e8ee;min-height:1.2em}' +
      '#' + SHEET + ' .dl2row{border:1px solid #33333c;border-radius:8px;padding:8px 10px;margin:6px 0;display:flex;gap:10px;align-items:flex-start}' +
      '#' + SHEET + ' .dl2row.off{opacity:.62}' +
      '#' + SHEET + ' .dl2row .t{font-weight:600}' +
      '#' + SHEET + ' .dl2row .s{font-size:12px;color:#a8a8b4}' +
      '#' + SHEET + ' .dl2row .w{font-size:12px;color:#ffcf7a}' +
      '#' + SHEET + ' .dl2row .r{font-size:12.5px;margin-top:2px}' +
      '#' + SHEET + ' .dl2row .r.ok{color:#9be3a8}#' + SHEET + ' .dl2row .r.ng{color:#ff9d9d}' +
      '#' + SHEET + ' .dl2btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}' +
      '#' + SHEET + ' button{font:inherit;border-radius:8px;border:1px solid #4a4a56;background:#2a2a32;color:#f2f2f4;padding:8px 12px;cursor:pointer}' +
      '#' + SHEET + ' button.dl2go{background:#7a2d2d;border-color:#a04040}' +
      '#' + SHEET + ' button:disabled{opacity:.45;cursor:default}' +
      '#' + SHEET + ' a.dl2home{display:inline-block;border-radius:8px;border:1px solid #4a4a56;background:#2a2a32;color:#f2f2f4;padding:8px 12px;text-decoration:none}' +
      '#dl2-bar{position:fixed;left:0;right:0;bottom:0;z-index:9999;padding:9px 14px;background:#12283a;color:#cfe4f3;font-size:13px;line-height:1.6;border-top:1px solid #285a7a;text-align:center}' +
      '#dl2-bar button{margin-left:8px;background:transparent;border:1px solid #4d7fa0;border-radius:6px;color:inherit;cursor:pointer;font-size:12.5px;padding:2px 8px}' +
      '#dl2BulkBtn{margin-left:10px;font-size:12px;padding:3px 9px;border-radius:6px;border:1px solid #555;background:transparent;color:inherit;cursor:pointer;vertical-align:middle}' +
      '@media(max-width:980px){#dl2BulkBtn{min-height:44px;min-width:44px;padding:8px 14px;font-size:14px;border-radius:8px}}';   /* ★T1: iPhone touch target */
    (document.head || document.documentElement).appendChild(s);
  }
  var M = null;   /* 開いているシートの model（メモリだけ。表示基準は保存しない） */
  function closeSheet() { var e = document.getElementById(SHEET); if (e && e.parentNode) e.parentNode.removeChild(e); M = null; }
  function checkedRows() { return M ? M.rows.filter(function (r) { return r.checked && r.ready && !r.done; }) : []; }
  function renderSheet() {
    if (!M) return;
    ensureStyle();
    var box = document.getElementById(SHEET);
    if (!box) { box = document.createElement('div'); box.id = SHEET; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); document.body.appendChild(box); box.addEventListener('click', onSheetClick); box.addEventListener('change', onSheetChange); }
    var h = '<div class="dl2card">';
    if (M.kind === 'index') {
      h += '<h2>物語の削除はホームから</h2><p>ゲーム画面とギャラリーからは物語を削除できません。ホーム（物語の一覧）の「一覧から削除」を使ってください。</p>' +
           '<div class="dl2btns"><a class="dl2home" href="home.html">ホームを開く</a><button data-dl2="close">閉じる</button></div></div>';
      box.innerHTML = h; return;
    }
    h += '<h2>物語を一覧から削除する</h2>' +
         '<div class="dl2soft" id="dl2warn" role="note">この操作で物語は一覧から削除されます。現在、一覧へ戻す機能はありません。サーバー上のデータを直ちに完全消去する操作ではありません。</div>' +   /* ★T2 (GPT #127-GL): required warning, exact text */
         '<p>選んだ物語を、この端末・ほかの端末・クラウドの物語の一覧から外します。</p>' +
         '<div class="dl2soft">これは一覧から外す操作です。データを完全に消すものではありません（本文の控えはクラウドとこの端末に残ります）。一覧へ戻す画面はまだありません。</div>';
    if (M.kind === 'stuck') h += '<p>以前に削除しようとして止まっている物語です。いまのサーバーの状態を表示しています。削除するものだけを選んでください。</p>';
    if (M.kind === 'bulk') h += '<p>削除する物語だけを選んでください。1件だけ選んで削除することもできます。</p>';
    h += '<div class="dl2msg" id="dl2msg">' + esc(M.msg || '') + '</div>';
    for (var i = 0; i < M.rows.length; i++) {
      var r = M.rows[i], can = r.ready && !r.done && M.phase === 'ready';
      h += '<div class="dl2row' + (r.ready ? '' : ' off') + '" data-row="' + esc(r.id) + '">' +
           '<input type="checkbox" data-dl2chk="' + esc(r.id) + '"' + (r.checked && r.ready && !r.done ? ' checked' : '') + (can ? '' : ' disabled') + ' aria-label="選ぶ">' +
           '<div style="flex:1;min-width:0"><div class="t">' + esc(r.title) + '</div>' +
           '<div class="s">ターン ' + esc(r.turns) + '・最終更新 ' + esc(dt(r.updatedAt)) + '</div>';
      if (r.reason) h += '<div class="w">' + esc(r.reason) + '</div>';
      for (var w = 0; w < r.warn.length; w++) h += '<div class="w">' + esc(r.warn[w]) + '</div>';
      if (r.result) h += '<div class="r ' + (r.result.ok ? 'ok' : 'ng') + '" data-dl2res="' + esc(r.id) + '">' + esc(r.result.text) + '</div>';
      if (r.retryable && M.phase === 'done') h += '<div><button data-dl2retry="' + esc(r.id) + '">もう一度送る</button></div>';
      h += '</div></div>';
    }
    var n = checkedRows().length;
    h += '<div class="dl2btns">';
    if (M.phase === 'ready') h += '<button class="dl2go" data-dl2="go"' + (n ? '' : ' disabled') + '>選んだ ' + n + ' 件を一覧から削除する</button><button data-dl2="close">やめる</button>';
    else if (M.phase === 'sending' || M.phase === 'loading') h += '<button disabled>' + (M.phase === 'sending' ? '送信中…' : '確認中…') + '</button>';
    else {
      if (M.rows.some(function (x) { return x.recheck; })) h += '<button data-dl2="recheck">確認し直す</button>';
      h += '<button data-dl2="close">閉じる</button>';
    }
    h += '</div></div>';
    box.innerHTML = h;
  }
  function onSheetChange(e) {
    var t = e.target; if (!M || !t || !t.getAttribute) return;
    var id = t.getAttribute('data-dl2chk'); if (id == null) return;
    for (var i = 0; i < M.rows.length; i++) if (M.rows[i].id === id && M.rows[i].ready && M.phase === 'ready') M.rows[i].checked = !!t.checked;
    renderSheet();
  }
  function onSheetClick(e) {
    var t = e.target; if (!t || !t.getAttribute) return;
    var a = t.getAttribute('data-dl2');
    if (a === 'close') { var changed = M && M.changed; closeSheet(); if (changed) afterChange(); return; }
    if (a === 'go') { confirmSend(); return; }
    if (a === 'recheck') { var k = M.kind, ids = M.rows.map(function (r) { return r.id; }); var ch = M.changed; closeSheet(); if (ch) afterChange(); openFlow(k, ids, false); return; }
    var rid = t.getAttribute('data-dl2retry');
    if (rid != null) { retryOne(rid); return; }
  }

  /* ================================================================ rows */
  function buildRow(id, srv, preCheck) {
    var m = metaRow(id), tomb = !!(m && m.deleted === true);
    var r = { id: String(id), title: (srv && srv.title) || (m && (m.name || m.title)) || '（無題）',
              turns: srv ? srv.turnCount : localTurns(id), updatedAt: srv ? srv.updatedAt : (m && m.updatedAt ? Date.parse(m.updatedAt) || 0 : 0),
              srv: srv || null, kind: 'server', ready: false, reason: null, warn: [], checked: false, basis: null,
              deleteOpId: null, result: null, retryable: false, recheck: false, done: false };
    if (PROTECT[r.id] === 1) r.reason = '保護されている物語のため削除できません。';
    else if (vaultHidden(r.id)) r.reason = '隠している物語は削除できません。先に「隠すのをやめる」を行ってください。';
    /* ★サーバの一覧に無い物語は削除しない。Vault v2 で隠した物語は施錠中の一覧に出ず、getstory も「無い」と同じ形で答えるので、
       「この端末だけの物語」と区別できない（D5）。端末の推測では消さない（D3）。 */
    else if (!srv) r.reason = 'クラウドでこの物語を確認できないため、ここでは削除できません（隠している物語の可能性もあります）。';
    else if (srv.deleted) r.reason = 'サーバーではすでに削除されています。';
    else if (srv.locked) r.reason = 'パスコード付きの物語は削除できません。先にパスコードを外してください。';
    else if ((srv.authority !== 'shadow' && srv.authority !== 'canonical') || !srv.serverHash) r.reason = 'この物語はいまは削除できない状態です。';
    else {
      r.ready = true;
      r.basis = Object.freeze({ rev: srv.rev, serverHash: srv.serverHash, authority: srv.authority });
      var s = svc(), uns = null;
      try { uns = (s && typeof s.dl2LocalUnsynced === 'function' && m && !tomb) ? s.dl2LocalUnsynced(r.id) : null; } catch (e) { uns = 'MARKER_UNREADABLE'; }
      if (uns) r.warn.push('この端末に、まだクラウドへ保存されていない変更があります。削除するとその変更も一覧から見えなくなります（この端末の控えには残ります）。');
    }
    r.checked = !!(r.ready && preCheck);
    return r;
  }
  function blocked(msg) { if (!M) return; M.phase = 'done'; M.msg = msg; st.lastWhy = msg; renderSheet(); }
  function openFlow(kind, ids, preCheck) {
    st.opened++;
    var uniq = [], seen = {};
    for (var i = 0; i < ids.length; i++) { var s0 = String(ids[i]); if (s0 && !seen[s0]) { seen[s0] = 1; uniq.push(s0); } }
    M = { kind: kind, rows: [], phase: 'loading', msg: 'サーバーの状態を確認しています…', a0: null, changed: false, ids: uniq };
    renderSheet();
    if (!active()) { blocked('この画面では、いまは物語を一覧から削除できません。物語はそのまま残っています。'); return Promise.resolve(false); }
    if (!allowed()) { blocked('いまは物語の削除を使えません。作った物語は保存されたままです。'); return Promise.resolve(false); }
    var mine = M;
    return Promise.all([who(), listBasis()]).then(function (x) {
      if (M !== mine) return false;
      var a0 = x[0], L = x[1];
      if (!a0) { blocked('ログインの状態を確認できないため、削除できません（何も送っていません）。'); return false; }
      if (!L.ok) { blocked('サーバーの状態を確認できないため、削除できません（何も送っていません）。'); return false; }
      M.a0 = a0;
      var byId = {}; for (var j = 0; j < L.rows.length; j++) byId[L.rows[j].id] = L.rows[j];
      M.rows = uniq.map(function (id) { return buildRow(id, byId[id] || null, preCheck); });
      M.phase = 'ready';
      M.msg = M.rows.some(function (r) { return r.ready; }) ? '' : '削除できる物語がありません。';
      renderSheet();
      return true;
    });
  }

  /* ================================================================ send */
  function W() { return W697(); }
  function setRes(r, ok, text, extra) { r.result = { ok: !!ok, text: text }; if (extra) for (var k in extra) r[k] = extra[k]; note({ id: r.id, ok: !!ok, text: text, code: (extra && extra.code) || null }); }
  function accept(r, how) {
    var s = svc();
    return Promise.resolve(s.acceptServerTombstone(r.id, { source: 'dl2-delete', allowDirty: true })).then(function (a) {
      st.accepted++; r.done = true; r.retryable = false; M && (M.changed = true);
      var t = (how === 'already') ? '別の端末ですでに削除されていました。この端末の一覧からも外しました。' : '一覧から削除しました。';
      if (!a || !a.ok) t += '（この端末の一覧はまだ更新できていません。次にホームを開いたときにもう一度確かめます）';
      setRes(r, true, t, { code: how, local: a && a.code });
    }, function () { r.done = true; M && (M.changed = true); setRes(r, true, '一覧から削除しました（この端末の一覧は次にホームを開いたときに更新します）。', { code: how }); });
  }
  function reconcile(r) {
    st.reconciles++;
    return new Promise(function (res) {
      W().getStoryV2Once(r.id, function (x, err) {
        var j = (x && x.j) || {};
        if (err || !x || x.status !== 200 || j.ok !== true) {
          setRes(r, false, '削除の結果を確認できませんでした。何も変わっていない可能性があります。「確認し直す」で状態を見直してください。', { code: 'unknown', recheck: true }); res(); return;
        }
        if (j.deleted === true && (+j.rev === r.basis.rev + 1)) { accept(r, 'deleted').then(res); return; }
        if (j.deleted === true) { accept(r, 'already').then(res); return; }
        if (+j.rev === r.basis.rev && j.serverHash === r.basis.serverHash) {
          var t5 = r.last5xx ? 'サーバーが一時的に使えないか、まだこの削除に対応していません。何も変わっていません。少し待ってから「もう一度送る」を押せます。'
                             : '削除の要求がサーバーに届きませんでした。何も変わっていません。「もう一度送る」で同じ削除をもう一度送れます。';
          setRes(r, false, t5, { code: r.last5xx ? ('5xx:' + r.last5xx) : 'not-arrived', retryable: true }); res(); return;
        }
        setRes(r, false, '別の端末で更新されています。何も変わっていません。「確認し直す」でもう一度確認してください。', { code: 'changed', recheck: true }); res();
      });
    });
  }
  function handle(r, x, err) {
    if (err === 'NOT_LOGGED_IN') { setRes(r, false, 'ログインが切れています。何も送っていません。', { code: err }); return Promise.resolve(); }
    if (err || !x) { r.last5xx = null; return reconcile(r); }                     /* 応答を取り逃した → 読むだけで判定 */
    var j = x.j || {}, s = x.status, c = j.errorCode || null;
    if (s === 200 && j.ok === true && j.deleted === true) return accept(r, 'deleted');
    if (s === 409 && c === 'already-deleted') return accept(r, (j.serverRev === r.basis.rev + 1) ? 'deleted' : 'already');
    if (s === 409 && /^(rev-mismatch|hash-mismatch|authority-mismatch|cas-lost|authority-unsupported)$/.test(String(c))) {
      setRes(r, false, '別の端末で更新されています。何も変わっていません。「確認し直す」でもう一度確認してください。', { code: c, recheck: true }); return Promise.resolve();
    }
    var msg = null;
    if (s === 409 && c === 'STORY_PROTECTED') msg = '保護されている物語のため削除できません。何も変わっていません。';
    else if (s === 409 && c === 'STORY_LOCKED') msg = 'パスコード付きの物語のため削除できません。何も変わっていません。';
    else if (s === 409 && c === 'STORY_UNAVAILABLE') msg = 'この物語は削除できません。何も変わっていません。';
    else if (s === 409 && c === 'CLIENT_SCHEMA_TOO_OLD') msg = 'この画面の版が古いため削除できません。ページを再読み込みしてください。何も変わっていません。';
    else if ((s === 409 && /^(TOMBSTONE_INVALID|blob-unparsable|tombstone-hash-degenerate)$/.test(String(c))) || s === 413) msg = 'サーバーでこの物語を安全に削除できない状態です。何も変わっていません。';
    else if (s === 409 && /^idem-/.test(String(c))) { setRes(r, false, 'サーバーで処理中か、確認が必要です。少し待ってから「確認し直す」を押してください。', { code: c, recheck: true }); return Promise.resolve(); }
    else if (s === 403) msg = 'いまは物語の削除を使えません。何も変わっていません。';
    else if (s === 503 && c === 'DELETE2_DISABLED') msg = '物語の削除は一時停止中です。何も変わっていません。';
    else if (s === 429) msg = '操作が続いたため、少し待ってからもう一度お試しください。何も変わっていません。';
    else if (s === 400 && c === 'bad-op') msg = 'サーバーがまだこの削除に対応していません。何も変わっていません。';
    else if (s === 404) msg = 'サーバーにこの物語が見つかりません。何も変わっていません。';
    else if (s === 401) msg = 'ログインが切れています。何も変わっていません。';
    if (msg) { setRes(r, false, msg, { code: c || String(s) }); return Promise.resolve(); }
    if (s >= 500) { r.last5xx = c || String(s); return reconcile(r); }           /* 結果が分からない → 読むだけで判定 */
    setRes(r, false, '削除できませんでした（' + (c || s) + '）。何も変わっていません。', { code: c || String(s) });
    return Promise.resolve();
  }
  function sendOne(r) {
    if (!r.deleteOpId) r.deleteOpId = 'dl2_' + r.id + '_' + Date.now();
    st.sends++;
    return new Promise(function (res) {
      try { W().deleteStory2Once(r.id, r.basis, r.deleteOpId, function (x, err) { handle(r, x, err).then(res, res); }); }
      catch (e) { setRes(r, false, '削除できませんでした。何も変わっていません。', { code: 'threw' }); res(); }
    });
  }
  function confirmSend() {
    if (!M || M.phase !== 'ready') return;
    var sel = checkedRows(); if (!sel.length) return;
    M.phase = 'sending'; M.msg = '確認しています…'; renderSheet();
    var mine = M;
    return who().then(function (a1) {
      if (M !== mine) return;
      if (!a1 || a1 !== M.a0) { M.phase = 'done'; M.msg = 'ログイン中のアカウントが変わったため、削除を中止しました（何も送っていません）。'; renderSheet(); return; }
      if (!allowed()) { M.phase = 'done'; M.msg = 'いまは物語の削除を使えません（何も送っていません）。'; renderSheet(); return; }
      M.msg = '送信しています…'; renderSheet();
      var chain = Promise.resolve();
      sel.forEach(function (r) { chain = chain.then(function () { return sendOne(r); }).then(function () { renderSheet(); }); });
      return chain.then(function () {
        var ok = sel.filter(function (r) { return r.result && r.result.ok; }).length;
        M.phase = 'done'; M.msg = (ok === sel.length) ? (ok + ' 件を一覧から削除しました。') : (sel.length + ' 件のうち ' + ok + ' 件を削除しました。残りは下の理由をご確認ください。');
        renderSheet(); afterChange();
      });
    });
  }
  function retryOne(id) {
    if (!M || M.phase !== 'done') return;
    var r = null; for (var i = 0; i < M.rows.length; i++) if (M.rows[i].id === id) r = M.rows[i];
    if (!r || !r.retryable || !r.deleteOpId) return;
    r.retryable = false; M.phase = 'sending'; M.msg = '確認しています…'; renderSheet();
    var mine = M;
    return who().then(function (a1) {
      if (M !== mine) return;
      if (!a1 || a1 !== M.a0) { M.phase = 'done'; M.msg = 'ログイン中のアカウントが変わったため、送りませんでした。'; renderSheet(); return; }
      return sendOne(r).then(function () { M.phase = 'done'; M.msg = r.result && r.result.ok ? '一覧から削除しました。' : ''; renderSheet(); afterChange(); });
    });
  }
  function afterChange() {
    try { var F = window.__v292Dfix757; if (F && typeof F.refresh === 'function') F.refresh(); } catch (e) {}
    try { var B = bridge(); if (B && typeof B.render === 'function') B.render(); } catch (e) {}
    renderBar();
  }

  /* ================================================================ receive (other devices) */
  var BAR = { applied: 0, conflicts: 0, closed: false };
  function iso2Foreign(id) {
    try {
      var I = window.__v292Diso2; if (!I || typeof I.stampOf !== 'function' || typeof I.owner !== 'function') return false;
      var me = I.owner().now, sp = I.stampOf(id, 's');
      if (!sp) return false;
      return !!((sp.c && sp.c !== me) || (sp.w && sp.w !== me));
    } catch (e) { return true; }                                                /* 判定できない = 触らない */
  }
  function onListshadow(stories, who0p) {
    if (!active()) return;
    if (!who0p || Object.prototype.toString.call(stories) !== '[object Array]') { st.receive.skipped++; return; }
    var s = svc(), meta = readMeta(), live = {}, i;
    for (i = 0; i < meta.length; i++) if (meta[i] && meta[i].id != null && meta[i].deleted !== true) live[String(meta[i].id)] = 1;
    var planIds = {};
    try { var pend = s.pendingDeletes() || []; for (i = 0; i < pend.length; i++) { var p = pend[i]; if (p && !s.dl2IsResolved(p)) planIds[String(p.storyId || p.slotId)] = 1; } } catch (e) {}
    var cand = [];
    for (i = 0; i < stories.length; i++) {
      var r = stories[i]; if (!r || r.deleted !== true || r.id == null) continue;
      var id = String(r.id);
      if (live[id] === 1 || planIds[id] === 1) cand.push(id);
    }
    if (!cand.length) return;
    st.receive.runs++;
    Promise.all([Promise.resolve(who0p), who()]).then(function (x) {
      if (!x[0] || x[0] !== x[1]) { st.receive.skipped++; st.receive.last = 'STALE_PRINCIPAL'; return; }
      var chain = Promise.resolve(), applied = 0, conflicts = 0, resolved = 0;
      cand.forEach(function (id) {
        if (iso2Foreign(id)) { st.receive.skipped++; return; }
        chain = chain.then(function () {
          return Promise.resolve(s.acceptServerTombstone(id, { source: 'dl2-receive' })).then(function (a) {
            if (a && a.code === 'tombstoned') applied++;
            else if (a && a.code === 'local-unsynced-conflict') conflicts++;
            else if (a && a.ok && a.resolvedPlans) resolved++;
          }, function () {});
        });
      });
      return chain.then(function () {
        st.receive.applied += applied; st.receive.conflicts += conflicts; st.receive.resolved += resolved; st.receive.last = { applied: applied, conflicts: conflicts, resolved: resolved, at: Date.now() };
        BAR.applied += applied; BAR.conflicts = conflicts;
        if (applied || conflicts || resolved) { try { var B = bridge(); if (B && typeof B.render === 'function') B.render(); } catch (e) {} }
        renderBar();
      });
    });
  }

  /* ================================================================ bar + bulk button */
  function stuckCount() { try { var s = svc(); return (s && typeof s.dl2QuarantinedPlans === 'function') ? s.dl2QuarantinedPlans().length : 0; } catch (e) { return 0; } }
  function renderBar() {
    if (MODE !== 'home' || !active()) { var o = document.getElementById('dl2-bar'); if (o && o.parentNode) o.parentNode.removeChild(o); return; }
    ensureStyle();
    var n = stuckCount(), parts = [];
    if (n && allowed()) parts.push('<span id="dl2-stuck">削除が止まっている物語が ' + n + ' 件あります。</span><button data-dl2bar="stuck">確認する</button>');
    if (BAR.applied) parts.push('<span id="dl2-recv">別の端末で削除された物語 ' + BAR.applied + ' 件を一覧から外しました（この端末の控えは残しています）。</span>');
    if (BAR.conflicts) parts.push('<span id="dl2-conf">サーバーで削除された物語のうち ' + BAR.conflicts + ' 件は、この端末にまだ保存されていない変更があるため一覧に残しています。</span>');
    var bar = document.getElementById('dl2-bar');
    if (!parts.length || BAR.closed) { if (bar && bar.parentNode) bar.parentNode.removeChild(bar); return; }
    if (!bar) {
      bar = document.createElement('div'); bar.id = 'dl2-bar'; document.body.appendChild(bar);
      bar.addEventListener('click', function (e) { var a = e.target && e.target.getAttribute && e.target.getAttribute('data-dl2bar'); if (a === 'stuck') openStuck(); if (a === 'x') { BAR.closed = true; renderBar(); } });
    }
    bar.innerHTML = parts.join(' ') + '<button data-dl2bar="x" aria-label="閉じる">×</button>';
  }
  /* ★T1 (BUNDLE34): on narrow screens HOME has no per-story delete button (the detail panel is hidden at <= 980px),
     so this button is the only entry. Its label says what it does there; PC keeps 「まとめて削除」. Label only. */
  var NARROW_Q = '(max-width: 980px)', nqHooked = false;
  function bulkLabel() { var n = false; try { n = !!(window.matchMedia && window.matchMedia(NARROW_Q).matches); } catch (e) {} return n ? '物語を削除' : 'まとめて削除'; }
  function decorate() {
    if (MODE !== 'home') return;
    if (!nqHooked) { nqHooked = true; try { var mq = window.matchMedia(NARROW_Q); var fn = function () { try { decorate(); } catch (e) {} };
      if (mq.addEventListener) mq.addEventListener('change', fn); else if (mq.addListener) mq.addListener(fn); } catch (e) {} }
    var on = active() && allowed();
    var b = document.getElementById('dl2BulkBtn'), lt = document.getElementById('listTitle');
    if (on && !b && lt && lt.parentNode) {
      ensureStyle();
      b = document.createElement('button'); b.id = 'dl2BulkBtn'; b.type = 'button'; b.textContent = bulkLabel();
      b.addEventListener('click', function (e) { e.stopPropagation(); openBulk(); });
      lt.parentNode.insertBefore(b, lt.nextSibling);
    } else if (!on && b && b.parentNode) b.parentNode.removeChild(b);
    if (on && b && b.parentNode) { var L = bulkLabel(); if (b.textContent !== L) b.textContent = L; }
    renderBar();
  }
  function openDelete(ids, opts) { return openFlow('single', Array.isArray(ids) ? ids : [ids], true); }
  function openBulk() {
    var B = bridge(), rows = [];
    try { rows = (B && typeof B.all === 'function') ? B.all() : []; } catch (e) { rows = []; }
    return openFlow('bulk', rows.map(function (x) { return x.id; }), false);
  }
  function openStuck() {
    var s = svc(), plans = [];
    try { plans = s.dl2QuarantinedPlans(); } catch (e) { plans = []; }
    return openFlow('stuck', plans.map(function (p) { return p.storyId; }), false);
  }

  /* ================================================================ entry guards */
  /* HOME: DL2 が有効なあいだ、旧経路（requestDelete）を直接呼ぶ入口は断る（D8。旧経路の送信を止める） */
  function wrapHome() {
    var s = svc(); if (!s || typeof s.requestDelete !== 'function') return false;
    if (s.requestDelete.__dl2) return true;
    var orig = s.requestDelete;
    var w = function (id, opts) {
      if (active()) {
        st.guardRefused++;
        return Promise.resolve({ ok: false, code: 'USE_DL2_SHEET', message: '物語の削除は「一覧から削除」の確認画面から行います。' });
      }
      return orig.apply(this, arguments);
    };
    w.__dl2 = true; w.__orig = orig; if (orig.__v933) w.__v933 = true;
    try { s.requestDelete = w; } catch (e) { return false; }
    st.wrapped = (s.requestDelete === w); return st.wrapped;
  }
  /* index: ゲーム画面のスロット一覧の「削除」・ギャラリーの「セーブを削除」は、ホームの案内だけを出す（D8） */
  function showIndexSheet() { M = { kind: 'index', rows: [], phase: 'done', msg: '' }; renderSheet(); }
  function wrapIndex() {
    var ok = false;
    var s = svc();
    if (s && typeof s.requestDelete === 'function' && !s.requestDelete.__dl2) {
      var orig = s.requestDelete;
      var w = function () { st.guardRefused++; try { showIndexSheet(); } catch (e) {} return Promise.resolve({ ok: false, code: 'USE_HOME_DELETE', message: '物語の削除はホームから行います。' }); };
      w.__dl2 = true; w.__orig = orig; w.__v933 = true;     /* fix933 はここを包み直さない（どの利用者もここでは削除しない） */
      try { s.requestDelete = w; ok = true; } catch (e) {}
    } else if (s && s.requestDelete && s.requestDelete.__dl2) ok = true;
    var g = null; try { g = window.__v292Dfix577; } catch (e) { g = null; }
    if (g && typeof g.requestDelete === 'function' && !g.requestDelete.__dl2) {
      var w2 = function () { st.guardRefused++; try { showIndexSheet(); } catch (e) {} return false; };
      w2.__dl2 = true;
      try { g.requestDelete = w2; } catch (e) {}
    }
    st.wrapped = ok; return ok;
  }
  var GUARD_SEL = '.v30-btn-danger[data-act="clear"], .v310-menu .v30-btn-danger';
  function onIndexClick(e) {
    if (off()) return;
    var t = e.target; var b = (t && t.closest) ? t.closest(GUARD_SEL) : null;
    if (!b) return;
    e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    st.guardClicks++;
    showIndexSheet();
  }

  /* ================================================================ boot */
  if (!off()) {
    if (MODE === 'index') {
      wrapIndex();
      var n = 0; (function tick() { n++; try { wrapIndex(); } catch (e) {} if (n < 50) setTimeout(tick, 200); })();
      try { window.addEventListener('click', onIndexClick, true); } catch (e) {}
    } else {
      wrapHome();
      var n2 = 0; (function tick2() { n2++; try { wrapHome(); } catch (e) {} try { decorate(); } catch (e) {} if (n2 < 30) setTimeout(tick2, 300); })();
    }
  }
  window.__v292DfixDL2 = {
    version: VERSION, mode: MODE,
    active: active, allowed: allowed,
    openDelete: openDelete, openBulk: openBulk, openStuck: openStuck,
    onListshadow: onListshadow, decorate: decorate,
    pendingText: function () { return ''; },
    status: function () { return { version: VERSION, mode: MODE, off: off(), active: active(), allowed: allowed(), sheetOpen: !!M, sheetKind: M ? M.kind : null, phase: M ? M.phase : null,
      rows: M ? M.rows.map(function (r) { return { id: r.id, ready: r.ready, checked: r.checked, kind: r.kind, reason: r.reason, warn: r.warn.slice(), result: r.result, retryable: r.retryable, done: r.done }; }) : null,
      msg: M ? M.msg : null, stuck: stuckCount(), opened: st.opened, sends: st.sends, accepted: st.accepted, reconciles: st.reconciles, receive: JSON.parse(JSON.stringify(st.receive)),
      guardRefused: st.guardRefused, guardClicks: st.guardClicks, wrapped: st.wrapped, log: st.results.slice() }; }
  };
  try { console.log(TAG, 'loaded', MODE, off() ? '(off)' : ''); } catch (e) {}
})();
