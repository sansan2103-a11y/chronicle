/* v292Dfix715 — ONE-STORY BACKFILL SENDER (admin / test harness only)
 * ------------------------------------------------------------------
 * 裁定 RULING14 / STEP C0 に対応する実装。
 *
 * ★このファイルは HOME / index の一般 UI からは読み込まない。admin / test harness 専用。
 * ★1回の呼出しで storyId を **1個だけ** 扱う。array / 複数 / loop / queue / batch /
 *   成功後の自動 next は実装しない（存在しない）。
 * ★canonical projection と canonical hash は **fix697 の read-only contract だけ** を使う。
 *   StoryRecord serializer / stable stringify / snippet / turnCount 計算をここへ複製しない。
 * ★transport も fix697 だけを使う。read は fix697.shadowRequest('getstory')、
 *   write は fix716 で追加された専用口 fix697.putStoryOnce のみ。
 *   sender 側に fetch / auth 実装は持たない。
 * ★local story data へ 1 バイトも書かない。
 *   chr6_slot_<id> / chr6_slots_meta / aiInstr / genderMap / snapshot / pending / delete state すべて write 0。
 * ★legacy package / forceput / promotestory / promotedelete を使わない。
 */
(function () {
  'use strict';
  var TAG = '[v292Dfix715]';
  var MIN_WORKER_BUILD = 32;

  /* frozen manifest v1 の BACKFILL_CANDIDATE 15件のみ。
     ここは恒久 migration 機能ではなく、この harness 限定の allowlist。 */
  var PREFLIGHT = {
    smr8p8wfr8b: { raw: '3b97af14b56d', canon: '627506c6158e', turns: 16 },
    smri0s9cno3: { raw: '1c1eac1b87b5', canon: '5cc9a110b5e1', turns: 25 },
    smrisv41ho7: { raw: 'a164a19aee31', canon: '3e3e4cb81eac', turns: 17 },
    smrj0rvnuup: { raw: '0dde39ff412c', canon: '4ae5412dece9', turns: 16 },
    smrrcv25pcq: { raw: '07f1d7ddaf39', canon: '61525c82abc9', turns: 26 },
    smrrcv21iph: { raw: 'baa1ede7b83e', canon: 'dbada45e134d', turns: 21 },
    sms5t2snqso: { raw: '72aacbd3d9c2', canon: 'f1739ac78a69', turns: 51 },
    sms5xyl4jjy: { raw: 'b78ea6069393', canon: '305f3743f32e', turns: 27 },
    sms60fhnthz: { raw: '34a9bce00591', canon: '76e6d4863228', turns: 25 },
    smsb59yji7i: { raw: 'b7d67e712a29', canon: '057cc0459082', turns: 1 },
    smscjyqxn39: { raw: 'f4433559f708', canon: '42bc001a2699', turns: 0 },
    smscma8xu3i: { raw: '820542420642', canon: '016f0c72b95d', turns: 1 },
    smsvot5mnbj: { raw: '245ecb4385f1', canon: '0b7849ac63e9', turns: 32 },
    smsx9j4k61r: { raw: '3c1dca7f8e46', canon: '35c185c33741', turns: 37 },
    smsx9k7aab3: { raw: '6366b20c333c', canon: 'e9b976a7defd', turns: 37 }
  };
  var CANONICAL_FIELDS = ['body', 'deleted', 'id', 'schema', 'sidecar', 'snippet', 'title', 'turnCount'];

  var stats = { calls: 0, refused: 0, puts: 0, parityPass: 0, parityFail: 0, localWrites: 0 };
  var LEDGER = [];
  function note(row) { LEDGER.push(row); while (LEDGER.length > 50) LEDGER.shift(); }
  function refuse(code, detail) {
    stats.refused++;
    var o = { ok: false, wrote: false, code: code, detail: detail || null };
    note(o); return o;
  }

  function f697() { return (typeof window !== 'undefined') ? window.__v292Dfix697 : null; }
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function bodyKeyOf(id) { return (String(id) === 'default') ? 'chr6' : ('chr6_slot_' + String(id)); }

  /* SHA-256 は hash 関数であって serializer ではない。canonical 側は必ず fix697 を通す。 */
  function sha256hex(str) {
    return new Promise(function (res) {
      try {
        var enc = new TextEncoder().encode(String(str));
        window.crypto.subtle.digest('SHA-256', enc).then(function (buf) {
          var a = new Uint8Array(buf), h = '';
          for (var i = 0; i < a.length; i++) { var x = a[i].toString(16); h += (x.length < 2 ? '0' : '') + x; }
          res(h);
        })['catch'](function () { res(null); });
      } catch (e) { res(null); }
    });
  }
  function canonicalHashOf(id) {
    return new Promise(function (res) {
      var F = f697();
      if (!F || typeof F.contentHashOf !== 'function') return res({ hash: null, err: 'NO_FIX697' });
      try { F.contentHashOf(id, function (h, err) { res({ hash: h || null, err: err || null }); }); }
      catch (e) { res({ hash: null, err: 'CONTENT_HASH_THREW' }); }
    });
  }
  function shadow(payload) {
    return new Promise(function (res) {
      var F = f697();
      if (!F || typeof F.shadowRequest !== 'function') return res({ r: null, err: 'NO_FIX697' });
      try { F.shadowRequest(payload, function (r, err) { res({ r: r || null, err: err || null }); }); }
      catch (e) { res({ r: null, err: 'TRANSPORT_THREW' }); }
    });
  }
  /* ★write は fix697 の専用口だけ。generic な shadowRequest には putstory を通さない。 */
  function putOnce(payload) {
    return new Promise(function (res) {
      var F = f697();
      if (!F || typeof F.putStoryOnce !== 'function') return res({ r: null, err: 'NO_PUT_CONTRACT' });
      try { F.putStoryOnce(payload, function (r, err) { res({ r: r || null, err: err || null }); }); }
      catch (e) { res({ r: null, err: 'TRANSPORT_THREW' }); }
    });
  }
  function workerBuildNum(s) {
    var m = /^v(\d+)$/.exec(String(s || ''));
    return m ? +m[1] : -1;
  }

  /* ------------------------------------------------------------------
     sendOne(storyId, opts)
       opts.dryRun === true  … putstory を出さずに事前判定だけを返す（C0 の既定運用）
       opts.confirmWorker    … {workerBuild, sha256} 事前に read-only で確認した値
     ------------------------------------------------------------------ */
  function sendOne(storyId, opts) {
    stats.calls++;
    var argc = arguments.length;
    opts = opts || {};
    var dryRun = (opts.dryRun !== false);   /* 既定は dry-run。production 実行は明示的に false が必要 */

    return (async function () {
      /* --- 入力ガード：1個だけ / allowlist --- */
      if (Object.prototype.toString.call(storyId) === '[object Array]') return refuse('ARRAY_INPUT_REFUSED');
      if (argc > 2) return refuse('TOO_MANY_ARGS');
      if (typeof storyId !== 'string' || !storyId) return refuse('BAD_STORY_ID');
      if (!Object.prototype.hasOwnProperty.call(PREFLIGHT, storyId)) return refuse('NOT_IN_FROZEN_MANIFEST', storyId);
      var pf = PREFLIGHT[storyId];

      var F = f697();
      if (!F) return refuse('NO_FIX697');

      /* --- Worker 版の下限（production 実行時のみ必須） --- */
      if (!dryRun) {
        var cw = opts.confirmWorker || null;
        if (!cw) return refuse('WORKER_BUILD_UNVERIFIED');
        if (workerBuildNum(cw.workerBuild) < MIN_WORKER_BUILD) return refuse('WORKER_BUILD_TOO_OLD', String(cw.workerBuild));
        if (!cw.sha256 || String(cw.sha256).length !== 64) return refuse('WORKER_SHA_UNVERIFIED');
      }

      /* --- 1) fresh getstory は exactly 1 回 --- */
      var g = await shadow({ op: 'getstory', id: storyId });
      if (g.err) return refuse('GETSTORY_TRANSPORT_FAILED', String(g.err));
      var st = g.r && g.r.status;
      if (st === 200) return refuse('SERVER_ROW_ALREADY_EXISTS');
      if (st !== 404) return refuse('GETSTORY_UNEXPECTED_STATUS', String(st));

      /* --- 2) 送信直前に local raw body hash を取り直す --- */
      var raw = lsGet(bodyKeyOf(storyId));
      if (raw == null) return refuse('LOCAL_BODY_MISSING');
      var rawHash = await sha256hex(raw);
      if (!rawHash) return refuse('LOCAL_HASH_FAILED');
      if (rawHash.slice(0, 12) !== pf.raw) return refuse('LOCAL_BODY_CHANGED', rawHash.slice(0, 12));

      /* --- 3) fresh projection を作り直す（fix697 の read-only contract のみ） --- */
      var content = null;
      try { content = F.projectionOf(storyId); } catch (e) { content = null; }
      if (!content) return refuse('NO_LIVE_PROJECTION');
      if (String(content.id) !== storyId) return refuse('PROJECTION_ID_MISMATCH');
      if (content.deleted !== false) return refuse('PROJECTION_DELETED');
      if (!content.title) return refuse('PROJECTION_TITLE_EMPTY');
      if (!content.body) return refuse('PROJECTION_BODY_MISSING');
      var keys = Object.keys(content).sort().join(',');
      if (keys !== CANONICAL_FIELDS.join(',')) return refuse('PROJECTION_FIELD_SET_UNEXPECTED', keys);

      var ch = await canonicalHashOf(storyId);
      if (!ch.hash) return refuse('CANONICAL_HASH_FAILED', String(ch.err));
      if (ch.hash.slice(0, 12) !== pf.canon) return refuse('CANONICAL_PROJECTION_DRIFT', ch.hash.slice(0, 12));

      var payload = {
        id: storyId, baseStoryRev: 0, record: content, shadow: true,
        mid: 'ps:' + storyId + ':0:' + ch.hash,
        clientMeta: { device: (navigator.userAgent || '').slice(0, 60), build: opts.build || 'fix715-harness' }
      };

      if (dryRun) {
        var o = { ok: true, wrote: false, dryRun: true, code: 'READY', id: storyId,
                  rawHashHead: rawHash.slice(0, 12), canonHashHead: ch.hash.slice(0, 12),
                  turnCount: content.turnCount, payloadBytes: JSON.stringify(payload).length,
                  serverStatus: 404, mid: payload.mid };
        note(o); return o;
      }

      /* --- 4) putstory は exactly 1 回。自動 retry しない --- */
      stats.puts++;
      var p = await putOnce(payload);
      if (p.err) {
        var e1 = { ok: false, wrote: 'UNKNOWN', code: 'PUTSTORY_TRANSPORT_FAILED', detail: String(p.err),
                   advice: 'do not resend; run a fresh getstory to determine state' };
        note(e1); return e1;
      }
      var pst = p.r && p.r.status, pj = (p.r && p.r.j) || {};
      if (pst !== 200 || !pj.ok) {
        var e2 = { ok: false, wrote: false, code: 'PUTSTORY_REJECTED', status: pst,
                   errorCode: pj.errorCode || pj.error || null };
        note(e2); return e2;
      }

      /* --- 5) 成功後の fresh getstory も exactly 1 回 --- */
      var g2 = await shadow({ op: 'getstory', id: storyId });
      if (g2.err) { var e3 = { ok: false, code: 'READBACK_TRANSPORT_FAILED', detail: String(g2.err) }; note(e3); return e3; }
      var rj = (g2.r && g2.r.j) || {};
      var rec = rj.record || null;
      var fails = [];
      if (String(rj.id) !== storyId) fails.push('id');
      if (String(rj.authority || '') !== 'shadow') fails.push('authority');
      if (rj.deleted !== false) fails.push('deleted');
      if (+rj.rev !== 1) fails.push('rev');
      if (!rj.serverHash || rj.serverHash !== ch.hash) fails.push('hash');
      if (!rec) fails.push('record');
      else {
        var rk = Object.keys(rec).sort().join(',');
        if (rk !== CANONICAL_FIELDS.join(',')) fails.push('recordFieldSet:' + rk);
        var turns = (rec.body && Object.prototype.toString.call(rec.body.turns) === '[object Array]') ? rec.body.turns : null;
        if (!turns || rec.turnCount !== turns.length) fails.push('turnCountNotBodyDerived');
      }
      if (fails.length) {
        stats.parityFail++;
        var e4 = { ok: false, code: 'BACKFILL_PARITY_FAILED', id: storyId, fails: fails,
                   note: 'no next story, no force overwrite, no local rewrite' };
        note(e4); return e4;
      }
      stats.parityPass++;
      var okO = { ok: true, wrote: true, code: 'BACKFILL_ONE_STORY_OK', id: storyId, rev: +rj.rev,
                  canonHashHead: ch.hash.slice(0, 12), turnCount: rec.turnCount };
      note(okO); return okO;
    })();
  }

  window.__v292Dfix715 = {
    sendOne: sendOne,
    candidates: function () { return Object.keys(PREFLIGHT).slice(); },
    preflight: function (id) { var p = PREFLIGHT[id]; return p ? { raw: p.raw, canon: p.canon, turns: p.turns } : null; },
    stats: function () { return JSON.parse(JSON.stringify(stats)); },
    ledger: function () { return LEDGER.slice(); },
    MIN_WORKER_BUILD: MIN_WORKER_BUILD
  };
  try { console.log(TAG, 'loaded (one-story harness / dry-run default / no local writes)'); } catch (e) {}
})();
