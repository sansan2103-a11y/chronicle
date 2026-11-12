/* v292DfixSOL1-story-open-lock.js (2026-11-12 / GPT #127-SG Q9) — 物語画面が「この物語を開いている」ことを Web Lock で示す
 *
 * 物語画面（index.html?story=<id>）を開いている間、共有の Web Lock 'chronicle:story-open:<id>'（mode:'shared'）を持ち続ける。
 * HOME の「この端末の空き容量を増やす」（STORE1b）は navigator.locks.query() でこれを見て、誰かが持っている（待っている）物語には触らない。
 * ・書込 0・通信 0。localStorage は kill キー 1 本を読むだけ。
 * ・id は URL の story=（英数字だけ）。無い・形が違う・Locks API が無い ときは何もしない（STORE1b 側は Locks API が無ければ対象外にする）。
 * kill: localStorage v292DfixSOL1Off='1' → 何もしない。観測: window.__v292DfixSOL1 = { id, held }
 */
(function () {
  'use strict';
  if (window.__v292DfixSOL1) return;
  var st = { id: null, held: false, why: null };
  window.__v292DfixSOL1 = st;
  try { if (localStorage.getItem('v292DfixSOL1Off') === '1') { st.why = 'off'; return; } } catch (e) { st.why = 'ls'; return; }
  var id = null;
  try { id = new URLSearchParams(location.search).get('story'); } catch (e) { id = null; }
  if (!id || !/^[A-Za-z0-9]{1,80}$/.test(id)) { st.why = 'no-story'; return; }
  st.id = id;
  var L = null; try { L = navigator.locks; } catch (e) { L = null; }
  if (!L || typeof L.request !== 'function') { st.why = 'no-locks'; return; }
  try {
    L.request('chronicle:story-open:' + id, { mode: 'shared' }, function () {
      st.held = true;
      return new Promise(function () {});           /* ページが閉じるまで持つ（閉じればブラウザが外す） */
    }).catch(function () { st.held = false; st.why = 'request-failed'; });
  } catch (e) { st.why = 'threw'; }
})();
