/* v233-world-info:
   AI Dungeon 風の "World Info / Memory" 機能。
   キーワード ↔ 詳細 のペアを登録し、直近の narrative にキーワードが出たら
   自動でその詳細をシステムプロンプトに注入する。

   - NPC・主人公の名前は自動的にキーワード化（desc/personality/coreDesire等を集約）
   - ユーザーは設定パネルから自由に追加可能
   - キーワードのエイリアスは「,」「、」「|」区切りで複数指定可能
   - localStorage の chr6.cfg.worldInfo に配列として保存
   - センチネル文字列で重複注入防止
*/
(function v233(){
  'use strict';
  if (window.__v233Active) return;
  window.__v233Active = true;


  /* v23X-fix: codebase exposes top-level `const UI`, not window.UI.
     Bridge once so the rest of the patch (which uses window.UI) just works. */
  if (typeof UI !== 'undefined' && !window.UI) { try { window.UI = UI; } catch(_e){} }
  var SECTION_ID  = 'v233-worldinfo-section';
  var TABLE_ID    = 'v233-wi-table';
  var SENTINEL    = '# 📚 ワールド情報（自動注入）';
  var MAX_NARRATIVE_TURNS = 5;
  var MAX_INJECT_CHARS    = 1500;

  function readState(){
    try { return JSON.parse(localStorage.getItem('chr6') || '{}'); }
    catch(e){ return {}; }
  }
  function writeWI(arr){
    try {
      var s = JSON.parse(localStorage.getItem('chr6') || '{}');
      s.cfg = s.cfg || {};
      s.cfg.worldInfo = arr;
      localStorage.setItem('chr6', JSON.stringify(s));
    } catch(e){}
  }
  function getWorldInfo(){
    if (window.S && window.S.cfg && Array.isArray(window.S.cfg.worldInfo)){
      return window.S.cfg.worldInfo;
    }
    var s = readState();
    return (s.cfg && Array.isArray(s.cfg.worldInfo)) ? s.cfg.worldInfo : [];
  }

  /* ── NPC / 主人公から自動エントリ生成 ── */
  function buildAutoFromCast(){
    var s = readState();
    var entries = [];
    var chars = [];
    if (s.cast && s.cast.hero) chars.push(s.cast.hero);
    if (s.cast && Array.isArray(s.cast.npcs)) chars = chars.concat(s.cast.npcs);
    chars.forEach(function(c){
      if (!c || !c.name) return;
      var bits = [];
      if (c.desc) bits.push(c.desc);
      if (c.personality) bits.push('性格: ' + c.personality);
      if (c.coreDesire) bits.push('欲望: ' + c.coreDesire);
      if (c.coreFear) bits.push('恐怖: ' + c.coreFear);
      if (c.wound) bits.push('傷: ' + c.wound);
      if (bits.length){
        entries.push({ keyword: c.name, detail: bits.join(' / '), auto: true });
      }
    });
    return entries;
  }

  function escapeRx(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function getRecentNarrativeText(){
    var s = readState();
    var turns = (s && s.turns) || [];
    if (!turns.length) return '';
    var slice = turns.slice(-MAX_NARRATIVE_TURNS);
    var bits = [];
    slice.forEach(function(t){
      if (t.playerText) bits.push(String(t.playerText));
      if (t.input) bits.push(String(t.input));
      if (t.narrative){
        bits.push(Array.isArray(t.narrative) ? t.narrative.join('\n') : String(t.narrative));
      }
      if (t.innerThought) bits.push(String(t.innerThought));
    });
    return bits.join('\n');
  }

  function buildInjection(){
    var manual = getWorldInfo();
    var auto   = buildAutoFromCast();
    var byKw = {};
    /* manual を優先（同名なら上書きされない） */
    manual.forEach(function(e){ if (e && e.keyword && e.detail) byKw[e.keyword] = e; });
    auto.forEach(function(e){ if (!byKw[e.keyword]) byKw[e.keyword] = e; });
    var all = Object.keys(byKw).map(function(k){ return byKw[k]; });
    if (!all.length) return null;

    var hayBig = getRecentNarrativeText();
    var s = readState();
    var sceneText = (s.scene && [s.scene.loc, s.scene.obj, s.scene.lore, s.scene.tone].filter(Boolean).join(' ')) || '';
    var hay = hayBig + '\n' + sceneText;

    var hits = [];
    var seen = {};
    all.forEach(function(e){
      if (!e || !e.keyword || !e.detail) return;
      var kws = String(e.keyword).split(/[,、|]/).map(function(s){return s.trim();}).filter(Boolean);
      var matched = false;
      var hitKw = '';
      for (var k = 0; k < kws.length; k++){
        var kw = kws[k];
        if (!kw) continue;
        try {
          var rx = new RegExp(escapeRx(kw), 'i');
          if (hay && rx.test(hay)){ matched = true; hitKw = kw; break; }
        } catch(_e){}
      }
      if (matched && !seen[hitKw]){
        seen[hitKw] = true;
        hits.push({ keyword: hitKw, detail: e.detail });
      }
    });
    if (!hits.length) return null;

    var lines = [];
    var total = 0;
    hits.forEach(function(h){
      var line = '- **' + h.keyword + '**：' + h.detail;
      if (total + line.length > MAX_INJECT_CHARS) return;
      total += line.length + 1;
      lines.push(line);
    });
    if (!lines.length) return null;

    return [
      '',
      '',
      SENTINEL,
      '',
      '直近の物語に登場したキーワードに対応する設定情報です。今後の描写の整合性のため必ず参照してください。',
      '',
      lines.join('\n'),
      ''
    ].join('\n');
  }

  /* ── UI 注入 ── */
  function injectUI(){
    var ov = document.getElementById('settingsOv');
    if (!ov) return false;
    if (ov.querySelector('#' + SECTION_ID)) return true;

    /* 「世界設定」セクションの直後に挿入 */
    var worldSec = null;
    var secs = ov.querySelectorAll('.sec');
    for (var i = 0; i < secs.length; i++){
      if (/世界設定/.test(secs[i].textContent)){
        worldSec = secs[i];
        break;
      }
    }
    if (!worldSec) return false;

    /* worldSec の次の .fld を超えて、次の .sec の手前まで進む */
    var anchor = worldSec;
    var node = worldSec.nextSibling;
    while (node){
      if (node.classList && node.classList.contains('sec')){ break; }
      anchor = node;
      node = node.nextSibling;
    }

    var section = document.createElement('div');
    section.id = SECTION_ID;

    var sec = document.createElement('div');
    sec.className = 'sec';
    sec.textContent = '📚 ワールド情報（キーワード自動注入）';
    section.appendChild(sec);

    var note = document.createElement('div');
    note.className = 'fld';
    note.innerHTML = '<div style="font-size:11px;color:var(--dim);line-height:1.6">物語の中にキーワードが出るとそのキーワードの詳細を自動でプロンプトに注入します。<br>カンマ・読点・縦棒で複数キーワードのエイリアスを定義できます（例：「血の祭壇,祭壇,儀式場」）。<br>NPC・主人公の名前は自動的に登録されます。</div>';
    section.appendChild(note);

    var tableWrap = document.createElement('div');
    tableWrap.className = 'fld';
    tableWrap.id = TABLE_ID;
    section.appendChild(tableWrap);

    var addBtn = document.createElement('button');
    addBtn.className = 'btn-s';
    addBtn.style.cssText = 'width:100%;margin-bottom:8px';
    addBtn.textContent = '+ ワールド情報を追加';
    addBtn.onclick = function(e){
      e.preventDefault();
      var arr = getWorldInfo().slice();
      arr.push({ keyword: '', detail: '' });
      writeWI(arr);
      if (window.S && window.S.cfg) window.S.cfg.worldInfo = arr;
      renderTable();
    };
    section.appendChild(addBtn);

    if (anchor === worldSec){
      worldSec.parentNode.insertBefore(section, worldSec.nextSibling);
    } else {
      anchor.parentNode.insertBefore(section, anchor.nextSibling);
    }
    renderTable();
    return true;
  }

  function renderTable(){
    var wrap = document.getElementById(TABLE_ID);
    if (!wrap) return;
    var arr  = getWorldInfo().slice();
    var auto = buildAutoFromCast();
    wrap.innerHTML = '';

    if (auto.length){
      var hdr = document.createElement('div');
      hdr.style.cssText = 'font-size:11px;color:var(--dim);margin-bottom:6px;padding:6px 8px;background:rgba(139,118,240,.06);border:1px solid var(--border);border-radius:6px';
      hdr.textContent = '自動登録キーワード（キャラクター ' + auto.length + '件）：' +
        auto.map(function(e){ return e.keyword; }).join(' / ');
      wrap.appendChild(hdr);
    }

    arr.forEach(function(e, idx){
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;align-items:flex-start;flex-wrap:wrap';

      var kw = document.createElement('input');
      kw.type = 'text';
      kw.placeholder = 'キーワード（例: 血の祭壇,祭壇）';
      kw.style.cssText = 'flex:1;min-width:120px;padding:6px 8px;background:var(--s2);color:var(--tx);border:1px solid var(--border);border-radius:6px;font-size:13px';
      kw.value = e.keyword || '';

      var det = document.createElement('textarea');
      det.placeholder = '詳細（例: 主人公の家系に伝わる呪いの儀式場。月の無い夜に血を捧げる…）';
      det.style.cssText = 'flex:2;min-width:160px;min-height:46px;padding:6px 8px;background:var(--s2);color:var(--tx);border:1px solid var(--border);border-radius:6px;font-size:13px;resize:vertical;font-family:inherit';
      det.value = e.detail || '';

      var del = document.createElement('button');
      del.className = 'btn-d';
      del.textContent = '×';
      del.style.cssText = 'flex:0 0 32px;padding:6px 0;font-size:14px';
      del.onclick = function(ev){
        ev.preventDefault();
        var arr2 = getWorldInfo().slice();
        arr2.splice(idx, 1);
        writeWI(arr2);
        if (window.S && window.S.cfg) window.S.cfg.worldInfo = arr2;
        renderTable();
      };

      var commit = function(){
        var arr2 = getWorldInfo().slice();
        if (!arr2[idx]) arr2[idx] = {};
        arr2[idx].keyword = kw.value;
        arr2[idx].detail  = det.value;
        writeWI(arr2);
        if (window.S && window.S.cfg) window.S.cfg.worldInfo = arr2;
      };
      kw.addEventListener('input', commit);
      det.addEventListener('input', commit);

      row.appendChild(kw);
      row.appendChild(det);
      row.appendChild(del);
      wrap.appendChild(row);
    });

    if (!arr.length){
      var empty = document.createElement('div');
      empty.style.cssText = 'font-size:11px;color:var(--dim);font-style:italic;padding:8px 0';
      empty.textContent = '（手動エントリは未登録）';
      wrap.appendChild(empty);
    }
  }

  function hookSettings(){
    if (typeof UI !== 'undefined' && !window.UI) { try { window.UI = UI; } catch(_e){} }
    if (!window.UI) return;
    if (typeof window.UI.openSettings === 'function' && !window.UI.__v233OS){
      var orig = window.UI.openSettings.bind(window.UI);
      window.UI.openSettings = function(){
        var r = orig.apply(this, arguments);
        setTimeout(function(){ injectUI(); }, 50);
        setTimeout(function(){ injectUI(); }, 350);
        return r;
      };
      window.UI.__v233OS = true;
    }
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
          var block = buildInjection();
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
        console.warn('[v233] fetch hook error:', e);
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
    console.log('[v233] active: World Info / keyword auto-injection');
  }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  setTimeout(init, 500);
  setTimeout(init, 2000);

  window.__v233 = {
    buildInjection: buildInjection,
    getWorldInfo: getWorldInfo,
    buildAutoFromCast: buildAutoFromCast
  };
})();
