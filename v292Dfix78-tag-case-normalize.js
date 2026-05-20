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

  function wrapParse(){
    var P = getPlanner();
    if (!P || typeof P.parsePlan !== 'function' || P.parsePlan.__v292Dfix78w) return false;
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
    try { console.log(TAG, 'parsePlan wrapped'); } catch(_){}
    return true;
  }

  function tick(){ wrapParse(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tick); else tick();
  setTimeout(tick, 400); setTimeout(tick, 1500); setTimeout(tick, 4000);
  setInterval(tick, 2000);
  try { console.log(TAG, 'loaded'); } catch(_){}
})();
