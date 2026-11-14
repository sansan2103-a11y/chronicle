/* =====================================================================
 * v292DfixRETRY2-send-policy.js — 文章の送信が失敗したときに「自動で送り直すか・別モデルへ切り替えるか」を決める唯一の判定（★RETRY2・2026-11-15）
 * ---------------------------------------------------------------------
 * ■なぜ（GPT #127-TT）
 *   土台では 1 回の送信操作で最大 9 回送っていた（fix80 の 3 回 × G.submit の 3 段＝最初／fix265 の呼び直し／dscmf-1 の別モデル）。
 *   クライアントの要求 ID は無く、Worker から見ると 9 回とも新しい要求。上流へ届いたか分からない要求（500・通信断・時間切れ）も
 *   新しい要求として作り直し、さらに別モデルへ切り替えていた。
 * ■決まり（この 1 か所だけが決める。fix80 と G.submit はこれを聞くだけ）
 *   ledger   503 + errorCode LEDGER_UNHEALTHY                    → 送り直さない・切り替えない（RETRY1 と同じ）
 *   refused  Worker が上流へ送る前に断った応答                    → 送り直さない・切り替えない
 *              （errorCode 付きの 4xx/5xx。errorCode が無くても error が文字列＝Worker 自身の文の 4xx/5xx も同じ扱い）
 *   payment  402（上流の残高不足など）                            → 送り直さない（fix923 と同じ）・切り替えない
 *   upstream-refused  上流が受け付けなかった 4xx（429 以外）      → 送り直さない・切り替えない（結果は「断られた」で確定）
 *   rate     429（errorCode なし＝上流の一時的な制限、または Worker の一時的な制限の errorCode） → fix80 で 1 回だけ、同じ中身で送り直す。
 *              待ち = Retry-After（ヘッダー・秒か日付）か本文の retryAfterSec。無ければ 8 秒。30 秒を超えるなら送り直さない。fix494 の予算の中だけ。
 *   unknown  上流へ送った後の 5xx（errorCode なし）・上流に送った後と分かる errorCode（anon-upstream）・通信断・時間切れ
 *            → 送り直さない・切り替えない（結果不明の要求を新しい要求として作り直さない）
 *   content  HTTP 200 だが使える本文が無い（出力なし・壊れた生成の破棄）→ G.submit からは呼び直さない（土台も呼び直していない）。
 *              fix80 の品質の再生成（応答を受け取った後の再生成）は今までどおり。
 *   別モデルへの切替（dscmf-1）は既定で止める。localStorage v292DfixRETRY2CmfOn='1' のときだけ、rate と content に限って従来の切替を許す。
 * ■要求 ID: 1 回の操作に 1 つの ID（chrReqId）を作り、本編の送信の本文に付ける。★既定 OFF（v292DfixRETRY2IdOn='1' のときだけ付ける）。
 *   今の Worker は本文の知らない項目を消さずに OpenRouter へそのまま渡すため（DESIGN.md §4）。Worker が chrReqId を受け取って消すようになってから ON にする。
 * ■止める: localStorage v292DfixRETRY2Off='1'（毎回評価・再読み込み不要）→ fix80 も G.submit も土台の動きそのもの（9 回・別モデルへの切替あり）。
 *   この部品が読めないときも同じ（土台の動き）。診断: window.__v292DfixRETRY2.status()（数だけ。文・ID は残さない）
 * ■しないこと: 通信しない・storage に書かない・fetch / G / UI / Api を包まない。送信の中身は変えない（ID の鍵が ON のときだけ本文に chrReqId が付く）。
 * ===================================================================== */
(function () {
  'use strict';
  var G = (typeof window !== 'undefined') ? window : globalThis;
  if (G.__v292DfixRETRY2) return;
  var VER = 'retry2-20261115-a', KILL = 'v292DfixRETRY2Off', CMF_ON = 'v292DfixRETRY2CmfOn', ID_ON = 'v292DfixRETRY2IdOn';
  var RATE_WAIT_DEFAULT_MS = 8000, RATE_WAIT_MAX_MS = 30000, RATE_RESENDS = 1;
  /* Worker の errorCode のうち「上流へ送った後」を意味するもの（結果不明）。ほかの errorCode はすべて上流へ送る前の拒否（DESIGN.md §2） */
  var POST_UPSTREAM = { 'anon-upstream': 1 };
  /* 429 の errorCode のうち「一時的な制限」（待てば通る）。anon-daily・budget（1 日・月の上限）は待っても通らない＝refused */
  var TEMP_429 = { RATE_LIMITED: 1, WRITE_RATE_LIMITED: 1, VAULT2_RATE_LIMITED: 1 };
  var st = { fetchStop: {}, rateResend: 0, rateNoResend: 0, threwStop: 0, submitStop: {}, cmfAllowed: 0, cmfBlocked: 0, ids: 0 };
  function ls(k) { try { return G.localStorage.getItem(k); } catch (e) { return null; } }
  function on() { return ls(KILL) !== '1'; }
  function inc(o, k) { o[k] = (o[k] || 0) + 1; }

  /* 応答の本文（全文または先頭 200 字）→ { code, strErr, objErr, retryAfterSec }。純関数 */
  function body(t) {
    var s = String(t == null ? '' : t), o = { code: '', strErr: false, objErr: false, retryAfterSec: null };
    var i = s.indexOf('{');
    if (i >= 0) { try { var j = JSON.parse(s.slice(i)); if (j && typeof j === 'object') { if (typeof j.errorCode === 'string') o.code = j.errorCode; if (typeof j.error === 'string') o.strErr = true; else if (j.error && typeof j.error === 'object') o.objErr = true; if (typeof j.retryAfterSec === 'number' && isFinite(j.retryAfterSec)) o.retryAfterSec = j.retryAfterSec; } } catch (e) {} }
    if (!o.code) { var c = s.match(/"errorCode"\s*:\s*"([A-Za-z0-9_-]{1,48})"/); if (c) o.code = c[1]; }
    if (!o.strErr && !o.objErr) { if (/"error"\s*:\s*"/.test(s)) o.strErr = true; else if (/"error"\s*:\s*\{/.test(s)) o.objErr = true; }
    if (o.retryAfterSec == null) { var r = s.match(/"retryAfterSec"\s*:\s*(\d{1,6})/); if (r) o.retryAfterSec = +r[1]; }
    return o;
  }
  /* HTTP の番号と本文 → 分類。純関数 */
  function classifyHttp(status, text) {
    var s = +status || 0, b = body(text);
    if (s >= 200 && s < 300) return { cls: 'ok', status: s, code: '' };
    if (s === 503 && b.code === 'LEDGER_UNHEALTHY') return { cls: 'ledger', status: s, code: b.code };
    if (s === 429) {
      if (!b.code || TEMP_429[b.code]) return { cls: 'rate', status: s, code: b.code, retryAfterSec: b.retryAfterSec };
      return { cls: 'refused', status: s, code: b.code };
    }
    if (b.code && POST_UPSTREAM[b.code]) return { cls: 'unknown', status: s, code: b.code };
    if (b.code) return { cls: 'refused', status: s, code: b.code };
    if (b.strErr && s >= 400 && s <= 599) return { cls: 'refused', status: s, code: '' };   /* Worker 自身の文（401 unauthorized・402 月の上限・403 未許可・503 メンテナンス など） */
    if (s === 402) return { cls: 'payment', status: s, code: '' };
    if (s === 408) return { cls: 'unknown', status: s, code: '' };   /* 上流の時間切れ＝結果不明 */
    if (s >= 400 && s <= 499) return { cls: 'upstream-refused', status: s, code: '' };
    if (s >= 500 && s <= 599) return { cls: 'unknown', status: s, code: '' };
    return { cls: 'unknown', status: s, code: '' };
  }
  /* G.submit が受け取った例外 → 分類。純関数（文は "OpenRouter HTTP NNN: <本文の先頭 200 字>" か、通信の例外の文） */
  function classifyErr(err) {
    var m = '', nm = '';
    try { m = String((err && err.message) || err || ''); } catch (e) { m = ''; }
    try { nm = String((err && err.name) || ''); } catch (e) { nm = ''; }
    var h = m.match(/HTTP (\d{3})\b/);
    if (h) { var i = m.indexOf(':', h.index); return classifyHttp(+h[1], i >= 0 ? m.slice(i + 1) : ''); }
    if (nm === 'AbortError' || /abort/i.test(m)) return { cls: 'unknown', status: 0, code: '', why: 'timeout' };
    if (/Failed to fetch|NetworkError|load failed|network connection was lost/i.test(m)) return { cls: 'unknown', status: 0, code: '', why: 'net' };
    if (m.indexOf('出力がありませんでした') >= 0 || m.indexOf('採用しませんでした') >= 0 || m.indexOf('生成が壊れていた') >= 0) return { cls: 'content', status: 200, code: '' };
    return { cls: 'other', status: 0, code: '' };
  }
  /* Retry-After（秒か HTTP の日付）→ ms。読めなければ null */
  function retryAfterMs(hv, bodySec) {
    var v = (hv == null) ? '' : String(hv).trim();
    if (/^\d{1,6}$/.test(v)) return (+v) * 1000;
    if (v) { var t = Date.parse(v); if (isFinite(t)) return Math.max(0, t - Date.now()); }
    if (typeof bodySec === 'number' && isFinite(bodySec) && bodySec >= 0) return bodySec * 1000;
    return null;
  }

  /* fix80（fetch の包み）から: 非 2xx の応答を受け取ったとき。null = この部品は決めない（土台の動き）。
     { resend:false } = その応答をそのまま返す。{ resend:true, waitMs } = 待って同じ中身で 1 回だけ送り直す。
     budget = fix494 の共通予算（init に付いている・送信の本文には入らない）。送り直しの数はそこに数える（fix80 が何層あっても 1 回まで） */
  async function fetchPlan(resp, budget, attempt) {
    if (!on() || !resp) return null;
    var t = ''; try { t = await resp.clone().text(); } catch (e) { t = ''; }
    var c = classifyHttp(resp.status, t);
    if (c.cls === 'ok') return null;
    if (c.cls !== 'rate') { inc(st.fetchStop, c.cls); return { resend: false, cls: c.cls }; }
    var used = budget ? (budget.r2RateResends | 0) : ((attempt | 0) > 0 ? RATE_RESENDS : 0);
    var hv = null; try { hv = resp.headers && resp.headers.get ? resp.headers.get('Retry-After') : null; } catch (e) { hv = null; }
    var ra = retryAfterMs(hv, c.retryAfterSec), wait = (ra == null) ? RATE_WAIT_DEFAULT_MS : Math.max(1000, ra);
    var left = budget ? (+budget.remaining || 0) : 1;
    if (used >= RATE_RESENDS || wait > RATE_WAIT_MAX_MS || left <= 0) { st.rateNoResend++; return { resend: false, cls: 'rate' }; }
    if (budget) { try { budget.r2RateResends = used + 1; } catch (e) {} }
    st.rateResend++;
    return { resend: true, waitMs: wait, cls: 'rate' };
  }
  /* fix80 から: 送信の例外（通信断・時間切れ）。true = 送り直さずにそのまま投げる */
  function stopOnThrow() { if (!on()) return false; st.threwStop++; return true; }
  /* G.submit（fix265 の行）から: 1 回目の失敗の例外。null = 土台の動き（fix265・dscmf-1）。
     { cmf:false } = 呼び直さず・切り替えずに失敗の枝へ。{ cmf:true } = 従来の別モデルへの切替を 1 回だけ試す（鍵 v292DfixRETRY2CmfOn='1' のときだけ） */
  function submitPlan(err) {
    if (!on()) return null;
    var c = classifyErr(err), k = c.why || c.cls;
    inc(st.submitStop, k);
    var cmf = (ls(CMF_ON) === '1') && (c.cls === 'rate' || c.cls === 'content');
    if (cmf) st.cmfAllowed++; else st.cmfBlocked++;
    return { cmf: cmf, cls: c.cls, why: c.why || null };
  }
  /* 要求 ID（既定 OFF）。turn = Api.__e65aTurn（1 回の操作で 1 つ）。別モデルへ切り替えた送信は別の印（-f1）を付ける */
  function uuid() {
    try { if (G.crypto && typeof G.crypto.randomUUID === 'function') return G.crypto.randomUUID(); } catch (e) {}
    var b = new Uint8Array(16); try { G.crypto.getRandomValues(b); } catch (e) { for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256); }
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128; var h = ''; for (var j = 0; j < 16; j++) h += (b[j] + 256).toString(16).slice(1);
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function reqIdFor(turn, isFallback) {
    if (!on() || ls(ID_ON) !== '1' || !turn || typeof turn !== 'object') return null;
    try { if (!turn.__r2id) { Object.defineProperty(turn, '__r2id', { value: uuid(), enumerable: false, configurable: true, writable: true }); st.ids++; } } catch (e) { return null; }
    return isFallback ? (turn.__r2id + '-f1') : turn.__r2id;
  }
  function netKind(raw, name) {
    if (!on()) return null;
    var c = classifyErr({ message: raw, name: name || '' });
    return (c.cls === 'unknown' && c.status === 0) ? c.why : null;
  }
  G.__v292DfixRETRY2 = { VER: VER, on: on, classifyHttp: classifyHttp, classifyErr: classifyErr, retryAfterMs: retryAfterMs,
    fetchPlan: fetchPlan, stopOnThrow: stopOnThrow, submitPlan: submitPlan, reqIdFor: reqIdFor, netKind: netKind,
    status: function () { var o = JSON.parse(JSON.stringify(st)); o.ver = VER; o.on = on(); o.cmfOn = ls(CMF_ON) === '1'; o.idOn = ls(ID_ON) === '1'; return o; } };
})();
