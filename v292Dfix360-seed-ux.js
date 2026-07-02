// =====================================================================
// Chronicle TRPG - v292Dfix360: 種のUX(可視化+引き直し+自分の種)
// 改善提案文書§4の#2と#5(v0)。「プレイヤーの種を広げる」の入口。
// A) 🎲今回の種: おまかせ実行後、設定モーダル上部に「引いた種」(舞台/欠落/圧力/
//    秘密…)を小さく表示+「🎲引き直す」ボタン。データ=fix335のlastTrace(pickIds)
//    + seed_atoms.v1.json(id→text)。見えると引き直しが楽しくなる。
// B) 🌱種から作る: 設定フッターに追加。自分の1〜3行の種を書く→世界観欄に
//    【種】として書き込み→「AIでランダム生成」を自動起動して残りを膨らませる
//    (SeedContract Phase Cの最小v0・既存機構の導線のみ)。
// OFF: localStorage v292Dfix360Off='1'
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix360) return; window.__v292Dfix360 = true;
  var TAG = '[v292Dfix360:seedUX]';
  function off(){ try{ return localStorage.getItem('v292Dfix360Off')==='1'; }catch(e){ return false; } }

  var AXIS_JP = { setting:'舞台', era_tech:'時代', stance:'立場', lack_desire:'欠落と望み',
    relationship:'関係', opening_pressure:'開幕の圧力', secret:'隠された理', world_rule:'世界の理',
    mood_tone:'空気', npcStance:'相手の立場' };
  var atoms = null;
  function loadAtoms(cb){
    if (atoms) { cb(); return; }
    fetch('seed_atoms.v1.json').then(function(r){ return r.json(); }).then(function(j){
      atoms = {}; (j.atoms||[]).forEach(function(a){ atoms[a.id] = a; }); cb();
    }).catch(function(){ cb(); });
  }
  function lastTrace(){ try{ return JSON.parse(localStorage.getItem('v292Dfix335_lastTrace')||'null'); }catch(e){ return null; } }

  // A) 今回の種パネル
  function renderSeedPanel(){
    if (off()) return;
    try {
      var ov = document.getElementById('settingsOv'); if (!ov) return;
      var body = ov.querySelector('.mpanel-body') || ov;
      var tr = lastTrace(); if (!tr || !tr.pickIds) return;
      loadAtoms(function(){
        if (!atoms) return;
        var old = document.getElementById('v292-seed-panel'); if (old) old.remove();
        var box = document.createElement('div');
        box.id = 'v292-seed-panel';
        box.style.cssText = 'margin:6px 0 10px;padding:8px 10px;border:1px dashed rgba(255,255,255,.25);border-radius:10px;font-size:11px;line-height:1.5;opacity:.85;';
        var head = document.createElement('div');
        head.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:4px;';
        var ttl = document.createElement('b'); ttl.textContent = '🎲 今回の種'; head.appendChild(ttl);
        var rr = document.createElement('button');
        rr.textContent = '🎲 引き直す';
        rr.style.cssText = 'padding:1px 8px;font-size:11px;cursor:pointer;border-radius:6px;';
        rr.onclick = function(){ try{ if (window.__v334Omakase) window.__v334Omakase(); }catch(e){} };
        head.appendChild(rr);
        box.appendChild(head);
        var lines = [];
        Object.keys(tr.pickIds).forEach(function(ax){
          if (ax === '__target' || ax === 'npcStance') return;
          var a = atoms[tr.pickIds[ax]]; if (!a) return;
          lines.push('・' + (AXIS_JP[ax]||ax) + ': ' + String(a.text||'').split('。')[0]);
        });
        var txt = document.createElement('div');
        txt.textContent = lines.join('\n');
        txt.style.whiteSpace = 'pre-wrap';
        box.appendChild(txt);
        body.insertBefore(box, body.firstChild);
      });
    } catch(e){}
  }
  // おまかせ後に描画(既存ラップ群のさらに外側)
  function wrapOmakase(){
    var orig = window.__v334Omakase;
    if (typeof orig !== 'function' || orig._f360w) return !!(orig && orig._f360w);
    var w = function(){
      var r = orig.apply(this, arguments);
      var t0 = Date.now();
      (function watch(){
        var tr = lastTrace();
        if (tr && Date.now() - (tr.at||0) < 30000) { setTimeout(renderSeedPanel, 800); return; }
        if (Date.now() - t0 > 15000) return;
        setTimeout(watch, 500);
      })();
      return r;
    };
    w._f360w = true; window.__v334Omakase = w; return true;
  }
  if (!wrapOmakase()) { var tr1 = 0; var iv1 = setInterval(function(){ if (wrapOmakase() || ++tr1 > 40) clearInterval(iv1); }, 500); }

  // B) 🌱種から作る(設定フッターのおまかせボタンの隣)
  function injectSeedBtn(){
    if (off()) return;
    try {
      var om = document.getElementById('v292-omakase-settings-btn');
      if (!om || document.getElementById('v292-myseed-btn')) return;
      var b = document.createElement('button');
      b.id = 'v292-myseed-btn';
      b.textContent = '🌱 種から作る（自分の思いつきをAIが膨らませる）';
      b.style.cssText = om.style.cssText || '';
      b.className = om.className || '';
      b.onclick = function(){
        try {
          var seed = window.prompt('あなたの「種」を1〜3行でどうぞ。\n例: 記憶を食べる図書館で、司書だけが昨日を覚えている');
          if (!seed || !seed.trim()) return;
          var lore = document.getElementById('cfgLore');
          if (lore) {
            var cur = lore.value.trim();
            lore.value = '【種】' + seed.trim() + (cur ? '\n' + cur : '');
            try { lore.dispatchEvent(new Event('input', {bubbles:true})); } catch(_){}
          }
          // 残りをAIに膨らませてもらう(既存の「AIでランダム生成」を起動)
          var ai = Array.from(document.querySelectorAll('#settingsOv button')).find(function(x){ return /AIでランダム生成/.test(x.textContent); });
          if (ai) ai.click();
          try { UI.setStatus('🌱 あなたの種を軸に、残りをAIが育てています…（数秒）'); } catch(_){}
        } catch(e){}
      };
      om.parentNode.insertBefore(b, om.nextSibling);
    } catch(e){}
  }
  injectSeedBtn();
  setInterval(injectSeedBtn, 2000);

  try{ console.log(TAG, 'loaded', off()?'OFF':'ON'); }catch(_){}
})();
