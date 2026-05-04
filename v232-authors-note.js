/* v232-authors-note:
   AI Dungeon 風の "Author's Note" 機能。
   ユーザーが「物語の語り口・スタイル指示」を永続的に書いておけるテキストエリアを
   設定パネルに追加し、毎ターンのシステムプロンプト末尾（最も影響強い位置）に注入する。

   - localStorage の chr6.cfg.authorsNote に保存
   - 入力欄が空なら何も注入しない
   - センチネル文字列で重複注入を防止
   - v228/v231 など既存の fetch フックと共存（chain）
*/
(function v232(){
  'use strict';
  if (window.__v232Active) return;
  window.__v232Active = true;


  /* v23X-fix: codebase exposes top-level `const UI`, not window.UI.
     Bridge once so the rest of the patch (which uses window.UI) just works. */
  if (typeof UI !== 'undefined' && !window.UI) { try { window.UI = UI; } catch(_e){} }
  var FIELD_ID   = 'cfgAuthorsNote';
  var SECTION_ID = 'v232-authors-section';
  var SENTINEL   = '# 📝 物語の語り口メモ（Author\'s Note）';

  function readState(){
    try { return JSON.parse(localStorage.getItem('chr6') || '{}'); }
    catch(e){ return {}; }
  }
  function writeNoteImmediate(val){
    try {
      var s = JSON.parse(localStorage.getItem('chr6') || '{}');
      s.cfg = s.cfg || {};
      s.cfg.authorsNote = val;
      localStorage.setItem('chr6', JSON.stringify(s));
    } catch(e){}
  }
  function getCurrentNote(){
    if (window.S && window.S.cfg && typeof window.S.cfg.authorsNote === 'string'){
      return window.S.cfg.authorsNote;
    }
    var s = readState();
    return (s.cfg && s.cfg.authorsNote) || '';
  }

  /* ── UI 注入 ── */
  function injectUI(){
    var ov = document.getElementById('settingsOv');
    if (!ov) return false;
    if (ov.querySelector('#' + SECTION_ID)) return true;

    /* 「シーン設定」セクションの前に挿入 */
    var sceneSec = null;
    var secs = ov.querySelectorAll('.sec');
    for (var i = 0; i < secs.length; i++){
      if (/シーン設定/.test(secs[i].textContent)){
        sceneSec = secs[i];
        break;
      }
    }
    if (!sceneSec) return false;

    var section = document.createElement('div');
    section.id = SECTION_ID;

    var sec = document.createElement('div');
    sec.className = 'sec';
    sec.textContent = '📝 物語の語り口メモ（Author\'s Note）';
    section.appendChild(sec);

    var fld = document.createElement('div');
    fld.className = 'fld';
    var lbl = document.createElement('label');
    lbl.textContent = '毎ターンLLMの直前に注入される語り口指示（永続保存）';

    var ta = document.createElement('textarea');
    ta.id = FIELD_ID;
    ta.placeholder = '例: 主人公とNPCの心理は内側から描く。痛みは具体的部位と質感で。悲鳴は実際の発声で書く。';
    ta.style.minHeight = '80px';
    ta.value = getCurrentNote();

    ta.addEventListener('input', function(){
      writeNoteImmediate(ta.value);
      if (window.S && window.S.cfg) window.S.cfg.authorsNote = ta.value;
    });

    var hint = document.createElement('div');
    hint.style.cssText = 'font-size:11px;color:var(--dim);margin-top:4px;line-height:1.5';
    hint.textContent = 'AI Dungeon の Author\'s Note と同じ仕組み。毎ターン、システムプロンプト末尾に挿入されるため最も影響が強い。空欄なら何も注入されない。';

    fld.appendChild(lbl);
    fld.appendChild(ta);
    fld.appendChild(hint);
    section.appendChild(fld);

    sceneSec.parentNode.insertBefore(section, sceneSec);
    return true;
  }

  function syncFieldToCfg(){
    var ta = document.getElementById(FIELD_ID);
    if (!ta) return;
    var val = ta.value;
    if (window.S && window.S.cfg) window.S.cfg.authorsNote = val;
    writeNoteImmediate(val);
  }

  function hookSettings(){
    if (typeof UI !== 'undefined' && !window.UI) { try { window.UI = UI; } catch(_e){} }
    if (!window.UI) return;
    if (typeof window.UI.openSettings === 'function' && !window.UI.__v232OS){
      var orig = window.UI.openSettings.bind(window.UI);
      window.UI.openSettings = function(){
        var r = orig.apply(this, arguments);
        setTimeout(function(){
          if (injectUI()){
            var ta = document.getElementById(FIELD_ID);
            if (ta) ta.value = getCurrentNote();
          }
        }, 50);
        setTimeout(function(){
          if (injectUI()){
            var ta = document.getElementById(FIELD_ID);
            if (ta) ta.value = getCurrentNote();
          }
        }, 350);
        return r;
      };
      window.UI.__v232OS = true;
    }
    if (typeof window.UI.saveSettings === 'function' && !window.UI.__v232SS){
      var origSave = window.UI.saveSettings.bind(window.UI);
      window.UI.saveSettings = function(){
        syncFieldToCfg();
        return origSave.apply(this, arguments);
      };
      window.UI.__v232SS = true;
    }
  }

  /* ── プロンプトブロック生成 ── */
  function buildAuthorsNoteBlock(){
    var note = getCurrentNote();
    if (!note || !note.trim()) return null;
    return [
      '',
      '',
      SENTINEL,
      '',
      '以下は物語の語り口・スタイルに関する **永続的な指示** です。',
      'これは最も近い位置にあるルールとして、すべての出力で必ず守ってください。',
      '',
      '---',
      '',
      note.trim(),
      '',
      '---',
      ''
    ].join('\n');
  }

  /* ── fetch hook：システムプロンプト末尾に挿入（AI Dungeon 流） ── */
  var origFetch = window.fetch.bind(window);
  window.fetch = function(input, init){
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var isApi = /openrouter\.ai|api\.anthropic\.com|api\.openai\.com/.test(url);
    if (isApi && init && init.body){
      try {
        var body = JSON.parse(init.body);
        if (body.messages && Array.isArray(body.messages)){
          var block = buildAuthorsNoteBlock();
          if (block){
            for (var i = body.messages.length - 1; i >= 0; i--){
              if (body.messages[i].role === 'system'){
                var c = body.messages[i].content || '';
                if (c.indexOf(SENTINEL) < 0){
                  body.messages[i].content = c + block;
                }
                break;
              }
            }
            init.body = JSON.stringify(body);
          }
        }
      } catch(e){
        console.warn('[v232] fetch hook error:', e);
      }
    }
    return origFetch(input, init);
  };

  function init(){
    hookSettings();
    var ticks = 0;
    var iv = setInterval(function(){
      hookSettings();
      if (++ticks > 30) clearInterval(iv);
    }, 1000);
    console.log('[v232] active: Author\'s Note');
  }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  setTimeout(init, 500);
  setTimeout(init, 2000);

  window.__v232 = {
    getCurrentNote: getCurrentNote,
    buildBlock: buildAuthorsNoteBlock
  };
})();
/* v232-authors-note:
   AI Dungeon 風の "Author's Note" 機能。
   ユーザーが「物語の語り口・スタイル指示」を永続的に書いておけるテキストエリアを
   設定パネルに追加し、毎ターンのシステムプロンプト末尾（最も影響強い位置）に注入する。

   - localStorage の chr6.cfg.authorsNote に保存
   - 入力欄が空なら何も注入しない
   - センチネル文字列で重複注入を防止
   - v228/v231 など既存の fetch フックと共存（chain）
*/
(function v232(){
  'use strict';
  if (window.__v232Active) return;
  window.__v232Active = true;

  var FIELD_ID   = 'cfgAuthorsNote';
  var SECTION_ID = 'v232-authors-section';
  var SENTINEL   = '# 📝 物語の語り口メモ（Author\'s Note）';

  function readState(){
    try { return JSON.parse(localStorage.getItem('chr6') || '{}'); }
    catch(e){ return {}; }
  }
  function writeNoteImmediate(val){
    try {
      var s = JSON.parse(localStorage.getItem('chr6') || '{}');
      s.cfg = s.cfg || {};
      s.cfg.authorsNote = val;
      localStorage.setItem('chr6', JSON.stringify(s));
    } catch(e){}
  }
  function getCurrentNote(){
    if (window.S && window.S.cfg && typeof window.S.cfg.authorsNote === 'string'){
      return window.S.cfg.authorsNote;
    }
    var s = readState();
    return (s.cfg && s.cfg.authorsNote) || '';
  }

  /* ── UI 注入 ── */
  function injectUI(){
    var ov = document.getElementById('settingsOv');
    if (!ov) return false;
    if (ov.querySelector('#' + SECTION_ID)) return true;

    /* 「シーン設定」セクションの前に挿入 */
    var sceneSec = null;
    var secs = ov.querySelectorAll('.sec');
    for (var i = 0; i < secs.length; i++){
      if (/シーン設定/.test(secs[i].textContent)){
        sceneSec = secs[i];
        break;
      }
    }
    if (!sceneSec) return false;

    var section = document.createElement('div');
    section.id = SECTION_ID;

    var sec = document.createElement('div');
    sec.className = 'sec';
    sec.textContent = '📝 物語の語り口メモ（Author\'s Note）';
    section.appendChild(sec);

    var fld = document.createElement('div');
    fld.className = 'fld';
    var lbl = document.createElement('label');
    lbl.textContent = '毎ターンLLMの直前に注入される語り口指示（永続保存）';

    var ta = document.createElement('textarea');
    ta.id = FIELD_ID;
    ta.placeholder = '例: 主人公とNPCの心理は内側から描く。痛みは具体的部位と質感で。悲鳴は実際の発声で書く。';
    ta.style.minHeight = '80px';
    ta.value = getCurrentNote();

    ta.addEventListener('input', function(){
      writeNoteImmediate(ta.value);
      if (window.S && window.S.cfg) window.S.cfg.authorsNote = ta.value;
    });

    var hint = document.createElement('div');
    hint.style.cssText = 'font-size:11px;color:var(--dim);margin-top:4px;line-height:1.5';
    hint.textContent = 'AI Dungeon の Author\'s Note と同じ仕組み。毎ターン、システムプロンプト末尾に挿入されるため最も影響が強い。空欄なら何も注入されない。';

    fld.appendChild(lbl);
    fld.appendChild(ta);
    fld.appendChild(hint);
    section.appendChild(fld);

    sceneSec.parentNode.insertBefore(section, sceneSec);
    return true;
  }

  function syncFieldToCfg(){
    var ta = document.getElementById(FIELD_ID);
    if (!ta) return;
    var val = ta.value;
    if (window.S && window.S.cfg) window.S.cfg.authorsNote = val;
    writeNoteImmediate(val);
  }

  function hookSettings(){
    if (!window.UI) return;
    if (typeof window.UI.openSettings === 'function' && !window.UI.__v232OS){
      var orig = window.UI.openSettings.bind(window.UI);
      window.UI.openSettings = function(){
        var r = orig.apply(this, arguments);
        setTimeout(function(){
          if (injectUI()){
            var ta = document.getElementById(FIELD_ID);
            if (ta) ta.value = getCurrentNote();
          }
        }, 50);
        setTimeout(function(){
          if (injectUI()){
            var ta = document.getElementById(FIELD_ID);
            if (ta) ta.value = getCurrentNote();
          }
        }, 350);
        return r;
      };
      window.UI.__v232OS = true;
    }
    if (typeof window.UI.saveSettings === 'function' && !window.UI.__v232SS){
      var origSave = window.UI.saveSettings.bind(window.UI);
      window.UI.saveSettings = function(){
        syncFieldToCfg();
        return origSave.apply(this, arguments);
      };
      window.UI.__v232SS = true;
    }
  }

  /* ── プロンプトブロック生成 ── */
  function buildAuthorsNoteBlock(){
    var note = getCurrentNote();
    if (!note || !note.trim()) return null;
    return [
      '',
      '',
      SENTINEL,
      '',
      '以下は物語の語り口・スタイルに関する **永続的な指示** です。',
      'これは最も近い位置にあるルールとして、すべての出力で必ず守ってください。',
      '',
      '---',
      '',
      note.trim(),
      '',
      '---',
      ''
    ].join('\n');
  }

  /* ── fetch hook：システムプロンプト末尾に挿入（AI Dungeon 流） ── */
  var origFetch = window.fetch.bind(window);
  window.fetch = function(input, init){
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var isApi = /openrouter\.ai|api\.anthropic\.com|api\.openai\.com/.test(url);
    if (isApi && init && init.body){
      try {
        var body = JSON.parse(init.body);
        if (body.messages && Array.isArray(body.messages)){
          var block = buildAuthorsNoteBlock();
          if (block){
            for (var i = body.messages.length - 1; i >= 0; i--){
              if (body.messages[i].role === 'system'){
                var c = body.messages[i].content || '';
                if (c.indexOf(SENTINEL) < 0){
                  body.messages[i].content = c + block;
                }
                break;
              }
            }
            init.body = JSON.stringify(body);
          }
        }
      } catch(e){
        console.warn('[v232] fetch hook error:', e);
      }
    }
    return origFetch(input, init);
  };

  function init(){
    hookSettings();
    var ticks = 0;
    var iv = setInterval(function(){
      hookSettings();
      if (++ticks > 30) clearInterval(iv);
    }, 1000);
    console.log('[v232] active: Author\'s Note');
  }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  setTimeout(init, 500);
  setTimeout(init, 2000);

  window.__v232 = {
    getCurrentNote: getCurrentNote,
    buildBlock: buildAuthorsNoteBlock
  };
})();
