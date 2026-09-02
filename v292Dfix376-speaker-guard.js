// =====================================================================
// Chronicle TRPG - v292Dfix376: 話者帰属の三段重ね強化（キャッチボール規則）
// 背景(2026-07-04 おしん):「会話ログのミス根治難しい？」
//   実例: SAYターンで少女の返答3連が全部アリア名義に。
//   真因: モデルが<say>タグ契約に違反し裸の「」を地の文に書く→タグゼロ判別器の
//   近接推測が直前話者(主人公)に倒れる。
// 三段構え:
//   [1] sys強化: 返答セリフの話者厳守+裸引用時は話者名明示（Planner.buildラップ）
//   [2] キャッチボール補正(本fix核心): SAYターンで
//       ・j>0(先頭=主人公の実発話fix193は不触)
//       ・who=主人公 かつ sayがplayerTextと不一致
//       ・sayが地の文に裸の「」で存在(=フォールバック由来。タグ由来は地の文に残らない契約)
//       ・このターンの他話者がちょうど1人
//       → その相手に振替。fix200bと同流儀でsave+カード再構築。
//   [3] 既存のタグ契約・3層判別器・fix200b後置修正はそのまま(最終保険が本fix)。
//   起動6秒後に全ターン一括修正(過去分も直る)→以後2sポーリングで新ターンを監視。
// OFF: localStorage v292Dfix376Off='1'
// ---------------------------------------------------------------------
// ★★fix799(2026-09-02) HISTORICAL CONVSAYS IMMUTABILITY
//   GPT裁定 out/GPT_RULING_3B2_3T_FIX376_FIX798_20260902.md (b)。
//   実測事故(CC_3B2_FIRST_WRITE_20260902.md §12.5 / turn7RootCause):
//     story smrj0rvnuup の既存 turn index 7 の _convSays[2]/[4].who が
//     「霧 涼太」→「藤堂 志乃」へ書き換わった。writer は本ファイル
//     fixTurn() の c.who = others[0]、駆動は pass() の全ターン sweep、永続化は
//     自己の S.saveC('fix376.pass')、発火は tick() の turns.length 変化検知。
//   下の fix495(B6) cede は index.html の load 順(fix376 :3502 / fix469 :3580)に
//   依存する arming race で素通りしうるため、**安全性の唯一の根拠にできない**
//   (GPT: cede 再評価だけの修正は REJECT)。よって fix469 の fix730 HISTORICAL-IMMUTABILITY と
//   **同じ意味の境界**を本 fix 自身が持つ:
//     baseTurns = 物語 load 時点の S.turns.length を固定。i < baseTurns(凍結済み)は
//     非 dry では**読みもしない・write 0**。dry は分類ログ(status().historicalWould)のみ。
//     story/slot 切替で再固定(fix469 :771-780 / fix489 :121-130 と同型の 3 重検知)。
//   fix469 は baseTurns を公開していない(closure 変数・輸出に getter 無し)ため同じ規則を
//   独立に計算する—— fix489 がすでに同じ独立計算をしている先例に倣う。
//   cede(fix495 B6) は残す。kill switch v292Dfix376Off は不変。
//   観測口: window.__v292Dfix376x.status() = { baseTurns, historicalSkipped, rewritten,
//   historicalWould, resets, off }(memory only ・ localStorage/save に一切書かない)。
// ---------------------------------------------------------------------
// ★★fix800(2026-09-02) BOUNDARY HOIST — hero.name 空でも境界を武装する
//   実測(out/CC_FIX799_LIVE_ACCEPT_QA_20260902.md §5): QA story smtg00ynsv1 は
//   S.cast.hero.name === '' のため pass() の hero guard が **境界固定より先に**
//   return し、baseTurns が -1 のまま = fix799 の凍結境界が武装しない。
//   (rewrite 自体も起きないので事故ではないが、fix799 の「race に依存しない」意図に反し、
//    後から hero.name が入った瞬間に過去ターン全体が sweep 対象になりうる。)
//   対処: 境界固定(_slotGate + baseTurns)を hero.name 判定より**前**へ hoist し、
//   さらに install 時に _armBoundary() で 1 回固定する(pass() 側は fallback として残す)。
//   sweep(i < baseTurns) ・ cede(fix469) ・ kill(v292Dfix376Off) ・ status() は不変。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix376) return; window.__v292Dfix376 = true;
  var TAG = '[v292Dfix376:speakerGuard]';
  var MARK = '【話者厳守】';
  function off(){ try{ return localStorage.getItem('v292Dfix376Off')==='1'; }catch(e){ return false; } }
  /* ★fix550(2026-07-25・バッチ3): 台帳では『getSを持たない』と分類していたが**誤り**で、
     普通の getS を持っていた(台帳は正規表現による推定なので、移行前に必ず中身を見る)。
     正式API(fix539)を第一経路にし、従来の式はそのまま第二経路に残す。 */
  function getS(){
    try { var a = window.__chronicleGetState ? window.__chronicleGetState('fix376') : null; if (a) return a; } catch(e){}
    try{ if (window.S) return window.S; return (0,eval)('S'); }catch(e){ return null; }
  }
  function norm(s){ return String(s||'').replace(/[「」\s]/g,''); }

  /* ---- ★fix799: historical boundary(fix469 :745/:751-780/:825-826 ・ fix489 :94/:100-130/:143 と同型) ---- */
  var baseTurns = -1;                                   // load 時の S.turns.length(凍結境界)
  var _f799 = { historicalSkipped: 0, rewritten: 0, historicalWould: 0, resets: 0 };  // memory only
  function _activeStoreKey(){
    try { var a = JSON.parse(localStorage.getItem('chr6_active_slot') || 'null');
          if (a && a !== 'default') return 'chr6_slot_' + a; } catch(e){}
    return 'chr6';
  }
  var _lastSlotKey = null, _lastTurnsRef = null, _lastT0 = null;
  function _t0fp(S){ try { var t0 = S.turns[0]; return String((t0 && (t0.narrative || t0.text || '')) || '').slice(0, 80); } catch(e){ return ''; } }
  function _slotGate(S){
    // 物語/スロット切替の 3 重検知(キー / turns 配列の同一性 / turns[0] 指紋)。境界を再固定するだけ。
    var k = _activeStoreKey(), fp = _t0fp(S);
    var changed = (_lastSlotKey !== null && k !== _lastSlotKey) ||
                  (_lastTurnsRef !== null && S.turns !== _lastTurnsRef) ||
                  (_lastT0 !== null && fp !== _lastT0);
    if (changed){ baseTurns = -1; _f799.resets++;
      try { console.log(TAG, 'slot/story switch detected -> baseTurns reset'); } catch(e){} }
    _lastSlotKey = k; _lastTurnsRef = S.turns; _lastT0 = fp;
    return changed;
  }
  function _clone376(t){                                 // dry-run 専用の浅い控え(本体に触らない)
    if (!t) return null;
    return { inputType: t.inputType, playerText: t.playerText, narrative: t.narrative,
             _convSays: (t._convSays||[]).map(function(c){ return { who: c.who, say: c.say }; }) };
  }
  /* ★★fix800: install 時に境界を 1 回固定する(cast/hero に一切依存しない)。
     読むのは S.turns の**長さ**だけ。turn も localStorage も save も触らない。
     kill(v292Dfix376Off) 中は fix799 と同じく何もしない(baseTurns は -1 のまま)。 */
  function _armBoundary(){
    if (off()) return false;
    var S = getS();
    if (!S || !Array.isArray(S.turns) || !S.turns.length) return false;  // 空 turns では固定しない(pass() と同規則)
    _slotGate(S);
    if (baseTurns < 0) baseTurns = S.turns.length;
    try{ console.log(TAG, 'fix800 boundary armed at load: baseTurns=' + baseTurns); }catch(_){}
    return true;
  }
  if (!_armBoundary()) {   // 物語 load 前なら短時間だけ待つ(hookSys と同型)。以後は pass() が fallback。
    var bv = setInterval(function(){ if (_armBoundary()) clearInterval(bv); }, 250);
    setTimeout(function(){ clearInterval(bv); }, 30000);
  }

  // ---- [1] sys強化 ----
  function hookSys(){
    try {
      var P = (0,eval)('Planner');
      if (!P || typeof P.build !== 'function') return false;
      var ob = P.build;
      P.build = function(){
        var r = ob.apply(this, arguments);
        try {
          if (off()) return r;
          if (!r || typeof r.sys !== 'string') return r;
          if (r.sys.indexOf(MARK) >= 0) return r;
          r.sys += '\n' + MARK + '主人公が話しかけた直後の返答セリフは、返答した本人の<say 名前>タグで書く（主人公のタグに入れない）。万一セリフを地の文の「」で書く場合は、直前の文に必ずその話者の名前を書く。';
        } catch(e) {}
        return r;
      };
      return true;
    } catch(e) { return false; }
  }
  if (!hookSys()) {
    var hv = setInterval(function(){ if (hookSys()) clearInterval(hv); }, 1000);
    setTimeout(function(){ clearInterval(hv); }, 30000);
  }

  // ---- [2] キャッチボール補正 ----
  function fixTurn(t, heroName){
    if (!t || t.inputType !== 'SAY' || !Array.isArray(t._convSays) || !t.narrative) return 0;
    var cs = t._convSays;
    var others = [];
    for (var k = 0; k < cs.length; k++){
      var w = cs[k] && cs[k].who;
      if (w && w !== heroName && others.indexOf(w) < 0) others.push(w);
    }
    if (others.length !== 1) return 0; // 二者場面のみ(安全側)
    var pt = norm(t.playerText);
    var changed = 0;
    for (var j = 1; j < cs.length; j++){ // j=0は主人公の実発話(fix193)
      var c = cs[j];
      if (!c || c.who !== heroName || !c.say) continue;
      var ns = norm(c.say);
      if (!ns || ns === pt || (pt && pt.indexOf(ns) >= 0)) continue; // 本人発話は不触
      if (t.narrative.indexOf('「' + c.say + '」') < 0) continue;    // 裸引用由来のみ
      c.who = others[0]; changed++;
    }
    return changed;
  }
  function pass(dry){
    // fix495(B6): 話者補正はfix469(点数制)に一本化(fix462と同型のcede)。本fixは証拠なしで
    // 全ターンを振替え、469の凍結済みターンも上書きしてしまうため、469稼働時は退譲する。
    // sys注入([1]hookSys)は従来どおり生かす。
    /* ★fix799: 境界の固定は cede より**先**に行う。cede が arming race で素通りしても
       baseTurns は必ず確定させる(= race に依存しない)。getS()/_slotGate() は副作用なし。 */
    /* ★★fix800: hero guard を分割し、境界固定を hero.name 判定より**前**に置く。
       条件の集合は不変(sweep 到達条件は fix799 と同一)——順序だけを変える。 */
    var S = getS();
    if (!S || !Array.isArray(S.turns)) return 0;
    if (!S.turns.length) return 0;   /* fix469 repair() と同じ早期 return。空→投入を story 切替と誤認しないため(挙動不変: 旧コードも 0 回ループ) */
    _slotGate(S);
    if (baseTurns < 0) baseTurns = S.turns.length;
    if (!S.cast || !S.cast.hero || !S.cast.hero.name) return 0;   /* fix376 本来の hero guard(fix800 で境界固定の後ろへ移動) */
    try {
      if (window.__v292Dfix469 && window.__v292Dfix469.__armed && localStorage.getItem('v292Dfix469Off') !== '1') return 0;
    } catch(e){}
    var hero = S.cast.hero.name;
    var total = 0;
    for (var i = 0; i < S.turns.length; i++){
      /* ★★fix799 — HISTORICAL CONVSAYS IMMUTABILITY(fix469 :834-848 と同じ意味):
         凍結済みターンは非 dry では読みもしない(write 0)。dry は分類ログのみ数える。 */
      if (i < baseTurns){
        _f799.historicalSkipped++;
        if (dry) _f799.historicalWould += fixTurn(_clone376(S.turns[i]), hero);
        continue;
      }
      if (dry){
        total += fixTurn(_clone376(S.turns[i]), hero);   // dry-run: コピーで数えるだけ
      } else {
        total += fixTurn(S.turns[i], hero);
      }
    }
    if (!dry) _f799.rewritten += total;
    if (!dry && total){
      try { if (typeof S.save === 'function') (typeof S.saveC==='function'?S.saveC('fix376.pass'):S.save()); } catch(e){}
      try {
        var stream = document.getElementById('dialogue-stream');
        if (stream){
          var olds = stream.querySelectorAll('.v292-dlg-card');
          for (var k2 = olds.length - 1; k2 >= 0; k2--){ if (olds[k2].parentNode) olds[k2].parentNode.removeChild(olds[k2]); }
        }
        if (window.__v292Dfix66 && typeof window.__v292Dfix66.repair === 'function') window.__v292Dfix66.repair();
      } catch(e){}
      try{ console.log(TAG, 'reassigned ' + total + ' quote(s)'); }catch(_){}
    }
    return total;
  }
  window.__v292Dfix376x = { dryRun: function(){ return pass(true); }, run: function(){ return pass(false); },
    /* ★fix799: memory-only の観測口。localStorage も save も一切触らない。 */
    status: function(){ return { baseTurns: baseTurns, historicalSkipped: _f799.historicalSkipped,
      rewritten: _f799.rewritten, historicalWould: _f799.historicalWould, resets: _f799.resets, off: off() }; } };

  var lastLen = -1;
  function tick(){
    if (off()) return;
    try {
      var S = getS(); if (!S || !Array.isArray(S.turns)) return;
      if (S.turns.length !== lastLen){ lastLen = S.turns.length; pass(false); }
    } catch(e){}
  }
  setTimeout(function(){ tick(); setInterval(tick, 2000); }, 6000); // boot切替ウィンドウ回避(fix375流)
  try{ console.log(TAG, 'loaded', off()?'OFF':'ON'); }catch(_){}
})();
