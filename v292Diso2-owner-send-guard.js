// =====================================================================
// Chronicle TRPG - v292Diso2（統合版 iso2b）: 送信時点の「データの持ち主」と「送信先のアカウント」の照合
// ---------------------------------------------------------------------
// 裁定: GPT #125-GY（iso2）→ GPT #125-GZ（iso2b。版札 20261014-iso2b）。
//
// ■iso2b で直したこと（GPT #125-GZ）
//   (1) 所有者の印がまだ一度も無い端末に X の古いデータ（物語・画像・レシピ）が残っていて、Y が最初に開いた場合、
//       iso2 は「印が一度も切り替わっていない」ことを根拠に、古いデータを Y の物として記録して Y へ送っていた。
//       「印の記録開始後に切り替わっていない」ことは「このデータが Y のもの」の証明にならない。
//       → 記録を始める前から端末に在ったデータ（＝古いデータ）は、自動的にどのアカウントにも帰属させない（保留・消さない）。
//         ・物語・シナリオ: 帰属の記録（作成 c・最終書込み w）が無いものは帰属不明のまま。書いても記録しない。
//         ・画像・レシピ・外見文などの端末データ: 記録を始めた時点の一覧（v292iso2_legacy。key と値の指紋）に在る値は古いデータ。
//       古いデータを送ってよいのは、**サーバの既存の所有者記録で裏付けられた時だけ**（既存の読み取りの応答を読むだけ。通信は増やさない）:
//         ・物語: listshadow / getstory の行（同じ story_id）が、この端末の最後の確認（fix781 の lastConfirmed: rev と指紋）と
//           一致する（＝端末の中身はその続き）か、端末の中身の hash がサーバの content_hash と同じ。
//         ・画像: imgmanifest の行（同じ key）の hash が端末の値と同じ（その絵はもうそのアカウントのサーバに在る）。
//         ・レシピなど package に入る値・物語の本文: get（package）の応答の同じ key の値が端末の値と同じ。
//         ・外見文（fix634 の束）: そのアカウントの ns の束（GET /img）の同じ key の値が端末の値と同じ。
//       記録を始めた後に作られたデータは従来どおり: 新しい物語は作成時に c=w=作った人、画像は fix946 の持ち主の区分（印）。
//   (2) まとめ送り（package）を保留した時は、理由を 1 回だけ簡潔に表示する（既存の showToast。無ければ console）。
//   (3) HOME を先に開いた端末: 印が無くても、package の中身が全部この人のもの（記録・裏付けあり）なら送る。
//       HOME を開いたアカウントへ帰属不明のデータを紐付けることはしない。
//   (4) サーバへの申告 chrOwnerAcct を既定 ON（データを運ぶ op だけ）。古い Worker は未知の項目を読まない（静的確認済み）。
//
// ■何をするか（iso2 から変わらない部分）
//   送信の関所（fetch。/save の POST だけ）: 送る**直前**（同期）に、アカウントの整合（document 起動時の D と今の T）と
//   データの帰属を確かめ、満たさなければ送らない（通信 0・409・データは 1 byte も変えない）。
//   各モジュール（fix402 / fix399 / home）は commit 台帳の予約より前に __v292Diso2.check() を呼ぶ。
// ■止めないもの: 物語の生成・端末内の保存・表示・読み込み。
// ■kill: localStorage v292Diso2Off='1' → 何も置かない（iso1c と完全一致）。v292Diso2Expect='0' → 申告だけ止める。
// 読み込み位置: index.html は fix946 の直後。home.html は fix893 の直後。観測口: window.__v292Diso2.status()
// =====================================================================
(function(){
  'use strict';
  var W = (typeof window !== 'undefined') ? window : this;
  if (W.__v292Diso2 && W.__v292Diso2.__armed) return;
  var TAG = '[v292Diso2:owner-send-guard]';
  var BUILD = 'iso2b';
  var LS = null; try { LS = W.localStorage; } catch(e){ LS = null; }
  if (!LS) return;
  var _get = null, _set = null;
  try { _get = LS.getItem.bind(LS); _set = LS.setItem.bind(LS); } catch(e){ return; }
  function lsg(k){ try { return _get(k); } catch(e){ return null; } }
  if (lsg('v292Diso2Off') === '1') return;

  // ------------------------------------------------------------------ アカウント（fix946 と同じ式・同じタグ）
  function hash(s){ var h=0; s=String(s); for(var i=0;i<s.length;i++){ h=((h<<5)-h+s.charCodeAt(i))|0; } return Math.abs(h).toString(36); }
  function fnv(s){ var h=2166136261; s=String(s); for(var i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=(h*16777619)>>>0; } return (h>>>0).toString(36); }
  function ownerRaw(){
    var sup = '', mk = '';
    try { var f = W.__chronicleSessionId; if (typeof f === 'function') sup = String(f() || ''); } catch(e){ sup = ''; }
    var supAcct = (sup.indexOf('cookie:') === 0) ? sup.slice(7) : '';
    var mark = null; try { mark = JSON.parse(lsg('v292Dfix837_sess') || 'null'); } catch(e){ mark = null; }
    if (mark && mark.sid === 'cookie' && mark.acct) mk = String(mark.acct);
    if (supAcct && mk && supAcct !== mk) return 'conflict';
    if (supAcct || mk) return 'acct:' + (supAcct || mk);
    var em = '';
    try { if (typeof W.__chronicleGoogleEmail === 'function') em = String(W.__chronicleGoogleEmail() || ''); } catch(e){}
    if (!em) { try { var t = JSON.parse(lsg('v292GoogleToken') || 'null'); if (t && t.email) em = String(t.email); } catch(e){} }
    if (!em) { try { if (mark && mark.email) em = String(mark.email); } catch(e){} }
    if (em) return 'mail:' + em.toLowerCase();
    var p = ''; try { p = String(lsg('v292ProxyPass') || '').trim(); } catch(e){}
    if (p) return 'code:' + fnv(p) + hash(p);
    if (sup) return 'sess:' + fnv(sup);
    return 'anon';
  }
  function tagOf(raw){ return (raw === 'conflict') ? 'conflict' : ('o' + fnv(raw) + hash(raw)); }
  function isAcct(raw){ return !!raw && raw !== 'anon' && raw !== 'conflict'; }

  // ------------------------------------------------------------------ 端末の持ち主の印（fix946 が書く。ここでは読むだけ）
  var MARK_KEY = 'v292iso946_owner', Q_PREFIX = 'v292iso946_q_';
  function readMarkSt(){
    var raw;
    try { raw = _get(MARK_KEY); } catch(e){ return { st: 'unreadable' }; }
    if (raw == null) return { st: 'absent' };
    try { var o = JSON.parse(raw); if (o && o.v === 1 && typeof o.o === 'string' && o.o) return { st: 'ok', m: o }; } catch(e){}
    return { st: 'corrupt' };
  }
  function lsKeys(){ var out = []; try { var n = LS.length || 0; for (var i = 0; i < n; i++){ var k = LS.key(i); if (k != null) out.push(k); } } catch(e){} return out; }
  function f946(){ try { var F = W.__v292Dfix946; return (F && F.__armed) ? F : null; } catch(e){ return null; } }
  function f946Active(F){ try { return !!(F && typeof F.m3On === 'function' && F.m3On()); } catch(e){ return false; } }
  function f946Killed(){ return lsg('v292Dfix946Off') === '1' || lsg('v292Dfix946M3Off') === '1'; }
  /* 記録を始めた後に作られた画像系の値の持ち主＝fix946 の区分（印）の持ち主。tag のものか */
  function newImageWhy(tag){
    if (f946Killed()) return null;   /* fix946 を止めた端末は画像の持ち主の区分が無い＝本番と同じ扱い（アカウントの整合だけ） */
    var F = f946();
    if (F && f946Active(F)){
      try { if (F.fenced()) return 'IMG_FENCED:' + String((F.status && F.status().hold) || (F.status && F.status().diag && F.status().diag.fenceWhy) || '?'); if (F.bootOwner() !== tag) return 'IMG_BOOTOWNER'; } catch(e){ return 'F946_ERROR'; }
    }
    var r = readMarkSt();
    if (r.st !== 'ok') return 'IMG_MARK_' + r.st.toUpperCase();
    if (r.m.o !== tag) return 'IMG_MARK_OTHER';
    if (r.m.idbFrom) return 'IMG_MARK_IDB_PENDING';
    return null;
  }
  /* 端末まるごとの package を送ってよい端末の状態か（印が別の人・fence・退避待ちなら送らない。印が無い＝HOME を先に開いた端末は、中身の判定に任せる） */
  function deviceWhy(tag){
    if (f946Killed()) return null;
    var F = f946();
    if (F && f946Active(F)){
      try { if (F.fenced()) return 'IMG_FENCED:' + String((F.status && F.status().hold) || (F.status && F.status().diag && F.status().diag.fenceWhy) || '?'); if (F.bootOwner() !== tag) return 'IMG_BOOTOWNER'; } catch(e){ return 'F946_ERROR'; }
    }
    var r = readMarkSt();
    if (r.st === 'absent') return null;
    if (r.st !== 'ok') return 'MARK_' + r.st.toUpperCase();
    if (r.m.o !== tag) return 'MARK_OTHER';
    if (r.m.idbFrom) return 'MARK_IDB_PENDING';
    return null;
  }
  var OWNED_EXACT = ['v292Dfix400_ns', 'v292Dfix891_ns', 'v292Dfix891_nsc', 'v292Dfix523_rev',
                     'v292Dfix402_pimg', 'v292Dfix402_pimg_dead', 'v292Dfix399_imgHash', 'v292Dfix399_imgKeys',
                     'chr6_vault_hidden', 'v292avprov_v1'];
  var OWNED_PREFIX = ['v292av2_', 'v292avrec_', 'v292cvar_', 'v292cgen_', 'v292avmig_'];
  function isImageKey(k){
    k = String(k || '');
    if (OWNED_EXACT.indexOf(k) >= 0) return true;
    for (var i = 0; i < OWNED_PREFIX.length; i++) if (k.indexOf(OWNED_PREFIX[i]) === 0) return true;
    return false;
  }
  function isLegacyDeviceKey(k){ return String(k || '').indexOf('v292appr_') === 0; }
  var AIAV_PREFIX = 'chrAiAv4:', AIAV_SRVKEY = 'v292meta1_aiav';
  function isAiavKey(k){ return String(k || '').indexOf(AIAV_PREFIX) === 0; }
  /* 古いデータの一覧に載せる端末データ（物語・シナリオは帰属の記録で扱う） */
  function isInvKey(k){ return isImageKey(k) || isLegacyDeviceKey(k) || isAiavKey(k); }

  // ------------------------------------------------------------------ 値の指紋（速い・同じ値なら同じ。違う値を同じとみなす向きの誤りは「保留」側にしか倒れない）
  function fpOf(v){
    v = String(v); var n = v.length, h = 2166136261, i;
    var step = (n > 16384) ? Math.floor(n / 8192) : 1;
    for (i = 0; i < n; i += step){ h ^= v.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    for (i = Math.max(0, n - 64); i < n; i++){ h ^= v.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return 'L' + n + ':' + (h >>> 0).toString(36);
  }
  function addFp(box, k, f){ var cur = box[k]; if (cur == null || cur === '') box[k] = f; else if (('|' + cur + '|').indexOf('|' + f + '|') < 0) box[k] = cur + '|' + f; }
  function fpIn(list, f){ return list != null && ('|' + String(list) + '|').indexOf('|' + f + '|') >= 0; }
  /* Worker の画像 hash と同じ式（fix402 imgHash・Worker putimg・imgmanifest の hash） */
  function imgHash(s){ s = String(s || ''); var h = 5381; for (var i = 0; i < s.length; i++){ h = ((h << 5) + h + s.charCodeAt(i)) | 0; } return String(s.length) + ':' + (h >>> 0).toString(36); }

  // ------------------------------------------------------------------ 物語・シナリオ・外見文の帰属の記録
  var STAMP_KEY = 'v292iso2_slotown';
  var SLOT_RE = /^chr6_slot_([A-Za-z0-9_-]{1,80})$/, SC_RE = /^chr6_scenario_([A-Za-z0-9_-]{1,80})$/;
  function itemOfKey(k){
    k = String(k || '');
    if (k === 'chr6') return { kind: 's', id: 'chr6' };
    var m = SLOT_RE.exec(k); if (m) return { kind: 's', id: m[1] };
    m = SC_RE.exec(k); if (m && m[1] !== 'meta') return { kind: 'c', id: m[1] };
    return null;
  }
  function keyOfItem(it){ return it.kind === 's' ? (it.id === 'chr6' ? 'chr6' : 'chr6_slot_' + it.id) : 'chr6_scenario_' + it.id; }
  function sidNorm(id){ id = String(id); return (id === 'default') ? 'chr6' : id; }   /* fix697 は 'chr6' を 'default' と呼ぶ */
  var stampBroken = false;
  function readStamps(){
    var raw = lsg(STAMP_KEY);
    if (raw == null) return { v: 1, s: {}, c: {}, a: {} };
    try { var o = JSON.parse(raw); if (o && o.v === 1 && o.s && typeof o.s === 'object'){ if (!o.c || typeof o.c !== 'object') o.c = {}; if (!o.a || typeof o.a !== 'object') o.a = {}; stampBroken = false; return o; } } catch(e){}
    stampBroken = true;   /* 壊れた記録は上書きしない（読むだけ・どの物語も「記録なし」として扱う） */
    return null;
  }
  function writeJson(key, o){
    var s = JSON.stringify(o);
    try { _set(key, s); } catch(e){ return false; }
    return lsg(key) === s;
  }
  function writeStamps(o){ if (writeJson(STAMP_KEY, o)) return true; diag.stampErr++; return false; }

  // ------------------------------------------------------------------ 古いデータの一覧（記録を始めた時点で端末に在った端末データの key と値の指紋）
  var INV_KEY = 'v292iso2_legacy';
  var inv = null, invBroken = false, invMemOnly = false;
  function loadInv(){
    var raw = lsg(INV_KEY);
    if (raw == null) return null;
    try { var o = JSON.parse(raw); if (o && o.v === 1 && o.f && typeof o.f === 'object' && typeof o.idb === 'string') return o; } catch(e){}
    invBroken = true; return null;   /* 壊れている＝全部「古いデータ」扱い（上書きしない） */
  }
  function invNow(){ if (invMemOnly) return inv; var o = loadInv(); if (o) inv = o; return inv; }
  /* 一覧の全部の値の指紋（key を問わない）。古い値が別の key で送られても古いデータとして扱う */
  var allFpCache = { obj: null, set: null };   /* 判定 1 回の中では同じ一覧のオブジェクトを使う（ctxNow）ので、オブジェクトごとに 1 回だけ作る */
  function invAllFp(I){
    if (!I) return {};
    if (allFpCache.obj === I) return allFpCache.set;
    var set = {}; for (var k in I.f){ if (Object.prototype.hasOwnProperty.call(I.f, k)) String(I.f[k]).split('|').forEach(function(x){ if (x) set[x] = 1; }); }
    allFpCache = { obj: I, set: set }; return set;
  }
  function scanLsInv(){
    var f = {}, ks = lsKeys();
    for (var i = 0; i < ks.length; i++){
      var k = ks[i];
      if (isInvKey(k)){ var v = lsg(k); if (v != null) addFp(f, k, fpOf(v)); }
      else if (k.indexOf(Q_PREFIX) === 0){   /* fix946 の退避 blob の中身も古いデータ（戻ってきた時に新しいデータと取り違えない） */
        var b = null; try { b = JSON.parse(lsg(k) || 'null'); } catch(e){ b = null; }
        if (b && b.keys && typeof b.keys === 'object') for (var kk in b.keys){ if (Object.prototype.hasOwnProperty.call(b.keys, kk) && isInvKey(kk) && b.keys[kk] != null) addFp(f, kk, fpOf(b.keys[kk])); }
        if (b && b.older && typeof b.older === 'object') for (var ko in b.older){ if (Object.prototype.hasOwnProperty.call(b.older, ko) && isInvKey(ko) && Array.isArray(b.older[ko])) b.older[ko].forEach(function(x){ if (x != null) addFp(f, ko, fpOf(x)); }); }
      }
    }
    return f;
  }
  /* IndexedDB を読むだけで開く（無い DB は作らない: upgrade になったら中止する） */
  function idbReadAll(name, store, cb){
    var idb = null; try { idb = W.indexedDB; } catch(e){ idb = null; }
    if (!idb || typeof idb.open !== 'function') return cb({}, 'no-idb');
    var req, created = false, done = false;
    var fin = function(m, st){ if (done) return; done = true; try { cb(m, st); } catch(e){} };
    try { req = idb.open(name); } catch(e){ return fin(null, 'open-throw'); }
    req.onupgradeneeded = function(e){ created = true; try { var tx = (e && e.target && e.target.transaction) || req.transaction; if (tx) tx.abort(); } catch(_){} };
    req.onerror = function(){ fin(created ? {} : null, created ? 'absent' : 'open-error'); };
    req.onsuccess = function(){
      var db = req.result;
      if (created){ try { db.close(); } catch(e){} return fin({}, 'absent'); }
      try {
        if (!db.objectStoreNames || !db.objectStoreNames.contains(store)){ try { db.close(); } catch(e){} return fin({}, 'no-store'); }
        var out = [], cur = db.transaction(store, 'readonly').objectStore(store).openCursor();
        cur.onerror = function(){ try { db.close(); } catch(e){} fin(null, 'read-error'); };
        cur.onsuccess = function(ev){ var c = ev.target.result; if (c){ out.push([String(c.key), c.value]); c['continue'](); return; } try { db.close(); } catch(e){} fin(out, 'ok'); };
      } catch(e){ try { db.close(); } catch(_){} fin(null, 'read-throw'); }
    };
  }
  var idbScan = { st: 'idle', main: null, q: null };
  function scanIdbInv(){
    if (!inv || inv.idb === 'done' || idbScan.st === 'running') return;
    idbScan.st = 'running';
    idbReadAll('chr6av', 'imgs', function(m1, s1){
      idbScan.main = s1;
      idbReadAll('chr6av_q', 'imgs', function(m2, s2){
        idbScan.q = s2;
        try {
          var cur = invNow(); if (!cur) { idbScan.st = 'no-inv'; return; }
          var add = {}, n = 0;
          (Array.isArray(m1) ? m1 : []).forEach(function(e){ if (e[1] != null){ addFp(add, e[0], fpOf(e[1])); n++; } });
          (Array.isArray(m2) ? m2 : []).forEach(function(e){ var i = e[0].indexOf('\u0001'); if (i >= 0 && e[1] != null){ addFp(add, e[0].slice(i + 1), fpOf(e[1])); n++; } });
          var o = invMemOnly ? cur : (loadInv() || cur);
          for (var k in add){ if (Object.prototype.hasOwnProperty.call(add, k)) String(add[k]).split('|').forEach(function(x){ addFp(o.f, k, x); }); }
          var failed = (m1 === null) || (m2 === null);
          /* 読めなかった（例外）＝IndexedDB が使えない端末。fix346 もそこへは書けない＝IndexedDB の古い絵がこの document に出てくることは無い。
             'unavail' は判定では完了と同じに扱い、次の起動で読み直す（読めたら古いデータとして足す） */
          o.idb = failed ? 'unavail' : 'done'; o.idbAt = Date.now(); o.idbN = (o.idbN || 0) + n;
          inv = o;
          if (!invMemOnly && !writeJson(INV_KEY, o)) { diag.invErr++; invMemOnly = true; }
          idbScan.st = o.idb;
        } catch(e){ diag.errors++; idbScan.st = 'error'; }
      });
    });
  }

  // ------------------------------------------------------------------ サーバの所有者記録による裏付け（既存の読み取りの応答を読むだけ）
  var CORR_KEY = 'v292iso2_corr';
  function readCorr(){
    var raw = lsg(CORR_KEY);
    if (raw == null) return { v: 1, t: {} };
    try { var o = JSON.parse(raw); if (o && o.v === 1 && o.t && typeof o.t === 'object') return o; } catch(e){}
    return null;   /* 壊れていれば使わない（上書きしない） */
  }
  function corrAdd(tag, k, f){
    var o = readCorr(); if (!o) return false;
    var box = o.t[tag] || (o.t[tag] = {});
    if (fpIn(box[k], f)) return true;
    addFp(box, k, f);
    if (writeJson(CORR_KEY, o)){ diag.corr++; return true; }
    diag.corrErr++; return false;
  }
  function corrHas(o, tag, k, f){ return !!(o && o.t && o.t[tag] && fpIn(o.t[tag][k], f)); }
  /* この document の中だけで持つ応答の写し（tag ごと） */
  var seen = { man: {}, pkg: {}, ns: {} };   /* man[tag] = {k: imgHash} / pkg[tag] = {k: fp} / ns[tag] = ns */

  // ------------------------------------------------------------------ この document の持ち主（D）
  var doc0 = ownerRaw();
  var doc = { raw: doc0, tag: tagOf(doc0), bad: (doc0 === 'conflict') ? 'BOOT_CONFLICT' : null, fromAnon: false, at: null };
  var diag = { boot: doc0 === 'conflict' ? 'conflict' : (isAcct(doc0) ? 'acct' : doc0), stamped: 0, stampErr: 0, unattributedWrites: 0, hookMode: 'none',
               l1: { checks: 0, holds: 0 }, l2: { checks: 0, holds: 0, passed: 0 }, readHolds: 0, last: null, holdsByWhy: {}, expectSpliced: 0, errors: 0,
               inv: null, invErr: 0, corr: 0, corrErr: 0, backed: { e1: 0, e2: 0, pkg: 0, img: 0, aiav: 0 }, taps: 0, notice: null };
  function acctState(){
    if (doc.bad) return { ok: false, why: doc.bad };
    var raw = ownerRaw();
    if (raw === 'conflict'){ doc.bad = 'ACCOUNT_CONFLICT'; doc.at = Date.now(); return { ok: false, why: doc.bad }; }
    if (doc.raw === 'anon' && raw !== 'anon'){ doc.raw = raw; doc.tag = tagOf(raw); doc.fromAnon = true; }
    if (raw !== doc.raw){ doc.bad = 'ACCOUNT_CHANGED'; doc.at = Date.now(); return { ok: false, why: doc.bad }; }
    return { ok: true, raw: raw, tag: doc.tag };
  }
  /* この document の書込みを記録する時の持ち主＝この document の持ち主。起動時から食い違っていた document・未ログインの document は記録しない */
  function stampWriterTag(){
    if (!isAcct(doc.raw) || doc.bad === 'BOOT_CONFLICT') return null;
    return doc.tag;
  }
  /* 書込みの記録: 新しく作られた物語・シナリオ → c=w=この document の持ち主。記録のある物語 → w を更新。
     ★iso2b: 記録の無い既存の物語・シナリオ（古いデータ）に書いても記録しない（古い中身にこの人の書込みが混ざっても、持ち主は決めつけない）。
     外見文（chrAiAv4:）は 1 つの値の丸ごとの書き換えなので、書いた document の持ち主を記録する。 */
  function stampWrite(it, existedBefore){
    var me = stampWriterTag(); if (!me) return;
    var o = readStamps(); if (!o) return;
    if (it.kind === 'a'){ var ca = o.a[it.id]; if (ca && ca.w === me) return; o.a[it.id] = { w: me, at: Date.now() }; if (writeStamps(o)) diag.stamped++; return; }
    var box = o[it.kind], cur = box[it.id];
    if (cur){ if (cur.w === me) return; cur.w = me; if (writeStamps(o)) diag.stamped++; return; }
    if (existedBefore){ diag.unattributedWrites++; return; }
    box[it.id] = { c: me, w: me, at: Date.now(), by: 'create' };
    if (writeStamps(o)) diag.stamped++;
  }
  function stampServer(it, tag, by){
    var o = readStamps(); if (!o) return false;
    var box = o[it.kind]; if (box[it.id]) return false;   /* 記録が既に在れば変えない（別の人の記録を上書きしない） */
    box[it.id] = { c: tag, w: tag, at: Date.now(), by: by };
    if (writeStamps(o)){ diag.stamped++; return true; }
    return false;
  }

  // ------------------------------------------------------------------ 判定
  var OPS_PASS = { vault2visible: 1, vault2status: 1, storypassstatus: 1, status: 1, session: 1, sessionend: 1,
                   meta: 1, commitstate: 1, imgmanifest: 1, getimg: 1, imgnsinfo: 1 };
  var OPS_READ = { get: 1, getstory: 1, getfork: 1, forks: 1, listshadow: 1, getscenario: 1, listscenario: 1 };
  var OPS_DATA = { put: 1, forceput: 1, putstory: 1, putcanonical: 1, setstorytitle: 1, scrubstorycfg: 1, promotestory: 1,
                   putscenario: 1, putimg: 1, imgconfirm: 1, imgmigrate: 1 };
  var OPS_IMG = { putimg: 1, imgconfirm: 1, imgmigrate: 1 };
  var OPS_STORY_ID = { putstory: 1, putcanonical: 1, setstorytitle: 1, scrubstorycfg: 1, promotestory: 1 };
  function classOf(op){ op = String(op || ''); if (OPS_PASS[op]) return 'pass'; if (OPS_READ[op]) return 'read'; if (OPS_DATA[op]) return 'data'; return 'mutate'; }

  /* 物語・シナリオ 1 本の帰属。value: package の中の値（無ければ端末の値を読む） */
  function itemWhy(it, tag, cx, value){
    var cur = cx.stamps ? cx.stamps[it.kind][it.id] : null;
    if (cur){ if (cur.c === tag && cur.w === tag) return null; return (cur.c !== tag ? 'FOREIGN_CREATOR' : 'FOREIGN_WRITER'); }
    if (stampBroken) return 'STAMPS_BROKEN';
    /* 記録の無い古い物語: そのアカウントのサーバの package に同じ値が在れば（もうそのアカウントのもの）記録して送る */
    var key = keyOfItem(it), v = (value != null) ? String(value) : lsg(key);
    if (v != null){
      var f = fpOf(v), pk = seen.pkg[tag];
      if ((pk && pk[key] === f) || corrHas(cx.corr, tag, key, f)){
        if (stampServer(it, tag, 'server-pkg')){ diag.backed.pkg++; cx.stamps = readStamps(); }
        return null;
      }
    }
    return 'UNATTRIBUTED';
  }
  /* 端末データ 1 つ（画像・レシピ・外見文など）の帰属 */
  function valueWhy(k, v, tag, cx){
    if (v == null) return null;
    v = String(v);
    var I = cx.inv, f = fpOf(v), legacy = false, pending = false;
    if (invBroken || !I) legacy = true;
    else if (fpIn(I.f[k], f)) legacy = true;
    else if (invAllFp(I)[f]) legacy = true;   /* 同じ値が別の key で一覧に在る */
    else if (String(k).indexOf('v292av2_') === 0 && I.idb !== 'done' && I.idb !== 'unavail'){ legacy = true; pending = true; }   /* IndexedDB の一覧がまだ＝古い絵かもしれない */
    if (legacy){
      if (corrHas(cx.corr, tag, k, f)) return null;
      var mh = seen.man[tag];
      if (mh && mh[k] != null && mh[k] === imgHash(v)){ if (corrAdd(tag, k, f)) { diag.backed.img++; cx.corr = readCorr(); } return null; }
      var pk = seen.pkg[tag];
      if (pk && pk[k] === f){ if (corrAdd(tag, k, f)) { diag.backed.pkg++; cx.corr = readCorr(); } return null; }
      return pending ? 'INV_PENDING' : (invBroken ? 'INV_BROKEN' : (!I ? 'INV_MISSING' : 'LEGACY_UNVERIFIED'));
    }
    if (isAiavKey(k)){ var sa = cx.stamps ? cx.stamps.a[k] : null; return (sa && sa.w === tag) ? null : (sa ? 'AIAV_FOREIGN' : 'AIAV_UNSTAMPED'); }
    if (isLegacyDeviceKey(k)) return 'APPR_UNATTRIBUTED';   /* v292appr_ は今は書く場所が無い＝古いデータの一覧に無い値は持ち主不明 */
    return newImageWhy(tag);
  }
  function b64ToUtf8(s){
    var bin = (typeof W.atob === 'function') ? W.atob(s) : null; if (bin == null) return null;
    try { if (typeof TextDecoder !== 'undefined'){ var u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new TextDecoder('utf-8').decode(u); } } catch(e){}
    try { return decodeURIComponent(escape(bin)); } catch(e){ return bin; }
  }
  /* fix634 の外見文の束（putimg k=v292meta1_aiav）: 中の値がすべてこの人のもの */
  function bundleWhy(data, tag, cx){
    var m = /^data:application\/json;base64,(.*)$/.exec(String(data || ''));
    var o = null; try { o = m ? JSON.parse(b64ToUtf8(m[1])) : null; } catch(e){ o = null; }
    if (!o || !o.m || typeof o.m !== 'object') return 'AIAV_UNREADABLE';
    for (var k in o.m){
      if (!Object.prototype.hasOwnProperty.call(o.m, k)) continue;
      var e = o.m[k]; if (!e || e.v == null) continue;
      var w = valueWhy(k, e.v, tag, cx); if (w) return 'AIAV:' + String(k).slice(0, 24) + ':' + w;
    }
    return null;
  }
  function ctxNow(){ return { stamps: readStamps(), corr: readCorr(), inv: invNow() }; }
  /* body を見て、送ってよいなら null、送れないなら理由 */
  function judge(body, where){
    var op = body && body.op;
    var cls = classOf(op);
    if (cls === 'pass') return null;
    var a = acctState();
    if (!a.ok) return a.why;
    if (cls === 'read' || cls === 'mutate') return null;
    var tag = a.tag;
    if (!isAcct(a.raw)) return null;   /* 未ログイン（サーバが 401 で断る）＝判定しない */
    var cx = ctxNow();
    if (OPS_IMG[op]) {
      var Fi = f946(), fiOn = !!(Fi && f946Active(Fi));
      if (op === 'putimg'){
        var k = String(body.k || '');
        if (k === AIAV_SRVKEY){ var bw = bundleWhy(body.data, tag, cx); return bw ? 'IMAGE:' + bw : null; }
        if (isImageKey(k)){
          if (fiOn){ try { if (Fi.fenced()) return null; } catch(e){} }   /* fence 中は fix946 の関所の担当（iso1c と同じ応答） */
          var vw = valueWhy(k, body.data, tag, cx); return vw ? 'IMAGE:' + vw : null;
        }
      }
      /* imgconfirm / imgmigrate（端末のデータを運ばない・サーバが再検証する）・その他の key: iso2 と同じ */
      if (fiOn) return null;
      var iw = newImageWhy(tag); return iw ? 'IMAGE:' + iw : null;
    }
    if (OPS_STORY_ID[op]) { if (body.id == null) return null; var sid = sidNorm(body.id); var sw = itemWhy({ kind: 's', id: sid }, tag, cx); return sw ? 'STORY:' + sid.slice(0, 24) + ':' + sw : null; }
    if (op === 'putscenario') { if (body.id == null) return null; var cw = itemWhy({ kind: 'c', id: String(body.id) }, tag, cx); return cw ? 'SCENARIO:' + String(body.id).slice(0, 24) + ':' + cw : null; }
    if (op === 'put' || op === 'forceput'){
      var pkg = body.pkg;
      if (pkg == null) return null;   /* 組み立て前の確認（アカウントの整合だけ） */
      if (typeof pkg !== 'object') return 'PKG_UNREADABLE';
      var dw = deviceWhy(tag); if (dw) return 'PKG_DEVICE:' + dw;
      var ls = pkg.ls || {}, items = [];
      for (var lk in ls){
        if (!Object.prototype.hasOwnProperty.call(ls, lk)) continue;
        var it = itemOfKey(lk); if (it) { items.push([it, ls[lk]]); continue; }
        if (isInvKey(lk)){ var w1 = valueWhy(lk, ls[lk], tag, cx); if (w1) return 'PKG_VALUE:' + String(lk).slice(0, 28) + ':' + w1; }
      }
      if (pkg.idb && typeof pkg.idb === 'object'){
        for (var ik in pkg.idb){ if (!Object.prototype.hasOwnProperty.call(pkg.idb, ik)) continue; var w2 = valueWhy(ik, pkg.idb[ik], tag, cx); if (w2) return 'PKG_IDB:' + String(ik).slice(0, 28) + ':' + w2; }
      }
      for (var j = 0; j < items.length; j++){
        var w3 = itemWhy(items[j][0], tag, cx, items[j][1]);
        if (w3) return 'PKG_' + (items[j][0].kind === 's' ? 'STORY' : 'SCENARIO') + ':' + String(items[j][0].id).slice(0, 24) + ':' + w3;
      }
      /* 物語の一覧に、本文の無い（削除済み・ゴースト）別アカウントの物語が載っていないか（記録がある物語だけ見る） */
      if (typeof ls.chr6_slots_meta === 'string'){
        var meta = null; try { meta = JSON.parse(ls.chr6_slots_meta); } catch(e){ meta = null; }
        if (Array.isArray(meta) && cx.stamps) for (var mi = 0; mi < meta.length; mi++){
          var me = meta[mi]; if (!me || me.id == null) continue;
          var cur = cx.stamps.s[sidNorm(me.id)];
          if (cur && (cur.c !== tag || cur.w !== tag)) return 'PKG_META:' + String(me.id).slice(0, 24) + ':FOREIGN';
        }
      }
      return null;
    }
    return null;
  }

  // ------------------------------------------------------------------ 保留の理由の表示（まとめ送りだけ・document ごとに 1 回）
  var ACCT_WHY = { ACCOUNT_CHANGED: 1, ACCOUNT_CONFLICT: 1, BOOT_CONFLICT: 1, SERVER_ACCOUNT_MISMATCH: 1 };
  function whyClass(why){ var h = String(why || '').split(':')[0]; return ACCT_WHY[h] ? 'account' : 'owner'; }
  var MSG_ACCOUNT = '別のタブでアカウントが切り替わったため、この画面からはクラウドへ送りませんでした。ページを読み込み直してください（データは消していません）。';
  var MSG_OWNER = '別のアカウントのデータ、または持ち主を確かめられない古いデータが含まれるため、まとめての同期を止めています。各物語は個別に同期されます（データは消していません）。';
  function messageFor(why){ return whyClass(why) === 'account' ? MSG_ACCOUNT : MSG_OWNER; }
  /* 起動直後（既存の読み取りの応答で裏付けが付く前）の保留では出さない（その後に送れることが多い）。起動から 30 秒を過ぎてもまとめ送りを止めた時だけ出す */
  var NOTICE_GRACE_MS = 30000, bootAt = Date.now();
  function showNotice(why){
    try {
      if (diag.notice) return;
      if (Date.now() - bootAt < NOTICE_GRACE_MS){ diag.noticeDeferred = (diag.noticeDeferred || 0) + 1; return; }
      var ss = null; try { ss = W.sessionStorage; } catch(e){ ss = null; }
      var k = 'v292iso2_pkgnote_' + whyClass(why), shown = false;
      try { if (ss && ss.getItem(k) === '1') shown = true; } catch(e){}
      diag.notice = { at: Date.now(), cls: whyClass(why), shown: !shown };
      if (shown) return;
      try { if (ss) ss.setItem(k, '1'); } catch(e){}
      var msg = messageFor(why);
      try { if (typeof W.showToast === 'function'){ W.showToast(msg, false); return; } } catch(e){}
      try { if (W.UI && typeof W.UI.toast === 'function'){ W.UI.toast(msg); return; } } catch(e){}
      try { console.warn(TAG, msg); } catch(e){}
    } catch(e){}
  }
  function noteHold(layer, why, op, where){
    var b = (layer === 1) ? diag.l1 : diag.l2; b.holds++;
    var key = String(why).split(':')[0].split('(')[0];
    diag.holdsByWhy[key] = (diag.holdsByWhy[key] || 0) + 1;
    diag.last = { at: Date.now(), layer: layer, op: op || null, why: String(why).slice(0, 160), where: String(where || '').slice(0, 80) };
    try { console.log(TAG, '送信を保留（' + why + '・' + (op || '?') + '・' + (where || '') + '）: 送る中身の持ち主と送信先のアカウントを確かめられないため送りません（データは変更しません）'); } catch(e){}
    /* まとめ送り（自動の put・forceput）を止めた時は理由を出す。fix399 の「いま上げる」・HOME は自分の画面に理由を出すので、ここでは出さない */
    if ((op === 'put' || op === 'forceput') && !/^(fix399|home):/.test(String(where || ''))) showNotice(why);
  }
  /* Layer 1（各モジュールが commit 台帳の予約より前に呼ぶ）。null = 送ってよい */
  function check(body, where){
    diag.l1.checks++;
    var why;
    try { why = judge(body || {}, where); } catch(e){ diag.errors++; why = 'GUARD_ERROR'; }
    if (why) noteHold(1, why, body && body.op, where);
    return why || null;
  }

  // ------------------------------------------------------------------ 既存の読み取りの応答を読む（裏付け。書込みは帰属の記録と裏付けの記録だけ）
  function stillSame(tag){ var a = acctState(); return a.ok && a.tag === tag && isAcct(a.raw); }
  function markerOf(id){ var m = null; try { m = JSON.parse(lsg('v292Dfix402_f781g_' + id) || 'null'); } catch(e){ m = null; } return m; }
  function backStoryRow(row, tag){
    if (!row || row.id == null || row.deleted) return;
    var rid = String(row.id), sid = sidNorm(rid), it = { kind: 's', id: sid };
    var st = readStamps(); if (!st || st.s[sid]) return;           /* 記録が在る物語は変えない */
    if (lsg(keyOfItem(it)) == null) return;                          /* 端末に無い物語は記録しない */
    var rev = +row.rev, sh = (row.serverHash == null) ? '' : String(row.serverHash);
    if (!sh || !(rev >= 0)) return;
    /* E2: この端末が最後に確認したクラウドの状態（fix781 の lastConfirmed）が、このアカウントのサーバの行と同じ rev・同じ指紋 → 端末の中身はその続き */
    var mk = markerOf(rid), lc = mk && mk.lastConfirmed;
    if (lc && typeof lc.serverRev === 'number' && lc.serverRev === rev && lc.fingerprint != null && String(lc.fingerprint) === sh){
      if (stampServer(it, tag, 'server-e2')) diag.backed.e2++;
      return;
    }
    /* E1: 端末の中身の hash がサーバの content_hash と同じ（fix697 の読取専用の口） */
    var F = null; try { F = W.__v292Dfix697; } catch(e){ F = null; }
    if (!F) return;
    var fns = []; if (typeof F.contentHashV2 === 'function') fns.push('contentHashV2'); if (typeof F.contentHashOf === 'function') fns.push('contentHashOf');
    (function next(i){
      if (i >= fns.length) return;
      try { F[fns[i]](rid, function(h){ try { if (h && String(h) === sh && stillSame(tag)){ if (stampServer(it, tag, 'server-e1')) diag.backed.e1++; } else next(i + 1); } catch(e){} }); } catch(e){ next(i + 1); }
    })(0);
  }
  function tap(op, j, tag, url){
    if (!j || typeof j !== 'object' || !stillSame(tag)) return;
    diag.taps++;
    if (op === 'meta' || op === 'imgmanifest'){
      var ns = (typeof j.activeNs === 'string' && j.activeNs) ? j.activeNs : (typeof j.ns === 'string' ? j.ns : null);
      if (ns) seen.ns[tag] = ns;
      if (op === 'imgmanifest' && j.manifest && typeof j.manifest === 'object'){
        var man = seen.man[tag] || (seen.man[tag] = {});
        for (var k in j.manifest){ if (Object.prototype.hasOwnProperty.call(j.manifest, k)){ var r = j.manifest[k]; if (r && r.hash != null) man[k] = String(r.hash); } }
      }
      return;
    }
    if (op === 'get'){
      var ls = j.data && j.data.ls; if (!ls || typeof ls !== 'object') return;
      var pk = seen.pkg[tag] = {};
      for (var lk in ls){ if (Object.prototype.hasOwnProperty.call(ls, lk) && ls[lk] != null && (isInvKey(lk) || itemOfKey(lk))) pk[lk] = fpOf(ls[lk]); }
      return;
    }
    if (op === 'listshadow' && Array.isArray(j.stories)){ j.stories.forEach(function(row){ try { backStoryRow(row, tag); } catch(e){ diag.errors++; } }); return; }
    if (op === 'getstory' && j.ok && j.id != null){ backStoryRow({ id: j.id, rev: j.rev, serverHash: j.serverHash, deleted: j.deleted }, tag); return; }
    if (op === 'GET_AIAV' && j.m && typeof j.m === 'object'){
      for (var ak in j.m){
        if (!Object.prototype.hasOwnProperty.call(j.m, ak) || !isAiavKey(ak)) continue;
        var e = j.m[ak], lv = lsg(ak); if (!e || e.v == null || lv == null || String(e.v) !== lv) continue;
        if (corrAdd(tag, ak, fpOf(lv))) diag.backed.aiav++;
      }
    }
  }
  function tapResp(pr, op, tag, url){
    try {
      return pr.then(function(r){
        try {
          if (r && r.ok && typeof r.clone === 'function'){
            var c = r.clone();
            if (op === 'GET_AIAV'){ if (typeof c.text === 'function') c.text().then(function(t){ var o = null; try { o = JSON.parse(t); } catch(e){ o = null; } try { tap(op, o, tag, url); } catch(e){ diag.errors++; } }, function(){}); }
            else if (typeof c.json === 'function') c.json().then(function(j){ try { tap(op, j, tag, url); } catch(e){ diag.errors++; } }, function(){});
          }
        } catch(e){}
        return r;
      });
    } catch(e){ return pr; }
  }
  var TAP_OPS = { meta: 1, imgmanifest: 1, get: 1, listshadow: 1, getstory: 1 };

  // ------------------------------------------------------------------ 送信の関所（Layer 2・最後の関所）
  function synth(status, obj){
    var txt = JSON.stringify(obj || {});
    try { if (typeof Response === 'function') return new Response(txt, { status: status, headers: { 'Content-Type': 'application/json' } }); } catch(e){}
    return { ok: false, status: status, json: function(){ return Promise.resolve(obj || {}); }, text: function(){ return Promise.resolve(txt); },
             headers: { get: function(h){ return String(h).toLowerCase() === 'content-type' ? 'application/json' : null; } },
             arrayBuffer: function(){ return Promise.resolve(new ArrayBuffer(0)); }, body: { cancel: function(){} }, clone: function(){ return this; } };
  }
  function refusal(op, why){
    if (OPS_IMG[op]) return synth(409, { ok: false, errorCode: 'OWNER_FENCED' });   /* fix946 の関所と同じ応答（画像系のモジュールの扱いを変えない） */
    return synth(409, { ok: false, error: messageFor(why),
                        errorCode: 'OWNER_GUARD_HOLD', retryable: false, blockedBeforeSend: true, iso2: true, why: String(why).slice(0, 120) });
  }
  function urlOf(input){ try { return (typeof input === 'string') ? input : (input && input.url) || String(input || ''); } catch(e){ return ''; } }
  var OP_HEAD = /^\{\s*"op"\s*:\s*"([A-Za-z0-9_]{1,40})"/;
  /* ★iso2b: 申告は既定 ON（v292Diso2Expect='0' の時だけ止める） */
  function expectOn(){ return lsg('v292Diso2Expect') !== '0'; }
  function spliceExpect(s, acctRaw){
    if (acctRaw.indexOf('acct:') !== 0) return s;
    if (s.charAt(0) !== '{') return s;
    diag.expectSpliced++;
    return '{"chrOwnerAcct":' + JSON.stringify(acctRaw.slice(5)) + (/^\{\s*\}$/.test(s) ? '' : ',') + s.slice(1);
  }
  var installed = false;
  (function(){
    try {
      var nf = W.fetch;
      if (typeof nf !== 'function') return;
      var g = function(input, init){
        var args = arguments, self = (this === g ? W : this);
        try {
          var u = urlOf(input);
          if (/\/save(\?|$)/.test(u) && init && typeof init.body === 'string'){
            var s = init.body, m = OP_HEAD.exec(s), op = m ? m[1] : null, parsed = null;
            if (!op){ try { parsed = JSON.parse(s); op = parsed && parsed.op; } catch(e){ op = null; } }
            var cls = classOf(op);
            if (cls !== 'pass'){
              var F = f946(), deferTo946 = false;
              if (OPS_IMG[op] && F && f946Active(F)) { try { deferTo946 = !!F.fenced(); } catch(e){ deferTo946 = false; } }
              if (!deferTo946){
                diag.l2.checks++;
                if (cls === 'data' && !parsed){ try { parsed = JSON.parse(s); } catch(e){ parsed = null; } }
                var why = null;
                try { why = (cls === 'data' && !parsed) ? 'BODY_UNREADABLE' : judge(parsed || { op: op }, 'fetch'); } catch(e){ diag.errors++; why = 'GUARD_ERROR'; }
                if (why){ if (cls === 'read') diag.readHolds++; noteHold(2, why, op, 'fetch'); return Promise.resolve(refusal(op, why)); }
                diag.l2.passed++;
                if (expectOn() && cls === 'data'){
                  var raw = ownerRaw();
                  if (isAcct(raw) && raw === doc.raw && raw.indexOf('acct:') === 0){
                    var ni = {}; for (var kk in init) if (Object.prototype.hasOwnProperty.call(init, kk)) ni[kk] = init[kk];
                    ni.body = spliceExpect(s, raw);
                    return watchResp(nf.call(self, input, ni));
                  }
                }
              }
            }
            /* 裏付けに使う既存の読み取り（この document のアカウントが確かな時だけ）。応答はそのまま呼び出し元へ返す */
            if (TAP_OPS[op]){ var a0 = acctState(); if (a0.ok && isAcct(a0.raw)) return tapResp(nf.apply(self, args), op, a0.tag, u); }
          } else if (/\/img\?/.test(u) && u.indexOf('k=' + AIAV_SRVKEY) >= 0){
            var a1 = acctState(), nsm = /[?&]ns=([^&]+)/.exec(u), nsv = nsm ? decodeURIComponent(nsm[1]) : null;
            if (a1.ok && isAcct(a1.raw) && nsv && seen.ns[a1.tag] === nsv) return tapResp(nf.apply(self, args), 'GET_AIAV', a1.tag, u);
          }
        } catch(e){ diag.errors++; }
        return nf.apply(self, args);
      };
      /* 申告（chrOwnerAcct）を付けて送った時だけ: Worker が「申告と認証が違う」（OWNER_ACCOUNT_MISMATCH）と断ったら、この document は以後送らない */
      var watchResp = function(pr){
        try { return pr.then(function(r){ try { if (r && r.status === 409 && typeof r.clone === 'function') r.clone().json().then(function(j){ if (j && j.errorCode === 'OWNER_ACCOUNT_MISMATCH' && !doc.bad){ doc.bad = 'SERVER_ACCOUNT_MISMATCH'; doc.at = Date.now(); } }, function(){}); } catch(e){} return r; }); } catch(e){ return pr; }
      };
      g.__iso2 = true;
      W.fetch = g;
      installed = (W.fetch === g);
    } catch(e){}
  })();

  // ------------------------------------------------------------------ 書込みの記録（物語の本文・シナリオ・外見文だけ。書込みは先に通す）
  function itemForWrite(k){
    if (typeof k !== 'string') return null;
    var c0 = k.charCodeAt(0);
    if (c0 === 99 /* c */){
      if (k.indexOf('chr6') === 0) return itemOfKey(k);
      if (k.indexOf(AIAV_PREFIX) === 0) return { kind: 'a', id: k };
    }
    return null;
  }
  (function(){
    try {
      var below = LS.setItem;
      var w2 = function(k, v){
        var it = null, existed = false;
        try { it = itemForWrite(k); if (it && it.kind !== 'a') existed = (_get(k) != null); } catch(e){ it = null; }
        var r = below.apply(this, arguments);
        if (it){ try { stampWrite(it, existed); } catch(e){ diag.errors++; } }
        return r;
      };
      w2.__iso2 = true;
      LS.setItem = w2;
      var took = false; try { took = (LS.setItem === w2); } catch(e){ took = false; }
      if (took){ diag.hookMode = 'instance'; return; }
      /* インスタンスへの代入が効かない端末（iOS で fix654 が外れた型）: Storage.prototype に置く（this === localStorage の時だけ） */
      var SP = (W.Storage && W.Storage.prototype) || null;
      if (!SP || typeof SP.setItem !== 'function') { diag.hookMode = 'none-no-proto'; return; }
      var ps = SP.setItem;
      var gs = function setItem(k, v){
        var it = null, existed = false;
        try { if (this === LS){ it = itemForWrite(k); if (it && it.kind !== 'a') existed = (_get(k) != null); } } catch(e){ it = null; }
        var r = ps.apply(this, arguments);
        if (it){ try { stampWrite(it, existed); } catch(e){ diag.errors++; } }
        return r;
      };
      gs.__iso2 = true;
      SP.setItem = gs;
      diag.hookMode = (SP.setItem === gs) ? 'proto' : 'none-proto-failed';
    } catch(e){ diag.hookMode = 'error'; }
  })();

  // ------------------------------------------------------------------ 起動: 古いデータの一覧（無ければ作る。LS は今、IndexedDB は非同期）
  try {
    var i0 = loadInv();
    if (i0){ inv = i0; diag.inv = 'loaded'; }
    else if (invBroken){ diag.inv = 'broken'; }
    else {
      inv = { v: 1, at: Date.now(), f: scanLsInv(), idb: 'pending', by: BUILD };
      if (writeJson(INV_KEY, inv)) diag.inv = 'created';
      else { invMemOnly = true; diag.invErr++; diag.inv = 'mem-only'; }   /* 書けない（満杯など）: この document だけ一覧を持つ。次の起動で作り直す（その時の全データが古いデータ側＝保留側） */
    }
    if (inv && inv.idb !== 'done') scanIdbInv();
  } catch(e){ diag.errors++; }
  try { if (typeof W.addEventListener === 'function') W.addEventListener('storage', function(ev){ try { if (!ev || !ev.key || /v292Dfix837_sess|v292GoogleToken|v292ProxyPass/.test(ev.key)) acctState(); } catch(e){} }); } catch(e){}

  /* 読むだけの観測口: 帰属不明のまま残っているデータの数（送るのを保留している候補） */
  function pendingSummary(){
    var a = acctState(); var tag = a.ok ? a.tag : null; var cx = ctxNow();
    var out = { stories: 0, scenarios: 0, values: 0, sample: [] };
    if (!tag) return out;
    lsKeys().forEach(function(k){
      var it = itemOfKey(k), w = null;
      try { if (it) w = itemWhy(it, tag, cx); else if (isInvKey(k)) w = valueWhy(k, lsg(k), tag, cx); } catch(e){ w = 'ERR'; }
      if (!w) return;
      if (it && it.kind === 's') out.stories++; else if (it) out.scenarios++; else out.values++;
      if (out.sample.length < 6) out.sample.push(String(k).slice(0, 32) + ':' + String(w).slice(0, 24));
    });
    return out;
  }
  W.__v292Diso2 = {
    __armed: true, TAG: TAG, build: BUILD,
    check: check,
    messageFor: messageFor,
    owner: function(){ return { doc: doc.tag, docKind: isAcct(doc.raw) ? doc.raw.split(':')[0] : doc.raw, bad: doc.bad, fromAnon: doc.fromAnon, now: tagOf(ownerRaw()) }; },
    stampOf: function(id, kind){ var o = readStamps(); return o ? (o[kind === 'c' ? 'c' : (kind === 'a' ? 'a' : 's')][String(id)] || null) : null; },
    pending: pendingSummary,
    status: function(){ var m = readMarkSt(), I = invNow(); return { build: BUILD, installed: installed, hook: diag.hookMode, doc: doc.tag, bad: doc.bad, consistent: !doc.bad && ownerRaw() === doc.raw,
                                                       mark: m.st === 'ok' ? { o: m.m.o, why: m.m.why, idbFrom: m.m.idbFrom || null } : m.st, stampBroken: stampBroken, expect: expectOn(),
                                                       inv: invBroken ? 'broken' : (I ? { idb: I.idb, n: Object.keys(I.f).length, memOnly: invMemOnly } : null), idbScan: idbScan.st,
                                                       diag: JSON.parse(JSON.stringify(diag)) }; }
  };
  try { console.log(TAG, 'armed', JSON.stringify({ build: BUILD, boot: diag.boot, hook: diag.hookMode, fetch: installed, inv: diag.inv })); } catch(e){}
})();
