// v292Dfix61 v3: capture summary then REMOVE it, protect say tags only
(function(){
  if (window.__v292Dfix61Active) return;
  window.__v292Dfix61Active = true;
  var TAG = '[v292Dfix61]';

  var P_SAY_OPEN  = String.fromCharCode(0xE000);
  var P_SAY_PIPE  = String.fromCharCode(0xE001);
  var P_SAY_CLOSE = String.fromCharCode(0xE002);

  function getStateLocal(){
    try {
      var S = (0, eval)('typeof S !== "undefined" ? S : null');
      if (S) return S;
    } catch(e){}
    if (window.S) return window.S;
    return null;
  }

  function captureSummary(rawText){
    if (!rawText || typeof rawText !== 'string') return null;
    try {
      var m = rawText.match(/<summary>([\s\S]*?)<\/summary>/);
      if (m){
        var summary = (m[1] || '').trim();
        if (summary){
          var state = getStateLocal();
          if (state){
            state.rollingSummary = summary;
            try {
              if (typeof state.save === 'function') state.save();
            } catch(e){}
            console.log(TAG, 'rollingSummary captured (' + summary.length + ' chars)');
            return summary;
          }
        }
      }
    } catch(e){
      console.warn(TAG, 'captureSummary err:', e && e.message);
    }
    return null;
  }

  // Remove <summary>...</summary> entirely (content captured separately)
  function stripSummaryTags(text){
    return String(text || '').replace(/<summary>[\s\S]*?<\/summary>/g, '');
  }

  function protectSayTags(text){
    return String(text || '').replace(
      /<say\s+who="([^"]*)"\s*>([\s\S]*?)<\/say>/g,
      function(_, who, content){
        return P_SAY_OPEN + who + P_SAY_PIPE + content + P_SAY_CLOSE;
      }
    );
  }

  function restoreSayTags(line){
    if (typeof line !== 'string') return line;
    var rxFull = new RegExp(
      P_SAY_OPEN + '([^' + P_SAY_PIPE + P_SAY_CLOSE + ']*)' +
      P_SAY_PIPE + '([\\s\\S]*?)' + P_SAY_CLOSE,
      'g'
    );
    line = line.replace(rxFull, '<say who="$1">$2</say>');
    line = line.split(P_SAY_OPEN).join('');
    line = line.split(P_SAY_PIPE).join('');
    line = line.split(P_SAY_CLOSE).join('');
    return line;
  }

  function install(){
    var P = window.Planner || null;
    try {
      if (!P) P = (0, eval)('typeof Planner !== "undefined" ? Planner : null');
    } catch(e){}
    if (!P || typeof P.parsePlan !== 'function'){
      setTimeout(install, 200);
      return;
    }
    if (P.__v292Dfix61Wrapped) return;

    var orig = P.parsePlan;
    P.parsePlan = function(rawText, mode){
      // 1. Capture summary into state.rollingSummary
      try { captureSummary(rawText); } catch(e){}

      // 2. Strip summary entirely + protect say tags
      var protectedText = rawText;
      try {
        protectedText = stripSummaryTags(rawText);
        protectedText = protectSayTags(protectedText);
      } catch(e){
        console.warn(TAG, 'pre-process err:', e && e.message);
        protectedText = rawText;
      }

      // 3. Run original parsePlan (with alpha-strip)
      var plan = orig.call(this, protectedText, mode);

      // 4. Restore say tags in plan.narrative
      try {
        if (plan && Array.isArray(plan.narrative)){
          plan.narrative = plan.narrative.map(restoreSayTags);
        }
      } catch(e){
        console.warn(TAG, 'post-process err:', e && e.message);
      }

      return plan;
    };

    P.__v292Dfix61Wrapped = true;
    console.log(TAG, 'parsePlan wrapped v3 (summary captured/stripped + say tags protected)');
  }

  install();
})();
