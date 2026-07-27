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
// ---------------------------------------------------------------------
// ★★fix596 (2026-07-27) = Worker v25 の commitstate と繋いで、
//   「送ったのに応答を取り逃した」を**自力で決着**できるようにする。
//   GPT裁定でとくに重要だった点:
//     (1) commitOpId は put だけでなく **forceput** にも付ける
//         （home の「いま上げる」が forceput なので、曖昧コミットはそこでも起きる）
//     (2) 成功応答を `ok:true` だけで信用しない。
//         rev / hashAlg / packageHash / lastCommitOpId をすべて突き合わせる
//     (3) **未解決の pending を新しい put で上書きしない**。
//         上書きすると前回コミットの証拠が消える。解決するまで新しい送信をしない
//     (4) reconcile は TOCTOU 対策をする。
//         read-back の最中にローカルや pending が変わりうるので、開始時の写しと照合してから適用
//     (5) 2種類の成功を**厳密に分ける**
//         commit-confirmed        … 自分の commit が canonical になった証明
//         state-equivalent-rebased… 中身は同じだが、自分のcommitが通った証明にはならない
//     (6) hashAlg だけでなく **packageSpec** も一致したときだけ三者照合を有効にする
//     (7) identity は伏せ字ではなく **fingerprint**（別アカウントの pending を誤適用しない）
// 冪等: window.__v292Dfix590 / OFF: localStorage.v292Dfix590Off='1'
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix590) return;
  var TAG = '[v292Dfix590:commit-ledger]';
  var KEY = 'v292Dfix590_pending';
  /* ★fix596: 記録の形が変わったので版を上げる。
     旧版(v1)のレコードは read() が弾く＝「送った記録が無い」として扱われる。
     これは安全側（勝手に解釈して appliedRev を動かすより、照合不能として止める方がよい）。 */
  var VERSION = 2;
  /* ★★fix596(GPT指定6): packageHash の入力の作り方そのものの版。
     hashAlg が同じでも「light の作り方」や「キー挿入順」が変われば値は一致しなくなる。
     Worker v25 の light 生成規則をこの名前で固定する。 */
  var PACKAGE_SPEC = 'chronicle-light-v1';

  function off(){ try { return localStorage.getItem('v292Dfix590Off') === '1'; } catch(e){ return false; } }
  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }

  /* 記録はメモリを正本にする（容量が満杯でも理由が消えないように・fix575で踏んだ型） */
  var LOG = [], LOG_MAX = 20;
  var stats = { puts: 0, results: 0, forks: 0, ambiguous: 0, persistFailed: 0,
                reconcileOk: 0, reconcileNg: 0, sharedRevPromoted: 0, byReason: {},
                /* ★★fix596(GPT指定): 事実と最終分類を分けて数える。
                   forksObserved は「Workerがforkと答えた」という**事実**なので、
                   あとで state-equivalent と判明しても**減らさない**。 */
                forksObserved: 0,
                reconcileAttempts: 0, reconcileSingleFlightJoins: 0,
                commitConfirmed: 0, stateEquivalentRebased: 0, realConflicts: 0,
                remoteReadFailed: 0, responseIntegrityMismatch: 0,
                reconcileStale: 0, reconcileUnsupported: 0, pendingBlockedNewPut: 0,
                supersededByPull: 0, foreignPendingDropped: 0 };
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
   * 照合に必要なのは「同じ相手か」だけなので、伏せた値を持つ。
   * ★★fix596(GPT指定7): 表示用の伏せ字（os***@example.com のような形）は**衝突しうる**ので使わない。
   *   認証の種別（google / pass）と正規化した identity から作った fingerprint を使う。
   *   要件は「**別アカウントの pending を誤って適用しない**」こと。
   *   ★合言葉の単純hashは辞書攻撃に弱いので、将来は Worker 発行の opaque な identityTag へ移す。
   *     いまは端末内にしか置かない値なので、この段では非可逆な短縮hashで足りる。 */
  function identityKey(raw, kind){
    if (!raw) return null;
    var k = (kind === 'google' || kind === 'pass') ? kind : 'unknown';
    var norm = String(raw).trim();
    return 'id_' + k + '_' + shortHash(k + '\u0000' + norm);
  }
  /* ★呼び出し側が種別を知らない場合の推定（Google の ID トークンは3つの区切りを持つ JWT） */
  function identityKindOf(raw){
    var s = String(raw == null ? '' : raw);
    return (s.split('.').length === 3 && s.length > 40) ? 'google' : 'pass';
  }
  function identityTag(raw){ return identityKey(raw, identityKindOf(raw)); }

  /* ★★fix596c: identity は**安定した値**から作らなければならない。
     2026-07-27 の実機で踏んだ: 保留を作ったときは合言葉から、照合のときは Google トークンから
     作られたため identity-mismatch になり、**自分の保留を自分で解決できなくなった**。
     原因は2つ:
       ・fix399 は `window.__chronicleGoogleId()`、home は localStorage の期限チェック付き、と
         取得元が違う
       ・Google トークンは**期限切れになる**ので、同じ端末・同じ人でも時間で種別が変わる
     → サーバが返す ns（アカウントごとの名前空間）が最も安定しているので、あればそれを使う。
       ns が分からない場合だけ、従来どおり合言葉/トークンから作る。 */
  function identityOf(o){
    o = o || {};
    if (o.ns) return identityKey(String(o.ns), 'ns');
    if (o.identity) return identityKey(o.identity, o.identityKind || identityKindOf(o.identity));
    return null;
  }

  /* ---- commitOpId（この端末が「今回の送信」に付ける一意な名前） ------------
   * ★サーバは絶対に発行しない（架空のIDを作らせない）。ここでだけ作る。 */
  var opSeq = 0;
  function newCommitOpId(){
    opSeq++;
    var rnd = '';
    try {
      var a = new Uint8Array(8); crypto.getRandomValues(a);
      for (var i = 0; i < a.length; i++) rnd += ('0' + a[i].toString(16)).slice(-2);
    } catch(e){ rnd = shortHash(String(Date.now()) + ':' + opSeq); }
    return 'op_' + Date.now().toString(36) + '_' + opSeq + '_' + rnd;
  }

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
    /* ★★fix596(GPT指定3): 未解決の pending を**上書きしない**。
       上書きすると「前回のコミットが通ったのか」の証拠が消える。
       呼び出し側は blocked を見たら**送信せず**、ローカル変更を dirty として溜める。 */
    var prev = read();
    if (prev && prev.status === 'awaiting-result'){
      /* ★★fix596c: 止めてよいのは「**自分の**未解決の保留」だけ。
         別アカウントの保留（この端末を別の人が使った等）は、こちらでは決着させようがない。
         それで送信を止めると**自分の保存が永久にできなくなる**ので、捨てて先へ進む。
         ここで捨てても、そのアカウントのデータはサーバ側に残っていて失われない。 */
      var meNow = identityOf(o);
      var sameOwner = !prev.identity || !meNow || prev.identity === meNow;
      if (sameOwner){
        stats.pendingBlockedNewPut++;
        note({ act:'blocked-new-put', pendingOpId: prev.commitOpId, pendingSince: prev.createdAt });
        return Promise.resolve({ ok:false, code:'pending-unresolved', blocked:true, pending: snapshotOf(prev) });
      }
      stats.foreignPendingDropped++;
      note({ act:'foreign-pending-dropped', pendingOpId: prev.commitOpId });
      clear();
    }
    return payloadHash(o.pkg).then(function(ph){
      if (ph == null) return { ok:false, code:'no-payload' };
      stats.puts++;
      var op = (o.op === 'forceput') ? 'forceput' : 'put';   /* ★forceput も対象（GPT指定1） */
      var commitOpId = o.commitOpId ? String(o.commitOpId) : newCommitOpId();
      var rec = { v: VERSION, spec: HASH_SPEC, packageSpec: PACKAGE_SPEC,
                  op: op, commitOpId: commitOpId,
                  /* ★★fix596: 送ったパッケージの updatedAt をそのまま控える。
                     collectLight は `updatedAt: ts` を埋めるので、あとで**現在時刻で作り直すと
                     中身が1バイトも変わっていなくてもhashが必ず変わる**。
                     それでは三者一致が永久に成立せず、照合の仕組みそのものが無意味になる。
                     照合のときは必ずこの ts で作り直して比べる。 */
                  pkgTs: (o.pkgTs == null ? null : +o.pkgTs),
                  identity: identityOf(o),
                  baseRev: (o.baseRev == null ? null : +o.baseRev),
                  payloadHash: ph, createdAt: Date.now(), status: 'awaiting-result',
                  source: String(o.source || 'unknown') };
      var persisted = write(rec);
      note({ act:'put', op: op, source: rec.source, baseRev: rec.baseRev,
             commitOpId: commitOpId, persisted: persisted });
      return { ok:true, payloadHash: ph, commitOpId: commitOpId, op: op, persisted: persisted };
    }, function(){ return { ok:false, code:'hash-failed' }; });
  }

  /* 台帳の写し（呼び出し側へ返す用。中身をそのまま渡して書き換えられないようにする） */
  function snapshotOf(rec){
    if (!rec) return null;
    return { op: rec.op, commitOpId: rec.commitOpId, baseRev: rec.baseRev,
             payloadHash: rec.payloadHash, createdAt: rec.createdAt, pkgTs: rec.pkgTs,
             status: rec.status, source: rec.source, identity: rec.identity };
  }
  function pendingCommit(){ var r = read(); return r ? snapshotOf(r) : null; }
  function hasAwaiting(){ var r = read(); return !!(r && r.status === 'awaiting-result'); }

  /* ---- ② 応答を受け取れたら呼ぶ（成功でも fork でも） ---------------------
   * ★★fix596(GPT指定2): 成功応答を `ok:true` だけで信用しない。
   *   pending を消してよいのは「自分の commit が canonical になった」と**証明できたとき**だけ。
   *   戻り: { status, why }
   *     'commit-confirmed'          … 全項目一致。appliedRev を進めてよい。pending は消す
   *     'ambiguous-response'        … どれかが食い違う。**pending を残し** appliedRev を動かさない
   *     'response-integrity-mismatch'… lastCommitOpId は一致するのに packageHash が違う。
   *                                    通常起こり得ないので、単なる競合ではなく**Worker整合性異常**
   *     'fork'                      … Worker が fork と答えた（台帳は残す）
   *     'legacy-ok'                 … v25以前のWorker。照合材料が無いので従来どおり成功扱い
   */
  function noteResult(o){
    o = o || {};
    if (off()) return { status:'off' };
    stats.results++;
    var cur = read();
    if (o.fork){
      stats.forks++; stats.forksObserved++;
      note({ act:'fork', serverRev: (o.serverRev == null ? null : +o.serverRev),
             hasLedger: !!cur, source: String(o.source || 'unknown') });
      return { status:'fork' };
    }
    var resp = o.response || {};
    /* 照合の材料がそろっているか。v25未満の Worker は hashAlg を返さないので従来どおりにする。 */
    var canVerify = !!(cur && cur.status === 'awaiting-result' && cur.commitOpId &&
                       resp && resp.hashAlg != null && resp.packageHash != null);
    if (!canVerify){
      clear();
      note({ act:'success(legacy)', rev: (o.rev == null ? null : +o.rev), source: String(o.source || 'unknown') });
      return { status:'legacy-ok' };
    }
    var rev = (o.rev == null) ? (resp.rev == null ? null : +resp.rev) : +o.rev;
    var checks = {
      ok:            resp.ok === true,
      revSafe:       (rev != null && Number.isSafeInteger ? Number.isSafeInteger(rev) : (rev != null && isFinite(rev))),
      revAhead:      (rev != null && cur.baseRev != null) ? (rev > cur.baseRev) : (rev != null),
      hashAlg:       String(resp.hashAlg) === HASH_SPEC,
      packageHash:   String(resp.packageHash) === cur.payloadHash,
      lastCommitOpId: String(resp.lastCommitOpId == null ? '' : resp.lastCommitOpId) === String(cur.commitOpId)
    };
    var allOk = checks.ok && checks.revSafe && checks.revAhead && checks.hashAlg &&
                checks.packageHash && checks.lastCommitOpId;
    if (allOk){
      clear();
      stats.commitConfirmed++;
      note({ act:'commit-confirmed', rev: rev, commitOpId: cur.commitOpId, source: String(o.source || 'unknown') });
      return { status:'commit-confirmed', rev: rev, commitOpId: cur.commitOpId };
    }
    /* ★lastCommitOpId は一致するのに packageHash が違う＝通常あり得ない。別の数として扱う。 */
    if (checks.lastCommitOpId && !checks.packageHash){
      stats.responseIntegrityMismatch++;
      bump('response-integrity-mismatch');
      note({ act:'response-integrity-mismatch', rev: rev, commitOpId: cur.commitOpId });
      return { status:'response-integrity-mismatch', checks: checks };
    }
    stats.ambiguous++;
    bump('ambiguous-response');
    note({ act:'ambiguous-response', rev: rev, checks: checks });
    return { status:'ambiguous-response', checks: checks };   /* ★pending は消さない */
  }

  /* ---- ★pull が収束したら、古い pending は用済みにする ---------------------
   * これが無いと「解決できない pending が残り続け、以後の送信が永久に止まる」。
   * pull で remote を基点に作り直せたなら、その pending の結果はもう問題にならない。 */
  function supersedeByPull(remoteRev){
    var cur = read();
    if (!cur) return { ok:false, code:'no-ledger' };
    clear();
    stats.supersededByPull++;
    note({ act:'superseded-by-pull', remoteRev: (remoteRev == null ? null : +remoteRev),
           commitOpId: cur.commitOpId });
    return { ok:true, commitOpId: cur.commitOpId };
  }

  /* ---- ③ 照合（★純粋関数。ここでは何も書き換えない） ---------------------
   * 引数: { remote:{rev, packageHash, lastCommitOpId, hashAlg, packageSpec},
   *         appliedRev, identity, identityKind, currentPkg | currentHash,
   *         pendingAtStart（reconcileの開始時に控えた写し）, remoteReadFailed }
   * 戻り: { status, why, remoteRev, canAdvanceAppliedRev }
   *
   * ★★fix596(GPT指定5): 2種類の成功を厳密に分ける。
   *   commit-confirmed
   *     remote.lastCommitOpId === pending.commitOpId かつ remote.packageHash === pending.payloadHash。
   *     current local も同じなら完全な確認。**自分の commit が canonical になった証明**。
   *   state-equivalent-rebased
   *     remote.packageHash = pending.payloadHash = currentLocalPackageHash だが、
   *     lastCommitOpId が null または自分のと異なる。
   *     canonical と現在のローカルが byte 単位で同一なので appliedRev は進めてよいが、
   *     **「自分の commit が通った」とは記録しない**。
   *
   * ★★fix596(GPT指定4): TOCTOU 対策。read-back の最中にローカルや pending が変わりうる。
   *   pendingAtStart（開始時の写し）と、いまの台帳が同じであることを確かめてからでないと適用しない。
   */
  function classify(o){
    o = o || {};
    function ng(why, extra){
      stats.reconcileNg++; bump(why); note({ act:'reconcile', ok:false, why:why });
      var r = { status:'no', why:why, canAdvanceAppliedRev:false };
      if (extra) for (var k in extra) r[k] = extra[k];
      return Promise.resolve(r);
    }
    if (off()) return ng('off');

    var led = read();
    if (!led) return ng('no-ledger');
    if (led.status !== 'awaiting-result') return ng('ledger-not-awaiting');
    if (led.spec && led.spec !== HASH_SPEC) return ng('hash-spec-mismatch');

    /* ★TOCTOU: 開始時の写しと違っていたら、この照合結果は使わない */
    var p0 = o.pendingAtStart;
    if (p0){
      if (String(p0.commitOpId) !== String(led.commitOpId) ||
          String(p0.payloadHash) !== String(led.payloadHash) ||
          String(p0.baseRev) !== String(led.baseRev)){
        stats.reconcileStale++;
        return ng('reconcile-stale');
      }
    }

    if (o.remoteReadFailed){ stats.remoteReadFailed++; return ng('remote-read-failed'); }
    var rm = o.remote || {};
    var rHash = (rm.packageHash == null) ? null : String(rm.packageHash);
    var rRev  = (rm.rev == null) ? null : +rm.rev;
    if (rHash == null || rRev == null || !isFinite(rRev)) return ng('remote-response-invalid');
    if (Number.isSafeInteger && !Number.isSafeInteger(rRev)) return ng('remote-response-invalid');

    /* ★hashAlg と packageSpec の**両方**が一致したときだけ三者照合を有効にする（GPT指定6）。
       packageSpec は v25 の応答にまだ無いので、無い場合は v25 = chronicle-light-v1 とみなす。 */
    if (rm.hashAlg != null && String(rm.hashAlg) !== HASH_SPEC) return ng('hash-alg-mismatch');
    var rSpec = (rm.packageSpec == null) ? PACKAGE_SPEC : String(rm.packageSpec);
    if (rSpec !== (led.packageSpec || PACKAGE_SPEC)) return ng('package-spec-mismatch');

    var idNow = identityOf(o);
    if (led.identity && idNow && led.identity !== idNow) return ng('identity-mismatch');

    var applied = +o.appliedRev || 0;
    /* ★rev は巻き戻さない。remoteRev < appliedRev は異常として、昇格も pending 解除もしない。 */
    if (rRev < applied) return ng('remote-rev-behind');

    var curP = (o.currentHash != null) ? Promise.resolve(String(o.currentHash)) : payloadHash(o.currentPkg);
    return curP.then(function(curHash){
      if (curHash == null) return ng('hash-failed');
      if (rHash !== led.payloadHash) { stats.realConflicts++; return ng('remote-vs-last-sent-mismatch'); }
      if (curHash !== led.payloadHash) return ng('last-sent-vs-current-mismatch');

      /* ここまで来れば「canonical の中身 = 送ったもの = いまのローカル」。 */
      var opMatch = (rm.lastCommitOpId != null) &&
                    (String(rm.lastCommitOpId) === String(led.commitOpId));
      /* remoteRev === appliedRev なら rev 昇格は不要だが、状態一致を確認できたので pending は解除できる。 */
      var canAdvance = (rRev > applied);
      stats.reconcileOk++;
      if (opMatch){
        stats.commitConfirmed++;
        note({ act:'reconcile', ok:true, status:'commit-confirmed', remoteRev:rRev, appliedRev:applied });
        return { status:'commit-confirmed', why:'three-way-match+opId',
                 remoteRev:rRev, canAdvanceAppliedRev:canAdvance, payloadHash: led.payloadHash };
      }
      stats.stateEquivalentRebased++;
      note({ act:'reconcile', ok:true, status:'state-equivalent-rebased', remoteRev:rRev, appliedRev:applied });
      return { status:'state-equivalent-rebased', why:'three-way-match',
               remoteRev:rRev, canAdvanceAppliedRev:canAdvance, payloadHash: led.payloadHash };
    }, function(){ return ng('hash-failed'); });
  }

  /* ★旧名 reconcile() は fix593 の呼び出し側が使っているので、形を保って残す。
     中身は classify に委譲し、「昇格してよいか」を recoverable として返す。 */
  function reconcile(o){
    o = o || {};
    var rm = o.remote || { rev: o.remoteRev, packageHash: o.remoteHash };
    return classify({ remote: rm, appliedRev: o.appliedRev, identity: o.identity,
                      identityKind: o.identityKind, currentPkg: o.currentPkg,
                      currentHash: o.currentHash, pendingAtStart: o.pendingAtStart,
                      remoteReadFailed: o.remoteReadFailed })
      .then(function(r){
        var okNow = (r.status === 'commit-confirmed' || r.status === 'state-equivalent-rebased');
        return { recoverable: okNow && r.canAdvanceAppliedRev, status: r.status,
                 why: r.why, remoteRev: r.remoteRev, payloadHash: r.payloadHash };
      });
  }

  /* ---- ★reconcile の single-flight（GPT指定3/4） --------------------------
   * 同時に2本走らせない。走っている間に来た要求は「終わったあと最大1回だけ」やり直す。
   * 通信に失敗したときはループさせず、次の起動・復帰・ユーザーpullへ回す。
   * runner は Promise を返す関数（実際に commitstate を叩く処理）。 */
  var reconcileRunning = false, reconcilePendingAgain = false, reconcileGeneration = 0;
  var lastReconcileAt = 0;
  function runReconcile(runner){
    if (off()) { stats.reconcileUnsupported++; return Promise.resolve({ status:'off' }); }
    if (typeof runner !== 'function') return Promise.resolve({ status:'no-runner' });
    if (!hasAwaiting()) return Promise.resolve({ status:'nothing-pending' });
    if (reconcileRunning){
      reconcilePendingAgain = true;
      stats.reconcileSingleFlightJoins++;
      return Promise.resolve({ status:'joined' });
    }
    reconcileRunning = true;
    reconcileGeneration++;
    stats.reconcileAttempts++;
    lastReconcileAt = Date.now();
    var gen = reconcileGeneration;
    var p0 = pendingCommit();                       /* ★開始時の写しを取る */
    return Promise.resolve()
      .then(function(){ return runner({ pendingAtStart: p0, generation: gen }); })
      .then(function(r){ return r || { status:'no-result' }; },
            function(e){ note({ act:'reconcile-threw', why:String(e && e.message || e).slice(0,80) });
                         return { status:'threw' }; })
      .then(function(r){
        reconcileRunning = false;
        if (reconcilePendingAgain){
          reconcilePendingAgain = false;
          /* ★「最大1回だけ」やり直す。ここからさらに連鎖させない。 */
          if (hasAwaiting()){ return runReconcile(runner); }
        }
        return r;
      });
  }
  function reconcileState(){
    return { running: reconcileRunning, pendingAgain: reconcilePendingAgain,
             generation: reconcileGeneration, lastAt: lastReconcileAt };
  }
  /* visibility 復帰時は「pendingがある＋前回から一定以上経過＋いま走っていない」ときだけ呼ぶ */
  var VISIBILITY_MIN_GAP_MS = 60000;
  function shouldReconcileOnResume(){
    if (!hasAwaiting()) return false;
    if (reconcileRunning) return false;
    return (Date.now() - lastReconcileAt) >= VISIBILITY_MIN_GAP_MS;
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
    PACKAGE_SPEC: PACKAGE_SPEC,
    identityKey: identityKey,
    identityKindOf: identityKindOf,
    identityOf: identityOf,
    identityTag: identityTag,
    newCommitOpId: newCommitOpId,
    notePut: notePut,
    noteResult: noteResult,
    reconcile: reconcile,
    /* ★fix596 で足した口 */
    classify: classify,
    runReconcile: runReconcile,
    reconcileState: reconcileState,
    shouldReconcileOnResume: shouldReconcileOnResume,
    pendingCommit: pendingCommit,
    hasAwaiting: hasAwaiting,
    supersedeByPull: supersedeByPull,
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
    /* ★fix596: Worker v25 の commitstate と繋いだので、復帰へ配線済み。 */
    wiredIntoRecovery: true
  };
  try { console.log(TAG, 'loaded', off() ? 'OFF' : 'on'); } catch(e){}
})();
