// =====================================================================
// Chronicle TRPG - v292Dfix356: 「🎨 そろえる」ボタン（画風統一の実用導線）
// v292Dfix358改訂(2026-07-02深夜): regenAllCast(全員一斉発火)だとTogetherの
//   レートにはねられ、失敗分をfix347が旧画風の絵で復元→「そろえたのに混在」
//   (おしん実機で発生・consoleに「生成失敗→既存の絵で復元(フユ)」)。
//   → 本ボタンは自前の直列キュー(1人ずつ・4秒間隔)で作り直す。進捗はstatusに表示。
// OFF: localStorage v292Dfix356Off='1'
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix356) return; window.__v292Dfix356 = true;
  var TAG = '[v292Dfix356:unifyBtn]';
  function off(){ try{ return localStorage.getItem('v292Dfix356Off')==='1'; }catch(e){ return false; } }
  function getS(){ try{ if (window.S) return window.S; return (0,eval)('S'); }catch(e){ return null; } }

  function castNames(){
    var S = getS(); var names = [];
    try {
      if (S && S.cast) {
        if (S.cast.hero && S.cast.hero.name && S.cast.hero.name.trim()) names.push(S.cast.hero.name.trim());
        (S.cast.npcs||[]).forEach(function(n){ if (n && n.name && String(n.name).trim()) names.push(String(n.name).trim()); });
      }
    } catch(e){}
    return names;
  }

  function currentStyleLabel(){
    try {
      var sel = document.getElementById('v292-style-sel');
      if (sel && sel.selectedIndex >= 0) return sel.options[sel.selectedIndex].textContent.trim();
    } catch(e){}
    return '現在の画風';
  }

  var running = false;
  function onClick(){
    try {
      if (running) { try{ UI.setStatus('🎨 いま作り直しの最中です。少し待ってください'); }catch(_){}; return; }
      var f = window.__v292Dfix197 || window.__v292Dfix199;
      var api = window.__v292Dfix338;
      var names = castNames();
      if (!names.length) { alert('作り直すキャラがいません（名前のあるキャラが対象）'); return; }
      var label = currentStyleLabel();
      var yen = Math.max(1, Math.round(names.length * 0.1));
      if (!confirm('全キャラ('+names.length+'人)のアイコンを「'+label+'」で作り直します。\nおおよそ'+yen+'円ほどかかります。よろしいですか？\n（1人ずつ順番に作ります・失敗しても元の絵は守られます）')) return;
      if (!(f && typeof f.regenFor === 'function')) {
        if (api && typeof api.regenAllCast === 'function') { api.regenAllCast(); }
        else alert('アイコンエンジンが見つかりません');
        return;
      }
      // ★v292Dfix358: 直列キュー(4秒間隔)=Togetherのレート429回避
      running = true;
      var i = 0;
      (function next(){
        if (i >= names.length) {
          running = false;
          try{ UI.setStatus('🎨 全員を「'+label+'」で作り直しました（'+names.length+'人）'); }catch(_){}
          try{ console.log(TAG, 'serial regen done:', names.length); }catch(_){}
          return;
        }
        var nm = names[i++];
        try { f.regenFor(nm); } catch(e){ try{ console.warn(TAG, 'regenFor failed', nm, e); }catch(_){} }
        try { UI.setStatus('🎨 '+nm+' を作り直し中…（'+i+'/'+names.length+'）'); } catch(_){}
        setTimeout(next, 4000);
      })();
    } catch(e){ try{ console.warn(TAG, e); }catch(_){} }
  }

  function inject(){
    if (off()) return;
    try {
      var sel = document.getElementById('v292-style-sel');
      if (!sel || document.getElementById('v292-style-unify-btn')) return;
      var b = document.createElement('button');
      b.id = 'v292-style-unify-btn';
      b.textContent = '🎨そろえる';
      b.title = '全キャラのアイコンを現在の画風で1人ずつ順番に作り直し（混ざった画風を統一）。1人あたり約0.1円';
      b.style.cssText = 'margin-left:4px;padding:2px 8px;font-size:11px;cursor:pointer;border-radius:6px;border:1px solid #4a4a72;background:#3a3a5e;color:#e7e7f7;vertical-align:middle;';
      b.onclick = onClick;
      if (sel.parentNode) sel.parentNode.insertBefore(b, sel.nextSibling);
    } catch(e){}
  }

  inject();
  setInterval(inject, 2000);

  try{ console.log(TAG, 'loaded (serial regen)', off()?'OFF':'ON'); }catch(_){}
})();
