// =====================================================================
// Chronicle TRPG - v292Dfix467: 読ませ方の5ルール（GPT-5.6監査・2026-07-13）
// ---------------------------------------------------------------------
// 背景: 「展開の描写が読みにくい」の診断。
//   ①UI側の真因(台詞の二重表示)は fix466 で根治した。
//   ②残りは**文章そのもの**の問題。GPT-5.6が挙げた具体ルールを sys に入れる。
//   ③実データ(おしんT6)で確認した「同じ描写文の再掲」も禁止に加えた
//      （例:「鏡の表面が、澪の唇の形に合わせて、内側から歪んだまま戻らない。」が1ターンに2回）。
//
// 注入: keeper(__f379reg・prio2)。1ブロック=目的1つ・命令5個・200字前後（棚卸しの原則どおり）。
// 既定ON。OFF: localStorage v292Dfix467Off='1'
// 検証口: window.__v292Dfix467 = { text }
// =====================================================================
(function(){
  'use strict';
  var G = window;
  if (G.__f467done) return; G.__f467done = 1;
  var TAG = '[v292Dfix467:readability-rules]';

  var MARKER = '【読ませ方】';
  var TEXT = '\n' + MARKER + '\n'
    + '・重要な結果（同行・拒絶・正体の判明・入手・負傷）はセリフだけに置かず、地の文にも1文で残す。\n'
    + '・「その言葉に」「そう言って」「今の一言で」でセリフを受けない。誰の何に反応したかを書く。\n'
    + '・セリフの内容を地の文で言い換えない。セリフが生んだ反応・行動・空気の変化だけを書く。\n'
    + '・地の文は1段落1〜3文。情景・行動・心理・結果を1段落に詰め込まない。\n'
    + '・同じ描写を繰り返さない。同一ターン内で同じ言い回しの文を再掲しない。\n';

  function textFn(){ return TEXT; }

  (function register(){
    try {
      G.__f379reg = G.__f379reg || [];
      var reg = G.__f379reg;
      for (var i = 0; i < reg.length; i++){ if (reg[i] && reg[i].marker === MARKER) return; }
      reg.push({ off: 'v292Dfix467Off', marker: MARKER, prio: 2, text: textFn });
      try { console.log(TAG, 'keeper registered (prio2, ' + TEXT.length + ' chars)'); } catch(e){}
    } catch(e){ try { console.warn(TAG, 'reg err:', e && e.message); } catch(_){} }
  })();

  G.__v292Dfix467 = { __armed: true, MARKER: MARKER, text: textFn };
})();
