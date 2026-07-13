// =====================================================================
// Chronicle TRPG - v292Dfix439: 「展開の描写」を濃いまま読みやすくする（sys文字列置換）
// ---------------------------------------------------------------------
// 【おしんの報告】「展開の描写の文章が読みにくい。読んでて疲れる。
//   ライトユーザーも読みやすい文章にしたい」
//
// 【診断（実コードで確定・これが真因）】
//   1. v292Dfix192-newengine.js の EXAMPLES_LONG['koi']（トーン=濃 × 長さ=長文 のとき
//      sys へ丸ごと入る few-shot 見本）。few-shot はどんな訓戒文よりも強く文体を決める。
//      その見本自体が「長い修飾の入れ子・——の多用・体言止め・比喩の積み上げ」で書かれていた。
//   2. 同 fix192 の本文長さ指示「一つの場面を急がず…層を重ねて厚く描く」
//   3. features.js fix105 の「描写の濃さは保つ」「④文体：…濃い描写にする」
//   → 「濃く書け」が太く複数箇所、「読みやすく」は細く1箇所。綱引きで濃さが勝つ構造。
//
// 【GPT-5.6監査の結論（採用）】
//   「見本だけ替えれば十分ではない。『層を重ねて厚く』という本文指示も同時に直さないと競合する」
//   「読点は原因ではなく、長文・複数焦点の“兆候”」
//
// 【方針】濃さはゼロにしない。情報量は保ったまま、
//   ①一文あたりの情報密度を下げる ②修飾・比喩の積み重ねをやめる
//   ＝「濃いまま、一読で伝わる」。
//
// 【実装】既存ファイルは一切書き換えず、Planner.build ラップで【最終 sys に対する
//   文字列置換】として実現する（OFF で即座に元へ戻せる＝A/B比較が可能）。
//   - before は実コードから1文字違わずコピー（推測禁止）
//   - 置換できなかったら console.warn（サイレント失敗の防止。過去に「積んだ指示が
//     届いていなかった」事故がある＝プロンプト棚卸しPhase1のKI-11）
//   - after は before と同程度以下の長さ（keeper予算を増やさない。実測 純減 -37字）
//
// OFF   : localStorage.v292Dfix439Off === '1'（リロード不要の live 評価）
// 検証口: window.__v292Dfix439.status() / .lastSys() / .replacements() / .texts()
//
// ⚠️ ラッパー相互ダンス対策（fix419c の教訓）:
//    内側関数の own プロパティを全継承する ＋ 関数上フラグ ＋ 定期奪還 ＋ マーカー冪等。
// =====================================================================
(function v292Dfix439(){
  var W = (typeof window !== 'undefined') ? window : null;
  if (W && W.__v292Dfix439) return;
  if (W) W.__v292Dfix439 = true; /* 早期ガード。末尾でAPIオブジェクトに差し替える（どちらもtruthy＝冪等） */

  var OFF_KEY = 'v292Dfix439Off';

  function isOff(){
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return false;
      return localStorage.getItem(OFF_KEY) === '1';
    } catch(e){ return false; }
  }

  // ---------------------------------------------------------------
  // 置換テーブル（before は /tmp/chr の実コードから機械抽出したもの）
  //   probe = 「そのブロックが sys に居るか」の目印。
  //     probe が無い  → その置換は最初から対象外（例: 長さ=短/標準、トーン≠濃）→ warn しない
  //     probe が有る のに before が一致しない → 誰かが先に書き換えた → warn する
  // ---------------------------------------------------------------
  var PAIRS = [
    {
      key: 'len',
      note: 'fix192: 本文の長さ指示（長文モード）',
      probe: '本文は地の文と「」セリフで、10〜16文。',
      before: '本文は地の文と「」セリフで、10〜16文。一つの場面を急がず、情景→身体感覚→感情→行動の順に層を重ねて厚く描く。段落を分けてよい。ただし同じ内容の言い換え・繰り返しで水増ししない。',
      after:  '本文は地の文と「」セリフで、10〜16文。情景→身体感覚→感情→行動の順に場面を進める。一文一情報を基調とし、その瞬間に最も効く感覚と反応だけを選ぶ。修飾や比喩を積み重ねず、同じ内容の言い換え・繰り返しで水増ししない。段落を分けてよい。'
    },
    {
      key: 'density',
      note: 'fix105: 描写の濃さ指示',
      probe: '・描写の濃さ（五感・心理・具体）は保つ。',
      before: '・描写の濃さ（五感・心理・具体）は保つ。ただし描写を重ねることが目的化して話が止まらないように。「濃いまま止まらず前へ」。',
      after:  '・描写の濃さ（五感・心理・具体）は保つ。ただし一文に情報を詰め込まず、一文一情報を基調に、最も効く感覚と反応だけを選ぶ。修飾・比喩を積み重ねない。「濃いまま、一読で伝わる」。'
    },
    {
      key: 'tree',
      note: 'fix105: 優先順位ツリーの④文体',
      probe: '④文体：',
      before: '④文体：①〜③を満たした上で、五感と心理のある濃い描写にする。ただし一読で伝わることを優先し、凝った言い回しで②③を犠牲にしない。',
      after:  '④文体：①〜③を満たした上で、五感と心理のある具体的な描写にする。一読で伝わることを最優先し、一文一情報・比喩の積み重ねなしを守る。凝った言い回しで②③を犠牲にしない。'
    },
    {
      key: 'example',
      note: 'fix192: EXAMPLES_LONG[koi] ＝ few-shot 見本（★最重要）',
      probe: '─見本（長文・濃：',
      before: [
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
      after:  [
        '【書き方の見本（構造と密度と「長さ」の参考。内容はコピーせず、今の場面に合わせて作る。見本の雰囲気が今の物語のジャンルと違っても、ジャンルは今の物語に従う。長文モードでは、この見本くらいの長さで、この見本くらい短い一文で描く）】',
        '─見本（長文・濃：一文一情報。最も効く感覚と反応だけを選び、行動で前へ進める）─',
        '廊下は静かだった。静かすぎて、自分の鼓動が耳につく。主人公が踏み出すと、靴底の砂がざりと鳴った。',
        '匂いが先に来た。鉄錆の匂いだ。その奥に、饐えた甘さが混じっている。喉の奥が勝手に締まった。',
        '<say who="相手">……ねえ、明かり、少しだけ下げて</say>',
        '囁きなのに、声は廊下の奥まで届いた。主人公は懐中電灯の輪を床へ落とす。暗がりが天井まで立ち上がった。',
        '光の縁で、何かが動いた。振り戻すと、あるのは古い掲示板だけだ。剥がれかけた紙が、いま揺れを止めたように見えた。',
        '<say who="主人公">風……じゃないな。窓は全部閉まってる</say>',
        '<say who="相手">うん。さっき確かめた</say>',
        '相手が主人公の袖を、二本の指で摘んだ。子供のような掴み方だった。力は弱い。それでも振り払えなかった。',
        '突き当たりの扉が半開きだった。隙間の闇は、廊下のどの影より濃い。近づくほど空気が重くなる。皮膚が先に気づいて、二の腕が粟立った。',
        '<say who="相手">入るの？　……入るんだよね、あなたは</say>',
        '諦めと信頼が半分ずつ混じった声だった。主人公は答えない。扉の縁に手をかける。木は湿って柔らかく、指が沈んだ。',
        '扉が開いた。蝶番は鳴らない。その静けさが、いちばん嫌だった。',
        '懐中電灯の輪は、中の闇に呑まれて届かない。部屋の奥で衣擦れの音がした。こちらが足を止めた半拍あとに、その音も止まった。',
        '<say who="相手">いまの、私たちじゃない</say>',
        '<react who="相手" 反応="袖を摘んだ指が、布ごと握り込む" 声="<say who=\'相手\'>お願い、離れないで</say>"/>',
        '<state who="主人公" からだ="二の腕が粟立つ・扉の縁に手" こころ="恐怖と引き返せなさ" 本能="音の正体を見るまで動けない" 目的="部屋の奥を確かめる"/>',
        '<state who="相手" からだ="主人公の袖を握る・呼吸が浅い" こころ="恐怖が限界に近いが置いていかれる方が怖い" 本能="離れたくない" 関係="主人公:縋る" 未解決="進ませてしまった負い目"/>'
      ].join('\n')
    }
  ];

  // 直近の状態（検証口用）
  var _last = {
    sys: '',
    applied:  { len:false, density:false, tree:false, example:false },
    present:  { len:false, density:false, tree:false, example:false },
    missing:  [],
    off: false,
    at: 0
  };
  var _warned = {}; /* 同じ警告を毎ターン出さない */

  // ---------------------------------------------------------------
  // pure な置換関数（node テストはこれを直接叩く）
  // ---------------------------------------------------------------
  function rewrite(sys){
    if (typeof sys !== 'string' || !sys) return sys;

    var off = isOff();
    var applied = { len:false, density:false, tree:false, example:false };
    var present = { len:false, density:false, tree:false, example:false };
    var missing = [];

    if (off){
      _last = { sys:sys, applied:applied, present:present, missing:missing, off:true, at:(new Date()).getTime() };
      return sys; /* OFF は完全素通し */
    }

    var out = sys;
    for (var i=0; i<PAIRS.length; i++){
      var p = PAIRS[i];
      present[p.key] = (out.indexOf(p.probe) >= 0);

      if (out.indexOf(p.after) >= 0){
        applied[p.key] = true;    /* マーカー冪等: すでに置換済み（二重ラップ等） */
        continue;
      }
      if (out.indexOf(p.before) >= 0){
        out = out.split(p.before).join(p.after);
        applied[p.key] = true;
        continue;
      }
      /* before も after も無い。probe があるのに一致しない＝他fixが先に書き換えた疑い */
      if (present[p.key]) missing.push(p.key);
    }

    if (missing.length && W && W.console && W.console.warn){
      for (var j=0; j<missing.length; j++){
        var k = missing[j];
        if (_warned[k]) continue;
        _warned[k] = true;
        W.console.warn('[v292Dfix439] 置換できなかった: ' + k + '（' + pairOf(k).note +
          '）— sys に該当ブロックは在るが、期待した文字列と一致しない。他fixが先に書き換えた可能性。' +
          ' window.__v292Dfix439.texts() で期待値を確認、__v292Dfix439.lastSys() で実sysを確認のこと。');
      }
    }

    _last = { sys:out, applied:applied, present:present, missing:missing, off:false, at:(new Date()).getTime() };
    return out;
  }

  function pairOf(key){
    for (var i=0;i<PAIRS.length;i++){ if (PAIRS[i].key===key) return PAIRS[i]; }
    return { note:'?' };
  }

  // ---------------------------------------------------------------
  // Planner.build ラップ（最終 sys ＝ 全 extension/他wrap の後 に対して置換）
  //   ★ own プロパティ全継承（fix419c: 怠るとラッパー相互ダンスで全fixが壊れる）
  // ---------------------------------------------------------------
  // fix192 と同じ解決順（window.Planner → レキシカルの Planner）。
  // index.html の Planner はレキシカル宣言で window に載らないので両方見る。
  // .build を持つ方＝実際に組み立てている本体 を選ぶ。
  function getPlanner(){
    var cands = [];
    try { if (W && W.Planner) cands.push(W.Planner); } catch(e){}
    try { if (typeof Planner !== 'undefined' && Planner) cands.push(Planner); } catch(e){}
    for (var i=0; i<cands.length; i++){
      if (cands[i] && typeof cands[i].build === 'function') return cands[i];
    }
    return cands.length ? cands[0] : null;
  }

  function wrap(){
    var P = getPlanner();
    if (!P || typeof P.build !== 'function') return false;
    if (P.build.__v292Dfix439w) return true; /* 関数上フラグ（プロパティ継承されるので再ラップ検知に使える） */

    var orig = P.build;
    var wrapped = function(){
      var r = orig.apply(this, arguments);
      try {
        if (r && typeof r.sys === 'string') r.sys = rewrite(r.sys);
      } catch(e){
        try { if (W && W.console) W.console.warn('[v292Dfix439] rewrite失敗（素通し）:', e); } catch(e2){}
      }
      return r;
    };

    /* ★ 内側関数の own プロパティを全継承（他fixの関数上フラグを消さない） */
    try {
      Object.keys(orig).forEach(function(k){ wrapped[k] = orig[k]; });
    } catch(e){}
    wrapped.__v292Dfix439w = true;

    P.build = wrapped;
    return true;
  }

  /* 定期奪還: 他fixが古い build を復元/再ラップして我々が外れた場合に再装着。
     ★fix192 の再install（setInterval 2000ms）は bind() で own props を落とすため、
       我々の関数上フラグごと剥がれて sys を buildSys() で作り直す＝置換が消える。
       その時はこの奪還で最外へ戻る（自己治癒）。 */
  var _armed = false;
  function arm(){
    if (!W) return;
    wrap();
    if (_armed) return;   /* インターバルは1本だけ */
    _armed = true;
    try {
      W.setInterval(function(){
        var P = getPlanner();
        if (P && typeof P.build === 'function' && !P.build.__v292Dfix439w) wrap();
      }, 2000);
    } catch(e){}
  }

  if (W){
    if (W.document && W.document.readyState === 'loading'){
      try { W.document.addEventListener('DOMContentLoaded', arm); } catch(e){ arm(); }
    } else {
      arm();
    }
    /* Planner が後から生える経路（features.js の遅延初期化）にも追随 */
    try { W.setTimeout(arm, 0); W.setTimeout(arm, 1500); } catch(e){}
  }

  // ---------------------------------------------------------------
  // 検証口
  // ---------------------------------------------------------------
  var API = {
    rewrite: rewrite,
    /* どの置換が実sysに当たったか */
    status: function(){
      return {
        off: isOff(),
        applied: {
          len:     _last.applied.len,
          density: _last.applied.density,
          tree:    _last.applied.tree,
          example: _last.applied.example
        },
        present: {
          len:     _last.present.len,
          density: _last.present.density,
          tree:    _last.present.tree,
          example: _last.present.example
        },
        missing: _last.missing.slice(0),
        wrapped: (function(){ var P=getPlanner(); return !!(P && P.build && P.build.__v292Dfix439w); })(),
        at: _last.at
      };
    },
    lastSys: function(){ return _last.sys; },
    replacements: function(){
      var o = [];
      for (var i=0;i<PAIRS.length;i++){
        o.push({
          key: PAIRS[i].key,
          note: PAIRS[i].note,
          applied: !!_last.applied[PAIRS[i].key],
          present: !!_last.present[PAIRS[i].key],
          beforeLen: PAIRS[i].before.length,
          afterLen: PAIRS[i].after.length,
          delta: PAIRS[i].after.length - PAIRS[i].before.length
        });
      }
      return o;
    },
    texts: function(){
      var o = [];
      for (var i=0;i<PAIRS.length;i++){
        o.push({ key:PAIRS[i].key, note:PAIRS[i].note, probe:PAIRS[i].probe, before:PAIRS[i].before, after:PAIRS[i].after });
      }
      return o;
    },
    isOff: isOff,
    _pairs: PAIRS
  };

  if (W) W.__v292Dfix439 = API;
  /* node テスト用（ブラウザでは module 未定義なので無害） */
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
