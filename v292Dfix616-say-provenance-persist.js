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
//     { sourceKind, sourceWhoRaw, paragraphIndex, tagOrdinal, tagMappingConfidence, speakerRevision }
//   ]
//   ★`_convSays[i]` と**同じ添字**で対応する。カードの中身は**1文字も変えない**。
//   ★`say` も `.dlg-text` も触らない（表示文字列＝同一性キー）。
//
// ■安全側の約束
//   ・**新しいターンだけ**に付ける。過去ターンへ遡って書かない
//     （容量が増える／既存セーブを大きく書き換える／どちらも避ける）
//   ・自分から `S.save()` を**呼ばない**。次の自然な保存に相乗りする
//     （大きな書込は副作用で別の控えを消すことがある、というこのプロジェクトの実害を踏まえて）
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

  var stats = { attached: 0, skippedNoProv: 0, skippedTooMany: 0, skippedTooBig: 0, skippedNoCards: 0, alreadyHad: 0, errors: 0 };

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
      meta.push({
        sourceKind: promoted ? 'say-tag-promoted' : r.source,
        promotedBy: promoted ? 'fix464' : null,
        promoteScore: promoted ? (promoted.score || null) : null,
        sourceWhoRaw: r.tagWho != null ? String(r.tagWho) : null,
        paragraphIndex: r.evidence && r.evidence.at != null ? r.evidence.at : -1,
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

  /* ---------- ターンへ付ける（★_convSays には触らない） ---------- */
  function attach(turn, hero) {
    if (off()) return false;
    try {
      if (!turn || typeof turn !== 'object') return false;
      if (Array.isArray(turn._convSayMeta)) { stats.alreadyHad++; return false; }
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

  /* ---------- 配線: ターンが確定した瞬間（UI.appendTurn） ---------- */
  function install() {
    var UI = getUI();
    if (!UI) return false;
    if (UI.__v292Dfix616) return true;
    try {
      if (typeof UI.appendTurn === 'function') {
        var oa = UI.appendTurn.bind(UI);
        UI.appendTurn = function (turn, idx) {
          /* ★ここでは保存しない。次の自然な保存に相乗りする。
             appendTurn は S.save() の**直後**に呼ばれるので、この回の meta は次の保存で永続化される。 */
          try { attach(turn, heroName(getS())); } catch (e) { stats.errors++; }
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

  /* ★生存証明: 人工の1ターンで、meta が正しい形で付き、_convSays が変わらないこと */
  function selfTest() {
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
      mapConf: m && m[0] && m[0].tagMappingConfidence,
      cardsUntouched: JSON.stringify(turn._convSays) === before,
      idempotent: attach(turn, '白石澪') === false
    };
    var ok = detail.attached === true && detail.hasArray && detail.sameLength &&
      detail.sourceKind === 'say-tag' && detail.sourceWhoRaw === 'ひなた' &&
      detail.tagOrdinal === 0 && detail.mapConf === 'exact' &&
      detail.cardsUntouched && detail.idempotent;
    return { ok: ok, detail: detail };
  }

  window.__v292Dfix616 = {
    buildMeta: buildMeta,
    attach: attach,
    coverage: coverage,
    purge: purge,
    stats: function () { var o = {}; for (var k in stats) o[k] = stats[k]; o.disabled = off(); o.selfTestPassed = selfTest().ok; return o; },
    selfTest: selfTest,
    _limits: { MAX_CARDS: MAX_CARDS, MAX_META_CHARS: MAX_META_CHARS }
  };
})();
