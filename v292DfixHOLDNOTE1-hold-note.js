/* =====================================================================
 * v292DfixHOLDNOTE1-hold-note.js — クラウドへの保存が「黙って」止まったとき、画面に消えない短い知らせを 1 回出す（★HOLDNOTE1・2026-11-15）
 * ---------------------------------------------------------------------
 * ■なぜ（save409/DIAG.md b-5）
 *   ① fix697 の正本の保存（canonicalCommit / canonicalCommit2）が CAS 以外の 409（Asset v2 の契約・idem など）を受け、読み直しても自分の内容で
 *      なかったとき、その物語は canonHold（このページでは以後クラウドへ保存しない）になる。CAS の 409 なら fix924 が差分バナーを出すが、
 *      それ以外（F924_SKIP）は画面に何も出なかった。
 *   ② av2 登録係（v292Dav2-data.js）の「登録の衝突」HOLD の間も、物語の通常の保存が止まる（dirty は残る）。これも画面に何も出なかった。
 * ■すること（表示だけ）
 *   fix697 / av2-data から hold(kind, storyId, code) を呼んでもらい、このページで最初の 1 回だけ、入力欄の上に短い知らせを出す。
 *   ✕ を押すまで消えない（保存は止まったままなので、次の送信では外さない）。同じページで 2 回目以降の hold は数えるだけ。
 *   文面は 1 つ（GPT #127-UF ②の推奨文言。canon / av2 で同じ）:
 *     「クラウドへの保存が停止しています。現在の画面では自動で再開できません。端末への保存を確認したうえで、ページを開き直してください。」
 *   ★「端末には残っています」「開き直すと再開します」とは書かない: hold の時点で端末への保存（S.save → localStorage）が正常に済んだことを
 *     この部品から確かめる口が無い（容量満杯の無言失敗＝fix543 の型があり得る）。開き直しても同じ 409 が再び起き得る／av2 の衝突の印は
 *     サーバーからの取り直しでしか消えない。
 * ■しないこと
 *   prompt / confirm / alert を使わない。自動の再送・再読込をしない。fetch・storage・保存・本文・sys・送信の中身に触らない。通信しない。
 *   hold が呼ばれない通常時は DOM に何も足さない（タイマーも見張りも動かない）。
 * ■止める: localStorage v292DfixHOLDNOTE1Off='1'（毎回評価。hold() が何もしない＝土台と同じ）。
 * ■診断: window.__v292DfixHOLDNOTE1.status()（数と種類だけ。物語の ID・本文は残さない）
 * ===================================================================== */
(function () {
  'use strict';
  var G = (typeof window !== 'undefined') ? window : globalThis;
  if (G.__v292DfixHOLDNOTE1) return;
  var VER = 'holdnote1-20261115-r2', KILL = 'v292DfixHOLDNOTE1Off', ID = 'holdnote1', ERR_ID = 'errnote1';
  var T_NOTE = 'クラウドへの保存が停止しています。現在の画面では自動で再開できません。端末への保存を確認したうえで、ページを開き直してください。';
  var st = { calls: 0, shown: 0, killed: 0, repeat: 0, dismissed: 0, err: 0, kinds: {}, codes: {}, lastKind: null };
  var once = false, timer = null;
  function killed() { try { return G.localStorage.getItem(KILL) === '1'; } catch (e) { return false; } }
  function $(id) { try { return document.getElementById(id); } catch (e) { return null; } }
  function textOf() { return T_NOTE; }
  function remove(why) { var n = $(ID); if (n && n.parentNode) n.parentNode.removeChild(n); if (timer) { try { clearInterval(timer); } catch (e) {} timer = null; } if (n && why) st[why] = (st[why] || 0) + 1; }
  /* 入力欄の上。ERRNOTE1 の知らせが出ていればその上に積む */
  function place(n) {
    try {
      var c = $('composer'); var h = c ? Math.round(c.getBoundingClientRect().height) : 0;
      var e = $(ERR_ID); var eh = e ? Math.round(e.getBoundingClientRect().height) + 8 : 0;
      n.style.bottom = 'calc(' + ((h > 0 ? h + 8 : 96) + eh) + 'px + env(safe-area-inset-bottom, 0px))';
    } catch (e2) {}
  }
  function show(kind) {
    var n = document.createElement('div'); n.id = ID; n.setAttribute('role', 'status'); n.setAttribute('aria-live', 'polite'); n.setAttribute('data-holdnote1-kind', kind);
    n.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);z-index:99998;box-sizing:border-box;width:min(560px,calc(100vw - 16px));background:#2e2614;color:#ffe7b0;border:1px solid #8a6a2a;border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.6;box-shadow:0 4px 16px rgba(0,0,0,.5);display:flex;gap:10px;align-items:flex-start';
    var s = document.createElement('span'); s.style.cssText = 'flex:1 1 auto;min-width:0;white-space:normal;word-break:break-word';
    s.textContent = textOf(kind);
    var x = document.createElement('button'); x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label', '閉じる');
    x.style.cssText = 'flex:none;background:none;color:#cba;border:0;cursor:pointer;font-size:16px;line-height:1;padding:4px 6px;min-width:32px;min-height:32px';
    x.onclick = function () { remove('dismissed'); };
    n.appendChild(s); n.appendChild(x); place(n);
    (document.body || document.documentElement).appendChild(n);
    /* 表示中だけ、入力欄・ERRNOTE1 の高さに合わせて置き直す（通信・保存なし）。✕ で止まる */
    timer = setInterval(function () { try { var cur = $(ID); if (!cur) { clearInterval(timer); timer = null; return; } place(cur); } catch (e) {} }, 1000);
  }
  /* fix697（kind 'canon'）・av2-data（kind 'av2'）から呼ばれる。true = このとき知らせを出した */
  function hold(kind, storyId, code) {
    try {
      st.calls++;
      if (killed()) { st.killed++; return false; }
      var k = (kind === 'av2') ? 'av2' : 'canon';
      st.kinds[k] = (st.kinds[k] || 0) + 1;
      var c = (typeof code === 'string' && /^[A-Za-z0-9_.:-]{1,48}$/.test(code)) ? code : (code == null ? 'none' : 'other');
      st.codes[c] = (st.codes[c] || 0) + 1;
      if (once) { st.repeat++; return false; }
      if (typeof document === 'undefined' || !document.createElement) return false;
      once = true; show(k); st.shown++; st.lastKind = k;
      return true;
    } catch (e) { st.err++; return false; }
  }
  G.__v292DfixHOLDNOTE1 = { VER: VER, hold: hold, text: textOf,
    status: function () { var o = JSON.parse(JSON.stringify(st)); o.ver = VER; o.killed_now = killed(); o.showing = !!$(ID); o.usedOnce = once; return o; } };
})();
