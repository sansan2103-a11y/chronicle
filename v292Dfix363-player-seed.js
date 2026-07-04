// =====================================================================
// Chronicle TRPG - v292Dfix363: 「プレイヤーの入力=種」の根幹化
// おしんの設計思想(2026-07-03)：種から作る＝ゲームの根幹。
//   ①設定画面: プレイヤーが入力済みの場所・名前・設定の断片を汲み取って空欄を埋める
//   ②プレイ中: DO/SAY/STORYの入力内容を種として拾い、物語の展開に芽吹かせる
// 実装:
//   A) sys注入(毎ターン・既定ON): 「プレイヤーの種」原則(~250字・短文=oatmeal回避)。
//      Planner.buildラップ・非__v292マーク・sys内マーカー冪等。OFF=v292Dfix363Off
//   B) 🌱ボタン(fix360)の動作を思想に合わせ差し替え:
//      既入力(名前/世界観/場所/目的/NPC等)が1つでもあれば、聞き直さずに
//      その入力を種として「AIでランダム生成」(入力読解型=fix284/291系譜)を直接起動。
//      まっさらの時だけ従来どおり1〜3行の種を聞く。ラベルも「種から育てる」に。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix363) return; window.__v292Dfix363 = true;
  var TAG = '[v292Dfix363:playerSeed]';
  function off(){ try{ return localStorage.getItem('v292Dfix363Off')==='1'; }catch(e){ return false; } }
  function getS(){ try{ if (window.S) return window.S; return (0,eval)('S'); }catch(e){ return null; } }

  // ---- A) 毎ターンの「プレイヤーの種」原則 ----
  var BLOCK = '\n【プレイヤーの種】プレイヤーがDO/SAY/STORYで書き込む内容は、この物語の種である。入力に現れた固有名詞・場所・小道具・意図・思いつきは使い捨てにせず物語の記憶として拾い上げ、のちの展開で芽吹かせて意味を持たせる。入力を素通りさせたり打ち消したりせず、その方向へ世界を確かに動かして応える。';
  function armWrap(){
    var P = null;
    try { P = window.Planner || (0,eval)('Planner'); } catch(e){}
    if (!P || typeof P.build !== 'function' || P.build._f363mark) return !!(P && P.build && P.build._f363mark);
    var ob = P.build;
    var w = function(){
      var r = ob.apply(this, arguments);
      try {
        if (!off() && r && typeof r.sys === 'string' && r.sys.indexOf('【プレイヤーの種】') < 0) r.sys += BLOCK;
      } catch(e){}
      return r;
    };
    w._f363mark = true;
    P.build = w;
    return true;
  }
  if (!armWrap()) { var n = 0; var iv = setInterval(function(){ if (armWrap() || ++n > 60) clearInterval(iv); }, 500); }

  // ---- B) 🌱ボタンを「入力を汲み取って育てる」動線に ----
  function anySeedInput(){
    try {
      var ids = ['cfgHName','cfgHDesc','cfgLore','cfgLoc','cfgObj','cfgTone'];
      for (var i=0;i<ids.length;i++){ var e = document.getElementById(ids[i]); if (e && e.value && e.value.trim()) return true; }
      var nf = document.querySelectorAll('#npcList .npc-card [data-f]');
      for (var j=0;j<nf.length;j++){ if (nf[j].value && nf[j].value.trim()) return true; }
    } catch(e){}
    return false;
  }
  function clickAiGen(){
    var ai = Array.from(document.querySelectorAll('#settingsOv button')).find(function(x){ return /AIでランダム生成/.test(x.textContent); });
    if (ai) { ai.click(); return true; }
    return false;
  }
  function retarget(){
    if (off()) return;
    try {
      var b = document.getElementById('v292-myseed-btn');
      if (!b || b.__f363done) return;
      b.__f363done = true;
      b.textContent = '🌱 種から育てる（入力した断片をAIが汲み取って残りを埋める）';
      b.title = '名前・場所・世界観など、書きかけの断片があればそれを種に。まっさらなら思いつきを1〜3行聞きます';
      b.onclick = function(){
        try {
          if (anySeedInput()) {
            if (clickAiGen()) { try{ UI.setStatus('🌱 あなたの入力を種として、空欄を育てています…（数秒）'); }catch(_){} }
            return;
          }
          var seed = window.prompt('あなたの「種」を1〜3行でどうぞ。\n例: 記憶を食べる図書館で、司書だけが昨日を覚えている');
          if (!seed || !seed.trim()) return;
          var lore = document.getElementById('cfgLore');
          if (lore) {
            lore.value = '【種】' + seed.trim();
            try { lore.dispatchEvent(new Event('input', {bubbles:true})); } catch(_){}
          }
          if (clickAiGen()) { try{ UI.setStatus('🌱 あなたの種を軸に、残りをAIが育てています…（数秒）'); }catch(_){} }
        } catch(e){}
      };
    } catch(e){}
  }
  retarget();
  setInterval(retarget, 2000);

  try{ console.log(TAG, 'loaded', off()?'OFF':'ON'); }catch(_){}
})();
