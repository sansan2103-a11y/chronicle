// =====================================================================
// v292DfixFLW3 — 最初の場面のあと、入力の種類（DO/SAY/STORY）を元に戻す（laneFLOWFIX・GPT #127-OW FLOW「意図しない STORY 切替」）
//
// ■何が起きていたか（laneFLOW 本番点検 2026-11-01・ライト／コアの 2 本とも）
//   index.html の G.startScene()（「▶ 物語を始める」）は、幕開けの指示を STORY として送るために
//     this.setMode('STORY'); this.submit();
//   としているが、G.cont()（続きを書く）と違って **終わったあと元の種類に戻していない**。
//   そのため最初の場面のあと、入力欄が「📖 STORY 描写」のまま残り、プレイヤーが次に書く行動が
//   「描写の方向」として送られていた。S.mode は保存されるので、開き直しても STORY のまま。
//
// ■このファイルがやること（2 つだけ・表示と入力の種類だけ）
//   (1) G.startScene を包む。startScene が同期で呼ぶ this.submit() の Promise を 1 回だけ受け取り、
//       それが終わったとき（＝最初のターンが記録された後。G.cont() と同じ順序）に、入力の種類がまだ STORY なら
//       startScene を押す前の種類（ふつうは DO）へ G.setMode で戻す。プレイヤーが途中で種類を押していたら何もしない。
//       ・幕開けの送信そのもの（STORY で送る・本文・保存）は 1 バイトも変えない。
//       ・submit の一時差し替えは startScene の同期区間だけ。区間を出るときに必ず元の関数へ戻す。
//   (2) 開き直したとき：ターンが 1 つだけ・それが幕開け（inputType STORY・本文が「物語の幕開け。」で始まる）・
//       今の種類が STORY、のときだけ、表示上の種類を DO にする（G.setMode）。保存はしない（次のターンの保存で反映される）。
//
// ■やらないこと
//   ・S.save / localStorage への書き込み・通信・AI 呼び出しは 0。
//   ・「✨展開を提案」（fix138 submitAsStory）の STORY 切替は対象外（プレイヤーが明示的に選んだ案なので別判断）。
//
// ■lane82（bundle82・GPT #127-PC「生成待ち中にプレイヤーが手で種類を変えたら上書きしない」）:
//   幕開けの生成中にプレイヤーが種類のボタン（.mdbtn）を 1 回でも押したら、最後に STORY を選び直していても戻さない（USER_TAPPED）。
//   見るのはボタンのクリックだけ（document の capture・読むだけ）。
// ■82b（独立レビュー MID-1）: 幕開けの生成が失敗したとき（ターンが増えない・最後のターンが幕開けでない）は戻さない（STORY のまま）。
//   失敗すると index.html が幕開けの指示を入力欄へ戻すので、DO に戻すと次の送信で指示が「行動」として送られてしまうため。
//
// kill: localStorage v292DfixFLW3Off='1' → 包まない・何もしない（従来どおり STORY のまま残る）。
// 検証口: window.__v292DfixFLW3.status()
// =====================================================================
(function(){
  'use strict';
  if (typeof window === 'undefined' || window.__v292DfixFLW3) return;
  var TAG = '[v292DfixFLW3:opening-mode]';
  var VER = '20261101-flowfix-a+l82tap+82b';
  function off(){ try { return localStorage.getItem('v292DfixFLW3Off') === '1'; } catch(e){ return false; } }
  var st = { ver: VER, installed: false, tries: 0, starts: 0, captured: 0, notStarted: 0, restored: 0, kept: {}, bootFixed: 0, bootSkip: null, last: null };
  function kept(why){ st.kept[why] = (st.kept[why] || 0) + 1; st.last = { what: 'kept', why: why, t: Date.now() }; }
  function getG(){ try { return (typeof G !== 'undefined' && G) ? G : null; } catch(e){ return null; } }
  function getS(){ try { return (typeof window.__chronicleGetState === 'function') ? window.__chronicleGetState('flw3') : null; } catch(e){ return null; } }
  var OPEN_RE = /^物語の幕開け。/;
  var lastTap = 0;   /* lane82: 最後にプレイヤーが種類のボタンを押した時刻 */
  try { document.addEventListener('click', function(ev){ try { var t = ev.target && ev.target.closest && ev.target.closest('.mdbtn'); if (t) lastTap = Date.now(); } catch(e){} }, true); } catch(e){}

  function restoreAfter(G0, prev, waited, t0, turns0){
    try {
      var S1 = getS();
      if (!S1) return kept('NO_STATE');
      /* 別の送信（もう一度押した等）がまだ走っているなら、それが終わるまで待つ（その送信の inputType を変えない）。最大 180 秒 */
      if (S1.inFlight){ waited = (waited || 0) + 1; if (waited > 360) return kept('STILL_IN_FLIGHT'); st.waits = (st.waits || 0) + 1; setTimeout(function(){ restoreAfter(G0, prev, waited, t0, turns0); }, 500); return; }
      if (t0 && lastTap >= t0) return kept('USER_TAPPED');                       /* lane82: 生成中に種類を押した → 最後の選択がどれでも触らない */
      if (S1.mode !== 'STORY') return kept('USER_CHANGED_' + String(S1.mode));      /* 途中で種類を押した → そのまま */
      var T1 = Array.isArray(S1.turns) ? S1.turns : [], tl = T1[T1.length - 1] || {};   /* 82b: 幕開けのターンが本当に増えたときだけ戻す */
      if (typeof turns0 !== 'number' || T1.length <= turns0 || tl.inputType !== 'STORY' || !OPEN_RE.test(String(tl.playerText || ''))) return kept('NO_OPENING_TURN');
      if (!prev || prev === 'STORY') return kept('PREV_STORY');                   /* もともと STORY を選んでいた → そのまま */
      if (typeof G0.setMode !== 'function') return kept('NO_SETMODE');
      G0.setMode(prev);
      st.restored++; st.last = { what: 'restored', to: prev, t: Date.now() };
      try { console.log(TAG, 'opening done — input mode STORY → ' + prev); } catch(e){}
    } catch(e){ kept('ERROR'); }
  }

  function install(){
    st.tries++;
    if (off()) return true;                                          /* kill: 包まない */
    var G0 = getG();
    if (!G0 || typeof G0.startScene !== 'function') return false;
    if (G0.startScene.__flw3) { st.installed = true; return true; }
    var orig = G0.startScene;
    var w = function(){
      if (off()) return orig.apply(this, arguments);
      var self = this || G0; var t0 = Date.now();
      var Sx = getS(); var turns0 = (Sx && Array.isArray(Sx.turns)) ? Sx.turns.length : null;
      var S0 = getS();
      var prev = S0 ? S0.mode : null;
      var real = self.submit;
      var p = null, taken = false;
      st.starts++;
      if (typeof real === 'function'){
        self.submit = function(){ self.submit = real; taken = true; p = real.apply(this, arguments); return p; };
      }
      var r;
      try { r = orig.apply(this, arguments); }
      finally { if (!taken && typeof real === 'function') { try { self.submit = real; } catch(e){} } }
      if (!taken){ st.notStarted++; return r; }                       /* 包んだ先（fix912 等）が止めた → 何もしない */
      st.captured++;
      if (p && typeof p.then === 'function') p.then(function(){ restoreAfter(G0, prev, 0, t0, turns0); }, function(){ restoreAfter(G0, prev, 0, t0, turns0); });
      else restoreAfter(G0, prev, 0, t0, turns0);
      return r;
    };
    w.__flw3 = true; w.__orig = orig;
    G0.startScene = w;
    st.installed = true;
    return true;
  }

  function bootFix(){
    try {
      if (off()) { st.bootSkip = 'KILL'; return; }
      var G0 = getG(), S0 = getS();
      if (!G0 || !S0 || !Array.isArray(S0.turns)) { st.bootSkip = 'NOT_READY'; return; }
      if (S0.turns.length !== 1) { st.bootSkip = 'TURNS_' + S0.turns.length; return; }
      if (S0.mode !== 'STORY') { st.bootSkip = 'MODE_' + String(S0.mode); return; }
      var t0 = S0.turns[0] || {};
      if (t0.inputType !== 'STORY' || !OPEN_RE.test(String(t0.playerText || ''))) { st.bootSkip = 'NOT_OPENING'; return; }
      if (typeof G0.setMode !== 'function') { st.bootSkip = 'NO_SETMODE'; return; }
      G0.setMode('DO');                                               /* 表示と入力の種類だけ（保存しない） */
      st.bootFixed++; st.bootSkip = null; st.last = { what: 'bootFixed', t: Date.now() };
    } catch(e){ st.bootSkip = 'ERROR'; }
  }

  (function wait(n){
    if (install()) {
      /* G.init（S.load → setMode(S.mode)）が終わった後に 1 回だけ見る（engine boot は同期で G.init → 'chr:engine-booted'） */
      var eb = window.__chrEngineBoot;
      if (eb && eb.__ran === true) setTimeout(bootFix, 0);
      else { try { window.addEventListener('chr:engine-booted', function(){ setTimeout(bootFix, 0); }, { once: true }); } catch(e){} }
      return;
    }
    if (n < 80) setTimeout(function(){ wait(n + 1); }, 250);
  })(0);

  window.__v292DfixFLW3 = { status: function(){ var o = JSON.parse(JSON.stringify(st)); o.off = off(); return o; }, off: off };
  try { console.log(TAG, 'loaded', VER); } catch(e){}
})();
