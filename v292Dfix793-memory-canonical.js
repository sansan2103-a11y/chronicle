/* =====================================================================
 * v292Dfix793-memory-canonical.js
 *   Phase 3B-1 — QA story 限定 Canonical Memory write canary（client 側）
 * ---------------------------------------------------------------------
 * GPT 裁定（2026-09-01 深夜60）:
 *   ・Worker v40 = ACCEPT / 3B-1 QA story 限定 canary = GO。
 *   ・real OWNER story write = HOLD / Planner = HOLD / Retrieve = HOLD。
 *   ・★G1 ADOPT: memoryV1 対応 client は **canary 対象 story について memoryV1 を
 *     save 時に常に送る**（key を省略しない）。
 *   ・★追加 Invariant: memory state を **UNLOADED / LOADED_ABSENT / LOADED_VALUE**
 *     へ論理的に区別する。**UNLOADED から `memoryV1:null` を作って save しない**。
 *     UNLOADED なら server hydrate か materialize が終わるまで **canary save は
 *     fail-closed**。`null` は **明示 clear としてだけ**使う。
 *   ・★retry 禁止: `SCHEMA2_UNKNOWN_FIELD: memoryV1` を受けても
 *     **memoryV1 を payload から削って自動 retry してはいけない**（F-3 の silent drop を
 *     client 自身が起こすため）。memoryV1 incompatibility は **fail-closed**。
 *   ・保存するのは **ACTIVE と PENDING_REF だけ**。**EXCLUDED は保存しない**。
 *   ・保存しない debug: full promotionReason / full excludeReason / me1 dump /
 *     precision labels / shadow verdict dump。
 *   ・deterministic output を維持する。
 * ★fix798（GPT 裁定 3B-2 (b)・2026-09-02 / Rev2 裁定 同日）: canonical memory write の
 *   入口に boot recovery barrier gate を追加（fix745 の barrier() を **読むだけ**）。
 *   barrier が明示的に NOT_REQUIRED / RESOLVED でない限り local key も server も書かない。
 *   Rev2: materialize だけでなく **save payload に memoryV1 が載る経路**（既存 local key 由来の
 *   LOADED_VALUE / 明示 clear）も対象。その場合は memoryV1 を落として残りを保存するのではなく
 *   **save 全体を hold** する（silent loss class の禁止）。793 OFF / canary 外は従来どおり。
 *
 * ★DEPLOY != ENABLE。既定 OFF。load 時に localStorage を読まない・listener 0・timer 0。
 * opt-in : v292Dfix793On === '1'（既定 OFF）
 * kill   : v292Dfix793Off === '1'
 * canary : v292Dfix793Story === '<storyId>'（未設定なら CANARY_DEFAULT のみ）
 * ===================================================================== */
(function () {
  'use strict';
  /* ★fix905 / 905b（ME Owner gate）: production host では server 由来の owner gate だけが ON を決める。端末 On flag は QA host の override のみ。production host で gate が無い・壊れた・kill 時は OFF。 */
  function __f905Allow(localOn) { try { var G = window.__chrMeGate; if (G && typeof G.allow === 'function') return G.allow(!!localOn) === true; } catch (e905) {} var ph = true; try { ph = (String(location.hostname) === 'chronicle-app.pages.dev'); } catch (e905h) {} return ph ? false : !!localOn; }   /* ★fix905b: production host で gate が無い / 壊れた時は OFF（local flag へ fallback しない） */
  if (typeof window === 'undefined') return;
  if (window.__v292Dfix793) return;                 /* 二重install防止 */

  var BUILD = '20260914-fix798r2r3';
  var MEMORY_VERSION = 'cmem-1.0.0';
  var MEMORY_SCHEMA_VERSION = 1;
  var KEY_PREFIX = 'v292Dmem1_slot_';               /* ★story-scoped。global key を作らない */
  var CANARY_DEFAULT = 'smtg00ynsv1';               /* ★QA story 1本だけ */
  var MAX_BYTES = 262144;                           /* Worker v40 の cap と同じ */

  var STATE = { UNLOADED: 'UNLOADED', LOADED_ABSENT: 'LOADED_ABSENT', LOADED_VALUE: 'LOADED_VALUE' };
  var HOLD = {
    UNLOADED: 'MEMORY_UNLOADED_SAVE_BLOCKED',
    NOT_CANARY: 'NOT_CANARY_STORY',
    DISABLED: 'MEMORY_CANARY_DISABLED',
    TOO_LARGE: 'MEMORY_V1_TOO_LARGE',
    INCOMPATIBLE: 'MEMORY_V1_INCOMPATIBLE_FAIL_CLOSED'
  };

  function lsg(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lss(k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function keyFor(storyId) { return KEY_PREFIX + String(storyId); }
  function optedIn() { /* ★sp20 (RR-01 X-5 / 1.0 既定 OFF へ最小反転): 未設定 = OFF、'1' = 明示 ON、'0' = OFF。Off='1' / v292DmeOff='1' の最優先は不変。ge2 の story 既定（未設定 = 全 story）は不変。 */ return __f905Allow(lsg('v292Dfix793On') === '1'); }
  function off() { /* ★ge3 ME master kill: v292DmeOff='1' はこの module のどの gate よりも先に効く。 個別 flag は読みも書きも変えないので、master を外せば元の設定へそのまま戻る。 */ return lsg('v292DmeOff') === '1' || lsg('v292Dfix793Off') === '1'; }
  function armed() { return optedIn() && !off(); }
  function canaryStory() { var s = lsg('v292Dfix793Story'); return (s && String(s)) || CANARY_DEFAULT; }
  function storyScoped() { /* ★ge2: Story key 未設定 = 全 story。明示したときは従来どおり 1 本に絞る。 */ var s = lsg('v292Dfix793Story'); return !!(s && String(s)); }
  function isCanary(storyId) { if (!storyId) return false; if (!storyScoped()) return true; return String(storyId) === canaryStory(); }

  /* ==================================================================
   * memory state（★UNLOADED / LOADED_ABSENT / LOADED_VALUE）
   *   ・in-memory の cache は持つが、**authority は localStorage キー**。
   *   ・「読んでいない」と「読んだが無い」を必ず区別する。
   * ================================================================== */
  var _st = {};        /* storyId -> { state, value, source } */

  function stateOf(storyId) {
    var sid = String(storyId || '');
    if (!sid) return { state: STATE.UNLOADED, value: null, source: null };
    var c = _st[sid];
    return c ? c : { state: STATE.UNLOADED, value: null, source: null };
  }
  function setState(sid, state, value, source) {
    _st[String(sid)] = { state: state, value: (value === undefined ? null : value), source: source || null };
    return _st[String(sid)];
  }
  /* ★load: localStorage を1回だけ読んで UNLOADED を解消する。
     読めなければ **LOADED_ABSENT にしない**（UNLOADED のまま＝fail-closed）。 */
  function load(storyId) {
    var sid = String(storyId || '');
    if (!sid) return stateOf(sid);
    var raw;
    try { raw = window.localStorage.getItem(keyFor(sid)); }
    catch (e) { return setState(sid, STATE.UNLOADED, null, 'storage-throw'); }
    if (raw === null || raw === undefined) return setState(sid, STATE.LOADED_ABSENT, null, 'local-absent');
    var v = null;
    try { v = JSON.parse(raw); } catch (e) { return setState(sid, STATE.UNLOADED, null, 'parse-error'); }
    if (!validShape(v)) return setState(sid, STATE.UNLOADED, null, 'bad-shape');
    return setState(sid, STATE.LOADED_VALUE, v, 'local');
  }
  function validShape(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v)
        && Object.prototype.toString.call(v.records) === '[object Array]'
        && Object.prototype.toString.call(v.edges) === '[object Array]';
  }

  /* ★server hydrate: server record の memoryV1 を canonical source として採用する。
     **shadow DB が無くても server の memoryV1 を保持できる**（GPT 指定 D）。 */
  function hydrateFromServerRecord(storyId, record, opts) {
    var sid = String(storyId || '');
    if (!sid) return { ok: false, reason: 'no-story' };
    /* ■fix916（B1 ME_HYDRATE_MEMORYV1_INMEMORY_STALE）: opts.noWrite=true は fix705 の schema2 apply 専用。
       local key は fix705 が native に書いた後なので、ここでは **書かない**（network 0 / write 0 / markDirty 0）。
       key が server の値と一致することだけを確かめて in-memory state を server record に揃える。
       一致しなければ ok:false（呼び出し側が APPLY_PARTIAL で止める）。 */
    if (opts && opts.noWrite === true) {
      var sc916 = record && record.sidecar, k916 = keyFor(sid), cur916 = null;
      try { cur916 = Storage.prototype.getItem.call(window.localStorage, k916); } catch (e916) { return { ok: false, reason: 'key-read-failed' }; }
      if (!sc916 || !Object.prototype.hasOwnProperty.call(sc916, 'memoryV1')) {
        setState(sid, STATE.LOADED_ABSENT, null, 'server-absent-916');
        return { ok: true, state: STATE.LOADED_ABSENT, wrote: false };
      }
      var v916 = sc916.memoryV1;
      if (v916 === null) {
        if (cur916 !== null) return { ok: false, reason: 'key-not-removed' };
        setState(sid, STATE.LOADED_ABSENT, null, 'server-null-916');
        return { ok: true, state: STATE.LOADED_ABSENT, wrote: false };
      }
      if (!validShape(v916)) return { ok: false, reason: 'bad-shape' };
      if (cur916 !== JSON.stringify(v916)) return { ok: false, reason: 'key-mismatch' };
      setState(sid, STATE.LOADED_VALUE, v916, 'server-916');
      return { ok: true, state: STATE.LOADED_VALUE, wrote: false };
    }
    var sc = record && record.sidecar;
    if (!sc || !Object.prototype.hasOwnProperty.call(sc, 'memoryV1')) {
      /* server に無い＝「無いことが分かった」→ LOADED_ABSENT（UNLOADED ではない） */
      setState(sid, STATE.LOADED_ABSENT, null, 'server-absent');
      return { ok: true, state: STATE.LOADED_ABSENT, wrote: false };
    }
    var v = sc.memoryV1;
    if (v === null) { setState(sid, STATE.LOADED_ABSENT, null, 'server-null'); return { ok: true, state: STATE.LOADED_ABSENT, wrote: false }; }
    if (!validShape(v)) return { ok: false, reason: 'bad-shape' };
    var wrote = lss(keyFor(sid), JSON.stringify(v));
    setState(sid, STATE.LOADED_VALUE, v, 'server');
    return { ok: true, state: STATE.LOADED_VALUE, wrote: wrote };
  }

  /* ==================================================================
   * ★save gate（fix743 の buildSchema2Record から呼ばれる唯一の入口）
   *   返り値:
   *     { include:false }                     … canary 対象外 / 無効 → memoryV1 を **生やさない**
   *     { include:true, value:<obj|null> }    … 常に送る（G1）。null は明示 clear のときだけ
   *     { hold:'<code>' }                     … ★fail-closed（save させない）
   * ================================================================== */
  function saveGate(storyId) {
    var sid = String(storyId || '');
    if (!armed()) return { include: false, reason: HOLD.DISABLED };
    if (!isCanary(sid)) return { include: false, reason: HOLD.NOT_CANARY };   /* ★他 story には生やさない */
    /* ★fix798 Rev2: 明示 clear が pending の状態は「memoryV1:null が payload に載る」経路。
       clearGate 側が hold で include:false を返しても、ここを素通りさせると
       clear が黙って落ちたまま save が通ってしまうので同じく hold する。 */
    if (_clearPending[sid]) { var _hc = barrierHold(sid, 'clearGate'); if (_hc) return _hc; }
    var s = stateOf(sid);
    if (s.state === STATE.UNLOADED) {
      s = load(sid);                                    /* 1回だけ解消を試みる */
      if (s.state === STATE.UNLOADED) return { hold: HOLD.UNLOADED };  /* ★fail-closed */
    }
    if (s.state === STATE.LOADED_ABSENT) {
      /* ★UNLOADED ではないので「無い」と断定できる。だが **null を作って送らない**。
         明示 clear は clearExplicit() を通した場合だけ。 */
      return { include: false, reason: 'loaded-absent' };
    }
    if (!validShape(s.value)) return { hold: HOLD.UNLOADED };
    var bytes = byteLen(s.value);
    if (bytes > MAX_BYTES) return { hold: HOLD.TOO_LARGE, bytes: bytes };
    /* ★fix798 Rev2: ここから先で memoryV1 が payload に載る（既存 local key 由来の
       LOADED_VALUE も含む）。barrier が開いていなければ **save 全体を hold**。 */
    var _hs = barrierHold(sid, 'saveGate'); if (_hs) return _hs;
    return { include: true, value: s.value, bytes: bytes };
  }

  /* ★明示 clear。null は **ここを通ったときだけ** payload に載る。 */
  /* =====================================================================
   * ★★ME-R2/R3 CLEAR_LIFECYCLE（②C1 裁定 2026-09-14）
   *   問題: 旧 clearExplicit は in-memory state と _clearPending を立てるだけで
   *   local key を消さなかったため、**reload 1 回で memoryV1 が LOADED_VALUE へ戻り
   *   projection/hash へ復活**した（2026-09-14 実証。ME_CANARY_REVERSIBILITY = FAIL）。
   *   desired lifecycle:
   *     clearExplicit → clearGate が memoryV1:null を payload に載せる
   *     → **実 canonical save 成功を因果的に確認** → clearConsumed
   *     → clearConsumed の中で local key を削除 → _clearPending 解除
   *     → reload/hydrate しても復活しない
   *   絶対条件:
   *     ・server save 成功前に local key を消さない（失敗時は旧 memory を保持）
   *     ・「save を呼んだ直後」に clearConsumed を置かない。
   *       成功判定は **既存境界**＝fix697 の sanctioned confirm でだけ積まれる
   *       ledger `CANONICAL_COMMIT_OK{id, rev, noop}` を read-only で観測する。
   *     ・watermark は server 実 rev（単調増加）。clear 時点の最大 rev を超え、かつ
   *       noop でない commit が現れたときだけ成功とみなす（noop は内容不変＝我々の
   *       null を運んでいないので採らない＝fail-closed）。
   *     ・新しい永続 schema を作らない。_clearPending / watch は **in-memory のみ**。
   *     ・外部から info 無しで clearConsumed を呼んでも **purge しない**（旧契約を維持）。
   * ===================================================================== */
  var WATCH_INTERVAL_MS = 3000, WATCH_MAX_TICKS = 60;   /* 最大およそ 3 分で諦める */
  var _clearWatch = {}, _clearRing = [];

  function f697CommitsFor(sid) {
    try {
      var A = window.__v292Dfix697;
      if (!A || typeof A.ledger !== 'function') return [];
      var L = A.ledger() || [], out = [], i;
      for (i = 0; i < L.length; i++) {
        var r = L[i];
        if (r && r.kind === 'CANONICAL_COMMIT_OK' && String(r.id) === String(sid)) out.push(r);
      }
      return out;
    } catch (e) { return []; }
  }
  function maxCommitRev(sid) {
    var c = f697CommitsFor(sid), m = -1, i;
    for (i = 0; i < c.length; i++) if (typeof c[i].rev === 'number' && c[i].rev > m) m = c[i].rev;
    return m;
  }
  function watchTick(sid) {
    try {
      var w = _clearWatch[sid];
      if (!w || w.done) return;
      /* ★★安全条件（acceptance M-24 で捕捉した実欠陥の修正）:
         clearGate が **実際に memoryV1:null を payload へ載せた** あとでなければ、
         どんな CANONICAL_COMMIT_OK も「我々の clear が着地した証拠」ではない。
         barrier hold 等で clear が送られていないのに、無関係な save の commit を
         根拠に local key を消すと **server には旧 memory が残ったまま local だけ消える**
         ＝データ損失になる。emit 前は観測を続けるだけで purge しない。 */
      if (!w.emitted) {
        if (++w.ticks >= WATCH_MAX_TICKS) { w.done = true; w.expired = true; return; }
        setTimeout(function () { watchTick(sid); }, WATCH_INTERVAL_MS);
        return;
      }
      var c = f697CommitsFor(sid), i;
      for (i = 0; i < c.length; i++) {
        var r = c[i];
        /* watermark は **emit 時点**の最大 rev。clear 要求時点ではない。 */
        if (typeof r.rev === 'number' && r.rev > w.emitRev && r.noop !== true) {
          clearConsumed(sid, { via: 'canonical-commit-ok', rev: r.rev });
          return;
        }
      }
      if (++w.ticks >= WATCH_MAX_TICKS) { w.done = true; w.expired = true; return; }
      setTimeout(function () { watchTick(sid); }, WATCH_INTERVAL_MS);
    } catch (e) {}
  }

  function clearExplicit(storyId) {
    var sid = String(storyId || '');
    if (!armed() || !isCanary(sid)) return { ok: false, reason: HOLD.NOT_CANARY };
    setState(sid, STATE.LOADED_ABSENT, null, 'explicit-clear');
    _clearPending[sid] = 1;
    var base = maxCommitRev(sid);
    _clearWatch[sid] = { baseRev: base, emitRev: null, emitted: false, emittedAt: null,
                         at: Date.now(), ticks: 0, done: false,
                         expired: false, purged: false, confirmedRev: null, err: null };
    try { setTimeout(function () { watchTick(sid); }, WATCH_INTERVAL_MS); } catch (e) {}
    return { ok: true, baseRev: base, watching: true };
  }
  var _clearPending = {};
  /* clear を1回だけ payload に載せるための gate（clear 後の通常 save は include:false へ戻る） */
  function clearGate(storyId) {
    var sid = String(storyId || '');
    if (!_clearPending[sid]) return { include: false };
    /* ★fix798 Rev2: 明示 clear（memoryV1:null）も canonical write。barrier gate 対象。 */
    var _h = barrierHold(sid, 'clearGate'); if (_h) return _h;
    /* ★★ME-R2/R3: ここを通った瞬間だけが「null を payload に載せた」事実。
       watcher の watermark をこの時点の最大 rev へ再アンカーする。 */
    var w = _clearWatch[sid];
    if (w && !w.emitted) { w.emitted = true; w.emittedAt = Date.now(); w.emitRev = maxCommitRev(sid); }
    return { include: true, value: null, explicitClear: true };
  }
  /* ★ME-R2/R3: **実 canonical save 成功が確認できたときだけ** local key を消す。
     info が無い / via が違う呼び出しでは purge しない（旧契約のまま pending を下ろすだけ）。
     removeItem は fix402/fix781/fix706 の write-hold に阻まれ得るので、**消えたことを
     読み直して確認**し、消えていなければ purged:false と理由を残す（嘘をつかない）。 */
  function clearConsumed(storyId, info) {
    var sid = String(storyId || '');
    var w = _clearWatch[sid] || null;
    var confirmed = !!(info && info.via === 'canonical-commit-ok' && typeof info.rev === 'number');
    /* ★★emit していない clear は、どんな commit 証拠があっても purge しない。 */
    if (confirmed && !(w && w.emitted)) { confirmed = false; }
    var purged = false, err = null;
    if (confirmed && armed() && isCanary(sid)) {
      try {
        window.localStorage.removeItem(keyFor(sid));
        var still = null;
        try { still = window.localStorage.getItem(keyFor(sid)); } catch (e2) { still = '__READ_FAILED__'; }
        if (still === null) purged = true;
        else { err = (still === '__READ_FAILED__') ? 'VERIFY_READ_FAILED' : 'REMOVE_BLOCKED'; }
      } catch (e) { err = 'REMOVE_THREW:' + String(e && e.message || e); }
    } else if (!confirmed) {
      err = 'NOT_CONFIRMED_NO_PURGE';
    }
    delete _clearPending[sid];
    if (w) { w.done = true; w.purged = purged; w.confirmedRev = confirmed ? info.rev : null; w.err = err; }
    if (purged) setState(sid, STATE.LOADED_ABSENT, null, 'explicit-clear-purged');
    _clearRing.push({ sid: sid, confirmed: confirmed, purged: purged,
                      rev: (confirmed ? info.rev : null), err: err, at: Date.now() });
    if (_clearRing.length > 20) _clearRing.shift();
    return { ok: true, confirmed: confirmed, purged: purged, error: err };
  }

  /* ★retry 禁止。unknown-field を受けたときに **必ず** fail-closed を返す。
     この関数は payload を書き換えない（strip する口を持たない）。 */
  function onUnknownFieldError(errorCode, field) {
    return { retry: false, stripped: false, hold: HOLD.INCOMPATIBLE,
             note: 'memoryV1 を payload から削って retry してはいけない（F-3 silent drop を client 自身が起こす）',
             errorCode: errorCode || null, field: field || null };
  }

  function byteLen(v) {
    try { return new TextEncoder().encode(JSON.stringify(v)).length; }
    catch (e) { try { return JSON.stringify(v).length; } catch (e2) { return -1; } }
  }

  /* ==================================================================
   * materializer（3B-0 の canonical_memory_v1.cjs と同じ規則）
   *   ・保存するのは ACTIVE / PENDING_REF だけ。EXCLUDED は **保存しない**。
   *   ・full promotionReason / full excludeReason / me1 dump / precision labels /
   *     shadow verdict dump は **入れない**（pendingReasonCode だけ残す）。
   *   ・deterministic（乱数・時刻を使わない）。
   * ================================================================== */
  var LIFECYCLE = { ACTIVE: 'ACTIVE', PENDING: 'PENDING_REF' };
  var AUTHORITY = 'HISTORY_ONLY';

  /* ■fix918 SPEECH_PRECISION_GATE（GPT 裁定 2026-09-29 E1 / E2 / ME-7c）
     ・誤った ACTIVE を作らない「精度の門」。raw / fix670 / EXTRACTOR_VERSION は触らない。記録は消さず PENDING_REF に倒すだけ。
     ・**唯一の判定関数**（precisionReason918）。fix793 の materialize（criticalRefsOf）と fix796 の wire index が**同じ関数**を使う。
       kill: localStorage v292Dfix918Off='1' → 両方とも従来（片側だけ効く状態は作らない）。
     ・入力は record と同じ語彙: type（= lineage kind: PROHIBITION / COMMITMENT / DISCLOSURE_CLAIM / …）と normalizedProposition。
     E1（type==='PROHIBITION' だけ）: 禁止ではない「〜な」「〜ちゃならん」を除く（実データで作った狭い規則。一般化しない）。
       R1a 進行・状態  (かな|見来寝出居着似煮干射)(て|で)(い|お)?る＋な(よ)?＋文末   … 腫れてるな / 知ってるな / 見てるな / 手を入れておるな
       R1b 方言の進行  (っ|し|ん|ち)(と|ど)る＋な / ちょるな                        … 持っとるな / 顔をしとるな
       R1c 存在        (いる|ある|おる)＋な(よ)?＋文末                               … 誰かいるな / 来たことがあるな / おるな
       R2  義務        な(く|け)(ちゃ|じゃ)(なら|いけ|だめ)                          … 行かなくちゃならん
       R3  連体        (て|で|ちゃ|じゃ)は?(なら|いけ)(ない|ぬ|ん|ねえ) の直後が 漢字・カナ・もの・こと・ところ・とき … いけない火 / 見てはいけないもの
       R4  引用・報告  (な|ならん|いけない|くれ|ください…)＋(と|って)＋(言|止|叫|告|命|頼|書|怒鳴|教) … 行くな と止められなかった / ならんと言うた
     E2（全 speech kind）: 疑問符の無い疑問（なぜ / なんで / どうして / どの / どういう、または 何 / 誰 / どこ / いつ / どう / どれ の疑問用法）。
       不定・否定の用法（何も / 何か / どこか / どころ / いつも / どうか / 誰にも / どこにも / なぜか / どうしても …）は除く。
       ■fix919(ac20) 訂正: 指示詞の「あいつ / こいつ / そいつ / どいつ」と「〜などの」は WH 語ではない（ac19 で PENDING に倒れていた safe miss）。埋め込み疑問が PENDING になるのは許容（safe miss）。
     ME-7c（type が COMMITMENT / DISCLOSURE_CLAIM）: marker を cut した残りが助詞止め（の / に / と / から / へ / を / で）で述語が無い → PENDING。 */
  var F918_RULE_REV = '918';
  var P918 = {
    R1a: /(?:[ぁ-ん]|[見来寝出居着似煮干射])[てで](?:い|お)?るな(?:よ)?(?=[。！？!?…」』\s]|$)/,
    R1b: /(?:[っしんち][とど]|ちょ)るな(?:よ)?(?=[。！？!?…」』\s]|$)/,
    R1c: /(?:いる|ある|おる)な(?:よ)?(?=[。！？!?…」』\s]|$)/,
    R2:  /な(?:く|け)(?:ちゃ|じゃ)(?:なら|いけ|だめ|ダメ)/,
    R3:  /(?:て|で|ちゃ|じゃ)は?(?:なら|いけ)(?:ない|ぬ|ん|ねえ|ねぇ)(?=[一-龠々ァ-ヶ]|もの|こと|ところ|とき|\s*[一-龠々ァ-ヶ])/,
    R4:  /(?:な|なよ|ならん|ならない|ならねえ|いけない|いけねえ|だめ|ダメ|くれ|ください)\s*(?:と|って)\s*(?:言|い[うっわ]|止|叫|告|命|頼|書|怒鳴|教)/,
    WHQ: /(?:なぜ(?!か)|なんで(?!も)|どうして(?!も)|(?<!な)どの|どういう|どいつ(?![かも])|どこ(?![かもろ]|(?:に|で|と|から|へ|まで)?(?:でも|も|か))|誰(?![かも]|(?:に|で|と|から|へ|まで)?(?:でも|も|か))|何(?![かもとで度]|(?:に|で|と|から|へ|まで)?(?:でも|も|か))|(?<![あこそど])いつ(?![かもの]|(?:に|で|と|から|へ|まで)?(?:でも|も|か))|どう(?![かもぞやらせ]|しても)|どれ(?![かも]|(?:に|で|と|から|へ|まで)?(?:でも|も|か)))/,
    NOPRED: /(?:の|に|と|から|へ|を|で)$/
  };
  function f918Off() { return lsg('v292Dfix918Off') === '1'; }
  var _f918 = { evals: 0, hits: {}, last: null };
  function precisionReason918(type, np) {
    if (f918Off()) return null;
    var p = String(np == null ? '' : np).replace(/[…‥]+/g, '');
    if (!p) return null;
    var t = String(type || ''), why = null;
    if (t === 'PROHIBITION' && (P918.R1a.test(p) || P918.R1b.test(p) || P918.R1c.test(p)
                                 || P918.R2.test(p) || P918.R3.test(p) || P918.R4.test(p))) why = 'prohibition-not-directive';
    else if (P918.WHQ.test(p)) why = 'speech-question-no-qmark';
    else if ((t === 'COMMITMENT' || t === 'DISCLOSURE_CLAIM')
             && P918.NOPRED.test(p.replace(/[\s　、。，,．.！!？?」』]+$/, ''))) why = 'proposition-no-predicate';
    _f918.evals++;
    if (why) { _f918.hits[why] = (_f918.hits[why] || 0) + 1; _f918.last = { type: t, reason: why }; }
    return why;
  }
  function f915Off793() { try { return window.localStorage.getItem('v292Dfix915Off') === '1'; } catch (e) { return false; } }
  function criticalRefsOf(lin, rawById, resByLineage) {
    var refs = [], res = resByLineage[lin.lineageId] || [], i, k;
    function findRes(kind, role) {
      for (var j = 0; j < res.length; j++) if (res[j].slotKind === kind && res[j].role === role) return res[j];
      return null;
    }
    if (lin.lineageClass === 'dialogue_claim') {
      var sp = findRes('speaker', 'speaker');
      /* ★fix795(3B-2 real-data admission gate・GPT裁定 2026-09-02): critical speaker が
         `char_candidate:*`（4C でまだ canonical roster/entity へ昇格していない candidate-tier）
         のときは **canonical resolved と扱わない** → resolutionStatus=UNRESOLVED /
         pendingReasonCode='candidate-entity-not-canonical' → その record は PENDING_REF へ倒れる。
         entityId は provenance として残す。canonical speaker と「未 speaker」の挙動は不変。
         新 schema / Entity Registry / candidate promotion / 4C は一切変更しない。 */
      var _spk0 = lin.speakerEntityId;
      var _spkCand = !!(_spk0 && String(_spk0).indexOf('char_candidate:') === 0);
      refs.push({ role: 'speaker',
        entityId: lin.speakerEntityId || (sp && sp.resolvedEntityId) || null,
        resolutionStatus: (_spk0 && !_spkCand) ? 'RESOLVED_EXISTING' : (_spkCand ? 'UNRESOLVED' : (sp ? sp.status : 'UNRESOLVED')),
        pendingReasonCode: (_spk0 && !_spkCand) ? null : (_spkCand ? 'candidate-entity-not-canonical' : (sp ? sp.reason : 'speaker-not-structured')) });
      /* ■fix915（ME-6 speech provenance の最低限の門）: 直接の <say who> 由来でない話者は ACTIVE にしない（PENDING_REF）。
         speakerProvenance が null（fix915 以前の raw・kill 時）も直接とは扱わない。
         ・命題が空に近い断片（「よ」など、句読点・空白を除いて 4 文字未満）も ACTIVE にしない。
         kill: v292Dfix915Off='1' → 従来。 */
      if (!f915Off793()) {
        if (lin.speakerProvenance !== 'direct' && refs.length && refs[0].resolutionStatus === 'RESOLVED_EXISTING') {
          refs[0] = { role: 'speaker', entityId: refs[0].entityId, resolutionStatus: 'UNRESOLVED',
                      pendingReasonCode: 'speaker-provenance-weak' };
        }
        var np915 = String(lin.normalizedProposition || '').replace(/[\s\u3000、。，．,.！!？?…‥・「」『』（）()“”"'〜~ー―—-]+/g, '');
        if (np915.length < 4) refs.push({ role: 'proposition', entityId: null, resolutionStatus: 'UNRESOLVED',
                                          pendingReasonCode: 'proposition-too-short' });
      }
      /* ■fix918: 精度の門（kill: v292Dfix918Off）。当たれば PENDING_REF（記録は残す）。 */
      var pr918 = precisionReason918(lin.kind, lin.normalizedProposition);
      if (pr918 && !refs.some(function (x) { return x && x.role === 'proposition'; })) refs.push({ role: 'proposition', entityId: null, resolutionStatus: 'UNRESOLVED',
                             pendingReasonCode: pr918 });
      if (lin.kind === 'NEGATION_CLAIM') {
        var tp = findRes('claim_topic', 'topic');
        if (tp) refs.push({ role: 'topic', entityId: tp.resolvedEntityId || null,
          resolutionStatus: tp.status, pendingReasonCode: tp.reason || null,
          surfaceForm: tp.surface || null });
      }
      return refs;
    }
    var members = lin.memberEventIds || [], seen = {};
    for (i = 0; i < members.length; i++) {
      var e = rawById[members[i]]; if (!e) continue;
      var ma = e.missingArguments || [];
      for (k = 0; k < ma.length; k++) {
        var role = ma[k].role;
        if (role === 'speaker' || seen[role]) continue;
        seen[role] = 1;
        var r = findRes('argument', role);
        refs.push({ role: role, entityId: r ? r.resolvedEntityId : null,
          resolutionStatus: r ? r.status : 'UNRESOLVED',
          pendingReasonCode: r ? r.reason : (ma[k].reason || 'missing-argument') });
      }
    }
    var anyStructured = false;
    for (i = 0; i < members.length; i++) {
      var e2 = rawById[members[i]];
      if (e2 && (e2.subjectId || e2.objectId)) { anyStructured = true; break; }
    }
    if (!anyStructured && !refs.length) {
      refs.push({ role: 'subject', entityId: null, resolutionStatus: 'UNRESOLVED',
                  pendingReasonCode: 'no-structured-target-in-record' });
    }
    return refs;
  }

  function materializeFrom(input) {
    var lineages = input.lineages || [], events = input.events || [],
        relations = input.relations || [], resolutions = input.resolutions || [],
        storyId = input.storyId || null;
    var rawById = {}, i;
    for (i = 0; i < events.length; i++) rawById[events[i].eventId] = events[i];
    var resByLineage = {};
    for (i = 0; i < resolutions.length; i++) {
      var rr = resolutions[i];
      (resByLineage[rr.lineageId] = resByLineage[rr.lineageId] || []).push(rr);
    }
    var records = [], byMemoryId = {};
    for (i = 0; i < lineages.length; i++) {
      var lin = lineages[i];
      var refs = criticalRefsOf(lin, rawById, resByLineage);
      var unresolved = refs.filter(function (r) {
        return r.resolutionStatus !== 'RESOLVED_EXISTING' || !r.entityId; });
      var members = (lin.memberEventIds || []).map(function (x) { return rawById[x]; })
        .filter(function (x) { return !!x; });
      var first = members[0] || {};
      var knownTo = [];
      for (var m = 0; m < members.length; m++) {
        var e = members[m];
        var k = e.knownTo || (e.payload && e.payload.knownTo) || null;
        if (!k) continue;
        var list = (Object.prototype.toString.call(k) === '[object Array]') ? k : Object.keys(k);
        knownTo.push({ eventId: e.eventId, entries: list.slice() });   /* ★union しない */
      }
      var turns = lin.sourceTurns || [0];
      var rec = {
        schemaVersion: MEMORY_SCHEMA_VERSION,
        materializerVersion: MEMORY_VERSION,
        memoryId: 'cmem:' + lin.lineageId,
        storyId: storyId,
        lineageClass: lin.lineageClass,
        family: lin.family || null,
        type: lin.kind || null,
        epistemic: first.epistemic || null,
        normalizedProposition: lin.normalizedProposition || null,
        refs: refs,
        source: { firstTurn: Math.min.apply(null, turns), lastTurn: Math.max.apply(null, turns),
                  sourceModes: (lin.sourceModes || []).slice(),
                  speakerEntityId: lin.speakerEntityId || null },
        knowledge: { knownTo: knownTo },
        lifecycle: unresolved.length ? LIFECYCLE.PENDING : LIFECYCLE.ACTIVE,
        authority: AUTHORITY,
        provenance: { attestations: lin.attestationCount || members.length,
                      mergeRule: lin.mergeRule || null,
                      extractorVersion: first.extractorVersion || null,
                      dedupeVersion: lin.dedupeVersion || null },
        relationRefs: []
      };
      /* ★full promotionReason / full excludeReason は保存しない。
         PENDING の理由は ref ごとの pendingReasonCode だけで説明できる。 */
      records.push(rec); byMemoryId[rec.memoryId] = rec;
    }
    var edges = [];
    for (i = 0; i < relations.length; i++) {
      var rel = relations[i];
      /* ★fix793-A(3B-1 canary 実測で検出): fix791 が chr6rel へ保存する実レコードの
         endpoint フィールドは **fromLineageId / toLineageId**。`from` / `to` だけを
         読んでいたため live で edges が 0 になっていた（QA 成果物では正規化済みの
         `from`/`to` を渡していたので fixture では露見しなかった）。
         **両方の綴りを受ける**。どちらも無ければその relation は edge にしない。 */
      var relFrom = (rel.fromLineageId != null) ? rel.fromLineageId : rel.from;
      var relTo   = (rel.toLineageId   != null) ? rel.toLineageId   : rel.to;
      if (relFrom == null || relTo == null) continue;
      var fromId = 'cmem:' + relFrom, toId = 'cmem:' + relTo;
      if (!byMemoryId[fromId] || !byMemoryId[toId]) continue;   /* endpoint 不在なら作らない */
      edges.push({ relationId: rel.relationId, kind: rel.kind, from: fromId, to: toId,
                   basis: rel.basis, resolvesTruth: false, winner: null, knownToUnion: false });
      byMemoryId[fromId].relationRefs.push(rel.relationId);
      byMemoryId[toId].relationRefs.push(rel.relationId);
      /* ★relation は ACTIVE 昇格を強制しない（lifecycle に触れない） */
    }
    var out918 = { schemaVersion: MEMORY_SCHEMA_VERSION, materializerVersion: MEMORY_VERSION,
             records: records, edges: edges };
    /* ■fix918: provenance だけ（candCanon = records / edges には入らない・fire の契機にもしない）。kill 時は付けない（従来と同じ）。 */
    if (!f918Off()) out918.materializerRuleRev = F918_RULE_REV;
    return out918;
  }

  /* ==================================================================
   * ★fix798（GPT 裁定 3B-2 (b)・2026-09-02）: boot recovery barrier gate
   *   観測 bug: fix745 barrier = PENDING（stale MAT journal）で fix748 が
   *   TURN_BUILD を hold している最中に materialize() → local key 書込 →
   *   製品 save（docRev.source = INVALIDATED:sideportA:putcanonical）が成立した。
   *   memory sidecar でも canonical write（rev/hash mutation）なので barrier を通す。
   *   ・fix745 の public API `__v292DfixGWS.barrier()` を **読むだけ**。
   *     fix745 / fix748 は変更しない。新 authority / recovery framework も作らない。
   *   ・ALLOW は fix745 が NOT_REQUIRED / RESOLVED を **明示的に**返したときだけ。
   *     PENDING / DUAL_RECOVERY_CONFLICT_HOLD / API 未 load / throw / 判定不能 は
   *     すべて **fail-closed**（local key も server も書かない）。
   *   ・観測は memory-only ring（localStorage 0・listener 0・timer 0）。
   * ================================================================== */
  var BARRIER_HOLD = 'BOOT_RECOVERY_BARRIER_PENDING';
  var GATE_RING_MAX = 20;
  var _gateRing = [], _gateBlocked = 0;
  function barrierStateNow() {
    var g;
    try { g = window.__v292DfixGWS; } catch (e) { return 'API_UNAVAILABLE'; }
    if (!g || typeof g.barrier !== 'function') return 'API_UNAVAILABLE';
    var s; try { s = g.barrier(); } catch (e) { return 'API_THREW'; }
    return (s == null) ? 'API_UNAVAILABLE' : String(s);
  }
  function barrierWriteAllowed(s) { return s === 'NOT_REQUIRED' || s === 'RESOLVED'; }
  function noteGateBlock(sid, s, where) {
    _gateBlocked++;
    _gateRing.push({ storyId: sid, state: s, reason: BARRIER_HOLD, where: where || '?', n: _gateBlocked });
    if (_gateRing.length > GATE_RING_MAX) _gateRing.shift();
  }
  /* ★fix798 Rev2: barrier が開いていなければ hold object を返す（開いていれば null）。
     **判定はこの 1 関数だけ**。呼び出しは canonical memory write が起きる直前の 4 経路のみ:
       materialize（local key 書込）/ saveGate（payload に value が載る）/
       saveGate の pending clear / clearGate（payload に null が載る）。
     ★hold は fix743 buildSchema2Record の既存 return（BUILD_SCHEMA2_HOLD）に載り、
       **save 全体が止まる**。memoryV1 だけ落として残りを保存する経路は作らない
       （silent loss class の禁止・GPT 裁定 Rev2）。 */
  function barrierHold(sid, where) {
    var s = barrierStateNow();
    if (barrierWriteAllowed(s)) return null;
    noteGateBlock(sid, s, where);
    return { hold: BARRIER_HOLD, barrier: s };
  }

  /* shadow 5層（readonly）から materialize して local key へ書く。 */
  function readAll(dbName, store, slotId) {
    return new Promise(function (res, rej) {
      var q; try { q = window.indexedDB.open(dbName); } catch (e) { return rej(e); }
      q.onupgradeneeded = function () { try { q.transaction.abort(); } catch (e) {} };
      q.onsuccess = function () {
        var db = q.result;
        if (!db.objectStoreNames.contains(store)) { db.close(); return res([]); }
        var g = db.transaction([store], 'readonly').objectStore(store).getAll();
        g.onsuccess = function () {
          var rows = (g.result || []).filter(function (r) { return !slotId || r.slotId === slotId; });
          db.close(); res(rows);
        };
        g.onerror = function () { db.close(); rej(g.error); };
      };
      q.onerror = function () { rej(q.error); };
    });
  }
  /* ★fix904: materialize 境界の candidate 検査（read-only・書込 0） */
  var REJECT904 = { OVERSIZE: 'REJECTED_OVERSIZE', INVALID: 'REJECTED_INVALID' };
  var _rej904 = {};          /* sid -> 最新の reject（in-memory のみ・永続化しない） */
  var _rej904Ring = [];      /* 直近 20 件 */
  function f904Off() { return lsg('v292Dfix904Off') === '1'; }
  function invalidReason904(v, sid) {
    if (!validShape(v)) return 'bad-shape';
    var seen = {}, i, r;
    for (i = 0; i < v.records.length; i++) {
      r = v.records[i];
      if (!r || typeof r !== 'object' || Array.isArray(r)) return 'record-not-object';
      if (typeof r.memoryId !== 'string' || r.memoryId.length < 6 || r.memoryId.indexOf('cmem:') !== 0) return 'bad-memoryId';
      if (seen[r.memoryId]) return 'duplicate-memoryId';
      seen[r.memoryId] = 1;
      if (String(r.storyId) !== String(sid)) return 'storyId-mismatch';
      if (r.lifecycle !== LIFECYCLE.ACTIVE && r.lifecycle !== LIFECYCLE.PENDING) return 'bad-lifecycle';
      if (Object.prototype.toString.call(r.refs) !== '[object Array]') return 'bad-refs';
      if (!r.source || !isFinite(r.source.firstTurn) || !isFinite(r.source.lastTurn)) return 'bad-source-turn';
    }
    for (i = 0; i < v.edges.length; i++) {
      if (!v.edges[i] || typeof v.edges[i] !== 'object' || Array.isArray(v.edges[i])) return 'edge-not-object';
    }
    return null;
  }
  function reject904(sid, code, bytes, detail) {
    var prev = _rej904[sid];
    var e = { sid: sid, code: code, bytes: bytes, detail: detail || null, at: Date.now(),
              count: (prev && prev.code === code) ? (prev.count + 1) : 1,
              keptState: stateOf(sid).state };
    _rej904[sid] = e;
    _rej904Ring.push(e); if (_rej904Ring.length > 20) _rej904Ring.shift();
    return { ok: false, reason: code, bytes: bytes, detail: detail || null, wrote: 0, rejected: true };
  }
  function materialize(storyId) {
    var sid = String(storyId || '');
    if (!armed()) return Promise.resolve({ ok: false, reason: HOLD.DISABLED });
    if (!isCanary(sid)) return Promise.resolve({ ok: false, reason: HOLD.NOT_CANARY });
    var me = window.__v292Dfix670;
    if (!me || typeof me.events !== 'function') return Promise.resolve({ ok: false, reason: 'no-extractor' });
    return Promise.all([
      readAll('chr6lin', 'lineages', sid),
      (window.__v292Dfix801 ? window.__v292Dfix801.eventsForStory(sid) : me.events(Infinity)),   /* ★fix801: story-scoped adapter（fallback = fix670 正式契約 events(Infinity)=全件） */
      readAll('chr6rel', 'relations', sid),
      readAll('chr6ref', 'resolutions', sid)
    ]).then(function (a) {
      /* ★fix798: canonical write 入口（この下は local key 書込 → LOADED_VALUE →
         saveGate include:true → 製品 save → server canonical write が繋がる）。
         shadow 5層は readonly なのでここが **書込直前の最終同期点**。
         barrier が明示的に開いていなければ何も書かずに返す（fail-closed）。 */
      var _hm = barrierHold(sid, 'materialize');
      if (_hm) return { ok: false, reason: BARRIER_HOLD, barrier: _hm.barrier, wrote: 0 };
      var v = materializeFrom({ storyId: sid, lineages: a[0], events: a[1],
                                relations: a[2], resolutions: a[3] });
      var bytes = byteLen(v);
      /* ★fix904(ME-2b / GPT 裁定 2026-09-28 第三案): materialize 境界で invalid / oversize の
         candidate を REJECT する。v292Dmem1_slot_ へは書かない・in-memory state（last-known-good）も
         変えない・canonical projection / saveGate は不変。理由と bytes は in-memory の status にだけ残す。
         kill: v292Dfix904Off='1' → 従来（oversize は TOO_LARGE で書かない・invalid 検査なし）。 */
      if (!f904Off()) {
        var _inv = (bytes < 0) ? 'serialize-failed' : invalidReason904(v, sid);
        if (_inv) return reject904(sid, REJECT904.INVALID, bytes, _inv);
        if (bytes > MAX_BYTES) return reject904(sid, REJECT904.OVERSIZE, bytes, null);
      }
      if (bytes > MAX_BYTES) { setState(sid, stateOf(sid).state, stateOf(sid).value, 'too-large');
        return { ok: false, reason: HOLD.TOO_LARGE, bytes: bytes }; }
      var wrote = lss(keyFor(sid), JSON.stringify(v));
      if (!f904Off()) { try { delete _rej904[sid]; } catch (e904c) {} }
      setState(sid, STATE.LOADED_VALUE, v, 'materialize');
      var counts = { records: v.records.length, edges: v.edges.length, ACTIVE: 0, PENDING_REF: 0 };
      for (var i = 0; i < v.records.length; i++) counts[v.records[i].lifecycle]++;
      return { ok: true, wrote: wrote, bytes: bytes, counts: counts };
    });
  }

  window.__v292Dfix793 = {
    __loaded: true, build_: BUILD, WIRED: false, ENABLED_BY_DEFAULT: false,
    memoryVersion: MEMORY_VERSION, keyPrefix: KEY_PREFIX,
    status: function () {
      var sid = canaryStory();
      return { build: BUILD, on: optedIn(), off: off(), active: armed(),
               canaryStory: sid, memoryVersion: MEMORY_VERSION, maxBytes: MAX_BYTES,
               state: stateOf(sid).state, source: stateOf(sid).source,
               barrierGate: { state: barrierStateNow(), blocked: _gateBlocked,
                              where: (function(){ var o={}, i; for (i=0;i<_gateRing.length;i++) o[_gateRing[i].where]=(o[_gateRing[i].where]||0)+1; return o; })() },
               states: [STATE.UNLOADED, STATE.LOADED_ABSENT, STATE.LOADED_VALUE],
               note: 'UNLOADED からは save しない（fail-closed） / null は明示 clear だけ / '
                   + 'unknown-field で strip retry しない / 他 story には memoryV1 を生やさない' };
    },
    STATE: STATE, HOLD: HOLD,
    keyFor: keyFor, isCanary: isCanary, canaryStory: canaryStory,
    stateOf: stateOf, load: load,
    hydrateFromServerRecord: hydrateFromServerRecord,
    saveGate: saveGate, clearExplicit: clearExplicit, clearGate: clearGate, clearConsumed: clearConsumed,
    /* ★ME-R2/R3 観測口（read-only・write 0） */
    clearStatus: function (storyId) {
      var sid = String(storyId || canaryStory());
      var w = _clearWatch[sid] || null;
      return { sid: sid, pending: !!_clearPending[sid],
               watch: w ? { baseRev: w.baseRev, emitted: !!w.emitted, emitRev: w.emitRev,
                            ticks: w.ticks, done: !!w.done, expired: !!w.expired,
                            purged: !!w.purged, confirmedRev: w.confirmedRev, err: w.err } : null,
               keyPresent: (function () { try { return window.localStorage.getItem(keyFor(sid)) !== null; } catch (e) { return 'ERR'; } })(),
               watchIntervalMs: WATCH_INTERVAL_MS, watchMaxTicks: WATCH_MAX_TICKS };
    },
    clearRing: function () { return _clearRing.slice(); },
    onUnknownFieldError: onUnknownFieldError,
    materialize: materialize, byteLen: byteLen,
    /* ★fix904 観測口（read-only） */
    rejectStatus: function (storyId) { var sid = String(storyId || ''); var e = _rej904[sid];
      return { sid: sid, off: f904Off(), last: e ? JSON.parse(JSON.stringify(e)) : null, maxBytes: MAX_BYTES }; },
    rejectRing: function () { return JSON.parse(JSON.stringify(_rej904Ring)); },
    REJECT904: REJECT904,
    /* ■fix918 共有判定（fix796 の wire index もこれだけを使う）＋観測口（read-only） */
    f918: { reason: precisionReason918, off: f918Off, RULE_REV: F918_RULE_REV,
            status: function () { return { off: f918Off(), ruleRev: F918_RULE_REV, evals: _f918.evals,
                                           hits: JSON.parse(JSON.stringify(_f918.hits)), last: _f918.last }; } },
    __test: { materializeFrom: materializeFrom, criticalRefsOf: criticalRefsOf,
              validShape: validShape, setState: setState, LIFECYCLE: LIFECYCLE,
              AUTHORITY: AUTHORITY, MAX_BYTES: MAX_BYTES, CANARY_DEFAULT: CANARY_DEFAULT,
              BARRIER_HOLD: BARRIER_HOLD, barrierStateNow: barrierStateNow,
              barrierWriteAllowed: barrierWriteAllowed, barrierHold: barrierHold,
              gateRing: function () { return _gateRing.slice(); } }
  };
  /* ★自動実行しない。Planner / Retrieve へは 1 本も繋がない。 */
})();
