// =====================================================================
// Chronicle TRPG - v292Dfix645: scene_move タグの shadow 収集（⑤位置引き継ぎ 第一歩）
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
//   window.__f379reg へ prio3 で1ブロック登録する。Planner._extensions は**死に経路**
//   （fix377/fix414/fix416/fix427 のヘッダに実測記録あり）なので使わない。
//   prio3 にした理由: keeper の予算(prio2/3 で 1,600字)が逼迫したとき、**最初に落ちるのが
//   この実験ブロック**になる＝品質ブロックを押し出さない。
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
  // 1. sys ブロック（keeper prio3）
  // ===================================================================
  var MARKER = '【移動タグ】';
  var TEXT = '\n' + MARKER
    + '主人公が移動を完了し、ターン終了時の居場所が変わった場合だけ、本文の後に '
    + '<scene_move who="hero" to="到着地点" ev="本文からの抜粋"/> を1つだけ出力する。'
    + 'evは本文から一字も変えずに抜き出す。移動の予定・未遂・回想・視線だけの移動、'
    + '居場所が変わらない動作では出力しない。迷ったら出さない。'
    + '物語本文を優先し、タグのために本文を短くしない。該当しなければタグは完全に省略する。';

  function textFn(){ return off() ? '' : TEXT; }   // OFF は keeper の off キーでも効くが二重に止める

  var wired = { keeper: false, fetch: false, parsePlan: false, save: false, render: false };

  (function registerKeeper(){
    try {
      G.__f379reg = G.__f379reg || [];
      var reg = G.__f379reg;
      for (var i = 0; i < reg.length; i++){ if (reg[i] && reg[i].marker === MARKER){ wired.keeper = true; return; } }
      reg.push({ off: 'v292Dfix645Off', marker: MARKER, prio: 3, text: textFn });
      wired.keeper = true;
      try { console.log(TAG, 'keeper registered (prio3, ' + TEXT.length + ' chars)'); } catch(e){}
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

    var b = String(body == null ? '' : body);
    var n = countOccurrences(b, ev);
    if (n === 0){
      /* 生でだけ一致する＝fix175/fix427 の後処理で本文がズレた分。幻覚とは別物なので別カウント。 */
      var rb = String(opts.rawBody == null ? '' : opts.rawBody);
      res.reason = (rb && countOccurrences(rb, ev) > 0) ? 'ev-not-in-final-body' : 'ev-not-in-body';
      return res;
    }
    if (n > 1){ res.reason = 'ev-ambiguous'; return res; }
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

  var session = { turnsObserved: 0, tagTurns: 0, accepted: 0, rejected: 0, stripped: 0,
                  rawMismatch: 0, errors: 0 };

  function stats(){
    var a = readLog(), byReason = {}, acc = 0;
    for (var i = 0; i < a.length; i++){
      if (a[i] && a[i].accepted) acc++;
      else { var r = (a[i] && a[i].rejectReason) || 'unknown'; byReason[r] = (byReason[r] || 0) + 1; }
    }
    return {
      turnsObserved: session.turnsObserved,          // このセッションで見たターン数
      tagTurns: a.length,                            // タグが出たターン数（記録ベース・上限100件内）
      accepted: acc,
      rejected: a.length - acc,
      byReason: byReason,
      acceptRate: a.length ? Math.round(acc / a.length * 1000) / 10 : null,   // %
      session: JSON.parse(JSON.stringify(session)),
      wired: JSON.parse(JSON.stringify(wired)),
      off: off(),
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
      off: off(), wired: JSON.parse(JSON.stringify(wired)),
      slotId: slotId(), turns: (S && Array.isArray(S.turns)) ? S.turns.length : -1,
      marker: MARKER, sysChars: TEXT.length,
      keeperRegistered: (function(){ try { return (G.__f379reg || []).some(function(r){ return r && r.marker === MARKER; }); } catch(e){ return false; } })(),
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
    /* sys */
    MARKER: MARKER, text: textFn, TEXT: TEXT,
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
