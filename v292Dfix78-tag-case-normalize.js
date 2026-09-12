// Chronicle TRPG - v292Dfix78: タグの大文字小文字を正規化（<Say>/<State> 漏れ修正）
// 症状(実機 Euryale で確認): モデルがタグを大文字で吐く時がある（<Say who=…>、<State …/>）。
//   会話ログの say 抽出器も fix77 の <state> strip も「小文字」しか拾わないため、
//   大文字タグはカード化も除去もされず、本文(展開描写)にそのまま漏れる。
//   実機: <Say who="フィオナ">誰…だ？</Say> が展開描写に素通り。<State> も同様。
//   （小文字 <say> のターンは正常にカード化＆除去されていた＝原因は case 不一致と確定）
// 修正: parsePlan に渡る生テキストの段階で、<say>/<state> のタグ名だけを小文字化する。
//   これで下流（say 抽出器・fix77 capture/strip・renderer）が全部正しく拾える。
//   属性値や本文は一切変えない（タグ名のみ）。Euryale が JSON でなく散文を返し fallback に
//   落ちるケースでも、入力正規化なので同様に効く。
// 実装: parsePlan を wrap し、第1引数(string)を正規化してから orig を呼ぶ。
//   fix74(parsePlan wrap) / fix75(build wrap) と相互再wrapしないよう __v292*w フラグを引き継ぐ。
// 互換: 純追加。flag: window.__v292Dfix78Active
// ---------------------------------------------------------------------
// ★Q119 PAGE_CANARY_GATE v1  (②C1 裁定 EE SK-4)
//   設計: gold/Q119_PHASE_A_PAGE_CANARY_GATE_DESIGN_v1.md / lineage: candidate/q119pc/
//   PAGE_CANARY_GATE v1
//   DEFAULT OFF
//   PAGE-SCOPED (TAB) NOT STORY-SCOPED
//   FORMAL ROLLBACK = CLEAR FLAG + RELOAD (tab close is auxiliary)
//   DEDICATED_QA_TAB_MUST_NOT_NAVIGATE_TO_ANOTHER_STORY
//   PAGE_CANARY_TAKES_EFFECT_ONLY_AT_PAGE_LOAD
//   FLAG_MUST_BE_SET_BEFORE_PAGE_LOAD
//   kill is not per-call (reload required)
//   NOT YET FOR FINAL ACTIVATION
//   opt-in : sessionStorage['v292DQ119PageCanaryOn']  === '1'   (この tab のこの page だけ)
//   kill   : localStorage ['v292DQ119PageCanaryOff'] === '1'   (profile 全体・opt-in に勝つ)
//   既定 / storage 例外 / 未知値 → OFF（FAIL CLOSED・'1' の厳密一致のみ true）
//   OFF = production 逐語（定期再ラップによる chain 成長を含めて production と同一）
//   ON  = frozen Phase A core（candidate/q119/）逐語 = INSTALL_ONCE_PER_PAGE registry
//   ★分岐するのは wrapParse の guard だけ。wrapper 本体・marker・timer(400/1500/4000+2000)・
//     tick()/install()・off() 契約・wrapSave/wrapRender/wrapFetch は 1 文字も変えない。
// ---------------------------------------------------------------------
(function v292Dfix78(){
  'use strict';
  if (window.__v292Dfix78Active) return;
  window.__v292Dfix78Active = true;
  var TAG = '[v292Dfix78:tag-case]';
  function getPlanner(){ try { return (0,eval)('typeof Planner!=="undefined"?Planner:null'); } catch(e){ return null; } }

  // <Say/<State/</Say>/</State> 等のタグ名のみ小文字化（属性・本文は不変）
  function normalizeTags(s){
    if (typeof s !== 'string') return s;
    return s.replace(/<(\/?)(say|state)\b/gi, function(m, slash, tag){
      return '<' + slash + tag.toLowerCase();
    });
  }
  window.__v292Dfix78Normalize = normalizeTags;

  /* Q119-PC PAGE_CANARY: page 生存中の定数（load 時 1 回だけ読む・以後読み直さない）。kill(localStorage) > opt-in(sessionStorage)。既定 OFF。 */
  function pcRead(){
    try { if (window.localStorage.getItem('v292DQ119PageCanaryOff') === '1') return false; } catch(e){ return false; }
    try { return window.sessionStorage.getItem('v292DQ119PageCanaryOn') === '1'; } catch(e){ return false; }
  }
  var PAGE_CANARY = pcRead();
  // Q119 Phase A: page-scoped install registry（共通基盤は新設しない）
  function reg78(){
    var R; try{ R = window.__v292WrapReg = window.__v292WrapReg || {}; }catch(e){ R = {}; }
    return R;
  }
  function wrapParse(){
    var P, R = null;
    if (!PAGE_CANARY){
      /* ===== OFF: production 経路（production v292Dfix78 :31-32 statement 逐語） ===== */
      P = getPlanner();
      if (!P || typeof P.parsePlan !== 'function' || P.parsePlan.__v292Dfix78w) return false;
    } else {
      /* ===== ON: frozen Phase A core 経路（candidate/q119 :35-40 逐語） ===== */
      R = reg78();
      if (R.f78parse) return false;                 /* ★Q119-A INSTALL_ONCE_PER_PAGE */
      P = getPlanner();
      if (!P || typeof P.parsePlan !== 'function') return false;
      if (P.parsePlan.__v292Dfix78w){ R.f78parse = true; return false; }  /* 既に居るなら registry を合わせるだけ */
    }
    /* ===== 以下 OFF/ON 共通・production 逐語 ===== */
    var orig = P.parsePlan.bind(P);
    var prev = P.parsePlan;
    var w = function(){
      try {
        var a = arguments;
        if (a.length && typeof a[0] === 'string'){
          var args = Array.prototype.slice.call(a);
          args[0] = normalizeTags(args[0]);
          return orig.apply(this, args);
        }
      } catch(e){}
      return orig.apply(this, arguments);
    };
    try { for (var k in prev){ if (/^__v292.*w$/.test(k)) w[k] = prev[k]; } } catch(e){}
    w.__v292Dfix78w = true;
    P.parsePlan = w;
    if (PAGE_CANARY) R.f78parse = true;             /* ★registry が真実（ON のみ） */
    try { console.log(TAG, 'parsePlan wrapped'); } catch(_){}
    return true;
  }

  function tick(){ wrapParse(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tick); else tick();
  setTimeout(tick, 400); setTimeout(tick, 1500); setTimeout(tick, 4000);
  setInterval(tick, 2000);
  try { console.log(TAG, 'loaded'); } catch(_){}
})();
