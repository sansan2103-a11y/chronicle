// =====================================================================
// Chronicle v292Dfix698: AUTHORIZED CANONICAL MUTATION BUS（B+案・STEP3B）
// ---------------------------------------------------------------------
// ■目的（GPT裁定 STEP3B）
//   fix697 の commit trigger は S.save ラップ ＋ sidecar 20 秒 poll の 2 つしかなく、
//   index.html の hygiene 群（fixProviderCfg / fixGenderAndNames / purgeBadDialogues /
//   generateHeroAvatar / generateNpcAvatar）・features.js の setCast / importToSlot・
//   f694key の fallback 経路が **trigger に到達していなかった**
//   （STEP2.5 の cfg.model ±36 が実測証拠）。
//   これを **個々の writer に patch せず**、storage 書込境界で
//   「**成功した** canonical mutation」を観測して 1 本の signal へ収束させる。
//
// ■3 層（裁定の分離要求）
//   layer1  storage 境界: 成功した setItem のみ { key, oldValue, newValue } を通知。
//           ★cloud 知識 0 / storyId 解決 0 / commit 判断 0。
//           引数・戻り値・例外を一切変更しない。native throw なら通知 0。
//           外側 wrapper が遮断したら（native に届かないので）通知 0。
//   layer2  resolver: key → storyId、および「canonical 内容が実際に変わったか」判定。
//   layer3  分類: document authority と一致 → DOCUMENT_CANONICAL_DIRTY（fix697 debounce へ）
//                 不一致 → OUT_OF_DOCUMENT_CANONICAL_DIRTY（pending のみ・**代理 commit 禁止**）
//
// ■B+案（A案＝fix654 変更は裁定で REJECTED / NOT NEEDED）
//   layer1 は fix654 の公開 API __v292Dfix654.wrap('setItem', fn) で instance chain の
//   **最内側**（native 直前）に入る。fix654 は 1 バイトも変更しない。
//   ★ただし Storage.prototype.setItem を直接捕獲する 2 モジュールは chain を迂回する:
//     v292Dfix297（aiInstr の rawSet）… §aiInstr の縮退 poll ＋ pagehide final check で補償
//     v292Dfix291（まるごと読込の rawSet）… §fix291 参照（crash window は OPEN のまま）
//
// ■chr6_active_slot は authority に一切使わない（fix694 immutable authority のみ）。
// ■canonical read / canonical table には触れない（HOLD 遵守）。commit 先は story_shadow のまま。
//
// スイッチ（★GATE1: 既定 OFF の opt-in）:
//   有効 = v292Dfix698On === '1' かつ v292Dfix698Off !== '1'
//   OFF のとき observable behavior 0（bus 副作用 / pending write / aiInstr poll /
//   getstory / dirty 通知 すべて 0）。listener は install するが入口で即 return する。
// ★GATE2: index.html と home.html の **両方**で fix654 直後（2 番目）に置く。
//   HOME は authority=null なので story mutation は OUT_OF_DOCUMENT → pending のみ・
//   proxy commit 0 になる。
// ★GATE3: fix698 は fix697 より先にロードされるため、fix697 未 ready 中の
//   CURRENT DOCUMENT mutation を非永続メモリで保持し ready 後に 1 回だけ引き渡す。
// 検証口: window.__v292Dfix698 = { status, bus, pending, applyGate, resolve, verifyPending, … }
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix698) return;
  var TAG = '[v292Dfix698:mutation-bus]';
  var PENDING_KEY = 'v292Dfix698_canonPending';   // ★fix402 namespace は借用しない（裁定）
  var DEBOUNCE_MS = 12000, MAXWAIT_MS = 45000;
  var AIINSTR_POLL_MS = 20000;
  var BUS_CAP = 60;

  /* ★GATE1（裁定）: 既定 OFF の opt-in。
     有効条件 = v292Dfix698On === '1' AND v292Dfix698Off !== '1'。
     OFF のとき observable behavior を一切出さない:
       bus side effect 0 / pending write 0 / aiInstr poll action 0 / getstory 0 / dirty 通知 0。
     listener（layer1 / visibilitychange / pagehide / interval）は install してよいが、
     すべての入口で on() を最初に確認して即 return する。 */
  function off(){ try { return localStorage.getItem('v292Dfix698Off') === '1'; } catch(e){ return false; } }
  function on(){ try { return !off() && localStorage.getItem('v292Dfix698On') === '1'; } catch(e){ return false; } }

  /* native 直読み（wrapper を通さず「実際に入っている値」を得る）。
     fix246 が redirect する固定キー群（v292Dfix77States / chr6_v292Dfix104_dlg /
     chr6_v292Dfix135_* / _136_wi / _137_ev）とは **1 つも重ならない**ので安全。 */
  var rawGet = null;
  try { rawGet = Storage.prototype.getItem.bind(localStorage); } catch(e){ rawGet = null; }
  function lsg(k){ try { return rawGet ? rawGet(String(k)) : localStorage.getItem(String(k)); } catch(e){ return null; } }
  function lss(k,v){ try { localStorage.setItem(String(k), String(v)); return true; } catch(e){ return false; } }
  function lsdel(k){ try { localStorage.removeItem(String(k)); } catch(e){} }

  // ---- fix694 document authority（唯一の storyId 源） ----
  function authorityKey(){
    try { var k = window.__chronicleDocumentStoryKey; return (typeof k === 'string' && k) ? k : null; } catch(e){ return null; }
  }
  function documentStoryId(){
    var k = authorityKey();
    if (!k) return null;
    if (k === 'chr6') return 'default';
    if (k.indexOf('chr6_slot_') === 0) return k.slice(10);
    return null;
  }

  // =====================================================================
  // layer2: resolver（key → storyId）
  // =====================================================================
  //   chr6 / chr6_slot_<id>                → body
  //   v292aiInstr / v292aiInstr_slot_<id>  → sidecar aiInstr
  //   genderMap_<id> / genderMap_"<id>"    → sidecar genderMap
  //   ★genderMap_default は **account-global**。story canonical mutation ではない → null
  function resolve(key){
    var k = String(key == null ? '' : key);
    if (k === 'chr6') return { storyId: 'default', part: 'body' };
    if (k.indexOf('chr6_slot_') === 0){ var id = k.slice(10); return id ? { storyId: id, part: 'body' } : null; }
    if (k === 'v292aiInstr') return { storyId: 'default', part: 'aiInstr' };
    if (k.indexOf('v292aiInstr_slot_') === 0){ var a = k.slice(17); return a ? { storyId: a, part: 'aiInstr' } : null; }
    if (k === 'genderMap_default' || k === 'genderMap_"default"') return null;   /* ★account-global */
    var mq = /^genderMap_"(.+)"$/.exec(k);
    if (mq) return { storyId: mq[1], part: 'genderMap', quoted: true };
    if (k.indexOf('genderMap_') === 0){ var g = k.slice(10); return g ? { storyId: g, part: 'genderMap', quoted: false } : null; }
    return null;                                   /* NOT CANONICAL MUTATION */
  }

  // ---- canonical projection（fix697 / Worker と同一規約の stableStringify） ----
  function stableStringify(v){
    if (v === undefined) return 'null';
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Object.prototype.toString.call(v) === '[object Array]'){
      var s = '['; for (var i = 0; i < v.length; i++) s += (i ? ',' : '') + stableStringify(v[i]); return s + ']';
    }
    var ks = []; for (var k in v){ if (Object.prototype.hasOwnProperty.call(v, k)) ks.push(k); }
    ks.sort();
    var o = '';
    for (var j = 0; j < ks.length; j++){ var kk = ks[j]; if (v[kk] === undefined) continue;
      o += (o ? ',' : '') + JSON.stringify(kk) + ':' + stableStringify(v[kk]); }
    return '{' + o + '}';
  }
  function bodyPart(raw){
    if (raw == null) return 'null';
    var d = null; try { d = JSON.parse(raw); } catch(e){ return 'PARSE_FAIL'; }
    if (!d || typeof d !== 'object' || Object.prototype.toString.call(d) === '[object Array]') return 'NOT_OBJ';
    var turns = (d.turns && Object.prototype.toString.call(d.turns) === '[object Array]') ? d.turns : [];
    return stableStringify({ cfg: (d.cfg === undefined ? null : d.cfg), cast: (d.cast === undefined ? null : d.cast),
      scene: (d.scene === undefined ? null : d.scene), turns: turns, mode: (d.mode === undefined ? null : d.mode) });
  }
  function gmPart(raw){
    if (raw == null) return 'null';
    try { var o = JSON.parse(raw); return (o && typeof o === 'object' && Object.prototype.toString.call(o) !== '[object Array]') ? stableStringify(o) : 'null'; }
    catch(e){ return 'null'; }
  }
  /* この key への書込が **canonical 内容を変えたか** */
  function canonicalChanged(r, key, oldV, newV){
    if (r.part === 'body') return bodyPart(oldV) !== bodyPart(newV);
    if (r.part === 'aiInstr') return String(oldV == null ? '' : oldV) !== String(newV == null ? '' : newV);
    if (r.part === 'genderMap'){
      /* ★STEP2 と同一の unquoted 優先規則。quoted への書込は unquoted が実在するなら
         canonical projection を変えない（＝ 無視して正しい）。 */
      if (r.quoted && lsg('genderMap_' + r.storyId) != null) return false;
      return gmPart(oldV) !== gmPart(newV);
    }
    return false;
  }
  /* story 全体の canonical projection hash（pending の hash に使う） */
  function storyCanonicalString(storyId){
    var bodyKey = (storyId === 'default') ? 'chr6' : ('chr6_slot_' + storyId);
    var ai = (storyId === 'default') ? lsg('v292aiInstr') : lsg('v292aiInstr_slot_' + storyId);
    var gmRaw = null;
    if (storyId !== 'default'){
      var un = lsg('genderMap_' + storyId);
      gmRaw = (un != null) ? un : lsg('genderMap_"' + storyId + '"');
    }
    return stableStringify({ id: String(storyId), body: bodyPart(lsg(bodyKey)),
      aiInstr: (ai == null ? null : String(ai)), genderMap: gmPart(gmRaw) });
  }
  function h10(s){
    if (s == null) return null;
    var a = 5381, b = 52711;
    for (var i = 0; i < s.length; i++){ var c = s.charCodeAt(i); a = (a * 33 ^ c) >>> 0; b = (b * 31 ^ c) >>> 0; }
    return ((a >>> 0).toString(16) + (b >>> 0).toString(16)).slice(0, 10);
  }
  function storyLocalHash(storyId){ return h10(storyCanonicalString(storyId)); }

  // =====================================================================
  // pending ledger（OUT_OF_DOCUMENT 保護）
  // =====================================================================
  function pendingMap(){
    try { var m = JSON.parse(lsg(PENDING_KEY) || '{}'); return (m && typeof m === 'object') ? m : {}; }
    catch(e){ return {}; }
  }
  function pendingSet(storyId, kind){
    if (!on()) return;                              /* ★GATE1: OFF 時は pending write 0 */
    try { var m = pendingMap();
      m[String(storyId)] = { hash: storyLocalHash(storyId), ts: Date.now(), kind: kind || 'out-of-document' };
      lss(PENDING_KEY, JSON.stringify(m)); } catch(e){}
  }
  function pendingClear(storyId){
    try { var m = pendingMap(); if (!(String(storyId) in m)) return false;
      delete m[String(storyId)];
      if (Object.keys(m).length) lss(PENDING_KEY, JSON.stringify(m)); else lsdel(PENDING_KEY);
      return true; } catch(e){ return false; }
  }
  /* ★canonical auto-apply ゲート（STEP3E が参照する。現時点では判定を返すだけ） */
  function applyGate(storyId){
    var id = (storyId == null) ? documentStoryId() : String(storyId);
    if (!id) return { block: false, reason: 'NO_AUTHORITY' };
    var p = pendingMap()[id];
    if (!p) return { block: false, reason: 'NO_PENDING' };
    var cur = storyLocalHash(id);
    /* ★裁定: match でも mismatch でも APPLY BLOCK。mismatch で pending を削除しない。 */
    return { block: true, reason: (p.hash === cur) ? 'PENDING_LOCAL_AHEAD' : 'PENDING_DIVERGED',
             pendingHash: p.hash, currentHash: cur, ts: p.ts, kind: p.kind };
  }

  // ---- pending 解除は「server が現在の local canonical と同一内容を保持している」ときのみ ----
  //   （＝ 200 normal / 200 noop の成功後にのみ成立する。409 では成立しない）
  //   read-only の診断 API op:'getstory' で確認する。**代理 commit はしない**。
  var verifying = false;
  function proxyUrl(){
    try { var u = (lsg('v292ProxyUrl') || '').replace(/\s+/g, ''); if (u) return u.replace(/\/+$/, '');
      if (window.__v292Dfix247bapi && window.__v292Dfix247bapi.DEFAULT_PROXY_URL) return window.__v292Dfix247bapi.DEFAULT_PROXY_URL; } catch(e){}
    return 'https://novel-proxy.sansan2103.workers.dev';
  }
  function authHeaders(){
    var h = { 'Content-Type': 'application/json' };
    try { var g = (window.__chronicleGoogleId && window.__chronicleGoogleId()) || ''; if (g) h['x-google-id'] = g; } catch(e){}
    try { var p = (lsg('v292ProxyPass') || '').replace(/^\s+|\s+$/g, ''); if (p) h['x-chronicle-pass'] = p; } catch(e){}
    return h;
  }
  function verifyPending(storyId, cb){
    if (!on()){ if (cb) cb(false); return; }        /* ★GATE1: OFF 時は getstory 0 */
    var id = (storyId == null) ? documentStoryId() : String(storyId);
    if (!id || verifying || !pendingMap()[id]){ if (cb) cb(false); return; }
    verifying = true;
    var localHash = null;
    try { localHash = window.__v292Dfix697 && window.__v292Dfix697.contentHash ? null : null; } catch(e){}
    /* fix697 の canonical projection hash（server の serverHash と同一規約）を使う */
    try {
      window.__v292Dfix697.contentHash(function(lh){
        if (!lh){ verifying = false; if (cb) cb(false); return; }
        fetch(proxyUrl() + '/save', { method: 'POST', headers: authHeaders(),
          body: JSON.stringify({ op: 'getstory', id: id }) })
          .then(function(r){ return r.json(); })
          .then(function(j){
            verifying = false;
            var cleared = false;
            if (j && j.ok && j.serverHash && j.serverHash === lh) cleared = pendingClear(id);
            if (cb) cb(cleared);
          })['catch'](function(){ verifying = false; if (cb) cb(false); });
      });
    } catch(e){ verifying = false; if (cb) cb(false); }
  }

  // =====================================================================
  // layer3: dirty 分類 ＋ 既存 fix697 への接続（debounce）
  // =====================================================================
  var stats = { busEvents: 0, notCanonical: 0, noChange: 0, docDirty: 0, outOfDoc: 0,
                pendingSet: 0, pendingCleared: 0, flushes: 0, preReadyDrained: 0 };
  var BUS = [];
  function note(row){ row.t = Date.now(); BUS.push(row); while (BUS.length > BUS_CAP) BUS.shift(); }

  /* ★GATE3: fix697 ready 検出と pre-ready dirty の引き渡し（非永続・メモリのみ） */
  var preReadyDirty = false, drainTimer = null, drainTries = 0;
  function fix697Ready(){
    try { return !!(window.__v292Dfix697 && typeof window.__v292Dfix697.flush === 'function'); }
    catch(e){ return false; }
  }
  function doFlush(){
    stats.flushes++;
    /* ★fix697 の commit をそのまま使う（fix697 の意味論は 1 バイトも変えない）。
       fix697.commit() 側に inFlight ガードと lastSentHash の no-op skip があるので、
       fix697 自身の S.save trigger と二重に走っても余分な commit にはならない。 */
    try { if (window.__v292Dfix697 && window.__v292Dfix697.flush) window.__v292Dfix697.flush(); } catch(e){}
    setTimeout(function(){ try { verifyPending(null, null); } catch(e){} }, 2500);
  }
  function armPreReadyDrain(){
    if (drainTimer) return;
    drainTimer = setInterval(function(){
      drainTries++;
      if (!on()){ return; }
      if (fix697Ready() && preReadyDirty){
        preReadyDirty = false;
        stats.preReadyDrained++;
        try { clearInterval(drainTimer); } catch(e){}
        drainTimer = null;
        doFlush();                                  /* ★1 回だけ引き渡す */
        return;
      }
      if (drainTries > 240){ try { clearInterval(drainTimer); } catch(e){} drainTimer = null; }
    }, 500);
  }

  var pushTimer = null, firstDirtyTs = 0;
  function markDirty(why){
    if (!on()) return;                              /* ★GATE1 */
    var now = Date.now();
    if (!firstDirtyTs) firstDirtyTs = now;
    if (pushTimer) clearTimeout(pushTimer);
    var wait = (now - firstDirtyTs >= MAXWAIT_MS) ? 0 : DEBOUNCE_MS;
    pushTimer = setTimeout(function(){
      pushTimer = null; firstDirtyTs = 0;
      /* ★GATE3: fix698 は fix697 より先にロードされる（script 2 番目 vs 9 番目）。
         fix697 API がまだ無い間の CURRENT DOCUMENT mutation を **捨てない**。
         非永続メモリ（preReadyDirty）に保持し、ready 後に 1 回だけ引き渡す。
         永続キーは追加しない。 */
      if (!fix697Ready()){ preReadyDirty = true; armPreReadyDrain(); return; }
      doFlush();
    }, wait);
  }

  function onMutation(key, oldV, newV){
    if (!on()) return;                              /* ★GATE1 */
    stats.busEvents++;
    var r = null;
    try { r = resolve(key); } catch(e){ r = null; }
    if (!r){ stats.notCanonical++; return; }
    var changed = false;
    try { changed = canonicalChanged(r, key, oldV, newV); } catch(e){ changed = false; }
    if (!changed){ stats.noChange++; note({ k: key, part: r.part, sid: r.storyId, v: 'NO_CHANGE' }); return; }
    var docId = documentStoryId();
    if (docId && r.storyId === docId){
      stats.docDirty++;
      note({ k: key, part: r.part, sid: r.storyId, v: 'DOCUMENT_CANONICAL_DIRTY' });
      markDirty('bus:' + r.part);
    } else {
      /* ★他 story の代理 commit は絶対にしない（fix694 は document ごとに 1 story） */
      stats.outOfDoc++; stats.pendingSet++;
      pendingSet(r.storyId, 'out-of-document');
      note({ k: key, part: r.part, sid: r.storyId, v: 'OUT_OF_DOCUMENT_CANONICAL_DIRTY' });
    }
  }

  // =====================================================================
  // layer1: storage 境界（fix654 の instance chain 最内側）
  // =====================================================================
  function isWatched(k){
    var s = String(k == null ? '' : k);
    return s === 'chr6' || s.indexOf('chr6_slot_') === 0
        || s === 'v292aiInstr' || s.indexOf('v292aiInstr_slot_') === 0
        || s.indexOf('genderMap_') === 0;
  }
  var installed = false, installMode = 'none', prevSet = null;
  (function installLayer1(){
    try {
      var wrapped = function(k, v){
        var watch = false, oldV = null;
        if (on()){                                  /* ★GATE1: OFF 時は観測もしない */
          try { watch = isWatched(k); } catch(e){ watch = false; }
          if (watch){ try { oldV = lsg(k); } catch(e){ oldV = null; } }
        }
        var r = prevSet.apply(this, arguments);   /* ★throw ならここで抜ける = 通知 0 */
        if (watch){ try { onMutation(String(k), oldV, (v == null ? null : String(v))); } catch(e){} }
        return r;
      };
      var W = window.__v292Dfix654;
      if (W && typeof W.wrap === 'function'){
        var p = W.wrap('setItem', wrapped, localStorage);
        if (typeof p === 'function'){ prevSet = p; installed = true; installMode = 'fix654.wrap'; }
      }
      if (!installed){
        prevSet = localStorage.setItem;                       /* fallback（fix654 未設置時） */
        if (typeof prevSet === 'function'){
          localStorage.setItem = wrapped; installed = true; installMode = 'instance-assign';
        }
      }
      if (installed){ try { console.log(TAG, 'layer1 installed via ' + installMode); } catch(e){} }
    } catch(e){ try { console.warn(TAG, 'layer1 install failed', e && e.message); } catch(_){} }
  })();

  // =====================================================================
  // aiInstr 補償（fix297 は Storage.prototype を直接捕獲するため layer1 を迂回する）
  // =====================================================================
  var lastAi = null, aiInit = false;
  function aiKey(){ var id = documentStoryId(); if (!id) return null; return (id === 'default') ? 'v292aiInstr' : ('v292aiInstr_slot_' + id); }
  function aiCheck(why){
    if (!on()) return;                              /* ★GATE1: OFF 時は poll action 0 */
    var k = aiKey(); if (!k) return;
    var cur = lsg(k);
    var fp = (cur == null) ? 'null' : (cur.length + ':' + h10(cur));
    if (!aiInit){ aiInit = true; lastAi = fp; return; }
    if (fp !== lastAi){
      lastAi = fp;
      stats.docDirty++;
      note({ k: k, part: 'aiInstr', sid: documentStoryId(), v: 'AIINSTR_' + why });
      markDirty('aiInstr:' + why);
    }
  }
  try { aiCheck('init'); } catch(e){}
  try { setInterval(function(){ aiCheck('poll'); }, AIINSTR_POLL_MS); } catch(e){}
  /* ★unload 直前の同期 final check（network 成功は correctness 条件にしない） */
  try {
    window.addEventListener('visibilitychange', function(){
      try { if (document.visibilityState === 'hidden') aiCheck('hidden'); } catch(e){}
    }, false);
    window.addEventListener('pagehide', function(){ try { aiCheck('pagehide'); } catch(e){} }, false);
  } catch(e){}

  // =====================================================================
  // 起動時: 自 document の pending 状態を評価（記録のみ。canonical read は HOLD）
  // =====================================================================
  var bootGate = null;
  try { bootGate = on() ? applyGate(null) : null; } catch(e){ bootGate = null; }
  if (bootGate && bootGate.block){ try { console.warn(TAG, 'pending present -> canonical auto-apply BLOCK:', bootGate.reason); } catch(e){} }

  window.__v292Dfix698 = {
    __armed: true, off: off, on: on,
    status: function(){
      return { installed: installed, mode: installMode, on: on(), off: off(),
        documentStoryId: documentStoryId(), authorityKey: authorityKey(),
        bootGate: bootGate, pending: pendingMap(),
        fix697Ready: fix697Ready(), preReadyDirty: preReadyDirty,
        stats: JSON.parse(JSON.stringify(stats)) };
    },
    bus: function(){ return BUS.slice(); },
    pending: pendingMap,
    applyGate: applyGate,
    resolve: resolve,
    storyLocalHash: storyLocalHash,
    canonicalChanged: canonicalChanged,
    verifyPending: verifyPending,
    __onMutation: onMutation,          /* contract 試験用（production では layer1 のみが呼ぶ） */
    __preReadyDirty: function(){ return preReadyDirty; },
    __fix697Ready: fix697Ready,
    __pendingSet: pendingSet, __pendingClear: pendingClear
  };
  try { console.log(TAG, 'loaded (mutation bus / shadow only / canonical read HOLD)'); } catch(e){}
})();
