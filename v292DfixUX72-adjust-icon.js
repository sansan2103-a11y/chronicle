// =====================================================================
// Chronicle TRPG - v292DfixUX72: アイコンの大きさ・顔の寄せを「🎛 調整」からも選べるようにする（bundle72-ux-a・Owner 報告）
// ---------------------------------------------------------------------
// ■なぜ
//   IS1（v292DfixIS1-icon-size.js）は「🎛 調整」の中の「🖼アイコン」欄に 小 / 中 / 大 を置く設計だったが、
//   その欄（LE2 の #v292DfixLE2-ctl）は UI1 が fix880 の「⚙ 設定 → ⚙ システム → 詳細設定（閉じている）」へ移している。
//   Owner は iPhone の ☰ → 調整 を探して見つけられなかった。
// ■何をするか（表示だけ。新しい保存キーは作らない）
//   トップバーの「🎛 調整」で開く欄（fix243 の折りたたみ対象）に「🖼 アイコン」欄を 1 つ足し、
//   大きさ（小 / 中 / 大）と 顔の寄せ（顔 等倍 / 1.3倍 / 1.6倍）の select を出す。
//   ・この 2 つは「設定の中の本物の欄」の写し。選ぶと本物の select に同じ値を入れて change を起こすだけ
//     （＝IS1 / LE2 の今の処理がそのまま保存・反映する。保存先は今までどおり v292DfixIS1Size / v292DfixLE2Zoom など）。
//   ・本物の値が変わったら（設定の欄・別タブ）写しも合わせる。写しから localStorage へは直接書かない。
//   ・本物の欄が無い（IS1 / LE2 を止めている）ものは出さない。「🎛 調整」（fix243）が無い画面では何もしない。
//   ・設定の中の欄はそのまま残る（どちらで選んでも同じ）。UI1・fix880・fix275・fix243・LE3・IS1・fix777 は 1 byte も変えない。
// ■kill: localStorage v292DfixUX72Off='1' → 何もしない（65-b と同じ DOM）
// ■観測: window.__v292DfixUX72.status()
// =====================================================================
(function(){
  'use strict';
  if (window.__v292DfixUX72) return;
  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  if (lsg('v292DfixUX72Off') === '1'){ window.__v292DfixUX72 = { off: true, status: function(){ return { off: true }; } }; return; }
  var VERSION = 'v292DfixUX72-20261031-r1';
  var WRAP_ID = 'ux72-icon-wrap', STYLE_ID = 'v292DfixUX72-style';
  var st = { version: VERSION, off: false, ticks: 0, built: 0, placed: 0, changes: 0, synced: 0, kinds: [] };
  function $(id){ try { return document.getElementById(id); } catch(e){ return null; } }

  /* 本物の select（設定の中にある欄）。自分の写しは id も data 属性も持たないので、ここには入らない */
  function srcFor(kind){
    try {
      if (kind === 'size'){
        var is1 = $('v292DfixIS1-sel'); if (is1) return is1;
        var le2 = $('v292DfixLE2-ctl'); var a = le2 && le2.querySelector('select[data-le2="size"]');
        if (a && a.style.display !== 'none') return a;   /* IS1 を止めている端末だけ LE2 の旧い大きさ欄 */
        return null;
      }
      if (kind === 'zoom'){ var c = $('v292DfixLE2-ctl'); return (c && c.querySelector('select[data-le2="zoom"]')) || null; }
    } catch(e){}
    return null;
  }
  function optSig(sel){ var a = []; for (var i = 0; i < sel.options.length; i++) a.push(sel.options[i].value + '=' + sel.options[i].text); return a.join('|'); }

  var CSS = [
    '#' + WRAP_ID + '{display:inline-flex;flex-direction:column;align-items:stretch;gap:2px;font-size:12px}',
    '#' + WRAP_ID + ' > span:first-child{white-space:nowrap}',
    '#' + WRAP_ID + ' .ux72-row{display:inline-flex;flex-direction:row;align-items:center;gap:4px}',
    '#' + WRAP_ID + ' select{font-size:12px;max-width:110px}',
    '@media (max-width:520px){html body #topbar > #' + WRAP_ID + '{flex:1 1 100% !important;align-items:center}}'
  ].join('\n');
  function injectCss(){
    try { var s = $(STYLE_ID); if (!s){ s = document.createElement('style'); s.id = STYLE_ID; (document.head || document.documentElement).appendChild(s); } if (s.textContent !== CSS) s.textContent = CSS; } catch(e){}
  }

  function mkClone(kind, src){
    var c = document.createElement('select');
    c.setAttribute('data-ux72', kind);
    c.setAttribute('aria-label', src.getAttribute('aria-label') || (kind === 'size' ? 'アイコンの大きさ' : '顔の寄せ'));
    for (var i = 0; i < src.options.length; i++){ var o = document.createElement('option'); o.value = src.options[i].value; o.textContent = src.options[i].text; c.appendChild(o); }
    c.setAttribute('data-ux72-sig', optSig(src));
    c.value = src.value;
    c.addEventListener('change', function(){
      var s = srcFor(kind); if (!s){ sync(); return; }
      if (optSig(s) !== c.getAttribute('data-ux72-sig')){ sync(); return; }
      if (s.value !== c.value){ s.value = c.value; try { s.dispatchEvent(new Event('change', { bubbles: true })); } catch(e){} }   /* 本物の欄の処理（IS1 / LE2）が保存と反映をする */
      st.changes++; sync();
    });
    return c;
  }

  function build(){
    var tb = $('topbar'); if (!tb || !$('v243-toggle')) return null;   /* 「🎛 調整」が無い画面では出さない */
    var kinds = []; if (srcFor('size')) kinds.push('size'); if (srcFor('zoom')) kinds.push('zoom');
    var w = $(WRAP_ID);
    if (!kinds.length){ if (w && w.parentNode) w.parentNode.removeChild(w); st.kinds = []; return null; }
    var need = !w;
    if (w){
      var have = [], cs = w.querySelectorAll('select[data-ux72]');
      for (var i = 0; i < cs.length; i++){ var k = cs[i].getAttribute('data-ux72'), s = srcFor(k); have.push(k); if (!s || optSig(s) !== cs[i].getAttribute('data-ux72-sig')) need = true; }
      if (have.join(',') !== kinds.join(',')) need = true;
    }
    if (need){
      if (!w){ w = document.createElement('span'); w.id = WRAP_ID; }
      w.innerHTML = '';
      w.title = '会話ログ・キャラ一覧のアイコンの見え方（この端末だけ。絵は変わりません）。⚙ 設定 → 詳細設定 の欄と同じ設定です';
      var cap = document.createElement('span'); cap.textContent = '🖼 アイコン'; w.appendChild(cap);
      var row = document.createElement('span'); row.className = 'ux72-row'; w.appendChild(row);
      kinds.forEach(function(k){ row.appendChild(mkClone(k, srcFor(k))); });
      st.built++; st.kinds = kinds.slice();
    }
    /* 「🖌 画風」の隣に置く（画風の欄は後から作られることがあるので、できたら 1 度だけ隣へ寄せる。寄せ直しは最大 5 回＝取り合いにしない） */
    var ap = $('v292-artpreset-wrap'), apIn = !!(ap && ap.parentNode === tb);
    if (w.parentNode !== tb || (apIn && w.previousElementSibling !== ap && st.placed < 5)){
      if (apIn) tb.insertBefore(w, ap.nextSibling); else tb.appendChild(w);
      st.placed++;
    }
    return w;
  }
  function sync(){
    try {
      var w = $(WRAP_ID); if (!w) return;
      var cs = w.querySelectorAll('select[data-ux72]');
      for (var i = 0; i < cs.length; i++){
        var s = srcFor(cs[i].getAttribute('data-ux72')); if (!s) continue;
        if (cs[i].value !== s.value && document.activeElement !== cs[i]){ cs[i].value = s.value; st.synced++; }
      }
    } catch(e){}
  }
  function tick(){ st.ticks++; try { injectCss(); build(); sync(); } catch(e){ st.err = String(e).slice(0, 80); } }
  function boot(){
    tick();
    try { setInterval(tick, 1000); } catch(e){}
    try { document.addEventListener('change', function(ev){ try { var t = ev.target; if (t && t.matches && t.matches('#v292DfixIS1-sel, #v292DfixLE2-ctl select')) setTimeout(sync, 0); } catch(_){} }, true); } catch(e){}
    try { window.addEventListener('storage', function(){ setTimeout(sync, 50); }); } catch(e){}
  }
  window.__v292DfixUX72 = { version: VERSION, off: false, tick: tick, status: function(){ var o = {}; for (var k in st) o[k] = st[k]; o.present = !!$(WRAP_ID); return o; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  try { console.log('[v292DfixUX72] armed', VERSION); } catch(e){}
})();
