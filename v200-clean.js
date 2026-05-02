/* ============================================================
   v200-clean: unified replacement for v118-v147 patch chain.

   Design principles:
   - Event-driven, NOT interval-driven (no setInterval polling).
   - Idempotent: running any module twice produces the same result.
   - Single source of truth per concern.
   - Operates at localStorage + DOM observer level since UI is closure-bound.
   - Minimal logging, all gated through one logger that dedupes.

   Modules:
   - LOG: deduped logger
   - STATE: chr6 access + JP-only gender normalization + idempotent write
   - PARSER: inline 名前「セリフ」 extraction + nickname resolution + speaker validation
   - SANITIZER: drop body-part / abstract-noun / garbled speakers (per turn)
   - AVATAR: stable seed-based URL, fill missing only
   - PROMPT: inject inline-format + foreign-lang permissive
   - UI: scroll fix, throttled stream rebuild, button unsticker

   Lifecycle:
   - On localStorage.setItem('chr6', …): normalize, dedupe, write.
   - On chr6 turns array growth: run sanitize + avatar fill + ensure stream.
   - On DOM mutation in #dialogue-stream: only restyle/avatar-sync, no rebuild.
   ============================================================ */
(function v200(){
  'use strict';
  var TAG = '[v200]';
  if (window.__v200Active) return;
  window.__v200Active = true;

  /* ====================== LOG ====================== */
  var LOG = (function(){
    var seen = {};
    var DEDUPE_MS = 60000;
    function emit(level, msg){
      var key = level + ':' + msg;
      var now = Date.now();
      if (seen[key] && (now - seen[key]) < DEDUPE_MS) return;
      seen[key] = now;
      (console[level] || console.log).call(console, TAG, msg);
    }
    return {
      info: function(m){ emit('log', m); },
      warn: function(m){ emit('warn', m); },
      err: function(m){ emit('error', m); }
    };
  })();

  /* ====================== STATE ====================== */
  var STATE = (function(){
    var KEY = 'chr6';

    function read(){
      try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
      catch(e){ return {}; }
    }

    function normalizeGender(g){
      if (!g) return '';
      var s = String(g).trim().toLowerCase();
      if (s === 'female' || s === 'f' || g === '女性' || g === '女') return '女性';
      if (s === 'male' || s === 'm' || g === '男性' || g === '男') return '男性';
      return '';
    }

    function normalizeState(s){
      if (!s || typeof s !== 'object') return s;
      var c = s.cast || {};
      var changed = false;
      if (c.hero){
        var ng = normalizeGender(c.hero.gender);
        if (ng && ng !== c.hero.gender){ c.hero.gender = ng; changed = true; }
      }
      var npcs = c.npcs || [];
      npcs.forEach(function(n){
        if (!n) return;
        var ng = normalizeGender(n.gender);
        if (ng && ng !== n.gender){ n.gender = ng; changed = true; }
      });
      if (changed){ c.npcs = npcs; s.cast = c; }
      return s;
    }

    /* Hook localStorage.setItem to:
       - normalize gender to JP on every chr6 write
       - dedupe back-to-back identical writes within 600ms */
    var lastSig = '';
    var lastAt = 0;
    var origSet = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function(key, value){
      if (key === KEY){
        try {
          var s = JSON.parse(value);
          s = normalizeState(s);
          value = JSON.stringify(s);
        } catch(e){}
        var sig = value.length + ':' + value.charCodeAt(value.length >>> 1);
        var now = Date.now();
        if (sig === lastSig && (now - lastAt) < 600) return;
        lastSig = sig; lastAt = now;
      }
      return origSet(key, value);
    };

    /* Detect new turn: chr6.turns array growth */
    var lastTurnCount = 0;
    function checkNewTurn(){
      var s = read();
      var t = (s.turns || []).length;
      if (t > lastTurnCount){
        lastTurnCount = t;
        return s;
      }
      lastTurnCount = t;
      return null;
    }

    return {
      read: read,
      normalizeGender: normalizeGender,
      normalizeState: normalizeState,
      checkNewTurn: checkNewTurn,
      writeRaw: function(s){
        try { origSet(KEY, JSON.stringify(s)); } catch(e){}
      }
    };
  })();

  /* ====================== PARSER ====================== */
  var PARSER = (function(){
    /* Extract inline 名前「セリフ」 / 名前《内心》 from narrative.
       Returns array of {speaker, text, inner}. */
    function extractInline(narrative){
      if (!narrative) return [];
      var out = [];
      var rx = /(?:^|[\n。])([一-鿿ぁ-ゖァ-ヺ・A-Z]{2,12})(「([^「」\n]{1,300})」|《([^《》\n]{1,300})》)/g;
      var m;
      while ((m = rx.exec(narrative)) !== null){
        var name = m[1];
        if (!isValidSpeaker(name)) continue;
        var inner = !!m[4];
        var text = m[3] || m[4];
        out.push({ speaker: name, text: text, inner: inner });
      }
      return out;
    }

    /* Speaker validation: reject body parts, particles, verbs, abstract nouns. */
    var BODY_PARTS = /(手|声|目|顔|肌|髪|血|涙|息|胸|腰|腕|足|指|口|耳|背|腹|肩|首|頬|唇|舌|歯|爪|肘|膝|踝|尻|股|膣|陰|穴|肉|骨|筋|腱|脈|皮|毛|汗|息|蕾|突起)$/;
    var BAD_NOUNS = /^(夕暮れ|今は人|二つの|埃に埋|冷や汗|怪我|一体誰|三人|貴方|彼|彼女|此処|其処|何|誰|今|昔|これ|それ|あれ|私|俺|僕|あたし|拙者)$/;
    var PARTICLE_PRESENT = /[をはがにへもまでよりからとや]/;
    var VERB_FORM = /(した|して|する|される|られる|である|ている|った|たい|ない|だっ|だが)/;

    function isValidSpeaker(name){
      if (!name || name.length < 2 || name.length > 12) return false;
      if (BODY_PARTS.test(name)) return false;
      if (BAD_NOUNS.test(name)) return false;
      if (PARTICLE_PRESENT.test(name)) return false;
      if (VERB_FORM.test(name)) return false;
      if (name.indexOf('の') >= 0) return false;
      if (/^[ぁ-ゖ]+$/.test(name) && name.length < 4) return false;
      return true;
    }

    /* Resolve nickname to canonical full name (e.g. アリア → アリア・リュミエール) */
    function resolveCanonical(name, state){
      if (!name) return null;
      var c = state.cast || {};
      var hero = c.hero || {};
      function nicknames(full){
        if (!full) return [];
        var out = [full];
        if (full.indexOf('・') >= 0){
          full.split('・').forEach(function(p){ if (p && p.length >= 2) out.push(p); });
        }
        return out;
      }
      if (hero.name){
        var hns = nicknames(hero.name);
        for (var i = 0; i < hns.length; i++) if (hns[i] === name) return hero.name;
      }
      var npcs = c.npcs || [];
      for (var j = 0; j < npcs.length; j++){
        if (!npcs[j] || !npcs[j].name) continue;
        var nns = nicknames(npcs[j].name);
        for (var k = 0; k < nns.length; k++) if (nns[k] === name) return npcs[j].name;
      }
      return name; /* leave as-is for ephemeral NPCs */
    }

    /* Filter dialogues: drop empty/marker-only + resolve canonicals */
    function cleanDialogues(dialogues, state){
      if (!dialogues || !Array.isArray(dialogues)) return dialogues;
      return dialogues.filter(function(d){
        if (!d || !d.text) return false;
        var trimmed = String(d.text).trim();
        if (!trimmed) return false;
        if (/^[「」《》（）()\s]*$/.test(trimmed)) return false;
        if (/^[（(](プレイヤー|player|モブ|narrator|地の文)[）)]?$/i.test(trimmed)) return false;
        return true;
      }).map(function(d){
        if (d.speaker){
          var canonical = resolveCanonical(d.speaker.replace(/[（(].+?[）)]\s*$/, '').trim(), state);
          if (canonical && canonical !== d.speaker) d.speaker = canonical;
          if (!isValidSpeaker(d.speaker)) d.speaker = '???';
        }
        return d;
      });
    }

    return {
      extractInline: extractInline,
      cleanDialogues: cleanDialogues,
      isValidSpeaker: isValidSpeaker,
      resolveCanonical: resolveCanonical
    };
  })();

  /* ====================== AVATAR ====================== */
  var AVATAR = (function(){
    function isValid(url){
      return !!(url && /^https?:\/\//.test(url) && url.length > 30);
    }

    function stableUrl(name, gender){
      var p = 'anime portrait, ';
      var g = STATE.normalizeGender(gender);
      if (g === '女性') p += 'beautiful young woman, ';
      else if (g === '男性') p += 'handsome young man, ';
      else p += 'a person, ';
      p += name + ', detailed face, dark fantasy';
      var seed = 0;
      for (var i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) & 0x7fffffff;
      if (g) seed = (seed ^ g.charCodeAt(0)) & 0x7fffffff;
      return 'https://image.pollinations.ai/prompt/' + encodeURIComponent(p) +
             '?width=384&height=384&seed=' + seed + '&nologo=true&model=flux';
    }

    /* Force-regenerate URL with new random seed (for user-clicked regen) */
    function regenUrl(name, gender){
      var p = 'anime portrait, ';
      var g = STATE.normalizeGender(gender);
      if (g === '女性') p += 'beautiful young woman, ';
      else if (g === '男性') p += 'handsome young man, ';
      else p += 'a person, ';
      p += name + ', detailed face, dark fantasy';
      var seed = Math.floor(Math.random() * 0x7fffffff);
      return 'https://image.pollinations.ai/prompt/' + encodeURIComponent(p) +
             '?width=384&height=384&seed=' + seed + '&nologo=true&model=flux';
    }

    /* Idempotent fill: only adds avatar if missing. */
    function fillMissing(state){
      var c = state.cast || {};
      var changed = false;
      if (c.hero && c.hero.name && !isValid(c.hero.avatar)){
        c.hero.avatar = stableUrl(c.hero.name, c.hero.gender);
        changed = true;
      }
      var npcs = c.npcs || [];
      npcs.forEach(function(n){
        if (n && n.name && !isValid(n.avatar)){
          n.avatar = stableUrl(n.name, n.gender);
          changed = true;
        }
      });
      var eph = state.ephemerals || {};
      Object.keys(eph).forEach(function(name){
        var e = eph[name];
        if (e && !isValid(e.avatar)){
          e.avatar = stableUrl(name, '');
          changed = true;
        }
      });
      if (changed){
        c.npcs = npcs;
        state.cast = c;
        state.ephemerals = eph;
      }
      return changed;
    }

    /* Lookup avatar URL by speaker name (registered or ephemeral). */
    function urlFor(name, state){
      var c = state.cast || {};
      var hero = c.hero || {};
      if (hero.name === name && isValid(hero.avatar)) return hero.avatar;
      var npcs = c.npcs || [];
      for (var i = 0; i < npcs.length; i++){
        if (npcs[i] && npcs[i].nqme === name && isValid(npcs[i].avatar)) return npcs[i].avatar;
      }
      var eph = state.ephemerals || {};
      if (eph[name] && isValid(eph[name].avatar)) return eph[name].avatar;
      /* not found, register as ephemeral with stable URL */
      state.ephemerals = state.ephemerals || {};
      if (!state.ephemerals[name]){
        state.ephemerals[name] = { avatar: stableUrl(name, ''), firstSeen: Date.now() };
        return state.ephemerals[name].avatar;
      }
      return null;
    }

    return { isValid: isValid, stableUrl: stableUrl, regenUrl: regenUrl, fillMissing: fillMissing, urlFor: urlFor };
  })();

  /* ====================== SANITIZER ====================== */
  var SANITIZER = (function(){
    /* Strip JSON DIALOGUES blob + status-list metadata from narrative. */
    function cleanNarrative(text){
      if (!text) return text;
      var out = text;
      /* Strip <DIALOGUES>...</DIALOGUES> */
      out = out.replace(/<DIALOGUES>[\s\S]*?<\/DIALOGUES>/g, '');
      /* Strip leading JSON-like blob */
      out = out.replace(/^\s*\{\s*"dialogues"[\s\S]*?\}\s*\n/, '');
      /* Status list lines (信頼: 50 / 緊張: 30 etc.) */
      out = out.replace(/^[（(]?(信頼|緊張|興奮|愛着|嫉妬|警戒)[:：]\s*[+\-]?\d+[）)]?\s*$/gm, '');
      /* Garbled hiragana+katakana mix (e.g. ちァト) */
      out = out.replace(/([ぁ-ゖ])([ァィゥェォャュョッ]+)/g, '$1');
      return out.trim();
    }

    /* Per-turn sanitize: clean dialogues + narrative. Returns true if changed. */
    function sanitizeTurn(turn, state){
      if (!turn) return false;
      var changed = false;
      if (turn.narrative){
        var n = cleanNarrative(turn.narrative);
        if (n !== turn.narrative){ turn.narrative = n; changed = true; }
      }
      if (turn.dialogues && Array.isArray(turn.dialogues)){
        var before = JSON.stringify(turn.dialogues);
        var inline = PARSER.extractInline(turn.narrative || '');
        if (inline.length > 0){
          turn.dialogues = inline.map(function(d){ return { speaker: d.speaker, text: d.text, inner: d.inner }; });
        }
        turn.dialogues = PARSER.cleanDialogues(turn.dialogues, state);
        if (JSON.stringify(turn.dialogues) !== before) changed = true;
        /* Auto-register speakers as ephemerals so AVATAR.urlFor works */
        turn.dialogues.forEach(function(d){
          if (d && d.speaker && d.speaker !== '???'){
            AVATAR.urlFor(d.speaker, state);
          }
        });
      }
      return changed;
    }

    function sanitizeAllTurns(state){
      var turns = state.turns || [];
      var anyChanged = false;
      turns.forEach(function(t){ if (sanitizeTurn(t, state)) anyChanged = true; });
      return anyChanged;
    }

    return { cleanNarrative: cleanNarrative, sanitizeTurn: sanitizeTurn, sanitizeAllTurns: sanitizeAllTurns };
  })();

  /* ====================== PROMPT ====================== */
  var PROMPT = (function(){
    var INLINE_INSTRUCTION = '\n\n# 会話の表記形式（最重要・厳守）\nnarrative内の全ての会話は必ず以下の**台本形式**で書いてください：\n\n**話者名「セリフ」** の形式（話者名と「」の間にスペースなし）\n\n## 良い例\n```\n盗賊「動くな、嬢ちゃん」\nセシリア「あなたたちは何者？」\nセシリア《どうしてこんなことに…》\n```\n\n## ルール\n- 通常会話：**話者名「セリフ」**\n- 心の声・内心：**話者名《内心》**\n- 同じ盗賊が複数いる場合は「盗賊A」「盗賊B」で区別\n- 地の文（情景描写）は通常通り書く\n';

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
                if (!/会話の表記形式/.test(body.messages[i].content || '')){
                  body.messages[i].content = (body.messages[i].content || '') + INLINE_INSTRUCTION;
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

    /* Permissive foreign-language check that won't trigger spurious retries.
       Also intercept and swallow the "外国語混入を検出" log so any patch listening
       for it (in case one isn't disabled) won't trigger a retry. */
    var origConsoleLog = console.log;
    console.log = function(){
      var args = Array.prototype.slice.call(arguments);
      var s = args.map(function(a){ return typeof a === 'string' ? a : ''; }).join(' ');
      if (/外国語混入を検出/.test(s)) return;
      return origConsoleLog.apply(console, args);
    };

    LOG.info('prompt instruction injected + foreign-lang trigger swallowed');
  })();

  /* ====================== UI ====================== */
  var UI = (function(){
    /* Inject scroll CSS once. */
    function injectCSS(){
      if (document.getElementById('v200-css')) return;
      var style = document.createElement('style');
      style.id = 'v200-css';
      style.textContent = [
        '#dialogue-stream{',
        '  max-height:calc(100vh - 280px) !important;',
        '  overflow-y:auto !important;',
        '  overflow-x:hidden !important;',
        '  scrollbar-width:thin !important;',
        '  scrollbar-color:var(--acc, #8b76f0) transparent !important;',
        '  transition:opacity 200ms;',
        '}',
        '#dialogue-stream::-webkit-scrollbar{width:8px}',
        '#dialogue-stream::-webkit-scrollbar-thumb{background:var(--acc, #8b76f0);border-radius:4px}',
        '#dialogue-stream::-webkit-scrollbar-track{background:transparent}',
        '@media (max-width:768px){#dialogue-stream{max-height:50vh !important}}'
      ].join('\n');
      document.head.appendChild(style);
    }

    /* Re-attribute card avatars to match state. Idempotent: only updates
       cards whose <img>.src doesn't already match. Throttled. */
    var lastSync = 0;
    var SYNC_INTERVAL = 1500;
    function syncCardAvatars(){
      var now = Date.now();
      if (now - lastSync < SYNC_INTERVAL) return;
      lastSync = now;

      var stream = document.getElementById('dialogue-stream');
      if (!stream) return;
      var state = STATE.read();
      stream.querySelectorAll('.v101-dlg-card').forEach(function(card){
        var nameEl = card.children[1] && card.children[1].children[0];
        if (!nameEl) return;
        var speaker = (nameEl.innerText || '').trim();
        if (!speaker || speaker === '???') return;
        var expected = AVATAR.urlFor(speaker, state);
        if (!AVATAR.isValid(expected)) return;
        var avatarDiv = card.children[0];
        if (!avatarDiv) return;
        var img = avatarDiv.querySelector('img');
        if (img && img.src === expected) return;
        avatarDiv.innerHTML = '';
        var newImg = document.createElement('img');
        newImg.src = expected;
        newImg.alt = speaker;
        newImg.style.cssText = 'width:100%;height:100%;object-fit:cover';
        avatarDiv.appendChild(newImg);
      });
    }

    /* Stuck-button unsticker: any disabled submit button >60s gets re-enabled. */
    var disabledTracker = new WeakMap();
    function unstickButtons(){
      var btns = document.querySelectorAll('button:disabled');
      btns.forEach(function(b){
        var label = (b.textContent || '').trim();
        if (!/送信|▶|send|submit/i.test(label) && b.id !== 'send' && b.id !== 'submit') return;
        var since = disabledTracker.get(b);
        if (!since){
          disabledTracker.set(b, Date.now());
          return;
        }
        if (Date.now() - since > 60000){
          b.disabled = false;
          disabledTracker.delete(b);
          LOG.warn('unstuck submit button after 60s');
        }
      });
    }

    /* Stuck-loading unsticker: loading indicator visible >90s gets hidden. */
    var loadingTracker = new WeakMap();
    function unstickLoading(){
      var indicators = document.querySelectorAll('.loading, #loading, [class*="loading"], [class*="紡い"]');
      indicators.forEach(function(el){
        if (el.style.display === 'none' || !el.offsetParent) return;
        var since = loadingTracker.get(el);
        if (!since){
          loadingTracker.set(el, Date.now());
          return;
        }
        if (Date.now() - since > 90000){
          el.style.display = 'none';
          loadingTracker.delete(el);
          LOG.warn('hid stuck loading indicator after 90s');
        }
      });
    }

    return { injectCSS: injectCSS, syncCardAvatars: syncCardAvatars, unstickButtons: unstickButtons, unstickLoading: unstickLoading };
  })();

  /* ====================== ORCHESTRATOR ====================== */
  /* Single MutationObserver on body. Triggers:
     - On #dialogue-stream child changes → syncCardAvatars (throttled).
     - On chr6 setItem → handled at hook level (already).
     Plus a single light timer (5s) for unstick checks. */
  function bootstrap(){
    UI.injectCSS();

    /* Initial sanitize + avatar fill */
    setTimeout(function(){
      var s = STATE.read();
      var changedSan = SANITIZER.sanitizeAllTurns(s);
      var changedAv = AVATAR.fillMissing(s);
      if (changedSan || changedAv) STATE.writeRaw(s);
      UI.syncCardAvatars();
      LOG.info('initial sanitize+fill complete');
    }, 800);

    /* Stream observer: sync avatars on card changes */
    var stream = document.getElementById('dialogue-stream');
    if (stream){
      var mo = new MutationObserver(function(){ UI.syncCardAvatars(); });
      mo.observe(stream, { childList: true, subtree: true });
    }

    /* New-turn detector: poll lightly every 2s for chr6.turns growth.
       This is the ONLY periodic timer in v200. Cheap. */
    setInterval(function(){
      var s = STATE.checkNewTurn();
      if (s){
        SANITIZER.sanitizeAllTurns(s);
        AVATAR.fillMissing(s);
        STATE.writeRaw(s);
        setTimeout(UI.syncCardAvatars, 200);
      }
      UI.unstickButtons();
      UI.unstickLoading();
    }, 2000);

    LOG.info('v200 bootstrap complete');
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

  /* Public API for debugging */
  window.__v200 = { STATE: STATE, PARSER: PARSER, AVATAR: AVATAR, SANITIZER: SANITIZER, UI: UI };

  console.log(TAG, 'v200 loaded — replaces v118-v147 chain');
})();
