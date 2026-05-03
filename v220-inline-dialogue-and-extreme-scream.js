/* v220-inline-dialogue-and-extreme-scream:
   1. Inline 名前「セリフ」 / 名前『セリフ』 / 名前： を narrative から抽出
   2. すでに dialogues に同じ speaker+text がない場合のみ追加
   3. 抽出後 narrative からそれらのインライン部分を削除し dialogues に集約
   4. 激痛キーワード（眼球/喰らい/裂け/血が/絶叫/悲鳴 等）検出時、
      長音絶叫を強制するルールをプロンプトに注入＋検出ベースリトライ */
(function v220(){
  'use strict';
  if (window.__v220Active) return;
  window.__v220Active = true;

  /* ============================================================ */
  /* A. Known character names (from cast)                         */
  /* ============================================================ */
  function getKnownNames(){
    var s; try { s = JSON.parse(localStorage.getItem('chr6')||'{}'); } catch(e){ return []; }
    var names = [];
    if (s.cast && s.cast.hero && s.cast.hero.name) names.push(s.cast.hero.name);
    if (s.cast && Array.isArray(s.cast.npcs)){
      s.cast.npcs.forEach(function(n){
        if (n && n.name) names.push(n.name);
      });
    }
    return names.filter(function(n){ return n && n.length >= 1; });
  }

  /* ============================================================ */
  /* B. Inline dialogue extraction                                */
  /* ============================================================ */
  /* Patterns to match (name first, then quote):
     - 名前「セリフ」
     - 名前『セリフ』
     - 名前《セリフ》  (inner thought)
     - 名前は「セリフ」
     - 名前が「セリフ」
     - 名前、「セリフ」
     - 名前: 「セリフ」 / 名前：「セリフ」
  */

  function escapeRegex(s){
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function extractInlineDialogues(narrative, knownNames){
    if (!narrative || !knownNames || !knownNames.length) return [];
    var hits = [];
    var nameAlt = knownNames.map(escapeRegex).join('|');

    /* Patterns: name + optional particle + open quote + body + close quote */
    var patterns = [
      /* outer speech */
      { rx: new RegExp('(' + nameAlt + ')(?:[はがも、,]\\s*)?「([^」]{1,300})」', 'g'), inner: false, openIdx: '「', closeIdx: '」' },
      { rx: new RegExp('(' + nameAlt + ')(?:[はがも、,]\\s*)?『([^』]{1,300})』', 'g'), inner: false, openIdx: '『', closeIdx: '』' },
      /* inner thought */
      { rx: new RegExp('(' + nameAlt + ')(?:[はがも、,]\\s*)?《([^》]{1,300})》', 'g'), inner: true, openIdx: '《', closeIdx: '》' }
    ];

    patterns.forEach(function(p){
      var m;
      p.rx.lastIndex = 0;
      while ((m = p.rx.exec(narrative)) !== null){
        hits.push({
          speaker: m[1],
          text: m[2].trim(),
          inner: !!p.inner,
          fullMatch: m[0],
          start: m.index
        });
      }
    });

    /* Sort by start position */
    hits.sort(function(a, b){ return a.start - b.start; });
    return hits;
  }

  /* ============================================================ */
  /* C. Sync inline -> dialogues                                  */
  /* ============================================================ */
  function syncInlineToDialogues(turn, knownNames){
    if (!turn || !turn.narrative) return false;
    var inline = extractInlineDialogues(turn.narrative, knownNames);
    if (!inline.length) return false;

    if (!Array.isArray(turn.dialogues)) turn.dialogues = [];
    var existingSigs = new Set(turn.dialogues.map(function(d){
      return (d.speaker||'') + '||' + (d.text||'').trim();
    }));

    var added = 0;
    inline.forEach(function(h){
      var sig = h.speaker + '||' + h.text;
      if (existingSigs.has(sig)) return;
      existingSigs.add(sig);
      turn.dialogues.push({
        speaker: h.speaker,
        text: h.text,
        inner: h.inner
      });
      added++;
      console.log('[v220] inline dialogue extracted:', h.speaker, '|', h.text.substring(0, 30));
    });
    return added > 0;
  }

  /* ============================================================ */
  /* D. Extreme pain detector                                     */
  /* ============================================================ */
  var EXTREME_PAIN_RX = /眼球|喰らいつ|食いちぎ|食い千切|裂け[たる]|引き裂|引き千切|血が(流|飛|迸|噴|溢|滴|染)|血しぶき|鮮血|断末魔|絶叫|悲鳴が響|悲鳴をあげ|悲鳴を轟|悲鳴を割|内臓|骨が砕|骨が折|歯が食/;
  var STRONG_DESPAIR_RX = /(もう[、,]?\s*限界|もうやめて|お願い[、,]?\s*もう|助けて[、,]?\s*誰か|誰か[、,]?\s*助けて)/;

  function detectExtremePain(narrative){
    if (!narrative) return false;
    return EXTREME_PAIN_RX.test(narrative) || STRONG_DESPAIR_RX.test(narrative);
  }

  /* Check: are there any long-scream patterns in dialogues? */
  var LONG_SCREAM_RX = /(あ{3,}|い{3,}|う{3,}|きゃ{2,}|ぎゃ{2,}|ひぃ{2,}|いやぁ{2,}|あぁ{2,}|うぅ{2,}|ぐっ|ぐぅ|ぎぃ)/;
  function hasLongScream(turn){
    if (!turn) return false;
    var d = turn.dialogues || [];
    for (var i = 0; i < d.length; i++){
      if (d[i] && d[i].text && LONG_SCREAM_RX.test(d[i].text)) return true;
    }
    if (turn.narrative && LONG_SCREAM_RX.test(turn.narrative)) return true;
    return false;
  }

  /* ============================================================ */
  /* E. Post-process saved turns                                  */
  /* ============================================================ */
  function reprocessTurns(){
    var s; try { s = JSON.parse(localStorage.getItem('chr6')||'{}'); } catch(e){ return; }
    var turns = s.turns || [];
    if (!turns.length) return;
    var names = getKnownNames();
    if (!names.length) return;
    var changed = false;
    turns.forEach(function(t){
      if (syncInlineToDialogues(t, names)) changed = true;
    });
    if (changed){
      try { localStorage.setItem('chr6', JSON.stringify(s)); } catch(e){}
      try { eval('UI.renderAll()'); } catch(e){}
      console.log('[v220] reprocessed turns - inline dialogues synced');
    }
  }

  /* ============================================================ */
  /* F. Strong prompt rules                                       */
  /* ============================================================ */
  var EXTREME_PAIN_RULE = [
    '',
    '',
    '# 🔥 激痛・極限シーンの長音絶叫ルール（最重要）',
    '',
    '## 自動発動条件',
    '次の **激痛/極限ワード** が地の文に出る場合、**必ず** 該当キャラが長音絶叫を発する：',
    '- 眼球、喰らいついた、食いちぎる、裂けた、引き裂く、血が流れる、血が飛ぶ、鮮血、断末魔、絶叫、悲鳴が響く、骨が砕ける、内臓',
    '',
    '## 強制ルール',
    '- 「悲鳴が響く」「絶叫した」「泣き叫ぶ」と書いたら、**その悲鳴の中身** を必ず引用形式で展開する',
    '  - ❌ 「彼女の悲鳴が響き渡った。」のみ（中身省略）',
    '  - ✅ 「彼女の悲鳴が響き渡った。スピカ『いやぁああああ！』」',
    '',
    '## 激痛時の長音絶叫サンプル（必ずバリエーション）',
    '- 「いやぁぁぁぁ！」（4文字以上の長音）',
    '- 「ぎゃあああ！」「ぎゃぁぁぁ！」',
    '- 「ひぃいいい！」「ひぃぃぃっ！」',
    '- 「うぁぁぁぁ……！」',
    '- 「あぁぁ……痛、痛い、痛いぃぃ……！」',
    '- 「やめてやめてやめて！」（連呼）',
    '- 「離してぇ……！助けてぇ……！」',
    '',
    '## 重要',
    '- セリフは **必ず JSON の dialogues 配列** に入れる（地の文インラインだけにしない）',
    '- ただし地の文中に書く場合も `名前「セリフ」` の正しい形式で',
    '- 長音は **3文字以上** 重ねる（「ああ」ではなく「あああ」「あぁぁぁ」）',
    '- 同じ悲鳴を繰り返さず、毎ターン異なる表現で',
    '',
    '## 例（必ず守る）',
    '入力：「怪異がスピカの眼球に喰らいついた」',
    '✅ 出力：',
    '> 怪異の鋭い牙がスピカの眼球を貫いた。眼窩から血が噴き出し、視界は赤一色に染まる。',
    '> スピカ「ひぃぃぃ！い、いやぁああああ！目が、目がぁあああ！」',
    '> 彼女は身を捩り、両手で顔を覆おうとするが、拘束された手は動かない。',
    '> スピカ「やめて、やめてぇ……お願いぃ……！」'
  ].join('\n');

  /* ============================================================ */
  /* G. Fetch hook: inject extreme pain rule + retry on missing  */
  /* ============================================================ */
  var origFetch = window.fetch.bind(window);
  window.fetch = function(input, init){
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var isApi = /openrouter\.ai|api\.anthropic\.com|api\.openai\.com/.test(url);

    if (!isApi) return origFetch(input, init);

    /* Inject EXTREME_PAIN_RULE into system prompt */
    if (init && init.body){
      try {
        var body = JSON.parse(init.body);
        if (body.messages && Array.isArray(body.messages)){
          for (var i = 0; i < body.messages.length; i++){
            if (body.messages[i].role === 'system'){
              var c = body.messages[i].content || '';
              if (c.indexOf('# 🔥 激痛・極限シーンの長音絶叫ルール') < 0){
                body.messages[i].content = c + EXTREME_PAIN_RULE;
              }
              break;
            }
          }
          init.body = JSON.stringify(body);
        }
      } catch(e){}
    }

    /* Inspect response — if extreme-pain narrative without long-scream, retry once */
    var firstResp = origFetch(input, init);
    return firstResp.then(function(resp){
      if (!resp.ok) return resp;
      var clone = resp.clone();
      return clone.text().then(function(text){
        try {
          var json = JSON.parse(text);
          var content = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
          if (!content) return resp;

          var hasExtreme = detectExtremePain(content);
          if (!hasExtreme) return resp;
          if (LONG_SCREAM_RX.test(content)) return resp;
          /* Has extreme pain mention but NO long scream — retry */
          if (window.__v220Retrying) return resp;
          window.__v220Retrying = true;
          console.warn('[v220] extreme pain detected but no long scream — retrying');

          var newInit = JSON.parse(JSON.stringify(init));
          var body2;
          try { body2 = JSON.parse(newInit.body); } catch(e){ window.__v220Retrying = false; return resp; }
          if (!body2.messages){ window.__v220Retrying = false; return resp; }

          body2.messages.push({
            role: 'user',
            content: '⚠️ 前の応答は激痛シーン（眼球/喰らいつき/裂け/血など）を描写したのに、' +
                     '**長音絶叫が一切なかった**。\n\n' +
                     '**やり直し**：\n' +
                     '- 該当キャラが「いやぁぁぁぁ！」「ぎゃあああ！」「ひぃぃぃ！」などの **3文字以上の長音絶叫** を必ず発する\n' +
                     '- 「悲鳴が響く」と書いたら、その **中身を引用形式で展開** する\n' +
                     '- 地の文インラインなら `名前「セリフ」` 形式、JSON の場合は dialogues 配列に必ず入れる\n' +
                     '- 連呼や絶望（「やめてやめてやめて」「助けてぇ……」）も活用\n\n' +
                     'この激痛シーンを再生成してください。'
          });
          newInit.body = JSON.stringify(body2);

          var retry = origFetch(input, newInit);
          return retry.then(function(r2){
            window.__v220Retrying = false;
            return r2;
          }).catch(function(e){
            window.__v220Retrying = false;
            console.warn('[v220] retry failed', e);
            return resp;
          });
        } catch(e){
          return resp;
        }
      });
    });
  };

  /* ============================================================ */
  /* Init                                                         */
  /* ============================================================ */
  function init(){
    setTimeout(function(){ reprocessTurns(); }, 1500);
    setInterval(function(){ reprocessTurns(); }, 5000);
    console.log('[v220] active: inline dialogue extract + extreme pain scream');
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.__v220 = {
    extractInlineDialogues: extractInlineDialogues,
    syncInlineToDialogues: syncInlineToDialogues,
    detectExtremePain: detectExtremePain,
    hasLongScream: hasLongScream,
    reprocessTurns: reprocessTurns,
    getKnownNames: getKnownNames,
    LONG_SCREAM_RX: LONG_SCREAM_RX,
    EXTREME_PAIN_RX: EXTREME_PAIN_RX
  };
})();
