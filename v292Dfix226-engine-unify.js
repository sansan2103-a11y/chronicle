/* ============================================================================
 * v292Dfix226: エンジン一本化(第一段) — 旧エンジン用sys注入パッチの退役
 *
 * 背景(コード全棚卸し2026-06-06の最重要発見):
 *   fix192(新エンジン)は最外ラップでsysを丸ごと差し替えるため、engineMode=1の間、
 *   sys側のPlanner._extensions群は毎ターン「計算→破棄」されている(無駄走り)。
 *   おしん決定(2026-06-06)「従来エンジンはもう使わない」を受け、これらを退役する。
 *
 * 方式: 削除ではなく**マーカー保持の無害スタブへの置換**。
 *   ・各ファイルのselfHeal(マーカー無→再push)と戦わない: スタブが元のマーカー
 *     (__v292Dfix77等)を引き継ぐので再装着されない
 *   ・parse側(_parseExtensions)は不可侵(状態捕捉・raw救済・dedup等は両エンジン共通の現役)
 *   ・対象は実測でシグネチャ確認済みの7本のみ(ctx→ctx.sys返し):
 *     sayExt(F74) / antiRecapExt(F71) / foundationExt(F76) / stateExt(F77) /
 *     literaryExtension(F69) / fix79Ext(F79) / fix82Ext(F82)
 *   ・genderPronounExt(F54)/reactionSpectrumExt(F85)はシグネチャ非標準のため
 *     触らない(出力はfix192が破棄するので機能差ゼロ・後日の削除フェーズで対応)
 *
 * 検証: スタブ後も新エンジンsysは不変(元々破棄されていたため)。状態注入は
 *   fix192のstateBlock()が担当(fix77ストアから直読み)なので影響なし。
 * ロールバック: localStorage v292EngineUnifyOff='1' + リロード。
 * 完全削除は2週間観察後(原則: 無効化→観察→削除)。
 * ========================================================================== */
(function(){
  var TAG = '[v292Dfix226]';
  try { if (localStorage.getItem('v292EngineUnifyOff') === '1') return; } catch(e){}
  var RETIRE = ['sayExt','antiRecapExt','foundationExt','stateExt','literaryExtension','fix79Ext','fix82Ext'];
  var retiredCount = 0;
  function sweep(){
    try {
      var P = window.Planner || (typeof Planner !== 'undefined' ? Planner : null);
      if (!P || !Array.isArray(P._extensions)) return;
      var n = 0;
      P._extensions = P._extensions.map(function(f){
        if (!f || f.__v292Dfix226Stub) return f;
        if (RETIRE.indexOf(f.name) < 0) return f;
        var stub = function(ctx){ try { return ctx && ctx.sys; } catch(e){ return ctx && ctx.sys; } };
        try { Object.keys(f).forEach(function(k){ if (k.indexOf('__') === 0) stub[k] = f[k]; }); } catch(e){}
        try { Object.defineProperty(stub, 'name', { value: f.name }); } catch(e){}
        stub.__v292Dfix226Stub = 1;
        n++;
        return stub;
      });
      if (n > 0){ retiredCount += n; try { console.log(TAG, 'stubbed', n, 'old-engine sys extensions (total', retiredCount + ')'); } catch(e){} }
    } catch(e){}
  }
  sweep();
  try { setInterval(sweep, 2000); } catch(e){} /* 後着ロード/再生成された実体も継続スタブ化 */
  window.__v292Dfix226 = { sweep: sweep, RETIRE: RETIRE };
})();
