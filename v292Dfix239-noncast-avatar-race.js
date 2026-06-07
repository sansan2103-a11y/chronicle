/* ============================================================================
 * v292Dfix239: 未登録キャラのアバター怪物化の根治(レース封じ)
 *
 * 真因(2026-06-08 静的解析で確定):
 *   1) fix103の固定枠: 未登録(non-cast)キャラの仮アバターURLは
 *      「dark eerie horror creature art of <名前>...」で組まれていた(少女も店主も怪物枠)。
 *      → fix66側で中立枠に修正済み(fix239a)。
 *   2) レース: fix123のgenAsync(LLMが文脈から人/怪異/物を判定して英語プロンプトを書く)は
 *      数秒かかる。一方fix197/199は、lookupAvatarがpending中に返すフォールバック仮URLを
 *      data-av-legacyから即捕捉して課金APIで生成→localStorage(v292av2_)に永続キャッシュ。
 *      fix199fで自動再生成は禁止のため「最初に運ばれたプロンプト」が恒久確定する。
 *      genAsyncはほぼ必ずレースに負ける=未登録の人間が固定枠の絵で確定していた。
 *
 * 対策(fix239b): __aiAvatar.urlFor をラップ。
 *   非castの名前で、結果がフォールバック素通し(r===fallbackUrl=キャッシュ未着)のときは
 *   ''を返して運搬を出さない(カードは'?'のまま=fix99以前からのコールドスタート表示)。
 *   genAsync完了→swapAvatar/fix102昇格で正しいLLMプロンプトの運搬URLが入り、
 *   fix197はそれを捕捉して生成する(「prompt未取得は生成しない」の既存待機を利用)。
 *   30秒経ってもキャッシュが来ない(genAsync失敗/キー無し)場合はフォールバックを通す
 *   (fix239aにより中立枠なので怪物化しない)。
 * OFF: localStorage v292NcAvRaceOff='1'
 * ========================================================================== */
(function(){
  var TAG = '[v292Dfix239]';
  try { if (localStorage.getItem('v292NcAvRaceOff') === '1') return; } catch(e){}
  if (window.__v292Dfix239) return; window.__v292Dfix239 = 1;

  var WAIT_MS = 30000;          // genAsyncに与える猶予
  var firstSeen = Object.create(null);   // name -> first suppressed timestamp

  function isCast(name){
    try { var f = window.__v292Dfix66; if (f && typeof f.isCast === 'function') return f.isCast(name); } catch(e){}
    return true;   // 判定不能ならcast扱い=抑制しない(安全側)
  }

  function arm(){
    var a = window.__aiAvatar;
    if (!a || typeof a.urlFor !== 'function'){ setTimeout(arm, 400); return; }
    if (a.__fix239) return; a.__fix239 = 1;
    var orig = a.urlFor;
    a.urlFor = function(name, fallbackUrl, desc){
      var r = orig.apply(this, arguments);
      try {
        if (r && r === fallbackUrl &&
            /image\.pollinations\.ai\/prompt\//.test(String(r)) &&
            name && !isCast(name)){
          // キャッシュ未着のフォールバック素通し: genAsyncの判定待ち
          var now = Date.now();
          if (!firstSeen[name]) firstSeen[name] = now;
          if (now - firstSeen[name] < WAIT_MS){
            return '';   // 運搬を出さない → fix197は生成しない(prompt未取得待機)
          }
          // 猶予切れ: 中立枠(fix239a)のフォールバックを通す
        }
        if (r && r !== fallbackUrl) delete firstSeen[name];   // キャッシュ到着
      } catch(e){}
      return r;
    };
    try { console.log(TAG, 'non-cast avatar race guard armed'); } catch(e){}
  }
  arm();
})();
