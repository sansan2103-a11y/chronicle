// =====================================================================
// Chronicle TRPG - v292Dfix631: アイコン在庫の正本参照 + 期待集合のシード + 観測口
// ---------------------------------------------------------------------
// 真因(2026-07-26監査 → 2026-07-29に現コードで再検証):
//   ・原因B: fix523 の localAvKeys() は localStorage.length / localStorage.key(i) を
//     使って 'v292av2_' キーを数える。ところが画像の実体は fix346 で IndexedDB
//     (DB=chr6av / store=imgs) へ移されており、**生localStorageには1件も無い**
//     (実測 LS=0件 / IDB=225件)。よって版差分の対象集合が常に空になり、
//     「画面に映っているキャラだけ」に縮退していた。
//     ※監査は localAv() も壊れていると書いていたが、そちらは localStorage.getItem
//       経由なので fix346 のラッパが mem(IDB由来) を返す＝**壊れていない**。
//       壊れているのは列挙(localAvKeys)だけ。
//   ・原因C: fix399 の自己修復の基準 v292Dfix399_imgKeys は saveExpectedImgKeys() で
//     しか書かれず、それは idbWriteAll()＝クラウド取り込み時にしか走らない。
//     一度も取り込みをしていない端末では**永久に空**＝不足を検出できない(実測0件)。
//
// このモジュールの役割(自分では同期しない・在庫を数えるだけ):
//   window.__v292av = { keys(), refresh(cb), get(pk), note(pk), status() }
//     keys() … この端末が持つアイコンのpk一覧(PREFIX無し)。
//              IndexedDB chr6av/imgs の openKeyCursor(値を読まない=軽い) ∪ 生localStorage。
//     get(pk) … localStorage.getItem('v292av2_'+pk)。fix346 のラッパ経由で mem から同期取得。
//     note(pk) … 新規に書かれたキーをキャッシュへ即時追加(fix632 から呼ぶ)。
//   期待集合のシード: v292Dfix399_imgKeys = union(既存, 実在庫)。
//     ★union にするのは、この値が「足りないものを見つけるための期待集合」だから。
//       縮めると「消えたことにする」＝削除処理の新設に当たる(破壊的変更・禁止)。
//       よって**増やす方向にしか動かさない**。
//   観測口 promptDiff(name): ↻再生成でレシピ(v292avrec_.p)が buildPrompt412() に
//     無条件上書きされる件(fix197:298-299)の材料を出すだけ。**生成挙動は変えない**。
//
// 緊急OFF: localStorage.v292Dfix631Off='1'
//   → keys() は生localStorageのみ(=従来と同じ空)に戻り、期待集合のシードも止まる。
//     promptDiff は読み取り専用なので OFF でも使える。
// 冪等ガード: window.__v292Dfix631.__armed
// =====================================================================
(function(){
  'use strict';
  var W = (typeof window !== 'undefined') ? window : this;
  if (W.__v292Dfix631 && W.__v292Dfix631.__armed) return;
  var TAG = '[v292Dfix631:avatar-inventory]';
  var PREFIX = 'v292av2_';
  var DBNAME = 'chr6av', STORE = 'imgs';
  var EXPECT_KEY = 'v292Dfix399_imgKeys';

  function lsg(k){ try { return W.localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix631Off') === '1'; }
  function on(){ return !off(); }

  // ---------- 在庫キャッシュ ----------
  var cache = Object.create(null);   // pk -> 1
  var lastRefresh = 0, refreshing = false;

  function rawLsKeys(){
    var out = [];
    try {
      var n = W.localStorage.length || 0;
      for (var i = 0; i < n; i++){
        var k = W.localStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0) out.push(k.slice(PREFIX.length));
      }
    } catch(e){}
    return out;
  }

  function idbKeys(cb){
    var done = false;
    function fin(list){ if (done) return; done = true; cb(list || []); }
    try {
      if (typeof indexedDB === 'undefined' || !indexedDB || !indexedDB.open){ fin([]); return; }
      var r = indexedDB.open(DBNAME, 1);
      r.onupgradeneeded = function(e){
        try { var db = e.target.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE); } catch(_){}
      };
      r.onerror = function(){ fin([]); };
      r.onsuccess = function(){
        var db = r.result;
        var keys = [];
        try {
          var cur = db.transaction(STORE, 'readonly').objectStore(STORE).openKeyCursor();
          cur.onsuccess = function(e){
            var c = e.target.result;
            if (c){ keys.push(String(c.key)); try { c.continue(); } catch(_){ try { db.close(); } catch(__){}; fin(keys); } }
            else { try { db.close(); } catch(_){}; fin(keys); }
          };
          cur.onerror = function(){ try { db.close(); } catch(_){}; fin(keys); };
        } catch(e){ try { db.close(); } catch(_){}; fin(keys); }
      };
    } catch(e){ fin([]); }
  }

  function absorb(list){
    for (var i = 0; i < list.length; i++){
      var k = String(list[i] || '');
      if (!k) continue;
      if (k.indexOf(PREFIX) === 0) k = k.slice(PREFIX.length);
      if (k) cache[k] = 1;
    }
  }

  function refresh(cb){
    if (!on()){ if (cb) cb(keys()); return; }
    if (refreshing){ if (cb) cb(keys()); return; }
    refreshing = true;
    absorb(rawLsKeys());
    idbKeys(function(list){
      absorb(list);
      refreshing = false; lastRefresh = Date.now();
      try { seedExpected(); } catch(e){}
      if (cb) cb(keys());
    });
  }

  function keys(){
    if (!on()) return rawLsKeys();      // OFF: 従来どおり生localStorageのみ
    var out = [], seen = Object.create(null), i;
    var raw = rawLsKeys();
    for (i = 0; i < raw.length; i++){ if (!seen[raw[i]]){ seen[raw[i]] = 1; out.push(raw[i]); } }
    for (var k in cache){ if (!seen[k]){ seen[k] = 1; out.push(k); } }
    return out;
  }
  function note(pk){
    try {
      var k = String(pk || '');
      if (k.indexOf(PREFIX) === 0) k = k.slice(PREFIX.length);
      if (k) cache[k] = 1;
    } catch(e){}
  }
  function get(pk){
    try {
      var k = String(pk || '');
      var full = (k.indexOf(PREFIX) === 0) ? k : (PREFIX + k);
      var v = W.localStorage.getItem(full);
      return (typeof v === 'string' && v.indexOf('data:') === 0) ? v : '';
    } catch(e){ return ''; }
  }

  // ---------- 原因C: 期待集合を実在庫でシード(union・単調) ----------
  var seededOnce = false;
  function seedExpected(){
    if (!on()) return null;
    var present = keys();
    if (!present.length) return null;
    var cur = [];
    try { cur = JSON.parse(lsg(EXPECT_KEY) || '[]') || []; } catch(e){ cur = []; }
    if (!Array.isArray(cur)) cur = [];
    var seen = Object.create(null), out = [], i, k;
    for (i = 0; i < cur.length; i++){ k = String(cur[i] || ''); if (k && !seen[k]){ seen[k] = 1; out.push(k); } }
    var added = 0;
    for (i = 0; i < present.length; i++){
      k = PREFIX + present[i];                 // 期待集合は fix399 の IDB キー(PREFIX付き)で持つ
      if (!seen[k]){ seen[k] = 1; out.push(k); added++; }
    }
    if (!added && seededOnce) return { added: 0, total: out.length };
    out.sort();
    try { W.localStorage.setItem(EXPECT_KEY, JSON.stringify(out)); } catch(e){ return null; }
    seededOnce = true;
    if (added){ try { console.log(TAG, 'seedExpected +' + added + ' (total ' + out.length + ')'); } catch(e){} }
    return { added: added, total: out.length };
  }

  // ---------- 観測口: ↻再生成のプロンプト差分(読み取り専用) ----------
  function f197(){ try { return W.__v292Dfix197 || W.__v292Dfix199 || null; } catch(e){ return null; } }
  function promptDiff(name){
    var n = String(name == null ? '' : name).trim();
    var f = f197();
    var pk = '';
    try { if (f && typeof f.keyFor === 'function') pk = f.keyFor(n) || ''; } catch(e){}
    var recipeP = '', hasRecipe = false;
    try {
      var raw = pk ? lsg('v292avrec_' + pk) : null;
      var o = raw ? JSON.parse(raw) : null;
      if (o && o.p){ recipeP = String(o.p); hasRecipe = true; }
    } catch(e){}
    var p412 = '';
    try { if (f && typeof f.buildPrompt412 === 'function') p412 = String(f.buildPrompt412(n) || ''); } catch(e){}
    return {
      name: n, pk: pk, hasRecipe: hasRecipe,
      used: p412 ? 'buildPrompt412' : (hasRecipe ? 'recipe' : 'none'),   // fix197:299 は p412 があれば無条件で上書きする
      same: (!!recipeP && recipeP === p412),
      lenR: recipeP.length, lenP: p412.length,
      recipeP: recipeP, p412: p412
    };
  }

  // ---------- 公開 ----------
  W.__v292av = { keys: keys, refresh: refresh, get: get, note: note,
                 status: function(){ return { on: on(), count: keys().length, lastRefresh: lastRefresh }; } };
  W.__v292Dfix631 = {
    __armed: true, on: on, keys: keys, refresh: refresh, get: get, note: note,
    seedExpected: seedExpected, promptDiff: promptDiff,
    expected: function(){ try { return JSON.parse(lsg(EXPECT_KEY) || '[]') || []; } catch(e){ return []; } },
    status: function(){
      var exp = []; try { exp = JSON.parse(lsg(EXPECT_KEY) || '[]') || []; } catch(e){}
      return { armed: true, on: on(), inventory: keys().length, rawLs: rawLsKeys().length,
               expected: exp.length, lastRefresh: lastRefresh };
    }
  };

  // ---------- 起動配線 ----------
  try {
    if (on()){
      if (typeof setTimeout === 'function') setTimeout(function(){ refresh(); }, 2000);
      if (typeof setInterval === 'function') setInterval(function(){ refresh(); }, 60000);
    }
  } catch(e){}
  try { console.log(TAG, 'armed; on:', on() ? 'on' : 'off'); } catch(e){}
})();
