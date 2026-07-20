// =====================================================================
// Chronicle TRPG - v292Dfix512: 話者タグ付けの補強（口調/一人称/呼称）純粋transform
// ---------------------------------------------------------------------
// 背景(2026-07-20): 実プレイで「なにすんねん、せんぱい…！」(ひなたの関西弁)が主人公(澪)に
//   付く"丸ごと別人"ミスを確認。真因=判定器fix469は名前トークン中心で採点し、名前の無い
//   セリフを主人公へ流しやすい。口調(方言・一人称)や「先輩」呼びの手がかりを使えていない。
//   fix469本体(features.js・クロージャ束縛)はクラウドから安全に触れない→"源流"のモデル側
//   タグ付けを強める。fix509/510と同じ fix441の最終sysパイプラインへ純粋transformを追加。
//   これでモデルが最初から正しい<say who>を付ければ、判定器の推測に頼らず改善する。
//   ※判定器側(fix469)の口調スコアリングはローカルGit回で別途(shadow→自動補正)。
// fetch非ラップ・fix504予算/fix459 MARKER不触・fail-open・既定ON・OFF=v292Dfix512Off。
// 検証口: window.__v292Dfix512 = { rewrite, wouldChange, isOff, last, status }
// =====================================================================
(function(){
  'use strict';
  var W = (typeof window !== 'undefined') ? window : this;
  if (W.__v292Dfix512 && W.__v292Dfix512.__armed) return;
  var TAG = '[v292Dfix512:say-attribution]';

  var A = '囲む（who は実際に喋った本人の名前）。地の文に裸の「」';
  var B = '囲む（who は実際に喋った本人の名前）。★声の主は口調・一人称・方言で見分け、その口調の人物を who にする（別人の声・憑依・混線でも実際に声を発した本人で付ける）。自分自身を「先輩」と呼ばない（「先輩」と呼ぶのは後輩側）。地の文に裸の「」';
  var KEEP = ['<say', '<state', '声の主は口調・一人称・方言で見分け', '実際に喋った本人の名前'];

  function off(){ try { return localStorage.getItem('v292Dfix512Off') === '1'; } catch(e){ return false; } }
  function active(){ return !off(); }
  var last = null;

  function rewrite(sys){
    var s = String(sys == null ? '' : sys);
    if (!s || off()) return sys;
    if (s.indexOf(B) >= 0) return sys;                  // 既に適用済（冪等）
    if (s.indexOf(A) < 0) return sys;                   // anchor無し=no-op(fail-open)
    var out = s.replace(A, B);
    if (out.length <= s.length) return sys;
    if (out.length - s.length > 200) return sys;
    for (var i=0;i<KEEP.length;i++){ if (out.indexOf(KEEP[i]) < 0) return sys; }
    last = { before: s.length, after: out.length, added: out.length - s.length };
    try { console.log(TAG, 'say-attribution rule applied (+' + last.added + '字)'); } catch(e){}
    return out;
  }
  function wouldChange(sys){ return rewrite(sys) !== sys; }

  W.__v292Dfix512 = {
    __armed: true, rewrite: rewrite, wouldChange: wouldChange,
    active: active, isOff: off, last: function(){ return last; },
    status: function(){ return { armed:true, on:active(), last:last }; }
  };
  try { console.log(TAG, 'armed (say-attribution reinforce for fix441 pipeline); on:', active() ? 'on(default)' : 'off'); } catch(e){}
})();
