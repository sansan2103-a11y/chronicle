// =====================================================================
// Chronicle TRPG - v292Dfix469: 話者同定「点数制＋否定証拠＋棄権」 v2
// ---------------------------------------------------------------------
// v1(2026-07-13): GPT-5.6設計の点数制。候補=登録キャストのみ。
// v2(2026-07-18): 実プレイで会話ログ誤り多発 → 実データ診断+GPT-5.6再レビューで作り直し。
//   実測した破壊例: 未登録話者「若い男」が候補に入らないため、正しい who=若い男 のカードを
//   「リカの声は震えていなかった」(直前行・完結した描写文)の105点で リカ へ"高確度"flipしていた。
//   GPT判定の要点:
//     ①originalWho(現在の割当)は必ず候補化し +60(タグ保護)。未登録whoも登録キャストと同格。
//     ②汎用人物ラベル(若い男等)は発話帰属構文に現れた場合だけ候補化。1文字ラベル(男/女)は禁止
//       (彼女/少女に部分一致して大事故=実測)。
//     ③声の証拠を分離: 台詞直後の「Xの声が低くなる」+115 / 直前の導入形「Xの声がした」+90 /
//       直前の完結した描写文「Xの声は震えていなかった。」+25(前も台詞行なら0=前の台詞への反応)。
//     ④flipは強い反証時だけ(挑戦者に局所ハード証拠 かつ 差55以上)。
//       拮抗した強い競合は【新ターンのみ】カード非表示(誤表示より欠落)。過去ターンは振替のみ。
//     ⑤確定後は凍結。全過去ターンの永続再採点を廃止(新ターンを最大3回評価して凍結)。
//   ※エコー反問(−25)とレジスタ矛盾(−15)は条件が厳格なため今回は未実装(GPT: 直後の声で足りる)。
//
// 既定ON。OFF: localStorage v292Dfix469Off='1'
// 検証口: window.__v292Dfix469 = { stats, profiles, score, decide, planTurn, repair, dryRun }
// バックアップ: 最初の変更前に chr6 → chr6_bk_fix469
// =====================================================================
(function(){
  'use strict';
  if (window.__f469done) return; window.__f469done = 2;
  var TAG = '[v292Dfix469:speaker-score]';

  function off(){ try { return localStorage.getItem('v292Dfix469Off') === '1'; } catch(e){ return false; } }
  /* ★fix539(2026-07-25・GPT監査P0): S の取得は index.html が提供する正式APIを第一経路にする。
     背景: 間接eval 頼みの取得が実機で無言のまま null を返し、判定が丸ごと空振りした
     (実測: normalizeConvWho が 0 件。詳細は index.html の fix539 コメント)。
     fix538b の「一度取れた S を覚える」永続キャッシュは、別スロットの S を握り続ける危険があるため撤去。
     以降の3経路は index.html が古いキャッシュのときだけ使う移行期の後方互換。 */
  function note539(feature, reason, err){
    try { if (window.__chronicleState && typeof window.__chronicleState.note === 'function')
            window.__chronicleState.note(feature, reason, err); } catch(e){}
  }
  function getS(){
    var g = null;
    try { g = window.__chronicleGetState; } catch(e){}
    if (typeof g === 'function'){
      try { var a = g('fix469'); if (a) return a; } catch(e){ note539('fix469', 'getter-threw', e); }
    } else { note539('fix469', 'getter-missing'); }
    /* ここから下は index.html が fix539 より古いキャッシュのときだけ通る移行期の後方互換。
       ★fix539b(GPT裁定): 正式APIが失敗したのにフォールバックが救えた場合は必ず記録する
       (「getterは失敗するのに旧経路は成功する」が再捕獲できれば機序特定の決定打になる)。 */
    /* ★fix539c: window.S を lexical S より先に見る。理由は2つ:
         (1) GPTが示した統一形もこの順序。(2) **読取専用フォレンジックの土台**。
         配信JSを new Function へ流してモックwindowを渡す検証手法では、bare S は
         **本物のページの const S へ解決してしまう**(実測: モック7ターンのはずが本物38ターンを返した)。
         window.S を先に見れば、モックを渡した時にモックが勝つ。本番では window.S は
         undefined なので、この順序変更で本番の挙動は変わらない。 */
    try { if (window.S){ note539('fix469', 'rescued-by-window'); return window.S; } } catch(e){}
    try { if (typeof S !== 'undefined' && S){ note539('fix469', 'rescued-by-lexical'); return S; } } catch(e){}
    try { var u = (0,eval)('typeof S!=="undefined"?S:null');
          if (u){ note539('fix469', 'rescued-by-eval'); return u; }
          note539('fix469', 'legacy-eval-null'); }
    catch(e){ note539('fix469', 'legacy-eval-threw', e); }
    return null;
  }
  function norm(s){ return String(s || '').replace(/[\s　。、，．！？!?…‥・「」『』]/g, ''); }
  function nospace(s){ return String(s || '').replace(/[\s　]/g, ''); }

  // ---------- キャラの口調カルテ（v1のまま・否定証拠専用） ----------
  var PRONOUNS = ['ウチ','うち','あたし','あたい','わたくし','わたし','私','俺','おれ','オレ','僕','ぼく','ボク','わし','儂','自分'];
  var KANSAI = /(やろ|やん|やで|せや|へん(?![どに])|ちゃう|やねん|なんや|あかん|ええ(?:で|わ|やん)|とる|しとん|おる(?:んか|で|やろ)|ちゃうか|ほんま)/;
  var POLITE_STD = /(です|ます|ですね|でしょう|ください)/;

  function profiles(S){
    var out = [];
    try {
      var list = [];
      if (S && S.cast){
        if (S.cast.hero && S.cast.hero.name) list.push(S.cast.hero);
        (S.cast.npcs || []).forEach(function(n){ if (n && n.name) list.push(n); });
      }
      list.forEach(function(c){
        // 根治: voiceは文字列とは限らず {raw:"ウチ", fp:"私", ...} のオブジェクト登録がある。
        //   String(c.voice)="[object Object]" で一人称を取り逃していた(実測: ひなた voice.raw="ウチ")。
        var voiceStr = (c.voice && typeof c.voice === 'object')
          ? String((c.voice.fp || '') + ' ' + (c.voice.raw || '') + ' ' + (c.voice.tone || c.voice.desc || ''))
          : String(c.voice || '');
        var d = String((c.desc || '') + ' ' + (c.tone || '') + ' ' + voiceStr);
        var _g = String(c.gender||''); var gnorm = /女/.test(_g)?'女':(/男/.test(_g)?'男':'');
        var p = { name: String(c.name).trim(), fp: '', kansai: false, gender: gnorm };   // fix498: 明示genderのみ(代名詞からの逆算はしない)
        // 根治: voiceオブジェクトに登録された一人称(fp/raw)を最優先で採用(PRONOUNS照合)
        try {
          if (c.voice && typeof c.voice === 'object'){
            var vr = String(c.voice.fp || c.voice.raw || '').trim();
            if (vr && PRONOUNS.indexOf(vr) >= 0) p.fp = vr;
          }
        } catch(e){}
        if (!p.fp){
          var m = d.match(/一人称[はは:：]?\s*[「『"]?([^\s」』"、。]{1,4})/);
          if (m && PRONOUNS.indexOf(m[1]) >= 0) p.fp = m[1];
        }
        if (!p.fp){
          for (var i = 0; i < PRONOUNS.length; i++){
            if (d.indexOf('「' + PRONOUNS[i] + '」') >= 0){ p.fp = PRONOUNS[i]; break; }
          }
        }
        if (/関西弁|大阪弁|京都弁|関西訛/.test(d)) p.kansai = true;
        out.push(p);
      });
    } catch(e){}
    return out;
  }

  // ---------- 名前トークン（fix462と同じ考え方） ----------
  var KANJI = /[一-鿿]/;
  function tokensOf(names){
    var full = names.map(nospace), out = [];
    names.forEach(function(n, i){
      var f = full[i]; if (!f) return;
      var cand = {}; cand[f] = 1;
      String(n).split(/[\s　・]+/).filter(Boolean).forEach(function(p){ if (p.length >= 2) cand[p] = 1; });
      var m = f.match(/^([一-鿿]{1,4})([ぁ-ゟァ-ー]{2,4})$/);
      if (m){ cand[m[1]] = 1; cand[m[2]] = 1; }
      if (/^[一-鿿]{3,5}$/.test(f)){ cand[f.slice(-1)] = 1; cand[f.slice(0, -1)] = 1; }
      Object.keys(cand).forEach(function(t){
        if (!t) return;
        if (t.length === 1 && !KANJI.test(t)) return;
        for (var j = 0; j < full.length; j++){
          if (j === i) continue;
          if (full[j].indexOf(t) >= 0 || t.indexOf(full[j]) >= 0) return;
        }
        out.push({ canon: names[i], tok: t });
      });
    });
    out.sort(function(a,b){ return b.tok.length - a.tok.length; });
    return out;
  }

  // ---------- v2: 未登録話者の候補化 ----------
  // ①ターン内_convSaysの既存who(=originalWho含む)は無条件で候補(GPT: 絶対に落とさない)
  // ②汎用ラベルは「発話帰属構文」で本文に現れた場合だけ候補化(地の文の一般名詞を拾わない)
  // ★1文字ラベル(男/女)は禁止: 彼女/少女/長男 等に部分一致して大事故になる(実測)
  var PRONOUN_WHO = ['私','俺','僕','彼','彼女','あなた','お前','君','誰か','自分']; // fix495(B1)
  function _dropOn(){ try { return localStorage.getItem('v292Dfix469DropOn') === '1'; } catch(e){ return false; } }  // fix495(B5)
  var _stats = { wouldDrop: 0, backupFail: 0, wouldPronounFlip: 0, pronounAmbiguous: 0, pronounNoGender: 0, wouldToneFlip: 0, toneConflict: 0 };  // fix498: 代名詞ブリッジ診断 / 根治: 口調ブリッジ
  var GENERIC_LABELS = ['若い男','若い女','若者','青年','老人','老婆','老爺','少年','少女','子供','男性','女性','人影','黒衣の男','黒衣の女'];
  var ATTR_CONSTRUCT = '(の(?:声|口調|言葉|囁き|呟き|悲鳴|叫び)|[はが](?:[^。、\\n]{0,6})?(?:言|口を開|続け|答え|尋ね|叫|呟|囁|告げ|問い|返し|吐き捨て))';
  function extraTokens(t, names, narr){
    var known = {}, out = [], cand = {};
    names.forEach(function(n){ known[nospace(n)] = 1; });
    try {
      ((t && t._convSays) || []).forEach(function(c){
        var w = c && c.who ? String(c.who).trim() : '';
        if (!w || w === '???' || known[nospace(w)]) return;
        // fix495(B1): 1文字ラベル・代名詞whoを候補トークンにしない(「女」が「彼女の声…」に
        // 部分一致してvoiceAfter+115を取り、正しいwho(+60)を55差でflipする実測事故の遮断)
        if (w.length < 2 || PRONOUN_WHO.indexOf(w) >= 0) return;
        cand[w] = 1;
      });
      GENERIC_LABELS.forEach(function(g){
        if (known[g] || cand[g]) return;
        try { if (new RegExp(g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ATTR_CONSTRUCT).test(String(narr || ''))) cand[g] = 1; } catch(e){}
      });
      var ks = Object.keys(cand);
      ks.forEach(function(k){
        for (var j = 0; j < ks.length; j++){
          if (ks[j] !== k && ks[j].indexOf(k) >= 0) return;   // 男性⊂若い男性 → 短い方を捨てる
        }
        for (var n2 in known){ if (n2.indexOf(k) >= 0 || k.indexOf(n2) >= 0) return; } // 登録名と衝突
        out.push({ canon: k, tok: k });
      });
    } catch(e){}
    return out;
  }

  // ---------- 証拠検出 ----------
  var SPEECH = /(言っ|言う|言い|呟|囁|尋ね|問い|問う|答え|叫|返し|応じ|漏らし|告げ|呼ん|続け|笑っ|吐き捨て|口を開)/;
  /* ★fix610(2026-07-28・おしんの実セーブで捕獲→単独実行で真因確定):
       「真鍋は**封筒の口を開**けた。」の「口を開」を発話動詞と誤認し、
       反応しているだけの人物へ speechAfter=140(ハード証拠)を与えて、
       **モデルが `<say who="霧 涼太">` と明示していたカードを 真鍋 ひかり へ反転**させていた。
       実データ: 8wfr8b T1 / 発話は「……何か、言ってなかったか。あの日、何か」＝主人公の問いかけ。
     「口を開く」は発話の慣用句だが、**直前が所有の「の」なら器物の口**（封筒の口・瓶の口・袋の口）。
     ★lookbehind は使わない（iOS Safari の対応差を持ち込まない）。
       「の口を開」を**取り除いてから**もう一度判定する。他に発話動詞が残っていれば従来どおり真になる。
     OFF: localStorage v292Dfix610Off='1' */
  function f610off(){ try { return localStorage.getItem('v292Dfix610Off') === '1'; } catch(e){ return false; } }
  function speechTest(s){
    var t = String(s || '');
    if (!SPEECH.test(t)) return false;
    if (f610off()) return true;
    return SPEECH.test(t.replace(/の口を開/g, ''));
  }
  var VOICE  = /^の[^。、\n]{0,4}(声|言葉|囁き|呟き|悲鳴|叫び)/;
  // 導入形: 「Xの声がした」→次(または直結する)台詞の話者。描写形: 「Xの声は震えていなかった」=完結した描写。
  var VOICE_INTRO = /^の[^。、\n]{0,4}(?:声|言葉|囁き|呟き|悲鳴|叫び)(?:が(?:した|して|する|響|聞こえ|上がっ|飛ん|割り込)|で(?:言|尋|囁|呟|叫|告げ|続け))/;
  var SUBJ   = /^[はが]/;
  var SUBJ_ACT = /^[はがも]/;
  var REACT_LEAD = /^[\s　]*(言われて|それを聞い|その言葉|その声|聞いて|返事を|問われ)/;

  // 1行の中で tok がどう出てくるか。isNext=台詞の直後行 / sandwiched=直前行だがその前も台詞行
  /* ★fix535(2026-07-25・実プレイで捕獲→オフラインで真因確定→GPT監査で設計確定):
     真因: 引用直後の証拠が `SUBJ.test(tail) && SPEECH.test(s)` で、**発話動詞を行全体から探していた**。
       そのため「『はず』という【言葉】に、アリアは引っかかりを覚える」の「言葉」1語だけで
       「発話動詞あり」と誤判定し、反応しているだけの人物へ speechAfter=140(ハード証拠)を与えていた。
       実測(実機プレイ・テスト物語 sms063dyz8l T2): 正しくカエデに付いていたカードが
       アリア・リュミエールへ score140 で反転。候補8fixを単独実行して fix469 のみが再現した。
     修正(GPTレビュー反映・**next方向だけ**。prev方向は不触):
       (a) 発話動詞は**名前の直後(tail)に結び付いている時だけ**ハード証拠にする
           →「『行こう』アリアは言った」は従来どおり140。
       (b) 名前が**反応フレーム**の中にある(「〜という言葉に、Xは」「その声に、Xは」「〜に対して、Xは」)、
           または**反応・認知・感情の述語**が直後に続く(引っかかる/驚く/気づく/振り返る…)場合は
           **話者証拠にしない(0点)**。聞き手として減点まではしない
           (自分の発言に自分で驚く場合があるため、判断は明示話者・タグ・直前カード等へ委ねる)。
       (c) 裸の「名前＋は/が」は従来どおり subj=40。HARD(90)未満なので単独では flip を起こせない。
     OFF: localStorage v292Dfix535Off='1' (=従来の行全体判定へ戻る) */
  var REACT_FRAME = /(?:言葉|台詞|セリフ|科白|声|問い|問いかけ|質問|返事|返答|発言|一言|話|指摘)に(?:対して)?[、,]?[\s　]*$/;
  var REACT_PRED  = /(思|感じ|気づ|気付|覚え|引っかか|引っ掛か|驚|見つめ|見返|振り返|振り向|考え|迷|眉|息を呑|息をの|戸惑|首をかし|首を傾|目を見開|見開|眉根|訝|怪訝|唖然|絶句|理解|悟|察|納得|違和感)/;
  function off535(){ try { return localStorage.getItem('v292Dfix535Off') === '1'; } catch(e){ return false; } }
  function evidenceIn(line, tok, isNext, sandwiched){
    var s = String(line || '');
    if (isNext && REACT_LEAD.test(s)) return null;
    var best = null, bestPt = -1, p = s.indexOf(tok);
    var strict = !off535();
    function offer(kind, pt){ if (pt > bestPt){ best = kind; bestPt = pt; } }
    while (p >= 0){
      var tail = s.slice(p + tok.length, p + tok.length + 14);
      var head = s.slice(Math.max(0, p - 20), p);
      if (VOICE.test(tail)){
        if (isNext) offer('voiceAfter', 115);
        else if (VOICE_INTRO.test(tail)) offer('voiceIntro', 90);
        else if (!sandwiched) offer('voiceDesc', 25);
      }
      var reacting = strict && isNext && (REACT_FRAME.test(head) || REACT_PRED.test(tail));
      if (SUBJ.test(tail) && !reacting){
        var speechNear = isNext ? speechTest(strict ? tail : s) : speechTest(s);
        if (speechNear) offer(isNext ? 'speechAfter' : 'speechBefore', isNext ? 140 : 115);
        else offer('subj', isNext ? 40 : 20);
      }
      else if (isNext && SUBJ_ACT.test(tail) && !reacting) offer('subj', 40);
      p = s.indexOf(tok, p + 1);
    }
    return best ? { kind: best, pts: bestPt } : null;
  }

  var PTS = { voiceAfter: 115, speechAfter: 140, voiceIntro: 90, voiceDesc: 25, speechBefore: 115 };
  var HARD = 90;   // 局所ハード証拠の下限(単一証拠で)

  // say=台詞本文, prev/next=前後の地の文, prevSand=直前行のさらに前も台詞行
  // 返り値: { sc: {name:点}, hard: {name:最大単一証拠点} }
  /* ★fix542(2026-07-25・GPT裁定): 引用の**直前の地の文**を構文タイプへ分類し、
       「Xの声が掠れた/響いた/落ちた」型だけを**次の1件限りの発話アンカー**として扱う。
     由来(実データ・離島17T T8 #2): 直前が「大浦の声が掠れている。」なのに、
       prev側の証拠は 25点・hardなし で、台詞が涼太のまま残った(next側なら voiceAfter=115)。
       **前後で重みが極端に非対称**なのが直接原因。
     GPTが一律hard化を却下した理由(そのまま採用):
       ・「Xの声に、Yは〜」     → X は**聞かれた側**。次の話者候補は Y
       ・「Xの声を遮ってYが〜」 → 次の話者候補は Y
       ・「Xの声を思い出した」   → 現在の話者証拠ではない
       単なる文字列一致ではなく、この4型を分けてから使う。
     この版は **分類器と診断だけ**。得点・判定には一切影響させない(GPTの出荷順①)。
     読出: window.__v292Dfix469.preQuoteAnchor(prevLine, names) */
  var PQ_SELF  = /(の(?:声|囁き|呟き|返事|問い)が)[^。]{0,12}?(掠れ|震え|響|落ち|上が|漏れ|飛|続|重な|割り込|滑り出|零れ|こぼれ|走|届)/;
  var PQ_TO    = /(の(?:声|囁き|呟き|問い|言葉|質問|発言))(?:に|へ)(?:対して)?[、,]/;
  var PQ_CUT   = /(の(?:声|言葉|話))を(?:遮|さえぎ|かき消|押しのけ)/;
  var PQ_RECAL = /(の(?:声|言葉))を(?:思い出|反芻|反復|覚え)/;
  /* 「大浦は門のプレートから指を離さないまま、口を開いた」のように主語と述語が離れるので
     助詞との隣接は要求しない。直前に出てくる**最も近い登場人物名**を主体とみなす。
     「Xの声に、Yは口を開いた」型は PQ_TO が先に use:false を返すので安全側に倒れる。 */
  var PQ_OPEN  = /(?:口を開|口を切|声を(?:上げ|あげ|出し|落と|潜め|ひそめ))/;
  function preQuoteAnchor(prevLine, names){
    var line = String(prevLine || '');
    if (!line) return null;
    function whoAt(re){
      var m = line.match(re); if (!m) return null;
      var head = line.slice(0, m.index);
      var best = null;
      for (var i = 0; i < names.length; i++){
        var n = names[i]; if (!n) continue;
        var cands = [n];
        if (n.indexOf(' ') > 0){ var pp = n.split(/[\s　]+/); cands = cands.concat(pp); }
        for (var j = 0; j < cands.length; j++){
          var pos = head.lastIndexOf(cands[j]);
          if (pos >= 0 && (!best || pos > best.pos)) best = { name: n, pos: pos };
        }
      }
      return best ? best.name : null;
    }
    /* 「Xの声を思い出した」= 証拠ではない。最優先で除外 */
    if (PQ_RECAL.test(line)) return { kind: 'recalled', name: null, use: false };
    /* 「Xの声を遮ってYが〜」= 次の話者は Y(遮った側) */
    if (PQ_CUT.test(line)) return { kind: 'interrupted', name: null, use: false };
    /* 「Xの声に、Yは〜」= X は聞かれた側 */
    if (PQ_TO.test(line)) return { kind: 'addressed-to', name: null, use: false };
    /* 「Xの声が掠れた/響いた/落ちた」= X が話し手 */
    var w = whoAt(PQ_SELF);
    if (w) return { kind: 'pre-quote-voice', name: w, use: true, confidence: 'hard' };
    /* 「Xは口を開いた」= 発話開始アンカー */
    w = whoAt(PQ_OPEN);
    if (w) return { kind: 'pre-quote-open', name: w, use: true, confidence: 'hard' };
    return null;
  }

  function score(say, prev, next, tokens, profs, prevSand){
    var sc = {}, hard = {};
    function add(n, v){ sc[n] = (sc[n] || 0) + v; }
    function markHard(n, v){ if (!hard[n] || v > hard[n]) hard[n] = v; }
    tokens.forEach(function(t){
      var e1 = evidenceIn(next, t.tok, true, false);
      if (e1){ add(t.canon, e1.pts); if (e1.pts >= HARD) markHard(t.canon, e1.pts); }
      var e0 = evidenceIn(prev, t.tok, false, !!prevSand);
      if (e0){ add(t.canon, e0.pts); if (e0.pts >= HARD) markHard(t.canon, e0.pts); }
      /* ★fix536b(2026-07-25・30ターン実機で捕獲): 自己紹介を「呼びかけ」と誤判定しない。
         実測(T9): 少女が『シオンっていうんだ……たぶん』と名乗った直後、
         この -35 が シオン に効いて話者から外れ、カードが シオン→少女 へ書き換わった。
         台詞の中の名前が「っていう/という/と呼/です/だ」等の**名乗り**に続く場合は
         呼びかけではなく自己紹介なので減点しない。OFF: v292Dfix536Off='1' */
      var sayS = String(say || ''), tp = sayS.indexOf(t.tok);
      if (tp >= 0){
        var after = sayS.slice(tp + t.tok.length, tp + t.tok.length + 8);
        var naming = (function(){ try { return localStorage.getItem('v292Dfix536Off') !== '1'; } catch(e){ return true; } })()
                     && /^(?:って(?:いう|言う)|という|と言う|と呼|です|だ[。、！\s]?|——|、|・)/.test(after);
        if (!naming) add(t.canon, -35);   // 呼びかけ=話者でない
      }
    });
    // 口調の否定証拠（正の同定には使わない・v1のまま）
    var text = String(say || '');
    var fps = PRONOUNS.filter(function(p){ return text.indexOf(p) >= 0; });
    profs.forEach(function(p){
      if (!p.name) return;
      if (p.fp && fps.length){
        var usesOther = fps.some(function(f){ return f !== p.fp; });
        var usesOwn = fps.indexOf(p.fp) >= 0;
        if (usesOther && !usesOwn) add(p.name, -50);
        else if (usesOwn) add(p.name, 20);
      }
      if (p.kansai){
        if (KANSAI.test(text)) add(p.name, 15);
        else if (POLITE_STD.test(text) && text.length >= 8) add(p.name, -35);
      }
    });
    return { sc: sc, hard: hard };
  }

  var TAG_BONUS = 60;    // originalWho保護(GPT: +60。+1000にすると誤タグを直せない)
  var FLIP_MARGIN = 55;  // flip条件: 挑戦者にハード証拠 かつ 差55以上

  // v2判定。isNew=読み込み後の新ターン(拮抗時の非表示を許可)
  // 返り値: {act:'keep'|'flip'|'drop', to?, score?}
  function decide(res, current, isNew){
    var sc = res.sc || res;            // 後方互換(旧API: scマップ直渡し)
    var hard = res.hard || {};
    var cur = String(current || '');
    var curScore = (sc[cur] || 0) + TAG_BONUS;
    var challenger = null;
    Object.keys(sc).forEach(function(k){
      if (k === cur) return;
      if (!challenger || sc[k] > challenger.score) challenger = { who: k, score: sc[k] };
    });
    if (!challenger || challenger.score <= 0) return { act: 'keep' };
    var challengerHard = !!hard[challenger.who];
    if (challengerHard && (challenger.score - curScore) >= FLIP_MARGIN)
      return { act: 'flip', to: challenger.who, score: challenger.score };
    if (isNew && challengerHard && challenger.score > curScore)
      return { act: 'drop', score: challenger.score };   // 拮抗した強い競合 → 誤表示より欠落
    return { act: 'keep' };
  }

  function findLine(lines, quote){
    var q = norm(quote); if (!q) return -1;
    for (var i = 0; i < lines.length; i++){
      var l = String(lines[i] || '').trim();
      if (!/^[「『]/.test(l)) continue;
      if (norm(l) === q) return i;
    }
    return -1;
  }

  // ---------- fix498(C+): 代名詞ブリッジ shadow診断(自動flipしない・記録のみ・GPT裁定) ----------
  //   heroタグ・非入力・直後行が名前なしの代名詞声・直前地の文に非heroが1人だけ明記・直前カードと一致・
  //   性別明示一致 の全AND成立時のみ wouldPronounFlip を記録する。書換・保存・カード変更は一切しない。
  var _PRON_G = { '女':'彼女', '男':'彼' };
  // ---------- fix508: 代名詞ブリッジ shadow診断の「追加専用」永続ログ ----------
  //   目的: 普段のプレイで wouldPronounFlip 検知例を貯め、後で全件を人間レビュー→自動flip解禁の材料にする。
  //   安全: 専用キー(v292Dfix469_pshadow)のみ書く。chr6/セーブ/カード/S.turns は一切触らない。
  //         slot|turnFp|i|from|cand|say で dedup(再読込で同一例を重複追記しない)。上限リングで最新200件保持。
  //         書込失敗(quota等)は握りつぶし=ゲーム/セーブ経路へ波及させない(fail-closed)。
  var _PLOG_KEY = 'v292Dfix469_pshadow', _PLOG_CAP = 200;
  function _plogKey(r){ return [r.slot, r.turnFp, r.i, r.from, r.cand, r.say].join('|'); }
  function _pshadowLog(r){
    try {
      var raw = localStorage.getItem(_PLOG_KEY);
      var db = raw ? JSON.parse(raw) : null;
      if (!db || db.v !== 1 || !Array.isArray(db.recs)) db = { v: 1, recs: [] };
      var k = _plogKey(r);
      for (var j = 0; j < db.recs.length; j++){ if (db.recs[j] && db.recs[j].k === k) return; }  // dedup: 既出は追記しない
      r.k = k; db.recs.push(r);
      if (db.recs.length > _PLOG_CAP) db.recs.splice(0, db.recs.length - _PLOG_CAP);              // リング: 古い順に落とす
      localStorage.setItem(_PLOG_KEY, JSON.stringify(db));
    } catch(e){}   // fail-closed
  }
  //   allTokens=[{canon(登録名), tok(短縮含む)}]。本文照合はtokで行い canon に写す(短縮名対応)。
  function pronounShadow(cs, i, lines, at, heroName, profs, allTokens){
    try {
      var c = cs[i];
      if (i === 0) return;                                   // card0(実発話)保護
      if (!c || c._rv === 1) return;
      if (String(c.who||'') !== heroName) return;            // heroタグのみ
      var nextLine = String(lines[at+1]||'').trim();
      var pm = nextLine.match(/^[\s　「」]*(彼女|彼)の(声|言葉|囁き|呟き|叫び|悲鳴|息|手|指|足|体|身体|喉|唇|口|視線|目)/);
      if (!pm) return;                                       // 直後が名前なしの代名詞声でなければ対象外
      var pron = pm[1];
      // 直後行に(hero含む)いずれかの名前トークンが明記→既存の名前ベース判定に任せる
      for (var a=0;a<allTokens.length;a++){ if (allTokens[a].tok && nextLine.indexOf(allTokens[a].tok)>=0) return; }
      // 直前の地の文(sayの前1〜2行)に非heroが「1人だけ」明記されているか(トークン照合→canon)
      var prevText = String(lines[at-1]||'') + ' ' + String(lines[at-2]||'');
      var named = [];
      allTokens.forEach(function(tt){
        if (!tt.tok || tt.canon === heroName) return;
        if (prevText.indexOf(tt.tok) >= 0 && named.indexOf(tt.canon) < 0) named.push(tt.canon);
      });
      if (named.length > 1){ _stats.pronounAmbiguous++; return; }   // 複数明記→棄権(直近だけで推測しない)
      if (named.length !== 1) return;
      var cand = named[0];
      var prevCardWho = String((cs[i-1] && cs[i-1].who) || '');
      if (cand !== prevCardWho) return;                      // 直前カードのwhoと一致必須
      var cg = ''; profs.forEach(function(p){ if (p.name===cand) cg=p.gender; });
      if (!cg){ _stats.pronounNoGender++; return; }          // 性別未登録→棄権(代名詞からの逆算禁止)
      if (_PRON_G[cg] !== pron){ _stats.pronounNoGender++; return; }  // 男候補+彼女/女候補+彼→棄権
      _stats.wouldPronounFlip++;                             // ★全条件成立: 記録のみ(flipしない)
      try { console.log(TAG, '[wouldPronounFlip(shadow)]', String(c.who), '→', cand, String(c.say).slice(0,14)); } catch(e){}
      // fix508: 追加専用の永続ログへ(dedup・fail-closed・chr6/セーブ非破壊)
      try {
        _pshadowLog({
          ts: Date.now(),
          slot: _activeStoreKey(),
          turnFp: (String(lines[0]||'') + String(lines[1]||'')).slice(0, 40),
          i: i,
          from: String(c.who||''),
          cand: cand,
          say: String(c.say||'').slice(0, 40),
          voice: nextLine.slice(0, 40)
        });
      } catch(e){}
    } catch(e){}
  }

  // ---------- 根治: 口調ブリッジ（方言・特徴的一人称で名前無しセリフの話者を当てる） ----------
  //   背景: fix469は名前トークンの証拠(声115〜発話140)中心。名前の無いセリフは口調(方言/一人称)
  //     が弱み(+15〜+20)でタグ保護(+60)を超えられず、モデルの誤タグ(例: ひなたの関西弁→主人公)が
  //     残る=「丸ごと別人」振替ミスの温床。ここを"特徴的口調が単一話者に一意所属"の時だけ埋める。
  //   安全設計(このモジュールの実績パターンに準拠):
  //     ①名前トークンのハード証拠が皆無の時だけ検討(名前判定を上書きしない)。
  //     ②特徴的口調(方言 or 非汎用の一人称)が"登録キャストで唯一その口調を持つ者"に一致した時だけ。
  //     ③現whoがその口調を自分の口調として使っているなら棄権(=正しい関西弁を別人化する誤爆を封鎖)。
  //     ④owner名がセリフ内に出る=引用/呼びかけの疑い→棄権。
  //     ⑤実flipが既定ON(ユーザ選択2026-07-20)。振替を止めるなら v292Dfix469ToneFlipOff='1'。
  //       常にshadowログにも記録するので、後から toneDump() で全振替を追跡・検証できる。
  //       (モジュール全体を止めるなら従来どおり v292Dfix469Off='1')
  //   ※私/わたし/僕/あたし は汎用すぎるので flip 起点にしない(引用誤爆防止)。方言と非汎用一人称のみ。
  var DISTINCTIVE_FP = ['ウチ','うち','あたい','わっち','わし','儂','おいら','オイラ','拙者','某','わたくし','俺','おれ','オレ','ボク'];
  function _toneFlipOn(){ try { return localStorage.getItem('v292Dfix469ToneFlipOff') !== '1'; } catch(e){ return true; } }  // 既定ON

  function toneOwner(say, profs, cur, tokens){
    var text = String(say || '');
    if (!text || !profs || !profs.length) return null;
    var owners = {};   // name -> reasons[]
    // (1) 特徴的一人称: テキストに現れ、登録キャストで唯一その fp を持つ者
    for (var f = 0; f < DISTINCTIVE_FP.length; f++){
      var fp = DISTINCTIVE_FP[f];
      if (text.indexOf(fp) < 0) continue;
      var holders = [];
      for (var p = 0; p < profs.length; p++){ if (profs[p].fp && profs[p].fp === fp) holders.push(profs[p].name); }
      if (holders.length === 1){ (owners[holders[0]] = owners[holders[0]] || []).push('fp:' + fp); }
    }
    // (2) 関西弁: テキストが関西弁 かつ 登録キャストで唯一 kansai の者
    if (KANSAI.test(text)){
      var kh = [];
      for (var q = 0; q < profs.length; q++){ if (profs[q].kansai) kh.push(profs[q].name); }
      if (kh.length === 1){ (owners[kh[0]] = owners[kh[0]] || []).push('kansai'); }
    }
    var ns = Object.keys(owners);
    if (ns.length === 0) return null;                 // 手がかりなし
    if (ns.length > 1){ _stats.toneConflict++; return null; }   // 競合(別々の口調が別人を指す)→棄権
    var to = ns[0];
    if (to === String(cur || '')) return null;        // 現whoが所有=確定 → flipしない(誤爆防止)
    // 現whoが「自分の特徴的口調」をこのセリフで使っているなら競合 → 棄権
    var curP = null; for (var i2 = 0; i2 < profs.length; i2++){ if (profs[i2].name === String(cur || '')){ curP = profs[i2]; break; } }
    if (curP){
      if (curP.fp && DISTINCTIVE_FP.indexOf(curP.fp) >= 0 && text.indexOf(curP.fp) >= 0) return null;
      if (curP.kansai && KANSAI.test(text)) return null;
    }
    // owner名がセリフ内にある=呼びかけ/引用の可能性 → 棄権
    if (tokens){ for (var j = 0; j < tokens.length; j++){ if (tokens[j].canon === to && tokens[j].tok && text.indexOf(tokens[j].tok) >= 0) return null; } }
    return { to: to, reasons: owners[to] };
  }

  // ---------- 根治(2): 「先輩」呼び文脈ブリッジ ----------
  //   主人公は「先輩」と呼ばれる側で、自分を「先輩」と呼ばない。主人公タグのセリフが
  //   「先輩」呼びかけなら話者は非主人公。ただし誰かは口調では決まらない→
  //   直前後カードの非主人公が"1人だけ"に絞れる時だけその人へ振替、絞れなければ棄権。
  //   ※口調ブリッジ(toneOwner)が手がかりを出せなかった時の補完。既定ON・OFF共通。
  function callsSenpai(say){
    var s = String(say || '');
    return /先輩[！!？?…。、\s]*」?\s*$/.test(s) || /[、,]\s*先輩/.test(s) || /^\s*「?先輩[！!？?、]/.test(s);
  }
  function senpaiContext(cs, i, cur, heroName){
    if (!heroName || String(cur || '') !== String(heroName)) return null;   // 主人公タグのみ
    if (!cs || !cs[i] || !callsSenpai(cs[i].say)) return null;              // 先輩呼びのみ
    var cand = {};
    [cs[i-1], cs[i+1]].forEach(function(c){
      var w = c && c.who ? String(c.who).trim() : '';
      if (w && w !== String(heroName)) cand[w] = 1;
    });
    var ks = Object.keys(cand);
    if (ks.length !== 1) return null;                                       // 0 or 2+ → 棄権
    return { to: ks[0], reasons: ['senpai-context'] };
  }

  // 口調ブリッジ shadow の永続ログ(pshadowと同型・専用キー・dedup・fail-closed・chr6非破壊)
  var _TLOG_KEY = 'v292Dfix469_toneshadow', _TLOG_CAP = 200;
  function _toneShadowLog(r){
    try {
      var raw = localStorage.getItem(_TLOG_KEY);
      var db = raw ? JSON.parse(raw) : null;
      if (!db || db.v !== 1 || !Array.isArray(db.recs)) db = { v: 1, recs: [] };
      var k = [r.slot, r.turnFp, r.i, r.from, r.to, r.say].join('|');
      for (var j = 0; j < db.recs.length; j++){ if (db.recs[j] && db.recs[j].k === k) return; }
      r.k = k; db.recs.push(r);
      if (db.recs.length > _TLOG_CAP) db.recs.splice(0, db.recs.length - _TLOG_CAP);
      localStorage.setItem(_TLOG_KEY, JSON.stringify(db));
    } catch(e){}
  }

  // ---------- 感情主ブリッジ（手がかりゼロの声を、地の文の反応主で当てる） ----------
  //   背景(2026-07-20 実測): 拷問/苦痛の場面で「ひ、ひっ…！」等の手がかりゼロの悲鳴が
  //     主人公に吸われる(モデル誤タグ)。地の文「ひなたの体が弓なりに反った」等、直前後で
  //     "非主人公の身体/声が[反応]"(が=主語)が唯一1人だけ示される時、その人へ。
  //   ★安全設計(過去のリカ大事故を回避):
  //     ①主人公タグのカードだけ対象(登録NPCの正しいタグは動かさない)。
  //     ②「Xの<身体/声>が<反応動詞>」= が(主語)のみ。は/を(主題/目的語)は対象外
  //       (「リカの声は震えていなかった」=は の完結描写型を除外)。
  //     ③該当する非主人公が"1人だけ"の時のみ(複数/0=棄権)。
  //     ④名前の発話ハード証拠が既にある時は呼ばれない(呼び出し側 res.hard 空ガード)。
  var EMO_BODY = '(?:体|身体|全身|肩|背中|喉|喉元|唇|口|口元|息|呼吸|胸|指|指先|手|腕|腰|足|太腿|膝|頬|睫毛|まつげ|まぶた|瞼|目|瞳|視線|顎|頭|意識|声|悲鳴|呻き|嗚咽)';
  var EMO_REACT = '(?:反っ|反り|震え|震わ|痙攣|強張|こわば|跳ね|びく|くずお|崩れ|落ち|漏れ|漏らし|漏らそう|掻き|軋|よじ|捩じ|引き攣|ひきつ|止ま|波打|上ず|裏返|詰ま|こぼれ|ひくつ|わなな|動い|動く|言おう|言いかけ|開い|喘|あえ|むせ|呑ん|途切れ|飛ん|遠のい|抜け|かすれ|掠れ|呻|うめ|傾い|のけ反|よろ|ずり落ち|さまよ|泳い|見開)';
  //   ※地の文は短縮名(ひなた)で書かれるので、tokens(短縮形→canon)で照合する。
  //     1文字トークンは部分一致事故(「男」→彼女等)防止のため除外。
  //     "Xの<身体/声>が …(読点可・最大22字)… <反応/発声/動き動詞>"。が=主語限定(は/を除外)。
  /* ★★fix604(2026-07-27・おしんの実機で捕獲): 「声の出所」型を追加する。
     実データ:
        「……ぇ」
        ひなたの喉の奥から、引きつったような声が漏れる。
     ＝**その地の文自身が話者を名指している**のに、会話ログは主人公(白石澪)に振っていた。
     なぜ既存のブリッジで拾えなかったか:
       上の EMO_* は「Xの<部位>**が**」＝**主語の「が」限定**。
       「は」「を」は誤爆事故（「リカの声は震えていなかった」で大事故）を避けるため意図的に除外した。
       今回の文は「ひなたの喉**の奥から**」＝**起点の「から」**。が でも は でも を でもないので
       一致せず、モデルの誤タグがそのまま残った。
     ★「から」は「は」「を」と違い**曖昧ではない**: 「Xの<発声器官>から<声>が<出る>」は
       *声の出所が X* という意味しか持たない。だから主語の「が」と同格の手がかりとして扱える。
     ★安全側の作り:
       ・器官は**発声に関わる部位に限定**（「奥」「記憶」等の一般語は入れない。
         「Xの記憶の奥から声が蘇る」を拾わないため）
       ・<声>の直後は **「が」限定**（「Xの喉から漏れた声**を**、Yは聞いた」は拾わない＝棄権側）
       ・**否定の打ち消しを弾く**（「Xの喉から声が漏れることはなかった」＝X は喋っていない）
       ・該当が1人だけのときしか使わない（既存の棄権規則をそのまま継承）
     OFF: v292Dfix604Off='1' で**この追加分だけ**止まる（既存の「が」型は止まらない）。 */
  var VOICE_ORIFICE = '(?:喉|喉元|口|口元|唇|歯の隙間|歯の間|口の端)';
  var VOICE_NOUN    = '(?:声|悲鳴|呻き|うめき|嗚咽|吐息|息|囁き|ささやき|呟き|つぶやき|言葉|音)';
  var VOICE_EMIT    = '(?:漏れ|漏らし|零れ|こぼれ|溢れ|あふれ|ほとばし|飛び出|滑り出|押し出|出る|出た|出て)';
  /* 打ち消し: 一致した文の続き（同じ文の中）に否定・伝聞・推量・未遂が来たら証拠にしない。
     ★GPT指定: 「否定・未遂・仮定・回想・模倣・録音表現があれば棄権」。
       ・未遂  「Xの喉から声が漏れそうになったが、出なかった」
       ・伝聞  「Xの喉から声が漏れたように聞こえた」
       ・推量  「〜ようだ」「〜かのようだった」「〜らしい」「〜気がした」
     ★回想（「思い出した」）と模倣（「真似した」）と録音（「ラジオから」）は、
       いずれも <声>が<出る> の形にならない（「声を思い出した」＝を、「ラジオから」＝名前+器官が無い）ので
       構文の側で既に落ちる。テストで固定してある。 */
  var VOICE_NEG = /(?:なかった|ない|ません|ず(?:に|、|。)|ぬ(?:まま)?|そうにな|かけて(?:止|やめ)|ように(?:聞こえ|思え|感じ)|かのよう|ようだ|ような気|らしかった|気がした)/;
  function f604off(){ try { return localStorage.getItem('v292Dfix604Off') === '1'; } catch(e){ return false; } }
  function voiceSourceRe(tk){
    try {
      return new RegExp(tk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + 'の' + VOICE_ORIFICE +
                        '(?:の奥|の奥底|の端)?から[^。」』\\n]{0,24}?' + VOICE_NOUN +
                        'が[^。」』\\n]{0,14}?' + VOICE_EMIT);
    } catch(e){ return null; }
  }
  /* 一致箇所からその文の終わりまでを見て、打ち消しがあれば証拠にしない */
  function voiceSourceHit(text, tk){
    var re = voiceSourceRe(tk); if (!re) return false;
    var m = re.exec(text); if (!m) return false;
    var tailStart = m.index + m[0].length;
    var rest = text.slice(tailStart, tailStart + 24);
    var stop = rest.search(/[。\n]/);
    if (stop >= 0) rest = rest.slice(0, stop);
    return !VOICE_NEG.test(rest);
  }
  function narrationEmoter(prev, next, heroName, tokens){
    if (!heroName || !tokens || !tokens.length) return null;
    var text = String(prev || '') + '\n' + String(next || '');
    if (!text) return null;
    var found = {}, why = {};
    var useVoice = !f604off();
    for (var i = 0; i < tokens.length; i++){
      var canon = tokens[i] && tokens[i].canon, tk = tokens[i] && tokens[i].tok;
      if (!canon || !tk || canon === heroName || tk.length < 2) continue;   // 主人公・1文字は除外
      var re;
      try { re = new RegExp(tk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + 'の' + EMO_BODY + 'が[^。」』\\n]{0,22}?' + EMO_REACT); }
      catch(e){ re = null; }
      if (re && re.test(text)){ found[canon] = 1; why[canon] = 'narration-emoter'; continue; }
      /* ★fix604: 「Xの喉(の奥)から…声が漏れる」型 */
      if (useVoice && voiceSourceHit(text, tk)){ found[canon] = 1; why[canon] = 'voice-source'; }
    }
    var ks = Object.keys(found);
    if (ks.length === 1) return { to: ks[0], reasons: [why[ks[0]] || 'narration-emoter'] };
    return null;   // 0 or 2+ → 棄権
  }

  // ---------- 分裂防止: 名前正規化（短縮名→一意なフル登録名） ----------
  //   同一人物が「澪」「白石澪」など複数表記で別話者に分裂するのを防ぐ。
  //   ・既にフル登録名ならそのまま。特殊ラベル(不明な声/群衆/???/誰か)は触らない。
  //   ・w がちょうど1つのフル登録名の"部分(短縮)"に一致する時だけフル名へ寄せる。
  //   ・複数一致(曖昧)・未登録の別名は触らない＝別キャラを融合しない（過剰統合の事故防止）。
  function canonicalWho(who, fullNames){
    var w = String(who || '').trim();
    if (!w || !fullNames || !fullNames.length) return who;
    for (var i = 0; i < fullNames.length; i++){ if (fullNames[i] === w) return w; }   // 既にフル名
    if (w === '不明な声' || w === '群衆' || w === '???' || w === '誰か') return who;
    var hits = [];
    for (var j = 0; j < fullNames.length; j++){
      var f = String(fullNames[j] || '');
      if (f && w.length < f.length && f.indexOf(w) >= 0){ if (hits.indexOf(f) < 0) hits.push(f); } // 短縮→フル(部分一致)
    }
    if (hits.length === 1) return hits[0];   // 一意な短縮のみ正規化
    return who;
  }

  // ---------- 1ターンの計画 ----------
  // allowDrop=true は「読み込み後の新ターン」のみ(拮抗時のカード非表示を許可)
  function planTurn(t, names, tokens, profs, allowDrop){
    var cs = t && t._convSays;
    if (!Array.isArray(cs) || !cs.length) return { changed: false, changes: [], arr: cs };
    var narr = String((t && (t.narrative || t.text || t.body)) || '');
    var lines = narr.split('\n');
    var allTokens = tokens.concat(extraTokens(t, names, narr));   // v2: 未登録話者も候補に
    var pText = norm((t && t.playerText) || '');
    var out = [], changes = [], changed = false;
    for (var i = 0; i < cs.length; i++){
      var c = cs[i];
      if (!c) continue;
      if (!c.say){ out.push(c); continue; }   // fix495(F12): say欠落は不触で素通し(黙殺削除しない)
      if (c._rv === 1 || (pText && norm(c.say) === pText)){ out.push(c); continue; }
      var at = findLine(lines, c.say);
      if (at < 0){ out.push(c); continue; }                       // 本文に無い=判断材料なし→不触
      var prev = at > 0 ? lines[at - 1] : '';
      var next = (at + 1 < lines.length) ? lines[at + 1] : '';
      var prevSand = at >= 2 && /^[「『]/.test(String(lines[at - 2] || '').trim());
      // 分裂防止: 短縮名→一意なフル登録名へ正規化（別キャラ融合はしない）
      var cur0 = String(c.who || '');
      var cur = canonicalWho(cur0, names);
      if (cur !== cur0){
        changes.push({ act: 'canon', from: cur0, to: cur, say: String(c.say).slice(0, 14) });
        c.who = cur; changed = true;
      }
      var res = score(c.say, prev, next, allTokens, profs, prevSand);
      var d = decide(res, cur, !!allowDrop && _dropOn());
      // fix495(B5): 物理drop(データ削除)は既定OFF(GPT裁定)。OFF時はwouldDropとして診断のみ。
      if (allowDrop && !_dropOn()){
        try { var dd = decide(res, cur, true); if (dd.act === 'drop'){ _stats.wouldDrop++; console.log(TAG, '[wouldDrop]', cur, String(c.say).slice(0,14), dd.score); } } catch(e){}
      }
      if (d.act === 'flip' && d.to !== cur){
        changes.push({ act: 'fix', from: cur, to: d.to, score: d.score, say: String(c.say).slice(0, 14) });
        c.who = d.to; changed = true; out.push(c); continue;
      }
      if (d.act === 'drop'){
        changes.push({ act: 'drop', from: cur, say: String(c.say).slice(0, 14), score: d.score });
        changed = true; continue;
      }
      // 根治: 口調ブリッジ(+先輩文脈)。名前トークンのハード証拠が皆無の keep のときだけ検討。
      //   既定ON(振替)。停止は v292Dfix469ToneFlipOff='1'。常にshadowログに記録。
      if (d.act === 'keep' && (!res.hard || Object.keys(res.hard).length === 0)){
        var heroName = String((names && names[0]) || '');
        // ★誤爆防止(2026-07-20 実測): 口調ブリッジは「主人公 or 未登録ラベル」のカードだけ対象。
        //   既に登録NPCに付いているセリフを方言/一人称だけで別NPCへ飛ばさない
        //   (例: ナナミ(非関西)の「…やない」を 関西=ひなた へ誤flipした事故の遮断)。
        var curIsRegisteredNPC = (cur !== heroName) && names && names.indexOf(cur) >= 0;
        var pick = curIsRegisteredNPC ? null : toneOwner(c.say, profs, cur, allTokens); // ①口調(方言/一人称)=主人公/未登録のみ
        if (!pick) pick = senpaiContext(cs, i, cur, heroName);  // ②先輩呼び文脈(元々hero限定)
        // ③感情主ブリッジ: 主人公タグの手がかりゼロの声を、地の文の「Xの体/声が[反応]」で当てる(hero限定)
        if (!pick && cur === heroName) pick = narrationEmoter(prev, next, heroName, allTokens);
        if (pick){
          _stats.wouldToneFlip++;
          try { console.log(TAG, '[wouldToneFlip' + (_toneFlipOn() ? '(FLIP)' : '(shadow)') + ']', cur, '→', pick.to, '(' + pick.reasons.join(',') + ')', String(c.say).slice(0, 16)); } catch(e){}
          try { _toneShadowLog({ ts: Date.now(), slot: _activeStoreKey(), turnFp: (String(lines[0]||'') + String(lines[1]||'')).slice(0, 40), i: i, from: cur, to: pick.to, why: pick.reasons.join(','), say: String(c.say||'').slice(0, 40) }); } catch(e){}
          if (_toneFlipOn()){
            changes.push({ act: 'toneFix', from: cur, to: pick.to, why: pick.reasons.join(','), say: String(c.say).slice(0, 14) });
            c.who = pick.to; changed = true; out.push(c); continue;
          }
        }
      }
      // fix498(C+): keep判定のheroタグカードに代名詞ブリッジのshadow診断(記録のみ・書換なし)
      if (d.act === 'keep' && names && names.length) { pronounShadow(cs, i, lines, at, String(names[0]||''), profs, allTokens); }
      out.push(c);
    }
    return { changed: changed, changes: changes, arr: out };
  }

  // ---------- 適用（v2: 凍結方式。全過去ターンの永続再採点を廃止） ----------
  function names(S){
    var out = [];
    try {
      if (S && S.cast){
        if (S.cast.hero && S.cast.hero.name) out.push(String(S.cast.hero.name).trim());
        (S.cast.npcs || []).forEach(function(n){ if (n && n.name) out.push(String(n.name).trim()); });
      }
    } catch(e){}
    return out.filter(Boolean);
  }

  function sigOf(t){
    var cs = (t && t._convSays) || [];
    var s = cs.length + '';
    for (var i = 0; i < cs.length; i++){ s += '|' + String(cs[i] && cs[i].who || '') + ':' + String(cs[i] && cs[i].say || '').length; }
    return s;
  }

  var baseTurns = -1;
  var backedUp = false;
  var evalReg = {};        // turnIndex -> { sig, evals, frozen } (メモリのみ・セーブ不触)
  var MAX_EVALS = 3;
  // fix495(B2): スロット切替の検知(chr6_active_slot値 or S.turns配列の同一性が変わったら
  // baseTurns/evalReg/backedUpをリセット)。持ち越すと新スロットの過去ターンが「新ターン」
  // 扱いになり、拮抗カードのdrop(データ削除)が過去ターンに及ぶ実測事故があった。
  function _activeStoreKey(){
    try { var a = JSON.parse(localStorage.getItem('chr6_active_slot') || 'null');
          if (a && a !== 'default') return 'chr6_slot_' + a; } catch(e){}
    return 'chr6';
  }
  var _lastSlotKey = null, _lastTurnsRef = null, _lastT0 = null;
  function _t0fp(S){ try { var t0 = S.turns[0]; return String((t0 && (t0.narrative || t0.text || '')) || '').slice(0, 80); } catch(e){ return ''; } }
  function _slotGate(S){
    var k = _activeStoreKey(), fp = _t0fp(S);
    var changed = (_lastSlotKey !== null && k !== _lastSlotKey) ||
                  (_lastTurnsRef !== null && S.turns !== _lastTurnsRef) ||
                  (_lastT0 !== null && fp !== _lastT0);       // fix495(B2): 同一配列の中身差替(インポート/初期化)も検知(GPT: 3重検知)
    if (changed){ baseTurns = -1; evalReg = {}; backedUp = false; try { lastSig = ''; } catch(e){}
      try { console.log(TAG, 'slot/story switch detected -> state reset'); } catch(e){} }
    _lastSlotKey = k; _lastTurnsRef = S.turns; _lastT0 = fp;
    return changed;
  }

  function applyTurn(S, ti, allowDrop, tokens, profs, ns){
    var p = planTurn(S.turns[ti], ns, tokens, profs, allowDrop);
    if (p.changed){
      // fix495(B3): 控えは「アクティブスロットの実キー」から取り、控えキーもスロット別。
      // 控えが書けない場合は破壊的変更を中止(fail-closed・GPT裁定)。
      if (!backedUp){
        var _bkOk = false;
        try {
          var _ak = _activeStoreKey();
          localStorage.setItem('chr6_bk_fix469_' + _ak, localStorage.getItem(_ak) || '');
          _bkOk = true;
        } catch(e){ _stats.backupFail++; }
        if (!_bkOk){ try { console.warn(TAG, 'backup failed -> 変更中止(fail-closed)'); } catch(e){} return { changed: false, changes: [], arr: S.turns[ti]._convSays }; }
        backedUp = true;
      }
      S.turns[ti]._convSays = p.arr;
    }
    return p;
  }

  function repair(){
    if (off()) return { changed: false };
    var S = getS();
    if (!S || !Array.isArray(S.turns) || !S.turns.length) return { changed: false };
    _slotGate(S);   // fix495(B2)
    var firstRun = (baseTurns < 0);
    if (firstRun) baseTurns = S.turns.length;
    var ns = names(S); if (ns.length < 1) return { changed: false };
    var tokens = tokensOf(ns), profs = profiles(S);
    var any = false, log = [];
    for (var ti = 0; ti < S.turns.length; ti++){
      var isNew = (ti >= baseTurns);
      var reg = evalReg[ti];
      if (reg && reg.frozen) continue;
      var sig = sigOf(S.turns[ti]);
      if (!isNew){
        // 過去ターン: 読み込み時に1回だけ「明確な誤りの振替」。以後凍結。
        if (reg) continue;
        var p0 = applyTurn(S, ti, false, tokens, profs, ns);
        evalReg[ti] = { sig: sigOf(S.turns[ti]), evals: 1, frozen: true };
        if (p0.changed){ any = true; log.push({ turn: ti + 1, changes: p0.changes }); }
        continue;
      }
      // 新ターン: シグネチャが変わったときだけ再評価。最大3回で凍結。
      if (reg && reg.sig === sig) continue;
      var p = applyTurn(S, ti, true, tokens, profs, ns);
      var nsig = sigOf(S.turns[ti]);
      var evals = (reg ? reg.evals : 0) + 1;
      evalReg[ti] = { sig: nsig, evals: evals, frozen: evals >= MAX_EVALS };
      if (p.changed){ any = true; log.push({ turn: ti + 1, changes: p.changes }); }
    }
    if (any){
      try { if (S.save && !document.hidden) S.save(); } catch(e){}
      try {
        var cards = document.querySelectorAll('.v292-dlg-card');
        for (var i = 0; i < cards.length; i++){ if (cards[i].parentNode) cards[i].parentNode.removeChild(cards[i]); }
        if (window.__v292Dfix66 && window.__v292Dfix66.repair) window.__v292Dfix66.repair();
      } catch(e){}
      try { console.log(TAG, JSON.stringify(log)); } catch(e){}
    }
    return { changed: any, log: log };
  }

  var lastSig = '';
  function tick(){
    try {
      if (off()) return;
      var S = getS(); if (!S || !Array.isArray(S.turns)) return;
      if (baseTurns < 0) baseTurns = S.turns.length;
      var last = S.turns[S.turns.length - 1];
      var sig = S.turns.length + ':' + ((last && Array.isArray(last._convSays)) ? sigOf(last) : '');
      if (sig === lastSig) return;
      lastSig = sig; repair();
    } catch(e){}
  }
  try { setTimeout(tick, 4000); setInterval(tick, 2500); } catch(e){}

  window.__v292Dfix469 = { stats: _stats,
    preQuoteAnchor: preQuoteAnchor,   /* ★fix542 分類器(診断のみ・判定には未接続) */
    __armed: true, __v: 2, profiles: profiles, tokensOf: tokensOf, extraTokens: extraTokens,
    score: score, decide: decide, planTurn: planTurn, repair: repair,
    dryRun: function(){
      var S = getS(); if (!S || !S.turns) return null;
      var ns = names(S); if (!ns.length) return null;
      var tokens = tokensOf(ns), profs = profiles(S), res = [];
      for (var i = 0; i < S.turns.length; i++){
        var t = S.turns[i];
        var copy = { narrative: (t && t.narrative) || '', playerText: (t && t.playerText) || '',
                     _convSays: ((t && t._convSays) || []).map(function(x){ return x ? { who: x.who, say: x.say, _rv: x._rv } : x; }) };
        var p = planTurn(copy, ns, tokens, profs, true);
        if (p.changes && p.changes.length) res.push({ turn: i + 1, changes: p.changes });
      }
      return res;
    },
    // fix508: 診断ログの読出/件数/消去(いずれもchr6・セーブ非破壊)
    pshadowDump: function(){ try { var raw = localStorage.getItem('v292Dfix469_pshadow'); var db = raw ? JSON.parse(raw) : null; return (db && db.recs) || []; } catch(e){ return []; } },
    pshadowCount: function(){ try { var raw = localStorage.getItem('v292Dfix469_pshadow'); var db = raw ? JSON.parse(raw) : null; return (db && db.recs && db.recs.length) || 0; } catch(e){ return 0; } },
    pshadowClear: function(){ try { localStorage.removeItem('v292Dfix469_pshadow'); return true; } catch(e){ return false; } },
    // 根治: 口調ブリッジの診断ログ / 実flip解禁トグル(いずれもchr6・セーブ非破壊)
    toneOwner: toneOwner,
    toneFlipOn: _toneFlipOn,
    toneDump: function(){ try { var raw = localStorage.getItem('v292Dfix469_toneshadow'); var db = raw ? JSON.parse(raw) : null; return (db && db.recs) || []; } catch(e){ return []; } },
    toneCount: function(){ try { var raw = localStorage.getItem('v292Dfix469_toneshadow'); var db = raw ? JSON.parse(raw) : null; return (db && db.recs && db.recs.length) || 0; } catch(e){ return 0; } },
    toneClear: function(){ try { localStorage.removeItem('v292Dfix469_toneshadow'); return true; } catch(e){ return false; } },
    toneFlipEnable: function(on){ try { if (on === false){ localStorage.setItem('v292Dfix469ToneFlipOff','1'); return false; } localStorage.removeItem('v292Dfix469ToneFlipOff'); return true; } catch(e){ return on !== false; } }
  };
  try { console.log(TAG, 'loaded v2'); } catch(e){}
})();
