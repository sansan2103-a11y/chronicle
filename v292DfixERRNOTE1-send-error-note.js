/* =====================================================================
 * v292DfixERRNOTE1-send-error-note.js — 物語の送信がサーバーに断られたとき（HTTP 4xx/5xx）、理由を画面に出したままにする（★ERRNOTE1・2026-11-14）
 * ---------------------------------------------------------------------
 * ■なぜ
 *   本番の実走で、送信が HTTP 402（AI の利用残高の不足）や 503 LEDGER_UNHEALTHY で通らなかったとき「押しても何も起きない」に見えた。
 *   調べた結果（Local・偽 AI）: 既存の失敗表示（index.html fix263a の赤い知らせ #v263toast）は出ている。ただし
 *     ・60 秒で自動的に消える。上の一行（#topStatus）の「うまくいきませんでした」もすぐ空になる → 1 分後に画面を見ると何も残っていない（入力欄の文だけ）。
 *     ・503 は自動の送り直しの後（押してから十数秒後）に出るので、出た時点で画面を見ていないことが多い。
 *     ・文面が原因を言わない: 残高不足の 402 は「利用上限に達しました」（月の上限と同じ文）、LEDGER_UNHEALTHY は「生成に失敗しました。もう一度お試しください」。
 * ■すること（表示だけ）
 *   index.html G.submit の失敗の枝（既存の知らせを出した直後）から fail(生のエラー文) を 1 回呼んでもらう。HTTP の番号が読めたときだけ:
 *     402（サーバー自身の月の上限の 402 ではないもの） → 「AI の利用残高が足りないため、送れませんでした。管理者に連絡してください。」
 *     503 で errorCode が LEDGER_UNHEALTHY              → サーバーの error の文をそのまま（日本語の短い文のときだけ）
 *     既存の対応表に文があるもの（月の上限・招待・ログインなど） → その文のまま
 *     それ以外の 4xx/5xx                                 → 「サーバー側の理由で送れませんでした（番号 NNN）。少し時間をおいて、もう一度送ってください。」
 *   を、入力欄のすぐ上に 1 つだけ出す。✕ を押す・次の送信が始まる まで消えない。既存の赤い知らせ（60 秒で消える方）は、同じ内容の二重表示になるので外す。
 * ■しないこと
 *   送り直さない（「再試行」ボタンも付けない＝入力欄に文が残っているので、もう一度「送信」を押せばよい）。入力欄・本文・会話ログ・保存・sys・送信の中身には触らない。
 *   fetch / G / UI / Api を包まない。通信しない。storage に書かない。HTTP の番号が無い失敗（通信断・時間切れ・組み立ての失敗）は従来の知らせのまま。
 *   画面に出すのは上の決まった文と番号だけ（サーバーの英語の文・JSON・内部の語は出さない）。
 * ■止める: localStorage v292DfixERRNOTE1Off='1'（毎回評価。fail() が何もしない＝従来の知らせだけ）。診断: window.__v292DfixERRNOTE1.status()（数だけ。文は残さない）
 * ===================================================================== */
(function () {
  'use strict';
  var G = (typeof window !== 'undefined') ? window : globalThis;
  if (G.__v292DfixERRNOTE1) return;
  var VER = 'errnote1-20261114-a', KILL = 'v292DfixERRNOTE1Off', ID = 'errnote1', TOAST = 'v263toast';
  var T_402 = 'AI の利用残高が足りないため、送れませんでした。管理者に連絡してください。';
  var T_LEDGER_FALLBACK = 'サーバーが一時停止しているため、送れませんでした。少し時間をおいて、もう一度送ってください。';
  var T_KEEP = '入力した文は残っています。';
  var TOAST_DEFAULT = '生成に失敗しました。もう一度お試しください。', TOAST_TAIL = '入力は残してあります。';
  var CONT_SENTINEL = '続きを自然に進めてください。';
  var st = { calls: 0, shown: 0, killed: 0, noStatus: 0, kinds: {}, dismissed: 0, clearedBySend: 0, err: 0, lastStatus: null, lastKind: null };
  var timer = null;
  function killed() { try { return G.localStorage.getItem(KILL) === '1'; } catch (e) { return false; } }
  function $(id) { try { return document.getElementById(id); } catch (e) { return null; } }

  /* 生のエラー文（例: "OpenRouter HTTP 503: {…}"。本文は 200 字で切られている）→ { status, code, error } 。純関数 */
  function parse(raw) {
    var m = String(raw == null ? '' : raw), o = { status: 0, code: '', error: null, parsed: false };
    var h = m.match(/HTTP (\d{3})\b/); if (!h) return o; o.status = +h[1];
    var i = m.indexOf('{', h.index);
    if (i >= 0) { try { var j = JSON.parse(m.slice(i)); if (j && typeof j === 'object') { o.parsed = true; if (typeof j.errorCode === 'string') o.code = j.errorCode; o.error = j.error; } } catch (e) {} }
    if (!o.code) { var c = m.match(/"errorCode"\s*:\s*"([A-Za-z0-9_-]{1,40})"/); if (c) o.code = c[1]; }
    return o;
  }
  /* サーバーの error の文を画面に出してよいか: 文字列・短い・英字や記号（JSON・URL・内部の語）を含まない */
  function plainJa(s) { return typeof s === 'string' && s.length >= 4 && s.length <= 80 && !/[A-Za-z{}\[\]<>\\\/:="']/.test(s); }
  /* 出す文を決める。toastText = 既存の知らせの文（対応表で決まった公開用の文）。null を返したら何も出さない（従来のまま）。純関数 */
  function decide(raw, toastText) {
    var p = parse(raw); if (!(p.status >= 400 && p.status <= 599)) return null;
    var kept = String(toastText || '').replace(/^⚠\s*/, ''); if (kept.slice(-TOAST_TAIL.length) === TOAST_TAIL) kept = kept.slice(0, -TOAST_TAIL.length);
    var specific = !!kept && kept !== TOAST_DEFAULT;
    if (p.status === 402 && !p.code && !(p.parsed && typeof p.error === 'string')) return { kind: '402', status: 402, text: T_402 };   /* サーバー自身の 402（月の上限）は error が日本語の文字列 → 下の「既存の文のまま」へ */
    if (p.status === 503 && p.code === 'LEDGER_UNHEALTHY') return { kind: 'ledger', status: 503, text: plainJa(p.error) ? (/[。！]$/.test(p.error) ? p.error : p.error + '。') : T_LEDGER_FALLBACK };
    if (specific) return { kind: 'mapped', status: p.status, text: kept };   /* 既存の対応表が決めた公開用の文（月の上限・招待・ログインなど）はそのまま */
    return { kind: 'other', status: p.status, text: 'サーバー側の理由で送れませんでした（番号 ' + p.status + '）。少し時間をおいて、もう一度送ってください。' };
  }

  var mo = null;
  function remove(why) { var n = $(ID); if (n && n.parentNode) n.parentNode.removeChild(n); if (timer) { try { clearInterval(timer); } catch (e) {} timer = null; } if (mo) { try { mo.disconnect(); } catch (e) {} mo = null; } if (n && why) st[why] = (st[why] || 0) + 1; }
  function place(n) { try { var c = $('composer'); var h = c ? Math.round(c.getBoundingClientRect().height) : 0; n.style.bottom = 'calc(' + (h > 0 ? h + 8 : 96) + 'px + env(safe-area-inset-bottom, 0px))'; } catch (e) {} }
  function show(d) {
    remove(null);
    var n = document.createElement('div'); n.id = ID; n.setAttribute('role', 'alert'); n.setAttribute('aria-live', 'assertive'); n.setAttribute('data-errnote1-kind', d.kind);
    n.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);z-index:99999;box-sizing:border-box;width:min(560px,calc(100vw - 16px));background:#3a1418;color:#ffd9d9;border:1px solid #a04040;border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.6;box-shadow:0 4px 16px rgba(0,0,0,.5);display:flex;gap:10px;align-items:flex-start';
    var s = document.createElement('span'); s.style.cssText = 'flex:1 1 auto;min-width:0;white-space:normal;word-break:break-word';
    var keep = false; try { var inp = $('inp'); keep = !!(inp && inp.value && inp.value.trim() && inp.value.trim() !== CONT_SENTINEL); } catch (e) {}
    s.textContent = '⚠ ' + d.text + (keep ? T_KEEP : '');
    var x = document.createElement('button'); x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label', '閉じる');
    x.style.cssText = 'flex:none;background:none;color:#caa;border:0;cursor:pointer;font-size:16px;line-height:1;padding:4px 6px;min-width:32px;min-height:32px';
    x.onclick = function () { remove('dismissed'); };
    n.appendChild(s); n.appendChild(x); place(n);
    (document.body || document.documentElement).appendChild(n);
    /* 次の送信が始まったら（送信ボタンが止まる＝UI.setLoading(true)）外す。表示中だけ動く見張り（通信・保存なし） */
    try { var sb = $('sendBtn'); if (sb && typeof MutationObserver === 'function') { mo = new MutationObserver(function () { try { if (sb.disabled) remove('clearedBySend'); } catch (e) {} }); mo.observe(sb, { attributes: true, attributeFilter: ['disabled'] }); } } catch (e) { mo = null; }   /* 短い送信でも見落とさない */
    timer = setInterval(function () { try { var b = $('sendBtn'), cur = $(ID); if (!cur) { clearInterval(timer); timer = null; return; } if (b && b.disabled) { remove('clearedBySend'); return; } place(cur); } catch (e) {} }, 400);
  }
  /* index.html G.submit の失敗の枝から 1 回呼ばれる。true = この部品が表示を引き受けた */
  function fail(raw) {
    try {
      st.calls++;
      if (killed()) { st.killed++; return false; }
      var t = $(TOAST), sp = t ? t.querySelector('span') : null;
      var d = decide(raw, sp ? sp.textContent : '');
      if (!d) { st.noStatus++; return false; }
      if (t && t.parentNode) t.parentNode.removeChild(t);   /* 同じ内容の二重表示にしない（60 秒で消える方を外す） */
      show(d); st.shown++; st.kinds[d.kind] = (st.kinds[d.kind] || 0) + 1; st.lastStatus = d.status; st.lastKind = d.kind;
      return true;
    } catch (e) { st.err++; return false; }
  }
  G.__v292DfixERRNOTE1 = { VER: VER, fail: fail, decide: decide, parse: parse, clear: function () { remove(null); },
    status: function () { var o = JSON.parse(JSON.stringify(st)); o.ver = VER; o.killed_now = killed(); o.showing = !!$(ID); return o; } };
})();
