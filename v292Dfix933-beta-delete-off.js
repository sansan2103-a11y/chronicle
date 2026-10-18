/* =====================================================================
 * v292Dfix933-beta-delete-off.js — 招待テスト中、owner 以外のアカウントには物語の削除を使わせない
 *   GPT #127-DL / #127-DM（S2_FULL_FIX_BEFORE_FIRST_INVITE = 不要、ただし招待者の削除 UI を無効化し、
 *   削除できたと誤認させる表示を出さない場合のみ GO。Owner の画面は今のまま）
 * ---------------------------------------------------------------------
 * 背景: S-2（acct: の削除がサーバーへ届かない）が未修正。招待者が消しても他の端末やクラウドから戻り得る。
 * やること（pages.dev のアカウント方式のときだけ）:
 *   1. 判定: window.__v292Dfix893.me() の entitlement（/auth/me か保存済みの印）。'owner' のときだけ削除を許す。
 *      それ以外（beta / paid / まだ分からない）は「削除しない」（fail-closed）。
 *   2. 表示: 削除ボタンを出さない（CSS）。home の #delBtn、ゲーム画面のスロット一覧の「削除」、
 *      ギャラリーの「セーブを削除」。代わりに home の詳細欄へ 1 行の案内を出す。
 *   3. 入口の裏打ち: window.__chronicleStoryLifecycle.requestDelete を包み、owner 以外は何も消さずに
 *      { ok:false, code:'DELETE_DISABLED_IN_TEST' } を返す（fix577・gallery・features・home の全経路が
 *      ここを通る〔fix577 の設計〕）。ボタンが見えてしまった場合も、消えたと誤認させる表示は出ない
 *      （home は「削除できませんでした。データはそのまま残っています」を出す）。
 * やらないこと: サーバー側の禁止（API での削除禁止は別問題・一般公開の完成条件とは区別）、owner の動作の変更、
 *   ストレージの書込、ネットワーク（/auth/me は fix893 が既に取っている値を読むだけ）。
 * OFF（QA 用）: localStorage v292Dfix933Off = '1'
 * 観測口: window.__v292Dfix933.status()
 * ===================================================================== */
(function () {
  'use strict';
  if (window.__v292Dfix933) return;
  var LS = null; try { LS = window.localStorage; } catch (e) {}
  function lsGet(k) { try { return LS ? LS.getItem(k) : null; } catch (e) { return null; } }
  if (lsGet('v292Dfix933Off') === '1') return;
  var onPages = false; try { onPages = location.protocol === 'https:' && /\.pages\.dev$/.test(location.hostname); } catch (e) {}
  if (!onPages && location.hostname !== '127.0.0.1' && location.hostname !== 'localhost') return;

  var NOTE = 'テスト期間中は物語の削除を使えません。作った物語は保存されたままです。';
  var st = { wrapped: false, refused: 0, ent: null, cssOn: false, noteShown: 0 };

  function ent() {
    try {
      var A = window.__v292Dfix893;
      var m = (A && typeof A.me === 'function') ? A.me() : null;
      var e = m ? (m.entitlement || m.ent || null) : null;
      st.ent = e ? String(e) : null;
      return st.ent;
    } catch (x) { st.ent = null; return null; }
  }
  function allowed() { return ent() === 'owner'; }

  /* 2. 表示（owner 以外は隠す。判定が owner に変われば外す） */
  var STYLE_ID = 'v292Dfix933-style';
  function applyCss() {
    var want = !allowed();
    var el = document.getElementById(STYLE_ID);
    if (want && !el) {
      el = document.createElement('style'); el.id = STYLE_ID;
      el.textContent = '#delBtn, .v30-btn-danger[data-act="clear"], .v310-menu .v30-btn-danger { display: none !important; }';
      (document.head || document.documentElement).appendChild(el);
    } else if (!want && el) { el.parentNode.removeChild(el); }
    st.cssOn = want;
    if (want) note();
  }
  function note() {
    try {
      var b = document.getElementById('delBtn');
      if (!b || !b.parentNode || b.parentNode.querySelector('.v933-note')) return;
      var d = document.createElement('div'); d.className = 'v933-note mini';
      d.setAttribute('style', 'color:var(--dim,#8a8f98);font-size:12px;line-height:1.6;margin-top:6px');
      d.appendChild(document.createTextNode(NOTE));
      b.parentNode.appendChild(d); st.noteShown++;
    } catch (e) {}
  }

  /* 3. 入口の裏打ち */
  function wrap() {
    var svc = null; try { svc = window.__chronicleStoryLifecycle; } catch (e) {}
    if (!svc || typeof svc.requestDelete !== 'function') return false;
    if (svc.requestDelete.__v933) { st.wrapped = true; return true; }
    var orig = svc.requestDelete;
    var w = function (id, opts) {
      if (!allowed()) {
        st.refused++;
        try { console.warn('[v292Dfix933] delete refused (entitlement=' + st.ent + ')'); } catch (e) {}
        return Promise.resolve({ ok: false, code: 'DELETE_DISABLED_IN_TEST', message: NOTE });
      }
      return orig.apply(this, arguments);
    };
    w.__v933 = true; w.__orig = orig;
    try { svc.requestDelete = w; } catch (e) { return false; }
    st.wrapped = svc.requestDelete === w; return st.wrapped;
  }

  var n = 0;
  (function tick() {
    n++;
    try { wrap(); } catch (e) {}
    try { applyCss(); } catch (e) {}
    if (n < 600) setTimeout(tick, n < 100 ? 100 : 1000);   /* 最初の 10 秒は 0.1 秒ごと、その後 1 秒ごと（約 8 分）。判定の変化と home の再描画に追従 */
  })();
  try { document.addEventListener('DOMContentLoaded', function () { try { wrap(); applyCss(); } catch (e) {} }); } catch (e) {}

  window.__v292Dfix933 = { status: function () { ent(); return { ent: st.ent, allowed: st.ent === 'owner', wrapped: st.wrapped, cssOn: st.cssOn, refused: st.refused, noteShown: st.noteShown }; } };
})();
