// === v292Dfix63 ===
// Avatar icon display improvement: enlarge dialogue-card avatars and shift the
// crop focal point to the upper half so faces (which sit near the top of the
// Pollinations-generated portrait) are no longer clipped.
//
// Baseline (v292Dfix62, observed live on iPhone & PC):
//   .dlg-av { width:40px; height:40px; border-radius:50%; overflow:hidden; }
//   .dlg-av img { object-fit: cover; object-position: 50% 50%; }
//   -> tiny circle, face cropped because portraits put heads near the top.
//
// Fix:
//   - Mobile: 56x56  (default)
//   - Tablet/PC (>=768px): 72x72
//   - object-position: 50% 22% (slightly above true center to favor the face)
//   - Same border-radius: 50%, overflow:hidden, flex-shrink:0
//
// Guarded by window.__v292Dfix63Active. Uses MutationObserver to re-inject the
// style tag if any later patch wipes <head> (matching the v292Dfix52 pattern).
(function v292Dfix63(){
'use strict';
if (window.__v292Dfix63Active) return;
window.__v292Dfix63Active = true;

var STYLE_ID = 'v292Dfix63-avatar-style';
var css = [
'/* v292Dfix63: dialogue-card avatar size + crop focal point */',
'.dlg-av {',
' width: 56px !important;',
' height: 56px !important;',
' flex: 0 0 56px !important;',
' min-width: 56px !important;',
' min-height: 56px !important;',
' border-radius: 50% !important;',
' overflow: hidden !important;',
' background: #2a2a3a !important;',
' display: flex !important;',
' align-items: center !important;',
' justify-content: center !important;',
'}',
'.dlg-av img {',
' width: 100% !important;',
' height: 100% !important;',
' object-fit: cover !important;',
' object-position: 50% 22% !important;',
' display: block !important;',
'}',
'@media (min-width: 768px) {',
' .dlg-av {',
'   width: 72px !important;',
'   height: 72px !important;',
'   flex: 0 0 72px !important;',
'   min-width: 72px !important;',
'   min-height: 72px !important;',
' }',
'}'
].join('\n');

function inject() {
var existing = document.getElementById(STYLE_ID);
if (existing) existing.remove();
var style = document.createElement('style');
style.id = STYLE_ID;
style.setAttribute('data-fix', 'v292Dfix63');
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
window.__v292Dfix63 = { reinject: inject, observer: obs };
} catch (e) { /* MutationObserver unavailable */ }

setTimeout(inject, 200);
setTimeout(inject, 800);
setTimeout(inject, 2000);
})();

