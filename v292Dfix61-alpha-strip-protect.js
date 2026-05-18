// v292Dfix61 v2: protect tags from alpha-strip + capture summary
(function(){
  if (window.__v292Dfix61Active) return;
  window.__v292Dfix61Active = true;
  var TAG = '[v292Dfix61]';

  var P_SAY_OPEN  = String.fromCharCode(0xE000);
  var P_SAY_PIPE  = String.fromCharCode(0xE001);
  var P_SAY_CLOSE = String.fromCharCode(0xE002);
  var P_SUM_OPEN  = String.fromCharCode(0xE003);
  var P_SUM_CLOSE = String.fromCharCode(0xE004);

  function getStateLocal(){
    try {
      var S = (0, eval)('typeof S !== "undefined" ? S : null');
      if (S) return S;
    } catch(e){}
    if (window.S) return window.S;
    try { return JSON.parse(localStorage.getItem('chr6') || '{}'); }
    catch(e){ return {}; }
  }

  function captureSummary(rawText){
    if (!rawText || typeof rawText !== 'string') return;
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
              else localStorage.setItem('chr6', JSON.stringify(state));
            } catch(e){}
            console.log(TAG, 'rollingSummary captured (' + summary.length + ' chars):', summary.slice(0, 60));
          }
        }
      }
    } catch(e){
      console.warn(TAG, 'captureSummary err:', e && e.message);
    }
  }

  function protectSayTags(text){
    return String(text || '').replace(
      /<say\s+who="([^"]*)"\s*>([\s\S]*?)<\/say>/g,
      function(_, who, content){
        return P_SAY_OPEN + who + P_SAY_PIPE + content + P_SAY_CLOSE;
      }
    );
  }

  function protectSummaryTags(text){
    return String(text || '').replace(
      /<summary>([\s\S]*?)<\/summary>/g,
      function(_, content){
        return P_SUM_OPEN + content + P_SUM_CLOSE;
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

  function restoreSummaryTags(line){
    if (typeof line !== 'string') return line;
    var rxFull = new RegExp(
      P_SUM_OPEN + '([\\s\\S]*?)' + P_SUM_CLOSE,
      'g'
    );
    line = line.replace(rxFull, '<summary>$1</summary>');
    line = line.split(P_SUM_OPEN).join('');
    line = line.split(P_SUM_CLOSE).join('');
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
      try { captureSummary(rawText); } catch(e){}

      var protectedText = rawText;
      try {
        protectedText = protectSayTags(rawText);
        protectedText = protectSummaryTags(protectedText);
      } catch(e){
        console.warn(TAG, 'pre-process err:', e && e.message);
        protectedText = rawText;
      }

      var plan = orig.call(this, protectedText, mode);

      try {
        if (plan && Array.isArray(plan.narrative)){
          plan.narrative = plan.narrative.map(function(line){
            var l = line;
            l = restoreSayTags(l);
            l = restoreSummaryTags(l);
            return l;
          });
          plan.narrative = plan.narrative.map(function(line){
            if (typeof line !== 'string') return line;
            return line.replace(/<summary>[\s\S]*?<\/summary>/g, '').trim();
          }).filter(function(line){
            return line && line.length > 0;
          });
        }
      } catch(e){
        console.warn(TAG, 'post-process err:', e && e.message);
      }

      return plan;
    };

    P.__v292Dfix61Wrapped = true;
    console.log(TAG, 'parsePlan wrapped (tags protected + summary captured)');
  }

  install();
})();
