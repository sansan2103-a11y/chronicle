/* v224-hangul-and-voice-fix:
   1. Strip non-Japanese chars from character names (esp. Hangul like 에 sneaking
      into カ에デ instead of カエデ).
   2. Auto-replace Hangul vowels with closest Katakana equivalent.
   3. Detect gender-mismatched dialogue (female char with masculine speech, etc.)
      and replace common ending patterns with gender-appropriate forms.
   4. Strip old-fashioned phrasing in dialogue.
   5. Add prompt rules for gender-appropriate, modern Japanese dialogue. */
(function v224(){
  'use strict';
  if (window.__v224Active) return;
  window.__v224Active = true;

  /* ============================================================ */
  /* A. Hangul → Katakana mapping for common vowel intrusions     */
  /* ============================================================ */
  var HANGUL_TO_KATAKANA = {
    '에': 'エ', '애': 'エ',  // e
    '아': 'ア', '야': 'ヤ',  // a
    '오': 'オ', '요': 'ヨ',  // o
    '우': 'ウ', '유': 'ユ',  // u
    '이': 'イ', '의': 'イ',  // i
    '카': 'カ', '커': 'カ',  // ka
    '나': 'ナ',  // na
    '사': 'サ',  // sa
    '하': 'ハ',  // ha
    '마': 'マ',  // ma
    '라': 'ラ',  // ra
    '와': 'ワ',  // wa
    '데': 'デ', '도': 'ド'   // de, do
  };

  /* Strip ALL non-Japanese ranges + map known Hangul to Katakana. */
  function sanitizeName(name){
    if (!name) return name;
    var orig = name;
    /* Map Hangul to Katakana */
    var out = '';
    for (var i = 0; i < name.length; i++){
      var c = name[i];
      var code = c.charCodeAt(0);
      if (HANGUL_TO_KATAKANA[c]){
        out += HANGUL_TO_KATAKANA[c];
      } else if ((code >= 0xAC00 && code <= 0xD7AF) ||  // Hangul syllables
                 (code >= 0x1100 && code <= 0x11FF) ||  // Hangul jamo
                 (code >= 0x3130 && code <= 0x318F) ||  // Hangul compat
                 (code >= 0x0400 && code <= 0x04FF) ||  // Cyrillic
                 (code >= 0x0E00 && code <= 0x0E7F) ||  // Thai
                 (code >= 0x0370 && code <= 0x03FF) ||  // Greek
                 (code >= 0x0600 && code <= 0x06FF)) {  // Arabic
        /* Drop foreign chars from name */
        continue;
      } else {
        out += c;
      }
    }
    if (out !== orig) console.log('[v224] name sanitized:', orig, '->', out);
    return out;
  }

  /* Strip foreign chars from any text (narrative/dialogue). */
  function sanitizeText(text){
    if (!text) return text;
    var out = '';
    for (var i = 0; i < text.length; i++){
      var c = text[i];
      var code = c.charCodeAt(0);
      if (HANGUL_TO_KATAKANA[c]){
        out += HANGUL_TO_KATAKANA[c];
      } else if ((code >= 0xAC00 && code <= 0xD7AF) ||
                 (code >= 0x1100 && code <= 0x11FF) ||
                 (code >= 0x3130 && code <= 0x318F) ||
                 (code >= 0x0400 && code <= 0x04FF) ||
                 (code >= 0x0E00 && code <= 0x0E7F)) {
        continue;
      } else {
        out += c;
      }
    }
    return out;
  }

  /* ============================================================ */
  /* B. Gender-speech mismatch detection & fix                    */
  /* ============================================================ */
  /* Masculine endings often used by male chars only */
  var MASC_PATTERNS = [
    [/(\S)するんだ([。！？\!\?]?)/g, '$1するの$2'],
    [/(\S)なんだ([。！？\!\?]?)/g, '$1なの$2'],
    [/(\S)だぞ([。！？\!\?]?)/g, '$1よ$2'],
    [/(\S)だな([。！？\!\?]?)/g, '$1ね$2'],
    [/(\S)だぜ([。！？\!\?]?)/g, '$1よ$2'],
    [/(\S)じゃねえか/g, '$1じゃない'],
    [/(\S)じゃねえ/g, '$1じゃない'],
    [/(\S)てやがる/g, '$1ている'],
    [/(\S)やがって/g, '$1して'],
    [/おまえ/g, 'あなた'],
    [/おめえ/g, 'あなた'],
    [/きさま/g, 'あなた']
  ];

  /* Feminine endings often used by female chars only */
  var FEM_PATTERNS = [
    [/(\S)だわ([。！？\!\?]?)/g, '$1$2'],  // 「だわ」→空（中立）
    [/(\S)わよ([。！？\!\?]?)/g, '$1よ$2'],
    [/(\S)のよ([。！？\!\?]?)/g, '$1のよ$2'],  // 残す（普通の女性表現）
    [/(\S)なのよ([。！？\!\?]?)/g, '$1なのよ$2'],
    [/(\S)かしら([。！？\!\?]?)/g, '$1かな$2']
    // 「かしら」も古風だが許容
  ];

  /* Old-fashioned/awkward phrasings */
  var OLD_PATTERNS = [
    [/いっぱいだわ/g, 'すごい'],
    [/たくさんだわ/g, 'たくさん'],
    [/どうしましょう/g, 'どうしよう'],
    [/さようなら/g, 'さようなら'],  // keep
    [/わたくし/g, '私']
  ];

  function fixDialogueVoice(text, charGender){
    if (!text) return text;
    var out = text;
    /* If char is female, strip masculine markers */
    if (charGender === '女性'){
      MASC_PATTERNS.forEach(function(p){ out = out.replace(p[0], p[1]); });
    }
    /* If char is male, strip feminine markers */
    if (charGender === '男性'){
      FEM_PATTERNS.forEach(function(p){ out = out.replace(p[0], p[1]); });
    }
    /* Old-fashioned across the board */
    OLD_PATTERNS.forEach(function(p){ out = out.replace(p[0], p[1]); });
    return out;
  }

  /* ============================================================ */
  /* C. Reprocess saved turns                                     */
  /* ============================================================ */
  function reprocessTurns(){
    var s; try { s = JSON.parse(localStorage.getItem('chr6')||'{}'); } catch(e){ return; }
    var changed = false;

    /* Sanitize cast names */
    if (s.cast){
      if (s.cast.hero && s.cast.hero.name){
        var newName = sanitizeName(s.cast.hero.name);
        if (newName !== s.cast.hero.name){
          s.cast.hero.name = newName;
          changed = true;
        }
      }
      (s.cast.npcs || []).forEach(function(n){
        if (n && n.name){
          var nn = sanitizeName(n.name);
          if (nn !== n.name){ n.name = nn; changed = true; }
        }
      });
    }

    /* Build gender map for dialogue voice fixing */
    var genderMap = {};
    if (s.cast && s.cast.hero){
      genderMap[s.cast.hero.name] = s.cast.hero.gender;
    }
    (s.cast && s.cast.npcs || []).forEach(function(n){
      if (n && n.name) genderMap[n.name] = n.gender;
    });

    /* Sanitize narrative + dialogues in each turn */
    (s.turns || []).forEach(function(t){
      if (!t) return;
      if (t.narrative){
        var nn = sanitizeText(t.narrative);
        if (nn !== t.narrative){ t.narrative = nn; changed = true; }
      }
      if (Array.isArray(t.dialogues)){
        t.dialogues.forEach(function(d){
          if (!d || !d.text) return;
          var sanitized = sanitizeText(d.text);
          var voiceFixed = fixDialogueVoice(sanitized, genderMap[d.speaker]);
          if (voiceFixed !== d.text){
            d.text = voiceFixed;
            changed = true;
          }
        });
      }
    });

    if (changed){
      try { localStorage.setItem('chr6', JSON.stringify(s)); } catch(e){}
      try { eval('UI.renderAll()'); } catch(e){}
      console.log('[v224] reprocessed turns');
    }
  }

  /* ============================================================ */
  /* D. Prompt rules                                              */
  /* ============================================================ */
  var VOICE_RULE = [
    '',
    '',
    '# 🗣️ キャラの口調ルール（最重要）',
    '',
    '## 性別に合った自然な現代日本語',
    '- **女性キャラ**は女性的な、または中立的な口調',
    '  - ✅ 「やめて！」「何するの！」「離して！」「もうやめて……」',
    '  - ❌ 「やめろ！」「何するんだ！」「離せ！」（男言葉）',
    '- **男性キャラ**は男性的な、または中立的な口調',
    '  - ✅ 「やめろ！」「何するつもりだ！」「離せ！」',
    '  - ❌ 「だわ」「のよ」「かしら」「わよ」（女言葉）',
    '',
    '## 古臭い言い回しは禁止',
    '- ❌ 「いっぱいだわ」「するんだ」「ござる」「候」「致す」',
    '- ✅ 「すごい」「するの」「やる」「する」',
    '- 自然な現代日本語の会話表現を使用',
    '',
    '## 文字種',
    '- ハングル・キリル・タイ文字・ギリシャ文字 一切混入禁止',
    '- キャラ名に「에」「외」など韓国語の母音を混ぜない（カエデ→○、カ에デ→❌）',
    '- 日本語のひらがな・カタカナ・漢字 + 必要時のみ英数字'
  ].join('\n');

  /* Inject into system prompt via fetch hook */
  var origFetch = window.fetch.bind(window);
  window.fetch = function(input, init){
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var isApi = /openrouter\.ai|api\.anthropic\.com|api\.openai\.com/.test(url);
    if (isApi && init && init.body){
      try {
        var body = JSON.parse(init.body);
        if (body.messages && Array.isArray(body.messages)){
          for (var i = body.messages.length - 1; i >= 0; i--){
            if (body.messages[i].role === 'system'){
              var c = body.messages[i].content || '';
              if (c.indexOf('# 🗣️ キャラの口調ルール') < 0){
                body.messages[i].content = c + VOICE_RULE;
              }
              break;
            }
          }
          init.body = JSON.stringify(body);
        }
      } catch(e){}
    }
    return origFetch(input, init);
  };

  /* ============================================================ */
  /* Init                                                         */
  /* ============================================================ */
  function init(){
    setTimeout(reprocessTurns, 1500);
    setInterval(reprocessTurns, 4000);
    console.log('[v224] active: hangul strip + voice consistency');
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.__v224 = {
    sanitizeName: sanitizeName,
    sanitizeText: sanitizeText,
    fixDialogueVoice: fixDialogueVoice,
    reprocessTurns: reprocessTurns,
    HANGUL_TO_KATAKANA: HANGUL_TO_KATAKANA,
    MASC_PATTERNS: MASC_PATTERNS,
    FEM_PATTERNS: FEM_PATTERNS
  };
})();
