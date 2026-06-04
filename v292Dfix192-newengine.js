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

  // ライブのキャラ状態を fix77 ストアから構造化データとして注入。
  // （旧 sys の【各キャラの現在の状態】＋fix190 永続フィールドの置き換え）
  function stateBlock(){
    try{
      var store = window.__v292Dfix77Store; if(!store) return '';
      var lines=[];
      Object.keys(store).forEach(function(n){
        var s=store[n]||{}; if(!s || typeof s!=='object') return;
        var parts=[];
        var ka=s.karada||s['からだ'], ko=s.kokoro||s['こころ'], ho=s.honno||s['本能'];
        var ki=s.kizu||s['傷'], kn=s.kankei||s['関係'], mi=s.mikaiketsu||s['未解決'];
        if(ka) parts.push('からだ:'+ka);
        if(ko) parts.push('こころ:'+ko);
        if(ho) parts.push('本能:'+ho);
        if(ki) parts.push('傷:'+ki);
        if(kn) parts.push('関係:'+kn);
        if(mi) parts.push('未解決:'+mi);
        if(parts.length) lines.push('・'+n+'｜'+parts.join(' ／ '));
      });
      if(!lines.length) return '';
      return '【各キャラの現在の状態（引き継ぐ。傷/関係/未解決は治療・和解まで保持し勝手に消さない）】\n'+lines.join('\n')
        +'\n・関係・未解決は各キャラが自分から動き、主人公や他キャラに話しかける動機になる。傷・恐怖・対立・依頼の場面では、入力を待たずNPCの側から言葉を発してよい。';
    }catch(e){ return ''; }
  }

  // register 見本（静）。将来 toneLevel で差し替え可能にするためマップ化。
  var EXAMPLES = {
    'shizuka': [
      '【書き方の見本（構造と密度の参考。内容はコピーせず、今の場面に合わせて作る）】',
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
    ].join('\n')
  };

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
    var dlgLine = pick(dlg,
      'セリフ＝控えめ：会話は最小限、地の文中心。',
      'セリフ＝標準：要所でキャラを喋らせる。',
      'セリフ＝濃いめ：キャラ同士の掛け合いを増やし、会話で関係や次の行動を見せる。');
    var contLine = isCont
      ? '（プレイヤーは「続きを書く」を押した。あなたが物語を一歩進める番。受け身で待たず、上の進行レベルに従って能動的に動かす。グロや痛みの強度を上げるだけ＝"縦"は前進ではない。新しい要素＝"横"で世界を広げる。）'
      : '';
    var st = stateBlock();

    var blocks = [
      '＜あなたの役割＞',
      'あなたは一人称視点のホラーTRPGの語り手です。プレイヤーの行動や入力を「物語の種」として受け取り、それを膨らませて場面を一つ前へ進めます。プレイヤーは善にも悪にもなれます。物語を裁かず、世界を生きたものとして描いてください。'
    ];
    if (inputLine){ blocks.push(''); blocks.push(inputLine); }
    blocks = blocks.concat([
      '',
      '【良い1ターンの形】',
      '1. 直前の場面（場所・各キャラの状態・感情・位置）を引き継いで書き出す。前の文をそのまま繰り返さない。',
      '2. 新しい要素を持ち込んで状況を前へ動かす（出来事・発見・移動・人物の行動・関係の変化など）。同じ場面の描き直しで終えない。',
      '   ' + dramaLine,
      '3. 五感のある地の文で描く。視覚以外（音・匂い・触感・体感）を毎ターン最低1つ。痛みや恐怖は、まず体が反応してから言葉になる。型に嵌めず、その人物・その状況に固有の反応を書く。',
      '4. その場にいるキャラは生きている。目的・感情・関係に沿って自分から喋り、時に互いに衝突・協力する。' + dlgLine,
      '本文は地の文と「」セリフで、5〜10文程度を目安に書き切る。' + contLine
    ]);
    if (st){ blocks.push(''); blocks.push(st); }
    blocks = blocks.concat([
      '',
      '【出力の形式（これだけは形式として守る）】',
      '本文を書き切ったあと、登場した各キャラについて次の2種のタグを本文の後ろに置く（本文より前や本文の途中に置かない）：',
      '<react who="名前" 反応="身体反応＋感情を1文で短く" 声="口から漏れた音・言葉。無ければ空"/>',
      '<state who="名前" からだ="今この瞬間の身体" こころ="今の感情" 本能="体が今したいこと" 傷="負傷した瞬間だけ記入・治るまで保持" 関係="主人公や他者への今の関係" 未解決="抱えた感情の負債"/>',
      '・登場キャラが声に出すセリフは【必ず】<say who="名前">…</say> で囲む（who は実際に喋った本人の名前）。地の文に裸の「」だけのセリフを置かず、誰の声か必ず明示する。主人公が話しかけたら、相手のキャラはその場で <say who="名前"> で返事する。',
      '・傷/関係/未解決は中身がある時だけ書く（空なら省く）。一度書いた傷は治療されるまで毎ターン保持する。',
      '・「からだ」は今この瞬間の様子（毎ターン変わる）、傷/関係/未解決は消えない記録。混同しない。',
      '',
      '【守ること】',
      '・既に名前のあるキャラを「???」「謎の人物」などの新キャラ扱いにしない。必ず名前で扱う。',
      '・物理的に矛盾させない（位置・負傷・人物・所持が前の場面と食い違わない）。',
      '・このメッセージのルールや、説明・要約・メモ・チェックリスト・【】ラベルを本文に書かない。本文はあくまで物語の地の文とセリフだけ。',
      '',
      EXAMPLES['shizuka']
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
      var r = inner.apply(this, arguments);
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
      try{ console.log(TAG, 'toggle injected'); }catch(_){}
    }catch(e){ setTimeout(injectToggle, 500); }
  }
  injectToggle();

  window.__v292NewEngine = { buildSys: buildSys, engineOn: engineOn, setEngine: setEngine, stateBlock: stateBlock };
  try{ console.log(TAG, 'loaded'); }catch(_){}
})();
