// =====================================================================
// Chronicle TRPG - v292Dfix611: 話者変更の中央ゲート（**影モード**・GPT裁定の実装）
//
// ■なぜ作るのか（2026-07-28・GPT裁定）
//   会話ログの話者を書き換える補正器が**9本**ある（fix303/376/383/388/390/462/465/469/489）。
//   推定の確かさはバラバラなのに、**最終的には全員が同じ `_convSays[].who` を直接書き換える**。
//   この構造のままでは、点数（TAG_BONUS）をいくら調整しても
//   **別の補正器が同じ事故を再発させる**（GPT: 「TAG_BONUS 60→180 では不十分。250点を出す者がいれば同じ」）。
//
//   実データで確認した事故（6件）はすべて同型:
//     モデルが `<say who="霧 涼太">` と明示 → 引用の**直後の行に別人の名前があるだけ**で反転
//       「真鍋は封筒の口を開けた」「志乃はゆっくりと半身だけこちらに向けた」
//       「涼太は一段一段上がり続けた」「源蔵は小さく鼻を鳴らした」
//     ＝**隣接する行動・姿勢・反応・移動を、話者の証拠として数えていた。**
//
// ■この段でやること（★挙動は1ミリも変えない）
//   「もし中央ゲートがあったら、その変更を通したか」を**判定するだけ**。
//   ・`_convSays[].who` を書き換えない
//   ・DOM を触らない
//   ・localStorage へ1バイトも書かない
//   ・補正器の配線も変えない（この段では誰も propose() を呼ばない）
//   → 出荷前に「既存560カードのうち、狙ったもの以外は1枚も変わらない」ことを**先に証明する**ため。
//
// ■判定の原則（GPT裁定）
//     明示タグあり
//     ├ 同一人物内の正名化・役割語解決（same-entity） → 従来どおり許可
//     └ 別の登録キャストへの変更（cross-cast）
//        → 「引用そのものの発話者を示す直接証拠」がある場合だけ許可
//        → 隣接する行動・姿勢・反応・移動は **証拠として0点**
//
//   通す証拠（hard attribution evidence）:
//     「…」とXが言った ／ 「…」Xは囁いた ／ Xが「…」と叫んだ ／ Xの喉の奥から声が漏れた
//   通さない:
//     「…」Xは封筒を開けた ／ 振り返った ／ 鼻を鳴らした ／ 階段を上がった
//
//   ★「口を開く」は**タグ付き cross-cast 反転の hard evidence からは完全に外す**（GPT明示）。
//     裸引用（bare-inferred）の推定では弱い証拠として残してよい＝ここでは扱わない。
//
// ■読み出し（コンソール）
//   window.__v292Dfix611.shadowRun()   … 既存の全カードへ判定だけ走らせた集計（本命）
//   window.__v292Dfix611.decide(p, c)  … 1件の判定（純関数）
//   window.__v292Dfix611.selfTest()    … ★生存証明。実データ由来の肯定例・否定例が全部立つか
//
// ■★fix612（2026-07-28・影の一斉判定を実データへ当てて直した点）
//   560カードへ当てたところ **17件が cross-cast 判定** になったが、中身を読むと
//   **「男A」→「霧 涼太」のような仮ラベルの解決**まで別人物扱いになっていた。
//   固定の役割語リストでは足りない。**登録キャストに無い名前 → 登録キャストへ**は名寄せとする。
//   逆向き（登録キャスト →「少女」のような未登録ラベル）は**劣化**なので通さない（実データ: カエデ→少女）。
//   ★GPTの否定例「涼→霧 涼太」は、**登録キャストに『涼』が居るとき**に別人物として落ちる。
//
// OFF: localStorage v292Dfix611SpeakerGateOff='1'（判定を止め、stats は disabled を返す）
// =====================================================================
(function () {
  'use strict';
  if (window.__v292Dfix611) return;

  function off() { try { return localStorage.getItem('v292Dfix611SpeakerGateOff') === '1'; } catch (e) { return false; } }

  function getS() {
    try { var a = window.__chronicleGetState ? window.__chronicleGetState('fix611') : null; if (a) return a; } catch (e) {}
    try { return window.S || (0, eval)('typeof S!=="undefined"?S:null') || null; } catch (e) { return null; }
  }

  function nrm(s) { return String(s == null ? '' : s).replace(/[\s　・]/g, ''); }
  function esc(s) { return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /* =====================================================================
     述語の分類（GPT 3-4: SPEECH という広い正規表現を1本持たず、用途で分ける）
     ★ここが今回の肝。「行動文」を巨大なブラックリストで潰すのではなく、
       **発話生成述語の狭いホワイトリスト**だけを通す。
     ===================================================================== */

  /* (a) 直接発話述語 … これが名前に結び付いていれば話者の直接証拠 */
  /* ★fix613: 実データで誤爆した語を外した。
       「続け」→「上がり**続け**た」に当たった（実データ: 涼太は、一段一段、上がり続けた）。
       「返し」→「押し返した」「引き返した」に当たる。「応じ」「漏らし」も発話とは限らない。
     残すのは**それ単体で発話を意味する語**だけ。複合形は明示的に並べる。 */
  var DIRECT_SPEECH_PRED = /(言っ|言う|言い放|言い返|言い続け|話し続け|語り続け|告げ|答え|返事をし|尋ね|訊ね|訊い|問う|問い返|叫|怒鳴|囁|ささや|呟|つぶや|呻|うめ|吐き捨て|口走)/;

  /* (b) 声の出所構文（fix604 の型）… 「Xの<発声器官>から<声>が<出る>」 */
  var VOICE_ORIFICE = '(?:喉|喉元|口|口元|唇|歯の隙間|歯の間|口の端)';
  var VOICE_NOUN = '(?:声|悲鳴|嗚咽|呻き|うめき|囁き|呟き|息)';
  var VOICE_EMIT = '(?:漏れ|零れ|こぼれ|出|落ち|絞り出|押し出|滑り出)';

  /* (c) 曖昧な発声「動作」… ★話者の直接証拠にしない（GPT明示）。
         「口を開く」は慣用句としては発話だが、今回の事故（封筒の口）の元凶。 */
  var AMBIGUOUS_VOCAL_ACTION = /(口を開|鼻を鳴らし|息を吐|息を呑|息をの|肩を震わ|喉を鳴らし)/;

  /* (d) 反応・知覚・受動 … 話者ではない側を指す。ここが当たったら cross-cast を通さない。 */
  var REACTION_PRED = /(振り返|振り向|見つめ|見返|見上げ|顔を上げ|頷|うなず|首を振|首をかし|首を傾|目を見開|見開|眉|驚|戸惑|絶句|唖然|息を止め|身構え|後ずさ|立ち上が|座り|歩き出|上が(?:っ|り)|降り|開け|閉め|伸ばし|握|掴|つか|受け取|差し出|近づ|離れ|向け|置い|取り出)/;
  var PERCEPTION_PRED = /(聞い|聴い|見た|見る|気づ|気付|感じ|悟|察|理解|思っ|考え)/;
  var PASSIVE_PRED = /(呼ばれ|言われ|告げられ|尋ねられ|訊かれ|問われ|頼まれ|促され|返され)/;

  /* =====================================================================
     証拠の抽出
     入力: 引用の前後の地の文（evidence text）と、候補となる人物名トークン
     出力: { type, span } または null
     ★type が 'direct-speech' / 'voice-source' のときだけ hard evidence。
     ===================================================================== */

  /* ★人物名は本文では短縮形で出る（「真鍋 ひかり」→「真鍋」／「藤堂 志乃」→「志乃」）。
     実データ7ケースすべてが短縮形だった。フルネーム一致だけを見ると**証拠を1件も拾えない**。
     ただし短縮形の扱いは identityRelation と同じ規律にする:
       **2文字以上** かつ **キャスト中で一意** のトークンだけ使う（「涼」で「霧 涼太」を拾わない）。 */
  function tokensFor(name, cast) {
    var full = nrm(name); if (!full) return [];
    var out = [full], C = (cast || []).map(nrm).filter(Boolean);
    String(name).split(/[\s　・]+/).filter(Boolean).forEach(function (p) {
      var q = nrm(p);
      if (q.length < 2 || q === full) return;
      var hits = 0;
      for (var i = 0; i < C.length; i++) if (C[i].indexOf(q) >= 0) hits++;
      if (hits <= 1) out.push(q);
    });
    return out;
  }

  function anyToken(fn, text, name, cast) {
    var toks = tokensFor(name, cast);
    for (var i = 0; i < toks.length; i++) { var r = fn(text, toks[i]); if (r) return r; }
    return null;
  }

  function directSpeechEvidence(text, name) {
    var t = String(text || ''), n = esc(nrm(name));
    if (!t || !n) return null;
    var flat = t.replace(/[\s　]/g, '');
    /* 形1: 「…」と X は/が <発話動詞>   形2: 「…」X は/が <発話動詞> */
    var re1 = new RegExp('[」』][、,]?(?:と|って)?' + n + '[はがも][^。、\\n]{0,10}?' + DIRECT_SPEECH_PRED.source);
    /* 形3: X は/が 「…」と <発話動詞> */
    var re3 = new RegExp(n + '[はがも][^。\\n]{0,20}?[「『][^」』]{0,80}[」』][、,]?(?:と|って)?[^。、\\n]{0,10}?' + DIRECT_SPEECH_PRED.source);
    /* 形4: X の声で / X の声が した（導入形） */
    var re4 = new RegExp(n + 'の(?:声|囁き|呟き)(?:が(?:した|して|する|響|聞こえ|飛ん|割り込)|で(?:言|尋|囁|呟|叫|告げ|続け))');
    /* 形5: X は/が …(14字以内)… <発話動詞>
       ★引用と隣接していなくてよい（実データ v41ho7 T9:
         `<say who="男A">「……おい」</say>` の次の行が **「後ろの男Aが、声をひそめて言う。」**）。
       ★ここが GPT の言う「発話生成述語の狭いホワイトリスト＋主語」。
         行動・反応・知覚・曖昧発声（口を開く等）は DIRECT_SPEECH_PRED に**入れていない**。 */
    var re5 = new RegExp(n + '[はがも][^。\n]{0,14}?' + DIRECT_SPEECH_PRED.source);
    var m = flat.match(re1) || flat.match(re3) || flat.match(re4) || flat.match(re5);
    if (!m) return null;
    /* ★否定・打ち消しは証拠にしない（「Xは答えない」「Xは何も言わなかった」） */
    var neg = flat.slice(m.index + m[0].length, m.index + m[0].length + 8);
    if (/^(?:ない|なかった|ず|ません|なく)/.test(neg)) return null;
    /* ★受動なら話者ではない（GPT指摘: 「『何か言って』とXが頼まれた」） */
    var tail = flat.slice(m.index, m.index + m[0].length + 8);
    if (PASSIVE_PRED.test(tail)) return null;
    return { type: 'direct-speech', span: m[0].slice(0, 60) };
  }

  function voiceSourceEvidence(text, name) {
    var t = String(text || '').replace(/[\s　]/g, ''), n = esc(nrm(name));
    if (!t || !n) return null;
    var re = new RegExp(n + 'の' + VOICE_ORIFICE + '(?:の奥|の奥底|の端)?から[^。\\n]{0,24}?' + VOICE_NOUN + 'が[^。\\n]{0,14}?' + VOICE_EMIT);
    var m = t.match(re);
    if (!m) return null;
    var rest = t.slice(m.index + m[0].length, m.index + m[0].length + 24);
    if (/(なかった|ない|ません|ようだ|かのよう|ように(?:聞こえ|思え|感じ)|らしかった|気がした)/.test(rest)) return null;
    return { type: 'voice-source', span: m[0].slice(0, 60) };
  }

  /* 名前は在るが、述語が行動・反応・知覚・受動・曖昧発声 のとき＝**証拠にしない** */
  function nonSpeechFrame(text, name) {
    var t = String(text || '').replace(/[\s　]/g, ''), n = esc(nrm(name));
    if (!t || !n) return null;
    var m = t.match(new RegExp(n + '[はがも]([^。\\n]{0,18})'));
    if (!m) return null;
    var tail = m[1] || '';
    if (AMBIGUOUS_VOCAL_ACTION.test(tail)) return { type: 'ambiguous-vocal-action', span: m[0].slice(0, 40) };
    if (PASSIVE_PRED.test(tail)) return { type: 'passive', span: m[0].slice(0, 40) };
    if (PERCEPTION_PRED.test(tail)) return { type: 'perception', span: m[0].slice(0, 40) };
    if (REACTION_PRED.test(tail)) return { type: 'reaction-or-action', span: m[0].slice(0, 40) };
    return { type: 'adjacent-name', span: m[0].slice(0, 40) };   // 名前が隣にあるだけ
  }

  function evidenceFor(text, name, cast) {
    return anyToken(directSpeechEvidence, text, name, cast)
        || anyToken(voiceSourceEvidence, text, name, cast)
        || anyToken(nonSpeechFrame, text, name, cast)
        || null;
  }
  function isHardAttributionEvidence(ev) {
    return !!ev && (ev.type === 'direct-speech' || ev.type === 'voice-source');
  }

  /* =====================================================================
     同一人物か、別人物か（GPT 3-2: 名寄せと別人物反転を分離する）
     ★文字列包含だけで同一人物と断定しない。
       「涼」→「霧 涼太」は、別人物「涼」が存在しうる（GPTの否定例）。
       包含で same-entity と認めるのは **2文字以上** かつ **キャスト中で一意** のときだけ。
     ===================================================================== */
  /* 参考: よく出る役割語（判定には使わない。上の一般規則で足りる） */
  var ROLE_WORDS = /^(?:少女|少年|若い男|若い女|若者|青年|老人|老婆|老爺|子供|男性|女性|人影|怪異|影|声|誰か|男|女|店員|店主|医師|看護師|警官|運転手|司会|少年少女)$/;

  function identityRelation(from, to, cast) {
    var f = nrm(from), t = nrm(to);
    if (!f || !t) return 'unknown';
    if (f === t) return 'exact';
    var C = (cast || []).map(nrm).filter(Boolean);
    var fIn = C.indexOf(f) >= 0, tIn = C.indexOf(t) >= 0;

    /* ①まず**曖昧な包含**を落とす（GPTの否定例）。
       「佐藤」は 佐藤 花 / 佐藤 実 のどちらにも当たる → 同一人物と断定してはいけない。
       ★GPTが挙げた「涼」→「霧 涼太」は、**登録キャストに『涼』が居る場合**にこれで落ちる
         （その場合 fIn=true なので ③④を通らず ⑥で cross-cast になる）。 */
    var shorter = f.length <= t.length ? f : t;
    var longer = f.length <= t.length ? t : f;
    var contained = shorter.length >= 2 && longer.indexOf(shorter) >= 0;
    if (contained) {
      var hits = 0;
      for (var i = 0; i < C.length; i++) if (C[i].indexOf(shorter) >= 0) hits++;
      if (hits > 1) return 'cross-cast';
    }

    /* ②登録キャスト → 未登録ラベル は**劣化**（実データ: 「カエデ」→「少女」）。通さない。 */
    if (fIn && !tIn) return 'cross-cast';

    /* ③包含が一意なら同一人物（短縮名→フルネーム） */
    if (contained) return 'same-entity';

    /* ④未登録ラベル → 登録キャスト は「ラベル解決」（fix465/487 の正当な仕事）。
       ★固定の役割語リストでは足りなかった（実データ: 「男A」→「霧 涼太」）。
       ★★ただし **same-entity と同じ扱いにしてはいけない**（fix613・実データが即座に教えた）:
         実データ v41ho7 T9 は `<say who="男A">「……おい」</say>` の直後が
         **「後ろの男Aが、声をひそめて言う。」**＝**ラベル自身が話者だと地の文が言っている**。
         それを「霧 涼太」へ寄せるのは誤り。
         → 別の関係 'label-resolution' として返し、**decide 側で本文を見て**判定する。 */
    if (!fIn && tIn) return 'label-resolution';



    /* ⑤どちらも未登録なら判断できない */
    if (!fIn && !tIn) return 'unknown';

    /* ⑥どちらも登録キャスト＝別人物への付け替え */
    return 'cross-cast';
  }

  /* =====================================================================
     中央の裁定（純関数・副作用なし）
       proposal = { from, to, ruleId, sourceKind, evidence }
       context  = { cast, evidenceText, tagMappingHighConfidence, uniqueCandidateCount }
     ===================================================================== */
  function decide(proposal, context) {
    proposal = proposal || {}; context = context || {};
    var rel = identityRelation(proposal.from, proposal.to, context.cast);

    if (rel === 'exact') return { act: 'allow', reason: 'no-change', relation: rel };
    if (rel === 'same-entity') return { act: 'allow', reason: 'canonical-name-resolution', relation: rel };

    /* ★fix613: 未登録ラベル → 登録キャスト は原則通すが、
       **そのラベル自身に直接発話の証拠があるなら通さない**（実データ「後ろの男Aが…言う」）。 */
    if (rel === 'label-resolution') {
      var evFrom = evidenceFor(context.evidenceText, proposal.from, context.cast);
      if (isHardAttributionEvidence(evFrom))
        return { act: 'deny', reason: 'label-is-speaker', relation: rel, evidence: evFrom };
      return { act: 'allow', reason: 'label-resolution', relation: rel };
    }

    // 主人公がその場で入力した発話は動かさない
    if (context.sourceKind === 'hero-utterance' || proposal.sourceKind === 'hero-utterance')
      return { act: 'deny', reason: 'hero-utterance-locked', relation: rel };

    var src = proposal.sourceKind || context.sourceKind || '';
    if (src === 'say-tag' || src === 'react-voice') {
      /* ★旧カードは「タグとカードの対応」が確実でないことがある（GPT指摘）。
         確実でないカードへ強いタグロックを掛けると、分類器の誤対応まで保護してしまう。 */
      if (context.tagMappingHighConfidence === false)
        return { act: 'deny', reason: 'tag-provenance-ambiguous', relation: rel };

      var ev = proposal.evidence || evidenceFor(context.evidenceText, proposal.to, context.cast);
      if (!isHardAttributionEvidence(ev))
        return { act: 'deny', reason: 'tag-cross-cast-needs-hard-evidence', relation: rel, evidence: ev || null };
      if (context.uniqueCandidateCount != null && context.uniqueCandidateCount !== 1)
        return { act: 'deny', reason: 'candidate-not-unique', relation: rel, evidence: ev };
      return { act: 'allow', reason: 'hard-attribution-evidence', relation: rel, evidence: ev };
    }
    // タグ由来でないカード（裸引用・ハーベスト）は従来どおり（この段では触らない）
    return { act: 'allow', reason: 'legacy-inference', relation: rel };
  }

  /* =====================================================================
     ★生存証明（canary）— 実データ由来の肯定例・否定例
     「異常0件」だけを信じない。分類ごとに1件以上立つことを毎回確かめる。
     ===================================================================== */
  function fixtures() {
    return [
      // 通してはいけない（今回の事故そのもの）
      { name: '封筒の口', text: '真鍋は封筒の口を開けた。中から出てきたのは、一枚の処方箋の控えだった。',
        to: '真鍋 ひかり', want: 'deny' },
      { name: '振り向き', text: '志乃はゆっくりと、半身だけこちらに向けた。', to: '藤堂 志乃', want: 'deny' },
      { name: '階段', text: '涼太は、一段一段、上がり続けた。', to: '霧 涼太', want: 'deny' },
      { name: '鼻を鳴らす', text: '源蔵は小さく鼻を鳴らした。シャッターの鍵が鳴る。', to: '戸波源蔵', want: 'deny' },
      { name: '隣に名前', text: 'ノアは腰に手を当てたまま、警戒するように首を巡らせた。', to: 'ノア', want: 'deny' },
      { name: '知覚', text: '真鍋は声を聞いた。', to: '真鍋 ひかり', want: 'deny' },
      { name: '受動', text: '「何か言って」と真鍋が頼まれた。', to: '真鍋 ひかり', want: 'deny' },
      // 通してよい（直接証拠）
      { name: '引用のあと', text: '「行こう」と真鍋が言った。', to: '真鍋 ひかり', want: 'allow' },
      { name: '引用のあと(助詞なし)', text: '「行こう」真鍋は囁いた。', to: '真鍋 ひかり', want: 'allow' },
      { name: '引用のまえ', text: '真鍋が「行こう」と叫んだ。', to: '真鍋 ひかり', want: 'allow' },
      { name: '声の出所', text: 'ひなたの喉の奥から、引きつったような声が漏れる。', to: 'ひなた', want: 'allow' },
      { name: '声の導入', text: '真鍋の声がした。', to: '真鍋 ひかり', want: 'allow' }
    ];
  }

  function selfTest() {
    var cast = ['霧 涼太', '真鍋 ひかり', '藤堂 志乃', '戸波源蔵', 'ノア', 'カエデ', 'ひなた', '白石澪'];
    var okAll = true, detail = [], kinds = {};
    fixtures().forEach(function (f) {
      var d;
      try {
        d = decide({ from: '霧 涼太', to: f.to, sourceKind: 'say-tag' },
          { cast: cast, evidenceText: f.text, tagMappingHighConfidence: true, uniqueCandidateCount: 1 });
      } catch (e) { d = { act: 'THREW', reason: e.message }; }
      // from と to が同じになる fixture は判定対象外にする
      if (nrm(f.to) === nrm('霧 涼太')) {
        d = decide({ from: '真鍋 ひかり', to: f.to, sourceKind: 'say-tag' },
          { cast: cast, evidenceText: f.text, tagMappingHighConfidence: true, uniqueCandidateCount: 1 });
      }
      var good = (d.act === f.want);
      if (!good) okAll = false;
      kinds[d.reason] = (kinds[d.reason] || 0) + 1;
      detail.push({ name: f.name, want: f.want, got: d.act, reason: d.reason, ok: good });
    });
    // 名寄せ側の canary
    var castB = ['氷川 杏子', '白石澪'];
    var alias = decide({ from: '杏子', to: '氷川 杏子', sourceKind: 'say-tag' }, { cast: castB, evidenceText: '', tagMappingHighConfidence: true });
    var role = decide({ from: '少女', to: '氷川 杏子', sourceKind: 'say-tag' }, { cast: castB, evidenceText: '', tagMappingHighConfidence: true });
    if (alias.act !== 'allow' || role.act !== 'allow') okAll = false;
    detail.push({ name: '名寄せ(杏子→氷川 杏子)', want: 'allow', got: alias.act, reason: alias.reason, ok: alias.act === 'allow' });
    detail.push({ name: '役割語(少女→氷川 杏子)', want: 'allow', got: role.act, reason: role.reason, ok: role.act === 'allow' });
    return { ok: okAll, reasonsSeen: Object.keys(kinds).length, detail: detail };
  }

  /* =====================================================================
     影の一斉判定（★適用しない。判定だけ）
     既存カードのうち「モデルのタグと最終whoが食い違う」ものへゲートを当て、
     legacyFinalWho / newDecision を突き合わせる。
     ===================================================================== */
  function shadowRun(turnsIn, castIn) {
    if (off()) return { disabled: true };
    var prov = window.__v292Dfix606;
    if (!prov) return { error: 'fix606-missing' };
    var S = null, turns = turnsIn, cast = castIn;
    if (!turns) { S = getS(); turns = S && S.turns; }
    if (!cast && S && S.cast) {
      cast = [(S.cast.hero && S.cast.hero.name) || ''].concat(((S.cast.npcs) || []).map(function (n) { return n && n.name; }));
    }
    cast = (cast || []).filter(Boolean);
    var hero = cast[0] || '';
    var out = {
      selfTestPassed: selfTest().ok,
      cards: 0, tagCrossCastProposals: 0, tagCrossCastAllowed: 0,
      tagCrossCastDeniedNoHardEvidence: 0, tagCrossCastDeniedReactionFrame: 0,
      sameEntityRenamesAllowed: 0, labelResolutionsAllowed: 0, labelIsSpeakerDenied: 0, turnsWithWeakMapping: 0, byReason: {}, items: []
    };
    if (!Array.isArray(turns)) return out;
    for (var ti = 0; ti < turns.length; ti++) {
      var t = turns[ti];
      if (!t || !Array.isArray(t._convSays)) continue;
      var es = prov.evidenceSource(t);
      /* ★fix614: タグ対応の確かさをターン単位で先に測り、カードへ持ち回る。
         対応が壊れているターンでは強いタグロックを掛けない（誤対応を保護しないため）。 */
      var tm = prov.turnMapping ? prov.turnMapping(t, es) : null;
      var tags = tm ? tm.tags : prov.listSayTags(es.text);
      if (tm && !tm.ok) out.turnsWithWeakMapping++;
      for (var ci = 0; ci < t._convSays.length; ci++) {
        var c = t._convSays[ci]; if (!c) continue;
        out.cards++;
        var r = prov.classifyCard(t, c, ci, { hero: hero, es: es, tags: tags, mappingOk: tm ? tm.ok : true });
        if (r.source !== 'say-tag-renamed' || !r.tagWho) continue;
        var rel = identityRelation(r.tagWho, c.who, cast);
        if (rel === 'same-entity' || rel === 'exact') { out.sameEntityRenamesAllowed++; continue; }
        if (rel === 'label-resolution') {
          var dl = decide({ from: r.tagWho, to: c.who, sourceKind: 'say-tag' },
            { cast: cast, evidenceText: es.text, tagMappingHighConfidence: r.tagMappingHighConfidence !== false, uniqueCandidateCount: 1 });
          out.byReason[dl.reason] = (out.byReason[dl.reason] || 0) + 1;
          if (dl.act === 'allow') { out.labelResolutionsAllowed++; continue; }
          out.labelIsSpeakerDenied++;
          if (out.items.length < 40) out.items.push({ turn: ti, card: ci, legacyFinalWho: c.who, tagWho: r.tagWho,
            newDecision: dl.act, reason: dl.reason, evidenceType: (dl.evidence && dl.evidence.type) || null,
            say: String(c.say || '').slice(0, 24) });
          continue;
        }
        out.tagCrossCastProposals++;
        var d = decide({ from: r.tagWho, to: c.who, sourceKind: 'say-tag' },
          { cast: cast, evidenceText: es.text, tagMappingHighConfidence: r.tagMappingHighConfidence !== false, uniqueCandidateCount: 1 });
        out.byReason[d.reason] = (out.byReason[d.reason] || 0) + 1;
        if (d.act === 'allow') out.tagCrossCastAllowed++;
        else if (d.reason === 'tag-cross-cast-needs-hard-evidence') {
          out.tagCrossCastDeniedNoHardEvidence++;
          if (d.evidence && (d.evidence.type === 'reaction-or-action' || d.evidence.type === 'ambiguous-vocal-action')) out.tagCrossCastDeniedReactionFrame++;
        }
        if (out.items.length < 40) out.items.push({
          turn: ti, card: ci, legacyFinalWho: c.who, tagWho: r.tagWho,
          newDecision: d.act, reason: d.reason,
          evidenceType: (d.evidence && d.evidence.type) || null,
          say: String(c.say || '').slice(0, 24)
        });
      }
    }
    return out;
  }

  window.__v292Dfix611 = {
    identityRelation: identityRelation,
    evidenceFor: evidenceFor,
    tokensFor: tokensFor,
    isHardAttributionEvidence: isHardAttributionEvidence,
    directSpeechEvidence: directSpeechEvidence,
    voiceSourceEvidence: voiceSourceEvidence,
    nonSpeechFrame: nonSpeechFrame,
    decide: decide,
    shadowRun: shadowRun,
    selfTest: selfTest,
    _fixtures: fixtures
  };
  try { console.log('[v292Dfix611] speaker mutation gate (shadow only) ready'); } catch (e) {}
})();
