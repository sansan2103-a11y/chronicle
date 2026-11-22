/* =====================================================================
 * v292DfixMEM4R-rebuild.js — 長期記憶を、その物語自身の本文から 0 ターン目より分けて作り直して追いつく（MEM4R r2・2026-11-22・LOCAL・出荷しない・既定 ON）
 * ---------------------------------------------------------------------
 * ■r3（GPT #127-WV ③）: 印の無い古い記憶を先に消さない。新しい記憶（0 から作った最初の 1 回）を保存できたことを確かめてから置き換える。作り直しの途中・失敗・タブを閉じたときは古い記憶が残る（AI には渡さない）。
 * ■なぜ（r1）: MEM4 は印の無い・印の合わない記憶を信用しない（別の物語・別のアカウントの記憶が混ざった事故への備え）。今日より前に作られた記憶は再読み込みの後ずっと渡らない。
 * ■なぜ（r2・レビュー #1 の実測）: 長期記憶は端末ごとで同期されない（F_PAF_DENY）。別の端末・長期記憶が今日 ON になった端末では記憶が空から始まり、
 *   fix135 は直近 12 ターン（FIRST_CAP）からしか作らない＝序盤が永久に入らない。また追いつきの途中で再読み込みすると、残りを fix135 が 1 回の大きな送信で送る。
 * ■やること（信用しない原則は変えない）:
 *   ① MEM4 が untrusted（印の欠落・食い違い）と答えたら、その記憶を材料にせず消す（fix135 の reset・派生の控え 4 つだけ）＝空に戻す。
 *   ② 記憶が空（lastBuild<0）で、土台なら直近 12 ターンしか送らない（＝序盤が落ちる）とき、0 ターン目から作る。
 *   ③ 作った所（lastBuild）から今までが 1 回の上限を超えるとき（追いつきの途中の再読み込み・久しぶりに戻った端末）、続きから分けて送る。
 *   刻み: 1 ターンに 1 回・1 回 12 ターン・本文 12,000 字まで。失敗（null・時間切れ・500）は同じ範囲を次のターンにやり直す。成功した範囲は二度送らない（lastBuild が進む）。
 *   1 回で今まで届くとき（ふつうの 3 ターンごとの作り直し・12 ターン以下の新しい物語）は null＝土台と 1 字も同じ。
 *   作り直しの完了は MEM4 がいつもどおり見届けて印を付ける（新しい信用の経路は作らない）。材料は今の物語の S.turns だけ（fix135 が slot と物語を確かめる）。
 * ■条件: kill v292DfixMEM4ROff='1'（常に勝つ）が無い・長期記憶が渡る人（MEM2.aOn()）・VAULTGATE2 の認可
 *   （hidden(id)===false か openWhy(id)===''＝解錠中の隠した物語。施錠・判定待ち・部品なしは何もしない）。①はさらに MEM4 が働いているとき（MEM2.m4On()）だけ・1 物語につき 1 ページ 2 回まで。
 *   MEM4 が check（印の照合待ち）・ACCT_UNKNOWN などで待っている間は何もしない（土台どおり）。
 * ■OFF・kill・条件外: plan() は null を返す＝fix135 は土台と同じに動く。鍵 v292DfixMEM4ROn は r2 で要らない（残っていても害はない）。
 * ■診断: window.__v292DfixMEM4R.stats()（件数と理由だけ。本文・id は持たない）
 * ===================================================================== */
(function (root) {
  'use strict';
  if (!root || root.__v292DfixMEM4R) return;
  var VER = 'mem4r-20261122-r3', CH = 12, CHARS = 12000, MAX_TRY = 4, INTERVAL = 3;   /* ★r3: MAX_TRY＝印の無い記憶の置き換えの試み（1 物語・1 ページ） */
  var RESET_WHY = { NO_STAMP: 1, BAD_STAMP: 1, ACCT_MISMATCH: 1, SID_MISMATCH: 1, DEV_MISMATCH: 1, LB_MISMATCH: 1, HASH_MISMATCH: 1, M4_SEQ_MISMATCH: 1, M4_SEQ_UNKNOWN: 1, SEQ_MISMATCH: 1, SEQ_UNKNOWN: 1, UNSEEN_WRITER: 1, CHANGED_NO_REBUILD: 1 };
  var ST = { plans: 0, offWhy: {}, resets: 0, replaced: 0, keptOld: 0, resetWhy: {}, calls: 0, mode: {}, sentTurns: 0, sentChars: 0, retries: 0, done: 0, skipTurn: 0 };
  var bySfx = {};   /* このページの間だけ: { resets, lastCallTurn, lastFrom } */
  function cnt(o, k) { k = String(k || 'X').slice(0, 32); o[k] = (o[k] || 0) + 1; }
  function lsg(k) { try { return root.localStorage.getItem(k); } catch (e) { return undefined; } }
  function sid() { try { var f = root.__v292Dfix697; var id = f && f.status ? f.status().storyId : null; return id ? String(id) : null; } catch (e) { return null; } }
  function vault() { var id = sid(); if (!id) return 'ID_UNKNOWN'; var G = root.__v292DfixVAULTGATE2; if (!G || typeof G.hidden !== 'function') return 'NO_VAULTGATE2';
    try { if (G.hidden(id) === false) return ''; if (typeof G.openWhy === 'function' && G.openWhy(id) === '') return ''; return 'VAULT'; } catch (e) { return 'VAULT_THREW'; } }
  function why() { var k = lsg('v292DfixMEM4ROff'); if (k === undefined) return 'STORAGE'; if (k === '1') return 'KILLED';
    try { var M = root.__v292DfixMEM2; if (!M || typeof M.aOn !== 'function' || M.aOn() !== true) return 'MEM2A_OFF'; } catch (e) { return 'MEM2A_OFF'; } return vault(); }
  function m4on() { try { var M = root.__v292DfixMEM2; return !!(M && typeof M.m4On === 'function' && M.m4On() === true); } catch (e) { return false; } }
  function m4() { try { var M = root.__v292DfixMEM2; if (M && typeof M.trust === 'function') M.trust(); var s = M.stats(); return s && s.m4 ? { state: s.m4.state, why: s.m4.why } : null; } catch (e) { return null; } }
  function sizeOf(t) { return String((t && t.playerText) || '').slice(0, 80).length + String((t && t.narrative) || '').slice(0, 1500).length; }
  /* fix135 maybeRebuild から呼ぶ。o = { curTurn, lastBuild, turns, sfx }。戻り: null（土台どおり）／{ reset[, wait] }／{ catchup, from, to }／{ catchup, wait } */
  function plan(o) {
    ST.plans++; var w = why(); if (w) { cnt(ST.offWhy, w); return null; }
    if (!o || !Array.isArray(o.turns)) return null;
    var key = String(o.sfx || ''), b = bySfx[key] || (bySfx[key] = { resets: 0, lastCallTurn: -2, lastFrom: -2 });
    var out = {}, lb = +o.lastBuild, cur = +o.curTurn, mode;
    if (!(lb >= -1)) lb = -1;
    if (m4on()) {
      var s = m4(); if (!s) { cnt(ST.offWhy, 'M4_NONE'); return null; }
      if (s.state === 'untrusted') {
        if (!RESET_WHY[String(s.why || '').replace(/^M4_/, '')]) { cnt(ST.offWhy, 'WHY_' + s.why); return null; }
        /* ★r3（GPT #127-WV ③）: reset は「消せ」ではなく「前の記憶を材料にせず 0 から作れ（保存できたら置き換える）」。古い記憶は、新しい記憶の保存の直前まで残る（渡さない原則は MEM4 のまま）。
           試みの上限を超えたら null ではなく wait（土台が古い記憶を材料に作り直すのを止める） */
        if (b.resets >= MAX_TRY) { cnt(ST.offWhy, 'RESET_CAP'); return { wait: true }; }
        b.resets++; ST.resets++; cnt(ST.resetWhy, s.why); out.reset = true; lb = -1;
      } else if (s.state === 'check') { cnt(ST.offWhy, 'M4_CHECK'); return null; }   /* 印の照合待ち: 土台どおり */
    }
    var keep = function () { return out.reset ? out : null; };
    if (cur < 2) return keep();
    if (lb >= 0 && cur - lb < INTERVAL) return keep();   /* いつもの刻みに満たない: 土台どおり */
    var from = lb + 1;
    if (from > cur) { return keep(); }
    var to = from, chars = sizeOf(o.turns[from]);
    while (to + 1 <= cur && to + 1 - from < CH && chars + sizeOf(o.turns[to + 1]) <= CHARS) { to++; chars += sizeOf(o.turns[to]); }
    if (to >= cur) { if (b.lastFrom >= 0 || out.reset) ST.done++; b.lastFrom = -2; return keep(); }   /* 1 回で今まで届く＝土台と同じ送信 */
    mode = out.reset ? 'reset' : (lb < 0 ? 'empty' : 'gap');
    if (b.lastCallTurn === cur) { ST.skipTurn++; return out.reset ? { reset: true, wait: true } : { catchup: true, wait: true }; }   /* 1 ターンに 1 回まで */
    if (b.lastFrom === from) ST.retries++;
    b.lastCallTurn = cur; b.lastFrom = from; ST.calls++; cnt(ST.mode, mode); ST.sentTurns += to - from + 1; ST.sentChars += chars;
    out.catchup = true; out.from = from; out.to = to; return out;
  }
  function replaced(ok) { if (ok) ST.replaced++; else ST.keptOld++; }   /* ★r3: fix135 が置き換えの結果を知らせる（件数だけ） */
  function finished(sfx, to, cur) { /* r2: 進み具合は lastBuild で決まる（ここでは何もしない・r1 の呼び出し口を残す） */ }
  var api = { VER: VER, why: why, plan: plan, finished: finished, replaced: replaced, CH: CH, CHARS: CHARS, stats: function () { return JSON.parse(JSON.stringify(ST)); } };
  try { Object.defineProperty(root, '__v292DfixMEM4R', { value: Object.freeze(api), configurable: false, enumerable: false, writable: false }); } catch (e) { root.__v292DfixMEM4R = api; }
})(typeof window !== 'undefined' ? window : globalThis);
