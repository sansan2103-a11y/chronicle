/* =====================================================================
 * v292DfixMEMFIX1-longmem-robust.js — 長期記憶の作り直しが止まり続ける穴の直し（MEMFIX1・2026-11-22・LOCAL・出荷しない・既定 ON）
 * ---------------------------------------------------------------------
 * ■なぜ（realai_out_r5 の実測）: 要約 AI の応答が max_tokens 2000 で途中で切れる（summary が指示の長さを大きく超えて 1,000〜1,250 字）。
 *   fix135 は JSON.parse に失敗した応答を捨てて lastBuild を据え置き、次のターンにもっと広い範囲でやり直すので、応答は短くならず止まり続けた（E1 は T10 から最後まで lb 8）。
 * ■やること（長期記憶が渡る人＝MEM2.aOn()・kill v292DfixMEMFIX1Off='1' が常に勝つ）:
 *   (a) salvage(content): JSON.parse に失敗した応答だけ、文字列・括弧の深さを追って「最後に閉じた配列の要素」で切り、括弧を閉じて読む。
 *       summary が最後まで読めたときだけ使う（summary が途中で切れていれば null＝今と同じく保存しない）。
 *       worldinfo・events が途中で切れていたら（_cut）、読めた項目だけを新しい版とし、前の版の項目のうち新しい版に無いものを残す（fix135 側の fill）。壊れた項目は捨てる。
 *   (b) 同じ所（同じ slot・同じ lastBuild）で続けて失敗したとき: 2 回目の失敗の後は max_tokens 4000 で 1 回、3 回目の後からは範囲を半分にして（4000 のまま）、
 *       5 回失敗したら、そのページの間だけ、その範囲を飛ばして先へ進む（止まり続けない上限）。失敗の後は 1 ターンに 1 回までしかやり直さない。
 *   (c) 指示の summary の長さを形式として書く（何字・何文・長くなるときのまとめ方）。保存する summary は 800 字の内側で、文の区切りで切る。
 * ■kill・長期記憶 OFF: on() が false → fix135 は土台と同じ（指示の文字列・max_tokens・保存・やり直しとも 1 字も変えない）。
 * ■診断: window.__v292DfixMEMFIX1.stats()（件数だけ。本文は持たない）
 * ===================================================================== */
(function (root) {
  'use strict';
  if (!root || root.__v292DfixMEMFIX1) return;
  var VER = 'memfix1-20261122-r1', BOOST = 4000, MAX_FAIL = 5, SUM_CAP = 800;
  var ST = { on: 0, offWhy: {}, salvaged: 0, salvageNG: 0, wiCut: 0, evCut: 0, fails: 0, boosted: 0, halved: 0, skipped: 0, waited: 0, ok: 0, okAfterFail: 0, sumCut: 0, prompt: 0, promptMiss: 0 };
  var bySfx = {};   /* このページの間だけ: { lb, fails, lastFailTurn, skipFrom } */
  function cnt(o, k) { o[k] = (o[k] || 0) + 1; }
  function lsg(k) { try { return root.localStorage.getItem(k); } catch (e) { return undefined; } }
  function why() { var k = lsg('v292DfixMEMFIX1Off'); if (k === undefined) return 'STORAGE'; if (k === '1') return 'KILLED';
    try { var M = root.__v292DfixMEM2; if (!M || typeof M.aOn !== 'function' || M.aOn() !== true) return 'MEM2A_OFF'; } catch (e) { return 'MEM2A_OFF'; } return ''; }
  function on() { var w = why(); if (w) { cnt(ST.offWhy, w); return false; } ST.on++; return true; }
  /* ---- (a) 寛容な読み取り ---- */
  function salvage(text) {
    var s = String(text || ''), i0 = s.indexOf('{'); if (i0 < 0) { ST.salvageNG++; return null; }
    var inStr = false, esc = false, stack = [], lastCut = -1, cutStack = null, keyAt = {}, curKey = null, strStart = -1;
    for (var i = i0; i < s.length; i++) { var c = s.charAt(i);
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') { inStr = false; if (stack.length === 1) curKey = s.slice(strStart + 1, i); } continue; }
      if (c === '"') { inStr = true; strStart = i; continue; }
      if (c === '{' || c === '[') { stack.push(c); if (stack.length === 2 && curKey) keyAt[curKey] = 'open'; continue; }
      if (c === '}' || c === ']') { var o = stack.pop(); if ((c === '}' && o !== '{') || (c === ']' && o !== '[')) break;
        if (stack.length === 1 && c === ']' && curKey) keyAt[curKey] = 'closed';
        if (stack.length >= 1 && stack[stack.length - 1] === '[' && c === '}') { lastCut = i; cutStack = stack.slice(); }
        if (stack.length === 0) break; } }
    if (lastCut < 0) { ST.salvageNG++; return null; }
    var closers = ''; for (var j = cutStack.length - 1; j >= 0; j--) closers += cutStack[j] === '{' ? '}' : ']';
    var obj = null; try { obj = JSON.parse(s.slice(i0, lastCut + 1) + closers); } catch (e) { ST.salvageNG++; return null; }
    if (!obj || typeof obj.summary !== 'string' || !obj.summary) { ST.salvageNG++; return null; }   /* summary が読めなければ使わない */
    var wiCut = keyAt.worldinfo !== 'closed', evCut = keyAt.events !== 'closed';
    ST.salvaged++; if (wiCut) ST.wiCut++; if (evCut) ST.evCut++;
    return {
      summary: String(obj.summary || '').slice(0, 800),
      worldinfo: Array.isArray(obj.worldinfo) ? obj.worldinfo.filter(function (w) { return w && w.name && w.type && w.desc; }).slice(0, 40) : [],
      events: Array.isArray(obj.events) ? obj.events.filter(function (e) { return e && e.event && typeof e.turnIdx === 'number'; }).slice(0, 20) : [],
      _cut: { wi: wiCut, ev: evCut }
    };
  }
  /* 途中で切れた worldinfo・events に、前の版の項目のうち新しい版に無いものを足す（新しい版が優先・壊れた項目は既に捨ててある） */
  function fill(result, prevWI, prevEv) {
    if (!result || !result._cut) return result;
    if (result._cut.wi) { var have = {}; (result.worldinfo || []).forEach(function (w) { have[w.name] = 1; }); (prevWI || []).forEach(function (w) { if (w && w.name && !have[w.name] && result.worldinfo.length < 40) result.worldinfo.push(w); }); }
    if (result._cut.ev) { var key = function (e) { return e.turnIdx + '\u0001' + e.event; }, hv = {}; (result.events || []).forEach(function (e) { hv[key(e)] = 1; hv['t' + e.turnIdx] = 1; });
      var add = (prevEv || []).filter(function (e) { return e && !hv[key(e)] && !hv['t' + e.turnIdx]; }); result.events = add.concat(result.events || []).sort(function (a, b) { return a.turnIdx - b.turnIdx; }).slice(-20); }
    delete result._cut; return result;
  }
  /* ---- (b) やり直しの段取り。fix135 maybeRebuild が範囲を決めた後に呼ぶ。戻り: null（土台どおり）／{ wait }／{ from, to, tokens } ---- */
  function plan(o) {
    if (!on() || !o) return null;
    var key = String(o.sfx || ''), b = bySfx[key];
    if (!b || b.lb !== o.lb) { b = bySfx[key] = { lb: o.lb, fails: 0, lastFailTurn: -2, skipFrom: b && b.lb === o.lb ? b.skipFrom : -1 }; }
    var from = o.from, to = o.to, tokens = 0;
    if (b.skipFrom > from && b.skipFrom <= to) from = b.skipFrom;
    if (!b.fails) return (from !== o.from) ? { from: from, to: to, tokens: 0 } : null;
    if (b.lastFailTurn === o.cur) { ST.waited++; return { wait: true }; }   /* 失敗の後は 1 ターンに 1 回まで */
    if (b.fails >= 2) { tokens = BOOST; ST.boosted++; }
    if (b.fails >= 3) { var n = to - from + 1, half = Math.max(1, Math.floor(n / Math.pow(2, b.fails - 2))); to = from + half - 1; ST.halved++; }
    return { from: from, to: to, tokens: tokens };
  }
  function fail(o) { if (!on() || !o) return null; var key = String(o.sfx || ''), b = bySfx[key] || (bySfx[key] = { lb: o.lb, fails: 0, lastFailTurn: -2, skipFrom: -1 });
    if (b.lb !== o.lb) { b.lb = o.lb; b.fails = 0; }
    b.fails++; b.lastFailTurn = o.cur; ST.fails++;
    if (b.fails >= MAX_FAIL) { b.skipFrom = (+o.to) + 1; b.fails = 0; ST.skipped++; return { skipped: true }; }   /* 上限: この範囲は飛ばして先へ（このページの間だけ・保存はしない） */
    return { fails: b.fails }; }
  function ok(o) { if (!o) return; var key = String(o.sfx || ''), b = bySfx[key]; if (b && b.fails) ST.okAfterFail++; if (b) { b.fails = 0; b.skipFrom = -1; } if (on()) ST.ok++; }
  /* ---- (c) summary の長さ ---- */
  var SUM_MEM3 = 'Japanese, 500 chars max, in three labelled parts.';
  var SUM_MEM3_NEW = 'Japanese, in three labelled parts, 500 characters in total at most (about 10 short sentences): when the story grows, merge older 経過 items into one sentence each so the whole stays within 500 characters.';
  var SUM_BASE = '"summary": "Japanese, 300 chars max.';
  var SUM_BASE_NEW = '"summary": "Japanese, 300 characters at most (about 6 short sentences; when the story grows, merge older happenings into one sentence each so the whole stays within 300 characters).';
  function prompt(p) {
    if (typeof p !== 'string' || !on()) return p;
    if (p.split(SUM_MEM3).length === 2) { ST.prompt++; return p.split(SUM_MEM3).join(SUM_MEM3_NEW); }
    if (p.split(SUM_BASE).length === 2) { ST.prompt++; return p.split(SUM_BASE).join(SUM_BASE_NEW); }
    ST.promptMiss++; return p;
  }
  function cutSummary(s) {
    s = String(s == null ? '' : s); if (!on() || s.length <= SUM_CAP - 1) return s;   /* fix135 の parse は 800 字で切る＝800 字ちょうどは途中で切れた疑い */
    var head = s.slice(0, SUM_CAP), k = Math.max(head.lastIndexOf('。'), head.lastIndexOf('！'), head.lastIndexOf('？'), head.lastIndexOf('\n'));
    if (k >= SUM_CAP * 0.5) { ST.sumCut++; return head.slice(0, k + 1).replace(/\s+$/, ''); }
    return head;
  }
  function tokens(dflt) { var t = PEND; PEND = 0; return (t && on()) ? t : dflt; }
  var PEND = 0; function setTokens(t) { PEND = +t || 0; }
  var api = { VER: VER, why: why, on: on, salvage: salvage, fill: fill, plan: plan, fail: fail, ok: ok, prompt: prompt, cutSummary: cutSummary, tokens: tokens, setTokens: setTokens,
    stats: function () { return JSON.parse(JSON.stringify(ST)); } };
  try { Object.defineProperty(root, '__v292DfixMEMFIX1', { value: Object.freeze(api), configurable: false, enumerable: false, writable: false }); } catch (e) { root.__v292DfixMEMFIX1 = api; }
})(typeof window !== 'undefined' ? window : globalThis);
