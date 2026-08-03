/* ============================================================================
 * v292DfixP0-scenario-blocker : シナリオテンプレ適用の緊急封鎖（L1 / 表示 / 観測）
 * ---------------------------------------------------------------------------
 * 役割はこの4つだけ。**通常時に2本目の L2 を登録しない**（GPT裁定）。
 *   L1        : #v41-overlay 内の危険2ボタンを DOM から除去し静的説明へ置換
 *   表示      : SAFE HALT のバナー
 *   観測      : inline ガードの state / descriptor / identity を再検証
 *   fallback  : inline の selfTest が NG のときだけ L2/L2b を試す。
 *               それも失敗なら #v41-topbar-btn を閉鎖する。
 * ---------------------------------------------------------------------------
 * ★L2 の正本は index.html の inline ガード1本。ここは補助。
 * ★L1 は UX 上の除去層であり、セキュリティ境界にしない（GPT裁定）。
 * ★OFFスイッチは意図的に設けない（安全封鎖の例外）。
 * 観測: window.__v292DfixP0.status() / .rescan() / .verify()
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__v292DfixP0 && window.__v292DfixP0.__armed) return;

  var TAG = '[v292DfixP0]';
  var DANGER_SEL = '#v41-overlay [data-act="apply"], #v41-overlay [data-act="apply-to-slot"]';
  var ENTRY_SEL = '#v41-topbar-btn';
  var NOTE_MARK = 'v292p0-note';
  var MSG_L1 = 'この操作は安全上の理由により一時停止しています';
  var MSG_HALT = '公開API封鎖に失敗したため、シナリオ機能全体を停止しています。ページを再読み込みしてください。';

  var stats = { removed: 0, scans: 0, notesInserted: 0, fallbackL2: false, fallbackL2b: false, entryLocked: false };

  function log() { try { console.warn.apply(console, [TAG].concat([].slice.call(arguments))); } catch (e) {} }
  function inline() { try { return window.__v292P0 || null; } catch (e) { return null; } }

  /* ---- inline ガードの状態を「実物で」再検証する（sentinel を信用しない） ---- */
  function verify() {
    var p = inline();
    if (!p || typeof p.verify !== 'function') {
      return { present: false, descriptorOk: false, identityOk: false, effectiveOk: false, armed: false };
    }
    var r = p.verify();
    r.present = true;
    /* ★state(sentinel) を見ない。inline の isArmed() が毎回 descriptor/identity を取り直す */
    r.armed = (typeof p.isArmed === 'function') ? !!p.isArmed()
            : !!(r.descriptorOk && r.identityOk && r.effectiveOk);
    return r;
  }

  /* ---- 消えないバナー ---------------------------------------------------- */
  function banner(text) {
    try {
      if (!document.body) return;
      if (document.getElementById('v292P0-halt')) return;
      var d = document.createElement('div');
      d.id = 'v292P0-halt';
      d.setAttribute('data-v292p0', 'halt');
      d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#7a1f1f;'
        + 'color:#fff;padding:10px 14px;font-size:13px;line-height:1.5;text-align:center;'
        + 'font-family:inherit;box-shadow:0 2px 8px rgba(0,0,0,.4)';
      d.textContent = text;
      document.body.insertBefore(d, document.body.firstChild);
    } catch (e) {}
  }

  /* ======================================================================
   * L1 : 危険2ボタンを DOM から除去し、静的な説明へ置換する
   * ==================================================================== */
  function noteFor(container) {
    if (!container) return;
    /* 重複挿入しない */
    try {
      if (container.querySelector && container.querySelector('[data-' + NOTE_MARK + ']')) return;
    } catch (e) {}
    try {
      var n = document.createElement('div');
      n.setAttribute('data-' + NOTE_MARK, '1');
      n.style.cssText = 'font-size:11px;color:#e6c07b;line-height:1.5;padding:4px 0';
      n.textContent = MSG_L1;
      container.appendChild(n);
      stats.notesInserted++;
    } catch (e2) {}
  }

  function stripIn(root) {
    if (!root || !root.querySelectorAll) return 0;
    var n = 0, list, i, btn, parent;
    try { list = root.querySelectorAll(DANGER_SEL); } catch (e) { return 0; }
    for (i = 0; i < list.length; i++) {
      btn = list[i];
      parent = btn.parentNode;
      try { if (parent) { parent.removeChild(btn); n++; } } catch (e2) {}
      noteFor(parent);
    }
    return n;
  }

  function selfMatches(node) {
    if (!node || node.nodeType !== 1) return false;
    var m = node.matches || node.msMatchesSelector || node.webkitMatchesSelector;
    if (!m) return false;
    try { return !!m.call(node, DANGER_SEL); } catch (e) { return false; }
  }

  function scan() {
    stats.scans++;
    var n = 0;
    try { n += stripIn(document); } catch (e) {}
    stats.removed += n;
    return n;
  }

  var observerInstalled = false;
  var observer = null;
  function installObserver() {
    if (observerInstalled) return true;          /* ★冪等: 二重登録しない */
    try {
      if (typeof MutationObserver !== 'function') return false;
      observer = new MutationObserver(function (recs) {
        var i, j, added;
        for (i = 0; i < recs.length; i++) {
          added = recs[i].addedNodes;
          if (!added) continue;
          for (j = 0; j < added.length; j++) {
            var node = added[j];
            if (!node || node.nodeType !== 1) continue;
            /* 追加ノード自身も selector 照合する（overlay だけを見ない） */
            if (selfMatches(node)) {
              var p = node.parentNode;
              try { if (p) { p.removeChild(node); stats.removed++; } } catch (e) {}
              noteFor(p);
              continue;
            }
            stats.removed += stripIn(node);
          }
        }
      });
      /* document.body ではなく documentElement を監視（body 交換に耐える） */
      observer.observe(document.documentElement, { childList: true, subtree: true });
      observerInstalled = true;
      return true;
    } catch (e) { observer = null; observerInstalled = false; return false; }
  }

  /* ======================================================================
   * fallback : inline が NG のときだけ L2 / L2b を試し、駄目なら入口を閉鎖
   * ==================================================================== */
  function hits(e, sel) {
    var i, path, n;
    if (e && typeof e.composedPath === 'function') {
      try {
        path = e.composedPath();
        if (path && path.length) {
          for (i = 0; i < path.length; i++) {
            var nd = path[i];
            if (nd && nd.nodeType === 1) {
              var m = nd.matches || nd.msMatchesSelector || nd.webkitMatchesSelector;
              if (m) { try { if (m.call(nd, sel)) return true; } catch (e3) {} }
            }
          }
          return false;
        }
      } catch (e2) {}
    }
    n = e ? e.target : null;
    while (n && n !== document) {
      if (n.nodeType === 1) {
        var mm = n.matches || n.msMatchesSelector || n.webkitMatchesSelector;
        if (mm) { try { if (mm.call(n, sel)) return true; } catch (e4) {} }
      }
      n = n.parentNode;
    }
    return false;
  }

  function installFallbackL2() {
    try {
      document.addEventListener('click', function (e) {
        if (!hits(e, DANGER_SEL)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        log('fallback L2 blocked');
      }, true);
      stats.fallbackL2 = true;
    } catch (e) { stats.fallbackL2 = false; }
  }

  function installFallbackL2b() {
    try {
      var api = window.__v292Dfix41;
      if (!api || typeof api.applyTemplate !== 'function') return false;
      var blocked = function () { log('fallback L2b blocked'); return false; };
      Object.defineProperty(api, 'applyTemplate', {
        get: function () { return blocked; }, set: function () {},
        configurable: false, enumerable: true
      });
      Object.defineProperty(window, '__v292Dfix41', {
        get: function () { return api; }, set: function () {},
        configurable: false, enumerable: true
      });
      stats.fallbackL2b = (window.__v292Dfix41.applyTemplate === blocked);
      return stats.fallbackL2b;
    } catch (e) { return false; }
  }

  function lockEntry() {
    try {
      document.addEventListener('click', function (e) {
        if (!hits(e, ENTRY_SEL) && !hits(e, DANGER_SEL)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        banner(MSG_HALT);
        log('entry locked (SAFE HALT)');
      }, true);
      stats.entryLocked = true;
    } catch (e) {}
    banner(MSG_HALT);
  }

  /* ======================================================================
   * 起動
   * ==================================================================== */
  var booted = false;
  function boot() {
    if (booted) return;                          /* ★boot は一度だけ */
    booted = true;
    var v = verify();

    if (v.present && v.armed) {
      /* ★通常時: external は L2 を追加しない。L1 と観測だけ。 */
      log('inline ARMED - external installs L1/observation only');
    } else {
      /* inline selfTest NG → fallback を試し、駄目なら入口を閉鎖 */
      log('inline NG - trying fallback', JSON.stringify(v));
      installFallbackL2();
      var ok = installFallbackL2b();
      var v2 = verify();
      if (!(stats.fallbackL2 && (ok || (v2.descriptorOk && v2.identityOk)))) {
        lockEntry();
      }
      if (inline() && inline().state) { inline().state.safeHaltActive = true; }
    }

    scan();                                      /* ★起動時の走査は boot の1回だけ */
    try {
      /* ★pageshow は「再走査」だけ。Observer を追加登録しない */
      window.addEventListener('pageshow', function () { scan(); }, false);
    } catch (e) {}
  }

  /* ★Observer は module 読込時に1度だけ装着する（documentElement は常に存在する）。
     boot() とは責務を分ける: boot は「判定 + 起動時走査 + pageshow 登録」だけを持つ。 */
  try { installObserver(); } catch (e) {}

  if (document.readyState === 'loading') {
    try { document.addEventListener('DOMContentLoaded', boot, false); } catch (e) { boot(); }
  } else { boot(); }

  window.__v292DfixP0 = {
    __armed: true,
    status: function () {
      var v = verify();
      return {
        stats: stats,
        observerInstalled: observerInstalled,
        inlineState: (inline() && inline().state) || null,
        verify: v,
        selectors: { danger: DANGER_SEL, entry: ENTRY_SEL }
      };
    },
    rescan: scan,
    verify: verify
  };
  try { console.log(TAG, 'installed (L1/display/observation)'); } catch (e) {}
})();
