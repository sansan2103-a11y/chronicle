// =====================================================================
// Chronicle TRPG - v292Dfix624: 生成の**崩壊**を測る（★読み取り専用・第1段）
//
// ■なぜ必要か（2026-07-28・実データで判明）
//   削除予定だった物語 `smrnoszes2j`（6ターン）を消す前に中身を読んだところ、
//   **6ターン中2ターンが日本語として読めない文章**だった。
//   同じモデル・同じ設定で、残り4ターンは普通に良い。**崩れるときだけ全崩れする。**
//
//   ★そして重要なのは、その崩壊が**そのままプレイヤーに届いていた**こと。
//     fix427(出力の掃除) も fix80(生成ゲートの再試行) もあるのに素通りした。
//     話者の精度をいくら上げても、本文が読めないターンでは意味がない。
//
// ■崩壊は1種類ではない（★ここが肝）
//   (A) 反復ループ型 … 「いっぱい」12連発／意味のないルビ《》／人称が壊れる／自問自答
//   (B) 語調崩壊型   … 反復ゼロ・ルビゼロなのに、助詞が落ちた名詞連結の役所文になる
//   ★私が最初に作った「反復＋ルビ」だけの検出器は (B) を**正常と誤判定した**。
//     1つの指標で崩壊を捕まえようとしないこと。
//
// ■この層がやること / やらないこと
//   やる  : 1ターンの本文を測って、崩壊の疑いを**点数と内訳**で返す
//   やらない: 生成のやり直し、本文の書き換え、保存、DOM操作、localStorage への書込
//   ★第1段は**測るだけ**。fix606 と同じ作法で、まず分母と偽陽性を実測してから動かす。
//
// ■実測値（上の物語・4ターン）
//        最長文 4字反復 ルビ 読点率 助詞率 カード
//   T1崩壊  88    42     6   0.9   10.9   0
//   T2正常  46     0     0   3.4    9.5   6
//   T4正常  45     0     0   3.2   11.8   4
//   T6崩壊 166      0     0   1.6    6.2   1
//   → 読点率は 0.9/1.6 と 3.2/3.4 で分かれる。助詞率は (B) に効く。反復とルビは (A) に効く。
//   ★ただし4件は**根拠として弱すぎる**。閾値は全実データの偽陽性を見てから決める。
//
// ■読み出し
//   window.__v292Dfix624.measure(text)      … 1本の文字列を測る（純関数）
//   window.__v292Dfix624.scoreTurn(turn)    … 1ターンを測る（カード数も見る）
//   window.__v292Dfix624.sweep()            … いまの物語の全ターン
//   window.__v292Dfix624.selfTest()         … ★生存証明
//   OFF: localStorage `v292Dfix624Off='1'`
// =====================================================================
(function () {
  'use strict';
  if (window.__v292Dfix624) return;

  function off() { try { return localStorage.getItem('v292Dfix624Off') === '1'; } catch (e) { return false; } }

  function getS() {
    try { var a = window.__chronicleGetState ? window.__chronicleGetState('fix624') : null; if (a) return a; } catch (e) {}
    try { return window.S || (0, eval)('typeof S!=="undefined"?S:null') || null; } catch (e) { return null; }
  }

  /* 段落の配列にも文字列にも対応する。★fix606 と同じ抽出規則を使う（2箇所に書かない）。 */
  function textOf(v) {
    try {
      if (window.__v292Dfix606 && typeof window.__v292Dfix606.textOf === 'function')
        return window.__v292Dfix606.textOf(v);
    } catch (e) {}
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return v.map(function (e) {
      return typeof e === 'string' ? e : (e && (e.text || e.say)) || '';
    }).join('\n');
    return '';
  }

  /* タグとルビ以外の「地の文」に近い形へ寄せる。★本文は書き換えない（測るための一時値）。 */
  var SAY_TAG_RE = /<say\b[^>]*>([\s\S]*?)<\/say>/g;
  function stripTags(s) { return String(s || '').replace(SAY_TAG_RE, '$1').replace(/<[^>]{1,40}>/g, ''); }

  var JP_PARTICLE_RE = /[はがをにでとへもや]/g;
  var SENT_SPLIT_RE = /[。！？!?\n]/;

  /* ---------- 1本の文字列を測る（純関数・副作用なし） ---------- */
  function measure(raw) {
    var s = stripTags(raw);
    var out = {
      len: s.length, sentences: 0, avgSentenceLen: 0, maxSentenceLen: 0,
      ruby: 0, rep4: 0, repRate: 0, particleRate: 0, commaRate: 0, selfTalk: 0, personMix: 0
    };
    if (!s.length) return out;

    var parts = s.split(SENT_SPLIT_RE).filter(function (x) { return x.trim().length > 0; });
    out.sentences = parts.length;
    var total = 0, mx = 0;
    for (var i = 0; i < parts.length; i++) { total += parts[i].length; if (parts[i].length > mx) mx = parts[i].length; }
    out.avgSentenceLen = parts.length ? Math.round(total / parts.length) : 0;
    out.maxSentenceLen = mx;

    out.ruby = (s.match(/《[^》]{0,20}》/g) || []).length;

    /* 4文字窓の直後反復。「いっぱいいっぱい」型を数える。 */
    var rep = 0;
    for (var j = 0; j + 8 <= s.length; j++) if (s.substr(j, 4) === s.substr(j + 4, 4)) rep++;
    out.rep4 = rep;
    out.repRate = Math.round(1000 * rep / s.length) / 10;

    out.particleRate = Math.round(1000 * ((s.match(JP_PARTICLE_RE) || []).length) / s.length) / 10;
    out.commaRate = Math.round(1000 * ((s.match(/、/g) || []).length) / s.length) / 10;

    /* モデルが自分と喋り出す型（「本当ですか？ はい！ そうです！」） */
    out.selfTalk = (s.match(/(本当ですか|はい！|そうです！|でしょうか……|なんでも構わなく)/g) || []).length;

    /* 一人称の混在。★地の文に「俺」と「私」と「彼女」が同居するのは (A) の兆候 */
    var persons = ['俺', '私', '僕', 'わたし'].filter(function (p) { return s.indexOf(p) >= 0; });
    out.personMix = persons.length;

    return out;
  }

  /* ---------- 疑いの点数（★閾値はまだ暫定。実データの偽陽性を見て決める） ----------
     ★1つの指標で決めない。**独立に効く軸**を足し合わせ、内訳を必ず返す。 */
  function judge(m, cardCount, cardAvg) {
    var hits = [], score = 0;
    function hit(name, pts, detail) { hits.push({ w: name, pts: pts, detail: detail }); score += pts; }

    /* (A) 反復ループ型 */
    if (m.repRate >= 3) hit('反復', 3, m.repRate);
    else if (m.repRate >= 1) hit('反復', 1, m.repRate);
    if (m.ruby >= 3) hit('ルビ過多', 2, m.ruby);
    if (m.selfTalk >= 2) hit('自問自答', 2, m.selfTalk);
    if (m.personMix >= 2) hit('人称混在', 1, m.personMix);

    /* (B) 語調崩壊型
       ★★fix626（GPTの反証で判明）: 「意識の流れ」の一文が誤検出された。
         文が1〜2個しかない段落では **最長文と平均文長は同じ事実**であり、
         両方に加点するのは**同じ証拠の二重計上**だった。
         GPTの反証文（1文・115字・助詞17.2%）が、この二重計上で5点に達していた。 */
    var oneSentence = m.sentences <= 2;
    if (m.maxSentenceLen >= 120) hit('長すぎる文', 3, m.maxSentenceLen);
    else if (m.maxSentenceLen >= 80) hit('長すぎる文', 1, m.maxSentenceLen);
    if (m.avgSentenceLen >= 40 && !oneSentence) hit('平均文長', 2, m.avgSentenceLen);
    if (m.particleRate <= 7.5 && m.len >= 200) hit('助詞が少ない', 3, m.particleRate);

    /* ★fix626: 助詞が**多い**のは日本語として流暢な証拠。
       語調崩壊(B型)は助詞が落ちるのが本質なので、助詞が豊富なら
       「文が長い」だけで崩壊と言ってはいけない（実測: 崩壊側は 6.2〜10.9%）。 */
    if (m.particleRate >= 14) {
      for (var z = hits.length - 1; z >= 0; z--) {
        if (hits[z].w === '長すぎる文' || hits[z].w === '平均文長') { score -= hits[z].pts; hits.splice(z, 1); }
      }
      hits.push({ w: '(流暢なので長文減点を取消)', pts: 0, detail: m.particleRate });
    }

    /* 両方に効く */
    if (m.commaRate <= 2.0 && m.len >= 200) hit('読点が少ない', 2, m.commaRate);

    /* 会話カードの激減（★副次シグナル。単独では判定しない＝加点のみ） */
    if (cardAvg >= 2 && cardCount === 0) hit('カード0', 2, cardCount);
    else if (cardAvg >= 3 && cardCount <= 1) hit('カード激減', 1, cardCount);

    return { score: score, hits: hits };
  }

  function scoreTurn(turn, opts) {
    opts = opts || {};
    var body = textOf(turn && (turn.narrative)) || textOf(turn && turn.plan && turn.plan.narrative);
    var m = measure(body);
    var cards = (turn && turn._convSays && turn._convSays.length) || 0;
    var j = judge(m, cards, opts.cardAvg == null ? 0 : opts.cardAvg);
    /* ★★fix626（GPT裁定）: 1つの閾値で「疑い」と「処置」を兼ねてはいけない。
       誤検出のたびに60〜120秒の再生成が挟まると、崩壊そのものより体験を壊す。
         0〜3点 … 通常採用
         4〜6点 … soft（★記録だけ。再生成しない）
         7点以上 … hard（★ここだけ処置の対象）
       実測: 崩壊3件は 7/11/12点、正常側の最高は3点、GPTの反証文は5点＝soft に落ちる。 */
    var level = j.score >= 7 ? 'hard' : (j.score >= 4 ? 'soft' : 'ok');
    return { metrics: m, cards: cards, score: j.score, hits: j.hits,
             level: level, hard: level === 'hard', suspect: level === 'hard' };
  }

  /* =====================================================================
     ★fix627（GPT案②）: 意味レベルの崩壊のうち、**繰り返し**だけは安く測れる
     ---------------------------------------------------------------------
     GPT が挙げた「表面統計では捕まらない崩壊」のうち、
       ・同じ会話・場面を次ターンでも繰り返す
       ・1ターンの中で同じ文を逐語で繰り返す（実データのダッシュ乱用型がこれ）
     はLLM無しで測れる。文字n-gramの重なりを見るだけ。

     ★★ただし閾値はまだ決めない。**先に実データの自然な重なりを測る**。
       連続するターンは同じ宿・同じ人物を描くので、**正常でもある程度は重なる**。
       ここで勝手に閾値を決めると、正常な会話の続きを「繰り返し」と誤判定する。
       fix624 で「4〜6点が空」を確かめてから閾値を置いたのと同じ順序を守る。
     ===================================================================== */
  function ngrams(s, n) {
    var set = {}, t = String(s || '').replace(/\s+/g, '');
    if (t.length < n) return set;
    for (var i = 0; i + n <= t.length; i++) set[t.substr(i, n)] = 1;
    return set;
  }
  /* いまのターンの n-gram のうち、前ターンにも在る割合（＝現在が過去にどれだけ含まれるか）。
     ★Jaccard ではなく**含有率**にする。長さが違うターン同士で比べたいため。 */
  function containment(cur, prev, n) {
    n = n || 5;
    var a = ngrams(cur, n), b = ngrams(prev, n);
    var keys = Object.keys(a);
    if (!keys.length) return 0;
    var hit = 0;
    for (var i = 0; i < keys.length; i++) if (b[keys[i]]) hit++;
    return Math.round(1000 * hit / keys.length) / 10;
  }
  /* 1ターンの中で、同じ文が逐語で2回以上出るか（★実データのダッシュ乱用型がこれ）。 */
  function selfRepeat(s) {
    var parts = String(s || '').split(SENT_SPLIT_RE)
      .map(function (x) { return x.replace(/[\s　―—–─\-]/g, ''); })
      .filter(function (x) { return x.length >= 12; });
    var seen = {}, dup = 0, longest = 0;
    for (var i = 0; i < parts.length; i++) {
      if (seen[parts[i]]) { dup++; if (parts[i].length > longest) longest = parts[i].length; }
      seen[parts[i]] = 1;
    }
    return { dupSentences: dup, longestDup: longest };
  }
  /* 1ターン分の「繰り返し」指標。★点数には**まだ入れない**（測るだけ）。 */
  function repetitionOf(turn, prevTurn) {
    var cur = stripTags(textOf(turn && turn.narrative) || textOf(turn && turn.plan && turn.plan.narrative));
    var prev = prevTurn ? stripTags(textOf(prevTurn.narrative) || textOf(prevTurn.plan && prevTurn.plan.narrative)) : '';
    var sr = selfRepeat(cur);
    return {
      prevOverlap5: prev ? containment(cur, prev, 5) : null,
      prevOverlap8: prev ? containment(cur, prev, 8) : null,
      dupSentences: sr.dupSentences,
      longestDup: sr.longestDup
    };
  }

  /* いまの物語の全ターン。★読むだけ。 */
  function sweep() {
    if (off()) return { disabled: true };
    var s = getS(), turns = (s && s.turns) || [];
    var totalCards = 0, n = 0;
    for (var i = 0; i < turns.length; i++) {
      if (turns[i] && Array.isArray(turns[i]._convSays)) { totalCards += turns[i]._convSays.length; n++; }
    }
    var cardAvg = n ? totalCards / n : 0;
    var rows = [], suspects = [];
    for (var k = 0; k < turns.length; k++) {
      var r = scoreTurn(turns[k], { cardAvg: cardAvg });
      /* ★fix627: 繰り返しは**測るだけ**。点数には入れていない（閾値は実データを見てから）。 */
      var rep = repetitionOf(turns[k], k > 0 ? turns[k - 1] : null);
      rows.push({ turn: k, score: r.score, cards: r.cards, level: r.level,
                  hits: r.hits.map(function (h) { return h.w; }), rep: rep });
      if (r.hard) suspects.push({ turn: k, score: r.score, hits: r.hits, rep: rep });
    }
    return { turns: turns.length, cardAvg: Math.round(cardAvg * 10) / 10,
             hard: suspects.length, suspects: suspects.length, rows: rows, detail: suspects };
  }

  /* ★生存証明: 実データで確かめた4ターンの型を、代表的な文で再現する。
     ★崩壊2種を両方捕まえ、正常2種を両方通すこと（偽陰性と偽陽性の両方を固定する）。 */
  var FIX = {
    repLoop: '俺たち二台目――というよりも初代であろう――というよりもかつて' +
      'いっぱいいっぱいいっぱいいっぱいいっぱいいっぱいいっぱいいっぱいいっぱいいっぱい――、' +
      '《闇夜》だから？じゃあもう少し詳しいところ、《暗黒物質》？《そこ》？《あるべき姿》？' +
      'もうなんでも構わなくなっていました……本当ですか？はい！そうです！' +
      '私は俺たち彼女はいまここにあいつをもっと深遠なる領域《夜陰》とはまた別種だからして',
    /* ★fix626: ここは元々**実物を縮めた見本**にしていたが、縮めたせいで
       文の数が減り、実物とは別の点数（4点＝soft）になっていた。
       実物は7点＝hard。**見本を短くすると、守っているつもりの性質が守られなくなる。**
       → 実データの本文をそのまま使う。 */
    registerCollapse: '私は両手同時存在証明のように、右半分挙上途中停止状態維持していて、' +
      '左胸近接保持封筒握り締めたままであり、対峙者側老眼鏡奥眼光固定不動維持、' +
      '書類載せ机脇置き続け姿勢変更一切確認されていない。一方第三者隣立姿勢崩しかけており、' +
      '口元覆う手指降ろしかけてまた戻しかけ迷走中観測される最中のことであると言える状況において、' +
      '今私発しようとする問いかけそれ自体発生直前時点での出来事でありました為、' +
      '必然的に次なる事態発生順序確定されていく契機形成されていくものであったといっても過言ではないと考えられますため、以下の通り推移致します',
    normalA: '「あ、うん。佐伯ミナ。ミナでいいよ」\n彼女は右手を軽く上げる。' +
      'グリスの残る指先が裸電球の灯りで鈍く光る。革ジャケット越しに冷えた空気が這う。' +
      'ミナの立つ奥から、ガレージに閉じ込められた埃と油と金属の匂いが流れてくる。鼻の奥がひりつく。' +
      'ミナは顎で受付机の方向をしゃくった。机の上では、源蔵が伝票を押さえながらペンを走らせている。',
    normalB: '火鉢の炭が、かすかに赤く息づいている。主人公はそのそばの座布団に腰を落とし、' +
      '手をかざしながら宿の主人を見上げた。主人は湯呑みを両手で包んだまま、一呼吸置いてから口を開く。' +
      '主人は視線を火鉢に落とす。炎ではなく、灰の中に何かを探すような目だった。' +
      '低く短く返すと、主人の指が湯呑みの縁をなぞった。'
  };

  /* ★fix626: GPT の反証で「意識の流れ」が誤検出されたので、
     生存証明にも**通すべき文**として入れる（偽陽性を固定しないと、また同じ穴を空ける）。 */
  FIX.streamOfConsciousness =
    '私はまだここにいるはずだと考えるけれどここがどこなのかは分からないし彼女が私なのか' +
    '私が彼女なのかも分からないまま鏡の向こうで笑っている私を見ている彼女の目だけが' +
    'やけに鮮明でその瞬間だけ私は自分がもう戻れない場所へ来たのだと理解した。';
  FIX.tenseShortLines =
    '足音が止まった。\n灯りが消えた。\n誰も動かない。\n廊下の奥で何かが鳴った。\n近い。\n' +
    'また鳴る。\n今度は扉のすぐ向こうだ。\n澪は息を殺した。\n指先が冷たい。\n動けない。';

  function selfTest() {
    var a = scoreTurn({ narrative: FIX.repLoop, _convSays: [] }, { cardAvg: 4 });
    var b = scoreTurn({ narrative: FIX.registerCollapse, _convSays: [{ who: 'x', say: 'y' }] }, { cardAvg: 4 });
    var c = scoreTurn({ narrative: FIX.normalA, _convSays: [1, 2, 3, 4] }, { cardAvg: 4 });
    var d = scoreTurn({ narrative: FIX.normalB, _convSays: [1, 2, 3] }, { cardAvg: 4 });
    var e = scoreTurn({ narrative: FIX.streamOfConsciousness, _convSays: [] }, { cardAvg: 4 });
    var f = scoreTurn({ narrative: FIX.tenseShortLines, _convSays: [] }, { cardAvg: 4 });
    var detail = {
      repLoopScore: a.score, repLoopCaught: a.hard,
      registerScore: b.score, registerCaught: b.hard,
      normalAScore: c.score, normalAPassed: !c.hard,
      normalBScore: d.score, normalBPassed: !d.hard,
      /* ★意図的な文体は hard にしてはいけない（soft までは許す） */
      streamScore: e.score, streamNotHard: !e.hard,
      shortLinesScore: f.score, shortLinesNotHard: !f.hard
    };
    var ok = detail.repLoopCaught && detail.registerCaught &&
             detail.normalAPassed && detail.normalBPassed &&
             detail.streamNotHard && detail.shortLinesNotHard;
    return { ok: ok, detail: detail };
  }

  window.__v292Dfix624 = {
    measure: measure, judge: judge, scoreTurn: scoreTurn, sweep: sweep,
    ngrams: ngrams, containment: containment, selfRepeat: selfRepeat, repetitionOf: repetitionOf,
    selfTest: selfTest, _fixtures: FIX,
    stats: function () { return { disabled: off(), selfTestPassed: selfTest().ok }; }
  };
  try { console.log('[v292Dfix624] degeneration probe ready (read-only)'); } catch (e) {}
})();
