/* =====================================================================
 * v292DfixUNSEEN1-unseen-cast.js — UNSEEN1（2026-11-23・既定 OFF）
 * ---------------------------------------------------------------------
 * 未登場の登録人物を、sys の【キャラ属性】【口調】【話者】の 3 か所で、場にいる人と分けて渡す。
 *   背景: NAMEOWN1 の実 AI 16 本で、登録名の名乗りは全部 Q 型（まだ出ていない登録の女性がいる物語に、設定の近い新しい女性が出る型）。
 *         未登場の登録人物が、場にいる人と区別なく sys に並んでいた（SCENE1 a は【口調】を分けていなかった）。
 *   ・未登場の判定は SCENE1 a の appearance() をそのまま使う（fix95 の appeared 印・完全名・姓・名・別名・会話ログの話者・入力・舞台の説明）。
 *     SCENE1 の鍵とは別に動く（SCENE1 が OFF でも、この部品が ON なら分ける）。
 *   ・今回の入力: SCENE1 の begin は SCENE1 が OFF だと入力を覚えない。そこで begin/end を包んで入力だけ覚え、appearance(S, 入力) に渡す
 *     （利用者が入力で登場させた回から、その回の送信で場にいる側へ戻す＝1 ターンの遅れを作らない）。
 *   ・まだ本文が 1 ターンも無いとき（最初のターンの組み立て）は分けない（誰が場にいるかを本文から決められない＝今の動き）。
 *   ・【キャラ属性】: 場にいる人を今の書式で並べ、後ろに見出しを 1 つだけ付けて未登場の人（名前と確定した性別・年代）を並べる。
 *     見出しは「新しく出た人や場にいる人を、この人物として書かない」の趣旨だけ（その人物が物語に出てくること自体は止めない）。
 *   ・【口調】（fix377）: 未登場の人の行を外し、後ろに同じ見出しの短い形で「名前=一人称「…」」だけ（例文・登録の口調の文は渡さない）。
 *   ・【話者】（fix459 blockA の who の一覧）: 未登場の人を一覧から外し、かっこで同じ短い見出しの後ろに並べる。
 *   ・SCENE1 a の【呼称の固定】（fix445 lockSplit）は含めない（fix459 を止めたときにしか届かない）。b（退出）・c（前面）も含めない。
 * 鍵: ON v292DfixUNSEEN1On='1'（既定 OFF）。kill v292DfixUNSEEN1Off='1'（常に勝つ）。
 *     部分 OFF: v292DfixUNSEEN1SpkOff='1' で【話者】だけ今のまま（SCENE1 の比較で疑われたのが【話者】の一覧の分け方だったため・比べる用）。
 *     どれも呼ばれるたびに評価。OFF・kill のとき、呼ぶ側の結果は土台と 1 バイトも同じ（null を返すだけ）。
 * 書かないもの: localStorage・サーバー・S。stats は件数と字数の増減だけ（名前・本文は入れない）。
 * ===================================================================== */
(function (root) {
  'use strict';
  if (root.__v292DfixUNSEEN1) return;
  var VER = 'unseen1-20261123-r3';
  var HEAD = 'まだこの物語に登場していない人物（新しく出た人や場にいる人を、この人物として書かない）: ';   /* r2: r1 の「本文に出るまで場の人物として書かない」は、登録人物が自分から出てくることも止める（Q_OFF1 の灯里は T3 に AI が自分で出した） */
  var SHORT = 'まだ登場していない人物：';
  function ls(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } }
  function on() { return ls('v292DfixUNSEEN1Off') !== '1' && ls('v292DfixUNSEEN1On') === '1'; }
  function spkOn() { return on() && ls('v292DfixUNSEEN1SpkOff') !== '1'; }
  function getS() { try { return root.__chronicleGetState ? root.__chronicleGetState('unseen1') : (root.S || null); } catch (e) { return null; } }
  function str(x) { return x == null ? '' : String(x); }
  var ST = { attr: 0, voice: 0, speaker: 0, unseen: 0, back: 0, noTurns: 0, unknown: 0, sysDelta: { attr: 0, voice: 0, speaker: 0 }, errors: 0 };
  function err() { ST.errors++; }

  /* 今回の入力（SCENE1 の begin〜end の間だけ）。SCENE1 の begin は呼び出し元（index.html の TURN_BUILD）がそのまま呼ぶ。 */
  var CURT = null, LASTT = null;   /* r2: LASTT＝直前の組み立ての入力（同じターン数・60 秒以内だけ）。【話者】は組み立ての後で作られるため、これが無いと入力で登場させた回の【話者】だけ 1 ターン遅れた（Q_OFF3 T5 で実測） */
  function turnsLen() { try { var S = getS(); return S && Array.isArray(S.turns) ? S.turns.length : -1; } catch (e) { return -1; } }
  function curText() { if (CURT != null) return CURT; if (LASTT && Date.now() - LASTT.at < 60000 && LASTT.n === turnsLen()) return LASTT.t; return null; }
  function wrapBegin() {
    try {
      var Z1 = root.__v292DfixSCENE1; if (!Z1 || Z1.__u1w) return;
      var ob = Z1.begin, oe = Z1.end;
      if (typeof ob === 'function') Z1.begin = function (mode, text) { try { CURT = on() ? str(text) : null; LASTT = null; } catch (e) { CURT = null; } return ob.apply(this, arguments); };
      if (typeof oe === 'function') Z1.end = function () { try { if (CURT != null) LASTT = { t: CURT, n: turnsLen(), at: Date.now() }; CURT = null; } catch (e) {} return oe.apply(this, arguments); };
      Z1.__u1w = 1;
    } catch (e) { err(); }
  }
  wrapBegin();

  var PREV = null;   /* 直前の組み立てで未登場だった名前（場にいる側へ戻った数を数えるだけ） */
  /* 未登場の登録人物: { list: [npc], set: {name:1}, appeared, npcs } または null（分けない＝今のまま） */
  function unseen(S) {
    try {
      if (!on()) return null; S = S || getS(); if (!S || !S.cast || !Array.isArray(S.turns)) { ST.unknown++; return null; }
      var hasNarr = S.turns.some(function (t) { return t && str(t.narrative).trim(); });
      if (!hasNarr) { ST.noTurns++; return null; }
      var Z1 = root.__v292DfixSCENE1; if (!Z1 || typeof Z1.appearance !== 'function') { ST.unknown++; return null; }
      var A = Z1.appearance(S, curText()); if (!A) { ST.unknown++; return null; }
      var heroN = str(S.cast.hero && S.cast.hero.name).trim();
      var un = A.npcs.filter(function (n) { var k = n && n.name ? str(n.name).trim() : ''; return k && k !== heroN && !A.appeared[k]; });
      var set = {}; un.forEach(function (n) { set[str(n.name).trim()] = 1; });
      if (PREV) Object.keys(PREV).forEach(function (k) { if (!set[k]) ST.back++; }); PREV = set;
      if (!un.length) return null;
      return { list: un, set: set, appeared: A.appeared, npcs: A.npcs };
    } catch (e) { err(); return null; }
  }
  function confirmedSuffix(n) {   /* = SCENE1 a confirmedSuffix（性別・年代の確定値だけ） */
    var g = str(n.gender).trim(), a = '';
    try { var F = root.__v292DfixFLW4; if (F && typeof F.suffix === 'function') a = str(F.suffix(n)).replace(/^・/, ''); } catch (e) {}
    var p = [g, a].filter(Boolean); return p.length ? '(' + p.join('・') + ')' : '';
  }
  function delta(which, before, after) { try { ST.sysDelta[which] += (str(after).length - str(before).length); } catch (e) {} }

  /* fix379 genderBlock の代わり。before は今の文（字数の増減を数えるだけ）。null なら呼ぶ側は今のまま */
  function attrBlock(S, before) {
    try {
      S = S || getS(); var U = unseen(S); if (!U) return null;
      var parts = [], h = S.cast.hero, F = root.__v292DfixFLW4;
      if (h && h.gender && (h.name || '').length) parts.push(h.name + '(主人公)=' + h.gender);
      (S.cast.npcs || []).forEach(function (n) { if (n && n.name && n.gender && !U.set[str(n.name).trim()]) parts.push(n.name + '=' + n.gender + (F && typeof F.suffix === 'function' ? F.suffix(n) : '')); });
      var t = parts.length ? '\n【キャラ属性】' + parts.join('、') + '。各キャラの一人称・言葉遣い・地の文の代名詞(彼/彼女)は、この性別と人物像に必ず一致させる。' : '\n【キャラ属性】';
      t += HEAD + U.list.map(function (n) { return str(n.name).trim() + confirmedSuffix(n); }).join('、') + '。';
      ST.attr++; ST.unseen += U.list.length; if (typeof before === 'string') delta('attr', before, t); return t;
    } catch (e) { err(); return null; }
  }
  /* fix377 buildBlock 用: 名前 → true なら未登場（その行は外して tail に回す）。null なら分けない */
  function voiceSplit(S) {
    try { var U = unseen(S || getS()); if (!U) return null; return U.set; } catch (e) { err(); return null; }
  }
  function voiceTail(items) {   /* items: ['名前=一人称「私」', ...] */
    if (!items || !items.length) return ''; ST.voice++; return SHORT + items.join('、') + '。';
  }
  function noteVoice(before, after) { delta('voice', before, after); }
  /* fix459 blockA: '：' + 一覧 の部分を作る。null なら呼ぶ側は今のまま */
  function speakerList(cast) {
    try {
      if (!spkOn() || !Array.isArray(cast) || !cast.length) return null; var U = unseen(getS()); if (!U) return null;
      var a = [], u = []; cast.forEach(function (x) { if (U.set[str(x).trim()]) u.push(str(x).trim()); else a.push(x); });
      if (!u.length) return null;
      var before = '：' + cast.join('／'), after = (a.length ? '：' + a.join('／') : '') + '（' + SHORT + u.join('／') + '）';
      ST.speaker++; delta('speaker', before, after); return after;
    } catch (e) { err(); return null; }
  }

  root.__v292DfixUNSEEN1 = {
    VER: VER, on: on, spkOn: spkOn, unseen: unseen, attrBlock: attrBlock, voiceSplit: voiceSplit, voiceTail: voiceTail, noteVoice: noteVoice, speakerList: speakerList,
    status: function () { return { ver: VER, on: on(), spk: spkOn(), stats: JSON.parse(JSON.stringify(ST)) }; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
