// v292Dfix86 avatar-eager-blob
// 会話ログカードのアバターが読み込まれない問題を修正する。
// 原因: 動的挿入される .v292-dlg-card img の loading="lazy" が IntersectionObserver で発火せず 0px のまま。
// さらに直接 <img>.src= は Brave Shields にブロックされる(memory 既知パターン)。
// 対策: loading="eager" 化 + Pollinations/DiceBear の直 URL を fetch+blob URL に変換(Brave 安全)。
// バックスラッシュ不使用(CodeMirror paste 対策)。setInterval 不使用(MutationObserver + 遅延 scan)。
(function(){
  if (window.__v292Dfix86Active) return;
  window.__v292Dfix86Active = true;

  var blobCache = {};

  function isCDN(u){
    return u && (u.indexOf('pollinations') >= 0 || u.indexOf('dicebear') >= 0);
  }

  function fixImg(img){
    if (!img || img.__v292Dfix86Done) return;
    var src = img.getAttribute('src') || img.src || '';
    if (src.indexOf('blob:') === 0) { img.__v292Dfix86Done = true; return; }
    img.__v292Dfix86Done = true;
    img.loading = 'eager';
    if (!isCDN(src)) {
      var s0 = src;
      if (s0) { img.removeAttribute('src'); img.src = s0; }
      return;
    }
    if (blobCache[src]) { img.src = blobCache[src]; return; }
    var orig = src;
    fetch(orig).then(function(r){ return r.blob(); }).then(function(b){
      var url = URL.createObjectURL(b);
      blobCache[orig] = url;
      img.src = url;
    }).catch(function(e){
      var s = orig; img.removeAttribute('src'); img.src = s;
    });
  }

  function scan(){
    var list = document.querySelectorAll('.v292-dlg-card img');
    for (var i = 0; i < list.length; i++) fixImg(list[i]);
  }

  var obs = new MutationObserver(function(muts){
    for (var i = 0; i < muts.length; i++){
      var added = muts[i].addedNodes;
      for (var j = 0; j < added.length; j++){
        var n = added[j];
        if (!n || n.nodeType !== 1) continue;
        if (n.matches && n.matches('.v292-dlg-card')){
          var im = n.querySelectorAll('img');
          for (var k = 0; k < im.length; k++) fixImg(im[k]);
        } else if (n.querySelectorAll){
          var im2 = n.querySelectorAll('.v292-dlg-card img');
          for (var k2 = 0; k2 < im2.length; k2++) fixImg(im2[k2]);
        }
      }
    }
  });

  function start(){
    try { obs.observe(document.body, { childList: true, subtree: true }); } catch(e){}
    scan();
    setTimeout(scan, 1000);
    setTimeout(scan, 3000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  try { console.log('[v292Dfix86] avatar eager+blob loader active'); } catch(e){}
})();
