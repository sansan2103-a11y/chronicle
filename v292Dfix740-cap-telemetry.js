// ============================================================
// Chronicle v292Dfix740 — capability constraint telemetry (Phase1)
// ------------------------------------------------------------
// RULING118-D / RULING118-B2 に基づく observability 専用レイヤ。
//
// ★このファイルは prompt を 1 バイトも変更しない。
//   Planner.build の戻り値 r.sys を読み取るだけで、書き換えない。
//
// 受け入れ条件（RULING118-D acceptance）:
//   - Planner.build sys byte-identical
//   - flag OFF で完全無作用（byte-identical）
//   - telemetry の例外は build に影響しない（fail-open）
//   - network 0
//   - persistent storage 0（localStorage へ書かない。読むのは flag のみ）
//   - prompt content storage 0（sys 本文・narrative 本文を保存しない）
//   - ring buffer は memory only / max 20
//   - console 既定 OFF
//
// kill switch : localStorage['v292Dfix740Off'] = '1'
// verbose     : localStorage['chronDiagVerbose'] = '1'
// 参照        : window.__chronDiag
// ============================================================
(function () {
  'use strict';

  var TAG = '[v292Dfix740]';
  var LS_OFF = 'v292Dfix740Off';
  var LS_VERBOSE = 'chronDiagVerbose';
  var RING_MAX = 20;

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function off() { return lsGet(LS_OFF) === '1'; }
  function verbose() { return lsGet(LS_VERBOSE) === '1'; }

  // ---- ring buffer（memory only。永続化しない） ----
  var ring = [];
  function pushRing(rec) {
    ring.push(rec);
    while (ring.length > RING_MAX) ring.shift();
  }

  window.__chronDiag = {
    version: 'fix740',
    ring: ring,
    last: null,
    // ★ prompt 本文は一切保持しない。長さと分類のみ。
    note: 'observability only / no prompt text retained / memory only'
  };

  // ------------------------------------------------------------
  // keeper registry の観測
  //   ★ en.text() を再実行しない（副作用と二重計上を避けるため）。
  //     inclusion は marker の有無で判定し、サイズは sys 末尾を marker で
  //     区切って計測する。したがって「なぜ落ちたか」を完全には分類できない。
  //     分類できるのは以下のみ:
  //       'off'         … 個別 kill switch が立っている（flag の純粋読み取り）
  //       'superseded'  … __v292SupersededMarkers に載っている（純粋読み取り）
  //       'present'     … marker が sys 内にある
  //       'absent-unclassified' … 上記以外で marker が無い
  //         （budget drop / empty text / dup-marker skip の区別は Phase1 では不能）
  // ------------------------------------------------------------
  function observeKeeper(sys) {
    var reg = window.__f379reg;
    var out = { entries: [], present: 0, absent: 0,
                offCount: 0, supersededCount: 0, absentUnclassified: 0,
                markerSegments: {} };
    if (!reg || !reg.length) { out.registryMissing = true; return out; }

    var sup = window.__v292SupersededMarkers || {};

    // marker の出現位置を集めて末尾を区切る
    var marks = [];
    for (var i = 0; i < reg.length; i++) {
      var en = reg[i] || {};
      var mk = en.marker;
      if (!mk) continue;
      var pos = sys.indexOf(mk);
      if (pos >= 0) marks.push({ idx: i, marker: mk, pos: pos });
    }
    marks.sort(function (a, b) { return a.pos - b.pos; });
    for (var k = 0; k < marks.length; k++) {
      var start = marks[k].pos;
      var end = (k + 1 < marks.length) ? marks[k + 1].pos : sys.length;
      out.markerSegments[marks[k].marker] = end - start;
    }

    for (var j = 0; j < reg.length; j++) {
      var e = reg[j] || {};
      var marker = e.marker || null;
      var prio = (e.prio === 1 || e.prio === 2 || e.prio === 3) ? e.prio : 2;
      var reason = null;

      if (e.off && lsGet(e.off) === '1') { reason = 'off'; out.offCount++; }
      else if (marker && sup[marker]) { reason = 'superseded'; out.supersededCount++; }
      else if (marker && sys.indexOf(marker) >= 0) { reason = 'present'; }
      else if (!marker) { reason = 'no-marker-unobservable'; }
      else { reason = 'absent-unclassified'; out.absentUnclassified++; }

      if (reason === 'present') out.present++; else out.absent++;

      out.entries.push({
        idx: j,
        marker: marker,
        prio: prio,
        reason: reason,
        bytes: (marker && out.markerSegments[marker]) || 0
      });
    }
    return out;
  }

  // ------------------------------------------------------------
  // 能力制約の生成状況を観測
  //   fix414 が自ら公開している test hook __v292Dfix414x.derive(name) を使う。
  //   これは純関数（配列を組み立てて返すだけ）で、build には影響しない。
  //   ★ karada / kizu / kokoro の生テキストは長さと有無のみ記録し、
  //     本文そのものは保存しない（RULING118-B2 の「本文全文をログへ出さない」）。
  // ------------------------------------------------------------
  function observeConstraints() {
    var out = { characters: [], withState: 0, withConstraints: 0,
                constraintZeroWithInjuredState: 0, totalConstraints: 0 };
    var store = window.__v292Dfix77Store;
    if (!store) { out.storeMissing = true; return out; }
    var api = window.__v292Dfix414x;
    var names = Object.keys(store);

    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      var s = store[n] || {};
      var karada = (s.karada == null) ? '' : String(s.karada);
      var kizu = (s.kizu == null) ? '' : String(s.kizu);
      var kokoro = (s.kokoro == null) ? '' : String(s.kokoro);
      var hasBody = !!(karada || kizu);

      var cons = null;
      try { cons = (api && typeof api.derive === 'function') ? api.derive(n) : null; } catch (e) { cons = null; }
      var count = (cons && cons.length) ? cons.length : 0;

      if (hasBody) out.withState++;
      if (count > 0) out.withConstraints++;
      out.totalConstraints += count;

      // ★ RC-5 の直接計測: 身体 state はあるのに制約 0
      var zeroWithState = (hasBody && count === 0);
      if (zeroWithState) out.constraintZeroWithInjuredState++;

      out.characters.push({
        name: n,                              // 名前は識別に必要（本文ではない）
        karadaLen: karada.length,
        kizuLen: kizu.length,
        kokoroLen: kokoro.length,
        hasBodyState: hasBody,
        constraintCount: count,
        constraintRanks: (cons || []).map(function (c) { return c && c.rank; }),
        derivationMiss: zeroWithState        // capability derivation coverage の miss
      });
    }
    return out;
  }

  // ------------------------------------------------------------
  // Planner.build の最外周 wrap（読み取り専用）
  // ------------------------------------------------------------
  function install() {
    if (off()) return false;
    var P = window.Planner;
    if (!P || typeof P.build !== 'function') return false;
    if (P.build.__fix740) return true;

    var inner = P.build;
    var wrapped = function () {
      var r = inner.apply(this, arguments);
      // ★ ここから下は絶対に r を書き換えない。例外は握り潰す（fail-open）。
      try {
        if (off()) return r;
        if (!r || typeof r.sys !== 'string') return r;
        var sys = r.sys;

        var keeper = observeKeeper(sys);
        var caps = observeConstraints();

        var prio1Bytes = 0, keeperBytes = 0;
        for (var i = 0; i < keeper.entries.length; i++) {
          var e = keeper.entries[i];
          if (e.reason !== 'present') continue;
          keeperBytes += e.bytes;
          if (e.prio === 1) prio1Bytes += e.bytes;
        }

        var x = window.__f379x || {};
        var budget = null;
        try { budget = (typeof x.v4on === 'function' && x.v4on()) ? x.BUDGET_V4 : x.BUDGET_LEGACY; } catch (e2) {}

        var rec = {
          finalSysLen: sys.length,
          baseSysLen: sys.length - keeperBytes,      // keeper 追記分を差し引いた推定値
          baseSysLenIsEstimate: true,
          keeperBytes: keeperBytes,
          prio1Bytes: prio1Bytes,
          budget: budget,
          keeperPresent: keeper.present,
          keeperAbsent: keeper.absent,
          offCount: keeper.offCount,
          supersededCount: keeper.supersededCount,
          absentUnclassified: keeper.absentUnclassified,
          constraintBlockBytes: keeper.markerSegments['【制約】'] || 0,
          constraintBlockPresent: !!keeper.markerSegments['【制約】'],
          characters: caps.characters,
          charactersWithBodyState: caps.withState,
          charactersWithConstraints: caps.withConstraints,
          constraintZeroWithInjuredState: caps.constraintZeroWithInjuredState,
          totalConstraints: caps.totalConstraints,
          entries: keeper.entries
        };

        window.__chronDiag.last = rec;
        pushRing(rec);

        if (verbose()) {
          try {
            console.debug(TAG, 'sys=' + rec.finalSysLen,
              'keeper=' + rec.keeperBytes, 'prio1=' + rec.prio1Bytes,
              'constraintBytes=' + rec.constraintBlockBytes,
              'derivationMiss=' + rec.constraintZeroWithInjuredState + '/' + rec.charactersWithBodyState);
          } catch (e3) {}
        }
      } catch (e) {
        // telemetry の失敗は gameplay に影響させない
        try { if (verbose()) console.debug(TAG, 'telemetry error (ignored)', e && e.message); } catch (e4) {}
      }
      return r;
    };
    wrapped.__fix740 = true;
    P.build = wrapped;
    return true;
  }

  // fix379 が ensure() を poll で当てるので、こちらも遅延して最外周を取る
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    try { if (install() || tries > 60) clearInterval(timer); }
    catch (e) { if (tries > 60) clearInterval(timer); }
  }, 500);
  try { install(); } catch (e) {}

  // 手動確認用（prompt には出さない）
  window.__v292Dfix740x = {
    install: install,
    observeKeeper: observeKeeper,
    observeConstraints: observeConstraints,
    ring: ring,
    RING_MAX: RING_MAX
  };
})();
