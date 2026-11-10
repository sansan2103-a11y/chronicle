/* =====================================================================
 * v292DfixREAD1-scene-consistency.js — 読みやすさの小さな直し READ1（GPT 裁定 #127-RY ①・2026-11-10・Local 候補）
 * ---------------------------------------------------------------------
 * ■なぜ
 *   独立レビュー（laneREAD1 ANALYSIS）: 61 件のうち矛盾 B が最多で、高の 3 件は階・時刻・どの窓か（「三階なのに」「チャイムが止まったのに放送まであと」）。
 *   実送信の sys（SYS_MAP）に「時刻・階・建物・明るさ・時間を戻さない」にあたる文は無かった。
 *   話者が台詞のあとに出る箇所は会話ログの誤帰属（L2/L3）と同じ箇所。
 * ■やること（文面は裁定のまま。変えない）
 *   (1) keeper（window.__f379reg）に prio1（予算外）で 1 ブロック【場面の一貫性】を登録する。見出しは fix459 の MARKERS に登録済み
 *       （未登録だと直前ブロックへ吸収され、道連れ削除される＝fix496・fix645 の前例）。
 *   (2) 【話者】ブロック（fix459 blockA が作る）の末尾に 1 文だけ足す。足すのは fix459 の blockA が speakerSentence() を呼んだとき（このファイルは文を返すかどうかだけを決める）。
 *       新しいブロックは作らない。
 *   (3) NPC の内心を禁じる文は入れない。voice が空の NPC の扱いはこのレーンではしない。
 * ■範囲（既定 = 影モード。送信 sys は READ1 無しとバイト一致）
 *   Off   v292DfixREAD1Off='1' … 常に OFF（On・管理者画面の行より優先）
 *   ON    端末キー v292DfixREAD1On='1'、または ADMF1 が鍵 'read1' を知っていて gate('read1', false) が true（管理者画面）
 *   影    それ以外（既定。ADMF1 が無い・古い〔keys に read1 なし〕・答え待ち・行なし・Worker が read1 を返さない〔v46.40 以前〕・ADMF1Off を含む）
 *   fix459 が読み込まれているのに見出しを境界として認識しない（古い fix459 がキャッシュに残った端末）ときは、ブロックを足さない（fail-closed）。
 * ■診断（本文・物語 ID は残さない）: window.__v292DfixREAD1.status()
 * ===================================================================== */
(function () {
  'use strict';
  if (window.__v292DfixREAD1) return;
  var VER = 'read1-20261110-a';
  var TAG = '[v292DfixREAD1:scene-consistency]';
  var KILL = 'v292DfixREAD1Off', ON = 'v292DfixREAD1On', KEY = 'read1';
  var M_HEAD = '【場面の一貫性】';
  var TEXT = '確定した時刻・場所・階・建物・明るさ・所持品を、描写上の理由なく変えない。時間経過・移動・特殊現象がある場合は、その変化を物語内で分かるようにする。';
  var SPEAKER = '台詞の話者は、発言前または同じ段落で判別できるようにする。主語を省略しても人物が曖昧にならないようにする。';

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function killed() { return lsGet(KILL) === '1'; }
  function admfKnown() { try { var X = window.__v292DfixADMF1; return !!(X && typeof X.keys === 'function' && typeof X.gate === 'function' && X.keys().indexOf(KEY) >= 0); } catch (e) { return false; } }
  function admfOn() { try { if (!admfKnown()) return false; return window.__v292DfixADMF1.gate(KEY, false) === true; } catch (e) { return false; } }   /* 読めない・古い ADMF1 → false（＝影） */
  function mode() {
    if (killed()) return 'kill';
    if (lsGet(ON) === '1' || admfOn()) return 'on';
    return 'shadow';
  }
  function f459State() {
    try {
      var F = window.__v292Dfix459;
      if (!F || typeof F.parse !== 'function') return 'absent';
      if (typeof F.isOff === 'function' && F.isOff()) return 'off';
      var bl = (F.parse('x' + M_HEAD + 'a') || {}).blocks || [];
      return (bl.length === 1 && bl[0].mk === M_HEAD) ? 'ok' : 'unregistered';
    } catch (e) { return 'unregistered'; }
  }

  var stats = { builds: 0, injected: 0, shadow: 0, kill: 0, unsafe: 0, errors: 0, spBuilds: 0, spAdded: 0, spShadow: 0, sendSeen: 0, sendDup: 0 };
  var LAST = null, LASTSEND = null;

  /* keeper が毎ターン呼ぶ（S へは書かない・通信しない） */
  function blockText() {
    stats.builds++;
    try {
      var md = mode();
      if (md === 'kill') { stats.kill++; LAST = { at: Date.now(), mode: md }; return ''; }
      if (md === 'shadow') { stats.shadow++; LAST = { at: Date.now(), mode: md, injected: false }; return ''; }
      var f4 = f459State();
      if (f4 === 'unregistered') { stats.unsafe++; LAST = { at: Date.now(), mode: md, injected: false, why: 'f459-unregistered', f459: f4 }; return ''; }
      stats.injected++; LAST = { at: Date.now(), mode: md, injected: true, f459: f4 };
      return '\n' + M_HEAD + TEXT;
    } catch (e) { stats.errors++; LAST = { at: Date.now(), mode: 'error' }; return ''; }
  }

  /* fix459 blockA が呼ぶ。ON のときだけ文を返す（空文字 = 何も足さない）。 */
  function speakerSentence() {
    stats.spBuilds++;
    try {
      var md = mode();
      if (md === 'on') { stats.spAdded++; return SPEAKER; }
      if (md === 'shadow') stats.spShadow++;
      return '';
    } catch (e) { stats.errors++; return ''; }
  }

  /* ---- keeper 登録（prio1・予算外。off キーは keeper が live で見る） ---- */
  var registered = false;
  try {
    window.__f379reg = window.__f379reg || [];
    var reg = window.__f379reg, dup = false;
    for (var i = 0; i < reg.length; i++) { if (reg[i] && reg[i].marker === M_HEAD) dup = true; }
    if (!dup) { reg.push({ off: KILL, marker: M_HEAD, prio: 1, text: blockText }); registered = true; }
  } catch (e) {}

  /* ---- 送信前の sys を読むだけ（Api._preCallHooks。何も返さない＝送る中身は変えない） ---- */
  function countOf(h, n) { var c = 0, k = 0; while ((k = h.indexOf(n, k)) >= 0) { c++; k += n.length; } return c; }
  function preHook(ctx) {
    try {
      if (!ctx || typeof ctx.system !== 'string') return;
      var n = countOf(ctx.system, M_HEAD); if (!n) return;
      stats.sendSeen++; if (n > 1) stats.sendDup++;
      LASTSEND = { at: Date.now(), count: n, sysLen: ctx.system.length };
    } catch (e) {}
  }
  preHook.__read1 = true;
  var hookInstalled = false;
  function installHook() {
    try { var A = window.Api || (0, eval)('typeof Api!=="undefined" ? Api : null'); if (!A || !Array.isArray(A._preCallHooks)) return false;
      for (var i = 0; i < A._preCallHooks.length; i++) { if (A._preCallHooks[i] && A._preCallHooks[i].__read1) { hookInstalled = true; return true; } }
      A._preCallHooks.push(preHook); hookInstalled = true; return true; } catch (e) { return false; }
  }
  installHook();
  try { setInterval(installHook, 2000); } catch (e) {}

  window.__v292DfixREAD1 = {
    ver: VER, markers: { head: M_HEAD }, text: TEXT, speaker: SPEAKER,
    blockText: blockText, speakerSentence: speakerSentence, mode: mode, f459State: f459State,
    status: function () {
      return { ver: VER, mode: mode(), killed: killed(), on: lsGet(ON) === '1', admfKnown: admfKnown(), admf: admfOn(), registered: registered, hookInstalled: hookInstalled, f459: f459State(),
        last: LAST ? JSON.parse(JSON.stringify(LAST)) : null, lastSend: LASTSEND ? JSON.parse(JSON.stringify(LASTSEND)) : null, stats: JSON.parse(JSON.stringify(stats)) };
    }
  };
  try { console.log(TAG, 'registered to __f379reg (prio1, ' + (registered ? 1 : 0) + ' block; mode=' + mode() + ')'); } catch (e) {}
})();
