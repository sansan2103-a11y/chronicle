/* v292Dfix827 — MAT_RECOVERY_UX_V1（GPT 裁定 54 / M1 + M2）
 * ============================================================================
 * 目的:
 *   M1  ターンが止まっている **理由を人に見せる**（今は無言で止まる）
 *   M2  **read-only の状態確認**入口（fix750.recoveryStatus() を 1 回呼ぶだけ）
 *
 * 契約（裁定 54 §3-5・恒久ルール）:
 *   ・UI から resume / completeAppliedRecovery / journalClear / rollback / delete を
 *     **実行させない**（`EXPLAIN + DIAGNOSE` だけ）
 *   ・auto retry / auto rollback / auto resume を作らない
 *   ・localStorage を **1 バイトも書かない**（この module 自身の write 0）
 *   ・cloud write 0（診断は fix750.recoveryStatus() = server READ のみ）
 *   ・**MAT recovery が active であることを authority にする**。
 *     「turn が止まった」＝ 全部 MAT ではない（他の Class-D hold を MAT と誤表示しない）
 *   ・Owner へ hash / rev internals / journal JSON を見せない（Story title 程度に変換）
 *
 * kill switch: v292Dfix827Off = '1' → 表示も診断も行わない（従来の文言へ倒れる）
 * ========================================================================== */
(function(){
  'use strict';
  if (window.__v292Dfix827) return;
  var TAG = '[v292Dfix827:mat-recovery-ux]';
  var VERSION = 'v292Dfix827-20260907-ux-v1';
  var MAT_JOURNAL_KEY = 'v292Dfix750_matTxn';   /* 存在判定にのみ使う（parse しない） */
  var PANEL_ID = 'v292Dfix827-panel';

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix827Off') === '1'; }

  /* ---- MAT recovery が active か（存在だけを見る。fix745 と同じ契約） ---- */
  function matActive(){ return lsg(MAT_JOURNAL_KEY) != null; }

  /* ---- この hold は MAT が原因か ----------------------------------------
     reason が barrier / materialization 系で、**かつ** MAT journal が実在するときだけ true。
     どちらか一方だけでは MAT と断定しない（裁定 54 §4 の最重要項目）。 */
  function isMatHold(x){
    if (!matActive()) return false;
    var r = String((x && x.reason) || '');
    if (r.indexOf('BOOT_RECOVERY_BARRIER') === 0) return true;
    if (r === 'MATERIALIZATION_RECONCILE_REQUIRED') return true;
    if (r === 'MULTI_RECOVERY_CONFLICT') return true;
    return false;
  }

  /* ---- M1: 表示する文言（内部コード名は出さない） ---- */
  /* ★裁定 55: MAT_RECOVERY_UI_NO_LOSS_GUARANTEE = REQUIRED
     「データは失われていません」は削除。fix827 は ambiguous / conflict 系まで対象にしており、
     UI にデータ損失 0 を保証する authority は無い。伝えるのは
     1) fail-closed している理由 2) 自動で危険な復旧をしないこと の 2 点だけ。 */
  var TEXT_HOLD = '未完了の保存処理があるため、データ保護のためターンを進めていません。'
                + '自動では再開しません。';
  function holdMessage(x){
    if (off()) return null;
    if (!isMatHold(x)) return null;                 /* MAT 以外は既存文言のまま */
    return { text: TEXT_HOLD, kind: 'MAT_RECOVERY_HOLD' };
  }

  /* ---- M2: read-only 診断（fix750.recoveryStatus を 1 回） ----------------
     返すのは Owner に見せてよい粒度だけ。hash / rev / journal 生値は返さない。 */
  var VERDICT_TEXT = {
    NO_JOURNAL:                     '未完了の保存処理は残っていません。',
    ALREADY_APPLIED_CANDIDATE:      'クラウド側は反映済みで、手元の記録だけが残っています。',
    HOLD_PREPARED:                  'クラウドへ確定する直前で止まっています（クラウドには未反映）。',
    HOLD_AMBIGUOUS_NOT_APPLIED:     '結果が確定できていません。手動での確認が必要です。',
    HOLD_PARTIAL_PREPARE:           '準備の途中で止まっています。手動での確認が必要です。',
    HOLD_PARTIAL_OR_FAILED_PREPARE: '準備が完了していません。手動での確認が必要です。',
    HOLD_READ_UNAVAILABLE:          'サーバの状態を読み取れませんでした。通信環境を確認してください。',
    HARD_HOLD_JOURNAL_CORRUPT:      '記録が壊れています。手動での確認が必要です。',
    HARD_HOLD_STORY_MISMATCH:       'いま開いている物語とは別の物語の処理です。対象の物語を開いてから確認してください。'
  };
  var SELF_RECOVERABLE = { NO_JOURNAL: true, ALREADY_APPLIED_CANDIDATE: true };

  function f750(){ try { return window.__v292Dfix750 || null; } catch(e){ return null; } }
  function storyTitle(id){
    try {
      var m = JSON.parse(lsg('chr6_slots_meta') || '[]');
      for (var i = 0; i < m.length; i++){ if (m[i] && String(m[i].id) === String(id)) return String(m[i].name || ''); }
    } catch(e){}
    return '';
  }
  /* 戻り: Promise<{ok, verdict, text, storyTitle, userActionRequired, wrote:0}> */
  function diagnose(){
    if (off()) return Promise.resolve({ ok:false, code:'OFF', wrote:0 });
    var F = f750();
    if (!F || typeof F.recoveryStatus !== 'function')
      return Promise.resolve({ ok:false, code:'NO_FIX750', wrote:0 });
    return Promise.resolve(F.recoveryStatus()).then(function(r){
      var v = (r && r.verdict) || 'UNKNOWN';
      return { ok:true, verdict:v, wrote:0,
               text: VERDICT_TEXT[v] || '状態を判定できませんでした。手動での確認が必要です。',
               storyTitle: storyTitle(r && r.storyId),
               userActionRequired: !SELF_RECOVERABLE[v] };
    }, function(e){
      return { ok:false, code:'THREW', detail:String(e && e.message || e), wrote:0 };
    });
  }

  /* ---- M1/M2 のパネル（この module が自分の DOM だけを持つ） ---- */
  function removePanel(){
    try { var p = document.getElementById(PANEL_ID); if (p && p.parentNode) p.parentNode.removeChild(p); } catch(e){}
  }
  function showPanel(){
    if (off()) return null;
    try {
      removePanel();
      var el = document.createElement('div');
      el.id = PANEL_ID;
      el.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:99998;max-width:92vw;'
        + 'box-sizing:border-box;background:#1d2733;color:#dfe8f2;border:1px solid #c99;border-radius:10px;'
        + 'padding:10px 12px;font-size:13px;line-height:1.6;box-shadow:0 4px 18px rgba(0,0,0,.45);';
      var msg = document.createElement('div');
      msg.setAttribute('data-f827', 'msg');
      msg.textContent = '⚠ ' + TEXT_HOLD;
      el.appendChild(msg);
      var out = document.createElement('div');
      out.setAttribute('data-f827', 'out');
      out.style.cssText = 'margin-top:6px;color:#cfe0f0;';
      var bDiag = document.createElement('button');
      bDiag.setAttribute('data-f827', 'diagnose');
      bDiag.textContent = '状態を確認';
      bDiag.style.cssText = 'margin:6px 8px 0 0;padding:6px 12px;font-size:13px;border-radius:7px;border:1px solid #4a7ad0;background:#24354a;color:#dfe8f2;cursor:pointer;';
      bDiag.onclick = function(){
        bDiag.disabled = true; out.textContent = '確認しています…';
        diagnose().then(function(r){
          bDiag.disabled = false;
          if (!r || !r.ok){ out.textContent = '状態を確認できませんでした。'; return; }
          out.textContent = r.text + (r.storyTitle ? '（対象: ' + r.storyTitle + '）' : '')
                          + (r.userActionRequired ? ' 追加の確認が必要です。自動では処理しません。' : '');
        }, function(){ bDiag.disabled = false; out.textContent = '状態を確認できませんでした。'; });
      };
      var bClose = document.createElement('button');
      bClose.setAttribute('data-f827', 'close');
      bClose.textContent = '閉じる';
      bClose.style.cssText = 'margin:6px 0 0 0;padding:6px 12px;font-size:13px;border-radius:7px;border:1px solid #567;background:#1a2431;color:#cfd8e3;cursor:pointer;';
      bClose.onclick = removePanel;
      el.appendChild(bDiag); el.appendChild(bClose); el.appendChild(out);
      (document.body || document.documentElement).appendChild(el);
      return el;
    } catch(e){ return null; }
  }

  /* Class-D hold の唯一の入口から呼ばれる。MAT でなければ何もしない（null を返す）。 */
  function onHold(x){
    var m = holdMessage(x);
    if (!m) return null;
    showPanel();
    return m;
  }

  window.__v292Dfix827 = {
    VERSION: VERSION,
    off: off,
    matActive: matActive,
    isMatHold: isMatHold,
    holdMessage: holdMessage,
    onHold: onHold,
    diagnose: diagnose,
    showPanel: showPanel,
    removePanel: removePanel,
    PANEL_ID: PANEL_ID
  };
  try { console.log(TAG, 'loaded', VERSION); } catch(e){}
})();
