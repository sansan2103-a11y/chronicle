// =====================================================================
// v292Dfix846 ACCESS_GATE_USER_NOTICE_V1（lane: C1 CLOUD CANONICAL / blocker B-8）
//
// 目的:
//   worker が access gate（allow-list / access code）で 401・403 を返したとき、
//   利用者に 1 行だけ知らせる。これまで画面には何も出ず、新規ユーザーは
//   「保存も同期も静かに効かない」状態を原因不明のまま体験していた。
//   （worker: checkAuth → 403「このGoogleアカウント(...)はまだ許可されていません」/ 401 unauthorized）
//
// 契約（これを外さない。fix843 の契約をそのまま踏襲する）:
//   ・**UI だけ**。write / retry / HOLD / releaseHold / 認証の判断を 1 つも変えない。
//   ・既存モジュールを 1 バイトも書き換えない。本 module は **read-only observer**。
//     公開済みの診断口（fix705.ledger / fix697.ledger）だけを読む。
//   ・fetch / XMLHttpRequest の wrapper を **作らない**（新 wrapper は禁止事項）。
//   ・localStorage / sessionStorage へ 1 バイトも書かない。network 追加 0。
//   ・資格情報（token / passcode / session id / Authorization）は読まない・出さない。
//     表示するのは本人が設定画面で既に見ている自分の Google メールアドレスだけで、
//     それも fix328 の公開口 __chronicleGoogleEmail() 経由でしか取らない。
//   ・**HTTP status を実際に伴う AUTH 停止だけ**を対象にする。
//     fix705 は「ローカル未ログイン」でも stop('AUTH', {detail:...}) を出すが、
//     そちらは status を持たないので拾わない（誤報の根治）。
//   ・ログインゲート（#g250-gate）が出ている間は出さない。ゲートが既に説明している。
//   ・NETWORK は fix840、CLASS B/C 409 は fix843、Google 失効は fix835/837/841 が担当。混ぜない。
//   ・原因コードは title 属性にだけ載せる（本文は 1 行）。
//   ・fix840 / fix843 の告知が既に出ているときは重ならないよう下へずらす。
//
// 検証口: window.__v292Dfix846 = { BUILD, off, state, detect, check }
// kill switch: localStorage v292Dfix846Off='1'（既定 ON）
//
// ★sp24 / H-1 SAVE_FAILURE_VISIBILITY（GPT裁定 PKT-20260926-RRDY-01 §1、RCA rca_H1.md §2/§5）:
//   (1) fix697 の ledger kind の照合を `C_GETSTORY_HTTP_401/403` / `C2_GETSTORY_HTTP_401/403`
//       （canonical 保存経路の fresh getstory preflight が実際に出す kind）にも広げた。
//       旧 regex は `HTTP_` / `C_HTTP_` / `C2_HTTP_` しか拾わず、turn 4 の canonical 保存が
//       403 で止まっても本 module は一度も発火しなかった（実測 defect）。
//   (2) 3 分の polling 上限（60 tick × 3 s）を撤廃し、document の生存中は同じ 3 s 周期で
//       監視を続ける。選択理由: 「save mark が増えたら tick を再始動する」案より差分が小さく、
//       read-only の ledger 走査 1 回/3 s は無視できる負荷（fix758 は既に 5 s 周期で常時 poll）。
//       出したら止める（state.shown で終了）契約は従来どおり。
//   (3) 文言の主語を「保存」にする（「クラウドに保存できていません。…」）。
//       ローカル保持を確認していない状態で「データはこの端末に保持されています」とは言わない
//       （裁定: 「データは安全です」相当の断定を出さない）。
//   契約（UI only / read-only observer / wrapper 0 / storage write 0 / network 0）は不変。
//   rollback = 本ファイルを live bytes（20260914-fix846）へ戻すだけ。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix846) return;
  var TAG = '[v292Dfix846:access-gate-notice]';
  var BUILD = '20260926-sp24';
  var NOTICE_ID = 'v292Dfix846-notice';
  var F840_NOTICE_ID = 'v292Dfix840-notice';
  var F843_NOTICE_ID = 'v292Dfix843-notice';
  var GATE_ID = 'g250-gate';

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix846Off') === '1'; }

  /* ---- 分類。403 = 許可されていない / 401 = 認証が通っていない。 ---- */
  function kindOf(status){
    var s = +status;
    if (s === 403) return 'NOT_ALLOWED';
    if (s === 401) return 'UNAUTHORIZED';
    return null;
  }

  var state = { shown: false, kind: null, status: null, source: null, checks: 0 };

  /* ---- 観測（すべて read-only。例外は握りつぶして観測を止めない） ---- */

  /* fix705: stop('AUTH', {status: 401|403}) のときだけ。
     stop('AUTH', {detail:'not logged in'}) / {detail:'NOT_LOGGED_IN'} は status を持たないので
     ここを通らない = ローカル未ログインを access gate と取り違えない。 */
  function fromF705(){
    try {
      var A = window.__v292Dfix705;
      if (!A || typeof A.ledger !== 'function') return null;
      var L = A.ledger() || [];
      for (var i = L.length - 1; i >= 0; i--){
        var r = L[i];
        if (!r || r.stop !== 'AUTH') continue;
        if (typeof r.status !== 'number') continue;
        var k = kindOf(r.status);
        if (k) return { kind: k, status: r.status, source: 'fix705' };
      }
    } catch(e){}
    return null;
  }

  /* fix697: note({kind:'HTTP_'+status | 'C_HTTP_'+status | 'C2_HTTP_'+status, errorCode})
     ★sp24/H-1: canonical 経路の preflight が出す 'C_GETSTORY_HTTP_'+status / 'C2_GETSTORY_HTTP_'+status も拾う。 */
  var HTTP_KIND_RE = /^(?:C_|C2_)?(?:GETSTORY_)?HTTP_(401|403)$/;
  function fromF697(){
    try {
      var A = window.__v292Dfix697;
      if (!A || typeof A.ledger !== 'function') return null;
      var L = A.ledger() || [];
      for (var i = L.length - 1; i >= 0; i--){
        var r = L[i];
        if (!r || typeof r.kind !== 'string') continue;
        var m = HTTP_KIND_RE.exec(r.kind);
        if (!m) continue;
        var k = kindOf(m[1]);
        if (k) return { kind: k, status: +m[1], source: 'fix697:' + r.kind };
      }
    } catch(e){}
    return null;
  }

  function gateVisible(){ try { return !!document.getElementById(GATE_ID); } catch(e){ return false; } }

  function detect(){
    if (gateVisible()) return null;      /* ログインゲートが説明中。二重に出さない。 */
    return fromF705() || fromF697() || null;
  }

  /* 本人の Google メール。無ければ出さない（本文は住所なしでも成立する）。 */
  function myEmail(){
    try {
      var e = null;
      if (typeof window.__chronicleGoogleEmail === 'function') e = window.__chronicleGoogleEmail();
      if (!e && window.__v292Dfix328api && typeof window.__v292Dfix328api.email === 'function')
        e = window.__v292Dfix328api.email();
      e = String(e || '');
      return (e.indexOf('@') > 0 && e.length <= 120) ? e : null;
    } catch(e){ return null; }
  }

  function messageFor(hit){
    /* ★sp24/H-1: 主語は「保存」。ローカル保持の断定（「この端末に保持されています」）は出さない。 */
    if (hit.kind === 'NOT_ALLOWED'){
      /* address が取れているときだけ「Googleアカウント」と名指しする:
         403 は Google 未許可のほかに「停止中の合言葉」からも来るため、address が無いときに
         Google と断定してはいけない。 */
      var em = myEmail();
      return em
        ? '⚠ クラウドに保存できていません。ログイン状態を確認してください。'
          + 'このGoogleアカウント（' + em + '）はまだChronicleの利用許可がないか、停止されています。管理者に確認してください。'
        : '⚠ クラウドに保存できていません。ログイン状態を確認してください。'
          + '（このアカウントは利用許可がないか、アクセスコードが停止中です）';
    }
    return '⚠ クラウドに保存できていません。ログイン状態を確認してください。'
         + 'ログインし直すか、アクセスコードを設定し直してください。';
  }

  function show(hit){
    try {
      if (off() || document.getElementById(NOTICE_ID)) return;
      var top = 0;
      try {
        if (document.getElementById(F840_NOTICE_ID)) top += 30;
        if (document.getElementById(F843_NOTICE_ID)) top += 30;
      } catch(e){}
      var d = document.createElement('div');
      d.id = NOTICE_ID;
      d.textContent = messageFor(hit);
      d.title = 'kind=' + hit.kind + ' status=' + hit.status + ' src=' + hit.source;
      d.setAttribute('style', 'position:fixed;left:0;right:0;top:' + top + 'px;z-index:99995;'
        + 'background:#4a2020;color:#ffd8d8;font-size:12px;line-height:1.6;padding:6px 10px;'
        + 'text-align:center;pointer-events:none;font-family:system-ui,sans-serif;');
      (document.body || document.documentElement).appendChild(d);
      state.shown = true; state.kind = hit.kind; state.status = hit.status; state.source = hit.source;
      try { console.log(TAG, 'notice shown', { kind: hit.kind, status: hit.status, source: hit.source }); } catch(e){}
    } catch(e){}
  }

  function check(){
    state.checks++;
    if (off() || state.shown) return state;
    var hit = detect();
    if (hit) show(hit);
    return state;
  }

  /* 監視は軽量な polling のみ（既存モジュールへ hook を差し込まない = 挙動非干渉）。
     ★sp24/H-1: 3 分上限（MAX_TICKS=60）を撤廃。document の生存中は 3 s 周期で監視を続け、
     出したら止める。turn 4（load から数分後）の保存失敗も検知するため。 */
  var ticks = 0, INTERVAL_MS = 3000;
  function tick(){
    try {
      if (off()) return;
      check();
      if (state.shown) return;
      ++ticks;
      setTimeout(tick, INTERVAL_MS);
    } catch(e){}
  }
  try { setTimeout(tick, 2000); } catch(e){}

  window.__v292Dfix846 = {
    __armed: true, BUILD: BUILD, off: off,
    detect: detect,
    state: function(){ var o = {}; for (var k in state) o[k] = state[k]; o.ticks = ticks; o.noticeInDom = !!document.getElementById(NOTICE_ID); return o; },
    check: check
  };
  try { console.log(TAG, 'loaded (UI only / read-only observer / no wrapper / no storage write / kill=v292Dfix846Off=1)'); } catch(e){}
})();
