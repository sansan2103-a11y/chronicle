/* v292Dfix600-new-story-guard.js (2026-07-27) — 新しい物語に別の物語が入り込むのを止める
 *
 * ■実際に起きた事故（2026-07-27・PC）
 *   ホームで「＋ 新しい物語を始める」→ 新しい物語のはずなのに、
 *   **別の物語（澪の物語）の主人公・NPCがそのまま入っていた**。
 *   コンソールの記録:
 *       [fix525] active slot moved by another tab (smrg85jwsn6); saving to own slot sms37m8r0ae
 *       [fix527] blocked active-slot rewrite: "smrg85jwsn6" (this tab owns sms37m8r0ae)
 *       [fix228] スロット激減検知: chr6_slot_sms37m8r0ae turns 20→0
 *   → 新しい物語のスロットへ、一度**別の物語の20ターンがまるごと書かれていた**。
 *
 * ■原因
 *   「いまどの物語を開いているか」は chr6_active_slot という**全タブ共有の1個**。
 *   fix527 は自タブの書き換えを封じるが、**別タブが書いた値は素通りする**（localStorage は共有）。
 *   さらに fix525 は保存のたびにこのポインタを自分の id へ差し替えて戻す（同期ブロック内）。
 *   その一瞬に別タブの features.js が起動して読むと、**別の物語を読み込んでしまう**。
 *   ★つまり成立条件は「物語画面のタブが2つ以上開いていること」。1タブでは起きない。
 *
 * ■この段でやること（範囲を極端に狭く取る）
 *   `?new=1` で開かれた物語**だけ**を対象に、次を満たしたら保存を止める:
 *       ・ディスク上のこの物語が「無い or 0ターン」
 *       ・なのにメモリ上の物語に1ターン以上ある
 *   新品の物語が1回の保存で2ターン以上になることはあり得ないので、
 *   これは「別の物語の中身を抱えている」ことの決定的な証拠になる。
 *   ★既存の物語には**一切影響しない**（new=1 が無ければ何もしない）。
 *   ★消さない・上書きしない。**書かせないだけ**。作り直せばよい物語なので損失はない。
 *
 * 冪等: window.__v292Dfix600 / OFF: localStorage.v292Dfix600Off='1'
 */
(function v292Dfix600(){
  if (window.__v292Dfix600) return;
  var TAG = '[v292Dfix600:new-story-guard]';
  var ACT = 'chr6_active_slot';

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix600Off') === '1'; }

  function param(name){
    try {
      var m = String(location.search || '').match(new RegExp('[?&]' + name + '=([^&#]+)'));
      return m ? decodeURIComponent(m[1]) : null;
    } catch(e){ return null; }
  }
  function isNewUrl(){ return param('new') === '1'; }
  function storyIdOfUrl(){ return param('story'); }

  /* ディスク上のこの物語のターン数（無ければ -1） */
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
  /* メモリ上（いま画面が持っている）物語のターン数（分からなければ -1） */
  function memTurns(){
    try {
      var S = window.S;
      if (!S) return -1;
      var a = S.turns || S.log || S.history;
      return (Object.prototype.toString.call(a) === '[object Array]') ? a.length : -1;
    } catch(e){ return -1; }
  }

  var state = { armed: false, storyId: null, blocked: 0, lastWhy: null, tripped: false };

  /* ★この保存を止めるべきか。止める条件は上の1つだけ。 */
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
      var S = window.S;
      if (!S || typeof S.save !== 'function' || S.__f600) return false;
      var inner = S.save.bind(S);
      S.save = function(){
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
      try { for (var p in inner){ if (!(p in S.save)){ try { S.save[p] = inner[p]; } catch(e){} } } } catch(e){}
      S.__f600 = true;
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

    /* ★起動時点でポインタがずれていたら直す（別タブが書いた値を読ませない） */
    try {
      var want = JSON.stringify(id);
      if (lsg(ACT) !== want){
        try { console.warn(TAG, '共有ポインタがこの物語と違ったので直しました:', String(lsg(ACT)).slice(0, 24)); } catch(e){}
        localStorage.setItem(ACT, want);
      }
    } catch(e){}

    /* S が現れ次第 save を包む（features.js より前に読み込まれても効くように待つ） */
    (function poll(){
      poll._n = (poll._n || 0) + 1;
      if (wrapSave()) return;
      if (poll._n > 120) { try { console.warn(TAG, 'S.save を包めませんでした'); } catch(e){} return; }
      setTimeout(poll, 250);
    })();
  }

  window.__v292Dfix600 = {
    __armed: true,
    isNewUrl: isNewUrl,
    diskTurns: diskTurns,
    memTurns: memTurns,
    shouldBlock: shouldBlock,
    state: function(){ return JSON.parse(JSON.stringify(state)); },
    isOff: off
  };
  boot();
})();
