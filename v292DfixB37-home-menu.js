/* =====================================================================
 * v292DfixB37-home-menu.js — ホームの物語カードに「…」メニュー → 「この物語を削除」（GPT #127-HF D）
 * ---------------------------------------------------------------------
 * ・新しい削除の口は作らない。押したら既存の DL2 の確認シート（window.__v292DfixDL2.openDelete・deletestory2）を開くだけ。
 *   保護 3 件・Vault で隠した物語・パスコード付きの断り、Owner だけ（CHR_DELETE2_OWNER_ONLY → fix933 の allowed）の扱いは DL2 のまま。
 * ・「…」は DL2 が有効（active）かつ使ってよい（allowed）ときだけ出す。それ以外は出さない（従来どおり）。
 * ・カードを押したときの「選ぶ／開く」には渡さない（「…」とメニューのクリックは capture で止める）。書込 0・通信 0（DL2 が読むまで）。
 * ・980px 以下（携帯など）では B37 の「…」は出さない（GPT #127-HS）。狭い画面の削除は、既存の Vault UI の「…」メニューに足した
 *   「この物語を削除」（v292Dvault2-ui.js）から同じ DL2 の確認シートを開く。
 * kill: localStorage v292DfixB37dOff = '1'（PC の「…」と、Vault のメニューの「この物語を削除」の両方が止まる）
 * ===================================================================== */
(function () {
  'use strict';
  if (window.__v292DfixB37home) return;
  function lsg(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function off() { return lsg('v292DfixB37dOff') === '1'; }
  function D() { try { return window.__v292DfixDL2 || null; } catch (e) { return null; } }
  function on() { if (off()) return false; var d = D(); try { return !!(d && typeof d.openDelete === 'function' && d.active() && d.allowed()); } catch (e) { return false; } }
  var st = { decorated: 0, opened: 0, deletes: 0 };
  var STY = 'v292DfixB37-home-sty', MENU = 'v292DfixB37-home-menu';
  function ensureStyle() {
    if (document.getElementById(STY)) return;
    var s = document.createElement('style'); s.id = STY;
    s.textContent = '.card .cover [data-b37-more]{position:absolute;top:6px;right:6px;z-index:3;min-width:36px;min-height:32px;padding:0 8px;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:rgba(20,20,28,.72);color:#fff;font-size:18px;line-height:1;cursor:pointer}' +
      '#' + MENU + '{position:fixed;z-index:100001;background:#1b1b20;color:#f2f2f4;border:1px solid #3a3a44;border-radius:10px;padding:6px;box-shadow:0 6px 24px rgba(0,0,0,.6);min-width:180px}' +
      '#' + MENU + ' button{display:block;width:100%;text-align:left;background:transparent;border:0;color:#ffb0b0;padding:10px 12px;font-size:14px;border-radius:6px;cursor:pointer;min-height:44px}' +
      '#' + MENU + ' button:hover{background:#2a2a33}' +
      /* ★GPT #127-HS: 980px 以下ではカードの「…」は Vault UI のものだけ（削除はそのメニューの「この物語を削除」）。B37 の「…」は出さない */
      '@media (max-width:980px){.card .cover [data-b37-more]{display:none !important}#' + MENU + '{display:none !important}}';
    (document.head || document.documentElement).appendChild(s);
  }
  function closeMenu() { var m = document.getElementById(MENU); if (m && m.parentNode) m.parentNode.removeChild(m); }
  function openMenu(btn, id) {
    closeMenu(); ensureStyle();
    var m = document.createElement('div'); m.id = MENU; m.setAttribute('role', 'menu'); m.setAttribute('data-b37-menu', id);
    var del = document.createElement('button'); del.type = 'button'; del.setAttribute('role', 'menuitem'); del.setAttribute('data-b37-act', 'delete'); del.textContent = 'この物語を削除';
    m.appendChild(del);
    (document.body || document.documentElement).appendChild(m);
    try { var r = btn.getBoundingClientRect(); var w = m.offsetWidth || 180, vw = window.innerWidth || 800, vh = window.innerHeight || 600;
      var left = Math.max(8, Math.min(vw - w - 8, r.right - w)); var top = r.bottom + 4; if (top + 60 > vh) top = Math.max(8, r.top - 60);
      m.style.left = left + 'px'; m.style.top = top + 'px'; } catch (e) { m.style.right = '12px'; m.style.top = '80px'; }
    st.opened++;
  }
  function decorate() {
    var ok = on();
    var cards = document.querySelectorAll('#grid .card[data-id]');
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i], cov = c.querySelector('.cover') || c, b = cov.querySelector('[data-b37-more]');
      if (!ok) { if (b && b.parentNode) b.parentNode.removeChild(b); continue; }
      if (b) continue;
      ensureStyle();
      b = document.createElement('button'); b.type = 'button'; b.setAttribute('data-b37-more', c.getAttribute('data-id'));
      b.setAttribute('aria-label', 'この物語のメニュー'); b.setAttribute('aria-haspopup', 'menu'); b.title = 'この物語のメニュー'; b.textContent = '…';
      cov.appendChild(b); st.decorated++;
    }
    if (!ok) closeMenu();
  }
  /* capture: 「…」とメニューのクリックをカードの「選ぶ／開く」へ渡さない */
  function onClickCapture(e) {
    var t = e.target; if (!t || !t.closest) return;
    var more = t.closest('[data-b37-more]'), item = t.closest('[data-b37-act]');
    if (more) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      if (!on()) { decorate(); return; }
      var id = more.getAttribute('data-b37-more'); var cur = document.getElementById(MENU);
      if (cur && cur.getAttribute('data-b37-menu') === id) closeMenu(); else openMenu(more, id); return; }
    if (item) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      var m = document.getElementById(MENU); var sid = m ? m.getAttribute('data-b37-menu') : null; closeMenu();
      if (item.getAttribute('data-b37-act') === 'delete' && sid && on()) { st.deletes++; try { D().openDelete([String(sid)], { source: 'home-card-menu' }); } catch (e2) {} }
      return; }
    if (document.getElementById(MENU) && !t.closest('#' + MENU)) closeMenu();
  }
  if (!off()) {
    document.addEventListener('click', onClickCapture, true);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
    window.addEventListener('scroll', closeMenu, true);
    var n = 0; (function tick() { n++; try { decorate(); } catch (e) {} setTimeout(tick, n < 60 ? 500 : 2000); })();
    try { var start = function () { var g = document.getElementById('grid'); if (!g) return setTimeout(start, 300);
        new MutationObserver(function () { try { decorate(); } catch (e) {} }).observe(g, { childList: true }); };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start(); } catch (e) {}
  }
  window.__v292DfixB37home = { version: 'B37home-r1', on: on, decorate: decorate, status: function () { return { off: off(), on: on(), st: JSON.parse(JSON.stringify(st)), menu: !!document.getElementById(MENU) }; } };
})();
