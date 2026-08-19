// =====================================================================
// Chronicle v292Dfix700: STEP3C NONAUTHORITATIVE_MIRROR（非権威ミラー / 読み取り比較面）
// ---------------------------------------------------------------------
// ■これは何か（GPT裁定 STEP3C GO）
//   Worker v29 の story_shadow（server 側の影）と、この document から生成した
//   local StoryRecord projection を **READ して COMPARE するだけ** の面。
//   「第二の保存コピー」ではない。read-only comparison surface である。
//
// ■絶対条件（裁定の写し・このファイルが構造的に守るもの）
//   ・server shadow は絶対に local authority にならない
//   ・server body   → localStorage apply 禁止
//   ・server aiInstr → local apply 禁止
//   ・server title   → local apply 禁止
//   ・S.save 呼出 禁止 / active_slot 変更 禁止 / current pkg 変更 禁止
//   ・collectLS 変更 禁止 / legacy pull 変更 禁止 / fork UI 変更 禁止
//   ・canonical read authority 化 禁止
//   ・mirror 用の新しい localStorage body copy を作らない
//   → 実装上の担保: このファイルは localStorage への **書込 API を一切呼ばない**
//     （setItem / removeItem / clear の出現 0。契約試験 T2 で検証）。
//     使う op は getstory / listshadow の 2 つだけ（putstory / put / forceput / pull は呼ばない）。
//     server から受け取った record を **モジュール変数に保持しない**（メタのみ抽出して破棄）。
//
// ■比較する値（裁定の例示どおり）
//   storyId / serverRev / serverHash / localHash / match / updatedAt
//   （+ 診断用に present / serverDeleted / serverTurnCount / localTurnCount）
//   snippet・body・aiInstr の実内容は保持しない。
//
// ■local 側 hash の出所
//   window.__v292Dfix697.projection() / .canonicalString() を再利用する（規約の二重実装を作らない）。
//   fix697 の On/Off とは独立に projection は読めるため、
//   fix697On が OFF でも比較は成立する（その場合 server 側が古い or 未作成なだけ）。
//
// ■scope
//   compare() は **この document が権限を持つ story 1 本だけ**（fix694 authority）。
//   list() は listshadow のメタ一覧（server 側の rev/hash のみ）。
//   他 story の local body は読まない＝ local hash も出さない。
//
// ■起動
//   自動実行なし。background poll なし。明示呼出のみ（compare / list）。
//   有効 = v292Dfix700On === '1' かつ v292Dfix700Off !== '1'（★既定 OFF = 明示 opt-in）
// 検証口: window.__v292Dfix700 = { status, compare, list, ledger, off, on }
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix700) return;
  var TAG = '[v292Dfix700:nonauthoritative-mirror]';
  var TIMEOUT_MS = 25000;
  var BUILD = 'fix700';

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix700Off') === '1'; }
  function on(){ return !off() && lsg('v292Dfix700On') === '1'; }

  // ---- storyId（fix694 authority のみ・chr6_active_slot 不使用） ----
  function authorityKey(){
    try { var k = window.__chronicleDocumentStoryKey; return (typeof k === 'string' && k) ? k : null; } catch(e){ return null; }
  }
  function storyId(){
    var k = authorityKey();
    if (!k) return null;
    if (k === 'chr6') return 'default';
    if (k.indexOf('chr6_slot_') === 0) return k.slice(10);
    return null;
  }

  // ---- 通信（fix697 と同一規約・独立実装・fire-and-forget ではなく callback 返却） ----
  function proxyUrl(){
    try {
      var u = (lsg('v292ProxyUrl') || '').replace(/\s+/g,'');
      if (u) return u.replace(/\/+$/, '');
      if (window.__v292Dfix247bapi && window.__v292Dfix247bapi.DEFAULT_PROXY_URL) return window.__v292Dfix247bapi.DEFAULT_PROXY_URL;
    } catch(e){}
    return 'https://novel-proxy.sansan2103.workers.dev';
  }
  function authHeaders(){
    var h = { 'Content-Type': 'application/json' };
    try { var g = (window.__chronicleGoogleId && window.__chronicleGoogleId()) || ''; if (g) h['x-google-id'] = g; } catch(e){}
    try { var p = (lsg('v292ProxyPass') || '').replace(/^\s+|\s+$/g,''); if (p) h['x-chronicle-pass'] = p; } catch(e){}
    return h;
  }
  function isLoggedIn(){ var h = authHeaders(); return !!(h['x-google-id'] || h['x-chronicle-pass']); }

  // ---- 記録（メモリのみ・永続キー追加なし・本文を持たない） ----
  var stats = { compares: 0, match: 0, mismatch: 0, absent: 0, netFail: 0, skipped: 0, lists: 0 };
  var LEDGER = [], LEDGER_CAP = 50;
  var lastCompare = null, lastList = null;
  function note(row){ row.t = Date.now(); LEDGER.push(row); while (LEDGER.length > LEDGER_CAP) LEDGER.shift(); }

  function f697(){ var W = window.__v292Dfix697; return (W && typeof W.projection === 'function') ? W : null; }

  function post(payload, cb){
    var ac = null, timer = null;
    try { ac = new AbortController(); timer = setTimeout(function(){ try { ac.abort(); } catch(e){} }, TIMEOUT_MS); } catch(e){}
    var opts = { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) };
    if (ac) opts.signal = ac.signal;
    fetch(proxyUrl() + '/save', opts).then(function(res){
      return res.json().then(function(j){ return { status: res.status, j: j }; },
                            function(){ return { status: res.status, j: null }; });
    }).then(function(r){ if (timer) clearTimeout(timer); cb(null, r); })
    ['catch'](function(e){ if (timer) clearTimeout(timer); cb(e, null); });
  }

  // ---- sha256（fix697 と同一規約） ----
  function sha256hex(str, cb){
    try {
      var enc = new TextEncoder().encode(String(str));
      crypto.subtle.digest('SHA-256', enc).then(function(buf){
        var a = new Uint8Array(buf), h = '';
        for (var i = 0; i < a.length; i++){ var x = a[i].toString(16); h += (x.length < 2 ? '0' : '') + x; }
        cb(h);
      })['catch'](function(){ cb(null); });
    } catch(e){ cb(null); }
  }

  // ---- compare: この document の story だけを read/compare ----
  function compare(cb){
    cb = (typeof cb === 'function') ? cb : function(){};
    if (!on()){ stats.skipped++; return cb({ skipped: 'OFF' }); }
    var id = storyId();
    if (!id){ stats.skipped++; return cb({ skipped: 'NO_AUTHORITY' }); }
    if (!isLoggedIn()){ stats.skipped++; return cb({ skipped: 'NOT_LOGGED_IN', storyId: id }); }
    var W = f697();
    if (!W){ stats.skipped++; return cb({ skipped: 'FIX697_ABSENT', storyId: id }); }
    var content = null;
    try { content = W.projection(); } catch(e){ content = null; }
    if (!content){ stats.skipped++; return cb({ skipped: 'NO_LOCAL_PROJECTION', storyId: id }); }
    var localTurnCount = (typeof content.turnCount === 'number') ? content.turnCount : null;
    var str;
    try { str = W.canonicalString(content); } catch(e){ stats.skipped++; return cb({ skipped: 'CANONICAL_FAIL', storyId: id }); }
    sha256hex(str, function(localHash){
      if (!localHash){ stats.netFail++; return cb({ error: 'LOCAL_HASH_FAIL', storyId: id }); }
      stats.compares++;
      post({ op: 'getstory', id: id }, function(err, r){
        if (err || !r){
          stats.netFail++;
          var rowN = { storyId: id, error: 'NET_FAIL', msg: String((err && err.message) || err).slice(0, 60), localHash: localHash };
          note(rowN); lastCompare = rowN; return cb(rowN);
        }
        var j = r.j || {};
        if (r.status === 404 || (j && j.errorCode === 'not-found')){
          stats.absent++;
          var rowA = { storyId: id, present: false, serverRev: null, serverHash: null, updatedAt: null,
                       serverDeleted: null, serverTurnCount: null, localHash: localHash,
                       localTurnCount: localTurnCount, match: false };
          note(rowA); lastCompare = rowA; return cb(rowA);
        }
        if (r.status !== 200 || !j.ok){
          stats.netFail++;
          var rowE = { storyId: id, error: 'HTTP_' + r.status, errorCode: (j && j.errorCode) || null, localHash: localHash };
          note(rowE); lastCompare = rowE; return cb(rowE);
        }
        /* ★record は保持しない。turnCount のメタだけ読んで捨てる（第二の保存コピーを作らない） */
        var stc = null;
        try { var rec = j.record; if (rec && typeof rec.turnCount === 'number') stc = rec.turnCount; } catch(e){}
        var sh = j.serverHash || null;
        var row = { storyId: id, present: true,
                    serverRev: (typeof j.rev === 'number' ? j.rev : null),
                    serverHash: sh, updatedAt: (typeof j.updatedAt === 'number' ? j.updatedAt : null),
                    serverDeleted: !!j.deleted, serverTurnCount: stc,
                    localHash: localHash, localTurnCount: localTurnCount,
                    match: !!(sh && sh === localHash) };
        if (row.match) stats.match++; else stats.mismatch++;
        note(row); lastCompare = row;
        return cb(row);
      });
    });
  }

  // ---- list: server 側 shadow のメタ一覧（local は読まない・snippet は保持しない） ----
  function list(cb){
    cb = (typeof cb === 'function') ? cb : function(){};
    if (!on()){ stats.skipped++; return cb({ skipped: 'OFF' }); }
    if (!isLoggedIn()){ stats.skipped++; return cb({ skipped: 'NOT_LOGGED_IN' }); }
    post({ op: 'listshadow' }, function(err, r){
      if (err || !r || r.status !== 200 || !r.j || !r.j.ok){
        stats.netFail++;
        var e = { error: 'LIST_FAIL', status: (r && r.status) || null };
        note(e); return cb(e);
      }
      var src = (r.j.stories && r.j.stories.length) ? r.j.stories : [];
      var rows = [];
      for (var i = 0; i < src.length; i++){
        var x = src[i] || {};
        rows.push({ id: x.id, serverRev: +x.rev || 0, serverHash: x.serverHash || null,
                    updatedAt: +x.updatedAt || 0, deleted: !!x.deleted,
                    turnCount: +x.turnCount || 0, titleLen: String(x.title || '').length });
      }
      stats.lists++;
      lastList = { n: rows.length, at: Date.now(), rows: rows };
      note({ kind: 'LIST', n: rows.length });
      return cb({ ok: true, n: rows.length, rows: rows });
    });
  }

  window.__v292Dfix700 = {
    __armed: true,
    off: off, on: on,
    status: function(){
      return { on: on(), off: off(), loggedIn: isLoggedIn(), storyId: storyId(),
               authorityKey: authorityKey(), fix697Present: !!f697(), build: BUILD,
               lastCompare: lastCompare, lastListN: (lastList ? lastList.n : null),
               stats: JSON.parse(JSON.stringify(stats)) };
    },
    compare: compare,
    list: list,
    lastList: function(){ return lastList; },
    ledger: function(){ return LEDGER.slice(); }
  };
  try { console.log(TAG, 'loaded (read-only comparison surface / default OFF / on=v292Dfix700On)'); } catch(e){}
})();
