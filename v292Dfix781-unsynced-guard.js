// =====================================================================
// v292Dfix781 — Phase 2.5A: UNSYNCED_LOCAL_PROGRESS_OVERWRITE Client Protection
//
// ■何を直すか（実機で確定した DATA LOSS・RELEASE BLOCKER）
//   QA story smtg00ynsv1: server D1 = rev52 / 57 turns、local = 62 turns。
//   保存(putcanonical)が長時間 timeout し、local が 5 ターン先行したまま未同期になった。
//   次の boot で v292Dfix705 が「hash 不一致 → server canonical を破壊的に apply」し、
//   turns 58〜62 が **警告なしに** 消えた。
//
// ■根因（調査で確定した構造）
//   R1 content_hash は方向を持たない。fix705 は hash 不一致しか見ておらず
//      「どちらが先行か」を判定できない（v292Dfix705 全体で turnCount 参照 0）。
//   R2 canonical 経路（putcanonical）は ACK で **durable な記録を 1 バイトも残さない**。
//      v292Dfix697:1095 の自己申告どおり「rev は in-memory canonCtx のみ」。
//      → リロードを跨いだ瞬間、「server とどこまで一致していたか」の証拠が消える。
//   R3 fix697 は自動再送を持たない（TIMEOUT_MS=25000 で abort → note のみ）。
//      未送信の local 進行が durable な痕跡ゼロのまま残る。
//   ★ server 側 OCC（putcanonical の expectedRev+expectedHash 四重 CAS）は
//     既に完全に成立している。壊れているのは **server → client 方向にだけ CAS が無い**こと。
//     このモジュールはその非対称だけを埋める。Worker は 1 バイトも変えない。
//
// ■このモジュールがやること（4つだけ）
//   (1) story-owned local mutation の **pre-write** で DIRTY_INTENT + localGeneration を
//       durable に刻む（fix654 の setItem/removeItem 境界。fix698 layer1 と同一パターン）。
//   (2) fix697 の送信開始 / ACK に相乗りして inFlightSave / lastConfirmed を durable 化。
//   (3) fix705 の hydrate 直前に「local が先行しているか」を marker から判定させる
//       （判定関数は fix705 側の resolve781。ここはその材料と terminal 状態だけを持つ）。
//   (4) 破壊的分岐の前に Recovery Draft（IndexedDB）を作り readback で verified を取る。
//
// ■このモジュールが絶対にやらないこと
//   ・auto merge / silent overwrite / blind retry / force write
//   ・Worker への request（このファイルは fetch を 1 本も持たない）
//   ・story body / sidecar 13key への書込（marker と IndexedDB draft 以外は書かない）
//   ・S.save / features.js / fix748 / fix654 本体 / fix743 / fix750 / fix756 への変更
//   ・turn 数の単調性チェック（旧新の逆転を turn 数で決めない = hash と rev と gen だけ）
//
// ■marker key（★重要・裁定からの逸脱を明示）
//   裁定は `v292Dfix781g_<storyId>` を指定したが、実コードを読むと
//     v292Dfix402-invisible-sync.js:283  if (slotId && slotId !== 'chr6' && k.indexOf(slotId) >= 0) isSlot = true;
//     v292Dfix399-cloudsync.js:126-138   （同型の substring 判定）
//   により **storyId を含む任意のキーが同期パッケージに載る**。除外されるのは
//     __gen_ / chr6_bk_ / v292Dfix399_ / v292Dfix402_ の 4 prefix だけ
//     （v292Dfix402:271-274, v292Dfix399:135-137）。
//   marker が同期に載ると、端末 A の DIRTY marker が端末 B へ運ばれて
//   B の正当な apply を誤って止める（false BOOTSTRAP_HOLD/DIVERGED）。
//   裁定の「載るなら選択規則に触れず接頭辞を変えて回避」に従い、
//   **v292Dfix697:74 が MARKER_KEY='v292Dfix402_storyRevs' で既に採っている同じ回避**
//   （コメント: 「★collectLS 除外 prefix に同居（pkg baseline 不変）」）に揃える。
//     → v292Dfix402_f781g_<storyId>
//   fix402/fix399 の選択規則は 1 バイトも触っていない。
//
// ■kill switch（live 評価・毎回読む）
//   v292Dfix781Off  = '1' … このモジュールと fix705 gate と fix697 hook を全停止（完全従来）
//   v292Dfix781bOff = '1' … (2b) sidecar 13key 合成指紋だけ停止（aiInstr のみへ戻る）
//   v292Dfix781cOff = '1' … (2c) inFlight 中の dropped intent 再スケジュールだけ停止
//
// 検証口: window.__v292Dfix781 = { status, state, generation, marker, hold,
//                                  noteInFlight, refineInFlight, clearInFlight, confirm,
//                                  transition, draftCreate, draftGet, banner, keys, off }
// =====================================================================
(function(){
'use strict';
if (typeof window === 'undefined') return;
if (window.__v292Dfix781) return;                 /* 冪等（自 namespace のみ） */

var TAG   = '[v292Dfix781:unsynced-guard]';
var BUILD = 'fix781.0';

/* marker の prefix（上記 ■marker key の理由で v292Dfix402_ 配下に同居） */
var MPRE  = 'v292Dfix402_f781g_';
/* 自分が持ち得るキーの prefix 集合（story-owned 判定から必ず除外する = 再入ガード） */
var SELF_PREFIXES = [MPRE, 'v292Dfix781'];

var STATE = { CLEAN:'CLEAN', DIRTY_INTENT:'DIRTY_INTENT', DIRTY_LOCAL:'DIRTY_LOCAL',
              DIVERGED:'DIVERGED', BOOTSTRAP_HOLD:'BOOTSTRAP_HOLD' };
var DIRTY = { DIRTY_INTENT:1, DIRTY_LOCAL:1 };

var IDB_DB = 'chr6_unsynced_recovery', IDB_STORE = 'drafts', IDB_VER = 1;

var stats = { intents:0, enriches:0, coalesced:0, markerWrites:0, markerFails:0,
              inFlightSet:0, inFlightRefine:0, inFlightClear:0, confirms:0, cleans:0,
              staleClears:0, lostAckReconciles:0, diverged:0, bootstrapHolds:0,
              localAhead:0, drafts:0, draftsVerified:0, draftFails:0, banners:0,
              f781cDrops:0, f781cReschedules:0, fpKeysUsed:0 };
var LEDGER = [], LEDGER_CAP = 40;
function note(row){ try { row.t = Date.now(); LEDGER.push(row);
  while (LEDGER.length > LEDGER_CAP) LEDGER.shift(); } catch(e){} }

// =====================================================================
// (0) native storage accessor
//   ★marker の読み書きは **必ず** fix654 が全 wrapper 装着前に捕獲した native を使う。
//     理由 3 つ:
//       a. 自分の setItem wrapper へ再入しない（無限再帰・偽 DIRTY を構造的に禁止）
//       b. fix543 の失敗監視 / fix490 の slot-write-guard / fix402 の wrapSetItem を
//          marker 書込で発火させない（観測ノイズ 0）
//       c. fix705 の write HOLD（v292Dfix705:195-224）に marker を巻き込まれない
//     v292Dfix705:257-271 / features.js:6373-6381 と同じ primitive。
// =====================================================================
function f654(){ try { return window.__v292Dfix654 || null; } catch(e){ return null; } }
function nat(m){
  try { var F = f654(); var f = (F && typeof F._native === 'function') ? F._native(m) : null;
        return (typeof f === 'function') ? f : null; } catch(e){ return null; }
}
function ng(k){
  try { var f = nat('getItem');
        if (f) return f.call(localStorage, String(k));
        return localStorage.getItem(String(k)); } catch(e){ return null; }
}
function ns(k, v){
  try { var f = nat('setItem');
        if (f) { f.call(localStorage, String(k), String(v)); return true; }
        localStorage.setItem(String(k), String(v)); return true; } catch(e){ return false; }
}
function nr(k){
  try { var f = nat('removeItem');
        if (f) { f.call(localStorage, String(k)); return true; }
        localStorage.removeItem(String(k)); return true; } catch(e){ return false; }
}

// =====================================================================
// (1) kill switch（live 評価。load 時にキャッシュしない）
// =====================================================================
function off(){  return ng('v292Dfix781Off')  === '1'; }
function on(){   return !off(); }
function bOff(){ return ng('v292Dfix781bOff') === '1'; }
function cOff(){ return ng('v292Dfix781cOff') === '1'; }

// =====================================================================
// (2) storyId（fix694 document authority のみ。chr6_active_slot は読まない）
//     v292Dfix697:87-99 / v292Dfix698:74-84 と同一規約。
// =====================================================================
function authorityKey(){
  try { var k = window.__chronicleDocumentStoryKey;
        return (typeof k === 'string' && k) ? k : null; } catch(e){ return null; }
}
function storyId(){
  var k = authorityKey();
  if (!k) return null;
  if (k === 'chr6') return 'default';
  if (k.indexOf('chr6_slot_') === 0) return k.slice(10);
  return null;
}
function bodyKeyOf(id){ return (String(id) === 'default') ? 'chr6' : ('chr6_slot_' + String(id)); }

// =====================================================================
// (3) marker（localStorage・per-story・単一キー）
//     fix721(v292Dfix721_txn) / fix750(v292Dfix750_matTxn) と同じ「単一キー journal」形。
// =====================================================================
function markerKey(id){ return MPRE + String(id); }
function isSelfKey(k){
  var s = String(k == null ? '' : k);
  for (var i = 0; i < SELF_PREFIXES.length; i++) if (s.indexOf(SELF_PREFIXES[i]) === 0) return true;
  return false;
}
function readMarker(id){
  if (!id) return null;
  try {
    var raw = ng(markerKey(id));
    if (raw == null) return null;
    var m = JSON.parse(raw);
    if (!m || typeof m !== 'object' || Object.prototype.toString.call(m) === '[object Array]') return null;
    if (m.v !== 1) return null;                       /* 未知 version は「marker 無し」扱い（fail-closed 側） */
    if (!STATE[m.state]) return null;
    if (typeof m.localGeneration !== 'number') return null;
    return m;
  } catch(e){ return null; }
}
function writeMarker(id, m){
  if (!id || !m) return false;
  m.v = 1; m.storyId = String(id); m.updatedAt = Date.now(); m.build = BUILD;
  var okw = ns(markerKey(id), JSON.stringify(m));
  if (okw) stats.markerWrites++; else stats.markerFails++;
  return okw;
}
function blankMarker(id, st){
  return { v:1, storyId:String(id), state: st || STATE.CLEAN, localGeneration: 0,
           lastConfirmed: null, inFlightSave: null, draftId: null, adopt: null,
           userChoice: null, updatedAt: 0 };
}
function ensureMarker(id){ return readMarker(id) || blankMarker(id); }

// =====================================================================
// (4) story-owned key set
//     body(chr6_slot_<id>) + fix743.keysFor(id) の 13key。
//     ★keysFor は **読むだけ**（fix743 は 1 バイトも変えない）。
//     ★fix743 は index 末尾近くで load されるので、boot 直後は body だけの
//       部分集合になる。CC2 が現れたら遅延で full 集合へ昇格する。
// =====================================================================
var _ks = { id:null, set:null, full:false, list:[] };
function buildKeySet(id){
  var set = {}, list = [];
  var bk = bodyKeyOf(id);
  set[bk] = 1; list.push(bk);
  var full = false;
  if (String(id) !== 'default'){
    try {
      var C = window.__v292DfixCC2;
      if (C && typeof C.keysFor === 'function'){
        var K = C.keysFor(String(id));
        for (var f in K){
          if (!Object.prototype.hasOwnProperty.call(K, f)) continue;
          var kk = String(K[f]);
          if (!set[kk]){ set[kk] = 1; list.push(kk); }
        }
        full = true;
      }
    } catch(e){}
  } else {
    /* default story は fix743 の C1 対象外（DEFAULT_STORY_UNSUPPORTED_IN_C1）。
       canonical content は schema1 = body + aiInstr のみ。 */
    if (!set['v292aiInstr']){ set['v292aiInstr'] = 1; list.push('v292aiInstr'); }
    full = true;
  }
  _ks = { id: String(id), set: set, full: full, list: list };
  return _ks;
}
function keySet(id){
  if (_ks.id !== String(id) || (!_ks.full && String(id) !== 'default')) return buildKeySet(id);
  return _ks;
}
/* ホットパス。全 setItem がここを通るので **文字列前置比較だけ**で早期棄却する。
   story-owned key は必ず 'c'(chr6_*) か 'v'(v292*) で始まる。 */
function isStoryOwned(k, id){
  var s = (typeof k === 'string') ? k : String(k == null ? '' : k);
  var c0 = s.charCodeAt(0);
  if (c0 !== 99 /* c */ && c0 !== 118 /* v */) return false;
  if (isSelfKey(s)) return false;                       /* ★再入ガード（最優先） */
  var ks = keySet(id);
  return ks.set[s] === 1;
}

// =====================================================================
// (5) 状態遷移
// =====================================================================
/* pre-write DIRTY_INTENT。同一 tick 内は 1 回だけ gen を進める（裁定: 省略可）。
   ★prevSet が throw しても巻き戻さない = false-positive dirty を容認する（fail-closed）。 */
var _tick = false, _tickId = null;
function endTick(){
  _tick = false; _tickId = null;
  try {
    var id = storyId(); if (!id) return;
    var m = readMarker(id); if (!m) return;
    if (m.state !== STATE.DIRTY_INTENT) return;         /* DIVERGED / BOOTSTRAP_HOLD は上書きしない */
    m.state = STATE.DIRTY_LOCAL;                        /* enrich。fingerprint は足さない（hash 計算は保存フローの仕事） */
    stats.enriches++;
    writeMarker(id, m);
  } catch(e){}
}
function scheduleEndTick(){
  if (_tickId != null) return;
  try {
    if (typeof Promise === 'function' && Promise.resolve){
      _tickId = 1; Promise.resolve().then(function(){ try { endTick(); } catch(e){} });
      return;
    }
  } catch(e){}
  try { _tickId = setTimeout(function(){ try { endTick(); } catch(e){} }, 0); } catch(e){ _tickId = null; }
}
function markIntent(id){
  if (_tick){ stats.coalesced++; return; }               /* 同一 tick: state も gen も変わらないので書かない */
  var m = ensureMarker(id);
  if (m.state === STATE.DIVERGED || m.state === STATE.BOOTSTRAP_HOLD){
    /* terminal hold 中の書込は fix705 の HOLD が落としているはずだが、
       万一漏れても terminal 状態は保つ（gen だけ進める）。 */
    m.localGeneration = (+m.localGeneration || 0) + 1;
  } else {
    m.state = STATE.DIRTY_INTENT;
    m.localGeneration = (+m.localGeneration || 0) + 1;
  }
  stats.intents++;
  writeMarker(id, m);
  _tick = true;
  scheduleEndTick();
}

/* 送信開始（fix697 の inFlight = true と同時）。 */
function noteInFlight(id, fingerprint){
  if (!on() || !id) return false;
  try {
    var m = ensureMarker(id);
    m.inFlightSave = { generation: (+m.localGeneration || 0),
                       fingerprint: (fingerprint == null ? null : String(fingerprint)),
                       startedAt: Date.now() };
    stats.inFlightSet++;
    note({ k:'IN_FLIGHT', id:String(id), gen:m.inFlightSave.generation });
    return writeMarker(id, m);
  } catch(e){ return false; }
}
/* fingerprint だけを差し替える（schema2 は v2hash が後から確定するため）。gen/startedAt は保つ。 */
function refineInFlight(id, fingerprint){
  if (!on() || !id) return false;
  try {
    var m = readMarker(id);
    if (!m || !m.inFlightSave) return false;
    m.inFlightSave.fingerprint = (fingerprint == null ? null : String(fingerprint));
    stats.inFlightRefine++;
    return writeMarker(id, m);
  } catch(e){ return false; }
}
function clearInFlight(id){
  if (!on() || !id) return false;
  try {
    var m = readMarker(id);
    if (!m || !m.inFlightSave) return false;
    m.inFlightSave = null;
    stats.inFlightClear++;
    return writeMarker(id, m);
  } catch(e){ return false; }
}
/* ACK。CLEAN へ落とせるのは
     ACK の fingerprint === inFlightSave.fingerprint  かつ
     現在の localGeneration === inFlightSave.generation
   の両方が成立するときだけ（送信中に gen が進んでいたら DIRTY 維持 = CASE C）。
   late / lost ACK が新しい gen を CLEAN にすることは無い。 */
function confirm(id, serverRev, fingerprint){
  if (!on() || !id) return false;
  try {
    var m = ensureMarker(id);
    var fp = (fingerprint == null) ? null : String(fingerprint);
    var rev = (typeof serverRev === 'number') ? serverRev : null;
    var infl = m.inFlightSave;
    m.lastConfirmed = { serverRev: rev, fingerprint: fp };
    stats.confirms++;
    var canClean = !!(infl && fp != null && String(infl.fingerprint) === fp &&
                      (+m.localGeneration || 0) === (+infl.generation || 0));
    if (canClean && m.state !== STATE.DIVERGED && m.state !== STATE.BOOTSTRAP_HOLD){
      m.state = STATE.CLEAN; m.userChoice = null; m.adopt = null;
      stats.cleans++;
      note({ k:'CLEAN', id:String(id), rev:rev, gen:m.localGeneration });
    } else {
      note({ k:'ACK_DIRTY_KEPT', id:String(id), rev:rev, gen:m.localGeneration,
             inflGen: infl ? infl.generation : null, fpMatch: !!(infl && fp != null && String(infl.fingerprint) === fp) });
    }
    m.inFlightSave = null;
    return writeMarker(id, m);
  } catch(e){ return false; }
}
/* 任意遷移（fix705 の resolve781 / banner ボタンからのみ使う） */
function transition(id, next, patch){
  if (!id || !STATE[next]) return false;
  try {
    var m = ensureMarker(id);
    m.state = next;
    if (patch) for (var k in patch){ if (Object.prototype.hasOwnProperty.call(patch, k)) m[k] = patch[k]; }
    note({ k:'TRANSITION', id:String(id), state:next });
    return writeMarker(id, m);
  } catch(e){ return false; }
}
/* fix705 の入口 gate 用（同期・localStorage 直読・fix705 の load 前でも成立する形） */
function hold(id){
  if (!on()) return false;
  var m = readMarker(id || storyId());
  if (!m) return false;
  return m.state === STATE.DIVERGED || m.state === STATE.BOOTSTRAP_HOLD;
}

// =====================================================================
// (6) layer1 — fix654 の instance chain（v292Dfix698:316-341 と同一パターン）
//   ・pre-write に DIRTY_INTENT + gen++ を **同期で durable** に書く。
//   ・prevSet.apply が throw したら marker は巻き戻さない（false-positive dirty 容認）。
//   ・書込成功後は endTick で DIRTY_LOCAL へ enrich（非同期・fingerprint 無し）。
//   ・__v292Dfix654._native / Storage.prototype.bind の直書き（fix705 applyWrite /
//     features.importToSlot / fix721 rawSet）は **この chain を通らない** ので
//     hydration / restore / import が DIRTY を立てない（誤検知防止）。
// =====================================================================
var installed = false, installMode = 'none', prevSet = null, prevRem = null;
(function installLayer1(){
  try {
    var W = f654();
    var wrappedSet = function(k, v){
      if (on()){
        try { var id = storyId(); if (id && isStoryOwned(k, id)) markIntent(id); } catch(e){}
      }
      return prevSet ? prevSet.apply(this, arguments) : undefined;   /* ★throw はそのまま伝播 */
    };
    var wrappedRem = function(k){
      if (on()){
        try { var id = storyId(); if (id && isStoryOwned(k, id)) markIntent(id); } catch(e){}
      }
      return prevRem ? prevRem.apply(this, arguments) : undefined;
    };
    if (W && typeof W.wrap === 'function'){
      var ps = W.wrap('setItem', wrappedSet, localStorage);
      var pr = W.wrap('removeItem', wrappedRem, localStorage);
      if (typeof ps === 'function'){ prevSet = ps; installed = true; installMode = 'fix654.wrap'; }
      if (typeof pr === 'function'){ prevRem = pr; }
    }
    if (!installed){
      /* fix654 未設置環境（PC の素の状態）。fix698:333-337 と同じ fallback。 */
      prevSet = localStorage.setItem; prevRem = localStorage.removeItem;
      if (typeof prevSet === 'function'){
        localStorage.setItem = wrappedSet;
        if (typeof prevRem === 'function') localStorage.removeItem = wrappedRem;
        installed = true; installMode = 'instance-assign';
      }
    }
    if (installed){ try { console.log(TAG, 'layer1 installed via ' + installMode); } catch(e){} }
  } catch(e){ try { console.warn(TAG, 'layer1 install failed', e && e.message); } catch(_){} }
})();

// =====================================================================
// (7) Recovery Draft（IndexedDB）
//   ★localStorage には置かない。fix543 の実測（v292Dfix543:4-8）で
//     「localStorage 4.97MB / 588鍵・空き 26KB」が確認されており、
//     body の完全コピーを localStorage へ足すのは quota 事故そのもの。
//   ★IndexedDB は Storage.prototype と無関係 = fix654 accessor trap の外。
//     wrapper chain / fix543 の失敗監視 / fix490 slot-write-guard /
//     fix402 wrapSetItem / fix698 layer1 のいずれにも一切干渉しない。
//   ★auto-GC は作らない（裁定 DEFER）。
// =====================================================================
function idbOpen(cb){
  try {
    if (typeof indexedDB === 'undefined' || !indexedDB || !indexedDB.open) return cb(null, 'NO_IDB');
    var r = indexedDB.open(IDB_DB, IDB_VER);
    r.onupgradeneeded = function(){
      try { var db = r.result;
            if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE, { keyPath: 'id' });
      } catch(e){}
    };
    r.onsuccess = function(){ cb(r.result, null); };
    r.onerror   = function(){ cb(null, 'IDB_OPEN_ERROR'); };
    r.onblocked = function(){ cb(null, 'IDB_BLOCKED'); };
  } catch(e){ cb(null, 'IDB_THREW'); }
}
function idbPut(rec, cb){
  idbOpen(function(db, err){
    if (!db) return cb(false, err || 'NO_DB');
    try {
      var tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(rec);
      tx.oncomplete = function(){ try { db.close(); } catch(e){} cb(true, null); };
      tx.onerror    = function(){ try { db.close(); } catch(e){} cb(false, 'IDB_PUT_ERROR'); };
      tx.onabort    = function(){ try { db.close(); } catch(e){} cb(false, 'IDB_PUT_ABORT'); };
    } catch(e){ try { db.close(); } catch(_){} cb(false, 'IDB_PUT_THREW'); }
  });
}
function idbGet(key, cb){
  idbOpen(function(db, err){
    if (!db) return cb(null, err || 'NO_DB');
    try {
      var tx = db.transaction(IDB_STORE, 'readonly');
      var rq = tx.objectStore(IDB_STORE).get(String(key));
      rq.onsuccess = function(){ var v = rq.result || null; try { db.close(); } catch(e){} cb(v, null); };
      rq.onerror   = function(){ try { db.close(); } catch(e){} cb(null, 'IDB_GET_ERROR'); };
    } catch(e){ try { db.close(); } catch(_){} cb(null, 'IDB_GET_THREW'); }
  });
}
/* local canonical hash（schema に応じて fix697 の唯一の実装を使う。新 serializer 禁止） */
function localFingerprint(id, schema, cb){
  try {
    var W = window.__v292Dfix697;
    if (!W) return cb(null, 'NO_FIX697');
    if (schema === 2){
      if (typeof W.contentHashV2 !== 'function') return cb(null, 'NO_V2_HASH');
      return W.contentHashV2(String(id), function(h, e){ cb(h || null, h ? null : (e || 'V2_NULL')); });
    }
    if (typeof W.contentHashOf !== 'function') return cb(null, 'NO_V1_HASH');
    return W.contentHashOf(String(id), function(h, e){ cb(h || null, h ? null : (e || 'V1_NULL')); });
  } catch(e){ cb(null, 'HASH_THREW'); }
}
/* snapshot = body + sidecar 13key の **生値**（JSON 化も正規化もしない） */
function snapshotOf(id){
  var out = {}, ks = keySet(id);
  for (var i = 0; i < ks.list.length; i++){
    var k = ks.list[i];
    out[k] = ng(k);                       /* 存在しなければ null。native 読み。 */
  }
  return out;
}
function dirtyDomainsOf(id, m){
  var out = [];
  try {
    if (m && DIRTY[m.state]) out.push('LOCAL_UNCONFIRMED');
    if (m && m.inFlightSave) out.push('IN_FLIGHT_SAVE');
    var ks = keySet(id);
    if (!ks.full) out.push('KEYSET_PARTIAL');
  } catch(e){}
  return out;
}
/* Recovery Draft を作り、put → get 読み戻し → 2 条件で verified を確定する。
     ・snapshot の JSON 長が一致
     ・localFingerprint を **もう一度** 計算して stored と一致
   verified が取れるまで破壊的処理へ進ませない（呼び手が cb(ok) を待つ契約）。 */
function draftCreate(id, opts, cb){
  cb = (typeof cb === 'function') ? cb : function(){};
  if (!on()) return cb(false, 'OFF');
  var o = opts || {};
  var m = ensureMarker(id);
  var schema = (o.schema === 2) ? 2 : 1;
  localFingerprint(id, schema, function(fp, ferr){
    if (!fp) { stats.draftFails++; note({ k:'DRAFT_FAIL', id:String(id), why: ferr }); return cb(false, ferr || 'NO_FINGERPRINT'); }
    var snap = snapshotOf(id);
    var snapLen = 0;
    try { snapLen = JSON.stringify(snap).length; } catch(e){ stats.draftFails++; return cb(false, 'SNAPSHOT_STRINGIFY'); }
    var createdAt = Date.now();
    var draftId = String(id) + '_' + (+m.localGeneration || 0) + '_' + createdAt;
    var rec = {
      id: draftId,
      storyId: String(id),
      createdAt: createdAt,
      baseServerRev:  (m.lastConfirmed && typeof m.lastConfirmed.serverRev === 'number') ? m.lastConfirmed.serverRev : null,
      baseServerHash: (o.serverHash == null) ? ((m.lastConfirmed && m.lastConfirmed.fingerprint) || null) : String(o.serverHash),
      observedServerRev: (typeof o.serverRev === 'number') ? o.serverRev : null,
      localGeneration: (+m.localGeneration || 0),
      localFingerprint: fp,
      dirtyDomains: dirtyDomainsOf(id, m),
      schemaVersion: schema,
      reason: String(o.reason || ''),
      /* CASE F（true divergence）では server 側 record も畳んでおく。
         こうしておかないと「local を選ぶ」= server 側の内容が復元不能になる。 */
      serverRecord: (o.serverRecord && typeof o.serverRecord === 'object') ? o.serverRecord : null,
      snapshotLen: snapLen,
      snapshot: snap
    };
    stats.drafts++;
    idbPut(rec, function(okPut, perr){
      if (!okPut){ stats.draftFails++; note({ k:'DRAFT_FAIL', id:String(id), why: perr }); return cb(false, perr || 'PUT_FAILED'); }
      idbGet(draftId, function(back, gerr){
        if (!back){ stats.draftFails++; note({ k:'DRAFT_FAIL', id:String(id), why: gerr }); return cb(false, gerr || 'READBACK_MISSING'); }
        var lenOk = false;
        try { lenOk = (JSON.stringify(back.snapshot).length === snapLen && back.snapshotLen === snapLen); } catch(e){ lenOk = false; }
        if (!lenOk){ stats.draftFails++; note({ k:'DRAFT_FAIL', id:String(id), why:'READBACK_LEN_MISMATCH' });
                     return cb(false, 'READBACK_LEN_MISMATCH'); }
        localFingerprint(id, schema, function(fp2){
          if (!fp2 || fp2 !== back.localFingerprint){
            stats.draftFails++; note({ k:'DRAFT_FAIL', id:String(id), why:'FINGERPRINT_RECHECK_MISMATCH' });
            return cb(false, 'FINGERPRINT_RECHECK_MISMATCH');
          }
          stats.draftsVerified++;
          var mm = ensureMarker(id); mm.draftId = draftId; writeMarker(id, mm);
          note({ k:'DRAFT_VERIFIED', id:String(id), draftId: draftId, len: snapLen, gen: rec.localGeneration });
          try { console.warn(TAG, 'Recovery Draft verified:', draftId, snapLen + 'B'); } catch(e){}
          cb(true, null, draftId);
        });
      });
    });
  });
}

// =====================================================================
// (8) 最小 UX — 非モーダルバナー 1 本・ボタン 2 つだけ（巨大 UI 禁止）
//   fix543 のバナー（v292Dfix543）と同じ「画面下・非モーダル・1本」の作法。
// =====================================================================
var bannerEl = null, bannerShownFor = null;
function removeBanner(){ try { if (bannerEl && bannerEl.parentNode) bannerEl.parentNode.removeChild(bannerEl); } catch(e){} bannerEl = null; }
function banner(id, kind){
  if (!on() || !id) return false;
  if (bannerShownFor === String(id) + ':' + String(kind)) return false;   /* 1 document 1 回 */
  bannerShownFor = String(id) + ':' + String(kind);
  var build = function(){
    try {
      if (!document || !document.body) { setTimeout(build, 300); return; }
      removeBanner();
      var d = document.createElement('div');
      d.id = 'v781banner';
      d.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:100000;'
        + 'background:#1c2438;color:#dfe8ff;border:1px solid #4a6ba0;border-radius:10px;'
        + 'padding:10px 14px;font-size:13px;max-width:92vw;box-shadow:0 4px 16px rgba(0,0,0,.5);'
        + 'display:flex;gap:10px;align-items:center;flex-wrap:wrap';
      var msg = document.createElement('span');
      msg.textContent = 'クラウドと差分があります（ローカルは退避済み）';
      d.appendChild(msg);

      var b1 = document.createElement('button');
      b1.textContent = 'ローカルを退避してクラウド版を開く';
      b1.style.cssText = 'background:#4a6ba0;color:#fff;border:0;border-radius:8px;padding:5px 12px;cursor:pointer;flex:none';
      b1.onclick = function(){
        try {
          b1.disabled = true;
          var m = readMarker(id);
          /* ★verified な Draft が無ければ絶対に進めない（fail-closed） */
          if (!m || !m.draftId){ msg.textContent = 'ローカルの退避が完了していないため、まだクラウド版を開けません。'; b1.disabled = false; return; }
          idbGet(m.draftId, function(back){
            if (!back){ msg.textContent = 'ローカルの退避を確認できませんでした。中止します。'; b1.disabled = false; return; }
            var mm = ensureMarker(id);
            mm.adopt = { draftId: m.draftId, at: Date.now(), serverRev: (m.pendingServerRev == null ? null : m.pendingServerRev) };
            mm.state = STATE.CLEAN;                 /* = 裁定の CLEAN_BOOTSTRAP 扱い */
            mm.userChoice = { kind:'ADOPT_SERVER', at: Date.now() };
            writeMarker(id, mm);
            note({ k:'USER_ADOPT_SERVER', id:String(id), draftId: m.draftId });
            /* fix705 の classify は document あたり one-shot（v292Dfix705:385）なので
               その場での再実行はできない。fix705 自身が apply 後に使うのと同じ reload で収束させる。 */
            try { location.reload(); } catch(e){}
          });
        } catch(e){ b1.disabled = false; }
      };
      d.appendChild(b1);

      var b2 = document.createElement('button');
      b2.textContent = 'このままローカルで続ける';
      b2.style.cssText = 'background:#333c52;color:#dfe8ff;border:1px solid #4a6ba0;border-radius:8px;padding:5px 12px;cursor:pointer;flex:none';
      b2.onclick = function(){
        try {
          b2.disabled = true;
          var mm = ensureMarker(id);
          mm.state = STATE.DIRTY_LOCAL;
          mm.userChoice = { kind:'KEEP_LOCAL', at: Date.now(),
                            atServerRev: (mm.pendingServerRev == null ? null : mm.pendingServerRev) };
          mm.adopt = null;
          writeMarker(id, mm);
          note({ k:'USER_KEEP_LOCAL', id:String(id), atServerRev: mm.userChoice.atServerRev });
          try { location.reload(); } catch(e){}
        } catch(e){ b2.disabled = false; }
      };
      d.appendChild(b2);

      document.body.appendChild(d);
      bannerEl = d;
      stats.banners++;
      note({ k:'BANNER', id:String(id), kind:String(kind) });
    } catch(e){}
  };
  try {
    if (document && document.body) build();
    else if (document) document.addEventListener('DOMContentLoaded', build);
  } catch(e){}
  return true;
}

// =====================================================================
// (9) 公開口
// =====================================================================
window.__v292Dfix781 = {
  __armed: true, build: BUILD, STATE: STATE,
  on: on, off: off, bOff: bOff, cOff: cOff,
  storyId: storyId, markerKey: markerKey, isSelfKey: isSelfKey,
  keys: function(id){ return keySet(id || storyId()).list.slice(); },
  keySetFull: function(id){ return !!keySet(id || storyId()).full; },
  isStoryOwned: function(k, id){ var s = id || storyId(); return s ? isStoryOwned(k, s) : false; },
  marker: function(id){ return readMarker(id || storyId()); },
  state: function(id){ var m = readMarker(id || storyId()); return m ? m.state : null; },
  generation: function(id){ var m = readMarker(id || storyId()); return m ? (+m.localGeneration || 0) : 0; },
  hold: hold,
  transition: transition,
  noteInFlight: noteInFlight, refineInFlight: refineInFlight,
  clearInFlight: clearInFlight, confirm: confirm,
  draftCreate: draftCreate, draftGet: idbGet,
  banner: banner, removeBanner: removeBanner,
  installed: function(){ return { installed: installed, mode: installMode }; },
  stats: function(){ try { return JSON.parse(JSON.stringify(stats)); } catch(e){ return null; } },
  ledger: function(){ return LEDGER.slice(); },
  status: function(){
    var id = storyId();
    return { build: BUILD, on: on(), bOff: bOff(), cOff: cOff(),
             storyId: id, markerKey: id ? markerKey(id) : null,
             marker: readMarker(id), keySet: id ? keySet(id) : null,
             layer1: { installed: installed, mode: installMode },
             stats: JSON.parse(JSON.stringify(stats)) };
  },
  /* ★試験専用（production の呼び手 0）。layer1 を通さずに遷移を再現するための入口。 */
  __markIntent: function(id){ if (on() && id) markIntent(id); },
  __endTick: endTick
};
try { console.log(TAG, 'loaded (default ON / kill=v292Dfix781Off=1)'); } catch(e){}
})();
