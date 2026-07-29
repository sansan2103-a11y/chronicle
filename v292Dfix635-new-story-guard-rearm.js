/* v292Dfix635-new-story-guard-rearm.js (2026-07-29)
 * ─ 新しい物語の保存ガード（fix600）が**一度も武装していなかった**のを直す ─
 *
 * ■何が起きていたか（静的に確定・2026-07-29 の監査）
 *   fix600 は 2026-07-27 の事故
 *     「＋ 新しい物語を始める → 別の物語（澪）の主人公・NPC・20ターンがそのまま入っていた」
 *   を止めるために作られた。ところが本体の2箇所が
 *       var S = window.S;            // memTurns()
 *       var S = window.S; ... S.save // wrapSave()
 *   と **window.S** を読んでいる。このページの `S` は index.html の
 *   **トップレベル const**（`window.S` は永久に undefined）。
 *   → memTurns() は常に -1、wrapSave() は常に false を返し、
 *     120回のポーリングのあと「S.save を包めませんでした」で終わる。
 *   ＝**保存を止める処理は一度も動いていない。**
 *   これは fix333i / fix336 が既に踏んだのと**同じ型のバグ**（fix336 の冒頭コメント参照）。
 *
 * ■このfixがやること（fix600 は1バイトも触らない）
 *   fix600 と**まったく同じ条件**で S.save を包み直すだけ。判定基準も文言も変えない。
 *     ・`?new=1` が無ければ何もしない（既存の物語には一切影響しない）
 *     ・ディスク上のこの物語が「無い or 0ターン」
 *     ・なのにメモリ上の物語が 2ターン以上ある
 *   → このときだけ保存を**通さない**。消さない・上書きしない・書かせないだけ。
 *   新品の物語が1回の保存で2ターン以上になることはあり得ないので、
 *   これは「別の物語の中身を抱えている」ことの決定的な証拠になる（fix600 の設計そのまま）。
 *
 * ■このfixがやらないこと
 *   ・window.S を生やさない（生やすと features.js の休眠モジュールが一斉に目覚めて
 *     モデルへ渡る文脈が変わる。範囲を広げない）
 *   ・fix600 を無効化しない（両方が包んでも、条件を満たさなければ双方素通し）
 *
 * 冪等: window.__v292Dfix635 / S.__f635
 * OFF : localStorage v292Dfix635Off='1'（v292Dfix600Off='1' でも止まる＝逃げ道は2つ）
 * 読出: window.__v292Dfix635.state() / .shouldBlock() / .selfTest()
 */
(function v292Dfix635(){
  'use strict';
  if (window.__v292Dfix635 && window.__v292Dfix635.__armed) return;
  var TAG = '[v292Dfix635:new-story-guard-rearm]';
  var ACT = 'chr6_active_slot';

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix635Off') === '1' || lsg('v292Dfix600Off') === '1'; }

  /* ★fix539 の正式API を第一経路にする（window.S は見ない＝見ても意味が無い）。
     以降は index.html が fix539 より古いキャッシュのときだけ通る後方互換。 */
  function note539(reason, err){
    try { if (window.__chronicleState && typeof window.__chronicleState.note === 'function')
            window.__chronicleState.note('fix635', reason, err); } catch(e){}
  }
  function getState(){
    var g = null;
    try { g = window.__chronicleGetState; } catch(e){}
    if (typeof g === 'function'){
      try { var a = g('fix635'); if (a) return a; } catch(e){ note539('getter-threw', e); }
    } else { note539('getter-missing'); }
    try { if (window.S){ note539('rescued-by-window'); return window.S; } } catch(e){}
    try { var u = (0,eval)('typeof S!=="undefined"?S:null');
          if (u){ note539('rescued-by-eval'); return u; }
          note539('legacy-eval-null'); }
    catch(e){ note539('legacy-eval-threw', e); }
    return null;
  }

  function param(name){
    try {
      var m = String(location.search || '').match(new RegExp('[?&]' + name + '=([^&#]+)'));
      return m ? decodeURIComponent(m[1]) : null;
    } catch(e){ return null; }
  }
  function isNewUrl(){ return param('new') === '1'; }
  function storyIdOfUrl(){ return param('story'); }

  /* ディスク上のこの物語のターン数（無ければ -1）— fix600 と同じ実装 */
  function diskTurns(id){
    if (!id) return -1;
    var raw = lsg('chr6_slot_' + id);
    if (raw == null) return -1;
    try {
      var o = JSON.parse(raw);
      var a = (o && (o.turns || o.log || o.history)) || [];
      return (Object.prototype.toString.call(a) === '[object Array]') ? a.length : 0;
    } catch(e){ return 0; }
  }
  /* メモリ上の物語のターン数（分からなければ -1）— ★ここだけが fix600 との違い */
  function memTurns(){
    try {
      var st = getState();
      if (!st) return -1;
      var a = st.turns || st.log || st.history;
      return (Object.prototype.toString.call(a) === '[object Array]') ? a.length : -1;
    } catch(e){ return -1; }
  }

  var state = { armed: false, wrapped: false, storyId: null, blocked: 0, lastWhy: null, tripped: false };

  function shouldBlock(){
    if (off()) return null;
    if (!state.armed) return null;
    var d = diskTurns(state.storyId);
    if (d > 0) return null;                 /* もう自前の中身がある＝新品ではない。以後は通常運転 */
    var m = memTurns();
    if (m < 2) return null;                 /* 0→1 は新品の正常な1手目。ここは絶対に止めない */
    return { diskTurns: d, memTurns: m };
  }

  function notice(){
    try {
      sessionStorage.setItem('chr6_home_notice',
        'この新しい物語に別の物語の内容が入り込んだため、保存を止めました。' +
        '物語画面のタブを1つだけにして、もう一度「＋ 新しい物語を始める」からやり直してください。');
    } catch(e){}
  }

  function wrapSave(){
    try {
      var st = getState();
      if (!st || typeof st.save !== 'function' || st.__f635) return false;
      var inner = st.save.bind(st);
      st.save = function(){
        var hit = shouldBlock();
        if (hit){
          state.blocked++;
          state.tripped = true;
          state.lastWhy = hit;
          try {
            console.error(TAG, '別の物語の内容を新しい物語へ保存しようとしたので止めました。',
                          JSON.stringify({ storyId: state.storyId, disk: hit.diskTurns, memory: hit.memTurns }));
            console.error(TAG, '物語画面のタブを1つだけにして、ホームからやり直してください。');
          } catch(e){}
          notice();
          return;                            /* ★書かない。消しも上書きもしない */
        }
        return inner.apply(this, arguments);
      };
      /* ★fix419c の教訓: 内側関数の own props を全継承する（他fixのフラグを消さない） */
      try { for (var p in inner){ if (!(p in st.save)){ try { st.save[p] = inner[p]; } catch(e){} } } } catch(e){}
      st.__f635 = true;
      state.wrapped = true;
      try { console.log(TAG, 'armed (storyId=' + state.storyId + ')'); } catch(e){}
      return true;
    } catch(e){ return false; }
  }

  function boot(){
    if (off()){ try { console.log(TAG, 'off'); } catch(e){} return; }
    if (!isNewUrl()) return;                 /* ★new=1 が無ければ何もしない */
    var id = storyIdOfUrl();
    if (!id) return;
    state.armed = true;
    state.storyId = id;

    /* 共有ポインタのずれ直しは fix600 が起動時に実施済み。二重に書かず、
       ずれていた場合だけ整える（fix600 が OFF の運用でも守りが残るように）。 */
    try {
      var want = JSON.stringify(id);
      if (lsg(ACT) !== want){
        try { console.warn(TAG, '共有ポインタがこの物語と違ったので直しました:', String(lsg(ACT)).slice(0, 24)); } catch(e){}
        localStorage.setItem(ACT, want);
      }
    } catch(e){}

    (function poll(){
      poll._n = (poll._n || 0) + 1;
      if (wrapSave()) return;
      if (poll._n > 120){ try { console.warn(TAG, 'S.save を包めませんでした'); } catch(e){} return; }
      setTimeout(poll, 250);
    })();
  }

  /* ★生存証明: 「包めた／条件判定が動く」を実機のコンソールから1行で確かめる */
  function selfTest(){
    return {
      armed: state.armed, wrapped: state.wrapped, off: off(),
      storyId: state.storyId,
      diskTurns: diskTurns(state.storyId),
      memTurns: memTurns(),
      stateReachable: !!getState(),
      wouldBlockNow: shouldBlock()
    };
  }

  window.__v292Dfix635 = {
    __armed: true,
    isNewUrl: isNewUrl, storyIdOfUrl: storyIdOfUrl,
    diskTurns: diskTurns, memTurns: memTurns,
    shouldBlock: shouldBlock, wrapSave: wrapSave,
    getState: getState,
    state: function(){ return JSON.parse(JSON.stringify(state)); },
    selfTest: selfTest, isOff: off
  };
  boot();
})();
