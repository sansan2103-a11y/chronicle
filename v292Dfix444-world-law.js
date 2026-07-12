// =====================================================================
// Chronicle TRPG - v292Dfix444: 「世界の掟ディレクタ」
// ---------------------------------------------------------------------
// おしんと合意した方針(案B・2026-07-12):
//   「新しい伝承をその場で思いつかせるのではなく、すでに世界に埋め込まれた掟を
//     忘れさせない。」
//   fix442 が 🎲 空欄補完で世界観へ書き込んだ「掟(禁忌・条件・代償)」は、
//   正史として S.scene.lore / S.scene.cards[] に残る。ところがモデルは
//   物語中でそれを使わない・忘れる。fix444 はその掟を台帳化し、
//   毎ターン最小限だけ sys へ思い出させる。
//
// ★守る線(設計の核・ここを外したら fix423 の二の舞)
//   1. AIに「禁忌を破らせない」。発動するのは **プレイヤーが実際に破った／
//      条件を満たしたとき** だけ(INV-03 主人公の選択権)。
//   2. 発動時も「世界の側の出来事」として描かせる。主人公の決断・内面には
//      踏み込ませない。
//   3. 毎ターン最大1件・発動後は5ターンのクールダウン(内輪ネタ化の防止)。
//   4. 新しい掟をAIに作らせない(掟が増えるのは 🎲 と設定カードだけ)。
//   5. sys は 250字以内・追加APIコスト 0(抽出も判定も全てローカル)。
//
// ■ 保存
//   S.scene.laws[]  … 掟の台帳(既存セーブ機構にそのまま乗る。fix313 の
//                     S.scene.cards[] と同じ場所 = スロット分離・クラウド同期対応)
//   S.scene.lawT    … 台帳を最後に処理したターン数(状態機械のクロック)
//
// ■ sys注入
//   keeper (window.__f379reg) に prio2 で登録。marker=【世界の掟】。
//   ※ Planner._extensions は死に経路(fix313/366で実証済み)。使わない。
//   ※ text() は毎ターン評価される純関数。**台帳を1バイトも書き換えない**。
//
// ■ 台帳更新
//   S.save をラップし、**ターン確定後**にだけ実行(抽出→状態遷移→発動判定)。
//   ラッパーは内側関数の own props を全継承(fix419c 教訓)。
//
// 冪等: window.__v292Dfix444
// OFF : localStorage v292Dfix444Off='1'(live評価。注入も台帳更新も完全素通し)
// UI  : 作らない(不可視の自動化)。デバッグは window.__v292Dfix444.dump()
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix444) return;

  var TAG      = '[v292Dfix444:world-law]';
  var MARKER   = '【世界の掟】';
  var MAX_LAWS = 8;      // 台帳の上限
  var COOLDOWN = 5;      // 発動後、再発動を禁じるターン数
  var MAX_SYS  = 250;    // sys注入のハード上限(keeper予算 prio2/3 = 1600字の 15.6%)
  var LIM_TEXT = 32;     // law.text の上限
  var LIM_COND = 16;     // law.cond の上限
  var LIM_COST = 24;     // law.cost の上限
  var SHOW_IDLE = 2;     // 平常時に思い出させる掟の件数

  function off(){ try { return localStorage.getItem('v292Dfix444Off') === '1'; } catch(e){ return false; } }
  function getS(){ try { return window.S || (0,eval)('typeof S!=="undefined" ? S : null'); } catch(e){ return null; } }
  function trim(v){ return String(v == null ? '' : v).replace(/^[\s　]+|[\s　]+$/g, ''); }
  function clamp(s, n){ s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) : s; }
  function isArr(a){ return Object.prototype.toString.call(a) === '[object Array]'; }

  // ===================================================================
  // 語彙表
  // ===================================================================
  // 禁忌構文で使われる行為(辞書形)
  var TABOO_VERB_DIC = [
    '口に出す','口にする','話す','語る','唱える','見る','覗く','触れる','触る','叩く',
    '開ける','入る','近づく','振り返る','食べる','受け取る','名を呼ぶ','呼ぶ','数える','壊す','鳴らす'
  ];
  // て形(「〜てはいけない/ならない」用) → 辞書形
  var TABOO_VERB_TE = [
    ['口に出し','口に出す'],['口にし','口にする'],['話し','話す'],['語っ','語る'],['唱え','唱える'],
    ['覗い','覗く'],['触れ','触れる'],['触っ','触る'],['叩い','叩く'],
    ['開け','開ける'],['入っ','入る'],['近づい','近づく'],['振り返っ','振り返る'],
    ['食べ','食べる'],['受け取っ','受け取る'],['呼ん','呼ぶ'],['数え','数える'],['壊し','壊す'],['鳴らし','鳴らす'],['見','見る']
  ];
  // 行為キーの同義語(本文・入力からの検出用。表記ゆれを吸収する)
  var ACT_SYN = [
    { m: '口に',   s: ['口に出','口にし','口にす','口走','声に出','喋','しゃべ','囁','ささや','唱え','話し','話す','語る','語っ','言い触ら','言っ','言う','名を出'] },
    { m: '話',     s: ['話し','話す','語る','語っ','喋','しゃべ','口に出','口にし','囁','ささや'] },
    { m: '語',     s: ['語る','語っ','話し','話す','口に出','喋'] },
    { m: '唱',     s: ['唱え','詠唱','口に出','呟','つぶや'] },
    { m: '呼',     s: ['呼ぶ','呼ん','呼び','呼べ','名を呼','呼びかけ'] },
    { m: '見',     s: ['見る','見た','見て','見つめ','覗','のぞ','目にし','凝視','目を向け'] },
    { m: '覗',     s: ['覗','のぞ','見る','見た','見て'] },
    { m: '触',     s: ['触れ','触る','触っ','手を伸ば','掴','つか','撫で'] },
    { m: '叩',     s: ['叩','ノック','打ち鳴ら','打っ','打つ'] },
    { m: '開',     s: ['開け','開い','開く','開こ','こじ開'] },
    { m: '入',     s: ['入る','入っ','入り','立ち入','踏み入','足を踏み'] },
    { m: '近づ',   s: ['近づ','近寄','歩み寄'] },
    { m: '振り返', s: ['振り返','振りむ','振り向','後ろを見'] },
    { m: '食',     s: ['食べ','食う','食っ','口にし','頬張','飲み込'] },
    { m: '受け取', s: ['受け取','もらう','もらっ','貰','手に取'] },
    { m: '数え',   s: ['数え','数を','カウント'] },
    { m: '壊',     s: ['壊','割','砕'] },
    { m: '鳴',     s: ['鳴らし','鳴らす','鳴らそ'] },
    { m: '破',     s: ['破る','破っ','破り'] }
  ];
  // 「に」格を取る行為(「祭壇を触れる」のような非文を避ける)
  var NI_VERBS = ['触れる','近づく','入る'];
  function particleFor(verb){ return (NI_VERBS.indexOf(verb) >= 0) ? 'に' : 'を'; }

  // 条件-結果構文の「結果らしさ」ゲート(これが無ければ掟として採らない = 誤爆防止)
  var RESULT_SIG = [
    '必ず','決して','二度と','呪','祟','代償','報い','罰','禁','消え','失','帰れ','戻れ','戻らな',
    '連れ','現れ','見つか','見つけ','死','奪','入れ替わ','逆転','憑','増え','変わ','変え','なくなる',
    '出られ','抜け出せ','取り殺','引きずり','招','応え','応じ','数えられ','こちら側','向こう側','終わる','終わり'
  ];

  function hasAny(text, list){
    if (!text) return false;
    for (var i = 0; i < list.length; i++){ if (text.indexOf(list[i]) >= 0) return true; }
    return false;
  }

  // ===================================================================
  // 正規化・文分割
  // ===================================================================
  function norm(s){
    return String(s == null ? '' : s).replace(/　/g, ' ');
  }
  function sentences(s){
    var raw = norm(s).split(/[。\n\r！？!?]+/);
    var out = [], i, t;
    for (i = 0; i < raw.length; i++){
      t = trim(raw[i]);
      if (t) out.push(t);
    }
    return out;
  }

  // ===================================================================
  // キー導出(cond → 検出用キー)  pure
  //   cond '祭壇の噂を口に出す' → obj '祭壇の噂' / act '口に出す'
  //   objKeys = ['祭壇の噂','祭壇','噂'] / actKeys = ['口に出す','口に出'] + 同義語
  // ===================================================================
  function splitCond(cond){
    var c = trim(cond);
    var i = c.indexOf('を');
    if (i < 0) i = c.indexOf('に');
    if (i < 0) i = c.indexOf('へ');
    if (i <= 0) return { obj: '', act: c };
    return { obj: trim(c.slice(0, i)), act: trim(c.slice(i + 1)) };
  }
  function objKeysOf(obj){
    var out = [], i, p;
    if (!obj) return out;
    out.push(obj);
    var parts = obj.split(/[のっ・]/);
    for (i = 0; i < parts.length; i++){
      p = trim(parts[i]);
      if (p.length >= 2 && out.indexOf(p) < 0) out.push(p);
    }
    return out;
  }
  function actKeysOf(act){
    var out = [], i, j;
    if (!act) return out;
    out.push(act);
    var stem = act.replace(/(する|る|す|く|ぐ|つ|ぬ|ぶ|む|う)$/, '');
    if (stem.length >= 1 && out.indexOf(stem) < 0) out.push(stem);
    for (i = 0; i < ACT_SYN.length; i++){
      if (act.indexOf(ACT_SYN[i].m) < 0) continue;
      for (j = 0; j < ACT_SYN[i].s.length; j++){
        if (out.indexOf(ACT_SYN[i].s[j]) < 0) out.push(ACT_SYN[i].s[j]);
      }
    }
    return out;
  }
  function keysOf(cond){
    var sp = splitCond(cond);
    return { obj: objKeysOf(sp.obj), act: actKeysOf(sp.act) };
  }

  // ===================================================================
  // (1) extractLaws(loreText, cardTexts) — 掟の抽出(pure・追加APIコスト0)
  //     抽出できなければ空配列。無理に作らない。
  // ===================================================================
  function mkLaw(cond, cost, text, src){
    cond = clamp(trim(cond), LIM_COND);
    cost = clamp(trim(cost), LIM_COST);
    text = clamp(trim(text), LIM_TEXT);
    if (!cond || !text) return null;
    var k = keysOf(cond);
    // ★対象(obj)が取れない掟は採らない。行為語だけの掟は本文の何気ない一文に
    //   当たって誤爆する(例: cond='触れた' が「手が壁に触れた」で発動する)。
    if (!k.obj.length || !k.act.length) return null;
    return { text: text, cond: cond, cost: cost, keys: k, src: src || 'lore' };
  }

  // 禁忌ルールA: 「〜することを禁じられた『X』」(行為が先・対象が後)
  //   実例: 「学校では口に出すことを禁じられた『祭壇の噂』が囁かれている」
  var RE_A = new RegExp('(' + TABOO_VERB_DIC.join('|') + ')ことを(?:固く|決して)?(?:禁じ|禁止)(?:られた|られている|られる|られました|された|されている)?', '');
  // 禁忌ルールB: 「Xを〜てはいけない/ならない」(対象が先)
  var RE_B = new RegExp('([^、\\s「」『』]{1,16})(を|に|へ)(' + (function(){
    var a = [], i;
    for (i = 0; i < TABOO_VERB_TE.length; i++) a.push(TABOO_VERB_TE[i][0]);
    return a.join('|');
  })() + ')ては(?:いけない|ならない|ならぬ|いけません|なりません|駄目|ダメ)', '');
  // 禁忌ルールB2: 「Xを〜ることは禁じられている / 〜るのは禁止」
  var RE_B2 = new RegExp('([^、\\s「」『』]{1,16})(を|に|へ)(' + TABOO_VERB_DIC.join('|') + ')(?:ことは|ことが|のは|のが)(?:固く)?(?:禁じ|禁止|タブー|禁忌)', '');
  // 条件-結果ルールC
  var RE_C = /([^、\s「」『』]{2,18}?)(すると|すれば|したら|た者は|た者には|を破ると|[うくぐすつぬぶむる]と)、?([^、]{2,30})/;

  function objAfter(sent, from){
    var rest = sent.slice(from);
    var m = /[「『]([^」』]{1,16})[」』]/.exec(rest);
    if (m) return trim(m[1]);
    var m2 = /^\s*([^、。\s]{2,12}?)(?:が|は|を)/.exec(rest);
    return m2 ? trim(m2[1]) : '';
  }
  function objBeforeVerb(sent, verbIdx){
    var head = sent.slice(0, verbIdx);
    var m = /[「『]([^」』]{1,16})[」』][をにへ]?$/.exec(head);
    if (m) return trim(m[1]);
    var m2 = /([^、。\s「」『』]{1,14})[をにへ]$/.exec(head);
    return m2 ? trim(m2[1]) : '';
  }

  function pushLaw(out, seen, law){
    if (!law) return;
    if (seen[law.cond]) return;
    seen[law.cond] = 1;
    out.push(law);
  }

  function extractFromSentence(sent, src, out, seen){
    var m, obj, verb, cond, cost, i;

    // --- A: 「口に出すことを禁じられた『祭壇の噂』」
    m = RE_A.exec(sent);
    if (m){
      verb = m[1];
      obj  = objAfter(sent, m.index + m[0].length) || objBeforeVerb(sent, m.index);
      if (obj){
        cond = obj + particleFor(verb) + verb;
        pushLaw(out, seen, mkLaw(cond, '', cond + 'ことは禁じられている', src));
        return;
      }
    }

    // --- B2: 「祭壇に触れることは禁じられている」
    m = RE_B2.exec(sent);
    if (m){
      cond = trim(m[1]) + m[2] + m[3];
      pushLaw(out, seen, mkLaw(cond, '', cond + 'ことは禁じられている', src));
      return;
    }

    // --- B: 「鏡を叩いてはいけない」
    m = RE_B.exec(sent);
    if (m){
      verb = '';
      for (i = 0; i < TABOO_VERB_TE.length; i++){
        if (TABOO_VERB_TE[i][0] === m[3]){ verb = TABOO_VERB_TE[i][1]; break; }
      }
      if (verb){
        cond = trim(m[1]) + m[2] + verb;
        pushLaw(out, seen, mkLaw(cond, '', cond + 'ことは禁じられている', src));
        return;
      }
    }

    // --- C: 条件-結果(結果らしさゲートあり)
    m = RE_C.exec(sent);
    if (m){
      var head = trim(m[1]), conn = m[2], tail = trim(m[3]);
      if (!hasAny(tail, RESULT_SIG)) return;      // 結果らしさが無ければ掟にしない
      if (head.length < 2) return;
      var body;
      if (conn === 'すると' || conn === 'すれば' || conn === 'したら'){ cond = head + 'する'; body = cond + 'と' + tail; }
      else if (conn === 'た者は' || conn === 'た者には'){               cond = head + 'た';    body = head + 'た者は' + tail; }
      else if (conn === 'を破ると'){                                    cond = head + 'を破る'; body = cond + 'と' + tail; }
      else {                                                            cond = head + conn.charAt(0); body = cond + 'と' + tail; } // 「〜ると」等
      cost = tail;
      pushLaw(out, seen, mkLaw(cond, cost, body, src));
    }
  }

  function extractLaws(loreText, cardTexts){
    var out = [], seen = {}, i, j, ss;
    try {
      ss = sentences(loreText || '');
      for (i = 0; i < ss.length; i++) extractFromSentence(ss[i], 'lore', out, seen);
      var cards = cardTexts || [];
      for (i = 0; i < cards.length; i++){
        ss = sentences(cards[i] || '');
        for (j = 0; j < ss.length; j++) extractFromSentence(ss[j], 'card', out, seen);
      }
    } catch(e){ return out; }
    return out;
  }

  // ===================================================================
  // (2) detectTrigger(law, playerText, lastNarrative) — 発動判定(pure)
  //     'fire' = 実際に破られた/条件が満たされた(プレイヤー入力 or 直前の本文)
  //     'near' = 対象には触れているが行為はしていない(armed)
  //     ''     = 何もない
  //     ★「これから破らせる」判定は存在しない(INV-03)。既に起きたことだけを見る。
  // ===================================================================
  function detectIn(law, text){
    if (!law || !text) return '';
    var k = (law.keys && law.keys.act) ? law.keys : keysOf(law.cond || '');
    var objHit = k.obj.length ? hasAny(text, k.obj) : true;
    var actHit = k.act.length ? hasAny(text, k.act) : false;
    if (!k.obj.length){
      if (actHit && law.cond && text.indexOf(law.cond) >= 0) return 'fire';
      return '';
    }
    if (objHit && actHit) return 'fire';
    if (objHit) return 'near';
    return '';
  }
  function detectTrigger(law, playerText, lastNarrative){
    var a = detectIn(law, norm(playerText || ''));
    if (a === 'fire') return 'fire';                  // (1) プレイヤーが実際にやった(最優先)
    var b = detectIn(law, norm(lastNarrative || '')); // (2) 直前ターンの本文で実際に起きた
    if (b === 'fire') return 'fire';
    if (a === 'near' || b === 'near') return 'near';
    return '';
  }

  // ===================================================================
  // (3) 台帳(S.scene.laws) — 書き込みは S.save フックからのみ
  // ===================================================================
  var idSeq = 0;
  function newId(){ idSeq++; return 'l' + (Date.now()).toString(36) + idSeq.toString(36); }

  function ensureLaws(S){
    if (!S) return [];
    if (!S.scene) S.scene = {};
    if (!isArr(S.scene.laws)) S.scene.laws = [];
    return S.scene.laws;
  }
  function loreOf(S){ try { return (S && S.scene && S.scene.lore) ? String(S.scene.lore) : ''; } catch(e){ return ''; } }
  function cardsOf(S){
    var out = [], i, c;
    try {
      var cs = (S && S.scene && isArr(S.scene.cards)) ? S.scene.cards : [];
      for (i = 0; i < cs.length; i++){
        c = cs[i];
        if (c && c.entry && trim(c.entry)) out.push(String(c.entry));
      }
    } catch(e){}
    return out;
  }

  // 抽出結果を台帳へマージ(既存idは保持・同一condは更新しない)
  function mergeLaws(laws, found, turn){
    var i, j, have = {}, added = 0;
    for (i = 0; i < laws.length; i++){ if (laws[i] && laws[i].cond) have[laws[i].cond] = 1; }
    for (i = 0; i < found.length; i++){
      var f = found[i];
      if (!f || have[f.cond]) continue;
      have[f.cond] = 1;
      laws.push({
        id: newId(), text: f.text, cond: f.cond, cost: f.cost, keys: f.keys,
        src: f.src, t0: turn, state: 'idle', fired: 0, last: -1, fireTurn: -1
      });
      added++;
    }
    // 上限: 発動済みで古いものから溢れ落とす(いま fired 中のものは落とさない)
    if (laws.length > MAX_LAWS){
      var idx = [];
      for (i = 0; i < laws.length; i++) idx.push(i);
      idx.sort(function(a, b){
        var A = laws[a], B = laws[b];
        var af = (A.state === 'fired') ? 1 : 0, bf = (B.state === 'fired') ? 1 : 0;
        if (af !== bf) return af - bf;                                                  // fired中は最後
        if ((A.fired || 0) !== (B.fired || 0)) return (B.fired || 0) - (A.fired || 0);  // 発動回数が多い順
        return (A.t0 || 0) - (B.t0 || 0);                                               // 古い順
      });
      var kill = {}, over = laws.length - MAX_LAWS;
      for (j = 0; j < idx.length && over > 0; j++){ kill[idx[j]] = 1; over--; }
      var kept = [];
      for (i = 0; i < laws.length; i++){ if (!kill[i]) kept.push(laws[i]); }
      laws.length = 0;
      for (i = 0; i < kept.length; i++) laws.push(kept[i]);
    }
    return added;
  }

  // 状態機械(ターン確定後にのみ呼ぶ)
  //   idle → armed(対象に接近) → fired(実際に破られた) → cooldown → idle
  function stepStates(laws, turn, playerText, narrative){
    var i, L;

    // (a) 前ターンに発動したものを消費 → cooldown
    for (i = 0; i < laws.length; i++){
      L = laws[i];
      if (L && L.state === 'fired' && (L.fireTurn || 0) < turn) L.state = 'cooldown';
    }
    // (b) cooldown 満了 → idle
    for (i = 0; i < laws.length; i++){
      L = laws[i];
      if (L && L.state === 'cooldown' && (turn - (L.last || 0)) >= COOLDOWN) L.state = 'idle';
    }
    // (c) 発動判定(毎ターン最大1件)
    var best = null, bestScore = -1;
    for (i = 0; i < laws.length; i++){
      L = laws[i];
      if (!L || !L.cond) continue;
      if (L.state === 'cooldown' || L.state === 'fired') continue;   // クールダウン中は再発動しない
      var r = detectTrigger(L, playerText, narrative);
      if (r === 'fire'){
        var sc = (detectIn(L, norm(playerText || '')) === 'fire') ? 100 : 50; // 入力での発動を優先
        sc -= (L.fired || 0) * 5;
        if (sc > bestScore){ bestScore = sc; best = L; }
      } else if (r === 'near'){
        if (L.state === 'idle') L.state = 'armed';
      } else {
        if (L.state === 'armed') L.state = 'idle';
      }
    }
    if (best){
      best.state    = 'fired';
      best.fired    = (best.fired || 0) + 1;
      best.last     = turn;
      best.fireTurn = turn;
      try { console.log(TAG, 'law fired:', best.cond, '@turn', turn); } catch(e){}
    }
    return best;
  }

  // ===================================================================
  // (4) sys注入ブロック(keeper prio2 / 250字ハードガード) ★副作用なし
  //     命令形(破らせよ・発動させよ)は使わない。許可形・受動形のみ。
  // ===================================================================
  var GUARD   = '主人公に勝手に破らせない。';
  var HEAD_N  = '\n' + MARKER + 'この世界には掟がある: ';
  var TAIL_N  = '。掟は世界の側のルールであり、破られたときにだけ結果が返る。' + GUARD;
  var MINIMAL = '\n' + MARKER + 'この世界には掟がある。掟は世界の側のルールであり、破られたときにだけ結果が返る。' + GUARD;

  function firedText(L){
    var s = '\n' + MARKER + 'いま「' + L.cond + '」が破られた。掟「' + L.text + '」に従い、';
    if (L.cost) s += '代償（' + L.cost + '）や存在の反応を、';
    else        s += '代償や存在の反応を、';
    s += '世界の側の出来事として描いてよい。主人公の決断や内面は勝手に決めない。' + GUARD;
    return s;
  }
  function idleText(list){
    var i, items = [];
    for (i = 0; i < list.length; i++) items.push('「' + list[i].text + '」');
    var s = HEAD_N + items.join('') + TAIL_N;
    while (s.length > MAX_SYS && items.length > 1){
      items.pop();
      s = HEAD_N + items.join('') + TAIL_N;
    }
    if (s.length > MAX_SYS){
      var room = MAX_SYS - (HEAD_N.length + TAIL_N.length + 2);
      if (room >= 4 && list.length) s = HEAD_N + '「' + clamp(list[0].text, room) + '」' + TAIL_N;
      else s = MINIMAL;
    }
    return s;
  }

  // keeper が毎ターン呼ぶ。**台帳を書き換えない**(ドライラン汚染の防止)。
  function buildBlock(){
    try {
      if (off()) return '';
      var S = getS();
      if (!S || !S.scene || !isArr(S.scene.laws)) return '';
      var laws = S.scene.laws;
      if (!laws.length) return '';

      var i, L, fired = null, armed = [], idle = [], cool = [];
      for (i = 0; i < laws.length; i++){
        L = laws[i];
        if (!L || !L.text || !L.cond) continue;
        if (L.state === 'fired'){ if (!fired) fired = L; }
        else if (L.state === 'armed')    armed.push(L);
        else if (L.state === 'cooldown') cool.push(L);
        else                             idle.push(L);
      }
      var s;
      if (fired) s = firedText(fired);
      else {
        var pick = armed.concat(idle).concat(cool).slice(0, SHOW_IDLE);
        if (!pick.length) return '';
        s = idleText(pick);
      }
      if (s.length > MAX_SYS) s = MINIMAL;      // 最終防壁(必ず GUARD を含む短文へ)
      return s;
    } catch(e){ return ''; }
  }

  // ===================================================================
  // (5) 台帳の更新(S.save ラップ・ターン確定後)
  // ===================================================================
  var LAST = null;   // 直近の同期結果(デバッグ用)

  function syncLedger(){
    if (off()) return null;
    var S = getS();
    if (!S || typeof S !== 'object') return null;
    var laws = ensureLaws(S);
    var turn = (S.turns && S.turns.length) ? S.turns.length : 0;
    var lawT = (typeof S.scene.lawT === 'number') ? S.scene.lawT : -1;

    // (1) 抽出&マージ(毎save・冪等)
    var added = mergeLaws(laws, extractLaws(loreOf(S), cardsOf(S)), turn);

    // (2) ターンが進んだときだけ状態機械を回す
    var fired = null;
    if (turn > lawT){
      var t = (S.turns && S.turns.length) ? S.turns[S.turns.length - 1] : null;
      var pt = t ? (t.playerText || t.player || '') : '';
      var nr = t ? (t.narrative || '') : '';
      fired = stepStates(laws, turn, pt, nr);
      S.scene.lawT = turn;
    } else if (turn < lawT){
      S.scene.lawT = turn;      // undo等でターンが減った → クロックを戻すだけ
    }
    LAST = { turn: turn, added: added, fired: fired ? fired.cond : '', laws: laws.length };
    return LAST;
  }

  function armSave(){
    try {
      var S = getS();
      if (!S || typeof S.save !== 'function') return false;
      if (S.save.__f444) return true;
      var inner = S.save;
      var w = function(){
        try { syncLedger(); } catch(e){}      // ★ orig の前に更新 → 同じ書込に乗る
        return inner.apply(this, arguments);
      };
      try {
        var ks = Object.keys(inner);
        for (var i = 0; i < ks.length; i++){ try { w[ks[i]] = inner[ks[i]]; } catch(e2){} }
      } catch(e3){}                            // fix419c: own props 全継承
      w.__f444 = true;
      S.save = w;
      try { console.log(TAG, 'S.save wrapped'); } catch(e4){}
      return true;
    } catch(e){ return false; }
  }

  // keeper へ登録(prio2・marker冪等・OFFキーは keeper 側でも live 評価される)
  function armKeeper(){
    try {
      window.__f379reg = window.__f379reg || [];
      var reg = window.__f379reg, i;
      for (i = 0; i < reg.length; i++){ if (reg[i] && reg[i].marker === MARKER) return true; }
      reg.push({ off: 'v292Dfix444Off', marker: MARKER, prio: 2, text: buildBlock });
      try { console.log(TAG, 'keeper registered (prio2, <=' + MAX_SYS + ' chars)'); } catch(e){}
      return true;
    } catch(e){ return false; }
  }

  armKeeper();
  armSave();
  try { setInterval(function(){ try { armSave(); } catch(e){} }, 2000); } catch(e){}

  // ===================================================================
  // 検証口(冪等ガードを兼ねる)。UIは作らない。
  // ===================================================================
  window.__v292Dfix444 = {
    extractLaws: extractLaws,
    detectTrigger: detectTrigger,
    keysOf: keysOf,
    buildBlock: buildBlock,
    syncLedger: syncLedger,
    stepStates: stepStates,
    mergeLaws: mergeLaws,
    ensureLaws: ensureLaws,
    armSave: armSave,
    armKeeper: armKeeper,
    off: off,
    MARKER: MARKER,
    MAX_SYS: MAX_SYS,
    COOLDOWN: COOLDOWN,
    MAX_LAWS: MAX_LAWS,
    addLaw: function(text, cond, cost){       // 手動追加(UIなし・コンソール用)
      var S = getS(); if (!S) return null;
      var laws = ensureLaws(S);
      var law = mkLaw(cond, cost || '', text, 'manual');
      if (!law) return null;
      for (var i = 0; i < laws.length; i++){ if (laws[i].cond === law.cond) return laws[i]; }
      var turn = (S.turns && S.turns.length) ? S.turns.length : 0;
      var rec = { id: newId(), text: law.text, cond: law.cond, cost: law.cost, keys: law.keys,
                  src: 'manual', t0: turn, state: 'idle', fired: 0, last: -1, fireTurn: -1 };
      laws.push(rec);
      try { if (typeof S.save === 'function') S.save(); } catch(e){}
      return rec;
    },
    dump: function(){
      var S = getS();
      var laws = (S && S.scene && isArr(S.scene.laws)) ? S.scene.laws : [];
      var out = [], i, L;
      for (i = 0; i < laws.length; i++){
        L = laws[i];
        out.push({ id: L.id, text: L.text, cond: L.cond, cost: L.cost, src: L.src,
                   state: L.state, fired: L.fired, last: L.last, t0: L.t0 });
      }
      var blk = buildBlock();
      return { off: off(), lawT: (S && S.scene) ? S.scene.lawT : undefined,
               laws: out, sys: blk, sysLen: blk.length, last: LAST };
    }
  };
  try { console.log(TAG, 'loaded', off() ? '(OFF)' : '(ON)'); } catch(e){}
})();
