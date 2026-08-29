// =====================================================================
// Chronicle TRPG - v292Dfix355: 調整ノブの整理(おしん承認済み・2026-07-02)
// 棚卸し結果(Planner.build直接呼び出しでsys差分を実測・送信なし):
//   効く: 進行/セリフ/長さ/トーン/画風/モデル/怪異(アイコン経路)
//   死んでる: 反応(reactionLevel) — 書き込み先はあるが現用の新βエンジン
//   (fix192)が読まない(旧エンジン時代の遺物)。切替えてもsysが1字も変わらない実測。
// 整理内容:
//   ① 反応セレクタ: 撤去(非表示)。セリフノブと役割重複。
//   ② アイコンセレクタ(標準/AI): AI固定。S.cfg.aiAvatar=trueを起動時に強制
//      (直接代入=重い再生成ハンドラを踏まない)+セレクタ非表示。
//   ③ エンジンセレクタ(従来/新β): 新β固定+非表示。従来は品質ガード構成が古く
//      切替事故防止。値が従来だったらchange込みで新βへ切替えてから隠す。
//   非表示はラベルごと(親span)。topbar再構築に備えポーリングで再適用。
// OFF: localStorage v292Dfix355Off='1' (3つとも復活)
// ★U3a(GPT RULING「R118F U3/U4 READ-ONLY TRACE — GPT RULING」2026-08-28):
//   v292Dfix355Det='1'（既定OFF・opt-in）のときだけ 2秒interval を廃止し event-driven 化。
//   Det ON: boot一回 apply + MutationObserver(exactly 1・childList/subtree・150msデバウンス)で
//           topbar再構築へ追従。cfg強制は従来どおり aiAvatar!==true の時のみ直接代入
//           （features.js の change handler は発火させない）。engine固定は既存 fix192 官製
//           setEngine 経路（change dispatch）を維持。
//   Det OFF: legacy path そのもの（interval 2000ms・新observer/state登録なし＝DEFAULT_OFF_STRUCTURAL_NOOP）。
//   検証口(Det ONのみ): window.__v292Dfix355Det.stats()
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix355) return; window.__v292Dfix355 = true;
  var TAG = '[v292Dfix355:selCleanup]';
  function off(){ try{ return localStorage.getItem('v292Dfix355Off')==='1'; }catch(e){ return false; } }
  function det(){ try{ return localStorage.getItem('v292Dfix355Det')==='1'; }catch(e){ return false; } }   // ★U3a
  function getS(){ try{ if (window.S) return window.S; return (0,eval)('S'); }catch(e){ return null; } }

  function hideWithLabel(sel){
    var wrap = sel.closest('span') || sel.closest('label') || sel;
    if (wrap && wrap.style.display !== 'none') wrap.style.display = 'none';
  }

  function apply(){
    if (off()) return;
    try {
      // ① 反応: 非表示のみ(死んでいる・cfgは不触)
      var rs = document.getElementById('v292-react-sel');
      if (rs) hideWithLabel(rs);

      // ② アイコン: AI固定+非表示
      var av = document.getElementById('v292-avatar-sel');
      if (av) {
        if (av.value !== '1') av.value = '1'; // 表示上もAIに(ハンドラは踏まない)
        hideWithLabel(av);
      }
      var S = getS();
      if (S && S.cfg && S.cfg.aiAvatar !== true) {
        S.cfg.aiAvatar = true;
        if (typeof S.save === 'function') (typeof S.saveC==='function'?S.saveC('fix355.apply'):S.save());
        try{ if (det() && window.__v292Dfix355Det) window.__v292Dfix355Det.__s.cfgForces++; }catch(_){}   // ★U3a telemetry
        try{ console.log(TAG, 'aiAvatar forced true'); }catch(_){}
      }

      // ③ エンジン: 新β固定+非表示(従来だったらchange込みで切替)
      var es = document.getElementById('v292-engine-sel');
      if (es) {
        if (es.value !== '1' && !es.__f355switched) {
          es.__f355switched = true;
          es.value = '1';
          try { es.dispatchEvent(new Event('change', {bubbles:true})); } catch(_){}
          try{ console.log(TAG, 'engine switched to 新β'); }catch(_){}
        }
        hideWithLabel(es);
      }
    } catch(e){ try{ console.warn(TAG, e); }catch(_){} }
  }

  if (det()){
    /* ★U3a: event-driven path（legacy 2秒intervalは作らない） */
    var __s = { bootApplies: 0, domReapplies: 0, observerCount: 0, cfgForces: 0 };
    window.__v292Dfix355Det = { __s: __s, stats: function(){ return { bootApplies: __s.bootApplies, domReapplies: __s.domReapplies, observerCount: __s.observerCount, cfgForces: __s.cfgForces }; } };
    apply(); __s.bootApplies = 1;
    var moT = null;
    function schedule355(){
      if (moT) return;
      moT = setTimeout(function(){ moT = null; __s.domReapplies++; apply(); }, 150);
    }
    try {
      var mo355 = new MutationObserver(function(muts){
        for (var i = 0; i < muts.length; i++){
          var mm = muts[i];
          if (mm.type === 'childList' && mm.addedNodes && mm.addedNodes.length){ schedule355(); return; }
        }
      });
      mo355.observe(document.body || document.documentElement, { childList: true, subtree: true });
      __s.observerCount = 1;
    } catch(e){ try{ console.warn(TAG, 'U3a observer failed', e); }catch(_){} }
    try{ console.log(TAG, 'loaded (U3a det)', off()?'OFF':'ON'); }catch(_){}
  } else {
    apply();
    setInterval(apply, 2000); // topbar再構築/折りたたみ再描画に追従
    try{ console.log(TAG, 'loaded', off()?'OFF':'ON'); }catch(_){}
  }
})();
