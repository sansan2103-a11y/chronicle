/* v234-pov:
   POV（視点）切替機能。
   設定パネルから「視点キャラ」を選び、選択中はそのキャラの一人称視点で描写する
   ようにシステムプロンプトに指示を注入する。

   - 三人称（既定）/ 主人公 / NPC1, NPC2, ... を選択肢に動的生成
   - localStorage の chr6.cfg.povChar に保存（"hero:〈名前〉" or "npc:〈名前〉" or ""）
   - センチネル文字列で重複注入防止
   - NPC リストが変わったらセレクター選択肢も自動再生成
*/
(function v234(){
  'use strict';
  if (window.__v234Active) return;
  window.__v234Active = true;

  var FIELD_ID   = 'cfgPovChar';
  var SECTION_ID = 'v234-pov-section';
  var SENTINEL   = '# 🎭 視点指示（POV）';

  function readState(){
    try { return JSON.parse(localStorage.getItem('chr6') || '{}'); }
    catch(e){ return {}; }
  }
  function writePov(val){
    try {
      var s = JSON.parse(localStorage.getItem('chr6') || '{}');
      s.cfg = s.cfg || {};
      s.cfg.povChar = val;
      localStorage.setItem('chr6', JSON.stringify(s));
    } catch(e){}
  }
  function getPov(){
    if (window.S && window.S.cfg && typeof window.S.cfg.povChar === 'string'){
      return window.S.cfg.povChar;
    }
    var s = readState();
    return (s.cfg && s.cfg.povChar) || '';
  }

  function getOptions(){
    var s = readState();
    var opts = [];
    opts.push({ value: '', label: '三人称（既定）' });
    if (s.cast && s.cast.hero && s.cast.hero.name){
      opts.push({
        value: 'hero:' + s.cast.hero.name,
        label: '主人公（' + s.cast.hero.name + '）の一人称'
      });
    }
    if (s.cast && Array.isArray(s.cast.npcs)){
      s.cast.npcs.forEach(function(n, i){
        if (!n || !n.name) return;
        opts.push({
          value: 'npc:' + n.name,
          label: 'NPC ' + (i + 1) + '（' + n.name + '）の一人称'
        });
      });
    }
    return opts;
  }

  /* ── UI 注入 ── */
  function injectUI(){
    var ov = document.getElementById('settingsOv');
    if (!ov) return false;
    if (ov.querySelector('#' + SECTION_ID)){
      refreshOptions();
      return true;
    }

    /* 「シーン設定」セクション群の末尾に挿入 */
    var sceneSec = null;
    var secs = ov.querySelectorAll('.sec');
    for (var i = 0; i < secs.length; i++){
      if (/シーン設定/.test(secs[i].textContent)){
        sceneSec = secs[i];
        break;
      }
    }
    if (!sceneSec) return false;

    var anchor = sceneSec;
    var node = sceneSec.nextSibling;
    while (node){
      if (node.classList && node.classList.contains('sec')){ break; }
      anchor = node;
      node = node.nextSibling;
    }

    var section = document.createElement('div');
    section.id = SECTION_ID;

    var sec = document.createElement('div');
    sec.className = 'sec';
    sec.textContent = '🎭 視点キャラ（POV）';
    section.appendChild(sec);

    var fld = document.createElement('div');
    fld.className = 'fld';
    var lbl = document.createElement('label');
    lbl.textContent = 'このターンの視点キャラ（一人称化）';

    var sel = document.createElement('select');
    sel.id = FIELD_ID;

    fld.appendChild(lbl);
    fld.appendChild(sel);

    var hint = document.createElement('div');
    hint.style.cssText = 'font-size:11px;color:var(--dim);margin-top:4px;line-height:1.5';
    hint.textContent = '主人公以外を選ぶと、そのキャラの内心・五感・主観を中心にした描写になります。三人称（既定）に戻すと従来通りの語りになります。';
    fld.appendChild(hint);
    section.appendChild(fld);

    if (anchor === sceneSec){
      sceneSec.parentNode.insertBefore(section, sceneSec.nextSibling);
    } else {
      anchor.parentNode.insertBefore(section, anchor.nextSibling);
    }

    refreshOptions();
    sel.addEventListener('change', function(){
      writePov(sel.value);
      if (window.S && window.S.cfg) window.S.cfg.povChar = sel.value;
    });
    return true;
  }

  function refreshOptions(){
    var sel = document.getElementById(FIELD_ID);
    if (!sel) return;
    var current = getPov();
    sel.innerHTML = '';
    var opts = getOptions();
    opts.forEach(function(o){
      var op = document.createElement('option');
      op.value = o.value;
      op.textContent = o.label;
      sel.appendChild(op);
    });
    var found = false;
    for (var i = 0; i < sel.options.length; i++){
      if (sel.options[i].value === current){
        sel.value = current;
        found = true;
        break;
      }
    }
    if (!found){
      sel.value = '';
      writePov('');
      if (window.S && window.S.cfg) window.S.cfg.povChar = '';
    }
  }

  function hookSettings(){
    if (!window.UI) return;
    if (typeof window.UI.openSettings === 'function' && !window.UI.__v234OS){
      var orig = window.UI.openSettings.bind(window.UI);
      window.UI.openSettings = function(){
        var r = orig.apply(this, arguments);
        setTimeout(function(){ injectUI(); }, 50);
        setTimeout(function(){ injectUI(); }, 350);
        return r;
      };
      window.UI.__v234OS = true;
    }
    if (typeof window.UI._renderNpcList === 'function' && !window.UI.__v234RN){
      var origRN = window.UI._renderNpcList.bind(window.UI);
      window.UI._renderNpcList = function(){
        var r = origRN.apply(this, arguments);
        setTimeout(refreshOptions, 80);
        return r;
      };
      window.UI.__v234RN = true;
    }
  }

  function buildPovBlock(){
    var pov = getPov();
    if (!pov) return null;
    var s = readState();
    var name = '';
    var role = '';
    if (pov.indexOf('hero:') === 0){
      name = (s.cast && s.cast.hero && s.cast.hero.name) || pov.slice(5) || '主人公';
      role = '主人公';
    } else if (pov.indexOf('npc:') === 0){
      name = pov.slice(4);
      role = 'NPC';
    } else {
      name = pov;
      role = 'キャラ';
    }
    if (!name) return null;
    return [
      '',
      '',
      SENTINEL,
      '',
      '【視点】このターンは **' + name + '（' + role + '）の一人称視点** で書きます。',
      '',
      '## 描写ルール',
      '- ' + name + ' の **内心・五感・身体感覚** を中心に描写する',
      '- ' + name + ' の **主観** で世界を切り取る（他者の心は推測としてしか書けない）',
      '- 「私」「俺」「わたし」など ' + name + ' に合った一人称代名詞を使う',
      '- ' + name + ' が見ていない・知らない情報は描かない（その視点の制限を尊重する）',
      '- ' + name + ' 以外のキャラのセリフは「」で書き、それに対する ' + name + ' の感情・反応を即座に書き添える',
      '- 視点が ' + name + ' であっても、ストーリーの進行・他キャラの行動描写は省略しない',
      ''
    ].join('\n');
  }

  /* ── fetch hook ── */
  var origFetch = window.fetch.bind(window);
  window.fetch = function(input, init){
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var isApi = /openrouter\.ai|api\.anthropic\.com|api\.openai\.com/.test(url);
    if (isApi && init && init.body){
      try {
        var body = JSON.parse(init.body);
        if (body.messages && Array.isArray(body.messages)){
          var block = buildPovBlock();
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
        console.warn('[v234] fetch hook error:', e);
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
    console.log('[v234] active: POV switcher');
  }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  setTimeout(init, 500);
  setTimeout(init, 2000);

  window.__v234 = {
    buildPovBlock: buildPovBlock,
    getPov: getPov,
    getOptions: getOptions
  };
})();
