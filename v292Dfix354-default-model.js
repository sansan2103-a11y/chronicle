// =====================================================================
// Chronicle TRPG - v292Dfix354: 既定モデルをDS V4 Flashに(mistral-nemo退役)
// 背景(2026-07-02 おしん報告「英文になった/アイコン・会話ログ・一覧おかしい」):
//   真因=index.htmlの新規スロット初期cfgに超初期の名残 orModel:'mistralai/mistral-nemo'。
//   mistral-nemoは日本語が弱く英語セリフが混入→話者名がローマ字(Tsukasa)で記録→
//   カタカナの主人公(ツカサ)と別人扱い→会話ログの別カード/一覧の重複/未登録用
//   代替アイコン、と全部が連鎖(単一根)。fix256のDS専用化方針とも不整合。
// 対策(おしん承認済み・両方):
//   ① 移行: S.cfg.orModel が mistral-nemo のスロットは deepseek/deepseek-v4-flash へ
//      自動書換+保存(新規スロットも作成直後にここを通るので実質既定変更)。
//      アクティブスロット以外も、スロット切替のたびに同じ判定が走るので順次移行される。
//   ② セレクタから mistral-nemo の選択肢を除去(ポーリングで再注入にも追従)。
//   index.html本体は不触(インライン編集リスク回避・モジュールで完結)。
// OFF: localStorage v292Dfix354Off='1'
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix354) return; window.__v292Dfix354 = true;
  var TAG = '[v292Dfix354:defaultModel]';
  var OLD = 'mistralai/mistral-nemo';
  var NEW = 'deepseek/deepseek-v4-flash';
  function off(){ try{ return localStorage.getItem('v292Dfix354Off')==='1'; }catch(e){ return false; } }
  function getS(){ try{ if (window.S) return window.S; return (0,eval)('S'); }catch(e){ return null; } }

  // ① orModel移行(起動時+保険ポーリング=スロット切替にも追従)
  function migrate(){
    if (off()) return;
    try {
      var S = getS(); if (!S || !S.cfg) return;
      if (S.cfg.orModel === OLD) {
        S.cfg.orModel = NEW;
        if (typeof S.save === 'function') S.save();
        try{ console.log(TAG, 'orModel migrated: mistral-nemo -> DS V4 Flash'); }catch(_){}
      }
    } catch(e){}
  }

  // ② セレクタからmistral-nemoを除去(現在値が選択中だった場合はNEWへ)
  function pruneSelectors(){
    if (off()) return;
    try {
      document.querySelectorAll('select').forEach(function(sel){
        var removed = false;
        Array.prototype.slice.call(sel.options).forEach(function(o){
          if (o.value === OLD || /mistral-nemo/i.test(o.value)) {
            var wasSelected = o.selected;
            o.remove(); removed = true;
            if (wasSelected) {
              var ds = Array.prototype.slice.call(sel.options).find(function(x){ return x.value === NEW; });
              if (ds) { sel.value = NEW; try{ sel.dispatchEvent(new Event('change', {bubbles:true})); }catch(_){} }
            }
          }
        });
        if (removed) { try{ console.log(TAG, 'pruned mistral-nemo option'); }catch(_){} }
      });
    } catch(e){}
  }

  migrate();
  pruneSelectors();
  setInterval(function(){ migrate(); pruneSelectors(); }, 2000);

  try{ console.log(TAG, 'loaded', off()?'OFF':'ON'); }catch(_){}
})();
