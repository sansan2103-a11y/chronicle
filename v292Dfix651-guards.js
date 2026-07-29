/* ============================================================================
 * v292Dfix651-guards.js (2026-07-29) — 暴走生成の遮断と、0ターン上書きの非常ブレーキ
 *
 * ■このファイルが担当する2つ（3つ目の B は v292Dfix228-slot-generations.js の中で直す）
 *   A 暴走ストリームガード … 物語本文の生成が「反復ループ／句読点の消えた暴走／異常な長さ」に
 *     なったとき、本文を採用する前に遮断して fix643 の救済経路へ渡す。
 *   C 0ターン上書きの非常ブレーキ + 書込トレース … `chr6` / `chr6_slot_*` へ
 *     「既存 turns>0 → 新 turns===0」を書こうとしたら、正規経路でない限り拒否する。
 *     あわせて、この2種のキーへの全書込みメタを直近30件だけ軽量リングへ残す（本文は残さない）。
 *
 * ■★実装前に実コードで確定させた事実（推測ではない）
 *   Chronicle の生成は **非ストリーミング（一括受信）** である。
 *     ・`index.html` の `Api._callAnthropic` / `_callOpenRouter` / `_callNovelAI` は
 *       いずれも `await fetch(...)` → `await res.json()` で、`getReader()` も
 *       `text/event-stream` も `stream:true` もリポジトリ全体に1件も存在しない。
 *     ・したがって「受信の途中でトークンを捨てる」ことは**この実装では原理的にできない**。
 *   → 裁定の指示どおり、監視は **受信完了後・パース/描画/保存の前** に適応させた。
 *     判定器そのものは本物の逐次監視（1024字から開始 / 直近2048字窓 / +256字ごと /
 *     8-gram 重複被覆率 / 2回連続）として実装し、一括受信のテキストを 256字ずつ
 *     `feed()` へ流し込む。将来 SSE 化しても判定器はそのまま使える。
 *     AbortController は「fetch のタイムアウト上限」として **既に index.html に在る**
 *     （fix268 で 60s→150s。実測に基づく値なのでここでは変更しない）。
 *     このモジュールの monitor も自前の AbortController を持ち、遮断時に abort する。
 *     abort 後に届いた分は `feed()` が **無視**する（late chunk）。
 *
 * ■A のしきい値
 *   累計 1024字までは判定しない（短い応答を即断しない）
 *   直近 2048字の窓 / +256字ごとに検査 / 8-gram 重複被覆率 >= 65% が **2回連続** で遮断
 *   句読点なしで続く最長 320字 以上（fix553 の maxRun と同じ数え方）が **2回連続** で遮断
 *     ★これは裁定の必須テスト「maxRun427相当を中断」のための第3の条件。
 *       被覆率だけでは 427字の無句読点暴走（実測 turn51: marks=1 / maxRun=490）は
 *       2048字窓の 20% にしかならず捕まえられない。正常な地の文の maxRun は
 *       fix553 が「長い」と呼ぶ値でも 80〜110 なので、320 は正常側から十分遠い。
 *   絶対長 12288字 超で遮断（連続回数を待たず即断）
 *     ★根拠: クライアントに実出力長の分布は保存されていない（p99 は測れない）。
 *       上限トークンは max_tokens=1400、長文モードでも 2400（fix212）。日本語は
 *       1トークンあたり 1〜2文字なので、正常応答の上限はおよそ 2400〜4800字。
 *       12288 はその 2.5〜5 倍で、**正常な応答では絶対に届かない**一方、
 *       上限が効かずに走り続けた応答だけを捕まえられる。
 *       実分布は下の軽量カウンタ（v292Dfix651Stats）で後から集計してから詰める。
 *
 * ■A のモード
 *   既定 = shadow（判定と記録だけ。**中断しない**）
 *   実弾 = fix643 が live と判断した物語だけ（v292Dfix643Live='1' かつ
 *          v292Dfix650LiveSlots にその物語が入っている＝fix650 の canary 条件）
 *   遮断したときは view を hard に差し替えて fix643 へ返すので、
 *   そのまま fix643 の救済（最大1回）→ fix650 の judgeRescue / ring へ乗る。
 *   救済の応答も同じ監視を通す。2回目も遮断ならターン不成立（二重hard契約）。
 *
 * OFF: v292Dfix651StreamGuardOff='1' (A) / v292Dfix651ZeroTurnGuardOff='1' (C)
 *      （B は v292Dfix651SlotBackupGuardOff='1' で旧 fix228 挙動へ戻る）
 * 冪等: window.__v292Dfix651
 * 読出: __v292Dfix651.trace() / .traceStats() / .streamGuard.stats() / .selfTest()
 * ========================================================================== */
(function v292Dfix651(){
  'use strict';
  if (window.__v292Dfix651 && window.__v292Dfix651.__armed) return;
  var TAG = '[v292Dfix651]';

  /* localStorage は「いまの鎖」をそのまま使う（fix246 の redirect 等を無効化しない）。
     ただし自分の書込で自分のラッパを再入しないよう、下流の関数を掴んでおく。 */
  var lsGet = null, lsDown = null;
  try { lsGet = localStorage.getItem.bind(localStorage); } catch(e){}
  function lsg(k){ try { return lsGet ? lsGet(k) : localStorage.getItem(k); } catch(e){ return null; } }
  function lssRaw(k, v){
    try { (lsDown || localStorage.setItem).call(localStorage, k, v); return true; } catch(e){ return false; }
  }
  function isOn(k){ return lsg(k) === '1'; }
  function now(){ try { return Date.now(); } catch(e){ return 0; } }

  var errors = 0;

  /* =====================================================================
     A. 暴走ストリームガード
     ===================================================================== */
  var A_OFF   = 'v292Dfix651StreamGuardOff';
  var A_STATS = 'v292Dfix651Stats';
  var A_LOG   = 'v292Dfix651StreamLog';
  var A_MAXLOG = 20;

  var CFG = {
    startAt: 1024,   /* 累計これだけ受け取るまで判定を始めない */
    window:  2048,   /* 直近この文字数だけを見る */
    step:    256,    /* この文字数ごとに検査する */
    n:       8,      /* n-gram の n */
    cover:   0.65,   /* 8-gram 重複被覆率のしきい値 */
    maxRun:  320,    /* 句読点なしで続く最長文字数のしきい値 */
    consecutive: 2,  /* ★1回では止めない。連続でこの回数に達したら遮断 */
    maxLen:  12288   /* 絶対長上限（連続回数を待たない） */
  };

  /* 窓の中で「前に出た 8-gram と同じ」位置の割合。fix627(fix624.longRepeat) と同じ数え方。 */
  function coverage(s, n){
    var t = String(s == null ? '' : s).replace(/[\s　]/g, '');
    var total = t.length - n + 1;
    if (total <= 0) return 0;
    var seen = Object.create(null), dup = 0;
    for (var i = 0; i < total; i++){
      var g = t.substr(i, n);
      if (seen[g]) dup++; else seen[g] = 1;
    }
    return dup / total;
  }
  /* 句読点なしで続く最長文字数。★fix553 の metrics().maxRun と同じ数え方
     （タグを落とす → 改行で切る → 、。！？!?… で切る → 最長の断片の長さ）。 */
  function maxRunOf(s){
    var t = String(s == null ? '' : s).replace(/<[^>]*>/g, '');
    var max = 0;
    var lines = t.split('\n');
    for (var i = 0; i < lines.length; i++){
      var parts = lines[i].split(/[、。！？!?…]/);
      for (var j = 0; j < parts.length; j++){
        var n = parts[j].trim().length;
        if (n > max) max = n;
      }
    }
    return max;
  }

  /* ---- 逐次監視器（本物のストリーム用の形。一括受信でも同じ判定になる） ---- */
  function createMonitor(opts){
    opts = opts || {};
    var cfg = {};
    for (var k in CFG){ if (Object.prototype.hasOwnProperty.call(CFG, k)) cfg[k] = (opts[k] == null ? CFG[k] : opts[k]); }
    var ctrl = null;
    try { if (typeof AbortController === 'function') ctrl = new AbortController(); } catch(e){}

    var m = {
      cfg: cfg, buf: '', len: 0, checks: 0, trips: 0, streak: 0,
      checkedAt: -1, nextAt: cfg.startAt,
      lastCoverage: 0, lastMaxRun: 0,
      verdict: null, aborted: false, lateChunks: 0, lateChars: 0,
      controller: ctrl, signal: ctrl ? ctrl.signal : null
    };

    function trip(reason, why){
      m.verdict = { reason: reason, why: why, at: now(), len: m.len,
                    coverage: m.lastCoverage, maxRun: m.lastMaxRun, checks: m.checks };
      m.abort();
      return m.verdict;
    }
    function check(){
      m.checks++; m.checkedAt = m.len;
      var win = m.buf.slice(-cfg.window);
      m.lastCoverage = coverage(win, cfg.n);
      m.lastMaxRun = maxRunOf(win);
      var why = (m.lastCoverage >= cfg.cover) ? 'coverage'
              : (m.lastMaxRun >= cfg.maxRun)  ? 'maxRun' : null;
      if (!why){ m.streak = 0; return null; }
      m.streak++; m.trips++;
      if (m.streak < cfg.consecutive) return null;   /* ★1回では止めない */
      return trip('stream-degenerate', why);
    }

    m.abort = function(){
      if (m.aborted) return false;
      m.aborted = true;
      try { if (ctrl && typeof ctrl.abort === 'function') ctrl.abort(); } catch(e){}
      return true;
    };
    m.feed = function(chunk){
      var s = String(chunk == null ? '' : chunk);
      /* ★遮断後に届いた分は無視する（abort 済みの遅延チャンク） */
      if (m.verdict){ if (s){ m.lateChunks++; m.lateChars += s.length; } return m.verdict; }
      if (!s) return null;
      m.len += s.length;
      m.buf += s;
      if (m.buf.length > cfg.window * 2) m.buf = m.buf.slice(-cfg.window * 2);
      if (m.len > cfg.maxLen) return trip('stream-overlength', 'maxLen');
      if (m.len < cfg.startAt) return null;
      if (m.len < m.nextAt) return null;
      m.nextAt = m.len + cfg.step;
      return check();
    };
    m.end = function(){
      if (m.verdict) return m.verdict;
      if (m.len > cfg.maxLen) return trip('stream-overlength', 'maxLen');
      if (m.len >= cfg.startAt && m.len > m.checkedAt) return check();
      return null;
    };
    return m;
  }

  /* 一括受信したテキストを、ストリームと同じ粒度で監視器へ流す */
  function inspect(text, opts){
    var m = createMonitor(opts);
    var s = String(text == null ? '' : text);
    var step = m.cfg.step;
    for (var i = 0; i < s.length; i += step){
      if (m.feed(s.substr(i, step))) return m;
    }
    m.end();
    return m;
  }

  /* ---- 軽量カウンタ（Worker 側チューニングの材料。本文は1文字も残さない） ---- */
  function readStats(){
    try { var o = JSON.parse(lsg(A_STATS) || '{}'); return (o && typeof o === 'object') ? o : {}; }
    catch(e){ return {}; }
  }
  function writeStats(o){ return lssRaw(A_STATS, JSON.stringify(o)); }
  function lenBucket(n){
    if (n < 1024) return '0-1k';
    if (n < 2048) return '1-2k';
    if (n < 4096) return '2-4k';
    if (n < 8192) return '4-8k';
    if (n < 12288) return '8-12k';
    return '12k+';
  }
  function bump(o, k, sub){
    o[k] = o[k] || {};
    o[k][sub] = (o[k][sub] || 0) + 1;
  }
  function countSample(text, meta, m){
    try {
      var st = readStats();
      var L = String(text == null ? '' : text).length;
      st.v = 1;
      st.n = (st.n || 0) + 1;
      st.sumLen = (st.sumLen || 0) + L;
      if (L > (st.maxLen || 0)) st.maxLen = L;
      bump(st, 'len', lenBucket(L));
      bump(st, 'finish', meta.finishReason == null ? 'unknown' : String(meta.finishReason).slice(0, 24));
      bump(st, 'mode', meta.live ? 'live' : 'shadow');
      bump(st, 'phase', meta.phase === 'rescue' ? 'rescue' : 'first');
      if (m && m.verdict){
        bump(st, 'trip', m.verdict.reason);
        bump(st, 'why', m.verdict.why || '?');
      } else {
        bump(st, 'trip', 'none');
      }
      st.at = new Date().toISOString();
      writeStats(st);
    } catch(e){ errors++; }
  }
  function readStreamLog(){
    try { var a = JSON.parse(lsg(A_LOG) || '[]'); return Array.isArray(a) ? a : []; }
    catch(e){ return []; }
  }
  function logStream(m, meta, outcome){
    try {
      var a = readStreamLog();
      a.push({ at: new Date().toISOString(), reason: m.verdict.reason, why: m.verdict.why,
               len: m.verdict.len, cov: Math.round(m.verdict.coverage * 1000) / 1000,
               maxRun: m.verdict.maxRun, checks: m.verdict.checks,
               phase: meta.phase || 'first', slotId: meta.slotId == null ? null : String(meta.slotId),
               mode: meta.live ? 'live' : 'shadow', outcome: outcome });
      lssRaw(A_LOG, JSON.stringify(a.slice(-A_MAXLOG)));
    } catch(e){ errors++; }
  }

  var aStats = { inspected: 0, tripped: 0, blocked: 0, observed: 0 };

  /* fix643 が判定 view を作った直後に呼ぶ。
     ・shadow … 記録だけして view をそのまま返す（挙動は1ビットも変わらない）
     ・live   … 遮断理由つきの hard な view に差し替える → fix643 の救済へ直結 */
  function applyToView(view, raw, meta){
    meta = meta || {};
    if (isOn(A_OFF)) return view;
    var text = String(raw == null ? '' : raw);
    var m;
    try { m = inspect(text); } catch(e){ errors++; return view; }
    aStats.inspected++;
    countSample(text, meta, m);
    if (!m.verdict) return view;
    aStats.tripped++;
    if (!meta.live){ aStats.observed++; logStream(m, meta, 'observed'); return view; }
    aStats.blocked++;
    logStream(m, meta, 'blocked');
    var codes = (view && view.codes) ? view.codes.slice() : [];
    if (codes.indexOf(m.verdict.reason) < 0) codes.push(m.verdict.reason);
    return {
      measurable: true,
      /* ★fix650 が居なくても fix643 の既定判断（hard なら stop）で止まるよう 7点以上にする */
      score: Math.max((view && typeof view.score === 'number') ? view.score : 0, 10),
      level: 'hard', hard: true,
      hits: (view && view.hits) ? view.hits.slice() : [],
      codes: codes,
      cards:   (view && view.cards   != null) ? view.cards   : null,
      cardAvg: (view && view.cardAvg != null) ? view.cardAvg : null,
      guard: m.verdict.reason,
      guardWhy: m.verdict.why,
      guardLen: m.verdict.len,
      guardAborted: m.aborted
    };
  }

  var streamGuard = {
    CFG: CFG,
    isOff: function(){ return isOn(A_OFF); },
    coverage: coverage, maxRun: maxRunOf,
    monitor: createMonitor, inspect: inspect,
    applyToView: applyToView,
    counters: readStats,
    log: readStreamLog,
    clearLog: function(){ try { localStorage.removeItem(A_LOG); } catch(e){} return true; },
    clearCounters: function(){ try { localStorage.removeItem(A_STATS); } catch(e){} return true; },
    stats: function(){ try { return JSON.parse(JSON.stringify(aStats)); } catch(e){ return null; } }
  };

  /* =====================================================================
     C. 0ターン上書きの非常ブレーキ + 書込トレース
     ===================================================================== */
  var C_OFF   = 'v292Dfix651ZeroTurnGuardOff';
  var C_TRACE = 'v292Dfix651Trace';
  var C_MAXTRACE = 30;

  function isSlotKey(k){
    return k === 'chr6' || k.indexOf('chr6_slot_') === 0;
  }
  function slotIdOfKey(k){ return (k === 'chr6') ? 'default' : k.slice('chr6_slot_'.length); }
  /* ターン数。物語オブジェクトとして読めないものは -1（＝判定しない）。 */
  function turnsOf(raw){
    if (raw == null) return -1;
    try {
      var d = JSON.parse(String(raw));
      if (!d || typeof d !== 'object') return -1;
      return Array.isArray(d.turns) ? d.turns.length : -1;
    } catch(e){ return -1; }
  }
  function bytesOf(raw){ try { return raw == null ? 0 : String(raw).length; } catch(e){ return -1; } }

  /* 書いた側をスタックから推定する。★1つのラベルへ倒さない（分からなければ unknown）。 */
  function stackOf(){
    try { throw new Error('s'); } catch(e){ return String(e && e.stack || ''); }
  }
  function writerOf(stk){
    var s = String(stk || '');
    var lines = s.split('\n');
    for (var i = 0; i < lines.length; i++){
      var L = lines[i];
      if (L.indexOf('v292Dfix651') >= 0) continue;      /* 自分の枠は飛ばす */
      var m = L.match(/v292Dfix(\d+)[A-Za-z0-9_]*[-.]/);
      if (m) return 'fix' + m[1];
      if (/features\.js/.test(L)) return 'features';
      if (/home\.html/.test(L)) return 'home';
      if (/index\.html/.test(L)) return 'index';
    }
    return 'unknown';
  }
  /* 正規経路とみなすファイル（新規作成・削除・復元の正本）。それ以外は推測しない。 */
  var LEGIT_FILES = [
    'v292Dfix587-story-lifecycle',   /* 物語の作成・削除（墓標）の正本 */
    'v292Dfix562-backup-inventory',  /* 控えからの復元 */
    'v292Dfix564-snapshot'           /* スナップショットからの復元 */
  ];
  function legitByStack(stk){
    var s = String(stk || '');
    for (var i = 0; i < LEGIT_FILES.length; i++){
      if (s.indexOf(LEGIT_FILES[i]) >= 0) return LEGIT_FILES[i];
    }
    return null;
  }
  /* ?new=1&story=<id> で開かれた新しい物語の、その物語自身への初期化 */
  function legitByNewUrl(key){
    try {
      var q = String(location.search || '');
      if (!/[?&]new=1(&|$)/.test(q)) return null;
      var m = q.match(/[?&]story=([^&#]+)/);
      if (!m) return null;
      var id = decodeURIComponent(m[1]);
      return (slotIdOfKey(key) === id) ? 'new-story-url' : null;
    } catch(e){ return null; }
  }

  /* ---- 正規経路のためのバイパスAPI ---- */
  var bypassDepth = 0, bypassReason = null, bypassOnce = null;
  function allow(reason, fn){
    bypassDepth++;
    var keep = bypassReason;
    bypassReason = String(reason || 'allow');
    try { return (typeof fn === 'function') ? fn() : undefined; }
    finally { bypassDepth--; bypassReason = keep; }
  }
  function allowOnce(reason, ms){
    var life = (typeof ms === 'number' && ms > 0) ? ms : 3000;
    bypassOnce = { reason: String(reason || 'allowOnce'), until: now() + life };
    return true;
  }
  /* ★allowOnce は「使い切り」。実際に1件の遮断対象を通した時点で消費する
     （立てっぱなしのバイパスが後続の書込まで通してしまう事故を防ぐ）。 */
  function bypassActive(){
    if (bypassDepth > 0) return bypassReason || 'allow';
    if (bypassOnce){
      if (now() <= bypassOnce.until){ var r = bypassOnce.reason; bypassOnce = null; return r; }
      bypassOnce = null;
    }
    return null;
  }

  var cStats = { writes: 0, blocked: 0, allowed: 0, zeroOverWrite: 0, traceWrites: 0, installed: false, installCount: 0 };

  function readTrace(){
    try { var a = JSON.parse(lsg(C_TRACE) || '[]'); return Array.isArray(a) ? a : []; }
    catch(e){ return []; }
  }
  function pushTrace(rec){
    try {
      var a = readTrace();
      a.push(rec);
      if (!lssRaw(C_TRACE, JSON.stringify(a.slice(-C_MAXTRACE)))){
        /* 容量不足などで書けなければリングを諦める（本体の書込は絶対に妨げない） */
        try { localStorage.removeItem(C_TRACE); } catch(e){}
        return false;
      }
      cStats.traceWrites++;
      return true;
    } catch(e){ errors++; return false; }
  }

  /* 1回分の書込の診断。★本文は保存しない（バイト数とターン数だけ）。 */
  function analyze(key, value){
    var stk = stackOf();
    var oldRaw = lsg(key);
    var oldT = turnsOf(oldRaw), newT = turnsOf(value);
    var rec = {
      at: new Date().toISOString(), key: key,
      oldBytes: bytesOf(oldRaw), newBytes: bytesOf(value),
      oldTurns: oldT, newTurns: newT,
      writer: writerOf(stk), reason: 'write', blocked: false
    };
    if (!(oldT > 0 && newT === 0)) return rec;
    rec.reason = 'zero-turn-overwrite';
    cStats.zeroOverWrite++;
    var by = bypassActive();
    if (by){ rec.reason = 'zero-turn-allowed:' + by; cStats.allowed++; return rec; }
    var lf = legitByStack(stk);
    if (lf){ rec.reason = 'zero-turn-allowed:' + lf; cStats.allowed++; return rec; }
    var nu = legitByNewUrl(key);
    if (nu){ rec.reason = 'zero-turn-allowed:' + nu; cStats.allowed++; return rec; }
    if (isOn(C_OFF)){ rec.reason = 'zero-turn-overwrite(guard-off)'; return rec; }
    rec.blocked = true;
    cStats.blocked++;
    return rec;
  }

  var inGuard = false;
  function install(){
    if (cStats.installed) return true;
    var prev;
    try { prev = localStorage.setItem; } catch(e){ return false; }
    if (typeof prev !== 'function') return false;
    if (prev.__f651) { cStats.installed = true; return true; }
    lsDown = prev;
    var wrapped = function(k, v){
      var key;
      try { key = String(k); } catch(e){ return prev.apply(localStorage, arguments); }
      if (inGuard || !isSlotKey(key)) return prev.apply(localStorage, arguments);
      var rec = null;
      inGuard = true;
      try { rec = analyze(key, v); } catch(e){ errors++; rec = null; }
      finally { inGuard = false; }
      if (rec){
        cStats.writes++;
        inGuard = true;
        try { pushTrace(rec); } catch(e){ errors++; }
        finally { inGuard = false; }
        if (rec.blocked){
          try { console.error(TAG, '★0ターンの上書きを止めました:', key,
                              JSON.stringify({ oldTurns: rec.oldTurns, newTurns: rec.newTurns, writer: rec.writer })); } catch(e){}
          return;                       /* ★書かない。消しも上書きもしない */
        }
      }
      return prev.apply(localStorage, arguments);
    };
    /* ★fix419c の教訓: 内側関数の own props を全継承（他fixの印を消さない） */
    try {
      for (var p in prev){
        if (Object.prototype.hasOwnProperty.call(prev, p)){ try { wrapped[p] = prev[p]; } catch(e){} }
      }
    } catch(e){}
    wrapped.__f651 = true;
    try { localStorage.setItem = wrapped; } catch(e){ return false; }
    cStats.installed = true; cStats.installCount++;
    return true;
  }

  /* =====================================================================
     読み出し・自己診断
     ===================================================================== */
  function traceStats(){
    var a = readTrace(), zero = 0, blocked = 0, byWriter = {};
    for (var i = 0; i < a.length; i++){
      var r = a[i]; if (!r) continue;
      if (r.oldTurns > 0 && r.newTurns === 0) zero++;
      if (r.blocked) blocked++;
      byWriter[r.writer || 'unknown'] = (byWriter[r.writer || 'unknown'] || 0) + 1;
    }
    return { entries: a.length, zeroTurnOverwrites: zero, blockedInRing: blocked,
             byWriter: byWriter, counters: JSON.parse(JSON.stringify(cStats)) };
  }

  /* 見本づくり: 繰り返しの無い擬似文（LCG。同じ 8-gram が出ないようにする） */
  function variedText(n, punct){
    var kana = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん';
    var s = '', seed = 12345, i = 0;
    while (s.length < n){
      var seg = '';
      for (var j = 0; j < 12; j++){
        seed = (seed * 1103515245 + 12345) % 2147483648;
        seg += kana.charAt(seed % kana.length);
      }
      s += seg;
      i++;
      if (punct){ s += '、'; if (i % 4 === 0) s += '。\n'; }
    }
    return s.slice(0, n);
  }

  function selfTest(){
    var d = { ok: false, streaming: 'non-streaming(bulk await) — 実コードで確認' };
    try {
      var rep = new Array(400).join('Court様、すみません。');           /* 反復ループ */
      var norm = variedText(4000, true);                                /* 正常な長文 */
      var runaway = variedText(1600, false);                            /* 句読点の消えた暴走 */
      var huge = variedText(13000, true);                               /* 異常に長いだけの応答 */

      d.repTripped = inspect(rep).verdict != null;
      d.repEarly = (inspect(rep).verdict || {}).len < rep.length;       /* ★受け切る前に判定が出る */
      d.normalPassed = inspect(norm).verdict == null;
      d.shortNotJudged = inspect(rep.slice(0, 900)).verdict == null;
      d.overlength = (inspect(huge).verdict || {}).reason === 'stream-overlength';
      d.runawayTripped = (inspect(runaway).verdict || {}).why === 'maxRun';
      d.installed = cStats.installed;
      d.ok = !!(d.repTripped && d.repEarly && d.normalPassed && d.shortNotJudged &&
                d.overlength && d.runawayTripped && d.installed);
    } catch(e){ d.threw = String(e && e.message || e); }
    return d;
  }

  window.__v292Dfix651 = {
    __armed: true,
    streamGuard: streamGuard,
    /* C: 正規経路のためのバイパス */
    allow: allow, allowOnce: allowOnce,
    /* C: 読み出し */
    trace: readTrace, traceStats: traceStats,
    clearTrace: function(){ try { localStorage.removeItem(C_TRACE); } catch(e){} return true; },
    isZeroTurnGuardOff: function(){ return isOn(C_OFF); },
    isStreamGuardOff: function(){ return isOn(A_OFF); },
    isSlotBackupGuardOff: function(){ return isOn('v292Dfix651SlotBackupGuardOff'); },
    stats: function(){
      try { return { stream: streamGuard.stats(), write: JSON.parse(JSON.stringify(cStats)), errors: errors }; }
      catch(e){ return null; }
    },
    selfTest: selfTest,
    _install: install, _analyze: analyze, _writerOf: writerOf, _turnsOf: turnsOf
  };

  install();
  try { console.log(TAG, 'armed (stream guard=' + (isOn(A_OFF) ? 'off' : 'shadow既定') +
                        ' / zero-turn brake=' + (isOn(C_OFF) ? 'off' : 'on') + ')'); } catch(e){}
})();
