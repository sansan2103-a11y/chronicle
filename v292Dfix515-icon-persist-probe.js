// =====================================================================
// Chronicle TRPG - v292Dfix515: アイコン「再生成→リロードで戻る」真因の観測プローブ
// ---------------------------------------------------------------------
// 目的(2026-07-20・おしん報告): 登録キャラ(ミア)の「↻ アイコン再生成」をしても
//   リロードで元に戻る。新旧2系統(新=fix197/fix400/IDB, 旧=features.js __aiAvatar)の
//   どちらで生成・保存され、リロード時にどこから読まれるかの【食い違い】を実機で確定する。
//
// ★完全に読み取り専用・非破壊: 既存関数はそのまま呼び通す(返り値/例外も素通し)。
//   生成もネットワーク送信もセーブ書き込みも一切行わない。挙動は変えない(fail-open)。
//   計測結果だけを localStorage['v292Dfix515log'](=slot dataではない設定領域)へ追記し、
//   リロードを跨いで残す。本文/prompt/個人情報は保存しない(名前・キー・長さ・種別・指紋のみ)。
//
// 観測点:
//   1. arm時: build / ミアのIDB画像の有無・長さ・指紋 / fix400 ns有無 を記録。
//   2. ↻クリック(capture・受動): カード名を記録(preventDefault/stopはしない)。
//   3. window.__aiAvatar.regen(旧経路)呼び出し: 呼ばれたら記録(呼び通す)。
//   4. __v292Dfix197.regenFor(新経路)呼び出し: 呼ばれたら記録(呼び通す)。
//   5. IDB avatar store(chr6av/imgs)への put: v292av2_ キーへの書込を key/長さ/指紋で記録
//      (IDBObjectStore.prototype.put を呼び通しでラップ)。→新画像がIDBに定着したか判る。
//   6. load後3.5s: ミアの表示<img>の src種別(server-img/data-idb/dice/other)と、
//      IDB nfz4wkn の現物指紋を記録。→リロード時にどの画像/経路が表示されているか判る。
//
// 有効化(opt-in・既定OFF): localStorage.v292Dfix515On==='1'。OFF=未設定 or 'v292Dfix515Off'='1'。
// ログ読出: localStorage['v292Dfix515log'](JSON配列・最大60件)。window.__v292Dfix515.log()。
// 撤去: script1行削除で完全消滅(新規1ファイル・純追加・既存不変)。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix515 && window.__v292Dfix515.__armed) return;
  var TAG = '[v292Dfix515:icon-probe]';
  var LOGKEY = 'v292Dfix515log';
  var MIA_KEY = 'v292av2_nfz4wkn';   // ミアのアバターキー(実測)。他キーも v292av2_ なら記録。

  function on(){
    try {
      if (localStorage.getItem('v292Dfix515Off') === '1') return false;
      return localStorage.getItem('v292Dfix515On') === '1';
    } catch(e){ return false; }
  }
  if (!on()) { try { console.log(TAG, 'idle (set v292Dfix515On=1 to arm)'); } catch(e){} return; }

  var t0 = Date.now();
  function now(){ return Date.now() - t0; }

  function fp(s){   // dataURLの安価な指紋(先頭/末尾/長さのdjb2)。中身は保存しない。
    try {
      if (typeof s !== 'string' || !s) return '';
      var src = s.length + '|' + s.slice(0, 80) + '|' + s.slice(-40);
      var h = 0; for (var i = 0; i < src.length; i++){ h = ((h << 5) - h + src.charCodeAt(i)) | 0; }
      return (h >>> 0).toString(36) + '_' + s.length;
    } catch(e){ return ''; }
  }

  function push(ev){
    try {
      ev.t = now();
      var arr = [];
      try { arr = JSON.parse(localStorage.getItem(LOGKEY) || '[]'); } catch(e){ arr = []; }
      if (!Array.isArray(arr)) arr = [];
      arr.push(ev);
      if (arr.length > 60) arr = arr.slice(-60);
      localStorage.setItem(LOGKEY, JSON.stringify(arr));
      try { console.log(TAG, JSON.stringify(ev)); } catch(e){}
    } catch(e){}
  }

  // ---------- 1. arm ----------
  function f400ns(){ try { return localStorage.getItem('v292Dfix400_ns') ? 'set' : 'none'; } catch(e){ return '?'; } }
  push({ ev: 'arm', build: (function(){ try { return document.querySelector('script[src*="?v="]') ? '' : ''; } catch(e){ return ''; } })(),
         page: (location.pathname + location.search).slice(0, 60), ns: f400ns() });

  // ---------- 5. IDB put ラッパ(chr6av/imgs への v292av2_ 書込を記録) ----------
  try {
    if (window.IDBObjectStore && IDBObjectStore.prototype && !IDBObjectStore.prototype.__f515wrap){
      var _put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(value, key){
        try {
          var storeName = '';
          try { storeName = this.name || ''; } catch(e){}
          var k = (key != null) ? String(key) : '';
          // in-line key の可能性: valueがstringでkey未指定のときは key を推定できないので storeだけ見る
          if (storeName === 'imgs' && (k.indexOf('v292av2_') === 0 || (!k && typeof value === 'string'))){
            push({ ev: 'idb-put', store: storeName, key: k || '(inline?)',
                   len: (typeof value === 'string') ? value.length : ('type:' + typeof value),
                   fp: (typeof value === 'string') ? fp(value) : '',
                   isMia: (k === MIA_KEY) });
          }
        } catch(e){}
        return _put.apply(this, arguments);
      };
      IDBObjectStore.prototype.__f515wrap = true;
    }
  } catch(e){}

  // ---------- 3/4. 旧__aiAvatar.regen / 新fix197.regenFor ラッパ ----------
  function wrapRegen(){
    try {
      var a = window.__aiAvatar;
      if (a && typeof a.regen === 'function' && !a.regen.__f515){
        var oa = a.regen.bind(a);
        a.regen = function(name){ try { push({ ev: 'legacy-aiAvatar-regen', name: String(name || '').slice(0, 24) }); } catch(e){} return oa.apply(this, arguments); };
        a.regen.__f515 = true;
        push({ ev: 'legacy-aiAvatar-present', enabled: (function(){ try { return !!(a.enabled && a.enabled()); } catch(e){ return '?'; } })() });
      }
    } catch(e){}
    try {
      var f = window.__v292Dfix197;
      if (f && typeof f.regenFor === 'function' && !f.regenFor.__f515){
        var of = f.regenFor.bind(f);
        f.regenFor = function(name){ try { push({ ev: 'fix197-regenFor', name: String(name || '').slice(0, 24) }); } catch(e){} return of.apply(this, arguments); };
        f.regenFor.__f515 = true;
      }
    } catch(e){}
  }
  wrapRegen();
  // 両系統は fix515 より後に用意され得るので数回リトライ(記録以外は何もしない)
  var wtries = 0; var witv = setInterval(function(){ wtries++; wrapRegen(); if (wtries > 20) clearInterval(witv); }, 500);

  // ---------- 2. ↻クリック捕捉(受動・capture) ----------
  try {
    document.addEventListener('click', function(ev){
      try {
        var t = ev.target; if (!t || !t.closest) return;
        var probe = t.closest('button,[role="button"],a') || t;
        var txt = (probe.textContent || '') + ' ' + ((probe.getAttribute && (probe.getAttribute('title') || probe.getAttribute('aria-label'))) || '');
        if (txt.length > 40) return;
        if (!/再生成|↻|↺|⟳|🔄/.test(txt)) return;
        var card = t.closest('.npc-card') || t.closest('.v100-clean') || t.closest('[class*="card"]') || t.parentNode;
        var nm = '';
        var img = (card && card.querySelector) ? card.querySelector('img[alt]') : null;
        if (img) nm = (img.getAttribute('alt') || '').trim();
        if (!nm && card && card.querySelector){ var ni = card.querySelector('input[type="text"]'); if (ni) nm = (ni.value || '').trim(); }
        push({ ev: 'regen-click', name: nm.slice(0, 24) });
      } catch(e){}
    }, true);
  } catch(e){}

  // ---------- 6. load後: ミアの表示<img>とIDB現物を記録 ----------
  function srcKind(src){
    if (!src) return 'empty';
    if (src.indexOf('/img?ns=') >= 0 || src.indexOf('/img?') >= 0) return 'server-img';
    if (src.indexOf('data:image') === 0) return 'data-idb';
    if (src.indexOf('dicebear') >= 0 || src.indexOf('svg+xml') >= 0) return 'dice/svg';
    if (src.indexOf('pollinations') >= 0) return 'pollinations-url';
    return 'other';
  }
  function readMiaIdb(cb){
    try {
      var r = indexedDB.open('chr6av');
      r.onsuccess = function(){
        try {
          var db = r.result;
          var tx = db.transaction('imgs', 'readonly');
          var rq = tx.objectStore('imgs').get(MIA_KEY);
          rq.onsuccess = function(){ var v = rq.result; cb((typeof v === 'string') ? { len: v.length, fp: fp(v) } : { len: 0, type: typeof v }); db.close(); };
          rq.onerror = function(){ cb({ err: 'get' }); db.close(); };
        } catch(e){ cb({ err: String(e).slice(0,40) }); }
      };
      r.onerror = function(){ cb({ err: 'open' }); };
    } catch(e){ cb({ err: String(e).slice(0,40) }); }
  }
  function snapshotLoad(tag){
    try {
      var imgs = document.querySelectorAll('img[alt]');
      var mia = null;
      for (var i = 0; i < imgs.length; i++){ var al = (imgs[i].getAttribute('alt') || '').trim(); if (al === 'ミア' || al.indexOf('ミア') >= 0){ mia = imgs[i]; break; } }
      var src = mia ? (mia.getAttribute('src') || '') : '';
      var f197 = window.__v292Dfix197;
      var cached = '';
      try { cached = (f197 && f197.cachedFor) ? (f197.cachedFor('ミア') || '') : ''; } catch(e){}
      readMiaIdb(function(idb){
        push({ ev: 'load-snapshot', tag: tag, miaImgFound: !!mia,
               displaySrcKind: srcKind(src),
               displayFp: (src.indexOf('data:image') === 0) ? fp(src) : '',
               cachedForKind: srcKind(cached), cachedForFp: cached ? fp(cached) : '',
               idb: idb });
      });
    } catch(e){}
  }
  function schedule(){ [3500, 8000].forEach(function(ms){ setTimeout(function(){ snapshotLoad(ms === 3500 ? 'load+3.5s' : 'load+8s'); }, ms); }); }
  if (document.readyState === 'complete' || document.readyState === 'interactive') schedule();
  else document.addEventListener('DOMContentLoaded', schedule);

  window.__v292Dfix515 = {
    __armed: true,
    log: function(){ try { return JSON.parse(localStorage.getItem(LOGKEY) || '[]'); } catch(e){ return []; } },
    clear: function(){ try { localStorage.removeItem(LOGKEY); } catch(e){} },
    fp: fp
  };
  try { console.log(TAG, 'ARMED (read-only probe). log=localStorage.' + LOGKEY); } catch(e){}
})();
