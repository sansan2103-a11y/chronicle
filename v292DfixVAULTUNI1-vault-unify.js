/* =====================================================================
 * v292DfixVAULTUNI1-vault-unify.js — Vault の判定を VAULTGATE2（v2 対応）の共通判定にそろえる（★VAULTUNI1・GPT #127-WR 裁定 3・2026-11-23）
 * ---------------------------------------------------------------------
 * それまで fix889（v1・凍結）だけを見ていた 8 か所が、この部品に聞く:
 *   外部 AI への送信 3 か所（LORE1・AGENCY1・KN1）→ send(id)
 *   端末内の片づけ・削除 5 か所（DL2・GHOST1・HOLD2・STORE1b・GEN1）→ del(id, site)・wait(ids, ms)・hold(site, fn)
 * 判定の材料は VAULTGATE2 の公開口だけ（openWhy / state）。新しい保存先・新しい状態の台帳は作らない（覚えるのはメモリだけ）。
 *
 * send(id) → '' = 送ってよい／それ以外 = 理由（送らない）
 *   ・VAULTGATE2.openWhy(id) が 'NOT_HIDDEN'（隠していないと分かっている）→ ''。ただし ISO1 が「別アカウント・切り替え中」と言う物語は止める。
 *   ・'' （隠した物語で、いま解錠中・この画面のアカウントの vault2status が返した物語）→ ''（通常の物語と同じ）。ISO1 が何か言えば止める。
 *   ・それ以外（施錠中・分からない・読み直し待ち・部品が無い）→ 止める（fail-closed）。
 * del(id, site) → 'ok' | 'vault'（隠した物語＝今までどおり断る）| 'hold'（分からない＝今は消さない・上書きしない）
 *   ・VAULTGATE2.state(id): 'visible' → 'ok'／'hidden' → 'vault'／'unknown' → 'hold'（site ごとにメモリへ id を覚える）。
 *   ・呼ぶ側は 'ok' でも今までの v1 の確かめ（fix889・端末の控え・パスコード）をそのまま続ける（判定を緩めない）。
 * wait(ids, ms) → Promise: どの id も 'unknown' でなくなるか、ms たつまで待つ（VAULTGATE2 が読み直す）。待ったあと呼ぶ側が全部を確かめ直す。
 * hold(site, fn) → site に 'hold' の id があれば、判定が取れるまで（2 秒ごと・最大 120 秒）待ってから fn() を 1 回呼ぶ。
 *   fn は呼ぶ側の入口そのもの（対象 ID・アカウント・物語・Vault の状態を最初から確かめ直す）。古い削除の要求をそのまま実行しない。
 * kill: localStorage v292DfixVAULTUNI1Off='1' → on() が false。呼ぶ側は今の動き（fix889 だけ）に戻る（土台とバイト一致）。
 * stats は件数と理由だけ（物語 ID・本文は持たない）。端末の記録（localStorage / sessionStorage）には何も書かない。
 * ===================================================================== */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : globalThis;
  if (root.__v292DfixVAULTUNI1) return;
  var VER = 'vaultuni1-20261123-r2', POLL = 2000, HOLD_MAX = 120000;
  var stats = { send: 0, sendOk: 0, sendStop: {}, del: 0, delOk: 0, delVault: 0, delHold: 0, waits: 0, holds: 0, reruns: 0, expired: 0 };
  function cnt(o, k) { k = String(k || 'X').slice(0, 32); o[k] = (o[k] || 0) + 1; }
  function on() { try { return root.localStorage.getItem('v292DfixVAULTUNI1Off') !== '1' && root.localStorage.getItem('v292DfixVAULTUNI1On') === '1'; } catch (e) { return false; } }   /* 20261123: 既定 OFF へ戻した（実機で空き容量シートの削除が全部 保留になり 0 件になった）。ON は v292DfixVAULTUNI1On='1' */
  function G() { try { var g = root.__v292DfixVAULTGATE2; return (g && typeof g.hidden === 'function') ? g : null; } catch (e) { return null; } }
  /* ★r2（GPT #127-WZ）: ISO1 の verdict の null は「本人」だけでなく「本文が無い・ログインの無い古い画面」でも出る。そこで解錠中の隠した物語は、
     いまログインしているアカウント（ISO1 の viewer が acct）の、iso2 の帰属の記録（作成 c と最終書込み w がどちらもこのアカウント）があるときだけ本人とする。 */
  function ownProven(id) { try { var I = root.__v292DfixISO1, X = root.__v292Diso2; if (!I || typeof I.status !== 'function' || !X || typeof X.stampOf !== 'function') return false;
    var st = I.status(); if (!st || st.viewer !== 'acct' || !st.me) return false; var sp = X.stampOf(id, 's'); return !!(sp && sp.c === st.me && (sp.w == null || sp.w === st.me)); } catch (e) { return false; } }
  function iso(id) { try { var I = root.__v292DfixISO1; if (!I || typeof I.verdict !== 'function') return null; return I.verdict(id); } catch (e) { return 'threw'; } }
  function send(id) {
    stats.send++;
    var why = (function () {
      if (id == null || id === '') return '';
      id = String(id); var g = G(); if (!g) return 'NO_VAULTGATE2';
      var w = (typeof g.openWhy === 'function') ? g.openWhy(id) : (g.hidden(id) === false ? 'NOT_HIDDEN' : 'HIDDEN');
      if (w === 'NOT_HIDDEN') { var v = iso(id); return (v === 'foreign' || v === 'conflict' || v === 'nouser' || v === 'threw') ? 'ISO1_' + String(v).toUpperCase() : ''; }
      if (w === '') { var v2 = iso(id); if (v2 != null) return 'ISO1_' + String(v2).toUpperCase(); return ownProven(id) ? '' : 'OWN_UNPROVEN'; }   /* 解錠中の隠した物語は、本人の物語と確かめられたときだけ。r2（GPT #127-WZ「ISO1 が null でも送信できる経路」）: null だけでは送らない */
      return w || 'UNKNOWN';
    })();
    if (why) cnt(stats.sendStop, why); else stats.sendOk++;
    return why;
  }
  var HELD = {};   /* site → { id: 1 }（メモリだけ） */
  function stateOf(id) { var g = G(); if (!g || typeof g.state !== 'function') return 'unknown'; try { return g.state(String(id)); } catch (e) { return 'unknown'; } }
  function del(id, site) {
    stats.del++;
    var s = stateOf(id);
    if (s === 'visible') { stats.delOk++; return 'ok'; }
    if (s === 'hidden') { stats.delVault++; return 'vault'; }
    stats.delHold++; if (site) { (HELD[site] = HELD[site] || {})[String(id)] = 1; }
    return 'hold';
  }
  /* ★r2（実機スモークの退行）: VAULTGATE2 の同期の判定は、vault2status の答えが 15 秒より新しいときだけ「隠していない」と言える。
     答えが古い・まだ無いと、問われた瞬間に読み直しを始めて「分からない」を返す。空き容量シートは約 600 本を 1 回で判定するので、
     開くたびに全部が「分からない」（保留）になっていた。ready(ms) は、vault2status の答え（解錠中なら隠した id の一覧が完全）と、
     CopyGate の答え（施錠中に隠した id を決める vault2visible の答え）がどちらも新しくなるまで、上限つきで待つ。新しい保存先は作らない。 */
  function freshNow() {
    var g = G(); if (!g || typeof g.status !== 'function') return false; var s = null; try { s = g.status(); } catch (e) { return false; }
    if (!s) return false; if (s.cg === 'novault') return true; if (s.cg !== 'vault' || !s.v2 || !(s.v2.age >= 0 && s.v2.age < 10000) || s.v2.hasVault !== true) return false;
    if (s.v2.unlocked === true) return s.v2.complete === true;
    var C = null; try { C = root.__v292Dvault2CopyGate; } catch (e) {} var cs = null; try { cs = C && typeof C.status === 'function' ? C.status() : null; } catch (e) { cs = null; }
    var at = cs ? (+cs.answeredAt || 0) : 0; return at > 0 && at >= Date.now() - s.v2.age - 15000;   /* VAULTGATE2 v2() の V2_CG_STALE と同じ条件 */
  }
  function ready(ms) {
    stats.readies = (stats.readies || 0) + 1;
    return new Promise(function (res) { var t0 = Date.now();
      (function tick() { if (freshNow()) { stats.readyOk = (stats.readyOk || 0) + 1; return res(true); }
        try { var g = G(); if (g && typeof g.state === 'function') g.state('__vaultuni1_ready__'); } catch (e) {}   /* 読み直しを始めさせるだけ（VAULTGATE2 は同時に 1 本） */
        if (Date.now() - t0 >= (ms || 8000)) { stats.readyTimeout = (stats.readyTimeout || 0) + 1; return res(false); }
        setTimeout(tick, 250); })(); });
  }
  function known(ids) { for (var i = 0; i < ids.length; i++) if (stateOf(ids[i]) === 'unknown') return false; return true; }
  function wait(ids, ms) {
    ids = (ids || []).map(String); stats.waits++;
    return new Promise(function (res) {
      var t0 = Date.now();
      (function tick() { if (!ids.length || known(ids) || Date.now() - t0 >= (ms || 8000)) return res(known(ids)); setTimeout(tick, 400); })();
    });
  }
  var PEND = {};   /* site → timer（同じ site は 1 本だけ） */
  function hold(site, fn) {
    var h = HELD[site]; if (!h || !Object.keys(h).length || typeof fn !== 'function') return false;
    if (PEND[site]) return true;
    stats.holds++; var t0 = Date.now();
    PEND[site] = setInterval(function () {
      var ids = Object.keys(HELD[site] || {});
      if (!on()) { clearInterval(PEND[site]); PEND[site] = null; return; }
      if (Date.now() - t0 > HOLD_MAX) { clearInterval(PEND[site]); PEND[site] = null; HELD[site] = {}; stats.expired++; return; }   /* 分からないまま: 消さないまま終える */
      if (!known(ids)) return;
      clearInterval(PEND[site]); PEND[site] = null; HELD[site] = {}; stats.reruns++;
      try { fn(); } catch (e) {}   /* 入口から全部を確かめ直す */
    }, POLL);
    return true;
  }
  root.__v292DfixVAULTUNI1 = { VER: VER, on: on, send: send, del: del, wait: wait, hold: hold, ready: ready, freshNow: freshNow,
    held: function (site) { return Object.keys(HELD[site] || {}).length; },
    status: function () { return { ver: VER, on: on(), vg2: !!G(), pending: Object.keys(PEND).filter(function (k) { return !!PEND[k]; }), stats: JSON.parse(JSON.stringify(stats)) }; } };
})();
