// =====================================================================
// Chronicle TRPG - v292Dfix732: SESSION TURN SCOPE（共有 session baseline）
//
// ■なぜ必要か（RULING85 §2-§10）
//   normal open / load の副作用として、複数の module が **保存済みの過去ターン**の
//   話者(_convSays[].who) や登場フラグ(cast.npcs[].appeared) を書き換え、save まで到達していた。
//   これを止めるだけなら簡単だが、同じ module が「新しく生成されたターンの正規化」も
//   担っているため、単純にタイマを止めると新ターンの正しい機能まで死ぬ。
//
//   最初の案は「turns.length が +1 なら新ターン」という推定だったが、これは
//     ・1 ターン物語の hydration 0 → 1
//     ・逐次 hydration 0 → 1 → 2 → …
//     ・restore で縮んでから 1 件ずつ戻る regrow
//   を「ユーザーが 1 ターン進めた」と区別できない（RULING85 §2-§5 BLOCKER A）。
//   また module ごとに初回観測時刻が違う（1.5s〜7s）ため、module-local な
//   「最初に見えたターン数」を基準にすると module 間で baseline がズレる（同 §8-§10）。
//
// ■方針
//   長さの差分ではなく **provenance** を使う。
//   「このターンはこのセッション中に生成された」という事実を、唯一の新ターン生成口
//   （index.html の S.turns.push(turn)）で ephemeral に記録する。
//   記録は WeakSet（**ターンオブジェクトの同一性**）で持つ。
//
// ■この設計が満たすこと
//   ・hydration / restore / import で作られたターンオブジェクトは **絶対に mark されない**
//     （どんな長さ遷移でも historical のまま）
//   ・全 module が **同一の registry** を参照するので baseline がズレない
//   ・localStorage / sessionStorage / story body へ 1 バイトも書かない（永続化しない）
//   ・reload すると全ターンが historical に戻る（安全側）
//
// ■やらないこと
//   ・turn オブジェクトへプロパティを生やさない（canonical body / hash を汚さない）
//   ・undo/redo の復元ターン（features.js actRedo）は mark しない＝ historical 扱い
//   ・fix95 の new-turn path には触れない
//
// 冪等: window.__v292Dfix732Scope
// 検証口: window.__v292Dfix732Scope = { markNew, isNew, newIndexes, stats, __armed }
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix732Scope) return;
  var TAG = '[v292Dfix732:session-turn-scope]';

  var HAS_WS = (typeof WeakSet === 'function');
  var NEW = HAS_WS ? new WeakSet() : null;
  var FALLBACK = [];                 /* WeakSet 不在環境のみ（保持数を上限で抑える） */
  var FALLBACK_CAP = 64;
  var stats = { marked: 0, isNewTrue: 0, isNewFalse: 0, weakset: HAS_WS };

  /* 新ターン生成口から呼ばれる。ここ以外から呼ばない。 */
  function markNew(turn){
    if (!turn || typeof turn !== 'object') return false;
    try {
      if (NEW) NEW.add(turn);
      else {
        if (FALLBACK.indexOf(turn) < 0) FALLBACK.push(turn);
        while (FALLBACK.length > FALLBACK_CAP) FALLBACK.shift();
      }
    } catch(e){ return false; }
    stats.marked++;
    return true;
  }

  /* このターンがこのセッションで生成されたか。
     判定できない・登録が無い場合は false（= historical 扱い）＝ fail-closed。 */
  function isNew(turn){
    if (!turn || typeof turn !== 'object'){ stats.isNewFalse++; return false; }
    var r = false;
    try { r = NEW ? NEW.has(turn) : (FALLBACK.indexOf(turn) >= 0); } catch(e){ r = false; }
    if (r) stats.isNewTrue++; else stats.isNewFalse++;
    return r;
  }

  /* 検証用（純粋・副作用なし）。S.turns のうち session-new な index の一覧。 */
  function newIndexes(S){
    var out = [];
    try {
      var t = S && S.turns;
      if (!t || !t.length) return out;
      for (var i = 0; i < t.length; i++) if (isNew(t[i])) out.push(i);
    } catch(e){}
    return out;
  }

  window.__v292Dfix732Scope = {
    __armed: true,
    markNew: markNew,
    isNew: isNew,
    newIndexes: newIndexes,
    stats: function(){ return JSON.parse(JSON.stringify(stats)); }
  };
  try { console.log(TAG, 'loaded (weakset=' + (HAS_WS ? '1' : '0') + ')'); } catch(e){}
})();
