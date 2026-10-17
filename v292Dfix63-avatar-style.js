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

/* ★fix979（P2-CSS・GPT #127-AW Local GO）: 会話ログの小さいアイコンで顔が見えにくい件の表示だけの改善。
 *   実測: PC 72px / iPhone 56px の円に、256〜384px の「頭と肩＋服」の絵を cover で入れている（実際の切り抜き無し）。
 *   顔が画像の 3〜4 割しかなく、画風 6 の暗い色で背景に溶ける。→ 会話ログの円の中だけ、顔の方へ少し寄せて明るさを補う。
 *   ・画像は作り直さない（新しい生成 0）。保存・キー・一覧・拡大表示（fix777）は触らない。
 *   ・対象は「人の顔の絵」だけ: 実画像（data:png/jpeg/webp・blob:・サーバ画像）で、fix487 の汎用ラベル（???／人影 等）でなく、
 *     外見記録（fix766・読み取りだけ）が HUMAN か、記録が無く登録キャストの名前のもの。人外・仮アイコン（SVG）・シルエットは対象外。
 *   ・目印は img の data-f979="1"（この属性が無ければ従来と同じ表示）。
 *   kill: localStorage v292Dfix979Off='1'（目印を外し、従来の表示に戻る）。調整: v292Dfix979Scale（1.0〜1.8、既定 1.15 ＝ fix982）。 */
(function v292Dfix979(){
  if (window.__v292Dfix979) return;
  var ST_ID = 'v292Dfix979-face-zoom';
  var stats = { marked: 0, skippedNonHuman: 0, skippedPlaceholder: 0 };
  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix979Off') === '1'; }
  // ★fix982 r2（GPT #127-BE）：iPhone 幅（<768px＝円 56px）だけ既定 1.15・基点 50% 30%。PC（>=768px＝円 72px）は BUNDLE12 と同じ 1.4・50% 28% のまま。
  //   境界 768px は fix63 本体の 56px／72px の切り替えと同じ。v292Dfix979Scale（1.0〜1.8）を置いた端末では、両方ともその値になる。
  function override(){ var v = parseFloat(lsg('v292Dfix979Scale')); return (isFinite(v) && v >= 1 && v <= 1.8) ? v : null; }
  function scaleSp(){ var o = override(); return o != null ? o : 1.0; }   // ★fix984（Owner 実機 10/17 11:08「まだ近すぎ」）：iPhone 幅は拡大なし＝キャラ一覧と同じ写り。明るさ・縁取りは残す
  function scalePc(){ var o = override(); return o != null ? o : 1.4; }
  function scale(){ return scaleSp(); }
  function rule(sc, org){ return '.v292-dlg-card .dlg-av img[data-f979="1"] { transform: scale(' + sc + ') !important; transform-origin: ' + org + ' !important;'
         + ' filter: brightness(1.12) contrast(1.06) !important; }'; }
  function css(){
    return '.v292-dlg-card .dlg-av { box-shadow: 0 0 0 1.5px rgba(200,190,255,.30) !important; }\n'
         + rule(scaleSp(), '50% 30%') + '\n'
         + '@media (min-width: 768px) { ' + rule(scalePc(), '50% 28%') + ' }';
  }
  function ensureStyle(){
    var el = document.getElementById(ST_ID);
    if (off()){ if (el) el.remove(); return; }
    var want = css();
    if (!el){ el = document.createElement('style'); el.id = ST_ID; el.setAttribute('data-fix', 'v292Dfix979'); (document.head || document.documentElement).appendChild(el); }
    if (el.textContent !== want) el.textContent = want;
  }
  function castNames(){
    try { var S = window.__chronicleGetState ? window.__chronicleGetState() : (window.S || null); var c = S && S.cast; if (!c) return [];
      var a = []; if (c.hero && c.hero.name) a.push(String(c.hero.name).trim()); (c.npcs || []).forEach(function(n){ if (n && n.name) a.push(String(n.name).trim()); }); return a; } catch(e){ return []; }
  }
  function resolve(name){
    var who = String(name || '').trim();
    try { var f = window.__v292Dfix197; if (f && f.canonName) who = String(f.canonName(who) || who).trim(); if (f && f.resolveVariant764) who = String(f.resolveVariant764(who) || who).trim(); } catch(e){}
    return who;
  }
  /* fix766 の記録を読むだけ（get() は使わない＝表示の経路から保存へ書き込まない） */
  function entityType(who){
    try { var A = window.__v292Dfix766; if (!A || typeof A.KEY !== 'function') return null; var k = A.KEY(); if (!k) return null;
      var o = JSON.parse(lsg(k) || 'null'); var r = o && o.entities && o.entities[who]; return r ? String(r.entityType || 'HUMAN') : null; } catch(e){ return null; }
  }
  function isRealImage(s){ return /^data:image\/(png|jpe?g|webp)/i.test(s) || /^blob:/.test(s) || /workers\.dev\/img\?/.test(s); }
  function judge(img){
    var src = img.getAttribute('src') || '';
    if (!isRealImage(src)){ stats.skippedPlaceholder++; return false; }
    var alt = img.getAttribute('alt') || ''; if (!alt) return false;
    try { var g = window.__v292Dfix487; if (g && typeof g.isGeneric === 'function' && g.isGeneric(alt)) { stats.skippedPlaceholder++; return false; } } catch(e){}
    var who = resolve(alt), t = entityType(who);
    if (t) { if (t !== 'HUMAN') { stats.skippedNonHuman++; return false; } return true; }
    return castNames().indexOf(who) >= 0;
  }
  function sweep(){
    try {
      ensureStyle();
      var imgs = document.querySelectorAll('.v292-dlg-card .dlg-av img');
      for (var i = 0; i < imgs.length; i++){
        var im = imgs[i], want = (!off() && judge(im)) ? '1' : null, has = im.getAttribute('data-f979');
        if (want && has !== '1'){ im.setAttribute('data-f979', '1'); stats.marked++; }
        else if (!want && has !== null) im.removeAttribute('data-f979');
      }
    } catch(e){}
  }
  setInterval(sweep, 1500);
  setTimeout(sweep, 300);
  window.__v292Dfix979 = { sweep: sweep, stats: function(){ return { on: !off(), scale: scale(), scaleSp: scaleSp(), scalePc: scalePc(), marked: stats.marked, skippedNonHuman: stats.skippedNonHuman, skippedPlaceholder: stats.skippedPlaceholder }; } };
})();
})();

