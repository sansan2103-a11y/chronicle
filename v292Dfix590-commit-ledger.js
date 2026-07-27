// =====================================================================
// Chronicle v292Dfix590: コミット台帳（「結果不明」を記録して読めるようにする）
// ---------------------------------------------------------------------
// ■解く問題（2026-07-27 の実機で実際に起きた）
//   ローカル appliedRev=429 / D1 canonical=430 になり、fix399・fix402 の両方が
//   baseRev=429 で put → 両方 fork → fail-closed で停止した。
//   原因は「**push は成功して D1 が 430 へ進んだのに、応答を受け取る前にページを離脱**して
//   appliedRev が取り残された」こと。appliedRev は成功応答だけで昇格する設計（正しい）なので、
//   この取り残しが起きると以後すべての put が fork し続け、**pull しないと自力復帰できない**。
//
// ■GPT裁定（要旨）
//   これは典型的な「結果不明」状態。毎回ユーザに pull を要求する必要はない。
//   **内容が完全一致すると証明できる場合だけ**、不可視に復帰させるのが Chronicle の設計思想に合う。
//   判定は三者一致:
//       remoteHash == lastSentPayloadHash == currentLocalPackageHash
//   ★「remote と 最後に送った」の2つだけ比較してはいけない。
//     （429の状態Pを送って成功 → ローカルはQへ進む → 応答を取り逃す、のとき
//       Q が P から正しく派生した証明が無い。**現在のローカルpkgも一致する**ことが必須）
//
// ■この段（fix590）でやること / やらないこと
//   やる  : 「何を送ったか」を put 直前に**永続化**し、fork したときに理由を分類して残す。
//           照合は**純粋関数**として用意し、remoteHash を引数で受け取る形にしておく。
//   やらない: **appliedRev を1ミリも動かさない**。挙動は今までと完全に同じで、
//           「なぜ止まっているのか」が読めるようになるだけ。
//   次の段  : read-back（D1のblob文字列そのもの、または Worker が計算した packageHash）が
//           手に入ったら reconcile() を実際の復帰へ繋ぐ。
//
// ★★hash の対象について（実コードを読んで判明した重要な事実）
//   Worker が D1 へ保存しているのは「クライアントが送った pkg 文字列そのもの」ではない。
//       const light = {}; for (const k in pkg) { if (k !== 'idb') light[k] = pkg[k]; }
//       const str = JSON.stringify(light);          // ← これが blob
//   つまり **idb（画像）を除いたオブジェクトを再直列化したもの**。
//   したがって lastSentPayloadHash も**同じ規則**で作らなければ一致しない。
//   → payloadString(pkg) をこのファイルに置き、送信側と照合側で必ずこれを使う。
//
// 冪等: window.__v292Dfix590 / OFF: localStorage.v292Dfix590Off='1'
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix590) return;
  var TAG = '[v292Dfix590:commit-ledger]';
  var KEY = 'v292Dfix590_pending';
  var VERSION = 1;

  function off(){ try { return localStorage.getItem('v292Dfix590Off') === '1'; } catch(e){ return false; } }
  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }

  /* 記録はメモリを正本にする（容量が満杯でも理由が消えないように・fix575で踏んだ型） */
  var LOG = [], LOG_MAX = 20;
  var stats = { puts: 0, results: 0, forks: 0, ambiguous: 0, persistFailed: 0,
                reconcileOk: 0, reconcileNg: 0, sharedRevPromoted: 0, byReason: {} };
  function note(rec){ try { rec.at = Date.now(); LOG.push(rec); if (LOG.length > LOG_MAX) LOG.shift(); } catch(e){} }
  function bump(why){ try { stats.byReason[why] = (stats.byReason[why] || 0) + 1; } catch(e){} }

  /* ---- hash ---------------------------------------------------------------
   * ★★packageHash の厳密な仕様（GPT指定・Worker と完全に同じ処理にすること）
   *      アルゴリズム : SHA-256
   *      入力         : put で実際に送信され、D1のblob列へ保存される pkg 文字列
   *      文字コード   : UTF-8
   *      出力         : 小文字16進数・64文字
   *      仕様名       : sha256-utf8-v1
   *   ここが1文字でもサーバとずれると三者一致は永久に成立しない。 */
  var HASH_SPEC = 'sha256-utf8-v1';
  function sha256Hex(text){
    try {
      var bytes = new TextEncoder().encode(String(text == null ? '' : text));
      return crypto.subtle.digest('SHA-256', bytes).then(function(buf){
        var a = new Uint8Array(buf), out = '';
        for (var i = 0; i < a.length; i++){ out += ('0' + a[i].toString(16)).slice(-2); }
        return out;
      });
    } catch(e){ return Promise.reject(e); }
  }
  /* 識別子用の軽い hash（identity を伏せるためだけに使う。packageHash には使わない） */
  function shortHash(s){
    var h = 0; s = String(s == null ? '' : s);
    for (var i = 0; i < s.length; i++){ h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
    return String(h >>> 0);
  }

  /* ---- ★D1に保存されるのと同じ規則で pkg を文字列にする -------------------
   * Worker: light = pkg から idb を除いたもの → JSON.stringify(light)
   * ここを送信側と照合側で共有しないと、三者一致は永久に成立しない。 */
  function payloadString(pkg){
    if (!pkg || typeof pkg !== 'object') return null;
    var light = {};
    for (var k in pkg){ if (k !== 'idb' && Object.prototype.hasOwnProperty.call(pkg, k)) light[k] = pkg[k]; }
    try { return JSON.stringify(light); } catch(e){ return null; }
  }
  /* 戻り: Promise<hex64 | null> */
  function payloadHash(pkg){
    var s = payloadString(pkg);
    if (s == null) return Promise.resolve(null);
    return sha256Hex(s).then(function(h){ return h; }, function(){ return null; });
  }

  /* ---- identity（★生のメールアドレスや合言葉は保存しない） ----------------
   * 照合に必要なのは「同じ相手か」だけなので、伏せた値を持つ。 */
  function identityKey(raw){ return raw ? ('id_' + shortHash(String(raw))) : null; }

  /* ---- 台帳の読み書き（永続化。ページ離脱をまたぐ必要があるため） ---------- */
  function read(){
    try { var o = JSON.parse(lsg(KEY) || 'null'); return (o && o.v === VERSION) ? o : null; }
    catch(e){ return null; }
  }
  function write(o){
    try { localStorage.setItem(KEY, JSON.stringify(o)); return true; }
    catch(e){ stats.persistFailed++; note({ act:'persist-failed', why:String(e && e.name) }); return false; }
  }
  function clear(){ try { localStorage.removeItem(KEY); } catch(e){} }

  /* ---- ① put の直前に呼ぶ ------------------------------------------------
   * 戻り: { ok, payloadHash, persisted }
   * ★persisted:false のときは「自動照合不能」。fork したら pull を要求する（GPT指定）。 */
  function notePut(o){
    o = o || {};
    if (off()) return Promise.resolve({ ok:false, code:'off' });
    return payloadHash(o.pkg).then(function(ph){
      if (ph == null) return { ok:false, code:'no-payload' };
      stats.puts++;
      var rec = { v: VERSION, spec: HASH_SPEC, identity: identityKey(o.identity),
                  baseRev: (o.baseRev == null ? null : +o.baseRev),
                  payloadHash: ph, createdAt: Date.now(), status: 'awaiting-result',
                  source: String(o.source || 'unknown') };
      var persisted = write(rec);
      note({ act:'put', source: rec.source, baseRev: rec.baseRev, persisted: persisted });
      return { ok:true, payloadHash: ph, persisted: persisted };
    }, function(){ return { ok:false, code:'hash-failed' }; });
  }

  /* ---- ② 応答を受け取れたら呼ぶ（成功でも fork でも） --------------------- */
  function noteResult(o){
    o = o || {};
    if (off()) return;
    stats.results++;
    if (o.fork){
      stats.forks++;
      var cur = read();
      /* 台帳が残っていれば「送ったのに fork した」= 照合の材料がある */
      note({ act:'fork', serverRev: (o.serverRev == null ? null : +o.serverRev),
             hasLedger: !!cur, source: String(o.source || 'unknown') });
      return;
    }
    /* 成功 = 結果が確定したので台帳は用済み（★成功応答のときだけ消す） */
    clear();
    note({ act:'success', rev: (o.rev == null ? null : +o.rev), source: String(o.source || 'unknown') });
  }

  /* ---- ③ 照合（★純粋関数。ここでは何も書き換えない） ---------------------
   * 引数: { remoteHash, remoteRev, appliedRev, identity, currentPkg | currentHash }
   * 戻り: { recoverable, why, remoteRev }
   * GPT指定の不一致理由をそのまま使う:
   *   remote-vs-last-sent-mismatch / last-sent-vs-current-mismatch / remote-read-failed /
   *   remote-response-invalid / identity-mismatch / hash-failed
   */
  function reconcile(o){
    o = o || {};
    function ng(why){ stats.reconcileNg++; bump(why); note({ act:'reconcile', ok:false, why:why });
                      return Promise.resolve({ recoverable:false, why:why }); }
    if (off()) return ng('off');

    var led = read();
    if (!led) return ng('no-ledger');                       /* 送った記録が無い＝自動照合不能 */
    if (led.status !== 'awaiting-result') return ng('ledger-not-awaiting');
    if (led.spec && led.spec !== HASH_SPEC) return ng('hash-spec-mismatch');

    if (o.remoteReadFailed) return ng('remote-read-failed');
    var rHash = (o.remoteHash == null) ? null : String(o.remoteHash);
    var rRev  = (o.remoteRev == null) ? null : +o.remoteRev;
    if (rHash == null || rRev == null || !isFinite(rRev)) return ng('remote-response-invalid');

    var idNow = identityKey(o.identity);
    if (led.identity && idNow && led.identity !== idNow) return ng('identity-mismatch');

    /* ★取得した rev だけを見て昇格してはいけない（GPT指定）。rev は「前提条件」でしかない。 */
    if (!(rRev > (+o.appliedRev || 0))) return ng('remote-rev-not-ahead');

    var curP = (o.currentHash != null) ? Promise.resolve(String(o.currentHash)) : payloadHash(o.currentPkg);
    return curP.then(function(curHash){
      if (curHash == null) return ng('hash-failed');
      /* ★三者一致。2つだけの比較にしない。 */
      if (rHash !== led.payloadHash) return ng('remote-vs-last-sent-mismatch');
      if (curHash !== led.payloadHash) return ng('last-sent-vs-current-mismatch');
      stats.reconcileOk++;
      note({ act:'reconcile', ok:true, remoteRev:rRev, appliedRev:(+o.appliedRev||0) });
      /* ★ここでは appliedRev を動かさない。「動かしてよい」と答えるだけ（この段の約束）。 */
      return { recoverable:true, why:'three-way-match', remoteRev:rRev, payloadHash: led.payloadHash };
    }, function(){ return ng('hash-failed'); });
  }

  /* ---- ★fix593: pull収束証明（GPT裁定 a′） --------------------------------
   * 「pull が remoteRev を基点として、ローカル同期状態を**安全に再構成できたと証明できた**
   *   場合だけ、共有rev を remoteRev へ更新する」。
   * ★「差分0件」や「skipped 0件」だけでは pull の成功を証明できない（GPT明示）。
   *   今回の pull には、通常の上書き以外に mergeMeta / tombstone barrier /
   *   ローカル専用キーの除外 / metaのfail-closed / local-aheadスキップ が絡むため。
   * ★remote が live meta・local が墓標でも、mergeMeta が承認済みの安全なマージなら
   *   「remote rev を親として、ローカル墓標という未同期変更を載せた状態」とみなせる。
   *   → 共有rev = remoteRev / dirty = true にして、次の put で墓標を CAS 送信できる。
   * 戻り: { ok, why }  （ok のときだけ昇格してよい） */
  function provePullConvergence(o){
    o = o || {};
    var checks = [
      ['remote-rev-invalid',      typeof o.remoteRev === 'number' && isFinite(o.remoteRev) && o.remoteRev >= 0],
      ['remote-rev-behind',       (+o.remoteRev || 0) >= (+o.currentSharedRev || 0)],
      ['identity-mismatch',       !o.identity || !o.pullIdentity || identityKey(o.identity) === identityKey(o.pullIdentity)],
      ['pull-not-complete',       o.pullCompleted === true],
      ['parse-failed',            o.parsedOk === true],
      ['apply-errors',            (+o.applyErrors || 0) === 0],
      ['conflict-skips',          (+o.conflictSkips || 0) === 0],
      ['unknown-skips',           (+o.unknownSkips || 0) === 0],
      ['meta-not-merged',         o.metaMerged === true || o.metaAbsent === true],
      ['meta-merge-failed',       o.metaMergeFailed !== true],
      ['barrier-without-tombstone', (+o.blockedWithoutTombstone || 0) === 0],
      ['readback-failed',         o.readBackOk === true]
    ];
    for (var i = 0; i < checks.length; i++){
      if (!checks[i][1]){ bump('pullProof:' + checks[i][0]); note({ act:'pull-proof', ok:false, why:checks[i][0] });
                          return { ok:false, why: checks[i][0] }; }
    }
    note({ act:'pull-proof', ok:true, remoteRev:+o.remoteRev });
    return { ok:true, why:'converged' };
  }

  /* ---- ★fix593: 共有revの昇格（キー名をここで一元管理する） ---------------
   * fix580 が居ればその API を使い、居なければ台帳キーを直接書く（home.html は fix580 を積まない）。
   * ★下げない。上げるだけ。 */
  var SHARED_REV_KEY = 'v292Dfix580_rev';
  function sharedRev(){
    try {
      var c = window.__v292Dfix580;
      if (c && typeof c.rev === 'function') return +c.rev() || 0;
    } catch(e){}
    try { return +(lsg(SHARED_REV_KEY) || 0) || 0; } catch(e){ return 0; }
  }
  function promoteSharedRev(rev, reason){
    rev = +rev || 0;
    var cur = sharedRev();
    if (!(rev > cur)) return { ok:false, why:'not-ahead', cur: cur };
    try {
      var c = window.__v292Dfix580;
      if (c && typeof c.promoteRev === 'function'){ c.promoteRev(rev, reason || 'fix593:pull収束'); }
      else { localStorage.setItem(SHARED_REV_KEY, String(rev)); }
    } catch(e){ return { ok:false, why:'write-failed' }; }
    stats.sharedRevPromoted++;
    note({ act:'promote-shared-rev', from: cur, to: rev, reason: String(reason || '').slice(0, 40) });
    return { ok:true, from: cur, to: rev };
  }

  /* ---- 実機から読む口 ---------------------------------------------------- */
  function report(){
    var led = read();
    return {
      pending: led ? { baseRev: led.baseRev, status: led.status, ageSec: Math.round((Date.now() - led.createdAt)/1000) } : null,
      stats: JSON.parse(JSON.stringify(stats)),
      log: LOG.slice(-8),
      note: led ? '送信の結果が未確定のものがあります（応答を取り逃した可能性）' : '未確定の送信はありません'
    };
  }

  window.__v292Dfix590 = {
    __armed: true,
    VERSION: VERSION,
    payloadString: payloadString,
    payloadHash: payloadHash,          /* Promise<hex64|null> */
    sha256Hex: sha256Hex,
    HASH_SPEC: HASH_SPEC,
    identityKey: identityKey,
    notePut: notePut,
    noteResult: noteResult,
    reconcile: reconcile,
    /* ★fix593: pull収束証明と共有revの昇格 */
    provePullConvergence: provePullConvergence,
    promoteSharedRev: promoteSharedRev,
    sharedRev: sharedRev,
    pending: read,
    clear: clear,
    stats: function(){ return JSON.parse(JSON.stringify(stats)); },
    log: function(){ return LOG.slice(); },
    report: report,
    isOff: off,
    /* ★まだ復帰へは繋いでいない（read-back の手段が決まるまで）。挙動は従来どおり。 */
    wiredIntoRecovery: false
  };
  try { console.log(TAG, 'loaded', off() ? 'OFF' : 'on'); } catch(e){}
})();
