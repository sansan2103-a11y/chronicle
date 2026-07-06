// =====================================================================
// Chronicle TRPG - v292Dfix399: クロスデバイス・セーブ同期（Phase A=手動）
// ---------------------------------------------------------------------
// 毎ターンの自動保存(S.save)に相乗り可能な土台。まずは手動ボタン方式で安全に。
//   ・「☁️クラウドに上げる」= 現在のセーブ(localStorageのスロット関連キー群 +
//       IndexedDB chr6av の全アイコン画像)を1パッケージにまとめ、Worker v10 の
//       POST /save {op:'put'} でKVへ保存。
//   ・「☁️取り込む」= GET相当(POST {op:'get'}) で取得 → 復元前に必ずバックアップ →
//       localStorageへ書き戻し + IndexedDBへ画像投入 → リロードで反映。
//   ・認証は既存のプロキシ経路と同じ x-google-id / x-chronicle-pass を送る(fix247)。
//   ・アイコンは再生成せず画像そのものを運ぶ=完全に同じ絵。
// 設計: 設計_クロスデバイス自動同期_2026-07-06.md
// 前提: Worker が v10 以上(/save 対応)。ログイン済み(Google or 合言葉)必須。
// OFF: localStorage v292Dfix399Off='1'。★Phase A は手動なので既定でボタン表示。
// 検証API: window.__v292Dfix399x = { collect, sizeOf, push, pull, status }
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix399) return; window.__v292Dfix399 = true;
  var TAG = '[v292Dfix399:cloudsync]';
  var IDB_DB = 'chr6av', IDB_STORE = 'imgs';
  var SCHEMA = 1;

  function off(){ try { return localStorage.getItem('v292Dfix399Off') === '1'; } catch(e){ return false; } }
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

  // ---- localStorage: このスロットに属するキー + グローバル(レシピ/承認/メタ) ----
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
      if (/^__gen_/.test(k)) continue;          // 一時状態は運ばない
      if (/^chr6_bk_/.test(k)) continue;         // バックアップは運ばない
      var isSlot = slotId && slotId !== 'chr6' && k.indexOf(slotId) >= 0;
      // 既定スロット(chr6)対策: 本体'chr6'と、slot_chr6付随キー
      if (slotId === 'chr6' && (k === 'chr6' || /_slot_chr6$|genderMap_"?chr6"?$/.test(k))) isSlot = true;
      if (isSlot || isGlobalKey(k)) out[k] = localStorage.getItem(k);
    }
    return out;
  }

  // ---- IndexedDB(chr6av/imgs): 全アイコン画像を読む/書く ----
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
    if (!map) return Promise.resolve(0);
    return idbOpen().then(function(db){
      return new Promise(function(res){
        try {
          var tx = db.transaction(IDB_STORE, 'readwrite');
          var st = tx.objectStore(IDB_STORE);
          var n = 0;
          Object.keys(map).forEach(function(k){ try { st.put(map[k], k); n++; } catch(_){} });
          tx.oncomplete = function(){ db.close(); res(n); };
          tx.onerror = function(){ db.close(); res(n); };
        } catch(e){ try { db.close(); } catch(_){}; res(0); }
      });
    }).catch(function(){ return 0; });
  }

  // ---- パッケージ作成 ----
  function collect(){
    var slot = activeSlot();
    return idbReadAll().then(function(imgs){
      return {
        schema: SCHEMA,
        updatedAt: Date.now(),
        device: (navigator.userAgent || '').slice(0, 60),
        activeSlot: slot,
        ls: collectLS(slot),
        idb: imgs
      };
    });
  }
  function sizeOf(pkg){ try { return JSON.stringify(pkg).length; } catch(e){ return -1; } }

  // ---- サーバー通信 ----
  function callSave(bodyObj){
    return fetch(proxyUrl() + '/save', { method: 'POST', headers: authHeaders(), body: JSON.stringify(bodyObj) })
      .then(function(r){ return r.json().then(function(j){ return { status: r.status, json: j }; }); });
  }
  function push(){
    if (!isLoggedIn()) return Promise.reject(new Error('ログインが必要です(Google または 合言葉)'));
    return collect().then(function(pkg){
      var sz = sizeOf(pkg);
      if (sz > 24 * 1024 * 1024) return Promise.reject(new Error('セーブが大きすぎます(' + Math.round(sz/1048576) + 'MB)'));
      return callSave({ op: 'put', pkg: pkg }).then(function(r){
        if (r.status !== 200 || !r.json || !r.json.ok) throw new Error((r.json && r.json.error) || ('HTTP ' + r.status));
        return { size: sz, serverSize: r.json.size };
      });
    });
  }
  function pull(){
    if (!isLoggedIn()) return Promise.reject(new Error('ログインが必要です(Google または 合言葉)'));
    return callSave({ op: 'get' }).then(function(r){
      if (r.status !== 200 || !r.json || !r.json.ok) throw new Error((r.json && r.json.error) || ('HTTP ' + r.status));
      if (!r.json.data) throw new Error('クラウドにセーブがありません');
      return r.json.data;
    });
  }

  // ---- 復元(取り込み) ----
  function backupBeforeApply(pkg){
    // 上書き対象のlocalStorageキーを1つのバックアップにまとめて退避
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
      return true;
    });
  }

  // ---- UI: 設定→キャラ欄の近くにボタン ----
  function toast(msg, isErr){
    try { if (window.UI && UI.setStatus) { UI.setStatus(msg); return; } } catch(e){}
    try { console.log(TAG, msg); } catch(e){}
    if (isErr) { try { alert(msg); } catch(e){} }
  }
  function injectButtons(){
    if (off()) return;
    try {
      if (document.querySelector('.v292Dfix399-wrap')) return;
      var host = document.getElementById('npcList');
      if (!host || !host.parentNode) return;
      var wrap = document.createElement('div');
      wrap.className = 'v292Dfix399-wrap';
      wrap.style.cssText = 'margin:4px 0 12px; padding:8px; border:1px solid #3a5a5a; border-radius:8px; background:rgba(60,120,120,.08);';
      var label = document.createElement('div');
      label.textContent = '☁️ 端末間セーブ同期' + (isLoggedIn() ? '' : '（ログインが必要）');
      label.style.cssText = 'font-size:12px; color:#9cc; margin-bottom:6px;';
      wrap.appendChild(label);
      function mkBtn(txt, fn){
        var b = document.createElement('button');
        b.textContent = txt;
        b.style.cssText = 'margin-right:6px; padding:6px 10px; font-size:13px; border-radius:6px; border:1px solid #4a7; background:#274; color:#dfe; cursor:pointer;';
        b.onclick = fn;
        return b;
      }
      var upBtn = mkBtn('☁️ クラウドに上げる', function(){
        upBtn.disabled = true; toast('アップロード中…');
        push().then(function(r){ toast('☁️ 保存しました（' + Math.round(r.size/1024) + 'KB）'); })
              .catch(function(e){ toast('アップロード失敗: ' + (e && e.message), true); })
              .then(function(){ upBtn.disabled = false; });
      });
      var dnBtn = mkBtn('⬇️ クラウドから取り込む', function(){
        if (!confirm('クラウドのセーブを取り込みます。\n今の端末の内容は上書きされます（直前バックアップは自動で残します）。\nよろしいですか？')) return;
        dnBtn.disabled = true; toast('取り込み中…');
        pull().then(function(pkg){ return applySave(pkg); })
              .then(function(){ toast('⬇️ 取り込みました。再読み込みします…'); setTimeout(function(){ location.reload(); }, 800); })
              .catch(function(e){ toast('取り込み失敗: ' + (e && e.message), true); dnBtn.disabled = false; });
      });
      wrap.appendChild(upBtn); wrap.appendChild(dnBtn);
      host.parentNode.insertBefore(wrap, host);
    } catch(e){ try { console.warn(TAG, e); } catch(_){} }
  }
  setTimeout(injectButtons, 1200); setTimeout(injectButtons, 3000); setInterval(injectButtons, 4000);

  window.__v292Dfix399x = {
    collect: collect, sizeOf: sizeOf, push: push, pull: pull, applySave: applySave,
    status: function(){ return { off: off(), loggedIn: isLoggedIn(), proxy: proxyUrl(), activeSlot: activeSlot() }; }
  };
  try { console.log(TAG, 'loaded', off() ? 'OFF' : 'ON', '(login=' + isLoggedIn() + ')'); } catch(e){}
})();
