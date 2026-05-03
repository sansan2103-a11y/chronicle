/* v221-mobile-checkbox-fix:
   Fixes vertical character squashing on mobile in the settings panel.
   Root cause: each <label> has flex:0 1 auto + white-space:normal, and CJK
   characters have no word boundary, so when the flex parent narrows on a
   ~360px mobile screen, each label gets character-broken into a vertical
   stack ("ホ/ラ/ー/全/般").

   Fix:
   1. Inject CSS that forces:
      - All labels in #settingsOv (and other settings overlay containers):
        white-space: nowrap, flex: 0 0 auto, max-width: 100%, overflow: visible
      - On mobile (<=480px): the parent flex containers wrap with flex-wrap: wrap
        and labels still keep nowrap; if a single label is too wide, allow
        ellipsis-free overflow with hidden parent padding
      - Radio rows (gender, age) get same treatment
   2. Apply on settings open + on resize. */
(function v221(){
  'use strict';
  if (window.__v221Active) return;
  window.__v221Active = true;

  var STYLE_ID = '__v221_mobile_checkbox_css';

  var CSS = [
    /* === Mobile UI fix for settings overlay === */
    /* Apply on all viewport sizes — labels should never break per-character */
    '#settingsOv label,',
    '#settingsOv .fld label,',
    '.settings-overlay label,',
    '#cfgGenrePresets label,',
    '#cfgVibePresets label,',
    '#cfgScenePresets label,',
    '#cfgPacePresets label,',
    '#cfgStylePresets label,',
    '#cfgRPresets label,',
    '#cfgScenePresets label {',
    '  white-space: nowrap !important;',
    '  flex: 0 0 auto !important;',
    '  word-break: keep-all !important;',
    '  overflow-wrap: normal !important;',
    '  overflow: visible !important;',
    '  text-overflow: clip !important;',
    '  max-width: none !important;',
    '  display: inline-flex !important;',
    '  align-items: center !important;',
    '  gap: 6px !important;',
    '  padding: 6px 4px !important;',
    '  line-height: 1.3 !important;',
    '}',
    /* Checkbox/radio inside labels: don't shrink */
    '#settingsOv label > input[type="checkbox"],',
    '#settingsOv label > input[type="radio"] {',
    '  flex: 0 0 auto !important;',
    '  width: 18px !important;',
    '  height: 18px !important;',
    '  margin: 0 !important;',
    '}',
    /* Parent containers that hold checkbox groups: flex-wrap wrap */
    '#cfgGenrePresets, #cfgVibePresets, #cfgScenePresets,',
    '#cfgPacePresets, #cfgStylePresets, #cfgRPresets {',
    '  display: flex !important;',
    '  flex-wrap: wrap !important;',
    '  gap: 4px 8px !important;',
    '  align-items: flex-start !important;',
    '  white-space: normal !important;',
    '}',
    /* Direct child of these preset containers, when it's a wrapper div */
    '#cfgGenrePresets > div, #cfgVibePresets > div, #cfgScenePresets > div,',
    '#cfgPacePresets > div, #cfgStylePresets > div, #cfgRPresets > div {',
    '  display: flex !important;',
    '  flex-wrap: wrap !important;',
    '  gap: 4px 8px !important;',
    '  width: 100% !important;',
    '}',
    /* Hero/NPC gender radio rows */
    '.gender-row, [class*="gender"] {',
    '  display: flex !important;',
    '  flex-wrap: wrap !important;',
    '  gap: 8px !important;',
    '  white-space: nowrap !important;',
    '}',
    /* Mobile-specific: <=480px viewport */
    '@media (max-width: 480px) {',
    '  #settingsOv {',
    '    padding: 12px 10px !important;',
    '  }',
    '  #settingsOv .fld {',
    '    margin-bottom: 12px !important;',
    '  }',
    /* On mobile, labels that are still too wide get a horizontal scroll fallback */
    '  #cfgGenrePresets, #cfgVibePresets, #cfgScenePresets,',
    '  #cfgPacePresets, #cfgStylePresets, #cfgRPresets {',
    '    max-width: 100% !important;',
    '    overflow-x: auto !important;',
    '    overflow-y: visible !important;',
    '  }',
    /* Make labels single-row stacks on mobile (1 per row OR 2 per row) */
    '  #settingsOv label {',
    '    font-size: 14px !important;',
    '    padding: 8px 4px !important;',
    '    min-height: 36px !important;',
    '  }',
    /* Larger checkbox on mobile for easier tapping */
    '  #settingsOv label > input[type="checkbox"],',
    '  #settingsOv label > input[type="radio"] {',
    '    width: 20px !important;',
    '    height: 20px !important;',
    '  }',
    /* Hero gender / NPC gender row: stack labels */
    '  .gender-row, [class*="gender"] {',
    '    flex-wrap: wrap !important;',
    '  }',
    '}',
    /* Even narrower — under 360px */
    '@media (max-width: 360px) {',
    '  #settingsOv label {',
    '    font-size: 13px !important;',
    '  }',
    '}'
  ].join('\n');

  function injectCSS(){
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
    console.log('[v221] mobile checkbox CSS injected');
  }

  /* Re-inject on settings open in case the overlay is rebuilt */
  function bindSettingsOpen(){
    document.addEventListener('click', function(e){
      var btn = e.target && e.target.closest && e.target.closest('button');
      if (!btn) return;
      var label = (btn.textContent || '').trim();
      if (/設定|Settings/.test(label)){
        setTimeout(injectCSS, 50);
        setTimeout(injectCSS, 300);
      }
    }, true);
  }

  /* Init */
  function init(){
    injectCSS();
    bindSettingsOpen();
    /* Periodically ensure CSS is present (cheap idempotent check) */
    setInterval(injectCSS, 8000);
    console.log('[v221] active: mobile UI checkbox-label fix');
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.__v221 = {
    injectCSS: injectCSS,
    CSS: CSS
  };
})();
