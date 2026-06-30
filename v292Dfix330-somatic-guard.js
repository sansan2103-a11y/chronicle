// =====================================================================
// Chronicle TRPG - v292Dfix330: 身体の現実(Somatic)ガード ― モードD禁止の最小恒久版
//   背景(おしん+Claude+GPT5.5往復3+DeepResearch・2026-06-30): 「致命傷でも反応が薄い/
//     精神的に喰らわない/体位・物理が不自然」の根=モデルが現実に存在しない「モードD」
//     (冷静+鋭い戦術計算+流暢な長セリフ+全能力維持)を書くこと。受傷時の現実は3モード
//     (A=アドレナリン性鎮痛/B=解離/C=緊張性不動)で、いずれも能力に必ず代償を伴う。
//   設計: 感情を強制せず「能力と認知に制約を与える」。モード名はモデルに見せず、
//     "失われる能力/残る能力"を自然文で示す。モードDの正体=4つの同時成立
//     (長流暢会話+広域把握+二手先最適戦術+精密持続動作)→これを禁止すれば消える。
//   実装: Planner.build 最外ラップで sys 末尾に注入(fix324と同方式)。非__v292マーク
//     (__fix330wrap)で fix274 の __v292* 継承による誤スキップを回避。MARKER 重複チェックで冪等。
//   検証: fix297欄での手動A/B(深夜の廃校・妖怪戦)でモードD明確に減・ラベル漏れ無・物理矛盾無・
//     キャラ差保持・過補正無を確認。暫定デフォルトON。OFF=localStorage v292Dfix330Off='1'
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix330) return; window.__v292Dfix330 = true;
  var TAG = '[v292Dfix330:somatic]';
  function off(){ try { return localStorage.getItem('v292Dfix330Off') === '1'; } catch(e){ return false; } }

  var MARK = '【身体の現実（内部規則・最優先）】';
  var GUARD = [
    '',
    MARK,
    '明白な重い受傷、逃走や身体操作を大きく妨げる脅威、または実効的な拘束下では、人物に状態相応の能力上限を出す。長い流暢な会話、広い状況把握、複数手順の最適化、精密で持続する動作を同時に成立させない。状態が重いほど、注意・判断・発話・動作の制約を強める。',
    '静かでよいが、全能力を保たせない。一点への偏り、慣れた手順への退行、動作や発話の詰まりなど、少なくとも一つの能力上の偏りを示す。叫び、涙、うめき、震えは標準反応にしない。外見の派手さと制約の強さを同一視しない。',
    '性格と技能は残った選択肢の使い方を変えるだけで、失った能力を戻さない。話せない、または動けない主要人物にも、そのターンに読める身体反応を一つ残し、無反応で場面を止めない。反応を同じ描写で反復しない。',
    '身体行為は、支え、実効的拘束、使える手足、距離、向き、遮蔽と矛盾させない。主人公には身体上の制約だけを適用し、内面・台詞・意図は決めない。指示名や内部語を本文・台詞に出さない。根拠が曖昧なら、勝手に重傷・強い恐怖・拘束として扱わない。'
  ].join('\n');

  function getPlanner(){ try { return window.Planner || (typeof Planner !== 'undefined' ? Planner : null); } catch(e){ return null; } }
  function wrap(){
    var P = getPlanner(); if (!P || typeof P.build !== 'function') return false;
    if (P.__fix330wrap) return true;                 // 非__v292マーク(fix274継承回避)
    var orig = P.build.bind(P);
    P.build = function(){
      var r = orig.apply(this, arguments);
      try {
        if (!off() && r && typeof r.sys === 'string' && r.sys.indexOf(MARK) < 0){
          r.sys = r.sys + '\n' + GUARD;
        }
      } catch(e){}
      return r;
    };
    P.__fix330wrap = true;
    try { console.log(TAG, 'build wrap installed; bodyRealityGuard:', off()?'off':'on'); } catch(_){}
    return true;
  }
  (function poll(){ poll._n = (poll._n || 0) + 1; if (wrap()) return; if (poll._n > 80) return; setTimeout(poll, 400); })();
  try { setInterval(wrap, 2500); } catch(e){}

  window.__v292Dfix330api = { wrapped: function(){ var P = getPlanner(); return !!(P && P.__fix330wrap); }, off: off, MARK: MARK, GUARD: GUARD };
  try { console.log(TAG, 'loaded'); } catch(_){}
})();
