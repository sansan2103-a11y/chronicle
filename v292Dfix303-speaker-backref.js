// =====================================================================
// Chronicle TRPG - v292Dfix303: 話者帰属の後方参照コレクタ
//   問題(おしん実証): モデルがセリフを<say>タグ無しの裸引用で書くと、裸引用帰属器(fix218)が
//     「引用の直前にいた名前付きキャラ」を話者に推測する。だが引用の直後が
//     「[名前]が…彼女の声は低く」「[名前]は…その声には平坦さ」のように後方参照で話者を示す場合、
//     直前話者に誤帰属する(実測: お前らもか=カエデ→レナ / 怪談=リナ→レナ)。
//   修正方針(おしん要望=根治寄り+他不具合が出にくい): 既存帰属器は不触。帰属後の独立コレクタで
//     「最強の後方参照」だけ補正。手掛かりが弱い/無ければ一切触らない。
//   ルール(node単体11/11検証=真陽性5/偽陽性6):
//     R1: 引用直後「[名前]の声(は|が|で|に|を)」→ その名前
//     R2: 引用直後「[名前]は/が … (彼女|彼)の声(は|が) | その声(には|は|が)」(間に別の声/引用境界が無い
//         =反応文脈・別話者を除外。「その声に」(反応・に)は は/が/には が無いので不一致) → その名前
//     ※名前キャプチャはlazy(最初のは/がで止める)。cast名 & 既存whoと異なる時だけ上書き。
//   fix303b: 「彼女の声は」「その声は/が」型を追加(R2拡張)+名前lazy化(貪欲で名前が壊れる不具合修正)。
//   配線: UI.appendTurnラップ(描画前補正)+設置時に既存ターンを遡及補正+idempotentなポーリング(安全網)。
//   OFF: localStorage v292Dfix303Off='1'
// =====================================================================
(function(){
  'use strict';
  if(window.__v292Dfix303) return; window.__v292Dfix303=true;
  function off(){ try{ return localStorage.getItem('v292Dfix303Off')==='1'; }catch(e){ return false; } }
  /* ★fix547(2026-07-25): S の取得は index.html の正式API(fix539)を第一経路にする。
     間接eval 頼みの取得は実機で無言のまま null を返し、判定が丸ごと空振りした前歴がある。
     **第二経路は従来の式をそのまま残す**ので、index.html が古いキャッシュでも挙動は変わらない。
     判定ロジックには一切触れていない(取得経路だけの差し替え)。 */
  function getS(){
    try { var a = window.__chronicleGetState ? window.__chronicleGetState('fix303') : null; if (a) return a; } catch(e){}
    try { return window.S || (0,eval)('typeof S!=="undefined"?S:null') || null; } catch(e){ return null; }
  }
  function getUI(){ try{ return window.UI||(typeof UI!=='undefined'?UI:null); }catch(e){ return null; } }
  function castNames(){
    var s=getS(), out=[];
    try{ if(s&&s.cast){ if(s.cast.hero&&s.cast.hero.name) out.push(s.cast.hero.name); if(Array.isArray(s.cast.npcs)) s.cast.npcs.forEach(function(n){ if(n&&n.name) out.push(n.name); }); } }catch(e){}
    return out;
  }
  function correctConvSays(convSays, narrative, cast){
    var changed=0;
    var n=String(narrative||''); if(!n||!Array.isArray(convSays)) return 0;
    function castHas(nm){ return cast.indexOf(nm)>=0; }
    convSays.forEach(function(c){
      if(!c||!c.say) return;
      var say=String(c.say), idx=n.indexOf(say);
      if(idx<0){ var bare=say.replace(/^[「『]+|[」』]+$/g,''); idx=n.indexOf(bare); if(idx<0) return; say=bare; }
      var after=n.slice(idx+say.length, idx+say.length+60);
      var name=null;
      var m1=after.match(/^[\s\n「」』『]*?([^\s\n、。！？!?「」]{1,8}?)の声(?:は|が|で|に|を)/);
      if(m1 && castHas(m1[1])) name=m1[1];
      if(!name){
        var m2=after.match(/^[\s\n「」』『]*?([^\s\n、。！？!?「」]{1,8}?)(?:は|が)(?:(?!声|「|」)[\s\S]){0,42}?(?:(?:彼女|彼)の声|その声)(?:には|は|が)/);
        if(m2 && castHas(m2[1])) name=m2[1];
      }
      if(name && name!==c.who){ c.who=name; changed++; }
    });
    return changed;
  }
  function processTurn(t){ try{ if(!t||!Array.isArray(t._convSays)||off()) return 0; return correctConvSays(t._convSays, t.narrative, castNames()); }catch(e){ return 0; } }

  function install(){
    var UI=getUI();
    if(!UI) return false;
    if(UI.__v292Dfix303) return true;
    try{ if(typeof UI.appendTurn==='function'){ var oa=UI.appendTurn.bind(UI); UI.appendTurn=function(turn,idx){ try{ processTurn(turn); }catch(e){} return oa(turn,idx); }; } }catch(e){}
    UI.__v292Dfix303=true;
    try{ var s=getS(); if(s&&Array.isArray(s.turns)){ var ch=0; s.turns.forEach(function(t){ ch+=processTurn(t); }); if(ch>0){ try{ s.save&&s.save(); }catch(e){} try{ UI.renderAll&&UI.renderAll(); }catch(e){} try{ console.log('[v292Dfix303] retroactively corrected', ch, 'speaker(s)'); }catch(e){} } } }catch(e){}
    try{ console.log('[v292Dfix303] speaker back-ref corrector wired (b)'); }catch(e){}
    return true;
  }
  (function w(){ w._n=(w._n||0)+1; if(install()) return; if(w._n>120) return; setTimeout(w,500); })();

  try{ setInterval(function(){
    if(off()) return;
    var s=getS(); if(!s||!Array.isArray(s.turns)) return;
    var ch=0; for(var i=Math.max(0,s.turns.length-4);i<s.turns.length;i++){ ch+=processTurn(s.turns[i]); }
    if(ch>0){ try{ s.save&&s.save(); }catch(e){} var UI=getUI(); try{ UI&&UI.renderAll&&UI.renderAll(); }catch(e){} try{ console.log('[v292Dfix303] corrected', ch, 'speaker(s) (poll)'); }catch(e){} }
  }, 1500); }catch(e){}

  window.__v292Dfix303api={ correctConvSays:correctConvSays, processTurn:processTurn, castNames:castNames };
})();
