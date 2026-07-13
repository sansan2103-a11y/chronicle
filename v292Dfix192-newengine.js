// =====================================================================
// Chronicle TRPG - v292Dfix192: 新プロンプトエンジン（引き算・見本ドリブン）
// ---------------------------------------------------------------------
// 背景（根底診断 2026-06-03）:
//   旧 sys は191パッチの堆積で 9,583字 / 41ブロック / 命令・禁止 約53個。
//   重複・自己矛盾（5つの「最優先」を審判するブロック等）が、指示追従の強い
//   Hermes 4 を「守りの作文」に追い込み、要約口調・メタ漏れ・連続性崩壊・
//   つまらなさを生んでいた。実機A/B（同一セーブ）で、肯定形＋見本2つの
//   約1,500字 sys の方が「前進・連続性維持・破綻なし・タグ整形」で旧を上回った。
//
// 方針:
//   ・禁止の山 → 「良い1ターンの形（肯定形）＋望むregisterの見本」へ置換。
//   ・形式（タグ）は1箇所だけ明記。出力フォーマット(<say>/<react>/<state>)は
//     旧と同一に保つ ＝ parse/会話ログ/キャラ一覧など下流は無改造で動く。
//   ・進行(dramaLevel)・セリフ(dialogueLevel)・続きを書く検知・ライブのキャラ
//     状態(fix77: 傷/関係/未解決)は、この新エンジン自身が sys に注入する
//     （旧はこれらを旧sysブロックに依存していたため、差し替え時に欠落する盲点を塞ぐ）。
//   ・Planner.build を「最外」でラップし、engineMode=1 のときだけ sys を丸ごと
//     差し替える。user 側（cast/直近文脈/逐語反映）はそのまま使う。
//   ・既定は従来(0)。topbar の ⚙エンジン[従来/新β] で切替。
//   ・repo・features.js 本体は無改造。この <script> を外せば完全に元通り（可逆）。
//
// トーン（register）は今は「静」。将来 toneLevel セレクタで見本を差し替え可能に
// する設計（EXAMPLES マップを増やすだけ）。
// =====================================================================
(function(){
  'use strict';
  var TAG = '[v292Dfix192:newengine]';

  function getS(){ try{ return window.S || (0,eval)('S'); }catch(e){ return null; } }

  function lvl(name, def){
    try{ var S=getS(); var v=(S&&S.cfg)?S.cfg[name]:null; return (v==null)?def:(+v); }catch(e){ return def; }
  }

  // engineMode: 0=従来 / 1=新β。S.cfg.engineMode を主、localStorage を保険に。
  function engineOn(){
    try{ var S=getS(); if(S&&S.cfg&&S.cfg.engineMode!=null) return (+S.cfg.engineMode===1); }catch(e){}
    try{ return localStorage.getItem('v292EngineMode')==='1'; }catch(e){}
    return false;
  }
  function setEngine(v){
    try{ var S=getS(); if(S&&S.cfg) S.cfg.engineMode=(+v); }catch(e){}
    try{ localStorage.setItem('v292EngineMode', String(+v)); }catch(e){}
  }

  function pick(l,a,b,c){ return (l<=1)?a : (l>=3)?c : b; }

  // v292Dfix208: 🎭トーン(register)切替。見本ドリブン設計の本領＝ルールでなく見本を差し替える。
  //   'shizuka'(静=静かな緊張)/'dou'(動=疾走と交戦)/'koi'(濃=密度の高い恐怖と痛み)/'kaiwa'(会話劇=掛け合い主導)
  //   保存はS.cfg.toneKey(スロット毎)+localStorage保険。既定=静(従来の挙動そのまま)。
  function toneKey(){
    try{ var S=getS(); if(S&&S.cfg&&S.cfg.toneKey&&EXAMPLES[S.cfg.toneKey]) return String(S.cfg.toneKey); }catch(e){}
    try{ var t=localStorage.getItem('v292Tone'); if(t&&EXAMPLES[t]) return t; }catch(e){}
    return 'shizuka';
  }
  function setTone(k){
    try{ var S=getS(); if(S&&S.cfg){ S.cfg.toneKey=k; if(typeof S.save==='function') S.save(); } }catch(e){}
    try{ localStorage.setItem('v292Tone', k); }catch(e){}
  }

  // v292Dfix211: 📏長さ。既存の v100_outputLen（設定パネルの出力長・max_tokensキャップ
  //   short=900/standard=1600/long=2500 に連動）へ相乗りし、トップバーから切替できるようにする。
  //   long時は本文の文数目安も引き上げ（AIダンジョン参考: 情景を厚く描く長文モード）。
  function lenKey(){
    try{ var v=localStorage.getItem('v100_outputLen'); if(v==='short'||v==='long') return v; }catch(e){}
    return 'standard';
  }
  function setLen(v){ try{ localStorage.setItem('v100_outputLen', v); }catch(e){} }

  // ライブのキャラ状態を fix77 ストアから構造化データとして注入。
  // （旧 sys の【各キャラの現在の状態】＋fix190 永続フィールドの置き換え）
  // v292Dfix223f: 状態値のサニタイズ。fix190等の捕捉で値頭に「<関係:」「<state…」等の
  //   タグ断片が混入することがある(実測: store.kank="<関係: ...")。注入時に除去して
  //   プロンプト汚染と話者/状態の誤読を防ぐ。表示・保存データには触れない読み取り側の浄化。
  function clean223(v){
    try{
      v = String(v==null?'':v);
      v = v.replace(/^[\s　]*<\/?[^>\s:：]{1,12}[:：]?\s*/,''); /* 先頭の<関係: / <state 等の断片 */
      v = v.replace(/[<>]/g,'');                                 /* 残った山括弧 */
      v = v.replace(/\s+/g,' ').trim();
      return v;
    }catch(e){ return String(v==null?'':v); }
  }

  function stateBlock(){
    try{
      var store = window.__v292Dfix77Store; if(!store) return '';
      var lines=[];
      Object.keys(store).forEach(function(n){
        var s=store[n]||{}; if(!s || typeof s!=='object') return;
        var parts=[];
        var ka=clean223(s.karada||s['からだ']), ko=clean223(s.kokoro||s['こころ']), ho=clean223(s.honno||s['本能']);
        var ki=clean223(s.kizu||s['傷']), kn=clean223(s.kankei||s['関係']), mi=clean223(s.mikaiketsu||s['未解決']);
        var mo=clean223(s.mokuteki||s['目的']); /* v292Dfix223b */
        if(ka) parts.push('からだ:'+ka);
        if(ko) parts.push('こころ:'+ko);
        if(ho) parts.push('本能:'+ho);
        if(mo) parts.push('目的:'+mo);
        if(ki) parts.push('傷:'+ki);
        if(kn) parts.push('関係:'+kn);
        if(mi) parts.push('未解決:'+mi);
        if(parts.length) lines.push('・'+n+'｜'+parts.join(' ／ '));
      });
      if(!lines.length) return '';
      return '【各キャラの現在の状態（引き継ぐ。傷/関係/未解決は治療・和解まで保持し勝手に消さない）】\n'+lines.join('\n')
        +'\n・関係・未解決は各キャラが自分から動き、主人公や他キャラに話しかける動機になる。傷・恐怖・対立・依頼の場面では、入力を待たずNPCの側から言葉を発してよい。'
        +'\n・各キャラは自分の「目的」に向かって、入力を待たず自分から動いてよい（目的が衝突するキャラ同士は自然に対立する）。'; /* v292Dfix223b */
    }catch(e){ return ''; }
  }

  // v292Dfix223a: 演出家レイヤー「今ターンの種」。状態ストアから最も張力のある1〜2個を
  //   決定的に選び、「一覧」でなく「焦点」として注入する。ルールを足さずデータを選別する設計。
  //   選別: 直近3ターン以内に動いたキャラ(=在場)の 未解決(3点) > 未治療/中重の傷(2点) > 関係(1点)。
  //   同点はターン数でローテし固着を防ぐ。OFF: localStorage v292SeedOff='1'
  function seedBlock(){
    try{
      if (localStorage.getItem('v292SeedOff')==='1') return '';
      var store = window.__v292Dfix77Store; if(!store) return '';
      var S=getS(); var cur=(S&&S.turns)?S.turns.length:0;
      var cands=[];
      Object.keys(store).forEach(function(n){
        var s=store[n]||{};
        if (cur && s.turn!=null && (cur - s.turn) > 3) return; /* 在場=直近に状態が動いたキャラ */
        var mi=clean223(s.mikaiketsu||s['未解決']), ki=clean223(s.kizu||s['傷']), kn=clean223(s.kankei||s['関係']);
        if (mi) cands.push({n:n, w:3, t:n+'の未解決「'+mi.slice(0,40)+'」が、今ターンの言動の下に流れている'});
        if (ki && /未治療|重|中/.test(ki)) cands.push({n:n, w:2, t:n+'の傷('+ki.slice(0,30)+')が行動を縛り、周囲の目と空気を変える'});
        if (kn) cands.push({n:n, w:1, t:n+'の関係('+kn.slice(0,40)+')が距離感・口調に出る'});
      });
      if(!cands.length) return '';
      cands.sort(function(a,b){ return b.w-a.w; });
      var top=cands.filter(function(c){ return c.w===cands[0].w; });
      var first=top[cur % top.length];
      var rest=cands.filter(function(c){ return c!==first && c.n!==first.n; });
      var second=rest.length?rest[cur % rest.length]:null;
      var lines=['・'+first.t]; if(second) lines.push('・'+second.t);
      return '【この場面の種（説明はせず、言動と展開に滲ませる）】\n'+lines.join('\n');
    }catch(e){ return ''; }
  }

  // v292Dfix223c: 展開スパイス(停滞ブレーカー)。「続き」系入力が2連続した時だけ、
  //   複雑化の種を1個だけ注入して物語を横に動かす。クールダウン4ターン・決定的選択。
  //   OFF: localStorage v292SpiceOff='1'
  var SPICE223 = [
    '遠くで何かが倒れる音がする。偶然ではない',
    '真新しい痕跡（足跡・体温・落とし物）が見つかる',
    '第三者の気配がこの場面に近づいてくる',
    'その場の誰かが、隠していたことを口にしかける',
    '照明・足場・出口など、環境が一段悪化する',
    'どこかで「時間切れ」が近いことを示す変化が起きる',
    '見過ごせない発見物（鍵・手記・写真・道具）が目に入る',
    '仲間の一人の様子が、それまでと明らかに違う'
  ];
  function spiceLine(isCont){
    try{
      if (localStorage.getItem('v292SpiceOff')==='1') return '';
      if (!isCont) return '';
      var S=getS(); if(!S||!Array.isArray(S.turns)||!S.turns.length) return '';
      var pt=String((S.turns[S.turns.length-1]||{}).playerText||'');
      if (!(/続きを(?:自然に)?進めて/.test(pt) || /^続きを書/.test(pt))) return ''; /* 「続き」2連続時のみ */
      var cur=S.turns.length;
      if (S.cfg && S.cfg._spiceT!=null && (cur - S.cfg._spiceT) < 4) return ''; /* クールダウン */
      if (S.cfg) S.cfg._spiceT = cur;
      var pick=SPICE223[cur % SPICE223.length];
      return '【展開の種（この世界観に合う形で自然に織り込む。唐突なご都合にしない）】'+pick;
    }catch(e){ return ''; }
  }

  // v292Dfix223d: 自発の掛け合いミニ見本(トーン共通)。「NPC同士が衝突し、入力を待たず
  //   主人公へ詰め寄る」を見本で示す(見本ドリブン=ルール積み増しをしない)。
  //   OFF: localStorage v292MiniExOff='1'
  var MINI223 = [
    '─ミニ見本（自発の掛け合いの例。短いのは抜粋なので、本文の長さの参考にはしない）─',
    '<say who="相手A">手当てが先よ。歩かせる気？</say>',
    '<say who="相手B">ここに居る方が危ない。……ねえ、あんたが決めて</say>',
    '二人の視線が主人公を挟む。相手Aは布を裂く手を止めない。',
    '<react who="相手A" 反応="返事を待たず止血を続ける" 声="<say who=\'相手A\'>決まるまで、手は止めない</say>"/>'
  ].join('\n');
  function miniEx(){ try{ if(localStorage.getItem('v292MiniExOff')==='1') return ''; }catch(e){} return '\n'+MINI223; }

  // v292Dfix254: NPCアジェンダ(自発性)。状況トリガー+内圧蓄積(おしん設計合意 2026-06-10)。
  //   反応(fix77/react)は受け身の人間味——これは「こちらが何もしなくても自分の目的で動く」深い人間味。
  //   内圧=「本文に登場したのに喋らなかった」連続ターン数。喋ったら0にリセット。
  //   登場しなかったターンは増えない(凍結)——おしん決定: 不在のキャラの思いは溜まらない。
  //   保存しない設計: 毎ビルド時に S.turns(narrative+_convSays)から導出する。
  //   カウンタ永続が不要=fix246スロット分離にも保存スキーマにも触れない(配線リスクゼロ)。
  //   候補=場面内(直近2ターンの本文に登場)かつ内圧2以上。上位2人だけ【自発】を注入(標準ノブ)。
  //   原料=新しい欄は作らない: cast心理欄の欲求(coreDesire)/傷(wound)、無ければfix77の目的/未解決。
  //   どれも無ければそのキャラには注入しない(発明させない)。
  //   OFF: localStorage v292AgendaOff='1'
  /* v292Dfix254b: 登場検出のタグ権威化。実機T9実測=モデルは地の文で「三人」と書き
     名前を出さないことがある(名前スキャン漏れ)。一方<state who>タグは契約上
     「登場した各キャラ」全員分が毎ターン出る(実測4/4)→rawのタグが登場の権威。
     parsePlanを最外ラップし、say/react/stateタグのwho+本文名をplan._v254whoへ収穫
     (planは既存のturn保存に相乗り=新キーなし)。旧ターン(収穫なし)はnarrativeスキャンに
     フォールバック。 */
  function harvest254(raw, names){
    try{
      var found={}, txt=String(raw||'');
      var re=/<(?:say|react|state)\b[^>]*?who="([^"]{1,24})"/g, m;
      while((m=re.exec(txt))){ var w=m[1].trim(); if(names.indexOf(w)>=0) found[w]=1; }
      /* 本文の名前も拾う(タグ漏れ保険)。長い他名を先に潰して部分文字列衝突を防ぐ */
      var body=txt.split(/<react|<state/)[0];
      var sorted=names.slice().sort(function(a,b){ return b.length-a.length; });
      var masked=body;
      sorted.forEach(function(n){ if(masked.indexOf(n)>=0){ found[n]=1; masked=masked.split(n).join('〓'); } });
      return Object.keys(found);
    }catch(e){ return []; }
  }
  function installParse254(){
    try{
      var P=window.Planner||(typeof Planner!=='undefined'?Planner:null);
      if(!P||typeof P.parsePlan!=='function'||P.parsePlan.__v254) return !!(P&&P.parsePlan&&P.parsePlan.__v254);
      var inner=P.parsePlan.bind(P);
      var wrapped=function(rawText, inputType){
        var plan=inner(rawText, inputType);
        try{
          var S=getS();
          var names=(S&&S.cast)?[].concat(S.cast.hero&&S.cast.hero.name?[String(S.cast.hero.name)]:[], (S.cast.npcs||[]).map(function(n){return n&&n.name?String(n.name):'';}).filter(Boolean)):[];
          if(plan&&typeof plan==='object'&&names.length) plan._v254who=harvest254(rawText, names);
        }catch(e){}
        return plan;
      };
      wrapped.__v254=true;
      P.parsePlan=wrapped;
      return true;
    }catch(e){ return false; }
  }
  (function waitP254(){ if(installParse254()) return; setTimeout(waitP254, 400); })();

  function agendaPressures(){
    try{
      var S=getS(); if(!S||!Array.isArray(S.turns)||!S.turns.length) return null;
      var npcs=(S.cast&&Array.isArray(S.cast.npcs))?S.cast.npcs.filter(function(n){return n&&n.name;}):[];
      if(!npcs.length) return null;
      var names=npcs.map(function(n){return String(n.name);});
      /* 部分文字列衝突対策(実キャスト例: リナ⊂カリナ): 判定前に、対象名を含むより長い他名を潰す */
      function narrHas(narr, name){
        if(!narr) return false;
        var t=narr;
        for(var i=0;i<names.length;i++){ var o=names[i]; if(o!==name && o.length>name.length && o.indexOf(name)>=0){ t=t.split(o).join('〓'); } }
        return t.indexOf(name)>=0;
      }
      /* v292Dfix254b: 収穫済みターンはタグ権威(_v254who)・無ければnarrativeフォールバック */
      function appeared(t, name){
        if(!t) return false;
        if(t.plan && Array.isArray(t.plan._v254who)) return t.plan._v254who.indexOf(name)>=0;
        return narrHas(String(t.narrative||''), name);
      }
      var turns=S.turns, out={}, win=turns.slice(-2); /* 在場判定窓=直近2ターン */
      npcs.forEach(function(n){
        var name=String(n.name), p=0;
        for(var i=turns.length-1; i>=0 && i>turns.length-13; i--){
          var t=turns[i]||{};
          var spoke=((t._convSays)||[]).some(function(c){ return c && c.who===name; });
          if(spoke) break; /* 喋った時点で打ち切り=リセット相当 */
          if(appeared(t, name)) p++; /* 登場したのに無言=+1 / 不在=凍結 */
        }
        var present=win.some(function(t){ return appeared(t, name); });
        out[name]={ pressure:p, present:present };
      });
      return out;
    }catch(e){ return null; }
  }
  function agendaBlock(){
    try{
      try{ if(localStorage.getItem('v292AgendaOff')==='1') return ''; }catch(e){}
      var S=getS(); if(!S||!S.cast||!Array.isArray(S.cast.npcs)) return '';
      var pr=agendaPressures(); if(!pr) return '';
      var npcs=S.cast.npcs.filter(function(n){return n&&n.name;});
      var cur=(S.turns||[]).length;
      var st77=window.__v292Dfix77Store||{};
      var cands=[];
      npcs.forEach(function(n,i){
        var info=pr[n.name]; if(!info||!info.present||info.pressure<2) return;
        var s=st77[n.name]||{};
        var desire=clean223(n.coreDesire||'')||clean223(s.mokuteki||s['目的']||'')||clean223(s.mikaiketsu||s['未解決']||'');
        var wound=clean223(n.wound||'')||clean223(s.kizu||s['傷']||'');
        if(!desire&&!wound) return; /* 原料なし=注入しない */
        cands.push({ name:n.name, p:info.pressure, d:desire, w:wound, r:(i+cur)%(npcs.length||1) });
      });
      if(!cands.length) return '';
      cands.sort(function(a,b){ return (b.p-a.p)||(a.r-b.r); }); /* 内圧降順・同点は決定的ローテで固着防止 */
      var lines=cands.slice(0,2).map(function(c){
        var core=c.d?('内心『'+c.d.slice(0,40)+'』を抱え続けている'):('傷('+c.w.slice(0,30)+')が言動の下に燻り続けている');
        var sub=(c.d&&c.w)?('傷('+c.w.slice(0,30)+')もその下に流れている。'):'';
        return '・'+c.name+'は'+core+'。'+sub+'場面がそれに触れた時、または行動の区切り(静かな間)が来たら、'+c.name+'の方から小さな一歩(発言・行動)を起こす。唐突な暴走はしない。';
      });
      return '【自発(黙り続けている人ほど、内側が動いている)】\n'+lines.join('\n');
    }catch(e){ return ''; }
  }

  // register 見本（静）。将来 toneLevel で差し替え可能にするためマップ化。
  /* v292Dfix287: 🎭サスペンス時に注入する「緊張の4本柱」。OFF=localStorage v292SuspenseOff='1'。
     おしんFB(恐怖の接近/キャラの危機/謎/たまの突発)を設計化。突発は理不尽な即死を避け対処余地を残す。 */
  var SUSPENSE_BLOCK = [
    '【この物語は緊迫（サスペンス）で進める】',
    '・脅威や危険を物語に常駐させ、五感（音・気配・におい・温度・視界の端）で段階的に近づける。安全な場所や安心を少しずつ侵食し、緊張を緩ませきらない。',
    '・行動・探索・会話のたびに、手掛かり・違和感・新事実を最低1つ開示する。ただし全ては明かさず、新たな疑問を必ず一つ残す（謎を前進させつつ深める）。',
    '・緊張は登場キャラの傷・恐怖・大切なものを刺激する。大事なキャラが危険にさらされうる切迫を、説明でなく心理と身体反応で描く。',
    '・場面が弛緩したと感じたら、入力を待たず予期せぬ異変・接近・物音・襲撃を起こしてよい。ただし理不尽な即死や逃げ場のない展開は避け、必ずプレイヤーが対処・反応できる余地を残す。',
    '・緊張は、状態や数値の機械的な実況ではなく、五感と情感のある自然な地の文で描く（観測者やシステムのような無機質な語りにしない）。' /* v292Dfix289 */
  ].join('\n');

  var EXAMPLES = {
    'shizuka': [
      '【書き方の見本（構造と密度の参考。内容はコピーせず、今の場面に合わせて作る。見本の雰囲気が今の物語のジャンルと違っても、ジャンルは今の物語に従う）】',
      '─見本A（静かな緊張）─',
      '埃の匂いが鼻をついた。主人公は懐中電灯を握り直し、半開きの扉を肩で押す。蝶番が低く軋み、光の輪が床に散らばった紙束を撫でた。相手がその一枚を拾い、眉を寄せる。',
      '<say who="相手">これ……日付、今日になってる。誰かついさっきまでここに</say>',
      '主人公の首筋が、ひやりと粟立った。',
      '<react who="相手" 反応="紙を持つ指がこわばり、声を落とす" 声="<say who=\'相手\'>……戻った方がいいかも</say>"/>',
      '<state who="主人公" からだ="緊張・息を潜める" こころ="警戒" 本能="音の出所を探る"/>',
      '',
      '─見本B（静かな場面から一歩踏み込む）─',
      '主人公は紙束を床に戻し、奥の廊下へ一歩踏み出した。相手の手が、とっさに袖を掴む。指先が、かすかに震えていた。',
      '<say who="相手">……一人で行かないで</say>',
      '天井の隅で、何かが乾いた音を立てて動いた。',
      '<react who="主人公" 反応="足を止め、音のした方へ視線を上げる" 声=""/>',
      '<react who="相手" 反応="袖を掴む手に力がこもる" 声="<say who=\'相手\'>今の、聞こえた?</say>"/>',
      '<state who="主人公" からだ="足を止める・緊張" こころ="警戒と気遣い" 本能="相手を背に庇う"/>',
      '<state who="相手" からだ="主人公の袖を掴む" こころ="不安" 本能="離れたくない"/>'
    ].join('\n'),

    // v292Dfix208: 動＝短文・速い動詞・身体の連続。逃走/交戦の体感速度を見本で示す。
    'dou': [
      '【書き方の見本（構造と密度の参考。内容はコピーせず、今の場面に合わせて作る。見本の雰囲気が今の物語のジャンルと違っても、ジャンルは今の物語に従う）】',
      '─見本A（動・追走）─',
      '床板が爆ぜた。主人公は肩から扉に突っ込み、蝶番ごと廊下へ転がり出る。背後で何かが壁を蹴った。近い。埃が喉に刺さる。',
      '<say who="相手">こっち！ 階段、まだ生きてる！</say>',
      '主人公は手すりを掴み、二段飛ばしで落ちるように駆け下りた。頭上で天井板が割れ、白い破片が降る。',
      '<react who="相手" 反応="腕を掴んで引き寄せ、息を切らす" 声="<say who=\'相手\'>止まらないで</say>"/>',
      '<state who="主人公" からだ="全力疾走・肺が焼ける" こころ="恐怖を加速に変える" 本能="出口へ"/>',
      '',
      '─見本B（動・交戦の一瞬）─',
      '影が跳んだ。主人公は咄嗟に身を捻る。爪が頬を掠め、熱い線が走った。横から相手が椅子を叩きつけ、木片が散る。',
      '<say who="相手">下がって！</say>',
      '怯んだ影に向かって、主人公は床のランプを蹴り飛ばした。油が爆ぜ、炎の幕が廊下を裂く。',
      '<react who="相手" 反応="返り血を拭いもせず次の一手を探す" 声=""/>',
      '<state who="主人公" からだ="頬に裂傷・浅い" こころ="戦闘の集中" 本能="距離を取る" 傷="右頬裂傷(軽)/影の爪/未治療"/>'
    ].join('\n'),

    // v292Dfix208: 濃＝匂い・湿度・痛みの帰結まで描く密度。グロは強度でなく解像度で。
    'koi': [
      '【書き方の見本（構造と密度の参考。内容はコピーせず、今の場面に合わせて作る。見本の雰囲気が今の物語のジャンルと違っても、ジャンルは今の物語に従う）】',
      '─見本A（濃・密度の高い恐怖）─',
      '匂いが先に来た。鉄と、甘く腐った果実のような何か。主人公の舌の奥が反射的に締まり、唾を飲む音が頭蓋に響く。光の輪の中、床の染みはまだ濡れていて、指で触れた相手の手首が小さく跳ねた。',
      '<say who="相手">……これ、乾いてない。まだ近くにいる</say>',
      '言葉の最後が掠れて消える。彼女の呼吸は浅く、速い。肩越しに感じる体温だけが、この廊下で唯一の生きている証拠だった。',
      '<react who="相手" 反応="染みから目を離せないまま、主人公の袖を強く握る" 声="<say who=\'相手\'>ねえ、戻ろう。お願い</say>"/>',
      '<state who="相手" からだ="浅く速い呼吸・指先が冷たい" こころ="恐怖が限界に近い" 本能="逃げたい" 未解決="進みたい主人公への負い目"/>',
      '',
      '─見本B（濃・痛みの帰結）─',
      '傷は嘘をつかない。相手が一歩踏み出すたび、脇腹の布に黒い染みが広がり、その縁が体温で湿って光る。歯の隙間から漏れる息が、規則正しい呼吸を装おうとして失敗していた。',
      '<say who="相手">平気。……平気だってば</say>',
      '強がりの語尾が震える。主人公は何も言わず、相手の腕を自分の肩に回した。布越しに伝わる鼓動は速すぎた。',
      '<react who="相手" 反応="一瞬こわばり、それから体重を預ける" 声="<say who=\'相手\'>……ごめん</say>"/>',
      '<state who="相手" からだ="足取り不安定・体重を預ける" こころ="強がりと安堵の混在" 本能="倒れたくない" 傷="脇腹刺傷(中)/継続・未治療"/>'
    ].join('\n'),

    // v292Dfix208: 会話劇＝セリフが物語を運ぶ。地の文は最小限の間と視線だけ。
    'kaiwa': [
      '【書き方の見本（構造と密度の参考。内容はコピーせず、今の場面に合わせて作る。見本の雰囲気が今の物語のジャンルと違っても、ジャンルは今の物語に従う）】',
      '─見本A（会話劇・対立と本音）─',
      'ランプを挟んで、二人の影が壁で向かい合っていた。',
      '<say who="相手">さっきの、わざとでしょ。なんで先に行ったの</say>',
      '<say who="主人公">あの場で止まる方が危なかった</say>',
      '<say who="相手">そういうことじゃない。……置いていかれるのは、もう嫌なの</say>',
      '視線が一瞬だけ交わり、相手が先に逸らす。ランプの炎が二人の間で揺れた。',
      '<say who="主人公">次は言う。約束する</say>',
      '<react who="相手" 反応="まだ納得しきれない顔のまま、小さく頷く" 声="<say who=\'相手\'>……約束だから</say>"/>',
      '<state who="相手" こころ="怒りより不安が勝つ" 関係="主人公:信じたいが怖い" 未解決="置き去りの記憶"/>',
      '',
      '─見本B（会話劇・三人の温度差）─',
      '<say who="相手A">地図はもう当てにならない。東棟は崩れてる</say>',
      '<say who="相手B">じゃあ戻る？ 戻れるって保証もないけど</say>',
      '<say who="相手A">……あんたはどう思うの</say>',
      '二人の視線が主人公に集まる。埃の匂いの中で、どちらの言い分にも理があった。',
      '<react who="相手B" 反応="軽口の形を借りて不安を隠す" 声="<say who=\'相手B\'>多数決でもする？</say>"/>',
      '<state who="相手A" こころ="苛立ちの下に疲労" 関係="相手B:軽さに救われてもいる"/>'
    ].join('\n'),

    // v292Dfix287: サスペンス＝静かな緊張＋脅威の接近＋謎の小出し。恐怖は段階で。
    'suspense': [
      '【書き方の見本（構造と密度の参考。内容はコピーせず、今の場面に合わせて作る。見本の雰囲気が今の物語のジャンルと違っても、ジャンルは今の物語に従う）】',
      '─見本A（サスペンス・脅威の接近と謎）─',
      '音が、さっきより近い。床板のきしみが一定の間隔で鳴る。歩幅のようだ。闇の奥から寄ってくる。主人公は息を殺し、壁の冷たさに背中を貼りつけた。',
      '埃の積もった棚に、真新しい指の跡が一本。ここに、つい先刻まで誰かがいた。',
      '<say who="相手">……今の、聞こえた？</say>',
      '相手の声が、語尾でほどけて消える。答える前に、廊下の電球が一度だけ瞬いた。',
      '<react who="相手" 反応="指の跡から目を離せず、主人公の袖を掴む" 声="<say who=\'相手\'>動かないで</say>"/>',
      '<state who="相手" からだ="浅い呼吸・指先が冷たい" こころ="恐怖と好奇心の綱引き" 本能="確かめたいが逃げたい" 未解決="指の跡の主は誰か"/>',
      '',
      '─見本B（サスペンス・弛緩を破る突発）─',
      'ようやく開けた部屋は、不自然なほど静かだった。窓から差す光に埃が漂い、ここだけ時間が止まったように見える。張りつめていた肩から、わずかに力が抜けた。その瞬間。',
      '背後で、何かが床に落ちる乾いた音。振り返ると、さっきまで閉じていたはずの引き出しが、半分だけ開いていた。',
      '<say who="相手">私、触ってない。……ほんとに、触ってない</say>',
      '声が震えている。安全だと思った場所が、もう安全ではないと、二人とも気づいてしまった。',
      '<react who="相手" 反応="半歩あとずさり、主人公の方へ寄る" 声="<say who=\'相手\'>ここ、出よう</say>"/>',
      '<state who="相手" からだ="こわばり・後退" こころ="安堵が崩れた動揺" 本能="この部屋から離れたい"/>'
    ].join('\n')
  };

  // v292Dfix249: 📏長さ=長文のときだけ差し替えるフル尺見本。
  //   実測(fix224)で「指示だけでは長くならない(13〜15文で自走停止)」と確認済み——
  //   モデルは見本の長さを手本にするので、長さは見本で引っ張る(見本ドリブンの原則)。
  //   構造はおしん提供の参考文の分析(参考_長文見本の文体分析_2026-06-10.md)から:
  //   ズームイン/恐怖等の感情は段階で降りる/異物は一度人間側に引き寄せる/
  //   役割分担/文の長短の波/締めの断ち切り。
  //   まず「濃」のみ。他トーンは標準見本にフォールバック(A/B確認後に拡張)。
  var EXAMPLES_LONG = {
    'koi': [
      '【書き方の見本（構造と密度と「長さ」の参考。内容はコピーせず、今の場面に合わせて作る。見本の雰囲気が今の物語のジャンルと違っても、ジャンルは今の物語に従う。長文モードでは、この見本くらいの厚みで一つの場面を層にして描く）】',
      '─見本（長文・濃：場面を急がず、情景→身体感覚→感情→行動の層で厚く）─',
      '廊下は静かだった。静かすぎると、耳は自分の鼓動を拾い始める。主人公の靴底が砂を噛むたび、その小さな音が壁に吸われて消えた。',
      '先に来たのは匂いだった。鉄錆と、雨に濡れた段ボールのような饐えた甘さ。喉の奥が勝手に締まり、主人公は口で呼吸しようとして、かえって舌の上にその味を乗せてしまった。',
      '<say who="相手">……ねえ、明かり、少しだけ下げて</say>',
      '相手の声は囁きなのに、廊下の長さを測れるほど響いた。懐中電灯の輪を床へ落とすと、暗がりが一斉に天井へ立ち上がる。',
      '光の縁で、何かが動いた気がした。主人公は光を振り戻す。古い掲示板、剥がれかけた紙、留め具の影。なんでもない。なんでもないはずなのに、紙の揺れがいま止まったように見えた。',
      '<say who="主人公">風……じゃないな。窓は全部閉まってる</say>',
      '<say who="相手">うん。さっき確かめた</say>',
      '相手はそれだけ言って、主人公の袖を二本の指で摘んだ。子供みたいな掴み方だった。振り払えば外れる。でも振り払えない重さがあった。',
      '突き当たりの扉は半開きで、隙間の闇は廊下のどの影より一段濃かった。近づくほど、空気が冷たいのではなく「厚く」なる。皮膚が先に気づいて、二の腕が粟立った。',
      '<say who="相手">入るの？　……入るんだよね、あなたは</say>',
      '諦めと信頼が半分ずつ混ざった声だった。主人公は答える代わりに、扉の縁へ手をかけた。木は湿って柔らかく、指が沈む感触に一瞬吐き気がした。',
      '扉が開く。蝶番は鳴らなかった。それがいちばん嫌だった。',
      '中の闇は、懐中電灯の輪を呑んでなお余った。そして部屋の奥で、衣擦れの音が、こちらの動きと半拍ずれて止まった。',
      '<say who="相手">いまの、私たちじゃない</say>',
      '<react who="相手" 反応="袖を摘んだ指が、布ごと握り込む" 声="<say who=\'相手\'>お願い、離れないで</say>"/>',
      '<state who="主人公" からだ="二の腕が粟立つ・扉の縁に手" こころ="恐怖と引き返せなさ" 本能="音の正体を見るまで動けない" 目的="部屋の奥を確かめる"/>',
      '<state who="相手" からだ="主人公の袖を握る・呼吸が浅い" こころ="恐怖が限界に近いが置いていかれる方が怖い" 本能="離れたくない" 関係="主人公:縋る" 未解決="進ませてしまった負い目"/>'
    ].join('\n'),

    // v292Dfix251: 静/動/会話劇の長文見本(濃と同じ構造設計で各トーンの質感に変換)
    'shizuka': [
      '【書き方の見本（構造と密度と「長さ」の参考。内容はコピーせず、今の場面に合わせて作る。見本の雰囲気が今の物語のジャンルと違っても、ジャンルは今の物語に従う。長文モードでは、この見本くらいの厚みで一つの場面を層にして描く）】',
      '─見本（長文・静：穏やかな場面ほど、音と間で層を作る）─',
      '雨が、屋根を叩いている。一定のリズムが部屋の輪郭を柔らかくして、ランプの灯だけが二人ぶんの影を壁に伸ばしていた。',
      '主人公は毛布の端を直しながら、向かいに座る相手の手元を見るともなく見ていた。相手は欠けたカップを両手で包み、湯気に顔を寄せている。冷えた指先を温めているのか、それとも顔を隠しているのか、どちらとも取れた。',
      '<say who="相手">……ねえ。さっきの話だけど</say>',
      '声は湯気と同じ温度をしていた。主人公が顔を上げると、相手は視線をカップの中に落としたまま続けた。',
      '<say who="相手">私、あなたが思ってるほど、強くないよ</say>',
      '雨音が、その言葉の後ろを埋めた。主人公は急いで返事をしなかった。この沈黙は気まずさではなく、言葉を選ぶための時間だと、もう二人とも知っている。',
      '窓の外で、何かが水たまりを踏んだ。規則正しい雨音の中で、その一歩分の音だけが異質だった。相手の肩がわずかに強張り、カップの湯気が揺れる。',
      '<say who="主人公">大丈夫。風だ……たぶん</say>',
      '<say who="相手">たぶん、って</say>',
      '相手は小さく笑った。笑いながら、カップを置く手は音を立てなかった。耳はまだ、窓の外に向いている。',
      '主人公はランプの芯を少しだけ下げた。部屋が一段暗くなり、代わりに窓の外の輪郭が見えるようになる。雨。揺れる木。動くものは、ない。',
      '<say who="相手">……ここを出たら、最初に何がしたい？</say>',
      '唐突な問いだった。けれどそれが「今は怖い」の言い換えだと分かるくらいには、主人公は相手の癖を覚え始めていた。',
      '<say who="主人公">温かい飯。湯気で顔が見えなくなるくらいの</say>',
      '相手が今度こそ声を出して笑った。その音に重なって、窓の外の音が、もう一歩分だけ近づいた。',
      '<react who="相手" 反応="笑いの形のまま、目だけが窓へ滑る" 声="<say who=\'相手\'>……今の、聞こえたよね</say>"/>',
      '<state who="主人公" からだ="ランプの芯に手・聴覚を窓へ" こころ="穏やかさの下の警戒" 本能="相手を安心させたい" 目的="音の正体の見極め"/>',
      '<state who="相手" からだ="カップを置いた姿勢のまま静止" こころ="和らぎかけた緊張が戻る" 本能="耳を澄ます" 関係="主人公:軽口を許せる相手" 未解決="さっきの話の続き"/>'
    ].join('\n'),

    'dou': [
      '【書き方の見本（構造と密度と「長さ」の参考。内容はコピーせず、今の場面に合わせて作る。見本の雰囲気が今の物語のジャンルと違っても、ジャンルは今の物語に従う。長文モードでは、この見本くらいの厚みで一つの場面を層にして描く）】',
      '─見本（長文・動：疾走の波。走る、息継ぎ、また走る。で長さを作る）─',
      '最初の一撃は、音より先に来た。',
      '壁が内側へ膨らみ、木片が頬を掠める。主人公は考えるより先に床を蹴っていた。視界の端で、相手が机を盾に転がり込むのが見える。',
      '<say who="相手">窓は駄目！　囲まれてる！</say>',
      '廊下。走りながら主人公は数える。出口まで、角を二つ。背後で床板の爆ぜる音が一定の間隔で近づいてくる。一歩ごとに、間隔が短くなる。',
      '肺が焼ける。それでも足は止めない。止まった瞬間に終わることだけは、体が理解していた。',
      '一つ目の角。曲がった先で、相手が棚に肩からぶつかり、雪崩れた本が追手の足元へ散らばる。時間にして二秒。その二秒が命綱だった。',
      '<say who="主人公">階段はどっちだ！</say>',
      '<say who="相手">右！　……違う、左！　右は崩れてた！</say>',
      '迷いの半瞬で、背後の気配が距離を詰めた。首筋の産毛が逆立つ。主人公は左へ体を投げ、勢いのまま階段を三段飛ばしで落ちていく。着地で膝が悲鳴を上げたが、痛みの仕分けは後だ。',
      '踊り場の窓から差す月光を、影が一瞬で横切った。頭上。天井裏を、並走している。',
      '<say who="相手">下まで保たない……！　どこかで撒かないと！</say>',
      '相手の声はもう悲鳴に近い。それでも足は動いている。主人公は走りながら手当たり次第に扉を確かめる。一つ目、施錠。二つ目、施錠。三つ目、開いた。',
      '二人で滑り込み、内側から閂を落とす。一拍遅れて、扉が外から一度だけ、試すように叩かれた。',
      'それきり、音が消えた。消えたことが、いちばん怖かった。',
      '<react who="相手" 反応="壁に背を貼り付け、口を両手で塞いで呼吸を殺す" 声=""/>',
      '<state who="主人公" からだ="膝に鈍痛・全身汗・呼吸を整え中" こころ="逃げ切れていない確信" 本能="次の経路を探す" 傷="左膝打撲(軽)/着地/未処置" 目的="音を立てずに出口を見つける"/>',
      '<state who="相手" からだ="呼吸を殺している・脚が震える" こころ="恐慌の一歩手前" 本能="動きたくない" 関係="主人公:命綱" 未解決="撒けたのかの不安"/>'
    ].join('\n'),

    'kaiwa': [
      '【書き方の見本（構造と密度と「長さ」の参考。内容はコピーせず、今の場面に合わせて作る。見本の雰囲気が今の物語のジャンルと違っても、ジャンルは今の物語に従う。長文モードでは、この見本くらいの厚みで一つの場面を層にして描く）】',
      '─見本（長文・会話劇：セリフが物語を運び、地の文は間と視線だけ。それでも関係が一段動くまで描く）─',
      '焚き火が爆ぜて、火の粉が三人の沈黙の真ん中に落ちた。',
      '<say who="相手A">……で、いつ言うつもりだったの</say>',
      '<say who="相手B">何の話</say>',
      '<say who="相手A">荷物。減ってる。あんたの分だけ、綺麗にね</say>',
      '相手Bの手が、薪をくべる途中で止まった。一瞬だけ。それから何事もなかったように炎の奥へ薪を押し込む。',
      '<say who="相手B">……明日の朝、言うつもりだった</say>',
      '<say who="相手A">出ていくって？</say>',
      '<say who="相手B">そう</say>',
      '炎の音だけが続いた。相手Aは笑った。怒っているときの笑い方だった。',
      '<say who="相手A">いいよ別に。最初からそういう約束だし。ただ、黙って消えるのだけは、なし。それだけは、なしだよ</say>',
      '語気の最後が揺れた。相手Bは炎から目を上げ、初めて主人公の方を見た。裁定を求める目ではなかった。ただ、聞いていてほしい目だった。',
      '<say who="相手B">……俺が居ると、あんたたちまで狙われる。それでも？</say>',
      '<say who="主人公">それを決めるのは、こっちだ</say>',
      '短い沈黙。相手Aが、握っていた小枝をようやく火に放った。',
      '<say who="相手A">……ほら。二対一</say>',
      '<say who="相手B">多数決かよ。……夜明けまでには決める。ちゃんと、言ってから決める</say>',
      'それは約束というより、降参に近い声だった。焚き火がもう一度爆ぜて、三人の影が同じ方向に揺れた。',
      '<react who="相手A" 反応="それ以上は追わず、毛布を相手Bの側へ一枚押しやる" 声="<say who=\'相手A\'>冷えるよ、今夜</say>"/>',
      '<state who="相手A" こころ="怒りの下の安堵" 関係="相手B:見捨てられない/主人公:同盟" 未解決="相手Bの事情の中身"/>',
      '<state who="相手B" からだ="毛布に手を伸ばしかけて止まる" こころ="負い目と居場所への未練" 本能="留まりたい" 関係="主人公:借りができた" 未解決="夜明けの決断"/>'
    ].join('\n')
  };
  function pickExamples(){
    try {
      if (lenKey()==='long' && EXAMPLES_LONG[toneKey()]) return EXAMPLES_LONG[toneKey()];
    } catch(e){}
    return EXAMPLES[toneKey()] || EXAMPLES['shizuka'];
  }

  function buildSys(mode, text){
    var d = lvl('dramaLevel', 2);
    var dlg = lvl('dialogueLevel', 1);
    var t = String(text||'');
    var isCont = /続きを(?:自然に)?進めて/.test(t) || /^続きを書/.test(t);

    // v292Dfix194: プレイヤー入力の帰属を明示。SAY/DO は主人公の発話/行動であり、
    //   本文で他キャラに言わせ・させてはならない（話者の取り違えを根治）。
    var heroName = '';
    try{ var _S=getS(); heroName=(_S&&_S.cast&&_S.cast.hero&&_S.cast.hero.name)||''; }catch(e){}
    var m = String(mode||'').toUpperCase();
    var inText = t.slice(0,80);
    var hero = heroName ? ('〈'+heroName+'〉') : '主人公';
    var inputLine = '';
    if (m==='SAY' && inText){
      inputLine = '【プレイヤー入力＝主人公の発話】主人公'+hero+'が「'+inText+'」と発話した。これは主人公の台詞。主人公が口にしたものとして本文に書き、絶対に他のキャラの発言・声にしない。';
    } else if (m==='DO' && inText){
      inputLine = '【プレイヤー入力＝主人公の行動】主人公'+hero+'が「'+inText+'」という行動をとった。主人公の行動として本文に反映し、他キャラの行動にしない。';
    } else if (m==='STORY' && inText && !isCont){
      inputLine = '【プレイヤー入力＝場面の方向づけ】プレイヤーが「'+inText+'」と場面を方向づけた。その方向で場面を進める。';
    }

    var dramaLine = pick(d,
      '今回の進行＝弱め：新しい要素は1つだけ、控えめに小さく。一気に飛ばさず半歩〜一歩進める。',
      '今回の進行＝標準：新しい要素を1つ持ち込み、状況を一段階はっきり進める。',
      '今回の進行＝強め：新しい要素を2つ以上持ち込み、複数の展開を一気に動かして大胆に転がす。');
    var dlgLine = pick(dlg + 1, /* v292Dfix380: off-by-one fix. dialogueLevel is 0/1/2 (fix113 UI) but pick() expects 1-3 -> UI "hyoujun" was sent as hikaeme for a month */
      'セリフ＝控えめ：会話は最小限、地の文中心。',
      'セリフ＝標準：要所でキャラを喋らせる。',
      'セリフ＝濃いめ：キャラ同士の掛け合いを増やし、会話で関係や次の行動を見せる。');
    var contLine = isCont
      ? '（プレイヤーは「続きを書く」を押した。あなたが物語を一歩進める番。受け身で待たず、上の進行レベルに従って能動的に動かす。グロや痛みの強度を上げるだけ＝"縦"は前進ではない。新しい要素＝"横"で世界を広げる。）'
      : '';
    var st = stateBlock();
    var seed = seedBlock();          /* v292Dfix223a */
    var spice = spiceLine(isCont);   /* v292Dfix223c */
    var agenda = agendaBlock();      /* v292Dfix254 */
    var suspense = '';               /* v292Dfix287 */
    try { if (toneKey() === 'suspense' && localStorage.getItem('v292SuspenseOff') !== '1') suspense = SUSPENSE_BLOCK; } catch(e){}
    var reform293 = '';              /* v292Dfix293: 自己模倣カット(劣化スパイラル予防) */
    try {
      if (localStorage.getItem('v292SelfMimicOff') !== '1' && window.__v292Health && typeof window.__v292Health.scoreText === 'function'){
        var _S293 = getS();
        if (_S293 && Array.isArray(_S293.turns) && _S293.turns.length){
          var _pt293 = _S293.turns[_S293.turns.length - 1] || {};
          var _pn293 = (_pt293.narrative || (_pt293.plan && _pt293.plan.narrative) || []);
          if (Array.isArray(_pn293)) _pn293 = _pn293.join('\n');
          var _sc293 = window.__v292Health.scoreText(_pn293);
          if (_sc293.level === 'danger' || _sc293.level === 'warn'){
            reform293 = '【文体の立て直し（最優先）】直前のあなたの出力は文体が硬くなりかけている（句読点が少ない／状態や数値を機械的に実況する調子／同じ語の繰り返し）。今回は必ず、句読点を適切に打った自然な小説の地の文に戻す。状態や数値を羅列せず、情景・身体の感覚・感情を通して描く。直前の硬い言い回しや無機質な調子を真似しない。';
          }
        }
      }
    } catch(e){}

    var blocks = [
      '＜あなたの役割＞',
      /* v292Dfix236: ジャンル固定の撤廃(おしん要望)。ジャンルはシーン設定とプレイヤーの入力が決める。
         エンジンが守るのは整合だけ=「破綻しない自由さ」。 */
      'あなたは一人称視点の物語TRPGの語り手です。ジャンルは固定されていない。シーン設定の雰囲気と、プレイヤーの入力が向かう方向(ホラー・日常・冒険・恋愛・コメディ、その混在)に寄り添って描く。プレイヤーの行動や入力を「物語の種」として受け取り、それを膨らませて場面を一つ前へ進めます。プレイヤーは善にも悪にもなれます。物語を裁かず、世界を生きたものとして描いてください。',
      'プレイヤーの種が今の場面の現実と食い違っても拒まない。世界の方が動いた・変わったものとして受け入れ、これまでの物語と矛盾なく繋がる理屈を見つけて描く。自由は受け入れる、整合はあなたが守る。'
    ];
    if (inputLine){ blocks.push(''); blocks.push(inputLine); }
    blocks = blocks.concat([
      '',
      '【良い1ターンの形】',
      '1. 直前の場面（場所・各キャラの状態・感情・位置）を引き継いで書き出す。前の文をそのまま繰り返さない。',
      '2. 新しい要素を持ち込んで状況を前へ動かす（出来事・発見・移動・人物の行動・関係の変化など）。同じ場面の描き直しで終えない。',
      '   ' + dramaLine,
      '3. 五感のある地の文で描く。視覚以外（音・匂い・触感・体感）を毎ターン最低1つ。痛みや恐怖は、まず体が反応してから言葉になる。型に嵌めず、その人物・その状況に固有の反応を書く。',
      '4. その場にいるキャラは生きている。目的・感情・関係に沿って自分から喋り、時に互いに衝突・協力する。キャラの本音・打ち明け・関係の動き・情報の開示は、地の文で説明するより、キャラ自身のセリフで語らせることを優先する（地の文は情景・動作・間に徹し、心理と物語の前進はセリフに乗せる）。主人公しかいない場面では、独白・つぶやき・心の声で内面を見せてよい。' + dlgLine, /* v292Dfix259b: おしん好み=セリフ口調優先 */
      (lenKey()==='long'
        ? '本文は地の文と「」セリフで、10〜16文。一つの場面を急がず、情景→身体感覚→感情→行動の順に層を重ねて厚く描く。段落を分けてよい。ただし同じ内容の言い換え・繰り返しで水増ししない。' /* v292Dfix224: 実測(13-15文で自走停止・指示で動かず)に合わせ目標をモデルの得意域へ。守れない指示は他の指示の威信も下げる */
        : lenKey()==='short'
          ? '本文は地の文と「」セリフで、3〜6文程度に絞って書き切る。'
          : '本文は地の文と「」セリフで、5〜10文程度を目安に書き切る。') + contLine
    ]);
    if (st){ blocks.push(''); blocks.push(st); }
    if (seed){ blocks.push(''); blocks.push(seed); }     /* v292Dfix223a */
    if (spice){ blocks.push(''); blocks.push(spice); }   /* v292Dfix223c */
    if (agenda){ blocks.push(''); blocks.push(agenda); } /* v292Dfix254 */
    if (suspense){ blocks.push(''); blocks.push(suspense); } /* v292Dfix287 */
    if (reform293){ blocks.push(''); blocks.push(reform293); } /* v292Dfix293: 直前が劣化した時だけ文体立て直しを最優先注入 */
    blocks = blocks.concat([
      '',
      '【出力の形式（これだけは形式として守る）】',
      '本文を書き切ったあと、登場した各キャラについて次の2種のタグを本文の後ろに置く（本文より前や本文の途中に置かない）：',
      '<react who="名前" 反応="身体反応＋感情を1文で短く" 声="口から漏れた【短い】反応の声だけ＝息・相槌・短い一言（例:「……うん」「っ」）。無ければ空。長い発言・打ち明け話・説明はここに入れず、必ず本文の<say>に書く"/>', /* v292Dfix259: react声に長台詞を入れると会話ログに出るが本文(展開)に出ず不一致になる実測→声は短い反応専用に */
      '<state who="名前" からだ="今この瞬間の身体" こころ="今の感情" 本能="体が今したいこと" 目的="今この場面で本人が望む小さなこと" 傷="負傷した瞬間だけ記入・治るまで保持" 関係="主人公や他者への今の関係" 未解決="抱えた感情の負債"/>',
      '・登場キャラが声に出すセリフは【必ず】<say who="名前">…</say> で囲む（who は実際に喋った本人の名前）。地の文に裸の「」だけのセリフを置かず、誰の声か必ず明示する。主人公が話しかけたら、相手のキャラはその場で <say who="名前"> で返事する。同じセリフを地の文の「」とsayタグとで二重に書かない（各セリフは本文中で一度だけ、sayタグで書く）。感情が爆発する叫び・呼びかけ（例:「娘っ！！」）も例外なく<say>タグで書き、地の文に直接書かない。',
      '・名前の無い存在（妖怪・怪異・敵・謎の声など）が喋った時も同じ。地の文に埋め込まず、本文で使っている呼び名で <say who="妖怪">お前も同族だ</say> のように必ずタグで囲む。文の途中のセリフ（〜と告げた、〜と言い残した等）もタグにする。逆に、セリフでない「」（回想・呼び名・看板の文字・比喩の引用）はタグで囲まない。',
      '・傷/関係/未解決は中身がある時だけ書く（空なら省く）。一度書いた傷は治療されるまで毎ターン保持する。',
      '・「からだ」は今この瞬間の様子（毎ターン変わる）、傷/関係/未解決は消えない記録。混同しない。',
      '',
      /* v292Dfix227: 旧fix105/104ブロックの吸収+レース根治。この2行は内容として有効であると同時に、
         旧append系wrap(fix105 MARK=【展開を前に進める/fix104系 MARK=【セリフと物音の区別)のidempotentチェックに
         一致させて二重付与を恒久停止する(ロード順レースでsysが~970字ぶれていた実測バグの決定論化)。 */
      '【展開を前に進める・優先順位】指示が衝突したら ①破綻させない(直前の再演・物理矛盾・メタ混入の禁止) ②連続性(場所・負傷・拘束・感情の引き継ぎ) ③前進(場面を次の段階へ動かす) ④文体 の順で必ず判断する。',
      '【セリフと物音の区別】声に出した言葉だけが<say>。物音・気配・息遣いは地の文で描き、セリフにしない。この区別は黙って適用する。タグの選択について注記・説明・※を本文に書かない。', /* v292Dfix234b: モデルがこのルールに言及する注記を本文に書いた実測への対処 */
      '',
      '【守ること】',
      '・既に名前のあるキャラを「???」「謎の人物」などの新キャラ扱いにしない。必ず名前で扱う。',
      '・直前のターンの文章やセリフをそのまま引用・再掲して書き始めない。前ターンの続きの瞬間から書く。',
      '・物理的に矛盾させない（位置・負傷・人物・所持が前の場面と食い違わない）。',
      '・このメッセージのルールや、説明・要約・メモ・チェックリスト・【】ラベルを本文に書かない。「未解決事項:」のようなGM的な運営コメント・判断の独り言も本文ではない。本文はあくまで物語の地の文とセリフだけ。',
      '・日本語として自然な文章で書く。句読点を適切に打ち、一文を長くしすぎない。キャラの状態・数値・時間・確率・スペックを機械的に実況・列挙せず、観測ログやシステムメッセージのような無機質な文体にしない（あくまで物語の地の文として描く）。同じ語・同じ言い回しを連続で繰り返さない。', /* v292Dfix289: Pro長文脈での機械文体・句読点省略・反復崩壊の暴走対策 */
      '',
      miniEx() + '\n\n' + pickExamples()   // v292Dfix208: 🎭トーンで見本切替 / fix223d改: ミニ見本先・トーン見本後 / fix224: 強制リマインドは実測無効 / fix249: 長文時はフル尺見本(長さは見本で引っ張る)
    ]);
    return blocks.join('\n');
  }

  // Planner.build を最外でラップ。engineMode=1 のとき sys を丸ごと差し替える。
  // user 側（文脈）はそのまま。features.js の各ラップは冪等で先に装着済みのため、
  // この装着は最外＝最後の一手になる。
  function install(){
    var P = window.Planner || (typeof Planner!=='undefined'?Planner:null);
    if(!P || typeof P.build!=='function') return false;
    if(P.build.__v292NewEngine) return true;
    var inner = P.build.bind(P);
    var wrapped = function(){
      // Phase2 S3: 新βのとき base sys 組み立てをスキップさせるフラグ。inner.apply(=base build)が
      //   読むため、必ず inner 呼び出し前にセットする。engineOn()判定を流用（fix355で新β固定）。
      try{ if(engineOn()) window.__v292EngineNew = true; }catch(_){}
      var r;
      try {
        r = inner.apply(this, arguments);
      } finally {
        // ★fix425(2026-07-12): 監査#8の根治。旧実装は __v292EngineNew を立てっぱなしにしていた。
        //   index.html の base sys は「このフラグが真なら sys を組み立てずに '' を返す」ので、
        //   万一このラップが失われた状態で base build が直接呼ばれると【sysが空のまま】APIへ行く。
        //   フラグを「inner(=base build)を呼ぶこの一回だけ」に限定する(per-callハンドシェイク)。
        //   → ラップが生きている時だけスキップが起き、失われたら自動的に base sys へ安全側フォールバック。
        //   OFF: v292Dfix425Off='1' で従来動作(立てっぱなし)。
        try{
          var _off425 = false;
          try { _off425 = (localStorage.getItem('v292Dfix425Off') === '1'); } catch(_e){}
          if (!_off425) window.__v292EngineNew = false;
        }catch(_){}
      }
      try{
        if(engineOn() && r && typeof r.sys==='string'){
          var mode = (arguments.length>0 && arguments[0]!=null) ? String(arguments[0]) : '';
          var text = (arguments.length>1 && arguments[1]!=null) ? String(arguments[1]) : '';
          r.sys = buildSys(mode, text);
        }
      }catch(e){ try{ console.warn(TAG,'build err:', e&&e.message); }catch(_){} }
      return r;
    };
    wrapped.__v292NewEngine = true;
    P.build = wrapped;
    try{ console.log(TAG, 'wrap installed'); }catch(_){}
    return true;
  }
  (function wait(){ if(install()) return; setTimeout(wait, 300); })();
  // features.js が後から別ラップを被せてもこの差し替えが効くよう、保険で再装着確認。
  setInterval(function(){
    try{
      var P = window.Planner;
      if(P && typeof P.build==='function' && !P.build.__v292NewEngine) install();
    }catch(e){}
  }, 2000);

  // topbar に ⚙エンジン[従来/新β] を注入（既定=従来）。
  function injectToggle(){
    try{
      var tb = document.getElementById('topbar');
      if(!tb){ setTimeout(injectToggle, 500); return; }
      if(document.getElementById('v292-engine-sel')) return;
      var span = document.createElement('span');
      span.style.cssText = 'margin-left:8px;font-size:12px;display:inline-flex;align-items:center;gap:4px;';
      span.innerHTML = '⚙エンジン<select id="v292-engine-sel" style="font-size:12px;"><option value="0">従来</option><option value="1">新β</option></select>';
      tb.appendChild(span);
      var sel = span.querySelector('#v292-engine-sel');
      sel.value = engineOn() ? '1' : '0';
      sel.addEventListener('change', function(){ setEngine(sel.value); });
      // v292Dfix211: 📏長さセレクタ（既存v100_outputLenのトップバー昇格。max_tokensも連動）
      if(!document.getElementById('v292-len-sel')){
        var span3 = document.createElement('span');
        span3.style.cssText = 'margin-left:8px;font-size:12px;display:inline-flex;align-items:center;gap:4px;';
        span3.innerHTML = '📏長さ<select id="v292-len-sel" style="font-size:12px;"><option value="short">短</option><option value="standard">標準</option><option value="long">長文</option></select>';
        tb.appendChild(span3);
        var lsel = span3.querySelector('#v292-len-sel');
        lsel.value = lenKey();
        lsel.addEventListener('change', function(){ setLen(lsel.value); });
      }
      // v292Dfix208: 🎭トーンセレクタ（新βの見本registerを切替。従来エンジンには影響しない）
      if(!document.getElementById('v292-tone-sel')){
        var span2 = document.createElement('span');
        span2.style.cssText = 'margin-left:8px;font-size:12px;display:inline-flex;align-items:center;gap:4px;';
        span2.innerHTML = '🎭トーン<select id="v292-tone-sel" style="font-size:12px;"><option value="shizuka">静</option><option value="dou">動</option><option value="koi">濃</option><option value="kaiwa">会話劇</option><option value="suspense">緊迫</option></select>'; /* v292Dfix287: サスペンス追加 */
        tb.appendChild(span2);
        var tsel = span2.querySelector('#v292-tone-sel');
        tsel.value = toneKey();
        tsel.addEventListener('change', function(){ setTone(tsel.value); });
      }
      try{ console.log(TAG, 'toggle injected'); }catch(_){}
    }catch(e){ setTimeout(injectToggle, 500); }
  }
  injectToggle();

  window.__v292NewEngine = { buildSys: buildSys, engineOn: engineOn, setEngine: setEngine, stateBlock: stateBlock, toneKey: toneKey, setTone: setTone, lenKey: lenKey, setLen: setLen, agendaBlock: agendaBlock, agendaPressures: agendaPressures /* v292Dfix254 */ };
  try{ console.log(TAG, 'loaded'); }catch(_){}
})();
