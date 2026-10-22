/* v292DfixBF1 — B/F-EMPTY: 「推論で max_tokens を使い切った空応答」の再送を“同じ要求の再送”から“条件を変えた 1 回”へ置き換える
 * (GPT gate #127-IZ / 局所のみ)
 *
 * ■ 起きていたこと（実 API 実測 2026-10-21）
 *   deepseek/deepseek-v4.1-flash を OpenRouter 経由で呼ぶと、provider Novita が reasoning:{effort:'none'} を無視して
 *   max_tokens を推論で食い潰し、HTTP 200 / content 空 / finish_reason='length' / reasoning_tokens>0 を返す（29〜71 秒）。
 *   fix80（v292Dfix80-gen-gate-retry.js）は「空」を gate 失敗とみなして**同じ要求をそのまま最大 3 回**再送するので、
 *   同じ provider に同じ失敗を 3 回食らい（約 2 分）、最後に「OpenRouterから出力がありませんでした」になっていた。
 *
 * ■ これは何か
 *   window.fetch の薄い wrapper。**OpenRouter の chat/completions（非 stream）への POST の応答**だけを見て、
 *     HTTP 200 かつ content が空 かつ choices[0].finish_reason==='length' かつ usage.completion_tokens_details.reasoning_tokens>0
 *   のときだけ作用する（= 「推論で使い切った」と確定できる 1 型だけ。他の finish_reason・他のエラー・短文・外国語混入には触らない）。
 *   作用 = 「条件を変えた代替要求」を**最大 1 回**だけ送る:
 *     ・reasoning を {enabled:false} にする（すでに enabled:false なら変えない）
 *     ・応答が `provider`（例 'Novita'）を露出していれば、その slug を provider.ignore に足す（すでに入っていれば足さない）
 *   どちらも変えられない（= 意味のある別条件が無い）、または共通予算が尽きている、または匿名経路（Worker が権威）なら
 *   **代替要求は送らず**、その場で失敗を確定する。
 *   「失敗を確定する」= fix80/fix482 が共有する再試行予算（init.__chronicleAttemptBudget）を 0 にする。
 *   すると fix80 は同一要求の再送をしないで last（空の 200）を返し、_callOpenRouter の既存の
 *   `if (!text) throw new Error('OpenRouterから出力がありませんでした')` に合流する（新しい文言も新しい経路も作らない）。
 *   代替要求が成功（content 非空）したら、その応答をそのまま返す（fix80 の gate を通る = 総送信 2 本）。
 *   代替要求も失敗（HTTP エラー / 例外 / また空）なら、予算を 0 にして**元の空の 200**を返す（= 総送信 2 本 → 既存のエラー。
 *   代替側の HTTP 5xx / 例外は返さない = G.submit の 5xx 透過再試行を誘発しない）。
 *
 * ■ 位置（wrapper の順序）
 *   index.html で fix80 の script の**直前**に置く。fix80 は load 時の window.fetch を“予算の所有者の inner”として固定するので、
 *   この wrapper がその inner になる。fix80 の内側・fix247（proxy 書き換え）の外側 = 書き換え前の URL と、registry が足した
 *   policy 入りの body をそのまま見る。代替要求は inner（orig）を直接呼ぶので、この wrapper を再入しない（二重適用なし）。
 *   代替要求は予算を 1 本消費する（remaining-- / sent++）。予算が 0 なら代替は出さない（再試行の上に積まない）。
 *
 * ■ 触らないもの
 *   sampling・max_tokens・messages・model・他の finish_reason・他のエラー・fix80/fix482/fix494 本体・registry の policy 表。
 *   XHR 経路（背景生成）は対象外（registry の policy 側の novita 除外で効く）。
 *
 * ★r40 既定 OFF（opt-in）: localStorage v292DfixBF1On='1' のときだけ作用。kill: v292DfixBF1Off='1'（On より常に優先・呼び出しごとに読む = リロード不要）→ 従来どおり（同一要求の再送 3 回）。
 * ★BF1-OWNER（GPT #127-JO BF1_CLIENT_OWNER_DEFAULT_ON = CONDITIONAL_GO_NEXT_BUNDLE）: Owner だけ既定 ON。
 *   enabled(opts) = !kill && ( optIn==='1' || ( !匿名ヘッダ && ownerGate() ) )
 *   ownerGate() = 既存の信頼済み Owner 判定（fix905 と同じ読み口）: window.__v292Dfix893.serverMe()（server 由来 /auth/me・in-memory）が
 *                 entitlement==='owner' かつ status==='active' のときだけ true。/auth/me 未応答・失敗・401・非 owner・API 不在・例外 → false（fail-closed）。
 *   ・**呼び出しごと**に評価する（fetch 1 本ごと。load 時に固定しない）。/auth/me がまだ返っていない呼び出しは OFF として振る舞う。
 *   ・匿名ヘッダ（x-chronicle-anon = Worker が権威）の要求では ownerGate を見ない（= Owner 経路と Customer 経路を混ぜない）。opt-in は従来どおり。
 *   ・kill v292DfixBF1Off='1' は Owner でも常に勝つ。storage が読めない = kill 不明 = OFF（fail-closed）。
 *   ・書くもの: なし（localStorage / sessionStorage / IDB へ一切書かない）。/auth/me を増やさない（serverMe() は cache を読むだけ）。
 *   記録（BF1 stats・in-memory）: 要求ごとに generation id / provider / usage.cost / 送信本数 / gate の理由を events（最大 30 件）へ残す。
 * 検証口: window.__v292DfixBF1.stats() / .gate() / .isEnabled()
 */
(function v292DfixBF1(){
  'use strict';
  if (typeof window === 'undefined' || window.__v292DfixBF1) return;
  var TAG = '[v292DfixBF1]';
  var BUDGET_KEY = '__chronicleAttemptBudget';
  var stats = { seen: 0, exhausted: 0, alt: 0, altOk: 0, altFail: 0, noAlt: 0, lastWhy: '', lastAt: 0, gateOwner: 0, gateOptIn: 0, gateKilled: 0, gateOff: 0, gateAnon: 0, lastGate: '', events: [] };
  var EVENTS_MAX = 30;

  /* ★r40 (GPT #127-JF): 初回出荷は OFF。localStorage v292DfixBF1On==='1' のときだけ作用。v292DfixBF1Off==='1' は強制停止で常に勝つ。storage 不可 = OFF。
     ★BF1-OWNER (GPT #127-JO): Owner（server 由来 /auth/me で entitlement owner・status active）は既定 ON。呼び出しごとに評価・fail-closed・匿名ヘッダでは見ない。 */
  function ownerGate(){
    try {
      var A = window.__v292Dfix893;
      if (!A || typeof A.serverMe !== 'function') return false;              /* account API 不在 = fail-closed */
      var me = A.serverMe();                                                  /* server 由来の cache（mark は読まない）。未応答 = null */
      return !!(me && me.entitlement === 'owner' && me.status === 'active');
    } catch(e){ return false; }
  }
  /* 戻り: 'killed' | 'optin' | 'owner' | 'anon' | 'off'。有効 = 'optin' か 'owner'。 */
  function gateOf(opts){
    var kill, on;
    try { kill = localStorage.getItem('v292DfixBF1Off'); on = localStorage.getItem('v292DfixBF1On'); } catch(e){ return 'killed'; }   /* storage 不可 = kill 不明 = OFF */
    if (kill === '1') return 'killed';
    if (on === '1') return 'optin';
    if (isAnon(opts)) return 'anon';                                          /* Customer 経路（Worker 権威）では Owner 判定を使わない */
    return ownerGate() ? 'owner' : 'off';
  }
  function enabledFor(opts){ var g = gateOf(opts); return g === 'optin' || g === 'owner'; }
  function enabled(){ return enabledFor(null); }
  function off(){ return !enabled(); }
  function log(){ try { console.log.apply(console, [TAG].concat([].slice.call(arguments))); } catch(e){} }

  function isCompletionUrl(u){
    if (typeof u !== 'string') return false;
    return u.indexOf('openrouter.ai/api/v1/chat/completions') !== -1 || /\/openrouter\.ai\/?(\?.*)?$/.test(u);
  }
  function hasHeader(h, name){
    try {
      if (!h) return false;
      name = String(name).toLowerCase();
      if (typeof h.has === 'function') return !!h.has(name);
      if (Array.isArray(h)) { for (var i = 0; i < h.length; i++) if (h[i] && String(h[i][0]).toLowerCase() === name) return true; return false; }
      for (var k in h) if (Object.prototype.hasOwnProperty.call(h, k) && String(k).toLowerCase() === name) return true;
    } catch(e){}
    return false;
  }
  function isAnon(opts){ return !!(opts && hasHeader(opts.headers, 'x-chronicle-anon')); }   /* 匿名経路 = Worker が model/provider/reasoning の権威 */
  function budgetOf(opts){ var b = opts && opts[BUDGET_KEY]; return (b && typeof b === 'object') ? b : null; }
  function stopRetries(b){ try { if (b) { b.remaining = 0; b.bf1 = 1; } } catch(e){} }   /* fix80/fix482 の再送を止める（共有予算を 0 に） */

  function parseJson(text){
    try { var i = String(text).indexOf('{'); if (i < 0) return null; return JSON.parse(String(text).slice(i)); } catch(e){ return null; }
  }
  function choice0(j){ return (j && j.choices && j.choices[0]) || null; }
  function contentOf(j){
    var c = choice0(j), m = c && c.message, t = m && m.content;
    if (typeof t === 'string') return t;
    if (Array.isArray(t)) { var s = ''; for (var i = 0; i < t.length; i++) if (t[i] && typeof t[i].text === 'string') s += t[i].text; return s; }
    return '';
  }
  function reasoningTokens(j){
    var d = j && j.usage && j.usage.completion_tokens_details, n = d && d.reasoning_tokens;
    return (typeof n === 'number' && isFinite(n)) ? n : 0;
  }
  /* 「推論で使い切った空応答」= この 1 型だけ。 */
  function isExhausted(j){
    var c = choice0(j);
    return !!c && !String(contentOf(j)).trim() && c.finish_reason === 'length' && reasoningTokens(j) > 0;
  }
  function slug(s){ return String(s).trim().toLowerCase().replace(/\s+/g, '-'); }
  function norm(s){ return String(s).toLowerCase().replace(/[^a-z0-9]/g, ''); }

  /* 代替要求の body。意味のある別条件が 1 つも作れなければ null。 */
  function buildAlt(body, j){
    var nb, changed = [];
    try { nb = JSON.parse(JSON.stringify(body)); } catch(e){ return null; }
    var r = nb.reasoning;
    if (!(r && typeof r === 'object' && r.enabled === false)) { nb.reasoning = { enabled: false }; changed.push('reasoning.enabled=false'); }
    var pv = (j && typeof j.provider === 'string' && j.provider.trim()) ? slug(j.provider) : '';
    if (pv) {
      var pr = nb.provider;
      if (pr == null || (typeof pr === 'object' && !Array.isArray(pr))) {
        pr = pr || {};
        var ig = Array.isArray(pr.ignore) ? pr.ignore.slice() : [];
        var seen = false; for (var i = 0; i < ig.length; i++) if (norm(ig[i]) === norm(pv)) seen = true;
        if (!seen) { ig.push(pv); pr.ignore = ig; nb.provider = pr; changed.push('provider.ignore+' + pv); }
      }
    }
    return changed.length ? { body: nb, changed: changed } : null;
  }

  function note(ev, j, pfx){   /* BF1 stats: generation id / provider / cost / reasoning tokens（in-memory のみ） */
    try {
      if (!ev || !j) return;
      ev[pfx + 'id'] = (typeof j.id === 'string') ? j.id : '';
      ev[pfx + 'provider'] = (typeof j.provider === 'string') ? j.provider : '';
      ev[pfx + 'cost'] = (j.usage && typeof j.usage.cost === 'number') ? j.usage.cost : null;
      ev[pfx + 'reasoning_tokens'] = reasoningTokens(j);
    } catch(e){}
  }
  function judge(self, orig, url, opts, resp, ev){
    ev = ev || {};
    if (!resp || resp.status !== 200 || typeof resp.clone !== 'function') { ev.result = 'http' + (resp && resp.status); return resp; }
    var body; try { body = JSON.parse(opts.body); } catch(e){ return resp; }
    return resp.clone().text().then(function(text){
      var j = parseJson(text);
      note(ev, j, '');
      if (!j || !isExhausted(j)) { ev.result = 'ok'; return resp; }
      ev.result = 'exhausted';
      stats.exhausted++; stats.lastAt = Date.now();
      var budget = budgetOf(opts), why = '';
      if (isAnon(opts)) why = 'anon';
      else if (budget && !(budget.remaining > 0)) why = 'budget';
      var alt = why ? null : buildAlt(body, j);
      if (!alt) {
        stats.noAlt++; stats.lastWhy = why || 'no-different-condition';
        stopRetries(budget);
        ev.result = 'exhausted:no-alt:' + stats.lastWhy;
        log('reasoning-exhausted empty response; no alternative (' + stats.lastWhy + ') -> fail now');
        return resp;
      }
      if (budget) { budget.remaining--; budget.sent = (budget.sent || 0) + 1; }
      stats.alt++; stats.lastWhy = 'alt:' + alt.changed.join(','); ev.sent = 2; ev.altChanged = alt.changed.slice();
      log('reasoning-exhausted empty response; one alternative request:', alt.changed.join(', '));
      var o2 = {}; for (var k in opts) if (Object.prototype.hasOwnProperty.call(opts, k)) o2[k] = opts[k];
      o2.body = JSON.stringify(alt.body);
      /* 代替要求が失敗したら（HTTP エラー・例外・また空）元の“空の 200”をそのまま返す = 既存の
         `if (!text) throw new Error('OpenRouterから出力がありませんでした')` に合流する。代替側の HTTP 5xx / 例外を返すと
         G.submit の 5xx 透過再試行（fix265/269）が別の論理呼び出しを起こして「元要求＋代替」を繰り返すため、返さない。 */
      var p2; try { p2 = orig.call(self, url, o2); } catch(e){ stats.altFail++; stopRetries(budget); ev.result = 'alt:threw'; return resp; }
      return p2.then(function(r2){
        if (!r2 || r2.status !== 200 || typeof r2.clone !== 'function') { stats.altFail++; stopRetries(budget); ev.result = 'alt:http' + (r2 && r2.status); return resp; }
        return r2.clone().text().then(function(t2){
          var j2 = parseJson(t2);
          note(ev, j2, 'alt_');
          if (j2 && String(contentOf(j2)).trim()) { stats.altOk++; ev.result = 'alt:ok'; return r2; }
          stats.altFail++; stopRetries(budget); ev.result = 'alt:empty'; return resp;
        }, function(){ stats.altFail++; stopRetries(budget); ev.result = 'alt:read-error'; return resp; });
      }, function(){ stats.altFail++; stopRetries(budget); ev.result = 'alt:network-error'; return resp; });
    }, function(){ return resp; });
  }

  if (typeof window.fetch !== 'function' || window.fetch._bf1) return;
  var orig = window.fetch;
  var wrapped = function(url, opts){
    var self = this, args = arguments;
    try {
      if (!isCompletionUrl(url) || !opts || typeof opts.body !== 'string' || String(opts.method || '').toUpperCase() !== 'POST') return orig.apply(self, args);
      var b0 = JSON.parse(opts.body);
      if (!b0 || typeof b0 !== 'object' || b0.stream === true) return orig.apply(self, args);
      /* ★BF1-OWNER: gate は**この呼び出し**で評価（load 時に固定しない）。無効なら素通し = bundle40-b と同じ。 */
      var g = gateOf(opts); stats.lastGate = g;
      if (g === 'killed') stats.gateKilled++; else if (g === 'optin') stats.gateOptIn++; else if (g === 'owner') stats.gateOwner++; else if (g === 'anon') stats.gateAnon++; else stats.gateOff++;
      if (g !== 'optin' && g !== 'owner') return orig.apply(self, args);
    } catch(e){ return orig.apply(self, args); }
    stats.seen++;
    var ev = { at: Date.now(), gate: g, model: b0.model || '', sent: 1, id: '', provider: '', cost: null, reasoning_tokens: null, result: '' };
    try { stats.events.push(ev); if (stats.events.length > EVENTS_MAX) stats.events.splice(0, stats.events.length - EVENTS_MAX); } catch(e){}
    var p = orig.apply(self, args);
    if (!p || typeof p.then !== 'function') return p;
    return p.then(function(resp){
      try { return judge(self, orig, url, opts, resp, ev); } catch(e){ return resp; }
    }, function(err){ ev.result = 'error'; throw err; });
  };
  try { Object.keys(orig).forEach(function(k){ wrapped[k] = orig[k]; }); } catch(e){}   /* fix419c: 内側の own props を継承 */
  wrapped._bf1 = true;
  window.fetch = wrapped;

  window.__v292DfixBF1 = {
    version: 'v292DfixBF1-20261022-owner',
    isOff: off,
    isEnabled: enabled,
    gate: function(opts){ return gateOf(opts || null); },   /* 'killed' | 'optin' | 'owner' | 'anon' | 'off'（呼び出し時点の判定） */
    ownerGate: ownerGate,
    stats: function(){ var o = {}; for (var k in stats) o[k] = (k === 'events') ? JSON.parse(JSON.stringify(stats.events)) : stats[k]; return o; },
    _analyze: function(j){ return { exhausted: isExhausted(j), alt: buildAlt({ reasoning: { effort: 'none' } }, j) }; }
  };
  log('armed (inside fix80 / outside fix247)');
})();
