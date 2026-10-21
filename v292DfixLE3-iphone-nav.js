// =====================================================================
// Chronicle TRPG - v292DfixLE3: iPhone 幅だけ、ゲーム画面の上のバーを 1 行にして「展開の描写」を広げる（Owner #129 / UX-09）
// ---------------------------------------------------------------------
//   ・幅 520px 以下（iPhone 縦）だけ。PC / iPad / 横向きは 1 byte も変わらない（CSS は media query の中だけ）。
//   ・上のバー: 「◈ CHRONICLE　🏠 ホーム　☰」の 1 行。☰ を 1 回押すと 調整 / キャラ / 設定 / カード / 記憶 / 見る が出る（もう 1 回で閉じる）。
//   ・ボタンは動かさない・作り直さない（DOM の移動 0）。CSS で出し分けるだけ＝fix243（調整の ▾ 件数）・fix145・fix313-315 は従来どおり。
//   ・「展開の描写」: 上のバーが減った分を、会話ログ（従来の高さのまま）ではなく展開の描写へ回す。
//   ・状態表示（topStatus）は 1 行にするため、バーの下へ重ねて出す（文字があるときだけ・場所は取らない）。
//   ・kill: localStorage v292DfixLE3Off='1'（☰ を作らず CSS も入れない）
// =====================================================================
(function(){
  'use strict';
  if (window.__v292DfixLE3) return; window.__v292DfixLE3 = true;
  try { if (localStorage.getItem('v292DfixLE3Off') === '1') return; } catch(e){}
  var MQ = '(max-width:520px)';
  var IDS = ['v243-toggle', 'v313-btn', 'v314-btn', 'v315-btn'], CLS = ['v292Dfix145-charlist-btn', 'le3-set'];
  var pre = 'html body #topbar';
  function sel(prefix, tail){ var a = []; IDS.forEach(function(i){ a.push(prefix + ' #' + i + (tail || '')); }); CLS.forEach(function(c){ a.push(prefix + ' .' + c + (tail || '')); }); return a.join(','); }
  var css = '#le3-menu-btn{display:none}\n'
    + '@media ' + MQ + '{\n'
    + pre + '{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:max(6px,env(safe-area-inset-top)) max(8px,env(safe-area-inset-right)) 6px max(8px,env(safe-area-inset-left));row-gap:6px;column-gap:6px;}\n'
    + pre + ' h1{order:1;flex:1 1 0;min-width:0;margin:0;font-size:15px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}\n'
    + pre + ' #v527-home{order:2;}\n'
    + pre + ' #le3-menu-btn{order:3;display:inline-flex !important;align-items:center;justify-content:center;min-width:44px;min-height:32px;padding:4px 12px;border-radius:8px;cursor:pointer;font:inherit;font-size:17px;line-height:1;background:var(--s2,#17172a);color:var(--tx,#e0def0);border:1px solid var(--border,rgba(139,118,240,.3));}\n'
    + pre + '.le3-open #le3-menu-btn{background:var(--s3,#2a2a46);border-color:#7a7ac0;}\n'
    + pre + ' > :where(*:not(h1):not(#v527-home):not(#le3-menu-btn):not(#topStatus)){order:9;flex:1 1 calc(50% - 3px);min-width:0;}\n'
    + sel(pre + ':not(.le3-open)') + '{display:none !important;}\n'
    + pre + '.le3-open::before{content:"";order:4;flex:0 0 100%;height:0;}\n'
    + sel(pre + '.le3-open') + '{order:5;display:inline-flex !important;align-items:center;justify-content:center;flex:0 0 calc((100% - 12px) / 3);min-width:0;box-sizing:border-box;padding-left:4px;padding-right:4px;white-space:nowrap;}\n'
    + pre + ' #topStatus{position:absolute;left:8px;right:8px;top:100%;z-index:40;margin:0;padding:3px 10px;font-size:11px;line-height:1.4;border-radius:0 0 8px 8px;background:rgba(20,20,34,.94);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none;order:0;}\n'
    + pre + ' #topStatus:empty{display:none;}\n'
    /* 展開の描写へ空きを回す: 会話ログは従来とほぼ同じ高さのまま、展開の描写は上限（50%）を外して残りを全部使う */
    + 'html body.v100-split #narrative-col, html body.v292-mobile #narrative-col{flex:1 1 auto !important;max-height:none !important;min-height:0 !important;}\n'
    + 'html body.v100-split #dialogue-col, html body.v292-mobile #dialogue-col{flex:0 0 auto !important;height:clamp(110px,calc((100dvh - 290px) / 2),232px) !important;max-height:35vh !important;min-height:0 !important;}\n'
    + 'html body #composer{padding-bottom:max(6px,env(safe-area-inset-bottom)) !important;}\n'
    + '}';
  function inject(){
    try {
      var st = document.getElementById('v292DfixLE3-style');
      if (!st){ st = document.createElement('style'); st.id = 'v292DfixLE3-style'; (document.head || document.documentElement).appendChild(st); }
      if (st.textContent !== css) st.textContent = css;
    } catch(e){}
  }
  function bar(){ return document.getElementById('topbar'); }
  function isOpen(){ var b = bar(); return !!(b && b.classList.contains('le3-open')); }
  function setOpen(v){
    var b = bar(); if (!b) return; b.classList.toggle('le3-open', !!v);
    var t = document.getElementById('le3-menu-btn'); if (t){ t.setAttribute('aria-expanded', v ? 'true' : 'false'); t.textContent = v ? '✕' : '☰'; }
  }
  function tag(){
    var b = bar(); if (!b) return false;
    /* 設定ボタン（id なし）に目印 class を付ける。ほかのスクリプトは class を見ていないので影響なし */
    Array.prototype.forEach.call(b.children, function(c){ try { if (c.tagName === 'BUTTON' && !c.id && /^\s*⚙?\s*設定\s*$/.test(c.textContent || '') && !c.classList.contains('le3-set')) c.classList.add('le3-set'); } catch(e){} });
    if (!document.getElementById('le3-menu-btn')){
      var t = document.createElement('button'); t.type = 'button'; t.id = 'le3-menu-btn'; t.textContent = '☰'; t.setAttribute('aria-label', 'メニュー（調整・キャラ・設定・カード・記憶・見る）'); t.setAttribute('aria-expanded', 'false');
      t.addEventListener('click', function(ev){ try { ev.stopPropagation(); } catch(e){} setOpen(!isOpen()); });
      b.appendChild(t);
    }
    return true;
  }
  function arm(){
    inject();
    if (!tag()){ setTimeout(arm, 400); return; }
    var b = bar();
    /* メニューの項目を押したら閉じる（調整だけは開いたまま＝調整の中身が見える） */
    b.addEventListener('click', function(ev){
      try { var el = ev.target; while (el && el !== b){ if (el.tagName === 'BUTTON'){ if (el.id === 'le3-menu-btn' || el.id === 'v243-toggle') return; if (el.classList.contains('le3-set') || el.classList.contains('v292Dfix145-charlist-btn') || el.id === 'v313-btn' || el.id === 'v314-btn' || el.id === 'v315-btn') setTimeout(function(){ setOpen(false); }, 0); return; } el = el.parentNode; } } catch(e){}
    });
    document.addEventListener('click', function(ev){ try { if (isOpen() && !(bar() && bar().contains(ev.target))) setOpen(false); } catch(e){} });
    document.addEventListener('keydown', function(ev){ try { if (ev && ev.key === 'Escape' && isOpen()) setOpen(false); } catch(e){} });
    try { new MutationObserver(function(){ tag(); }).observe(b, { childList: true }); } catch(e){}
    try { setInterval(function(){ inject(); tag(); }, 2000); } catch(e){}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm); else arm();
  window.__v292DfixLE3api = { open: function(){ setOpen(true); }, close: function(){ setOpen(false); }, isOpen: isOpen };
  try { console.log('[v292DfixLE3] iphone nav armed'); } catch(e){}
})();
