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
  var VER = 'vaultuni1-20261123-r1', POLL = 2000, HOLD_MAX = 120000;
  var stats = { send: 0, sendOk: 0, sendStop: {}, del: 0, delOk: 0, delVault: 0, delHold: 0, waits: 0, holds: 0, reruns: 0, expired: 0 };
  function cnt(o, k) { k = String(k || 'X').slice(0, 32); o[k] = (o[k] || 0) + 1; }
  function on() { try { return root.localStorage.getItem('v292DfixVAULTUNI1Off') !== '1' && root.localStorage.getItem('v292DfixVAULTUNI1On') === '1'; } catch (e) { return false; } }   /* 20261123: 既定 OFF へ戻した（実機で空き容量シートの削除が全部 保留になり 0 件になった）。ON は v292DfixVAULTUNI1On='1' */
  function G() { try { var g = root.__v292DfixVAULTGATE2; return (g && typeof g.hidden === 'function') ? g : null; } catch (e) { return null; } }
  function iso(id) { try { var I = root.__v292DfixISO1; if (!I || typeof I.verdict !== 'function') return null; return I.verdict(id); } catch (e) { return 'threw'; } }
  function send(id) {
    stats.send++;
    var why = (function () {
      if (id == null || id === '') return '';
      id = String(id); var g = G(); if (!g) return 'NO_VAULTGATE2';
      var w = (typeof g.openWhy === 'function') ? g.openWhy(id) : (g.hidden(id) === false ? 'NOT_HIDDEN' : 'HIDDEN');
      if (w === 'NOT_HIDDEN') { var v = iso(id); return (v === 'foreign' || v === 'conflict' || v === 'nouser' || v === 'threw') ? 'ISO1_' + String(v).toUpperCase() : ''; }
      if (w === '') { var v2 = iso(id); return v2 == null ? '' : 'ISO1_' + String(v2).toUpperCase(); }   /* 解錠中の隠した物語は、本人の物語と確かめられたときだけ */
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
  root.__v292DfixVAULTUNI1 = { VER: VER, on: on, send: send, del: del, wait: wait, hold: hold,
    held: function (site) { return Object.keys(HELD[site] || {}).length; },
    status: function () { return { ver: VER, on: on(), vg2: !!G(), pending: Object.keys(PEND).filter(function (k) { return !!PEND[k]; }), stats: JSON.parse(JSON.stringify(stats)) }; } };
})();
