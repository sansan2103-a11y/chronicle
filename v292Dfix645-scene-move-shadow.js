// =====================================================================
// Chronicle TRPG - v292Dfix645: scene_move タグの shadow 収集（⑤位置引き継ぎ 第一歩）
// ---------------------------------------------------------------------
// ■ 変更履歴
//   fix647(2026-07-29): prio2昇格・肯定形必須・分母をeligibleへ。
//     実プレイ49ターン（移動を大量投入）でscene_moveが通算1回・採用0＝ほぼ機能せず。
//     GPT裁定に沿って sys契約の「位置」と「方向」を直す（few-shotは足さない・タグは本文末尾のまま）。
//     (1) keeperブロックを prio3→prio2 へ昇格（<say>/<state>/<react> と同じ出力形式ブロックの階層）。
//         fix646で BUDGET_V4=2400 に拡張済み。prio2/3合計は昇格後も 2400 内（実測: 設計docと test(7i)）。
//     (2) sys文面を「省略優先（迷ったら出さない）」から「肯定形の必須規則（明記なら必ず出す）」へ反転。
//     (3) to規則をパーサ側コメントで明文化。ev.includes(to) は維持（緩めない）。
//         許容する正規化は XMLエスケープ復元・改行コード統一のみ。空白削除・句読点削除・表記揺れ吸収は
//         許さない（完全引用の証拠が弱くなる）。現状の verify() は ev の**完全一致（部分文字列）**で
//         正規化を一切していない＝上記より厳格なので締め直しは不要（範囲内）。
//     (4) 出力率の分母を eligibleMoveTurns 方式へ。stats() に rawRecall/validatedRecall/precision/
//         eligibleApprox を追加（既存フィールドは壊さない・後方互換）。eligible は自動化のための**近似**
//         （本文末尾付近の到着完了語彙でカウント。field 名の Approx がそれを明示）。
//     緊急復帰: localStorage v292Dfix647Off='1' で「prio3＋旧文面」へ戻す（旧prio・旧文面を保持）。
//   fix645(2026-07-27): 初版（prio3・省略優先文面・shadowのみ）。
// ---------------------------------------------------------------------
// ■ 何をするのか（GPT裁定 P1・スコープを広げない）
//   「主人公が移動を完了し、ターン終了時の居場所が変わった」ときだけ、モデルに
//   <scene_move who="hero" to="到着地点" ev="本文からの抜粋"/> を1つ出させる。
//   出てきたタグを**そのまま信用せず**、本文との完全一致検証を通ったものだけを
//   derived observation として記録する。
//
//   ★在場（誰が居るか）・姿勢・所持は**入れない**。位置 state も**作らない**。
//   ★本文・保存・生成へ一切影響させない（shadow）。再生成もしない。スコアも動かさない。
//
// ■ sys 追加（keeper 系の既存作法）
//   window.__f379reg へ **prio2**（fix647昇格・旧prio3）で1ブロック登録する。
//   Planner._extensions は**死に経路**（fix377/fix414/fix416/fix427 のヘッダに実測記録あり）なので使わない。
//   fix647でprio2へ昇格した理由: prio3だと予算逼迫時に**最初に落ちる**＝実プレイで契約が届かず
//   出力率2%（49ターンで1回）に沈んだ。<say>/<state>/<react> と同じ「出力形式ブロック」なので
//   同じ prio2 の階層に置く。fix646で BUDGET_V4=2400（prio2/3 対象）に拡張済みなので prio2 でも収まる。
//   ★marker 【移動タグ】は v292Dfix459-sys-v2.js の MARKERS へも登録済み。
//     未知マーカーのブロックは直前ブロックへ吸収され、直前が drop 対象なら道連れで消える
//     （fix496(A1) が実測した事故）。登録しないと毎ターン黙って消える。
//   ★長い内省指示（「移動の有無を慎重に推論せよ」等）は入れない。推論型モデルが
//     タグ判断へトークンを浪費するため（GPT裁定）。
//   ★from は初版では出させない。現在地 state が無い段階で from を必須にすると捏造を誘発する。
//
// ■ 配線（実物の行番号は 2026-07-29 の index.html）
//   1804 Planner.build   → keeper が sys 末尾へ【移動タグ】を足す
//   1805 Api.call        → 本fixの fetch ラッパが finish_reason だけ控える(clone・読むだけ)
//   1808 parsePlan(raw)  → raw を控える（plan は一切いじらない）
//   1984 const turn = { narrative: narr, plan, ... }
//   1993 S.turns.push(turn)
//   1995 S.save()        → ★本体。judge + 記録 + turn.narrative からタグを剥がす
//   1996 UI.appendTurn   → 剥がした後に描画される
//   二重ネット: UI.renderNarr も fix60 と同型でラップし、万一 S.save ラップを奪われても
//   画面には絶対にタグを出さない。
//
// ■ タグ剥がしの位置（既存タグの調査結果）
//   <state>/<react>/<summary> … index.html:1218 buildProsePlan（parse 時点で除去・plan に残らない）
//   <say>                     … index.html:1963〜1982（narr に対して。plan.narrative には残る）
//   <scene_move>              … 本fixの S.save ラップ（turn.narrative に対して）。
//                               **turn.plan.narrative には残す**＝話者タグと同じ扱い（一次証拠）
//
// ■ max_tokens 枯渇への防御（GPT裁定そのまま）
//   ・採用は 0 または 1 件のみ（2件目以降は無視）
//   ・finish_reason==='length'（Anthropic系は stop_reason==='max_tokens'）のターンは採用しない
//   ・閉じが不完全なタグは無視
//   ・タグ欠落を生成失敗として扱わない／scene_move 欠落を理由に再生成しない／
//     fix643 のスコアにも影響させない
//
// ■ ★将来基準（コメントに残すだけ。この fix では実装しない）
//   shadow が有用と言える   : 適合率 >= 98% / 移動完了ターンの出力率 >= 60% / 重大幻覚 0
//   location state へ昇格可 : 固定検証セット適合率 >= 99% / タグ陽性 200件の人手監査 /
//                             完全一致通過率 >= 98%
//   この数字に届くまで、位置 state は作らない・現在地を sys へ注入しない・from を要求しない。
//
// 冪等: window.__v292Dfix645.__armed
// OFF : localStorage v292Dfix645Off='1'（sys注入もパーサも完全停止。剥がしもしない）
// 記録: localStorage v292Dfix645_log（上限100件・raw は150字まで・**本文は保存しない**）
// 読出: window.__v292Dfix645.stats() / .log() / .clearLog() / .status() / .selfTest()
// =====================================================================
(function v292Dfix645(){
  'use strict';
  var G = (typeof window !== 'undefined') ? window
        : (typeof globalThis !== 'undefined') ? globalThis : this;
  if (G.__v292Dfix645 && G.__v292Dfix645.__armed) return;

  var TAG     = '[v292Dfix645:scene-move-shadow]';
  var LOG     = 'v292Dfix645_log';
  var MAX_LOG = 100;   // 全体で100件（スロット別ではなく全体・GPT裁定の「or」の後者）
  var MAX_RAW = 150;   // 記録するタグ文字列の上限
  var MAX_EV  = 80;    // ev の上限（GPT裁定）

  function lsg(k){ try { return G.localStorage.getItem(k); } catch(e){ return null; } }
  function lss(k, v){ try { G.localStorage.setItem(k, v); } catch(e){ return false; } return true; }
  function off(){ return lsg('v292Dfix645Off') === '1'; }
  /* fix647 緊急復帰スイッチ: '1' で「prio3＋旧文面」へ戻す（この回限りの修正が悪化したときの退避路）。 */
  function f647off(){ return lsg('v292Dfix647Off') === '1'; }

  function getS(){
    try { var g = G.__chronicleGetState; if (typeof g === 'function'){ var a = g('fix645'); if (a) return a; } } catch(e){}
    try { if (G.S) return G.S; } catch(e){}
    try { return (0,eval)('typeof S!=="undefined"?S:null'); } catch(e){ return null; }
  }
  function slotId(){
    try {
      var k = (typeof G.__chr6Key === 'function') ? G.__chr6Key() : 'chr6';
      return String(k || 'chr6').replace(/^chr6_slot_/, '') || 'chr6';
    } catch(e){ return 'chr6'; }
  }
  function heroName(){
    try { var S = getS(); return String((S && S.cast && S.cast.hero && S.cast.hero.name) || '').trim(); }
    catch(e){ return ''; }
  }

  // ===================================================================
  // 1. sys ブロック（keeper prio2 / fix647。旧: prio3）
  // ===================================================================
  var MARKER = '【移動タグ】';

  /* fix647 新文面（GPT推奨・肯定形の必須規則）。「迷ったら出さない」の省略優先を削除し、
     「本文に到着完了を明記した場合は必ず出す」へ反転。few-shot例は入れない（契約の位置と方向を先に直す）。
     タグは本文末尾のまま（本文が無い段階で ev を完全引用できないため、前へは移さない＝GPT却下）。 */
  var TEXT_NEW = '\n' + MARKER
    + '主人公が別の場所へ到達し、ターン終了時の居場所が変わったことを本文に明記した場合は、'
    + '本文末尾に <scene_move who="hero" to="到着地点の原文" ev="移動完了箇所の原文"/> を必ず出す。'
    + 'toとevは本文から一字も変えず抜き出し、toはev内に含まれる文字列にする。'
    + '移動未遂・予定・回想・視線移動、同じ場所内の動作では出さない。';

  /* 旧文面（fix645初版・省略優先）。v292Dfix647Off='1' のときだけ使う（緊急復帰）。 */
  var TEXT_OLD = '\n' + MARKER
    + '主人公が移動を完了し、ターン終了時の居場所が変わった場合だけ、本文の後に '
    + '<scene_move who="hero" to="到着地点" ev="本文からの抜粋"/> を1つだけ出力する。'
    + 'evは本文から一字も変えずに抜き出す。移動の予定・未遂・回想・視線だけの移動、'
    + '居場所が変わらない動作では出力しない。迷ったら出さない。'
    + '物語本文を優先し、タグのために本文を短くしない。該当しなければタグは完全に省略する。';

  /* 冪等・後方互換: 旧テストが参照する TEXT は「実際に注入される文面」を指す（fix647OffでOLDへ切替）。 */
  function activeText(){ return f647off() ? TEXT_OLD : TEXT_NEW; }
  var TEXT = activeText();               // 読出口・status 用のスナップショット
  var PRIO = f647off() ? 3 : 2;          // fix647昇格。緊急復帰時のみ 3。

  function textFn(){ return off() ? '' : activeText(); }   // OFF は keeper の off キーでも効くが二重に止める

  var wired = { keeper: false, fetch: false, parsePlan: false, save: false, render: false };

  (function registerKeeper(){
    try {
      G.__f379reg = G.__f379reg || [];
      var reg = G.__f379reg;
      for (var i = 0; i < reg.length; i++){ if (reg[i] && reg[i].marker === MARKER){ wired.keeper = true; return; } }
      reg.push({ off: 'v292Dfix645Off', marker: MARKER, prio: PRIO, text: textFn });
      wired.keeper = true;
      try { console.log(TAG, 'keeper registered (prio' + PRIO + ', ' + activeText().length + ' chars)'); } catch(e){}
    } catch(e){ try { console.warn(TAG, 'keeper reg err:', e && e.message); } catch(_){} }
  })();

  // ===================================================================
  // 2. 純関数（node からも呼べる。ここに副作用を置かない）
  // ===================================================================

  /* well-formed = 自己閉じのタグだけ。閉じが不完全なものは拾わない（＝無視する）。 */
  var RE_WELL   = /<scene_move\b([^<>]*?)\/>/gi;
  var RE_ANY    = /<scene_move\b/gi;
  /* 剥がし用（壊れた断片・閉じ忘れ・行末での途切れも残さない） */
  var RE_STRIP1 = /<scene_move\b[^<>]*\/?>/gi;
  var RE_STRIP2 = /<\/\s*scene_move\s*>/gi;
  /* ★行末で途切れたタグ。改行を跨がせない（[^<>\n] + m フラグ）。
     ここを [^<>]* にすると、途切れたタグ以降の**本文を全部消す**事故になる。 */
  var RE_STRIP3 = /<scene_move\b[^<>\n]*$/gim;

  function attrsOf(s){
    var out = {}, re = /([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*"([^"]*)"/g, m;
    while ((m = re.exec(String(s || '')))) out[m[1].toLowerCase()] = m[2];
    return out;
  }

  /* 生の応答からタグを取り出す。plan.narrative からは拾わない
     （parsePlan の行フィルタ「かなを1文字以上含む行だけ残す」でタグ行が落ちることがあるため）。 */
  function extractTags(raw){
    var s = String(raw == null ? '' : raw);
    var tags = [], m;
    RE_WELL.lastIndex = 0;
    while ((m = RE_WELL.exec(s))){
      var a = attrsOf(m[1]);
      tags.push({ raw: m[0], who: a.who || '', to: a.to || '', ev: a.ev || '' });
    }
    RE_ANY.lastIndex = 0;
    var any = (s.match(RE_ANY) || []).length;
    return { tags: tags, any: any, incomplete: any > tags.length };
  }

  /* 表示本文から scene_move を取り除く（＝検証に使う「本文」を作る／画面から剥がす） */
  function strip(text){
    if (text == null) return text;
    var s = String(text);
    s = s.replace(RE_STRIP1, '').replace(RE_STRIP2, '').replace(RE_STRIP3, '');
    s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
    return s.replace(/^\s+|\s+$/g, '');
  }
  function hasTag(text){ RE_ANY.lastIndex = 0; return RE_ANY.test(String(text == null ? '' : text)); }

  /* 到着完了を示す語（完了形だけ・過剰に賢くしない） */
  var ARRIVE = ['入った','入っていった','踏み入れた','踏み込んだ','着いた','到着した','辿り着いた','たどり着いた',
                '出た','出ていった','上がった','上った','登った','昇った','降りた','下りた','下がった',
                '戻った','帰った','抜けた','抜け出た','移った','移動した','くぐった','渡った','進み出た'];
  /* 未遂・予定・仮定・回想・否定（GPT裁定の例をそのまま並べたリスト） */
  /* ★'うとした' は意志形（入ろうとした／出ようとした／向かおうとした）を1本でまとめて拾う。
     'ようとした' だけだと「入ろうとした」(ろ+うとした)を取りこぼす。 */
  var UNREAL = ['うとした','うとして','つもり','だったら','かもしれ','だろうか',
                '思い出','回想','想像','夢の中','幻','錯覚',
                'しなかった','できなかった','られなかった','なかった','ないまま','ではない','わけがない',
                'かのように','ような気がした','予定','するところだった','はずだった'];
  function hasAny(s, list){
    for (var i = 0; i < list.length; i++){ if (s.indexOf(list[i]) >= 0) return list[i]; }
    return null;
  }
  function countOccurrences(hay, needle){
    if (!needle) return 0;
    var n = 0, from = 0, at;
    while ((at = hay.indexOf(needle, from)) >= 0){ n++; from = at + 1; }
    return n;
  }
  function truncated(finish){
    var f = String(finish == null ? '' : finish).toLowerCase();
    return f === 'length' || f === 'max_tokens' || f === 'max_output_tokens';
  }

  /* ---- 1件のタグを検証する（純関数） ----
     body     : 画面に出る本文から scene_move を取り除いたもの（＝プレイヤーが読む文字列）
     rawBody  : 生の応答の本文側（切り分け診断用・無ければ null）
     opts     : { finish, hero }
     返り値   : { accepted, reason, to, evLen } */
  function verify(tag, body, opts){
    opts = opts || {};
    var res = { accepted: false, reason: null, to: null, evLen: (tag && tag.ev != null) ? String(tag.ev).length : 0 };

    if (truncated(opts.finish)){ res.reason = 'finish-length'; return res; }

    var who = String((tag && tag.who) || '').trim();
    var to  = String((tag && tag.to)  || '').trim();
    var ev  = String((tag && tag.ev)  || '');
    var hero = String(opts.hero || '').trim();

    if (!(who.toLowerCase() === 'hero' || (hero && who === hero))){ res.reason = 'who-not-hero'; return res; }
    if (!to){ res.reason = 'to-empty'; return res; }
    if (!ev){ res.reason = 'ev-empty'; return res; }
    if (ev.length > MAX_EV){ res.reason = 'ev-too-long'; return res; }

    /* ★fix647 完全引用の正規化ポリシー（緩めない）:
       ev は本文の**部分文字列として一字一句一致**することを要求する。ここでは正規化を一切しない
       ＝空白削除・句読点削除・表記揺れ吸収は許さない（それらは完全引用の証拠を弱める）。
       GPT裁定で許容されるのは XMLエスケープ復元・改行コード統一のみだが、現状それも不要
       （attrsOf は素の属性値を取り、body 側も strip の空白畳み以外は素のまま＝この完全一致が最も厳格）。 */
    var b = String(body == null ? '' : body);
    var n = countOccurrences(b, ev);
    if (n === 0){
      /* 生でだけ一致する＝fix175/fix427 の後処理で本文がズレた分。幻覚とは別物なので別カウント。 */
      var rb = String(opts.rawBody == null ? '' : opts.rawBody);
      res.reason = (rb && countOccurrences(rb, ev) > 0) ? 'ev-not-in-final-body' : 'ev-not-in-body';
      return res;
    }
    if (n > 1){ res.reason = 'ev-ambiguous'; return res; }
    /* ★to規則（fix647明文化）: to は「本文中の到着地点表現そのもの」であり、ev 内に部分文字列として
       含まれていること（ev.includes(to)）を要求する。本文に無い要約ラベル（例: 到着地点を勝手に
       一語へ要約した語）は ev に含まれないので不採用になる＝完全引用の証拠を担保する。 */
    if (ev.indexOf(to) < 0){ res.reason = 'ev-missing-to'; return res; }
    /* ★未遂・予定・回想の判定を先に置く。「厨房に入ろうとした」は到着語も持たないので
       どちらでも拒否になるが、**拒否理由の内訳を読むとき**に「未遂」と分かる方が使える。 */
    if (hasAny(ev, UNREAL)){ res.reason = 'unrealized'; return res; }
    if (!hasAny(ev, ARRIVE)){ res.reason = 'no-arrival-verb'; return res; }

    res.accepted = true;
    res.to = to;
    return res;
  }

  /* ---- 1ターン分の判定（純関数） ----
     採用は 0 または 1 件のみ。2件目以降は無視する。 */
  function judge(raw, body, opts){
    opts = opts || {};
    var ex = extractTags(raw);
    if (!ex.tags.length){
      if (ex.incomplete) return { hadTag: true, extra: 0, tagRaw: '<scene_move …(閉じ不完全)', accepted: false, reason: 'incomplete-tag', to: null, evLen: 0 };
      return { hadTag: false, extra: 0, tagRaw: null, accepted: false, reason: null, to: null, evLen: 0 };
    }
    var first = ex.tags[0];
    var v = verify(first, body, opts);
    return {
      hadTag: true,
      extra: ex.tags.length - 1 + (ex.incomplete ? 1 : 0),   // 無視した2件目以降＋壊れ断片
      tagRaw: String(first.raw).slice(0, MAX_RAW),
      accepted: v.accepted, reason: v.reason, to: v.to, evLen: v.evLen
    };
  }

  // ===================================================================
  // 3. 記録（本文は1バイトも保存しない）
  // ===================================================================
  function readLog(){ try { var a = JSON.parse(lsg(LOG) || '[]'); return Array.isArray(a) ? a : []; } catch(e){ return []; } }
  function writeLog(a){ lss(LOG, JSON.stringify(a.slice(-MAX_LOG))); }
  function record(row){
    try { var a = readLog(); a.push(row); writeLog(a); } catch(e){ session.errors++; }
  }

  var session = { turnsObserved: 0, eligibleMoveTurns: 0, tagTurns: 0, accepted: 0, rejected: 0,
                  stripped: 0, rawMismatch: 0, errors: 0 };

  /* ---- eligibleMoveTurns の近似判定（fix647・変更4） ----
     「生成本文に主人公の明示的到着完了があるターン」を出力率の分母にしたい。人手判定が理想だが
     自動化のため、**本文末尾付近**に到着完了語彙（ARRIVE を流用）が現れるかで近似する。
     ★あくまで近似（precision/recall とも近似分母）。field 名の Approx がそれを明示する。
     末尾付近に限る理由: ターン終了時の居場所（＝最後の到着）を見たいので、本文途中の通過は数えない。 */
  var ELIG_TAIL = 60;   // 本文末尾から何字を「末尾付近」とみなすか
  function eligibleArrivalApprox(body){
    var b = String(body == null ? '' : body);
    if (!b) return false;
    var tail = b.length > ELIG_TAIL ? b.slice(b.length - ELIG_TAIL) : b;
    return !!hasAny(tail, ARRIVE);
  }

  /* 分母0のとき null（=まだ測れない）。それ以外は小数第1位までの% */
  function pct(num, den){ return den > 0 ? Math.round(num / den * 1000) / 10 : null; }

  function stats(){
    var a = readLog(), byReason = {}, acc = 0;
    for (var i = 0; i < a.length; i++){
      if (a[i] && a[i].accepted) acc++;
      else { var r = (a[i] && a[i].rejectReason) || 'unknown'; byReason[r] = (byReason[r] || 0) + 1; }
    }
    /* fix647: 出力率の分母を eligibleMoveTurns（近似）へ。3指標はすべて**セッション内**の
       カウンタから出す（分子・分母が同じ母集団で整合する）。log ベースの accepted/acceptRate は
       後方互換のため据え置き（=別ソース・過去100件の適合率）。 */
    var eligible = session.eligibleMoveTurns;   // 近似
    return {
      turnsObserved: session.turnsObserved,          // このセッションで見たターン数
      tagTurns: a.length,                            // タグが出たターン数（記録ベース・上限100件内）
      accepted: acc,
      rejected: a.length - acc,
      byReason: byReason,
      acceptRate: a.length ? Math.round(acc / a.length * 1000) / 10 : null,   // %（log内・後方互換）
      // ---- fix647 追加: eligibleMoveTurns 方式の3指標（すべて近似分母・セッション内） ----
      eligibleApprox: eligible,                                   // 近似の分母（到着完了が末尾付近にあるターン数）
      rawRecall: pct(session.tagTurns, eligible),                 // scene_move出力あり / eligible(近似)
      validatedRecall: pct(session.accepted, eligible),           // 検証通過 / eligible(近似)
      precision: pct(session.accepted, session.tagTurns),         // 検証通過 / scene_move出力総数
      session: JSON.parse(JSON.stringify(session)),
      wired: JSON.parse(JSON.stringify(wired)),
      off: off(),
      f647off: f647off(),
      prio: PRIO,
      logged: a.length
    };
  }

  // ===================================================================
  // 4. finish_reason の捕捉（fetch を clone して読むだけ・応答は一切いじらない）
  // ===================================================================
  var finishRing = [];   // [{ key, finish }] 直近6件
  function keyOf(t){ return String(t == null ? '' : t).replace(/\s+/g, '').slice(0, 60); }
  function pickFinish(j){
    try {
      if (j && j.choices && j.choices[0]) return j.choices[0].finish_reason || j.choices[0].native_finish_reason || j.choices[0].stop_reason || null;
      if (j && j.stop_reason) return j.stop_reason;
    } catch(e){}
    return null;
  }
  function pickText(j){
    try {
      if (j && j.choices && j.choices[0] && j.choices[0].message && typeof j.choices[0].message.content === 'string') return j.choices[0].message.content;
      if (j && Array.isArray(j.content)) return j.content.map(function(c){ return (c && c.text) || ''; }).join('');
      if (j && typeof j.text === 'string') return j.text;
    } catch(e){}
    return null;
  }
  function finishFor(raw){
    var k = keyOf(raw);
    for (var i = finishRing.length - 1; i >= 0; i--){ if (finishRing[i].key === k) return finishRing[i].finish; }
    return null;   // 分からなければ null（＝length ではない扱い。閉じ不完全チェックが別に効く）
  }
  var fetchInstalled = false;
  function wrapFetch(){
    try {
      if (fetchInstalled) return;
      var prev = G.fetch;
      if (typeof prev !== 'function') return;
      if (prev.__f645){ fetchInstalled = true; wired.fetch = true; return; }
      var wrapped = function(){
        var p = prev.apply(this, arguments);
        if (off() || !p || typeof p.then !== 'function') return p;
        return p.then(function(res){
          /* ★clone() を使う。呼び出し元が読む本体は一切消費しない・書き換えない。 */
          try {
            if (res && typeof res.clone === 'function' && res.ok){
              res.clone().json().then(function(j){
                try {
                  var t = pickText(j);
                  if (t == null) return;
                  finishRing.push({ key: keyOf(t), finish: pickFinish(j) });
                  if (finishRing.length > 6) finishRing.shift();
                } catch(e){}
              }, function(){});
            }
          } catch(e){}
          return res;
        });
        /* 失敗は握りつぶさない（then の第2引数を付けない＝元の rejection がそのまま伝わる） */
      };
      wrapped.__f645 = true;
      try { Object.keys(prev).forEach(function(k){ if (k !== '__f645') wrapped[k] = prev[k]; }); } catch(e){}   // fix419c の掟
      try { Object.defineProperty(wrapped, 'name', { value: prev.name || 'wrapped', configurable: true }); } catch(e){}
      G.fetch = wrapped;
      fetchInstalled = true; wired.fetch = true;
    } catch(e){}
  }

  // ===================================================================
  // 5. parsePlan ラップ（raw を控えるだけ。plan は一切いじらない）
  // ===================================================================
  var lastRaw = null, lastFinish = null, seenRaw = false;
  function getPlanner(){ try { return G.Planner || ((typeof Planner !== 'undefined') ? Planner : null); } catch(e){ return null; } }
  function wrapParse(){
    var P = getPlanner();
    if (!P || typeof P.parsePlan !== 'function') return false;
    if (P.parsePlan.__f645){ wired.parsePlan = true; return true; }
    var orig = P.parsePlan.bind(P);
    var w = function(rawText){
      try {
        if (!off()){
          lastRaw = String(rawText == null ? '' : rawText);
          lastFinish = finishFor(lastRaw);
          seenRaw = true;
        }
      } catch(e){ session.errors++; }
      return orig.apply(this, arguments);
    };
    try { Object.keys(orig).forEach(function(k){ w[k] = orig[k]; }); } catch(e){}
    w.__f645 = true;
    P.parsePlan = w;
    wired.parsePlan = true;
    try { console.log(TAG, 'parsePlan wrap installed'); } catch(e){}
    return true;
  }

  /* 生の応答の本文側（<state / <react / <scene_move の手前まで）。切り分け診断にだけ使う。 */
  function rawBodyOf(raw){
    var s = String(raw == null ? '' : raw);
    return s.split(/<react|<state|<scene_move/)[0];
  }

  /* ★控えた raw が「このターンのもの」かを確かめる（fix427 の作法）。
     スロット切替・履歴読み込み・fix643 が捨てた候補などで raw が古いまま残ることがあり、
     そのまま判定すると **実在しない拒否理由が記録に混ざる**（記録の意味が壊れる）。
     一致しなければ判定そのものを中止する（記録もしない）。 */
  function norm(s){ return String(s == null ? '' : s).replace(/<[^>]*>/g, '').replace(/[\s　]/g, ''); }
  function rawMatchesTurn(raw, narr){
    var a = norm(rawBodyOf(raw)), b = norm(narr);
    var n = Math.min(20, a.length, b.length);
    if (n < 8) return false;                    // これ以下は偶然の一致がありうるので判定しない
    /* fix555(句読点校正)や fix427(メタ行除去)が本文を少し変えるので、
       先頭だけでなく1/3・2/3の位置からも照合する。 */
    var pos = [0, Math.floor(a.length / 3), Math.floor(a.length * 2 / 3)];
    for (var i = 0; i < pos.length; i++){
      var p = Math.min(pos[i], a.length - n);
      var probe = a.substr(p, n);
      if (probe.length === n && b.indexOf(probe) >= 0) return true;
    }
    return a.indexOf(b.substr(0, n)) >= 0;
  }

  // ===================================================================
  // 6. S.save ラップ（★本体：判定 → 記録 → turn.narrative からタグを剥がす）
  //    保存・クラウド送出・表示の**すべてより前**にある1点（fix427 A2 と同じ位置）。
  // ===================================================================
  var lastLen = -1;
  function processLastTurn(){
    if (off()) return;
    var S = getS();
    if (!S || !Array.isArray(S.turns) || !S.turns.length) return;
    var t = S.turns[S.turns.length - 1];
    if (!t || t.__f645) return;
    if (!seenRaw){ lastLen = S.turns.length; return; }      // このセッションで生成していない＝履歴は触らない
    if (S.turns.length <= lastLen) return;                  // 新ターンではない
    lastLen = S.turns.length;
    t.__f645 = 1;
    session.turnsObserved++;

    var narr = (typeof t.narrative === 'string') ? t.narrative : '';
    var body = strip(narr);      // ★検証に使う「本文」＝プレイヤーが読む文字列

    /* (a) 判定と記録。raw を一次ソースにする（plan.narrative の行フィルタで落ちることがあるため） */
    try {
      if (!rawMatchesTurn(lastRaw, narr)){ session.rawMismatch++; }
      else {
      /* eligibleMoveTurns（近似）: このターンの本文に主人公の到着完了が末尾付近で見えるか。
         タグの有無に関係なく数える＝出力**漏れ**（eligibleなのにタグ無し）を分母に含めるため。 */
      if (eligibleArrivalApprox(body)) session.eligibleMoveTurns++;
      var v = judge(lastRaw, body, { finish: lastFinish, hero: heroName(), rawBody: rawBodyOf(lastRaw) });
      if (v.hadTag){
        session.tagTurns++;
        if (v.accepted) session.accepted++; else session.rejected++;
        var row = {
          ts: new Date().toISOString(),
          slotId: slotId(),
          turnIndex: S.turns.length - 1,
          raw: v.tagRaw ? String(v.tagRaw).slice(0, MAX_RAW) : null,
          accepted: !!v.accepted,
          rejectReason: v.accepted ? null : v.reason,
          to: v.accepted ? v.to : null,      // 拒否時の to は幻覚の可能性がある文字列なので残さない
          evLen: v.evLen
        };
        if (v.extra) row.extra = v.extra;    // 無視した2件目以降
        if (lastFinish) row.finish = String(lastFinish);
        record(row);
        try { console.log(TAG, v.accepted ? ('accepted to=' + v.to) : ('rejected: ' + v.reason)); } catch(e){}
      }
      }
    } catch(e){ session.errors++; try { console.warn(TAG, 'judge err:', e && e.message); } catch(_){} }

    /* (b) 画面・保存からタグを剥がす。★turn.plan.narrative は触らない（一次証拠・話者タグと同じ扱い） */
    try {
      /* ★安全弁: 剥がした結果が空になるなら適用しない（本文を消すくらいならタグを残す方がまし）。
         renderNarr 側の二重ネットが画面表示だけは面倒を見る。 */
      if (narr && hasTag(narr) && body.replace(/[\s　]/g, '')){
        t.__f645nprev = narr;   // 退避（ロールバック可能）
        t.narrative = body;
        session.stripped++;
      }
    } catch(e){ session.errors++; }
  }

  function wrapSave(){
    var S = getS();
    if (!S || typeof S.save !== 'function') return false;
    if (S.__f645save){ wired.save = true; return true; }
    var os = S.save.bind(S);
    S.save = function(){
      try { processLastTurn(); } catch(e){ session.errors++; }
      return os.apply(this, arguments);
    };
    S.__f645save = true;
    wired.save = true;
    try { console.log(TAG, 'S.save wrap installed'); } catch(e){}
    return true;
  }

  // ===================================================================
  // 7. 二重ネット：UI.renderNarr（画面にタグ文字列を絶対に出さない）
  // ===================================================================
  function getUI(){ try { return G.UI || ((typeof UI !== 'undefined') ? UI : null); } catch(e){ return null; } }
  function wrapRender(){
    var U = getUI();
    if (!U || typeof U.renderNarr !== 'function') return false;
    if (U.__f645render){ wired.render = true; return true; }
    var orig = U.renderNarr;
    U.renderNarr = function(text){
      var t = text;
      try { if (!off() && hasTag(t)) t = strip(t); } catch(e){}
      return orig.call(this, t);
    };
    U.__f645render = true;
    wired.render = true;
    try { console.log(TAG, 'UI.renderNarr wrap installed (2nd net)'); } catch(e){}
    return true;
  }

  // ===================================================================
  // 8. 装着（他fixに奪われても取り返す。fetch だけは一度きり）
  // ===================================================================
  function install(){
    if (off()) return;
    try { wrapParse(); } catch(e){}
    try { wrapSave(); } catch(e){}
    try { wrapRender(); } catch(e){}
  }
  if (!off()) wrapFetch();     // ★fetch は「今すぐ・同期で」一度だけ
  install();
  try { G.setInterval(install, 2000); } catch(e){}

  // ===================================================================
  // 9. 読出口
  // ===================================================================
  function status(){
    var S = getS();
    return {
      off: off(), f647off: f647off(), prio: PRIO, wired: JSON.parse(JSON.stringify(wired)),
      slotId: slotId(), turns: (S && Array.isArray(S.turns)) ? S.turns.length : -1,
      marker: MARKER, sysChars: activeText().length,
      keeperRegistered: (function(){ try { return (G.__f379reg || []).some(function(r){ return r && r.marker === MARKER; }); } catch(e){ return false; } })(),
      keeperPrio: (function(){ try { var r = (G.__f379reg || []).filter(function(x){ return x && x.marker === MARKER; })[0]; return r ? r.prio : null; } catch(e){ return null; } })(),
      lastFinish: lastFinish, logged: readLog().length,
      session: JSON.parse(JSON.stringify(session))
    };
  }

  /* 実機コンソールで1行で確かめるための固定サンプル。通信しない・保存しない。 */
  var FIXTURES = [
    { name: 'accept',        body: '澪は廊下を抜け、厨房に入った。湯気が顔に触れた。',
      raw: '澪は廊下を抜け、厨房に入った。湯気が顔に触れた。\n<scene_move who="hero" to="厨房" ev="厨房に入った"/>', want: true },
    { name: 'ev-not-in-body', body: '澪は廊下で立ち止まった。',
      raw: '澪は廊下で立ち止まった。\n<scene_move who="hero" to="厨房" ev="厨房に入った"/>', want: false, reason: 'ev-not-in-body' },
    { name: 'ev-missing-to',  body: '澪は静かに中へ入った。',
      raw: '澪は静かに中へ入った。\n<scene_move who="hero" to="厨房" ev="静かに中へ入った"/>', want: false, reason: 'ev-missing-to' },
    { name: 'unrealized',     body: '澪は厨房に入ろうとしたが、足が止まった。',
      raw: '澪は厨房に入ろうとしたが、足が止まった。\n<scene_move who="hero" to="厨房" ev="厨房に入ろうとした"/>', want: false, reason: 'unrealized' },
    { name: 'no-arrival',     body: '澪は厨房の方を見た。',
      raw: '澪は厨房の方を見た。\n<scene_move who="hero" to="厨房" ev="厨房の方を見た"/>', want: false, reason: 'no-arrival-verb' },
    { name: 'who-not-hero',   body: '澪は厨房に入った。',
      raw: '澪は厨房に入った。\n<scene_move who="ミリア" to="厨房" ev="厨房に入った"/>', want: false, reason: 'who-not-hero' },
    { name: 'ambiguous',      body: '澪は厨房に入った。少しして、また厨房に入った。',
      raw: '澪は厨房に入った。少しして、また厨房に入った。\n<scene_move who="hero" to="厨房" ev="厨房に入った"/>', want: false, reason: 'ev-ambiguous' },
    { name: 'incomplete',     body: '澪は厨房に入った。',
      raw: '澪は厨房に入った。\n<scene_move who="hero" to="厨房" ev="厨房に入っ', want: false, reason: 'incomplete-tag' },
    { name: 'finish-length',  body: '澪は厨房に入った。', finish: 'length',
      raw: '澪は厨房に入った。\n<scene_move who="hero" to="厨房" ev="厨房に入った"/>', want: false, reason: 'finish-length' },
    { name: 'no-tag',         body: '澪は厨房に入った。', raw: '澪は厨房に入った。', want: null }
  ];
  function selfTest(){
    var out = { ok: true, cases: [] };
    for (var i = 0; i < FIXTURES.length; i++){
      var f = FIXTURES[i];
      var v = judge(f.raw, f.body, { finish: f.finish || null, hero: '澪' });
      var got = f.want === null ? (v.hadTag ? 'tag' : null) : v.accepted;
      var good = (f.want === null) ? (got === null) : (v.accepted === f.want && (f.want || v.reason === f.reason));
      if (!good) out.ok = false;
      out.cases.push({ name: f.name, accepted: v.accepted, reason: v.reason, pass: good });
    }
    out.strip = strip('本文。\n<scene_move who="hero" to="厨房" ev="厨房に入った"/>') === '本文。';
    if (!out.strip) out.ok = false;
    out.wired = JSON.parse(JSON.stringify(wired));
    return out;
  }

  G.__v292Dfix645 = {
    __armed: true,
    /* 純関数（テストから直接呼ぶ） */
    extractTags: extractTags, verify: verify, judge: judge, strip: strip, hasTag: hasTag,
    attrsOf: attrsOf, countOccurrences: countOccurrences, truncated: truncated,
    rawBodyOf: rawBodyOf, rawMatchesTurn: rawMatchesTurn,
    ARRIVE: ARRIVE, UNREAL: UNREAL, MAX_EV: MAX_EV, MAX_LOG: MAX_LOG, MAX_RAW: MAX_RAW,
    eligibleArrivalApprox: eligibleArrivalApprox,
    /* sys */
    MARKER: MARKER, text: textFn, TEXT: TEXT, TEXT_NEW: TEXT_NEW, TEXT_OLD: TEXT_OLD,
    PRIO: PRIO, isF647off: f647off,
    /* 記録 */
    log: readLog, clearLog: function(){ try { G.localStorage.removeItem(LOG); } catch(e){} return true; },
    LOG_KEY: LOG, stats: stats,
    /* 状態 */
    status: status, selfTest: selfTest, isOff: off, FIXTURES: FIXTURES,
    /* 装着（テスト・手動修復用） */
    _install: install, _wrapFetch: wrapFetch, _wrapParse: wrapParse, _wrapSave: wrapSave,
    _wrapRender: wrapRender, _processLastTurn: processLastTurn,
    _finishRing: function(){ return finishRing.slice(); }
  };
  try { if (!off()) console.log(TAG, 'ready (shadow only)'); } catch(e){}
})();
