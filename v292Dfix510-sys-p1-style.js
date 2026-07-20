// =====================================================================
// Chronicle TRPG - v292Dfix510: プロンプト作風調整P1（GPT監査ロードマップ・純粋transform）
// ---------------------------------------------------------------------
// 背景(2026-07-20): GPT品質監査P1のうち、fix440が未実装の"作風が動く"分だけを最終sysへ適用。
//   （⑤層→構造化、③反応/内容の反復禁止 は既にfix440が実装済＝ここでは触らない）
//   fix509と同じ「fix441の最終sysパイプライン(439→440→509→510)へ純粋transformを足す」方式。
//   fetch非ラップ・fix504予算系不触・fix459 MARKER不変・fail-open。既定ON・OFF=v292Dfix510Off。
//
// 適用（最終sysに対し全一致でのみ・冪等・各Tは独立にfail-open）:
//   T1 文数を「必須」から「目安」へ（前進・主役反応・五感が揃えば無理に埋めない）。
//   T2 世界説明を不自然な長台詞で代弁させない（★人数制限は自然さを損なうため撤去・2026-07-20 おしんFB）。
//   T3 中心になる変化は一つ＋迷ったら新設定を発明せず確定事実を優先。
//   いずれも実機の最終sys(fix440適用後)で anchorユニーク・適用確認済(2026-07-20)。
// 検証口: window.__v292Dfix510 = { rewrite, wouldChange, isOff, last, status }
// ※document非依存(Nodeテスト可)。作風を変えるので、OFFで即戻せる/同一場面のA/B比較前提。
// =====================================================================
(function(){
  'use strict';
  var W = (typeof window !== 'undefined') ? window : this;
  if (W.__v292Dfix510 && W.__v292Dfix510.__armed) return;
  var TAG = '[v292Dfix510:sys-p1-style]';

  var T = [
    { a:"セリフで、10〜16文。情景",
      b:"セリフで、10〜16文を目安に（前進・主役の反応・五感が揃えば無理に文数を埋めない）。情景" },
    { a:"心理と物語の前進はセリフに乗せる）。主人公しかいない",
      b:"心理と物語の前進はセリフに乗せる）。世界設定や状況説明を不自然な長台詞で代弁させない。主人公しかいない" },
    { a:"関係の変化など）。同じ場面の描き直しで終えない。",
      b:"関係の変化など）。同じ場面の描き直しで終えない。中心になる変化は一つに絞り、他はその変化への反応として描く。迷ったら新しい設定を発明せず、直前までに確定した事実を優先する。" }
  ];
  // 変換後も生存必須（1つでも欠けたら fail-open で元を返す）
  var KEEP = ['【出力の掟】','<say','<state','情景→身体感覚→感情→行動','その場にいるキャラは生きている'];

  function off(){ try { return localStorage.getItem('v292Dfix510Off') === '1'; } catch(e){ return false; } }
  function active(){ return !off(); }
  var last = null;

  function rewrite(sys){
    var s = String(sys == null ? '' : sys);
    if (!s || off()) return sys;
    var out = s, applied = 0;
    for (var i=0;i<T.length;i++){
      var a=T[i].a, b=T[i].b;
      if (out.indexOf(b) >= 0) continue;                 // 既に適用済（冪等）
      if (out.indexOf(a) < 0) continue;                  // anchor無し=このTはスキップ(fail-open)
      out = out.replace(a, b); applied++;
    }
    if (applied === 0) return sys;
    if (out.length <= s.length) return sys;              // P1は加筆＝伸びるはず
    if (out.length - s.length > 400) return sys;         // 伸びすぎ=異常
    for (var k=0;k<KEEP.length;k++){ if (out.indexOf(KEEP[k]) < 0) return sys; } // fail-open
    last = { before: s.length, after: out.length, added: out.length - s.length, applied: applied };
    try { console.log(TAG, 'P1 applied ' + applied + '/3 (+' + last.added + '字)'); } catch(e){}
    return out;
  }
  function wouldChange(sys){ return rewrite(sys) !== sys; }

  W.__v292Dfix510 = {
    __armed: true, rewrite: rewrite, wouldChange: wouldChange,
    active: active, isOff: off, last: function(){ return last; },
    status: function(){ return { armed:true, on:active(), last:last }; }
  };
  try { console.log(TAG, 'armed (P1 style transform for fix441 pipeline); on:', active() ? 'on(default)' : 'off'); } catch(e){}
})();
