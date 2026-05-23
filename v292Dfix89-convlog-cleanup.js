// =====================================================================
// Chronicle TRPG — v292Dfix89: conversation-log cleanup
// ---------------------------------------------------------------------
//  ③ non-speech quote guard: drop quote-extracted "dialogue" that is
//     actually a narration construction (「X」という事実 / のような / みたいな …).
//     e.g. 「襲われた」という事実 was wrongly shown as ミリア's spoken line.
//  ④ stable ordering: sort merged dialogues by first occurrence position
//     in the narrative source so the log matches reading order and stops
//     shuffling when later turns re-extract. CONSERVATIVE: only reorders
//     when every line is locatable in the source; otherwise leaves order
//     untouched (an imperfect match can never make ordering worse).
//
//  Wraps window.__v292.dialogueLayout.extractDialogues OVER fix59's hybrid
//  extractor. Tag-sourced items (Hermes explicit <say who="">) are trusted
//  and never dropped; only quote/legacy extractions are guarded.
// =====================================================================
(function(){
  if (window.__v292Dfix89Active) return;
  window.__v292Dfix89Active = true;
  var TAG = '[v292Dfix89]';

  // High-precision: a 「quote」 immediately followed by one of these is a
  // concept/citation, not speech. Deliberately conservative — excludes
  // と言/と答/と思/と感 etc. so real (and inner) dialogue is never dropped.
  var NONSPEECH = /^(?:という(?:事実|言葉|もの|こと|名前?|概念|感覚|感じ|気持ち|思い|考え|意味|響き|噂|話|風|点|わけ|の)|といった(?:もの|こと)|のような|のように|みたいな|みたいに|的な)/;

  var QOPEN = '「『〝';
  var QCLOSE = '」』〟';

  // Locate a dialogue text inside narrative. Returns { index, nonSpeech }.
  // index = position of first occurrence (bare quote preferred), -1 if absent.
  function locate(narr, text){
    if (!text) return { index: -1, nonSpeech: false };
    for (var o = 0; o < QOPEN.length; o++){
      for (var c = 0; c < QCLOSE.length; c++){
        var needle = QOPEN.charAt(o) + text + QCLOSE.charAt(c);
        var idx = narr.indexOf(needle);
        if (idx !== -1){
          var after = narr.slice(idx + needle.length, idx + needle.length + 10);
          return { index: idx, nonSpeech: NONSPEECH.test(after) };
        }
      }
    }
    return { index: narr.indexOf(text), nonSpeech: false };
  }

  function tryWrap(){
    var dl = window.__v292 && window.__v292.dialogueLayout;
    if (!dl || typeof dl.extractDialogues !== 'function'){ setTimeout(tryWrap, 300); return; }
    if (dl.__v292Dfix89Wrapped) return;

    var prev = dl.extractDialogues;
    var wrapped = function(narrSrc, turn){
      var items;
      try { items = prev.call(this, narrSrc, turn) || []; }
      catch(e){ console.warn(TAG, 'inner err:', e && e.message); return prev.call(this, narrSrc, turn); }
      try {
        var narr = Array.isArray(narrSrc) ? narrSrc.join('\n') : String(narrSrc || '');
        var kept = [], dropped = 0, allLocated = true;
        for (var i = 0; i < items.length; i++){
          var d = items[i];
          if (!d || !d.text) continue;
          var isTag = d.source === 'v292Dfix59-tag';
          var loc = locate(narr, String(d.text));
          if (!isTag && loc.nonSpeech){ dropped++; continue; } // ③ guard
          if (loc.index === -1) allLocated = false;
          kept.push({ d: d, pos: loc.index, ord: kept.length });
        }
        // ④ position sort — only when fully locatable (safe), else keep order
        var out;
        if (allLocated && kept.length > 1){
          kept.sort(function(a,b){ return (a.pos - b.pos) || (a.ord - b.ord); });
          out = kept.map(function(x){ return x.d; });
        } else {
          out = kept.map(function(x){ return x.d; });
        }
        if (dropped > 0) console.log(TAG, 'dropped non-speech quotes:', dropped, '/ kept:', out.length, '/ sorted:', (allLocated && kept.length>1));
        return out;
      } catch(e){ console.warn(TAG, 'wrap err:', e && e.message); return items; }
    };

    dl.extractDialogues = wrapped;
    if (window.__v292.dfix15 && typeof window.__v292.dfix15.extractDialogues === 'function'){
      window.__v292.dfix15.extractDialogues = wrapped;
    }
    dl.__v292Dfix89Wrapped = true;
    console.log(TAG, 'conversation-log cleanup active (non-speech guard + position sort)');
    try { if (typeof dl.renderStream === 'function') dl.renderStream(); } catch(e){ console.warn(TAG, 're-render skipped:', e && e.message); }
  }

  tryWrap();
})();
