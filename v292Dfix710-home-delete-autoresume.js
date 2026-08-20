// =====================================================================
// Chronicle v292Dfix710: HOME shadow-delete auto resume（boot時 1回だけの回復トリガ）
// ---------------------------------------------------------------------
// ■なぜ必要か（fix708 PHASE3 canary で実測して判明した穴）
//   fix708 の削除トランザクションは production で完走することを確認できた。
//   しかし HOME(home.html) では **保留中の削除が boot で自動再開されない**。
//   fix587 の autoResume() は `dep().sync`（= fix399 のクラウド同期）が現れるのを
//   500ms×40 回まで待つ実装で、home.html には fix399 が無いため **必ず諦める**。
//   つまり通信障害で pending になった削除は、HOME からは永久に再開されない。
//   （GPT裁定: HOME_SHADOW_DELETE_AUTORESUME_MISSING = HIGH / CONFIRMED / OPEN）
//
// ■このファイルが やること / やらないこと
//   やる  : 既存 `__chronicleStoryLifecycle.resumePending()` を、
//           **安全な条件を全部満たしたときだけ boot あたり 1 回** 呼ぶ。
//   やらない:
//     ・fix399 の同期を HOME に載せない（裁定で REJECT）
//     ・新しい同期基盤 / sync queue / ledger を作らない
//     ・新しい localStorage キーを **書かない**（メモリ上のフラグだけで多重起動を防ぐ）
//     ・interval / polling をしない（1回きり。失敗したら次の boot でまた試す）
//     ・fix587 の削除トランザクション本体を作り直さない
//     ・historical(pre-fix708) の pending には触らない
//
// ■autoResume の対象（1つでも欠けたら **撃たない**）
//   ・fix708 ON            … ★fix712 以降は既定 ON。v292Dfix708Off==='1' のときだけ OFF
//   ・terminal でない      … sdTerminal !== true
//   ・shadowDeleteVersion === 1   … pre-fix708 の historical plan を除外する版札
//   ・localDeleteBaseHash あり    … live のうちに確定した canonical hash（無ければ CAS を撃てない）
//   ・deleteOpId / planId / slotId あり
//   ・snapshot(recoverySnapshotId | snapshotId) あり
//   ★version と baseHash の 2 つが historical 除外ゲートの本体。
//     main に残っている historical 3件は fix708 OFF かつ この2つが無いので、
//     二重に対象外になる。
//
// ■失敗時の約束（GPT PASS条件）
//   ・auth / network 失敗でも physical delete は 0
//   ・pending / local body / 墓標 / snapshot は保持（判断は fix587 側の fail-closed に委ねる）
//   ・terminal になった計画は次回以降 sdTerminal で自動的に skip される
//
// ■観測 / ロールバック
//   window.__v292Dfix710.status()   … 読むだけ（何も起動しない）
//   window.__v292Dfix710.decide()   … 「今 撃つか / 撃たない理由」を読むだけで返す
//   window.__v292Dfix710.boot()     … 手動で1回（多重起動ガードは共通）
//   OFF = localStorage['v292Dfix710Off']='1' … 読むだけ。ONにする書込はしない。
// =====================================================================
(function(){
  'use strict';
  try { if (window.__v292Dfix710) return; } catch(e){ return; }

  var TAG = '[v292Dfix710:home-delete-autoresume]';
  var FIX710_VERSION = 1;
  /* fix587 の SHADOW_DELETE_PROTOCOL_VERSION と一致していなければ再開しない。 */
  var REQUIRED_SHADOW_DELETE_VERSION = 1;

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix710Off') === '1'; }
  /* ★★fix712: fix587 と同じ既定反転。DEFAULT ON ＋ v292Dfix708Off='1' で OFF。
     判定は fix587 側と 1文字も食い違わせない（食い違うと「HOME だけ勝手に動く」が起きる）。 */
  function sdOn(){
    /* ★★fix712(GPT裁定 追補): localStorage の読取り自体が throw した場合は **OFF**。
       default ON は「通常状態の既定値」であって、緊急停止スイッチ(v292Dfix708Off)の状態すら
       判定できない異常時まで削除トランザクションを ON にする意味ではない。→ fail closed。 */
    /* ★lsg() は例外を握り潰して null を返すので、ここでは **localStorage を直接読む**。
       そうしないと「読めなかった」と「Off が無い」を区別できず fail closed にならない。 */
    try { return localStorage.getItem('v292Dfix708Off') !== '1'; }
    catch(e){ return false; }
  }
  function svc(){ try { return window.__chronicleStoryLifecycle || null; } catch(e){ return null; } }
  function isArr(v){ return Object.prototype.toString.call(v) === '[object Array]'; }

  /* ---- historical 除外ゲート（読むだけ） -------------------------------- */
  function isEligible(p){
    if (!p || typeof p !== 'object') return false;
    if (p.sdTerminal === true) return false;                                   /* terminal は skip */
    if (Number(p.shadowDeleteVersion) !== REQUIRED_SHADOW_DELETE_VERSION) return false;  /* 版札ゲート */
    if (typeof p.localDeleteBaseHash !== 'string' || p.localDeleteBaseHash === '') return false; /* baseHash ゲート */
    if (!p.planId || !p.slotId || !p.deleteOpId) return false;
    if (!(p.recoverySnapshotId || p.snapshotId)) return false;                 /* 復元セットが無ければ触らない */
    return true;
  }
  function allPending(){
    var s = svc();
    if (!s || typeof s.pendingDeletes !== 'function') return [];
    var a = null;
    try { a = s.pendingDeletes(); } catch(e){ return []; }
    return isArr(a) ? a : [];
  }
  function eligiblePlans(){ return allPending().filter(isEligible); }

  /* ---- 「撃つか / 撃たないか」の判定。**読むだけ・通信 0・書込 0** -------- */
  function decide(){
    var s = svc();
    if (!s || typeof s.resumePending !== 'function')
      return { ran:false, why:'no-lifecycle', eligible:0, considered:0 };
    if (off()) return { ran:false, why:'fix710-off', eligible:0, considered:0 };
    if (typeof s.isOff === 'function'){
      var lifecycleOff = false;
      try { lifecycleOff = !!s.isOff(); } catch(e){ lifecycleOff = false; }
      if (lifecycleOff) return { ran:false, why:'lifecycle-off', eligible:0, considered:0 };
    }
    /* ★fix708 OFF なら完全無作用。pending を読むところまでで止める（通信 0 / 書込 0）。 */
    if (!sdOn()) return { ran:false, why:'fix708-off', eligible:0, considered:0 };
    /* ★index.html では fix587 自身の autoResume が resumePending を撃つ。
       そちらが武装しているページでは二重に撃たない（このファイルは HOME 専用）。 */
    try {
      var st = (typeof s.stats === 'function') ? s.stats() : null;
      if (st && (+st.autoResumeArmed || 0) > 0)
        return { ran:false, why:'fix587-autoresume-armed', eligible:0, considered:0 };
    } catch(e){}

    var all = allPending(), elig = all.filter(isEligible);
    if (!elig.length)
      return { ran:false, why:'no-eligible-pending', eligible:0, considered: all.length };

    /* ★fix697 の契約がこのページに無ければ、撃っても必ず
       DELETE_CONTRACT_UNAVAILABLE の hold になる。無駄な起動をしない。 */
    var contractOk = false;
    try {
      var sd = (typeof s.shadowDeleteStatus === 'function') ? s.shadowDeleteStatus() : null;
      contractOk = !!(sd && sd.contractAvailable === true
                      && Number(sd.protocolVersion) === REQUIRED_SHADOW_DELETE_VERSION);
    } catch(e){ contractOk = false; }
    if (!contractOk)
      return { ran:false, why:'contract-unavailable', eligible: elig.length, considered: all.length };

    var ids = [];
    for (var i = 0; i < elig.length; i++) ids.push(String(elig[i].planId));
    return { ran:true, why:'eligible', eligible: elig.length, considered: all.length, planIds: ids };
  }

  /* ---- 1 boot 1 回だけの起動 -------------------------------------------- */
  var state = { armed:false, fired:false, inFlight:false, fireCount:0, hookFires:0,
                lastDecision:null, lastResult:null, lastError:null };

  function fire(source){
    state.hookFires++;
    if (state.fired || state.inFlight)
      return { ran:false, why:'already-fired-this-boot', source:source,
               eligible:0, considered:0 };
    var d = null;
    try { d = decide(); } catch(e){ d = { ran:false, why:'decide-threw', eligible:0, considered:0 }; }
    d.source = source;
    try { d.at = Date.now(); } catch(e){}
    state.lastDecision = d;
    if (!d.ran) return d;

    /* ★実際に撃つ前に **同期的に** フラグを立てる。
       同一 boot で複数の hook が発火しても、実 transaction は 1 回しか走らない。 */
    state.fired = true; state.inFlight = true; state.fireCount++;
    var s = svc(), pr = null;
    try { pr = s.resumePending({ onlyPlanIds: d.planIds }); }
    catch(e){
      state.inFlight = false; state.lastError = String(e);
      state.lastResult = { ok:false, code:'threw' };
      return d;
    }
    if (!pr || typeof pr.then !== 'function'){
      state.inFlight = false;
      state.lastResult = { ok:false, code:'no-promise' };
      return d;
    }
    pr.then(function(r){
      state.inFlight = false; state.lastResult = r || null;
      try {
        if (r && r.done) console.log(TAG, '保留していた削除を ' + r.done + '件 片づけました');
        else if (r && r.held && r.held.length) console.warn(TAG, '保留の削除を片づけられません', r.held);
      } catch(e){}
    }, function(e){
      state.inFlight = false; state.lastError = String(e);
      state.lastResult = { ok:false, code:'rejected' };
      /* ★ここでは 1 バイトも消さない。pending / 本体 / 墓標 / snapshot は fix587 が保持したまま。 */
    });
    return d;
  }

  /* ---- hook: boot で 1 回。interval / polling はしない -------------------- */
  function arm(){
    if (state.armed) return;
    state.armed = true;
    var run = function(){ try { fire('hook'); } catch(e){} };
    var ready = 'complete';
    try { ready = String((document && document.readyState) || 'complete'); } catch(e){ ready = 'complete'; }
    try {
      if (ready === 'loading' && document && typeof document.addEventListener === 'function'){
        document.addEventListener('DOMContentLoaded', run, false);
      } else {
        setTimeout(run, 0);
      }
    } catch(e){ try { setTimeout(run, 0); } catch(e2){} }
    /* 保険の 2 本目。DOMContentLoaded が来ない / 既に過ぎている場合でも 1 回は通る。
       多重起動は fire() のガードで潰す（＝発火は複数、実 transaction は 1 回）。 */
    try { if (typeof window.addEventListener === 'function') window.addEventListener('load', run, false); }
    catch(e){}
  }

  window.__v292Dfix710 = {
    __armed: true,
    FIX710_VERSION: FIX710_VERSION,
    REQUIRED_SHADOW_DELETE_VERSION: REQUIRED_SHADOW_DELETE_VERSION,
    isOff: off,
    sdOn: sdOn,
    isEligible: isEligible,
    pendingPlans: allPending,
    eligiblePlans: eligiblePlans,
    /* 読むだけ。ここから起動はしない。 */
    decide: decide,
    /* 手動起動（多重起動ガードは共通・boot あたり最大 1 回） */
    boot: function(){ return fire('manual'); },
    status: function(){
      var d = state.lastDecision;
      return { version: FIX710_VERSION, armed: state.armed, off: off(), fix708On: sdOn(),
               fired: state.fired, inFlight: state.inFlight,
               fireCount: state.fireCount, hookFires: state.hookFires,
               eligibleNow: eligiblePlans().length, pendingNow: allPending().length,
               lastDecision: d ? { ran:d.ran, why:d.why, source:d.source||null,
                                   eligible:d.eligible, considered:d.considered,
                                   planIds:(d.planIds||null), at:(d.at||null) } : null,
               lastResult: state.lastResult, lastError: state.lastError };
    }
  };

  arm();
})();
