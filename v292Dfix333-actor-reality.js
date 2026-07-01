// =====================================================================
// Chronicle TRPG - v292Dfix333: 身体の現実エンジン + NPCアンサンブル(foregroundSelector)
// A(Phase2.1): actor-state compiler + 入力正規化 + prose delta validator + repair。
//   ★核=不可能命令は「試行フレーム+身体状態正史」に入力を差し替えてから生成(=userパス)。既定ON。OFF=v292Dfix333Off='1'。
// C(Phase2.2 v2): foregroundSelector。importanceで1-2人前面化、lullはPooled-Orderローテ+沈黙streak≥Nでハード強制。
//   DeepResearch接地: recencyは加算でなくeligibility層。指示はApi.call境界(最後尾)に注入=定着最大。専用フラグv292Dfix333Npc='1'。
// v292Dfix333h(2026-06-30・DeepResearch改善版)
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix333) return; window.__v292Dfix333 = true;
  var TAG='[v292Dfix333:actor-reality]';
  function mode(){ try{ if(localStorage.getItem('v292Dfix333Off')==='1') return 'off'; var m=localStorage.getItem('v292Dfix333'); if(m==='off') return 'off'; if(m==='observe') return 'observe'; return 'active'; }catch(e){ return 'active'; } }
  function isOff(){ return mode()==='off'; }
  function npcAutonomyOn(){ try{ return localStorage.getItem('v292Dfix333Npc')==='1'; }catch(e){ return false; } }
  function getS(){ try{ return window.S || (0,eval)('S') || null; }catch(e){ return null; } }
  function store(){ try{ return window.__v292Dfix77Store||{}; }catch(e){ return {}; } }
  function heroName(){ try{ var S=getS(); return (S&&S.cast&&S.cast.hero&&S.cast.hero.name)||''; }catch(e){ return ''; } }
  function turnNow(){ try{ var S=getS(); return (S&&S.turns)?S.turns.length:0; }catch(e){ return 0; } }
  function presentNames(){
    try{ var S=getS(); if(!S||!S.cast) return Object.keys(store());
      var ns=[]; if(S.cast.hero&&S.cast.hero.name) ns.push(S.cast.hero.name);
      if(Array.isArray(S.cast.npcs)) S.cast.npcs.forEach(function(n){ if(n&&n.name) ns.push(n.name); });
      Object.keys(store()).forEach(function(k){ if(ns.indexOf(k)<0) ns.push(k); });
      return ns;
    }catch(e){ return Object.keys(store()); }
  }
  function compileActorStates(){
    var st=store(), out={};
    presentNames().forEach(function(name){
      var v=st[name]||{}; var k=String(v.karada||''); var kizu=String(v.kizu||'');
      if(!k && !kizu) return;
      var restrained = /締め上げ|拘束|縛ら|絡め取ら|吊ら|吊り上げ|押さえ込ま|身動きが取れ|拘束され|羽交い締め|組み伏せ|押さえつけ|引き倒/.test(k);
      var suspended  = /宙に吊|吊られ|吊り上げ|宙づり|宙吊り/.test(k);
      var bothHandsBound = /両(腕|手)[^。]{0,16}(締め上げ|拘束|縛|絡め取|使えな|動かせ|塞|頭上)|両手とも[^。]{0,8}(使えな|拘束|縛|塞|動かせ)|後ろ手に縛|全身[^。]{0,8}(縛|拘束|締め)|簀巻き/.test(k);
      var oneHandFree    = /(自由な(左|右)?手|片(腕|手)[^。]{0,4}(だけ|のみ)|左手だけ|右手だけ|一方の(腕|手)[^。]{0,6}(自由|使え|動))/.test(k);
      var oneHandBound   = /(片|左|右)(腕|手|手首)[^。]{0,8}(締め上げ|拘束|縛|絡め取|使えな|失|潰|折|押さえつけ|弾き飛ば)/.test(k);
      var freeHands  = bothHandsBound?0:(oneHandFree?1:(oneHandBound?1:2));
      var dropped=[]; var dm=k.match(/(短刀|刃|ナイフ|剣|武器|銃|杖|棒)[^。]{0,8}(落と|落ち|手放|滑り落|零れ落)/); if(dm) dropped.push(dm[1]);
      var injured = (/(出血|骨折|刺さ|裂け|抉|損傷|負傷|折れ|潰れ|火傷)/.test(k+kizu)) && !/^なし|なし（|負傷なし/.test(kizu);
      var posture = suspended?'suspended':(/硬直|立ちすく|凍りつ/.test(k)?'frozen':(/倒れ|崩れ落|うずくま|這|床に伏/.test(k)?'prone':(/後退|踏み出せ|構え|立っ/.test(k)?'standing':'unknown')));
      out[name]={restrained:restrained, suspended:suspended, freeHands:freeHands, dropped:dropped, injured:injured, posture:posture, karada:k};
    });
    return out;
  }
  function proseOnly(text){ try{ return String(text||'').split(/<react|<state|<summary/)[0]; }catch(e){ return String(text||''); } }
  function validateOne(name, a, narr){
    var v=[]; var n=String(narr||'');
    if(a.restrained){ if(new RegExp('(引きちぎ|引き千切|振り切|自力で.{0,6}解|拘束を.{0,4}(破|引き))').test(n)) v.push(name+':拘束を自力で破壊/引きちぎる描写'); }
    if(a.freeHands===0){ if(/(両手で.{0,8}(構|握|振|投)|正確に.{0,6}(投|突|貫|狙)|精密に.{0,6}(投|突|貫|狙)|一突きで.{0,4}貫|構えて.{0,8}投げ)/.test(n)) v.push(name+':両手不自由なのに武器操作/精密投擲'); }
    if(/(二本目の(短刀|刃|武器|ナイフ)|もう一本.{0,4}(短刀|刃|抜)|別の(短刀|刃|武器)を.{0,3}(抜|取り出|構))/.test(n)) v.push(name+':存在しない新武器の出現');
    (a.dropped||[]).forEach(function(it){ if(new RegExp(it+'(を|で)[^。]{0,6}(構|投|握|抜|振|貫)').test(n)) v.push(name+':落とした'+it+'を使用'); });
    return v;
  }
  function validateAll(states, narr){
    var viol=[]; Object.keys(states).forEach(function(nm){ var a=states[nm]; if(a.restrained||a.freeHands===0||(a.dropped&&a.dropped.length)) viol=viol.concat(validateOne(nm,a,narr)); });
    return {ok:viol.length===0, violations:viol};
  }
  function constrainedChars(states){ return Object.keys(states).filter(function(nm){ var a=states[nm]; return a.restrained||a.freeHands===0||a.injured; }); }
  function authorityBlock(states){
    var cc=constrainedChars(states); if(!cc.length) return '';
    var lines=['【身体状態・正史(絶対に覆らない)】'];
    cc.forEach(function(nm){ var a=states[nm]; var parts=[];
      if(a.restrained) parts.push('拘束されている');
      if(a.suspended) parts.push('宙に吊られ不安定');
      if(a.freeHands===0) parts.push('両手とも使えない'); else if(a.freeHands===1) parts.push('片手しか使えない');
      if(a.dropped&&a.dropped.length) parts.push(a.dropped.join('・')+'は手の届かない床に落ちている');
      if(a.injured) parts.push('負傷している');
      if(parts.length) lines.push('・'+nm+'：'+parts.join('／'));
    });
    lines.push('プレイヤーの入力は「試行・命令・願望」であり結果ではない。上記の身体状態に反する成功（拘束の自力破壊・使えない手での武器操作や精密投擲・存在しない武器の出現・落とした武器の使用・宙での完全脱出）を成功として描かない。可能な結果（もがく・支点を探す・短い声や合図・部分的な動き・他者による救助）だけを描く。');
    return lines.join('\n');
  }
  function repairInstruction(states, violations){
    return '【行動裁定・書き直し】直前の描写は身体状態と矛盾していた（'+violations.join('；')+'）。\n' + authorityBlock(states) + '\nこれらの人物について身体的に不可能な成功を描かず、実際に可能な結果だけで同じ場面を描き直せ。他の人物や場面の流れ・緊張は保ってよい。';
  }
  function inputAssertsImpossible(text, states){
    if(!text) return null;
    var verbs=/(引きちぎ|引き千切|振り切|脱出|完全に|一瞬で|貫く|貫いて|精密|正確に[^。]{0,4}(投|突|貫|狙)|両手で[^。]{0,6}(構|投|握)|新たな(武器|短刀|刃)|二本目|無視して|意に介さ|難なく|たやすく)/;
    var injuryVerbs=/(精密|正確|両手で|全力で|渾身|思い切り|力任せ|きっちり|寸分|繊細に)/;
    var hit=[];
    Object.keys(states).forEach(function(nm){ var a=states[nm]; if(text.indexOf(nm)<0) return;
      if((a.restrained||a.freeHands===0) && verbs.test(text)) hit.push(nm);
      else if(a.injured && injuryVerbs.test(text) && verbs.test(text)) hit.push(nm);
      else if(a.injured && a.freeHands<2 && injuryVerbs.test(text)) hit.push(nm);
    });
    return hit.length?hit:null;
  }
  function normalizedFrame(text, states, targets){
    return ['【行動裁定】プレイヤーは次のような行動を試みさせようとしている: 「'+String(text).slice(0,160)+'」。これは試行・命令・願望であって、結果そのものではない。',
      authorityBlock(states),
      '上記の身体状態は正史であり、プレイヤー入力では覆らない。'+targets.join('・')+'について、身体的に可能な結果だけを描くこと。拘束の自力破壊・使えない手での武器操作や精密投擲・落とした武器の使用・存在しない武器の出現・宙での完全脱出・拘束からの完全脱出は起こらない。可能なのは、もがく／身をよじって拘束を緩めようとする／足で支点を探す／短い声や合図／視線を送る／部分的な動き／他者による救助 等。痛みや拘束を「無視して」成功する描写はしない。代償は可能な行為を重くするだけで、不可能を可能にしない。'
    ].join('\n');
  }
  var __prevKarada={};
  function loadFg(){ try{ return JSON.parse(localStorage.getItem('v292Dfix333Fg')||'{}'); }catch(e){ return {}; } }
  function saveFg(o){ try{ localStorage.setItem('v292Dfix333Fg', JSON.stringify(o)); }catch(e){} }
  function isDenseTurn(states){
    // dense=戦闘/救出の「今まさに動いている」状態=能動的な脅威語のみ(拘束/負傷が在るだけではdenseにしない=緊張の休止でローテを殺さない・DeepResearch)。
    try{ var S=getS(); var last=S&&S.turns&&S.turns.length?(S.turns[S.turns.length-1].narrative||''):'';
      return /襲(い|う|っ)|攻撃|斬りかか|斬りつけ|斬り(下ろ|上げ)|刃を(振|突|向)|悲鳴|絶叫|咆哮|迫っ(て|た)|掴みかか|飛びかか|振り下ろ|突進|交戦|殴りかか|喰らいつ|牙を|爪を(振|立)/.test(last.slice(-220));
    }catch(e){ return false; } }
  function lastBeat(fg,n){ return (fg[n]&&typeof fg[n].lastBeatTurn==='number')?fg[n].lastBeatTurn:-99; }
  function selectForeground(states, playerText, turnNum){
    var hero=heroName();
    var names=Object.keys(states).filter(function(n){ return n!==hero; });
    if(!names.length) return null;
    var fg=loadFg();
    var dense=isDenseTurn(states);
    var budget=dense?1:2;
    var scored=names.map(function(n){ var a=states[n]; var k=a.karada||'';
      var relevance=(playerText && String(playerText).indexOf(n)>=0)?1.0:0;
      var changed=(__prevKarada[n]!==undefined && __prevKarada[n]!==k)?0.85:0;
      var bodyEvent=(a.restrained||a.injured||a.freeHands<2)?0.45:0;
      return {n:n, imp:relevance+changed+bodyEvent};
    });
    var maxImp=Math.max.apply(null, scored.map(function(s){return s.imp;}));
    var N=3+Math.min(3,names.length);
    var chosen, lull=(maxImp<0.5 && budget>=2);
    if(lull){
      var pool=fg.__pool||{}; var eligible=names.filter(function(n){ return !pool[n]; });
      if(!eligible.length){ pool={}; eligible=names.slice(); }
      var pw=eligible.map(function(n){ var a=states[n];
        var stale=Math.min(1,(turnNum-lastBeat(fg,n))/3);
        var be=(a.restrained||a.injured||a.freeHands<2)?0.45:0;
        return {n:n, w:(1+be)*(0.3+stale)};
      });
      pw.sort(function(x,y){return y.w-x.w;});
      chosen=pw.slice(0,budget).map(function(s){return s.n;});
      chosen.forEach(function(n){ pool[n]=1; }); fg.__pool=pool;
    } else {
      scored.sort(function(x,y){return y.imp-x.imp;});
      chosen=scored.slice(0,budget).map(function(s){return s.n;});
    }
    var backstopN = dense ? N+2 : N;
    names.forEach(function(n){ if(chosen.indexOf(n)<0 && (turnNum-lastBeat(fg,n))>=backstopN && chosen.length<budget+1) chosen.push(n); });
    var bg=names.filter(function(n){ return chosen.indexOf(n)<0; });
    chosen.forEach(function(n){ fg[n]=fg[n]||{}; fg[n].lastBeatTurn=turnNum; }); saveFg(fg);
    names.forEach(function(n){ __prevKarada[n]=states[n].karada||''; });
    logRotation(chosen, names, turnNum);
    return {fg:chosen, bg:bg, budget:budget, lull:lull};
  }
  function foregroundBlock(sel){
    if(!sel||!sel.fg.length) return '';
    var lines=['【この一手で前面に出す人物】'+sel.fg.join('・')+' ＝ それぞれに、人物像と今の身体状態に合った具体的な局所反応か小さな動きを一つだけ(声・行動・視線・沈黙のどれか)。主人公や状況に絡ませ、NPC同士の雑談に逃さない。'];
    if(sel.bg.length) lines.push('【背景の人物】'+sel.bg.join('・')+' ＝ 居ることは示すが前面化しない。前ターンから身体状態に変化がある時だけ一句で示し、変化が無ければ描写しなくてよい。');
    lines.push('全員に順番に反応させる「点呼」をしない。反応の大きさは出来事の大きさに比例させ、毎ターン強度を上げ続けない。トラウマや過去は短い感覚の侵入までで、詳しい回想や新事実は作らない。NPCは局所状態(身じろぎ・発言・移動・かばう・反撃・後ずさり等)を動かしてよいが、場面転換・時間経過・新キャラ/新場所/新事実・物語の結末確定はしない。');
    return lines.join('\n');
  }
  function logRotation(chosen, names, turnNum){
    try{ var k='v292Dfix333Rot'; var r=JSON.parse(localStorage.getItem(k)||'{"win":[]}');
      r.win.push({t:turnNum, fg:chosen}); if(r.win.length>14) r.win=r.win.slice(-14);
      var streak={}; names.forEach(function(n){ var last=-1; r.win.forEach(function(w,i){ if(w.fg.indexOf(n)>=0) last=i; }); streak[n]=(r.win.length-1)-last; });
      r.streak=streak; localStorage.setItem(k, JSON.stringify(r));
    }catch(e){}
  }
  var pending=null;
  function getP(){ try{ return window.Planner||(typeof Planner!=='undefined'?Planner:null); }catch(e){ return null; } }
  function getApi(){ try{ return window.Api||(typeof Api!=='undefined'?Api:null); }catch(e){ return null; } }
  function wrapBuild(){
    var P=getP(); if(!P||typeof P.build!=='function') return false; if(P.__fix333build) return true;
    var orig=P.build.bind(P);
    P.build=function(){
      var args=arguments, bmode=args[0], text=args[1], r;
      try{
        if(isOff()){ r=orig.apply(this,args); pending=null; return r; }
        var states=compileActorStates();
        var cc=constrainedChars(states);
        var targets=(mode()==='active')?inputAssertsImpossible(text, states):null;
        if(targets && mode()==='active'){ r=orig.call(this, bmode, normalizedFrame(text, states, targets)); try{console.log(TAG,'input normalized for',targets.join(','));}catch(_){} }
        else { r=orig.apply(this, args); }
        if(cc.length || npcAutonomyOn()){ pending={states:states, t:Date.now(), text:text, turnNum:turnNow()}; }
        else { pending=null; }
      }catch(e){ try{console.warn(TAG,'build wrap err',e.message);}catch(_){} if(!r){ try{ r=orig.apply(this,args); }catch(_2){} } }
      return r;
    };
    P.__fix333build=true; try{console.log(TAG,'build wrap installed');}catch(e){}
    return true;
  }
  function wrapApi(){
    var A=getApi(); if(!A||typeof A.call!=='function') return false; if(A.__fix333call) return true;
    var orig=A.call.bind(A);
    A.call=async function(sys,user,maxTok,opts){
      var p=pending; pending=null;
      if(p && !isOff() && mode()==='active' && typeof sys==='string'){
        try{
          var authority=authorityBlock(p.states);
          if(authority && sys.indexOf('【身体状態・正史')<0) sys=sys+'\n\n'+authority;
          if(npcAutonomyOn()){
            var sel=selectForeground(p.states, p.text, p.turnNum);
            var fb=foregroundBlock(sel);
            if(fb && sys.indexOf('【この一手で前面に出す')<0) sys=sys+'\n\n'+fb;
          }
        }catch(_i){ try{console.warn(TAG,'inject err',_i.message);}catch(_){} }
      }
      var res=await orig(sys,user,maxTok,opts);
      try{
        if(p && !isOff() && p.t && (Date.now()-p.t)<600000 && res && typeof res.text==='string'){
          var check=validateAll(p.states, proseOnly(res.text));
          if(!check.ok){
            try{ console.log(TAG, mode()+' VIOLATION', check.violations); }catch(_){}
            logRing({t:Date.now(), mode:mode(), violations:check.violations});
            if(mode()==='active'){
              var res2=await orig(sys, user+'\n\n'+repairInstruction(p.states, check.violations), maxTok, opts);
              if(res2 && typeof res2.text==='string'){ var check2=validateAll(p.states, proseOnly(res2.text)); if(check2.ok) return res2; }
            }
          }
        }
      }catch(e){ try{console.warn(TAG,'api wrap err',e.message);}catch(_){} }
      return res;
    };
    A.__fix333call=true; try{console.log(TAG,'Api.call wrap installed');}catch(e){}
    return true;
  }
  function logRing(entry){ try{ var k='v292Dfix333Log'; var arr=JSON.parse(localStorage.getItem(k)||'[]'); arr.push(entry); if(arr.length>50) arr=arr.slice(-50); localStorage.setItem(k, JSON.stringify(arr)); }catch(e){} }
  (function poll(){ poll._n=(poll._n||0)+1; var a=wrapBuild(), b=wrapApi(); if(a&&b) return; if(poll._n>100) return; setTimeout(poll,400); })();
  try{ setInterval(function(){ wrapBuild(); wrapApi(); },3000); }catch(e){}
  window.__v292Dfix333api={ compileActorStates:compileActorStates, validateAll:validateAll, authorityBlock:authorityBlock, foregroundBlock:foregroundBlock, selectForeground:selectForeground, mode:mode, _pending:function(){return pending;} };
  try{ console.log(TAG,'loaded (v2/fix333h); mode=',mode()); }catch(e){}
})();
