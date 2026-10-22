// =====================================================================
// Chronicle TRPG - v292DfixIS1: アイコンの大きさ設定（小 / 中 / 大）  ICON-SIZE-1
// ---------------------------------------------------------------------
// ■何をするか（表示だけ。画像・生成・保存データ・サーバーには一切触らない）
//   「🎛 調整」の中の「🖼アイコン」欄に 小 / 中 / 大 の選択を足す。選んだ値は <html data-chr-is1="s|m|l"> と
//   CSS カスタムプロパティ --chr-icon-size（会話ログの丸）/ --chr-icon-roster（キャラ一覧の四角）だけで表す。
//   ・中 = いまの大きさそのまま（会話ログ 72px(PC) / 56px(768px 未満)、キャラ一覧 56px）。中では要素へ CSS を一切当てない。
//   ・小 = 0.75 倍（54 / 42 / 一覧 42）、大 = 1.5 倍（108 / 84 / 一覧 84）。幅の狭い画面は 26vw を上限にして文章が潰れないようにする。
//   ・顔ズーム（LE2 の「顔 等倍/1.3/1.6」と fix979）は円の中の相対倍率なので、円が変われば比例して大きくなる（別計算はしない）。
//   ・アイコンをタップすると拡大（fix777 lightbox）はそのまま。タップできる面積も大きさに従う。
// ■保存: localStorage v292DfixIS1Size = 's'|'m'|'l'（この端末だけ。無い = 中）。
//   旧 LE2 の「アイコンの大きさ」(v292DfixLE2Size small/large) だけが残っている端末は、読み取りだけで 小/大 に引き継ぐ（書き換えない）。
//   LE2 の「大きさ」欄は、この module が有効な間は隠す（顔の寄せ欄は残す）。LE2 の data-chr-avsize 属性はこの module が外す（二重に効かせない）。
// ■kill: localStorage v292DfixIS1Off='1' → 何もしない（欄なし・CSS 変数なし・属性なし＝release40 と同じ DOM）。
// ■公開口: window.__v292DfixIS1 = { size(), set(v), status() }
// =====================================================================
(function(){
  'use strict';
  var KEY = 'v292DfixIS1Size', OFF = 'v292DfixIS1Off', STYLE_ID = 'v292DfixIS1-style';
  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function lss(k, v){ try { localStorage.setItem(k, v); return true; } catch(e){ return false; } }
  if (lsg(OFF) === '1') return;
  if (window.__v292DfixIS1) return;

  var st = { applied: 0, ui: 0, changes: 0, own: 0, merged: 0 };
  var t0 = Date.now();

  function size(){
    var v = lsg(KEY);
    if (v === 's' || v === 'm' || v === 'l') return v;
    if (lsg('v292DfixLE2Off') !== '1'){        // 旧 LE2 の大きさだけが残っている端末: 読み取りだけで引き継ぐ
      var l = lsg('v292DfixLE2Size');
      if (l === 'small') return 's';
      if (l === 'large') return 'l';
    }
    return 'm';
  }

  function css(){
    var A = ':root[data-chr-is1]';
    var sl = function(v){ return A.replace(']', '="' + v + '"]'); };
    var box = function(px){ return 'width:' + px + ' !important;height:' + px + ' !important;flex:0 0 ' + px + ' !important;min-width:' + px + ' !important;min-height:' + px + ' !important'; };
    var S = sl('s'), L = sl('l');
    return [
      A + '{--chr-icon-k:1;--chr-icon-size:min(calc(56px * var(--chr-icon-k)),26vw);--chr-icon-roster:min(calc(56px * var(--chr-icon-k)),26vw)}',
      S + '{--chr-icon-k:.75}',
      L + '{--chr-icon-k:1.5}',
      '@media (min-width:768px){' + A + '{--chr-icon-size:calc(72px * var(--chr-icon-k));--chr-icon-roster:calc(56px * var(--chr-icon-k))}}',
      /* 会話ログの丸（fix63 / LE2 の !important より詳しい書き方で勝たせる）。中(m)には当てない */
      S + ' .dlg-av,' + L + ' .dlg-av{' + box('var(--chr-icon-size)') + '}',
      S + ' .dlg-av img,' + L + ' .dlg-av img{width:100% !important;height:100% !important}',
      /* キャラ一覧（fix145 の先頭の絵の枠。inline の 56px を上書き） */
      S + ' .v292Dfix145-card > div:first-child,' + L + ' .v292Dfix145-card > div:first-child{' + box('var(--chr-icon-roster)') + '}',
      '#v292DfixIS1-ctl{margin-left:8px;font-size:12px;display:inline-flex;align-items:center;gap:4px}',
      'select[data-is1="size"]{font-size:12px;max-width:96px}'
    ].join('\n');
  }
  function ensureStyle(){
    try {
      if (document.getElementById(STYLE_ID)) return;
      var s = document.createElement('style'); s.id = STYLE_ID; s.textContent = css();
      (document.head || document.documentElement).appendChild(s);
    } catch(e){}
  }
  function apply(){
    try {
      var r = document.documentElement; if (!r) return;
      ensureStyle();
      var v = size();
      if (r.getAttribute('data-chr-is1') !== v) r.setAttribute('data-chr-is1', v);
      if (r.hasAttribute('data-chr-avsize')) r.removeAttribute('data-chr-avsize');   // LE2 の大きさ属性は使わない（この module が一本で持つ）
      st.applied++;
      var sels = document.querySelectorAll('select[data-is1="size"]');
      for (var i = 0; i < sels.length; i++) if (sels[i].value !== v) sels[i].value = v;
    } catch(e){}
  }

  function mkSelect(){
    var sel = document.createElement('select'); sel.setAttribute('data-is1', 'size'); sel.id = 'v292DfixIS1-sel';
    sel.setAttribute('aria-label', 'アイコンの大きさ');
    sel.innerHTML = '<option value="s">小</option><option value="m">中</option><option value="l">大</option>';
    sel.value = size();
    sel.addEventListener('change', function(){
      var v = sel.value; if (v !== 's' && v !== 'm' && v !== 'l') return;
      lss(KEY, v); st.changes++; apply();
    });
    return sel;
  }
  function ensureUI(){
    try {
      var tb = document.getElementById('topbar'); if (!tb) return;
      var le2 = document.getElementById('v292DfixLE2-ctl');
      var own = document.getElementById('v292DfixIS1-ctl');
      var mine = document.getElementById('v292DfixIS1-sel');
      if (le2){
        var old = le2.querySelector('select[data-le2="size"]');
        if (old && old.style.display !== 'none') old.style.display = 'none';
        if (!mine || mine.parentNode !== le2){
          if (own && own.parentNode) own.parentNode.removeChild(own);
          if (mine && mine.parentNode) mine.parentNode.removeChild(mine);
          var s = mkSelect(); le2.insertBefore(s, old || le2.firstChild.nextSibling); st.ui++; st.merged++;
        }
        return;
      }
      /* LE2 の欄が無い（LE2 を止めている／まだ作られていない）: 止めているか、4 秒待っても出なければ自前の欄を作る */
      if (!own && (lsg('v292DfixLE2Off') === '1' || Date.now() - t0 > 4000)){
        var sp = document.createElement('span'); sp.id = 'v292DfixIS1-ctl'; sp.className = 'v243-foldable';
        sp.title = '会話ログ・キャラ一覧のアイコンの大きさ（この端末だけ。絵は変わりません）';
        sp.appendChild(document.createTextNode('🖼アイコン'));
        sp.appendChild(mkSelect()); tb.appendChild(sp); st.ui++; st.own++;
      }
    } catch(e){}
  }

  apply();
  try { window.addEventListener('storage', function(ev){ if (!ev || ev.key === KEY || ev.key === 'v292DfixLE2Size') apply(); }); } catch(e){}
  try { new MutationObserver(function(){ var r = document.documentElement; if (r && r.hasAttribute('data-chr-avsize')) r.removeAttribute('data-chr-avsize'); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-chr-avsize'] }); } catch(e){}
  var n = 0;
  function loop(){ n++; ensureUI(); setTimeout(loop, n < 20 ? 500 : 2000); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ apply(); loop(); }); else loop();

  window.__v292DfixIS1 = {
    version: 'is1-r1',
    size: size,
    set: function(v){ if (v !== 's' && v !== 'm' && v !== 'l') return false; lss(KEY, v); apply(); return true; },
    status: function(){ return { size: size(), attr: document.documentElement.getAttribute('data-chr-is1'), applied: st.applied, ui: st.ui, changes: st.changes, own: st.own, merged: st.merged }; }
  };
})();
