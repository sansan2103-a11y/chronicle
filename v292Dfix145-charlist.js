// =====================================================================
// Chronicle TRPG — v292Dfix145: Character list modal
//
// Goals:
//   - Show all characters that have appeared in the story (hero + registered
//     NPCs + auto-extracted from long-mem worldinfo).
//   - Let the user PROMOTE auto-extracted characters to formal NPCs so they're
//     long-term-managed (voice profile, persistent avatar, settings panel).
//   - Let the user EDIT registered NPC descriptions inline.
//   - Provide a search box and a "→ add to input" helper.
//
// UX rationale (from user feedback):
//   - "長いターンやっていくうえでちゃんと成立する形" — formal promotion turns
//     transient story characters into persistent NPCs, so they don't get
//     forgotten between scenes.
//   - Inline editing means no need to dig into the settings panel.
//   - Search makes 10+ character lists usable.
//
// Reads:
//   - S.cast.hero / S.cast.npcs (registered)
//   - window.__longmem.raw.loadWorldInfo() (auto-extracted)
//   - S.turns (for last-seen turn + recent-line state extraction)
//   - window.__v292Dfix66.lookupAvatar(name) (avatar URL)
//
// Writes:
//   - S.cast.npcs.push(...) on promotion
//   - S.cast.npcs[i].desc = ... on edit
//   - S.save() on any change
//   - textarea#inp.value on "add to input"
// =====================================================================
(function v292Dfix145(){
  'use strict';
  if (window.__v292Dfix145) return;
  window.__v292Dfix145 = true;

  var TAG = '[v292Dfix145:charlist]';

  // ---------- helpers ----------
  function getState(){
    try { if (typeof S !== 'undefined' && S) return S; } catch(e){}
    return window.S || null;
  }
  function escHtml(s){
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function avatarUrlFor(name){
    try {
      if (window.__v292Dfix66 && typeof window.__v292Dfix66.lookupAvatar === 'function'){
        var u = window.__v292Dfix66.lookupAvatar(name);
        if (u) return u;
      }
    } catch(e){}
    return '';
  }
  function findLastTurnForName(name, turns){
    if (!name || !turns || !turns.length) return -1;
    for (var i = turns.length - 1; i >= 0; i--){
      var t = turns[i];
      if (!t) continue;
      var n = (t.narrative || '') + ' ' + (t.playerText || '');
      if (n.indexOf(name) >= 0) return i;
    }
    return -1;
  }
  // v292Dfix156(2026-05-30): format fix77 state-memory (体/心/本能) into a one-liner.
  // fix77 (window.__v292Dfix77Store[name] = {karada,kokoro,honno,turn}) is the state the
  // MODEL actually references and is updated EVERY turn — so it's fresher than longmem
  // worldinfo (rebuilt every 3 turns). Returns '' if no fix77 entry for this name.
  function fix77StateFor(name){
    try {
      var store = window.__v292Dfix77Store;
      if (!store || !name || !store[name]) return '';
      var s = store[name];
      var bits = [];
      if (s.karada) bits.push('からだ: ' + String(s.karada).slice(0, 48));
      if (s.kokoro) bits.push('こころ: ' + String(s.kokoro).slice(0, 40));
      if (s.honno)  bits.push('本能: ' + String(s.honno).slice(0, 40));
      return bits.length ? bits.join(' ／ ') : '';
    } catch(e){ return ''; }
  }
  function getStateForName(name, turns, npcDesc, worldDesc){
    // v292Dfix156: priority order for "状態" display:
    //   1. fix77 state-memory 体/心/本能 (updated EVERY turn — what the model references)
    //   2. longmem worldinfo desc (LLM-curated, rebuilt every 3 turns)
    //   3. Most recent narrative sentence mentioning the character (last 5 turns)
    //   4. "（まだ物語に登場していません）" placeholder
    var s77 = fix77StateFor(name);
    var _wd = (worldDesc && String(worldDesc).trim()) ? String(worldDesc).trim() : '';
    if (s77){
      // v292Dfix172: fix77(体/心/本能)は重大な恒久損傷(眼球喪失/欠損等)を取りこぼしたり
      //   古いターンで止まることがある。longmem worldinfo(物語から抽出した要約)に
      //   損傷・状況が入っていれば〔記録〕として併記し、状態欄の見落としを防ぐ。
      if (_wd && s77.indexOf(_wd.slice(0, 8)) < 0){
        return s77 + '  ／ 〔記録〕' + _wd.slice(0, 60);
      }
      return s77;
    }
    if (_wd){
      return _wd.slice(0, 120);
    }
    if (!name || !turns || !turns.length) return '（まだ物語に登場していません）';
    var recent = turns.slice(-5);
    var foundSent = '';
    for (var ti = recent.length - 1; ti >= 0 && !foundSent; ti--){
      var t = recent[ti];
      if (!t || !t.narrative) continue;
      var n = String(t.narrative).replace(/<[^>]+>/g, ' ');
      var sents = n.split(/[。\n]/).map(function(s){return s.trim();}).filter(Boolean);
      for (var si = sents.length - 1; si >= 0; si--){
        var s = sents[si];
        if (s.indexOf(name) >= 0 && s.length <= 100){
          foundSent = s.length > 70 ? s.slice(-70) : s;
          break;
        }
      }
    }
    return foundSent || '（まだ物語に登場していません）';
  }
  function turnDelta(lastTurn, curTurnCount){
    if (lastTurn < 0) return '未登場';
    if (curTurnCount <= 0) return 'T' + lastTurn;
    var d = curTurnCount - 1 - lastTurn;
    if (d === 0) return 'T' + lastTurn + '（最新）';
    return 'T' + lastTurn + '（' + d + 'ターン前）';
  }

  // ---------- data aggregation ----------
  function collectChars(){
    var st = getState();
    var out = { hero: null, npcs: [], story: [] };
    if (!st) return out;
    var turns = (st.turns || []);
    // v292Dfix145c: build a name→longmem-worldinfo map up front so EVERY character
    // (hero / npcs / story-extracted) can use the LLM-curated dynamic state desc.
    var wiByName = {};
    try {
      if (window.__longmem && window.__longmem.raw){
        var allWi = window.__longmem.raw.loadWorldInfo();
        allWi.forEach(function(w){
          if (w && w.name && w.type === 'character') wiByName[w.name] = w;
        });
      }
    } catch(e){}
    function lmDescFor(name){
      var w = wiByName[name];
      return (w && w.desc) ? w.desc : '';
    }
    var registered = {};
    if (st.cast){
      if (st.cast.hero && st.cast.hero.name){
        var h = st.cast.hero;
        registered[h.name] = true;
        var lt = findLastTurnForName(h.name, turns);
        out.hero = {
          name: h.name,
          desc: h.desc || '',
          state: getStateForName(h.name, turns, h.desc, lmDescFor(h.name)),
          lastTurn: lt,
          lastTurnLabel: turnDelta(lt, turns.length),
          isHero: true
        };
      }
      if (Array.isArray(st.cast.npcs)){
        st.cast.npcs.forEach(function(n, idx){
          if (!n || !n.name) return;
          registered[n.name] = true;
          var lt = findLastTurnForName(n.name, turns);
          out.npcs.push({
            name: n.name,
            desc: n.desc || '',
            state: getStateForName(n.name, turns, n.desc, lmDescFor(n.name)),
            lastTurn: lt,
            lastTurnLabel: turnDelta(lt, turns.length),
            npcIdx: idx
          });
        });
      }
    }
    // Story-appeared characters (worldinfo type=character not already in cast)
    // v292Dfix350: 登録キャラの短縮呼び(例「スピカ」←「スピカ・ヴァレン」)を別人として
    //   表示しない別名ガード。長さ2以上で一方が他方を完全包含=同一人物とみなす。
    var __regNames = Object.keys(registered);
    function __isAliasOfRegistered(nm){
      if(!nm || nm.length<2) return false;
      for(var _i=0;_i<__regNames.length;_i++){ var _r=__regNames[_i]; if(!_r||_r===nm) continue;
        if((_r.length>=2 && nm.indexOf(_r)>=0) || (nm.length>=2 && _r.indexOf(nm)>=0)) return true; }
      return false;
    }
    Object.keys(wiByName).forEach(function(nm){
      function __isVariantOfPeer(nm){ try{ var pool=Object.keys(wiByName); for(var i=0;i<pool.length;i++){ var b=pool[i]; if(b===nm) continue; if(nm.length>b.length && nm.slice(-b.length)===b) return true; } }catch(e){} return false; } // v292Dfix358: 「間延びした影」→「影」等、修飾語+既出名詞は同一として非表示
    if (registered[nm] || __isAliasOfRegistered(nm) || __isVariantOfPeer(nm)) return;
      var w = wiByName[nm];
      var lt = findLastTurnForName(nm, turns);
      out.story.push({
        name: nm,
        desc: w.desc || '',
        state: getStateForName(nm, turns, '', w.desc),
        lastTurn: lt,
        lastTurnLabel: turnDelta(lt, turns.length),
        isStory: true
      });
    });
    // sort story by lastTurn desc (most recent first)
    out.story.sort(function(a, b){ return b.lastTurn - a.lastTurn; });
    return out;
  }

  // ---------- modal close ----------
  function closeModal(){
    var b = document.querySelector('.v292Dfix145-backdrop');
    if (b && b.parentNode) b.parentNode.removeChild(b);
    var m = document.querySelector('.v292Dfix145-modal');
    if (m && m.parentNode) m.parentNode.removeChild(m);
  }

  // ---------- actions ----------
  function promoteToNpc(name, defaultDesc){
    var desc = prompt('「' + name + '」を NPC として登録します。\n説明（性格・見た目・関係性など）を入力してください：', defaultDesc || '');
    if (desc === null) return false;  // cancelled
    desc = String(desc).trim();
    if (!desc) desc = defaultDesc || '';
    try {
      var st = getState();
      if (!st || !st.cast){ alert('Stateが取得できません'); return false; }
      if (!Array.isArray(st.cast.npcs)) st.cast.npcs = [];
      // dup check
      for (var i = 0; i < st.cast.npcs.length; i++){
        if (st.cast.npcs[i] && st.cast.npcs[i].name === name){
          alert('「' + name + '」は既に NPC として登録されています');
          return false;
        }
      }
      st.cast.npcs.push({ name: name, desc: desc, appeared: true });
      if (typeof st.save === 'function') st.save();
      try { console.log(TAG, 'promoted to NPC:', name); } catch(_){}
      // re-render modal
      renderModal();
      return true;
    } catch(e){
      alert('登録に失敗しました: ' + e.message);
      return false;
    }
  }
  function editNpc(npcIdx, currentName, currentDesc){
    var newDesc = prompt('「' + currentName + '」の説明を編集：', currentDesc || '');
    if (newDesc === null) return false;
    newDesc = String(newDesc).trim();
    try {
      var st = getState();
      if (!st || !st.cast || !Array.isArray(st.cast.npcs) || !st.cast.npcs[npcIdx]){
        alert('編集対象が見つかりません'); return false;
      }
      st.cast.npcs[npcIdx].desc = newDesc;
      if (typeof st.save === 'function') st.save();
      // Invalidate avatar cache so the new description regenerates the icon
      try {
        if (window.__aiAvatar && typeof window.__aiAvatar.regen === 'function'){
          window.__aiAvatar.regen(currentName);
        }
      } catch(_){}
      renderModal();
      return true;
    } catch(e){
      alert('編集に失敗しました: ' + e.message);
      return false;
    }
  }
  function addToInput(name){
    try {
      var ta = document.getElementById('inp');
      if (!ta) return false;
      var cur = ta.value || '';
      var trimmed = cur.replace(/\s+$/, '');
      var insert;
      if (!trimmed){
        // empty input → just the name + 「は」 for natural sentence start
        insert = name + 'は';
      } else {
        // ensure 。 at end if not already
        var lastChar = trimmed.slice(-1);
        var needPunct = !/[。．！？!?,、…]/.test(lastChar);
        insert = trimmed + (needPunct ? '。' : '') + name + 'は';
      }
      ta.value = insert;
      try { ta.dispatchEvent(new Event('input', {bubbles:true})); } catch(_){}
      try { ta.dispatchEvent(new Event('change', {bubbles:true})); } catch(_){}
      ta.focus();
      // place cursor at end
      try { ta.selectionStart = ta.selectionEnd = ta.value.length; } catch(_){}
      closeModal();
      return true;
    } catch(e){ return false; }
  }

  // ---------- render ----------
  function renderModal(){
    var data = collectChars();
    var search = '';
    var prevModal = document.querySelector('.v292Dfix145-modal');
    if (prevModal){
      var prevSearch = prevModal.querySelector('.v292Dfix145-search');
      if (prevSearch) search = prevSearch.value || '';
    }
    closeModal();
    // backdrop
    var bd = document.createElement('div');
    bd.className = 'v292Dfix145-backdrop';
    bd.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.55); z-index:2147483646; cursor:pointer;';
    bd.onclick = closeModal;
    document.body.appendChild(bd);
    // modal
    var mo = document.createElement('div');
    mo.className = 'v292Dfix145-modal';
    mo.style.cssText = 'position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); background:#1a1a2a; border:2px solid #8a8aff; padding:18px 22px; border-radius:12px; z-index:2147483647; max-width:720px; width:92vw; max-height:85vh; overflow-y:auto; box-shadow:0 12px 48px rgba(0,0,0,0.8), 0 0 32px rgba(138,138,255,0.3); color:#e0e0e0; font-size:14px; line-height:1.55; font-family:inherit;';
    mo.onclick = function(e){ e.stopPropagation(); };
    // header
    var hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex; align-items:center; gap:10px; margin-bottom:14px;';
    hdr.innerHTML = '<div style="font-size:16px; color:#a0a0ff; flex:1;">👥 登場キャラ一覧</div>';
    var closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'background:#3a3a4a; border:1px solid #666; color:#ddd; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:14px;';
    closeBtn.onclick = closeModal;
    hdr.appendChild(closeBtn);
    mo.appendChild(hdr);
    // search
    var srInput = document.createElement('input');
    srInput.className = 'v292Dfix145-search';
    srInput.type = 'text';
    srInput.placeholder = '🔍 名前・状態で検索…';
    srInput.value = search;
    srInput.style.cssText = 'width:100%; box-sizing:border-box; padding:8px 12px; margin-bottom:14px; background:#2a2a3a; border:1px solid #555; border-radius:6px; color:#e0e0e0; font-size:13px;';
    srInput.oninput = function(){ applyFilter(srInput.value); };
    mo.appendChild(srInput);
    // body container (sections appended below)
    var body = document.createElement('div');
    body.className = 'v292Dfix145-body';
    mo.appendChild(body);

    function makeCard(c, kind){
      var card = document.createElement('div');
      card.className = 'v292Dfix145-card';
      card.setAttribute('data-name', c.name);
      card.setAttribute('data-state', c.state || '');
      card.style.cssText = 'display:flex; gap:12px; align-items:flex-start; background:#22222e; border:1px solid #444; padding:10px 12px; margin-bottom:8px; border-radius:8px;';
      // avatar
      var avWrap = document.createElement('div');
      avWrap.style.cssText = 'flex-shrink:0; width:56px; height:56px; border-radius:6px; overflow:hidden; background:#333; display:flex; align-items:center; justify-content:center; font-size:22px; color:#888;';
      var avUrl = avatarUrlFor(c.name);
      if (avUrl){
        var img = document.createElement('img');
        img.src = avUrl;
        img.alt = c.name;
        img.style.cssText = 'width:100%; height:100%; object-fit:cover;';
        img.onerror = function(){ if (avWrap){ avWrap.textContent = '?'; } };
        avWrap.appendChild(img);
      } else {
        avWrap.textContent = c.name.charAt(0);
      }
      card.appendChild(avWrap);
      // text col
      var col = document.createElement('div');
      col.style.cssText = 'flex:1; min-width:0;';
      var nameLine = document.createElement('div');
      nameLine.style.cssText = 'font-weight:bold; font-size:14px; margin-bottom:3px; color:#e0e0e0;';
      var prefix = (kind === 'hero') ? '⭐ ' : (kind === 'npc' ? '👤 ' : '👻 ');
      nameLine.textContent = prefix + c.name + '   ';
      var lastSpan = document.createElement('span');
      lastSpan.style.cssText = 'font-weight:normal; font-size:11px; color:#888;';
      lastSpan.textContent = '最終: ' + c.lastTurnLabel;
      nameLine.appendChild(lastSpan);
      col.appendChild(nameLine);
      var stateLine = document.createElement('div');
      stateLine.style.cssText = 'font-size:12px; color:#bcbcd0; margin-bottom:6px; line-height:1.4;';
      stateLine.textContent = c.state || '(状態情報なし)';
      col.appendChild(stateLine);
      // action buttons
      var btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex; gap:6px; flex-wrap:wrap;';
      function mkBtn(label, color, fn){
        var b = document.createElement('button');
        b.textContent = label;
        b.style.cssText = 'background:' + color + '; border:1px solid #666; color:#fff; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:11px;';
        b.onclick = function(e){ e.stopPropagation(); fn(); };
        return b;
      }
      if (kind === 'story'){
        btnRow.appendChild(mkBtn('⭐ NPCに昇格', '#5a5a9a', function(){ promoteToNpc(c.name, c.desc); }));
      } else if (kind === 'npc'){
        btnRow.appendChild(mkBtn('✏️ 編集', '#5a5a8a', function(){ editNpc(c.npcIdx, c.name, c.desc); }));
      }
      btnRow.appendChild(mkBtn('→ 入力に追加', '#4a4a6a', function(){ addToInput(c.name); }));
      // v292Dfix151: ↻ アイコン再生成 — invalidates AI avatar cache + regenerates from
      // current desc/context (handy when fix66 ncAppearance picked wrong context, e.g.
      // a human rescuer got generated as a skeleton because they appeared mid-skeleton-scene).
      btnRow.appendChild(mkBtn('↻ アイコン再生成', '#6a4a5a', function(){
        try {
          if (window.__aiAvatar && typeof window.__aiAvatar.regen === 'function'){
            window.__aiAvatar.regen(c.name);
            // re-render modal after a short delay so the new avatar URL appears
            setTimeout(renderModal, 1500);
          }
        } catch(e){}
      }));
      col.appendChild(btnRow);
      card.appendChild(col);
      return card;
    }
    function makeSection(title, color, items, kind){
      if (!items || !items.length) return null;
      var sec = document.createElement('div');
      sec.className = 'v292Dfix145-section';
      sec.style.cssText = 'margin-bottom:18px;';
      var st = document.createElement('div');
      st.style.cssText = 'font-size:12px; color:' + color + '; margin-bottom:8px; padding-bottom:4px; border-bottom:1px solid #3a3a4a;';
      st.textContent = title + '（' + items.length + '）';
      sec.appendChild(st);
      items.forEach(function(c){ sec.appendChild(makeCard(c, kind)); });
      return sec;
    }
    if (data.hero){
      var s1 = makeSection('⭐ 主役', '#ffd060', [data.hero], 'hero');
      if (s1) body.appendChild(s1);
    }
    var s2 = makeSection('👥 登録NPC', '#a0c0ff', data.npcs, 'npc');
    if (s2) body.appendChild(s2);
    var s3 = makeSection('👻 物語登場（自動抽出）', '#c080c0', data.story, 'story');
    if (s3) body.appendChild(s3);
    if (!data.hero && !data.npcs.length && !data.story.length){
      var empty = document.createElement('div');
      empty.style.cssText = 'text-align:center; padding:30px; color:#888;';
      empty.textContent = '登場キャラがまだありません';
      body.appendChild(empty);
    }
    document.body.appendChild(mo);
    if (search) applyFilter(search);
    // focus search
    try { srInput.focus(); } catch(_){}
    // ESC close
    var escHandler = function(e){
      if (e.key === 'Escape'){ closeModal(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);
  }

  function applyFilter(query){
    var mo = document.querySelector('.v292Dfix145-modal');
    if (!mo) return;
    var q = String(query || '').trim().toLowerCase();
    var cards = mo.querySelectorAll('.v292Dfix145-card');
    var sections = mo.querySelectorAll('.v292Dfix145-section');
    cards.forEach(function(c){
      if (!q){ c.style.display = ''; return; }
      var name = (c.getAttribute('data-name') || '').toLowerCase();
      var state = (c.getAttribute('data-state') || '').toLowerCase();
      if (name.indexOf(q) >= 0 || state.indexOf(q) >= 0) c.style.display = '';
      else c.style.display = 'none';
    });
    // hide empty sections
    sections.forEach(function(sec){
      var visible = 0;
      var cs = sec.querySelectorAll('.v292Dfix145-card');
      cs.forEach(function(cc){ if (cc.style.display !== 'none') visible++; });
      sec.style.display = visible > 0 ? '' : 'none';
    });
  }

  // ---------- inject header button ----------
  function injectHeaderButton(){
    try {
      if (document.querySelector('.v292Dfix145-charlist-btn')) return;
      // find an existing topbar selector (e.g., 進行 select) to anchor next to
      var sel = document.getElementById('v292-drama-sel') || document.getElementById('v292-react-sel') || document.querySelector('#v292-style-sel');
      var anchor = sel ? sel.closest('label') || sel.parentNode : null;
      if (!anchor || !anchor.parentNode) return;
      var b = document.createElement('button');
      b.className = 'v292Dfix145-charlist-btn';
      b.textContent = '👥 キャラ';
      b.title = '登場キャラ一覧';
      b.style.cssText = 'margin:0 4px; padding:6px 10px; background:#2a2a3a; border:1px solid #555; color:#e0e0e0; border-radius:6px; cursor:pointer; font-size:13px;';
      b.onclick = function(e){ e.preventDefault(); renderModal(); };
      // insert before settings button if possible
      var settings = null;
      var hostKids = anchor.parentNode.children;
      for (var i = 0; i < hostKids.length; i++){
        var txt = (hostKids[i].textContent || '').trim();
        if (/設定$/.test(txt) || txt.indexOf('⚙') >= 0){ settings = hostKids[i]; break; }
      }
      if (settings) anchor.parentNode.insertBefore(b, settings);
      else anchor.parentNode.appendChild(b);
      try { console.log(TAG, '👥 キャラ button injected'); } catch(_){}
    } catch(e){}
  }
  setTimeout(injectHeaderButton, 800);
  setTimeout(injectHeaderButton, 2500);
  setInterval(injectHeaderButton, 4000);

  // ---------- public API ----------
  window.__charlist = { open: renderModal, close: closeModal };

  try { console.log(TAG, 'character list active'); } catch(_){}
})();
