// =====================================================================
// Chronicle TRPG - v292Dfix632: 画像の「中身」の変化を**検出して記録する**（診断専用）
// ---------------------------------------------------------------------
// ★★2026-07-29 格下げ（GPT裁定・fix638と同時）
//   初版のこのモジュールは、中身の変化を見つけると v292Dfix399_imgHash へ 'dirty632:<ts>' を
//   書き、fix399 の push を full（pkg.idb＝画像本体入り・約5MB）へ倒していた。
//   裁定で **画像の正本は per-key チャネル（D1 images + imageRev / fix523・fix633）** と決まったので、
//   この仕掛けには2つの害しか残らない:
//     ①blob(save の pkg.idb)を太らせても正本にはならない。5MBの送信だけが増える。
//     ②fix399.applySave は末尾で v292Dfix399_imgHash を**実在庫のキー集合hashで上書き**する。
//       つまり「取り込みが起きただけ」で dirty632 が消え、**送っていないのに成功扱い**になる。
//   → 以後このモジュールは **v292Dfix399_imgHash へ一切書かない**。
//     検知結果は自前のキー v292Dfix632_diag にだけ残す（診断専用）。
//     初回シード（full送信1回＝5MB）も廃止する。伝播の正しい経路は fix633 の Live 化。
//   ★後始末: 旧版が既に 'dirty632:' を書いてしまった端末のために、起動時に一度だけ
//     実在庫（IndexedDB chr6av/imgs のキー集合）から fix399 と同じ式で hash を作り直して戻す。
//     戻せない（IDBを読めない）ときは触らない（勝手な値を書いて full 送信を誘発しない）。
//
// 以下は初版の記録（なぜ作ったか。経緯として残す）:
// 真因(原因A・2026-07-29に現コードで確認):
//   v292Dfix399-cloudsync.js:619
//     var curHash = hash(imgKeys.slice().sort().join('|'));
//     var needFull = force || (curHash !== imgHashStored()) || (workerVer < 11);
//   ＝ full 送信(pkg.idb=画像本体入り)の判断が **IDBのキー名の集合ハッシュだけ** で、
//     中身を1バイトも見ていない。同じキャラの絵を作り直してもキー名は変わらないので
//     **needFull=false** のまま light(本文だけ)が送られ続ける。
//
// これが効く場所は2つある(2つ目が本命):
//   (1) 再生成した絵がクラウド本体(save blobの pkg.idb)へ上がらない。
//   (2) ★ サーバー側の画像の正本が **2系統に割れたまま固定される**。
//       op:putimg → D1 images テーブル(fix402/fix523/fix633 が使う。GET /img はここを優先)
//       op:put    → save blob の pkg.idb(applySave がローカルIDBへ書き戻す)
//       (1)のせいで blob 側だけが古いまま残り、他端末が op:get → applySave すると
//       **古い画像でローカルIDBを上書きする**＝「同期したら絵が戻った」。
//
// 初版の直し方(廃止・記録として残す):
//   fix399 の hash() は String(h>>>0) ＝ **10進数字のみ**を返すので、
//   v292Dfix399_imgHash に 'dirty632:<ts>' を書けば curHash と絶対に一致せず、
//   次の push が needFull=true になる…という仕掛けだった。
//   ★上記のとおり「取り込みだけで解除される＝送っていないのに成功扱い」になるため廃止した。
//
// 中身ハッシュ台帳: localStorage['v292Dfix632_ih'] = { pk: '<len>:<djb2>' }(約5〜8KB)
//   ハッシュ式は fix523 / Worker d1PutImg と同一契約:
//     hash = String(fullDataUrl.length) + ':' + smallHash(fullDataUrl)
//     smallHash = djb2(h=5381; h=((h<<5)+h+c)|0; (h>>>0).toString(36))
//
// 検知の経路は2本(そのまま。書き先だけ v292Dfix632_diag へ変わった):
//   (a) localStorage.setItem('v292av2_*', 'data:image...') のラップ(生成・再生成・受信)
//   (b) 起動時の照合: fix631 の実在庫を舐めて台帳を作り直し、差があれば記録
//       (fix399 の idbWriteAll のような **setItem を経ないIDB直書き** の受け皿)
//   ★初回シードによる full 送信は**廃止**（v292Dfix632_seeded は互換のため立てるだけ）。
//
// 緊急OFF: localStorage.v292Dfix632Off='1'
//   → ラップは素通し、台帳も診断も書かない＝fix630 時点の挙動へ即復帰。
// 冪等ガード: window.__v292Dfix632.__armed / setItem ラッパ側は __f632
// =====================================================================
(function(){
  'use strict';
  var W = (typeof window !== 'undefined') ? window : this;
  if (W.__v292Dfix632 && W.__v292Dfix632.__armed) return;
  var TAG = '[v292Dfix632:img-content-dirty]';
  var PREFIX = 'v292av2_';
  var LEDGER = 'v292Dfix632_ih';
  var SEEDED = 'v292Dfix632_seeded';
  var DIAG = 'v292Dfix632_diag';      // ★格下げ後の書き先（診断専用・同期には一切影響しない）
  var IMGHASH = 'v292Dfix399_imgHash';
  var SENTINEL = 'dirty632:';         // ★旧版が書いていた印。**もう書かない**。読むのは後始末のときだけ
  var DIAG_MAX = 8;                   // 直近の検知だけ残す（localStorage を太らせない）

  var _ls = null, _get = null, _set = null;
  try { _ls = W.localStorage; _get = _ls.getItem.bind(_ls); _set = _ls.setItem.bind(_ls); } catch(e){}

  function lsg(k){ try { return _get ? _get(k) : null; } catch(e){ return null; } }
  function lss(k, v){ try { if (_set) _set(k, v); return true; } catch(e){ return false; } }
  function off(){ return lsg('v292Dfix632Off') === '1'; }
  function on(){ return !off(); }

  // ---- Worker/fix523 と同一のハッシュ契約(式を変えない) ----
  function smallHash(s){ var h = 5381; s = String(s || ''); for (var i = 0; i < s.length; i++){ h = ((h << 5) + h + s.charCodeAt(i)) | 0; } return (h >>> 0).toString(36); }
  function hashFull(durl){ var s = String(durl || ''); return String(s.length) + ':' + smallHash(s); }

  // ---- 台帳 ----
  function ledger(){ try { var o = JSON.parse(lsg(LEDGER) || '{}'); return (o && typeof o === 'object') ? o : {}; } catch(e){ return {}; } }
  function saveLedger(m){ try { return lss(LEDGER, JSON.stringify(m)); } catch(e){ return false; } }

  // ---- 検知の記録（★格下げ: v292Dfix399_imgHash へは書かない。診断キーにだけ残す） ----
  var lastDirtyAt = 0, dirtyCount = 0;
  function diag(){
    try { var o = JSON.parse(lsg(DIAG) || 'null'); return (o && typeof o === 'object') ? o : { n: 0, last: null, recent: [] }; }
    catch(e){ return { n: 0, last: null, recent: [] }; }
  }
  /* 旧版の印が残っているか（後始末の判定にだけ使う） */
  function legacyMarkerPresent(){ return String(lsg(IMGHASH) || '').indexOf(SENTINEL) === 0; }
  /* ★互換のため名前は残すが、意味は「検知を記録する」に変わった。同期の挙動は一切変えない。 */
  function markDirty(why){
    if (!on()) return false;
    var d = diag();
    d.n = (+d.n || 0) + 1;
    d.last = { at: Date.now(), why: String(why || '') };
    if (Object.prototype.toString.call(d.recent) !== '[object Array]') d.recent = [];
    d.recent.push(d.last);
    if (d.recent.length > DIAG_MAX) d.recent = d.recent.slice(d.recent.length - DIAG_MAX);
    var ok = lss(DIAG, JSON.stringify(d));
    if (ok){ lastDirtyAt = d.last.at; dirtyCount++; try { console.log(TAG, 'note change (' + why + ') ※診断のみ・full送信は起こさない'); } catch(e){} }
    return ok;
  }
  /* ★旧API名。同期を汚さなくなったので**常に false**（＝fix399 から見て dirty は存在しない）。
     旧版の印が残っているかは legacyMarkerPresent() で見る。 */
  function isDirty(){ return false; }

  // ---- setItem ラップ(v292av2_ かつ data:image のときだけ判断する) ----
  (function wrap(){
    try {
      if (!_ls || !_set) return;
      var cur = _ls.setItem;
      if (cur && cur.__f632) return;
      var wrapped = function(k, v){
        var isav = (typeof k === 'string' && k.indexOf(PREFIX) === 0 &&
                    typeof v === 'string' && v.indexOf('data:image') === 0);
        var pk = isav ? k.slice(PREFIX.length) : '';
        var oldH = null;
        if (isav && on()){
          try { var old = _get(k); oldH = (typeof old === 'string' && old.indexOf('data:') === 0) ? hashFull(old) : ''; } catch(e){ oldH = null; }
        }
        var r = _set(k, v);                            // ★必ず本来の書込を通す(fix523→fix346)
        if (isav && on()){
          try {
            var newH = hashFull(v);
            var m = ledger();
            var prev = (oldH != null && oldH !== '') ? oldH : (m[pk] || '');
            if (prev !== newH){
              m[pk] = newH; saveLedger(m);
              markDirty('content-changed:' + pk);
            } else if (m[pk] !== newH){
              m[pk] = newH; saveLedger(m);             // 台帳だけ追いつかせる(dirtyにはしない)
            }
            try { if (W.__v292av && W.__v292av.note) W.__v292av.note(pk); } catch(e){}
          } catch(e){}
        }
        return r;
      };
      wrapped.__f632 = true;
      try { Object.defineProperty(wrapped, 'name', { value: 'setItem', configurable: true }); } catch(e){}
      _ls.setItem = wrapped;
    } catch(e){}
  })();

  // ---- 起動時の照合(setItem を経ない変化の受け皿) + 初回シード ----
  function inventory(){
    try { if (W.__v292av && typeof W.__v292av.keys === 'function') return W.__v292av.keys(); } catch(e){}
    var out = [];
    try { for (var i = 0; i < (W.localStorage.length || 0); i++){ var k = W.localStorage.key(i); if (k && k.indexOf(PREFIX) === 0) out.push(k.slice(PREFIX.length)); } } catch(e){}
    return out;
  }
  function readOne(pk){
    try { var v = W.localStorage.getItem(PREFIX + pk); return (typeof v === 'string' && v.indexOf('data:') === 0) ? v : ''; } catch(e){ return ''; }
  }
  function reconcile(){
    if (!on()) return { skipped: 'off' };
    var pks = inventory();
    if (!pks.length) return { skipped: 'empty-inventory' };
    var old = ledger(), next = {}, changed = [], i, pk, v, h;
    for (i = 0; i < pks.length; i++){
      pk = pks[i]; v = readOne(pk);
      if (!v) { if (old[pk]) next[pk] = old[pk]; continue; }   // 読めない分は旧値を保つ(消さない)
      h = hashFull(v); next[pk] = h;
      if (old[pk] && old[pk] !== h) changed.push(pk);
    }
    for (pk in old){ if (!(pk in next)) next[pk] = old[pk]; }   // ★台帳から勝手に消さない
    saveLedger(next);
    var seeded = lsg(SEEDED) === '1';
    var res = { keys: pks.length, changed: changed.length, seeded: seeded, dirtied: false };
    if (changed.length){ res.dirtied = markDirty('boot-reconcile:' + changed.length); }
    /* ★初回シードによる full 送信(約5MB)は廃止（GPT裁定: 正本は per-key チャネル）。
       台帳を作った印だけは互換のため残す。 */
    if (!seeded) lss(SEEDED, '1');
    return res;
  }

  /* ---- 後始末: 旧版が書いた 'dirty632:' を実在庫の hash へ戻す ----
     ★なぜ要るか: 旧版の印が残った端末で手動☁️を押すと、needFull=true になって
       約5MBの full 送信が1回起きる。per-key 正本の方針では**不要な送信**なので消す。
     ★どう戻すか: fix399 と**同じ式・同じ入力**（IndexedDB chr6av/imgs のキー集合）で作り直す。
         fix399:62  hash(s) = djb2風 ((h<<5)-h+c)|0 → String(h>>>0)
         fix399:999 hash(keys.slice().sort().join('|'))
     ★読めなかったときは触らない。適当な値を書くと、それはそれで full 送信を誘発する。 */
  function fix399Hash(s){ var h = 0; s = String(s || ''); for (var i = 0; i < s.length; i++){ h = ((h << 5) - h + s.charCodeAt(i)) | 0; } return String(h >>> 0); }
  function idbKeysExact(cb){
    var done = false;
    function fin(ok, keys){ if (done) return; done = true; cb(ok, keys || []); }
    try {
      var idb = W.indexedDB;
      if (!idb || typeof idb.open !== 'function'){ fin(false); return; }
      var r = idb.open('chr6av', 1);
      r.onupgradeneeded = function(e){ try { var db = e.target.result; if (!db.objectStoreNames.contains('imgs')) db.createObjectStore('imgs'); } catch(_){} };
      r.onerror = function(){ fin(false); };
      r.onsuccess = function(){
        var db = r.result, keys = [];
        try {
          var cur = db.transaction('imgs', 'readonly').objectStore('imgs').openKeyCursor();
          cur.onsuccess = function(e){
            var c = e.target.result;
            if (c){ keys.push(String(c.key)); try { c.continue(); } catch(_){ try { db.close(); } catch(__){}; fin(true, keys); } }
            else { try { db.close(); } catch(_){}; fin(true, keys); }
          };
          cur.onerror = function(){ try { db.close(); } catch(_){}; fin(false); };
        } catch(e){ try { db.close(); } catch(_){}; fin(false); }
      };
    } catch(e){ fin(false); }
  }
  var legacyCleared = null;
  function clearLegacyMarker(cb){
    if (!on() || !legacyMarkerPresent()){ legacyCleared = { at: Date.now(), acted: false, why: 'no-marker' }; if (cb) cb(legacyCleared); return; }
    idbKeysExact(function(ok, keys){
      if (!ok){
        legacyCleared = { at: Date.now(), acted: false, why: 'idb-unreadable' };
        try { console.warn(TAG, '旧dirty印を消せませんでした（IDBを読めない）。印は残しますが害は手動☁️1回の full 送信だけです'); } catch(e){}
        if (cb) cb(legacyCleared); return;
      }
      var h = fix399Hash(keys.slice().sort().join('|'));
      var wrote = lss(IMGHASH, h);
      legacyCleared = { at: Date.now(), acted: !!wrote, why: 'restored-from-idb', keys: keys.length, hash: h };
      try { console.log(TAG, '旧dirty印を実在庫hashへ戻しました keys=' + keys.length); } catch(e){}
      if (cb) cb(legacyCleared);
    });
  }

  W.__v292Dfix632 = {
    __armed: true, on: on,
    smallHash: smallHash, hashFull: hashFull,
    ledger: ledger, reconcile: reconcile,
    markDirty: markDirty, isDirty: isDirty,
    diag: diag, legacyMarkerPresent: legacyMarkerPresent,
    clearLegacyMarker: clearLegacyMarker, fix399Hash: fix399Hash,
    SENTINEL: SENTINEL,
    status: function(){
      var m = ledger(), d = diag();
      return { armed: true, on: on(), ledger: Object.keys(m).length,
               /* ★格下げ後: 同期を汚す dirty は存在しない。旧印の有無だけを見せる */
               dirty: false, legacyMarker: legacyMarkerPresent(), legacyCleared: legacyCleared,
               noted: (+d.n || 0), lastNote: d.last,
               seeded: lsg(SEEDED) === '1', dirtyCount: dirtyCount, lastDirtyAt: lastDirtyAt,
               imgHash: String(lsg(IMGHASH) || '') };
    }
  };

  try {
    if (on() && typeof setTimeout === 'function'){
      setTimeout(function(){ try { if (W.__v292av && W.__v292av.refresh) W.__v292av.refresh(function(){ reconcile(); }); else reconcile(); } catch(e){} }, 5000);
      /* ★後始末は1回だけ。起動直後は fix346 の migrate が動いているので少し待つ */
      setTimeout(function(){ try { clearLegacyMarker(); } catch(e){} }, 7000);
    }
  } catch(e){}
  try { console.log(TAG, 'armed; on:', on() ? 'on' : 'off'); } catch(e){}
})();
