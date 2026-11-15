/* =====================================================================
 * v292DfixHOLDNOTE2-hold-kinds.js — クラウドへの保存が「状態のために」止まったとき、状態ごとに 1 つの知らせを出す（★HOLDNOTE2・GPT #127-UF・2026-11-16）
 * ---------------------------------------------------------------------
 * HOLDNOTE1（CAS 以外の 409 の後の canonHold・av2 登録の衝突）の対象外で、コード上「このページではその後の保存が止まる」経路だけ:
 *   missing : fix697 の getstory が 404（行が無い not-found／今は読めない STORY_UNAVAILABLE）→ canonHold（このページの物語の保存は以後すべて hold）
 *   drift   : fix697 で、端末は正本（canonical）として保存しようとしたのにサーバーの行が shadow → canonHold
 *   deleted : fix697 の getstory がサーバーの行を削除済み（deleted）と答えた → canonHold（削除済みの物語へは書かない）
 *   av2blocked : av2 登録係がサーバーに断られた入力（BLOCKED）と同じ入力のあいだ、物語の通常の保存を hold（入力が変われば登録をやり直す）
 * 文面は状態ごとに 1 つ。断定を避ける。1 ページで同じ状態は 1 回だけ。✕ で消える。送信・保存・通信・storage には触らない（表示だけ）。
 * hold が呼ばれない通常時は DOM に何も足さない。kill: localStorage v292DfixHOLDNOTE2Off='1'（毎回評価）。診断: window.__v292DfixHOLDNOTE2.status()
 * ===================================================================== */
(function () {
  'use strict';
  var G = (typeof window !== 'undefined') ? window : globalThis;
  if (G.__v292DfixHOLDNOTE2) return;
  var VER = 'holdnote2-20261116-a', KILL = 'v292DfixHOLDNOTE2Off', ID = 'holdnote2';
  var TEXT = {
    missing: 'この物語をクラウドで読めませんでした（見つからないか、今は開けない状態です）。この画面ではクラウドへ保存しません。ログインしているアカウントを確かめてください。',
    drift: 'この物語のクラウド側の状態が、この画面の想定と一致しません。食い違ったまま上書きしないよう、この画面ではクラウドへ保存しません。ページを開き直すと、状態の確認からやり直します。',
    deleted: 'この物語は、クラウドでは削除済みになっています。削除済みの物語には保存しません。必要な内容があれば、この画面で確かめてください。',
    av2blocked: '登場人物の登録がクラウドに受け付けられなかったため、この物語のクラウドへの保存が止まっています。登場人物の内容が変わったときに、登録をもう一度試みます。端末への保存を確かめてください。'
  };
  var st = { calls: 0, shown: 0, killed: 0, repeat: 0, dismissed: 0, err: 0, kinds: {}, codes: {}, lastKind: null };
  var shown = {}, timer = null;
  function killed() { try { return G.localStorage.getItem(KILL) === '1'; } catch (e) { return false; } }
  function $(id) { try { return document.getElementById(id); } catch (e) { return null; } }
  function remove(why) { var n = $(ID); if (n && n.parentNode) n.parentNode.removeChild(n); if (timer) { try { clearInterval(timer); } catch (e) {} timer = null; } if (n && why) st[why] = (st[why] || 0) + 1; }
  /* 入力欄の上。ERRNOTE1 / HOLDNOTE1 / STORYSIZE1 が出ていればその上に積む */
  function place(n) {
    try {
      var c = $('composer'); var h = c ? Math.round(c.getBoundingClientRect().height) : 0;
      var add = 0; ['errnote1', 'holdnote1', 'storysize1'].forEach(function (x) { var e = $(x); if (e) add += Math.round(e.getBoundingClientRect().height) + 8; });
      n.style.bottom = 'calc(' + ((h > 0 ? h + 8 : 96) + add) + 'px + env(safe-area-inset-bottom, 0px))';
    } catch (e2) {}
  }
  function show(kind) {
    remove(null);
    var n = document.createElement('div'); n.id = ID; n.setAttribute('role', 'status'); n.setAttribute('aria-live', 'polite'); n.setAttribute('data-holdnote2-kind', kind);
    n.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);z-index:99998;box-sizing:border-box;width:min(560px,calc(100vw - 16px));background:#2e2614;color:#ffe7b0;border:1px solid #8a6a2a;border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.6;box-shadow:0 4px 16px rgba(0,0,0,.5);display:flex;gap:10px;align-items:flex-start';
    var s = document.createElement('span'); s.style.cssText = 'flex:1 1 auto;min-width:0;white-space:normal;word-break:break-word'; s.textContent = TEXT[kind];
    var x = document.createElement('button'); x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label', '閉じる');
    x.style.cssText = 'flex:none;background:none;color:#cba;border:0;cursor:pointer;font-size:16px;line-height:1;padding:4px 6px;min-width:32px;min-height:32px';
    x.onclick = function () { remove('dismissed'); };
    n.appendChild(s); n.appendChild(x); place(n);
    (document.body || document.documentElement).appendChild(n);
    timer = setInterval(function () { try { var cur = $(ID); if (!cur) { clearInterval(timer); timer = null; return; } place(cur); } catch (e) {} }, 1000);
  }
  function hold(kind, storyId, code) {
    try {
      st.calls++;
      if (killed()) { st.killed++; return false; }
      if (!Object.prototype.hasOwnProperty.call(TEXT, kind)) return false;
      st.kinds[kind] = (st.kinds[kind] || 0) + 1;
      var c = (typeof code === 'string' && /^[A-Za-z0-9_.:-]{1,48}$/.test(code)) ? code : (code == null ? 'none' : 'other');
      st.codes[c] = (st.codes[c] || 0) + 1;
      if (shown[kind]) { st.repeat++; return false; }
      if (typeof document === 'undefined' || !document.createElement) return false;
      shown[kind] = true; show(kind); st.shown++; st.lastKind = kind;
      return true;
    } catch (e) { st.err++; return false; }
  }
  G.__v292DfixHOLDNOTE2 = { VER: VER, hold: hold, text: function (k) { return TEXT[k] || null; },
    status: function () { var o = JSON.parse(JSON.stringify(st)); o.ver = VER; o.killed_now = killed(); o.showing = !!$(ID); o.shownKinds = Object.keys(shown); return o; } };
})();
