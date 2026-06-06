/* ============================================================================
 * v292Dfix221: recentDialogues(モデル文脈の直近会話)を _convSays に一本化。
 *
 * 真因(実データ確証): v292Dfix58 の buildRecentDialoguesList は各ターンの
 *   t.dialogues を優先し、無ければ extract(t.narrative)=旧・本文再抽出器に
 *   フォールバックする。ターンは fix217/218 で直した正しい _convSays しか
 *   持たず t.dialogues が無いため、毎回 壊れた抽出器が走り、speaker に地の文
 *   断片("そしてうっすらと白い息を漏らしながら"等)が入った直近会話がモデルへ
 *   渡っていた。結果、過去のセリフ(「お前も楽しめ」)が「直近の発話」として供給
 *   され、モデルが新キャラ(老婆等)に再利用=「全員が同じセリフ」の発生源。
 *
 * 根治: 表示(会話ログ)は既に _convSays に一本化済み。文脈側だけ旧抽出が残って
 *   いた積み残しを解消する。各ターンに dialogues を _convSays から派生して
 *   持たせ(speaker=who / text=say)、fix58 の第1分岐(Array.isArray(t.dialogues))
 *   が権威データを使い、壊れた extract() に二度と落ちないようにする。
 *   dialogues は非列挙プロパティで持たせ localStorage を肥大させない。
 *
 * 設計: Planner.build を最外でラップし、build のたびに全ターンの dialogues を
 *   _convSays から同期してから内側(fix58等)を呼ぶ。冪等。可逆(下の OFF フラグ)。
 *   ロールバック: localStorage v292RecentDlgAuthOff='1'。
 * ========================================================================== */
(function(){
  var TAG = '[v292Dfix221]';
  try { if (localStorage.getItem('v292RecentDlgAuthOff') === '1') return; } catch(e){}

  function syncTurnDialogues(state){
    try {
      var turns = (state && state.turns) || [];
      for (var i = 0; i < turns.length; i++){
        var t = turns[i];
        if (!t) continue;
        var cs = Array.isArray(t._convSays) ? t._convSays : null;
        if (!cs){ continue; } /* _convSays が無い古いターンは触らない(fix58の従来挙動のまま) */
        var arr = [];
        for (var j = 0; j < cs.length; j++){
          var c = cs[j];
          if (c && c.who && c.say){ arr.push({ speaker: String(c.who), text: String(c.say) }); }
        }
        /* 非列挙で持たせる=JSON.stringify(save)に乗らない=保存データを肥大させない。
           毎回作り直して _convSays の最新と一致させる(後からの話者修正にも追従)。 */
        try {
          Object.defineProperty(t, 'dialogues', { value: arr, enumerable: false, configurable: true, writable: true });
        } catch(e){ t.dialogues = arr; }
      }
    } catch(e){ try { console.warn(TAG, 'sync err', e && e.message); } catch(_){} }
  }

  function getS(){ try { return window.S || (typeof S !== 'undefined' ? S : null); } catch(e){ return null; } }

  function wrap(){
    var P = window.Planner || (typeof Planner !== 'undefined' ? Planner : null);
    if (!P || typeof P.build !== 'function') return false;
    if (P.__v292Dfix221) return true;
    var orig = P.build.bind(P);
    P.build = function(){
      try { syncTurnDialogues(getS()); } catch(e){}
      return orig.apply(this, arguments);
    };
    P.__v292Dfix221 = 1;
    try { console.log(TAG, 'Planner.build wrapped (recentDialogues <- _convSays)'); } catch(e){}
    return true;
  }

  if (!wrap()){
    var tries = 0;
    var iv = setInterval(function(){
      tries++;
      if (wrap() || tries > 40) clearInterval(iv);
    }, 250);
  }
  /* fix192 等が後から再ラップして最外を奪っても、build 経路のどこかで我々の
     ラップが一度通れば dialogues は同期される。安全のため定期で再装着確認。 */
  try { setInterval(wrap, 1500); } catch(e){}

  window.__v292Dfix221 = { syncTurnDialogues: syncTurnDialogues };
})();
