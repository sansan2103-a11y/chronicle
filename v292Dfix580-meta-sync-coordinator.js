// =====================================================================
// Chronicle v292Dfix580: MetaSyncCoordinator（★影モード＝観測のみ）
// ---------------------------------------------------------------------
// ★なぜ必要か（GPT裁定）
//   「fix399とfix402の両方を、1つの MetaSyncCoordinator へ接続してください。
//     個別に meta 合成・push させません。」
//   ただし、いきなり配線すると**二重発火や競合の実態を知らないまま**同期の中心を差し替えることになる。
//   fix569（削除の影監視）でうまくいったのと同じ手順を踏む: **まず見るだけ**。
//
// ■このfixが観測すること
//   ・誰が /save へ put を投げたか（fix399 / fix402 / それ以外）
//   ・**baseRev を付けているか**（サーバの楽観ロックに参加しているか）
//   ・二重発火（短い時間内に別経路から連続でputが出る）
//   ・fork応答・競合応答の発生
//
// ★実コードを読んで分かっていること（この観測で裏を取る）
//   Worker側(v23b:1501)は `hasBase = body.baseRev !== undefined && !== null` で分岐し、
//   **hasBase が false なら fork判定を一切しない**（無条件上書きの経路へ進む）。
//     fix402 … `callSave({op:'put', baseRev: baseRev(), ...})` → **参加している**
//     fix399 … `callSave({op:'put', pkg: ...})` → **baseRev を送っていない**
//               保護はクライアント側の時刻比較 `serverTs > baseTs()` だけで、
//               サーバのCASには**参加していない**。
//   → 墓標(tombstone)を載せるなら、この経路が無条件上書きのままでは
//     「消したのに復活する」を別の形で残すことになる。
//
// ■このfixが絶対にやらないこと
//   リクエストの改変（body・header・URLを1バイトも変えない）／送信の遅延・中断／
//   localStorage への書き込み（ログもメモリのみ）／例外の握り潰しによる副作用。
//   例外が起きたら**必ず素通し**する。
//
// 冪等: window.__v292Dfix580 / OFF: localStorage.v292Dfix580Off='1'
// 読出: __v292Dfix580.stats() / .events() / .report()
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix580) return;
  var TAG = '[v292Dfix580:meta-sync-coordinator]';

  function off(){ try { return localStorage.getItem('v292Dfix580Off') === '1'; } catch(e){ return false; } }

  var S = {
    installed: false,
    /* ★fix581: 捕まえた fetch が native だったか。
       native でなければ、fix580 より前に誰かがラップしている＝**その経路は観測できない**。
       実測(2026-07-26): window.fetch をラップするファイルは**21本**あり、
       fix580 を後ろに置くと先行5本(fix553/fix247/features.js/fix80/fix84)に迂回された。
       fix569 と同じく **Chronicle の最初のスクリプト群**へ移して native を捕まえる。 */
    capturedNativeFetch: null, loadOrderVerified: null,
    puts: 0, putsWithBaseRev: 0, putsWithoutBaseRev: 0,
    byPath: { fix399: 0, fix402: 0, other: 0 },
    baseRevByPath: { fix399: 0, fix402: 0, other: 0 },
    noBaseRevByPath: { fix399: 0, fix402: 0, other: 0 },
    /* ★二重発火 = 別経路からのputが DOUBLE_MS 以内に連続した件数 */
    doubleFire: 0, doubleFirePairs: [],
    forks: 0, conflicts: 0, errors: 0,
    metaCalls: 0, gets: 0,
    wrapperErrors: 0,
    /* fix582: 共有rev台帳 */
    revPromotions: 0, forkRetries: 0, failClosed: 0
  };
  var EV = [], EV_MAX = 60;
  var DOUBLE_MS = 3000;
  var lastPut = null;

  function now(){ try { return Date.now(); } catch(e){ return 0; } }

  /* 呼び出し元の識別。fix569 と同じく**自分のフレームを必ず取り除く**。
     除かないと全部が fix580 由来に見えて、経路が1件も数えられない。 */
  function pathOf(){
    var s = '';
    try { throw new Error('s'); } catch(e){ s = String(e && e.stack || ''); }
    if (s.indexOf('v292Dfix580') >= 0){
      var out = [], lines = s.split('\n');
      for (var i = 0; i < lines.length; i++){ if (lines[i].indexOf('v292Dfix580') < 0) out.push(lines[i]); }
      s = out.join('\n');
    }
    if (s.indexOf('v292Dfix402') >= 0) return 'fix402';
    if (s.indexOf('v292Dfix399') >= 0) return 'fix399';
    return 'other';
  }

  function note(rec){
    try { EV.push(rec); if (EV.length > EV_MAX) EV.shift(); } catch(e){}
  }

  /* ---- fetch の透過ラップ（観測のみ） ---------------------------------- */
  function install(){
    if (S.installed) return;
    var orig = null;
    try { orig = window.fetch; } catch(e){ return; }
    if (typeof orig !== 'function') return;
    /* ★捕まえた時点で native かどうかを記録する（後から検証できるようにする） */
    try {
      var src = Function.prototype.toString.call(orig);
      S.capturedNativeFetch = src.indexOf('[native code]') >= 0;
      S.loadOrderVerified = S.capturedNativeFetch;
    } catch(e){ S.capturedNativeFetch = null; S.loadOrderVerified = null; }

    var wrapped = function(input, init){
      /* ★観測に失敗しても、必ず元の fetch をそのまま呼ぶ */
      var meta = null;
      try {
        if (!off()) meta = observe(input, init);
      } catch(e){ S.wrapperErrors++; meta = null; }

      var p;
      try { p = orig.apply(this, arguments); }
      catch(e){ throw e; }

      if (!meta) return p;
      try {
        return p.then(function(res){
          try { observeResponse(meta, res); } catch(e){ S.wrapperErrors++; }
          return res;
        }, function(err){
          try { S.errors++; note({ at: now(), kind: 'error', path: meta.path,
                                   why: String(err && err.message || err).slice(0, 60) }); } catch(e){}
          throw err;
        });
      } catch(e){ S.wrapperErrors++; return p; }
    };
    try { wrapped.__v292Dfix580 = true; window.fetch = wrapped; S.installed = true; }
    catch(e){ S.wrapperErrors++; }
  }

  function observe(input, init){
    var url = '';
    try { url = (typeof input === 'string') ? input : (input && input.url) || ''; } catch(e){ url = ''; }
    if (url.indexOf('/save') < 0) return null;

    var body = null;
    try { body = init && init.body; } catch(e){ body = null; }
    if (typeof body !== 'string') return null;      /* 文字列以外は読まない（消費しない） */

    var o = null;
    try { o = JSON.parse(body); } catch(e){ return null; }
    if (!o || !o.op) return null;

    var path = pathOf();
    if (o.op === 'meta'){ S.metaCalls++; return { op: 'meta', path: path }; }
    if (o.op === 'get'){ S.gets++; return { op: 'get', path: path }; }
    if (o.op !== 'put') return { op: String(o.op), path: path };

    /* ★ここが本題: baseRev を付けているか。
       Worker は body.baseRev が undefined/null なら **fork判定を一切しない**（無条件上書き）。 */
    var hasBase = (o.baseRev !== undefined && o.baseRev !== null);
    S.puts++;
    S.byPath[path] = (S.byPath[path] || 0) + 1;
    if (hasBase){ S.putsWithBaseRev++; S.baseRevByPath[path] = (S.baseRevByPath[path] || 0) + 1; }
    else        { S.putsWithoutBaseRev++; S.noBaseRevByPath[path] = (S.noBaseRevByPath[path] || 0) + 1; }

    var t = now();
    /* ★二重発火: 別経路からの put が短時間に連続した */
    if (lastPut && (t - lastPut.at) <= DOUBLE_MS && lastPut.path !== path){
      S.doubleFire++;
      try { S.doubleFirePairs.push({ a: lastPut.path, b: path, gapMs: t - lastPut.at });
            if (S.doubleFirePairs.length > 20) S.doubleFirePairs.shift(); } catch(e){}
    }
    lastPut = { at: t, path: path };

    var rec = { at: t, kind: 'put', path: path, hasBaseRev: hasBase,
                baseRev: hasBase ? (+o.baseRev || 0) : null,
                mid: o.mid || null, bytes: body.length };
    note(rec);
    return rec;
  }

  function observeResponse(meta, res){
    if (!meta || meta.kind !== 'put') return;
    /* ★レスポンスは clone してから読む。元の body を消費すると呼び出し元が壊れる。 */
    var c = null;
    try { c = res.clone(); } catch(e){ return; }
    try {
      c.json().then(function(j){
        try {
          if (!j) return;
          if (j.fork){ S.forks++; note({ at: now(), kind: 'fork', path: meta.path,
                                         rev: j.rev, serverRev: j.server && j.server.rev }); }
          if (j.ok === false){ S.conflicts++; note({ at: now(), kind: 'reject', path: meta.path,
                                                     error: String(j.error || '').slice(0, 60) }); }
          /* ★成功応答のrevだけを正本へ昇格する。fork応答のrevは「サーバの現在値」であって
             自分の書込みが通った証拠ではないので昇格しない（GPT指定）。 */
          if (j.rev != null){
            meta.serverRev = +j.rev || 0;
            if (j.ok === true && !j.fork) promoteRev(j.rev, 'put成功応答 path=' + meta.path);
          }
        } catch(e){ S.wrapperErrors++; }
      }, function(){});
    } catch(e){ S.wrapperErrors++; }
  }

  /* ================= fix582: 共有rev台帳（★ここから制御に入る） ==============
   * ■なぜ必要か（GPT裁定）
   *   「fix399へ baseRev を持たせ、fix399／fix402 が Coordinator の**同じ数値rev**を使う形で
   *     進めてください。正本は Worker の数値rev。v292Dfix399_baseTs は競合制御から外し、
   *     診断値へ降格します。」
   *
   * ■なぜ危険が減るのか（この変更の向き）
   *   変更前: fix399 は baseRev を送らない → Worker は fork判定を**一切しない** → **無条件上書き**。
   *           別端末の新しいセーブを黙って踏み潰しうる。
   *   変更後: baseRev を送る → 不一致なら Worker が fork として**両方保持**（絶対に上書きしない）。
   *   つまり失敗の向きが「データが消える」から「pushが本流に入らない」へ変わる。
   *   後者は気づけるし戻せる。前者は戻せない。**壊れ方が安全側になる**。
   *
   * ■正本の置き場所
   *   localStorage 'v292Dfix580_rev'（端末ローカル・同期対象外）。
   *   ★**成功応答のrevだけを昇格**する。fork応答のrevは「サーバの現在値」であって
   *     自分の書込みが通った証拠ではないので、正本にしない（GPT指定）。
   */
  var REV_KEY = 'v292Dfix580_rev';
  function lsGet(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function lsSet(k, v){ try { localStorage.setItem(k, String(v)); return true; } catch(e){ return false; } }

  function rev(){ var n = +(lsGet(REV_KEY) || 0); return (n === n && n >= 0) ? n : 0; }
  /* 成功応答でのみ昇格。巻き戻さない（古い応答が遅れて届いても下げない）。 */
  function promoteRev(newRev, why){
    var n = +newRev;
    if (!(n === n) || n < 0) return false;
    var cur = rev();
    if (n < cur){ note({ at: now(), kind: 'revIgnored', from: cur, to: n, why: why || '' }); return false; }
    if (n === cur) return true;
    lsSet(REV_KEY, n);
    note({ at: now(), kind: 'revPromoted', from: cur, to: n, why: why || '' });
    S.revPromotions++;
    return true;
  }
  /* fix402 が既に持っている rev を引き継ぐ（初回だけ）。
     引き継がないと、いきなり baseRev=0 で put して**全端末が fork まみれになる**。 */
  function adoptExistingRev(){
    if (lsGet(REV_KEY) != null) return;
    var v = null;
    try { v = localStorage.getItem('v292Dfix402_baseRev'); } catch(e){}
    var n = +(v || 0);
    if (n === n && n > 0){ lsSet(REV_KEY, n); note({ at: now(), kind: 'revAdopted', to: n, from: 'fix402' }); }
    else lsSet(REV_KEY, 0);
  }

  /* ---- 読み出し -------------------------------------------------------- */
  function stats(){
    var o = {};
    Object.keys(S).forEach(function(k){
      o[k] = (typeof S[k] === 'object' && S[k] !== null) ? JSON.parse(JSON.stringify(S[k])) : S[k];
    });
    try { o.isWrapped = (window.fetch && window.fetch.__v292Dfix580 === true); } catch(e){ o.isWrapped = null; }
    o.shadowOnly = true;   /* ★まだ何も制御していないことを明示する */
    return o;
  }
  function events(){ return EV.slice(); }

  /* 人が読む用のまとめ。「baseRevを付けずにputしている経路」を名指しで出す。 */
  function report(){
    var lines = [];
    lines.push('put 合計 ' + S.puts + '（baseRevあり ' + S.putsWithBaseRev +
               ' / なし ' + S.putsWithoutBaseRev + '）');
    ['fix399', 'fix402', 'other'].forEach(function(p){
      if (!S.byPath[p]) return;
      lines.push('  ' + p + ': ' + S.byPath[p] + '件（baseRevあり ' + (S.baseRevByPath[p] || 0) +
                 ' / なし ' + (S.noBaseRevByPath[p] || 0) + '）' +
                 ((S.noBaseRevByPath[p] || 0) > 0 ? '  ★サーバの競合検査に参加していない' : ''));
    });
    lines.push('二重発火 ' + S.doubleFire + '件 / fork ' + S.forks + ' / 拒否 ' + S.conflicts +
               ' / 通信エラー ' + S.errors);
    if (S.wrapperErrors) lines.push('★観測側のエラー ' + S.wrapperErrors + '件（観測値は不完全）');
    if (S.capturedNativeFetch === false)
      lines.push('★★fix580 より前に fetch をラップした経路がある＝その経路の put は観測できていない');
    return lines.join('\n');
  }

  /* ★fetch はページ内の他コードより先に掴みたいが、遅れて入っても観測できないだけで害は無い。 */
  try { install(); } catch(e){ S.wrapperErrors++; }
  try { adoptExistingRev(); } catch(e){ S.wrapperErrors++; }

  window.__v292Dfix580 = {
    __armed: true,
    stats: stats,
    events: events,
    report: report,
    isOff: off,
    /* fix582: 共有rev台帳。fix399/fix402 はここの rev を baseRev として使う */
    rev: rev,
    promoteRev: promoteRev,
    noteForkRetry: function(){ S.forkRetries++; },
    noteFailClosed: function(why){ S.failClosed++; note({ at: now(), kind: 'failClosed', why: String(why||'').slice(0,60) }); },
    /* ★まだ同期を制御していないことを明示する。配線は次段。 */
    coordinating: false
  };
})();
