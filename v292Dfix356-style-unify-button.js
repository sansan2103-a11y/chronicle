// =====================================================================
// Chronicle TRPG - v292Dfix356: 「🎨 そろえる」ボタン（画風統一の実用導線）
// 背景(2026-07-02 おしん依頼「アイコンの画風が統一されるようにして」):
//   混在の真因は4層(調査済み・詳細は仕組みまとめ文書):
//     ①統一エンジン(fix338)がプレビュー既定OFFだった→同時デプロイのパッチで既定ONへ
//     ②ON前に生成された旧式の絵が同じキャッシュキーに残存
//     ③fix345のキー複製(ダーク→闇アニメ)で複製絵と新式絵が混在
//     ④闇アニメ(初代)は外見優先の旧式再現=設計的にばらつく(仕様)
//   ②③は「現在の画風で全員作り直す」しか揃える方法がない(キャッシュは名前+画風キー)。
//   fix338に regenAllCast() は実装済みなのにUI導線が無かった → 本modでボタン化。
// 動作: 画風セレクタ(#v292-style-sel)の直後に小ボタン「🎨そろえる」を挿入。
//   押すと確認ダイアログ(人数と概算費用を表示)→ __v292Dfix338.regenAllCast()。
//   fix347の失敗ガードがあるので、生成失敗時も既存の良い絵は守られる。
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

  function onClick(){
    try {
      var api = window.__v292Dfix338;
      if (!api || typeof api.regenAllCast !== 'function') { alert('画風統一エンジン(fix338)が見つかりません'); return; }
      var names = castNames();
      if (!names.length) { alert('作り直すキャラがいません（名前のあるキャラが対象）'); return; }
      var label = currentStyleLabel();
      var yen = Math.max(1, Math.round(names.length * 0.1));
      if (!confirm('全キャラ('+names.length+'人)のアイコンを「'+label+'」で作り直します。\nおおよそ'+yen+'円ほどかかります。よろしいですか？\n（失敗しても元の絵は守られます）')) return;
      api.regenAllCast();
      try { if (window.UI && UI.setStatus) UI.setStatus('🎨 '+label+'で全キャラのアイコンを作り直しています…（数十秒）'); } catch(_){}
      try { console.log(TAG, 'regenAllCast fired for', names.length, 'chars'); } catch(_){}
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
      b.title = '全キャラのアイコンを現在の画風で一括作り直し（混ざった画風を統一）。1人あたり約0.1円';
      b.style.cssText = 'margin-left:4px;padding:2px 8px;font-size:11px;cursor:pointer;border-radius:6px;border:1px solid #4a4a72;background:#3a3a5e;color:#e7e7f7;vertical-align:middle;';
      b.onclick = onClick;
      if (sel.parentNode) sel.parentNode.insertBefore(b, sel.nextSibling);
    } catch(e){}
  }

  inject();
  setInterval(inject, 2000); // topbar再構築/折りたたみに追従(冪等)

  try{ console.log(TAG, 'loaded', off()?'OFF':'ON'); }catch(_){}
})();
