// =====================================================================
// Chronicle TRPG - v292Dfix884: BYOK_UI_DEV_ONLY_V1
//   (lane 15 / GPT 裁定 #L15entry F1 F3 / sp10B)
// ---------------------------------------------------------------------
// ★★ACTIVATION_BLOCKED_PUBLIC_AI_ACCESS
//   offline 実装・freeze は GO。production での**既定 hidden 反転は
//   `PUBLIC_AI_ACCESS_READY`（API キー不要の経路が実際に使える状態）待ち**。
//   現行ユーザーの AI 利用の逃げ道を消さないこと（裁定 F1）。
//
// ■ これは何か
//   BYOK（Bring Your Own Key）の欄を **通常導線から外し、【開発者向け】へ移す**。
//   欄は 1 つも消さない・id も変えない。**居場所だけ**が変わる。
//     ・プロバイダー #cfgProvider
//     ・API キー ×4  #cfgKey / #cfgOrKey / #cfgNaiKey / #cfgPollKey
//     ・モデル ×2    #cfgModel / #cfgOrModel        （F3: RAW_MODEL_SELECTION = DEV_ADMIN_ONLY）
//     ・シンプルモード #cfgSimpleMode / デバッグ表示 #cfgDbg
//     ・プロキシ URL #cfgProxyUrl247 / アクセスコード #cfgProxyPass247（fix247/fix247b が後から注入）
//
// ■ 壊さない約束
//   NO_ID_CHANGE   … id を 1 つも変えない。UI.saveSettings() の出力は不変。
//   FIX248_KEPT    … fix247 の on() に基づく既存の自動非表示（fix248）は **そのまま残す**。
//                    こちらは「行き先を変える」だけで、向こうの display には触らない。
//   NO_DELETE      … 欄・option・label を 1 つも削除しない（BYOK 利用者の逃げ道）。
//   DEV_GATE_ONLY  … v292DevMode / 既存 flag が立っていれば従来どおり見える。
//   LS_WRITE_0 / NO_NETWORK
//
// 依存: v292Dfix880（【開発者向け】section #v880-dev を作る側）。無ければ何もしない。
// 検証口: window.__v292Dfix884 = { version, api }
// kill:  localStorage['v292Dfix884Off'] = '1' → sp10A と同じ配置へ戻る
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix884) return;
  var TAG = '[v292Dfix884:byok-dev-only]';
  var VERSION = 'v292Dfix884-20260919-sp10b-v1.0';

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix884Off') === '1'; }
  function el(id){ try { return document.getElementById(id); } catch(e){ return null; } }

  /* 移す欄。fix247/fix247b が後から注入するものも含めるので、毎回見に行く。 */
  var MOVE_IDS = [
    'cfgProvider', 'cfgKey', 'cfgModel', 'cfgOrKey', 'cfgOrModel', 'cfgNaiKey',
    'cfgPollKey', 'cfgSimpleMode', 'cfgDbg', 'cfgProxyUrl247', 'cfgProxyPass247'
  ];
  /* provider ごとの入れ物（中に上の id が入っている）。まとめて動かせるものは塊で動かす。 */
  var GROUP_IDS = ['provAnthropic', 'provOpenRouter', 'provNovelAI'];

  var stats = { applies: 0, moved: 0, groups: 0, pending: 0 };

  function host(){ return el('v880-dev'); }

  /* 欄の入れ物（.fld）を探す。無ければ要素そのもの。 */
  function fldOf(node){
    try { return (node.closest && node.closest('.fld')) || node.parentNode; } catch(e){ return node.parentNode; }
  }

  function moveOne(node, h){
    if (!node || !h) return false;
    var box = fldOf(node);
    if (!box || box === h || h.contains(box)) return false;
    if (box.id === 'settingsPanel' || box.classList && box.classList.contains('mpanel-body')) return false;
    h.appendChild(box);
    return true;
  }

  function apply(){
    if (off()) return;
    var h = host();
    if (!h){ stats.pending++; return; }          /* fix880 が無い / 未 boot なら何もしない */
    try {
      var i;
      for (i = 0; i < GROUP_IDS.length; i++){
        var g = el(GROUP_IDS[i]);
        if (g && g.parentNode !== h && !h.contains(g)){ h.appendChild(g); stats.groups++; }
      }
      for (i = 0; i < MOVE_IDS.length; i++){
        var n = el(MOVE_IDS[i]);
        if (!n) continue;
        if (h.contains(n)) continue;             /* もう中に居る（group ごと移動済みを含む） */
        if (moveOne(n, h)) stats.moved++;
      }
      stats.applies++;
    } catch(e){ try { console.warn(TAG, 'apply failed'); } catch(_){} }
  }

  function boot(){
    if (off()){ try { console.log(TAG, 'disabled (v292Dfix884Off)'); } catch(e){} return; }
    apply();
    /* fix247 / fix247b は setInterval で欄を注入するので、こちらも追いかける */
    try { setInterval(apply, 2000); } catch(e){}
    try {
      var p = el('settingsPanel');
      if (p) new MutationObserver(function(){ apply(); }).observe(p, { childList: true, subtree: true });
    } catch(e){}
    try { console.log(TAG, 'armed'); } catch(e){}
  }

  window.__v292Dfix884 = {
    version: VERSION,
    api: {
      apply: apply, isOff: off, MOVE_IDS: MOVE_IDS, GROUP_IDS: GROUP_IDS, host: host,
      state: function(){ var o = {}; for (var k in stats) o[k] = stats[k]; return o; }
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
