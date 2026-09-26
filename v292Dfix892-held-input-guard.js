// =====================================================================
// v292Dfix892 — SAVE_INTEGRITY_HELD_INPUT_GUARD (B')
//   packet SAVE_INTEGRITY_P1_20260927_01 / GPT ruling = GO_WITH_FIXES (B = GO_WITH_HELD_PHASE_GUARD)
// ---------------------------------------------------------------------
// ■ 何を直すか（H-1r / CONFIRMED_RUNTIME, CONFIRMED_RUNTIME_LIVE）
//   fix705 は ?story= document の body key に起動直後から WRITE HOLD を張り、分類が成功した時だけ解除する。
//   HOLD 中（分類待ち・終端 STOP のどちらでも）に turn を進めると、画面には成功表示されるのに
//   S.save の書込みは HOLD で黙って捨てられ、reload で消える（local にも cloud にも残らない）。
// ■ 作用（1 つだけ）
//   fix705 の HOLD が効いている間は、G.submit / G.cont / G.retry を **生成を始める前に** 止める。
//     ・分類待ち（phase = init / held / classifying）… 「保存状態を確認しています」（一時的・自動で消える）
//     ・終端 STOP（phase = stopped）                  … 「今は安全に保存できません」＋［再読み込み］
//   turn が作られないので、「成功表示されたのに消える turn」は構造的に 0 になる。入力欄の文字は消さない。
// ■ 壊さない約束
//   ・fix705 の HOLD / 分類 / 通信 / release 条件に 1 バイトも触れない（status() を読むだけ）。
//   ・localStorage へ書かない。network 0。S.save を呼ばない（GPT 裁定: D = DEFER）。
//   ・fix705 が無い / OFF / story document でない / HOLD が張られていない → 何もしない（従来どおり）。
// ■ kill: localStorage['v292Dfix892Off']==='1' で完全停止（従来挙動）。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix892) return;
  var TAG = '[v292Dfix892:held-input-guard]';
  var NOTICE_ID = 'v292Dfix892-notice';
  var COPY_WAIT = '保存の準備を確認しています。数秒待ってから、もう一度送信してください。';
  var COPY_STOP = 'この物語は今は安全に保存できません。このまま進めても内容は残らないため、送信を止めています。'
                + '再読み込みしてください（必要ならログインしてから）。';
  function off(){ try { return localStorage.getItem('v292Dfix892Off') === '1'; } catch(e){ return false; } }
  function f705(){
    try { var F = window.__v292Dfix705; return (F && F.__armed === true && typeof F.status === 'function') ? F : null; }
    catch(e){ return null; }
  }
  /* 'stop' / 'wait' / null（止めない） */
  function holdKind(){
    if (off()) return null;
    var F = f705(); if (!F) return null;
    var s; try { if (!F.on()) return null; s = F.status(); } catch(e){ return null; }
    if (!s || !s.state || !s.storyId) return null;
    if (s.state.held !== true) return null;                 /* HOLD が無い = 書込みは通る */
    if (s.state.phase !== 'stopped') return 'wait';
    /* NETWORK 系 STOP でも fix840 の自動再試行が残っている間は「確認中」扱い（再読み込みを急かさない） */
    try { if (typeof F.f840 === 'function'){ var r = F.f840(); if (r && r.pending && !r.exhausted) return 'wait'; } } catch(e){}
    return 'stop';
  }
  var stats = { blockedWait: 0, blockedStop: 0, lastKind: null };

  function removeNotice(){ try { var n = document.getElementById(NOTICE_ID); if (n) n.parentNode.removeChild(n); } catch(e){} }
  function showNotice(kind){
    try {
      var n = document.getElementById(NOTICE_ID);
      if (n && n.getAttribute('data-kind') === kind) return;
      removeNotice();
      var d = document.createElement('div');
      d.id = NOTICE_ID; d.setAttribute('role', 'alert'); d.setAttribute('data-kind', kind);
      d.setAttribute('style', 'position:fixed;left:0;right:0;top:0;z-index:99998;'
        + (kind === 'stop' ? 'background:#4a2323;color:#ffe3e3;' : 'background:#2b3a4a;color:#e3efff;')
        + 'font-size:13px;line-height:1.6;padding:10px 12px;text-align:center;font-family:system-ui,sans-serif;');
      var t = document.createElement('span'); t.textContent = (kind === 'stop') ? COPY_STOP : COPY_WAIT; d.appendChild(t);
      if (kind === 'stop'){
        var b = document.createElement('button');
        b.textContent = '再読み込み';
        b.setAttribute('style', 'margin-left:10px;padding:3px 12px;border-radius:6px;border:1px solid #ffb3b3;background:#6a2e2e;color:#fff;cursor:pointer;');
        b.onclick = function(){ try { location.reload(); } catch(e){} };
        d.appendChild(b);
      }
      (document.body || document.documentElement).appendChild(d);
    } catch(e){}
  }

  /* G は index.html の top-level const（window.G ではない）。後から読む classic script からは名前で見える。 */
  function getG(){ try { return (typeof G !== 'undefined' && G) ? G : null; } catch(e){ return null; } }
  var wrapped = false;
  function wrapG(){
    if (wrapped) return true;
    var g = getG(); if (!g) return false;
    ['submit', 'cont', 'retry'].forEach(function(name){
      var orig = g[name];
      if (typeof orig !== 'function' || orig.__f892) return;
      var w = function(){
        var k = holdKind();
        if (k){
          if (k === 'stop') stats.blockedStop++; else stats.blockedWait++;
          try { console.warn(TAG, 'blocked', name, 'kind=' + k, '(fix705 HOLD: this turn could not be saved)'); } catch(e){}
          showNotice(k);
          return;
        }
        return orig.apply(this, arguments);
      };
      w.__f892 = true; w.__orig = orig;
      g[name] = w;
    });
    wrapped = true;
    return true;
  }

  /* 表示の追従: 終端 STOP になったら常設の警告を出す / HOLD が解けたら一時表示を消す。 */
  function stopErr(){ try { var F = f705(); return F ? String((F.status().state || {}).error || '') : ''; } catch(e){ return ''; } }
  function tick(){
    var k = holdKind();
    /* 409（STORY_LOCKED 等）は fix843/fix860 が自前の案内を出すので、常設表示は出さない（送信時だけ出す）。 */
    if (k === 'stop' && stopErr() !== 'CAPABILITY_409') showNotice('stop');
    else if (!k) removeNotice();                            /* HOLD が解けたら表示はすべて消す */
    stats.lastKind = k;
  }
  /* ---- load-order 保証（GPT SAVE_INTEGRITY_P1_20260927_02 条件 1）----
     本 script は <head> で fix705 の直後に同期ロードされる（index.html）。この時点では G も
     送信 UI もまだ存在しないので、UI の入口（送信ボタン / Enter / 続きを書く / やり直す）を
     document の capture 段で先に押さえる。これで「G.init() 済み・G の wrap 前」という窓でも、
     HOLD 中の送信は inline onclick に届く前に止まる。G.submit を直接呼ぶ経路は wrapG() が塞ぐ。 */
  var ENTRY_RE = /\bG\.(submit|cont|retry)\(/;
  function entryEl(t){
    try { var el = t && t.closest ? t.closest('[onclick]') : null;
          return (el && ENTRY_RE.test(el.getAttribute('onclick') || '')) ? el : null; } catch(e){ return null; }
  }
  function capBlock(ev, why){
    var k = holdKind(); if (!k) return false;
    try { ev.preventDefault(); ev.stopImmediatePropagation(); ev.stopPropagation(); } catch(e){}
    if (k === 'stop') stats.blockedStop++; else stats.blockedWait++;
    try { console.warn(TAG, 'blocked', why, 'kind=' + k, '(capture)'); } catch(e){}
    showNotice(k);
    return true;
  }
  try {
    document.addEventListener('click', function(ev){ if (entryEl(ev.target)) capBlock(ev, 'click'); }, true);
    document.addEventListener('keydown', function(ev){
      try {
        var t = ev.target;
        if (t && t.id === 'inp' && ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing && ev.keyCode !== 229) capBlock(ev, 'enter');
      } catch(e){}
    }, true);
  } catch(e){}
  try { document.addEventListener('DOMContentLoaded', function(){ try { wrapG(); } catch(e){} }); } catch(e){}

  var n = 0;
  (function boot(){
    n++;
    try { wrapG(); tick(); } catch(e){}
    if (n < 2400) setTimeout(boot, n < 240 ? 250 : 2000);
  })();

  window.__v292Dfix892 = {
    off: off, holdKind: holdKind,
    status: function(){ return { off: off(), wrapped: wrapped, kind: holdKind(), stats: JSON.parse(JSON.stringify(stats)),
                                 notice: (document.getElementById(NOTICE_ID) || {}).getAttribute ? document.getElementById(NOTICE_ID).getAttribute('data-kind') : null }; }
  };
  try { console.log(TAG, 'loaded (read-only on fix705 / kill=v292Dfix892Off=1)'); } catch(e){}
})();
