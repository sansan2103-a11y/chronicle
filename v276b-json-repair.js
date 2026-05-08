// v276b-json-repair.js
// 目的: v276 character-mind の JSON パース失敗を救う。
//       Hermes 4 405B はキー間のカンマを落とした不正 JSON
//       (例: "カエデ": "..." "スピカ": "...") を返すことがある。
//       これを正しい JSON に変換してから再パースする。
//
// 動作:
//   - v276 の callMindAnalysis を wrap し、HTTP レスポンス本文を一旦受けて
//     現行パースが null を返した場合のみ、JSON 修復ロジックで再試行する。
//   - 既存パスが成功した場合は素通し。
//
// ガード: window.__v276bActive

(function v276b() {
  'use strict';
  if (window.__v276bActive) return;
  window.__v276bActive = true;
  console.log('[v276b] json-repair init');

  function repair(text) {
    if (!text) return null;
    var s = String(text).trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/, '')
      .replace(/```\s*$/, '');
    var first = s.indexOf('{'), last = s.lastIndexOf('}');
    if (first >= 0 && last > first) s = s.slice(first, last + 1);

    // Step 1: standard cleanups
    var attempts = [];
    attempts.push(s.replace(/,(\s*[}\]])/g, '$1'));  // trailing comma

    // Step 2: fix missing commas between string-value→string-key boundaries
    //   "...value text。 "次のキー": ...
    //   "...value text" "次のキー": ...
    // Note: Japanese punctuation 。、！？ etc. just before quote also catches.
    var fixed = s.replace(/("\s*)("[^"]+"\s*:)/g, function (_m, before, keyPart) {
      // Only insert comma if previous quote actually closes a value (preceded by non-backslash)
      return before + ',' + keyPart;
    });
    attempts.push(fixed);
    attempts.push(fixed.replace(/,(\s*[}\]])/g, '$1'));

    // Step 3: also normalize fullwidth quotes that sometimes leak
    var fixed2 = fixed
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/,(\s*[}\]])/g, '$1');
    attempts.push(fixed2);

    // Step 4: try smarter approach — split by `"<word>":` pattern and reglue with commas
    // (only as last resort)
    try {
      var keyPattern = /"([^"\\]*(?:\\.[^"\\]*)*)"\s*:\s*"/g;
      var matches = [];
      var m;
      while ((m = keyPattern.exec(s)) !== null) {
        matches.push({ idx: m.index, key: m[1], end: keyPattern.lastIndex });
      }
      if (matches.length >= 2) {
        // Rebuild as { "key1": "v1", "key2": "v2", ... }
        var parts = [];
        for (var i = 0; i < matches.length; i++) {
          var startVal = matches[i].end;
          var endVal = (i + 1 < matches.length)
            ? matches[i + 1].idx
            : s.lastIndexOf('"');
          var rawVal = s.slice(startVal, endVal);
          // strip trailing whitespace, trailing comma, trailing quote
          var val = rawVal.replace(/\s*,?\s*$/, '');
          val = val.replace(/^/, '').replace(/"\s*$/, '');
          // escape internal quotes & newlines
          val = val.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '');
          parts.push('"' + matches[i].key + '": "' + val + '"');
        }
        attempts.push('{' + parts.join(',') + '}');
      }
    } catch (e) {}

    // Try each attempt
    for (var j = 0; j < attempts.length; j++) {
      try {
        var parsed = JSON.parse(attempts[j]);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          if (j > 0) console.log('[v276b] repaired (attempt ' + j + ')');
          return parsed;
        }
      } catch (e) { /* try next */ }
    }
    return null;
  }
  window.__v276bRepair = repair;

  // Wait for v276 to be loaded, then wrap callMindAnalysis
  function wrap() {
    if (!window.__v276 || !window.__v276.callMindAnalysis) return false;
    if (window.__v276.callMindAnalysis.__v276bWrapped) return true;
    var orig = window.__v276.callMindAnalysis;
    var wrapped = function () {
      // We can't easily intercept inside the original promise chain, so we
      // instead intercept at fetch-level by overriding fetch for the
      // OpenRouter call within this single invocation.
      var origFetch = window.fetch;
      var hijacked = false;
      window.fetch = function (url, opts) {
        if (typeof url === 'string' && url.indexOf('openrouter.ai') >= 0 &&
            opts && opts.headers && opts.headers['X-Title'] &&
            String(opts.headers['X-Title']).indexOf('v276 character-mind') >= 0) {
          hijacked = true;
          return origFetch.call(this, url, opts).then(function (res) {
            // Clone so we can read body while passing through
            return res.clone().json().then(function (json) {
              var text = ((json && json.choices && json.choices[0] &&
                           json.choices[0].message && json.choices[0].message.content) || '').trim();
              var parsed = repair(text);
              if (parsed) {
                window.__v276Mind = parsed;
                console.log('[v276b] mind updated via repair:', parsed);
              }
              // Return the original response so v276's pipeline still runs
              return res;
            }).catch(function () { return res; });
          });
        }
        return origFetch.apply(this, arguments);
      };
      return orig().finally(function () {
        if (hijacked) window.fetch = origFetch;
      });
    };
    wrapped.__v276bWrapped = true;
    window.__v276.callMindAnalysis = wrapped;
    console.log('[v276b] callMindAnalysis wrapped');
    return true;
  }

  // Try wrap repeatedly until v276 is ready
  if (!wrap()) {
    var tries = 0;
    var iv = setInterval(function () {
      if (wrap() || ++tries > 60) clearInterval(iv);
    }, 500);
  }

  // Also: if v276 already ran once and stored a failed parse, try repair on
  // the next call by hooking maybeRunMind. Simpler: do nothing extra; the
  // setItem hook がすぐに払い上げる。

  console.log('[v276b] init complete');
})();
