// =====================================================================
// Chronicle TRPG - v292Dfix453: アイコンの src 書き込みを1フレームに合体（点滅の根治・第2弾）
// ---------------------------------------------------------------------
// ★2026-07-13 本番の長期プレイテスト（20ターン）で実測した事実:
//   fix450 で v292Dfix356 の「removeAttribute→再代入」を止めたが、点滅がまだ残った。
//   会話ログ内の同一 img（湊 海斗のアイコン）で src の種別が
//       data: → server(workers.dev/img)  が **1ターンあたり40回** 切り替わっていた。
//   書き手（スタック実測）:
//     - features.js  applyAvatar (:10554)      … ローカルの data: を入れる
//     - v292Dfix197  applyOne                  … fix400 のサーバーURLに書き戻す
//     - v292Dfix356  setSrc                    … （fix450 で激減。残り数回）
//   つまり **複数の実装が同じ img を奪い合い、毎レンダーで data: ⇄ server を往復**していた。
//   ブラウザは data: をデコードしてからサーバー画像へ差し替えるため、**目に見えるチラつき**になる。
//
// 本fix: 「誰が書いたか」を裁定しない。**同じ img への src 書き込みを1フレームに合体し、
//   最後の値だけを実際に適用する**（中間値は DOM に触れさせない）。
//   → 書き手が何人いても、1フレームに1回しか画像は変わらない ＝ 点滅の燃料が消える。
//
// 対象: 会話ログ / キャラ一覧の中の img（`[data-avpk]` を持つ、または .dlg/.conv 系の中）だけ。
//   それ以外（場面画・カバー・DiceBear 単体など）は一切触らない。
//
// ⚠️ fix419c の教訓: setter ラップは内側の own props を全継承する。
// ⚠️ fix430（carrier 遮断）/ fix437（再生成の即時反映）より **外側** に置く必要がある
//    （最後に書かれた値＝それらの意図した最終値、を1回だけ適用したいため）。
//    → index.html では最後尾に読み込む。
//
// 冪等: window.__v292Dfix453 / setter 上フラグ _f453
// OFF: localStorage.v292Dfix453Off = '1'（live評価・リロード不要）
// 検証口: window.__v292Dfix453.stats()
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix453 && window.__v292Dfix453.__armed) return;
  var TAG = '[v292Dfix453:src-coalesce]';

  function off(){
    try { return localStorage.getItem('v292Dfix453Off') === '1'; } catch(e){ return false; }
  }

  var stats = { writes: 0, coalesced: 0, applied: 0, lastAt: 0 };

  // 対象の img か（会話ログ/キャラ一覧のアバターだけ）
  function isAvatarImg(img){
    try {
      if (!img || img.tagName !== 'IMG') return false;
      if (img.getAttribute('data-avpk')) return true;
      if (img.closest && img.closest('[class*="dlg"], [class*="conv"], [class*="char"]')) return true;
    } catch(e){}
    return false;
  }

  var d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  if (!d || !d.set || d.set._f453) { return; }

  var innerSet = d.set;
  var innerGet = d.get;

  // img ごとの「保留中の最終値」
  var PENDING = '__f453pending';
  var SCHEDULED = '__f453sched';

  function flush(img){
    try {
      img[SCHEDULED] = false;
      var v = img[PENDING];
      img[PENDING] = undefined;
      if (v === undefined) return;
      var cur = '';
      try { cur = innerGet ? innerGet.call(img) : (img.getAttribute('src') || ''); } catch(e){}
      // 同じ値なら書かない（無駄な再デコードを避ける）
      if (String(cur) === String(v)) return;
      stats.applied++;
      stats.lastAt = Date.now();
      innerSet.call(img, v);
    } catch(e){}
  }

  var wrapped = function(v){
    try {
      if (off() || !isAvatarImg(this)) { return innerSet.call(this, v); }
      stats.writes++;
      var img = this;
      if (img[PENDING] !== undefined) stats.coalesced++;   // 前の値は捨てられる＝合体した
      img[PENDING] = v;
      if (!img[SCHEDULED]) {
        img[SCHEDULED] = true;
        var run = function(){ flush(img); };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
        else setTimeout(run, 16);
      }
      return;
    } catch(e){
      try { return innerSet.call(this, v); } catch(_){}
    }
  };
  // ★fix419c: 内側 setter の own props を全継承
  try { Object.keys(innerSet).forEach(function(k){ wrapped[k] = innerSet[k]; }); } catch(e){}
  wrapped._f453 = true;

  try {
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      configurable: true,
      enumerable: d.enumerable,
      get: innerGet,
      set: wrapped
    });
  } catch(e){
    try { console.warn(TAG, 'defineProperty failed', e && e.message); } catch(_){}
    return;
  }

  window.__v292Dfix453 = {
    __armed: true,
    stats: function(){ return stats; },
    isAvatarImg: isAvatarImg,
    isOff: off
  };
  try { console.log(TAG, 'armed (avatar src writes are coalesced per animation frame)'); } catch(e){}
})();
