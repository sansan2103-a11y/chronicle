// === v292Dfix52 ===
// Mobile readability fix: improve text contrast, font-size, and placeholder visibility.
// Baseline (v292Dfix51): .dlg-text / .narr-block p / #inp had color rgb(0,0,0) on
// rgb(23,23,42) — WCAG contrast 1.19:1 (effectively invisible). .ptext was rgb(104,104,160)
// on near-black — 3.65:1 (below WCAG AA). Placeholder rgb(117,117,117) — ~3.2:1.
// This patch injects a CSS layer that pushes body/dialog/narrative text to ~#ececf4
// (contrast ~15:1) and bumps font-size to >= 16px on mobile so iOS does not auto-zoom.
// Guarded by window.__v292Dfix52Active to avoid double-injection (cf. fix12–51).
(function v292Dfix52(){
  'use strict';
  if (window.__v292Dfix52Active) return;
  window.__v292Dfix52Active = true;

  var STYLE_ID = 'v292Dfix52-readability-style';
  var css = [
    '/* v292Dfix52: readability layer */',
    '#content-cols p, .narr-block p, .narr-block, .narr-text, .story-card p {',
    '  color: #ececf4 !important;',
    '  font-size: 16px !important;',
    '  line-height: 1.85 !important;',
    '  font-weight: 400 !important;',
    '  opacity: 1 !important;',
    '  text-shadow: none !important;',
    '}',
    '.ptext, .narr-block .ptext, .story-card .ptext {',
    '  color: #ececf4 !important;',
    '  opacity: 1 !important;',
    '  text-shadow: none !important;',
    '}',
    '.dlg-text {',
    '  color: #ececf4 !important;',
    '  font-size: 15px !important;',
    '  line-height: 1.65 !important;',
    '  font-weight: 400 !important;',
    '  opacity: 1 !important;',
    '  text-shadow: none !important;',
    '}',
    '.dlg-name {',
    '  color: #c5b3ff !important;',
    '  font-size: 12px !important;',
    '  font-weight: 700 !important;',
    '  opacity: 1 !important;',
    '}',
    '.col-hdr-sub {',
    '  color: #b0b0d8 !important;',
    '  opacity: 0.95 !important;',
    '}',
    '#inp, textarea#inp, input#inp {',
    '  color: #ececf4 !important;',
    '  font-size: 16px !important;',
    '  line-height: 1.5 !important;',
    '}',
    '#inp::placeholder, textarea::placeholder, input::placeholder {',
    '  color: #9ea0c4 !important;',
    '  opacity: 1 !important;',
    '}',
    '.mdbtn {',
    '  color: #d8d8ee !important;',
    '  font-size: 13px !important;',
    '  font-weight: 700 !important;',
    '  opacity: 1 !important;',
    '}',
    '.mdbtn.active, .mdbtn[aria-selected="true"], .mdbtn.is-active {',
    '  color: #ffffff !important;',
    '}',
    '.v30-topbar-btn, #v43-topbar-btn, .topbar-btn {',
    '  color: #e2e2f0 !important;',
    '  font-size: 13px !important;',
    '  font-weight: 600 !important;',
    '}',
    'button.send, button#send, .send-btn, [data-role="send"] {',
    '  color: #ffffff !important;',
    '  font-weight: 700 !important;',
    '}',
    '.mbadge { color: #ffd9a0 !important; font-weight: 700 !important; }',
    '.mbadge.STORY { color: #ffe0a8 !important; }',
    '.mbadge.DO    { color: #ffc4a0 !important; }',
    '.mbadge.SAY   { color: #a0d8ff !important; }',
    '.suggbtn, .chip-btn, button.chip, .v292-chip {',
    '  color: #e6e6f4 !important;',
    '  font-weight: 600 !important;',
    '}',
    '@media (max-width: 480px) {',
    '  #content-cols p, .narr-block p, .narr-block, .ptext {',
    '    font-size: 17px !important;',
    '    line-height: 1.95 !important;',
    '  }',
    '  .dlg-text { font-size: 16px !important; line-height: 1.7 !important; }',
    '  .dlg-name { font-size: 13px !important; }',
    '  #inp, textarea#inp { font-size: 16px !important; }',
    '  .mdbtn          { font-size: 14px !important; }',
    '  .v30-topbar-btn, #v43-topbar-btn { font-size: 12px !important; }',
    '  .col-hdr-sub    { font-size: 11px !important; }',
    '}'
  ].join('\n');

  function inject() {
    var existing = document.getElementById(STYLE_ID);
    if (existing) existing.remove();
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.setAttribute('data-fix', 'v292Dfix52');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject, { once: true });
  } else {
    inject();
  }

  try {
    var obs = new MutationObserver(function(){
      if (!document.getElementById(STYLE_ID)) inject();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    window.__v292Dfix52 = { reinject: inject, observer: obs };
  } catch (e) { /* MutationObserver unavailable */ }
})();
