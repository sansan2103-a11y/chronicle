// =====================================================================
// Chronicle TRPG - v292DfixSPK2: 会話ログ話者の「引用の後ろの証拠」まとめ（影＝記録だけ・既定で何も変えない）
// ---------------------------------------------------------------------
// 背景（laneSCENE2・2026-11-12・LOCAL 試作・未出荷）: Owner 実例（三人称）
//   ①「霧の日って、いつ来るの。…」→ 直後「凪の問いに、灯里は答えを喉の奥で一度止めた。」→ カード=灯里（正=凪・主人公の入力されていない台詞）
//     本番の再現（63bfe48・偽 AI 再生）: 裸の「」は fix218 の後置話者判定（voiceNoun に「問い」が無い）を通らず、
//     引用の前 200 字の窓で最後の「Xは」（灯里は湯呑みを…）を話者にした（sourceKind=bare-inferred）。モデルが who="灯里" と書いた場合もそのまま。
//   ②「私、明日の朝、港の灯台まで歩く。…」→ 直後「彼女は凪の返事を待たずに、…」→ カード=凪（正=灯里）
//     再現: 裸の「」なら窓で 灯里（正しい）。凪 になるのは モデルが who="凪" と書いた時／窓の直前の主語が「凪は」の時。
// 立っている裁定（GPT）: 引用の前に新しい手掛かりを足さない・閾値を緩めない・引用の後ろの証拠は可（#127-SM＝FF2c 強い証拠）・
//   迷ったら NPC に寄せない（'???' か何もしない）。
// 規則（すべて「引用の直後の 1 文」だけを見る。直後に別の引用・別の文が先に来たら何もしない）:
//   P-Q1 「〈X〉の(問い|問いかけ|質問|言葉|声|返事|呟き|叫び|一言|台詞)に、〈Y〉は…」 → この引用は X（X≠Y・どちらも登録名）
//   P-Q2 「…〈X〉の(返事|答え|反応)を待たずに…」 → X は聞き手。カードが X で、場にいる他の話者候補がちょうど 1 人、
//        文の主語が代名詞（彼女/彼・性別が合う）かその人なら → その人。ほかは何もしない
//   FF2c R1  一人称語り: 「…」と私は答えた／私の声に… → 主人公（laneFLOWFIX1）
//   FF2c R1b 一人称語り・文中の「…」と＋発話動詞、動詞の前に別の主語なし → 主人公
//   FF2c R2  独立行の裸「」で、カードの NPC に引用の後ろの証拠がなく、引用の中でその人へ呼びかけている／間に別人の <say> がある → '???'
//   HV-C1    「…」と凪は言った／凪の声が… → 主人公（laneHEROVOICE1・登録名か一人称）
//   HB1（laneP0C・GPT #127-SQ 問11）裸の「」が主人公のカードになっているとき:
//        ・その回の入力が SAY 以外、または SAY でも入力文に無い文面（入力と同じ／言い換え〔2 文字の重なり 0.5 以上〕は対象外）
//        ・確かな根拠が無い（根拠＝引用の直後「…」と〈主人公〉は言った／〈主人公〉の声・問いに〔上の HV-C1・R1・R1b・P-Q1〕、
//          引用の直前の 1 文が「〈主人公〉は…言った／告げた／口を開いた。」、同じ文の中の「〈主人公〉は「…」と言った」）
//        → '???' を提案する。別の NPC へは付け替えない。声だけ（「ぐっ……！」「……っ」）は対象外＝そのまま。
//        反証があれば why に書く（引用の中で主人公の名を呼んでいる／一人称が主人公と違う／主人公は聞き手）。
//   NS1（記録だけ・適用しない）裸の「」が「話された言葉ではない」文脈にある: 看板・張り紙など書かれた文字／心の声／前に出た発言の引用。
//        カードを消すことはしない（枚数を変えるのは別裁定）。主人公のカードなら HB1 が '???' を提案する。
//   R1b・R2・HB1 は裸の「」由来のカードだけで判定する。P-Q1・P-Q2・HV-C1・R1 の適用も 裸の「」由来のカード（sourceKind = bare-inferred / harvest / 無し）だけ。モデルが who を書いたカード（say-tag）は
//   「食い違い」として記録だけする（apply でも変えない。GPT 裁定待ち）。
// 鍵（毎回評価）: 影は既定で動く（kill: localStorage v292DfixSPK2Off='1'）。適用は v292DfixSPK2Apply='1' のときだけ（既定 OFF）。
//   影の記録: メモリ（最大 200 件）と localStorage 'v292DfixSPK2Ring'（最新 30 件・物語の保存とは別のキー・同期対象外の名前）。
//   ★影のときは S・turn・カード・保存に 1 バイトも触らない（appendTurn の後で読むだけ）。
// 検証口: window.__v292DfixSPK2 = { VER, decide, log, ring, stats, on, applyOn }
// =====================================================================
(function(root){
  'use strict';
  var VER = 'spk2-20261112-b-hb1', TAG = '[v292DfixSPK2]';
  function ls(k){ try { return root.localStorage ? root.localStorage.getItem(k) : null; } catch(e){ return null; } }
  function on(){ return ls('v292DfixSPK2Off') !== '1'; }
  function applyOn(){ return on() && ls('v292DfixSPK2Apply') === '1'; }
  function esc(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  var SPEECH = '(?:言|呟|囁|尋|問|答|叫|返|応|告|呼|続|笑|声を|頼|促|うめ|呻|漏ら|絞り出)';
  var PQ1_NOUN = '(?:問いかけ|問い|質問|言葉|声|返事|呟き|叫び|一言|台詞|セリフ)';
  var PQ2_NOUN = '(?:返事|答え|返答|反応)';
  var PRON_F = /^(?:彼女)(?:は|が|も)/, PRON_M = /^(?:彼)(?:は|が|も)/;
  function nospace(s){ return String(s || '').replace(/[\s　]/g, ''); }
  function loose(s){ return String(s || '').replace(/[\s　。、，．・！？!?…‥ー—―\-「」『』"]/g, ''); }
  /* HB1 用 */
  var HB_PRE_VERB = '(?:言っ|言う|言い|告げ|呟|囁|叫|怒鳴|尋ね|問い|問う|訊|聞い|答え|返し|返す|応え|応じ|続け|口を開|声をかけ|声を掛け|声を張|声を上げ|声を絞|声を落と|呼びかけ|呼び掛け|呼ん|切り出|促し|頼ん|名乗)';
  var FP_WORDS = ['わたくし', 'わたし', 'あたし', 'あたい', '私', '俺', 'おれ', 'オレ', '僕', 'ぼく', 'ボク', 'わし', 'ワシ', '儂', 'うち', '拙者', 'あっし', 'わい', 'おら', 'おいら', '吾輩', '我'];
  var WRITTEN_MEDIUM = /(?:文字|字|張り紙|貼り紙|貼紙|看板|立て札|立札|掲示|札|板|紙|ラベル|名札|表札|メモ|手紙|書き置き|書置き|伝票|帳面|日記|碑|銘|タグ)/;
  var WRITTEN_END = /(?:書かれ|記され|刻まれ|彫られ|綴られ|書いてあ|残ってい|残されてい|残る|とあ|こうあ|読め|並んでい|貼られ|張られ|掲げられ|書き付けられ)[^。\n「」]{0,6}[。:：]?[\s　]*$/;
  var NEG_SPEECH = /(?:答え|応え|返事をし|返事もし|言わ|言え|返さ|返せ|話さ|喋ら|口を開か|声を出さ|声を上げ|声が出|言葉が出|言葉を失|言葉に詰ま|何も言)[^。「」]{0,4}(?:ず|ない|なかった|ぬ|られな|ません)/;
  var WRITTEN_POST = /^(?:と|って)[^。「」\n]{0,10}(?:書かれ|記され|刻まれ|彫られ|書いてあ|ある。|あった。|読め|綴られ)/;
  var THOUGHT_POST = /^(?:と|って)[^。「」\n]{0,14}(?:胸の内|胸の中|胸中|心の中|心の内|心中|内心|頭の中|腹の中|思っ|思う|思い|考え)/;
  var REQUOTE_PRE = /(?:さっき|先ほど|先刻|あの時|あのとき|前に|昨日|昨夜|以前)[^。「」\n]{0,24}$|(?:が|の)(?:言った|言っていた|口にした|告げた|残した)[\s　]*$/;
  var REQUOTE_POST = /^(?:という|って(?:いう)?)[^。「」\n]{0,6}(?:言葉|台詞|セリフ|声|一言|言い回し|返事|約束|噂|話)/;
  function vocalOnly(q){   /* 声だけ（うめき・息）: 記号・っ・小さい仮名・ん を除いた残りが 1 字以下、または ぐ/う/あ/は/く/ふ/ひ/が/ぎ/げ だけ 3 字以下。「おい」「くそ」などの言葉は声だけにしない */
    var t = String(q || '').replace(/[\s　。、，．・！？!?…‥ー—―~〜\-「」『』"っッぁぃぅぇぉァィゥェォゃゅょャュョんン]/g, '');
    return t.length <= 1 || (t.length <= 3 && /^[ぐうあはくふひがぎげグウアハクフヒガギゲ]+$/.test(t)); }
  function bigrams(s){ var o = {}, n = 0; for (var i = 0; i + 1 < s.length; i++){ var k = s.substr(i, 2); o[k] = (o[k] || 0) + 1; n++; } return { m: o, n: n }; }
  function inInput(q, inp){   /* 入力と同じ・入力に含まれる・入力の言い換え（2 文字の重なり Dice 0.5 以上） */
    var a = loose(q), b = loose(inp); if (!a || !b) return false;
    if (a.length >= 2 && (b.indexOf(a) >= 0 || (b.length >= 4 && a.indexOf(b) >= 0))) return true;
    if (a.length < 4 || b.length < 4) return false;
    var A = bigrams(a), B = bigrams(b), c = 0; for (var k in A.m) if (B.m[k]) c += Math.min(A.m[k], B.m[k]);
    return (2 * c) / (A.n + B.n) >= 0.5;
  }
  function lastSentence(pre){   /* 引用の直前の 1 文（地の文）。直前が別の引用なら '' */
    var t = String(pre || '').replace(/[\s　]+$/, ''); if (!t || /[」』]$/.test(t) || /<\/say>$/.test(t)) return '';
    var body = t.replace(/[。！？!?]+$/, ''); var k = Math.max(body.lastIndexOf('。'), body.lastIndexOf('\n'), body.lastIndexOf('」'), body.lastIndexOf('！'), body.lastIndexOf('？'));
    return t.slice(k + 1);
  }
  function narrOnly(s){ return String(s).replace(/<say\b[^>]*>[\s\S]*?<\/say>/g, ' ').replace(/「[^」]*」/g, ' ').replace(/<[^>]*>/g, ' '); }

  // 引用の位置: charOffset（fix616 の meta）が合っていればそれ、無ければ本文で n 番目に現れる同じ引用
  function locate(narr, say, off, used){
    var q = String(say || '').replace(/^「|」$/g, '');
    if (!q) return -1;
    if (typeof off === 'number' && narr.charAt(off) === '「' && narr.slice(off + 1, off + 1 + q.length) === q) return off;
    var from = 0, p;
    while ((p = narr.indexOf('「' + q, from)) >= 0){ if (!used[p]) return p; from = p + 1; }
    var lq = loose(q); if (lq.length < 3) return -1;
    var re = /「([^」]*)」/g, m;
    while ((m = re.exec(narr)) !== null){ if (!used[m.index] && loose(m[1]) === lq) return m.index; }
    return -1;
  }
  function closeOf(narr, p){ var depth = 0; for (var i = p; i < narr.length; i++){ var c = narr.charAt(i); if (c === '「') depth++; else if (c === '」'){ depth--; if (depth === 0) return i; } } return -1; }

  // ctx: { narrative(string), cards:[{who, say, kind, off}], hero, heroGender, firstPerson(string|null), fpNarr(bool), npcs:[{name, gender}], present:[names] }
  function decide(ctx){
    var narr = String(ctx.narrative || ''), hero = ctx.hero || '', npcs = ctx.npcs || [];
    var names = [hero].concat(npcs.map(function(n){ return n.name; })).filter(Boolean);
    var gender = {}; if (hero) gender[hero] = ctx.heroGender || ''; npcs.forEach(function(n){ gender[n.name] = n.gender || ''; });
    var fp = ctx.firstPerson || null, fpNarr = !!ctx.fpNarr;
    var inType = String(ctx.inputType || '').toUpperCase(), inText = String(ctx.inputText || '');
    var present = (ctx.present && ctx.present.length) ? ctx.present : names.filter(function(n){ return narr.indexOf(n) >= 0; });
    var out = [], used = {}, pos = [];
    (ctx.cards || []).forEach(function(c, idx){
      var p = locate(narr, c.say, c.off, used); if (p < 0){ out.push({ idx: idx, rule: null, why: 'not-located' }); return; }
      used[p] = 1; pos.push({ p: p, who: c.who });
      var e = closeOf(narr, p); if (e < 0){ out.push({ idx: idx, rule: null, why: 'unclosed' }); return; }
      var q = narr.slice(p + 1, e), pre = narr.slice(Math.max(0, p - 200), p), post = narr.slice(e + 1);
      var standalone = /(^|\n)[ \t　]*$/.test(pre) && /^[ \t　]*(\n|$)/.test(post);
      var postS = (standalone ? post.replace(/^[\s　]+/, '') : post);
      var nextQuote = /^「/.test(postS);   // 直後が別の引用 → 引用の後ろの証拠は無い（R2 だけ見る）
      var sent = nextQuote ? '' : postS.split(/[。\n「]/)[0];   // 直後の 1 文
      var cur = c.who, bare = !c.kind || /^(bare|harvest)/.test(c.kind), r = null;   // ★ctxOf は meta が無いとき plan.narrative の <say> で決め、決まらなければ 'unknown'＝裸扱いしない（適用しない）
      // P-Q1
      for (var a = 0; a < names.length && !r && sent; a++){
        var X = names[a];
        var m1 = sent.match(new RegExp('^[\\s　]*' + esc(X) + '(?:さん|くん|ちゃん)?の' + PQ1_NOUN + '(?:に|へ|を受け|を聞い|が終わ)[、，\\s　]*(' + names.filter(function(n){ return n !== X; }).map(esc).join('|') + ')(?:は|が|も)'));
        if (m1 && names.length > 1) r = { rule: 'P-Q1', who: X, why: X + 'の' + 'N に、' + m1[1] + 'は…' };
      }
      // P-Q2
      if (!r && sent){
        for (var b = 0; b < names.length && !r; b++){
          var L = names[b], m2 = sent.match(new RegExp('^([^。「」]{0,12}?)' + esc(L) + '(?:さん|くん|ちゃん)?の' + PQ2_NOUN + 'を待たず'));
          if (!m2) continue;
          if (cur !== L){ r = { rule: 'P-Q2', who: cur, why: 'listener=' + L + ' (card already other)', noop: true }; break; }
          var others = present.filter(function(n){ return n !== L; });
          if (others.length !== 1){ r = { rule: 'P-Q2', who: cur, why: 'listener=' + L + ' candidates=' + others.length, noop: true }; break; }
          var O = others[0], subj = m2[1].replace(/^[\s　]+/, '');
          var okSubj = new RegExp('^' + esc(O) + '(?:は|が|も)').test(subj) || (PRON_F.test(subj) && gender[O] !== '男性') || (PRON_M.test(subj) && gender[O] !== '女性');
          if (PRON_F.test(subj) && /男/.test(gender[O] || '')) okSubj = false;
          if (PRON_M.test(subj) && /女/.test(gender[O] || '')) okSubj = false;
          if (okSubj) r = { rule: 'P-Q2', who: O, why: 'listener=' + L + ' subject=' + (subj.slice(0, 4) || '(none)') };
          else r = { rule: 'P-Q2', who: cur, why: 'listener=' + L + ' subject unclear', noop: true };
        }
      }
      // HV-C1 / FF2c R1（主人公＝登録名か一人称が引用の直後に話す）
      if (!r && hero && sent){
        var subjH = [hero].concat(fp ? [fp] : []).map(esc).join('|');
        var nar = narrOnly(sent);
        if (!NEG_SPEECH.test(nar) && new RegExp('^(?:と|って)?[、，\\s　]*(?:' + subjH + ')(?:は|が|も)[^。「」]{0,12}?' + SPEECH).test(nar) || new RegExp('^(?:と[^。「」]{0,4}?)?[、，\\s　]*(?:' + subjH + ')の(?:声|言葉|返事|囁き|呟き)').test(nar))
          r = { rule: fp && new RegExp('^(?:と|って)?[、，\\s　]*' + esc(fp)).test(nar) ? 'R1' : 'HV-C1', who: hero, why: 'post-quote hero speech' };
        // FF2c R1b（一人称語りだけ・文中の「…」と＋発話動詞・動詞の前に別の主語なし）
        if (!r && bare && fpNarr && !standalone && /^(?:と|って)/.test(nar)){
          var vm = nar.match(new RegExp(SPEECH));
          if (vm){ var seg = nar.slice(0, vm.index); if (!names.some(function(n){ return seg.indexOf(n) >= 0; }) && !/(彼|彼女|あいつ|男|女|少年|少女)[はがも]/.test(seg)) r = { rule: 'R1b', who: hero, why: 'inline と+verb, zero subject (1st-person narration)' }; }
        }
      }
      // FF2c R2（一人称語りだけ・独立行・カードの NPC に後ろの証拠なし・呼びかけ／古い手掛かり → '???'）
      if (!r && bare && fpNarr && standalone && cur && cur !== hero && names.indexOf(cur) >= 0){
        var postEv = new RegExp('^' + esc(cur) + '(?:は|が|の声|も)').test(narrOnly(sent).trim());
        if (!postEv){
          var voc = new RegExp(esc(cur) + '(?:さん|様|さま|ちゃん|くん|君|、)').test(q);
          var lastAbs = narr.lastIndexOf(cur, p);   // 引用より前で最後に名前が出た位置
          var stale = lastAbs >= 0 && pos.some(function(z){ return z.p > lastAbs && z.p < p && z.who && z.who !== cur; });   // 間に別人のカード（＝別人の台詞）がある
          if (voc || stale) r = { rule: 'R2', who: '???', why: voc ? 'vocative' : 'stale clue' };
        }
      }
      /* NS1（記録だけ）: 書かれた文字／心の声／前に出た発言の引用 */
      var ns = null;
      if (bare){
        var preLine = lastSentence(narr.slice(Math.max(0, p - 120), p)), postN = narrOnly(post.slice(0, 40)).replace(/^[\s　]+/, '');
        var sameLinePre = narr.slice(Math.max(0, p - 60), p).split('\n').pop();
        if (THOUGHT_POST.test(postN)) ns = 'thought';
        else if (WRITTEN_POST.test(postN) || (standalone && !/^(?:と|って)/.test(postN) && WRITTEN_MEDIUM.test(preLine) && WRITTEN_END.test(preLine))) ns = 'written';
        else if (REQUOTE_POST.test(postN) && (REQUOTE_PRE.test(sameLinePre) || pos.some(function(z, zi){ return zi < pos.length - 1 && z.q && loose(z.q) === loose(q); }))) ns = 'requote';
      }
      pos[pos.length - 1].q = q;
      /* HB1: 裸の「」→主人公。入力に無い台詞で、確かな根拠が無ければ '???'（別の NPC へは付け替えない） */
      if ((!r || r.noop) && bare && hero && cur === hero){
        var hb = null;
        if (vocalOnly(q)) hb = { keep: 'vocal-only' };
        else if (inInput(q, inText)) hb = { keep: 'in-input' };
        else {
          var subjH2 = [hero].concat(fp ? [fp] : []).map(esc).join('|');
          var pl = narrOnly(lastSentence(narr.slice(Math.max(0, p - 160), p)));
          var preLead = new RegExp('(?:^|[、，\\s　])(?:' + subjH2 + ')(?:は|が|も)[^。「」]{0,40}?' + HB_PRE_VERB + '[^。「」]{0,8}[。:：]?[\\s　]*$').test(pl) || new RegExp('^(?:' + subjH2 + ')(?:は|が|も)[^。「」]{0,40}?' + HB_PRE_VERB + '[^。「」]{0,8}[。:：]?[\\s　]*$').test(pl.replace(/^[\s　]+/, ''));
          var inl = narr.slice(Math.max(0, p - 60), p).split('\n').pop();
          var inlineLead = !standalone && new RegExp('(?:' + subjH2 + ')(?:は|が|も)[^。「」]{0,24}$').test(narrOnly(inl)) && new RegExp('^(?:と|って)[^。「」]{0,10}?' + SPEECH).test(narrOnly(post.slice(0, 30)));
          if (preLead && !NEG_SPEECH.test(pl) && ns !== 'written') hb = { keep: 'pre-lead' };
          else if (inlineLead) hb = { keep: 'inline-lead' };
          else {
            var counter = [];
            if (r && r.noop && /^listener=/.test(r.why || '')) counter.push('listener');
            if (new RegExp(esc(hero)).test(q)) counter.push('addr-hero');
            if (fp){ var qf = FP_WORDS.filter(function(w){ return q.indexOf(w) >= 0; }); if (qf.length && qf.indexOf(fp) < 0 && q.indexOf(fp) < 0) counter.push('fp-mismatch'); }
            if (ns) counter.push('not-speech:' + ns);
            r = { rule: 'HB1', who: '???', why: (inType === 'SAY' ? 'SAY but not in the input' : (inType || '?') + ' turn') + '; no hero-speech evidence' + (counter.length ? '; counter=' + counter.join('+') : ''), strength: counter.length ? 'counter' : 'no-evidence' };
          }
        }
        if (!r && hb){ out.push({ idx: idx, rule: null, hb1: hb.keep, ns: ns || undefined }); return; }
      }
      if (!r && ns){ r = { rule: 'NS1', who: cur, why: 'not speech: ' + ns, noop: true }; }
      if (!r){ out.push({ idx: idx, rule: null, why: nextQuote ? 'next-is-quote' : undefined }); return; }
      if (ns) r.ns = ns;
      r.idx = idx; r.cur = cur; r.kind = c.kind || null; r.q = q.slice(0, 24);
      r.change = !r.noop && r.who !== cur;
      r.applicable = r.change && bare;   // モデルが who を書いたカードは変えない（記録だけ）
      if (r.change && !bare) r.tagConflict = true;
      out.push(r);
    });
    return out;
  }

  // ---- 配線（新ターンの appendTurn の後で読むだけ。Apply のときだけ前で who を書き換える） ----
  var LOG = [], stats = { turns: 0, proposals: 0, changes: 0, applied: 0, errors: 0 };
  function getS(){ try { var a = root.__chronicleGetState ? root.__chronicleGetState('spk2') : null; if (a) return a; } catch(e){} try { return root.S || null; } catch(e){ return null; } }
  function getUI(){ try { return root.UI || (typeof UI !== 'undefined' ? UI : null); } catch(e){ return null; } }
  function fpOf(desc){ var m = String(desc || '').match(/一人称は「([^」]+)」/); return m ? m[1] : null; }
  function fpNarrOf(S, fp, hero){
    if (!fp) return false; var body = '';
    try { (S.turns || []).forEach(function(t){ body += narrOnly(Array.isArray(t.narrative) ? t.narrative.join('\n') : String(t.narrative || '')) + '\n'; }); } catch(e){}
    var n = (body.match(new RegExp(esc(fp) + '(?:は|が|の|も|を|に)', 'g')) || []).length, h = (body.match(new RegExp(esc(hero) + '(?:は|が)', 'g')) || []).length;
    return n >= 2 && n > h;
  }
  function ctxOf(turn, S){
    var hero = (S && S.cast && S.cast.hero && S.cast.hero.name) || '';
    var npcs = ((S && S.cast && S.cast.npcs) || []).map(function(n){ return { name: n && n.name, gender: n && n.gender }; }).filter(function(n){ return n.name; });
    var narr = Array.isArray(turn.narrative) ? turn.narrative.join('\n') : String(turn.narrative || '');
    var meta = Array.isArray(turn._convSayMeta) && turn._convSayMeta.length === (turn._convSays || []).length ? turn._convSayMeta : null;
    var fp = fpOf(S && S.cast && S.cast.hero && S.cast.hero.desc);
    /* meta（fix616）がまだ無い＝appendTurn の前（適用モード）は、turn.plan.narrative（<say who> が残っている）で 裸の「」か タグか を決める */
    var pn = ''; try { pn = (turn.plan && Array.isArray(turn.plan.narrative)) ? turn.plan.narrative.join('\n') : ''; } catch(_p){}
    var tagged = {}; try { var tre = /<say\b[^>]*who="[^"]*"[^>]*>([\s\S]*?)<\/say>/g, tm; while ((tm = tre.exec(pn)) !== null) tagged[loose(tm[1])] = 1; } catch(_t){}
    function kindNoMeta(c){ if (!c) return 'unknown'; if (c._rv) return 'react-voice'; var l = loose(c.say); if (!l) return 'unknown'; if (tagged[l]) return 'say-tag'; if (c._b || (pn && pn.indexOf('「' + String(c.say).replace(/^「|」$/g, '')) >= 0)) return 'bare'; return 'unknown'; }
    var cards = (turn._convSays || []).map(function(c, i){ return { who: c && c.who, say: c && c.say, kind: meta ? (meta[i] && meta[i].sourceKind) || 'unknown' : kindNoMeta(c), off: meta && meta[i] ? meta[i].charOffset : null }; });
    var present = [hero].concat(npcs.map(function(n){ return n.name; })).filter(function(n){ return n && (narr.indexOf(n) >= 0 || (turn._convSays || []).some(function(c){ return c && c.who === n; })); });
    return { narrative: narr, cards: cards, hero: hero, heroGender: S && S.cast && S.cast.hero && S.cast.hero.gender, firstPerson: fp, fpNarr: fpNarrOf(S, fp, hero), npcs: npcs, present: present,
             inputType: turn.inputType, inputText: turn.playerText };   /* HB1: その回の入力（種別と文面） */
  }
  function record(turnNo, props, phase){
    var rows = props.filter(function(x){ return x.rule; });
    var ent = { t: Date.now(), turn: turnNo, phase: phase, rows: rows.map(function(x){ /* ★影の記録に名前・台詞・理由文を残さない（GPT #127-SS 条件・Vault ルール）: 種別と長さだけ */ function nk(v){ return v == null ? null : (v === '???' ? 'unknown' : 'named'); } return { idx: x.idx, rule: x.rule, curKind: nk(x.cur), whoKind: nk(x.who), change: !!x.change, applicable: !!x.applicable, tagConflict: !!x.tagConflict, qLen: (x.q == null ? null : String(x.q).length), kind: x.kind, ns: x.ns, strength: x.strength }; }) };
    LOG.push(ent); if (LOG.length > 200) LOG.shift();
    stats.proposals += rows.length; stats.changes += rows.filter(function(x){ return x.change; }).length;
    if (rows.length){ try { var ring = JSON.parse(ls('v292DfixSPK2Ring') || '[]'); if (!Array.isArray(ring)) ring = []; ring.push(ent); while (ring.length > 30) ring.shift(); root.localStorage.setItem('v292DfixSPK2Ring', JSON.stringify(ring)); } catch(e){} }
    return ent;
  }
  function install(){
    var U = getUI(); if (!U || typeof U.appendTurn !== 'function') return false;
    if (U.__v292DfixSPK2) return true;
    var oa = U.appendTurn.bind(U);
    U.appendTurn = function(turn, idx){
      var applied = 0;
      try {
        if (applyOn() && turn && Array.isArray(turn._convSays)){
          var S0 = getS(), pr = decide(ctxOf(turn, S0));
          pr.forEach(function(x){ if (x.applicable && turn._convSays[x.idx]){ turn._convSays[x.idx].who = x.who; applied++; } });
          if (applied){ stats.applied += applied; record(S0 && S0.turns ? S0.turns.length : null, pr, 'apply'); try { if (S0 && typeof S0.save === 'function') (typeof S0.saveC === 'function' ? S0.saveC('spk2.apply') : S0.save()); } catch(_sv){ stats.errors++; } }
        }
      } catch(e){ stats.errors++; }
      var ret = oa(turn, idx);
      try { if (on() && !applied && turn){ stats.turns++; var S = getS(); record(S && S.turns ? S.turns.length : null, decide(ctxOf(turn, S)), 'shadow'); } } catch(e2){ stats.errors++; }
      return ret;
    };
    U.__v292DfixSPK2 = true;
    return true;
  }
  if (root.document){ (function w(){ w._n = (w._n || 0) + 1; if (install()) return; if (w._n > 120) return; setTimeout(w, 500); })(); }
  root.__v292DfixSPK2 = { VER: VER, decide: decide, ctxOf: ctxOf, on: on, applyOn: applyOn,
    log: function(){ return JSON.parse(JSON.stringify(LOG)); }, ring: function(){ try { return JSON.parse(ls('v292DfixSPK2Ring') || '[]'); } catch(e){ return []; } },
    stats: function(){ return JSON.parse(JSON.stringify(stats)); } };
})(typeof window !== 'undefined' ? window : globalThis);
