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

    if (ptxt) attribute(ptxt, hn, others, push);
    if (narr) attribute(narr, hn, others, push);

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
    _heroName: heroName,
    _otherNames: otherNames
  };
  try { console.log(TAG, 'loaded (on=' + (on() ? '1' : '0') + ')'); } catch(e){}
})();
