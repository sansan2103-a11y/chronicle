// =====================================================================
// Chronicle TRPG - v292Dfix402: 不可視の双方向セーブ同期(操作不要・confirm廃止)
// ---------------------------------------------------------------------
// 背景(2026-07-08 Deep Research#3 / 引き継ぎ「双方向同期の堅牢化設計」):
//   ・fix399のbootPull confirm()はiPhoneフリーズの一因 → 確認ダイアログを出さず静かに同期。
//   ・KV書込1000/日で毎ターンpushは破綻 → デバウンス+差分ハッシュno-op skipで書込を削減。
//     (保存本体はWorker v14でD1(書込10万行/日・強整合)へ移行済み)
//   ・衝突は rev/baseRev の楽観ロック: 早送りは自動、真の分岐(fork)だけ非モーダルの1文選択UI。
//     負けた側もサーバーにforkとして保持(絶対に黙って消さない)。
//   ・iOSの同期トリガ: visibilitychange(hidden)+pagehideでflush / load+pageshow+visibleでpull。
//     beforeunload/unload/sendBeacon(64KiB上限)は使わない。
//   ・アイコン: この端末で生成/再生成された画像(v292av2_*への書込)を検知し、その1枚だけを
//     op:putimgで自動アップ → 全端末が同じサーバーURL(fix400)で同じ絵を見る。
// 前提: Worker v14(/save op:put{baseRev}/forceput/forks・認証名寄せ)。v13以下でも後方互換で動く
//   (fork検出が効かずLWWになるだけ・rev=0扱い)。
// スイッチ: 全体OFF = v292Dfix402Off='1' / 先行ON = v292Dfix402On='1'(DEFAULT_ONがfalseの間)。
//   有効時はfix399の自動系(bootPull confirm/自動push)を停止(v292Dfix399AutoOff='1'を維持)。
//   fix399の手動ボタン(☁️/⬇️)とバックアップ(chr6_bk_cloudsync_*)はそのまま生きる。
// 検証: window.__v292Dfix402 = { status, flush, pullCheck, state }
// ---------------------------------------------------------------------
// ★fix402c(2026-07-10): 全物語まるごと常時同期。
//   ・collectLS を「アクティブスロットのみ」→「chr6_slots_meta の全スロット+base(chr6)
//     +既存グローバル」に拡張(allSlotIds)。端末Aにしかない物語も端末Bに出る。
//   ・削除の伝播: 取り込んだ pkg の chr6_slots_meta を唯一の権威とし、metaに無いスロットの
//     ローカル本体(chr6_slot_<id>)を、chr6_bk_cloudsync_del_* に退避してから削除(復活防止)。
//     本体キーの有無ではなくメタ基準。metaが空/破損の pkg では絶対に削除しない(安全弁)。
//   ・Worker v14/D1/rev/fork/forceput/applySave(fix399)/isGlobalKey は一切変更しない。
//   ・OFFスイッチ: v292Dfix402cOff='1' で従来(アクティブのみ収集+削除伝播無効)へ即戻し。
//     既定ON。全体OFF(v292Dfix402Off)配下でもある。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix402) return; window.__v292Dfix402 = { __boot: true };
  var TAG = '[v292Dfix402:invisible-sync]';
  var SCHEMA = 1;
  var DEFAULT_ON = true;           // ★fix402b(2026-07-10): PC実機検証済→既定ON(全体OFF=v292Dfix402Off)
  var DEBOUNCE_MS = 12000;         // 保存後まとめ送りの待ち
  var MAXWAIT_MS  = 45000;         // 連続プレイ中でもこの間隔では必ず送る
  var IMG_DEBOUNCE_MS = 3500;

  function lsGet(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function lsSet(k,v){ try { localStorage.setItem(k, v); } catch(e){} }
  function on(){
    if (lsGet('v292Dfix402Off') === '1') return false;
    return DEFAULT_ON || lsGet('v292Dfix402On') === '1';
  }
  function proxyUrl(){
    try {
      var u = (lsGet('v292ProxyUrl') || '').trim();
      if (u) return u.replace(/\/+$/, '');
      if (window.__v292Dfix247bapi && window.__v292Dfix247bapi.DEFAULT_PROXY_URL) return window.__v292Dfix247bapi.DEFAULT_PROXY_URL;
    } catch(e){}
    return 'https://novel-proxy.sansan2103.workers.dev';
  }
  function authHeaders(){
    var h = { 'Content-Type': 'application/json' };
    try { var g = (window.__chronicleGoogleId && window.__chronicleGoogleId()) || ''; if (g) h['x-google-id'] = g; } catch(e){}
    try { var p = (lsGet('v292ProxyPass') || '').trim(); if (p) h['x-chronicle-pass'] = p; } catch(e){}
    return h;
  }
  function isLoggedIn(){ var h = authHeaders(); return !!(h['x-google-id'] || h['x-chronicle-pass']); }
  function callSave(bodyObj){
    return fetch(proxyUrl() + '/save', { method: 'POST', headers: authHeaders(), body: JSON.stringify(bodyObj) })
      .then(function(r){ return r.json().then(function(j){ return { status: r.status, json: j }; }); });
  }
  function hash(s){ var h=0; s=String(s||''); for(var i=0;i<s.length;i++){ h=((h<<5)-h+s.charCodeAt(i))|0; } return String(h>>>0); }
  function getNum(k){ return +(lsGet(k) || 0) || 0; }
  function setNum(k,v){ lsSet(k, String(v)); }
  function baseRev(){ return getNum('v292Dfix402_baseRev'); }
  function toast(msg){ try { if (window.UI && UI.setStatus) UI.setStatus(msg); } catch(e){} try { console.log(TAG, msg); } catch(e){} }

  // ---- 収集(fix399と同じ規約・軽量ls onlyのみ) ----
  function activeSlot(){ try { return JSON.parse(lsGet('chr6_active_slot') || '"chr6"'); } catch(e){ return 'chr6'; } }
  function activeSlotTurns(){
    try { var slot = activeSlot(); var raw = lsGet(slot === 'chr6' ? 'chr6' : ('chr6_slot_' + slot)); if (!raw) return 0; var d = JSON.parse(raw); return (d && Array.isArray(d.turns)) ? d.turns.length : 0; } catch(e){ return 0; }
  }
  function isGlobalKey(k){
    return /^v292avrec_/.test(k) || /^v292appr_/.test(k)
        || k === 'chr6_slots_meta' || k === 'chr6_active_slot' || k === 'chr6_epoch'
        || /genderMap_"?default"?$/.test(k);
  }
  // ★fix402c: 同期対象スロットの列挙(chr6_slots_meta 全件 + アクティブ保険 + base 'chr6')
  function allSlotIds(){
    var ids = [];
    try { var meta = JSON.parse(lsGet('chr6_slots_meta')||'[]')||[]; meta.forEach(function(s){ if(s&&s.id) ids.push(String(s.id)); }); } catch(e){}
    var act = activeSlot(); if (act && ids.indexOf(act)<0) ids.push(act);   // メタ未登録のアクティブも拾う(healSlotMeta前の保険)
    if (ids.indexOf('chr6')<0) ids.push('chr6');                            // base物語
    return ids;
  }
  // ★fix402c: slotId(単体) → slotIds(配列)。判定式は現行と同一のものをスロット毎に評価。
  function collectLS(slotIds){
    if (!Array.isArray(slotIds)) slotIds = (slotIds == null) ? [] : [slotIds];
    var out = {};
    for (var i = 0; i < localStorage.length; i++){
      var k = localStorage.key(i);
      if (!k) continue;
      if (/^__gen_/.test(k)) continue;
      if (/^chr6_bk_/.test(k)) continue;
      if (/^v292Dfix399_/.test(k)) continue;
      if (/^v292Dfix402_/.test(k)) continue;
      var isSlot = false;
      for (var j = 0; j < slotIds.length; j++){
        var slotId = slotIds[j];
        if (slotId && slotId !== 'chr6' && k.indexOf(slotId) >= 0) { isSlot = true; break; }
        if (slotId === 'chr6' && (k === 'chr6' || /_slot_chr6$|genderMap_"?chr6"?$/.test(k))) { isSlot = true; break; }
      }
      if (isSlot || isGlobalKey(k)) out[k] = localStorage.getItem(k);
    }
    return out;
  }
  function collectLight(ts){
    var slot = activeSlot();
    // ★fix402c: 既定は全スロット収集。OFF(402cOff)時のみ従来どおりアクティブのみ=完全互換。
    var slotIds = (lsGet('v292Dfix402cOff') === '1') ? [slot] : allSlotIds();
    return { schema: SCHEMA, updatedAt: ts || Date.now(), device: (navigator.userAgent||'').slice(0,60), activeSlot: slot, ls: collectLS(slotIds) };
  }

  // ---- fix399の自動系を停止(confirm bootPull/自動pushの二重走行防止) ----
  function muteFix399(){
    if (!on()) return;
    lsSet('v292Dfix399f_migrated', '1');   // fix399fの「一度だけAutoOff解除」を先回りで無効化
    lsSet('v292Dfix399AutoOff', '1');
  }

  // ---- push(デバウンス+maxWait+差分ハッシュ) ----
  var dirtySince = 0, pushTimer = null, pushing = false, retryTimer = null;
  function markDirty(){
    if (!on() || !isLoggedIn()) return;
    var now = Date.now();
    if (!dirtySince) dirtySince = now;
    setNum('v292Dfix402_dirtyTs', now);
    if (pushTimer) clearTimeout(pushTimer);
    var wait = DEBOUNCE_MS;
    if (now - dirtySince > MAXWAIT_MS) wait = 50;   // 長時間書きっぱなし→即flush
    pushTimer = setTimeout(function(){ flush('debounce'); }, wait);
  }
  function flush(why){
    if (!on() || !isLoggedIn() || pushing) return Promise.resolve('skip');
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    // 空ガード: 確立済みクラウド(baseRev>0)へ0ターンの空を被せない
    if (activeSlotTurns() === 0 && baseRev() > 0) { dirtySince = 0; return Promise.resolve('empty-guard'); }
    var pkg = collectLight(Date.now());
    var h = hash(JSON.stringify(pkg.ls));
    if (h === (lsGet('v292Dfix402_lastHash') || '')) {   // 変化なし=書かない(phantom write除去)
      dirtySince = 0; setNum('v292Dfix402_pushedTs', Date.now());
      return Promise.resolve('noop');
    }
    pushing = true;
    return callSave({ op: 'put', baseRev: baseRev(), pkg: pkg }).then(function(r){
      pushing = false;
      if (r.status === 200 && r.json && r.json.ok && r.json.fork) { forkBanner(r.json.server || {}); return 'fork'; }
      if (r.status !== 200 || !r.json || !r.json.ok) throw new Error((r.json && r.json.error) || ('HTTP ' + r.status));
      if (r.json.rev != null) setNum('v292Dfix402_baseRev', +r.json.rev || 0);
      lsSet('v292Dfix402_lastHash', h);
      dirtySince = 0; setNum('v292Dfix402_pushedTs', Date.now());
      try { console.log(TAG, 'pushed rev=' + (r.json.rev != null ? r.json.rev : '?') + ' (' + (why||'') + ')'); } catch(e){}
      return 'pushed';
    }).catch(function(e){
      pushing = false;
      try { console.warn(TAG, 'push failed (' + (why||'') + '):', e && e.message); } catch(_){}
      if (!retryTimer) retryTimer = setTimeout(function(){ retryTimer = null; if (dirtySince) flush('retry'); }, 30000);
      return 'error';
    });
  }
  function isDirty(){ return getNum('v292Dfix402_dirtyTs') > getNum('v292Dfix402_pushedTs'); }

  // ---- pull(静かに取り込み・confirm無し・上書き前は必ず自動バックアップ=applySave内蔵) ----
  var pulling = false, lastPullCheck = 0, applying = false;
  function applyPkg(pkg, rev){
    var api = window.__v292Dfix399x;
    var doApply = (api && api.applySave) ? api.applySave(pkg) : Promise.reject(new Error('fix399 applySave不在'));
    return doApply.then(function(){
      setNum('v292Dfix402_baseRev', +rev || 0);
      try { lsSet('v292Dfix402_lastHash', hash(JSON.stringify(pkg.ls || {}))); } catch(e){}
      var now = Date.now(); setNum('v292Dfix402_pushedTs', now); setNum('v292Dfix402_dirtyTs', 0); dirtySince = 0;
    });
  }
  function pullApplyReload(label){
    if (applying) return Promise.resolve();
    applying = true;
    return callSave({ op: 'get' }).then(function(r){
      if (r.status !== 200 || !r.json || !r.json.ok || !r.json.data) throw new Error((r.json && r.json.error) || ('HTTP ' + r.status));
      return applyPkg(r.json.data, r.json.rev).then(function(){
        // ★fix402c: メタが権威。取り込んだmetaに無いスロットのローカル本体を、退避してから削除(復活防止)
        try {
          if (lsGet('v292Dfix402cOff') !== '1') {
            var pkg = r.json.data || {};
            var inMeta = {}; (JSON.parse((pkg.ls && pkg.ls['chr6_slots_meta']) || '[]') || []).forEach(function(s){ if (s && s.id) inMeta[String(s.id)] = 1; });
            if (Object.keys(inMeta).length) {                       // メタが空のpkgでは絶対に削除しない(安全弁)
              var doomed = [];
              for (var di = 0; di < localStorage.length; di++){ var dk = localStorage.key(di);
                var dm = /^chr6_slot_(.+)$/.exec(dk || '');
                if (dm && !inMeta[dm[1]]) doomed.push(dk); }
              if (doomed.length) {
                var snap = {}; doomed.forEach(function(dk){ snap[dk] = localStorage.getItem(dk); });
                lsSet('chr6_bk_cloudsync_del_' + Date.now(), JSON.stringify({ ls: snap }));   // 必ず退避
                doomed.forEach(function(dk){ try { localStorage.removeItem(dk); } catch(e){} });
              }
            }
          }
        } catch(e){}
        toast('☁️ ' + (label || '別端末のつづき') + 'を取り込みました。再読み込みします…');
        setTimeout(function(){ try { location.reload(); } catch(e){} }, 700);
      });
    }).catch(function(e){ applying = false; try { console.warn(TAG, 'pull失敗:', e && e.message); } catch(_){} });
  }
  function pullCheck(why){
    if (!on() || !isLoggedIn() || pulling || applying) return;
    var now = Date.now(); if (now - lastPullCheck < 5000) return; lastPullCheck = now;
    pulling = true;
    callSave({ op: 'meta' }).then(function(r){
      pulling = false;
      if (r.status !== 200 || !r.json || !r.json.ok) return;
      var meta = r.json.meta; if (!meta) return;
      var srv = +r.json.rev || 0;
      var newer = (srv > 0) ? (srv > baseRev())
                            : ((+meta.updatedAt || 0) > getNum('v292Dfix399_baseTs'));  // 旧Worker/移行前はupdatedAt比較
      if (!newer) { if (isDirty()) flush('pullcheck-dirty'); return; }
      if (isDirty()) { flush('conflict-probe'); return; }   // 両方進んでいる→pushに任せてfork判定
      pullApplyReload('別端末のつづき');
    }).catch(function(){ pulling = false; });
  }

  // ---- 真の分岐(fork)だけ出す非モーダル選択UI(confirm不使用) ----
  var bannerEl = null;
  function forkBanner(server){
    if (bannerEl && bannerEl.parentNode) return;
    var dev = String((server && server.device) || '').slice(0, 22);
    var el = document.createElement('div');
    el.id = 'v292Dfix402-fork';
    el.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:99999;max-width:92vw;box-sizing:border-box;'
      + 'background:#1d2733;color:#dfe8f2;border:1px solid #4a7ad0;border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.6;box-shadow:0 4px 18px rgba(0,0,0,.45);';
    el.innerHTML = '☁️ <b>この端末と別端末' + (dev ? '(' + dev + ')' : '') + 'の両方に新しいつづきがあります。</b>どちらを続けますか？(選ばなかった方も自動バックアップに残ります)<br>';
    function mkBtn(txt, main){ var b=document.createElement('button'); b.textContent=txt; b.style.cssText='margin:6px 8px 0 0;padding:7px 12px;font-size:13px;border-radius:7px;cursor:pointer;border:1px solid '+(main?'#4a7ad0':'#666')+';background:'+(main?'#2a4a8a':'#333')+';color:#fff;'; return b; }
    var bLocal = mkBtn('この端末のつづき', true);
    var bCloud = mkBtn('別端末のつづき', false);
    var bX = mkBtn('あとで', false);
    bLocal.onclick = function(){
      el.textContent = '☁️ この端末のつづきで統一しています…';
      callSave({ op: 'forceput', pkg: collectLight(Date.now()) }).then(function(r){
        if (r.status === 200 && r.json && r.json.ok) {
          if (r.json.rev != null) setNum('v292Dfix402_baseRev', +r.json.rev || 0);
          setNum('v292Dfix402_pushedTs', Date.now()); dirtySince = 0;
          try { lsSet('v292Dfix402_lastHash', ''); } catch(e){}
          toast('☁️ この端末のつづきで統一しました(相手側はバックアップ保存)');
        } else { toast('☁️ 統一に失敗しました。あとで自動再試行します'); }
        rm();
      }).catch(function(){ toast('☁️ 統一に失敗しました。あとで自動再試行します'); rm(); });
    };
    bCloud.onclick = function(){ rm(); pullApplyReload('別端末のつづき'); };
    bX.onclick = function(){ rm(); };
    function rm(){ try { if (el.parentNode) el.parentNode.removeChild(el); } catch(e){} bannerEl = null; }
    el.appendChild(bLocal); el.appendChild(bCloud); el.appendChild(bX);
    (document.body || document.documentElement).appendChild(el);
    bannerEl = el;
  }

  // ---- S.saveに相乗り(自前wrap・fix399のAutoOff結合と独立) ----
  function wrapSave(){
    try {
      var S = window.S || (function(){ try { return (0,eval)('S'); } catch(e){ return null; } })();
      if (!S || typeof S.save !== 'function' || S.__f402wrapped) return !!(S && S.__f402wrapped);
      var os = S.save.bind(S);
      S.save = function(){ var r = os.apply(this, arguments); try { markDirty(); } catch(e){} return r; };
      S.__f402wrapped = true;
      try { console.log(TAG, 'S.save wrapped'); } catch(e){}
      return true;
    } catch(e){ return false; }
  }

  // ---- アイコン自動アップ: この端末で生成/再生成された画像1枚だけをputimg ----
  //   fix197(genOne)→persistSet→localStorage.setItem('v292av2_...', dataURL)→(fix346がIDBへ)。
  //   その呼び出しを最外殻で検知して、その1枚だけをサーバーへ(全端末のfix400表示が即揃う)。
  var imgQueue = {}, imgTimer = null;
  function scheduleImgPush(k){
    imgQueue[k] = Date.now();
    if (imgTimer) clearTimeout(imgTimer);
    imgTimer = setTimeout(sendImgs, IMG_DEBOUNCE_MS);
  }
  function sendImgs(){
    imgTimer = null;
    if (!on() || !isLoggedIn()) { imgQueue = {}; return; }
    var keys = Object.keys(imgQueue); imgQueue = {};
    (function next(){
      var k = keys.shift(); if (!k) return;
      var v = null; try { v = localStorage.getItem(k); } catch(e){}
      if (typeof v === 'string' && v.indexOf('data:image') === 0 && v.length < 2*1024*1024) {
        callSave({ op: 'putimg', k: k, data: v }).then(function(r){
          try { console.log(TAG, 'img pushed', k, r.status); } catch(e){}
          next();
        }).catch(function(){ next(); });
      } else next();
    })();
  }
  function wrapSetItem(){
    try {
      var prev = localStorage.setItem;
      if (prev.__f402) return;
      var wrapped = function(k, v){
        try { if (on() && typeof k === 'string' && k.indexOf('v292av2_') === 0 && typeof v === 'string' && v.indexOf('data:image') === 0) scheduleImgPush(k); } catch(e){}
        return prev.apply(localStorage, arguments);
      };
      wrapped.__f402 = true;
      localStorage.setItem = wrapped;
    } catch(e){}
  }

  // ---- トリガ配線(iOS向け: hidden/pagehideでflush・load/pageshow/visibleでpull) ----
  function boot(){
    muteFix399();
    wrapSetItem();
    (function wpoll(){ wpoll._n=(wpoll._n||0)+1; if (wrapSave()) return; if (wpoll._n>120) return; setTimeout(wpoll, 500); })();
    setTimeout(function(){ pullCheck('boot1'); }, 2500);
    setTimeout(function(){ pullCheck('boot2'); }, 6500);
    setInterval(muteFix399, 60000);
    try {
      document.addEventListener('visibilitychange', function(){
        if (document.visibilityState === 'hidden') { if (isDirty() || dirtySince) flush('hidden'); }
        else { pullCheck('visible'); }
      });
    } catch(e){}
    try { window.addEventListener('pagehide', function(){ if (isDirty() || dirtySince) flush('pagehide'); }); } catch(e){}
    try { window.addEventListener('pageshow', function(ev){ if (ev && ev.persisted) { lastPullCheck = 0; pullCheck('bfcache'); } }); } catch(e){}
    try { window.addEventListener('online', function(){ if (isDirty()) flush('online'); }); } catch(e){}
  }

  window.__v292Dfix402 = {
    __real: true,
    status: function(){ return { on: on(), defaultOn: DEFAULT_ON, loggedIn: isLoggedIn(), baseRev: baseRev(), dirty: isDirty(), proxy: proxyUrl() }; },
    state: function(){ return { baseRev: baseRev(), lastHash: (lsGet('v292Dfix402_lastHash')||'').slice(0,10), dirtyTs: getNum('v292Dfix402_dirtyTs'), pushedTs: getNum('v292Dfix402_pushedTs') }; },
    flush: flush, pullCheck: function(){ lastPullCheck = 0; pullCheck('manual'); }, forkBanner: forkBanner
  };

  if (on()) boot();
  try { console.log(TAG, 'loaded', on() ? 'ON' : 'OFF(default:' + (DEFAULT_ON?'on':'off') + ')', '(login=' + isLoggedIn() + ')'); } catch(e){}
})();
