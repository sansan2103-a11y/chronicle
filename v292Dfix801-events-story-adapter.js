/* =====================================================================
 * v292Dfix801-events-story-adapter.js
 *   3C-3B / GPT Q4（2026-09-03）: `events(sid)` 契約違反の narrow fix
 * ---------------------------------------------------------------------
 * 背景: fix670 の公開 `events(n)` は **末尾 n 件**（slot は内部 st.slotId 固定・
 *   全件 = events(Infinity)）。fix792:417 / fix793:397 は `events(slotId)` と
 *   story id を渡していたため `slice(NaN)`≡`slice(0)` で偶然全件が返っていた
 *   （数値形 sid なら件数に誤解釈される）。
 * GPT 裁定 Q4: shared `events()` API は変えない。story-scoped adapter
 *   `eventsForStory(sid)` を置き、fix792 / fix793 の 2 caller だけ差し替える。
 *   偶然の 78/78 を契約として利用しない。
 * ---------------------------------------------------------------------
 * 実装: fix789 `readRawEvents(slotId)` と同型（indexedDB.open('chr6mem') を
 *   version 指定無しで開く・upgrade は起こさない・`events` store を getAll →
 *   `r.slotId === sid` で filter）→ fix670 `sortForRead` と同じキー順
 *   （sourceTurnIndex → spanOrder → ordinal）で安定ソートして返す Promise。
 *   ★引数 sid が authority（fix670 内部 st.slotId に依存しない）。
 *   ★fail-open: 例外 / IDB 不在 / store 不在 / sid 空 → `[]`（throw しない）。
 *   ★chr6mem は **読むだけ**（readonly・書込 0）。localStorage 書込 0。timer 0。
 * ===================================================================== */
(function () {
  'use strict';
  var BUILD = '20260903-fix801';
  var DB = 'chr6mem', STORE = 'events';

  function sortForRead(a) {
    return (a || []).slice().sort(function (x, y) {
      if ((x.sourceTurnIndex | 0) !== (y.sourceTurnIndex | 0)) return (x.sourceTurnIndex | 0) - (y.sourceTurnIndex | 0);
      if ((x.spanOrder | 0) !== (y.spanOrder | 0)) return (x.spanOrder | 0) - (y.spanOrder | 0);
      return (x.ordinal | 0) - (y.ordinal | 0);
    });
  }

  function readEventsForStory(sid) {
    return new Promise(function (res) {
      var q;
      try {
        if (!window.indexedDB || typeof window.indexedDB.open !== 'function') return res([]);
        q = window.indexedDB.open(DB);
      } catch (e) { return res([]); }
      q.onupgradeneeded = function () { try { q.transaction.abort(); } catch (e) {} };
      q.onsuccess = function () {
        var db = q.result;
        try {
          if (!db || !db.objectStoreNames || !db.objectStoreNames.contains(STORE)) { try { db && db.close(); } catch (e) {} return res([]); }
          var tx = db.transaction([STORE], 'readonly');
          var g = tx.objectStore(STORE).getAll();
          g.onsuccess = function () {
            var rows = (g.result || []).filter(function (r) { return !!r && r.slotId === sid; });
            try { db.close(); } catch (e) {}
            res(sortForRead(rows));
          };
          g.onerror = function () { try { db.close(); } catch (e) {} res([]); };
        } catch (e) { try { db && db.close(); } catch (e2) {} res([]); }
      };
      q.onerror = function () { res([]); };
      q.onblocked = function () { res([]); };
    });
  }

  function eventsForStory(sid) {
    var s = (sid == null) ? '' : String(sid);
    if (!s) return Promise.resolve([]);
    try { return readEventsForStory(s).catch(function () { return []; }); }
    catch (e) { return Promise.resolve([]); }
  }

  window.__v292Dfix801 = {
    BUILD: BUILD,
    eventsForStory: eventsForStory,
    __test: { sortForRead: sortForRead }
  };
})();
