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
  /* ★fix934L（dark live 専用）: 指定 test story の document、かつ local opt-in があるときだけ fix934 を ON */
  function gate934(){ try{ var L='smuoxtxq7xm'; if(!/^[a-z0-9]{6,32}$/.test(L)) return false; var dk=window.__chronicleDocumentStoryKey, op=localStorage.getItem('v292Dfix934LiveStory'); return typeof dk==='string' && typeof op==='string' && op===L && dk===('chr6_slot_'+L); }catch(e){ return false; } }
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
  function attributeH(text, hero, others, push, src){
    var names = [hero].concat(others);
    str(text).split(/\n+/).forEach(function(para){
      var actor = null;
      para.split('。').map(function(x){ return x.trim(); }).filter(function(x){ return !!x; }).forEach(function(sent){
        var hits = [], i, n, at;
        for (i = 0; i < names.length; i++){
          n = names[i]; if (!n) continue;
          at = sent.indexOf(n);
          while (at >= 0){ hits.push({ at: at, n: n }); at = sent.indexOf(n, at + n.length); }
        }
        if (!hits.length){
          var mark = (src === 'player') ? HERO_MARK_P929 : HERO_MARK_N929;
          if (mark.test(sent)){ push(hero, sent); actor = hero; return; }
          if (src === 'narr' && actor){ push(actor, sent); }
          return;                                   /* actor 不明 = safe miss */
        }
        hits.sort(function(x, y){ return x.at - y.at; });
        if (!off934() && gate934()){
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
  function depsReady(){
    try {
      var P = G.Planner;
      if (!P || typeof P.build !== 'function') return false;
      /* 当該 fix が「読み込まれているのに、まだラップしていない」間だけ待つ。
         未ロードの環境（harness 等）では待たない。 */
      if (G.__v292Dfix333 && !P.__fix333build) return false;
      if (G.__f379done && !P.build.__f379) return false;
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
        if (ov){
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
        upstream: { fix333Wrapped: !!(P && P.__fix333build), fix379Wrapped: !!(P && P.build && P.build.__f379) }
      };
    },
    overlayFor: function(playerText, mode){ return buildOverlay(playerText, mode); },
    _evidenceOnly: evidenceOnly,
    _stripQuoted: stripQuoted,
    lastOverlay: function(){ return _lastOverlay; },
    shadowOf: shadowOf,
    realStore: function(){ return _real930 || G.__v292Dfix77Store; },
    b1HOn: b1HOn,
    _heroName: heroName,
    _otherNames: otherNames
  };
  try { console.log(TAG, 'loaded (on=' + (on() ? '1' : '0') + ')'); } catch(e){}
})();
