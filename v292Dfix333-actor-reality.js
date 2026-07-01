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
  function npcAutonomyOn(){ try{ var v=localStorage.getItem('v292Dfix333Npc'); return v!=='0' && v!=='off'; }catch(e){ return true; } }
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
  // Phase2.2 ①: eligibility候補制約(DeepResearch 3回目)。反応できないNPC(意識なし/死亡/不在)を前面化候補から外す物理ゲート。矯正再生成はしない・背景としては残る。OFF退避=v292Dfix333Elig='0'
  function eligOff(){ try{ return localStorage.getItem('v292Dfix333Elig')==='0'; }catch(e){ return false; } }
  function isEligible(a){ var k=(a&&a.karada)||''; if(/気絶|失神|意識を失|昏倒|気を失|昏睡|生き絶え|絶命|事切れ|死亡|死んで/.test(k)) return false; if(/その場にいない|立ち去っ|退場|姿を消し|去っていっ|不在/.test(k)) return false; return true; }
  function selectForeground(states, playerText, turnNum){
    var hero=heroName();
    var allNames=Object.keys(states).filter(function(n){ return n!==hero; });
    if(!allNames.length) return null;
    // eligibility候補制約: 反応可能なNPCだけを前面化候補に(全滅時は全員にフォールバック)。bgは全present。
    var names = eligOff() ? allNames : allNames.filter(function(n){ return isEligible(states[n]); });
    if(!names.length) names = allNames;
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
    var bg=allNames.filter(function(n){ return chosen.indexOf(n)<0; });
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
      r.streak=streak;
      // ★品質の主軸指標(DeepResearch): 前面化回数のJain公平指数 + 最長沈黙streak。個別full/compressedより信頼できる配分均等性の数学的指標。
      var cnt={}; names.forEach(function(n){ cnt[n]=0; }); r.win.forEach(function(w){ w.fg.forEach(function(n){ if(cnt[n]!=null) cnt[n]++; }); });
      var vals=names.map(function(n){ return cnt[n]||0; }); var sum=0,sq=0; vals.forEach(function(x){ sum+=x; sq+=x*x; });
      r.jain = (sq>0 && names.length>0) ? +((sum*sum)/(names.length*sq)).toFixed(3) : 1;   // 1=完全均等・低い=偏り
      r.maxStreak = Math.max.apply(null, names.map(function(n){ return streak[n]; }).concat([0]));
      r.counts = cnt;
      localStorage.setItem(k, JSON.stringify(r));
    }catch(e){}
  }
  function rotSnapshot(){ try{ var r=JSON.parse(localStorage.getItem('v292Dfix333Rot')||'{}'); return {jain:r.jain, maxStreak:r.maxStreak}; }catch(e){ return {}; } }
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
      try{
        if(p && npcAutonomyOn() && res && typeof res.text==='string'){
          var _sel2=null; try{ _sel2=selectForeground(p.states, p.text, p.turnNum); }catch(_s){}
          var _budget=_sel2?_sel2.budget:2;
          var _hero=heroName();
          var _npcs=presentNames().filter(function(n){ return n && n!==_hero; });
          var _qa=analyzeEnsemble(proseOnly(res.text), _npcs, _budget);
          _qa.t=Date.now(); _qa.turn=p.turnNum; _qa.fg=_sel2?_sel2.fg:null; var _rs=rotSnapshot(); _qa.jain=_rs.jain; _qa.maxStreak=_rs.maxStreak; _qa.scene=classifyScene(p.text, p.states, proseOnly(res.text));
          logQuality(_qa);
          if(_qa.rollcall||_qa.melodrama.length||_qa.monopoly){ try{ console.log(TAG,'QUAL flags', JSON.stringify({rollcall:_qa.rollcall, melo:_qa.melodrama.length, mono:_qa.monopoly, turn:_qa.turn})); }catch(_){} }
        }
      }catch(_q){ try{console.warn(TAG,'qual err',_q.message);}catch(_){} }
      return res;
    };
    A.__fix333call=true; try{console.log(TAG,'Api.call wrap installed');}catch(e){}
    return true;
  }
  // ---- Phase2.2 ①: アンサンブル品質検出器 (LOGGING ONLY・resは改変しない・DeepResearch 2026-07-01) ----
  // 文単位で帰属(BookNLP的)=文字数窓の隣接NPC食い込みを回避。台詞別ストリーム構造ゆえ発話動詞を主シグナルに。
  var MELO_CLUSTERS = {
    tremble:['震え','戦慄','わなな','身震い','ぶるっ','ふるえ','慄然'],
    tears:['涙','嗚咽','泣き','しゃくり','目頭','咽び'],
    scream:['悲鳴','絶叫','叫ん','喚'],
    heart:['鼓動','心臓','動悸','脈打']
  };
  var SPEECH_VERB=/(答え|言っ|返し|呟|囁|叫ん|絞り出|漏らし|口を開)/;
  var NEG_ANSWER=/(答える代わり|答えず|答えなかった|答えない|答えられ(ず|ない)|返す代わり|口を開(かず|かない))/;
  // 能動的な身体/知覚反応(静的状態は含めない)=発話が無くても実質的な反応ビートの3つ目シグナル(DeepResearch: Action/Interiority動詞句)
  var ACTIVE_BODY=/(捻っ|よじ|後ずさ|うずくま|崩れ落|震わせ|見開|踏み(出|込)|振り(向|返)|立ち上が|飛び(退|の|かか|込)|身を(引|伏|投|乗)|手を(伸|かけ|突)|かばっ|息を(呑|詰|止)|うめ|呻|喘|爪を(立|かけ)|噤|睨みつけ|振り絞|抱え込|突き(飛|放))/;
  function _splitSents(t){ try{ return String(t||'').split(/(?<=[。！？\n])/).filter(function(x){return x&&x.trim().length;}); }catch(e){ return [String(t||'')]; } }
  function _stripQuotes(s){ return String(s||'').replace(/[「『][^」』]*[」』]/g,''); }
  function analyzeEnsemble(prose, npcNames, budget){
    var sents=_splitSents(prose);
    var acc={}; npcNames.forEach(function(n){ acc[n]={speech:false,quote:false,actor:false,clauses:0,chars:0,melo:{},seen:false}; });
    var lastOwner=null;
    sents.forEach(function(sen){
      var bare=_stripQuotes(sen);
      var named=npcNames.filter(function(n){ return bare.indexOf(n)>=0; });   // 引用符の外で名指しされたNPC
      var owner = named.length? named[0] : lastOwner;                          // 無名文は直前の主体の継続
      if(owner && acc[owner]){
        acc[owner].seen=true;
        if(SPEECH_VERB.test(bare) && !NEG_ANSWER.test(bare)) acc[owner].speech=true;
        if(/[「『][^」』]{2,}[」』]/.test(sen)) acc[owner].quote=true;
        if(named.length){ var n0=named[0]; var after=bare.slice(bare.indexOf(n0)); if(new RegExp(n0+'(は|が|も|、|——|の)').test(bare) && ACTIVE_BODY.test(after)) acc[owner].actor=true; }
        acc[owner].clauses += (bare.match(/[、](?=.)/g)||[]).length + 1;
        acc[owner].chars += sen.length;
        Object.keys(MELO_CLUSTERS).forEach(function(cat){ if(new RegExp(MELO_CLUSTERS[cat].join('|')).test(bare)) acc[owner].melo[cat]=true; });
      }
      if(named.length) lastOwner=owner;
    });
    var beats={}, fullN=0, seenN=0, fullShare={}, fullTotal=0;
    npcNames.forEach(function(n){
      var a=acc[n]; if(!a.seen){ beats[n]='absent'; return; }
      seenN++;
      var full = a.speech || a.quote || (a.actor && a.clauses>=2);            // full=発話/引用 or 能動的身体反応+複数節。背景一句/静的状態はcompressed
      var cls= full?'full':'compressed'; beats[n]=cls; if(cls==='full'){ fullN++; fullShare[n]=a.chars; fullTotal+=a.chars; }
    });
    var lowSignal = seenN<=1;                                                  // 主人公焦点/希薄ターン=点呼統計から除外(DeepResearch)
    var cats={}; npcNames.forEach(function(n){ Object.keys(acc[n].melo||{}).forEach(function(c){ (cats[c]=cats[c]||[]).push(n); }); });
    var meloFlags=[]; Object.keys(cats).forEach(function(c){ if(cats[c].length>=2) meloFlags.push(c+':'+cats[c].join('/')); });
    // monopoly再定義(DeepResearch3): fullCount>=2で1人がfull反応内容の>65%を占める時のみ。fullCount<=1では発火させない(背景言及の文字数偏りでの誤発火を除去)。
    var maxFull=0; Object.keys(fullShare).forEach(function(n){ if(fullShare[n]>maxFull) maxFull=fullShare[n]; });
    var monopoly= fullN>=2 && fullTotal>0 && (maxFull/fullTotal)>0.65;
    return { beats:beats, fullCount:fullN, budget:budget, rollcall:(fullN>budget && !lowSignal), melodrama:meloFlags, monopoly:monopoly, lowSignal:lowSignal };
  }
  // Phase2.2: シーン層タグ付け(層別データ収集・DeepResearch3の運用ルール)。層内で点呼/独占率を追うため。
  function classifyScene(playerText, states, prose){
    try{
      var pt=String(playerText||''); var text=pt+' '+String(prose||'');
      if(/襲(い|う|っ|わ)|斬りかか|斬りつけ|斬り(下ろ|上げ)|飛びかか|掴みかか|殴りかか|振り下ろ|突進|咆哮|噛みつ|喰らいつ|牙を|爪を(振|立)|銃(を|口)|爆発|刃を(振|突|向)|迫っ(て|た)くる/.test(text)) return 'threat';
      var hero=heroName(); var npcs=Object.keys(states||{}).filter(function(n){return n!==hero;});
      var addressed=npcs.filter(function(n){ return pt.indexOf(n)>=0; });
      if(addressed.length>=2) return 'multi_address';
      if(addressed.length===1) return 'single_address';
      return 'calm';
    }catch(e){ return 'calm'; }
  }
  function logQuality(entry){ try{ var k='v292Dfix333Qual'; var arr=JSON.parse(localStorage.getItem(k)||'[]'); arr.push(entry); if(arr.length>60) arr=arr.slice(-60); localStorage.setItem(k, JSON.stringify(arr)); }catch(e){} }
  function logRing(entry){ try{ var k='v292Dfix333Log'; var arr=JSON.parse(localStorage.getItem(k)||'[]'); arr.push(entry); if(arr.length>50) arr=arr.slice(-50); localStorage.setItem(k, JSON.stringify(arr)); }catch(e){} }
  (function poll(){ poll._n=(poll._n||0)+1; var a=wrapBuild(), b=wrapApi(); if(a&&b) return; if(poll._n>100) return; setTimeout(poll,400); })();
  try{ setInterval(function(){ wrapBuild(); wrapApi(); },3000); }catch(e){}
  function qualStats(){
    try{ var arr=JSON.parse(localStorage.getItem('v292Dfix333Qual')||'[]'); var by={};
      arr.forEach(function(e){ if(e.lowSignal) return; var sc=e.scene||'calm'; var b=by[sc]||(by[sc]={n:0,rollcall:0,monopoly:0,melodrama:0,jainSum:0}); b.n++; if(e.rollcall)b.rollcall++; if(e.monopoly)b.monopoly++; if(e.melodrama&&e.melodrama.length)b.melodrama++; b.jainSum+=(e.jain||1); });
      Object.keys(by).forEach(function(sc){ var b=by[sc]; b.rollcallRate=+(b.rollcall/b.n).toFixed(2); b.monopolyRate=+(b.monopoly/b.n).toFixed(2); b.melodramaRate=+(b.melodrama/b.n).toFixed(2); b.avgJain=+(b.jainSum/b.n).toFixed(3); delete b.jainSum; });
      return {total:arr.length, byScene:by};
    }catch(e){ return {err:e.message}; }
  }
  window.__v292Dfix333api={ compileActorStates:compileActorStates, validateAll:validateAll, authorityBlock:authorityBlock, foregroundBlock:foregroundBlock, selectForeground:selectForeground, analyzeEnsemble:analyzeEnsemble, classifyScene:classifyScene, qualStats:qualStats, mode:mode, _pending:function(){return pending;} };
  try{ console.log(TAG,'loaded (v2/fix333h); mode=',mode()); }catch(e){}
})();
