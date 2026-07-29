// =====================================================================
// Chronicle TRPG - v292Dfix648: 句読点隣接重複 collapse（地の文の生成出口正規化）
// ---------------------------------------------------------------------
// ■ 何を直すのか（実データで確定・2026-07-29）
//   全12物語を走査したところ、画面に「、。」「。、」が並ぶ隣接重複は **2件だけ** だった
//   （smr8p8wfr8b T15「それとも、。」/ smrisv41ho7 T12「崩れた。、いや」）。どちらも
//   本文(narrative)側で、カード(<say>/_convSays[].say)側は 0。モデルが文を書きかけて
//   途切れた生出力の名残と見られる。低頻度・cosmetic だが読者の目に触れるので直す。
//
// ■ GPT裁定（厳守・スコープを広げない）
//   ・案A のみ = 「新ターンの地の文を生成出口で正規化」する。
//   ・collapse 対象は **厳密に2種だけ**: 「、。」→「。」 と 「。、」→「。」。
//     他は一切触らない（「、、」「。。」「……。」「、！」「！？」等は意図的表現になりうる）。
//     「句読点が連続したら1文字へ」のような一般化は **禁止**。
//   ・既存の保存データは書き換えない（**非遡及**）。既存2件はそのまま残す。
//   ・レンダー時補正(案B)は却下 = 表示と保存が食い違うと evidenceSpan 照合 / fix606 話者監査 /
//     package hash / 差分・undo・診断 / 補正器の DOM 読取 が壊れる。だから **保存される
//     narrative そのもの** を正規化し、表示・保存・push が同じ確定値を見るようにする。
//   ・sys 追加はしない。
//
// ■ 適用位置（GPT指定「最終出口で1回だけ」）
//   モデル生出力 → fix555 等の句読点校正 → fix553 等の後段補正 → ★fix648 の地の文正規化
//   → 保存・表示・push。条件:
//     ・すべての句読点編集が終わった後（fix555 は Api.call 直後で確定済み。fix648 は S.save で走る）
//     ・保存前・表示前・push前（S.save の元処理へ委譲する **前** に t.narrative を書き換える）
//     ・narrative 部分だけ（<say> 内や _convSays[].say には適用しない）
//     ・raw 文字列全体へ regex をかけず、**構造化後の地の文ノード** = turn.narrative だけへ適用
//     ・関数は **冪等**（二度かけても同じ。連鎖「、。、」も変化が無くなるまで反復）
//     ・所有者は **この fix の1か所だけ**（fix555 内部や fix427 へ同じ処理を二重に入れない）
//
// ■ 配線位置の根拠（現物 index.html:1984〜1996 の submit 末尾）
//     1987  const turn = { ..., narrative: narr, plan, _convSays, ... }   ← 地の文が確定
//     1993  S.turns.push(turn)
//     1995  S.save()              ← ★ここをラップ。元処理(=保存・cloud push)へ委譲する前に正規化
//     1996  UI.appendTurn(turn)   ← 正規化後の turn.narrative を読んで描画する
//   fix645 が **同じ S.save ラップ位置** で turn.narrative から scene_move タグを剥がしている前例、
//   fix427 も S.save 直前で _convSays を補正している前例に倣う（「保存・表示・push のすべてより前」の1点）。
//   本 fix はロード順で fix645 の後ろに置くので S.save の **最外**ラップになり、
//   すべての句読点編集（fix555＝Api.call）の後・元 save の前で確実に走る。
//   fix648 collapse は「、。」「。、」しか触らないので scene_move タグ("<scene_move .../>")には影響せず、
//   fix645 の剥がし・fix427 の補正と順序が競合しない（直交・冪等）。
//
// ■ 非遡及（既存保存データを書き換えない）
//   fix645 と同じ二段ガード:
//     (1) このセッションで **実際に生成が走った**（parsePlan が呼ばれた）ことを sawGen で確認。
//         履歴ロードだけの save では sawGen=false なので何もしない。
//     (2) S.turns.length が前回観測より **増えた**ときの、増えた **最後の1ターンだけ** を対象。
//         既存の途中ターン（例の T12/T15）へは触れない。
//   さらに t.__f648 マークで **同じターンを二度処理しない**（冪等）。
//
// ■ 記録（soft signal・観測だけ）
//   collapse を1回でも適用したターンを v292Dfix648_log へ記録（件数・slot・turnIndex）。
//   ★これは生成品質の soft signal として観測するだけ。単独で再生成しない・
//     救済生成(fix643)のスコアへ影響させない（このファイルは再生成経路を一切呼ばない）。
//
// 冪等ガード: window.__v292Dfix648.__armed
// OFF      : localStorage v292Dfix648Off='1'（正規化も記録も完全停止）
// 記録     : localStorage v292Dfix648_log（上限100件・本文は保存しない）
// 読出     : window.__v292Dfix648.stats() / .log() / .clearLog() / .status() / .selfTest()
// =====================================================================
(function v292Dfix648(){
  'use strict';
  var G = (typeof window !== 'undefined') ? window
        : (typeof globalThis !== 'undefined') ? globalThis : this;
  if (G.__v292Dfix648 && G.__v292Dfix648.__armed) return;

  var TAG     = '[v292Dfix648:punct-collapse]';
  var LOG     = 'v292Dfix648_log';
  var MAX_LOG = 100;

  function lsg(k){ try { return G.localStorage.getItem(k); } catch(e){ return null; } }
  function lss(k, v){ try { G.localStorage.setItem(k, v); } catch(e){ return false; } return true; }
  function off(){ return lsg('v292Dfix648Off') === '1'; }

  // ===================================================================
  // 1. 純関数：地の文の句読点隣接 collapse（厳密に2種・冪等）
  //    node からも呼べる。副作用を置かない。
  // ===================================================================
  /* グローバル置換（replaceAll 非対応エンジンでも動く split/join 版）。 */
  function replaceAllStr(s, find, repl){ return s.split(find).join(repl); }

  /* GPT提示の関数（ほぼこのまま）。ただし1パスでは「、。、」等の連鎖が残りうるので
     **変化が無くなるまで反復** して冪等にする。触るのは「、。」「。、」の2種だけ。 */
  function collapseNarrativePunctuation(text){
    var s = String(text == null ? '' : text);
    var prev;
    do {
      prev = s;
      s = replaceAllStr(s, '、。', '。');
      s = replaceAllStr(s, '。、', '。');
    } while (s !== prev);
    return s;
  }

  // ===================================================================
  // 2. 記録（本文は保存しない・上限100件）
  // ===================================================================
  function readLog(){ try { var a = JSON.parse(lsg(LOG) || '[]'); return Array.isArray(a) ? a : []; } catch(e){ return []; } }
  function writeLog(a){ lss(LOG, JSON.stringify(a.slice(-MAX_LOG))); }
  function record(row){ try { var a = readLog(); a.push(row); writeLog(a); } catch(e){ session.errors++; } }

  var session = { turnsObserved: 0, turnsCollapsed: 0, collapses: 0, errors: 0 };

  // ===================================================================
  // 3. 環境アクセス（fix645 と同じ作法）
  // ===================================================================
  function getS(){
    try { var g = G.__chronicleGetState; if (typeof g === 'function'){ var a = g('fix648'); if (a) return a; } } catch(e){}
    try { if (G.S) return G.S; } catch(e){}
    try { return (0, eval)('typeof S!=="undefined"?S:null'); } catch(e){ return null; }
  }
  function getPlanner(){ try { return G.Planner || ((typeof Planner !== 'undefined') ? Planner : null); } catch(e){ return null; } }
  function slotId(){
    try {
      var k = (typeof G.__chr6Key === 'function') ? G.__chr6Key() : 'chr6';
      return String(k || 'chr6').replace(/^chr6_slot_/, '') || 'chr6';
    } catch(e){ return 'chr6'; }
  }

  var wired = { parsePlan: false, save: false };

  // ===================================================================
  // 4. 生成シグナル（parsePlan を read-only でラップ・plan は一切いじらない）
  //    履歴ロードだけの save で誤って既存ターンを書き換えないための非遡及ガード。
  // ===================================================================
  var sawGen = false, baselineSet = false, lastLen = -1;
  function wrapParse(){
    var P = getPlanner();
    if (!P || typeof P.parsePlan !== 'function') return false;
    if (P.parsePlan.__f648){ wired.parsePlan = true; return true; }
    var orig = P.parsePlan.bind(P);
    var w = function(){
      try {
        if (!off()){
          /* ★非遡及の要: parsePlan は「新ターンを push する前」に走る（submit の順序）。
             この瞬間の S.turns.length を1度だけ baseline にする＝このセッションで生成を
             始める前から在ったターン数。以後 length がこれを超えたぶん（=新ターン）だけ処理する。
             baseline を取らずに lastLen=-1 のままだと、直後の save で末尾（既存ターン）を
             誤って書き換えうる（遡及）。 */
          if (!baselineSet){
            try { var S0 = getS(); if (S0 && Array.isArray(S0.turns)) lastLen = S0.turns.length; } catch(e){}
            baselineSet = true;
          }
          sawGen = true;
        }
      } catch(e){}
      return orig.apply(this, arguments);   // 戻り値は一切いじらない
    };
    try { Object.keys(orig).forEach(function(k){ w[k] = orig[k]; }); } catch(e){}
    w.__f648 = true;
    P.parsePlan = w;
    wired.parsePlan = true;
    try { console.log(TAG, 'parsePlan wrap installed (generation signal only)'); } catch(e){}
    return true;
  }

  // ===================================================================
  // 5. S.save ラップ（★本体：確定した新ターンの地の文だけを正規化）
  //    元 save（保存・cloud push）へ委譲する **前** に走る＝保存前・表示前・push前。
  // ===================================================================
  function processLastTurn(){
    if (off()) return;
    var S = getS();
    if (!S || !Array.isArray(S.turns) || !S.turns.length) return;
    if (!sawGen){ lastLen = S.turns.length; return; }   // 生成を見ていない＝履歴ロード。遡及しない
    if (S.turns.length <= lastLen) return;              // 新ターンではない
    lastLen = S.turns.length;

    var t = S.turns[S.turns.length - 1];
    if (!t || t.__f648) return;                         // 冪等（同じターンを二度処理しない）
    t.__f648 = 1;
    session.turnsObserved++;

    /* ★narrative（画面本文になる地の文ノード）だけを対象。<say> は既に本文から除去済みで、
       会話カードは t._convSays[].say に分離されている＝ここでは一切触らない。plan.narrative
       （話者タグ付きの一次証拠配列）も触らない。 */
    var narr = (typeof t.narrative === 'string') ? t.narrative : '';
    if (!narr) return;
    var out = collapseNarrativePunctuation(narr);
    if (out === narr) return;                           // 変化なし＝99%以上のターン

    var applied = narr.length - out.length;             // collapse 1回につき1文字減る
    t.__f648prev = narr;                                // 退避（ロールバック可能）
    t.narrative = out;
    session.turnsCollapsed++;
    session.collapses += applied;

    /* soft signal のみ。再生成しない・fix643 のスコアへ影響させない。 */
    record({ ts: new Date().toISOString(), slotId: slotId(),
             turnIndex: S.turns.length - 1, collapses: applied });
    try { console.log(TAG, 'collapsed narrative punctuation x' + applied, 'turnIndex', S.turns.length - 1); } catch(e){}
  }

  function wrapSave(){
    var S = getS();
    if (!S || typeof S.save !== 'function') return false;
    if (S.__f648save){ wired.save = true; return true; }
    var os = S.save.bind(S);
    S.save = function(){
      try { processLastTurn(); } catch(e){ session.errors++; }
      return os.apply(this, arguments);
    };
    S.__f648save = true;
    wired.save = true;
    try { console.log(TAG, 'S.save wrap installed (narrative punctuation collapse, before save/display/push)'); } catch(e){}
    return true;
  }

  // ===================================================================
  // 6. 装着（他 fix に奪われても取り返す。fix645 と同型）
  // ===================================================================
  function install(){
    if (off()) return;
    try { wrapParse(); } catch(e){}
    try { wrapSave(); } catch(e){}
  }
  install();
  try { G.setInterval(install, 2000); } catch(e){}

  // ===================================================================
  // 7. 読出口 / selfTest
  // ===================================================================
  function stats(){
    return {
      turnsObserved: session.turnsObserved,
      turnsCollapsed: session.turnsCollapsed,   // ＝ fix648Applied 相当（collapse を適用したターン数）
      collapses: session.collapses,             // 置換した句読点の総数
      errors: session.errors,
      wired: JSON.parse(JSON.stringify(wired)),
      off: off(),
      logged: readLog().length
    };
  }
  function status(){
    var S = getS();
    return {
      off: off(), wired: JSON.parse(JSON.stringify(wired)),
      sawGen: sawGen, lastLen: lastLen, slotId: slotId(),
      turns: (S && Array.isArray(S.turns)) ? S.turns.length : -1,
      session: JSON.parse(JSON.stringify(session)), logged: readLog().length
    };
  }

  /* 通信も保存もしない固定サンプル。実機コンソールで契約を1行確認するため。 */
  var FIXTURES = [
    { name: 'ten-maru',   in: 'それとも、。',      out: 'それとも。' },
    { name: 'maru-ten',   in: '崩れた。、いや',    out: '崩れた。いや' },
    { name: 'chain',      in: 'あ、。、い',        out: 'あ。い' },
    { name: 'keep-tenten', in: 'あ、、い',         out: 'あ、、い' },
    { name: 'keep-marumaru', in: 'あ。。い',       out: 'あ。。い' },
    { name: 'keep-ellipsis', in: 'あ……。い',     out: 'あ……。い' },
    { name: 'keep-bang',  in: 'あ！？い',          out: 'あ！？い' },
    { name: 'noop',       in: '普通の文です。',    out: '普通の文です。' }
  ];
  function selfTest(){
    var out = { ok: true, cases: [] };
    for (var i = 0; i < FIXTURES.length; i++){
      var f = FIXTURES[i];
      var got = collapseNarrativePunctuation(f.in);
      var idem = collapseNarrativePunctuation(got);         // 冪等（二度かけて同じ）
      var good = (got === f.out) && (idem === got);
      if (!good) out.ok = false;
      out.cases.push({ name: f.name, got: got, want: f.out, idempotent: idem === got, pass: good });
    }
    return out;
  }

  G.__v292Dfix648 = {
    __armed: true,
    /* 純関数（テストから直接呼ぶ） */
    collapseNarrativePunctuation: collapseNarrativePunctuation,
    /* 記録 */
    log: readLog, clearLog: function(){ try { G.localStorage.removeItem(LOG); } catch(e){} return true; },
    LOG_KEY: LOG, MAX_LOG: MAX_LOG,
    /* 状態 */
    stats: stats, status: status, selfTest: selfTest, isOff: off, FIXTURES: FIXTURES,
    /* 装着（テスト・手動修復用） */
    _install: install, _wrapParse: wrapParse, _wrapSave: wrapSave, _processLastTurn: processLastTurn
  };
  try { if (!off()) console.log(TAG, 'ready (narrative 、。/。、 collapse only)'); } catch(e){}
})();
