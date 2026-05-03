/* v203-strict-format: enforce strict 名前「セリフ」 line format in AI output.
   - Override v200's prompt with stricter instructions: dialogue MUST be on its own line.
   - Re-attribute existing turns using the strict line-based parser.
   - Prevents misattribution by requiring AI to output dialogue lines that auto-parse correctly. */
(function v203(){
  'use strict';
  var TAG = '[v203]';
  if (window.__v203Active) return;
  window.__v203Active = true;

  var STRICT_INSTRUCTION = [
    '',
    '',
    '# 会話の表記形式（最重要・絶対遵守）',
    '',
    'narrative 内のすべての会話は **必ず以下の形式** で書いてください：',
    '',
    '## 必須ルール（守らないと会話ログが壊れます）',
    '1. **セリフは必ず独立した行にする**（前後の地の文と同じ行に書かない）',
    '2. **行頭に話者名 → 直後に「セリフ」**（話者名と「の間にスペースなし）',
    '3. **行末で改行**（次の地の文 / セリフは新しい行から）',
    '4. 心の声・内心は **話者名《内心》** の形式',
    '5. セリフ行には地の文（情景描写）を混ぜない',
    '',
    '## 良い例（必ずこの形式 / セリフ行の前後に空行）',
    '```',
    'カエデの目蓋がゆっくりと上向きに開かれ、薄暮の光が瞳を揺らめく。彼女は古びた書架に囲まれた場所で、自身が寝ていたのかもしれないということを認識する。床には埃が積もっており、カエデの動作に合わせて舞い上がる。',
    'セシリアが近寄ってきて、',
    '',
    'セシリア「大丈夫？ カエデ、目を覚ましてよかったわ」',
    '',
    'と優しい声で尋ねる。彼女の瞳には、心配と安堵が複雑に絡み合っていた。',
    'レオもすぐ傍までやって来る。',
    '',
    'レオ「見ろ、この図書館、すごいだろ！ どれだけの知識があるんだろうな！」',
    '',
    '彼は興奮気味に周囲を見回している。手に持ったランプが弱々しく揺れる。',
    'ミコトは少し離れた場所で、棚を物色していた。',
    '',
    'ミコト「ここには古代からの知識があるらしいわ」',
    '',
    'と彼女も好奇心いっぱいの声を上げる。しかし、その眼差しにはどこか影があった。',
    '```',
    '',
    '👆 重要：**セリフ行の前後に空行を入れる**。地の文は別の行に書く。',
    '',
    '## 禁止例（絶対NG）',
    '- ❌ `セシリアが近寄ってきて、「大丈夫？」と尋ねる。` （地の文とセリフが同じ行）',
    '- ❌ `レオもやって来る。「見ろ！」彼は興奮気味に。` （セリフ前後に地の文）',
    '- ❌ `「動くな」と盗賊が言った` （話者名がセリフの後にある）',
    '',
    '## 話者名のルール',
    '- 登録キャラ：アリア / セシリア / カエデ など',
    '- 登録外NPC：盗賊 / 魔女 / 兵士 など',
    '- 同種が複数：盗賊A / 盗賊B',
    '',
    'この形式に従えば自動的に正しい話者でログに分類されます。**形式違反は致命的バグの原因**です。',
    ''
  ].join('\n');

  /* Re-hook fetch to inject the strict instruction (replacing v200's softer one). */
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
              /* Strip any prior "会話の表記形式" block (from v200) */
              c = c.replace(/\n\n# 会話の表記形式[\s\S]*$/, '');
              /* Append our strict version */
              c = c + STRICT_INSTRUCTION;
              body.messages[i].content = c;
              break;
            }
          }
          init.body = JSON.stringify(body);
        }
      } catch(e){}
    }
    return origFetch(input, init);
  };

  /* === Existing turn re-attribution using line-based parser === */
  function read(){
    try { return JSON.parse(localStorage.getItem('chr6') || '{}'); }
    catch(e){ return {}; }
  }

  /* Strict line parser: each line that starts with 名前「セリフ」 or 名前《内心》
     becomes a dialogue. Other lines are narrative. */
  var BAD_SPEAKER = /^(手|声|目|顔|肌|髪|血|涙|息|胸|腰|腕|足|指|口|耳|背|腹|肩|首|頬|唇|舌|歯|爪|肘|膝|尻|股|膣|陰|穴|肉|骨|筋|腱|脈|皮|毛|汗|蕾|突起|夕暮れ|今は人|二つの|埃に埋|冷や汗|怪我|一体誰|三人|貴方|此処|其処|何|誰|今|昔|これ|それ|あれ|私|俺|僕|あたし|拙者|彼|彼女|彼ら|彼女ら)$/;

  function isValidSpeaker(name){
    if (!name || name.length < 2 || name.length > 12) return false;
    if (BAD_SPEAKER.test(name)) return false;
    if (/[をはがにへもまでよりからとや]/.test(name)) return false;
    if (/(した|して|する|される|られる|である|ている|った|たい|ない|だっ|だが)/.test(name)) return false;
    if (name.indexOf('の') >= 0) return false;
    return true;
  }

  function getKnownNames(state){
    var c = state.cast || {};
    var names = [];
    if (c.hero && c.hero.name) names.push(c.hero.name);
    (c.npcs || []).forEach(function(n){ if (n && n.name) names.push(n.name); });
    return names;
  }

  function findCanonical(name, knownNames){
    /* Direct match */
    for (var i = 0; i < knownNames.length; i++){
      if (knownNames[i] === name) return name;
    }
    /* Nickname (split on ・) */
    for (var j = 0; j < knownNames.length; j++){
      var full = knownNames[j];
      if (full.indexOf('・') >= 0){
        var parts = full.split('・');
        for (var k = 0; k < parts.length; k++){
          if (parts[k] === name) return full;
        }
      }
    }
    return name;
  }

  /* Parse narrative as line-prefixed dialogues + smart inline fallback. */
  function parseDialogues(narrative, state){
    if (!narrative) return [];
    var knownNames = getKnownNames(state);
    var lines = narrative.split(/\n/);
    var results = [];
    var lastSpeaker = null;

    /* Pattern A: line starts with 名前「セリフ」 or 名前《内心》 */
    var lineRx = /^([一-鿿ぁ-ゖァ-ヺ・A-Z]{2,12})(「([^「」]{1,300})」|《([^《》]{1,300})》)\s*$/;
    /* Pattern B: line starts with 名前「セリフ」 ... (rest of line is narration) */
    var lineRxLoose = /^([一-鿿ぁ-ゖァ-ヺ・A-Z]{2,12})(「([^「」]{1,300})」|《([^《》]{1,300})》)/;

    lines.forEach(function(line){
      var trimmed = line.trim();
      if (!trimmed) return;

      var m = trimmed.match(lineRx) || trimmed.match(lineRxLoose);
      if (m){
        var name = m[1];
        if (!isValidSpeaker(name)) return;
        var inner = !!m[4];
        var text = m[3] || m[4];
        var canonical = findCanonical(name, knownNames);
        results.push({ speaker: canonical, text: text, inner: inner });
        lastSpeaker = canonical;
      }
    });

    /* Fallback: if no line-prefix matches found, use inline regex on whole narrative
       (matching after newline or 。) — same as v200 PARSER. */
    if (results.length === 0){
      var inlineRx = /(?:^|[\n。])([一-鿿ぁ-ゖァ-ヺ・A-Z]{2,12})(「([^「」\n]{1,300})」|《([^《》\n]{1,300})》)/g;
      var im;
      while ((im = inlineRx.exec(narrative)) !== null){
        var inm = im[1];
        if (!isValidSpeaker(inm)) continue;
        var inText = im[3] || im[4];
        var inInner = !!im[4];
        var inCanon = findCanonical(inm, knownNames);
        results.push({ speaker: inCanon, text: inText, inner: inInner });
      }
    }

    return results;
  }

  function reprocessTurns(){
    var s = read();
    var turns = s.turns || [];
    var changed = false;
    turns.forEach(function(t){
      if (!t || !t.narrative) return;
      var newDialogues = parseDialogues(t.narrative, s);
      if (newDialogues.length === 0) return;
      var oldStr = JSON.stringify(t.dialogues || []);
      var newStr = JSON.stringify(newDialogues);
      if (oldStr !== newStr){
        t.dialogues = newDialogues;
        changed = true;
      }
    });
    if (changed){
      try { localStorage.setItem('chr6', JSON.stringify(s)); } catch(e){}
      console.log(TAG, 'reattributed turns with line-based parser');
      if (typeof window.__v201render === 'function') setTimeout(window.__v201render, 200);
    }
  }

  /* Override v200 PARSER.extractInline to use our line-based parser */
  function patchV200(){
    if (!window.__v200 || !window.__v200.PARSER) return false;
    window.__v200.PARSER.extractInline = function(narrative){
      try {
        var s = read();
        return parseDialogues(narrative, s);
      } catch(e){ return []; }
    };
    return true;
  }

  function init(){
    setTimeout(function(){
      patchV200();
      reprocessTurns();
    }, 1500);
    setInterval(reprocessTurns, 5000);
    console.log(TAG, 'v203 active: strict line-format prompt + line parser');
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.__v203parse = parseDialogues;
})();
