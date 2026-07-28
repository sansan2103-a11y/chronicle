// =====================================================================
// Chronicle TRPG - v292Dfix616: 話者の「由来」をターンに記録する（GPT実装順②）
//
// ■なぜ必要か（GPT裁定）
//   会話ログのカード（`turn._convSays[] = {who, say}`）には、
//   **その who がどこから来たのか**が残っていない。
//   来歴は `turn.plan.narrative` の `<say who="…">` から**計算し直せる**（fix606 がそうしている）が、
//   時間が経つと対応づけが壊れる:
//     ・同じ本文の引用が複数あると、どのタグがどのカードか分からなくなる
//     ・後段（緩和ハーベスト・裸引用抽出）が**カードを増やす**と index がずれる
//     ・句読点の校正で本文が1文字ずれる
//   → **確定した瞬間に対応を固定しておく**のが唯一の解。それがこの層。
//
// ■設計（GPT指定の形。カード本体ではなく**並行配列**）
//   turn._convSayMeta = [
//     { sourceKind, sourceWhoRaw, charOffset, paragraphIndex, tagOrdinal, tagMappingConfidence, speakerRevision }
//   ★charOffset = 段落を連結した本文中の文字位置 / paragraphIndex = 何段落目か（fix621 で分離）
//   ]
//   ★`_convSays[i]` と**同じ添字**で対応する。カードの中身は**1文字も変えない**。
//   ★`say` も `.dlg-text` も触らない（表示文字列＝同一性キー）。
//
// ■安全側の約束
//   ・**新しいターンだけ**に付ける。過去ターンへ遡って書かない
//     （容量が増える／既存セーブを大きく書き換える／どちらも避ける）
//   ・★fix622: meta を**付けたときだけ** `S.save()` を1回呼ぶ（毎ターン無条件には呼ばない）
//     当初は「次の自然な保存に相乗りする」としていたが、実機で**間違いだと分かった**。
//     index.html の順序は `S.turns.push(turn); S.save(); UI.appendTurn(…)` なので、
//     meta は直前の保存に間に合わず、しかも「次の保存」は来る保証が無い
//     （最後のターンでは誰も保存せず、再読み込みで**消える**。実測で消えた）。
//     localStorage へ直接書かない約束は守る＝経路は S.save() だけ。
//   ・カードが極端に多いターン（既定 40枚超）や、meta が大きすぎるターンは**付けない**
//   ・`_convSays` / `who` / DOM は触らない。localStorage へも自分では書かない
//   ・OFF: localStorage `v292Dfix616Off='1'`
//   ・後始末: `window.__v292Dfix616.purge()` で全ターンから `_convSayMeta` を消せる
//     （明示的に呼んだときだけ。自動では動かない）
//
// ■読み出し
//   window.__v292Dfix616.stats()     … 付与できた/できなかった内訳
//   window.__v292Dfix616.coverage()  … 全ターン中どれだけ meta を持っているか
//   window.__v292Dfix616.selfTest()  … ★生存証明
//
// ■ロールバック
//   OFF スイッチで**書き足しが止まる**。既に付いた `_convSayMeta` は
//   読む側が誰も参照しないので**害が無い**（未知フィールドは無視される）。
//   完全に消したいときだけ `purge()`。
// =====================================================================
(function () {
  'use strict';
  if (window.__v292Dfix616) return;

  var MAX_CARDS = 40;        // これより多いターンは付けない（容量の暴走防止）
  var MAX_META_CHARS = 8000; // 1ターンの meta がこれを超えたら付けない

  var stats = { attached: 0, migrated: 0, saves: 0, skippedNoProv: 0, skippedTooMany: 0, skippedTooBig: 0, skippedNoCards: 0, alreadyHad: 0, errors: 0 };

  function off() { try { return localStorage.getItem('v292Dfix616Off') === '1'; } catch (e) { return false; } }

  function getS() {
    try { var a = window.__chronicleGetState ? window.__chronicleGetState('fix616') : null; if (a) return a; } catch (e) {}
    try { return window.S || (0, eval)('typeof S!=="undefined"?S:null') || null; } catch (e) { return null; }
  }
  function getUI() { try { return window.UI || (typeof UI !== 'undefined' ? UI : null); } catch (e) { return null; } }
  function heroName(s) { try { return (s && s.cast && s.cast.hero && s.cast.hero.name) ? String(s.cast.hero.name) : ''; } catch (e) { return ''; } }

  /* ---------- 由来の組み立て（純関数） ----------
     fix606（分類）を唯一の判定元にする。★同じ判定を2箇所に書かない。 */
  function buildMeta(turn, hero) {
    var prov = window.__v292Dfix606;
    if (!prov || typeof prov.classifyCard !== 'function') return { ok: false, why: 'no-prov' };
    var cards = (turn && turn._convSays) || [];
    if (!cards.length) return { ok: false, why: 'no-cards' };
    if (cards.length > MAX_CARDS) return { ok: false, why: 'too-many' };

    var es = prov.evidenceSource(turn);
    var tm = prov.turnMapping ? prov.turnMapping(turn, es) : null;
    var tags = tm ? tm.tags : prov.listSayTags(es.text);
    var meta = [];
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      if (!c) { meta.push(null); continue; }
      var r = prov.classifyCard(turn, c, i, { hero: hero, es: es, tags: tags, mappingOk: tm ? tm.ok : true });
      /* タグ由来なら、そのタグが本文の何番目か（tagOrdinal）と、段落の位置（paragraphIndex）を残す。
         ★後からカードが増えても、この2つがあれば元の対応を追える。 */
      /* ★★fix618（2026-07-28・実データで判明した重大な前提の揺らぎ）
         `<say who="X">` は **モデルが書いたとは限らない**。
         fix464（裸セリフ→タグ昇格）が、行全体が裸引用の行を fix462 の採点で解決し、
         **後から `<say who="X">` を挿入している**。
         保存されたテキストからは**両者を区別できない**（実測: 括弧の有無も行の形も、
         モデル由来 356件 / 挿入 の見分けに使えなかった）。
         → 区別できるのは**その場だけ**。fix464 が持っている昇格ログをここで拾って印を残す。
         ★これが無いと「タグ＝一次証拠」という中央ゲートの前提が部分的に崩れる。
         ★過去ターンには遡れない（記録が残っていない）。新しいターンからだけ判別できる。 */
      var promoted = null;
      try {
        var f464 = window.__v292Dfix464;
        var log = (f464 && typeof f464.stats === 'function') ? (f464.stats().last || []) : [];
        var sl464 = prov.loose(c.say);
        for (var q = 0; q < log.length; q++) {
          if (log[q] && sl464 && prov.loose(log[q].say) && sl464.indexOf(prov.loose(log[q].say)) >= 0) { promoted = log[q]; break; }
        }
      } catch (e) {}

      var ord = -1;
      if (r.tagWho != null) {
        var sb = prov.loose(c.say);
        for (var j = 0; j < tags.length; j++) {
          var tl = prov.loose(tags[j].text);
          if (tl && sb && (tl === sb || tl.indexOf(sb) >= 0)) { ord = j; break; }
        }
      }
      /* ★★fix621（実機の1ターン目で自分の誤りを見つけた）
         ここは元々 `paragraphIndex` に `r.evidence.at` を入れていたが、
         `at` は `listSayTags()` が返す **連結後の文字位置**であって段落番号ではない。
         実測: plan.narrative が 6段落（長さ 85/32/36/51/36/24）のターンで
         paragraphIndex が 102/172/224 になっていた（＝段落番号ではありえない値）。
         挙動には影響しないが、**後から来歴を追う人を確実に誤解させる**ので直す。
         → `charOffset`（連結後の文字位置）と `paragraphIndex`（真の段落番号）を**両方**残す。
         ★段落番号は fix606 の partsOf/paraIndexOf に一任する（同じ抽出規則を2箇所に書かない）。 */
      var evAt = (r.evidence && r.evidence.at != null) ? r.evidence.at : -1;
      var paraIx = -1;
      try {
        if (typeof prov.paraIndexOf === 'function' && es && es.parts) paraIx = prov.paraIndexOf(es.parts, evAt);
      } catch (e) {}
      meta.push({
        sourceKind: promoted ? 'say-tag-promoted' : r.source,
        promotedBy: promoted ? 'fix464' : null,
        promoteScore: promoted ? (promoted.score || null) : null,
        sourceWhoRaw: r.tagWho != null ? String(r.tagWho) : null,
        charOffset: evAt,
        paragraphIndex: paraIx,
        tagOrdinal: ord,
        tagMappingConfidence: r.matchConfidence || 'none',
        speakerRevision: 0
      });
    }
    var s = '';
    try { s = JSON.stringify(meta); } catch (e) { return { ok: false, why: 'stringify' }; }
    if (s.length > MAX_META_CHARS) return { ok: false, why: 'too-big' };
    return { ok: true, meta: meta };
  }

  /* fix621 より前の形か（＝`charOffset` を1つも持たない）。空配列は旧形扱いしない。 */
  function isStaleMeta(m) {
    if (!Array.isArray(m) || !m.length) return false;
    for (var i = 0; i < m.length; i++) {
      if (m[i] && typeof m[i] === 'object' && Object.prototype.hasOwnProperty.call(m[i], 'charOffset')) return false;
    }
    return true;
  }

  /* ---------- ターンへ付ける（★_convSays には触らない） ---------- */
  function attach(turn, hero) {
    if (off()) return false;
    try {
      if (!turn || typeof turn !== 'object') return false;
      /* ★fix621: 既に meta があれば触らない。ただし `charOffset` を持たない**旧形**だけは作り直す
         （fix621 より前に付いた meta は paragraphIndex の意味が違うため。★対象はこのターンだけで、
           過去ターンへ遡る動きにはならない＝「新しいターンだけ」の約束は保たれる）。 */
      if (Array.isArray(turn._convSayMeta)) {
        if (!isStaleMeta(turn._convSayMeta)) { stats.alreadyHad++; return false; }
        stats.migrated++;
      }
      var r = buildMeta(turn, hero);
      if (!r.ok) {
        if (r.why === 'no-prov') stats.skippedNoProv++;
        else if (r.why === 'too-many') stats.skippedTooMany++;
        else if (r.why === 'too-big') stats.skippedTooBig++;
        else stats.skippedNoCards++;
        return false;
      }
      turn._convSayMeta = r.meta;
      stats.attached++;
      return true;
    } catch (e) { stats.errors++; return false; }
  }

  /* ★fix622: 付けた meta を確実に残す。
     ・localStorage へ**自分では書かない**（S.save() が唯一の正規経路）という約束は守る
     ・呼ぶのは attach が true を返したときだけ（＝毎ターン無条件には呼ばない）
     ・save が無い/落ちる環境でも例外を外へ出さない */
  function requestSave() {
    try {
      var s = getS();
      if (s && typeof s.save === 'function') { s.save(); stats.saves++; return true; }
    } catch (e) { stats.errors++; }
    return false;
  }

  /* ---------- 配線: ターンが確定した瞬間（UI.appendTurn） ---------- */
  function install() {
    var UI = getUI();
    if (!UI) return false;
    if (UI.__v292Dfix616) return true;
    try {
      if (typeof UI.appendTurn === 'function') {
        var oa = UI.appendTurn.bind(UI);
        UI.appendTurn = function (turn, idx) {
          /* ★★fix622（実機で判明。ここには**私の誤解**が書いてあった）
             元のコメントは「appendTurn は S.save() の直後に呼ばれるので次の保存で永続化される」。
             前半は正しいが、結論が逆だった。index.html の実際の順序は
                 S.turns.push(turn); S.save(); UI.appendTurn(turn, …);
             つまり meta は**いま終わった保存に必ず間に合わない**。
             そして「次の保存」は来る保証が無い（最後のターンでは誰も保存しない）。
             実測: 1ターン目を回して再読み込みしたら `_convSayMeta` は**消えていた**。
             保存されたスロットを見ると `_convSayMeta` の文字列が1つも無く、
             その場で S.save() を1回呼ぶと 4507→4896 バイトになって現れた
             （＝**削られてはいない。単に一度も保存されていなかった**）。
             → 付けたときだけ、自分で1回保存する。fix620 が既に同じ流儀（変わったときだけ保存）。 */
          var did = false;
          try { did = attach(turn, heroName(getS())); } catch (e) { stats.errors++; }
          if (did) requestSave();
          return oa(turn, idx);
        };
      }
    } catch (e) { stats.errors++; }
    UI.__v292Dfix616 = true;
    try { console.log('[v292Dfix616] say-provenance persist wired (new turns only)'); } catch (e) {}
    return true;
  }
  (function w() { w._n = (w._n || 0) + 1; if (install()) return; if (w._n > 120) return; setTimeout(w, 500); })();

  /* ---------- 読み出し ---------- */
  function coverage() {
    var s = getS(), t = (s && s.turns) || [];
    var withMeta = 0, withCards = 0, mismatched = 0;
    for (var i = 0; i < t.length; i++) {
      var x = t[i]; if (!x || !Array.isArray(x._convSays)) continue;
      withCards++;
      if (Array.isArray(x._convSayMeta)) {
        withMeta++;
        if (x._convSayMeta.length !== x._convSays.length) mismatched++;
      }
    }
    return { turnsWithCards: withCards, turnsWithMeta: withMeta, lengthMismatch: mismatched };
  }

  /* ★明示的に呼んだときだけ全ターンから meta を落とす（自動では動かない） */
  function purge() {
    var s = getS(), t = (s && s.turns) || [], n = 0;
    for (var i = 0; i < t.length; i++) { if (t[i] && Array.isArray(t[i]._convSayMeta)) { delete t[i]._convSayMeta; n++; } }
    return { purgedTurns: n, note: 'S.save() は呼んでいません。次の保存で反映されます。' };
  }

  /* ★★fix622: selfTest はカウンタを**汚してはいけない**。
     実機で踏んだ: stats() が内部で selfTest() を呼んでいたため、
     `attached:1 / alreadyHad:1` や fix620 の `denied:{...:1}` が
     **人工ターンの分**で埋まり、実データの観測値だと読み違えた（実際は 0件だった）。
     観測窓が観測するだけで動くなら、その数字は証拠に使えない。
     → selfTest の前後でカウンタを退避・復元する。 */
  function withoutCounting(fn) {
    var snap = {}; for (var k in stats) snap[k] = stats[k];
    try { return fn(); } finally { for (var k2 in snap) stats[k2] = snap[k2]; }
  }

  /* ★生存証明: 人工の1ターンで、meta が正しい形で付き、_convSays が変わらないこと */
  function selfTest() { return withoutCounting(_selfTest); }
  function _selfTest() {
    var turn = {
      inputType: 'DO',
      narrative: '「おはよう」\nひなたが笑う。',
      plan: { narrative: ['<say who="ひなた">「おはよう」</say>', 'ひなたが笑う。'] },
      _convSays: [{ who: 'ひなた', say: '「おはよう」' }]
    };
    var before = JSON.stringify(turn._convSays);
    var okAttach = attach(turn, '白石澪');
    var m = turn._convSayMeta;
    var detail = {
      attached: okAttach,
      hasArray: Array.isArray(m),
      sameLength: Array.isArray(m) && m.length === turn._convSays.length,
      sourceKind: m && m[0] && m[0].sourceKind,
      sourceWhoRaw: m && m[0] && m[0].sourceWhoRaw,
      tagOrdinal: m && m[0] && m[0].tagOrdinal,
      charOffset: m && m[0] && m[0].charOffset,
      paragraphIndex: m && m[0] && m[0].paragraphIndex,
      mapConf: m && m[0] && m[0].tagMappingConfidence,
      cardsUntouched: JSON.stringify(turn._convSays) === before,
      idempotent: attach(turn, '白石澪') === false
    };
    var ok = detail.attached === true && detail.hasArray && detail.sameLength &&
      detail.sourceKind === 'say-tag' && detail.sourceWhoRaw === 'ひなた' &&
      detail.tagOrdinal === 0 && detail.mapConf === 'exact' &&
      detail.charOffset === 15 && detail.paragraphIndex === 0 &&   /* ★fix621: 15=「おはよう」の文字位置 / 0=1段落目 */
      detail.cardsUntouched && detail.idempotent;
    return { ok: ok, detail: detail };
  }

  window.__v292Dfix616 = {
    buildMeta: buildMeta,
    attach: attach,
    coverage: coverage,
    isStaleMeta: isStaleMeta,
    purge: purge,
    stats: function () { var o = {}; for (var k in stats) o[k] = stats[k]; o.disabled = off(); o.selfTestPassed = selfTest().ok; return o; },
    selfTest: selfTest,
    _limits: { MAX_CARDS: MAX_CARDS, MAX_META_CHARS: MAX_META_CHARS }
  };
})();
