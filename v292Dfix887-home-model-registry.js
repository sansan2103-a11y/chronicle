/* =====================================================================
   v292Dfix887 — HOME MODEL REGISTRY LOAD  (client 20260919-sp9h)
   HOME_AI_MODEL_GAP hotfix. home.html only. index.html is NOT changed by this lane.
   ---------------------------------------------------------------------
   INCIDENT (live, 2026-09-19):
     home.html loads v292Dfix436-seed-expand.js, whose request() builds
       model: (window.__CHR_MODEL_REGISTRY ? ...resolve(cfg.orModel) : cfg.orModel)
     Before 2026-09-13 that line read  model: cfg.orModel || '<id literal>'  and home
     worked because of the literal. The dsmrc-1 change (2026-09-13) removed the literal
     and moved the decision into the model registry. index.html carries that registry as
     an inline block; home.html never got one and has no state object either, so on home
     cfg is {} -> model is undefined -> JSON.stringify drops the key -> the API answers
     HTTP 400 "No models provided". Every AI leg reachable from home fails:
     the scenario editor's two AI buttons and the fix873 depth chooser's two AI depths.
   ---------------------------------------------------------------------
   WHAT THIS FILE IS:
     the v292Dsmrc1 block of index.html, copied VERBATIM (byte-for-byte, comments and
     all), wrapped in one home-only loader. No model id, no request policy and no
     routing rule is re-authored here — reproducing those literals by hand is exactly
     what the block forbids ("this one block decides the primary model; do not
     reproduce the literal in each place"). The copy is machine-checked: the acceptance
     harness asserts this file CONTAINS the frozen index.html block as an exact
     substring, so the two can never drift silently.
     Convergence (index.html loading this same file and dropping its inline copy) is a
     separate client: sp9h must leave index.html byte-identical except its BUILT marker.
   ---------------------------------------------------------------------
   CONTRACT:
     - installs window.__CHR_MODEL_REGISTRY only when it is ABSENT (the copied block
       opens with its own "if (window.__CHR_MODEL_REGISTRY) return;" guard, and this
       wrapper checks again before running it). It never replaces an existing registry.
     - localStorage: reads one key (its own kill switch). Writes 0.
     - network 0. DOM: the copied block's syncStaticOptions() queries
       option[data-chr-model], of which home.html has none -> no-op.
     - no new persistent key, no new storage schema, no wrapper around fetch/XHR.
   KILL: localStorage['v292Dfix887Off'] = '1'  -> registry not installed; home returns
     to the broken-but-known sp9 behaviour (AI legs fail honestly, no other change).
   ===================================================================== */
(function v292Dfix887(){
  'use strict';
  try {
    if (window.localStorage && window.localStorage.getItem('v292Dfix887Off') === '1'){
      try { window.__v292Dfix887 = { off: true, installed: false, byThis: false }; } catch(_){}
      try { console.log('[v292Dfix887:home-model-registry] OFF (kill switch) — registry not installed'); } catch(_){}
      return;
    }
  } catch(e){}
  var _pre = !!window.__CHR_MODEL_REGISTRY;
  if (_pre){
    try { window.__v292Dfix887 = { off: false, installed: true, byThis: false }; } catch(_){}
    try { console.log('[v292Dfix887:home-model-registry] registry already present — not overridden'); } catch(_){}
    return;
  }

/* ===== BEGIN VERBATIM v292Dsmrc1 BLOCK — copied unmodified from the frozen
   release/20260919-sp9/index.html inline block. Do not edit one byte here; edit it in
   index.html and re-extract, or the harness equality check fails. ===== */
(function v292Dsmrc1(){
  'use strict';
  if (window.__CHR_MODEL_REGISTRY) return;

  /* ===================== SWITCH LINE (この 1 行だけ) ===================== */
  var PRIMARY_ID      = 'deepseek/deepseek-v4.1-flash';
  /* ======================================================================== */
  /* 以下 3 行は表示文言のみ（挙動に影響しない） */
  var PRIMARY_LABEL   = 'DS V4.1 Flash';
  var PRIMARY_LONG    = 'DeepSeek V4.1 Flash（推奨：高速・高品質・安価）';
  var PRIMARY_TIP     = 'DS V4.1 Flash：速い・安い・十分賢い。普段使いにおすすめ';

  /* ★dsmrc-2 / DQ-2: LEGACY PRIMARY（= ここに挙げた ID の**完全一致**だけを現 PRIMARY_ID
     として解決する）。保存値は書き換えない。ユーザーが明示的に選んだ他モデル
     （SECONDARY_ID / deepseek/ の別モデル / 非 DS）は 1 つも置換しない。 */
  var LEGACY_PRIMARY_IDS = ['deepseek/deepseek-v4-flash'];

  /* ★dsmrc-2: **管理情報 field**（DQ-8 の管理画面が読む表示専用データ）。
     ここに置く vendorApiName（DeepSeek 直 API の model 名）は request body に**入れない**。
     送信経路は primary() / resolve() の戻り値だけで、この object を読む送信経路は無い
     （受入 M2-1c で機械確認）。 */
  var PRIMARY_META = {
    provider:      'openrouter',                    /* 実際に request を撃つ相手 */
    routedId:      PRIMARY_ID,                      /* request に載る唯一の model 文字列 */
    vendorApiName: 'deepseek-flash',                /* DeepSeek 直 API 名。表示専用・request に入れない */
    vendorBaseUrl: 'https://api.deepseek.com',      /* 表示専用（本 client は直叩きしない） */
    legacyIds:     LEGACY_PRIMARY_IDS,              /* 旧 primary（effective mapping の対象） */
    note:          'vendorApiName / vendorBaseUrl は管理画面の表示専用。request には使わない'
  };

  /* ★dscmf-2（②C1 APPROVED_FALLBACK_MODEL）: cross-model fallback の承認済み予備 model。
     ここ 1 箇所にだけ literal を置き、FALLBACK_POLICY.to と REQUEST_POLICY_BY_ID の両方が
     この定数を参照する（ID literal の散在を作らない）。
     選定根拠 = gold/DS_FBQA_CANDIDATE_RESULT_v1.md（A=qwen3.6-flash は CR-3 FAIL で REJECTED）。 */
  var FALLBACK_ID = 'minimax/minimax-m3';

  var SECONDARY_ID    = 'deepseek/deepseek-v4-pro';
  var SECONDARY_LABEL = 'DS V4 Pro';
  var SECONDARY_LONG  = 'DeepSeek V4 Pro（濃い場面・長文向け）';
  var SECONDARY_TIP   = 'DS V4 Pro：心理の深さ・状況追跡が一段上。ここぞの修羅場や濃い場面に。やや遅く約4倍のコスト';

  function ns(){ var i = PRIMARY_ID.indexOf('/'); return (i > 0) ? PRIMARY_ID.slice(0, i + 1) : ''; }

  /* 保存値が「旧 primary の完全一致」か。trim も小文字化もしない = 完全一致のみ。 */
  function isLegacyPrimary(v){
    return typeof v === 'string' && LEGACY_PRIMARY_IDS.indexOf(v) >= 0;
  }

  /* ★dsmrc-2b / SK-2 MODEL-SPECIFIC REQUEST POLICY。
     key は **effective model**（resolve() 後の ID）の**完全一致**。legacy slug は resolve() が
     PRIMARY_ID へ写像するので、effective で引けば旧 slug 保存値も自動的に対象になる
     （この表に legacy を書かない = 判定を 1 箇所に閉じる）。
     ★DS V4.1 Flash は thinking が既定 ON（effort=high 相当）で、推論 token が max_tokens
       （本文 1400/2400・背景 260〜2000）を食い潰し content 空 / 途中切れを起こす
       （live A/B 実測 = 空 2/5・途中切れ 2/5。原因は強い仮説であって証明ではない）。
       OpenRouter 統一 reasoning パラメータ effort:'none' で推論を無効化し、
       provider:{require_parameters:true} で「その指定を無視する provider へ回さない」。
       前例 = 本文 _callOpenRouter の v292Dfix557（校正呼び出し）コメント。
     ★sampling（temperature / top_p / penalties = fix84）には触れない。max_tokens も変えない。 */
  var REQUEST_POLICY_BY_ID = {
    'deepseek/deepseek-v4.1-flash': { reasoning: { effort: 'none' }, provider: { require_parameters: true } }
  };
  /* ★dscmf-2（②C1 裁定）: 予備 model の request policy【初版】。
     ・reasoning:{effort:'none'} のみ。**provider.require_parameters は付けない**
       （予備の可用 provider を不用意に絞らないため = ②C1 明示指示）。
     ・key を literal で書かず FALLBACK_ID から組む ⇒ ID literal の出現数を増やさない。
     ・sampling（fix84）と max_tokens には触れない。CF-7「fallback request にも
       model-specific request policy を必ず適用」は applyRequestPolicy() が
       **effective model = 予備 model** で引くことで自動的に満たされる。 */
  REQUEST_POLICY_BY_ID[FALLBACK_ID] = { reasoning: { effort: 'none' } };

  /* plain object だけを再帰複製する（Array / 非 object はそのまま）。表を呼び出し側に渡さないため。 */
  function _policyCopy(o){
    if (!o || typeof o !== 'object' || Object.prototype.toString.call(o) === '[object Array]') return o;
    var r = {};
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) r[k] = _policyCopy(o[k]);
    return r;
  }

  /* ★純粋関数 #1。入力 = effective model（resolve 後の ID）。戻り = その model 用の追加 body。
     対象外・空文字・非文字列（undefined 等）は {}。副作用 0 / localStorage 読み書き 0 /
     network 0 / 保存値書換 0。毎回 fresh copy を返すので呼び出し側が壊しても表は無傷。 */
  function requestPolicy(model){
    if (typeof model !== 'string' || !model) return {};
    if (!Object.prototype.hasOwnProperty.call(REQUEST_POLICY_BY_ID, model)) return {};
    return _policyCopy(REQUEST_POLICY_BY_ID[model]);
  }

  /* ★純粋関数 #2（deep-merge の実装は**この 1 本だけ**。5 経路が同じものを使う）。
     ・policy が {} なら body は 1 byte も変わらない（対象外 model = 完全に無干渉）
     ・policy の field と body の field が両方 plain object なら **key 単位**で merge し、
       body 側にしか無い key（将来の provider.order 等）を消さない
     ・衝突した key は **policy が authority**（呼び出し側が reasoning.effort:'high' を
       渡していても policy の 'none' で上書きする = SK-2）
     ・merge 先は必ず新しい object にする（呼び出し側の opts.extraBody を汚さない）
     第 3 引数 effectiveModel は呼び出し箇所を自己説明的にするための記録用で、判定には使わない
     （policy をどの model から引いたかは requestPolicy() 側で確定している）。 */
  function mergePolicy(body, policy, effectiveModel){
    void effectiveModel;
    if (!body || typeof body !== 'object') return body;
    if (!policy || typeof policy !== 'object') return body;
    for (var k in policy){
      if (!Object.prototype.hasOwnProperty.call(policy, k)) continue;
      var pv = policy[k], bv = body[k];
      var pObj = !!pv && typeof pv === 'object' && Object.prototype.toString.call(pv) !== '[object Array]';
      var bObj = !!bv && typeof bv === 'object' && Object.prototype.toString.call(bv) !== '[object Array]';
      if (pObj && bObj){
        var merged = _policyCopy(bv);
        for (var k2 in pv) if (Object.prototype.hasOwnProperty.call(pv, k2)) merged[k2] = _policyCopy(pv[k2]);
        body[k] = merged;
      } else {
        body[k] = _policyCopy(pv);
      }
    }
    return body;
  }

  /* ★dsadm-1 / AI モデル管理 lane v1（read-only）。**表示専用の管理 metadata + 純粋関数 1 本**。
     ・model ID の literal を 1 つも置かない（key は PRIMARY_ID / SECONDARY_ID / LEGACY_PRIMARY_IDS から組む）。
       vendorApiName も PRIMARY_META から引く ⇒ 受入 M2-1c / M2-1d（旧 slug・直 API 名の source 出現数）を 1 つも動かさない。
     ・既存 API（primary/resolve/effective/configured/isLegacyPrimary/isManaged/label/list/meta/
       requestPolicy/mergePolicy/applyRequestPolicy/fallbackChain/substitutionNotice/version）の戻り値は 1 byte も変えない。
     ・自動切替 0 / 外部 fetch 0 / localStorage 0 / 保存値書換 0 / request への混入 0。
     ・「今日」を Date.now() から読まない（REGISTRY_AS_OF 固定値）= adminView は純粋関数。 */
  var REGISTRY_AS_OF = '2026-09-13';        /* 棚卸し日（DS_V41_FLASH_MIGRATION_INVENTORY_v1 / CONFIRMED_EXTERNAL） */
  var UNKNOWN_V     = 'UNKNOWN';            /* ②C1: 不明値は必ずこの文字列 */
  var MODEL_META = {};
  MODEL_META[PRIMARY_ID] = {
    label: PRIMARY_LABEL, provider: 'OpenRouter', vendorApiName: PRIMARY_META.vendorApiName,
    recommended: true, deprecated: false, sunset: null, replacement: null, legacy: false,
    lastChecked: REGISTRY_AS_OF, migrationStatus: 'PRODUCTION_VERIFIED',
    qaStatus: 'AB2 PASS 5/5 (gold/DS_AB2_POLICY_CAUSAL_QA_LIVE_v1)'
  };
  MODEL_META[SECONDARY_ID] = {
    /* 棚卸し CONFIRMED_EXTERNAL: 2026-09-14 04:00Z 以降 vendor 側で V4.1-Flash へ routing 予定。
       その時刻を過ぎるまでは deprecated ではない（sunset 判定で自動的に切り替わる・自動切替はしない）。 */
    label: SECONDARY_LABEL, provider: 'OpenRouter', vendorApiName: UNKNOWN_V,
    recommended: false, deprecated: false, sunset: '2026-09-14T04:00Z', replacement: PRIMARY_ID, legacy: false,
    lastChecked: REGISTRY_AS_OF, migrationStatus: 'USER_SELECTABLE (未移行)',
    qaStatus: UNKNOWN_V
  };
  for (var _lm = 0; _lm < LEGACY_PRIMARY_IDS.length; _lm++){
    /* 旧 primary。vendor 公式 2026-09-10 retire・互換 routing は暫定（= 恒久仕様ではない）。
       client 側は resolve() が effective mapping するので今日は壊れない ⇒ 「切替必須」ではなく「切替推奨」。 */
    MODEL_META[LEGACY_PRIMARY_IDS[_lm]] = {
      label: 'DS V4 Flash (Legacy)', provider: 'OpenRouter', vendorApiName: UNKNOWN_V,
      recommended: false, deprecated: true, sunset: '2026-09-10', replacement: PRIMARY_ID, legacy: true,
      lastChecked: REGISTRY_AS_OF, migrationStatus: 'SUPERSEDED (client effective mapping)',
      qaStatus: 'RETIRED_UPSTREAM (vendor 互換 routing は暫定)'
    };
  }

  function _metaOf(id){
    return (typeof id === 'string' && id && Object.prototype.hasOwnProperty.call(MODEL_META, id)) ? MODEL_META[id] : null;
  }
  function _un(v){ return (v === undefined || v === null || v === '') ? UNKNOWN_V : v; }
  /* replacement は「知らない（metadata なし）= UNKNOWN」と「不要（metadata あり・null）= なし」を区別する。 */
  function _repl(m){ return m ? (m.replacement ? m.replacement : 'なし') : UNKNOWN_V; }
  function _recommendedId(){
    for (var k in MODEL_META) if (Object.prototype.hasOwnProperty.call(MODEL_META, k) && MODEL_META[k].recommended === true) return k;
    return PRIMARY_ID;
  }
  /* sunset 経過判定は ISO-8601 の辞書順比較（date-only の asOf と datetime の sunset を比べると
     同日でも時刻ぶんだけ「未経過」に倒れる = 安全側）。外部時刻を読まない。 */
  function _sunsetPassed(m, asOf){ return !!(m && m.sunset) && String(asOf) >= String(m.sunset); }

  /* ★純粋関数: 管理画面が描く全 field を 1 回で返す（UI にロジックを複製しない）。
     入力 = 保存値 raw（S.cfg.orModel）と任意の asOf。副作用 0・network 0・localStorage 0。
     状態の派生規則（固定・強い順に 1 つだけ当たる）:
       ①「切替必須」= 設定値が deprecated かつ sunset 経過かつ **実効値が設定値のまま**（救済なし）
       ②「切替推奨」= 設定値が deprecated で replacement がある（effective mapping で今日は動く）
       ③「新しいモデルあり」= 実効値 ≠ 推奨モデル
       ④「最新版」= それ以外（実効値 = 推奨モデル） */
  function adminView(configuredRaw, asOf){
    var at  = (typeof asOf === 'string' && asOf) ? asOf : REGISTRY_AS_OF;
    var raw = (typeof configuredRaw === 'string') ? configuredRaw : '';
    var has = !!raw.trim();
    var cfgId = has ? raw : '';
    var effId = R.resolve(raw);
    var cm = _metaOf(cfgId), em = _metaOf(effId);
    var recId = _recommendedId(), rm = _metaOf(recId);
    var dep = !!(cm && (cm.deprecated === true || _sunsetPassed(cm, at)));
    var state;
    if (dep && _sunsetPassed(cm, at) && effId === cfgId) state = '切替必須';
    else if (dep && cm && cm.replacement)                state = '切替推奨';
    else if (effId !== recId)                            state = '新しいモデルあり';
    else                                                 state = '最新版';
    var chain = R.fallbackChain();
    var cat = [];
    for (var k in MODEL_META) if (Object.prototype.hasOwnProperty.call(MODEL_META, k)){
      var mm = MODEL_META[k];
      cat.push({ id: k, label: mm.label, recommended: mm.recommended === true, deprecated: mm.deprecated === true,
                 sunset: _un(mm.sunset), replacement: _repl(mm), legacy: mm.legacy === true,
                 provider: _un(mm.provider), lastChecked: _un(mm.lastChecked),
                 migrationStatus: _un(mm.migrationStatus), qaStatus: _un(mm.qaStatus) });
    }
    return {
      readOnly: true, v: 'dsadm-1', asOf: at,
      primaryId: PRIMARY_ID, primaryLabel: PRIMARY_LABEL,
      configuredRaw: raw,
      configuredId:    has ? cfgId : UNKNOWN_V,
      configuredLabel: has ? (cm ? cm.label : R.label(cfgId)) : '(未設定→primary)',
      effectiveId:     effId,
      effectiveLabel:  em ? em.label : R.label(effId),
      recommendedId:   recId,
      recommendedLabel: rm ? rm.label : R.label(recId),
      provider:        _un(em && em.provider),
      apiModelId:      _un(effId),
      vendorApiName:   _un(em && em.vendorApiName),
      isLegacyConfigured: R.isLegacyPrimary(raw),
      deprecated:      dep,
      legacyDeprecatedLabel: has ? ((cm ? (cm.legacy === true ? 'LEGACY' : 'NOT_LEGACY') : UNKNOWN_V) + ' / ' +
                                    (cm ? (dep ? 'DEPRECATED' : 'ACTIVE') : UNKNOWN_V)) : UNKNOWN_V,
      replacement:     _repl(cm),
      qaStatus:        _un(em && em.qaStatus),
      migrationStatus: has ? _un(cm && cm.migrationStatus) : UNKNOWN_V,
      lastChecked:     _un((cm && cm.lastChecked) || (em && em.lastChecked)),
      crossModelFallback: (chain && chain.length) ? chain.join(' -> ') : 'NOT_IMPLEMENTED (v1)',
      responseReportedModel: UNKNOWN_V,   /* v1: 取得手段を作らない（応答 wrapper 禁止）*/
      actualProvider:        UNKNOWN_V,   /* v1: 同上（response header / body を読む経路を足さない）*/
      state: state,
      substitution: R.substitutionNotice(raw),
      catalog: cat
    };
  }
  /* ★dscmf-1 / CROSS-MODEL FALLBACK v1（②C1 裁定 CF-1〜CF-7）。
     ・**機構と model 選定を分離**（CF-2）。production 初期値は enabled:false / to:''（UNASSIGNED）。
       実 model が未承認でも実装は止めない。to が未割当なら gate は **fail closed**（effective=false）。
     ・fallbackChain() は FALLBACK_POLICY からの導出に変わるが、既定（OFF / UNASSIGNED）では
       従来どおり [] を返す = 既存 API の戻り値は 1 byte も変わらない（管理画面の
       'NOT_IMPLEMENTED (v1)' 表示も維持される）。
     ・classifyFailure は **純粋関数**。未知の失敗は eligible:false（fail closed）。
     ・診断（FB_DIAG）は **volatile な module 変数**だけ。localStorage 書込 0 / 新 save schema 0（CF-5）。
       reload で消えてよい。Admin read-only から fallbackDiag() で閲覧する。
     ・この block は定義だけ。load 時の localStorage 読み書き 0 / network 0 / wrapper 0。 */
  /* ★dscmf-3（②C1 activation 裁定）: production-wide activation。**enabled を true にするのはこの 1 箇所だけ**。
     from / to / maxHops、予備 model の request policy（reasoning:{effort:'none'} のみ）は 1 byte も変えない。
     kill switch（v292DfixCmfOff='1'）は従来どおり最優先で effective=false にできる。
     activation blocker の充足根拠 = offline exactly-one-hop / 二重 commit なし / 失敗時は元 primary error 保持 /
     MiniMax M3 候補 QA PASS / inert production PASS / slot opt-in live PASS /
     validation400 の live fail-closed PASS / maxHops=1 / third-model chain なし / Q119・PG 非回帰。 */
  var FALLBACK_POLICY = { version: 'cmf-1', enabled: true, from: PRIMARY_ID, to: FALLBACK_ID, maxHops: 1 };

  function fallbackPolicy(){ return _policyCopy(FALLBACK_POLICY); }
  function fallbackAssigned(){ return !!FALLBACK_POLICY.to && FALLBACK_POLICY.to !== FALLBACK_POLICY.from; }

  /* ★純粋関数。err → { eligible, reason, httpStatus }。
     CF-1 対象 = network/timeout・429・5xx・provider 一時障害・HTTP 200 だが usable content なし。
     CF-1 非対象 = user cancel（そもそも例外にならず null が返る）・auth/permission・request validation。
     未知は **必ず fail closed**（eligible:false）。副作用 0 / localStorage 0 / 時計 0。 */
  function classifyFailure(err){
    var msg = '', nm = '';
    try { msg = String((err && err.message) || err || ''); } catch(e){ msg = ''; }
    try { nm  = String((err && err.name) || ''); } catch(e){ nm = ''; }
    if (msg.indexOf('APIキーが設定されていません') >= 0) return { eligible:false, reason:'auth-missing-key', httpStatus:null };
    var hm = msg.match(/OpenRouter HTTP (\d+)/);
    if (hm){
      var st = parseInt(hm[1], 10);
      if (st === 401 || st === 402 || st === 403) return { eligible:false, reason:'auth-permission',    httpStatus:st };
      if (st === 400 || st === 404 || st === 405 || st === 422) return { eligible:false, reason:'request-validation', httpStatus:st };
      if (st === 408 || st === 409 || st === 425 || st === 429 || (st >= 500 && st <= 599))
                                                  return { eligible:true,  reason:'transient-http',    httpStatus:st };
      return { eligible:false, reason:'unclassified-http', httpStatus:st };
    }
    if (msg.indexOf('出力がありませんでした') >= 0) return { eligible:true, reason:'empty-content', httpStatus:null };
    /* fix818 の破棄（生成が壊れていたため採用しませんでした）は **未 commit** の破棄なので対象。 */
    if (msg.indexOf('採用しませんでした') >= 0 || msg.indexOf('生成が壊れていた') >= 0)
      return { eligible:true, reason:'unusable-content', httpStatus:null };
    if (nm === 'AbortError' || /aborted/i.test(msg)) return { eligible:true, reason:'timeout-abort', httpStatus:null };
    if (/Failed to fetch|NetworkError|load failed/i.test(msg)) return { eligible:true, reason:'network', httpStatus:null };
    return { eligible:false, reason:'unclassified', httpStatus:null };
  }

  /* ★volatile 診断（CF-5）。localStorage / save schema へは 1 byte も出さない。reload で消える。 */
  var FB_DIAG = { enabled:false, triggered:false, primaryModel:null, fallbackModel:null, reason:null,
                  primaryAttempts:0, fallbackAttempts:0, outcome:'NONE', requestId:null, at:null };
  function fallbackDiag(){
    var o = {}; for (var k in FB_DIAG) if (Object.prototype.hasOwnProperty.call(FB_DIAG, k)) o[k] = FB_DIAG[k];
    return o;
  }
  /* 既知 field だけを更新する（未知 key は捨てる）。**localStorage を触らない**のが契約。 */
  function _fbDiag(patch){
    if (patch && typeof patch === 'object'){
      for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k) &&
                               Object.prototype.hasOwnProperty.call(FB_DIAG, k)) FB_DIAG[k] = patch[k];
    }
    return fallbackDiag();
  }

  /* ★dscmf-1b / ②C1 RB-3 是正: slot opt-in の authority は **fix845 FR-11 と同じ 2 段だけ**。
     ① window.__v292QuasiPack.key() … 'v292Dfix277Quasi' + '_slot_<id>' の <id> を取る。
        prefix しか無い（= default story を指す）ときは **slot なし扱い（null）**。authority は解決済みなので ② へは降りない。
        key() が別形式 / null / 非文字列なら「① は取れていない」として ② へ降りる。
     ② window.__chronicleDocumentStoryKey … 'chr6_slot_<id>' の <id>。'chr6' / null / 非文字列は null。
     ③ どちらも取れない・空文字・型違い・例外 → null。
     ★null なら fallbackGate() の slotOptIn は false（**fail closed**）。
     ★この関数は localStorage を 1 度も読まない。**navigation / last-opened の共有ミラー key は
       CMF の authority ではない**（fix693 INV-C: 書込先の決定に使わない共有ポインタ。本 lane はその key を
       1 度も読まず、CMF 領域の source にその key 名を 1 文字も置かない）。 */
  function _cmfSlot(){
    try {
      var q = window.__v292QuasiPack;
      if (q && typeof q.key === 'function'){
        var k = q.key();
        if (typeof k === 'string' && k.indexOf('v292Dfix277Quasi') === 0){
          var sfx = k.slice('v292Dfix277Quasi'.length);
          if (sfx.indexOf('_slot_') === 0){
            var id = sfx.slice('_slot_'.length);
            if (id) return { slot: id, source: 'quasipack-key' };
          }
          return { slot: null, source: 'none' };      /* default story = slot なし（fail closed）*/
        }
      }
    } catch(e){}
    try {
      var dk = window.__chronicleDocumentStoryKey;
      if (typeof dk === 'string' && dk.indexOf('chr6_slot_') === 0){
        var id2 = dk.slice('chr6_slot_'.length);
        if (id2) return { slot: id2, source: 'document-story-key' };
      }
    } catch(e){}
    return { slot: null, source: 'none' };
  }

  /* ★非純粋（localStorage **読取のみ**・書込 0）。新 key は gate flag 2 本だけで、どちらも読むだけ。
       kill  : v292DfixCmfOff === '1'            → effective=false（最優先）
       opt-in: v292DfixCmfOn_slot_<slot> === '1' → enabled（CF-4 の dedicated QA slot）
     assigned=false（to が未割当）なら **fail closed**（CF-2）。 */
  function fallbackGate(){
    var killed = false, slotOptIn = false, sl = { slot: null, source: 'none' };
    try { killed = !!(window.localStorage && window.localStorage.getItem('v292DfixCmfOff') === '1'); } catch(e){ killed = false; }
    try {
      sl = _cmfSlot() || { slot: null, source: 'none' };
      if (sl.slot && window.localStorage) slotOptIn = (window.localStorage.getItem('v292DfixCmfOn_slot_' + sl.slot) === '1');
    } catch(e){ slotOptIn = false; }
    var enabled  = (FALLBACK_POLICY.enabled === true) || slotOptIn === true;
    var assigned = fallbackAssigned();
    /* slotSource は診断の透明性のためだけの read-only field（'quasipack-key' / 'document-story-key' / 'none'）。 */
    return { enabled: !!enabled, killed: !!killed, slotOptIn: !!slotOptIn, slot: sl.slot, slotSource: sl.source,
             assigned: !!assigned, effective: !!(!killed && enabled && assigned) };
  }

  var R = {
    version: 'dsmrc-2b',
    primary:   function(){ return PRIMARY_ID; },
    secondary: function(){ return SECONDARY_ID; },
    /* 送信 payload の model 欄。
       ・空（未設定）        → primary()（従来の cfg.orModel || '<literal>' と同値）
       ・旧 primary の完全一致 → primary()（DQ-2 LEGACY PRIMARY EFFECTIVE MAPPING）
       ・それ以外            → 保存値そのまま（ユーザー選択を尊重・置換 0）
       ★この関数は保存値を 1 byte も書き換えない（read-only）。 */
    resolve:   function(v){
                 if (typeof v === 'string' && v.trim()) return isLegacyPrimary(v) ? PRIMARY_ID : v;
                 return PRIMARY_ID;
               },
    /* 表示用 3 点セット（管理画面 lane / 設定 UI が「設定値: 旧 / 実効: 新」を出せる形）。
       configured() は保存値をそのまま返す（未設定は ''）。effective() は実際に送る値。 */
    configured: function(v){ return (typeof v === 'string' && v.trim()) ? v : ''; },
    effective:  function(v){ return R.resolve(v); },
    isLegacyPrimary: isLegacyPrimary,
    legacyPrimaries: function(){ return LEGACY_PRIMARY_IDS.slice(); },
    /* ★dsmrc-2b: MODEL-SPECIFIC REQUEST POLICY の公開 API。
       requestPolicy(effectiveModel) … 純粋関数。その model 用の追加 body（無ければ {}）
       mergePolicy(body, policy, m)  … 純粋関数。1 段 deep-merge（policy authority）
       applyRequestPolicy(body, m)   … 5 経路が呼ぶ唯一の入口。body を in-place 更新して返す */
    requestPolicy: requestPolicy,
    mergePolicy:   mergePolicy,
    applyRequestPolicy: function(body, effectiveModel){
      return mergePolicy(body, requestPolicy(effectiveModel), effectiveModel);
    },
    /* 管理情報（表示専用・request に入れない）。呼び出し側が壊せないよう複製を返す。 */
    meta:      function(){
                 var o = {}; for (var k in PRIMARY_META) if (Object.prototype.hasOwnProperty.call(PRIMARY_META, k)) o[k] = PRIMARY_META[k];
                 o.routedId = PRIMARY_ID; o.legacyIds = LEGACY_PRIMARY_IDS.slice();
                 return o;
               },
    /* 旧 fix370 の isDS と同値。判定 prefix を primary の namespace から導く
       ⇒ 第2段で primary が同じ namespace の新 slug になっても引き戻さない */
    ns:        ns,
    isManaged: function(v){ var p = ns(); return !!p && typeof v === 'string' && v.indexOf(p) === 0; },
    label:     function(id){
                 if (id === PRIMARY_ID)   return PRIMARY_LABEL;
                 if (id === SECONDARY_ID) return SECONDARY_LABEL;
                 return String(id || '').split('/').pop().slice(0, 18);
               },
    list:      function(){
                 return [ { id: PRIMARY_ID,   label: PRIMARY_LABEL,   long: PRIMARY_LONG,   tip: PRIMARY_TIP },
                          { id: SECONDARY_ID, label: SECONDARY_LABEL, long: SECONDARY_LONG, tip: SECONDARY_TIP } ];
               },
    /* ★dsadm-1: 管理画面 v1 が読む唯一の入口（純粋関数・read-only）。
       戻り値は表示用の平たい object。UI はこれを描くだけで判定ロジックを持たない。 */
    adminView: adminView,
    modelMeta: function(id){ var m = _metaOf(id); if (!m) return null; var o = {}; for (var k in m) if (Object.prototype.hasOwnProperty.call(m,k)) o[k] = m[k]; return o; },
    /* ★dscmf-1: cross-model fallback の chain。FALLBACK_POLICY からの導出に変える。
       既定（enabled:false / to:'' = UNASSIGNED）では従来どおり **[]**（= 戻り値不変）。 */
    fallbackChain: function(){
      return (FALLBACK_POLICY.enabled === true && fallbackAssigned()) ? [FALLBACK_POLICY.from, FALLBACK_POLICY.to] : [];
    },
    /* ★dscmf-1 公開 API（機構）。policy / gate / 分類 / 診断の 5 本だけを外へ出す。
       fallbackNote(patch) は G.submit の _cmfTry だけが呼ぶ診断更新口で、**localStorage を触らない**。 */
    fallbackPolicy:   fallbackPolicy,
    fallbackAssigned: fallbackAssigned,
    fallbackGate:     fallbackGate,
    classifyFailure:  classifyFailure,
    fallbackDiag:     fallbackDiag,
    fallbackNote:     function(patch){ return _fbDiag(patch); },
    /* 置換が起きたときだけ通知 object を返す（起きていなければ null）。
       UI はこれを読んで「設定値: 旧 / 実効: 新」を出せる。副作用 0・保存 0。 */
    substitutionNotice: function(v){
      if (!isLegacyPrimary(v)) return null;
      return { reason: 'legacy-primary', configured: v, effective: PRIMARY_ID,
               effectiveLabel: PRIMARY_LABEL,
               text: '設定値: ' + v + ' / 実効: ' + PRIMARY_ID + '（旧 primary のため自動で読み替え・設定は変更していません）' };
    }
  };

  /* static <option> の value/表示を集中定義から埋める（第2段では primary 側が V4.1 になる）。
     DOM を新規に作らない・選択状態を変えない・1 回だけ・localStorage 書込 0。 */
  function syncStaticOptions(){
    try {
      var list = document.querySelectorAll('option[data-chr-model]');
      for (var i = 0; i < list.length; i++){
        var role = list[i].getAttribute('data-chr-model');
        var id = (role === 'primary') ? PRIMARY_ID : (role === 'secondary' ? SECONDARY_ID : '');
        var tx = (role === 'primary') ? PRIMARY_LONG : (role === 'secondary' ? SECONDARY_LONG : '');
        if (!id) continue;
        if (list[i].value !== id) list[i].value = id;
        if (tx && list[i].textContent !== tx) list[i].textContent = tx;
      }
    } catch(e){}
  }

  window.__CHR_MODEL_REGISTRY = R;
  window.__CHRMODEL = function(v){ return R.resolve(v); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncStaticOptions);
  else syncStaticOptions();
  try { console.log('[v292Dsmrc1:model-registry] loaded primary=', PRIMARY_ID); } catch(_){}
})();
/* ===== END VERBATIM v292Dsmrc1 BLOCK ===== */

  try {
    window.__v292Dfix887 = {
      off: false,
      installed: !!window.__CHR_MODEL_REGISTRY,
      byThis: !_pre && !!window.__CHR_MODEL_REGISTRY,
      version: (window.__CHR_MODEL_REGISTRY && window.__CHR_MODEL_REGISTRY.version) || null
    };
  } catch(_){}
  try { console.log('[v292Dfix887:home-model-registry] loaded'); } catch(_){}
})();
