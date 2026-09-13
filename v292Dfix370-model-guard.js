// =====================================================================
// Chronicle TRPG - v292Dfix370: 非DSモデルの自動Flash復帰 + セレクタ整理
// 背景(2026-07-04 おしん):「hermes-4-405bにした覚えない/DSしか使わない」。
//   スロット a と smr47sgruuq に nousresearch/hermes-4-405b が保存されていた
//   (並行タブ/ポインタ切替の巻き添えで混入した可能性)。日本語長編はDS系のみ運用方針。
// 対策(fix354 mistral-nemo退役の一般化):
//   ① 移行: S.cfg.orModel が deepseek/ で始まらないスロットは deepseek-v4-flash へ
//      自動書換+保存(起動時+2sポーリング=スロット切替にも追従)。DS Flash/Proは温存。
//   ② セレクタから非DSの選択肢(hermes等)を除去。選択中だったらDS Flashへ。
//      モデルセレクタの誤爆防止のため「deepseek/ を1つ以上含むselect」だけを対象。
//   index.html本体は不触。
// OFF: localStorage v292Dfix370Off='1'
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix370) return; window.__v292Dfix370 = true;
  var TAG = '[v292Dfix370:modelGuard]';
  /* ★v292Dsmrc1: 復帰先と prefix 判定を集中定義へ。
     旧: FLASH = '<旧 Flash literal>' / isDS = indexOf('deepseek/')===0
     新: 復帰先 = registry.primary()、判定 = registry.isManaged()（primary の namespace から導く）
     ⇒ 第2段で primary が新 slug になっても **新 slug を引き戻さない**し、旧 Flash へも戻さない。
     registry が無いときは fail-closed = 移行も剪定もしない（既存値を壊さない）。 */
  function REG(){ try { return window.__CHR_MODEL_REGISTRY || null; } catch(e){ return null; } }
  function FLASH(){ var R = REG(); return (R && R.primary) ? R.primary() : ''; }
  var isDS = function(v){ var R = REG(); return !!R && !!R.isManaged && R.isManaged(v); };
  function off(){ try{ return localStorage.getItem('v292Dfix370Off')==='1'; }catch(e){ return false; } }
  function getS(){ try{ if (window.S) return window.S; return (0,eval)('S'); }catch(e){ return null; } }
  function migrate(){
    if (off()) return;
    try {
      var S = getS(); if (!S || !S.cfg) return;
      var _p = FLASH(); if (!_p) return;   /* v292Dsmrc1: fail-closed */
      if (!isDS(S.cfg.orModel)) {
        var old = S.cfg.orModel;
        S.cfg.orModel = _p;
        if (typeof S.save === 'function') (typeof S.saveC==='function'?S.saveC('fix370.migrate'):S.save());
        try{ console.log(TAG, 'orModel migrated:', old, '->', _p); }catch(_){}
      }
    } catch(e){}
  }
  function pruneSelectors(){
    if (off()) return;
    try {
      var _pf = FLASH(); if (!_pf) return;   /* v292Dsmrc1: fail-closed */
      document.querySelectorAll('select').forEach(function(sel){
        var opts = Array.prototype.slice.call(sel.options);
        var isModelSel = opts.some(function(o){ return isDS(o.value); });
        if (!isModelSel) return;
        var removed = false;
        opts.forEach(function(o){
          if (!isDS(o.value)) {
            var wasSelected = o.selected;
            o.remove(); removed = true;
            if (wasSelected) {
              var ds = Array.prototype.slice.call(sel.options).find(function(x){ return x.value === _pf; })
                    || Array.prototype.slice.call(sel.options).find(function(x){ return isDS(x.value); });
              if (ds) { sel.value = ds.value; try{ sel.dispatchEvent(new Event('change', {bubbles:true})); }catch(_){} }
            }
          }
        });
        if (removed) { try{ console.log(TAG, 'pruned non-DS option(s)'); }catch(_){} }
      });
    } catch(e){}
  }
  migrate();
  pruneSelectors();
  setInterval(function(){ migrate(); pruneSelectors(); }, 2000);
  try{ console.log(TAG, 'loaded', off()?'OFF':'ON'); }catch(_){}
})();
