/* =====================================================================
 * v292DfixSPKCHK1-speaker-check.js — 名札を本文と照らす（SPKCHK1・2026-11-22・既定 OFF）
 * ---------------------------------------------------------------------
 * ■なぜ: 実 AI の A/B（spknew1/realai_out）で、新しく出た女の子の台詞に登録の人物（本条ひなた）の札が付く誤りは
 *   AI の生の札の時点で起きていて、指示の直し（SPKNEW1）では減らなかった（OFF 1/3・ON 1/3）。
 *   GPT_127WR 裁定 2:「表示・話者割当に限って、根拠の無い登録名の名札を抑える小さな防御策は GO・名前があるだけで確定しない・循環させない」。
 * ■やること: AI の明示の札（sourceKind 'say-tag'）が登録人物 X のカードについて、同じターンの本文に
 *   「この台詞の話し手は X ではない」と言える強い根拠があり、X 側の根拠が 1 つも無いときだけ、
 *   そのカードの who を本文の呼び名（少女・女性・ミオ…）に替える（呼び名が取れなければ ???）。
 *   強い根拠（どれか 1 つ）:
 *     S1 台詞の直後（次の台詞まで）に「Y の声」／「Y は…言った・答えた」（Y は X ではない・未登録の呼び名）
 *        または直前の文が「Y は…言う／答える」で台詞へ続く
 *     S2 台詞の中身が X と別の名前の名乗り（「ミオだよ」）で、その名前が本文の地の文にも主語として出る
 *     S3 台詞の中で X を三人称・呼びかけで指す（「ひなたさん」「早瀬を知ってる」。『』の中は数えない）
 *   X 側の根拠（どれか 1 つでもあれば触らない）:
 *     P1 台詞の中身が X の名乗り（「私は本条ひなた」「ひなたです」）
 *     P2 直前・直後に X の発話の文（fix611 の直接発話・声の出所の判定）または「X の声」
 *     P3 直前の文の主語が X（「ひなたは…。「…」」）
 *   隣の文の主語が別の人というだけ（弱い根拠 1 つ）では替えない。
 * ■守ること: 本文は書き換えない・自動の名寄せや登録はしない・保存するのは今の話者の欄（who）だけ。
 *   新ターンの確定時に fix620 の突き合わせ（fix611 の門）の後で 1 回だけ。人手の訂正（SFL1）は触らない。
 *   替えたカードは fix620 の過去の直し・fix469・fix66・fix383・fix29 の表示の書き換えが元の札へ戻さないよう、
 *   SFL1 の protects()/protectsCard() の判定に「SPKCHK1 が同じ本文から同じ答えを出すカード」を足す（ON のときだけ。
 *   印は保存しない＝毎回同じ本文から計算し直す）。
 * ■鍵: v292DfixSPKCHK1On='1'（既定 OFF）・kill v292DfixSPKCHK1Off='1'（常に勝つ）。OFF・kill は 1 字も変えない。
 * ■診断: window.__v292DfixSPKCHK1.stats() / .analyze(narrative, cards, meta, cast, hero)
 * ===================================================================== */
(function (root) {
  'use strict';
  if (!root || root.__v292DfixSPKCHK1) return;
  var VER = 'spkchk1-20261122-r1';
  var ST = { turns: 0, flipped: 0, kept: {}, errors: 0, guard: 0 };
  function lsg(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } }
  function on() { return lsg('v292DfixSPKCHK1Off') !== '1'; }   /* 20261123: 全員 既定 ON（実 AI 10 本で誤った付け替え 0）。止めるのは kill v292DfixSPKCHK1Off='1' */
  function g611() { try { return root.__v292Dfix611 || null; } catch (e) { return null; } }
  function esc(s) { return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function nrm(s) { return String(s == null ? '' : s).replace(/[\s　・]/g, ''); }
  function loose(s) { return String(s || '').replace(/[\s　。、．，,.・…‥—―–‐－\-〜～！？!?「」『』（）()【】“”"'’‘<>]/g, ''); }
  function kept(k) { ST.kept[k] = (ST.kept[k] || 0) + 1; }

  /* ---------- 名前の形（フルネーム・空白区切りの部分・本文に出る名字／名前の前後の部分） ---------- */
  var PART_AFTER = '(?:は|が|の|も|を|に|と|へ|や|で|だ|じゃ|さん|ちゃん|くん|君|先輩|様|、|。|…|！|？|—|―)';
  function formsOf(name, cast, text) {
    var full = nrm(name); if (!full) return [];
    var out = [full], C = (cast || []).map(nrm).filter(Boolean);
    function uniq(q) { var h = 0; for (var i = 0; i < C.length; i++) if (C[i].indexOf(q) >= 0) h++; return h <= 1; }
    var n1 = false; try { n1 = lsg('v292DfixNAME1CHOff') !== '1'; } catch (eN1) {}   /* ★NAME1CH: 「霧島 冴」の「冴」は、本文に 直前が漢字でない・直後が助詞や敬称 の形で出ているときだけ名前の形に数える */
    var ps0 = String(name).split(/[\s　・]+/).filter(Boolean);
    ps0.forEach(function (p) { var q = nrm(p); if (q !== full && uniq(q) && out.indexOf(q) < 0 && (q.length >= 2 || (n1 && ps0.length === 2 && /^[一-鿿々ぁ-んァ-ヶー]$/.test(q) && new RegExp('(^|[^一-鿿々])' + esc(q) + PART_AFTER).test(String(text || ''))))) out.push(q); });
    if (out.length === 1 && full.length >= 3) {
      for (var L = 2; L <= full.length - 1; L++) {
        [full.slice(0, L), full.slice(full.length - L)].forEach(function (q) {
          if (out.indexOf(q) >= 0 || !uniq(q)) return;
          if (new RegExp(esc(q) + PART_AFTER).test(text)) out.push(q);
        });
      }
    }
    return out.sort(function (a, b) { return b.length - a.length; });
  }
  function allForms(cast, text) { var o = []; (cast || []).forEach(function (c) { formsOf(c, cast, text).forEach(function (f) { if (o.indexOf(f) < 0) o.push(f); }); }); return o; }

  /* ---------- 本文の台詞の位置（「」の最上位だけ。中の『』は台詞の中身として扱う） ---------- */
  function quotesOf(narr) {
    var q = [], s = String(narr || ''), depth = 0, st = -1;
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (ch === '「') { if (depth === 0) st = i; depth++; }
      else if (ch === '」' && depth > 0) { depth--; if (depth === 0 && st >= 0) { q.push({ s: st, e: i + 1, body: s.slice(st + 1, i) }); st = -1; } }
    }
    return q;
  }
  function lastSentence(t) {
    t = String(t || '').replace(/\s+$/, '');
    var parts = t.split(/(?<=[。！？!?])|\n/);
    for (var i = parts.length - 1; i >= 0; i--) { var p = parts[i].replace(/^[\s　]+/, ''); if (p) return p; }
    return '';
  }

  /* ---------- 本文の呼び名（未登録の人） ---------- */
  var ROLE = '(?:少女|少年|女の子|男の子|女性|男性|老人|老婆|老女|老爺|青年|子ども|子供|人影|若い女|若い男|見知らぬ女|見知らぬ男)';
  function labelsIn(text, castForms) {
    var out = [], t = String(text || '');
    var re = new RegExp(ROLE + '(?=は|が|の|も|を|に|と|、)', 'g'), m;
    while ((m = re.exec(t))) if (out.indexOf(m[0]) < 0) out.push(m[0]);
    var rk = /([ァ-ヶー]{2,6})(?=は|が|の声|の目|の肩|の手|さん|ちゃん|くん|、)/g;
    while ((m = rk.exec(t))) {
      var k = m[1]; if (/^ー/.test(k) || out.indexOf(k) >= 0) continue;
      var isCast = castForms.some(function (f) { return f.indexOf(k) >= 0 || k.indexOf(f) >= 0; });
      if (!isCast) out.push(k);
    }
    return out;
  }
  function isFormOf(tok, forms) { return forms.some(function (f) { return f === tok; }); }

  /* ---------- 証拠 ---------- */
  var SPEECH = '(?:言っ|言う|言い(?!かけ)|告げ|答え|尋ね|訊ね|訊い|問う|問い返|叫|囁|ささや|呟|つぶや|付け足|付け加|切り出)';
  function speechBy(text, tok) {                     /* 文の中で tok が主語の発話 */
    var t = String(text || '').replace(/[\s　]/g, ''), n = esc(tok);
    if (!t || !n) return null;
    var g = g611();
    if (g && typeof g.directSpeechEvidence === 'function') { try { var r = g.directSpeechEvidence(t, tok); if (r) return r.type; } catch (e) {} }
    if (g && typeof g.voiceSourceEvidence === 'function') { try { var v = g.voiceSourceEvidence(t, tok); if (v) return v.type; } catch (e) {} }
    var m = t.match(new RegExp('(?:^|[。、」])' + n + '[はがも][^。「]{0,14}?' + SPEECH));
    if (m && !/(?:ない|なかった|ず)/.test(t.slice(m.index + m[0].length, m.index + m[0].length + 4))) return 'speech';
    return null;
  }
  /* 「Y の声は／も／に」＝いま聞こえた声の説明・反応。「Y の声が」は次の台詞を導くことがあるので、後ろにまだ地の文があるときだけ。「Y の声で」は数えない */
  function voiceOf(text, tok) {
    var t = String(text || '').replace(/[\s　]/g, '');
    var re = new RegExp('(?:^|[^ぁ-んァ-ヶー一-龥])' + esc(tok) + 'の(?:声|囁き|呟き)(は|も|に|が)'), m = t.match(re);
    if (!m) return false;
    if (m[1] !== 'が') return true;
    var rest = t.slice(m.index + m[0].length), k = rest.indexOf('。');
    return k >= 0 && rest.slice(k + 1).length > 0;
  }
  /* 文の最初の人の主語（候補の呼び名・名前の形のうち、文頭か読点の後で「は／が／も」が付くもの） */
  function firstSubject(sentence, toks) {
    var t = String(sentence || '').replace(/^[\s　]+/, ''), best = null, bi = 1e9;
    toks.forEach(function (k) { var m = t.match(new RegExp('(?:^|、)(?:[^。、「]{0,8}の)?' + esc(k) + '(?:の(?:肩|手|指|目|視線|顔|唇|声|背中|体)(?:は|が|も)|は|が|も)')); if (m && m.index < bi) { bi = m.index; best = k; } });
    return best;
  }
  /* 「A と B は／が」の並んだ主語（中に入っている名前の一覧。無ければ null） */
  function coSubjects(sentence, toks) {
    var t = String(sentence || '').replace(/^[\s\u3000]+/, '');
    var m = t.match(/^(?:[^。、「]{0,12}、)?([^。、「]{1,24}?)(?:は|が|も)/); if (!m || m[1].indexOf('と') < 0) return null;
    var got = toks.filter(function (k) { return m[1].indexOf(k) >= 0; });
    return got.length >= 2 || (got.length === 1 && /と/.test(m[1])) ? got : null;
  }
  function sentencesOf(t) { return String(t || '').split(/(?<=[。！？!?])|\n/).map(function (x) { return x.replace(/^[\s　]+/, ''); }).filter(Boolean); }
  function subjectOf(sentence, tok) {
    var t = String(sentence || '').replace(/^[\s　]+/, '');
    return new RegExp('^(?:[^。、「]{0,8}の)?' + esc(tok) + '(?:は|が|も)').test(t);
  }
  function stripInner(body) { return String(body || '').replace(/『[^』]*』/g, '').replace(/「[^」]*」/g, ''); }
  var SELF_HEAD = '(?:^|[、。…！？!?\\s　])(?:(?:私|わたし|あたし|僕|ぼく|俺|おれ|うち)(?:は|、|の名前は)?)?';
  var SELF_TAIL = '(?:だよ|です|っていいます|って言います|といいます|と申します|っていうの|だ。|。|！)';
  function selfIntro(body, tok) {
    var b = stripInner(body);
    var m = b.match(new RegExp(SELF_HEAD + esc(tok) + SELF_TAIL));
    if (!m) return false;
    var after = b.slice(m.index + m[0].length, m.index + m[0].length + 6);
    if (/^(?:って言っ|と言っ|か[？?]|よね|って|さん|ちゃん)/.test(after)) return false;
    return true;
  }
  function thirdPerson(body, tok) {                   /* 台詞の中で tok を他人として指す */
    var b = stripInner(body);
    /* ★自分の名前を三人称で言う話し方（「ひなたは平気」「ひなたのこと」）は数えない。敬称・呼び捨ての問い（「早瀬を知って」）・「…って人」だけ */
    return new RegExp(esc(tok) + '(?:さん|ちゃん|くん|君|先輩|様|を(?:知|探|呼|見かけ|待)|って人|という人|っていう人)').test(b);
  }

  /* =====================================================================
     analyze: 純関数。返り値 [{ci, act:'flip'|'keep', why, from, to}]
     ===================================================================== */
  function analyze(narr, cards, meta, cast, hero) {
    var res = [];
    narr = String(narr || ''); cards = Array.isArray(cards) ? cards : []; cast = (cast || []).filter(Boolean);
    var flat = narr;
    var Q = quotesOf(narr);
    var castForms = allForms(cast, flat);
    var labels = labelsIn(narr.replace(/「[^」]*」/g, '。'), castForms);
    for (var ci = 0; ci < cards.length; ci++) {
      var c = cards[ci]; if (!c) continue;
      var X = String(c.who || '');
      var m = Array.isArray(meta) && meta.length === cards.length ? meta[ci] : null;
      function keep(w) { res.push({ ci: ci, act: 'keep', why: w, from: X }); }
      if (!m || m.sourceKind !== 'say-tag') { keep('not-say-tag'); continue; }
      if (cast.map(nrm).indexOf(nrm(X)) < 0) { keep('not-registered'); continue; }
      if (m.sourceWhoRaw != null && nrm(m.sourceWhoRaw) !== nrm(X)) { keep('who-not-tag'); continue; }
      var key = loose(c.say); if (!key) { keep('empty'); continue; }
      var hits = []; for (var qi = 0; qi < Q.length; qi++) if (loose(Q[qi].body) === key) hits.push(qi);
      if (hits.length !== 1) { keep(hits.length ? 'quote-not-unique' : 'quote-not-found'); continue; }
      var qi0 = hits[0], q = Q[qi0];
      var preStart = qi0 > 0 ? Q[qi0 - 1].e : 0;
      var preSents = sentencesOf(narr.slice(preStart, q.s));
      if (qi0 > 0 && preSents.length && /^[とって]/.test(preSents[0])) preSents.shift();   /* 前の台詞に付く「…と X は言った」は前の台詞のもの */
      var pre = preSents.length ? preSents[preSents.length - 1] : '';
      var hasNext = qi0 + 1 < Q.length;
      var post = narr.slice(q.e, Math.min(hasNext ? Q[qi0 + 1].s : narr.length, q.e + 200));
      var postSents = sentencesOf(post);
      var xf = formsOf(X, cast, flat);
      var others = labels.filter(function (y) { return !isFormOf(y, xf) && castForms.indexOf(y) < 0; });
      var subjToks = castForms.concat(others);
      var preSubj = null;
      for (var ps = preSents.length - 1; ps >= 0 && !preSubj; ps--) {
        var co = coSubjects(preSents[ps], subjToks);
        if (co) { preSubj = co.some(function (k) { return isFormOf(k, xf); }) ? xf[0] : '*'; break; }   /* 並んだ主語は「誰か 1 人」に決めない（X が入っていれば X 側） */
        preSubj = firstSubject(preSents[ps], subjToks);
      }
      var post1Subj = postSents.length ? firstSubject(postSents[0], subjToks) : null;
      var isHero = nrm(hero) && nrm(X) === nrm(hero);

      /* X 側の根拠（1 つでもあれば触らない） */
      var pro = null;
      for (var a = 0; a < xf.length && !pro; a++) {
        if (selfIntro(q.body, xf[a])) pro = 'P1-self-intro';
        else if (speechBy(pre, xf[a]) || speechBy(post, xf[a])) pro = 'P2-x-speech';
        else if (voiceOf(post, xf[a])) pro = 'P2-x-voice';
      }
      /* 台詞のすぐ後ろの「…と Y が言った」は直前の主語（P3）より強い。P1・P2 があればそれでも触らない */
      var trailY = null;
      if (!pro && postSents.length && /^[とって]/.test(postSents[0])) for (var ty = 0; ty < others.length && !trailY; ty++) if (speechBy(postSents[0], others[ty])) trailY = others[ty];
      if (!pro && !trailY && preSubj && isFormOf(preSubj, xf)) pro = 'P3-x-subject-before';
      if (pro) { keep(pro); continue; }
      var xAfter = !!(post1Subj && isFormOf(post1Subj, xf));

      /* X ではない根拠 */
      var ev = null, to = null, w1why = null;
      if (trailY) { ev = 'S1-y-speech-after'; to = trailY; }
      for (var b = 0; b < others.length && !ev; b++) {
        var y = others[b];
        if (voiceOf(post, y)) { ev = 'S1-y-voice-after'; to = y; break; }
        if (xAfter) continue;
        for (var sj = 0; sj < postSents.length && !ev; sj++) {
          var lastBeforeNext = hasNext && sj === postSents.length - 1;
          if (/^[とって]/.test(postSents[sj]) && sj === 0 && speechBy(postSents[sj], y)) { ev = 'S1-y-speech-after'; to = y; }
          else if (new RegExp('(?:言い終え|そう言っ|言いかけ|言葉を切)').test(postSents[sj]) && firstSubject(postSents[sj], subjToks) === y && sj === 0) { ev = 'S1-y-said-after'; to = y; }
          else if (!lastBeforeNext && sj === 0 && speechBy(postSents[sj], y)) { ev = 'S1-y-speech-after'; to = y; }
        }
        if (!ev && pre && speechBy(pre, y) && /(?:言う|言った|答える|答えた|告げる|告げた|尋ねる|尋ねた|呟く|呟いた|囁く|囁いた|[、:：])$/.test(pre.replace(/[\s　。]+$/, ''))) { ev = 'S1-y-speech-before'; to = y; }
      }
      if (!ev) {
        var kn = /([ァ-ヶー]{2,6}|[一-龥]{2,3})/g, mm, body = stripInner(q.body), plain = narr.replace(/「[^」]*」/g, '。');
        while (!ev && (mm = kn.exec(body))) {
          var nm = mm[1];
          if (isFormOf(nm, xf) || castForms.some(function (f) { return f.indexOf(nm) >= 0 || nm.indexOf(f) >= 0; })) continue;
          if (!selfIntro(body, nm)) continue;
          if (/(?:この子|あの子|その子|彼女|彼は|だって|って言って|らしい|名前は)/.test(body)) continue;   /* 他人の名前を伝えている（「この子、ミオだって」）は名乗りではない */
          var person = /^[ァ-ヶー]+$/.test(nm) ? new RegExp(esc(nm) + '(?:は|が|の|も)') : new RegExp(esc(nm) + '(?:さん|ちゃん|くん|の声|の目|の顔|の肩|の手)');
          if (!person.test(plain)) continue;
          ev = 'S2-other-self-intro'; to = nm;
        }
      }
      if (!ev) {
        for (var d = 0; d < xf.length && !ev; d++) if (thirdPerson(q.body, xf[d])) ev = 'S3-x-third-person';
        for (var d2 = 0; d2 < xf.length && !ev; d2++) if (new RegExp(esc(xf[d2]) + '(?:では|じゃ)な(?:かった|い)').test(postSents.slice(0, 2).join(''))) ev = 'S4-not-x-after';
        if (ev) {
          if (preSubj && others.indexOf(preSubj) >= 0) to = preSubj;
          else if (post1Subj && others.indexOf(post1Subj) >= 0) to = post1Subj;
        }
      }
      if (!ev && !isHero && preSubj && others.indexOf(preSubj) >= 0) {
        /* 弱い根拠 2 つ: 直前の人の主語が Y ＋ そのターンの地の文に X が主語の文が 1 つも無く、Y は 2 回以上主語になっている */
        var sents = sentencesOf(narr.replace(/「[^」]*」/g, '\n')), xs = 0, ys = 0;
        sents.forEach(function (sn) { var co2 = coSubjects(sn, subjToks); if (co2 && co2.some(function (k) { return isFormOf(k, xf); })) { xs++; return; } var fs = firstSubject(sn, subjToks); if (fs && isFormOf(fs, xf)) xs++; if (fs === preSubj) ys++; });
        if (xs === 0 && ys >= 2) { ev = 'W-pair'; to = preSubj; }
        else w1why = xs ? 'W1-only:x-subject-in-turn' : 'W1-only';
      }
      if (!ev) { keep(w1why || 'no-strong-evidence'); continue; }
      if (to && to !== '???' && new RegExp('(?:^|、)' + esc(to) + '(?:は|も)(?:何も|なにも|まだ)?(?:言わ|答え(?:な|ず)|返事をしな|口を開かな|黙)').test(postSents.slice(0, 2).join(''))) { keep('y-silent-after'); continue; }   /* 直後に「Y は何も言わなかった」 */
      if (to && to !== '???' && (thirdPerson(q.body, to) || new RegExp('(?:^|[、。…！？\\s])' + esc(to) + '(?:ちゃん|さん|くん)?[、！？!?]').test(stripInner(q.body)))) { keep('content-addresses-y'); continue; }   /* 台詞が Y に呼びかけている＝話し手は Y ではない */
      /* ★呼び名が役割語（少女・女性…）のときは、その役割語が X 本人を指していることがある（名前が本文に出る前の登録人物）。
         地の文に X の名前が別に出ていて、X と Y が書き分けられているターンだけ替える（S1・W）。名乗り（S2）・X を三人称で指す（S3）・「X ではなかった」（S4）はこの限りでない */
      if (/^(?:S1|W)/.test(ev) && to && new RegExp('^' + ROLE + '$').test(to)) {
        var narrOnly = narr.replace(/「[^」]*」/g, '。');
        if (!xf.some(function (f) { return narrOnly.indexOf(f) >= 0; })) { keep('role-may-be-x'); continue; }
      }
      if (!to) to = '???';
      /* fix611 の関係の判定（登録→未登録の付け替えであること）。同じ人の別名なら触らない */
      var g = g611();
      try { if (g && typeof g.identityRelation === 'function') { var rel = g.identityRelation(X, to, cast); if (rel !== 'cross-cast') { keep('relation:' + rel); continue; } } } catch (e2) {}
      if (nrm(hero) && nrm(X) === nrm(hero) && m.sourceKind === 'hero-utterance') { keep('hero-utterance'); continue; }
      res.push({ ci: ci, act: 'flip', why: ev, from: X, to: to });
    }
    return res;
  }

  /* ---------- 実機の配線 ---------- */
  function getS() { try { return root.__chronicleGetState ? root.__chronicleGetState('spkchk1') : null; } catch (e) { return null; } }
  function castOf(s) { try { var c = s && s.cast; if (!c) return []; return [(c.hero && c.hero.name) || ''].concat((c.npcs || []).map(function (n) { return n && n.name; })).filter(Boolean); } catch (e) { return []; } }
  function sflManual(turn, ci, where) { try { var f = root.__v292DfixSFL1; return !!(f && typeof f.__spkchk1Orig === 'function' && f.__spkchk1Orig(turn, ci, where)); } catch (e) { return false; } }
  function decisionsFor(turn, cast, hero) {
    if (!turn || !Array.isArray(turn._convSays)) return [];
    var key = String(turn.narrative || '').length + ':' + turn._convSays.length;
    if (turn.__spkchk1 && turn.__spkchk1.k === key && turn.__spkchk1.n === turn.narrative) return turn.__spkchk1.d;
    var d = analyze(turn.narrative, turn._convSays, turn._convSayMeta, cast, hero);
    try { Object.defineProperty(turn, '__spkchk1', { value: { k: key, n: turn.narrative, d: d }, enumerable: false, configurable: true, writable: true }); } catch (e) {}
    return d;
  }
  /* 新ターンの確定時（fix620 の突き合わせの後）。返り値=替えた枚数 */
  function applyTurn(turn, cast, hero) {
    if (!on()) return 0;
    var n = 0;
    try {
      ST.turns++;
      var cards = turn._convSays || [];
      var meta = turn._convSayMeta;
      /* ★元の札（meta.sourceWhoRaw）で判定する。fix620 などが途中で替えた who は元へ戻してからは見ない＝触らない */
      decisionsFor(turn, cast, hero).forEach(function (r) {
        if (r.act !== 'flip') { kept(r.why); return; }
        if (sflManual(turn, r.ci, 'spkchk1')) { kept('manual'); return; }
        var c = cards[r.ci]; if (!c || String(c.who) !== String(r.from)) { kept('changed'); return; }
        c.who = r.to; n++;
      });
      ST.flipped += n;
    } catch (e) { ST.errors++; }
    return n;
  }
  /* 後段の自動の書き換えから守る（ON のときだけ）: 同じ本文から同じ答え（今の who が SPKCHK1 の答え）なら守る */
  function guards(turn, ci) {
    if (!on() || !turn) return false;
    try {
      var s = getS(), cast = castOf(s), hero = cast[0] || '';
      var d = decisionsFor(turn, cast, hero);
      for (var i = 0; i < d.length; i++) if (d[i].ci === ci && d[i].act === 'flip') { var c = turn._convSays[ci]; if (c && String(c.who) === String(d[i].to)) { ST.guard++; return true; } }
    } catch (e) {}
    return false;
  }
  function wireSfl() {
    var f = root.__v292DfixSFL1; if (!f) return false;
    if (f.__spkchk1Orig) return true;
    var op = f.protects, oc = f.protectsCard;
    f.__spkchk1Orig = op;
    f.protects = function (turn, ci, where) { var r = op.apply(this, arguments); if (r) return r; return guards(turn, ci); };
    if (typeof oc === 'function') f.protectsCard = function (cardEl, speaker, text) {
      var r = oc.apply(this, arguments); if (r || !on()) return r;
      try { var ti = parseInt(cardEl.getAttribute('data-ti'), 10), ci = parseInt(cardEl.getAttribute('data-ci'), 10); var s = getS();
        if (ti >= 0 && ci >= 0 && s && s.turns && s.turns[ti]) return guards(s.turns[ti], ci); } catch (e) {}
      return false;
    };
    return true;
  }
  (function w() { w.n = (w.n || 0) + 1; if (wireSfl()) return; if (w.n > 120) return; setTimeout(w, 500); })();

  root.__v292DfixSPKCHK1 = { ver: VER, on: on, analyze: analyze, applyTurn: applyTurn, guards: guards, formsOf: formsOf, labelsIn: labelsIn,
    _h: { quotesOf: quotesOf, sentencesOf: sentencesOf, allForms: allForms, isFormOf: isFormOf, speechBy: speechBy, voiceOf: voiceOf, firstSubject: firstSubject, coSubjects: coSubjects, selfIntro: selfIntro, thirdPerson: thirdPerson, stripInner: stripInner, loose: loose, nrm: nrm, esc: esc },   /* SPKQ1 が同じ部品を使う（読むだけ） */
    stats: function () { return JSON.parse(JSON.stringify({ ver: VER, on: on(), turns: ST.turns, flipped: ST.flipped, kept: ST.kept, guard: ST.guard, errors: ST.errors })); } };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
