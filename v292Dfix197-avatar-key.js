// =====================================================================
// Chronicle TRPG - v292Dfix197: アイコン修復（pollinations 402 対策）
// ---------------------------------------------------------------------
// 背景:
//   image.pollinations.ai が匿名(トークン無し)リクエストを 402 Payment Required で
//   弾くようになり、AIアイコンが全滅＋onerror がコンソールを汚していた。
//   pollinations は「無料だが要APIキー」化（GETは ?key=pk_... で渡せる）。
//
// 方針（おしん選択=A: AIアイコン維持＋安全網）:
//   ・設定の pollKey(publishable key, pk_...) があれば、全 pollinations 画像URLに
//     &key= を付けて AI 生成を復活（フォトリアル風アニメ portrait 維持）。
//   ・キーが無い間は、正方形のアバター画像だけ DiceBear(lorelei, 無料・認証不要)に
//     差し替えて即座に表示（シーン画像 512x288 等は対象外）。
//   ・onerror で起きていた「textContent of null」クラッシュも、pollinations を
//     先に置換するので発生しなくなる。
//
//   URL生成箇所がコード中に10箇所散在するため、個別修正でなく「描画後の img を
//   1箇所でスイープして直す」方式（既存の avatar sweep と同方式）。完全可逆。
// =====================================================================
(function(){
  'use strict';
  var TAG = '[v292Dfix197:avatar-key]';
  var DICE_STYLE = 'lorelei';   // 無料フォールバックのDiceBearスタイル

  function pollKey(){
    try{ var S = window.S || (0,eval)('S'); var k = (S && S.cfg && S.cfg.pollKey) || ''; return String(k).trim(); }catch(e){ return ''; }
  }
  function diceUrl(name){
    var seed = encodeURIComponent(String(name || 'character'));
    return 'https://api.dicebear.com/9.x/' + DICE_STYLE + '/svg?seed=' + seed;
  }
  // 正方形(=アバター)の pollinations URL か？ シーン画像(512x288等)は除外。
  function isSquareAvatar(src){
    var m = /[?&]width=(\d+)&height=(\d+)/.exec(src);
    if (!m) return true;            // サイズ未指定はアバター扱い（安全側）
    return m[1] === m[2];
  }

  function fixImg(img){
    var src = img.getAttribute('src') || '';
    if (src.indexOf('image.pollinations.ai') < 0) return;
    var name = img.getAttribute('alt') || (/[?&]seed=([^&]+)/.exec(src) || [])[1] || 'character';
    var k = pollKey();
    if (k){
      // キーあり → AI生成を試みる。ただし正方形アバターは、生成失敗（残高不足=402等）時に
      //   DiceBear へ確実に落ちるよう onerror を毎回上書き（features.jsの再試行/"?"クラッシュより優先）。
      if (isSquareAvatar(src)){
        img.onerror = function(){ try{ img.onerror = null; img.src = diceUrl(name); }catch(e){} };
      }
      // &key= 未付与なら付ける（冪等）。
      if (src.indexOf('key=') < 0){
        try{ img.src = src + (src.indexOf('?') < 0 ? '?' : '&') + 'key=' + encodeURIComponent(k); }catch(e){}
      }
      return;
    }
    // キー無し → 正方形アバターだけ DiceBear に差し替え。
    if (!isSquareAvatar(src)) return;
    var d = diceUrl(name);
    if (src !== d){
      try{ img.onerror = null; }catch(e){}
      try{ img.removeAttribute('data-r'); }catch(e){}
      try{ img.src = d; }catch(e){}
    }
  }

  function sweep(){
    try{
      var imgs = document.getElementsByTagName('img');
      for (var i = 0; i < imgs.length; i++) fixImg(imgs[i]);
    }catch(e){}
  }

  // DOM 変化と src 変化を監視して即時修正（pollinations が差し込まれた瞬間に直す）。
  function start(){
    try{
      var obs = new MutationObserver(function(muts){
        for (var i = 0; i < muts.length; i++){
          var m = muts[i];
          if (m.type === 'attributes' && m.target && m.target.tagName === 'IMG'){ fixImg(m.target); }
          else if (m.addedNodes){ sweep(); }
        }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
      window.__v292Dfix197Observer = obs;
    }catch(e){}
    setInterval(sweep, 1500);
    sweep();
    try{ console.log(TAG, 'loaded (pollKey=' + (pollKey() ? 'set' : 'none') + ')'); }catch(_){}
  }

  if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', start); }
  else { start(); }

  window.__v292Dfix197 = { sweep: sweep, fixImg: fixImg, diceUrl: diceUrl, pollKey: pollKey };
})();
