/* v130: Loading overlay + speech-verb anchored speaker re-attribution */
(function v130(){
  'use strict';
  var TAG = '[v130]';
  if (window.__v130Active) return;
  window.__v130Active = true;

  var SPEECH_VERBS = /(言う|言った|言って|呟く|呟いた|呟いて|呟き|叫ぶ|叫んだ|叫んで|叫び|問う|問うた|問い|答える|答えた|答え|応える|応えた|応え|返す|返した|笑う|笑った|笑って|笑い|怒鳴る|怒鳴った|怒鳴って|嘲る|嘲った|嘲り|罵る|罵った|罵り|喚く|喚いた|喚き|喘ぐ|喘いだ|呻く|呻いた|呻き|囁く|囁いた|囁き|懇願|嘆願|命じ|告げ|呼ぶ|呼んだ|呼び|尋ね|訊く|訊いた|訊き|問いか|つぶやい|もらし|漏らし|繰り返|つぶや|なおも|応じ|つぶ|笑み|微笑|溜息|ため息)/;

  function ensureOverlay(){
    var ov = document.getElementById('v130-loading');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'v130-loading';
    ov.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:9999;background:rgba(8,8,16,0.55);backdrop-filter:blur(2px);pointer-events:none;';
    ov.innerHTML = '<div style="background:rgba(20,20,30,0.95);border:1px solid rgba(139,118,240,0.35);border-radius:14px;padding:22px 36px;display:flex;align-items:center;gap:16px;box-shadow:0 12px 40px rgba(0,0,0,0.6);"><div style="width:22px;height:22px;border:2.5px solid rgba(139,118,240,0.25);border-top-color:rgba(196,164,69,0.95);border-radius:50%;animation:v130spin 0.8s linear infinite"></div><div style="font-size:14px;color:#e0dcf0;letter-spacing:0.05em;font-weight:600;">物語を紡いでます…</div></div>';
    document.body.appendChild(ov);
    if (!document.getElementById('v130-style')){
      var st = document.createElement('style');
      st.id = 'v130-style';
      st.textContent = '@keyframes v130spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}';
      document.head.appendChild(st);
    }
    return ov;
  }
  function showLoading(){ var ov = ensureOverlay(); ov.style.display = 'flex'; }
  function hideLoading(){ var ov = ensureOverlay(); ov.style.display = 'none'; }

  var origFetch = window.fetch.bind(window);
  var pendingCount = 0;
  window.fetch = function(input, init){
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var isApi = /openrouter\.ai|api\.anthropic\.com|api\.openai\.com/.test(url);
    if (isApi){ pendingCount++; showLoading(); }
    var p = origFetch(input, init);
    if (isApi){
      p.finally(function(){
        pendingCount = Math.max(0, pendingCount - 1);
        if (pendingCount === 0) hideLoading();
      });
    }
    return p;
  };

  function getCast(){ try { return JSON.parse(localStorage.getItem('chr6') || '{}'); } catch(e){ return {}; } }

  function findSpeechSpeaker(narr, dlgText){
    if (!narr || !dlgText) return null;
    var idx = narr.indexOf('「' + dlgText);
    if (idx < 0) idx = narr.indexOf(dlgText);
    if (idx < 0) return null;
    var window2 = narr.slice(Math.max(0, idx - 250), idx);
    var rx = /([一-鿿ぁ-ゖァ-ヺ・]{2,12})(?:は|が|もまた|も)([^「\n。]{0,40})/g;
    var m, lastMatch = null;
    while ((m = rx.exec(window2)) !== null){
      var name = m[1];
      var tail = m[2];
      if (SPEECH_VERBS.test(tail) || /[「]$/.test(tail)){ lastMatch = name; }
    }
    if (!lastMatch) return null;
    var s = getCast();
    var c = s.cast || {};
    if (c.hero && c.hero.name === lastMatch) return { name: c.hero.name, avatar: c.hero.avatar || '', isHero: true };
    var npcs = c.npcs || [];
    for (var i = 0; i < npcs.length; i++){ if (npcs[i] && npcs[i].name === lastMatch) return { name: npcs[i].name, avatar: npcs[i].avatar || '', isHero: false }; }
    if (s.ephemerals && s.ephemerals[lastMatch]){ return { name: lastMatch, avatar: s.ephemerals[lastMatch].avatar || '', isHero: false }; }
    return null;
  }

  function reAttribute(){
    var stream = document.getElementById('dialogue-stream');
    if (!stream) return;
    var cards = stream.querySelectorAll('.v101-dlg-card');
    var s = getCast();
    var turns = s.turns || [];
    var allNarr = turns.map(function(t){ return t.narrative || ''; }).join('\n\n');

    cards.forEach(function(c){
      var body = c.children[1];
      var nameEl = body && body.children[0];
      var textEl = body && body.children[1];
      if (!nameEl || !textEl) return;
      var currentName = nameEl.innerText;
      var text = textEl.innerText;
      var innerMatch = text.match(/^《(.+)》$/);
      if (innerMatch) return;
      var speaker = findSpeechSpeaker(allNarr, text);
      if (speaker && speaker.name !== currentName){
        nameEl.innerText = speaker.name;
        var avatarDiv = c.children[0];
        if (avatarDiv){
          avatarDiv.innerHTML = '';
          if (speaker.avatar){
            var img = document.createElement('img');
            img.src = speaker.avatar; img.alt = speaker.name;
            img.style.cssText = 'width:100%;height:100%;object-fit:cover';
            avatarDiv.appendChild(img);
          } else { avatarDiv.textContent = speaker.name.slice(0, 1); }
        }
        c.classList.toggle('hero', !!speaker.isHero);
      }
    });
  }

  function init(){
    ensureOverlay();
    setTimeout(reAttribute, 1000);
    setTimeout(reAttribute, 3500);
    setTimeout(reAttribute, 7000);
    var stream = document.getElementById('dialogue-stream');
    if (stream){
      var obs = new MutationObserver(function(){
        clearTimeout(window.__v130tmr);
        window.__v130tmr = setTimeout(reAttribute, 500);
      });
      obs.observe(stream, { childList: true, subtree: false });
    }
  }

  if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', init); }
  else { init(); }

  console.log(TAG, 'v130 active: loading overlay + speech-verb attribution');
})();
