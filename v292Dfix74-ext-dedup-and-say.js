// Chronicle TRPG - v292Dfix74: extension-array dedup + <say> enforcement
// 症状: system prompt に「これまでの経緯」(fix35) が5回も注入され、sys が 5834字に肥大。
//   原因: fix68/69/71 等が _extensions を .filter() で作り直した際、fix35-50 が依存する
//   配列プロパティのフラグ(__v292DfixNN)が消え、selfHeal が同じ関数を re-push し続けた連鎖。
//   _extensions 43個中18重複 / _parseExtensions 26個中11重複。
// 修正(1): Planner.build / parsePlan を wrap し、実行直前に各フック配列を同一関数で dedup
//   （in-place splice で配列 ref は保持）。経緯5回→1回、sys 5834→2643字（実測）。
// 修正(2): ??? root — 全セリフを <say who="名前"> で囲ませる system 指示。裸の「」を減らし
//   speaker 不明(???)カードの発生源を断つ（fix73 のクライアント側 dedup と合わせ技）。
// flag: window.__v292Dfix74Active
// ---------------------------------------------------------------------
// ★Q119 S4 FINAL ACTIVATION  (②C1 裁定 EI SO-2)
//   設計: gold/Q119_S4_FINAL_ACTIVATION_DESIGN_v1.md / lineage: candidate/q119s4/
//   S4 FINAL ACTIVATION
//   DEFAULT ON
//   KILL = v292DQ119PageCanaryOff  (localStorage / profile-scoped / reload required)
//   PHASE_A_ON = (kill を読めて、その値が '1' でない)。load 時 1 回だけ評価（page-lifetime constant）
//   PHASE_A_FAILS_TO_PRODUCTION: storage read が throw → OFF（= S4 以前の production topology）
//   opt-in は存在しない（sessionStorage['v292DQ119PageCanaryOn'] は **読まない**）
//   REGISTRY 4-4 = RUNTIME_STATE_PROOF
//     Phase A が実効な page では window.__v292WrapReg は
//     {f74parse, f78parse, f645parse, f648parse} のちょうど 4 key・すべて true。
//     OFF の page では registry を作らない（undefined）。
//   PARTIAL = BROKEN STATE → KILL + RELOAD
//     1〜3/4 は script 不在（成長停止）か旧版混在（成長継続）。registry class × 成長 で分類する。
//   NO SERVER-SIDE GLOBAL KILL — FLEET ROLLBACK IS PHYSICAL
//     kill は localStorage であり profile 単位にしか届かない。
//     全 user を戻すには物理 redeploy のみ（R5′ = 現 live 5 file 再配置 / R5 = Q119 以前）。
//   NO CONSISTENCY GUARD
//     一貫性ガードは追加しない（②C1 EE SK-2 / 設計 §10 NO_CONSISTENCY_GUARD_AT_S4）。
//   OFF = production 逐語（定期再ラップによる chain 成長を含めて production と同一・statement 逐語）
//   ON  = frozen Phase A core（candidate/q119/）逐語 = INSTALL_ONCE_PER_PAGE registry
//   ★分岐するのは wrapParse の guard だけ。wrapper 本体・marker・timer(400/1500/4000+2000)・
//     tick()/install()ヺoff() 契約・wrapSave/wrapRender/wrapFetch は 1 文字も変えない。
// ---------------------------------------------------------------------
(function v292Dfix74(){
  'use strict';
  if (window.__v292Dfix74Active) return;
  window.__v292Dfix74Active = true;
  var TAG = '[v292Dfix74:ext-dedup+say]';
  function getPlanner(){ try { return (0,eval)('typeof Planner!=="undefined"?Planner:null'); } catch(e){ return null; } }

  function dedupInPlace(arr){
    if (!Array.isArray(arr)) return 0;
    var seen = new Set(), removed = 0;
    for (var i=0;i<arr.length;){ if (seen.has(arr[i])){ arr.splice(i,1); removed++; } else { seen.add(arr[i]); i++; } }
    return removed;
  }
  function dedupAll(){
    var P = getPlanner(); if (!P) return;
    dedupInPlace(P._extensions);
    dedupInPlace(P._userExtensions);
    dedupInPlace(P._parseExtensions);
  }

  // ---- (2) <say> 強制 system 指示 ----
  var SAY = '\n\n【セリフ表記ルール（fix74）】\n'
    + '・キャラのセリフは全て <say who="キャラ名">…</say> で囲む。地の文に裸の「」セリフを置かない。\n'
    + '・who には必ず cast に登録された名前を入れる（??? や代名詞は不可）。誰が言ったか曖昧にしない。\n'
    + '・心の声・独白も <say who="名前(心)">…</say> で囲んでよい。';
  function sayExt(ctx){ try { if (ctx && typeof ctx.sys==='string') return ctx.sys + SAY; } catch(e){} return ctx && ctx.sys; }
  sayExt.__v292Dfix74 = true;

  function ensureSayExt(){
    var P = getPlanner(); if (!P) return;
    P._extensions = P._extensions || [];
    if (!P._extensions.some(function(f){ return f && f.__v292Dfix74; })) P._extensions.push(sayExt);
  }

  // ---- (1) build / parsePlan を wrap して実行直前に dedup ----
  function wrapBuild(){
    var P = getPlanner();
    if (!P || typeof P.build!=='function' || P.build.__v292Dfix74w) return false;
    var orig = P.build.bind(P);
    var w = function(){ try{ ensureSayExt(); dedupAll(); }catch(e){} return orig.apply(this, arguments); };
    w.__v292Dfix74w = true;
    P.build = w;
    try { console.log(TAG,'build wrapped'); } catch(_){}
    return true;
  }
  /* Q119-S4 PHASE_A: page 生存中の定数（load 時 1 回だけ読む・以後読み直さない）。
     既定 = ON。kill(localStorage 'v292DQ119PageCanaryOff'='1') のみが OFF にする。
     read が throw したら OFF（PHASE_A_FAILS_TO_PRODUCTION）。opt-in は存在しない。 */
  function paRead(){
    try { return window.localStorage.getItem('v292DQ119PageCanaryOff') !== '1'; } catch(e){ return false; }
  }
  var PHASE_A_ON = paRead();
  // Q119 Phase A: page-scoped install registry（共通基盤は新設しない）
  function reg74(){
    var R; try{ R = window.__v292WrapReg = window.__v292WrapReg || {}; }catch(e){ R = {}; }
    return R;
  }
  function wrapParse(){
    var P, R = null;
    if (!PHASE_A_ON){
      /* ===== OFF: production 経路（production v292Dfix74 :57-58 statement 逐語） ===== */
      P = getPlanner();
      if (!P || typeof P.parsePlan!=='function' || P.parsePlan.__v292Dfix74w) return false;
    } else {
      /* ===== ON: frozen Phase A core 経路（candidate/q119 :61-66 逐語） ===== */
      R = reg74();
      if (R.f74parse) return false;                 /* ★Q119-A INSTALL_ONCE_PER_PAGE */
      P = getPlanner();
      if (!P || typeof P.parsePlan!=='function') return false;
      if (P.parsePlan.__v292Dfix74w){ R.f74parse = true; return false; }  /* 既に居るなら registry を合わせるだけ */
    }
    /* ===== 以下 OFF/ON 共通・production 逐語 ===== */
    var orig = P.parsePlan.bind(P);
    var w = function(){ try{ dedupAll(); }catch(e){} return orig.apply(this, arguments); };
    w.__v292Dfix74w = true;
    P.parsePlan = w;
    if (PHASE_A_ON) R.f74parse = true;             /* ★registry が真実（ON のみ） */
    try { console.log(TAG,'parsePlan wrapped'); } catch(_){}
    return true;
  }

  function tick(){ wrapBuild(); wrapParse(); ensureSayExt(); dedupAll(); }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',tick); else tick();
  setTimeout(tick,400); setTimeout(tick,1500); setTimeout(tick,4000);
  setInterval(tick,2000);
  try { console.log(TAG,'loaded'); } catch(_){}
})();
