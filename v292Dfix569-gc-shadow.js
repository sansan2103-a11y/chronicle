/* v292Dfix569-gc-shadow.js (2026-07-26) — 削除の「影監視」（拒否しない・挙動を1バイトも変えない）
 *
 * ■なぜ必要か
 *   控えを消すコードが**7か所**に分散している(fix490 trim / fix490 quota / fix264b / fix399 /
 *   fix402 doomed / fix402 退避世代 / fix277)。fix565・fix568 で2件を根治したが、
 *   「守ると決めたデータを、別のコードが黙って消す」型の事故は**残り5か所に同じ保証が無い**。
 *   中央GCへ一本化するのが本命だが、**いきなり拒否を入れると、拒否が呼び出し元へ伝わらない事故を新しく作る**
 *   (`removeItem()` は成功も失敗も undefined を返す)。まず「見るだけ」を置く。
 *
 * ■二層構成（GPT裁定・案Y+）
 *   inner … **fix246 より前**に即設置。以後に参照を捕捉する全員の下に入る。
 *           fix246 の書換**後**の実効キーを見る。
 *   outer … 全ラッパ読込後に最外殻へ設置。**要求キー**（書換前）を見る。保護判定はこちら。
 *   ★fix569 は **Chronicle本体の最初の実行スクリプト**でなければならない。
 *     `Storage.prototype` への三枚目は**採らない**（fix569より前に取得済みの bound 参照は
 *     どのみち捕まらず、二重計上とラップ順序の組合せが増えて観測値の意味が壊れるため・GPT裁定）。
 *     代わりに**静的検査**（scan_delete_api.cjs / test_fix569_loadorder.cjs）で迂回APIを禁止する。
 *
 * ■★操作IDでイベントを対応付ける（GPT裁定）
 *   単純な引き算 `inner.calls - outer.requestedCalls` は**正式指標にしない**。次でずれるため:
 *     ・outerを通ったがinnerへ届かなかった（中間ラッパが例外）→ 差がマイナス
 *     ・outerの1要求が複数削除へ展開された（中間ラッパが内部で2キー削除）→ 差が+1でも迂回ではない
 *     ・removeItem内で再入が起きた → 累積差では由来を区別できない
 *   removeItem は同期なので、outer で操作IDを発行し opStack で inner まで渡せる。
 *   **正式な bypassedOuter ＝ `innerWithoutOuter`（outer操作IDを持たずに inner へ到達した件数）**
 *
 * ■このfixが絶対にやらないこと
 *   削除の拒否・遅延・順序変更 / 戻り値の変更 / localStorage への書き込み（ログも書かない）。
 *   例外が起きたら**必ず素通し**する。
 *
 * ■「全件0」を信じないための設計
 *   wouldDeny=0 が言えるのは「観測できた経路・観測期間で0件だった」だけ。
 *   **分母(outerRequests / byPath)** と **生存証明(canary)** を必ず併記する。
 *
 * OFF   = localStorage['v292Dfix569Off'] = '1'
 * 読出  = window.__v292Dfix569.stats() / .events() / .selfTest() / .armed()
 */
(function v292Dfix569(){
  if (window.__v292Dfix569) return;
  var TAG = '[v292Dfix569]';

  /* ================= Phase 1: native の捕捉（Chronicle最初のスクリプトとして走る） ===== */
  var nativeRemove = null, nativeGet = null, nativeKey = null;
  var protoPristineAtLoad = null;
  try {
    nativeRemove = localStorage.removeItem;
    nativeGet    = localStorage.getItem;
    nativeKey    = localStorage.key;
    try { protoPristineAtLoad = (localStorage.removeItem === Storage.prototype.removeItem); } catch(e){ protoPristineAtLoad = null; }
  } catch(e){}
  function rawGet(k){ try { return nativeGet ? nativeGet.call(localStorage, k) : localStorage.getItem(k); } catch(e){ return null; } }
  function rawKeys(){
    var out = [];
    try { var n = localStorage.length;
      for (var i = 0; i < n; i++){ var k = nativeKey ? nativeKey.call(localStorage, i) : localStorage.key(i); if (k != null) out.push(k); }
    } catch(e){}
    return out;
  }

  /* ★ロード順の動的証明: fix569 が走った時点で、後続fixの起動マーカーが1つも無いこと。
     1つでもあれば「fix569 が最初ではない」＝ inner が迂回されうる。 */
  /* ★★2026-07-26 実機で踏んだ: fix346 は `localStorage.__v346raw = _get` と書くが、
     Storage への代入は**localStorage のキーとして永続する**（実測: 29字の文字列キー）。
     つまり「前のページ読込の痕跡」であって、いま fix346 が先に走った証拠ではない。
     これを見て loadOrderVerified=false と誤判定していた。**window 上の実行時マーカーだけを見る**。
     fix346 は window にマーカーを出さないので、順序は静的検査(test_fix569_loadorder.cjs)で保証する。 */
  function laterFixMarkers(){
    var seen = [];
    try { if (window.__v292Dfix246) seen.push('fix246'); } catch(e){}
    try { if (window.__v292Dfix472) seen.push('fix472'); } catch(e){}
    try { if (window.__v292Dfix490) seen.push('fix490'); } catch(e){}
    try { if (window.__v292Dfix562) seen.push('fix562'); } catch(e){}
    try { if (window.__v292Dfix402) seen.push('fix402'); } catch(e){}
    try { if (window.__v292Dfix399x) seen.push('fix399'); } catch(e){}
    return seen;
  }
  var markersAtLoad = laterFixMarkers();

  /* ================= 計測値（すべてメモリ。localStorage へは1バイトも書かない） ======= */
  var S = {
    /* 設置状態 */
    innerInstalled:false, outerInstalled:false, innerInstallCount:0, outerInstallCount:0,
    isOutermost:null, protoPristineAtLoad:protoPristineAtLoad, capturedNative:!!nativeRemove,
    /* ★ロード順の証明: fix569 の時点で後続fixが1つも起動していなければ true */
    loadOrderVerified: markersAtLoad.length === 0, markersAtLoad: markersAtLoad,
    /* ★fix246 が二層の間に居ることを実際に観測できたか（requestedKey !== effectiveKey） */
    fix246ObservedBetweenLayers:false,
    /* 正式指標（GPT裁定） */
    outerRequests:0,
    outerWithOneInner:0, outerWithoutInner:0, outerFanout:0,
    innerCalls:0, innerWithOuter:0, innerWithoutOuter:0,
    /* ★outer が設置される前(=DOMContentLoaded前)の削除は「迂回」ではない。分けて数える。
       実測: fix516 の migrate() が読込時に `v292Dfix516names` を消すのがこれに当たる。 */
    innerBeforeOuterInstall:0, innerWithoutOuterAfterInstall:0,
    rewrittenKeys:0,
    /* 保護判定 */
    wouldAllow:0, wouldDeny:0, unknown:0, postChecks:0,
    protectedProbeSeen:0, allowedProbeSeen:0, rewriteProbeSeen:0, bypassProbeSeen:0,
    classifierErrors:0, wrapperErrors:0,
    byPath:{ fix490Trim:0, fix490Quota:0, fix264b:0, fix399:0, fix402Doomed:0, fix402Retention:0, fix277:0, fix569probe:0, other:0, unknownPath:0 },
    innerByFamily:{}
  };
  var RING = [], RING_MAX = 50;
  function push(ev){ try { RING.push(ev); if (RING.length > RING_MAX) RING.shift(); } catch(e){} }
  function off(){ return rawGet('v292Dfix569Off') === '1'; }

  /* ================= 操作ID（outer → inner の対応付け） ========================== */
  var opStack = [], nextOpId = 1;
  function finishOuterEvent(op){
    if (op.innerCount === 0) S.outerWithoutInner++;
    else if (op.innerCount === 1) S.outerWithOneInner++;
    else S.outerFanout++;
  }

  /* ================= Phase 1b: inner shadow（fix246 より前・数えるだけ） ========== */
  var innerDown = null, innerShadow = null;
  (function installInner(){
    try {
      if (off()) return;
      var prev = localStorage.removeItem;
      if (typeof prev !== 'function') return;
      innerDown = prev;
      innerShadow = function(k){
        try {
          var key = String(k);
          S.innerCalls++;
          var op = opStack.length ? opStack[opStack.length - 1] : null;
          if (op){
            op.innerCount++;
            S.innerWithOuter++;
            if (key !== op.requestedKey){ S.rewrittenKeys++; S.fix246ObservedBetweenLayers = true; op.rewritten = true; op.effectiveKey = key; }
          } else {
            S.innerWithoutOuter++;
            if (!S.outerInstalled){
              /* outer 未設置の間＝読込中の削除。迂回ではない。 */
              S.innerBeforeOuterInstall++;
              push({ at: 0, key: key, kind: 'innerBeforeOuterInstall', why: 'outer設置前の削除(迂回ではない)' });
            } else {
              /* ★★outer 設置後に outer を通らずに来た＝**確認済みの迂回**。正式な bypassedOuter はこれ。 */
              S.innerWithoutOuterAfterInstall++;
              push({ at: 0, key: key, kind: 'innerWithoutOuterAfterInstall', why: '★outerの操作IDを持たずにinnerへ到達(確認済みの迂回)' });
            }
          }
          var fam = key.indexOf('chr6_bk_') === 0 ? 'backup'
                  : (key.indexOf('chr6_snapd_') === 0 || key.indexOf('chr6_snap_') === 0) ? 'snapshot'
                  : key.indexOf('__gen_') === 0 ? 'gen'
                  : /^chr6(_slot_|$)/.test(key) ? 'story'
                  : key.indexOf('v292av2_') === 0 ? 'image' : 'other';
          S.innerByFamily[fam] = (S.innerByFamily[fam] || 0) + 1;
        } catch(e){ S.wrapperErrors++; }
        return innerDown.call(localStorage, k);
      };
      localStorage.removeItem = innerShadow;
      S.innerInstalled = true; S.innerInstallCount++;
    } catch(e){ S.wrapperErrors++; }
  })();

  /* ================= 保護判定（fix562 を唯一の正とする・throttleキャッシュ） ======== */
  var protCache = null, protAt = 0, PROT_TTL = 10000;
  function now(){ try { return Date.now(); } catch(e){ return 0; } }
  function protectedKeys(force){
    var t = now();
    if (!force && protCache && (t - protAt) < PROT_TTL) return protCache;
    var map = null;
    try {
      var f = window.__v292Dfix562;
      if (f && typeof f.protectedSet === 'function'){
        var ps = f.protectedSet(), m = {};
        Object.keys(ps).forEach(function(s){ if (ps[s] && ps[s].key) m[ps[s].key] = ps[s].reason || 'protected'; });
        map = m;
      }
    } catch(e){ S.classifierErrors++; map = null; }
    protCache = map; protAt = t;
    return map;
  }
  var extraProtected = Object.create(null);   /* テスト用の差し込み口 */
  function classify(key){
    if (extraProtected[key]) return { verdict:'deny', why: extraProtected[key] };
    var m = protectedKeys(false);
    if (!m) return { verdict:'unknown', why:'fix562が未ロードまたは判定に失敗' };
    if (m[key]) return { verdict:'deny', why: m[key] };
    return { verdict:'allow', why:null };
  }

  /* ================= 呼び出し元の識別（スタックから7経路へ） ======================== */
  var PATHS = [
    { id:'fix264b', re:/v292Dfix228-slot-generations/ },
    { id:'fix399',  re:/v292Dfix399-cloudsync/ },
    { id:'fix277',  re:/v292Dfix277-quasi-pack/ },
    { id:'fix490',  re:/v292Dfix490-slot-write-guard/ },
    { id:'fix402',  re:/v292Dfix402-invisible-sync/ }
  ];
  /* ★★自分自身のフレームを必ず取り除く（2026-07-26、7経路テストで発見したバグ）。
     除かないと**すべての削除が自分（canary）由来に見えて**、7経路が1件も数えられない。 */
  function stackOf(){
    try { throw new Error('s'); } catch(e){
      var s = String(e && e.stack || '');
      if (s.indexOf('v292Dfix569') < 0) return s;
      var out = [], lines = s.split('\n');
      for (var i = 0; i < lines.length; i++){ if (lines[i].indexOf('v292Dfix569') < 0) out.push(lines[i]); }
      return out.join('\n');
    }
  }
  function pathOf(key, stack){
    if (key.indexOf('chr6_gc_probe_') === 0) return { id:'fix569probe', fn:'canary' };
    var hit = null;
    for (var i = 0; i < PATHS.length; i++){ if (PATHS[i].re.test(stack)) { hit = PATHS[i].id; break; } }
    if (!hit) return { id:'unknownPath', fn:null };
    if (hit === 'fix490'){
      if (/dropOldestGuardBackup/.test(stack)) return { id:'fix490Quota', fn:'dropOldestGuardBackup' };
      if (/trimBackups/.test(stack))           return { id:'fix490Trim',  fn:'trimBackups' };
      return { id: /^chr6_bk_(guard|saveto)_/.test(key) ? 'fix490Quota' : 'fix490Trim', fn:null };
    }
    if (hit === 'fix402'){
      if (/^chr6_bk_cloudsync_del_/.test(key)) return { id:'fix402Retention', fn:null };
      if (/^chr6(_slot_|$)/.test(key))         return { id:'fix402Doomed',    fn:null };
      return { id:'fix402Retention', fn:null };
    }
    return { id: hit, fn:null };
  }

  /* ================= Phase 2: outer shadow を最外殻へ ============================ */
  var outerDown = null, outerShadow = null;
  function install(){
    if (S.outerInstalled) return true;
    if (off()) return false;
    var prev;
    try { prev = localStorage.removeItem; } catch(e){ return false; }
    if (typeof prev !== 'function') return false;
    outerDown = prev;
    outerShadow = function(k){
      var key = String(k), op = { id: nextOpId++, requestedKey: key, innerCount: 0, rewritten:false };
      var verdict = null, p = null;
      try {
        S.outerRequests++;
        p = pathOf(key, stackOf());
        S.byPath[p.id] = (S.byPath[p.id] || 0) + 1;
        verdict = classify(key);
        if (verdict.verdict === 'deny') S.wouldDeny++;
        else if (verdict.verdict === 'allow') S.wouldAllow++;
        else S.unknown++;
        if (key.indexOf('chr6_gc_probe_protected_') === 0) S.protectedProbeSeen++;
        if (key.indexOf('chr6_gc_probe_allowed_')   === 0) S.allowedProbeSeen++;
        if (key.indexOf('chr6_gc_probe_rewrite_')   === 0) S.rewriteProbeSeen++;
      } catch(e){ S.wrapperErrors++; }

      opStack.push(op);
      var ret;
      /* ★どんなことがあっても下流を呼び、opStack を必ず戻す。ここが「挙動を変えない」の本体。 */
      try { ret = outerDown.call(localStorage, k); }
      finally {
        try { opStack.pop(); finishOuterEvent(op); } catch(e){ S.wrapperErrors++; }
      }

      try {
        S.postChecks++;
        push({ at: now(), key: key, path: p ? p.id : 'unknownPath',
               verdict: verdict ? verdict.verdict : 'error', why: verdict ? verdict.why : null,
               inner: op.innerCount, rewritten: !!op.rewritten,
               effectiveKey: op.effectiveKey || null, goneAfter: (rawGet(key) == null) });
      } catch(e){ S.wrapperErrors++; }
      return ret;
    };
    try { localStorage.removeItem = outerShadow; } catch(e){ return false; }
    S.outerInstalled = true; S.outerInstallCount++;
    try { S.isOutermost = (localStorage.removeItem === outerShadow); } catch(e){ S.isOutermost = null; }
    try { if (!off()) console.log(TAG, 'outer armed (read-only, never denies)'); } catch(e){}
    return true;
  }
  function arm(){ try { install(); } catch(e){ S.wrapperErrors++; } }
  try {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm, { once:true });
    else setTimeout(arm, 0);
    window.addEventListener('load', arm, { once:true });
    setTimeout(arm, 3000);
  } catch(e){ setTimeout(arm, 0); }

  /* ================= canary（生存証明） ========================================= */
  function nonce(){ var s=''; for (var i=0;i<8;i++){ s += 'abcdefghijklmnopqrstuvwxyz0123456789'.charAt((i*7+13)%36); } return s + '_' + now(); }
  function selfTest(){
    var r = { ok:false, steps:[], outerInstalled:S.outerInstalled, isOutermost:S.isOutermost,
              loadOrderVerified:S.loadOrderVerified, markersAtLoad:S.markersAtLoad };
    if (!S.outerInstalled){ r.why = 'outer 未設置'; return r; }
    var b = { outer:S.outerRequests, deny:S.wouldDeny, allow:S.wouldAllow,
              iwo:S.innerWithOuter, iwoo:S.innerWithoutOuter, path:S.byPath.fix569probe,
              pp:S.protectedProbeSeen, ap:S.allowedProbeSeen, one:S.outerWithOneInner };
    var n = nonce(), kP = 'chr6_gc_probe_protected_'+n, kA = 'chr6_gc_probe_allowed_'+n, kB = 'chr6_gc_probe_bypass_'+n;
    try {
      /* ①保護canary: 「保護対象」に見せる → wouldDeny+1。**それでも実際に消える**（拒否しない） */
      localStorage.setItem(kP, 'probe');
      extraProtected[kP] = 'canary(保護対象として分類されるべき)';
      localStorage.removeItem(kP);
      r.steps.push({ name:'protected', deny:S.wouldDeny-b.deny, seen:S.protectedProbeSeen-b.pp, gone:(rawGet(kP)==null) });
      /* ②通常canary: outer 1 / innerWithOuter 1 / innerWithoutOuter 0 */
      var i0 = S.innerWithOuter, j0 = S.innerWithoutOuter, o0 = S.outerWithOneInner;
      localStorage.setItem(kA, 'probe');
      localStorage.removeItem(kA);
      r.steps.push({ name:'normal', allow:S.wouldAllow-b.allow, seen:S.allowedProbeSeen-b.ap,
                     innerWithOuter:S.innerWithOuter-i0, innerWithoutOuter:S.innerWithoutOuter-j0,
                     outerWithOneInner:S.outerWithOneInner-o0, gone:(rawGet(kA)==null) });
      /* ③迂回canary: 捕捉済み参照から直接消す → outer 0 / innerWithoutOuter 1 */
      var i1 = S.outerRequests, j1 = S.innerWithoutOuterAfterInstall;
      localStorage.setItem(kB, 'probe');
      S.bypassProbeSeen++;
      if (innerShadow) innerShadow.call(localStorage, kB); else if (nativeRemove) nativeRemove.call(localStorage, kB);
      r.steps.push({ name:'bypass', outerDelta:S.outerRequests-i1,
                     innerWithoutOuter:S.innerWithoutOuterAfterInstall-j1, gone:(rawGet(kB)==null) });
    } catch(e){ r.error = String(e && e.message || e).slice(0,80); }
    finally {
      try { delete extraProtected[kP]; } catch(e){}
      try { if (nativeRemove){ nativeRemove.call(localStorage, kP); nativeRemove.call(localStorage, kA); nativeRemove.call(localStorage, kB); } } catch(e){}
    }
    r.classifierAvailable = !!protectedKeys(false);
    r.probePathDelta = S.byPath.fix569probe - b.path;
    r.counters = consistency();
    var s0=r.steps[0]||{}, s1=r.steps[1]||{}, s2=r.steps[2]||{};
    r.ok = (s0.deny === 1 && s0.seen === 1 && s0.gone === true
         && s1.allow === 1 && s1.seen === 1 && s1.gone === true
         && s1.innerWithOuter === 1 && s1.innerWithoutOuter === 0 && s1.outerWithOneInner === 1
         && s2.outerDelta === 0 && s2.innerWithoutOuter === 1 && s2.gone === true
         && r.probePathDelta === 2   /* outer を通ったのは protected と normal の2件 */
         && r.counters.innerOk === true && r.counters.outerOk === true && r.counters.splitOk === true);
    if (!r.ok && !r.classifierAvailable) r.why = 'fix562(保護判定)が未ロード。ラッパは生きているが分類はできていない';
    return r;
  }

  /* ================= 整合性・読み出し ============================================ */
  function consistency(){
    return {
      innerOk: (S.innerCalls === S.innerWithOuter + S.innerWithoutOuter),
      splitOk: (S.innerWithoutOuter === S.innerBeforeOuterInstall + S.innerWithoutOuterAfterInstall),
      outerOk: (S.outerRequests === S.outerWithOneInner + S.outerWithoutInner + S.outerFanout),
      innerCalls:S.innerCalls, innerWithOuter:S.innerWithOuter, innerWithoutOuter:S.innerWithoutOuter,
      innerBeforeOuterInstall:S.innerBeforeOuterInstall,
      innerWithoutOuterAfterInstall:S.innerWithoutOuterAfterInstall,
      outerRequests:S.outerRequests, outerWithOneInner:S.outerWithOneInner,
      outerWithoutInner:S.outerWithoutInner, outerFanout:S.outerFanout
    };
  }
  function stats(){
    var out = {};
    Object.keys(S).forEach(function(k){
      out[k] = (k === 'byPath' || k === 'innerByFamily' || k === 'markersAtLoad')
        ? JSON.parse(JSON.stringify(S[k])) : S[k];
    });
    try { out.isOutermost = (localStorage.removeItem === outerShadow); } catch(e){ out.isOutermost = null; }
    out.protectedKnown = !!protectedKeys(false);
    out.ringSize = RING.length;
    /* ★正式な bypassedOuter は「**outer設置後に**outer操作IDを持たずに inner へ到達した件数」。
       outer設置前(読込中)の削除を含めると、迂回でないものまで迂回に数えてしまう(2026-07-26に実測で判明)。
       単純な引き算は参考値にすぎないので、別名で併記する。 */
    out.bypassedOuter = S.innerWithoutOuterAfterInstall;
    out.innerBeforeOuterInstall = S.innerBeforeOuterInstall;
    out.naiveDelta = S.innerCalls - S.outerRequests;
    out.counters = consistency();
    out.observedScope = {
      note: 'wouldDeny は「outerが観測できた経路・観測期間」の値。0でも無事故の証拠にはならない',
      loadOrderVerified: S.loadOrderVerified,
      loadOrderNote: S.loadOrderVerified ? 'fix569 の時点で後続fixの起動マーカーは0件'
                                         : ('★fix569 より前に起動していたfix: ' + S.markersAtLoad.join(',')),
      bypassedOuter: S.innerWithoutOuterAfterInstall,
      innerBeforeOuterInstall: S.innerBeforeOuterInstall,
      bypassNote: '★実機実測(2026-07-26): fix346/fix472 の bind は**自分のラッパの下流**として使われており迂回していない。'
                + 'outer設置前の削除(fix516 migrate の v292Dfix516names など)を迂回と数えないこと。'
                + 'ただし fix346 の migrate ループだけは _del を直接呼ぶので、LSに v292av2_ が残っていれば迂回しうる。',
      innerByFamily: JSON.parse(JSON.stringify(S.innerByFamily)),
      pathsSeen: Object.keys(S.byPath).filter(function(p){ return S.byPath[p] > 0; }),
      pathsNeverSeen: ['fix490Trim','fix490Quota','fix264b','fix399','fix402Doomed','fix402Retention','fix277']
                        .filter(function(p){ return !S.byPath[p]; })
    };
    return out;
  }

  window.__v292Dfix569 = {
    off: off,
    armed: function(){ return S.outerInstalled; },
    stats: stats,
    consistency: consistency,
    events: function(){ return RING.slice(); },
    selfTest: selfTest,
    install: arm,
    /* テスト専用の内部露出（本番コードからは使わない） */
    _classify: classify, _pathOf: pathOf, _protectedKeys: protectedKeys, _extraProtected: extraProtected,
    _inner: function(){ return innerShadow; }, _rawKeys: rawKeys,
    _native: function(){ return { remove: nativeRemove, get: nativeGet }; }
  };
  try { console.log(TAG, 'phase1 native=' + (!!nativeRemove) + ' proto=' + protoPristineAtLoad
        + ' inner=' + S.innerInstalled + ' loadOrder=' + S.loadOrderVerified); } catch(e){}
})();
