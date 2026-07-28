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

    /* (B) 語調崩壊型 */
    if (m.maxSentenceLen >= 120) hit('長すぎる文', 3, m.maxSentenceLen);
    else if (m.maxSentenceLen >= 80) hit('長すぎる文', 1, m.maxSentenceLen);
    if (m.avgSentenceLen >= 40) hit('平均文長', 2, m.avgSentenceLen);
    if (m.particleRate <= 7.5 && m.len >= 200) hit('助詞が少ない', 3, m.particleRate);

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
    return { metrics: m, cards: cards, score: j.score, hits: j.hits, suspect: j.score >= 5 };
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
      rows.push({ turn: k, score: r.score, cards: r.cards, suspect: r.suspect,
                  hits: r.hits.map(function (h) { return h.w; }) });
      if (r.suspect) suspects.push({ turn: k, score: r.score, hits: r.hits });
    }
    return { turns: turns.length, cardAvg: Math.round(cardAvg * 10) / 10,
             suspects: suspects.length, rows: rows, detail: suspects };
  }

  /* ★生存証明: 実データで確かめた4ターンの型を、代表的な文で再現する。
     ★崩壊2種を両方捕まえ、正常2種を両方通すこと（偽陰性と偽陽性の両方を固定する）。 */
  var FIX = {
    repLoop: '俺たち二台目――というよりも初代であろう――というよりもかつて' +
      'いっぱいいっぱいいっぱいいっぱいいっぱいいっぱいいっぱいいっぱいいっぱいいっぱい――、' +
      '《闇夜》だから？じゃあもう少し詳しいところ、《暗黒物質》？《そこ》？《あるべき姿》？' +
      'もうなんでも構わなくなっていました……本当ですか？はい！そうです！' +
      '私は俺たち彼女はいまここにあいつをもっと深遠なる領域《夜陰》とはまた別種だからして',
    registerCollapse: '私は両手同時存在証明のように、右半分挙上途中停止状態維持していて、' +
      '左胸近接保持封筒握り締めたままであり、対峙者側老眼鏡奥眼光固定不動維持、' +
      '書類載せ机脇置き続け姿勢変更一切確認されていない状態継続中であると言える状況において、' +
      '今私発しようとする問いかけそれ自体発生直前時点での出来事でありました為、' +
      '必然的に次なる事態発生順序確定されていく契機形成されていくものであったといっても過言ではないと考えられますため以下の通り推移致します',
    normalA: '「あ、うん。佐伯ミナ。ミナでいいよ」\n彼女は右手を軽く上げる。' +
      'グリスの残る指先が裸電球の灯りで鈍く光る。革ジャケット越しに冷えた空気が這う。' +
      'ミナの立つ奥から、ガレージに閉じ込められた埃と油と金属の匂いが流れてくる。鼻の奥がひりつく。' +
      'ミナは顎で受付机の方向をしゃくった。机の上では、源蔵が伝票を押さえながらペンを走らせている。',
    normalB: '火鉢の炭が、かすかに赤く息づいている。主人公はそのそばの座布団に腰を落とし、' +
      '手をかざしながら宿の主人を見上げた。主人は湯呑みを両手で包んだまま、一呼吸置いてから口を開く。' +
      '主人は視線を火鉢に落とす。炎ではなく、灰の中に何かを探すような目だった。' +
      '低く短く返すと、主人の指が湯呑みの縁をなぞった。'
  };

  function selfTest() {
    var a = scoreTurn({ narrative: FIX.repLoop, _convSays: [] }, { cardAvg: 4 });
    var b = scoreTurn({ narrative: FIX.registerCollapse, _convSays: [{ who: 'x', say: 'y' }] }, { cardAvg: 4 });
    var c = scoreTurn({ narrative: FIX.normalA, _convSays: [1, 2, 3, 4] }, { cardAvg: 4 });
    var d = scoreTurn({ narrative: FIX.normalB, _convSays: [1, 2, 3] }, { cardAvg: 4 });
    var detail = {
      repLoopScore: a.score, repLoopCaught: a.suspect,
      registerScore: b.score, registerCaught: b.suspect,
      normalAScore: c.score, normalAPassed: !c.suspect,
      normalBScore: d.score, normalBPassed: !d.suspect
    };
    var ok = detail.repLoopCaught && detail.registerCaught && detail.normalAPassed && detail.normalBPassed;
    return { ok: ok, detail: detail };
  }

  window.__v292Dfix624 = {
    measure: measure, judge: judge, scoreTurn: scoreTurn, sweep: sweep,
    selfTest: selfTest, _fixtures: FIX,
    stats: function () { return { disabled: off(), selfTestPassed: selfTest().ok }; }
  };
  try { console.log('[v292Dfix624] degeneration probe ready (read-only)'); } catch (e) {}
})();
