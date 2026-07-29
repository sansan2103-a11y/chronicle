// =====================================================================
// Chronicle TRPG - v292Dfix638: pull側の画像ガード（blobで既存アイコンを上書きしない）
// ---------------------------------------------------------------------
// ■何を直すのか（保存層の機序・2026-07-29に現コードで確認）
//   v292Dfix399-cloudsync.js:993  applySave() の
//       return idbWriteAll(pkg.idb || {})
//   は、クラウドの save blob に入っていた画像で **ローカルIDBの既存キーを無条件に上書き**する
//   （idbWriteAll → idbPutAllOneTx → objectStore.put(map[k], k)。存在確認は一切していない）。
//   blob(op:put の pkg.idb)は「キー集合が変わった時だけ」しか更新されない設計だったため、
//   再生成した絵は blob には載らず**古いまま固定**される。その古い blob が pull で降ってきて
//   ローカルの新しい絵を潰す ＝ おしんの症状「アイコンが以前のものへ戻る」。
//
// ■GPT裁定（画像の正本は per-key チャネル）
//   正本 = D1 images テーブル + imageRev（op:putimg / op:imgmanifest / GET /img）。
//          伝播は fix523（版差分）と fix633（全在庫スイープ）が担う。
//   blob(pkg.idb) は **正本ではなく、最後の受け皿（recovery source）** に格下げする。
//
// ■このモジュールの判定（normal-sync のとき。優先順は GPT 指定のまま）
//   ①ローカルに実体がある            → 書かない（skip: local-exists）★最重要の不変条件
//   ②削除墓標がある                  → 書かない（skip: tombstone）
//   ③per-key remote に該当キーがある  → 書かない（skip: per-key-remote。rev/hash規則に委ねる）
//   ④いま必要とされていない          → 書かない（skip: not-needed。無関係な絵を復活させない）
//   ⑤上記以外（不在＋必要＋墓標なし）→ **補充候補として書く**（allow: recovery-candidate）
//      書いたキーは per-key チャネルへの backfill 対象として記録し、後で fix523.pushOne で
//      正本へ昇格させる（v292Dfix638_backfill）。
//
// ■モード分離（GPT指定・fix564 と selfHeal を壊さない）
//   normal-sync     … fix399.applySave 経由の通常pull。上の判定を適用する。
//   explicit-restore… fix564 スナップショット復元など、ユーザー意思＋manifest照合＋退避のある経路。
//                     **素通し**（従来どおり置換できる）。※そもそもこの関数を通らない。
//   self-heal       … fix399.selfHeal（idbPutAllOneTx 直呼び）。**素通し**。※この関数を通らない。
//   → 「idbWriteMissingOnly で一律置換」はしない。判定は normal-sync のときだけ効く。
//
// ■直列化（GPT指定5・凝りすぎない）
//   per-key適用(fix523.pullOne/pushOne)と blob適用(applySave)が同時に走ると後勝ちになる。
//   共通の single-flight ロック（W.__chronicleImgApplyLock）を1本だけ置き、
//   ・blob適用は書込みの間だけロックを取る
//   ・fix523 の公開 pullOne/pushOne は、ロック中なら短く待ってから走る（最大 ~1.5秒）
//   完全な排他はしない。後勝ちの窓を狭めれば足りる。
//
// ■fix399 への変更（最小・行単位）
//   ・idbWriteGuarded() を1関数追加（未ロード/OFF なら従来どおり idbWriteAll を呼ぶだけ）
//   ・applySave の呼び出し1行を idbWriteAll → idbWriteGuarded へ
//   それ以外は1バイトも変えていない。
//
// ■期待集合(v292Dfix399_imgKeys)を縮めない
//   idbWriteAll は saveExpectedImgKeys(渡されたキー) で期待集合を**置換**する。
//   ガードで渡すキーが減ると期待集合が縮み、fix631 が守っている単調性（縮めない＝削除処理を
//   新設しない）を壊す。→ このモジュールが union(既存, blobの全キー) を書き戻して単調性を保つ。
//
// 緊急OFF: localStorage.v292Dfix638Off='1'
//   → ラップも配線もせず on()=false。fix399 は idbWriteAll をそのまま呼ぶ＝**fix637時点と同一挙動**。
// 補助OFF: v292Dfix638BackfillOff='1'（補充キーの正本昇格だけ止める）
//          v292Dfix638LockOff='1'（fix523 の直列化ラップだけ止める）
// 冪等ガード: window.__v292Dfix638.__armed
// 検証口: __v292Dfix638.status() / .lastDecision() / .backlog() / .plan(mapKeys)
// =====================================================================
(function(){
  'use strict';
  var W = (typeof window !== 'undefined') ? window : this;
  if (W.__v292Dfix638 && W.__v292Dfix638.__armed) return;
  var TAG = '[v292Dfix638:pull-image-guard]';
  var PREFIX     = 'v292av2_';
  var EXPECT_KEY = 'v292Dfix399_imgKeys';
  var TOMB_KEY   = 'v292Dfix638_tomb';
  var BACKFILL   = 'v292Dfix638_backfill';
  var DIAG       = 'v292Dfix638_diag';
  var RECIPE_RE  = /^v292avrec_/;
  var BACKFILL_MAX = 200;

  function lsg(k){ try { return W.localStorage.getItem(k); } catch(e){ return null; } }
  function lss(k, v){ try { W.localStorage.setItem(k, v); return true; } catch(e){ return false; } }
  function off(){ return lsg('v292Dfix638Off') === '1'; }
  function on(){ return !off(); }
  function backfillOff(){ return lsg('v292Dfix638BackfillOff') === '1'; }
  function lockOff(){ return lsg('v292Dfix638LockOff') === '1'; }
  function full(k){ k = String(k || ''); return k.indexOf(PREFIX) === 0 ? k : (PREFIX + k); }
  function bare(k){ k = String(k || ''); return k.indexOf(PREFIX) === 0 ? k.slice(PREFIX.length) : k; }

  /* ---------- 共通 single-flight ロック（画像適用の直列化） ----------
     ★完全な排他ではない。ロックが古くなったら（LOCK_TTL）自動で開放する。
       ここで待ち続けると、片方が落ちたときに画像更新が永久に止まるため。 */
  var LOCK_TTL = 8000, WAIT_MS = 150, WAIT_TRIES = 10;
  var lockOwner = null, lockAt = 0, lockSeq = 0;
  function lockHeld(){
    if (lockOwner && (Date.now() - lockAt) > LOCK_TTL){
      try { console.warn(TAG, 'lock expired (owner=' + lockOwner + ') → 強制開放'); } catch(e){}
      lockOwner = null;
    }
    return !!lockOwner;
  }
  function lockAcquire(owner){
    if (lockHeld()) return null;
    lockOwner = String(owner || '?'); lockAt = Date.now(); lockSeq++;
    var mine = lockSeq;
    return function release(){ if (lockSeq === mine){ lockOwner = null; } };
  }
  /* ロックが空くのを短く待ってから run を呼ぶ。待ちきれなければ**そのまま走らせる**
     （後勝ちの窓を狭めるのが目的で、止めるのが目的ではない）。 */
  function serialize(owner, run){
    var tries = 0;
    (function attempt(){
      var rel = lockAcquire(owner);
      if (rel){ run(rel); return; }
      if (++tries > WAIT_TRIES){ run(function(){}); return; }
      try { setTimeout(attempt, WAIT_MS); } catch(e){ run(function(){}); }
    })();
  }
  function serializeP(owner, runP){
    return new Promise(function(res, rej){
      serialize(owner, function(rel){
        var p; try { p = runP(); } catch(e){ rel(); rej(e); return; }
        Promise.resolve(p).then(function(v){ rel(); res(v); }, function(e){ rel(); rej(e); });
      });
    });
  }
  var LOCK = { held: lockHeld, acquire: lockAcquire, owner: function(){ return lockHeld() ? lockOwner : null; },
               serialize: serialize, serializeP: serializeP };
  try { if (!W.__chronicleImgApplyLock) W.__chronicleImgApplyLock = LOCK; } catch(e){}

  /* ---------- localStorage のキー列挙（fix346 は length/key(i) をラップしていない） ---------- */
  function lsKeys(){
    var out = [], seen = Object.create(null), i, k;
    try {
      var n = W.localStorage.length || 0;
      for (i = 0; i < n; i++){ k = W.localStorage.key(i); if (k && !seen[k]){ seen[k] = 1; out.push(k); } }
    } catch(e){}
    if (!out.length){
      try {
        var ks = Object.keys(W.localStorage) || [];
        for (i = 0; i < ks.length; i++){ k = ks[i]; if (k && !seen[k]){ seen[k] = 1; out.push(k); } }
      } catch(e){}
    }
    return out;
  }

  /* ---------- ローカル在庫（3経路の union。false-empty で上書きしないため） ----------
     ①fix399 の idbReadKeys（IDBの実キー。失敗時は [] を返す＝空と区別できない）
     ②fix631 の在庫キャッシュ __v292av.keys()（IDB由来 ∪ 生localStorage）
     ③fix346 のラッパ経由 localStorage.getItem（mem キャッシュ＝同期で確実）
     どれか1つでも「ある」と言えば **ある** 扱いにする（上書き側へ倒さない）。 */
  function localFromInventory(){
    var out = Object.create(null);
    try {
      if (W.__v292av && typeof W.__v292av.keys === 'function'){
        var ks = W.__v292av.keys() || [];
        for (var i = 0; i < ks.length; i++) out[full(ks[i])] = 1;
      }
    } catch(e){}
    return out;
  }
  function localFromMem(keys){
    var out = Object.create(null);
    for (var i = 0; i < keys.length; i++){
      var k = full(keys[i]);
      var v = null; try { v = W.localStorage.getItem(k); } catch(e){ v = null; }
      if (typeof v === 'string' && v.indexOf('data:') === 0) out[k] = 1;
    }
    return out;
  }
  function gatherLocal(prim, mapKeys){
    var base = localFromInventory();
    var mem = localFromMem(mapKeys);
    for (var k in mem) base[k] = 1;
    var readKeys = prim && typeof prim.readKeys === 'function' ? prim.readKeys : null;
    if (!readKeys) return Promise.resolve(base);
    return Promise.resolve(readKeys()).then(function(ks){
      try { for (var i = 0; i < (ks || []).length; i++) base[full(ks[i])] = 1; } catch(e){}
      return base;
    }, function(){ return base; });
  }

  /* ---------- per-key remote（fix633 の manifest キャッシュを共用・往復を増やさない） ----------
     取れなければ null（=不明）。不明のときは「per-key remote なし」と断定しない。
     ただし**不在キーの補充**は不明でも許す（不在＝上書きが起きない＝症状を再発させない）。 */
  var MAN_WAIT = 4000;
  function gatherRemote(){
    return new Promise(function(res){
      var done = false;
      function fin(v){ if (done) return; done = true; res(v); }
      try { setTimeout(function(){ fin(null); }, MAN_WAIT); } catch(e){}
      try {
        var f = W.__v292Dfix633;
        if (!f || typeof f.manifest !== 'function'){ fin(null); return; }
        f.manifest(function(man){
          if (!man){ fin(null); return; }
          var out = Object.create(null);
          try { Object.keys(man).forEach(function(mk){ if (String(mk).indexOf(PREFIX) === 0) out[mk] = 1; }); } catch(e){}
          fin(out);
        });
      } catch(e){ fin(null); }
    });
  }

  /* ---------- 「いま必要とされている画像か」 ----------
     ①期待集合 v292Dfix399_imgKeys（fix631 が実在庫で単調にシードしている）
     ②画面に映っている img[data-avpk]
     ③レシピ v292avrec_<pk> があるキャラ（＝実在するキャラ。取り込み直後は
       クラウド由来のレシピが既に localStorage へ書かれているので、初回端末でも効く）
     ★③が要。これが無いと「一度も取り込んでいない新品の端末」で needed が空になり、
       blob からの復元が丸ごと止まる（＝新規端末の復元が壊れる）。 */
  function neededKeys(){
    var out = Object.create(null), i;
    try {
      var exp = JSON.parse(lsg(EXPECT_KEY) || '[]') || [];
      if (Object.prototype.toString.call(exp) === '[object Array]')
        for (i = 0; i < exp.length; i++) out[full(exp[i])] = 1;
    } catch(e){}
    try {
      if (typeof document !== 'undefined' && document.querySelectorAll){
        var imgs = document.querySelectorAll('img[data-avpk]');
        for (i = 0; i < imgs.length; i++){ var pk = imgs[i].getAttribute('data-avpk'); if (pk) out[full(pk)] = 1; }
      }
    } catch(e){}
    try {
      var ks = lsKeys();
      for (i = 0; i < ks.length; i++){ if (RECIPE_RE.test(ks[i])) out[full(ks[i].replace(RECIPE_RE, ''))] = 1; }
    } catch(e){}
    return out;
  }

  /* ---------- 削除墓標 ----------
     ★2026-07-29時点、この製品にアイコン単位の削除経路は**存在しない**（棚卸し済み）。
       よってこの集合は通常いつも空。将来 削除を作ったときに、blob からの復活で
       黙って蘇らないよう、受け口だけ先に用意しておく。 */
  function tombKeys(){
    var out = Object.create(null), i;
    try {
      var a = JSON.parse(lsg(TOMB_KEY) || '[]') || [];
      if (Object.prototype.toString.call(a) === '[object Array]')
        for (i = 0; i < a.length; i++) out[full(a[i])] = 1;
    } catch(e){}
    try {
      var svc = W.__chronicleImgTombstones;
      if (svc && typeof svc.keys === 'function'){
        var ks = svc.keys() || [];
        for (i = 0; i < ks.length; i++) out[full(ks[i])] = 1;
      }
    } catch(e){}
    return out;
  }

  /* ---------- 判定本体（純関数・副作用なし・テストの契約はここ） ---------- */
  function classify(input){
    input = input || {};
    var mode = input.mode || 'normal-sync';
    var keys = input.keys || [];
    var local = input.local || {};
    var remote = input.remote;                 // null = 不明
    var needed = input.needed || {};
    var tomb = input.tomb || {};
    var allow = [], skip = [], recover = [], why = Object.create(null);
    for (var i = 0; i < keys.length; i++){
      var k = full(keys[i]), w;
      if (mode !== 'normal-sync'){ w = 'mode-bypass'; allow.push(k); why[k] = w; continue; }
      if (local[k]){ w = 'local-exists'; skip.push(k); why[k] = w; continue; }
      if (tomb[k]){ w = 'tombstone'; skip.push(k); why[k] = w; continue; }
      if (remote && remote[k]){ w = 'per-key-remote'; skip.push(k); why[k] = w; continue; }
      if (!needed[k]){ w = 'not-needed'; skip.push(k); why[k] = w; continue; }
      w = 'recovery-candidate'; allow.push(k); recover.push(k); why[k] = w;
    }
    return { mode: mode, total: keys.length, allow: allow, skip: skip, recover: recover,
             why: why, remoteKnown: !!remote,
             counts: (function(){
               var c = Object.create(null);
               for (var k2 in why){ c[why[k2]] = (c[why[k2]] || 0) + 1; }
               return c;
             })() };
  }

  /* ---------- 期待集合の単調性を守る ---------- */
  function unionExpected(mapKeys, tomb){
    var seen = Object.create(null), out = [], i, k;
    try {
      var cur = JSON.parse(lsg(EXPECT_KEY) || '[]') || [];
      if (Object.prototype.toString.call(cur) === '[object Array]')
        for (i = 0; i < cur.length; i++){ k = String(cur[i] || ''); if (k && !seen[k]){ seen[k] = 1; out.push(k); } }
    } catch(e){}
    for (i = 0; i < mapKeys.length; i++){
      k = full(mapKeys[i]);
      if (tomb && tomb[k]) continue;            /* 墓標のキーは期待集合へ入れない */
      if (!seen[k]){ seen[k] = 1; out.push(k); }
    }
    out.sort();
    lss(EXPECT_KEY, JSON.stringify(out));
    return out.length;
  }

  /* ---------- backfill（補充で書いたキーを per-key 正本へ昇格） ---------- */
  function backlog(){
    try { var a = JSON.parse(lsg(BACKFILL) || '[]') || []; return (Object.prototype.toString.call(a) === '[object Array]') ? a : []; }
    catch(e){ return []; }
  }
  function backlogAdd(keys){
    if (!keys || !keys.length) return 0;
    var cur = backlog(), seen = Object.create(null), i;
    for (i = 0; i < cur.length; i++) seen[cur[i]] = 1;
    var added = 0;
    for (i = 0; i < keys.length; i++){ var k = full(keys[i]); if (!seen[k]){ seen[k] = 1; cur.push(k); added++; } }
    if (cur.length > BACKFILL_MAX) cur = cur.slice(cur.length - BACKFILL_MAX);
    lss(BACKFILL, JSON.stringify(cur));
    return added;
  }
  function backlogDrop(k){
    var cur = backlog(), out = [], kk = full(k);
    for (var i = 0; i < cur.length; i++){ if (cur[i] !== kk) out.push(cur[i]); }
    lss(BACKFILL, JSON.stringify(out));
  }
  var BACKFILL_BATCH = 3, backfilling = false;
  function flushBackfill(done){
    if (!on() || backfillOff() || backfilling){ if (done) done(null); return; }
    var f = null; try { f = W.__v292Dfix523; } catch(e){}
    if (!f || typeof f.pushOne !== 'function'){ if (done) done(null); return; }
    try { if (typeof f.on === 'function' && !f.on()){ if (done) done(null); return; } } catch(e){ if (done) done(null); return; }
    var list = backlog().slice(0, BACKFILL_BATCH);
    if (!list.length){ if (done) done({ pushed: 0, left: 0 }); return; }
    backfilling = true;
    var i = 0, pushed = 0;
    (function next(){
      if (i >= list.length){
        backfilling = false;
        if (done) done({ pushed: pushed, left: backlog().length });
        return;
      }
      var k = list[i++];
      var cont = function(){ backlogDrop(k); pushed++; try { setTimeout(next, 150); } catch(e){ next(); } };
      try { f.pushOne(bare(k), cont); } catch(e){ cont(); }
    })();
  }

  /* ---------- 診断（小さく・上書き） ---------- */
  var lastDecision = null;
  function noteDecision(v, ctx, extra){
    lastDecision = { at: Date.now(), path: (ctx && ctx.path) || '?', mode: v.mode,
                     total: v.total, allowed: v.allow.length, skipped: v.skip.length,
                     recovered: v.recover.length, remoteKnown: v.remoteKnown,
                     counts: v.counts, sample: v.skip.slice(0, 6) };
    if (extra) for (var k in extra) lastDecision[k] = extra[k];
    lss(DIAG, JSON.stringify(lastDecision));
    try { console.log(TAG, 'apply-guard', JSON.stringify(lastDecision.counts),
                      'allow=' + lastDecision.allowed + '/' + lastDecision.total); } catch(e){}
  }

  /* ---------- fix399 から呼ばれる本体 ---------- */
  function guardedWrite(map, ctx, prim){
    map = map || {};
    prim = prim || {};
    var writeAll = (typeof prim.writeAll === 'function') ? prim.writeAll : function(){ return Promise.resolve(0); };
    var keys = Object.keys(map);
    var mode = (ctx && ctx.mode) || 'normal-sync';
    /* OFF / 明示復元 / 自己修復 は素通し＝fix637時点の挙動 */
    if (!on() || mode !== 'normal-sync') return Promise.resolve(writeAll(map));
    if (!keys.length) return Promise.resolve(writeAll(map));
    var tomb = tombKeys();
    return gatherLocal(prim, keys).then(function(local){
      return gatherRemote().then(function(remote){
        var v = classify({ mode: mode, keys: keys, local: local, remote: remote,
                           needed: neededKeys(), tomb: tomb });
        if (v.recover.length) backlogAdd(v.recover);
        /* ★期待集合の union は **書込みのあと**でなければならない。
           fix399 の idbWriteAll は内部で saveExpectedImgKeys(渡されたキー) を呼び、
           期待集合を**渡した部分集合で置換**する。先に union すると即座に上書きされて縮む
           （＝fix631 が守っている単調性が壊れる）。回帰テストで実際に踏んだ。 */
        if (!v.allow.length){
          noteDecision(v, ctx, { expected: unionExpected(keys, tomb) });
          return 0;
        }
        var sub = Object.create(null);
        for (var i = 0; i < v.allow.length; i++) sub[v.allow[i]] = map[v.allow[i]];
        return serializeP('blob-apply', function(){ return writeAll(sub); }).then(function(r){
          noteDecision(v, ctx, { expected: unionExpected(keys, tomb) });
          try { if (v.recover.length) setTimeout(function(){ flushBackfill(); }, 20000); } catch(e){}
          return r;
        }, function(err){
          unionExpected(keys, tomb);
          throw err;
        });
      });
    }).catch(function(e){
      /* ★fail-closed: 判定できないなら **書かない**。
         書かなければ既存の絵は壊れず、不足は per-key チャネル(fix523/633)と
         起動時 selfHeal が拾える。ここで従来経路へ落ちると上書き事故が戻る。 */
      try { console.warn(TAG, '判定できないため blob 適用を見送りました:', e && e.message); } catch(_){}
      lss(DIAG, JSON.stringify({ at: Date.now(), path: (ctx && ctx.path) || '?', error: String(e && e.message || e).slice(0, 80), allowed: 0 }));
      return 0;
    });
  }

  /* ---------- fix523 の公開 pullOne/pushOne を直列化でくるむ ----------
     ★fix633 は毎回 W.__v292Dfix523 を引き直して呼ぶので、ここを包めば fix633 も直列化される。
       fix523 自身の内部 recvSweep は内部関数を呼ぶので包めない（後勝ちの窓は残る）。
       完全な排他は目的ではない＝窓を狭めれば足りる（GPT指定5）。 */
  var wrapped523 = false;
  function wrap523(){
    if (wrapped523 || !on() || lockOff()) return wrapped523;
    var f = null; try { f = W.__v292Dfix523; } catch(e){}
    if (!f || f.__f638lock) { wrapped523 = !!(f && f.__f638lock); return wrapped523; }
    if (typeof f.pullOne !== 'function' || typeof f.pushOne !== 'function') return false;
    var _pull = f.pullOne, _push = f.pushOne;
    f.pullOne = function(pk, rev, done){
      serialize('perkey-pull', function(rel){
        var fired = false;
        try { _pull(pk, rev, function(ok){ if (fired) return; fired = true; rel(); if (done) done(ok); }); }
        catch(e){ if (!fired){ fired = true; rel(); if (done) done(false); } }
      });
    };
    f.pushOne = function(pk, done){
      serialize('perkey-push', function(rel){
        var fired = false;
        try { _push(pk, function(ok){ if (fired) return; fired = true; rel(); if (done) done(ok); }); }
        catch(e){ if (!fired){ fired = true; rel(); if (done) done(false); } }
      });
    };
    f.__f638lock = true;
    wrapped523 = true;
    try { console.log(TAG, 'fix523 pullOne/pushOne を直列化しました'); } catch(e){}
    return true;
  }

  W.__v292Dfix638 = {
    __armed: true, on: on,
    classify: classify, guardedWrite: guardedWrite,
    neededKeys: neededKeys, tombKeys: tombKeys, lsKeys: lsKeys,
    unionExpected: unionExpected,
    backlog: backlog, flushBackfill: flushBackfill,
    lock: LOCK, wrap523: wrap523,
    lastDecision: function(){ return lastDecision ? JSON.parse(JSON.stringify(lastDecision)) : null; },
    /* 副作用なしの下見（実機で「いま pull が来たら何が起きるか」を見る） */
    plan: function(mapKeys){
      var keys = (mapKeys || []).map(full);
      return gatherLocal({ readKeys: null }, keys).then(function(local){
        return gatherRemote().then(function(remote){
          return classify({ mode: 'normal-sync', keys: keys, local: local,
                            remote: remote, needed: neededKeys(), tomb: tombKeys() });
        });
      });
    },
    status: function(){
      return { armed: true, on: on(), backfillOn: !backfillOff(), lockOn: !lockOff(),
               wrapped523: wrapped523, lockOwner: LOCK.owner(),
               backlog: backlog().length, lastDecision: lastDecision };
    }
  };

  /* ---------- 起動配線（OFF なら1バイトも配線しない） ---------- */
  try {
    if (on() && typeof setTimeout === 'function'){
      (function poll(n){
        if (wrap523()) return;
        if (n > 40) return;
        setTimeout(function(){ poll(n + 1); }, 500);
      })(0);
      setTimeout(function(){ flushBackfill(); }, 30000);
      if (typeof setInterval === 'function') setInterval(function(){ flushBackfill(); }, 120000);
      if (typeof document !== 'undefined' && document.addEventListener){
        document.addEventListener('visibilitychange', function(){
          if (document.visibilityState === 'visible') setTimeout(function(){ flushBackfill(); }, 4000);
        });
      }
    }
  } catch(e){}
  try { console.log(TAG, 'armed; on:', on() ? 'on' : 'off'); } catch(e){}
})();
