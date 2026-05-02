/* v142: nickname matching + empty dialogue filter + avatar consistency */
(function v142(){
  'use strict';
  var TAG = '[v142]';
  if (window.__v142Active) return;
  window.__v142Active = true;

  function getCast(){ try { return JSON.parse(localStorage.getItem('chr6') || '{}'); } catch(e){ return {}; } }
  function setCast(s){ localStorage.setItem('chr6', JSON.stringify(s)); }

  function nicknames(name){
    if (!name) return [];
    var out = [name];
    if (name.indexOf('・') >= 0){
      name.split('・').forEach(function(p){ if (p && p.length >= 2) out.push(p); });
    }
    return out;
  }

  function resolveCanonical(name){
    if (!name) return null;
    var s = getCast(); var c = s.cast || {}; var hero = c.hero || {};
    if (hero.name){
      var hns = nicknames(hero.name);
      for (var i = 0; i < hns.length; i++){ if (hns[i] === name) return hero.name; }
      if (hero.name.indexOf(name) >= 0 && name.length >= 2) return hero.name;
      if (name.indexOf(hero.name) === 0) return hero.name;
    }
    var npcs = c.npcs || [];
    for (var i = 0; i < npcs.length; i++){
      var n = npcs[i];
      if (!n || !n.name) continue;
      var nns = nicknames(n.name);
      for (var j = 0; j < nns.length; j++){ if (nns[j] === name) return n.name; }
      if (n.name.indexOf(name) >= 0 && name.length >= 2) return n.name;
      if (name.indexOf(n.name) === 0) return n.name;
    }
    return null;
  }

  function resolveAllDialogues(){
    var s = getCast();
    var turns = s.turns || [];
    var changed = false;
    turns.forEach(function(t){
      if (!t.dialogues || !Array.isArray(t.dialogues)) return;
      t.dialogues = t.dialogues.filter(function(d){
        if (!d || !d.text) return false;
        var trimmed = String(d.text).trim();
        if (!trimmed) return false;
        if (/^[「」《》（）()\s]*$/.test(trimmed)) return false;
        if (/^[（(](プレイヤー|player|モブ|narrator|地の文)[）)]?$/i.test(trimmed)) return false;
        return true;
      });
      t.dialogues.forEach(function(d){
        if (!d || !d.speaker) return;
        var canonical = resolveCanonical(d.speaker);
        if (canonical && canonical !== d.speaker){
          console.log(TAG, 'nickname resolve:', d.speaker, '→', canonical);
          d.speaker = canonical;
          changed = true;
        }
        var cleanSpk = d.speaker.replace(/[（(].+?[）)]\s*$/, '').trim();
        if (cleanSpk && cleanSpk !== d.speaker){
          var cn = resolveCanonical(cleanSpk);
          d.speaker = cn || cleanSpk;
          changed = true;
        }
      });
    });
    if (changed){
      setCast(s);
      console.log(TAG, 'resolved dialogues');
      try { if (typeof UI === 'object' && UI && UI.renderAll) UI.renderAll(); } catch(e){}
    }
  }

  function consolidateEphemerals(){
    var s = getCast();
    if (!s.ephemerals) return;
    var c = s.cast || {}; var hero = c.hero || {}; var npcs = c.npcs || [];
    var registeredNames = [];
    if (hero.name) registeredNames.push(hero.name);
    npcs.forEach(function(n){ if (n && n.name) registeredNames.push(n.name); });

    var changed = false;
    Object.keys(s.ephemerals).forEach(function(epName){
      var canonical = resolveCanonical(epName);
      if (canonical && registeredNames.indexOf(canonical) >= 0){
        delete s.ephemerals[epName];
        changed = true;
        console.log(TAG, 'consolidated ephemeral:', epName, '→', canonical);
      }
    });
    if (changed){
      setCast(s);
      try { if (typeof UI === 'object' && UI && UI.renderAll) UI.renderAll(); } catch(e){}
    }
  }

  function init(){
    setTimeout(resolveAllDialogues, 1500);
    setTimeout(consolidateEphemerals, 2000);
    setTimeout(resolveAllDialogues, 4500);
    setTimeout(consolidateEphemerals, 5000);
    setInterval(function(){ resolveAllDialogues(); consolidateEphemerals(); }, 5000);
  }

  if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', init); } else { init(); }

  console.log(TAG, 'v142 active: nickname resolve + empty filter + ephemeral consolidate');
})();
