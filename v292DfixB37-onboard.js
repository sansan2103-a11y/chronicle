/* =====================================================================
 * v292DfixB37-onboard.js — 新しい S2 物語の「登場人物の最初の絵」案内（GPT #127-HF B・任意・物語を止めない）
 * ---------------------------------------------------------------------
 * いつ出すか（自動は 1 回だけ）:
 *   新しい S2 の物語（URL new=1）で、初回の昇格（M3: bav2 の prep が canonical で解放）と保存が確かめられ、
 *   fix705 がこの物語を canonical（schema 2）と分類し、Asset v2 の登録が落ち着いて（busy / pending / blocked / conflict なし）
 *   から 3 秒たち、絵の無い登場人物がいるときだけ。この端末・この物語で一度出したら自動では出さない
 *   （localStorage v292DfixB37onb_<storyId>。サーバーには何も保存しない）。
 *   閉じても、👥 キャラ の「🎨 登場人物の絵をまとめて作る」からいつでも開き直せる。
 * 何をするか:
 *   cast.desc（説明文）と cast.gender（性別）を「下書き（未確定）」として編集できる形で見せる。本人がキャラごとに選び、
 *   使う外見の文をそのまま確かめてから、選んだキャラだけ 1 人ずつ: setProfile（本人の確定）→ 絵が無ければ ensureFirst を 1 回。
 *   ・desc から profile へ自動で書くことはしない（書くのは本人が「この内容で確定して作る」を押したときだけ）。
 *   ・ensureFirst は同じキャラに 2 回送らない（このページで 1 回）。1 人ずつ順番に。1 分 4 枚を超えないように待つ。
 *   ・402（上限）/ 429（混雑）/ 利用記録の不調 → そこで止める（残りは作らない）。422（外見の文を絵の指示に直せない）など → そのキャラだけ失敗と表示して次へ。
 *     自動の再試行はしない。物語の保存・ターンは絵の失敗と関係なく続けられる。
 *   ・再読み込みは最後に 1 回だけ（外見を保存したとき・入力中でなければ）。結果は再読み込みの後にも短く表示する。
 *   ・費用の目安を出す（$0.0154 × 作る枚数）。
 * kill: localStorage v292DfixB37bOff = '1'（自動表示もキャラ一覧のボタンも出さない）
 * 観測口: window.__v292DfixB37onb.status()
 * ===================================================================== */
(function () {
  'use strict';
  if (typeof window === 'undefined' || window.__v292DfixB37onb) return;
  var TAG = '[B37onb]';
  var COST = 0.0154, RATE_N = 4, RATE_MS = 60000, STABLE_MS = 3000, AUTO_MAX_MS = 180000;
  function lsg(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lss(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function killed() { return lsg('v292DfixB37bOff') === '1'; }
  function A() { return window.__chronicleAssetV2 || null; }
  function F697() { return window.__v292Dfix697 || null; }
  function state() { try { return (typeof window.__chronicleGetState === 'function') ? window.__chronicleGetState('b37onb') : null; } catch (e) { return null; } }
  function sid() { try { var f = F697(); var s = f && f.status ? f.status().storyId : null; return s ? String(s) : null; } catch (e) { return null; } }
  function doc() { try { var m = window.__v292Dav2Map; return (m && typeof m.docSchema2 === 'function') ? m.docSchema2() : null; } catch (e) { return null; } }
  function acct() { try { var F = window.__v292Dfix893; var me = (F && typeof F.me === 'function') ? F.me() : null; return (me && me.accountId) ? String(me.accountId) : null; } catch (e) { return null; } }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function genderOf(v) { return (v === '女性' || v === '男性') ? v : ''; }
  var LOG = []; function note(o) { try { o.t = Date.now(); LOG.push(o); if (LOG.length > 120) LOG.shift(); } catch (e) {} }
  var st = { autoShown: 0, manualShown: 0, runs: 0, setOk: 0, setFail: 0, efCalls: 0, efOk: 0, efFail: 0, stopped: null, waits: 0, reloads: 0, last: null };
  var qs = null; try { qs = new URLSearchParams(location.search); } catch (e) {}
  var isIndex = /\/index(\.html)?$/.test(location.pathname) || location.pathname === '/';
  var isNew = !!(qs && qs.get('new') === '1');
  var FLAG = 'v292DfixB37onb_';
  function flagOf(id) { try { var o = JSON.parse(lsg(FLAG + id) || 'null'); return (o && o.v === 1) ? o : null; } catch (e) { return null; } }
  function setFlag(id, what) { if (id) lss(FLAG + id, JSON.stringify({ v: 1, st: what, at: Date.now() })); }

  /* ---------- 登場人物（この端末の cast・id つき・削除/退場していない） ---------- */
  function chars() {
    var S = state(); if (!S || !S.cast) return [];
    var out = [], c = S.cast;
    var add = function (e, hero) {
      if (!e || typeof e !== 'object' || typeof e.character_id !== 'string') return;
      if (e.status === 'DELETED' || e.status === 'DEPARTED') return;
      var nm = String(e.name || '').normalize('NFC').trim(); if (!nm) return;
      out.push({ id: e.character_id, name: nm, hero: !!hero });
    };
    add(c.hero, true);
    (Array.isArray(c.npcs) ? c.npcs : []).forEach(function (n) { add(n, false); });
    return out;
  }
  function suggest(cid) { try { var a = A(); var s = a && a.suggestAppearance ? a.suggestAppearance(cid) : null; return (s && s.ok) ? s : null; } catch (e) { return null; } }
  function preview(g, app) { var a = A(); try { if (a && typeof a.previewProfile === 'function') return a.previewProfile({ gender: g, appearance: app }); } catch (e) {} return { appearance: String(app || '').replace(/\s+/g, ' ').trim(), gender: genderOf(g) }; }
  function pointers(id, cb) {
    var f = F697(); if (!f || typeof f.assetV2Read !== 'function') return cb(null);
    f.assetV2Read('portrait.list', { story_id: id }, function (r, err) {
      var j = r && r.j; if (err || !r || r.status !== 200 || !j || !Array.isArray(j.portraits)) return cb(null);
      var by = {}; j.portraits.forEach(function (p) { if (p && typeof p.character_id === 'string') by[p.character_id] = 1; }); cb(by);
    });
  }
  function av2Idle() {
    var a = A(); if (!a || typeof a.status !== 'function') return false;
    try { var s = a.status(); if (!s || !s.schema2 || (s.reg && s.reg.busy)) return false;
      if (a.pending && a.pending()) return false; if (a.blocked && a.blocked()) return false; if (a.conflict && a.conflict()) return false; return true; } catch (e) { return false; }
  }
  function canonicalNow(id) {
    try { var F5 = window.__v292Dfix705; if (!F5 || typeof F5.docAuthority !== 'function') return false; var d = F5.docAuthority();
      return !!(d && String(d.id) === String(id) && d.fresh === true && d.present === true && String(d.authority || '') === 'canonical' && d.schema === 2); } catch (e) { return false; }
  }
  function prepOk() {
    try { var B = window.__v292Dbav2; var p = B && typeof B.prep === 'function' ? B.prep() : null;
      return !!(p && p.on && p.done && !p.failed && p.verdict); } catch (e) { return false; }
  }
  /* 保存の確認: fix781 の印が CLEAN（= この端末の本文がサーバーで確定した版そのもの）・送信中でない。新しい物語は作った直後に
     既定値（fix395）を後から保存するので、それが届くまでは setProfile が LOCAL_NOT_SYNCED で断る。その前には出さない・送らない。 */
  function saveClean(id) {
    try { var F = window.__v292Dfix781; var m = (F && typeof F.marker === 'function') ? F.marker(id) : null;
      return !!(m && m.state === 'CLEAN' && !m.inFlightSave); } catch (e) { return false; }
  }
  function waitClean(id, ms, cb) { var t0 = Date.now(); (function poll() { if (saveClean(id) && av2Idle()) return cb(true); if (Date.now() - t0 > ms) return cb(false); setTimeout(poll, 500); })(); }
  function busyDoc() { try { var S = state(); if (S && S.inFlight) return true; var inp = document.getElementById('inp'); return !!(inp && String(inp.value || '').trim()); } catch (e) { return true; } }

  /* ---------- 画面 ---------- */
  var P = null;   /* { id, acct, rows:[{id,name,hero,has,chk,g,a,res,ok}], phase:'edit'|'confirm'|'run'|'done', stop:false, msg } */
  var BOX = 'v292DfixB37-onb', STY = 'v292DfixB37-onb-sty';
  function ensureStyle() {
    if (document.getElementById(STY)) return;
    var s = document.createElement('style'); s.id = STY;
    s.textContent = '#' + BOX + '{position:fixed;right:12px;bottom:12px;z-index:2147483000;width:min(94vw,520px);max-height:80vh;overflow:auto;background:#17171f;color:#eee;border:1px solid #806040;border-radius:10px;padding:12px 14px;font-size:13px;line-height:1.6;box-shadow:0 4px 24px rgba(0,0,0,.6);box-sizing:border-box}' +
      '@media (max-width:600px){#' + BOX + '{left:8px;right:8px;width:auto;bottom:8px}}' +
      '#' + BOX + ' h3{margin:0 0 6px;font-size:15px}' +
      '#' + BOX + ' .b37p{margin:0 0 6px;color:#c8c8d0;font-size:12px}' +
      '#' + BOX + ' .b37row{border:1px solid #33333c;border-radius:8px;padding:6px 8px;margin:6px 0}' +
      '#' + BOX + ' .b37row textarea{display:block;width:100%;box-sizing:border-box;margin-top:4px;background:#1a1a22;border:1px solid #555;color:#eee;padding:4px;border-radius:4px;font-size:12px}' +
      '#' + BOX + ' .b37row select{background:#1a1a22;color:#eee;border:1px solid #555;border-radius:4px;font-size:12px;margin-left:6px}' +
      '#' + BOX + ' .b37draft{color:#e0c080;font-size:11px}' +
      '#' + BOX + ' .b37res{font-size:12px;margin-top:2px}' +
      '#' + BOX + ' .b37res.ok{color:#9fd49f}#' + BOX + ' .b37res.ng{color:#f0a0a0}' +
      '#' + BOX + ' .b37val{white-space:pre-wrap;color:#fff;border-left:2px solid #806040;padding-left:6px}' +
      '#' + BOX + ' button{background:#3a4a5a;border:1px solid #666;color:#fff;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;margin:6px 6px 0 0;min-height:36px}' +
      '#' + BOX + ' button.go{background:#3a6a5a}#' + BOX + ' button:disabled{opacity:.5;cursor:default}' +
      '#' + BOX + ' .b37cost{color:#e0c080;font-size:12px;margin-top:6px}';
    (document.head || document.documentElement).appendChild(s);
  }
  function close(how) {
    var b = document.getElementById(BOX); if (b && b.parentNode) b.parentNode.removeChild(b);
    if (P && how) note({ kind: 'CLOSE', how: how, phase: P.phase });
    P = null;
  }
  function selected() { return P ? P.rows.filter(function (r) { return !r.has && r.chk; }) : []; }
  function costText(n) { return '選んだ ' + n + ' 人ぶん、1 人 1 枚ずつ作ります（画像生成 ' + n + ' 回）'; }   /* ★LaneE E-3: 金額は出さない（内部の計測・上限は従来どおり） */
  function syncInputs() {
    if (!P) return; var box = document.getElementById(BOX); if (!box) return;
    P.rows.forEach(function (r) { if (r.has) return;
      var c = box.querySelector('[data-onb-chk="' + r.id + '"]'); if (c) r.chk = !!c.checked;
      var g = box.querySelector('[data-onb-g="' + r.id + '"]'); if (g) r.g = g.value;
      var a = box.querySelector('[data-onb-a="' + r.id + '"]'); if (a) r.a = a.value; });
  }
  function render() {
    if (!P) return; ensureStyle();
    var box = document.getElementById(BOX);
    if (!box) { box = document.createElement('div'); box.id = BOX; box.setAttribute('data-av2-ui', 'onb'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', '登場人物の絵');
      box.addEventListener('click', onClick); box.addEventListener('change', onChange); box.addEventListener('input', onInput); (document.body || document.documentElement).appendChild(box); }
    var h = '<h3>登場人物の絵を作りますか？（あとからでも作れます）</h3>';
    if (P.phase === 'edit') {
      h += '<p class="b37p">物語はこのまま遊べます。絵を作るキャラだけ選んでください。下の性別と外見は、シナリオの設定から入れた<b>下書き（まだ確定していません）</b>です。直してから使えます。</p>';
      P.rows.forEach(function (r) {
        h += '<div class="b37row" data-onb-row="' + esc(r.id) + '">';
        if (r.has) { h += '<b>' + esc(r.name) + '</b>' + (r.hero ? '（主人公）' : '') + ' — もう絵があります</div>'; return; }
        h += '<label><input type="checkbox" data-onb-chk="' + esc(r.id) + '"' + (r.chk ? ' checked' : '') + '> <b>' + esc(r.name) + '</b>' + (r.hero ? '（主人公）' : '') + ' の絵を作る</label>' +
             '<div>性別<select data-onb-g="' + esc(r.id) + '"><option value=""' + (r.g === '' ? ' selected' : '') + '>未設定</option><option value="女性"' + (r.g === '女性' ? ' selected' : '') + '>女性</option><option value="男性"' + (r.g === '男性' ? ' selected' : '') + '>男性</option></select>' +
             ' <span class="b37draft">' + (r.confirmed ? '確定済みの外見があります（変えると確定し直します）' : '下書き（未確定）') + '</span></div>' +
             '<textarea rows="3" maxlength="400" data-onb-a="' + esc(r.id) + '" placeholder="例: 黒髪の短髪、細身、灰色の着物">' + esc(r.a) + '</textarea>';
        if (r.res) h += '<div class="b37res ' + (r.ok ? 'ok' : 'ng') + '" data-onb-res="' + esc(r.id) + '">' + esc(r.res) + '</div>';
        h += '</div>';
      });
      var n = selected().length;
      if (!P.rows.some(function (r) { return !r.has; })) h += '<p class="b37p" data-onb-none="1">全員にもう絵があります。</p>';
      h += '<div class="b37cost" data-onb-cost="1">' + esc(costText(n)) + '</div>';
      if (P.msg) h += '<div class="b37res ng" data-onb-msg="1">' + esc(P.msg) + '</div>';
      h += '<button class="go" data-onb="next"' + (n ? '' : ' disabled') + '>選んだ ' + n + ' 人の外見を確かめる</button><button data-onb="later">あとで（閉じる）</button>' +
           '<p class="b37p" style="margin-top:6px">あとで作るときは 👥 キャラ の「🎨 登場人物の絵をまとめて作る」から開けます。1 人ずつ作るときは、各キャラの「外見を設定」からも作れます。</p>';
    } else if (P.phase === 'confirm') {
      var sel = selected();
      h += '<p class="b37p">次の内容で<b>外見を確定（保存）</b>してから、絵の無いキャラの最初の絵を 1 人 1 枚ずつ作ります。絵は自動では作り直しません。</p>';
      sel.forEach(function (r) { var pv = preview(r.g, r.a);
        h += '<div class="b37row" data-onb-conf="' + esc(r.id) + '"><b>' + esc(r.name) + '</b><div>性別: <span data-onb-cg="' + esc(r.id) + '">' + esc(pv.gender || '未設定（性別は絵に指定しない）') + '</span></div>' +
             '<div>外見: <span class="b37val" data-onb-ca="' + esc(r.id) + '">' + esc(pv.appearance || '（空です）') + '</span></div></div>'; });
      h += '<div class="b37cost" data-onb-cost="1">' + esc(costText(sel.length)) + '</div>';
      h += '<button class="go" data-onb="run">この内容で確定して ' + sel.length + ' 枚作る</button><button data-onb="back">戻って直す</button>';
    } else {
      h += '<p class="b37p">' + (P.phase === 'run' ? '1 人ずつ作っています。物語はこのまま遊べます。' : '終わりました。') + '</p>';
      P.rows.filter(function (r) { return r.inRun; }).forEach(function (r) {
        h += '<div class="b37row"><b>' + esc(r.name) + '</b><div class="b37res ' + (r.ok ? 'ok' : (r.res ? 'ng' : '')) + '" data-onb-res="' + esc(r.id) + '">' + esc(r.res || '待っています') + '</div></div>'; });
      if (P.msg) h += '<div class="b37res" data-onb-msg="1">' + esc(P.msg) + '</div>';
      if (P.phase === 'run') h += '<button data-onb="stop"' + (P.stop ? ' disabled' : '') + '>残りをやめる</button>';
      else h += '<button data-onb="close">閉じる</button>';
    }
    box.innerHTML = h;
  }
  function onChange(e) { if (!P || P.phase !== 'edit') return; syncInputs(); if (e && e.target && e.target.hasAttribute && e.target.hasAttribute('data-onb-chk')) render(); }
  function onInput() { if (!P || P.phase !== 'edit') return; syncInputs(); }
  function onClick(e) {
    var t = e.target; if (!t || !t.getAttribute) return; e.stopPropagation();
    var a = t.getAttribute('data-onb'); if (!a || !P) return;
    if (a === 'later') { setFlag(P.id, 'skipped'); close('later'); return; }
    if (a === 'close') { var need = P.reloadNeeded; close('close'); if (need) reloadOnce(); return; }
    if (a === 'next') { syncInputs(); var sel = selected(); if (!sel.length) return;
      var empty = sel.filter(function (r) { return !preview(r.g, r.a).appearance; });
      if (empty.length) { P.msg = '外見の文が空のキャラがいます（' + empty.map(function (r) { return r.name; }).join('・') + '）。外見を入力するか、選ぶのをやめてください。性別だけでは確定できません。'; render(); return; }
      P.msg = ''; P.phase = 'confirm'; render(); return; }
    if (a === 'back') { P.phase = 'edit'; render(); return; }
    if (a === 'run') { run(); return; }
    if (a === 'stop') { P.stop = true; P.msg = '今のキャラが終わったら止めます。'; render(); return; }
  }
  function open(source) {
    if (killed()) return { ok: false, code: 'OFF' };
    /* ★LC1 (GPT #127-IJ 4) open: LC1 が ON のときは、B37 の案内パネルを出さず、👥 の作業欄に任せる（自動の 1 回の印はここで付ける） */
    try { var lc1o = window.__v292DfixLC1; if (lc1o && typeof lc1o.on === 'function' && lc1o.on()) { var r1o = lc1o.openFromB37(source); if (r1o && r1o.ok && source === 'auto') setFlag(sid(), 'shown'); return r1o; } } catch (eLC1) {}
    var id = sid(); if (!id || doc() !== true) return { ok: false, code: 'NOT_S2' };
    if (P && P.phase === 'run') return { ok: false, code: 'RUNNING' };
    var cs = chars(); if (!cs.length) return { ok: false, code: 'NO_CHARACTERS' };
    var a0 = acct(); if (!a0) return { ok: false, code: 'NO_ACCOUNT' };
    try { var m = document.querySelector('.v292Dfix145-modal'); if (m && window.__charlist && typeof window.__charlist.close === 'function') window.__charlist.close(); } catch (e) {}
    P = { id: id, acct: a0, rows: [], phase: 'loading', stop: false, msg: '', source: source };
    var mine = P;
    pointers(id, function (by) {
      if (P !== mine) return;
      if (!by) { P.phase = 'edit'; P.rows = []; P.msg = 'サーバーの絵の状態を確かめられませんでした。少しあとで 👥 キャラ から開いてください（何も作っていません）。'; render(); note({ kind: 'OPEN_READ_FAIL', source: source }); return; }
      P.rows = cs.map(function (c) { var s = suggest(c.id) || {}; var cur = s.current || {};
        var conf = !!(cur.appearance);
        return { id: c.id, name: c.name, hero: c.hero, has: by[c.id] === 1, chk: false, confirmed: conf,
                 g: conf ? (cur.gender || '') : (s.gender || ''), a: conf ? cur.appearance : String(s.desc || '').replace(/\s+/g, ' ').trim().slice(0, 400), res: null, ok: false }; });
      if (source === 'auto' && !P.rows.some(function (r) { return !r.has; })) { setFlag(id, 'nothing'); note({ kind: 'AUTO_NOTHING' }); close(null); return; }
      P.phase = 'edit';
      if (source === 'auto') { setFlag(id, 'shown'); st.autoShown++; } else st.manualShown++;
      note({ kind: 'OPEN', source: source, n: P.rows.length, noPtr: P.rows.filter(function (r) { return !r.has; }).length });
      render();
    });
    return { ok: true };
  }

  /* ---------- 実行（1 人ずつ） ---------- */
  var ensured = {};          /* このページで ensureFirst を送ったキャラ（同じキャラへ 2 回送らない） */
  var callTimes = [];        /* このページで provider まで届いた（calls:1）時刻 */
  var STOP_SET = { LOCAL_NOT_SYNCED: 1, REBASE_REQUIRED: 1, READ_FAIL: 1, NOT_CANONICAL_ROW: 1, CONFLICT: 1, NOT_APPLIED: 1, READBACK_FAIL: 1, APPLIED_SERVER_MOVED: 1,
                   SERVER_NOT_SCHEMA2: 1, AV2_OFF: 1, AV2_FLAG_OFF: 1, NOT_SCHEMA2_DOCUMENT: 1, 'canonical-deleted': 1, 'not-canonical': 1 };
  var SET_MSG = { LOCAL_NOT_SYNCED: 'この端末の保存がまだサーバーと揃っていません', REBASE_REQUIRED: 'サーバー側の物語が更新されています', READ_FAIL: 'サーバーに接続できませんでした',
                  NOT_CANONICAL_ROW: 'この物語はサーバー側で編集できない状態です', CONFLICT: 'サーバー側が更新されていました', NOT_APPLIED: '反映を確認できませんでした',
                  EMPTY_APPEARANCE: '外見の文が空です', REGISTRATION_IN_PROGRESS: '保存の確認中でした', UNKNOWN_CHARACTER_ID: 'このキャラクターは登録されていません', CHARACTER_DELETED: '削除済みのキャラクターです' };
  /* ★LaneE: 読み込み失敗の文言を原因（HTTP status）で分ける（文言だけ） */
  function RFMSG(res) { var h = res && res.http; if (h === 404) return 'この物語は非表示中か、見つかりません'; if (h === 401) return 'ログインが切れました。もう一度ログインしてください'; if (h === 429 || h === 503) return '混み合っています。少し待ってからお試しください'; return 'サーバーに接続できませんでした'; }
  var EF_MSG = { CREATED: '絵を作りました', CREATED_CONFIRMED: '絵を作りました', EXISTS: 'もう絵がありました（作っていません）',
                 BUDGET: '今月の画像の上限に達しました', RATE_LIMITED: '混み合っています。少し待ってからもう一度お試しください', LEDGER_UNHEALTHY: '利用記録の確認中のため、画像の作成を止めています',
                 PROFILE_NOT_ENGLISH: '外見の文の中に、絵の指示に直せない言葉がありました（費用はかかっていません）。髪・目・服・体格などの見た目だけを短く書き直してください',
                 GENERATION_FAILED: '絵を作れませんでした', OUTCOME_UNKNOWN: '結果を確認できませんでした（あとで 👥 キャラ で確かめてください）',
                 UNGROUNDED_REQUIRES_EXPLICIT_NEW_DRAW: '外見の情報が届いていなかったので作っていません', PROFILE_REVIEW_REQUIRED: '外見の確認が必要です', CANDIDATES_PENDING: '候補の絵があります。👥 キャラ の「候補から選ぶ」で選んでください',
                 IN_FLIGHT: '作成中です。少し待ってから確かめてください', IN_PROGRESS: '作成中です', LOST_RACE: '別の操作で絵が決まりました', READ_FAIL: 'サーバーに接続できませんでした' };
  function waitIdle(ms, cb) { var t0 = Date.now(); (function poll() { if (av2Idle()) return cb(true); if (Date.now() - t0 > ms) return cb(false); setTimeout(poll, 400); })(); }
  function paced(cb) {
    var now = Date.now(); callTimes = callTimes.filter(function (t) { return now - t < RATE_MS; });
    if (callTimes.length < RATE_N) return cb();
    var waitMs = RATE_MS - (now - callTimes[0]) + 1000; st.waits++;
    var end = now + waitMs;
    (function tick() { if (!P) return; var left = Math.ceil((end - Date.now()) / 1000);
      if (left <= 0) { P.msg = ''; render(); return paced(cb); }
      P.msg = '混み合わないよう、少し間をあけて作っています…（あと ' + left + ' 秒）'; render(); setTimeout(tick, 1000); })();
  }
  function same(id, a0) { return sid() === id && acct() === a0 && doc() === true; }
  function run() {
    if (!P || P.phase !== 'confirm') return;
    var sel = selected(); if (!sel.length) return;
    st.runs++; P.phase = 'run'; P.msg = ''; P.stop = false; P.reloadNeeded = false;
    P.rows.forEach(function (r) { r.inRun = false; });
    sel.forEach(function (r) { r.inRun = true; r.res = null; r.ok = false; r.pv = preview(r.g, r.a); });
    setFlag(P.id, 'done');
    render();
    var mine = P, id = P.id, a0 = P.acct, i = 0;
    var finish = function (why) {
      if (P !== mine) return;
      P.phase = 'done'; st.stopped = why || null;
      var okN = sel.filter(function (r) { return r.ok; }).length;
      P.msg = (why ? why + ' ' : '') + '作った絵: ' + okN + ' 枚。' + (P.reloadNeeded ? (busyDoc() ? 'サーバーには保存されました。入力が終わったら、ページを再読み込みしてください。' : '表示を揃えるため、まもなく 1 回だけ再読み込みします。') : '');
      note({ kind: 'RUN_DONE', ok: okN, n: sel.length, why: why || null });
      try { if (window.__chronicleAv2Portrait && typeof window.__chronicleAv2Portrait.refresh === 'function') window.__chronicleAv2Portrait.refresh(); } catch (e) {}
      render();
      if (P.reloadNeeded && !busyDoc()) {
        try { sessionStorage.setItem('v292DfixB37onb_sum_' + id, JSON.stringify({ t: Date.now(), msg: sel.map(function (r) { return r.name + ': ' + (r.res || ''); }).join(' / ') })); } catch (e) {}
        setTimeout(function () { if (P === mine) { P.reloadNeeded = false; reloadOnce(); } }, 2500);
      }
    };
    var first = true;
    var next = function () {
      if (P !== mine) return;
      if (first) { first = false;   /* 最初の保存の前に、この端末の保存が確定しているかを待つ（最大 45 秒・送らない） */
        P.msg = '保存の確認を待っています…'; render();
        return waitClean(id, 45000, function (ok) { if (P !== mine) return; P.msg = ''; if (!ok) { sel.forEach(function (q) { q.res = '保存の確認が終わらなかったので作っていません'; }); note({ kind: 'NOT_CLEAN' }); return finish('この端末の保存がまだ確定していません。少し待ってから 👥 キャラ の「🎨 登場人物の絵をまとめて作る」でもう一度お試しください。'); } next(); }); }
      if (i >= sel.length) return finish(null);
      if (P.stop) { sel.slice(i).forEach(function (r) { r.res = 'やめました（作っていません）'; }); return finish('残りをやめました。'); }
      if (!same(id, a0)) { sel.slice(i).forEach(function (r) { r.res = '物語またはアカウントが変わったので作っていません'; }); note({ kind: 'RECHECK_FAIL', at: i }); return finish('物語またはアカウントが変わったので止めました。'); }
      var r = sel[i++]; r.res = '外見を保存しています…'; render();
      var pv = r.pv;
      if (!pv.appearance) { r.res = '外見の文が空なので作っていません'; render(); return next(); }
      var s0 = suggest(r.id) || {}; var cur = s0.current || {};
      var needSet = !(String(cur.appearance || '') === pv.appearance && String(cur.gender || '') === pv.gender);
      var afterSet = function () {
        if (P !== mine) return;
        if (!same(id, a0)) { r.res = '物語またはアカウントが変わったので作っていません'; render(); return finish('物語またはアカウントが変わったので止めました。'); }
        var s1 = suggest(r.id) || {}; var c1 = s1.current || {};
        if (!(String(c1.appearance || '') === pv.appearance && String(c1.gender || '') === pv.gender)) { r.res = '確定した外見をこの端末で確かめられなかったので作っていません'; render(); return next(); }
        if (ensured[r.id]) { r.res = 'このページで一度作成を依頼したので、もう一度は送っていません'; render(); return next(); }
        paced(function () {
          if (P !== mine) return;
          if (P.stop) { r.res = 'やめました（外見は保存済み・絵は作っていません）'; render(); return next(); }
          r.res = '絵を作っています…'; render();
          ensured[r.id] = true; st.efCalls++;
          A().ensureFirst(r.id, {}, function (x) {
            if (x && x.calls === 1) callTimes.push(Date.now());
            note({ kind: 'EF', cid: r.id, ok: !!(x && x.ok), code: x && x.code, calls: x && x.calls });
            var code = (x && x.code) || 'UNKNOWN';
            if (x && x.ok) { st.efOk++; r.ok = (code !== 'EXISTS'); r.res = EF_MSG[code] || '絵を作りました'; if (code === 'EXISTS') r.ok = true; render(); return next(); }
            st.efFail++; r.res = (code === 'READ_FAIL' ? RFMSG(x) : (EF_MSG[code] || 'できませんでした')) + (x && x.calls === 0 ? '' : ''); render();
            if (code === 'BUDGET' || code === 'RATE_LIMITED' || code === 'LEDGER_UNHEALTHY') {
              sel.slice(i).forEach(function (q) { q.res = '止めたので作っていません'; });
              return finish(code === 'BUDGET' ? '今月の画像の上限に達したので止めました。残りは作っていません。' : code === 'RATE_LIMITED' ? '混み合っています。少し待ってからもう一度お試しください（残りは作っていません。👥 キャラ からも作れます）。' : '画像の作成を一時的に止めています。');
            }
            next();
          });
        });
      };
      if (!needSet) return afterSet();
      waitIdle(15000, function (idle) {
        if (P !== mine) return;
        A().setProfile(r.id, { gender: pv.gender, appearance: pv.appearance, ownerConfirmed: true }, function (res) {
          note({ kind: 'SET', cid: r.id, ok: !!(res && res.ok), code: res && res.code, mirror: res && res.mirror });
          if (!(res && res.ok)) {
            st.setFail++; var code = (res && res.code) || 'UNKNOWN';
            r.res = '外見を保存できませんでした（' + (code === 'READ_FAIL' ? RFMSG(res) : (SET_MSG[code] || code)) + '）。絵は作っていません'; render();
            if (code === 'APPLIED_SERVER_MOVED') P.reloadNeeded = true;
            if (STOP_SET[code]) { sel.slice(i).forEach(function (q) { q.res = '止めたので作っていません'; }); return finish('外見を保存できない状態だったので止めました。ページを再読み込みしてから、もう一度お試しください。'); }
            return next();
          }
          st.setOk++; if (!res.noop) P.reloadNeeded = true;
          setTimeout(afterSet, 200);
        });
      });
    };
    next();
  }
  var reloaded = false;
  function reloadOnce() { if (reloaded) return; reloaded = true; st.reloads++; note({ kind: 'RELOAD' }); try { location.reload(); } catch (e) {} }

  /* ---------- 再読み込みの後の短い結果表示 ---------- */
  function showSummary() {
    var id = sid(); if (!id) return false;
    var k = 'v292DfixB37onb_sum_' + id, v = null; try { v = sessionStorage.getItem(k); if (v) sessionStorage.removeItem(k); } catch (e) {}
    if (!v) return true; var o = null; try { o = JSON.parse(v); } catch (e) {} if (!o || !o.msg || Date.now() - (+o.t || 0) > 120000) return true;
    try { var d = document.createElement('div'); d.id = 'v292DfixB37-onb-sum'; d.setAttribute('data-av2-ui', 'onb-sum');
      d.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483000;max-width:92vw;background:#222;color:#eee;border:1px solid #806040;border-radius:8px;padding:8px 12px;font-size:12px;line-height:1.6';
      d.textContent = '登場人物の絵: ' + o.msg; (document.body || document.documentElement).appendChild(d);
      setTimeout(function () { try { d.parentNode.removeChild(d); } catch (e) {} }, 9000); } catch (e) {}
    return true;
  }

  /* ---------- キャラ一覧（fix145）に開き直すボタン ---------- */
  function decorateCharlist() {
    if (killed()) return;
    /* ★LC1 (GPT #127-IJ 4) decorate: LC1 が ON のときは「🎨 登場人物の絵をまとめて作る」ボタンを出さない（作業欄に統合） */
    try { var lc1d = window.__v292DfixLC1; if (lc1d && typeof lc1d.on === 'function' && lc1d.on()) { var obd = document.querySelector('[data-b37-onb-open]'); if (obd && obd.parentNode) obd.parentNode.removeChild(obd); return; } } catch (eLC1) {}
    var mo = document.querySelector('.v292Dfix145-modal'); if (!mo) return;
    var on = doc() === true && chars().length > 0;
    var b = mo.querySelector('[data-b37-onb-open]');
    if (!on) { if (b && b.parentNode) b.parentNode.removeChild(b); return; }
    if (b) return;
    b = document.createElement('button'); b.type = 'button'; b.setAttribute('data-b37-onb-open', '1'); b.setAttribute('data-av2-ui', 'onb-open');
    b.textContent = '🎨 登場人物の絵をまとめて作る';
    b.style.cssText = 'background:#3a5a4a;border:1px solid #666;color:#fff;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;margin:0 0 8px 0;min-height:36px;';
    b.onclick = function (ev) { ev.stopPropagation(); open('manual'); };
    mo.insertBefore(b, mo.firstChild);
  }

  /* ---------- 自動表示の判定（新しい S2 の物語・1 回だけ） ---------- */
  var t0 = Date.now(), okSince = 0, autoDone = false;
  function autoTick() {
    if (killed() || autoDone || !isIndex || !isNew) return;
    if (Date.now() - t0 > AUTO_MAX_MS) { autoDone = true; return; }
    var id = sid(); if (!id) { okSince = 0; return; }
    if (flagOf(id)) { autoDone = true; st.last = 'FLAG'; return; }
    var ok = prepOk() && canonicalNow(id) && doc() === true && av2Idle() && saveClean(id) && !(state() && state().inFlight) && chars().length > 0 && !P;
    if (!ok) { okSince = 0; return; }
    if (!okSince) { okSince = Date.now(); return; }
    if (Date.now() - okSince < STABLE_MS) return;
    autoDone = true; st.last = 'AUTO_OPEN'; open('auto');
  }
  function start() {
    if (killed() || !isIndex) return;
    var n = 0, sumDone = false;
    (function loop() { n++; if (!sumDone && n < 60) { try { sumDone = showSummary(); } catch (e) { sumDone = true; } }   /* storyId が分かってから 1 回 */
      try { autoTick(); } catch (e) {} try { decorateCharlist(); } catch (e) {} setTimeout(loop, n < 600 ? 500 : 1500); })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.__v292DfixB37onb = {
    version: 'B37onb-r1', open: open, close: function () { close('api'); },
    status: function () { return { killed: killed(), isNew: isNew, storyId: sid(), flag: sid() ? flagOf(sid()) : null, open: !!P, phase: P ? P.phase : null,
      rows: P ? P.rows.map(function (r) { return { id: r.id, name: r.name, has: r.has, chk: r.chk, res: r.res, ok: r.ok }; }) : null, msg: P ? P.msg : null,
      ensured: Object.keys(ensured), calls: callTimes.length, st: JSON.parse(JSON.stringify(st)), log: LOG.slice(-40) }; }
  };
  try { console.log(TAG, 'loaded', killed() ? '(off)' : ''); } catch (e) {}
})();
