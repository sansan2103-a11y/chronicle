// Chronicle TRPG - v292Dfix76: ベース人間の土台（human foundation）
// 目的: キャラが状況に対して淡々/平坦になる根本を、性格設定の「下」に共通の人間反応の床を
//   敷くことで底上げする。今は性格設定だけで反応を組むため床が無く、「痛い、やめて」式の
//   ドライな返しになる。全モデル（Euryale/Hermes 等）に効く下地を system に注入する。
// 設計（おしんと合意）:
//   ・からだ/こころ/本能 の3軸を常に意識させる（=反応の拠り所）
//   ・人間の文法3本: (1)反射が先・言葉は後 (2)強い状態は思考と言葉を奪う (3)隠そうとして漏れる
//   ・一貫性: 過去の傷/恐怖/喪失の"現在への影響"は消えない（経緯の再ナレは fix71 が禁止済み、
//     ここは「今の状態に引きずられる」だけを言う＝fix71 と非矛盾）
// 注意: <state> タグの出力指示は fix77（解析+表示剥がし）と同時に入れる。ここでは床のみ＝タグ無し
//   なので表示漏れの危険なし。純粋に prose の質を上げる指示のみ。
// 実装: Planner._extensions に system 追記関数を push（fix69/71 と同形）。selfHeal 付き。
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
    '▼ 一貫性\n' +
    '・前ターンで負った傷・恐怖・喪失の「今の影響」は消えない。回復イベント無しに平常へ戻さない。\n' +
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
