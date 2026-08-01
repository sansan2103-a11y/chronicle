// =====================================================================
// Chronicle TRPG - v292Dfix633: アイコン版差分スイープを「全在庫」に対して回す
// ---------------------------------------------------------------------
// 真因(原因B・2026-07-29に現コードで確認):
//   v292Dfix523-icon-sync-versioned.js:159-162
//     function localAvKeys(){ for (i<localStorage.length){ k=localStorage.key(i); ... } }
//   localStorage.length / key(i) は fix346 がラップしていない。画像の実体は fix346 で
//   IndexedDB(chr6av/imgs)へ移されており生localStorageには**1件も無い**(実測 LS=0 / IDB=225)。
//   → fix523 の版差分の対象が常に空になり、「画面に映っているキャラだけ」に縮退していた。
//   ※ localAv()(65行) は localStorage.getItem 経由＝fix346のラッパで mem から読める。
//      壊れているのは **列挙だけ**。だから「実行」はfix523に任せ、「対象決め」だけ作り直す。
//
// なぜ fix523 を書き換えず併走させるか:
//   localAvKeys() は fix523 のクロージャ内部関数で、周期タイマーが呼ぶ recvSweep から
//   直接参照されている＝外から差し替えられない。一方 fix523 は
//   pullOne / pushOne / revGet / revSet / hashFull / on を window.__v292Dfix523 に公開している。
//   → **判断(どのキーをどうするか)だけを作り直し、実行は fix523 のプリミティブに委譲**するのが最小変更。
//     409連発の打ち切りカウンタも fix523 の中で共有されるので二重に暴走しない。
//
// 判定規則(fix523 と完全に同一・対象集合だけ正しくする):
//   server無し                 → 何もしない
//   local無し(かつ画面に表示中) → PULL
//   server.hash === local.hash → rev だけ採用(通信しない)
//   server.rev > 既知rev       → PULL(サーバーが厳密に新しい)
//   それ以外                   → PUSH(baseImageRev付き=409ならfix523がPULLへ切替)
// iOS配慮: 1スイープ最大6キー・round-robin・キー間120ms・周期25秒(fix523の20秒と位相をずらす)。
// manifest は10秒TTLでキャッシュし、fix634 と共用する(op:imgmanifest の往復を増やさない)。
//
// 緊急OFF: localStorage.v292Dfix633Off='1'
// ★既定はshadow（判定だけ・PULL/PUSHを撃たない）。実弾は localStorage.v292Dfix633Live='1' を明示した端末だけ。
// 強制shadow: v292Dfix633Shadow='1'（Liveより優先）
// ★fix523 が OFF のときは本モジュールも動かない(緊急停止スイッチを1本に保つ)。
// 冪等ガード: window.__v292Dfix633.__armed
//
// ★fix655(2026-08-01・GPT裁定=条件付きGO): 公開API契約検査(fail-closed)。
//   真因: fix523 が revSet を公開しておらず、旧 `typeof f.revSet==='function'` ガードが
//   黙って素通り=rev-only 採用が全端末で一度も動いていなかった(無言の失敗・A2ケース1で発見)。
//   裁定条件: 依存APIが1つでも欠けたら sweep 全停止(ネットワーク書込0)・一度だけ warn・
//   永続counter(v292Dfix655_depFail)加算。Live で一部だけ動かすのは禁止。
//   plan()/decide() は読み取り専用診断として残す。
//   観測: status().deps / status().counters {revAdopted, revAdoptFailed, revPlanNonConvergent}
//   緊急バイパス: localStorage.v292Dfix655Off='1'（検査を外し従来挙動へ。revSet export は無害に残る）
// =====================================================================
(function(){
  'use strict';
  var W = (typeof window !== 'undefined') ? window : this;
  if (W.__v292Dfix633 && W.__v292Dfix633.__armed) return;
  var TAG = '[v292Dfix633:icon-sweep-full]';
  var PREFIX = 'v292av2_';
  var BATCH = 6, GAP_MS = 120, PERIOD_MS = 25000, FIRST_MS = 9000, MAN_TTL = 10000;

  function lsg(k){ try { return W.localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix633Off') === '1'; }
  function shadow(){ return lsg('v292Dfix633Live') !== '1' || lsg('v292Dfix633Shadow') === '1'; }  // ★既定shadow。実機で体感→承認後に Live='1' で既定化
  function f523(){ try { return W.__v292Dfix523 || null; } catch(e){ return null; } }
  function on(){
    if (off()) return false;
    var f = f523();
    if (!f || !f.__armed || typeof f.pullOne !== 'function' || typeof f.pushOne !== 'function') return false;
    try { if (typeof f.on === 'function' && !f.on()) return false; } catch(e){ return false; }
    return true;
  }

  // ---------- ★fix655: 公開API契約検査(fail-closed・GPT裁定 2026-08-01) ----------
  var DEPS = ['revSet', 'revGet', 'hashFull', 'pullOne', 'pushOne'];
  var ctr = { revAdopted: 0, revAdoptFailed: 0, revPlanNonConvergent: 0 };
  var adopted = {};                    // pk -> 採用済み sRev（メモリのみ・LSへ書かない）
  var depState = { unavailable: false, missing: [] };
  var depWarned = false;
  function missingDeps(){
    var f = f523(); if (!f) return DEPS.slice();
    var out = [];
    for (var i = 0; i < DEPS.length; i++){ if (typeof f[DEPS[i]] !== 'function') out.push(DEPS[i]); }
    return out;
  }
  function depsOk(){
    if (lsg('v292Dfix655Off') === '1') return true;   // 緊急バイパス（従来挙動）
    var m = missingDeps();
    depState.unavailable = m.length > 0;
    depState.missing = m;
    if (!m.length) return true;
    if (!depWarned){
      depWarned = true;
      try { console.warn(TAG, 'dependency-unavailable; sweep停止(fail-closed):', m.join(',')); } catch(e){}
      try { var k = 'v292Dfix655_depFail'; W.localStorage.setItem(k, String((parseInt(lsg(k), 10) || 0) + 1)); } catch(e){}
    }
    return false;
  }

  function proxyUrl(){
    try { var u = (lsg('v292ProxyUrl') || '').trim(); if (u) return u.replace(/\/+$/, ''); } catch(e){}
    try { if (W.__v292Dfix247bapi && W.__v292Dfix247bapi.DEFAULT_PROXY_URL) return W.__v292Dfix247bapi.DEFAULT_PROXY_URL; } catch(e){}
    return 'https://novel-proxy.sansan2103.workers.dev';
  }
  function authHeaders(){
    var h = { 'Content-Type': 'application/json' };
    try { var g = (W.__chronicleGoogleId && W.__chronicleGoogleId()) || ''; if (g) h['x-google-id'] = g; } catch(e){}
    try { var p = (lsg('v292ProxyPass') || '').trim(); if (p) h['x-chronicle-pass'] = p; } catch(e){}
    return h;
  }
  function loggedIn(){ var h = authHeaders(); return !!(h['x-google-id'] || h['x-chronicle-pass']); }
  function nsGet(){ return lsg('v292Dfix400_ns') || ''; }
  var _fetch = (typeof fetch === 'function') ? fetch.bind(W) : null;

  // ---------- manifest(10秒TTL・fix634と共用) ----------
  var manCache = null, manAt = 0, manInflight = null;
  function manifest(cb, force){
    var now = Date.now();
    if (!force && manCache && (now - manAt) < MAN_TTL){ cb(manCache); return; }
    if (manInflight){ manInflight.push(cb); return; }
    if (!_fetch || !loggedIn()){ cb(null); return; }
    manInflight = [cb];
    _fetch(proxyUrl() + '/save', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ op: 'imgmanifest' }) })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){
        var m = (j && j.manifest) ? j.manifest : null;
        if (m){ manCache = m; manAt = Date.now(); }
        var qs = manInflight || []; manInflight = null;
        for (var i = 0; i < qs.length; i++){ try { qs[i](m); } catch(e){} }
      })
      .catch(function(){
        var qs = manInflight || []; manInflight = null;
        for (var i = 0; i < qs.length; i++){ try { qs[i](null); } catch(e){} }
      });
  }
  function invalidateManifest(){ manCache = null; manAt = 0; }

  // ---------- 在庫・表示中 ----------
  function localKeys(){
    try { if (W.__v292av && typeof W.__v292av.keys === 'function') return W.__v292av.keys(); } catch(e){}
    var out = [];
    try { for (var i = 0; i < (W.localStorage.length || 0); i++){ var k = W.localStorage.key(i); if (k && k.indexOf(PREFIX) === 0) out.push(k.slice(PREFIX.length)); } } catch(e){}
    return out;
  }
  function localAv(pk){
    try { var v = W.localStorage.getItem(PREFIX + pk); return (typeof v === 'string' && v.indexOf('data:') === 0) ? v : null; } catch(e){ return null; }
  }
  function visiblePks(){
    var out = {};
    try {
      if (typeof document === 'undefined' || !document.querySelectorAll) return out;
      var imgs = document.querySelectorAll('img[data-avpk]');
      for (var i = 0; i < imgs.length; i++){ var pk = imgs[i].getAttribute('data-avpk'); if (pk) out[pk] = 1; }
    } catch(e){}
    return out;
  }
  function pendingImgs(){ try { return JSON.parse(lsg('v292Dfix402_pimg') || '{}') || {}; } catch(e){ return {}; } }

  // ---------- 判定(副作用なし・shadowでもそのまま使う) ----------
  function decide(man){
    var f = f523(); if (!f || !man) return [];
    var hashFull = f.hashFull, revGet = f.revGet;
    var pend = pendingImgs(), vis = visiblePks();
    var cand = Object.create(null), i, pk;
    var lk = localKeys();
    for (i = 0; i < lk.length; i++){ if (man[PREFIX + lk[i]]) cand[lk[i]] = 1; }
    var mks = Object.keys(man);
    for (i = 0; i < mks.length; i++){
      var mk = mks[i];
      if (mk.indexOf(PREFIX) !== 0) continue;           // v292meta1_* など画像以外は触らない
      pk = mk.slice(PREFIX.length);
      if (!localAv(pk) && vis[pk]) cand[pk] = 1;        // ローカルに無く画面に映っている分だけ引く
    }
    var list = Object.keys(cand).filter(function(p){ return !((PREFIX + p) in pend); }).sort();
    var out = [];
    for (i = 0; i < list.length; i++){
      pk = list[i];
      var srv = man[PREFIX + pk];
      if (!srv) continue;
      var sRev = +srv.rev || 0, sHash = String(srv.hash || '');
      var loc = localAv(pk);
      var kRev = 0; try { kRev = revGet(pk) || 0; } catch(e){}
      if (!loc){ out.push({ pk: pk, act: 'pull', sRev: sRev, why: 'missing-local' }); continue; }
      var lHash = ''; try { lHash = hashFull(loc); } catch(e){}
      if (sHash && sHash === lHash){ out.push({ pk: pk, act: (kRev !== sRev ? 'rev' : 'noop'), sRev: sRev, why: 'same-content' }); continue; }
      if (sRev > kRev){ out.push({ pk: pk, act: 'pull', sRev: sRev, why: 'server-newer' }); continue; }
      out.push({ pk: pk, act: 'push', sRev: sRev, why: 'local-newer-or-unpublished' });
    }
    return out;
  }

  // ---------- スイープ ----------
  var busy = false, cursor = 0, lastPlan = null, lastRun = 0;
  function sweep(done){
    if (!on() || busy || !loggedIn() || !nsGet() || !_fetch){ if (done) done(null); return; }
    if (!depsOk()){ if (done) done(null); return; }   // ★fix655: fail-closed(通信もしない)
    busy = true;
    manifest(function(man){
      if (!man){ busy = false; if (done) done(null); return; }
      var plan = decide(man);
      // ★fix655: 非収束の観測。前回採用済み(同じsRev)のキーがまだ rev として再計画されたら数える
      for (var pi = 0; pi < plan.length; pi++){
        if (plan[pi].act === 'rev' && adopted[plan[pi].pk] === plan[pi].sRev){
          ctr.revPlanNonConvergent++;
          try { console.warn(TAG, 'rev non-convergent:', plan[pi].pk, 'sRev', plan[pi].sRev); } catch(e){}
        }
      }
      lastPlan = { at: Date.now(), total: plan.length,
                   pull: plan.filter(function(p){ return p.act === 'pull'; }).length,
                   push: plan.filter(function(p){ return p.act === 'push'; }).length,
                   rev:  plan.filter(function(p){ return p.act === 'rev';  }).length };
      var work = plan.filter(function(p){ return p.act !== 'noop'; });
      if (!work.length){ busy = false; lastRun = Date.now(); if (done) done(lastPlan); return; }
      if (shadow()){
        try { console.log(TAG, 'shadow plan', JSON.stringify(lastPlan), work.slice(0, 8)); } catch(e){}
        busy = false; lastRun = Date.now(); if (done) done(lastPlan); return;
      }
      var start = cursor % work.length, batch = [];
      for (var n = 0; n < work.length && batch.length < BATCH; n++) batch.push(work[(start + n) % work.length]);
      cursor = (start + batch.length) % work.length;
      var f = f523(), i = 0;
      (function next(){
        if (i >= batch.length){ busy = false; lastRun = Date.now(); invalidateManifest(); if (done) done(lastPlan); return; }
        var it = batch[i++];
        var cont = function(){ try { setTimeout(next, GAP_MS); } catch(e){ next(); } };
        try {
          if (it.act === 'rev'){
            /* ★fix655: 旧 `typeof f.revSet==='function'` の黙殺ガードを撤去。
               depsOk() が保証するので直接呼び、読み戻しで採用を検証して数える。 */
            var okAdopt = false;
            try { f.revSet(it.pk, it.sRev); okAdopt = (f.revGet(it.pk) === it.sRev); } catch(e){}
            if (okAdopt){ ctr.revAdopted++; adopted[it.pk] = it.sRev; }
            else { ctr.revAdoptFailed++; try { console.warn(TAG, 'rev採用失敗(読み戻し不一致):', it.pk, '→', it.sRev); } catch(e){} }
            cont(); return;
          }
          if (it.act === 'pull'){ f.pullOne(it.pk, it.sRev, cont); return; }
          f.pushOne(it.pk, cont);
        } catch(e){ cont(); }
      })();
    });
  }

  function plan(cb){
    manifest(function(man){ cb(man ? decide(man) : null); }, true);
  }

  W.__v292Dfix633 = {
    __armed: true, on: on, shadow: shadow,
    manifest: manifest, invalidateManifest: invalidateManifest,
    localKeys: localKeys, decide: decide, plan: plan, sweep: sweep,
    status: function(){
      return { armed: true, on: on(), shadow: shadow(), loggedIn: loggedIn(),
               ns: nsGet() ? 'set' : 'none', inventory: localKeys().length,
               lastPlan: lastPlan, lastRun: lastRun, manifestAt: manAt,
               /* ★fix655: 契約検査と採用の観測口（missingはその場で再計算＝陳腐化しない） */
               deps: (function(){ var m = missingDeps();
                       return { unavailable: m.length > 0, missing: m,
                                depFailCount: parseInt(lsg('v292Dfix655_depFail'), 10) || 0,
                                bypass: lsg('v292Dfix655Off') === '1' }; })(),
               counters: { revAdopted: ctr.revAdopted, revAdoptFailed: ctr.revAdoptFailed,
                           revPlanNonConvergent: ctr.revPlanNonConvergent } };
    }
  };

  try {
    if (typeof document !== 'undefined'){
      if (typeof setTimeout === 'function') setTimeout(function(){ sweep(); }, FIRST_MS);
      if (typeof setInterval === 'function') setInterval(function(){ sweep(); }, PERIOD_MS);
      if (document.addEventListener){
        document.addEventListener('visibilitychange', function(){
          if (document.visibilityState === 'visible'){ invalidateManifest(); try { setTimeout(function(){ sweep(); }, 2500); } catch(e){} }
        });
      }
    }
  } catch(e){}
  try { console.log(TAG, 'armed; on:', on() ? 'on' : 'off', shadow() ? '(shadow)' : ''); } catch(e){}
})();
