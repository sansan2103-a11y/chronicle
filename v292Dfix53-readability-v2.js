// === v292Dfix53: comprehensive readability fix (PC + mobile, all elements) ===
(function(){
  if (window.__v292Dfix53Active) return;
  window.__v292Dfix53Active = true;
  
  const STYLE_ID = 'v292Dfix53-readability-style';
  
  function injectCSS() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      /* === Baseline: high-contrast text for all elements === */
      html, body {
        color: #ececf4 !important;
      }
      
      /* All text-bearing elements */
      h1, h2, h3, h4, h5, h6,
      p, span, label, div, a,
      .dlg-text, .narr-block, .narr-block *,
      .narr-block p, .dialogue-card, .dialogue-card *,
      .ptext, .speaker, .speaker-name,
      #narrative-stream, #narrative-stream *,
      #dialogue-stream, #dialogue-stream *,
      #story, #story *,
      #convo, #convo *,
      .cta, .button, button,
      [role="button"],
      .v292-grow, .v292-grow *,
      #settingsOv, #settingsOv * {
        color: #ececf4 !important;
      }
      
      /* Inputs and textareas */
      input, textarea, select {
        color: #ececf4 !important;
        background-color: #1d1d3e !important;
      }
      
      input::placeholder, textarea::placeholder {
        color: #9999b8 !important;
        opacity: 1 !important;
      }
      
      /* Buttons */
      button, .button, [role="button"], .cta {
        color: #ececf4 !important;
      }
      
      /* Settings panel specific */
      #settingsOv {
        color: #ececf4 !important;
      }
      #settingsOv input,
      #settingsOv textarea,
      #settingsOv select,
      #settingsOv label,
      #settingsOv button,
      #settingsOv div,
      #settingsOv span,
      #settingsOv p {
        color: #ececf4 !important;
      }
      
      /* Header elements */
      header, .header, .topbar, .v15-topbar,
      header *, .header *, .topbar *, .v15-topbar * {
        color: #ececf4 !important;
      }
      
      /* Action suggest buttons */
      .suggest, .suggest-btn, [class*="suggest"] {
        color: #ececf4 !important;
      }
      
      /* Mode toggle buttons (DO/SAY/STORY) */
      .mode-btn, [data-mode], .v15-mode {
        color: #ececf4 !important;
      }
      
      /* Mobile-specific: ensure 16px font size to prevent iOS auto-zoom */
      @media (max-width: 480px) {
        input, textarea, select {
          font-size: 16px !important;
        }
        body, p, span, div, label {
          font-size: 14px;
        }
      }
    `;
    document.head.appendChild(style);
    console.log('[v292Dfix53] readability v2 CSS injected');
  }
  
  // Scrub inline color:#000 / rgb(0,0,0) styles
  function scrubInlineBlack() {
    const all = document.querySelectorAll('[style]');
    let scrubbed = 0;
    all.forEach(el => {
      const inline = el.style;
      if (inline.color) {
        const c = inline.color.toLowerCase().replace(/\s/g,'');
        if (c === '#000' || c === '#000000' || c === 'rgb(0,0,0)' || c === 'black') {
          el.style.color = '#ececf4';
          scrubbed++;
        }
      }
    });
    if (scrubbed > 0) {
      console.log('[v292Dfix53] scrubbed', scrubbed, 'inline black colors');
    }
  }
  
  injectCSS();
  scrubInlineBlack();
  
  // Re-inject on DOMContentLoaded and after delays (to handle late-loaded panels)
  if (document.readyState !== 'complete') {
    document.addEventListener('DOMContentLoaded', () => {
      injectCSS();
      scrubInlineBlack();
    });
  }
  setTimeout(() => { injectCSS(); scrubInlineBlack(); }, 500);
  setTimeout(() => { injectCSS(); scrubInlineBlack(); }, 1500);
  setTimeout(() => { injectCSS(); scrubInlineBlack(); }, 3000);
  
  // MutationObserver for dynamic elements
  if (typeof MutationObserver !== 'undefined') {
    const obs = new MutationObserver((mutations) => {
      let needsScrub = false;
      mutations.forEach(m => {
        if (m.type === 'childList' && m.addedNodes.length > 0) needsScrub = true;
        if (m.type === 'attributes' && m.attributeName === 'style') needsScrub = true;
      });
      if (needsScrub) {
        scrubInlineBlack();
        if (!document.getElementById(STYLE_ID)) injectCSS();
      }
    });
    obs.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style']
    });
  }
})();
