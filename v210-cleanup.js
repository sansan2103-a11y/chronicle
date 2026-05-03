/* v210-cleanup: fix user-input bugs + Magnum name corruption + UI cleanup */
(function v210(){
  'use strict';
  if (window.__v210Active) return;
  window.__v210Active = true;

  function read(){
    try { return JSON.parse(localStorage.getItem('chr6') || '{}'); }
    catch(e){ return {}; }
  }

  function isContinuationButton(ut){
    var t = (ut || '').trim();
    if (!t) return true;
    if (t.length > 30) return false;
    if (/^続きを?(自然に進めてください|書く)。?$/.test(t)) return true;
    if (/^[\s。、…・]*(続き|続けて|そのまま|このまま)[\s。、…・]*$/.test(t)) return true;
    return false;
  }

  function buildPlayerInputBlock(userText, mode){
    if (!userText || isContinuationButton(userText)) return null;
    var label = mode === 'DO' ? '【プレイヤー行動】'
              : mode === 'SAY' ? '【プレイヤー発言】'
              : '【プレイヤー指示】';
    return ['','',label + '（最優先・必ず物語に反映する）','','> ' + userText.replace(/\n/g, '\n> '),'','上記のプレイヤー指示を **このターンの中心** にして物語を書いてください。','無視したり、別の展開に逸れたりしないこと。'].join('\n');
  }

  function buildNameStabilityRule(s){
    var names = [];
    if (s && s.cast){
      if (s.cast.hero && s.cast.hero.name) names.push(s.cast.hero.name);
      (s.cast.npcs || []).forEach(function(n){ if (n && n.name) names.push(n.name); });
    }
    if (names.length === 0) return null;
    return ['','','## キャラクター名の絶対ルール','','登録キャラクター：**' + names.join(' / ') + '**','','- これらの名前は **一字も変えてはいけません**','- カタカナ名はカタカナのまま使用（例：セシリア ⇔ セシ利亜は禁止）','- 当て字・漢字音写・短縮への変換禁止（例：ミコト ⇔ ミ科ト・美琴 は禁止）','- ローマ字化も禁止（例：レオ ⇔ Leo は禁止）'].join('\n');
  }

  function detectMode(userText){
    if (!userText) return null;
    if (/^[「『]/.test(userText.trim())) return 'SAY';
    return null;
  }

  var origFetch = window.fetch.bind(window);
  window.fetch = function(input, init){
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var isApi = /openrouter\.ai|api\.anthropic\.com|api\.openai\.com/.test(url);
    if (isApi && init && init.body){
      try {
        var body = JSON.parse(init.body);
        if (body.messages && Array.isArray(body.messages)){
          var s = read();
          var lastUser = null;
          for (var i = body.messages.length - 1; i >= 0; i--){
            if (body.messages[i].role === 'user'){ lastUser = body.messages[i]; break; }
          }
          if (lastUser){
            var ut = String(lastUser.content || '');
            var marker = '【重要】これは物語の続きの生成リクエストです';
            if (ut.indexOf(marker) !== 0){
              var mode = detectMode(ut);
              var inputBlock = buildPlayerInputBlock(ut, mode);
              if (inputBlock){
                for (var j = body.messages.length - 1; j >= 0; j--){
                  if (body.messages[j].role === 'system'){
                    var c = body.messages[j].content || '';
                    c = c.replace(/\n\n【プレイヤー[^】]*】[\s\S]*?(?=\n\n##|\n\n【|$)/g, '');
                    body.messages[j].content = c + inputBlock;
                    break;
                  }
                }
              }
            }
          }
          var nameRule = buildNameStabilityRule(s);
          if (nameRule){
            for (var k = body.messages.length - 1; k >= 0; k--){
              if (body.messages[k].role === 'system'){
                var c2 = body.messages[k].content || '';
                if (c2.indexOf('## キャラクター名の絶対ルール') < 0){
                  body.messages[k].content = c2 + nameRule;
                }
                break;
              }
            }
          }
          init.body = JSON.stringify(body);
        }
      } catch(e){ console.warn('[v210] fetch hook err', e); }
    }
    return origFetch(input, init);
  };

  function findCanonicalForCorrupted(name, canonical){
    if (!name) return null;
    if (canonical.indexOf(name) >= 0) return name;
    var best = null, bestScore = 0;
    for (var i = 0; i < canonical.length; i++){
      var c = canonical[i];
      if (Math.abs(c.length - name.length) > 1) continue;
      var setC = {}, setN = {};
      for (var j = 0; j < c.length; j++){
        var ch = c[j];
        if (/[ァ-ヾー]/.test(ch)) setC[ch] = true;
      }
      for (var k = 0; k < name.length; k++){
        var ch2 = name[k];
        if (/[ァ-ヾー]/.test(ch2)) setN[ch2] = true;
      }
      var shared = 0, total = 0;
      Object.keys(setC).forEach(function(x){ total++; if (setN[x]) shared++; });
      if (total === 0) continue;
      var ratio = shared / total;
      var prefixMatch = c[0] === name[0];
      if (ratio >= 0.5 && prefixMatch && ratio > bestScore){
        best = c; bestScore = ratio;
      }
    }
    return best;
  }

  function buildCanonical(s){
    var c=[];
    if(s.cast&&s.cast.hero&&s.cast.hero.name)c.push(s.cast.hero.name);
    (s.cast&&s.cast.npcs||[]).forEach(function(n){if(n&&n.name)c.push(n.name);});
    return c;
  }

  function normalizeNamesInTurns(){
    var s = read();
    var canonical = buildCanonical(s);
    if (canonical.length === 0) return;
    var turns = s.turns || [];
    var changed = false;
    turns.forEach(function(t){
      if (!t) return;
      if (Array.isArray(t.dialogues)){
        t.dialogues.forEach(function(d){
          if (!d || !d.speaker) return;
          var canon = findCanonicalForCorrupted(d.speaker, canonical);
          if (canon && canon !== d.speaker){ d.speaker = canon; changed = true; }
        });
      }
    });
    if (changed){ try { localStorage.setItem('chr6', JSON.stringify(s)); } catch(e){} }
  }

  function dedupeCorruptedNpcs(){
    var s = read();
    var npcs = (s.cast && s.cast.npcs) || [];
    if (npcs.length < 2) return;
    var canonicalNames = npcs.map(function(n){ return n && n.name; }).filter(Boolean);
    var toRemove = [];
    npcs.forEach(function(n, idx){
      if (!n || !n.name) return;
      var others = canonicalNames.filter(function(x){ return x !== n.name; });
      var canon = findCanonicalForCorrupted(n.name, others);
      if (canon){
        var nIsAllKana = /^[ァ-ヾー]+$/.test(n.name);
        var canonIsAllKana = /^[ァ-ヾー]+$/.test(canon);
        if (canonIsAllKana && !nIsAllKana){ toRemove.push(idx); }
      }
    });
    if (toRemove.length > 0){
      toRemove.sort(function(a,b){ return b - a; }).forEach(function(i){ npcs.splice(i, 1); });
      s.cast.npcs = npcs;
      try { localStorage.setItem('chr6', JSON.stringify(s)); } catch(e){}
    }
  }

  function stripSpeakerTags(narrative){
    if (!narrative) return narrative;
    var lines = narrative.split('\n');
    var out = [];
    var changed = false;
    var TAG_RX = /^([一-鿿ぁ-ゖァ-ヾーA-Za-z][一-鿿ぁ-ゖァ-ヾーA-Za-z\-・]{0,15})\s*[-－―]\s*[:：]\s*$/;
    lines.forEach(function(line){
      if (TAG_RX.test(line.trim())){ changed = true; return; }
      out.push(line);
    });
    return changed ? out.join('\n') : narrative;
  }

  function reprocessTurns(){
    var s = read();
    var turns = s.turns || [];
    var changed = false;
    turns.forEach(function(t){
      if (!t || !t.narrative) return;
      var n = stripSpeakerTags(t.narrative);
      if (n !== t.narrative){ t.narrative = n; changed = true; }
    });
    if (changed){ try { localStorage.setItem('chr6', JSON.stringify(s)); } catch(e){} }
  }

  function consolidatePsychFields(){
    var labels = document.querySelectorAll('label');
    labels.forEach(function(l){
      var t = (l.textContent || '').trim();
      var hideMe = false;
      if (/^性格特性/.test(t)) hideMe = true;
      else if (/^核心的欲求/.test(t)) hideMe = true;
      else if (/^核心的恐怖/.test(t)) hideMe = true;
      if (hideMe){
        l.style.display = 'none';
        var next = l.nextElementSibling;
        if (next && (next.tagName === 'INPUT' || next.tagName === 'TEXTAREA')){
          next.style.display = 'none';
        }
      }
      if (/^傷・過去/.test(t) && !l.dataset.v210renamed){
        l.textContent = '心理プロファイル（性格・欲求・恐怖・過去・関係性などを自由記述）';
        l.dataset.v210renamed = '1';
      }
    });
  }

  function init(){
    setTimeout(function(){
      reprocessTurns();
      normalizeNamesInTurns();
      dedupeCorruptedNpcs();
      consolidatePsychFields();
    }, 1500);
    setInterval(function(){
      reprocessTurns();
      normalizeNamesInTurns();
      dedupeCorruptedNpcs();
      consolidatePsychFields();
    }, 4000);
    var mo = new MutationObserver(function(){ consolidatePsychFields(); });
    mo.observe(document.body, { childList: true, subtree: true });
    console.log('[v210] active: input fix + name normalize + psych consolidation');
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
