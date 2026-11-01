/* =====================================================================
 * v292DfixSETAV1-settings-avatar.js — 設定の「キャラ」タブで、Asset v2 の物語の主人公・NPC の絵が「?」になる件（表示だけ）
 * ---------------------------------------------------------------------
 * 原因: index.html の設定の主人公カード（#heroAvSettings .v100-img）と NPC の行（.npc-card .v100-npc-img）は、
 *   古い cast.hero.avatar / npc.avatar があるときだけ <img alt="名前"> を作り、無ければ「?」の文字だけを置く。
 *   Asset v2（schema2）の物語では avatar が無いので <img> が無く、v292Dav2-portrait.js の applyImg（.v100-clean / .npc-card の
 *   <img alt> に絵を入れる）が入れる先を持たない。81 が原因ではない（Owner 報告 2026-11-01 12:47・統括が本番 PC で確認）。
 * 直し: schema2 の物語で、その欄に <img> が無いときだけ、<img alt="名前"> を 1 つ入れる（名前は欄に出ている表示名・属性として設定）。
 *   絵を入れるのは従来どおり v292Dav2-portrait.js の applyImg（と LD1）。絵が無いキャラは applyImg の仮の絵（頭文字）になる。
 *   data-av2-inert・隠した ⟳ はそのまま（index.html の処理を変えない）。schema2 でない物語では何もしない（従来の「?」のまま）。
 *   通信・保存・生成・localStorage への書き込みは 0。
 * kill: localStorage v292DfixSETAV1Off='1' → 何もしない（81 と同じ「?」）。
 * 観測口: window.__v292DfixSETAV1.status()
 * ===================================================================== */
(function () {
  'use strict';
  if (typeof window === 'undefined' || window.__v292DfixSETAV1) return;
  var VER = 'SETAV1-20261101-bundle82';
  var BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';   /* 1px 透明（applyImg が入れ替えるまでの間、壊れた画像の印を出さない） */
  function off() { try { return localStorage.getItem('v292DfixSETAV1Off') === '1'; } catch (e) { return false; } }
  function schema2() { try { var m = window.__v292Dav2Map; return !!(m && typeof m.docSchema2 === 'function' && m.docSchema2() === true); } catch (e) { return false; } }
  var st = { ver: VER, passes: 0, hero: 0, npc: 0, skippedNotSchema2: 0, last: null };
  function put(box, name, kind) {
    if (!box || box.querySelector('img')) return false;
    name = String(name || '').trim(); if (!name) return false;
    var img = document.createElement('img');
    img.setAttribute('alt', name); img.setAttribute('data-setav1', kind); img.src = BLANK;
    while (box.firstChild) box.removeChild(box.firstChild);   /* 「?」の文字だけを外す（div と data-v100-* / data-av2-inert は残す） */
    box.appendChild(img);
    st[kind]++; st.last = { kind: kind, t: Date.now() };
    return true;
  }
  function pass() {
    st.passes++;
    if (off()) return;
    var hav = document.getElementById('heroAvSettings'), rows = document.querySelectorAll('.npc-card .v100-npc-av');
    if (!hav && !rows.length) return;
    if (!schema2()) { st.skippedNotSchema2++; return; }
    if (hav) { var nm = hav.querySelector('.v100-name'); put(hav.querySelector('.v100-img'), nm && nm.textContent, 'hero'); }
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], box = r.querySelector('.v100-npc-img'), lab = box && box.nextElementSibling;
      put(box, lab && lab.textContent, 'npc');
    }
  }
  var timer = null;
  function soon() { if (timer) return; timer = setTimeout(function () { timer = null; try { pass(); } catch (e) {} }, 60); }
  function start() {
    if (off()) return;
    try { new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) { var t = muts[i].target; if (t && t.nodeType === 1 && (t.id === 'heroAvSettings' || (t.closest && (t.closest('#heroAvSettings') || t.closest('.npc-card') || t.closest('#settingsOv'))))) { soon(); return; } }
    }).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
    setInterval(function () { if (document.getElementById('heroAvSettings')) soon(); }, 2000);   /* schema2 の判定が後から決まる場合の拾い直し（欄があるときだけ） */
    soon();
  }
  window.__v292DfixSETAV1 = { status: function () { var o = JSON.parse(JSON.stringify(st)); o.off = off(); return o; }, pass: pass };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
