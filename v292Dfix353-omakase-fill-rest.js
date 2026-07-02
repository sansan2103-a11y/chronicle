// =====================================================================
// Chronicle TRPG - v292Dfix353: おまかせ1回で空きNPCカードを全部埋める
// 背景(2026-07-02 おしん報告「二人目のNPCはおまかせでも入力されない」):
//   fix342の仕様=おまかせ1押しで埋めるのは「最初の未完成カード1枚」だけ
//   (種パックのNPCは1人分)。2枚目はもう1回押せば埋まるが期待とズレる。
// 対策: __v334Omakase の後段ラッパ(fix351のラップよりさらに外側)。
//   本体のfill完了を見届けた後、残りの未完成カードを
//   __v292Dfix335api.draw() の別種(f.npc)で1枚ずつ充填する。
//   ・fix335本体は不触(公開apiのみ使用)
//   ・空欄のみ埋める(既入力は尊重・fix342と同じ流儀)
//   ・inputイベントを発火するのでfix351のデバウンスコミットが自動で拾う
//   ・名前の重複は再抽選(最大3回)で回避
// ロード順: fix351/fix352より後に<script>を置く(fix351のラップ済み関数を包む)。
// OFF: localStorage v292Dfix353Off='1'
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix353) return; window.__v292Dfix353 = true;
  var TAG = '[v292Dfix353:fillRest]';
  function off(){ try{ return localStorage.getItem('v292Dfix353Off')==='1'; }catch(e){ return false; } }

  var FLDS = ['name','desc','personality','coreDesire','coreFear','wound'];
  function cardIncomplete(card){
    for (var i=0;i<FLDS.length;i++){
      var e = card.querySelector('[data-f="'+FLDS[i]+'"]');
      if (e && !(e.value && e.value.trim())) return true;
    }
    return false;
  }
  function incompleteCards(){
    var out = [];
    var cards = document.querySelectorAll('#npcList .npc-card');
    Array.prototype.forEach.call(cards, function(c){ if (cardIncomplete(c)) out.push(c); });
    return out;
  }
  function existingNames(){
    var names = {};
    document.querySelectorAll('#npcList .npc-card [data-f="name"]').forEach(function(e){
      var v = String(e.value||'').trim(); if (v) names[v] = 1;
    });
    try {
      var hn = document.getElementById('cfgHName');
      if (hn && hn.value.trim()) names[hn.value.trim()] = 1;
    } catch(_){}
    return names;
  }
  function setIfEmpty(card, fld, v){
    var e = card.querySelector('[data-f="'+fld+'"]');
    if (e && !(e.value && e.value.trim())) {
      e.value = v;
      try { e.dispatchEvent(new Event('input', {bubbles:true})); } catch(_){}
    }
  }
  function fillCard(card, npc){
    FLDS.forEach(function(f){ if (npc[f] != null) setIfEmpty(card, f, npc[f]); });
  }

  // 残りの未完成カードを1枚ずつ別種で充填(直列)
  function fillRest(done){
    var api = window.__v292Dfix335api;
    if (!api || typeof api.draw !== 'function') { done && done('no-api'); return; }
    var queue = incompleteCards();
    if (!queue.length) { done && done(0); return; }
    var filled = 0;
    (function next(){
      var card = queue.shift();
      if (!card) { try{ console.log(TAG, 'filled '+filled+' extra card(s)'); }catch(_){}; done && done(filled); return; }
      if (!cardIncomplete(card)) { next(); return; } // 本体や前ループが埋めた分はスキップ
      var attempts = 0;
      (function drawOne(){
        api.draw(function(pick, fields){
          try {
            var npc = fields && fields.npc;
            if (!npc) { next(); return; }
            var names = existingNames();
            if (npc.name && names[npc.name] && attempts < 3) { attempts++; drawOne(); return; } // 名前かぶり再抽選
            fillCard(card, npc);
            filled++;
          } catch(e){ try{ console.warn(TAG, e); }catch(_){} }
          next();
        });
      })();
    })();
  }
  window.__v292Dfix353fillRest = fillRest;

  function wrap(){
    var orig = window.__v334Omakase;
    if (typeof orig !== 'function' || orig._f353wrapped) return !!(orig && orig._f353wrapped);
    var wrapped = function(){
      var r = orig.apply(this, arguments);
      if (off()) return r;
      // 本体のfill完了(最初のカードが完成 or ヒーロー名が入る)を待ってから残りを充填
      var t0 = Date.now();
      (function watch(){
        var el = Date.now() - t0;
        var hn = document.getElementById('cfgHName');
        var heroFilled = hn && hn.value && hn.value.trim();
        var cards = document.querySelectorAll('#npcList .npc-card');
        var anyComplete = false;
        Array.prototype.forEach.call(cards, function(c){ if (!cardIncomplete(c)) anyComplete = true; });
        // 本体fillとの競合を避けるため最低2秒待つ(本体は温間~0.3s/冷間~2sで完了)
        if ((heroFilled || anyComplete) && el >= 2000) { setTimeout(function(){ fillRest(); }, 250); return; }
        if (el > 15000) return; // 本体が失敗したなら何もしない
        setTimeout(watch, 350);
      })();
      return r;
    };
    wrapped._f353wrapped = true;
    window.__v334Omakase = wrapped;
    return true;
  }
  if (!wrap()) {
    var tries = 0;
    var iv = setInterval(function(){ if (wrap() || ++tries > 40) clearInterval(iv); }, 500);
  }

  try{ console.log(TAG, 'loaded', off()?'OFF':'ON'); }catch(_){}
})();
