/* =====================================================================
 * Chronicle v292DfixADMF1 r3: アカウントごとの機能スイッチで SFL の使用可否を決める（laneADMF・2026-10-31・Local 候補・GPT #127-OK / #127-OM）
 * ---------------------------------------------------------------------
 * ■やること（読むだけ。localStorage / cookie / DOM / 通信へは 1 つも書かない）
 *   fix893 が起動時に聞く GET /api/auth/me の答え（fix893.flagsSnap()：その答えのアカウント・accountFlagsState・accountFlags・accountFlagsPhase）
 *   から、SFL（話者の訂正 = 'sfl1'）を使ってよいかを答える。SFL 本体の enabled() が gate('sfl1', 端末の設定) を 1 回呼ぶだけ。
 *
 * ■3 つの状態（GPT #127-OK 1）
 *   A  答えが届き（accountFlagsState='ok'）、そのアカウントに sfl1 の行がある → 行の値（1=ON / 0=OFF）。端末の ?sfl=1・v292DfixSFL1On より優先。
 *   B  答えが届き、行がない（未設定）→ accountFlagsPhase=1（既定）: 端末の設定 v292DfixSFL1On のまま（71-a と同じ）／ 2: OFF。
 *        段階の切り替えは Worker の env CHR_ACCT_FLAGS_PHASE='2'（Pages は出し直さない）。値が分からないときは 2（OFF）として扱う。
 *   C  それ以外は全部 OFF：通信失敗・401・403・503・答えに accountFlagsState が無い（旧 Worker）・'off'（CHR_ACCT_FLAGS_OFF）・'inactive'・'error'（D1 失敗）・
 *        fix893 が無い（*.pages.dev 以外の origin、v292Dfix893Off）・答えのアカウントが fix893 の今のアカウントと違う・別タブでのログアウト／別アカウントへの切り替え。
 *        前のアカウントの ON・端末に残った古い値・localStorage のログインの印は「ON の根拠」に使わない（印は OFF へ倒すきっかけにだけ使う＝fix893 側）。
 *   待ち  答えがまだ来ていない間（読み込みから最長 10 秒）は OFF。プレイは止めない（SFL を使わないだけ）。10 秒を過ぎても来なければ C（OFF）。
 *        10 秒より後に正しい答えが届いたら、その時点で A / B に従う（OFF→ON の 1 回だけ。ON→OFF→ON のちらつきは作らない）。
 *
 * ■端末のキー
 *   v292DfixSFL1Off='1' … SFL の kill。SFL 本体が先に見て常に OFF（このモジュールは呼ばれない）。
 *   v292DfixADMF1Off='1' … この仕組みの通常の停止。gate は常に false ＝ SFL は完全に OFF（端末の ?sfl=1・v292DfixSFL1On='1' でも ON にしない。GPT #127-OM）。
 *   このファイルが読み込めなかった（無い・例外）ときも、SFL 本体は OFF（SFL1 の admfGate が false を返す）。
 *   古い版へ戻すとき（rollback）は SFL1 も古い版に戻るので、そのときだけ端末の設定（77-ui-a / 71-a の動き）になる。
 *
 * ■見た目: 判定するたびに SFLTap.sync() で会話ログのタップの印を今の値に合わせる（OFF なら外す・ON になったら付ける。r3b: 覚えている値に頼らない）。
 * ■秘密は持たない・管理トークン / 管理 API はこのページに無い。Vault・Owner 限定の関門には触らない。
 * ■診断（コンソール）: window.__v292DfixADMF1.{status(), decide('sfl1'), gate('sfl1', 端末の値)}
 * ■admf2（laneINT・2026-11-01・GPT #127-OQ 3）: 2 つ目の鍵 'npres1'（NPC 場面整合 NPRES）。A（行あり）は sfl1 と同じ（1=ON / 0=OFF）。
 *   ★npres1 の B（行なし）は段階に関係なく常に OFF（端末の設定 v292DfixNPRESOn には戻さない）。C・待ち・ADMF1Off も OFF（sfl1 と同じ）。
 *   NPRES 本体が gate('npres1', false) を呼ぶ（端末の値は渡さない）。sfl1 の動き（段階 1 = 端末の設定）は変えない。見た目の印の合わせ直しは sfl1 だけ。
 * ■admg1（laneADMG・2026-11-01・Local 候補）: 鍵を 4 つ足す。lc1（キャラの絵の作業欄 LC1）・ld1（画風ごとの採用画像 LD1）・rc1（想起の補助 RC1）・oma1（おまかせ fix335）。
 *   4 つとも行なし（B）の扱いは sfl1 と同じ 'phase'（段階 1 = 端末の opt-in のまま＝80 と同じ / 2 = OFF）。A（行あり）・C・待ち・ADMF1Off は sfl1 と同じ。
 *   Worker（v46.13-admg）が公開許可の範囲（READY / CANARY / HOLD）を当てて accountFlags を作る＝ここでは A として読む:
 *     範囲の外の鍵（HOLD の鍵・CANARY でそのアカウントが許可外）は、行が無くても明示の 0（＝端末の opt-in でも ON にならない）。
 *     READY の鍵で行が無いものは、全体の値（既存の KV の 'featcfg:<鍵>'・読めなければ 0）で埋める。それ以外で行が無い鍵は来ない＝B（段階）。
 *   判定の順: 部品の kill（各部品が先に見る）＞ ADMF1Off ＞ 範囲（Worker）＞ アカウントの行 ＞ 全体の値 ＞ 行なしの扱い（段階）。答えが無い・読めない・別アカウント → OFF。
 *   whenOn(key, devFn, cb): 読み込み時にしか判定しない部品（LC1・LD1）用。今 OFF でも、答えが届いて gate が true になったら cb を 1 回だけ呼ぶ（OFF→ON の 1 回だけ。ON→OFF は次に開いた時から）。
 *   書き込みは今までどおり 0（localStorage / cookie / 通信）。
 * ===================================================================== */
(function (root) {
  'use strict';
  var VER = 'admg1-20261101-bundle81';
  var KILL = 'v292DfixADMF1Off';
  var KEYS = { sfl1: 'phase', npres1: 'off', lc1: 'phase', ld1: 'phase', rc1: 'phase', oma1: 'phase' };   /* ★admg1: +lc1 / ld1 / rc1 / oma1（行なし = 段階） */ var LATE = [];   /* 未設定（行なし）の扱い: 'phase' = Worker の段階（1 = 端末の設定 / 2 = OFF）、'off' = 常に OFF（admf2） */
  var HOLD_MS = 10000;
  var ACCT_RE = /^[0-9a-f]{32}$/;
  var T0 = Date.now();
  var ST = { rechecks: 0, changes: 0, lastOn: null, last: null, hist: [] };

  function lsGet(k) { try { var ls = root.localStorage; return ls ? ls.getItem(k) : null; } catch (e) { return null; } }
  function f893() { try { return root.__v292Dfix893 || null; } catch (e) { return null; } }

  /* decide(key) → { s: 'A' | 'B' | 'C' | 'wait' | 'kill', v?: 0|1, phase?: 1|2, why } — 読むだけ */
  function decide(key) {
    if (!KEYS[key]) return { s: 'C', why: 'unknown-key' };
    if (lsGet(KILL) === '1') return { s: 'kill', why: 'ADMF1Off' };
    var F = f893();
    if (!F || typeof F.flagsSnap !== 'function' || typeof F.serverMe !== 'function') return { s: 'C', why: 'no-fix893' };
    var snap = null, me = null, checked = false;
    try { snap = F.flagsSnap(); me = F.serverMe(); checked = !!(typeof F.status === 'function' && F.status().checked); } catch (e) { return { s: 'C', why: 'read-error' }; }
    if (!snap) {
      if (!checked && Date.now() - T0 < HOLD_MS) return { s: 'wait', why: 'no-answer-yet' };
      return { s: 'C', why: checked ? ('no-flags:' + String((typeof F.flagsWhy === 'function' && F.flagsWhy()) || '?')) : 'timeout' };
    }
    var acct = (me && ACCT_RE.test(String(me.accountId || ''))) ? String(me.accountId) : null;
    if (!acct || snap.acct !== acct) return { s: 'C', why: 'acct-mismatch' };
    if (snap.st !== 'ok' || !snap.flags || typeof snap.flags !== 'object') return { s: 'C', why: 'server:' + String(snap.st || '?').slice(0, 16) };
    var v = snap.flags[key];
    if (v === 1 || v === 0) return { s: 'A', v: v, why: 'row' };
    if (KEYS[key] === 'off') return { s: 'B', phase: 2, why: 'unset:off' };   /* admf2: npres1 — 行が無ければ常に OFF */
    var ph = snap.phase === 1 ? 1 : 2;
    return { s: 'B', phase: ph, why: 'unset:phase' + ph };
  }
  /* gate(key, dev): SFL 本体の enabled() から。dev = 端末の設定（v292DfixSFL1On==='1'）。true のときだけ使ってよい。 */
  function gate(key, dev) {
    var d = decide(key);
    if (d.s === 'kill') return false;   /* r3 (GPT #127-OM): 停止 = SFL OFF（端末の値に戻さない） */
    if (d.s === 'A') return d.v === 1;
    if (d.s === 'B') return d.phase === 1 ? dev === true : false;
    return false;
  }

  /* ★admg1: whenOn — 今 gate が false の部品を、答えが届いたあとに 1 回だけ起こす。devFn は呼ぶたびに端末の opt-in を読み直す関数 */
  function devOf(f) { try { return typeof f === 'function' ? f() === true : f === true; } catch (e) { return false; } }
  function whenOn(key, devFn, cb) {
    if (!KEYS[key] || typeof cb !== 'function') return false;
    if (gate(key, devOf(devFn))) { setTimeout(function () { try { cb(); } catch (e) {} }, 0); return true; }
    if (LATE.length < 32) LATE.push({ key: key, dev: devFn, cb: cb });
    return false;
  }
  function runLate() {
    for (var i = LATE.length - 1; i >= 0; i--) { var L = LATE[i]; var on = false; try { on = gate(L.key, devOf(L.dev)); } catch (e) { on = false; }
      if (on) { LATE.splice(i, 1); (function (cb) { setTimeout(function () { try { cb(); } catch (e) {} }, 0); })(L.cb); } }
  }
  function sflOn() { try { var S = root.__v292DfixSFL1; return !!(S && typeof S.enabled === 'function' && S.enabled()); } catch (e) { return false; } }
  function tapSync(on) {   /* SFLTap は読み込み時に 1 回だけ見た目の印を判定する → 判定が変わった時だけ同じ判定をもう一度呼ぶ（無ければ何もしない） */
    try {
      var T = root.__v292DfixSFLTap; if (!T || typeof T.sync !== 'function') return;
      if (!on) { T.sync(); return; }
      var n = 0, iv = setInterval(function () { n++; var ok = false; try { ok = T.sync(); } catch (e) {} if (ok || n > 40 || !sflOn()) clearInterval(iv); }, 500);
    } catch (e) {}
  }
  function recheck(why) {
    try {
      ST.rechecks++;
      var d = decide('sfl1'), on = sflOn();
      ST.last = { at: Date.now() - T0, why: why, s: d.s, dwhy: d.why, on: on };
      if (ST.hist.length < 20) ST.hist.push(ST.last);
      if (ST.lastOn !== null && on !== ST.lastOn) ST.changes++;
      /* r3b (GPT #127-OO): ここで覚えている値ではなく、今の値で見た目の印を合わせる。答えが SFL1 の読み込みより先に来ると lastOn=false のまま
         SFLTap が自分で印を付けるので、OFF の時は毎回 sync（印があれば外すだけ・冪等）、ON になった時は前が ON でなければ sync。 */
      if (!on) tapSync(false); else if (ST.lastOn !== true) tapSync(true);
      ST.lastOn = on;
    } catch (e) {}
    try { runLate(); } catch (e) {}   /* ★admg1 */
  }

  root.__v292DfixADMF1 = { ver: VER, gate: gate, decide: decide, whenOn: whenOn, keys: function () { return Object.keys(KEYS); },
    status: function () { return { ver: VER, killed: lsGet(KILL) === '1', sinceLoadMs: Date.now() - T0, holdMs: HOLD_MS, sfl1: decide('sfl1'), npres1: decide('npres1'), lc1: decide('lc1'), ld1: decide('ld1'), rc1: decide('rc1'), oma1: decide('oma1'), late: LATE.map(function (L) { return L.key; }), rechecks: ST.rechecks, changes: ST.changes, lastOn: ST.lastOn, last: ST.last ? JSON.parse(JSON.stringify(ST.last)) : null, hist: JSON.parse(JSON.stringify(ST.hist)) }; } };
  try {
    root.addEventListener('chr:account-me', function () { recheck('me'); });
    root.addEventListener('chr:account-flags', function () { recheck('flags'); });
    setTimeout(function () { recheck('timeout'); }, HOLD_MS + 50);
    recheck('load');
  } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
