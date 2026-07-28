// =====================================================================
// Chronicle TRPG - v292Dfix606: 話者帰属の来歴（provenance）アナライザ
//
// ■なぜ作るのか（2026-07-28）
//   fix604 で「Xの喉の奥から声が漏れる」型を1つ足したが、これは**根本解決ではない**。
//   珍しい形にパターンを1つ足しただけで、公開品質には届かない。
//   GPT裁定: 「話者の誤りは『やり直す』ではなく**帰属レイヤーだけ**で直すのが正しい」。
//   その第一歩として必要なのは、新しい補正器ではなく **分母** である。
//
//     「いま、どのカードの話者が、何を根拠に決まっているのか」
//     「そのうち“根拠が弱い”のは何枚あるのか」
//
//   これが数えられないと、
//     ・直したあとに良くなったのかどうかが分からない
//     ・二次判定を「どのカードに」かけるべきかが決められない
//   ★このプロジェクトの繰り返しの教訓＝**挙動は変えず、まず観測できるようにする**。
//
// ■このモジュールが**やらないこと**（設計上の約束・テストで固定）
//   ・`c.who` を書き換えない（データ層に一切触れない）
//   ・DOM を触らない（`.dlg-name` も `.dlg-text` も読まない・書かない）
//   ・**localStorage へ1バイトも書かない**（fix569 と同じ約束。診断が診断で事故を起こさない）
//   ・ネットワークへ出ない・モデルを呼ばない
//   → つまり**入れても物語の挙動は1ミリも変わらない**。読み取りと分類だけ。
//
// ■なぜ永続化しないのか
//   来歴の根拠（`turn.narrative` と `_convSays`）は**すでにセーブに入っている**。
//   だから来歴はいつでも**その場で計算し直せる**。保存すると
//     ・容量を食う（実測 localStorage の空きは約1.5MB しかない）
//     ・セーブ本体やパッケージのhashに影響する疑いを増やす
//     ・古い記録と新しい分類器がずれて「どちらが正か」問題が生まれる
//   利点が無いので持たない。**唯一メモリにだけ持つのは「確定後に who が動いた回数」**
//   （これだけは後から再計算できないため。ページを閉じれば消えてよい情報）。
//
// ■分類（source）と確度（confidence）
//   | source            | 意味                                              | conf   |
//   |-------------------|---------------------------------------------------|--------|
//   | react-voice       | `<react 声="<say>…">` 由来。who が一次情報で明示    | high   |
//   | say-tag           | 本文の `<say who="X">` と who が一致              | high   |
//   | hero-utterance    | SAYターンで主人公が実際に入力した発話              | high   |
//   | say-tag-renamed   | `<say who="X">` はあるが最終 who が X と違う       | medium |
//   | bare-inferred     | 本文に say タグはあるが、このセリフは**タグ外**の裸引用 | low |
//   | harvest           | 本文に say タグが1つも無い（緩和ハーベスト/再生成） | low    |
//   | unmatched         | セリフが本文中に見つからない（AIが会話ログを再発明） | unknown|
//
// ■二次判定にかけるべきカード（GPT設計の4条件のうち、来歴だけで判る3つ）
//   ・`hero-default`      … 確度 low なのに話者が主人公＝「デフォルトしか根拠がない」
//   ・`short-utterance`   … 引用の実文字数が4字以下（「……ぇ」型。手がかりが本文側にしかない）
//   ・`evidence-conflict` … タグの who と最終 who が食い違う（後段が動いた＝どちらかが誤り）
//   （4つ目「候補差が小さい」は fix469 の内部スコアが要るので、この段では扱わない）
//
// ■読み出し（コンソール）
//   window.__v292Dfix606.stats()      … 分母つきの内訳（これが本命）
//   window.__v292Dfix606.review(n)    … 二次判定候補を n 件まで（証拠つき）
//   window.__v292Dfix606.revisions()  … 確定後に who が動いたカード（メモリのみ）
//   window.__v292Dfix606.selfTest()   … ★生存証明。人工の既知ケースが全分類で立つか
//
//   ★このプロジェクトの決まり: **「異常0件」だけを信じない。**
//     stats() は必ず `selfTestPassed` と `total`（分母）を一緒に返す。
//     selfTestPassed が false のときの数字は**採用しない**こと。
//
// ■★★fix607（2026-07-28・出荷直後に実データで自分の誤りを見つけた）
//   fix606 を出した直後、おしんの実セーブ165ターン560カードへ通したら
//   **say-tag が0件**、全部が harvest / unmatched に倒れた。
//   分類器の canary は合格していた（人工ケースでは7分類すべて立つ）。
//   つまり壊れていたのは分類器ではなく **証拠を読む場所** だった。
//
//     `turn.narrative` … 画面に出す本文。**タグは剥がされている**（実測 165/165 でタグ0）
//     `turn.plan.narrative` … モデルの構造化出力。**`<say who="…">` が生きている**
//        （実測 142/165 ターン・372タグ・全部 who="…" のダブルクォート・368が閉じタグ有り）
//
//   ★これは「分類器が全件を1つのラベルへ倒す」型（fix569 で踏んだのと同じ形）。
//     総数は 560 と健全に見えるので、**分類ごとの内訳を見なければ気づけなかった**。
//   → 証拠は `plan.narrative` を第一経路にし、そこに say が無ければ `turn.narrative` を見る。
//   → さらに stats() に **evidenceField**（どちらから読んだかの内訳）を足した。
//     次に同じ形で盲目になったら、この数字が先に教えてくれる。
//
// ■★★fix609（2026-07-28・実データで見つけた「数えすぎ」2件）
//   `unmatched`（セリフが本文に無い）が50件出たので中身を読んだら、**45件は私の数えすぎ**だった。
//     ・31件 … 句読点や三点リーダの表記が違うだけで**本文に在った**（句読点の校正でずれる）
//     ・14件 … **プレイヤー自身が入力した発話**。実データの `inputType` は**大文字の 'SAY'**で、
//              小文字だけを見ていたため hero-utterance が**1件も立っていなかった**
//   → (1) 完全一致で外れたときだけ**記号を落とした緩い照合**を試し、使ったら `punct-normalized` の印を残す
//     (2) `inputType` の比較を大小文字無視にする
//   ★教訓: **列挙値の大小文字を推測で決めない**。実データを見てから比較する。
//   ★緩い照合は「黙って緩める」と本当に本文に無いカードまで在ることになるので、
//     **使った件数を必ず印として数える**。緩めすぎていないことは canary（本当に無い例）で毎回確かめる。
//
// OFF: localStorage v292Dfix606Off='1'（分類を止め、stats は disabled を返す）
// =====================================================================
(function () {
  'use strict';
  if (window.__v292Dfix606) return;

  var MAX_REV_LOG = 200;      // メモリ上の変更ログ上限（ring）
  var EVID_CHARS = 32;        // 証拠として持つ前後の文字数
  /* 「短い声」の閾値（**中身のある文字**の数）。
     ★ここは実データで決めた: 「……ぇ」は括弧を除くと3字だが、そのうち2字は三点リーダで
       意味を持たない。単純な字数だと「おはよう」(4字)「誰かいる」(4字) まで巻き込み、
       候補が水増しされて**二次判定の的が絞れなくなる**。
       伸ばし棒・三点リーダ・句読点・記号を落とした残りで数え、2字以下を「短い声」とする。 */
  var SHORT_UTTER = 2;
  var FILLER_RE = /[…‥・ー〜~、。，．!?！？♪☆★\-—―　\s]/g;

  function off() { try { return localStorage.getItem('v292Dfix606Off') === '1'; } catch (e) { return false; } }

  /* S の取得は fix539 の正式APIを第一経路にする（fix547 と同じ作法）。
     ★window.S は意図的に生やしていないので、間接eval は第二経路として残す。 */
  function getS() {
    try { var a = window.__chronicleGetState ? window.__chronicleGetState('fix606') : null; if (a) return a; } catch (e) {}
    try { return window.S || (0, eval)('typeof S!=="undefined"?S:null') || null; } catch (e) { return null; }
  }

  function heroName(s) {
    try { return (s && s.cast && s.cast.hero && s.cast.hero.name) ? String(s.cast.hero.name) : ''; } catch (e) { return ''; }
  }

  /* ---------- 文字列の下ごしらえ ----------
     カードの say は鉤括弧を含むことも含まないこともある（index.html の抽出経路が2系統あるため）。
     照合は「括弧と空白を落とした素の文字列」で行う。★表示文字列は**書き換えない**（同一性キーなので）。 */
  function bare(t) {
    return String(t == null ? '' : t).replace(/[「」『』]/g, '').replace(/[\s　]+/g, '');
  }

  /* ★fix609（実データで自分の誤りを3つ目に見つけた）
     `unmatched`（＝セリフが本文に無い）が50件出たので中身を読んだところ、
       **31件は句読点や三点リーダの表記が違うだけ**で、本文に確かに在った。
       原因は句読点の校正(fix555)などで、カードと本文の表記が1文字ずれること。
     → 完全一致で見つからなかったときだけ、**記号を落とした緩い照合**を試す。
       緩い照合で見つかった場合は `punct-normalized` の印を付けて**件数を必ず出す**
       （黙って緩めると、本当に本文に無いカードまで「在る」ことになってしまう）。 */
  var PUNCT_RE = /[、。，．・…‥ー―—－\-!?！？"'“”゛゜~〜]/g;
  function loose(t) { return bare(t).replace(PUNCT_RE, ''); }

  /* ---------- 本文中の <say> タグを列挙する ----------
     属性のクォートは "…" / '…' / 裸 の3通りがありうる。推測で1通りに決めない。
     ★閉じタグが無い壊れた say（fix214 が直す前の形）は拾わない＝ここでは「タグ無し」と同じ扱い。 */
  var SAY_RE = /<say\b[^>]*\bwho\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/say>/g;

  function listSayTags(narrative) {
    var out = [], m, n = String(narrative || '');
    SAY_RE.lastIndex = 0;
    while ((m = SAY_RE.exec(n))) {
      var who = m[1] != null ? m[1] : (m[2] != null ? m[2] : (m[3] != null ? m[3] : ''));
      out.push({ who: String(who), text: String(m[4] || ''), at: m.index, bare: bare(m[4]) });
      if (SAY_RE.lastIndex === m.index) SAY_RE.lastIndex++;   // 空一致で無限ループしない
    }
    return out;
  }

  /* =====================================================================
     ★fix614（GPT実装順①「分類器の対応信頼度を追加」）
     タグとカードの**対応づけがどれくらい確かか**を、ターン単位で先に測る。
     GPT指摘: 同じ本文の引用が複数ある／後段でカードが増える／タグが壊れている、
     のいずれかがあると **index 対応がずれ**、分類そのものが当てにならなくなる。
     ★ここが 'high' でないカードへ強いタグロックを掛けると、
       **分類器の誤対応まで保護してしまう**（GPT明示）。だから先に測って持ち回る。
     ===================================================================== */
  function turnMapping(turn, es) {
    es = es || evidenceSource(turn);
    var text = es.text || '';
    var tags = listSayTags(text);
    var opens = (text.match(/<say\b/g) || []).length;
    var closes = (text.match(/<\/say>/g) || []).length;
    var broken = opens !== closes || opens !== tags.length;
    var seen = {}, dupTag = false;
    for (var i = 0; i < tags.length; i++) {
      var k = loose(tags[i].text);
      if (k && seen[k]) dupTag = true;
      if (k) seen[k] = 1;
    }
    var cards = (turn && turn._convSays) || [], seenC = {}, dupCard = false;
    for (var j = 0; j < cards.length; j++) {
      var kc = cards[j] && loose(cards[j].say);
      if (kc && seenC[kc]) dupCard = true;
      if (kc) seenC[kc] = 1;
    }
    return { tags: tags, tagCount: tags.length, broken: broken, dupTag: dupTag, dupCard: dupCard,
             ok: !broken && !dupTag && !dupCard };
  }

  /* ---------- ★証拠の在り処（fix607） ----------
     画面用の `turn.narrative` はタグが剥がされているので、話者の一次証拠は残っていない。
     モデルの構造化出力 `turn.plan.narrative` に `<say who="…">` が生きている。
     ★どちらから読んだかは stats().evidenceField に出す（黙って片方に倒れないように）。 */
  /* ★fix608: `plan.narrative` は**文字列ではなく段落の配列**だった（実測 165/165 ターン）。
     fix607 では `typeof === 'string'` で弾いてしまい、証拠を1件も読めていなかった
     （`evidenceField` を足しておいたおかげで `narrative-notag:165` として即座に見えた）。
     ★型を推測で決めない。文字列／文字列配列／{text}の配列 のどれでも受ける。 */
  function textOf(v) {
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) {
      var a = [];
      for (var i = 0; i < v.length; i++) {
        var e = v[i];
        if (typeof e === 'string') a.push(e);
        else if (e && typeof e === 'object') {
          if (typeof e.text === 'string') a.push(e.text);
          else if (typeof e.say === 'string') a.push(e.say);
        }
      }
      return a.join('\n');
    }
    return '';
  }

  function evidenceSource(turn) {
    var p = turn && turn.plan;
    var pn = p ? textOf(p.narrative) : '';
    var tn = turn ? textOf(turn.narrative) : '';
    if (pn && pn.indexOf('<say') >= 0) return { text: pn, field: 'plan' };
    if (tn && tn.indexOf('<say') >= 0) return { text: tn, field: 'narrative' };
    if (pn) return { text: pn, field: 'plan-notag' };
    return { text: tn, field: 'narrative-notag' };
  }

  /* ---------- 本文中でこのセリフが出てくる位置 ---------- */
  function locate(narrative, say) {
    var n = String(narrative || ''), s = String(say || '');
    if (!n || !s) return -1;
    var i = n.indexOf(s);
    if (i >= 0) return i;
    var b = s.replace(/^[「『]+|[」』]+$/g, '');
    return b ? n.indexOf(b) : -1;
  }

  /* ★fix609: 完全一致で見つからないときの「記号を無視した」在否判定。
     位置は返さない（緩い側の添字は元の本文の添字と対応しないため）。在るか無いかだけ。 */
  function looseHas(narrative, say) {
    var n = loose(narrative), s = loose(say);
    return !!(n && s && n.indexOf(s) >= 0);
  }

  function evidenceAt(narrative, at, len) {
    var n = String(narrative || '');
    if (at < 0) return { at: -1, before: '', after: '' };
    return {
      at: at,
      before: n.slice(Math.max(0, at - EVID_CHARS), at),
      after: n.slice(at + len, at + len + EVID_CHARS)
    };
  }

  /* =====================================================================
     分類本体（pure function）
     入力: turn（narrative / inputType / playerText / _convSays）と card と idx
     出力: { source, confidence, flags[], tagWho, evidence }
     ★副作用なし。turn も card も変更しない。
     ===================================================================== */
  function classifyCard(turn, card, idx, ctx) {
    ctx = ctx || {};
    var hero = String(ctx.hero || '');
    var es = ctx.es || evidenceSource(turn);
    var narrative = es.text || '';
    var who = String((card && card.who) || '');
    var say = String((card && card.say) || '');
    var flags = [], tagWho = null;
    var source, confidence;
    var matchConfidence = 'none', looseUsed = false;   // ★fix614

    // (1) <react 声="<say>…"> 由来は who が一次情報で明示されている＝聖域（index.html:1880 の _rv）
    if (card && card._rv === 1) {
      source = 'react-voice'; confidence = 'high';
    } else {
      /* ★★fix617（実データで見つけた重大な取り違え）
         短い叫び声（「——ッ！」「——っ」）が、記号を落とすと **1文字** になり、
         **無関係なタグに包含で当たっていた**。
         実例: カード「——ッ！」→ 記号除去で「ッ」→ タグ「ひっ……あ゛……ッ！！」に含まれるので
         「ヒナのセリフ」と誤って対応づけていた。しかも私はそれを **normalized（確かな対応）**と
         ラベルしていたので、ゲートが「タグを守る」判定を下していた。
         ★GPTが最初に警告していた「同じ本文の引用が複数ある」「後段でカードが増える」の実例。
         直し方（段階を分け、どの段でも**一意でなければ ambiguous**）:
           ① そのままの完全一致
           ② 記号を落とした完全一致
           ③ 包含（★中身が3文字以上のときだけ許す。1〜2文字の悲鳴で包含照合しない）
         いずれも候補が2つ以上あれば ambiguous＝**タグロックを掛けない**。 */
      var tags = ctx.tags || listSayTags(narrative);
      var sb = bare(say), sl = loose(say), hit = null;
      var exactHits = [], looseHits = [], containHits = [];
      for (var i = 0; i < tags.length; i++) {
        var tb = tags[i].bare, tl = loose(tags[i].text);
        if (sb && tb === sb) { exactHits.push(tags[i]); continue; }
        if (sl && tl && tl === sl) { looseHits.push(tags[i]); continue; }
        if (sl && sl.length >= 3 && tl && tl.indexOf(sl) >= 0) containHits.push(tags[i]);
      }
      if (exactHits.length === 1) { hit = exactHits[0]; matchConfidence = 'exact'; }
      else if (exactHits.length > 1) { hit = exactHits[0]; matchConfidence = 'ambiguous'; }
      else if (looseHits.length === 1) { hit = looseHits[0]; matchConfidence = 'normalized'; looseUsed = true; flags.push('punct-normalized'); }
      else if (looseHits.length > 1) { hit = looseHits[0]; matchConfidence = 'ambiguous'; looseUsed = true; flags.push('punct-normalized'); }
      else if (containHits.length === 1) { hit = containHits[0]; matchConfidence = 'contains'; }
      else if (containHits.length > 1) { hit = containHits[0]; matchConfidence = 'ambiguous'; }
      if (hit) {
        tagWho = hit.who;
        if (bare(hit.who) === bare(who)) { source = 'say-tag'; confidence = 'high'; }
        else { source = 'say-tag-renamed'; confidence = 'medium'; flags.push('evidence-conflict'); }
      } else if (locate(narrative, say) < 0 && !looseHas(narrative, say)) {
        // 本文に見当たらない＝会話ログを AI に再発明させた経路（index.html:1929 genConvLog）
        // ★fix609: 記号を無視しても見つからないときだけ unmatched にする
        source = 'unmatched'; confidence = 'unknown';
      } else if (tags.length === 0) {
        source = 'harvest'; confidence = 'low';
      } else {
        source = 'bare-inferred'; confidence = 'low';
      }
    }

    // (2) SAYターンの主人公発話は、抽出ではなく**おしんが入力した文字列**そのもの（index.html:1940）
    /* ★fix609: 実データの `inputType` は **大文字の 'SAY'**。小文字だけで比較していたため
       **プレイヤー自身が入力した発話14件が全部 `unmatched` に落ちていた**（＝14/50 の誤検出）。
       ★列挙値の大小文字を推測で決めない。実データを見てから比較する。 */
    var itype = String((turn && turn.inputType) || '').toLowerCase();
    if (idx === 0 && itype === 'say' && hero && bare(who) === bare(hero)) {
      var pt = loose(turn && turn.playerText || '');
      var sl2 = loose(say);
      if (pt && sl2 && (sl2.indexOf(pt) >= 0 || pt.indexOf(sl2) >= 0)) {
        source = 'hero-utterance'; confidence = 'high';
        // 誤検出防止: ここに来たら evidence-conflict は取り下げる（タグ側が後付けのため）
        flags = flags.filter(function (f) { return f !== 'evidence-conflict'; });
      }
    }

    // (3) 二次判定にかけるべき印
    var realLen = bare(say).length;                                   // 鉤括弧・空白を除いた字数
    var contentLen = bare(say).replace(FILLER_RE, '').length;         // さらに記号類を除いた「中身」の字数
    if (contentLen > 0 && contentLen <= SHORT_UTTER) flags.push('short-utterance');
    if ((confidence === 'low' || confidence === 'unknown') && hero && bare(who) === bare(hero)) flags.push('hero-default');

    var at = locate(narrative, say);
    return {
      source: source,
      confidence: confidence,
      flags: flags,
      tagWho: tagWho,
      who: who,
      evidenceField: es.field,
      /* ★fix614: この対応づけがどれくらい確かか。
         high でないカードには強いタグロックを掛けない（誤対応を保護しないため）。 */
      matchConfidence: matchConfidence,
      tagMappingHighConfidence: !!(ctx.mappingOk !== false && (matchConfidence === 'exact' || matchConfidence === 'normalized')),
      len: realLen,
      contentLen: contentLen,
      evidence: evidenceAt(narrative, at, at >= 0 ? String(say).length : 0)
    };
  }

  /* ---------- 全ターン走査（読み取り専用） ---------- */
  function analyze(turns, hero) {
    var res = { total: 0, turns: 0, bySource: {}, byConfidence: {}, byFlag: {}, evidenceField: {}, turnMapping: {}, byMatchConfidence: {}, items: [] };
    if (!Array.isArray(turns)) return res;
    for (var ti = 0; ti < turns.length; ti++) {
      var t = turns[ti];
      if (!t || !Array.isArray(t._convSays)) continue;
      res.turns++;
      var es = evidenceSource(t);
      res.evidenceField[es.field] = (res.evidenceField[es.field] || 0) + 1;
      var tm = turnMapping(t, es);
      res.turnMapping[tm.ok ? 'ok' : (tm.broken ? 'broken-tag' : (tm.dupTag ? 'duplicate-quote' : 'duplicate-card'))] =
        (res.turnMapping[tm.ok ? 'ok' : (tm.broken ? 'broken-tag' : (tm.dupTag ? 'duplicate-quote' : 'duplicate-card'))] || 0) + 1;
      var ctx = { hero: hero, es: es, tags: tm.tags, mappingOk: tm.ok };
      for (var ci = 0; ci < t._convSays.length; ci++) {
        var c = t._convSays[ci];
        if (!c) continue;
        var r = classifyCard(t, c, ci, ctx);
        res.total++;
        res.bySource[r.source] = (res.bySource[r.source] || 0) + 1;
        res.byConfidence[r.confidence] = (res.byConfidence[r.confidence] || 0) + 1;
        for (var fi = 0; fi < r.flags.length; fi++) res.byFlag[r.flags[fi]] = (res.byFlag[r.flags[fi]] || 0) + 1;
        res.byMatchConfidence[r.matchConfidence] = (res.byMatchConfidence[r.matchConfidence] || 0) + 1;
        if (r.flags.length) res.items.push({ turn: ti, card: ci, who: r.who, tagWho: r.tagWho, source: r.source, confidence: r.confidence, flags: r.flags, matchConfidence: r.matchConfidence, tagMappingHighConfidence: r.tagMappingHighConfidence, say: String(c.say || '').slice(0, 40), evidence: r.evidence });
      }
    }
    return res;
  }

  /* =====================================================================
     確定後に who が動いたカードの記録（メモリのみ・永続化しない）
     ★なぜ要るか: 後追い補正器が9本ある。「どの補正器が何枚動かしたか」が分からないと、
       新しい層を足したときに**どれと競合したか**を後から言えない。
     ★who の変化そのものを止めることはしない（挙動を変えない）。
     ===================================================================== */
  var baseline = Object.create(null);   // "turnIdx:cardIdx:sayKey" -> who（初回観測値）
  var revLog = [];                      // ring

  function keyOf(ti, ci, say) { return ti + ':' + ci + ':' + bare(say).slice(0, 24); }

  function sweep() {
    if (off()) return 0;
    var s = getS(); if (!s || !Array.isArray(s.turns)) return 0;
    var moved = 0;
    for (var ti = 0; ti < s.turns.length; ti++) {
      var t = s.turns[ti];
      if (!t || !Array.isArray(t._convSays)) continue;
      for (var ci = 0; ci < t._convSays.length; ci++) {
        var c = t._convSays[ci]; if (!c) continue;
        var k = keyOf(ti, ci, c.say), w = String(c.who || '');
        if (!(k in baseline)) { baseline[k] = w; continue; }
        if (baseline[k] !== w) {
          revLog.push({ turn: ti, card: ci, from: baseline[k], to: w, say: String(c.say || '').slice(0, 24), ts: Date.now() });
          if (revLog.length > MAX_REV_LOG) revLog.shift();
          baseline[k] = w;
          moved++;
        }
      }
    }
    return moved;
  }

  /* =====================================================================
     ★生存証明（canary）
     このプロジェクトで何度も踏んだ形＝**検出器そのものが死んでいて全件0**。
     人工の既知ケースを毎回通し、**分類ごとに1件以上立つ**ことを確かめる。
     「総数>0」では分類器の欠陥を捕まえられない（fix569 で実証済み）。
     ===================================================================== */
  function fixtures() {
    return [
      { name: 'say-tag', turn: { narrative: '<say who="ひなた">「おはよう」</say>', inputType: 'do', playerText: '' },
        card: { who: 'ひなた', say: '「おはよう」' }, idx: 1, expect: 'say-tag' },
      /* ★fix607: **実セーブの形**。画面用 narrative からはタグが剥がされ、
         証拠は plan.narrative にしか無い。これを canary に入れておかないと、
         「人工ケースだけ合格して実データでは全件が harvest に倒れる」を二度踏む。 */
      { name: 'say-tag(実セーブの形/plan由来)',
        turn: { narrative: '「おはよう」\nひなたが笑う。', inputType: 'do', playerText: '',
                plan: { narrative: '<say who="ひなた">「おはよう」</say>\nひなたが笑う。' } },
        card: { who: 'ひなた', say: '「おはよう」' }, idx: 1, expect: 'say-tag' },
      /* ★fix608: plan.narrative は**段落の配列**（実測 165/165）。ここを canary に入れる。 */
      { name: 'say-tag(実セーブの形/plan配列)',
        turn: { narrative: '「おはよう」\nひなたが笑う。', inputType: 'do', playerText: '',
                plan: { narrative: ['<say who="ひなた">「おはよう」</say>', 'ひなたが笑う。'] } },
        card: { who: 'ひなた', say: '「おはよう」' }, idx: 1, expect: 'say-tag' },
      { name: 'say-tag-renamed', turn: { narrative: '<say who="杏子">「行くよ」</say>', inputType: 'do', playerText: '' },
        card: { who: '氷川 杏子', say: '「行くよ」' }, idx: 1, expect: 'say-tag-renamed' },
      { name: 'react-voice', turn: { narrative: 'ひなたが息を呑む。', inputType: 'do', playerText: '' },
        card: { who: 'ひなた', say: '「……ぇ」', _rv: 1 }, idx: 1, expect: 'react-voice' },
      { name: 'hero-utterance', turn: { narrative: '<say who="白石澪">「行こう」</say>', inputType: 'say', playerText: '行こう' },
        card: { who: '白石澪', say: '「行こう」' }, idx: 0, expect: 'hero-utterance' },
      { name: 'bare-inferred', turn: { narrative: '<say who="ひなた">「おはよう」</say>\n「……ぇ」\nひなたの喉の奥から、声が漏れる。', inputType: 'do', playerText: '' },
        card: { who: '白石澪', say: '「……ぇ」' }, idx: 2, expect: 'bare-inferred' },
      { name: 'harvest', turn: { narrative: '「そこにいるのか」と、カエデが問う。', inputType: 'do', playerText: '' },
        card: { who: 'カエデ', say: '「そこにいるのか」' }, idx: 1, expect: 'harvest' },
      { name: 'unmatched', turn: { narrative: '風が吹いた。', inputType: 'do', playerText: '' },
        card: { who: 'レナ', say: '「誰かいる」' }, idx: 1, expect: 'unmatched' }
    ];
  }

  function selfTest() {
    var hero = '白石澪', okAll = true, detail = [], seen = {};
    var fx = fixtures();
    for (var i = 0; i < fx.length; i++) {
      var f = fx[i];
      var r;
      try { r = classifyCard(f.turn, f.card, f.idx, { hero: hero }); } catch (e) { r = { source: 'THREW:' + e.message, confidence: '', flags: [] }; }
      var good = (r.source === f.expect);
      if (!good) okAll = false;
      seen[r.source] = true;
      detail.push({ name: f.name, expect: f.expect, got: r.source, conf: r.confidence, flags: r.flags, ok: good });
    }
    /* 二次判定フラグ側の canary（フラグが1つも立たない＝印の付け忘れを検出）。
       ★添字ではなく名前で引く。添字にすると fixture を1つ足しただけで
         「別のケースを検査して静かに合格する」ようになる（実際に fix607 で踏んだ）。 */
    var bi = null;
    for (var j = 0; j < fx.length; j++) if (fx[j].name === 'bare-inferred') bi = fx[j];
    var shortR = bi ? classifyCard(bi.turn, bi.card, bi.idx, { hero: hero }) : { flags: [] };
    var flagOk = shortR.flags.indexOf('short-utterance') >= 0 && shortR.flags.indexOf('hero-default') >= 0;
    if (!flagOk) okAll = false;
    detail.push({ name: 'flags(short+hero-default)', expect: 'both', got: shortR.flags.join(','), ok: flagOk });
    return { ok: okAll, classesSeen: Object.keys(seen).length, detail: detail };
  }

  /* ---------- 公開API（すべて読み取り専用） ---------- */
  function stats() {
    if (off()) return { disabled: true };
    var st = selfTest();
    var s = getS();
    var a = analyze(s && s.turns, heroName(s));
    return {
      selfTestPassed: st.ok,             // ★false のときの数字は採用しない
      classesSeen: st.classesSeen,
      turns: a.turns,
      total: a.total,                    // ★分母
      bySource: a.bySource,
      byConfidence: a.byConfidence,
      byFlag: a.byFlag,
      evidenceField: a.evidenceField,   // ★fix607: 証拠をどちらの欄から読んだか（盲目化の早期警報）
      turnMapping: a.turnMapping,       // ★fix614: タグ対応が壊れているターンの内訳
      byMatchConfidence: a.byMatchConfidence,
      needsReview: a.items.length,
      revisionsObserved: revLog.length
    };
  }

  function review(n) {
    if (off()) return { disabled: true };
    var s = getS();
    var a = analyze(s && s.turns, heroName(s));
    return a.items.slice(0, Math.max(1, n || 20));
  }

  window.__v292Dfix606 = {
    classifyCard: classifyCard,
    listSayTags: listSayTags,
    evidenceSource: evidenceSource,
    turnMapping: turnMapping,
    textOf: textOf,
    loose: loose,
    looseHas: looseHas,
    analyze: analyze,
    sweep: sweep,
    revisions: function () { return revLog.slice(); },
    stats: stats,
    review: review,
    selfTest: selfTest,
    _fixtures: fixtures
  };

  /* 変化の観測だけ回す。★書き換えは一切しない（見るだけ）。 */
  try { setInterval(function () { try { sweep(); } catch (e) {} }, 3000); } catch (e) {}
  try { console.log('[v292Dfix606] speaker provenance analyzer (read-only) ready'); } catch (e) {}
})();
