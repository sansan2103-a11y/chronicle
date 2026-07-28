// =====================================================================
// Chronicle TRPG - v292Dfix620: 話者の突き合わせを**実際に適用する**層（GPT実装順⑨）
//
// ■位置づけ
//   fix611 は**判定だけ**（影モード）。この fix620 が「適用」を受け持つ。
//   判定と適用を別ファイルに分けているのは、
//   **fix611 が「副作用ゼロ」であることをテストで固定し続けられるようにする**ため。
//
// ■何をするか
//   (1) 新しいターンが確定した瞬間（`UI.appendTurn`）に突き合わせを1回だけ走らせ、
//       fix611 の12条件を全部満たしたカードの `who` を**モデルのタグへ揃える**。
//   (2) 過去ターンの直しは**自動ではやらない**。`repairPast()` を明示的に呼んだときだけ。
//       ★既定は dryRun（何も書かない）。
//
// ■絶対に守ること（テストで固定）
//   ・カード本文（`say`）と表示文字列は**1文字も変えない**。動かすのは `who` だけ
//   ・12条件を1つでも満たさなければ**触らない**（判定は fix611 に一任。ここでは判定しない）
//   ・過去ターンへ**自動では**遡らない
//   ・書き換える前に**元の値を復元用に残す**（★fix623: `v292Dfix620_restore_<スロットid>`＝**物語ごと**。
//     共有キーだと2つ目以降の物語が戻せなくなる。fix623 前の共有キーも読める）
//   ・OFF: localStorage `v292Dfix620ApplyOff='1'`（＝完全に従来の who へ戻る）
//     さらに fix611 側の `v292Dfix619ReconcilerOff='1'` でも止まる（二重の逃げ道）
//
// ■読み出し
//   window.__v292Dfix620.stats()            … 適用件数と却下理由
//   window.__v292Dfix620.repairPast()       … 過去ターンの提案一覧（★書かない）
//   window.__v292Dfix620.repairPast({apply:true}) … 実際に直す（復元用の記録を残してから）
//   window.__v292Dfix620.restoreInfo()      … 復元用に残した記録
//   window.__v292Dfix620.undoPast()         … その記録から元へ戻す
//   window.__v292Dfix620.selfTest()         … ★生存証明
// =====================================================================
(function () {
  'use strict';
  if (window.__v292Dfix620) return;

  /* ★★fix623（実機で 5物語を順に直そうとして気づいた）
     復元用の記録キーが**物語ごとに分かれていなかった**。
     記録は「1回だけ・上書きしない」設計なので、
       1つ目の物語を直した時点でキーが埋まり、
       **2つ目以降の物語は記録が残らない＝`undoPast()` で戻せない**。
     「いつでも戻せる」がこの層の安全性の根拠なので、これは黙って壊れていては困る。
     → キーを `v292Dfix620_restore_<スロットid>` に分ける。
     ★fix623 より前に書かれた記録（キーに物語idが無い）も読めるようにする
       （1つ目の物語の戻し道を失わないため）。 */
  var RESTORE_BASE = 'v292Dfix620_restore';
  function slotId() {
    try {
      var k = (window.__chr6Key ? window.__chr6Key() : '') || '';
      return k ? String(k).replace(/^chr6_slot_/, '') : '';
    } catch (e) { return ''; }
  }
  function restoreKey() { var s = slotId(); return s ? (RESTORE_BASE + '_' + s) : RESTORE_BASE; }
  var MAX_RESTORE = 400;
  var stats = { turnsSeen: 0, applied: 0, proposed: 0, denied: {}, errors: 0, pastApplied: 0 };

  function off() { try { return localStorage.getItem('v292Dfix620ApplyOff') === '1'; } catch (e) { return false; } }
  function gate() { return window.__v292Dfix611 || null; }

  function getS() {
    try { var a = window.__chronicleGetState ? window.__chronicleGetState('fix620') : null; if (a) return a; } catch (e) {}
    try { return window.S || (0, eval)('typeof S!=="undefined"?S:null') || null; } catch (e) { return null; }
  }
  function getUI() { try { return window.UI || (typeof UI !== 'undefined' ? UI : null); } catch (e) { return null; } }
  function castOf(s) {
    try {
      var c = s && s.cast; if (!c) return [];
      return [(c.hero && c.hero.name) || ''].concat((c.npcs || []).map(function (n) { return n && n.name; })).filter(Boolean);
    } catch (e) { return []; }
  }

  /* 1ターン分。★判定は fix611 に一任し、ここでは条件を再実装しない（二重実装を作らない）。 */
  function applyTurn(turn, cast, hero) {
    var g = gate();
    if (off() || !g || typeof g.reconcileTurn !== 'function') return 0;
    var r;
    try { r = g.reconcileTurn(turn, cast, hero); } catch (e) { stats.errors++; return 0; }
    if (!r || r.disabled) return 0;
    for (var k in r.denied) stats.denied[k] = (stats.denied[k] || 0) + r.denied[k];
    stats.proposed += (r.proposals || []).length;
    if (!r.proposals || !r.proposals.length) return 0;

    var cards = turn._convSays || [], n = 0;
    for (var i = 0; i < r.proposals.length; i++) {
      var p = r.proposals[i], c = cards[p.cardIndex];
      if (!c) continue;
      if (String(c.who) !== String(p.from)) continue;     // 途中で変わっていたら触らない
      c.who = p.to;                                       // ★who だけ。say は触らない
      n++;
    }
    stats.applied += n;
    return n;
  }

  /* ---------- 新しいターンの確定時に1回 ---------- */
  function install() {
    var UI = getUI();
    if (!UI) return false;
    if (UI.__v292Dfix620) return true;
    try {
      if (typeof UI.appendTurn === 'function') {
        var oa = UI.appendTurn.bind(UI);
        UI.appendTurn = function (turn, idx) {
          try {
            stats.turnsSeen++;
            var s = getS();
            var n = applyTurn(turn, castOf(s), (s && s.cast && s.cast.hero && s.cast.hero.name) || '');
            if (n > 0) {
              /* 変わったときだけ保存と再描画（他の補正器と同じ流儀）。 */
              try { s && s.save && s.save(); } catch (e) {}
              try { if (window.__v292Dfix66 && typeof window.__v292Dfix66.repair === 'function') window.__v292Dfix66.repair(); } catch (e) {}
              try { console.log('[v292Dfix620] 話者をタグへ揃えました:', n, '件'); } catch (e) {}
            }
          } catch (e) { stats.errors++; }
          return oa(turn, idx);
        };
      }
    } catch (e) { stats.errors++; }
    UI.__v292Dfix620 = true;
    try { console.log('[v292Dfix620] speaker reconcile apply wired (new turns)'); } catch (e) {}
    return true;
  }
  (function w() { w._n = (w._n || 0) + 1; if (install()) return; if (w._n > 120) return; setTimeout(w, 500); })();

  /* =====================================================================
     過去ターンの直し（★明示的に呼んだときだけ。既定は dryRun）
     ===================================================================== */
  function repairPast(opts) {
    opts = opts || {};
    var apply = opts.apply === true;
    var g = gate(), s = getS();
    if (!g) return { error: 'fix611-missing' };
    if (off()) return { disabled: true };
    var turns = (s && s.turns) || [];
    var cast = castOf(s), hero = cast[0] || '';
    var out = { turns: turns.length, proposals: [], applied: 0, dryRun: !apply };
    for (var i = 0; i < turns.length; i++) {
      var t = turns[i];
      if (!t || !Array.isArray(t._convSays)) continue;
      var r;
      try { r = g.reconcileTurn(t, cast, hero); } catch (e) { stats.errors++; continue; }
      if (!r || !r.proposals) continue;
      for (var j = 0; j < r.proposals.length; j++) {
        var p = r.proposals[j];
        out.proposals.push({ turn: i, card: p.cardIndex, from: p.from, to: p.to, say: p.say });
      }
    }
    if (!apply) return out;

    /* ★書く前に、元の値を復元用に残す（その物語について1回だけ・上書きしない）。
       ★fix623: キーは物語ごと。ここを共有すると2つ目以降の物語が戻せなくなる。 */
    try {
      var rk = restoreKey();
      if (!localStorage.getItem(rk)) {
        var rec = { ts: Date.now(), slot: slotId(), items: out.proposals.slice(0, MAX_RESTORE) };
        localStorage.setItem(rk, JSON.stringify(rec));
      }
    } catch (e) { return { error: 'restore-write-failed', detail: String(e && e.message).slice(0, 60) }; }

    for (var q = 0; q < out.proposals.length; q++) {
      var pp = out.proposals[q], tt = turns[pp.turn];
      var cc = tt && tt._convSays && tt._convSays[pp.card];
      if (!cc || String(cc.who) !== String(pp.from)) continue;
      cc.who = pp.to; out.applied++;
    }
    stats.pastApplied += out.applied;
    if (out.applied > 0) {
      try { s && s.save && s.save(); } catch (e) {}
      try { if (window.__v292Dfix66 && typeof window.__v292Dfix66.repair === 'function') window.__v292Dfix66.repair(); } catch (e) {}
    }
    return out;
  }

  /* ★fix623: まず物語ごとのキーを見る。無ければ fix623 より前の共有キーへ落ちる
     （1つ目の物語の戻し道を失わないため）。どちらから読んだかも返す。 */
  function restoreInfo() {
    try {
      var rk = restoreKey();
      var v = localStorage.getItem(rk);
      if (v) { var o = JSON.parse(v); if (o) o._key = rk; return o; }
      if (rk !== RESTORE_BASE) {
        var lv = localStorage.getItem(RESTORE_BASE);
        if (lv) { var lo = JSON.parse(lv); if (lo) { lo._key = RESTORE_BASE; lo._legacy = true; } return lo; }
      }
      return null;
    } catch (e) { return null; }
  }

  /* 復元記録から元へ戻す（who だけ） */
  function undoPast() {
    var rec = restoreInfo(), s = getS();
    if (!rec || !Array.isArray(rec.items)) return { error: 'no-restore-record' };
    var turns = (s && s.turns) || [], n = 0;
    for (var i = 0; i < rec.items.length; i++) {
      var it = rec.items[i], t = turns[it.turn];
      var c = t && t._convSays && t._convSays[it.card];
      if (!c) continue;
      if (String(c.who) !== String(it.to)) continue;   // 別の値に変わっていたら触らない
      c.who = it.from; n++;
    }
    if (n > 0) {
      try { s && s.save && s.save(); } catch (e) {}
      try { if (window.__v292Dfix66 && typeof window.__v292Dfix66.repair === 'function') window.__v292Dfix66.repair(); } catch (e) {}
    }
    return { restored: n, of: rec.items.length };
  }

  /* ★★fix622: selfTest はカウンタを**汚してはいけない**（fix616 と同じ理由）。
     実機で踏んだ: stats() が selfTest() を呼ぶので、読むたびに
     `applied` と `denied` が人工ターンの分だけ増え、実データの観測値に見えていた。 */
  function withoutCounting(fn) {
    var snap = {}; for (var k in stats) snap[k] = (k === 'denied') ? JSON.parse(JSON.stringify(stats[k])) : stats[k];
    try { return fn(); } finally { for (var k2 in snap) stats[k2] = snap[k2]; }
  }

  /* ★生存証明: 人工の1ターンで「直る」「本文は変わらない」「OFFで何もしない」 */
  function selfTest() { return withoutCounting(_selfTest); }
  function _selfTest() {
    var g = gate();
    if (!g) return { ok: false, why: 'fix611-missing' };
    var cast = ['霧 涼太', '真鍋 ひかり'];
    function mk() {
      return { inputType: 'DO', narrative: '「……何か、言ってなかったか」',
        plan: { narrative: ['<say who="霧 涼太">「……何か、言ってなかったか」</say>', '真鍋は封筒の口を開けた。'] },
        _convSays: [{ who: '真鍋 ひかり', say: '「……何か、言ってなかったか」' }] };
    }
    var t = mk(), sayBefore = t._convSays[0].say;
    var n = applyTurn(t, cast, '霧 涼太');
    var d = {
      applied: n, who: t._convSays[0].who, sayUntouched: t._convSays[0].say === sayBefore,
      offStops: (function () {
        var t2 = mk(), saved = off;
        // OFF 相当の確認は localStorage を触らずに関数差し替えでは行えないので、
        // 条件を満たさないターン（直接証拠あり）で「触らない」ことを確かめる
        t2.plan.narrative[1] = '「……何か、言ってなかったか」と真鍋が言った。';
        return applyTurn(t2, cast, '霧 涼太') === 0;
      })()
    };
    var ok = d.applied === 1 && d.who === '霧 涼太' && d.sayUntouched && d.offStops;
    return { ok: ok, detail: d };
  }

  window.__v292Dfix620 = {
    applyTurn: applyTurn,
    repairPast: repairPast,
    restoreInfo: restoreInfo,
    undoPast: undoPast,
    selfTest: selfTest,
    /* ★fix622: `denied` は入れ子のオブジェクトなので**参照でコピーしてはいけない**。
       参照のままだと、この直後に呼ぶ selfTest() の中の書き込みが
       返したオブジェクトにそのまま現れる（カウンタを退避・復元しても意味が無い）。 */
    stats: function () {
      var o = {};
      for (var k in stats) o[k] = (k === 'denied') ? JSON.parse(JSON.stringify(stats[k])) : stats[k];
      o.disabled = off();
      o.selfTestPassed = selfTest().ok;
      return o;
    }
  };
})();
