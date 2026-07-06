// =====================================================================
// Chronicle TRPG - v292Dfix399: クロスデバイス・セーブ同期
//   Phase A(手動ボタン) + Phase B(自動: 起動プル + 保存デバウンスpush + 楽観ロック)
// ---------------------------------------------------------------------
// 前提: Worker v11 以上（/save が本文/画像を分割保存。GETで合成して返す）。
//   ・自動アップ = S.save に相乗り。通常は「本文(ls, 約65KB)」だけをデバウンス送信。
//     画像はキー集合が変わった時だけ full 送信（モバイル通信を軽く）。
//   ・起動プル = 起動時、クラウドが自分の基準(baseTs)より新しく、かつ手元に未同期の
//     変更が無ければ自動で取り込み。両方進んでいたら盲目上書きせず選ばせる(楽観ロック)。
//   ・取り込み前は必ずローカルをバックアップ(chr6_bk_cloudsync_*)。
// 認証: 既存プロキシと同じ x-google-id / x-chronicle-pass(fix247)。ログイン必須。
// スイッチ: 全体OFF=v292Dfix399Off / 自動だけOFF=v292Dfix399AutoOff。手動ボタンは常時。
// 同期状態(端末ローカル・同期対象外): v292Dfix399_baseTs / _localTs / _imgHash
// 検証: window.__v292Dfix399x = { collectLight, push, pull, bootPull, status, syncState }
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix399) return; window.__v292Dfix399 = true;
  var TAG = '[v292Dfix399:cloudsync]';
  var IDB_DB = 'chr6av', IDB_STORE = 'imgs';
  var SCHEMA = 1;
  var DEBOUNCE_MS = 15000;   // 保存後この時間まとめて1回だけ送る(KVの1書込/秒/キー制約に余裕)
  var workerVer = 0;         // Workerのv。v11未満は分割保存が無い→常にfull送信(v10互換・画像喪失防止)
  function detectWorkerVer(){ try { fetch(proxyUrl() + '/', { method: 'GET' }).then(function(r){ return r.json(); }).then(function(j){ workerVer = +(j && j.v) || 0; }).catch(function(){}); } catch(e){} }

  function off(){ try { return localStorage.getItem('v292Dfix399Off') === '1'; } catch(e){ return false; } }
  function autoOff(){ try { return localStorage.getItem('v292Dfix399AutoOff') === '1'; } catch(e){ return false; } }
  function proxyUrl(){
    try {
      var u = (localStorage.getItem('v292ProxyUrl') || '').trim();
      if (u) return u.replace(/\/+$/, '');
      if (window.__v292Dfix247bapi && window.__v292Dfix247bapi.DEFAULT_PROXY_URL) return window.__v292Dfix247bapi.DEFAULT_PROXY_URL;
    } catch(e){}
    return 'https://novel-proxy.sansan2103.workers.dev';
  }
  function authHeaders(){
    var h = { 'Content-Type': 'application/json' };
    try { var g = (window.__chronicleGoogleId && window.__chronicleGoogleId()) || ''; if (g) h['x-google-id'] = g; } catch(e){}
    try { var p = (localStorage.getItem('v292ProxyPass') || '').trim(); if (p) h['x-chronicle-pass'] = p; } catch(e){}
    return h;
  }
  function isLoggedIn(){ var h = authHeaders(); return !!(h['x-google-id'] || h['x-chronicle-pass']); }
  function activeSlot(){ try { return JSON.parse(localStorage.getItem('chr6_active_slot') || '"chr6"'); } catch(e){ return 'chr6'; } }
  function hasLocalGame(){   // このスロットに実際の進行(turns)があるか(データ保護判定)
    try {
      var slot = activeSlot();
      var raw = localStorage.getItem(slot === 'chr6' ? 'chr6' : ('chr6_slot_' + slot));
      if (!raw) return false;
      var d = JSON.parse(raw);
      return !!(d && Array.isArray(d.turns) && d.turns.length > 0);
    } catch(e){ return false; }
  }

  // ---- 同期状態(端末ローカル) ----
  function getNum(k){ try { return +(localStorage.getItem(k) || 0) || 0; } catch(e){ return 0; } }
  function setNum(k,v){ try { localStorage.setItem(k, String(v)); } catch(e){} }
  function baseTs(){ return getNum('v292Dfix399_baseTs'); }
  function localTs(){ return getNum('v292Dfix399_localTs'); }
  function imgHashStored(){ try { return localStorage.getItem('v292Dfix399_imgHash') || ''; } catch(e){ return ''; } }
  function hash(s){ var h=0; s=String(s||''); for(var i=0;i<s.length;i++){ h=((h<<5)-h+s.charCodeAt(i))|0; } return String(h>>>0); }

  // ---- localStorage収集(このスロット + グローバル) ----
  function isGlobalKey(k){
    return /^v292avrec_/.test(k) || /^v292appr_/.test(k)
        || k === 'chr6_slots_meta' || k === 'chr6_active_slot' || k === 'chr6_epoch'
        || /genderMap_"?default"?$/.test(k);
  }
  function collectLS(slotId){
    var out = {};
    for (var i = 0; i < localStorage.length; i++){
      var k = localStorage.key(i);
      if (!k) continue;
      if (/^__gen_/.test(k)) continue;
      if (/^chr6_bk_/.test(k)) continue;
      if (/^v292Dfix399_/.test(k)) continue;     // 同期状態は運ばない
      var isSlot = slotId && slotId !== 'chr6' && k.indexOf(slotId) >= 0;
      if (slotId === 'chr6' && (k === 'chr6' || /_slot_chr6$|genderMap_"?chr6"?$/.test(k))) isSlot = true;
      if (isSlot || isGlobalKey(k)) out[k] = localStorage.getItem(k);
    }
    return out;
  }

  // ---- IndexedDB ----
  function idbOpen(){
    return new Promise(function(res, rej){
      try {
        var r = indexedDB.open(IDB_DB, 1);
        r.onupgradeneeded = function(e){ try { if (!e.target.result.objectStoreNames.contains(IDB_STORE)) e.target.result.createObjectStore(IDB_STORE); } catch(_){} };
        r.onsuccess = function(e){ res(e.target.result); };
        r.onerror = function(){ rej(r.error); };
      } catch(e){ rej(e); }
    });
  }
  function idbReadKeys(){   // 画像のキーだけ(軽い) → ハッシュ用
    return idbOpen().then(function(db){
      return new Promise(function(res){
        var keys = [];
        try {
          var cur = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).openKeyCursor();
          cur.onsuccess = function(e){ var c = e.target.result; if (c){ keys.push(c.key); c.continue(); } else { db.close(); res(keys); } };
          cur.onerror = function(){ db.close(); res(keys); };
        } catch(e){ try { db.close(); } catch(_){}; res(keys); }
      });
    }).catch(function(){ return []; });
  }
  function idbReadAll(){
    return idbOpen().then(function(db){
      return new Promise(function(res){
        var out = {};
        try {
          var cur = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).openCursor();
          cur.onsuccess = function(e){ var c = e.target.result; if (c){ out[c.key] = c.value; c.continue(); } else { db.close(); res(out); } };
          cur.onerror = function(){ db.close(); res(out); };
        } catch(e){ try { db.close(); } catch(_){}; res(out); }
      });
    }).catch(function(){ return {}; });
  }
  function idbWriteAll(map){
    if (!map || !Object.keys(map).length) return Promise.resolve(0);
    return idbOpen().then(function(db){
      return new Promise(function(res){
        try {
          var tx = db.transaction(IDB_STORE, 'readwrite'); var st = tx.objectStore(IDB_STORE); var n = 0;
          Object.keys(map).forEach(function(k){ try { st.put(map[k], k); n++; } catch(_){} });
          tx.oncomplete = function(){ db.close(); res(n); };
          tx.onerror = function(){ db.close(); res(n); };
        } catch(e){ try { db.close(); } catch(_){}; res(0); }
      });
    }).catch(function(){ return 0; });
  }

  // ---- サーバー通信 ----
  function callSave(bodyObj){
    return fetch(proxyUrl() + '/save', { method: 'POST', headers: authHeaders(), body: JSON.stringify(bodyObj) })
      .then(function(r){ return r.json().then(function(j){ return { status: r.status, json: j }; }); });
  }
  function getMeta(){ return callSave({ op: 'meta' }).then(function(r){ return (r.json && r.json.meta) || null; }).catch(function(){ return null; }); }

  // ---- 収集(light/full) ----
  function collectLight(ts){
    var slot = activeSlot();
    return { schema: SCHEMA, updatedAt: ts || Date.now(), device: (navigator.userAgent||'').slice(0,60), activeSlot: slot, ls: collectLS(slot) };
  }
  function collectFull(ts){
    var pkg = collectLight(ts);
    return idbReadAll().then(function(imgs){ pkg.idb = imgs; return pkg; });
  }

  // ---- スロット整合ヘルパー(データ保護) ----
  function activeSlotTurns(){
    try { var slot = activeSlot(); var raw = localStorage.getItem(slot === 'chr6' ? 'chr6' : ('chr6_slot_' + slot)); if (!raw) return 0; var d = JSON.parse(raw); return (d && Array.isArray(d.turns)) ? d.turns.length : 0; } catch(e){ return 0; }
  }
  // ★根本修復: ターンがあるのに登録簿(chr6_slots_meta)に無いアクティブスロットを登録する。
  //   これが無いと fix30 の activeSlot()=findSlot()||meta[0] が default に化けてスロットが崩れる(今回のデータ消失の芯)。
  function healSlotMeta(){
    try {
      var slot = activeSlot();
      if (!slot || slot === 'default' || slot === 'chr6') return;
      var raw = localStorage.getItem('chr6_slot_' + slot); if (!raw) return;
      var d; try { d = JSON.parse(raw); } catch(e){ return; }
      if (!(d && Array.isArray(d.turns) && d.turns.length > 0)) return;      // 中身がある時だけ
      var meta; try { meta = JSON.parse(localStorage.getItem('chr6_slots_meta') || '[]'); } catch(e){ meta = []; }
      if (!Array.isArray(meta)) meta = [];
      if (meta.some(function(s){ return s && s.id === slot; })) return;      // 既に登録済み
      meta.push({ id: slot, name: 'マイ物語', key: 'chr6_slot_' + slot, updatedAt: new Date().toISOString() });
      localStorage.setItem('chr6_slots_meta', JSON.stringify(meta));
      try { console.log(TAG, 'healed slots_meta: registered', slot); } catch(e){}
    } catch(e){}
  }

  // ---- push(自動/手動共通) ----
  //   force=true: 必ずfull送信(手動ボタン用)。それ以外はキー集合が変わった時だけfull。
  var pushing = false;
  function push(force){
    if (!isLoggedIn()) return Promise.reject(new Error('ログインが必要です'));
    if (pushing) return Promise.reject(new Error('同期中'));
    pushing = true;
    var ts = Date.now();
    return getMeta().then(function(meta){
      var serverTs = meta ? (+meta.updatedAt || 0) : 0;
      // 楽観ロック: 別端末が基準より先に進んでいたら盲目上書きしない
      if (serverTs > baseTs() && !force){
        var e = new Error('CONFLICT'); e.conflict = true; e.serverTs = serverTs; e.device = meta && meta.device; throw e;
      }
      // ★空ガード: ローカルが0ターンなのにクラウドに本物のセーブがある→潰さない(空でクラウドを上書きしない)
      if (activeSlotTurns() === 0 && meta && (+meta.lsSize || +meta.size || 0) > 3000){
        var eg = new Error('EMPTY_LOCAL_GUARD'); eg.emptyGuard = true; throw eg;
      }
      return idbReadKeys();
    }).then(function(imgKeys){
      var curHash = hash(imgKeys.slice().sort().join('|'));
      var needFull = force || (curHash !== imgHashStored()) || (workerVer < 11); // v11未満/未検出は安全側でfull
      var build = needFull ? collectFull(ts) : Promise.resolve(collectLight(ts));
      return build.then(function(pkg){ return { pkg: pkg, needFull: needFull, curHash: curHash }; });
    }).then(function(o){
      return callSave({ op: 'put', pkg: o.pkg }).then(function(r){
        if (r.status !== 200 || !r.json || !r.json.ok) throw new Error((r.json && r.json.error) || ('HTTP ' + r.status));
        setNum('v292Dfix399_baseTs', ts); setNum('v292Dfix399_localTs', ts);
        if (o.needFull) { try { localStorage.setItem('v292Dfix399_imgHash', o.curHash); } catch(e){} }
        return { lsSize: r.json.lsSize, imgUpdated: r.json.imgUpdated };
      });
    }).then(function(res){ pushing = false; return res; }, function(err){ pushing = false; throw err; });
  }

  // ---- pull(取得のみ・適用は別) ----
  function pullData(){
    if (!isLoggedIn()) return Promise.reject(new Error('ログインが必要です'));
    return callSave({ op: 'get' }).then(function(r){
      if (r.status !== 200 || !r.json || !r.json.ok) throw new Error((r.json && r.json.error) || ('HTTP ' + r.status));
      return r.json.data;
    });
  }

  // ---- 復元(取り込み) ----
  function backupBeforeApply(pkg){
    try {
      var snap = {};
      Object.keys(pkg.ls || {}).forEach(function(k){ var v = localStorage.getItem(k); if (v != null) snap[k] = v; });
      localStorage.setItem('chr6_bk_cloudsync_' + Date.now(), JSON.stringify({ activeSlot: activeSlot(), ls: snap }));
    } catch(e){}
  }
  function applySave(pkg){
    if (!pkg || pkg.schema !== SCHEMA) return Promise.reject(new Error('セーブ形式が不明です'));
    backupBeforeApply(pkg);
    try { Object.keys(pkg.ls || {}).forEach(function(k){ localStorage.setItem(k, pkg.ls[k]); }); } catch(e){ return Promise.reject(e); }
    return idbWriteAll(pkg.idb || {}).then(function(){
      try { if (pkg.activeSlot) localStorage.setItem('chr6_active_slot', JSON.stringify(pkg.activeSlot)); } catch(e){}
      // 取り込んだ版を基準にする(ループ防止)
      var ts = +pkg.updatedAt || Date.now();
      setNum('v292Dfix399_baseTs', ts); setNum('v292Dfix399_localTs', ts);
      idbReadKeys().then(function(keys){ try { localStorage.setItem('v292Dfix399_imgHash', hash(keys.slice().sort().join('|'))); } catch(e){} });
      return true;
    });
  }

  function toast(msg, isErr){ try { if (window.UI && UI.setStatus) UI.setStatus(msg); } catch(e){} try { console.log(TAG, msg); } catch(e){} if (isErr){ try { alert(msg); } catch(e){} } }

  // ---- 起動プル(自動) ----
  var bootPullDone = false;
  function bootPull(){
    if (off() || autoOff() || bootPullDone || !isLoggedIn()) return;
    bootPullDone = true;
    getMeta().then(function(meta){
      var serverTs = meta ? (+meta.updatedAt || 0) : 0;
      if (!serverTs) return;                       // クラウド空
      if (serverTs <= baseTs()) return;            // 既に持っている
      // ★おしん選択: 取り込みは必ず確認(黙って上書きしない)。クラウドが新しい時だけ聞く。
      var dev = (meta && meta.device) ? ('（' + String(meta.device).slice(0, 20) + '）') : '';
      if (confirm('☁️ クラウド' + dev + 'に新しいセーブがあります。\nこの端末に取り込みますか？\n\n「OK」= 取り込む（今のこの端末の内容は上書き・自動バックアップあり）\n「キャンセル」= この端末を保持')){
        pullData().then(function(pkg){ if (!pkg) return; return applySave(pkg).then(function(){ toast('☁️ 取り込みました。再読み込みします…'); setTimeout(function(){ location.reload(); }, 900); }); }).catch(function(e){ toast('取り込み失敗: '+(e&&e.message), true); });
      } else {
        setNum('v292Dfix399_baseTs', serverTs);   // この端末優先 → 次のpushでクラウドへ反映
        toast('この端末を保持します。');
      }
    });
  }

  // ---- S.save に相乗り(自動push・デバウンス) ----
  var pushTimer = null;
  function scheduleAutoPush(){
    if (off() || autoOff() || !isLoggedIn()) return;
    setNum('v292Dfix399_localTs', Date.now());     // ローカル変更あり
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(function(){
      push(false).then(function(r){ try { console.log(TAG,'auto-pushed', r); } catch(e){} })
        .catch(function(e){ if (e && e.conflict){ toast('⚠️ 別端末で更新あり。自動アップを保留しました（設定から手動同期）。'); } else { console.warn(TAG,'auto-push',e); } });
    }, DEBOUNCE_MS);
  }
  function wrapSave(){
    try {
      var S = window.S || (function(){ try { return (0,eval)('S'); } catch(e){ return null; } })();
      if (!S || typeof S.save !== 'function' || S.__f399wrapped) return !!(S && S.__f399wrapped);
      var os = S.save.bind(S);
      S.save = function(){ var r = os.apply(this, arguments); try { scheduleAutoPush(); } catch(e){} return r; };
      S.__f399wrapped = true;
      try { console.log(TAG, 'S.save wrapped (auto-push on)'); } catch(e){}
      return true;
    } catch(e){ return false; }
  }
  (function wpoll(){ wpoll._n=(wpoll._n||0)+1; if (wrapSave()) return; if (wpoll._n>120) return; setTimeout(wpoll, 500); })();

  // ---- 手動同期ボタンの共通生成(置き場所=📁セーブ管理パネル) ----
  function mkSyncBtn(txt, fn){ var b=document.createElement('button'); b.textContent=txt; b.style.cssText='margin-right:6px;margin-bottom:4px;padding:6px 12px;font-size:13px;border-radius:6px;border:1px solid #4a7;background:#274;color:#dfe;cursor:pointer;'; b.onclick=function(){ fn(b); }; return b; }
  function onUp(b){ b.disabled=true; toast('アップロード中…'); push(true).then(function(){ toast('☁️ 保存しました'); }).catch(function(e){ if(e&&e.emptyGuard){ toast('この端末は空なのでアップしません（クラウドの本物を守ります）。', true); } else { toast('失敗: '+(e&&e.message), true); } }).then(function(){ b.disabled=false; }); }
  function onDown(b){ if(!confirm('クラウドのセーブを取り込みます。今の端末は上書きされます（自動バックアップあり）。よろしいですか？')) return; b.disabled=true; toast('取り込み中…'); pullData().then(function(pkg){ if(!pkg) throw new Error('クラウドにセーブがありません'); return applySave(pkg); }).then(function(){ toast('⬇️ 取り込みました。再読み込みします…'); setTimeout(function(){ location.reload(); }, 800); }).catch(function(e){ toast('失敗: '+(e&&e.message), true); b.disabled=false; }); }
  // 旧: キャラ欄に置いていた同期ボタンを撤去(セーブ管理パネルへ移動したため)
  function cleanupOldWrap(){ try { var old = document.querySelector('.v292Dfix399-wrap'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch(e){} }
  setInterval(cleanupOldWrap, 2000);

  // ---- 📁セーブ管理パネルに自動同期の説明を出す(おしん要望: セーブのところに簡単な説明) ----
  function injectSaveHelp(){
    if (off()) return;
    try {
      var closeX = document.getElementById('v30-close-x');
      if (!closeX) return;                             // セーブ管理パネルが開いていない
      var h2 = closeX.closest ? closeX.closest('h2') : (closeX.parentNode && closeX.parentNode.tagName === 'H2' ? closeX.parentNode : null);
      if (!h2 || !h2.parentNode) return;
      if (h2.parentNode.querySelector('.v292Dfix399-savehelp')) return; // 冪等
      var box = document.createElement('div');
      box.className = 'v292Dfix399-savehelp';
      box.style.cssText = 'margin:8px 0; padding:10px; border:1px solid #3a5a5a; border-radius:8px; background:rgba(60,120,120,.10); font-size:12px; line-height:1.6; color:#bde;';
      box.innerHTML = '☁️ <b>端末間で自動同期しています</b><br>'
        + '同じログイン（合言葉 または 同じGoogleアカウント）にすれば、<b>開いた時に最新を自動で取り込み</b>／<b>遊ぶと自動でクラウド保存</b>されます（PC⇔iPhone）。ふだんはボタン操作は不要です。<br>'
        + '下のボタンで「今すぐ」手動同期もできます。'
        + (isLoggedIn() ? '' : '<br>※ 同期にはログイン（合言葉／Google）が必要です。');
      h2.insertAdjacentElement('afterend', box);
      // 手動ボタンも同じセーブ管理パネルに置く(おしん要望: キャラ欄→セーブのところへ移動)
      var btnRow = document.createElement('div');
      btnRow.className = 'v292Dfix399-savebtns';
      btnRow.style.cssText = 'margin:4px 0 8px;';
      btnRow.appendChild(mkSyncBtn('☁️ いま上げる', onUp));
      btnRow.appendChild(mkSyncBtn('⬇️ いま取り込む', onDown));
      box.insertAdjacentElement('afterend', btnRow);
    } catch(e){}
  }
  setInterval(injectSaveHelp, 800);

  // ★fix399f: 起動時に登録簿を修復(データ消失の芯を根治) + 事故時の安全OFFを一度だけ解除(安全ガード実装済みのため自動を復活)
  function healAndMigrate(){
    try { healSlotMeta(); } catch(e){}
    try {
      if (localStorage.getItem('v292Dfix399f_migrated') !== '1'){
        localStorage.removeItem('v292Dfix399Off');
        localStorage.removeItem('v292Dfix399AutoOff');
        localStorage.setItem('v292Dfix399f_migrated', '1');
        try { console.log(TAG, 'fix399f: 安全ガード実装済み → 自動同期を復活'); } catch(_){}
      }
    } catch(e){}
  }
  setTimeout(healAndMigrate, 700); setTimeout(healAndMigrate, 2200);

  // Workerバージョン検出(v11未満なら常にfull送信) + 起動プル(ログイン確定を少し待つ)
  detectWorkerVer();
  setTimeout(bootPull, 3000); setTimeout(bootPull, 6500);

  window.__v292Dfix399x = {
    collectLight: collectLight, push: push, pull: pullData, applySave: applySave, bootPull: function(){ bootPullDone=false; bootPull(); },
    syncState: function(){ return { baseTs: baseTs(), localTs: localTs(), imgHash: imgHashStored() }; },
    status: function(){ return { off: off(), autoOff: autoOff(), loggedIn: isLoggedIn(), proxy: proxyUrl(), activeSlot: activeSlot() }; }
  };
  try { console.log(TAG, 'loaded', off()?'OFF':(autoOff()?'manual-only':'AUTO'), '(login='+isLoggedIn()+')'); } catch(e){}
})();
