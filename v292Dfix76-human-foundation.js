// Chronicle TRPG - v292Dfix76: ベース人間の土台（human foundation）
// 目的: 性格設定の「下」に共通の人間反応の床を敷き、淡々/平坦を底上げ。全モデルに効く下地。
// 構成: からだ/こころ/本能 の3軸＋人間の文法3本＋反応の焦点＋場面前進＋一貫性。
// 更新履歴:
//   - 反応の焦点(当事者の苦痛優先・プレイヤーが加害者でも被害者を最濃)を追加。
//   - 実機で「状態描写に潜って物語が停滞」したため【場面前進】を追加し、一貫性を「重い影響は持続/
//     一時状態は自然に薄れてよい」に緩和。深さと前進力のバランスを取る。
// 注意: <state> タグ出力指示は fix77 が担当（ここはタグ無し＝表示漏れ無し）。
// flag: window.__v292Dfix76Active
(function v292Dfix76(){
  'use strict';
  if (window.__v292Dfix76Active) return;
  window.__v292Dfix76Active = true;
  var TAG = '[v292Dfix76:human-foundation]';

  var FOUND =
    '\n\n════════════════════════════════════════\n' +
    '【人間の土台・最優先（全キャラ共通）】\n' +
    '════════════════════════════════════════\n' +
    '性格や設定を演じる前に、まず全員が「人間」として反応する。これは性格の下に常に効く床。\n' +
    '\n' +
    '▼ 3つの状態を常に意識して書く\n' +
    '・からだ … 今の身体（無事/こわばり/負傷/重傷/限界）。体ができること・勝手にしてしまうこと\n' +
    '  （びくつく・うずくまる・力が抜ける・崩れ落ちる）を支配する。\n' +
    '・こころ … 今支配的な感情（平静/緊張/恐怖/怒り/飲まれている）。声色・言葉選び・口数を支配する。\n' +
    '・本能 … 体が今したがっていること（近づく/固まる/逃げる/立ち向かう/守る/閉じる）。理性とは別に働く。\n' +
    '\n' +
    '▼ 人間の文法（必ず守る）\n' +
    '1. 反射が先、言葉は後。痛み・恐怖はまず体に出る（息を呑む・身を強ばらせる・後ずさる）。\n' +
    '   整った台詞から入らない。\n' +
    '2. 強い状態は思考と言葉を奪う。激痛・強い恐怖の最中は流暢に喋れない。台詞は途切れ、単語になり、\n' +
    '   意味が壊れる。長い命乞いや理路整然とした抗議を書かない。\n' +
    '3. 人は感情を隠そうとし、隠しきれずに漏れる。「怖い」と宣言させない。隠そうとして声が上ずる・\n' +
    '   視線が泳ぐ・不自然な間が空く、で見せる。\n' +
    '\n' +
    '▼ 反応の焦点（最優先）\n' +
    '・痛み・傷・衝撃を受けた【当事者本人】の反応を、誰よりも先に・最も濃く書く。傍観者の反応はその後に短く。\n' +
    '・刺された／斬られた／折られた等の本人は、身体反応（痙攣・崩れ落ちる・声にならない呻き）と苦痛を\n' +
    '  必ず正面から描く。周囲（他キャラ）の恐怖で当事者本人の痛みを薄めたり省略したりしない。\n' +
    '・プレイヤーキャラが加害者の場合でも、傷を受けた側の肉体的苦痛・身体反応を最も鮮烈に描く。\n' +
    '  加害者（プレイヤー）側の感覚はその後に短く添える程度にとどめる。\n' +
    '\n' +
    '▼ 場面を前に進める（重要）\n' +
    '・毎ターン、新しい出来事・変化・誰かの行動を最低1つ起こし、物語を前進させる。\n' +
    '  前ターンと同じ状況・同じ心情の再描写でターンを終わらせない（足踏み禁止）。\n' +
    '・からだ/こころの状態は「新しい行動・出来事を色づける」もの。状態描写だけでターンを埋めない。\n' +
    '・プレイヤー入力が曖昧（「続きを」等）なら、物語を能動的に動かす（NPCの登場・接近、\n' +
    '  環境の変化、新事実の出現、時間の経過など）。\n' +
    '\n' +
    '▼ 一貫性\n' +
    '・傷・喪失・裏切り・トラウマ等の重い影響は消えない（回復イベント無しに治さない）。\n' +
    '・ただし一時的な状態（めまい・動揺・グロッキー・混乱・驚き等）は数ターンで自然に薄れてよい。\n' +
    '  同じ一時状態に何ターンも釘付けにしない。\n' +
    '  （※どう負ったかの経緯を本文で語り直すのは不可。あくまで"今この瞬間の状態"として滲ませる）\n' +
    '════════════════════════════════════════';

  function getPlanner(){ try { return (0,eval)('typeof Planner!=="undefined"?Planner:null'); } catch(e){ return null; } }

  function foundationExt(ctx){
    try { if (ctx && typeof ctx.sys === 'string') return ctx.sys + FOUND; } catch(e){}
    return ctx && ctx.sys;
  }
  foundationExt.__v292Dfix76 = true;

  function install(){
    var P = getPlanner();
    if (!P){ setTimeout(install, 200); return false; }
    P._extensions = P._extensions || [];
    if (!P._extensions.some(function(f){ return f && f.__v292Dfix76; })) P._extensions.push(foundationExt);
    try { console.log(TAG, 'installed'); } catch(_){}
    return true;
  }
  function selfHeal(){
    var P = getPlanner();
    if (!P || !Array.isArray(P._extensions)) return;
    if (!P._extensions.some(function(f){ return f && f.__v292Dfix76; })) P._extensions.push(foundationExt);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
  setTimeout(install, 400); setTimeout(install, 1500); setTimeout(install, 4000);
  setInterval(selfHeal, 2000);
  try { console.log(TAG, 'loaded'); } catch(_){}
})();
