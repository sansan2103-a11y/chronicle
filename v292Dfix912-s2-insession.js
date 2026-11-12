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
  /* ■GC1（GCONT-01・GPT #127-SM B4 条件付き既定 ON）: 既定 ON。kill: localStorage v292DfixGC1Off='1' → 従来どおり（v292DfixGC1On は使わない）。 */
  function gc1On(){ try { return localStorage.getItem('v292DfixGC1Off') !== '1'; } catch(e){ return false; } }
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

  /* ---- ■GC1: 保存中の「続きを書く」を 1 件だけ預かる（GPT #127-SM B4） ---- */
  var GC1_WAIT = '前のターンを保存しています。保存が終わったら「続きを書く」を始めます…';
  var GC1_FAIL = '保存を確かめられなかったため、「続きを書く」は取りやめました。少し待ってから、もう一度押してください。';
  var GC1_EDIT = '入力が変わったため、「続きを書く」は取りやめました。';
  var GC1_OTHER = '別の操作をしたため、「続きを書く」は取りやめました。';
  var GC1_AWAY = '画面を離れたため、「続きを書く」は取りやめました。もう一度押してください。';
  var GC1_RETRY = '続けられませんでした。もう一度お試しください。';   /* ■GC1b（laneP0C・GPT #127-SQ GC1）: 発火したのに始められなかったとき。無言にしない */
  var GC1_SENT = '続きを自然に進めてください。';                       /* G.cont が入力欄に置く決まり文句（index.html と同じ文字列） */
  var GC1_MAX_MS = 60000, GC1_NOTE = 'v292DfixGC1-note', GC1_RUN_MS = 20000;
  var gc1P = null, gc1Bypass = false;
  /* ■GC1b: 発火した G.cont が終わるまでの「実行中」の印（メモリだけ）。
     発火から本物の G.submit までの間には通信を待つ関門（Vault の事前確認など）がある。その間に物語がもう一度ローカル保存される（marker が DIRTY に戻る）と、
     従来は中の G.submit が fix912 の旧 preflight 経路に入り、G.cont が先に終わって入力欄を空にし、preflight 後の本物の submit が空の入力で黙って終わっていた
     （本番 2026-11-12: gc1Held 4 / gc1Fired 4 / preflights 1 / preflightNoAhead 1・生成なし・表示なし）。
     実行中は、発火した cont とその中の submit を fix912 の入口で見分け、その時点の状態が CLEAN のときだけ通す。CLEAN でなければ生成せず、
     1 回だけ預かり直す（最初に押してから 60 秒の期限はそのまま）。それでも始められなければ GC1_RETRY を表示する。旧 preflight 経路には入れない。 */
  var gc1Run = null;
  function gc1Top(t, err){ try { var el = document.getElementById('topStatus'); if (!el) return; el.textContent = t; el.style.color = err ? 'var(--err)' : 'var(--dim)'; } catch(e){} }
  function gc1Note(msg){
    try { var o = document.getElementById(GC1_NOTE); if (o && o.parentNode) o.parentNode.removeChild(o);
      var d = document.createElement('div'); d.id = GC1_NOTE; d.setAttribute('role', 'status'); d.setAttribute('aria-live', 'polite');
      d.setAttribute('style', 'position:fixed;left:50%;bottom:calc(96px + env(safe-area-inset-bottom));transform:translateX(-50%);max-width:88vw;z-index:99996;background:#2b3240;color:#e8eef8;border:1px solid #4a5568;border-radius:10px;padding:8px 14px;font-size:13px;line-height:1.5;font-family:system-ui,sans-serif;pointer-events:none');
      d.textContent = msg; (document.body || document.documentElement).appendChild(d);
      setTimeout(function(){ try { if (d.parentNode) d.parentNode.removeChild(d); } catch(e){} }, 6000); } catch(e){}
  }
  function gc1Show(){ gc1Top(GC1_WAIT, false); }
  function gc1Inp(){ try { var i = document.getElementById('inp'); return i ? String(i.value) : null; } catch(e){ return null; } }
  function gc1Mode(){ try { var S = getS(); return S ? S.mode : null; } catch(e){ return null; } }
  function gc1Turns(){ try { var S = getS(); return (S && Array.isArray(S.turns)) ? S.turns.length : -1; } catch(e){ return -1; } }
  function gc1Save(id){   /* 読むだけ: marker（fix781）と fix697 の送信状態 */
    var o = { mk: null, inFlight: false, timer: false, routed: 0, hold: false };
    try { var M = window.__v292Dfix781; var m = (M && typeof M.marker === 'function') ? M.marker(id) : null; o.mk = m ? m.state : null; } catch(e){}
    try { var F = F697(); if (F && typeof F.f909 === 'function'){ var x = F.f909(); o.inFlight = !!(x && x.inFlight); o.timer = !!(x && x.pushTimer); }
          if (F && typeof F.status === 'function'){ var st = F.status(); if (st && st.inFlight) o.inFlight = true; }
          if (F && typeof F.canonState === 'function'){ var c = F.canonState(); o.routed = (c && c.cstats && +c.cstats.routedCanonical) || 0; o.hold = !!(c && c.holds && c.holds[id]); } } catch(e){}
    return o;
  }
  function gc1Cancel(why, msg, err){
    var p = gc1P; if (!p) return; gc1P = null;
    try { clearInterval(p.iv); } catch(e){}
    stats.gc1Cancel = stats.gc1Cancel || {}; stats.gc1Cancel[why] = (stats.gc1Cancel[why] || 0) + 1;
    stats.gc1Last = { act: 'cancel', why: why, ms: Date.now() - p.t0 };
    try { var el = document.getElementById('topStatus'); if (el && el.textContent === GC1_WAIT) gc1Top(msg || '', !!err); } catch(e){}
    if (msg) gc1Note(msg);
    try { console.log(TAG, 'GC1 cancel', why); } catch(e){}
  }
  function gc1Fire(){
    var p = gc1P; if (!p) return; gc1P = null;
    try { clearInterval(p.iv); } catch(e){}
    stats.gc1Fired = (stats.gc1Fired || 0) + 1; stats.gc1Last = { act: 'fire', ms: Date.now() - p.t0 };
    try { var el = document.getElementById('topStatus'); if (el && el.textContent === GC1_WAIT) gc1Top('', false); } catch(e){}
    var run = gc1Run = { p: p, t: Date.now(), contIn: false, contPass: false, subIn: false, subPass: false, blocked: null, cancel: null, done: false, wd: null };
    var ret;
    gc1Bypass = true;
    try { var g = getG(); if (g && typeof g.cont === 'function') ret = g.cont.apply(p.self, p.args); }   /* 1 回だけ。外側から入り直す＝fix912 自身と内側の関門（fix917/fix892/Vault）を今の状態で通す */
    catch(e){} finally { gc1Bypass = false; }
    /* ■GC1b: 発火した cont が終わったら結果を確かめる（生成された／預かり直す／表示する）。終わらない場合の見張りは GC1_RUN_MS。 */
    try { run.wd = setTimeout(function(){ gc1After(run, 'watchdog'); }, GC1_RUN_MS); } catch(eW){}
    try { Promise.resolve(ret).then(function(){ gc1After(run, 'settled'); }, function(){ gc1After(run, 'rejected'); }); } catch(eP){ gc1After(run, 'no-promise'); }
  }
  /* ■GC1b: fix912 の入口で、この呼び出しが「発火した cont」か「その中の submit」かを見分ける。違えば null（従来どおり）。 */
  function gc1RunFor(name){
    var r = gc1Run; if (!r || r.done || !gc1On()) return null;
    if (name === 'cont' && !r.contIn){ r.contIn = true; return r; }
    if (name === 'submit' && r.contPass && !r.subIn && gc1Inp() === GC1_SENT && gc1Mode() === 'STORY'){ r.subIn = true; return r; }
    return null;
  }
  /* ■GC1b: 通してよいか（null = 通す）。読むだけ。 */
  function gc1RunCheck(r, id){
    try {
      if (r.cancel) return r.cancel;
      if (!id || String(id) !== r.p.id) return 'story-changed';
      if (document.visibilityState === 'hidden') return 'hidden';
      if (gc1Turns() !== r.p.turns) return 'turns-changed';
      if (pending(id) || preflightBusy) return 'hold-or-conflict';
      if (!f705Released() || inProgress913(id)) return 'not-released';
      var s = gc1Save(id);
      if (s.mk === 'DIVERGED' || s.mk === 'BOOTSTRAP_HOLD' || s.hold) return 'hold-or-conflict';
      if (s.mk !== 'CLEAN' || s.inFlight) return 'dirty';   /* 保存前に生成しない */
      return null;
    } catch(e){ return 'threw'; }
  }
  function gc1RestoreInp(p){   /* G.cont が空にした／決まり文句を置いた入力欄を、押したときの文字へ戻す（ほかの文字が入っていれば触らない） */
    try { var i = document.getElementById('inp'); if (!i || p.inp == null) return; var v = String(i.value);
          if (v !== p.inp && (v === '' || v === GC1_SENT)) i.value = p.inp; } catch(e){}
  }
  function gc1Drop(run, why, msg, err){
    stats.gc1Dropped = (stats.gc1Dropped || 0) + 1; stats.gc1Drop = stats.gc1Drop || {}; stats.gc1Drop[why] = (stats.gc1Drop[why] || 0) + 1;
    stats.gc1Last = { act: 'drop', why: why, ms: Date.now() - run.p.t0 };
    gc1RestoreInp(run.p);
    if (msg){ try { var el = document.getElementById('topStatus'); if (el && (el.textContent === '' || el.textContent === GC1_WAIT)) gc1Top(msg, !!err); } catch(e){} gc1Note(msg); }
    try { console.log(TAG, 'GC1 fired but not started', why); } catch(e){}
  }
  function gc1After(run, how){
    if (!run || run.done) return;
    var S = getS(), p = run.p;
    if (gc1Turns() > p.turns || (S && S.inFlight)){ gc1End(run); stats.gc1Started = (stats.gc1Started || 0) + 1; return; }   /* 生成された／生成中 */
    if (run.subPass && !run.late && how !== 'watchdog'){   /* 本物の submit へ渡した直後で、まだ生成中の印が立っていないことがある → 一度だけ待って確かめ直す */
      run.late = true; try { setTimeout(function(){ gc1After(run, 'late'); }, 2500); return; } catch(eL){}
    }
    gc1End(run);
    var why = run.blocked || (run.subPass ? 'no-turn' : (run.contIn ? 'stopped-inside' : 'stopped-outside'));
    if (why === 'story-changed'){ stats.gc1Drop = stats.gc1Drop || {}; stats.gc1Drop[why] = (stats.gc1Drop[why] || 0) + 1; return; }   /* 別の物語の画面には何も出さない・何も送らない */
    if (why === 'dirty' && !p.rearm && !off() && gc1On() && String(sid()) === p.id && (Date.now() - p.t0) < GC1_MAX_MS){
      /* 1 回だけ預かり直す（保存が終わるのをもう一度待つ）。期限は最初に押した時刻から 60 秒のまま。 */
      gc1RestoreInp(p);
      if (gc1Inp() === p.inp && gc1Mode() === p.mode && gc1Turns() === p.turns && !gc1P){
        p.rearm = 1; p.away = false; p.clean = 0; p.routed0 = gc1Save(p.id).routed;
        stats.gc1Rearm = (stats.gc1Rearm || 0) + 1; stats.gc1Last = { act: 'rearm', ms: Date.now() - p.t0 };
        gc1P = p; gc1Show(); p.iv = setInterval(gc1Tick, 250);
        try { console.log(TAG, 'GC1 re-hold (the story was saved again before the send)'); } catch(e){}
        return;
      }
    }
    if (why === 'other-press') return gc1Drop(run, why, GC1_OTHER);
    if (why === 'hidden' || why === 'pagehide') return gc1Drop(run, why, GC1_AWAY);
    if (why === 'turns-changed') return gc1Drop(run, why, GC1_EDIT);
    gc1Drop(run, why, GC1_RETRY, true);
  }
  function gc1End(run){ run.done = true; try { clearTimeout(run.wd); } catch(e){} if (gc1Run === run) gc1Run = null; }
  function gc1Tick(){
    var p = gc1P; if (!p) return;
    try {
      var id = sid();
      if (off() || !gc1On()) return gc1Cancel('killed', null);
      if (!id || String(id) !== p.id) return gc1Cancel('story-changed', null);
      if (document.visibilityState === 'hidden'){ p.away = true; return; }
      if (p.away) return gc1Cancel('hidden', GC1_AWAY);
      if (gc1Inp() !== p.inp || gc1Mode() !== p.mode) return gc1Cancel('input-changed', GC1_EDIT);
      if (gc1Turns() !== p.turns) return gc1Cancel('turns-changed', GC1_EDIT);
      if (Date.now() - p.t0 > GC1_MAX_MS) return gc1Cancel('timeout', GC1_FAIL, true);
      var s = gc1Save(id);
      if (s.mk === 'DIVERGED' || s.mk === 'BOOTSTRAP_HOLD' || s.hold || pending(id)) return gc1Cancel('hold-or-conflict', GC1_FAIL, true);
      if (s.inFlight || s.timer){ p.clean = 0; return; }                  /* 保存の予約・送信中 → 待つ */
      if (s.mk === 'CLEAN'){
        var S = getS(); if (S && S.inFlight) return;
        if (preflightBusy || inProgress913(id) || !f705Released()) return;
        try { var g5 = window.__v292Dfix543; if (g5 && typeof g5.unsaved === 'function' && !g5.off()){ var u = g5.unsaved(); if (u && u.active) return gc1Cancel('unsaved', GC1_FAIL, true); } } catch(e5){}
        p.clean = (p.clean || 0) + 1; if (p.clean < 2) return;   /* ■GC1b: CLEAN を 2 回続けて（250ms あけて）見てから始める（保存の直後にもう一度 DIRTY へ戻る場合を拾う） */
        return gc1Fire();
      }
      p.clean = 0;
      if (s.routed > p.routed0) return gc1Cancel('save-failed', GC1_FAIL, true);   /* 保存は終わったが CLEAN にならず、次の予約も無い＝失敗 */
    } catch(e){ gc1Cancel('threw', GC1_FAIL, true); }
  }
  function gc1Hold(self, args){
    var id = sid(); if (!id) return;
    var s = gc1Save(id);
    gc1P = { id: String(id), self: self, args: args, t0: Date.now(), inp: gc1Inp(), mode: gc1Mode(), turns: gc1Turns(), routed0: s.routed, away: false, iv: null };
    stats.gc1Held = (stats.gc1Held || 0) + 1; stats.gc1Last = { act: 'hold', mk: s.mk, inFlight: s.inFlight, timer: s.timer, t: Date.now() };
    gc1Show();
    gc1P.iv = setInterval(gc1Tick, 250);
    try { console.log(TAG, 'GC1 hold (wait for the pending save)', s.mk); } catch(e){}
  }
  try { window.addEventListener('pagehide', function(){ if (gc1P) gc1Cancel('pagehide', null); if (gc1Run && !gc1Run.subPass) gc1Run.cancel = 'pagehide'; });
        window.addEventListener('beforeunload', function(){ if (gc1P) gc1Cancel('beforeunload', null); if (gc1Run && !gc1Run.subPass) gc1Run.cancel = 'pagehide'; }); } catch(e){}
  /* 預かり中に「続きを書く」以外のボタン・リンク等（🏠 ホーム・設定・モード・送信など）を押した → その場で取りやめる。
     🏠 は遷移の前に保存の完了を最大 3 秒待つ（fix697 flushForNav）ので、ここで止めないと離れる直前に生成してしまう（実測）。
     入力欄そのものを触っただけでは取りやめない（文字が変わったら gc1Tick が取りやめる）。 */
  function gc1OnPress(ev){
    if (!gc1P && !(gc1Run && !gc1Run.subPass)) return;
    try { var t = ev.target, el = (t && t.closest) ? t.closest('button,a,[onclick],input,select,textarea,label,[role="button"]') : null;
          if (!el || el.id === 'inp') return;
          if (/\bG\.cont\(/.test(el.getAttribute('onclick') || '')) return;
          if (gc1P) gc1Cancel('other-press', GC1_OTHER);
          else if (gc1Run && !gc1Run.subPass && !gc1Run.cancel) gc1Run.cancel = 'other-press';   /* ■GC1b: 発火から本物の送信までの間に別の操作 → 送らない */
    } catch(e){}
  }
  try { document.addEventListener('pointerdown', gc1OnPress, true); document.addEventListener('click', gc1OnPress, true); } catch(e){}

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
        /* ■GC1b: 発火した cont／その中の submit は、ここで今の状態を確かめる。CLEAN なら通す。そうでなければ送らない（結果は gc1After が表示／預かり直し）。
           実行中に来た別の「続きを書く」は吸収する（二重に始めない）。v292DfixGC1Off のときはこの分岐に入らない。 */
        if (gc1Run && !gc1Run.done && gc1On()){
          var run = gc1RunFor(name);
          if (run){
            var whyNot = gc1RunCheck(run, id);
            if (whyNot){ run.blocked = whyNot; stats.gc1Blocked = stats.gc1Blocked || {}; stats.gc1Blocked[name + ':' + whyNot] = (stats.gc1Blocked[name + ':' + whyNot] || 0) + 1; return; }
            if (name === 'cont') run.contPass = true; else run.subPass = true;
            stats.preflightSkip++; return orig.apply(self, args);
          }
          if (name === 'cont'){ stats.gc1Absorbed = (stats.gc1Absorbed || 0) + 1; return; }
        }
        if (gc1P){ if (name === 'cont' && !gc1Bypass){ stats.gc1Absorbed = (stats.gc1Absorbed || 0) + 1; gc1Show(); return; }   /* ■GC1: 預かりは 1 件だけ（二度押しは吸収） */
                   if (name !== 'cont') gc1Cancel('other-send', GC1_EDIT); }                                                   /* ■GC1: 送信・やり直しを押した → 預かりをやめる（その押下は従来どおり） */
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
        /* ■GC1（GCONT-01・GPT #127-SM B4）: 「続きを書く」だけ。従来はここで preflight を始めて即 return したため、G.cont が
           先に終わって入力欄を空にし、preflight 後の本物の submit が空の入力で何もしなかった（1 回目が黙って消える）。
           GC1 はこの押下を 1 件だけ預かり、すでに予約されている保存（fix697 の debounce → putcanonical）が終わるのを待つ
           （保存を始めない・変えない・急がせない。読むのは marker / fix697 の状態だけ）。終わったら
           同じ物語・同じ入力欄の文字・同じモード・marker CLEAN・hold/conflict なし・生成中でない を確かめて 1 回だけ G.cont を呼ぶ。
           保存の失敗・時間切れ・入力の変更・他の送信・タブを離れた → 預かりを取りやめて表示する（生成しない）。 */
        if (name === 'cont' && gc1On() && !gc1Bypass){ gc1Hold(self, args); return; }
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
        if (gc1P) gc1Cancel('other-entry', GC1_EDIT);   /* ■GC1: 取り消し・場面開始・リセットを押した → 預かりをやめる */
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
                                 preflightBusy: preflightBusy, gc1: { on: gc1On(), pending: gc1P ? { id: gc1P.id, ms: Date.now() - gc1P.t0, rearm: gc1P.rearm || 0 } : null, running: !!(gc1Run && !gc1Run.done) },
                                 stats: JSON.parse(JSON.stringify(stats)) }; }
  };
  try { console.log(TAG, 'loaded (kill=v292Dfix912Off=1 / v292Dfix911Off=1)'); } catch(e){}
})();
