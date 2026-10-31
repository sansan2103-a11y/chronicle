// =====================================================================
// Chronicle TRPG - v292DfixJMP: 「最新へ」ボタン（展開の描写・会話ログ）（Owner 要望 2026-10-31・lane JMP・bundle76-jmp-a）
// ---------------------------------------------------------------------
//   チャットアプリのように、パネルを上へさかのぼって読んでいるときだけ、パネルの下に丸い「↓」ボタンを出す。
//   押すと、そのパネルの一番下（最新）までなめらかにスクロールする。
//   ・対象: 展開の描写 = #story（#narrative-col の中）／会話ログ = #dialogue-stream（#dialogue-col の中）。PC・iPhone 共通。
//   ・出す条件: 一番下からの距離 > T（T = パネルの見えている高さ×1.5、ただし 160〜400px に収める）。
//       iPhone の会話ログ（約 187px）では ≒280px（カード 3〜4 枚）、それ以外（展開の描写・PC）は 400px
//       ＝「最新の文がもう画面に無い」くらい離れたときだけ。T×0.75 より下へ戻ったら消す（境目でちらつかない）。
//   ・置き場所: 各パネル（列）の下端・左右中央。✎ 編集（右寄せ）・カードの ✕（右上）・アイコン（左）に重ならない。
//       列の中なので入力欄（#composer）には届かない。z-index 6 ＝ 編集画面（200）・タップシート（100001）・上のバーより下。
//   ・読むだけ: 位置は scrollTop / scrollHeight / clientHeight を読むだけ。スクロールを書くのはボタンを押したときだけ。
//       保存・通信・localStorage の書き込み 0。DOM の変更は自分の <style> 1 個とボタン 2 個だけ
//       （表示の切り替えは自分のボタンの data-jmp-on 属性だけ＝class/style を変えないので、class/style を見張る既存の仕組みは反応しない）。
//       ボタンは #story / #dialogue-stream の外（列の直下）に置く＝fix295（会話ログの位置保持）の見張り対象の外。
//   ・既存のスクロール管理（fix295d の位置保持・fix326 の最下部追従・新ターンの自動スクロール）には触らない。
//       スクロールの見張りは passive・requestAnimationFrame で間引き、伝播は止めない
//       ＝ SFLTap の「スクロール直後はカードを開かない」（document の capture）もそのまま働く。
//   ・押した直後の誤タップ対策: スクロールが落ち着くまでボタンを出したまま（連打しても同じボタンに当たる＝下のカードを押さない）。
//   ・動きを減らす設定（prefers-reduced-motion: reduce）では、アニメーションなしで一気に移動。
//   ・停止: localStorage v292DfixJMPOff='1' → 何も足さない（style もボタンも作らない＝71-a と同じ DOM）。
//   ・読む口: window.__v292DfixJMP.status()
// =====================================================================
(function (root) {
  'use strict';
  var VER = 'jmp-a-20261031';
  var TAG = '[v292DfixJMP]';
  if (!root || !root.document || root.__v292DfixJMP) return;
  var off = false; try { off = root.localStorage.getItem('v292DfixJMPOff') === '1'; } catch (e) {}
  if (off) { root.__v292DfixJMP = { ver: VER, status: function () { return { ver: VER, off: true }; } }; return; }
  var d = root.document;
  var STYLE_ID = 'v292DfixJMP-style';
  var PANES = [
    { key: 'narr', col: 'narrative-col', sc: 'story', id: 'v292DfixJMP-narr' },
    { key: 'dlg', col: 'dialogue-col', sc: 'dialogue-stream', id: 'v292DfixJMP-dlg' }
  ];
  var ST = { taps: { narr: 0, dlg: 0 }, shows: { narr: 0, dlg: 0 }, placed: false, checks: 0 };
  var CSS = ''
    + '#narrative-col,#dialogue-col{position:relative}\n'
    + '.v292DfixJMP-btn{position:absolute;left:50%;bottom:12px;z-index:6;box-sizing:border-box;width:44px;height:44px;min-width:44px;min-height:44px;margin:0 0 0 -22px;padding:0;'
    +   'display:flex;align-items:center;justify-content:center;border-radius:50%;border:1px solid rgba(139,118,240,.45);'
    +   'background:rgba(236,236,244,.94);color:#17172a;box-shadow:0 2px 10px rgba(0,0,0,.55),0 0 0 1px rgba(9,9,15,.35);cursor:pointer;'
    +   '-webkit-tap-highlight-color:transparent;touch-action:manipulation;-webkit-user-select:none;user-select:none;'
    +   'opacity:0;visibility:hidden;pointer-events:none;transform:translateY(6px);transition:opacity .16s ease,transform .16s ease,visibility 0s linear .16s}\n'
    + '.v292DfixJMP-btn[data-jmp-on="1"]{opacity:1;visibility:visible;pointer-events:auto;transform:none;transition:opacity .16s ease,transform .16s ease,visibility 0s}\n'
    + 'html body .v292DfixJMP-btn{color:#17172a !important}\n'   /* the page has button{color:#ececf4 !important}: keep the dark arrow on the light disc */
    + '.v292DfixJMP-btn svg{width:22px;height:22px;display:block;pointer-events:none}\n'
    + '.v292DfixJMP-btn:hover{background:#fff}\n'
    + '.v292DfixJMP-btn:active{background:#d8d4f4}\n'
    + '.v292DfixJMP-btn:focus{outline:none}\n'
    + '.v292DfixJMP-btn:focus-visible{outline:2px solid #8b76f0;outline-offset:2px}\n'
    + '@media (max-width:760px){.v292DfixJMP-btn{bottom:10px}}\n'
    + '@media (prefers-reduced-motion: reduce){.v292DfixJMP-btn,.v292DfixJMP-btn[data-jmp-on="1"]{transition:none;transform:none}}\n';
  var SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 4v14M5.5 11.5L12 18l6.5-6.5" fill="none" stroke="#17172a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function reduced() { try { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }
  function dist(sc) { return sc.scrollHeight - sc.scrollTop - sc.clientHeight; }
  function thr(sc) { var t = Math.round((sc.clientHeight || 0) * 1.5); return Math.max(160, Math.min(400, t)); }
  function usable(sc) {   /* 見えていて、ある程度の高さがあるスクロール領域か（たたんだ会話ログ・最初の画面などでは出さない） */
    if (!sc || !sc.isConnected) return false;
    if (sc.clientHeight < 60) return false;
    try { if (!sc.getClientRects().length) return false; var cs = root.getComputedStyle(sc); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } catch (e) { return false; }
    return true;
  }

  /* ---- per-pane state ---- */
  PANES.forEach(function (P) { P.btn = null; P.scEl = null; P.on = false; P.raf = 0; P.jump = null; P.recheck = 0; });

  function setOn(P, v) {
    if (P.on === v || !P.btn) return; P.on = v;
    P.btn.setAttribute('data-jmp-on', v ? '1' : '0');   /* 自分のボタンの data 属性だけ（class / style は変えない） */
    if (v) ST.shows[P.key]++;
  }
  function update(P) {
    P.raf = 0;
    var sc = P.scEl; if (!P.btn || !sc) return;
    ST.checks++;
    if (!usable(sc)) { P.jump = null; setOn(P, false); return; }
    var dd = dist(sc), T = thr(sc);
    if (P.jump) {   /* 押した直後: 落ち着くまで出したまま（連打が下のカードへ抜けない） */
      var now = Date.now();
      if (dd <= 2 && now - P.jump.lastScroll > 280) { P.jump = null; }
      else if (now - P.jump.t0 > 1600) { P.jump = null; }
      else { setOn(P, true); if (!P.recheck) P.recheck = root.setTimeout(function () { P.recheck = 0; schedule(P); }, 150); return; }
    }
    if (P.on) { if (dd < T * 0.75) setOn(P, false); }
    else if (dd > T) setOn(P, true);
  }
  function schedule(P) {
    if (P.raf) return;
    try { P.raf = root.requestAnimationFrame(function () { update(P); }); } catch (e) { P.raf = 0; update(P); }
  }
  function onScrollOf(P) { return function () { if (P.jump) P.jump.lastScroll = Date.now(); schedule(P); }; }

  function jumpTo(P) {
    var sc = P.scEl; if (!sc) return;
    ST.taps[P.key]++;
    var j = P.jump = { t0: Date.now(), lastScroll: Date.now(), user: false };
    var top = sc.scrollHeight;   /* ブラウザが最大値に丸める */
    var smooth = !reduced();
    try {
      if (smooth && typeof sc.scrollTo === 'function' && ('scrollBehavior' in d.documentElement.style)) sc.scrollTo({ top: top, behavior: 'smooth' });
      else if (typeof sc.scrollTo === 'function') sc.scrollTo(0, top);
      else sc.scrollTop = top;
    } catch (e) { try { sc.scrollTop = top; } catch (_) {} }
    /* 途中で中身が伸びた（画像の読み込み等）ときの 1 回だけの追い込み。利用者が自分でスクロールし始めたらやめる */
    root.setTimeout(function () {
      try { if (P.jump !== j || j.user || !sc.isConnected) return; if (dist(sc) > 2) { if (typeof sc.scrollTo === 'function') sc.scrollTo(0, sc.scrollHeight); else sc.scrollTop = sc.scrollHeight; } } catch (e) {}
      schedule(P);
    }, smooth ? 900 : 120);
    schedule(P);
  }

  function makeBtn(P) {
    var b = d.createElement('button');
    b.type = 'button'; b.id = P.id; b.className = 'v292DfixJMP-btn';
    b.setAttribute('aria-label', '最新へ'); b.setAttribute('title', '最新へ'); b.setAttribute('aria-controls', P.sc);
    b.setAttribute('data-jmp-on', '0');
    b.innerHTML = SVG;
    /* マウスで押しても入力欄のフォーカス（文字カーソル）を奪わない */
    b.addEventListener('mousedown', function (ev) { try { ev.preventDefault(); } catch (e) {} });
    b.addEventListener('click', function () { try { jumpTo(P); } catch (e) { try { console.warn(TAG, 'jump err', e && e.message); } catch (_) {} } });
    return b;
  }
  function userMoved(P) { return function () { if (P.jump) P.jump.user = true; }; }

  function place() {
    var all = true;
    for (var i = 0; i < PANES.length; i++) {
      var P = PANES[i];
      var col = d.getElementById(P.col), sc = d.getElementById(P.sc);
      if (!col || !sc || !col.contains(sc)) { all = false; continue; }
      if (!P.btn) P.btn = makeBtn(P);
      if (P.btn.parentNode !== col) { P.on = false; P.btn.setAttribute('data-jmp-on', '0'); col.appendChild(P.btn); }
      if (P.scEl !== sc) {
        if (P.scEl) { try { P.scEl.removeEventListener('scroll', P.onScroll); P.scEl.removeEventListener('wheel', P.onUser); P.scEl.removeEventListener('touchstart', P.onUser); } catch (e) {} }
        P.scEl = sc; P.onScroll = P.onScroll || onScrollOf(P); P.onUser = P.onUser || userMoved(P);
        sc.addEventListener('scroll', P.onScroll, { passive: true });
        sc.addEventListener('wheel', P.onUser, { passive: true });
        sc.addEventListener('touchstart', P.onUser, { passive: true });
      }
      schedule(P);
    }
    ST.placed = all;
    return all;
  }
  function ensureStyle() {
    if (d.getElementById(STYLE_ID)) return;
    var st = d.createElement('style'); st.id = STYLE_ID; st.textContent = CSS;
    (d.head || d.documentElement).appendChild(st);
  }
  function tick() { if (d.hidden) return; place(); }

  function start() {
    ensureStyle();
    var n = 0;
    (function poll() { n++; if (place() || n > 150) return; root.setTimeout(poll, 400); })();
    /* 新しいターンで中身が伸びた（scroll イベントが出ない）・パネルの開閉・回転 → 1 秒ごとに読むだけの確認 */
    try { root.setInterval(tick, 1000); } catch (e) {}
    try { root.addEventListener('resize', function () { PANES.forEach(schedule); }, { passive: true }); } catch (e) {}
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start); else start();

  root.__v292DfixJMP = {
    ver: VER,
    status: function () {
      var o = { ver: VER, off: false, placed: ST.placed, checks: ST.checks, taps: { narr: ST.taps.narr, dlg: ST.taps.dlg }, shows: { narr: ST.shows.narr, dlg: ST.shows.dlg }, reduced: reduced() };
      PANES.forEach(function (P) { var sc = P.scEl; o[P.key] = { on: P.on, btn: !!(P.btn && P.btn.isConnected), jumping: !!P.jump, dist: sc ? Math.round(dist(sc)) : null, thr: sc ? thr(sc) : null, usable: usable(sc) }; });
      return o;
    }
  };
  try { console.log(TAG, 'loaded', VER); } catch (_) {}
})(typeof window !== 'undefined' ? window : this);
