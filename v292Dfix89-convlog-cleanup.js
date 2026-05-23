// =====================================================================
// Chronicle TRPG — v292Dfix89: conversation-log cleanup  (NO-OP STUB)
// ---------------------------------------------------------------------
//  The real fix lives in features.js, inside the LOCAL extractDialogues
//  that dialogueLayout.renderStream actually calls (Pattern C non-speech
//  guard + reading-order sort). An earlier version of this file wrapped
//  window.__v292.dialogueLayout.extractDialogues — but renderStream calls
//  the module-local function directly, so the export wrap never affected
//  the rendered log. This stub is kept only so the existing <script> tag
//  in index.html does not 404. Safe to delete with index.html in a later
//  cleanup pass.
// =====================================================================
(function(){
  if (window.__v292Dfix89Active) return;
  window.__v292Dfix89Active = true;
  console.log('[v292Dfix89] no-op stub — conversation-log fix moved into features.js extractDialogues');
})();
