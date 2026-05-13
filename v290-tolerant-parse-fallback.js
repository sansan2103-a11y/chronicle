// v290-tolerant-parse-fallback.js
// Purpose: Repair Planner.parsePlan fallback when LLM returns triple-quoted or
//   escaped output. Strips """..."""」/ "'..."' wrappers and decodes \n / \" / \\
//   in narrative array elements. No prompt-side constraints added.
// Philosophy (CLAUDE_RULES): no restrictions on LLM output. Accept whatever
//   Hermes 4 returns and tolerantly post-process on the Claude side.

(function v290(){
  'use strict';
  if (window.__v290Active) return;
  window.__v290Active = true;
  var TAG = '[v290]';

  function tolerantUnescape(s) {
    if (typeof s !== 'string') return s;
    var t = s.trim();
    t = t.replace(/^"""\s*/, '').replace(/\s*"""$/, '');
    t = t.replace(/^'''\s*/, '').replace(/\s*'''$/, '');
    t = t.replace(/^\s*(narrative|narr|content|text|body|story)\s*[:：]\s*/i, '');
    t = t.replace(/^["「『'“”]+\s*/, '');
    t = t.replace(/\s*["」』'“”]+$/, '');
    t = t.replace(/\\\\/g, '__V290_BS__')
         .replace(/\\n/g, '\n')
         .replace(/\\r/g, '')
         .replace(/\\t/g, '\t')
         .replace(/\\"/g, '"')
         .replace(/\\'/g, "'")
         .replace(/__V290_BS__/g, '\\');
    return t.trim();
  }

  function looksDirty(line) {
    if (typeof line !== 'string') return false;
    if (/\\n|\\"|\\t|"""|'''/.test(line)) return true;
    if (/^\s*"\s*\\n/.test(line)) return true;
    return false;
  }

  function repairNarrativeArray(narrArr) {
    if (!Array.isArray(narrArr) || narrArr.length === 0) return narrArr;
    var anyDirty = narrArr.some(looksDirty);
    if (!anyDirty) return narrArr;
    var joined = narrArr.join('\n');
    var unescaped = tolerantUnescape(joined);
    unescaped = unescaped.replace(/(^|\n)\s*(narrative|narr|content|text|body|story)\s*[:：]\s*/gi, '$1');
    var rebuilt = unescaped.split(/\n+/).map(function(l){ return l.trim(); }).filter(function(l){ return l.length > 0; });
    if (rebuilt.length === 0) return narrArr;
    console.log(TAG, 'narrative repaired:', narrArr.length, '->', rebuilt.length, 'lines');
    return rebuilt.slice(0, 8);
  }

  function tryWrap() {
    if (typeof Planner !== 'object' || !Planner) return false;
    if (typeof Planner.parsePlan !== 'function') return false;
    if (Planner.parsePlan.__v290Wrapped) return true;
    var orig = Planner.parsePlan.bind(Planner);
    Planner.parsePlan = function(rawText, inputType) {
      var plan = orig(rawText, inputType);
      try {
        if (plan && Array.isArray(plan.narrative)) {
          plan.narrative = repairNarrativeArray(plan.narrative);
          if (plan.narrative.length === 0) plan.narrative = ['…'];
        }
      } catch (e) {
        console.warn(TAG, 'repair error (passing through):', e && e.message);
      }
      return plan;
    };
    Planner.parsePlan.__v290Wrapped = true;
    console.log(TAG, 'Planner.parsePlan wrapped (tolerant-parse-fallback)');
    return true;
  }

  if (!tryWrap()) {
    var attempts = 0;
    var id = setInterval(function(){
      if (tryWrap() || ++attempts > 20) clearInterval(id);
    }, 250);
  }

  window.__v290 = {
    version: 'v290-tolerant-1',
    tolerantUnescape: tolerantUnescape,
    looksDirty: looksDirty,
    repairNarrativeArray: repairNarrativeArray
  };
  console.log(TAG, 'tolerant-parse-fallback init');
})();
