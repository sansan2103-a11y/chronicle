// =====================================================================
// Chronicle TRPG - v292Dfix303: 話者帰属の後方参照コレクタ
//   問題(おしん実証): モデルがセリフを<say>タグ無しの裸引用で書くと、裸引用帰属器(fix218)が
//     「引用の直前にいた名前付きキャラ」を話者に推測する。だが引用の直後が
//     「カエデは…その声には平坦さがある」のように後方参照で話者を示している場合、
//     直前話者(レナ)に誤帰属する(実測: 「お前らもか」=カエデ → レナに誤割当)。
//   修正方針(おしん要望=根治寄り+他不具合が出にくい):
//     既存の帰属器(fix217/218等)には一切触らず、帰属後の独立コレクタとして、
//     「最強の後方参照」だけで話者を付け替える。手掛かりが弱い/無ければ一切触らない。
//   ルール(高精度・node単体で真陽性3/偽陽性5検証済):
//     R1: 引用直後が「[名前]の声(は|が|で|に|を)」→ その名前
//     R2: 引用直後が「[名前]は/が … その声には」(間に別の「声」が無い=反応文脈を除外)→ その名前
//     ※cast内の名前 & 既存whoと異なる時だけ上書き。「その声に」(反応)は対象外。
//   配線: UI.appendTurnをラップ(新ターンを描画前に補正)+設置時に既存ターンを遡及補正+
//     idempotentなポーリング(安全網)。OFF: localStorage v292Dfix303Off='1'
// =====================================================================
(function(){
  'use strict';
  if(window.__v292Dfix303) return; window.__v292Dfix303=true;
  function off(){ try{ return localStorage.getItem('v292Dfix303Off')==='1'; }catch(e){ return false; } }
  function getS(){ try{ return window.S||(typeof S!=='undefined'?S:null); }catch(e){ return null; } }
  function getUI(){ try{ return window.UI||(typeof UI!=='undefined'?UI:null); }catch(e){ return null; } }
  function castNames(){
    var s=getS(), out=[];
    try{ if(s&&s.cast){ if(s.cast.hero&&s.cast.hero.name) out.push(s.cast.hero.name); if(Array.isArray(s.cast.npcs)) s.cast.npcs.forEach(function(n){ if(n&&n.name) out.push(n.name); }); } }catch(e){}
    return out;
  }
  // ---- 補正ロジック(高精度・後方参照のみ) ----
  function correctConvSays(convSays, narrative, cast){
    var changed=0;
    var n=String(narrative||''); if(!n||!Array.isArray(convSays)) return 0;
    function castHas(nm){ return cast.indexOf(nm)>=0; }
    convSays.forEach(function(c){
      if(!c||!c.say) return;
      var say=String(c.say), idx=n.indexOf(say);
      if(idx<0){ var bare=say.replace(/^[「『]+|[」』]+$/g,''); idx=n.indexOf(bare); if(idx<0) return; say=bare; }
      var after=n.slice(idx+say.length, idx+say.length+50);
      var name=null;
      var m1=after.match(/^[\s\n「」』『]*?([^\s\n、。！？!?「」]{1,8})の声(?:は|が|で|に|を)/);
      if(m1 && castHas(m1[1])) name=m1[1];
      if(!name){
        var m2=after.match(/^[\s\n「」』『]*?([^\s\n、。！？!?「」]{1,8})(?:は|が)(?:(?!声)[\s\S]){0,28}?その声には/);
        if(m2 && castHas(m2[1])) name=m2[1];
      }
      if(name && name!==c.who){ c.who=name; changed++; }
    });
    return changed;
  }
  function processTurn(t){ try{ if(!t||!Array.isArray(t._convSays)||off()) return 0; return correctConvSays(t._convSays, t.narrative, castNames()); }catch(e){ return 0; } }

  // ---- 配線 ----
  function install(){
    var UI=getUI();
    if(!UI) return false;
    if(UI.__v292Dfix303) return true;
    // (1) appendTurn ラップ: 新ターンを描画前に補正(チラ直り回避)
    try{ if(typeof UI.appendTurn==='function'){ var oa=UI.appendTurn.bind(UI); UI.appendTurn=function(turn,idx){ try{ processTurn(turn); }catch(e){} return oa(turn,idx); }; } }catch(e){}
    UI.__v292Dfix303=true;
    // (2) 既存ターンを遡及補正 + 1回だけ再描画
    try{ var s=getS(); if(s&&Array.isArray(s.turns)){ var ch=0; s.turns.forEach(function(t){ ch+=processTurn(t); }); if(ch>0){ try{ s.save&&s.save(); }catch(e){} try{ UI.renderAll&&UI.renderAll(); }catch(e){} try{ console.log('[v292Dfix303] retroactively corrected', ch, 'speaker(s)'); }catch(e){} } } }catch(e){}
    try{ console.log('[v292Dfix303] speaker back-ref corrector wired'); }catch(e){}
    return true;
  }
  (function w(){ w._n=(w._n||0)+1; if(install()) return; if(w._n>120) return; setTimeout(w,500); })();

  // (3) idempotentなポーリング安全網(appendTurn以外の経路で追加されたターンも拾う・冪等なのでループしない)
  try{ setInterval(function(){
    if(off()) return;
    var s=getS(); if(!s||!Array.isArray(s.turns)) return;
    var ch=0; for(var i=Math.max(0,s.turns.length-4);i<s.turns.length;i++){ ch+=processTurn(s.turns[i]); }
    if(ch>0){ try{ s.save&&s.save(); }catch(e){} var UI=getUI(); try{ UI&&UI.renderAll&&UI.renderAll(); }catch(e){} try{ console.log('[v292Dfix303] corrected', ch, 'speaker(s) (poll)'); }catch(e){} }
  }, 1500); }catch(e){}

  window.__v292Dfix303api={ correctConvSays:correctConvSays, processTurn:processTurn, castNames:castNames };
})();
