// =====================================================================
// Chronicle TRPG - v292Dfix335: おまかせ生成エンジン Phase B (Seed Atom Bank接続)
// 背景(おしん+GPT+DeepResearch): 既存 UI.randomFill は小さな固定配列(英雄名10/世界観6…)
//   から引くだけ=「薄い・パターン少なすぎる」の原因。→裏側Seed Atom Bank(218件/9軸)から
//   bag-draw + 反復回避(recency窓/2軸差) + 反クリシェ(禁止組合せ)で毎回違う種を組み、
//   Chronicleの世界/主人公/NPCフィールドへ写す。「無限だけど毎回ちゃんと違う」の実体。
// 研究反映: ランダムはコード側(モデルはmode collapse)/直近回避が無限感の本体/
//   禁止はコード層でAIには渡さない(pink elephant)/ユニークさ予算は主人公・場所・開始事件に集中。
// 動作: fix334の🎲ボタンが window.__v334Omakase() を呼ぶ→本モジュールが種を引いて
//   設定フィールドを埋め、設定を開いてユーザーに見せる(v1は即開始でなくレビュー方式=安全)。
//   ★既定OFF。プレビュー=localStorage v292Dfix335='1'。バンクはfetchでGET(予算不使用)。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix335) return; window.__v292Dfix335 = true;
  var TAG='[v292Dfix335:omakase]';
  function on(){ try{ return localStorage.getItem('v292Dfix335')==='1'; }catch(e){ return false; } }

  var BANK=null, ANTI=null, loading=false;
  function loadBank(cb){
    if(BANK){ cb&&cb(); return; }
    if(loading){ setTimeout(function(){loadBank(cb);},300); return; }
    loading=true;
    var base='';
    Promise.all([
      fetch(base+'seed_atoms.v1.json').then(function(r){return r.json();}),
      fetch(base+'seed_anti_cliche.v1.json').then(function(r){return r.json();}).catch(function(){return null;})
    ]).then(function(res){
      BANK=res[0]; ANTI=res[1]; loading=false;
      try{ console.log(TAG,'bank loaded:',BANK.atoms.length,'atoms'); }catch(_){}
      cb&&cb();
    }).catch(function(e){ loading=false; try{ console.warn(TAG,'bank load failed',e); }catch(_){}; cb&&cb(e); });
  }

  function byAxis(ax){ return BANK.atoms.filter(function(a){return a.axis===ax;}); }

  // --- 二段stratified bag-draw(DeepResearch: RimWorld Cassandra方式) ---
  // カテゴリ(ジャンル)を先に引き、spine軸はそのジャンルへ寄せる(soft p=0.7)。
  // ジャンル別の袋を持ち、使い切ったら再シャッフル。空なら全体袋へフォールバック。
  var GENRES=['mh','df','sf','hd'];
  var SPINE={setting:1,stance:1,mood_tone:1,era_tech:1};
  var bags={};
  function shuffle(a){ for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;} return a; }
  function drawFromBag(ax,genre){
    var key=ax+'|'+(genre||'ALL');
    if(!bags[key] || bags[key].length===0){
      var pool=byAxis(ax);
      if(genre){ pool=pool.filter(function(a){ return (a.genre||[]).indexOf(genre)>=0; }); }
      if(!pool.length){ key=ax+'|ALL'; if(!bags[key]||!bags[key].length) bags[key]=shuffle(byAxis(ax).slice()); }
      else bags[key]=shuffle(pool.slice());
    }
    return bags[key].pop();
  }

  function lastTrace(){ try{ return JSON.parse(localStorage.getItem('v292Dfix335_lastTrace')||'null'); }catch(e){ return null; } }
  function saveTrace(t){ try{ localStorage.setItem('v292Dfix335_lastTrace', JSON.stringify(t)); }catch(e){} }

  // --- 禁止組合せチェック(反クリシェ・コード層) ---
  function violatesBan(pick){
    if(!ANTI||!ANTI.banCombinations) return false;
    var ids=Object.keys(pick).map(function(k){return pick[k]&&pick[k].id;});
    for(var i=0;i<ANTI.banCombinations.length;i++){
      var b=ANTI.banCombinations[i];
      if(b.atoms){ var hit=b.atoms.filter(function(x){return ids.indexOf(x)>=0;}); if(b.maxOfThese){ if(hit.length>b.maxOfThese) return true; } else if(hit.length===b.atoms.length) return true; }
      if(b.axesTogether){ var all=b.axesTogether.every(function(x){return ids.indexOf(x)>=0;}); if(all) return true; }
    }
    return false;
  }

  // --- 2軸差チェック(直近StartPackと最低2軸違える) ---
  function axisDiffOK(pick){
    var last=lastTrace(); if(!last||!last.pickIds) return true;
    var diff=0, axes=Object.keys(pick);
    axes.forEach(function(ax){ if(pick[ax] && last.pickIds[ax] && pick[ax].id!==last.pickIds[ax]) diff++; });
    var min=(ANTI&&ANTI.recentWindow&&ANTI.recentWindow.minAxisDiff)||2;
    return diff>=min;
  }

  function drawStartPack(){
    var axesWanted=['setting','era_tech','stance','lack_desire','relationship','opening_pressure','secret','world_rule','mood_tone'];
    var pick, tries=0, target;
    do{
      target=GENRES[Math.floor(Math.random()*GENRES.length)]; // カテゴリを先に(均等)
      pick={};
      axesWanted.forEach(function(ax){
        var lean = SPINE[ax] && Math.random()<0.7;   // spine軸は70%そのジャンルへ・残りは自由(=productive clashを温存)
        pick[ax]=drawFromBag(ax, lean?target:null);
      });
      pick.npcStance=drawFromBag('stance', Math.random()<0.5?target:null);
      pick.__target=target;
      tries++;
    } while((violatesBan(pick) || !axisDiffOK(pick)) && tries<12);
    // trace保存
    var pickIds={}; Object.keys(pick).forEach(function(k){ pickIds[k]=pick[k]&&pick[k].id; });
    saveTrace({ pickIds:pickIds, at:Date.now() });
    return pick;
  }

  // --- コード側の名前プール(バンクは非識別方針で名を持たないため) ---
  var NAMES=['アオイ','ハルカ','ミナト','シオリ','レイ','ツカサ','ノゾミ','カイ','スミレ','リク',
    'アヤメ','ジン','ユキ','ソウ','ナギ','トワ','クレハ','セナ','ヒロ','マコト',
    'イオリ','サギリ','ルカ','コウ','ナオ','フユ','アサヒ','シンク','ミオ','ハク'];
  var nameBag=[];
  function drawName(){ if(nameBag.length===0){ nameBag=NAMES.slice(); for(var i=nameBag.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=nameBag[i];nameBag[i]=nameBag[j];nameBag[j]=t;} } return nameBag.pop(); }

  var GLABEL={mh:'現代怪異',df:'ダークファンタジー',sf:'SF',hd:'人間ドラマ'};
  function primaryGenre(pick){
    if(pick.__target) return pick.__target;  // 二段stratifiedで選んだカテゴリを世界のジャンルとする(均等化)
    var c={}; ['setting','stance','opening_pressure','secret','mood_tone'].forEach(function(ax){ (pick[ax].genre||[]).forEach(function(g){ c[g]=(c[g]||0)+1; }); });
    var best='mh',bv=0; Object.keys(c).forEach(function(g){ if(c[g]>bv){bv=c[g];best=g;} }); return best;
  }

  // --- StartPack → Chronicleフィールド(lore/loc/obj/tone/hero/npc) ---
  function mapToFields(pick){
    var g=primaryGenre(pick);
    var lore=pick.setting.text+'。'+pick.era_tech.text+'。'+pick.world_rule.text
      +'。ただしこの世界の底には、'+pick.secret.text+'——という隠された理がある。';
    var loc=pick.setting.text;
    var obj=pick.opening_pressure.text+'。'
      +'主人公は'+heroStanceShort(pick.stance)+'として、'+lackShort(pick.lack_desire)+'。';
    var tone=GLABEL[g]+'。'+pick.mood_tone.text+'。心理描写重視・会話多め。';
    var hero={ name:drawName(),
      desc:pick.stance.text+'。'+lackShort(pick.lack_desire)+'。' };
    // NPC: 関係とNPC用stanceから
    var ns=pick.npcStance, d=ns.depth||{};
    var npc={ name:drawName(),
      desc:ns.text+'。主人公とは「'+pick.relationship.text+'」という間柄。',
      personality:moodToTraits(pick.mood_tone),
      coreDesire:d.want||'自分の居場所を守ること',
      coreFear:(d.need? 'ふたたび'+d.wound.replace(/。$/,'').replace(/^.*?、/,'')+'こと':'すべてを失うこと'),
      wound:d.wound||'語られない過去の傷を抱えている。' };
    return { genre:g, lore:lore, loc:loc, obj:obj, tone:tone, hero:hero, npc:npc };
  }
  function heroStanceShort(a){ return a.text.split('。')[0]; }
  function lackShort(a){ return a.text.split('。')[0]; }
  var MOODJP={uneasy:'落ち着かない',foreboding:'不吉な予感を漂わせる',eerie:'どこか無気味な',melancholy:'物憂げな',serene:'穏やかな',suspenseful:'張り詰めた',brutal:'苛烈な',grim:'陰鬱な',hopeful:'かすかな希望を抱く',claustrophobic:'息苦しさをまとう',nostalgic:'懐かしさを帯びた',paranoid:'疑い深い',tender:'優しく脆い',dreamlike:'夢うつつのような',cathartic:'切なさを抱えた',reverent:'畏まった',restless:'焦れた',uncanny:'底知れない'};
  var REGJP={restrained:'言葉少な',tense:'緊張した',understated:'控えめな',lyrical:'詩的な',gentle:'柔らかな',clipped:'短く鋭い',blunt:'ぶっきらぼうな',heavy:'重い',warm:'温かな',tight:'切り詰めた',soft:'穏やかな',jittery:'落ち着かない',intimate:'親密な',hazy:'とりとめのない',bittersweat:'ほろ苦い',bittersweet:'ほろ苦い',solemn:'厳かな',agitated:'苛立った',flat:'平坦な'};
  function moodToTraits(m){ var mo=MOODJP[m.mood]||'独特な'; var re=REGJP[m.register]||'落ち着いた'; return mo+'雰囲気で、'+re+'物言いをする。'; }

  // --- 設定フィールドへ書き込む ---
  function setVal(id,v){ var el=document.getElementById(id); if(el){ el.value=v; try{ el.dispatchEvent(new Event('input',{bubbles:true})); }catch(_){} } }
  function fillFields(f){
    setVal('cfgHName',f.hero.name); setVal('cfgHDesc',f.hero.desc);
    setVal('cfgLore',f.lore); setVal('cfgLoc',f.loc); setVal('cfgObj',f.obj); setVal('cfgTone',f.tone);
    // NPC: 0件なら1件追加して埋める(既存UI.addNpc/_fillNpcRandom流用)
    try{
      var cards=document.querySelectorAll('#npcList .npc-card');
      if(cards.length===0 && typeof UI!=='undefined' && UI.addNpc){
        UI.addNpc();
        setTimeout(function(){ fillNpcCard(f.npc); },60);
      } else if(cards.length){ fillNpcCard(f.npc, cards[0]); }
    }catch(_){}
  }
  function fillNpcCard(npc, card){
    card=card||document.querySelector('#npcList .npc-card'); if(!card) return;
    var set=function(fld,v){ var el=card.querySelector('[data-f="'+fld+'"]'); if(el){ el.value=v; try{el.dispatchEvent(new Event('input',{bubbles:true}));}catch(_){}} };
    set('name',npc.name); set('desc',npc.desc); set('personality',npc.personality);
    set('coreDesire',npc.coreDesire); set('coreFear',npc.coreFear); set('wound',npc.wound);
  }

  // --- 🎲おまかせ本体(fix334ボタンから呼ばれる) ---
  function omakase(){
    loadBank(function(err){
      if(err||!BANK){ try{ UI.setStatus('おまかせ生成: 種データの読込に失敗しました'); }catch(_){}; return; }
      var pick=drawStartPack();
      var f=mapToFields(pick);
      try{ if(typeof UI!=='undefined' && UI.openSettings) UI.openSettings(); }catch(_){}
      setTimeout(function(){ fillFields(f);
        try{ UI.setStatus('🎲 おまかせで世界を用意しました（'+GLABEL[f.genre]+'）。内容を見て「保存してゲーム開始」を押してください'); }catch(_){}
      }, 120);
      try{ console.log(TAG,'omakase drawn:',JSON.stringify(Object.keys(pick).reduce(function(o,k){o[k]=pick[k]&&pick[k].id;return o;},{}))); }catch(_){}
    });
  }
  window.__v334Omakase=function(){ if(!on()){ try{ UI.setStatus('おまかせ生成はプレビュー中です（有効化: v292Dfix335=1）'); }catch(_){}; return; } omakase(); };

  // test/preview api
  window.__v292Dfix335api={ on:on, loadBank:loadBank,
    draw:function(cb){ loadBank(function(){ var p=drawStartPack(); cb&&cb(p, mapToFields(p)); }); },
    lastTrace:lastTrace };
  try{ console.log(TAG,'loaded; omakase:', on()?'on':'off(default)'); }catch(_){}
})();
