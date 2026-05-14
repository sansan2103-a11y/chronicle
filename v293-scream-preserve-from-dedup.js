// v293-scream-preserve-from-dedup.js
//
// Purpose: Fix the "screams/moans disappeared" regression
//   (おしんさん 2026-05-14 報告: 「以前はちゃんとあった悲鳴やうめき声が無くなってる」)
//
// Root cause:
//   v278's dedupNarrative removes "duplicate" dialogues from narrative based on
//   kana-normalized keys, comparing this turn's dialogues against the last 3 turns'.
//   Screams naturally repeat across turns (「いやぁああ」「いやああ」「ぎゃあ」) and
//   ALL normalize to nearly identical keys. So v278 strips legitimate screams
//   thinking they're spam.
//
//   v220 and v281 work hard to INJECT screams via prompts and retry — they all
//   end up stripped by v278 in post-processing.
//
// Strategy:
//   Wrap Planner.parsePlan ON TOP of v278's wrap. Sequence:
//     1. Before delegating, extract scream-like 「」 dialogues from rawText.
//     2. Call inner parsePlan (= v278's wrap, which deduplicates).
//     3. Check if any extracted screams went missing from plan.narrative.
//     4. Re-inject missing screams as their own narrative line.
//
//   This preserves v278's useful dedup for non-scream repetition (the original
//   bug v278 was fixing — repetitive "なにか……おおきいの…きてる！" type lines)
//   while protecting the screams that give §3.1 immersion realism.
//
// CLAUDE_RULES §3.1 (おしん): リアリティと没入感を最優先 — 悲鳴はその核
//
// Guard: window.__v293Active

(function v293(){
  'use strict';
  if (window.__v293Active) return;
  window.__v293Active = true;
  var TAG = '[v293]';

  // ---------- Scream classifier ----------
  // A dialogue is considered a "scream" if any of:
  //   - 3+ same vowel kana in a row (あああ, いいい, etc.) — long-scream
  //   - 2+ consecutive exclamation/question marks (!! !!! ！！)
  //   - Contains a scream lexicon word
  //   - Very short interjection (≤4 chars, kana only) — short utterances like うっ, あっ
  var VOWEL_RUN_RX = /[あいうえおぁぃぅぇぉアイウエオァィゥェォ]{3,}/;
  var EXCLAIM_RUN_RX = /[!！？?]{2,}/;
  var SCREAM_LEX_RX = /(やめて|やめろ|助けて|たすけて|痛い|いた[いー]|もう[…\.、,]|ひぃ|ぎゃ|きゃ|ひゃ|あぁ|うぅ|ぐっ|ぐぅ|ぎぃ|お願い|嫌だ|やだ|いやだ|どうして|もういや|許して)/;
  var SHORT_INTERJ_RX = /^[ぁ-んァ-ヶー…！？!?〜]{1,4}$/;

  function isScream(text) {
    if (!text) return false;
    var t = String(text).trim();
    if (!t) return false;
    if (VOWEL_RUN_RX.test(t)) return true;
    if (EXCLAIM_RUN_RX.test(t)) return true;
    if (SCREAM_LEX_RX.test(t)) return true;
    if (SHORT_INTERJ_RX.test(t)) return true;
    return false;
  }

  // Extract all 「...」 quoted dialogues from a string and return those that are screams.
  function extractScreamsFromRaw(rawText) {
    if (!rawText) return [];
    var text = String(rawText);
    var matches = text.match(/「[^「」]{1,80}」/g) || [];
    var screams = [];
    matches.forEach(function(m){
      var inner = m.replace(/^「|」$/g, '').trim();
      if (isScream(inner)) screams.push(inner);
    });
    return screams;
  }

  // Find a sensible insertion index: after the line that contains the speaker name
  // closest to where the scream appeared in rawText, or at the end.
  function findInsertIndex(narrativeArr, scream, rawText) {
    // Try to find a name nearby the scream in rawText
    var rawIdx = rawText.indexOf('「' + scream + '」');
    if (rawIdx < 0) return narrativeArr.length;
    var before = rawText.slice(Math.max(0, rawIdx - 40), rawIdx);
    var nameMatch = before.match(/([一-龯぀-ヿ々ー]{2,12})(?:[はがの、,]\s*)?「?$/);
    if (!nameMatch) return narrativeArr.length;
    var name = nameMatch[1];
    for (var i = narrativeArr.length - 1; i >= 0; i--) {
      if (String(narrativeArr[i]).indexOf(name) >= 0) return i + 1;
    }
    return narrativeArr.length;
  }

  function patchPlanner() {
    if (typeof Planner !== 'object' || !Planner || typeof Planner.parsePlan !== 'function') return false;
    if (Planner.parsePlan.__v293Wrapped) return true;
    var inner = Planner.parsePlan.bind(Planner);
    Planner.parsePlan = function(rawText, inputType) {
      var screamsInRaw = extractScreamsFromRaw(rawText);

      var plan;
      try { plan = inner(rawText, inputType); } catch(e) {
        console.warn(TAG, 'inner parsePlan threw:', e && e.message);
        throw e;
      }

      if (!plan || !Array.isArray(plan.narrative) || screamsInRaw.length === 0) {
        return plan;
      }

      // Find screams that are no longer in plan.narrative (v278 stripped them)
      var narrText = plan.narrative.join('\n');
      var missing = [];
      screamsInRaw.forEach(function(s){
        // Allow partial match for kana variations; we check if the inner text appears verbatim
        if (narrText.indexOf(s) < 0) missing.push(s);
      });

      if (missing.length === 0) return plan;

      // Re-inject missing screams. Group them by speaker name proximity if possible.
      missing.forEach(function(s){
        var idx = findInsertIndex(plan.narrative, s, rawText);
        // Reconstruct dialogue line — try to include the speaker name if it was near
        var rawIdx = rawText.indexOf('「' + s + '」');
        var line = '「' + s + '」';
        if (rawIdx >= 0) {
          var before = rawText.slice(Math.max(0, rawIdx - 40), rawIdx);
          var nameMatch = before.match(/([一-龯぀-ヿ々ー]{2,12})(?:[はがの、,]\s*)?$/);
          if (nameMatch) line = nameMatch[1] + line;
        }
        plan.narrative.splice(idx, 0, line);
      });
      console.log(TAG, 're-injected', missing.length, 'screams stripped by dedup:', missing.slice(0, 5));
      return plan;
    };
    try { Planner.parsePlan.__v293Wrapped = true; } catch(e){}
    console.log(TAG, 'Planner.parsePlan wrapped (scream preservation over v278 dedup)');
    return true;
  }

  function init() {
    patchPlanner();
    if (window.__v293Monitor) return;
    window.__v293Monitor = true;
    var n = 0;
    var iv = setInterval(function(){
      if (patchPlanner() || ++n > 60) clearInterval(iv);
    }, 500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  setTimeout(init, 500);
  setTimeout(init, 2000);
  setTimeout(init, 5000);

  window.__v293 = {
    version: 'v293-scream-preserve-1',
    isScream: isScream,
    extractScreamsFromRaw: extractScreamsFromRaw
  };
  console.log(TAG, 'v293 init: scream preservation over v278 dedup');
})();
