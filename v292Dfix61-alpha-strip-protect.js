// =====================================================================
// Chronicle TRPG — v292Dfix61: protect <say>/<summary> tags from alpha-strip
// ---------------------------------------------------------------------
// 真犯人:
//   index.html line 1112 の Planner.parsePlan 内に以下のフィルタがある:
//
//     t = t.replace(/[A-Za-z][A-Za-z0-9_.]{2,}/g, '');
//
//   これは「日本語以外を弾く」目的だが、Hermes が出す <say who="..."> や
//   <summary> タグ内の "say"/"who"/"summary" を問答無用で除去してしまう。
//   結果: <say who="サクラ">…</say> → < ="サクラ">…</> (壊れた断片)
//
//   この filter は Planner._parseExtensions より前に走るため、
//   fix58/59/60 では救出不能。
//
// 対策:
//   Planner.parsePlan を wrap し、pre-process で <say>/<summary> タグを
//   private-use-area の Unicode 文字 (U+E000〜) に一時置換 →
//   元の parsePlan (alpha-strip 含む) を通過 → post-process で復元。
//
//   PUA 文字は [A-Za-z] regex にマッチせず、Chinese 简体字フィルタにも
//   マッチしない。Hermes 自身も PUA 文字を出力することは無い。
// =====================================================================
(function(){
  if (window.__v292Dfix61Active) return;
  window.__v292Dfix61Active = true;
  var TAG = '[v292Dfix61]';

  // PUA chars — alpha-strip と 简体字 filter 両方を回避
  var P_SAY_OPEN  = String.fromCharCode(0xE000);
  var P_SAY_PIPE  = String.fromCharCode(0xE001);
  var P_SAY_CLOSE = String.fromCharCode(0xE002);
  var P_SUM_OPEN  = String.fromCharCode(0xE003);
  var P_SUM_CLOSE = String.fromCharCode(0xE004);

  // <say who="X">text</say> を PUA chars に置換
  function protectSayTags(text){
    return String(text || '').replace(
      /<say\s+who="([^"]*)"\s*>([\s\S]*?)<\/say>/g,
      function(_, who, content){
        return P_SAY_OPEN + who + P_SAY_PIPE + content + P_SAY_CLOSE;
      }
    );
  }

  // <summary>text</summary> を PUA chars に置換
  function protectSummaryTags(text){
    return String(text || '').replace(
      /<summary>([\s\S]*?)<\/summary>/g,
      function(_, content){
        return P_SUM_OPEN + content + P_SUM_CLOSE;
      }
    );
  }

  // PUA chars を元のタグに復元
  function restoreSayTags(line){
    if (typeof line !== 'string') return line;
    // Full triple match: OPEN who PIPE text CLOSE → <say who="who">text</say>
    var rxFull = new RegExp(
      P_SAY_OPEN + '([^' + P_SAY_PIPE + P_SAY_CLOSE + ']*)' +
      P_SAY_PIPE + '([\\s\\S]*?)' + P_SAY_CLOSE,
      'g'
    );
    line = line.replace(rxFull, '<say who="$1">$2</say>');
    // Fallback: 残った断片を strip
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
        }
      } catch(e){
        console.warn(TAG, 'post-process err:', e && e.message);
      }

      return plan;
    };

    P.__v292Dfix61Wrapped = true;
    console.log(TAG, 'parsePlan wrapped (say/summary tags protected from alpha-strip via PUA chars)');
  }

  install();
})();
