// === v292Dfix54: gender-aware first-person pronoun consistency ===
//
// Problem (observed in v292Dfix53 live):
//   Female-locked character (e.g. カエデ・20歳女子大学生) emitted "俺" in dialogue:
//     カエデ: 大丈夫。俺がいるから
//   Hermes 4 405B borrows masculine first-person under strong "protect" framing.
//
// Fix layers:
//   (1) System prompt addendum via Planner._extensions
//       → injects per-character gender→pronoun guidance.
//   (2) Output sanitizer via Planner._parseExtensions (runs late)
//       → detects female speaker + masculine first-person in their attributed
//         speech and rewrites quietly. Honors ボーイッシュ / 男っぽい / 男言葉 /
//         俺っ娘 etc. as opt-out keywords on the character's desc/personality.
//   (3) NPC gender persistence sanity check
//       → S.cast.npcs[i].gender is already saved by v108g; this patch adds a
//         best-effort backup mirror to chr6_v292Dfix54_genderMap_<slot> so the
//         info survives across export/import edge cases.
//
// Independent IIFE. No setInterval. No Planner.build wrap. No __state alias.
// Idempotent via window.__v292Dfix54Active.
(function v292Dfix54(){
  'use strict';

  if (window.__v292Dfix54Active) return;
  window.__v292Dfix54Active = true;

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------
  var TAG = '[v292Dfix54]';
  var BOYISH_KEYWORDS = [
    'ボーイッシュ', 'ボーイッシュ系', '男っぽい', '男言葉', '男口調',
    '俺っ娘', 'オレっ娘', 'オレっ子', 'ぼくっ娘', 'ボクっ娘',
    '男装', '中性的', 'トムボーイ', '雄っぽ', 'おとこ言葉'
  ];

  // Female natural first-persons (kept as-is when seen).
  // Masculine pronouns to fix when speaker is female and not boyish:
  //   俺 / 俺たち / 俺ら / 僕 / 僕たち / 僕ら / ぼく / オレ / オイラ / わし
  // For male speakers we don't auto-fix anything (personality variance is broad).

  // ---------------------------------------------------------------------------
  // Cast helpers
  // ---------------------------------------------------------------------------
  function getStateRef(){
    try {
      if (typeof S !== 'undefined' && S) return S;
    } catch(_){}
    try {
      if (typeof window !== 'undefined' && window.S) return window.S;
    } catch(_){}
    return null;
  }

  function getCastInfo(){
    var st = getStateRef();
    if (!st || !st.cast) return [];
    var list = [];
    var hero = st.cast.hero;
    if (hero && hero.name){
      list.push(buildEntry(hero, true));
    }
    if (Array.isArray(st.cast.npcs)){
      st.cast.npcs.forEach(function(n){
        if (n && n.name) list.push(buildEntry(n, false));
      });
    }
    return list.filter(function(e){ return e && e.name; });
  }

  function buildEntry(c, isHero){
    var name = String(c.name || '').trim();
    if (!name) return null;
    var gender = String(c.gender || '').trim();
    var desc = String(c.desc || '').trim();
    var pers = String(c.personality || '').trim();
    var blob = (desc + ' ' + pers).toLowerCase();
    var isBoyish = BOYISH_KEYWORDS.some(function(k){
      return blob.indexOf(k.toLowerCase()) !== -1;
    });
    return {
      name: name,
      gender: gender,
      isHero: !!isHero,
      isBoyish: isBoyish,
      desc: desc,
      personality: pers
    };
  }

  function recommendedPronouns(entry){
    if (entry.isBoyish){
      return '俺 / 僕 / 私（ボーイッシュ設定により男性的一人称を許容）';
    }
    if (entry.gender === '女性'){
      return '私 / あたし / うち（年齢・性格で一貫選択。「俺」「僕」は使用しない）';
    }
    if (entry.gender === '男性'){
      return '俺 / 僕（性格で一貫選択。「私」も丁寧場面では可）';
    }
    return '（性別未設定: 序盤で選んだ一人称を最後まで一貫させる）';
  }

  // ---------------------------------------------------------------------------
  // (1) System prompt addendum
  // ---------------------------------------------------------------------------
  function buildPronounBlock(){
    var cast = getCastInfo();
    if (!cast.length) return '';
    // NOTE: avoid heavy ━━━ separators here. Past wrap-cascade issues happened
    // when multiple patches each added their own decorative borders and the
    // model started mirroring them in narrative output.
    var lines = [];
    lines.push('【一人称ガイドライン（性別→一人称）】');
    cast.forEach(function(e){
      var label = e.name + '（' + (e.gender || '性別未設定') +
                  (e.isHero ? '・主人公' : '') +
                  (e.isBoyish ? '・ボーイッシュ' : '') + '）';
      lines.push('・' + label + ': ' + recommendedPronouns(e));
    });
    lines.push('※ 同一キャラ内では一度選んだ一人称を一貫させる。守る系・命令系の強い文脈でも性別と矛盾する一人称を借用しない。');
    return lines.join('\n');
  }

  function registerSysPromptExt(){
    if (typeof Planner !== 'object' || !Planner) return false;
    if (!Array.isArray(Planner._extensions)) return false;
    // Guard against double-registration if the patch script is included twice
    // by some external loader (shouldn't happen, but defensive).
    if (Planner._extensions.some(function(fn){ return fn && fn.__v292Dfix54; })){
      return true;
    }
    var ext = function genderPronounExt(){
      try {
        return buildPronounBlock();
      } catch(e){
        console.warn(TAG, 'sys prompt ext err:', e && e.message);
        return '';
      }
    };
    ext.__v292Dfix54 = true;
    Planner._extensions.push(ext);
    return true;
  }

  // ---------------------------------------------------------------------------
  // (2) Output sanitizer
  // ---------------------------------------------------------------------------
  // Replace masculine first-person pronouns with female-appropriate ones inside
  // a span of text known to be the speech of a female non-boyish character.
  var MASC_REPLACE_RULES = [
    // 俺 family
    [/俺たち/g, '私たち'],
    [/俺ら/g,   '私たち'],
    [/俺達/g,   '私たち'],
    // 僕 family
    [/僕たち/g, '私たち'],
    [/僕ら/g,   '私たち'],
    [/僕達/g,   '私たち'],
    [/(?:ぼくたち|ボクたち|ぼくら|ボクら)/g, '私たち'],
    // Possessive / particle-attached forms (handle before bare 俺/僕 to avoid
    // collapsing 俺たち → 私 etc.)
    [/俺の/g,   '私の'],
    [/僕の/g,   '私の'],
    [/俺は/g,   '私は'],
    [/僕は/g,   '私は'],
    [/俺が/g,   '私が'],
    [/僕が/g,   '私が'],
    [/俺を/g,   '私を'],
    [/僕を/g,   '私を'],
    [/俺に/g,   '私に'],
    [/僕に/g,   '私に'],
    [/俺と/g,   '私と'],
    [/僕と/g,   '私と'],
    [/俺も/g,   '私も'],
    [/僕も/g,   '私も'],
    [/俺で/g,   '私で'],
    [/僕で/g,   '私で'],
    [/俺から/g, '私から'],
    [/僕から/g, '私から'],
    [/俺へ/g,   '私へ'],
    [/僕へ/g,   '私へ'],
    // Bare forms (last)
    [/俺/g,     '私'],
    [/僕/g,     '私'],
    [/ぼく/g,   'わたし'],
    [/ボク/g,   'わたし'],
    [/オレ/g,   'わたし'],
    [/オイラ/g, 'わたし']
  ];

  function transformSpeech(s){
    var out = s;
    for (var i = 0; i < MASC_REPLACE_RULES.length; i++){
      out = out.replace(MASC_REPLACE_RULES[i][0], MASC_REPLACE_RULES[i][1]);
    }
    return out;
  }

  function findCastByName(text, castMap){
    // Greedy longest-match: prefer "アンナマリア" over "アンナ" when both exist.
    var keys = Object.keys(castMap).sort(function(a, b){ return b.length - a.length; });
    for (var i = 0; i < keys.length; i++){
      if (text.indexOf(keys[i]) !== -1) return castMap[keys[i]];
    }
    return null;
  }

  function sanitizeFemaleSpeechLine(line, castMap){
    // Heuristic 1: "<NAME>:" or "<NAME>：" at start of line.
    var colon = line.match(/^[\s　]*([^\s「」『』:：]+)[:：]\s*(.+)$/);
    if (colon){
      var speakerName = colon[1];
      var entry = castMap[speakerName] || findCastByName(speakerName, castMap);
      if (entry && entry.gender === '女性' && !entry.isBoyish){
        var fixed = transformSpeech(colon[2]);
        if (fixed !== colon[2]){
          return { line: line.slice(0, line.length - colon[2].length) + fixed,
                   speaker: speakerName, before: colon[2], after: fixed };
        }
      }
      return null;
    }

    // Heuristic 2: Quoted speech with attribution.
    //   「俺がいる」とカエデが言った / 「...」カエデは
    var quoteMatches = [];
    var qre = /「([^「」]*)」/g;
    var m;
    while ((m = qre.exec(line)) !== null){
      quoteMatches.push({ start: m.index, end: m.index + m[0].length, inner: m[1] });
    }
    if (!quoteMatches.length) return null;

    // Look for cast name in the non-quoted segments (narration).
    var nameInLine = findCastByName(line, castMap);
    if (!nameInLine || nameInLine.gender !== '女性' || nameInLine.isBoyish) return null;

    var changed = false;
    var newLine = line.replace(/「([^「」]*)」/g, function(full, content){
      var t = transformSpeech(content);
      if (t !== content) changed = true;
      return '「' + t + '」';
    });
    if (!changed) return null;
    return { line: newLine, speaker: nameInLine.name, before: line, after: newLine };
  }

  function sanitizeTextBlock(text){
    if (typeof text !== 'string' || !text) return text;
    var cast = getCastInfo();
    if (!cast.length) return text;
    var castMap = {};
    cast.forEach(function(c){ castMap[c.name] = c; });

    var lines = text.split(/\r?\n/);
    var fixed = 0;
    var samples = [];
    for (var i = 0; i < lines.length; i++){
      var r = sanitizeFemaleSpeechLine(lines[i], castMap);
      if (r){
        lines[i] = r.line;
        fixed++;
        if (samples.length < 3){
          samples.push({ speaker: r.speaker, before: r.before, after: r.after });
        }
      }
    }
    if (fixed){
      window.__v292Dfix54FixCount = (window.__v292Dfix54FixCount || 0) + fixed;
      if (window.__v292Dfix54FixCount <= 20){
        console.warn(TAG, 'pronoun fixes:', fixed,
                     'total=' + window.__v292Dfix54FixCount,
                     'samples=', samples);
      }
      return lines.join('\n');
    }
    return text;
  }

  function registerParseExt(){
    if (typeof Planner !== 'object' || !Planner) return false;
    if (!Array.isArray(Planner._parseExtensions)) return false;
    if (Planner._parseExtensions.some(function(fn){ return fn && fn.__v292Dfix54; })){
      return true;
    }
    var ext = function genderPronounParseExt(rawResponse){
      try {
        if (typeof rawResponse === 'string'){
          return sanitizeTextBlock(rawResponse);
        }
        // OpenRouter envelope
        if (rawResponse && rawResponse.choices &&
            rawResponse.choices[0] && rawResponse.choices[0].message){
          var c = rawResponse.choices[0].message.content;
          if (typeof c === 'string'){
            var t = sanitizeTextBlock(c);
            if (t !== c) rawResponse.choices[0].message.content = t;
          }
        }
        return rawResponse;
      } catch(e){
        console.warn(TAG, 'parse ext err:', e && e.message);
        return rawResponse;
      }
    };
    ext.__v292Dfix54 = true;
    // push so we run after mind_repair and other earlier hooks
    Planner._parseExtensions.push(ext);
    return true;
  }

  // ---------------------------------------------------------------------------
  // (3) NPC gender persistence sanity mirror
  // ---------------------------------------------------------------------------
  function activeSlotId(){
    try {
      var v = localStorage.getItem('chr6_active_slot');
      return v || 'default';
    } catch(_){ return 'default'; }
  }

  function mirrorGenderMap(){
    try {
      var cast = getCastInfo();
      if (!cast.length) return;
      var dump = {};
      cast.forEach(function(c){
        dump[c.name] = {
          gender: c.gender || '',
          isHero: c.isHero,
          isBoyish: c.isBoyish
        };
      });
      var key = 'chr6_v292Dfix54_genderMap_' + activeSlotId();
      localStorage.setItem(key, JSON.stringify({
        at: Date.now(),
        map: dump
      }));
    } catch(e){
      // localStorage may be unavailable in private mode; non-fatal
    }
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  function registerAll(){
    var s1 = registerSysPromptExt();
    var s2 = registerParseExt();
    if (s1 && s2){
      console.log(TAG, 'ready (sys prompt + parse sanitizer)');
      return true;
    }
    return false;
  }

  // Try immediate registration; if Planner isn't ready yet, retry a few times.
  // Avoid setInterval: use bounded setTimeout with attempt counter.
  var attempts = 0;
  function tryBoot(){
    attempts++;
    if (registerAll()){
      mirrorGenderMap();
      // Mirror once after first turn renders too (cheap, single-shot).
      try {
        if (typeof UI === 'object' && UI && Array.isArray(UI._renderHooks)){
          var done = false;
          UI._renderHooks.push(function v292Dfix54MirrorOnce(){
            if (done) return;
            done = true;
            mirrorGenderMap();
          });
        }
      } catch(_){}
      return;
    }
    if (attempts < 20){
      setTimeout(tryBoot, 250);
    } else {
      console.warn(TAG, 'gave up after', attempts, 'attempts — Planner missing');
    }
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', tryBoot);
  } else {
    tryBoot();
  }
})();

