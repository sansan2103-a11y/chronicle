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
// ★fix946(2026-10-14 / GPT #125-GQ Local GO・#125-GR 第 1 段): アカウント境界（M3）。
//   ・起動時に持ち主が変わっていたら（v292Dfix946.idbPending()）、mem へ読む**前に** chr6av/imgs の全件を
//     別 DB chr6av_q（store imgs・key = <旧持ち主の印>+'\u0001'+元 key）へ写し、写し終えた（tx complete）後で元を消す。
//     今の持ち主の退避分が chr6av_q に在れば元へ戻す。**消さずに退避**。失敗したら元は消さず fence（表示しない）。
//   ・途中で持ち主が変わったら（fence）mem を捨て、v292av2_ の読み書きを止める（遅れて届いた X の絵を Y に入れない）。
//   ・退避中の書込みは待ち行列に入れ、終わってから IDB へ書く（退避と混ざらないように）。
//   kill: v292Dfix946Off='1' で修正前と同じ。
// ★iso1b(2026-10-14 / GPT #125-GV): 前の持ち主の分を退避し終えたら、今の持ち主の分を戻す**前**に v292Dfix946.idbMovedOut() を呼ぶ
//   （印の idbFrom を消す。書けなければ false → 戻さずに終わる＝fence。次の起動でやり直しても今の持ち主の絵を前の持ち主の退避に入れない）。
// ★iso1c(2026-10-14 / GPT #125-GW): 印に問題がある起動（v292Dfix946.holding()＝bootstrap で印が書けない・印が読めない・印が書けない）では、
//   LS→IndexedDB の移行をしない（所属不明の絵を動かさない。LS の絵はそのまま残る＝消さない）。それ以外は iso1b と同じ。
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
  /* ★fix946 */
  function f946(){ try{ var F = window.__v292Dfix946; return (F && F.__armed && F.on() && F.m3On()) ? F : null; }catch(e){ return null; } }
  function fenced946(){ try{ var F = f946(); return !!(F && F.fenced()); }catch(e){ return false; } }
  function hold946(){ try{ var F = f946(); return !!(F && typeof F.holding === 'function' && F.holding()); }catch(e){ return false; } }   // ★iso1c
  var pendingPuts946 = null;   // 退避が終わるまでの書込み（f946 有効時だけ使う）
  try { var F946b = window.__v292Dfix946; if (F946b && F946b.__armed && typeof F946b.onFence === 'function') F946b.onFence(function(){ mem = Object.create(null); pendingPuts946 = null; }); } catch(e){}
  var _get=localStorage.getItem.bind(localStorage);
  var _set=localStorage.setItem.bind(localStorage);
  var _del=localStorage.removeItem.bind(localStorage);
  // 生アクセサ(off()判定用に露出・ラッパ経由の無限ループ回避)
  try{ localStorage.__v346raw=_get; }catch(e){}
  function isOff(){ try{ return _get('v292Dfix346Off')==='1'; }catch(e){ return false; } }

  // ---- localStorage ラッパ(PREFIXキーのみ) ----
  localStorage.getItem=function(k){
    if(typeof k==='string' && k.indexOf(PREFIX)===0){
      if (fenced946()) return null;   // ★fix946 M3
      if(k in mem) return mem[k];
      return _get(k);           // 未migrate: 実localStorageから(移行途中の保険)
    }
    return _get(k);
  };
  localStorage.setItem=function(k,v){
    if(typeof k==='string' && k.indexOf(PREFIX)===0){
      if (fenced946()) return;        // ★fix946 M3: 持ち主が変わった document の書込みは入れない
      mem[k]=v;
      if(isOff()){ try{ _set(k,v); }catch(e){} }   // OFF: 従来通りlocalStorageへ
      else { idbPut(k,v); }                          // ON: IDBのみ(localStorage節約)
      return;
    }
    return _set(k,v);
  };
  localStorage.removeItem=function(k){
    if(typeof k==='string' && k.indexOf(PREFIX)===0){
      if (fenced946()) return;        // ★fix946 M3: 前の持ち主の絵を消さない
      delete mem[k]; idbDel(k); try{ _del(k); }catch(e){}
      return;
    }
    return _del(k);
  };

  function idbPut(k,v){ try{ if(!_db){ if (pendingPuts946) pendingPuts946[k]=v; return; } _db.transaction(STORE,'readwrite').objectStore(STORE).put(v,k); }catch(e){} }
  function idbDel(k){ try{ if(!_db) return; _db.transaction(STORE,'readwrite').objectStore(STORE).delete(k); }catch(e){} }

  function openDB(cb){
    try{
      var r=indexedDB.open(DBNAME,1);
      r.onupgradeneeded=function(e){ try{ if(!e.target.result.objectStoreNames.contains(STORE)) e.target.result.createObjectStore(STORE); }catch(_){} };
      r.onerror=function(){ cb(null); };
      r.onsuccess=function(){ cb(r.result); };
    }catch(e){ cb(null); }
  }

  /* ★fix946 M3: IndexedDB の退避（移動）と復帰。cb({moved, restored, err}) */
  function quarantine946(db, qp, cb){
    var info = { moved: 0, restored: 0, err: null };
    var fin = function(){ try { cb(info); } catch(e){} };
    var qr;
    try { qr = indexedDB.open('chr6av_q', 1); } catch(e){ info.err = 'Q_OPEN'; fin(); return; }
    qr.onupgradeneeded = function(e){ try { if (!e.target.result.objectStoreNames.contains('imgs')) e.target.result.createObjectStore('imgs'); } catch(_){} };
    qr.onerror = function(){ info.err = 'Q_OPEN'; fin(); };
    qr.onsuccess = function(){
      var qdb = qr.result, items = [];
      /* ★iso1b: 退避が終わった（または退避するものが無い）→ 印を書き直せた時だけ戻す */
      function markThenRestore(){
        var ok = true;
        try { var F = window.__v292Dfix946; if (F && typeof F.idbMovedOut === 'function') ok = (F.idbMovedOut() !== false); } catch(e){ ok = false; }
        if (!ok){ info.err = 'MARK_WRITE_FAILED'; fin(); return; }
        restoreIn();
      }
      try {
        var cur = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
        cur.onerror = function(){ info.err = 'READ'; fin(); };
        cur.onsuccess = function(e){
          var c = e.target.result;
          if (c){ items.push([c.key, c.value]); c.continue(); return; }
          moveOut();
        };
      } catch(e){ info.err = 'READ'; fin(); }
      function moveOut(){
        if (!items.length){ markThenRestore(); return; }
        try {
          var tx = qdb.transaction('imgs', 'readwrite'), st = tx.objectStore('imgs');
          for (var i = 0; i < items.length; i++) st.put(items[i][1], qp.from + '\u0001' + items[i][0]);
          tx.oncomplete = function(){
            try {   // ★写し終えてから元を消す
              var tx2 = db.transaction(STORE, 'readwrite'), st2 = tx2.objectStore(STORE);
              for (var j = 0; j < items.length; j++) st2['delete'](items[j][0]);
              tx2.oncomplete = function(){ info.moved = items.length; markThenRestore(); };
              tx2.onerror = tx2.onabort = function(){ info.err = 'MAIN_DELETE'; fin(); };
            } catch(e){ info.err = 'MAIN_DELETE'; fin(); }
          };
          tx.onerror = tx.onabort = function(){ info.err = 'Q_WRITE'; fin(); };   // 元は消していない
        } catch(e){ info.err = 'Q_WRITE'; fin(); }
      }
      function restoreIn(){
        var back = [], pre = qp.to + '\u0001';
        try {
          var cur2 = qdb.transaction('imgs', 'readonly').objectStore('imgs').openCursor();
          cur2.onerror = function(){ fin(); };
          cur2.onsuccess = function(e){
            var c = e.target.result;
            if (c){ if (String(c.key).indexOf(pre) === 0) back.push([String(c.key).slice(pre.length), c.value, c.key]); c.continue(); return; }
            if (!back.length){ fin(); return; }
            try {
              var tx3 = db.transaction(STORE, 'readwrite'), st3 = tx3.objectStore(STORE);
              for (var i = 0; i < back.length; i++) st3.put(back[i][1], back[i][0]);
              tx3.oncomplete = function(){
                try {
                  var tx4 = qdb.transaction('imgs', 'readwrite'), st4 = tx4.objectStore('imgs');
                  for (var j = 0; j < back.length; j++) st4['delete'](back[j][2]);
                  tx4.oncomplete = function(){ info.restored = back.length; fin(); };
                  tx4.onerror = tx4.onabort = function(){ info.restored = back.length; fin(); };   // 戻せた（退避側の重複は害なし）
                } catch(e){ info.restored = back.length; fin(); }
              };
              tx3.onerror = tx3.onabort = function(){ fin(); };   // 戻せなかった＝退避側に残る（消えない）
            } catch(e){ fin(); }
          };
        } catch(e){ fin(); }
      }
    };
  }

  function loadAllThenMigrate(){
    openDB(function(db){
      /* ★fix946 M3: 持ち主が変わった起動では、mem へ読む前に退避する */
      var F = f946(), qp = F ? F.idbPending() : null;
      if (F && qp) pendingPuts946 = pendingPuts946 || {};   // ★第 1 段: 退避がある起動だけ待ち行列を使う（同じ持ち主の起動は修正前と同じ＝DB を開く前の書込みは従来どおり）
      if (qp && !db){ try { F.idbDone({ moved: 0, restored: 0 }); } catch(e){} qp = null; }   // IndexedDB が無い端末は退避するものも無い
      if (qp){
        quarantine946(db, qp, function(info){
          try { F.idbDone(info); } catch(e){}
          if (info && info.err){ ready = true; try { console.warn(TAG, 'fix946 quarantine failed:', info.err, '(元は消していない・この document では表示しない)'); } catch(_){} return; }
          proceed(db);
        });
        return;
      }
      proceed(db);
    });
  }
  function proceed(db){
    {
      _db=db;
      try { if (pendingPuts946){ var pp = pendingPuts946; pendingPuts946 = null; for (var pk in pp) idbPut(pk, pp[pk]); } } catch(e){}
      if(!db){ ready=true; try{ console.warn(TAG,'no IndexedDB — passthrough'); }catch(_){}; return; }
      try{
        var cur=db.transaction(STORE,'readonly').objectStore(STORE).openCursor();
        cur.onsuccess=function(e){ var c=e.target.result; if(c){ if (!fenced946()) mem[c.key]=c.value; c.continue(); } else { migrate(); } };
        cur.onerror=function(){ migrate(); };
      }catch(e){ migrate(); }
    }
  }
  function migrate(){
    if(!isOff() && !hold946()){   // ★iso1c: 印に問題がある起動では移さない
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
