/* =====================================================================
 * v292DfixLAT1 — 送信ボタンを押したことが必ず画面に出る（LAT1-B・LOCAL CANDIDATE）
 *   何をするか（物語画面だけ）:
 *     「送信 ▶」「続きを書く」「やり直す」（onclick が G.submit( / G.cont( / G.retry( の要素）と、入力欄の Enter を
 *     document の capture 段で見て、
 *       (1) 押した瞬間に上の一行（#topStatus）へ「送信の準備をしています…」を出す。
 *           送信前の確認（Vault の確認・fix912 の取得・/auth/me の再確認など）で数秒かかっても、押したことが分かる。
 *       (2) その表示中にもう一度押されたら、その押下だけ止める（同じ送信を 2 本走らせない）。表示はそのまま。
 *       (3) 次のどれかで表示を手放す: 生成が始まった（送信ボタンが ⋯ になる＝UI.setLoading）／ほかの処理が #topStatus を
 *           書き換えた／お知らせ（固定表示の要素）が出た／入力なしの案内（placeholder「⬆ …」）が出た／15 秒たった。
 *           入力なしの案内が出たときだけ「送信できませんでした。もう一度押してください。」に置き換える（無言にしない）。
 *       (4) 物語の画面がまだ使えない（G が無い）／「続きを書く」「やり直す」でターンが 0 のときは、送信は始まらないので、
 *           短いお知らせを 4 秒出す（押下は止めない＝従来どおり何も起きない）。
 *   しないこと: 送信・保存・通信・storage への書き込みは 0。G / UI / Api を包まない（既存の wrapper の順番を変えない）。
 *     ほかの capture 段（fix892・Vault の送信の関門）が押下を止めたときは、こちらには届かない（何もしない）。
 *   kill: localStorage v292DfixLAT1Off='1' → 読み込み時に何もせず終わる（global も listener も作らない）。
 * ===================================================================== */
(function () {
  'use strict';
  try { if (window.localStorage.getItem('v292DfixLAT1Off') === '1') return; } catch (e) {}
  if (window.__v292DfixLAT1) return;
  try { if (/\/home(\.html)?$/i.test(location.pathname)) return; } catch (e) { return; }
  var ENTRY = /\bG\.(submit|cont|retry)\(/;
  var PEND = '送信の準備をしています…';
  var FAIL = '送信できませんでした。もう一度押してください。';
  var NOTREADY_G = 'まだ画面を準備しています。数秒後にもう一度押してください。';
  var NOTREADY_T = '「続きを書く」「やり直す」は、物語が表示されてから使えます。';
  var MAX_MS = 15000, NOTE_ID = 'v292DfixLAT1-note';
  var st = { presses: 0, pending: 0, absorbed: 0, notReady: 0, released: {}, last: null };
  var pend = null;
  function lsOff() { try { return window.localStorage.getItem('v292DfixLAT1Off') === '1'; } catch (e) { return false; } }
  function gOk() { try { return typeof G !== 'undefined' && !!G; } catch (e) { return false; } }
  function sObj() { try { return (typeof S !== 'undefined' && S) ? S : null; } catch (e) { return null; } }
  function topEl() { return document.getElementById('topStatus'); }
  function busyNow() {
    try { var b = document.getElementById('sendBtn'); if (b && b.disabled) return true; } catch (e) {}
    try { var s = sObj(); if (s && s.inFlight) return true; } catch (e) {}
    return false;
  }
  function note(msg) {
    try {
      var o = document.getElementById(NOTE_ID); if (o && o.parentNode) o.parentNode.removeChild(o);
      var d = document.createElement('div'); d.id = NOTE_ID; d.setAttribute('role', 'status'); d.setAttribute('aria-live', 'polite');
      d.setAttribute('style', 'position:fixed;left:50%;bottom:calc(96px + env(safe-area-inset-bottom));transform:translateX(-50%);max-width:88vw;z-index:99996;background:#2b3240;color:#e8eef8;border:1px solid #4a5568;border-radius:10px;padding:8px 14px;font-size:13px;line-height:1.5;font-family:system-ui,sans-serif;pointer-events:none');
      d.textContent = msg;
      (document.body || document.documentElement).appendChild(d);
      setTimeout(function () { try { if (d.parentNode) d.parentNode.removeChild(d); } catch (e) {} }, 4000);
    } catch (e) {}
  }
  function release(why, failText) {
    if (!pend) return;
    var p = pend; pend = null;
    try { clearInterval(p.iv); } catch (e) {}
    try { if (p.mo) p.mo.disconnect(); } catch (e) {}
    st.released[why] = (st.released[why] || 0) + 1; st.last = { why: why, ms: Date.now() - p.t0, name: p.name };
    try { var el = topEl(); if (el && el.textContent === PEND) { el.textContent = failText || ''; el.style.color = failText ? 'var(--err)' : 'var(--dim)'; } } catch (e) {}
  }
  function check() {
    if (!pend) return;
    if (busyNow()) return release('loading');
    var el = topEl();
    if (!el || el.textContent !== PEND) return release('status-changed');
    if (Date.now() - pend.t0 > MAX_MS) return release('timeout');
  }
  function begin(name) {
    var el = topEl(); if (!el) return;
    var inp = document.getElementById('inp');
    var ph0 = inp ? inp.getAttribute('placeholder') : null;
    pend = { name: name, t0: Date.now(), iv: null, mo: null };
    st.pending++;
    el.textContent = PEND; el.style.color = 'var(--dim)';
    pend.iv = setInterval(check, 150);
    try {
      var mine = pend;
      mine.mo = new MutationObserver(function (recs) {
        if (pend !== mine) return;
        for (var i = 0; i < recs.length; i++) {
          var r = recs[i];
          if (r.type === 'attributes' && r.target === inp) {
            var ph = inp.getAttribute('placeholder') || '';
            if (ph !== ph0 && ph.indexOf('⬆') === 0) return release('empty-input', FAIL);
          } else if (r.type === 'childList') {
            for (var j = 0; j < r.addedNodes.length; j++) {
              var n = r.addedNodes[j];
              if (n.nodeType !== 1 || n.id === NOTE_ID) continue;
              var fixed = false; try { fixed = getComputedStyle(n).position === 'fixed'; } catch (e) {}
              if (fixed && String(n.textContent || '').trim()) return release('notice');
            }
          }
        }
      });
      if (inp) mine.mo.observe(inp, { attributes: true, attributeFilter: ['placeholder'] });
      if (document.body) mine.mo.observe(document.body, { childList: true });
    } catch (e) {}
  }
  function onEntry(ev, name) {
    if (lsOff()) return;
    st.presses++;
    if (pend) {   /* 同じ押下をもう 1 本走らせない（表示はそのまま） */
      if (busyNow()) { release('loading'); return; }
      try { ev.preventDefault(); ev.stopImmediatePropagation(); ev.stopPropagation(); } catch (e) {}
      st.absorbed++; try { var el = topEl(); if (el && el.textContent !== PEND) { el.textContent = PEND; el.style.color = 'var(--dim)'; } } catch (e) {}
      return;
    }
    if (!gOk()) { st.notReady++; note(NOTREADY_G); return; }
    if (busyNow()) return;   /* 生成中はアプリ側の表示（⋯・物語を紡いでいます…）に任せる */
    if (name === 'submit') { var inp = document.getElementById('inp'); if (!inp || !String(inp.value || '').trim()) return; }   /* 入力なしの案内はアプリが出す */
    if (name === 'cont' || name === 'retry') { var s = sObj(); if (s && Array.isArray(s.turns) && s.turns.length === 0) { st.notReady++; note(NOTREADY_T); return; } }
    begin(name);
  }
  function entryName(t) {
    try { var el = t && t.closest ? t.closest('[onclick]') : null; if (!el) return null; var m = ENTRY.exec(el.getAttribute('onclick') || ''); return m ? m[1] : null; } catch (e) { return null; }
  }
  try {
    document.addEventListener('click', function (ev) { var n = entryName(ev.target); if (n) onEntry(ev, n); }, true);
    document.addEventListener('keydown', function (ev) {
      try { var t = ev.target; if (t && t.id === 'inp' && ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing && ev.keyCode !== 229) onEntry(ev, 'submit'); } catch (e) {}
    }, true);
  } catch (e) {}
  window.__v292DfixLAT1 = { ver: 'LAT1-B r1', status: function () { return { pending: !!pend, st: JSON.parse(JSON.stringify(st)) }; } };
})();
