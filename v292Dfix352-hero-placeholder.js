// =====================================================================
// Chronicle TRPG - v292Dfix352: 空の主人公は顔を出さない(表示ガード)
// 背景(2026-07-02 おしん指摘): 名前も説明も空なのに設定の主人公カードに
//   顔が出る。正体=アバターキャッシュが「名前+画風」キーで全スロット共有のため、
//   名無し主人公は毎回同じ既定キーに当たり過去の生成画像がヒットして表示される
//   (新規生成/課金は走っていない・実測でネットワーク確認済み)。
// 対策: 名前と説明が両方空の間だけ、#heroAvSettings の img を隠して
//   「?」プレースホルダを重ねる。どちらかが入力されたら即 img に戻す。
//   キャッシュ・生成経路は一切触らない(アバター不変条件を尊重)。
// 実装メモ: buildHeroWidget(v100)は設定の再描画ごとに走る→MutationObserver+
//   input委譲+1.5sポーリングで冪等に再適用。クラスは classList のみ操作
//   (fix329教訓: className丸ごと代入は他モジュールのガードを消す)。
// OFF: localStorage v292Dfix352Off='1'
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix352) return; window.__v292Dfix352 = true;
  var TAG = '[v292Dfix352:heroPh]';
  function off(){ try{ return localStorage.getItem('v292Dfix352Off')==='1'; }catch(e){ return false; } }
  function getS(){ try{ if (window.S) return window.S; return (0,eval)('S'); }catch(e){ return null; } }

  function heroEmpty(){
    // モーダルが開いていればDOMの入力欄を優先(打鍵に即追従)、無ければSを見る
    var n = document.getElementById('cfgHName');
    var d = document.getElementById('cfgHDesc');
    if (n || d) {
      var nv = n ? String(n.value||'').trim() : '';
      var dv = d ? String(d.value||'').trim() : '';
      return nv === '' && dv === '';
    }
    var S = getS();
    if (!S || !S.cast || !S.cast.hero) return false;
    return String(S.cast.hero.name||'').trim() === '' && String(S.cast.hero.desc||'').trim() === '';
  }

  function ensurePh(hav, img){
    var ph = hav.querySelector('.f352-ph');
    if (ph) return ph;
    ph = document.createElement('div');
    ph.className = 'f352-ph';
    var w = (img && img.clientWidth) ? img.clientWidth : 64;
    var h = (img && img.clientHeight) ? img.clientHeight : 64;
    var br = '12px';
    try { if (img) { var cs = getComputedStyle(img); if (cs && cs.borderRadius) br = cs.borderRadius; } } catch(e){}
    ph.style.cssText = 'display:flex;align-items:center;justify-content:center;'
      + 'width:'+w+'px;height:'+h+'px;border-radius:'+br+';'
      + 'background:rgba(255,255,255,.06);border:1px dashed rgba(255,255,255,.25);'
      + 'font-size:'+Math.max(18, Math.floor(h*0.4))+'px;opacity:.7;user-select:none;flex:none;';
    ph.textContent = '?';
    if (img && img.parentNode) img.parentNode.insertBefore(ph, img);
    else hav.insertBefore(ph, hav.firstChild);
    return ph;
  }

  function apply(){
    if (off()) return;
    try {
      var hav = document.getElementById('heroAvSettings');
      if (!hav) return;
      var img = hav.querySelector('img');
      var ph = hav.querySelector('.f352-ph');
      if (heroEmpty()) {
        if (img) {
          if (!img.__f352hidden) { img.__f352hidden = true; img.style.visibility = 'hidden'; img.style.position = 'absolute'; img.style.pointerEvents = 'none'; }
          ensurePh(hav, img);
        } else if (!ph) {
          ensurePh(hav, null);
        }
      } else {
        if (img && img.__f352hidden) { img.__f352hidden = false; img.style.visibility = ''; img.style.position = ''; img.style.pointerEvents = ''; }
        if (ph && ph.parentNode) ph.parentNode.removeChild(ph);
      }
    } catch(e){ try{ console.warn(TAG, e); }catch(_){} }
  }

  // 入力に即追従(委譲・captureで確実に)
  document.addEventListener('input', function(ev){
    try {
      var t = ev.target;
      if (t && (t.id === 'cfgHName' || t.id === 'cfgHDesc')) apply();
    } catch(_){}
  }, true);

  // 設定モーダルの再描画に追従
  function armObserver(){
    var ov = document.getElementById('settingsOv');
    if (!ov || ov.__f352obs) return !!(ov && ov.__f352obs);
    try {
      var mo = new MutationObserver(function(){ apply(); });
      mo.observe(ov, { childList: true, subtree: true, attributes: true, attributeFilter: ['class','style'] });
      ov.__f352obs = true;
    } catch(e){}
    return true;
  }
  armObserver();
  setInterval(function(){ armObserver(); apply(); }, 1500); // 保険ポーリング(コード規約どおり)

  try{ console.log(TAG, 'loaded', off()?'OFF':'ON'); }catch(_){}
})();
