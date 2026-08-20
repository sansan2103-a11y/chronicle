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
//
// ---------------------------------------------------------------------
// ★★fix597 (2026-07-27) = GPT裁定 D1〜D3 に従って**分類を締める**。
//   fix596 で私が自分の判断で足した3点は、意図はGOだが粒度が粗すぎた。
//
//   D1【条件付きGO】「不一致が確定したら pending を解放する」は正しいが、
//       **2種類の不一致を同じ扱いにしてはいけない**。
//       A) remoteHash !== lastSentHash
//          → canonical は少なくとも自分が送った内容ではない。遮断解除・rev不変・dirty・pull要求。
//          ★ただし「自分のcommitは通らなかった」と**断定してはいけない**。
//            一度通った後に別端末の後続commitへ置き換わった可能性がある。
//            分類名は pending-superseded-by-remote（commit-failed ではない）。
//       B) remoteHash === lastSentHash かつ currentLocalHash !== lastSentHash
//          → lastCommitOpId も一致するなら **自分の commit は確定成功**。
//            commit-confirmed-local-diverged。遮断解除・dirty維持・**自動rev昇格はしない**。
//          ★これを通常の needsPull にしてはいけない。local-ahead 保護で pull がスキップされると
//            appliedRev が古いまま／ローカルが先、で次の put がまた fork する。
//            → 明示的な競合状態 local-diverged-after-commit として持つ。
//
//   D2【意図はGO・完全削除は非推奨】別アカウントの pending は**捨てずに隔離**する。
//       捨てると、そのアカウントへ戻ったときに「応答喪失commitの証拠」を失う。
//       identity 別の隔離領域へ退避し、7日で期限切れにする。
//
//   D3【GO】pull収束後の解放は「commitが成功した」ではなく
//       「現在の canonical を新しい同期基点として正式採用した」。
//       provePullConvergence が通り、identity が一致したときだけ。
//
//   ns【GO】identity は commitstate.ns → meta.ns → 成功put応答.ns → ヘッダ由来 の順。
//       identity を確定できないときは identity-unverified とし、
//       **appliedRev変更0 / pending削除0 / 自動再送0**。
//       ★identity不明を identity不一致として foreign へ捨ててはいけない。
//       ns は生値を localStorage へ置かず SHA-256('chronicle-ns-v1:'+ns) の指紋だけを保存する。
//
//   pkgTs【固定】1 logical put = 1 pkgTs。同じ pending の reconcile では同じ pkgTs。
//       新しい論理 put では新しい pkgTs。前の pending の pkgTs を使い回さない。
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
  var VERSION = 3;
  /* ★fix597: v2 の記録は形が互換（増えただけ）なので**捨てずに読む**。
     捨てると「応答喪失commitの証拠」を失う（GPT裁定D2と同じ理由）。 */
  var ACCEPT_VERSIONS = [2, 3];
  /* ★fix597(GPT裁定D2): 別アカウントの pending の隔離領域。7日で期限切れ。 */
  var FOREIGN_KEY = 'v292Dfix597_foreign';
  /* ★fix599(GPT裁定): 7日でも安全性は壊れない（TTL切れは証拠を失うだけでサーバデータは消えない）が、
     最大20件の上限があり容量影響が小さいので**実用上は30日**。
     長期間アカウントを切り替えたユーザーも自動復帰しやすくなる。 */
  var FOREIGN_TTL_MS = 30 * 24 * 3600 * 1000;
  var FOREIGN_MAX = 20;
  /* ★★fix599(GPT裁定・最重要): pending を解放したあとも、決着するまで**通常putを送ってはいけない**。
     解放した直後に通常putを許すと、**古い appliedRev のまま再び fork する**。
       needsPull=true → 通常putを遮断 → 正式pull か 明示的forceput だけ許可
     local-diverged-after-commit も同じ（そのまま通常putを流してはいけない）。
     pending とは別の状態なので、別のキーに持つ。 */
  var GATE_KEY = 'v292Dfix599_gate';
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
                supersededByPull: 0, foreignPendingDropped: 0,
                /* ★fix597 */
                foreignPendingQuarantined: 0, foreignPendingExpired: 0,
                identityUnverified: 0, pendingSupersededByRemote: 0,
                commitConfirmedLocalDiverged: 0, stateEquivalentLocalDiverged: 0,
                pkgTsReused: 0, nsLearned: 0, pullProofRejected: 0,
                /* ★fix599 */
                gateBlockedPut: 0, gateOpened: 0, gateClosed: 0,
                sameCommitOpIdDifferentPkgTs: 0, sameCommitOpIdDifferentPayload: 0,
                foreignRestored: 0, foreignSupersededByNewer: 0,
                /* ★fix713: legacy package の容量超過で送信を止めた回数と、
                   実送信したが失敗したものの status/errorCode を拾えた回数。 */
                legacyPackageTooLarge: 0, legacyPackageUnmeasurable: 0,
                legacyPackageUnmeasurableBlocked: 0, transportFailuresRecorded: 0 };
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

  /* ---- ★★fix713(GPT裁定): LEGACY PACKAGE OVERSIZE GUARD の記録口 -----------
   * 2026-08-20 の実測で、main の legacy full package が UTF-8 5,923,532 bytes になり、
   * Worker の 4MB 上限を超えて **HTTP 413 / errorCode too-large** で弾かれていた。
   * しかも push() の .catch は引数を取らないので、status も errorCode も残らず、
   * 「上げられませんでした」だけが出て原因を追えなかった。
   * ここは **新しい台帳を作らず**、既存のメモリ台帳(LOG)と stats へ流すだけ。
   *   ★localStorage の新しいキーは作らない（GPT指定）。
   *   ★本文・package の中身は一切記録しない。長さと分類だけ。
   *   ★判定そのものは各 writer の送信直前で行う（このモジュールの読み込み順や
   *     v292Dfix590Off に依存させないため。依存させると、台帳が無いときに
   *     5.9MB を送ってしまう）。 */
  var LEGACY_PACKAGE_LIMIT_BYTES = 4 * 1024 * 1024;   /* Worker 側と完全に同じ境界 */
  /* pkg → Worker が str として受け取るのと**同じ文字列**の UTF-8 byte 長。
     測れないときは null（= 止めない。測れないことを理由に 4MB 未満の送信まで
     止める方が害が大きい）。 */
  function legacyPackageBytes(pkg){
    var s = payloadString(pkg);
    if (s == null) return null;
    try {
      if (typeof TextEncoder === 'undefined') return null;
      return new TextEncoder().encode(s).length;
    } catch(e){ return null; }
  }
  function legacyPackageOversize(pkg){
    var b = legacyPackageBytes(pkg);
    if (b == null){
      stats.legacyPackageUnmeasurable++;
      return { measurable:false, bytes:null, limit:LEGACY_PACKAGE_LIMIT_BYTES, over:false };
    }
    return { measurable:true, bytes:b, limit:LEGACY_PACKAGE_LIMIT_BYTES,
             over: (b > LEGACY_PACKAGE_LIMIT_BYTES) };
  }
  /* 送信を止めたことを記録する。**黙って止めない**。 */
  function noteOversizeBlocked(o){
    o = o || {};
    try { stats.legacyPackageTooLarge++; } catch(e){}
    bump('legacyPackageTooLarge');
    note({ act:'legacy-package-too-large',
           stage: String(o.stage == null ? 'unknown' : o.stage).slice(0, 40),
           bytes: (o.bytes == null ? null : +o.bytes),
           limit: LEGACY_PACKAGE_LIMIT_BYTES,
           op: (o.op == null ? null : String(o.op).slice(0, 16)),
           commitOpId: (o.commitOpId == null ? null : String(o.commitOpId).slice(0, 128)),
           payloadHash: (o.payloadHash == null ? null : String(o.payloadHash).slice(0, 64)) });
    return { ok:false, code:'LEGACY_PACKAGE_TOO_LARGE',
             bytes:(o.bytes == null ? null : +o.bytes), limit:LEGACY_PACKAGE_LIMIT_BYTES };
  }
  /* ★★fix713(GPT裁定 追補): 測定できないときは **送らない**（fail-closed）。
     「5.9MB を止める安全弁」なのに「測れなければ送ってみる」では役目を果たさない。
     正常な Chronicle package は素の JSON なので、測定不能そのものを異常として扱ってよい。
     ★記録するのは stage / op / 分類 / 時刻だけ。package 本文は記録しない。 */
  function noteSizeUnmeasurable(o){
    o = o || {};
    try { stats.legacyPackageUnmeasurableBlocked++; } catch(e){}
    bump('legacyPackageSizeUnmeasurable');
    note({ act:'legacy-package-size-unmeasurable',
           stage: String(o.stage == null ? 'unknown' : o.stage).slice(0, 40),
           op: (o.op == null ? null : String(o.op).slice(0, 16)) });
    return { ok:false, code:'LEGACY_PACKAGE_SIZE_UNMEASURABLE', limit:LEGACY_PACKAGE_LIMIT_BYTES };
  }
  /* 実送信して失敗したときの status / errorCode を捨てないための口。
     ★大規模な telemetry にはしない。分類に必要なスカラだけ。 */
  function noteTransportFailure(o){
    o = o || {};
    try { stats.transportFailuresRecorded++; } catch(e){}
    note({ act:'transport-failure',
           stage: String(o.stage == null ? 'unknown' : o.stage).slice(0, 40),
           op: (o.op == null ? null : String(o.op).slice(0, 16)),
           httpStatus: (o.httpStatus == null ? null : +o.httpStatus),
           errorCode: (o.errorCode == null ? null : String(o.errorCode).slice(0, 64)),
           commitOpId: (o.commitOpId == null ? null : String(o.commitOpId).slice(0, 128)) });
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
  /* ---- ★fix597: ns の指紋（GPT指定） -------------------------------------
   * Worker の ns は SHA256(secret salt | codeKey) の先頭32hex で、salt は Worker の秘密。
   * つまり ns 自体すでに非可逆で非PIIだが、**生値は localStorage へ置かない**方針を明示的に守る。
   *   保存するもの : SHA-256('chronicle-ns-v1:' + ns)   ← 指紋だけ
   *   メモリだけ   : 生の ns
   * 指紋は SHA-256 なので、shortHash と違って衝突を心配しなくてよい。 */
  var NS_FP_KEY = 'v292Dfix597_nsfp';
  var NS_RAW = null, NS_FP = null, nsLearning = null;
  function nsFingerprint(ns){
    return sha256Hex('chronicle-ns-v1:' + String(ns == null ? '' : ns));
  }
  function storedNsFp(){
    if (NS_FP) return NS_FP;
    var v = lsg(NS_FP_KEY);
    if (v && /^[0-9a-f]{64}$/.test(v)) { NS_FP = v; return v; }
    return null;
  }
  /* 生の ns を受け取って指紋を作り、指紋だけ保存する。戻り: Promise<fp|null> */
  function learnNs(ns){
    if (!ns) return Promise.resolve(storedNsFp());
    ns = String(ns);
    if (NS_RAW === ns && NS_FP) return Promise.resolve(NS_FP);
    if (nsLearning && nsLearning.ns === ns) return nsLearning.p;
    var p = nsFingerprint(ns).then(function(fp){
      NS_RAW = ns; NS_FP = fp;
      try { localStorage.setItem(NS_FP_KEY, fp); } catch(e){}
      stats.nsLearned++;
      note({ act:'ns-learned' });      /* ★ns も指紋もログに出さない */
      return fp;
    }, function(){ return null; });
    nsLearning = { ns: ns, p: p };
    return p;
  }
  /* いまメモリにある生の ns（同じセッション中の再利用用。**保存しない**） */
  function knownNsRaw(){ return NS_RAW; }
  function forgetNs(){ NS_RAW = null; NS_FP = null; nsLearning = null;
                       try { localStorage.removeItem(NS_FP_KEY); } catch(e){} }

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
  /* ★★fix597(GPT指定): identity の優先順を固定する。
       commitstate.ns → meta.ns → 成功put応答.ns → ヘッダ由来（最後の手段）
     ns 由来のときは **SHA-256 指紋**を使う（生値も shortHash も使わない）。
     ここは同期関数なので、指紋が未計算のときは null を返す＝identity-unverified。
     呼び出し側は identityOfAsync を使えば、必要なら指紋の計算を待てる。 */
  function identityOf(o){
    o = o || {};
    if (o.nsFp) return 'id_ns_' + String(o.nsFp);
    if (o.ns){
      var raw = String(o.ns);
      if (NS_RAW === raw && NS_FP) return 'id_ns_' + NS_FP;
      return null;                       /* ★指紋が未計算 = まだ確定できない */
    }
    var fp = storedNsFp();
    if (fp && o.useStoredNs !== false && !o.identity) return 'id_ns_' + fp;
    if (o.identity) return identityKey(o.identity, o.identityKind || identityKindOf(o.identity));
    return null;
  }
  /* ns が渡されていれば指紋を作ってから identity を返す */
  function identityOfAsync(o){
    o = o || {};
    if (o.ns) return learnNs(o.ns).then(function(){ return identityOf(o); });
    return Promise.resolve(identityOf(o));
  }
  /* ★identity を確定できたか（できていないなら何も書き換えてはいけない） */
  function identityResolvable(o){ return identityOf(o) != null; }

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
    try {
      var o = JSON.parse(lsg(KEY) || 'null');
      if (!o) return null;
      /* ★fix597: v2 は形が互換（増えただけ）なので読む。捨てると証拠を失う。 */
      if (ACCEPT_VERSIONS.indexOf(o.v) === -1) return null;
      return o;
    } catch(e){ return null; }
  }
  function write(o){
    try { localStorage.setItem(KEY, JSON.stringify(o)); return true; }
    catch(e){ stats.persistFailed++; note({ act:'persist-failed', why:String(e && e.name) }); return false; }
  }
  function clear(){ try { localStorage.removeItem(KEY); } catch(e){} }

  /* ---- ★★fix599(GPT裁定): 決着するまで通常putを止める関門 ------------------
   * fix597 は「不一致が確定したら pending を解放する」を実装したが、
   * **解放した直後から通常putが素通りになる**という穴が残っていた。
   * その状態の appliedRev は古いままなので、次の put は必ずまた fork する。
   * → 解放と同時にこの関門を閉め、次のどちらかでしか開かないようにする:
   *     ・正式な pull の収束（supersedeByPull / closeGate('pull-converged')）
   *     ・ユーザーが明示した forceput（この端末をクラウドの正にする）
   * ★pending とは別物。pending は「結果不明」、関門は「結果は分かったが、まだ足並みが揃っていない」。 */
  function readGate(){
    try { var g = JSON.parse(lsg(GATE_KEY) || 'null'); return (g && g.reason) ? g : null; }
    catch(e){ return null; }
  }
  function openGate(o){
    o = o || {};
    var g = { reason: String(o.reason || 'needs-pull'),
              conflictState: o.conflictState || null,
              remoteRev: (o.remoteRev == null ? null : +o.remoteRev),
              identity: o.identity || null,
              since: Date.now() };
    try { localStorage.setItem(GATE_KEY, JSON.stringify(g)); } catch(e){ stats.persistFailed++; }
    stats.gateOpened++;
    note({ act:'gate-opened', reason: g.reason, conflictState: g.conflictState, remoteRev: g.remoteRev });
    return g;
  }
  function closeGate(why){
    var g = readGate();
    if (!g) return { ok:false, code:'not-open' };
    try { localStorage.removeItem(GATE_KEY); } catch(e){}
    stats.gateClosed++;
    note({ act:'gate-closed', why: String(why || '').slice(0, 40), heldSec: Math.round((Date.now() - g.since)/1000) });
    return { ok:true, was: g };
  }
  function gateState(){ return readGate(); }
  /* ★関門が閉じていても通してよいのは「ユーザーが明示した forceput」だけ。
     fix399 の通常同期は op:'put' なので必ず止まる。home の「☁ いま上げる」は forceput。 */
  function gateAllows(o){
    o = o || {};
    return (o.op === 'forceput');
  }

  /* ---- ★fix597(GPT裁定D2): 別 identity の pending は**捨てずに隔離する** -----
   * 完全削除すると、元のアカウントへ戻ったときに
   *   「応答喪失commitの証拠（commitOpId / payloadHash）」
   * を失う。現アカウントの put は遮断しないが、記録は残す。
   * 理想は pendingCommitsByIdentity[identityTag] だが、初版は短期の診断領域に退避し
   * 7日で期限切れにする（GPT指定）。 */
  function readForeign(){
    try {
      var a = JSON.parse(lsg(FOREIGN_KEY) || '[]');
      return Object.prototype.toString.call(a) === '[object Array]' ? a : [];
    } catch(e){ return []; }
  }
  function pruneForeign(list){
    var now = Date.now(), out = [];
    for (var i = 0; i < list.length; i++){
      var r = list[i];
      if (!r || typeof r !== 'object') continue;
      var born = +r.quarantinedAt || +r.createdAt || 0;
      if (born && (now - born) > FOREIGN_TTL_MS){ stats.foreignPendingExpired++; continue; }
      out.push(r);
    }
    if (out.length > FOREIGN_MAX) out = out.slice(out.length - FOREIGN_MAX);
    return out;
  }
  function quarantineForeign(rec){
    if (!rec) return { ok:false, code:'no-record' };
    var list = pruneForeign(readForeign());
    /* 同じ commitOpId を二重に積まない */
    for (var i = 0; i < list.length; i++){
      if (list[i] && String(list[i].commitOpId) === String(rec.commitOpId)) { list.splice(i, 1); break; }
    }
    list.push({ identityTag: rec.identity || null, status: 'foreign-pending',
                op: rec.op || null, commitOpId: rec.commitOpId || null,
                payloadHash: rec.payloadHash || null, baseRev: (rec.baseRev == null ? null : +rec.baseRev),
                pkgTs: (rec.pkgTs == null ? null : +rec.pkgTs),
                createdAt: +rec.createdAt || 0, quarantinedAt: Date.now() });
    list = pruneForeign(list);
    try { localStorage.setItem(FOREIGN_KEY, JSON.stringify(list)); }
    catch(e){ stats.persistFailed++; note({ act:'foreign-persist-failed', why:String(e && e.name) });
              return { ok:false, code:'persist-failed' }; }
    stats.foreignPendingQuarantined++;
    note({ act:'foreign-pending-quarantined', commitOpId: rec.commitOpId });
    return { ok:true, count: list.length };
  }
  /* 隔離された pending の一覧（★identityTag は指紋なので中身は伏せられている） */
  function foreignPendings(){
    var list = pruneForeign(readForeign());
    try { localStorage.setItem(FOREIGN_KEY, JSON.stringify(list)); } catch(e){}
    return list.slice();
  }
  /* そのアカウントへ戻ったときに証拠を取り戻す（★台帳へは自動で戻さない。読むだけ） */
  function foreignPendingsFor(identityTag){
    if (!identityTag) return [];
    return foreignPendings().filter(function(r){ return r && String(r.identityTag) === String(identityTag); });
  }
  /* ★★fix599(GPT裁定): 元のアカウントへ戻ったときの**復帰規則**を固定する。
       identity確定 → active pending が無い → foreign から同一identityを検索
       → **最新の未解決1件だけ** active候補へ → 先に reconcile
       古いものは superseded-by-newer-local-attempt として診断保存する
     ★同じ identity の foreign が複数あっても**無条件に全部戻してはいけない**（GPT明示）。
       古い試行を戻すと、より新しい試行の結果を古い証拠で上書きしてしまう。
     戻り: { ok, restored?:snapshot, superseded:number, code? } */
  function restoreForeignFor(identityTag){
    if (!identityTag) return { ok:false, code:'no-identity' };
    if (hasAwaiting()) return { ok:false, code:'active-pending-exists' };
    var list = foreignPendings();
    var mine = [], rest = [];
    for (var i = 0; i < list.length; i++){
      if (list[i] && String(list[i].identityTag) === String(identityTag)) mine.push(list[i]);
      else rest.push(list[i]);
    }
    if (!mine.length) return { ok:false, code:'nothing-to-restore' };
    /* 最新＝createdAt が最大のもの1件だけ */
    mine.sort(function(a, b){ return (+a.createdAt || 0) - (+b.createdAt || 0); });
    var newest = mine[mine.length - 1];
    var older  = mine.slice(0, mine.length - 1);
    var rec = { v: VERSION, spec: HASH_SPEC, packageSpec: PACKAGE_SPEC,
                op: newest.op || 'put', commitOpId: newest.commitOpId,
                pkgTs: (newest.pkgTs == null ? null : +newest.pkgTs),
                identity: identityTag,
                baseRev: (newest.baseRev == null ? null : +newest.baseRev),
                payloadHash: newest.payloadHash,
                createdAt: +newest.createdAt || Date.now(),
                status: 'awaiting-result', source: 'restored-from-foreign' };
    if (!write(rec)) return { ok:false, code:'persist-failed' };
    /* 古いものは診断として残す（消さない。ただし復帰候補にはしない） */
    for (var k = 0; k < older.length; k++){
      older[k].status = 'superseded-by-newer-local-attempt';
      stats.foreignSupersededByNewer++;
      rest.push(older[k]);
    }
    try { localStorage.setItem(FOREIGN_KEY, JSON.stringify(pruneForeign(rest))); } catch(e){}
    stats.foreignRestored++;
    note({ act:'foreign-restored', commitOpId: newest.commitOpId, superseded: older.length });
    /* ★戻したものは「結果不明」なので、まず reconcile させる。ここでは送信を許可しない。 */
    return { ok:true, restored: snapshotOf(rec), superseded: older.length, needsReconcile:true };
  }
  function clearForeign(){ try { localStorage.removeItem(FOREIGN_KEY); } catch(e){} }

  /* ---- ★★fix603: 隔離した証拠を、元のアカウントへ戻ったときに実際に復帰させる ----
   * fix599 で restoreForeignFor() は作ったのに、**どこからも呼んでいなかった**。
   * つまり D2 の目的（アカウントを戻したときに応答喪失commitの証拠を取り戻す）は
   * 実装されているのに一度も達成されない状態だった。
   * ★これは「作ったが配線していない」型（fix579 の visible() と同じ）。
   *   ライブラリを足したら、**呼ぶ側を必ず同じ回で書く**。
   * 呼ぶ場所は reconcile の**入口**（pendingAtStart を採る前）でなければならない。
   * あとから戻すと TOCTOU 判定で reconcile-stale になり、せっかく戻した証拠が使われない。 */
  function restoreForeignIfIdle(o){
    if (off()) return Promise.resolve({ ok:false, code:'off' });
    if (hasAwaiting()) return Promise.resolve({ ok:false, code:'active-pending-exists' });
    if (!foreignPendings().length) return Promise.resolve({ ok:false, code:'nothing-to-restore' });
    return identityOfAsync(o || {}).then(function(tag){
      /* identity が確定できないときは何もしない（GPT指定: 未確定を不一致として扱わない） */
      if (!tag) return { ok:false, code:'identity-unverified' };
      return restoreForeignFor(tag);
    }, function(){ return { ok:false, code:'identity-unverified' }; });
  }

  /* ---- ① put の直前に呼ぶ ------------------------------------------------
   * 戻り: { ok, payloadHash, persisted }
   * ★persisted:false のときは「自動照合不能」。fork したら pull を要求する（GPT指定）。 */
  function notePut(o){
    o = o || {};
    if (off()) return Promise.resolve({ ok:false, code:'off' });
    /* ★★fix596(GPT指定3): 未解決の pending を**上書きしない**。
       上書きすると「前回のコミットが通ったのか」の証拠が消える。
       呼び出し側は blocked を見たら**送信せず**、ローカル変更を dirty として溜める。 */
    /* ★fix597: ns が渡されていれば、まず指紋を作って identity を確定できるようにする。 */
    return identityOfAsync(o).then(function(meNow){
    /* ★★fix599(GPT裁定): 決着していない状態で通常putを送らせない。
       ここを通すと、古い appliedRev のまま送って**また fork する**。 */
    var gate = readGate();
    if (gate && !gateAllows(o)){
      stats.gateBlockedPut++;
      note({ act:'blocked-by-gate', reason: gate.reason, conflictState: gate.conflictState });
      return { ok:false, code:'resolution-required', blocked:true, gate: {
        reason: gate.reason, conflictState: gate.conflictState,
        remoteRev: gate.remoteRev, since: gate.since,
        /* ユーザーに出せる選択肢（GPT指定の実処理） */
        choices: (gate.conflictState === 'local-diverged-after-commit')
                 ? ['adopt-remote', 'make-this-device-canonical'] : ['adopt-remote'] } };
    }
    var prev = read();
    if (prev && prev.status === 'awaiting-result'){
      /* ★★fix596c/fix597: 止めてよいのは「**自分の**未解決の保留」だけ。
         別アカウントの保留（この端末を別の人が使った等）は、こちらでは決着させようがない。
         それで送信を止めると**自分の保存が永久にできなくなる**ので、先へ進む。
         ★fix597(GPT裁定D2): ただし**捨てずに隔離する**。捨てると、そのアカウントへ戻ったときに
           応答喪失commitの証拠（commitOpId / payloadHash）を失う。
         ★fix597(GPT指定): identity を**確定できない**ときは foreign 扱いにしてはいけない。
           確定できないなら「自分のかもしれない」ので、安全側＝遮断のまま据え置く。 */
      if (prev.identity && meNow == null){
        stats.identityUnverified++;
        note({ act:'blocked-new-put', why:'identity-unverified', pendingOpId: prev.commitOpId });
        return { ok:false, code:'identity-unverified', blocked:true, pending: snapshotOf(prev) };
      }
      var sameOwner = !prev.identity || !meNow || prev.identity === meNow;
      if (sameOwner){
        stats.pendingBlockedNewPut++;
        note({ act:'blocked-new-put', pendingOpId: prev.commitOpId, pendingSince: prev.createdAt });
        return { ok:false, code:'pending-unresolved', blocked:true, pending: snapshotOf(prev) };
      }
      quarantineForeign(prev);
      clear();
    }
    /* ★★fix599(GPT裁定): pkgTs に必要なのは**一意性ではない**。
       「同じ論理putでは、送信時と reconcile 時に同じ値を使う」ことだけが要件。
       連続した別 put が同じミリ秒になるのは**異常ではない**ので、それで止めてはいけない
       （fix597 の pkgTsReused はこの誤検知を含んでいた）。
       正しい不変条件は commitOpId を起点に置く:
         同じ commitOpId + pkgTs が違う       → **送信停止**
         同じ commitOpId + payloadHash が違う → **送信停止**
         違う commitOpId + 偶然 pkgTs が同じ  → 許可（正常）
       ここが破れていると、照合が「別の送信の内容」と一致してしまう。 */
    var reuse = null;
    if (o.commitOpId && lastLogicalPut.commitOpId &&
        String(o.commitOpId) === String(lastLogicalPut.commitOpId)){
      if (o.pkgTs != null && lastLogicalPut.pkgTs != null && +o.pkgTs !== +lastLogicalPut.pkgTs){
        stats.sameCommitOpIdDifferentPkgTs++;
        reuse = 'same-commit-op-id-different-pkg-ts';
      }
    }
    if (reuse){
      note({ act:'blocked-invariant', why: reuse, commitOpId: String(o.commitOpId) });
      return { ok:false, code: reuse, blocked:true };
    }
    return payloadHash(o.pkg).then(function(ph){
    /* 同じ commitOpId なのに中身が変わっている場合も止める（hash が出てから判定できる） */
    if (ph != null && o.commitOpId && lastLogicalPut.commitOpId &&
        String(o.commitOpId) === String(lastLogicalPut.commitOpId) &&
        lastLogicalPut.payloadHash && ph !== lastLogicalPut.payloadHash){
      stats.sameCommitOpIdDifferentPayload++;
      note({ act:'blocked-invariant', why:'same-commit-op-id-different-payload', commitOpId: String(o.commitOpId) });
      return { ok:false, code:'same-commit-op-id-different-payload', blocked:true };
    }
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
                  identity: meNow,
                  baseRev: (o.baseRev == null ? null : +o.baseRev),
                  payloadHash: ph, createdAt: Date.now(), status: 'awaiting-result',
                  source: String(o.source || 'unknown') };
      var persisted = write(rec);
      lastLogicalPut = { commitOpId: commitOpId, pkgTs: rec.pkgTs, payloadHash: ph };
      note({ act:'put', op: op, source: rec.source, baseRev: rec.baseRev,
             commitOpId: commitOpId, persisted: persisted });
      return { ok:true, payloadHash: ph, commitOpId: commitOpId, op: op, persisted: persisted,
               identityResolved: meNow != null };
    }, function(){ return { ok:false, code:'hash-failed' }; });
    });
  }
  /* ★fix597/599: 直近の論理 put（同じ commitOpId で中身がぶれていないかを見張る） */
  var lastLogicalPut = { commitOpId: null, pkgTs: null, payloadHash: null };

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
      var wasOp = String(cur.op || 'put');
      clear();
      stats.commitConfirmed++;
      /* ★★fix603: **確定した forceput は関門を閉じる**。
         2026-07-27 に発見（テストの契約を書き直している最中に見つかった）:
         関門を閉じるのは fix399 の三者一致と supersedeByPull の2箇所だけで、
         **`make-this-device-canonical`（＝home の「☁ いま上げる」= forceput）を選んでも閉じなかった**。
         forceput は成功し pending も消えるので、その後 runReconcile は 'nothing-pending' になり、
         三者一致の経路にも入らない。結果、**関門が開いたまま残り、以後の通常putが永久に
         resolution-required でブロックされる**（毎回 forceput を強いられる）。
         fix599 が塞いだはずのデッドロックと同じ形が、選択肢の側に残っていた。
         ★GPT裁定: 「make-this-device-canonical → 墓標保護付き forceput」で決着させる、が正。
         ★閉じるのは **応答の検証を全部通った(allOk)場合だけ**。ok:true だけでは閉じない。 */
      var closed = null;
      if (wasOp === 'forceput'){
        try { if (readGate()) closed = closeGate('forceput-confirmed'); } catch(e){}
      }
      note({ act:'commit-confirmed', rev: rev, commitOpId: cur.commitOpId, op: wasOp,
             gateClosed: !!(closed && closed.ok), source: String(o.source || 'unknown') });
      return { status:'commit-confirmed', rev: rev, commitOpId: cur.commitOpId, op: wasOp,
               gateClosed: !!(closed && closed.ok) };
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
  /* ★★fix597(GPT裁定D3): 解放してよい条件を締める。
     意味は「pending の commit が成功した」ではなく
     **「現在の canonical を新しい同期基点として正式に採用した」**。
     必須条件（GPT列挙）:
       identity一致 / pull収束証明成功 / remoteRev有効 / applyErrors=0 /
       競合スキップ0 / unknownSkips=0 / metaMerge成功 / 再読込検証成功
     → 収束証明 provePullConvergence がこの全部を見ているので、その結果を要求する。
     戻り値の syncDirty:
       remote を完全採用したときだけ false にしてよい。
       ローカル墓標などを merge 保持した pull は dirty=true のまま（未同期の変更が載っているため）。
     引数は { remoteRev, proof, identity|ns|nsFp, fullyAdoptedRemote } を推奨。
     互換のため数値ひとつでも呼べるが、その場合は**証明なし**として拒否する。 */
  function supersedeByPull(o){
    if (typeof o === 'number' || typeof o === 'string'){
      stats.pullProofRejected++;
      note({ act:'superseded-by-pull', ok:false, why:'proof-required' });
      return { ok:false, code:'proof-required' };
    }
    o = o || {};
    var cur = read();
    if (!cur) return { ok:false, code:'no-ledger' };
    var proofOk = !!(o.proof && o.proof.ok === true);
    if (!proofOk){
      stats.pullProofRejected++;
      note({ act:'superseded-by-pull', ok:false, why:(o.proof && o.proof.why) || 'no-proof',
             commitOpId: cur.commitOpId });
      return { ok:false, code:'pull-not-converged', why:(o.proof && o.proof.why) || 'no-proof' };
    }
    var rRev = (o.remoteRev == null) ? null : +o.remoteRev;
    if (rRev == null || !isFinite(rRev) || rRev < 0) return { ok:false, code:'remote-rev-invalid' };
    /* ★identity: 確定できないなら pending を消してはいけない（GPT指定）。 */
    var idNow = identityOf(o);
    if (cur.identity && idNow == null){
      stats.identityUnverified++;
      note({ act:'superseded-by-pull', ok:false, why:'identity-unverified' });
      return { ok:false, code:'identity-unverified' };
    }
    if (cur.identity && idNow && cur.identity !== idNow){
      note({ act:'superseded-by-pull', ok:false, why:'identity-mismatch' });
      return { ok:false, code:'identity-mismatch' };
    }
    clear();
    stats.supersededByPull++;
    /* ★★fix599(GPT裁定): fullyAdoptedRemote は**呼出側の申告ではなく収束証明から導出**する。
       呼出側が自由に true を渡せる形だと、将来の別経路が誤って true を渡し、
       ローカル差分（墓標など）を抱えたまま dirty を落として**未同期の変更を失う**。
       proof が答えを持っていればそれを使い、無ければ**安全側（false＝dirty維持）**。 */
    var fully = (o.proof && typeof o.proof.fullyAdoptedRemote === 'boolean')
                ? o.proof.fullyAdoptedRemote
                : (o.proof && o.proof.retainedLocalDeltaCount === 0 &&
                   o.proof.metaMergedWithLocalDelta === false);
    fully = (fully === true);
    /* ★正式な pull が収束したので、決着待ちの関門も開ける（GPT指定の adopt-remote 経路） */
    closeGate('pull-converged');
    note({ act:'superseded-by-pull', ok:true, remoteRev: rRev, fullyAdoptedRemote: fully,
           commitOpId: cur.commitOpId });
    return { ok:true, commitOpId: cur.commitOpId, status:'superseded-by-pull',
             remoteRev: rRev,
             /* ★remote を完全採用した場合のみ dirty を落としてよい */
             syncDirty: !fully, canAdvanceAppliedRev: true };
  }
  /* ★fix597: 生の ns を渡す場合、指紋の計算が終わるまで identity を確定できない。
     生の ns を持っている呼び出し側はこちらを使う（指紋を作ってから同期版を呼ぶ）。 */
  function supersedeByPullAsync(o){
    o = o || {};
    if (!o.ns) return Promise.resolve(supersedeByPull(o));
    return learnNs(o.ns).then(function(){ return supersedeByPull(o); },
                             function(){ return supersedeByPull(o); });
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
  /* ★fix597: ns を渡された場合、指紋の計算が終わるまで identity を確定できない。
     ここで一度だけ待ってから本体へ入る（本体は同期的に identityOf を使える）。 */
  function classify(o){
    o = o || {};
    if (o.ns && !identityResolvable(o)){
      return learnNs(o.ns).then(function(){ return classifyInner(o); },
                               function(){ return classifyInner(o); });
    }
    return classifyInner(o);
  }
  function classifyInner(o){
    o = o || {};
    function ng(why, extra){
      stats.reconcileNg++; bump(why); note({ act:'reconcile', ok:false, why:why });
      var r = { status:'no', why:why, canAdvanceAppliedRev:false,
                /* ★fix597: 既定は「何も変えない」。解放してよい分類だけが releasePending:true を返す。 */
                releasePending:false, resolved:false, commitOutcome:'unknown',
                syncDirty:true, needsPull:true };
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

    /* ★★fix597(GPT指定): identity を**確定できない**ことと、identity が**違う**ことを分ける。
       確定できないのに「違う」として foreign へ捨てるのが一番危ない。
       identity-unverified のときは appliedRev変更0 / pending削除0 / 自動再送0。 */
    var idNow = identityOf(o);
    if (led.identity && idNow == null){
      stats.identityUnverified++;
      return ng('identity-unverified', { releasePending:false, mutatePending:false, needsIdentity:true });
    }
    if (led.identity && idNow && led.identity !== idNow) return ng('identity-mismatch');

    var applied = +o.appliedRev || 0;
    /* ★rev は巻き戻さない。remoteRev < appliedRev は異常として、昇格も pending 解除もしない。 */
    if (rRev < applied) return ng('remote-rev-behind');

    var curP = (o.currentHash != null) ? Promise.resolve(String(o.currentHash)) : payloadHash(o.currentPkg);
    return curP.then(function(curHash){
      if (curHash == null) return ng('hash-failed');

      var opMatchEarly = (rm.lastCommitOpId != null) &&
                         (String(rm.lastCommitOpId) === String(led.commitOpId));

      /* ================= ★fix597 / GPT裁定D1 ケースA =========================
         remoteHash !== lastSentHash
           canonical は「少なくとも pending が指していた送信内容ではない」。
           pending の曖昧性は**解消している**ので、遮断は解除してよい。
           ★ただし「自分の commit は通らなかった」と断定してはいけない。
             一度通った後、別端末の後続 commit に置き換わった可能性がある。
           分類は pending-superseded-by-remote。commit-failed ではない。
           appliedRev は動かさない / dirty=true / needsPull=true。 */
      if (rHash !== led.payloadHash){
        stats.realConflicts++;
        stats.pendingSupersededByRemote++;
        bump('pending-superseded-by-remote');
        note({ act:'reconcile', ok:true, status:'pending-superseded-by-remote',
               remoteRev:rRev, appliedRev:applied, opMatch:opMatchEarly });
        return { status:'pending-superseded-by-remote',
                 why:'remote-diverged-from-pending',
                 remoteRev: rRev,
                 canAdvanceAppliedRev: false,   /* ★rev は進めない */
                 releasePending: true,          /* ★遮断は解除してよい（曖昧ではない） */
                 resolved: true,
                 commitOutcome: 'unknown',      /* ★通った/通らなかったを断定しない */
                 syncDirty: true,
                 needsPull: true,
                 /* ★★fix599(GPT裁定): pending を解放しても、**通常putはpull完了まで止める**。
                    ここを開けたままにすると、古い appliedRev のまま送って再び fork する。 */
                 openGate: 'needs-pull' };
      }

      /* ================= ★fix597 / GPT裁定D1 ケースB =========================
         remoteHash === lastSentHash かつ currentLocalHash !== lastSentHash
           pending の送信結果は canonical に存在するが、その後ローカルが先へ進んだ。
           lastCommitOpId も一致するなら **pending の commit 自体は確定成功**。
           遮断解除 / dirty=true / ★自動 rev 昇格はしない。
           ★通常の needsPull にしてはいけない（GPT明示）。
             local-ahead 保護で pull がスキップされると
             appliedRev は古いまま・ローカルは先・次 put でまた fork、になる。
             → 明示的な競合状態 local-diverged-after-commit として持つ。
           ★自動 rebase は parentPayloadHash / localGeneration で
             「ローカルQが送信済みPから派生した」ことを証明できるようになってから。 */
      if (curHash !== led.payloadHash){
        if (opMatchEarly){
          stats.commitConfirmedLocalDiverged++;
          bump('commit-confirmed-local-diverged');
          note({ act:'reconcile', ok:true, status:'commit-confirmed-local-diverged',
                 remoteRev:rRev, appliedRev:applied });
          return { status:'commit-confirmed-local-diverged',
                   why:'remote-equals-last-sent+local-advanced',
                   remoteRev: rRev,
                   canAdvanceAppliedRev: false,        /* ★証明が無い間は自動昇格しない */
                   releasePending: true,
                   resolved: true,
                   commitOutcome: 'confirmed',
                   syncDirty: true,
                   needsPull: false,                    /* ★通常の pull 要求にしない */
                   conflictState: 'local-diverged-after-commit',
                   /* ★★fix599(GPT裁定): この状態のまま通常putを流してはいけない。
                      adopt-remote（明示的pull）か make-this-device-canonical
                      （墓標保護付きforceput）でしか進めない。 */
                   openGate: 'local-diverged-after-commit',
                   choices: ['adopt-remote', 'make-this-device-canonical'] };
        }
        /* lastCommitOpId が一致しない＝中身は同じでも自分の commit の証明にはならない。
           それでも canonical と「送ったもの」は一致しているので曖昧ではない。 */
        stats.stateEquivalentLocalDiverged++;
        bump('state-equivalent-local-diverged');
        note({ act:'reconcile', ok:true, status:'state-equivalent-local-diverged',
               remoteRev:rRev, appliedRev:applied });
        return { status:'state-equivalent-local-diverged',
                 why:'remote-equals-last-sent+local-advanced+no-opid',
                 remoteRev: rRev,
                 canAdvanceAppliedRev: false,
                 releasePending: true,
                 resolved: true,
                 commitOutcome: 'unknown',
                 syncDirty: true,
                 needsPull: false,
                 conflictState: 'local-diverged-after-commit',
                 openGate: 'local-diverged-after-commit',
                 choices: ['adopt-remote', 'make-this-device-canonical'] };
      }

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
                 remoteRev:rRev, canAdvanceAppliedRev:canAdvance, payloadHash: led.payloadHash,
                 /* ★fix597: 戻り値の形を全分類でそろえる（呼び出し側の分岐を減らす） */
                 releasePending:true, resolved:true, commitOutcome:'confirmed',
                 syncDirty:false, needsPull:false, openGate:null };
      }
      stats.stateEquivalentRebased++;
      note({ act:'reconcile', ok:true, status:'state-equivalent-rebased', remoteRev:rRev, appliedRev:applied });
      return { status:'state-equivalent-rebased', why:'three-way-match',
               remoteRev:rRev, canAdvanceAppliedRev:canAdvance, payloadHash: led.payloadHash,
               releasePending:true, resolved:true, commitOutcome:'unknown',
               syncDirty:false, needsPull:false, openGate:null };
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
        /* ★fix597: 「revを進めてよいか」は canAdvanceAppliedRev が単独で表す。
           local-diverged 系は resolved:true でも canAdvanceAppliedRev:false なので昇格しない。 */
        var okNow = (r.status === 'commit-confirmed' || r.status === 'state-equivalent-rebased');
        return { recoverable: okNow && r.canAdvanceAppliedRev, status: r.status,
                 why: r.why, remoteRev: r.remoteRev, payloadHash: r.payloadHash,
                 releasePending: !!r.releasePending, resolved: !!r.resolved,
                 conflictState: r.conflictState || null, needsPull: !!r.needsPull };
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
    /* ★★fix599(GPT指定): 「remote を完全採用したか」を**証明の側で**決める。
       ローカル差分（墓標など）を merge 保持したなら完全採用ではない＝dirty を落とせない。 */
    var retained = (+o.retainedLocalDeltaCount || 0);
    var mergedWithLocal = (o.metaMergedWithLocalDelta === true);
    var fullyAdoptedRemote = (retained === 0 && !mergedWithLocal);
    note({ act:'pull-proof', ok:true, remoteRev:+o.remoteRev,
           retainedLocalDeltaCount: retained, fullyAdoptedRemote: fullyAdoptedRemote });
    return { ok:true, why:'converged',
             retainedLocalDeltaCount: retained,
             metaMergedWithLocalDelta: mergedWithLocal,
             fullyAdoptedRemote: fullyAdoptedRemote };
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
    /* ★fix713: 容量超過の判定と記録（判定は各 writer 側でも行う） */
    LEGACY_PACKAGE_LIMIT_BYTES: LEGACY_PACKAGE_LIMIT_BYTES,
    legacyPackageBytes: legacyPackageBytes,
    legacyPackageOversize: legacyPackageOversize,
    noteOversizeBlocked: noteOversizeBlocked,
    noteSizeUnmeasurable: noteSizeUnmeasurable,
    noteTransportFailure: noteTransportFailure,
    sha256Hex: sha256Hex,
    HASH_SPEC: HASH_SPEC,
    PACKAGE_SPEC: PACKAGE_SPEC,
    identityKey: identityKey,
    identityKindOf: identityKindOf,
    identityOf: identityOf,
    identityTag: identityTag,
    /* ★fix597: ns の指紋（生の ns は保存しない） */
    identityOfAsync: identityOfAsync,
    identityResolvable: identityResolvable,
    nsFingerprint: nsFingerprint,
    learnNs: learnNs,
    knownNsRaw: knownNsRaw,
    forgetNs: forgetNs,
    storedNsFp: storedNsFp,
    /* ★fix597(GPT裁定D2): 別 identity の pending の隔離領域 */
    quarantineForeign: quarantineForeign,
    foreignPendings: foreignPendings,
    foreignPendingsFor: foreignPendingsFor,
    clearForeign: clearForeign,
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
    supersedeByPullAsync: supersedeByPullAsync,
    /* ★fix599: 決着するまで通常putを止める関門 */
    gateState: gateState,
    openGate: openGate,
    closeGate: closeGate,
    gateAllows: gateAllows,
    /* ★fix599: foreign の復帰規則 */
    restoreForeignFor: restoreForeignFor,
    /* ★fix603: reconcile の入口から呼ぶ復帰口（配線済み＝fix399 reconcileNow） */
    restoreForeignIfIdle: restoreForeignIfIdle,
    foreignRestoreWired: true,
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
    wiredIntoRecovery: true,
    /* ★fix597: GPT裁定 D1〜D3 / ns / pkgTs を反映済み。 */
    verdictApplied: 'fix599'
  };
  /* ---- ★fix597: 旧キーに残っている**生の ns** を、どのページからでも必ず片付ける ----
   * 2026-07-27 の実機で見つけた: fix596 が `v292Dfix596_ns` に ns の生値を保存していた。
   * fix597 で書くのはやめたが、**既に書かれた値は残ったまま**だった。
   * fix399 の knownNs() や home の forceput を通らないページ（ホームを開くだけ等）では
   * いつまでも消えないので、台帳の読み込み時に一度だけ移行する。
   *   生の ns → SHA-256 指紋（v292Dfix597_nsfp）へ移し、生値は削除する。
   * ★指紋の計算は非同期なので、削除は計算が終わってから行う（失敗したら残す＝情報を失わない）。 */
  (function migrateRawNs(){
    try {
      var LEGACY_NS_KEY = 'v292Dfix596_ns';
      var raw = lsg(LEGACY_NS_KEY);
      if (!raw) return;
      learnNs(String(raw)).then(function(fp){
        if (!fp) return;                       /* 指紋が作れなければ生値を消さない */
        try { localStorage.removeItem(LEGACY_NS_KEY); } catch(e){}
        note({ act:'ns-legacy-migrated' });    /* ★ns も指紋もログに出さない */
      }, function(){});
    } catch(e){}
  })();

  try { console.log(TAG, 'loaded', off() ? 'OFF' : 'on'); } catch(e){}
})();
