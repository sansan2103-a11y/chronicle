// =====================================================================
// Chronicle TRPG - v292Dfix346: アバター画像をIndexedDBへ移行(localStorage解放)
// ---------------------------------------------------------------------
// 背景(おしん実害 2026-07-01): アバター画像(data URL)をlocalStorage 'v292av2_*'に
//   1キー1枚で貯め込み、104枚で5.3MB→localStorage総計9.5MB(上限~10MB)に達し、
//   ターン保存(S.save)が QuotaExceededError で失敗→「送信できない」。
// DeepResearch結論: 画像はlocalStorage(~10MB上限・base64は+33%肥大)でなく
//   IndexedDB(ディスクの数十%・Blob/文字列とも可・容量大)に置くのが定石。
// 設計(fix197不触・fix246型のlocalStorageラッパ):
//   ・localStorage.getItem/setItem/removeItem を 'v292av2_' キーだけラップ。
//   ・画像はメモリキャッシュ(mem)＋IndexedDB(chr6av/imgs)に保持。localStorageには置かない。
//   ・起動時: IDB→mem 全ロード後、localStorage内の旧'v292av2_'画像をIDB+memへ移送し
//     localStorageから削除(=空き回復)。冪等(既にmem/IDBにあれば重複移送しない)。
//   ・読みは常に mem→(未migrateなら)localStorage の順=移行途中でも絵が消えない。
//   ・fix197は「localStorageを使っている」と思ったまま動く(getItem/setItemが透過的にIDBへ)。
// ★緊急OFF: localStorage 'v292Dfix346Off'='1' → 移行(localStorage削除)と書込リダイレクトを
//   停止し、従来通りlocalStorageへ。ただし読みラッパは残す=既にIDBへ移した絵も表示できる(非破壊退避)。
// index.html末尾で読む(fix197より後でよい=ラッパはparse時に即設置)。
// =====================================================================
(function(){
  'use strict';
  if(window.__v292Dfix346) return; window.__v292Dfix346={};
  var TAG='[v292Dfix346:idb-avatars]';
  var PREFIX='v292av2_';
  var DBNAME='chr6av', STORE='imgs';
  function off(){ try{ return localStorage.__v346raw ? localStorage.__v346raw('v292Dfix346Off')==='1' : false; }catch(e){ return false; } }

  var mem=Object.create(null);   // key -> dataURL (sync access)
  var _db=null, ready=false;
  var _get=localStorage.getItem.bind(localStorage);
  var _set=localStorage.setItem.bind(localStorage);
  var _del=localStorage.removeItem.bind(localStorage);
  // 生アクセサ(off()判定用に露出・ラッパ経由の無限ループ回避)
  try{ localStorage.__v346raw=_get; }catch(e){}
  function isOff(){ try{ return _get('v292Dfix346Off')==='1'; }catch(e){ return false; } }

  // ---- localStorage ラッパ(PREFIXキーのみ) ----
  localStorage.getItem=function(k){
    if(typeof k==='string' && k.indexOf(PREFIX)===0){
      if(k in mem) return mem[k];
      return _get(k);           // 未migrate: 実localStorageから(移行途中の保険)
    }
    return _get(k);
  };
  localStorage.setItem=function(k,v){
    if(typeof k==='string' && k.indexOf(PREFIX)===0){
      mem[k]=v;
      if(isOff()){ try{ _set(k,v); }catch(e){} }   // OFF: 従来通りlocalStorageへ
      else { idbPut(k,v); }                          // ON: IDBのみ(localStorage節約)
      return;
    }
    return _set(k,v);
  };
  localStorage.removeItem=function(k){
    if(typeof k==='string' && k.indexOf(PREFIX)===0){
      delete mem[k]; idbDel(k); try{ _del(k); }catch(e){}
      return;
    }
    return _del(k);
  };

  function idbPut(k,v){ try{ if(!_db) return; _db.transaction(STORE,'readwrite').objectStore(STORE).put(v,k); }catch(e){} }
  function idbDel(k){ try{ if(!_db) return; _db.transaction(STORE,'readwrite').objectStore(STORE).delete(k); }catch(e){} }

  function openDB(cb){
    try{
      var r=indexedDB.open(DBNAME,1);
      r.onupgradeneeded=function(e){ try{ if(!e.target.result.objectStoreNames.contains(STORE)) e.target.result.createObjectStore(STORE); }catch(_){} };
      r.onerror=function(){ cb(null); };
      r.onsuccess=function(){ cb(r.result); };
    }catch(e){ cb(null); }
  }

  function loadAllThenMigrate(){
    openDB(function(db){
      _db=db;
      if(!db){ ready=true; try{ console.warn(TAG,'no IndexedDB — passthrough'); }catch(_){}; return; }
      try{
        var cur=db.transaction(STORE,'readonly').objectStore(STORE).openCursor();
        cur.onsuccess=function(e){ var c=e.target.result; if(c){ mem[c.key]=c.value; c.continue(); } else { migrate(); } };
        cur.onerror=function(){ migrate(); };
      }catch(e){ migrate(); }
    });
  }
  function migrate(){
    if(!isOff()){
      try{
        var keys=[];
        for(var i=0;i<localStorage.length;i++){ var k=localStorage.key(i); if(k && k.indexOf(PREFIX)===0) keys.push(k); }
        var moved=0;
        keys.forEach(function(k){ var v=_get(k); if(v){ if(!(k in mem)){ mem[k]=v; idbPut(k,v); } _del(k); moved++; } });
        if(moved) try{ console.log(TAG,'migrated '+moved+' imgs localStorage→IDB'); }catch(_){}
      }catch(e){}
    }
    ready=true;
    // 移行後、fix197に再スイープさせて mem 由来の絵を貼り直す(warmup後の反映)
    try{ var f=window.__v292Dfix197||window.__v292Dfix199; if(f&&typeof f.sweep==='function') f.sweep(); }catch(e){}
    try{ console.log(TAG,'ready. mem imgs='+Object.keys(mem).length+' (off='+isOff()+')'); }catch(e){}
  }

  window.__v292Dfix346={ memCount:function(){ return Object.keys(mem).length; }, ready:function(){ return ready; }, isOff:isOff };
  loadAllThenMigrate();
})();
