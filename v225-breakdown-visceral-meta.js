/* v225-breakdown-visceral-meta:
   1. Hide non-functional NPC meters (信頼/緊張) since they don't influence prompts.
      Removes the meter widget completely from settings panel UI.
   2. Strengthen mental breakdown / madness expressions in dialogue+narrative.
   3. Force visceral 5-sense description in narrative (touch/smell/sound/sight/taste).
   4. Extended meta-comment filter (v218 didn't catch
      "次のターンの指示を待っています" / 括弧括りメタ etc).
   5. Strip parenthesized meta-comments completely from narrative. */
(function v225(){
  'use strict';
  if (window.__v225Active) return;
  window.__v225Active = true;

  /* ============================================================ */
  /* A. Hide non-functional NPC meters                            */
  /* ============================================================ */
  function hideMeters(){
    /* Remove "信頼" / "緊張" meter widgets from settings/character cards */
    var labelTexts = ['信頼', '緊張', 'trust', 'tension'];
    var allElements = document.querySelectorAll('label, span, div');
    allElements.forEach(function(el){
      var t = (el.textContent || '').trim();
      if (t.length > 30) return;  /* skip large containers */
      var isMeterLabel = labelTexts.some(function(lt){ return t.indexOf(lt) >= 0 && t.length < 20; });
      if (isMeterLabel){
        var parent = el.closest('.psych-row, .meter-row, [class*="meter"], [class*="psych"]');
        if (parent){
          parent.style.display = 'none';
        } else if (el.parentElement) {
          /* If label sits next to a slider, hide both */
          var sib = el.nextElementSibling;
          if (sib && (sib.tagName === 'INPUT' || sib.tagName === 'PROGRESS')){
            el.style.display = 'none';
            sib.style.display = 'none';
          }
        }
      }
    });
    /* Also kill any range inputs labeled with these */
    document.querySelectorAll('input[type="range"]').forEach(function(r){
      var name = (r.name || '') + ' ' + (r.id || '');
      if (/trust|tension|信頼|緊張|stress/i.test(name)){
        r.style.display = 'none';
        if (r.parentElement) r.parentElement.style.display = 'none';
      }
    });
  }

  /* ============================================================ */
  /* B. Extended meta-comment patterns (extends v218)             */
  /* ============================================================ */
  var META_EXTRA = [
    /次のターンの指示/,
    /続きがある場合/,
    /指示を待[っちつた]/,
    /お知らせください/,
    /いかがいたしましょう/,
    /ご指示/,
    /ご要望/,
    /続けてよろしい/,
    /何かお手伝い/,
    /続きを書きますか/,
    /次の展開/,
    /アシスタント/,
    /\bAI\b/
  ];

  function isExtendedMeta(text){
    if (!text) return false;
    for (var i = 0; i < META_EXTRA.length; i++){
      if (META_EXTRA[i].test(text)) return true;
    }
    return false;
  }

  /* Strip parenthesized meta comments. Parens here include both 全角 and 半角. */
  function stripMetaParens(text){
    if (!text) return text;
    var out = text;
    /* Strip （...）blocks containing meta keywords */
    out = out.replace(/[（(][^）)]*?(指示を待|お知らせ|続きがある|次のターン|ご指示|ご要望|アシスタント|どうしますか|お願いします|お続け|楽しみ)[^）)]*?[）)]/g, '');
    /* Also strip [...] meta-bracket comments */
    out = out.replace(/[\[【][^\]】]*?(指示を待|お知らせ|続きがある|次のターン|ご指示)[^\]】]*?[\]】]/g, '');
    /* Strip standalone meta sentences */
    var sentences = out.split(/(?<=[。！？\n])/);
    out = sentences.filter(function(s){
      var trimmed = s.trim();
      if (!trimmed) return false;
      return !isExtendedMeta(trimmed);
    }).join('');
    return out;
  }

  /* ============================================================ */
  /* C. Reprocess saved turns to strip extended meta              */
  /* ============================================================ */
  function reprocessTurns(){
    var s; try { s = JSON.parse(localStorage.getItem('chr6')||'{}'); } catch(e){ return; }
    var changed = false;
    (s.turns || []).forEach(function(t){
      if (!t || !t.narrative) return;
      var clean = stripMetaParens(t.narrative);
      if (clean !== t.narrative){
        console.log('[v225] stripped extended meta');
        t.narrative = clean;
        changed = true;
      }
    });
    if (changed){
      try { localStorage.setItem('chr6', JSON.stringify(s)); } catch(e){}
      try { eval('UI.renderAll()'); } catch(e){}
    }
  }

  /* ============================================================ */
  /* D. Strong prompt rules: breakdown + visceral + anti-meta     */
  /* ============================================================ */
  var BREAKDOWN_RULE = [
    '',
    '',
    '# 🌀 高ストレス時の精神崩壊表現（必須）',
    '',
    '## 拘束・暴行・極限ストレス場面では「冷静」を禁じる',
    '- ❌ キャラが佘裕ありそうに反応する',
    '- ✅ 思考が破綻し、発狂寸前、正気を失いかける描写を強制',
    '',
    '## 必須語彙バンク',
    '### 思考停止',
    '- 「あ、あ、ああ……」「う……っ」「……っ」（声が出ない）',
    '- 内心《何も考えられない》《頭が真っ白》《意識が遠のく》《言葉が出ない》',
    '',
    '### 発狂',
    '- 「おかしくなる、おかしくなっちゃう……」',
    '- 「もうだめ、もうだめだめだめ……」',
    '- 「壊れる、壊れちゃう……」',
    '- 「助けて、助けて、助けて……」（連呼）',
    '',
    '### 嗚咽・崩壊',
    '- 「ひっく、ひっく……」「うぅ……うぅぅ……」',
    '- 「お願い、もうやめて……お願いだから……」',
    '- 「いっ、いた、痛い、痛い、痛いぃぃ……」（途切れる）',
    '',
    '## 必ず守るルール',
    '- 高ストレス（拘束／暴行／恐怖）場面で **冷静なセリフ禁止**',
    '- 文章が乱れる、句点が増える、声が掠れる描写を入れる',
    '- 内心独白《》で思考の崩壊を表現',
    ''
  ].join('\n');

  var VISCERAL_RULE = [
    '',
    '',
    '# 🩸 五感描写ルール（生々しさ必須）',
    '',
    '## 淡々とした描写を禁じる',
    '- ❌ 「サクラは縛られていた。」（淡々）',
    '- ✅ 「サクラの細い手首には縄の跡が深く食い込み、汗で湿った肌が縄の繊維に擦れて赤く腫れていた。荒い呼吸が彼女の小さな身体を波打たせる。」',
    '',
    '## 五感を多層的に',
    '- **触覚**：肌の感触、体液（汗・涙・血・潤み）、温度（冷気・熱）、痛み（鈍痛・鋭痛・痺れ）',
    '- **嗅覚**：汗の匂い、血の匂い、潮の香、怪異の異臭、香水',
    '- **聴覚**：呼吸音、衣擦れ、悲鳴の余韻、心拍、唾を呑む音、縄の軋み',
    '- **視覚**：涙、汗、肌の紅潮、震え、瞳孔の動き、光の反射',
    '- **味覚**：唇に滲む味（涙・血の鉄錆味）',
    '',
    '## 描写量',
    '- 1場面につき **3〜5文** の長さで',
    '- 情景・身体感覚・感情を **多層的に** 書く',
    '- 単調な「○○した」「○○だった」を避け、能動的・触感的表現を使う',
    ''
  ].join('\n');

  var ANTI_META_RULE = [
    '',
    '',
    '# 🚫 メタコメント完全禁止（最重要）',
    '',
    '## 絶対禁止フレーズ',
    '- ❌ 「次のターンの指示を待っています」',
    '- ❌ 「続きがある場合はお知らせください」',
    '- ❌ 「ご指示をお待ちしております」',
    '- ❌ 「いかがいたしましょうか」',
    '- ❌ 「お願いします」（メタ的な依頼）',
    '- ❌ 「アシスタント」「AI」と自称しない',
    '',
    '## 絶対禁止形式',
    '- ❌ `（次のターンの指示を待っています）` のような **括弧括りメタコメント**',
    '- ❌ `[続きを待つ]` のような **角括弧メタ**',
    '',
    '## 正しい応答',
    '- 物語の地の文として、シーンを描き続ける',
    '- ユーザーへの問いかけ・確認は **一切しない**',
    '- 応答の最後の文字は **物語のセリフ or 地の文** で終わる',
    ''
  ].join('\n');

  /* Inject rules via fetch hook */
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
              if (c.indexOf('# 🌀 高ストレス時の精神崩壊表現') < 0){
                c = c + BREAKDOWN_RULE;
              }
              if (c.indexOf('# 🩸 五感描写ルール') < 0){
                c = c + VISCERAL_RULE;
              }
              if (c.indexOf('# 🚫 メタコメント完全禁止') < 0){
                c = c + ANTI_META_RULE;
              }
              body.messages[i].content = c;
              break;
            }
          }
          init.body = JSON.stringify(body);
        }
      } catch(e){}
    }
    /* Inspect response for extended meta and retry */
    var firstResp = origFetch(input, init);
    return firstResp.then(function(resp){
      if (!resp.ok) return resp;
      var clone = resp.clone();
      return clone.text().then(function(text){
        try {
          var json = JSON.parse(text);
          var content = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
          if (!content) return resp;
          if (!isExtendedMeta(content) && !/[（(][^）)]*?(指示を待|お知らせ|続きがある|次のターン)[^）)]*?[）)]/.test(content)){
            return resp;
          }
          if (window.__v225Retrying) return resp;
          window.__v225Retrying = true;
          console.warn('[v225] extended meta detected — retrying');
          var newInit = JSON.parse(JSON.stringify(init));
          var body2;
          try { body2 = JSON.parse(newInit.body); } catch(e){ window.__v225Retrying = false; return resp; }
          if (!body2.messages){ window.__v225Retrying = false; return resp; }
          body2.messages.push({
            role: 'user',
            content: '⚠️ 前の応答にメタコメント（「指示を待っています」「お知らせください」「次のターンの〜」など）が含まれていた。\n\n物語の地の文だけを書き直してください。括弧括りメタコメント・ユーザーへの問いかけは絶対禁止。'
          });
          newInit.body = JSON.stringify(body2);
          var retry = origFetch(input, newInit);
          return retry.then(function(r2){
            window.__v225Retrying = false;
            return r2;
          }).catch(function(e){
            window.__v225Retrying = false;
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
    setTimeout(function(){ hideMeters(); reprocessTurns(); }, 1000);
    setInterval(function(){ hideMeters(); reprocessTurns(); }, 3000);
    var mo = new MutationObserver(function(){ hideMeters(); });
    mo.observe(document.body, { childList: true, subtree: true });
    console.log('[v225] active: meter hide + breakdown + visceral + extended meta');
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.__v225 = {
    hideMeters: hideMeters,
    isExtendedMeta: isExtendedMeta,
    stripMetaParens: stripMetaParens,
    reprocessTurns: reprocessTurns,
    META_EXTRA: META_EXTRA
  };
})();
