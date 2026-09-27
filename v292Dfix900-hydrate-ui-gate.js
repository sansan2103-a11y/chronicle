/* ============================================================================
 * v292Dfix900 HYDRATE_UI_GATE（STORAGE_ARCHITECTURE SA-1b C3 / GPT SA-0・SA-1a 裁定）
 * ----------------------------------------------------------------------------
 * 何が起きていたか（SA-0 run4、iPhone Owner 観察「開くと一瞬ダーク幻想などが見える」）:
 *   engine は fix705 の分類（held）を待たずに boot し、正本 hydrate 前の既定 state で topbar の
 *   story 設定セレクタ（進行 / 反応 / 会話 / アイコン / 画風 / 長さ / トーン / モデル …）を描く。
 *   初回端末では doc1 held → apply → reload → doc2 held → release の間に 2 回見える。
 * やること（これだけ）:
 *   story 画面で fix705 が有効なとき、<html> に class を付けて topbar の「select を含む枠」だけを
 *   visibility:hidden にする。fix705 が release（chr:f705-released）したら外す。
 *   engine boot・読込・保存・DOM 構造・id・イベントは 1 つも変えない（表示だけ）。
 * fail-open: fix705 が stopped / error になった、または 30 秒経っても release しないときは外す
 *   （止まった画面で設定が消えたままにしない）。applied（直後に reload）の間は隠したまま。
 * 読み込み位置: index.html の fix705 の直後（head、同期）。home には入れない。
 * kill: localStorage v292Dfix900Off='1' → 何もしない。検証口: window.__v292Dfix900
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__v292Dfix900) return;
  var st = { active: false, reason: null, addedAt: null, removedAt: null, removedBy: null };
  window.__v292Dfix900 = { status: function () { return JSON.parse(JSON.stringify(st)); } };
  try {
    if (localStorage.getItem('v292Dfix900Off') === '1') { st.reason = 'KILL'; return; }
    if (!/[?&]story=/.test(location.search)) { st.reason = 'NOT_STORY_PAGE'; return; }
    var f7 = window.__v292Dfix705;
    if (!f7 || typeof f7.status !== 'function' || (typeof f7.on === 'function' && !f7.on())) { st.reason = 'F705_INACTIVE'; return; }
    var s0 = f7.status().state || {};
    if (s0.phase === 'released' || s0.phase === 'stopped') { st.reason = 'ALREADY_' + s0.phase; return; }
  } catch (e) { st.reason = 'INIT_ERROR'; return; }
  var CLS = 'chr-f900-hydrating';
  try {
    var css = document.createElement('style');
    css.id = 'v292Dfix900-style';
    css.textContent = 'html.' + CLS + ' #topbar select,' +
                      'html.' + CLS + ' #topbar span:has(> select){visibility:hidden !important;}';
    (document.head || document.documentElement).appendChild(css);
    document.documentElement.classList.add(CLS);
    st.active = true; st.addedAt = Date.now();
  } catch (e) { st.reason = 'CSS_ERROR'; return; }
  function remove(by) {
    if (!st.active) return;
    try { document.documentElement.classList.remove(CLS); } catch (e) {}
    st.active = false; st.removedAt = Date.now(); st.removedBy = by;
  }
  try { window.addEventListener('chr:f705-released', function () { remove('f705-released'); }, false); } catch (e) {}
  var t0 = Date.now();
  var iv = setInterval(function () {
    if (!st.active) { clearInterval(iv); return; }
    var ph = null;
    try { var s = window.__v292Dfix705.status().state || {}; ph = s.phase; if (s.error && ph !== 'applied') { remove('f705-error'); return; } } catch (e) { remove('f705-status-error'); return; }
    if (ph === 'released') { remove('f705-released-poll'); return; }
    if (ph === 'stopped') { remove('f705-stopped'); return; }
    if (Date.now() - t0 > 30000 && ph !== 'applied') { remove('timeout'); }
  }, 200);
})();
