// =====================================================================
// Chronicle TRPG - v292Dfix383: 呼びかけ誤帰属の自動補正（会話ログ）
// ---------------------------------------------------------------------
// 実例(2026-07-04・2件目の実測): 裸引用「立てよ、ミア」がミア名義になった
//   （実際はセイラの台詞。直前文の主語=「セイラの手が…」）。
//   fix376の補正は「主人公宛て・二者場面」限定なので対象外だった。
// ルール（保守的・二条件AND）:
//   A) 裸引用(rv!=1=判別器由来)で、自分の台詞の中に自分の名前が
//      呼びかけの形で出てくる（名前の直後が 、。！？…等か文末）
//      →人は自分に呼びかけない＝誤帰属のシグナル
//   B) 引用の直前120字に別キャラの「名前+の/は/が」がある（最後の一致を主語とみなす）
//   A∧Bの時だけ、その主語へ振替。どちらか欠けたら何もしない（誤爆より無言）。
// 対象は最新ターンのみ（過去分は手動スポット修正で対応済みの前提）。
// <say>タグ由来(rv=1)は本人申告の契約なので不触。
// 既定ON。OFF: localStorage v292Dfix383Off='1'。検証: __v292Dfix383x.dryRun()
// バックアップ: 補正直前のchr6を chr6_bk_fix383 に保存（セッション毎上書き）。
// =====================================================================
(function(){
  'use strict';
  if (window.__f383done) return; window.__f383done = 1;
  var TAG = '[v292Dfix383:vocative-fix]';
  function off(){ try { return localStorage.getItem('v292Dfix383Off') === '1'; } catch(e){ return false; } }
  /* ★fix547(2026-07-25): S の取得は index.html の正式API(fix539)を第一経路にする。
     間接eval 頼みの取得は実機で無言のまま null を返し、判定が丸ごと空振りした前歴がある。
     **第二経路は従来の式をそのまま残す**ので、index.html が古いキャッシュでも挙動は変わらない。
     判定ロジックには一切触れていない(取得経路だけの差し替え)。 */
  function getS(){
    try { var a = window.__chronicleGetState ? window.__chronicleGetState('fix383') : null; if (a) return a; } catch(e){}
    try { return window.S || (0,eval)('typeof S!=="undefined"?S:null') || null; } catch(e){ return null; }
  }
  function names(){
    var out = [];
    try {
      var S = getS();
      if (S && S.cast){
        if (S.cast.hero && S.cast.hero.name) out.push(String(S.cast.hero.name));
        (S.cast.npcs || []).forEach(function(n){ if (n && n.name) out.push(String(n.name)); });
      }
    } catch(e){}
    try {
      var QP = window.__v292QuasiPack;
      if (QP && QP.store){ Object.keys(QP.store() || {}).forEach(function(n){ if (out.indexOf(n) < 0) out.push(n); }); }
    } catch(e){}
    return out.filter(function(n){ return n && n.length >= 2; });
  }
  /* ★★fix732(RULING85 §1-§10) — NORMAL_LOAD_HISTORICAL_MUTATION_CONTAINMENT
     自動経路（タイマ / render フック / appendTurn）は
     **このセッション中に生成されたターンだけ**を対象にする。
     判定は turns.length の差分ではなく、唯一の新ターン生成口
     （index.html の S.turns.push(turn)）で登録された provenance を使う。
     → hydration 0→1 / 逐次 hydration / restore 後の regrow を新ターンと誤認しない。
     → 全 module が同一 registry を見るので module 間で baseline がズレない。
     scope module が居ない場合は false ＝ 何も自動処理しない fail-closed。
     heuristics: 変更 0 / explicit API: 全ターン対象のまま保持 / new-turn logic: 保持。 */
  function _f732New(t){
    try { var W = window.__v292Dfix732Scope; return !!(W && typeof W.isNew === 'function' && W.isNew(t)); }
    catch(e){ return false; }
  }

  var PUNCT = '、。！？!?…っッ―—';
  function findFixes(t){
    var fixes = [];
    try {
      var cs = t && t._convSays; if (!Array.isArray(cs)) return fixes;
      var narr = String(t.narrative || '');
      var all = names();
      cs.forEach(function(s, j){
        if (!s || s._rv === 1) return;
        var who = String(s.who || ''), say = String(s.say || '');
        if (!who || who.length < 2 || say.indexOf(who) < 0) return;
        // A) 呼びかけ形か（名前の直後が句読点/文末）
        var ok = false, k = -1;
        while ((k = say.indexOf(who, k + 1)) >= 0){
          var after = say.charAt(k + who.length);
          if (after === '' || PUNCT.indexOf(after) >= 0){ ok = true; break; }
        }
        if (!ok) return;
        // B) 直前120字の最後の「別キャラ名+の/は/が」を主語とみなす
        var qi = narr.indexOf(say); if (qi < 0) return;
        var before = narr.slice(Math.max(0, qi - 120), qi);
        var subj = '', subjPos = -1;
        for (var i = 0; i < all.length; i++){
          var n = all[i]; if (n === who) continue;
          var re = new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(の|は|が)', 'g');
          var m, pos = -1;
          while ((m = re.exec(before))) pos = m.index;
          if (pos > subjPos){ subjPos = pos; subj = n; }
        }
        if (subj) fixes.push({ j: j, from: who, to: subj, say: say.slice(0, 24) });
      });
    } catch(e){}
    return fixes;
  }
  var lastLen = -1;
  function tick(){
    if (off()) return;
    var S = getS(); if (!S || !Array.isArray(S.turns) || !S.turns.length) return;
    var tl = S.turns.length;
    if (tl === lastLen) return;
    lastLen = tl;
    if (!_f732New(S.turns[tl - 1])) return;      /* ★★fix732: 過去ターンには自動適用しない */
    try {
      var t = S.turns[tl - 1];
      var fixes = findFixes(t);
      if (!fixes.length) return;
      try { localStorage.setItem('chr6_bk_fix383', localStorage.getItem('chr6') || ''); } catch(e){}
      fixes.forEach(function(f){ t._convSays[f.j].who = f.to; });
      try { if (!document.hidden && S.save) S.save(); } catch(e){}
      try {
        var cards = document.querySelectorAll('.v292-dlg-card');
        for (var i = 0; i < cards.length; i++) cards[i].parentNode.removeChild(cards[i]);
        if (window.__v292Dfix66 && window.__v292Dfix66.repair) window.__v292Dfix66.repair();
      } catch(e){}
      try { console.log(TAG, 'reattributed:', JSON.stringify(fixes)); } catch(e){}
    } catch(e){}
  }
  setTimeout(function(){ tick(); setInterval(tick, 2000); }, 6000);
  window.__v292Dfix383x = {
    dryRun: function(idx){
      var S = getS(); if (!S || !S.turns) return null;
      var i = (idx == null) ? S.turns.length - 1 : idx;
      return findFixes(S.turns[i]);
    }
  };
  try { console.log(TAG, 'loaded (off=' + (off() ? '1' : '0') + ')'); } catch(e){}
})();
