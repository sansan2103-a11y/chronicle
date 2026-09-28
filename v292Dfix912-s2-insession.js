// =====================================================================
// v292Dfix912 — SA-3 S2 in-session reconcile（案 I・GPT SA-3 S2 in-session 裁定 GO_WITH_FIXES）
// ---------------------------------------------------------------------
// ■ 何をするか
//   開いたままの物語で「local の差分は後から着地した roster307 だけ・別端末が Cloud を進めた・
//   remote の roster は base のまま」を fix697 の exact 証明（s2Proof）が確かめたとき、
//   PUT はせず S2_RECONCILE_PENDING にして、端末が idle になったら自動で 1 回だけ reload する。
//   reload 後は既存の boot 経路（fix705 resolve781 → S2 apply → fix697 が roster を書き戻す）で収束する。
//   ・pending 中は G.submit / G.cont / G.retry（生成・story 変更）と新しい save 開始を止める。
//   ・send preflight: marker DIRTY かつ S2 base roster あり（fix697.s2PreflightNeeded）のときだけ、
//     送信前に 1 回だけ fresh getstory → remote が進んでいれば S2 判定。
//       safe → 送信しない → pending → 自動 reload
//       unsafe → 送信しない → fix910 と同じ hold（DIVERGED + Recovery Draft + banner）。自動 merge しない
//       進んでいない / 取得失敗 → そのまま通常送信（保存は fix910 が守る）
//   ・表示は短い non-blocking の一行だけ（「別の端末の続きを取り込んでいます…」）。確認・選択は求めない。
//   ・入力欄の文字は sessionStorage に一時退避し、reload 後に戻す（canonical / save data には入れない）。
//   ・reload loop guard: storyId + remoteRev ごとに自動 reload は 1 回だけ（sessionStorage）。
//     同じ remoteRev でもう一度要求されたら reload せず false を返す（呼び手が DIVERGED へ fail-closed）。
// ■ 書かないもの: story body / sidecar / marker（読むだけ）。network は fix697 の preflight 1 本だけ。
// ■ kill: localStorage v292Dfix912Off=1 または v292Dfix911Off=1 → 何もしない（従来どおり）。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix912) return;
  var TAG = '[v292Dfix912:s2-insession]';
  var NOTICE_ID = 'v292Dfix912-notice';
  var COPY = '別の端末の続きを取り込んでいます…';
  var SS_R = 'v292Dfix912_reload_', SS_D = 'v292Dfix912_draft_';
  function off(){ try { return localStorage.getItem('v292Dfix912Off') === '1' || localStorage.getItem('v292Dfix911Off') === '1'; } catch(e){ return false; } }
  function sid(){ try { var k = window.__chronicleDocumentStoryKey;
                        return (typeof k === 'string' && k.indexOf('chr6_slot_') === 0) ? k.slice(10) : null; } catch(e){ return null; } }
  function ssg(k){ try { return sessionStorage.getItem(k); } catch(e){ return null; } }
  function sss(k, v){ try { sessionStorage.setItem(k, v); return true; } catch(e){ return false; } }
  function ssr(k){ try { sessionStorage.removeItem(k); } catch(e){} }
  function F697(){ try { return window.__v292Dfix697 || null; } catch(e){ return null; } }
  function getG(){ try { return (typeof G !== 'undefined' && G) ? G : null; } catch(e){ return null; } }
  function getS(){ try { return (typeof window.__chronicleGetState === 'function') ? window.__chronicleGetState('fix912') : null; } catch(e){ return null; } }

  var pend = null;                     /* { id, remoteRev, src, t } */
  var preflightBusy = false;
  var stats = { requests: 0, loopGuard: 0, reloads: 0, idleWaits: 0, blocked: 0, preflights: 0, preflightSkip: 0,
                preflightNoAhead: 0, preflightSafe: 0, preflightUnsafe: 0, preflightError: 0, holds: 0,
                draftSaved: 0, draftRestored: 0, guardCleared: 0, last: null };

  function notice(on){
    try {
      var n = document.getElementById(NOTICE_ID);
      if (!on){ if (n) n.parentNode.removeChild(n); return; }
      if (n) return;
      var d = document.createElement('div');
      d.id = NOTICE_ID; d.setAttribute('role', 'status');
      d.setAttribute('style', 'position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:99997;'
        + 'background:#2b3a4a;color:#e3efff;font-size:13px;line-height:1.5;padding:6px 14px;border-radius:8px;'
        + 'font-family:system-ui,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.35);pointer-events:none;');
      d.textContent = COPY;
      (document.body || document.documentElement).appendChild(d);
    } catch(e){}
  }
  function pending(id){ return !!(pend && (!id || String(pend.id) === String(id))); }
  function off913(){ try { return localStorage.getItem('v292Dfix913Off') === '1'; } catch(e){ return false; } }
  function f705Released(){ try { var s5 = window.__v292Dfix705.status().state; return !!(s5 && s5.phase === 'released' && s5.held === false); } catch(e){ return false; } }
  function inProgress913(id){
    if (off913() || !id) return false;
    if (!f705Released()) return true;
    try { var F = F697(); return !!(F && typeof F.s2InProgress === 'function' && F.s2InProgress(id)); } catch(e){ return false; }
  }

  function idle(){
    try {
      var S = getS(); if (S && S.inFlight) return false;
      var F = F697(); if (F && typeof F.status === 'function'){ var st = F.status(); if (st && st.inFlight) return false; }
      if (F && typeof F.journal === 'function' && pend && F.journal(pend.id)) return false;
      return true;
    } catch(e){ return false; }
  }
  function tryReload(){
    if (!pend) return;
    if (!idle()){ stats.idleWaits++; setTimeout(tryReload, 400); return; }
    saveDraft(pend.id);
    sss(SS_R + pend.id, String(pend.remoteRev));
    stats.reloads++; stats.last = { act: 'reload', id: pend.id, remoteRev: pend.remoteRev, src: pend.src, t: Date.now() };
    try { console.log(TAG, 'auto reload for S2 reconcile', pend.src, 'remoteRev=' + pend.remoteRev); } catch(e){}
    try { location.reload(); } catch(e){}
  }
  /* fix697 から呼ばれる。true = pending にした（呼び手は PUT / hold をしない）。false = 呼び手が従来の fail-closed を続ける。 */
  function request(id, remoteRev, src){
    try {
      if (off() || !id || String(id) !== String(sid())) return false;
      stats.requests++;
      if (pending(id)) return true;
      var g = ssg(SS_R + id);
      if (g != null && String(g) === String(remoteRev) && inProgress913(id)){
        /* ■fix913: 同じ remoteRev の boot S2 がまだ進行中 → conflict ではない。reload も hold もせず WAIT（呼び手は PUT しない・DIRTY は保持） */
        stats.waitInProgress = (stats.waitInProgress || 0) + 1; stats.last = { act: 'waitInProgress', id: id, remoteRev: remoteRev, t: Date.now() };
        return true;
      }
      if (g != null && String(g) === String(remoteRev)){ stats.loopGuard++; stats.last = { act: 'loopGuard', id: id, remoteRev: remoteRev, t: Date.now() }; return false; }
      pend = { id: String(id), remoteRev: remoteRev, src: src || null, t: Date.now() };
      notice(true);
      setTimeout(tryReload, 0);
      return true;
    } catch(e){ return false; }
  }

  /* ---- 送信の入口（G.submit / G.cont / G.retry）---- */
  var wrapped = false;
  function wrapG(){
    if (wrapped) return true;
    var g = getG(); if (!g) return false;
    ['submit', 'cont', 'retry'].forEach(function(name){
      var orig = g[name];
      if (typeof orig !== 'function' || orig.__f912) return;
      var w = function(){
        var self = this, args = arguments;
        if (off()) return orig.apply(self, args);
        var id = sid();
        if (pending(id) || preflightBusy){ stats.blocked++; notice(true); return; }
        var F = F697();
        /* ■fix913（SA-4a）: boot S2 の途中は preflight / hold を始めない（WAIT）。
           ・fix705 がまだ released でない → 元の送信へ（fix892 が「保存状態を確認しています」で止める。入力は残る）
           ・roster stash の書き戻し待ち → 送らない（入力は残す）・短い表示・書き戻しを試みる */
        if (!off913() && id){
          if (!f705Released()){ stats.waitAuthority = (stats.waitAuthority || 0) + 1; return orig.apply(self, args); }
          if (F && typeof F.s2InProgress === 'function' && F.s2InProgress(id)){
            stats.waitStash = (stats.waitStash || 0) + 1; notice(true);
            try { if (typeof F.s2ApplyStash === 'function') F.s2ApplyStash('send'); } catch(eA){}
            return;
          }
        }
        if (!id || !F || typeof F.s2PreflightNeeded !== 'function' || !F.s2PreflightNeeded(id)){ stats.preflightSkip++; return orig.apply(self, args); }
        preflightBusy = true; stats.preflights++;
        F.s2Preflight(id, function(r){
          preflightBusy = false;
          try {
            if (!r || r.skip){ stats.preflightSkip++; return orig.apply(self, args); }
            if (r.error){ stats.preflightError++; return orig.apply(self, args); }
            if (!r.remoteAhead){ stats.preflightNoAhead++; return orig.apply(self, args); }
            if (r.safe){
              stats.preflightSafe++;
              if (request(id, r.srvRev, 'preflight')) return;          /* 送信しない（入力は退避して reload 後に戻す） */
            } else stats.preflightUnsafe++;
            stats.holds++;                                             /* unsafe / loop guard: 自動 merge しない */
            try { F.s2HoldNow(id, r, 'preflight'); } catch(eH){}
          } catch(e){}
        });
      };
      w.__f912 = true; w.__orig = orig;
      g[name] = w;
    });
    /* pending 中は story を変える他の入口（undo / 場面開始 / 物語のリセット）も止める（preflight はしない） */
    ['undo', 'undoGws', 'startScene', 'resetStory'].forEach(function(name){
      var orig2 = g[name];
      if (typeof orig2 !== 'function' || orig2.__f912) return;
      var w2 = function(){
        if (!off() && pending(sid())){ stats.blocked++; notice(true); return; }
        return orig2.apply(this, arguments);
      };
      w2.__f912 = true; w2.__orig = orig2;
      g[name] = w2;
    });
    wrapped = true;
    return true;
  }

  /* reload 後: 退避した入力を戻す / 収束したら loop guard を消す */
  /* 入力の一時退避（sessionStorage・この tab だけ・canonical / save data には入れない）。
     S2 の収束では fix912 以外（fix402 の取り込み reload、fix705 の apply reload）も reload するので、
     この物語が S2 に関わる状態（pending / marker DIRTY / roster stash / 退避済み）のときは、離脱時に必ず退避する。 */
  function saveDraft(id){
    try { var inp = document.getElementById('inp'); if (!inp || !inp.value) return false;
          if (sss(SS_D + id, JSON.stringify({ v: String(inp.value), t: Date.now() }))){ stats.draftSaved++; return true; } } catch(e){}
    return false;
  }
  function s2Relevant(id){
    try {
      if (pending(id) || ssg(SS_D + id) != null) return true;
      if (localStorage.getItem('v292Dfix402_f911_' + id) != null) return true;
      var M = window.__v292Dfix781; var m = (M && typeof M.marker === 'function') ? M.marker(id) : null;
      return !!(m && (m.state === 'DIRTY_INTENT' || m.state === 'DIRTY_LOCAL') && m.lcRoster);
    } catch(e){ return false; }
  }
  function onLeave(){ try { if (off()) return; var id = sid(); if (id && s2Relevant(id)) saveDraft(id); } catch(e){} }
  try { window.addEventListener('pagehide', onLeave); window.addEventListener('beforeunload', onLeave); } catch(e){}
  var restoredThisLoad = false;
  function restoreDraft(){
    try {
      var id = sid(); if (!id) return;
      var draw = ssg(SS_D + id); if (draw == null) return;
      var d = null; try { var dj = JSON.parse(draw); d = (dj && typeof dj.v === 'string') ? dj.v : null;
                          if (dj && dj.t && (Date.now() - dj.t) > 180000){ ssr(SS_D + id); return; } } catch(eJ){ d = null; }
      if (d == null){ ssr(SS_D + id); return; }
      var inp = document.getElementById('inp'); if (!inp) return;
      if (!restoredThisLoad){
        restoredThisLoad = true;                           /* 1 page load につき 1 回だけ戻す（送信で空になった欄を埋め直さない） */
        if (!inp.value){ inp.value = d; stats.draftRestored++; try { inp.dispatchEvent(new Event('input', { bubbles: true })); } catch(e){} }
      }
      /* S2 収束には reload が 2 回以上続く（fix912 → fix705 apply）。収束するまで退避は消さない。
         消すのは、marker が CLEAN・roster stash なし・fix705 released のときだけ。 */
      var M = window.__v292Dfix781; var m = (M && typeof M.marker === 'function') ? M.marker(id) : null;
      var st5 = null; try { st5 = window.__v292Dfix705.status().state; } catch(e5){ st5 = null; }
      var stashLeft = false; try { stashLeft = (localStorage.getItem('v292Dfix402_f911_' + id) != null); } catch(e6){}
      if (m && m.state === 'CLEAN' && !stashLeft && st5 && st5.phase === 'released' && st5.held === false){
        ssr(SS_D + id); stats.draftCleared = (stats.draftCleared || 0) + 1;
      }
    } catch(e){}
  }
  function clearGuardIfConverged(){
    try {
      var id = sid(); if (!id) return;
      var g = ssg(SS_R + id); if (g == null) return;
      var M = window.__v292Dfix781; var m = (M && typeof M.marker === 'function') ? M.marker(id) : null;
      if (m && m.state === 'CLEAN' && m.lastConfirmed && typeof m.lastConfirmed.serverRev === 'number' &&
          m.lastConfirmed.serverRev > +g){ ssr(SS_R + id); stats.guardCleared++; }
    } catch(e){}
  }
  var n = 0;
  (function boot(){
    n++;
    try { wrapG(); restoreDraft(); clearGuardIfConverged(); } catch(e){}
    try { if (!pend && !off913()){ var id9 = sid(); var F9 = F697();
            if (id9 && document.getElementById(NOTICE_ID) && !(F9 && typeof F9.s2InProgress === 'function' && F9.s2InProgress(id9))) notice(false); } } catch(e9){}
    if (n < 2400) setTimeout(boot, n < 240 ? 250 : 2000);
  })();

  window.__v292Dfix912 = {
    off: off, pending: pending, request: request,
    status: function(){ return { off: off(), wrapped: wrapped, pending: pend ? JSON.parse(JSON.stringify(pend)) : null,
                                 preflightBusy: preflightBusy, stats: JSON.parse(JSON.stringify(stats)) }; }
  };
  try { console.log(TAG, 'loaded (kill=v292Dfix912Off=1 / v292Dfix911Off=1)'); } catch(e){}
})();
