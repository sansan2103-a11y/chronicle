/* v292Dfix569-gc-shadow.js (2026-07-26) — 削除の「影監視」（拒否しない・挙動を1バイトも変えない）
 *
 * ■なぜ必要か
 *   控えを消すコードが**7か所**に分散している(fix490 trim / fix490 quota / fix264b / fix399 /
 *   fix402 doomed / fix402 退避世代 / fix277)。2026-07-26 に fix565・fix568 で2件を根治したが、
 *   「守ると決めたデータを、別のコードが黙って消す」型の事故は**残り5か所に同じ保証が無い**。
 *   中央GCへ一本化するのが本命だが、**いきなり拒否を入れると、拒否が呼び出し元へ伝わらない事故を新しく作る**
 *   (`removeItem()` は成功も失敗も undefined を返す)。
 *
 * ■このfixがやること = 「見るだけ」(GPT裁定 569a)
 *   ・すべての `localStorage.removeItem` 要求を最外殻で観測する
 *   ・中央の保護判定(fix562 protectedSet)が何を wouldDeny と判定するかを**数えるだけ**
 *   ・呼び出し元を7経路に識別して `byPath` に計上する
 *   ・canary(人工の既知ケース)で「分類器とラップが生きている」ことを証明する
 *
 * ■このfixが絶対にやらないこと
 *   ・削除の拒否・遅延・順序変更   ・戻り値の変更   ・localStorage への書き込み(ログも書かない)
 *   例外が起きたら**必ず素通し**する。監視は挙動を変えない。
 *
 * ■★★二枚重ね（GPT指摘のシナリオ5に対する、実測を伴う対策）
 *   静的検査で判明: **fix346 と fix472 は読み込み時に `localStorage.removeItem.bind(localStorage)` で
 *   参照を捕捉している**（`v292Dfix346-idb-avatars.js:32` / `v292Dfix472-icon-protect.js:29`）。
 *   最外殻だけに監視を置くと、この2つの削除は**監視を迂回する**＝全件0でも「無事故」と読めない。
 *   そこで監視を2枚置く:
 *     inner … fix246 より**前**に設置。以後に参照を捕捉する全員の下に入るので、迂回されにくい。
 *             ただし fix246 の書換の**後**の実効キーを見る。
 *     outer … 全ラッパの読込後に最外殻へ設置。**要求キー**（書換前）を見る。保護判定はこちらで行う。
 *   `inner.calls - outer.requestedCalls` ＝ **最外殻を迂回した削除の件数**。
 *   これを常に併記することで「観測できなかった経路」を数字にする。
 *
 * ■★二段階初期化（GPT指摘・シナリオ5の対策）
 *   fix246 は `localStorage.removeItem` を変数へ捕捉してからラップする。
 *   もし fix246 より後に native を捕捉すると、掴めるのは「fix246のラッパ」であり、
 *   fix246 内部が捕捉済み参照を直接呼ぶ経路は**監視を迂回する**（＝影監視が全件0になる）。
 *   そこで:
 *     Phase 1 … **fix246 より前**に読み込み、native removeItem/getItem を closure へ捕捉
 *     Phase 2 … 全既存ラッパの読込後に、shadow wrapper を**最外殻**へ設置
 *   `Storage.prototype.removeItem` が未改変かも自己テストで確認する。
 *
 * ■「全件0」を信じないための設計（GPT裁定）
 *   wouldDeny=0 が言えるのは「観測できた経路・観測期間で0件だった」だけ。
 *   そこで **分母(requestedCalls / byPath)** と **生存証明(canary 3種)** を必ず併記する。
 *
 * OFF   = localStorage['v292Dfix569Off'] = '1'（Phase 2 を設置しない）
 * 読出  = window.__v292Dfix569.stats() / .events() / .selfTest() / .armed()
 */
(function v292Dfix569(){
  if (window.__v292Dfix569) return;
  var TAG = '[v292Dfix569]';

  /* ================= Phase 1: native の捕捉（fix246 より前に走ること） ============= */
  var nativeRemove = null, nativeGet = null, nativeKey = null, nativeLen = null;
  var protoPristineAtLoad = null;   /* Storage.prototype.removeItem が未改変か */
  try {
    nativeRemove = localStorage.removeItem;
    nativeGet    = localStorage.getItem;
    nativeKey    = localStorage.key;
    try { protoPristineAtLoad = (localStorage.removeItem === Storage.prototype.removeItem); } catch(e){ protoPristineAtLoad = null; }
  } catch(e){}
  function rawGet(k){ try { return nativeGet ? nativeGet.call(localStorage, k) : localStorage.getItem(k); } catch(e){ return null; } }
  function rawKeys(){
    var out = [];
    try {
      var n = localStorage.length;
      for (var i = 0; i < n; i++){ var k = nativeKey ? nativeKey.call(localStorage, i) : localStorage.key(i); if (k != null) out.push(k); }
    } catch(e){}
    return out;
  }

  /* ================= 状態（すべてメモリ。localStorage へは1バイトも書かない） ======= */
  var S = {
    installed: false, installCount: 0, isOutermost: null,
    protoPristineAtLoad: protoPristineAtLoad, capturedNative: !!nativeRemove,
    requestedCalls: 0, downstreamCalls: 0, postChecks: 0,
    wouldAllow: 0, wouldDeny: 0, unknown: 0,
    protectedProbeSeen: 0, allowedProbeSeen: 0, rewriteProbeSeen: 0,
    classifierErrors: 0, wrapperErrors: 0,
    byPath: { fix490Trim:0, fix490Quota:0, fix264b:0, fix399:0, fix402Doomed:0, fix402Retention:0, fix277:0, fix569probe:0, other:0, unknownPath:0 },
    /* inner = fix246 より前に置く下段の監視。最外殻を迂回した削除を数えるためだけに存在する。 */
    inner: { installed:false, calls:0, byPath:{} }
  };
  var RING = [], RING_MAX = 50;
  function push(ev){ try { RING.push(ev); if (RING.length > RING_MAX) RING.shift(); } catch(e){} }

  function off(){ return rawGet('v292Dfix569Off') === '1'; }

  /* ================= Phase 1b: inner shadow を即座に設置（fix246 より前） ========= */
  /* ここは「数えるだけ」。保護判定もスタック解析の重い処理もしない（起動経路に負荷をかけない）。 */
  var innerDown = null, innerShadow = null;
  (function installInner(){
    try {
      if (off()) return;
      var prev = localStorage.removeItem;
      if (typeof prev !== 'function') return;
      innerDown = prev;
      innerShadow = function(k){
        try {
          S.inner.calls++;
          var key = String(k);
          var fam = key.indexOf('chr6_bk_') === 0 ? 'backup'
                  : (key.indexOf('chr6_snapd_') === 0 || key.indexOf('chr6_snap_') === 0) ? 'snapshot'
                  : key.indexOf('__gen_') === 0 ? 'gen'
                  : /^chr6(_slot_|$)/.test(key) ? 'story'
                  : key.indexOf('v292av2_') === 0 ? 'image' : 'other';
          S.inner.byPath[fam] = (S.inner.byPath[fam] || 0) + 1;
        } catch(e){ S.wrapperErrors++; }
        return innerDown.call(localStorage, k);
      };
      localStorage.removeItem = innerShadow;
      S.inner.installed = true;
    } catch(e){ S.wrapperErrors++; }
  })();

  /* ================= 保護判定（fix562 を唯一の正とする・throttleキャッシュ） ======== */
  var protCache = null, protAt = 0, PROT_TTL = 10000;
  var nowFn = function(){ try { return Date.now(); } catch(e){ return 0; } };
  function protectedKeys(force){
    var t = nowFn();
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
  /* テスト用の差し込み口（canary を「保護対象」に見せるため）。本番では未使用。 */
  var extraProtected = Object.create(null);

  function classify(key){
    if (extraProtected[key]) return { verdict: 'deny', why: extraProtected[key] };
    var m = protectedKeys(false);
    if (!m) return { verdict: 'unknown', why: 'fix562が未ロードまたは判定に失敗' };
    if (m[key]) return { verdict: 'deny', why: m[key] };
    return { verdict: 'allow', why: null };
  }

  /* ================= 呼び出し元の識別（スタックから7経路へ） ======================== */
  /* ★取れないことを理由に記録を落とさない(GPT指摘)。取れなければ unknownPath に計上する。 */
  var PATHS = [
    { id:'fix569probe',     re:/v292Dfix569/ },
    { id:'fix264b',         re:/v292Dfix228-slot-generations/ },
    { id:'fix399',          re:/v292Dfix399-cloudsync/ },
    { id:'fix277',          re:/v292Dfix277-quasi-pack/ },
    { id:'fix490',          re:/v292Dfix490-slot-write-guard/ },
    { id:'fix402',          re:/v292Dfix402-invisible-sync/ }
  ];
  function stackOf(){ try { throw new Error('s'); } catch(e){ return String(e && e.stack || ''); } }
  function pathOf(key, stack){
    /* ★canary は自分のキー形で確定させる。スタックにファイル名が出ない環境(node等)でも
       生存証明が unknownPath へ落ちないようにするため。 */
    if (key.indexOf('chr6_gc_probe_') === 0) return { id:'fix569probe', fn:'canary' };
    var hit = null;
    for (var i = 0; i < PATHS.length; i++){ if (PATHS[i].re.test(stack)) { hit = PATHS[i].id; break; } }
    if (!hit) return { id: 'unknownPath', fn: null };
    /* fix490 / fix402 は1ファイルに2経路あるので、関数名で割る（無ければキー形で割る） */
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
    return { id: hit, fn: null };
  }

  /* ================= Phase 2: 最外殻へ shadow wrapper を設置 ====================== */
  var shadow = null, downstream = null;

  function install(){
    if (S.installed) return true;
    if (off()) return false;
    var prev;
    try { prev = localStorage.removeItem; } catch(e){ return false; }
    if (typeof prev !== 'function') return false;
    downstream = prev;
    shadow = function(k){
      var key = String(k);
      var stack = '', verdict = null, p = null;
      try {
        S.requestedCalls++;
        stack = stackOf();
        p = pathOf(key, stack);
        S.byPath[p.id] = (S.byPath[p.id] || 0) + 1;
        verdict = classify(key);
        if (verdict.verdict === 'deny') S.wouldDeny++;
        else if (verdict.verdict === 'allow') S.wouldAllow++;
        else S.unknown++;
        if (key.indexOf('chr6_gc_probe_protected_') === 0) S.protectedProbeSeen++;
        if (key.indexOf('chr6_gc_probe_allowed_')   === 0) S.allowedProbeSeen++;
        if (key.indexOf('chr6_gc_probe_rewrite_')   === 0) S.rewriteProbeSeen++;
      } catch(e){ S.wrapperErrors++; }

      /* ★どんなことがあっても下流を呼ぶ。ここが「挙動を変えない」の本体。 */
      var ret;
      try { S.downstreamCalls++; } catch(e){}
      ret = downstream.call(localStorage, k);

      try {
        S.postChecks++;
        var gone = (rawGet(key) == null);
        push({ at: nowFn(), key: key, path: p ? p.id : 'unknownPath',
               verdict: verdict ? verdict.verdict : 'error',
               why: verdict ? verdict.why : null, goneAfter: gone });
        /* 要求したキーが残っている = fix246 がキー名を書き換えた可能性(シナリオ2の観測点) */
        if (!gone) push({ at: nowFn(), key: key, path: p ? p.id : 'unknownPath', verdict: 'rewriteSuspect',
                          why: '要求キーが削除後も残存。fix246の書換の疑い', goneAfter: false });
      } catch(e){ S.wrapperErrors++; }
      return ret;
    };
    try { localStorage.removeItem = shadow; } catch(e){ return false; }
    S.installed = true; S.installCount++;
    try { S.isOutermost = (localStorage.removeItem === shadow); } catch(e){ S.isOutermost = null; }
    try { if (!off()) console.log(TAG, 'shadow armed (read-only, never denies)'); } catch(e){}
    return true;
  }

  /* 全既存ラッパの読込後に設置する。DOMContentLoaded → load → 保険のタイマ、の順で試みる。
     ★既に設置済みなら何もしない(installCount が2以上にならないこと自体が受け入れ条件)。 */
  function arm(){ try { install(); } catch(e){ S.wrapperErrors++; } }
  try {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm, { once:true });
    else setTimeout(arm, 0);
    window.addEventListener('load', arm, { once:true });
    setTimeout(arm, 3000);
  } catch(e){ setTimeout(arm, 0); }

  /* ================= canary（生存証明・3種） ===================================== */
  /* ★「異常0件」を信じないための装置。人工の既知ケースを通し、
     分類器とラッパが本当に生きていることを証明する。使い捨てキーのみを触る。 */
  function nonce(){ var s = ''; for (var i=0;i<8;i++){ s += 'abcdefghijklmnopqrstuvwxyz0123456789'.charAt((i*7+13)%36); } return s + '_' + nowFn(); }
  function selfTest(){
    var r = { ok:false, steps:[], armed:S.installed, isOutermost:S.isOutermost };
    if (!S.installed){ r.why = 'shadow 未設置'; return r; }
    var before = { req:S.requestedCalls, deny:S.wouldDeny, allow:S.wouldAllow,
                   pp:S.protectedProbeSeen, ap:S.allowedProbeSeen, rp:S.rewriteProbeSeen,
                   down:S.downstreamCalls, post:S.postChecks };
    var beforePath = S.byPath.fix569probe;
    var n = nonce();
    var kP = 'chr6_gc_probe_protected_' + n;
    var kA = 'chr6_gc_probe_allowed_' + n;
    var kR = 'chr6_gc_probe_rewrite_' + n;
    try {
      /* ① 保護canary: 「保護対象」に見せて削除要求を出す → wouldDeny が増え、かつ実際には消えること */
      localStorage.setItem(kP, 'probe');
      extraProtected[kP] = 'canary(保護対象として分類されるべき)';
      localStorage.removeItem(kP);
      r.steps.push({ name:'protected', denyDelta:S.wouldDeny-before.deny, seen:S.protectedProbeSeen-before.pp, gone:(rawGet(kP)==null) });
      /* ② 許可canary: 保護対象ではないキー → wouldAllow が増え、実際に消える */
      localStorage.setItem(kA, 'probe');
      localStorage.removeItem(kA);
      r.steps.push({ name:'allowed', allowDelta:S.wouldAllow-before.allow, seen:S.allowedProbeSeen-before.ap, gone:(rawGet(kA)==null) });
      /* ③ fix246 canary: 書換が起きるなら、要求キーと実際に消えたキーがずれる。
            fix246 の対象キーでない場合はずれない＝「ずれなかったこと」を記録する。 */
      localStorage.setItem(kR, 'probe');
      var ks0 = rawKeys();
      localStorage.removeItem(kR);
      var ks1 = rawKeys(), removed = [];
      var set1 = {}; ks1.forEach(function(x){ set1[x] = 1; });
      ks0.forEach(function(x){ if (!set1[x]) removed.push(x); });
      r.steps.push({ name:'fix246rewrite', seen:S.rewriteProbeSeen-before.rp,
                     requestedKey:kR, actualRemovedKeys:removed,
                     rewritten:(removed.length === 1 && removed[0] !== kR) });
      /* ④ 迂回canary: fix346/fix472 と同じく「捕捉済み参照」から直接消す。
            inner だけが増え outer は増えないこと＝**迂回を検出できる**ことの証明。 */
      var beforeInner = S.inner.calls, beforeOuter = S.requestedCalls;
      var kB = 'chr6_gc_probe_bypass_' + n;
      localStorage.setItem(kB, 'probe');
      if (innerShadow) innerShadow.call(localStorage, kB); else if (nativeRemove) nativeRemove.call(localStorage, kB);
      r.steps.push({ name:'bypass', innerDelta:S.inner.calls-beforeInner, outerDelta:S.requestedCalls-beforeOuter,
                     gone:(rawGet(kB)==null), detected:(S.inner.calls-beforeInner === 1 && S.requestedCalls-beforeOuter === 0) });
    } catch(e){ r.error = String(e && e.message || e).slice(0,80); }
    finally {
      try { delete extraProtected[kP]; } catch(e){}
      /* 後始末。canary が残らないように native で確実に消す。 */
      try { if (nativeRemove){ nativeRemove.call(localStorage, kP); nativeRemove.call(localStorage, kA); nativeRemove.call(localStorage, kR);
                               nativeRemove.call(localStorage, 'chr6_gc_probe_bypass_' + n); } } catch(e){}
    }
    r.deltas = { requested:S.requestedCalls-before.req, downstream:S.downstreamCalls-before.down, post:S.postChecks-before.post };
    var s0 = r.steps[0] || {}, s1 = r.steps[1] || {}, s2 = r.steps[2] || {}, s3 = r.steps[3] || {};
    r.classifierAvailable = !!protectedKeys(false);
    r.probePathDelta = S.byPath.fix569probe - beforePath;
    r.ok = (s0.denyDelta === 1 && s0.seen === 1 && s0.gone === true      /* 拒否しない＝実際に消える */
         && s1.allowDelta === 1 && s1.seen === 1 && s1.gone === true
         && s2.seen === 1
         && s3.detected === true && s3.gone === true
         && r.probePathDelta === 3
         && r.deltas.requested === 3 && r.deltas.downstream === 3 && r.deltas.post === 3);
    /* ★classifier が居ないと allow が unknown に落ちる。そのときは ok=false のまま
       「装置は生きているが分類器が不在」と区別できるようにする。 */
    if (!r.ok && !r.classifierAvailable) r.why = 'fix562(保護判定)が未ロード。ラッパは生きているが分類はできていない';
    return r;
  }

  /* ================= 読み出し ==================================================== */
  function stats(){
    var out = {};
    Object.keys(S).forEach(function(k){ out[k] = (k === 'byPath') ? JSON.parse(JSON.stringify(S.byPath)) : S[k]; });
    try { out.isOutermost = (localStorage.removeItem === shadow); } catch(e){ out.isOutermost = null; }
    out.protectedKnown = !!protectedKeys(false);
    out.ringSize = RING.length;
    /* ★「wouldDeny=0」を単独で報告しない。観測範囲を必ず添える。 */
    /* ★最外殻を迂回した削除の件数。fix346/fix472 のように読込時に参照を捕捉するコードがあるので、
       これが 0 でない前提で読む。0 でない＝その分だけ「保護判定を通っていない削除」がある。 */
    out.bypassedOuter = Math.max(0, S.inner.calls - S.requestedCalls);
    out.observedScope = {
      note: 'wouldDeny は「outerが観測できた経路・観測期間」の値。0でも無事故の証拠にはならない',
      innerCalls: S.inner.calls,
      outerCalls: S.requestedCalls,
      bypassedOuter: out.bypassedOuter,
      bypassNote: 'fix346/fix472 は読込時に removeItem 参照を捕捉するため、outer を迂回しうる(静的検査で確認済)',
      innerByFamily: JSON.parse(JSON.stringify(S.inner.byPath)),
      pathsSeen: Object.keys(S.byPath).filter(function(p){ return S.byPath[p] > 0; }),
      pathsNeverSeen: ['fix490Trim','fix490Quota','fix264b','fix399','fix402Doomed','fix402Retention','fix277']
                        .filter(function(p){ return !S.byPath[p]; })
    };
    return out;
  }

  window.__v292Dfix569 = {
    off: off,
    armed: function(){ return S.installed; },
    stats: stats,
    events: function(){ return RING.slice(); },
    selfTest: selfTest,
    install: arm,
    /* テスト専用の内部露出（本番コードからは使わない） */
    _classify: classify, _pathOf: pathOf, _protectedKeys: protectedKeys, _extraProtected: extraProtected,
    _inner: function(){ return innerShadow; },
    _native: function(){ return { remove: nativeRemove, get: nativeGet }; }
  };
  try { console.log(TAG, 'phase1 native=' + (!!nativeRemove) + ' protoPristine=' + protoPristineAtLoad + ' inner=' + S.inner.installed); } catch(e){}
})();
