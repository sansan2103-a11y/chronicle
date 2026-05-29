// =====================================================================
// Chronicle TRPG — v292Dfix138+139+140: "続きを書く" reinforcement
//
//   fix138 — prompt-side progression boost (in features.js, see _drama
//            override block in fix105 build-wrap)
//
//   fix139 — wrap "続きを書く" button: before generating, call LLM to
//            produce a specific next-step proposal, then submit that as
//            the playerText. Makes the AI's autonomous "continue" much
//            more directed and dramatic.
//
//   fix140 — add "✨展開を提案" button next to "続きを書く": shows 3
//            candidate next-steps for the user to pick from (or close
//            and ignore). Click a candidate → submit as playerText.
//
//   Both share buildProposalPrompt() — reads long-mem (fix135-137) +
//   last 3 turns to ground the proposal in story state.
// =====================================================================
(function v292Dfix138(){
  'use strict';
  if (window.__v292Dfix138) return;
  window.__v292Dfix138 = true;

  var TAG = '[v292Dfix138:continue]';
  var ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
  var CONTINUE_TRIGGER = /続きを(?:自然に)?進めて|^続きを書/;

  function getKey(){ try { var c = JSON.parse(localStorage.getItem('chr6') || '{}').cfg || {}; return c.orKey || ''; } catch(e){ return ''; } }
  function getModel(){ try { var c = JSON.parse(localStorage.getItem('chr6') || '{}').cfg || {}; return c.orModel || 'nousresearch/hermes-4-405b'; } catch(e){ return 'nousresearch/hermes-4-405b'; } }
  function getState(){ try { if (typeof S !== 'undefined' && S) return S; } catch(e){} return window.S || null; }

  // ---------- LLM call (XHR, async) ----------
  function llmCall(prompt, temp, maxTok, cb){
    var key = getKey();
    if (!key){ cb(null); return; }
    var body;
    try {
      body = JSON.stringify({
        model: getModel(),
        temperature: temp != null ? temp : 0.85,
        max_tokens: maxTok || 500,
        messages: [{ role: 'user', content: prompt }]
      });
    } catch(e){ cb(null); return; }
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', ENDPOINT, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Authorization', 'Bearer ' + key);
      xhr.timeout = 20000;
      xhr.onload = function(){
        if (xhr.status >= 200 && xhr.status < 300){
          try {
            var j = JSON.parse(xhr.responseText);
            var c = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
            cb(c || null);
          } catch(e){ cb(null); }
        } else { cb(null); }
      };
      xhr.onerror   = function(){ cb(null); };
      xhr.ontimeout = function(){ cb(null); };
      xhr.send(body);
    } catch(e){ cb(null); }
  }

  // ---------- shared prompt builder (uses long-mem for grounding) ----------
  function buildProposalPrompt(askThree){
    var st = getState();
    if (!st || !st.turns || !st.turns.length) return null;
    var summary = '', worldinfo = [], events = [];
    try {
      if (window.__longmem){
        summary = window.__longmem.getSummary() || '';
        worldinfo = window.__longmem.getWorldInfoFor('') || [];
        events = window.__longmem.getKeyEvents() || [];
      }
    } catch(e){}
    var n = Math.min(3, st.turns.length);
    var lastTurns = st.turns.slice(-n).map(function(t, i){
      var idx = st.turns.length - n + i;
      var pt = (t.playerText || '').slice(0, 80);
      var nr = (t.narrative || '').slice(0, 800);
      return '[T' + idx + '] ' + pt + '\n' + nr;
    }).join('\n\n');
    var hero = (st.cast && st.cast.hero && st.cast.hero.name) || '主人公';
    var instruction = askThree
      ? '次に起こすべき「自然で、かつ物語を一段階前へ進める展開」を、雰囲気・方向の違う3案提案してください。各案30〜60字の日本語1行。' +
        '場所転換／新キャラ登場／状況急変／重要事実発覚／時間経過／関係性変化 のいずれかを動かす。物語のトーンを保ち、主人公(' + hero + ')が勝手に動かないようにする。' +
        '出力は番号付きで3行のみ。説明や前置きは一切不要。例：\n1. xxx\n2. yyy\n3. zzz'
      : '次に起こすべき「自然で、かつ物語を一段階前へ進める展開」を1つ、30〜60字の日本語1行で提案してください。' +
        '場所転換／新キャラ登場／状況急変／重要事実発覚／時間経過／関係性変化 のいずれかを動かす。物語のトーンを保ち、主人公(' + hero + ')が勝手に動かないようにする。' +
        '出力は提案文1行のみ。説明や前置きは一切不要。';
    return '日本語のホラーTRPGの次の展開を提案してください。\n\n' +
      'これまでのあらすじ：\n' + (summary || '(なし)') + '\n\n' +
      '登場人物・場所・物：\n' + (worldinfo.length ? worldinfo.map(function(w){return '- ' + w.name + '(' + w.type + ')：' + w.desc;}).join('\n') : '(なし)') + '\n\n' +
      '重要事象：\n' + (events.length ? events.map(function(e){return '- T' + e.turnIdx + '：' + e.event;}).join('\n') : '(なし)') + '\n\n' +
      '直近' + n + 'ターン：\n' + lastTurns + '\n\n' +
      '指示：' + instruction;
  }

  // ---------- submission helper ----------
  // v292Dfix140d: G.submit() takes NO arguments — it reads textarea#inp + current mode.
  // Correct flow: set textarea value → set mode → call G.submit().
  function submitAsStory(text){
    try {
      var t = String(text || '').trim();
      if (!t) return false;
      var ta = document.getElementById('inp');
      if (!ta) return false;
      ta.value = t;
      try { ta.dispatchEvent(new Event('input', { bubbles: true })); } catch(_){}
      try { ta.dispatchEvent(new Event('change', { bubbles: true })); } catch(_){}
      if (typeof G !== 'undefined' && G){
        if (typeof G.setMode === 'function'){
          try { G.setMode('STORY'); } catch(_){}
        }
        if (typeof G.submit === 'function'){
          G.submit();
          return true;
        }
      }
    } catch(e){
      try { console.warn(TAG, 'submitAsStory err:', e && e.message); } catch(_){}
    }
    return false;
  }

  // ---------- fix139: wrap 「続きを書く」button ----------
  function findContinueButton(){
    var btns = document.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++){
      var t = (btns[i].textContent || '').trim();
      if (t === '続きを書く') return btns[i];
    }
    return null;
  }
  function wrapContinueButton(){
    try {
      var b = findContinueButton();
      if (!b || b.__v292Dfix139Wrapped) return;
      b.__v292Dfix139Wrapped = true;
      var origOnClick = b.onclick;
      var origOriginalText = (b.textContent || '').trim();
      b.addEventListener('click', function(ev){
        // If LLM key missing → fall through to original behavior
        if (!getKey()){ return; }
        // Don't double-trigger if already busy
        if (b.__v292Dfix139Busy) return;
        try { ev.preventDefault(); ev.stopImmediatePropagation && ev.stopImmediatePropagation(); ev.stopPropagation && ev.stopPropagation(); } catch(_){}
        b.__v292Dfix139Busy = true;
        b.disabled = true;
        b.textContent = '📝続きを生成中…';
        // v292Dfix140c: hard safety net — force-restore button after 25s no matter what
        var restored = false;
        var restore = function(){
          if (restored) return; restored = true;
          b.disabled = false;
          b.__v292Dfix139Busy = false;
          b.textContent = origOriginalText;
        };
        var hardTimer = setTimeout(function(){
          if (!restored){
            restore();
            try { console.warn(TAG, 'fix139 hard timeout — restored button, calling original G.cont'); } catch(_){}
            try { if (typeof G !== 'undefined' && G && typeof G.cont === 'function') G.cont(); } catch(_){}
          }
        }, 25000);
        var prompt = buildProposalPrompt(false);
        if (!prompt){
          clearTimeout(hardTimer); restore();
          try { if (typeof G !== 'undefined' && G && typeof G.cont === 'function') G.cont(); } catch(_){}
          return;
        }
        llmCall(prompt, 0.85, 500, function(content){
          clearTimeout(hardTimer); restore();
          var proposal = content ? String(content).split('\n').filter(function(l){return l.trim();})[0] : '';
          proposal = proposal.replace(/^[\d\.\)：:\-\*\s]+/, '').trim().slice(0, 120);
          if (proposal && submitAsStory(proposal)){
            try { console.log(TAG, 'fix139 proposal submitted:', proposal.slice(0, 40)); } catch(_){}
          } else {
            // fallback to original G.cont
            try { if (typeof G !== 'undefined' && G && typeof G.cont === 'function') G.cont(); } catch(_){}
          }
        });
      }, true);  // capture phase so we run before any built-in handler
    } catch(e){}
  }

  // ---------- fix140: "✨展開を提案" button + 3-candidate popup ----------
  // v292Dfix140b: place ON THE LEFT of 「続きを書く」, inherit its class for visual parity
  function injectProposeButton(){
    try {
      if (document.querySelector('.v292Dfix140-propose-btn')) return;
      var anchor = findContinueButton();
      if (!anchor || !anchor.parentNode) return;
      var nb = document.createElement('button');
      // inherit anchor's CSS class so layout/font/padding match exactly
      nb.className = (anchor.className || '') + ' v292Dfix140-propose-btn';
      nb.textContent = '✨展開を提案';
      nb.onclick = function(){
        if (nb.disabled) return;
        if (!getKey()){ alert('OpenRouter APIキーが必要です（設定で登録してください）'); return; }
        nb.disabled = true;
        var origText = nb.textContent;
        nb.textContent = '✨3案を生成中…';
        // v292Dfix140c: hard safety net — always restore button after 25s
        var restored140 = false;
        var restore140 = function(){
          if (restored140) return; restored140 = true;
          nb.disabled = false;
          nb.textContent = origText;
        };
        var hardT = setTimeout(function(){
          if (!restored140){
            restore140();
            alert('提案の生成がタイムアウトしました。もう一度お試しください。');
            try { console.warn(TAG, 'fix140 hard timeout'); } catch(_){}
          }
        }, 25000);
        var prompt = buildProposalPrompt(true);
        if (!prompt){ clearTimeout(hardT); restore140(); return; }
        llmCall(prompt, 0.95, 700, function(content){
          clearTimeout(hardT); restore140();
          if (!content){ alert('提案の取得に失敗しました（ネットワーク or APIキー確認）'); return; }
          var options = parseOptions(content);
          if (!options.length){ alert('提案を解析できませんでした: ' + String(content).substring(0, 80)); return; }
          showCandidates(options);
        });
      };
      // INSERT TO THE LEFT of 続きを書く
      anchor.parentNode.insertBefore(nb, anchor);
      try { console.log(TAG, 'fix140 ✨展開を提案 button injected (left of 続きを書く)'); } catch(_){}
    } catch(e){}
  }

  // v292Dfix140b: robust parser handling multiple bullet/number formats
  function parseOptions(content){
    var s = String(content || '').trim();
    if (!s) return [];
    var lines = s.split(/\r?\n/);
    var options = [];
    // Pattern A: numbered/bulleted lines (1./2)/①/-/・/* etc.)
    for (var i = 0; i < lines.length && options.length < 3; i++){
      var L = lines[i].trim();
      if (!L) continue;
      // Match many leading markers: 1. 1) 1： 1: ①②③ - ・ * • > 」 「
      var m = L.match(/^[\s>「]*(?:\d+[\.\)、：:]?|[①②③④⑤⑥⑦⑧⑨⑩]|[\-\*・•])\s*[「]?\s*(.+?)\s*[」]?\s*$/);
      if (m && m[1] && m[1].length >= 5){
        options.push(m[1].slice(0, 150));
      }
    }
    if (options.length >= 1) return options.slice(0, 3);
    // Pattern B: fallback — split by sentence/paragraph, take first 3 chunks
    var chunks = s.split(/[\n。\.]/).map(function(c){return c.trim();}).filter(function(c){return c.length >= 8;});
    return chunks.slice(0, 3).map(function(c){return c.slice(0, 150);});
  }

  // v292Dfix140c: modal with backdrop (guaranteed visible, never hidden behind anything)
  function closePopup(){
    var p = document.querySelector('.v292Dfix140-backdrop');
    if (p && p.parentNode) p.parentNode.removeChild(p);
    var p2 = document.querySelector('.v292Dfix140-popup');
    if (p2 && p2.parentNode) p2.parentNode.removeChild(p2);
  }
  function showCandidates(options){
    closePopup();
    // Backdrop (full-screen semi-transparent overlay) — z-index max-1
    var bd = document.createElement('div');
    bd.className = 'v292Dfix140-backdrop';
    bd.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'bottom:0',
      'background:rgba(0,0,0,0.55)', 'z-index:2147483646', 'cursor:pointer'
    ].join(';');
    bd.onclick = closePopup;  // click outside → close
    document.body.appendChild(bd);
    // Centered modal popup — z-index max
    var pop = document.createElement('div');
    pop.className = 'v292Dfix140-popup';
    pop.style.cssText = [
      'position:fixed', 'left:50%', 'top:50%', 'transform:translate(-50%, -50%)',
      'background:#1a1a2a', 'border:2px solid #8a8aff', 'padding:18px 22px',
      'border-radius:12px', 'z-index:2147483647', 'max-width:640px', 'width:90vw',
      'max-height:80vh', 'overflow-y:auto',
      'box-shadow:0 12px 48px rgba(0,0,0,0.8), 0 0 32px rgba(138,138,255,0.3)',
      'color:#e0e0e0', 'font-size:14px', 'line-height:1.65',
      'font-family:inherit'
    ].join(';');
    pop.onclick = function(e){ e.stopPropagation(); };  // clicks inside don't close
    var hdr = document.createElement('div');
    hdr.style.cssText = 'margin-bottom:12px; opacity:0.85; font-size:13px; color:#a0a0ff;';
    hdr.textContent = '💡 次の展開の候補（クリックで採用）';
    pop.appendChild(hdr);
    var marks = ['①', '②', '③', '④', '⑤'];
    options.forEach(function(opt, idx){
      var item = document.createElement('div');
      item.className = 'v292Dfix140-item';
      item.style.cssText = 'background:#2a2a3a; border:1px solid #555; padding:12px 14px; margin-bottom:8px; border-radius:7px; cursor:pointer; transition:background 0.15s, border-color 0.15s;';
      item.textContent = (marks[idx] || (idx+1) + '.') + ' ' + opt;
      item.onmouseover = function(){ item.style.background = '#3a3a4f'; item.style.borderColor = '#8a8aff'; };
      item.onmouseout  = function(){ item.style.background = '#2a2a3a'; item.style.borderColor = '#555'; };
      item.onclick = function(e){
        e.stopPropagation();
        closePopup();
        submitAsStory(opt);
      };
      pop.appendChild(item);
    });
    var close = document.createElement('button');
    close.textContent = '✕ 閉じる（提案を採用しない）';
    close.style.cssText = 'margin-top:10px; background:#3a3a4a; border:1px solid #666; color:#ddd; padding:8px 14px; border-radius:6px; cursor:pointer; font-size:13px; width:100%; transition:background 0.15s;';
    close.onmouseover = function(){ close.style.background = '#4a4a5f'; };
    close.onmouseout  = function(){ close.style.background = '#3a3a4a'; };
    close.onclick = function(e){ e.stopPropagation(); closePopup(); };
    pop.appendChild(close);
    document.body.appendChild(pop);
    // ESC key closes
    var escHandler = function(e){
      if (e.key === 'Escape'){ closePopup(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);
  }

  // ---------- install: poll for buttons every 2s (UI may re-render) ----------
  function installAll(){
    try { wrapContinueButton(); } catch(e){}
    try { injectProposeButton(); } catch(e){}
  }
  setTimeout(installAll, 600);
  setTimeout(installAll, 1500);
  setTimeout(installAll, 3500);
  setInterval(installAll, 2500);

  try { console.log(TAG, 'continue-enhance active (fix139 cont-LLM + fix140 propose-3)'); } catch(_){}
})();
