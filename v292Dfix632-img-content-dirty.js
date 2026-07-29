// =====================================================================
// Chronicle TRPG - v292Dfix632: 画像の「中身」の変化を検出して full 同期を起こす
// ---------------------------------------------------------------------
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
// 直し方(fix399 を1バイトも変えない):
//   fix399 の hash() は String(h>>>0) ＝ **10進数字のみ**を返す。
//   よって v292Dfix399_imgHash に 'dirty632:<ts>' を書けば curHash と絶対に一致せず、
//   次の push が needFull=true になる。full 送信が成功すると fix399 自身が
//   734行で imgHash を curHash(キー集合ハッシュ)へ戻すので **dirty は自動解除**される。
//   失敗した場合は dirty が残り、次回また full を試みる(望ましい)。
//
// 中身ハッシュ台帳: localStorage['v292Dfix632_ih'] = { pk: '<len>:<djb2>' }(約5〜8KB)
//   ハッシュ式は fix523 / Worker d1PutImg と同一契約:
//     hash = String(fullDataUrl.length) + ':' + smallHash(fullDataUrl)
//     smallHash = djb2(h=5381; h=((h<<5)+h+c)|0; (h>>>0).toString(36))
//
// 検知の経路は2本:
//   (a) localStorage.setItem('v292av2_*', 'data:image...') のラップ(生成・再生成・受信)
//   (b) 起動時の照合: fix631 の実在庫を舐めて台帳を作り直し、差があれば1回 dirty 化
//       (fix399 の idbWriteAll のような **setItem を経ないIDB直書き** の受け皿)
//   ★初回シード(一度きり・v292Dfix632_seeded): 台帳が無い端末は「今の絵がサーバへ
//     上がっているか」を知る手段が無い。既存の乖離を解消するため **1回だけ** dirty 化する。
//     コストは full 送信1回(約5MB)。意図的。
//
// 緊急OFF: localStorage.v292Dfix632Off='1'
//   → ラップは素通し、台帳も書かず dirty 化もしない＝fix630 時点の挙動へ即復帰。
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
  var IMGHASH = 'v292Dfix399_imgHash';
  var SENTINEL = 'dirty632:';         // fix399 の hash() は10進数字列 → 絶対に衝突しない

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

  // ---- dirty 化 ----
  var lastDirtyAt = 0, dirtyCount = 0;
  function isDirty(){ return String(lsg(IMGHASH) || '').indexOf(SENTINEL) === 0; }
  function markDirty(why){
    if (!on()) return false;
    if (isDirty()) return false;                      // 既に dirty なら上書きしない(理由を保つ)
    var ok = lss(IMGHASH, SENTINEL + Date.now());
    if (ok){ lastDirtyAt = Date.now(); dirtyCount++; try { console.log(TAG, 'mark dirty (' + why + ')'); } catch(e){} }
    return ok;
  }

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
    else if (!seeded){
      // 初回だけ: 過去に再生成した絵がクラウド本体へ上がっていない可能性を、1回のfullで解消する
      res.dirtied = markDirty('first-seed');
    }
    if (!seeded) lss(SEEDED, '1');
    return res;
  }

  W.__v292Dfix632 = {
    __armed: true, on: on,
    smallHash: smallHash, hashFull: hashFull,
    ledger: ledger, reconcile: reconcile,
    markDirty: markDirty, isDirty: isDirty,
    SENTINEL: SENTINEL,
    status: function(){
      var m = ledger();
      return { armed: true, on: on(), ledger: Object.keys(m).length, dirty: isDirty(),
               seeded: lsg(SEEDED) === '1', dirtyCount: dirtyCount, lastDirtyAt: lastDirtyAt,
               imgHash: String(lsg(IMGHASH) || '') };
    }
  };

  try {
    if (on() && typeof setTimeout === 'function'){
      setTimeout(function(){ try { if (W.__v292av && W.__v292av.refresh) W.__v292av.refresh(function(){ reconcile(); }); else reconcile(); } catch(e){} }, 5000);
    }
  } catch(e){}
  try { console.log(TAG, 'armed; on:', on() ? 'on' : 'off'); } catch(e){}
})();
