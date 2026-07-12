// =====================================================================
// Chronicle TRPG - v292Dfix430: アバター carrier(legacy pollinations URL)を
//   ブラウザに絶対ロードさせない DOM レベルの遮断
//
// 【症状】アイコンが再生成できない / 新しい絵柄に変わらない。コンソールに
//   image.pollinations.ai/prompt/... への GET 429 (Too Many Requests) が大量。
// 【真因】(2026-07-12 本番Networkログで確定)
//   キャラ4人なのに image.pollinations.ai への GET が36件(同一URLの重複多数)。
//   同時に Worker(/image) や gen.pollinations.ai への POST は 0件。fetchラップの
//   スパイには1件も掛からない = これらは fetch() ではなく <img> 要素の src 読み込み。
//   つまり fix197/fix209 の設計「legacy URL は carrier(prompt+seedの運び屋)であって
//   ブラウザにロードさせない」が破れており、features.js の描画経路(2188/4192/8510/8701行の
//   innerHTML 文字列)や fix237 の src 書き戻しが carrier をそのまま <img src> に入れていた。
//   結果 pollinations にレート制限(429)され、絵が出ず、正規の生成経路(課金API POST)も走らない。
// 【対策】carrier が <img src> に入る全経路を塞ぎ、carrier は data-av-legacy へ退避して
//   fix197 の正規生成経路へ橋渡しする。
//     ① HTMLImageElement.prototype.src setter を上書き
//     ② Element.prototype.setAttribute('src', ...) を上書き
//     ③ Element.prototype.innerHTML / insertAdjacentHTML の HTML文字列をサニタイズ
//        (innerHTML はパースと同時にブラウザがロードを開始するため、①②では間に合わない
//         =これが36件の主因。文字列の段階で src を差し替えるのが唯一の完全遮断)
//     ④ MutationObserver(保険) + 起動時の既存DOM掃除
//   carrier 判定は「image.pollinations.ai/prompt/ かつ width===height かつ 辺<=512」。
//   ★場面画(fix315: 768x512)・カバー(512x288)・seedbank(fix310: 600x375)は width!==height
//     なので絶対に触らない。
// OFF: localStorage v292Dfix430Off='1'（判定を常に素通し。リロード不要=live評価）
//      localStorage v292Dfix430NoHtml='1'（③のHTMLサニタイズだけ無効化）
// 検証口: window.__v292Dfix430 = { isAvatarCarrier, status, stats, ... }
// =====================================================================
(function(){
  'use strict';
  var TAG = '[v292Dfix430:carrier-block]';
  if (window.__v292Dfix430 && window.__v292Dfix430.__installed) return;   // 冪等ガード

  var HOST = 'image.pollinations.ai';
  var TRANSPARENT = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  var MAX_SIDE = 512;   // アバターは384。将来の正方形アバターも carrier とみなす上限。

  var stats = { blocked: 0, uniqueCarriers: 0, handedToFix197: 0, sceneAllowed: 0 };
  var seenUrl = {};    // carrier URL -> 1 (uniqueCarriers 計上)
  var handedUrl = {};  // carrier URL -> 1 (fix197 へ渡したURL。36回→1回にする重複排除)

  function off(){ try { return localStorage.getItem('v292Dfix430Off') === '1'; } catch(e){ return false; } }
  function offHtml(){ try { return localStorage.getItem('v292Dfix430NoHtml') === '1'; } catch(e){ return false; } }

  // ===== 判定(pure) =====
  // true  : アバター carrier (例 .../prompt/xxx?width=384&height=384&seed=1&nologo=true&model=flux)
  // false : 場面画(768x512) / カバー(512x288) / seedbank(600x375) / data: / blob: / Worker / DiceBear
  function isAvatarCarrier(url){
    var u = String(url == null ? '' : url);
    if (u.indexOf(HOST + '/prompt/') < 0) return false;
    var mw = /[?&]width=(\d+)/.exec(u);
    var mh = /[?&]height=(\d+)/.exec(u);
    if (!mw || !mh) return false;            // サイズ不明は carrier と断定しない(安全側=素通し)
    var w = +mw[1], h = +mh[1];
    if (w !== h) return false;               // 非正方形 = 場面画等 → 絶対に触らない
    return w <= MAX_SIDE;
  }

  // ===== 素の(上書き前の)DOM API を退避 =====
  var IMGP = window.HTMLImageElement && window.HTMLImageElement.prototype;
  var srcDesc = IMGP ? Object.getOwnPropertyDescriptor(IMGP, 'src') : null;
  var rawSrcSet = srcDesc && srcDesc.set;
  var rawSrcGet = srcDesc && srcDesc.get;
  var rawSetAttr = window.Element.prototype.setAttribute;
  var rawGetAttr = window.Element.prototype.getAttribute;

  function getAttr(el, n){ try { return rawGetAttr.call(el, n) || ''; } catch(e){ return ''; } }
  function setAttrRaw(el, n, v){ try { rawSetAttr.call(el, n, v); } catch(e){} }
  function setSrcRaw(img, v){
    if (rawSrcSet){ try { rawSrcSet.call(img, v); return; } catch(e){} }
    setAttrRaw(img, 'src', v);
  }

  // ===== プレースホルダ(carrier の代わりに入れる src) =====
  //   優先: fix197 のキャッシュ済み data: → DiceBear(fix66/fix145 と同じ既定の仮表示) → 透明1x1
  //   ※透明1x1 は「割れた画像アイコン」を出さないための最終手段。
  function placeholderForName(name){
    var f = window.__v292Dfix197;
    if (f && name){
      try { var c = (typeof f.cachedFor === 'function') ? (f.cachedFor(name) || '') : ''; if (c && c.indexOf('data:') === 0) return c; } catch(e){}
      try { if (typeof f.diceUrl === 'function'){ var d = f.diceUrl(name); if (d) return d; } } catch(e){}
    }
    return TRANSPARENT;
  }
  function placeholderFor(img){ return placeholderForName(getAttr(img, 'alt')); }

  // 既に入っている src を残してよいか(既存アイコンを消さない)
  function keepable(cur){
    if (!cur) return false;
    if (isAvatarCarrier(cur)) return false;
    return cur.indexOf('data:') === 0 || cur.indexOf('blob:') === 0 || cur.indexOf('workers.dev') >= 0;
  }

  function countCarrier(url){
    stats.blocked++;
    if (!seenUrl[url]){ seenUrl[url] = 1; stats.uniqueCarriers++; }
  }
  function countScene(u){ if (u.indexOf(HOST) >= 0) stats.sceneAllowed++; }

  // ===== fix197 への橋渡し(同一 carrier URL は1回だけ) =====
  function handoff(img, url){
    img.__f430done = true;
    var alt = getAttr(img, 'alt');
    if (!alt) return;                 // alt が無いと fix197 は pk を決められない → 何もしない(安全側)
    if (handedUrl[url]) return;       // 同じ carrier は1回だけ(36回→1回)
    handedUrl[url] = 1;
    stats.handedToFix197++;
    setTimeout(function(){
      try { var f = window.__v292Dfix197; if (f && typeof f.fixImg === 'function') f.fixImg(img); } catch(e){}
    }, 0);
  }

  // ===== carrier が src に入ろうとした/入っている時の処理 =====
  function handleCarrier(img, url){
    countCarrier(url);
    if (!getAttr(img, 'data-av-legacy')) setAttrRaw(img, 'data-av-legacy', url);   // 先勝ち(既存は上書きしない)
    var cur = getAttr(img, 'src');
    if (!keepable(cur)){
      var ph = placeholderFor(img);
      if (cur !== ph) setSrcRaw(img, ph);
    }
    handoff(img, url);
  }

  // ===== ① src setter =====
  if (srcDesc && rawSrcSet){
    Object.defineProperty(IMGP, 'src', {
      configurable: true,
      enumerable: srcDesc.enumerable,
      get: function(){ return rawSrcGet ? rawSrcGet.call(this) : getAttr(this, 'src'); },
      set: function(v){
        var u = String(v == null ? '' : v);
        if (!off() && isAvatarCarrier(u)){ handleCarrier(this, u); return; }   // 元setterは呼ばない=ロードさせない
        countScene(u);
        rawSrcSet.call(this, v);
      }
    });
  }

  // ===== ② setAttribute('src', ...) =====
  //   setAttribute は全要素で呼ばれる → IMG かつ src 以外は即素通し(性能劣化ゼロ)
  window.Element.prototype.setAttribute = function(name, value){
    try {
      if (this && this.nodeName === 'IMG' && String(name).toLowerCase() === 'src'){
        var u = String(value == null ? '' : value);
        if (!off() && isAvatarCarrier(u)){ handleCarrier(this, u); return; }
        countScene(u);
      }
    } catch(e){}
    return rawSetAttr.apply(this, arguments);
  };

  // ===== ③ innerHTML / insertAdjacentHTML のサニタイズ(主防御) =====
  //   innerHTML は「パースされた瞬間」にブラウザがロードを開始するため、DOM側の
  //   後追い(MutationObserver)では 429 を止めきれない。文字列の段階で src を差し替える。
  var IMG_TAG = /<img\b[^>]*>/gi;
  var SRC_ATTR = /\ssrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
  var ALT_ATTR = /\salt\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
  function pickAttr(m){ return m ? (m[2] != null ? m[2] : (m[3] != null ? m[3] : (m[4] || ''))) : ''; }
  function decEnt(s){ return String(s).replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&'); }
  function escAttr(s){ return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;'); }

  function sanitizeHtml(html){
    var s = String(html);
    if (s.indexOf(HOST) < 0) return html;   // 高速パス(pollinationsを含まないHTMLは素通し)
    return s.replace(IMG_TAG, function(tag){
      var ms = SRC_ATTR.exec(tag);
      if (!ms) return tag;
      var raw = pickAttr(ms), url = decEnt(raw);
      if (!isAvatarCarrier(url)){ countScene(url); return tag; }
      countCarrier(url);
      var alt = decEnt(pickAttr(ALT_ATTR.exec(tag)));
      var t = tag.replace(ms[0], ' src="' + escAttr(placeholderForName(alt)) + '"');
      if (!/\sdata-av-legacy\s*=/i.test(t)) t = t.replace(/<img\b/i, '<img data-av-legacy="' + escAttr(url) + '"');
      return t;
    });
  }

  var htmlDesc = Object.getOwnPropertyDescriptor(window.Element.prototype, 'innerHTML');
  if (htmlDesc && htmlDesc.set){
    Object.defineProperty(window.Element.prototype, 'innerHTML', {
      configurable: true,
      enumerable: htmlDesc.enumerable,
      get: function(){ return htmlDesc.get.call(this); },
      set: function(v){
        var out = v;
        try { if (!off() && !offHtml() && typeof v === 'string') out = sanitizeHtml(v); } catch(e){ out = v; }
        htmlDesc.set.call(this, out);
      }
    });
  }
  var rawIAH = window.Element.prototype.insertAdjacentHTML;
  if (typeof rawIAH === 'function'){
    window.Element.prototype.insertAdjacentHTML = function(pos, html){
      var out = html;
      try { if (!off() && !offHtml() && typeof html === 'string') out = sanitizeHtml(html); } catch(e){ out = html; }
      return rawIAH.call(this, pos, out);
    };
  }

  // ===== ④ MutationObserver(保険) + 既存DOM掃除 =====
  function checkImg(img){
    if (!img || img.nodeName !== 'IMG' || off()) return;
    var cur = getAttr(img, 'src');
    if (cur && isAvatarCarrier(cur)){ handleCarrier(img, cur); return; }   // ①②③をすり抜けた分
    var lg = getAttr(img, 'data-av-legacy');
    if (lg && isAvatarCarrier(lg)){
      if (cur === TRANSPARENT || !cur){                                     // 透明のまま放置しない
        var ph = placeholderFor(img);
        if (ph !== cur) setSrcRaw(img, ph);
      }
      handoff(img, lg);                                                     // 生成経路へ(URL単位で1回)
    }
  }
  function scanNode(n){
    if (!n || n.nodeType !== 1) return;
    if (n.nodeName === 'IMG'){ checkImg(n); return; }
    if (n.querySelectorAll){
      var l = n.querySelectorAll('img');
      for (var i = 0; i < l.length; i++) checkImg(l[i]);
    }
  }
  function sweepAll(){
    try { var l = document.querySelectorAll('img'); for (var i = 0; i < l.length; i++) checkImg(l[i]); } catch(e){}
  }

  var obs = null;
  function startObs(){
    if (obs) return;
    try {
      obs = new MutationObserver(function(muts){
        for (var i = 0; i < muts.length; i++){
          var m = muts[i];
          if (m.type === 'attributes'){ if (m.target && m.target.nodeName === 'IMG') checkImg(m.target); }
          else if (m.addedNodes && m.addedNodes.length){
            for (var j = 0; j < m.addedNodes.length; j++) scanNode(m.addedNodes[j]);
          }
        }
      });
      obs.observe(document.documentElement || document, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
      window.__v292Dfix430Observer = obs;
    } catch(e){}
    sweepAll();
  }
  sweepAll();   // 既存DOMの掃除は即時(スクリプトより前に描画済みのimgを取りこぼさない)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startObs);
  else startObs();

  window.__v292Dfix430 = {
    __installed: true,
    isAvatarCarrier: isAvatarCarrier,      // pure(OFFスイッチの影響を受けない純判定)
    sanitizeHtml: sanitizeHtml,
    checkImg: checkImg,
    sweep: sweepAll,
    stats: function(){ return { blocked: stats.blocked, uniqueCarriers: stats.uniqueCarriers, handedToFix197: stats.handedToFix197, sceneAllowed: stats.sceneAllowed }; },
    status: function(){
      return {
        off: off(), offHtml: offHtml(),
        srcHooked: !!(srcDesc && rawSrcSet),
        setAttrHooked: window.Element.prototype.setAttribute !== rawSetAttr,
        innerHtmlHooked: !!(htmlDesc && htmlDesc.set),
        observing: !!obs,
        transparent: TRANSPARENT
      };
    },
    __reset: function(){ stats = { blocked:0, uniqueCarriers:0, handedToFix197:0, sceneAllowed:0 }; seenUrl = {}; handedUrl = {}; }   // テスト用
  };
  try { console.log(TAG, 'armed'); } catch(e){}
})();
