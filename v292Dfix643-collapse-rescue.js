/* v292Dfix643-collapse-rescue.js (2026-07-29)
 * ─ 崩壊ターンの救済生成（★既定は shadow ＝ 判定と記録だけ・挙動は変えない） ─
 *
 * ■何を直すのか
 *   fix624/fix626 は「1ターンの本文が日本語として崩れている」ことを**測れる**ところまで来た。
 *   だが測っているのは **保存が終わったあと**（fix624.sweep は S.turns を読む）なので、
 *   崩れた本文はすでにプレイヤーへ届き、ターン番号も進み、クラウドへも上がっている。
 *   本fixは判定を **保存の前** へ移し、hard（7点以上）のときだけ1回やり直す。
 *
 * ■配線位置（★根拠を残す。設計_fix643-644 と同内容）
 *   index.html G.submit の実際の順序は次のとおり（行番号は 2026-07-29 の現物）:
 *     1805  result = await Api.call(sys, user)          ← ★ここが介入点
 *     1809  if (!result) { 入力を復元して return }       ← ★falsy でターン不成立になる既存経路(fix263a2)
 *     1808  plan = Planner.parsePlan(result.text, S.mode)
 *     1861  PsychEngine.process(plan)                    ← fix77 等の状態更新はここから後ろ
 *     1988  const turn = {...}
 *     1993  S.turns.push(turn)
 *     1995  S.save()                                     ← クラウドpushもここから後ろ
 *     1996  UI.appendTurn(turn, S.turns.length - 1)
 *   つまり **Api.call の戻り値** が、turn 組み立て・S.turns.push・S.save・表示より前にある
 *   唯一の分岐点。fix555 が同じ場所（「Api.call の直後・Planner.parsePlan の前」）で
 *   本文を校正しており、実績のある観測点でもある。
 *   ★features.js は触らない。ラップだけで入る。
 *
 * ■どの Api.call が本編かの見分け方（実在する呼び出しを全部数えた）
 *   index.html:1725 genConvLog        Api.call(sys2,user2,500,{...})   4引数
 *   index.html:1749 attribQuotes218   Api.call(sys2,user2,400,{...})   4引数
 *   index.html:1805 本編              Api.call(sys, user)              2引数 ★
 *   index.html:1828 再掲/短文の書き直し Api.call(sys, user+'…')          2引数 ★
 *   features.js:988 / 1826            Api.call(pr.sys,pr.user,2400/1000) 3引数
 *   → **maxTok を渡さない呼び出しだけが本編**。sys の文言で見分ける方式は
 *     新エンジン(fix417c)で sys が空文字になる経路があるため採らない。
 *
 * ■処置（live のときだけ）
 *   1回目 hard → 救済生成を1回だけ。**壊れた本文はモデルへ渡さない**。異常コードだけを
 *   user の末尾へ短く足す（fix216/fix235 が既にやっている作法と同じ。sys は触らないので
 *   fix482/fix192 の sys 経路を壊さない）。
 *   2回目も hard → Api.call は **null を返す**。submit は 1809 の既存ガードで
 *   「入力を復元して return」する＝ターンは1つも増えず、S.save も走らない。
 *   そのうえで案内バナーを出す。操作は3つ:
 *     ・もう一度試す      … ユーザー起点の新規生成（自動の3回目ではない）
 *     ・入力を直す        … 入力欄へ戻すだけ
 *     ・最初の文章を確認する … 誤検出の逃げ道。保持していた1回目の候補を**通信せずに**採用し、
 *                            outcome='user-accepted' として記録する
 *
 * ■落とし穴（テストで固定してある）
 *   ①ターン数を増やさない ②入力欄を空にしない ③却下した試行で fix77/fix190/longmem を更新しない
 *   ④hard候補をクラウドへ push しない ⑤ボタン連打で並列生成しない ⑥ページ復帰で勝手に再生成しない
 *   ⑦同じ失敗で無限再生成しない（救済は1submitにつき最大1回）
 *   ①〜④は「Api.call が null を返すと parsePlan より前で return する」という
 *   1つの事実から自動的に従う。個別に細工していない。
 *
 * ■記録（★本文は1バイトも保存しない。score と hits のコードだけ）
 *   localStorage `v292Dfix643_log` … {ts, slotId, turnIndex, score, hits, mode, outcome}
 *
 * 冪等: window.__v292Dfix643
 * OFF : localStorage v292Dfix643Off='1'
 * 実弾: localStorage v292Dfix643Live='1'（★これが無い端末は shadow ＝ 記録だけ）
 * 読出: window.__v292Dfix643.status() / .selfTest() / .log() / .clearLog()
 */
(function v292Dfix643(){
  'use strict';
  if (window.__v292Dfix643 && window.__v292Dfix643.__armed) return;
  var TAG = '[v292Dfix643:collapse-rescue]';
  var LOG = 'v292Dfix643_log';
  var MAX_LOG = 40;
  var MAX_HITS = 6;

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix643Off') === '1'; }
  function live(){ return lsg('v292Dfix643Live') === '1'; }

  function getState(){
    try { var g = window.__chronicleGetState; if (typeof g === 'function'){ var a = g('fix643'); if (a) return a; } } catch(e){}
    try { if (window.S) return window.S; } catch(e){}
    try { return (0,eval)('typeof S!=="undefined"?S:null'); } catch(e){ return null; }
  }
  function slotId(){
    try {
      var k = (typeof window.__chr6Key === 'function') ? window.__chr6Key() : 'chr6';
      return String(k || 'chr6').replace(/^chr6_slot_/, '') || 'chr6';
    } catch(e){ return 'chr6'; }
  }

  /* ================= 本文の取り出し =================
     ★fix553f が実機で確かめた規則をそのまま使う（生の応答は JSON ではなく
       「素の本文 + <say>/<state>/<react> タグ」。<react|<state の手前までが本文）。
       取り出せなければ **判定しない**（測れないものを崩壊と呼ばない）。 */
  function bodyOf(raw){
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return null;
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    try { var j = JSON.parse(s); if (j && Array.isArray(j.narrative)) return j.narrative.join('\n'); } catch(e){}
    var m = s.match(/"narrative"\s*:\s*\[([\s\S]*?)\]/);
    if (m){ try { var a = JSON.parse('[' + m[1] + ']'); if (Array.isArray(a)) return a.join('\n'); } catch(e2){} }
    var body = s.split(/<react|<state/)[0];
    if (body && body.replace(/<[^>]*>/g, '').trim().length >= 40) return body;
    return null;
  }

  /* ================= 会話カードの代用 =================
     fix624 の判定は「会話カードの激減」を副次シグナルに使うが、
     `_convSays` が出来るのは **この時点より後**（submit の後半）なので使えない。
     新エンジンの契約では全ての台詞が <say> タグに入り、その <say> は
     `turn.plan.narrative` に残る（fix640 の実測 165/165）。
     → いまの応答も過去のターンも **同じ物差し（<say> の数）** で測る。
     ★台詞タグを使わない物語では過去も現在も 0 になり、cardAvg=0 ＝この副次シグナルは
       自動的に無効になる。片側だけ 0 になって毎ターン「カード0」が立つ事故は起きない。
     ★fix624.sweep（_convSays を数える）とは分母が違うので、点数が1〜2点ずれることがある。
       shadow の記録はこの層の物差しでの値である。 */
  function sayCount(text){
    try { return (String(text || '').match(/<say\b[^>]*>/g) || []).length; } catch(e){ return 0; }
  }
  function narrativeOfTurn(t){
    var pn = t && t.plan && t.plan.narrative;
    if (Array.isArray(pn)) return pn.join('\n');
    if (typeof pn === 'string') return pn;
    var n = t && t.narrative;
    return Array.isArray(n) ? n.join('\n') : String(n == null ? '' : n);
  }
  function cardContext(st){
    var turns = (st && Array.isArray(st.turns)) ? st.turns : [];
    var from = Math.max(0, turns.length - 8);
    var n = 0, total = 0;
    for (var i = from; i < turns.length; i++){
      var s = narrativeOfTurn(turns[i]);
      if (!s) continue;
      total += sayCount(s); n++;
    }
    return { cardAvg: n ? (total / n) : 0, samples: n };
  }

  /* ================= 異常コード =================
     ★fix624/fix626 の hits 名（日本語）を、モデルへ渡せる短いコードへ写すだけ。
       新しい検出器は作らない（判定の正本は fix624 ひとつ）。 */
  var CODE = {
    '反復': 'repetition-loop',
    'ルビ過多': 'ruby-abuse',
    '自問自答': 'self-dialogue',
    '人称混在': 'person-mix',
    '長すぎる文': 'over-long-sentence',
    '平均文長': 'long-sentences',
    '助詞が少ない': 'register-collapse',
    '読点が少ない': 'punctuation-drop',
    'ダッシュ乱用': 'dash-abuse',
    'カード0': 'dialogue-missing',
    'カード激減': 'dialogue-missing'
  };
  function codesOf(hits){
    var out = [];
    for (var i = 0; i < (hits || []).length; i++){
      var w = hits[i] && hits[i].w;
      if (!w || w.charAt(0) === '(') continue;      /* 「(流暢なので…取消)」等の注記は渡さない */
      var c = CODE[w] || 'degeneration';
      if (out.indexOf(c) < 0) out.push(c);
    }
    return out;
  }

  /* ================= 判定（fix624 を唯一の正として呼ぶ） ================= */
  function judgeRaw(raw, st){
    var body = bodyOf(raw);
    if (body == null) return { measurable: false };
    var f = null;
    try { f = window.__v292Dfix624; } catch(e){}
    if (!f || typeof f.scoreTurn !== 'function') return { measurable: false, noProbe: true };
    var cc = cardContext(st);
    var cards = sayCount(body);
    var r;
    try { r = f.scoreTurn({ narrative: body, _convSays: new Array(cards) }, { cardAvg: cc.cardAvg }); }
    catch(e){ return { measurable: false, threw: true }; }
    return {
      measurable: true, score: r.score, level: r.level, hard: r.level === 'hard',
      hits: (r.hits || []).map(function(h){ return h.w; }).slice(0, MAX_HITS),
      codes: codesOf(r.hits), cards: cards, cardAvg: cc.cardAvg
    };
  }

  /* ================= 救済生成の追加指示 =================
     ★壊れた本文は渡さない。異常コードだけ。sys は触らない（user の末尾へ足す＝fix216/235 と同じ作法）。 */
  function rescueSuffix(codes){
    return '\n\n【重要・書き直し】直前の生成は文章として崩れていた（異常コード: ' +
      ((codes && codes.length) ? codes.join(', ') : 'degeneration') + '）。' +
      '前の出力は参照せず、同じ場面をはじめから普通の日本語で書き直すこと。' +
      '同じ語句や同じ文を連続で繰り返さない。助詞を省略しない。' +
      '1文を長くしすぎず、読点で区切って読める文章にすること。';
  }

  /* ================= 記録 ================= */
  var stats = { judged: 0, hard: 0, rescued: 0, rescueOk: 0, blocked: 0, accepted: 0,
                unmeasurable: 0, secondary: 0, errors: 0, wrapped: false, submitWrapped: false };
  function readLog(){ try { var a = JSON.parse(lsg(LOG) || '[]'); return Array.isArray(a) ? a : []; } catch(e){ return []; } }
  function record(rec){
    try {
      var a = readLog();
      a.push(rec);
      localStorage.setItem(LOG, JSON.stringify(a.slice(-MAX_LOG)));
    } catch(e){ stats.errors++; }
  }
  function logRow(v, outcome, mode, note){
    var st = getState();
    var row = {
      ts: new Date().toISOString(),
      slotId: slotId(),
      turnIndex: (st && Array.isArray(st.turns)) ? st.turns.length : -1,   /* この生成が入る予定のターン番号 */
      score: (v && v.measurable) ? v.score : null,
      hits: (v && v.measurable) ? (v.codes || []) : [],
      mode: mode,
      outcome: outcome
    };
    if (note) row.note = note;
    return row;
  }

  /* ================= 保持と再入ガード ================= */
  var depth = 0;            /* 多重ラップされても1回だけ働く */
  var callSeq = 0;          /* 1submit の中の本編呼び出し番号 */
  var rescueUsed = false;   /* ★救済は1submitにつき最大1回 */
  var pendingInput = '';    /* submit 入口で控えたプレイヤー入力 */
  var held = null;          /* { result, input, view } … hard候補（メモリだけ・保存しない） */
  var accept = null;        /* 「最初の文章を確認する」で次の本編呼び出しへ返す候補 */
  var busy = false;         /* ボタン連打ガード */

  /* ================= 案内バナー ================= */
  var BANNER_ID = 'v643banner';
  function removeBanner(){
    try { var e = document.getElementById(BANNER_ID); if (e && e.parentNode) e.parentNode.removeChild(e); } catch(e){}
  }
  function inputEl(){ try { return document.getElementById('inp'); } catch(e){ return null; } }
  function getG(){
    try { if (window.G) return window.G; } catch(e){}
    try { return (0,eval)('typeof G!=="undefined"?G:null'); } catch(e){ return null; }
  }
  function inFlight(){ var st = getState(); return !!(st && st.inFlight); }

  function restoreInput(text){
    var el = inputEl();
    if (!el) return;
    try { if (text && !String(el.value || '').trim()) el.value = text; } catch(e){}
  }
  function runSubmit(){
    /* ★連打ガード: 自分の busy と S.inFlight の両方を見る（submit 側にも同じ関門がある） */
    if (busy || inFlight()) return false;
    var g = getG();
    if (!g || typeof g.submit !== 'function') return false;
    busy = true;
    var p = null;
    try { p = g.submit(); } catch(e){ busy = false; stats.errors++; return false; }
    try { Promise.resolve(p).catch(function(){}).then(function(){ busy = false; accept = null; }); }
    catch(e){ busy = false; }
    return true;
  }

  function mkBtn(label, fn){
    var b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'background:#5a4a86;color:#fff;border:0;border-radius:8px;padding:6px 12px;' +
                      'cursor:pointer;flex:none;font-size:13px';
    b.addEventListener('click', function(){ try { fn(); } catch(e){ stats.errors++; } });
    return b;
  }
  function showBanner(){
    try {
      if (!document.body) return;
      removeBanner();
      var box = document.createElement('div');
      box.id = BANNER_ID;
      box.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:99999;' +
        'background:#2a1f3a;color:#e8e0ff;border:1px solid #6a5a9a;border-radius:10px;padding:10px 14px;' +
        'font-size:13px;max-width:88vw;box-shadow:0 4px 16px rgba(0,0,0,.5);display:flex;gap:8px;' +
        'align-items:center;flex-wrap:wrap';
      var msg = document.createElement('span');
      msg.textContent = '文章が崩れたので、このターンは確定していません。入力はそのまま残してあります。';
      box.appendChild(msg);
      box.appendChild(mkBtn('もう一度試す', function(){
        removeBanner();
        restoreInput(held && held.input);
        runSubmit();
      }));
      box.appendChild(mkBtn('入力を直す', function(){
        removeBanner();
        restoreInput(held && held.input);
        try { var el = inputEl(); if (el && typeof el.focus === 'function') el.focus(); } catch(e){}
      }));
      box.appendChild(mkBtn('最初の文章を確認する', function(){
        if (!held) { removeBanner(); return; }
        removeBanner();
        var el = inputEl();
        try { if (el) el.value = held.input || (el.value || ''); } catch(e){}
        accept = held;                       /* ★通信せずに保持していた候補を採用する */
        if (!runSubmit()) accept = null;
      }));
      document.body.appendChild(box);
    } catch(e){ stats.errors++; }
  }

  /* ================= Api.call を包む ================= */
  function getApi(){
    try { if (window.Api) return window.Api; } catch(e){}
    try { if (typeof Api !== 'undefined' && Api) return Api; } catch(e){}
    try { return (0,eval)('typeof Api!=="undefined"?Api:null'); } catch(e){ return null; }
  }
  /* ★本編の呼び出しだけを対象にする（上のコメントの呼び出し一覧が根拠）。 */
  function isMainCall(args){
    return args.length <= 2 || args[2] === undefined || args[2] === null;
  }

  function installApi(){
    var api = getApi();
    if (!api || typeof api.call !== 'function') return false;
    if (api.call.__f643){ stats.wrapped = true; return true; }
    var prev = api.call;

    var wrapped = async function(){
      var args = arguments;
      if (depth > 0 || off() || !isMainCall(args)) return prev.apply(this, args);
      depth++;
      try {
        /* ---- 「最初の文章を確認する」の再送: 通信せずに保持していた候補を返す ---- */
        if (accept){
          var h = accept; accept = null; held = null;
          stats.accepted++;
          record(logRow(h.view, 'user-accepted', live() ? 'live' : 'shadow', 'user-accepted-hard-candidate'));
          return h.result;
        }

        var seq = ++callSeq;
        var st = getState();
        var result = await prev.apply(this, args);
        if (!result || typeof result.text !== 'string') return result;

        var v = judgeRaw(result.text, st);
        var mode = live() ? 'live' : 'shadow';

        if (!v.measurable){
          stats.unmeasurable++;
          record(logRow(v, 'skip-unmeasurable', mode));
          return result;
        }
        stats.judged++;
        if (!v.hard){
          record(logRow(v, 'pass', mode));
          return result;
        }
        stats.hard++;

        /* ---- shadow: 判定と記録だけ。**一切ブロックしない** ---- */
        if (!live()){
          record(logRow(v, 'hard-observed', 'shadow'));
          return result;
        }
        /* ---- 2本目以降の本編呼び出し(fix216/235の書き直し)は観測だけ ---- */
        if (seq > 1 || rescueUsed){
          stats.secondary++;
          record(logRow(v, 'hard-secondary', 'live'));
          return result;
        }

        /* ---- 救済生成（★1回だけ・壊れた本文は渡さない） ---- */
        rescueUsed = true;
        stats.rescued++;
        try { if (window.UI && typeof window.UI.setStatus === 'function') window.UI.setStatus('文章の崩れを検知 → 書き直し中…'); } catch(e){}

        var a2 = [args[0], String(args[1] == null ? '' : args[1]) + rescueSuffix(v.codes)];
        for (var i = 2; i < args.length; i++) a2.push(args[i]);
        var result2 = await prev.apply(this, a2);
        var v2 = (result2 && typeof result2.text === 'string') ? judgeRaw(result2.text, st) : { measurable: false };

        if (!v2.measurable || !v2.hard){
          stats.rescueOk++;
          record(logRow(v2.measurable ? v2 : v, 'regen-ok', 'live'));
          return result2 && typeof result2.text === 'string' ? result2 : result;
        }

        /* ---- 2回目も hard → ターン不成立で停止 ---- */
        stats.blocked++;
        record(logRow(v2, 'regen-hard', 'live'));
        held = { result: result, input: pendingInput, view: v };     /* ★保持は最初の候補（メモリだけ） */
        showBanner();
        try {
          setTimeout(function(){
            try { if (window.UI && typeof window.UI.setStatus === 'function')
                    window.UI.setStatus('文章の崩れを検知しました。ターンは確定していません', true); } catch(e){}
          }, 0);
        } catch(e){}
        return null;      /* ★index.html:1809 の `if (!result)` が入力を戻して return する */
      } catch(e){
        stats.errors++;
        throw e;          /* 例外は握り潰さない */
      } finally { depth--; }
    };
    wrapped.__f643 = true;
    try { Object.keys(prev).forEach(function(k){ if (k !== '__f643') wrapped[k] = prev[k]; }); } catch(e){}
    api.call = wrapped;
    stats.wrapped = true;
    return true;
  }

  /* ================= G.submit を包む（入力の控えと、1ターン分の状態リセットだけ） ================= */
  function installSubmit(){
    var g = getG();
    if (!g || typeof g.submit !== 'function') return false;
    if (g.submit.__f643){ stats.submitWrapped = true; return true; }
    var prev = g.submit;
    var wrapped = function(){
      try {
        if (!accept){ held = null; removeBanner(); }
        callSeq = 0; rescueUsed = false;
        var el = inputEl();
        var t = el ? String(el.value == null ? '' : el.value).trim() : '';
        if (t) pendingInput = t;
      } catch(e){ stats.errors++; }
      return prev.apply(this, arguments);
    };
    wrapped.__f643 = true;
    try { Object.keys(prev).forEach(function(k){ if (k !== '__f643') wrapped[k] = prev[k]; }); } catch(e){}
    g.submit = wrapped;
    stats.submitWrapped = true;
    return true;
  }

  /* ================= 取り付け ================= */
  function install(){ var a = installApi(), b = installSubmit(); return a && b; }
  if (!install()){
    var tries = 0;
    try {
      var iv = setInterval(function(){ tries++; if (install() || tries > 120) clearInterval(iv); }, 250);
    } catch(e){}
  }
  /* ★fix333/fix555 が後から Api.call を包み直すと印が消える。見張って包み直す
     （depth ガードがあるので多重でも1回しか働かない）。★ページ復帰で生成はしない。 */
  try { setInterval(function(){ try { install(); } catch(e){} }, 3000); } catch(e){}

  /* ================= 読み出し ================= */
  function status(){
    var st = getState();
    return {
      off: off(), mode: live() ? 'live' : 'shadow',
      wrapped: stats.wrapped, submitWrapped: stats.submitWrapped,
      probe: !!(window.__v292Dfix624 && typeof window.__v292Dfix624.scoreTurn === 'function'),
      slotId: slotId(),
      turns: (st && Array.isArray(st.turns)) ? st.turns.length : -1,
      pending: !!held, busy: busy, rescueUsed: rescueUsed,
      logged: readLog().length,
      stats: JSON.parse(JSON.stringify(stats))
    };
  }
  function selfTest(){
    var f = window.__v292Dfix624;
    var d = { probe: !!(f && typeof f.scoreTurn === 'function'), wired: stats.wrapped && stats.submitWrapped };
    if (d.probe){
      var F = f._fixtures || {};
      /* 崩壊2種は hard、正常2種は通ることを、この層の入力形（生の応答文字列）で確かめる。
         ★語調崩壊(B型)は fix624 でも「会話カードの激減」を足して7点に届く型なので、
           台詞タグが続いていた物語を分母として与える（実物と同じ条件にする）。 */
      var say3 = '<say who="a">「あ」</say>\n<say who="b">「い」</say>\n<say who="c">「う」</say>';
      var st = { turns: [ { plan: { narrative: [say3] } }, { plan: { narrative: [say3] } },
                          { plan: { narrative: [say3] } }, { plan: { narrative: [say3] } } ] };
      d.repLoopHard = !!judgeRaw(F.repLoop, st).hard;
      d.registerHard = !!judgeRaw(F.registerCollapse, st).hard;
      d.normalAPass = judgeRaw(F.normalA, st).hard === false;
      d.normalBPass = judgeRaw(F.normalB, st).hard === false;
      d.streamNotHard = judgeRaw(F.streamOfConsciousness, st).hard === false;
      d.noBodyInPrompt = rescueSuffix(['repetition-loop']).indexOf(String(F.repLoop).slice(0, 20)) < 0;
    }
    d.ok = !!(d.probe && d.wired && d.repLoopHard && d.registerHard &&
              d.normalAPass && d.normalBPass && d.streamNotHard && d.noBodyInPrompt);
    return d;
  }

  window.__v292Dfix643 = {
    __armed: true,
    /* 判定 */
    bodyOf: bodyOf, sayCount: sayCount, cardContext: cardContext,
    codesOf: codesOf, judgeRaw: judgeRaw, rescueSuffix: rescueSuffix,
    /* 記録 */
    log: readLog, clearLog: function(){ try { localStorage.removeItem(LOG); } catch(e){} return true; },
    LOG_KEY: LOG,
    /* 状態 */
    status: status, selfTest: selfTest, isOff: off, isLive: live,
    stats: function(){ return JSON.parse(JSON.stringify(stats)); },
    held: function(){ return held ? { input: held.input, score: held.view && held.view.score,
                                      hits: (held.view && held.view.codes) || [] } : null; },
    _install: install, _showBanner: showBanner, _removeBanner: removeBanner
  };
  try { if (!off()) console.log(TAG, 'ready (' + (live() ? 'LIVE' : 'shadow') + ')'); } catch(e){}
})();
