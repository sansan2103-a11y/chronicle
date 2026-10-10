/* v292DfixCTX-context-restore.js (2026-10-09 Session A・GPT #125-BJ CONTEXT_RESTORE_SMALL_AB の C 案・Offline)
 * ─ 直近 2 ターン（recentScenes）の前の 2 ターンの本文を、user payload に最大 800 字だけ足す ─
 *
 * 背景（実測 ledger 1309）: 新エンジンでモデルに渡る文脈は recentScenes（直近 2 ターン）＋ storySoFar（要約か代替文）だけ。
 *   3〜4 ターン前の約束・所在・負傷・同行者が prompt から消える。
 * この fix: fix58 の userExt が作った JSON に `earlierScenes`（turns[-4..-3]）を足すだけ。
 *   ・recentScenes（turns[-2..]）と重ならない（添字で分ける＝重複注入なし）
 *   ・合計 800 字以内（超える分は古い方から切る。<say>/<state> 等のタグは除いて本文だけ）
 *   ・S.turns から毎回作る＝取消・retryRollback で消えたターンは入らない。保存 payload は変えない（新キー・新 Store 0）
 *   ・sys は変えない（0 字）。user に earlierScenesRule（1 文）を足すだけ（再演・引用の禁止を earlierScenes にも及ぼす）。fix58 との実行順に依存しない
 *   ・ターン数が 2 以下なら何もしない（byte 同一）
 * 既定 OFF（opt-in localStorage v292DfixCTXOn='1' かつ v292DfixGQStories に物語 id）／kill v292DfixCTXOff='1'。OFF は user/sys とも byte 同一。
 * r2: 適用範囲を v292DfixGQStories の物語だけに限定（GPT #125-BL）。
 * 冪等: window.__v292DfixCTX
 */
(function(){
  'use strict';
  if (window.__v292DfixCTX) return;
  var TAG = '[v292DfixCTX]', VER = 'r2', MAX = 800, N = 2;
  function gqScope(){ try { var k = window.__chronicleDocumentStoryKey; var id = (typeof k === 'string' && k.indexOf('chr6_slot_') === 0) ? k.slice(10) : null; if (!id) return false; var list = String(localStorage.getItem('v292DfixGQStories') || '').split(',').map(function(x){ return x.trim(); }).filter(Boolean); return list.indexOf(id) >= 0; } catch(e){ return false; } } /* GPT #125-BL: opt-in 機能は QA 物語だけ（v292DfixGQStories にカンマ区切りで物語 id。未設定なら動かない） */
  function on(){ try { return localStorage.getItem('v292DfixCTXOff') !== '1' && localStorage.getItem('v292DfixCTXOn') === '1' && gqScope(); } catch(e){ return false; } }
  function getS(){ try { if (typeof window.__chronicleGetState === 'function'){ var s = window.__chronicleGetState('fixCTX'); if (s) return s; } } catch(e){} try { return (0, eval)('typeof S !== "undefined" ? S : null'); } catch(e2){ return null; } }
  function plain(narr){
    var t = String(narr || '');
    t = t.replace(/<say\s+who="[^"]*">([\s\S]*?)<\/say>/g, '$1').replace(/<say\s+who='[^']*'>([\s\S]*?)<\/say>/g, '$1');
    t = t.replace(/<(?:state|react|summary|scene|memory)\b[^>]*\/?>/g, '').replace(/<\/(?:state|react|summary|scene|memory)>/g, '');
    t = t.replace(/<summary>[\s\S]*?<\/summary>/g, '');
    return t.replace(/[ \t　]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
  }
  function build(S){
    var turns = (S && Array.isArray(S.turns)) ? S.turns : [];
    if (turns.length <= N) return null;
    var lo = Math.max(0, turns.length - N - N), hi = turns.length - N; /* turns[-4..-3]（recentScenes の直前 2 ターン） */
    var picked = [];
    for (var i = lo; i < hi; i++){ var t = turns[i]; if (!t) continue; picked.push({ turn: i + 1, input: { type: t.inputType, text: String(t.playerText || '') }, narrative: plain(t.narrative) }); }
    if (!picked.length) return null;
    var budget = MAX;
    for (var k = picked.length - 1; k >= 0; k--){ /* 新しい方を優先して残す */
      var p = picked[k], used = p.input.text.length;
      var room = Math.max(0, budget - used);
      if (p.narrative.length > room) p.narrative = room > 1 ? (p.narrative.slice(0, room - 1) + '…') : '';
      budget -= (used + p.narrative.length);
      if (budget <= 0){ picked = picked.slice(k); break; }
    }
    picked = picked.filter(function(p){ return p.narrative || p.input.text; });
    return picked.length ? picked : null;
  }
  var last = null;
  function userExt(ctx){
    if (!on()) return ctx.user;
    try {
      var parsed = JSON.parse(ctx.user);
      if (!parsed || typeof parsed !== 'object' || !parsed.currentInput) return ctx.user; /* 新エンジンの user JSON だけ（順序に依存しない: fix58 は自分のキーだけ書き換える） */
      var S = ctx.state || getS();
      var es = build(S);
      last = { turns: S && S.turns ? S.turns.length : 0, earlier: es ? es.length : 0, chars: es ? es.reduce(function(a, p){ return a + p.input.text.length + p.narrative.length; }, 0) : 0 };
      if (!es) return ctx.user;
      parsed.earlierScenes = es;
      parsed.earlierScenesRule = 'earlierScenes は recentScenes の前の場面。約束・所在・負傷・同行者の連続性にだけ使い、再演・言い換え・引用は禁止。';
      return JSON.stringify(parsed, null, 2);
    } catch(e){ try { console.warn(TAG, 'userExt error:', e && e.message); } catch(_e){} return ctx.user; }
  }
  userExt.__v292DfixCTX = true;
  function install(){
    var P = window.Planner;
    if (!P || typeof P.build !== 'function'){ setTimeout(install, 300); return; }
    P._userExtensions = P._userExtensions || [];
    if (!P._userExtensions.some(function(f){ return f && f.__v292DfixCTX; })) P._userExtensions.push(userExt); /* 末尾＝fix58 の後 */
  }
  window.__v292DfixCTX = { VER: VER, MAX: MAX, on: on, build: build, plain: plain, last: function(){ return last; }, __userExt: userExt };
  install();
})();
