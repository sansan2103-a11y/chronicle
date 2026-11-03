/* v292DfixNDI1 — ブラウザから画像サービス（Pollinations・Together・Fireworks）へ直接つながない（GPT #127-QK・bundle91-a・Local 候補）
 * 目的: 画像を作る通信は Worker（/image・Asset v2 の /save）だけにする。旧い経路（features.js の <img src=image.pollinations.ai…>、
 *   無料 GET の予備（fix491 / fix499）、SEE（fix315）、影絵の取得（fix487）、キー直書きの gen.pollinations.ai POST など）が
 *   直接つなぐのを、通信の一番内側で止める。新しい画像の基盤は作らない。
 * 仕組み（このファイルはページで最初に読み込む＝ほかのラッパより内側。fix247 が gen.pollinations.ai を Worker /image へ書き換えた後に通る）:
 *   ・fetch / XMLHttpRequest / sendBeacon: 宛先が上の 3 つのサービスなら送らない。fetch は 422 DIRECT_IMAGE_BLOCKED（再試行しない種類）を返す。
 *   ・<img>/<source> の src・srcset、setAttribute、innerHTML / outerHTML / insertAdjacentHTML、style の url(): その URL の代わりに、
 *     ネットワークを使わない仮の絵（頭文字の丸）を入れる。元の URL は data-av-legacy に残す（fix209 の運び方。fix197 が Worker 経由で作り直せる）。
 *   ・Worker の URL、data: / blob: の画像、Asset v2 の採用済みの絵は 1 バイトも触らない。
 * kill: なし（止める方向の安全装置。戻すときは bundle90-b へ戻す）。検証口: window.__v292DfixNDI1.status()
 */
(function(){
  'use strict';
  if (typeof window === 'undefined' || window.__v292DfixNDI1) return;
  var W = window;
  var HOST_RE = /(^|\.)(pollinations\.ai|together\.xyz|together\.ai|fireworks\.ai)$/i;
  var URL_RE = /https?:\/\/(?:[a-z0-9-]+\.)*(?:pollinations\.ai|together\.xyz|together\.ai|fireworks\.ai)(?::\d+)?(?:[\/?#][^\s"'<>)]*)?/gi;
  var stats = { fetch: 0, xhr: 0, beacon: 0, img: 0, attr: 0, html: 0, css: 0 };
  function hostOf(u){ try { return new URL(String(u), location.href).hostname; } catch(e){ return ''; } }
  function bad(u){ if (u == null) return false; var s = String(u); if (s.indexOf('pollinations') < 0 && s.indexOf('together') < 0 && s.indexOf('fireworks') < 0) return false; var h = hostOf(s); return !!h && HOST_RE.test(h); }
  function hasBad(s){ if (typeof s !== 'string') return false; URL_RE.lastIndex = 0; var r = URL_RE.test(s); URL_RE.lastIndex = 0; return r; }
  /* 仮の絵: v292Dav2-portrait.js placeholderImage と同じ形（頭文字の丸・ネットワーク 0） */
  var ph = {};
  function placeholder(label){
    var n = String(label || '?'); if (ph[n]) return ph[n];
    var h = 0; for (var i = 0; i < n.length; i++) h = ((h << 5) - h + n.charCodeAt(i)) | 0;
    var hue = Math.abs(h) % 360; var ch = n.charAt(0) || '?'; if ('<&"\'>'.indexOf(ch) >= 0) ch = '?';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="hsl(' + hue + ',20%,26%)"/>' +
              '<text x="32" y="43" text-anchor="middle" font-size="30" font-family="sans-serif" fill="rgba(255,255,255,.7)">' + ch + '</text></svg>';
    return (ph[n] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg).replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/'/g, '%27'));   /* ( ) ' も符号化＝CSS の url() に引用符なしで入れても壊れない */
  }
  function blockedResponse(){
    return new Response(JSON.stringify({ ok: false, error: 'DIRECT_IMAGE_BLOCKED', errorCode: 'DIRECT_IMAGE_BLOCKED', retry: false, retryable: false }),
      { status: 422, headers: { 'Content-Type': 'application/json' } });
  }
  /* ---- fetch ---- */
  var oFetch = W.fetch;
  if (typeof oFetch === 'function') {
    W.fetch = function(input, init){
      var u = null; try { u = (input && typeof input === 'object' && 'url' in input) ? input.url : input; } catch(e){ u = null; }
      if (bad(u)) { stats.fetch++; return Promise.resolve(blockedResponse()); }
      return oFetch.apply(this, arguments);
    };
  }
  /* ---- XMLHttpRequest ---- */
  try {
    var XP = W.XMLHttpRequest && W.XMLHttpRequest.prototype;
    if (XP) {
      var oOpen = XP.open, oSend = XP.send;
      XP.open = function(m, u){ this.__ndi1 = bad(u); return oOpen.apply(this, arguments); };
      XP.send = function(){
        if (this.__ndi1) { stats.xhr++; var x = this; setTimeout(function(){ try { x.dispatchEvent(new ProgressEvent('error')); x.dispatchEvent(new ProgressEvent('loadend')); } catch(e){} }, 0); return; }
        return oSend.apply(this, arguments);
      };
    }
  } catch(e){}
  /* ---- sendBeacon ---- */
  try { var N = W.navigator; if (N && typeof N.sendBeacon === 'function') { var oB = N.sendBeacon; N.sendBeacon = function(u){ if (bad(u)) { stats.beacon++; return false; } return oB.apply(this, arguments); }; } } catch(e){}
  /* ---- <img> / <source> ---- */
  function labelOf(el){ try { return el.getAttribute('alt') || el.getAttribute('title') || el.getAttribute('data-name') || '?'; } catch(e){ return '?'; } }
  function keepLegacy(el, u){ try { if (!el.getAttribute('data-av-legacy')) oSetAttr.call(el, 'data-av-legacy', String(u)); oSetAttr.call(el, 'data-ndi1', '1'); } catch(e){} }
  var oSetAttr = Element.prototype.setAttribute;
  function wrapSrc(proto){
    try {
      var d = Object.getOwnPropertyDescriptor(proto, 'src'); if (!d || !d.set) return;
      Object.defineProperty(proto, 'src', { configurable: true, enumerable: d.enumerable, get: d.get, set: function(v){
        if (bad(v)) { stats.img++; keepLegacy(this, v); var p = placeholder(labelOf(this)); if (this.getAttribute('src') === p) return; return d.set.call(this, p); }
        return d.set.call(this, v);
      } });
    } catch(e){}
  }
  function wrapSrcset(proto){
    try {
      var d = Object.getOwnPropertyDescriptor(proto, 'srcset'); if (!d || !d.set) return;
      Object.defineProperty(proto, 'srcset', { configurable: true, enumerable: d.enumerable, get: d.get, set: function(v){ if (hasBad(String(v))) { stats.img++; return d.set.call(this, ''); } return d.set.call(this, v); } });
    } catch(e){}
  }
  if (W.HTMLImageElement) { wrapSrc(HTMLImageElement.prototype); wrapSrcset(HTMLImageElement.prototype); }
  if (W.HTMLSourceElement) { wrapSrc(HTMLSourceElement.prototype); wrapSrcset(HTMLSourceElement.prototype); }
  Element.prototype.setAttribute = function(name, value){
    try {
      var n = String(name).toLowerCase();
      if ((n === 'src' || n === 'href' || n === 'xlink:href' || n === 'poster') && bad(value)) { stats.attr++; keepLegacy(this, value); return oSetAttr.call(this, name, placeholder(labelOf(this))); }
      if ((n === 'srcset' || n === 'style') && hasBad(String(value))) { stats.attr++; return oSetAttr.call(this, name, rewriteText(String(value), '?')); }
    } catch(e){}
    return oSetAttr.apply(this, arguments);
  };
  /* ---- HTML の文字列（innerHTML など）: <img …src="サービスのURL"…> を仮の絵＋data-av-legacy に、ほかの URL は仮の絵に ---- */
  function rewriteText(s, label){ URL_RE.lastIndex = 0; return s.replace(URL_RE, function(){ return placeholder(label || '?'); }); }
  function rewriteHtml(s){
    if (!hasBad(s)) return s;
    stats.html++;
    var out = s.replace(/<(img|source)\b[^>]*>/gi, function(tag){
      if (!hasBad(tag)) return tag;
      var alt = (/\salt\s*=\s*"([^"]*)"/i.exec(tag) || /\salt\s*=\s*'([^']*)'/i.exec(tag) || [])[1] || '?';
      return tag.replace(/(\ssrc\s*=\s*)(["'])([^"']*)\2/i, function(m, a, q, u){
        if (!bad(u)) return m;
        var keep = /\sdata-av-legacy\s*=/i.test(tag) ? '' : ' data-av-legacy=' + q + u.replace(/&/g, '&amp;') + q;
        return a + q + placeholder(alt) + q + keep + ' data-ndi1=' + q + '1' + q;
      });
    });
    return hasBad(out) ? rewriteText(out, '?') : out;
  }
  function wrapHtmlProp(proto, prop){
    try {
      var d = Object.getOwnPropertyDescriptor(proto, prop); if (!d || !d.set) return;
      Object.defineProperty(proto, prop, { configurable: true, enumerable: d.enumerable, get: d.get, set: function(v){ return d.set.call(this, typeof v === 'string' ? rewriteHtml(v) : v); } });
    } catch(e){}
  }
  wrapHtmlProp(Element.prototype, 'innerHTML'); wrapHtmlProp(Element.prototype, 'outerHTML');
  try { if (W.ShadowRoot) wrapHtmlProp(ShadowRoot.prototype, 'innerHTML'); } catch(e){}
  try { var oIAH = Element.prototype.insertAdjacentHTML; Element.prototype.insertAdjacentHTML = function(pos, html){ return oIAH.call(this, pos, typeof html === 'string' ? rewriteHtml(html) : html); }; } catch(e){}
  try { var oCR = Range.prototype.createContextualFragment; Range.prototype.createContextualFragment = function(html){ return oCR.call(this, typeof html === 'string' ? rewriteHtml(html) : html); }; } catch(e){}
  try { var oW = Document.prototype.write; Document.prototype.write = function(){ var a = []; for (var i = 0; i < arguments.length; i++) a.push(typeof arguments[i] === 'string' ? rewriteHtml(arguments[i]) : arguments[i]); return oW.apply(this, a); }; } catch(e){}
  /* ---- style の url() ---- */
  try {
    var CP = CSSStyleDeclaration.prototype;
    var oSP = CP.setProperty;
    CP.setProperty = function(p, v){ if (typeof v === 'string' && hasBad(v)) { stats.css++; arguments[1] = rewriteText(v, '?'); } return oSP.apply(this, arguments); };
    /* 各プロパティの setter がどの prototype にあるかはブラウザで違う（CSSStyleProperties / CSS2Properties / CSSStyleDeclaration）。持っている所で包む */
    var probe = document.documentElement ? document.documentElement.style : null;
    ['cssText', 'background', 'backgroundImage', 'content', 'listStyleImage', 'listStyle', 'borderImage', 'borderImageSource', 'maskImage', 'webkitMaskImage', 'mask', 'webkitMask'].forEach(function(prop){
      var o = probe ? Object.getPrototypeOf(probe) : CP, d = null;
      while (o && o !== Object.prototype) { d = Object.getOwnPropertyDescriptor(o, prop); if (d) break; o = Object.getPrototypeOf(o); }
      if (!o || !d || !d.set) return;
      Object.defineProperty(o, prop, { configurable: true, enumerable: d.enumerable, get: d.get, set: function(v){ if (typeof v === 'string' && hasBad(v)) { stats.css++; v = rewriteText(v, '?'); } return d.set.call(this, v); } });
    });
  } catch(e){}
  /* Chromium の el.style.backgroundImage = … は名前つきの割り込みで、包める accessor が無い → style を Proxy で返す（v292Dvault2-sendgate.js と同じ方式。
     NDI1 が先に読まれるので、sendgate の Proxy はこの Proxy の外側になり、sendgate が書き戻すときもここを通る） */
  try {
    var SP = new WeakMap();
    var stylePx = function(real){ var px = SP.get(real); if (px) return px;
      px = new Proxy(real, { get: function(t, k){ var v = t[k]; return (typeof v === 'function') ? v.bind(t) : v; },
        set: function(t, k, v){ if (typeof v === 'string' && hasBad(v)) { stats.css++; v = rewriteText(v, '?'); } t[k] = v; return true; } });
      SP.set(real, px); return px; };
    [W.HTMLElement && HTMLElement.prototype, W.SVGElement && SVGElement.prototype, (typeof MathMLElement !== 'undefined' ? MathMLElement.prototype : null)].forEach(function(proto){
      if (!proto) return; var d = Object.getOwnPropertyDescriptor(proto, 'style'); if (!d || !d.get) return;
      Object.defineProperty(proto, 'style', { configurable: true, enumerable: d.enumerable,
        get: function(){ var real = d.get.call(this); return real ? stylePx(real) : real; },
        set: function(v){ if (typeof v === 'string' && hasBad(v)) { stats.css++; v = rewriteText(v, '?'); } return d.set.call(this, v); } });
    });
  } catch(e){}
  W.__v292DfixNDI1 = { __installed: true, status: function(){ return JSON.parse(JSON.stringify(stats)); }, bad: bad, placeholder: placeholder };
})();
