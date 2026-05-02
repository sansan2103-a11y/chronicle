/* v201-render: dialogue card renderer for v200's stream.
   Builds .v101-dlg-card elements from chr6.turns[*].dialogues into #dialogue-stream.
   Idempotent: tags each card with data-turn-idx and data-dlg-idx, only adds missing.
   Listens to v200's checkNewTurn cycle via interval (cheap). */
(function v201(){
  'use strict';
  var TAG = '[v201]';
  if (window.__v201Active) return;
  window.__v201Active = true;

  function read(){
    try { return JSON.parse(localStorage.getItem('chr6') || '{}'); }
    catch(e){ return {}; }
  }

  function urlFor(name, state){
    if (window.__v200 && window.__v200.AVATAR) return window.__v200.AVATAR.urlFor(name, state);
    /* fallback if v200 missing */
    var c = state.cast || {}, hero = c.hero || {}, npcs = c.npcs || [], eph = state.ephemerals || {};
    if (hero.name === name && hero.avatar) return hero.avatar;
    for (var i = 0; i < npcs.length; i++){
      if (npcs[i] && npcs[i].name === name && npcs[i].avatar) return npcs[i].avatar;
    }
    if (eph[name] && eph[name].avatar) return eph[name].avatar;
    return null;
  }

  function buildCard(speaker, text, inner, avatarUrl){
    var card = document.createElement('div');
    card.className = 'v101-dlg-card';
    card.style.cssText = [
      'display:flex','gap:12px','padding:12px','margin:8px 0',
      'background:rgba(139,118,240,0.05)','border-left:3px solid var(--acc, #8b76f0)',
      'border-radius:6px','align-items:flex-start'
    ].join(';');

    var avatarDiv = document.createElement('div');
    avatarDiv.style.cssText = 'width:48px;height:48px;flex-shrink:0;border-radius:50%;overflow:hidden;background:#222';
    if (avatarUrl){
      var img = document.createElement('img');
      img.src = avatarUrl;
      img.alt = speaker;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover';
      avatarDiv.appendChild(img);
    }
    card.appendChild(avatarDiv);

    var meta = document.createElement('div');
    meta.style.cssText = 'flex:1;min-width:0';
    var nameEl = document.createElement('div');
    nameEl.textContent = speaker;
    nameEl.style.cssText = 'font-weight:600;color:var(--acc, #8b76f0);font-size:13px;margin-bottom:4px';
    meta.appendChild(nameEl);
    var textEl = document.createElement('div');
    textEl.textContent = inner ? '《' + text + '》' : '「' + text + '」';
    textEl.style.cssText = 'color:var(--tx, #e0dcf0);font-size:14px;line-height:1.5;' + (inner ? 'font-style:italic;opacity:.85' : '');
    meta.appendChild(textEl);
    card.appendChild(meta);
    return card;
  }

  function renderStream(){
    var stream = document.getElementById('dialogue-stream');
    if (!stream) return;
    var state = read();
    var turns = state.turns || [];

    /* Idempotent: build full target list, diff against existing cards */
    var desired = [];
    turns.forEach(function(t, ti){
      if (!t.dialogues || !Array.isArray(t.dialogues)) return;
      t.dialogues.forEach(function(d, di){
        if (!d || !d.text || !d.speaker || d.speaker === '???') return;
        desired.push({ turnIdx: ti, dlgIdx: di, speaker: d.speaker, text: d.text, inner: !!d.inner });
      });
    });

    /* Existing cards keyed by data-turn-idx-data-dlg-idx */
    var existing = {};
    stream.querySelectorAll('.v101-dlg-card[data-turn-idx]').forEach(function(c){
      var k = c.dataset.turnIdx + '-' + c.dataset.dlgIdx;
      existing[k] = c;
    });

    /* Add missing in order; remove any not in desired */
    var keepKeys = {};
    desired.forEach(function(d){
      var key = d.turnIdx + '-' + d.dlgIdx;
      keepKeys[key] = true;
      if (existing[key]) return;
      var avatar = urlFor(d.speaker, state);
      var card = buildCard(d.speaker, d.text, d.inner, avatar);
      card.dataset.turnIdx = d.turnIdx;
      card.dataset.dlgIdx = d.dlgIdx;
      stream.appendChild(card);
    });
    Object.keys(existing).forEach(function(k){
      if (!keepKeys[k]) existing[k].remove();
    });

    /* Auto-scroll to bottom if user is near bottom */
    if (stream.scrollHeight - stream.scrollTop - stream.clientHeight < 100){
      stream.scrollTop = stream.scrollHeight;
    }
  }

  function init(){
    setTimeout(renderStream, 1200); /* after v200 sanitize */
    setInterval(renderStream, 2000); /* cheap, idempotent */
    console.log(TAG, 'v201 active: stream renderer');
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.__v201render = renderStream;
})();
