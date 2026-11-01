/* v292DfixFLW2-reload-notice.js — FLOWFIX 2-A（GPT #127-PC「2-A Local GO：sessionStorage には最小限の状態コードだけ」・表示だけ）
 * 何を直すか: キャラ一覧で外見を確定すると、fix733 TYPE A の決まりで 1.2 秒後にページを読み直す（afterSidePort → location.reload）。
 *   その間なにも説明が無く、読み直すと結果の文も消える。B37「確定して絵を作る」・fix993 の道で絵が作れなかったときも、
 *   失敗の理由がすぐ消えていた。
 * やること（表示だけ。読み直しそのものは残す＝2-B は HOLD）:
 *   ① 読み直す直前に、画面全体へ「外見を保存しました。表示をそろえるため読み直しています」を出す。
 *   ② 結果を「状態コード」だけで 1 回だけ持ち越す（sessionStorage・このタブだけ）:
 *        { v:1, s:物語ID, c:キャラID, k:結果の種類, r:理由コード(英大文字・数字・_ のみ・48 字まで), t:時刻 }
 *      本文・外見の文・名前・メッセージの文は入れない。
 *   ③ 読み直したあと、同じ物語・120 秒以内・読み直し（navigation type = reload）のときだけ、1 回読んで消し、
 *      キャラ一覧を開いて同じキャラのカードに結果を出す（失敗の理由もここで出す。文はコードから作り直す）。
 *      失敗のときは「外見を設定」を開いて、やり直しの入口を見えるようにする（自動で絵は作らない・通信 0）。
 *      カードが見つからないときは画面上部に小さく出す。別の物語・別のタブ・古い記録は表示せず捨てる。
 * 対象: 外見の欄（portrait.js の「外見を設定」の中）から始まった保存だけ。呼び名の追加・削除の読み直しは従来どおり。
 *   LC1（作業欄）が読み直しを保留する道は対象外（LC1 側の読み直し）。読み直さない道（生成中・下書きあり）も従来どおり。
 * 保存・通信: 0（sessionStorage の 1 key だけ）。
 * kill: localStorage v292DfixFLW2Off='1' → 何も出さない・何も持ち越さない（従来どおり）
 * 検証口: window.__v292DfixFLW2 = { version, off, beforeReload(msgEl, ring, why), status() }
 */
(function(){
  'use strict';
  if (typeof window === 'undefined' || window.__v292DfixFLW2) return;
  var VERSION = 'FLW2-r2', KEY = 'v292DfixFLW2', TTL = 120000, TAG = '[FLW2]';
  function log(){ try { console.log.apply(console, [TAG].concat([].slice.call(arguments))); } catch(e){} }
  var stats = { stashed: 0, shown: 0, discarded: 0, why: null, cardShown: 0, bannerShown: 0, toolsOpened: 0, opened: 0, steps: 0, last: null, err: null };
  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292DfixFLW2Off') === '1'; }
  function storyId(){
    try { var f = window.__v292Dfix697; var s = f && f.status ? f.status().storyId : null; if (s) return String(s); } catch(e){}
    try { var u = new URLSearchParams(location.search).get('story'); if (u) return String(u); } catch(e){}
    return null;
  }
  function code(x){ x = String(x == null ? '' : x); return /^[A-Za-z0-9_]{1,48}$/.test(x) ? x : (x ? 'OTHER' : ''); }
  function cidOk(x){ x = String(x == null ? '' : x); return /^[A-Za-z0-9_-]{1,64}$/.test(x) ? x : ''; }
  /* 最後に外見の欄（[data-av2-ui="profile"]）の中を押したカード（読み直しの直前にカードが作り直されて msgEl が外れても分かるように） */
  var lastCard = null;
  try {
    document.addEventListener('click', function(ev){
      try {
        var t = ev.target && ev.target.closest ? ev.target.closest('[data-av2-ui="profile"]') : null; if (!t) return;
        var card = t.closest('[data-av2-cid]'); if (!card) return;
        lastCard = { cid: cidOk(card.getAttribute('data-av2-cid')), t: Date.now() };
      } catch(e){}
    }, true);
  } catch(e){}
  /* portrait.js の LOG（直近）から結果の種類を決める（kind・ok・code だけを読む） */
  var KINDS = { UI_SET_PROFILE: 1, UI_SET_PROFILE_ONE: 1, UI_ENSURE_FIRST: 1, UI_ENSURE_FIRST_ONE: 1, UI_NEW_DRAW: 1, B37_RECHECK_FAIL: 1, B37_RECHECK_PROFILE: 1 };
  function outcome(ring){   /* ★r2 (lane83 review L1): parameter renamed — it shadowed log() */
    var last = null;
    for (var i = (ring || []).length - 1; i >= 0; i--){ var x = ring[i]; if (x && KINDS[x.kind]){ last = x; break; } }
    if (!last || (last.t && Date.now() - last.t > 600000)) return { k: 'P', r: '' };
    if (last.kind === 'UI_SET_PROFILE' || last.kind === 'UI_SET_PROFILE_ONE') return { k: 'P', r: '' };
    if (last.kind === 'UI_ENSURE_FIRST' || last.kind === 'UI_ENSURE_FIRST_ONE') return last.ok ? { k: 'EF', r: code(last.code) } : { k: 'EFX', r: code(last.code) };
    if (last.kind === 'UI_NEW_DRAW') return last.ok ? { k: 'ND', r: code(last.code) } : { k: 'NDX', r: code(last.code) };
    return { k: 'RC', r: last.kind === 'B37_RECHECK_PROFILE' ? 'RECHECK_PROFILE' : 'RECHECK' };
  }
  var LINE2 = { P: '', EF: '絵も作りました。', EFX: '絵は作れませんでした。理由は読み直したあとに表示します。', ND: '候補の絵も作りました。', NDX: '候補の絵は作れませんでした。理由は読み直したあとに表示します。', RC: '絵は作っていません。理由は読み直したあとに表示します。' };
  function overlay(k){
    try {
      var o = document.getElementById('v292DfixFLW2-overlay'); if (o) return o;
      o = document.createElement('div'); o.id = 'v292DfixFLW2-overlay'; o.setAttribute('role', 'status'); o.setAttribute('aria-live', 'polite');
      o.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:2147483000;background:rgba(10,10,16,0.92);color:#eee;display:flex;align-items:center;justify-content:center;flex-direction:column;padding:24px;box-sizing:border-box;text-align:center;font-size:15px;line-height:1.8;';
      var a = document.createElement('div'); a.style.cssText = 'font-weight:bold;'; a.textContent = '外見を保存しました。表示をそろえるため読み直しています'; o.appendChild(a);
      if (LINE2[k]){ var b2 = document.createElement('div'); b2.style.cssText = 'margin-top:6px;color:#e0c080;font-size:13px;'; b2.textContent = LINE2[k]; o.appendChild(b2); }
      var c = document.createElement('div'); c.style.cssText = 'margin-top:10px;color:#999;font-size:12px;'; c.textContent = '（10〜20 秒かかることがあります。そのままお待ちください）'; o.appendChild(c);
      o.addEventListener('click', function(ev){ ev.stopPropagation(); }, true);
      (document.body || document.documentElement).appendChild(o);
      /* 読み直しが起きないまま 25 秒たったときだけ、自分で読み直す・閉じるの入口を出す */
      setTimeout(function(){ try { if (!o.parentNode || o.__btns) return; o.__btns = 1;
        var r = document.createElement('button'); r.type = 'button'; r.textContent = '読み直す'; r.style.cssText = 'margin-top:14px;min-height:44px;padding:8px 18px;font-size:14px;background:#3a6a5a;color:#fff;border:1px solid #666;border-radius:6px;';
        r.onclick = function(){ try { location.reload(); } catch(e){} };
        var x = document.createElement('button'); x.type = 'button'; x.textContent = '閉じる'; x.style.cssText = 'margin-top:8px;min-height:44px;padding:8px 18px;font-size:14px;background:#444;color:#fff;border:1px solid #666;border-radius:6px;';
        x.onclick = function(){ try { o.parentNode.removeChild(o); } catch(e){} };
        o.appendChild(r); o.appendChild(x); } catch(e){} }, 25000);
      return o;
    } catch(e){ return null; }
  }
  /* portrait.js afterSidePort の「読み直す」直前に 1 回呼ばれる（同期）。外見の欄の保存でなければ何もしない。 */
  function beforeReload(msgEl, ring){   /* ★r2: was (msgEl, log) → log('stash', …) threw a swallowed TypeError */
    try {
      if (off()) return false;
      var tools = msgEl && msgEl.parentNode;
      if (!tools || !tools.getAttribute || tools.getAttribute('data-av2-ui') !== 'profile') return false;   /* 呼び名・削除は対象外 */
      var sid = storyId(); if (!sid) return false;
      var card = msgEl.closest ? msgEl.closest('[data-av2-cid]') : null;
      var cid = card ? cidOk(card.getAttribute('data-av2-cid')) : '';
      if (!cid && lastCard && Date.now() - lastCard.t < 600000) cid = lastCard.cid;
      var oc = outcome(ring);
      var rec = { v: 1, s: String(sid).slice(0, 64), c: cid, k: oc.k, r: oc.r, t: Date.now() };
      try { sessionStorage.setItem(KEY, JSON.stringify(rec)); stats.stashed++; log('stash', rec.k, rec.r, !!rec.c); } catch(eS){}
      overlay(oc.k);
      return true;
    } catch(e){ return false; }
  }
  /* ---------- 読み直したあと ---------- */
  function navType(){ try { var n = performance.getEntriesByType('navigation'); if (n && n[0] && n[0].type) return n[0].type; } catch(e){} try { if (performance.navigation) return performance.navigation.type === 1 ? 'reload' : 'other'; } catch(e){} return null; }
  function msgOf(c){ try { var f = window.__v292DfixFLW2msg; return (typeof f === 'function') ? f(c) : null; } catch(e){ return null; } }
  function textFor(rec){
    var why = rec.r ? (msgOf(rec.r) || ('理由コード: ' + rec.r)) : '';
    switch (rec.k){
      case 'EF': return '外見を保存しました。' + (msgOf(rec.r) || '絵を作りました') + '。';
      case 'EFX': return '外見は保存しました。' + (msgOf(rec.r) || '絵は作れませんでした') + (rec.r ? '（' + rec.r + '）' : '') + '。作り直すときは、下の絵を作るボタンをもう一度押してください。';
      case 'ND': return '外見を保存しました。' + (msgOf('CANDIDATE_CREATED') || '候補を1枚作りました');
      case 'NDX': return '外見は保存しました。候補の絵は作れませんでした' + (why ? '（' + why + (msgOf(rec.r) ? '・' + rec.r : '') + '）' : '') + '。';
      case 'RC': return '外見は保存しました。' + (rec.r === 'RECHECK_PROFILE' ? '確定した外見をこの端末で確かめられなかったので' : '物語・キャラクター・アカウントを確かめられなかったので') + '、絵は作っていません。もう一度お試しください。';
      default: return (msgOf('ok_profile') || '外見を保存しました') + '。';
    }
  }
  function isFail(k){ return k === 'EFX' || k === 'NDX' || k === 'RC'; }
  function mkBox(rec){
    var d = document.createElement('div'); d.setAttribute('data-flw2-result', rec.k); d.setAttribute('role', 'status');
    d.style.cssText = 'margin:6px 0;padding:8px;border:1px solid ' + (isFail(rec.k) ? '#a06040' : '#407a60') + ';border-radius:6px;background:' + (isFail(rec.k) ? '#24170f' : '#0f2219') + ';color:#eee;font-size:12px;line-height:1.6;white-space:normal;word-break:break-word;max-width:100%;box-sizing:border-box;';
    var t = document.createElement('span'); t.textContent = textFor(rec); d.appendChild(t);
    var x = document.createElement('button'); x.type = 'button'; x.textContent = '閉じる'; x.setAttribute('data-flw2-close', '1');
    x.style.cssText = 'margin-left:8px;background:#444;color:#fff;border:1px solid #666;border-radius:4px;font-size:11px;padding:2px 8px;min-height:28px;';
    x.onclick = function(ev){ ev.stopPropagation(); dismissed = true; drop(); try { d.parentNode.removeChild(d); } catch(e){} };
    d.onclick = function(ev){ ev.stopPropagation(); };
    return d;
  }
  var dismissed = false;
  function banner(rec){
    try { if (document.getElementById('v292DfixFLW2-banner')) return;
      var b = mkBox(rec); b.id = 'v292DfixFLW2-banner'; b.style.position = 'fixed'; b.style.left = '8px'; b.style.right = '8px'; b.style.top = '8px'; b.style.zIndex = '2147482000';
      (document.body || document.documentElement).appendChild(b); stats.bannerShown++;
      setTimeout(function(){ try { if (b.parentNode) b.parentNode.removeChild(b); } catch(e){} }, 20000);
    } catch(e){}
  }
  function show(rec){
    var t0 = Date.now(), opened = 0, placed = false, toolsDone = false;
    (function step(){
      try {
        if (dismissed) return;
        var elapsed = Date.now() - t0;
        var ready = !!(window.__charlist && typeof window.__charlist.open === 'function' && window.__chronicleAv2Portrait);
        var card = rec.c ? document.querySelector('.v292Dfix145-card[data-av2-cid="' + rec.c + '"]') : null;
        var modal = document.querySelector('.v292Dfix145-modal');
        stats.steps++; stats.last = { ready: ready, card: !!card, modal: !!modal, ms: elapsed };
        if (ready && !modal && opened < 2 && rec.c && elapsed > 600){ opened++; stats.opened++; try { window.__charlist.open(); } catch(e){ stats.err = String(e && e.message || e).slice(0, 80); } }
        if (card && card.isConnected){
          if (!card.querySelector('[data-flw2-result]')){
            var box = mkBox(rec); var first = card.querySelector('[data-av2-ui="card"]');
            if (first && first.parentNode) first.parentNode.insertBefore(box, first); else card.appendChild(box);
            if (!placed){ placed = true; stats.cardShown++; dropSoon(); try { card.scrollIntoView({ block: 'center' }); } catch(e){} }
          }
          if (isFail(rec.k) && !toolsDone){
            var tl = card.querySelector('[data-av2-ui="profile"]'), tg = card.querySelector('[data-av2-prof="toggle"]');
            if (tl && tl.style.display !== 'none') toolsDone = true;
            else if (tg && !tg.disabled){ toolsDone = true; stats.toolsOpened++; try { tg.click(); } catch(e){} }
          }
        }
        if (!placed && elapsed > 15000){ banner(rec); dropSoon(); return; }
        if (elapsed < 30000) setTimeout(step, 500); else drop();           /* 一覧の作り直しで消えたら 30 秒までは戻す */
      } catch(e){ stats.err = String(e && e.message || e).slice(0, 80); setTimeout(step, 1000); }
    })();
  }
  /* 読み直した直後に別の仕組み（例: fix889 の gateReload）がもう一度読み直すことがあるので、記録は「画面に出して 3 秒たった」
     「閉じた」「捨てた」ときに消す。同じ記録を読むのは最大 3 回（読み直しの連続）まで・120 秒まで。 */
  function drop(){ try { sessionStorage.removeItem(KEY); } catch(e){} }
  var dropTimer = null;
  function dropSoon(){ if (dropTimer) return; dropTimer = setTimeout(drop, 3000); }
  function consume(){
    if (off()) return;
    var raw = null; try { raw = sessionStorage.getItem(KEY); } catch(e){ return; }
    if (raw == null) return;
    log('consume', navType());
    var rec = null; try { rec = JSON.parse(raw); } catch(e){ rec = null; }
    var nt = navType();
    var bad = !rec || rec.v !== 1 ? 'BAD' : (typeof rec.t !== 'number' || Date.now() - rec.t > TTL || rec.t > Date.now() + 5000) ? 'STALE'
            : (nt && nt !== 'reload') ? 'NOT_RELOAD:' + nt : ((+rec.n || 0) >= 3) ? 'TOO_MANY_LOADS' : null;
    if (bad){ drop(); stats.discarded++; stats.why = bad; log('discard', bad); return; }
    rec = { v: 1, s: String(rec.s || ''), c: cidOk(rec.c), k: LINE2.hasOwnProperty(rec.k) ? rec.k : 'P', r: code(rec.r), t: rec.t, n: (+rec.n || 0) + 1 };
    try { sessionStorage.setItem(KEY, JSON.stringify(rec)); } catch(e){}
    var tries = 0;
    (function waitSid(){                                        /* 物語 ID が分かるまで待つ（最大 20 秒） */
      var sid = storyId();
      if (!sid && tries++ < 40) return setTimeout(waitSid, 500);
      if (!sid || sid !== rec.s){ drop(); stats.discarded++; stats.why = 'OTHER_STORY'; log('discard', 'OTHER_STORY'); return; }
      stats.shown++; stats.why = null; log('show', rec.k, rec.r, rec.n); show(rec);
    })();
  }
  window.__v292DfixFLW2 = { version: VERSION, off: off, beforeReload: beforeReload,
                            status: function(){ return { version: VERSION, off: off(), nav: navType(), stats: JSON.parse(JSON.stringify(stats)) }; } };
  try { if (document.readyState === 'complete') setTimeout(consume, 0); else window.addEventListener('load', function(){ setTimeout(consume, 0); }); } catch(e){}
})();
