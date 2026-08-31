// =====================================================================
// Chronicle TRPG - v292Dfix777: キャラアイコン拡大 lightbox（最小QoL）
// PHASE 4E / Icon System 付帯（表示だけ・生成には一切触らない）
// ---------------------------------------------------------------------
// ■このfixの立場
//   会話ログ・キャラ一覧に出ている **キャラアイコンの img をタップ/クリックすると、
//   その img の「現在の src」をそのまま大きく表示する** だけ。それ以外は何もしない。
//   ・画像を作らない・取りに行かない・作り直さない（fix197 / fix766 / fix767 と非結合）。
//   ・localStorage へ 1バイトも書かない（読むのは kill フラグだけ）。
//   ・Canonical Appearance（fix766 の record）も S.cast も roster も触らない。
//   ・fetch もしない。src は「いま画面に出ている値」をそのまま使う（data: でもURLでも同じ）。
//
// ■なぜ必要か
//   アイコンは会話ログで 40px・キャラ一覧で 56px しかなく、
//   「作り直した外見が意図どおりか」を OWNER が目視で判定できない。
//   受入は数値ではなく OWNER の体感で行う（fix770 受入手順 4）ので、拡大表示は検証手段そのもの。
//
// ■対象 img の決め方（読み取りで実 DOM 構造を確認して決めた・推測ではない）
//   ① img[data-avpk]                     … fix197 が付ける「AIアイコンである」印（applyOne の対象）
//   ② .dlg-av の中の img                 … 会話ログのアバター（fix56 buildUserInputCard / fix66 buildCard）
//   ③ .v292-dlg-card の中の img          … 会話カード（fix66 が data-avpk 無しで焼き込む経路の保険）
//   ④ .v292Dfix145-card の中の img       … キャラ一覧カードのアバター（fix145 makeCard）
//   除外: <button> / <a> / <label> / <input> / role="button" の子孫にある img と、
//         上のどれにも当たらない img（UI 装飾・絵文字など）。
//   ★ボタン衝突の確認: fix145 のボタン（↻ アイコン再生成 / 🎨 外見を作り直す / ✏️ 編集 …）は
//     mkBtn() が textContent だけを入れた <button> で、**img を1つも含まない**。
//     会話カード側にもアイコンを包む button は無い。よって本 fix が拾う img と
//     再生成系ボタンの click は集合として交わらない（＝衝突しない）。
//
// ■なぜ capture=true なのか（当初案の capture=false から変更した唯一の点）
//   キャラ一覧モーダルは fix145 が `mo.onclick = function(e){ e.stopPropagation(); }` を張っており
//   （v292Dfix145-charlist.js の modal 生成部）、モーダル内の click は **document まで上がってこない**。
//   bubble 段（capture=false）で待つとキャラ一覧のアイコンだけ永久に反応しないため、
//   capture 段で1本だけ拾う。こちらは既存ハンドラより先に走るが、
//   本 fix は preventDefault も stopPropagation も **一切呼ばない** ので、
//   その後の既存 click 処理（ボタン・モーダル開閉）は 1バイトも影響を受けない。
//
// ■kill
//   localStorage.v292Dfix777Off === '1' → listener を **登録しない**（完全に不在と同じ）。
//   実行中に立てた場合の保険としてハンドラ先頭でも見る。
//
// ■公開口
//   window.__v292Dfix777 = { __armed, isOff, isIconImg, nameFor, openFor, open, close, isOpen, _onClick }
// =====================================================================
(function(){
  'use strict';
  var TAG = '[v292Dfix777:icon-lightbox]';
  var Z = 2147483647;                 // 既存の最上位 z-index と同値。最後に body へ足すので前面になる。
  var OVERLAY_ID = 'v292Dfix777-overlay';

  function isOff(){ try { return localStorage.getItem('v292Dfix777Off') === '1'; } catch(e){ return false; } }

  // ---------- DOM ヘルパ（Element.closest を使わない: 旧 iOS Safari 互換 + 挙動を自分で固定する） ----------
  function tagOf(el){ try { return String(el && el.tagName || '').toUpperCase(); } catch(e){ return ''; } }
  function attr(el, k){ try { return (el && typeof el.getAttribute === 'function') ? el.getAttribute(k) : null; } catch(e){ return null; } }
  function hasClass(el, c){
    try {
      var cn = el && el.className;
      if (typeof cn !== 'string') return false;         // SVG の className は object
      return (' ' + cn + ' ').indexOf(' ' + c + ' ') >= 0;
    } catch(e){ return false; }
  }
  /* 祖先を最大 depth 段だけ遡って test を満たす要素を探す（見つからなければ null） */
  function upFind(el, test, depth){
    var n = el, d = 0, max = depth || 12;
    while (n && d++ < max){
      try { if (test(n)) return n; } catch(e){}
      n = n.parentNode;
    }
    return null;
  }
  var INTERACTIVE = { BUTTON:1, A:1, LABEL:1, INPUT:1, SELECT:1, TEXTAREA:1, SUMMARY:1 };
  function inInteractive(el){
    return !!upFind(el, function(n){
      return INTERACTIVE[tagOf(n)] === 1 || attr(n, 'role') === 'button';
    }, 12);
  }

  /**
   * isIconImg(el) → boolean
   *   「これはキャラアイコンの img か」。img 以外・ボタン内・対象外構造は false。
   */
  function isIconImg(el){
    if (tagOf(el) !== 'IMG') return false;
    if (inInteractive(el)) return false;                                  // 再生成ボタン等とは交わらせない
    if (attr(el, 'data-avpk')) return true;                               // ① fix197 の印
    return !!upFind(el, function(n){
      return hasClass(n, 'dlg-av') || hasClass(n, 'v292-dlg-card') || hasClass(n, 'v292Dfix145-card');
    }, 8);                                                                 // ②③④
  }

  /**
   * nameFor(img) → キャラ名 | ''（best-effort。取れなければ画像だけ出す）
   *   alt（fix66 avatarImgHtml / fix145 makeCard がキャラ名を入れている）→
   *   祖先の data-name（fix145 card）→ 会話カードの .dlg-name テキスト の順。
   */
  function nameFor(img){
    try {
      var a = String(attr(img, 'alt') || '').trim();
      if (a && a !== 'character') return a;
      var card = upFind(img, function(n){ return !!attr(n, 'data-name'); }, 8);
      if (card){ var dn = String(attr(card, 'data-name') || '').trim(); if (dn) return dn; }
      var dcard = upFind(img, function(n){ return hasClass(n, 'v292-dlg-card'); }, 8);
      if (dcard && typeof dcard.querySelector === 'function'){
        var nm = dcard.querySelector('.dlg-name');
        if (nm){ var t = String(nm.textContent || '').trim(); if (t) return t; }
      }
    } catch(e){}
    return '';
  }

  // ---------- lightbox 本体 ----------
  var overlay = null;         // 開いているときだけ非 null
  var prevOverflow = null;    // 背景スクロール固定の復元用

  function isOpen(){ return !!overlay; }

  function close(){
    try {
      if (!overlay) return false;
      var ov = overlay; overlay = null;
      try { document.removeEventListener('keydown', onKeydown, false); } catch(e){}
      try { if (ov.parentNode) ov.parentNode.removeChild(ov); } catch(e){}
      try {
        if (document.body && document.body.style){
          document.body.style.overflow = (prevOverflow == null ? '' : prevOverflow);
        }
      } catch(e){}
      prevOverflow = null;
      return true;
    } catch(e){ return false; }
  }

  function onKeydown(e){
    try { if (e && (e.key === 'Escape' || e.keyCode === 27)) close(); } catch(err){}
  }

  /**
   * open(src, name) → boolean
   *   src をそのまま <img src> に入れて全画面オーバーレイで表示する。fetch はしない。
   */
  function open(src, name){
    try {
      if (isOff()) return false;
      if (!src) return false;
      if (overlay) close();                                  // 二重表示させない

      var ov = document.createElement('div');
      ov.setAttribute('id', OVERLAY_ID);
      ov.style.cssText =
        'position:fixed; left:0; top:0; right:0; bottom:0; z-index:' + Z + ';' +
        'background:rgba(0,0,0,.86); display:flex; flex-direction:column;' +
        'align-items:center; justify-content:center; gap:10px; padding:16px;' +
        'box-sizing:border-box; -webkit-tap-highlight-color:transparent;';

      if (name){
        var cap = document.createElement('div');
        cap.textContent = name;
        cap.style.cssText =
          'color:#e8e8f0; font-size:13px; line-height:1.3; max-width:90vw;' +
          'overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:center;' +
          'text-shadow:0 1px 3px rgba(0,0,0,.9); pointer-events:none;';
        ov.appendChild(cap);
      }

      var big = document.createElement('img');
      big.setAttribute('alt', name || '');
      big.style.cssText =
        'width:85vmin; height:85vmin; max-width:90vw; max-height:75vh;' +
        'object-fit:contain; border-radius:14px; background:#15151c;' +
        'box-shadow:0 8px 40px rgba(0,0,0,.6); display:block;';
      /* 画像そのもののタップでは閉じない（背景/×/ESC で閉じる） */
      try { big.addEventListener('click', function(e){ try { e.stopPropagation(); } catch(err){} }, false); } catch(e){}
      big.src = src;                                          // ★現在の src をそのまま使う（再取得しない）
      ov.appendChild(big);

      var closeBtn = document.createElement('div');
      closeBtn.setAttribute('role', 'button');
      closeBtn.setAttribute('aria-label', 'close');
      closeBtn.textContent = '×';
      closeBtn.style.cssText =
        'position:absolute; top:10px; right:14px; width:40px; height:40px; line-height:40px;' +
        'text-align:center; font-size:26px; color:#fff; cursor:pointer; user-select:none;' +
        'border-radius:50%; background:rgba(255,255,255,.12);';
      try { closeBtn.addEventListener('click', function(e){ try { e.stopPropagation(); } catch(err){} close(); }, false); } catch(e){}
      ov.appendChild(closeBtn);

      /* 背景タップで閉じる（画像は上で stopPropagation 済み） */
      try { ov.addEventListener('click', function(){ close(); }, false); } catch(e){}

      try {
        if (document.body && document.body.style){
          prevOverflow = document.body.style.overflow || '';
          document.body.style.overflow = 'hidden';            // 背景スクロール固定（最小限）
        }
      } catch(e){}
      try { document.addEventListener('keydown', onKeydown, false); } catch(e){}
      document.body.appendChild(ov);
      overlay = ov;
      return true;
    } catch(e){ return false; }
  }

  /** openFor(img) → boolean（img から src と名前を取り出して open する） */
  function openFor(img){
    try {
      var src = '';
      try { src = img.getAttribute('src') || ''; } catch(e){}
      if (!src){ try { src = img.src || ''; } catch(e2){} }
      if (!src) return false;
      return open(src, nameFor(img));
    } catch(e){ return false; }
  }

  // ---------- 委譲 listener（document 1本だけ） ----------
  function _onClick(e){
    try {
      if (isOff()) return;                                    // 実行中に kill を立てた場合の保険
      var t = e && e.target;
      if (!isIconImg(t)) return;
      /* ★preventDefault も stopPropagation も呼ばない＝既存の click 処理は素通りする */
      openFor(t);
    } catch(err){}
  }

  var armed = false;
  if (!isOff()){
    try { document.addEventListener('click', _onClick, true); armed = true; } catch(e){}   // capture=true（理由はヘッダ）
  }

  window.__v292Dfix777 = {
    __armed: armed,
    isOff: isOff,
    isIconImg: isIconImg, nameFor: nameFor,
    openFor: openFor, open: open, close: close, isOpen: isOpen,
    _onClick: _onClick, OVERLAY_ID: OVERLAY_ID
  };
  try { console.log(TAG, 'loaded (armed=' + (armed ? '1' : '0') + ')'); } catch(e){}
})();
