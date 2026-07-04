// =====================================================================
// Chronicle TRPG - v292Dfix371: リセット確認ダイアログの「APIキー」文言を除去(表示ガード)
// 背景(2026-07-04 おしん):「APIの文章消えてないよ」。
//   真ソースは features.js 内 __v292ResetConfirm(...) の呼び出し引数(焼き込み文字列)。
//   呼び出しはレキシカル参照のため window.__v292ResetConfirm 差替では捕まえられない。
//   → ダイアログDOM([data-v292-reset-modal])が出た瞬間にメッセージ<div>を書換える
//     表示ガード方式(fix350/352/364と同流儀・リセット動作は不触)。
//   ※ fix367でindex.html側の別テキストは直したが、表示に出るのはfeatures.js経路だった。
// OFF: localStorage v292Dfix371Off='1'
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix371) return; window.__v292Dfix371 = true;
  var TAG = '[v292Dfix371:resetDialogText]';
  function off(){ try{ return localStorage.getItem('v292Dfix371Off')==='1'; }catch(e){ return false; } }
  function rewrite(text){
    var t = text;
    t = t.replace('設定・APIキー・NPC設定は保持されます', '世界観・キャラ・設定・ログインは保持されます');
    t = t.replace('すべてのデータ（APIキー・設定を含む）を削除しますか？',
                  'すべてのデータ（世界観・キャラ・設定）を削除しますか？ログイン（合言葉／Google）はそのまま使えます。');
    if (t.indexOf('APIキー') >= 0) t = t.replace(/APIキー[・、]?/g, '');
    return t;
  }
  function fixModal(root){
    if (off() || !root || !root.querySelectorAll) return;
    try {
      var nodes = [root].concat(Array.prototype.slice.call(root.querySelectorAll('*')));
      nodes.forEach(function(el){
        if (el.children && el.children.length === 0 && el.textContent && el.textContent.indexOf('APIキー') >= 0) {
          var neu = rewrite(el.textContent);
          if (neu !== el.textContent) {
            el.textContent = neu;
            try{ console.log(TAG, 'dialog text corrected'); }catch(_){}
          }
        }
      });
    } catch(e){}
  }
  try { document.querySelectorAll('[data-v292-reset-modal]').forEach(fixModal); } catch(e){}
  try {
    var mo = new MutationObserver(function(muts){
      if (off()) return;
      for (var i=0;i<muts.length;i++){
        var added = muts[i].addedNodes;
        for (var j=0;j<added.length;j++){
          var n = added[j];
          if (n.nodeType !== 1) continue;
          if (n.getAttribute && n.getAttribute('data-v292-reset-modal')) { fixModal(n); }
          else if (n.querySelector && n.querySelector('[data-v292-reset-modal]')) { fixModal(n.querySelector('[data-v292-reset-modal]')); }
        }
      }
    });
    mo.observe(document.documentElement, { childList:true, subtree:true });
  } catch(e){}
  try{ console.log(TAG, 'loaded', off()?'OFF':'ON'); }catch(_){}
})();
