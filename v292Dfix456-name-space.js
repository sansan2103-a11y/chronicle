// =====================================================================
// Chronicle TRPG - v292Dfix456: 話者名の「空白ゆれ」と「役割名呼び」を止める
// ---------------------------------------------------------------------
// ★2026-07-13 本番の長期プレイテスト（新スロット・登録NPC3名＋未登録NPC）で実測した事実:
//   ① 登録名「桐生 悠真」「氷川 杏子」に対し、モデルは <say who="桐生悠真"> と
//      **空白を落として** 返す。実測(_convSays): {桐生悠真:5, 桐生 悠真:6, 氷川杏子:10}
//      → 同一人物が2人に分裂（アイコンが2枚・話者ラベルが2表記・文脈にも両表記が混入）。
//   ② 登録NPC(榊 千尋)を <say who="女"> <say who="民俗学者"> と **役割名/属性名** で呼ぶ。
//      文字列が重ならないので名寄せ不能 → 未登録の別人物として扱われ、無関係なアイコンが付く。
//
// 本fixの3点セット（★データは書き換えない＝GPT-5.6監査の指摘を採用）:
//   (A) v292Dfix197 canonName  … 空白を無視した完全一致で登録名へ名寄せ（アイコンのキー）
//   (B) v292Dfix445 castMatch  … 同上（会話ログの話者ラベル表示）
//       ※ (A)(B) は各ファイル内に直接実装。**読取・描画時だけ**の正規化でセーブは不触。
//   (C) 本ファイル … 発生源を叩く。keeper(fix379)で sys に独立した短いブロックを1つ足し、
//       「who に使ってよい名前」を登録名で列挙し、役割名・空白抜き表記を禁じる。
//       ★教訓（fix452/454）: 長いブロックへの追記は埋もれる。独立した短いブロックにする。
//
// なぜ _convSays を書き換えないか（GPT-5.6監査）:
//   ・OFFにしても書き換え済みデータは戻らない（コードのOFFとデータのロールバックは別物）
//   ・undoスナップショット内に旧表記が残り、undo後にまた混在する
//   ・旧データを開いた別端末/別タブが、移行済みデータの上へ書き戻す恐れ
//   → 保存データは触らず、読取・描画・プロンプトの3面だけで揃える。
//
// 真の根治（将来・要おしん承認）: 発言に sayId / speakerId を持たせ、表示名を属性へ降格する
//   （本文文字列と表示名を同一性キーにしている限り再発しうる）。schema変更＝破壊的変更。
//
// 冪等: window.__v292Dfix456
// OFF : localStorage.v292Dfix456Off = '1'（(A)(B)(C) すべて無効化）
// 検証口: window.__v292Dfix456.block()  … 実際に注入される文字列
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix456 && window.__v292Dfix456.__armed) return;
  var TAG = '[v292Dfix456:name-lock]';
  var MARKER = '【whoに使う名前】';

  function off(){ try { return localStorage.getItem('v292Dfix456Off') === '1'; } catch(e){ return false; } }
  function getS(){ try { return window.S || (0,eval)('typeof S!=="undefined"?S:null'); } catch(e){ return null; } }

  function castNames(){
    var out = [], S = getS();
    try {
      if (S && S.cast){
        if (S.cast.hero && S.cast.hero.name) out.push(String(S.cast.hero.name).trim());
        var ns = S.cast.npcs || [];
        for (var i = 0; i < ns.length; i++){ if (ns[i] && ns[i].name) out.push(String(ns[i].name).trim()); }
      }
    } catch(e){}
    var seen = {}, res = [];
    for (var j = 0; j < out.length; j++){ if (out[j] && !seen[out[j]]){ seen[out[j]] = 1; res.push(out[j]); } }
    return res;
  }

  function block(){
    var names = castNames();
    if (!names.length) return '';
    return MARKER + '<say>/<react>/<state> の who には、次の名前を**登録どおりの表記のまま**（空白も含めて）書く：'
         + names.join('／')
         + '。空白を抜いた表記（例:「' + names[0].replace(/[\s　]/g, '') + '」）は使わない。'
         + 'また、この一覧の人物を「女」「男」「老人」「民俗学者」などの役割名・属性名で who に書かない（本文の地の文でそう呼ぶのは自由）。'
         + '一覧に無い、名前を知らない存在だけ、本文で使っている呼び名を who にする。';
  }

  function install(){
    try {
      if (!window.__f379reg || typeof window.__f379reg.push !== 'function'){ setTimeout(install, 800); return; }
      window.__f379reg.push({
        off: 'v292Dfix456Off',
        marker: MARKER,
        prio: 1,   // 話者の同一性は物語の土台。予算外(prio1)で必ず載せる
        text: block   // keeperは関数を許容（fix379 reg: text: function(){...}）
      });
      try { console.log(TAG, 'keeper block registered'); } catch(e){}
    } catch(e){}
  }
  install();

  window.__v292Dfix456 = { __armed: true, block: block, castNames: castNames, isOff: off };
  try { console.log(TAG, 'armed'); } catch(e){}
})();
