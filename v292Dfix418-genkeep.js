// =====================================================================
// Chronicle TRPG - v292Dfix418: 🎲生成結果の消失根治(genkeep)
// ---------------------------------------------------------------------
// 真因(2026-07-11診断・コード実読で確定):
//   🎲AIランダム生成/おまかせ/種から育てる の結果は「フォームDOM」にしか
//   書かれない(seedAware成功経路のみS同期あり)。ところが
//     (1) UI.openSettings() は開くたびに全フィールドをSで丸ごと上書き
//     (2) fix149 が closeSettings 時に名前空のNPCをSから掃除
//     (3) 生成は非同期(数秒〜)。モーダルを閉じて待つと、完了時に不可視の
//         フォームへ書き込み→トーストだけ表示→次に開いた瞬間(1)で全消し
//   ⇒「トーストは出たのに設定が空」(iPhone/PC共通・構造的に100%再現)。
//
// 修正(最小・後方互換):
//   A) UI.randomFill 実行時に時刻フラグを立てる(TTL 5分)。
//   B) UI.openSettings をラップ: populate 前にフォームを snapshot し、
//      populate 後、「snapshot に値があるのに今は空」のフィールドだけ復元。
//      NPCカードは名前一致で照合し、Sから消されたカードは addNpc で再生。
//   C) 復元は TTL 内のみ・空欄にのみ書く・Sには一切書かない(保存の意思
//      決定は従来どおり「✔保存してゲーム開始」でおしんに残る)。
//   D) saveSettings でフラグ解除(確定後は素の挙動に戻る)。
//
// 冪等: window.__v292Dfix418 + 関数プロパティ _f418w/_f418o/_f418s
//       (fix274教訓: ラップ検出は関数上フラグで行う)
// OFF : localStorage v292Dfix418Off='1' (ラップは残るが素通しになる)
// ロールバック: 本ファイルのscriptタグ削除 or OFFスイッチ
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix418) return;
  window.__v292Dfix418 = true;
  var TAG = '[v292Dfix418:genkeep]';
  var TTL_MS = 5 * 60 * 1000;
  var SCALARS = ['cfgHName','cfgHDesc','cfgLore','cfgLoc','cfgObj','cfgTone'];
  var NPC_FIELDS = ['name','desc','personality','coreDesire','coreFear','wound'];

  function off(){ try { return localStorage.getItem('v292Dfix418Off') === '1'; } catch(e){ return false; } }
  function getUI(){ try { if (typeof UI !== 'undefined' && UI) return UI; } catch(e){} return window.UI || null; }
  function fresh(){ return !!(window.__f418genAt && (Date.now() - window.__f418genAt) < TTL_MS); }

  function fire(el){ try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch(e){} }

  function snapScalars(){
    var o = {};
    for (var i = 0; i < SCALARS.length; i++){
      var el = document.getElementById(SCALARS[i]);
      o[SCALARS[i]] = el ? String(el.value || '').trim() : '';
    }
    return o;
  }
  function snapNpcs(){
    var arr = [];
    var cards = document.querySelectorAll('#npcList .npc-card');
    for (var i = 0; i < cards.length; i++){
      var o = {};
      for (var j = 0; j < NPC_FIELDS.length; j++){
        var el = cards[i].querySelector('[data-f="' + NPC_FIELDS[j] + '"]');
        o[NPC_FIELDS[j]] = el ? String(el.value || '').trim() : '';
      }
      arr.push(o);
    }
    return arr;
  }
  function fillCard(card, snap){
    var n = 0;
    for (var j = 0; j < NPC_FIELDS.length; j++){
      var f = NPC_FIELDS[j];
      if (!snap[f]) continue;
      var el = card.querySelector('[data-f="' + f + '"]');
      if (el && !String(el.value || '').trim()){ el.value = snap[f]; fire(el); n++; }
    }
    return n;
  }

  function restore(preScalars, preNpcs){
    var restored = 0;
    // --- スカラー6欄: snapshotに値があり、populate後に空のものだけ ---
    for (var i = 0; i < SCALARS.length; i++){
      var id = SCALARS[i];
      if (!preScalars[id]) continue;
      var el = document.getElementById(id);
      if (el && !String(el.value || '').trim()){ el.value = preScalars[id]; fire(el); restored++; }
    }
    // --- NPCカード: 名前一致で照合。Sから消された(名前あり)カードは再生 ---
    var U = getUI();
    var cards = document.querySelectorAll('#npcList .npc-card');
    var byName = {};
    for (var c = 0; c < cards.length; c++){
      var ne = cards[c].querySelector('[data-f="name"]');
      var nm = ne ? String(ne.value || '').trim() : '';
      if (nm && byName[nm] === undefined) byName[nm] = cards[c];
    }
    for (var k = 0; k < preNpcs.length; k++){
      var snap = preNpcs[k];
      if (!snap.name) continue; // 名前まで空だったカードは復元対象外
      if (byName[snap.name]){
        restored += fillCard(byName[snap.name], snap);
      } else if (U && typeof U.addNpc === 'function'){
        try {
          U.addNpc(); // S.cast.npcsにも空エントリが載る(コア挙動)→保存時にDOM値が書き戻る
          var cs = document.querySelectorAll('#npcList .npc-card');
          var last = cs[cs.length - 1];
          if (last) restored += fillCard(last, snap);
        } catch(e){}
      }
    }
    return restored;
  }

  function wrapOpen(U){
    if (U.openSettings && U.openSettings._f418w) return true;
    if (typeof U.openSettings !== 'function') return false;
    var orig = U.openSettings;
    var w = function(){
      var doIt = !off() && fresh();
      var ps = null, pn = null;
      if (doIt){ try { ps = snapScalars(); pn = snapNpcs(); } catch(e){ doIt = false; } }
      var r = orig.apply(this, arguments);
      if (doIt){
        try {
          var n = restore(ps, pn);
          if (n > 0){
            try { U.setStatus('🎲 未保存の生成内容を復元しました。「✔ 保存してゲーム開始」で確定します。'); } catch(e){}
            try { console.log(TAG, 'restored', n, 'field(s)'); } catch(e){}
          }
        } catch(e){ try { console.warn(TAG, 'restore failed:', e && e.message); } catch(_){} }
      }
      return r;
    };
    w._f418w = true;
    U.openSettings = w;
    return true;
  }

  function wrapRandom(U){
    if (U.randomFill && U.randomFill._f418o) return true;
    if (typeof U.randomFill !== 'function') return false;
    var orig = U.randomFill;
    var w = function(){
      try { if (!off()) window.__f418genAt = Date.now(); } catch(e){}
      return orig.apply(this, arguments);
    };
    w._f418o = true;
    U.randomFill = w;
    return true;
  }

  function wrapSave(U){
    if (U.saveSettings && U.saveSettings._f418s) return true;
    if (typeof U.saveSettings !== 'function') return false;
    var orig = U.saveSettings;
    var w = function(){
      var r = orig.apply(this, arguments);
      try { window.__f418genAt = 0; } catch(e){}
      return r;
    };
    w._f418s = true;
    U.saveSettings = w;
    return true;
  }

  function arm(){
    var U = getUI();
    if (!U) return false;
    var a = wrapOpen(U), b = wrapRandom(U), c = wrapSave(U);
    if (a && b && c){
      try { console.log(TAG, 'armed', off() ? '(OFF)' : '(ON)'); } catch(e){}
      return true;
    }
    return false;
  }
  if (!arm()){
    var n = 0;
    var iv = setInterval(function(){ if (arm() || ++n > 80) clearInterval(iv); }, 250);
  }
})();
