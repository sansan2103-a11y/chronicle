// =====================================================================
// Chronicle TRPG - v292Dfix378: 人外判定をAIにやらせる（species judge）
// おしん承認 2026-07-04「リスト方式だと漏れが出ちゃうよね」→ 判定を語彙リストから
// 「外見文を書いたAI本人」へ移す根治策。
// ---------------------------------------------------------------------
// 真因: 怪物のAI外見文("massive hunched form, slick dark skin, lipless mouth")は
//   良い人外描写だが、fix338 isCreaturePrompt の判定語彙に1つも該当せず
//   →人間ポートレートprefixが付いてFluxが人間顔を描いた(fix358の「影」と同構図)。
// 方式: features.js内fix118系のAI外見判定XHR(未登録entity分岐)のsysに1行追記:
//   「人外なら外見文を 'non-human creature, ' で始めよ。人間なら入れるな」
//   - 'non-human creature' は fix338 isCreaturePrompt が既に持つ判定語
//     → fix338側は1行も変更不要。キャッシュ(chrAiAv4)にも残るので永続。
//   - 応答書き換えなし・追加API呼び出しなし・コスト増~20トークンのみ。
//   - 既存の語彙リストは安全網としてそのまま(モデルが指示を忘れても現状維持)。
// 対象: 未登録entity分岐のみ(登録キャラの外見判定は不触=人間前提の既存動作を維持)。
// OFF: localStorage v292Dfix378Off='1'（以後の判定から素のsysに戻る）
// ロールバック: OFF + 対象キャラを↻再生成(素の判定で書き直される)
// 検証: 判定XHRのbodyに指示が乗るか・新キャッシュが non-human creature, で始まるか
//   E2E済(2026-07-04): 怪物で実測→"non-human creature, a massive, bloated humanoid..."
// =====================================================================
(function(){
  'use strict';
  if (window.__f378done) return; window.__f378done = 1;
  var TAG = '[v292Dfix378:species-judge]';
  function off(){ try { return localStorage.getItem('v292Dfix378Off') === '1'; } catch(e){ return false; } }

  var MARK = 'You write ONE concise English image prompt for an entity';
  var ADD = ' SPECIES RULE: If the entity is NOT an ordinary living human person (e.g. creature, monster, beast, ghost, spirit, corpse, doll, machine, object, phenomenon), the description MUST begin with the exact words "non-human creature, ". If it IS an ordinary human person, do NOT include those words.';

  var os = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function(body){
    try {
      if (!off() && typeof body === 'string' && body.indexOf(MARK) >= 0 && body.indexOf('SPECIES RULE') < 0){
        var j = JSON.parse(body);
        var ms = j && j.messages;
        if (Array.isArray(ms)){
          for (var i = 0; i < ms.length; i++){
            var m = ms[i];
            if (m && typeof m.content === 'string' && m.content.indexOf(MARK) >= 0){
              m.content += ADD;
              body = JSON.stringify(j);
              try { console.log(TAG, 'species rule injected into appearance-judge request'); } catch(e){}
              break;
            }
          }
        }
      }
    } catch(e){}
    return os.call(this, body);
  };
  try { console.log(TAG, 'loaded (off=' + (off() ? '1' : '0') + ')'); } catch(e){}
})();
