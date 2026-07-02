// v292Dfix356 avatar-eager-fix
// 会話ログカードの <img loading="lazy"> が data URL / IndexedDB 由来のアイコンに対しても発火せず、
// naturalWidth 0 のまま残る回帰バグ（旧 fix86 が消えた影響）を再修正。
// 実機で 8ターン検証中、11 枚全部が w=0 で表示崩壊、eager に戻して src 再代入すると 384px で復活を確認。
// - どのカード（.v292-dlg-card / .conv-card / .conv-log-item 等）にも横断的に効くようマルチセレクタ
// - loading="eager" を強制＋src を一度剥がして再代入して IntersectionObserver 迂回
// - MutationObserver で新規カードにも自動適用
// - 直接 URL は blob:/data: 以外なら fetch+blob に変換（Brave Shields 対策も継承）
// - setInterval 不使用、バックスラッシュ不使用
(function(){
  if (window.__v292Dfix356Active) return;
  window.__v292Dfix356Active = true;

  var SELECTORS = '.v292-dlg-card img, .conv-card img, .conv-log-item img, [class*="dlg-card"] img, [class*="conv-card"] img';
  var blobCache = {};

  function isCDN(u){
    return u && (u.indexOf('pollinations') >= 0 || u.indexOf('dicebear') >= 0 || u.indexOf('together') >= 0);
  }

  function fixImg(img){
    if (!img || img.__v292Dfix356Done) return;
    var src = img.getAttribute('src') || img.src || '';
    if (!src) return;
    img.__v292Dfix356Done = true;
    img.loading = 'eager';
    if (src.indexOf('blob:') === 0 || src.indexOf('data:') === 0) {
      // Just re-assign to trigger load (bypasses IO observer)
      img.removeAttribute('src');
      img.src = src;
      return;
    }
    if (!isCDN(src)) {
      img.removeAttribute('src');
      img.src = src;
      return;
    }
    if (blobCache[src]) { img.src = blobCache[src]; return; }
    var orig = src;
    fetch(orig).then(function(r){ return r.blob(); }).then(function(b){
      var url = URL.createObjectURL(b);
      blobCache[orig] = url;
      img.src = url;
    }).catch(function(){
      var s = orig; img.removeAttribute('src'); img.src = s;
    });
  }

  function scan(){
    try {
      var list = document.querySelectorAll(SELECTORS);
      for (var i = 0; i < list.length; i++) fixImg(list[i]);
    } catch(e){}
  }

  var obs = new MutationObserver(function(muts){
    for (var i = 0; i < muts.length; i++){
      var added = muts[i].addedNodes;
      for (var j = 0; j < added.length; j++){
        var n = added[j];
        if (!n || n.nodeType !== 1) continue;
        // If added node itself matches
        try {
          if (n.tagName === 'IMG') { fixImg(n); continue; }
          if (n.matches && (n.matches('.v292-dlg-card') || n.matches('.conv-card') || n.matches('.conv-log-item'))){
            var im = n.querySelectorAll('img');
            for (var k = 0; k < im.length; k++) fixImg(im[k]);
          } else if (n.querySelectorAll){
            var im2 = n.querySelectorAll(SELECTORS);
            for (var k2 = 0; k2 < im2.length; k2++) fixImg(im2[k2]);
          }
        } catch(e){}
      }
      // Also handle src attribute mutation on existing imgs
      if (muts[i].type === 'attributes' && muts[i].target && muts[i].target.tagName === 'IMG'){
        var img = muts[i].target;
        img.__v292Dfix356Done = false;
        fixImg(img);
      }
    }
  });

  function start(){
    try { obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src','loading'] }); } catch(e){}
    scan();
    setTimeout(scan, 800);
    setTimeout(scan, 2500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  try { console.log('[v292Dfix356] avatar eager fix active'); } catch(e){}
})();
