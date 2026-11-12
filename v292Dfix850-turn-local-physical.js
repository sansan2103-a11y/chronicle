// =====================================================================
// Chronicle TRPG - v292Dfix850: TURN_LOCAL_PHYSICAL_EVIDENCE
// ---------------------------------------------------------------------
// 何を直すか（DS_RR_PHASE1_RUNTIME_AUDIT_v1 の実測）:
//   fix333.compileActorStates() も fix414.deriveConstraints() も、入力は
//   window.__v292Dfix77Store の karada / kizu / kokoro **だけ**。fix77 は
//   「モデルが <state> を出した次ターン」にしか更新されないため、受傷が
//   起きたそのターンには物理系のどの信号も **受傷前の身体** を報告する。
//   実測(QA slot smu1burte5p T11): プレイヤーが「腹を強く打ち、右足がねじれて
//   動かない。血が滲み、立ち上がれない」と入力し、narrative にも「右足首が
//   内側へ折れた／足は動かない／仰向けに近い姿勢」が出ているのに
//     compileActorStates(主人公) = {injured:false, posture:'unknown', freeHands:2,
//                                   karada:'温かい缶と冷たい缶を持ち替えた両手・立ち姿勢'(T6)}
//     authorityBlock() = ''      → 【身体状態・正史】が SYS に出ない
//     fix414.preview() = ''      → 【制約】が SYS に出ない
//   同じ検出器の正規表現を **1文字も変えずに** narrative+playerText へ当てると
//     fix333 injured=true / posture='prone' / fix414 DISABLE=true
//   になる。**検出器も語彙も正しく、今ターンのテキストを見せていないだけ**。
//
// 本 fix の責務は 1 つだけ:
//   「今ターンの物理的事実」を **既存の検出器に見せる**。
//   新語彙 0 / 新 detector 0 / 新 schema 0 / 新 LS キー 0 / 新 SYS marker 0 /
//   永続化 0 / 新しいゲーム意味論 0。SYS へ出る文面は **既存 fix333 / fix414
//   のものだけ**（本 fix は 1 文字も文面を書かない）。
//
// 機構:
//   Planner.build を最外でラップし、その呼び出しの **間だけ**
//   window.__v292Dfix77Store を shadow（karada に今ターンのテキストを追記したもの）
//   に差し替える。try/finally で必ず元へ戻す。compileActorStates も
//   fix414.textFn も同期実行なので、他の処理と交錯しない。
//   → fix333 / fix414 の既存ロジックが **そのまま** 新しい入力で動く。
//   → 新しい SYS marker を作らないので fix459 の未知マーカー吸収事故
//     (fix496 が実測記録) を構造的に回避する。
//
// 帰属（実測に基づく）:
//   ・名前のある人物 … 既存と同じ「名前の周辺窓」。
//   ・主人公 … narrative は主人公を名前で呼ばない（実測: 出現 0 回）。
//     名前一致で帰属する既存経路は主人公に構造上当たらないため、
//     (a) 今ターンの playerText 全文（DO/STORY はプレイヤー自身の行動・描写）
//     (b) 他の cast 名を 1 つも含まない narrative の文
//     を主人公に帰属させる。
//
// flag: 既定 OFF（opt-in）
//   v292Dfix850On  = '1' … 有効化
//   v292Dfix850Off = '1' … 最優先で無効（On より強い）
//   v292DrrOff     = '1' … CORE_REACTION_REALISM lane の master kill
//   上位の既存 kill（v292Dfix333Off / v292Dfix414Off）はそのまま効く。
//   overlay は永続化しないので、OFF にした瞬間に次の build から完全に従来へ戻る。
// 検証口: window.__v292Dfix850x = { status, overlayFor, lastOverlay, shadowOf }
// =====================================================================
(function(){
  'use strict';
  var G = (typeof window !== 'undefined') ? window
        : (typeof globalThis !== 'undefined') ? globalThis : this;
  if (G.__v292Dfix850) return;
  G.__v292Dfix850 = true;
  var TAG = '[v292Dfix850:turn-local-physical]';

  function ls(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return ls('v292Dfix850Off') === '1' || ls('v292DrrOff') === '1'; }
  /* ★RR default ON(2026-09-15・②C1 裁定): 既定を ON にする。
     未設定＝ON / '0'＝端末単位の opt-out / Off='1' と v292DrrOff='1' は従来どおり最優先。
     旧 On='1' も引き続き有効（冗長だが無害）。閾値・語彙・出力文面は 1 文字も変えていない。 */
  function on(){ if (off()) return false; return ls('v292Dfix850On') !== '0'; }

  function getS(){
    try { if (typeof G.__chronicleGetState === 'function'){ var a = G.__chronicleGetState('fix850'); if (a) return a; } } catch(e){}
    try { return G.S || null; } catch(e){ return null; }
  }
  function str(v){ return String(v == null ? '' : v); }

  /* ---- cast の名前（hero は別扱い） ------------------------------- */
  function heroName(){
    try { var S = getS(); var h = S && S.cast && S.cast.hero; var n = str(h && h.name).trim();
          return n || '主人公'; } catch(e){ return '主人公'; }
  }
  function otherNames(){
    var out = [], seen = {};
    try {
      var S = getS(); if (!S || !S.cast) return out;
      var hn = heroName();
      var ns = S.cast.npcs || [];
      for (var i = 0; i < ns.length; i++){
        var n = str(ns[i] && ns[i].name).trim();
        if (n && n !== hn && !seen[n]){ seen[n] = 1; out.push(n); }
      }
      /* fix77 store に居て cast に居ない準登録者も対象に含める（既存 fix414 の E-4 と同じ考え） */
      var st = G.__v292Dfix77Store || {};
      Object.keys(st).forEach(function(n){
        n = str(n).trim();
        if (n && n !== hn && n !== '主人公' && !seen[n]){ seen[n] = 1; out.push(n); }
      });
    } catch(e){}
    return out;
  }

  /* ---- 今ターンのテキスト ---------------------------------------- */
  function lastNarrative(){
    try {
      var S = getS(); if (!S || !Array.isArray(S.turns) || !S.turns.length) return '';
      var t = S.turns[S.turns.length - 1];
      return str(t && t.narrative);
    } catch(e){ return ''; }
  }
  /* <state> / <react> 等のタグ部分は本文ではないので落とす（fix333 proseOnly と同趣旨） */
  function proseOnly(text){
    try { return str(text).split(/<react|<state|<summary/)[0]; } catch(e){ return str(text); }
  }
  function sentences(text){
    return str(text).split(/[。\n]/).map(function(s){ return s.trim(); }).filter(function(s){ return !!s; });
  }

  /* ---- 証拠フィルタ（RR-1 が新たに作るリスク面への対処） ------------
     これまで検出器の入力は fix77 の karada（モデルが書いた整形済み state）だけだった。
     RR-1 は **生のプレイヤー入力と地の文** を入れるので、否定・仮定・引用という
     新しい誤検出経路が生まれる。実測（offline run4）で:
       「灯の腕は骨折していない」      → `腕使用不可`     が出た（誤）
       「もしここで骨折したら」        → `走行不可`       が出た（誤）
     よって overlay に渡す前に **節単位で除外**する。
     ★除外語彙だけを足し、負傷語彙・検出器・既存の意味論には一切触れない。
     ★能力の否定（動かない・使えない・立ち上がれない）は **負傷の否定ではない** ので
       絶対に落とさない。落とすと F1/F2 の本物の重傷が消える。 */

  /* 損傷語そのものが否定されている節（「骨折していない」「折れてはいない」）。
     否定は損傷語に **直接** 付いている場合だけ。「骨折して動かない」は
     間に能力語が入るので該当しない＝制約は残る。 */
  var NEG_DAMAGE = /(骨折|裂傷|出血|負傷|怪我|火傷|脱臼|捻挫|打撲)(は|も|)(して|し|)(は|)(い|)ない|(折れ|潰れ|裂け|抉れ|刺さっ|貫通し|切れ)(て|)(は|も|)(い|)ない/;
  /* 仮定・想像・伝聞の節 */
  var HYPO = /もし|仮に|たとえ|想像|夢の中|かもしれな|だろうか|と(考え|思っ|想像し)|ような気が/;

  function evidenceOnly(text){
    var kept = [];
    sentences(text).forEach(function(sent){
      if (HYPO.test(sent)) return;        /* 仮定・想像は身体的事実ではない */
      if (NEG_DAMAGE.test(sent)) return;  /* 損傷そのものの否定 */
      kept.push(sent);
    });
    return kept.join('。');
  }

  /* 「…」内の発話は身体的事実ではない（第三者の負傷の話・引用を拾わない）。
     地の文だけを残す。 */
  function stripQuoted(text){
    try {
      return str(text)
        .replace(/[「『][^「『」』]{0,400}[」』]/g, '　')
        .replace(/[\u201c\u201d][^\u201c\u201d]{0,400}[\u201c\u201d]/g, '　');
    } catch(e){ return str(text); }
  }

  /* ---- 帰属: 文単位 + 名前スライス --------------------------------
     ★run1 で発覚した実欠陥の修正（開示事項）:
       旧実装は「名前の前後 60/160 字窓」で帰属していたため、
       「灯の右腕は骨折して動かない。巡は左脚に深い裂傷を負い…」という
       narrative で **巡 の overlay に 灯 の右腕骨折が混入**し、
       巡 に「右腕使用不可」という他人の制約が出た（F6 実測）。
       近接だけを帰属の根拠にしない、という既存方針にも反していた。
     新実装: 文（。/改行）で切り、文の中では **名前の出現位置から次の名前まで**
       のスライスだけをその人物へ帰属する。名前が 1 つも無い文は主人公へ。
       fix414 の G-1/G-2「部位ローカル文脈」と同じ考え方。 */
  /* ★★fix929 b1-H（GPT裁定840/843 PROVENANCE_AWARE_ATTRIBUTION）:
     実測 BODYCANON_SUBJECTLESS_DEFAULT_TO_HERO（名前の無い文を主人公へ帰属 → 主人公に偽の負傷・拘束・姿勢）を止める。
     ・playerText 由来: 人名か主人公 marker（あなた／主人公／自分）がある文だけ帰属する。無ければ誰にも帰属しない
       （PLAYER_DO_IS_NOT_PROVENANCE。STORY 入力も #inp のユーザー入力）。
     ・地の文由来: 明示された人物を優先。省略主語は、同じ段落で直前の文の actor が 1 人に確定しているときだけ引き継ぐ。
       2 人以上が出た文の後は actor 不明。actor 不明は safe miss。「名前が分からないから主人公」はしない。
     ・既知の safe miss: F2_OMITTED_HERO_NARRATIVE_MISS（主語なしで書かれた主人公の結果の地の文）= MONITOR。
     ・FIX929_H_REQUIRES_FIX930_FOR_PRODUCTION: fix930（c1）が OFF のときは H も OFF（旧帰属）。H 単独では動かない。
     OFF: localStorage v292Dfix929Off='1'（または v292Dfix930Off='1'）→ 従来の帰属。 */
  function b1HOn(){ return ls('v292Dfix929Off') !== '1' && ls('v292Dfix930Off') !== '1'; }
  var HERO_MARK_P929 = /あなた|主人公|自分/, HERO_MARK_N929 = /あなた|主人公/;
  /* ★fix934（ATTRIBUTION REPAIR・裁定 854、kill: v292Dfix934Off）:
     (B) NAME_MENTION_TREATED_AS_ACTOR: 「Xの…」（所有格の言及）は行為者の印ではない。所有格だけの hit は、
         同じ文の行為者（は/が 等で現れる名前）の断片に含める。文頭の所有格の部分は、文中で最初の行為者へ渡す。
         行為者の hit が 1 つも無い文（例: 甚八の右脚が折れた）は従来どおり所有格の名前に帰属する。
     (A) INJURY_OBJECT_ATTRIBUTED_TO_OBSERVER: 行為者 X の断片で、負傷語が「目的語の名詞句の修飾」の位置
         （負傷語 …{0,10} を|へ|に）にだけ現れ、その名詞句が X 自身のもの（自分の / 己の / Xの）でないときは、
         負傷の対象は X ではない → X には渡さない。名詞句に別の名前 Y の所有格（Yの）があれば Y に渡す。
         無ければ safe miss。負傷語が述語の位置（例: 右足を折った / 右足が折れた）のときは従来どおり X。 */
  var INJ934 = /出血|骨折|刺さ|裂け|抉|損傷|負傷|折れ|潰れ|火傷/g;
  function off934(){ try { return localStorage.getItem('v292Dfix934Off') === '1'; } catch(e){ return false; } }
  function objectInjury934(frag, owner, names){
    /* 返り値: null = 対象外（述語位置の負傷 or 負傷語なし）/ { to: 'Y' | null } = 目的語位置の負傷のみ */
    INJ934.lastIndex = 0; var m, any = false, allObj = true, poss = null;
    while ((m = INJ934.exec(frag))){
      any = true;
      var tail = frag.slice(m.index, m.index + m[0].length + 12);
      var pm = tail.slice(m[0].length).match(/^[^。、を へに]{0,10}?(を|へ|に)/);
      if (!pm){ allObj = false; break; }
      var np = frag.slice(Math.max(0, m.index - 10), m.index + m[0].length + pm[0].length);
      if (/自分の|己の/.test(np) || (owner && np.indexOf(owner + 'の') >= 0)){ allObj = false; break; }
      for (var i = 0; i < names.length; i++){ var y = names[i]; if (y && y !== owner && np.indexOf(y + 'の') >= 0){ poss = y; break; } }
    }
    if (!any || !allObj) return null;
    return { to: poss };
  }
  function attrFrag934(sent, hits, push){
    var names = []; hits.forEach(function(h){ if (names.indexOf(h.n) < 0) names.push(h.n); });
    /* 所有格（Xの）と目的語（Xを）の言及は行為者の印にしない */
    /* 「XとYの…」（並列の所有格。例: 女将と主人公の間）の X も所有格として扱う */
    var possCoord = function(h){
      if (sent.charAt(h.at + h.n.length) !== 'と') return false;
      var nx = h.at + h.n.length + 1;
      for (var q = 0; q < hits.length; q++){ var g = hits[q]; if (g.at === nx && sent.charAt(g.at + g.n.length) === 'の') return true; }
      return false;
    };
    var actorHits = hits.filter(function(h){ var c = sent.charAt(h.at + h.n.length); return c !== 'の' && c !== 'を' && !possCoord(h); });
    if (!actorHits.length) actorHits = hits.slice();          /* 所有格だけの文 = 従来どおり */
    for (var j = 0; j < actorHits.length; j++){
      var start = (j === 0) ? hits[0].at : actorHits[j].at;   /* 文頭（最初の名前より前）は従来どおり誰にも渡さない */
      var end = (j + 1 < actorHits.length) ? actorHits[j + 1].at : sent.length;
      var frag = sent.slice(start, end); if (!frag) continue;
      var owner = actorHits[j].n, oi = objectInjury934(frag, owner, names);
      if (!oi){ push(owner, frag); continue; }
      if (oi.to) push(oi.to, frag);                          /* 負傷の対象は所有格の Y */
      /* else: 対象不明 = safe miss（観察者 X には渡さない） */
    }
  }
  /* ★★F333b（laneFIX3・2026-11-11・LOCAL 候補・kill: localStorage v292DfixF333bOff='1'）---------------------------
     実測（本物の AI の A/B・美羽が T6〜T9 に宙吊り）: 【身体状態・正史】が ①吊られている美羽の行を T7〜T8 で落とす
       ②解放の回 T9 に助ける側の剛へ「拘束されている／宙に吊られ不安定」を出す ③美羽の手首のけがを蓮・剛へ付ける。
     原因（fixture で再現。qa/fixtures_f333b.cjs）:
       ①F333a の「近くの他人 Yの」判定が、本人の動作の目的語（剛の手を掴もうと／蓮の名を呼びながら）まで「他人の状態」とみなして外す。
         解放の判定が「美羽は思わず手を離した」（本人が手を離す）・「放しかけた」（未遂）を解放とみなし、保存の宙吊りを外す。
       ②能動の語が体の語を修飾する形（吊り上げる腕に／締め上げる腕を）を「本人の体」とみなして残す。
         主語が本人の能動（剛が…押さえつけた）を、目的語が無い・目的語が体の語だというだけで残す。
       ③主語の無い文の引き継ぎ（fix929 H）が、救助者が 1 人だけ出た文（蓮が駆け寄る。）の次の「右手首が折れていた」を救助者へ渡す。
     対処（どれも「持ち主が言えないなら行を出さない」側。語・検出器・fix333 の文面は変えない）:
       a) 『Yの N を …ながら／うと／まま』の Y は、その後ろの語の持ち主の印にしない（受け身・状態の語だけ）。
       b) 解放の「離し／放し」は、主語が本人（名前・自分・彼女 等）なら解放にしない。「放しかけ／離しかけ」は未遂。
       c) 能動の語＋体の語（吊り上げる腕）は、その腕の持ち主＝加える側 → 本人には付けない。
          主語が本人の能動は、目的語が本人（名前・自分）でない限り加える側 → 付けない。
       d) 拘束・けがの語を含む主語の無い文は、同じ段落にそれまで出た人物が 1 人だけのときだけ引き継ぐ（2 人以上なら誰にも付けない）。
       e) 『Yの（右|左|両|片）部位 は／が／から／に／の …けがの語』（間に 、 を・別の人物なし）は Y のけが。その部分を Y へ渡す。
     kill: v292DfixF333bOff='1' → F333a のまま（バイト同一）。F333a・fix850 を止める鍵でも止まる。診断: window.__v292DfixF333b.stat()。 */
  function f333bOn(){ return ls('v292DfixF333aOff') !== '1' && ls('v292DfixF333bOff') !== '1'; }
  var _f333bStat = { carryAbstain: 0, possessorPush: 0, agentCut: 0, relRejected: 0, nearKept: 0 };
  var B_TOK1 = /宙に吊|宙づり|宙吊り|締め上げ|吊り上げ|吊ら|縛ら|絡め取ら|押さえ込ま|押さえつけ|羽交い締め|組み伏せ|引き倒|身動きが取れ|拘束|出血|骨折|刺さ|裂け|抉|損傷|負傷|折れ|潰れ|火傷/;
  function bPossessorInjury(sent, names, push){
    /* e) Yの部位 … けがの語（同じ節・別の人物なし） */
    var BW = '体|身体|からだ|腕|手|足|脚|首|頭|胴|腰|肩|指|背|胸|腹|膝|顔|肌|皮膚|骨|肋骨|肋|歯|爪|耳|目|鼻|口|唇|額|頬|喉|腿|太腿|脛|踵|拳|掌|肘|脇|内臓|関節|鎖骨|爪先|足先|指先|手首|足首|首筋|手足|背中|脇腹|全身|半身|上半身|下半身';
    var INJ = '出血|骨折|刺さ|裂け|抉|損傷|負傷|折れ|潰れ|火傷';
    for (var i = 0; i < names.length; i++){
      var y = names[i]; if (!y) continue;
      var re = new RegExp(y.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + 'の((?:右|左|両|片)?(?:' + BW + '))(?:には|にも|から|は|が|に|も|の)([^、。を]{0,12}?)(' + INJ + ')([ぁ-ん]{0,8})', 'g'), m;
      while ((m = re.exec(sent))){
        var mid = m[2], bad = false;
        for (var j = 0; j < names.length; j++){ if (names[j] && mid.indexOf(names[j]) >= 0){ bad = true; break; } }
        if (bad) continue;
        push(y, m[0]); _f333bStat.possessorPush++;
      }
    }
  }
  function attributeH(text, hero, others, push, src){
    var names = [hero].concat(others);
    var useB = f333bOn();
    str(text).split(/\n+/).forEach(function(para){
      var actor = null, seenB = {};
      para.split('。').map(function(x){ return x.trim(); }).filter(function(x){ return !!x; }).forEach(function(sent){
        var hits = [], i, n, at;
        for (i = 0; i < names.length; i++){
          n = names[i]; if (!n) continue;
          at = sent.indexOf(n);
          while (at >= 0){ hits.push({ at: at, n: n }); at = sent.indexOf(n, at + n.length); }
        }
        if (!hits.length){
          var mark = (src === 'player') ? HERO_MARK_P929 : HERO_MARK_N929;
          if (mark.test(sent)){ push(hero, sent); actor = hero; if (useB) seenB[hero] = 1; return; }
          if (src === 'narr' && actor){
            /* ★F333b d): 拘束・けがの語を含む文は、段落にそれまで出た人物が 1 人だけのときだけ引き継ぐ */
            if (useB && B_TOK1.test(sent) && Object.keys(seenB).length > 1){ _f333bStat.carryAbstain++; return; }
            push(actor, sent);
          }
          return;                                   /* actor 不明 = safe miss */
        }
        if (useB){ hits.forEach(function(h){ seenB[h.n] = 1; }); bPossessorInjury(sent, names, push); }
        hits.sort(function(x, y){ return x.at - y.at; });
        if (!off934()){
          attrFrag934(sent, hits, push);
        } else {
          for (var j = 0; j < hits.length; j++){
            var start = hits[j].at, end = (j + 1 < hits.length) ? hits[j + 1].at : sent.length;
            var frag = sent.slice(start, end);
            if (frag) push(hits[j].n, frag);
          }
        }
        var distinct = {}; hits.forEach(function(h){ distinct[h.n] = 1; });   /* carry の判定は従来どおり全 hit で数える */
        actor = (Object.keys(distinct).length === 1) ? hits[0].n : null;
      });
    });
  }
  function attribute(text, hero, others, push){
    var names = [hero].concat(others);
    sentences(text).forEach(function(sent){
      var hits = [], i, n, at;
      for (i = 0; i < names.length; i++){
        n = names[i];
        if (!n) continue;
        at = sent.indexOf(n);
        while (at >= 0){ hits.push({ at: at, n: n }); at = sent.indexOf(n, at + n.length); }
      }
      if (!hits.length){
        /* 名前が 1 つも出ない文 = 主人公（実測: narrative は主人公を名前で呼ばない） */
        push(hero, sent);
        return;
      }
      hits.sort(function(x, y){ return x.at - y.at; });
      for (var j = 0; j < hits.length; j++){
        var start = hits[j].at;
        var end = (j + 1 < hits.length) ? hits[j + 1].at : sent.length;
        var frag = sent.slice(start, end);
        if (frag) push(hits[j].n, frag);
      }
      /* 最初の名前より前の断片は帰属先が曖昧なので捨てる（安全側） */
    });
  }

  /* ---- overlay 本体 ----------------------------------------------- */
  var _lastOverlay = null;

  function buildOverlay(playerText, mode){
    /* 地の文: タグを落とし → 「」内の発話を落とし → 仮定/否定の節を落とす */
    var narr = evidenceOnly(stripQuoted(proseOnly(lastNarrative())));
    /* fix929: 段落（改行）を保った地の文。H の「同じ段落の直前 actor」判定に使う */
    var narrP = str(stripQuoted(proseOnly(lastNarrative()))).split(/\n+/).map(function(p){ return evidenceOnly(p); }).filter(function(p){ return !!p; }).join('\n');
    /* ★入力種別による証拠採否（実測: Planner.build(mode, text) の mode は
       'STORY' / 'DO' / 'SAY' のいずれかの文字列。QA 実機で確認済み）。
       本エンジンには既に確立した意味論がある —— fix333 authorityBlock の
       「プレイヤーの入力は『試行・命令・願望』であり結果ではない」。
       これに **従う**（新しい意味論を作らない）:
         STORY … プレイヤーが出来事を書いている＝身体的事実として採る
         DO    … 試行。結果はモデルが決める＝事実として採らない
                 （不可能な試行は fix333 の inputAssertsImpossible が既に処理する）
         SAY   … 発話。身体的事実ではない
       DO のときは、その行動の結果が次ターンの地の文に出た時点で拾われる
       （fix77 と違い「モデルが <state> を出すまで待つ」必要はない）。 */
    var isStory = /^story$/i.test(str(mode).trim());
    var ptxt = isStory ? evidenceOnly(str(playerText)) : '';
    if (!narr && !ptxt) return null;

    var hn = heroName(), others = otherNames();
    var ov = {};
    function push(name, frag){
      frag = str(frag).trim();
      if (!frag) return;
      if (!ov[name]) ov[name] = [];
      if (ov[name].indexOf(frag) < 0) ov[name].push(frag);
    }

    if (b1HOn()){
      if (ptxt) attributeH(ptxt, hn, others, push, 'player');
      if (narrP) attributeH(narrP, hn, others, push, 'narr');
    } else {
      if (ptxt) attribute(ptxt, hn, others, push);
      if (narr) attribute(narr, hn, others, push);
    }

    var outv = {}, any = false;
    Object.keys(ov).forEach(function(n){
      var txt = ov[n].join('。');
      if (txt){ outv[n] = txt; any = true; }
    });
    _lastOverlay = any ? outv : null;
    return _lastOverlay;
  }

  /* ---- shadow store: karada に overlay を追記した「読み取り専用の写し」 --- */
  function shadowOf(store, overlay){
    var out = {};
    var src = store || {};
    Object.keys(src).forEach(function(n){
      var e = src[n];
      if (!e || typeof e !== 'object'){ out[n] = e; return; }
      var copy = {};
      Object.keys(e).forEach(function(k){ copy[k] = e[k]; });
      var add = overlay && overlay[n];
      if (add) copy.karada = str(copy.karada) + '。' + add;
      out[n] = copy;
    });
    /* store にまだ居ない人物（初登場でその場で受傷）も拾う */
    if (overlay){
      Object.keys(overlay).forEach(function(n){
        if (!out[n]) out[n] = { karada: str(overlay[n]), turn: -1 };
      });
    }
    return out;
  }

  /* ---- ★F333a（laneF333・2026-11-11・LOCAL 候補・kill: localStorage v292DfixF333aOff='1'）---------
     実測: fix333 の【身体状態・正史(絶対に覆らない)】に、吊られていない人物の「拘束されている／宙に吊られ不安定」が出た。
       原因 = fix333 は karada（＝ここで作る shadow：保存の からだ ＋ 直前の地の文の断片）に語（吊ら・拘束・折れ …）が
       **どこかに有るか**だけを見る。主語を見ない。断片は「蓮は…」の文ごと蓮へ渡るので、
       「フックに吊られた鍵」（物）・「吊られた美羽を見上げた」（他人）・「吊られてはいない」（否定）でも蓮が拘束になる。
       保存の 傷="負傷している"（部位も原因も無い）も毎ターン「負傷している」を出し、AI が書き戻す輪になる。
     対処（fix333 は保護ファイルなので触らない。fix333 が読む shadow の写しの側だけで直す。保存・実 store は変えない）:
       ① 語の主語がその人（か、その人の体の部位）でないとき、その語（と活用の尾）を shadow から外す:
          物・他人を修飾する形（吊られた鍵／宙吊りの美羽）、物・他人が主語（鍵が吊られている／美羽が吊られ）、
          他人の所有・目的（美羽の手首を縛った／美羽を押さえつけた）、能動で相手が物（扉を押さえつけた）、
          否定（吊られてはいない）、仮定・比喩・過去（もし／ように／かつて）、解放の形（拘束から解放され）。
       ② その人の解放（床に落ちた／解放された／縄がほどけた …）があれば、それより前の拘束・宙吊りの語を外す。けがは消さない。
       ③ 傷 が部位も原因も無い一般語（「負傷している」等。STATE2 と同じ判定）なら shadow の 傷 を空にする。
     語・検出器・fix333 の文面は 1 文字も変えない。何も外さない回は従来と同じ（overlay が無ければ swap もしない）。
     kill: v292DfixF333aOff='1' → 従来の shadowOf / swap 条件そのもの（バイト同一）。fix850 を止める鍵（v292Dfix850Off / v292DrrOff）でも止まる。
     診断: window.__v292DfixF333a.last() = [{n, tok, why}]（本文は残さない）。 */
  function f333aOn(){ return ls('v292DfixF333aOff') !== '1'; }
  var A_TOK = /宙に吊|宙づり|宙吊り|締め上げ|吊り上げ|吊ら|縛ら|絡め取ら|押さえ込ま|押さえつけ|羽交い締め|組み伏せ|引き倒|身動きが取れ|拘束|出血|骨折|刺さ|裂け|抉|損傷|負傷|折れ|潰れ|火傷/g;
  var A_INJ = /^(出血|骨折|刺さ|裂け|抉|損傷|負傷|折れ|潰れ|火傷)$/;
  var A_PASSIVE_STEM = /^(吊ら|縛ら|絡め取ら|押さえ込ま)$/;
  var A_ACTIVE = /^(締め上げ|吊り上げ|押さえつけ|引き倒|組み伏せ)$/;
  var A_NOUNV = /^(拘束|羽交い締め)$/;
  var A_BODYW = '体|身体|からだ|身|腕|手|足|脚|首|頭|胴|腰|肩|指|背|胸|腹|膝|顔|肌|皮膚|骨|肋骨|肋|歯|爪|耳|目|鼻|口|唇|額|頬|喉|腿|太腿|脛|踵|拳|掌|肘|脇|内臓|関節|鎖骨|髪|爪先|足先|指先|手首|足首|首筋|手足|背中|脇腹|全身|半身|上半身|下半身';
  var A_BODY = new RegExp('^(?:右|左|両|片)?(?:' + A_BODYW + ')$');
  var A_SELF = /^(自分|己|私|俺|僕|あなた|主人公|彼|彼女)$/;
  var A_STATE_NOUN = /^(状態|姿|格好|体勢|姿勢|身|まま)/;
  var A_PERSON = /^(少女|少年|男|女|子|人|者|生徒|学生|子供|男性|女性|彼|彼女|先輩|後輩)/;
  var A_PLACE = /^(隣|横|前|後ろ|後|上|下|そば|傍|近く|方|側|脇|奥|足元|背後|目の前)/;
  var A_ADV_SUBJ = /^(今|今度|今日|今夜|昨日|明日|時|一瞬|最初|最後|次|前|後|上|下|中|外|内|足元|頭上|背後|途中|半分|全部|少し|何度|一度|二度|再度)$/;
  var A_BOND = /(縄|ロープ|紐|鎖|手錠|拘束|戒め|触手|腕|手|指|網|糸|髪|蔓|ツタ|ベルト|テープ|枷)$/;
  var A_REL = /解放さ|解き放た|振りほど|ほどけ|ほどか|ほどい|解かれ|抜け出|降ろさ|下ろさ|床に(?:落ち|降り|着地|転がり落ち|崩れ落ち)|地面に(?:落ち|降り|着地)|落下し|自由にな|逃れ(?:た|て)|離され|放され|離し|放し/g;
  var A_REL_MOTION = /^(床に|地面に|落下)/;
  var A_REL_ACT = /^(離し|放し|ほどい)$/;
  var A_NEG_TAIL = /^(?:は|も)?(?:られ|され|れ|さ|り|し|せ)?(?:て|で)?(?:は|も|など|すら)?(?:い|お)?(?:ない|なかっ|ず|ません|ませ|ぬ)/;
  var A_HYPO_TAIL = /^[ぁ-ん]{0,6}?(?:よう|みたい|かのよう|かと思|そう(?:な|に|だ|で))|^[ぁ-ん]{0,4}?(?:たら|れば|なら)/;
  var A_HYPO_PRE = /もし|仮に|以前|かつて|昔|あの(?:時|日|夜)|幼い頃|子供の頃|夢の中|夢で/;
  var A_RELTAIL = /^(?:の)?(?:状態)?から(?:解放|抜け出|逃れ|外|降ろ|下ろ|脱)|^を(?:解かれ|解いた|解き放|ほどかれ|ほどいた|外され|外した|脱し|抜け出|振りほど)/;
  var A_INJ_LOCUS = new RegExp('(?:' + A_BODYW + ')(?:に|から|が|を)[^、。]{0,6}$');
  var _f333aLast = [];
  function aClauses(text){
    var out = [], re = /[^、。，！？!?\n]+[、。，！？!?\n]?|[、。，！？!?\n]/g, m;
    while ((m = re.exec(text))){ out.push({ s: m[0], at: m.index }); }
    return out;
  }
  /* pre の終わり 10 字以内に、別の人物の「Yの／Yが／Yは／Yも」があるか（Yの隣・Yの前 などの場所は除く） */
  function aOtherNear(pre, owner, names, withWo, bPred){
    var best = null;
    for (var i = 0; i < names.length; i++){ var n = names[i]; if (!n) continue; var k = pre.lastIndexOf(n); if (k >= 0 && (!best || k > best.at)) best = { n: n, at: k }; }
    if (!best || best.n === owner) return false;
    var after = pre.slice(best.at + best.n.length);
    if (after.length > 11) return false;
    var c = after.charAt(0);
    if (c === 'の'){
      /* ★F333b a): 『Yの N を …ながら／うと／まま』= 本人の動作の目的語。後ろの受け身・状態の語の持ち主の印にしない */
      if (!withWo && bPred && f333bOn() && /^の[^をがは、。]{1,6}を[^、。]{1,8}?(?:ながら|うと|まま|ままで)$/.test(after)){ _f333bStat.nearKept++; return false; }
      return !A_PLACE.test(after.slice(1));
    }
    if (c === 'が' || c === 'は' || c === 'も') return true;
    if (withWo && c === 'を') return true;
    return false;
  }
  function aIsSelfNoun(noun, owner){
    if (!noun) return false;
    if (owner && noun.indexOf(owner) === 0) return true;
    return A_SELF.test(noun) || A_BODY.test(noun);
  }
  function aOtherName(noun, owner, names){
    for (var i = 0; i < names.length; i++){ var n = names[i]; if (n && n !== owner && noun.indexOf(n) === 0) return n; }
    return null;
  }
  function aSubject(pre){
    var re = /([一-龥々ァ-ヶーA-Za-z]{1,8})(?:が|は)/g, m, last = null;
    while ((m = re.exec(pre))){ if (!A_ADV_SUBJ.test(m[1])) last = m[1]; }
    return last;
  }
  function aObject(pre){
    var re = /([一-龥々ァ-ヶーA-Za-z]{1,8})を/g, m, last = null;
    while ((m = re.exec(pre))){ last = m[1]; }
    return last;
  }
  /* 1 つの語が「その人の身体状態でない」なら理由を返す（外す）。その人のものなら null（残す）。迷うときは残す。 */
  function aWhy(tok, pre, tail, owner, names){
    if (tok !== '身動きが取れ' && A_NEG_TAIL.test(tail)) return 'neg';
    if (A_HYPO_TAIL.test(tail) || A_HYPO_PRE.test(pre)) return 'hypo';
    var injury = A_INJ.test(tok);
    if (!injury && A_RELTAIL.test(tail)) return 'released';
    var voice = 'state', nounTok = false;
    if (A_PASSIVE_STEM.test(tok)) voice = 'passive';
    else if (A_ACTIVE.test(tok)) voice = /^(?:られ|され|ら)/.test(tail) ? 'passive' : 'active';
    else if (A_NOUNV.test(tok)){ nounTok = true; voice = /^(?:に)?され/.test(tail) ? 'passive' : (/^(?:に)?(?:し|する|した)/.test(tail) ? 'active' : 'state'); }
    else if (/^(宙吊り|宙づり|出血|骨折|損傷|負傷|火傷)$/.test(tok)){ nounTok = true; if (/^させ/.test(tail)) voice = 'active'; }
    else if (injury && /^させ/.test(tail)) voice = 'active';
    /* ★F333b a) は語が述語の位置（後ろの名詞を修飾しない）のときだけ */
    var bPred = !/^([ぁ-ん]{0,6}?)(た|る|の|いる|いた|ある|あった|たままの|ているままの)(?=[一-龥々ァ-ヶーA-Za-z])/.test(tail);
    if (aOtherNear(pre, owner, names, voice === 'active', bPred)) return 'other';
    /* 動詞を重ねて他人を修飾する形（負傷して倒れている剛／縛られて震える美羽） */
    if (voice !== 'active'){
      for (var ni = 0; ni < names.length; ni++){ var nm = names[ni]; if (!nm || nm === owner) continue;
        var k2 = tail.indexOf(nm); if (k2 < 1 || k2 > 13) continue;
        var mid = tail.slice(0, k2); if (/[、。がはをに]/.test(mid)) continue;
        if (/[たる]$/.test(mid)) return 'other'; }
    }
    /* 修飾の形（吊られた鍵／宙吊りの美羽／折れた枝） */
    var am = tail.match(/^([ぁ-ん]{0,6}?)(た|る|の|いる|いた|ある|あった|たままの|ているままの)(?=[一-龥々ァ-ヶーA-Za-z])/);
    if (am){
      var noun = (tail.slice(am[0].length).match(/^[一-龥々ァ-ヶーA-Za-z]{1,8}/) || [''])[0];
      var viaNo = (am[1] === '' && am[2] === 'の');
      /* ★F333b c): 能動の語が体の語を修飾（吊り上げる腕・締め上げる手）= その腕は加える側のもの */
      if (voice === 'active' && !viaNo && A_BODY.test(noun) && f333bOn() && !(owner && (pre.indexOf(owner + 'の') >= 0 || pre.indexOf(owner + 'を') >= 0)) && !/自分(?:の|を)|己(?:の|を)/.test(pre)){ _f333bStat.agentCut++; return 'agent'; }
      if (aIsSelfNoun(noun, owner) || A_STATE_NOUN.test(noun)) return null;
      if (aOtherName(noun, owner, names)) return 'other';
      if (viaNo && nounTok){ return A_PERSON.test(noun) ? 'other' : null; }   /* 拘束の痛み・出血の量 = 本人のこと */
      if (voice !== 'active'){
        if (A_PERSON.test(noun)) return 'other';
        if (injury && A_INJ_LOCUS.test(pre)) return null;                        /* 腕に刺さったナイフ */
        return 'object';
      }
    }
    if (voice === 'active'){
      var obj = aObject(pre);
      if (f333bOn()){
        /* ★F333b c): 主語が本人の能動 = 本人は加える側（目的語が本人＝名前・自分 のときだけ残す） */
        var bsj = aSubject(pre);
        if (bsj && (bsj === owner || (owner && bsj.indexOf(owner) === 0) || A_SELF.test(bsj))
            && !(obj && ((owner && obj.indexOf(owner) === 0) || /^(自分|己)/.test(obj)))){ _f333bStat.agentCut++; return 'agent'; }
      }
      if (!obj) return null;                       /* 相手が書かれていない能動 = 判断しない（残す） */
      if (aIsSelfNoun(obj, owner)) return null;    /* 蓮を／首を 締め上げる */
      return 'agent';                              /* 扉を押さえつけた = 本人は加える側 */
    }
    var subj = aSubject(pre);
    if (subj){
      if (aIsSelfNoun(subj, owner)) return null;
      if (aOtherName(subj, owner, names) || A_PERSON.test(subj)) return 'other';
      if (!injury && A_BOND.test(subj)) return null; /* 縄が／触手が = 本人のこと */
      return 'object';                             /* 鍵が吊られている・鉛筆が折れた */
    }
    return null;
  }
  function aRelValid(tok, pre, tail, owner, names){
    if (A_NEG_TAIL.test(tail) || A_HYPO_TAIL.test(tail) || A_HYPO_PRE.test(pre)) return false;
    if (/^(?:ようと|ようとし|こうと|そうと)/.test(tail)) return false;
    if (aOtherNear(pre, owner, names, true)) return false;
    if (A_REL_ACT.test(tok)){
      if (f333bOn()){
        /* ★F333b b): 未遂（放しかけ）と、本人が主語の「手を離した／目を離した」は解放ではない */
        if (/^(?:かけ|かか)/.test(tail)){ _f333bStat.relRejected++; return false; }
        var bs = (tok === 'ほどい') ? null : aSubject(pre);    /* 本人が縄をほどいた は解放のまま */
        if (bs && (bs === owner || (owner && bs.indexOf(owner) === 0) || A_SELF.test(bs))){ _f333bStat.relRejected++; return false; }
      }
      var obj = aObject(pre);
      if (tok === 'ほどい') return !obj || aIsSelfNoun(obj, owner) || A_BOND.test(obj);
      return !!obj && aIsSelfNoun(obj, owner);   /* 腕が美羽を放した（本人が目的語）だけ。鍵を放した は違う */
    }
    var subj = aSubject(pre);
    if (subj && !aIsSelfNoun(subj, owner)){
      if (aOtherName(subj, owner, names) || A_PERSON.test(subj)) return false;
      if (A_REL_MOTION.test(tok)) return false;  /* 鍵が床に落ちた */
      if (!A_BOND.test(subj) && !/拘束|戒め/.test(subj)) return false;
    }
    return true;
  }
  function aClean(text, owner, names, relCut, log){
    /* relCut: この位置より前の拘束・宙吊りの語を外す（-1 = 外さない／Infinity = 全部） */
    var t = str(text); if (!t) return { t: t, cut: [], lastRel: -1 };
    var cut = [], lastRel = -1;
    aClauses(t).forEach(function(c){
      var s = c.s, m;
      A_REL.lastIndex = 0;
      while ((m = A_REL.exec(s))){
        if (aRelValid(m[0], s.slice(0, m.index), s.slice(m.index + m[0].length), owner, names)) lastRel = Math.max(lastRel, c.at + m.index);
      }
      A_TOK.lastIndex = 0;
      while ((m = A_TOK.exec(s))){
        var tok = m[0], pre = s.slice(0, m.index), tail = s.slice(m.index + tok.length);
        var why = aWhy(tok, pre, tail, owner, names);
        var tl = (tail.match(/^[ぁ-ん]{0,8}/) || [''])[0];
        if (why && (why === 'neg' || why === 'released') && !A_INJ.test(tok)) lastRel = Math.max(lastRel, c.at + m.index);   /* 「もう拘束されていない」= 今は解かれている */
        if (why) cut.push({ a: c.at + m.index, b: c.at + m.index + tok.length + tl.length, tok: tok, why: why });
        else if (!A_INJ.test(tok)) cut.push({ a: c.at + m.index, b: c.at + m.index + tok.length + tl.length, tok: tok, why: null, r: true });
      }
    });
    return { t: t, cut: cut, lastRel: lastRel };
  }
  function aApply(res, relCut, owner, log){
    var t = res.t; if (!res.cut) return { text: t, changed: false };
    var keep = [];
    res.cut.forEach(function(x){
      if (x.why) keep.push(x);
      else if (x.r && relCut >= 0 && x.a < relCut) keep.push({ a: x.a, b: x.b, tok: x.tok, why: 'after-release' });
    });
    if (!keep.length) return { text: t, changed: false };
    keep.sort(function(x, y){ return y.a - x.a; });
    var out = t, lastA = Infinity;
    keep.forEach(function(x){ if (x.b > lastA) return; out = out.slice(0, x.a) + out.slice(x.b); lastA = x.a; if (log) log.push({ n: owner, tok: x.tok, why: x.why }); });
    return { text: out, changed: out !== t };
  }
  function aGenericKizu(v){   /* STATE2（laneSCENE1）の st2Generic と同じ判定 */
    var x = str(v).replace(/[\s　・、。,，．.（）()「」\-ー―:：\/／]/g, '');
    if (!x) return false;
    x = x.replace(/(負傷|怪我|けが|ケガ|傷|手傷)/g, '').replace(/(している|してる|した|を負った|を負う|負った|あり|有り|がある|あるが|状態|中|多数|複数|軽度|軽傷|軽い|軽|重度|重傷|重い|重|浅い|浅|深い|深|小さな|小さい|小|大|未治療|治療済み|治療中|不明|ている|いる|ある|を|が|の|も|は)/g, '');
    return x === '';
  }
  function shadowOfA(store, overlay){
    var out = {}, changed = false, log = [];
    var src = store || {};
    var names = [heroName()].concat(otherNames());
    Object.keys(overlay || {}).forEach(function(n){ if (names.indexOf(n) < 0) names.push(n); });
    function clean(n, sTxt, oTxt){
      var rs = aClean(sTxt, n, names), ro = (oTxt != null) ? aClean(oTxt, n, names) : null;
      var sCut = -1, oCut = -1;
      if (ro && ro.lastRel >= 0){ sCut = Infinity; oCut = ro.lastRel; }
      else if (rs.lastRel >= 0){ sCut = rs.lastRel; }
      var a = aApply(rs, sCut === Infinity ? 1e15 : sCut, n, log), b = ro ? aApply(ro, oCut, n, log) : null;
      return { s: a.text, o: b ? b.text : null, ch: a.changed || (b ? b.changed : false) };
    }
    Object.keys(src).forEach(function(n){
      var e = src[n];
      if (!e || typeof e !== 'object'){ out[n] = e; return; }
      var copy = {};
      Object.keys(e).forEach(function(k){ copy[k] = e[k]; });
      var add = overlay && overlay[n];
      var c = clean(n, str(copy.karada), add ? add : null);
      if (c.ch){ changed = true; copy.karada = add ? (c.s + '。' + c.o) : c.s; }
      else if (add){ copy.karada = str(copy.karada) + '。' + add; }
      if (copy.kizu != null && aGenericKizu(copy.kizu)){ copy.kizu = ''; changed = true; log.push({ n: n, tok: 'kizu', why: 'generic' }); }
      out[n] = copy;
    });
    if (overlay){
      Object.keys(overlay).forEach(function(n){
        if (out[n]) return;
        var c = clean(n, '', overlay[n]);
        if (c.ch) changed = true;
        out[n] = { karada: c.ch ? c.o : str(overlay[n]), turn: -1 };
      });
    }
    _f333aLast = log;
    return { out: out, changed: changed };
  }

  /* ---- ラップ順の保証 ------------------------------------------------
     本 fix は **最外** でなければ意味が無い:
       ・fix379 keeper が外側にいると、fix414 の textFn が shadow の外で走る
       ・fix333 wrapBuild が外側にいると、compileActorStates が shadow の外で走る
     どちらも「ラップはするが効かない」という最悪の失敗の仕方をする。
     fix333 は setTimeout poll、fix379 は 2 秒 poll（`P.build.__f379` が消えていたら
     再ラップする watchdog 付き）で後から設置されるため、**両者が設置し終えるまで待つ**。
     本 fix は自分のラッパへ `__f379` を引き継ぐので、watchdog に再ラップされて
     外側を奪われることはない。 */
  var _lateWrap = false;
  var _real930 = null;
  /* ★F850ORD（laneF850・GPT #127-SS・候補）: 初期化順の確定。
     実測: fix192（新エンジン）は内側が作った sys を捨てて作り直し、その外側の keeper が【制約】を足し直す。
     本 fix が fix192 の「内側」に入ると、外側の keeper は shadow の外で fix414 を呼ぶ＝その回の描写を見ない【制約】になる。
     fix192 の最初の装着は読み込みの途中で外れ、2 秒ごとの見直しで付け直される。fix74／fix75 も後から包む。
     どれも自分の印（__v292…）が最上位に見えないあいだは「これから外側を包む」部品なので、
     読み込まれているのに印が見えないあいだは待つ（＝fix333・keeper と同じ待ち方を、fix192・fix74・fix75 にも広げるだけ）。
     待ちの上限は ORD_MAX_TRIES 回（250ms × 32 ＝ 約 8 秒）。超えたらこの待ちだけをやめ、従来の条件（fix333 と keeper）で包む。
     kill: localStorage v292DfixF850OrdOff='1' → この待ちをしない（従来と同じ）。新しい見張り・包み直し・保存・SYS の文面は足していない。 */
  var ORD_MAX_TRIES = 32;
  var _ordGaveUp = false, _ordWaited = 0;
  function ordOn(){ return ls('v292DfixF850OrdOff') !== '1'; }
  function ordWait(P){
    var w = [];
    try { if (G.__v292NewEngine && !P.build.__v292NewEngine) w.push('fix192'); } catch(e){}
    try { if (G.__v292Dfix74Active && !P.build.__v292Dfix74w) w.push('fix74'); } catch(e){}
    try { if (G.__v292Dfix75Active && !P.build.__v292Dfix75w) w.push('fix75'); } catch(e){}
    return w;
  }
  function depsReady(){
    try {
      var P = G.Planner;
      if (!P || typeof P.build !== 'function') return false;
      /* 当該 fix が「読み込まれているのに、まだラップしていない」間だけ待つ。
         未ロードの環境（harness 等）では待たない。 */
      if (G.__v292Dfix333 && !P.__fix333build) return false;
      if (G.__f379done && !P.build.__f379) return false;
      if (ordOn() && !_ordGaveUp && ordWait(P).length) return false;   /* ★F850ORD */
      return true;
    } catch(e){ return false; }
  }

  /* ---- Planner.build ラップ（最外・同期・try/finally で必ず復元） ---- */
  function wrap(){
    var P = null;
    try { P = G.Planner || (0, eval)('typeof Planner!=="undefined" ? Planner : null'); } catch(e){}
    if (!P || typeof P.build !== 'function') return false;
    if (P.build.__f850) return true;
    if (!depsReady() && !_lateWrap) return false;   /* 上流のラップ完了を待つ */

    var orig = P.build;
    var w = function(){
      if (!on()) return orig.apply(this, arguments);
      var prev = G.__v292Dfix77Store, swapped = false;
      _real930 = prev; /* ★fix930 c1: build 中の実 store（shadow ではない）を公開 */
      try {
        var ov = buildOverlay(arguments[1], arguments[0]);
        if (f333aOn()){
          /* ★F333a: overlay が無くても、実 store の語を外す必要があるときだけ swap する（何も外さなければ従来どおり） */
          var sa = null;
          try { sa = shadowOfA(prev, ov); } catch(eA){ sa = null; _f333aLast = [{ n: '', tok: '', why: 'err:' + (eA && eA.message) }]; }
          if (sa && (ov || sa.changed)){ G.__v292Dfix77Store = sa.out; swapped = true; }
          else if (!sa && ov){ G.__v292Dfix77Store = shadowOf(prev, ov); swapped = true; }
        } else if (ov){
          G.__v292Dfix77Store = shadowOf(prev, ov);
          swapped = true;
        }
      } catch(e){ try { console.warn(TAG, 'overlay err', e && e.message); } catch(_){} }
      try {
        return orig.apply(this, arguments);
      } finally {
        if (swapped){ G.__v292Dfix77Store = prev; }
        _real930 = null;
      }
    };
    /* 既存ラッパのマーカーを引き継ぐ。落とすと fix379 keeper 等が
       「未ラップ」と誤認して **本 fix の外側へ** 再ラップし、fix414 が
       shadow の外で走ってしまう（= 効かない）。 */
    try { for (var k in orig){ if (!(k in w)) w[k] = orig[k]; } } catch(e){}
    try { if (orig.__f379) w.__f379 = orig.__f379; } catch(e){}
    w.__f850 = true;
    P.build = w;
    try { console.log(TAG, 'build wrap installed'); } catch(e){}
    return true;
  }

  if (!wrap()){
    var tries = 0;
    var iv = setInterval(function(){
      tries++;
      /* ★F850ORD: 上限。超えたら fix192／fix74／fix75 の待ちだけをやめる（従来の条件で包む） */
      try { if (!_ordGaveUp && ordOn()){ var Pq = G.Planner; if (Pq && typeof Pq.build === 'function' && !Pq.build.__f850 && ordWait(Pq).length){ _ordWaited = tries; if (tries > ORD_MAX_TRIES){ _ordGaveUp = true; try { console.warn(TAG, 'F850ORD: gave up waiting for', ordWait(Pq).join(',')); } catch(_o){} } } } } catch(_q){}
      if (wrap()){ clearInterval(iv); return; }
      if (tries > 60){
        /* 15 秒待っても上流が揃わない異常系。ラップはするが **必ず記録を残す**
           （status().lateWrap===true なら「効いていない可能性がある」の意）。 */
        _lateWrap = true;
        wrap();
        clearInterval(iv);
        try { console.warn(TAG, 'late wrap: upstream wrappers not settled'); } catch(e){}
      }
    }, 250);
  }

  G.__v292Dfix850x = {
    status: function(){
      var P = null; try { P = G.Planner; } catch(e){}
      return {
        on: on(), off: off(),
        wrapped: !!(P && P.build && P.build.__f850),
        depsReady: depsReady(),
        lateWrap: _lateWrap,
        /* outermost: 自分のラッパが現在の Planner.build 本体であること */
        outermost: !!(P && P.build && P.build.__f850),
        upstream: { fix333Wrapped: !!(P && P.__fix333build), fix379Wrapped: !!(P && P.build && P.build.__f379) },
        /* ★F850ORD: on＝待ちが有効／waiting＝いま待っている相手／waited＝待った回数（250ms 単位）／gaveUp＝上限で待ちをやめた */
        ord: { v: 'f850ord-1', on: ordOn(), waiting: (function(){ try { return (P && typeof P.build === 'function') ? ordWait(P) : []; } catch(e){ return []; } })(), waited: _ordWaited, gaveUp: _ordGaveUp }
      };
    },
    overlayFor: function(playerText, mode){ return buildOverlay(playerText, mode); },
    _evidenceOnly: evidenceOnly,
    _stripQuoted: stripQuoted,
    lastOverlay: function(){ return _lastOverlay; },
    shadowOf: shadowOf,
    realStore: function(){ return _real930 || G.__v292Dfix77Store; },
    b1HOn: b1HOn,
    shadowOfA: shadowOfA,
    _heroName: heroName,
    _otherNames: otherNames
  };
  G.__v292DfixF333b = { v: 'f333b-20261111', on: f333bOn, stat: function(){ return JSON.parse(JSON.stringify(_f333bStat)); } };
  G.__v292DfixF333a = { v: 'f333a-20261111', on: f333aOn, last: function(){ return _f333aLast.slice(); },
    _clean: function(text, owner, names){ var r = aClean(text, owner, names || [owner]); return aApply(r, -1, owner, null).text; },
    _generic: aGenericKizu };
  try { console.log(TAG, 'loaded (on=' + (on() ? '1' : '0') + ')'); } catch(e){}
})();
