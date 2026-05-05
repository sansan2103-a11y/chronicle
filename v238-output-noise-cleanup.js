(function(){
  if (window.__v238Active) return;
  window.__v238Active = true;

  // A. アスタリスク label の除去
  const ASTERISK_LABEL_RX = /^\s*\*[ぁ-んァ-ン一-龯a-zA-Z]{1,10}\*\s*$/;

  // B. 構造ラベル prefix の除去
  const STRUCT_LABEL_RX = /^\s*(状態|行動|思考|思想|内心|感情|位置|現在|最近[\s\S]*?|次の[\s\S]*?|要約|state|action|thought|emotion):/i;

  // C. 中国語特有助詞（2個以上連続で検出）
  const CN_PARTICLES = '或則之與於矣焉者其所然亦乃即故';
  const CN_PARTICLE_RX = new RegExp('[' + CN_PARTICLES + ']{2,}|(?:[' + CN_PARTICLES + '][^ぁ-んァ-ン]*?){2,}');

  // 各行を sanitize
  function sanitizeLine(line) {
    if (!line) return line;
    if (ASTERISK_LABEL_RX.test(line)) return '';
    if (STRUCT_LABEL_RX.test(line)) return '';
    return line;
  }

  // narrative 配列全体を処理
  function sanitizeNarrative(narr) {
    if (!Array.isArray(narr)) return narr;
    return narr.map(sanitizeLine).filter(s => s && s.trim().length > 0);
  }

  // hookSettings → render 系の処理にフック
  function hook() {
    if (typeof window.UI === 'undefined' || !window.UI.renderNarr || window.UI.renderNarr.__v238Hooked) {
      setTimeout(hook, 500);
      return;
    }
    const orig = window.UI.renderNarr;
    window.UI.renderNarr = function(narr) {
      try {
        narr = sanitizeNarrative(narr);
      } catch(e){}
      return orig.call(this, narr);
    };
    window.UI.renderNarr.__v238Hooked = true;

    console.log('[v238] output noise cleanup active');
  }
  hook();

  // D. 直前ターン文脈注入強化（fetch hook）
  if (window.fetch && !window.fetch.__v238ContextHooked) {
    const origFetch = window.fetch;
    window.fetch = function(url, opts) {
      try {
        if (typeof url === 'string' && url.includes('openrouter.ai') && opts && opts.body) {
          let body = JSON.parse(opts.body);
          if (body.messages && body.messages.length > 0 && window.S && window.S.turns) {
            const turns = window.S.turns;
            if (turns.length >= 1) {
              const lastTurn = turns[turns.length - 1];
              if (lastTurn && lastTurn.narrative && Array.isArray(lastTurn.narrative)) {
                const lastSentences = lastTurn.narrative.slice(-3).join(' ');
                const sysIdx = body.messages.findIndex(m => m.role === 'system');
                if (sysIdx >= 0) {
                  body.messages[sysIdx].content += '\n\n【直前のシーン】\n' + lastSentences;
                  opts.body = JSON.stringify(body);
                }
              }
            }
          }
        }
      } catch(e){}
      return origFetch.call(this, url, opts);
    };
    window.fetch.__v238ContextHooked = true;
  }
})();
