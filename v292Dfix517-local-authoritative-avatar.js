// =====================================================================
// Chronicle TRPG - v292Dfix517: ローカル実画像があれば表示をローカル優先(P1・恒久化)
// ---------------------------------------------------------------------
// 位置づけ: fix516b(手動↻したキャラだけローカル優先)の【一般化＝恒久化P1】。
//   fix516bは「凍結pk」に限定していたが、本fixは「その端末に有効なローカルdata:画像が
//   実在する全pk」へ拡張する。これで手動↻に限らず、リロードで古い絵に戻る問題を
//   同一端末で恒久的に解消する(=P1: 同端末で定着の根治)。
//
// 真因(再掲・fix515プローブで確定): 表示は fix400 のサーバー配信URL(/img?ns&k)を最優先。
//   サーバーに画像が無い(404)と保存済みの新しいローカル画像へ降りず古い絵が残る。
//   → ローカルに実画像がある時はローカルが正しい。無い時だけサーバー(iOS IDB回避)。
//
// なぜ全pkへ拡張しても今は安全か(P2到来までの不変条件):
//   ・初回生成は seed 固定で決定論的＝各端末が生成しても同一画像(cross-device一致は
//     サーバー同期でなく決定性で担保)。
//   ・手動↻の再生成画像は、同期のpush判定(fix399 imgHash=キー集合のみ)が中身変化を
//     検知しないため【サーバーへ上がらない】(=C4)。よって「サーバーの方が新しい」状態は
//     現状発生しない。ローカル優先で不整合は起きない。
//   ・P2(regenのサーバー反映＋pull差し替え)導入後は、pull側がローカルを最新へ更新するので
//     「ローカル実画像=常に最新」が保たれ、本fixのローカル優先はそのまま正しく機能する
//     (本fixはP2と前方互換。世代判定は表示層でなくP2のpull側が担う)。
//
// 二段構え(いずれも「有効なローカルdata:画像が今ある時だけ」作用・無ければ必ずfail-open):
//   (A) fix400.urlFor(pk) 透過ラップ: ローカル有→'' を返す(fix197がサーバURLを使わず
//       cache/persistのローカルへ降りる)。ローカル無→元のurlFor(pk)をそのまま返す。
//   (B) 保険 forceLocal: data-avpk を持つ<img>で、そのpkにローカル有なら src をローカル
//       data:URLへ張替(サーバURLの残留を掃く)。ローカル無なら一切触らない。
//
// ローカル有無の判定: localStorage.getItem('v292av2_'+pk)。fix346のラッパにより
//   v292av2_* キーは mem(IDB由来)から同期返却される＝実dataURLが取れる。
//
// 有効化(★fix517bで既定ON): v292Dfix517Off!=='1' で全端末有効(旧v292Dfix517OnV1は不要・残っても無害)
//   ※ONにすると fix516b(凍結pk限定)を包含する(P1 ⊇ fix516b)。fix516bはそのままでも
//     二重に'' を返すだけで無害(冪等)。既定ON化・fix516b/515撤去はローカルgit整理の回に。
// 冪等ガード: window.__v292Dfix517.__armed(fix400ラップは urlFor 上の __f517 で二重防止)
// 検証口: window.__v292Dfix517 = { on, hasLocal, wrapped, status }
// ※node検証可能: document/IDBに触れず起動できる(forceLocalはDOM有時のみ)。
// =====================================================================
(function(){
  'use strict';
  var W = (typeof window !== 'undefined') ? window : this;
  if (W.__v292Dfix517 && W.__v292Dfix517.__armed) return;
  var TAG = '[v292Dfix517:local-authoritative]';
  var PREFIX = 'v292av2_';

  function off(){ try { return W.localStorage.getItem('v292Dfix517Off') === '1'; } catch(e){ return false; } }
  function on(){ try { return !off(); } catch(e){ return true; } }   // ★fix517b: 既定ON(v292Dfix517Off!=='1' で有効)。opt-in判定は撤去し全端末で有効化。

  // pk のローカル実画像(data:)を返す。無ければ ''。fix346ラッパでmem/IDBから同期取得。
  function localImgFor(pk){
    if (!pk) return '';
    try {
      var k = /^v292av2_/.test(pk) ? pk : (PREFIX + pk);
      var v = W.localStorage.getItem(k);
      return (typeof v === 'string' && v.indexOf('data:') === 0) ? v : '';
    } catch(e){ return ''; }
  }
  function hasLocal(pk){ return !!localImgFor(pk); }

  // ---------- (A) fix400.urlFor ラップ ----------
  var wrappedUrlFor = false;
  function wrapUrlFor(){
    if (wrappedUrlFor) return true;
    var f400 = W.__v292Dfix400;
    if (!f400 || typeof f400.urlFor !== 'function') return false;
    if (f400.urlFor.__f517) { wrappedUrlFor = true; return true; }
    var orig = f400.urlFor;
    var w = function(pk){
      try {
        if (on() && hasLocal(pk)) return '';   // ローカル有→サーバURL抑止(fix197がローカルへ降りる)
      } catch(e){}
      return orig.apply(this, arguments);      // ローカル無/OFF→元のurlFor(=fail-open・iOS安全)
    };
    // own props 全継承(再ラップ地獄防止・fix419cの教訓)
    try {
      Object.getOwnPropertyNames(orig).forEach(function(k){
        if (k === 'length' || k === 'name' || k === 'arguments' || k === 'caller' || k === 'prototype') return;
        try { Object.defineProperty(w, k, Object.getOwnPropertyDescriptor(orig, k)); } catch(e){}
      });
    } catch(e){}
    w.__f517 = true;
    try { f400.urlFor = w; } catch(e){ return false; }
    wrappedUrlFor = true;
    try { console.log(TAG, 'wrapped fix400.urlFor'); } catch(e){}
    return true;
  }

  // ---------- (B) 保険 forceLocal(DOM有時のみ) ----------
  function forceLocalSweep(){
    try {
      if (!on() || typeof document === 'undefined' || !document.getElementsByTagName) return;
      var imgs = document.getElementsByTagName('img');
      for (var i = 0; i < imgs.length; i++){
        var img = imgs[i];
        var pk = img.getAttribute && img.getAttribute('data-avpk');
        if (!pk) continue;
        var loc = localImgFor(pk);
        if (!loc) continue;                                  // ローカル無→触らない(fail-open)
        if (img.getAttribute('src') !== loc){ try { img.onerror = null; img.src = loc; } catch(e){} }
      }
    } catch(e){}
  }

  // ---------- 起動配線 ----------
  function arm(){
    wrapUrlFor();
    // fix400 は後から生えることがある→出現までポーリング(最大~20秒)
    if (!wrappedUrlFor){
      var tries = 0;
      var iv = setInterval(function(){ tries++; if (wrapUrlFor() || tries > 40){ try { clearInterval(iv); } catch(e){} } }, 500);
    }
    // forceLocal は周期＋DOM変化で(fix197のsweepと収束・同一dataURLへ)
    try {
      if (typeof document !== 'undefined'){
        if (typeof setInterval === 'function') setInterval(forceLocalSweep, 1500);
        if (typeof MutationObserver !== 'undefined' && document.documentElement){
          try {
            var mo = new MutationObserver(function(){ forceLocalSweep(); });
            mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src','data-avpk'] });
            W.__v292Dfix517Observer = mo;
          } catch(e){}
        }
        forceLocalSweep();
      }
    } catch(e){}
  }

  W.__v292Dfix517 = {
    __armed: true,
    on: on,
    hasLocal: hasLocal,
    localImgFor: localImgFor,
    wrapped: function(){ return wrappedUrlFor; },
    forceLocalSweep: forceLocalSweep,
    status: function(){ return { armed: true, on: on(), wrappedUrlFor: wrappedUrlFor, fix400: !!(W.__v292Dfix400) }; }
  };
  arm();
  try { console.log(TAG, 'armed; on:', on() ? 'on' : 'off(preview)', 'fix400:', !!(W.__v292Dfix400)); } catch(e){}
})();
