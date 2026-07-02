// =====================================================================
// Chronicle TRPG - v292Dfix361: Phase B残り2本柱（★プレビュー・既定OFF）
// 研究(2026-07-01「整合とbalanceとprose-first」)の実装スライス。friendsライブ不変。
// A) reconcile-in-narration（有効化: localStorage v292Dfix361='1'）
//    種や設定の要素が衝突して見えても、どちらかを消さず「両方真」として
//    因果を紡がせる短い指示をsys末尾に注入。★過剰制約は平板化(oatmeal)を招く
//    という研究結論に従い、ハード禁止は「真の世界状態矛盾」だけの最小文面(~300字)。
// B) prose-first開幕（有効化: localStorage v292Dfix362='1'）
//    開幕ターン(S.turns.length===0)のみ、in medias resの鮮烈な散文で始める指示を注入。
//    ※フル版(種→散文→構造抽出の二段生成)は次段。まず開幕文の質だけ上げる軽量版。
// 実装ルール順守: sys注入はPlanner.buildラップ(_extensionsは死に経路)・
//    冪等ガードは非__v292名マーク(fix274継承バグ対策)・注入有無はsys内マーカー文字列で判定。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix361) return; window.__v292Dfix361 = true;
  var TAG = '[v292Dfix361:phaseB]';
  function onA(){ try{ return localStorage.getItem('v292Dfix361')==='1'; }catch(e){ return false; } }
  function onB(){ try{ return localStorage.getItem('v292Dfix362')==='1'; }catch(e){ return false; } }
  function getS(){ try{ if (window.S) return window.S; return (0,eval)('S'); }catch(e){ return null; } }

  var BLOCK_A = '\n【共存の原則】設定や種の要素が食い違って見えても、どちらかを無かったことにしない。両方を真実として扱い、その二つが同じ世界に併存するに至った因果や歴史を、説明ではなく描写と出来事でにじませる。禁止するのは確定済みの世界状態と直接矛盾する記述（死者が理由なく生き返る等）だけ。奇妙な組み合わせは事故ではなく、この世界の個性である。';
  var BLOCK_B = '\n【開幕の流儀】最初の場面は状況説明や設定の羅列から始めない。すでに動いている出来事のただ中（in medias res）から、五感に訴える具体的な描写で始める。世界の説明は行動と細部に織り込み、読者が「何かが起きている」と一文目で感じる開幕にする。';

  function armWrap(){
    var P = null;
    try { P = window.Planner || (0,eval)('Planner'); } catch(e){}
    if (!P || typeof P.build !== 'function' || P.build._f361mark) return !!(P && P.build && P.build._f361mark);
    var ob = P.build;
    var w = function(){
      var r = ob.apply(this, arguments);
      try {
        if (r && typeof r.sys === 'string') {
          if (onA() && r.sys.indexOf('【共存の原則】') < 0) r.sys += BLOCK_A;
          if (onB() && r.sys.indexOf('【開幕の流儀】') < 0) {
            var S = getS();
            if (S && S.turns && S.turns.length === 0) r.sys += BLOCK_B;
          }
        }
      } catch(e){}
      return r;
    };
    w._f361mark = true; // 非__v292名(fix274のフラグ継承バグ対策)
    P.build = w;
    return true;
  }
  if (!armWrap()) { var n = 0; var iv = setInterval(function(){ if (armWrap() || ++n > 60) clearInterval(iv); }, 500); }

  try{ console.log(TAG, 'loaded; reconcile:', onA()?'ON':'off', '/ prose-first:', onB()?'ON':'off'); }catch(_){}
})();
