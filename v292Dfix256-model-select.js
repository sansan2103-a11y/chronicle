// =====================================================================
// Chronicle TRPG - v292Dfix256: 🧠モデル切替セレクタ
// ---------------------------------------------------------------------
// 背景(2026-06-11 モデルA/B実測): DeepSeek V4 Flash が Hermes 4 405B を
//   状況推論・日本語品質・タグ契約遵守で明確に上回り、価格は約1/10
//   ($0.10/$0.20 vs $1/$3 per M)。ダーク描写の拒否もA/B範囲では無し。
//   切替を設定パネル(fix248でproxy時非表示)に頼らず、トップバーから
//   1クリックでできるようにする。
// 仕様:
//   ・S.cfg.orModel を書き換えて S.save()(=スロット毎に保存・次の生成から有効)
//   ・既定リスト外のモデルIDが設定されている場合はそのIDも選択肢に温存
//   ・provider が openrouter 以外でも表示はする(書込は無害)。proxy ON時も
//     リクエストbodyのmodelはcfg.orModel由来なのでそのまま効く(A/Bで実証済)
//   ・fix243の折りたたみに自動で従う(topbar子要素は自動foldable化)
//   ・OFF: localStorage v292ModelSelOff='1'
// ロールバック: このscriptタグを外す or OFFフラグ。配線はcfg.orModelのみ。
// =====================================================================
(function(){
  'use strict';
  var TAG = '[v292Dfix256:model-select]';
  try { if (localStorage.getItem('v292ModelSelOff') === '1') return; } catch(e){}

  function getS(){ try{ return window.S || (0,eval)('S'); }catch(e){ return null; } }

  var MODELS = [
    { id: 'deepseek/deepseek-v4-flash',    label: 'DS V4 Flash' },
    { id: 'deepseek/deepseek-v4-pro',      label: 'DS V4 Pro' }
  ]; /* v292Dfix279: おしん指示(2026-06-13)「モデルはDSだけ・Hermesはもう使わない」→Hermes 2種を除去。cfgにリスト外IDが残っている場合は下のopts.unshiftが従来通り温存表示する */

  function currentModel(){
    try{ var S=getS(); return (S && S.cfg && S.cfg.orModel) || ''; }catch(e){ return ''; }
  }
  function setModel(id){
    try{ var S=getS(); if(S && S.cfg){ S.cfg.orModel = id; if (typeof S.save === 'function') S.save(); try{ console.log(TAG, 'orModel ->', id); }catch(_){} } }catch(e){}
  }

  function inject(){
    try{
      var tb = document.getElementById('topbar');
      var S = getS();
      if(!tb || !S){ setTimeout(inject, 600); return; }
      if(document.getElementById('v292-model-sel')) return;
      var cur = currentModel();
      var opts = MODELS.slice();
      if (cur && !opts.some(function(m){ return m.id === cur; })) {
        opts.unshift({ id: cur, label: cur.split('/').pop().slice(0, 18) }); /* リスト外IDも温存 */
      }
      var span = document.createElement('span');
      span.style.cssText = 'margin-left:8px;font-size:12px;display:inline-flex;align-items:center;gap:4px;';
      span.innerHTML = '🧠モデル<select id="v292-model-sel" style="font-size:12px;max-width:130px;"></select>';
      var sel = span.querySelector('#v292-model-sel');
      opts.forEach(function(m){
        var o = document.createElement('option');
        o.value = m.id; o.textContent = m.label;
        sel.appendChild(o);
      });
      sel.value = cur || MODELS[0].id;
      sel.addEventListener('change', function(){ setModel(sel.value); });
      tb.appendChild(span);
      try{ console.log(TAG, 'injected (current:', cur || '(未設定)', ')'); }catch(_){}
    }catch(e){ setTimeout(inject, 600); }
  }
  inject();

  window.__v292ModelSel = { setModel: setModel, currentModel: currentModel, MODELS: MODELS };
  try{ console.log(TAG, 'loaded'); }catch(_){}
})();
