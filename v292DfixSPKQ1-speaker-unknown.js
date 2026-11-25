/* =====================================================================
 * v292DfixSPKQ1-speaker-unknown.js — 根拠の無い名札は「???」にする（SPKQ1・2026-11-24・既定 OFF）
 * ---------------------------------------------------------------------
 * ■なぜ: 実 AI の 25 ターンの通し（longrun_1123）で、AI が札を付けなかった台詞（bare-inferred / harvest）に
 *   隣の文の主語だけで登録人物の札が付き、聞き手の札になる誤りが出た（T3・T7・T12）。効果音「カチッ」にも人の札が付いた。
 *   GPT_127XH 裁定:「誤った名札より話者不明。明確→維持／候補が複数で曖昧→?／根拠なし→?。効果音はカードにしない。
 *   既定 OFF → 保存済みの同じ AI 出力で旧・新を比較 → 実 AI 比較 → 改善なら ON」。
 * ■やること（新ターンの確定時に 1 回・SPKCHK1 の後）:
 *   AI の札が無いカード（sourceKind が bare-inferred / harvest）だけを見る。AI の札（say-tag…）・主人公の入力・人手の訂正は触らない。
 *   (a) 効果音（カタカナだけの短い「」で、前後の地の文が 音・鳴る・響く で受けている）→ カードから外す。
 *   (b) いまの札 X に、本文の根拠が 1 つも無い → who を '???' にする。
 *   X の根拠（どれか 1 つで維持）:
 *     P1 台詞が X の名乗り ／ P2 前後に X の発話の文・X の声 ／ P3 台詞の前（前の台詞まで）でいちばん近い人の主語が X
 *     P3p 直前の文の主語が 彼女／彼 で、そのターンの地の文に出るその性別の登録人物が X だけ
 *     P4 前の台詞のカードが X で維持・間に地の文があり・その地の文に人の主語が無い（同じ人の動作が続いている）
 *     P5 台詞の直後の文が「言いながら／そう言って／呟いて…」で主語が X、または主語が X で聞き手の反応の動詞でない
 *   聞き手の反応（頷く・黙る・見つめる・聞く・答えない…）だけが X に付いているときは根拠に数えない。
 * ■守ること: 本文は 1 字も変えない。別の人の札へ替えるのは「Y は「…」と言った」の形（同じ文の主語が登録人物 Y）だけ。ほかは '???'。過去ターンへ遡らない。
 * ■鍵: 20261124-spkq1on から全員 既定 ON（kill v292DfixSPKQ1Off='1' が常に勝つ）。カードを外す道だけ 別の鍵 v292DfixSPKQ1DropOn='1'（既定 OFF・kill v292DfixSPKQ1DropOff）。
 * ■診断: window.__v292DfixSPKQ1.stats() / .analyze(narr, cards, meta, cast, hero, genders)
 * ===================================================================== */
(function (root) {
  'use strict';
  if (!root || root.__v292DfixSPKQ1) return;
  var VER = 'spkq1-20261125-r4';
  var ST = { turns: 0, unknown: 0, sfx: 0, flip: 0, guard: 0, kept: {}, why: {}, errors: 0 };
  function lsg(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } }
  function on() { return lsg('v292DfixSPKQ1Off') !== '1'; }   /* 20261124-spkq1on: 全員 既定 ON（保存済みの実 AI 出力 684 枚で 9 枚を直し誤り 0・実機 10 ターンで 1 枚を直し誤り 0・後段と再読み込みで戻らない）。止めるのは kill v292DfixSPKQ1Off='1' */
  function dropOn() { return lsg('v292DfixSPKQ1DropOff') !== '1' && lsg('v292DfixSPKQ1DropOn') === '1'; }   /* カードを外す道（効果音・口に出していない「」）は実機で未確認のため 別の鍵・既定 OFF */
  function H() { try { return root.__v292DfixSPKCHK1 && root.__v292DfixSPKCHK1._h; } catch (e) { return null; } }
  function bump(o, k) { o[k] = (o[k] || 0) + 1; }
  var GATE = { 'bare-inferred': 1, 'harvest': 1 };
  var LISTEN = '(?:頷|うなず|黙|聞い|聞く|聞き|見つめ|見てい|見た(?:まま)?|見上げ|見下ろ|見返|見守|目を|視線を|瞬き|息を(?:呑|飲|止)|答えな|返事をしな|何も言わ|振り返|振り向|耳を|固ま|立ち止ま|待っ|待つ)';
  var SAYING = '(?:言いながら|言いつつ|そう言っ|言い終え|言いかけ|言い切|言い添え|言葉を(?:切|継|続|選)|呟い|つぶやい|囁い|ささやい|続け[たてる]|付け加え|付け足|声を(?:落と|潜|ひそ|上げ|張|かけ|出)|口を開|切り出|尋ね|訊ね|訊い|問い|答え[たてる]|返し[たて]|笑っ[たて]|笑い|吐き捨て|叫|怒鳴)';
  function isSfx(body, pre, post) {
    var b = String(body || '').replace(/[\s　]/g, '');
    if (!/^[ァ-ヶー…‥ッ、。！!・―—]{1,10}$/.test(b) || !/[ァ-ヶ]/.test(b)) return false;
    var p1 = String(post || '').replace(/[\s　]/g, '').slice(0, 18), p0 = String(pre || '').replace(/[\s　]/g, '').slice(-10);
    return /(?:音|鳴|響)/.test(p1) || /(?:音が|音を立て|音がして|鳴っ|響い)$/.test(p0) || /^(?:という|と(?:いう)?[^。、]{0,6}(?:音|響))/.test(p1);
  }
  var NOTSAID = /^(?:と(?:は|も)?(?:口に(?:は)?出さ|言わ(?:ず|な)|言えな|声に(?:は)?(?:出さ|なら)|訊けな|聞けな)|という(?:言葉|問い|疑問)(?:は|を|だけ)[^。]{0,12}(?:飲み込|呑み込|浮か|出さ|しまっ))/;
  /* 純関数。返り値 [{ci, act:'keep'|'unknown'|'drop', why, from}]
     ★r1 の方針（保存済みの実 AI 出力 684 枚で測った結果）: 「根拠が無ければ ???」にすると 258 枚（38%）が ??? になり、
       読んで確かめた範囲ではその 9 割が正しい札だった。＝元の推定は大半が合っている。
       → 「X の根拠が無い」では替えない。「X ではないと言える矛盾」があるカードだけを ??? にする。 */
  /* ★r4 IN1（2026-11-25・評価用の実 AI 1 本 試験_R14 T10 の実測）: プレイヤーが入力で言わせた台詞（『…』「…」の中、SAY なら入力の全体）と同じ文のカードは、
     主人公の台詞。AI の札が別の人（呼びかけた相手）になっていても主人公へ替える（例: 入力「蓮に『ロープの結び方を…誰だった？』と聞く」→ カード「蓮、ロープの結び方を…」が蓮の札）。
     入力が「紬が『…』と言う」のように他の人に言わせる形（引用の直前が が／は／も）は対象外。6 字未満の引用は対象外。止める鍵: v292DfixSPKQ1InOff='1'。 */
  function in1On() { try { return root.localStorage.getItem('v292DfixSPKQ1InOff') !== '1'; } catch (e) { return true; } }
  function heroQuotes(inp) {
    var out = []; if (!inp || !inp.text) return out; var t = String(inp.text);
    var re = /[『「]([^』」]{1,200})[』」]/g, m, any = false;
    while ((m = re.exec(t))) { any = true; var pre = t.slice(Math.max(0, m.index - 3), m.index).replace(/\s+$/, ''); if (/(が|は|も)$/.test(pre)) continue; out.push(m[1]); }
    if (!any && String(inp.type || '').toUpperCase() === 'SAY') out.push(t);
    return out;
  }
  function analyze(narr, cards, meta, cast, hero, inp) {
    var h = H(), res = [];
    narr = String(narr || ''); cards = Array.isArray(cards) ? cards : []; cast = (cast || []).filter(Boolean);
    if (!h) return res;
    var Q = h.quotesOf(narr), castForms = h.allForms(cast, narr);
    var spk = root.__v292DfixSPKCHK1;
    var narrOnly = narr.replace(/「[^」]*」/g, '。');
    var labels = spk.labelsIn(narrOnly, castForms);
    var HQ = in1On() ? heroQuotes(inp).map(function (q) { return h.loose(q); }).filter(function (q) { return q && q.length >= 6; }) : [];
    for (var ci = 0; ci < cards.length; ci++) {
      var c = cards[ci]; if (!c) continue;
      var X = String(c.who || '');
      var m = Array.isArray(meta) && meta.length === cards.length ? meta[ci] : null;
      var out = (function (ci, X) { return function (act, why) { res.push({ ci: ci, act: act, why: why, from: X }); }; })(ci, X);
      if (HQ.length && hero && c._rv !== 1 && h.nrm(X) !== h.nrm(hero)) {   /* ★r4 IN1 */
        var k1 = h.loose(c.say), echo = false;
        if (k1 && k1.length >= 6) for (var hq = 0; hq < HQ.length; hq++) { var lq = HQ[hq]; if (k1 === lq || k1.indexOf(lq) >= 0 || (lq.indexOf(k1) >= 0 && k1.length >= lq.length * 0.6)) { echo = true; break; } }
        if (echo) { res.push({ ci: ci, act: 'flip', why: 'input-echo', from: X, to: hero }); continue; }
      }
      if (!(m && GATE[m.sourceKind])) { out('keep', 'not-bare'); continue; }
      if (c._rv === 1) { out('keep', 'rv'); continue; }
      var key = h.loose(c.say), hits = [];
      if (key) for (var qi = 0; qi < Q.length; qi++) if (h.loose(Q[qi].body) === key) hits.push(qi);
      if (hits.length !== 1) { out('keep', hits.length ? 'quote-not-unique' : 'quote-not-found'); continue; }
      var qi0 = hits[0], q = Q[qi0];
      var preStart = qi0 > 0 ? Q[qi0 - 1].e : 0;
      var between = narr.slice(preStart, q.s);
      var hasNext = qi0 + 1 < Q.length;
      var post = narr.slice(q.e, Math.min(hasNext ? Q[qi0 + 1].s : narr.length, q.e + 200));
      var postSents = h.sentencesOf(post), post1 = postSents[0] || '';
      var postFlat = post.replace(/^[\s　]+/, '');
      /* (a) 効果音・(b) 口に出していない「」 → カードにしない */
      if (isSfx(q.body, between, post)) { out('drop', 'sfx'); continue; }
      if (NOTSAID.test(postFlat)) { out('drop', 'not-spoken'); continue; }
      if (!X || X === '???') { out('keep', 'already-unknown'); continue; }
      var xf = spk.formsOf(X, cast, narr);
      var isHero = !!(h.nrm(hero) && h.nrm(X) === h.nrm(hero));
      var preSents = h.sentencesOf(between);
      if (qi0 > 0 && preSents.length && /^[とって]/.test(preSents[0])) preSents.shift();
      var pre = preSents.length ? preSents[preSents.length - 1] : '';
      /* X 側の強い根拠があれば触らない */
      var pro = null, a;
      for (a = 0; a < xf.length && !pro; a++) {
        if (h.selfIntro(q.body, xf[a])) pro = 'P1-self-intro';
        else if (h.speechBy(pre, xf[a]) || h.speechBy(post1, xf[a])) pro = 'P2-x-speech';
        else if (h.voiceOf(post, xf[a])) pro = 'P2-x-voice';
      }
      if (pro) { out('keep', pro); continue; }
      var toks = castForms.concat(labels);
      var post1Subj = post1 ? h.firstSubject(post1, toks) : null;
      var post1IsX = !!(post1Subj && h.isFormOf(post1Subj, xf));
      if (post1IsX && new RegExp(SAYING).test(post1)) { out('keep', 'P5-x-saying-after'); continue; }
      /* C1 台詞の中で X を呼んでいる・他人として指している */
      var hit = null;
      for (a = 0; a < xf.length && !hit; a++) {
        if (h.thirdPerson(q.body, xf[a]) || new RegExp('(?:^|[、。…！？!?\\s　])' + h.esc(xf[a]) + '(?:ちゃん|さん|くん|君|先輩|様)?[、！？!?]').test(h.stripInner(q.body))) hit = 'C1-content-addresses-x';
      }
      /* C2 台詞が、X ではない登録人物の名乗り（「浩太です」） */
      if (!hit) {
        for (var k = 0; k < cast.length && !hit; k++) {
          if (h.nrm(cast[k]) === h.nrm(X)) continue;
          var yf = spk.formsOf(cast[k], cast, narr).filter(function (f) { return !h.isFormOf(f, xf) && f.length >= 2; });
          for (var y = 0; y < yf.length && !hit; y++) if (introStrict(h, q.body, yf[y])) hit = 'C2-other-self-intro';
        }
        /* 未登録の名前の名乗り（「浩太です」）。その名前が、この台詞の外（地の文・ほかの台詞）にも出ているときだけ */
        var kn = /([ァ-ヶー]{2,6}|[一-龥]{2,3})/g, mm, body0 = h.stripInner(q.body), outside = narr.slice(0, q.s) + '\n' + narr.slice(q.e);
        while (!hit && (mm = kn.exec(body0))) {
          var nm = mm[1];
          if (h.isFormOf(nm, xf) || castForms.some(function (f) { return f.indexOf(nm) >= 0 || nm.indexOf(f) >= 0; })) continue;
          if (!introStrict(h, body0, nm)) continue;
          if (COMMON.test(nm)) continue;
          var inNarr = new RegExp(h.esc(nm) + '(?:は|が|も|さん|ちゃん|くん)').test(narrOnly);
          var called = new RegExp('(?:^|[「、。…\\s　])' + h.esc(nm) + '(?:[、。！？!?]|さん|ちゃん|くん)').test(outside);
          if (!inNarr && !called) continue;
          hit = 'C2-other-self-intro';
        }
      }
      /* C3 地の文の中に埋まった「」で、同じ文の主語が別の人（「店員が客に「…」と尋ねる」） */
      var to = null;
      /* ★r2（GPT #127-XI (b)）: 「Y は「…」と聞いた」は 尋ねた と 耳にした の両方に読める。「と聞いた／聞いて」は台詞が問いの形（？・か・の で終わる）のときだけ。
         受け身（と言われた・呼ばれた・尋ねられた）・聴取（という声・が聞こえ・耳に・届く）・文字（と書かれ・表示）は Y の発話ではないので数えない */
      var c3cl = postFlat.split('。')[0];
      var c3heard = /^(?:と|って)(?:いう|言う)[^。、]{0,8}(?:声|音|言葉|叫び|囁き|呟き)(?:が|を|に|は|も)/.test(c3cl) || /^(?:と|って)[^。、]{0,10}(?:声|言葉)を(?:聞|耳)/.test(c3cl) || /(?:言われ|呼ばれ|告げられ|尋ねられ|訊かれ|聞かれ|問われ|命じられ|頼まれ|書かれ|書いてあ|表示|読め)/.test(c3cl)
        || (/(?:聞こえ|耳にし|耳に入|耳に届|届い|届く|響い|響く)/.test(c3cl) && !/^(?:と|って)[^。、]{0,4}(?:尋ね|訊ね|訊い|言[うっい]|叫|呼びかけ|囁|ささや|呟|つぶや|告げ|答え|返[しす])/.test(c3cl));   /* 「店員が客に「…」と尋ねる声が届く」は 店員の発話 */
      var c3kiku = /^(?:と|って)[^。、]{0,6}?(?:聞い|聞く|聞き(?!返))/.test(c3cl) && !/(?:[？?]|か|の|かな|かしら|だろう|でしょう)$/.test(String(q.body).replace(/[\s　。…‥]+$/, ''));
      if (!hit && !c3heard && !c3kiku && pre && h.loose(q.body).length >= 2 && !/[\n。」]$/.test(between.replace(/[ 　]+$/, '')) && /^(?:と|って)(?!う|ころ|き)/.test(postFlat)) {
        var subjPre = h.firstSubject(pre, toks);
        var anyNoun = pre.replace(/^[\s　]+/, '').match(/^([^。、「\s　]{1,8}?)(?:が|は)[^。「]*$/);
        if (subjPre) { if (!h.isFormOf(subjPre, xf) && !h.speechBy(postFlat, xf[0])) { hit = 'C3-inline-other-subject'; to = ownerOf(h, spk, subjPre, cast, narr); } }
        else if (anyNoun && !xf.some(function (f) { return pre.indexOf(f) >= 0; }) && !/^(?:彼女|彼|あなた|自分|それ|これ|声|言葉)$/.test(anyNoun[1]) && !xf.some(function (f) { return postFlat.slice(0, 30).indexOf(f) >= 0; })) hit = 'C3-inline-other-subject';
      }
      /* ★r3（2026-11-24・実 AI の取り違え 3 件から）
         C3b 同じ段落の中で、直前の文の主語が Y（「冴の手が一瞬止まり、…動き出す。」）で、台詞の直後が主語なしの「とだけ答えて／と言って…」＝ 話し手は Y。X≠Y なら Y へ（登録人物のとき）・未登録なら ???。
         C5 台詞が相手への促し（「やってみて」「どうぞ」「〜してください」）で、直後の文の主語が X で、X がその動作を始めている（発話の動詞なし）＝ X は言われた側 → ???。 */
      if (!hit && pre && h.loose(q.body).length >= 2 && /。[ 　]*$/.test(between)) {
        var tail3 = between.slice(between.lastIndexOf('\n') + 1);                       /* 同じ段落の、台詞の前の部分 */
        var cl3 = postFlat.split(/[。\n]/)[0];
        if (tail3.replace(/[\s　]/g, '').length >= 6 && /^(?:と|って)(?:だけ|小さく|短く|静かに|低く)?[^。、「]{0,4}?(?:答え|言っ|言い|返し|返す|呟い|囁い|付け加え|続け[たてる]|告げ|尋ね|訊)/.test(cl3) && !h.firstSubject(cl3, toks)) {
          var s3 = h.sentencesOf(tail3), y3 = s3.length ? h.firstSubject(s3[s3.length - 1], toks) : null;
          if (y3 && !h.isFormOf(y3, xf)) { hit = 'C3b-same-paragraph-subject'; to = ownerOf(h, spk, y3, cast, narr); }
        }
      }
      if (!hit && post1IsX && /(?:てみて|てごらん|てください|て下さい|なさい|てくれ|どうぞ|てみな|ていいよ)[。、！!…]*$/.test(String(q.body).replace(/[\s　]+$/, '')) && !new RegExp(SAYING).test(post1) && !/[？?]/.test(q.body)) {
        if (/^(?:[^。、「]{0,8}の)?[^。「]{1,12}(?:は|が)(?:まず|早速|さっそく|言われた|促され|頷い|うなず|恐る恐る|おそるおそる|そっと|ゆっくり)/.test(post1.replace(/^[\s　]+/, ''))) hit = 'C5-x-is-told-to-act';
      }
      /* C4 直後の文が「X は…頷いた（だけ）／黙って聞いていた」＝ X は聞き手。台詞の前には X の主語が無い */
      if (!hit && post1IsX && !isHero0(q.body)) {
        var lis = new RegExp('^(?:[^。、「]{0,8}の)?' + h.esc(post1Subj) + '(?:は|も)[^。「]{0,24}(?:頷い|うなずい|黙っ|黙り|聞いてい|見守っ)[^。「]{0,10}。?$').test(post1.replace(/^[\s　]+/, ''));
        var preX = preSents.some(function (sn) { var fs = h.firstSubject(sn, toks); return !!(fs && h.isFormOf(fs, xf)); });
        if (lis && !preX && !new RegExp(SAYING).test(post1)) hit = 'C4-x-only-listens-after';
      }
      if (hit && to && h.nrm(to) !== h.nrm(X)) res.push({ ci: ci, act: 'flip', why: hit, from: X, to: to });
      else if (hit) out('unknown', hit); else out('keep', 'no-contradiction');
    }
    return res;
  }
  function isHero0() { return false; }
  var COMMON = /^(?:大丈夫|本当|平気|結構|無理|駄目|十分|元気|最高|最低|残念|心配|安心|正解|以上|以下|明日|今日|昨日|今朝|今夜|本気|冗談|一緒|同感|賛成|反対|了解|承知|失礼|結局|当然|勿論|普通|確か|簡単|大変|立派|綺麗|素敵|不思議|仕事|学生|先生|社員|店員|警察|医者|新人|後輩|先輩|友達|家族|兄弟|姉妹|隣人|住人|管理人|大家|初対面|久しぶり|時間|場所|名前|写し|控え|原本|秘密|内緒|限界|無事|無料|有料|満席|以上|予定|用事|急用|約束|オーケー|オッケー|ダメ|ホント|マジ|ラッキー)$/;
  /* 本文の呼び名 tok が指す登録人物（ちょうど 1 人のときだけ） */
  function ownerOf(h, spk, tok, cast, narr) {
    var own = cast.filter(function (n) { return h.isFormOf(tok, spk.formsOf(n, cast, narr)); });
    return own.length === 1 ? own[0] : null;
  }
  /* 名乗り（厳しめ）: 「N です／だよ／といいます／と申します」。「N。」「N！」だけ（呼びかけ）は数えない。他人の名前を伝える形も数えない */
  function introStrict(h, body, tok) {
    var b = h.stripInner(body);
    if (/(?:この子|あの子|その子|この人|あの人|彼女|彼は|だって|らしい|名前は[^。]{0,8}(?:って|と)(?:言|聞))/.test(b)) return false;
    var m = b.match(new RegExp('(?:^|[、。…！？!?\\s　])(?:(?:私|わたし|あたし|僕|ぼく|俺|おれ|うち)(?:は|、|の名前は)?)?' + h.esc(tok) + '(?:だよ|です|っていいます|って言います|といいます|と申します)'));
    if (!m) return false;
    return /^(?:[。！!…‥]|$)/.test(b.slice(m.index + m[0].length, m.index + m[0].length + 2));
  }

  /* ---------- 実機の配線 ---------- */
  function getS() { try { return root.__chronicleGetState ? root.__chronicleGetState('spkq1') : null; } catch (e) { return null; } }
  function castOf(s) { try { var c = s && s.cast; if (!c) return []; return [(c.hero && c.hero.name) || ''].concat((c.npcs || []).map(function (n) { return n && n.name; })).filter(Boolean); } catch (e) { return []; } }
  function setMark(turn, ci, who) {
    try { if (!turn.__spkq1Set) Object.defineProperty(turn, '__spkq1Set', { value: {}, enumerable: false, configurable: true, writable: true }); turn.__spkq1Set[ci] = who; } catch (e) {}
  }
  function manual(turn, ci) { try { var f = root.__v292DfixSFL1; return !!(f && typeof f.protects === 'function' && f.protects(turn, ci, 'spkq1')); } catch (e) { return false; } }   /* 人手の訂正・SPKCHK1 が替えた札は触らない */
  /* 新ターンの確定時。返り値 = {unknown, sfx} */
  function applyTurn(turn, cast, hero, s) {
    var r0 = { unknown: 0, sfx: 0 };
    if (!on() || !turn || !Array.isArray(turn._convSays)) return r0;
    try {
      ST.turns++;
      var cards = turn._convSays, meta = turn._convSayMeta;
      if (!Array.isArray(meta) || meta.length !== cards.length) { bump(ST.kept, 'no-meta'); return r0; }
      var d = analyze(turn.narrative, cards, meta, cast, hero, { text: turn.playerText, type: turn.inputType });
      var drop = [];
      d.forEach(function (r) {
        if (r.act === 'keep') { bump(ST.kept, r.why); return; }
        if (manual(turn, r.ci)) { bump(ST.kept, 'manual'); return; }
        var c = cards[r.ci]; if (!c || String(c.who || '') !== String(r.from)) { bump(ST.kept, 'changed'); return; }
        if (r.act === 'drop') { if (!dropOn()) { bump(ST.kept, 'drop-off:' + r.why); return; } drop.push(r.ci); bump(ST.why, r.why); return; }
        if (r.act === 'flip') { c.who = r.to; setMark(turn, r.ci, r.to); r0.flip = (r0.flip || 0) + 1; ST.flip = (ST.flip || 0) + 1; bump(ST.why, r.why + '>flip'); return; }
        c.who = '???'; setMark(turn, r.ci, '???'); r0.unknown++; bump(ST.why, r.why);
      });
      if (drop.length) {
        drop.sort(function (a, b) { return b - a; }).forEach(function (i) {
          cards.splice(i, 1); meta.splice(i, 1);
          var mk = turn.__spkq1Set; if (mk) { var nk = {}; Object.keys(mk).forEach(function (k) { var j = +k; if (j === i) return; nk[j > i ? j - 1 : j] = mk[k]; }); try { turn.__spkq1Set = nk; } catch (e) {} }
        });
        r0.sfx = drop.length;
      }
      ST.unknown += r0.unknown; ST.sfx += r0.sfx;
    } catch (e) { ST.errors++; }
    return r0;
  }
  /* 後段の自動の書き換えから守る（ON のときだけ・印は保存しない＝同じ本文から同じ答えを毎回計算）: いまの who が SPKQ1 の答えなら守る */
  function guards(turn, ci) {
    if (!on() || !turn || !Array.isArray(turn._convSays)) return false;
    try {
      var c = turn._convSays[ci]; if (!c) return false;
      var mk = turn.__spkq1Set; if (mk && mk[ci] != null && String(c.who) === String(mk[ci])) { ST.guard = (ST.guard || 0) + 1; return true; }
    } catch (e) {}
    return false;
  }
  function wireSfl() {
    var f = root.__v292DfixSFL1; if (!f || !f.__spkchk1Orig) return false;   /* SPKCHK1 の配線の後に重ねる */
    if (f.__spkq1Wired) return true;
    var op = f.protects, oc = f.protectsCard;
    f.protects = function (turn, ci, where) { var r = op.apply(this, arguments); if (r) return r; return where === 'spkq1' ? false : guards(turn, ci); };
    if (typeof oc === 'function') f.protectsCard = function (cardEl, speaker, text) {
      var r = oc.apply(this, arguments); if (r || !on()) return r;
      try { var ti = parseInt(cardEl.getAttribute('data-ti'), 10), ci = parseInt(cardEl.getAttribute('data-ci'), 10); var s = getS();
        if (ti >= 0 && ci >= 0 && s && s.turns && s.turns[ti]) return guards(s.turns[ti], ci); } catch (e) {}
      return false;
    };
    f.__spkq1Wired = true;
    return true;
  }
  (function w() { w.n = (w.n || 0) + 1; if (wireSfl()) return; if (w.n > 120) return; try { root.setTimeout(w, 500); } catch (e) {} })();

  root.__v292DfixSPKQ1 = { ver: VER, on: on, analyze: analyze, applyTurn: applyTurn, isSfx: isSfx, guards: guards,
    stats: function () { return JSON.parse(JSON.stringify({ ver: VER, on: on(), turns: ST.turns, unknown: ST.unknown, drop: ST.sfx, flip: ST.flip, guard: ST.guard, why: ST.why, kept: ST.kept, errors: ST.errors })); } };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
