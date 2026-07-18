// =====================================================================
// Chronicle TRPG - v292Dfix488: 人外アイコンを「それらしく・多様に」する
//   (appearance-judgeのsysに型別・非人型・単一被写体・英語限定ルールを注入)
// ---------------------------------------------------------------------
// 背景(2026-07-18 実データ診断・GPT設計): 種族判定(fix378)が "non-human creature,"
//   をprefixで足しても、appearance-judgeの本文が【近くの人間/人型霊/コートの人物】に
//   流れ、Fluxが人型を描いてしまう(縫い目の怪物="a figure in a coat"、孤児院の怪異=
//   "a young girl")。上流の矛盾が原因でprefixだけでは直らない。
// GPT設計: 本文自体をタイプ別(creature/ghost/yokai/shadow/object)に非人型へ寄せる。
//   ①対象そのものだけ描く(近くの人間を描かない・単一被写体) ②creatureは非人型の
//   身体構造+3〜5個の具体特徴+material/texture+人間顔の否定 ③ghostは人型でも霊体性必須
//   (半透明・空洞の眼・浮遊・実体の希薄さ) ④yokaiは日本怪異の特徴 ⑤shadowは影そのもの
//   ⑥objectは物体 ⑦服は非人間では断片のみ ⑧英語限定。※過度なモンスター化は避ける
//   (人型霊は人型のまま=type粒度で両立)。
// 方式: fix378と同じ appearance-judge XHR の sys に1ブロック追記(応答書換なし)。
//   既存キャッシュは不変→人外は ↻アイコン再生成 で新ルールが効く。新規人外は自動で改善。
// opt-in: v292Dfix487OnV1='1'（おしん端末ON・段階導入）  OFF: v292Dfix488Off='1'
// 検証口: window.__v292Dfix488 = { ADD }
// =====================================================================
(function(){
  'use strict';
  if (window.__f488done) return; window.__f488done = 1;
  var TAG = '[v292Dfix488:nonhuman-detail]';
  function on(){ try { return localStorage.getItem('v292Dfix487OnV1') === '1'; } catch(e){ return false; } }
  function off(){ try { return localStorage.getItem('v292Dfix488Off') === '1'; } catch(e){ return false; } }

  var MARK = 'You write ONE concise English image prompt for an entity';
  var ADD = ' NONHUMAN DETAIL RULE: Describe ONLY this one entity as a single subject; do NOT describe any nearby human unless it is physically fused with the entity. If the entity is NOT an ordinary living human, first decide its kind, then depict ITS OWN visible form accordingly:'
    + ' (a) creature/monster: its non-human anatomy and 3 to 5 concrete non-human features (overall body plan, and specifics of skull, mouth, eyes, skin, limbs, spines, scales, horns or unnatural proportions) plus its material and texture; avoid an ordinary human face and ordinary clothing;'
    + ' (b) ghost or spirit that keeps a human shape: keep the human silhouette BUT it must clearly read as a spirit — semi-transparent, hollow or empty eyes, a faintly glowing or blurred outline, drifting or floating, faded and insubstantial;'
    + ' (c) yokai: strong Japanese-folklore traits such as an elongated neck, a single leg, paper-thin skin, a lantern-like glow, or an abnormal mouth;'
    + ' (d) shadow: a faceless shape whose warped outline blends into the darkness — the shadow itself, not a person;'
    + ' (e) cursed object or phenomenon: depict the object (e.g. a mask, mirror, straw doll, door) and do not turn it into a person.'
    + ' Any clothing on a non-human entity is only fragmentary remnants, never the main subject. Do NOT over-monsterize a human-shaped ghost — keep its human form and add the spectral traits instead. Write the description in ENGLISH only.';

  var os = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function(body){
    try {
      if (on() && !off() && typeof body === 'string' && body.indexOf(MARK) >= 0 && body.indexOf('NONHUMAN DETAIL RULE') < 0){
        var j = JSON.parse(body);
        var ms = j && j.messages;
        if (Array.isArray(ms)){
          for (var i = 0; i < ms.length; i++){
            var m = ms[i];
            if (m && typeof m.content === 'string' && m.content.indexOf(MARK) >= 0){
              m.content += ADD;
              // ★fix488b: DeepSeek V4 Flash等の推論型モデルは、推論でトークンを使い切ると
              //   contentが空になる(finish=length)→外見が静かに保存されない(no-new-imageの真犯人)。
              //   外見判定リクエストは max_tokens を700まで引き上げて推論+本文の両方を確保。
              try { if (!(+j.max_tokens >= 700)) j.max_tokens = 700; } catch(e){}
              body = JSON.stringify(j);
              try { console.log(TAG, 'nonhuman detail rule injected (max_tokens>=700)'); } catch(e){}
              break;
            }
          }
        }
      }
    } catch(e){}
    return os.call(this, body);
  };
  window.__v292Dfix488 = { ADD: ADD };
  try { console.log(TAG, 'loaded (on=' + (on() ? '1' : '0') + ', off=' + (off() ? '1' : '0') + ')'); } catch(e){}
})();
