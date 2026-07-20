// =====================================================================
// Chronicle TRPG - v292Dfix514: 話者タグ徹底ブロックを最終sys末尾に追記（純粋transform）
// ---------------------------------------------------------------------
// 背景(2026-07-20): 会話ログの「丸ごと別人」誤帰属の真因(fix462)は
//   「モデルが半分ほどのセリフを <say who> で囲まず裸の『』で書く→裸は主人公へ吸われる」。
//   GPT相談(2026-07-20「会話ログ帰属改善案」)の指示文の中身を、エンジンが依存する
//   <say who="名前"> 形式へ適用して強化する（形式そのものの切替=名前「」インラインは
//   parser/fix462/fix469の全面書換になるため今回は見送り、まず遵守と正しさを底上げ）。
//   ・全登録名(完全一致)・全ての声に付与・視点でなく実際の話者・鏡/憑依/声真似/独白の扱い。
//   ・fix509/510/512と同じ fix441の最終sysパイプラインへ純粋transformを1つ足す方式。
// fetch非ラップ・fix504予算/fix459 MARKER不触・fail-open・既定ON・OFF=v292Dfix514Off。
// 追記方式(anchor不要): MARKER未含なら末尾に1ブロック追記。冪等・伸びすぎ/縮みは異常でno-op。
// 検証口: window.__v292Dfix514 = { rewrite, wouldChange, isOff, last, status }
// =====================================================================
(function(){
  'use strict';
  var W = (typeof window !== 'undefined') ? window : this;
  if (W.__v292Dfix514 && W.__v292Dfix514.__armed) return;
  var TAG = '[v292Dfix514:say-fullname]';

  var MARKER = '【話者タグの徹底（最優先）】';
  var BLOCK = MARKER +
    '声に出された発話はすべて <say who="登録名">セリフ</say> で囲む。' +
    'whoは登場キャストの完全登録名から完全一致で選ぶ（短縮名・名字だけ・名前だけ・愛称・役職名・「主人公」「彼」「彼女」は不可）。' +
    '会話・叫び・囁き・悲鳴・呻き・笑い声・声に出した独り言・途切れた声・「……っ」「え？」のような短い反応にも必ず付ける。' +
    'whoには視点人物や地の文の主語ではなく、その言葉を実際に発声した本人を入れる（一人称・視点・外見・肉体・声質に惑わされない）。' +
    '鏡の中の別存在が話した=その存在／他人の声を真似た=真似した本人／憑依者が話した=発話を支配する人格／人格交代中=その時点で発話中の人格／正体を特定できない声=「不明な声」／匿名の多数=「群衆」。' +
    '声に出していない内心・思考・記憶・幻覚内の言葉・地の文には <say> も「」も使わない（声に出した独り言だけは通常の発話として <say who="登録名"> で囲む）。' +
    '名前のない裸の「」を本文に書かない。出力を終える前に、全ての発話に完全登録名のwhoが付いているか確認する。';

  function off(){ try { return localStorage.getItem('v292Dfix514Off') === '1'; } catch(e){ return false; } }
  function active(){ return !off(); }
  var last = null;

  function rewrite(sys){
    var s = String(sys == null ? '' : sys);
    if (!s || off()) return sys;
    if (s.indexOf(MARKER) >= 0) return sys;                  // 既に追記済（冪等）
    if (s.length < 200) return sys;                          // 実sysでない=触らない
    var out = s + '\n\n' + BLOCK;
    var added = out.length - s.length;
    if (added <= 0 || added > 700) return sys;               // 異常はno-op
    if (out.indexOf(MARKER) < 0) return sys;                 // fail-open
    last = { before: s.length, after: out.length, added: added };
    try { console.log(TAG, 'say-fullname block appended (+' + added + '字)'); } catch(e){}
    return out;
  }
  function wouldChange(sys){ return rewrite(sys) !== sys; }

  W.__v292Dfix514 = {
    __armed: true, rewrite: rewrite, wouldChange: wouldChange,
    active: active, isOff: off, last: function(){ return last; },
    status: function(){ return { armed:true, on:active(), last:last }; }
  };
  try { console.log(TAG, 'armed (say-fullname reinforce for fix441 pipeline); on:', active() ? 'on(default)' : 'off'); } catch(e){}
})();
