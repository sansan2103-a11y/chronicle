// =====================================================================
// Chronicle TRPG - v292Dfix385: 口調の自己治癒（「俺」自己強化ループの切断）
// おしん依頼 2026-07-04「会話ログの俺を確認、原因を根本から修正」
// ---------------------------------------------------------------------
// 実測: turn17でセイラ(女性)が「そのまま刺せ！ 俺は上を狙う——」と発話。
//   【口調】(fix377)は毎ターン乗っているが、モデルの確率的違反はゼロにできない。
//   問題の本質は違反そのものより「履歴に残った違反を以後のターンが真似る」
//   自己強化ループ(セイラturn6→11の揺れで実証済み)。
// 対策: 生成データの直近1ターンをスキャンし、キャラの性別と矛盾する一人称
//   (女性の俺/オレ/僕等・男性のあたし等)をsayに見つけたら、次の生成の
//   sysに1ターンだけ【口調訂正】を注入(fix379レジストリ経由):
//   「直前の「俺」は誤記。〈名前〉の一人称はこれではない。踏襲するな」
//   本文は書き換えない(創作物の改変はしない)。違反が履歴から流れれば注入も消える。
// 既定ON。OFF: localStorage v292Dfix385Off='1'。検証: __v292Dfix385x.scan()
// =====================================================================
(function(){
  'use strict';
  if (window.__f385done) return; window.__f385done = 1;
  var TAG = '[v292Dfix385:voice-correction]';
  function off(){ try { return localStorage.getItem('v292Dfix385Off') === '1'; } catch(e){ return false; } }
  function getS(){ try { return window.S || (0,eval)('typeof S!=="undefined" ? S : null'); } catch(e){ return null; } }
  var MALE_FP = ['俺','オレ','おれ','僕','ボク','ぼく','ワシ'];
  var FEMALE_FP = ['あたし','アタシ','ウチ'];
  function normGender(g){
    g = String(g || '');
    if (/女|female|girl|woman/i.test(g)) return '女性';
    if (/男|male|boy|man/i.test(g)) return '男性';
    return '';
  }
  function genderOf(name){
    try {
      var S = getS(); if (!S || !S.cast) return '';
      var h = S.cast.hero;
      if (h && h.name === name) return normGender(h.gender);
      var ns = S.cast.npcs || [];
      for (var i = 0; i < ns.length; i++){ if (ns[i] && ns[i].name === name) return normGender(ns[i].gender); }
      var QP = window.__v292QuasiPack;
      if (QP && QP.store){ var q = (QP.store() || {})[name]; if (q && q.est && q.est.g) return q.est.g; }
    } catch(e){}
    return '';
  }
  function hasToken(say, list){
    for (var i = 0; i < list.length; i++){
      var k = say.indexOf(list[i]);
      if (k < 0) continue;
      var after = say.charAt(k + list[i].length);
      if (after === '' || 'はがもをにでとのだねよさ、。．！？!?…たち達'.indexOf(after) >= 0) return list[i];
    }
    return '';
  }
  function scan(){
    var hits = [];
    try {
      var S = getS(); if (!S || !Array.isArray(S.turns) || !S.turns.length) return hits;
      var t = S.turns[S.turns.length - 1];
      var cs = t && t._convSays; if (!Array.isArray(cs)) return hits;
      cs.forEach(function(s){
        if (!s || !s.who || !s.say) return;
        var g = genderOf(String(s.who));
        if (!g) return;
        var bad = '';
        if (g === '女性') bad = hasToken(String(s.say), MALE_FP);
        else if (g === '男性') bad = hasToken(String(s.say), FEMALE_FP);
        if (bad) hits.push({ who: String(s.who), bad: bad, g: g });
      });
    } catch(e){}
    return hits;
  }
  function block(){
    if (off()) return '';
    var hits = scan();
    if (!hits.length) return '';
    var lines = hits.map(function(h){
      return h.who + 'が直前のターンで「' + h.bad + '」と発話したのは誤記である。' + h.who + 'は' + h.g + 'で、この一人称は使わない';
    });
    try { console.log(TAG, 'correction active:', JSON.stringify(hits)); } catch(e){}
    return '\n【口調訂正】' + lines.join('。') + '。以後この誤りを踏襲せず、正しい一人称で書く。';
  }
  window.__f379reg = window.__f379reg || [];
  window.__f379reg.push({ off: 'v292Dfix385Off', marker: '【口調訂正】', text: block });
  window.__v292Dfix385x = { scan: scan, block: block };
  try { console.log(TAG, 'loaded (off=' + (off() ? '1' : '0') + ')'); } catch(e){}
})();
