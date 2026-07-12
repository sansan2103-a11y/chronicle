// =====================================================================
// Chronicle TRPG - v292Dfix448: 🎲ランダム生成中のローディング表示
// ---------------------------------------------------------------------
// おしん要望(2026-07-13):
//   「これランダム生成してるとき画面の真ん中に何か文字出て生成してる感じあればいいね」
//
// ■ 何をするか
//   🎲「AIでランダム生成（未入力の欄・数秒）」の **空欄補完リクエストが飛んでいる間だけ**、
//   画面中央にオーバーレイを出す。中身は「✨ 世界を組み立てています…」＋スピナー＋経過秒数。
//   成功・失敗・タイムアウトのいずれでも必ず消える。設定・トグル・確認ダイアログは増やさない
//   （おしんの製品哲学「不可視の自動化」= 表示だけ）。
//
// ■ 発火の検出(実コード読解で確定・推測なし)
//   採用: **XHR送信境界**。fix436:run() は
//       ensureNpcCards() → collectFields() → buildFillPrompt() → request() → xhr.send()
//   まで **同期** で走る(fix436:398-425)。したがって「🎲クリック」と「送信開始」は
//   同一tick = クリック直後にオーバーレイが出る。クリックを直接フックしないので
//   「送信が起きないのにオーバーレイだけ残る」事故が原理的に起きない。
//     - 開始: send の body が空欄補完の署名('## 埋めるべき空欄')を持つとき
//     - 再送: fix446 の再試行XHR(__f446retry) / fix447 の安全網XHR(__f447retry) も数える
//             ※fix446 の再試行は見出しを差し替える(fix446:75 ALT_HEAD)ので署名では捕まらない。
//               フラグで捕まえる。これらは元XHRの loadend より **前** に send される
//               (fix446:handleLoad 内から同期 send)ので、参照カウントが 0 に落ちて
//               チラつくことはない。
//     - 終了: 追跡中XHRの 'loadend'(load/error/abort/timeout すべてで発火)で参照カウント--。
//             0 になったら消す。
//   ⚠ UI.randomFill をラップしない: fix436 が 600ms×50回の keeper で
//     最外周を奪還し続ける(fix436:430-445)。上に被せると相互再ラップの
//     「ラッパー・ダンス」(fix419c の病)を再発させる。send境界なら無関係。
//
// ■ クリックを吸うか
//   **吸う**（scrim が全画面・pointer-events 有効）。理由:
//     - 生成中にユーザーが欄へ打つと fix436:applyFill の二重防御(DOM実値の再確認・fix436:274)が
//       「ユーザー入力あり」と判断してその欄を **書かずに捨てる** → 「埋まらない欄」が出て混乱する。
//     - 🎲の連打で run() が二重に走る(fix436 の BUSY は 50ms で解除される・fix436:441)。
//     - 生成中に「保存してゲーム開始」で設定を閉じられると fix418 の復元契約と競合する。
//   固まらないための逃げ道: ①参照カウント0で消える ②最終送信から60秒のウォッチドッグで強制撤去
//   ③Escapeキーで撤去(リクエストは止めない・表示だけ消す)。
//
// ■ z-index(実コードで確認)
//   index.html: #settingsOv=100 / #editOv=200 / v263toast=99999
//   fix138/fix145/fix406 のモーダル・トースト = 2147483646〜2147483647
//   → fix448 は **2147483000**。設定パネル(100)より確実に前面、かつ
//     致命的な確認モーダル(2147483646+)より下に置く(万一の閉じ込め回避)。
//
// 冪等: window.__v292Dfix448 (検証口を兼ねる) / DOMは id=v292f448ov の1個だけ
// OFF : localStorage v292Dfix448Off='1'(live評価。一切表示しない)
// 調整: v292Dfix448TimeoutMs (既定60000。ウォッチドッグの強制撤去まで)
// 読込: index.html 最後尾・**fix447 の直後**(?cb=v292Dfix448)
// ロールバック: scriptタグ削除 or OFFスイッチ
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix448) return;

  var TAG      = '[v292Dfix448:genLoading]';
  var SIG_USER = '## 埋めるべき空欄';    // fix436 の空欄補完プロンプト署名
  var OV_ID    = 'v292f448ov';
  var CSS_ID   = 'v292f448css';
  var SUB_ID   = 'v292f448sub';
  var EL_ID    = 'v292f448el';
  var Z        = 2147483000;
  var DEF_TIMEOUT = 60000;

  var TITLE    = '✨ 世界を組み立てています…';
  var SUB_MAIN = '書いた内容に合わせて、空いている欄をAIが埋めています';
  var SUB_RETRY= '応答を書き直しています…（もう少し）';

  var inflight = 0;   // 追跡中の空欄補完XHR数
  var startAt  = 0;
  var tickIv   = null;
  var watchdog = null;

  function off(){ try { return localStorage.getItem('v292Dfix448Off') === '1'; } catch(e){ return false; } }
  function timeoutMs(){
    try {
      var v = localStorage.getItem('v292Dfix448TimeoutMs');
      if (v){ var n = parseInt(v, 10); if (!isNaN(n) && n >= 500 && n <= 600000) return n; }
    } catch(e){}
    return DEF_TIMEOUT;
  }

  // ===================================================================
  // 対象識別
  // ===================================================================
  function isFillBody(s){
    if (typeof s !== 'string' || s.length < 40) return false;
    if (s.indexOf(SIG_USER) < 0) return false;
    if (s.indexOf('messages') < 0) return false;
    return true;
  }
  function isRetry(xhr){
    try { return !!(xhr && (xhr.__f446retry || xhr.__f447retry)); } catch(e){ return false; }
  }
  function isTracked(xhr, body){
    if (isRetry(xhr)) return true;                       // fix446/447 の再送
    return isFillBody(typeof body === 'string' ? body : '');
  }

  // ===================================================================
  // オーバーレイ DOM
  // ===================================================================
  function ensureStyle(doc){
    if (doc.getElementById(CSS_ID)) return;
    var st = doc.createElement('style');
    st.id = CSS_ID;
    st.textContent =
      '@keyframes v292f448spin{to{transform:rotate(360deg)}}' +
      '@keyframes v292f448fade{from{opacity:0}to{opacity:1}}' +
      '#' + OV_ID + '{position:fixed;inset:0;top:0;left:0;right:0;bottom:0;' +
        'display:flex;align-items:center;justify-content:center;' +
        'background:rgba(6,6,12,.72);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);' +
        'z-index:' + Z + ';animation:v292f448fade .18s ease-out;' +
        'font-family:inherit;color:#e8e8f4;padding:24px;box-sizing:border-box}' +
      '#' + OV_ID + ' .v292f448card{display:flex;flex-direction:column;align-items:center;gap:12px;' +
        'padding:26px 30px;border-radius:16px;background:rgba(26,26,42,.94);' +
        'border:1px solid rgba(138,138,255,.35);box-shadow:0 16px 48px rgba(0,0,0,.6),0 0 32px rgba(138,138,255,.12);' +
        'max-width:min(90vw,420px);text-align:center}' +
      '#' + OV_ID + ' .v292f448spin{width:34px;height:34px;border-radius:50%;' +
        'border:3px solid rgba(138,138,255,.22);border-top-color:#8a8aff;' +
        'animation:v292f448spin .9s linear infinite}' +
      '#' + OV_ID + ' .v292f448t{font-size:15px;font-weight:600;letter-spacing:.02em;line-height:1.5}' +
      '#' + OV_ID + ' .v292f448s{font-size:12px;color:#a8a8c8;line-height:1.6}' +
      '#' + OV_ID + ' .v292f448e{font-size:11px;color:#7a7a9a;font-variant-numeric:tabular-nums}' +
      '@media (prefers-reduced-motion: reduce){#' + OV_ID + ' .v292f448spin{animation-duration:2.4s}' +
        '#' + OV_ID + '{animation:none}}';
    (doc.head || doc.documentElement).appendChild(st);
  }

  function swallow(e){
    try { e.preventDefault(); } catch(_){}
    try { e.stopPropagation(); } catch(_){}
  }

  function build(doc){
    var ov = doc.createElement('div');
    ov.id = OV_ID;
    ov.setAttribute('role', 'status');
    ov.setAttribute('aria-live', 'polite');
    ov.setAttribute('aria-busy', 'true');
    ov.innerHTML =
      '<div class="v292f448card">' +
        '<div class="v292f448spin"></div>' +
        '<div class="v292f448t"></div>' +
        '<div class="v292f448s" id="' + SUB_ID + '"></div>' +
        '<div class="v292f448e" id="' + EL_ID + '">0秒</div>' +
      '</div>';
    // 文字列はDOM APIで入れる(innerHTML経由の混入を避ける)
    try { ov.querySelector('.v292f448t').textContent = TITLE; } catch(e){}
    try { ov.querySelector('.v292f448s').textContent = SUB_MAIN; } catch(e){}
    // 背面操作を防ぐ(生成中の入力/連打/設定クローズを止める)
    var evs = ['click', 'mousedown', 'pointerdown', 'touchstart', 'wheel'];
    for (var i = 0; i < evs.length; i++){
      try { ov.addEventListener(evs[i], swallow, true); } catch(e){}
    }
    return ov;
  }

  function elapsedText(){
    var sec = Math.max(0, Math.round((Date.now() - startAt) / 1000));
    return sec + '秒';
  }

  function show(){
    if (off()) return;
    try {
      var doc = document;
      if (!doc || !doc.body) return;
      var ov = doc.getElementById(OV_ID);
      if (!ov){                                   // 冪等: 1個だけ
        ensureStyle(doc);
        ov = build(doc);
        doc.body.appendChild(ov);
      }
      startAt = Date.now();
      setSub(SUB_MAIN);
      if (tickIv){ clearInterval(tickIv); tickIv = null; }
      tickIv = setInterval(function(){
        try {
          var e = document.getElementById(EL_ID);
          if (e) e.textContent = elapsedText();
        } catch(err){}
      }, 1000);
      armWatchdog();
      try { console.log(TAG, 'show'); } catch(e){}
    } catch(e){}
  }

  function setSub(text){
    try {
      var s = document.getElementById(SUB_ID);
      if (s) s.textContent = text;
    } catch(e){}
  }

  function hide(why){
    try {
      inflight = 0;
      if (tickIv){ clearInterval(tickIv); tickIv = null; }
      if (watchdog){ clearTimeout(watchdog); watchdog = null; }
      var ov = document.getElementById(OV_ID);
      if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
      if (ov) { try { console.log(TAG, 'hide', why || ''); } catch(e){} }
    } catch(e){}
  }

  function armWatchdog(){
    try {
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(function(){
        watchdog = null;
        try { console.warn(TAG, 'watchdog: force hide (timeout)'); } catch(e){}
        hide('timeout');
      }, timeoutMs());
    } catch(e){}
  }

  // Escape = 逃げ道(表示だけ消す。リクエストは止めない)
  try {
    document.addEventListener('keydown', function(e){
      try {
        if ((e.key === 'Escape' || e.keyCode === 27) && document.getElementById(OV_ID)) hide('escape');
      } catch(err){}
    }, true);
  } catch(e){}

  // ===================================================================
  // 参照カウント
  // ===================================================================
  function track(xhr){
    try {
      if (xhr.__f448t) return;                    // 同一XHRを二重に数えない
      xhr.__f448t = true;
      inflight++;
      if (inflight === 1) show();
      else armWatchdog();                          // 再送のたびにウォッチドッグを延長
      if (isRetry(xhr)) setSub(SUB_RETRY);         // fix446/447 の再送中は文言を切り替える

      var dec = function(){
        try {
          if (xhr.__f448done) return;
          xhr.__f448done = true;
          inflight--;
          if (inflight <= 0){ inflight = 0; hide('done'); }
        } catch(e){}
      };
      if (typeof xhr.addEventListener === 'function'){
        xhr.addEventListener('loadend', dec);      // load/error/abort/timeout すべてで発火
      } else {
        // 保険(loadend が無い実装): 状態監視
        var prev = xhr.onreadystatechange;
        xhr.onreadystatechange = function(){
          try { if (this.readyState === 4) setTimeout(dec, 0); } catch(e){}
          if (typeof prev === 'function') return prev.apply(this, arguments);
        };
      }
    } catch(e){}
  }

  // ===================================================================
  // 送信境界: XMLHttpRequest.prototype.send をラップ(fix447 の外側 = 最外周)
  //   body は読むだけ。**1バイトも書き換えない**。
  // ===================================================================
  function armSend(){
    try {
      if (typeof XMLHttpRequest === 'undefined' || !XMLHttpRequest.prototype) return false;
      var cur = XMLHttpRequest.prototype.send;
      if (typeof cur !== 'function') return false;
      if (cur.__f448) return true;
      var inner = cur;
      var w = function(body){
        try {
          if (!off() && isTracked(this, body)) track(this);
        } catch(e){}
        return inner.apply(this, arguments);
      };
      // fix419c教訓: 内側関数の own props を全継承(fix447/446/442 のフラグを消さない)
      try {
        var ks = Object.keys(inner);
        for (var i = 0; i < ks.length; i++){ try { w[ks[i]] = inner[ks[i]]; } catch(e){} }
      } catch(e){}
      w.__f448 = true;
      XMLHttpRequest.prototype.send = w;
      return true;
    } catch(e){ return false; }
  }

  armSend();
  (function keeper(){
    var ticks = 0;
    var iv = setInterval(function(){
      ticks++;
      try { armSend(); } catch(e){}
      if (ticks > 50) clearInterval(iv);            // 約30秒で停止(有限)
    }, 600);
    window.__v292Dfix448_stopKeeper = function(){ try { clearInterval(iv); } catch(e){} };
  })();
  try { console.log(TAG, 'armed', off() ? '(OFF)' : '(ON)'); } catch(e){}

  // ===================================================================
  // 検証口(冪等ガードを兼ねる)
  // ===================================================================
  window.__v292Dfix448 = {
    show: show,
    hide: hide,
    setSub: setSub,
    isFillBody: isFillBody,
    isTracked: isTracked,
    armSend: armSend,
    off: off,
    OV_ID: OV_ID,
    Z: Z,
    timeoutMs: timeoutMs,
    _state: function(){
      var s = false, vis = false;
      try { s = !!(XMLHttpRequest.prototype.send && XMLHttpRequest.prototype.send.__f448); } catch(e){}
      try { vis = !!document.getElementById(OV_ID); } catch(e){}
      return { sendArmed: s, visible: vis, inflight: inflight, off: off() };
    }
  };
})();
