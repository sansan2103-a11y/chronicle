/* v292Dfix945 — XTAB_STALE_GUARD v2（MULTI_TAB_STALE_SNAPSHOT candidate C2、GPT #117 → #118 ACCEPTED_WITH_FIXES）
 * 実測（fx_mt MT1/MT3、offline）: 同じ story を 2 タブで開き、B が編集→保存→CAS 確定（rev+1）した後、
 *   A（古い in-memory S のまま）が別項目を保存すると、A の S.save が B の本文を LS で上書き → fix697 が
 *   共有 marker（LS）の lastConfirmed で CAS 成功 → canonical が巻き戻る（B の編集が警告なしに消える）。
 *   fix170D の epoch は reset 時にしか進まないので、この経路は守られていない。
 * 対処（最小・fail-closed・write 0・既存 fingerprint / revision / generation を使う）:
 *   (1) save-time check（storage event に依存しない。#118 の要求）:
 *       この document が最後に **自分で** 書いた/確認した時点の story 状態を seen に持つ
 *         seen = { body: fnv(LS 本文), gen: marker.localGeneration, rev: lastConfirmed.serverRev, fp: lastConfirmed.fingerprint }
 *       S.save の直前に LS の現在値と比べ、1 つでも違えば「別 document が書いた」= STALE → **書かない** + 通知。
 *       seen の更新は、自分の story-owned write（fix654/fix781 と同じ setItem chain で観測、書込成功後）と、
 *       自分の CAS ACK（fix697 が呼ぶ __v292Dfix781.confirm を外側から包む）だけ。boot 時に初期化。
 *       別 document の書込は seen に反映されないので、次の S.save で必ず不一致になる。
 *       chain 観測時も「書く前の gen/body が seen と違う」「書いた後の gen が +1 を超えて進んだ」なら STALE。
 *   (2) storage event（別 document の書込でだけ発火）は早期検知として併用（kill: v292Dfix945EvtOff='1'、fixture 用）。
 *   (3) STALE 後は S.save を通らない story-owned sidecar write（fix743 keysFor の 13 key）も chain で **no-op** にする
 *       （fix909 bridge → fix697 commit 予約は書込成功後にしか呼ばれないので、CAS も出ない）。
 *   (4) 通知は画面下に 1 回だけ（再読み込みボタン付き）。自動 reload / merge / retry はしない。
 * 残り: 自分の write と別 document の write が同一 ms に重なる窓（after.gen で検出する分を除く）。
 * kill switch: localStorage['v292Dfix945Off']='1'   検証口: window.__v292Dfix945
 */
(function v292Dfix945(){
  if (window.__v292Dfix945) return;
  var TAG = '[v292Dfix945]';
  var stale = {};            /* storyId -> { t, why, detail } */
  var seen = {};             /* storyId -> { body, gen, rev, fp } */
  var stats = { blockedSave: 0, blockedSidecar: 0, events: 0, refreshes: 0, checks: 0, layer: 'none' };
  var bannerFor = null;
  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix945Off') === '1'; }
  function evtOff(){ return lsg('v292Dfix945EvtOff') === '1'; }
  function getS(){ try { return window.S || (0,eval)('typeof S!=="undefined"?S:null'); } catch(e){ return null; } }
  function readPtr(){ try { return JSON.parse(lsg('chr6_active_slot') || '"default"') || 'default'; } catch(e){ return 'default'; } }
  function urlStory(){ try { var m = /[?&]story=([A-Za-z0-9]+)/.exec(location.search || ''); return m ? m[1] : null; } catch(e){ return null; } }
  function current(){ return urlStory() || readPtr(); }
  function fnv(s){ var h = 0x811c9dc5; s = String(s == null ? '' : s); for (var i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return s.length + ':' + h.toString(16); }
  function marker(id){ try { var m = JSON.parse(lsg('v292Dfix402_f781g_' + id) || 'null'); return (m && typeof m === 'object') ? m : null; } catch(e){ return null; } }
  /* ★v2.3（SAVE P1 / GPT #125）: marker 不在 = fix781 の初期値（ensureMarker の localGeneration 0）と同じ基準 0 として扱う。
     旧 v2.2 は不在を -1 にしていたため、marker の無い story（新規作成で promotion が通らず shadow のまま等）で
     この document 自身の最初の story-owned write（fix781 markIntent: 0→1）が before -1 / after 1 = gen-jump と誤判定され、
     以後の S.save / sidecar write を全部 STALE で止めていた（offline 再現 NEWPLAY_pf*）。別 document の書込判定は変えない
     （別 document が marker を作れば gen 1 以上になり、こちらの基準 0 と食い違う = 従来どおり STALE）。 */
  function view(id){ var m = marker(id); return { body: fnv(lsg('chr6_slot_' + id)), gen: m ? (+m.localGeneration || 0) : 0, rev: (m && m.lastConfirmed) ? (m.lastConfirmed.serverRev == null ? null : +m.lastConfirmed.serverRev) : null, fp: (m && m.lastConfirmed && m.lastConfirmed.fingerprint) ? String(m.lastConfirmed.fingerprint) : null }; }
  function refresh(id){ if (!id) return; seen[id] = view(id); stats.refreshes++; }
  /* 判定は marker の generation / lastConfirmed(rev, fp) だけで行う。別 document の fix781 付き save は必ず gen を進め、
     別 document の CAS は rev/fp を進める。本文だけの差（gen/rev/fp 不変）は同一 document の native 正規化（boot 時に実測）でも
     起きるので STALE にしない（home pull / 他タブ hydrate の native 書込は storage event 側で拾う。残差として報告）。 */
  function diff(a, b){ var d = []; if (!a || !b) return ['no-seen']; if (a.gen !== b.gen) d.push('gen:' + a.gen + '>' + b.gen); if (a.rev !== b.rev) d.push('rev:' + a.rev + '>' + b.rev); if (a.fp !== b.fp) d.push('fp'); if (!d.length && a.body !== b.body) stats.bodyOnly = (stats.bodyOnly || 0) + 1; return d; }
  function markStale(id, why, detail){ if (!stale[id]) stale[id] = { t: Date.now(), why: why, detail: detail || null }; try { console.warn(TAG, 'story ' + id + ' STALE (' + why + ' ' + JSON.stringify(detail || null) + ') — this tab must reload before it may save'); } catch(_){} }
  /* ---- (1) save-time check ---- */
  function checkNow(id, who){
    stats.checks++;
    if (stale[id]) return true;
    if (!seen[id]){ refresh(id); return false; }           /* 初見: いまの LS を自分の基準にする（boot 直後） */
    var d = diff(seen[id], view(id));
    if (d.length){ markStale(id, who, d); return true; }
    return false;
  }
  /* ---- (2) storage event（early flag; 別 document の書込でだけ発火） ---- */
  function onStorage(e){
    try {
      if (evtOff() || !e || !e.key) return;
      var k = String(e.key), id = null, kind = null;
      var mb = /^chr6_slot_([A-Za-z0-9]+)$/.exec(k);
      if (mb){ id = mb[1]; kind = 'body'; }
      else { var mm = /^v292Dfix402_f781g_([A-Za-z0-9]+)$/.exec(k);
        if (mm){ var a = null, b = null; try { a = JSON.parse(e.oldValue || 'null'); b = JSON.parse(e.newValue || 'null'); } catch(_){}
          var ga = a ? (+a.localGeneration || 0) : -1, gb = b ? (+b.localGeneration || 0) : -1;
          var ra = (a && a.lastConfirmed) ? a.lastConfirmed.serverRev : null, rb = (b && b.lastConfirmed) ? b.lastConfirmed.serverRev : null;
          if (b && (ga !== gb || ra !== rb)){ id = mm[1]; kind = 'marker:g' + ga + '>' + gb + ':r' + ra + '>' + rb; } } }
      if (!id) return;
      stats.events++;
      markStale(id, 'storage-event', kind);
    } catch(_){}
  }
  try { window.addEventListener('storage', onStorage); } catch(e){}
  /* ---- (4) 通知 ---- */
  function banner(id){
    if (bannerFor === id) return; bannerFor = id;
    try {
      var d = document.createElement('div');
      d.id = 'v292Dfix945-banner';
      d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483000;background:#7a1f1f;color:#fff;font:14px/1.5 system-ui,sans-serif;padding:10px 14px;text-align:center;box-shadow:0 -2px 8px rgba(0,0,0,.4)';
      d.textContent = 'この物語は別のタブ（または画面）で更新されました。このタブの変更は保存されません。ページを再読み込みして最新の内容を開き直してください。';
      var b = document.createElement('button'); b.textContent = '再読み込み'; b.style.cssText = 'margin-left:12px;padding:4px 12px;font:inherit;cursor:pointer';
      b.onclick = function(){ try { location.reload(); } catch(e){} }; d.appendChild(b);
      (document.body || document.documentElement).appendChild(d);
    } catch(e){}
    try { if (typeof showToast === 'function') showToast('別のタブで更新されたため、このタブでは保存できません。再読み込みしてください。', true); } catch(e){}
  }
  /* ---- S.save wrap（fix525 と同型・外側） ---- */
  var wrapped = false;
  function wrapSave(){
    var S = getS();
    if (!S || typeof S.save !== 'function') return false;
    if (S.__f945wrapped){ wrapped = true; return true; }
    var inner = S.save.bind(S);
    S.save = function(){
      if (off()) return inner.apply(this, arguments);
      var id = current();
      if (id && id !== 'default' && checkNow(id, 'S.save')){
        stats.blockedSave++;
        try { console.warn(TAG, 'S.save blocked: story ' + id + ' ' + JSON.stringify(stale[id])); } catch(e){}
        banner(id);
        return { hold: true, code: 'XTAB_STALE', wrote: 0, storyId: id };   /* ★書かない・reload しない・merge しない。★v2.3: caller が成功扱いしないよう hold を返す（fix748 refuse と同じ形） */
      }
      var r = inner.apply(this, arguments);
      if (id && id !== 'default') refresh(id);          /* 自分の書込後の状態を基準にする（chain 観測でも更新される） */
      return r;
    };
    try { for (var p in inner){ if (!(p in S.save)){ try { S.save[p] = inner[p]; } catch(e){} } } } catch(e){}
    S.__f945wrapped = true; wrapped = true;
    try { var id0 = current(); if (id0 && id0 !== 'default' && !seen[id0]) refresh(id0); } catch(e){}
    try { console.log(TAG, 'S.save wrapped (own=' + current() + ')'); } catch(e){}
    return true;
  }
  (function poll(){ if (wrapSave()) return; poll._n = (poll._n || 0) + 1; if (poll._n > 240) { try { console.warn(TAG, 'S.save not found; idle'); } catch(e){} return; } setTimeout(poll, 250); })();
  /* ---- (1)(3) story-owned write の chain 観測（fix781 layer1 と同じ chain・外側） ---- */
  function owned(k, id){ try { var G = window.__v292Dfix781; if (G && typeof G.isStoryOwned === 'function') return !!G.isStoryOwned(String(k), id); } catch(e){} return String(k) === 'chr6_slot_' + id; }
  function isSelf(k){ k = String(k); return k.indexOf('v292Dfix402_f781g_') === 0 || k.indexOf('v292Dfix945') === 0 || k.indexOf('v292Dfix781') === 0; }
  var prevSet = null, prevRem = null;
  function guardWrite(k, isRem, apply){
    if (off() || isSelf(k)) return apply();
    var id = current(); if (!id || id === 'default') return apply();
    if (!owned(k, id)){
      /* ★v2.3（SAVE P1 / GPT #125、本番ログ「S.save ["gen:6>7"]」の再現経路）: key 名だけでは story-owned と判定できない write が
         下層の wrapper（fix246 の slot 接尾辞 redirect: 'v292Dfix77States' → 'v292Dfix77States_slot_<id>' 等）で story-owned key に
         変わり、fix781 が gen を +1 する。旧 v2.2 はこの write を素通しして seen を更新しなかったため、次の S.save が自分自身の
         gen 進行を「別 document」と誤判定した。ここでは **この呼出しの中で** gen が進んだかを前後で測る:
           +1 ちょうど かつ 呼出し前の LS が seen と一致（= 外部更新なし）→ 自分の確定操作として seen を更新
           +2 以上 → gen-jump（従来どおり別 document の割込）
           呼出し前の時点で seen と食い違っていた → 外部更新（STALE）。generation への無条件追従はしない。 */
      var b0 = view(id); var r0 = apply(); var a0 = view(id);
      if (a0.gen !== b0.gen){
        if (a0.gen > b0.gen + 1) markStale(id, 'gen-jump', [b0.gen, a0.gen]);
        else if (seen[id] && !stale[id]){ var d0 = diff(seen[id], b0); if (d0.length) markStale(id, 'pre-redirect', d0); }
        if (!stale[id]) refresh(id);
      }
      return r0;
    }
    if (checkNow(id, isRem ? 'removeItem' : 'setItem')){
      var isBody = (String(k) === 'chr6_slot_' + id);
      stats.blockedSidecar++;
      try { console.warn(TAG, (isRem ? 'removeItem' : 'setItem') + ' blocked (stale): ' + String(k).slice(0, 60)); } catch(e){}
      banner(id);
      return undefined;                                  /* ★no-op（fix909 bridge は書込成功後にしか動かない） */
    }
    var before = view(id);
    var r = apply();
    var after = view(id);
    if (after.gen > before.gen + 1) markStale(id, 'gen-jump', [before.gen, after.gen]);   /* 自分の +1 を超えて進んだ = 別 document が割り込んだ */
    refresh(id);
    return r;
  }
  (function installLayer(){
    try {
      var W = window.__v292Dfix654;
      var wrappedSet = function(k, v){ var self = this, args = arguments; return guardWrite(k, false, function(){ return prevSet ? prevSet.apply(self, args) : undefined; }); };
      var wrappedRem = function(k){ var self = this, args = arguments; return guardWrite(k, true, function(){ return prevRem ? prevRem.apply(self, args) : undefined; }); };
      if (W && typeof W.wrap === 'function'){
        var ps = W.wrap('setItem', wrappedSet, localStorage), pr = W.wrap('removeItem', wrappedRem, localStorage);
        if (typeof ps === 'function'){ prevSet = ps; stats.layer = 'fix654.wrap'; }
        if (typeof pr === 'function'){ prevRem = pr; }
      }
      if (stats.layer === 'none'){
        prevSet = localStorage.setItem; prevRem = localStorage.removeItem;
        if (typeof prevSet === 'function'){ localStorage.setItem = wrappedSet; if (typeof prevRem === 'function') localStorage.removeItem = wrappedRem; stats.layer = 'instance-assign'; }
      }
    } catch(e){ try { console.warn(TAG, 'layer install failed', e && e.message); } catch(_){} }
  })();
  /* ---- 自分の CAS ACK（fix697 → __v292Dfix781.confirm）で seen.rev/fp を更新 ---- */
  (function wrapConfirm(){
    var n = 0; (function tryWrap(){ var G = window.__v292Dfix781; if (G && typeof G.confirm === 'function' && !G.__f945c){ var orig = G.confirm; G.confirm = function(id){
        var sid = (id != null) ? String(id) : null, mine = (sid && sid === current());
        /* 自分の ACK / 収束確認の **前** に、別 document の gen 進行が無かったかを見る（rev/fp はこれから自分が変えるので見ない） */
        try { if (mine && seen[sid] && !stale[sid]){ var v0 = view(sid); if (v0.gen !== seen[sid].gen) markStale(sid, 'confirm-pre', ['gen:' + seen[sid].gen + '>' + v0.gen]); } } catch(e){}
        var r = orig.apply(this, arguments);
        try { if (mine && !stale[sid]) refresh(sid); } catch(e){}
        return r; }; G.__f945c = true; return; } if (++n < 240) setTimeout(tryWrap, 250); })();
  })();
  /* ---- ■fix729t: 自分の title-only ACK（fix729 → __v292Dfix781.titleAdvance）でも seen.rev/fp を更新する ----
     confirm と同じ扱い。titleAdvance が lastConfirmed を進めたとき（ok:true）だけ refresh。
     呼ぶ前に別 document の gen 進行が無かったかを見る（confirm-pre と同じ）。kill は fix781 側の v292Dfix729tOff。 */
  (function wrapTitleAdvance(){
    var n = 0; (function tryWrap(){ var G = window.__v292Dfix781; if (G && typeof G.titleAdvance === 'function' && !G.__f945t){ var orig = G.titleAdvance; G.titleAdvance = function(id){
        var sid = (id != null) ? String(id) : null, mine = (sid && sid === current());
        try { if (mine && seen[sid] && !stale[sid]){ var v0 = view(sid); if (v0.gen !== seen[sid].gen) markStale(sid, 'title-pre', ['gen:' + seen[sid].gen + '>' + v0.gen]); } } catch(e){}
        if (mine && stale[sid]) return { ok: false, why: 'XTAB_STALE' };
        var r = orig.apply(this, arguments);
        try { if (mine && !stale[sid] && r && r.ok) refresh(sid); } catch(e){}
        return r; }; G.__f945t = true; return; } if (G && typeof G.confirm === 'function' && typeof G.titleAdvance !== 'function') return; if (++n < 240) setTimeout(tryWrap, 250); })();
  })();
  window.__v292Dfix945 = {
    BUILD: 'fix945.3+729t',
    state: function(){ return { on: !off(), evtOn: !evtOff(), wrapped: wrapped, current: current(), stale: JSON.parse(JSON.stringify(stale)), seen: JSON.parse(JSON.stringify(seen)), stats: JSON.parse(JSON.stringify(stats)) }; },
    isStale: function(id){ return !!stale[id || current()]; },
    check: function(id){ return checkNow(id || current(), 'manual'); },
    clear: function(){ stale = {}; bannerFor = null; try { var d = document.getElementById('v292Dfix945-banner'); if (d) d.remove(); } catch(e){} },   /* 診断用のみ */
    reset: function(){ stale = {}; seen = {}; bannerFor = null; try { var d = document.getElementById('v292Dfix945-banner'); if (d) d.remove(); } catch(e){} try { var id = current(); if (id && id !== 'default') refresh(id); } catch(e){} }   /* 診断・fixture 用のみ（LS を今の基準にする） */
  };
})();
