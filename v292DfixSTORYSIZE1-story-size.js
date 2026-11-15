/* =====================================================================
 * v292DfixSTORYSIZE1-story-size.js — 1 物語の大きさの上限の保護と知らせ（★STORYSIZE1・GPT #127-UN・2026-11-15）
 * ---------------------------------------------------------------------
 * ■なぜ
 *   Worker（v46.48-p4r2）は物語の保存（putstory / putcanonical）で、保存する文字列の「JS の文字数」が 1,000,000 を超えると
 *   413 STORY_TOO_LARGE（retryable:false）を返す（w_v4648_p4r2.js:2957 CHR_STORY_BLOB_MAX_V403・:7360・:7799）。
 *   一方 D1 の 1 行・1 文字列の上限は 2,000,000「バイト」で、日本語（UTF-8 で 1 字 3 バイト）が多い物語は
 *   約 65 万字で上限に届く。そのとき Worker の UPDATE が SQLITE_TOOBIG で例外になり、500 errorCode 'exception'
 *   retryable:true が返る（:5314）。端末にはこの 2 つを扱うコードが無く、知らせは出ず、保存のたびに数 MB を送り直していた。
 * ■すること
 *   1) 測る: fix697 の物語の保存（putstory / putcanonical）の送信直前に、送る本文の文字数と UTF-8 バイト数を測る。
 *      文字数×3 が注意の線に届かない物語は、バイト数を数えない（TextEncoder を呼ばない＝ふつうの物語の負荷 0）。
 *      ページを開いて 4 秒後に 1 回、送信を待たずに今の物語を測る（読むだけ・fix697 の projectionV2 / projection）。
 *   2) 割合 = max(バイト数 / LIMIT_BYTES, 文字数 / LIMIT_CHARS)。
 *        LIMIT_BYTES = 1,990,000（D1 の 2,000,000 から、同じ行のほかの列＝u・story_id・hash・title・snippet・device・build・pass_* の余裕 10,000 を引く）
 *        LIMIT_CHARS = 1,000,000（Worker の CHR_STORY_BLOB_MAX_V403）
 *      注意 WARN_RATIO 0.70（≒ 1,393,000 バイト）／危険 DANGER_RATIO 0.90（≒ 1,791,000 バイト）。
 *   3) 注意域: 入力欄の上に消えない知らせを 1 回（✕ まで）。
 *      危険域: 「送信」「続きを書く」を生成の前に止めて知らせる（入力欄の文字は消さない・「やり直す」は止めない＝ターンは増えない）。
 *   4) 上限を確実に超える本文（送る本文の文字数−2,000 が 1,000,000 超、またはバイト数−4,000 が 2,000,000 超）と、
 *      このページで Worker が大きさで断った物語（413 STORY_TOO_LARGE / BODY_TOO_LARGE / too-large、
 *      500 で本文に SQLITE_TOOBIG / too big）の、断られた大きさ以上の本文は送らず、Worker の 413 STORY_TOO_LARGE と
 *      同じ形の応答をその場で返す（sz1:'local' の印つき）。fix697 はこれを Worker の 413 と同じに扱う（C2_HTTP_413 → fix928 は再試行しない）。
 *      端末の本文・保存・削除には触らない（古い本文を削らない・自動で何も消さない）。
 * ■しないこと: prompt / confirm / alert・自動の再読込・storage への書込・本文の変更。ふつうの大きさの物語では DOM も送信も土台と同じ。
 * ■止める: localStorage v292DfixSTORYSIZE1Off='1'（毎回評価。測らない・止めない・知らせない＝土台と同じ）。
 * ■診断: window.__v292DfixSTORYSIZE1.status()（数と割合だけ。本文は残さない）
 * ===================================================================== */
(function () {
  'use strict';
  var W = (typeof window !== 'undefined') ? window : globalThis;
  if (W.__v292DfixSTORYSIZE1) return;
  var VER = 'storysize1-20261115-a', KILL = 'v292DfixSTORYSIZE1Off', ID = 'storysize1';
  var LIMIT_BYTES = 1990000, LIMIT_CHARS = 1000000;
  var WARN_RATIO = 0.70, DANGER_RATIO = 0.90;
  var OVER_CHARS = 2000, OVER_BYTES = 4000, HARD_BYTES = 2000000;
  var STORY_OPS = { putcanonical: 1, putstory: 1 };
  var st = { measured: 0, encoded: 0, skippedSmall: 0, synth: 0, serverTooBig: 0, blocked: 0, warnShown: 0, dangerShown: 0, dismissed: 0, err: 0, loadMeasure: null };
  var S = {};            /* id → { chars, bytes, ratio, level, at, server } （このページの記憶だけ） */
  var shownWarn = {}, timer = null;
  function killed() { try { return W.localStorage.getItem(KILL) === '1'; } catch (e) { return false; } }
  function $(id) { try { return document.getElementById(id); } catch (e) { return null; } }

  /* ---------- 測る（純関数） ---------- */
  function utf8Bytes(s) {
    try { if (typeof TextEncoder === 'function') return new TextEncoder().encode(s).length; } catch (e) {}
    var n = 0; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); if (c < 0x80) n += 1; else if (c < 0x800) n += 2; else if (c >= 0xD800 && c <= 0xDBFF) { n += 4; i++; } else n += 3; } return n;
  }
  function levelOf(ratio) { return ratio >= DANGER_RATIO ? 'danger' : (ratio >= WARN_RATIO ? 'warn' : 'ok'); }
  /* 文字列 → { chars, bytes|null, ratio, level, over } */
  function measureStr(s) {
    s = String(s == null ? '' : s);
    var chars = s.length, bytes = null;
    if (chars * 3 < WARN_RATIO * LIMIT_BYTES && chars < WARN_RATIO * LIMIT_CHARS) { st.skippedSmall++; }   /* 最悪 3 バイト/字でも注意の線に届かない＝数えない */
    else { bytes = utf8Bytes(s); st.encoded++; }
    var ratio = Math.max(bytes == null ? 0 : bytes / LIMIT_BYTES, chars / LIMIT_CHARS);
    if (bytes == null) ratio = Math.max(ratio, 0);   /* 小さい物語の割合は文字数だけ（注意の線の下であることは確か） */
    var over = (chars - OVER_CHARS) > LIMIT_CHARS || (bytes != null && (bytes - OVER_BYTES) > HARD_BYTES);
    return { chars: chars, bytes: bytes, ratio: ratio, level: over ? 'over' : levelOf(ratio), over: over };
  }
  function pct(r) { return Math.min(999, Math.max(0, Math.round(r * 100))); }

  /* ---------- 今のページの物語 ---------- */
  function curId() {
    try { var k = W.__chronicleDocumentStoryKey; if (typeof k === 'string' && k) return (k === 'chr6') ? 'default' : k.replace(/^chr6_slot_/, ''); } catch (e) {}
    try { var u = new URLSearchParams(location.search).get('story'); if (u) return (u === 'chr6') ? 'default' : u; } catch (e2) {}
    return null;
  }
  function record(id, m, src) {
    id = String(id == null ? '' : id); if (!id) return null;
    var prev = S[id] || {};
    S[id] = { chars: m.chars, bytes: m.bytes, ratio: m.ratio, level: m.level, at: Date.now(), src: src, server: prev.server || null };
    st.measured++;
    if (id === curId()) react(id);
    return S[id];
  }
  function stateOf(id) { return (id && S[id]) ? S[id] : null; }
  /* 送信を止めるか: 危険域・上限超え・このページで Worker が大きさで断った */
  function blocking(id) { var s = stateOf(id); if (!s) return false; return s.level === 'danger' || s.level === 'over' || !!s.server; }

  /* ---------- 知らせ（HOLDNOTE1 / ERRNOTE1 と同じ出し方） ---------- */
  var T_WARN = function (p) { return 'この物語は、クラウドに保存できる大きさの上限に近づいています（いま約 ' + p + '%）。区切りのよいところで、新しい物語として続けることをおすすめします。'; };
  var T_DANGER = function (p, blocked) { return 'この物語は、クラウドに保存できる大きさの上限に近いため、これ以上続きを作れません（いま約 ' + p + '%）。続きは新しい物語として始めてください。' + (blocked ? '入力欄の文はそのままです。' : ''); };
  var T_OVER = function (p) { return 'この物語は大きすぎて、クラウドに保存できなくなりました（いま約 ' + p + '%）。続きを作るのを止めています。続きは新しい物語として始めてください。'; };
  function remove(why) { var n = $(ID); if (n && n.parentNode) n.parentNode.removeChild(n); if (timer) { try { clearInterval(timer); } catch (e) {} timer = null; } if (n && why) st[why] = (st[why] || 0) + 1; }
  function place(n) {
    try {
      var c = $('composer'); var h = c ? Math.round(c.getBoundingClientRect().height) : 0;
      var add = 0; ['errnote1', 'holdnote1'].forEach(function (x) { var e = $(x); if (e) add += Math.round(e.getBoundingClientRect().height) + 8; });
      n.style.bottom = 'calc(' + ((h > 0 ? h + 8 : 96) + add) + 'px + env(safe-area-inset-bottom, 0px))';
    } catch (e) {}
  }
  function show(kind, text) {
    if (typeof document === 'undefined' || !document.createElement) return;
    var cur = $(ID);
    if (cur && cur.getAttribute('data-storysize1-kind') === kind) { var sp = cur.firstChild; if (sp) sp.textContent = text; return; }
    remove(null);
    var n = document.createElement('div'); n.id = ID; n.setAttribute('role', kind === 'warn' ? 'status' : 'alert'); n.setAttribute('aria-live', kind === 'warn' ? 'polite' : 'assertive'); n.setAttribute('data-storysize1-kind', kind);
    var bg = kind === 'warn' ? 'background:#1f2a38;color:#dce9ff;border:1px solid #4a6a90' : 'background:#3a1418;color:#ffd9d9;border:1px solid #a04040';
    n.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);z-index:99997;box-sizing:border-box;width:min(560px,calc(100vw - 16px));' + bg + ';border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.6;box-shadow:0 4px 16px rgba(0,0,0,.5);display:flex;gap:10px;align-items:flex-start';
    var s = document.createElement('span'); s.style.cssText = 'flex:1 1 auto;min-width:0;white-space:normal;word-break:break-word'; s.textContent = text;
    var x = document.createElement('button'); x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label', '閉じる');
    x.style.cssText = 'flex:none;background:none;color:#cbd;border:0;cursor:pointer;font-size:16px;line-height:1;padding:4px 6px;min-width:32px;min-height:32px';
    x.onclick = function () { remove('dismissed'); };
    n.appendChild(s); n.appendChild(x); place(n);
    (document.body || document.documentElement).appendChild(n);
    timer = setInterval(function () { try { var c2 = $(ID); if (!c2) { clearInterval(timer); timer = null; return; } place(c2); } catch (e) {} }, 1000);
  }
  function noticeFor(id, force) {
    var s = stateOf(id); if (!s) return;
    if (s.level === 'over' || s.server) { if (force || !s.shownStop) { s.shownStop = true; st.dangerShown++; show('over', T_OVER(pct(Math.max(s.ratio, 1)))); } return; }
    if (s.level === 'danger') { if (force || !s.shownDanger) { s.shownDanger = true; st.dangerShown++; show('danger', T_DANGER(pct(s.ratio), !!force)); } return; }
    if (s.level === 'warn' && !shownWarn[id]) { shownWarn[id] = true; st.warnShown++; show('warn', T_WARN(pct(s.ratio))); }
  }
  function react(id) { try { if (!killed()) noticeFor(id, false); } catch (e) { st.err++; } }

  /* ---------- fix697 の送信の口（putstory / putcanonical だけ） ---------- */
  function synth(id, s) {
    return new Response(JSON.stringify({ ok: false, shadow: true, id: id, error: 'この物語はクラウドに保存できる上限を超えています。', errorCode: 'STORY_TOO_LARGE',
      limit: LIMIT_CHARS, size: s ? s.chars : null, retryable: false, sz1: 'local' }), { status: 413, headers: { 'Content-Type': 'application/json' } });
  }
  function tooBigAnswer(status, j) {
    var c = j && j.errorCode ? String(j.errorCode) : '';
    if (status === 413 && (c === 'STORY_TOO_LARGE' || c === 'BODY_TOO_LARGE' || c === 'too-large')) return c;
    if (status >= 500 && /SQLITE_TOOBIG|too big/i.test(String((j && j.error) || ''))) return 'SQLITE_TOOBIG';
    return null;
  }
  function pre(body, opts) {
    var id = String(body.id == null ? '' : body.id); if (!id) return null;
    var str = opts && typeof opts.body === 'string' ? opts.body : null; if (str == null) return null;
    var m = measureStr(str);
    var s = record(id, m, 'send:' + body.op);
    var sv = s && s.server;
    var refuse = m.over || (sv && ((m.bytes != null && sv.bytes != null && m.bytes >= sv.bytes) || (sv.bytes == null && m.chars >= sv.chars)));
    if (!refuse) return null;
    st.synth++;
    return synth(id, s);
  }
  function post(body, res) {
    try {
      if (!res || (res.status !== 413 && res.status < 500)) return;
      var id = String(body.id == null ? '' : body.id); if (!id) return;
      res.clone().json().then(function (j) {
        var code = tooBigAnswer(res.status, j); if (!code) return;
        if (j && j.sz1 === 'local') return;
        st.serverTooBig++;
        var s = S[id] || (S[id] = { chars: null, bytes: null, ratio: 1, level: 'over', at: Date.now(), src: 'server' });
        s.server = { code: code, status: res.status, chars: s.chars, bytes: s.bytes, at: Date.now() };
        if (id === curId()) react(id);
      }).catch(function () {});
    } catch (e) { st.err++; }
  }
  /* fix697 から呼ばれる: go() が本当の fetch。必ず go() をちょうど 1 回呼ぶか、その場の応答を返す（例外を外へ出さない） */
  function send(body, opts, go) {
    var syn = null, isStory = false;
    try { isStory = !killed() && !!body && STORY_OPS[body.op] === 1; if (isStory) syn = pre(body, opts); } catch (e) { st.err++; syn = null; }
    if (syn) return Promise.resolve(syn);
    var p = go();
    if (isStory) { try { if (p && typeof p.then === 'function') p.then(function (res) { post(body, res); }, function () {}); } catch (e2) { st.err++; } }
    return p;
  }

  /* ---------- 送信（生成）の前で止める（fix892 と同じ形。危険域・上限超えのときだけ） ---------- */
  function shouldBlock() { if (killed()) return false; var id = curId(); return !!id && blocking(id); }
  function blockNow(why) { st.blocked++; try { console.warn('[STORYSIZE1] blocked', why); } catch (e) {} noticeFor(curId(), true); }
  function getG() { try { return (typeof G !== 'undefined' && G) ? G : null; } catch (e) { return null; } }
  var wrapped = false;
  function wrapG() {
    if (wrapped) return true;
    var g = getG(); if (!g) return false;
    ['submit', 'cont'].forEach(function (name) {
      var orig = g[name];
      if (typeof orig !== 'function' || orig.__sz1) return;
      var w = function () { if (shouldBlock()) { blockNow(name); return; } return orig.apply(this, arguments); };
      w.__sz1 = true; w.__orig = orig; g[name] = w;
    });
    wrapped = true; return true;
  }
  var ENTRY_RE = /\bG\.(submit|cont)\(/;
  function entryEl(t) { try { var el = t && t.closest ? t.closest('[onclick]') : null; return (el && ENTRY_RE.test(el.getAttribute('onclick') || '')) ? el : null; } catch (e) { return null; } }
  function capBlock(ev, why) { if (!shouldBlock()) return false; try { ev.preventDefault(); ev.stopImmediatePropagation(); ev.stopPropagation(); } catch (e) {} blockNow(why); return true; }
  try {
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('click', function (ev) { if (entryEl(ev.target)) capBlock(ev, 'click'); }, true);
      document.addEventListener('keydown', function (ev) { try { var t = ev.target; if (t && t.id === 'inp' && ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing && ev.keyCode !== 229) capBlock(ev, 'enter'); } catch (e) {} }, true);
    }
  } catch (e) {}
  (function tryWrap(n) { if (wrapG() || n > 60) return; setTimeout(function () { tryWrap(n + 1); }, 500); })(0);

  /* ---------- ページを開いて 4 秒後に 1 回だけ測る（読むだけ） ---------- */
  function measureNow() {
    if (killed()) return null;
    var id = curId(); if (!id) return null;
    var F = W.__v292Dfix697; if (!F || typeof F.canonicalString !== 'function') return null;
    var c = null;
    try { if (typeof F.projectionV2 === 'function') c = F.projectionV2(id); } catch (e) { c = null; }
    try { if (!c && typeof F.projection === 'function') { var c1 = F.projection(); if (c1 && String(c1.id) === id) c = c1; } } catch (e2) { c = null; }
    if (!c) return null;
    var str; try { str = F.canonicalString(c); } catch (e3) { return null; }
    var m = measureStr(str); record(id, m, 'load');
    st.loadMeasure = { level: m.level, pct: pct(m.ratio) };
    return m;
  }
  try { if (typeof setTimeout === 'function' && typeof document !== 'undefined') setTimeout(function () { try { measureNow(); } catch (e) { st.err++; } }, 4000); } catch (e) {}

  W.__v292DfixSTORYSIZE1 = { VER: VER, send: send, measureStr: measureStr, measureNow: measureNow, utf8Bytes: utf8Bytes, levelOf: levelOf,
    LIMITS: { LIMIT_BYTES: LIMIT_BYTES, LIMIT_CHARS: LIMIT_CHARS, WARN_RATIO: WARN_RATIO, DANGER_RATIO: DANGER_RATIO, HARD_BYTES: HARD_BYTES },
    status: function () { var o = JSON.parse(JSON.stringify(st)); o.ver = VER; o.killed_now = killed(); o.cur = curId(); var s = stateOf(o.cur);
      o.curState = s ? { level: s.level, pct: pct(s.ratio), chars: s.chars, bytes: s.bytes, server: s.server ? s.server.code : null } : null; o.showing = !!$(ID); return o; } };
})();
