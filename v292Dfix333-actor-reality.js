// =====================================================================
// Chronicle TRPG - v292Dfix333: 身体の現実エンジン(actor-state compiler + prose
//   delta validator + 入力正規化/権威注入 + repair再生成)。Phase2.1。
// 背景(2026-06-30): fix330(プローズの身体ガード)は基礎ガードとして検証完了したが、
//   敵対的な明示プレイヤー命令(拘束中ハルに「拘束を引きちぎり核を精密に貫き完全脱出」)は
//   プローズでは止められない(実機でhaikuが命令丸ごと成功描写・二本目の短刀まで生やした)。
//   GPT+DeepResearch結論=「コードが正史stateを持ち・LLMは仮の描写・検査器が矛盾を弾き・
//   通ったものだけcommit」=コードが不正をcommitしない時だけ権威になる。
//   実機プロトタイプで①validatorが違反を正しく検出②入力正規化で同じ命令が身体制約を守る、を実証。
// 設計: fix77 store(__v292Dfix77Store の karada/kizu)から各キャラの構造actor-stateを抽出し、
//   ①拘束/重傷キャラがいる時 Planner.build wrapで「身体状態は正史・プレイヤー入力は試行」権威ブロックを
//   sysへ注入(authority) ②Api.call wrapで生成結果を actor-state と照合し、不可能な成功を描いたら
//   active時は1回だけ制約付きで再生成(repair)・observe時はログのみ。
// モード(localStorage 'v292Dfix333'): 既定OFF(何もしない) / 'observe'(検査+ログのみ) / 'active'(注入+repair)
//   既定OFFゆえライブの友達に影響なし。実機A/B後に active を既定化する想定。
// 冪等・コア不触・非__v292マーク(__fix333wrap)。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix333) return; window.__v292Dfix333 = true;
  var TAG='[v292Dfix333:actor-reality]';
  // 既定ON(active)。OFFは緊急退避: v292Dfix333Off='1' か v292Dfix333='off'。observeも明示時のみ。v292Dfix333f
  function mode(){ try{ if(localStorage.getItem('v292Dfix333Off')==='1') return 'off'; var m=localStorage.getItem('v292Dfix333'); if(m==='off') return 'off'; if(m==='observe') return 'observe'; return 'active'; }catch(e){ return 'active'; } }
  function isOff(){ return mode()!=='observe' && mode()!=='active'; }

  // ---- fix77 store (slot-aware via the live wrapper; just read the global cache) ----
  function store(){ try{ return window.__v292Dfix77Store||{}; }catch(e){ return {}; } }
  function presentNames(){
    try{ var S=window.S||(typeof S!=='undefined'?S:null); if(!S||!S.cast) return Object.keys(store());
      var ns=[]; if(S.cast.hero&&S.cast.hero.name) ns.push(S.cast.hero.name);
      if(Array.isArray(S.cast.npcs)) S.cast.npcs.forEach(function(n){ if(n&&n.name) ns.push(n.name); });
      // include any store key too (NPCs not in cast list)
      Object.keys(store()).forEach(function(k){ if(ns.indexOf(k)<0) ns.push(k); });
      return ns;
    }catch(e){ return Object.keys(store()); }
  }

  // ---- actor-state compiler: structured flags from fix77 karada/kizu text ----
  function compileActorStates(){
    var st=store(), out={};
    presentNames().forEach(function(name){
      var v=st[name]||{}; var k=String(v.karada||''); var kizu=String(v.kizu||'');
      if(!k && !kizu) return;
      var restrained = /締め上げ|拘束|縛ら|絡め取ら|吊ら|吊り上げ|押さえ込ま|身動きが取れ|拘束され|羽交い締め|組み伏せ|押さえつけ|引き倒/.test(k);
      var suspended  = /宙に吊|吊られ|吊り上げ|宙づり|宙吊り/.test(k);
      // freeHands は「手・腕」の拘束だけで判定する(脚の拘束では手は自由)。v292Dfix333e
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

  // ---- prose delta validator: detect physically-impossible success in narrative ----
  //   保守的: 曖昧な「脱出/自由になった」(救助かもしれない)はトリガーにせず、自力の物理破綻だけ見る。
  function validateOne(name, a, narr){
    var v=[]; var n=String(narr||'');
    // その人物名の近傍だけを見る精度は将来課題。今は全文走査(プロト同等)。
    if(a.restrained){
      if(new RegExp('(引きちぎ|引き千切|振り切|自力で.{0,6}解|拘束を.{0,4}(破|引き))').test(n)) v.push(name+':拘束を自力で破壊/引きちぎる描写');
    }
    if(a.freeHands===0){
      if(/(両手で.{0,8}(構|握|振|投)|正確に.{0,6}(投|突|貫|狙)|精密に.{0,6}(投|突|貫|狙)|一突きで.{0,4}貫|構えて.{0,8}投げ)/.test(n)) v.push(name+':両手不自由なのに武器操作/精密投擲');
    }
    if(/(二本目の(短刀|刃|武器|ナイフ)|もう一本.{0,4}(短刀|刃|抜)|別の(短刀|刃|武器)を.{0,3}(抜|取り出|構))/.test(n)) v.push(name+':存在しない新武器の出現');
    (a.dropped||[]).forEach(function(it){ if(new RegExp(it+'(を|で)[^。]{0,6}(構|投|握|抜|振|貫)').test(n)) v.push(name+':落とした'+it+'を使用'); });
    return v;
  }
  function proseOnly(text){ // strip internal tags so we validate only player-visible prose (fix333d)
    try{ return String(text||'').split(/<react|<state|<summary/)[0]; }catch(e){ return String(text||''); }
  }
  function validateAll(states, narr){
    var viol=[]; Object.keys(states).forEach(function(nm){ var a=states[nm]; if(a.restrained||a.freeHands===0||(a.dropped&&a.dropped.length)) viol=viol.concat(validateOne(nm,a,narr)); });
    return {ok:viol.length===0, violations:viol};
  }

  // ---- authority block (sys injection when constrained chars present) ----
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
    lines.push('プレイヤーの入力は「試行・命令・願望」であり結果ではない。上記の身体状態に反する成功（拘束の自力破壊・使えない手での武器操作や精密投擲・存在しない武器の出現・落とした武器の使用・宙での完全脱出）を成功として描かない。可能な結果（もがく・支点を探す・短い声や合図・部分的な動き・他者による救助）だけを描く。代償は可能な行為を重くするだけで、不可能を可能にしない。');
    return lines.join('\n');
  }
  function repairInstruction(states, violations){
    return '【行動裁定・書き直し】直前の描写は身体状態と矛盾していた（'+violations.join('；')+'）。\n'
      + authorityBlock(states) + '\n'
      + 'これらの人物について身体的に不可能な成功を描かず、実際に可能な結果だけで同じ場面を描き直せ。他の人物や場面の流れ・緊張は保ってよい。';
  }

  // ---- correlation stash: build()でセット → 直後のApi.call(本編生成)だけ検査 ----
  var pending=null;
  function getP(){ try{ return window.Planner||(typeof Planner!=='undefined'?Planner:null); }catch(e){ return null; } }
  function getApi(){ try{ return window.Api||(typeof Api!=='undefined'?Api:null); }catch(e){ return null; } }


  // ---- input normalization: detect impossible-assertion vs constrained char, build attempt-frame ----
  function inputAssertsImpossible(text, states){
    if(!text) return null;
    var verbs=/(引きちぎ|引き千切|振り切|脱出|完全に|一瞬で|貫く|貫いて|精密|正確に[^。]{0,4}(投|突|貫|狙)|両手で[^。]{0,6}(構|投|握)|新たな(武器|短刀|刃)|二本目|無視して|意に介さ|難なく|たやすく)/;
    // v292Dfix333e: 負傷者への精密/全力動作も拾う(負傷ベースの不可能=従来の見逃しを補完)
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

  // ---- C: NPC自律 directive (Phase2.2 第一版・prose) v292Dfix333e ----
  function npcAutonomyOn(){ try{ return localStorage.getItem('v292Dfix333Npc')==='1'; }catch(e){ return false; } }
  function npcAutonomyBlock(states){
    return ['【NPCの自律(局所のみ)】',
      '登場している主人公以外の人物を棒立ち・置物にしない。各自の性格・関係・今の身体状態に応じて、このターンに自然な「局所的な反応や行動を一つ」取らせる(身じろぎ・短い発言・視線・移動・かばう・反撃・後ずさり・すがる・凍りつく等)。ただし各人物の身体状態(上記の正史)に反する行動はさせない。拘束・負傷で不可能な行為は取らせない。',
      'NPCは「今ここ」の反応に徹する。新しい登場人物・新しい場所・場面の外で起きる出来事・時間の飛躍・物語全体を動かす大きな転換を、NPCの行動として勝手に作り出さない(それはプレイヤーと進行の領域)。'
    ].join('\n');
  }

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
        if(targets && mode()==='active'){
          // 不可能命令→入力を試行フレームに差し替えてから build(=生成前正規化。実機実証済の手法)
          r=orig.call(this, bmode, normalizedFrame(text, states, targets));
          try{ console.log(TAG,'input normalized for', targets.join(',')); }catch(_){}
        } else {
          r=orig.apply(this, args);
        }
        if(cc.length){
          if(mode()==='active' && r && typeof r.sys==='string' && r.sys.indexOf('【身体状態・正史')<0){
            r.sys = r.sys + '\n\n' + authorityBlock(states);
          }
          pending={states:states, t:Date.now()};
        } else { pending=null; }
        // C: NPC自律 directive(専用フラグ・拘束/重傷の有無に依らず登場NPCがいれば注入)
        if(mode()==='active' && npcAutonomyOn() && r && typeof r.sys==='string' && r.sys.indexOf('【NPCの自律')<0){
          r.sys = r.sys + '\n\n' + npcAutonomyBlock(states);
        }
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
      var p=pending; pending=null; // consume (only the first call after build)
      var res=await orig(sys,user,maxTok,opts);
      try{
        if(p && !isOff() && p.t && (Date.now()-p.t)<600000 && res && typeof res.text==='string'){
          var check=validateAll(p.states, proseOnly(res.text));
          if(!check.ok){
            try{ console.log(TAG, mode()+' VIOLATION', check.violations); }catch(_){}
            logRing({t:Date.now(), mode:mode(), violations:check.violations});
            if(mode()==='active'){
              var res2=await orig(sys, user+'\n\n'+repairInstruction(p.states, check.violations), maxTok, opts);
              if(res2 && typeof res2.text==='string'){
                var check2=validateAll(p.states, proseOnly(res2.text));
                try{ console.log(TAG,'repaired ->', check2.ok?'PASS':('still '+check2.violations.length)); }catch(_){}
                if(check2.ok) return res2; // 通ったものだけ採用。再違反なら元を返す(無限ループ防止)
              }
            }
          } else { try{ console.log(TAG, mode()+' ok (no violation)'); }catch(_){} }
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

  window.__v292Dfix333api={ compileActorStates:compileActorStates, validateAll:validateAll, authorityBlock:authorityBlock, mode:mode, _pending:function(){return pending;} };
  try{ console.log(TAG,'loaded; mode=',mode()); }catch(e){}
})();
