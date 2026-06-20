// =====================================================================
// Chronicle TRPG - v292Dfix308: 👻怪異の不気味さセレクタ(B案・オンオフ可)
//   背景(おしんと設計・2026-06-18): fix307dは人型の幽霊を"不気味な人物"として
//     綺麗に出す(確実)。それをもう一段不気味にしたい時用のトグル。頭部欠損等の
//     ボディホラーは画像モデルが不安定なので狙わず、「確実に出る不気味さ」だけ足す。
//   仕様:
//     - トップバーにセレクタ「👻怪異 標準/不気味強め」(fix256と同方式・localStorage保存)。
//     - 「不気味強め」時、fix307が一覧に出す自動抽出キャラのdescに、確実に描ける不気味cue
//       (暗く落ち窪んだ目元・血色のない青白い肌・前髪が目を半ば覆う・虚ろな無表情)を追記。
//       →fix197は[人間]のまま不気味な人物アイコンを生成(モンスター化しない)。
//     - 切替時は該当アイコンを再生成(clearAppearance+regenFor)。
//     - fix307本体は不触。loadWorldInfoにもう一段シムを重ねるだけ(fix298/fix307の上)。
//   既定=標準(=今のfix307dと同じ)。完全停止: localStorage v292Dfix308Disable='1'
// =====================================================================
(function(){
  'use strict';
  var TAG='[v292Dfix308:creepy-toggle]';
  if(window.__v292Dfix308) return; window.__v292Dfix308=true;
  try{ if(localStorage.getItem('v292Dfix308Disable')==='1') return; }catch(e){}

  var CUE='。目元が暗く落ち窪み、血色のない青白い肌、長い前髪が目元を半ば覆い、虚ろで生気のない無表情、ぞっとする不気味な雰囲気';
  var MARK='落ち窪み'; // 冪等チェック用

  function mode(){ try{ return localStorage.getItem('v292Dfix308Mode')||'std'; }catch(e){ return 'std'; } }
  function setMode(m){ try{ localStorage.setItem('v292Dfix308Mode', m); }catch(e){} }
  function creepyOn(){ return mode()==='creepy'; }

  function rosterMap(){
    var m={};
    try{ ((window.__v292Dfix307api&&window.__v292Dfix307api.loadRoster())||[]).forEach(function(r){ if(r&&r.handle) m[r.handle]=r; }); }catch(e){}
    return m;
  }

  // fix307のloadWorldInfoシムの"上"に重ね、強め時だけ自動抽出キャラのdescに不気味cueを追記
  function installShim(){
    try{
      var lm=window.__longmem; if(!lm||!lm.raw||typeof lm.raw.loadWorldInfo!=='function') return false;
      if(lm.raw.__v292Dfix308wi) return true;
      var prev=lm.raw.loadWorldInfo.bind(lm.raw);
      lm.raw.loadWorldInfo=function(){
        var base=prev()||[];
        try{
          if(creepyOn()){
            var rm=rosterMap();
            base.forEach(function(e){
              if(e&&e.name&&rm[e.name]&&typeof e.desc==='string'&&e.desc.indexOf(MARK)<0){
                e.desc=e.desc+CUE;
              }
            });
          }
        }catch(e){}
        return base;
      };
      lm.raw.__v292Dfix308wi=true;
      try{ console.log(TAG,'worldinfo creepy-shim installed'); }catch(e){}
      return true;
    }catch(e){ return false; }
  }

  // 切替時: 自動抽出キャラのアイコン外見キャッシュを破棄して再生成(新descで描き直す)
  function regenAll(){
    try{
      var a=window.__v292Dfix197; if(!a) return;
      Object.keys(rosterMap()).forEach(function(h){ try{ if(a.clearAppearance)a.clearAppearance(h); if(a.regenFor)a.regenFor(h); }catch(e){} });
    }catch(e){}
  }

  function inject(){
    try{
      var tb=document.getElementById('topbar'); if(!tb){ setTimeout(inject,600); return; }
      if(document.getElementById('v292-creepy-sel')) return;
      var span=document.createElement('span');
      span.style.cssText='margin-left:8px;font-size:12px;display:inline-flex;align-items:center;gap:4px;';
      span.innerHTML='👻怪異<select id="v292-creepy-sel" style="font-size:12px;max-width:110px;"><option value="std">標準</option><option value="creepy">不気味強め</option></select>';
      var sel=span.querySelector('#v292-creepy-sel');
      sel.value=mode();
      sel.addEventListener('change', function(){ setMode(sel.value); regenAll(); });
      tb.appendChild(span);
      try{ console.log(TAG,'selector injected (',mode(),')'); }catch(e){}
    }catch(e){ setTimeout(inject,600); }
  }

  inject();
  installShim();
  try{ setInterval(installShim,2000); }catch(e){}
  try{ setInterval(inject,3000); }catch(e){}

  window.__v292Dfix308api={ mode:mode, setMode:setMode, regenAll:regenAll, installShim:installShim };
  try{ console.log(TAG,'loaded'); }catch(e){}
})();
