/* v206-jp-only: enforce Japanese-only output + continuation context preservation
   1. Inject strict JP-only instruction into AI prompts.
   2. Sanitize narrative: remove lines that look like Chinese (only kanji, no kana).
   3. For "続きを書く" detection: append last turn's narrative tail as anchor. */
(function v206(){
  'use strict';
  if (window.__v206Active) return;
  window.__v206Active = true;

  var JP_ONLY_INSTRUCTION = [
    '',
    '',
    '# 言語ルール（最重要・絶対遵守）',
    '',
    '出力は **必ず日本語のみ** で行ってください。',
    '',
    '## 禁止',
    '- ❌ 中国語（繁体字・簡体字）の混入：例 `這裡` `什麼` `沒有` `個` `說` `嗎`',
    '- ❌ 英語の文章混入：例 `She said` `Hello`',
    '- ❌ ハングル混入',
    '- ❌ ひらがな・カタカナを含まない漢字のみの長い文（これは中国語の特徴）',
    '',
    '## 必須',
    '- ✅ 日本語の自然な表記：ひらがな + カタカナ + 漢字 + 句読点',
    '- ✅ 漢字のみの文を書く場合でも 2〜4文字以内の単語に留める',
    '',
    '中国語や英語が混じった応答はバグです。日本語の小説として完全に書ききってください。',
    ''
  ].join('\n');

  /* === Continuation context anchor === */
  function getLastTurnTail(state){
    var turns = state.turns || [];
    if (turns.length === 0) return null;
    var last = turns[turns.length - 1];
    if (!last || !last.narrative) return null;
    /* Take last 200 chars of the previous turn's narrative as anchor. */
    var n = last.narrative;
    return n.substring(Math.max(0, n.length - 200));
  }

  /* === Fetch hook: append JP-only instruction + continuation anchor === */
  var origFetch = window.fetch.bind(window);
  window.fetch = function(input, init){
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var isApi = /openrouter\.ai|api\.anthropic\.com|api\.openai\.com/.test(url);
    if (isApi && init && init.body){
      try {
        var body = JSON.parse(init.body);
        if (body.messages && Array.isArray(body.messages)){
          /* Add JP-only instruction to last system message */
          for (var i = body.messages.length - 1; i >= 0; i--){
            if (body.messages[i].role === 'system'){
              var c = body.messages[i].content || '';
              if (!/言語ルール/.test(c)){
                body.messages[i].content = c + JP_ONLY_INSTRUCTION;
              }
              break;
            }
          }
          /* Detect "continue" intent (last user msg empty or short hint).
             Add explicit anchor reminding model where the story left off. */
          var lastUser = null;
          for (var j = body.messages.length - 1; j >= 0; j--){
            if (body.messages[j].role === 'user'){ lastUser = body.messages[j]; break; }
          }
          if (lastUser){
            var ut = String(lastUser.content || '');
            /* If user message is empty or just "続き" / "続けて" / "..." */
            if (/^[\s。、…・]*(続き(を書く)?|続けて|そのまま)?[\s。、…・]*$/.test(ut.trim())){
              try {
                var s = JSON.parse(localStorage.getItem('chr6') || '{}');
                var tail = getLastTurnTail(s);
                if (tail){
                  lastUser.content = '直前の物語の最後はこうでした：\n```\n' + tail + '\n```\n\nここから自然に物語を続けてください。最初から書き直さず、上記の続きから書いてください。';
                }
              } catch(e){}
            }
          }
          init.body = JSON.stringify(body);
        }
      } catch(e){}
    }
    return origFetch(input, init);
  };

  /* === Chinese-line stripper for narrative === */
  function isChineseLine(line){
    if (!line) return false;
    var trimmed = line.trim();
    if (trimmed.length < 4) return false;
    /* Has any hiragana or katakana → definitely Japanese */
    if (/[ぁ-ゖァ-ヺ]/.test(trimmed)) return false;
    /* Has 5+ consecutive kanji and zero kana → suspicious */
    var kanjiCount = (trimmed.match(/[一-鿿]/g) || []).length;
    if (kanjiCount < 4) return false;
    /* Contains specific Chinese-only characters */
    if (/[這裡個什麼沒嗎咳呀啊嘛吧呢呐了的得是不在有來去說話聞看做給把對著只都還又又再也很才就會能會應該將過已經]/.test(trimmed)){
      return true;
    }
    /* Mostly kanji + minimal punctuation → likely Chinese */
    var kanjiRatio = kanjiCount / trimmed.replace(/[\s、。「」《》（）()！？]/g, '').length;
    if (kanjiRatio > 0.85 && kanjiCount > 6) return true;
    return false;
  }

  function stripChinese(narrative){
    if (!narrative) return narrative;
    var lines = narrative.split(/\n/);
    var changed = false;
    var filtered = lines.filter(function(line){
      if (isChineseLine(line)){
        console.log('[v206] stripped CN line:', line.substring(0, 50));
        changed = true;
        return false;
      }
      return true;
    });
    return changed ? filtered.join('\n') : narrative;
  }

  function reprocessTurns(){
    var s;
    try { s = JSON.parse(localStorage.getItem('chr6') || '{}'); }
    catch(e){ return; }
    var turns = s.turns || [];
    var anyChanged = false;
    turns.forEach(function(t){
      if (!t || !t.narrative) return;
      var n = stripChinese(t.narrative);
      if (n !== t.narrative){
        t.narrative = n;
        anyChanged = true;
      }
    });
    if (anyChanged){
      try { localStorage.setItem('chr6', JSON.stringify(s)); } catch(e){}
      console.log('[v206] cleaned Chinese lines from turns');
    }
  }

  function init(){
    setTimeout(reprocessTurns, 1500);
    setInterval(reprocessTurns, 5000);
    console.log('[v206] active: JP-only + continuation anchor + CN stripper');
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
