/* v292Dfix641-cast-auto-register.js (2026-07-29)
 * ─ 証拠が揃った人物だけを `S.cast.npcs` へ自動登録する ─
 *
 * ■前提
 *   fix640 が per-slot の証拠台帳（`v292Dfix640Evid_slot_<slotId>`）を持っている。
 *   本fixは **その台帳しか見ない**。fix277 の準登録カルテ（過去汚染の前歴あり）は読まない。
 *   fix636 は turn-local presence（そのターンに居るか）。本fixは persistent registration（台帳に載せるか）。
 *   ★この2つは別物。混ぜない。
 *
 * ■昇格条件（GPT裁定。緩めない）
 *   distinctSeenTurns >= 2  かつ  **強い証拠が2系統以上**
 *     強: say_who / state_tag / introduction / appearance_stable
 *     弱: prose_name / react / recall / role_word
 *   ・弱い証拠が3回でも昇格しない（系統数で数える。回数では上がらない）
 *   ・役割語（「宿の主人」「少女」…）は、正式名へ**一意に**解決できるまで昇格しない
 *   ・**主人公(hero)は自動昇格の対象外**。`cast.hero.name` へは1文字も書かない
 *   ・既存キャストとの重複を避ける（完全一致＋既存の正規化関数）。**類似統合はしない**
 *
 * ■なぜ appeared:true を付けるのか
 *   features.js fix95 は `appeared !== true` のNPCを sys から**外す**。
 *   証拠上そのターンに居た人物を登録直後に休眠させると
 *   「登録したのにモデルへ渡らない」（fix636 が直したのと同じ穴）に自分で落ちる。
 *
 * ■書き込み方法
 *   `window.__chronicleGetState('fix641')`（fix539の正式API）で S を取り、
 *   `S.cast.npcs.push(...)` の後に `S.save()` を呼ぶ。**window.S は新設しない**
 *   （features.js §8/§9/§10・fix50 など休眠コード約40箇所を起こすため禁止）。
 *
 * 冪等: window.__v292Dfix641
 * OFF : localStorage v292Dfix641Off='1'（★新規昇格を止める。既に入ったものは消さない）
 * 読出: window.__v292Dfix641.dryRun()      … 何が昇格するかを見るだけ（書かない）
 *       window.__v292Dfix641.evaluate()    … 実際に昇格させる（自動でも走る）
 *       window.__v292Dfix641.promotions()  … 昇格の由来（どの証拠で上がったか）
 *       window.__v292Dfix641.why('名前')   … その1件の由来
 *       window.__v292Dfix641.undo('名前')  … 取り消し（fix641 が入れたものだけ）
 *       window.__v292Dfix641.undoAll() / .unblock('名前') / .selfTest()
 */
(function v292Dfix641(){
  'use strict';
  if (window.__v292Dfix641 && window.__v292Dfix641.__armed) return;
  var TAG = '[v292Dfix641:cast-auto-register]';

  var MIN_TURNS = 2;        /* distinctSeenTurns の下限 */
  var MIN_STRONG_KINDS = 2; /* 強い証拠の**系統数**の下限 */
  var MAX_PER_RUN = 3;      /* 1回の評価で足す上限（暴走時の被害を限る） */

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix641Off') === '1'; }
  function live(){ return lsg('v292Dfix641Live') === '1'; }  // ★既定はdryRun相当。実書込はLive='1'端末のみ(プレビューOFF既定の規約)

  function note539(reason, err){
    try { if (window.__chronicleState && typeof window.__chronicleState.note === 'function')
            window.__chronicleState.note('fix641', reason, err); } catch(e){}
  }
  function getState(){
    var g = null;
    try { g = window.__chronicleGetState; } catch(e){}
    if (typeof g === 'function'){
      try { var a = g('fix641'); if (a) return a; } catch(e){ note539('getter-threw', e); }
    } else { note539('getter-missing'); }
    try { if (window.S){ note539('rescued-by-window'); return window.S; } } catch(e){}
    try { var u = (0,eval)('typeof S!=="undefined"?S:null');
          if (u){ note539('rescued-by-eval'); return u; }
          note539('legacy-eval-null'); }
    catch(e){ note539('legacy-eval-threw', e); }
    return null;
  }

  function led(){ try { return window.__v292Dfix640 || null; } catch(e){ return null; } }
  function norm(x){
    var f = led();
    if (f && typeof f.normName === 'function'){ try { return f.normName(x); } catch(e){} }
    return String(x == null ? '' : x).trim();
  }

  /* ---- 既存キャストとの照合 ----
     完全一致＋**既にある**正規化関数（fix197 canonName / fix445 castMatch）だけを使う。
     ★類似統合はしない（おしんの明示方針）。自前で「似ている」判定を作らない。 */
  function canon(n){
    try {
      var f = window.__v292Dfix197 || window.__v292Dfix199;
      if (f && typeof f.canonName === 'function') return String(f.canonName(n) || n);
    } catch(e){}
    return String(n == null ? '' : n);
  }
  function castNames(st){
    var out = [];
    try {
      if (st && st.cast){
        if (st.cast.hero && st.cast.hero.name) out.push(norm(st.cast.hero.name));
        var ns = st.cast.npcs;
        if (Array.isArray(ns)) for (var i = 0; i < ns.length; i++){ if (ns[i] && ns[i].name) out.push(norm(ns[i].name)); }
      }
    } catch(e){}
    return out.filter(Boolean);
  }
  function alreadyInCast(name, names){
    var n = norm(name);
    for (var i = 0; i < names.length; i++){
      if (names[i] === n) return true;                 /* 完全一致 */
      if (canon(names[i]) && canon(names[i]) === canon(n)) return true;   /* 既存の正規化関数 */
    }
    /* fix445 の castMatch があればそれも通す（表示側と同じ照合を使う） */
    try {
      var f445 = window.__v292Dfix445;
      if (f445 && typeof f445.castMatch === 'function'){
        var m = f445.castMatch(n, names);
        if (m) return true;
      }
    } catch(e){}
    return false;
  }

  var stats = { runs: 0, promoted: 0, skipped: {}, errors: 0, lastNames: [] };
  function bump(reason){ stats.skipped[reason] = (stats.skipped[reason] || 0) + 1; }

  /* ---- 判定（★ここが唯一の昇格ロジック） ---- */
  function decide(entry, ctx){
    var d = { name: '', from: (entry && entry.name) || '', ok: false, reason: '', strong: [], turns: 0 };
    if (!entry) { d.reason = 'no-entry'; return d; }
    var f = led();
    d.turns = entry.distinctSeenTurns || 0;
    d.strong = (f && typeof f.strongKindsOf === 'function') ? f.strongKindsOf(entry) : [];

    /* 主人公は自動昇格の対象外（hero 欄は人の操作のみ・推測で埋めない） */
    if (ctx.hero && norm(entry.name) === ctx.hero){ d.reason = 'hero'; return d; }
    if (ctx.blocked.indexOf(norm(entry.name)) >= 0){ d.reason = 'blocked'; return d; }

    /* 役割語は正式名へ一意解決できるまで昇格しない */
    var target = entry.roleWord ? norm(entry.resolvedTo) : norm(entry.name);
    if (entry.roleWord && !target){ d.reason = 'role-word-unresolved'; return d; }
    if (!target){ d.reason = 'no-name'; return d; }
    if (ctx.hero && target === ctx.hero){ d.reason = 'hero'; return d; }
    if (ctx.blocked.indexOf(target) >= 0){ d.reason = 'blocked'; return d; }
    d.name = target;

    if (d.turns < MIN_TURNS){ d.reason = 'few-turns'; return d; }
    /* ★弱い証拠が何回あっても、ここは通れない */
    if (d.strong.length < MIN_STRONG_KINDS){ d.reason = 'weak-evidence'; return d; }
    if (alreadyInCast(target, ctx.names)){ d.reason = 'already'; return d; }

    d.ok = true; d.reason = 'promote';
    return d;
  }

  function buildCtx(st, L){
    return {
      hero: norm(st && st.cast && st.cast.hero && st.cast.hero.name),
      names: castNames(st),
      blocked: (L && Array.isArray(L.blocked)) ? L.blocked.slice() : []
    };
  }

  /* ---- 評価（dryRun なら1バイトも書かない） ---- */
  function evaluate(opts){
    opts = opts || {};
    /* ★既定は観測のみ。実書込は v292Dfix641Live='1' の端末だけ（プレビューOFF既定の規約・fix633と同型）。 */
    if (!opts.dryRun && !live()) opts = Object.assign({}, opts, { dryRun: true, autoDowngraded: true });
    var res = { ok: false, dryRun: !!opts.dryRun, autoDowngraded: !!opts.autoDowngraded, promoted: [], considered: [], reason: '' };
    if (off() && !opts.force){ res.reason = 'off'; return res; }
    var f = led();
    if (!f){ res.reason = 'no-ledger'; return res; }
    var st = getState();
    if (!st || !st.cast){ res.reason = 'no-state'; return res; }

    /* 台帳を最新にしてから読む（fix640 のフックの前後関係に依存しない）。
       ★dryRun のときは台帳も保存させない（harvestPending の dryRun は戻り値で台帳を返す）。 */
    var L = null;
    try {
      var hp = f.harvestPending(opts.dryRun ? { dryRun: true } : {});
      if (opts.dryRun && hp && hp.ledger) L = hp.ledger;
    } catch(e){ stats.errors++; }
    try { if (!L) L = f.load(); } catch(e){ stats.errors++; res.reason = 'ledger-read-failed'; return res; }
    if (!L || !L.entries){ res.reason = 'empty-ledger'; return res; }

    var ctx = buildCtx(st, L);
    var keys = Object.keys(L.entries), added = 0, changed = false;
    stats.runs++;
    for (var i = 0; i < keys.length; i++){
      var e = L.entries[keys[i]];
      var d = decide(e, ctx);
      res.considered.push({ name: d.name || keys[i], from: keys[i], reason: d.reason,
                            turns: d.turns, strong: d.strong });
      if (!d.ok){ bump(d.reason); continue; }
      if (added >= MAX_PER_RUN){ bump('rate-limited'); continue; }
      if (opts.dryRun){ res.promoted.push(d.name); added++; continue; }
      try {
        if (!Array.isArray(st.cast.npcs)) st.cast.npcs = [];
        st.cast.npcs.push({ name: d.name, desc: '', appeared: true,
                            autoBy: 'fix641', autoAt: Date.now() });
        L.promotions.push({ name: d.name, from: d.from, turn: e.lastTurn,
                            kinds: d.strong.slice(), turns: d.turns,
                            spans: (e.sourceSpans || []).slice(0, 3), ts: Date.now(), undone: false });
        ctx.names.push(d.name);
        res.promoted.push(d.name);
        added++; changed = true;
      } catch(err){ stats.errors++; }
    }
    if (changed){
      stats.promoted += res.promoted.length;
      stats.lastNames = res.promoted.slice(0, 10);
      try { f.save(L); } catch(e){ stats.errors++; }
      try { if (typeof st.save === 'function') st.save(); } catch(e){ stats.errors++; }
      try { console.warn(TAG, '証拠が揃ったのでキャストへ登録しました:', res.promoted.join('、'),
                         '（取り消し: window.__v292Dfix641.undo("名前")）'); } catch(e){}
    }
    res.ok = true;
    return res;
  }
  function dryRun(){ return evaluate({ dryRun: true, force: true }); }

  /* ---- 取り消し（★fix641 が入れたものしか消さない） ---- */
  function undo(name){
    var out = { removed: false, reason: '' };
    var n = norm(name);
    var f = led(), st = getState();
    if (!n){ out.reason = 'no-name'; return out; }
    if (!st || !st.cast || !Array.isArray(st.cast.npcs)){ out.reason = 'no-state'; return out; }
    var idx = -1;
    for (var i = 0; i < st.cast.npcs.length; i++){
      var x = st.cast.npcs[i];
      if (x && norm(x.name) === n && x.autoBy === 'fix641'){ idx = i; break; }
    }
    if (idx < 0){ out.reason = 'not-auto-registered'; return out; }   /* 人が登録したものは触らない */
    st.cast.npcs.splice(idx, 1);
    try { if (typeof st.save === 'function') st.save(); } catch(e){ stats.errors++; }
    if (f){
      try {
        var L = f.load();
        if (L.blocked.indexOf(n) < 0) L.blocked.push(n);      /* 再昇格しない */
        for (var j = 0; j < L.promotions.length; j++){
          if (norm(L.promotions[j].name) === n) L.promotions[j].undone = true;
        }
        f.save(L);
      } catch(e){ stats.errors++; }
    }
    out.removed = true;
    try { console.warn(TAG, '取り消しました:', n, '（再昇格は止めます。許すなら unblock("' + n + '")）'); } catch(e){}
    return out;
  }
  function undoAll(){
    var st = getState(), names = [];
    if (st && st.cast && Array.isArray(st.cast.npcs)){
      for (var i = 0; i < st.cast.npcs.length; i++){
        var x = st.cast.npcs[i];
        if (x && x.autoBy === 'fix641' && x.name) names.push(norm(x.name));
      }
    }
    var done = [];
    for (var j = 0; j < names.length; j++){ if (undo(names[j]).removed) done.push(names[j]); }
    return { removed: done };
  }
  function unblock(name){
    var f = led(), n = norm(name);
    if (!f) return { ok: false, reason: 'no-ledger' };
    try {
      var L = f.load();
      var k = L.blocked.indexOf(n);
      if (k >= 0) L.blocked.splice(k, 1);
      f.save(L);
      return { ok: true, blocked: L.blocked.slice() };
    } catch(e){ return { ok: false, reason: 'failed' }; }
  }

  /* ---- 由来 ---- */
  function promotions(){
    var f = led();
    if (!f) return [];
    try { return (f.load().promotions || []).slice(); } catch(e){ return []; }
  }
  function why(name){
    var n = norm(name), all = promotions();
    for (var i = all.length - 1; i >= 0; i--){ if (norm(all[i].name) === n) return all[i]; }
    var f = led();
    if (f && typeof f.why === 'function'){ try { return { pending: f.why(n) }; } catch(e){} }
    return null;
  }

  /* ---- 取り付け: ターン確定（fix640 の採取が済んだ後に評価する） ---- */
  function install(){
    var U = null;
    try { U = window.UI || (0,eval)('typeof UI!=="undefined"?UI:null'); } catch(e){ U = null; }
    if (!U) return false;
    if (U.__v292Dfix641) return true;
    try {
      if (typeof U.appendTurn === 'function'){
        var oa = U.appendTurn.bind(U);
        U.appendTurn = function(turn, idx){
          /* ★内側（fix640 の採取を含む）を先に通してから評価する。
             ラップ順に依存して「1ターン遅れる」ことがないようにする。 */
          var r = oa(turn, idx);
          try { evaluate({}); } catch(e){ stats.errors++; }
          return r;
        };
      }
    } catch(e){ stats.errors++; }
    U.__v292Dfix641 = true;
    try { console.log(TAG, 'armed (appendTurn, after fix640 harvest)'); } catch(e){}
    return true;
  }
  if (!install()){
    var tries = 0;
    var iv = setInterval(function(){ tries++; if (install() || tries > 120) clearInterval(iv); }, 250);
  }
  /* 既存の物語も開いた時点で1回だけ手当てする（周期処理は置かない） */
  try { setTimeout(function(){ try { evaluate({}); } catch(e){} }, 2500); } catch(e){}

  function selfTest(){
    var st = getState(), f = led();
    return {
      off: off(), ledgerPresent: !!f, stateReachable: !!st,
      hero: norm(st && st.cast && st.cast.hero && st.cast.hero.name),
      npcs: (st && st.cast && Array.isArray(st.cast.npcs)) ? st.cast.npcs.length : -1,
      autoRegistered: (st && st.cast && Array.isArray(st.cast.npcs))
        ? st.cast.npcs.filter(function(n){ return n && n.autoBy === 'fix641'; }).map(function(n){ return n.name; }) : [],
      wouldPromote: (function(){ try { return dryRun().promoted; } catch(e){ return null; } })(),
      stats: JSON.parse(JSON.stringify(stats))
    };
  }

  window.__v292Dfix641 = {
    __armed: true,
    evaluate: evaluate, dryRun: dryRun, decide: decide,
    undo: undo, undoAll: undoAll, unblock: unblock,
    promotions: promotions, why: why,
    alreadyInCast: alreadyInCast, getState: getState,
    MIN_TURNS: MIN_TURNS, MIN_STRONG_KINDS: MIN_STRONG_KINDS,
    stats: function(){ return JSON.parse(JSON.stringify(stats)); },
    selfTest: selfTest, isOff: off
  };
  try { if (!off()) console.log(TAG, 'armed'); } catch(e){}
})();
