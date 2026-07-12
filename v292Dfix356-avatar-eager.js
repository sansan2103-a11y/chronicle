// v292Dfix356 avatar-eager-fix (v292Dfix357で無限ループ根治 / v292Dfix450で点滅根治)
// 会話ログカードの <img loading="lazy"> が data URL / IndexedDB 由来のアイコンに対しても発火せず、
// naturalWidth 0 のまま残る回帰バグ（旧 fix86 が消えた影響）を再修正。
// - loading="eager" を強制（＋必要なときだけ src を剥がして再代入し IntersectionObserver を迂回）
// - MutationObserver で新規カードにも自動適用
// ★v292Dfix357 修正(2026-07-02): 旧版は attributes 監視ハンドラが自分自身の
//   src 再代入/loading 変更を拾って Done フラグを解除→fixImg→また変異→…の
//   無限ループになり、アイコンのあるスロットで起動直後に白画面ハングしていた
//   (実機で確定・BUILT=fix356 の全フレッシュロードが死ぬ緊急障害)。
//   対策: ①attributeFilter から 'loading' を除外 ②自分が設定した最終srcを
//   __f356Last に記録し、同じ値への変異は無視 ③src が本当に外部から変わった
//   時だけ再処理。OFF: localStorage v292Dfix356EagerOff='1'
// ★v292Dfix450 修正(2026-07-13): 会話ログの「点滅」の根治。
//   本番10ターンの実測: 会話ログ内 img.src の書き換え 185回。100% が本ファイルの
//   setSrc ← fixImg ← MutationObserver。DOM変更は IMG[attributes:src] 20回/ターン
//   (= 10画像 × 2回 = removeAttribute + 再代入)。
//   真因: data:/blob:/非CDN の src を無条件で「removeAttribute → 再代入」していたこと。
//   これは lazy-loading が data URL で発火しない旧バグ(fix86 の回帰)への荒療治だが、
//   会話ログは毎ターン全カードを再描画するため、全アイコンで src が外れて付き直り、
//   目に見える点滅になっていた。
//   対策: 既定では loading='eager' を立てるだけにして src には触らない。
//         本当にロードされなかった場合(300ms後も naturalWidth===0 かつ isConnected)
//         だけ、従来どおり removeAttribute → 再代入する(保険)。
//   OFF : localStorage v292Dfix450Off='1' で旧挙動(常に即 remove→再代入)へ戻す。
//   ※CDN(pollinations等)の blob 化経路は一切変更していない(fix430 が carrier を
//     遮断済みで実質通らないが、触らない)。
(function(){
  if (window.__v292Dfix356Active) return;
  window.__v292Dfix356Active = true;
  function off(){ try{ return localStorage.getItem('v292Dfix356EagerOff')==='1'; }catch(e){ return false; } }
  // ★fix450: OFF は live 評価(セット直後の描画から旧挙動へ戻せる)
  function off450(){ try{ return localStorage.getItem('v292Dfix450Off')==='1'; }catch(e){ return false; } }

  var SELECTORS = '.v292-dlg-card img, .conv-card img, .conv-log-item img, [class*="dlg-card"] img, [class*="conv-card"] img';
  var blobCache = {};
  var RECHECK_MS = 300;   // ★fix450: 保険の判定までの猶予(data:/blob: は即時デコードされる)

  function isCDN(u){
    return u && (u.indexOf('pollinations') >= 0 || u.indexOf('dicebear') >= 0 || u.indexOf('together') >= 0);
  }

  function setSrc(img, v){ // ★fix357: 最終値を記録してから代入(自己変異をループさせない)
    img.__f356Last = v;
    img.src = v;
  }

  // ★fix450: 旧来の荒療治(外して付け直す)。既定では「保険」としてのみ呼ばれる。
  function rebind(img, src){
    try { img.removeAttribute('src'); } catch(e){}
    setSrc(img, src);
  }

  function fixImg(img){
    if (off()) return;
    if (!img || img.__v292Dfix356Done) return;
    var src = img.getAttribute('src') || img.src || '';
    if (!src) return;
    img.__v292Dfix356Done = true;
    img.loading = 'eager';

    if (src.indexOf('blob:') === 0 || src.indexOf('data:') === 0 || !isCDN(src)) {
      // 旧挙動(OFFスイッチ): 毎回 remove→再代入
      if (off450()) { rebind(img, src); return; }
      // ★fix450 既定: src には触らない。loading='eager' だけで足りる。
      //   自己変異が起きないので MutationObserver も回らず、点滅が消える。
      img.__f356Last = src;              // 外部からの「本当に新しい値」だけ再処理させる(fix357)
      setTimeout(function(){
        try {
          // 本当にロードされなかった時だけ保険を撃つ(1回きり。Doneフラグは立ったまま)
          if (img.isConnected && !img.naturalWidth) rebind(img, src);
        } catch(e){}
      }, RECHECK_MS);
      return;
    }

    // --- CDN経路(pollinations/dicebear/together): 変更なし ---
    if (blobCache[src]) { setSrc(img, blobCache[src]); return; }
    var orig = src;
    fetch(orig).then(function(r){ return r.blob(); }).then(function(b){
      var url = URL.createObjectURL(b);
      blobCache[orig] = url;
      setSrc(img, url);
    }).catch(function(){
      var s = orig; img.removeAttribute('src'); setSrc(img, s);
    });
  }

  function scan(){
    try {
      var list = document.querySelectorAll(SELECTORS);
      for (var i = 0; i < list.length; i++) fixImg(list[i]);
    } catch(e){}
  }

  var obs = new MutationObserver(function(muts){
    if (off()) return;
    for (var i = 0; i < muts.length; i++){
      var added = muts[i].addedNodes;
      for (var j = 0; added && j < added.length; j++){
        var n = added[j];
        if (!n || n.nodeType !== 1) continue;
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
      // src属性の変異: ★fix357=外部からの「本当に新しい値」だけ再処理(自己変異は無視)
      if (muts[i].type === 'attributes' && muts[i].target && muts[i].target.tagName === 'IMG'){
        var img = muts[i].target;
        var cur = img.getAttribute('src') || '';
        if (!cur) continue;                     // removeAttribute(自分の下ごしらえ)は無視
        if (cur === img.__f356Last) continue;   // 自分が設定した値への変異=無視(ループ遮断)
        img.__v292Dfix356Done = false;
        fixImg(img);
      }
    }
  });

  function start(){
    try { obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] }); } catch(e){}
    scan();
    setTimeout(scan, 800);
    setTimeout(scan, 2500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  // 検証口(挙動テスト用。UIは作らない)
  try {
    window.__v292Dfix356 = {
      fixImg: fixImg, scan: scan, off: off, off450: off450, isCDN: isCDN, RECHECK_MS: RECHECK_MS
    };
  } catch(e){}

  try { console.log('[v292Dfix356] avatar eager fix active (fix357 loop-guard / fix450 no-churn)'); } catch(e){}
})();
